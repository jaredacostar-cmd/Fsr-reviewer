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
// Census years, newest first. The app uses the latest one held in or before the timeline's
// first year as the baseline. Application data starts in 2016, so 2016 is as far back as needed.
const CENSUSES = [
  {
    year: 2021, date: '2021-05-11', outlines: 'das.json',
    url: 'https://services.arcgis.com/txWDfZ2LIgzmw5Ts/arcgis/rest/services/Census_2021_Population_by_Dissemination_Area/FeatureServer/0',
    source: 'Statistics Canada, 2021 Census of Population – population and dwelling counts by dissemination area',
    pop: a => a.POP_COUNT_, dw: a => a.Private_dw, occ: a => a.Tpw, csd: a => a.CSDUID_SDR,
    // Published Peel total, to check the download.
    expect: 1451022,
  },
  {
    year: 2016, date: '2016-05-10', outlines: 'das-2016.json',
    url: 'https://services.arcgis.com/4TKcmj8FHh5Vtobt/arcgis/rest/services/Immigration_in_Peel_by_DA_as_of_2016/FeatureServer/0',
    source: 'Statistics Canada, 2016 Census of Population – population and private dwellings by dissemination area (2016 boundaries, via the "Immigration in Peel by DA as of 2016" layer)',
    pop: a => a.Total_Popu, dw: a => a.Total_priv, occ: () => 0, csd: a => a.CSDUID || a.CSD_UID || a.CSDUID16,
    expect: 1381739,
  },
];
const CENSUS = CENSUSES[0];
const CSD = { 3521005: 'Mississauga', 3521010: 'Brampton', 3521024: 'Caledon' };

const round = v => Math.round(v * 1e5) / 1e5;
const ringsOf = g => !g ? [] : g.type === 'Polygon' ? g.coordinates : g.type === 'MultiPolygon' ? g.coordinates.flat() : [];

async function areas(defs, kind) {
  const out = [];
  for (const d of defs) {
    const info = await A.layerInfo(d.url);
    const { features: feats } = await A.queryAll(d.url, info, { max: 5000 });
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

// Share of each DA's land inside each area, by sampling a grid of points over the DA
// (about 400 per DA). Population is assumed even across a DA's land, so a small MTSA gets the
// share of the DAs it covers rather than all or nothing.
function bboxOf(rings) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  return [x0, y0, x1, y1];
}
function shares(rings, areaList) {
  const b = bboxOf(rings);
  const cand = areaList.filter(a => !(a.bbox[0] > b[2] || a.bbox[2] < b[0] || a.bbox[1] > b[3] || a.bbox[3] < b[1]));
  if (!cand.length) return {};
  const steps = 24, dx = (b[2] - b[0]) / steps, dy = (b[3] - b[1]) / steps;
  const hits = new Map(); let n = 0;
  for (let i = 0; i < steps; i++) for (let j = 0; j < steps; j++) {
    const x = b[0] + (i + 0.5) * dx, y = b[1] + (j + 0.5) * dy;
    if (!P.pointInRings(x, y, rings)) continue;
    n++;
    for (const a of cand) if (P.pointInRings(x, y, a.rings)) hits.set(a.id, (hits.get(a.id) || 0) + 1);
  }
  const out = {};
  if (!n) { const [x, y] = insidePoint(rings); for (const a of cand) if (P.pointInRings(x, y, a.rings)) out[a.id] = 1; return out; }
  for (const [id, k] of hits) out[id] = Math.round(k / n * 1000) / 1000;
  return out;
}

// Douglas–Peucker on a ring in lng/lat degrees (tolerance ~4 m), for the light DA outlines.
function simplify(ring, tol = 0.00004) {
  if (ring.length <= 4) return ring;
  // A closed ring starts and ends on the same point: simplify its two halves.
  const [fx, fy] = ring[0], [lx, ly] = ring[ring.length - 1];
  if (fx === lx && fy === ly) {
    const mid = Math.floor(ring.length / 2);
    const out = [...simplifyLine(ring.slice(0, mid + 1), tol).slice(0, -1), ...simplifyLine(ring.slice(mid), tol)];
    return out.length >= 4 ? out : ring;
  }
  return simplifyLine(ring, tol);
}
function simplifyLine(ring, tol) {
  if (ring.length <= 2) return ring;
  const keep = new Uint8Array(ring.length); keep[0] = keep[ring.length - 1] = 1;
  const stack = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [x1, y1] = ring[a], [x2, y2] = ring[b];
    const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-12;
    let best = -1, far = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * ring[i][0] - dx * ring[i][1] + x2 * y1 - y2 * x1) / len;
      if (d > far) { far = d; best = i; }
    }
    if (far > tol) { keep[best] = 1; stack.push([a, best], [best, b]); }
  }
  return ring.filter((_, i) => keep[i]);
}

