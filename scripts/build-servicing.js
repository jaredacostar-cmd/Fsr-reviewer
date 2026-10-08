#!/usr/bin/env node
/*
 * Builds data/servicing.json: Region of Peel water pressure zones (published polygons) and
 * wastewater drainage areas TRACED from Peel's sanitary sewer network (no published polygons):
 *
 *  1. Each wastewater main is an edge between its two manholes (FacilityID "SMH…-SMH…",
 *     upstream first; pumping stations appear as FACSCADA-### nodes with pipes in and out).
 *  2. Gaps in the network (renamed manholes, missing segments, force mains) are bridged by
 *     joining a dead end to the nearest pipe of another piece: within 25 m, then up to 500 m
 *     for pieces of 50+ manholes. Dead ends near a treatment plant are the plant outlets.
 *  3. Every manhole is followed downstream to its plant: Lakeview, Clarkson or Inglewood
 *     (or "not traced" when it reaches none, e.g. areas draining to Toronto).
 *  4. Sub-areas: each pumping station's catchment, and each tributary of 2,500+ manholes where
 *     it joins a larger trunk. A manhole belongs to the first sub-area outlet downstream of it.
 *  5. Outlines: a 100 m grid; each cell within 250 m of a pipe takes the area of the nearest
 *     manhole; cells are merged into polygons and simplified.
 *
 *   node scripts/build-servicing.js --raw <dir with *.json.gz from fetch-servicing-raw.js> --out data
 *   node scripts/build-servicing.js --out data          (downloads the layers first)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const KX = 80500, KY = 111000;               // metres per degree at ~43.7° N
const toM = ([x, y]) => [x * KX, y * KY];
const toLL = ([x, y]) => [Math.round(x / KX * 1e5) / 1e5, Math.round(y / KY * 1e5) / 1e5];
const SUB_MIN = 2500, CELL = 100, REACH = 250;

function splitId(id) {
  if (id.startsWith('FACSCADA-')) { const p = id.split('-'); return ['FACSCADA-' + p[1], p.slice(2).join('-')]; }
  const i = id.indexOf('-FACSCADA-');
  if (i > 0) return [id.slice(0, i), id.slice(i + 1)];
  const p = id.split('-');
  return p.length === 2 ? p : null;
}

// Douglas–Peucker on a closed ring (metres).
function simplifyRing(ring, tol) {
  const line = (pts) => {
    if (pts.length <= 2) return pts;
    const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
    const st = [[0, pts.length - 1]];
    while (st.length) {
      const [a, b] = st.pop(); const [x1, y1] = pts[a], [x2, y2] = pts[b];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
      let best = -1, far = 0;
      for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > far) { far = d; best = i; } }
      if (far > tol) { keep[best] = 1; st.push([a, best], [best, b]); }
    }
    return pts.filter((_, i) => keep[i]);
  };
  const mid = Math.floor(ring.length / 2);
  const out = [...line(ring.slice(0, mid + 1)).slice(0, -1), ...line(ring.slice(mid))];
  return out.length >= 4 ? out : ring;
}

// Cells (Map "i,j" -> label) to rings per label: boundary edges chained into closed loops.
function polygonize(cells) {
  const byLabel = new Map();
  for (const [k, lab] of cells) {
    const [i, j] = k.split(',').map(Number);
    const same = (a, b) => cells.get(`${a},${b}`) === lab;
    const edges = byLabel.get(lab) || byLabel.set(lab, []).get(lab);
    // Counter-clockwise edges around the cell, kept where the neighbour differs.
    if (!same(i, j - 1)) edges.push([[i, j], [i + 1, j]]);
    if (!same(i + 1, j)) edges.push([[i + 1, j], [i + 1, j + 1]]);
    if (!same(i, j + 1)) edges.push([[i + 1, j + 1], [i, j + 1]]);
    if (!same(i - 1, j)) edges.push([[i, j + 1], [i, j]]);
  }
  const out = new Map();
  for (const [lab, edges] of byLabel) {
    const from = new Map();
    for (const e of edges) { const k = e[0].join(','); (from.get(k) || from.set(k, []).get(k)).push(e); }
    const used = new Set(), rings = [];
    for (const e0 of edges) {
      if (used.has(e0)) continue;
      const ring = [e0[0]]; let e = e0;
      while (e && !used.has(e)) {
        used.add(e); ring.push(e[1]);
        const nx = (from.get(e[1].join(',')) || []).filter(x => !used.has(x));
        e = nx[0];
      }
      if (ring.length >= 4) rings.push(ring);
    }
    out.set(lab, rings);
  }
  return out;
}

function pointInRing(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function loadRaw(dir) {
  if (dir) {
    const L = n => JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, `${n}.json.gz`))));
    return { mains: L('wwMains'), ps: L('wwPumpingStations'), plants: L('wwPlants'), zones: L('pressureZones') };
  }
  const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'servicing-'));
  require('child_process').execFileSync('node', [path.join(__dirname, 'fetch-servicing-raw.js'), '--out', tmp], { stdio: 'inherit' });
  return loadRaw(tmp);
}

async function main() {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const outDir = path.resolve(arg('--out') || path.join(__dirname, '..', 'data'));
  const raw = await loadRaw(arg('--raw'));

  // ---- 1. Graph ------------------------------------------------------------------------
  // Where a manhole has two outflows (a split or an overflow / relief pipe), follow the larger pipe.
  const xy = new Map(), down = new Map(), diam = new Map(), outD = new Map();
  for (const f of raw.mains) {
    const s = splitId(String(f.p.FacilityID || '')); const c = f.g && f.g.coordinates;
    if (!s || !c || c.length < 2) continue;
    const [a, b] = s, dmm = f.p.Diameter || 0;
    if (!xy.has(a)) xy.set(a, toM(c[0]));
    if (!xy.has(b)) xy.set(b, toM(c[c.length - 1]));
    if (!down.has(a) || dmm > outD.get(a)) { down.set(a, b); outD.set(a, dmm); }
    diam.set(a, Math.max(diam.get(a) || 0, dmm));
  }
  const plants = raw.plants.map(f => ({ name: String(f.p.WWTreatmentPlantDesc || '').replace(/^STP\s*-\s*/i, '').replace(/\b\w/g, c => c.toUpperCase()).replace(/\B\w+/g, w => w.toLowerCase()), p: toM(f.g.coordinates) }));
  const stations = raw.ps.map(f => ({ name: String(f.p.WWPumpingStationDescription || '').replace(/\s+/g, ' ').trim(), p: toM(f.g.coordinates) }));

  // Spatial index of pipe starts, for bridging gaps.
  const G = new Map(), gk = (x, y) => `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
  for (const n of down.keys()) { const p = xy.get(n); const k = gk(...p); (G.get(k) || G.set(k, []).get(k)).push(n); }
  const near = (p, r) => {
    const res = [], cx = Math.floor(p[0] / 50), cy = Math.floor(p[1] / 50), R = Math.ceil(r / 50);
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const n of G.get(`${cx + i},${cy + j}`) || []) {
      const q = xy.get(n), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d <= r) res.push([n, d]);
    }
    return res.sort((a, b) => a[1] - b[1]);
  };
  const terminals = () => {
    const term = new Map();
    for (const n of xy.keys()) {
      if (term.has(n)) continue;
      const pathN = []; let cur = n; const seen = new Set();
      while (down.has(cur) && !seen.has(cur) && !term.has(cur)) { seen.add(cur); pathN.push(cur); cur = down.get(cur); }
      const t = term.has(cur) ? term.get(cur) : cur;
      for (const q of pathN) term.set(q, t); term.set(cur, t);
    }
    return term;
  };
  const plantAt = t => plants.find(pl => { const p = xy.get(t); return Math.hypot(pl.p[0] - p[0], pl.p[1] - p[1]) < 1500; });

  // ---- 2. Bridge gaps -------------------------------------------------------------------
  let bridged = 0; const bridges = [];
  for (const [R, minSize] of [[25, 0], [60, 0], [150, 0], [500, 50]]) {
    const term = terminals(), size = new Map();
    for (const t of term.values()) size.set(t, (size.get(t) || 0) + 1);
    for (const [t, n] of size) {
      if (n < minSize || plantAt(t) || down.has(t)) continue;
      const c = near(xy.get(t), R).find(([q]) => term.get(q) !== t);
      if (c) { down.set(t, c[0]); bridged++; if (R >= 150) bridges.push({ from: t, to: c[0], m: Math.round(c[1]), manholes: n }); }
    }
  }
  const term = terminals();
  const plantOf = new Map();
  for (const [n, t] of term) { const P = plantAt(t); plantOf.set(n, P ? P.name : null); }

  // ---- 3. Upstream counts (topological) -------------------------------------------------
  const indeg = new Map(); for (const n of xy.keys()) indeg.set(n, 0);
  for (const [a, b] of down) indeg.set(b, (indeg.get(b) || 0) + 1);
  const acc = new Map(); for (const n of xy.keys()) acc.set(n, 1);
  const queue = [...xy.keys()].filter(n => indeg.get(n) === 0);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i], b = down.get(n); if (!b) continue;
    acc.set(b, acc.get(b) + acc.get(n));
    indeg.set(b, indeg.get(b) - 1); if (indeg.get(b) === 0) queue.push(b);
  }

  // ---- 4. Sub-area outlets ----------------------------------------------------------------
  const facilityName = new Map();
  for (const n of xy.keys()) if (n.startsWith('FACSCADA')) {
    const p = xy.get(n); const s = stations.map(st => [st, Math.hypot(st.p[0] - p[0], st.p[1] - p[1])]).sort((a, b) => a[1] - b[1])[0];
    facilityName.set(n, s && s[1] < 600 ? s[0].name : `Pumping station ${n.replace('FACSCADA-', '')}`);
  }
  const outlet = new Map();   // node -> sub-area id
  const areas = new Map();    // id -> { id, name, plant, kind, outlet, diameter }
  const nameOf = n => facilityName.get(n);
  for (const [n, b] of down) {
    if (n.startsWith('FACSCADA') && acc.get(n) >= 30) { areas.set(n, { kind: 'ps', outlet: n }); continue; }
    if (!b) continue;
    const up = acc.get(n), other = acc.get(b) - up;
    if (up >= SUB_MIN && other >= SUB_MIN) areas.set(n, { kind: 'trunk', outlet: n });
  }
  for (const [t] of new Map([...term.values()].map(t => [t, 1]))) if (!areas.has(t)) areas.set(t, { kind: 'plant', outlet: t });
  const areaOf = n => {
    let cur = n; const seen = new Set();
    while (!areas.has(cur) && down.has(cur) && !seen.has(cur)) { seen.add(cur); cur = down.get(cur); }
    return areas.has(cur) ? cur : term.get(n);
  };
  for (const n of xy.keys()) outlet.set(n, areaOf(n));
  // Merge tiny areas into the area downstream of their outlet.
  const count = new Map(); for (const a of outlet.values()) count.set(a, (count.get(a) || 0) + 1);
  for (const [a, k] of count) if (k < 40) {
    const b = down.get(a); const into = b ? outlet.get(b) : null;
    if (into && into !== a) for (const [n, o] of outlet) if (o === a) outlet.set(n, into);
  }

  // One area per plant for everything that reaches it with no sub-area outlet on the way,
  // and one for everything not traced to a plant.
  for (const [n, o] of outlet) {
    const a = areas.get(o);
    if (a && a.kind !== 'plant') continue;
    const P = plantOf.get(n);
    const key = P ? `plant:${P}` : 'untraced';
    outlet.set(n, key);
    if (!areas.has(key)) areas.set(key, { kind: P ? 'plant' : 'untraced', outlet: null, plant: P });
  }

  // ---- 5. Grid outlines ----------------------------------------------------------------
  const cells = new Map();
  const nodes = [...xy.keys()].filter(n => outlet.get(n));
  const NG = new Map(); for (const n of nodes) { const p = xy.get(n); const k = `${Math.floor(p[0] / CELL)},${Math.floor(p[1] / CELL)}`; (NG.get(k) || NG.set(k, []).get(k)).push(n); }
  const R = Math.ceil(REACH / CELL);
  const cand = new Set();
  for (const k of NG.keys()) { const [i, j] = k.split(',').map(Number); for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) cand.add(`${i + a},${j + b}`); }
  for (const k of cand) {
    const [i, j] = k.split(',').map(Number); const cx = (i + 0.5) * CELL, cy = (j + 0.5) * CELL;
    let best = null, bd = Infinity;
    for (let a = -R; a <= R; a++) for (let b = -R; b <= R; b++) for (const n of NG.get(`${i + a},${j + b}`) || []) {
      const p = xy.get(n), d = Math.hypot(p[0] - cx, p[1] - cy); if (d < bd) { bd = d; best = n; }
    }
    if (best && bd <= REACH) cells.set(k, outlet.get(best));
  }
  const rings = polygonize(cells);

  // ---- Names --------------------------------------------------------------------------
  // Municipality of an area from the 2021 census DAs it covers (data/das.json, if present).
  let das = null;
  const dasFile = [path.join(outDir, 'das.json'), path.join(__dirname, '..', 'data', 'das.json')].find(f => fs.existsSync(f));
  try { das = JSON.parse(fs.readFileSync(dasFile, 'utf8')).das.map(d => ({ muni: d[3], rings: d[4].map(r => r.map(toM)) })); } catch (e) { /* optional */ }
  const muniAt = (x, y) => { if (!das) return ''; const d = das.find(d => d.rings.some(r => pointInRing(x, y, r))); return d ? d.muni : ''; };
  const drainage = [];
  const byPlant = {};
  for (const [id, rs] of rings) {
    const a = areas.get(id) || { kind: 'plant', outlet: id };
    const plant = a.kind === 'plant' ? a.plant : a.kind === 'untraced' ? null : plantOf.get(id) || null;
    const members = nodes.filter(n => outlet.get(n) === id);
    const cx = members.reduce((t, n) => t + xy.get(n)[0], 0) / members.length, cy = members.reduce((t, n) => t + xy.get(n)[1], 0) / members.length;
    const muni = muniAt(cx, cy);
    const ringsM = rs.map(r => simplifyRing(r.map(([i, j]) => [i * CELL, j * CELL]), 35)).filter(r => r.length >= 4);
    const areaHa = ringsM.reduce((t, r) => { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return t + Math.abs(s) / 2; }, 0) / 1e4;
    byPlant[plant || 'Not traced'] = (byPlant[plant || 'Not traced'] || 0) + 1;
    drainage.push({
      id: `dr:${id}`, plant: plant || 'Not traced to a Peel plant', kind: a.kind,
      outlet: a.kind === 'ps' ? nameOf(id) : null, municipality: muni, manholes: members.length,
      trunkMm: diam.get(id) || null, areaHa: Math.round(areaHa),
      rings: ringsM.map(r => r.map(([x, y]) => toLL([x, y]))),
    });
  }
  // Readable names: "Lakeview · Bolton PS" / "Lakeview · Brampton trunk 3" / "Lakeview · direct".
  drainage.sort((a, b) => a.plant.localeCompare(b.plant) || b.manholes - a.manholes);
  const seq = {};
  for (const d of drainage) {
    if (d.kind === 'ps') d.name = `${d.plant.replace(' to a Peel plant', '')} · ${d.outlet.replace(/ SEWAGE PUMPING (STN|STATION|ST)| SEW\. PUMP(ING)? STN| PUMPING STATION| SPS| PUMPING STN| PUMPING$/i, '').replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase())} PS`;
    else if (d.kind === 'untraced') d.name = 'Not traced to a Peel plant';
    else if (d.kind === 'plant') d.name = `${d.plant} · direct to plant`;
    else { const k = `${d.plant}|${d.municipality}`; seq[k] = (seq[k] || 0) + 1; d.name = `${d.plant} · ${d.municipality || 'Peel'} trunk ${seq[k]}`; }
  }

  // ---- Pressure zones --------------------------------------------------------------------
  const ringsOfGeom = g => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];
  const zones = raw.zones.map(f => ({
    id: `pz:${f.p.ZoneID}`, name: `Pressure zone ${f.p.ZoneID}`, zone: String(f.p.ZoneID),
    rings: ringsOfGeom(f.g).map(r => simplifyRing(r.map(toM), 15).map(toLL)),
  })).sort((a, b) => a.zone.localeCompare(b.zone, 'en', { numeric: true }));

  const traced = [...plantOf.values()].filter(Boolean).length;
  const data = {
    version: 1, generatedAt: new Date().toISOString(),
    sources: {
      pressureZones: 'Region of Peel – Water Pressure Zone (wastewater_infrastructure/FeatureServer/6)',
      drainage: 'Traced from Region of Peel – Wastewater Main, Wastewater Pumping Station and Wastewater Resource Recovery Plant layers (wastewater_infrastructure/FeatureServer/2–4); not the Master Plan polygons, which are not published.',
    },
    method: { bridgedGaps: bridged, manholes: xy.size, tracedToPlant: traced, subAreaMinManholes: SUB_MIN, cellM: CELL, reachM: REACH },
    pressureZones: zones,
    drainageAreas: drainage,
    plants: plants.map(p => ({ name: p.name, lnglat: toLL(p.p) })),
    pumpingStations: stations.map(s => ({ name: s.name, lnglat: toLL(s.p) })),
  };
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, 'servicing.json');
  fs.writeFileSync(file, JSON.stringify(data));
  if (process.env.TRACE) for (const start of process.env.TRACE.split(',')) {
    // Debug: the downstream path from the manhole nearest a lng,lat.
    const [lng, lat] = start.split(' ').map(Number); const p = toM([lng, lat]);
    let best = null, bd = Infinity; for (const [n, q] of xy) { const d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = n; } }
    const steps = []; let cur = best; const seen = new Set();
    while (cur && !seen.has(cur)) { seen.add(cur); steps.push(`${cur}${diam.get(cur) ? '(' + diam.get(cur) + ')' : ''}`); cur = down.get(cur); }
    console.log(`TRACE ${start}: ${steps.length} steps → ${steps.slice(-1)}; facilities: ${steps.filter(x => x.startsWith('FACSCADA')).join(' ')}`);
    console.log('   ', steps.filter((x, i) => i % Math.ceil(steps.length / 25) === 0).map(x => `${x}@${toLL(xy.get(x.replace(/\(.*/, '')))}`).join(' > '));
  }
  console.log(`servicing.json: ${zones.length} pressure zones, ${drainage.length} drainage areas (${JSON.stringify(byPlant)}); ${xy.size} manholes, ${traced} (${(traced / xy.size * 100).toFixed(1)}%) traced to a plant, ${bridged} gaps bridged; ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
  for (const b of bridges) console.log(`  bridge ${b.from} → ${b.to} ${b.m} m (${b.manholes} manholes) at ${toLL(xy.get(b.from))} into ${outlet.get(b.to)} (${(areas.get(outlet.get(b.to)) || {}).kind})`);
  for (const d of drainage) console.log(`  ${d.name.padEnd(48)} ${String(d.manholes).padStart(6)} manholes ${String(d.areaHa).padStart(6)} ha ${d.trunkMm ? d.trunkMm + ' mm' : ''}`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { splitId, polygonize, simplifyRing };
