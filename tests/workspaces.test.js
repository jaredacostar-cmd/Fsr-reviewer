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
  assert.deepEqual(plain(W.WS.map(w => w.label)), ['Check a site', 'Getting tight', 'Growth in an area', 'Review an FSR', 'Study area', 'Projects', 'Old pipes', 'This week']);
  // Home's sidebar: Planning (Getting tight with it), Capital, Asset Management; then Full map.
  assert.deepEqual(plain(W.GROUPS), [['Planning', ['site', 'fsr', 'growth', 'study', 'tight', 'week']], ['Capital', ['projects']], ['Asset Management', ['pipes']]]);
  const all = W.GROUPS.flatMap(g => g[1]).sort();
  assert.deepEqual(plain(all), plain(W.WS.map(w => w.id).sort()), 'every workspace listed once');
});

test('1. each chip opens the stated tab and scope (and the layer preset)', () => {
  const want = {
    site: ['overview', '', 'find', 'planning'], tight: ['svc', 'capacity', 'area', 'wastewater'], growth: ['growth', 'areas', 'area', 'planning'],
    fsr: ['svc', 'network', 'find', 'wastewater'], study: ['overview', '', 'drawn', 'planning'], projects: ['dca', 'timing', 'area', 'dc'],
    pipes: ['svc', 'network', 'area', 'wastewater'], week: ['overview', '', 'area', 'planning'],
  };
  for (const [id, [tab, sub, scope, view]] of Object.entries(want)) {
    const p = W.plan(id, { site: false });
    assert.deepEqual([p.tab, p.sub, p.scope, p.view], [tab, sub, scope, view], id);
    assert.equal(p.closeScopes, scope === 'area', `${id}: an area chip leaves a site`);
  }
  // With a development open: Check a site → Overview at the site; Review an FSR → Servicing at the site
  // with the FSR cross-check; area chips close the site.
  assert.deepEqual(plain(['site', 'fsr'].map(id => { const p = W.plan(id, { site: true }); return [p.tab, p.scope, p.fsr]; })), [['overview', 'site', false], ['svc', 'site', true]]);
  assert.equal(W.plan('tight', { site: true }).closeScopes, true);
  assert.equal(W.plan('study').lasso, true);
  // The header names the source tab.
  assert.equal(W.plan('tight').source, 'Getting tight · from Servicing › Capacity');
  assert.equal(W.sourceText('tight', 'svc:capacity'), 'Getting tight · from Servicing › Capacity');
  assert.equal(W.sourceText('tight', 'growth:areas'), 'Getting tight · Growth › Areas');
  assert.equal(W.sourceText('week', 'overview:'), 'This week · from Overview');
  // The browser does what the plan says (go()), and every panel in a workspace carries Open full map.
  const s = src('js/workspaces.js');
  assert.match(s, /if \(pl\.closeScopes\) \{\s*if \(site\) root\.DevScope\.close\(\);\s*if \(SS\(\) && SS\(\)\.current && SS\(\)\.current\(\)\) SS\(\)\.close\(\);/);
  assert.match(s, /MA\.setMapView\(pl\.view\)/);
  assert.match(s, /if \(pl\.sub && A\.setSub\) A\.setSub\(pl\.tab, pl\.sub\); if \(A\.setFootPref\) A\.setFootPref\(pl\.tab\); A\.showFootTab\(pl\.tab\);/);
  assert.match(s, /data-ws-full title="The same scope, filters and scenario with every tool">Open full map →/);
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
  assert.match(src('js/sewer-cap.js'), /g\[lay\]\.units\[i\] \+= e\.totalUnits \|\| 0;/);
  assert.deepEqual(plain(W.OLD), { age: 50, minUnits: 100, risk: 'MODERATE' });
});

test('4. old links still open the full map; the start screen preference otherwise', () => {
  // Old share links (any hash without w): the full map, as before.
  for (const h of ['#t=ww&ws=plants', '#t=census', '#d=Brampton%7C%4043.67%2C-79.84&t=overview', '#m=43.6,-79.7,11', '#ph=review&mu=Brampton']) assert.deepEqual(plain(W.startScreen({ hash: h, pref: 'home' })), { mode: 'full' }, h);
  // New links name their mode.
  assert.deepEqual(plain(W.startScreen({ hash: '#t=overview&w=home' })), { mode: 'home' });
  assert.deepEqual(plain(W.startScreen({ hash: '#t=svc&svs=capacity&w=tight' })), { mode: 'ws', ws: 'tight' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=nonsense' })), { mode: 'full' });
  // No link: Home by default; the last workspace (Getting tight the first time); or the full map.
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'home' })), { mode: 'home' });
  assert.deepEqual(plain(W.startScreen({ hash: '' })), { mode: 'home' });
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'last', last: 'pipes' })), { mode: 'ws', ws: 'pipes' });
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'last', last: null })), { mode: 'ws', ws: 'tight' });
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'full' })), { mode: 'full' });
  assert.equal(W.defaultWs(null), 'tight'); assert.equal(W.defaultWs('growth'), 'growth');
  // The link carries w only in Home or a workspace; old-link decoding is unchanged.
  const sh = src('js/share.js');
  assert.match(sh, /if \(W && W\.mode\(\) === 'home'\) set\('w', 'home'\); else if \(W && W\.mode\(\) === 'ws' && W\.current\(\)\) set\('w', W\.current\(\)\);/);
  assert.match(src('js/app.js'), /if \(window\.PeelWorkspaces\) window\.PeelWorkspaces\.init\(\);/);
});

