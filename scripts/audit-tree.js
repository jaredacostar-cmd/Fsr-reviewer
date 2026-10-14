#!/usr/bin/env node
/*
 * Audit: how planning applications nest into developments (Step A — report only; the app is unchanged).
 *
 * Builds the current grouping (js/phases.js, exactly as the app does) and the proposed containment
 * trees (js/tree.js) from the same records, and writes data/tree-audit.json:
 *   counts by role and municipality · boundary coverage · every reclassified file · links by rule
 *   and confidence · every low-confidence link · double counts · unit mismatches · orphans ·
 *   Peel unit totals current vs proposed by municipality · the 20 biggest changes with reasons.
 *
 *   node scripts/audit-tree.js            records from data/snapshot.json (boundaries included)
 *   node scripts/audit-tree.js --live     a fresh pull of every source (GitHub Actions: the
 *                                         municipal ArcGIS services aren't reachable everywhere)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../js/phases.js');
const T = require('../js/tree.js');
const { decodeRecord, buildSnapshot } = require('./build-snapshot.js');
const { countUnitsFromText } = require('./build-snapshot-index.js');

const DATA = path.join(__dirname, '..', 'data');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const inc = (o, ...ks) => { let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]] = x[ks[i]] || {}; x[ks[ks.length - 1]] = (x[ks[ks.length - 1]] || 0) + 1; };
const MUNIS = ['Mississauga', 'Brampton', 'Caledon'];

async function loadRecords(live) {
  let snap = readJSON(path.join(DATA, 'snapshot.json'));
  if (live) snap = (await buildSnapshot({ previous: snap, log: m => console.log(m) })).snapshot;
  if (!snap) throw new Error('no snapshot');
  const names = new Map(snap.sources.map(s => [s.id, s.name]));
  const decoded = snap.records.map(o => decodeRecord(o, names.get(String(o.sourceId).split('/')[0])));
  countUnitsFromText(decoded);   // the browser's pass on snapshot records (js/app.js applySnapshot)
  // Every raw record whose type field is mis-mapped, before records of one file merge (the same
  // file usually comes from another layer too, with the right type, and that copy is kept).
  const keyOf = r => `${r.municipality}|${r.kind}|${r.fileKey || P.canonRef(r.ref)}`;
  const layersOf = new Map(); for (const r of decoded) { const k = keyOf(r); if (!layersOf.has(k)) layersOf.set(k, new Set()); layersOf.get(k).add(r.sourceId); }
  const misTyped = decoded.filter(r => r.kind === 'application').map(r => ({ r, c: T.classifyRole(r) })).filter(x => x.c.reclassified)
    .map(({ r, c }) => ({ ref: r.ref, sourceId: r.sourceId, typeField: r.type, stage: r.stage, role: c.role, reason: c.reclassified.reason, alsoIn: [...layersOf.get(keyOf(r))].filter(s => s !== r.sourceId) }));
  return { misTyped, records: P.dedupeRecords(decoded), generatedAt: snap.generatedAt, sources: snap.sources.map(s => ({ id: s.id, status: s.status, count: s.count })) };
}

function audit({ records, generatedAt, sources, misTyped = [] }, { live = false, log = console.log } = {}) {
  // Current grouping, as the app builds it.
  const projects = P.buildProjects(records);
  const projOfUid = new Map(); for (const p of projects) for (const r of p.records) projOfUid.set(r.uid, p);
  // Proposed trees.
  const nodes = T.fileNodes(records);
  const permits = records.filter(r => r.kind === 'permit');
  const built = T.buildTrees(nodes, { permits, log });
  // Counts found online for files that state none (curated, with the page they came from).
  const lk = readJSON(path.join(DATA, 'unit-lookups.json'));
  built.lookups = new Map(Object.entries((lk && lk.files) || {}));
  const { links, trees, flags, permitOf } = built;
  const counts = trees.map(t => ({ t, c: T.countTree(t, built) }));
  const treeOfNode = new Map(); counts.forEach(({ t }, k) => t.nodes.forEach(i => treeOfNode.set(i, k)));
  const nodeOfUid = new Map(); nodes.forEach((n, i) => n.records.forEach(r => nodeOfUid.set(r.uid, i)));
  const refOf = i => nodes[i].refs[0] || nodes[i].id;

  // 1. Roles.
  const byRole = {}, boundary = {};
  for (const n of nodes) { inc(byRole, n.municipality, n.role); inc(boundary, n.municipality, n.role, n.rings ? 'boundary' : 'point only'); }
  const reclassified = nodes.flatMap(n => n.reclassified.map(r => ({ ...r, role: n.role })));
  const ozs = nodes.filter(n => n.records.some(r => String(r.sourceId).startsWith('bra-opa-zba-sub')));
  const ozsSplit = { total: ozs.length, landDivisionAndUse: ozs.filter(n => n.roles.includes('land_division') && n.roles.includes('use')).length, landDivisionOnly: ozs.filter(n => n.roles.includes('land_division') && !n.roles.includes('use')).length, useOnly: ozs.filter(n => n.role === 'use').length, blockPlan: ozs.filter(n => n.roles.includes('block_plan')).length };

  // 2. Links.
  const byRule = {};
  for (const l of links) inc(byRule, l.rule, l.confidence);
  const idIdx = new Map(nodes.map((n, i) => [n.id, i]));
  const lowConfidence = links.filter(l => l.confidence === 'low').map(l => l.type === 'parent'
    ? { child: refOf(idIdx.get(l.child)), childRole: nodes[idIdx.get(l.child)].role, parent: refOf(idIdx.get(l.parent)), parentRole: nodes[idIdx.get(l.parent)].role, rule: l.rule, overlap: l.overlap, point: l.point, sameAddress: l.addr, dateOrder: l.order, municipality: nodes[idIdx.get(l.child)].municipality }
    : { a: refOf(idIdx.get(l.a)), b: refOf(idIdx.get(l.b)), rule: l.rule, overlap: l.overlap, point: l.point, sameAddress: l.addr, municipality: nodes[idIdx.get(l.a)].municipality });

  // 3. Double counts: files the current app puts in two developments; files claimed by two trees.
  const projsOfNode = nodes.map(n => new Set(n.records.map(r => projOfUid.get(r.uid)).filter(Boolean)));
  const currentSplit = nodes.map((n, i) => ({ i, ps: [...projsOfNode[i]] })).filter(x => x.ps.length > 1 && nodes[x.i].units > 0)
    .map(x => ({ file: refOf(x.i), units: nodes[x.i].units, inDevelopments: x.ps.map(p => p.title) }));

  // 4. Unit mismatches (children above the parent by more than 10%).
  const mismatches = counts.flatMap(({ c }) => c.flags);

  // 5. Orphans: formal files with a count that link to nothing.
  const linked = new Set(); for (const l of links) { if (l.type === 'parent') { linked.add(l.child); linked.add(l.parent); } else { linked.add(l.a); linked.add(l.b); } }
  const orphanCount = {}; const orphans = [];
  nodes.forEach((n, i) => { if (linked.has(n.id) || n.cancelled) return; inc(orphanCount, n.municipality, n.role); if (n.units >= 50 && n.role !== 'precon') orphans.push({ file: refOf(i), role: n.role, units: n.units, municipality: n.municipality, boundary: !!n.rings }); });
  orphans.sort((a, b) => b.units - a.units);

  // 6. Totals: current (application units on the app's developments) vs proposed (one count per tree).
  const totals = {};
  for (const m of [...MUNIS, 'Peel']) totals[m] = { currentPlanned: 0, currentUnits: 0, proposed: 0, developmentsCurrent: 0, treesProposed: 0 };
  for (const p of projects) {
    if (p.phase === 'cancelled') continue;
    const t = totals[p.municipality]; if (!t) continue;
    const planned = p.buildout ? p.buildout.planned : 0;
    if (!p.records.some(r => r.kind === 'application')) continue;   // permit-only sites aren't application trees
    t.currentPlanned += planned; t.currentUnits += p.units || 0; t.developmentsCurrent++;
    totals.Peel.currentPlanned += planned; totals.Peel.currentUnits += p.units || 0; totals.Peel.developmentsCurrent++;
  }
  for (const { t, c } of counts) {
    const m = nodes[t.nodes[0]].municipality, x = totals[m]; if (!x || t.nodes.every(i => nodes[i].cancelled)) continue;
    x.proposed += c.units; x.treesProposed++; totals.Peel.proposed += c.units; totals.Peel.treesProposed++;
  }

  // 7. The biggest changes: components joining the app's developments and the trees that share files.
  const uf = new Map(), find = k => { while (uf.get(k) !== k) { uf.set(k, uf.get(uf.get(k))); k = uf.get(k); } return k; }, add = k => { if (!uf.has(k)) uf.set(k, k); }, join = (a, b) => { add(a); add(b); uf.set(find(a), find(b)); };
  nodes.forEach((n, i) => { add(`t${treeOfNode.get(i)}`); for (const p of projsOfNode[i]) join(`t${treeOfNode.get(i)}`, `p${p.key}`); });
  const comps = new Map();
  for (const k of uf.keys()) { const r = find(k); if (!comps.has(r)) comps.set(r, { trees: [], projs: [] }); (k[0] === 't' ? comps.get(r).trees : comps.get(r).projs).push(k.slice(1)); }
  const projByKey = new Map(projects.map(p => [p.key, p]));
  const changes = [];
  for (const { trees: ts, projs: ps } of comps.values()) {
    const cur = ps.reduce((s, k) => { const p = projByKey.get(k); return s + (p && p.phase !== 'cancelled' && p.buildout ? p.buildout.planned : 0); }, 0);
    const prop = ts.reduce((s, k) => s + counts[+k].c.units, 0);
    if (cur === prop) continue;
    const treeInfo = ts.map(k => { const { t, c } = counts[+k]; return { files: t.nodes.map(refOf), units: c.units, basis: c.basis }; });
    const why = [];
    if (ps.length === 1 && ts.length > 1) why.push(`the app groups ${ts.length} separate trees into one development (${treeInfo.map(x => x.files[0]).join(', ')}): the files don't overlap enough to be one proposal`);
    if (ts.length === 1 && ps.length > 1) why.push(`one tree spread over ${ps.length} developments in the app (${ps.map(k => (projByKey.get(k) || {}).title).join('; ')})`);
    for (const x of treeInfo) why.push(`${x.files.slice(0, 6).join(' + ')}${x.files.length > 6 ? ` +${x.files.length - 6}` : ''}: ${x.units} (${x.basis})`);
    const p0 = projByKey.get(ps[0]);
    changes.push({ municipality: p0 ? p0.municipality : null, development: ps.map(k => (projByKey.get(k) || {}).title).slice(0, 3), current: cur, proposed: prop, change: prop - cur, currentBasis: p0 && p0.buildout ? p0.buildout.basis : null, why });
  }
  changes.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // Developments where no file states a count: what kind of growth the wording names. Active ones
  // still to find a count for are listed (address, wording) for the online lookup.
  const YR = 365.25 * 864e5, nowMs = Date.now();
  const noCount = {}, toFind = [];
  for (const { t, c } of counts) {
    const live = t.nodes.filter(i => !nodes[i].cancelled); if (!live.length || !c.growth) continue;
    const recs = live.flatMap(i => nodes[i].records);
    const last = Math.max(0, ...recs.flatMap(r => (r.events || []).map(e => +e.date)));
    const built5 = recs.every(r => /approved|permit|construction|completed/.test(r.phase)) && nowMs - last > 5 * YR;
    const k = `${c.growth.kind}${built5 ? ' (approved 5+ years ago)' : ''}`;
    const m = nodes[live[0]].municipality; inc(noCount, m, k); inc(noCount, 'Peel', k);
    if (!built5 && ['count to find', 'mixed use, check', 'no description'].includes(c.growth.kind)) toFind.push({ municipality: m, kind: c.growth.kind, files: live.map(refOf), address: [...new Set(recs.map(r => r.address).filter(Boolean))].slice(0, 3), description: [...new Set(recs.map(r => r.description).filter(Boolean))].join(' / ').slice(0, 400), phase: recs.map(r => r.phase), lastEvent: last ? new Date(last).toISOString().slice(0, 10) : null });
  }
  const growthNoCount = { note: 'Developments with no stated count, by the growth their wording names. Non-residential and no-new-homes are not counted; one new house counts 1; counts found online come from data/unit-lookups.json.', byKind: noCount, foundOnline: counts.filter(x => x.c.growth && x.c.growth.kind === 'found online').length, toFind: toFind.sort((a, b) => String(b.lastEvent).localeCompare(String(a.lastEvent))) };

  // Official plan amendments (policy, never counted): the latest that applies to each development.
  const pa = T.planAmendments(built);
  const opaRows = counts.map(({ t, c }, k) => pa[k] && { municipality: nodes[t.nodes[0]].municipality, files: t.nodes.map(refOf).slice(0, 8), units: c.units, latest: pa[k].latest, siteSpecific: pa[k].all.filter(x => x.scope === 'site-specific').length, areaWide: pa[k].all.filter(x => x.scope === 'area-wide').length }).filter(Boolean);
  const planAmendmentsOut = {
    note: 'Policy only, never counted. Site-specific: a file in the development asks for the amendment. Area-wide: an amendment file with no count, larger than 4 km², or larger than and holding a file of the development.',
    amendmentFiles: nodes.filter(n => !n.cancelled && T.isOpa(n)).length, areaWidePolicyFiles: nodes.filter(n => n.policy).map(n => ({ ref: n.refs[0], municipality: n.municipality, km2: +(n.area / 1e6).toFixed(1) })),
    developmentsWithOne: opaRows.length, latestSiteSpecific: opaRows.filter(r => r.latest.scope === 'site-specific').length, latestAreaWide: opaRows.filter(r => r.latest.scope === 'area-wide').length,
    byDevelopment: opaRows.sort((a, b) => b.units - a.units),
  };
  // Same-land site plans with different counts: phase / resubmission / redevelopment / unclear.
  const verdicts = {};
  for (const f of flags.sameLandSitePlans) { const v = verdicts[f.verdict] = verdicts[f.verdict] || { pairs: 0, unitsOnEarlierFile: 0, unitsOnLaterFile: 0 }; v.pairs++; v.unitsOnEarlierFile += f.units[0] || 0; v.unitsOnLaterFile += f.units[1] || 0; }

  // Permits (progress only): how many found a file.
  const permitsPlaced = [...permitOf.values()].reduce((t, l) => t + l.length, 0);

  return {
    generatedAt: new Date().toISOString(), records: { from: live ? 'live pull' : 'data/snapshot.json', snapshotAt: generatedAt, sources },
    thresholds: { containInside: T.T.CONTAIN, sameLandMutual: T.T.SAME, preconMin: T.T.PRECON, neverBelow: T.T.NEVER, coverChildren: T.T.COVER, childrenOverParent: T.T.OVER },
    files: { total: nodes.length, byRole, boundary, ozsSplit, reclassified,
      misTypedRecords: { total: misTyped.length, alsoInAnotherLayer: misTyped.filter(m => m.alsoIn.length).length, onlyInThisLayer: misTyped.filter(m => !m.alsoIn.length).length, byTypeField: misTyped.reduce((o, m) => (o[m.typeField] = (o[m.typeField] || 0) + 1, o), {}), byRole: misTyped.reduce((o, m) => (o[m.role] = (o[m.role] || 0) + 1, o), {}), list: misTyped } },
    links: { total: links.length, byRule, lowConfidence },
    review: {
      nestedFormalNotLinked: (flags.nestedFormal || []).sort((a, b) => Math.max(b.innerUnits, b.outerUnits) - Math.max(a.innerUnits, a.outerUnits)),
      condoOnlyTrees: counts.filter(x => x.c.condoOnly && x.c.condoOnly.units > 0).map(x => ({ ...x.c.condoOnly, municipality: nodes[x.t.nodes[0]].municipality })).sort((a, b) => b.units - a.units),
    },
    doubleCounts: { currentFileInTwoDevelopments: currentSplit, proposedFileInTwoTrees: flags.twoTrees, sameLandSitePlans: { verdicts, how: 'Scored from the files: phase/tower/block wording, revision wording, approval status, filing gap, description similarity, counts within 25%. A margin of 2 decides; 8+ years after an approved or completed file is a redevelopment. Resubmissions and redevelopments count the later file only; phases count both; unclear pairs count both and are listed for review.', pairs: flags.sameLandSitePlans }, crossMunicipality: flags.crossMuni, preconOverlappingTwo: flags.precon },
    planAmendments: planAmendmentsOut,
    growthNoCount,
    dateReversed: flags.dateReversed,
    unitMismatches: mismatches,
    orphans: { byMunicipalityRole: orphanCount, withUnits: orphans.slice(0, 200), withUnitsTotal: orphans.length },
    permits: { total: permits.length, placedInATree: permitsPlaced },
    totals,
    biggestChanges: changes.slice(0, 20),
    changesCount: { components: changes.length, up: changes.filter(c => c.change > 0).length, down: changes.filter(c => c.change < 0).length },
  };
}

async function main() {
  const live = process.argv.includes('--live');
  const i = process.argv.indexOf('--out'), out = i > 0 ? process.argv[i + 1] : path.join(DATA, 'tree-audit.json');
  const t0 = Date.now();
  const res = audit(await loadRecords(live), { live });
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  const tt = res.totals;
  console.log(`tree audit: ${res.files.total} files, ${res.links.total} links (${res.links.lowConfidence.length} low confidence), ${res.files.reclassified.length} reclassified; ` +
    `Peel application units current ${tt.Peel.currentPlanned} vs proposed ${tt.Peel.proposed}; ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { audit, loadRecords };
