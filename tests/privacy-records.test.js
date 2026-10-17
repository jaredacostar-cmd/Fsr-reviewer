'use strict';
// Live records (js/phases.js normalizeRecord) and the record tables (js/dev-detail.js, js/devtab.js
// recordRows): no builder, contractor, owner, planner, contact or note field is kept or listed, and
// the description is scrubbed only once every count is read from it. Synthetic records only.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/phases.js');
const PV = require('../js/privacy.js');

const F = s => s.split(', ').map(x => { const [name, t] = x.split(':'); return { name, type: 'esriFieldType' + t }; });
const pt = { type: 'Point', coordinates: [-79.7, 43.7] };
const rec = (fields, props, src) => P.normalizeRecord({ type: 'Feature', id: 1, geometry: pt, properties: props }, P.detectFields(fields), src);
// The Brampton building-permit layer's fields (tests/real-sources.test.js), with made-up values.
const fields = F('OBJECTID:OID, GIS_ID:Double, ADDRESS:String, FOLDERRSN:Double, PERMITNUMBER:String, SUBDESC:String, WORKDESC:String, ISSUEDATE:Date, INDATE:Date, STATUSDESC:String, PROCESSDATE:Date, BUILDER:String, CONTRACTOR:String, EXPIRYDATE:Date, GFA:String, SECOND_UNIT:String, BEDROOMS:String, STOREYS:String, DWELLINGS:String');
const src = { id: 'bp', municipality: 'Brampton', kind: 'permit' };
const props = { OBJECTID: 11, PERMITNUMBER: 'BP9', STATUSDESC: 'Issued', SUBDESC: 'Single Detached Dwelling', ADDRESS: '1 EXAMPLE ST',
  WORKDESC: 'New single detached dwelling. Owner email: jane.doe@example.com', DWELLINGS: '1', BUILDER: 'Doe Homes', CONTRACTOR: 'Roe Contracting Ltd', ISSUEDATE: Date.UTC(2025, 0, 2) };

test('a live record keeps no people field and no contact, and counts as it did', () => {
  const r = rec(fields, props, src);
  assert.equal(r.units, 1);
  assert.equal(r.newBuild, true);
  assert.equal(r.description, 'New single detached dwelling.');
  for (const k of ['BUILDER', 'CONTRACTOR', 'WORKDESC']) assert.ok(!(k in r.props), k);
  assert.equal(r.props.OBJECTID, 11, 'the object id stays (source links)');
  assert.equal(r.props.PERMITNUMBER, 'BP9');
  // The same record with no private data gives the same readings.
  const plain = rec(fields, { ...props, WORKDESC: 'New single detached dwelling.', BUILDER: '', CONTRACTOR: '' }, src);
  for (const k of ['units', 'newBuild', 'phase', 'unitsFromText', 'type']) assert.deepEqual(r[k], plain[k], k);
});

function loadDevDetail() {
  global.window = globalThis;   // the module reads window.PeelBrief at load
  global.PeelUtil = require('../js/util.js');
  global.PeelPhases = P;
  global.PeelPrivacy = PV;
  delete require.cache[require.resolve('../js/dev-detail.js')];
  return require('../js/dev-detail.js');
}

test('the record table lists no people, contact or note field', () => {
  const DD = loadDevDetail();
  const r = { ref: 'BP9', events: [], props: { OBJECTID: 11, PERMITNUMBER: 'BP9', BUILDER: 'Doe Homes', CONTRACTOR: 'Roe Ltd', OWNER_NAME: 'Jane Doe', APPLICANT: 'John Roe', AGENT: 'x', PLANNER: 'Jane Doe', ARCHITECT: 'x', CONSULTANT: 'x', ENGINEER: 'x', CONTACT_PHONE: '555-555-0100', EMAIL: 'j@example.com', FAX: '555-555-0101', NOTES: 'called owner', COMMENTS: 'x', REMARKS: 'x', STREET_NAME: 'EXAMPLE ST', STATUSDESC: 'Issued' } };
  const html = DD.recordRows(r);
  for (const k of ['BUILDER', 'CONTRACTOR', 'OWNER_NAME', 'APPLICANT', 'AGENT', 'PLANNER', 'ARCHITECT', 'CONSULTANT', 'ENGINEER', 'CONTACT_PHONE', 'EMAIL', 'FAX', 'NOTES', 'COMMENTS', 'REMARKS']) assert.ok(!html.includes(`<td>${k}</td>`), k);
  assert.doesNotMatch(html, /Doe|Roe|555-|example\.com|called owner/);
  for (const k of ['OBJECTID', 'PERMITNUMBER', 'STREET_NAME', 'STATUSDESC']) assert.ok(html.includes(`<td>${k}</td>`), k);
  // Without js/privacy.js loaded, the table still hides them (its own copy of the pattern).
  delete global.PeelPrivacy;
  const DD2 = loadDevDetail();
  assert.doesNotMatch(DD2.recordRows(r), /BUILDER|CONTRACTOR|OWNER_NAME|PLANNER|EMAIL|NOTES/);
  delete global.PeelUtil; delete global.PeelPhases; delete global.window;
});

test('the developments tab table uses the same filter', () => {
  const s = fs.readFileSync(path.join(__dirname, '..', 'js', 'devtab.js'), 'utf8');
  assert.match(s, /function recordRows\(r\) \{\n[^\n]*\n[^\n]*\n\s+\? Object\.entries\(props\)\.filter\(\(\[k, v\]\) => v != null && v !== '' && !\/\^\(shape\|globalid\)\/i\.test\(k\) && !privateField\(k\)\)/);
  assert.match(s, /const privateField = k => \(root\.PeelPrivacy \? root\.PeelPrivacy\.privateKey\(k\) : PRIVATE_FIELD\.test\(k\)\);/);
});

test('the guard copies of wording tests match the modules they come from', () => {
  const src = f => fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8');
  const pv = src('privacy.js');
  const pick = (s, name) => (new RegExp(`const ${name} = (\\/.+\\/[gimsuy]*);`).exec(s) || [])[1];
  assert.equal(pick(pv, 'GROWTH_TEXT'), pick(src('app.js'), 'GROWTH_TEXT'));
  assert.equal(pick(pv, 'NOT_GROWTH'), pick(src('app.js'), 'NOT_GROWTH'));
  assert.equal(pick(pv, 'RESUB'), pick(src('tree.js'), 'RESUB'));
  assert.equal(pick(pv, 'PHASE_ID'), pick(src('tree.js'), 'PHASE_ID'));
  assert.equal(pick(pv, 'REVISES_T'), pick(src('tree.js'), 'REVISES'));
  assert.equal(pick(pv, 'REVISES_P'), pick(src('phases.js'), 'REVISES'));
});
