'use strict';
// Navigation phase 6 (navigation-design §3.1 rule 1, §3.3, §8 row 6): a page and the full map host the same scope,
// with the same tab strip and chips. Home is the page host at an area (Peel, a municipality, a plan): under its
// header the map's five tabs and the open tab's views, the view the map's own tab state names
// (js/analysis-tabs.js viewKey); each view is a page builder of js/ws-pages.js or the map's panel drawn as it is
// (js/sections.js VIEWS). Servicing and Capital say "loading" until their data lands, on both strips.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const HTML = src('index.html');
const U = require('../js/util.js');

// js/analysis-tabs.js in a vm (it reads the DOM and the store at load): the tabs, the chips at a scope.
function loadTabs() {
  const el = () => null, store = { get: (k, d) => d, set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}
const AT = loadTabs();
const SUBS = { growth: 'pipeline', svc: 'capacity', dca: 'timing', records: 'sources' };

// js/sections.js, js/ws-pages.js and js/workspaces.js in one vm, the map's tab state stubbed (its tabs and chips
// the real ones), the stored panels by key (o.panels: the area's). o.key: the view; o.ready(tab): its data in;
// o.before: modules run first (the real js/svc-scope.js). With o.dev (null or a development: DevScope's open one, a
// pick opens o.devs[key]), o.devPanels are its panels; o.timers collects what setTimeout is given; o.stored: the
// browser's stored values (the store is returned).
function load(o = {}) {
  const calls = [], handlers = {}, store = new Map(Object.entries(o.stored || {}));
  const at = { tab: (o.key || 'overview:').split(':')[0], subs: { ...SUBS }, ready: o.ready || (() => true) };
  if (o.key && o.key.split(':')[1]) at.subs[at.tab] = o.key.split(':')[1];
  const home = { hidden: false, innerHTML: '', scrollTop: 0, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, left: 0 }), contains: () => true };
  const nodes = { '#home': home };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: s => nodes[s] || null, querySelectorAll: () => [], getElementById: id => nodes[`#${id}`] || null,
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, dispatchEvent() {} };
  const PeelAnalysisTabs = { TAB_KEYS: AT.TAB_KEYS, chipsAt: AT.chipsAt, tabReady: t => !!at.ready(t), getFootTab: () => at.tab, getSvcSub: () => at.subs.svc,
    setSub: (t, s) => { calls.push(['setSub', t, s]); at.subs[t] = s; return t; }, setFootPref: t => calls.push(['setFootPref', t]),
    showFootTab: t => { calls.push(['showFootTab', t]); at.tab = t; }, openFold: f => calls.push(['openFold', f]),
    openTab: (t, s) => { calls.push(['openTab', t, s]); if (s) at.subs[t] = s; at.tab = t; },
    wantedTab: () => at.tab, viewKey: () => `${at.tab}:${at.subs[at.tab] || ''}`, ownView: t => !!at.kind && AT.ownView(t, at.kind) };
  const panels = o.panels || {}, dv = { p: o.dev || null }, devPanels = o.devPanels || {};
  const site = 'dev' in o ? { DevScope: { current: () => dv.p, close: () => { dv.p = null; } }, PeelDevNav: { projectByKey: k => (o.devs || {})[k] || null, showDetail: q => { dv.p = q; } } } : {};
  const window = { document, PeelUtil: { esc: U.esc, fmtNum: U.fmtNum, fmt1: U.fmt1, store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } },
    PeelPanel: { get: k => (dv.p && devPanels[k] ? { scope: `dev:${dv.p.key}`, spec: devPanels[k] } : panels[k] ? { scope: 'area', spec: panels[k] } : null), scenarioChip: () => '', NOTE: '', sync() {}, syncTools() {} }, ...site,
    PeelAnalysisTabs, PeelApp: { state: { muni: '', sp: [], mtsa: [], projects: [], filtered: [], ...(o.state || {}) } },
    PeelOverviewTab: { lastAreaSpec: () => o.area || null }, PeelMapMarkers: { THIS_YEAR: 2026 }, ...(o.extra || {}) };
  const ctx = { window, document, location: { hash: '' }, setTimeout: f => { if (o.timers) o.timers.push(f); return 0; }, clearTimeout() {}, URLSearchParams, CustomEvent: function CustomEvent() {}, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of [...(o.before || []), 'js/sections.js', 'js/ws-pages.js', 'js/workspaces.js']) vm.runInNewContext(src(f), ctx);
  // A click on an element matching sel inside #home (its data-* in dataset).
  const click = (sel, dataset = {}) => { const el = { dataset }; for (const f of handlers.click || []) f({ target: { closest: s => (s === sel ? el : null) }, preventDefault() {}, stopPropagation() {} }); };
  // A panel set (js/panel.js's event: its key and scope).
  const pnlSet = detail => { for (const f of handlers['pnl:set'] || []) f({ detail }); };
  return { WP: window.PeelWsPages, W: window.PeelWorkspaces, SE: window.PeelSections, at, calls, home, window, click, pnlSet, panels, dv, nodes, store };
}
// The tab on, the view on, the busy tabs and every tab's label (a host's strip markup).
const strip = h => ({
  tabs: [...h.matchAll(/<button type="button" role="tab" class="page-sec page-tab[^"]*" data-pg-tab="(\w+)"[^>]*>([^<]+)/g)].map(m => m[2].trim()),
  on: (/class="page-sec page-tab[^"]* on" data-pg-tab="(\w+)"/.exec(h) || [])[1] || null,
  views: [...h.matchAll(/data-pg-sub="(\w+)" aria-pressed="(?:true|false)">([^<]+)</g)].map(m => m[2]),
  view: (/data-pg-sub="(\w+)" aria-pressed="true"/.exec(h) || [])[1] || null,
  busy: [...h.matchAll(/data-pg-tab="(\w+)"[^>]*aria-busy="true"/g)].map(m => m[1]),
});
// index.html: the map's tabs (key, label, data-info) and each tab's chips (sub, label).
const MAP_TABS = [...HTML.matchAll(/<button type="button" role="tab" class="f-tab[^"]*" id="ftab-\w+" data-tab="(\w+)" data-info="([\w-]+)"[^>]*>([^<]+)</g)].map(m => ({ key: m[1], info: m[2], label: m[3] }));
const mapChips = tab => { const i = HTML.indexOf(`data-pane="${tab}"`, HTML.indexOf('f-subtabs')), row = i < 0 ? '' : HTML.slice(i, HTML.indexOf('</div>', i)); return [...row.matchAll(/data-\w+sub="(\w+)">([^<]+)</g)].map(m => ({ sub: m[1], label: m[2] })); };

test('the strip is the map’s: five tabs in the map’s order and words, the views only with two or more', () => {
  assert.deepEqual(MAP_TABS.map(t => t.key), plain(AT.TAB_KEYS));
  const L = load();
  assert.deepEqual(plain(L.WP.TAB_INFO), Object.fromEntries(MAP_TABS.map(t => [t.key, t.info])), 'each tab’s ⓘ card: the map tab’s');
  for (const t of MAP_TABS) {
    const sub = AT.chipsAt(t.key, 'area')[0] || '', h = load({ key: `${t.key}:${sub}` }).WP.host().tabs, s = strip(h);
    assert.deepEqual(s.tabs, MAP_TABS.map(x => x.label), `${t.key}: the map’s five, in its order and words`);
    assert.equal(s.on, t.key);
    assert.ok(h.includes(`data-pg-tab="${t.key}" data-info="${t.info}"`), `${t.key}: data-info`);
    // (the map's chips less those an area hides: FSR review is a development's, Files a file's)
    const want = mapChips(t.key).filter(c => !AT.hiddenAt('area', t.key, c.sub)).map(c => c.label);
    if (want.length > 1) { assert.deepEqual(s.views, want, `${t.key}: the map’s chips, its words`); assert.equal(s.view, sub); }
    else assert.ok(!h.includes('page-subsecs'), `${t.key}: one view or none is no choice: no row`);
  }
  assert.deepEqual(mapChips('svc').map(c => c.sub), ['capacity', 'network', 'pipes', 'fsr'], '(Old pipes since navigation phase 6c)');
  // The markup (pure): the strip a tablist, a tab lit, a busy one marked and worded, Records a tab like the
  // others (navigation phase 8b: no trailing class).
  const h = L.WP.tabsHTML({ tabs: [{ key: 'overview', label: 'Overview', info: 'tab-overview' }, { key: 'svc', label: 'Servicing', info: 'tab-servicing', busy: true }, { key: 'records', label: 'Records' }], on: 'svc', chips: [{ sub: 'capacity', label: 'Capacity' }, { sub: 'network', label: 'Network' }], sub: 'network' });
  assert.equal(h, '<nav class="page-secs page-tabs" role="tablist" aria-label="Tabs" data-psec="tabs"><button type="button" role="tab" class="page-sec page-tab" data-pg-tab="overview" data-info="tab-overview" aria-selected="false">Overview</button><button type="button" role="tab" class="page-sec page-tab on" data-pg-tab="svc" data-info="tab-servicing" aria-selected="true" aria-busy="true" title="Loading: it opens when its data lands">Servicing <small class="page-tab-wait">loading</small></button><button type="button" role="tab" class="page-sec page-tab" data-pg-tab="records" aria-selected="false">Records</button></nav><nav class="page-secs page-subsecs" aria-label="Views" data-psec="views"><button type="button" class="page-sec" data-pg-tab="svc" data-pg-sub="capacity" aria-pressed="false">Capacity</button><button type="button" class="page-sec on" data-pg-tab="svc" data-pg-sub="network" aria-pressed="true">Network</button></nav>');
  assert.ok(!L.WP.tabsHTML({ tabs: [], on: 'dca', chips: [{ sub: 'timing', label: 'DC timing' }], sub: 'timing' }).includes('page-subsecs'), 'one chip: no views row');
  assert.doesNotMatch(src('js/ws-pages.js'), /page-tab-trail|trail: t === 'records'/); assert.doesNotMatch(src('css/app.css'), /page-tab-trail/);
  // (data-pg-*: never data-at, which a page sends to the full map, nor the map's own chip attributes)
  assert.doesNotMatch(h, /data-at=|data-svcsub=/);
  // In the page, under the header, before the page's own top (pageHTML). (6a-S6: no filters row: the filters on
  // are the top bar trail's "k filters", removed by design, §5 row 54; a model's filters draws nothing.)
  const p = L.WP.pageHTML({ id: 'home', name: 'x', tabs: '<nav data-psec="tabs"></nav>', filters: '<div data-psec="filters"></div>', top: '<div data-psec="top"></div>', answer: 'a' }, '');
  assert.deepEqual(plain(L.WP.sectionsOf(p).slice(0, 5)), ['header', 'find', 'tabs', 'top', 'answer']);
});

test('Home hosts every area view: the page builder where a page adds to the panel, else the panel itself', () => {
  const net = { head: { name: 'Where does it flow?' }, answer: 'Network answer', figures: [{ v: '3', label: 'plants', attrs: { 'data-full-table': 'svc:network' } }],
    lists: [{ title: 'Facilities', rows: [{ attrs: { 'data-ss': 'plant:Lakeview', title: 'Open it' }, html: 'G.E. Booth' }, { kv: true, html: 'kv' }], total: 9, seeAll: { 'data-full-table': 'svc:network' } }],
    foot: { primary: { label: 'Show the network on the map', attrs: { 'data-mview': 'wastewater' } } } };
  const checks = { head: { name: 'Are the data sound?' }, answer: 'Checks answer', lists: [{ title: 'Developments', rows: [{ attrs: { 'data-pnl-dev': 'd1' }, html: 'd' }, { attrs: { 'data-ws-page': 'outlets' }, html: 'o' }], total: 2 }],
    foot: { primary: { label: 'Duplicate check', attrs: { 'data-full-table': 'records', 'data-ft-go': 'Units: every record' } } } };
  const pipe = { head: { name: 'What is in the pipeline?' }, answer: 'Pipeline answer', lists: [], foot: { primary: { label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' } } } };
  const proj = { head: { name: 'What is being built?' }, answer: 'Projects answer', lists: [], foot: { primary: { label: 'Show them on the map', attrs: { 'data-pnl-ce-map': 'cons' } }, secondary: [{ label: 'CSV: every contract', attrs: { 'data-ce-cap-csv': '' } }] } };
  const panels = { 'svc:network': net, 'records:checks': checks, 'growth:pipeline': pipe, 'dca:projects': proj };
  const S = load().SE;
  for (const [key, v] of Object.entries(S.VIEWS.area)) {
    const L = load({ key, panels }), m = L.WP.host(), s = strip(m.tabs), [tab, sub] = key.split(':');
    assert.equal(m.id, v.page || key, `${key}: ${v.page ? 'its page builder' : 'the map’s panel'}`);
    assert.equal(s.on, tab, key); assert.equal(s.view, sub || null, key);
    if (v.keys) {
      assert.equal(m.answer, panels[key].answer, `${key}: the stored panel’s answer`);
      assert.deepEqual(plain(m.actions[0]), { ...plain(panels[key].foot.primary), primary: true }, `${key}: its footer’s own action first`);
      assert.deepEqual(plain(m.actions.map(a => a.label)).slice(-2), ['Open the map', 'Full table']);
      assert.match(m.eyebrow, new RegExp(`^${L.W.tabPath(tab, sub)} · Peel$`), `${key}: named by the tabs’ words`);
    }
  }
  // Servicing › Network: Open the map is the Servicing capacity map view at Network (keep); a row opens its scope there.
  let m = load({ key: 'svc:network', panels }).WP.host();
  assert.equal(m.name, 'Where does it flow?');
  assert.deepEqual(plain(m.actions.slice(1)), [{ label: 'Open the map', attrs: { 'data-ws-go': 'tight', 'data-ws-keep': '' } }, { label: 'Full table', attrs: { 'data-ws-go': 'tight', 'data-ws-keep': '', 'data-ws-fulltable': 'svc:network' } }]);
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': 'tight', 'data-ws-ss': 'plant:Lakeview', 'data-ws-keep': '', title: 'Open it' });
  assert.equal(m.lists[0].rows[1].attrs, null, 'a row that opens nothing stays so');
  assert.deepEqual(plain(m.lists[0].see), { 'data-ws-go': 'tight', 'data-ws-fulltable': 'svc:network', 'data-ws-keep': '' }, 'See all: the full table there');
  assert.deepEqual(plain(m.figures[0].attrs), { 'data-ws-go': 'tight', 'data-ws-fulltable': '1', 'data-ws-keep': '' }, 'a figure into the full table: the map view at the view');
  // Capital › Projects: its two footer actions, then the map view (DC projects) at Projects.
  m = load({ key: 'dca:projects', panels }).WP.host();
  assert.deepEqual(plain(m.actions.map(a => a.label)), ['Show them on the map', 'CSV: every contract', 'Open the map', 'Full table']);
  assert.deepEqual(plain(m.actions[2].attrs), { 'data-ws-go': 'projects', 'data-ws-keep': '' });
  // Records › Data checks: no map workspace, the full map at the view; a plain row too, a page's row as it is.
  m = load({ key: 'records:checks', panels }).WP.host();
  assert.deepEqual(plain(m.lists[0].rows.map(r => r.attrs)), [{ 'data-pnl-dev': 'd1', 'data-at': 'records:checks' }, { 'data-ws-page': 'outlets' }]);
  assert.deepEqual(plain(m.actions.slice(1)), [{ label: 'Open the map', attrs: { 'data-ws-full': '', 'data-at': 'records:checks' } }, { label: 'Full table', attrs: { 'data-at': 'records:checks', 'data-full-table': '' } }]);
  // No stored panel yet: loading, named, and the page tries again (pending).
  m = load({ key: 'svc:network' }).WP.host();
  assert.equal(m.pending, true); assert.match(m.answer, /Loading Servicing › Network…/); assert.equal(m.name, 'Servicing › Network');
  // A view the area hides (Records › Files, FSR review): the tab's first, as the map shows it.
  assert.equal(load({ key: 'records:files', panels }).WP.host().id, 'data');
  assert.equal(load({ key: 'svc:fsr', panels }).WP.host().id, 'tight');
});

test('a tab before its data: Servicing and Capital say loading, lit, never Overview', () => {
  let L = load({ key: 'svc:capacity', ready: t => t !== 'svc' && t !== 'dca' });
  let m = L.WP.host(), s = strip(m.tabs);
  assert.equal(m.id, 'tight'); assert.equal(m.pending, true);
  assert.match(m.answer, /Loading Servicing › Capacity \(the servicing model and the DC program\)…/);
  assert.equal(s.on, 'svc', 'the tab asked for is the one lit'); assert.deepEqual(s.busy, ['svc', 'dca']);
  assert.match(m.tabs, /data-pg-tab="svc"[^>]*aria-busy="true" title="Loading: it opens when its data lands">Servicing <small class="page-tab-wait">loading<\/small>/);
  assert.deepEqual(s.views, ['Capacity', 'Network', 'Old pipes'], 'its views row is there');
  assert.equal(m.waitTab, true, 'it tries again until the tab is ready, even with nothing changed (js/workspaces.js renderPage)');
  assert.match(src('js/workspaces.js'), /if \(!force && html === lastHTML\) \{ if \(m\.waitTab\) \{ clearTimeout\(timer\); timer = setTimeout\(\(\) => renderPage\(false\), 1000\); \} return; \}/);
  // Capital › EAs needs neither the servicing model nor the DC program: its builder's own content (or its own wait for
  // the EA lists) while the strip says Capital is loading, and the page tries again until it is ready.
  m = load({ key: 'dca:eas', ready: t => t !== 'dca' }).WP.host();
  assert.equal(m.id, 'eaflow'); assert.doesNotMatch(m.answer, /Loading Capital › EAs/); assert.match(m.answer, /Loading the EAs and capital projects…/);
  assert.deepEqual(strip(m.tabs).busy, ['dca']); assert.equal(m.waitTab, true);
  assert.match(src('js/workspaces.js'), /if \(m\.pending \|\| m\.waitTab\) \{ clearTimeout\(timer\); timer = setTimeout\(\(\) => renderPage\(false\), 1000\); \}/, 'drawn, it still tries again while the tab loads');
  const ce = { data: { loaded: true, eas: { generatedAt: 'g', eas: [] }, capital: { records: [] } } };
  const flow = { all: [], answer: 'EA flow answer', figures: [], chart: '', lists: [{ title: 'Waiting', rows: [] }], folds: [], method: '', sources: '' };
  m = load({ key: 'dca:eas', ready: t => t !== 'dca', extra: { PeelCapitalEA: ce, PeelCapitalEAModel: { eaFlowSpec: () => flow } } }).WP.host();
  assert.equal(m.id, 'eaflow'); assert.match(m.answer, /EA flow answer/, 'the EA lists in: drawn, DC program or not');
  assert.equal(m.pending, undefined); assert.equal(m.waitTab, true); assert.deepEqual(strip(m.tabs).busy, ['dca']);
  // (the other Capital views are the DC program's: they wait for it)
  m = load({ key: 'dca:timing', ready: t => t !== 'dca' }).WP.host();
  assert.equal(m.id, 'projects'); assert.match(m.answer, /Loading Capital › DC timing \(the servicing model and the DC program\)…/); assert.equal(m.pending, true);
  // Its data in: the Servicing capacity builder (loading only for its own panel).
  L = load({ key: 'svc:capacity' }); m = L.WP.host();
  assert.equal(m.id, 'tight'); assert.deepEqual(strip(m.tabs).busy, []);
  assert.match(m.answer, /Loading the servicing model…/, 'the builder’s own wait');
  // The held pick (js/analysis-tabs.js): the page reads the tab asked for, the map's one rule for "ready".
  const at = src('js/analysis-tabs.js');
  assert.match(at, /if \(!tabReady\(key\)\) \{ heldTab = key; key = 'overview'; \} else heldTab = null;/);
  assert.match(at, /const wantedTab = \(\) => heldTab \|\| footTab;/);
  assert.match(at, /const viewKey = \(\) => \{ const t = wantedTab\(\), s = TABSUBS\[t\]; return `\$\{t\}:\$\{s \? s\.get\(\) : ''\}`; \};/);
  assert.match(at, /const tabReady = t => !!document\.querySelector\(`\.f-tab\[data-tab="\$\{t\}"\]:not\(\[hidden\]\):not\(\[aria-busy\]\)`\);/);
  assert.match(at, /t\.classList\.toggle\('f-tab-held', t\.dataset\.tab === heldTab\);/, 'the map’s held tab is marked as taken');
  // The map's strip shows them from the first paint, marked loading (6a-S2b), never hidden.
  for (const id of ['ftab-svc', 'ftab-dca']) {
    const b = new RegExp(`<button [^>]*id="${id}"[^>]*>`).exec(HTML)[0];
    assert.match(b, /aria-busy="true"/, id); assert.doesNotMatch(b, / hidden[ >]/, id);
  }
  const st = src('js/svc-tab.js');
  assert.match(st, /busy\(\$\('#ftab-svc'\), !has\);\n {4}busy\(\$\('#ftab-dca'\), !has \|\| !App\(\)\.state\.dcInfra\);/);
  assert.match(st, /const busy = \(b, on\) => \{ if \(!b\) return; if \(on\) \{ b\.setAttribute\('aria-busy', 'true'\);/);
  assert.doesNotMatch(st, /#ftab-(svc|dca)'\)\.hidden/);
  const css = src('css/app.css');
  assert.match(css, /\.f-tab\[aria-busy="true"\]::after \{ content: ' · loading'; font-size: var\(--fs-1\); font-weight: 400; \}/, 'a CSS word: the tab’s label stays its name');
  assert.match(css, /@media \(max-width: 700px\) \{ \.f-tab\[aria-busy="true"\]::after \{ content: ' …'; \} \}/);
});

test('the bars are gone: no Growth in an area, Servicing or Capital section bar; Help’s bar is its four sections', () => {
  const ws = src('js/ws-pages.js'), sec = src('js/sections.js');
  assert.doesNotMatch(ws, /data-ws-asec|data-ws-wsec|wsAsec|wsWsec|function wsSection|function areaSection|let gSec|const wsSec = /);
  assert.doesNotMatch(sec, /const AREA = |servicing: \{ host|capital: \{ host|areaSpecFor|wsSpecFor/);
  // The builders draw no bar of their own (the host's strip is the way between them).
  const spec = (name, extra) => ({ head: { name, status: null, identity: 'Peel' }, answer: name, figures: [], lists: [{ title: 'L', rows: [{ html: 'r' }], total: 1 }], folds: [], method: 'm', sources: 's', ...extra });
  const panels = { 'svc:capacity': spec('cap'), 'dca:timing': spec('dc'), 'growth:timing': spec('fc'), 'records:sources': spec('src') };
  const L = load({ panels, extra: { PeelSvcCapacity: { collect: () => [] }, PeelAnalysisTabs: { getSys: () => 'both' } }, state: { criteria: { wastewater: { avg: 290 }, water: { avg: 280, maxDay: 1.8 } }, servicing: { psAreas: [] } } });
  for (const id of ['tight', 'projects', 'outlook', 'data']) { const m = L.WP.build(id); assert.ok(m.answer && !/Loading/.test(m.answer), `${id} built`); assert.equal(m.top, undefined, `${id}: no section bar`); }
  assert.equal(L.WP.build('data').eyebrow, 'Records › Sources · Peel');
  for (const fn of ['growth', 'eaflow']) assert.doesNotMatch(ws.slice(ws.indexOf(`function ${fn}()`), ws.indexOf('\n  }\n', ws.indexOf(`function ${fn}()`))), /top: /, `${fn}: no bar`);
  // Help's bar: Start here · How it works · Glossary · How the app decides (navigation phase 7, design §3.7; its Data
  // sources and Data checks, Home's Records tab, removed from it by design, §5 row 166: Start here links there).
  const top = L.WP.build('help').top;
  assert.equal(top, '<nav class="page-secs" aria-label="Sections" data-psec="sections"><button type="button" class="page-sec on" data-ws-page="help" aria-pressed="true">Start here</button><button type="button" class="page-sec" data-ws-page="guides" aria-pressed="false">How it works</button><button type="button" class="page-sec" data-ws-page="glossary" aria-pressed="false">Glossary</button><button type="button" class="page-sec" data-ws-page="logic" aria-pressed="false">How the app decides</button></nav>');
  assert.doesNotMatch(top, /data-pg-tab/);
});

test('the strip’s click opens the tab, as the map’s, and the page follows; from another page, Home at it', () => {
  let L = load({ key: 'svc:capacity' });
  L.W.openPage('home'); L.calls.length = 0;
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'network' });
  assert.deepEqual(L.calls, [['openTab', 'svc', 'network']], 'stored and in the link, as the map’s chip (AT.openTab)');
  assert.deepEqual([L.W.page(), L.W.view()], ['home', 'svc:network']);
  assert.match(L.home.innerHTML, /data-pg-sub="network" aria-pressed="true">Network</, 'the page drawn at the view');
  L.calls.length = 0; L.click('#home [data-pg-tab]', { pgTab: 'growth' });
  assert.deepEqual(L.calls, [['openTab', 'growth', undefined]], 'a tab: its view last picked');
  // DC timing from the strip: the list again (an open project closed), as the old section bar's.
  const DP = { state: { sel: 'wastewater:22-1' }, render() { this.drawn = true; } };
  L.window.PeelDcProjects = DP;
  L.click('#home [data-pg-tab]', { pgTab: 'dca', pgSub: 'timing' });
  assert.equal(DP.state.sel, null); assert.equal(DP.drawn, true);
  // From another page: Home at that view, the tab not set again.
  L = load(); L.W.openPage('help'); L.calls.length = 0;
  L.click('#home [data-pg-tab]', { pgTab: 'records', pgSub: 'checks' });
  assert.deepEqual(L.calls, [['openTab', 'records', 'checks']]);
  assert.deepEqual([L.W.page(), L.W.view()], ['home', 'records:checks']);
  // Usage: counted as the map's own kinds, so a tab's count adds the page and the map up.
  const us = src('js/usage.js');
  assert.match(us, /if \(\(el = at\('\[data-pg-sub\]'\)\)\) return count\('sub', `\$\{el\.dataset\.pgTab\}\.\$\{el\.dataset\.pgSub\}`\);\n {4}if \(\(el = at\('\[data-pg-tab\]'\)\)\) return count\('tab', el\.dataset\.pgTab\);\n {4}if \(\(el = at\('\.f-tab\[data-tab\]'\)\)\)/);
  // (the strip's buttons are no map link: MAP_LINK would send a data-at click to the full map)
  assert.doesNotMatch(src('js/workspaces.js').match(/const MAP_LINK = '[^']*'/)[0], /data-pg/);
  // The page keeps the strip in view after a rebuild (it scrolls sideways on a phone).
  assert.match(src('js/workspaces.js'), /placeSearch\(\); placeMap\(\); stripInView\(el\);/);
});

test('Home at a plan names the plan and has its Area report', () => {
  const area = { head: { identity: 'Bram West · 40 developments' }, answer: 'x', figures: [], lists: [] };
  let L = load({ area, state: { sp: ['sp1'], muni: 'Brampton' }, extra: { PeelPlanAreas: { areaName: (k, id) => (k === 'sp' && id === 'sp1' ? 'Plan One' : id) } } });
  L.W.openPage('home');
  assert.match(L.home.innerHTML, /<h1>Plan One: what needs attention<\/h1>/);
  const m = L.WP.build('home');
  assert.deepEqual(plain(m.actions.filter(Boolean).map(a => [a.label, a.attrs])), [['Briefing PDF', { 'data-pnl-brief': '' }], ['Area report (PDF)', { 'data-ws-areareport': 'a:sp1' }], ['Full map', { 'data-ws-full': '' }]]);
  // A municipality, or two plans: as before (its name, no Area report here).
  L = load({ area, state: { sp: ['sp1', 'sp2'], muni: 'Brampton' }, extra: { PeelPlanAreas: { areaName: () => 'Plan One' } } });
  const m2 = L.WP.build('home');
  assert.equal(m2.name, 'Brampton: what needs attention'); assert.ok(!m2.actions.filter(Boolean).some(a => a.label === 'Area report (PDF)'));
  // The views' eyebrows: the tabs' words and the place (one name per thing, §3.9).
  L = load({ state: { sp: ['sp1'] }, extra: { PeelPlanAreas: { areaName: () => 'Plan One' } } });
  assert.equal(L.WP.build('tight').eyebrow, 'Servicing › Capacity · Plan One');
});

test('css: the strip on a phone above Home’s groups, the loading word, the tabs heavier than the views', () => {
  const css = src('css/app.css');
  const order = /\n {2}(\.page-main\[data-page="home"\] > \.home-h,[^{]*)\{ order: -2; \}/.exec(css)[1].split(',').map(x => x.trim());
  for (const s of ['.page-tabs', '.page-subsecs', '.home-h', '.home-scope']) assert.ok(order.includes(`.page-main[data-page="home"] > ${s}`), s);
  assert.match(css, /\.page-tabs \.page-sec \{ font-weight: 600; \}/);
  assert.match(css, /\.page-tab-wait \{ font-weight: 400; color: var\(--text-muted\); \}/);
  assert.match(css, /@media \(max-width: 700px\) \{\n {2}\.page-tab-wait \{ display: none; \}\n {2}\.page-tab\[aria-busy\]::after \{ content: ' …'; \}\n\}/, 'a phone: five tabs fit one sideways row');
  // (the strip and the views row are .page-secs: 44 px buttons, a row that scrolls sideways in its own box)
  assert.match(css, /\.page-secs \{ display: flex; gap: var\(--space-1\); border-bottom: 1px solid var\(--border\); margin: var\(--space-2\) 0 var\(--space-3\); overflow-x: auto; scrollbar-width: none; \}/);
  assert.match(css, /white-space: nowrap; min-height: 44px; \}/);
});

test('What’s coming opens on By period: the Forecast view leads with it, under the answer, as the reader left it', () => {
  // (6a-S3: on the old What's coming page By period sat about 1.7 screens down; the map's panel keeps its order)
  const FOLD_ID = { period: 'pnl-by-period', tiers: 'pnl-how-sure', since: 'pnl-since' }, open = { 'pnl-by-period': true };
  const LU = { FOLD_ID, foldsNow: fs => fs.map(f => (f.id in open ? { ...f, open: open[f.id] } : f)) };
  const folds = [{ id: 'pnl-by-period', title: 'By period', open: false, html: '<table>p</table>' }, { id: 'pnl-how-sure', title: 'How sure (tiers A to E)', open: false, html: 't' }];
  const fc = { head: { status: null, identity: 'Peel' }, answer: 'Forecast answer', figures: [{ v: '9', u: 'units', label: 'by 2031' }], lists: [], folds, method: 'm', sources: 's' };
  const L = load({ key: 'growth:timing', panels: { 'growth:timing': fc }, extra: { PeelLedgerUI: LU } });
  let m = L.WP.host();
  assert.equal(m.id, 'outlook'); assert.equal(m.name, 'When do the homes and people arrive?', 'the Forecast’s question (What’s coming’s own h1 retired with its page)');
  assert.deepEqual(plain(m.lead), { ...folds[0], open: true }, 'By period, open as the reader left it');
  assert.deepEqual(plain(m.folds.map(f => f.id)), ['pnl-how-sure'], 'How sure stays in the folds column');
  const order = L.WP.sectionsOf(L.WP.pageHTML(m, ''));
  assert.ok(order.indexOf('tabs') < order.indexOf('answer') && order.indexOf('answer') < order.indexOf('lead') && order.indexOf('lead') < order.indexOf('figures'), order.join(' '));
  open['pnl-by-period'] = false; m = L.WP.host();
  assert.equal(m.lead.open, false, 'shut: one summary line there');
  // What's coming (the sidebar entry, #w=p:coming): Home at Growth › Forecast with By period opened.
  L.calls.length = 0; L.W.openPage('coming');
  assert.deepEqual(L.calls, [['setSub', 'growth', 'timing'], ['setFootPref', 'growth'], ['showFootTab', 'growth'], ['openFold', 'period']]);
  assert.deepEqual([L.W.page(), L.W.view()], ['home', 'growth:timing']);
  // No ledger module: no lead, every fold where it was.
  const L2 = load({ key: 'growth:timing', panels: { 'growth:timing': fc } });
  m = L2.WP.host(); assert.equal(m.lead, null); assert.deepEqual(plain(m.folds.map(f => f.id)), ['pnl-by-period', 'pnl-how-sure']);
});

test('Servicing and Capital on Home below Peel say Peel-wide once, in the map’s words (one peelWideText)', () => {
  // (6a-S4, design §5 row 55: the old area page's own wording went with its sections; js/svc-scope.js words it once)
  const asked = [], SS = { peelWideText: (t, s) => { asked.push([t, s]); return t === 'svc' || t === 'dca' ? `<strong>Peel-wide.</strong> ${t} serve all of Peel <button type="button" class="btn small link" data-ss="plant:Lakeview">G.E. Booth</button>` : ''; } };
  const spec = name => ({ head: { name, status: null, identity: 'Brampton' }, answer: `${name} answer`, figures: [], lists: [], folds: [], method: 'm', sources: 's' });
  const panels = { 'svc:network': spec('Network'), 'dca:projects': spec('Projects'), 'growth:pipeline': spec('Pipeline'), 'records:checks': spec('Checks') };
  for (const key of ['svc:network', 'dca:timing']) {
    asked.length = 0;
    const L = load({ key, panels, state: { muni: 'Brampton' }, extra: { PeelSvcScope: SS } }), m = L.WP.host(), h = L.WP.pageHTML(m, '');
    assert.deepEqual(asked, [key.split(':')], `${key}: asked with its view`);
    assert.equal(m.top, `<p class="scope-note small page-wide" role="note" data-psec="wide">${SS.peelWideText(...key.split(':'))}</p>`, key);
    const order = L.WP.sectionsOf(h);
    assert.ok(order.indexOf('tabs') < order.indexOf('wide') && order.indexOf('wide') < order.indexOf('answer'), `${key}: under the strip, before the answer`);
    assert.equal((h.match(/Peel-wide\./g) || []).length, 1, `${key}: said once`);
    assert.match(h, /data-ss="plant:Lakeview"/, 'its facility a scope link (MAP_LINK: the full map at it)');
  }
  asked.length = 0;
  for (const key of ['growth:pipeline', 'records:checks', 'overview:']) {
    const m = load({ key, panels, state: { muni: 'Brampton' }, extra: { PeelSvcScope: SS } }).WP.host();
    assert.ok(!/Peel-wide/.test(`${m.top || ''}${m.answer}`), `${key}: none`);
  }
  assert.deepEqual(asked, [], 'asked only on Servicing and Capital');
  // Asked with the view: Capital › EAs and Projects are the area's own (their EAs and contracts filtered to the
  // municipality), so the rule (the real js/svc-scope.js, one for both hosts) says nothing there; DC timing and
  // Servicing's views are Peel-wide.
  for (const key of ['dca:eas', 'dca:projects']) { asked.length = 0; load({ key, panels, state: { muni: 'Brampton' }, extra: { PeelSvcScope: SS } }).WP.host(); assert.deepEqual(asked, [key.split(':')], key); }
  const real = key => load({ key, panels, before: ['js/svc-scope.js'], state: { muni: 'Brampton', pz: [], dr: [] }, extra: { PeelOverviewTab: { lastAreaSpec: () => null, scopeText: () => 'Brampton' } } }).WP.host();
  for (const key of ['svc:capacity', 'svc:network', 'dca:timing']) assert.match(real(key).top || '', /^<p class="scope-note small page-wide" role="note" data-psec="wide"><strong>Peel-wide\.<\/strong> .* serve all of Peel, so these tables are not filtered to Brampton\.<\/p>$/, key);
  for (const key of ['dca:eas', 'dca:projects']) { const m = real(key); assert.equal(m.top, undefined, `${key}: filtered to the area, so no note`); assert.ok(!/Peel-wide/.test(m.answer), key); }
  // Nothing to say (at Peel, or a development open): no note; a tab still loading: none yet.
  assert.equal(load({ key: 'svc:network', panels, extra: { PeelSvcScope: { peelWideText: () => '' } } }).WP.host().top, undefined);
  assert.equal(load({ key: 'svc:network', panels, ready: t => t !== 'svc', extra: { PeelSvcScope: SS } }).WP.host().top, undefined);
  assert.match(src('css/app.css'), /\n\.page-main > \.scope-note \{ margin: 0; \}/);
});

test('the drill is the filter (owner decision 10), and a plan’s own totals count a straddler’s share (the two-part rule)', () => {
  const area = { head: { identity: 'Plan One · 40 developments' }, answer: 'x', figures: [{ v: '1,000', u: 'people', label: 'at build-out' }], lists: [] };
  const fc = { head: {}, answer: 'f', figures: [{ v: '70', u: 'units', label: 'expected by 2031', ctx: 'likely' }], lists: [], folds: [] };
  const ins = { found: 1, planned: 140, left: 90, people: 400, outside: 100, straddling: 1, devs: 2 };
  const extra = o => ({ PeelPlanAreas: { areaName: () => 'Plan One', areaById: new Map([['sp1', { municipality: 'Brampton' }]]) }, Growth: { pipelineTotals: () => ({ planned: 240, left: 190, completed: 10 }) }, PeelPlanTables: { inside: () => o }, PeelSearchFilter: { renderMuniChips() {} } });
  const growth = m => m.groups.find(g => g.title === 'Growth').figures.filter(Boolean).map(f => [f.label, f.v, f.ctx]);
  // Home at one plan: planned, left to build and people inside it, by share; the 2031 figure the Forecast's, whole.
  let L = load({ area, panels: { 'growth:timing': fc }, state: { sp: ['sp1'], muni: 'Brampton', filtered: [{}, {}] }, extra: extra(ins) });
  assert.deepEqual(plain(growth(L.WP.build('home'))), [
    ['planned', '140', '+ 100 planned in the parts of 1 development outside it'],
    ['left to build', '90', 'inside Plan One, by share'],
    ['at build-out', '400', 'inside Plan One · Peel design criteria'],
    ['expected by 2031', '70', 'likely · the developments in or partly in Plan One, whole']]);
  // No straddler (nothing outside it): the count of developments as before.
  L = load({ area, panels: { 'growth:timing': fc }, state: { sp: ['sp1'], filtered: [{}, {}] }, extra: extra({ ...ins, outside: 0, straddling: 0 }) });
  assert.equal(growth(L.WP.build('home'))[0][2], '2 developments');
  // Two plans, one inside the other (sp=a,b): the real roll-up counts the level under once, in the plan, so the planned
  // figure never exceeds the developments shown and no "+ -n … outside it" is printed (nor one under half a home).
  const R = require('../js/plan-rollup.js'), AR = [{ id: 'sp1', name: 'Plan One', municipality: 'Brampton', kind: 'secondary plan', parent: null }, { id: 'sp2', name: 'Precinct', municipality: 'Brampton', kind: 'precinct', parent: 'sp1' }];
  const ms = p => ({ planned: p.u, committed: 0, proposed: p.u, permitted: 0, completed: 0, left: p.u, people: p.u * 3, jobs: 0 });
  const rr = R.build([{ key: 'x', municipality: 'Brampton', u: 100, pt: ['sp2', 'sp1'] }, { key: 'y', municipality: 'Brampton', u: 50, pt: ['sp1'] }], { areas: AR, pointOf: p => p.pt, measure: ms });
  L = load({ area, panels: { 'growth:timing': fc }, state: { sp: ['sp1', 'sp2'], muni: 'Brampton', filtered: [{}, {}] }, extra: extra(R.within(rr, ['sp1', 'sp2'])) });
  assert.deepEqual(plain(growth(L.WP.build('home')).slice(0, 2).map(x => x.slice(0, 2))), [['planned', '150'], ['left to build', '150']], 'counted once: the 150 shown');
  for (const outside of [-9745, 0.2]) {
    L = load({ area, panels: { 'growth:timing': fc }, state: { sp: ['sp1'], muni: 'Brampton', filtered: [{}, {}] }, extra: extra({ ...ins, outside }) });
    assert.equal(growth(L.WP.build('home'))[0][2], '2 developments', `outside ${outside}: no clause`);
  }
  // The plan not in the tree (found 0), or no plan filter: Growth's own totals of the developments shown.
  for (const st of [{ sp: ['sp1'] }, { sp: [] }]) {
    L = load({ area, panels: { 'growth:timing': fc }, state: { ...st, filtered: [{}, {}] }, extra: extra({ ...ins, found: 0 }) });
    assert.deepEqual(plain(growth(L.WP.build('home')).map(x => x.slice(0, 2))), [['planned', '240'], ['left to build', '190'], ['at build-out', '1,000'], ['expected by 2031', '70']], JSON.stringify(st));
  }
  // Home's municipality buttons are places, as the trail's steps: a municipality the whole of it, Peel all of Peel
  // (a plan or MTSA filter goes with them: under "Peel", never a plan's figures).
  let applied = 0;
  L = load({ area, state: { sp: ['sp1'], mtsa: ['mt1'], pz: [], dr: [], muni: 'Brampton' }, extra: extra(ins) });
  L.window.PeelApp.applyFilters = () => { applied++; };
  const S = L.window.PeelApp.state;
  L.W.openPage('home'); L.click('[data-ws-muni]', { wsMuni: 'Brampton' });
  assert.deepEqual(plain([S.muni, S.sp, S.mtsa, applied]), ['Brampton', [], [], 1], 'Brampton: the whole of it');
  Object.assign(S, { sp: ['sp1'] }); L.click('[data-ws-muni]', { wsMuni: '' });
  assert.deepEqual(plain([S.muni, S.sp, applied]), ['', [], 2], 'Peel: all of it');
  // A plan row of "Plans furthest behind their target" (data-ws-explore's one producer since navigation phase 6b moved
  // the site's trail to the top bar's): that plan the filter, Home at Growth › Areas, the development closed first.
  const closed = [];
  L.window.DevScope = { current: () => ({ key: 'k' }), close: () => closed.push(1) };
  L.calls.length = 0; applied = 0;
  L.click('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall],[data-gt-by],[data-gt-sort],[data-gt-tog],[data-gt-more],[data-ws-explore]', { wsExplore: 'a:sp1' });
  assert.deepEqual(plain([S.muni, S.sp, applied, closed.length]), ['Brampton', ['sp1'], 1, 2], 'the filter, applied once; the development closed (and by Home)');
  assert.deepEqual(plain(L.calls[0]), ['openTab', 'growth', 'areas']);
  assert.deepEqual([L.W.page(), L.W.view()], ['home', 'growth:areas']);
  // A drill row: the same filter, the page at its top.
  L.window.DevScope = null; L.home.scrollTop = 500;
  L.click('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall],[data-gt-by],[data-gt-sort],[data-gt-tog],[data-gt-more],[data-ws-explore]', { wsDrill: 'm:Brampton' });
  assert.deepEqual(plain([S.muni, S.sp, applied, L.home.scrollTop]), ['Brampton', [], 2, 0]);
  // Open the map from Growth › Areas (§5 row 78's name, as Home's other views): the map view there, already filtered
  // (the data-ws-area handler went).
  const g = src('js/ws-pages.js'), fn = g.slice(g.indexOf('  function growth() {'), g.indexOf('\n  }\n', g.indexOf('  function growth() {')));
  assert.ok(fn.includes("{ label: 'Open the map', attrs: { 'data-ws-go': 'growth', 'data-ws-keep': '' } }") && fn.includes("map: { svg: mapSvg, attrs: { 'data-ws-go': 'growth', 'data-ws-keep': '' },"));
  assert.doesNotMatch(`${g}${src('js/workspaces.js')}`, /data-ws-area['"]|wsArea\b/);
  // What reads the filtered set whole stays at its level: the census baseline and the 2031 figure (not at a plan).
  assert.ok(fn.includes('const atTop = !fsp.length && (atPeel || n.id === `m:${fl.muni}`);'));
  assert.ok(fn.includes('bc = atTop && CAr && CAr.baselineCensus') && fn.includes('const f2031 = atTop && tm && tm.figures'));
});

// js/topbar.js in a vm: each element a stub that records its listeners; the place, the plan tree and the filters
// stubbed (o.filters: [{ label, scope }], each clear logged). o.dev: DevScope's open development (o.kept: a result
// keeps it), o.place its deepest area (placeOf), o.mode the page or the map, o.tab the tab on, o.scope PeelSvcScope and
// o.tools PeelTools (a global, as the page's); the close, the drill, the tab and the page opened logged.
function loadTopbar(o = {}) {
  const nodes = {}, log = [];
  const node = sel => nodes[sel] || (nodes[sel] = { hidden: sel === '#tb-fl-pop', innerHTML: '', style: {}, handlers: {}, clientWidth: 1000, offsetWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, insertAdjacentHTML() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); }, ...(sel === '#trail' ? o.trail || {} : {}) });
  const S = { muni: '', sp: [], mtsa: [], pz: [], dr: [], filtered: [], ...(o.state || {}) }, names = o.names || {}, stored = {};
  const filters = (o.filters || []).map(f => ({ ...f, clear: () => log.push(`clear ${f.label}`) }));
  const window = {
    PeelUtil: { $: node, esc: U.esc, fmtNum: U.fmtNum, store: { get: (k, d) => d }, toast() {} }, PeelDesign: { icon: n => `<svg data-icon="${n}"></svg>` },
    PeelApp: { state: S, applyFilters: () => log.push('apply') }, Growth: { pipelineTotals: () => ({ planned: 0 }) },
    PeelPlanAreas: { areaName: (k, id) => names[id] || '', renderAreaSelects() {}, showArea() {}, renderPlanAreas() {} },
    PeelSvcData: { renderSvcSelects() {}, showSvcArea() {} }, PeelAreaSelect: { clearSelected() {} },
    PeelPlanTables: { areaPath: id => (o.paths || {})[id] || [id], areas: () => [], inside: () => null },
    PeelFilterUI: { activeFilters: () => filters, oldLinkNote: () => o.old || '', resetAllFilters: () => log.push('reset all'), includeCompleted: () => log.push('include') },
    ...(o.width ? { matchMedia: q => ({ matches: /max-width: (\d+)px/.test(q) && o.width <= +/max-width: (\d+)px/.exec(q)[1] }) } : {}),
    // (openTab stores the tab, footTab4, as js/analysis-tabs.js's; setFootPref and showFootTab do not)
    PeelAnalysisTabs: { wantedTab: () => o.tab || 'overview', openTab: (t, sb) => { stored.footTab4 = t; log.push(`openTab ${t}${sb ? ` ${sb}` : ''}`); }, setFootPref: t => log.push(`setFootPref ${t}`), showFootTab: t => log.push(`showFootTab ${t}`) },
    PeelShare: { viewLink: { write: () => log.push('link') } },
    PeelWsPages: { drillTo: id => log.push(`drill ${id}`) }, PeelDevNav: { getCurrentProject: () => o.dev || null, showDetail: p => log.push(`showDetail ${p.key}`) },
    PeelWorkspaces: { mode: () => o.mode || 'full', openPage: (id, op) => log.push(`openPage ${id} ${JSON.stringify(op)}`) },
    ...(o.kept ? { PeelSvcScope: { keepsDev: () => true, crumbs: () => [], peelWideNote() {}, closeResult() {} } } : {}),
    ...(o.scope ? { PeelSvcScope: o.scope } : {}),
  };
  if ('place' in o) window.PeelPlanTables.placeOf = () => o.place;
  const document = { querySelector: s => { log.push(`query ${s}`); return null; }, addEventListener() {}, documentElement: { classList: { contains: () => false } } };
  const ctx = { window, document, matchMedia: () => ({ matches: false, addEventListener() {} }), CSS: { escape: x => x }, setTimeout: () => 0 }; ctx.globalThis = ctx;
  if ('dev' in o) { let dv = o.dev; ctx.DevScope = { current: () => dv, close: () => { if (dv) log.push('close'); dv = null; } }; }
  if (o.tools) ctx.PeelTools = o.tools;
  vm.runInNewContext(src('js/topbar.js'), ctx);
  const T = window.PeelTopbar, ev = (sel, dataset = {}) => ({ target: { closest: s => (s === sel ? { dataset } : null) } });
  const click = (on, sel, dataset) => { for (const f of nodes[on].handlers.click || []) f(ev(sel, dataset)); };
  const steps = () => [...nodes['#trail'].innerHTML.matchAll(/class="tb-step" data-i="\d+" title="[^"]*">([^<]+)</g)].map(m => m[1]);
  return { T, S, log, stored, nodes, click, steps, trail: () => nodes['#trail'].innerHTML, pop: nodes['#tb-fl-pop'] };
}

test('one trail (6a-S6): the plan tree’s steps, the municipality’s step the whole of it, “k filters ×” clears only the k', () => {
  const filters = [{ label: 'Brampton', scope: true }, { label: 'Precinct 40-3', scope: true }, { label: '10+ units' }, { label: 'Townhouse' }];
  const L = loadTopbar({ state: { muni: 'Brampton', sp: ['p403'] }, names: { bw: 'Bram West', p403: 'Precinct 40-3' }, paths: { p403: ['bw', 'p403'] }, filters });
  L.T.renderTrail();
  // Peel › municipality › plan › precinct: the plan tree's placement, each step that level as the filter.
  assert.deepEqual(L.steps(), ['Peel', 'Brampton', 'Bram West', 'Precinct 40-3']);
  // Then the count, then the other filters (the place is the steps): "2 filters" and ×.
  const h = L.trail();
  assert.ok(h.indexOf('class="tb-count"') < h.indexOf('class="tb-fl-wrap"'), 'after the count');
  assert.match(h, /<button type="button" class="tb-fl" data-tb-filters aria-expanded="false" aria-controls="tb-fl-pop" aria-label="2 filters" [^>]*><svg data-icon="filter"><\/svg><span class="tb-fl-n">2<\/span><span class="tb-fl-w"> filters<\/span><\/button>/);
  assert.match(h, /<button type="button" class="tb-fl tb-fl-x" data-tb-filters-x aria-label="Clear the 2 filters" title="Clear these filters \(the place stays\)">×<\/button>/);
  assert.equal(L.pop.hidden, true);
  // The plan's step: the plan alone the filter (the precinct under it goes, the municipality stays).
  L.click('#trail', '[data-i]', { i: '2' });
  assert.deepEqual(plain([L.S.muni, L.S.sp, L.S.mtsa, L.S.pz, L.S.dr]), ['Brampton', ['bw'], [], [], []]);
  // The municipality's step: the whole of it, the plan / MTSA / zone / block filters gone; never the filter panel's
  // chip (which keeps a plan of the same municipality).
  Object.assign(L.S, { sp: ['p403'], mtsa: ['m1'], pz: ['z1'] }); L.log.length = 0;
  L.T.renderTrail(); L.click('#trail', '[data-i]', { i: '1' });
  assert.deepEqual(plain([L.S.muni, L.S.sp, L.S.mtsa, L.S.pz, L.S.dr]), ['Brampton', [], [], [], []]);
  assert.deepEqual(plain(L.log), ['apply'], 'applied once, no #f-muni click');
  // "2 filters" opens the popover: the two, each removable (data-pf-i indexes the list shown, the place left out),
  // Clear these 2, Reset all (every filter, the place too: the old row's Reset).
  L.T.renderTrail(); L.click('#trail', '[data-tb-filters]');
  assert.equal(L.pop.hidden, false);
  assert.match(L.trail(), /data-tb-filters aria-expanded="true"/);
  assert.match(L.pop.innerHTML, /^<div class="page-filters small" role="group" aria-label="Filters on"><span class="muted">Filters on:<\/span> <button type="button" class="chip on removable" data-pf-i="0" title="Remove this filter">10\+ units <span aria-hidden="true">×<\/span><\/button><button type="button" class="chip on removable" data-pf-i="1" title="Remove this filter">Townhouse/);
  assert.match(L.pop.innerHTML, /data-tb-filters-x title="The place stays">Clear these 2<\/button><button type="button" class="btn small link" data-pf-reset [^>]*>Reset all<\/button>/);
  L.log.length = 0; L.click('#tb-fl-pop', '[data-pf-i]', { pfI: '1' });
  assert.deepEqual(plain(L.log), ['clear Townhouse', 'apply'], 'the second shown, not the second of the full list');
  L.log.length = 0; L.click('#tb-fl-pop', '[data-pf-reset]');
  assert.deepEqual(plain(L.log), ['reset all']);
  // × clears the k only, and closes the popover.
  L.T.renderTrail(); L.log.length = 0; L.click('#trail', '[data-tb-filters-x]');
  assert.deepEqual(plain(L.log), ['clear 10+ units', 'clear Townhouse', 'apply']);
  L.T.renderTrail(); assert.equal(L.pop.hidden, true);
  // A step picked with the popover open closes it.
  L.click('#trail', '[data-tb-filters]'); assert.equal(L.pop.hidden, false);
  L.click('#trail', '[data-i]', { i: '0' }); assert.equal(L.pop.hidden, true);
  // Only the place on: no control. Only an older link's note: "Older link", its note in the popover.
  let M = loadTopbar({ state: { muni: 'Brampton' }, filters: [{ label: 'Brampton', scope: true }] }); M.T.renderTrail();
  assert.doesNotMatch(M.trail(), /tb-fl/);
  M = loadTopbar({ old: '<span class="old-link-note">x</span>' }); M.T.renderTrail();
  assert.match(M.trail(), /aria-label="Opened from an older link"[^>]*><svg data-icon="filter"><\/svg><span class="tb-fl-w">Older link<\/span><\/button><\/span>/);
  M.click('#trail', '[data-tb-filters]');
  assert.equal(M.pop.innerHTML, '<div class="page-filters small" role="group" aria-label="Filters on"><span class="old-link-note">x</span></div>');
  // Two plans: one step for both, as before (no tree placement).
  M = loadTopbar({ state: { muni: 'Brampton', sp: ['p403', 'x'] }, names: { bw: 'Bram West', p403: 'Precinct 40-3' }, paths: { p403: ['bw', 'p403'] } }); M.T.renderTrail();
  assert.deepEqual(M.steps(), ['Peel', 'Brampton', 'Precinct 40-3 +1']);
  // The place filters carry scope (the trail's steps); the pages' row and the workspace bar's are gone.
  const fu = src('js/filter-ui.js'), af = fu.slice(fu.indexOf('  function activeFilters() {'), fu.indexOf('  let activeList'));
  assert.equal((af.match(/scope: true/g) || []).length, 4, 'the municipality, each plan, "n secondary plans", MTSA / zone / block');
  assert.match(af, /out\.push\(\{ label: App\(\)\.state\.muni, scope: true,/);
  assert.match(src('index.html'), /<nav class="tb-trail" id="trail" aria-label="Scope"><\/nav>\n\s*<!--[^\n]*-->\n\s*<div class="tb-pop tb-fl-pop" id="tb-fl-pop" hidden><\/div>/);
  // A phone, a place four levels deep with a filter on: the trail scrolls sideways in its own box, its steps whole, and
  // is scrolled to its end, so the place sits whole beside the button (it was a letter under it); wider, as it was.
  for (const [width, left] of [[390, 600], [1440, 0]]) {
    M = loadTopbar({ width, trail: { scrollWidth: 600, clientWidth: 252, scrollLeft: 0 }, state: { muni: 'Brampton', sp: ['p481'] }, names: { cv: '48 (b): Countryside Villages', p481: 'Precinct 48-1' }, paths: { p481: ['cv', 'p481'] }, filters: [{ label: '10+ units' }] });
    M.T.renderTrail(); assert.deepEqual([M.steps().at(-1), M.nodes['#trail'].scrollLeft], ['Precinct 48-1', left], `${width} px`);
  }
  // (the popover out of the trail's clip; a phone: one 44 px button, the funnel and the count, its × the popover's Clear)
  const css = src('css/app.css');
  assert.match(css, /\n {2}\.tb-trail \{ overflow-x: auto; scrollbar-width: none; overscroll-behavior-x: contain; \}\n {2}\.tb-trail::-webkit-scrollbar \{ display: none; \}\n {2}\.tb-step:not\(:first-child\) \{ flex: none; \}\n\}/, 'a phone: the trail scrolls in its own box, its steps whole');
  assert.match(css, /\.tb-fl-wrap \{ display: inline-flex; align-items: center; gap: 2px; flex: none; position: sticky; right: 0;/);
  assert.match(css, /@media \(max-width: 700px\) \{\n {2}\/\* \(a phone: one button, the funnel and the count; the × is the popover's Clear\) \*\/\n {2}\.tb-fl-w, \.tb-fl-x \{ display: none; \}/);
  assert.match(css, /\n {2}\.topbar \.tb-fl \{ min-height: 44px; min-width: 44px; justify-content: center; \}/);
  // (the full map below 1200 px has its own Filters (n) in the top bar, the same filters: the trail leaves it out
  // there; a page and a map view hide that button, so they keep the trail's)
  assert.match(css, /@media \(max-width: 1199px\) \{ html:not\(\.home-on\):not\(\.ws-mode\) \.tb-fl-wrap \{ display: none; \} \}/);
  assert.match(css, /\.app\.ws-mode \.toggle-sidebar, \.app\.ws-mode \.leaflet-control\.tool-rail, html\.home-on \.toggle-sidebar \{ display: none !important; \}/);
});

test('the trail places a development in the plan tree, after the steps the filter has; each step the place, the site closed, the tab kept (6b)', () => {
  const D = { key: 'k', title: '10 Main St', municipality: 'Brampton' }, names = { mp: 'Mount Pleasant', bw: 'Bram West', p403: 'Precinct 40-3' }, paths = { p403: ['bw', 'p403'] };
  const at = o => { const L = loadTopbar({ names, paths, dev: D, place: 'mp', ...o }); L.T.renderTrail(); return [L, L.steps()]; };
  // No filter: Peel › its municipality › its plan › the site (was Peel › the site; the site's page had the rest).
  assert.deepEqual(at({})[1], ['Peel', 'Brampton', 'Mount Pleasant', '10 Main St']);
  // The filter's place is not repeated: Brampton on, the plan on, a plan above its precinct on.
  assert.deepEqual(at({ state: { muni: 'Brampton' } })[1], ['Peel', 'Brampton', 'Mount Pleasant', '10 Main St']);
  assert.deepEqual(at({ state: { muni: 'Brampton', sp: ['mp'] } })[1], ['Peel', 'Brampton', 'Mount Pleasant', '10 Main St']);
  assert.deepEqual(at({ place: 'p403', state: { muni: 'Brampton', sp: ['bw'] } })[1], ['Peel', 'Brampton', 'Bram West', 'Precinct 40-3', '10 Main St']);
  assert.deepEqual(at({ place: 'p403' })[1], ['Peel', 'Brampton', 'Bram West', 'Precinct 40-3', '10 Main St'], 'its deepest area, under its plan');
  // In no plan: its municipality. A filter's municipality or plan that does not hold it (a Caledon filter, a Brampton
  // site; Bram West on, the site in Mount Pleasant): its own place, never the filter's (the trail said Peel › Caledon ›
  // the site), and that filter in "k filters", removable there; its steps each that place, the site closed.
  assert.deepEqual(at({ place: null })[1], ['Peel', 'Brampton', '10 Main St']);
  let [L, st] = at({ state: { muni: 'Caledon' }, filters: [{ label: 'Caledon', scope: true }] });
  assert.deepEqual(st, ['Peel', 'Brampton', 'Mount Pleasant', '10 Main St']);
  assert.match(L.trail(), /aria-label="1 filter"/);
  L.click('#trail', '[data-tb-filters]'); assert.match(L.pop.innerHTML, /data-pf-i="0" title="Remove this filter">Caledon <span/);
  L.log.length = 0; L.click('#tb-fl-pop', '[data-pf-i]', { pfI: '0' }); assert.deepEqual(plain(L.log), ['clear Caledon', 'apply']);
  L.T.renderTrail(); L.log.length = 0; L.click('#trail', '[data-i]', { i: '1' });
  assert.deepEqual(plain(L.log), ['close', 'drill m:Brampton', 'setFootPref overview', 'showFootTab overview', 'link'], 'Brampton: the site’s municipality as the filter');
  [L, st] = at({ state: { muni: 'Brampton', sp: ['bw'] }, filters: [{ label: 'Brampton', scope: true }, { label: 'Bram West', scope: true }, { label: '10+ units' }] });
  assert.deepEqual(st, ['Peel', 'Brampton', 'Mount Pleasant', '10 Main St']);
  L.click('#trail', '[data-tb-filters]'); assert.match(L.trail(), /aria-label="3 filters"/);
  assert.deepEqual([...L.pop.innerHTML.matchAll(/data-pf-i="\d" title="Remove this filter">([^<]+) </g)].map(m => m[1]), ['Brampton', 'Bram West', '10+ units']);
  // (a filter that holds it keeps its place in the steps, out of "k filters")
  [L, st] = at({ state: { muni: 'Brampton' }, filters: [{ label: 'Brampton', scope: true }] });
  assert.deepEqual(st, ['Peel', 'Brampton', 'Mount Pleasant', '10 Main St']); assert.doesNotMatch(L.trail(), /tb-fl/);
  // An MTSA, two plans (no plan-tree steps): the trail as the filter has it. A result kept at the site (the Inquiry
  // draft): Peel › the site › …, as before.
  assert.deepEqual(at({ state: { muni: 'Brampton', mtsa: ['m1'] }, names: { ...names, m1: 'Main MTSA' } })[1], ['Peel', 'Brampton', 'Main MTSA', '10 Main St']);
  assert.deepEqual(at({ state: { muni: 'Brampton', sp: ['mp', 'bw'] } })[1], ['Peel', 'Brampton', 'Mount Pleasant +1', '10 Main St']);
  assert.deepEqual(at({ kept: true })[1], ['Peel', '10 Main St']);
  // A place's step on the site's page: the site closes, the place is the filter (Growth › Areas' drill), and Home, the
  // place's host, opens at the tab the page was on (its view the area's own), for this visit: the tab is not stored
  // (footTab4: the site's Overview was never picked, and closing a development leaves the stored tab as it was).
  [L] = at({ mode: 'home', tab: 'svc' });
  L.log.length = 0; L.click('#trail', '[data-i]', { i: '2' });
  assert.deepEqual(plain(L.log), ['close', 'drill a:mp', 'setFootPref svc', 'showFootTab svc', 'openPage home {"keep":true}']);
  assert.equal(L.stored.footTab4, undefined, 'not stored');
  // On the map: the same, the map staying where it is, at the tab (the link written).
  [L] = at({ mode: 'full', tab: 'dca' });
  L.log.length = 0; L.click('#trail', '[data-i]', { i: '1' });
  assert.deepEqual(plain(L.log), ['close', 'drill m:Brampton', 'setFootPref dca', 'showFootTab dca', 'link']);
  [L] = at({ mode: 'full', tab: 'overview' });
  L.log.length = 0; L.click('#trail', '[data-i]', { i: '0' });
  assert.deepEqual(plain(L.log), ['close', 'apply', 'setFootPref overview', 'showFootTab overview', 'link']);
  assert.equal(L.stored.footTab4, undefined, 'Peel at the site’s Overview: the stored tab (Growth, say) stays the reload’s');
  // The filter's own steps at a development do the same (each its own filter: Brampton the whole of it, Peel all of it).
  [L] = at({ mode: 'home', tab: 'growth', state: { muni: 'Brampton' } });
  L.log.length = 0; L.click('#trail', '[data-i]', { i: '1' });
  assert.deepEqual(plain(L.log), ['close', 'apply', 'setFootPref growth', 'showFootTab growth', 'openPage home {"keep":true}']);
  [L] = at({ mode: 'home', tab: 'overview' });
  L.log.length = 0; L.click('#trail', '[data-i]', { i: '0' });
  assert.deepEqual(plain(L.log), ['close', 'apply', 'setFootPref overview', 'showFootTab overview', 'openPage home {"keep":true}']);
  assert.deepEqual(plain([L.S.muni, L.S.sp]), ['', []]); assert.equal(L.stored.footTab4, undefined);
  // The site's own step: on its page, its Overview from the top (openPage, which scrolls it up); on the map, reopened.
  [L] = at({ mode: 'home', tab: 'svc' }); L.log.length = 0; L.click('#trail', '[data-i]', { i: '3' });
  assert.deepEqual(plain(L.log), ['openPage site undefined']);
  [L] = at({ mode: 'full', tab: 'svc' }); L.log.length = 0; L.click('#trail', '[data-i]', { i: '3' });
  assert.deepEqual(plain(L.log), ['showDetail k']);
  // No development: the steps as they were (no page opened, no tab set).
  L = loadTopbar({ names, state: { muni: 'Brampton' }, dev: null, mode: 'home' }); L.T.renderTrail();
  assert.deepEqual(L.steps(), ['Peel', 'Brampton']);
  L.log.length = 0; L.click('#trail', '[data-i]', { i: '1' }); assert.deepEqual(plain(L.log), ['apply']);
  // In the source: the place after the servicing ladder, before the site's step (the Inquiry draft's order holds:
  // click-destinations); its leaf placeOf's (js/plan-tables.js: the deepest, a straddler's largest share).
  const tb = src('js/topbar.js'), rt = tb.slice(tb.indexOf('function renderTrail()'), tb.indexOf('const tc = '));
  const i = s => { const k = rt.indexOf(s); assert.ok(k >= 0, s); return k; };
  assert.ok(i('const dp = scoped && !kept ? devPlace(scoped, a) : [];') < i('const steps = ['), 'the place known before the filter’s steps');
  assert.ok(i('steps.push(...window.PeelSvcScope.crumbs());') < i('for (const id of dp)') && i('for (const id of dp)') < i('if (scoped && !kept) steps.push(devStep);'));
  assert.match(rt, /if \(App\(\)\.state\.muni && !dp\.off\) steps\.push/); assert.match(rt, /up = !dp\.off && a && /); assert.match(rt, /if \(a && !dp\.off\) steps\.push/);
  assert.ok(i('if (scoped && !kept) for (const s of steps) { const go = s.go; s.go = () => leaveDev(go); }') < i('steps.push(...window.PeelSvcScope.crumbs());'), 'the place steps only, not the ladder');
  assert.match(tb, /const leaf = PT && PT\.placeOf \? PT\.placeOf\(p\) : null;\n\s+const path = \[`m:\$\{p\.municipality\}`, \.\.\.\(leaf && PT\.areaPath \? PT\.areaPath\(leaf\)\.map\(id => `a:\$\{id\}`\) : \[\]\)\];/);
  assert.match(tb, /if \(typeof DevScope !== 'undefined' && DevScope\.current\(\)\) DevScope\.close\(\);\n\s+go\(\);\n\s+if \(A && A\.showFootTab\) \{ if \(A\.setFootPref\) A\.setFootPref\(tab\); A\.showFootTab\(tab\); \}\n\s+if \(W && W\.mode && W\.mode\(\) === 'home' && W\.openPage\) W\.openPage\('home', \{ keep: true \}\);\n\s+else if \(Sh\(\) && Sh\(\)\.viewLink\) Sh\(\)\.viewLink\.write\(\);/);
  assert.doesNotMatch(tb.slice(tb.indexOf('function leaveDev('), tb.indexOf('const goPlace')), /openTab|store\.set/, 'the tab for the visit: never stored');
  assert.match(tb, /return at && i < 0 \? Object\.assign\(path\.slice\(\), \{ off: true \}\) : path\.slice\(i \+ 1\);/);
  assert.match(tb, /const otherFilters = \(\) => \(FI\(\) && FI\(\)\.activeFilters \? FI\(\)\.activeFilters\(\)\.filter\(f => !f\.scope \|\| placeOff\) : \[\]\);/);
  // The site's page has no trail line of its own now (removed by design, §5 row 47): Home's "Plans furthest behind"
  // rows are data-ws-explore's one producer.
  const wp = src('js/ws-pages.js');
  assert.doesNotMatch(wp, /siteTrail|exploreBar|page-explore|ex-where/);
  assert.equal((wp.match(/'data-ws-explore'/g) || []).length, 1);
  assert.doesNotMatch(src('css/app.css'), /\.page-explore|\.ex-where/);
});

test('the trail’s Peel closes a card or a tool’s result as × does: while it is still open, so its close handlers run (navigation phase 8b review)', () => {
  // (the scope as js/svc-scope.js's: clear() drops the result unannounced; closeResult() announces peel:tool-closed,
  // which an uncounted test site (js/sewer-profile.js) and an EA's highlight (js/capital-ea.js) close on, and only
  // while a result is open. Peel cleared first, then closed: nothing was announced, the test site stayed.)
  let result = { ref: 'tool:test-a-site' }; const ev = [];
  const scope = { crumbs: () => [], peelWideNote() {}, keepsDev: () => false, clear() { result = null; ev.push('clear'); }, closeResult() { if (!result) return false; result = null; ev.push('peel:tool-closed'); return true; } };
  const L = loadTopbar({ dev: null, scope, tools: { closeResult: () => scope.closeResult(), trailCrumb: () => null } });
  L.T.renderTrail(); assert.deepEqual(L.steps(), ['Peel']);
  L.click('#trail', '[data-i]', { i: '0' });
  assert.deepEqual(ev, ['peel:tool-closed', 'clear']);
  assert.ok(L.log.includes('apply'), 'then back to all of Peel, as before');
  // (no result open: the step as it was, nothing announced)
  ev.length = 0; L.T.renderTrail(); L.click('#trail', '[data-i]', { i: '0' });
  assert.deepEqual(ev, ['clear']);
});

// ---- 6b: the site's page is the page host at a development ----------------------------------------------------
// A development's panels as the map's tabs set them (their footers the real ones' actions: js/overview-tab.js,
// js/growth-ui.js, js/svc-capacity.js, js/fsr-check.js, js/dca-tab.js, js/records-tab.js).
const DEV = { key: 'k', title: '1 A St', municipality: 'Brampton' };
const devPanel = (answer, foot, extra) => ({ head: { status: { tone: 'stage', text: 'In review' }, badge: '', extra: '', identity: 'OZ 1', tools: { key: 'k' } }, answer, lists: [{ title: 'L', rows: [{ attrs: { 'data-pnl-dev': 'k2' }, html: 'r' }], total: 1 }], folds: [], foot, ...extra });
const DEV_PANELS = {
  'overview:': devPanel('Overview answer', { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } } }),
  'growth:pipeline': devPanel('Growth answer', { primary: { label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' } } }),
  'svc:network': devPanel('Network answer', { primary: { label: 'Trace the sewer path', attrs: { 'data-trace': 'k' } }, secondary: [{ label: 'Trace water', attrs: { 'data-wtrace': 'k' } }] }),
  'svc:fsr': devPanel('FSR answer', { primary: { label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' } }, secondary: [{ label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }] }),
  'dca:timing': devPanel('Capital answer', { primary: { label: 'Show the planned works', attrs: { 'data-mview': 'dc' } }, secondary: [{ label: 'Copy for review comments', attrs: { 'data-ce-copy-brief': '' } }] }),
  'records:files': devPanel('Records answer', { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } }, secondary: [{ label: 'How approvals work', attrs: { 'data-ws-page': 'approvals' } }] }),
};

test('the site page hosts the development’s views: the strip, Servicing’s two views, each view’s own footer first (6b)', () => {
  const S = load().SE;
  assert.deepEqual(Object.keys(S.VIEWS.site), ['overview:', ...AT.TAB_KEYS.flatMap(t => AT.chipsAt(t, 'site').map(c => `${t}:${c}`))]);
  for (const key of Object.keys(S.VIEWS.site)) {
    const [tab, sub] = key.split(':'), L = load({ key, dev: DEV, devPanels: DEV_PANELS });
    L.W.openPage(key === 'svc:fsr' ? 'fsr' : 'site', { keep: true });
    assert.deepEqual([L.W.page(), L.W.view()], ['site', key], key);
    const m = L.WP.host('site'), s = strip(m.tabs), id = key === 'svc:fsr' ? 'fsr' : 'site', f = DEV_PANELS[key].foot;
    assert.equal(m.id, id, key); assert.equal(m.name, '1 A St', `${key}: the development’s header`); assert.equal(m.answer, DEV_PANELS[key].answer, key);
    assert.equal(s.on, tab, key);
    assert.deepEqual(s.tabs, MAP_TABS.map(x => x.label), `${key}: the map’s five`);
    if (tab === 'svc') { assert.deepEqual(s.views, ['Network', 'FSR review'], key); assert.equal(s.view, sub, key); }
    else assert.ok(!m.tabs.includes('page-subsecs'), `${key}: one view or none: no row`);
    assert.match(m.eyebrow, new RegExp(`^${L.W.tabPath(tab, sub)} · Brampton$`), `${key}: the view and the place`);
    assert.deepEqual(plain(m.actions), [{ ...plain(f.primary), primary: true }, ...plain(f.secondary || []), { label: 'Open the map', attrs: { 'data-ws-go': id, 'data-ws-keep': '' } }, { label: 'Another site', attrs: { 'data-ws-unpick': id } }], `${key}: its footer’s own actions first (§5 row 56), then Open the map at the view`);
    assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': id, 'data-ws-dev': 'k2', 'data-ws-keep': '' }, `${key}: a row, the map view at the view`);
    assert.deepEqual(plain(m.map.attrs), { 'data-ws-go': id, 'data-ws-keep': '' }, `${key}: the live map’s Open the map too`);
    // The page as drawn: header, the strip (and Servicing's views), then the answer.
    const sec = plain(L.WP.sectionsOf(L.home.innerHTML));
    assert.ok(sec.indexOf('header') < sec.indexOf('tabs') && sec.indexOf('tabs') < sec.indexOf('answer'), `${key}: ${sec}`);
    assert.equal(sec.includes('views'), tab === 'svc', key);
    assert.doesNotMatch(L.home.innerHTML, /data-ws-sec|aria-label="Sections"/, `${key}: no section bar`);
  }
  // A view the map hides at a development (Capacity): the tab's first, Network; Servicing busy: lit, loading under the
  // development's own header, the strip saying so, and it tries again.
  let L = load({ key: 'svc:capacity', dev: DEV, devPanels: DEV_PANELS });
  assert.equal(L.WP.host('site').answer, 'Network answer');
  const { 'svc:network': _n, ...noNet } = DEV_PANELS;
  L = load({ key: 'svc:network', dev: DEV, devPanels: noNet, ready: t => t !== 'svc' });
  const m = L.WP.host('site');
  assert.match(m.answer, /Loading Servicing › Network for 1 A St \(the servicing model and the DC program\)…/);
  assert.deepEqual([m.name, m.pending, m.waitTab, strip(m.tabs).on, strip(m.tabs).busy], ['1 A St', true, true, 'svc', ['svc']]);
  // The strip's click on it: the map's tab, the site's page follows (it stays the site's, the development kept).
  L = load({ key: 'overview:', dev: DEV, devPanels: DEV_PANELS }); L.W.openPage('site'); L.calls.length = 0;
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'network' });
  assert.deepEqual(L.calls, [['openTab', 'svc', 'network']]);
  assert.deepEqual([L.W.page(), L.W.view(), !!L.dv.p], ['site', 'svc:network', true]);
  assert.match(L.home.innerHTML, /data-pg-sub="network" aria-pressed="true">Network</);
  // FSR review's chip: the form's fold opened and in view (it is far down a phone's page), as Check FSR leaves it;
  // any other pick leaves the fold alone.
  const fold = { open: false, shown: null, scrollIntoView(o) { this.shown = o.block; } };
  L.nodes['#home #pnl-fsr'] = fold; L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'network' });
  assert.deepEqual([fold.open, fold.shown], [false, null]);
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'fsr' });
  assert.deepEqual([L.W.page(), L.W.view(), fold.open, fold.shown], ['site', 'svc:fsr', true, 'start']);
  // Home's menu at the site's page: Find lit, at FSR review and at any other view. (The ☰ button's and the Explore
  // entry's names of the view, "Explore › Review an FSR", went in navigation phase 7, §5 rows 4 and 14, removed by
  // design: ☰ is the top bar's, the entry Find; shownPage's name stays the start screen's, nav-aliases' 6b rows.
  // Explore's views bar went in 6c, §5 row 45.)
  const lit = () => [...L.home.innerHTML.matchAll(/data-ws-page="(\w+)" aria-current="page"/g)].map(m => m[1]);
  assert.deepEqual(lit(), ['find']);
  assert.doesNotMatch(L.home.innerHTML, /page-views|aria-label="Explore"|home-menu-btn|home-ws-cur/);
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'network' });
  assert.deepEqual(lit(), ['find']);
  assert.match(src('js/workspaces.js'), /const ff = pt\.dataset\.pgSub === 'fsr' && \$\('#home #pnl-fsr'\);\n\s+if \(ff\) \{ ff\.open = true; ff\.scrollIntoView\(\{ block: 'start' \}\); return; \}\n[^\n]*\n\s+const el = \$\('#home'\), st = /);
  // renderPage: the site's page is a host with a development, Home the area's (js/workspaces.js).
  assert.match(src('js/workspaces.js'), /const m = page === 'home' \? WP\.host\('area'\) : hostPage\(page\) \? WP\.host\('site'\) : WP\.build\(page\);/);
  assert.match(src('js/workspaces.js'), /const hostPage = p => p === 'home' \|\| \(\(p === 'site' \|\| p === 'fsr'\) && devOpen\(\)\);/);
});

test('a pick on the FSR list, or a link’s d= on its Find step, opens the site’s page at FSR review (6b)', () => {
  const timers = [], run = () => { for (let i = 0; timers.length && i < 20; i++) timers.shift()(); };
  let L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, timers });
  L.W.openPage('fsr'); assert.deepEqual([L.W.page(), L.W.view()], ['fsr', null], 'no development: the Find step');
  assert.match(L.home.innerHTML, /Files with an FSR posted|Find the development/);
  L.calls.length = 0; L.click('[data-ws-pick]', { wsPick: 'k' });
  assert.deepEqual([L.W.page(), L.W.view()], ['site', 'svc:fsr']);
  assert.deepEqual(L.calls, [['setSub', 'svc', 'fsr'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]);
  assert.match(L.home.innerHTML, /data-pg-sub="fsr" aria-pressed="true">FSR review</);
  L.calls.length = 0; L.pnlSet({ key: 'overview:', scope: 'dev:k' }); run();
  assert.deepEqual([L.W.page(), L.W.view(), L.calls], ['site', 'svc:fsr', []], 'the Explore hook was told: not opened twice');
  // Check a site's Find step: the site's page on Overview.
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, timers });
  L.W.openPage('site'); L.click('[data-ws-pick]', { wsPick: 'k' });
  assert.deepEqual([L.W.page(), L.W.view()], ['site', 'overview:']);
  // A link's d= landing on Review an FSR's Find step (js/share.js ready opens the development): the hook opens FSR review.
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, timers }); timers.length = 0;
  L.W.openPage('fsr'); L.dv.p = DEV; L.calls.length = 0; L.pnlSet({ key: 'overview:', scope: 'dev:k' }); run();
  assert.deepEqual([L.W.page(), L.W.view()], ['site', 'svc:fsr']);
  assert.deepEqual(L.calls, [['setSub', 'svc', 'fsr'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]);
  assert.match(src('js/workspaces.js'), /mode === 'home' && page === 'fsr'\) \{ exploreDev = sc; setTimeout\(\(\) => openPage\('fsr'\), 0\); \}/);
  // (Home, any of its views: a development picked opens the site's page on Overview, as before)
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, timers }); timers.length = 0;
  L.W.openPage('home'); L.dv.p = DEV; L.pnlSet({ key: 'overview:', scope: 'dev:k' }); run();
  assert.deepEqual([L.W.page(), L.W.view()], ['site', 'overview:']);
  // Open the map from a view of the site's page: its map view at that view; the development open on the way in is no
  // pick made there (the map view's hook leaves the view as it is), and ← Page lands back at it.
  L = load({ key: 'svc:network', dev: DEV, devPanels: DEV_PANELS, timers }); timers.length = 0;
  L.W.openPage('site', { keep: true }); L.calls.length = 0;
  L.click('[data-ws-go]', { wsGo: 'site', wsKeep: '' }); L.pnlSet({ key: 'overview:', scope: 'dev:k' }); run();
  assert.deepEqual([L.W.mode(), L.W.current(), L.calls], ['ws', 'site', []]);
  L.click('[data-ws-backpage]'); assert.deepEqual([L.W.page(), L.W.view(), L.calls], ['site', 'svc:network', []]);
  // … but another development picked in the map view goes on to its result, as before (Check a site: its Overview).
  L.click('[data-ws-go]', { wsGo: 'site', wsKeep: '' }); L.dv.p = { key: 'k2' }; L.pnlSet({ key: 'overview:', scope: 'dev:k2' }); run();
  assert.deepEqual(L.calls.filter(c => c[0] === 'showFootTab'), [['showFootTab', 'overview']]);
  assert.match(src('js/workspaces.js'), /const pl = plan\(id, \{ site: !!site \}\); if \(!pl\) return;\n(?: {4}\/\/[^\n]*\n)+ {4}lastDev = site \? `dev:\$\{site\.key\}` : null;/);
});

// Navigation phase 7 (design §3.3, §6.2 "Review an FSR from Home: 2"): Find, the menu's (the site page's Find step), lists
// Recently active, Large files under review and Files with an FSR posted; an FSR row opens the site's page at Servicing ›
// FSR review, any other its Overview. Review an FSR's own step keeps its files first and links back to Find.
test('Find lists the recently active, the large files under review and the files with an FSR posted; an FSR row opens FSR review (navigation phase 7)', () => {
  const projects = [{ key: 'k', title: '1 A St', municipality: 'Brampton', phase: 'review', units: 120 }, { key: 'k2', title: '2 B St', municipality: 'Caledon', phase: 'review', units: 40 }];
  const Ph = { lastActivityOf: () => 1, PHASE_BY_KEY: { review: { label: 'In review' } } };
  const Fsr = { FSR: { by: new Map() }, fsrFor: p => (p.key === 'k' ? { best: { fsr: { date: '2026-09-01' } } } : null) };
  let L = load({ dev: null, devs: { k: DEV, k2: { ...DEV, key: 'k2' } }, devPanels: DEV_PANELS, state: { projects }, extra: { PeelPhases: Ph, PeelFsr: Fsr } });
  const titles = m => plain(m.lists.map(l => l.title));
  let m = L.WP.build('site');
  assert.deepEqual(titles(m), ['Recently active', 'Large files under review', 'Files with an FSR posted']);
  assert.equal(m.eyebrow, 'Find · step 1 of 3', 'the step’s one name, Find (§3.9)');
  assert.deepEqual(plain(m.lists[2].rows.map(r => r.attrs)), [{ 'data-ws-pick': 'k', 'data-ws-as': 'fsr', title: 'Review 1 A St' }]);
  assert.deepEqual(plain(m.lists[0].rows.map(r => r.attrs)), [{ 'data-ws-pick': 'k', title: 'Open 1 A St' }, { 'data-ws-pick': 'k2', title: 'Open 2 B St' }], 'the other rows: the step’s own page, Overview');
  assert.match(m.top, /^<p class="pnl-stepper small" aria-label="Steps">[^]*<\/span><\/p>$/, 'no link to another step: its lists are here');
  assert.doesNotMatch(m.top, /pnl-step-other/);
  // Its rows: an FSR one opens the site's page at FSR review, a Recently active one at Overview.
  L.W.openPage('find'); assert.deepEqual([L.W.page(), L.W.view()], ['site', null]);
  assert.match(L.home.innerHTML, /<p class="page-eyebrow small">Find · step 1 of 3<\/p>/);
  L.calls.length = 0; L.click('[data-ws-pick]', { wsPick: 'k', wsAs: 'fsr' });
  assert.deepEqual([L.W.page(), L.W.view()], ['site', 'svc:fsr']);
  assert.deepEqual(L.calls, [['setSub', 'svc', 'fsr'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]);
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, state: { projects }, extra: { PeelPhases: Ph, PeelFsr: Fsr } });
  L.W.openPage('find'); L.click('[data-ws-pick]', { wsPick: 'k' });
  assert.deepEqual([L.W.page(), L.W.view()], ['site', 'overview:']);
  // Review an FSR's step: its files first, then Recently active; its line links back to Find.
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, state: { projects }, extra: { PeelPhases: Ph, PeelFsr: Fsr } });
  m = L.WP.build('fsr');
  assert.deepEqual(titles(m), ['Files with an FSR posted', 'Recently active']);
  assert.equal(m.eyebrow, 'Review an FSR · step 1 of 3');
  assert.match(m.top, /<button type="button" class="btn small link pnl-step-other" data-ws-page="find">Any development → Find<\/button><\/p>$/);
  // Until data/fsr.json is in, the FSR list says it is looking (on both steps), loaded once, the page drawn again after.
  const loads = [];
  const F2 = { FSR: {}, loadFsr: () => ({ then: f => loads.push(f) }), fsrFor: () => null };
  L = load({ dev: null, devs: {}, devPanels: DEV_PANELS, state: { projects }, extra: { PeelPhases: Ph, PeelFsr: F2 } });
  m = L.WP.build('site');
  assert.deepEqual(plain(m.lists[2]), { title: 'Files with an FSR posted', rows: [{ kv: true, html: '<span class="muted small">Looking for posted servicing reports…</span>' }], total: 0 });
  assert.equal(loads.length, 1);
  // (and drawn again only while a Find step still shows: not over a development picked meanwhile, nor another page)
  const redraws = () => { let n = 0; const rp = L.W.renderPage; L.W.renderPage = () => { n++; }; loads.splice(0).forEach(f => f()); L.W.renderPage = rp; return n; };
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, state: { projects }, extra: { PeelPhases: Ph, PeelFsr: F2 } });
  L.W.openPage('find'); assert.ok(redraws() > 0, 'Find still showing: drawn again');
  L.W.openPage('find'); L.click('[data-ws-pick]', { wsPick: 'k' }); assert.equal(redraws(), 0, 'a development picked meanwhile');
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, state: { projects }, extra: { PeelPhases: Ph, PeelFsr: F2 } });
  L.W.openPage('find'); L.W.openPage('home'); assert.equal(redraws(), 0, 'another page');
  // (every development's FSR, js/fsr.js fsrFor, looked up once per load of the developments and of the FSR index, not on
  // each redraw of either step; a development's phase is read as the list is drawn)
  let scans = 0; const F3 = { FSR: { by: new Map() }, fsrFor: p => { scans++; return Fsr.fsrFor(p); } };
  L = load({ dev: null, devs: {}, devPanels: DEV_PANELS, state: { projects: projects.map(p => ({ ...p })) }, extra: { PeelPhases: Ph, PeelFsr: F3 } });
  const st = L.window.PeelApp.state, fsrKeys = id => plain(L.WP.build(id).lists.find(l => l.title === 'Files with an FSR posted').rows.map(r => r.attrs['data-ws-pick']));
  assert.deepEqual([fsrKeys('site'), fsrKeys('site'), fsrKeys('fsr'), scans], [['k'], ['k'], ['k'], 2], 'two developments, looked up once');
  st.projects[0].phase = 'cancelled'; assert.deepEqual([fsrKeys('site'), scans], [[], 2], 'a file cancelled since: left out, no new lookup');
  st.projects = projects.map(p => ({ ...p })); assert.deepEqual([fsrKeys('site'), scans], [['k'], 4], 'the developments loaded again: looked up again');
  F3.FSR.by = new Map(); assert.deepEqual([fsrKeys('fsr'), scans], [['k'], 6], 'and the FSR index');
});

