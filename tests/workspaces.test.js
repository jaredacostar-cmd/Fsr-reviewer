'use strict';
// Stage 4 — workspaces and Home. The brief's tests:
//   1. each chip opens the stated tab and scope;
//   2. workspace figures equal full-map figures;
//   3. Home links open the matching chip;
//   4. old links still open the full map.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const W = (() => { const ctx = { module: { exports: {} }, URLSearchParams }; ctx.globalThis = ctx; vm.runInNewContext(src('js/workspaces.js'), ctx); return ctx.module.exports; })();

test('1. the chips, in the brief\'s order, and Home\'s groups', () => {
  assert.deepEqual(plain(W.WS.map(w => w.label)), ['Check a site', 'Servicing capacity', 'Growth in an area', 'Review an FSR', 'Forecast', 'Study area', 'DC projects', 'EA to construction', 'Review outlets', 'Old pipes', 'What’s coming', 'This week']);
  // Home's sidebar: This week under Home (bundle 6), then Planning (Servicing capacity with it),
  // Capital, QA/QC (Review outlets), Asset Management; then Full map.
  // Explore (step 3): Growth in an area, Check a site, Review an FSR, Forecast and Study area are one entry.
  assert.deepEqual(plain(W.GROUPS), [['Planning', ['explore', 'tight', 'coming']], ['Capital', ['capital']], ['QA/QC', ['outlets']], ['Asset Management', ['pipes']]]);
  assert.deepEqual(plain(W.CAPITAL), ['projects', 'eaflow']);
  assert.deepEqual(plain(W.EXPLORE), ['growth', 'site', 'fsr', 'outlook', 'study']);
  assert.match(fs.readFileSync(path.join(__dirname, '..', 'js', 'workspaces.js'), 'utf8'), /<ul>\$\{item\('home', 'The briefing'\)\}\$\{item\('week', BY_ID\.week\.what\)\}<\/ul>/);
  for (const w of W.WS) assert.ok(w.what.split(/\s+/).length <= 8, `${w.id}: 8 words or fewer`);
  const all = [...W.GROUPS.flatMap(g => g[1]).flatMap(id => (id === 'explore' ? W.EXPLORE : id === 'capital' ? W.CAPITAL : [id])), 'week'].sort();
  assert.deepEqual(plain(all), plain(W.WS.map(w => w.id).sort()), 'every workspace listed once');
});

