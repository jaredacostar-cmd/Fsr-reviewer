#!/usr/bin/env node
/*
 * Stage 1 check for the lidar elevation sampler (js/elevation.js), run in GitHub Actions
 * (Probe data sources, mode=elev-check; the sandbox cannot reach these hosts):
 *  - the Ontario lidar DTM image service: getSamples on a multipoint (one request per profile),
 *    its raster functions (for the hillshade) and an exportImage hillshade tile;
 *  - which lidar project covers a point (the DTM package index), for the source label;
 *  - benchmarks with a published elevation (City of Brampton engineering survey controls) against
 *    the lidar DTM, with their vertical datum, for the "within 0.5 m" test.
 * Writes data/probe/elevation.json (committed to the branch it runs on).
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://jaredacostar-cmd.github.io';
const DTM = 'https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DTM_LidarDerived/ImageServer';
const IDX = 'https://services1.arcgis.com/TJH5KDher0W13Kgo/arcgis/rest/services/Ontario_Digital_Terrain_Model_Lidar_Derived_WFL1/FeatureServer/0';
const BM = 'https://maps1.brampton.ca/arcgis/rest/services/ACRIS/ACRIS/MapServer/15';
const q = o => new URLSearchParams(o).toString();
async function get(url, timeout = 40000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Origin: ORIGIN } });
    const type = r.headers.get('content-type') || '', cors = r.headers.get('access-control-allow-origin');
    if (/json|text/.test(type)) { const txt = await r.text(); try { return { status: r.status, cors, type, json: JSON.parse(txt) }; } catch { return { status: r.status, cors, type, text: txt.slice(0, 300) }; } }
    const buf = Buffer.from(await r.arrayBuffer()); return { status: r.status, cors, type, bytes: buf.length };
  } catch (e) { return { status: 0, error: e.message }; } finally { clearTimeout(t); }
}
const out = { generatedAt: new Date().toISOString(), dtm: DTM };

(async () => {
  // 1. The service: raster functions, pixel size, spatial reference, mosaic rule.
  const info = await get(`${DTM}?f=json`);
  const j = info.json || {};
  out.service = { cors: info.cors, pixelSize: j.pixelSizeX, wkid: j.extent && j.extent.spatialReference && (j.extent.spatialReference.latestWkid || j.extent.spatialReference.wkid),
    allowRasterFunction: j.allowRasterFunction, rasterFunctionInfos: (j.rasterFunctionInfos || []).map(r => r.name), mosaicMethods: j.allowedMosaicMethods, defaultMosaicMethod: j.defaultMosaicMethod,
    maxImageWidth: j.maxImageWidth, maxImageHeight: j.maxImageHeight, copyright: j.copyrightText || null, description: (j.description || '').slice(0, 400), spatialReferenceVcs: j.spatialReference && j.spatialReference.vcsWkid };
  console.log('service', JSON.stringify(out.service));

  // 2. getSamples on a multipoint: a transect across Brampton (one request).
  const pts = Array.from({ length: 12 }, (_, i) => [-79.80 + i * 0.008, 43.69]);
  const gs = await get(`${DTM}/getSamples?${q({ geometry: JSON.stringify({ points: pts, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: true, outFields: '*', f: 'json' })}`);
  out.getSamples = { status: gs.status, cors: gs.cors, n: gs.json && gs.json.samples ? gs.json.samples.length : 0, sample: gs.json && gs.json.samples ? gs.json.samples.slice(0, 3) : null, error: gs.json && gs.json.error || gs.error || null };
  console.log('getSamples', JSON.stringify(out.getSamples).slice(0, 800));
  // getSamples outside Ontario's lidar (Lake Ontario, offshore): what a miss looks like.
  const miss = await get(`${DTM}/getSamples?${q({ geometry: JSON.stringify({ points: [[-79.55, 43.45], [-79.40, 43.40]], spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: true, f: 'json' })}`);
  out.getSamplesMiss = { status: miss.status, samples: miss.json && miss.json.samples, error: miss.json && miss.json.error || null };
  console.log('miss', JSON.stringify(out.getSamplesMiss).slice(0, 600));

  // 3. A hillshade tile: exportImage with a Hillshade raster function (if the server allows it).
  const bbox = '-8880000,5418000,-8875000,5423000';
  for (const rr of [{ rasterFunction: 'Hillshade', rasterFunctionArguments: { Azimuth: 315, Altitude: 45, ZFactor: 1 } }, { rasterFunction: 'Hillshade' }]) {
    const r = await get(`${DTM}/exportImage?${q({ bbox, bboxSR: 3857, imageSR: 3857, size: '256,256', format: 'png', renderingRule: JSON.stringify(rr), f: 'image' })}`);
    (out.hillshade = out.hillshade || []).push({ rule: rr, status: r.status, type: r.type, bytes: r.bytes || null, cors: r.cors, text: r.text || null });
  }
  console.log('hillshade', JSON.stringify(out.hillshade));

  // 4. Which lidar project covers a point (package index).
  out.projects = [];
  for (const [lng, lat, name] of [[-79.5860, 43.5520, 'Port Credit'], [-79.7599, 43.6858, 'Brampton centre'], [-79.8640, 43.8740, 'Caledon East'], [-80.0500, 43.9700, 'Hockley']]) {
    const r = await get(`${IDX}/query?${q({ geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'Project,Resolution,Package', returnGeometry: false, f: 'json' })}`);
    out.projects.push({ name, cors: r.cors, projects: r.json && r.json.features ? r.json.features.map(f => f.attributes) : r.json });
  }
  console.log('projects', JSON.stringify(out.projects));

  // 5. Benchmarks: Brampton survey controls with an elevation, against the lidar DTM.
  const info15 = await get(`${BM}?f=json`);
  out.benchmarkLayer = { cors: info15.cors, fields: info15.json && (info15.json.fields || []).map(f => `${f.name}:${(f.type || '').replace('esriFieldType', '')}`), maxRecordCount: info15.json && info15.json.maxRecordCount, advancedQuery: info15.json && info15.json.advancedQueryCapabilities };
  let bm = await get(`${BM}/query?${q({ where: '1=1', outFields: '*', returnGeometry: true, outSR: 4326, f: 'json' })}`);
  out.benchmarkQuery = { status: bm.status, error: bm.json && bm.json.error || bm.error || null, n: bm.json && bm.json.features ? bm.json.features.length : 0 };
  const feats = (bm.json && bm.json.features) || [];
  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.\-]/g, '')); return isFinite(n) ? n : null; };
  const cand = feats.map(f => ({ a: f.attributes, g: f.geometry })).filter(x => x.g && num(x.a.ELEVATION) > 50);
  out.datums = {}; for (const x of cand) { const k = String(x.a.DATUM_V); out.datums[k] = (out.datums[k] || 0) + 1; }
  const pick = cand.slice(0, 80);
  const samples = [];
  for (let i = 0; i < pick.length; i += 40) {
    const chunk = pick.slice(i, i + 40);
    const r = await get(`${DTM}/getSamples?${q({ geometry: JSON.stringify({ points: chunk.map(x => [x.g.x, x.g.y]), spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: true, f: 'json' })}`);
    const s = (r.json && r.json.samples) || [];
    chunk.forEach((x, k) => { const v = s.find(t => t.locationId === k); samples.push({ x, v: v ? num(v.value) : null }); });
  }
  out.benchmarks = samples.map(({ x, v }) => ({ monument: x.a.MONUMENT, elevation: num(x.a.ELEVATION), datum: x.a.DATUM_V, status: x.a.STATUS, vc: x.a.VC, desc: String(x.a.DESCRIPTION || '').slice(0, 100), lastInsp: x.a.LAST_INSP, lat: +x.g.y.toFixed(6), lng: +x.g.x.toFixed(6), lidar: v, diff: v != null ? +(v - num(x.a.ELEVATION)).toFixed(3) : null }));
  const d = out.benchmarks.map(b => b.diff).filter(v => v != null).sort((a, b) => a - b);
  out.benchmarkStats = d.length ? { n: d.length, median: d[Math.floor(d.length / 2)], p10: d[Math.floor(d.length * 0.1)], p90: d[Math.floor(d.length * 0.9)], within05: d.filter(v => Math.abs(v) <= 0.5).length } : null;
  console.log('benchmarks', JSON.stringify(out.benchmarkStats), JSON.stringify(out.datums));

  const file = 'data/probe/elevation.json';
  fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`Wrote ${file}`);
})().catch(e => { console.error(e); process.exit(1); });
