#!/usr/bin/env node
/*
 * Builds data/water-supply.json: the Region of Peel's large watermains (750 mm and larger) that
 * cross each boundary between the lake-based pressure zones, with a rough conveyance capacity for
 * the DC needs screen.
 *
 *  - A main crosses a boundary where consecutive vertices fall in two different pressure zones;
 *    each main (feature) counts once per boundary.
 *  - Capacity at a design velocity of 1.5 m/s, full pipe: Q = v · π D² / 4 (ML/d).
 *  - Zones step up from the lake (1, 2, 3 …); water reaches a zone through the boundary below it,
 *    so the app compares a boundary's capacity with the maximum day demand of every zone above it.
 *
 * A rough estimate: boundary valves, pumping stations and pressure reducing valves set what really
 * passes between zones, and water pumping station capacities are not published.
 *
 *   node scripts/build-water-supply.js --raw <dir with waterMainsLarge.json.gz> [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const A = require('../js/areas.js');

const V = 1.5;
const args = process.argv.slice(2);
const arg = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const rawDir = arg('--raw'), outDir = arg('--out') || path.join(__dirname, '..', 'data');
if (!rawDir) { console.error('usage: build-water-supply.js --raw <dir> [--out data]'); process.exit(1); }

const raw = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(rawDir, 'waterMainsLarge.json.gz'))));
const feats = raw.features || raw;
const svc = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'servicing.json'), 'utf8'));
const zones = A.prepare(svc.pressureZones);
const zoneAt = (x, y) => { const ids = A.locate(zones, x, y); return ids.length ? ids[0].replace(/^pz:/, '') : null; };
const level = z => { const m = /^(\d+)/.exec(z); return m ? +m[1] : null; };
const capMLd = dmm => V * Math.PI * Math.pow(dmm / 1000, 2) / 4 * 86400 / 1000;

const bounds = new Map();
for (const f of feats) {
  const d = +(f.p && f.p.Diameter) || 0; if (d < 750) continue;
  const lines = Array.isArray(f.g[0][0]) ? f.g : [f.g];
  const seen = new Set();
  for (const l of lines) {
    let prev = zoneAt(l[0][0], l[0][1]), at = l[0];
    for (let i = 1; i < l.length; i++) {
      const cur = zoneAt(l[i][0], l[i][1]);
      if (cur && prev && cur !== prev && level(cur) != null && level(prev) != null && level(cur) !== level(prev)) {
        const [lo, hi] = level(cur) < level(prev) ? [cur, prev] : [prev, cur];
        const k = `${lo}|${hi}`;
        if (!seen.has(k)) {
          seen.add(k);
          const b = bounds.get(k) || { lower: lo, upper: hi, mains: [] };
          b.mains.push({ d, id: f.p.FacilityID || '', at: [+((at[0] + l[i][0]) / 2).toFixed(5), +((at[1] + l[i][1]) / 2).toFixed(5)] });
          bounds.set(k, b);
        }
      }
      if (cur) { prev = cur; at = l[i]; }
    }
  }
}
const out = {
  version: 1, generatedAt: new Date().toISOString(), velocity: V,
  source: 'Region of Peel open data, waterwastWater FeatureServer layer 6 (large watermains); pressure zones from data/servicing.json',
  boundaries: [...bounds.values()].map(b => ({ ...b, capMLd: Math.round(b.mains.reduce((t, m) => t + capMLd(m.d), 0)) }))
    .sort((a, b) => level(a.upper) - level(b.upper) || a.lower.localeCompare(b.lower)),
};
fs.writeFileSync(path.join(outDir, 'water-supply.json'), JSON.stringify(out));
for (const b of out.boundaries) console.log(`${b.lower} → ${b.upper}: ${b.mains.length} mains (${b.mains.map(m => m.d).join(', ')}) ≈ ${b.capMLd} ML/d`);
