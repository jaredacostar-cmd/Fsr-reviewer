'use strict';
// Step B1: tree counts inside today's developments (js/tree-counts.js, data/tree-counts.json).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const TC = require('../js/tree-counts.js');
const P = require('../js/phases.js');
const D = require('../js/demand.js');

const rec = (ref, extra = {}) => ({ kind: 'application', municipality: 'Brampton', ref, fileKey: ref, uid: ref, ...extra });
const dev = (key, units, records) => ({ key, units, records });
const id = x => x;

test('apply: the tree count replaces the previous one; Previous puts it back', () => {
  const p = dev('k1', 100, [rec('OZS-1'), rec('SP-1')]);
  const data = { snapshotAt: '2026-10-12', projects: { k1: { u: 140, s: TC.sigOf(p, id), t: [['OZS-1', 140, 'own count', '']] } } };
  const r = TC.apply([p], { mode: 'tree', data, canonRef: id });
  assert.equal(p.units, 140); assert.equal(p.count.mode, 'tree'); assert.equal(p.count.previous, 100); assert.equal(r.tree, 1);
  TC.apply([p], { mode: 'previous', data, canonRef: id });
  assert.equal(p.units, 100, 'back to the previous count'); assert.equal(p.count.mode, 'previous');
  TC.apply([p], { mode: 'tree', data, canonRef: id });
  assert.equal(p.units, 140, 'switching twice is stable');
});

test('apply: keeps the previous count, with the reason, when the files changed or you entered a count', () => {
  const p = dev('k1', 100, [rec('OZS-1')]);
  const data = { snapshotAt: '2026-10-12', projects: { k1: { u: 140, s: 'other', t: [] } } };
  TC.apply([p], { mode: 'tree', data, canonRef: id });
  assert.equal(p.units, 100); assert.match(p.count.why, /files differ from the tree build of 2026-10-12/);
  const q = dev('k1', 100, [rec('OZS-1', { unitsUser: true })]);
  TC.apply([q], { mode: 'tree', data: { projects: { k1: { u: 140, s: TC.sigOf(q, id), t: [] } } }, canonRef: id });
  assert.equal(q.units, 100); assert.match(q.count.why, /you entered a count/);
  const n = dev('k9', 3, [rec('X')]);
  TC.apply([n], { mode: 'tree', data, canonRef: id });
  assert.equal(n.units, 3); assert.match(n.count.why, /no tree/);
});

test('apply: first paint (index developments carry no records) takes the tree count by key', () => {
  const p = dev('k1', 100, []);
  TC.apply([p], { mode: 'tree', data: { projects: { k1: { u: 0, s: 'x', t: [], with: 'OZS-2' } } }, canonRef: id });
  assert.equal(p.units, 0); assert.equal(p.count.with, 'OZS-2');
  assert.match(TC.noteHTML(p), /counted in the tree of OZS-2/);
});

test('signature: order-free, and changes when a file is added', () => {
  const a = dev('k', 1, [rec('A'), rec('B')]), b = dev('k', 1, [rec('B'), rec('A'), { kind: 'permit', municipality: 'Brampton', ref: 'BP-1' }]);
  assert.equal(TC.sigOf(a, id), TC.sigOf(b, id), 'permits and order do not matter');
  assert.notEqual(TC.sigOf(a, id), TC.sigOf(dev('k', 1, [rec('A'), rec('B'), rec('C')]), id));
});

// The real snapshot against the committed tree counts: built from the same records.
test('data/tree-counts.json: every development equals the sum of its trees; Peel ties to the review; Previous unchanged', async () => {
  const file = path.join(__dirname, '..', 'data', 'tree-counts.json');
  if (!fs.existsSync(file)) return;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [k, e] of Object.entries(d.projects)) assert.equal(e.u, e.t.reduce((s, x) => s + x[1], 0), `development ${k}`);
  const { loadRecords } = require('../scripts/audit-tree.js');
  const data = await loadRecords(false);
  if (data.generatedAt !== d.snapshotAt) return;   // a newer snapshot: rebuilt by the site workflow
  const projects = P.buildProjects(data.records);
  const live = projects.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const sum = () => live.reduce((s, p) => s + (p.units || 0), 0);
  const prev = sum();
  const committedBefore = live.filter(D.isCommitted).map(p => p.key).sort();
  const r = TC.apply(projects, { mode: 'tree', data: d, canonRef: P.canonRef });
  assert.equal(sum(), d.totals.Peel.tree, 'Peel in tree mode = the build total');
  assert.equal(prev, d.totals.Peel.previous, 'Peel in previous mode = the app as before');
  assert.equal(live.filter(p => p.count.why && /files differ/.test(p.count.why)).length, 0, 'every signature matches the snapshot');
  assert.deepEqual(live.filter(D.isCommitted).map(p => p.key).sort(), committedBefore, 'committed (D-5-1) is set by phase, not by the count');
  assert.ok(r.tree > 3000);
  TC.apply(projects, { mode: 'previous', data: d, canonRef: P.canonRef });
  assert.equal(sum(), prev);
});
