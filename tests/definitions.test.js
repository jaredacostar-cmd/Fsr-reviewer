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

test('committed: a development in review whose latest subdivision file is draft-approved or registered', () => {
  const draft = rec({ ref: '21T-24012C', phase: 'approved', statusRaw: 'Draft Approved', events: ev('2024-05-01') });
  const site = rec({ ref: 'SPA-2025-0001', phase: 'review', events: ev('2025-02-01') });
  assert.equal(D.isCommitted(dev('review', [draft, site])), true, 'draft plan approved, site plan in review: committed');
  const ozs = rec({ ref: 'OZS-2023-0010', phase: 'approved', description: 'Draft Plan of Subdivision | Zoning By Law Amendment — 300 units', events: ev('2024-01-01') });
  assert.equal(D.isCommitted(dev('review', [ozs])), true, 'Brampton OZS with a draft plan, approved');
  const old = rec({ ref: 'T05W15.004', phase: 'approved', events: ev('2016-01-01') });
  assert.equal(D.isCommitted(dev('inception', [old])), true, 'Brampton legacy T-file');
});

test('not committed: approved zoning alone, or land re-proposed by a newer subdivision file', () => {
  const zba = rec({ ref: 'OZS-2022-0001', phase: 'approved', description: 'Official Plan Amendment | Zoning By Law Amendment — a 12-storey building' });
  assert.equal(D.isCommitted(dev('review', [zba])), false, 'zoning approved, no subdivision: proposed (strict D-5-1)');
  const draft = rec({ ref: '21T-17008C', phase: 'approved', events: ev('2018-01-01') });
  const newer = rec({ ref: 'OZS-2026-0007', phase: 'review', description: 'Draft Plan of Subdivision | Zoning By Law Amendment — 5,146 units', events: ev('2026-02-01') });
  assert.equal(D.isCommitted(dev('review', [draft, newer])), false, 'a newer subdivision file in review re-proposes the land');
});

test('committed units and jobs follow the same rule', () => {
  const draft = rec({ ref: '21T-24012C', phase: 'approved', events: ev('2024-05-01') });
  assert.equal(D.unitsFor(dev('review', [draft]), 'committed'), 100);
  assert.equal(D.unitsFor(dev('review', []), 'committed'), 0);
  assert.equal(D.jobsFor(dev('review', [draft]), 50, 'committed'), 50);
});

test('the scenario cache key includes every switch that changes a result (diversion, basis, outside areas)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'masterplan.js'), 'utf8');
  const key = src.match(/function scenarioKey\(\) \{[^\n]+/)[0];
  for (const k of ['o.div', 'o.nr', 'state.basis', 'o.ww', 'o.md']) assert.ok(key.includes(k), `scenarioKey has ${k}`);
});
