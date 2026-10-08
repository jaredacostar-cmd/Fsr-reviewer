#!/usr/bin/env node
/*
 * Builds data/areas.json: planning areas used as filters, and the 2021 Census baseline.
 *
 *  - Secondary plans: Brampton Plan Schedule 10 Secondary Planning Areas, Caledon in-effect
 *    Secondary Plan Areas, and Mississauga Official Plan Character Areas (Mississauga plans
 *    by character area; it has no secondary plans as such).
 *  - MTSAs: Region of Peel delineation as published by Mississauga (2024), and Brampton Plan
 *    Schedule 1A/1B primary and planned MTSAs.
 *  - 2021 Census: population and private dwellings by dissemination area (Statistics Canada,
 *    via the Government Operations Centre layer), reduced to one point per DA.
 *
 *   node scripts/build-areas.js --out data
 */
'use strict';
const fs = require('fs');
const path = require('path');
const A = require('../js/arcgis.js');
const P = require('../js/phases.js');

const LAYERS = {
  secondaryPlans: [
    { municipality: 'Brampton', url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Brampton_Plan_Schedule_10_Secondary_Planning_Areas/FeatureServer/0',
      name: a => a.LABEL || `${a.SPA_NUMBER}: ${a.SPA_NAME}`, source: 'Brampton Plan Schedule 10 – Secondary Planning Areas' },
    { municipality: 'Caledon', url: 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/Secondary_Plan_Areas/FeatureServer/0',
      name: a => a.Name, source: 'Town of Caledon – Secondary Plan Areas (in effect)' },
    { municipality: 'Mississauga', url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/MOP_CharacterAreaCityStructure/FeatureServer/0',
      name: a => a.CharacterArea, source: 'Mississauga Official Plan – Character Areas' },
  ],
  mtsas: [
    { municipality: 'Mississauga', url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/MTSA_Boundary_2024/FeatureServer/7',
      name: a => a.MTSA_Long || a.MTSA_Name, source: 'Region of Peel MTSA delineation (City of Mississauga, 2024)' },
    { municipality: 'Brampton', url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Brampton_Plan_Schedule_1B_Major_Transit_Station_Areas/FeatureServer/2',
      name: a => `${a.MTSA_NAME} (${a.CORRIDOR})`, source: 'Brampton Plan Schedule 1B – Primary MTSAs' },
    { municipality: 'Brampton', url: 'https://services3.arcgis.com/rl7ACuZkiFsmDA2g/arcgis/rest/services/Brampton_Plan_Schedule_1A_City_Structure/FeatureServer/3',
      name: a => `${a.STATION_NA} (${a.STATION_TY}, planned)`, source: 'Brampton Plan Schedule 1A – Planned MTSAs' },
  ],
};
const CENSUS = {
  url: 'https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Census_2021_Population_by_Dissemination_Area/FeatureServer/0',
  source: 'Statistics Canada, 2021 Census of Population – population and dwelling counts by dissemination area',
};
const CSD = { 3521005: 'Mississauga', 3521010: 'Brampton', 3521024: 'Caledon' };

const round = v => Math.round(v * 1e5) / 1e5;
const ringsOf = g => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];

async function areas(defs, kind) {
  const out = [];
  for (const d of defs) {
    const info = await A.layerInfo(d.url);
    const feats = await A.queryAll(d.url, info, { max: 5000 });
    for (const f of feats) {
      const name = String(d.name(f.properties || {}) || '').replace(/\s+/g, ' ').trim();
      const rings = ringsOf(f.geometry).map(r => r.map(([x, y]) => [round(x), round(y)]));
      if (!name || !rings.length) continue;
      out.push({ id: `${kind}:${d.municipality}:${name}`.toLowerCase().replace(/[^a-z0-9:]+/g, '-'), name, municipality: d.municipality, rings });
    }
    console.log(`${kind}: ${d.municipality} ${feats.length} from ${d.source}`);
  }
  // Same name twice (multi-part areas published as separate features): merge rings.
  const byId = new Map();
  for (const a of out) {
    const prev = byId.get(a.id);
    if (prev) prev.rings.push(...a.rings); else byId.set(a.id, a);
  }
  return [...byId.values()].sort((a, b) => a.municipality.localeCompare(b.municipality) || a.name.localeCompare(b.name, 'en', { numeric: true }));
}

// A point inside the DA (centroid if it falls inside, else the middle of the longest
// horizontal chord through the centroid's latitude).
function insidePoint(rings) {
  let sx = 0, sy = 0, n = 0;
  for (const [x, y] of rings[0]) { sx += x; sy += y; n++; }
  const cx = sx / n, cy = sy / n;
  if (P.pointInRings(cx, cy, rings)) return [cx, cy];
  const xs = [];
  for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [x1, y1] = r[i], [x2, y2] = r[j];
    if ((y1 > cy) !== (y2 > cy)) xs.push(x1 + (cy - y1) / (y2 - y1) * (x2 - x1));
  }
  xs.sort((a, b) => a - b);
  let best = null;
  for (let i = 0; i + 1 < xs.length; i += 2) if (!best || xs[i + 1] - xs[i] > best[1] - best[0]) best = [xs[i], xs[i + 1]];
  return best ? [(best[0] + best[1]) / 2, cy] : rings[0][0];
}

async function census() {
  const info = await A.layerInfo(CENSUS.url);
  const feats = await A.queryAll(CENSUS.url, info, { where: "DAUID LIKE '3521%'", max: 5000 });
  const das = [];
  let pop = 0;
  for (const f of feats) {
    const a = f.properties || {};
    const rings = ringsOf(f.geometry);
    if (!rings.length) continue;
    const [x, y] = insidePoint(rings);
    const csd = CSD[Number(a.CSDUID_SDR)] || CSD[Number(String(a.CSDUID_SDR || '').slice(0, 7))] || '';
    das.push([round(x), round(y), a.POP_COUNT_ || 0, a.Private_dw || 0, a.Tpw || 0, csd]);
    pop += a.POP_COUNT_ || 0;
  }
  const byMuni = {};
  for (const d of das) byMuni[d[5] || '?'] = (byMuni[d[5] || '?'] || 0) + d[2];
  console.log(`census: ${das.length} dissemination areas, population ${pop.toLocaleString('en-CA')} ${JSON.stringify(byMuni)}`);
  return { date: '2021-05-11', source: CENSUS.source, fields: ['lng', 'lat', 'population', 'privateDwellings', 'occupiedDwellings', 'municipality'], das };
}

async function main() {
  const i = process.argv.indexOf('--out');
  const outDir = path.resolve(i > 0 ? process.argv[i + 1] : path.join(__dirname, '..', 'data'));
  fs.mkdirSync(outDir, { recursive: true });
  const data = {
    version: 1,
    generatedAt: new Date().toISOString(),
    sources: {
      secondaryPlans: LAYERS.secondaryPlans.map(d => ({ municipality: d.municipality, source: d.source, url: d.url })),
      mtsas: LAYERS.mtsas.map(d => ({ municipality: d.municipality, source: d.source, url: d.url })),
      census: { source: CENSUS.source, url: CENSUS.url },
    },
    secondaryPlans: await areas(LAYERS.secondaryPlans, 'sp'),
    mtsas: await areas(LAYERS.mtsas, 'mtsa'),
    census: await census(),
  };
  const file = path.join(outDir, 'areas.json');
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`areas.json: ${data.secondaryPlans.length} secondary plans / character areas, ${data.mtsas.length} MTSAs, ${data.census.das.length} DAs, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { insidePoint };
