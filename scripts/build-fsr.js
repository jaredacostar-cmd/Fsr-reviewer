#!/usr/bin/env node
/*
 * Build data/fsr.json: the latest Functional Servicing Report (FSR) posted for each development
 * application, from the municipalities' application pages.
 *   - Mississauga: every page under development-applications/.../development-application-<file>/,
 *     whose "Project documents" list the submissions (original and later ones).
 *   - Caledon: the application pages linked from town-services/development-applications.aspx,
 *     with the submissions' PDFs.
 *   - Brampton posts its documents on BramPlanOnline (sign-in), so it has no public links.
 * Each page's file numbers (OZ/OPA 22-32 W1, 21T-M 26-3, 21T-24009C, 2026-0016 …) are normalised
 * the way the snapshot's fileKey is (letters and numbers, the ward left out), so the app can match
 * them to an application. The FSR is the newest document named functional servicing / servicing
 * report / servicing brief (by the date in its name, else the last one listed).
 * Refuses to write (exit 1, the old file stays) when a municipality has fewer than 70% of the
 * pages it had in the previous data/fsr.json.
 * Usage: node scripts/build-fsr.js --out data
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { countBy, shrunkGroups } = require('./build-guards.js');

const outDir = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'data'; })();
const UA = { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/peel-growth-pipeline)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(url, { headers: UA, redirect: 'follow' }); if (r.ok) return await r.text(); if (r.status === 404) { if (/mississauga/.test(url) && (get.n = (get.n || 0) + 1) <= 3) console.log('  404', url.slice(-90)); return null; } }
    catch (e) { /* retry */ }
    await sleep(1000 * (k + 1));
  }
  return null;
}
const text = h => h.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&nbsp;|&#160;/g, ' ').replace(/&#8211;|&ndash;/g, '–').replace(/\s+/g, ' ').trim();
function links(html, base) {
  const out = [];
  for (const m of html.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    let u; try { u = new URL(m[1].replace(/&amp;/g, '&'), base).href; } catch { continue; }
    out.push({ url: u, label: text(m[2]) });
  }
  return out;
}
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12, january: 1, february: 2, march: 3, april: 4, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function docDate(s) {
  let m = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*(?:\d{1,2},?\s*)?(20\d\d)\b/i.exec(s);
  if (m) return `${m[2]}-${String(MONTHS[m[1].toLowerCase()] || MONTHS[m[1].toLowerCase().slice(0, 3)]).padStart(2, '0')}`;
  m = /\b(\d{2})\.(\d{2})\.(20\d\d)\b/.exec(s); if (m) return `${m[3]}-${m[1] === '00' ? m[2] : m[1]}`;
  m = /\b(20\d\d)[-._](\d{2})[-._]\d{2}\b/.exec(s); if (m) return `${m[1]}-${m[2]}`;
  m = /\b(20\d\d)\b/.exec(s); return m ? m[1] : null;
}
const IS_FSR = /functional\s+servic|servicing\s+(and\s+stormwater\s+)?(management\s+)?(report|brief|study)|\bFSR\b|site\s+servicing\s+(report|brief)/i;
const isDoc = u => /\.pdf(\?|$)|\/file\/|\.ashx|document\.aspx|\/documents?\//i.test(u);
// File numbers on a page, normalised like the snapshot's fileKey.
function fileKeys(s) {
  const keys = new Set();
  for (const m of s.matchAll(/\b(OZ\s*\/\s*OPA|OZ|OPA|21T-M|21T|SPM|SP|CD|21CDM|POPA|RZ|SPA|DPC|OZS)[\s-]*(20\d\d[\s-]+\d{3,4}|\d{2}[\s/-]+\d{1,4}|\d{4,5}[A-Z]?)\b/gi)) {
    const parts = `${m[1]} ${m[2]}`.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(x => /^\d+$/.test(x) ? String(+x) : x);
    keys.add(parts.join('|'));
  }
  for (const m of s.matchAll(/\b(20\d\d)-(\d{4})\b/g)) keys.add(`${m[1]}|${+m[2]}`);   // Caledon 2026-0016
  return [...keys];
}
// File numbers in a Mississauga page address: development-application-oz-opa-25-16-w8,
// …-oz-24-5-w10-and-21t-m-24-2-w10 (the ward left out).
function slugKeys(u) {
  const m = /development-application-([a-z0-9-]+?)\/?$/i.exec(u); if (!m) return [];
  return m[1].split('-and-').map(part => part.split('-').filter(t => !/^w\d+$/i.test(t)).map(t => /^\d+$/.test(t) ? String(+t) : t.toUpperCase()).join('|')).filter(k => /\d/.test(k) && /^[A-Z0-9]/.test(k));
}
function pick(docs) {
  const f = docs.filter(d => IS_FSR.test(d.label) || IS_FSR.test(decodeURIComponent(d.url)));
  if (!f.length) return null;
  const withD = f.map((d, i) => ({ ...d, date: docDate(`${d.label} ${decodeURIComponent(d.url)}`), i }));
  withD.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.i - a.i);
  const best = withD[0];
  return { title: best.label || decodeURIComponent(best.url.split('/').pop()), url: best.url, date: best.date, count: f.length };
}

