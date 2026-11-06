#!/usr/bin/env node
'use strict';
// Completions: the app's count against CMHC's, by municipality and year (completions calibration,
// bucket 1: docs/completions-calibration.md).
//
// The app's count is Growth › Pipeline's (js/growth.js completionStats: completed building permits,
// dated by js/areas.js completedAt, revised permits of one building counted once a year), over the
// developments as the app builds them (scripts/app-devs.js). It splits in two, which add up:
//   app    the developments with a planning application (what the Completed tile counts)
//   other  every other development (permit-only sites: single lots, infill)
// and two diagnostic columns, parts of `all` (not a split of it):
//   suites the units on permits that add a suite to an existing house (P.permitRole 'suite')
//   est    the units whose completion date is estimated from the issue date (Brampton, Caledon)
// CMHC: the Starts and Completions Survey as the Region of Peel publishes it
// (data/peel-housing.json activity), all dwelling types.
//
//   node scripts/cmhc-reconcile.js            markdown tables
//   node scripts/cmhc-reconcile.js --json     the numbers
const path = require('path');
const G = require('../js/growth.js');
const P = require('../js/phases.js');
const A = require('../js/areas.js');

const MUNIS = ['Mississauga', 'Brampton', 'Caledon'];
const YEARS = [2021, 2022, 2023, 2024, 2025];   // calibration years (charter decision 4)
const TOLERANCE = 0.10;                           // charter decision 2: within ~10%, each municipality, each year

const isSuite = r => P.permitRole(r) === 'suite';

// Units completed per year on a set of developments, optionally only some of their records.
function perYear(projects, deps, keep) {
  const set = keep ? projects.map(p => ({ ...p, records: (p.records || []).filter(keep) })) : projects;
  const c = G.completionStats(set, deps);
  return Object.fromEntries(c.years.map(y => [y.year, y.units]));
}

/**
 * @param {object[]} projects  the developments (scripts/app-devs.js)
 * @param {object} cmhc        data/peel-housing.json activity.muni
 * @param {object} [o]         years, nowYear, completedAt, permitUnits (injected for tests)
 * @returns {{ years, rows: [{ m, year, all, app, other, suites, est, cmhc, gap, within }] }}
 *   gap: (all − cmhc) / cmhc; within: |gap| ≤ TOLERANCE. m 'Peel' is the three added up.
 */
function reconcile(projects, cmhc, o = {}) {
  const years = o.years || YEARS;
  const completedAt = o.completedAt || A.completedAt, permitUnits = o.permitUnits || P.permitUnits;
  const deps = { completedAt, permitUnits, nowYear: o.nowYear != null ? o.nowYear : null, from: years[0], to: years[years.length - 1] };
  const rows = [];
  const add = (a, b) => { for (const k of ['all', 'app', 'other', 'suites', 'est']) a[k] += b[k]; };
  const peel = Object.fromEntries(years.map(y => [y, { all: 0, app: 0, other: 0, suites: 0, est: 0 }]));
  for (const m of MUNIS) {
    const inM = projects.filter(p => p.municipality === m);
    const app = inM.filter(p => (p.kinds || []).includes('application')), other = inM.filter(p => !(p.kinds || []).includes('application'));
    const cols = {
      app: perYear(app, deps), other: perYear(other, deps),
      suites: perYear(inM, deps, isSuite),
      est: perYear(inM, deps, r => { const c = r.kind === 'permit' && r.phase === 'completed' && completedAt(r); return !!(c && c.estimated); }),
    };
    for (const y of years) {
      const r = { app: cols.app[y] || 0, other: cols.other[y] || 0, suites: cols.suites[y] || 0, est: cols.est[y] || 0 };
      r.all = r.app + r.other;
      add(peel[y], r);
      rows.push(row(m, y, r, cmhc));
    }
  }
  for (const y of years) rows.push(row('Peel', y, peel[y], cmhc));
  return { years, rows };
}
function row(m, year, r, cmhc) {
  const c = cmhc && cmhc[m] && cmhc[m][year] && cmhc[m][year].completions ? cmhc[m][year].completions.all : null;
  const gap = c ? (r.all - c) / c : null;
  return { m, year, ...r, cmhc: c, gap, within: gap != null && Math.abs(gap) <= TOLERANCE };
}

// Totals over the years, per municipality.
function totals(res) {
  const out = {};
  for (const r of res.rows) {
    const t = out[r.m] || (out[r.m] = { m: r.m, all: 0, app: 0, other: 0, suites: 0, est: 0, cmhc: 0, yearsWithin: 0, years: 0 });
    for (const k of ['all', 'app', 'other', 'suites', 'est', 'cmhc']) t[k] += r[k] || 0;
    t.years++; if (r.within) t.yearsWithin++;
  }
  for (const t of Object.values(out)) t.gap = t.cmhc ? (t.all - t.cmhc) / t.cmhc : null;
  return Object.values(out);
}

function markdown(res) {
  const n = v => Math.round(v).toLocaleString('en-CA');
  const pc = g => (g == null ? '–' : `${g > 0 ? '+' : ''}${Math.round(g * 100)}%`);
  const mark = r => (r.gap == null ? '' : r.within ? ' ✓' : ' ✗');
  const out = [];
  for (const m of [...MUNIS, 'Peel']) {
    out.push(`\n### ${m}\n`, '| Year | App (applications) | Other | **All** | CMHC | Gap | Suites in All | Estimated dates in All |', '|---|---|---|---|---|---|---|---|');
    for (const r of res.rows.filter(x => x.m === m)) out.push(`| ${r.year} | ${n(r.app)} | ${n(r.other)} | **${n(r.all)}** | ${r.cmhc == null ? '–' : n(r.cmhc)} | ${pc(r.gap)}${mark(r)} | ${n(r.suites)} | ${n(r.est)} |`);
  }
  out.push(`\n### ${res.years[0]}–${res.years[res.years.length - 1]} totals\n`, '| | App | Other | **All** | CMHC | Gap | Years within ±10% |', '|---|---|---|---|---|---|---|');
  for (const t of totals(res)) out.push(`| ${t.m} | ${n(t.app)} | ${n(t.other)} | **${n(t.all)}** | ${n(t.cmhc)} | ${pc(t.gap)} | ${t.yearsWithin} of ${t.years} |`);
  return out.join('\n');
}

if (require.main === module) {
  const { loadAppDevs } = require('./app-devs.js');
  const DATA = path.join(__dirname, '..', 'data');
  const housing = require(path.join(DATA, 'peel-housing.json'));
  const { projects } = loadAppDevs(DATA);
  const res = reconcile(projects, housing.activity.muni, { nowYear: new Date().getFullYear() });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ cmhcEdited: housing.activity.edited, ...res, totals: totals(res) }, null, 1));
  else console.log(`Completions: the app's building permits against CMHC (Region of Peel open data, edited ${housing.activity.edited}).\n${markdown(res)}`);
}

module.exports = { reconcile, totals, markdown, MUNIS, YEARS, TOLERANCE };
