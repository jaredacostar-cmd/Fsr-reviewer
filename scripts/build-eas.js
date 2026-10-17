#!/usr/bin/env node
/*
 * Build data/eas.json, data/eas-review.csv (Region of Peel environmental assessments).
 *   1. Parse the list page (peelregion.ca … list-of-environment-assessments); de-duplicate.
 *   2. Find each EA's project page (link on the list, else the best-matching page found under the
 *      Region's EA sections and sitemap); read schedule, milestones, status, next step, report /
 *      appendix / notice links. No page → status unknown, flagged. Contact blocks are never read.
 *   3. Geometry: facility point → road centreline between cross streets (OpenStreetMap) → DC mains /
 *      capital lines on the named street → settlement / secondary plan boundary → approximate point.
 *   4. Link to DC projects with an EA phase and to capital records (when data/capital.json exists).
 *   5. Page hashes are compared with the previous data/eas.json → `changes` (for This week).
 *   data/eas-overrides.json applies last (purpose / decision lines, traced boundaries, fixes).
 * Usage: node scripts/build-eas.js --out data [--capital path/to/capital.json] [--today YYYY-MM-DD]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('./ea-lib.js');
const C = require('./capital-lib.js');
const F = require('./facilities-lib.js');
const PV = require('../js/privacy.js');

const LIST_URL = 'https://peelregion.ca/construction/environmental-assessments/list-of-environment-assessments';
const SEEDS = [
  LIST_URL,
  'https://peelregion.ca/',
  'https://peelregion.ca/public-works',
  'https://peelregion.ca/construction-projects',
  'https://peelregion.ca/water',
  'https://peelregion.ca/wastewater',
  'https://peelregion.ca/construction/environmental-assessments',
  'https://peelregion.ca/public-works/environmental-assessments/',
  'https://peelregion.ca/public-works/environmental-assessments/brampton/',
  'https://peelregion.ca/public-works/environmental-assessments/caledon/',
  'https://peelregion.ca/public-works/environmental-assessments/mississauga/',
  'https://peelregion.ca/construction',
];
const SITEMAPS = ['https://peelregion.ca/sitemap.xml'];
const EA_PATH = /environmental-assessment|\/construction\/|\/public-works\/(environmental|ea)|\/water\/|\/wastewater\/|\/transportation\//i;
const PEEL_BBOX = [43.45, -80.1, 44.0, -79.5];  // S, W, N, E

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const outDir = arg('--out') || 'data';
const today = arg('--today') || new Date().toISOString().slice(0, 10);
const root = path.join(__dirname, '..');
const UA = { 'user-agent': 'Mozilla/5.0 (compatible; peel-dev-tracker; +https://github.com/jaredacostar-cmd/fsr-reviewer)', accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-CA,en;q=0.9' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };

const cache = new Map();
async function get(url, { json = false, body, tries = 3 } = {}) {
  const key = `${url}|${body || ''}`;
  if (cache.has(key)) return cache.get(key);
  let out = null;
  for (let k = 0; k < tries; k++) {
    try {
      const r = await fetch(url, body ? { method: 'POST', headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' }, body } : { headers: UA, redirect: 'follow' });
      if (r.ok) { out = json ? await r.json() : await r.text(); if (!json) out = { html: out, url: r.url }; break; }
      if (body || (get.log && (get.logged = (get.logged || 0) + 1) <= 40)) console.log(`  HTTP ${r.status} ${url.slice(0, 120)}${body ? ` ${(await r.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 160)}` : ''}`);
      if (r.status === 404 || r.status === 410) break;
    } catch (e) { if (body || (get.log && (get.logged = (get.logged || 0) + 1) <= 40)) console.log(`  fetch error ${e.cause?.code || e.message} ${url.slice(0, 120)}`); }
    await sleep(1200 * (k + 1));
  }
  cache.set(key, out);
  return out;
}

// Candidate project pages: links from the seeds (two levels deep within the EA sections) + sitemap.
async function candidates() {
  const found = new Map();
  const queue = SEEDS.map(u => [u, 0]);
  const seen = new Set();
  while (queue.length && seen.size < 400) {
    const [u, depth] = queue.shift();
    if (seen.has(u)) continue;
    seen.add(u);
    const r = await get(u);
    if (!r) continue;
    const title = (/<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(r.html) || [])[1];
    if (u !== LIST_URL) found.set(r.url, { url: r.url, title: title ? E.text(title) : '', label: found.get(u)?.label || '', html: r.html });
    for (const l of E.links(E.mainHtml(r.html), r.url)) {
      if (!/^https?:\/\/(www\.)?peelregion\.ca\//i.test(l.url) || /\.(pdf|docx?|xlsx?|jpg|png)(\?|$)/i.test(l.url)) continue;
      if (!found.has(l.url)) found.set(l.url, { url: l.url, label: l.label, title: '' });
      if (depth < 2 && (/environmental|construction/i.test(l.url) || (depth === 0 && /environment|construction|public works/i.test(l.label)))) queue.push([l.url, depth + 1]);
    }
    await sleep(250);
  }
  for (const sm of SITEMAPS) {
    const r = await get(sm);
    if (!r) continue;
    const locs = [...r.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1]);
    const subs = locs.filter(u => /sitemap.*\.xml/i.test(u));
    for (const s of subs.slice(0, 20)) { const x = await get(s); if (x) locs.push(...[...x.html.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map(m => m[1])); }
    for (const u of locs) if (EA_PATH.test(u) && !found.has(u)) found.set(u, { url: u, label: '', title: '' });
  }
  console.log(`Candidate pages: ${found.size} (${[...found.values()].filter(c => /environmental-assessment/i.test(c.url)).length} under environmental-assessments)`);
  return [...found.values()];
}

// ---- OpenStreetMap helpers (road centrelines, approximate places) ------------------------------
const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter'];
async function osmWays(name) {
  const core = C.streetTokens(name);
  if (!core.length) return [];
  const num = /^(highway|hwy|regional road|rr)\s*(\d+)/i.exec(name);
  const re = core.map(t => t.replace(/[^A-Z0-9]/g, '')).join('.*');
  const [s, w, n, e] = PEEL_BBOX;
  const q = `[out:json][timeout:90];(way["highway"]["name"~"${re}",i](${s},${w},${n},${e});${num ? `way["highway"]["ref"~"^${num[2]}$"](${s},${w},${n},${e});` : ''});out geom;`;
  let j = null;
  for (const ep of OVERPASS.slice(osmWays.ep || 0)) {
    j = await get(ep, { json: true, body: `data=${encodeURIComponent(q)}`, tries: 2 });
    if (j) break;
    osmWays.ep = (osmWays.ep || 0) + 1;   // this mirror failed: move on for the rest of the run
    console.log(`  Overpass mirror failed, next: ${OVERPASS[osmWays.ep] || 'none'}`);
  }
  await sleep(1500);
  osmWays.n = (osmWays.n || 0) + 1;
  if (osmWays.n <= 30) console.log(`  OSM "${name}": ${j ? `${(j.elements || []).length} ways${j.remark ? ` (${j.remark.slice(0, 80)})` : ''}` : 'request failed'}`);
  return ((j && j.elements) || []).filter(el => el.geometry && (C.sameStreet(name, el.tags?.name || '') || (num && el.tags?.ref === num[2]))).map(el => el.geometry.map(p => [p.lon, p.lat]));
}
async function nominatim(q) {
  const j = await get(`https://nominatim.openstreetmap.org/search?${new URLSearchParams({ q, format: 'json', limit: 1, countrycodes: 'ca', viewbox: `${PEEL_BBOX[1]},${PEEL_BBOX[2]},${PEEL_BBOX[3]},${PEEL_BBOX[0]}`, bounded: 1 })}`, { json: true });
  await sleep(1100);
  return j && j[0] ? { lnglat: [+(+j[0].lon).toFixed(6), +(+j[0].lat).toFixed(6)], label: j[0].display_name.split(',').slice(0, 2).join(',') } : null;
}
const GENERIC = /\b(class|municipal|environmental|assessment|ea|study|schedule [abc]\+?|improvements?|widening|reconstruction|expansion|upgrades?|new|sanitary|sewer|trunk|water ?main|feedermain|transmission main|pumping station|reservoir|elevated tank|servicing|master plan|phase \d+|and|the|of|for|\d+-?mm)\b/gi;

// Facility points: water facilities, wastewater pumping stations and plants, DC capital map facilities.
function facilityPoints() {
  const sv = readJSON(path.join(root, 'data', 'servicing.json'), {});
  return F.registry({ waterFacilities: readJSON(path.join(root, 'data', 'water-facilities.json'), { facilities: [] }).facilities, wwFacilities: readJSON(path.join(root, 'data', 'ww-facilities.json'), { facilities: [] }).facilities, wwPlants: sv.plants || [], dcInfra: readJSON(path.join(root, 'data', 'dc-infra.json'), {}) });
}

// A report PDF as text (pdftotext from poppler-utils), or null. Large or slow files are skipped.
async function pdfText(url) {
  const { execFileSync } = require('child_process'), os = require('os');
  try {
    const r = await fetch(url, { headers: { 'user-agent': 'peel-dev-tracker (+https://github.com/jaredacostar-cmd/fsr-reviewer)' }, signal: AbortSignal.timeout(90000) });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer()); if (buf.length > 80e6 || buf.subarray(0, 4).toString() !== '%PDF') return null;
    const f = path.join(os.tmpdir(), `ea-${Date.now()}.pdf`); fs.writeFileSync(f, buf);
    // The executive summary and the conclusions hold the preferred solution: the first 40 pages are enough.
    const out = execFileSync('pdftotext', ['-l', '40', '-layout', f, '-'], { maxBuffer: 64e6, timeout: 60000 }).toString();
    fs.unlinkSync(f); return out;
  } catch (e) { console.log(`  report not read: ${url} (${e.message.slice(0, 80)})`); return null; }
}

async function main() {
  const prev = readJSON(path.join(outDir, 'eas.json'), null) || readJSON(path.join(root, 'data', 'eas.json'), null);
  const overrides = readJSON(path.join(root, 'data', 'eas-overrides.json'), {});
  const capital = readJSON(arg('--capital') || path.join(root, 'data', 'capital.json'), null);
  const dcInfra = readJSON(path.join(root, 'data', 'dc-infra.json'), {});
  const dcFac = readJSON(path.join(root, 'scripts', 'dc-facilities.json'), {});
  const areasJ = readJSON(path.join(root, 'data', 'areas.json'), {});

  get.log = true;
  let list = await get(LIST_URL);
  const cands = await candidates();
  if (!list) {
    // The list moved: find it among the pages under the Region's EA sections and sitemap.
    const ea = cands.filter(c => /environment/i.test(`${c.url} ${c.title} ${c.label}`));
    console.log(`EA-related pages found (${ea.length}):`);
    for (const c of ea.slice(0, 120)) console.log(`  ${c.url}  "${(c.title || c.label || '').slice(0, 70)}"`);
    const pick = ea.find(c => /list/i.test(`${c.url} ${c.title} ${c.label}`)) || ea.find(c => /environmental-assessments\/?$/i.test(c.url));
    if (pick) { console.log(`List page: ${pick.url}`); list = await get(pick.url); }
  }
  if (!list) throw new Error(`list page unreachable: ${LIST_URL}`);
  const items = E.parseList(list.html, list.url);
  console.log(`List page: ${items.length} EAs after de-duplication`);
  if (items.length < 30) {
    console.log('--- list page structure (main text, first 6000 chars) ---');
    console.log(E.lines(E.mainHtml(list.html)).join('\n').slice(0, 6000));
  }

  const facPts = facilityPoints();
  const dcLines = ['water', 'wastewater'].flatMap(sys => (dcInfra[sys]?.lines || []).filter(l => l.n).map(l => ({ name: `${l.n} ${l.t || ''}`, paths: [l.g] })));
  const areas = [...(areasJ.secondaryPlans || []), ...(areasJ.precincts || [])];
  const facNameToPt = Object.fromEntries(facPts.flatMap(f => [[f.name, f.lnglat], ...(f.dcName ? [[f.dcName, f.lnglat]] : [])]));

  const eas = [];
  for (const it of items) {
    const ea = { id: E.slug(it.name), name: it.name, municipalities: it.municipalities, municipality: it.municipalities.join(' / ') || null, flags: [] };
    let pageUrl = it.href && /peelregion\.ca/i.test(it.href) && !/\.pdf(\?|$)/i.test(it.href) ? it.href : null;
    let pageScore = pageUrl ? 1 : null;
    if (!pageUrl) { const m = E.findPage(it.name, cands.filter(c => c.url !== LIST_URL)); if (m) { pageUrl = m.url; pageScore = m.score; } }
    let page = null;
    if (pageUrl) { const r = await get(pageUrl); if (r) page = E.parsePage(r.html, r.url, { today }); await sleep(250); }
    if (page) {
      if (page.statusInferred) ea.flags.push(`status ${page.statusInferred}`);
      Object.assign(ea, { schedule: page.schedule, status: page.status, milestones: page.milestones, nextStep: page.nextStep, completedYear: page.completedYear, purpose: page.purpose, links: page.links, pageHash: page.pageHash, pageMatch: pageScore });
      ea.system = E.systemOf(it.name, page.bodyText);
      if (!ea.municipality) { const m = ['Brampton', 'Caledon', 'Mississauga'].filter(x => new RegExp(`\\b${x}\\b`).test(page.bodyText)); if (m.length) { ea.municipality = m.join(' / '); ea.municipalities = m; } }
      if (pageScore != null && pageScore < 0.75) ea.flags.push(`project page matched by name (${pageScore})`);
      if (page.status === 'unknown') ea.flags.push('status not found on the page');
    } else {
      Object.assign(ea, { schedule: E.scheduleOf(it.name), status: 'unknown', milestones: [], nextStep: null, completedYear: null, purpose: null, links: { page: null, report: null, appendices: [], notices: [] }, pageHash: null });
      ea.system = E.systemOf(it.name);
      ea.flags.push(pageUrl ? 'project page unreachable' : 'no project page found');
    }
    ea.decision = null;
    eas.push(ea);
  }

  // Road centrelines and approximate places (network), then geometry per EA.
  const roadCache = new Map(), placeCache = new Map();
  for (const ea of eas) {
    const rd = E.parseRoad(ea.name);
    if (rd && !roadCache.has(ea.id)) roadCache.set(ea.id, { road: await osmWays(rd.road), from: await osmWays(rd.from), to: await osmWays(rd.to) });
  }
  for (const ea of eas) {
    const ctx = { facilities: facPts, dcLines, capital: capital?.records || [], areas, roadWays: () => roadCache.get(ea.id) || null, place: () => placeCache.get(ea.id) || null };
    let g = E.resolveGeometry(ea, ctx);
    if (g.geomType === 'approx') {
      const words = ea.name.replace(/\(.*?\)/g, ' ').replace(GENERIC, ' ').replace(/[–—,:-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (words.length >= 3) {
        const pl = await nominatim(`${words}, ${(ea.municipalities || [])[0] || 'Peel'}, Ontario`);
        if (pl) { placeCache.set(ea.id, pl); g = E.resolveGeometry(ea, ctx); }
      }
    }
    Object.assign(ea, g);
    // A traced study area (data/eas-overrides.json) replaces the resolved geometry before the links below use it.
    const tr = overrides.eas && overrides.eas[ea.id];
    if (tr && tr.geometry) for (const k of ['geometry', 'geomType', 'geomMethod', 'geomConfidence']) if (tr[k] !== undefined) ea[k] = tr[k];
    if (ea.geomType === 'approx') ea.flags.push('geometry approximate');
    if (!ea.geometry) ea.flags.push('no geometry');
  }

  // Links.
  for (const ea of eas) {
    const dc = E.linkDc(ea, dcFac, facNameToPt);
    const cap = capital ? [...E.linkCapital(ea, capital, dc), ...E.linkCapitalInArea(ea, capital)].filter((x, i, a) => a.findIndex(y => y.id === x.id) === i) : [];
    const facs = facPts.filter(f => ea.geometry && E.distToGeom(f.lnglat, ea.geometry) <= 300 || E.tokens(f.name).length && E.tokens(f.name).every(t => E.tokens(ea.name).includes(t))).map(f => f.name);
    ea.related = { dcProjects: dc, capitalProjects: cap, facilities: [...new Set(facs)] };
    ea.lastChecked = today;
  }

  // Decisions: for completed EAs, the preferred-solution passage of the report (an automatic extract,
  // labelled as one; data/eas-overrides.json can replace it). Needs pdftotext (poppler-utils).
  let decided = 0;
  for (const ea of eas) {
    if (!(ea.status === 'complete' || ea.status === 'addendum') || !ea.links?.report?.url || !/\.pdf(\?|$)/i.test(ea.links.report.url)) continue;
    const txt = await pdfText(ea.links.report.url);
    const d = txt && E.extractDecision(txt);
    if (d) { ea.decision = { text: d, source: ea.links.report.url, method: 'extracted from the report (automatic; check the report)' }; decided++; }
  }
  console.log(`Decisions extracted from reports: ${decided}`);

  const final = E.applyOverrides(eas, overrides).map(({ municipalities, ...e }) => e);
  // A weekly rebuild must not replace good data with a partial read (the Region's site down).
  const pages = final.filter(e => e.links?.page).length, prevPages = (prev?.eas || []).filter(e => e.links?.page).length;
  if (prevPages && pages < prevPages * 0.8 && !process.argv.includes('--force')) { console.error(`Only ${pages} project pages read against ${prevPages} last time: not written (pass --force to accept).`); process.exit(1); }
  const changes = E.changesSince(prev, final, today);
  const out = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: { list: LIST_URL, note: 'EA names from the Region of Peel list; status, milestones and documents read from each project page. From January 1, 2027 the Municipal Class EA is replaced by the Municipal Project Assessment Process (O. Reg. 258/26): notices go on each project\'s website, with no central registry.' },
    note: 'General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results.',
    changes: changes.length ? changes : (prev?.changes || []).filter(c => c.date >= new Date(Date.parse(today) - 7 * 864e5).toISOString().slice(0, 10)),
    eas: final,
  };
  for (const e of final) for (const k of ['purpose', 'nextStep', 'decision']) { const v = typeof e[k] === 'object' && e[k] ? e[k].text : e[k]; if (v && E.CONTACT.test(v)) e[k] = null; }
  // Contact and mailing lists name people: never published, whichever way they came in (js/privacy.js).
  for (const e of final) if (e.links && e.links.appendices) e.links.appendices = e.links.appendices.filter(a => !PV.isContactList(a.label));
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'eas.json'), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(outDir, 'eas-review.csv'), E.reviewCsv(final));

  const tally = (k) => final.reduce((m, e) => (m[e[k]] = (m[e[k]] || 0) + 1, m), {});
  console.log(`\nEAs: ${final.length}; with a project page: ${final.filter(e => e.links?.page).length}`);
  for (const k of ['status', 'system', 'schedule', 'geomType', 'geomConfidence']) console.log(`  ${k}: ${JSON.stringify(tally(k))}`);
  console.log(`  linked to DC projects: ${final.filter(e => e.related.dcProjects.length).length}; to capital records: ${final.filter(e => e.related.capitalProjects.length).length}`);
  console.log(`  changes since the last build: ${changes.length}`);
  console.log('\nPer EA:');
  for (const e of final) console.log(`  ${e.status.padEnd(14)} ${String(e.schedule).padEnd(11)} ${e.system.padEnd(10)} ${e.geomType.padEnd(8)} ${e.geomConfidence.padEnd(6)} ${e.name.slice(0, 70)}${e.flags.length ? `  [${e.flags.join('; ')}]` : ''}${e.links?.page ? `  ${e.links.page}` : ''}`);
}

main().catch(e => { console.error(e); process.exit(1); });
