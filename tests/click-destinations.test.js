'use strict';
// SPEC §3: every click lands in the right panel. DC works, pipes, single files, blocks, water
// facilities, selections and tool results open as scopes through PeelSvcScope.openResult: trail step,
// share link, left panel filtered to what they list. #pane-tool and #detail are gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const JS = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));

function loadScope() {
  const calls = [];
  const win = {
    PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelPhases: require('../js/phases.js'),
    PeelApp: { state: { ss: null, svcGen: 0, servicing: null }, applyFilters: () => calls.push('filter') },
    PeelOverviewTab: { renderOverview: () => calls.push('render') },
    PeelAnalysisTabs: { setFootPref: () => {}, showFootTab: t => calls.push(`tab:${t}`) },
    PeelShare: { viewLink: { write: () => calls.push('link') } },
    PeelTopbar: { renderTrail: () => calls.push('trail') },
  };
  win.window = win;
  const document = { addEventListener() {}, getElementById: () => null, dispatchEvent() {} };
  const ctx = vm.createContext({ window: win, document, console, Set, Map, CustomEvent: undefined });
  vm.runInContext(src('js/svc-scope.js'), ctx);
  return { S: win.PeelSvcScope, win, calls };
}

test('a result scope: ref, trail step, filtered to the developments it lists, closed back to Peel', () => {
  const { S, win, calls } = loadScope();
  assert.equal(S.isResultRef('pipe:12'), true);
  assert.equal(S.isResultRef('plant:Lakeview'), false);
  S.openResult({ ref: 'pipe:12', title: '300 mm sanitary sewer', html: '<tr class="ld-row" data-dev="Brampton|1 A ST"></tr><tr data-dev="Caledon|2 B RD"></tr>', filter: true });
  assert.equal(win.PeelApp.state.ss, 'pipe:12');
  assert.ok(S.hasResult());
  const cur = S.current();
  assert.equal(cur.kind, 'result'); assert.equal(cur.rkind, 'pipe');
  assert.equal(S.has({ key: 'Brampton|1 A ST' }), true);
  assert.equal(S.has({ key: 'Mississauga|3 C AVE' }), false, 'the left panel and map show only what it lists');
  assert.deepEqual(Array.from(S.crumbs(), c => c.label), ['300 mm sanitary sewer']);
  assert.ok(calls.includes('tab:overview') && calls.includes('trail') && calls.includes('link'));
  // devKeys given explicitly win over the rows; a tool result with no list filters nothing.
  S.openResult({ ref: 'file:u1', title: 'OZS-2025-0032', html: '', devKeys: ['Brampton|2055 BOVAIRD DR W'] });
  assert.equal(S.has({ key: 'Brampton|2055 BOVAIRD DR W' }), true); assert.equal(S.has({ key: 'x' }), false);
  S.openResult({ title: 'Inspect point', html: '<p>x</p>' });
  assert.equal(win.PeelApp.state.ss, 'tool:inspect-point'); assert.equal(S.has({ key: 'x' }), true);
  assert.equal(S.closeResult(), true);
  assert.equal(win.PeelApp.state.ss, null); assert.equal(S.hasResult(), false); assert.equal(S.closeResult(), false);
});

test('opening a servicing scope replaces a result scope', () => {
  const { S, win } = loadScope();
  S.openResult({ ref: 'dcwork:wastewater:22-2255', title: 'DC main', html: '' });
  S.clear();
  assert.equal(win.PeelApp.state.ss, null); assert.equal(S.hasResult(), false);
});

test('devKeysOf reads the data-dev rows (escaped keys too)', () => {
  const { S } = loadScope();
  assert.deepEqual([...S.devKeysOf('<a data-dev="A &amp; B|1"></a><b data-dev="C|2"></b><b data-dev="C|2"></b>')], ['A & B|1', 'C|2']);
  assert.equal(S.devKeysOf('<p>none</p>'), null);
});

