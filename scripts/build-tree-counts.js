#!/usr/bin/env node
/*
 * Steps B1–B2: data/tree-counts.json — the trees as the developments, with their counts.
 *
 * Every tree (js/tree.js, the chronology rules on) is one development:
 *   - key: the key of today's development (js/phases.js buildProjects) that holds its root file;
 *     a second tree of that development is "<key>~<root file>";
 *   - u / t: its count (countTree, the counts found online and your decisions in
 *     data/tree-overrides.json applied) and how it was made;
 *   - c: the count as its parts, [file, units, kind, source] summing to u (SPEC 1.6): kind stated,
 *     online (found online), override, condo, precon, minor, estimate (the wording) or permits;
 *   - n: its files in tree order, each with the link that put it there (rule, overlap,
 *     confidence), for the Files view and the branch sub-developments;
 *   - s: a signature of its planning files.
 * files maps each planning file ("Municipality|file key") to its development; permits lists only
 * the building permits the tree places somewhere other than the rest of their site. The app
 * regroups with these (js/tree-groups.js through buildProjects' regroup hook) and applies the
 * counts (js/tree-counts.js); it never builds the trees itself.
 *
 *   node scripts/build-tree-counts.js [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { audit, loadRecords } = require('./audit-tree.js');
const TC = require('../js/tree-counts.js');
const TG = require('../js/tree-groups.js');
const P = require('../js/phases.js');
const T = require('../js/tree.js');

const ROOT = path.join(__dirname, '..');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const CONF = { high: 'h', medium: 'm', low: 'l' };

// Step C1: the plans as a hierarchy. A secondary plan / character area lying (almost) wholly
// inside a larger one is its sub-level (Bolton Core in Bolton); a Brampton precinct sits in the
// plan holding most of it. Ids index the list sent to the app.
function planAreas(areasFile) {
  const A = areasFile || {};
  const list = [
    ...(A.secondaryPlans || []).map(a => ({ id: a.id, name: a.name, municipality: a.municipality, kind: a.municipality === 'Mississauga' ? 'character area' : 'secondary plan', rings: a.rings })),
    ...(A.precincts || []).map(a => ({ id: a.id, name: a.name, municipality: a.municipality, kind: 'precinct', rings: a.rings })),
  ].filter(a => a.rings && a.rings.length);
  for (const a of list) { a.bbox = T.bboxOf(a.rings); a.m2 = P.ringsArea(a.rings); }
  const parentOf = new Map();
  for (const a of list) {
    let best = null;
    for (const b of list) {
      if (b === a || b.kind === 'precinct' || b.municipality !== a.municipality || b.m2 <= a.m2) continue;
      const s = T.shareInside(a, b);
      if (a.kind === 'precinct' ? s >= 0.5 && (!best || s > best.s) : s >= 0.95 && (!best || b.m2 < best.b.m2)) best = { b, s };
    }
    if (best) parentOf.set(a.id, best.b.id);
  }
  return { list, parentOf };
}

function build(res, overridesFile, records, areasFile) {
  const { projects, nodes, counts, projsOfNode, built, tagsByTree } = res.internals;
  const PA = planAreas(areasFile), areaIdx = new Map(PA.list.map((a, i) => [a.id, i]));
  const ov = (overridesFile && overridesFile.overrides) || {};
  const rules = [], roles = [], code = (list, v) => { if (!v) return -1; let i = list.indexOf(v); if (i < 0) { i = list.length; list.push(v); } return i; };
  const idOf = new Map(nodes.map((n, i) => [n.id, i]));
  // The link that put each file in its tree: its parent link, else a same-land link.
  const linkOf = new Map();
  for (const l of built.links) {
    if (l.type === 'parent') linkOf.set(idOf.get(l.child), l);
    else for (const id of [l.b, l.a]) { const i = idOf.get(id); if (!linkOf.has(i)) linkOf.set(i, l); }
  }
  // 1. Each tree's count and owner (today's development holding its root file).
  let overridden = 0;
  const trees = counts.map(({ t, c }) => {
    const rootI = t.nodes[0], root = nodes[rootI], rootRef = root.refs[0] || root.id;
    const share = p => t.nodes.filter(i => projsOfNode[i].has(p)).length;
    const holders = [...projsOfNode[rootI]].length ? [...projsOfNode[rootI]] : [...new Set(t.nodes.flatMap(i => [...projsOfNode[i]]))];
    holders.sort((a, b) => share(b) - share(a) || String(a.key).localeCompare(String(b.key)));
    const o = ov[`${root.municipality}|${rootRef}`];
    const stating = t.nodes.filter(i => !nodes[i].cancelled && nodes[i].units > 0);
    const precon = /pre-consultation/i.test(c.basis) || (c.units > 0 && stating.length > 0 && stating.every(i => nodes[i].role === 'precon' || nodes[i].refs.some(r => /^PRE[-.]?\d/i.test(r))));
    let units = c.units || 0, basis = c.basis || '', flag = precon ? 'estimate (pre-consultation)' : /found online/.test(basis) ? 'found online' : '';
    // SPEC 1.6: the count as its parts, each file's units and how it is known.
    let parts = (c.parts || []).map(([i, u, kind, src]) => [i == null ? '' : (nodes[i].refs[0] || nodes[i].id), u, kind, src || null]);
    if (o && o.units != null) { units = o.units; basis = `your override (${o.decidedOn}): ${o.reason}`; flag = 'override'; overridden++; parts = [[rootRef, o.units, 'override', o.reason || null]]; }
    return { t, rootRef, owner: holders[0] || null, units, basis, flag, parts, live: !t.nodes.every(i => nodes[i].cancelled) };
  });
  // 2. Keys: the owner's key for its largest tree, "<key>~<root>" for the others.
  const byOwner = new Map();
  for (const x of trees) { const k = x.owner ? x.owner.key : `${nodes[x.t.nodes[0]].municipality}|#${x.rootRef}`; (byOwner.get(k) || byOwner.set(k, []).get(k)).push(x); }
  for (const [k, list] of byOwner) {
    list.sort((a, b) => (b.live - a.live) || b.units - a.units || b.t.nodes.length - a.t.nodes.length || a.rootRef.localeCompare(b.rootRef));
    list.forEach((x, i) => { x.key = i ? `${k}~${x.rootRef}` : k; });
  }
  // 3. Developments: files in tree order (root, then each branch under its parent).
  const devs = [], files = {};
  for (const [k, x] of trees.entries()) {
    const set = new Set(x.t.nodes), kids = new Map();
    for (const i of x.t.nodes) { const p = built.parent[i]; if (p >= 0 && set.has(p)) (kids.get(p) || kids.set(p, []).get(p)).push(i); }
    const order = [], pos = new Map();
    const walk = (i, parentPos) => {
      pos.set(i, order.length);
      const n = nodes[i], l = linkOf.get(i);
      const fk = n.id.slice(n.id.indexOf('|') + 1);
      order.push([n.refs[0] || fk, code(roles, n.role), parentPos, code(rules, l ? l.rule : ''), l ? CONF[l.confidence] || '' : '', l && l.overlap != null ? l.overlap : null, n.units || 0, n.cancelled ? 1 : 0, fk]);
      for (const j of (kids.get(i) || []).sort((a, b) => (nodes[a].date0 || 0) - (nodes[b].date0 || 0))) walk(j, pos.get(i));
    };
    const tops = x.t.nodes.filter(i => !(built.parent[i] >= 0 && set.has(built.parent[i])));
    tops.sort((a, b) => (a === x.t.nodes[0] ? -1 : b === x.t.nodes[0] ? 1 : (nodes[a].date0 || 0) - (nodes[b].date0 || 0)));
    for (const i of tops) walk(i, -1);
    const d = devs.length;
    // Step C1: the plans its root file's land lies in, by share of that land (a point: 1), and the
    // MTSAs it touches (an overlay, never added up).
    const tg = tagsByTree && tagsByTree[k];
    const a = tg ? tg.tags.filter(g => areaIdx.has(g.id)).map(g => [areaIdx.get(g.id), +g.share.toFixed(3)]) : [];
    const mt = tg ? tg.tags.filter(g => g.kind === 'MTSA').map(g => g.id) : [];
    devs.push({ k: x.key, root: x.rootRef, u: x.units, t: [[x.rootRef, x.units, x.basis, x.flag]], ...(x.parts.length ? { c: x.parts } : {}), n: order, ...(a.length ? { a } : {}), ...(mt.length ? { mt } : {}) });
    for (const i of x.t.nodes) files[nodes[i].id] = d;
  }
  // 4. Permits: where the tree placed them, recorded only when that differs from where the rest of
  // their site goes (the regroup default).
  const desired = new Map();
  for (const [i, list] of built.permitOf) for (const { r } of list) desired.set(r.uid, files[nodes[i].id]);
  const data = { version: 2, devs, files, permits: {}, codes: { rules, roles },
    areas: PA.list.map(a => ({ id: a.id, name: a.name, municipality: a.municipality, kind: a.kind, parent: PA.parentOf.get(a.id) || null })) };
  TG.setData(data);
  let parts = null;
  P.buildProjects(records, { regroup: ps => (parts = TG.regroup(ps, { canonRef: P.canonRef, ringsArea: P.ringsArea })) });
  for (const b of parts) for (const r of b.recs) if (r.kind !== 'application' && desired.has(r.uid) && devs[desired.get(r.uid)].k !== b.key) data.permits[r.uid] = desired.get(r.uid);
  // 5. The developments the app will build, checked.
  TG.setData(data);
  const after = P.buildProjects(records, { regroup: ps => TG.regroup(ps, { canonRef: P.canonRef, ringsArea: P.ringsArea }) });
  const keyMap = TG.keyMap;
  const byKey = new Map(); const dupKeys = [];
  for (const p of after) { if (byKey.has(p.key)) dupKeys.push(p.key); byKey.set(p.key, p); }
  for (const d of devs) { const p = byKey.get(d.k); d.s = p ? TC.sigOf(p, P.canonRef) : ''; }
  const missing = devs.filter(d => !byKey.has(d.k)).map(d => d.k);
  // Totals: previous (today's developments) and tree, live developments only.
  const totals = {};
  const add = (m, k, v) => { const t = totals[m] = totals[m] || { previous: 0, tree: 0, developmentsBefore: 0, developments: 0 }; t[k] += v; };
  const liveP = p => p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application');
  for (const p of projects) if (liveP(p)) for (const m of [p.municipality, 'Peel']) { add(m, 'previous', p.units || 0); add(m, 'developmentsBefore', 1); }
  TC.apply(after, { mode: 'tree', data: { snapshotAt: '', devs }, canonRef: P.canonRef });
  for (const p of after) if (liveP(p)) for (const m of [p.municipality, 'Peel']) { add(m, 'tree', p.units || 0); add(m, 'developments', 1); }
  const oldKeys = new Set(projects.map(p => p.key));
  const changes = {
    kept: [...byKey.keys()].filter(k => oldKeys.has(k)).length,
    newKeys: [...byKey.keys()].filter(k => !oldKeys.has(k)).length,
    goneKeys: [...oldKeys].filter(k => !byKey.has(k)).length,
    splits: [...keyMap.values()].filter(s => s.size > 1).length,
  };
  return { data, totals, overridden, check: { dupKeys, missing, developments: after.length }, changes, keyMap };
}

async function main() {
  const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(ROOT, 'data');
  const recs = await loadRecords(false);
  const res = audit(recs, { log: () => {} });
  const ovFile = readJSON(path.join(ROOT, 'data', 'tree-overrides.json'));
  const b = build(res, ovFile, recs.records, readJSON(path.join(ROOT, 'data', 'areas.json')));
  if (b.check.dupKeys.length || b.check.missing.length) throw new Error(`tree developments don't check out: ${b.check.dupKeys.length} duplicate keys, ${b.check.missing.length} missing (${b.check.missing.slice(0, 5).join(', ')})`);
  const doc = {
    ...b.data,
    note: 'Steps B1–B2: the trees as the developments (js/tree-groups.js) and their counts (js/tree-counts.js). Rules: js/tree.js countTree with the chronology rules approved 2026-10-15; decisions from data/tree-overrides.json. Rebuilt with the snapshot by scripts/build-tree-counts.js.',
    generatedAt: new Date().toISOString(), snapshotAt: recs.generatedAt,
    rules: (ovFile && ovFile.rules) ? Object.keys(ovFile.rules) : [], overrides: b.overridden,
    totals: b.totals, keyChanges: b.changes,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tree-counts.json'), JSON.stringify(doc));
  const t = b.totals.Peel;
  console.log(`tree developments: ${b.data.devs.length} trees · live ${t.developmentsBefore} → ${t.developments} · Peel previous ${t.previous} → tree ${t.tree} · keys kept ${b.changes.kept}, new ${b.changes.newKeys}, gone ${b.changes.goneKeys}, split ${b.changes.splits} · ${Object.keys(b.data.permits).length} permits placed by the tree · ${b.overridden} overrides`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { build };
