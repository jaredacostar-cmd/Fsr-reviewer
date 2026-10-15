'use strict';
// The developments as the app builds them from data/snapshot.json (js/app.js applySnapshot →
// rebuild): records decoded, unit counts read from descriptions, deduplicated, council decisions
// applied (data/council-decisions.json), grouped into the
// trees (js/tree-groups.js through buildProjects' regroup hook) and counted (js/tree-counts.js).
// Built once per test process (a few seconds).
const fs = require('fs');
const path = require('path');
const P = require('../../js/phases.js');
const TG = require('../../js/tree-groups.js');
const TC = require('../../js/tree-counts.js');
const CD = require('../../js/council-decisions.js');

const DATA = path.join(__dirname, '..', '..', 'data');
let cache = null;

function realDevs() {
  if (cache) return cache;
  const snap = JSON.parse(fs.readFileSync(path.join(DATA, 'snapshot.json'), 'utf8'));
  const tree = JSON.parse(fs.readFileSync(path.join(DATA, 'tree-counts.json'), 'utf8'));
  const names = new Map(snap.sources.map(s => [s.id, s.name]));
  const raw = snap.records.map(o => {
    const r = { sourceName: names.get(String(o.sourceId).split('/')[0]), ref: '', address: '', type: '', description: '', ward: '', statusRaw: '',
      units: null, gfa: null, newBuild: false, unitMix: null, props: {}, ...o,
      events: (o.events || []).map(([d, phase, label]) => ({ date: new Date(`${d}T00:00:00Z`), phase, label })) };
    if (r.kind === 'application' && !r.unitMix && !(r.units > 0 && !r.unitsFromText)) { const t = P.unitsFromText(r.description); if (t && !(r.units >= t)) { r.units = t; r.unitsFromText = true; } }
    return r;
  });
  const records = P.dedupeRecords(raw);
  const cd = fs.existsSync(path.join(DATA, 'council-decisions.json')) ? JSON.parse(fs.readFileSync(path.join(DATA, 'council-decisions.json'), 'utf8')) : null;
  if (cd) CD.applyTo(records, cd, P.canonRef);
  TG.setData(tree); TC.setData(tree);
  const projects = P.buildProjects(records, { regroup: parts => TG.regroup(parts) });
  TC.apply(projects, { mode: 'tree', data: tree });
  cache = { projects, records, tree, byKey: new Map(projects.map(p => [p.key, p])) };
  return cache;
}

const available = () => fs.existsSync(path.join(DATA, 'snapshot.json')) && fs.existsSync(path.join(DATA, 'tree-counts.json'));
module.exports = { realDevs, available };
