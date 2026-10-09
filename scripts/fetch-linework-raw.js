#!/usr/bin/env node
/*
 * Downloads existing water / wastewater / storm linework for offline analysis (probe workflow,
 * mode=linework-raw -> linework-raw branch) and reports field completeness and CORS:
 *   node scripts/fetch-linework-raw.js --out linework-raw
 */
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const A = require('../js/arcgis.js');
const PEEL = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
const LAYERS = {
  wwMains: { url: `${PEEL}/waterwastWater/FeatureServer/10`, fields: 'FacilityID,Diameter,Material,InstallationDate,InvertUp,InvertDown,Slope,DepthUp,DepthDown,MainType,RiskRatingDesc,PipeShape,ServiceStatus,Ownership,PipeLengthGIS,Sumflow' },
  waterMains: { url: `${PEEL}/waterwastWater/FeatureServer/5`, fields: '*' },
  waterMainsLarge: { url: `${PEEL}/waterwastWater/FeatureServer/6`, fields: '*' },
  hydrants: { url: `${PEEL}/HydrantsExport_/FeatureServer/0`, fields: 'FacilityID,InstallationDate,Flow,PressureZone,HydrantType,OutletSize1,OutletSize2,OutletSize3,ServiceStatus' },
};
const CORS = {
  'Peel (AGOL)': `${PEEL}/waterwastWater/FeatureServer/5/query?where=1%3D1&returnCountOnly=true&f=json`,
  'Mississauga storm (AGOL)': 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/StormSegment/FeatureServer/0/query?where=1%3D1&returnCountOnly=true&f=json',
  'Brampton storm (maps1)': 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/2/query?where=1%3D1&returnCountOnly=true&f=json',
  'Caledon ponds (AGOL)': 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/GISProd_GISDBO_StormWaterMngPonds/FeatureServer/19/query?where=1%3D1&returnCountOnly=true&f=json',
};
const r6 = v => Math.round(v * 1e6) / 1e6;
const coords = g => { if (!g) return null; const map = c => Array.isArray(c[0]) ? c.map(map) : [r6(c[0]), r6(c[1])]; return map(g.coordinates); };
(async () => {
  const i = process.argv.indexOf('--out');
  const out = path.resolve(i > 0 ? process.argv[i + 1] : 'linework-raw');
  fs.mkdirSync(out, { recursive: true });
  for (const [name, url] of Object.entries(CORS)) {
    try { const r = await fetch(url, { headers: { Origin: 'https://jaredacostar-cmd.github.io' } }); console.log(`CORS ${name}: ${r.status} allow-origin=${r.headers.get('access-control-allow-origin')} ${(await r.text()).slice(0, 80)}`); }
    catch (e) { console.log(`CORS ${name}: ERROR ${e.message}`); }
  }
  for (const [name, L] of Object.entries(LAYERS)) {
    const info = await A.layerInfo(L.url);
    const { features } = await A.queryAll(L.url, info, { max: 200000, outFields: L.fields, onProgress: n => n % 20000 < 2000 && console.log(`  ${name}: ${n}`) });
    const rows = features.map(f => ({ p: f.properties, g: coords(f.geometry) }));
    fs.writeFileSync(path.join(out, `${name}.json.gz`), zlib.gzipSync(JSON.stringify(rows)));
    // Completeness: share of features with a non-empty, non-zero value per field.
    const keys = [...new Set(rows.flatMap(r => Object.keys(r.p)))];
    console.log(`\n### ${name}: ${rows.length} features, ${(fs.statSync(path.join(out, `${name}.json.gz`)).size / 1e6).toFixed(1)} MB gz`);
    for (const k of keys) {
      const vals = rows.map(r => r.p[k]);
      const filled = vals.filter(v => v !== null && v !== '' && v !== ' ' && v !== 0).length;
      const top = Object.entries(vals.reduce((m, v) => { const s = String(v).slice(0, 18); m[s] = (m[s] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([v, n]) => `${v}:${n}`).join(' ');
      console.log(`  ${k.padEnd(20)} ${(filled / rows.length * 100).toFixed(1).padStart(5)}% filled   top: ${top}`);
    }
    if (name === 'wwMains') {
      const ok = rows.filter(r => r.p.Diameter > 0 && r.p.Slope > 0 && r.p.Slope < 0.5);
      const inv = rows.filter(r => r.p.InvertUp && r.p.InvertDown);
      const big = rows.filter(r => r.p.Diameter >= 375), bigOk = big.filter(r => r.p.Slope > 0 && r.p.Slope < 0.5);
      console.log(`  usable for Manning (diameter + 0 < slope < 0.5): ${(ok.length / rows.length * 100).toFixed(1)}%; with both inverts ${(inv.length / rows.length * 100).toFixed(1)}%; >=375 mm: ${big.length} pipes, ${(bigOk.length / big.length * 100).toFixed(1)}% usable`);
      const neg = rows.filter(r => r.p.InvertUp && r.p.InvertDown && r.p.InvertUp < r.p.InvertDown).length;
      console.log(`  adverse (upstream invert below downstream): ${neg}`);
    }
  }
})().catch(e => { console.error(e); process.exit(1); });
