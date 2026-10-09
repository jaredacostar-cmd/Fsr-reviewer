#!/usr/bin/env node
/**
 * Census population by pressure zone and wastewater drainage area, by area overlap.
 *
 * Each census dissemination area (data/das.json for 2021, data/das-2016.json for 2016) is
 * sampled on a grid of points (about 400 per DA, at least one per 25 m); the share of its
 * points falling in each zone / drainage area (data/servicing.json) is that area's share of
 * the DA's population. Population is assumed spread evenly over the DA, which suits large
 * rural DAs better than counting the whole DA where its centre falls.
 *
 * Output: data/svc-census.json — per census year, one entry per DA in the order of
 * data/areas.json censuses[].das: [[[zoneIndex, share], …], [[drainageIndex, share], …]].
 */
const fs = require('fs');
const path = require('path');
const PeelAreas = require('../js/areas.js');

const DATA = path.join(__dirname, '..', 'data');
const read = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const svc = read('servicing.json');
const areas = read('areas.json');
const zones = PeelAreas.prepare(svc.pressureZones), drainage = PeelAreas.prepare(svc.drainageAreas);
const KX = 80.5, KY = 111.2;   // km per degree at Peel's latitude

function inRing(x, y, r) {
  let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inRings = (x, y, rings) => rings.reduce((c, r) => c !== inRing(x, y, r), false);   // holes toggle

function sharesOf(rings, list, idx) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const wKm = (x1 - x0) * KX, hKm = (y1 - y0) * KY;
  const step = Math.max(0.025, Math.sqrt(wKm * hKm / 400));   // km
  const count = new Map(); let n = 0;
  for (let y = y0 + step / KY / 2; y < y1; y += step / KY) for (let x = x0 + step / KX / 2; x < x1; x += step / KX) {
    if (!inRings(x, y, rings)) continue;
    n++;
    const hit = PeelAreas.locate(list, x, y);
    for (const id of hit) count.set(id, (count.get(id) || 0) + 1 / hit.length);
  }
  if (!n) return null;
  return [...count].map(([id, k]) => [idx.get(id), +(k / n).toFixed(4)]).filter(([, s]) => s >= 0.0005).sort((a, b) => b[1] - a[1]);
}

const zIdx = new Map(svc.pressureZones.map((z, i) => [z.id, i])), dIdx = new Map(svc.drainageAreas.map((d, i) => [d.id, i]));
const out = { version: 1, generatedAt: new Date().toISOString(), method: 'area overlap: ~400 sample points per dissemination area', zones: svc.pressureZones.map(z => z.id), drainage: svc.drainageAreas.map(d => d.id), years: {} };
for (const c of areas.censuses) {
  const file = c.outlines || (c.year === 2021 ? 'das.json' : `das-${c.year}.json`);
  const outl = read(file).das;
  if (outl.length !== c.das.length) throw new Error(`${file}: ${outl.length} outlines for ${c.das.length} DAs`);
  const rows = [];
  let moved = 0, pop = 0;
  c.das.forEach((d, i) => {
    const o = outl[i];
    if (o[1] !== d[2]) throw new Error(`${file} #${i}: population ${o[1]} ≠ ${d[2]}`);
    const z = sharesOf(o[4], zones, zIdx), w = sharesOf(o[4], drainage, dIdx);
    rows.push([z || [], w || []]);
    // Compare with the centre-point method.
    const cz = PeelAreas.locate(drainage, d[0], d[1]);
    const share = w ? (w.find(([k]) => svc.drainageAreas[k].id === cz[0]) || [0, 0])[1] : 0;
    moved += d[2] * (1 - (cz.length ? share : 0)); pop += d[2];
  });
  out.years[c.year] = rows;
  console.log(`${c.year}: ${rows.length} DAs · ${Math.round(moved).toLocaleString()} of ${pop.toLocaleString()} people (${(moved / pop * 100).toFixed(1)}%) placed differently from the centre-point method`);
}
fs.writeFileSync(path.join(DATA, 'svc-census.json'), JSON.stringify(out));
console.log(`data/svc-census.json ${(fs.statSync(path.join(DATA, 'svc-census.json')).size / 1024).toFixed(0)} KB`);
