#!/usr/bin/env node
/*
 * Builds data/sewers.json: Region of Peel sanitary trunks (300 mm and larger) with their full-flow
 * capacity and the existing (census) load reaching each one, for the app's pipe capacity screen.
 *
 *  1. The network: each wastewater main joins its two manholes (FacilityID "SMH…-SMH…", upstream
 *     first). Gaps are bridged as in build-servicing.js (dead ends joined to the nearest pipe of
 *     another piece). Where a manhole has two outflows the larger pipe is followed.
 *  2. Capacity: Manning, full circular pipe, n = 0.013, from the published slope (or the inverts
 *     over the length when the slope is missing). Force mains get no gravity capacity.
 *  3. Existing load: each 2021 census dissemination area's population is shared among the manholes
 *     inside it (or the nearest one), and each hectare of land within 150 m of a sewer is given to
 *     its nearest manhole (for infiltration and inflow); both are summed downstream.
 *  4. Output: every gravity pipe of 300 mm or more with its downstream pipe in the output, so the
 *     app can add growth from a development down its path.
 *
 *   node scripts/build-sewer-capacity.js --raw <dir with wwMains.json.gz from fetch-linework-raw.js> [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const KX = 80500, KY = 111000;
const toM = ([x, y]) => [x * KX, y * KY];
const MIN_D = 300, N = 0.013;

function splitId(id) {
  if (id.startsWith('FACSCADA-')) { const p = id.split('-'); return ['FACSCADA-' + p[1], p.slice(2).join('-')]; }
  const i = id.indexOf('-FACSCADA-');
  if (i > 0) return [id.slice(0, i), id.slice(i + 1)];
  const p = id.split('-');
  return p.length === 2 ? p : null;
}
// Full-pipe capacity (L/s), Manning, circular.
const manning = (dmm, s) => { const D = dmm / 1000, A = Math.PI * D * D / 4, R = D / 4; return 1000 * A * Math.pow(R, 2 / 3) * Math.sqrt(s) / N; };
const validInv = v => typeof v === 'number' && v > 60 && v < 500 && ![666.666, 999.999, 444.444].includes(v);
function pip(x, y, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function main() {
  const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
  const raw = arg('--raw'); if (!raw) throw new Error('--raw <dir> required');
  const outDir = path.resolve(arg('--out') || path.join(__dirname, '..', 'data'));
  const mains = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(raw, 'wwMains.json.gz'))));
  const svc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'servicing.json'), 'utf8'));
  const plants = svc.plants.map(p => ({ name: p.name, p: toM(p.lnglat) }));
  const das = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'das.json'), 'utf8'));

  // ---- 1. Graph ------------------------------------------------------------------------
  // All outgoing pipes per manhole (overflows excluded); `down` follows the larger one for tracing.
  const xy = new Map(), ll = new Map(), down = new Map(), edge = new Map(), outs = new Map();
  for (const f of mains) {
    const s = splitId(String(f.p.FacilityID || '')); const c = f.g;
    if (!s || !c || c.length < 2 || f.p.ServiceStatus !== 'A' || /OVF/.test(f.p.MainType || '')) continue;
    const [a, b] = s, d = f.p.Diameter || 0;
    if (!xy.has(a)) { xy.set(a, toM(c[0])); ll.set(a, c[0]); }
    if (!xy.has(b)) { xy.set(b, toM(c[c.length - 1])); ll.set(b, c[c.length - 1]); }
    (outs.get(a) || outs.set(a, []).get(a)).push({ b, f });
    if (!down.has(a) || d > edge.get(a).p.Diameter) { down.set(a, b); edge.set(a, f); }
  }
  const G = new Map(), gk = (x, y) => `${Math.floor(x / 50)},${Math.floor(y / 50)}`;
  for (const n of xy.keys()) { const k = gk(...xy.get(n)); (G.get(k) || G.set(k, []).get(k)).push(n); }
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
  for (const [R, minSize] of [[25, 0], [60, 0], [150, 0], [500, 50]]) {
    const term = terminals(), size = new Map();
    for (const t of term.values()) size.set(t, (size.get(t) || 0) + 1);
    for (const [t, n] of size) {
      if (n < minSize || plantAt(t) || down.has(t)) continue;
      const c = near(xy.get(t), R).find(([q]) => term.get(q) !== t);
      if (c) { down.set(t, c[0]); outs.set(t, [{ b: c[0], f: null }]); }
    }
  }
  const term = terminals();

  // ---- 3. Loads per manhole --------------------------------------------------------------
  const pop = new Map(), ha = new Map();
  const nodes = [...xy.keys()];
  let daHit = 0, daNear = 0;
  for (const [, p, , , rings] of das.das) {
    if (!(p > 0)) continue;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    const cand = near(toM([(x0 + x1) / 2, (y0 + y1) / 2]), Math.max((x1 - x0) * KX, (y1 - y0) * KY) / 2 + 50).map(([n]) => n);
    const inside = cand.filter(n => { const [x, y] = ll.get(n); return x >= x0 && x <= x1 && y >= y0 && y <= y1 && rings.some(r => pip(x, y, r)); });
    if (inside.length) { daHit++; for (const n of inside) pop.set(n, (pop.get(n) || 0) + p / inside.length); }
    else {
      const c = near(toM([(x0 + x1) / 2, (y0 + y1) / 2]), 2000)[0];
      if (c) { daNear++; pop.set(c[0], (pop.get(c[0]) || 0) + p); }
    }
  }
  // Land within 150 m of a sewer, by hectare, to its nearest manhole.
  let cells = 0;
  const seenCell = new Set();
  for (const n of nodes) {
    const [x, y] = xy.get(n), ci = Math.floor(x / 100), cj = Math.floor(y / 100);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const k = `${ci + i},${cj + j}`; if (seenCell.has(k)) continue;
      const cx = (ci + i + 0.5) * 100, cy = (cj + j + 0.5) * 100;
      const c = near([cx, cy], 150)[0];
      if (!c) continue;
      seenCell.add(k); cells++; ha.set(c[0], (ha.get(c[0]) || 0) + 1);
    }
  }
  // Sum downstream (topological order). Where a manhole has several outgoing pipes (twinned
  // trunks, diversions) the load is shared in proportion to their full-flow capacity.
  const capOf = f => { if (!f) return 1; const P = f.p; const s = P.Slope > 0 && P.Slope < 0.5 ? P.Slope : 0.005; return P.MainType === 'FM' ? 1 : manning(P.Diameter || 200, s); };
  for (const [a, list] of outs) { const tot = list.reduce((t, e) => t + capOf(e.f), 0) || 1; for (const e of list) e.share = capOf(e.f) / tot; }
  // Loops (pipes digitised against the flow, bridges back into the same network) would stall
  // the downstream sum: drop the extra outlets of manholes in a loop, then the bridges, then any
  // remaining edge closing a loop.
  const kahn = () => {
    const deg = new Map(); for (const n of nodes) deg.set(n, 0);
    for (const list of outs.values()) for (const e of list) deg.set(e.b, (deg.get(e.b) || 0) + 1);
    const q = nodes.filter(n => deg.get(n) === 0), done = new Set(q);
    for (let i = 0; i < q.length; i++) for (const e of outs.get(q[i]) || []) { deg.set(e.b, deg.get(e.b) - 1); if (deg.get(e.b) === 0 && !done.has(e.b)) { done.add(e.b); q.push(e.b); } }
    return nodes.filter(n => !done.has(n));
  };
  let stuck = kahn(), pass = 0;
  while (stuck.length && pass < 8) {
    const S = new Set(stuck);
    for (const n of stuck) {
      const list = outs.get(n) || [];
      if (pass === 0 && list.length > 1) outs.set(n, list.filter(e => e.b === down.get(n)));
      else if (pass === 1) outs.set(n, list.filter(e => e.f || !S.has(e.b)));
      else if (pass >= 2) { const keepE = list.filter(e => !S.has(e.b)); if (keepE.length < list.length) { outs.set(n, keepE); break; } }
    }
    for (const [a, list] of outs) { const tot = list.reduce((t, e) => t + capOf(e.f), 0) || 1; for (const e of list) e.share = capOf(e.f) / tot; }
    stuck = kahn(); pass++;
  }
  if (stuck.length) console.log(`  loops left: ${stuck.length} manholes`);
  const indeg = new Map(); for (const n of nodes) indeg.set(n, 0);
  for (const list of outs.values()) for (const e of list) indeg.set(e.b, (indeg.get(e.b) || 0) + 1);
  const accP = new Map(nodes.map(n => [n, pop.get(n) || 0])), accA = new Map(nodes.map(n => [n, ha.get(n) || 0]));
  const edgeP = new Map(), edgeA = new Map();   // pipe feature -> load through it
  const queue = nodes.filter(n => indeg.get(n) === 0);
  for (let i = 0; i < queue.length; i++) {
    const n = queue[i];
    for (const e of outs.get(n) || []) {
      const p = accP.get(n) * e.share, h = accA.get(n) * e.share;
      if (e.f) { edgeP.set(e.f, p); edgeA.set(e.f, h); }
      accP.set(e.b, (accP.get(e.b) || 0) + p); accA.set(e.b, (accA.get(e.b) || 0) + h);
      indeg.set(e.b, indeg.get(e.b) - 1); if (indeg.get(e.b) === 0) queue.push(e.b);
    }
  }

  // ---- 2/4. Pipes in the output ----------------------------------------------------------
  const MATS = [], RISKS = [], PLANTS = plants.map(p => p.name).concat('Toronto');
  const idx = (arr, v) => { const s = String(v || ''); let i = arr.indexOf(s); if (i < 0) { arr.push(s); i = arr.length - 1; } return i; };
  const keep = [];
  let noSlope = 0;
  for (const [a, list] of outs) for (const e of list) {
    if (!e.f) continue;
    const P = e.f.p; if (!(P.Diameter >= MIN_D) || P.MainType === 'FM') continue;
    let s = P.Slope > 0 && P.Slope < 0.5 ? P.Slope : null;
    if (!s && validInv(P.InvertUp) && validInv(P.InvertDown) && P.PipeLengthGIS > 0 && P.InvertUp > P.InvertDown) s = (P.InvertUp - P.InvertDown) / P.PipeLengthGIS;
    if (!s) noSlope++;
    keep.push({ a, b: e.b, f: e.f, s, share: e.share });
  }
  // Downstream pipe in the output: the main (larger) pipe leaving the next manhole, following the
  // network through smaller pipes until one is kept.
  const mainOut = new Map(); keep.forEach((k, i) => { const cur = mainOut.get(k.a); if (cur == null || k.f.p.Diameter > keep[cur].f.p.Diameter) mainOut.set(k.a, i); });
  const nextOf = k => { let cur = k.b; const seen = new Set(); while (cur && !seen.has(cur)) { if (mainOut.has(cur)) return mainOut.get(cur); seen.add(cur); cur = down.get(cur); } return -1; };
  const r5 = v => Math.round(v * 1e5) / 1e5;
  const pipes = keep.map(k => {
    const { a, f, s } = k, P = f.p, t = term.get(a), pl = plantAt(t);
    const yr = P.InstallationDate && P.InstallationDate < 4e12 ? new Date(P.InstallationDate).getUTCFullYear() : 0;
    const g = f.g.length > 6 ? [f.g[0], f.g[Math.floor(f.g.length / 2)], f.g[f.g.length - 1]] : f.g;
    return [P.Diameter, s ? Math.round(s * 1e5) / 1e5 : 0, s ? Math.round(manning(P.Diameter, s)) : 0, nextOf(k), Math.round(edgeP.get(f) || 0), Math.round(edgeA.get(f) || 0),
      pl ? PLANTS.indexOf(pl.name) : PLANTS.length - 1, yr, idx(MATS, P.Material), idx(RISKS, P.RiskRatingDesc), g.flatMap(([x, y]) => [r5(x), r5(y)]), Math.round(k.share * 100) / 100];
  });
  const out = {
    version: 1, generatedAt: new Date().toISOString().slice(0, 10), n: N, minDiameter: MIN_D,
    source: 'Region of Peel Wastewater Main (waterwastWater/FeatureServer/10): diameter, slope, inverts, install date, risk rating; 2021 Census dissemination areas.',
    fields: ['diameterMm', 'slope', 'capacityLs', 'next', 'censusPopUp', 'haUp', 'plant', 'installYear', 'material', 'risk', 'coords', 'share'],
    plants: PLANTS, materials: MATS, risks: RISKS, pipes,
  };
  fs.writeFileSync(path.join(outDir, 'sewers.json'), JSON.stringify(out));
  const tot = das.das.reduce((t, d) => t + (d[1] || 0), 0);
  console.log(`pipes >= ${MIN_D} mm: ${pipes.length} (no slope ${noSlope}); DAs in polygon ${daHit}, nearest ${daNear}; census ${Math.round(tot)} people; ${cells} ha within 150 m; ${(fs.statSync(path.join(outDir, 'sewers.json')).size / 1e6).toFixed(2)} MB`);
  // Sanity: the largest pipes near each plant and their upstream population.
  for (const pl of PLANTS) {
    const top = pipes.map((p, i) => [p, i]).filter(([p]) => PLANTS[p[6]] === pl).sort((x, y) => y[0][4] - x[0][4])[0];
    if (top) console.log(`  ${pl}: largest upstream population ${top[0][4]} on a ${top[0][0]} mm pipe, capacity ${top[0][2]} L/s`);
  }
}
main();
