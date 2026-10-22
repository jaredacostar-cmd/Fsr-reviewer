'use strict';
// Phase 4 of the pipeline ledger (docs/pipeline-ledger-plan.md): one confidence tier per development,
// each rule and each flag, and the tiers reconcile to the committed and proposed totals.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/ledger.js');
const { realDevs, available } = require('./helpers/real-devs.js');

const day = s => new Date(`${s}T00:00:00Z`);
const AS_OF = Date.parse('2026-10-21T00:00:00Z');
let n = 0;
const app = (phase, extra = {}) => ({ kind: 'application', ref: `SP 25-${++n}`, type: 'Site Plan', stage: 'siteplan', units: 100, phase, events: [{ phase, date: day('2025-06-01') }], ...extra });
const bp = (date, extra = {}) => ({ kind: 'permit', ref: `BP 25-${++n}`, units: 100, type: 'Residential', description: 'New apartment building, 100 units', phase: 'permit', events: [{ phase: 'permit', date: day(date) }], ...extra });
const dev = (phase, records, extra = {}) => {
  const last = Math.max(...records.flatMap(r => r.events.map(e => +e.date)));
  const permitted = records.filter(r => r.kind === 'permit').reduce((t, r) => t + r.units, 0);
  return { key: `Mississauga|${++n}`, title: `Site ${n}`, municipality: 'Mississauga', phase, units: 100, records, types: [], description: '', milestones: {}, sp: [], last: new Date(last),
    buildout: { planned: 100, permitted, completed: 0, unbuilt: 100, remaining: 100 - permitted }, ...extra };
};
const ssp = issued => ({ bucket: 'counted', servicingApplied: issued, evidence: [{ kind: 'site', ref: 'DRAIN 1', issued, services: ['water'] }] });
const tierOf = (p, gate = null) => L.rows([p], { gateOf: () => gate, asOf: AS_OF })[0].confidence;

test('A Underway: a building permit, and the permits’ history says it is being built', () => {
  // A permit issued last year with inspections recorded: under construction.
  const p = dev('construction', [app('approved'), bp('2025-09-01', { phase: 'construction', events: [{ phase: 'permit', date: day('2025-09-01') }, { phase: 'construction', date: day('2026-03-01') }] })]);
  const c = tierOf(p);
  assert.equal(c.tier, 'A'); assert.equal(c.ground, 'building');
});

test('B Committed: a building or site servicing permit, not (yet) shown under way', () => {
  assert.equal(tierOf(dev('approved', [app('approved')]), ssp('2025-08-01')).tier, 'B', 'site servicing permit');
  const c = tierOf(dev('approved', [app('approved')]), ssp('2025-08-01'));
  assert.deepEqual(c.reasons, ['a site servicing permit']);
});

test('C Approved, not committed; D In review; E Early', () => {
  assert.equal(tierOf(dev('approved', [app('approved')])).tier, 'C');
  assert.equal(tierOf(dev('review', [app('review')])).tier, 'D');
  assert.equal(tierOf(dev('inception', [app('inception', { stage: 'precon', ref: 'PRE 25-1', type: 'Pre-consultation' })])).tier, 'E');
  // An official plan amendment only is early, not in review.
  const opa = dev('review', [app('review', { stage: 'master', ref: 'POPA 2025-0012', type: 'Official plan amendment', description: 'Official plan amendment' })]);
  assert.equal(L.opaOnly(opa), true);
  const c = tierOf(opa);
  assert.equal(c.tier, 'E'); assert.deepEqual(c.reasons, ['an official plan amendment only']);
});

test('flags lower the tier one step (once), and each is listed', () => {
  // No file activity in 3 years.
  const quiet = dev('approved', [app('approved', { events: [{ phase: 'approved', date: day('2022-01-10') }] })]);
  const q = tierOf(quiet);
  assert.equal(q.base, 'C'); assert.equal(q.tier, 'D'); assert.match(q.flags[0], /no file activity since 2022-01-10/);
  // A superseded plan.
  const s = tierOf(dev('review', [app('review', { superseded: true })]));
  assert.deepEqual([s.base, s.tier], ['D', 'E']); assert.match(s.flags[0], /supersedes/);
  // A site servicing permit out of order.
  const o = tierOf(dev('approved', [app('approved')]), { ...ssp('2025-08-01'), outOfOrder: [{ ref: 'DRAIN 0', reason: 'filed before the formal application' }] });
  assert.deepEqual([o.base, o.tier], ['B', 'C']); assert.match(o.flags[0], /out of order/);
  // A possibly lapsed servicing permit (D1): the same one step.
  const l = tierOf(dev('approved', [app('approved')]), ssp('2022-05-01'));
  assert.deepEqual([l.base, l.tier], ['B', 'C']); assert.match(l.flags.join(), /possibly lapsed/);
  // Two flags: still one step; E never goes lower.
  const two = tierOf(dev('review', [app('review', { superseded: true, events: [{ phase: 'review', date: day('2020-01-01') }] })]));
  assert.equal(two.flags.length, 2); assert.equal(two.tier, 'E');
});

test('totals carry the tiers; the base tiers reconcile to committed and proposed', () => {
  const rows = L.rows([dev('approved', [app('approved')]), dev('review', [app('review')]), dev('approved', [app('approved')])], { gateOf: p => (p.key.endsWith(String(n)) ? ssp('2025-08-01') : null), asOf: AS_OF });
  const t = L.totals(rows);
  assert.equal(Object.values(t.tiers).reduce((s, x) => s + x.rows, 0), rows.length, 'every row has one tier');
  assert.equal(t.tiers.A.base + t.tiers.B.base, rows.filter(r => r.committedPeel).length, 'A + B: committed');
});

test('real data: the base tiers reconcile to committed (Peel rule), approved (D-5-1) and proposed', { skip: !available() }, () => {
  const { projects } = realDevs();
  const gate = require('../data/dc-gate.json'), by = new Map(gate.developments.map(r => [r.key, r]));
  const set = projects.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const rows = L.rows(set, { gateOf: p => by.get(p.key), asOf: AS_OF }), t = L.totals(rows);
  assert.equal(t.tiers.A.base + t.tiers.B.base, rows.filter(r => r.committedPeel).length, 'A + B = committed (Peel rule)');
  assert.equal(t.tiers.C.base, rows.filter(r => !r.committedPeel && r.committedD51).length, 'C = approved under D-5-1, no permit');
  assert.equal(t.tiers.D.base + t.tiers.E.base, rows.filter(r => !r.committedPeel && !r.committedD51).length, 'D + E = proposed');
  assert.ok(Math.abs(Object.values(t.tiers).reduce((s, x) => s + x.left, 0) - t.left) < 1e-6, 'every unit left to build is in a tier');
  for (const r of rows) assert.ok(L.TIERS.findIndex(x => x.key === r.confidence.tier) - L.TIERS.findIndex(x => x.key === r.confidence.base) === (r.confidence.flags.length ? (r.confidence.base === 'E' ? 0 : 1) : 0), r.id);
  assert.ok(t.tiers.A.rows > 0 && t.tiers.E.rows > 0);
});