// Navigation phase 7 (owner decision 17, AD-17 with change, design §7.3): Last place is kept as each page is drawn, the
// page as the reader names it (Review an FSR at Servicing › FSR review), its view, its development and the place filter
// (the municipality, one plan); never Help, a guide or a Labs page. Settings › Start screen offers it, and Your role.
test('Last place: kept as Home and the workspace pages are drawn, with the view, the development and the place filter; never Help; Settings has it and Your role (navigation phase 7)', () => {
  const timers = [], run = () => { for (let i = 0; timers.length && i < 20; i++) timers.shift()(); };
  let L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, timers });
  const place = () => plain(L.store.get('lastPlace'));
  L.W.openPage('tight');
  assert.deepEqual(place(), { page: 'home', view: 'svc:capacity', d: null, mu: '', sp: '' }, 'an area page: Home at its view');
  L.W.openPage('help'); L.W.openPage('approvals');
  assert.deepEqual(place(), { page: 'home', view: 'svc:capacity', d: null, mu: '', sp: '' }, 'Help and a guide: never a place (as Last workspace never named them)');
  L.W.openPage('fsr'); assert.deepEqual(place(), { page: 'fsr', view: null, d: null, mu: '', sp: '' }, 'a Find step: no view');
  L.click('[data-ws-pick]', { wsPick: 'k' });
  assert.deepEqual(place(), { page: 'fsr', view: 'svc:fsr', d: 'k', mu: '', sp: '' }, 'the site’s page at FSR review: Review an FSR, its development');
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'network' });
  assert.deepEqual(place(), { page: 'site', view: 'svc:network', d: 'k', mu: '', sp: '' }, 'another view of the site’s page: Check a site');
  const S = L.window.PeelApp.state; S.muni = 'Caledon'; S.sp = ['bw'];
  L.W.openPage('growth'); assert.deepEqual(place(), { page: 'home', view: 'growth:areas', d: null, mu: 'Caledon', sp: 'bw' }, 'the place filter: its municipality and its plan');
  S.sp = ['bw', 'mv']; L.W.openPage('week'); assert.deepEqual(place(), { page: 'week', view: null, d: null, mu: 'Caledon', sp: '' }, 'two plans: no one plan');
  // A start with a place to restore: nothing kept until it is (a half-restored place never replaces the stored one).
  const stored = { page: 'site', view: 'svc:network', d: 'k', mu: '', sp: '' };
  L = load({ dev: null, devs: { k: DEV }, devPanels: DEV_PANELS, timers, stored: { startScreen: 'last', lastPlace: stored } }); timers.length = 0;
  L.W.init();
  assert.deepEqual([L.W.page(), L.W.view(), plain(L.store.get('lastPlace'))], ['site', null, stored], 'its page now (the Find step, the development not in yet)');
  L.window.PeelApp.state.projects = [DEV]; L.calls.length = 0; L.W.bootRestore();
  assert.deepEqual([L.W.page(), L.W.view(), L.calls], ['site', 'svc:network', [['showFootTab', 'svc']]], 'then the development, at the place’s view');
  assert.match(L.home.innerHTML, /data-pg-sub="network" aria-pressed="true">Network</, 'drawn at once, as a pick is (not when the app next settles)');
  run();
  assert.deepEqual(plain(L.store.get('lastPlace')), stored);
  // Settings › Start screen: Home · Last place · Full map; Your role: none or one of the six (the menu's For your role).
  L.store.set('role', 'qa'); L.store.set('startScreen', 'last');
  const set = L.W.settingsHTML();
  assert.deepEqual([...set.matchAll(/data-ws-start-btn="(\w+)" aria-pressed="(true|false)">([^<]+)</g)].map(m => `${m[1]} ${m[3]}${m[2] === 'true' ? '*' : ''}`), ['home Home', 'last Last place*', 'full Full map']);
  assert.match(set, /the last place you were on a page \(its page, tab and view, its place and its development\)/);
  assert.deepEqual([...set.matchAll(/<option value="(\w*)"( selected)?>([^<]+)</g)].map(m => `${m[1]}${m[2] ? '*' : ''}`), ['', 'engineer', 'manager', 'growth', 'capital', 'fsr', 'qa*']);
  assert.match(set, /<h3>Your role<\/h3>[^]*<select data-role-set aria-label="Your role"><option value="">None<\/option>/);
  assert.match(set, /<option value="qa" selected>QA\/QC \(data review\)<\/option>/);
});

