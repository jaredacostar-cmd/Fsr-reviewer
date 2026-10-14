'use strict';
/* Timing forecast (Phase 7, Feature 2): calibration math and band computation.
 * Pure and Node-requireable — the module must load with no window/document. */
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/timing.js');

const Y = y => Date.UTC(y, 0, 15);          // mid-January of year y
const MO = 30.44 * 864e5;                   // one month in ms

// 10 Brampton single-detached applications, inception Jan 2017:
// 7 approved after 24 mo, of those 7 permitted after 6 more mo, 5 completed after 24 mo.
function fixture() {
  const obs = [];
  for (let i = 0; i < 10; i++) {
    const inc = Y(2017) + i * 864e5;
    const appr = i < 7 ? inc + 24 * MO : null;
    const per = appr ? appr + 6 * MO : null;
    const done = appr && i < 5 ? appr + 30 * MO : null;
    obs.push({ muni: 'Brampton', btype: 'single', hasApp: true,
      first: { inception: inc, approved: appr, permit: per, completed: done } });
  }
  return obs;
}

test('module loads under Node with no browser globals', () => {
  assert.equal(typeof T.calibrate, 'function');
  assert.equal(typeof T.forecastBands, 'function');
  assert.equal(typeof T.facilityBands, 'function');
  assert.equal(typeof T.renderTiming, 'function');
});

test('btypeOf buckets record type text', () => {
  assert.equal(T.btypeOf('New 32 storey residential tower'), 'apartment');
  assert.equal(T.btypeOf('Freehold townhouse block'), 'town');
  assert.equal(T.btypeOf('New single detached dwelling'), 'single');
  assert.equal(T.btypeOf('Semi-detached dwelling'), 'semi');
  assert.equal(T.btypeOf('Industrial warehouse building'), 'employment');
  assert.equal(T.btypeOf('Rezoning'), 'unknown');
  assert.equal(T.btypeOf(null), 'unknown');
});

test('wilson: point estimate inside the interval, sane at n=0', () => {
  const w = T.wilson(7, 10);
  assert.equal(w.p, 0.7);
  assert.ok(w.lo < w.p && w.p < w.hi, `interval [${w.lo}, ${w.hi}] should contain 0.7`);
  assert.ok(w.lo >= 0 && w.hi <= 1);
  assert.deepEqual(T.wilson(0, 0), { p: null, lo: null, hi: null, n: 0 });
  const w1 = T.wilson(10, 10);
  assert.equal(w1.p, 1);
  assert.ok(w1.lo < 1 && w1.hi === 1);
});

test('quantiles: linear interpolation; null when empty', () => {
  assert.deepEqual(T.quantiles([1, 2, 3, 4]), { p25: 1.75, p50: 2.5, p75: 3.25, n: 4 });
  assert.equal(T.quantiles([]), null);
  assert.equal(T.quantiles([5]).p50, 5);
});

test('calibrate: approval / completion rates and lags from dated events', () => {
  const cal = T.calibrate(fixture());
  const r = cal.rows['Brampton|single'];
  assert.equal(r.nApp, 10);
  assert.equal(r.approval.p, 0.7);
  assert.equal(r.nPermit, 7);
  assert.ok(Math.abs(r.completion.p - 5 / 7) < 1e-12);
  assert.ok(Math.abs(r.lagIA.p50 - 24) < 0.6, `lagIA p50=${r.lagIA.p50}`);
  assert.ok(Math.abs(r.lagAC.p50 - 24) < 0.6, `lagAC p50=${r.lagAC.p50}`);
  assert.ok(Math.abs(r.lagAP.p50 - 6) < 0.6, `lagAP p50=${r.lagAP.p50}`);
  assert.ok(r.lagIA.p25 <= r.lagIA.p50 && r.lagIA.p50 <= r.lagIA.p75);
  assert.equal(cal.cohorts[0], 2016);
});

test('calibrate: right-censored cohorts are excluded from rates', () => {
  const obs = fixture();
  // An inception in 2026 with no approval yet must not drag the rate down.
  obs.push({ muni: 'Brampton', btype: 'single', hasApp: true,
    first: { inception: Y(2026), approved: null, permit: null, completed: null } });
  const cal = T.calibrate(obs);
  assert.equal(cal.rows['Brampton|single'].nApp, 10);
});

test('calibrate: status-derived outcomes count where dated events are missing', () => {
  const obs = fixture().map(o => ({ ...o, completed: o.first.completed != null || o.muni === 'Brampton' }));
  const cal = T.calibrate(obs);
  const r = cal.rows['Brampton|single'];
  // All 7 permitted now count as completed via the status flag, not just the 5 dated.
  assert.ok(Math.abs(r.completion.p - 1) < 1e-12, `completion.p=${r.completion.p}`);
  // Lags still use dated events only: 5 dated completions.
  assert.equal(r.lagAC.n, 5);
});
test('rowFor: falls back muni -> type -> global when a cell is thin', () => {
  const cal = T.calibrate(fixture(), { minN: 10 });
  assert.equal(T.rowFor(cal, 'Brampton', 'single').fallback, null);
  assert.equal(T.rowFor(cal, 'Brampton', 'town').key, 'Brampton|*');
  assert.equal(T.rowFor(cal, 'Mississauga', 'single').key, '*|single');
  assert.equal(T.rowFor(cal, 'Mississauga', 'town').key, '*|*');
});