test('every producer opens a named scope: file, pipe, DC work, block, water facility, selection (Help is a page: bundle 6)', () => {
  for (const [f, re] of [
    ['js/aerial-check.js', /openResult\(\{ ref: `file:\$\{r\.uid\}`/],
    ['js/sewer-cap.js', /\{ ref: `pipe:\$\{i\}`, devKeys: up\.map\(r => r\.dev\.key\) \}/],
    ['js/dc-infra.js', /\{ ref: `dcwork:\$\{fc\.sys\}:\$\{fc\.name\}` \}/],
    // (a DC main's result has its trail group since navigation phase 4: Peel › DC timing › the main)
    ['js/masterplan.js', /\{ ref: `dcwork:\$\{ln\.sys\}:\$\{ln\.p \|\| ln\.c\}`, group: 'DC timing' \}/],
    ['js/sewer-trace.js', /openResult\(\{ ref: `iiblock:\$\{b\.id\}`/],
    ['js/water-trace.js', /openResult\(\{ ref: `wfac:/],
    ['js/measure.js', /ref: 'sel:selection'/],
  ]) assert.match(src(f), re, f);
  assert.match(src('js/tools.js'), /return S\.openResult\(opts \|\| \{\}\);/, 'PeelTools.openResult goes through the scope');
});

test('#pane-tool and #detail are gone from the markup and the code', () => {
  const html = src('index.html');
  for (const id of ['id="pane-tool"', 'id="ftab-tool"', 'id="detail"', 'id="detail-body"', 'id="detail-grip"']) assert.ok(!html.includes(id), id);
  for (const f of JS) {
    const code = src(`js/${f}`).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /['"`]#detail(-body|-grip|-close)?['"`,]|#pane-tool/, `${f} still uses #detail / #pane-tool`);
  }
});

test('a shared link re-opens a pipe, a file, a DC work, a block, an EA or a capital project; tool results are not written to links', () => {
  const sh = src('js/share.js');
  assert.match(sh, /!\/\^\(pipe\|file\|dcwork\|iiblock\|ea\|cap\):\/\.test\(App\(\)\.state\.ss\)/);
  const sc = src('js/svc-scope.js');
  for (const k of ['pipe', 'file', 'dcwork', 'iiblock', 'ea', 'cap']) assert.match(sc, new RegExp(`\\n    ${k}: `), `restore ${k}`);
});

test('one hover card: kind, name, the number, what a click does', () => {
  const U = require('../js/util.js');
  const h = U.hoverCard({ kind: 'Pumping station', name: 'Richards Memorial PS', value: '110%', sub: 'of firm at build-out (peak wet)', also: 'Trace upstream from its scope' });
  assert.match(h, /<span class="hc-k">Pumping station<\/span><strong class="hc-n">Richards Memorial PS<\/strong><div class="hc-v"><b>110%<\/b> <span>of firm at build-out \(peak wet\)<\/span><\/div>/);
  assert.match(h, /<div class="hc-a">Click: open its scope · Trace upstream from its scope<\/div>/);
  assert.match(U.hoverCard({ name: '<x>' }), /&lt;x&gt;/);
  for (const f of ['js/render-list.js', 'js/map-markers.js', 'js/map-analysis.js', 'js/svc-data.js', 'js/sewer-cap.js', 'js/dc-infra.js', 'js/sewer-trace.js', 'js/water-trace.js'])
    assert.match(src(f), /PeelUtil\.hoverCard/, `${f} uses the shared hover card`);
});

test('site tools: one Tools menu (trace, Check FSR, memo, allocation, Compare, Export) beside Watch (design bundle 4)', () => {
  const d = src('js/devscope.js');
  const acts = d.slice(d.indexOf('<div class="site-bar-actions">'), d.indexOf('<div class="site-bar-fsr"'));
  const menu = acts.slice(acts.indexOf('<details class="site-more site-tools">'), acts.indexOf('</details>'));
  const rest = acts.slice(acts.indexOf('</details>'));
  for (const a of ['data-trace=', 'data-wtrace=', 'data-scope-fsr', 'data-memo', 'data-scope-alloc', 'data-scope-compare', 'data-scope-export']) { assert.ok(menu.includes(a), a); assert.ok(!rest.includes(a), `${a} once`); }
  assert.match(menu, /<summary class="btn small"[^>]*>Tools ▾<\/summary>/);
  assert.ok(rest.includes('data-watch='), 'Watch stays a button');
  // The footer no longer repeats Check FSR.
  assert.doesNotMatch(src('js/overview-tab.js'), /label: 'Check FSR'/);
});

// Navigation phase 1 (NP-1, AD-13): a result started at the open development keeps it (keepDev). The
// Inquiry draft is the one that does: a development action and an Export ▾ item, one function, one result.
test('keepDev: a result started at the open development keeps it; any other result replaces it', () => {
  const { S, win, calls } = loadScope();
  let dev = { key: 'Brampton|1 A ST', title: '1 A ST' }, snap = 'half';
  win.DevScope = { current: () => dev, close: () => { calls.push('dev-close'); dev = null; } };
  // (a phone: the bottom sheet)
  const saved = [];
  win.PeelDataTab = { shellNarrow: () => true }; Object.assign(win.PeelApp, { getAnalysisSnap: () => snap, setAnalysisSnap: (x, save = true) => { snap = x; if (save) saved.push(x); } });
  S.openResult({ title: 'Inquiry draft — 1 A ST', html: '<pre class="tinq-pre">x</pre>', keepDev: true });
  assert.ok(!calls.includes('dev-close'), 'the development stays open');
  assert.equal(snap, 'full', 'on a phone the sheet opens all the way: the site bar sits above the result');
  assert.deepEqual(saved, [], 'for this result only: not remembered (the map never reopens under a full sheet)');
  assert.equal(win.PeelApp.state.ss, 'tool:inquiry-draft-1-a-st');
  assert.equal(S.current().result.keepDev, true); assert.equal(S.keepsDev(), true);
  assert.equal(S.closeResult(), true);
  assert.equal(S.keepsDev(), false); assert.ok(dev, 'closing the draft goes back to the development');
  assert.equal(snap, 'half', '× puts the sheet back where it was');
  // The trail's Peel step (the scope cleared, the development closed) puts it back too; a sheet moved
  // since the raise stays where it was moved to.
  snap = 'peek'; S.openResult({ title: 'Inquiry draft — 1 A ST', html: '', keepDev: true }); assert.equal(snap, 'full');
  S.clear(); assert.equal(snap, 'peek');
  S.openResult({ title: 'Inquiry draft — 1 A ST', html: '', keepDev: true }); snap = 'half';
  S.closeResult(); assert.equal(snap, 'half');
  assert.deepEqual(saved, [], 'none of it remembered');
  // A plain result (a pick, a tool) replaces the development: one scope at a time.
  snap = 'peek';
  S.openResult({ title: 'Inspect point', html: '<p>x</p>' });
  assert.equal(snap, 'half', 'a plain result raises the sheet from its peek, as before');
  assert.deepEqual(saved, ['half'], '(remembered, as before)');
  assert.ok(calls.includes('dev-close') && dev === null, 'a plain result closes the development');
  assert.equal(S.keepsDev(), false);
  // With no development open there is nothing to keep.
  S.openResult({ title: 'Inquiry draft — point', html: '', keepDev: true });
  assert.equal(S.current().result.keepDev, false); assert.equal(S.keepsDev(), false);
});

test('keepDev: the kept result shows on Overview, its trail Peel › the site › the result', () => {
  const ov = src('js/overview-tab.js'), pn = src('js/panel.js'), tb = src('js/topbar.js');
  // The Overview shows the result over the site (still checking the development scope first), the site's card hidden.
  assert.match(ov, /if \(resultHost\(rsc && rsc\.kind === 'result' && \(!DV\(\)\.scopedDev\(\) \|\| rsc\.result\.keepDev\) \? rsc : null\)\) \{ const sec = \$\('#ov-dev'\); if \(sec\) sec\.hidden = true; return; \}/);
  // Its header: Peel (closes both) › the site (closes the result) › the kind; rebuilt when the site changes.
  assert.match(ov, /const kd = rs\.result\.keepDev \? DV\(\)\.scopedDev\(\) : null;/);
  assert.match(ov, /\(host\.dataset\.kd \|\| ''\) !== \(kd \? kd\.key : ''\)/);
  assert.match(ov, /const site = kd \? \[\{ label: kd\.title, attrs: \{ 'data-scope-result-close': '' \} \}\] : \[\];/);
  assert.match(ov, /trail: \[\{ label: 'Peel', attrs: kd \? \{ 'data-scope-result-close': '', 'data-pnl-dev-close': '' \} : \{ 'data-scope-result-close': '' \} \}, \.\.\.site, \{ label: kind\.split\(' · '\)\[0\] \}\]/);
  // The site's own Overview panel does not cover it (pnl-on hides the panes).
  assert.match(pn, /const kept = t === 'overview' && root\.PeelSvcScope && root\.PeelSvcScope\.keepsDev && root\.PeelSvcScope\.keepsDev\(\);\n\s*const e = kept \? null : ov \?/);
  // The top bar: the site before the result's crumbs, its step closing the result; else the ladder first.
  const rt = tb.slice(tb.indexOf('function renderTrail()'), tb.indexOf('const tc = '));
  const at = s => { const i = rt.indexOf(s); assert.ok(i >= 0, s); return i; };
  assert.ok(at('if (kept) steps.push(devStep);') < at('steps.push(...window.PeelSvcScope.crumbs());'));
  assert.ok(at('steps.push(...window.PeelSvcScope.crumbs());') < at('if (scoped && !kept) steps.push(devStep);'));
  assert.match(rt, /kept \? \{ label: scoped\.title \|\| 'Development', go: \(\) => SS\.closeResult\(\),/);
  assert.match(rt, /: \{ label: scoped\.title \|\| 'Development', go: trailGoDev, title: 'Reopen this development' \}/);
});

test('the Inquiry draft: one function, a development action and the Export item, the development kept', () => {
  const opened = [];
  const win = { PeelTools: { openResult: o => opened.push(o) }, PeelApp: { scope: { estimate: () => null, svcFacts: () => null }, state: {}, whatIfProject: w => ({ ...w, title: w.name }) } };
  win.window = win;
  vm.runInContext(src('js/tools-inquiry.js'), vm.createContext({ window: win, console, Date, Math, String, Number, isFinite }));
  win.PeelToolInquiry.draftForDevelopment({ title: '1 A ST', municipality: 'Brampton', phase: 'approved', lat: 43.7, lng: -79.7 });
  win.PeelToolInquiry.draftForPoint({ lat: 43.7, lng: -79.7 });
  assert.deepEqual(opened.map(o => [o.title, o.keepDev]), [['Inquiry draft — 1 A ST', true], ['Inquiry draft — point', false]]);
  assert.match(opened[0].html, /data-tinq-copy>Copy<\/button>[\s\S]*<pre class="tinq-pre">/, 'its own Copy button');
  const tb = src('js/topbar.js'), fn = tb.slice(tb.indexOf('function draftInquiryResponse()'), tb.indexOf('function renderExportMenu()'));
  // From a page the map opens first (the panel hosts are empty on a page), then one result.
  assert.match(fn, /const W = root\.PeelWorkspaces; if \(W && W\.mode && W\.mode\(\) === 'home' && W\.setMode\) W\.setMode\('full'\);/);
  assert.match(fn, /if \(p\) \{ I\.draftForDevelopment\(p\); return; \}/);
  assert.equal((fn.match(/openResult\(/g) || []).length, 2, 'only the "not loaded" and "open a development first" results besides the draft');
  assert.doesNotMatch(tb, /inq-copy|inq-draft/);
  assert.doesNotMatch(src('css/app.css'), /\.inq-draft/);
  // Both entries call it: the Export ▾ item and any [data-inquiry] button.
  assert.match(tb, /data-tbx="inquiry">Inquiry response draft<\/button>/);
  assert.match(tb, /inquiry: draftInquiryResponse \}\[b\.dataset\.tbx\]/);
  assert.match(tb, /document\.addEventListener\('click', e => \{ if \(e\.target\.closest && e\.target\.closest\('\[data-inquiry\]'\)\) draftInquiryResponse\(\); \}\);/);
  // The site page (beside the memo, the actions on one line: dead-ui DV-12) and the map's development Overview.
  assert.match(src('js/ws-pages.js'), /function site\(\)[\s\S]*?actions: \[\{ label: 'Servicing memo', attrs: \{ 'data-pnl-memo': '' \}, primary: true \}, \{ label: 'Inquiry draft', attrs: \{ 'data-inquiry': '' \}[^\n]*'data-watch': p\.key/);
  assert.match(src('js/overview-tab.js'), /foot: \{ primary: \{ label: 'Servicing memo', attrs: \{ 'data-pnl-memo': '' \}[^\n]*secondary: \[\{ label: 'Inquiry draft', attrs: \{ 'data-inquiry': '' \}/);
});

// Navigation phase 1 (AD-5, design §9 #5): Review outlets is a tool page reached from Records › Data
// checks, a site's path line (Review →) and the sidebar (QA/QC); each way in is a data-ws-page button,
// which opens the page from the map and from a page alike (one document-wide handler).
test('Review outlets opens from Records › Data checks, a site’s path line and the sidebar', () => {
  const r = src('js/records-tab.js');
  assert.match(r, /btn: '<button type="button" class="btn small link" data-ws-page="outlets">Review outlets →<\/button>'/);
  assert.match(r, /<p class="small muted">\$\{OUTLETS\.what\}: \$\{OUTLETS\.btn\}<\/p>`;/, 'the full table (checksHTML)');
  // (navigation phase 2: the list is "Where developments discharge", with the count to review once the DC
  // model is worked out, and the footer's secondary action; tests/servicing-records.test.js runs it)
  assert.match(r, /\{ title: 'Where developments discharge', rows: \[\{ attrs: \{ 'data-ws-page': 'outlets', title: 'Review outlets: check and fix where each development discharges' \}, html: `<div class="pnl-r-top"><span class="pnl-r-name">Review outlets →<\/span>\$\{n == null \? '' : `<span class="pnl-r-fig">\$\{fmtNum\(n\)\}<small>to review<\/small><\/span>`\}<\/div><small class="pnl-r-line">\$\{OUTLETS\.what\}<\/small>` \}\], total: 1 \}\]/, 'the panel: its own list, whatever the checks');
  assert.match(r, /secondary: \[\{ label: 'Review outlets', attrs: \{ 'data-ws-page': 'outlets' \}/, 'and its footer');
  assert.match(src('js/overview-tab.js'), /data-ws-page="outlets" data-dvo="pick-dev"/, 'the path line');
  const W = require('../js/workspaces.js');
  assert.ok(W.GROUPS.some(([g, ids]) => g === 'QA/QC' && ids.includes('outlets')), 'the sidebar');
  assert.match(src('js/workspaces.js'), /const pg = e\.target\.closest\('\[data-ws-page\]'\);\n {4}if \(pg\) \{ e\.preventDefault\(\); menuOpen = false; openPage\(pg\.dataset\.wsPage\); return; \}/);
  assert.match(src('js/tips.js'), /Also Records › Data checks \(Review outlets →\), and "Review →" on a development’s Overview/);
});
