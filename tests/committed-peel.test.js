'use strict';
// Phase 1A of the pipeline ledger (docs/pipeline-ledger-plan.md, D1): committed under the Peel rule
// (a building permit or a site servicing permit), next to MECP D-5-1, which stays as a named option.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const D = require('../js/demand.js');

const day = s => new Date(`${s}T00:00:00Z`);
// A building permit: the units it states (0: none stated), issued on a date.
const bp = (ref, units, date = '2024-03-01', extra = {}) => ({ kind: 'permit', ref, units, type: 'Residential', description: units ? `New apartment building, ${units} units` : 'New stacked townhouse dwelling', phase: 'permit', events: [{ phase: 'permit', date: day(date) }], ...extra });
const app = (ref, units) => ({ kind: 'application', ref, units, phase: 'approved', description: 'Site plan', events: [{ phase: 'approved', date: day('2023-01-01') }] });
const dev = (phase, units, permits = [], buildout = null) => ({
  key: `Brampton|${phase}-${units}-${permits.length}`, title: 'Site', municipality: 'Brampton', phase, units, records: [app('SP 1', units), ...permits],
  buildout: buildout || { planned: units, permitted: permits.reduce((t, r) => t + (r.units || 0), 0), completed: 0, unbuilt: units, remaining: units },
});
const counted = { bucket: 'counted', servicingApplied: '2024-01-10', evidence: [{ kind: 'site', ref: 'DRAIN 1', issued: '2024-02-01', services: ['water'] }] };

test('only a site servicing permit: committed, the whole development', () => {
  const p = dev('approved', 300);
  assert.equal(D.isCommittedPeel(p, counted), true);
  const c = D.committedPeelUnits(p, counted);
  assert.equal(c.units, 300); assert.equal(c.by, 'servicing'); assert.equal(c.estimated, false);
});

test('only a building permit: committed, but only the units it covers', () => {
  const p = dev('permit', 300, [bp('BP 24-100', 120)]);
  assert.equal(D.isCommittedPeel(p, { bucket: 'permitNoSvc' }), true);
  const c = D.committedPeelUnits(p, { bucket: 'permitNoSvc' });
  assert.equal(c.units, 120, 'the permit covers 120 of 300'); assert.equal(c.by, 'permits');
  assert.equal(c.left, 300);
  // (built units are not committed: they are on the system)
  const built = dev('construction', 300, [bp('BP 24-100', 120)], { planned: 300, permitted: 120, completed: 50, unbuilt: 250, remaining: 180 });
  assert.equal(D.committedPeelUnits(built, null).units, 70);
});

test('both permits: the servicing permit commits the whole development', () => {
  const p = dev('permit', 300, [bp('BP 24-100', 120)]);
  const c = D.committedPeelUnits(p, counted);
  assert.equal(c.units, 300); assert.equal(c.by, 'servicing'); assert.equal(c.permits, 1);
});

test('neither: approved under D-5-1, not committed under the Peel rule', () => {
  const p = dev('approved', 300);
  assert.equal(D.isCommitted(p), true, 'D-5-1: site plan approved');
  assert.equal(D.isCommittedPeel(p, { bucket: 'none' }), false);
  assert.equal(D.isCommittedPeel(p, null), false);
  assert.equal(D.committedPeelUnits(p, null).units, 0);
});

test('septic only: privately serviced, never committed (not even with a building permit)', () => {
  const p = dev('permit', 2, [bp('BP 24-7', 1)]);
  const septic = { bucket: 'private', evidence: [{ kind: 'septic' }] };
  assert.equal(D.isCommittedPeel(p, septic), false);
  assert.equal(D.committedPeelUnits(p, septic).units, 0);
  // Servicing permits for an existing building only do not count; a building permit still does.
  assert.equal(D.isCommittedPeel(dev('approved', 40), { bucket: 'existingOnly' }), false);
  assert.equal(D.isCommittedPeel(p, { bucket: 'existingOnly' }), true);
});

test('a permit stating no units: the development split evenly across its permits, flagged', () => {
  // Two buildings: one states 100 units, one states none; 300 planned → the blank one takes 300 / 2.
  const p = dev('permit', 300, [bp('BP 24-100', 100), bp('BP 24-200', 0)]);
  const c = D.committedPeelUnits(p, null);
  assert.equal(c.units, 250); assert.equal(c.estimated, true); assert.equal(c.blank, 1); assert.equal(c.permits, 2);
  // Never more than is left to build.
  const q = dev('permit', 100, [bp('BP 24-300', 0), bp('BP 24-400', 0)]);
  assert.equal(D.committedPeelUnits(q, null).units, 100);
});

