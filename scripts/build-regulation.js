#!/usr/bin/env node
/*
 * (Superseded as a data build by scripts/build-constraints.js, which reuses the clipping below.)
 * Credit Valley Conservation's regulation limit (Generic Regulations Limit 2025, O. Reg. 41/24),
 * cut into the map's 0.02° tiles over Peel for the Regulation limits layer.
 *
 * CVC publishes the limit as one polygon (~28,700 ha, ~12 MB as GeoJSON) and the service
 * returns all of it for any query, so the app can't load it live tile by tile like TRCA's.
 * Each tile file holds the polygon clipped to the tile (fill) and the limit's own edges inside
 * the tile (outline), so tile borders don't draw as lines.
 *   node scripts/build-regulation.js --out data
 * Writes <out>/regulation/cvc/<tx>_<ty>.json and <out>/regulation/cvc/index.json. Points are whole
 * numbers of 0.00001° (~1 m) from the tile's south-west corner: x = tx × 0.02 + dx / 1e5.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const URL_CVC = 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/arcgis/rest/services/Generic_Regulations_Limit_2025/FeatureServer/0';
const PEEL = { xmin: -80.16, ymin: 43.47, xmax: -79.48, ymax: 44.00 };
const TILE = 0.02;
const R = v => Math.round(v * 1e5) / 1e5;   // ~1 m

// Sutherland–Hodgman: a ring clipped to an axis-aligned rectangle.
function clipRing(ring, b) {
  const edges = [
    [p => p[0] >= b.xmin, (p, q) => [b.xmin, p[1] + (q[1] - p[1]) * (b.xmin - p[0]) / (q[0] - p[0])]],
    [p => p[0] <= b.xmax, (p, q) => [b.xmax, p[1] + (q[1] - p[1]) * (b.xmax - p[0]) / (q[0] - p[0])]],
    [p => p[1] >= b.ymin, (p, q) => [p[0] + (q[0] - p[0]) * (b.ymin - p[1]) / (q[1] - p[1]), b.ymin]],
    [p => p[1] <= b.ymax, (p, q) => [p[0] + (q[0] - p[0]) * (b.ymax - p[1]) / (q[1] - p[1]), b.ymax]],
  ];
  let out = ring.slice(0, ring.length > 1 && ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? -1 : undefined);
  for (const [inside, cross] of edges) {
    const src = out; out = [];
    for (let i = 0; i < src.length; i++) {
      const p = src[i], q = src[(i + 1) % src.length];
      if (inside(q)) { if (!inside(p)) out.push(cross(p, q)); out.push(q); }
      else if (inside(p)) out.push(cross(p, q));
    }
    if (!out.length) break;
  }
  return out;
}
// Liang–Barsky: the part of segment p→q inside the rectangle, or null.
function clipSeg(p, q, b) {
  let t0 = 0, t1 = 1; const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - b.xmin], [dx, b.xmax - p[0]], [-dy, p[1] - b.ymin], [dy, b.ymax - p[1]]]) {
    if (pp === 0) { if (qq < 0) return null; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return null; if (r > t0) t0 = r; } else { if (r < t0) return null; if (r < t1) t1 = r; }
  }
  return [[p[0] + t0 * dx, p[1] + t0 * dy], [p[0] + t1 * dx, p[1] + t1 * dy]];
}
// The ring's edges inside the rectangle, joined into polylines.
function clipEdges(ring, b) {
  const lines = []; let cur = null;
  for (let i = 1; i < ring.length; i++) {
    const s = clipSeg(ring[i - 1], ring[i], b);
    if (!s) { cur = null; continue; }
    if (cur && cur[cur.length - 1][0] === s[0][0] && cur[cur.length - 1][1] === s[0][1]) cur.push(s[1]);
    else { cur = [s[0], s[1]]; lines.push(cur); }
  }
  return lines;
}
const ringBBox = r => r.reduce((b, [x, y]) => ({ xmin: Math.min(b.xmin, x), ymin: Math.min(b.ymin, y), xmax: Math.max(b.xmax, x), ymax: Math.max(b.ymax, y) }), { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity });
const dedupe = pts => pts.map(([x, y]) => [R(x), R(y)]).filter((p, i, a) => !i || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);

async function main() {
  const outDir = path.join(process.argv[process.argv.indexOf('--out') + 1] || 'data', 'regulation', 'cvc');
  const params = new URLSearchParams({ where: '1=1', outFields: 'objectid', returnGeometry: true, outSR: 4326, maxAllowableOffset: 0.00006, geometryPrecision: 6, f: 'geojson' });
  const info = await (await fetch(`${URL_CVC}?f=json`)).json();
  const fc = await (await fetch(`${URL_CVC}/query?${params}`)).json();
  const polys = fc.features.flatMap(f => f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates]);
  console.log(`CVC regulation limit: ${fc.features.length} feature(s), ${polys.length} polygons, ${polys.reduce((t, p) => t + p.reduce((u, r) => u + r.length, 0), 0)} vertices`);
  const tiles = new Map();   // "tx_ty" -> { f: [], e: [] }
  for (const poly of polys) for (const ring of poly) {
    const bb = ringBBox(ring);
    if (bb.xmax < PEEL.xmin || bb.xmin > PEEL.xmax || bb.ymax < PEEL.ymin || bb.ymin > PEEL.ymax) continue;
    for (let tx = Math.floor(Math.max(bb.xmin, PEEL.xmin) / TILE); tx <= Math.floor(Math.min(bb.xmax, PEEL.xmax) / TILE); tx++)
      for (let ty = Math.floor(Math.max(bb.ymin, PEEL.ymin) / TILE); ty <= Math.floor(Math.min(bb.ymax, PEEL.ymax) / TILE); ty++) {
        const b = { xmin: tx * TILE, ymin: ty * TILE, xmax: (tx + 1) * TILE, ymax: (ty + 1) * TILE };
        const fill = dedupe(clipRing(ring, b)), edges = clipEdges(ring, b).map(dedupe).filter(l => l.length > 1);
        if (fill.length < 3 && !edges.length) continue;
        const k = `${tx}_${ty}`; if (!tiles.has(k)) tiles.set(k, { f: [], e: [] });
        const t = tiles.get(k); if (fill.length >= 3) t.f.push(fill); t.e.push(...edges);
      }
  }
  fs.rmSync(outDir, { recursive: true, force: true });
  fs.mkdirSync(outDir, { recursive: true });
  let bytes = 0;
  for (const [k, t] of tiles) {
    const [tx, ty] = k.split('_').map(Number), enc = l => l.map(([x, y]) => [Math.round((x - tx * TILE) * 1e5), Math.round((y - ty * TILE) * 1e5)]);
    const s = JSON.stringify({ f: t.f.map(enc), e: t.e.map(enc) }); bytes += s.length; fs.writeFileSync(path.join(outDir, `${k}.json`), s);
  }
  const index = { source: 'Credit Valley Conservation – Generic Regulations Limit (2025)', url: URL_CVC, edited: info.editingInfo && info.editingInfo.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10) : null, built: new Date().toISOString().slice(0, 10), tile: TILE, units: 1e5, tiles: [...tiles.keys()].sort() };
  fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(index));
  console.log(`Wrote ${tiles.size} tiles (${(bytes / 1e6).toFixed(2)} MB) to ${outDir}`);
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { clipRing, clipSeg, clipEdges };
