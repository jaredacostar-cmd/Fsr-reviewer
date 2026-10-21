#!/usr/bin/env node
/*
 * Step 1 of site → proposal → file (js/sites.js): report only, the app is unchanged.
 *
 * Builds the trees (js/tree.js, as scripts/build-tree-counts.js does) and today's developments (as
 * the app builds them from data/snapshot.json and data/tree-counts.json), splits each tree into its
 * proposals and its site activity, and writes data/site-audit.json:
 *   files by scope · developments unchanged / site activity set aside / split / no proposal left ·
 *   homes before and after · developments whose stage would change · every split, with its files.
 *
 *   node scripts/audit-sites.js [--out data/site-audit.json]
 *
 * data/site-audit.json is the step 1 report (the developments before step 2 split them, with the
 * tree build of 2026-10-21). Run against a tree build that already splits them (step 2), "today"
 * is already the proposals and the report shows what is left to move.
 *
 * Counts on both sides are countTree's (js/tree.js) before data/tree-overrides.json, so the two
 * sides compare like for like.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../js/phases.js');
const T = require('../js/tree.js');
const S = require('../js/sites.js');
const TG = require('../js/tree-groups.js');
const TC = require('../js/tree-counts.js');
const CD = require('../js/council-decisions.js');
const { audit, loadRecords } = require('./audit-tree.js');

const DATA = path.join(__dirname, '..', 'data');
const readJSON = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { return null; } };
const inc = (o, ...ks) => { let x = o; for (let i = 0; i < ks.length - 1; i++) x = x[ks[i]] = x[ks[i]] || {}; x[ks[ks.length - 1]] = (x[ks[ks.length - 1]] || 0) + 1; };

function siteAudit({ records, generatedAt }, tree, council) {
  const res = audit({ records, generatedAt, sources: [] }, { log: () => {} });
  const { nodes, built, counts } = res.internals;
  // Today's developments, as the app builds them (tests/helpers/real-devs.js).
  if (council) CD.applyTo(records, council, P.canonRef);
  TG.setData(tree); TC.setData(tree);
  const projects = P.buildProjects(records, { regroup: parts => TG.regroup(parts) });
  TC.apply(projects, { mode: 'tree', data: tree, ringsArea: P.ringsArea });
  const byKey = new Map(projects.map(p => [p.key, p]));
  const devOf = id => { const d = tree.files[id]; return d == null ? null : tree.devs[d]; };
  const refOf = i => nodes[i].refs[0] || nodes[i].id;

  const scopes = {}, out = { unchanged: 0, siteSetAside: 0, split: 0, noProposal: 0 };
  const homes = { today: 0, proposals: 0 }, splits = [], stageChanges = [], noProposal = [], setAside = [];
  for (const { t, c } of counts) {
    if (t.nodes.every(i => nodes[i].cancelled)) continue;
    const d = devOf(nodes[t.nodes[0]].id), p = d && byKey.get(d.k);
    const { proposals, site, scope } = S.proposalsOf(t, built);
    // The main proposal first: the one holding the tree's root file, else the most homes.
    const unitsOf = x => T.countTree({ id: nodes[x.root].id, nodes: x.nodes }, built).units || 0;
    proposals.sort((a, b) => (b.nodes.includes(t.nodes[0]) - a.nodes.includes(t.nodes[0])) || unitsOf(b) - unitsOf(a));
    for (const i of t.nodes) inc(scopes, nodes[i].municipality, scope.get(i).scope);
    const today = c.units || 0;
    // Each proposal's count, its records and the permits today's development places in its files.
    const permits = p ? p.records.filter(r => r.kind === 'permit') : [];
    const fileOf = new Map(permits.map(r => [r, r.fileOf]));
    // A permit in a site file's boundary is site activity; one in no file stays with the main
    // proposal, as today (js/phases.js mergeProject still decides whether it moves the stage).
    const siteUids = new Set(site.flatMap(s => nodes[s.i].records.map(r => r.uid)));
    const props = proposals.map((x, k) => {
      const uids = new Set(x.nodes.flatMap(i => nodes[i].records.map(r => r.uid)));
      const mine = r => uids.has(fileOf.get(r)) || (k === 0 && !fileOf.get(r)) || (k === 0 && !siteUids.has(fileOf.get(r)) && !proposals.some(y => y.nodes.some(i => nodes[i].records.some(q => q.uid === fileOf.get(r)))));
      const recs = [...x.nodes.flatMap(i => nodes[i].records), ...permits.filter(mine)];
      const units = unitsOf(x);
      return { root: refOf(x.root), files: x.nodes.map(refOf), units, permits: recs.length - x.nodes.reduce((s, i) => s + nodes[i].records.length, 0), phase: P.mergeProject(`site-audit|${refOf(x.root)}`, recs).phase };
    });
    for (const r of permits) r.fileOf = fileOf.get(r);
    homes.today += today; homes.proposals += props.reduce((s, x) => s + x.units, 0);
    const siteFiles = site.map(s => ({ file: refOf(s.i), why: s.why }));
    const row = { k: d ? d.k : refOf(t.nodes[0]), municipality: nodes[t.nodes[0]].municipality, phase: p ? p.phase : null, units: today, proposals: props, site: siteFiles };
    if (!props.length) { out.noProposal++; noProposal.push(row); continue; }
    if (props.length > 1) { out.split++; splits.push(row); }
    else if (site.length) { out.siteSetAside++; setAside.push(row); }
    else out.unchanged++;
    // The development's stage would be its main proposal's.
    if (p && props[0].phase !== p.phase) stageChanges.push({ k: row.k, units: props[0].units, today: p.phase, proposal: props[0].phase, root: props[0].root, site: siteFiles.map(s => s.file) });
  }
  const byUnits = (a, b) => b.units - a.units;
  return {
    generatedAt: new Date().toISOString(), snapshotAt: generatedAt,
    note: 'Step 1 of site → proposal → file (js/sites.js): report only. Counts are countTree before your overrides on both sides.',
    files: { byScope: scopes },
    developments: { ...out, total: Object.values(out).reduce((a, b) => a + b, 0) },
    homes: { ...homes, change: homes.proposals - homes.today },
    stageChanges: { total: stageChanges.length, byChange: stageChanges.reduce((o, s) => (inc(o, `${s.today} → ${s.proposal}`), o), {}), list: stageChanges.sort(byUnits) },
    splits: splits.sort(byUnits),
    noProposal: noProposal.sort(byUnits),
    siteSetAside: setAside.sort(byUnits),
  };
}

async function main() {
  const i = process.argv.indexOf('--out'), out = i > 0 ? process.argv[i + 1] : path.join(DATA, 'site-audit.json');
  const res = siteAudit(await loadRecords(false), readJSON(path.join(DATA, 'tree-counts.json')), readJSON(path.join(DATA, 'council-decisions.json')));
  fs.writeFileSync(out, JSON.stringify(res, null, 1));
  const d = res.developments, h = res.homes;
  console.log(`site audit: ${d.total} developments · unchanged ${d.unchanged} · site activity set aside ${d.siteSetAside} · split ${d.split} · no proposal left ${d.noProposal} · homes ${h.today} → ${h.proposals} · stage changes ${res.stageChanges.total} → ${path.relative(process.cwd(), out)}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { siteAudit };
