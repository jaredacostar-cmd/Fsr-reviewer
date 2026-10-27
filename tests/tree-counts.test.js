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

test('apply: the tree count is net of the homes the site demolishes, as Previous is', () => {
  const p = { ...dev('k1', 3, [rec('SP-1')]), unitsLost: 2, unitsGross: 5 };
  const data = { snapshotAt: '2026-10-12', projects: { k1: { u: 6, s: TC.sigOf(p, id), t: [['SP-1', 6, 'own count', '']], c: [['SP-1', 6, 'stated', null]] } } };
  TC.apply([p], { mode: 'tree', data, canonRef: id });
  assert.equal(p.units, 4, '6 new − 2 demolished'); assert.equal(p.unitsGross, 6); assert.equal(p.count.lost, 2);
  assert.match(TC.partsHTML(p), /6 SP-1.* − 2 demolished = <strong>4<\/strong>/);
  TC.apply([p], { mode: 'previous', data, canonRef: id });
  assert.equal(p.units, 3); assert.equal(p.unitsGross, 5, 'Previous: its own gross back');
  const one = { ...dev('k2', 0, [rec('SP-2')]), unitsLost: 1, unitsGross: 1 };
  TC.apply([one], { mode: 'tree', data: { projects: { k2: { u: 1, s: TC.sigOf(one, id), t: [] } } }, canonRef: id });
  assert.equal(one.units, 0, 'a tear-down rebuild adds none');
  const none = dev('k3', 7, [rec('SP-3')]);
  TC.apply([none], { mode: 'tree', data: { projects: { k3: { u: 9, s: TC.sigOf(none, id), t: [] } } }, canonRef: id });
  assert.equal(none.units, 9); assert.equal(none.count.lost, undefined);
});

test('signature: order-free, and changes when a file is added', () => {
  const a = dev('k', 1, [rec('A'), rec('B')]), b = dev('k', 1, [rec('B'), rec('A'), { kind: 'permit', municipality: 'Brampton', ref: 'BP-1' }]);
  assert.equal(TC.sigOf(a, id), TC.sigOf(b, id), 'permits and order do not matter');
  assert.notEqual(TC.sigOf(a, id), TC.sigOf(dev('k', 1, [rec('A'), rec('B'), rec('C')]), id));
});

