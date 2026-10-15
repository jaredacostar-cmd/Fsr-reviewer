#!/usr/bin/env node
/*
 * Constraint layers for the map, the Site checklist and the area card (Stage 2), built in GitHub
 * Actions (Probe data sources, mode=constraints-build; the sandbox cannot reach these hosts).
 *
 * Each approved dataset (docs/sources-constraints-lidar.md) is queried over Peel's extent,
 * simplified at the service (maxAllowableOffset), cut into the map's 0.02° tiles where Peel has
 * land (the census areas' extent) and written to
 *   data/constraints/<id>/index.json    labels, tiles, counts, as-of date
 *   data/constraints/<id>/<tx>_<ty>.json
 *   data/constraints/<id>/overview.json   area layers: one coarse file (~30 m) for low zooms
 * plus data/constraints/manifest.json (source, owner, licence, as-of, size of every dataset) and
 * data/constraints/grid.json: a 25 m screening grid of Peel (municipality, and cells inside a
 * regulation limit, a floodplain or a provincial plan area) for "Land under constraints".
 * Nothing about people is kept: no item owners, editors or comments; labels are names and types.
 *   node scripts/build-constraints.js [--only id,id]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const G = require('../js/constraint-geo.js');
const { clipRing, clipEdges } = require('./build-regulation.js');

const OUT = path.join(__dirname, '..', 'data', 'constraints');
const PEEL = { xmin: -80.16, ymin: 43.47, xmax: -79.48, ymax: 44.00 };
const LIO = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA';
const AGO = 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services';
const OGL_ON = { licence: 'Open Government Licence – Ontario', licenceUrl: 'https://www.ontario.ca/page/open-government-licence-ontario' };
const CVC_L = { licence: 'CVC Open Data Licence v1.0', licenceUrl: 'https://geohub.cvc.ca/portal/sharing/rest/content/items/93888c79b9d6442fb940dbfd701c4158/data' };
const TRCA_L = { licence: 'TRCA Open Data Licence v1.0', licenceUrl: 'https://trca.ca/about/open-data-licence/' };
const PEEL_L = { licence: 'Open Data Licence for the Regional Municipality of Peel v1.0', licenceUrl: null };
const s = v => (v == null ? '' : String(v).trim());
const title = v => s(v).toLowerCase().replace(/\b([a-z])/g, m => m.toUpperCase());
const SCREEN = 'Screening only: not an official determination.';

// group: reg | flood | plan | natural | water | utility. grid: the area card's layer.
// label(attributes) → [name, type, extra?]; wc-peel's extra is the conservation authority (CVC, TRCA, NVCA, HRCA).
const DATASETS = [
  { id: 'reg-cvc', group: 'reg', grid: 'reg', kind: 'area', title: 'Regulation limit (CVC)', owner: 'Credit Valley Conservation', ...CVC_L,
    url: `${AGO}/Generic_Regulations_Limit_2025/FeatureServer/0`, fields: 'objectid', offset: 0.00004,
    label: () => ['Regulated area', 'Credit Valley Conservation regulation limit (O. Reg. 41/24)'],
    note: `Generic regulation limit, O. Reg. 41/24. ${SCREEN} Credit Valley Conservation confirms what is regulated; a feature need not be mapped to be regulated.` },
  { id: 'reg-trca', group: 'reg', grid: 'reg', kind: 'area', title: 'Regulation limit (TRCA)', owner: 'Toronto and Region Conservation Authority', ...TRCA_L,
    url: `${AGO}/TRCA_Regulation_Limit2/FeatureServer/0`, fields: 'OBJECTID', offset: 0.00004,
    label: () => ['Regulated area', 'TRCA regulation limit (O. Reg. 41/24)'],
    note: `Regulation limit, O. Reg. 41/24. ${SCREEN} TRCA confirms what is regulated; a feature need not be mapped to be regulated.` },
  { id: 'flood-cvc', group: 'flood', grid: 'flood', kind: 'area', title: 'Regulatory floodplain (CVC)', owner: 'Credit Valley Conservation', ...CVC_L,
    url: `${AGO}/Regulatory_Floodplain_areas/FeatureServer/0`, fields: 'Creek,Watershed', offset: 0.00003,
    label: a => [s(a.Creek) || 'Regulatory floodplain', ['Regulatory floodplain (CVC)', s(a.Watershed) && `${s(a.Watershed)} watershed`].filter(Boolean).join(' · ')],
    note: `Engineered regulatory floodlines (CVC). ${SCREEN} Confirm the flood limit with Credit Valley Conservation.` },
  { id: 'flood-trca', group: 'flood', grid: 'flood', kind: 'area', title: 'Floodplain, generalized (TRCA)', owner: 'Toronto and Region Conservation Authority',
    licence: 'No licence stated; published by TRCA with a disclaimer (shown with the layer)', licenceUrl: null,
    url: `${AGO}/FloodPlain_Regulatory/FeatureServer/2`, fields: 'FloodPlainSource,Watershed', offset: 0.00003,
    label: a => ['Floodplain (generalized)', ['TRCA generalized regulatory floodplain', s(a.Watershed) && `${s(a.Watershed)} watershed`].filter(Boolean).join(' · ')],
    disclaimer: 'TRCA: this layer is a generalized representation of the regulatory flood plain, not a regulatory flood plain map approved by a qualified Professional Engineer and TRCA, and should not be relied on for its precise limits. TRCA does not warrant that the data is complete or current; contact TRCA to confirm the flood plain limit.',
    note: `Generalized floodplain (TRCA). ${SCREEN} Contact TRCA for the precise regulatory flood plain.` },
  { id: 'greenbelt', group: 'plan', grid: 'plan', kind: 'area', title: 'Greenbelt Plan', owner: 'Province of Ontario (Municipal Affairs and Housing)', ...OGL_ON,
    url: `${LIO}/LIO_Open06/MapServer/15`, fields: 'DESIGNATION', offset: 0.0001,
    label: a => [`Greenbelt: ${s(a.DESIGNATION) || 'designation'}`, 'Greenbelt Plan designation'],
    note: `Greenbelt Plan area by designation (Protected Countryside, Urban River Valley, and the Oak Ridges Moraine and Niagara Escarpment plan areas within it). ${SCREEN}` },
  { id: 'orm', group: 'plan', grid: 'plan', kind: 'area', title: 'Oak Ridges Moraine Conservation Plan', owner: 'Province of Ontario (Municipal Affairs and Housing)', ...OGL_ON,
    url: `${LIO}/LIO_Open06/MapServer/28`, fields: 'LAND_USE_DESIGNATION', offset: 0.0001,
    label: a => [`Oak Ridges Moraine: ${title(a.LAND_USE_DESIGNATION) || 'designation'}`, 'Oak Ridges Moraine Conservation Plan land use designation'],
    note: `Oak Ridges Moraine Conservation Plan land use designations. ${SCREEN}` },
  { id: 'nep', group: 'plan', grid: 'plan', kind: 'area', title: 'Niagara Escarpment Plan', owner: 'Niagara Escarpment Commission / Province of Ontario', ...OGL_ON,
    url: `${LIO}/LIO_Open06/MapServer/26`, fields: 'DESIGNATION', offset: 0.0001,
    label: a => [`Niagara Escarpment: ${title(a.DESIGNATION) || 'designation'}`, 'Niagara Escarpment Plan land use designation'],
    note: `Niagara Escarpment Plan land use designations. ${SCREEN} Development control applies in parts of the plan area: check with the Niagara Escarpment Commission.` },
  { id: 'psw', group: 'natural', kind: 'area', title: 'Provincially significant wetlands', owner: 'Province of Ontario (Natural Resources)', ...OGL_ON,
    url: `${LIO}/LIO_Open01/MapServer/15`, where: "WETLAND_SIGNIFICANCE = 'Evaluated-Provincial'", fields: 'WETLAND_SIGNIFICANCE,WETLAND_TYPE,EVALUATED_WETLAND_ID', offset: 0.00004,
    label: a => ['Provincially significant wetland', ['Wetland (evaluated, provincially significant)', s(a.WETLAND_TYPE)].filter(Boolean).join(' · ')],
    note: `Evaluated wetlands of provincial significance (PSW). ${SCREEN} Wetland boundaries are confirmed by evaluation; unevaluated wetlands are not shown.` },
  { id: 'ansi', group: 'natural', kind: 'area', title: 'Areas of natural and scientific interest (ANSI)', owner: 'Province of Ontario (Natural Resources)', ...OGL_ON,
    url: `${LIO}/LIO_Open05/MapServer/3`, fields: 'ANSI_NAME,CLASS_SUBTYPE,ANSI_SIGNIFICANCE', offset: 0.00004,
    label: a => [s(a.ANSI_NAME) || 'ANSI', ['ANSI', s(a.CLASS_SUBTYPE), s(a.ANSI_SIGNIFICANCE) && `${s(a.ANSI_SIGNIFICANCE).toLowerCase()} significance`].filter(Boolean).join(' · ')],
    note: `Areas of natural and scientific interest (life or earth science). ${SCREEN}` },
  { id: 'nhs', group: 'natural', kind: 'area', title: 'Natural Heritage System (Growth Plan)', owner: 'Province of Ontario (Municipal Affairs and Housing)', ...OGL_ON,
    url: `${LIO}/LIO_Open06/MapServer/22`, where: "ENABLING_PLAN LIKE '%Growth Plan%'", fields: 'ENABLING_PLAN,AREA_TYPE,AREA_NAME', offset: 0.0001,
    label: a => [s(a.AREA_NAME) || 'Natural Heritage System', ['Natural Heritage System for the Growth Plan', s(a.AREA_TYPE)].filter(Boolean).join(' · ')],
    note: `The provincial Natural Heritage System for the Growth Plan for the Greater Golden Horseshoe (outside settlement areas). ${SCREEN}` },
  { id: 'wc-peel', group: 'water', kind: 'line', title: 'Watercourses (Region of Peel)', owner: 'Region of Peel', ...PEEL_L,
    url: 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services/Watercourses/FeatureServer/0', fields: 'RIVER_NAME,WATERSHED,AUTHORITY,Tunnel', offset: 0.00002,
    label: a => [s(a.RIVER_NAME) || 'Watercourse', [/^y|tunnel|pipe/i.test(s(a.Tunnel)) && 'piped', s(a.WATERSHED) && `${s(a.WATERSHED)} watershed`, s(a.AUTHORITY)].filter(Boolean).join(' · '), s(a.AUTHORITY)],
    note: 'Region of Peel watercourses, with watershed and conservation authority. Small and piped watercourses may be missing.' },
  { id: 'wc-ohn', group: 'water', kind: 'line', title: 'Watercourses (Ontario Hydro Network)', owner: 'Province of Ontario (Natural Resources)', ...OGL_ON,
    url: `${LIO}/LIO_Open01/MapServer/26`, where: "WATERCOURSE_TYPE NOT LIKE 'Virtual%'", fields: 'WATERCOURSE_TYPE,OFFICIAL_NAME_LABEL,PERMANENCY', offset: 0.00002,
    label: a => [s(a.OFFICIAL_NAME_LABEL) || 'Watercourse', [s(a.WATERCOURSE_TYPE), /intermittent/i.test(s(a.PERMANENCY)) && 'intermittent'].filter(Boolean).join(' · ')],
    note: 'Ontario Hydro Network watercourses (1:10,000). Small and piped watercourses may be missing.' },
  { id: 'utility', group: 'utility', kind: 'line', title: 'Gas pipelines and hydro lines (approximate)', owner: 'Province of Ontario (Land Information Ontario, Utility Line)', ...OGL_ON,
    url: `${LIO}/LIO_Open05/MapServer/11`, fields: 'CLASS_SUBTYPE,LOCATION_ACCURACY', offset: 0.00002,
    keep: a => !/water|sewer/i.test(s(a.CLASS_SUBTYPE)),
    label: a => [/pipeline/i.test(s(a.CLASS_SUBTYPE)) ? 'Pipeline (gas or oil; product not recorded)' : /transmission/i.test(s(a.CLASS_SUBTYPE)) ? 'Transmission line' : s(a.CLASS_SUBTYPE) || 'Utility line', [/pipeline/i.test(s(a.CLASS_SUBTYPE)) ? 'gas' : 'hydro', s(a.LOCATION_ACCURACY) && `located ${s(a.LOCATION_ACCURACY).toLowerCase()}`].filter(Boolean).join(' · ')],
    note: 'Approximate location (Land Information Ontario); call Ontario One Call before any work. Local gas mains and distribution lines are not published.' },
];

// ---- Fetching ---------------------------------------------------------------------------------
async function getJSON(url, params, tries = 4) {
  const u = `${url}?${new URLSearchParams(params)}`;
  for (let k = 1; ; k++) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 120000);
      const r = await fetch(u.length > 1800 ? url : u, u.length > 1800 ? { method: 'POST', body: new URLSearchParams(params), signal: ctl.signal } : { signal: ctl.signal });
      clearTimeout(t);
      const j = await r.json();
      if (j.error) throw new Error(`${j.error.code} ${j.error.message}`);
      return j;
    } catch (e) { if (k >= tries) throw e; await new Promise(ok => setTimeout(ok, 2000 * k)); }
  }
}
// Every feature of a layer over Peel's extent: object ids first, then 200 at a time.
async function fetchAll(d, info) {
  const df = dateFieldOf(info), outFields = df && !d.fields.split(',').includes(df) ? `${d.fields},${df}` : d.fields;
  const env = { geometry: JSON.stringify({ xmin: PEEL.xmin, ymin: PEEL.ymin, xmax: PEEL.xmax, ymax: PEEL.ymax, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects' };
  const ids = (await getJSON(`${d.url}/query`, { where: d.where || '1=1', ...env, returnIdsOnly: true, f: 'json' })).objectIds || [];
  const feats = [];
  for (let i = 0; i < ids.length; i += 200) {
    const j = await getJSON(`${d.url}/query`, { objectIds: ids.slice(i, i + 200).join(','), outFields, returnGeometry: true, outSR: 4326, maxAllowableOffset: d.offset, geometryPrecision: 6, f: 'json' });
    feats.push(...(j.features || []));
  }
  return feats;
}
// The as-of date: the layer's last edit, else the latest date field on its features.
// (LIO's map services have no edit date: their features' own update dates, fetched with them.)
const dateFieldOf = info => ['GEOMETRY_UPDATE_DATETIME', 'SYSTEM_DATETIME', 'EFFECTIVE_DATETIME'].find(n => (info.fields || []).some(f => f.name === n)) || null;
function asOfDate(info, feats) {
  const ms = info.editingInfo && (info.editingInfo.dataLastEditDate || info.editingInfo.lastEditDate);
  if (ms) return new Date(ms).toISOString().slice(0, 10);
  const df = dateFieldOf(info); if (!df) return null;
  let mx = 0; for (const f of feats) { const v = +((f.attributes || {})[df]); if (v > mx) mx = v; }
  return mx ? new Date(mx).toISOString().slice(0, 10) : null;
}
// The item's own licence text (feature services), to confirm the licence at build time.
async function itemLicence(d) {
  if (!/FeatureServer/.test(d.url)) return null;
  try { const j = await getJSON(`${d.url.replace(/\/\d+$/, '')}/info/itemInfo`, { f: 'json' }, 2); return s(j.licenseInfo).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 300) || null; } catch (e) { return null; }
}

// ---- Tiles ------------------------------------------------------------------------------------
const R = v => Math.round(v * 1e5) / 1e5;
const dedupe = pts => pts.map(([x, y]) => [R(x), R(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
const bboxOf = parts => { const b = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity }; for (const r of parts) for (const [x, y] of r) { if (x < b.xmin) b.xmin = x; if (x > b.xmax) b.xmax = x; if (y < b.ymin) b.ymin = y; if (y > b.ymax) b.ymax = y; } return b; };
// The tiles where Peel has land: those the census areas touch.
function peelTiles(das) {
  const keep = new Set();
  for (const da of das) {
    const b = bboxOf(da[4]);
    for (let tx = Math.floor(b.xmin / G.TILE); tx <= Math.floor(b.xmax / G.TILE); tx++)
      for (let ty = Math.floor(b.ymin / G.TILE); ty <= Math.floor(b.ymax / G.TILE); ty++) keep.add(G.tileKey(tx, ty));
  }
  return keep;
}
function cutTiles(d, feats, mask) {
  const tiles = new Map(), labels = [], labelIx = new Map();
  const lab = a => { const [n, t, x] = d.label(a); const k = `${n}\u0001${t}\u0001${x || ''}`; if (!labelIx.has(k)) { labelIx.set(k, labels.length); labels.push(x ? [n, t, x] : [n, t]); } return labelIx.get(k); };
  const tile = k => { if (!tiles.has(k)) tiles.set(k, { p: [], e: [], l: [] }); return tiles.get(k); };
  let kept = 0;
  for (const f of feats) {
    const a = f.attributes || {}, g = f.geometry; if (!g) continue;
    if (d.keep && !d.keep(a)) continue;
    const parts = d.kind === 'area' ? g.rings : g.paths; if (!parts || !parts.length) continue;
    kept++;
    const li = lab(a), b = bboxOf(parts);
    for (let tx = Math.floor(b.xmin / G.TILE); tx <= Math.floor(b.xmax / G.TILE); tx++)
      for (let ty = Math.floor(b.ymin / G.TILE); ty <= Math.floor(b.ymax / G.TILE); ty++) {
        const k = G.tileKey(tx, ty); if (!mask.has(k)) continue;
        const tb = { xmin: tx * G.TILE, ymin: ty * G.TILE, xmax: (tx + 1) * G.TILE, ymax: (ty + 1) * G.TILE };
        if (d.kind === 'area') {
          const rings = parts.map(r => dedupe(clipRing(r, tb))).filter(r => r.length >= 3);
          const edges = parts.flatMap(r => clipEdges(r, tb)).map(dedupe).filter(l => l.length > 1);
          if (rings.length) tile(k).p.push([li, rings]);
          if (edges.length) tile(k).e.push([li, edges]);
        } else {
          const lines = parts.flatMap(p => clipEdges(p, tb)).map(dedupe).filter(l => l.length > 1);
          if (lines.length) tile(k).l.push([li, lines]);
        }
      }
  }
  return { tiles, labels, kept, lab };
}
function writeDataset(d, cut) {
  const dir = path.join(OUT, d.id);
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  let bytes = 0, maxTile = 0;
  for (const [k, t] of cut.tiles) {
    const [tx, ty] = k.split('_').map(Number), enc = l => l.map(([x, y]) => [Math.round((x - tx * G.TILE) * G.UNITS), Math.round((y - ty * G.TILE) * G.UNITS)]);
    const o = {}; for (const key of ['p', 'e', 'l']) if (t[key].length) o[key] = t[key].map(([li, parts]) => [li, parts.map(enc)]);
    const str = JSON.stringify(o); bytes += str.length; maxTile = Math.max(maxTile, str.length);
    fs.writeFileSync(path.join(dir, `${k}.json`), str);
  }
  const index = { id: d.id, tile: G.TILE, units: G.UNITS, labels: cut.labels, tiles: [...cut.tiles.keys()].sort() };
  const istr = JSON.stringify(index); fs.writeFileSync(path.join(dir, 'index.json'), istr);
  return { bytes: bytes + istr.length, maxTile, tiles: cut.tiles.size };
}

// ---- Overview (low zoom) ------------------------------------------------------------------------
// Area layers also get one coarse file for the zooms where tiles would be too many: rings
// simplified to ~30 m (Douglas–Peucker), tiny ones dropped, points as whole 0.0001° (~10 m).
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let best = -1, bi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    // (A closed ring starts and ends on one point: distance to that point.)
    for (let i = a + 1; i < b; i++) { const d = L < 1e-12 ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / L; if (d > best) { best = d; bi = i; } }
    if (best > tol) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const ringArea = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);
function writeOverview(d, feats, labelOf, mask) {
  const TOL = 0.0003, MIN = 0.0003 * 0.0003 * 4, out = [];
  for (const f of feats) {
    const g = f.geometry; if (!g || !g.rings || (d.keep && !d.keep(f.attributes || {}))) continue;
    const b = bboxOf(g.rings); let any = false;
    for (let tx = Math.floor(b.xmin / G.TILE); tx <= Math.floor(b.xmax / G.TILE) && !any; tx++) for (let ty = Math.floor(b.ymin / G.TILE); ty <= Math.floor(b.ymax / G.TILE) && !any; ty++) any = mask.has(G.tileKey(tx, ty));
    if (!any) continue;
    const rings = g.rings.map(r => clipRing(r, PEEL)).filter(r => r.length >= 3).map(r => simplify([...r, r[0]], TOL)).filter(r => r.length >= 4 && ringArea(r) >= MIN).map(r => r.map(([x, y]) => [Math.round(x * 1e4), Math.round(y * 1e4)]));
    if (rings.length) out.push([labelOf(f.attributes || {}), rings]);
  }
  const str = JSON.stringify({ units: 1e4, p: out });
  if (str.length > 1.5e6) { console.warn(`${d.id}: overview ${(str.length / 1e6).toFixed(2)} MB, over the 1.5 MB cap: not written (zoom in for this layer)`); return 0; }
  fs.writeFileSync(path.join(OUT, d.id, 'overview.json'), str);
  return str.length;
}

// ---- Screening grid ---------------------------------------------------------------------------
const CELL_M = 25;
function buildGrid(das, polysByLayer) {
  const lat0 = (PEEL.ymin + PEEL.ymax) / 2, dy = CELL_M / 111320, dx = CELL_M / (111320 * Math.cos(lat0 * Math.PI / 180));
  const g = { x0: PEEL.xmin, y0: PEEL.ymin, dx: +dx.toFixed(8), dy: +dy.toFixed(8) };
  g.cols = Math.ceil((PEEL.xmax - PEEL.xmin) / g.dx); g.rows = Math.ceil((PEEL.ymax - PEEL.ymin) / g.dy);
  const munis = [...new Set(das.map(d => d[3]))].sort();
  const mu = new Uint8Array(g.cols * g.rows);
  for (const da of das) { const v = munis.indexOf(da[3]) + 1; G.scanRings(da[4], g, (row, c0, c1) => mu.fill(v, row * g.cols + c0, row * g.cols + c1)); }
  const out = { ...g, cellM: CELL_M, cellM2: Math.round(g.dx * 111320 * Math.cos(lat0 * Math.PI / 180) * g.dy * 111320), munis, layers: Object.keys(polysByLayer), muni: [] };
  for (let row = 0; row < g.rows; row++) out.muni.push(G.encodeValues(mu.subarray(row * g.cols, (row + 1) * g.cols)));
  for (const [k, polys] of Object.entries(polysByLayer)) {
    const fl = new Uint8Array(g.cols * g.rows);
    for (const rings of polys) G.scanRings(rings, g, (row, c0, c1) => fl.fill(1, row * g.cols + c0, row * g.cols + c1));
    // Only cells in Peel count.
    for (let i = 0; i < fl.length; i++) if (!mu[i]) fl[i] = 0;
    out[k] = []; for (let row = 0; row < g.rows; row++) out[k].push(G.encodeFlags(fl.subarray(row * g.cols, (row + 1) * g.cols)));
  }
  return out;
}

async function main() {
  const only = process.argv.includes('--only') ? new Set(process.argv[process.argv.indexOf('--only') + 1].split(',')) : null;
  const das = require('../data/das.json').das;
  const mask = peelTiles(das);
  fs.mkdirSync(OUT, { recursive: true });
  const manPath = path.join(OUT, 'manifest.json');
  const prev = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { datasets: [] };
  const manifest = { built: new Date().toISOString().slice(0, 10), tile: G.TILE, note: 'Screening context only. Labels describe mapped layers, not an official determination; the owner confirms.', datasets: [], skipped: [
    { id: 'source-protection', title: 'Source protection areas (wellhead protection areas, intake protection zones, highly vulnerable aquifers, significant groundwater recharge areas)', reason: 'Not included (decision 2, 2026-10-15). See the CTC Source Protection Region maps.' },
    { id: 'nvca', title: 'Nottawasaga Valley Conservation Authority regulation limit and floodplain (north Caledon)', reason: 'Not published by NVCA for Caledon (decision 3, 2026-10-15).' },
  ] };
  const polysByLayer = { reg: [], flood: [], plan: [] };
  for (const d of DATASETS) {
    if (only && !only.has(d.id)) { const old = prev.datasets.find(x => x.id === d.id); if (old) manifest.datasets.push(old); continue; }
    const info = await getJSON(d.url, { f: 'json' });
    const fieldNames = new Set((info.fields || []).map(f => f.name));
    const missing = d.fields.split(',').filter(f => !fieldNames.has(f));
    if (missing.length) console.warn(`${d.id}: fields not in the layer: ${missing.join(', ')} (have ${[...fieldNames].join(', ')})`);
    const feats = await fetchAll(d, info);
    const cut = cutTiles(d, feats, mask);
    const w = writeDataset(d, cut);
    const ovBytes = d.kind === 'area' ? writeOverview(d, feats, cut.lab, mask) : 0;
    if (d.grid) for (const f of feats) if (f.geometry && f.geometry.rings && (!d.keep || d.keep(f.attributes || {}))) polysByLayer[d.grid].push(f.geometry.rings);
    const asOf = asOfDate(info, feats), licText = await itemLicence(d);
    const { label, keep, fields, offset, where, ...meta } = d;
    manifest.datasets.push({ ...meta, filter: where || null, simplifiedM: Math.round(offset * 111320), asOf, licenceText: licText, features: cut.kept, tiles: w.tiles, bytes: w.bytes, maxTileBytes: w.maxTile, overviewBytes: ovBytes || null, path: `data/constraints/${d.id}/` });
    console.log(`${d.id}: ${feats.length} fetched, ${cut.kept} kept, ${w.tiles} tiles, ${(w.bytes / 1e6).toFixed(2)} MB (largest tile ${(w.maxTile / 1e3).toFixed(0)} kB; overview ${(ovBytes / 1e3).toFixed(0)} kB), as of ${asOf || '–'}`);
  }
  if (!only || ['reg', 'flood', 'plan'].some(k => [...only].some(id => (DATASETS.find(d => d.id === id) || {}).grid === k))) {
    if (only) for (const d of DATASETS) if (d.grid && !only.has(d.id)) console.warn(`grid: ${d.id} not rebuilt in this run; build the grid with all layers`);
    const grid = buildGrid(das, polysByLayer);
    const str = JSON.stringify(grid); fs.writeFileSync(path.join(OUT, 'grid.json'), str);
    manifest.grid = { path: 'data/constraints/grid.json', cellM: CELL_M, cols: grid.cols, rows: grid.rows, layers: grid.layers, bytes: str.length, from: { reg: ['reg-cvc', 'reg-trca'], flood: ['flood-cvc', 'flood-trca'], plan: ['greenbelt', 'orm', 'nep'] }, munis: 'Statistics Canada 2021 dissemination areas (data/das.json)' };
    console.log(`grid: ${grid.cols} × ${grid.rows} cells of ${CELL_M} m, ${(str.length / 1e6).toFixed(2)} MB`);
  } else if (prev.grid) manifest.grid = prev.grid;
  fs.writeFileSync(manPath, JSON.stringify(manifest, null, 1));
  console.log(`Wrote ${manPath}`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { DATASETS, cutTiles, buildGrid, peelTiles, simplify };
