#!/usr/bin/env node
/*
 * The weekly data refresh's review gate (.github/workflows/site.yml): this week's data against last
 * week's, before it is committed. A test that fails, or a measure that moves more than the usual
 * amount in a week, holds the update for review: last week's data stays, the app says so
 * (data/refresh.json, js/refresh-status.js) and the review issue gets the table below.
 *
 *   node scripts/data-check.js --prev <dir> --data data [--site-report f.jsonl] [--tests-failed N]
 *        [--test-log f] [--accept] --out check.json --md check.md
 *   node scripts/data-check.js --refresh-json data/refresh.json --check check.json [--issue URL]
 *
 * <dir> holds last week's snapshot.json and tree-counts.json. --accept publishes a week that moved
 * more than usual (a person looked); failing tests still hold it.
 */
'use strict';
const fs = require('fs');
const path = require('path');

// A measure moves "more than usual" when it changes by more than 10% and by more than its floor.
const THRESHOLD = 0.10;
const FLOOR = { records: 200, devs: 100, units: 1000 };

const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const has = k => process.argv.includes(k);
const readJSON = f => JSON.parse(fs.readFileSync(f, 'utf8'));

/** The measures of one week's data: records by source and kind, developments, units by stage, infill. */
function measures(dir) {
  const ROOT = path.join(__dirname, '..');
  const P = require(path.join(ROOT, 'js/phases.js'));
  const TG = require(path.join(ROOT, 'js/tree-groups.js'));
  const TC = require(path.join(ROOT, 'js/tree-counts.js'));
  const L = require(path.join(ROOT, 'js/layers.js'));
  const snap = readJSON(path.join(dir, 'snapshot.json'));
  const out = { generatedAt: snap.generatedAt || null, records: {}, kinds: {}, devs: null, units: {}, infill: null };
  const names = new Map((snap.sources || []).map(s => [s.id, s.name]));
  for (const r of snap.records || []) {
    const src = String(r.sourceId || '').split('/')[0];
    out.records[names.get(src) || src] = (out.records[names.get(src) || src] || 0) + 1;
    out.kinds[r.kind] = (out.kinds[r.kind] || 0) + 1;
  }
  const treeFile = path.join(dir, 'tree-counts.json');
  if (!fs.existsSync(treeFile)) return out;
  const tree = readJSON(treeFile);
  const raw = snap.records.map(o => ({ sourceName: names.get(String(o.sourceId).split('/')[0]), ref: '', address: '', type: '', description: '', units: null, props: {}, ...o,
    events: (o.events || []).map(([d, phase, label]) => ({ date: new Date(`${d}T00:00:00Z`), phase, label })) }));
  TG.setData(tree); TC.setData(tree);
  const projects = P.buildProjects(P.dedupeRecords(raw), { regroup: parts => TG.regroup(parts) });
  TC.apply(projects, { mode: 'tree', data: tree, ringsArea: P.ringsArea });
  const set = projects.filter(p => p.phase !== 'cancelled');
  out.devs = set.length;
  const t = L.totals(set);
  for (const [k, v] of Object.entries(t.units)) out.units[k] = Math.round(v);
  if (L.infill) out.infill = Math.round(L.infill(set.filter(p => !(p.kinds || []).includes('application')), { secondUnits: projects.secondUnits || [] }).units);
  return out;
}

const LAYER_WORD = { existing: 'existing', built: 'built since 2021', committed: 'approved, not yet built', proposed: 'in review', anticipated: 'pre-application' };
/** Rows for every measure, and the ones that moved more than usual. */
function compare(prev, now) {
  const rows = [];
  const add = (label, a, b, floor) => {
    if (a == null && b == null) return;
    const d = (b || 0) - (a || 0), rel = a > 0 ? d / a : (b > 0 ? 1 : 0);
    rows.push({ label, prev: a == null ? null : a, now: b == null ? null : b, change: d, rel, flagged: Math.abs(rel) > THRESHOLD && Math.abs(d) > floor });
  };
  const srcs = new Set([...Object.keys(prev.records || {}), ...Object.keys(now.records || {})]);
  for (const s of [...srcs].sort()) add(`${s}: records`, (prev.records || {})[s] || 0, (now.records || {})[s] || 0, FLOOR.records);
  for (const k of ['application', 'permit']) add(`All ${k}s`, (prev.kinds || {})[k] || 0, (now.kinds || {})[k] || 0, FLOOR.records);
  add('Developments', prev.devs, now.devs, FLOOR.devs);
  for (const k of Object.keys(LAYER_WORD)) add(`Units ${LAYER_WORD[k]}`, (prev.units || {})[k], (now.units || {})[k], FLOOR.units);
  add('Homes by building permit alone since 2021', prev.infill, now.infill, FLOOR.units);
  return rows;
}

