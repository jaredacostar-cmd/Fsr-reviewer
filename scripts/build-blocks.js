#!/usr/bin/env node
/*
 * Builds data/blocks.json: the Region of Peel's 40 wastewater "Blocks", the sewersheds its inflow
 * and infiltration (I&I) program is organised by (Region of Peel, "Block_view" feature service,
 * layer Block_CombinedInformation; the blocks used in "Dragonfly: An Integrated Approach to
 * Resiliency", F. Salehzadeh, WEFTEC 2024). `planning` = 1 marks the blocks prioritised for a
 * block study (e.g. Block 26).
 *
 * Outlines are simplified to ~8 m. The blocks are the app's wastewater catchments, so each also
 * gets its place in the flow from data/sewers.json (Region sanitary mains of 300 mm+, each with
 * its next pipe downstream): the pipes inside it, its main outlet (the pipe leaving the block that
 * carries the most people), the block that outlet drains into (or none: it reaches the plant),
 * the plant, the outlet size; its municipality (most 2021 Census people, data/das.json); and the
 * share of its people and land the sewers serve (served, servedHa).
 * Rebuild after sewers.json changes.
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
  // Place in the flow, from the sewer network.
  const S = JSON.parse(fs.readFileSync(path.join(outDir, 'sewers.json'), 'utf8')), P = S.pipes;
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
  const inB = (b, x, y) => b.parts.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
  const of = P.map(p => { const c = p[10], k = Math.floor(c.length / 4) * 2; return blocks.findIndex(b => inB(b, c[k], c[k + 1])); });
  const DA = JSON.parse(fs.readFileSync(path.join(outDir, 'das.json'), 'utf8')).das;
  // Each pipe's own share of the people and land draining through it (its total less what the
  // pipes feeding it carry). Summed over a block it shows how much of the block the sewers serve:
  // rural land on septic (most of Block 40) is not. Unreliable where trunks join in parallel, so
  // it only ever lowers the block's figures (served <= 1, servedHa <= ha).
  const upPop = new Float64Array(P.length), upHa = new Float64Array(P.length);
  P.forEach(p => { if (p[3] >= 0) { upPop[p[3]] += p[4]; upHa[p[3]] += p[5]; } });
  blocks.forEach((b, j) => {
    const outs = [], own = [];
    P.forEach((p, i) => { if (of[i] !== j) return; own.push(i); if (p[3] < 0 || of[p[3]] !== j) outs.push(i); });
    outs.sort((x, y) => P[y][4] - P[x][4]);
    const m = outs[0];
    b.pipes = own.length;
    if (m != null) {
      const c = P[m][10], nx = P[m][3];
      b.outletAt = [c[c.length - 2], c[c.length - 1]];
      b.trunkMm = P[m][0];
      b.plant = S.plants[P[m][6]] || null;
      // Downstream: the first block the outlet's pipes reach (past any pipes outside every block).
      let k = nx, hop = 0; while (k >= 0 && of[k] < 0 && hop++ < 5000) k = P[k][3];
      b.into = k >= 0 && of[k] >= 0 && of[k] !== j ? blocks[of[k]].id : null;
    }
    const pop = {};
    for (const d of DA) { const r = d[4] && d[4][0]; if (!r) continue; let x = 0, y = 0; for (const [a, bb] of r) { x += a; y += bb; } x /= r.length; y /= r.length; if (inB(b, x, y)) pop[d[3]] = (pop[d[3]] || 0) + d[1]; }
    b.muni = Object.keys(pop).sort((a, c) => pop[c] - pop[a])[0] || null;
    let sp = 0, sh = 0; for (const i of own) { sp += Math.max(0, P[i][4] - upPop[i]); sh += Math.max(0, P[i][5] - upHa[i]); }
    const daPop = Object.values(pop).reduce((t, v) => t + v, 0);
    b.served = daPop > 0 ? Math.min(1, +(sp / daPop).toFixed(2)) : 1;
    b.servedHa = Math.round(Math.min(b.ha, sh));
  });
  for (const b of blocks) console.log(`block ${b.id}: ${b.pipes} pipes, served ${Math.round(b.served * 100)}% / ${b.servedHa} of ${b.ha} ha, outlet ${b.trunkMm || '-'} mm → ${b.into ? `block ${b.into}` : b.plant || '?'} · ${b.muni}`);
  const out = {
    version: 2, generatedAt: new Date().toISOString(),
    source: 'Region of Peel, Block_view feature service (Block_CombinedInformation): the 40 wastewater blocks of its inflow & infiltration program',
    url: URL,
    blocks: blocks.map(({ pts, ...b }) => b),
  };
  fs.writeFileSync(path.join(outDir, 'blocks.json'), JSON.stringify(out));
  console.log(`${blocks.length} blocks, ${blocks.reduce((t, b) => t + b.pts, 0)} points, ${blocks.filter(b => b.planning).length} prioritised; ${Math.round(fs.statSync(path.join(outDir, 'blocks.json')).size / 1024)} KB`);
})().catch(e => { console.error(e); process.exit(1); });
