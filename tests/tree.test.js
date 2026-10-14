'use strict';
// js/tree.js — role classification, containment links and the proposed unit count (Step A, audit only).
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/tree.js');

// A rectangle (lng/lat) as polygon rings; x0..x1 / y0..y1 in thousandths of a degree from a Peel origin.
const X = -79.70, Y = 43.70, K = 0.001;
const box = (x0, y0, x1, y1) => [[[X + x0 * K, Y + y0 * K], [X + x1 * K, Y + y0 * K], [X + x1 * K, Y + y1 * K], [X + x0 * K, Y + y1 * K], [X + x0 * K, Y + y0 * K]]];
let uid = 0;
const ev = d => [{ date: new Date(`${d}T00:00:00Z`), phase: 'review', label: 'Submitted' }];
function app(o) {
  const poly = o.poly || null;
  const c = poly ? [(poly[0][0][0] + poly[0][2][0]) / 2, (poly[0][0][1] + poly[0][2][1]) / 2] : [X, Y];
  return { uid: `u${++uid}`, kind: 'application', municipality: 'Brampton', sourceId: 'bra-siteplan/11', ref: `F-${uid}`, type: '', description: '', address: '', phase: 'review', units: null, events: ev(o.date || '2022-01-01'), lat: c[1], lng: c[0], ...o, poly };
}
const run = recs => { const nodes = T.fileNodes(recs); const b = T.buildTrees(nodes); return { ...b, nodeByRef: ref => nodes.find(n => n.refs.includes(ref)), treeOf: ref => b.trees.find(t => t.nodes.some(i => nodes[i].refs.includes(ref))) }; };
const linkOf = (b, ref) => b.links.find(l => l.type === 'parent' && l.child === b.nodeByRef(ref).id);

test('roles: Brampton OZS with and without a draft plan of subdivision', () => {
  const withDraft = T.classifyRole({ kind: 'application', municipality: 'Brampton', sourceId: 'bra-opa-zba-sub/9', ref: 'OZS-2024-0001', description: 'Draft Plan of Subdivision | Zoning By Law Amendment — 47 single detached lots' });
  assert.equal(withDraft.role, 'land_division');
  assert.deepEqual(withDraft.roles.sort(), ['land_division', 'use']);
  const useOnly = T.classifyRole({ kind: 'application', municipality: 'Brampton', sourceId: 'bra-opa-zba-sub/9', ref: 'OZS-2024-0002', description: 'Official Plan Amendment | Zoning By Law Amendment — a 12-storey building' });
  assert.equal(useOnly.role, 'use');
  assert.deepEqual(useOnly.roles, ['use']);
  const block = T.classifyRole({ kind: 'application', municipality: 'Brampton', sourceId: 'bra-opa-zba-sub/9', ref: 'OZS-2024-0003', description: 'Block Plan Amendment | Official Plan Amendment — Block 51-1' });
  assert.equal(block.role, 'block_plan');
  assert.match(useOnly.reason, /OZS/);
});

test('roles: Caledon by type; Brampton by layer; permits', () => {
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Caledon', type: 'Plan of subdivision' }).role, 'land_division');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Caledon', type: 'Consent' }).role, 'land_division');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Caledon', type: 'Zoning by-law amendment' }).role, 'use');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Caledon', type: 'Plan of condominium' }).role, 'condo');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Brampton', sourceId: 'bra-precon/10', ref: 'PRE-2024-1' }).role, 'precon');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Brampton', sourceId: 'bra-dps/6', ref: 'DPS-1' }).role, 'site_plan');
  assert.equal(T.classifyRole({ kind: 'permit', municipality: 'Brampton' }).role, 'permit');
});

test('roles: Mississauga place categories in the type field are reclassified from the file prefix', () => {
  const oz = T.classifyRole({ kind: 'application', municipality: 'Mississauga', sourceId: 'mis-gm-devapps/0', ref: 'OZ/OPA 26 10', type: 'Neighbourhood' });
  assert.equal(oz.role, 'use');
  assert.ok(oz.reclassified && /Neighbourhood/.test(oz.reclassified.reason));
  const sp = T.classifyRole({ kind: 'application', municipality: 'Mississauga', sourceId: 'mis-gm-devapps/0', ref: 'SP 26 20', type: 'Growth Node' });
  assert.equal(sp.role, 'site_plan');
  assert.ok(sp.reclassified);
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Mississauga', sourceId: 'mis-devapps/6', ref: '21T-M 21-4', type: 'SUBDIVISION' }).role, 'land_division');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Mississauga', ref: '21CDM-M 25-1', type: 'CONDOMINIUM' }).role, 'condo');
  assert.equal(T.classifyRole({ kind: 'application', municipality: 'Mississauga', ref: 'SP 22/104', type: 'SITE PLAN' }).reclassified, undefined);
});

