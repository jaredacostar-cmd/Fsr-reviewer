#!/usr/bin/env node
/*
 * Builds data/blocks.json: the Region of Peel's 40 wastewater "Blocks", the sewersheds its inflow
 * and infiltration (I&I) program is organised by (Region of Peel, "Block_view" feature service,
 * layer Block_CombinedInformation; the blocks used in "Dragonfly: An Integrated Approach to
 * Resiliency", F. Salehzadeh, WEFTEC 2024). `planning` = 1 marks the blocks prioritised for a
 * block study (e.g. Block 26).
 *
 * Outlines are simplified to ~8 m. Which pipes leave each block, and the route to the plant, are
 * worked out in the app from data/sewers.json (so they follow that file when it is rebuilt).
 *
 *   node scripts/build-blocks.js [--raw blocks.geojson] [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const URL = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services/Block_view/FeatureServer/0';
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const outDir = arg('--out') || path.join(__dirname, '..', 'data');

// Douglas-Peucker on lng/lat with a local metric scale. A closed ring is split at the point
// farthest from its start, so the two halves have distinct end points.
function simplify(ring, tolM) {
  const kx0 = Math.cos(ring[0][1] * Math.PI / 180);
  let far = 0, fd = -1;
  for (let i = 1; i < ring.length - 1; i++) { const d = Math.hypot((ring[i][0] - ring[0][0]) * kx0, ring[i][1] - ring[0][1]); if (d > fd) { fd = d; far = i; } }
  if (!far) return ring;
  return dp(ring.slice(0, far + 1), tolM).concat(dp(ring.slice(far), tolM).slice(1));
}
function dp(ring, tolM) {
  if (ring.length < 5) return ring;
  const kx = 111320 * Math.cos(ring[0][1] * Math.PI / 180), ky = 111320;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const ax = ring[a][0] * kx, ay = ring[a][1] * ky, bx = ring[b][0] * kx, by = ring[b][1] * ky;
    const dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy) || 1;
    let best = -1, bd = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((ring[i][0] * kx - ax) * dy - (ring[i][1] * ky - ay) * dx) / L;
      if (d > bd) { bd = d; best = i; }
    }
    if (bd > tolM) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)]);
}
function areaHa(rings) {
  let t = 0;
  for (const [ri, r] of rings.entries()) {
    const kx = 111320 * Math.cos(r[0][1] * Math.PI / 180), ky = 111320;
    let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] * kx) * (r[i][1] * ky) - (r[i][0] * kx) * (r[j][1] * ky);
    t += (ri === 0 ? 1 : -1) * Math.abs(a / 2);
  }
  return t / 1e4;
}

(async () => {
  let fc;
  if (arg('--raw')) fc = JSON.parse(fs.readFileSync(arg('--raw'), 'utf8'));
  else {
    const r = await fetch(`${URL}/query?where=1%3D1&outFields=*&outSR=4326&f=geojson`);
    if (!r.ok) throw new Error(`${r.status} ${URL}`);
    fc = await r.json();
  }
  const blocks = fc.features.map(f => {
    const g = f.geometry, polys = g.type === 'MultiPolygon' ? g.coordinates : [g.coordinates];
    const parts = polys.map(rings => rings.map(r => simplify(r, 8)).filter(r => r.length >= 4)).filter(p => p.length);
    const all = parts.flat(), outer = parts.map(p => p[0]);
    const ha = parts.reduce((t, p) => t + areaHa(p), 0);
    let cx = 0, cy = 0, n = 0; for (const r of outer) for (const [x, y] of r) { cx += x; cy += y; n++; }
    return { id: String(f.properties.Block).trim(), planning: +f.properties.Planning === 1 ? 1 : 0, ha: Math.round(ha), c: [+(cx / n).toFixed(5), +(cy / n).toFixed(5)], parts, pts: all.reduce((t, r) => t + r.length, 0) };
  }).sort((a, b) => +a.id - +b.id);
  const out = {
    version: 1, generatedAt: new Date().toISOString(),
    source: 'Region of Peel, Block_view feature service (Block_CombinedInformation): the 40 wastewater blocks of its inflow & infiltration program',
    url: URL,
    blocks: blocks.map(({ pts, ...b }) => b),
  };
  fs.writeFileSync(path.join(outDir, 'blocks.json'), JSON.stringify(out));
  console.log(`${blocks.length} blocks, ${blocks.reduce((t, b) => t + b.pts, 0)} points, ${blocks.filter(b => b.planning).length} prioritised; ${Math.round(fs.statSync(path.join(outDir, 'blocks.json')).size / 1024)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
