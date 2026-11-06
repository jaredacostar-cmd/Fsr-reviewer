#!/usr/bin/env node
'use strict';
// Completions: the app's count against CMHC's, by municipality and year (completions calibration,
// bucket 1: docs/completions-calibration.md).
//
// The app's count is Growth › Pipeline's (js/growth.js completionStats: completed building permits,
// dated by js/areas.js completedAt, revised permits of one building counted once a year), over the
// developments as the app builds them (scripts/app-devs.js). `all` is CMHC's definition: suites
// added to an existing house are left out (decision 8: CMHC counts new structures only). It splits
// in two, which add up:
//   app    the developments with a planning application (what the Completed tile counts)
//   other  every other development (permit-only sites: single lots, infill)
// and, beside it:
//   suites the units on permits that add a suite to an existing house (P.permitRole 'suite'): a
//          line of their own, not in `all`, so the forecast does not lose them
//   est    the units in `all` whose completion date is estimated from the issue date (Brampton, Caledon)
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
    const notSuite = r => !isSuite(r);
    const cols = {
      app: perYear(app, deps, notSuite), other: perYear(other, deps, notSuite),
      suites: perYear(inM, deps, isSuite),
      est: perYear(inM, deps, r => { const c = notSuite(r) && r.kind === 'permit' && r.phase === 'completed' && completedAt(r); return !!(c && c.estimated); }),
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
    out.push(`\n### ${m}\n`, '| Year | App (applications) | Other | **All** | CMHC | Gap | Suites (not in All) | Estimated dates in All |', '|---|---|---|---|---|---|---|---|');
    for (const r of res.rows.filter(x => x.m === m)) out.push(`| ${r.year} | ${n(r.app)} | ${n(r.other)} | **${n(r.all)}** | ${r.cmhc == null ? '–' : n(r.cmhc)} | ${pc(r.gap)}${mark(r)} | ${n(r.suites)} | ${n(r.est)} |`);
  }
  out.push(`\n### ${res.years[0]}–${res.years[res.years.length - 1]} totals\n`, '| | App | Other | **All** | CMHC | Gap | Years within ±10% | Suites (not in All) |', '|---|---|---|---|---|---|---|---|');
  for (const t of totals(res)) out.push(`| ${t.m} | ${n(t.app)} | ${n(t.other)} | **${n(t.all)}** | ${n(t.cmhc)} | ${pc(t.gap)} | ${t.yearsWithin} of ${t.years} | ${n(t.suites)} |`);
  return out.join('\n');
}

// ---- Bucket 2: dating a building filed in stages (Mississauga) ---------------------------------------
// A merged permit whose events carry a 'stage' part (js/phases.js permitPart) is a building filed in
// stages. Three candidate rules for its completion date; every other permit keeps js/areas.js completedAt.
//   A(lead)  the full permit's final sign-off, `lead` months earlier (people move in before the last
//            inspection); a full permit issued and not signed off: not complete yet; no full permit
//            on file: the last stage closure
//   B        the last stage closure
//   C(lag)   the final sign-off; no final sign-off: the last stage closure, `lag` months later
const MONTH = 30.44 * 864e5;
function staged(r) {
  if (r.kind !== 'permit' || !(r.events || []).some(e => e.part === 'stage')) return null;
  const done = part => r.events.filter(e => e.phase === 'completed' && e.part === part).map(e => +e.date);
  const fin = done('final'), stg = done('stage');
  return { final: fin.length ? Math.min(...fin) : null, stage: stg.length ? Math.max(...stg) : null, fullOpen: !fin.length && r.events.some(e => e.part === 'final' && e.phase === 'permit') };
}
function datingRule(rule, months = 0, base = A.completedAt) {
  return r => {
    const s = staged(r); if (!s) return base(r);
    let d = null;
    if (rule === 'A') d = s.final != null ? s.final - months * MONTH : s.fullOpen ? null : s.stage;
    else if (rule === 'B') d = s.stage != null ? s.stage : s.final;
    else if (rule === 'C') d = s.final != null ? s.final : s.stage != null ? s.stage + months * MONTH : null;
    return d == null ? null : { date: d, estimated: false };
  };
}
// The one number of a rule (0–36 months) that brings a municipality's years closest to CMHC's
// (least sum of squared relative gaps over the calibration years).
function fitRule(projects, cmhc, rule, m = 'Mississauga', o = {}) {
  const tries = rule === 'B' ? [0] : Array.from({ length: 37 }, (_, i) => i);
  let best = null;
  for (const k of tries) {
    const res = reconcile(projects, cmhc, { ...o, completedAt: datingRule(rule, k) });
    const rows = res.rows.filter(r => r.m === m), err = rows.reduce((t, r) => t + (r.gap || 0) ** 2, 0);
    if (!best || err < best.err) best = { rule, months: k, err, res };
  }
  return best;
}

if (require.main === module && process.argv.includes('--rules')) {
  const { loadAppDevs } = require('./app-devs.js');
  const DATA = path.join(__dirname, '..', 'data');
  const cm = require(path.join(DATA, 'peel-housing.json')).activity.muni;
  const { projects } = loadAppDevs(DATA);
  const o = { nowYear: new Date().getFullYear() };
  const n = v => Math.round(v).toLocaleString('en-CA'), pc = g => (g == null ? '–' : `${g > 0 ? '+' : ''}${Math.round(g * 100)}%`);
  const line = (label, res) => {
    const rows = res.rows.filter(r => r.m === 'Mississauga'), t = totals(res).find(x => x.m === 'Mississauga');
    return `| ${label} | ${rows.map(r => `${n(r.all)} (${pc(r.gap)})${r.within ? ' ✓' : ''}`).join(' | ')} | **${n(t.all)}** (${pc(t.gap)}) | ${t.yearsWithin} of 5 |`;
  };
  const cur = reconcile(projects, cm, o);
  const out = ['| Mississauga | 2021 | 2022 | 2023 | 2024 | 2025 | 2021–2025 | Years ±10% |', '|---|---|---|---|---|---|---|---|',
    `| CMHC | ${YEARS.map(y => n(cm.Mississauga[y].completions.all)).join(' | ')} | **${n(YEARS.reduce((t, y) => t + cm.Mississauga[y].completions.all, 0))}** | |`,
    line('Today (latest date)', cur)];
  for (const rule of ['A', 'B', 'C']) {
    const b = fitRule(projects, cm, rule, 'Mississauga', o);
    out.push(line(`${rule}${rule === 'B' ? '' : ` (${b.months} mo)`}`, b.res));
  }
  console.log(out.join('\n'));
} else if (require.main === module) {
  const { loadAppDevs } = require('./app-devs.js');
  const DATA = path.join(__dirname, '..', 'data');
  const housing = require(path.join(DATA, 'peel-housing.json'));
  const { projects } = loadAppDevs(DATA);
  const res = reconcile(projects, housing.activity.muni, { nowYear: new Date().getFullYear() });
  if (process.argv.includes('--json')) console.log(JSON.stringify({ cmhcEdited: housing.activity.edited, ...res, totals: totals(res) }, null, 1));
  else console.log(`Completions: the app's building permits against CMHC (Region of Peel open data, edited ${housing.activity.edited}).\n${markdown(res)}`);
}

module.exports = { reconcile, totals, markdown, datingRule, fitRule, staged, MUNIS, YEARS, TOLERANCE };
