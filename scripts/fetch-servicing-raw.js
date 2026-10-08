#!/usr/bin/env node
/*
 * Downloads the Region of Peel water / wastewater layers used to build pressure zones and
 * wastewater drainage areas, as compact gzipped JSON for offline analysis:
 *   node scripts/fetch-servicing-raw.js --out data-raw
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const A = require('../js/arcgis.js');

const BASE = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
const LAYERS = {
  pressureZones: `${BASE}/wastewater_infrastructure/FeatureServer/6`,
  wwMains: `${BASE}/wastewater_infrastructure/FeatureServer/4`,
  wwPumpingStations: `${BASE}/wastewater_infrastructure/FeatureServer/2`,
  wwPlants: `${BASE}/wastewater_infrastructure/FeatureServer/3`,
  waterStorage: `${BASE}/water_infrastructure/FeatureServer/1`,
  waterPumpingStations: `${BASE}/water_infrastructure/FeatureServer/3`,
  waterPlants: `${BASE}/water_infrastructure/FeatureServer/2`,
};
const r6 = v => Math.round(v * 1e6) / 1e6;
const coords = g => {
  if (!g) return null;
  const map = c => Array.isArray(c[0]) ? c.map(map) : [r6(c[0]), r6(c[1])];
  return { type: g.type, coordinates: map(g.coordinates) };
};

(async () => {
  const i = process.argv.indexOf('--out');
  const out = path.resolve(i > 0 ? process.argv[i + 1] : 'data-raw');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, url] of Object.entries(LAYERS)) {
    const info = await A.layerInfo(url);
    const { features } = await A.queryAll(url, info, { max: 100000, onProgress: n => n % 10000 < 2000 && console.log(`  ${name}: ${n}`) });
    const rows = features.map(f => ({ p: f.properties, g: coords(f.geometry) }));
    const file = path.join(out, `${name}.json.gz`);
    fs.writeFileSync(file, zlib.gzipSync(JSON.stringify(rows)));
    console.log(`${name}: ${rows.length} features, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB  (${info.geometryType}; fields ${(info.fields || []).map(f => f.name).join(',')})`);
  }
})().catch(e => { console.error(e); process.exit(1); });
