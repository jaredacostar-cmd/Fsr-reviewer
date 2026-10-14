#!/usr/bin/env node
/*
 * Diagnostic: three Region of Peel open datasets, downloaded raw for review —
 *   Building Permits (Region-wide), Housing Construction Activity, Watercourses.
 * Lists the Region's ArcGIS Online services, looks the hub items up by id, and for each matching
 * layer or table saves its metadata, count and every record (GeoJSON for line layers).
 *   node scripts/probe-peel-open.js --out peel-open-raw
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ORG = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const ITEMS = {
  'housing-construction': 'e033d8646c76409b925a0538478ebff9',
  'building-permits': '20d21f30a78c4736a7dbb206bf5b5aec',
};
const MATCH = /permit|housing|construct|starts|completion|watercourse|waterbod|stream|creek/i;
const q = o => new URLSearchParams(o).toString();
const outDir = process.argv[process.argv.indexOf('--out') + 1] || 'peel-open-raw';
fs.mkdirSync(outDir, { recursive: true });
const save = (name, obj) => fs.writeFileSync(path.join(outDir, name), typeof obj === 'string' ? obj : JSON.stringify(obj, null, 1));

async function get(url, as = 'json', timeout = 60000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    const txt = await r.text();
    if (as === 'text') return { status: r.status, text: txt, type: r.headers.get('content-type') };
    try { return JSON.parse(txt); } catch { return { status: r.status, text: txt.slice(0, 300) }; }
  } catch (e) { return { error: { message: e.message } }; } finally { clearTimeout(t); }
}

// Every record of a layer or table (attributes; geometry as GeoJSON for line / polygon layers).
async function download(url, info, key) {
  const geo = info.geometryType && info.geometryType !== 'esriGeometryPoint';
  const per = Math.min(info.maxRecordCount || 1000, 2000);
  const all = []; let off = 0;
  for (let page = 0; page < 200; page++) {
    const r = await get(`${url}/query?${q({ where: '1=1', outFields: '*', returnGeometry: !!info.geometryType, outSR: 4326, resultOffset: off, resultRecordCount: per, f: geo ? 'geojson' : 'json' })}`);
    const feats = r.features || [];
    if (r.error || !feats.length) { if (r.error) console.log(`      page ${page} error ${JSON.stringify(r.error).slice(0, 200)}`); break; }
    all.push(...feats); off += feats.length;
    if (!(r.exceededTransferLimit || (r.properties && r.properties.exceededTransferLimit)) && feats.length < per) break;
  }
  save(`${key}.json`, geo ? { type: 'FeatureCollection', features: all } : { fields: info.fields, features: all });
  console.log(`      saved ${all.length} records to ${key}.json`);
  return all;
}

async function layer(url, key) {
  const info = await get(`${url}?f=json`);
  if (info.error || info.status) { console.log(`    ${url} ERROR ${JSON.stringify(info.error || info.text).slice(0, 200)}`); return; }
  const cnt = await get(`${url}/query?${q({ where: '1=1', returnCountOnly: true, f: 'json' })}`);
  console.log(`    LAYER ${url} "${info.name}" type=${info.type} geom=${info.geometryType} count=${cnt.count} edited=${info.editingInfo && info.editingInfo.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10) : '?'}`);
  console.log(`      fields: ${(info.fields || []).map(f => `${f.name}:${String(f.type).replace('esriFieldType', '')}`).join(', ')}`);
  save(`${key}.meta.json`, { url, info, count: cnt.count });
  if (cnt.count > 0 && cnt.count < 400000) {
    const all = await download(url, info, key);
    for (const f of all.slice(0, 3)) console.log(`      sample: ${JSON.stringify(f.attributes || f.properties).slice(0, 500)}`);
  }
}

async function service(url, name) {
  const s = await get(`${url}?f=json`);
  if (s.error) return console.log(`  ${url} ERROR ${JSON.stringify(s.error).slice(0, 200)}`);
  for (const l of [...(s.layers || []), ...(s.tables || [])]) await layer(`${url}/${l.id}`, `${name}-${l.id}`.replace(/[^\w-]+/g, '_'));
}

(async () => {
  console.log('Hub items:');
  const done = new Set();
  for (const [key, id] of Object.entries(ITEMS)) {
    const it = await get(`${SHARING}/content/items/${id}?f=json`);
    console.log(`  ${key}: "${it.title}" type=${it.type} url=${it.url} modified=${it.modified ? new Date(it.modified).toISOString().slice(0, 10) : '?'} snippet=${String(it.snippet || '').slice(0, 200)}`);
    save(`item-${key}.json`, it);
    if (it.url && /FeatureServer|MapServer/.test(it.url)) { done.add(it.url.replace(/\/\d+$/, '')); if (/\/\d+$/.test(it.url)) await layer(it.url, key); else await service(it.url, key); }
    else if (/CSV|Excel|Microsoft Excel/i.test(it.type || '')) {
      const d = await get(`${SHARING}/content/items/${id}/data`, 'text');
      save(`${key}.${/csv/i.test(it.type) ? 'csv' : 'bin'}`, d.text); console.log(`      data ${d.status} ${d.type} ${d.text.length} bytes`);
    }
  }
  console.log('Services (matching):');
  const dir = await get(`${ORG}?f=json`);
  save('services.json', dir);
  for (const s of dir.services || []) {
    const name = s.name.split('/').pop();
    if (!MATCH.test(name)) continue;
    const url = s.url || `${ORG}/${name}/${s.type}`;
    if (done.has(url)) continue;
    console.log(`  SERVICE ${name} (${s.type})`);
    await service(url, name);
  }
  console.log(`All services: ${(dir.services || []).map(s => s.name.split('/').pop()).join(', ')}`);
})().catch(e => { console.error(e); process.exit(1); });