// One census year: DA points with area shares, and simplified outlines. Municipality from the
// layer's CSD code, else from the 2021 DA the point falls in (refDas).
async function census(def, areaList, refDas = null) {
  for (const a of areaList) a.bbox = bboxOf(a.rings);
  const info = await A.layerInfo(def.url);
  const daField = (info.fields || []).map(f => f.name).find(n => /^DAUID/i.test(n)) || 'DAUID';
  const { features: feats } = await A.queryAll(def.url, info, { where: `${daField} LIKE '3521%'`, max: 5000 });
  const das = [], outlines = [];
  let pop = 0;
  const num = v => (Number(v) > 0 ? Number(v) : 0);
  for (const f of feats) {
    const a = f.properties || {};
    const rings = ringsOf(f.geometry);
    if (!rings.length) continue;
    const [x, y] = insidePoint(rings);
    const code = def.csd(a);
    let csd = CSD[Number(code)] || CSD[Number(String(code || '').slice(0, 7))] || '';
    if (!csd && refDas) { const hit = refDas.find(d => P.pointInRings(x, y, d.rings)); if (hit) csd = hit.csd; }
    const p = num(def.pop(a)), dw = num(def.dw(a));
    das.push([round(x), round(y), p, dw, num(def.occ(a)), csd, shares(rings, areaList)]);
    outlines.push([String(a[daField] || ''), p, dw, csd, rings.map(r => simplify(r).map(([lx, ly]) => [round(lx), round(ly)]))]);
    pop += p;
  }
  for (const a of areaList) delete a.bbox;
  const byMuni = {};
  for (const d of das) byMuni[d[5] || '?'] = (byMuni[d[5] || '?'] || 0) + d[2];
  const off = def.expect ? (pop - def.expect) / def.expect : 0;
  console.log(`census ${def.year}: ${das.length} dissemination areas, population ${pop.toLocaleString('en-CA')} ${JSON.stringify(byMuni)}${def.expect ? ` (published ${def.expect.toLocaleString('en-CA')}, ${(off * 100).toFixed(2)}%)` : ''}`);
  if (def.expect && Math.abs(off) > 0.02) throw new Error(`census ${def.year}: Peel total ${pop} is more than 2% off the published ${def.expect}`);
  return {
    census: { year: def.year, date: def.date, source: def.source, outlines: def.outlines, fields: ['lng', 'lat', 'population', 'privateDwellings', 'occupiedDwellings', 'municipality', 'areaShares'], das },
    outlines: { year: def.year, date: def.date, source: def.source, fields: ['dauid', 'population', 'privateDwellings', 'municipality', 'rings'], das: outlines },
    refDas: outlines.map(([, , , csd, rings]) => ({ csd, rings })),
  };
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
      censuses: CENSUSES.map(c => ({ year: c.year, source: c.source, url: c.url })),
    },
  };
  data.secondaryPlans = await areas(LAYERS.secondaryPlans, 'sp');
  data.mtsas = await areas(LAYERS.mtsas, 'mtsa');
  const areaList = [...data.secondaryPlans, ...data.mtsas];
  data.censuses = [];
  let ref = null;
  for (const def of CENSUSES) {
    const c = await census(def, areaList, ref);
    if (!ref) ref = c.refDas;
    data.censuses.push(c.census);
    // Dissemination area outlines for the map layer (one file per census year).
    const daFile = path.join(outDir, def.outlines);
    fs.writeFileSync(daFile, JSON.stringify(c.outlines));
    console.log(`${def.outlines}: ${c.outlines.das.length} DA outlines, ${(fs.statSync(daFile).size / 1e6).toFixed(2)} MB`);
  }
  // Older app versions read `census` (2021).
  data.census = data.censuses[0];
  const file = path.join(outDir, 'areas.json');
  fs.writeFileSync(file, JSON.stringify(data));
  console.log(`areas.json: ${data.secondaryPlans.length} secondary plans / character areas, ${data.mtsas.length} MTSAs, ${data.census.das.length} DAs, ${(fs.statSync(file).size / 1e6).toFixed(2)} MB`);
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { insidePoint, simplify };
