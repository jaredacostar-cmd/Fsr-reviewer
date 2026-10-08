#!/usr/bin/env node
/*
 * Diagnostic: earlier census (2016) population by dissemination area for Peel, as an ArcGIS
 * layer (like the 2021 one) or as Statistics Canada files.
 *   node scripts/probe-census.js
 */
'use strict';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const q = o => new URLSearchParams(o).toString();
async function get(url, timeout = 30000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctl.signal }); const txt = await r.text(); try { return JSON.parse(txt); } catch { return { status: r.status, text: txt.slice(0, 200) }; } }
  catch (e) { return { error: { message: e.message } }; } finally { clearTimeout(t); }
}
async function head(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try { const r = await fetch(url, { method: 'GET', signal: ctl.signal, headers: { Range: 'bytes=0-200' } }); return `${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-length') || ''}`; }
  catch (e) { return `ERROR ${e.message}`; } finally { clearTimeout(t); }
}
const seen = new Set();
async function layer(url) {
  const info = await get(`${url}?f=json`);
  if (info.error || info.status) return console.log(`    ${url} ERROR ${JSON.stringify(info.error || info.status)}`);
  if (info.layers && !info.fields) { for (const l of info.layers.slice(0, 6)) await layer(`${url}/${l.id}`); return; }
  const peel = await get(`${url}/query?${q({ where: "DAUID LIKE '3521%'", returnCountOnly: true, f: 'json' })}`);
  const smp = await get(`${url}/query?${q({ where: '1=1', outFields: '*', returnGeometry: false, resultRecordCount: 1, f: 'json' })}`);
  console.log(`    LAYER ${url} "${info.name}" geom=${info.geometryType} peelCount(DAUID)=${peel.count ?? JSON.stringify(peel.error || '').slice(0, 80)} maxRec=${info.maxRecordCount}`);
  console.log(`      fields: ${(info.fields || []).map(f => f.name).join(',').slice(0, 600)}`);
  for (const f of (smp.features || [])) console.log(`      sample: ${JSON.stringify(f.attributes).slice(0, 400)}`);
}
async function search(query, num = 25) {
  const r = await get(`${SHARING}/search?${q({ q: query, num, f: 'json' })}`);
  return r.results || [];
}
async function show(items, label) {
  console.log(`\n=== ${label}: ${items.length}`);
  for (const it of items) {
    if (!it.url || seen.has(it.url)) continue; seen.add(it.url);
    console.log(`  ITEM "${it.title}" type=${it.type} owner=${it.owner} snippet="${String(it.snippet || '').slice(0, 120)}"`);
    if (/Feature Service|Map Service/.test(it.type)) await layer(it.url.replace(/\/$/, ''));
  }
}
(async () => {
  const FS = '(type:"Feature Service" OR type:"Map Service")';
  // Same publisher as the 2021 layer (Government Operations Centre).
  await show(await search(`orgid:txWDfZ2LIgzmw5Ts AND ${FS} AND (2016 OR census)`, 40), 'GOC org census layers');
  console.log('\n=== Guessed GOC service names');
  for (const n of ['Census_2016_Population_by_Dissemination_Area', 'Census_2016_Population_by_DA', 'Census2016_Population_by_Dissemination_Area'])
    await layer(`https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/${n}/FeatureServer`);
  await show(await search(`${FS} AND ("2016 Census" OR "Census 2016") AND ("dissemination area" OR "dissemination areas" OR "DA") AND (population OR dwellings)`, 40), 'Public 2016 census DA layers');
  await show(await search(`${FS} AND ("2016 Census" OR "Census 2016") AND (Peel OR Mississauga OR Brampton OR Ontario) AND (population)`, 30), '2016 census, Peel / Ontario');
  console.log('\n=== Statistics Canada files');
  const files = {
    'DA boundaries 2016 (cartographic, shp)': 'https://www12.statcan.gc.ca/census-recensement/2011/geo/bound-limit/files-fichiers/2016/lda_000b16a_e.zip',
    'DA boundaries 2016 (digital, shp)': 'https://www12.statcan.gc.ca/census-recensement/2011/geo/bound-limit/files-fichiers/2016/lda_000a16a_e.zip',
    'Pop & dwelling counts 2016, DA (CSV)': 'https://www12.statcan.gc.ca/census-recensement/2016/dp-pd/hlt-fst/pd-pl/Tables/CompFile.cfm?Lang=Eng&T=1901&OFT=FULLCSV',
    'GeoSuite / DA attribute 2016 (CSV)': 'https://www12.statcan.gc.ca/census-recensement/2016/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=044',
  };
  for (const [k, u] of Object.entries(files)) console.log(`  ${k}: ${await head(u)}  ${u}`);
})().catch(e => { console.error(e); process.exit(1); });
