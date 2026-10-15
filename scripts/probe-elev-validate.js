#!/usr/bin/env node
/*
 * Ground elevation against Peel sanitary manholes (Part 1, item 6), run in GitHub Actions (the
 * sandbox cannot reach these hosts): Probe data sources, mode=elev-validate, and the Elevation
 * validation workflow (--check).
 *
 *  1. Peel sanitary mains (Region of Peel, waterwastWater/FeatureServer/10) in each validation area:
 *     manhole ground = invert + published depth at each end (js/profile-core.js manholesFromMains:
 *     depths kept only between 0.5 and 15 m), at most PER_AREA manholes per area, spread evenly.
 *  2. Vertical datums, never mixed silently: the lidar DTM is CGVD2013 (MNR). Peel's datum is read
 *     from the layer's metadata (vcsWkid, description, copyright); N28 − N2013 at every manhole comes
 *     from NRCan's HT2_2010v70 and CGG2013a grids through PROJ cct (as the benchmark check does).
 *     Without a stated datum, it is inferred from the comparison and labelled "inferred".
 *  3. The raw sources only, never the manhole-corrected line: the lidar DTM (getSamples, bilinear)
 *     and the terrain tiles (bilinear, the app's own arithmetic) at every manhole.
 *  4. Writes data/elevation-validation.json (the table the app's accuracy label reads) and
 *     tests/fixtures/manhole-sample.json (positions, inverts, depths, shifts and the sampled values;
 *     no facility ids). The internal data check (manholes whose ground differs from the DEM by more
 *     than 5 m, with FacilityID, for reporting back to Peel) goes to reports-internal/ only: an
 *     Actions artifact, never committed and never deployed (the site publishes the app files only).
 *
 *   node scripts/probe-elev-validate.js            build the table and the fixture
 *   node scripts/probe-elev-validate.js --check    re-sample the fixture's manholes live and fail
 *                                                  when a source moved by more than 0.05 m
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../js/profile-core.js');
const PNG = require('./lib-png.js');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'https://jaredacostar-cmd.github.io';
const DTM = 'https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DTM_LidarDerived/ImageServer';
const MAINS = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services/waterwastWater/FeatureServer/10';
const TERRAIN = (z, x, y) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`;
const TERRAIN_Z = 14, PER_AREA = 60, CHECK_TOL = 0.05, BIG_M = 5;
// The four areas tested on main (2026-10-15) and the pilot area (north Brampton).
const AREAS = {
  cooksville: { name: 'Cooksville', municipality: 'Mississauga', bbox: [-79.635, 43.570, -79.600, 43.600] },
  'downtown-brampton': { name: 'downtown Brampton', municipality: 'Brampton', bbox: [-79.775, 43.675, -79.745, 43.695] },
  bolton: { name: 'Bolton', municipality: 'Caledon', bbox: [-79.750, 43.865, -79.715, 43.890] },
  streetsville: { name: 'Streetsville', municipality: 'Mississauga', bbox: [-79.725, 43.570, -79.700, 43.592] },
  'north-brampton': { name: 'north Brampton (pilot)', municipality: 'Brampton', pilot: true, bbox: [-79.830, 43.700, -79.760, 43.740] },
};
const TABLE = path.join(ROOT, 'data', 'elevation-validation.json');
const FIXTURE = path.join(ROOT, 'tests', 'fixtures', 'manhole-sample.json');
const INTERNAL = path.join(ROOT, 'reports-internal');

const q = o => new URLSearchParams(o).toString();
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url, { json = true, tries = 3 } = {}) {
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, { headers: { Origin: ORIGIN } });
      if (r.status === 429 || r.status >= 500) { await sleep(1000 * 2 ** k); continue; }
      return json ? await r.json() : Buffer.from(await r.arrayBuffer());
    } catch (e) { if (k === tries - 1) throw e; await sleep(1000 * 2 ** k); }
  }
  throw new Error(`no answer: ${url.slice(0, 120)}`);
}

// ---- Sources -------------------------------------------------------------------------------------
async function mainsIn(bbox) {
  const out = [];
  for (let offset = 0; offset < 20000; offset += 2000) {
    const j = await get(`${MAINS}/query?${q({ where: '1=1', geometry: bbox.join(','), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects', outFields: 'FacilityID,InvertUp,InvertDown,DepthUp,DepthDown,MainType,Diameter', returnGeometry: true, outSR: 4326, resultOffset: offset, resultRecordCount: 2000, f: 'json' })}`);
    const fs2 = (j && j.features) || [];
    for (const f of fs2) {
      const a = f.attributes || {}, paths = (f.geometry && f.geometry.paths) || [];
      for (const g of paths) out.push({ id: a.FacilityID || '', g, up: +a.InvertUp, dn: +a.InvertDown, dUp: +a.DepthUp, dDn: +a.DepthDown, d: +a.Diameter || 0, fm: /FM/i.test(a.MainType || '') });
    }
    if (!j || !j.exceededTransferLimit) break;
  }
  return out;
}
async function lidarAt(pts) {
  const res = [];
  for (let i = 0; i < pts.length; i += 60) {
    const part = pts.slice(i, i + 60);
    const j = await get(`${DTM}/getSamples?${q({ geometry: JSON.stringify({ points: part.map(p => [+p.lng.toFixed(7), +p.lat.toFixed(7)]), spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: true, interpolation: 'RSP_BilinearInterpolation', outFields: 'Project,Resolution_m', f: 'json' })}`);
    const vals = part.map(() => null);
    for (const s of (j && j.samples) || []) { const z = parseFloat(s.value); if (isFinite(z) && s.locationId >= 0 && s.locationId < part.length) vals[s.locationId] = { z, project: s.attributes && s.attributes.Project || null }; }
    res.push(...vals);
  }
  return res;
}
const tiles = new Map();
async function tile(x, y) { const k = `${x}/${y}`; if (!tiles.has(k)) tiles.set(k, get(TERRAIN(TERRAIN_Z, x, y), { json: false }).then(b => PNG.decode(b).data)); return tiles.get(k); }
async function terrainAt(p) {
  const taps = C.bilinearTaps(p.lat, p.lng, TERRAIN_Z);
  const data = new Map(); for (const t of taps) { const k = `${t.tx}/${t.ty}`; if (!data.has(k)) data.set(k, await tile(t.tx, t.ty)); }
  return C.bilinear(taps, (tx, ty, px, py) => { const d = data.get(`${tx}/${ty}`), i = (py * 256 + px) * 4; return C.terrarium(d[i], d[i + 1], d[i + 2]); });
}
// N28 − N2013 (m) at each point: what to add to a CGVD28 height to get CGVD2013.
function datumShift(pts) {
  const geoid = grid => { const input = pts.map(p => `${p.lng} ${p.lat} 0 0`).join('\n') + '\n'; const out = execFileSync('cct', ['-d', '4', '+proj=vgridshift', `+grids=${grid}`, '+multiplier=1'], { input, env: { ...process.env, PROJ_NETWORK: 'ON' } }).toString(); return out.trim().split('\n').map(l => parseFloat(l.trim().split(/\s+/)[2])); };
  const n28 = geoid('ca_nrc_HT2_2010v70.tif'), n13 = geoid('ca_nrc_CGG2013an83.tif');
  return pts.map((_, i) => isFinite(n28[i]) && isFinite(n13[i]) ? +(n28[i] - n13[i]).toFixed(3) : null);
}
// Peel's vertical datum from the layer's own metadata, when it says.
async function peelDatum() {
  const j = await get(`${MAINS}?f=json`).catch(() => null);
  const text = j ? `${j.description || ''} ${j.copyrightText || ''} ${JSON.stringify(j.extent && j.extent.spatialReference || {})}` : '';
  const sr = (j && j.extent && j.extent.spatialReference) || {};
  const m = text.match(/CGVD\s*-?\s*(28|2013)/i);
  return { stated: m ? `CGVD${m[1]}` : null, vcsWkid: sr.vcsWkid || sr.latestVcsWkid || null, wkid: sr.latestWkid || sr.wkid || null, metadataNote: text.slice(0, 300).trim() };
}

// ---- Build ----------------------------------------------------------------------------------------
function pick(mhs, n) {
  const s = mhs.slice().sort((a, b) => a.lat - b.lat || a.lng - b.lng);
  if (s.length <= n) return s;
  return Array.from({ length: n }, (_, i) => s[Math.floor(i * s.length / n)]);
}
async function build() {
  const sample = [], internal = [];
  for (const [key, a] of Object.entries(AREAS)) {
    const mains = await mainsIn(a.bbox);
    const mhs = C.manholesFromMains(mains).filter(m => m.lng >= a.bbox[0] && m.lng <= a.bbox[2] && m.lat >= a.bbox[1] && m.lat <= a.bbox[3]);
    console.log(`${a.name}: ${mains.length} mains, ${mhs.length} manholes with a usable depth`);
    for (const m of pick(mhs, PER_AREA)) sample.push({ area: key, ...m });
  }
  const shifts = datumShift(sample);
  const lid = await lidarAt(sample);
  for (let i = 0; i < sample.length; i++) {
    const m = sample[i];
    m.shift = shifts[i];
    m.lidar = lid[i] ? +lid[i].z.toFixed(3) : null; m.project = lid[i] ? lid[i].project : null;
    m.terrain = +(await terrainAt(m)).toFixed(3);
  }
  // Peel's datum: stated in the metadata, else inferred. If Peel's grounds are CGVD28, lidar −
  // (ground + shift) centres on 0 while lidar − ground centres on −shift (≈ +0.4 m here).
  const meta = await peelDatum();
  const withL = sample.filter(m => m.lidar != null && m.shift != null);
  const raw = C.validationStats(withL.map(m => m.lidar - m.ground)), conv = C.validationStats(withL.map(m => m.lidar - (m.ground + m.shift)));
  let peel = meta.stated, basis = meta.stated ? 'stated in the layer metadata' : null;
  if (!peel && raw.n >= 20) { peel = Math.abs(conv.median) < Math.abs(raw.median) ? 'CGVD28' : 'CGVD2013'; basis = `inferred: lidar − manhole ground has a median of ${raw.median} m as published and ${conv.median} m after the CGVD28 → CGVD2013 shift; confirm with the Region`; }
  const useShift = peel === 'CGVD28';
  const err = (m, src) => (m[src] == null ? null : m[src] - (m.ground + (useShift ? m.shift || 0 : 0)));
  // The table.
  const areas = {};
  for (const [key, a] of Object.entries(AREAS)) {
    const ms = sample.filter(m => m.area === key);
    const years = [...new Set(ms.map(m => (String(m.project || '').match(/(19|20)\d\d/) || [])[0]).filter(Boolean))].sort();
    const sh = ms.map(m => m.shift).filter(v => v != null).sort((x, y) => x - y);
    areas[key] = { ...a, shift: sh.length ? sh[sh.length >> 1] : null, rows: { lidar: C.validationStats(ms.map(m => err(m, 'lidar'))), terrain: C.validationStats(ms.map(m => err(m, 'terrain'))) }, lidarProjects: [...new Set(ms.map(m => m.project).filter(Boolean))], lidarYear: years.length ? +years[years.length - 1] : null };
    if (areas[key].rows.lidar.n) { const r = areas[key].rows.lidar; r.target = r.medianAbs < 0.3 && r.within05 >= 90 ? 'met' : 'not met'; }
  }
  const allShift = sample.map(m => m.shift).filter(v => v != null).sort((x, y) => x - y);
  const table = {
    version: 1, generatedAt: new Date().toISOString(),
    note: 'Ground elevation against Peel sanitary manholes (ground = invert + published depth, 0.5–15 m). Error = source − manhole ground, on CGVD2013. Raw sources only: never the manhole-corrected line. Rebuilt by scripts/probe-elev-validate.js in Actions; the app\'s accuracy label reads it.',
    datums: { lidar: 'CGVD2013 (Ontario DTM, MNR)', terrain: 'CGVD28 (CDEM) / EGM96 (SRTM)', peelSewers: peel || 'unknown', peelSewersBasis: basis || 'not stated and not enough manholes to infer', shift: 'NRCan HT2_2010v70 (CGVD28) and CGG2013a (CGVD2013) via PROJ cct', shiftMedian: allShift.length ? allShift[allShift.length >> 1] : null, horizontal: 'both queried in WGS84 (wkid 4326) from NAD83 sources; NAD83 realizations differ by about 1–1.5 m here, well inside the 15 m manhole match', peelMetadata: meta },
    lidarTarget: 'median |error| < 0.3 m and 90% within 0.5 m',
    areas,
  };
  fs.writeFileSync(TABLE, JSON.stringify(table, null, 1) + '\n');
  // The fixture: no facility ids (the internal list has them).
  const fixture = { generatedAt: table.generatedAt, peelDatum: peel || 'unknown', applyShift: useShift, manholes: sample.map(m => ({ area: m.area, lat: +m.lat.toFixed(7), lng: +m.lng.toFixed(7), invert: m.invert, depth: m.depth, shift: m.shift, lidar: m.lidar, terrain: m.terrain, project: m.project })) };
  fs.mkdirSync(path.dirname(FIXTURE), { recursive: true }); fs.writeFileSync(FIXTURE, JSON.stringify(fixture, null, 1) + '\n');
  // The internal data check: manholes more than 5 m off the DEM, with FacilityID (artifact only).
  for (const m of sample) { const e = err(m, m.lidar != null ? 'lidar' : 'terrain'); if (e != null && Math.abs(e) > BIG_M) internal.push([m.id, AREAS[m.area].name, m.end, m.lat.toFixed(6), m.lng.toFixed(6), m.invert, m.depth, +(m.ground).toFixed(2), m.lidar != null ? 'lidar' : 'terrain', +(m.lidar != null ? m.lidar : m.terrain).toFixed(2), +e.toFixed(2)]); }
  fs.mkdirSync(INTERNAL, { recursive: true });
  fs.writeFileSync(path.join(INTERNAL, 'manhole-check.csv'), '# Internal data check: Peel sanitary manholes whose ground (invert + published depth) differs from the DEM by more than 5 m. Not for publication.\nFacilityID,area,end,lat,lng,invert,depth,manhole_ground,dem_source,dem,difference\n' + internal.map(r => r.join(',')).join('\n') + '\n');
  console.log(JSON.stringify({ datums: table.datums, areas: Object.fromEntries(Object.entries(areas).map(([k, a]) => [k, a.rows])) }, null, 1));
  console.log(`internal data check: ${internal.length} manholes more than ${BIG_M} m off (reports-internal/manhole-check.csv, artifact only)`);
}

// ---- Check: the sources, re-sampled live, against the fixture ---------------------------------------
async function check() {
  const fx = JSON.parse(fs.readFileSync(FIXTURE, 'utf8'));
  const lid = await lidarAt(fx.manholes);
  let moved = 0;
  for (let i = 0; i < fx.manholes.length; i++) {
    const m = fx.manholes[i], l = lid[i] ? lid[i].z : null, t = await terrainAt(m);
    if (m.lidar != null && l != null && Math.abs(l - m.lidar) > CHECK_TOL) { moved++; console.log(`lidar moved at ${m.lat},${m.lng}: ${m.lidar} → ${l.toFixed(3)}`); }
    if (Math.abs(t - m.terrain) > CHECK_TOL) { moved++; console.log(`terrain moved at ${m.lat},${m.lng}: ${m.terrain} → ${t.toFixed(3)}`); }
  }
  console.log(`${fx.manholes.length} manholes re-sampled; ${moved} values moved by more than ${CHECK_TOL} m`);
  if (moved) process.exit(1);
}

// --check: a source that does not answer is an outage, not a change in the data: a warning, not a
// failure (values that moved still fail). The stored-table test above does not need the network.
const unreachable = e => /no answer|fetch failed|ETIMEDOUT|ECONNRESET|ENOTFOUND|EAI_AGAIN|aborted|timeout|HTTP 5\d\d|HTTP 429/i.test(String(e && (e.message || e)) + String(e && e.cause && e.cause.code));
if (process.argv.includes('--check')) check().catch(e => {
  if (unreachable(e)) { console.log(`::warning::Live re-check skipped: a source did not answer (${String(e.message || e).slice(0, 160)})`); process.exit(0); }
  console.error(e); process.exit(1);
});
else build().catch(e => { console.error(e); process.exit(1); });
module.exports = { AREAS };
