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
  assert.deepEqual(plain(W.WS.map(w => w.label)), ['Check a site', 'Servicing capacity', 'Growth in an area', 'Review an FSR', 'Forecast', 'Study area', 'DC projects', 'EA to construction', 'Old pipes', 'This week']);
  // Home's sidebar: This week under Home (bundle 6), then Planning (Servicing capacity with it),
  // Capital, Asset Management; then Full map.
  // Explore (step 3): Growth in an area, Check a site, Review an FSR, Forecast and Study area are one entry.
  assert.deepEqual(plain(W.GROUPS), [['Planning', ['explore', 'tight']], ['Capital', ['capital']], ['Asset Management', ['pipes']]]);
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
  assert.match(src('js/sewer-cap.js'), /g\[lay\]\.units\[i\] \+= e\.totalUnits \|\| 0;/);
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
  assert.equal(W.defaultWs(null), 'tight'); assert.equal(W.defaultWs('growth'), 'growth');
  // The link carries w only in Home or a workspace; old-link decoding is unchanged.
  const sh = src('js/share.js');
  assert.match(sh, /if \(W && W\.mode\(\) === 'home'\) set\('w', W\.page && W\.page\(\) !== 'home' \? `p:\$\{W\.page\(\)\}` : 'home'\); else if \(W && W\.mode\(\) === 'ws' && W\.current\(\)\) set\('w', W\.current\(\)\);/);
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

test('Review an FSR at a site: the cross-check is an open fold of the Servicing panel', () => {
  const { W: B, PN, window } = loadBrowser(AREA);
  const mounted = [];
  window.DevScope = { current: () => ({ key: 'x', title: '0 HERITAGE RD' }), close() {} };
  window.PeelFsrCheck = { mount: (box, p) => mounted.push(p.key) };
  // Servicing at the site, as js/svc-capacity.js sets it (its own folds and onMount kept).
  let own = 0;
  PN.set('svc:network', { head: { name: '0 HERITAGE RD' }, answer: 'Water from Pressure zone 6.', lists: [{ title: 'Path', rows: [{ html: 'Block 15' }], total: 1 }], folds: [{ title: 'Ground', html: '<div class="g"></div>' }], onMount: () => { own++; } });
  B.go('fsr');
  const spec = B.override('svc:network', 'dev:x');
  assert.equal(spec.answer, 'Water from Pressure zone 6.', 'the panel itself is unchanged');
  assert.deepEqual(plain(spec.folds.map(f => [f.title, !!f.open])), [['FSR cross-check: the consultant\u2019s figures vs this app\u2019s', true], ['Ground', false]]);
  assert.match(PN.html({ key: 'svc:network', ...spec }), /<details class="pnl-fold" data-sec="fold" open id="pnl-fsr"><summary>FSR cross-check[^<]*<\/summary><div><div class="fsr-box" data-pnl-fsrbox><\/div><\/div><\/details><details class="pnl-fold" data-sec="fold"><summary>Ground/);
  const box = {}, host = { querySelector: s => (s === '[data-pnl-fsrbox]' ? box : null) };
  spec.onMount(host);
  assert.deepEqual(mounted, ['x'], 'the form mounts for the open site');
  assert.equal(own, 1, 'the panel\u2019s own async parts still fill');
  // Only in Review an FSR, and only at the site it was set for.
  assert.equal(B.override('svc:network', 'dev:other'), null);
  B.go('site'); assert.equal(B.override('svc:network', 'dev:x'), null);
  // The form's events work in any .fsr-box (the panel's or the site bar's); mount() keeps drafts.
  const f = src('js/fsr-check.js');
  assert.match(f, /closest\('\.fsr-box \[data-fc-run\], \.fsr-box \[data-fc-print\], \.fsr-box \[data-fc-clear\], #site-bar-fsr/);
  assert.match(f, /function mount\(box, p\) \{[\s\S]*?if \(_last && _last\.key === p\.key && _drafts\[p\.key\]\) runCheck\(box\);/);
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
  assert.deepEqual(plain(W.LAYERS), { site: ['devs', 'hov'], tight: ['cap', 'bk'], growth: ['devs', 'sp'], fsr: ['devs', 'ex-sanitary', 'ex-water'], study: ['devs'], outlook: ['devs'], projects: ['dcw', 'cons'], eaflow: ['ea', 'cons'], pipes: [], week: ['devs'] });
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
  // Needs attention → the Servicing capacity page; This week → the This week page; the figures → their
  // pages (bundle 6); the map → Servicing capacity.
  assert.match(h, /<li class="pnl-row t-over" data-ws-page="tight" tabindex="0" role="button"><span class="pnl-r-name">G\.E\. Booth/);
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
