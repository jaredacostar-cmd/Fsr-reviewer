'use strict';
// One application, one development (scripts/build-tree-counts.js 3·): the pieces an application was
// split into become one development, each building counted once; the old keys resolve to it.
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.PeelPhases = require('../js/phases.js');
const TG = require('../js/tree-groups.js');
const EF = require('../js/earlier-files.js');
const H = require('./helpers/real-devs.js');

const ev = iso => ({ date: new Date(`${iso}T12:00:00Z`), phase: 'inception', label: 'Date Received' });
const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const app = (ref, extra = {}) => ({ uid: ref, ref, kind: 'application', municipality: 'Brampton', type: 'Site Plan Approval', stage: 'siteplan', phase: 'approved', statusRaw: 'Approved', events: [], ...extra });

test('resolve: a merged piece\'s key opens the development it was merged into', () => {
  TG.setData({ version: 2, devs: [{ k: 'B|keep', n: [] }], files: {}, permits: {}, merged: { 'B|old': 'B|keep', 'B|old~X': 'B|keep' } });
  const exists = k => k === 'B|keep';
  assert.deepEqual(TG.resolveAll('B|old', exists), ['B|keep']);
  assert.deepEqual(TG.resolveAll('B|old~X', exists), ['B|keep']);
  assert.deepEqual(TG.migrateKeys(['B|old', 'B|keep'], exists), ['B|keep']);
  assert.deepEqual(TG.resolveAll('B|old', exists, { aliasesOnly: true }), [], 'not with the trees off');
  TG.setData(null);
});

test('buildings on one parcel: a revision within 25% replaces; another building, an addition or a far count adds', () => {
  const sq3 = (...c) => sq(...c.map(v => v / 3));
  const lot = sq3(0, 0, 0.004, 0.004);
  // 12530 Kennedy Rd: a new condominium building, then units added to the existing plaza.
  const condo = app('2022-0006', { units: 134, events: [ev('2022-03-01')], poly: lot, description: 'The new 4 storey building will consist of 134 residential Condominium units.' });
  const plaza = app('2022-0072', { units: 24, events: [ev('2022-09-01')], poly: lot, description: 'The applicant is proposing a 24 residential units addition to the existing retail plaza.' });
  let p = { key: 'a', units: 134, records: [condo] }, q = { key: 'b', units: 24, records: [plaza] };
  let u = EF.unitsOverTime(p, [p, q]);
  assert.equal(u.totals.land, 158, 'the addition adds');
  // 137 Steeles Ave W: the same two towers rezoned for 1,147, then a site plan for 991: one building track.
  const oz = app('OZS-2023-0018', { stage: 'master', units: 1147, events: [ev('2023-06-01')], poly: lot, description: 'two high-rise towers 50- and 45- storeys' });
  const sp = app('SPA-2025-0193', { units: 991, events: [ev('2025-12-15')], poly: lot, description: 'two mixed-use buildings of 48 and 49 storeys' });
  p = { key: 'a', units: 1147, records: [oz] }; q = { key: 'b', units: 991, records: [sp] };
  u = EF.unitsOverTime(p, [p, q]);
  assert.equal(u.totals.land, 991, 'a revision within 25% replaces');
  // 2475 Eglinton Ave W: 11- and 15-storey buildings (565), then a 27-storey building (351): two.
  const ph1 = app('SP 19/148', { units: 565, events: [ev('2019-12-18')], poly: lot, description: 'Phase 1: 11-storey retirement building, 15-storey rental building (565 units)' });
  const t27 = app('SP 21/020', { units: 351, events: [ev('2021-02-16')], poly: lot, description: '27 storey residential apartment building (351 units)' });
  p = { key: 'a', units: 565, records: [ph1] }; q = { key: 'b', units: 351, records: [t27] };
  u = EF.unitsOverTime(p, [p, q]);
  assert.equal(u.totals.land, 916, 'a count 25%+ apart is another building');
});

test('statedOf: a total followed by how it is distributed is the total', () => {
  assert.equal(EF.statedOf(app('DPC-2022-0007', { units: 134, description: 'The development proposes a total of 134 residential units, which are distributed as 67 units in each building.' })).units, 134);
});

test('frameOf: a city-initiated policy file is not an application', () => {
  const sq3 = (...c) => sq(...c.map(v => v / 3));
  const ci = app('CI19.003', { stage: 'master', type: 'Development Permit System', poly: sq3(0, 0, 0.004, 0.004) });
  const site = app('OZS-2022-0011', { stage: 'master', units: 1149, poly: sq3(0.001, 0.001, 0.002, 0.002) });
  const p = { key: 'a', records: [site] }, q = { key: 'c', records: [ci] };
  assert.equal(EF.frameOf(p, [p, q]), site);
});

test('real data: the split applications are one development each, each building counted once', { skip: !H.available() }, () => {
  const { projects, tree } = H.realDevs();
  const of = ref => projects.find(x => x.records.some(r => r.ref === ref));
  // 137 Steeles Ave W: the 2023 rezoning (1,147) and the 2025 site plan (991) are the same two towers.
  assert.equal(of('OZS-2023-0018'), of('SPA-2025-0193'));
  assert.equal(of('SPA-2025-0193').units, 991);
  // 260 / 270 Malta Ave: a 669-unit pre-consultation revised to 618, beside the 349 built.
  assert.equal(of('PRE-2023-0103'), of('SPA-2021-0143'));
  assert.equal(of('SPA-2021-0143').units, 349 + 618);
  // 58 / 62 Sky Harbour Dr: the registered condominium (134) and another phase (229).
  assert.equal(of('DPC-2022-0007').units, 134 + 229);
  // Every merged key resolves to a development that exists.
  const keys = new Set(projects.map(p => p.key));
  TG.setData(tree);
  for (const [old, kept] of Object.entries(tree.merged || {})) {
    assert.ok(keys.has(kept), `${kept} exists`);
    assert.ok(!keys.has(old), `${old} is gone`);
    assert.deepEqual(TG.resolveAll(old, k => keys.has(k)), [kept]);
  }
  // The count parts add up to each merged development's count (SPEC 1.6).
  for (const g of tree.mergedApplications || []) {
    const d = tree.devs.find(x => x.k === g.key);
    assert.equal((d.c || []).reduce((t, x) => t + x[1], 0), d.u, `${g.key}: parts add up`);
  }
});

test('hasUnits: the Overview link and the Growth table follow the same test', () => {
  assert.equal(EF.hasUnits(null), false);
  assert.equal(EF.hasUnits({ years: [{}], parcels: [{ count: null }] }), false, 'no stated count: no table, so no link');
  assert.equal(EF.hasUnits({ years: [{}], parcels: [{ count: 195 }] }), true, 'one parcel with a count: a table');
  assert.equal(EF.unitsSummary({ years: [{}], parcels: [{ count: null, steps: [] }] }), '', 'no link text without a table');
});