// Navigation phase 6c-S4 (design §5 rows 2, 22, 63, 71): one This week. The page, its map view (the Overview panel there,
// js/workspaces.js override) and Home's Change figures read one spec (js/ws-pages.js weekSpec); its rows are a panel's,
// the page makes them its own; "Open in Watch" (was "Watch list") first.
test('one This week: the page, the map view and Home’s Change read one spec; Open in Watch first (6c)', () => {
  const area = { head: { identity: 'Peel · all of Peel', status: null }, answer: 'The 2 developments shown.', figures: [],
    lists: [{ title: 'Needs attention', rows: [], total: 0 }, { title: 'This week', rows: [{ attrs: { 'data-pnl-dev': 'k1' }, html: 'a' }, { attrs: { 'data-pnl-dev': 'k2' }, html: 'b' }, { attrs: { 'data-ce-open': 'ea:7' }, html: 'c' }], total: 3 }] };
  const projects = [{ key: 'k1', title: '1 Main St', municipality: 'Brampton', phase: 'approved', units: 40 }, { key: 'k2', title: '2 Main St', municipality: 'Caledon', phase: 'review', units: 12 }];
  const extra = {
    PeelOverviewTab: { lastAreaSpec: () => area, weekChanges: () => ({ moved: [{ key: 'k1', title: '1 Main St', from: 'review', to: 'approved' }], added: [{ key: 'k2', title: '2 Main St', phase: 'review', municipality: 'Caledon' }] }) },
    PeelCapitalEA: { attention: () => [{ ce: 'ea:7', text: 'EA 7: comment period closes' }] },
    PeelSvcCapacity: { collect: () => [{ kind: 'plant', id: 'plant:Lakeview', name: 'G.E. Booth', pctBo: 95, limit: { y: 2031, what: 'x' } }], partial: () => false },
    PeelMapMarkers: { THIS_YEAR: 2026, plantOfDev: p => (p.key === 'k1' ? 'Lakeview' : 'Clarkson') },
  };
  const L = load({ area, state: { projects, filtered: projects }, extra, dev: null, devs: { k1: projects[0] } }), s = L.WP.weekSpec();
  assert.equal(s.head.name, 'What changed since the last update?'); assert.equal(s.head.status, null);
  assert.equal(s.answer, '<strong>3</strong> changes since the last data update: 1 file moved stage, 1 new file, 1 capital or EA date.', 'the count: the Overview’s This week rows');
  assert.deepEqual(plain(s.figures.map(f => [f.v, f.label])), [['1', 'moved stage'], ['1', 'new'], ['1', 'capital and EA dates'], ['1', 'on a tight plant']]);
  assert.deepEqual(plain(s.lists.map(l => l.title)), ['Moved stage', 'New files', 'Capital and EA dates', 'Your watch list'], 'the capacity alerts only when a feed is published (owner decision 8)');
  // (a panel's rows: a development opens it, a date its record; top 5 and See all into the Overview's full table)
  assert.deepEqual(plain(s.lists.slice(0, 3).map(l => [l.rows[0].attrs, l.seeAll])), [[{ 'data-pnl-dev': 'k1' }, { 'data-full-table': 'overview' }], [{ 'data-pnl-dev': 'k2' }, { 'data-full-table': 'overview' }], [{ 'data-ce-open': 'ea:7' }, { 'data-full-table': 'overview' }]]);
  assert.match(s.lists[0].rows[0].html, /drains to Lakeview \(tight\)/);
  assert.deepEqual(plain(s.foot.primary), { label: 'Open in Watch', attrs: { 'data-ws-watch': '' }, title: 'The developments you watch, on the full map (its left panel, Watch)' });
  assert.deepEqual(plain(s.devs.map(p => p.key)), ['k1', 'k2'], 'the changed developments, highlighted on the page’s map');
  // The page: the spec as it is, its rows the page's (a development its site's page; a date the map view at it).
  const m = L.WP.build('week');
  assert.deepEqual([m.id, m.name, m.identity, m.answer], ['week', s.head.name, s.head.identity, s.answer]);
  assert.deepEqual(plain(m.figures), plain(s.figures));
  assert.deepEqual(plain(m.lists.map(l => l.title)), plain(s.lists.map(l => l.title)));
  assert.deepEqual(plain(m.lists.slice(0, 3).map(l => l.rows[0].attrs)), [{ 'data-ws-pick': 'k1', 'data-ws-as': 'site' }, { 'data-ws-pick': 'k2', 'data-ws-as': 'site' }, { 'data-ws-go': 'week', 'data-ws-ce': 'ea:7' }]);
  assert.deepEqual(plain(m.actions), [{ label: 'Open in Watch', attrs: { 'data-ws-watch': '' }, title: s.foot.primary.title, primary: true }, { label: 'Open the map', attrs: { 'data-ws-go': 'week' } }]);
  L.W.openPage('week'); L.click('[data-ws-pick]', { wsPick: 'k1', wsAs: 'site' });
  assert.deepEqual([L.W.page(), L.W.view(), L.dv.p && L.dv.p.key], ['site', 'overview:', 'k1'], 'a row: its site’s page');
  // Home's Change: the spec's "on a tight plant" figure (not the page built for it), opening This week.
  L.dv.p = null; L.W.openPage('home');
  const ch = L.WP.build('home').groups.find(g => g.title === 'Change');
  assert.deepEqual(plain(ch.figures[1]), { ...plain(s.figures[3]), attrs: { 'data-ws-page': 'week' } });
  // The map view (#w=week): the same spec in the Overview panel; before the briefing, a loading answer, never the area's.
  L.W.go('week', { quiet: true });
  assert.deepEqual(plain(L.W.override('overview:', 'area')), plain(s));
  assert.equal(L.W.override('svc:capacity', 'area'), null);
  const N = load({ extra: { PeelOverviewTab: { lastAreaSpec: () => null } } }); N.W.go('week', { quiet: true });
  assert.deepEqual(plain(N.W.override('overview:', 'area')), { head: { name: 'What changed since the last update?', status: null, identity: 'Peel' }, answer: '<span class="muted">Loading the changes…</span>' });
  // One builder: workspaces.js's own weekSpec is gone; Home reads the spec, not BUILD.week().
  assert.doesNotMatch(src('js/workspaces.js'), /function weekSpec|'Watch list'/);
  assert.match(src('js/workspaces.js'), /const WP = root\.PeelWsPages, w = WP && WP\.weekSpec \? WP\.weekSpec\(\) : null;/);
  assert.match(src('js/ws-pages.js'), /const wk = week && ready \? weekSpec\(\) : null;/);
  assert.doesNotMatch(src('js/ws-pages.js'), /BUILD\.week\(\)|label: 'Watch list'/);
});