test('forecastBands: totals respect the calibrated rates, low <= likely <= high', () => {
  const cal = T.calibrate(fixture());
  const items = [{ key: 'a', title: 'A', muni: 'Brampton', btype: 'single', units: 100, stage: 'review', stageDate: Y(2026) }];
  const fc = T.forecastBands(items, cal, { nowYear: 2026, years: 25 });
  const expected = 100 * 0.7 * (5 / 7);
  assert.ok(Math.abs(fc.total.likely - expected) < 1e-9, `likely=${fc.total.likely} expected ${expected}`);
  assert.ok(fc.total.low <= fc.total.likely && fc.total.likely <= fc.total.high);
  // The yearly rows add up to the totals, and every project is fully scheduled.
  for (const b of ['low', 'likely', 'high']) {
    const s = fc.years.reduce((t, r) => t + r[b], 0);
    assert.ok(Math.abs(s - fc.total[b]) < 1e-9);
  }
  // Cumulative series are non-decreasing.
  for (let i = 1; i < fc.years.length; i++) assert.ok(fc.years[i].cumLikely >= fc.years[i - 1].cumLikely);
});

test('forecastBands: later stages complete sooner and skip the approval rate', () => {
  const cal = T.calibrate(fixture());
  const mk = stage => [{ key: stage, muni: 'Brampton', btype: 'single', units: 100, stage, stageDate: Y(2026) }];
  const peak = stage => {
    const fc = T.forecastBands(mk(stage), cal, { nowYear: 2026, years: 25 });
    return fc.years.reduce((m, r) => r.likely > m.v ? { y: r.year, v: r.likely } : m, { y: 0, v: -1 }).y;
  };
  assert.ok(peak('permit') < peak('review'), 'permitted projects peak earlier than ones in review');
  const fc = T.forecastBands(mk('permit'), cal, { nowYear: 2026, years: 25 });
  assert.ok(Math.abs(fc.total.likely - 100 * (5 / 7)) < 1e-9, 'no approval-rate haircut once permitted');
});

test('projectSchedule: kernel spreads units around the expected completion year', () => {
  const cal = T.calibrate(fixture());
  const row = T.rowFor(cal, 'Brampton', 'single');
  const s = T.projectSchedule({ units: 100, stage: 'review', stageDate: Y(2026), muni: 'Brampton', btype: 'single' }, row, 'likely', { nowYear: 2026 });
  const tot = Object.values(s).reduce((t, v) => t + v, 0);
  assert.ok(Math.abs(tot - 100 * 0.7 * (5 / 7)) < 1e-9);
  const peakY = +Object.entries(s).sort((a, b) => b[1] - a[1])[0][0];
  // review: 24 (IA) + 6 (AP) + 24 (AC) = 54 mo ≈ 4.5 y after Jan 2026 -> 2030/2031
  assert.ok(peakY >= 2030 && peakY <= 2031, `peak year ${peakY}`);
});

test('facilityBands: faster bands trigger no later than slower bands', () => {
  const cal = T.calibrate(fixture());
  const fac = { name: 'Test plant', rated: 100, existing: 70, approved: 20, proposed: 20 };
  const fb = T.facilityBands(fac, cal, { nowYear: 2026 });
  for (const t of [80, 90, 100]) {
    const tr = fb.triggers[t];
    const ys = [tr.high, tr.likely, tr.low].filter(y => y != null);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] >= ys[i - 1], `threshold ${t}: high=${tr.high} likely=${tr.likely} low=${tr.low}`);
  }
  assert.ok(fb.buildOut.low <= fb.buildOut.likely && fb.buildOut.likely <= fb.buildOut.high);
});

test('facilityBands: a facility that never fills reports no trigger', () => {
  const cal = T.calibrate(fixture());
  const fb = T.facilityBands({ name: 'Big plant', rated: 1000, existing: 10, approved: 5, proposed: 5 }, cal, { nowYear: 2026 });
  for (const t of [80, 90, 100]) {
    assert.deepEqual([fb.triggers[t].low, fb.triggers[t].likely, fb.triggers[t].high], [null, null, null]);
    assert.equal(T.triggerRangeText(fb.triggers[t], fb.end), `after ${fb.end}`);
  }
});

test('triggerRangeText formats ranges and single years', () => {
  assert.equal(T.triggerRangeText({ low: 2031, likely: 2033, high: 2035 }, 2051), '2031–2035');
  assert.equal(T.triggerRangeText({ low: 2033, likely: 2033, high: 2033 }, 2051), '2033');
  assert.equal(T.triggerRangeText({ low: null, likely: null, high: null }, 2051), 'after 2051');
});