// Step B2: the real snapshot, regrouped into the trees with the committed data.
const TG = require('../js/tree-groups.js');
test('data/tree-counts.json: the trees are the developments; every file once; Peel ties to the review; old keys resolve', async () => {
  const file = path.join(__dirname, '..', 'data', 'tree-counts.json');
  if (!fs.existsSync(file)) return;
  const d = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(d.version, 2);
  for (const x of d.devs) assert.equal(x.u, x.t.reduce((s, t) => s + t[1], 0), `development ${x.k}`);
  assert.equal(new Set(d.devs.map(x => x.k)).size, d.devs.length, 'one key per tree');
  const { loadRecords } = require('../scripts/audit-tree.js');
  const data = await loadRecords(false);
  if (data.generatedAt !== d.snapshotAt) return;   // a newer snapshot: rebuilt by the site workflow
  const live = ps => ps.filter(p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
  const before = P.buildProjects(data.records);
  const prev = live(before).reduce((s, p) => s + (p.units || 0), 0);
  TG.setData(d);
  const after = P.buildProjects(data.records, { regroup: parts => TG.regroup(parts, { canonRef: P.canonRef, ringsArea: P.ringsArea }) });
  TC.apply(after, { mode: 'tree', data: d, canonRef: P.canonRef });
  assert.equal(prev, d.totals.Peel.previous, 'previous = the app as before');
  assert.equal(live(after).reduce((s, p) => s + (p.units || 0), 0), d.totals.Peel.tree, 'Peel = the review after overrides');
  // No record in two developments; every planning file in exactly one, and that one is its tree's.
  const seen = new Map();
  for (const p of after) for (const r of p.records) { assert.ok(!seen.has(r), `record ${r.uid} in ${seen.get(r)} and ${p.key}`); seen.set(r, p.key); }
  for (const p of before) for (const r of p.records) assert.ok(seen.has(r), `record ${r.uid} of ${p.key} kept`);
  const keys = new Set(after.map(p => p.key));
  assert.equal(keys.size, after.length, 'keys unique');
  for (const x of d.devs) assert.ok(keys.has(x.k), `tree ${x.k} is a development`);
  const devOfFile = new Map();
  for (const p of after) for (const r of p.records) if (r.kind === 'application') {
    const fk = TG.fileKey(r, P.canonRef), i = d.files[fk];
    if (i == null) continue;
    assert.equal(p.key, d.devs[i].k, `file ${fk} in its tree's development`);
    if (devOfFile.has(fk)) assert.equal(devOfFile.get(fk), p.key, `file ${fk} in one development`); else devOfFile.set(fk, p.key);
  }
  assert.ok(after.every(p => p.count.why == null || !/files differ/.test(p.count.why)), 'every signature matches');
  // Every key saved before resolves to a development; the watchlist and allocations survive.
  const exists = k => keys.has(k);
  const unresolved = before.map(p => p.key).filter(k => !TG.resolve(k, exists));
  assert.deepEqual(unresolved, []);
  const watched = before.slice(0, 400).map(p => p.key);
  const w = TG.migrateKeys(watched, exists);
  assert.ok(w.every(exists), 'every watched key is a development');
  for (const k of watched) assert.ok(TG.resolveAll(k, exists).every(x => w.includes(x)), `${k} still watched`);
  const allocs = Object.fromEntries(before.filter(p => p.units > 0).slice(0, 300).map(p => [p.key, { units: 10, date: '2026-01-01' }]));
  const m = TG.migrateAllocations(allocs, exists, k => (after.find(p => p.key === k) || {}).units);
  assert.ok(Object.keys(m.all).every(exists), 'allocations sit on developments');
  assert.equal(Object.keys(m.all).length + (Object.keys(allocs).length - new Set(Object.keys(allocs).map(k => TG.resolve(k, exists))).size), Object.keys(allocs).length, 'none lost (two that merged keep the first)');
  TG.setData(null);
});

test('tree groups: resolve, migrate and branch keys on a small example', () => {
  TG.setData({ version: 2, devs: [{ k: 'B|1 MAIN ST', root: 'OZ-1', u: 10, t: [], n: [] }, { k: 'B|1 MAIN ST~SP-2', root: 'SP-2', u: 5, t: [], n: [] }], files: { 'B|OZ-1': 0, 'B|SP-2': 1, 'B|SP-3': 0 }, permits: {} });
  const rec = (ref, extra = {}) => ({ kind: 'application', municipality: 'B', ref, fileKey: ref, uid: ref, ...extra });
  const parts = [{ key: 'B|1 MAIN ST', recs: [rec('OZ-1'), rec('SP-2'), { kind: 'permit', municipality: 'B', uid: 'p1' }], site: {} }, { key: 'B|3 MAIN ST', recs: [rec('SP-3')], site: {} }];
  const out = TG.regroup(parts, { canonRef: x => x });
  assert.deepEqual(out.map(b => b.key).sort(), ['B|1 MAIN ST', 'B|1 MAIN ST~SP-2']);
  assert.equal(out.find(b => b.key === 'B|1 MAIN ST').recs.length, 3, 'the permit stays with its site; SP-3 joins its tree');
  const exists = k => out.some(b => b.key === k);
  assert.deepEqual(TG.resolveAll('B|1 MAIN ST', exists), ['B|1 MAIN ST']);
  assert.deepEqual(TG.resolveAll('B|3 MAIN ST', exists), ['B|1 MAIN ST'], 'a merged development resolves to its tree');
  assert.deepEqual(TG.resolveAll('B|3 MAIN ST#SP-3', exists), ['B|1 MAIN ST#SP-3'], 'a branch key keeps its file');
  assert.deepEqual(TG.migrateKeys(['B|3 MAIN ST', 'gone'], exists).sort(), ['B|1 MAIN ST', 'gone'], 'nothing dropped');
  TG.setData(null);
});

// Navigation phase 5, S1 (pros-and-cons M1; owner decision 14, approved 2026-10-15 "for one release"):
// Settings › Counting's Previous switch is retired. Every development takes its tree count; one the tree
// does not count keeps the rule before it (the fallback) and says so in words.
test('the Previous switch is retired: the rule stays the fallback, said in words', () => {
  for (const k of ['mode', 'setMode', 'settingsHTML', 'MODES']) assert.equal(TC[k], undefined, k);
  assert.equal(TC.label(), 'tree count');
  // A browser that stored Previous: the stored value is never read (a vm copy with that store).
  const store = { get: (k, d) => (k === 'countMode' ? 'previous' : d), set() {} };
  const ctx = { PeelUtil: { store }, console };
  ctx.window = ctx; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'tree-counts.js'), 'utf8'), ctx);
  const p = dev('k1', 100, [rec('OZS-1')]);
  const data = { snapshotAt: '2026-10-12', projects: { k1: { u: 140, s: ctx.PeelTreeCounts.sigOf(p, id), t: [['OZS-1', 140, 'own count', '']] } } };
  assert.equal(ctx.PeelTreeCounts.apply([p], { data, canonRef: id }).mode, 'tree');
  assert.equal(p.count.mode, 'tree', 'a stored Previous is ignored'); assert.equal(p.units, 140);
  // The fallback's note: a development of permits only is counted from its permits; one with files says why.
  const permits = { key: 'k5', units: 12, records: [{ kind: 'permit', municipality: 'Brampton', ref: 'BP-1', uid: 'BP-1' }] };
  TC.apply([permits], { data, canonRef: id });
  assert.equal(permits.count.mode, 'previous');
  assert.match(TC.noteHTML(permits), /<strong>Counted from its permits<\/strong>\.<\/p>/);
  const changed = dev('k1', 100, [rec('OZS-1'), rec('SP-9')]);
  TC.apply([changed], { data, canonRef: id });
  assert.match(TC.noteHTML(changed), /Counted from its files and permits<\/strong>: its files differ from the tree build of 2026-10-12/);
  const none = dev('k1', 100, [rec('OZS-1')]);
  TC.apply([none], { data: null, canonRef: id });
  assert.match(TC.noteHTML(none), /Counted from its files and permits<\/strong>: tree counts not loaded/);
  for (const q of [permits, changed, none]) assert.doesNotMatch(TC.noteHTML(q), /Previous count|Settings › Counting/);
  // The app groups by the trees whenever their data is in; the top bar warns on a failed load.
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(src('js/app.js'), /const grouped = !!\(TG && TG\.ready\(\)\);/);
  assert.match(src('js/topbar.js'), /TC && TC\.status === 'failed'/);
  assert.match(src('js/topbar.js'), /tree counts didn\\u2019t load: counted from the files and permits/);
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js'))) assert.doesNotMatch(src(`js/${f}`), /PeelTreeCounts\.(mode|setMode|settingsHTML)\b|\bTC\.(mode|setMode)\(/, `js/${f}`);
});
