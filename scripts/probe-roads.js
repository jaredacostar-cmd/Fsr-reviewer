#!/usr/bin/env node
/*
 * Source check (report only) for road centrelines over Peel: the Ontario Road Network on Land
 * Information Ontario's open data services. Lists the LIO_OPEN_DATA layers whose names mention
 * roads, then for each: geometry, fields, record limit, whether a browser on the site's origin may
 * read it (CORS) and a sample of segments around Brampton centre (names, classes, counts).
 *   node scripts/probe-roads.js [--out data/probe/roads.json]
 * Run in GitHub Actions (Probe data sources, mode=roads): the sandbox cannot reach this host.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://jaredacostar-cmd.github.io';
const LIO = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA';
// ~600 m around Brampton city centre
const BOX = { xmin: -79.7680, ymin: 43.6820, xmax: -79.7520, ymax: 43.6900 };
const out = { generatedAt: new Date().toISOString(), origin: ORIGIN, box: BOX, services: [], candidates: [] };

async function get(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 30000);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Origin: ORIGIN } });
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not JSON */ }
    return { status: r.status, cors: r.headers.get('access-control-allow-origin'), json, text: text.slice(0, 200) };
  } catch (e) { return { status: 0, error: String(e.message || e) }; } finally { clearTimeout(t); }
}

(async () => {
  const root = await get(`${LIO}?f=json`);
  const services = ((root.json && root.json.services) || []).filter(s => /MapServer|FeatureServer/.test(s.type));
  console.log(`LIO_OPEN_DATA: ${services.length} services (status ${root.status})`);
  for (const s of services) {
    const name = s.name.split('/').pop(), url = `${LIO}/${name}/${s.type}`;
    const info = await get(`${url}?f=json`);
    const layers = (info.json && info.json.layers) || [];
    out.services.push({ name, type: s.type, layers: layers.map(l => ({ id: l.id, name: l.name })) });
    for (const l of layers) if (/road|street|orn\b|segment|highway/i.test(l.name)) out.candidates.push({ service: name, type: s.type, id: l.id, name: l.name, url: `${url}/${l.id}` });
  }
  console.log(`candidates: ${out.candidates.map(c => `${c.service}/${c.id} ${c.name}`).join(' | ')}`);
  for (const c of out.candidates) {
    const li = await get(`${c.url}?f=json`);
    c.cors = li.cors; c.status = li.status;
    if (li.json) {
      c.geometryType = li.json.geometryType; c.maxRecordCount = li.json.maxRecordCount; c.formats = li.json.supportedQueryFormats;
      c.fields = (li.json.fields || []).map(f => `${f.name}:${f.type.replace('esriFieldType', '')}`);
      c.minScale = li.json.minScale; c.maxScale = li.json.maxScale;
    }
    const qs = new URLSearchParams({ f: 'json', where: '1=1', geometry: JSON.stringify({ ...BOX, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', outFields: '*', returnGeometry: 'true', outSR: '4326', resultRecordCount: '5' });
    const cnt = await get(`${c.url}/query?${new URLSearchParams({ f: 'json', where: '1=1', geometry: JSON.stringify({ ...BOX, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects', returnCountOnly: 'true' })}`);
    const smp = await get(`${c.url}/query?${qs}`);
    c.countInBox = cnt.json ? cnt.json.count : null; c.queryCors = smp.cors; c.queryStatus = smp.status;
    c.sample = smp.json && smp.json.features ? smp.json.features.map(f => ({ attributes: Object.fromEntries(Object.entries(f.attributes || {}).filter(([k]) => !/shape|objectid|globalid/i.test(k)).slice(0, 14)), points: f.geometry && f.geometry.paths ? f.geometry.paths.reduce((t, p) => t + p.length, 0) : null })) : (smp.json && smp.json.error) || smp.text;
    console.log(`  ${c.service}/${c.id} ${c.name}: ${c.geometryType}, max ${c.maxRecordCount}, CORS ${c.cors}/${c.queryCors}, ${c.countInBox} in the box\n    fields ${(c.fields || []).join(', ').slice(0, 600)}\n    sample ${JSON.stringify(c.sample).slice(0, 900)}`);
  }
  const i = process.argv.indexOf('--out');
  if (i > 0) { const f = process.argv[i + 1]; fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(out, null, 1)); console.log(`wrote ${f}`); }
})().catch(e => { console.error(e); process.exit(1); });