// The browser half of js/workspaces.js with the real panel builder and a stub page.
function loadBrowser(areaSpec) {
  const nodes = { '#home': { hidden: false, innerHTML: '' } };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: s => nodes[s] || null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const store = new Map();
  const window = { document, PeelUtil: { esc: x => String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;'), fmtNum: n => Math.round(n).toLocaleString('en-CA'), store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } },
    PeelOverviewTab: { lastAreaSpec: () => areaSpec }, PeelMapMarkers: { THIS_YEAR: 2026 }, PeelSvcCapacity: { collect: () => [] }, PeelApp: { state: { muni: '', projects: [] } } };
  const ctx = { window, document, location: { hash: '' }, setTimeout: f => f(), URLSearchParams, CustomEvent: function CustomEvent() {} }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/panel.js'), ctx);
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

test('2. workspace figures equal full-map figures (Home and This week read the Peel Overview panel)', () => {
  const { W: B, PN, nodes } = loadBrowser(AREA);
  B.setMode('home');
  const h = nodes['#home'].innerHTML;
  // The four figures are the Overview panel's, rendered by the same builder.
  const figs = PN.html({ key: 'x', figures: AREA.figures }).match(/<div class="pnl-figs"[\s\S]*?<\/div><\/div>/)[0];
  assert.ok(h.includes(figs.replace('class="pnl-figs"', 'class="pnl-figs" data-ws-go="growth" role="button" tabindex="0" title="Growth in an area"')), 'Home figures = Overview figures');
  assert.ok(h.includes(AREA.answer), 'the headline sentence');
  assert.match(h, /9 over/);
  // This week in its workspace: the Overview's own rows, every one.
  B.go('week');
  const wk = B.override('overview:', 'area');
  assert.deepEqual(plain(wk.lists[0].rows), plain(AREA.lists[1].rows), 'the same rows');
  assert.equal(wk.lists[0].rows[0], AREA.lists[1].rows[0], 'the same row objects');
  assert.equal(wk.lists[0].total, 2);
  // Getting tight, Growth in an area and Projects show the tab's own panel (no override).
  for (const id of ['tight', 'growth', 'projects']) { B.go(id); const p = B.plan(id); assert.equal(B.override(`${p.tab}:${p.sub}`, 'area'), null, id); }
  // Check a site before a site is picked: the Find step; once a site is open, the site's own panel.
  B.go('site');
  assert.equal(B.override('overview:', 'area').head.name, 'Check a site');
  assert.equal(B.override('overview:', 'dev:x'), null);
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
  for (const w of B.WS) assert.match(h, new RegExp(`<button type="button" class="home-ws" data-ws-go="${w.id}">`), w.id);
  assert.match(h, /class="home-ws home-full" data-ws-full>/);
  // Needs attention → Getting tight (a facility row also opens its scope); This week → This week (a
  // change opens its development or capital item); the figures → Growth in an area; the map → Getting tight.
  assert.match(h, /<li class="pnl-row t-over" data-ws-go="tight" data-ws-ss="plant:Lakeview" tabindex="0" role="button">/);
  assert.match(h, /<li class="pnl-row t-over" data-ws-go="tight" tabindex="0" role="button"><span class="pnl-r-name">West Brampton/);
  assert.match(h, /<li class="pnl-row" data-ws-go="week" data-ws-dev="k1" tabindex="0" role="button">/);
  assert.match(h, /<li class="pnl-row" data-ws-go="week" data-ws-ce="ea:7" tabindex="0" role="button">/);
  assert.match(h, /data-ws-go="tight">See all \(9\) →/); assert.match(h, /data-ws-go="week">See all \(2\) →/);
  assert.match(h, /class="pnl-figs" data-ws-go="growth"/);
  assert.match(h, /<button type="button" class="home-map-btn" data-ws-go="tight"/);
  // The start screen choice, and the screening note.
  assert.match(h, /<select data-ws-start><option value="home" selected>Home<\/option><option value="last">Last workspace<\/option><option value="full">Full map<\/option>/);
  assert.match(h, /General screening results only\. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results\./);
});

test('the page: Home, the chip bar, the Home button and the settings', () => {
  const html = src('index.html');
  assert.match(html, /<section class="home" id="home" aria-label="Home" hidden><\/section>/);
  assert.match(html, /<div class="ws-chips" id="ws-chips" role="toolbar" aria-label="Tasks"><\/div>/);
  assert.match(html, /id="tb-home" data-ws-home/);
  const at = f => html.indexOf(`<script src="js/${f}?v=__BUILD__">`);
  assert.ok(at('panel.js') > 0 && at('panel.js') < at('workspaces.js') && at('workspaces.js') < at('app.js'));
  assert.match(src('js/growth-ui.js'), /root\.PeelWorkspaces\.settingsHTML\(\)/);
  // A workspace hides the left panel and the tool rail; the full map keeps everything.
  assert.match(src('css/app.css'), /\.app\.ws-mode \.sidebar, \.app\.ws-mode \.toggle-sidebar, \.app\.ws-mode \.leaflet-control\.tool-rail, html\.home-on \.toggle-sidebar \{ display: none !important; \}/);
  // Desktop only: below 1200 px the app is one column (the panel is a bottom sheet).
  assert.match(src('css/app.css'), /@media \(min-width: 1200px\) \{\n  \.app\.ws-mode \{ grid-template-columns: 0 minmax\(0, 1fr\) var\(--analysis-w, 440px\); \}/);
});
