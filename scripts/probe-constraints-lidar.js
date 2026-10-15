#!/usr/bin/env node
/*
 * Stage 0 source check (report only) for lidar elevation and the constraint layers.
 * For each dataset in the brief: the endpoint or download, its format, whether it covers Peel
 * (Mississauga, Brampton, Caledon), its resolution or scale, its update date, its licence (from the
 * item's own licence text, the service copyright and description) and whether a browser on the
 * site's origin may read it (CORS). Writes a JSON summary for docs/sources-constraints-lidar.md.
 *   node scripts/probe-constraints-lidar.js [--out data/probe/constraints-lidar.json]
 * Run in GitHub Actions (Probe data sources, mode=constraints-lidar): the sandbox cannot reach
 * these hosts.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ORIGIN = 'https://jaredacostar-cmd.github.io';
const SHARING = 'https://www.arcgis.com/sharing/rest';
const PEEL = { xmin: -80.16, ymin: 43.47, xmax: -79.48, ymax: 44.00 };
// Points to sample: one in each municipality (south Mississauga, Brampton centre, Caledon East),
// plus one north of Peel (the NVCA edge, Caledon / Mono).
const POINTS = [
  { name: 'Mississauga (Port Credit)', lat: 43.5520, lng: -79.5860 },
  { name: 'Brampton (city centre)', lat: 43.6858, lng: -79.7599 },
  { name: 'Caledon East', lat: 43.8740, lng: -79.8640 },
  { name: 'Caledon north (Hockley / NVCA)', lat: 43.9700, lng: -80.0500 },
];
const LIO = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA';
const q = o => new URLSearchParams(o).toString();
const strip = h => String(h || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const out = { generatedAt: new Date().toISOString(), origin: ORIGIN, peel: PEEL, datasets: {} };
const add = (id, entry) => { (out.datasets[id] = out.datasets[id] || []).push(entry); console.log(`  [${id}] ${JSON.stringify(entry).slice(0, 700)}`); };

async function req(url, { timeout = 30000, headers = {}, method = 'GET' } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, signal: ctl.signal, headers: { Origin: ORIGIN, ...headers } });
    const h = Object.fromEntries(['access-control-allow-origin', 'access-control-expose-headers', 'accept-ranges', 'content-range', 'content-type', 'content-length', 'last-modified'].map(k => [k, r.headers.get(k)]));
    const buf = method === 'HEAD' ? '' : await r.text();
    let json = null; try { json = JSON.parse(buf); } catch { /* not JSON */ }
    return { status: r.status, headers: h, json, text: buf.slice(0, 300) };
  } catch (e) { return { status: 0, error: e.message, headers: {} }; } finally { clearTimeout(t); }
}
const getJ = async url => { const r = await req(url); return r.json ? Object.assign(r.json, { _cors: r.headers['access-control-allow-origin'], _status: r.status }) : { _status: r.status, _error: r.error || r.text, _cors: r.headers['access-control-allow-origin'] }; };
const env = { geometry: `${PEEL.xmin},${PEEL.ymin},${PEEL.xmax},${PEEL.ymax}`, geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' };

// ArcGIS items: title, owner, licence text, credits, modified, url.
async function items(query, num = 20) {
  const r = await getJ(`${SHARING}/search?${q({ q: query, num, f: 'json' })}`);
  const list = [];
  for (const it of r.results || []) {
    const d = await getJ(`${SHARING}/content/items/${it.id}?f=json`);
    list.push({ id: it.id, title: it.title, type: it.type, owner: it.owner, url: it.url || null, modified: it.modified ? new Date(it.modified).toISOString().slice(0, 10) : null,
      licence: strip(d.licenseInfo || it.licenseInfo).slice(0, 600) || null, credits: strip(d.accessInformation || it.accessInformation).slice(0, 300) || null,
      snippet: strip(it.snippet).slice(0, 200) || null, extent: it.extent || null });
  }
  return list;
}
// A feature / map layer: features inside Peel, geometry, scale, last edit, copyright, CORS.
async function layerInfo(url) {
  const info = await getJ(`${url}?f=json`);
  if (info._status !== 200 || info.error) return { url, ok: false, status: info._status, error: info.error || info._error, cors: info._cors };
  const cnt = info.type === 'Raster Layer' ? {} : await getJ(`${url}/query?${q({ where: '1=1', ...env, returnCountOnly: true, f: 'json' })}`);
  return { url, ok: true, name: info.name, type: info.type, geometry: info.geometryType || null, inPeel: cnt.count ?? null, cors: info._cors,
    maxRecordCount: info.maxRecordCount, minScale: info.minScale, maxScale: info.maxScale,
    lastEdit: info.editingInfo && info.editingInfo.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10) : null,
    copyright: strip(info.copyrightText).slice(0, 300) || null, description: strip(info.description).slice(0, 400) || null,
    fields: (info.fields || []).map(f => f.name).slice(0, 40) };
}
// Every layer of the LIO open data services whose name matches.
let lioLayers = null;
async function lioIndex() {
  if (lioLayers) return lioLayers;
  lioLayers = [];
  const dir = await getJ(`${LIO}?f=json`);
  for (const s of dir.services || []) {
    const svc = `https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/${s.name}/${s.type}`;
    const j = await getJ(`${svc}?f=json`);
    for (const l of j.layers || []) lioLayers.push({ url: `${svc}/${l.id}`, name: l.name, service: s.name });
  }
  console.log(`  LIO open data: ${lioLayers.length} layers in ${(dir.services || []).length} services`);
  return lioLayers;
}
async function lio(id, re, max = 6) {
  const all = await lioIndex();
  for (const l of all.filter(x => re.test(x.name)).slice(0, max)) add(id, { source: 'LIO open data (Ontario)', layer: l.name, ...(await layerInfo(l.url)) });
}
async function arc(id, query, re, max = 6) {
  const list = await items(query, 25);
  for (const it of list.filter(x => !re || re.test(x.title)).slice(0, max)) {
    const entry = { source: 'ArcGIS item', title: it.title, owner: it.owner, itemType: it.type, modified: it.modified, licence: it.licence, credits: it.credits, url: it.url };
    if (it.url && /Feature Service|Map Service/.test(it.type)) {
      const svc = await getJ(`${it.url}?f=json`);
      const ls = svc.layers ? svc.layers.slice(0, 4).map(l => `${it.url.replace(/\/$/, '')}/${l.id}`) : [it.url];
      entry.layers = []; for (const u of ls) entry.layers.push(await layerInfo(u));
    } else if (it.url && /Image Service/.test(it.type)) entry.image = await imageInfo(it.url);
    add(id, entry);
  }
}
// An image service: pixel size, extent, a sample value at each point, CORS.
async function imageInfo(url) {
  const info = await getJ(`${url}?f=json`);
  if (info._status !== 200 || info.error) return { url, ok: false, status: info._status, error: info.error || info._error, cors: info._cors };
  const samples = [];
  for (const p of POINTS) {
    const r = await getJ(`${url}/identify?${q({ geometry: JSON.stringify({ x: p.lng, y: p.lat, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPoint', returnGeometry: false, returnCatalogItems: false, f: 'json' })}`);
    samples.push({ at: p.name, value: r.value ?? null, error: r.error ? r.error.message : null });
  }
  return { url, ok: true, name: info.name, pixelSizeX: info.pixelSizeX, pixelSizeY: info.pixelSizeY, bandCount: info.bandCount, pixelType: info.pixelType,
    extent: info.extent, wkid: info.extent && info.extent.spatialReference && (info.extent.spatialReference.latestWkid || info.extent.spatialReference.wkid),
    copyright: strip(info.copyrightText).slice(0, 300) || null, description: strip(info.description).slice(0, 400) || null, cors: info._cors,
    capabilities: info.capabilities, maxImageWidth: info.maxImageWidth, samples };
}
// A cloud-optimised GeoTIFF: does the host allow a browser range request?
async function cog(url) {
  const r = await req(url, { headers: { Range: 'bytes=0-16383' } });
  return { url, status: r.status, cors: r.headers['access-control-allow-origin'], acceptRanges: r.headers['accept-ranges'], contentRange: r.headers['content-range'], exposeHeaders: r.headers['access-control-expose-headers'], contentType: r.headers['content-type'], lastModified: r.headers['last-modified'], error: r.error || null };
}

