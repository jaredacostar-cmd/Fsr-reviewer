/* Servicing permits: which building permits show a site has applied for water / wastewater
 * servicing, and which show it is privately serviced (septic). Pure, shared by the weekly
 * build (scripts/build-snapshot.js, scripts/build-dc-gate.js) and tests/servicing-permits.test.js.
 *
 * Each city files site servicing under its own permit type:
 *   Mississauga  APP_DETAIL = SITE SERVICING / DRAIN ONLY        (issued permits only; APPLICATION_DATE kept)
 *   Brampton     SUBDESC    = Site Service Residential / Com/Ind/Inst   (applied permits too; no description)
 *   Caledon      WORKDESC   = Site Services                       (applied permits too; FOLDERDESCRIPTION)
 * Private sewage: Mississauga PRIVATE SEWAGE SYSTEM, Brampton "Class 4 (Main)", Caledon WORKDESC Septic,
 * and any new-dwelling permit "with septic".
 *
 * These are local Building Code permits for the private-side pipes. They show servicing is underway;
 * they are not the Region's own servicing application. Storm is a local service, so a storm-only
 * permit is not Regional servicing.
 */
(function (root) {
  'use strict';

  // Raw permit-type fields, by city. Read from the record's props (the normalised type / description
  // carry only one of them).
  const TYPE_FIELDS = ['APP_DETAIL', 'SUBDESC', 'WORKDESC', 'SCOPE', 'FOLDERTYPE'];
  const DESC_FIELDS = ['DESCRIPTION', 'FOLDERDESCRIPTION', 'WORKDESC', 'SUBDESC'];

  const SITE_TYPE = /\bsite[ -]?servic(?:e|es|ing)\b|\bdrain only\b/i;
  const SEPTIC_TYPE = /private sewage|\bseptic\b|^class 4\b/i;
  const SEPTIC_TEXT = /\bseptic\b|private sewage|\bclass 4 (?:sewage|system)\b/i;
  // "decommission existing septic … new sanitary connection" is a move ON to municipal sewer.
  const SEPTIC_OFF = /decommission|abandon|conver(?:t|sion)|remov(?:e|al)|disconnect/i;

  const WATER = /\bwater\s*(?:main|service|line|meter|connection)s?\b|\bwatermains?\b|domestic\s*(?:cold\s*)?water|\bfire\s*(?:line|service|main)s?\b|\bwater\b/i;
  const SANITARY = /\bsanitar(?:y|ies)\b/i;
  // "sewer" / "sewage" not qualified as storm.
  const SEWER = /(?<!storm\s)(?<!storm\s\w+\s)\b(?:sewers?|sewage)\b/i;
  const STORM = /\bstorm\b|\bstormwater\b|\bswm\b|catch\s*basin/i;

  // Work on an existing building that adds no building (a replacement main, a fire line).
  const EXISTING = /\bexist(?:ing|\.)?\b|\bex\.?\s|\breplace(?:ment)?\b|\brepair\b/i;
  const NEW_BUILDING = /\bnew\s+(?:\(\d+\)\s*)?(?:\d+\s*)?(?:storey|story|building|bldg|dwelling|house|home|warehouse|plant)|\bproposed\s+(?:\(\d+\)\s*)?(?:building|bldg|dwelling|\d)/i;

  const str = v => (v == null ? '' : String(v)).trim();
  const join = (p, fields) => fields.map(f => str(p[f])).filter(Boolean).join(' | ');

  /** Which pipes a description names. */
  function servicesIn(text) {
    const t = str(text);
    const septic = SEPTIC_TEXT.test(t) && !SEPTIC_OFF.test(t);
    return {
      water: WATER.test(t.replace(/storm\s*water/ig, '')),
      wastewater: SANITARY.test(t) || (!septic && SEWER.test(t)),
      storm: STORM.test(t),
    };
  }

  /**
   * Classify one normalised permit record.
   * @returns {null | {kind:'site'|'septic', water:boolean, wastewater:boolean, storm:boolean,
   *   existing:boolean, regional:boolean, unspecified:boolean}}
   *   regional: a site permit that is not storm-only (water, wastewater, or not stated).
   */
  function classify(rec) {
    if (!rec || rec.kind !== 'permit') return null;
    const p = rec.props || {};
    const typeText = [join(p, TYPE_FIELDS), str(rec.type), str(rec.scope)].filter(Boolean).join(' | ');
    const descText = [join(p, DESC_FIELDS), str(rec.description)].filter(Boolean).join(' | ');
    const all = `${typeText} | ${descText}`;

    let kind = null;
    const typeVals = TYPE_FIELDS.map(f => str(p[f])).concat([str(rec.type), str(rec.scope)]).filter(Boolean);
    // A typed septic permit, or a new home "with septic" (Caledon), is private sewage.
    if (typeVals.some(v => SEPTIC_TYPE.test(v)) && !SEPTIC_OFF.test(descText)) kind = 'septic';
    // (the description fields leave props once read, js/privacy.js safeProps: Caledon's WORKDESC
    // "Site Services" survives only as the start of the description)
    else if (SITE_TYPE.test(typeText) || SITE_TYPE.test(descText) || /^DRAIN\b/i.test(str(rec.ref))) kind = 'site';
    else if (SEPTIC_TEXT.test(descText) && !SEPTIC_OFF.test(descText)) kind = 'septic';
    if (!kind) return null;

    // The description names the pipes; the type words ("Site Service Residential") name none.
    const s = servicesIn(descText.replace(SITE_TYPE, ''));
    const unspecified = !s.water && !s.wastewater && !s.storm;
    // A septic-to-sewer conversion serves a building already there.
    const existing = (EXISTING.test(all) || (/septic/i.test(descText) && SEPTIC_OFF.test(descText))) && !NEW_BUILDING.test(all);
    return {
      kind,
      water: s.water,
      wastewater: s.wastewater,
      storm: s.storm,
      existing,
      unspecified,
      regional: kind === 'site' && (s.water || s.wastewater || unspecified),
    };
  }

  /** Earliest application date, else the issue date (ISO day), from a record's events. */
  function datesOf(rec) {
    const day = d => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);
    const ev = (rec.events || []).slice().sort((a, b) => a.date - b.date);
    const applied = ev.find(e => e.phase === 'inception');
    const issued = ev.find(e => e.phase === 'permit');
    return {
      applied: applied ? day(applied.date) : issued ? day(issued.date) : null,
      issued: issued ? day(issued.date) : null,
      // Mississauga publishes issued permits only: its "applied" date is known only once issued.
      appliedFromIssue: !applied && !!issued,
    };
  }

  // Compact flags: w water, s sanitary (wastewater), t storm, u unspecified, x existing building.
  function flagsOf(c) {
    return (c.water ? 'w' : '') + (c.wastewater ? 's' : '') + (c.storm ? 't' : '') + (c.unspecified ? 'u' : '') + (c.existing ? 'x' : '');
  }
  function parseFlags(f) {
    const s = str(f);
    const water = s.includes('w'), wastewater = s.includes('s'), storm = s.includes('t'), unspecified = s.includes('u');
    return { water, wastewater, storm, unspecified, existing: s.includes('x') };
  }

  /**
   * One compact row for data/servicing-permits.json. `scrub` cleans the description (js/privacy.js).
   * Row: [municipality, ref, kind, flags, status, applied, issued, lat, lng, address, description]
   */
  function toRow(rec, c, scrub = s => s) {
    const d = datesOf(rec);
    const desc = scrub(str(join(rec.props || {}, ['DESCRIPTION', 'FOLDERDESCRIPTION']) || rec.description), rec);
    return [
      rec.municipality, str(rec.ref), c.kind, flagsOf(c),
      rec.phase === 'cancelled' ? 'cancelled' : (d.issued ? 'issued' : 'applied'),
      d.applied, d.issued,
      +(+rec.lat).toFixed(6), +(+rec.lng).toFixed(6),
      str(rec.address), desc.length > 140 ? desc.slice(0, 140) + '…' : desc,
    ];
  }
  const COLUMNS = ['municipality', 'ref', 'kind', 'flags', 'status', 'applied', 'issued', 'lat', 'lng', 'address', 'description'];
  function fromRow(row) {
    const o = {};
    COLUMNS.forEach((k, i) => { o[k] = row[i]; });
    if (row.length > COLUMNS.length) o.source = row[COLUMNS.length];
    const f = parseFlags(o.flags);
    Object.assign(o, f);
    o.regional = o.kind === 'site' && (f.water || f.wastewater || f.unspecified);
    return o;
  }

  const api = { classify, servicesIn, datesOf, flagsOf, parseFlags, toRow, fromRow, COLUMNS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelServicingPermits = api;
})(typeof window !== 'undefined' ? window : globalThis);
