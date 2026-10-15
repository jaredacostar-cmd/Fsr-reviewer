#!/usr/bin/env node
'use strict';
/*
 * The 3D view's pilot tiles (Part 2 of the measure / 3D / Time Box brief). Runs in Actions
 * (Probe data sources, mode=tiles-3d): the sandbox cannot reach these services.
 *
 *  1. Terrain: the province's lidar terrain model (Ontario DTM, bare earth, CGVD2013; never the
 *     surface model) exported tile by tile over the pilot box, z12–16, as Terrarium PNGs in
 *     data/3d/lidar-pilot.pmtiles. Heights are rounded to 0.1 m (smaller files; the lidar is
 *     validated to about 0.15 m). Gaps in the lidar are filled from neighbouring lidar pixels
 *     only; a tile with no lidar is left out, so the app uses the terrain tiles there (CGVD28,
 *     about 0.4 m apart, and the legend says so). Five pixels per zoom are checked against the
 *     service's own getSamples.
 *  2. Buildings: OpenStreetMap buildings and building parts in the pilot box (Overpass), with
 *     the height rule of js/massing-core.js (height tag → levels × 3.2 m → 2 storeys, estimated),
 *     as vector tiles z13–16 in data/3d/buildings-pilot.pmtiles (layer "buildings").
 *  3. data/3d/manifest.json: the box, the sources, datums, dates, counts and attribution.
 *
 * Needs geojson-vt and vt-pbf (npm install --no-save, in the workflow).
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const M = require('../js/massing-core.js');
const PNG = require('./lib-png.js');
const TIFF = require('./lib-tiff.js');
const PMT = require('./lib-pmtiles.js');

const OUT = path.join(__dirname, '../data/3d');
const PILOT = { name: 'North Brampton pilot', bbox: [-79.830, 43.700, -79.760, 43.740] };
const DTM = 'https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DTM_LidarDerived/ImageServer';
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const TERRAIN_Z = [12, 16], BUILD_Z = [13, 16], QUANTUM = 0.1, SIZE = 256;
const UA = { 'User-Agent': 'peel-growth-pipeline (github.com/jaredacostar-cmd/Fsr-reviewer)' };
const q = o => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Polite fetch: up to 3 tries; 429 / 5xx back off (Retry-After honoured, else 2 s, 4 s).
async function get(url, opts = {}, tries = 3) {
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { ...opts, headers: { ...UA, ...(opts.headers || {}) }, signal: AbortSignal.timeout(opts.timeout || 120000) });
      if (r.ok) return Buffer.from(await r.arrayBuffer());
      if (r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
      await sleep(Math.min(30, +r.headers.get('retry-after') || 2 * 2 ** i) * 1000);
    } catch (e) { if (i === tries - 1 || /HTTP 4/.test(e.message)) throw e; await sleep(2000 * 2 ** i); }
  }
  throw new Error('no answer');
}

const merc = (lng, lat) => [lng * 20037508.342789244 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 6378137];

// ---- 1. Lidar terrain -----------------------------------------------------------------------
async function lidarTile(z, x, y) {
  const b = M.tileBounds(z, x, y), [x0, y0] = merc(b.w, b.s), [x1, y1] = merc(b.e, b.n);
  const url = `${DTM}/exportImage?${q({ bbox: `${x0},${y0},${x1},${y1}`, bboxSR: 3857, imageSR: 3857, size: `${SIZE},${SIZE}`, format: 'tiff', pixelType: 'F32', noData: -9999, noDataInterpretation: 'esriNoDataMatchAny', interpolation: 'RSP_BilinearInterpolation', compression: 'None', f: 'image' })}`;
  const t0 = Date.now(), buf = await get(url, { timeout: 45000 }, 2);
  if (buf.subarray(0, 4).toString('latin1').match(/^(\{|<)/)) throw new Error(`not an image: ${buf.subarray(0, 200).toString()}`);
  const t = TIFF.decode(buf);
  if (!lidarTile.logged) { lidarTile.logged = true; console.log(`  first tile ${z}/${x}/${y}: ${buf.length} bytes, ${Date.now() - t0} ms`); }
  if (t.width !== SIZE || t.height !== SIZE) throw new Error(`tile ${z}/${x}/${y}: ${t.width}×${t.height}`);
  const bad = v => !Number.isFinite(v) || v === t.noData || v <= -9000 || v > 3000;
  return { data: t.data, valid: Array.from(t.data, v => !bad(v)) };
}
// Fill gaps from neighbouring lidar pixels (repeated 3×3 averaging); null when the tile has none.
function fillGaps({ data, valid }) {
  let left = valid.filter(v => !v).length; if (left === SIZE * SIZE) return null;
  const z = Float32Array.from(data), ok = valid.slice();
  for (let pass = 0; left && pass < 300; pass++) {
    const add = [];
    for (let i = 0; i < z.length; i++) {
      if (ok[i]) continue;
      const x = i % SIZE, y = (i / SIZE) | 0; let s = 0, n = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < SIZE && Y < SIZE && ok[Y * SIZE + X]) { s += z[Y * SIZE + X]; n++; } }
      if (n) add.push([i, s / n]);
    }
    for (const [i, v] of add) { z[i] = v; ok[i] = true; }
    left -= add.length;
  }
  return { z, filled: valid.filter(v => !v).length };
}
function encodeTile(z) {
  const rgb = Buffer.alloc(SIZE * SIZE * 3);
  for (let i = 0; i < z.length; i++) rgb.set(M.terrariumEncode(z[i], QUANTUM), i * 3);
  return PNG.encode(SIZE, SIZE, rgb, 3);
}
async function samples(points) {
  const j = JSON.parse((await get(`${DTM}/getSamples?${q({ geometry: JSON.stringify({ points: points.map(p => [p.lng, p.lat]), spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: true, interpolation: 'RSP_BilinearInterpolation', outFields: 'Project', f: 'json' })}`)).toString());
  const out = points.map(() => null);
  for (const s of j.samples || []) { const v = parseFloat(s.value); if (Number.isFinite(v)) out[s.locationId] = { z: v, project: s.attributes && s.attributes.Project }; }
  return out;
}
async function buildTerrain() {
  const tiles = [], checks = []; let filled = 0, skipped = 0;
  for (let z = TERRAIN_Z[0]; z <= TERRAIN_Z[1]; z++) {
    const list = M.tilesInBbox(PILOT.bbox, z);
    console.log(`lidar z${z}: ${list.length} tiles`);
    for (const t of list) {
      let raw; try { raw = await lidarTile(t.z, t.x, t.y); } catch (e) {
        console.log(`  ${t.z}/${t.x}/${t.y}: ${e.message.slice(0, 300)}`); skipped++;
        if (!tiles.length && skipped >= 3) throw new Error(`lidar export failing: ${e.message.slice(0, 200)}`);
        continue;
      }
      const f = fillGaps(raw); if (!f) { skipped++; continue; }
      filled += f.filled;
      tiles.push({ ...t, data: encodeTile(f.z), z16: f.z });
      if (tiles.length % 25 === 0) console.log(`  ${tiles.length} tiles`);
      await sleep(100);
    }
    // Check: five pixel centres per zoom against getSamples (same service, bilinear).
    const zt = tiles.filter(t => t.z === z); if (!zt.length) continue;
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const t = zt[(k * 7919) % zt.length], px = 40 + ((k * 53) % 176), py = 40 + ((k * 97) % 176), n = 2 ** z;
      const lng = (t.x + (px + 0.5) / SIZE) / n * 360 - 180, lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (t.y + (py + 0.5) / SIZE) / n))) * 180 / Math.PI;
      pts.push({ lng: +lng.toFixed(7), lat: +lat.toFixed(7), tile: t.z16[py * SIZE + px] });
    }
    try { const s = await samples(pts); pts.forEach((p, i) => { if (s[i]) checks.push({ z, diff: +(p.tile - s[i].z).toFixed(3) }); }); } catch (e) { console.log(`  check z${z}: ${e.message}`); }
  }
  if (!tiles.length) return null;
  const centre = await samples([{ lng: (PILOT.bbox[0] + PILOT.bbox[2]) / 2, lat: (PILOT.bbox[1] + PILOT.bbox[3]) / 2 }]).catch(() => [null]);
  const project = centre[0] && centre[0].project || null, year = project ? +((String(project).match(/(19|20)\d\d(?!.*(19|20)\d\d)/) || [])[0]) || null : null;
  const abs = checks.map(c => Math.abs(c.diff)).sort((a, b) => a - b);
  const attribution = 'Terrain: Ontario Digital Terrain Model (Lidar-Derived), Ontario Ministry of Natural Resources, Open Government Licence – Ontario';
  const file = 'lidar-pilot.pmtiles';
  fs.writeFileSync(path.join(OUT, file), PMT.write(tiles.map(({ z, x, y, data }) => ({ z, x, y, data })), { type: 'png', bounds: PILOT.bbox, metadata: { name: 'Lidar terrain, North Brampton pilot', encoding: 'terrarium', datum: 'CGVD2013', quantum: QUANTUM, attribution } }));
  return { file, encoding: 'terrarium', minzoom: TERRAIN_Z[0], maxzoom: TERRAIN_Z[1], tiles: tiles.length, skipped, filledPixels: filled, datum: 'CGVD2013', model: 'DTM (bare earth)', project, year, quantum: QUANTUM, check: { n: abs.length, medianAbs: abs.length ? abs[abs.length >> 1] : null, maxAbs: abs.length ? abs[abs.length - 1] : null }, attribution, bytes: fs.statSync(path.join(OUT, file)).size };
}

// ---- 2. OSM buildings -----------------------------------------------------------------------
async function overpass(ql) {
  for (const url of OVERPASS) {
    try { return JSON.parse((await get(url, { method: 'POST', body: `data=${encodeURIComponent(ql)}`, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 200000 }, 1)).toString()); }
    catch (e) { console.log(`overpass ${url}: ${e.message}`); }
  }
  throw new Error('no Overpass server answered');
}
function polygonsOf(el) {
  const ring = g => g.map(p => [+p.lon.toFixed(7), +p.lat.toFixed(7)]);
  const closed = r => r.length >= 4 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1];
  if (el.type === 'way' && el.geometry) { const r = ring(el.geometry); return closed(r) ? [[r]] : []; }
  if (el.type === 'relation' && el.members) {
    const outers = el.members.filter(m => m.role === 'outer' && m.geometry).map(m => ring(m.geometry)).filter(closed);
    const inners = el.members.filter(m => m.role === 'inner' && m.geometry).map(m => ring(m.geometry)).filter(closed);
    return outers.map((o, i) => i === 0 ? [o, ...inners] : [o]);
  }
  return [];
}
async function buildBuildings() {
  const geojsonvt = require('geojson-vt'), vtpbf = require('vt-pbf');
  const [w, s, e, n] = PILOT.bbox, b = `${s},${w},${n},${e}`;
  const j = await overpass(`[out:json][timeout:200];(way["building"](${b});relation["building"]["type"="multipolygon"](${b});way["building:part"](${b}););out geom;`);
  const features = [], byBasis = { height: 0, levels: 0, default: 0 };
  const hasParts = new Set();   // buildings drawn by their parts: the outline is not extruded too
  const parts = (j.elements || []).filter(el => el.tags && el.tags['building:part']);
  for (const el of j.elements || []) {
    if (!el.tags) continue;
    const isPart = !!el.tags['building:part'];
    if (!isPart && parts.length && el.type === 'way' && el.geometry) {
      const xs = el.geometry.map(p => p.lon), ys = el.geometry.map(p => p.lat), bb = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      if (parts.some(p => p.geometry && p.geometry.every(g => g.lon >= bb[0] - 1e-6 && g.lon <= bb[2] + 1e-6 && g.lat >= bb[1] - 1e-6 && g.lat <= bb[3] + 1e-6))) { hasParts.add(el.id); continue; }
    }
    const ht = M.buildingHeight(el.tags), base = M.buildingBase(el.tags);
    for (const coords of polygonsOf(el)) {
      if (!isPart) byBasis[ht.basis]++;
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: coords }, properties: { h: ht.h, b: Math.min(base, ht.h), e: ht.estimated ? 1 : 0, s: ht.basis } });
    }
  }
  const index = geojsonvt({ type: 'FeatureCollection', features }, { maxZoom: BUILD_Z[1], indexMaxZoom: BUILD_Z[1], tolerance: 2, extent: 4096, buffer: 64 });
  const tiles = [];
  for (let z = BUILD_Z[0]; z <= BUILD_Z[1]; z++) for (const t of M.tilesInBbox(PILOT.bbox, z)) {
    const vt = index.getTile(z, t.x, t.y); if (!vt || !vt.features.length) continue;
    tiles.push({ z, x: t.x, y: t.y, data: zlib.gzipSync(Buffer.from(vtpbf.fromGeojsonVt({ buildings: vt }, { version: 2 }))) });
  }
  const attribution = '© OpenStreetMap contributors, ODbL';
  const file = 'buildings-pilot.pmtiles';
  fs.writeFileSync(path.join(OUT, file), PMT.write(tiles, { type: 'mvt', tileCompression: 'gzip', bounds: PILOT.bbox, metadata: { name: 'OSM buildings, North Brampton pilot', attribution, vector_layers: [{ id: 'buildings', fields: { h: 'Number', b: 'Number', e: 'Number', s: 'String' }, minzoom: BUILD_Z[0], maxzoom: BUILD_Z[1] }], heightRule: `height tag → building:levels × ${M.STOREY_M} m → ${M.DEFAULT_STOREYS} storeys (estimated)` } }));
  return { file, layer: 'buildings', minzoom: BUILD_Z[0], maxzoom: BUILD_Z[1], tiles: tiles.length, count: Object.values(byBasis).reduce((a, v) => a + v, 0), parts: parts.length, outlinesDrawnByParts: hasParts.size, byBasis, osmTimestamp: (j.osm3s && j.osm3s.timestamp_osm_base) || null, heightRule: `height tag → building:levels × ${M.STOREY_M} m → ${M.DEFAULT_STOREYS} storeys (estimated)`, attribution, bytes: fs.statSync(path.join(OUT, file)).size };
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const manifest = { generatedAt: new Date().toISOString(), name: PILOT.name, bbox: PILOT.bbox, note: 'Indicative 3D context for the pilot box only; outside it the 3D view uses the terrain tiles and shows no buildings. Rebuilt by scripts/build-3d-tiles.js (Probe data sources, mode=tiles-3d).' };
  try { manifest.terrain = await buildTerrain(); } catch (e) { console.log(`terrain: ${e.message}`); manifest.terrain = null; manifest.terrainError = e.message; }
  try { manifest.buildings = await buildBuildings(); } catch (e) { console.log(`buildings: ${e.message}`); manifest.buildings = null; manifest.buildingsError = e.message; }
  fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 1) + '\n');
  console.log(JSON.stringify(manifest, null, 1));
  if (!manifest.terrain && !manifest.buildings) process.exit(1);
})();
