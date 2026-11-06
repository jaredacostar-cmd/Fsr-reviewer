'use strict';
// Completions calibration, bucket 1 (docs/completions-calibration.md): the reconciliation of the
// app's completions with CMHC's. The baseline numbers live in the decision log, not here: the data
// refreshes weekly, so the tests hold how the numbers are made, not what they are.
const test = require('node:test');
const assert = require('node:assert');
const R = require('../scripts/cmhc-reconcile.js');

const permit = (ref, y, units, estimated = false) => ({ kind: 'permit', phase: 'completed', ref, units, y, estimated, events: [] });
const deps = { completedAt: r => ({ date: Date.UTC(r.y, 5, 1), estimated: r.estimated }), permitUnits: rs => rs.reduce((t, r) => t + r.units, 0), years: [2021, 2022] };
const cmhc = {
  Mississauga: { 2021: { completions: { all: 100 } }, 2022: { completions: { all: 50 } } },
  Brampton: { 2021: { completions: { all: 10 } }, 2022: { completions: { all: 10 } } },
  Caledon: { 2021: { completions: { all: 0 } } },
  Peel: { 2021: { completions: { all: 110 } }, 2022: { completions: { all: 60 } } },
};
const projects = [
  { key: 'a', municipality: 'Mississauga', phase: 'completed', kinds: ['application', 'permit'], records: [permit('A1', 2021, 60), permit('A2', 2022, 40), permit('A3', 2020, 99)] },
  { key: 'b', municipality: 'Mississauga', phase: 'completed', kinds: ['permit'], records: [permit('B1', 2021, 45)] },
  { key: 'c', municipality: 'Brampton', phase: 'completed', kinds: ['application', 'permit'], records: [permit('C1', 2022, 12, true)] },
  { key: 'x', municipality: 'Brampton', phase: 'cancelled', kinds: ['application', 'permit'], records: [permit('X1', 2021, 500)] },
];

test('all = application developments + other, by municipality and year; Peel adds them up', () => {
  const res = R.reconcile(projects, cmhc, deps);
  const get = (m, y) => res.rows.find(r => r.m === m && r.year === y);
  assert.deepEqual([get('Mississauga', 2021).app, get('Mississauga', 2021).other, get('Mississauga', 2021).all], [60, 45, 105]);
  assert.equal(get('Mississauga', 2022).all, 40, 'the 2020 completion is outside the years');
  assert.equal(get('Brampton', 2021).all, 0, 'a cancelled development counts nothing');
  assert.equal(get('Brampton', 2022).est, 12, 'estimated dates: a diagnostic part of all');
  for (const r of res.rows) assert.equal(r.all, r.app + r.other, `${r.m} ${r.year}`);
  for (const y of res.years) assert.equal(get('Peel', y).all, R.MUNIS.reduce((t, m) => t + get(m, y).all, 0));
});

test('suites added to an existing house are a line of their own, not in all (decision 8)', () => {
  const suite = { ...permit('SEC UNIT 22-1 SU', 2021, 1), type: 'RESIDENTIAL', description: 'RESIDENTIAL SECOND UNIT IN BASEMENT', unitsStated: 1 };
  const withSuite = [...projects, { key: 's', municipality: 'Mississauga', phase: 'completed', kinds: ['permit'], records: [suite] }];
  const r = R.reconcile(withSuite, cmhc, deps).rows.find(x => x.m === 'Mississauga' && x.year === 2021);
  assert.equal(require('../js/phases.js').permitRole(suite), 'suite');
  assert.deepEqual([r.all, r.suites], [105, 1]);
});

test('the gap is against CMHC, within ±10% or not; no CMHC figure, no gap', () => {
  const res = R.reconcile(projects, cmhc, deps), get = (m, y) => res.rows.find(r => r.m === m && r.year === y);
  assert.equal(get('Mississauga', 2021).gap, 0.05); assert.equal(get('Mississauga', 2021).within, true);
  assert.equal(get('Mississauga', 2022).gap, -0.2); assert.equal(get('Mississauga', 2022).within, false);
  assert.equal(get('Caledon', 2021).gap, null, 'CMHC 0: no gap'); assert.equal(get('Caledon', 2022).cmhc, null);
  const t = R.totals(res).find(x => x.m === 'Mississauga');
  assert.deepEqual([t.all, t.cmhc, t.yearsWithin, t.years], [145, 150, 1, 2]);
  assert.match(R.markdown(res), /\| 2021 \| 60 \| 45 \| \*\*105\*\* \| 100 \| \+5% ✓/);
});

test('the charter: calibration years 2021–2025, tolerance ±10%', () => {
  assert.deepEqual(R.YEARS, [2021, 2022, 2023, 2024, 2025]);
  assert.equal(R.TOLERANCE, 0.10);
});

