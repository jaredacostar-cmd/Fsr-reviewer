#!/usr/bin/env node
/*
 * Region of Peel open data: housing construction activity (starts, completions, absorbed — CMHC's
 * Starts and Completions Survey, as the Region publishes it) and building permit statistics
 * (units by type and permit values), per municipality and year.
 *   node scripts/build-peel-housing.js --out data
 * Writes <out>/peel-housing.json. One value per municipality and year: the Region's annual row,
 * or its quarters added up when the year has no annual row (marked with the quarters counted).
 * The CMHC series already in data/housing.json is compared year by year: where both hold a year,
 * the app keeps one (this file's) and the comparison is recorded here.
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ORG = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
const ACTIVITY = `${ORG}/HousingConstructionActivity/FeatureServer/0`;
const PERMITS = `${ORG}/Building_Permits/FeatureServer/0`;
const MUNIS = ['Peel', 'Mississauga', 'Brampton', 'Caledon'];
const q = o => new URLSearchParams(o).toString();

async function rows(url) {
  const all = [];
  for (let off = 0; off < 50000; off += 1000) {
    const r = await (await fetch(`${url}/query?${q({ where: '1=1', outFields: '*', returnGeometry: false, resultOffset: off, resultRecordCount: 1000, f: 'json' })}`)).json();
    if (r.error) throw new Error(`${url}: ${JSON.stringify(r.error)}`);
    all.push(...r.features.map(f => f.attributes));
    if (r.features.length < 1000 && !r.exceededTransferLimit) break;
  }
  const info = await (await fetch(`${url}?f=json`)).json();
  return { rows: all, edited: info.editingInfo && info.editingInfo.lastEditDate ? new Date(info.editingInfo.lastEditDate).toISOString().slice(0, 10) : null };
}

// Rows of one place and year -> one value: the annual row, else the quarters added up.
function byYear(list, placeOf, valueOf) {
  const out = {};
  for (const m of MUNIS) {
    const mine = list.filter(r => String(placeOf(r) || '').trim().toLowerCase() === m.toLowerCase() && r.Year > 0);
    const years = [...new Set(mine.map(r => r.Year))].sort();
    if (!years.length) continue;
    out[m] = {};
    for (const y of years) {
      const ofY = mine.filter(r => r.Year === y);
      const annual = ofY.find(r => !r.Quarter || /annual|year|total/i.test(r.Quarter));
      if (annual) { out[m][y] = valueOf([annual]); continue; }
      const qs = new Map(); for (const r of ofY) qs.set(String(r.Quarter).replace(/\D/g, ''), r);   // a repeated quarter counts once
      out[m][y] = { ...valueOf([...qs.values()]), quarters: qs.size };
    }
  }
  return out;
}
const sum = (rs, k) => rs.reduce((t, r) => t + (Number(r[k]) || 0), 0);
const mix = (rs, pre, single = 'Singles') => ({ single: sum(rs, `${pre}_${single}`), semi: sum(rs, `${pre}_Semi`), row: sum(rs, `${pre}_Row`), apartment: sum(rs, `${pre}_Apartments`), all: sum(rs, `${pre}_Total`) });

async function main() {
  const outDir = process.argv[process.argv.indexOf('--out') + 1] || 'data';
  const A = await rows(ACTIVITY), P = await rows(PERMITS);
  const activity = byYear(A.rows, r => r.Municipality, rs => ({ starts: mix(rs, 'Starts'), completions: mix(rs, 'Completions', 'Single'), absorbed: mix(rs, 'Absorbed') }));
  const permits = byYear(P.rows, r => r.Geography, rs => ({
    units: { single: sum(rs, 'Single_Units'), semi: sum(rs, 'Double_Units'), row: sum(rs, 'Row_Units'), apartment: sum(rs, 'Apartment_Units'), all: sum(rs, 'Total_Units') },
    value: { residential: sum(rs, 'Residential_Value'), nonResidential: sum(rs, 'NonResidential_Value'), industrial: sum(rs, 'Industrial_Value'), commercial: sum(rs, 'Commercial_Value'), institutional: sum(rs, 'Institutional_Value'), total: sum(rs, 'TotalPermits_Value') },
  }));
  // Compare with the CMHC series already in data/housing.json: where both hold a year, keep one.
  let cmhc = null; try { cmhc = JSON.parse(fs.readFileSync(path.join(outDir, 'housing.json'), 'utf8')).cmhc; } catch { /* none */ }
  const compare = {};
  for (const k of ['starts', 'completions']) {
    const same = [], differ = [], onlyPeel = [], onlyCmhc = [];
    for (const m of ['Mississauga', 'Brampton', 'Caledon']) {
      const C = (cmhc && cmhc[k] && cmhc[k][m]) || {}, R = activity[m] || {};
      for (const y of new Set([...Object.keys(C), ...Object.keys(R)])) {
        const c = C[y] && C[y].all, r = R[y] && !R[y].quarters ? R[y][k].all : null;
        if (c != null && r != null) (c === r ? same : differ).push(c === r ? `${m} ${y}` : `${m} ${y}: CMHC ${c}, Peel ${r}`);
        else if (r != null) onlyPeel.push(`${m} ${y}`); else if (c != null) onlyCmhc.push(`${m} ${y}`);
      }
    }
    compare[k] = { same: same.length, differ, onlyPeel: onlyPeel.length, onlyCmhc };
    console.log(`${k}: ${same.length} municipality-years identical, ${differ.length} differ, ${onlyPeel.length} only in Peel's table, ${onlyCmhc.length} only in CMHC's${differ.length ? `\n  differ: ${differ.slice(0, 20).join('; ')}` : ''}`);
  }
  const out = {
    version: 1, built: new Date().toISOString().slice(0, 10),
    activity: { source: 'Region of Peel – Housing Construction Activity (CMHC Starts and Completions Survey)', url: ACTIVITY.replace('/query', ''), edited: A.edited, muni: activity },
    permits: { source: 'Region of Peel – Building Permits (units and values by municipality)', url: PERMITS, edited: P.edited, muni: permits },
    compare,
  };
  fs.writeFileSync(path.join(outDir, 'peel-housing.json'), JSON.stringify(out));
  for (const m of MUNIS) {
    const ay = Object.keys(activity[m] || {}), py = Object.keys(permits[m] || {});
    console.log(`${m}: activity ${ay[0]}–${ay[ay.length - 1]} (${ay.length} years), permits ${py[0]}–${py[py.length - 1]} (${py.length} years)`);
  }
}
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { byYear, mix };
