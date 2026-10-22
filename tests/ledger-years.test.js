'use strict';
// Phase 3 of the pipeline ledger (docs/pipeline-ledger-plan.md): an expected year per development,
// from the Forecast view's own schedules, so the rows add up to its yearly totals; the curves come from
// the municipalities that date completions; the backtest scores them against what was built.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/timing.js');
const L = require('../js/ledger.js');
const { realDevs, available } = require('./helpers/real-devs.js');

const ms = (y, m = 0) => Date.UTC(y, m, 1);
const site = (key, muni, phase, units, milestones) => ({ key, municipality: muni, phase, units, milestones, records: [], types: [], description: '' });

test('curves: only the municipalities given; a completion after "now" is still waiting then', () => {
  const ps = [
    site('a', 'Mississauga', 'completed', 5, { review: new Date(ms(2017)), completed: new Date(ms(2019)) }),
    site('b', 'Brampton', 'review', 5, { review: new Date(ms(2017)) }),
  ];
  assert.deepEqual([...T.datedMunis(ps)], ['Mississauga'], 'Brampton dates no completions');
  const all = T.curveObservations(ps, ms(2026)), mis = T.curveObservations(ps, ms(2026), { munis: T.datedMunis(ps) });
  assert.equal(all.length, 2); assert.equal(mis.length, 1);
  // As of 2018 the Mississauga site had not finished: censored at 2018, not done.
  const past = T.curveObservations(ps, ms(2018), { munis: new Set(['Mississauga']) });
  assert.equal(past.length, 1); assert.equal(past[0].done, false);
  assert.ok(Math.abs(past[0].t - (ms(2018) - ms(2017)) / (30.44 * 864e5)) < 1e-9);
});

test('scheduleFor: the year half its expected homes are done; low from the fast band, high from the slow', () => {
  const p = site('x', 'Brampton', 'review', 100, { review: new Date(ms(2024)) });
  const m = {
    ss: { sched: new Map([['x', { high: { 2027: 60, 2028: 40 }, likely: { 2028: 30, 2029: 30, 2030: 40 }, low: { 2030: 20, 2031: 20 } }]]), after: new Map([['x', { low: 60, likely: 0, high: 0 }]]) },
    curves: {}, munis: new Set(['Mississauga']), now: ms(2026),
  };
  const s = T.scheduleFor(p, m);
  assert.equal(s.likely, 2029, 'likely: 30 + 30 of 100 by 2029');
  assert.equal(s.low, 2027, 'fast band');
  assert.equal(s.high, null, 'slow band: 60 of 100 after the forecast');
  assert.equal(s.basis.borrowed, true, 'Brampton is timed with Mississauga');
  assert.equal(T.scheduleFor(site('none', 'Caledon', 'review', 5, {}), m), null, 'nothing scheduled: no year');
  // The ledger row's milestone is its likely year's bucket.
  assert.equal(L.bucketOf(2029), 'to2031'); assert.equal(L.bucketOf(2032), 'to2041'); assert.equal(L.bucketOf(2051), 'to2051'); assert.equal(L.bucketOf(null), 'later');
});

test('backtest: a site finishing inside its range is a hit; one past its likely year unfinished is a miss', () => {
  const ps = [];
  // History: 40 sites in review from 2016 that all finished 3 years later (the curve).
  for (let i = 0; i < 40; i++) ps.push(site(`h${i}`, 'Mississauga', 'completed', 5, { review: new Date(ms(2016, i % 12)), completed: new Date(ms(2019, i % 12)) }));
  // Tested: in review since Jan 2020 (the curve: done about Dec 2022); one finished then, one never did.
  ps.push(site('t1', 'Mississauga', 'completed', 5, { review: new Date(ms(2020)), completed: new Date(ms(2022, 10)) }));
  ps.push(site('t2', 'Mississauga', 'review', 5, { review: new Date(ms(2020)) }));
  const r = T.backtest(ps, ms(2020, 6), { now: ms(2026), testMunis: new Set(['Mississauga']) });
  assert.equal(r.sites, 2); assert.equal(r.judged, 2);
  assert.equal(r.inRange, 1, 'the one that finished on time');
  assert.equal(r.within1, 1);
});

// The real snapshot: every development's schedule adds up to the Forecast view's yearly totals, and the
// ledger's buckets to its 2031, 2041 and 2051 sums.
test('real data: rows add up to the forecast; expected years are within its span', { skip: !available() }, () => {
  const { projects } = realDevs();
  const now = Date.parse('2026-10-19T00:00:00Z'), munis = T.datedMunis(projects);
  assert.deepEqual([...munis], ['Mississauga']);
  const H = require('../data/housing.json'), R = require('../data/peel-reports.json');
  const homes = T.homesNeeded(H.mof && H.mof.peel, R.forecast2051 && R.forecast2051.municipalities);
  const cal = T.calibrate(T.observationsFromProjects(projects)), curves = T.stageCurves(T.curveObservations(projects, now, { munis }));
  const ss = T.stageSchedules(T.pipelineItems(projects), cal, { curves, homes, now });
  const m = { cal, curves, homes, ss, now, munis };
  const set = projects.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const fc = T.bandsFromSchedules(T.pipelineItems(set), ss);
  const P = require('../js/phases.js');
  const rows = L.rows(set, { asOf: now, scheduleOf: p => T.scheduleFor(p, m), yearsOf: p => { const s = ss.sched.get(p.key), a = ss.after.get(p.key); return s || a ? { shares: L.bucketShares(s ? s.likely : null, a ? a.likely : 0, P.unbuiltOf(p)) } : null; } });
  const r = L.rollup(rows, 'municipality'), sumTo = y => fc.years.filter(x => x.year <= y).reduce((t, x) => t + x.likely, 0);
  assert.ok(Math.abs(L.sumOf(r.root.cells, { bucket: 'to2031' }) - sumTo(2031)) < 1, 'to 2031');
  assert.ok(Math.abs(L.sumOf(r.root.cells, { bucket: 'to2031' }) + L.sumOf(r.root.cells, { bucket: 'to2041' }) - sumTo(2041)) < 1, 'to 2041');
  assert.ok(Math.abs(L.sumOf(r.root.cells) - L.totals(rows).left) < 1e-6, 'every unit is in a bucket');
  const timed = rows.filter(x => x.expectedYear && x.expectedYear.likely != null);
  assert.ok(timed.length > rows.length / 2, `${timed.length} of ${rows.length} rows have a year`);
  for (const x of timed) {
    assert.ok(x.expectedYear.likely >= ss.nowYear && x.expectedYear.likely <= ss.endYear, x.id);
    if (x.expectedYear.low != null) assert.ok(x.expectedYear.low <= x.expectedYear.likely, `${x.id}: low ≤ likely`);
    if (x.expectedYear.high != null) assert.ok(x.expectedYear.high >= x.expectedYear.likely, `${x.id}: high ≥ likely`);
    assert.equal(x.milestone, L.bucketOf(x.expectedYear.likely));
  }
  assert.ok(timed.some(x => x.municipality !== 'Mississauga' && x.expectedYear.basis.borrowed), 'Brampton and Caledon rows are marked');
  assert.ok(timed.every(x => x.municipality !== 'Mississauga' || !x.expectedYear.basis.borrowed));
});