// Navigation phase 6c-S3 (design §3.4, §5 rows 9, 21, 38, 104, 136): Old pipes is Servicing › Old pipes (svc:pipes), an
// area's view. One spec (js/workspaces.js pipesSpec) is the map's panel and Home's view: the four figures, the likelihood ×
// consequence grid as its chart, the runs and the plants, its CSV first; the map's full table the grid and every run; the
// amber pipes on the map while it is open (syncPipes), never under a page. The pipesSpec override is gone.
test('Old pipes’ one spec: the map’s panel and Home’s Servicing › Old pipes read the same figures, grid and runs; its CSV first; the amber pipes while it is open (6c)', () => {
  // [diameterMm, slope, capacityLs, next, censusPopUp, haUp, plant, installYear, material, risk, coords, share, invertUp, invertDown, lengthM]
  const data = { risks: ['LOW', 'MODERATE'], materials: ['CONP'], plants: ['Lakeview', 'Clarkson'], pipes: [
    [900, 0.01, 1, 1, 0, 0, 0, 1940, 0, 0, [-79.6, 43.6, -79.61, 43.61], 1, 0, 0, 1500],    // 0: 86 years, 12,000 units (one main with 1)
    [900, 0.01, 1, -1, 0, 0, 0, 1940, 0, 0, [-79.61, 43.61, -79.62, 43.62], 1, 0, 0, 1000], // 1: the same main, 11,000 units
    [300, 0.01, 1, -1, 0, 0, 1, 2000, 0, 1, [-79.7, 43.7, -79.71, 43.71], 1, 0, 0, 500],    // 2: new, moderate risk, 150 units
    [450, 0.01, 1, -1, 0, 0, 1, 1970, 0, 0, [-79.8, 43.8, -79.81, 43.81], 1, 0, 0, 800],    // 3: 56 years, 2,000 units
  ] };
  const G = { built: { units: Float64Array.from([12000, 11000, 150, 2000]) }, approved: { units: new Float64Array(4) }, proposed: { units: new Float64Array(4) } };
  const map = { layers: [], removeLayer(l) { this.layers = this.layers.filter(x => x !== l); } };
  let drawn = 0;
  const Lf = { polyline: (pts, opt) => ({ pts, opt }), layerGroup: ls => ({ ls, addTo(m) { drawn++; m.layers.push(this); return this; } }) };
  const extra = { PeelMapMarkers: { THIS_YEAR: 2026, SEW: { data } }, PeelSewerCap: { sewerGrowth: () => G }, L: Lf, PeelMapCore: { map },
    PeelUtil: { esc: U.esc, fmtNum: U.fmtNum, fmt1: U.fmt1, store: { get: (k, d) => d, set() {} }, token: () => 'amber' } };
  const L = load({ key: 'svc:pipes', extra }), s = L.W.pipesSpec();
  // The spec: runs (0 and 1 one main), the length, the grid's top-right cell, the moderate risk pipes.
  assert.equal(s.head.name, 'Which old pipes carry the most growth?');
  assert.deepEqual(plain(s.head.trail.map(t => t.label)), ['Peel', 'Servicing › Old pipes']);
  assert.deepEqual(plain(s.head.status), { tone: 'tight', text: '1 moderate risk' });
  assert.deepEqual(plain(s.figures.map(f => [f.v, f.u, f.label])), [['3', 'sewer runs', 'on the list'], ['3.8', 'km', 'length on the list'], ['1', 'sewer runs', 'oldest and most loaded'], ['1', 'pipes', 'rated moderate risk']]);
  assert.match(s.answer, /^<strong>3<\/strong> sewer runs \(4 pipe segments\)[^]*the 900 mm main to Lakeview<\/strong>, laid in 1940 \(12,000 units\)\.$/);
  // (its chart: the grid, the worst likelihood on top; the top-right cell the 900 mm main, 2.5 km)
  assert.equal(s.chart, L.WP.pipeGridHTML(L.W.pipeRuns(L.W.oldList(), data)));
  assert.equal((s.chart.match(/<td class="pg-c pg-s\d">/g) || []).length, 9);
  assert.match(s.chart, /<tbody><tr><th scope="row">80\+ years<\/th><td class="pg-c pg-s4"><b>0<\/b><small>0 km<\/small><\/td><td class="pg-c pg-s5"><b>0<\/b><small>0 km<\/small><\/td><td class="pg-c pg-s6"><b>1<\/b><small>2\.5 km<\/small><\/td><\/tr>/);
  assert.deepEqual(plain(s.lists.map(l => [l.title, l.rows.length, l.total])), [['Runs, most units first', 3, 3], ['By plant', 2, 2]]);
  assert.deepEqual(plain(s.lists[0].rows.map(r => r.attrs['data-pipe'])), [0, 3, 2], 'most units first');
  assert.deepEqual(plain(s.lists[0].seeAll), { 'data-full-table': 'svc:pipes', 'data-ft-go': 'Every run' });
  assert.match(s.lists[1].rows[0].html, /<span>Lakeview<\/span><span>1 sewer runs · 2\.5 km<\/span>/);
  assert.deepEqual(plain(s.foot), { primary: { label: 'Export the list (CSV)', attrs: { 'data-ws-pipescsv': '' } }, secondary: [{ label: 'Show the sewers on the map', attrs: { 'data-mview': 'wastewater' } }] });
  // The map's panel (js/panel.js): its CSV first, then the full table, then the sewers; the grid its chart.
  const PNh = require('../js/panel.js').html({ key: 'svc:pipes', ...s });
  assert.deepEqual([...PNh.matchAll(/<button type="button" class="btn small (pnl-primary|pnl-sec)"[^>]*>([^<]+)</g)].map(x => x[2]), ['Export the list (CSV)', 'Open full table', 'Show the sewers on the map']);
  assert.match(PNh, /<div class="pnl-chart" data-sec="chart"><h3 class="sub-title pnl-chart-t">Old sewer runs by age/);
  // Home's view: the same answer, figures, grid and lists, its runs opening the map view at the pipe; CSV first.
  const m = L.WP.host(), st = strip(m.tabs);
  assert.deepEqual([m.id, st.on, st.view, st.views], ['pipes', 'svc', 'pipes', ['Capacity', 'Network', 'Old pipes']]);
  assert.deepEqual([m.name, m.answer, m.identity, m.chart, m.method], [s.head.name, s.answer, s.head.identity, s.chart, s.method]);
  assert.equal(m.eyebrow, 'Servicing › Old pipes · Peel');
  assert.deepEqual(plain(m.figures), plain(s.figures));
  assert.deepEqual(plain(m.lists.map(l => l.title)), ['Runs, most units first', 'By plant']);
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': 'pipes', 'data-ws-pipe': 0, title: 'Show the pipe and what loads it' });
  assert.deepEqual(plain(m.lists[0].see), { 'data-ws-go': 'pipes', 'data-ws-fulltable': '1' }, 'See all: every run, the map view’s full table');
  assert.deepEqual(plain(m.status.attrs), { 'data-ws-go': 'pipes', 'data-ws-fulltable': '1' });
  assert.deepEqual(plain(m.actions), [{ label: 'Export the list (CSV)', attrs: { 'data-ws-pipescsv': '' }, primary: true }, { label: 'Show the sewers on the map', attrs: { 'data-mview': 'wastewater' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'pipes' } }]);
  // (Show the sewers on the map, as every panel's and page's Show … on the map: that lens, the page's on the full map,
  // js/topbar.js; the System and the tab as they are. No handler took it outside the lens switch: the full map opened
  // at the lens it had, 6c review)
  assert.match(src('js/topbar.js'), /document\.addEventListener\('click', e => \{ const b = e\.target\.closest && e\.target\.closest\('\[data-mview\]'\); if \(b && !b\.closest\('#tb-views'\)\) MA\(\)\.setMapView\(b\.dataset\.mview\); \}\);/);
  assert.match(m.map.caption, /hm-key-pipe/); assert.deepEqual(plain(m.map.attrs), { 'data-ws-go': 'pipes' });
  const page = L.WP.pageHTML(m, '');
  assert.ok(L.WP.sectionsOf(page).includes('chart') && !L.WP.sectionsOf(page).includes('grid'), 'one grid: the chart');
  // The sewer records not in yet: both say so (the page tries again, the panel is set again when they land).
  const N = load({ key: 'svc:pipes' });
  assert.deepEqual(plain(N.W.pipesSpec()), { head: { trail: [{ label: 'Peel' }, { label: 'Servicing › Old pipes' }], name: 'Which old pipes carry the most growth?', identity: 'Sanitary sewers 300 mm and larger' }, answer: 'Loading the Region’s sanitary sewer records…' });
  assert.match(N.WP.host().answer, /Loading the Region’s sanitary sewer records…/);
  // The map's Servicing › Old pipes (js/svc-capacity.js renderFor): the panel set from the one spec, its full table.
  const sets = [], body = { innerHTML: '' };
  const cctx = { window: { PeelUtil: U, PeelWorkspaces: L.W, PeelWsPages: L.WP, PeelMapMarkers: extra.PeelMapMarkers, PeelPanel: { set: (k, v) => sets.push([k, v]) }, PeelAnalysisTabs: { getFootTab: () => 'svc', getSvcSub: () => 'pipes' } },
    document: { querySelector: q => (q === '#pipes-body' ? body : null), addEventListener() {} }, module: { exports: {} } };
  cctx.globalThis = cctx; vm.runInNewContext(src('js/svc-capacity.js'), cctx);
  const C = cctx.module.exports;
  C.renderFor('pipes');
  assert.deepEqual(plain(sets.map(x => [x[0], x[1].answer])), [['svc:pipes', s.answer]]);
  assert.ok(body.innerHTML.includes(s.chart), 'the full table: the grid');
  assert.match(body.innerHTML, /<h3 class="sub-title">By plant<\/h3>[^]*<h3 class="sub-title">Every run on the list/);
  assert.equal((body.innerHTML.match(/<tr(?: class="t-tight")?><th scope="row" class="ft-pin" data-l="Sewer">/g) || []).length, 3, 'every run');
  assert.match(body.innerHTML, /<button type="button" class="btn small" data-ws-pipescsv>Export the list \(CSV\)<\/button>/);
  // The amber pipes: on the map while Servicing › Old pipes is open (each segment), drawn once per list; another view,
  // or a page, takes them off.
  L.W.syncPipes();
  assert.deepEqual([drawn, map.layers.length, map.layers[0] && map.layers[0].ls.length], [1, 1, 4]);
  assert.deepEqual(plain(map.layers[0].ls.map(p => p.opt.weight)), [4, 4, 4, 6], 'heavier: moderate risk (the segments, most units first)');
  L.W.syncPipes(); L.pnlSet({ key: 'svc:pipes', scope: 'area' }); assert.equal(drawn, 1, 'not drawn again for the same list');
  L.at.subs.svc = 'network'; L.W.syncPipes(); assert.equal(map.layers.length, 0, 'Network: gone');
  L.at.subs.svc = 'pipes'; L.W.syncPipes(); assert.equal(map.layers.length, 1);
  // (a run picked there: its pipe's result on Overview, the pipes drawn kept around it, and after it closes until
  // another tab or view; Overview without a pipe's result, or a pipe's result with none drawn, never draws them)
  const ss = v => { L.window.PeelApp.state.ss = v; };
  ss('pipe:0'); L.at.tab = 'overview'; L.W.syncPipes(); assert.deepEqual([map.layers.length, drawn], [1, 2], 'a run’s result: kept, not drawn again');
  ss(null); L.W.syncPipes(); assert.equal(map.layers.length, 0, 'Overview without it: gone');
  ss('pipe:0'); L.W.syncPipes(); assert.equal(map.layers.length, 0, 'a pipe’s result with none drawn: not drawn for it');
  ss('dcwork:1'); L.at.tab = 'svc'; L.W.syncPipes(); assert.equal(map.layers.length, 1, 'Old pipes again');
  L.at.tab = 'overview'; L.W.syncPipes(); assert.equal(map.layers.length, 0, 'another result: gone');
  L.at.tab = 'svc'; L.W.syncPipes(); assert.equal(map.layers.length, 1);
  // (a file's Servicing, its flows (js/analysis-tabs.js ownView), the Old pipes pick kept: none drawn; navigation phase
  // 8b review)
  ss('file:u1'); L.at.kind = 'file'; L.W.syncPipes(); assert.equal(map.layers.length, 0, 'a file’s Servicing: no Old pipes');
  ss(null); L.at.kind = null; L.W.syncPipes(); assert.equal(map.layers.length, 1, 'back at Peel: Old pipes');
  L.W.openPage('pipes'); assert.equal(map.layers.length, 0, 'a page: never under it');
  assert.deepEqual([L.W.page(), L.W.view()], ['home', 'svc:pipes']);
  // Wired: setMode, go and every tab shown (js/analysis-tabs.js), the panel's pnl:set; no override, no Network filter.
  const ws = src('js/workspaces.js');
  assert.match(ws, /if \(m !== 'ws'\) \{ cur = null; if \(m === 'full'\) \{ unfoldLayers\(\); restoreView\(\); \} \}\n {4}syncPipes\(\);/);
  assert.match(ws, /foldLayers\(\);\n {4}syncPipes\(\);/);
  assert.match(ws, /if \(e\.detail && e\.detail\.key === 'svc:pipes'\) syncPipes\(\);/);
  assert.match(ws, /function syncPipes\(\) \{ const A = AT\(\), ss = App\(\) && App\(\)\.state && App\(\)\.state\.ss; pipesLayer\(mode !== 'home' && !!A && !!A\.getSvcSub && A\.getSvcSub\(\) === 'pipes' && !\(A\.ownView && A\.ownView\('svc'\)\) && \(A\.getFootTab\(\) === 'svc' \|\| \(!!pLayer && A\.getFootTab\(\) === 'overview' && \/\^pipe:\/\.test\(ss \|\| ''\)\)\)\); \}/);
  assert.match(src('js/analysis-tabs.js'), /if \(root\.PeelPanel\) root\.PeelPanel\.sync\(\);\n(?: {4}\/\/[^\n]*\n)? {4}if \(root\.PeelWorkspaces && root\.PeelWorkspaces\.syncPipes\) root\.PeelWorkspaces\.syncPipes\(\);/);
  assert.doesNotMatch(ws, /cur === 'pipes' && key === 'svc:network'|pipesLayer\(id === 'pipes'\)|pipesLayer\(true\)|pipesLayer\(false\)/);
  assert.match(src('js/svc-capacity.js'), /else if \(sub === 'pipes'\) renderPipes\(\); \};/);
  assert.match(src('js/svc-capacity.js'), /const renderAll = \(\) => \{ render\(\); renderChecks\(\); renderNetBar\(\); if \(pipesOpen\(\)\) renderPipes\(\); \};/);
  // css: the grid takes the 440 px panel's width (and a phone's), scrolling in its own box where that is too narrow.
  const css = src('css/app.css');
  assert.match(css, /\.pg-wrap \{ overflow-x: auto; max-width: 100%; \}/);
  assert.match(css, /\.pnl \.pg \{ min-width: 0; width: 100%; \}\n\.pnl \.pg td \{ min-width: 0; padding: 4px 6px; \}\n@media \(max-width: 700px\) \{ \.pg \{ min-width: 0; width: 100%; \} \.pg td \{ min-width: 0; padding: 4px 6px; \} \}/);
  assert.doesNotMatch(css, /\.page-grid\b/);
});

