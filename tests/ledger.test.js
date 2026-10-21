'use strict';
// Phase 1B of the pipeline ledger (docs/pipeline-ledger-plan.md): js/ledger.js rows and roll-up.
// Every parent equals the sum of its children; a development across two plans splits; a cancelled
// file is not in the ledger; possibly lapsed servicing permits are flagged and drop one step.
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/ledger.js');
const D = require('../js/demand.js');
const P = require('../js/phases.js');
const G = require('../js/growth.js');
const { realDevs, available } = require('./helpers/real-devs.js');

const day = s => new Date(`${s}T00:00:00Z`);
const AS_OF = Date.parse('2026-10-21T00:00:00Z');
const bp = (ref, units, date) => ({ kind: 'permit', ref, units, type: 'Residential', description: `New apartment building, ${units} units`, phase: 'permit', events: [{ phase: 'permit', date: day(date) }] });
let n = 0;
const dev = (muni, phase, units, extra = {}) => ({
  key: `${muni}|${++n}`, title: `Site ${n}`, municipality: muni, phase, units, lat: 43.7, lng: -79.7,
  records: [{ kind: 'application', ref: `SP ${n}`, units, phase: phase === 'review' ? 'review' : 'approved', events: [{ phase: 'review', date: day('2022-01-01') }] }, ...(extra.permits || [])],
  buildout: { planned: units, permitted: (extra.permits || []).reduce((t, r) => t + r.units, 0), completed: extra.completed || 0, unbuilt: units - (extra.completed || 0), remaining: units },
  milestones: {}, sp: extra.sp || [], types: [], description: '',
});
const ssp = (issued, extra = {}) => ({ bucket: 'counted', servicingApplied: issued, evidence: [{ kind: 'site', ref: 'DRAIN 1', issued, services: ['water'] }], ...extra });
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-6, `${what}: ${a} vs ${b}`);

test('rows: one per development with units left to build, split by capacity stage', () => {
  const a = dev('Brampton', 'permit', 300, { permits: [bp('BP 24-1', 100, '2025-01-01')] });
  const b = dev('Brampton', 'approved', 200);
  const c = dev('Caledon', 'review', 50);
  const d = dev('Caledon', 'inception', 20);
  const built = dev('Caledon', 'completed', 10, { completed: 10 });
  const gates = new Map([[b.key, ssp('2025-06-01')]]);
  const rs = L.rows([a, b, c, d, built], { gateOf: p => gates.get(p.key), people: p => P.unbuiltOf(p) * 3, asOf: AS_OF });
  assert.equal(rs.length, 4, 'built units are not in the ledger');
  const [ra, rb, rc, rd] = rs;
  assert.deepEqual(ra.units, { committed: 100, approved: 200, review: 0, early: 0 }, 'a building permit commits only its units');
  assert.deepEqual(rb.units, { committed: 200, approved: 0, review: 0, early: 0 }, 'a servicing permit commits the development');
  assert.deepEqual(rc.units, { committed: 0, approved: 0, review: 50, early: 0 });
  assert.deepEqual(rd.units, { committed: 0, approved: 0, review: 0, early: 20 });
  assert.equal(ra.committedD51, true); assert.equal(ra.committedPeel, true);
  assert.equal(ra.buildingPermit.firstIssued, '2025-01-01');
  assert.equal(rb.servicing.bucket, 'counted');
  for (const r of rs) near(Object.values(r.units).reduce((t, v) => t + v, 0), r.left, `${r.id} stages add up`);
});

test('roll-up: every parent equals the sum of its children, at every cut-off', () => {
  const set = [dev('Brampton', 'permit', 300, { permits: [bp('BP 24-1', 100, '2025-01-01')] }), dev('Brampton', 'approved', 200), dev('Caledon', 'review', 50), dev('Mississauga', 'inception', 20)];
  const yrs = [{ 2027: 1 }, { 2035: 2, 2045: 2 }, { 2050: 1 }, null];
  const rs = L.rows(set, { people: p => P.unbuiltOf(p) * 3, yearsOf: p => { const y = yrs[set.indexOf(p)]; return y ? { shares: L.bucketShares(y) } : null; }, asOf: AS_OF });
  const r = L.rollup(rs, 'municipality');
  assert.ok(r.check < 1e-9, 'check column is 0');
  near(L.sumOf(r.root.cells), 570, 'Peel = every unit left to build');
  near(L.sumOf(r.root.cells, { measure: 'people' }), 570 * 3, 'people');
  for (const cut of L.CUTOFFS) near(L.sumOf(r.root.cells, { cutoff: cut.key }), r.root.children.reduce((t, g) => t + L.sumOf(g.cells, { cutoff: cut.key }), 0), cut.key);
  for (const b of L.BUCKETS) near(L.sumOf(r.root.cells, { bucket: b.key }), r.root.children.reduce((t, g) => t + L.sumOf(g.cells, { bucket: b.key }), 0), b.key);
  near(L.sumOf(r.root.cells, { cutoff: 'committed' }), 100, 'committed only');
  near(L.sumOf(r.root.cells, { cutoff: 'approved' }), 500, '+ approved');
  near(L.sumOf(r.root.cells, { bucket: 'to2031' }), 300, 'the 2027 site');
  near(L.sumOf(r.root.cells, { bucket: 'to2041' }), 100, 'half the 200');
  near(L.sumOf(r.root.cells, { bucket: 'later' }), 20, 'not timed');
  // By zone and plant too.
  for (const by of ['zone', 'plant', 'plan']) assert.ok(L.rollup(rs, by).check < 1e-9, by);
});

