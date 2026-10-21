/*
 * Per-record provenance helpers (Phase 0: trust and transparency).
 *
 * Pure functions, no DOM access, no dependencies: safe to require under
 * `node --test` and to load in the browser as a plain <script>.
 *
 * Grounding (see the module's doc comments for detail):
 * - Portal names mirror the `municipality` values used in js/config.js
 *   (`services[].municipality` and `hubs[].municipality`), and the source
 *   names built from them (`${municipality} – ${title}` in js/config.js,
 *   js/arcgis.js `discoverHub`, and the add-source form in js/app.js ~8626).
 * - Records come from js/phases.js `normalizeRecord` (~line 425): they carry
 *   `uid` (`${src.id}:${feature.id or OBJECTID/objectid/FID}`),
 *   `sourceId` (the config `services[].id`), `sourceName`, `municipality`,
 *   and (live records only) `props` with the raw ArcGIS attributes.
 *   Snapshot records (data/snapshot.json, re-attached in js/app.js
 *   `applySnapshot` ~line 9130) keep `uid`/`sourceId`/`sourceName` but not
 *   `props`, so the object ID is parsed from `uid`.
 * - The record's layer URL is NOT stored on records: the caller resolves it
 *   from `state.sources` (live config) or `snapshot.sources[]` by matching
 *   `record.sourceId` (root id: `sourceId.split('/')[0]`, see
 *   scripts/build-snapshot.js `rootId`).
 * - `retrievedAt` precedence: a record-level `retrievedAt` (stamped by a
 *   "Refresh live" pull) beats the snapshot build date
 *   (`snapshot.generatedAt`, e.g. data/snapshot.json).
 */
