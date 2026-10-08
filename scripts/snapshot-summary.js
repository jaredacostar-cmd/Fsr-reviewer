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
const t0 = Date.now();
const projects = P.buildProjects(P.dedupeRecords(recs));
console.log(`buildProjects: ${projects.length} projects in ${Date.now() - t0} ms`);
// Build-out: planning applications with unit counts vs building permits on their land.
const bo = {};
for (const p of projects) {
  if (!p.buildout) continue;
  const m = bo[p.municipality] || (bo[p.municipality] = { sites: 0, withPermits: 0, permits: 0, planned: 0, permitted: 0, completed: 0, remaining: 0 });
  m.sites++; if (p.buildout.permits) m.withPermits++;
  for (const k of ['permits', 'planned', 'permitted', 'completed', 'remaining']) m[k] += p.buildout[k];
}
for (const [k, v] of Object.entries(bo)) console.log(`BUILDOUT ${k}: ${JSON.stringify(v)}`);
const absorbed = projects.filter(p => p.buildout && p.buildout.permits > 1).sort((a, b) => b.buildout.permits - a.buildout.permits).slice(0, 12);
for (const p of absorbed) console.log(`SITE ${p.municipality} | ${p.title} | ${p.types.slice(0, 2).join(', ')} | ${JSON.stringify(p.buildout)} | ${p.phase}`);
const phased = projects.filter(p => p.buildout && p.buildout.phases).sort((a, b) => b.buildout.planned - a.buildout.planned);
console.log(`PHASED projects: ${phased.length}`);
for (const p of phased.slice(0, 15)) console.log(`PHASED ${p.municipality} | ${p.title} | planned ${p.buildout.planned} (${p.buildout.basis}) permitted ${p.buildout.permitted} | ${p.buildout.phases.map(f => `${f.ref}:${f.units}/${f.permitted ?? '-'}`).join(', ')}`);
const basisCount = {};
for (const p of projects) if (p.buildout) basisCount[p.buildout.basis] = (basisCount[p.buildout.basis] || 0) + 1;
console.log(`BASIS ${JSON.stringify(basisCount)}`);
const left = projects.filter(p => p.buildout && p.buildout.remaining > 0).sort((a, b) => b.buildout.remaining - a.buildout.remaining).slice(0, 10);
for (const p of left) console.log(`LEFT ${p.municipality} | ${p.title} | ${p.buildout.remaining} left of ${p.buildout.planned} | ${p.phase}`);
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
