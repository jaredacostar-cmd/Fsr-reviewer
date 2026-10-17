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
const TR = require('../js/tree.js');

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
  const m = new Map(Object.entries((o && o.overrides) || {}));
  // Groups you reviewed and accepted as they stand (keyed by tree root).
  m.reviewed = new Set(((o && o.accepted && o.accepted.reviewed) || {}).roots || []);
  return m;
}

// Your bulk decisions of 2026-10-15 (data/tree-overrides.json "accepted"): accept the safe
// categories; everything else is left as Ask with the reason. An override always wins.
function callOf(r) {
  const big = Math.abs(r.change) >= 100, low = r.flags.includes('low-confidence link');
  if (r.trees.some(t => t.override != null)) return { call: 'Override', why: 'your override' };
  if (r.reviewed) return { call: 'Accept', why: 'you reviewed and accepted it (2026-10-15)' };
  // Large pre-consultation estimates come first: they matter even where the app already counts them.
  if (r.flags.includes('estimate (pre-consultation)')) return r.treeUnits >= 1000
    ? { call: 'Ask', why: 'large pre-consultation estimate (1,000+ units): is it still a live proposal?' }
    : { call: 'Accept', why: 'rule: a pre-consultation count stands when nothing else states one (proposed only, never committed)' };
  if (r.kind === 'unchanged') return { call: 'Accept', why: 'no change' };
  if (r.kind === 'count found (app had 0)') return { call: 'Accept', why: 'rule: the tree found a count where the app had 0' };
  if (r.kind.startsWith('split')) return r.change <= -100
    ? { call: 'Ask', why: 'a split that lowers the count by 100+ units' }
    : { call: 'Accept', why: 'rule: separate proposals the app grouped together' };
  if (r.kind === 'count dropped to 0' || r.kind.startsWith('gone')) return { call: 'Accept', why: 'rule: a replacement house, no new homes, or the app counted a withdrawn file' };
  if (r.kind.startsWith('new')) return { call: 'Accept', why: 'rule: a tree the app had no development for' };
  if ((r.kind.startsWith('merge') || r.kind === 'regrouped') && big) return { call: 'Ask', why: `${r.kind.split(':')[0]} changes the count by ${r.change > 0 ? '+' : ''}${r.change}${low ? ' on a low-confidence link' : ''}` };
  if (r.kind === 'count changed' && (r.change <= -100 || (low && big))) return { call: 'Ask', why: `the count changes by ${r.change > 0 ? '+' : ''}${r.change}${low ? ' on a low-confidence link' : ''}` };
  return { call: 'Accept', why: 'rule: a small or well-linked change' };
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
      const lookup = t.nodes.map(i => TR.lookupOf(nodes[i], built.lookups)).find(Boolean);
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
    const reviewed = !!(overrides.reviewed && treeRows.some(x => overrides.reviewed.has(x.key)));
    const call = callOf({ kind, change, treeUnits, flags, trees: treeRows, reviewed });
    rows.push({
      call: call.call, callWhy: call.why,
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
    const t = totals[m] = totals[m] || { ask: 0, askChange: 0, groups: 0, appUnits: 0, treeUnits: 0, afterOverrides: 0, up: 0, down: 0, unchanged: 0, preconEstimates: 0, preconUnits: 0 };
    if (r.call === 'Ask') { t.ask++; t.askChange += r.change; }
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

// Chronology rules (proposed; report only): model js/tree.js r1–r4 one at a time, cumulatively, and
// list what each step changes. r5 is the filing order of every tree, with backwards steps marked.
const STEPS = [
  { key: 'r1', label: 'Rule 1: undated files take the year in their file number' },
  { key: 'r2', label: 'Rule 2: old approvals (3+ years before a newer proposal) become history' },
  { key: 'r3', label: 'Rule 3: same land: the latest file wins only when it replaces the earlier one' },
  { key: 'r4', label: 'Rule 4: permits issued 2+ years before their file are the old building' },
];
const iso = t => (t == null ? null : new Date(t).toISOString().slice(0, 10));
function snapshotOf(res) {
  const { nodes, counts } = res.internals;
  const treeOf = new Map(), trees = counts.map(({ t, c }, k) => ({ k, units: c.units || 0, basis: c.basis, nodes: t.nodes.map(i => nodes[i].id), root: nodes[t.nodes[0]].refs[0] || nodes[t.nodes[0]].id, muni: nodes[t.nodes[0]].municipality }));
  trees.forEach(t => t.nodes.forEach(id => treeOf.set(id, t.k)));
  return { trees, treeOf };
}
// Groups of files whose trees differ between two runs (by membership or count).
function diffRuns(A, B) {
  const ids = [...A.treeOf.keys()], uf = new Map(ids.map(x => [x, x]));
  const find = x => { while (uf.get(x) !== x) { uf.set(x, uf.get(uf.get(x))); x = uf.get(x); } return x; };
  const join = (a, b) => { uf.set(find(a), find(b)); };
  for (const S of [A, B]) for (const t of S.trees) for (const id of t.nodes.slice(1)) join(t.nodes[0], id);
  const comp = new Map();
  for (const S of [A, B]) S.trees.forEach(t => { const r = find(t.nodes[0]); if (!comp.has(r)) comp.set(r, { a: new Set(), b: new Set() }); comp.get(r)[S === A ? 'a' : 'b'].add(t.k); });
  const out = [];
  for (const { a, b } of comp.values()) {
    const ta = [...a].map(k => A.trees[k]), tb = [...b].map(k => B.trees[k]);
    const ua = ta.reduce((s, t) => s + t.units, 0), ub = tb.reduce((s, t) => s + t.units, 0);
    const same = ta.length === tb.length && ta.every(t => tb.some(u => u.units === t.units && u.nodes.length === t.nodes.length && u.nodes.every(id => t.nodes.includes(id))));
    if (same) continue;
    out.push({ municipality: (ta[0] || tb[0]).muni, before: ta.map(t => `${t.root}: ${t.units.toLocaleString('en-CA')}`), after: tb.map(t => `${t.root}: ${t.units.toLocaleString('en-CA')}`), beforeUnits: ua, afterUnits: ub, change: ub - ua, treesBefore: ta.length, treesAfter: tb.length, basisAfter: tb.map(t => t.basis), files: [...new Set(ta.concat(tb).flatMap(t => t.nodes))].length });
  }
  return out.sort((x, y) => Math.abs(y.change) - Math.abs(x.change) || y.files - x.files);
}
function chronoModel(data, log = () => {}) {
  const T = require('../js/tree.js');
  const runs = [{ key: 'today', label: 'Before the chronology rules', res: audit(data, { log: () => {}, chrono: {} }) }];
  const on = {};
  for (const st of STEPS) { on[st.key] = true; log(`modelling ${st.key}`); runs.push({ ...st, res: audit(data, { log: () => {}, chrono: { ...on } }) }); }
  const muniUnits = res => { const o = { Peel: 0 }; for (const { t, c } of res.internals.counts) { const m = res.internals.nodes[t.nodes[0]].municipality; o[m] = (o[m] || 0) + (c.units || 0); o.Peel += c.units || 0; } return o; };
  const snaps = runs.map(r => snapshotOf(r.res));
  const steps = runs.map((r, k) => ({ key: r.key, label: r.label, trees: r.res.internals.counts.length, units: muniUnits(r.res), change: k ? muniUnits(r.res).Peel - muniUnits(runs[k - 1].res).Peel : 0, changes: k ? diffRuns(snaps[k - 1], snaps[k]) : [] }));
  const last = runs[runs.length - 1].res.internals, first = runs[0].res.internals;
  // r1: which files were dated from their number.
  const r1 = runs[1].res.internals.nodes.filter(n => n.dateFrom === 'file number').map(n => ({ file: n.refs[0], municipality: n.municipality, role: n.role, filedFromNumber: iso(n.date0), units: n.units || 0 }));
  const stillUndated = runs[1].res.internals.nodes.filter(n => n.date0 == null).map(n => ({ file: n.refs[0] || n.id, municipality: n.municipality, role: n.role, units: n.units || 0 }));
  // r3: every same-land group where the latest file states a different count.
  const r3 = last.counts.filter(x => x.c.latestWins).map(({ t, c }) => ({ tree: last.nodes[t.nodes[0]].refs[0], municipality: last.nodes[t.nodes[0]].municipality, ...c.latestWins, counted: c.units }));
  // r5: filing order of every tree with two or more dated files, all rules on.
  const order = [];
  for (const { t, c } of last.counts) {
    const ch = T.chronology(t, last.built); if (ch.filter(x => x.filed).length < 2) continue;
    const bad = ch.filter(x => x.outOfOrder);
    order.push({ tree: ch[0].ref, municipality: last.nodes[t.nodes[0]].municipality, units: c.units || 0, files: ch.length, outOfOrder: bad.length, order: ch.map(x => `${x.filed || 'undated'}${x.dateFrom === 'file number' ? '*' : ''} ${x.ref} (${x.role}${x.units ? `, ${x.units}` : ''}${x.cancelled ? ', withdrawn' : ''})`).join(' → '), backwards: bad.map(x => `${x.ref} ${x.outOfOrder}`) });
  }
  order.sort((a, b) => (b.outOfOrder > 0) - (a.outOfOrder > 0) || b.units - a.units);
  const before = first.counts.reduce((s, x) => s + (x.c.units || 0), 0);
  return {
    note: 'Chronology rules (proposed; report only). Each step adds one rule to the ones before it; the app is unchanged. * = date from the file number.',
    base: before, steps: steps.map(s => ({ ...s, changes: undefined, groupsChanged: s.changes.length })), changes: steps.flatMap(s => s.changes.map(c => ({ step: s.label, ...c }))),
    lists: { datedFromNumber: r1, stillUndated, history: last.built.flags.history, latestVsLargest: r3, permitsEarly: last.built.flags.permitsEarly, order },
  };
}

async function main() {
  const data = await loadRecords(false);
  const res = audit(data, { log: () => {} });
  const out = review(res, loadOverrides());
  out.chrono = chronoModel(data, console.log);
  const dir = path.join(ROOT, 'docs', 'tree-review'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'tree-review.json'), JSON.stringify(out));
  const t = out.totals.Peel;
  for (const st of out.chrono.steps) console.log(`${st.label}: Peel ${st.units.Peel} (${st.change >= 0 ? '+' : ''}${st.change}) · ${st.groupsChanged} groups change`);
  console.log(`tree review: ${out.rows.length} groups · Ask ${t.ask} (net ${t.askChange}) · Peel app ${t.appUnits} → tree ${t.treeUnits} (after overrides ${t.afterOverrides}) · up ${t.up}, down ${t.down}, unchanged ${t.unchanged} · pre-consultation estimates ${t.preconEstimates} (${t.preconUnits} units)`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { review, inParts, callOf, chronoModel, diffRuns };
