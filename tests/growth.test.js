'use strict';
/* Growth-tab merge tests (Phase 4): the pipeline buckets, completions-per-year and
 * approval-pace logic that moved out of the old Demand tab into js/growth.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/growth.js');

const proj = o => ({ key: 'k', municipality: 'Mississauga', phase: 'review', records: [], ...o });

// completedAt shaped like PeelAreas.completedAt: recorded date, else issue+12mo.
const completedAt = r => {
  const done = (r.events || []).filter(e => e.phase === 'completed').map(e => +e.date);
  if (done.length) return { date: Math.max(...done), estimated: false };
  const issued = (r.events || []).filter(e => e.phase === 'permit').map(e => +e.date);
  if (!issued.length) return null;
  return { date: Math.min(...issued) + 12 * 30.44 * 864e5, estimated: true };
};
// permitUnits shaped like P.permitUnits: de-dupe by fileKey, take the max.
const permitUnits = rs => {
  const byKey = new Map();
  for (const r of rs) byKey.set(r.fileKey || r.ref, Math.max(byKey.get(r.fileKey || r.ref) || 0, r.units || 0));
  let t = 0; for (const v of byKey.values()) t += v;
  return t;
};
const deps = { completedAt, permitUnits };

test('pipelineTotals: one definition — every development with units, counted once, net of demolitions', () => {
  const t = G.pipelineTotals([
    proj({ units: 100, buildout: { planned: 100, permitted: 60, completed: 20, remaining: 40 } }),
    proj({ units: 50, buildout: { planned: 50, permitted: 50, completed: 50, remaining: 0 } }),
    proj({ phase: 'completed', units: 8 }),   // no build-out: counted by its stage (permitted, completed)
    proj({ phase: 'review', units: 30 }),     // no build-out, not permitted: left to build
    proj({ phase: 'cancelled', units: 99 }),  // withdrawn: not counted
    proj({ phase: 'review' }),                // no units: not counted
  ]);
  assert.equal(t.n, 4);
  assert.equal(t.withBuildout, 2);
  assert.equal(t.planned, 188);
  assert.equal(t.permitted, 118);
  assert.equal(t.completed, 78);
  assert.equal(t.left, 70);
  assert.deepEqual(G.pipelineTotals([]), { planned: 0, permitted: 0, completed: 0, left: 0, n: 0, withBuildout: 0 });
});

test('aggregateTypes sums dwelling types and employment space with injected deps', () => {
  const unitTypes = [{ key: 'single' }, { key: 'town' }, { key: 'apartment' }, { key: 'unknown' }];
  const typeBuildout = p => ({ rows: p._tb });
  const empOf = p => p._em || null;
  const { bt, emp } = G.aggregateTypes([
    proj({ buildout: {}, _tb: { single: { planned: 10, permitted: 4, completed: 2, left: 6 }, town: { planned: 0, permitted: 0, completed: 0, left: 0 }, apartment: { planned: 0, permitted: 0, completed: 0, left: 0 }, unknown: { planned: 0, permitted: 0, completed: 0, left: 0 } }, phase: 'permit', _em: { totalM2: 500, jobs: 12 } }),
    proj({ buildout: {}, _tb: { single: { planned: 5, permitted: 5, completed: 5, left: 0 }, town: { planned: 0, permitted: 0, completed: 0, left: 0 }, apartment: { planned: 0, permitted: 0, completed: 0, left: 0 }, unknown: { planned: 0, permitted: 0, completed: 0, left: 0 } }, phase: 'completed', _em: { totalM2: 200, jobs: 5 } }),
  ], { typeBuildout, unitTypes, empOf, permittedPhases: new Set(['permit', 'construction', 'completed']), completedPhases: new Set(['completed']) });
  assert.equal(bt.single.planned, 15);
  assert.equal(bt.single.permitted, 9);
  assert.equal(bt.single.completed, 7);
  assert.equal(bt.single.left, 6);
  assert.equal(emp.planned, 700);
  assert.equal(emp.permitted, 700);   // permit + completed phases
  assert.equal(emp.completed, 200);   // completed phase only
  assert.equal(emp.left, 0);
  assert.equal(emp.jobs, 17);
});

const permit = (year, units, fileKey = 'BP1', muni) => ({
  kind: 'permit', phase: 'completed', fileKey, units, ref: fileKey, municipality: muni,
  events: [{ date: Date.UTC(year, 5, 1), phase: 'completed' }],
});

test('completionStats groups completed units by year and municipality', () => {
  const s = G.completionStats([
    proj({ key: 'a', municipality: 'Mississauga', records: [permit(2021, 100), permit(2022, 50, 'BP2')] }),
    proj({ key: 'b', municipality: 'Brampton', records: [permit(2021, 200, 'BP9')] }),
    proj({ key: 'c', municipality: 'Caledon', phase: 'cancelled', records: [permit(2021, 999, 'BPX')] }),
  ], deps);
  assert.deepEqual(s.years.map(y => [y.year, y.units]), [[2021, 300], [2022, 50]]);
  assert.equal(s.years[0].projects, 2);
  assert.equal(s.estimated, 0);
  assert.equal(s.totalUnits, 350);
  const byM = Object.fromEntries(s.byMuni.map(r => [r.m, r]));
  assert.equal(byM.Mississauga.units, 150);
  assert.equal(byM.Mississauga.years, 2);
  assert.equal(byM.Mississauga.perYear, 75);
  assert.equal(byM.Brampton.perYear, 200);
  assert.ok(!byM.Caledon, 'cancelled projects are skipped');
});

test('completionStats estimates dates from issue date and de-dupes revised permits', () => {
  const s = G.completionStats([
    proj({ key: 'a', records: [
      { kind: 'permit', phase: 'completed', fileKey: 'BP1', units: 100, ref: 'BP1', events: [{ date: Date.UTC(2020, 0, 15), phase: 'permit' }] }, // estimated → 2021
      { kind: 'permit', phase: 'completed', fileKey: 'BP1', units: 120, ref: 'BP1-rev', events: [{ date: Date.UTC(2020, 0, 15), phase: 'permit' }] }, // same building, revised
    ] }),
  ], deps);
  assert.equal(s.estimated, 2);
  assert.equal(s.years.length, 1);
  assert.equal(s.years[0].year, 2021);
  assert.equal(s.years[0].units, 120, 'revised permit counts once, at the max units');
});

test('approvalLags measures inception to approval, dropping noise', () => {
  const d = y => Date.UTC(y, 0, 1);
  const lags = G.approvalLags([
    proj({ key: 'a', municipality: 'Mississauga', milestones: { inception: d(2020), approved: d(2022) } }),
    proj({ key: 'b', municipality: 'Mississauga', milestones: { inception: d(2021), approved: d(2021) } }), // no lag: dropped
    proj({ key: 'c', municipality: 'Brampton', milestones: { inception: d(2020) } }), // never approved: dropped
    proj({ key: 'd', municipality: 'Caledon', milestones: { inception: d(1980), approved: d(2022) } }), // 42y: noise
  ]);
  assert.equal(lags.length, 1);
  assert.ok(Math.abs(lags[0].months - 24) < 0.2, `got ${lags[0].months}`);
  assert.equal(lags[0].muni, 'Mississauga');
});

test('medianApprovalByMuni takes the median per municipality', () => {
  const r = G.medianApprovalByMuni([
    { muni: 'Mississauga', months: 12 }, { muni: 'Mississauga', months: 36 }, { muni: 'Mississauga', months: 24 },
    { muni: 'Brampton', months: 10 }, { muni: 'Brampton', months: 20 },
  ]);
  const byM = Object.fromEntries(r.map(x => [x.m, x]));
  assert.equal(byM.Mississauga.medianMonths, 24);
  assert.equal(byM.Mississauga.n, 3);
  assert.equal(byM.Brampton.medianMonths, 15);
  assert.equal(G.median([3, 1, 2]), 2);
  assert.equal(G.median([]), null);
});

test('wiring: js/growth.js loads before js/app.js', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const g = html.indexOf('js/growth.js'), a = html.indexOf('js/app.js');
  assert.ok(g > 0 && a > 0 && g < a, 'js/growth.js must load before js/app.js');
});