// The page's own content: from its title (h1) on, so menus and footers don't add file numbers.
function mainText(html) { const i = html.search(/<h1[\s>]/i); return text(i >= 0 ? html.slice(i) : html); }
// File numbers on most pages come from menus and banners: drop them, and listing pages (many files).
function cleanKeys(items) {
  const n = new Map(); for (const it of items) for (const k of it.keys) n.set(k, (n.get(k) || 0) + 1);
  const common = new Set([...n].filter(([, c]) => c > Math.max(3, items.length * 0.25)).map(([k]) => k));
  return items.map(it => ({ ...it, keys: it.keys.filter(k => !common.has(k)) })).filter(it => it.keys.length && it.keys.length <= 8);
}
async function sitemapUrls(index, re) {
  const out = new Set(), seen = new Set(), queue = [index];
  while (queue.length && seen.size < 60) {
    const u = queue.shift(); if (seen.has(u)) continue; seen.add(u);
    const x = await get(u); if (!x) continue;
    for (const m of x.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) { const v = m[1].replace(/&amp;/g, '&'); if (/\.xml(\?|$)/i.test(v)) queue.push(v); else if (re.test(v)) out.add(v); }
  }
  return out;
}
async function mississauga() {
  const lists = ['https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/active-development-applications/',
    'https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/development-applications-in-process/'];
  const pages = new Set();
  for (const l of lists) {
    const h = await get(l); if (!h) { console.log('mis list failed', l); continue; }
    const all = links(h, l); console.log('mis list', l, 'links', all.length, 'matching', all.filter(a => /development-application-/i.test(a.url)).length);
    for (const a of all) if (/\/development-application-[^/]+\/?$/i.test(new URL(a.url).pathname)) pages.add(a.url.split('#')[0]);
  }
  // The listing is filled in by script: find the pages through the site's WordPress search, and
  // by their address pattern (development-application-oz-opa-22-32-w1) from the snapshot's files.
  const BASE = 'https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/active-development-applications/';
  for (let pg = 1; pg <= 6; pg++) {
    const j = await get(`https://www.mississauga.ca/wp-json/wp/v2/pages?search=development%20application&per_page=100&page=${pg}&_fields=link`);
    let arr = []; try { arr = JSON.parse(j || '[]'); } catch { arr = []; }
    if (!Array.isArray(arr) || !arr.length) break;
    for (const x of arr) if (x.link && /\/development-application-[^/]+\/?$/i.test(x.link)) pages.add(x.link);
  }
  console.log('mis wp search', pages.size);
  const keyOf = new Map();
  try {
    const snap = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'snapshot.json'), 'utf8'));
    const ward = new Map();
    for (const r of snap.records) if (r.municipality === 'Mississauga' && r.ward && r.fileKey) ward.set(r.fileKey, r.ward);
    for (const r of snap.records) {
      if (r.municipality !== 'Mississauga' || r.kind !== 'application' || !r.fileKey || !/^(OZ|21T)\|/.test(r.fileKey)) continue;
      const w = r.ward || ward.get(r.fileKey); if (!w) continue;
      const slug = r.fileKey.split('|').map(x => x.toLowerCase()).join('-').replace(/^21t-m-/, '21t-m-');
      const u = `${BASE}development-application-${slug}-w${w}/`; pages.add(u); keyOf.set(u, r.fileKey);
    }
  } catch (e) { console.log('snapshot read failed', e.message); }
  console.log('mis candidate pages', pages.size);
  console.log('mississauga pages', pages.size);
  process.on('exit', () => {});
  const out = []; let failed = 0, shown = 0;
  for (const u of pages) {
    const h = await get(u); await sleep(300); if (!h) { failed++; continue; }
    const title = text((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || '');
    // The application pages are drawn in the browser: the server answers a real one with the
    // listing's shell (and an unknown one with 404), so a page that exists is linked as it is.
    if (/^active development applications$/i.test(title)) {
      const ks = keyOf.has(u) ? [keyOf.get(u)] : slugKeys(u);
      if (ks.length) { out.push({ muni: 'Mississauga', page: u, title: `Development application ${ks.map(k => k.replace(/\|/g, ' ')).join(' and ')}`, keys: ks, docs: null, fsr: null, browserPage: true }); continue; }
    }
    if (!/development application/i.test(title) || /^active development applications$/i.test(title)) { if (failed++ < 4) console.log('  mis skipped', u.split('/').slice(-2).join('/'), '| title:', title.slice(0, 60), '| canonical:', ((/<link[^>]+rel="canonical"[^>]+href="([^"]+)"/i.exec(h) || [])[1] || '').slice(-80)); continue; }   // moved: redirected to the listing
    const docs = links(h, u).filter(a => isDoc(a.url));
    const keys = fileKeys(`${title} ${mainText(h).slice(0, 3000)}`);
    if (shown++ < 5) console.log('  mis page', u.split('/').slice(-2).join('/'), '| title:', title.slice(0, 80), '| keys:', keys.join(','), '| docs:', docs.length, '| all links:', links(h, u).length);
    out.push({ muni: 'Mississauga', page: u, title, keys, docs: docs.length, fsr: pick(docs) });
  }
  console.log('mis fetched', out.length, 'failed', failed);
  return cleanKeys(out);
}
async function caledon() {
  const skip = /resources|development-applications|current-applications|planning|building|zoning|heritage|committee|bylaw|by-law|advertis|moraine|subdivisions/i;
  const pages = new Set();
  for (const l of ['https://www.caledon.ca/en/town-services/current-applications.aspx', 'https://www.caledon.ca/en/town-services/development-applications.aspx']) {
    const h0 = await get(l); if (!h0) { console.log('cal list failed', l); continue; }
    for (const u of links(h0, l).map(a => a.url.split('#')[0])) if (/caledon\.ca\/en\/town-services\/[^/]+\.aspx$/i.test(u) && !skip.test(u.split('/').pop())) pages.add(u);
  }
  console.log('caledon pages', pages.size);
  const out = [];
  for (const u of pages) {
    const h = await get(u); await sleep(250); if (!h) continue;
    const title = text((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || '');
    const keys = fileKeys(`${title} ${mainText(h).slice(0, 2500)}`); if (!keys.length) continue;
    const docs = links(h, u).filter(a => isDoc(a.url));
    out.push({ muni: 'Caledon', page: u, title, keys, docs: docs.length, fsr: pick(docs) });
  }
  return cleanKeys(out);
}

(async () => {
  const items = [...await mississauga(), ...await caledon()];
  const doc = { version: 1, generatedAt: new Date().toISOString(),
    sources: { Mississauga: 'mississauga.ca development application pages (Project documents)', Caledon: 'caledon.ca development application pages', Brampton: 'not public: documents are on BramPlanOnline (sign-in)' },
    items };
  fs.mkdirSync(outDir, { recursive: true });
  let prev = null;
  try { prev = JSON.parse(fs.readFileSync(path.join(outDir, 'fsr.json'), 'utf8')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const short = prev ? shrunkGroups(countBy(items, 'muni'), countBy(prev.items, 'muni'), 0.7) : [];
  if (short.length) {
    console.error(`REFUSED: ${short.map(g => `${g.key} ${g.n} pages against ${g.prev}`).join('; ')} (under 70% of the previous fsr.json); kept ${path.join(outDir, 'fsr.json')}`);
    process.exit(1);
  }
  fs.writeFileSync(path.join(outDir, 'fsr.json'), JSON.stringify(doc));
  const n = m => items.filter(x => x.muni === m), f = m => n(m).filter(x => x.fsr).length;
  console.log(`fsr.json: Mississauga ${n('Mississauga').length} pages (${f('Mississauga')} with an FSR), Caledon ${n('Caledon').length} pages (${f('Caledon')} with an FSR)`);
  for (const x of items.slice(0, 12)) console.log(' ', x.muni, x.keys.join(','), x.fsr ? `${x.fsr.date} ${x.fsr.title}` : '-', x.page);
})();
