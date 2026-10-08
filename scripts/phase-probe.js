#!/usr/bin/env node
/*
 * Diagnostic: how multi-phase developments appear in the data.
 *  - projects with several applications of the same stage (e.g. two site plans)
 *  - addresses with several unit-bearing building permits (towers / phases / foundation permits)
 * Usage: node scripts/phase-probe.js
 */
'use strict';
const CFG = require('../js/config.js');
const P = require('../js/phases.js');
const L = require('../js/loader.js');

const cut = (s, n = 90) => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, n);
const PROPS = ['BLDG_NO', 'APP_DETAIL', 'SCOPE', 'STOREYS', 'BLDG_TYPE', 'SUBDESC', 'WORKDESC', 'FOLDERDESCRIPTION', 'CUSTOMFOLDERNUMBER', 'REFERENCEFILE', 'SUBTYPE_CODE', 'CATEGORY_DESC', 'APPLICATION_TITLE'];

(async () => {
  const records = [];
  for (const src of CFG.services) {
    try {
      const res = await L.loadSource(src, { bbox: CFG.bbox, sinceYear: CFG.sinceYear, maxPerLayer: 150000, pageSize: CFG.pageSize });
      records.push(...res.records.filter(r => r.kind === 'application' || r.newBuild));
      console.log(`load ${src.id}: ${res.records.length}`);
    } catch (e) { console.log(`load ${src.id}: FAILED ${e.message}`); }
  }
  const projects = P.buildProjects(P.dedupeRecords(records));

  // 1. Same-type applications with distinct file numbers in one project.
  console.log('\n===== Projects with several applications of the same type');
  const multi = [];
  for (const p of projects) {
    const apps = p.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled');
    const byType = {};
    for (const a of apps) (byType[a.type || '?'] = byType[a.type || '?'] || []).push(a);
    const dup = Object.entries(byType).filter(([, v]) => new Set(v.map(a => a.ref)).size > 1);
    if (dup.length) multi.push({ p, apps, dup });
  }
  const per = {};
  for (const m of multi) per[m.p.municipality] = (per[m.p.municipality] || 0) + 1;
  console.log(`count by municipality: ${JSON.stringify(per)}`);
  multi.sort((a, b) => (b.p.units || 0) - (a.p.units || 0));
  for (const muni of Object.keys(per)) {
    for (const { p, apps } of multi.filter(m => m.p.municipality === muni).slice(0, 14)) {
      console.log(`\nPROJECT ${p.municipality} | ${cut(p.title, 60)} | units ${p.units} | buildout ${JSON.stringify(p.buildout)}`);
      for (const a of apps.slice(0, 12)) {
        const area = a.poly ? Math.round(P.ringsArea(a.poly)) : '-';
        const extra = PROPS.filter(k => a.props && a.props[k] != null && a.props[k] !== '').map(k => `${k}=${cut(a.props[k], 40)}`).join(' ');
        console.log(`  APP ${cut(a.ref, 22)} | ${cut(a.type, 26)} | ${cut(a.statusRaw, 22)} | units ${a.units ?? '-'}${a.unitsFromText ? '(text)' : ''} | ${cut(a.address, 40)} | area ${area} | ${a.events[0] ? a.events[0].date.toISOString().slice(0, 10) : ''} | ${extra}`);
        if (a.description) console.log(`      desc: ${cut(a.description, 200)}`);
      }
      const permits = p.records.filter(r => r.kind === 'permit' && r.units > 0);
      for (const r of permits.slice(0, 10)) {
        const extra = PROPS.filter(k => r.props && r.props[k] != null && r.props[k] !== '').map(k => `${k}=${cut(r.props[k], 40)}`).join(' ');
        console.log(`  BP  ${cut(r.ref, 24)} | ${cut(r.statusRaw, 18)} | units ${r.units} | ${cut(r.address, 40)} | ${cut(r.description, 70)} | ${extra}`);
      }
    }
  }

  // 2. Addresses with several unit-bearing permits.
  console.log('\n===== Addresses with several unit-bearing permits');
  const byAddr = new Map();
  for (const r of records) {
    if (r.kind !== 'permit' || !(r.units >= 10) || r.phase === 'cancelled') continue;
    const k = `${r.municipality}|${P.normalizeAddress(r.address)}`;
    if (!byAddr.has(k)) byAddr.set(k, []);
    byAddr.get(k).push(r);
  }
  const groups = [...byAddr.entries()].filter(([, v]) => v.length > 1);
  const perA = {};
  for (const [k] of groups) { const m = k.split('|')[0]; perA[m] = (perA[m] || 0) + 1; }
  console.log(`count by municipality: ${JSON.stringify(perA)}`);
  for (const muni of Object.keys(perA)) {
    const gs = groups.filter(([k]) => k.startsWith(muni + '|')).sort((a, b) => b[1].length - a[1].length).slice(0, 15);
    for (const [k, v] of gs) {
      console.log(`\nADDR ${k} (${v.length} permits)`);
      for (const r of v.slice(0, 10)) {
        const extra = PROPS.filter(x => r.props && r.props[x] != null && r.props[x] !== '').map(x => `${x}=${cut(r.props[x], 50)}`).join(' ');
        console.log(`  ${cut(r.ref, 26)} | ${cut(r.statusRaw, 20)} | units ${r.units} | ${cut(r.type, 24)} | ${cut(r.description, 80)} | ${r.events.map(e => e.phase[0] + ':' + e.date.toISOString().slice(0, 10)).join(',')} | ${extra}`);
      }
    }
  }

  // 3. Vocabulary that might mark foundation-only / phase / tower permits.
  console.log('\n===== Permit wording');
  const words = {};
  for (const r of records) {
    if (r.kind !== 'permit') continue;
    const t = `${r.type} ${r.description} ${r.scope || ''}`.toLowerCase();
    for (const w of ['foundation', 'shoring', 'excavation', 'conditional', 'partial', 'phase', 'tower', 'building a', 'building b', 'bldg', 'superstructure', 'below grade', 'above grade', 'podium', 'full building', 'new complete building']) {
      if (t.includes(w)) words[`${r.municipality}:${w}`] = (words[`${r.municipality}:${w}`] || 0) + 1;
    }
  }
  console.log(JSON.stringify(words));
})().catch(e => { console.error(e); process.exit(1); });
