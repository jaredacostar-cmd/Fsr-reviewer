#!/usr/bin/env node
/*
 * Diagnostic: existing water / wastewater / stormwater linework published for Peel — Region of
 * Peel watermains, hydrants, valves, sanitary mains; municipal storm sewers and stormwater ponds.
 * Prints each layer's name, geometry, feature count, fields and sample records.
 *   node scripts/probe-linework.js
 */
'use strict';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const PEEL_ORG = 'ONZht79c8QWuX759';
const MUNI = { Mississauga: 'hM5ymMLbxIyWTjn2', Brampton: 'rl7ACuZkiFsmDA2g', Caledon: 'AbUjpCl3KckkXVBh' };
const q = o => new URLSearchParams(o).toString();
async function get(url, timeout = 30000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctl.signal }); const txt = await r.text(); try { return JSON.parse(txt); } catch { return { status: r.status, text: txt.slice(0, 200) }; } }
  catch (e) { return { error: { message: e.message } }; } finally { clearTimeout(t); }
}
const seen = new Set();
async function layer(url) {
  url = url.replace(/\/$/, '');
  if (seen.has(url)) return; seen.add(url);
  const info = await get(`${url}?f=json`);
  if (info.error || info.status) return console.log(`    ${url} ERROR ${JSON.stringify(info.error || info.status).slice(0, 120)}`);
  if ((info.layers || info.tables) && !info.fields) { for (const l of [...(info.layers || []), ...(info.tables || [])].slice(0, 40)) await layer(`${url}/${l.id}`); return; }
  const cnt = await get(`${url}/query?${q({ where: '1=1', returnCountOnly: true, f: 'json' })}`);
  const smp = await get(`${url}/query?${q({ where: '1=1', outFields: '*', returnGeometry: false, resultRecordCount: 2, f: 'json' })}`);
  console.log(`    LAYER ${url} "${info.name}" geom=${info.geometryType} count=${cnt.count}`);
  console.log(`      fields: ${(info.fields || []).map(f => f.name).join(',').slice(0, 600)}`);
  for (const f of (smp.features || [])) console.log(`      sample: ${JSON.stringify(f.attributes).slice(0, 400)}`);
}
const RELEVANT = /water ?main|watermain|hydrant|valve|sanitary|sewer|storm|culvert|catch ?basin|pond|swm|stormwater|outfall|forcemain|force main|linear|pipe|main/i;
async function search(query, label, num = 60) {
  const r = await get(`${SHARING}/search?${q({ q: query, num, f: 'json' })}`);
  const items = r.results || [];
  console.log(`\n=== ${label}: ${items.length}`);
  for (const it of items) {
    console.log(`  ITEM "${it.title}" type=${it.type} owner=${it.owner} url=${it.url || ''}`);
    if (it.url && /Feature Service|Map Service/.test(it.type) && RELEVANT.test(it.title)) await layer(it.url);
  }
}
(async () => {
  console.log('### Region of Peel: water and wastewater infrastructure services (every layer)');
  for (const s of ['water_infrastructure', 'wastewater_infrastructure']) await layer(`https://services6.arcgis.com/${PEEL_ORG}/arcgis/rest/services/${s}/FeatureServer`);
  const svc = await get(`https://services6.arcgis.com/${PEEL_ORG}/arcgis/rest/services?f=json`);
  console.log(`\n### Peel org services (${(svc.services || []).length}): ${(svc.services || []).map(x => x.name).join(' | ')}`);
  for (const x of svc.services || []) if (/water|main|hydrant|valve|sewer|sanit|storm|pipe|linear|infra/i.test(x.name)) await layer(x.url);
  const FS = '(type:"Feature Service" OR type:"Map Service")';
  await search(`orgid:${PEEL_ORG} AND ${FS} AND (watermain OR "water main" OR hydrant OR valve OR "sanitary" OR sewer OR pipe)`, 'Peel org: linework items');
  for (const term of ['watermain', 'water main', 'hydrant', 'valve', 'sanitary sewer', 'wastewater main', 'water infrastructure']) {
    const r = await get(`https://data.peelregion.ca/api/v3/datasets?${q({ q: term, 'page[size]': 20 })}`);
    console.log(`\n=== Peel hub "${term}": ${(r.data || []).length}`);
    for (const d of r.data || []) { const a = d.attributes || {}; console.log(`  HUB "${a.name}" type=${a.type} url=${a.url || ''} records=${a.recordCount ?? ''} geom=${a.geometryType || ''}`); if (a.url && RELEVANT.test(a.name || '')) await layer(a.url); }
  }
  for (const [name, org] of Object.entries(MUNI)) {
    await search(`orgid:${org} AND ${FS} AND (storm OR "storm sewer" OR stormwater OR pond OR SWM OR culvert OR "catch basin" OR outfall OR watermain OR sanitary)`, `${name}: storm / water linework`);
  }
  await search(`${FS} AND (watermain OR "water main" OR "water mains") AND (Peel OR Mississauga OR Brampton OR Caledon)`, 'Public watermain layers (Peel area)');
  await search(`${FS} AND ("storm sewer" OR "storm sewers" OR "stormwater management") AND (Mississauga OR Brampton OR Caledon)`, 'Public storm layers (Peel area)');
})().catch(e => { console.error(e); process.exit(1); });