test('a development split across two plans: each plan holds its share, Peel holds it once', () => {
  const s = dev('Caledon', 'approved', 200, { sp: ['mayfield', 'bolton'] });
  const t = dev('Caledon', 'review', 40, { sp: [] });
  const rs = L.rows([s, t], { plansOf: p => (p === s ? [['mayfield', 0.75], ['bolton', 0.25]] : []), asOf: AS_OF });
  const r = L.rollup(rs, 'plan', { names: id => ({ mayfield: 'Mayfield West', bolton: 'Bolton' })[id] });
  near(L.sumOf(r.groups.get('a:mayfield').cells), 150, 'Mayfield West');
  near(L.sumOf(r.groups.get('a:bolton').cells), 50, 'Bolton');
  near(L.sumOf(r.groups.get('n:Caledon').cells), 40, 'not in a plan');
  near(L.sumOf(r.root.cells), 240, 'Peel once');
  assert.equal(r.groups.get('a:mayfield').name, 'Mayfield West');
  assert.ok(r.check < 1e-9);
  // Default: p.sp split evenly.
  const even = L.rollup(L.rows([s], { asOf: AS_OF }), 'plan');
  near(L.sumOf(even.groups.get('a:mayfield').cells), 100, 'even split');
});

test('a cancelled file: a withdrawn development and its units are not in the ledger', () => {
  const live = dev('Brampton', 'approved', 100);
  const gone = { ...dev('Brampton', 'review', 500), phase: 'cancelled' };
  const rs = L.rows([live, gone], { asOf: AS_OF });
  assert.deepEqual(rs.map(r => r.id), [live.key]);
  near(L.totals(rs).left, 100, 'only the live one');
  // A cancelled building permit commits nothing.
  const p = dev('Brampton', 'approved', 100, { permits: [{ ...bp('BP 24-9', 100, '2025-01-01'), phase: 'cancelled' }] });
  assert.equal(L.rows([p], { asOf: AS_OF })[0].units.committed, 0);
});

test('possibly lapsed: a servicing permit issued 3+ years ago with no building permit since drops one step', () => {
  const old = dev('Mississauga', 'approved', 400);
  const r = L.rows([old], { gateOf: () => ssp('2022-05-01'), asOf: AS_OF })[0];
  assert.equal(r.lapsed.why, 'old'); assert.ok(r.lapsed.years >= 3);
  assert.deepEqual(r.units, { committed: 0, approved: 400, review: 0, early: 0 }, 'committed → approved, not committed');
  assert.equal(r.committedPeel, true, 'still committed by the rule; the flag is shown');
  // A building permit filed since: not lapsed.
  const moving = dev('Mississauga', 'permit', 400, { permits: [bp('BP 25-1', 100, '2025-02-01')] });
  assert.equal(L.rows([moving], { gateOf: () => ssp('2022-05-01'), asOf: AS_OF })[0].lapsed, null);
  // Issued under 3 years ago: not lapsed.
  assert.equal(L.rows([old], { gateOf: () => ssp('2024-05-01'), asOf: AS_OF })[0].lapsed, null);
  // Marked cancelled by the city (Brampton, Caledon): flagged; it never counted.
  const can = L.rows([dev('Brampton', 'approved', 60)], { gateOf: () => ({ bucket: 'permitNoSvc', evidence: [], cancelled: [{ ref: '20-201623-000-01', issued: '2020-09-11' }] }), asOf: AS_OF })[0];
  assert.equal(can.lapsed.why, 'cancelled'); assert.equal(can.units.committed, 0);
  const t = L.totals([r, can]);
  assert.equal(t.lapsed, 2); near(t.lapsedUnits, 460, 'lapsed units');
});

test('bucket shares: a forecast that times part of a site leaves the rest after 2051 or not timed', () => {
  const s = L.bucketShares({ 2030: 30, 2040: 20 }, 10, 100);
  near(s.to2031, 0.3, '2026 to 2031'); near(s.to2041, 0.2, '2032 to 2041'); near(s.to2051, 0, '2042 to 2051'); near(s.later, 0.5, 'later');
  near(Object.values(s).reduce((t, v) => t + v, 0), 1, 'shares add to 1');
  assert.deepEqual(L.bucketShares(null), { to2031: 0, to2041: 0, to2051: 0, later: 1 });
});

// The real snapshot: the ledger's Peel total equals Growth's left to build and the people at the
// 'remaining' basis, and every check is 0.
test('real data: Peel reconciles to Growth and the estimate; every check is 0', { skip: !available() }, () => {
  const { projects } = realDevs();
  const gate = require('../data/dc-gate.json'), by = new Map(gate.developments.map(r => [r.key, r]));
  const set = projects.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const rs = L.rows(set, { gateOf: p => by.get(p.key), people: p => D.estimate([p], D.DEFAULT_CRITERIA, 'remaining').population, plantOf: () => null, asOf: AS_OF });
  const t = L.totals(rs);
  assert.equal(Math.round(t.left), Math.round(G.pipelineTotals(set).left), 'units left to build = Growth');
  assert.ok(Math.abs(t.people - D.estimate(set, D.DEFAULT_CRITERIA, 'remaining').population) < 1e-3, 'people = the estimate');
  for (const k of ['municipality', 'plan']) {
    const r = L.rollup(rs, k);
    assert.ok(r.check < 1e-6, `${k} check`);
    assert.ok(Math.abs(L.sumOf(r.root.cells) - t.left) < 1e-3, `${k}: Peel = rows`);
  }
  // The Peel rule commits less than D-5-1 (approved sites with no permit are approved, not committed).
  const d51 = set.filter(p => D.isCommitted(p)).reduce((s, p) => s + P.unbuiltOf(p), 0);
  assert.ok(t.units.committed < d51, `${t.units.committed} < ${d51}`);
});
