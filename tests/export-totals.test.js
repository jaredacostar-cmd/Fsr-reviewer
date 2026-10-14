'use strict';
/* Phase 5 exports: the pure comparison-PDF builders in js/export-comparison.js.
 * The export code itself is DOM-bound, so these tests verify the data layer the
 * PDF uses: one row per compared item with the standard numbers, and totals
 * that match sumEstimates() over the same inputs. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { sumEstimates, tightestConstraint, api } = require('../js/tools-compare.js');
const X = require('../js/export-comparison.js');

function est(o) {
  return {
    totalUnits: o.u || 0, population: o.p || 0,
    employment: { jobs: o.j || 0 },
    combined: {
      water: { avg: o.wa || 0, maxDay: o.wm || 0, peakHour: o.wp || 0 },
      wastewater: { avg: o.sa || 0, peak: o.sp || 0, wetPeak: o.sw || 0 },
    },
  };
}

function dev(key, o) { return { key, title: o.t || key, municipality: o.m || 'Mississauga', phase: o.ph || 'review', units: o.u || 0 }; }

function fns(estsByKey, needsByKey) {
  return {
    estimate: p => (p && estsByKey[p.key]) || null,
    devNeeds: p => (p && needsByKey[p.key]) || null,
    phaseLabel: p => ({ review: 'Under review', approved: 'Approved' }[p.phase] || p.phase),
    sumEstimates, tightestConstraint,
  };
}

const NEEDS = {
  d1: [{ id: 'pipe1', name: 'Trunk sewer X', sub: 'P1', status: 'gap', out: 2029, people: 500 }],
  d2: [{ id: 'plant1', name: 'Clarkson WRRF', sub: '', status: 'planned', out: 2031, people: 2000 }],
};

test('buildRows returns one row per compared dev with the standard numbers', () => {
  const ests = { d1: est({ u: 100, p: 210, j: 5, wm: 2.5, sw: 3.1 }), d2: est({ u: 50, p: 105, wm: 1.2, sw: 1.4 }) };
  const items = [{ kind: 'dev', key: 'dev:d1', title: 'Dev One', sub: 'Mississauga', p: dev('d1', { u: 100 }) },
                 { kind: 'dev', key: 'dev:d2', title: 'Dev Two', sub: 'Brampton', p: dev('d2', { u: 50, m: 'Brampton', ph: 'approved' }) }];
  const rows = X.buildRows(items, fns(ests, NEEDS));
  assert.equal(rows.length, 2);
  assert.equal(rows[0].kind, 'dev');
  assert.equal(rows[0].title, 'Dev One');
  assert.equal(rows[0].units, 100);
  assert.equal(rows[0].people, 210);
  assert.equal(rows[0].jobs, 5);
  assert.equal(rows[0].waterMaxDay, 2.5);
  assert.equal(rows[0].wastewaterWetPeak, 3.1);
  assert.equal(rows[0].phase, 'Under review');
  assert.equal(rows[0].municipality, 'Mississauga');
  assert.equal(rows[0].tightest.id, 'pipe1');
  assert.equal(rows[1].phase, 'Approved');
  assert.equal(rows[1].municipality, 'Brampton');
  assert.equal(rows[1].tightest.id, 'plant1');
});

test('totalsFor equals sumEstimates over the same inputs', () => {
  const ests = { d1: est({ u: 100, p: 210, j: 5, wa: 1, wm: 2.5, wp: 3, sa: 0.9, sp: 2, sw: 3.1 }), d2: est({ u: 50, p: 105, wm: 1.2, sw: 1.4 }) };
  const items = [{ kind: 'dev', key: 'dev:d1', title: 'Dev One', p: dev('d1', { u: 100 }) },
                 { kind: 'dev', key: 'dev:d2', title: 'Dev Two', p: dev('d2', { u: 50 }) }];
  const rows = X.buildRows(items, fns(ests, {}));
  const tot = X.totalsFor(rows);
  const s = sumEstimates([ests.d1, ests.d2]);
  assert.equal(tot.units, s.totalUnits);
  assert.equal(tot.people, s.population);
  assert.equal(tot.jobs, s.jobs);
  assert.equal(tot.waterMaxDay, s.water.maxDay);
  assert.equal(tot.wastewaterWetPeak, s.wastewater.wetPeak);
});

test('area rows sum their members and take the tightest member constraint', () => {
  const ests = { d1: est({ u: 100, p: 210, wm: 2.5, sw: 3.1 }), d2: est({ u: 50, p: 105, wm: 1.2, sw: 1.4 }) };
  const items = [{ kind: 'area', key: 'area:a', title: 'Test Area', sub: '2 developments', members: [dev('d1', { u: 100 }), dev('d2', { u: 50 })] }];
  const rows = X.buildRows(items, fns(ests, NEEDS));
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r.kind, 'area');
  assert.equal(r.units, 150);
  assert.equal(r.people, 315);
  assert.equal(r.waterMaxDay, 3.7);
  assert.equal(r.wastewaterWetPeak, 4.5);
  // gap outranks planned across members
  assert.equal(r.tightest.id, 'pipe1');
  const tot = X.totalsFor(rows);
  const s = sumEstimates([ests.d1, ests.d2]);
  assert.equal(tot.units, s.totalUnits);
  assert.equal(tot.waterMaxDay, s.water.maxDay);
});

test('rows tolerate missing estimates and missing servicing data', () => {
  const items = [{ kind: 'dev', key: 'dev:d9', title: 'No data', p: dev('d9', {}) }];
  const rows = X.buildRows(items, fns({}, {}));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].units, null);
  assert.equal(rows[0].waterMaxDay, null);
  assert.equal(rows[0].tightest, null);
  assert.equal(rows[0].noSvc, true);
  assert.deepEqual(X.totalsFor(rows), { units: 0, people: 0, jobs: 0, waterMaxDay: 0, wastewaterWetPeak: 0 });
});

test('empty comparison gives empty rows and zero totals', () => {
  assert.deepEqual(X.buildRows([], fns({}, {})), []);
  assert.deepEqual(X.buildRows(null, fns({}, {})), []);
  assert.deepEqual(X.totalsFor([]), { units: 0, people: 0, jobs: 0, waterMaxDay: 0, wastewaterWetPeak: 0 });
});

test('tightestText describes the constraint in one line', () => {
  assert.equal(X.tightestText({ name: 'Trunk sewer X', status: 'gap', out: 2029 }),
    'Trunk sewer X \u2014 runs out before a DC project relieves it; runs out \u22482029');
  assert.equal(X.tightestText({ name: 'Clarkson WRRF', status: 'ok', out: 'today' }),
    'Clarkson WRRF \u2014 room to build-out; runs out already');
  assert.equal(X.tightestText(null), 'No servicing data.');
});

test('compare api exposes items, sumEstimates and tightestConstraint (PDF inputs)', () => {
  assert.equal(typeof api.items, 'function');
  assert.equal(typeof api.sumEstimates, 'function');
  assert.equal(typeof api.tightestConstraint, 'function');
  assert.deepEqual(api.items(), []);
});
