#!/usr/bin/env node
/*
 * Diagnostic: secondary plan, MTSA, census (2021) and SGU layers covering Peel.
 *   node scripts/probe-areas.js
 */
'use strict';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const ORGS = { Mississauga: 'hM5ymMLbxIyWTjn2', Brampton: 'rl7ACuZkiFsmDA2g', Caledon: 'AbUjpCl3KckkXVBh', Peel: 'ONZht79c8QWuX759' };
const q = o => new URLSearchParams(o).toString();
async function get(url, timeout = 30000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try { const r = await fetch(url, { signal: ctl.signal }); return await r.json(); } catch (e) { return { error: { message: e.message } }; } finally { clearTimeout(t); }
}
const short = (s, n = 140) => String(s ?? '').replace(/\s+/g, ' ').slice(0, n);
const seen = new Set();
async function layer(url) {
  const info = await get(`${url}?f=json`);
  if (info.error) return console.log(`    ${url} ERROR ${info.error.message}`);
  if (info.layers && !info.fields) { for (const l of info.layers.slice(0, 8)) await layer(`${url}/${l.id}`); return; }
  const cnt = await get(`${url}/query?${q({ where: '1=1', returnCountOnly: true, f: 'json' })}`);
  const smp = await get(`${url}/query?${q({ where: '1=1', outFields: '*', returnGeometry: false, resultRecordCount: 2, f: 'json' })}`);
  console.log(`    LAYER ${url} "${info.name}" geom=${info.geometryType} count=${cnt.count} wkid=${info.extent && info.extent.spatialReference && (info.extent.spatialReference.latestWkid || info.extent.spatialReference.wkid)}`);
  console.log(`      fields: ${(info.fields || []).map(f => f.name).join(',').slice(0, 700)}`);
  for (const f of (smp.features || [])) console.log(`      sample: ${JSON.stringify(f.attributes).slice(0, 500)}`);
}
async function search(query, num = 25) {
  const r = await get(`${SHARING}/search?${q({ q: query, num, f: 'json', sortField: 'modified', sortOrder: 'desc' })}`);
  return r.results || [];
}
async function show(items, label) {
  console.log(`\n=== ${label}: ${items.length}`);
  for (const it of items) {
    if (!it.url || seen.has(it.url)) continue; seen.add(it.url);
    console.log(`  ITEM "${it.title}" type=${it.type} owner=${it.owner} modified=${new Date(it.modified).toISOString().slice(0, 10)} snippet="${short(it.snippet)}"`);
    if (/Feature Service|Map Service/.test(it.type)) await layer(it.url.replace(/\/$/, ''));
  }
}
(async () => {
  const FS = '(type:"Feature Service" OR type:"Map Service")';
  for (const [muni, org] of Object.entries(ORGS)) {
    await show(await search(`orgid:${org} AND ${FS} AND (title:"secondary plan" OR title:"secondary plans" OR title:"character area" OR title:"character areas" OR title:"precinct")`), `${muni} secondary plans`);
    await show(await search(`orgid:${org} AND ${FS} AND (title:MTSA OR title:"major transit station" OR title:"protected major transit" OR title:PMTSA)`), `${muni} MTSA`);
    await show(await search(`orgid:${org} AND ${FS} AND (title:census OR title:"dissemination" OR title:SGU OR title:"small geographic" OR title:population OR title:"traffic zone" OR title:TAZ OR title:forecast)`), `${muni} census / SGU / population`);
  }
  await show(await search(`${FS} AND ("2021 Census" OR "Census 2021") AND ("dissemination area" OR "dissemination areas") AND (population OR dwellings)`, 30), 'Public 2021 census DA layers');
  await show(await search(`${FS} AND ("2021 Census" OR "Census 2021") AND ("dissemination block" OR "dissemination blocks")`, 15), 'Public 2021 census DB layers');
  await show(await search(`${FS} AND (Peel) AND (SGU OR "small geographic unit" OR "small geographic units")`, 15), 'Peel SGU public');
})().catch(e => { console.error(e); process.exit(1); });
