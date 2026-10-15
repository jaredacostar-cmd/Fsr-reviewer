#!/usr/bin/env node
/*
 * Download the study-area maps of every EA project page (data/eas.json) for tracing:
 * images in the page body (study area / area of focus / location / figure / map) and linked
 * study-area figures (PDF / PNG / JPG). Writes <out>/<ea id>/<n>.<ext> and <out>/index.json.
 * The Probe workflow converts PDFs to PNG and pushes the folder to the ea-maps branch.
 * Usage: node scripts/fetch-ea-maps.js --out ea-maps
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./ea-lib.js');

const out = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'ea-maps'; })();
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; peel-dev-tracker; +https://github.com/jaredacostar-cmd/fsr-reviewer)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const MAPWORD = /study\s*area|area of focus|location|figure|map|key plan|area plan|boundary/i;
const SKIP = /logo|icon|social|banner|footer|header|accessib|twitter|facebook|youtube|linkedin|instagram/i;

async function get(url, binary) {
  for (let k = 0; k < 3; k++) {
    try {
      const r = await fetch(url, { headers: UA, redirect: 'follow' });
      if (r.ok) return binary ? { buf: Buffer.from(await r.arrayBuffer()), type: r.headers.get('content-type') || '' } : await r.text();
      if (r.status === 404) return null;
    } catch { /* retry */ }
    await sleep(1000 * (k + 1));
  }
  return null;
}

async function main() {
  const eas = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'eas.json'), 'utf8')).eas;
  fs.mkdirSync(out, { recursive: true });
  const index = [];
  for (const e of eas) {
    const page = e.links && e.links.page;
    const entry = { id: e.id, name: e.name, page, geomType: e.geomType, files: [] };
    index.push(entry);
    if (!page) continue;
    const html = await get(page);
    if (!html) { entry.error = 'page unreachable'; continue; }
    const main = E.mainHtml(html);
    const cands = [];
    // Images in the body, with their alt text and nearby caption.
    for (const m of main.matchAll(/<img\b[^>]*>/gi)) {
      const tag = m[0];
      const src = (/\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1] || (/\bdata-src\s*=\s*["']([^"']+)["']/i.exec(tag) || [])[1];
      if (!src || SKIP.test(src)) continue;
      const alt = E.text((/\balt\s*=\s*["']([^"']*)["']/i.exec(tag) || [])[1] || '');
      const around = E.text(main.slice(Math.max(0, m.index - 300), m.index + tag.length + 300));
      let u; try { u = new URL(src.replace(/&amp;/g, '&'), page).href; } catch { continue; }
      cands.push({ url: u, label: alt || around.slice(0, 120), kind: 'img', score: MAPWORD.test(alt) ? 3 : MAPWORD.test(around) ? 2 : 1 });
    }
    // Linked figures.
    for (const l of E.links(main, page)) {
      if (!/\.(pdf|png|jpe?g)(\?|$)/i.test(l.url)) continue;
      const lab = `${l.label} ${decodeURIComponent(l.url.split('/').pop())}`;
      if (!MAPWORD.test(lab) || /notice|report|appendi|boards|presentation|summary|minutes|newsletter/i.test(lab) && !/study\s*area|figure 1/i.test(lab)) continue;
      cands.push({ url: l.url, label: l.label, kind: 'link', score: /study\s*area/i.test(lab) ? 4 : 2 });
    }
    const seen = new Set();
    const pick = cands.sort((a, b) => b.score - a.score).filter(c => !seen.has(c.url) && seen.add(c.url)).slice(0, 4);
    fs.mkdirSync(path.join(out, e.id), { recursive: true });
    let n = 0;
    for (const c of pick) {
      const r = await get(c.url, true);
      if (!r || r.buf.length < 3000 || r.buf.length > 25e6) continue;
      const ext = /pdf/.test(r.type) || /\.pdf/i.test(c.url) ? 'pdf' : /png/.test(r.type) ? 'png' : /webp/.test(r.type) ? 'webp' : 'jpg';
      const f = `${++n}.${ext}`;
      fs.writeFileSync(path.join(out, e.id, f), r.buf);
      entry.files.push({ file: f, url: c.url, label: c.label.slice(0, 160), kind: c.kind, score: c.score });
      await sleep(250);
    }
    console.log(`${String(entry.files.length).padStart(2)} ${e.id}`);
    await sleep(250);
  }
  fs.writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 1));
  console.log(`EAs: ${index.length}; with a map file: ${index.filter(x => x.files.length).length}; files: ${index.reduce((s, x) => s + x.files.length, 0)}`);
}
main().catch(e => { console.error(e); process.exit(1); });
