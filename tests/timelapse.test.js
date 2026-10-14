'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const TL = require('../js/timelapse.js');

const D = s => new Date(`${s}T00:00:00Z`);
// A synthetic project with a built timeline (the app's phases.js builds this shape).
const proj = (timeline, extra = {}) => ({ key: 'Test|1', phase: 'review', records: [], timeline, ...extra });
const ev = (date, phase) => ({ date: D(date), phase, text: phase, record: 'r:1', tag: 'T1' });

test('phase walks forward through dated timeline events', () => {
  const p = proj([
    ev('2018-03-01', 'inception'),
    ev('2019-06-15', 'review'),
    ev('2021-02-10', 'approved'),
    ev('2022-09-01', 'permit'),
    ev('2024-05-20', 'completed'),
  ]);
  assert.equal(TL.phaseAsOfYear(p, 2017), null);           // not yet tracked
  assert.equal(TL.phaseAsOfYear(p, 2018), 'inception');
  assert.equal(TL.phaseAsOfYear(p, 2019), 'review');
  assert.equal(TL.phaseAsOfYear(p, 2020), 'review');        // between events: last reached
  assert.equal(TL.phaseAsOfYear(p, 2021), 'approved');
  assert.equal(TL.phaseAsOfYear(p, 2023), 'permit');
  assert.equal(TL.phaseAsOfYear(p, 2024), 'completed');
  assert.equal(TL.phaseAsOfYear(p, 2026), 'completed');
});

test('as-of is Dec 31: a January event does not leak into the prior year', () => {
  const p = proj([ev('2019-01-02', 'inception'), ev('2019-06-01', 'review')]);
  assert.equal(TL.phaseAsOfYear(p, 2018), null);
  assert.equal(TL.phaseAsOfYear(p, 2019), 'review');
});

test('cancelled is terminal until newer dated activity restarts the cycle', () => {
  const p = proj([
    ev('2019-04-01', 'inception'),
    ev('2020-11-01', 'cancelled'),
  ]);
  assert.equal(TL.phaseAsOfYear(p, 2018), null);
  assert.equal(TL.phaseAsOfYear(p, 2019), 'inception');
  assert.equal(TL.phaseAsOfYear(p, 2020), 'cancelled');
  assert.equal(TL.phaseAsOfYear(p, 2025), 'cancelled');
  const revived = proj([
    ev('2019-04-01', 'inception'),
    ev('2020-11-01', 'cancelled'),
    ev('2022-02-01', 'inception'), // new application on the site: a new cycle
    ev('2023-05-01', 'approved'),
  ]);
  assert.equal(TL.phaseAsOfYear(revived, 2021), 'cancelled');
  assert.equal(TL.phaseAsOfYear(revived, 2022), 'inception');
  assert.equal(TL.phaseAsOfYear(revived, 2024), 'approved');
});

test('weekly history readings pin the phase at their date', () => {
  const p = proj([ev('2024-05-20', 'completed')], {
    historyEvents: [['2026-10-08', 'completed'], ['2026-10-12', 'construction', 'rules']],
  });
  assert.equal(TL.phaseAsOfYear(p, 2024), 'completed');
  assert.equal(TL.phaseAsOfYear(p, 2025), 'completed');   // snapshot does not leak backwards
  assert.equal(TL.phaseAsOfYear(p, 2026), 'construction'); // rules reclassification wins
});

test('same-day file event and weekly reading: the reading wins', () => {
  const p = proj([ev('2026-10-08', 'permit')], { historyEvents: [['2026-10-08', 'review']] });
  assert.equal(TL.phaseAsOfYear(p, 2026), 'review');
});

test('history alone can place a project with no file events', () => {
  const p = { key: 'Test|2', phase: 'review', records: [], timeline: [], historyEvents: [['2026-10-08', 'review']] };
  assert.equal(TL.phaseAsOfYear(p, 2025), null);
  assert.equal(TL.phaseAsOfYear(p, 2026), 'review');
});

test('projects with no events at all pin at their current phase', () => {
  const p = { key: 'Test|3', phase: 'completed', records: [], timeline: [] };
  assert.equal(TL.phaseAsOfYear(p, 2016), 'completed');
  assert.equal(TL.phaseAsOfYear(p, 2026), 'completed');
});

test('falls back to record events when no timeline is built', () => {
  const p = {
    key: 'Test|4', phase: 'approved', records: [
      { events: [{ date: D('2017-05-01'), phase: 'inception' }, { date: D('2020-08-01'), phase: 'approved' }] },
      { events: [{ date: D('2019-01-15'), phase: 'review' }] }, // lower rank than approved: must not win
    ], timeline: [],
  };
  assert.equal(TL.phaseAsOfYear(p, 2016), null);
  assert.equal(TL.phaseAsOfYear(p, 2018), 'inception');
  assert.equal(TL.phaseAsOfYear(p, 2019), 'review');
  assert.equal(TL.phaseAsOfYear(p, 2020), 'approved');
});

test('unknown phases and undated events are ignored', () => {
  const p = proj([
    { date: D('2018-01-01'), phase: 'zoning', text: 'x', record: 'r', tag: 't' },
    { date: null, phase: 'approved', text: 'x', record: 'r', tag: 't' },
    ev('2019-01-01', 'review'),
  ]);
  assert.equal(TL.phaseAsOfYear(p, 2018), null);
  assert.equal(TL.phaseAsOfYear(p, 2019), 'review');
});

test('invalid inputs return null', () => {
  assert.equal(TL.phaseAsOfYear(null, 2020), null);
  assert.equal(TL.phaseAsOfYear({ key: 'x' }, 2020), null); // no records/timeline/phase
  assert.equal(TL.phaseAsOfYear(proj([ev('2020-01-01', 'review')]), NaN), null);
  assert.equal(TL.phaseAsOfYear({ key: 'x', phase: 'bogus', records: [], timeline: [] }, 2020), null);
});

test('timelapseYears spans 2016 to the given year', () => {
  assert.deepEqual(TL.timelapseYears(new Date('2026-10-14T00:00:00Z')), [2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026]);
  assert.deepEqual(TL.timelapseYears(new Date('2010-01-01T00:00:00Z')), [2016]); // never starts before the data window
  assert.equal(TL.START_YEAR, 2016);
});

test('clampYear keeps the scrubber inside the range', () => {
  const yrs = [2016, 2017, 2018];
  assert.equal(TL.clampYear(2010, yrs), 2016);
  assert.equal(TL.clampYear(2030, yrs), 2018);
  assert.equal(TL.clampYear(2017.6, yrs), 2018);
  assert.equal(TL.clampYear(2017.2, yrs), 2017);
});

test('speed options include the 1.2 s default', () => {
  assert.equal(TL.DEFAULT_SPEED_MS, 1200);
  assert.ok(TL.SPEEDS.some(s => s.ms === 1200));
});

test('reduced motion is off in Node (no matchMedia)', () => {
  assert.equal(TL.isReducedMotion(), false);
});

test('controller surface is inert under Node', () => {
  assert.equal(TL.isActive(), false);
  assert.equal(TL.start(), false); // no document: refuses to start
  TL.stop(); // no-op, must not throw
});
