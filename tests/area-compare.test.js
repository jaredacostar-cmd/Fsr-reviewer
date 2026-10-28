'use strict';
// The offline area comparison (scripts/compare-areas.js, docs/ledger/area-compare.md): a sheet of
// units per area (e.g. FSR units behind a Region map) against the ledger rows in the same areas.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../scripts/compare-areas.js');

const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const AREAS = [{ id: 'sp:caledon:a', name: 'A', rings: sq(-79.9, 43.8, -79.8, 43.9) }, { id: 'sp:caledon:b', name: 'B', rings: sq(-79.7, 43.8, -79.6, 43.9) }];
const row = (id, lon, lat, left, extra = {}) => ({ id, name: `Site ${id}`, municipality: 'Caledon', lat, lon, stage: 'review', left, sp: [],
  units: { committed: 0, approved: 0, review: left, early: 0 }, expectedYear: { likely: 2030 }, confidence: { tier: 'D' }, sources: ['21T-1'], ...extra });

test('parseCSV: quotes, doubled quotes, comment lines and a BOM', () => {
  const s = C.parseCSV('﻿# a note\narea,match,fsr_units\n"A, north","circle:-79.8,43.85,500","1,200"\nB,sp:caledon:b,\n');
  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { area: 'A, north', match: 'circle:-79.8,43.85,500', fsr_units: '1,200' });
  assert.equal(C.parseCSV('area,notes\nX,"said ""yes"""\n')[0].notes, 'said "yes"');
});

test('matcher: an area id (by its polygon or the row\'s own tag), a circle, GeoJSON, a development, and errors', () => {
  const a = C.matcher('sp:caledon:a', AREAS);
  assert.ok(a.test(-79.85, 43.85)); assert.ok(!a.test(-79.65, 43.85));
  assert.ok(a.test(null, null, { sp: ['sp:caledon:a'] }), 'a row tagged with the area counts without a point');
  const c = C.matcher('circle:-79.65,43.85,1000', AREAS);
  assert.ok(c.test(-79.65, 43.855)); assert.ok(!c.test(-79.65, 43.87));
  const gj = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: sq(-79.7, 43.8, -79.6, 43.9) } }] });
  const g = C.matcher('geojson:x.geojson', AREAS, () => gj);
  assert.ok(g.test(-79.65, 43.85)); assert.ok(!g.test(-79.85, 43.85));
  assert.ok(C.matcher('dev:Caledon|1 Main', AREAS).test(0, 0, { id: 'Caledon|1 Main' }));
  const both = C.matcher('sp:caledon:a;sp:caledon:b', AREAS);
  assert.ok(both.test(-79.85, 43.85) && both.test(-79.65, 43.85), "';' joins parts: any matches");
  const bad = C.matcher('sp:caledon:zz;circle:x;nope:1', AREAS);
  assert.equal(bad.errors.length, 3); assert.ok(bad.empty);
});

test('compare: units in each area, the gap to the sheet, before the start year, plan totals', () => {
  const rows = [
    row('1', -79.85, 43.85, 1000, { units: { committed: 200, approved: 300, review: 500, early: 0 }, expectedYear: { likely: 2030 } }),
    row('2', -79.86, 43.86, 500, { expectedYear: { likely: 2036 } }),
    row('3', -79.65, 43.85, 300),
    row('4', -79.5, 43.5, 999),   // in neither area
  ];
  const sheet = C.parseCSV('area,match,start_year,fsr_units,capital_deferred_m\nA,sp:caledon:a,2033,4000,12\nB,sp:caledon:b,,,\nZ,sp:caledon:zz,2033,10,\n');
  const res = C.compare(rows, sheet, AREAS, [{ id: 'sp:caledon:a', units: 5000, population: 15000 }]);
  const [A, B, Z] = res.areas;
  assert.equal(A.app_developments, 2); assert.equal(A.app_units_left, 1500);
  assert.equal(A.app_committed, 200); assert.equal(A.app_approved, 300); assert.equal(A.app_review, 1000);
  assert.equal(A.app_before_start, 1000, 'only the development expected before 2033');
  assert.equal(A.gap_units, 2500); assert.equal(A.app_share, 37.5);
  assert.equal(A.plan_units, 5000); assert.equal(A.capital_deferred_m, '12', 'other columns are copied through');
  assert.equal(B.app_units_left, 300); assert.equal(B.gap_units, null); assert.equal(B.app_before_start, null, 'no start year: not counted');
  assert.equal(Z.app_developments, 0); assert.equal(Z.errors.length, 1);
  assert.equal(res.sites.length, 3); assert.deepEqual(res.sites.filter(s => s.area === 'A').map(s => s.id), ['1', '2'], 'largest first');
  assert.equal(res.totals.app_units_left, 1800); assert.equal(res.totals.fsr_units, 4010);
  assert.match(C.report(res, { name: 't' }), /\| A \| 4,000 \| 1,500 \| 37.5% \| 2,500 \|/);
  assert.match(C.report(res, { name: 't' }), /Z: no area sp:caledon:zz/);
});

test('the template in the repo stays blank and its areas exist', () => {
  const t = C.parseCSV(fs.readFileSync(path.join(__dirname, '../docs/ledger/area-compare-template.csv'), 'utf8'));
  assert.ok(t.length >= 8);
  for (const r of t) for (const k of ['start_year', 'fsr_units', 'units_not_deferred', 'capital_deferred_m']) assert.equal(r[k], '', `${r.area}: ${k} is filled only in reports-internal/`);
  const AJ = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/areas.json'), 'utf8'));
  const all = [...AJ.secondaryPlans, ...(AJ.mtsas || []), ...(AJ.precincts || [])];
  for (const r of t) assert.deepEqual(C.matcher(r.match, all).errors, [], r.area);
});
