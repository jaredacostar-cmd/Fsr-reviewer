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
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
async function head(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 60000);
  try { const r = await fetch(url, { method: 'GET', signal: ctl.signal, headers: { 'User-Agent': UA, Accept: '*/*' } }); ctl.abort(); return `${r.status} ${r.headers.get('content-type')} ${r.headers.get('content-length') || ''}`; }
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
  // 1) The 2021 layer the app already uses: does it carry 2016 counts (on 2021 DAs)?
  const C21 = 'https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Census_2021_Population_by_Dissemination_Area/FeatureServer/0';
  const info = await get(`${C21}?f=json`);
  console.log('=== 2021 layer fields (all)');
  for (const f of info.fields || []) console.log(`    ${f.name} (${f.type}) "${f.alias}"`);
  const smp = await get(`${C21}/query?${q({ where: "DAUID LIKE '3521%'", outFields: '*', returnGeometry: false, resultRecordCount: 2, f: 'json' })}`);
  for (const f of (smp.features || [])) console.log(`    sample: ${JSON.stringify(f.attributes)}`);
  // 2) York Region's GTA 2016 DA layers (the income one covers Peel).
  await show(await search(`orgid:GzvOwaQBbX7KLiuG AND (title:"Greater Toronto Area" OR title:GTA) AND 2016`, 40), 'York GTA 2016 layers');
  await show(await search(`(title:"population and dwelling" OR title:"population and dwellings") AND (2016) AND ("dissemination area")`, 30), '2016 population and dwelling by DA');
  // 3) Statistics Canada files with a browser user-agent.
  console.log('\n=== Statistics Canada files (browser UA)');
  const files = {
    'DA boundaries 2016 (cartographic, shp)': 'https://www12.statcan.gc.ca/census-recensement/2011/geo/bound-limit/files-fichiers/2016/lda_000b16a_e.zip',
    'Pop & dwelling counts 2016, DA (CSV)': 'https://www12.statcan.gc.ca/census-recensement/2016/dp-pd/hlt-fst/pd-pl/Tables/CompFile.cfm?Lang=Eng&T=1901&OFT=FULLCSV',
    '2021 pop & dwelling, DA incl. 2016 (CSV)': 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/hlt-fst/pd-pl/Tables/CompFile.cfm?Lang=Eng&T=1901&OFT=FULLCSV',
    'StatCan table 98-10-0015 (2021, DA, with 2016)': 'https://www150.statcan.gc.ca/t1/tbl1/en/dtl!downloadDbLoadingData-nonTraduit.action?pid=9810001501&latestN=5&startDate=&endDate=&csvLocale=en&selectedMembers=%5B%5B1%5D%2C%5B1%5D%5D&checkedLevels=',
  };
  for (const [k, u] of Object.entries(files)) console.log(`  ${k}: ${await head(u)}  ${u}`);
})().catch(e => { console.error(e); process.exit(1); });
