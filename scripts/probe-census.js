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
// Compact: only layers with 2016-style DAUIDs in Peel, and their population / dwelling fields.
async function peelLayer(url, title) {
  const info = await get(`${url}?f=json`);
  if (info.error || info.status) return;
  if (info.layers && !info.fields) { for (const l of info.layers.slice(0, 12)) await peelLayer(`${url}/${l.id}`, title); return; }
  const daField = (info.fields || []).map(f => f.name).find(n => /^DAUID/i.test(n));
  if (!daField) return;
  const peel = await get(`${url}/query?${q({ where: `${daField} LIKE '3521%'`, returnCountOnly: true, f: 'json' })}`);
  if (!(peel.count > 0)) return;
  const popish = (info.fields || []).map(f => f.name).filter(n => /pop|dwel|dw_|priv|tdw|hh|household/i.test(n));
  const smp = await get(`${url}/query?${q({ where: `${daField} LIKE '3521%'`, outFields: [daField, ...popish.slice(0, 12)].join(','), returnGeometry: false, resultRecordCount: 1, f: 'json' })}`);
  console.log(`  PEEL ${peel.count} "${title}" / "${info.name}" ${url}\n     pop/dwelling fields: ${popish.join(',').slice(0, 400)}\n     sample: ${JSON.stringify((smp.features || [])[0] && smp.features[0].attributes).slice(0, 400)}`);
}
(async () => {
  const FS = '(type:"Feature Service" OR type:"Map Service")';
  const queries = [
    `${FS} AND 2016 AND ("dissemination area" OR "dissemination areas") AND population`,
    `${FS} AND ("Census 2016" OR "2016 Census") AND (DA OR "dissemination")`,
    `${FS} AND title:2016 AND (title:DA OR title:"dissemination")`,
    `${FS} AND ("population and dwelling" OR "population & dwelling") AND 2016`,
    `${FS} AND 2016 AND census AND (Peel OR Brampton OR Mississauga OR Toronto OR GTA OR "Greater Toronto")`,
    `${FS} AND 2016 AND census AND Ontario AND (dissemination OR DA)`,
  ];
  for (const query of queries) {
    for (const start of [1, 101]) {
      const r = await get(`${SHARING}/search?${q({ q: query, num: 100, start, f: 'json' })}`);
      const items = r.results || [];
      console.log(`=== ${query.slice(0, 120)} (start ${start}): ${items.length}`);
      for (const it of items) {
        if (!it.url || seen.has(it.url) || !/Feature Service|Map Service/.test(it.type)) continue;
        seen.add(it.url);
        await peelLayer(it.url.replace(/\/$/, ''), it.title);
      }
      if (items.length < 100) break;
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
