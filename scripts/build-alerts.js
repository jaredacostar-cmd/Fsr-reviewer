#!/usr/bin/env node
/*
 * Weekly alerts feed (Phase 7, Feature 4).
 *
 * Compares the freshly built snapshot against the previous committed one and
 * writes two static files deployed with the site:
 *   data/alerts.json  machine-readable feed of this week's alerts
 *   data/alerts.rss   the same items as valid RSS 2.0
 *
 * What counts as an alert ("significant") is defined in SIGNIFICANCE below and
 * documented in README.md ("Alerts feed"):
 *
 *   Change alerts (development keys are stable project keys, see js/phases.js):
 *   - phase-change: a development's phase moved (always significant).
 *   - new-development / removed-development: appeared in / dropped out of the
 *     sources; significant when it carries 10+ units (or the unit count is
 *     unknown — small permit-only churn is noise).
 *   - units-change: the unit count moved by >= 50 units AND >= 10% of the old
 *     count (a re-stated unit count on a big file shouldn't page anyone).
 *
 *   Threshold alerts (capacity screens, not a hydraulic model):
 *   - plant-threshold: a wastewater plant's committed share — the 2025 measured
 *     average flow (data/peel-reports.json, static) plus the average dry weather
 *     flow of committed growth (approved / permit issued / under construction,
 *     Peel design criteria, assigned to the plant by drainage-area outline) —
 *     crossing 75% (watch level) or 90% (the 2020 Master Plan expansion
 *     trigger) of rated capacity, in either direction.
 *   - station-threshold: committed growth's peak wet weather flow at a pumping
 *     station's drainage area crossing 25 / 50 / 75 / 100% of its firm capacity
 *     (2020 Master Plan, Vol. 4 Table 6, via data/peel-reports.json). Growth
 *     only — existing load is not in this screen, so bands are an early
 *     warning, not an overload finding.
 *
 * Zone trigger years are intentionally NOT in the feed: the zone capacity
 * assessments are static master-plan forecasts, so nothing about them moves
 * week to week.
 *
 * Watched sites live in each browser's localStorage, which CI cannot see, so
 * the feed carries ALL alerts; js/alerts.js matches them against the local
 * watchlist in the browser.
 *
 * Usage: node scripts/build-alerts.js [--out data] [--new data/snapshot.json]
 *        [--prev-file prev.json] [--date YYYY-MM-DD] [--site-url URL]
 * The previous snapshot defaults to the committed one: `git show
 * HEAD:data/snapshot.json` in the repo root. If there is no committed snapshot
 * (first run), an empty baseline feed is written instead of failing.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const BS = require('./build-snapshot.js');
const P = require('../js/phases.js');
const D = require('../js/demand.js');

// ---- Configuration -----------------------------------------------------------
const SITE_URL = 'https://jaredacostar-cmd.github.io/peel-growth-pipeline/';
const FEED_VERSION = 1;
const REPO_ROOT = path.resolve(__dirname, '..');

// "Significant" change rules (documented above).
const NEW_REMOVED_MIN_UNITS = 10;
const UNITS_MIN_ABS = 50;
const UNITS_MIN_REL = 0.10;

// Capacity thresholds.
const PLANT_LEVELS = [0.75, 0.90];
const STATION_BANDS = [0.25, 0.50, 0.75, 1.00];
const LS_PER_MLD = 1e6 / 86400; // L/s per ML/d

const fmtNum = v => v == null || !isFinite(v) ? '–' : Math.round(v).toLocaleString('en-CA');
const slug = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'item';
const xmlEsc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const phaseLabel = ph => (P.PHASE_BY_KEY[ph] && P.PHASE_BY_KEY[ph].label) || ph;
const day = d => d.toISOString().slice(0, 10);

// Client's pumping-station key function (js/svc-data.js spsKey), copied so the
// generator maps a drainage area to its 2020 Master Plan firm capacity.
const spsKey = n => String(n || '').toLowerCase().replace(/^[^·]+\s*·\s*/, '').replace(/\s+ps$/, '').replace(/'/g, '').replace(/ memorial park/, '').replace(/ (drive|avenue|road|trail|parkway|crescent|court|mews)$/, '').trim();

// ---- Project summaries --------------------------------------------------------
function summarizeSnapshot(snap) {
  const recs = (snap.records || []).map(r => BS.decodeRecord(r, ''));
  const out = new Map();
  for (const p of P.buildProjects(P.dedupeRecords(recs))) {
    out.set(p.key, {
      key: p.key, title: p.title, municipality: p.municipality, phase: p.phase,
      units: p.units || null, lat: p.lat ?? null, lng: p.lng ?? null, project: p,
    });
  }
  return out;
}

// ---- Change detection (pure) ---------------------------------------------------
function diffSummaries(prev, next) {
  const changes = [];
  for (const [key, n] of next) {
    const o = prev.get(key);
    if (!o) { changes.push({ kind: 'added', ...pick(n) }); continue; }
    if (o.phase !== n.phase) changes.push({ kind: 'phase', ...pick(n), from: o.phase, to: n.phase });
    const ou = o.units || 0, nu = n.units || 0;
    if (ou !== nu) changes.push({ kind: 'units', ...pick(n), unitsPrev: ou, unitsNew: nu });
  }
  for (const [key, o] of prev) {
    if (!next.has(key)) changes.push({ kind: 'removed', ...pick(o) });
  }
  return changes;
}
const pick = s => ({ key: s.key, title: s.title, municipality: s.municipality, phase: s.phase, units: s.units });

function isSignificant(c) {
  if (c.kind === 'phase') return true;
  if (c.kind === 'added' || c.kind === 'removed') return c.units == null || c.units >= NEW_REMOVED_MIN_UNITS;
  if (c.kind === 'units') {
    const d = Math.abs(c.unitsNew - c.unitsPrev);
    return d >= UNITS_MIN_ABS && (c.unitsPrev === 0 || d / c.unitsPrev >= UNITS_MIN_REL);
  }
  return false;
}

function changeItems(changes, date) {
  const items = [];
  for (const c of changes) {
    if (!isSignificant(c)) continue;
    const muni = c.municipality ? ` · ${c.municipality}` : '';
    const units = c.units ? ` · ${fmtNum(c.units)} units` : '';
    let kind, title, text, url = SITE_URL + '?d=' + encodeURIComponent(c.key);
    if (c.kind === 'added') { kind = 'new-development'; title = `${c.title} — new development`; text = `New · ${phaseLabel(c.phase)}${muni}${units}`; }
    else if (c.kind === 'removed') { kind = 'removed-development'; title = `${c.title} — removed`; text = `Dropped out of the sources · was ${phaseLabel(c.phase)}${muni}${units}`; }
    else if (c.kind === 'phase') { kind = 'phase-change'; title = `${c.title} — phase change`; text = `${phaseLabel(c.from)} → ${phaseLabel(c.to)}${muni}${units}`; }
    else { kind = 'units-change'; const d = c.unitsNew - c.unitsPrev; title = `${c.title} — units changed`; text = `Units ${fmtNum(c.unitsPrev)} → ${fmtNum(c.unitsNew)} (${d > 0 ? '+' : ''}${fmtNum(d)})${muni}`; }
    items.push({
      id: `${date}:${kind}:${slug(c.key)}`, date, kind, title, text,
      development: { key: c.key, title: c.title, municipality: c.municipality, phase: c.phase },
      url,
    });
  }
  return items;
}

// ---- Capacity thresholds (pure) -------------------------------------------------
// Assign a project to its wastewater plant / pumping-station drainage area by
// outline containment (P.pointInRings). Projects outside every mapped area are
// skipped — the browser's nearest-area fallback is not applied here.
function areaContaining(areas, lng, lat) {
  if (lng == null || lat == null) return null;
  return areas.find(a => a.rings && P.pointInRings(lng, lat, a.rings)) || null;
}

function committedOf(projs) {
  return projs.filter(s => D.COMMITTED_PHASES.has(s.phase));
}

// Plant committed share: 2025 measured average flow + committed growth ADWF,
// over rated capacity. `plants` is data/peel-reports.json's wastewater.plants.
function plantShares(projs, plants, areas) {
  const byPlant = new Map();
  for (const s of committedOf(projs)) {
    const a = areaContaining(areas, s.lng, s.lat);
    if (!a || !a.plant || !plants[a.plant]) continue;
    if (!byPlant.has(a.plant)) byPlant.set(a.plant, []);
    byPlant.get(a.plant).push(s.project);
  }
  const out = {};
  for (const [name, rep] of Object.entries(plants)) {
    const growthMLd = D.toMLd(D.estimate(byPlant.get(name) || []).combined.wastewater.avg);
    out[name] = {
      name: rep.name || name, ratedMLd: rep.ratedMLd, baseMLd: rep.avgMLd, growthMLd,
      share: rep.ratedMLd > 0 ? (rep.avgMLd + growthMLd) / rep.ratedMLd : 0,
    };
  }
  return out;
}

// Pumping-station screen: committed growth's peak wet weather flow at each
// station's drainage area vs its firm capacity. `sps` is the 2020 Master Plan
// table (data/peel-reports.json masterPlan.sps).
function stationLoads(projs, sps, areas) {
  const byArea = new Map();
  for (const s of committedOf(projs)) {
    const a = areaContaining(areas, s.lng, s.lat);
    if (!a || a.kind !== 'ps') continue;
    if (!byArea.has(a.id)) byArea.set(a.id, []);
    byArea.get(a.id).push(s.project);
  }
  const out = {};
  for (const a of areas) {
    if (a.kind !== 'ps') continue;
    const st = sps.find(x => x.key === spsKey(a.name));
    if (!st || !(st.firmLs > 0)) continue;
    const e = D.estimate(byArea.get(a.id) || []).combined.wastewater;
    const wetLs = e.peak + e.infiltration;
    out[a.id] = {
      name: a.name || st.name, plant: a.plant, firmLs: st.firmLs, wetLs,
      load: wetLs / st.firmLs,
    };
  }
  return out;
}

// Levels crossed between the previous and new value of each key, either
// direction. One item per key: the highest band crossed going up, the lowest
// going down.
function crossings(prev, next, levels) {
  const out = [];
  for (const key of new Set([...Object.keys(prev), ...Object.keys(next)])) {
    const a = prev[key], b = next[key];
    if (a == null || b == null || a === b) continue;
    const hit = levels.filter(level => (a < level && b >= level) || (a > level && b <= level));
    if (!hit.length) continue;
    const dir = b > a ? 'up' : 'down';
    const level = dir === 'up' ? Math.max(...hit) : Math.min(...hit);
    out.push({ key, prev: a, next: b, level, dir });
  }
  return out;
}

function thresholdItems(prevShares, newShares, prevLoads, newLoads, date) {
  const items = [];
  const pPrev = {}, pNew = {};
  for (const [k, v] of Object.entries(prevShares)) pPrev[k] = v.share;
  for (const [k, v] of Object.entries(newShares)) pNew[k] = v.share;
  for (const c of crossings(pPrev, pNew, PLANT_LEVELS)) {
    const v = newShares[c.key];
    const pct = x => `${Math.round(x * 100)}%`;
    items.push({
      id: `${date}:plant-threshold:${slug(c.key)}`, date, kind: 'plant-threshold',
      title: `${v.name} — committed share ${c.dir === 'up' ? 'crossed' : 'fell below'} ${pct(c.level)}`,
      text: `Committed share ${pct(c.prev)} → ${pct(c.next)} (${c.dir === 'up' ? 'crossed' : 'back under'} the ${pct(c.level)} ${c.level >= 0.9 ? 'expansion trigger' : 'watch level'}) · rated ${fmtNum(v.ratedMLd)} ML/d · 2025 flow ${fmtNum(v.baseMLd)} ML/d + committed growth ${v.growthMLd.toFixed(1)} ML/d`,
      plant: c.key, url: SITE_URL,
    });
  }
  const sPrev = {}, sNew = {};
  for (const [k, v] of Object.entries(prevLoads)) sPrev[k] = v.load;
  for (const [k, v] of Object.entries(newLoads)) sNew[k] = v.load;
  for (const c of crossings(sPrev, sNew, STATION_BANDS)) {
    const v = newLoads[c.key];
    const pct = x => `${Math.round(x * 100)}%`;
    items.push({
      id: `${date}:station-threshold:${slug(c.key)}`, date, kind: 'station-threshold',
      title: `${v.name} pumping station — growth load ${c.dir === 'up' ? 'crossed' : 'fell below'} ${pct(c.level)} of firm capacity`,
      text: `Committed growth ≈${pct(c.prev)} → ≈${pct(c.next)} of firm capacity (${c.dir === 'up' ? 'crossed' : 'back under'} the ${pct(c.level)} band) · firm ${fmtNum(v.firmLs)} L/s · growth peak wet ≈${fmtNum(v.wetLs)} L/s · drains to ${v.plant || '—'}`,
      station: v.name, url: SITE_URL,
    });
  }
  return items;
}

// ---- Feed + RSS ------------------------------------------------------------------
const KIND_ORDER = { 'plant-threshold': 0, 'station-threshold': 1, 'phase-change': 2, 'new-development': 3, 'units-change': 4, 'removed-development': 5 };

function buildFeed({ prevSnap, newSnap, date, siteUrl = SITE_URL, refs }) {
  const prevProjs = [...summarizeSnapshot(prevSnap).values()];
  const newProjs = [...summarizeSnapshot(newSnap).values()];
  const toMap = arr => new Map(arr.map(s => [s.key, s]));
  const items = [
    ...changeItems(diffSummaries(toMap(prevProjs), toMap(newProjs)), date),
    ...thresholdItems(
      plantShares(prevProjs, refs.plants, refs.areas), plantShares(newProjs, refs.plants, refs.areas),
      stationLoads(prevProjs, refs.sps, refs.areas), stationLoads(newProjs, refs.sps, refs.areas),
      date),
  ];
  items.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.title.localeCompare(b.title));
  return {
    version: FEED_VERSION,
    generated: new Date().toISOString(),
    since: prevSnap.generatedAt ? day(new Date(prevSnap.generatedAt)) : null,
    until: date,
    site: siteUrl,
    baseline: false,
    counts: Object.fromEntries([...new Set(items.map(i => i.kind))].map(k => [k, items.filter(i => i.kind === k).length])),
    items,
  };
}

