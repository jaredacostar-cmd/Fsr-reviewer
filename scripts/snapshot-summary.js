#!/usr/bin/env node
// Summarise a snapshot: per-source status and counts, phases and units by municipality.
'use strict';
const fs = require('fs');
const P = require('../js/phases.js');
const snap = JSON.parse(fs.readFileSync(process.argv[2] || 'data/snapshot.json', 'utf8'));
console.log(`generated ${snap.generatedAt}; ${snap.records.length} records`);
for (const s of snap.sources) console.log(`SOURCE ${s.status.padEnd(5)} ${s.id.padEnd(18)} kept ${String(s.count).padStart(6)} of ${String(s.loaded ?? '-').padStart(6)}${s.truncated ? ' TRUNCATED' : ''}${s.error ? ' ERROR ' + s.error : ''} ${s.url || ''}`);
const recs = snap.records.map(o => ({ ref: '', address: '', type: '', description: '', statusRaw: '', units: null, gfa: null, newBuild: false, unitMix: null, props: {}, ...o,
  events: (o.events || []).map(([d, phase, label]) => ({ date: new Date(d + 'T00:00:00Z'), phase, label })) }));
const projects = P.buildProjects(P.dedupeRecords(recs));
const by = {};
for (const p of projects) {
  const m = by[p.municipality] || (by[p.municipality] = { projects: 0, withUnits: 0, units: 0, phases: {} });
  m.projects++; m.phases[p.phase] = (m.phases[p.phase] || 0) + 1;
  if (p.units > 0) { m.withUnits++; m.units += p.units; }
}
for (const [k, v] of Object.entries(by)) console.log(`MUNI ${k}: ${v.projects} projects, ${v.withUnits} with units (${v.units} units); phases ${JSON.stringify(v.phases)}`);
// Raw status -> phase mapping actually seen, per source, to spot misclassification.
const seen = {};
for (const r of recs) { const k = `${String(r.sourceId).split('/')[0]} | ${r.statusRaw || '(none)'} -> ${r.phase}`; seen[k] = (seen[k] || 0) + 1; }
for (const [k, n] of Object.entries(seen).sort((a, b) => b[1] - a[1]).slice(0, 120)) console.log(`STATUS ${k} = ${n}`);
const big = projects.filter(p => p.units > 0).sort((a, b) => b.units - a.units).slice(0, 15);
for (const p of big) console.log(`BIG ${p.municipality} | ${p.title} | ${p.units} units | ${p.phase} | ${p.types.slice(0, 2).join(', ')}`);