test('real data: every municipality-year has a CMHC figure, and the split adds up', { skip: !require('./helpers/real-devs.js').available() }, () => {
  const { projects: real } = require('./helpers/real-devs.js').realDevs();
  const res = R.reconcile(real, require('../data/peel-housing.json').activity.muni, { nowYear: 2026 });
  assert.equal(res.rows.length, 4 * 5);
  for (const r of res.rows) {
    assert.ok(r.cmhc > 0, `CMHC ${r.m} ${r.year}`);
    assert.equal(r.all, r.app + r.other);
    assert.ok(r.est <= r.all + 1e-9, `${r.m} ${r.year}: estimated dates are part of all`);
  }
});

// ---- Bucket 2: a building filed in stages (Mississauga) ----------------------------------------------
const P = require('../js/phases.js');
const ev = (d, phase) => ({ date: new Date(d + 'T00:00:00Z'), phase, label: phase });
const raw = (ref, events, units = null) => ({ uid: ref, sourceId: 'mis', municipality: 'Mississauga', kind: 'permit', ref, units, phase: events.some(e => e.phase === 'completed') ? 'completed' : 'permit', events, address: '', type: '', description: '', statusRaw: '', props: {} });

test('a permit row is a stage (CON, CRn, FTR, FDN, SUP) or the full permit (no suffix, COM)', () => {
  for (const ref of ['BP 3NEW 17-4898 CON', 'BP 3NEW 17-4898 CR2', 'BP 3NEW 20-3001 FTR', 'BP 3NEW 20-3988 CR4']) assert.equal(P.permitPart(ref), 'stage', ref);
  for (const ref of ['BP 3NEW 17-4898', 'BP 3NEW 16-4285 COM', 'SEC UNIT 24-3708 ARU', '21-105020-000-00']) assert.equal(P.permitPart(ref), 'final', ref);
});

test('merging a building\'s rows keeps which completion closed a stage and which was the final sign-off', () => {
  const recs = [
    raw('BP 3NEW 17-4898 CON', [ev('2018-05-14', 'permit'), ev('2018-11-07', 'completed')], 600),
    raw('BP 3NEW 17-4898 CR1', [ev('2018-09-11', 'permit'), ev('2019-04-09', 'completed')]),
    raw('BP 3NEW 17-4898', [ev('2019-08-14', 'permit'), ev('2021-02-09', 'completed')]),
    raw('BP 3NEW 17-4898 CR2', [ev('2020-12-22', 'permit'), ev('2021-02-09', 'completed')]),   // closed the day of the final
  ];
  const [m] = P.dedupeRecords(recs);
  assert.deepEqual(m.events.filter(e => e.phase === 'completed').map(e => `${e.date.toISOString().slice(0, 10)}:${e.part}`), ['2018-11-07:stage', '2019-04-09:stage', '2021-02-09:final']);
  assert.equal(recs[0].events[1].part, undefined, 'the source events stay as loaded');
  assert.deepEqual(R.staged(m), { final: Date.UTC(2021, 1, 9), stage: Date.UTC(2019, 3, 9), fullOpen: false });
});

test('dating rules for a building filed in stages; other permits keep their date', () => {
  const [done] = P.dedupeRecords([raw('BP 3NEW 1-1 CON', [ev('2020-01-01', 'permit'), ev('2021-01-01', 'completed')], 300), raw('BP 3NEW 1-1', [ev('2021-06-01', 'permit'), ev('2024-03-01', 'completed')])]);
  const [open] = P.dedupeRecords([raw('BP 3NEW 2-2 CON', [ev('2020-01-01', 'permit'), ev('2022-05-15', 'completed')], 300), raw('BP 3NEW 2-2', [ev('2022-01-01', 'permit')])]);
  const [noFull] = P.dedupeRecords([raw('BP 3NEW 3-3 CON', [ev('2020-01-01', 'permit'), ev('2021-01-01', 'completed')], 300), raw('BP 3NEW 3-3 CR4', [ev('2022-01-01', 'permit'), ev('2023-12-14', 'completed')])]);
  const house = raw('BP 9NEW 22-5075', [ev('2022-01-01', 'permit'), ev('2023-02-01', 'completed')], 1);
  const y = (rule, k, r) => { const c = R.datingRule(rule, k)(r); return c && new Date(c.date).toISOString().slice(0, 7); };
  assert.deepEqual([y('A', 0, done), y('A', 12, done), y('A', 0, open), y('A', 0, noFull)], ['2024-03', '2023-03', null, '2023-12'], 'A: final sign-off less the lead; open: not yet');
  assert.deepEqual([y('B', 0, done), y('B', 0, open)], ['2021-01', '2022-05'], 'B: last stage closure');
  assert.deepEqual([y('C', 24, done), y('C', 24, open), y('C', 24, noFull)], ['2024-03', '2024-05', '2025-12'], 'C: final, else last stage + lag');
  for (const rule of ['A', 'B', 'C']) assert.equal(y(rule, 12, house), '2023-02', `${rule}: a permit not filed in stages keeps its date`);
});
