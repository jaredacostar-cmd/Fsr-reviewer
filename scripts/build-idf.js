#!/usr/bin/env node
/*
 * Build data/idf.json from the MTO IDF Curve Look-up coefficients fetched at each wastewater
 * block's label point (scripts/fetch-external.js --only mto → ext-raw/mto-idf.json).
 * Intensity i (mm/h) = a · t^b, t in hours, for the 2- to 100-year return periods. The MTO lookup's
 * climate trend adds m(t) mm/h per year after its 2010 data year (the site's forecast option).
 * Usage: node scripts/build-idf.js <mto-idf.json> data/idf.json
 */
'use strict';
const fs = require('fs');
const [src, dst] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(src, 'utf8'));
const RP = ['2', '5', '10', '25', '50', '100'];
const blocks = {};
const sum = Object.fromEntries(RP.map(r => [r, { a: 0, b: 0, n: 0 }]));
for (const p of raw.points) {
  blocks[p.block] = Object.fromEntries(RP.map(r => [r, p.periods[r].a]));
  for (const r of RP) { sum[r].a += p.periods[r].a; sum[r].b += p.periods[r].b; sum[r].n++; }
}
const peel = Object.fromEntries(RP.map(r => [r, { a: +(sum[r].a / sum[r].n).toFixed(2), b: +(sum[r].b / sum[r].n).toFixed(3) }]));
const out = {
  version: 1,
  source: 'Ministry of Transportation Ontario, IDF Curve Look-up (idfcurves.mto.gov.on.ca), 30-second grid cell at each wastewater block\'s label point',
  url: raw.source, fetched: raw.fetched,
  form: 'i (mm/h) = a × t^b, t in hours (5 minutes to 24 hours)',
  dataYear: 2010,
  // MTO climate trend, mm/h per year after the data year, by duration (5, 10, 15, 30 min, 1, 2, 6, 12, 24 h).
  trend: { dur: [0.083333, 0.166667, 0.25, 0.5, 1, 2, 6, 12, 24], m: [0.0951, 0.0676, 0.0553, 0.0393, 0.0279, 0.0198, 0.0115, 0.0082, 0.0058] },
  peel, blocks,
};
fs.writeFileSync(dst, JSON.stringify(out));
console.log('blocks', Object.keys(blocks).length, 'peel', JSON.stringify(peel));