test('1. each chip opens the stated tab and scope (and the layer preset)', () => {
  const want = {
    site: ['overview', '', 'find', 'planning'], tight: ['svc', 'capacity', 'area', 'wastewater'], growth: ['growth', 'areas', 'area', 'planning'],
    fsr: ['svc', 'network', 'find', 'wastewater'], study: ['overview', '', 'drawn', 'planning'], projects: ['dca', 'timing', 'area', 'dc'],
    pipes: ['svc', 'network', 'area', 'wastewater'], outlook: ['growth', 'timing', 'area', 'planning'], eaflow: ['dca', 'eas', 'area', 'dc'], week: ['overview', '', 'area', 'planning'],
    coming: ['growth', 'timing', 'area', 'planning'],
  };
  for (const [id, [tab, sub, scope, view]] of Object.entries(want)) {
    const p = W.plan(id, { site: false });
    assert.deepEqual([p.tab, p.sub, p.scope, p.view], [tab, sub, scope, view], id);
    assert.equal(p.closeScopes, scope === 'area', `${id}: an area chip leaves a site`);
  }
  assert.equal(W.plan('coming').fold, 'period', 'What’s coming opens the Forecast at By period'); assert.equal(W.plan('outlook').fold, null);
  assert.equal(W.plan('eaflow').fold, 'eaflow', 'EA to construction opens Capital › EAs at its fold'); assert.equal(W.plan('projects').fold, null);
  // With a development open: Check a site → Overview at the site; Review an FSR → Servicing › FSR review at
  // the site (navigation phase 5: its own view, siteSub); without one, its Find step on Network; area chips
  // close the site.
  assert.deepEqual(plain(['site', 'fsr'].map(id => { const p = W.plan(id, { site: true }); return [p.tab, p.sub, p.scope]; })), [['overview', '', 'site'], ['svc', 'fsr', 'site']]);
  assert.equal(W.plan('fsr', {}).sub, 'network', 'the Find step');
  assert.equal(W.plan('fsr', { site: true }).source, 'Review an FSR · from Servicing › FSR review');
  assert.equal(W.sourceText('fsr', 'svc:fsr'), 'Review an FSR · Servicing › FSR review');
  assert.equal(W.plan('tight', { site: true }).closeScopes, true);
  assert.equal(W.plan('study').lasso, true);
  // The header names the source tab.
  assert.equal(W.plan('tight').source, 'Servicing capacity · from Servicing › Capacity');
  assert.equal(W.sourceText('tight', 'svc:capacity'), 'Servicing capacity · from Servicing › Capacity');
  assert.equal(W.sourceText('tight', 'growth:areas'), 'Servicing capacity · Growth › Areas');
  assert.equal(W.sourceText('week', 'overview:'), 'This week · from Overview');
  // The browser does what the plan says (go()), and every panel in a workspace carries Open full map.
  const s = src('js/workspaces.js');
  assert.match(s, /if \(pl\.closeScopes\) \{\s*if \(site\) root\.DevScope\.close\(\);\s*if \(SS\(\) && SS\(\)\.current && SS\(\)\.current\(\)\) SS\(\)\.close\(\);/);
  assert.match(s, /lean\(pl\.view, LAYERS\[id\] \|\| \[\]\);/);
  assert.match(s, /MA\.showView\(view\);\s*if \(LG && LG\.apply\) LG\.apply\(new Set\(layers\)\);/);
  assert.match(s, /if \(pl\.sub && A\.setSub\) A\.setSub\(pl\.tab, pl\.sub\); if \(A\.setFootPref\) A\.setFootPref\(pl\.tab\); A\.showFootTab\(pl\.tab\);/);
  assert.match(s, /data-ws-full title="The same scope, filters and scenario with every tool">Full map →/);
  assert.match(src('js/panel.js'), /e\.html\.replace\(HEAD, `\$\{HEAD\}\$\{W\.srcLine\(key\)\}`\)/);
});

test('Old pipes: 50+ years old or moderate risk, carrying 100+ units at build-out; runs of one main', () => {
  // [diameterMm, slope, capacityLs, next, censusPopUp, haUp, plant, installYear, material, risk, coords, share, invertUp, invertDown, lengthM]
  const data = { risks: ['LOW', 'INSIGNIFICANT', 'MODERATE', ''], materials: ['CONP', 'PVC'], plants: ['Lakeview'], pipes: [
    [900, 0.01, 1, 1, 0, 0, 0, 1960, 0, 0, [0, 0], 1, 0, 0, 100],   // 0: old, low risk, 5,000 units → listed (drains into 1)
    [900, 0.01, 1, 4, 0, 0, 0, 1960, 0, 0, [0, 0], 1, 0, 0, 120],   // 1: same main, 5,200 units → listed, one run with 0
    [300, 0.01, 1, -1, 0, 0, 0, 1999, 1, 2, [0, 0], 1, 0, 0, 80],   // 2: new, moderate risk, 150 units → listed
    [300, 0.01, 1, -1, 0, 0, 0, 1999, 1, 1, [0, 0], 1, 0, 0, 80],   // 3: new, not risky → out
    [600, 0.01, 1, -1, 0, 0, 0, 1950, 0, 0, [0, 0], 1, 0, 0, 90],   // 4: old but 99 units → out
    [450, 0.01, 1, -1, 0, 0, 0, null, 0, 3, [0, 0], 1, 0, 0, 90],   // 5: year not recorded, not rated → out
    [450, 0.01, 1, -1, 0, 0, 0, 1976, 0, 1, [0, 0], 1, 0, 0, 90],   // 6: exactly 50 years old in 2026, 100 units → listed
  ] };
  const units = [5000, 5200, 150, 9000, 99, 9000, 100];
  const list = W.oldPipes(data, units, 2026);
  assert.deepEqual(plain(list.map(r => r.i)), [1, 0, 2, 6], 'ranked by units carried');
  assert.deepEqual(plain(list.map(r => [r.old, r.risky])), [[true, false], [true, false], [false, true], [true, false]]);
  const runs = W.pipeRuns(list, data);
  assert.deepEqual(plain(runs.map(r => [r.i, r.n, r.lengthM, r.units])), [[1, 2, 220, 5200], [2, 1, 80, 150], [6, 1, 90, 100]]);
  // The units carried come from the same per-pipe accumulation as the sewer loads (js/sewer-cap.js).
  assert.match(src('js/sewer-cap.js'), /t\.units\[k\] \+= \(e\.totalUnits \|\| 0\) \* f;/);
  assert.deepEqual(plain(W.OLD), { age: 50, minUnits: 100, risk: 'MODERATE' });
});

test('4. old links still open the full map; the start screen preference otherwise', () => {
  // Old share links (any hash without w): the full map, as before.
  for (const h of ['#t=ww&ws=plants', '#t=census', '#d=Brampton%7C%4043.67%2C-79.84&t=overview', '#m=43.6,-79.7,11', '#ph=review&mu=Brampton']) assert.deepEqual(plain(W.startScreen({ hash: h, pref: 'home' })), { mode: 'full' }, h);
  // New links name their mode.
  assert.deepEqual(plain(W.startScreen({ hash: '#t=overview&w=home' })), { mode: 'home', page: 'home' });
  assert.deepEqual(plain(W.startScreen({ hash: '#t=svc&w=p:tight' })), { mode: 'home', page: 'tight' }, 'a workspace page');
  assert.deepEqual(plain(W.startScreen({ hash: '#t=svc&svs=capacity&w=tight' })), { mode: 'ws', ws: 'tight' }, 'its map view');
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:nonsense' })), { mode: 'full' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=nonsense' })), { mode: 'full' });
  // No link: Home by default; the last workspace's page (Servicing capacity the first time); or the full map.
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'home' })), { mode: 'home', page: 'home' });
  assert.deepEqual(plain(W.startScreen({ hash: '' })), { mode: 'home', page: 'home' });
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'last', last: 'pipes' })), { mode: 'home', page: 'pipes' });
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'last', last: null })), { mode: 'home', page: 'tight' });
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'full' })), { mode: 'full' });
  assert.equal(W.defaultWs, undefined, 'the last-workspace rule is startScreen\'s alone');
  // The link carries w only in Home or a workspace (old links: tests/nav-aliases.test.js).
  const sh = src('js/share.js');
  assert.match(sh, /if \(W && W\.mode\(\) === 'home'\) set\('w', W\.page && W\.page\(\) !== 'home' \? `p:\$\{W\.page\(\)\}` : 'home'\); else if \(W && W\.mode\(\) === 'ws' && W\.current\(\)\) set\('w', W\.current\(\)\);/);
  assert.match(src('js/app.js'), /if \(window\.PeelWorkspaces\) window\.PeelWorkspaces\.init\(\);/);
});

