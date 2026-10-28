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
// the real ones), the stored panels by key (o.panels: the area's). o.key: the view; o.ready(tab): its data in.
function load(o = {}) {
  const calls = [], handlers = {}, store = new Map();
  const at = { tab: (o.key || 'overview:').split(':')[0], subs: { ...SUBS }, ready: o.ready || (() => true) };
  if (o.key && o.key.split(':')[1]) at.subs[at.tab] = o.key.split(':')[1];
  const home = { hidden: false, innerHTML: '', scrollTop: 0, querySelector: () => null, querySelectorAll: () => [], getBoundingClientRect: () => ({ top: 0, left: 0 }), contains: () => true };
  const nodes = { '#home': home };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: s => nodes[s] || null, querySelectorAll: () => [], getElementById: id => nodes[`#${id}`] || null,
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, dispatchEvent() {} };
  const PeelAnalysisTabs = { TAB_KEYS: AT.TAB_KEYS, chipsAt: AT.chipsAt, tabReady: t => !!at.ready(t), getFootTab: () => at.tab,
    setSub: (t, s) => { calls.push(['setSub', t, s]); at.subs[t] = s; return t; }, setFootPref: t => calls.push(['setFootPref', t]),
    showFootTab: t => { calls.push(['showFootTab', t]); at.tab = t; }, openFold: f => calls.push(['openFold', f]),
    openTab: (t, s) => { calls.push(['openTab', t, s]); if (s) at.subs[t] = s; at.tab = t; },
    wantedTab: () => at.tab, viewKey: () => `${at.tab}:${at.subs[at.tab] || ''}` };
  const panels = o.panels || {};
  const window = { document, PeelUtil: { esc: U.esc, fmtNum: U.fmtNum, fmt1: U.fmt1, store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } },
    PeelPanel: { get: k => (panels[k] ? { scope: 'area', spec: panels[k] } : null), scenarioChip: () => '', NOTE: '', sync() {}, syncTools() {} },
    PeelAnalysisTabs, PeelApp: { state: { muni: '', sp: [], mtsa: [], projects: [], filtered: [], ...(o.state || {}) } },
    PeelOverviewTab: { lastAreaSpec: () => o.area || null }, PeelMapMarkers: { THIS_YEAR: 2026 }, ...(o.extra || {}) };
  const ctx = { window, document, location: { hash: '' }, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CustomEvent: function CustomEvent() {}, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of ['js/sections.js', 'js/ws-pages.js', 'js/workspaces.js']) vm.runInNewContext(src(f), ctx);
  // A click on an element matching sel inside #home (its data-* in dataset).
  const click = (sel, dataset = {}) => { const el = { dataset }; for (const f of handlers.click || []) f({ target: { closest: s => (s === sel ? el : null) }, preventDefault() {}, stopPropagation() {} }); };
  return { WP: window.PeelWsPages, W: window.PeelWorkspaces, SE: window.PeelSections, at, calls, home, window, click, panels };
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
  assert.deepEqual(mapChips('svc').map(c => c.sub), ['capacity', 'network', 'fsr']);
  // The markup (pure): the strip a tablist, a tab lit, a busy one marked and worded, Records trailing.
  const h = L.WP.tabsHTML({ tabs: [{ key: 'overview', label: 'Overview', info: 'tab-overview' }, { key: 'svc', label: 'Servicing', info: 'tab-servicing', busy: true }, { key: 'records', label: 'Records', trail: true }], on: 'svc', chips: [{ sub: 'capacity', label: 'Capacity' }, { sub: 'network', label: 'Network' }], sub: 'network' });
  assert.equal(h, '<nav class="page-secs page-tabs" role="tablist" aria-label="Tabs" data-psec="tabs"><button type="button" role="tab" class="page-sec page-tab" data-pg-tab="overview" data-info="tab-overview" aria-selected="false">Overview</button><button type="button" role="tab" class="page-sec page-tab on" data-pg-tab="svc" data-info="tab-servicing" aria-selected="true" aria-busy="true" title="Loading: it opens when its data lands">Servicing <small class="page-tab-wait">loading</small></button><button type="button" role="tab" class="page-sec page-tab page-tab-trail" data-pg-tab="records" aria-selected="false">Records</button></nav><nav class="page-secs page-subsecs" aria-label="Views" data-psec="views"><button type="button" class="page-sec" data-pg-tab="svc" data-pg-sub="capacity" aria-pressed="false">Capacity</button><button type="button" class="page-sec on" data-pg-tab="svc" data-pg-sub="network" aria-pressed="true">Network</button></nav>');
  assert.ok(!L.WP.tabsHTML({ tabs: [], on: 'dca', chips: [{ sub: 'timing', label: 'DC timing' }], sub: 'timing' }).includes('page-subsecs'), 'one chip: no views row');
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
  assert.deepEqual(s.views, ['Capacity', 'Network'], 'its views row is there');
  assert.equal(m.waitTab, true, 'it tries again until the tab is ready, even with nothing changed (js/workspaces.js renderPage)');
  assert.match(src('js/workspaces.js'), /if \(!force && html === lastHTML\) \{ if \(m\.waitTab\) \{ clearTimeout\(timer\); timer = setTimeout\(\(\) => renderPage\(false\), 1000\); \} return; \}/);
  m = load({ key: 'dca:eas', ready: t => t !== 'dca' }).WP.host();
  assert.equal(m.id, 'eaflow'); assert.match(m.answer, /Loading Capital › EAs/); assert.deepEqual(strip(m.tabs).busy, ['dca']);
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

