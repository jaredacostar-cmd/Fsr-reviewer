'use strict';
// The commitment ladder (js/layers.js LADDER, rungsOf; docs/ledger/commitment-ladder.md): one ordered set
// of rungs, a development's units left to build on the highest rung they have reached.
const test = require('node:test');
const assert = require('node:assert/strict');
const LY = require('../js/layers.js');
const LG = require('../js/ledger.js');

const day = s => new Date(`${s}T00:00:00Z`);
const bp = (ref, units, date = '2024-03-01') => ({ kind: 'permit', ref, units, type: 'Residential', description: `New apartment building, ${units} units`, phase: 'permit', events: [{ phase: 'permit', date: day(date) }] });
const app = (ref, units, phase = 'approved') => ({ kind: 'application', ref, units, phase, description: 'Site plan', events: [{ phase, date: day('2023-01-01') }] });
let n = 0;
const dev = (phase, units, permits = [], extra = {}) => ({
  key: `Brampton|${n++}`, title: 'Site', municipality: 'Brampton', phase, units, milestones: {}, types: [], description: '', records: [app('SP 1', units, phase === 'approved' || phase === 'permit' ? 'approved' : 'review'), ...permits],
  buildout: { planned: units, permitted: permits.reduce((t, r) => t + (r.units || 0), 0), completed: 0, unbuilt: units, remaining: units }, ...extra,
});
const counted = { bucket: 'counted', servicingApplied: '2024-01-10', evidence: [{ kind: 'site', ref: 'DRAIN 1', issued: '2024-02-01', services: ['water'] }] };
const asOf = Date.parse('2026-10-21T00:00:00Z');
const on = (p, gate = null) => LY.rungsOf(p, { gateOf: () => gate, asOf });
const only = R => Object.fromEntries(Object.entries(R.rungs).filter(([, v]) => v > 0));

test('the rungs, in order, and which ones are committed', () => {
  assert.deepEqual(LY.LADDER.map(r => r.label), ['Pre-application', 'In review', 'Zoning approved', 'Plan approved', 'Servicing permit', 'Building permit', 'Under construction']);
  assert.deepEqual(LY.COMMITTED_RUNGS, ['servicing', 'building', 'construction']);
  assert.equal(LY.throughText('servicing'), 'counting through: Servicing permit (committed, the Peel rule)');
  assert.equal(LY.throughText('plan'), 'counting through: Plan approved (MECP D-5-1)');
});

test('planning rungs: pre-application, in review, zoning approved, plan approved', () => {
  assert.deepEqual(only(on(dev('inception', 40))), { early: 40 });
  assert.deepEqual(only(on(dev('review', 40))), { review: 40 });
  assert.deepEqual(only(on(dev('review', 40, [], { zoningApproved: { bylaws: ['ZBL 1'] } }))), { zoning: 40 });
  const a = on(dev('approved', 40));
  assert.deepEqual(only(a), { plan: 40 }); assert.equal(a.planApproved, true); assert.equal(a.committed, 0);
});

test('a building permit lifts only its units; a servicing permit the whole development', () => {
  const b = on(dev('permit', 300, [bp('BP 1', 120)]));
  assert.deepEqual([b.rungs.plan, b.rungs.building + b.rungs.construction], [180, 120]);
  assert.equal(b.committed, 120); assert.equal(b.top, 'plan', 'the rung with most of its units');
  const s = on(dev('permit', 300, [bp('BP 1', 120)]), counted);
  assert.deepEqual([s.rungs.servicing, s.rungs.building + s.rungs.construction, s.rungs.plan], [180, 120, 0]);
  assert.equal(s.committed, 300);
});

test('a permit before the plan approval: committed, not MECP D-5-1', () => {
  const r = on(dev('review', 80), counted);
  assert.deepEqual(only(r), { servicing: 80 });
  assert.equal(r.planApproved, false); assert.equal(r.permitAhead, 80);
  // A possibly lapsed servicing permit commits nothing: back on its planning rung.
  const old = { ...counted, evidence: [{ ...counted.evidence[0], issued: '2021-02-01' }] };
  assert.deepEqual(only(on(dev('review', 80), old)), { review: 80 });
});

test('totals: a split site counts its share; D-5-1 = plan approved whatever the permits', () => {
  const a = dev('approved', 100), b = dev('review', 80);
  const t = LY.ladderTotals([{ p: a, share: 0.5 }, b], { gateOf: p => (p === b ? counted : null), asOf });
  assert.deepEqual([t.rungs.plan, t.rungs.servicing, t.committed, t.planApproved, t.permitAhead, t.left], [50, 80, 80, 50, 80, 130]);
});

test('real data: the ladder reconciles with the ledger and with MECP D-5-1', { skip: !require('./helpers/real-devs.js').available() }, () => {
  const { projects } = require('./helpers/real-devs.js').realDevs();
  const gate = require('../data/dc-gate.json'), by = new Map(gate.developments.map(r => [r.key, r]));
  const gateOf = p => by.get(p.key), set = projects.filter(p => p.phase !== 'cancelled');
  const t = LY.ladderTotals(set, { gateOf, asOf }), led = LG.totals(LG.rows(set, { gateOf, asOf }));
  const close = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);
  close(LY.COMMITTED_RUNGS.reduce((s, k) => s + t.rungs[k], 0), led.units.committed, 'committed = the ledger\'s');
  close(t.rungs.plan, led.units.approved, 'plan approved = the ledger\'s approved, not committed');
  close(Object.values(t.rungs).reduce((s, v) => s + v, 0), led.left, 'every unit left to build on one rung');
  close(t.planApproved, set.reduce((s, p) => s + (LY.ofDev(p).parts.committed || 0), 0), 'D-5-1 = the layers\' committed');
  close(t.planApproved + t.permitAhead, led.units.committed + led.units.approved, 'committed + approved = D-5-1 + permits ahead of approval');
});

test('a development\'s rung on the map and in Counts as: the rung with most of its units; built and on the system once none are left', () => {
  assert.deepEqual(LY.RUNG_VIEW.map(r => r.key), ['early', 'review', 'zoning', 'plan', 'servicing', 'building', 'construction', 'built', 'existing']);
  assert.ok(LY.RUNG_VIEW.every(r => LY.RUNG_COLOR[r.key]), 'every rung has a colour');
  assert.equal(LY.rungKeyOf(dev('permit', 300, [bp('BP 1', 120)]), { asOf }), 'plan');
  assert.equal(LY.rungKeyOf(dev('review', 80), { gateOf: () => counted, asOf }), 'servicing');
  assert.equal(LY.rungKeyOf({ ...dev('cancelled', 10), phase: 'cancelled' }), null);
});

test('no units stated: its rung from its stage and permits alone', () => {
  const none = (phase, permits = [], extra = {}) => ({ ...dev(phase, 0, permits, extra), buildout: null });
  assert.equal(LY.rungKeyOf(none('inception')), 'early');
  assert.equal(LY.rungKeyOf(none('review')), 'review');
  assert.equal(LY.rungKeyOf(none('review', [], { zoningApproved: { bylaws: ['ZBL 1'] } })), 'zoning');
  assert.equal(LY.rungKeyOf(none('approved')), 'plan');
  assert.equal(LY.rungKeyOf(none('review'), { gateOf: () => counted, asOf }), 'servicing');
  assert.equal(LY.rungKeyOf(none('permit', [bp('BP 1', 0)])), 'building');
});
