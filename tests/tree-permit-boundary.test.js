'use strict';
// SPEC 1.1 (a permit commits only the file whose boundary holds it) and 1.2 (council decisions
// feed the phase): synthetic cases, then the acceptance case on the real data.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const C = require('../js/council-decisions.js');
const H = require('./helpers/real-devs.js');

const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const point = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const appFields = P.detectFields([{ name: 'FILE_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'TYPE' }, { name: 'DESCRIPTION' }, { name: 'UNITS', type: 'esriFieldTypeInteger' },
  { name: 'RECEIVED_DATE', type: 'esriFieldTypeDate' }]);
const permitFields = P.detectFields([{ name: 'BP_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'DWELLINGS', type: 'esriFieldTypeInteger' },
  { name: 'DESCRIPTION' }, { name: 'ISSUE_DATE', type: 'esriFieldTypeDate' }]);
const APP = { id: 'app', municipality: 'Brampton', kind: 'application' };
const BP = { id: 'bp', municipality: 'Brampton', kind: 'permit' };
let n = 0;
const app = (geom, props) => P.normalizeRecord({ type: 'Feature', id: ++n, geometry: geom, properties: props }, appFields, APP);
const permit = (x, y, props) => P.normalizeRecord({ type: 'Feature', id: ++n, geometry: point(x, y), properties: { DESCRIPTION: 'New single detached dwelling', ...props } }, permitFields, BP);
const Y = (y, m = 0) => Date.UTC(y, m, 1);
const fileOf = (p, ref) => p.files.find(f => f.ref === ref);

// A precinct-plan pre-consultation (2 km square) holding two draft plans and an old, built subdivision.
const PRECINCT = rect(-79.84, 43.64, -79.82, 43.66);
const block = () => {
  const pre = app(PRECINCT, { FILE_NO: 'PRE-2023-0100', ADDRESS: '2055 Bovaird Dr W', STATUS: 'Closed', TYPE: 'Pre-consultation', DESCRIPTION: 'Official Plan Amendment | Secondary Plan — a comprehensive Precinct Plan', RECEIVED_DATE: Y(2023) });
  const big = app(rect(-79.838, 43.652, -79.826, 43.658), { FILE_NO: 'OZS-2025-0034', ADDRESS: '2055 Bovaird Dr W', STATUS: 'In Review-Public Mtg Complete', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Draft Plan of Subdivision | Zoning By Law Amendment — residential mixed-use', UNITS: 6289, RECEIVED_DATE: Y(2025, 6) });
  const small = app(rect(-79.838, 43.642, -79.83, 43.648), { FILE_NO: 'OZS-2025-0032', ADDRESS: '9763 Heritage Rd', STATUS: 'Staff Review Complete', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Draft Plan of Subdivision | Zoning By Law Amendment — 253 detached', UNITS: 592, RECEIVED_DATE: Y(2025, 6) });
  const old = app(rect(-79.826, 43.641, -79.822, 43.645), { FILE_NO: 'C05W07.006', ADDRESS: 'North of Embleton Road', STATUS: 'Closed Approved', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Draft Plan of Subdivision | Official Plan Amendment | Zoning By Law Amendment — Part of Lot 7', UNITS: 52, RECEIVED_DATE: Y(2018, 3) });
  const houses = [0, 1, 2, 3].map(i => permit(-79.825 + i * 0.0005, 43.643, { BP_NO: `21-27${i}-000-00`, ADDRESS: `${50 + i} Dairymaid Rd`, STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2021) }));
  // One house inside the precinct but outside every draft plan (the 2022 permit at 9362 Heritage Rd).
  const stray = permit(-79.8233, 43.6444 + 0.01, { BP_NO: '22-234447-000-00', ADDRESS: '9362 Heritage Rd', STATUS: 'Occupancy Granted', DWELLINGS: 1, ISSUE_DATE: Y(2022, 2) });
  return { pre, big, small, old, houses, stray };
};

test('1.1 a permit outside every draft / site plan sets no phase, even inside the precinct plan', () => {
  const b = block();
  const p = P.mergeProject('Brampton|2055 BOVAIRD DR W', [b.pre, b.big, b.small, b.old, ...b.houses, b.stray]);
  assert.equal(p.phase, 'review', 'the block is under review: most of its units are in draft plans still in review');
  assert.equal(b.stray.fileOf, undefined, 'the stray permit belongs to no file');
  assert.ok(b.stray.outside, 'and is marked as outside every file');
  for (const r of b.houses) assert.equal(r.fileOf, b.old.uid, 'the houses sit in the old subdivision');
  assert.equal(fileOf(p, 'OZS-2025-0034').phase, 'review');
  assert.equal(fileOf(p, 'OZS-2025-0032').phase, 'review');
  assert.equal(fileOf(p, 'OZS-2025-0034').permits, 0);
  assert.equal(fileOf(p, 'OZS-2025-0032').permits, 0);
  // The old subdivision: draft plan approved, its houses built.
  assert.ok(P.PHASE_BY_KEY[fileOf(p, 'C05W07.006').phase].rank >= P.PHASE_BY_KEY.approved.rank);
  assert.equal(fileOf(p, 'C05W07.006').permits, 4);
});

test('1.1 a permit before its own file was filed stays out, judged against that file (not the oldest file in the block)', () => {
  const b = block();
  // A 2019 house inside the 2025 draft plan: what stood there before.
  const before = permit(-79.83, 43.655, { BP_NO: '19-1000-000-00', ADDRESS: '1 Old Farm Rd', STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2019) });
  const p = P.mergeProject('k', [b.pre, b.big, b.old, before]);
  assert.ok(before.prePlan, 'issued years before OZS-2025-0034 was filed');
  assert.equal(fileOf(p, 'OZS-2025-0034').phase, 'review');
  assert.equal(p.phase, 'review');
});

test('1.1 one site: the permits still move it (no change from before)', () => {
  const sp = app(rect(-79.70, 43.70, -79.698, 43.702), { FILE_NO: 'SPA-2020-0001', ADDRESS: '1 Main St', STATUS: 'Approved', TYPE: 'Site Plan', DESCRIPTION: 'Site plan for 200 apartments', UNITS: 200, RECEIVED_DATE: Y(2020) });
  const bp = permit(-79.699, 43.701, { BP_NO: '23-100-000-00', ADDRESS: '1 Main St', STATUS: 'Inspections', DWELLINGS: 200, ISSUE_DATE: Y(2023), DESCRIPTION: 'New 20 storey apartment building' });
  const p = P.mergeProject('Brampton|1 MAIN ST', [sp, bp]);
  assert.equal(p.phase, 'construction');
  assert.equal(bp.fileOf, sp.uid);
});

test('1.1 a development with no file boundaries keeps the permits as before', () => {
  const a = app(point(-79.7, 43.7), { FILE_NO: 'SPA-2020-0002', ADDRESS: '2 Main St', STATUS: 'Approved', TYPE: 'Site Plan', UNITS: 10, RECEIVED_DATE: Y(2020) });
  const bp = permit(-79.7, 43.7, { BP_NO: '23-200-000-00', ADDRESS: '2 Main St', STATUS: 'Issued', DWELLINGS: 10, ISSUE_DATE: Y(2023) });
  const p = P.mergeProject('Brampton|2 MAIN ST', [a, bp]);
  assert.equal(p.phase, 'permit');
  assert.ok(!bp.outside);
});

test('1.2 a draft plan approval is phase 3 (Draft / site plan approved); a zoning approval alone is not', () => {
  assert.equal(P.PHASE_BY_KEY.approved.label, 'Draft / site plan approved');
  const draft = app(rect(-79.70, 43.70, -79.69, 43.71), { FILE_NO: 'OZS-2021-0001', ADDRESS: '5 Elm St', STATUS: 'Draft Approved', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Draft Plan of Subdivision | Zoning By Law Amendment', UNITS: 80, RECEIVED_DATE: Y(2021) });
  assert.equal(P.mergeProject('a', [draft]).phase, 'approved');
  const zoning = app(rect(-79.70, 43.70, -79.69, 43.71), { FILE_NO: 'OZS-2021-0002', ADDRESS: '6 Elm St', STATUS: 'Closed Approved', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Zoning By Law Amendment — 12 storey apartment', UNITS: 150, RECEIVED_DATE: Y(2021) });
  const p = P.mergeProject('b', [zoning]);
  assert.equal(p.phase, 'review');
  assert.ok(p.zoningApproved && p.zoningApproved.refs.includes('OZS-2021-0002'));
  assert.equal(fileOf(p, 'OZS-2021-0002').status, 'Zoning approved');
});

test('1.2 a zoning by-law passed at council makes the file "Zoning approved", named in its status; a council draft approval moves it to phase 3', () => {
  const council = { files: {
    'Brampton|OZS|2025|32': [['m1', 0]],
    'Brampton|OZS|2021|9': [['m2', 0]],
  }, meetings: {
    m1: { muni: 'Brampton', date: '2026-09-09', passed: true, items: [{ title: 'By-law 153-2026 - To amend Comprehensive Zoning By-law 270-2004, as amended', text: '' }] },
    m2: { muni: 'Brampton', date: '2022-03-21', passed: true, items: [{ title: 'Staff Report re: Application to Amend the Zoning By-Law and for a Proposed Draft Plan of Subdivision', outcome: 'CARRIED', text: 'That the Proposed Draft Plan of Subdivision submitted by X Inc., Ward 6, File: OZS-2021-0009, be approved, on the basis that it represents good planning.' }] },
  } };
  const d = C.decisionsFrom(council);
  assert.deepEqual(d.files['Brampton|OZS|2025|32'].zoning, { bylaw: '153-2026', date: '2026-09-09', url: null });
  assert.equal(d.files['Brampton|OZS|2021|9'].draft.date, '2022-03-21');
  const a = app(rect(-79.838, 43.642, -79.83, 43.648), { FILE_NO: 'OZS-2025-0032', ADDRESS: '9763 Heritage Rd', STATUS: 'Staff Review Complete', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Draft Plan of Subdivision | Zoning By Law Amendment', UNITS: 592, RECEIVED_DATE: Y(2025, 6) });
  const b = app(rect(-79.70, 43.70, -79.69, 43.71), { FILE_NO: 'OZS-2021-0009', ADDRESS: '7 Elm St', STATUS: 'In Review', TYPE: 'Official Plan / Zoning / Subdivision', DESCRIPTION: 'Draft Plan of Subdivision | Zoning By Law Amendment', UNITS: 90, RECEIVED_DATE: Y(2021) });
  assert.equal(C.applyTo([a, b], d, P.canonRef), 2);
  const pa = P.mergeProject('a', [a]);
  assert.equal(pa.phase, 'review');
  assert.match(fileOf(pa, 'OZS-2025-0032').status, /Zoning approved · By-law 153-2026, 2026-09-09/);
  assert.equal(pa.zoningApproved.bylaws[0], '153-2026');
  assert.equal(P.mergeProject('b', [b]).phase, 'approved', 'draft plan approved at committee');
});

// ---- The acceptance case on the real data (data/snapshot.json, data/tree-counts.json, data/council-decisions.json).
test('acceptance: Brampton|2055 BOVAIRD DR W is under review, zoning approved; its draft plans commit nothing; C05W07.006 does', { skip: !H.available() && 'snapshot not present' }, () => {
  const { byKey } = H.realDevs();
  const p = byKey.get('Brampton|2055 BOVAIRD DR W');
  assert.ok(p, 'the development exists');
  assert.equal(p.phase, 'review');
  assert.ok(p.zoningApproved, 'zoning approved');
  assert.ok(p.zoningApproved.bylaws.includes('153-2026'));
  assert.match(fileOf(p, 'OZS-2025-0032').status, /By-law 153-2026/);
  for (const ref of ['OZS-2025-0034', 'OZS-2025-0032']) {
    const f = fileOf(p, ref);
    assert.equal(f.phase, 'review', `${ref} in review`);
    assert.equal(f.permits, 0, `no permit commits ${ref}`);
  }
  const old = fileOf(p, 'C05W07.006');
  assert.ok(P.PHASE_BY_KEY[old.phase].rank >= P.PHASE_BY_KEY.approved.rank, 'C05W07.006 (Closed Approved draft plan, built) commits its 52 units');
  const stray = p.records.find(r => r.ref === '22-234447-000-00');
  assert.ok(stray && stray.outside && !stray.fileOf, 'the 2022 house at 9362 Heritage Rd belongs to no draft plan');
});
