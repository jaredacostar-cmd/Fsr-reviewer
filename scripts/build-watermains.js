#!/usr/bin/env node
/*
 * Builds data/watermains.json: the Region of Peel's watermains of 300 mm and larger as a network the
 * app routes the water supply trace along (plant → pumping stations → a development's site).
 *
 *  - Nodes are the mains' vertices, merged where they meet (to about 1 m); a main's end within 6 m
 *    of another main's vertex is joined to it (the drawn lines often stop just short).
 *  - Edges join consecutive vertices of a main and carry its diameter (mm; 0 for a join).
 *  - Encoding: `xy` is the node coordinates as integers of 1e-5 degrees, each pair the difference
 *    from the previous node; `e` is [from, to − from, diameter] per edge.
 *
 * Source: Region of Peel open data, waterwastWater FeatureServer layer 5 (watermains), from the
 * linework-raw download (waterMains.json.gz).
 *
 *   node scripts/build-watermains.js --raw <dir with waterMains.json.gz> [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const MIN_D = 300, JOIN_M = 6;
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const rawDir = arg('--raw'), outDir = arg('--out') || path.join(__dirname, '..', 'data');
if (!rawDir) { console.error('usage: build-watermains.js --raw <dir> [--out data]'); process.exit(1); }

const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(rawDir, 'waterMains.json.gz'))));
const feats = raw.features || raw;

const key = new Map(), X = [], Y = [], edges = [], ends = [];
const node = ([x, y]) => {
  const ix = Math.round(x * 1e5), iy = Math.round(y * 1e5), k = `${ix},${iy}`;
  let i = key.get(k); if (i == null) { i = X.length; key.set(k, i); X.push(ix); Y.push(iy); }
  return i;
};
const seen = new Set();
let mains = 0;
for (const f of feats) {
  const d = +(f.p && f.p.Diameter) || 0; if (d < MIN_D || !f.g) continue;
  mains++;
  const lines = Array.isArray(f.g[0][0]) ? f.g : [f.g];
  for (const l of lines) {
    let a = node(l[0]); ends.push(a);
    for (let i = 1; i < l.length; i++) {
      const b = node(l[i]); if (b === a) continue;
      const k = a < b ? `${a}|${b}` : `${b}|${a}`;
      if (!seen.has(k)) { seen.add(k); edges.push([a, b, d]); }
      a = b;
    }
    ends.push(a);
  }
}
// Degree, then join loose ends to the nearest other node within JOIN_M.
const deg = new Uint16Array(X.length); for (const [a, b] of edges) { deg[a]++; deg[b]++; }
const CELL = 20;   // 1e-5° units ≈ 15–20 m
const grid = new Map(); const gk = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
for (let i = 0; i < X.length; i++) { const k = gk(X[i], Y[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); }
const kx = 1.1132 * Math.cos(43.7 * Math.PI / 180), ky = 1.1132;   // metres per 1e-5°
let joins = 0;
for (const a of new Set(ends)) {
  if (deg[a] !== 1) continue;
  const cx = Math.floor(X[a] / CELL), cy = Math.floor(Y[a] / CELL);
  let best = -1, bd = JOIN_M;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const b of grid.get(`${cx + dx},${cy + dy}`) || []) {
    if (b === a) continue;
    const m = Math.hypot((X[b] - X[a]) * kx, (Y[b] - Y[a]) * ky);
    if (m < bd && m > 0) { bd = m; best = b; }
  }
  if (best >= 0) { const k = a < best ? `${a}|${best}` : `${best}|${a}`; if (!seen.has(k)) { seen.add(k); edges.push([a, best, 0]); joins++; } }
}
const xy = []; let px = 0, py = 0;
for (let i = 0; i < X.length; i++) { xy.push(X[i] - px, Y[i] - py); px = X[i]; py = Y[i]; }
const e = []; for (const [a, b, d] of edges) e.push(a, b - a, d);
const out = {
  version: 1,
  generatedAt: new Date().toISOString(),
  source: 'Region of Peel open data, waterwastWater FeatureServer layer 5 (watermains), mains of 300 mm and larger',
  minDiameter: MIN_D,
  nodes: X.length, edges: edges.length,
  xy, e,
};
fs.writeFileSync(path.join(outDir, 'watermains.json'), JSON.stringify(out));
console.log(`${mains} mains of ${MIN_D} mm+ → ${X.length} nodes, ${edges.length} edges (${joins} end joins)`);