(async () => {
  const outFile = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : null; })();

  console.log('\n### Elevation: Ontario Digital Terrain Model (Lidar-Derived)');
  const geo = 'https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation';
  const dir = await getJ(`${geo}?f=json`);
  console.log(`  ${geo}: ${(dir.services || []).map(s => `${s.name}:${s.type}`).join(' | ') || dir._status}`);
  for (const s of dir.services || []) if (/dtm|lidar|terrain|hillshade|dem/i.test(s.name)) {
    const u = `https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/${s.name}/${s.type}`;
    if (s.type === 'ImageServer') add('elev-ontario-dtm', { source: 'LIO geoservices', service: s.name, image: await imageInfo(u) });
    else add('elev-ontario-dtm', { source: 'LIO geoservices', service: s.name, ...(await layerInfo(u)) });
  }
  await arc('elev-ontario-dtm', '"Digital Terrain Model" AND (lidar OR "Lidar-Derived") AND Ontario', /terrain|dtm|lidar/i);
  const hub = await getJ('https://geohub.lio.gov.on.ca/api/search/v1/collections/all/items?q=lidar%20digital%20terrain%20model&limit=15');
  for (const f of (hub.features || [])) add('elev-ontario-dtm', { source: 'Ontario GeoHub', title: f.properties && f.properties.title, type: f.properties && f.properties.type, licence: strip(f.properties && (f.properties.license || f.properties.licenseInfo)).slice(0, 400), modified: f.properties && f.properties.modified, links: (f.links || []).map(l => l.href).slice(0, 4) });
  if (!(hub.features || []).length) add('elev-ontario-dtm', { source: 'Ontario GeoHub search', status: hub._status, error: hub._error || null });

  console.log('\n### Elevation: NRCan HRDEM / CanElevation (STAC, COG)');
  const STAC = 'https://datacube.services.geo.ca/stac/api';
  const cols = await getJ(`${STAC}/collections`);
  const hrdem = (cols.collections || []).filter(c => /hrdem|mrdem|elevation|dtm/i.test(c.id));
  for (const c of hrdem) {
    const s = await getJ(`${STAC}/search?${q({ collections: c.id, bbox: `${PEEL.xmin},${PEEL.ymin},${PEEL.xmax},${PEEL.ymax}`, limit: 100 })}`);
    const feats = s.features || [];
    const dtm = feats.map(f => Object.entries(f.assets || {}).find(([k]) => /dtm/i.test(k))).filter(Boolean);
    const first = dtm[0] ? dtm[0][1].href : null;
    add('elev-nrcan-hrdem', { source: 'NRCan STAC', collection: c.id, title: c.title, licence: c.license || null, links: (c.links || []).filter(l => /licen/i.test(l.rel || l.title || '')).map(l => l.href),
      itemsInPeel: feats.length, dates: [...new Set(feats.map(f => (f.properties && (f.properties.datetime || f.properties.start_datetime) || '').slice(0, 10)))].sort().slice(-8),
      gsd: [...new Set(feats.map(f => f.properties && (f.properties.gsd || (f.properties['proj:transform'] || [])[0])).filter(Boolean))].slice(0, 4),
      assetKeys: feats[0] ? Object.keys(feats[0].assets || {}) : [], sampleDtm: first, cog: first ? await cog(first) : null });
  }
  if (!hrdem.length) add('elev-nrcan-hrdem', { source: 'NRCan STAC collections', status: cols._status, error: cols._error || null, ids: (cols.collections || []).map(c => c.id).slice(0, 40) });
  for (const u of ['https://datacube.services.geo.ca/ows/elevation?service=WCS&request=GetCapabilities', 'https://datacube.services.geo.ca/ows/elevation?service=WMS&request=GetCapabilities']) {
    const r = await req(u); add('elev-nrcan-hrdem', { source: 'NRCan OWS', url: u, status: r.status, cors: r.headers['access-control-allow-origin'], hasDtm: /dtm/i.test(r.text || '') });
  }

  console.log('\n### Elevation: AWS Terrain Tiles (fallback)');
  for (const u of ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/12/1144/1493.png', 'https://s3.amazonaws.com/elevation-tiles-prod/geotiff/12/1144/1493.tif']) {
    const r = await req(u, { method: 'HEAD' }); add('elev-aws-terrain', { source: 'AWS Open Data (Mapzen Terrain Tiles)', url: u, status: r.status, cors: r.headers['access-control-allow-origin'], lastModified: r.headers['last-modified'] });
  }

  console.log('\n### Benchmarks with a published elevation (for the 0.5 m lidar test)');
  await arc('benchmark', '(benchmark OR "bench mark" OR "survey control" OR "geodetic control") AND (Mississauga OR Brampton OR Caledon OR Peel)', /bench|control|geodetic|monument/i);

  console.log('\n### Conservation authority regulation limits (O. Reg. 41/24, current)');
  await arc('reg-cvc', '("regulation limit" OR "regulated area" OR "regulation area") AND (CVC OR "Credit Valley")', /regul/i);
  await arc('reg-trca', '("regulation limit" OR "regulated area") AND (TRCA OR "Toronto and Region")', /regul/i);
  await arc('reg-nvca', '("regulation limit" OR "regulated area" OR "regulation mapping" OR "regulated") AND (NVCA OR Nottawasaga)', /regul/i);
  for (const u of ['https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services/Generic_Regulations_Limit_2025/FeatureServer/0', 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services/TRCA_Regulation_Limit2/FeatureServer/0'])
    add(/TRCA/.test(u) ? 'reg-trca' : 'reg-cvc', { source: 'in the app today', ...(await layerInfo(u)) });
  const owner = await getJ('https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services?f=json');
  add('reg-trca', { source: 'org d0ZCwU7eGKVeNiEE (who publishes the two services in the app)', services: (owner.services || []).map(s => s.name).slice(0, 80) });

  console.log('\n### Floodplain / flood hazard');
  await arc('flood-cvc', '(floodplain OR "flood plain" OR "flood hazard" OR "regulatory flood") AND (CVC OR "Credit Valley")', /flood/i);
  await arc('flood-trca', '(floodplain OR "flood plain" OR "flood hazard" OR "regulatory flood") AND (TRCA OR "Toronto and Region")', /flood/i);
  await arc('flood-nvca', '(floodplain OR "flood plain" OR "flood hazard") AND (NVCA OR Nottawasaga)', /flood/i);

  console.log('\n### Provincial plan areas and natural heritage (LIO)');
  await lio('greenbelt', /greenbelt/i);
  await lio('orm', /oak ridges/i);
  await lio('nep', /niagara escarpment/i);
  await lio('psw', /wetland/i);
  await lio('ansi', /natural and scientific|\bansi\b/i);
  await lio('nhs-growth-plan', /natural heritage system|growth plan/i);
  await lio('source-protection', /wellhead|intake protection|highly vulnerable|groundwater recharge|source protection|vulnerab/i, 10);
  await lio('watercourse-ohn', /watercourse|waterbody|ontario hydro network/i);
  await lio('utility-lines', /utility line|transmission|pipeline/i);
  await arc('greenbelt', '"Greenbelt" AND (plan OR area OR boundary) AND Ontario', /greenbelt/i, 4);
  await arc('source-protection', '("wellhead protection" OR "intake protection" OR "highly vulnerable aquifer" OR "significant groundwater recharge") AND (CTC OR "Credit Valley" OR "Toronto and Region" OR "Central Lake Ontario" OR Ontario)', /wellhead|intake|vulnerab|recharge|protection/i);

  console.log('\n### Existing layers: watercourses (Peel), gas / hydro');
  add('watercourse-peel', { source: 'in the app today', ...(await layerInfo('https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services/Watercourses/FeatureServer/0')) });
  await arc('watercourse-peel', 'Watercourses AND (Peel OR "Region of Peel")', /watercourse/i, 3);

  if (outFile) { fs.mkdirSync(path.dirname(outFile), { recursive: true }); fs.writeFileSync(outFile, JSON.stringify(out, null, 1)); console.log(`\nWrote ${outFile}`); }
})().catch(e => { console.error(e); process.exit(1); });
