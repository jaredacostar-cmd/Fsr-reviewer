'use strict';
// One definitions table (design audit, Group 1): committed follows MECP Procedure D-5-1.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../js/demand.js');

const ev = d => [{ date: new Date(`${d}T00:00:00Z`), phase: 'review', label: 'Submitted' }];
const rec = o => ({ kind: 'application', ref: 'X', description: '', phase: 'review', events: ev('2022-01-01'), ...o });
const dev = (phase, records) => ({ key: 'k', phase, records, buildout: { planned: 100, permitted: 0, completed: 0, remaining: 100, unbuilt: 100 }, units: 100 });

test('committed: the committed phases (site plan approved, permit, construction)', () => {
  for (const ph of ['approved', 'permit', 'construction']) assert.equal(D.isCommitted(dev(ph, [])), true, ph);
  for (const ph of ['inception', 'review', 'completed', 'cancelled']) assert.equal(D.isCommitted(dev(ph, [])), false, ph);
});

// The phase carries the rule (SPEC §2: one definition with js/layers.js). The developments are
// built by js/phases.js mergeProject, as in the app.
const P = require('../js/phases.js');
const evs = (...xs) => xs.map(([d, phase, label]) => ({ date: new Date(`${d}T00:00:00Z`), phase, label }));
const app = o => ({ kind: 'application', municipality: 'Brampton', sourceName: 'Brampton', address: '1 MAIN ST', ref: 'X', description: '', type: '', statusRaw: '', units: 100, props: {}, phase: 'review', events: evs(['2022-01-01', 'review', 'Submitted']), ...o });
const merged = recs => P.mergeProject('k', recs);

test('committed: a draft plan approved (a site plan still in review), an OZS with a draft plan approved', () => {
  const draft = app({ ref: '21T-24012C', phase: 'approved', statusRaw: 'Draft Approved', description: 'Draft Plan of Subdivision', events: evs(['2023-01-01', 'review', 'Submitted'], ['2024-05-01', 'approved', 'Draft Approved']) });
  const site = app({ ref: 'SPA-2025-0001', phase: 'review', events: evs(['2025-02-01', 'review', 'Submitted']) });
  assert.equal(D.isCommitted(merged([draft, site])), true, 'draft plan approved, site plan in review: committed');
  const ozs = app({ ref: 'OZS-2023-0010', phase: 'approved', description: 'Draft Plan of Subdivision | Zoning By Law Amendment — 300 units', events: evs(['2023-01-01', 'review', 'Submitted'], ['2024-01-01', 'approved', 'Approved']) });
  assert.equal(D.isCommitted(merged([ozs])), true, 'Brampton OZS with a draft plan, approved');
});

test('not committed: approved zoning alone, a Brampton T-file read as zoning, land re-proposed by a newer file', () => {
  const zba = app({ ref: 'OZS-2022-0001', phase: 'approved', description: 'Official Plan Amendment | Zoning By Law Amendment — a 12-storey building', events: evs(['2022-01-01', 'review', 'Submitted'], ['2023-01-01', 'approved', 'Approved']) });
  assert.equal(D.isCommitted(merged([zba])), false, 'zoning approved, no subdivision: proposed (strict D-5-1)');
  // "T" is the Toronto Gore township grid, not a subdivision: the description decides.
  const t = app({ ref: 'T01W14.010', phase: 'approved', description: 'Zoning By-law Amendment', events: evs(['2015-01-01', 'review', 'Submitted'], ['2016-01-01', 'approved', 'Approved']) });
  assert.equal(D.isCommitted(merged([t])), false, 'Brampton T-file for zoning');
  const draft = app({ ref: '21T-17008C', phase: 'approved', description: 'Draft Plan of Subdivision', events: evs(['2017-01-01', 'review', 'Submitted'], ['2018-01-01', 'approved', 'Draft Approved']) });
  const newer = app({ ref: 'OZS-2026-0007', phase: 'review', description: 'Draft Plan of Subdivision | Zoning By Law Amendment — 5,146 units', events: evs(['2026-02-01', 'review', 'Submitted']) });
  assert.equal(D.isCommitted(merged([draft, newer])), false, 'a newer subdivision file in review re-proposes the land');
});

test('committed units and jobs follow the same rule', () => {
  assert.equal(D.unitsFor(dev('approved', []), 'committed'), 100);
  assert.equal(D.unitsFor(dev('review', []), 'committed'), 0);
  assert.equal(D.jobsFor(dev('approved', []), 50, 'committed'), 50);
  assert.equal(D.jobsFor(dev('review', []), 50, 'committed'), 0);
});

test('the scenario cache key includes every switch that changes a result (diversion, basis, outside areas)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'masterplan.js'), 'utf8');
  const key = src.match(/function scenarioKey\(\) \{[^\n]+/)[0];
  for (const k of ['o.div', 'o.nr', 'state.basis', 'o.ww', 'o.md']) assert.ok(key.includes(k), `scenarioKey has ${k}`);
});