test('same file number merges into one node', () => {
  const recs = [app({ ref: 'SP 22-60', fileKey: 'SP2260', poly: box(0, 0, 2, 2), units: 40 }), app({ ref: 'SP 22/060', fileKey: 'SP2260', poly: box(0, 0, 2, 2), units: 40 })];
  const nodes = T.fileNodes(recs);
  assert.equal(nodes.length, 1);
  assert.match(nodes[0].merged, /2 records/);
});

test('block plan ⊃ draft plans ⊃ site plans; the children covering ≥ 90% are counted', () => {
  const recs = [
    app({ ref: 'BLOCK', sourceId: 'bra-opa-zba-sub/9', description: 'Block Plan Amendment — Block 51-1', poly: box(0, 0, 10, 10), units: 1000, date: '2018-01-01' }),
    app({ ref: 'D1', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 400 units', poly: box(0, 0, 5, 10), units: 400, date: '2019-01-01' }),
    app({ ref: 'D2', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 500 units', poly: box(5, 0, 10, 10), units: 500, date: '2019-06-01' }),
    app({ ref: 'S1', poly: box(0.5, 0.5, 4.5, 9.5), units: 380, date: '2021-01-01' }),
  ];
  const b = run(recs);
  assert.equal(linkOf(b, 'D1').rule, 'block plan ⊃ draft plan');
  assert.equal(linkOf(b, 'D2').rule, 'block plan ⊃ draft plan');
  assert.equal(linkOf(b, 'S1').rule, 'draft plan ⊃ site plan / condo');
  assert.equal(nodeParentRef(b, 'S1'), 'D1', 'the site plan sits in the draft plan, not straight in the block plan');
  const c = T.countTree(b.treeOf('BLOCK'), b);
  assert.equal(c.units, 900, 'draft plans cover the block plan: 400 + 500, not the block plan 1000 nor 1000 + 900');
  // D1's site plan covers ~64% of D1: D1's own 400 stands, 20 left "not yet in a site plan".
  const d1 = c.tops[0].children.find(x => b.nodes[x.k].refs[0] === 'D1');
  assert.equal(d1.units, 400);
  assert.equal(d1.remainder, 20);
});
function nodeParentRef(b, ref) { const l = linkOf(b, ref); return l ? b.nodes.find(n => n.id === l.parent).refs[0] : null; }

test('OZS without a draft plan on the same land as one with: siblings, counted once', () => {
  const recs = [
    app({ ref: 'OZS-A', sourceId: 'bra-opa-zba-sub/9', description: 'Official Plan Amendment | Zoning By Law Amendment — 300 units', poly: box(0, 0, 4, 4), units: 300 }),
    app({ ref: 'OZS-B', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 300 units', poly: box(0, 0, 4, 4.1), units: 300 }),
  ];
  const b = run(recs);
  const sib = b.links.find(l => l.type === 'sibling');
  assert.equal(sib.rule, 'same land: use + draft plan');
  assert.equal(sib.confidence, 'high');
  assert.equal(T.countTree(b.treeOf('OZS-A'), b).units, 300);
});

test('a pre-consultation links to the one proposal it overlaps most, never bridging two', () => {
  const recs = [
    app({ ref: 'A', sourceId: 'bra-opa-zba-sub/9', description: 'Zoning By Law Amendment — 100 units', poly: box(0, 0, 4, 4), units: 100 }),
    app({ ref: 'B', sourceId: 'bra-opa-zba-sub/9', description: 'Zoning By Law Amendment — 80 units', poly: box(4, 0, 8, 4), units: 80 }),
    app({ ref: 'PRE', sourceId: 'bra-precon/10', poly: box(1.5, 0, 5, 4), date: '2021-01-01' }),
  ];
  const b = run(recs);
  assert.equal(nodeParentRef(b, 'PRE'), 'A');
  assert.notEqual(b.treeOf('A'), b.treeOf('B'), 'the two proposals stay separate trees');
  assert.equal(b.links.filter(l => l.child === b.nodeByRef('PRE').id).length, 1);
});

test('two neighbours sharing an edge never link', () => {
  const recs = [app({ ref: 'N1', poly: box(0, 0, 3, 3), units: 50 }), app({ ref: 'N2', poly: box(3, 0, 6, 3), units: 60 })];
  const b = run(recs);
  assert.equal(b.links.length, 0);
  assert.equal(b.trees.length, 2);
  // A sliver overlap (< 15%) doesn't link either.
  const s = run([app({ ref: 'M1', poly: box(0, 0, 3, 3), units: 50 }), app({ ref: 'M2', poly: box(2.7, 0, 6, 3), units: 60 })]);
  assert.equal(s.links.length, 0);
});

test('a condo repeats its site plan: linked under it, never adds units', () => {
  const recs = [
    app({ ref: 'SP-1', poly: box(0, 0, 2, 2), units: 120, date: '2020-01-01' }),
    app({ ref: 'CDM-1', sourceId: 'bra-condo/7', poly: box(0.05, 0.05, 1.95, 1.95), units: 120, date: '2023-01-01' }),
  ];
  const b = run(recs);
  assert.equal(linkOf(b, 'CDM-1').rule, 'site plan ⊃ condo');
  assert.equal(T.countTree(b.treeOf('SP-1'), b).units, 120);
});

test('confidence: a child filed years before its parent is low; children above the parent are flagged', () => {
  const recs = [
    app({ ref: 'D', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 100 units', poly: box(0, 0, 4, 4), units: 100, date: '2022-01-01' }),
    app({ ref: 'S-old', poly: box(0, 0, 4, 3.8), units: 200, date: '2015-01-01' }),
  ];
  const b = run(recs);
  const l = linkOf(b, 'S-old');
  assert.equal(l.order, 'reversed');
  assert.equal(l.confidence, 'low');
  const c = T.countTree(b.treeOf('D'), b);
  assert.ok(c.flags.some(f => f.kind === 'children exceed parent'));
});

test('point-only files (no boundary published) link by point in boundary or address, at medium confidence at most', () => {
  const recs = [
    app({ ref: 'OZ 26 1', municipality: 'Mississauga', sourceId: 'mis-devapps/4', type: 'REZONING', address: '100 MAIN ST', units: 200 }),
    app({ ref: 'SP 26 5', municipality: 'Mississauga', sourceId: 'mis-siteplan/0', type: 'SITE PLAN', address: '100 MAIN ST', poly: box(-1, -1, 1, 1), units: 200 }),
  ];
  const b = run(recs);
  const l = b.links[0];
  assert.ok(l, 'linked');
  assert.notEqual(l.confidence, 'high');
  assert.equal(T.countTree(b.treeOf('SP 26 5'), b).units, 200, 'counted once');
});

test('a proposal re-filed (one inside the other, same count ±10%) is one proposal, counted once', () => {
  const recs = [
    app({ ref: 'OZS-2024-0032', sourceId: 'bra-opa-zba-sub/9', description: 'Zoning By Law Amendment — 1,628 units', poly: box(0, 0, 6, 6), units: 1628 }),
    app({ ref: 'OZS-2026-0002', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 1,635 units', poly: box(1, 1, 2, 2), units: 1635 }),
  ];
  const b = run(recs);
  assert.equal(b.links[0].rule, 'same proposal re-filed: one inside the other, same count (±10%)');
  assert.equal(T.countTree(b.treeOf('OZS-2024-0032'), b).units, 1635);
  // Different counts: not linked, listed for review instead.
  const c = run([recs[0], { ...recs[1], uid: 'x2', ref: 'OZS-X', units: 300 }]);
  assert.ok(!c.links.some(l => l.rule.startsWith('same proposal')));
  assert.ok(c.flags.nestedFormal.some(f => f.inner === 'OZS-X'));
});

test('successive pre-consultations on the same land count once', () => {
  const recs = [
    app({ ref: 'PRE-2021-0042', sourceId: 'bra-precon/10', poly: box(0, 0, 3, 3), precUnits: 526 }),
    app({ ref: 'PRE-2023-0088', sourceId: 'bra-precon/10', poly: box(0, 0, 3, 3.05), precUnits: 613 }),
  ];
  const b = run(recs);
  assert.equal(b.links[0].rule, 'same land: successive pre-consultations');
  const c = T.countTree(b.treeOf('PRE-2021-0042'), b);
  assert.equal(c.units, 613);
  assert.match(c.basis, /pre-consultation/);
});

test("a rezoning published as a point inside a site plan's boundary is the same land (low confidence without an address match)", () => {
  const recs = [
    app({ ref: 'OZ/OPA 22-10', municipality: 'Mississauga', sourceId: 'mis-devapps/4', type: 'REZONING', address: '88 PARK ST E (FORMERLY 0 PARK ST E)', units: 1329 }),
    app({ ref: 'SP 25-5', municipality: 'Mississauga', sourceId: 'mis-siteplan/0', type: 'SITE PLAN', address: '9 OTHER RD', poly: box(-1, -1, 1, 1), units: 819 }),
  ];
  const b = run(recs);
  assert.equal(b.links[0].rule, 'same land: rezoning + site plan (point in boundary)');
  assert.equal(b.links[0].confidence, 'low');
  assert.equal(T.countTree(b.treeOf('SP 25-5'), b).units, 1329, 'counted once, the larger count');
});

test('address match: a shared civic number on a shared street word', () => {
  const recs = [
    app({ ref: 'OZ 1', municipality: 'Mississauga', sourceId: 'mis-devapps/4', type: 'REZONING', address: '17 & 19 ANN ST AND 84 & 90 HIGH ST E', units: 410, lat: 43.7, lng: -79.7 }),
    app({ ref: 'OZ 2', municipality: 'Mississauga', sourceId: 'mis-devapps/4', type: 'REZONING', address: '19 ANN ST', units: 410, lat: 43.7, lng: -79.7 }),
    app({ ref: 'OZ 3', municipality: 'Mississauga', sourceId: 'mis-devapps/4', type: 'REZONING', address: '19 MAIN ST', units: 10, lat: 43.7, lng: -79.7 }),
  ];
  const b = run(recs);
  const ab = b.links.find(l => [l.a, l.b].includes(b.nodeByRef('OZ 1').id) && [l.a, l.b].includes(b.nodeByRef('OZ 2').id));
  assert.ok(ab && ab.addr, 'same civic number on the same street');
  assert.ok(!b.links.some(l => [l.a, l.b, l.child, l.parent].includes(b.nodeByRef('OZ 3').id)), 'same number, different street: no link');
});

test('a tree of condominium files only: the condo count stands (no other file states one) and is listed for review', () => {
  const b = run([app({ ref: 'C05E13.009', sourceId: 'bra-condo/7', poly: box(0, 0, 2, 2), units: 178 })]);
  const c = T.countTree(b.treeOf('C05E13.009'), b);
  assert.equal(c.units, 178);
  assert.match(c.basis, /condominium count/);
  assert.deepEqual(c.condoOnly, { units: 178, files: ['C05E13.009'] });
});

test('a condo never adds to a site plan that states a count', () => {
  const b = run([
    app({ ref: 'SP-9', poly: box(0, 0, 2, 2), units: 120, date: '2021-01-01' }),
    app({ ref: 'CDM-9', sourceId: 'bra-condo/7', poly: box(0.05, 0.05, 1.95, 1.95), units: 150, date: '2023-01-01' }),
  ]);
  assert.equal(T.countTree(b.treeOf('SP-9'), b).units, 120);
});

test('coverage counts only children that state a count', () => {
  const b = run([
    app({ ref: 'D9', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 400 units', poly: box(0, 0, 10, 10), units: 400, date: '2019-01-01' }),
    app({ ref: 'S9A', poly: box(0, 0, 5, 10), units: 200, date: '2021-01-01' }),
    app({ ref: 'S9B', poly: box(5, 0, 10, 10), units: null, description: 'Site plan', date: '2021-06-01' }),
  ]);
  const c = T.countTree(b.treeOf('D9'), b);
  assert.equal(c.units, 400, 'the counted site plan covers half the land: the draft plan count stands');
  assert.equal(c.tops[0].remainder, 200);
});

test('same-land site plans: phases stay apart, both counted', () => {
  const b = run([
    app({ ref: 'SP-P1', poly: box(0, 0, 2, 2), units: 300, phase: 'approved', description: 'Phase 1 - two residential towers', date: '2018-01-01' }),
    app({ ref: 'SP-P2', poly: box(0, 0, 2, 2), units: 150, phase: 'approved', description: 'Phase 2 - mid-rise with retail podium', date: '2021-01-01' }),
  ]);
  const f = b.flags.sameLandSitePlans.find(x => [x.a, x.b].includes('SP-P1'));
  assert.equal(f.verdict, 'phase');
  assert.ok(!b.links.some(l => l.type === 'sibling' && [l.a, l.b].includes(b.nodeByRef('SP-P1').id)));
  const total = T.countTree(b.treeOf('SP-P1'), b).units + T.countTree(b.treeOf('SP-P2'), b).units;
  assert.equal(total, 450);
});

test('same-land site plans: a resubmission replaces the earlier proposal, counted once (the later count)', () => {
  const b = run([
    app({ ref: 'SP-R1', poly: box(0, 0, 2, 2), units: 300, phase: 'review', description: 'Site plan for a 12-storey apartment building with ground floor retail', date: '2019-01-01' }),
    app({ ref: 'SP-R2', poly: box(0, 0, 2, 2), units: 250, phase: 'approved', description: 'Site plan for a 12-storey apartment building with ground floor retail', date: '2021-01-01' }),
  ]);
  const f = b.flags.sameLandSitePlans.find(x => [x.a, x.b].includes('SP-R1'));
  assert.equal(f.verdict, 'resubmission');
  assert.match(b.links.find(l => l.type === 'sibling').rule, /resubmission/);
  assert.equal(b.nodeByRef('SP-R1').superseded, 'resubmission');
  assert.equal(T.countTree(b.treeOf('SP-R1'), b).units, 250);
});

test('same-land site plans: a rebuild of a site built long ago counts the new proposal only', () => {
  const b = run([
    app({ ref: 'SP-OLD', poly: box(0, 0, 2, 2), units: 40, phase: 'completed', description: 'Townhouses', date: '2004-01-01' }),
    app({ ref: 'SP-NEW', poly: box(0, 0, 2, 2), units: 200, phase: 'review', description: 'Demolish and build a 15-storey building', date: '2022-01-01' }),
  ]);
  const f = b.flags.sameLandSitePlans.find(x => [x.a, x.b].includes('SP-OLD'));
  assert.equal(f.verdict, 'redevelopment');
  assert.equal(T.countTree(b.treeOf('SP-NEW'), b).units, 200);
});

test('same-land site plans with mixed evidence stay unlinked and are listed as unclear', () => {
  const b = run([
    app({ ref: 'SP-U1', poly: box(0, 0, 2, 2), units: 300, phase: 'approved', description: 'Apartment building', date: '2020-01-01' }),
    app({ ref: 'SP-U2', poly: box(0, 0, 2, 2), units: 120, phase: 'review', description: 'Apartment building', date: '2020-06-01' }),
  ]);
  const f = b.flags.sameLandSitePlans.find(x => [x.a, x.b].includes('SP-U1'));
  assert.equal(f.verdict, 'unclear');
  assert.ok(!b.links.some(l => l.type === 'sibling'));
});

test('official plan amendments: site-specific and area-wide, the latest listed; never counted', () => {
  const b = run([
    app({ ref: 'OZS-1', sourceId: 'bra-opa-zba-sub/9', description: 'Official Plan Amendment | Zoning By Law Amendment — a 12-storey building', poly: box(0, 0, 2, 2), units: 150, date: '2022-01-01' }),
    app({ ref: 'SP-1', poly: box(0.1, 0.1, 1.9, 1.9), units: 150, date: '2023-01-01' }),
    app({ ref: 'OZS-AREA', sourceId: 'bra-opa-zba-sub/9', description: 'Official Plan Amendment — secondary plan update', poly: box(-50, -50, 50, 50), units: null, date: '2024-05-01' }),
    app({ ref: 'OZS-ZBA', sourceId: 'bra-opa-zba-sub/9', description: 'Zoning By Law Amendment — OPA ZBA Subdivision', poly: box(-50, -50, 50, 50), units: null, date: '2025-01-01' }),
  ]);
  const tree = b.treeOf('SP-1');
  const k = b.trees.indexOf(tree);
  const pa = T.planAmendments(b)[k];
  assert.deepEqual(pa.all.map(x => [x.ref, x.scope]), [['OZS-AREA', 'area-wide'], ['OZS-1', 'site-specific']]);
  assert.equal(pa.latest.ref, 'OZS-AREA');
  assert.equal(T.countTree(tree, b).units, 150);
});

test('an area-wide amendment never joins separate developments into one count', () => {
  const b = run([
    app({ ref: 'OPA-WIDE', sourceId: 'bra-opa-zba-sub/9', description: 'Official Plan Amendment — secondary plan', poly: box(-50, -50, 50, 50), units: null, date: '2015-01-01' }),
    app({ ref: 'D-A', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 300 units', poly: box(0, 0, 5, 5), units: 300, date: '2020-01-01' }),
    app({ ref: 'D-B', sourceId: 'bra-opa-zba-sub/9', description: 'Draft Plan of Subdivision — 200 units', poly: box(20, 20, 25, 25), units: 200, date: '2020-01-01' }),
  ]);
  assert.equal(b.nodeByRef('OPA-WIDE').policy, true);
  assert.notEqual(b.treeOf('D-A'), b.treeOf('D-B'));
  assert.equal(T.countTree(b.treeOf('D-A'), b).units + T.countTree(b.treeOf('D-B'), b).units, 500);
});