function emptyFeed(date, siteUrl = SITE_URL) {
  return { version: FEED_VERSION, generated: new Date().toISOString(), since: null, until: date, site: siteUrl, baseline: true, counts: {}, items: [] };
}

function toRSS(feed) {
  const pub = new Date(feed.generated).toUTCString();
  const items = feed.items.map(it => `    <item>
      <title>${xmlEsc(it.title)}</title>
      <link>${xmlEsc(it.url)}</link>
      <guid isPermaLink="false">${xmlEsc(it.id)}</guid>
      <pubDate>${new Date(it.date + 'T12:00:00Z').toUTCString()}</pubDate>
      <description>${xmlEsc(it.text)}</description>
    </item>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Peel Development Tracker — weekly alerts</title>
    <link>${xmlEsc(feed.site)}</link>
    <description>Significant development changes and capacity-threshold crossings from the weekly Peel development data update. Unofficial prototype built from public open data, not a Region of Peel product.</description>
    <language>en-CA</language>
    <pubDate>${pub}</pubDate>
    <lastBuildDate>${pub}</lastBuildDate>
${items}
  </channel>
</rss>
`;
}

// ---- Previous snapshot ------------------------------------------------------------
function gitPrevSnapshot() {
  const raw = execFileSync('git', ['show', 'HEAD:data/snapshot.json'], { cwd: REPO_ROOT, maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(raw.toString('utf8'));
}

function loadRefs() {
  const reports = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'peel-reports.json'), 'utf8'));
  const servicing = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'data', 'servicing.json'), 'utf8'));
  return {
    plants: (reports.wastewater && reports.wastewater.plants) || {},
    sps: ((reports.masterPlan && reports.masterPlan.sps) || []),
    areas: servicing.drainageAreas || [],
  };
}

