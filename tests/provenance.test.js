'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/provenance.js');

// A live-style record from js/phases.js normalizeRecord (~line 425).
const liveRec = (extra = {}) => ({
  uid: 'bra-opa-zba-sub:12345',
  sourceId: 'bra-opa-zba-sub',
  sourceName: 'Brampton – official plan / zoning amendments & subdivisions',
  municipality: 'Brampton',
  kind: 'application',
  ref: 'OZS-2024-0001',
  props: { OBJECTID: 12345, FILE_NO: 'OZS-2024-0001' },
  ...extra,
});
// A snapshot-style record (data/snapshot.json via applySnapshot, app.js ~9130): no props.
const snapRec = (extra = {}) => ({
  uid: 'cal-permits/0:1969',
  sourceId: 'cal-permits/0',
  sourceName: 'Caledon – building permits',
  municipality: 'Caledon',
  kind: 'permit',
  ref: '81-0290',
  ...extra,
});

test('portalFor: maps source names to their municipality portals', () => {
  assert.equal(P.portalFor('Mississauga – development applications (latest monthly)'), 'City of Mississauga Open Data');
  assert.equal(P.portalFor('Brampton – official plan / zoning amendments & subdivisions'), 'City of Brampton Open Data');
  assert.equal(P.portalFor('Caledon – development applications'), 'Town of Caledon Open Data');
  assert.equal(P.portalFor('Peel Region – water facilities'), 'Region of Peel Open Data');
});

test('portalFor: unknown names fall back unchanged; null-safe', () => {
  assert.equal(P.portalFor('Some Custom Layer'), 'Some Custom Layer');
  assert.equal(P.portalFor('Missisauga – typo'), 'Missisauga – typo');
  assert.equal(P.portalFor(null), null);
  assert.equal(P.portalFor(undefined), undefined);
});

test('portalFor: accepts an extended portal table', () => {
  const portals = { ...P.PORTALS, Vaughan: { portal: 'City of Vaughan Open Data' } };
  assert.equal(P.portalFor('Vaughan – secondary plans', portals), 'City of Vaughan Open Data');
});

test('recordSourceUrl: layer URL (…/9) links the feature directly', () => {
  const url = P.recordSourceUrl(liveRec(), 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/9');
  assert.equal(url, 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Planning_Land_Use_Development/FeatureServer/9/12345?f=pjson');
});

test('recordSourceUrl: a FeatureServer root takes the layer from the sourceId (Mississauga)', () => {
  // A root-level query needs layerDefs: objectIds alone is an error, so the layer is named.
  const root = 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/DevApps_September2026_WFL1/FeatureServer';
  assert.equal(P.recordSourceUrl(snapRec({ uid: 'mis-devapps/6:22', sourceId: 'mis-devapps/6' }), root), `${root}/6/22?f=pjson`);
  assert.equal(P.recordSourceUrl(snapRec({ uid: 'mis-devapps/6:22', sourceId: 'mis-devapps/6' }), `${root}/`), `${root}/6/22?f=pjson`);
});

test('recordSourceUrl: a root with no layer on the record queries every field', () => {
  const url = P.recordSourceUrl(liveRec(), 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/DevApps_September2026_WFL1/FeatureServer');
  assert.equal(url, 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/DevApps_September2026_WFL1/FeatureServer/query?objectIds=12345&outFields=*&f=pjson');
});

test('recordSourceUrl: format html is the page a person reads; the app links it, exports keep pjson', () => {
  const layer = 'https://maps1.brampton.ca/arcgis/rest/services/BuildingPermit/Building_Permits/MapServer/0';
  assert.equal(P.recordSourceUrl(snapRec({ uid: 'bra-permits/0:77', sourceId: 'bra-permits/0' }), layer, { format: 'html' }), `${layer}/77?f=html`);
  const fs = require('fs'), path = require('path'), src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  for (const f of ['js/dev-detail.js', 'js/devtab.js', 'js/aerial-check.js']) assert.match(src(f), /recordSourceUrl\([^)]*\)?[^;]*\{ format: 'html' \}/, f);
  assert.doesNotMatch(src('js/exports.js'), /format: 'html'/);
});

test('recordSourceUrl: snapshot records parse the object id from uid', () => {
  const url = P.recordSourceUrl(snapRec(), 'https://utility.arcgis.com/usrsvcs/servers/51b993780db441b083808ed0bd59a554/rest/services/AGOL/MiscLayers/MapServer/0');
  assert.equal(url, 'https://utility.arcgis.com/usrsvcs/servers/51b993780db441b083808ed0bd59a554/rest/services/AGOL/MiscLayers/MapServer/0/1969?f=pjson');
});

test('recordSourceUrl: null when the object id or layer URL is missing', () => {
  assert.equal(P.recordSourceUrl(liveRec(), null), null);
  assert.equal(P.recordSourceUrl(null, 'https://x/FeatureServer/0'), null);
  // uid's random-token fallback: no object id to link.
  assert.equal(P.recordSourceUrl(snapRec({ uid: 'cal-permits/0:abc123xyz' }), 'https://x/MapServer/0'), null);
  assert.equal(P.recordSourceUrl({ uid: 'x:9' }, 'https://x/MapServer/0'), null); // no sourceId
});

test('applicationPageUrl: no stable pattern yet, returns null', () => {
  assert.equal(P.applicationPageUrl(liveRec()), null);
  assert.equal(P.applicationPageUrl(null), null);
});

test('retrievedAt: record-level timestamp wins over the snapshot date', () => {
  const rec = liveRec({ retrievedAt: '2026-10-14T08:00:00Z' });
  assert.equal(P.retrievedAt(rec, { generatedAt: '2026-10-12T10:34:39.519Z' }), '2026-10-14');
});

test('retrievedAt: falls back to the snapshot build date', () => {
  assert.equal(P.retrievedAt(liveRec(), { generatedAt: '2026-10-12T10:34:39.519Z' }), '2026-10-12');
});

test('retrievedAt: null when nothing is known; tolerant of Date objects', () => {
  assert.equal(P.retrievedAt(liveRec(), null), null);
  assert.equal(P.retrievedAt(liveRec(), {}), null);
  assert.equal(P.retrievedAt(liveRec({ retrievedAt: new Date('2026-10-14T08:00:00Z') }), null), '2026-10-14');
  assert.equal(P.retrievedAt(null, { generatedAt: '2026-10-13' }), '2026-10-13');
});