test('cancelled and withdrawn permits do not commit; a withdrawn development never is', () => {
  const p = dev('approved', 300, [bp('BP 24-100', 120, '2024-03-01', { phase: 'cancelled' })]);
  assert.equal(D.isCommittedPeel(p, null), false);
  assert.equal(D.isCommittedPeel({ ...dev('cancelled', 10), phase: 'cancelled' }, counted), false);
});

test('D-5-1 stays a named option; the layer bar still uses it', () => {
  assert.equal(D.COMMIT_RULES.d51, 'MECP D-5-1');
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'layers.js'), 'utf8'), /approved: 'committed', permit: 'committed', construction: 'committed'/);
});

// The default "committed" of the Overview and the briefing (js/layers.js commit 'peel').
const LY = require('../js/layers.js');
const LG = require('../js/ledger.js');
const withLayers = (p, completed = 0) => ({ ...p, milestones: {}, types: [], description: '', buildout: { ...p.buildout, completed, unbuilt: p.units - completed } });

test('layers, Peel rule: committed is what the permits cover; the rest of D-5-1 is approved, not committed', () => {
  const p = withLayers(dev('permit', 300, [bp('BP 24-100', 120)]));
  const d51 = LY.ofDev(p), peel = LY.ofDev(p, { commit: 'peel' });
  assert.equal(d51.layer, 'committed'); assert.equal(d51.parts.committed, 300, 'D-5-1 stays the default');
  assert.equal(peel.layer, 'commitPeel');
  assert.deepEqual([peel.parts.commitPeel, peel.parts.approved, peel.parts.committed], [120, 180, 0]);
  // A servicing permit on a site still in review: committed before approval.
  const r = withLayers(dev('review', 80));
  const pr = LY.ofDev(r, { commit: 'peel', gateOf: () => counted });
  assert.deepEqual([pr.layer, pr.parts.commitPeel, pr.parts.proposed], ['commitPeel', 80, 0]);
  // Approved, no permit: approved, not committed.
  const a = LY.ofDev(withLayers(dev('approved', 50)), { commit: 'peel' });
  assert.deepEqual([a.layer, a.parts.approved, a.parts.commitPeel], ['approved', 50, 0]);
  // A servicing permit issued 3+ years ago, no building permit since: possibly lapsed, not committed.
  const old = { ...counted, evidence: [{ ...counted.evidence[0], issued: '2021-02-01' }] };
  const l = LY.ofDev(withLayers(dev('approved', 50)), { commit: 'peel', gateOf: () => old, asOf: Date.parse('2026-10-21') });
  assert.deepEqual([l.layer, l.parts.approved], ['approved', 50]);
  // Totals carry every stage under the rule, and add up to the units.
  const t = LY.totals([p, r], { commit: 'peel', gateOf: q => (q === r ? counted : null) });
  assert.deepEqual(Object.keys(t.units), ['existing', 'built', 'committed', 'commitPeel', 'approved', 'proposed', 'anticipated']);
  assert.equal(Object.values(t.units).reduce((s, v) => s + v, 0), 380);
});

test('real data: the Overview\'s committed (Peel rule) equals the ledger\'s', { skip: !require('./helpers/real-devs.js').available() }, () => {
  const { projects } = require('./helpers/real-devs.js').realDevs();
  const gate = require('../data/dc-gate.json'), by = new Map(gate.developments.map(r => [r.key, r]));
  const set = projects.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const asOf = Date.parse('2026-10-21T00:00:00Z'), gateOf = p => by.get(p.key);
  const t = LY.totals(set, { commit: 'peel', gateOf, asOf });
  const led = LG.totals(LG.rows(set, { gateOf, asOf }));
  assert.ok(Math.abs(t.units.commitPeel - led.units.committed) < 1e-6, `${t.units.commitPeel} vs ${led.units.committed}`);
  assert.ok(Math.abs(t.units.approved - led.units.approved) < 1e-6, `approved ${t.units.approved} vs ${led.units.approved}`);
});
