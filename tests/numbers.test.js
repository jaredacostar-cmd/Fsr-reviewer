'use strict';
// Design bundle 1 — trust the numbers: one value per fact, the basis named where two differ, one
// rounding and date style, a placeholder instead of a silently missing list, the site before its area.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const U = require('../js/util.js');

test('estimates to three significant figures; dates in one style (UTC)', () => {
  assert.equal(U.sig3(141371), 141000);
  assert.equal(U.sig3(123558), 124000);
  assert.equal(U.sig3(154734), 155000);
  assert.equal(U.sig3(9864), 9860);
  assert.equal(U.sig3(412), 412);
  assert.equal(U.dayText('2026-10-12'), 'Oct 12, 2026');
  assert.equal(U.dayText('2026-01-01'), 'Jan 1, 2026', 'a date-only value never reads a day early');
  assert.equal(U.dayText(''), '');
  const t = src('js/timing.js');
  assert.match(t, /const est = v => fmtNum\(root\.PeelUtil\.sig3 \? root\.PeelUtil\.sig3\(v\) : Math\.round\(v\)\);/);
  assert.match(t, /fig = \(y, b\) => est\(sumTo\(y, b\)\)/);
  assert.match(src('js/overview-tab.js'), /applications as of \$\{esc\(root\.PeelUtil\.dayText \? root\.PeelUtil\.dayText\(asOf\) : asOf\)\}/);
});

test('storage runs out in the same year everywhere: the first whole year at or past the limit', () => {
  // West Brampton Reservoir: required reaches its 40 ML in 2029 (34 in 2026 → 44 in 2031).
  const wt = src('js/water-tab.js');
  const fn = new Function(`${wt.match(/const storageRoomTrigger = \(years, required, available\) => \{[\s\S]*?\n {2}\};/)[0]}; return storageRoomTrigger;`)();
  const r = fn([2019, 2021, 2026, 2031, 2036, 2041], [31, 32, 34, 44, 46, 49], [40, 40, 40, 40, 40, 40]);
  assert.equal(r.c100, 2029);
  assert.equal(fn([2019, 2021, 2026, 2031, 2036, 2041], [31, 31, 43, 44, 46, 49], [46, 46, 46, 46, 46, 46]).c90, 2026, '41.4 ML is reached in 2025.3: the first whole year is 2026');
  // The site's relief check uses the same comparison (reaches, not passes).
  assert.match(src('js/masterplan.js'), /if \(avail\(y\) > 0 && req\(y\) >= avail\(y\)\) return y;/);
});

