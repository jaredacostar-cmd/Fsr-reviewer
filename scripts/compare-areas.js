#!/usr/bin/env node
/*
 * Area comparison, offline (the pipeline ledger's Phase 8 pattern, docs/ledger/area-compare.md).
 *
 * Compares units per area from a sheet you fill (for example the FSR units behind a Region map) with
 * what the app finds in the same areas: units left in planning applications, by stage, committed,
 * and expected before a given year, from the ledger rows scripts/build-ledger.js builds.
 *
 * The filled sheet holds figures that may be internal to the Region. It stays on your machine, in
 * reports-internal/ (never committed); the repo holds only the blank template,
 * docs/ledger/area-compare-template.csv.
 *
 *   node scripts/compare-areas.js reports-internal/deferral-areas.csv
 *   (--data <dir>: default data/; --out <dir>: default reports-internal/)
 *
 * Writes <out>/<sheet name>-compare.csv (one line per area), <sheet name>-sites.csv (the app's
 * developments in each area, to tick off against the FSR list) and <sheet name>-compare.md.
 *
 * The sheet's columns (any order; blank number cells are left out of the differences):
 *   area          the area's name
 *   match         how to find it in the app, ';' between parts, any part matching:
 *                   <area id>                    a secondary plan, MTSA or precinct in data/areas.json
 *                                                (its id as is: sp:…, mtsa:…, precinct:…)
 *                   circle:<lng>,<lat>,<metres>  within a distance of a point
 *                   geojson:<path>               inside any polygon of a local GeoJSON file
 *                   dev:<development id>         one development (the ledger's id)
 *   start_year    the year the area's growth starts (a deferral's start): units the app expects
 *                 before it are counted apart
 *   fsr_units     the sheet's units for the area (e.g. from the FSRs)
 *   other columns are copied to the output as they are (e.g. capital, notes)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const Ar = require('../js/areas.js');

const ROOT = path.join(__dirname, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };

/** CSV text → [{ column: value }] (quotes, doubled quotes and '#' comment lines handled). */
function parseCSV(text) {
  const lines = [], cur = []; let f = '', q = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"' && s[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; continue; }
    if (c === '"') q = true;
    else if (c === ',') { cur.push(f); f = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && s[i + 1] === '\n') i++; cur.push(f); lines.push(cur.splice(0)); f = ''; }
    else f += c;
  }
  if (f !== '' || cur.length) { cur.push(f); lines.push(cur.splice(0)); }
  const rows = lines.filter(l => l.some(x => x.trim() !== '') && !/^\s*#/.test(l[0]));
  if (!rows.length) return [];
  const head = rows[0].map(h => h.trim());
  return rows.slice(1).map(l => Object.fromEntries(head.map((h, i) => [h, (l[i] || '').trim()])));
}
const AREA_ID = /^(sp|mtsa|precinct):/;
const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(/[,$\s]/g, '')); return isFinite(n) ? n : null; };

/**
 * A match spec → p(lng, lat, row) → boolean. areas: the secondaryPlans, mtsas and precincts of
 * data/areas.json; readFile: for geojson parts (injected in tests).
 */
