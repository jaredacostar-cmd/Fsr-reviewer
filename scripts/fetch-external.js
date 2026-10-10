#!/usr/bin/env node
/*
 * Download the external open data the tracker uses beyond the municipal feeds (run on GitHub
 * Actions: these hosts aren't reachable from every network). Raw files go to --out; the build
 * scripts turn them into data/*.json.
 *   - Ontario Data Catalogue (CKAN): housing supply progress, Ministry of Finance population
 *     projections (49 census divisions), environmental compliance reports (municipal sewage)
 *   - Statistics Canada: CMHC housing starts / completions tables, rows for Peel's municipalities
 *   - Environment and Climate Change Canada: engineering IDF files for stations in and near Peel
 *   - MTO IDF curve lookup: landing page and scripts (to find its lookup endpoint)
 *   - MTO IDF coefficients (i = a·t^b, mm/h, t in hours) at each wastewater block's label point,
 *     from the lookup's 30-second grid files (data_xml/<lat>.xml)
 * Usage: node scripts/fetch-external.js --out ext-raw [--only mto]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const out = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'ext-raw'; })();
fs.mkdirSync(out, { recursive: true });
const log = [];
const note = (...a) => { const s = a.join(' '); console.log(s); log.push(s); };
const UA = { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/Fsr-reviewer)' };

async function get(url, { asText = false, timeout = 120000 } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { headers: UA, signal: ctl.signal, redirect: 'follow' });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return asText ? await r.text() : Buffer.from(await r.arrayBuffer());
  } finally { clearTimeout(t); }
}
async function save(url, file, opts) {
  try { const b = await get(url, opts); fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true }); fs.writeFileSync(path.join(out, file), b); note('ok  ', file, `${(b.length / 1024).toFixed(0)} kB`, url); return path.join(out, file); }
  catch (e) { note('FAIL', file, e.message, url); return null; }
}
const safe = s => s.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 90);

async function ckan(host, id, keep, maxMb = 80) {
  const url = `https://${host}/api/3/action/package_show?id=${id}`;
  let pkg;
  try { pkg = JSON.parse(await get(url, { asText: true })).result; } catch (e) { note('FAIL ckan', id, e.message); return; }
  fs.writeFileSync(path.join(out, `ckan-${id}.json`), JSON.stringify(pkg, null, 1));
  for (const r of pkg.resources || []) {
    const name = `${r.name || ''} ${r.url || ''}`;
    if (!/\.(csv|xlsx?|json)(\?|$)/i.test(r.url || '') && !/csv|xlsx/i.test(r.format || '')) continue;
    if (keep && !keep.test(name)) { note('skip', id, r.name); continue; }
    if (r.size && r.size > maxMb * 1e6) { note('skip (size)', id, r.name, r.size); continue; }
    await save(r.url, `${id}/${safe(r.name || path.basename(r.url))}${path.extname(r.url.split('?')[0]) || '.csv'}`, { timeout: 300000 });
  }
}

async function statcan(pid) {
  const zip = await save(`https://www150.statcan.gc.ca/n1/tbl/csv/${pid}-eng.zip`, `statcan/${pid}.zip`, { timeout: 300000 });
  if (!zip) return;
  const dir = path.join(out, 'statcan', pid); fs.mkdirSync(dir, { recursive: true });
  try { execFileSync('unzip', ['-o', '-q', zip, '-d', dir]); } catch (e) { note('FAIL unzip', pid, e.message); return; }
  fs.unlinkSync(zip);
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (!/\.csv$/i.test(f) || /MetaData/i.test(f)) continue;
    // Keep the header and the rows for Peel and its municipalities only.
    const keep = [];
    const lines = fs.readFileSync(p, 'utf8').split('\n');
    keep.push(lines[0]);
    for (const l of lines) if (/Mississauga|Brampton|Caledon|Peel|Toronto|"Ontario"/.test(l)) keep.push(l);
    fs.writeFileSync(path.join(out, 'statcan', `${pid}-peel.csv`), keep.join('\n'));
    note('    ', pid, 'rows kept', keep.length - 1, 'of', lines.length - 1);
    fs.unlinkSync(p);
  }
}

async function eccIdf() {
  const base = 'https://collaboration.cmc.ec.gc.ca/cmc/climate/Engineer_Climate/IDF/';
  let html; try { html = await get(base, { asText: true }); } catch (e) { note('FAIL idf index', e.message); return; }
  fs.writeFileSync(path.join(out, 'idf-index.html'), html);
  const vers = [...html.matchAll(/href="(idf_v[^"/]+\/)"/gi)].map(m => m[1]).sort();
  note('idf versions', vers.join(' '));
  const v = vers[vers.length - 1]; if (!v) return;
  let h2; try { h2 = await get(base + v, { asText: true }); } catch (e) { note('FAIL idf ver', e.message); return; }
  fs.writeFileSync(path.join(out, 'idf-ver.html'), h2);
  const sub = [...h2.matchAll(/href="([^"?/][^"]*\/)"/g)].map(m => m[1]);
  note('idf subdirs', sub.join(' '));
  for (const s of sub) {
    let h3; try { h3 = await get(base + v + s, { asText: true }); } catch { continue; }
    const on = [...h3.matchAll(/href="([^"]*ON[^"]*\.zip)"/g)].map(m => m[1]);
    for (const z of on) {
      const zp = await save(base + v + s + z, `idf/${safe(z)}`, { timeout: 600000 }); if (!zp) continue;
      const dir = path.join(out, 'idf', 'x'); fs.mkdirSync(dir, { recursive: true });
      try { execFileSync('unzip', ['-o', '-q', zp, '-d', dir]); } catch (e) { note('FAIL unzip idf', e.message); continue; }
      fs.unlinkSync(zp);
      // Keep stations in and around Peel.
      const walk = d => fs.readdirSync(d).flatMap(f => { const p = path.join(d, f); return fs.statSync(p).isDirectory() ? walk(p) : [p]; });
      for (const f of walk(dir)) {
        if (/PEARSON|TORONTO_INTL|TORONTO INTL|BRAMPTON|MISSISSAUGA|GEORGETOWN|BOLTON|ORANGEVILLE|CALEDON|6158733|6158731|615S001|6150689|6152695|6155878/i.test(f)) {
          const to = path.join(out, 'idf', path.basename(f)); fs.copyFileSync(f, to); note('    idf', path.basename(f));
        }
      }
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
}

// The MTO lookup's grid: 30-second cells, centred 15 seconds in (toGridCoordinate on the site).
function toGrid(c) {
  const neg = c < 0; let x = Math.abs(c);
  const d = Math.floor(x), m = (x - d) * 60, s = (m - Math.floor(m)) * 60;
  x = d + Math.floor(m) / 60 + (Math.floor(s) < 30 ? 1 / 240 : 1 / 80);
  return neg ? -x : x;
}
async function mtoIdf() {
  const blocks = JSON.parse(fs.readFileSync('data/blocks.json', 'utf8')).blocks;
  const rows = new Map(), out = { source: 'https://idfcurves.mto.gov.on.ca/', fetched: new Date().toISOString(), points: [] };
  for (const b of blocks) {
    const [lng, lat] = b.lp || b.c; const gl = toGrid(lat).toFixed(6), gn = toGrid(lng).toFixed(6);
    if (!rows.has(gl)) {
      try { rows.set(gl, await get(`https://idfcurves.mto.gov.on.ca/data_xml/${gl}.xml`, { asText: true })); note('ok   mto row', gl); }
      catch (e) { note('FAIL mto row', gl, e.message); rows.set(gl, ''); }
    }
    const xml = rows.get(gl), i = xml.indexOf(`id="${gl},${gn}"`) >= 0 ? xml.indexOf(`id="${gl},${gn}"`) : xml.indexOf(`id='${gl},${gn}'`);
    if (i < 0) { note('miss', b.id, gl, gn); continue; }
    const seg = xml.slice(i, xml.indexOf('</coord>', i));
    const periods = {};
    for (const m of seg.matchAll(/<period([^>]*)>/g)) {
      const at = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(x => [x[1], x[2]]));
      if (at.id) periods[at.id] = { a: +at.a, b: +at.b };
    }
    out.points.push({ block: b.id, lat: +gl, lng: +gn, periods });
  }
  fs.writeFileSync(path.join(out_dir(), 'mto-idf.json'), JSON.stringify(out, null, 1));
  note('mto points', out.points.length);
  // A sample of the raw format, for the record.
  const first = [...rows.values()].find(Boolean); if (first) fs.writeFileSync(path.join(out_dir(), 'mto-row-sample.xml'), first.slice(0, 20000));
  await save('https://idfcurves.mto.gov.on.ca/data_ext_msc/idf_lookup_msc.xml', 'mto/idf_lookup_msc.xml');
}
const out_dir = () => out;

(async () => {
  if (process.argv.includes('--only')) { await mtoIdf(); fs.writeFileSync(path.join(out, 'fetch-log-mto.txt'), log.join('\n') + '\n'); return; }
  // Ontario Data Catalogue
  for (const host of ['data.ontario.ca']) {
    await ckan(host, 'ontario-s-housing-supply-progress');
    await ckan(host, 'population-projections', /census div|division|49|CD/i);
    await ckan(host, 'environmental-compliance-reports', /sewage|wastewater|municipal/i, 200);
  }
  // CMHC starts / completions through Statistics Canada (several candidate tables; rows for Peel kept).
  for (const pid of ['34100148', '34100149', '34100154', '34100156', '34100135', '34100143']) await statcan(pid);
  await eccIdf();
  await save('https://idfcurves.mto.gov.on.ca/', 'mto/index.html', { asText: true });
  try {
    const h = fs.readFileSync(path.join(out, 'mto/index.html'), 'utf8');
    for (const m of h.matchAll(/(?:src|href)="([^"]+\.(?:js|aspx|php|shtml))"/g)) {
      const u = new URL(m[1], 'https://idfcurves.mto.gov.on.ca/').href;
      await save(u, `mto/${safe(path.basename(u))}`);
    }
  } catch (e) { note('mto', e.message); }
  fs.writeFileSync(path.join(out, 'fetch-log.txt'), log.join('\n') + '\n');
})();