test('the sentence and the figure beside it agree, or each names its basis', () => {
  const ov = src('js/overview-tab.js');
  // Overview / Home: the figure carries the answer's "added since the 2021 census".
  assert.match(ov, /const since = \(v, d, f\) => \(d >= 0\.5 \? `\$\{f\(Math\.max\(0, v - d\)\)\} added since the 2021 census` : ''\);/);
  assert.match(ov, /since\(e\.population, pre\.people, x => fmtNum\(roundPop\(x\)\)\)/);
  assert.match(ov, /since\(unitsAll, pre\.units, x => fmtNum\(Math\.round\(x\)\)\)/);
  assert.match(ov, /areaPanelSpec\(\{ set, e, basis, pipe, unitsAll, unitsWord, inPlan, left, n, lyTiles, capList, nd, hl, permitCaveat, info, fr, nDue, pre \}\)/);
  // Capital › Timing: the total held back and one project's share are both named.
  const dca = src('js/dca-tab.js');
  assert.match(dca, /With every project as scheduled, <strong>≈\$\{pp\(R\.baseBo\)\} people<\/strong> are still constrained at build-out/);
  assert.match(dca, /more would be, the most of any one project/);
  // Growth: completed, and how many of them since the census (the chart's "Built since 2021").
  assert.match(src('js/growth-ui.js'), /completed\$\{sinceC >= 0\.5 && Math\.round\(sinceC\) !== Math\.round\(t\.completed\)/);
  // Growth › Timing names its pace; the trigger year is not doubled ("≈2027 2027").
  const t = src('js/timing.js');
  assert.match(t, /title: 'Plants: 90% trigger year at the forecast pace'/);
  assert.match(t, /x\.txt !== String\(x\.like\) \? ` <small>range/);
  assert.match(t, /Servicing › Capacity puts every file on its own schedule instead/);
  // The full table names what each "over" is against.
  assert.match(src('js/svc-capacity.js'), />Room \/ over capacity<\/th><th rowspan="2" title="[^"]+">Impact past the limit<\/th>/);
});

test('no negative room: an over is "over by", with positive people', () => {
  const d = src('js/demand-ui.js');
  assert.match(d, /v: qAbs\(x\), u: uOf\(x\), label: `\$\{SV\(\)\.PLANT_SHORT\[x\.pl\]\} \$\{allocWord\(x\)\}`/);
  assert.match(d, /<strong>\$\{window\.PeelUtil\.roomWords\(x\.after\)\}<\/strong><small>≈\$\{fmtNum\(roundPop\(Math\.abs\(x\.peopleAfter\)\)\)\} people/);
  assert.doesNotMatch(d, /fmt1\(x\.after\)\b/);
  assert.match(d, /const qAbs = x => \(small\(x\) \? fmtNum\(Math\.round\(Math\.abs\(x\.after\) \* 1000\)\) : fmt1\(Math\.abs\(x\.after\)\)\)/, 'a small system in m³/d, never negative');
});

test('people and jobs round the same way on every page; units stay exact', () => {
  const w = src('js/ws-pages.js');
  assert.match(w, /p0 = v => fmtNum\(U\.roundPop \? U\.roundPop\(v\) : Math\.round\(v\)\)/);
  assert.match(w, /\{ v: p0\(m\.people\), u: 'people'/);
  assert.match(w, /\{ v: p0\(emp\.jobs >= 0\.5 \? emp\.jobs : m\.jobs\), u: 'jobs'/);
  assert.doesNotMatch(w, /n0\(m\.people\)|n0\(c\.m\.people\)|n0\(emp\.jobs\)/);
});

test('Home keeps Needs attention in its place while the servicing model loads, and redraws when it has', () => {
  const w = src('js/ws-pages.js');
  assert.match(w, /const wait = \{ title: 'Needs attention', rows: \[\{ kv: true, html: '<span class="muted">Checking servicing capacity…<\/span>' \}\], total: 1 \};/);
  assert.match(w, /lists: \[ready \? toPage\('tight', needs\) : needs, unbuilt, tgt, toPage\('week', week\)\]/);
  assert.match(w, /caption: !ready \? '<span class="muted">Checking servicing capacity…<\/span>'/);
  assert.match(src('js/svc-tab.js'), /if \(AT\(\)\.getFootTab\(\) === 'overview' \|\| \(root\.PeelWorkspaces && root\.PeelWorkspaces\.mode\(\) !== 'full'\)\) OV\(\)\.renderOverview\(\);/);
});

test('at a development: the site first, its census area labelled, one status line', () => {
  const g = src('js/growth-ui.js');
  assert.match(g, /answer: `<strong>\$\{esc\(p\.title\)\}<\/strong> plans <strong>\$\{fmtNum\(Math\.round\(st\.planned\)\)\}<\/strong> homes/);
  assert.match(g, /In its 2021 census area, <strong>\$\{fmtNum\(set\.length\)\}<\/strong> developments propose/);
  assert.match(g, /title: `In its 2021 census area \(\$\{fmtNum\(set\.length\)\} developments\)`/);
  assert.match(g, /its census area: \$\{fmtNum\(set\.length\)\} developments/);
  assert.doesNotMatch(g, /Around \$\{esc\(App\(\)\.state\.daCtx\.title\)\}/);
  // The header names the phase and the zoning approval together; the site bar keeps only the by-law.
  const win = { PeelPhases: { PHASE_BY_KEY: { review: { label: 'In review', rank: 2 }, approved: { label: 'Approved, no permit yet', rank: 3 } } } };
  const ctx = { window: win }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/panel.js'), ctx);
  const h = win.PeelPanel.siteHead({ title: '0 HERITAGE RD', municipality: 'Brampton', phase: 'review', rank: 2, zoningApproved: { bylaws: ['2024-101'] }, records: [] });
  assert.equal(h.status.text, 'In review · zoning approved');
  assert.equal(win.PeelPanel.siteHead({ title: 'x', municipality: 'Brampton', phase: 'review', rank: 2, records: [] }).status.text, 'In review');
  assert.match(src('js/dev-detail.js'), /out\.push\(chipGo\(`Zoning by-law \$\{esc\(p\.zoningApproved\.bylaws\[0\]\)\}`, '', \{ 'data-dev-hist': 'council' \}/);
});

test('small shares read "<1%", plurals agree', () => {
  const ctx = { module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/ws-pages.js'), ctx);
  const WP = ctx.module.exports;
  const html = WP.stageChartHTML({ rows: [{ key: 'built', label: 'Built since 2021', note: 'x', units: 2, est: 0, pct: 0.01 }, { key: 'proposed', label: 'In review', note: 'y', units: 19998, est: 0, pct: 99.99 }], total: 20000 }, 0);
  assert.match(html, /&lt;1%/);
  assert.match(src('js/ws-pages.js'), /file\$\{moved\.length === 1 \? '' : 's'\} moved stage/);
});