function matcher(spec, areas, readFile = f => fs.readFileSync(path.resolve(ROOT, f), 'utf8')) {
  const byId = new Map((areas || []).map(a => [a.id, a]));
  const parts = String(spec || '').split(';').map(s => s.trim()).filter(Boolean), tests = [], errors = [];
  for (const p of parts) {
    const [kind, ...rest] = p.split(':'), val = rest.join(':').trim();
    if (AREA_ID.test(p)) {
      const a = byId.get(p); if (!a) { errors.push(`no area ${p} in data/areas.json`); continue; }
      const prep = Ar.prepare([{ id: a.id, name: a.name, rings: a.rings }]);
      tests.push((lng, lat, r) => (r && (r.sp || []).includes(p)) || (lat != null && Ar.locate(prep, lng, lat).length > 0));
    } else if (kind === 'circle') {
      const [lng, lat, m] = val.split(',').map(Number);
      if (![lng, lat, m].every(isFinite)) { errors.push(`circle needs lng,lat,metres: ${val}`); continue; }
      tests.push((x, y) => y != null && Math.hypot((x - lng) * 111320 * Math.cos(lat * Math.PI / 180), (y - lat) * 111320) <= m);
    } else if (kind === 'geojson') {
      let gj; try { gj = JSON.parse(readFile(val)); } catch (e) { errors.push(`cannot read ${val}: ${e.message}`); continue; }
      const feats = gj.type === 'FeatureCollection' ? gj.features : [gj.type === 'Feature' ? gj : { geometry: gj }];
      const polys = feats.flatMap(f => { const g = f.geometry || {}; return g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : []; });
      const prep = Ar.prepare(polys.map((rings, i) => ({ id: `g${i}`, name: `g${i}`, rings })));
      tests.push((lng, lat) => lat != null && Ar.locate(prep, lng, lat).length > 0);
    } else if (kind === 'dev') tests.push((x, y, r) => !!r && r.id === val);
    else errors.push(`unknown match "${p}" (an area id, circle:, geojson:, dev:)`);
  }
  return { test: (lng, lat, r) => tests.some(t => t(lng, lat, r)), errors, empty: !tests.length };
}

const r0 = v => Math.round(v || 0);
/**
 * The comparison. rows: ledger rows (js/ledger.js); sheet: parsed sheet rows; areas: data/areas.json
 * areas; targets: data/plan-targets.json targets. → { areas: [...], sites: [...], totals }.
 */
function compare(rows, sheet, areas, targets = [], opts = {}) {
  const out = [], sites = [];
  for (const s of sheet) {
    const m = matcher(s.match, areas, opts.readFile), start = num(s.start_year), fsr = num(s.fsr_units);
    const inA = m.empty ? [] : rows.filter(r => m.test(r.lon, r.lat, r));
    const sum = f => inA.reduce((t, r) => t + (+f(r) || 0), 0);
    const before = r => start != null && r.expectedYear && r.expectedYear.likely != null && r.expectedYear.likely < start;
    const app = r0(sum(r => r.left));
    const spIds = String(s.match || '').split(';').map(x => x.trim()).filter(x => AREA_ID.test(x));
    const tg = targets.filter(t => spIds.includes(t.id));
    const tUnits = tg.length && tg.every(t => t.units != null) ? tg.reduce((t, x) => t + x.units, 0) : null;
    const tPeople = tg.length && tg.every(t => t.population != null) ? tg.reduce((t, x) => t + x.population, 0) : null;
    const extra = Object.fromEntries(Object.entries(s).filter(([k]) => !['area', 'match', 'start_year', 'fsr_units'].includes(k)));
    out.push({
      area: s.area, match: s.match, errors: m.errors, start_year: start, fsr_units: fsr,
      app_developments: inA.length, app_units_left: app,
      app_committed: r0(sum(r => r.units.committed)), app_approved: r0(sum(r => r.units.approved)), app_review: r0(sum(r => r.units.review)), app_early: r0(sum(r => r.units.early)),
      app_before_start: start != null ? r0(sum(r => (before(r) ? r.left : 0))) : null,
      gap_units: fsr != null ? r0(fsr - app) : null, app_share: fsr ? Math.round(app / fsr * 1000) / 10 : null,
      plan_units: tUnits, plan_people: tPeople,
      ...extra,
    });
    for (const r of inA.slice().sort((a, b) => b.left - a.left)) {
      sites.push({ area: s.area, id: r.id, name: r.name, municipality: r.municipality, stage: r.stage, tier: (r.confidence && r.confidence.tier) || '',
        units_left: r0(r.left), committed: r0(r.units.committed), expected_year: (r.expectedYear && r.expectedYear.likely) || '', before_start: before(r) ? 'yes' : 'no',
        lat: r.lat, lon: r.lon, files: (r.sources || []).join('; ') });
    }
  }
  const tot = k => out.reduce((t, a) => t + (a[k] || 0), 0);
  const totals = { fsr_units: tot('fsr_units'), app_units_left: tot('app_units_left'), app_committed: tot('app_committed'), app_before_start: tot('app_before_start'), gap_units: tot('gap_units') };
  return { areas: out, sites, totals };
}

