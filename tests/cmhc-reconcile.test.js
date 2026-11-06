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
    assert.ok(r.suites <= r.all && r.est <= r.all + 1e-9, `${r.m} ${r.year}: diagnostics are parts of all`);
  }
});
