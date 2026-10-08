#!/usr/bin/env node
/*
 * Diagnostic: Region of Peel water pressure zones and wastewater drainage areas / sewersheds
 * (2020 Water and Wastewater Master Plan) as GIS layers.
 *   node scripts/probe-servicing.js
 */
'use strict';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const PEEL_ORG = 'ONZht79c8QWuX759';
const q = o => new URLSearchParams(o).toString();
async function get(url, timeout = 30000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctl.signal }); const txt = await r.text(); try { return JSON.parse(txt); } catch { return { status: r.status, text: txt.slice(0, 200) }; } }
  catch (e) { return { error: { message: e.message } }; } finally { clearTimeout(t); }
}
const seen = new Set();
async function layer(url, depth = 0) {
  const info = await get(`${url}?f=json`);
  if (info.error || info.status) return console.log(`    ${url} ERROR ${JSON.stringify(info.error || info.status).slice(0, 120)}`);
  if ((info.layers || info.tables) && !info.fields) { for (const l of [...(info.layers || [])].slice(0, 25)) await layer(`${url}/${l.id}`, depth + 1); return; }
  const cnt = await get(`${url}/query?${q({ where: '1=1', returnCountOnly: true, f: 'json' })}`);
  const smp = await get(`${url}/query?${q({ where: '1=1', outFields: '*', returnGeometry: false, resultRecordCount: 3, f: 'json' })}`);
  console.log(`    LAYER ${url} "${info.name}" geom=${info.geometryType} count=${cnt.count}`);
  console.log(`      fields: ${(info.fields || []).map(f => f.name).join(',').slice(0, 400)}`);
  for (const f of (smp.features || [])) console.log(`      sample: ${JSON.stringify(f.attributes).slice(0, 300)}`);
}
async function show(query, label, num = 50) {
  const r = await get(`${SHARING}/search?${q({ q: query, num, f: 'json' })}`);
  const items = r.results || [];
  console.log(`\n=== ${label}: ${items.length}`);
  for (const it of items) {
    console.log(`  ITEM "${it.title}" type=${it.type} owner=${it.owner} org=${it.orgId || ''} url=${it.url || ''}`);
    if (it.url && !seen.has(it.url) && /Feature Service|Map Service/.test(it.type)) { seen.add(it.url); await layer(it.url.replace(/\/$/, '')); }
  }
}
(async () => {
  const FS = '(type:"Feature Service" OR type:"Map Service")';
  await show(`orgid:${PEEL_ORG} AND ${FS} AND (pressure OR zone OR water OR wastewater OR sewer OR sewershed OR drainage OR servicing OR "master plan" OR trunk OR watermain)`, 'Peel org: water / wastewater layers', 100);
  await show(`orgid:${PEEL_ORG} AND (pressure OR sewershed OR "master plan" OR wastewater OR "drainage area")`, 'Peel org: any item type', 100);
  await show(`${FS} AND ("pressure zone" OR "pressure zones" OR "pressure district") AND (Peel OR Mississauga OR Brampton OR Caledon)`, 'Public pressure zones (Peel)');
  await show(`${FS} AND (sewershed OR "drainage area" OR "sewage catchment" OR "wastewater catchment" OR "collection area") AND (Peel OR Mississauga OR Brampton OR Caledon)`, 'Public wastewater drainage areas (Peel)');
  await show(`("Water and Wastewater Master Plan" OR "Water & Wastewater Master Plan") AND Peel`, 'Master plan items');
  for (const org of ['hM5ymMLbxIyWTjn2', 'rl7ACuZkiFsmDA2g', 'AbUjpCl3KckkXVBh'])
    await show(`orgid:${org} AND ${FS} AND ("pressure zone" OR sewershed OR "drainage area" OR "sanitary" OR watermain)`, `Municipal org ${org}: servicing layers`, 50);
  // Peel's open data hub and public ArcGIS servers (guesses).
  for (const u of ['https://data.peelregion.ca/api/v3/datasets?q=pressure%20zone', 'https://data.peelregion.ca/api/v3/datasets?q=sewershed', 'https://data.peelregion.ca/api/v3/datasets?q=wastewater',
                   'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services?f=json', 'https://maps.peelregion.ca/arcgis/rest/services?f=json', 'https://gisservices.peelregion.ca/arcgis/rest/services?f=json']) {
    const r = await get(u);
    console.log(`\n=== ${u}\n  ${JSON.stringify(r).slice(0, 1500)}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
