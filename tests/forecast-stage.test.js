'use strict';
// Forecast by time in stage (decided 2026-10-17): a site's finish from how long it has already
// waited, sites beyond the data paced by the homes the population projection needs, large sites
// finishing about 250 units a year, and the homes-needed and allocation lines on the chart.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const T = require('../js/timing.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const MO = 30.44 * 864e5;
const NOW = Date.UTC(2026, 9, 17);
const sumOf = o => Object.values(o).reduce((t, v) => t + v, 0);
const cal1 = { rows: { '*|*': { key: '*|*', nApp: 99, nPermit: 99, approval: { p: 1, lo: 1, hi: 1 }, completion: { p: 1, lo: 1, hi: 1 } } }, minN: 1 };

test('survival: Kaplan–Meier counts the sites still waiting, and the time left depends on the wait', () => {
  // 10 sites: finished after 6, 12, 18, 24, 30 months; 5 still waiting after 60 months.
  const obs = [6, 12, 18, 24, 30].map(t => ({ t, done: true })).concat([60, 60, 60, 60, 60].map(t => ({ t, done: false })));
  const c = T.survival(obs);
  assert.equal(c.n, 10);
  assert.ok(Math.abs(c.steps[c.steps.length - 1].s - 0.5) < 1e-12, 'half never finished in the window');
  // From entry: half finished at 30 months.
  assert.equal(T.remainingMonths(c, 0, 0.5), 30);
  // A site that has waited 12 months: of the 8 left (S 0.8), half of those (S 0.4) never comes.
  assert.equal(T.remainingMonths(c, 12, 0.5), null, 'beyond the data');
  assert.equal(T.remainingMonths(c, 12, 0.75), 12, 'the fast quarter: S 0.6 at 24 months');
  // Finishing only counts the finished; a waiting site is censored, not finished.
  const all = T.survival([6, 12].map(t => ({ t, done: true })));
  assert.equal(all.steps[all.steps.length - 1].s, 0);
});

test('curves by stage and size, with the fallbacks; observations only from dated entries since 2016', () => {
  const p = (units, ms, phase = 'construction') => ({ units, phase, milestones: ms, records: [] });
  const obs = T.curveObservations([
    p(5, { permit: Date.UTC(2020, 0, 1), completed: Date.UTC(2021, 0, 1) }, 'completed'),
    p(5, { permit: Date.UTC(2015, 0, 1), completed: Date.UTC(2016, 6, 1) }, 'completed'),   // before 2016
    p(200, { permit: Date.UTC(2022, 0, 1) }),
    p(50, {}, 'completed'),                                                                     // no dates
    { ...p(5, { permit: Date.UTC(2020, 0, 1) }), phase: 'cancelled' },
  ], NOW);
  assert.deepEqual(obs.map(o => [o.stage, o.size, o.done]), [['permit', 'S', true], ['permit', 'L', false]]);
  assert.ok(Math.abs(obs[0].t - 12) < 0.1);
  const many = (stage, size, n) => Array.from({ length: n }, (_, i) => ({ stage, size, t: 10 + i, done: true }));
  const curves = T.stageCurves([...many('permit', 'S', 40), ...many('permit', 'L', 5), ...many('inception', 'S', 40)]);
  assert.equal(T.curveFor(curves, 'permit', 3), curves['permit|S']);
  assert.equal(T.curveFor(curves, 'permit', 300), curves['permit|*'], 'a thin size falls back to the stage');
  assert.equal(T.curveFor(curves, 'construction', 3), curves['permit|S'], 'construction falls back to permit');
  assert.equal(T.curveFor(curves, 'review', 3), curves['inception|S'], 'review falls back to inception');
  assert.equal(T.curveFor(curves, 'approved', 3), null);
});

test('homesNeeded: population growth over people per new home, split by the 2051 allocation; none when it falls', () => {
  const alloc = { A: { pop2021: 100, pop2051: 400, units2021: 0, units2051: 100 }, B: { pop2021: 0, pop2051: 300, units2021: 0, units2051: 100 } };
  const h = T.homesNeeded({ 2025: 1000, 2026: 900, 2027: 1350, 2028: 1700 }, alloc);
  assert.equal(h.ppu, 3);                                   // 600 people for 200 homes
  assert.deepEqual(h.share, { A: 0.5, B: 0.5 });
  assert.equal(h(null, 2026), 0, 'a falling year needs none');
  assert.equal(h(null, 2027), 150);
  assert.equal(h('A', 2027), 75);
  assert.equal(h(null, 2030), h(null, 2028), 'after the projection: its last rate');
  assert.equal(h(null, 2024), 0);
  assert.equal(T.homesNeeded(null, alloc), null);
  assert.equal(T.allocationPace(alloc, 'A'), 100 / 30);
  assert.equal(T.allocationPace(alloc), 200 / 30);
});

