#!/usr/bin/env node
/*
 * Finds and downloads the Region of Peel wastewater "Blocks" (40 sewersheds used for its inflow and
 * infiltration program) and anything else published with "Dragonfly: An Integrated Approach to
 * Resiliency" (F. Salehzadeh, WEFTEC 2024):
 *
 *  1. the Region's I&I story map (its item JSON), the web maps it embeds and their layers;
 *  2. an ArcGIS Online search for Peel block / sewershed / I&I / Dragonfly layers;
 *  3. every feature layer found: metadata and all features as GeoJSON (WGS84);
 *  4. the Access Water page for the paper (and any PDF link on it).
 *
 *   node scripts/probe-dragonfly.js --out dragonfly-raw
 */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const out = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'dragonfly-raw';
fs.mkdirSync(out, { recursive: true });
const log = (...a) => console.log(...a);
const AGO = 'https://www.arcgis.com/sharing/rest';
const STORY = '7a41c979a3a74990a229b93fa79507b3';

async function get(url, type = 'json') {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (peel-dev-tracker probe)' } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return type === 'json' ? r.json() : type === 'buf' ? Buffer.from(await r.arrayBuffer()) : r.text();
}
const save = (name, data) => { fs.writeFileSync(path.join(out, name), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 1)); log('  saved', name); };
const slug = s => String(s).replace(/https?:\/\//, '').replace(/[^A-Za-z0-9]+/g, '_').slice(0, 120);
const ids = s => [...new Set(String(s).match(/\b[0-9a-f]{32}\b/g) || [])];
const layerUrls = s => [...new Set((String(s).match(/https?:\/\/[^"'\s\\]+\/(?:FeatureServer|MapServer)(?:\/\d+)?/g) || []).map(u => u.replace(/\\\//g, '/')))];

const seenItems = new Set(), layers = new Set(), report = { items: [], layers: [], search: [], errors: [] };

async function item(id, depth = 0) {
  if (seenItems.has(id) || depth > 3) return;
  seenItems.add(id);
  try {
    const info = await get(`${AGO}/content/items/${id}?f=json`);
    if (info.error) { report.errors.push(`${id}: ${info.error.message}`); return; }
    log(`item ${id}: ${info.type} · ${info.title} · ${info.owner}`);
    report.items.push({ id, type: info.type, title: info.title, owner: info.owner, url: info.url || null, snippet: info.snippet || '' });
    save(`item_${id}.json`, info);
    if (info.url && /FeatureServer|MapServer/.test(info.url)) layers.add(info.url.replace(/\/$/, ''));
    let data = null;
    try { data = await get(`${AGO}/content/items/${id}/data?f=json`); } catch (e) { /* items with no data */ }
    if (data) {
      save(`data_${id}.json`, data);
      const s = JSON.stringify(data);
      for (const u of layerUrls(s)) layers.add(u);
      for (const sub of ids(s)) if (sub !== id) await item(sub, depth + 1);
    }
  } catch (e) { report.errors.push(`${id}: ${e.message}`); }
}

async function search() {
  const qs = [
    'peel block sewershed', 'peel inflow infiltration', 'peel "block study"', 'dragonfly resiliency', 'dragonfly peel',
    'peel sanitary blocks', 'region of peel wastewater blocks', 'peel I&I blocks', 'salehzadeh',
  ];
  for (const q of qs) {
    try {
      const r = await get(`${AGO}/search?f=json&num=100&q=${encodeURIComponent(q)}`);
      for (const x of r.results || []) {
        report.search.push({ q, id: x.id, type: x.type, title: x.title, owner: x.owner, url: x.url || null });
        if (/peel|dragonfly|block|sewershed|inflow/i.test(`${x.title} ${x.owner} ${x.snippet || ''} ${(x.tags || []).join(' ')}`)) await item(x.id);
      }
      log(`search "${q}": ${(r.results || []).length}`);
    } catch (e) { report.errors.push(`search ${q}: ${e.message}`); }
  }
}

async function downloadLayer(u) {
  try {
    const meta = await get(`${u}?f=json`);
    if (meta.error) { report.errors.push(`${u}: ${meta.error.message}`); return; }
    if (meta.layers && !/\/\d+$/.test(u)) {   // a service: list its layers
      for (const l of meta.layers) await downloadLayer(`${u}/${l.id}`);
      return;
    }
    const name = meta.name || u;
    const rec = { url: u, name, geometryType: meta.geometryType, fields: (meta.fields || []).map(f => f.name), count: null };
    report.layers.push(rec);
    if (!/Polygon|Polyline|Point/.test(meta.geometryType || '')) return;
    const cnt = await get(`${u}/query?where=1%3D1&returnCountOnly=true&f=json`).catch(() => ({}));
    rec.count = cnt.count ?? null;
    log(`layer ${name}: ${meta.geometryType}, ${rec.count} features, fields ${rec.fields.join(', ')}`);
    if (rec.count > 20000) return;
    const feats = [];
    for (let off = 0; ; off += 1000) {
      const j = await get(`${u}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultOffset=${off}&resultRecordCount=1000`);
      feats.push(...(j.features || []));
      if (!(j.features || []).length || (!j.exceededTransferLimit && j.features.length < 1000)) break;
    }
    save(`layer_${slug(u)}.geojson`, { type: 'FeatureCollection', name, source: u, features: feats });
  } catch (e) { report.errors.push(`${u}: ${e.message}`); }
}

async function paper() {
  const url = 'https://accesswater.org/publications/proceedings/-10116161/dragonfly-an-integrated-approach-to-resiliency';
  try {
    const html = await get(url, 'text');
    save('accesswater.html', html);
    for (const m of html.matchAll(/href="([^"]+\.pdf[^"]*)"/gi)) {
      const pdf = new URL(m[1], url).href;
      try { save(`paper_${slug(pdf)}.pdf`, await get(pdf, 'buf')); } catch (e) { report.errors.push(`${pdf}: ${e.message}`); }
    }
  } catch (e) { report.errors.push(`accesswater: ${e.message}`); }
}

(async () => {
  await item(STORY);
  await search();
  log(`\n${layers.size} layer / service URLs:`); for (const u of layers) log(' ', u);
  // Everything the story map and the Peel items reference (layers with a likely name first), up to 60.
  const order = [...layers].sort((a, b) => /block|sewer|sanit|inflow|i_i|dragon/i.test(b) - /block|sewer|sanit|inflow|i_i|dragon/i.test(a));
  for (const u of order.slice(0, 60)) await downloadLayer(u);
  await paper();
  save('report.json', report);
  log('\nerrors:', report.errors.length); for (const e of report.errors.slice(0, 40)) log(' ', e);
})();