const q = v => { const s = v == null ? '' : Array.isArray(v) ? v.join('; ') : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
const toCSV = list => { if (!list.length) return ''; const keys = Object.keys(list[0]); return `${keys.join(',')}\n${list.map(r => keys.map(k => q(r[k])).join(',')).join('\n')}\n`; };
const fmt = v => (v == null ? '–' : typeof v === 'number' ? Math.round(v).toLocaleString('en-CA') : String(v));

/** A short Markdown report. */
function report(res, meta = {}) {
  const L = [`# Area comparison: ${meta.name || 'sheet'}`, '', `App data as of ${meta.sourceDate || 'n/a'}. Units left to build in planning applications (the ledger, the Peel rule); "before start" counts a development's units when its likely expected year is before the area's start year. Offline only: this report holds the sheet's figures and stays in reports-internal/.`, '',
    '| Area | Sheet units | App units left | App share | Gap | Committed | Before start | Plan total |', '|---|---:|---:|---:|---:|---:|---:|---:|'];
  for (const a of res.areas) L.push(`| ${a.area}${a.errors.length ? ' ⚠' : ''} | ${fmt(a.fsr_units)} | ${fmt(a.app_units_left)} | ${a.app_share == null ? '–' : `${a.app_share}%`} | ${fmt(a.gap_units)} | ${fmt(a.app_committed)} | ${fmt(a.app_before_start)} | ${a.plan_units != null ? `${fmt(a.plan_units)} units` : a.plan_people != null ? `${fmt(a.plan_people)} people` : '–'} |`);
  const t = res.totals;
  L.push(`| **All** | **${fmt(t.fsr_units)}** | **${fmt(t.app_units_left)}** | ${t.fsr_units ? `${Math.round(t.app_units_left / t.fsr_units * 1000) / 10}%` : '–'} | **${fmt(t.gap_units)}** | ${fmt(t.app_committed)} | ${fmt(t.app_before_start)} | |`, '');
  const errs = res.areas.filter(a => a.errors.length);
  if (errs.length) L.push('Match problems:', '', ...errs.map(a => `- ${a.area}: ${a.errors.join('; ')}`), '');
  L.push('The gap is the sheet\'s units the app does not find in a planning application: land with an FSR but no application yet, or an area drawn differently. The sites file lists the app\'s developments in each area, to check against the FSR list.', '');
  return L.join('\n');
}

function main() {
  const sheetPath = process.argv[2];
  if (!sheetPath || sheetPath.startsWith('--')) { console.error('usage: node scripts/compare-areas.js <filled sheet.csv> [--data dir] [--out dir]'); process.exit(1); }
  const dataDir = path.resolve(arg('--data', path.join(ROOT, 'data'))), outDir = path.resolve(arg('--out', path.join(ROOT, 'reports-internal')));
  const sheet = parseCSV(fs.readFileSync(sheetPath, 'utf8'));
  const AJ = JSON.parse(fs.readFileSync(path.join(dataDir, 'areas.json'), 'utf8'));
  const areas = [...(AJ.secondaryPlans || []), ...(AJ.mtsas || []), ...(AJ.precincts || [])];
  const T = fs.existsSync(path.join(dataDir, 'plan-targets.json')) ? JSON.parse(fs.readFileSync(path.join(dataDir, 'plan-targets.json'), 'utf8')).targets : [];
  const { s, rows } = require('./build-ledger.js').build(dataDir);
  const res = compare(rows, sheet, areas, T);
  const name = path.basename(sheetPath).replace(/\.csv$/i, '');
  fs.mkdirSync(outDir, { recursive: true });
  const files = [[`${name}-compare.csv`, toCSV(res.areas)], [`${name}-sites.csv`, toCSV(res.sites)], [`${name}-compare.md`, report(res, { name, sourceDate: s.sourceDate })]];
  for (const [f, body] of files) fs.writeFileSync(path.join(outDir, f), body);
  console.log(report(res, { name, sourceDate: s.sourceDate }));
  console.log(`wrote ${files.map(([f]) => path.relative(ROOT, path.join(outDir, f))).join(', ')}`);
}

if (require.main === module) main();
module.exports = { parseCSV, matcher, compare, report, toCSV };
