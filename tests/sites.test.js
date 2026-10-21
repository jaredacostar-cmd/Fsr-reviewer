'use strict';
// Site → proposal → file, step 1 (js/sites.js, report only): a file's scope, and a tree split into
// its proposals and its site activity.
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/sites.js');
const H = require('./helpers/real-devs.js');

const node = (id, o = {}) => ({ id: `Brampton|${id}`, refs: [id], role: 'site_plan', units: 0, precUnits: 0, minor: false, cancelled: false, records: [{ uid: id, description: o.description || '', type: o.type || '', units: o.recUnits || null }], ...o });
const link = (child, parent, rule, confidence = 'high') => ({ type: 'parent', rule, child: `Brampton|${child}`, parent: `Brampton|${parent}`, confidence });
const sib = (a, b, rule, confidence = 'high') => ({ type: 'sibling', rule, a: `Brampton|${a}`, b: `Brampton|${b}`, confidence });
const builtOf = (nodes, links) => {
  const ix = new Map(nodes.map((n, i) => [n.id, i])), parent = nodes.map(() => -1);
  for (const l of links) if (l.type === 'parent') parent[ix.get(l.child)] = ix.get(l.parent);
  return { nodes, links, parent };
};

test('fileScope: homes or a building are major; a patio, a fit-out, a gate minor; cancelled and superseded files history', () => {
  const scope = n => S.fileScope(n).scope;
  assert.equal(scope(node('PRE-2019-0043', { role: 'precon', precUnits: 1753 })), 'major');
  assert.equal(scope(node('SPA-2022-0214', { minor: true, description: 'Limited Site Plan — LIMITED SITE PLAN APPLICATION FOR PROPOSED PATIO.' })), 'minor');
  assert.equal(scope(node('SPA-2024-0152', { minor: true, description: 'Limited Site Plan — Greenwin is proposing a 13-storey apartment building (PLACEKEEPING FILE)' })), 'major', 'filed as limited, describing a building');
  assert.equal(scope(node('SPM 20/130', { minor: true, recUnits: 12 })), 'major', 'a minor file that states homes');
  assert.equal(scope(node('SPA-2026-0058', { description: 'Basic Site Plan — INTERIOR ALTERATIONS FOR PROPOSED DAY CARE CENTER AND PROPOSED OUTDOOR PLAY AREA.' })), 'minor');
  assert.equal(scope(node('PRE-2021-0120', { role: 'precon', description: 'Site Plan Basic — an automated mechanical car wash facility' })), 'minor');
  assert.equal(scope(node('OZS-2024-0064', { role: 'use', description: 'Lifting of Hold | Zoning By Law Amendment — To remove holding provision' })), 'major', 'a rezoning changes what the land allows');
  assert.equal(scope(node('SP86-085.000', { description: 'Application for Site Plan Control' })), 'major', 'no wording either way: a building');
  assert.equal(scope(node('SPA-2025-0078', { cancelled: true })), 'admin');
  assert.equal(scope(node('SP90-052.000', { superseded: 'redevelopment' })), 'admin');
});

test('proposalsOf: a patio under a redevelopment is site activity; the redevelopment is one proposal', () => {
  const nodes = [
    node('SPA-2022-0214', { minor: true, description: 'Limited Site Plan — PROPOSED PATIO.' }),
    node('PRE-2019-0043', { role: 'precon', precUnits: 1753 }),
    node('PRE-2021-0038', { role: 'precon', description: 'Official Plan Amendment | Zoning By Law Amendment — Proposed redevelopment' }),
  ];
  const built = builtOf(nodes, [link('PRE-2019-0043', 'SPA-2022-0214', 'pre-consultation → the formal file it overlaps most'), sib('PRE-2021-0038', 'PRE-2019-0043', 'same land: successive pre-consultations')]);
  const { proposals, site } = S.proposalsOf({ nodes: [0, 1, 2] }, built);
  assert.deepEqual(proposals.map(p => p.nodes.map(i => nodes[i].refs[0]).sort()), [['PRE-2019-0043', 'PRE-2021-0038']]);
  assert.deepEqual(site.map(s => nodes[s.i].refs[0]), ['SPA-2022-0214']);
});

test('proposalsOf: a minor file that names the plan it revises stays with it; a redevelopment of a long-built plan is a second proposal', () => {
  const nodes = [
    node('SPA-2024-0144', { units: 200 }),
    node('SPA-2026-0045', { minor: true, description: 'Limited Site Plan — Further to the approval of SPA-2024-0144' }),
    node('SP90-052.000', { superseded: 'redevelopment' }),
    node('SP89-001.000', {}),
  ];
  const built = builtOf(nodes, [link('SPA-2026-0045', 'SPA-2024-0144', 'names the file it revises'), sib('SPA-2024-0144', 'SP89-001.000', 'same land: redevelopment (the earlier site plan was built long ago)'), sib('SP89-001.000', 'SP90-052.000', 'same land: site plan revision')]);
  const { proposals, site } = S.proposalsOf({ nodes: [0, 1, 2, 3] }, built);
  assert.deepEqual(proposals.map(p => p.nodes.map(i => nodes[i].refs[0])), [['SPA-2024-0144', 'SPA-2026-0045'], ['SP89-001.000']]);
  assert.deepEqual(site.map(s => nodes[s.i].refs[0]), ['SP90-052.000']);
});

test('proposalsOf: a superseded file still ties the files filed before and after it (10194 Heart Lake Rd)', () => {
  const nodes = [node('SPA-2024-0144', { units: 200 }), node('SPA-2022-0101', { superseded: 'replaced', units: 200 }), node('PRE17.100', { role: 'precon', precUnits: 204 })];
  const built = builtOf(nodes, [sib('SPA-2024-0144', 'SPA-2022-0101', 'names the earlier application it replaces'), link('PRE17.100', 'SPA-2022-0101', 'pre-consultation → the formal file it overlaps most')]);
  const { proposals } = S.proposalsOf({ nodes: [0, 1, 2] }, built);
  assert.equal(proposals.length, 1);
  assert.deepEqual(proposals[0].nodes.map(i => nodes[i].refs[0]), ['SPA-2024-0144', 'PRE17.100']);
});

test('the step 1 report on the real data: homes agree, site activity no longer sets a stage', { skip: !H.available() }, () => {
  const a = require('../data/site-audit.json');
  assert.ok(Math.abs(a.homes.change) < 50, `homes before and after agree (${a.homes.change})`);
  const q = a.stageChanges.list.find(r => r.k === 'Brampton|263 QUEEN ST E');
  assert.ok(q && q.today === 'review' && q.proposal === 'inception', 'a day care fit-out no longer puts the 2,810-home pre-consultation in review');
  assert.ok(q.site.includes('SPA-2026-0058'));
});
