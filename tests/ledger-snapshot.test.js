'use strict';
// Phase 5 of the pipeline ledger (docs/pipeline-ledger-plan.md): the annual snapshot — a fixed,
// versioned column template; a CSV with its README; the diff between snapshots; frozen once written.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const S = require('../js/ledger-snapshot.js');
const L = require('../js/ledger.js');
const B = require('../scripts/build-ledger.js');
const { available } = require('./helpers/real-devs.js');

const row = (id, extra = {}) => ({
  id, name: `Site ${id}`, address: '1 Main St', municipality: 'Brampton', lat: 43.7, lon: -79.7, stage: 'approved', stageDate: '2025-01-01',
  committedPeel: false, committedD51: true, commitBy: null, capacityStage: 'approved', registered: { yes: false, date: null },
  servicing: { bucket: 'none', applied: null, issued: null }, buildingPermit: { yes: false, filed: null, firstIssued: null },
  planned: 100, left: 100, units: { committed: 0, approved: 100, review: 0, early: 0 }, byType: { single: 0, town: 100, apartment: 0, unknown: 0 },
  people: 340, zone: { id: 'pz:6', name: 'Pressure zone 6' }, plant: 'Clarkson', sp: [], expectedYear: { likely: 2030, low: 2029, high: 2032, basis: { borrowed: true } },
  milestone: 'to2031', buckets: { to2031: 0.6, to2041: 0.3, to2051: 0, later: 0.1 }, confidence: { tier: 'C', base: 'C', reasons: ['draft or site plan approval, no permit yet'], flags: [] },
  lapsed: null, unitsEstimated: false, sources: ['SP 25-1'], ...extra,
});

test('the template: one column each, a version number, a season name', () => {
  const keys = S.COLUMNS.map(c => c.key);
  assert.equal(new Set(keys).size, keys.length, 'no column twice');
  assert.equal(S.TEMPLATE, 1);
  for (const k of ['id', 'lat', 'lon', 'units_left', 'units_committed', 'people', 'pressure_zone', 'plant', 'expected_year', 'milestone', 'tier']) assert.ok(keys.includes(k), k);
  assert.ok(S.COLUMNS.every(c => c.what && c.what.length > 3), 'every column says what it holds');
  assert.equal(S.nameFor('2026-10-19'), '2026-fall'); assert.equal(S.nameFor('2027-01-15'), '2027-winter');
  assert.equal(S.nameFor('2027-04-01'), '2027-spring'); assert.equal(S.nameFor('2027-07-01'), '2027-summer'); assert.equal(S.nameFor('2027-12-05'), '2027-winter');
});

test('snapshot and CSV: totals, the README first, the header, quoted values', () => {
  const s = S.snapshot([row('Brampton|1'), row('Brampton|2', { name: 'Smith, "Phase 2"', left: 50, units: { committed: 50, approved: 0, review: 0, early: 0 } })], { name: '2026-fall', sourceDate: '2026-10-19', frozenAt: '2026-10-23' });
  assert.equal(s.template, 1); assert.equal(s.totals.developments, 2);
  assert.equal(s.totals.units_left, 150); assert.equal(s.totals.units_committed, 50); assert.deepEqual(s.totals.tiers, { C: 2 });
  assert.equal(s.rows[0].timing_borrowed, 'yes'); assert.equal(s.rows[0].committed_d51, 'yes');
  const lines = S.toCSV(s).trim().split('\n'), readme = lines.filter(l => l.startsWith('# ')), data = lines.filter(l => !l.startsWith('#'));
  assert.match(readme[0], /2026-fall \(template 1\)\. Public-data estimate\. Not the Region’s committed capacity ledger\./);
  assert.match(readme[1], /as of 2026-10-19; frozen 2026-10-23/);
  assert.ok(readme.some(l => /# {3}tier: confidence tier/.test(l)), 'the columns are described');
  assert.equal(data[0], S.COLUMNS.map(c => c.key).join(','));
  assert.equal(data.length, 3);
  assert.ok(data[2].includes('"Smith, ""Phase 2"""'), 'quotes and commas escaped');
});

test('diff: new, dropped, moved milestone, changed tier, units', () => {
  const a = S.snapshot([row('x'), row('y'), row('z')]);
  const b = S.snapshot([row('x', { milestone: 'to2041' }), row('y', { confidence: { tier: 'B', base: 'B', reasons: [], flags: [] } }), row('w', { left: 30 })]);
  const d = S.diff(a, b);
  assert.deepEqual(d.counts, { new: 1, dropped: 1, moved: 1, tier: 1 });
  assert.equal(d.new[0].id, 'w'); assert.equal(d.dropped[0].id, 'z');
  assert.deepEqual([d.moved[0].from, d.moved[0].to], ['to2031', 'to2041']);
  assert.deepEqual([d.tier[0].from, d.tier[0].to], ['C', 'B']);
  assert.equal(d.unitsDelta, -70);
});

test('frozen: a snapshot that exists is never written again', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ledger-'));
  const s = S.snapshot([row('a')], { name: '2026-fall', sourceDate: '2026-10-19', frozenAt: '2026-10-23' });
  const w = B.write(s, dir);
  assert.equal(w.ok, true);
  const idx = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'));
  assert.deepEqual(idx.snapshots.map(x => [x.name, x.developments]), [['2026-fall', 1]]);
  const before = fs.readFileSync(path.join(dir, '2026-fall.csv'), 'utf8');
  const again = B.write(S.snapshot([row('a'), row('b')], { name: '2026-fall' }), dir);
  assert.equal(again.ok, false); assert.match(again.error, /frozen once written/);
  assert.equal(fs.readFileSync(path.join(dir, '2026-fall.csv'), 'utf8'), before, 'unchanged');
  fs.rmSync(dir, { recursive: true, force: true });
});

// The real data: the script's set is the app's (2,801 developments at Peel), and its rows add up as the
// ledger's.
test('real data: the script builds the app’s Peel ledger', { skip: !available() }, () => {
  const { s, rows, set } = B.build(path.join(__dirname, '..', 'data'), { frozenAt: '2026-10-23' });
  const t = L.totals(rows);
  assert.ok(set.length > 2000, `${set.length} developments`);
  assert.equal(s.totals.developments, rows.length);
  assert.ok(Math.abs(s.totals.units_left - t.left) < 1, 'units left');
  assert.ok(Math.abs(s.totals.units_committed - t.units.committed) < 1, 'committed');
  assert.equal(Object.values(s.totals.tiers).reduce((a, b) => a + b, 0), rows.length, 'one tier each');
  assert.ok(s.rows.filter(r => r.pressure_zone).length > rows.length * 0.9, 'zones');
  assert.ok(s.rows.filter(r => r.plant).length > rows.length * 0.9, 'plants');
  assert.match(s.name, /^\d{4}-(winter|spring|summer|fall)$/);
});
