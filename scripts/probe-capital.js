#!/usr/bin/env node
/*
 * Diagnostic (log only): where facility work might sit in the Region's capital projects service.
 *   1. Every layer of the service (name, geometry, record count, fields), to find point / polygon
 *      project layers beside "Proposed Projects - Line".
 *   2. Free-text fields of the line layer (LocationFrom, LocationTo, StreetName) and ProjectWebsite:
 *      how many records name a facility word or a known facility. Comments (internal notes) is never
 *      requested. Prints counts, facility names and website paths only, no record-level values.
 * Usage: node scripts/probe-capital.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('./facilities-lib.js');

const SERVICE = 'https://gisprd.peelregion.ca/arcgis/rest/services/SampleWorldCities/MapServer';
const UA = { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/fsr-reviewer)' };
const root = path.join(__dirname, '..');
const readJSON = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
async function getJSON(url, params = {}) {
  const r = await fetch(`${url}?${new URLSearchParams({ f: 'json', ...params })}`, { headers: UA });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j;
}
const FAC_WORD = /\b(sps|wps|ps|pumping|pump stn|station|reservoir|res\.?|elevated tank|tank|water tower|plant|wtp|wwtp|wrrf|treatment|well|intake|outfall|chamber|booster|odour)\b/i;

async function main() {
  const svc = await getJSON(SERVICE);
  console.log(`Service: ${svc.mapName || ''} — ${svc.serviceDescription ? svc.serviceDescription.slice(0, 200) : ''}`);
  for (const l of [...(svc.layers || []), ...(svc.tables || [])]) {
    try {
      const info = await getJSON(`${SERVICE}/${l.id}`);
      let n = '?'; try { n = (await getJSON(`${SERVICE}/${l.id}/query`, { where: '1=1', returnCountOnly: true })).count; } catch { /* group layer */ }
      console.log(`  layer ${l.id} "${l.name}" type=${info.type} geom=${info.geometryType || 'none'} count=${n}`);
      if (info.fields) console.log(`    fields: ${info.fields.map(f => f.name).join(', ').slice(0, 900)}`);
      if (info.description) console.log(`    description: ${info.description.replace(/\s+/g, ' ').slice(0, 300)}`);
    } catch (e) { console.log(`  layer ${l.id} "${l.name}": ${e.message}`); }
  }

  // Text fields of the line layer (never Comments).
  const FIELDS = ['WorkType', 'StreetName', 'LocationFrom', 'LocationTo', 'ProjectWebsite', 'Zone', 'AgencyResponsible'];
  const feats = [];
  for (let offset = 0; ; offset += 1000) {
    const j = await getJSON(`${SERVICE}/4/query`, { where: '1=1', outFields: FIELDS.join(','), returnGeometry: false, orderByFields: 'OBJECTID', resultOffset: offset, resultRecordCount: 1000 });
    feats.push(...(j.features || []).map(f => f.attributes));
    if ((j.features || []).length < 1000) break;
  }
  console.log(`\nLine layer text fields over ${feats.length} records:`);
  for (const k of ['StreetName', 'LocationFrom', 'LocationTo', 'Zone', 'AgencyResponsible']) {
    const filled = feats.filter(a => a[k] != null && String(a[k]).trim()).length;
    const facWord = feats.filter(a => FAC_WORD.test(String(a[k] || ''))).length;
    console.log(`  ${k}: filled ${filled}; with a facility word ${facWord}`);
  }
  const zones = {}; for (const a of feats) { const z = String(a.Zone ?? '(blank)'); zones[z] = (zones[z] || 0) + 1; }
  console.log(`  Zone values: ${Object.entries(zones).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([k, v]) => `${k}=${v}`).join(' | ')}`);
  const ag = {}; for (const a of feats) { const z = String(a.AgencyResponsible ?? '(blank)'); ag[z] = (ag[z] || 0) + 1; }
  console.log(`  AgencyResponsible values: ${Object.entries(ag).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${k}=${v}`).join(' | ')}`);
  // Which facility words appear (word only, with counts).
  const words = {};
  for (const a of feats) for (const k of ['StreetName', 'LocationFrom', 'LocationTo']) { const m = FAC_WORD.exec(String(a[k] || '')); if (m) { const w = m[1].toLowerCase(); words[w] = (words[w] || 0) + 1; } }
  console.log(`  facility words: ${JSON.stringify(words)}`);

  // Known facilities named in the text fields.
  const sv = readJSON('data/servicing.json');
  const reg = F.registry({ waterFacilities: readJSON('data/water-facilities.json').facilities, wwFacilities: readJSON('data/ww-facilities.json').facilities, wwPlants: sv.plants || [], dcInfra: readJSON('data/dc-infra.json') });
  const named = {};
  for (const a of feats) {
    const txt = ['StreetName', 'LocationFrom', 'LocationTo'].map(k => String(a[k] || '')).join(' | ');
    if (!FAC_WORD.test(txt)) continue;
    for (const f of reg) {
      const keys = [f.name, ...(f.aliases || [])].map(n => F.stationKey(n)).filter(k => k && k.length > 3);
      if (keys.some(k => k.split(' ').every(t => new RegExp(`\\b${t}\\b`, 'i').test(txt.replace(/['’.]/g, ''))))) { const n = named[f.name] = named[f.name] || { n: 0, types: new Set() }; n.n++; n.types.add(a.WorkType); }
    }
  }
  console.log(`  facilities named next to a facility word (${Object.keys(named).length}): ${Object.entries(named).sort((a, b) => b[1].n - a[1].n).map(([k, v]) => `${k} ${v.n} (${[...v.types].slice(0, 3).join('/')})`).join('; ')}`);

  // Project websites: hosts and paths (public pages).
  const sites = {};
  for (const a of feats) { const u = String(a.ProjectWebsite || '').trim(); if (!u) continue; let k; try { const x = new URL(u); k = `${x.host}${x.pathname.replace(/\/+$/, '')}`; } catch { k = '(not a URL)'; } sites[k] = (sites[k] || 0) + 1; }
  console.log(`  ProjectWebsite: ${feats.filter(a => a.ProjectWebsite).length} filled, ${Object.keys(sites).length} distinct`);
  for (const [k, v] of Object.entries(sites).sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`    ${v}  ${k}`);

  // The project pages themselves (public): reachable? a description? facilities named?
  const E = require('./ea-lib.js');
  const urls = [...new Set(feats.map(a => String(a.ProjectWebsite || '').trim()).filter(u => /^https?:/i.test(u)))];
  const st = {}; let ok = 0, desc = 0, facPages = 0; const facNamed = {}; const samples = [];
  for (const u of urls) {
    let r = null;
    try { r = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; peel-dev-tracker)' }, redirect: 'follow' }); } catch (e) { st.error = (st.error || 0) + 1; continue; }
    const key = `${r.status}${r.redirected ? ' (redirected)' : ''}`; st[key] = (st[key] || 0) + 1;
    if (!r.ok) continue;
    ok++;
    const html = await r.text();
    const lines = E.lines(E.mainHtml(html)).filter(l => !E.CONTACT.test(l));
    const title = (/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(html) || [])[1];
    const para = lines.find(l => l.length > 80 && /\b(will|is|are|to)\b/.test(l));
    if (para) desc++;
    const txt = lines.join(' ');
    const hits = reg.filter(f => [f.name, ...(f.aliases || [])].some(n => { const k = F.stationKey(n); return k.length > 3 && k.split(' ').every(t => new RegExp(`\\b${t}\\b`, 'i').test(txt.replace(/['’.]/g, ''))); }) && FAC_WORD.test(txt));
    if (hits.length) { facPages++; for (const h of hits) facNamed[h.name] = (facNamed[h.name] || 0) + 1; }
    if (samples.length < 12 && para) samples.push(`${title ? E.text(title).slice(0, 80) : '(no title)'} — ${para.slice(0, 220)}`);
    await new Promise(res => setTimeout(res, 250));
  }
  console.log(`\nProject pages: ${urls.length} distinct; status ${JSON.stringify(st)}; reachable ${ok}; with a description paragraph ${desc}; naming a known facility ${facPages}`);
  console.log(`  facilities named on project pages: ${Object.entries(facNamed).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join('; ')}`);
  for (const sm of samples) console.log(`  sample: ${sm}`);
}

main().catch(e => { console.error(e); process.exit(1); });