test('stageSchedules: timed sites from the wait; stalled ones fill the homes needed, furthest along and oldest first', () => {
  const steps = Array.from({ length: 40 }, (_, i) => ({ t: 12 + i * 0.1, done: true }));
  const curves = { 'permit|*': T.survival(steps), 'review|*': T.survival(Array.from({ length: 40 }, () => ({ t: 6, done: true }))) };
  const homes = () => 100;
  const items = [
    { key: 'timed', muni: 'A', btype: 'single', units: 50, stage: 'permit', stageDate: NOW },                 // ~12 months
    { key: 'old-review', muni: 'A', btype: 'single', units: 150, stage: 'review', stageDate: NOW - 60 * MO }, // beyond: queue
    { key: 'new-review', muni: 'A', btype: 'single', units: 80, stage: 'review', stageDate: NOW - 30 * MO },  // beyond, younger
    { key: 'built', muni: 'A', btype: 'single', units: 20, stage: 'construction', stageDate: NOW - 99 * MO }, // beyond, under construction
  ];
  const ss = T.stageSchedules(items, cal1, { curves, homes, now: NOW, years: 10 });
  const s = k => ss.sched.get(k).likely;
  assert.ok(Math.abs(sumOf(s('timed')) - 50) < 1e-9);
  assert.ok(s('timed')[2027] > s('timed')[2026], 'peaks a year on');
  // Under construction past the data finishes from next year, not in the queue.
  assert.equal(Math.min(...Object.keys(s('built')).map(Number)), 2026);   // (the kernel's year before)
  assert.ok(Math.abs(sumOf(s('built')) - 20) < 1e-9);
  // The queue: the older review first, at 100 a year (its own 250-a-year cap does not bind here).
  assert.deepEqual(s('old-review'), { 2026: 100, 2027: 50 });
  assert.deepEqual(s('new-review'), { 2027: 50, 2028: 30 });
  // The bands: a set's totals are its sites' schedules, and nothing is left for later here.
  const fc = T.bandsFromSchedules(items.filter(i => i.key !== 'timed'), ss);
  assert.ok(Math.abs(fc.total.likely - 250) < 1e-9);
  assert.equal(fc.after.likely, 0);
  assert.equal(fc.years[0].year, 2026);
  for (let i = 1; i < fc.years.length; i++) assert.ok(fc.years[i].cumLikely >= fc.years[i - 1].cumLikely);
});

test('stageSchedules: a large site finishes about 250 units a year; what the homes needed cannot take waits past the end', () => {
  const curves = { 'permit|*': T.survival(Array.from({ length: 40 }, () => ({ t: 1, done: true }))) };
  const big = { key: 'big', muni: 'A', btype: 'apartment', units: 1000, stage: 'permit', stageDate: NOW };
  const ss = T.stageSchedules([big], cal1, { curves, homes: () => 0, now: NOW, years: 25 });
  const yrs = ss.sched.get('big').likely, peak = Math.max(...Object.values(yrs));
  assert.ok(Math.abs(sumOf(yrs) - 1000) < 1e-9);
  assert.ok(peak <= 250 + 1e-9 && Object.keys(yrs).length >= 4, 'spread over the years');
  // A stalled site with no homes needed waits, and says so.
  const stuck = { key: 'stuck', muni: 'A', btype: 'single', units: 40, stage: 'review', stageDate: NOW - 200 * MO };
  const s2 = T.stageSchedules([stuck], cal1, { curves: {}, homes: () => 0, now: NOW, years: 5 });
  assert.equal(s2.sched.get('stuck'), undefined);
  assert.equal(s2.after.get('stuck').likely, 40);
  // No population data: nothing stalled is timed (the view says it is loading).
  const s3 = T.stageSchedules([stuck], cal1, { curves: {}, homes: null, now: NOW });
  assert.equal(s3.after.get('stuck').likely, 40);
});

test('wired: the view times every site, shows the set, and draws the homes-needed and allocation lines', () => {
  const s = src('js/timing.js');
  assert.match(s, /renderTiming\.ss = stageSchedules\(pipelineItems\(app\.state\.projects\), cal, \{ curves: stageCurves\(curveObservations\(app\.state\.projects, now\)\), homes, now \}\); \}\n    const ss = renderTiming\.ss;\n    const fc = bandsFromSchedules\(items, ss\);/);
  assert.match(s, /homesNeeded\(H && H\.mof && H\.mof\.peel, F && F\.municipalities\)/);
  assert.match(s, /if \(whole && homes\) refs\.push\(\{ cls: 'tband-ref-mof'/);
  assert.match(s, /paceByLayerHTML\(items, ss\)/);
  assert.match(s, /General|screening estimate/);
  const css = src('css/app.css');
  assert.match(css, /\.tband-ref\.tband-ref-mof \{ stroke: var\(--growth-4\);/);
});