const pct = r => `${r.rel >= 0 ? '+' : ''}${Math.round(r.rel * 100)}%`;
const n = v => (v == null ? '–' : Number(v).toLocaleString('en-CA'));
/** The verdict: held or not, and why, from the measures, the tests and the site checks. */
function verdict(rows, { testsFailed = 0, siteChecks = [], accept = false } = {}) {
  const moved = rows.filter(r => r.flagged);
  const reasons = [];
  if (testsFailed > 0) reasons.push(`${testsFailed} test${testsFailed === 1 ? '' : 's'} failed`);
  if (moved.length && !accept) for (const r of moved.slice(0, 4)) reasons.push(`${r.label} ${pct(r)} in a week`);
  if (moved.length > 4 && !accept) reasons.push(`${moved.length - 4} more measures moved`);
  return { held: testsFailed > 0 || (moved.length > 0 && !accept), reasons, moved: moved.length, accepted: accept && moved.length > 0, siteChecks };
}
/** The review issue's body: what moved, the tests, the site checks, and how to publish anyway. */
function markdown(rows, v, { prevAt, nowAt, testLog = '' } = {}) {
  const lines = [`## Weekly data update: ${v.held ? '**held for review**' : 'published'}`, '',
    `This week's data (${String(nowAt || '').slice(0, 10)}) against last week's (${String(prevAt || '').slice(0, 10)}).`, ''];
  if (v.reasons.length) lines.push(...v.reasons.map(r => `- ${r}`), '');
  lines.push('| Measure | Last week | This week | Change |', '|---|---:|---:|---:|');
  for (const r of rows.filter(x => x.flagged || x.change !== 0)) lines.push(`| ${r.flagged ? '**' : ''}${r.label}${r.flagged ? '**' : ''} | ${n(r.prev)} | ${n(r.now)} | ${r.change >= 0 ? '+' : ''}${n(r.change)} (${pct(r)}) |`);
  if (v.siteChecks.length) lines.push('', '**Site checks that changed** (tests pinned to one real site; they follow the data):', ...v.siteChecks.map(s => `- ${s.test}: ${s.message}`));
  const failed = String(testLog).split('\n').filter(l => /^not ok/.test(l));
  if (failed.length) lines.push('', '**Failing tests**', ...failed.slice(0, 20).map(l => `- ${l.replace(/^not ok \d+ - /, '')}`));
  if (v.held) lines.push('', '**To publish it anyway** (after a look): Actions → *Update data and deploy site* → *Run workflow* → tick **accept_data**. Failing tests still hold it; fix them first.');
  lines.push('', 'General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results.');
  return lines.join('\n');
}
/** data/refresh.json for the app (js/refresh-status.js). */
function refreshJSON(check, issue, today = new Date().toISOString().slice(0, 10)) {
  return { version: 1, status: check.held ? 'held' : 'ok', checked: today, shown: check.held ? String(check.prevAt || '').slice(0, 10) : String(check.nowAt || '').slice(0, 10),
    reasons: check.held ? check.reasons : [], ...(check.held && issue ? { issue } : {}) };
}

function main() {
  if (has('--refresh-json')) {
    const check = readJSON(arg('--check'));
    fs.writeFileSync(arg('--refresh-json'), `${JSON.stringify(refreshJSON(check, arg('--issue') || null), null, 1)}\n`);
    return;
  }
  const prev = measures(arg('--prev')), now = measures(arg('--data') || 'data');
  const rows = compare(prev, now);
  const site = arg('--site-report') && fs.existsSync(arg('--site-report'))
    ? fs.readFileSync(arg('--site-report'), 'utf8').split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch (e) { return null; } }).filter(Boolean) : [];
  const v = verdict(rows, { testsFailed: Number(arg('--tests-failed')) || 0, siteChecks: site, accept: has('--accept') });
  const testLog = arg('--test-log') && fs.existsSync(arg('--test-log')) ? fs.readFileSync(arg('--test-log'), 'utf8') : '';
  const check = { ...v, prevAt: prev.generatedAt, nowAt: now.generatedAt, rows };
  fs.writeFileSync(arg('--out'), JSON.stringify(check, null, 1));
  if (arg('--md')) fs.writeFileSync(arg('--md'), markdown(rows, v, { prevAt: prev.generatedAt, nowAt: now.generatedAt, testLog }));
  console.log(`${v.held ? 'HELD' : 'OK'}: ${v.reasons.join('; ') || 'nothing moved more than usual'}`);
}

if (require.main === module) main();
module.exports = { THRESHOLD, FLOOR, measures, compare, verdict, markdown, refreshJSON };