// ---- Main ----------------------------------------------------------------------------
function main(argv = process.argv.slice(2)) {
  const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
  const outDir = path.resolve(arg('--out', path.join(REPO_ROOT, 'data')));
  const date = arg('--date', day(new Date()));
  const siteUrl = arg('--site-url', SITE_URL);
  const newFile = arg('--new', path.join(outDir, 'snapshot.json'));
  const prevFile = arg('--prev-file', null);

  fs.mkdirSync(outDir, { recursive: true });
  const newSnap = JSON.parse(fs.readFileSync(newFile, 'utf8'));

  let prevSnap = null;
  try {
    prevSnap = prevFile ? JSON.parse(fs.readFileSync(prevFile, 'utf8')) : gitPrevSnapshot();
  } catch (e) {
    console.log(`No previous snapshot available (${e.message.split('\n')[0]}); writing a baseline feed.`);
  }

  const feed = prevSnap ? buildFeed({ prevSnap, newSnap, date, siteUrl, refs: loadRefs() }) : emptyFeed(date, siteUrl);
  fs.writeFileSync(path.join(outDir, 'alerts.json'), JSON.stringify(feed, null, 1) + '\n');
  fs.writeFileSync(path.join(outDir, 'alerts.rss'), toRSS(feed));
  const byKind = feed.counts && Object.entries(feed.counts).map(([k, n]) => `${k}:${n}`).join(' ');
  console.log(`alerts: ${feed.items.length} items${byKind ? ` (${byKind})` : ''} → ${path.join(outDir, 'alerts.json')}, alerts.rss`);
  return feed;
}

module.exports = {
  SITE_URL, NEW_REMOVED_MIN_UNITS, UNITS_MIN_ABS, UNITS_MIN_REL, PLANT_LEVELS, STATION_BANDS,
  summarizeSnapshot, diffSummaries, isSignificant, changeItems,
  areaContaining, committedOf, plantShares, stationLoads, crossings, thresholdItems,
  buildFeed, emptyFeed, toRSS, main,
};

if (require.main === module) main();