(function (root) {
'use strict';

// Human names of the municipalities' open-data portals, keyed by the exact
// `municipality` values used in js/config.js (`services[].municipality` and
// `hubs[].municipality`). The `host` values come from `hubs` in the same file.
// Extend (or pass a replacement table to portalFor) when new municipalities
// or renamed portals are added; callers in app.js can rebuild this table
// from PEEL_CONFIG at runtime.
const PORTALS = {
  Mississauga: { portal: 'City of Mississauga Open Data', host: 'data.mississauga.ca' },
  Brampton: { portal: 'City of Brampton Open Data', host: 'geohub.brampton.ca' },
  Caledon: { portal: 'Town of Caledon Open Data', host: 'data-caledon.opendata.arcgis.com' },
  'Peel Region': { portal: 'Region of Peel Open Data', host: 'data.peelregion.ca' },
};

// En dashes are what js/config.js and js/arcgis.js use (`${municipality} – ${title}`);
const DASHES = [' – ', ' — ', ' - '];

/**
 * Human portal name for a source layer name, e.g.
 * 'Mississauga – development applications (latest monthly)' ->
 * 'City of Mississauga Open Data'.
 * @param {string} sourceName the record's `sourceName` (js/phases.js: `sourceName: src.name`)
 * @param {object} [portals] municipality -> {portal, host}; defaults to PORTALS
 * @returns {string} the portal name, or `sourceName` unchanged when unknown
 */
function portalFor(sourceName, portals) {
  if (sourceName == null) return sourceName;
  const table = portals || PORTALS;
  const name = String(sourceName);
  for (const muni of Object.keys(table)) {
    if (name === muni) return table[muni].portal;
    for (const d of DASHES) {
      if (name.startsWith(muni + d)) return table[muni].portal;
    }
  }
  return sourceName;
}

// Numeric ArcGIS object IDs are the only ids we can link to directly.
// `normalizeRecord` (js/phases.js ~425) builds uid from `feature.id` first,
// falling back to OBJECTID/objectid/FID and then a random token.
function objectIdOf(record) {
  if (!record || typeof record !== 'object') return null;
  const direct = [record.objectId, record.OBJECTID, record.objectid,
    record.props && record.props.OBJECTID, record.props && record.props.objectid,
    record.props && record.props.FID];
  for (const v of direct) if (isObjId(v)) return String(v).trim();
  // Snapshot records keep uid but not props: uid is `${sourceId}:${objectId}`.
  if (typeof record.uid === 'string' && typeof record.sourceId === 'string') {
    const prefix = `${record.sourceId}:`;
    if (record.uid.startsWith(prefix)) {
      const tail = record.uid.slice(prefix.length);
      if (isObjId(tail)) return tail.trim();
    }
  }
  return null;
}
function isObjId(v) { return (typeof v === 'number' || typeof v === 'string') && /^-?\d+$/.test(String(v).trim()); }

/**
 * Link to the record inside its ArcGIS layer.
 * @param {object} record a normalised record (js/phases.js ~425)
 * @param {string} serviceUrl the record's layer URL (resolved by the caller
 *   from state.sources / snapshot.sources[] by record.sourceId; see above)
 * @param {object} [opts] `{ format: 'html' }` for the ArcGIS page a person
 *   reads (every field as a table, in the browser); the default `pjson` is
 *   the machine-readable record the exports carry
 * @returns {string|null} the URL, or null when the object ID or the layer
 *   URL is not available on the record
 *
 * A FeatureServer / MapServer root (Mississauga's services) is not a layer:
 * a query on the root needs layerDefs and returns an error for objectIds
 * alone, so the layer index is taken from the record's sourceId
 * (`mis-devapps/6` -> layer 6). The feature page (`…/6/123`) shows every
 * field; a root with no layer index on the record falls back to a query
 * with every field (`outFields=*`).
 *
 * GAP: records do not store their layer URL, so the caller must join on
 * `record.sourceId` (root id, `sourceId.split('/')[0]`). Records also have no
 * dedicated object-id field; it is read from props.OBJECTID (live records)
 * or parsed out of `record.uid` (snapshot records). uid's random-hex
 * fallback yields no link.
 */
function recordSourceUrl(record, serviceUrl, opts) {
  if (!record || serviceUrl == null) return null;
  const id = objectIdOf(record);
  if (id == null) return null;
  let base = String(serviceUrl).replace(/\/+$/, '');
  if (!base) return null;
  const f = opts && opts.format === 'html' ? 'html' : 'pjson';
  // A service root: the layer from the record's sourceId (`mis-devapps/6`).
  const layer = /\/(FeatureServer|MapServer)$/i.test(base) && typeof record.sourceId === 'string' ? (/\/(\d+)$/.exec(record.sourceId) || [])[1] : null;
  if (layer != null) base = `${base}/${layer}`;
  // Layer endpoints (…/FeatureServer/9, …/MapServer/0) address the feature directly.
  if (/\/\d+$/.test(base)) return `${base}/${id}?f=${f}`;
  return `${base}/query?objectIds=${encodeURIComponent(id)}&outFields=*&f=${f}`;
}

/**
 * The municipality's public application page for the record, where a stable
 * URL pattern exists (e.g. searching by file number).
 * @returns {null} always, at present
 *
 * GAP: no stable pattern found. The codebase (js/app.js, js/config.js,
 * index.html) links only to ArcGIS services, council agendas and reports;
 * no municipality application-portal URL template exists in config, so this
 * returns null until a verified per-municipality pattern is added here.
 */
function applicationPageUrl(/* record */) {
  return null;
}

function dateOnly(v) {
  if (v == null) return null;
  const s = v instanceof Date && !isNaN(v) ? v.toISOString() : String(v);
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : null;
}

/**
 * When the record's source data was pulled.
 * Precedence: a record-level `retrievedAt` (stamped at a live pull), else
 * the snapshot build date.
 * @param {object} record a normalised record
 * @param {object} snapshotMeta e.g. `{ generatedAt: snap.generatedAt }`
 *   (data/snapshot.json has `generatedAt: "2026-10-12T10:34:39.519Z"`;
 *   js/app.js keeps it on `state.snapshot.generatedAt`, ~line 9128)
 * @returns {string|null} an ISO date ('YYYY-MM-DD'), or null when unknown
 *
 * GAP: records carry no per-record retrieved timestamp today (neither live
 * nor snapshot records), so the snapshot build date is the source of truth
 * until "Refresh live" stamps one per record / per source.
 */
function retrievedAt(record, snapshotMeta) {
  const fromRecord = record && (record.retrievedAt != null ? record.retrievedAt
    : record.retrieved != null ? record.retrieved : null);
  if (fromRecord != null) return dateOnly(fromRecord);
  const meta = snapshotMeta && (snapshotMeta.generatedAt != null ? snapshotMeta.generatedAt
    : snapshotMeta.retrievedAt != null ? snapshotMeta.retrievedAt : null);
  return dateOnly(meta);
}

const api = { PORTALS, portalFor, recordSourceUrl, applicationPageUrl, retrievedAt };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelProvenance = api;
})(typeof window !== 'undefined' ? window : globalThis);
