#!/usr/bin/env node
/*
 * Step B0: the review workbook for applying the tree (report only; the app is unchanged).
 *
 * One row per change group: the app development(s) and the tree(s) that share files with them,
 * with app units vs tree units, the counting rule, the lowest link confidence, the primary plan,
 * the receiving plant and flags, plus blank "your call" columns. Overrides already decided
 * (data/tree-overrides.json) are applied to the "after overrides" totals.
 *
 *   node scripts/tree-review.js                 → docs/tree-review/tree-review.json
 *   python3 scripts/tree-review-xlsx.py         → docs/tree-review/tree-review.xlsx
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { audit, loadRecords } = require('./audit-tree.js');
const D = require('../js/demand.js');

const ROOT = path.join(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const CONF = { high: 3, medium: 2, low: 1 };

// Point in a (multi)polygon given as [[[ [x, y], … ]]] (blocks.json parts).
function pip(x, y, ring) { let inside = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; }
const inParts = (x, y, parts) => (parts || []).some(poly => poly.length && pip(x, y, poly[0]) && !poly.slice(1).some(h => pip(x, y, h)));

// Overrides you have decided: key "Municipality|ROOT-FILE" → { units, reason, source, decidedOn }.
function loadOverrides() {
  const o = readJSON(path.join(DATA, 'tree-overrides.json'));
  return new Map(Object.entries((o && o.overrides) || {}));
}

function review(res, overrides = new Map()) {
  const { nodes, built, links, counts, treeOfNode, tagsByTree, comps, projByKey, refOf, straddling } = res.internals;
  const blocks = (readJSON(path.join(DATA, 'blocks.json')) || {}).blocks || [];
  const plantAt = (x, y) => { const b = blocks.find(k => inParts(x, y, k.parts)); return b ? { plant: b.plant, block: `Block ${b.id}` } : { plant: 'none', block: '' }; };
  const PLANT = { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood', Toronto: 'Toronto', none: 'no plant' };

  // Lowest confidence of the links inside each tree.
  const idIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const conf = new Map();
  for (const l of links) {
    const a = idIdx.get(l.type === 'parent' ? l.child : l.a), k = treeOfNode.get(a); if (k == null) continue;
    const v = CONF[l.confidence] || 2; conf.set(k, Math.min(conf.get(k) || 3, v));
  }
  const confTxt = v => (v == null ? 'single file' : v === 3 ? 'high' : v === 2 ? 'medium' : 'low');

  const rows = [];
  let gid = 0;
  for (const { trees: ts, projs: ps } of comps.values()) {
    const tks = ts.map(Number);
    const live = tks.filter(k => !counts[k].t.nodes.every(i => nodes[i].cancelled));
    const projs = ps.map(k => projByKey.get(k)).filter(p => p && p.phase !== 'cancelled' && p.records.some(r => r.kind === 'application'));
    if (!live.length && !projs.length) continue;
    gid++;
    const appUnits = projs.reduce((t, p) => t + (p.units || 0), 0);
    const appPlanned = projs.reduce((t, p) => t + (p.buildout ? p.buildout.planned : 0), 0);
    const treeRows = live.map(k => {
      const { t, c } = counts[k], rootI = t.nodes[0], root = nodes[rootI];
      const tag = tagsByTree[k];
      const rec = t.nodes.flatMap(i => nodes[i].records).find(r => r.lng != null && r.lat != null);
      const sv = rec ? plantAt(rec.lng, rec.lat) : { plant: 'none', block: '' };
      const roles = [...new Set(t.nodes.filter(i => !nodes[i].cancelled).map(i => nodes[i].role))];
      // A pre-consultation estimate: the count comes only from pre-consultation files (the tree's own
      // fallback says so, or every file stating a count is a pre-consultation, by role or by its PRE file
      // number: a large one is promoted to a block-plan root but is still a pre-consultation).
      const stating = t.nodes.filter(i => !nodes[i].cancelled && nodes[i].units > 0);
      const preconOnly = /pre-consultation/i.test(c.basis) || (c.units > 0 && stating.length > 0 && stating.every(i => nodes[i].role === 'precon' || nodes[i].refs.some(r => /^PRE[-.]?\d/i.test(r))));
      const lookup = t.nodes.map(i => nodes[i].refs.map(r => built.lookups && built.lookups.get(`${nodes[i].municipality}|${r}`)).find(Boolean)).find(Boolean);
      const key = `${root.municipality}|${refOf(rootI)}`;
      const ov = overrides.get(key);
      return {
        key, municipality: root.municipality, root: refOf(rootI), rootRole: root.role, files: t.nodes.map(refOf), roles,
        units: c.units, basis: c.basis, confidence: confTxt(conf.get(k)),
        plan: tag && tag.primary ? `${tag.primary.kind === 'OP character area' ? 'OP area: ' : ''}${tag.primary.name}` : '',
        planShare: tag && tag.primary ? Math.round(tag.primary.share * 100) : null,
        plant: PLANT[sv.plant] || sv.plant, block: sv.block,
        preconOnly, lookedUp: /found online/.test(c.basis) || !!(lookup && lookup.units > 0), lookupSource: lookup ? lookup.source || '' : '', growthKind: c.growth ? c.growth.kind : '', flags: (c.flags || []).length,
        override: ov ? ov.units : null, overrideReason: ov ? ov.reason : '',
      };
    });
    const treeUnits = treeRows.reduce((t, x) => t + x.units, 0);
    const afterOv = treeRows.reduce((t, x) => t + (x.override != null ? x.override : x.units), 0);
    const change = treeUnits - appUnits;
    const kind = projs.length === 1 && treeRows.length > 1 ? 'split: one app development, several trees'
      : projs.length > 1 && treeRows.length === 1 ? 'merge: one tree over several app developments'
      : projs.length > 1 && treeRows.length > 1 ? 'regrouped'
      : !projs.length ? 'new: tree with no app development'
      : !treeRows.length ? 'gone: app development with no live tree'
      : change === 0 ? 'unchanged' : appUnits === 0 ? 'count found (app had 0)' : treeUnits === 0 ? 'count dropped to 0' : 'count changed';
    const flags = [];
    if (treeRows.some(x => x.preconOnly)) flags.push('estimate (pre-consultation)');
    if (treeRows.some(x => x.lookedUp)) flags.push('count from data/unit-lookups.json');
    if (treeRows.some(x => x.confidence === 'low')) flags.push('low-confidence link');
    if (treeRows.some(x => x.flags)) flags.push('children exceed parent');
    if (treeRows.some(x => x.planShare != null && x.planShare < 90)) flags.push('straddles plans');
    rows.push({
      group: gid, municipality: (treeRows[0] || {}).municipality || (projs[0] || {}).municipality || '',
      appDevelopments: projs.map(p => p.title), appKeys: projs.map(p => p.key), appPhase: [...new Set(projs.map(p => p.phase))],
      committedNow: projs.some(p => D.isCommitted(p)),
      appUnits, appPlanned, treeUnits, afterOverrides: afterOv, change, absChange: Math.abs(change), kind, flags,
      trees: treeRows,
    });
  }
  rows.sort((a, b) => b.absChange - a.absChange);

  // Totals, by municipality: the app (header) definition vs the tree vs after overrides.
  const totals = {};
  for (const r of rows) for (const m of [r.municipality, 'Peel']) {
    const t = totals[m] = totals[m] || { groups: 0, appUnits: 0, treeUnits: 0, afterOverrides: 0, up: 0, down: 0, unchanged: 0, preconEstimates: 0, preconUnits: 0 };
    t.groups++; t.appUnits += r.appUnits; t.treeUnits += r.treeUnits; t.afterOverrides += r.afterOverrides;
    if (r.change > 0) t.up++; else if (r.change < 0) t.down++; else t.unchanged++;
    const pre = r.trees.filter(x => x.preconOnly); if (pre.length) { t.preconEstimates++; t.preconUnits += pre.reduce((s, x) => s + x.units, 0); }
  }
  const byKind = {}; for (const r of rows) { const k = byKind[r.kind] = byKind[r.kind] || { groups: 0, change: 0 }; k.groups++; k.change += r.change; }

  return {
    generatedAt: new Date().toISOString(), snapshotAt: res.records.snapshotAt,
    note: 'Step B0 review (report only). App units = the app’s development units today (the header definition). Tree units = one count per tree (js/tree.js countTree). Your call: accept, or override with units and a reason; overrides go into data/tree-overrides.json.',
    totals, byKind, rows,
    lists: {
      doubleCounts: res.doubleCounts, unitMismatches: res.unitMismatches, nestedFormalNotLinked: res.review.nestedFormalNotLinked, condoOnlyTrees: res.review.condoOnlyTrees,
      sameLandUnclear: (res.doubleCounts.sameLandSitePlans.pairs || []).filter(p => p.verdict === 'unclear'),
      orphans: res.orphans.withUnits, dateReversed: res.dateReversed, growthToFind: res.growthNoCount.toFind,
      lowConfidenceLinks: res.links.lowConfidence, straddling, planAmendments: res.planAmendments.byDevelopment.slice(0, 300),
    },
  };
}

async function main() {
  const res = audit(await loadRecords(false), { log: () => {} });
  const out = review(res, loadOverrides());
  const dir = path.join(ROOT, 'docs', 'tree-review'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tree-review.json'), JSON.stringify(out));
  const t = out.totals.Peel;
  console.log(`tree review: ${out.rows.length} groups · Peel app ${t.appUnits} → tree ${t.treeUnits} (after overrides ${t.afterOverrides}) · up ${t.up}, down ${t.down}, unchanged ${t.unchanged} · pre-consultation estimates ${t.preconEstimates} (${t.preconUnits} units)`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { review, inParts };