test('the bars are gone: no Growth in an area, Servicing or Capital section bar; Help’s bar links Home’s Records', () => {
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
  // Help's bar: its Data sources and Data checks open Home's Records tab (the strip's attributes).
  const top = L.WP.build('help').top;
  assert.match(top, /<button type="button" class="page-sec" data-pg-tab="records" data-pg-sub="sources" aria-pressed="false">Data sources<\/button><button type="button" class="page-sec" data-pg-tab="records" data-pg-sub="checks" aria-pressed="false">Data checks<\/button>/);
  assert.match(top, /class="page-sec on" data-ws-page="help"/);
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
  // From another page (Help's bar): Home at that view, the tab not set again.
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
  const asked = [], SS = { peelWideText: t => { asked.push(t); return t === 'svc' || t === 'dca' ? `<strong>Peel-wide.</strong> ${t} serve all of Peel <button type="button" class="btn small link" data-ss="plant:Lakeview">G.E. Booth</button>` : ''; } };
  const spec = name => ({ head: { name, status: null, identity: 'Brampton' }, answer: `${name} answer`, figures: [], lists: [], folds: [], method: 'm', sources: 's' });
  const panels = { 'svc:network': spec('Network'), 'dca:projects': spec('Projects'), 'growth:pipeline': spec('Pipeline'), 'records:checks': spec('Checks') };
  for (const key of ['svc:network', 'dca:projects']) {
    const L = load({ key, panels, state: { muni: 'Brampton' }, extra: { PeelSvcScope: SS } }), m = L.WP.host(), h = L.WP.pageHTML(m, '');
    assert.equal(m.top, `<p class="scope-note small page-wide" role="note" data-psec="wide">${SS.peelWideText(key.split(':')[0])}</p>`, key);
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
  // A plan row of "Plans furthest behind their target" (and a site trail's step until navigation phase 6b): that
  // plan the filter, Home at Growth › Areas, the development closed first.
  const closed = [];
  L.window.DevScope = { current: () => ({ key: 'k' }), close: () => closed.push(1) };
  L.calls.length = 0; applied = 0;
  L.click('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall],[data-gt-by],[data-gt-sort],[data-gt-tog],[data-gt-more],[data-ws-sec],[data-ws-explore]', { wsExplore: 'a:sp1' });
  assert.deepEqual(plain([S.muni, S.sp, applied, closed.length]), ['Brampton', ['sp1'], 1, 2], 'the filter, applied once; the development closed (and by Home)');
  assert.deepEqual(plain(L.calls[0]), ['openTab', 'growth', 'areas']);
  assert.deepEqual([L.W.page(), L.W.view()], ['home', 'growth:areas']);
  // A drill row: the same filter, the page at its top.
  L.window.DevScope = null; L.home.scrollTop = 500;
  L.click('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall],[data-gt-by],[data-gt-sort],[data-gt-tog],[data-gt-more],[data-ws-sec],[data-ws-explore]', { wsDrill: 'm:Brampton' });
  assert.deepEqual(plain([S.muni, S.sp, applied, L.home.scrollTop]), ['Brampton', [], 2, 0]);
  // Show on the map from Growth › Areas: the map view there, already filtered (the data-ws-area handler went).
  const g = src('js/ws-pages.js'), fn = g.slice(g.indexOf('  function growth() {'), g.indexOf('\n  }\n', g.indexOf('  function growth() {')));
  assert.ok(fn.includes("{ label: 'Show on the map', attrs: { 'data-ws-go': 'growth', 'data-ws-keep': '' } }") && fn.includes("map: { svg: mapSvg, attrs: { 'data-ws-go': 'growth', 'data-ws-keep': '' },"));
  assert.doesNotMatch(`${g}${src('js/workspaces.js')}`, /data-ws-area['"]|wsArea\b/);
  // What reads the filtered set whole stays at its level: the census baseline and the 2031 figure (not at a plan).
  assert.ok(fn.includes('const atTop = !fsp.length && (atPeel || n.id === `m:${fl.muni}`);'));
  assert.ok(fn.includes('bc = atTop && CAr && CAr.baselineCensus') && fn.includes('const f2031 = atTop && tm && tm.figures'));
});

// js/topbar.js in a vm: each element a stub that records its listeners; the place, the plan tree and the filters
// stubbed (o.filters: [{ label, scope }], each clear logged).
function loadTopbar(o = {}) {
  const nodes = {}, log = [];
  const node = sel => nodes[sel] || (nodes[sel] = { hidden: sel === '#tb-fl-pop', innerHTML: '', style: {}, handlers: {}, clientWidth: 1000, offsetWidth: 0,
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false }, setAttribute() {}, insertAdjacentHTML() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }),
    addEventListener(t, f) { (this.handlers[t] = this.handlers[t] || []).push(f); } });
  const S = { muni: '', sp: [], mtsa: [], pz: [], dr: [], filtered: [], ...(o.state || {}) }, names = o.names || {};
  const filters = (o.filters || []).map(f => ({ ...f, clear: () => log.push(`clear ${f.label}`) }));
  const window = {
    PeelUtil: { $: node, esc: U.esc, fmtNum: U.fmtNum, store: { get: (k, d) => d }, toast() {} }, PeelDesign: { icon: n => `<svg data-icon="${n}"></svg>` },
    PeelApp: { state: S, applyFilters: () => log.push('apply') }, Growth: { pipelineTotals: () => ({ planned: 0 }) },
    PeelPlanAreas: { areaName: (k, id) => names[id] || '', renderAreaSelects() {}, showArea() {}, renderPlanAreas() {} },
    PeelSvcData: { renderSvcSelects() {}, showSvcArea() {} }, PeelAreaSelect: { clearSelected() {} },
    PeelPlanTables: { areaPath: id => (o.paths || {})[id] || [id], areas: () => [], inside: () => null },
    PeelFilterUI: { activeFilters: () => filters, oldLinkNote: () => o.old || '', resetAllFilters: () => log.push('reset all'), includeCompleted: () => log.push('include') },
  };
  const document = { querySelector: s => { log.push(`query ${s}`); return null; }, addEventListener() {}, documentElement: { classList: { contains: () => false } } };
  const ctx = { window, document, matchMedia: () => ({ matches: false, addEventListener() {} }), CSS: { escape: x => x }, setTimeout: () => 0 }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/topbar.js'), ctx);
  const T = window.PeelTopbar, ev = (sel, dataset = {}) => ({ target: { closest: s => (s === sel ? { dataset } : null) } });
  const click = (on, sel, dataset) => { for (const f of nodes[on].handlers.click || []) f(ev(sel, dataset)); };
  const steps = () => [...nodes['#trail'].innerHTML.matchAll(/class="tb-step" data-i="\d+" title="[^"]*">([^<]+)</g)].map(m => m[1]);
  return { T, S, log, nodes, click, steps, trail: () => nodes['#trail'].innerHTML, pop: nodes['#tb-fl-pop'] };
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
  // (the popover out of the trail's clip; a phone: one 44 px button, the funnel and the count, its × the popover's Clear)
  const css = src('css/app.css');
  assert.match(css, /\.tb-fl-wrap \{ display: inline-flex; align-items: center; gap: 2px; flex: none; position: sticky; right: 0;/);
  assert.match(css, /@media \(max-width: 700px\) \{\n {2}\/\* \(a phone: one button, the funnel and the count; the × is the popover's Clear\) \*\/\n {2}\.tb-fl-w, \.tb-fl-x \{ display: none; \}/);
  assert.match(css, /\n {2}\.topbar \.tb-fl \{ min-height: 44px; min-width: 44px; justify-content: center; \}/);
  // (the full map below 1200 px has its own Filters (n) in the top bar, the same filters: the trail leaves it out
  // there; a page and a map view hide that button, so they keep the trail's)
  assert.match(css, /@media \(max-width: 1199px\) \{ html:not\(\.home-on\):not\(\.ws-mode\) \.tb-fl-wrap \{ display: none; \} \}/);
  assert.match(css, /\.app\.ws-mode \.toggle-sidebar, \.app\.ws-mode \.leaflet-control\.tool-rail, html\.home-on \.toggle-sidebar \{ display: none !important; \}/);
});
