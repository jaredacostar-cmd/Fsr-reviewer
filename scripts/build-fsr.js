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
 * Usage: node scripts/build-fsr.js --out data
 */
'use strict';
const fs = require('fs');
const path = require('path');

const outDir = (() => { const i = process.argv.indexOf('--out'); return i > 0 ? process.argv[i + 1] : 'data'; })();
const UA = { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/Fsr-reviewer)' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(url) {
  for (let k = 0; k < 3; k++) {
    try { const r = await fetch(url, { headers: UA, redirect: 'follow' }); if (r.ok) return await r.text(); if (r.status === 404) return null; }
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
  for (const m of s.matchAll(/\b(OZ\s*\/\s*OPA|OZ|OPA|21T-M|21T|SPM|SP|CD|21CDM|POPA|RZ|SPA|DPC|OZS)[\s-]*(\d{2}[\s/-]+\d{1,4}|\d{4,5}[A-Z]?|20\d\d[\s-]+\d{3,4})\b/gi)) {
    const parts = `${m[1]} ${m[2]}`.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map(x => /^\d+$/.test(x) ? String(+x) : x);
    keys.add(parts.join('|'));
  }
  for (const m of s.matchAll(/\b(20\d\d)-(\d{4})\b/g)) keys.add(`${m[1]}|${+m[2]}`);   // Caledon 2026-0016
  return [...keys];
}
function pick(docs) {
  const f = docs.filter(d => IS_FSR.test(d.label) || IS_FSR.test(decodeURIComponent(d.url)));
  if (!f.length) return null;
  const withD = f.map((d, i) => ({ ...d, date: docDate(`${d.label} ${decodeURIComponent(d.url)}`), i }));
  withD.sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.i - a.i);
  const best = withD[0];
  return { title: best.label || decodeURIComponent(best.url.split('/').pop()), url: best.url, date: best.date, count: f.length };
}

async function mississauga() {
  const lists = ['https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/active-development-applications/',
    'https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/development-applications-in-process/'];
  const pages = new Set();
  for (const l of lists) {
    const h = await get(l); if (!h) { console.log('mis list failed', l); continue; }
    for (const a of links(h, l)) if (/\/development-application-[^/]+\/?$/i.test(new URL(a.url).pathname)) pages.add(a.url.split('#')[0]);
  }
  console.log('mississauga pages', pages.size);
  const out = [];
  for (const u of pages) {
    const h = await get(u); await sleep(250); if (!h) continue;
    const title = text((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || '');
    const docs = links(h, u).filter(a => isDoc(a.url));
    const keys = fileKeys(`${title} ${text(h).slice(0, 4000)}`);
    out.push({ muni: 'Mississauga', page: u, title, keys, docs: docs.length, fsr: pick(docs) });
  }
  return out;
}
async function caledon() {
  const l = 'https://www.caledon.ca/en/town-services/development-applications.aspx';
  const h0 = await get(l); if (!h0) { console.log('cal list failed'); return []; }
  const skip = /resources|development-applications|planning|building|zoning|heritage|committee|bylaw|by-law/i;
  const pages = new Set(links(h0, l).map(a => a.url.split('#')[0]).filter(u => /caledon\.ca\/en\/town-services\/[^/]+\.aspx$/i.test(u) && !skip.test(u.split('/').pop())));
  console.log('caledon pages', pages.size);
  const out = [];
  for (const u of pages) {
    const h = await get(u); await sleep(250); if (!h) continue;
    const title = text((/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || '');
    const body = text(h);
    const keys = fileKeys(body.slice(0, 6000)); if (!keys.length) continue;
    const docs = links(h, u).filter(a => isDoc(a.url));
    out.push({ muni: 'Caledon', page: u, title, keys, docs: docs.length, fsr: pick(docs) });
  }
  return out;
}

(async () => {
  const items = [...await mississauga(), ...await caledon()];
  const doc = { version: 1, generatedAt: new Date().toISOString(),
    sources: { Mississauga: 'mississauga.ca development application pages (Project documents)', Caledon: 'caledon.ca development application pages', Brampton: 'not public: documents are on BramPlanOnline (sign-in)' },
    items };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'fsr.json'), JSON.stringify(doc));
  const n = m => items.filter(x => x.muni === m), f = m => n(m).filter(x => x.fsr).length;
  console.log(`fsr.json: Mississauga ${n('Mississauga').length} pages (${f('Mississauga')} with an FSR), Caledon ${n('Caledon').length} pages (${f('Caledon')} with an FSR)`);
  for (const x of items.slice(0, 12)) console.log(' ', x.muni, x.keys.join(','), x.fsr ? `${x.fsr.date} ${x.fsr.title}` : '-', x.page);
})();