// The sewer records failing to load (an HTTP error, sewers.json during a deploy): Servicing › Old pipes on the map (a
// link, a stored pick) and on Home, and Review outlets, say they are loading and ask once; drawn again only when they
// land. (Each drew itself again when the load came back empty and asked again at once, for ever: the tab hung.)
test('the sewer records failing to load: Old pipes and Review outlets ask once, never again in a loop (6c review)', async () => {
  let asked = 0, drawn = 0, F = null;
  // (past six asks the load never settles, so a loop shows as a count, not a hung test)
  const sew = { data: null }, loadSewers = () => (++asked > 6 ? new Promise(() => {}) : Promise.resolve(null));
  F = load({ key: 'svc:pipes', extra: { PeelMapMarkers: { THIS_YEAR: 2026, SEW: sew }, PeelSewerCap: { loadSewers }, PeelSvcCapacity: { renderFor: () => { drawn++; F.W.pipesSpec(); } }, PeelDevOutlets: { load() {} }, PeelDcImpact: {} } });
  const settle = () => new Promise(r => setImmediate(r));
  assert.match(F.W.pipesSpec().answer, /^Loading the Region’s sanitary sewer records…$/);
  await settle(); assert.deepEqual([asked, drawn], [1, 0], 'the map’s panel: asked once, not drawn again');
  F.W.openPage('pipes'); await settle();
  assert.equal(F.W.view(), 'svc:pipes'); assert.match(F.home.innerHTML, /Loading the Region’s sanitary sewer records…/);
  assert.equal(asked, 2, 'Home’s Servicing › Old pipes: asked once more');
  const n = asked; F.WP.build('outlets'); await settle();
  assert.equal(asked, n + 1, 'Review outlets: asked once');
  // (when they land: drawn again, the panel at its view)
  asked = 0; let ok = null; const G = load({ key: 'svc:pipes', extra: { PeelMapMarkers: { THIS_YEAR: 2026, SEW: sew }, PeelSewerCap: { loadSewers: () => { asked++; ok = { pipes: [] }; return Promise.resolve(ok); } }, PeelSvcCapacity: { renderFor: k => { drawn = k; } } } });
  drawn = 0; G.W.pipesSpec(); await settle(); assert.deepEqual([asked, drawn], [1, 'pipes'], 'landed: the panel drawn again');
});