// The browser half of js/workspaces.js with the real panel builder and a stub page.
// (o.setTimeout / o.clearTimeout: timers to queue instead of running at once)
function loadBrowser(areaSpec, o = {}) {
  const nodes = { '#home': { hidden: false, innerHTML: '' } };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: s => nodes[s] || null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const store = new Map();
  const window = { document, PeelUtil: { esc: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'), fmtNum: n => Math.round(n).toLocaleString('en-CA'), store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } },
    PeelOverviewTab: { lastAreaSpec: () => areaSpec }, PeelMapMarkers: { THIS_YEAR: 2026 }, PeelSvcCapacity: { collect: () => [] }, PeelApp: { state: { muni: '', projects: [] } } };
  const ctx = { window, document, location: { hash: '' }, setTimeout: o.setTimeout || (f => f()), clearTimeout: o.clearTimeout || (() => {}), URLSearchParams, CustomEvent: function CustomEvent() {} }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/panel.js'), ctx);
  vm.runInNewContext(src('js/ws-pages.js'), ctx);
  vm.runInNewContext(src('js/workspaces.js'), ctx);
  return { W: window.PeelWorkspaces, PN: window.PeelPanel, nodes, window };
}
const AREA = {
  head: { identity: 'Peel · all of Peel', status: { tone: 'over', text: '9 over' } },
  answer: 'The 1,485 developments shown would add about 671,900 people.',
  figures: [{ v: '1,485', u: 'developments', label: 'shown on the map', ctx: 'all of Peel' }, { v: '228,490', u: 'units', label: 'planned', ctx: '' }, { v: '671,900', u: 'people', label: 'at build-out', ctx: '' }, { v: '81,900', u: 'jobs', label: 'on development sites', ctx: '' }],
  lists: [
    { title: 'Needs attention', rows: [{ tone: 'over', attrs: { 'data-ss': 'plant:Lakeview' }, html: '<span class="pnl-r-name">G.E. Booth</span>' }, { tone: 'over', attrs: { 'data-full-table': 'svc:capacity' }, html: '<span class="pnl-r-name">West Brampton Reservoir</span>' }], total: 9 },
    { title: 'This week', rows: [{ attrs: { 'data-pnl-dev': 'k1' }, html: '<small>New: 1 Main St</small>' }, { attrs: { 'data-ce-open': 'ea:7' }, html: '<small>EA comment period closes</small>' }], total: 2 },
  ],
};

test('Home while loading: never "No developments match" and zeros, its place kept with the figures to come', () => {
  const EMPTY = { ...AREA, answer: 'No developments match the current filters.', figures: [], lists: [] };
  // (the snapshot not in yet, and then the developments in while the briefing still holds the empty one drawn before)
  for (const [snapshot, projects, filtered] of [[false, [], []], [true, [{}], [{}]]]) {
    const { W: B, nodes, window } = loadBrowser(EMPTY);
    Object.assign(window.PeelApp, { fullSnapshotReady: () => snapshot }); Object.assign(window.PeelApp.state, { projects, filtered });
    window.PeelOverviewTab.lastAreaCount = () => 0;
    B.setMode('home');
    const h = nodes['#home'].innerHTML;
    assert.ok(!h.includes('No developments match'), 'no empty-filter message while loading');
    assert.match(h, /Loading the developments and working out the briefing…/);
    assert.match(h, /<h1>Peel: what needs attention<\/h1>/);
    assert.match(h, /<p class="page-eyebrow small">Peel · all of Peel<\/p>/);
    for (const g of ['Growth', 'Servicing', 'Capital', 'Change']) assert.match(h, new RegExp(`<div class="home-grp-h"><h2>${g}</h2>`), g);
    assert.match(h, /<b>…<\/b><span class="pnl-l">planned<\/span><small>loading<\/small>/);
    assert.ok(!/<b>0<\/b>/.test(h), 'no zero figures');
  }
  // Worked out for the developments shown: the briefing as it is (a real empty filter still says so).
  const { W: B, nodes, window } = loadBrowser(EMPTY);
  Object.assign(window.PeelApp, { fullSnapshotReady: () => true }); Object.assign(window.PeelApp.state, { projects: [{}], filtered: [] });
  window.PeelOverviewTab.lastAreaCount = () => 0;
  B.setMode('home');
  assert.ok(nodes['#home'].innerHTML.includes('No developments match'), 'a filter that matches nothing still says so');
});

test('2. workspace figures equal full-map figures (Home and This week read the Peel Overview panel)', () => {
  const { W: B, PN, nodes } = loadBrowser(AREA);
  B.setMode('home');
  const h = nodes['#home'].innerHTML;
  // Bundle 6: the figures are the other pages' answers, each opening its page; the Overview's pipeline
  // totals stay in the answer (the same sentence), with Growth in an area a tap away.
  void PN;
  assert.ok(h.includes(AREA.answer), 'the headline sentence');
  assert.match(h, /<div class="pnl-fig" data-ws-page="week" title="This week" role="button" tabindex="0"><b>2<\/b><span class="pnl-u">changes<\/span><span class="pnl-l">this week<\/span>/, 'This week: the same rows as its page');
  assert.match(h, /data-ws-page="tight" title="Servicing capacity" role="button" tabindex="0"><b>/);
  // Step 6: the scope first (Peel or a municipality), then the figures in groups.
  assert.match(h, /<div class="home-scope"><div class="seg" role="group" aria-label="Municipality"><button type="button" class="btn small on" data-ws-muni="" aria-pressed="true">Peel<\/button>/);
  for (const g of ['Growth', 'Servicing', 'Capital', 'Change']) assert.match(h, new RegExp(`<div class="home-grp-h"><h2>${g}</h2>`), g);
  assert.match(h, /9 over/);
  // This week in its workspace: the Overview's own rows, every one.
  B.go('week');
  const wk = B.override('overview:', 'area');
  assert.deepEqual(plain(wk.lists[0].rows), plain(AREA.lists[1].rows), 'the same rows');
  assert.equal(wk.lists[0].rows[0], AREA.lists[1].rows[0], 'the same row objects');
  assert.equal(wk.lists[0].total, 2);
  // Servicing capacity, Growth in an area and Projects show the tab's own panel (no override).
  for (const id of ['tight', 'growth', 'projects']) { B.go(id); const p = B.plan(id); assert.equal(B.override(`${p.tab}:${p.sub}`, 'area'), null, id); }
  // Check a site before a site is picked: the Find step; once a site is open, the site's own panel.
  B.go('site');
  const find = B.override('overview:', 'area');
  assert.equal(find.head.name, 'Check a site');
  // The steps as a numbered list, Find marked as the current step.
  assert.deepEqual(plain(find.lists[0].rows.map(r => r.html.match(/<span class="pnl-step-n" aria-hidden="true">(\d)<\/span><span><strong>(\w+)<\/strong>/).slice(1))), [['1', 'Find'], ['2', 'Result'], ['3', 'Output']]);
  assert.match(find.lists[0].rows[0].html, /^<div class="pnl-step on">/);
  assert.equal(B.override('overview:', 'dev:x'), null);
});

// Navigation phase 5 (owner decision 4): FSR review is a development's Servicing view, the one host of the
// cross-check (the workspace's fsrSpec override and the site bar's box are gone).
test('Review an FSR at a site: Servicing › FSR review, the one host', () => {
  const { W: B, PN, window } = loadBrowser(AREA);
  const subs = [];
  window.DevScope = { current: () => ({ key: 'x', title: '0 HERITAGE RD' }), close() {} };
  window.PeelAnalysisTabs = { setSub: (t, v) => subs.push([t, v]), setFootPref() {}, showFootTab() {}, openFold() {}, getFootTab: () => 'svc', TABSUBS: { svc: { get: () => 'fsr' } } };
  B.go('fsr');
  assert.deepEqual(plain(subs), [['svc', 'fsr']], 'the chip opens Servicing › FSR review at the site');
  assert.equal(B.override('svc:fsr', 'dev:x'), null, 'no workspace override: the view is the panel itself');
  assert.equal(B.override('svc:network', 'dev:x'), null);
  // The view's panel (js/fsr-check.js in node): the Network panel's answer, figures and lists, the form's
  // fold and all seven things an FSR should cover, open; Copy the comparison and Print / PDF; its own full table.
  const ctx = { module: { exports: {} }, PeelWsPages: { COVERAGE: require('../js/ws-pages.js').COVERAGE } }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/fsr-check.js'), ctx);
  const F = ctx.module.exports;
  const net = { head: { name: '0 HERITAGE RD' }, answer: 'Water from Pressure zone 6.', figures: [{ v: '5.5', u: 'L/s', label: 'water, maximum day' }], lists: [{ title: 'The path', rows: [{ html: 'Block 15' }], total: 1 }], method: 'Flows at Peel design criteria.', sources: 'Pressure zones.' };
  const spec = F.panelSpec({ key: 'x', title: '0 HERITAGE RD' }, net);
  assert.deepEqual(plain(spec.folds.map(f => [f.title, !!f.open])), [['The consultant\u2019s figures against this app\u2019s', true], ['What the FSR should cover', true]]);
  assert.equal(spec.lists, net.lists); assert.equal(spec.answer, net.answer); assert.equal(spec.figures, net.figures); assert.equal(spec.head, net.head);
  const cov = spec.folds[1].html;
  assert.equal((cov.match(/<li class="pnl-kv">/g) || []).length, 7, 'all seven, the two an engineer reviews too');
  for (const t of ['Local sewer and watermain capacity', 'Fire flow (Fire Underwriters Survey) and pressures']) assert.ok(cov.includes(t), t);
  assert.match(cov, /<span class="t-over">By an engineer<\/span>/);
  assert.match(spec.method, /^Flows at Peel design criteria\. What the FSR should cover: Region of Peel, Functional Servicing Report Requirements \(November 2009\)/);
  assert.deepEqual(plain(spec.foot), { primary: { label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' } }, secondary: [{ label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }] });
  assert.equal(spec.widen, true);
  const h = PN.html({ key: 'svc:fsr', ...spec });
  assert.match(h, /<details class="pnl-fold" data-sec="fold" open id="pnl-fsr"><summary>The consultant[^<]*<\/summary><div><div class="fsr-box" data-pnl-fsrbox><\/div>/);
  assert.doesNotMatch(h, /See all \(/);
  // onMount puts the form in its box for the site (mount needs a document: a stub box records it).
  const box = { dataset: {}, set innerHTML(v) { this.html = v; }, querySelector: () => null }, host = { querySelector: q => (q === '[data-pnl-fsrbox]' ? box : null) };
  ctx.document = {}; ctx.PeelUtil = require('../js/util.js');
  spec.onMount(host);
  assert.equal(box.dataset.pkey, 'x', 'the form mounts for the open site');
  assert.match(box.html, /data-fc="population"/);
  // The form's events work in any .fsr-box (the view's, on the map or its page); mount() keeps drafts.
  const f = src('js/fsr-check.js');
  assert.match(f, /closest\('\.fsr-box \[data-fc-run\], \.fsr-box \[data-fc-print\], \.fsr-box \[data-fc-clear\]'\)/);
  assert.doesNotMatch(f, /site-bar-fsr|function toggleFor/);
  assert.match(f, /function mount\(box, p\) \{[\s\S]*?if \(_last && _last\.key === p\.key && _drafts\[p\.key\]\) runCheck\(box\);/);
  // Set beside Network (js/svc-capacity.js), and the page of Review an FSR reads the same spec: the site's
  // page at Servicing › FSR review (js/sections.js viewOf, navigation phase 5's S12).
  assert.match(src('js/svc-capacity.js'), /PN\.set\('svc:network', spec\);\n\s+if \(FC && FC\.panelSpec\) PN\.set\('svc:fsr', FC\.panelSpec\(p, spec\)\);/);
  assert.match(src('js/ws-pages.js'), /function fsr\(\) \{\n\s+if \(!devNow\(\)\) return find\('fsr'\);\n\s+return site\('fsr'\);/);
  assert.deepEqual(plain(require('../js/sections.js').viewOf('servicing', 'fsr').keys), ['svc:fsr']);
  // Copy the comparison reads the results beside the button: the map's panel or the page.
  assert.match(src('js/workspaces.js'), /const r = \(fc\.closest\('#home, #analysis'\) \|\| document\)\.querySelector\('\[data-fc-results\]'\);/);
});

test('picking a chip closes the map\u2019s Layers panel; the full map gets it back as it was', () => {
  const { W: B, nodes } = loadBrowser(AREA);
  const panel = { open: true };
  nodes['.map-opts .mo-panel'] = panel;
  B.go('tight'); assert.equal(panel.open, false, 'closed by the chip');
  panel.open = true; B.go('growth'); assert.equal(panel.open, false, 'each chip closes it');
  B.setMode('full'); assert.equal(panel.open, true, 'reopened: it was open before the workspace');
  // Closed before the workspace: it stays closed in the full map.
  panel.open = false; B.go('pipes'); B.setMode('full'); assert.equal(panel.open, false);
  // Home is not the full map: the panel is left as it is until the full map opens.
  panel.open = true; B.go('tight'); B.setMode('home'); assert.equal(panel.open, false);
});

test('each chip\u2019s map is lean (1–2 layers); the full map gets its own layers back, unsaved by the workspace', () => {
  // The decided sets: only what the task reads.
  assert.deepEqual(plain(W.LAYERS), { site: ['devs', 'hov'], tight: ['cap', 'bk'], growth: ['devs', 'sp'], fsr: ['devs', 'ex-sanitary', 'ex-water'], study: ['devs'], outlook: ['devs'], projects: ['dcw', 'cons'], eaflow: ['ea', 'cons'], pipes: [], outlets: ['devs', 'ex-sanitary'], week: ['devs'], coming: ['devs'] });
  for (const id of Object.keys(W.LAYERS)) assert.ok(W.LAYERS[id].length <= 3 && W.BY_ID[id], id);
  // Every key is a real layer switch.
  const lg = src('js/layer-groups.js');
  for (const k of new Set(Object.values(W.LAYERS).flat())) assert.ok(lg.includes(`['${k}', `) || lg.includes(`${k}: {`) || new RegExp(`\\b'?${k}'?: \\{ get`).test(lg), k);
  const { W: B, window } = loadBrowser(AREA);
  const log = [];
  let view = 'planning';
  window.PeelMapAnalysis = { currentView: () => view, rememberCurrent: () => log.push(`remember ${view}`), showView: (v, o) => { view = v; log.push(`show ${v}${o && o.remembered ? ' remembered' : ''}`); } };
  window.PeelLayerGroups = { apply: set => log.push(`layers ${[...set].join('.') || '(none)'}`) };
  B.go('tight'); B.go('projects'); B.go('pipes');
  B.setMode('full');
  assert.deepEqual(log, ['remember planning', 'show wastewater', 'layers cap.bk', 'show dc', 'layers dcw.cons', 'show wastewater', 'layers (none)', 'show wastewater remembered']);
  // A workspace never saves its lean layers as a view's memory (the lens switch skips the save there).
  assert.match(src('js/map-analysis.js'), /if \(!\(window\.PeelWorkspaces && window\.PeelWorkspaces\.mode\(\) === 'ws'\)\) store\.set\(`mapView-\$\{cur\}`, currentMapSettings\(\)\);/);
  assert.match(src('css/app.css'), /\.app\.ws-mode \.ww-loads \{ display: none !important; \}/);
  // No "Developments are switched off" notice where a chip switches them off on purpose.
  assert.match(src('js/svc-data.js'), /if \(!MM\(\)\.getDevsOn\(\)\) return window\.PeelWorkspaces && window\.PeelWorkspaces\.mode\(\) === 'ws' \? '' : 'Developments are switched off';/);
});

test('Check a site: Find → Result → Output in the header once the site is open', () => {
  const { W: B, window } = loadBrowser(AREA);
  B.go('site');
  assert.match(B.srcLine('overview:'), /^<p class="pnl-src small"><span>Check a site · from Overview<\/span><button type="button" class="btn small link" data-ws-full/);
  window.DevScope = { current: () => ({ key: 'x' }), close() {} };
  assert.match(B.srcLine('overview:'), /Check a site · from Overview <small class="pnl-steps">✓ Find › <b>Result<\/b> › Output: Servicing memo<\/small>/);
  B.setMode('full');
  assert.equal(B.srcLine('overview:'), '', 'the full map has no workspace line');
});

test('3. Home links open the matching chip', () => {
  const { W: B, nodes } = loadBrowser(AREA);
  B.setMode('home');
  const h = nodes['#home'].innerHTML;
  // The workspace list: one button per chip, then Full map.
  // Home itself first (current), then one button per workspace page, then Full map.
  assert.match(h, /<button type="button" class="home-ws on" data-ws-page="home" aria-current="page"><strong>Home<\/strong>/);
  for (const w of B.WS.filter(x => !B.EXPLORE.includes(x.id) && !B.CAPITAL.includes(x.id))) assert.match(h, new RegExp(`<button type="button" class="home-ws" data-ws-page="${w.id}"><strong>${w.label}`), w.id);
  assert.match(h, /<button type="button" class="home-ws" data-ws-page="explore"><strong>Explore/, 'Explore: one entry for its five views');
  assert.match(h, /<button type="button" class="home-ws" data-ws-page="capital"><strong>Capital/, 'Capital: one entry for DC projects and EA to construction');
  assert.match(h, /class="home-ws home-full" data-ws-full>/);
  // Find from every page, Home included: the search slot and Draw an area in the header.
  assert.match(h, /<div class="page-find" data-psec="find"><div class="page-search" id="page-search"><\/div><button type="button" class="btn small page-draw" data-ws-go="study"[^>]*>Draw an area<\/button><\/div><\/header>/);
  // Needs attention → the facility's scope (else the Servicing capacity page); This week → the This week
  // page; the figures → their pages (bundle 6); the map → Servicing capacity.
  assert.match(h, /<li class="pnl-row t-over" data-ws-go="tight" data-ws-ss="plant:Lakeview" tabindex="0" role="button"><span class="pnl-r-name">G\.E\. Booth/);
  assert.match(h, /<li class="pnl-row t-over" data-ws-page="tight" tabindex="0" role="button"><span class="pnl-r-name">West Brampton/);
  assert.match(h, /<li class="pnl-row" data-ws-page="week" tabindex="0" role="button"><small>New: 1 Main St/);
  assert.match(h, /data-ws-page="tight">See all \(9\) →/);
  assert.doesNotMatch(h, /See all \(2\)/, 'no See all when every row is shown');
  assert.match(h, /<div class="pnl-fig" data-ws-page="tight"/);
  assert.match(h, /<h2>Growth<\/h2><button type="button" class="btn small link" data-ws-page="growth">Growth in an area →<\/button>/);
  assert.match(h, /<button type="button" class="home-map-btn" data-ws-page="tight"/);
  // The start screen choice, and the screening note.
  assert.match(h, /<select data-ws-start><option value="home" selected>Home<\/option><option value="last">Last workspace<\/option><option value="full">Full map<\/option>/);
  assert.match(h, /General screening results only\. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results\./);
});

test('Home › Servicing: the first 90% trigger opens its plant, the first zone limit its page; Needs attention rows open their facility', () => {
  const { W: B, nodes, window } = loadBrowser(AREA);
  const row = (id, kind, name, y, pctBo, ss) => ({ id, kind, name, ss, sys: kind === 'pump' || kind === 'wplant' ? 'water' : 'ww', limit: { y, what: kind === 'pump' ? '100% firm' : '90% trigger' }, pctBo, relief: 'planned' });
  window.PeelSvcCapacity.collect = () => [row('plant:Lakeview', 'plant', 'G.E. Booth', 2031, 120, 'plant:Lakeview'), row('pump:Zone 5', 'pump', 'Into zone 5 and above', 2029, 104, null), row('plant:Clarkson', 'plant', 'Clarkson', 2034, 84, 'plant:Clarkson')];
  B.setMode('home');
  const h = nodes['#home'].innerHTML;
  assert.match(h, /<div class="pnl-fig t-tight" data-ws-go="tight" data-ws-ss="plant:Lakeview" title="Open G\.E\. Booth" role="button" tabindex="0"><b>≈2031<\/b><span class="pnl-l">first 90% trigger<\/span><small>G\.E\. Booth reaches its 90% expansion trigger · Servicing capacity →<\/small>/);
  assert.match(h, /<div class="pnl-fig t-tight" data-ws-page="tight" title="Servicing capacity" role="button" tabindex="0"><b>≈2029<\/b><span class="pnl-l">first zone limit \(100% of firm\)<\/span><small>Into zone 5 and above reaches 100% of firm pumping · Servicing capacity →<\/small>/);
  // (in the Servicing group, after the trigger)
  const grp = h.slice(h.indexOf('<h2>Servicing</h2>'), h.indexOf('<h2>Capital</h2>'));
  assert.deepEqual([...grp.matchAll(/<span class="pnl-l">([^<]+)<\/span>/g)].map(m => m[1]), ['over capacity at build-out', 'first 90% trigger', 'first zone limit (100% of firm)']);
  // A row with a scope opens it on Servicing capacity's map; one with none, and See all, the page.
  assert.match(h, /<li class="pnl-row t-over" data-ws-go="tight" data-ws-ss="plant:Lakeview" tabindex="0" role="button"><span class="pnl-r-name">G\.E\. Booth/);
  assert.match(h, /<li class="pnl-row t-over" data-ws-page="tight" tabindex="0" role="button"><span class="pnl-r-name">West Brampton/);
  assert.match(h, /data-ws-page="tight">See all \(9\) →/);
  // No zone at its limit by the horizon's end: "None" before 2051, naming the most loaded zone.
  window.PeelSvcCapacity.collect = () => [row('plant:Lakeview', 'plant', 'G.E. Booth', 2031, 120, 'plant:Lakeview'), row('pump:Zone 5', 'pump', 'Into zone 5 and above', null, 60, null), row('pump:Zone 7', 'pump', 'Into zone 7 and above', null, 83, null)];
  B.renderPage(true);
  assert.match(nodes['#home'].innerHTML, /<div class="pnl-fig" data-ws-page="tight" title="Servicing capacity" role="button" tabindex="0"><b>None<\/b><span class="pnl-l">first zone limit \(100% of firm\)<\/span><small>before 2051 · most loaded: Into zone 7 and above \(83% at build-out\) · Servicing capacity →<\/small>/);
  // No zone row, no zone figure; a well system (no scope) opens the page.
  window.PeelSvcCapacity.collect = () => [row('wsys:AV13', 'wplant', 'Alton wells', 2030, 95, null)];
  B.renderPage(true);
  const h2 = nodes['#home'].innerHTML;
  assert.doesNotMatch(h2, /first zone limit/);
  assert.match(h2, /<div class="pnl-fig t-tight" data-ws-page="tight" title="Servicing capacity" role="button" tabindex="0"><b>≈2030<\/b><span class="pnl-l">first 90% trigger<\/span>/);
});

test('Find from every page: the page waits while its search has the focus; another page never does', () => {
  // (timers queued, run by hand)
  let n = 0; const q = new Map(), run = () => { const fs = [...q.values()]; q.clear(); for (const f of fs) f(); };
  const spec = { ...AREA };
  const { W: B, nodes, window } = loadBrowser(spec, { setTimeout: f => { q.set(++n, f); return n; }, clearTimeout: id => q.delete(id) });
  let writes = 0, html = '';
  Object.defineProperty(nodes['#home'], 'innerHTML', { get: () => html, set: v => { html = v; writes++; } });
  B.setMode('home'); run();
  const input = { value: '' };
  nodes['#f-search'] = input; nodes['#home'].contains = x => x === input;
  // 1. The box focused (a phone tap, nothing typed yet): data landing does not rebuild Home, forced or not.
  window.document.activeElement = input;
  spec.answer = 'The developments shown have changed.';
  const before = html, w0 = writes;
  B.renderPage(false); B.renderPage(true);
  assert.equal(html, before, 'Home unchanged while the box has the focus');
  assert.equal(writes, w0);
  assert.equal(q.size, 1, 'one render waits');
  // 2. The box lets go: the waiting render runs, with the new answer.
  window.document.activeElement = null; run();
  assert.ok(html.includes(spec.answer), 'the page updates once the box loses focus');
  // (a forced render waits as forced: it rebuilds an unchanged page; a plain one does not)
  window.document.activeElement = input;
  const w1 = writes; B.renderPage(true); window.document.activeElement = null; run();
  assert.equal(writes, w1 + 1, 'force kept for the waiting render');
  window.document.activeElement = input;
  const w2 = writes; B.renderPage(false); window.document.activeElement = null; run();
  assert.equal(writes, w2, 'an unchanged page is not rebuilt');
  // 3. Another page is never held back.
  window.document.activeElement = input;
  B.openPage('tight');
  assert.match(html, /data-page="tight"/, 'Servicing capacity renders at once');
  // The top bar is told where the box is: its slot hides while the box is in a page (any width).
  assert.match(src('js/topbar.js'), /if \(document\.documentElement\.classList\.contains\('home-on'\) && box\.closest\('#page-search'\)\) \{ slot\.hidden = true; return; \}/);
  assert.match(src('js/workspaces.js'), /if \(slot\) \{ if \(box\.parentElement !== slot\) slot\.appendChild\(box\); if \(root\.PeelTopbar && root\.PeelTopbar\.placeSearch\) root\.PeelTopbar\.placeSearch\(\); return; \}/);
});

test('Find from every page: a pick on a page opens what it found; the map’s picks are unchanged', () => {
  const { W: B, window } = loadBrowser(AREA);
  const sel = [];
  window.PeelDcProjects = { select: k => sel.push(k) };
  // The full map (and a workspace's map view): not routed, the search's own code runs.
  B.setMode('full');
  assert.equal(B.routePick({ p: { key: 'k', title: 'x' } }), false);
  assert.equal(B.mode(), 'full');
  B.go('tight');
  assert.equal(B.routePick({ place: { hit: 'plan', id: 'sp1', muni: 'Brampton' } }), false);
  assert.equal(B.mode(), 'ws');
  // On a page: a development its page, a plan Growth in an area, a plant its scope on Servicing
  // capacity's map, a DC project Capital (DC projects, at it).
  const onHome = () => B.openPage('home');
  onHome(); assert.equal(B.routePick({ p: { key: 'k', title: 'x' } }), true); assert.equal(B.page(), 'site');
  onHome(); assert.equal(B.routePick({ label: 'x', p: { key: 'k', title: 'x' }, hit: 'file', ref: 'OZ 21-005' }), true); assert.equal(B.page(), 'site');
  onHome(); assert.equal(B.routePick({ place: { hit: 'plan', id: 'sp1', muni: 'Brampton' } }), true); assert.equal(B.page(), 'growth');
  onHome(); assert.equal(B.routePick({ place: { hit: 'svc', ss: 'plant:Lakeview' } }), true); assert.equal(B.mode(), 'ws'); assert.equal(B.current(), 'tight');
  onHome(); assert.equal(B.routePick({ place: { hit: 'dc', key: 'wastewater:25-2269' } }), true); assert.equal(B.page(), 'projects');
  assert.deepEqual(sel, ['wastewater:25-2269'], 'the project selected');
  // An address (and a DC facility): its map view, then the map's own pick (the pin) runs.
  onHome(); assert.equal(B.routePick({ label: '1 Main St', g: { lat: 43.7, lng: -79.7, label: '1 Main St' } }), false); assert.equal(B.mode(), 'ws'); assert.equal(B.current(), 'site');
  onHome(); assert.equal(B.routePick({ place: { hit: 'dcfac' } }), false); assert.equal(B.current(), 'projects');
  // The filter row is no place.
  onHome(); assert.equal(B.routePick({ label: 'x', filter: 'x' }), false); assert.equal(B.page(), 'home');
  // A plan in another municipality than Home's picked one goes back to Peel first; one in it keeps it.
  let applied = 0;
  window.PeelApp.applyFilters = () => { applied++; };
  window.PeelApp.state.muni = 'Mississauga';
  onHome(); B.routePick({ place: { hit: 'plan', id: 'sp2', muni: 'Mississauga' } });
  assert.equal(window.PeelApp.state.muni, 'Mississauga'); assert.equal(applied, 0);
  onHome(); B.routePick({ place: { hit: 'plan', id: 'sp1', muni: 'Brampton' } });
  assert.equal(window.PeelApp.state.muni, '', 'Peel'); assert.equal(applied, 1); assert.equal(B.page(), 'growth');
  // The map's plan or MTSA filter (a plan picked on the map, the MTSA a page's pick left on): off before
  // the drill, so the tree it drills in holds the plan picked; a plan filter that holds it stays.
  const S = window.PeelApp.state, log = [], drill = window.PeelWsPages.drillTo;
  window.PeelApp.applyFilters = () => log.push(`apply ${S.sp.length + S.mtsa.length}`);
  window.PeelWsPages.drillTo = (id, fall) => { log.push(`drill ${id} ${fall}`); drill(id, fall); };
  window.PeelPlanAreas = { renderAreaSelects: () => log.push('selects'), showArea: () => log.push('outline'), renderPlanAreas: () => log.push('outlines') };
  const pickPlan = (sp, mtsa) => { Object.assign(S, { sp, mtsa }); log.length = 0; onHome(); return B.routePick({ place: { hit: 'plan', id: 'sp1', muni: 'Brampton' } }); };
  assert.equal(pickPlan(['sp9'], []), true);
  assert.deepEqual(plain([S.sp, S.mtsa, log]), [[], [], ['selects', 'outline', 'outlines', 'apply 0', 'drill a:sp1 m:Brampton']], 'another plan’s filter: off, then the drill');
  assert.equal(B.page(), 'growth');
  pickPlan([], ['mtsa:3']);
  assert.deepEqual(plain([S.sp, S.mtsa, log.slice(-2)]), [[], [], ['apply 0', 'drill a:sp1 m:Brampton']], 'an MTSA filter: off');
  pickPlan(['sp1', 'sp9'], ['mtsa:3']);
  assert.deepEqual(plain([S.sp, S.mtsa]), [[], []], 'a plan filter holding it, narrowed by an MTSA: off');
  pickPlan(['sp1', 'sp9'], []);
  assert.deepEqual(plain([S.sp, S.mtsa, log]), [['sp1', 'sp9'], [], ['drill a:sp1 m:Brampton']], 'a plan filter holding it: kept, nothing re-applied');
  // An MTSA picked on a page: any area filter off before the drill to its municipality; the map's own
  // handler then sets its filter (routePick returns false).
  Object.assign(S, { sp: ['sp9'], mtsa: ['mtsa:3'] }); log.length = 0; onHome();
  assert.equal(B.routePick({ place: { hit: 'mtsa', id: 'mtsa:4', muni: 'Brampton' } }), false);
  assert.deepEqual(plain([S.sp, S.mtsa, log.slice(-2)]), [[], [], ['apply 0', 'drill m:Brampton undefined']]);
  // A servicing scope that does not open yet (its data still loading): taken, and nothing moves: the
  // page stays, the open scope is not closed. Once it resolves, its scope on Servicing capacity's map.
  const opened = [], closed = [];
  window.PeelSvcScope = { resolve: ref => (ref === 'plant:Lakeview' ? { ref } : null), current: () => ({ ref: 'plant:Clarkson' }), close: () => closed.push(1), open: ref => opened.push(ref) };
  onHome(); assert.equal(B.routePick({ place: { hit: 'svc', ss: 'pz:5' } }), true);
  assert.deepEqual(plain([B.mode(), B.page(), opened, closed]), ['home', 'home', [], []], 'pz:5 not in yet: stays on Home');
  onHome(); assert.equal(B.routePick({ place: { hit: 'svc', ss: 'plant:Lakeview' } }), true);
  assert.deepEqual(plain([B.mode(), B.current(), opened]), ['ws', 'tight', ['plant:Lakeview']]);
});

test('Draw an area (every page header): Select on, and on a phone the sheet down to its peek, the map there to draw on', () => {
  const { W: B, window } = loadBrowser(AREA);
  const lasso = [], snaps = [];
  let narrow = true;
  window.PeelAreaSelect = { setLasso: on => lasso.push(on) };
  window.PeelDataTab = { shellNarrow: () => narrow };
  window.PeelApp.setAnalysisSnap = (s, save) => snaps.push([s, save]);
  // A phone (a kept result may have left the sheet full): Select on, the sheet at its peek, not remembered.
  B.openPage('projects'); B.go('study');
  assert.equal(B.mode(), 'ws'); assert.equal(B.current(), 'study');
  assert.deepEqual(lasso, [true]); assert.deepEqual(snaps, [['peek', false]]);
  // The way back to the map view (noDraw) arms nothing; another map view leaves the sheet as it is.
  B.go('study', { quiet: true, noDraw: true }); B.go('tight');
  assert.deepEqual(lasso, [true]); assert.deepEqual(snaps, [['peek', false]]);
  // A wide screen: Select on, the side panel untouched.
  narrow = false; B.openPage('home'); B.go('study');
  assert.deepEqual(lasso, [true, true]); assert.deepEqual(snaps, [['peek', false]]);
});

test('the page: Home, the chip bar, the Home button and the settings', () => {
  const html = src('index.html');
  assert.match(html, /<section class="home" id="home" aria-label="Home" hidden><\/section>/);
  assert.match(html, /<div class="ws-chips" id="ws-chips" role="toolbar" aria-label="Tasks"><\/div>/);
  assert.match(html, /id="tb-home" data-ws-home/);
  const at = f => html.indexOf(`<script src="js/${f}?v=__BUILD__">`);
  assert.ok(at('panel.js') > 0 && at('panel.js') < at('ws-pages.js') && at('ws-pages.js') < at('workspaces.js') && at('workspaces.js') < at('app.js'));
  assert.match(src('js/growth-ui.js'), /root\.PeelWorkspaces\.settingsHTML\(\)/);
  // A workspace hides the left panel and the tool rail; the full map keeps everything.
  assert.match(src('css/app.css'), /\.app\.ws-mode \.sidebar, \.app\.ws-mode \.toggle-sidebar, \.app\.ws-mode \.leaflet-control\.tool-rail, html\.home-on \.toggle-sidebar \{ display: none !important; \}/);
  // Desktop only: below 1200 px the app is one column (the panel is a bottom sheet).
  assert.match(src('css/app.css'), /@media \(min-width: 1200px\) \{\n  \.app\.ws-mode \{ grid-template-columns: 0 minmax\(0, 1fr\) var\(--analysis-w, 440px\); \}/);
});

test('Home shows Built since 2021: the answer names it and the stage bar puts it first', () => {
  const strip = '<div class="home-stages"><p class="small pnl-chart-t"><strong>The units it adds, by stage</strong></p><div class="lybar"></div></div>';
  const { W: B, nodes } = loadBrowser({ ...AREA, stageStrip: strip });
  B.setMode('home');
  const h = nodes['#home'].innerHTML;
  assert.ok(h.includes(`<div class="pnl-chart page-chart" data-psec="chart">${strip}</div>`), 'the stage bar, under the figures');
  assert.ok(h.indexOf('data-psec="figures"') < h.indexOf('data-psec="chart"'));
  // (no strip: nothing, never an empty box)
  const { W: B2, nodes: n2 } = loadBrowser(AREA); B2.setMode('home');
  assert.ok(!n2['#home'].innerHTML.includes('data-psec="chart"'));
  // The Overview builds both from the layer totals: Built since 2021 in the sentence, then the bar's
  // segments and key in stage order, only where the headline counts every stage.
  const ov = src('js/overview-tab.js');
  assert.match(ov, /<strong>\$\{fmtNum\(Math\.round\(lyTiles\.built\)\)\}<\/strong> of them built since 2021/);
  assert.match(ov, /const gk = basis === 'all' \|\| basis === 'buildout' \? ks\.filter\(k => k !== 'existing'/);
  assert.match(ov, /answer: hl, stageStrip: lyTiles\.strip \|\| ''/);
  assert.match(src('js/reports.js'), /of them built since 2021/);
});
