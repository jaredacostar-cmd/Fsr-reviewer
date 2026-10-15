#!/usr/bin/env node
/*
 * Step B1: data/tree-counts.json — the tree counts inside today's developments.
 *
 * For each development (js/phases.js buildProjects key), the units of the trees whose root file it
 * holds: js/tree.js countTree with the chronology rules on, the counts found online
 * (data/unit-lookups.json) and your decisions (data/tree-overrides.json) applied. A tree whose root
 * file sits in two developments goes to the one holding most of its files. The app applies these
 * (js/tree-counts.js); it never builds the trees itself.
 *
 *   node scripts/build-tree-counts.js [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { audit, loadRecords } = require('./audit-tree.js');
const TC = require('../js/tree-counts.js');
const P = require('../js/phases.js');

const ROOT = path.join(__dirname, '..');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };

function build(res, overridesFile) {
  const { projects, nodes, counts, projsOfNode } = res.internals;
  const ov = (overridesFile && overridesFile.overrides) || {};
  const byProject = new Map();
  let overridden = 0;
  counts.forEach(({ t, c }) => {
    if (t.nodes.every(i => nodes[i].cancelled)) return;
    const rootI = t.nodes[0], root = nodes[rootI];
    const ps = [...projsOfNode[rootI]];
    if (!ps.length) return;
    const share = p => t.nodes.filter(i => projsOfNode[i].has(p)).length;
    ps.sort((a, b) => share(b) - share(a) || String(a.key).localeCompare(String(b.key)));
    const p = ps[0];
    const key = `${root.municipality}|${root.refs[0] || root.id}`;
    const o = ov[key];
    const stating = t.nodes.filter(i => !nodes[i].cancelled && nodes[i].units > 0);
    const precon = /pre-consultation/i.test(c.basis) || (c.units > 0 && stating.length > 0 && stating.every(i => nodes[i].role === 'precon' || nodes[i].refs.some(r => /^PRE[-.]?\d/i.test(r))));
    let units = c.units || 0, basis = c.basis || '', flag = precon ? 'estimate (pre-consultation)' : /found online/.test(basis) ? 'found online' : '';
    if (o && o.units != null) { units = o.units; basis = `your override (${o.decidedOn}): ${o.reason}`; flag = 'override'; overridden++; }
    if (!byProject.has(p)) byProject.set(p, []);
    byProject.get(p).push([root.refs[0] || root.id, units, basis, flag]);
  });
  // Developments holding files of a tree but not its root: counted with the root's development.
  const elsewhere = new Map();
  counts.forEach(({ t }) => {
    if (t.nodes.every(i => nodes[i].cancelled)) return;
    for (const i of t.nodes) for (const p of projsOfNode[i]) if (!elsewhere.has(p)) elsewhere.set(p, nodes[t.nodes[0]].refs[0] || nodes[t.nodes[0]].id);
  });
  const out = {}, totals = {};
  const add = (m, k, v) => { const t = totals[m] = totals[m] || { previous: 0, tree: 0, developments: 0, moved: 0 }; t[k] += v; };
  for (const p of projects) {
    const live = p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application');
    const ts = byProject.get(p);
    if (!ts && elsewhere.has(p)) {
      // Its files are counted in the tree rooted at another development's file: 0 here, with why.
      out[p.key] = { u: 0, s: TC.sigOf(p, P.canonRef), t: [], with: elsewhere.get(p) };
      if (live) for (const m of [p.municipality, 'Peel']) { add(m, 'previous', p.units || 0); add(m, 'developments', 1); if (p.units) add(m, 'moved', 1); }
      continue;
    }
    if (!ts) { if (live) for (const m of [p.municipality, 'Peel']) { add(m, 'previous', p.units || 0); add(m, 'tree', p.units || 0); add(m, 'developments', 1); } continue; }
    ts.sort((a, b) => b[1] - a[1]);
    const u = ts.reduce((s, x) => s + x[1], 0);
    out[p.key] = { u, s: TC.sigOf(p, P.canonRef), t: ts };
    if (live) for (const m of [p.municipality, 'Peel']) { add(m, 'previous', p.units || 0); add(m, 'tree', u); add(m, 'developments', 1); if (u !== (p.units || 0)) add(m, 'moved', 1); }
  }
  return { projects: out, totals, overridden };
}

async function main() {
  const outDir = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : path.join(ROOT, 'data');
  const data = await loadRecords(false);
  const res = audit(data, { log: () => {} });
  const ovFile = readJSON(path.join(ROOT, 'data', 'tree-overrides.json'));
  const b = build(res, ovFile);
  const doc = {
    version: 1,
    note: 'Step B1 tree counts per development (js/tree-counts.js applies them). Rules: js/tree.js countTree with the chronology rules approved 2026-10-15; decisions from data/tree-overrides.json. Rebuilt with the snapshot by scripts/build-tree-counts.js.',
    generatedAt: new Date().toISOString(), snapshotAt: data.generatedAt,
    rules: (ovFile && ovFile.rules) ? Object.keys(ovFile.rules) : [], overrides: b.overridden,
    totals: b.totals, projects: b.projects,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'tree-counts.json'), JSON.stringify(doc));
  const t = b.totals.Peel;
  console.log(`tree counts: ${Object.keys(b.projects).length} developments · Peel previous ${t.previous} → tree ${t.tree} · ${t.moved} developments move · ${b.overridden} overrides`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { build };
