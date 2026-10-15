'use strict';
// Step C1: the plan roll-up (js/plan-rollup.js) — every parent equals the sum of its children,
// Peel equals the Overview, straddling developments split by area, the matrix reconciles.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const R = require('../js/plan-rollup.js');

const AREAS = [
  { id: 'bolton', name: 'Bolton', municipality: 'Caledon', kind: 'secondary plan', parent: null },
  { id: 'core', name: 'Bolton Core', municipality: 'Caledon', kind: 'secondary plan', parent: 'bolton' },
  { id: 'mayfield', name: 'Mayfield West', municipality: 'Caledon', kind: 'secondary plan', parent: null },
  { id: 'p1', name: 'Precinct 1', municipality: 'Caledon', kind: 'precinct', parent: 'mayfield' },
];
const dev = (key, units, extra = {}) => ({ key, municipality: 'Caledon', units, ...extra });
const measure = p => ({ planned: p.units, committed: p.c ? p.units : 0, proposed: p.c ? 0 : p.units, permitted: 0, completed: 0, left: p.units, people: p.units * 3, jobs: 0 });

test('a nested plan is a sub-level, counted once; the rest of its plan is shown', () => {
  const set = [dev('a', 100, { pt: ['core', 'bolton'] }), dev('b', 50, { pt: ['bolton'] })];
  const r = R.build(set, { areas: AREAS, pointOf: p => p.pt, measure });
  const bolton = r.nodes.get('a:bolton'), core = r.nodes.get('a:core');
  assert.equal(bolton.m.planned, 150, 'Bolton holds both, once');
  assert.equal(core.m.planned, 100);
  assert.equal(r.nodes.get('r:bolton').m.planned, 50, 'Elsewhere in Bolton');
  assert.equal(r.root.m.planned, 150, 'Peel counts each development once');
  for (const n of r.nodes.values()) assert.equal(Math.round(n.check.planned * 1e6), 0, n.id);
});

test('a development straddling two plans splits by area; the rest of it is "Not in a plan"', () => {
  const set = [dev('s', 200, { sh: [['bolton', 0.5], ['mayfield', 0.3]] }), dev('x', 10, { pt: [] })];
  const r = R.build(set, { areas: AREAS, sharesOf: p => p.sh || null, pointOf: p => p.pt || [], measure });
  assert.equal(r.nodes.get('a:bolton').m.planned, 100);
  assert.equal(r.nodes.get('a:mayfield').m.planned, 60);
  assert.equal(Math.round(r.nodes.get('n:Caledon').m.planned), 50, '20% of s and all of x');
  assert.equal(r.root.m.planned, 210);
  assert.equal(r.straddling.length, 1);
  for (const n of r.nodes.values()) assert.equal(Math.round(n.check.planned * 1e6), 0, n.id);
});

test('shares over 100% are scaled down; a precinct sits in its plan', () => {
  const set = [dev('o', 100, { sh: [['bolton', 0.8], ['mayfield', 0.6], ['p1', 0.9]] })];
  const r = R.build(set, { areas: AREAS, sharesOf: p => p.sh, measure });
  const b = r.nodes.get('a:bolton').m.planned, m = r.nodes.get('a:mayfield').m.planned;
  assert.ok(Math.abs(b + m - 100) < 1e-9, 'never more than the development');
  assert.ok(r.nodes.get('a:p1').m.planned <= m + 1e-9, 'a precinct within its plan');
  assert.equal(r.nodes.get('a:p1').parent, 'a:mayfield');
});

test('matrix: row totals equal the plan rows, column totals the servicing sums', () => {
  const set = [dev('a', 100, { pt: ['bolton'], pl: 'Lakeview' }), dev('b', 40, { sh: [['bolton', 0.5], ['mayfield', 0.5]], pl: 'Clarkson' }), dev('c', 5, { pt: [], pl: 'none' })];
  const r = R.build(set, { areas: AREAS, sharesOf: p => p.sh || null, pointOf: p => p.pt || [], measure });
  const mx = R.matrix(r, p => p.pl);
  for (const row of mx.rows) assert.ok(Math.abs(row.people - row.node.m.people) < 1e-6, row.node.id);
  assert.equal(mx.cols.get('Lakeview').people, 300); assert.equal(mx.cols.get('Clarkson').people, 120); assert.equal(mx.cols.get('none').people, 15);
  assert.ok(Math.abs([...mx.cols.values()].reduce((t, c) => t + c.people, 0) - r.root.m.people) < 1e-6);
});

// The real snapshot, regrouped into the trees: Peel equals the Overview's estimate.
test('real data: every check is 0 and Peel equals estimate(set)', async () => {
  const file = path.join(__dirname, '..', 'data', 'tree-counts.json');
  if (!fs.existsSync(file)) return;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  const { loadRecords } = require('../scripts/audit-tree.js');
  const data = await loadRecords(false);
  if (data.generatedAt !== d.snapshotAt) return;
  const P = require('../js/phases.js'), TG = require('../js/tree-groups.js'), TC = require('../js/tree-counts.js'), D = require('../js/demand.js'), G = require('../js/growth.js');
  TG.setData(d);
  const ps = P.buildProjects(data.records, { regroup: parts => TG.regroup(parts, { canonRef: P.canonRef, ringsArea: P.ringsArea }) });
  TC.apply(ps, { mode: 'tree', data: d, canonRef: P.canonRef });
  const set = ps.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const areas = d.areas;
  const r = R.build(set, {
    areas, sharesOf: p => { const x = TG.devOf(p.key); return x && x.a ? x.a.map(([i, s]) => [areas[i].id, s]) : null; }, pointOf: () => [],
    measure: p => { const t = G.pipelineTotals([p]), e = D.estimate([p]); const c = D.isCommitted(p) ? t.planned : 0; return { planned: t.planned, committed: c, proposed: t.planned - c, permitted: t.permitted, completed: t.completed, left: t.left, people: e.population, jobs: 0 }; },
  });
  for (const n of r.nodes.values()) { assert.ok(Math.abs(n.check.planned) < 1e-6, `${n.id} units`); assert.ok(Math.abs(n.check.people) < 1e-6, `${n.id} people`); }
  assert.ok(Math.abs(r.root.m.people - D.estimate(set).population) < 1e-3, 'Peel people = the Overview');
  assert.equal(Math.round(r.root.m.planned), G.pipelineTotals(set).planned, 'Peel units = the header');
  assert.ok(r.straddling.length > 0, 'straddling developments are found');
  assert.ok(r.nodes.has('a:sp:caledon:bolton-core') || [...r.nodes.values()].some(n => n.kind === 'subplan'), 'nested plans are sub-levels');
  TG.setData(null);
});
