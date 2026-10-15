#!/usr/bin/env node
/*
 * Build data/ww-facilities.json: the Region's wastewater pumping stations (locations from
 * data/servicing.json, i.e. the Region's Wastewater Pumping Station layer) with firm capacity, pump
 * count, trunk / local role and Master Plan notes from the 2020 Master Plan Vol. 4 Table 6 and
 * section 4.3.2 (scripts/ww-pumping-stations.json). No network access.
 * Usage: node scripts/build-ww-facilities.js [--out data]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const F = require('./facilities-lib.js');

const root = path.join(__dirname, '..');
const outDir = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : path.join(root, 'data'); })();
const sv = JSON.parse(fs.readFileSync(path.join(root, 'data', 'servicing.json'), 'utf8'));
const mp = JSON.parse(fs.readFileSync(path.join(__dirname, 'ww-pumping-stations.json'), 'utf8'));
const { facilities, unlocated } = F.joinStations(sv.pumpingStations || [], mp.stations);
const out = {
  version: 1,
  sources: {
    locations: 'Region of Peel open data, Wastewater Pumping Station layer (via data/servicing.json)',
    capacities: '2020 Water and Wastewater Master Plan for the Lake-Based Systems, Volume 4, Table 6 (p. 31) and section 4.3.2 (p. 42)',
    mpUrl: mp.source,
  },
  note: 'Firm capacity = installed capacity with the largest pump out of service (L/s). Stations outside the lake-based system, leachate stations and lift stations have no Master Plan capacity.',
  facilities,
  unlocated,
};
fs.writeFileSync(path.join(outDir, 'ww-facilities.json'), JSON.stringify(out, null, 1));
console.log(`${facilities.length} stations (${facilities.filter(f => f.firmLs != null).length} with Master Plan capacity); Master Plan rows with no location: ${unlocated.length ? unlocated.join(', ') : 'none'}`);
