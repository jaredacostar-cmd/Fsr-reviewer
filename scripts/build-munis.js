#!/usr/bin/env node
/*
 * data/munis.json — the outlines of Peel and its three municipalities, for the map's frame.
 *
 * The municipal boundary services can't be reached from every build, so the outlines are made from
 * what the app already has: the 2021 Census dissemination areas (data/das.json), each tagged with its
 * municipality. The census areas were simplified one by one, so their shared edges don't line up
 * exactly; they are drawn onto a grid of about 60 m cells instead, the slivers between them filled,
 * and each municipality's cells traced back into rings and simplified. The result is a context line
 * (accurate to about one cell), not a legal boundary.
 *
 *   node scripts/build-munis.js [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CELL_LAT = 0.00054;             // ≈60 m north–south
const MIN_RING_KM2 = 0.5;             // islands and holes smaller than this are dropped

// Even-odd scanline fill of polygons (rings in [lng, lat]) onto the grid, with the label k.
function fill(grid, g, rings, k) {
  let y0 = Infinity, y1 = -Infinity;
  for (const r of rings) for (const p of r) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
  const j0 = Math.max(0, Math.floor((y0 - g.y0) / g.dy)), j1 = Math.min(g.ny - 1, Math.floor((y1 - g.y0) / g.dy));
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * g.dy, xs = [];
    for (const r of rings) for (let i = 0, n = r.length; i < n; i++) {
      const a = r[i], b = r[(i + 1) % n];
      if ((a[1] > y) !== (b[1] > y)) xs.push(a[0] + (y - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
    }
    xs.sort((p, q) => p - q);
    for (let t = 0; t + 1 < xs.length; t += 2) {
      const i0 = Math.max(0, Math.ceil((xs[t] - g.x0) / g.dx - 0.5)), i1 = Math.min(g.nx - 1, Math.floor((xs[t + 1] - g.x0) / g.dx - 0.5));
      for (let i = i0; i <= i1; i++) grid[j * g.nx + i] = k;
    }
  }
}
// The slivers the separate simplification left between census areas: an empty cell most of whose
// neighbours are labelled takes their commonest label.
function closeGaps(grid, g, passes = 3) {
  for (let pass = 0; pass < passes; pass++) {
    const out = grid.slice();
    for (let j = 1; j < g.ny - 1; j++) for (let i = 1; i < g.nx - 1; i++) {
      const c = j * g.nx + i; if (grid[c]) continue;
      const n = {}; let tot = 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const v = grid[c + dj * g.nx + di]; if (v) { n[v] = (n[v] || 0) + 1; tot++; } }
      if (tot >= 5) out[c] = +Object.entries(n).sort((a, b) => b[1] - a[1])[0][0];
    }
    grid.set(out);
  }
}
// The cell edges between inside and outside, joined into closed rings (inside on the left).
function trace(inside, g) {
  const at = (i, j) => i >= 0 && j >= 0 && i < g.nx && j < g.ny && inside(j * g.nx + i);
  const next = new Map(), key = (i, j) => j * (g.nx + 1) + i;
  const add = (a, b) => { (next.get(key(...a)) || next.set(key(...a), []).get(key(...a))).push(b); };
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) {
    if (!at(i, j)) continue;
    if (!at(i, j - 1)) add([i, j], [i + 1, j]);
    if (!at(i + 1, j)) add([i + 1, j], [i + 1, j + 1]);
    if (!at(i, j + 1)) add([i + 1, j + 1], [i, j + 1]);
    if (!at(i - 1, j)) add([i, j + 1], [i, j]);
  }
  const rings = [];
  for (const [k0, outs] of next) {
    while (outs.length) {
      const start = [k0 % (g.nx + 1), Math.floor(k0 / (g.nx + 1))], ring = [start];
      let cur = outs.pop();
      for (let guard = 0; guard < 1e7; guard++) {
        ring.push(cur);
        const k = key(...cur); if (k === k0) break;
        const o = next.get(k); cur = o.pop();
      }
      rings.push(ring);
    }
  }
  return rings;
}
// Douglas–Peucker on a closed ring (tolerance in grid cells).
function simplify(ring, tol) {
  const pts = ring.slice(0, -1), n = pts.length; if (n < 8) return ring;
  const keep = new Uint8Array(n); keep[0] = 1;
  let far = 0, fd = -1; for (let i = 1; i < n; i++) { const d = (pts[i][0] - pts[0][0]) ** 2 + (pts[i][1] - pts[0][1]) ** 2; if (d > fd) { fd = d; far = i; } }
  keep[far] = 1;
  const seg = (a, b) => {
    const stack = [[a, b]];
    while (stack.length) {
      const [s, e] = stack.pop(); if (e - s < 2) continue;
      const [x1, y1] = pts[s], [x2, y2] = pts[e % n], L = Math.hypot(x2 - x1, y2 - y1) || 1;
      let bi = -1, bd = tol;
      for (let i = s + 1; i < e; i++) { const [x, y] = pts[i], d = Math.abs((x2 - x1) * (y1 - y) - (x1 - x) * (y2 - y1)) / L; if (d > bd) { bd = d; bi = i; } }
      if (bi > 0) { keep[bi] = 1; stack.push([s, bi], [bi, e]); }
    }
  };
  seg(0, far); seg(far, n);
  const out = pts.filter((_, i) => keep[i]); out.push(out[0]);
  return out;
}
const ringArea = r => { let a = 0; for (let i = 0; i + 1 < r.length; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return a / 2; };
// The cell deepest inside (chamfer distance): where the name goes.
function deepest(inside, g) {
  const d = new Float32Array(g.nx * g.ny);
  for (let c = 0; c < d.length; c++) d[c] = inside(c) ? 1e9 : 0;
  const S = Math.SQRT2;
  for (let j = 0; j < g.ny; j++) for (let i = 0; i < g.nx; i++) { const c = j * g.nx + i; if (!d[c]) continue; let v = d[c];
    if (i > 0) v = Math.min(v, d[c - 1] + 1); if (j > 0) v = Math.min(v, d[c - g.nx] + 1); if (i > 0 && j > 0) v = Math.min(v, d[c - g.nx - 1] + S); if (i < g.nx - 1 && j > 0) v = Math.min(v, d[c - g.nx + 1] + S); d[c] = v; }
  let best = 0, bc = -1;
  for (let j = g.ny - 1; j >= 0; j--) for (let i = g.nx - 1; i >= 0; i--) { const c = j * g.nx + i; if (!d[c]) continue; let v = d[c];
    if (i < g.nx - 1) v = Math.min(v, d[c + 1] + 1); if (j < g.ny - 1) v = Math.min(v, d[c + g.nx] + 1); if (i < g.nx - 1 && j < g.ny - 1) v = Math.min(v, d[c + g.nx + 1] + S); if (i > 0 && j < g.ny - 1) v = Math.min(v, d[c + g.nx - 1] + S); d[c] = v;
    if (v > best) { best = v; bc = c; } }
  return bc;
}

// areas: [{ name, rings }] (rings may carry holes; each feature's rings are filled even-odd).
// Returns { munis: [{ name, rings, label }], peel: { rings } } in [lng, lat] to 5 decimals.
function outlines(features, { cellLat = CELL_LAT } = {}) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const f of features) for (const r of f.rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const kx = Math.cos((y0 + y1) / 2 * Math.PI / 180), dy = cellLat, dx = cellLat / kx;
  const g = { x0: x0 - 2 * dx, y0: y0 - 2 * dy, dx, dy };
  g.nx = Math.ceil((x1 - g.x0) / dx) + 3; g.ny = Math.ceil((y1 - g.y0) / dy) + 3;
  const names = [...new Set(features.map(f => f.name))].sort();
  const grid = new Uint8Array(g.nx * g.ny);
  for (const f of features) fill(grid, g, f.rings, names.indexOf(f.name) + 1);
  closeGaps(grid, g);
  const cellKm2 = (dy * 111.32) ** 2, toLL = ([i, j]) => [+(g.x0 + i * dx).toFixed(5), +(g.y0 + j * dy).toFixed(5)];
  const ringsOf = inside => trace(inside, g)
    .filter(r => Math.abs(ringArea(r)) * cellKm2 >= MIN_RING_KM2)
    .map(r => simplify(r, 1.1).map(toLL));
  const munis = names.map((name, k) => {
    const inside = c => grid[c] === k + 1, c = deepest(inside, g);
    return { name, rings: ringsOf(inside), label: toLL([(c % g.nx) + 0.5, Math.floor(c / g.nx) + 0.5]) };
  });
  return { munis, peel: { rings: ringsOf(c => grid[c] > 0) } };
}

function main() {
  const out = process.argv.includes('--out') ? process.argv[process.argv.indexOf('--out') + 1] : 'data';
  const das = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/das.json'), 'utf8'));
  const iM = das.fields.indexOf('municipality'), iR = das.fields.indexOf('rings');
  const res = outlines(das.das.map(d => ({ name: d[iM], rings: d[iR] })).filter(f => f.name && f.rings));
  const doc = {
    version: 1,
    generatedAt: das.date,
    source: `${das.source} (outlines, ${das.year}), each census area's municipality`,
    method: 'Census areas drawn on a grid of about 60 m cells, slivers between them filled, each municipality traced and simplified: a context line accurate to about 60 m, not a legal boundary.',
    ...res,
  };
  fs.writeFileSync(path.join(ROOT, out, 'munis.json'), JSON.stringify(doc));
  for (const m of res.munis) console.log(`${m.name}: ${m.rings.length} ring(s), ${m.rings.reduce((s, r) => s + r.length, 0)} points, label at ${m.label}`);
  console.log(`Peel: ${res.peel.rings.length} ring(s), ${res.peel.rings.reduce((s, r) => s + r.length, 0)} points`);
}

if (require.main === module) main();
module.exports = { outlines, simplify, trace, ringArea };
