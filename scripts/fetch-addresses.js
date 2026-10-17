#!/usr/bin/env node
/*
 * Download the Region of Peel's address points (open data, about 504,000 points) for
 * scripts/build-addresses.js. Pages the FeatureServer 2,000 at a time by OBJECTID and writes
 * <out>/addresses/peel.json as compact rows:
 *   { fields: [...], rows: [[num, name, type, dir, muni, ropadrid, landUse, houseStyle, lat, lng], ...] }
 * Units (UNIT_IDENTIFIER) are dropped: one point per civic address is enough for matching.
 * Usage: node scripts/fetch-addresses.js --out ext-raw
 */
'use strict';
const fs = require('fs');
const path = require('path');

const LAYER = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services/Address_Points/FeatureServer/0';
const FIELDS = ['STREETNUM', 'STREETNAME', 'STREETTYPE', 'STREETDIRECTION', 'MUNICIPALITY', 'ROPADRID', 'LANDUSE', 'HOUSESTYLE', 'LATITUDE', 'LONGITUDE'];
const out = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'ext-raw'; })();
const UA = { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/peel-growth-pipeline)' };

async function getJson(url, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 90000);
      const r = await fetch(url, { headers: UA, signal: ctl.signal }); clearTimeout(t);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(JSON.stringify(j.error).slice(0, 200));
      return j;
    } catch (e) {
      if (i >= tries) throw e;
      await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
}

(async () => {
  const count = (await getJson(`${LAYER}/query?where=1%3D1&returnCountOnly=true&f=json`)).count;
  const meta = await getJson(`${LAYER}?f=json`);
  console.log('address points:', count);
  const rows = new Map();   // ROPADRID -> row (unit rows repeat the civic address)
  let last = -1, pages = 0;
  for (;;) {
    const q = `where=${encodeURIComponent(`OBJECTID>${last}`)}&outFields=OBJECTID,${FIELDS.join(',')}&orderByFields=OBJECTID&resultRecordCount=2000&returnGeometry=false&f=json`;
    const j = await getJson(`${LAYER}/query?${q}`);
    const fs_ = j.features || [];
    if (!fs_.length) break;
    for (const { attributes: a } of fs_) {
      last = Math.max(last, a.OBJECTID);
      if (a.LATITUDE == null || a.LONGITUDE == null || a.ROPADRID == null) continue;
      if (rows.has(a.ROPADRID)) continue;
      rows.set(a.ROPADRID, [a.STREETNUM || '', a.STREETNAME || '', a.STREETTYPE || '', a.STREETDIRECTION || '', a.MUNICIPALITY || '', a.ROPADRID,
        a.LANDUSE || '', a.HOUSESTYLE || '', +a.LATITUDE.toFixed(6), +a.LONGITUDE.toFixed(6)]);
    }
    if (++pages % 25 === 0) console.log(`  ${pages} pages, ${rows.size} addresses`);
  }
  // Guard: a short download must not replace a full one.
  if (rows.size < count * 0.5) { console.error(`REFUSED: only ${rows.size} addresses of ${count} points`); process.exit(1); }
  fs.mkdirSync(path.join(out, 'addresses'), { recursive: true });
  const file = path.join(out, 'addresses', 'peel.json');
  fs.writeFileSync(file, JSON.stringify({ source: LAYER, fetched: new Date().toISOString(), lastEdit: meta.editingInfo && meta.editingInfo.lastEditDate ? new Date(meta.editingInfo.lastEditDate).toISOString().slice(0, 10) : null,
    points: count, fields: ['num', 'name', 'type', 'dir', 'muni', 'ropadrid', 'landUse', 'houseStyle', 'lat', 'lng'], rows: [...rows.values()] }));
  console.log(`wrote ${file}: ${rows.size} civic addresses from ${count} points, ${pages} pages`);
})().catch(e => { console.error(e); process.exit(1); });
