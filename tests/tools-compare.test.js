'use strict';
/* Phase 3b tool 4 tests: the pure helpers in js/tools-compare.js —
 * sumEstimates(list) and tightestConstraint(list). */
const test = require('node:test');
const assert = require('node:assert/strict');

const { sumEstimates, tightestConstraint } = require('../js/tools-compare.js');

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

test('sumEstimates adds units, people, jobs and flows', () => {
  const t = sumEstimates([est({ u: 100, p: 210, j: 5, wa: 1, wm: 2, wp: 3, sa: 0.9, sp: 2, sw: 2.5 }), est({ u: 50, p: 105, wm: 1, sw: 1.2 })]);
  assert.equal(t.totalUnits, 150);
  assert.equal(t.population, 315);
  assert.equal(t.jobs, 5);
  assert.equal(t.water.maxDay, 3);
  assert.equal(t.wastewater.wetPeak, 3.7);
});

test('sumEstimates tolerates nulls and empty input', () => {
  assert.deepEqual(sumEstimates([]), { totalUnits: 0, population: 0, jobs: 0, water: { avg: 0, maxDay: 0, peakHour: 0 }, wastewater: { avg: 0, peak: 0, wetPeak: 0 } });
  const t = sumEstimates([null, est({ u: 10 })]);
  assert.equal(t.totalUnits, 10);
});

test('tightestConstraint orders gap < planned < check < ok', () => {
  const cs = [
    { id: 'a', status: 'ok', out: 2030, people: 10 },
    { id: 'b', status: 'planned', out: 2028, people: 10 },
    { id: 'c', status: 'check', out: 2027, people: 10 },
    { id: 'd', status: 'gap', out: 2035, people: 10 },
  ];
  assert.equal(tightestConstraint(cs).id, 'd');
  assert.equal(tightestConstraint(cs.filter(c => c.id !== 'd')).id, 'b');
});

test('tightestConstraint breaks ties by run-out year, then room', () => {
  const cs = [
    { id: 'a', status: 'gap', out: 2032, people: 500 },
    { id: 'b', status: 'gap', out: 2029, people: 900 },
    { id: 'c', status: 'gap', out: 2029, people: 100 },
  ];
  assert.equal(tightestConstraint(cs).id, 'c');
  const today = [{ id: 'a', status: 'gap', out: 2030 }, { id: 'b', status: 'gap', out: 'today' }];
  assert.equal(tightestConstraint(today).id, 'b');
});

test('tightestConstraint returns null for empty input', () => {
  assert.equal(tightestConstraint([]), null);
  assert.equal(tightestConstraint(null), null);
});
