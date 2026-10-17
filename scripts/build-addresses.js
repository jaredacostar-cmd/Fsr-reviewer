#!/usr/bin/env node
/*
 * Build data/address-points.json: the Region of Peel address point for every address on a
 * planning application or building permit in data/snapshot.json (DATASETS.md §9).
 *
 * Input: <ext-raw>/addresses/peel.json from scripts/fetch-addresses.js (about 504,000 points).
 * Keys come from js/address-key.js, the same code the browser uses, so the app can look a record
 * up without the full layer. One point per civic address (a building's units share it; the lowest
 * ROPADRID is kept). Exact key first, then the key without type and direction when that is unique.
 *
 * Output: { source, lastEdit, built, landUse: [...], houseStyle: [...], a: { key: [ropadrid, lat, lng, lu, hs] },
 *           stats: { ... } }
 * Refuses to write when it would match fewer than 80% of the previous file's keys.
 * Usage: node scripts/build-addresses.js <ext-raw> data/snapshot.json data/address-points.json
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../js/address-key.js');

const [raw, snapP, outP] = process.argv.slice(2);
if (!outP) { console.error('usage: build-addresses.js <ext-raw> <snapshot.json> <out.json>'); process.exit(2); }
const src = JSON.parse(fs.readFileSync(path.join(raw, 'addresses', 'peel.json'), 'utf8'));
const recs = JSON.parse(fs.readFileSync(snapP, 'utf8')).records;

// ---- index the address points ----
const LU = [''], HS = [''];
const code = (list, v) => { let i = list.indexOf(v); if (i < 0) { i = list.length; list.push(v); } return i; };
const exact = new Map(), looseIdx = new Map();
for (const [num, name, type, dir, muni, id, lu, hs, lat, lng] of src.rows) {
  if (!num || /^0+$/.test(num) || !name) continue;
  const k = A.civic(num, name, type, dir, muni);
  const prev = exact.get(k);
  if (prev && prev[0] <= id) continue;
  exact.set(k, [id, +lat.toFixed(5), +lng.toFixed(5), code(LU, lu), code(HS, hs)]);
}
for (const [k, v] of exact) {
  const l = A.loose(k), cur = looseIdx.get(l);
  if (!cur) looseIdx.set(l, v);
  else if (cur !== v && Math.abs(cur[1] - v[1]) + Math.abs(cur[2] - v[2]) > 0.002) looseIdx.set(l, null);  // two different places: no loose match
}

// ---- look up every record ----
const out = {};
const st = { applications: { withAddress: 0, matched: 0, noKey: 0 }, permits: { withAddress: 0, matched: 0, noKey: 0 }, over100m: 0, over250m: 0 };
const metres = (a, b, c, d) => Math.hypot((d - b) * 111320 * Math.cos(a * Math.PI / 180), (c - a) * 111320);
for (const r of recs) {
  if (!r.address) continue;
  const s = r.kind === 'permit' ? st.permits : st.applications;
  s.withAddress++;
  const ks = A.keys(r.address, r.municipality);
  if (!ks.length) { s.noKey++; continue; }
  let hit = false, best = null;
  for (const k of ks) {
    const v = exact.get(k) || looseIdx.get(A.loose(k));
    if (!v) continue;
    out[k] = v; hit = true;
    if (r.lat != null) { const d = metres(r.lat, r.lng, v[1], v[2]); if (best == null || d < best) best = d; }
  }
  if (hit) s.matched++;
  if (best != null && r.kind === 'application') { if (best > 100) st.over100m++; if (best > 250) st.over250m++; }
}
const pct = s => `${(s.matched / Math.max(1, s.withAddress) * 100).toFixed(1)}%`;
st.applications.rate = pct(st.applications); st.permits.rate = pct(st.permits);

// Guard: a broken download must not wipe out the matches.
try {
  const prev = JSON.parse(fs.readFileSync(outP, 'utf8'));
  const before = Object.keys(prev.a || {}).length, now = Object.keys(out).length;
  if (now < before * 0.8) { console.error(`REFUSED: ${now} matched addresses, down from ${before}; kept ${outP}`); process.exit(1); }
} catch (e) { /* first build */ }

fs.writeFileSync(outP, JSON.stringify({
  source: 'Region of Peel address points (open data): ' + src.source,
  lastEdit: src.lastEdit, built: new Date().toISOString().slice(0, 10), points: src.points,
  fields: ['ropadrid', 'lat', 'lng', 'landUse', 'houseStyle'], landUse: LU, houseStyle: HS,
  a: Object.fromEntries(Object.entries(out).sort()), stats: st,
}));
console.log(`${Object.keys(out).length} addresses matched → ${outP} (${(fs.statSync(outP).size / 1024).toFixed(0)} kB)`);
console.log(JSON.stringify(st));
