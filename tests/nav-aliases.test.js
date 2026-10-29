'use strict';
// The navigation redesign's link layer (docs/architecture-review/navigation-design.md §7, phase 0):
// every page id, workspace chip, tab and sub-view a link, a button or a stored preference can name
// still lands on a place that exists. Later phases move sub-views and retire pages by adding rows to
// PAGE_ALIAS (js/workspaces.js) and SUB_MAP (js/analysis-tabs.js); this inventory then says where each
// old name goes.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const W = require('../js/workspaces.js');

// js/analysis-tabs.js in a vm (it reads the DOM and the store at load).
function loadTabs() {
  const el = () => null, store = { get: (k, d) => d, set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}
const AT = loadTabs();

const PAGES = ['home', ...W.WS.map(w => w.id), ...Object.keys(W.REF), ...Object.keys(W.LAB_PAGES)];
const isPage = id => id === 'home' || !!(W.BY_ID[id] || W.REF[id] || W.LAB_PAGES[id]);

test('every page id opens its page from a link (#w=p:<id>), and resolves to itself', () => {
  assert.equal(PAGES.length, 28, '12 workspaces, Help and How it works with its 9 guides, the Glossary, How the app decides, Data sources, Labs › Sewer designer, Home');
  assert.equal(new Set(PAGES).size, PAGES.length, 'no page id twice');
  for (const id of PAGES) {
    assert.equal(W.resolvePage(id, {}), id, `${id} is not an alias`);
    const want = { mode: 'home', page: id };
    assert.deepEqual(plain(W.startScreen({ hash: id === 'home' ? '#w=home' : `#w=p:${id}` })), want, id);
  }
});

test('the sidebar ids that are not pages (Explore, Capital, Reference; Find) resolve to a page, from a link too', () => {
  for (const id of Object.keys(W.PAGE_ALIAS)) assert.ok(!isPage(id), `${id} is an alias, not a page`);
  const r = (id, ctx) => W.resolvePage(id, ctx);
  // (navigation phase 7, §7.1: Explore is the open site, else Find; its last view is no longer read, removed by design)
  assert.equal(r('explore', {}), 'site', 'Explore: Find, the site page’s Find step');
  assert.equal(r('explore', { site: true }), 'site', 'Explore with a development open: its page');
  for (const v of W.EXPLORE) assert.equal(r('explore', { last: v }), 'site', `Explore: Find, whatever the last workspace (${v})`);
  assert.equal(r('explore', { last: 'pipes' }), 'site', 'a last workspace outside Explore');
  // Find (the sidebar's, phase 7): the Find step (openPage closes an open development first), the development's page by a link with d=.
  assert.equal(r('find', {}), 'site'); assert.equal(r('find', { site: true }), 'site');
  assert.equal(r('capital', {}), 'projects');
  for (const v of W.CAPITAL) assert.equal(r('capital', { last: v }), v);
  assert.equal(r('reference', {}), 'help');
  for (const id of Object.keys(W.PAGE_ALIAS)) assert.ok(isPage(r(id, {})), `${id} → a page`);
  // A link names them as pages (the app writes the page it resolved to; older or hand-made links may not).
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:explore' })), { mode: 'home', page: 'site' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:find' })), { mode: 'home', page: 'site' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:find&d=Brampton%7C1%20MAIN%20ST' })), { mode: 'home', page: 'site' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:explore&d=Brampton%7C1%20MAIN%20ST' })), { mode: 'home', page: 'site' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:capital' })), { mode: 'home', page: 'projects' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:reference' })), { mode: 'home', page: 'help' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:nonsense' })), { mode: 'full' }, 'an unknown page: the full map, as before');
  // In the browser every route into a page goes through openPage, which resolves the id first (the line above it
  // only closes an open development for the sidebar's Find, navigation phase 7: the Find step, as Home closes it; and
  // for a role shortcut into a Find step, o.fresh: the FSR reviewer's Files with an FSR posted).
  assert.match(src('js/workspaces.js'), /function openPage\(id, o = \{\}\) \{\n {4}if \(\(id === 'find' \|\| o\.fresh\) && devOpen\(\)\) root\.DevScope\.close\(\);\n {4}id = resolvePage\(id, \{ site: !!\(root\.DevScope && root\.DevScope\.current && root\.DevScope\.current\(\)\), last: store\.get\('lastWs', ''\) \}\);/);
});

test('every workspace chip (#w=<chip>) opens its map view; the stored last workspace opens its page', () => {
  assert.equal(W.WS.length, 12);
  for (const w of W.WS) {
    assert.deepEqual(plain(W.startScreen({ hash: `#w=${w.id}` })), { mode: 'ws', ws: w.id }, w.id);
    assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'last', last: w.id })), { mode: 'home', page: w.id }, `last ${w.id}`);
  }
  assert.deepEqual(plain(W.startScreen({ hash: '', pref: 'last', last: 'retired-id' })), { mode: 'home', page: 'tight' });
});

// Every tab a link's t= can name, current and from older versions of the app.
const TABS_NOW = AT.TAB_KEYS;
const TABS_OLD = ['demand', 'census', 'criteria', 'log', 'developments', 'tool', 'dev', 'plants', 'ww', 'water'];
// Every sub-view name a link (gs, svs, dcs, rs; ws with t=ww|water) or a stored pref can carry.
const SUBS_ANY = [...new Set(Object.values(AT.SUB_MAP).flatMap(m => Object.keys(m)))];

test('every tab and sub-view a link can name lands on a tab and a sub-view that exist', () => {
  for (const t of [...TABS_NOW, ...TABS_OLD, 'nonsense']) for (const sub of [undefined, '', ...SUBS_ANY, 'nonsense']) {
    const m = plain(AT.migrateTabKey(t, sub)), at = `t=${t}${sub ? ` / ${sub}` : ''}`;
    assert.ok(TABS_NOW.includes(m.tab), `${at} → tab ${m.tab}`);
    for (const [tab, k] of Object.entries(AT.SUB_KEY)) if (m[k] != null) {
      assert.equal(tab, m.tab, `${at}: the sub-view is the tab's own`);
      assert.ok(AT.TABSUBS[tab].valid.includes(m[k]), `${at} → ${tab}:${m[k]}`);
    }
  }
});

test('every sub-view of the four tabs has a SUB_MAP row; the names before Stage 2 land where phase 2 put them', () => {
  for (const [tab, s] of Object.entries(AT.TABSUBS)) {
    assert.ok(AT.SUB_MAP[tab], `${tab} has rows`);
    for (const v of s.valid) {
      assert.deepEqual(plain(AT.migrateSub(tab, v)), { tab, sub: v }, `${tab}:${v}`);
      assert.deepEqual(plain(AT.migrateTabKey(tab, v)), { tab, [AT.SUB_KEY[tab]]: v }, `t=${tab} with its sub-view ${v}`);
    }
  }
  // The names before Stage 2 still map as they did (tests/four-tabs.test.js has the full table).
  assert.deepEqual(plain(AT.migrateTabKey('water', 'facilities')), { tab: 'svc', svcSub: 'network' });
  assert.deepEqual(plain(AT.migrateTabKey('dca', 'funding')), { tab: 'dca', dcSub: 'timing' });
  assert.deepEqual(plain(AT.migrateTabKey('growth', 'nonsense')), { tab: 'growth', gSub: 'pipeline' });
  assert.deepEqual(plain(AT.migrateTabKey('svc', 'nonsense')), { tab: 'svc' }, 'an unknown Servicing sub-view keeps the one open');
});

test('a sub-view moved to another tab is followed, in a link and in a stored preference', () => {
  AT.SUB_MAP.svc.movedTest = 'records:checks';
  try {
    assert.deepEqual(plain(AT.migrateSub('svc', 'movedTest')), { tab: 'records', sub: 'checks' });
    assert.deepEqual(plain(AT.migrateTabKey('svc', 'movedTest')), { tab: 'records', rSub: 'checks' }, 'a link: its tab moves with it');
    const prefs = { footPref: 'svc', gSub: 'pipeline', svcSub: 'movedTest', dcSub: 'timing', rSub: 'sources' };
    assert.deepEqual(plain(AT.migratePrefs(prefs)), { footPref: 'records', gSub: 'pipeline', svcSub: null, dcSub: 'timing', rSub: 'checks' }, 'the tab last picked follows it');
    assert.deepEqual(plain(AT.migratePrefs({ ...prefs, footPref: 'growth' })), { footPref: 'growth', gSub: 'pipeline', svcSub: null, dcSub: 'timing', rSub: 'sources' }, 'another tab last picked: Records keeps its own');
  } finally { delete AT.SUB_MAP.svc.movedTest; }
});

test('every stored sub-view lands on a valid one after the reset', () => {
  const base = { footPref: 'overview', gSub: 'pipeline', svcSub: 'capacity', dcSub: 'timing', rSub: 'sources' };
  for (const [tab, k] of Object.entries(AT.SUB_KEY)) for (const v of [...SUBS_ANY, 'nonsense', null]) {
    const o = AT.migratePrefs({ ...base, [k]: v });
    const after = AT.TABSUBS[tab].valid.includes(o[k]) ? o[k] : AT.TABSUBS[tab].valid[0];   // (the reset that follows)
    assert.ok(AT.TABSUBS[tab].valid.includes(after), `${k}=${v}`);
    if (AT.TABSUBS[tab].valid.includes(v)) assert.equal(o[k], v, `${k}=${v} kept`);
  }
  // The stored prefs migrate before the reset to each tab's first valid sub-view.
  const s = src('js/analysis-tabs.js');
  const mig = s.indexOf('({ footPref, gSub, svcSub, dcSub, rSub } = migratePrefs({ footPref, gSub, svcSub, dcSub, rSub }));');
  const reset = s.indexOf('for (const s of Object.values(TABSUBS)) if (!s.valid.includes(s.get())) s.set(s.valid[0]);');
  assert.ok(mig > 0 && reset > mig);
});

test('share links: every sub-view param goes through migrateTabKey; nav=3; an older page link opens the page\'s own tab', () => {
  const sh = src('js/share.js');
  assert.doesNotMatch(sh, /TABSUBS\.svc\.valid\.includes\(q\.get\('svs'\)\)|TABSUBS\.records\.valid\.includes\(q\.get\('rs'\)\)/, 'a moved svs / rs value is no longer dropped');
  assert.match(sh, /if \(m\.dcSub\) AT\(\)\.setDcSub\(m\.dcSub\); if \(m\.rSub\) AT\(\)\.setRSub\(m\.rSub\);/);
  // (navigation phase 6: nav=3, the same marker versioned: before it Home and Data sources wrote the map's tab)
  assert.match(sh, /set\('nav', '3'\);\n {6}set\('t', tab\);/);
  assert.match(sh, /const tab = pageWs \? pageWs\.tab : AT\(\)\.getFootPref\(\);/, 'on a workspace page, the page\'s own tab');
  assert.match(sh, /const pageWs = W && W\.mode\(\) === 'home' && W\.page && !\(W\.view && W\.view\(\)\) && W\.BY_ID\[W\.page\(\)\];/, 'on a page host (Home), the map\'s tab: the page\'s own');
  // (an older page link: nav below 2, the page it names open; a saved view applied on the full map opens
  // no page, so it keeps its own t; navigation phase 6: below 3, Home and the area pages open their own view, and a
  // nav=3 link to Old pipes' page, from 6a or 6b, before it became a host's view in 6c)
  assert.match(sh, /const W = window\.PeelWorkspaces, nv = Number\(q\.get\('nav'\)\) \|\| 0, w = q\.get\('w'\) \|\| '', pre = nv < 3 \|\| \(nv === 3 && w === 'p:pipes'\);/);
  assert.match(sh, /const pid = pre && \/\^p:\/\.test\(w\) && W && W\.resolvePage \? W\.resolvePage\(w\.slice\(2\), \{ site: !!q\.get\('d'\), last: window\.PeelUtil\.store\.get\('lastWs', ''\) \}\) : '';/);
  assert.match(sh, /const host = pre && W && W\.hostOf && W\.mode\(\) === 'home' \? \(w === 'home' \? \{ tab: 'overview', sub: '' \} : pid \? W\.hostOf\(pid, \{ site: !!q\.get\('d'\) \}\) : null\) : null;\n {6}const pageWs = host \|\| \(nv < 2 && pid && W\.mode\(\) === 'home' && W\.page\(\) === pid && Object\.prototype\.hasOwnProperty\.call\(W\.BY_ID, pid\) \? W\.BY_ID\[pid\] : null\);\n {6}if \(q\.get\('t'\) \|\| pageWs\) \{/);
  // A Servicing or Records sub-view named beside another tab is still kept (as before); the hydraulic
  // check's Labs switch reads the link's own t.
  assert.match(sh, /const r = q\.get\(k\) && tab !== t \? AT\(\)\.migrateSub\(tab, q\.get\(k\)\) : null;/);
  assert.match(sh, /q\.get\('t'\) === 'water' && q\.get\('ws'\) === 'hydro'/);
  // What an older link to a workspace page opens behind it: the page's tab and sub-view.
  for (const w of W.WS) {
    const m = plain(AT.migrateTabKey(w.tab, w.sub));
    assert.equal(m.tab, w.tab, w.id);
    if (w.sub) assert.equal(m[AT.SUB_KEY[w.tab]], w.sub, `${w.id}: ${w.tab}:${w.sub}`);
  }
});

test('names inherited from Object.prototype are no page, tab or sub-view, and never throw', () => {
  const NAMES = ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty', '__defineGetter__', 'prototype'];
  for (const n of NAMES) {
    assert.equal(W.resolvePage(n, {}), n, `resolvePage(${n})`);
    assert.deepEqual(plain(W.startScreen({ hash: `#w=p:${n}` })), { mode: 'full' }, `#w=p:${n}`);
    assert.deepEqual(plain(W.startScreen({ hash: `#w=${n}` })), { mode: 'full' }, `#w=${n}`);
    for (const pref of ['home', 'last', 'full']) {
      const r = plain(W.startScreen({ hash: '', pref, last: n }));
      assert.ok(r.mode === 'full' || r.page === 'home' || r.page === 'tight', `stored lastWs ${n}, start screen ${pref}: ${JSON.stringify(r)}`);
    }
    for (const t of [...TABS_NOW, 'ww', 'water', n]) {
      assert.equal(AT.migrateSub(t, n), null, `migrateSub(${t}, ${n})`);
      assert.ok(TABS_NOW.includes(AT.migrateTabKey(t, n).tab), `migrateTabKey(${t}, ${n})`);
    }
    for (const k of Object.values(AT.SUB_KEY)) assert.ok(AT.migratePrefs({ footPref: 'overview', gSub: 'pipeline', svcSub: 'capacity', dcSub: 'timing', rSub: 'sources', [k]: n }));
  }
});

test('in-app calls follow a moved sub-view too: setSub, a data-at link, showFootTab(tab, sub)', () => {
  AT.SUB_MAP.svc.movedTest = 'records:checks';
  try {
    assert.equal(AT.setSub('svc', 'movedTest'), 'records', 'setSub returns the tab the sub-view now lives in');
    assert.equal(AT.getRSub(), 'checks');
  } finally { delete AT.SUB_MAP.svc.movedTest; }
  assert.equal(AT.setSub('svc', 'network'), 'svc');
  const s = src('js/analysis-tabs.js');
  assert.match(s, /const \[t0, s0\] = a\.dataset\.at\.split\(':'\), r = s0 \? migrateSub\(t0, s0\) : null, tab = r \? r\.tab : t0, sub = r \? r\.sub : s0;/);
  assert.match(s, /\{ const r = sub \? migrateSub\(key, sub\) : null; if \(r\) \{ key = r\.tab; sub = r\.sub; \} \}/);
});

// (navigation phase 6: the button shows from the first paint, marked loading, aria-busy, until its data lands:
// "shown" below is "ready", not loading; js/analysis-tabs.js tabReady)
test('a tab named before its data arrived (Servicing, Capital) opens when its data lands, unless another was picked', () => {
  const shown = new Set(['overview', 'growth', 'records']);
  const q = sel => { const m = /^\.f-tab\[data-tab="(\w+)"\]:not\(\[hidden\]\):not\(\[aria-busy\]\)$/.exec(sel); return m ? (shown.has(m[1]) ? {} : null) : null; };
  const document = { querySelector: q, querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store: { get: (k, d) => d, set: () => {} } }, document }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/analysis-tabs.js'), ctx);
  const T = ctx.module.exports;
  T.showFootTab('svc');
  assert.equal(T.getFootTab(), 'overview', 'its button is hidden: Overview meanwhile');
  shown.add('svc'); T.tabShown('svc');
  assert.equal(T.getFootTab(), 'svc', 'the button shows: the tab asked for opens');
  T.showFootTab('dca'); assert.equal(T.getFootTab(), 'overview');
  T.showFootTab('growth');
  shown.add('dca'); T.tabShown('dca');
  assert.equal(T.getFootTab(), 'growth', 'another tab picked meanwhile stays');
  // A view re-rendering the open tab keeps a pick made meanwhile, and keeps a tab still held.
  shown.delete('svc'); T.showFootTab('svc'); T.showFootTab('overview'); T.refreshFootTab();
  shown.add('svc'); T.tabShown('svc');
  assert.equal(T.getFootTab(), 'overview', 'an Overview pick meanwhile stays (census-view.js re-renders)');
  shown.delete('svc'); T.showFootTab('svc'); T.refreshFootTab(); assert.equal(T.getFootTab(), 'overview');
  shown.add('svc'); T.tabShown('svc'); assert.equal(T.getFootTab(), 'svc', 'a held tab stays held through a re-render');
  assert.match(src('js/census-view.js'), /gcPane\.dataset\.off = off; AT\(\)\.refreshFootTab\(\);/);
  assert.match(src('js/labs.js'), /if \(AT && AT\.refreshFootTab\) AT\.refreshFootTab\(\);/);
  assert.match(src('js/svc-tab.js'), /if \(AT\(\) && AT\(\)\.tabShown\) for \(const k of \['svc', 'dca'\]\) if \(!\$\(`#ftab-\$\{k\}`\)\.hasAttribute\('aria-busy'\)\) AT\(\)\.tabShown\(k\);/);
});

// Navigation phase 2 (navigation-design §7.2–7.3): Servicing is Capacity · Network. Allocations is a fold
// of Capacity, the model checks are Records › Data checks (its Servicing model group), the water
// facilities and the hydraulic check are Network's. Old links, stored picks and in-app calls land there.
function loadTabsWith(stored = {}, extra = {}) {
  const el = () => null, store = { get: (k, d) => (Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : d), set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document, ...extra }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}
test('phase 2: Allocations folds into Capacity, the model checks move to Records › Data checks, the water facilities and the hydraulic check move to Network', () => {
  // (navigation phase 5 adds FSR review, a development's view, and 6c Old pipes, an area's: an area shows three, below)
  assert.deepEqual(plain(AT.TABSUBS.svc.valid), ['capacity', 'network', 'pipes', 'fsr']);
  assert.deepEqual(plain(AT.chipsAt('svc', 'area')), ['capacity', 'network', 'pipes']);
  // Links (t=svc&svs=…, t=ww|water&ws=…).
  assert.deepEqual(plain(AT.migrateTabKey('svc', 'alloc')), { tab: 'svc', svcSub: 'capacity' });
  assert.deepEqual(plain(AT.migrateTabKey('svc', 'checks')), { tab: 'records', rSub: 'checks' });
  assert.deepEqual(plain(AT.migrateTabKey('ww', 'alloc')), { tab: 'svc', svcSub: 'capacity' });
  assert.deepEqual(plain(AT.migrateTabKey('water', 'hydro')), { tab: 'svc', svcSub: 'network' });
  // The fold an old Allocations name opens.
  assert.equal(AT.foldOf('svc', 'alloc'), 'alloc');
  assert.equal(AT.foldOf('ww', 'alloc'), 'alloc');
  for (const [t, s] of [['svc', 'capacity'], ['svc', '__proto__'], ['svc', 'constructor'], ['__proto__', 'alloc'], ['svc', undefined], ['water', 'alloc']]) assert.equal(AT.foldOf(t, s), null, `${t}:${s}`);
  // Stored picks: the Model checks pick goes to Records when Servicing was the tab last picked.
  const prefs = { footPref: 'svc', gSub: 'pipeline', svcSub: 'checks', dcSub: 'timing', rSub: 'sources' };
  assert.deepEqual(plain(AT.migratePrefs(prefs)), { footPref: 'records', gSub: 'pipeline', svcSub: null, dcSub: 'timing', rSub: 'checks' });
  assert.deepEqual(plain(AT.migratePrefs({ ...prefs, footPref: 'growth' })), { footPref: 'growth', gSub: 'pipeline', svcSub: null, dcSub: 'timing', rSub: 'sources' }, 'another tab last picked: Servicing resets to Capacity, Records keeps its own');
  assert.equal(AT.migratePrefs({ ...prefs, svcSub: 'alloc' }).svcSub, 'capacity');
  // … as the app loads them (footTab4 / svcSub / rSub in this browser).
  let T = loadTabsWith({ footTab4: 'svc', svcSub: 'checks', rSub: 'sources' });
  assert.equal(T.getFootPref(), 'records'); assert.equal(T.getRSub(), 'checks'); assert.equal(T.getSvcSub(), 'capacity');
  T = loadTabsWith({ footTab4: 'growth', svcSub: 'checks', rSub: 'sources' });
  assert.equal(T.getFootPref(), 'growth'); assert.equal(T.getRSub(), 'sources'); assert.equal(T.getSvcSub(), 'capacity');
  T = loadTabsWith({ footTab4: 'svc', svcSub: 'alloc' });
  assert.equal(T.getFootPref(), 'svc'); assert.equal(T.getSvcSub(), 'capacity');
  // In-app calls.
  assert.equal(AT.setSub('svc', 'checks'), 'records'); assert.equal(AT.getRSub(), 'checks');
  assert.equal(AT.setSub('svc', 'alloc'), 'svc'); assert.equal(AT.getSvcSub(), 'capacity');
  // showFootTab, a data-at link and a share link open the fold for an old Allocations name.
  let opened = 0;
  T = loadTabsWith({}, { PeelDemandUI: { openAllocFold: () => { opened++; }, renderAlloc: () => {} } });
  T.showFootTab('svc', 'alloc'); assert.equal(opened, 1, 'showFootTab(svc, alloc)');
  T.showFootTab('ww', 'alloc'); assert.equal(opened, 2, 'showFootTab(ww, alloc)');
  T.showFootTab('svc', 'capacity'); T.showFootTab('svc'); assert.equal(opened, 2, 'Capacity itself leaves the fold as it is');
  const s = src('js/analysis-tabs.js');
  // (one opener for every fold a moved sub-view became, navigation phase 3: openFold; Allocations is its
  // 'alloc', which calls PeelDemandUI.openAllocFold, as the spies above show)
  assert.match(s, /const FOLD_OPEN = \{ alloc: \(\) => DUI\(\) && DUI\(\)\.openAllocFold,/);
  const fold = s.indexOf('if (sub) openFold(foldOf(key, sub));');
  assert.ok(fold > 0 && fold < s.indexOf('{ const r = sub ? migrateSub(key, sub) : null;'), 'showFootTab: the fold before the sub-view migrates');
  assert.match(s, /const \[t0, s0\] = a\.dataset\.at\.split\(':'\), r = [^\n]*\n {4}if \(s0\) openFold\(foldOf\(t0, s0\)\);/, 'a data-at link: the fold from the name before it migrates');
  assert.match(src('js/share.js'), /if \(AT\(\)\.openFold && AT\(\)\.foldOf\) AT\(\)\.openFold\(AT\(\)\.foldOf\(t, oldSub\)\);/, 'a link: t and its own sub-view param');
});

// Navigation phase 3 (navigation-design §3.4, §7.2–7.3): the Ledger is Growth › Forecast's By period fold
// (js/ledger-ui.js). Old links (gs=ledger), a stored Ledger pick, in-app calls (data-at="growth:ledger",
// openTab, showFootTab, setSub) and the What's coming chip and page land on the Forecast with By period open.
test('phase 3: the Ledger is Forecast’s By period, from a link, a stored pick, an in-app call and the What’s coming chip', () => {
  assert.deepEqual(plain(AT.TABSUBS.growth.valid), ['pipeline', 'areas', 'timing']);
  assert.deepEqual(plain(AT.migrateTabKey('growth', 'ledger')), { tab: 'growth', gSub: 'timing' });
  assert.deepEqual(plain(AT.migrateSub('growth', 'ledger')), { tab: 'growth', sub: 'timing' });
  assert.equal(AT.foldOf('growth', 'ledger'), 'period');
  for (const [t, sub] of [['growth', 'timing'], ['growth', '__proto__'], ['growth', 'constructor'], ['growth', undefined], ['svc', 'ledger']]) assert.equal(AT.foldOf(t, sub), null, `${t}:${sub}`);
  // Stored picks: the Ledger was Growth's own, so Growth opens on the Forecast whichever tab was last
  // picked (never on Pipeline, §7.3).
  const prefs = { footPref: 'growth', gSub: 'ledger', svcSub: 'capacity', dcSub: 'timing', rSub: 'sources' };
  assert.deepEqual(plain(AT.migratePrefs(prefs)), { ...prefs, gSub: 'timing' });
  assert.deepEqual(plain(AT.migratePrefs({ ...prefs, footPref: 'svc' })), { ...prefs, footPref: 'svc', gSub: 'timing' });
  // … as the app loads them (gSub / footTab4 in this browser), before the reset to each tab's first.
  let T = loadTabsWith({ gSub: 'ledger', footTab4: 'growth' });
  assert.equal(T.getGSub(), 'timing'); assert.equal(T.getFootPref(), 'growth');
  assert.equal(loadTabsWith({ gSub: 'ledger', footTab4: 'svc' }).getGSub(), 'timing');
  // In-app calls.
  assert.equal(AT.setSub('growth', 'ledger'), 'growth'); assert.equal(AT.getGSub(), 'timing');
  // One opener: showFootTab (and a data-at link, a share link, the chip, the page) opens By period for the
  // old name; the Forecast itself leaves the fold as it is; Allocations still opens its own fold.
  const calls = [];
  T = loadTabsWith({}, { PeelLedgerUI: { openPeriod: () => calls.push('period'), render: () => {} }, PeelDemandUI: { openAllocFold: () => calls.push('alloc'), renderAlloc: () => {} } });
  T.showFootTab('growth', 'ledger'); assert.deepEqual(calls, ['period'], 'showFootTab(growth, ledger): By period, not Allocations');
  assert.equal(T.getGSub(), 'timing');
  T.showFootTab('growth', 'timing'); T.showFootTab('growth'); assert.deepEqual(calls, ['period'], 'the Forecast itself leaves the fold as it is');
  T.openFold('alloc'); assert.deepEqual(calls, ['period', 'alloc'], 'Allocations: its own fold only');
  T.openFold('period'); assert.deepEqual(calls, ['period', 'alloc', 'period']);
  for (const f of ['__proto__', 'constructor', 'toString', null, undefined, '', 'nonsense']) T.openFold(f);
  assert.equal(calls.length, 3, 'no other name opens a fold');
  const bare = loadTabsWith({});
  assert.doesNotThrow(() => { bare.openFold('period'); bare.openFold('alloc'); bare.showFootTab('growth', 'ledger'); }, 'no ledger or demand module loaded: nothing opens, nothing throws');
  // The What's coming chip and page: the Forecast with its fold (js/workspaces.js go, openPage), opened
  // after the tab, before the page draws.
  assert.equal(W.BY_ID.coming.sub, 'timing'); assert.equal(W.plan('coming').fold, 'period');
  const ws = src('js/workspaces.js');
  assert.match(ws, /function go\(id, o = \{\}\) \{[\s\S]*?A\.showFootTab\(pl\.tab\); if \(pl\.fold && A\.openFold\) A\.openFold\(pl\.fold\); \}\n {4}foldLayers\(\);/);
  // (navigation phase 6: What's coming is Home's Growth › Forecast, the host block: the tab, then the fold,
  // then the page; a workspace page's block the same; the back bar's o.view, the other branch, before the page too)
  assert.match(ws, /function openPage\(id, o = \{\}\) \{[\s\S]*?if \(h\) \{ if \(h\.sub && A\.setSub\) A\.setSub\(h\.tab, h\.sub\); if \(A\.setFootPref\) A\.setFootPref\(h\.tab\); A\.showFootTab\(h\.tab\); if \(h\.fold && A\.openFold\) A\.openFold\(h\.fold\); \}[\s\S]*?A\.showFootTab\(w\.tab\); if \(w\.fold && A\.openFold\) A\.openFold\(w\.fold\); \}\n {4}\}\n {4}\/\/ \(o\.view, with keep: [^\n]*\n {4}else if \(A && o\.view && A\.openTab\) \{ const \[t, s\] = o\.view\.split\(':'\); A\.openTab\(t, s \|\| undefined\); \}\n {4}if \(h\) id = h\.page;\n {4}lastHTML = '';\n {4}setMode\('home', id\);/);
  // A link names the old sub-view through the same opener (js/share.js, the phase 2 test above).
  assert.match(src('js/share.js'), /if \(AT\(\)\.openFold && AT\(\)\.foldOf\) AT\(\)\.openFold\(AT\(\)\.foldOf\(t, oldSub\)\);/);
  assert.match(src('js/analysis-tabs.js'), /period: \(\) => root\.PeelLedgerUI && root\.PeelLedgerUI\.openPeriod \};/);
});

// Navigation phase 4 (navigation-design §7.2–7.3): Capital is DC timing · EAs · Projects. DC projects is DC
// timing (one list, both verdicts); the funding screen is its fold. Old links, stored picks, in-app calls and
// the usage counts land there.
test('phase 4: DC projects is DC timing; the funding screen its fold; the stored sorts and the open project', () => {
  assert.deepEqual(plain(AT.TABSUBS.dca.valid), ['timing', 'eas', 'projects']);
  for (const sub of ['dcproj', 'funding', 'recommendations', 'timing']) assert.deepEqual(plain(AT.migrateTabKey('dca', sub)), { tab: 'dca', dcSub: 'timing' }, `dcs=${sub}`);
  assert.deepEqual(plain(AT.migrateTabKey('dca', 'build')), { tab: 'dca', dcSub: 'projects' });
  // (what the usage alias and an in-app call read)
  assert.deepEqual(plain(AT.migrateSub('dca', 'dcproj')), { tab: 'dca', sub: 'timing' });
  assert.equal(AT.foldOf('dca', 'dcproj'), null, 'no fold: DC timing is the list itself');
  // Stored picks, as the app loads them (before the reset to each tab's first, which is also DC timing).
  const prefs = { footPref: 'dca', gSub: 'pipeline', svcSub: 'capacity', dcSub: 'dcproj', rSub: 'sources' };
  assert.deepEqual(plain(AT.migratePrefs(prefs)), { ...prefs, dcSub: 'timing' });
  const T = loadTabsWith({ dcSub: 'dcproj', footTab4: 'dca' });
  assert.equal(T.getDcSub(), 'timing'); assert.equal(T.getFootPref(), 'dca');
  // In-app calls: setSub, showFootTab, a data-at link (all through migrateSub).
  const T2 = loadTabsWith({ dcSub: 'eas' });
  assert.equal(T2.getDcSub(), 'eas');
  assert.equal(T2.setSub('dca', 'dcproj'), 'dca'); assert.equal(T2.getDcSub(), 'timing');
  T2.setSub('dca', 'eas'); T2.showFootTab('dca', 'dcproj'); assert.equal(T2.getDcSub(), 'timing', 'showFootTab(dca, dcproj): DC timing');
  // The chips; at a development the full table shows the site's brief only (and, since navigation phase 5,
  // the EAs near it: Capital is one view there, the phase-5 test below).
  assert.deepEqual(plain(AT.chipsAt('dca', 'area')), ['timing', 'eas', 'projects']);
  assert.deepEqual(plain(AT.chipsAt('dca', 'site')), ['timing']);
  const rule = /\n(#analysis\.site-scope #pane-svc-netbar[^{]*)\{ display: none; \}/.exec(src('css/app.css'))[1].split(',').map(x => x.trim());
  for (const id of ['pane-dca-dcproj', 'pane-dca-rec', 'pane-dca-funding']) assert.ok(rule.includes(`#analysis.site-scope #${id}`), `#${id} hidden at a development`);
  // Settings › Usage: a DC projects count is DC timing's, by the browser's own rule (js/usage.js aliasKey).
  const U = require('../js/usage.js'), alias = k => { const m = /^sub:(\w+)\.(\w+)$/.exec(k), r = m && AT.migrateSub(m[1], m[2]); return r ? `sub:${r.tab}.${r.sub}` : k; };
  let d = U.bump(null, 'sub', 'dca.dcproj', '2026-10-27'); d = U.bump(d, 'sub', 'dca.timing', '2026-10-27');
  assert.deepEqual(plain(U.totals(d, alias)), { 'sub:dca.timing': 2 }, 'no sub:dca.dcproj key');
  // No name for the chip that went; the page and the workspace keep "DC projects".
  assert.doesNotMatch(src('js/workspaces.js'), /dcproj: 'DC projects'/);
  assert.equal(W.BY_ID.projects.label, 'DC projects');
  // A search pick on a page: the Capital page at the project (since navigation phase 6 Home's Capital › DC timing:
  // `projects` opens the view, so no section id rides along).
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'dc', key: 'water:25-9' } }, 'home')), { page: 'projects', dcSel: 'water:25-9' });
  // EA to construction joins EAs: its page id stays (the EAs page; no PAGE_ALIAS row), and its chip, its page and
  // an old #w=eaflow link open Capital › EAs with the EA to construction fold open (js/capital-ea.js openEaFlow).
  assert.equal(W.resolvePage('eaflow'), 'eaflow'); assert.equal(W.BY_ID.eaflow.sub, 'eas'); assert.equal(W.BY_ID.eaflow.fold, 'eaflow');
  const opened = [];
  const T3 = loadTabsWith({}, { PeelCapitalEA: { openEaFlow: () => opened.push('eaflow') }, PeelLedgerUI: { openPeriod: () => opened.push('period'), render: () => {} }, PeelDemandUI: { openAllocFold: () => opened.push('alloc'), renderAlloc: () => {} } });
  T3.openFold('eaflow'); assert.deepEqual(opened, ['eaflow'], 'the chip’s fold: EA to construction, once');
  T3.openFold('alloc'); T3.openFold('period'); assert.deepEqual(opened, ['eaflow', 'alloc', 'period'], 'Allocations and By period open their own folds only');
  T3.showFootTab('dca', 'eas'); assert.deepEqual(opened, ['eaflow', 'alloc', 'period'], 'Capital › EAs itself leaves the fold as it is (no sub-view moved into it)');
  assert.equal(AT.foldOf('dca', 'eas'), null);
  assert.doesNotThrow(() => loadTabsWith({}).openFold('eaflow'), 'no Capital module loaded: nothing opens, nothing throws');
});

// Navigation phase 2 (navigation-design §3.4, N-11): one System control, Both · Wastewater · Water, one
// stored pick for Servicing › Capacity and Capital › DC projects. Capacity's old 'all', DC projects' old
// words and its own stored pick (dcProjSys) land on it; a link carries it as sy=.
test('the one System control: one stored pick; old values, stored picks and links land', () => {
  for (const v of ['both', 'all', undefined, null, '', 'nonsense', '__proto__', 'constructor']) assert.equal(AT.sysKey(v), 'both', String(v));
  for (const v of ['ww', 'wastewater']) assert.equal(AT.sysKey(v), 'ww', v);
  assert.equal(AT.sysKey('water'), 'water');
  assert.deepEqual(plain(AT.SYS.map(x => x[0])), ['both', 'ww', 'water'], 'Both first');
  // As the app loads it: fresh → Both; the one pick; DC projects' own pick once, when the one pick is unset.
  assert.equal(loadTabsWith({}).getSys(), 'both', 'a fresh browser: Both (DC projects was Wastewater)');
  assert.equal(loadTabsWith({ sysPick: 'water' }).getSys(), 'water');
  assert.equal(loadTabsWith({ dcProjSys: 'wastewater' }).getSys(), 'ww', 'DC projects’ stored pick carries over');
  assert.equal(loadTabsWith({ dcProjSys: 'both' }).getSys(), 'both');
  assert.equal(loadTabsWith({ sysPick: 'both', dcProjSys: 'water' }).getSys(), 'both', 'the one pick wins');
  // A pick is stored; a link's is for the visit.
  const sets = [], store = { get: (k, d) => d, set: (k, v) => sets.push([k, v]) };
  const document = { querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/analysis-tabs.js'), ctx);
  const T = ctx.module.exports;
  sets.length = 0;
  T.setSys('water'); assert.equal(T.getSys(), 'water'); assert.deepEqual(sets, [['sysPick', 'water']]);
  sets.length = 0;
  T.setSys('ww', { link: true }); assert.equal(T.getSys(), 'ww'); assert.deepEqual(sets, [], 'a link changes the pick, stores nothing');
  T.setSys(null, { link: true }); assert.equal(T.getSys(), 'both', 'a link without sy=: Both');
  // The share link: written when not Both, read before the panels draw.
  const sh = src('js/share.js');
  assert.match(sh, /if \(AT\(\)\.getSys && AT\(\)\.getSys\(\) !== 'both'\) set\('sy', AT\(\)\.getSys\(\)\);/);
  assert.match(sh, /AT\(\)\.setSys\(q\.get\('sy'\), \{ link: true, quiet: true \}\)/);
  assert.ok(sh.indexOf("AT().setSys(q.get('sy')") < sh.indexOf('AT().showFootTab(AT().getFootPref());'), 'before the tab draws');
  // A lens sets the system its own DC layer shows (js/map-analysis.js VIEW_PRESETS); Planning has none.
  const ma = src('js/map-analysis.js'), presets = [...ma.matchAll(/^ {4}(\w+): \{ basemap: [^\n]*dc: \{ on: (true|false), sys: '(\w+)' \} \},$/gm)];
  assert.deepEqual(presets.map(m => m[1]), ['planning', 'water', 'wastewater', 'dc'], 'the four lenses');
  for (const [, view, on, sys] of presets) {
    if (on === 'true') assert.equal(AT.SYS_OF_VIEW[view], AT.sysKey(sys), view);
    else assert.ok(!Object.prototype.hasOwnProperty.call(AT.SYS_OF_VIEW, view), `${view}: leaves the System`);
  }
});

// Navigation phase 5 (navigation-design §7.3, stored preferences): a stored pick that names a control the
// phase retires is ignored, never an error. Settings › Counting's Previous switch (owner decision 14):
// `countMode: 'previous'` in this browser's store opens on the tree count; nothing reads the key.
test('phase 5: stored preferences of retired controls are ignored (countMode)', () => {
  const sets = [], store = { get: (k, d) => (k === 'countMode' ? 'previous' : d), set: (k, v) => sets.push([k, v]) };
  const ctx = { PeelUtil: { store }, console };
  ctx.window = ctx; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/tree-counts.js'), ctx);
  const TC = ctx.PeelTreeCounts;
  assert.equal(TC.mode, undefined, 'no mode to read back');
  const p = { key: 'k', units: 5, records: [{ kind: 'application', municipality: 'B', ref: 'OZ-1', fileKey: 'OZ-1', uid: 'OZ-1' }] };
  const data = { snapshotAt: '2026-10-12', projects: { k: { u: 9, s: TC.sigOf(p, x => x), t: [] } } };
  TC.apply([p], { data, canonRef: x => x });
  assert.equal(p.count.mode, 'tree'); assert.equal(p.units, 9);
  assert.deepEqual(sets, [], 'nothing written either');
  assert.doesNotMatch(src('js/tree-counts.js'), /countMode|STORE_KEY/);
});

// The development's sub-tabs (About · Files & history · Site, `peel-dev:devsub` in localStorage) are retired:
// a stored pick is never read. A development opens on the tab picked; an old link's Development tab (and its
// sub-view) is the Overview; Records shows the files and history whatever the store holds.
test('phase 5: stored preferences of retired controls are ignored (peel-dev:devsub)', () => {
  assert.doesNotMatch(src('js/devtab.js'), /peel-dev:devsub|DEVSUBS|readSub|writeSub/);
  const read = [], localStorage = { getItem: k => { read.push(k); return k === 'peel-dev:devsub' ? 'site' : null; }, setItem: k => read.push(`set:${k}`) };
  const p = { key: 'Brampton|1 MAIN ST', title: '1 Main St', municipality: 'Brampton', phase: 'review', rank: 2, last: null, first: null, timeline: [], milestones: {},
    records: [{ uid: 'u1', ref: 'OZ 24-001', kind: 'application', stage: 'master', phase: 'review', statusRaw: '', events: [], description: '', address: '1 Main St', type: 'Zoning' }] };
  const body = { dataset: {}, innerHTML: '' };
  const document = { getElementById: id => (id === 'records-body' ? body : null), querySelectorAll: () => [], addEventListener() {}, documentElement: { classList: { contains: () => false } } };
  const ctx = { document, localStorage, PeelPhases: require('../js/phases.js'), PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelMapCore: { map: {} }, DevScope: { current: () => p }, console };
  ctx.window = ctx; ctx.globalThis = ctx;
  // (with the development model it reads: js/dev-detail.js, js/dev-nav.js, loaded after it as index.html does)
  for (const f of ['js/devtab.js', 'js/dev-detail.js', 'js/dev-nav.js']) require('node:vm').runInNewContext(src(f), ctx);
  ctx.DevTab.render(body);
  assert.match(body.innerHTML, />Files and events<\/h2>/, 'Records: the files and history');
  for (const part of ['about', 'timeline', 'story']) assert.ok(ctx.DevTab.partHTML(p, part), part);
  assert.deepEqual(read.filter(k => /devsub/.test(k)), [], 'the stored sub-view is never read or written');
  for (const [t, s] of [['dev', undefined], ['dev', 'files'], ['dev', 'site'], ['developments', 'about']]) assert.deepEqual(plain(AT.migrateTabKey(t, s)), { tab: 'overview' }, `t=${t}${s ? ` / ${s}` : ''}`);
});

// Capital at a development is one view (navigation phase 5): its EAs and capital works near the site are in DC
// timing's site panel, so Capital › EAs is no chip there. A link or a stored pick of EAs keeps its value: at a
// development Capital opens on DC timing (the one view, no chip row), and back at an area the EAs pick returns.
test('phase 5: Capital › EAs at a development is the one Capital view; the pick returns at an area', () => {
  let site = { key: 'Brampton|1 MAIN ST' };
  const T = loadTabsWith({ dcSub: 'eas', footTab4: 'dca' }, { DevScope: { current: () => site } });
  assert.deepEqual(plain(T.migrateTabKey('dca', 'eas')), { tab: 'dca', dcSub: 'eas' }, 't=dca&dcs=eas: the link keeps its pick');
  assert.deepEqual(plain(T.chipsAt('dca', 'site')), ['timing']);
  assert.equal(T.subFor('dca', 'eas', true), 'timing');
  T.showFootTab('dca', 'eas'); assert.equal(T.getDcSub(), 'timing', 'at a development: DC timing, the one view');
  site = null; T.showFootTab('dca'); assert.equal(T.getDcSub(), 'eas', 'at Peel: the EAs pick again');
  assert.doesNotMatch(src('js/analysis-tabs.js'), /EMPTY_AT_SITE/);
  assert.match(src('js/analysis-tabs.js'), /dca: \['eas', 'projects'\]/);
});

// FSR review is a development's Servicing view (navigation phase 5, owner decision 4; navigation-design §7.1–7.2):
// t=svc&svs=fsr&d=<key> reopens it at the development; at an area, a servicing scope or a result Servicing opens
// on its own first view and FSR review comes back when a development opens (areaPick). The page id fsr stays a
// page (#w=p:fsr: the Find step, or with a site its FSR review), and the Review an FSR chip opens the view at a site.
test('phase 5: FSR review is a development\u2019s Servicing view; the fsr page and map view lead there', () => {
  assert.deepEqual(plain(AT.migrateTabKey('svc', 'fsr')), { tab: 'svc', svcSub: 'fsr' });
  assert.deepEqual(plain(AT.migrateSub('svc', 'fsr')), { tab: 'svc', sub: 'fsr' });
  assert.deepEqual(plain(AT.chipsAt('svc', 'site')), ['network', 'fsr']);
  assert.deepEqual(plain(AT.chipsAt('svc', 'area')), ['capacity', 'network', 'pipes'], '(Old pipes since navigation phase 6c)');
  assert.equal(AT.subFor('svc', 'fsr', false), 'capacity');
  assert.equal(AT.subFor('svc', 'fsr', true), 'fsr');
  // A stored or linked FSR review pick: Capacity at Peel, FSR review again once a development is open.
  let site = null;
  const T = loadTabsWith({ svcSub: 'fsr', footTab4: 'svc' }, { DevScope: { current: () => site } });
  T.showFootTab('svc'); assert.equal(T.getSvcSub(), 'capacity', 'at Peel: Servicing on its own first view');
  site = { key: 'Brampton|1 MAIN ST' }; T.showFootTab('svc'); assert.equal(T.getSvcSub(), 'fsr', 'at a development: FSR review again');
  site = null; T.showFootTab('svc'); assert.equal(T.getSvcSub(), 'capacity');
  // The page id: still a page (a link, Help's role buttons, the last workspace); with a site, its FSR review.
  assert.equal(W.resolvePage('fsr', {}), 'fsr');
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:fsr&d=Brampton%7C1%20MAIN%20ST' })), { mode: 'home', page: 'fsr' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:fsr' })), { mode: 'home', page: 'fsr' }, 'without a site: the Find step');
  // The map view (#w=fsr): the Find step on Network, then Servicing › FSR review once a site is open.
  assert.equal(W.plan('fsr', {}).sub, 'network');
  assert.equal(W.plan('fsr', { site: true }).sub, 'fsr');
  // A share link writes svs as the open sub-view (js/share.js reads it back through migrateTabKey).
  assert.match(src('js/share.js'), /migrateTabKey\(/);
});

// Navigation phase 6b (navigation-design §3.1 rule 1, §5 rows 29, 49, 56, §7.1): the site's page is the page host at a
// development, the map's five tabs under its header (phase 5's section bar, SITE, is removed by design). Check a site is
// it at Overview, Review an FSR at Servicing › FSR review (#w=p:fsr&d=<key> lands there; without a site, the Find step);
// the old section ids (phase 1's search routes, pageRoute's sec; phase 5's sections) name its views (SITE_SEC).
test('phase 6b: the site page is the host at a development: old section ids, the fsr page and a pick land on its view', () => {
  const S = require('../js/sections.js'), p = { key: 'k', title: '1 A St', municipality: 'Brampton' };
  assert.deepEqual(plain(W.SITE_SEC), { summary: 'overview:', growth: 'growth:pipeline', servicing: 'svc:network', capital: 'dca:timing', files: 'records:files' });
  for (const k of Object.values(W.SITE_SEC)) assert.ok(S.VIEWS.site[k], `${k}: a view of the site’s page`);
  assert.deepEqual(Object.keys(S.VIEWS.site), ['overview:', ...AT.TAB_KEYS.flatMap(t => AT.chipsAt(t, 'site').map(c => `${t}:${c}`))], 'the map’s tabs and chips at a development');
  assert.deepEqual(plain(W.hostOf('site', { site: true })), { page: 'site', tab: 'overview', sub: '', fold: null });
  assert.deepEqual(plain(W.hostOf('fsr', { site: true })), { page: 'site', tab: 'svc', sub: 'fsr', fold: null });
  for (const id of ['site', 'fsr']) { assert.equal(W.hostOf(id), null, `${id} without a development: its Find step`); assert.equal(W.hostOf(id, { site: false }), null, id); }
  for (const id of Object.keys(W.HOST)) assert.equal(W.hostOf(id, { site: true }).page, 'home', `${id}: Home’s view, a development open or not`);
  for (const id of ['__proto__', 'constructor', 'week', 'home']) assert.equal(W.hostOf(id, { site: true }), null, id);
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:fsr' })), { mode: 'home', page: 'fsr' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:site&d=k' })), { mode: 'home', page: 'site' });
  // A phase 5 link into FSR review (#w=p:fsr&nav=2&t=svc&svs=network&d=…: openPage('fsr') set the Find step's Network): the
  // page's own view by rule (js/share.js ready, nav < 3: hostOf with the link's d=), FSR review.
  assert.match(src('js/share.js'), /pid \? W\.hostOf\(pid, \{ site: !!q\.get\('d'\) \}\) : null/);
  assert.deepEqual(plain(W.hostOf(W.resolvePage('fsr', { site: true }), { site: true })), { page: 'site', tab: 'svc', sub: 'fsr', fold: null });
  // A pick routes to the ids (phase 1, pageRoute unchanged): summary is Overview, files is Records › Files.
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'home')), { page: 'site', dev: 'k', sec: 'summary' });
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'fsr')), { page: 'fsr', dev: 'k', sec: 'summary' });
  // The browser half (js/workspaces.js in a vm): with a development, each page id is the site's page at its view.
  let L = loadWs(); L.open(p, null);
  L.B.openPage('fsr');
  assert.deepEqual([L.B.page(), L.B.view()], ['site', 'svc:fsr'], 'Review an FSR at a development: the site’s page at FSR review');
  assert.deepEqual(L.calls, [['setSub', 'svc', 'fsr'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]);
  assert.deepEqual(L.closed, [], 'the development kept'); assert.equal(L.store.get('lastWs'), 'fsr');
  L.calls.length = 0; L.B.openPage('site');
  assert.deepEqual([L.B.page(), L.B.view(), L.calls], ['site', 'overview:', [['setFootPref', 'overview'], ['showFootTab', 'overview']]]);
  // A search pick on it: a file number Records › Files (picked as on the strip), a development Overview, and from FSR
  // review FSR review again (phase 1's route: the page as the reader names it).
  L.calls.length = 0; assert.equal(L.B.routePick({ label: 'x', p, hit: 'file', ref: 'OZ 1' }), true);
  assert.deepEqual([L.B.page(), L.B.view(), L.calls], ['site', 'records:files', [['openTab', 'records', 'files']]]);
  L.calls.length = 0; L.B.routePick({ label: 'x', p });
  assert.deepEqual([L.B.page(), L.B.view(), L.calls], ['site', 'overview:', [['setFootPref', 'overview'], ['showFootTab', 'overview']]]);
  L.B.openPage('fsr'); L.B.routePick({ label: 'x', p });
  assert.deepEqual([L.B.page(), L.B.view()], ['site', 'svc:fsr']);
  // A strip pick there is the development's view: the last workspace is the page as the reader names it, Review an FSR
  // at FSR review, else Check a site (as the views row's FSR review and its section buttons stored it before 6b, and as
  // the header's Check FSR stores it now: one view, one last workspace, whichever way it was reached).
  L.B.openPage('site'); L.click('#home [data-pg-tab]', { pgTab: 'dca', pgSub: 'timing' });
  assert.deepEqual([L.B.page(), L.B.view(), L.store.get('lastWs')], ['site', 'dca:timing', 'site']);
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'fsr' }); assert.deepEqual([L.B.view(), L.store.get('lastWs')], ['svc:fsr', 'fsr']);
  L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'network' }); assert.deepEqual([L.B.view(), L.store.get('lastWs')], ['svc:network', 'site']);
  L.B.openPage('fsr'); assert.equal(L.store.get('lastWs'), 'fsr', 'Check FSR');
  L.click('#home [data-pg-tab]', { pgTab: 'overview' }); assert.deepEqual([L.B.page(), L.B.view(), L.store.get('lastWs')], ['site', 'overview:', 'site'], 'left at Overview: Check a site');
  // ← Page from the site's map view: the site's page at the map's tab and view (its development's Overview is one of them).
  L.B.go('site', { keep: true, quiet: true }); L.at.tab = 'svc'; L.at.subs.svc = 'network'; L.calls.length = 0;
  L.click('[data-ws-backpage]');
  assert.deepEqual([L.B.page(), L.B.view(), L.calls.length], ['site', 'svc:network', 0]);
  L.B.go('fsr', { keep: true, quiet: true }); L.at.tab = 'overview'; L.calls.length = 0;
  L.click('[data-ws-backpage]');
  assert.deepEqual([L.B.page(), L.B.view(), L.calls.length, L.closed], ['site', 'overview:', 0, []]);
  // Without a development: each its Find step, no host.
  L = loadWs(); L.B.openPage('fsr'); assert.deepEqual([L.B.page(), L.B.view()], ['fsr', null]);
  L.B.openPage('site'); assert.deepEqual([L.B.page(), L.B.view()], ['site', null]);
  // js/ws-pages.js: the host at a development draws the map's view (an AT stub's), a file number's file marked on Records.
  const vm = require('node:vm');
  let dev = p, view = 'records:files';
  const spec = a => ({ scope: 'dev:k', spec: { head: { status: null, tools: { key: 'k' } }, answer: a, lists: [], folds: [] } });
  const panels = { 'overview:': spec('Overview'), 'records:files': spec('Records'), 'svc:network': spec('Network'), 'svc:fsr': spec('FSR review') };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelPanel: { get: k => panels[k] || null, scenarioChip: () => '' }, PeelAnalysisTabs: { TAB_KEYS: AT.TAB_KEYS, chipsAt: AT.chipsAt, tabReady: () => true, viewKey: () => view },
    PeelWorkspaces: { BY_ID: { site: { label: 'Check a site' }, fsr: { label: 'Review an FSR' } }, TAB_NAME: W.TAB_NAME, tabPath: W.tabPath, chipName: W.chipName }, PeelApp: { state: { projects: [], filtered: [] } }, DevScope: { current: () => dev } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of ['js/sections.js', 'js/ws-pages.js']) vm.runInNewContext(src(f), ctx);
  const WP = window.PeelWsPages, on = m => (/<button type="button" role="tab" class="page-sec page-tab[^"]* on"[^>]*>([^<]*)</.exec(m.tabs) || [])[1];
  WP.fileAt('k', 'OZ 1'); let m = WP.host('site');
  assert.equal(on(m), 'Records'); assert.equal(m.answer, 'Records'); assert.equal(typeof m.onMount, 'function', 'the file marked once drawn');
  view = 'overview:'; m = WP.host('site'); assert.equal(on(m), 'Overview'); assert.equal(m.answer, 'Overview');
  view = 'records:files'; assert.equal(WP.host('site').onMount, undefined, 'another view clears the mark');
  // (a view the map hides at a development, as Capacity: the tab's first, Network)
  view = 'svc:capacity'; m = WP.host('site'); assert.equal(m.answer, 'Network');
  view = 'svc:fsr'; m = WP.host('site'); assert.equal(m.id, 'fsr'); assert.equal(on(m), 'Servicing'); assert.equal(m.answer, 'FSR review');
  assert.match(m.tabs, /aria-label="Views"[^>]*><button type="button" class="page-sec" data-pg-tab="svc" data-pg-sub="network"[^>]*>Network<\/button><button type="button" class="page-sec on" data-pg-tab="svc" data-pg-sub="fsr"/);
  dev = null; m = WP.build('fsr'); assert.equal(m.id, 'fsr'); assert.match(m.answer, /^Find the development/, 'without a site: the Find step');
  // Gone (no producer left: the strip; fileAt marks a file). The site's own trail line (siteTrail, exploreBar: Peel ›
  // municipality › plan › site, each a data-ws-explore crumb) is the top bar's trail at a development (6b-S2: devPlace,
  // each step that place's filter, the site closed, the tab kept; tests/page-host.test.js).
  assert.doesNotMatch(['js/ws-pages.js', 'js/workspaces.js', 'js/devtab.js', 'js/file-tree.js'].map(src).join(''), /siteAt|data-ws-sec|wsSec\b|viewsBar|siteSec|siteTrail|exploreBar/);
  assert.doesNotMatch(src('js/sections.js'), /\bSITE = |BY_ID|viewOf/);
  assert.match(src('js/topbar.js'), /const dp = scoped && !kept \? devPlace\(scoped, a\) : \[\];[^]*for \(const id of dp\)/);
});

// Navigation phase 6a (navigation-design §3.1 rule 1, §3.3, §7.1–7.2): Home is the page host at an area, the map's
// five tabs under its header; the area pages are its views. Every old area page id (a link, a data-ws-page button,
// the stored last workspace, Help's role buttons) opens Home at that page's tab and view, its fold open; a link
// from before phase 6 opens the page's own view (nav=3); Open the map and ← Page keep the tab and view.
// (glob: the vm's own globals, e.g. a Date whose now() a test sets)
function loadWs(stored = {}, extra = {}, glob = {}) {
  const calls = [], handlers = {}, store = new Map(Object.entries(stored)), closed = [];
  const at = { tab: 'overview', subs: { growth: 'pipeline', svc: 'capacity', dca: 'timing', records: 'sources' } };
  let dev = null, ss = null;
  const PeelAnalysisTabs = { TAB_KEYS: AT.TAB_KEYS, chipsAt: AT.chipsAt, tabReady: () => true, getFootTab: () => at.tab,
    setSub: (t, s) => { calls.push(['setSub', t, s]); at.subs[t] = s; return t; }, setFootPref: t => calls.push(['setFootPref', t]),
    showFootTab: t => { calls.push(['showFootTab', t]); at.tab = t; if (extra.onShowTab) extra.onShowTab(t); }, openFold: f => calls.push(['openFold', f]),
    openTab: (t, s) => { calls.push(['openTab', t, s]); if (s) at.subs[t] = s; at.tab = t; }, wantedTab: () => at.tab, viewKey: () => `${at.tab}:${at.subs[at.tab] || ''}` };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
    addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, dispatchEvent() {} };
  // (extra.onShowTab: what a tab shown does next, e.g. the panels' pnl:set, js/panel.js sync)
  const window = { document, PeelUtil: { esc: x => String(x), fmtNum: n => String(n), store: { get: (k, d) => (store.has(k) ? store.get(k) : d), set: (k, v) => store.set(k, v) } }, PeelAnalysisTabs,
    DevScope: { current: () => dev, close: () => { closed.push('dev'); dev = null; } }, PeelSvcScope: { current: () => ss, close: () => { closed.push('ss'); ss = null; } }, ...extra };
  const ctx = { window, document, location: { hash: '' }, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CustomEvent: function CustomEvent() {}, ...glob }; ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/workspaces.js'), ctx);
  // A click on an element matching sel (its data-* in dataset).
  const click = (sel, dataset = {}) => { const el = { dataset }; for (const f of handlers.click || []) f({ target: { closest: s => (s === sel ? el : null) }, preventDefault() {}, stopPropagation() {} }); };
  // A panel set (js/panel.js's event).
  const pnlSet = detail => { for (const f of handlers['pnl:set'] || []) f({ detail }); };
  return { B: window.PeelWorkspaces, calls, at, store, closed, click, pnlSet, open: (d, s) => { dev = d; ss = s; } };
}
test('phase 6a: the area pages are Home’s tabs; old links open the page’s own tab; Open the map and ← Page keep the view', () => {
  const S = require('../js/sections.js');
  const ROWS = { growth: ['growth', 'areas', null], outlook: ['growth', 'timing', null], coming: ['growth', 'timing', 'period'], tight: ['svc', 'capacity', null], pipes: ['svc', 'pipes', null], projects: ['dca', 'timing', null], eaflow: ['dca', 'eas', 'eaflow'], data: ['records', 'sources', null] };
  assert.deepEqual(Object.keys(W.HOST).sort(), Object.keys(ROWS).sort(), 'every area page, and only those (the site and FSR review are SITE_HOST’s, at a development: 6b; Old pipes joined in 6c)');
  for (const [id, [tab, sub, fold]] of Object.entries(ROWS)) {
    assert.deepEqual(plain(W.hostOf(id)), { page: 'home', tab, sub, fold }, id);
    assert.ok(isPage(id), `${id} is still a page id (links, buttons, the last workspace)`);
    assert.deepEqual(plain(W.startScreen({ hash: `#w=p:${id}` })), { mode: 'home', page: id }, `#w=p:${id}: openPage resolves it to Home`);
    // (the view it opens is Home's, drawn by the page's own builder: What's coming the Forecast's)
    assert.equal(S.VIEWS.area[`${tab}:${sub}`].page, id === 'coming' ? 'outlook' : id, `${id}: its builder`);
  }
  for (const id of ['home', 'week', 'site', 'fsr', 'study', 'outlets', 'help', 'explore', 'capital', '__proto__', 'constructor', 'nonsense']) assert.equal(W.hostOf(id), null, id);
  // Explore, Capital: the alias first, then the host (Explore the Find step since navigation phase 7: no host view
  // without a development, the site's page at its Overview with one).
  assert.equal(W.hostOf(W.resolvePage('explore', {})), null);
  assert.equal(W.resolvePage('explore', { site: true }), 'site');
  assert.deepEqual(plain(W.hostOf('site', { site: true })), { page: 'site', tab: 'overview', sub: '', fold: null });
  assert.deepEqual(plain(W.hostOf(W.resolvePage('capital', { last: 'eaflow' }))), { page: 'home', tab: 'dca', sub: 'eas', fold: 'eaflow' });
  // Home's views are the map's tabs and chips at an area (one registry, js/sections.js VIEWS), each page a host id.
  assert.deepEqual(Object.keys(S.VIEWS.area), ['overview:', ...AT.TAB_KEYS.flatMap(t => AT.chipsAt(t, 'area').map(c => `${t}:${c}`))]);
  for (const v of Object.values(S.VIEWS.area)) if (v.page) assert.ok(v.page === 'home' || W.HOST[v.page], v.page);
  // The tab and view names: the map's (the chips in index.html carry the same words).
  assert.deepEqual(plain(AT.chipsAt('svc', 'area').map(c => W.chipName('svc', c))), ['Capacity', 'Network', 'Old pipes']);
  assert.deepEqual(['timing', 'eas', 'projects'].map(c => W.chipName('dca', c)), ['DC timing', 'EAs', 'Projects']);
  assert.deepEqual(['sources', 'checks'].map(c => W.chipName('records', c)), ['Sources', 'Data checks']);
  assert.equal(W.chipName('growth', 'timing'), 'Forecast');

  // The browser half: openPage opens Home at the page's tab and view (its fold open), the id kept as the last workspace.
  let L = loadWs();
  L.B.openPage('tight');
  assert.equal(L.B.page(), 'home'); assert.equal(L.B.view(), 'svc:capacity');
  assert.deepEqual(L.calls, [['setSub', 'svc', 'capacity'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]);
  assert.equal(L.store.get('lastWs'), 'tight', 'the id asked for: the start screen’s last workspace');
  L.calls.length = 0; L.B.openPage('coming');
  assert.deepEqual(L.calls, [['setSub', 'growth', 'timing'], ['setFootPref', 'growth'], ['showFootTab', 'growth'], ['openFold', 'period']], 'What’s coming: the Forecast, By period open');
  L.calls.length = 0; L.B.openPage('eaflow'); assert.deepEqual(L.calls.at(-1), ['openFold', 'eaflow']); assert.equal(L.B.view(), 'dca:eas');
  L.B.openPage('data'); assert.deepEqual([L.B.page(), L.B.view()], ['home', 'records:sources']);
  L.B.openPage('projects'); assert.deepEqual([L.B.page(), L.B.view()], ['home', 'dca:timing']);
  // (Explore: its last view until navigation phase 7, removed by design, §7.1: the open site, else Find)
  L = loadWs({ lastWs: 'outlook' }); L.B.openPage('explore');
  assert.deepEqual([L.B.page(), L.B.view()], ['site', null], 'Explore: the Find step, whatever the last workspace');
  L.open({ key: 'k' }); L.B.openPage('explore');
  assert.deepEqual([L.B.page(), L.B.view(), L.closed], ['site', 'overview:', []], 'Explore with a development open: its page, the development kept');
  L = loadWs({ lastWs: 'outlook' });
  // Home itself: its Overview (not stored: setFootPref), and an open development or servicing scope closes.
  L.open({ key: 'k' }, { ref: 'plant:Lakeview' }); L.calls.length = 0;
  L.B.openPage('home');
  assert.deepEqual(L.calls, [['setFootPref', 'overview'], ['showFootTab', 'overview']]); assert.deepEqual(L.closed, ['dev', 'ss']);
  assert.equal(L.B.view(), 'overview:');
  // keep: the tab and view as they are, for every id (the id still the last workspace).
  L.at.tab = 'svc'; L.at.subs.svc = 'network'; L.calls.length = 0;
  L.B.openPage('home', { keep: true }); L.B.openPage('tight', { keep: true });
  assert.deepEqual(L.calls, []); assert.equal(L.B.view(), 'svc:network'); assert.equal(L.store.get('lastWs'), 'tight');
  // Open the map from a page view (data-ws-keep): the map view, its preset, the tab and view kept.
  L.B.go('tight', { keep: true, quiet: true }); assert.deepEqual(L.calls, []); assert.equal(L.B.mode(), 'ws'); assert.equal(L.B.view(), null, 'no page host on the map');
  L.click('[data-ws-go]', { wsGo: 'tight', wsKeep: '' }); assert.deepEqual(L.calls, [], 'the button’s data-ws-keep');
  L.click('[data-ws-go]', { wsGo: 'tight' }); assert.deepEqual(L.calls, [['setSub', 'svc', 'capacity'], ['setFootPref', 'svc'], ['showFootTab', 'svc']], 'a Home row that means Capacity still opens it');
  // ← Page: back on Home at the map's tab and view (a pick on the map kept); a page that is no host view, its own.
  L.at.subs.svc = 'network'; L.calls.length = 0;
  L.click('[data-ws-backpage]');
  assert.deepEqual([L.B.mode(), L.B.page(), L.B.view(), L.calls.length], ['home', 'home', 'svc:network', 0]);
  L.B.go('week', { quiet: true }); L.calls.length = 0; L.click('[data-ws-backpage]');
  assert.deepEqual([L.B.page(), L.calls], ['week', [['showFootTab', 'overview']]], 'This week’s map view: back on This week, as before');
  // The back bar from the full map: the page, the tab and view kept.
  L.B.openPage('tight'); L.at.subs.svc = 'network'; L.B.setMode('full'); L.calls.length = 0;
  L.click('[data-ws-back]');
  assert.deepEqual([L.B.mode(), L.B.page(), L.B.view(), L.calls.length], ['home', 'home', 'svc:network', 0]);
  // … and back to a map view: its preset again, the map's tab and view as they were left (risk 7).
  L.B.go('tight', { keep: true, quiet: true }); L.B.setMode('full'); L.at.tab = 'dca'; L.calls.length = 0;
  L.click('[data-ws-back]');
  assert.deepEqual([L.B.mode(), L.B.current(), L.at.tab, L.calls.length], ['ws', 'tight', 'dca', 0]);
  // … but a task's map view (This week, Review outlets: no page host's view, its panel the chip's own) gets its tab again,
  // as before phase 6, the rule ← Page uses (hostOf). (Old pipes was one until navigation phase 6c: since then Home's
  // Servicing › Old pipes, a host's view, kept as the map was left, below)
  for (const [ws, tab, sub] of [['week', 'overview', ''], ['outlets', 'svc', 'network']]) {
    L.B.go(ws, { quiet: true }); L.B.setMode('full'); L.at.tab = 'growth'; L.calls.length = 0;
    L.click('[data-ws-back]');
    assert.deepEqual([L.B.mode(), L.B.current(), L.at.tab], ['ws', ws, tab], ws);
    assert.deepEqual(L.calls.filter(c => c[0] === 'showFootTab' || c[0] === 'setSub'), [...(sub ? [['setSub', tab, sub]] : []), ['showFootTab', tab]], ws);
  }
  L.B.go('pipes', { quiet: true }); L.B.setMode('full'); L.at.tab = 'growth'; L.calls.length = 0;
  L.click('[data-ws-back]');
  assert.deepEqual([L.B.mode(), L.B.current(), L.at.tab, L.calls.length], ['ws', 'pipes', 'growth', 0], 'Old pipes: a host’s map view');
  // A facility or a development opened on the map shows its own Overview, which Home closes on the way back (it hosts an
  // area): the back bar lands at the view the page was left at, ← Page at the map view's page's own view, not Home's
  // Overview; the scope closed either way.
  L.B.openPage('tight'); L.B.setMode('full'); L.open(null, { ref: 'plant:Lakeview' }); L.at.tab = 'overview'; L.closed.length = 0; L.calls.length = 0;
  L.click('[data-ws-back]');
  assert.deepEqual([L.B.mode(), L.B.page(), L.B.view(), L.closed, L.calls], ['home', 'home', 'svc:capacity', ['ss'], [['openTab', 'svc', 'capacity']]]);
  L.B.go('tight', { keep: true, quiet: true }); L.open({ key: 'k' }, null); L.at.tab = 'overview'; L.closed.length = 0; L.calls.length = 0;
  L.click('[data-ws-backpage]');
  assert.deepEqual([L.B.page(), L.B.view(), L.closed, L.calls], ['home', 'svc:capacity', ['dev'], [['setSub', 'svc', 'capacity'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]]);
  // … and a tab picked under that scope is kept, as any pick on the map.
  L.B.openPage('tight'); L.B.setMode('full'); L.open(null, { ref: 'plant:Lakeview' }); L.at.tab = 'dca'; L.calls.length = 0;
  L.click('[data-ws-back]');
  assert.deepEqual([L.B.view(), L.calls.length], ['dca:timing', 0]);
  const ws = src('js/workspaces.js');
  assert.match(ws, /if \(e\.target\.closest\('\[data-ws-backpage\]'\)\) \{ const h = cur && hostAt\(cur\); openPage\(cur \|\| page \|\| 'home', \{ keep: !!h && !scopeOverview\(h\.page\) \}\); return; \}/);
  assert.match(ws, /const hostAt = id => hostOf\(id, \{ site: devOpen\(\) \}\);/, '(6b: the site’s map views too, with a development open)');
  assert.match(ws, /data-ws-back>← Back to \$\{esc\(backTo\.ws \? `\$\{pageName\(backTo\.ws\)\} \(map\)` : hostPage\(backTo\.page\) \? `\$\{pageName\(backTo\.page\)\} › \$\{viewName\(backView\(\)\)\}` : pageName\(backTo\.page\)\)\}/, '“← Back to Home › Servicing › Network”');
  assert.match(ws, /if \(mode === 'full' && backTo && backTo\.page && hostPage\(backTo\.page\)\) renderBack\(true\);/, 'the label follows a pick on the full map');
  // A development picked while Home is open (any of its views) opens its page (§5 row 25).
  assert.match(ws, /mode === 'home' && \(page === 'home' \|\| page === 'study'\)\) \{ exploreDev = sc; setTimeout\(\(\) => openPage\('site'\), 0\); \}/);
  // Start over and Home's buttons land on its Overview.
  assert.match(src('js/topbar.js'), /if \(root\.PeelWorkspaces && root\.PeelWorkspaces\.openPage\) root\.PeelWorkspaces\.openPage\('home'\);/);
  assert.match(ws, /if \(e\.target\.closest\('\[data-ws-home\]'\)\) \{ openPage\('home'\); return; \}/);
  // A share link: the page host writes the map's tab (its own) and nav=3 (the share test above has the rules).
  assert.match(src('js/share.js'), /set\('nav', '3'\);/);
  // The page ids that are gone as builders: no What's coming page of its own, no section of a page to set.
  assert.doesNotMatch(src('js/ws-pages.js'), /const coming = |sectionAt|wsSection|areaSection|data-ws-asec|data-ws-wsec/);
  assert.doesNotMatch(src('js/sections.js'), /\bAREA = |areaSpecFor|wsSpecFor|servicing: \{ host|capital: \{ host/);
  // (6a-S6) The pages' and the workspace bar's "Filters on" row is the top bar trail's "k filters" (no link or stored
  // preference named it), and the drill's crumbs and Up a level are the trail's steps.
  assert.doesNotMatch(src('js/workspaces.js') + src('index.html'), /filterChipsHTML|id="ws-filters"/);
  assert.doesNotMatch(src('js/ws-pages.js'), /Up a level|const crumbs = /);
  assert.match(src('js/topbar.js'), /PT\.areaPath\(a\.id\)\.slice\(0, -1\)/);
});
test('phase 6a: a view picked on Home’s strip is the start screen’s last workspace, as the old bars’ page buttons were', () => {
  // (Settings › Start screen = Last place: for a browser with no place stored yet its alias, lastWs, the strip's
  // Growth › Forecast reopening the Forecast, as the area bar's data-ws-page="outlook" did; owner decision 17)
  const L = loadWs(); L.B.openPage('growth'); assert.equal(L.store.get('lastWs'), 'growth');
  for (const [tab, sub, lw] of [['growth', 'timing', 'outlook'], ['dca', 'eas', 'eaflow'], ['dca', 'timing', 'projects'], ['svc', 'capacity', 'tight'], ['growth', 'areas', 'growth']]) {
    L.click('#home [data-pg-tab]', { pgTab: tab, pgSub: sub });
    assert.deepEqual([L.B.view(), L.store.get('lastWs')], [`${tab}:${sub}`, lw], `${tab}:${sub}`);
  }
  // A view that is no workspace leaves it as it was: Servicing › Network, Growth › Pipeline and Overview (none before
  // either), Records' (Data sources is a Reference page, which the last workspace never named: it reopens Servicing capacity).
  for (const [tab, sub] of [['svc', 'network'], ['growth', 'pipeline'], ['overview', undefined], ['records', 'sources'], ['records', 'checks'], ['dca', 'projects']]) {
    L.click('#home [data-pg-tab]', { pgTab: tab, pgSub: sub });
    assert.equal(L.store.get('lastWs'), 'growth', `${tab}:${sub || ''}`);
  }
  // The reload: the start screen reopens it, Home at its view.
  for (const [lw, view] of [['outlook', 'growth:timing'], ['eaflow', 'dca:eas']]) {
    assert.deepEqual(plain(W.startScreen({ pref: 'last', last: lw })), { mode: 'home', page: lw });
    const R = loadWs({ lastWs: lw }); R.B.openPage(lw); assert.equal(R.B.view(), view, lw);
  }
});

// Navigation phase 6c (design §3.4 "WS BAR ← Page · search · Full map (the 12 task chips go; w=<chip> applies its LAYERS
// preset once)", §5 rows 16, 18, 22, 45, 63): Explore's views bar, the task chips under a map view's search and each
// panel's source line go; every #w=<id> link still opens its map view at its tab and view, with its layer preset and
// only its layers; the two Find steps linked to each other (until phase 7's Find, which lists both steps' files: Review
// an FSR's step links back to it); This week is one spec. (Old pipes as Servicing › Old pipes, svc:pipes: its own
// test, below.)
test('phase 6c: no views bar, task chips or source line; a #w=<id> link still opens its map view, at its view with its layers; Find lists both steps’ files, Review an FSR’s step links back', () => {
  for (const w of W.WS) {
    assert.deepEqual(plain(W.startScreen({ hash: `#w=${w.id}` })), { mode: 'ws', ws: w.id }, `#w=${w.id}`);
    const views = [], layers = [], L = loadWs({}, { PeelMapAnalysis: { showView: v => views.push(v), rememberCurrent() {}, currentView: () => 'planning' }, PeelLayerGroups: { apply: x => layers.push([...x]) } });
    L.B.go(w.id, { quiet: true, noDraw: true });
    const p = W.plan(w.id);
    assert.deepEqual(L.calls, [...(p.sub ? [['setSub', p.tab, p.sub]] : []), ['setFootPref', p.tab], ['showFootTab', p.tab], ...(p.fold ? [['openFold', p.fold]] : [])], `${w.id}: its tab and view`);
    assert.deepEqual(plain([views, layers]), [[p.view], [W.LAYERS[w.id]]], `${w.id}: its preset, only its layers`);
    assert.deepEqual([L.B.mode(), L.B.current(), L.store.get('lastWs')], ['ws', w.id, w.id]);
    assert.ok(!('source' in p), `${w.id}: no source line`);
  }
  // Gone, no producer left (removed by design): the views bar (viewsHTML, m.views, .page-views), the chips (renderChips,
  // #ws-chips, .ws-chip), the source line (srcLine, sourceText, plan().source, .pnl-src), workspaces.js's weekSpec.
  assert.equal(W.sourceText, undefined);
  // (and a result's header, js/overview-tab.js resultHost: no source line, no rebuild as the map view changes)
  assert.doesNotMatch(src('js/workspaces.js') + src('js/panel.js') + src('js/overview-tab.js'), /viewsHTML|m\.views|renderChips|ws-chips|srcLine|sourceText|pnl-src|function weekSpec/);
  assert.doesNotMatch(src('js/overview-tab.js'), /wsNow|host\.dataset\.ws\b/);
  assert.doesNotMatch(src('js/ws-pages.js'), /m\.views|page-views/);
  assert.doesNotMatch(src('index.html'), /id="ws-chips"/);
  assert.doesNotMatch(src('css/app.css'), /\.page-views|\.ws-chips?\b|\.pnl-src|\.pnl-steps\b/);
  assert.match(src('index.html'), /data-ws-backpage title="Back to the page, at the same tab and view">← Page<\/button><div class="ws-search" id="ws-search"><\/div><button type="button" class="btn small ws-fullbtn" data-ws-full/);
  // The Find steps: Review an FSR's links back to Find, which lists its files too since navigation phase 7 (Check a
  // site's link to Review an FSR's list went, removed by design, §3.3: one Find); a click opens it.
  const vm = require('node:vm');
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelPanel: { get: () => null, scenarioChip: () => '' }, PeelAnalysisTabs: { TAB_KEYS: AT.TAB_KEYS, chipsAt: AT.chipsAt, tabReady: () => true, viewKey: () => 'overview:' },
    PeelWorkspaces: { BY_ID: { site: { label: 'Check a site' }, fsr: { label: 'Review an FSR' } }, TAB_NAME: W.TAB_NAME, tabPath: W.tabPath, chipName: W.chipName }, PeelApp: { state: { projects: [], filtered: [] } }, DevScope: { current: () => null } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of ['js/sections.js', 'js/ws-pages.js']) vm.runInNewContext(src(f), ctx);
  const other = id => (/<button type="button" class="btn small link pnl-step-other" data-ws-page="(\w+)">([^<]+)<\/button><\/p>$/.exec(window.PeelWsPages.build(id).top) || []).slice(1);
  assert.deepEqual(other('site'), []);
  assert.deepEqual(other('fsr'), ['find', 'Any development → Find']);
  const L = loadWs(); L.B.openPage('site'); L.click('[data-ws-page]', { wsPage: 'fsr' });
  assert.deepEqual([L.B.page(), L.B.view()], ['fsr', null], 'Review an FSR’s Find step');
  L.click('[data-ws-page]', { wsPage: 'find' }); assert.deepEqual([L.B.page(), L.B.view()], ['site', null], 'and back to Find');
  // The FSR reviewer's Find › Files with an FSR posted (data-ws-fresh, ROLES) with a development open: it closes, Review an
  // FSR's Find step opens (its files first), as the sidebar's Find; Check FSR's own fsr keeps it, at its FSR review.
  const p = { key: 'Brampton|1 MAIN ST' };
  L.open(p, null); L.click('[data-ws-page]', { wsPage: 'fsr', wsFresh: '' });
  assert.deepEqual([L.B.page(), L.B.view(), L.closed, L.store.get('lastWs')], ['fsr', null, ['dev'], 'fsr'], 'the shortcut: the Find step, no development');
  L.closed.length = 0; L.open(p, null); L.click('[data-ws-page]', { wsPage: 'fsr' });
  assert.deepEqual([L.B.page(), L.B.view(), L.closed], ['site', 'svc:fsr', []], 'Check FSR: the development kept, at FSR review');
  L.click('[data-ws-page]', { wsPage: 'fsr', wsFresh: '' }); assert.deepEqual([L.B.page(), L.B.view(), L.closed], ['fsr', null, ['dev']]);
  L.closed.length = 0; L.click('[data-ws-page]', { wsPage: 'fsr', wsFresh: '' }); assert.deepEqual([L.B.page(), L.closed], ['fsr', []], 'none open: nothing to close');
});

// Navigation phase 6c-S3 (design §3.4, §3.5, §5 rows 9, 21, 38, 104, 136, §7.1–7.2): Old pipes is Servicing › Old pipes
// (svc:pipes), an area's view, hidden at a development (Network there, the pick back at an area). The page id `pipes`
// (#w=p:pipes, the sidebar's Old pipes, Help's role buttons, the stored last workspace) opens Home at it; #w=pipes opens
// the map view there (its amber layer); t=svc&svs=pipes is a link's and a stored pick's value.
test('phase 6c: Old pipes is Servicing › Old pipes; the page id, the map view, a link and a stored pick land there', () => {
  assert.deepEqual(plain(AT.migrateTabKey('svc', 'pipes')), { tab: 'svc', svcSub: 'pipes' });
  assert.deepEqual(plain(AT.migrateSub('svc', 'pipes')), { tab: 'svc', sub: 'pipes' });
  assert.deepEqual(plain(AT.chipsAt('svc', 'area')), ['capacity', 'network', 'pipes']);
  assert.deepEqual(plain(AT.chipsAt('svc', 'site')), ['network', 'fsr'], 'a development: no Old pipes chip');
  assert.equal(AT.subFor('svc', 'pipes', true), 'network'); assert.equal(AT.subFor('svc', 'pipes', false), 'pipes');
  assert.ok(AT.TABSUBS.svc.valid.length <= 4, 'four at most (tests/four-tabs.test.js)');
  // A stored pick (or a link's svs=pipes): Old pipes at Peel, Network at a development, Old pipes again after.
  let site = null;
  const T = loadTabsWith({ svcSub: 'pipes', footTab4: 'svc' }, { DevScope: { current: () => site } });
  T.showFootTab('svc'); assert.equal(T.getSvcSub(), 'pipes');
  site = { key: 'Brampton|1 MAIN ST' }; T.showFootTab('svc'); assert.equal(T.getSvcSub(), 'network', 'at a development: Network');
  site = null; T.showFootTab('svc'); assert.equal(T.getSvcSub(), 'pipes', 'back at an area: Old pipes again');
  // The page id: Home at Servicing › Old pipes; the map view's own tab and view; the name the chip's.
  assert.deepEqual(plain(W.hostOf('pipes')), { page: 'home', tab: 'svc', sub: 'pipes', fold: null });
  assert.deepEqual(plain(W.hostOf('pipes', { site: true })), { page: 'home', tab: 'svc', sub: 'pipes', fold: null });
  assert.equal(W.plan('pipes').sub, 'pipes'); assert.equal(W.plan('pipes').tab, 'svc');
  assert.equal(W.tabPath('svc', 'pipes'), 'Servicing › Old pipes'); assert.equal(W.chipName('svc', 'pipes'), 'Old pipes');
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:pipes' })), { mode: 'home', page: 'pipes' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=pipes' })), { mode: 'ws', ws: 'pipes' });
  // (a link made in its map view before 6c carried Servicing › Network, where its panel sat: js/share.js reads it as
  // Old pipes, the view it showed; a link to another map view keeps its Network)
  assert.match(src('js/share.js'), /const svs = w === 'pipes' && t === 'svc' && q\.get\('svs'\) === 'network' \? 'pipes' : q\.get\('svs'\);\n {8}const oldSub = [^\n]*t === 'svc' \? svs : /);
  // A link's tab and view as js/share.js ready() reads them (its own lines; Home open at the page the link names, as init
  // leaves it): a link copied on Old pipes' page in 6a or 6b (nav=3, the map's Servicing › Network behind the page) opens
  // Home at Servicing › Old pipes whatever tab it carried, as an older one does; Home's own and an area page's nav=3
  // links (a host's view since 6a) keep theirs.
  const sh = src('js/share.js'), a = sh.indexOf('      const W = window.PeelWorkspaces, nv ='), b = sh.indexOf("      if (q.get('t') || pageWs) {", a);
  const c = sh.indexOf('        const t = pageWs', b), d = sh.indexOf('        const m = AT().migrateTabKey(t, oldSub);', c);
  assert.ok(a > 0 && b > a && c > b && d > c, 'js/share.js ready(): the lines read');
  const read = new Function('window', 'q', 'AT', `${sh.slice(a, b)}if (!(q.get('t') || pageWs)) return null;\n${sh.slice(c, d)}return AT.migrateTabKey(t, oldSub);`);
  const linkAt = (hash, mode = 'home') => plain(read({ PeelWorkspaces: { ...W, mode: () => mode, page: () => (mode === 'home' ? 'home' : null) }, PeelUtil: { store: { get: (k, dflt) => dflt } } }, new URLSearchParams(hash), AT));
  for (const h of ['w=p:pipes&nav=3&t=svc&svs=network', 'w=p:pipes&nav=3&t=svc&svs=capacity', 'w=p:pipes&nav=3&t=overview', 'w=p:pipes&nav=3&t=growth&gs=areas', 'w=p:pipes&nav=2&t=svc&svs=network', 'w=p:pipes'])
    assert.deepEqual(linkAt(h), { tab: 'svc', svcSub: 'pipes' }, h);
  assert.deepEqual(linkAt('w=home&nav=3&t=svc&svs=network'), { tab: 'svc', svcSub: 'network' }, 'Home at Network: Network');
  assert.deepEqual(linkAt('w=p:tight&nav=3&t=svc&svs=network'), { tab: 'svc', svcSub: 'network' }, 'an area page at Network (a host view since 6a): Network');
  assert.deepEqual(linkAt('w=home&nav=3&t=svc&svs=pipes'), { tab: 'svc', svcSub: 'pipes' });
  assert.deepEqual(linkAt('w=pipes&nav=3&t=svc&svs=network', 'ws'), { tab: 'svc', svcSub: 'pipes' }, 'the map view’s older link: Old pipes');
  assert.deepEqual(linkAt('w=tight&nav=3&t=svc&svs=network', 'ws'), { tab: 'svc', svcSub: 'network' }, 'another map view’s: Network');
  assert.deepEqual(plain(W.startScreen({ pref: 'last', last: 'pipes' })), { mode: 'home', page: 'pipes' });
  assert.equal(require('../js/sections.js').VIEWS.area['svc:pipes'].page, 'pipes', 'Home’s view: the Old pipes builder');
  // The browser half: openPage, the last workspace, the strip's pick, the map view (no override: the view's own panel).
  let L = loadWs();
  L.B.openPage('pipes');
  assert.deepEqual([L.B.page(), L.B.view(), L.store.get('lastWs')], ['home', 'svc:pipes', 'pipes']);
  assert.deepEqual(L.calls, [['setSub', 'svc', 'pipes'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]);
  L = loadWs(); L.B.openPage('home'); L.click('#home [data-pg-tab]', { pgTab: 'svc', pgSub: 'pipes' });
  assert.deepEqual([L.B.view(), L.store.get('lastWs')], ['svc:pipes', 'pipes'], 'the strip’s Old pipes: the start screen’s last workspace');
  L = loadWs({ lastWs: 'pipes' }); L.B.openPage('pipes'); assert.equal(L.B.view(), 'svc:pipes', 'a reload with Last workspace');
  L.calls.length = 0; L.B.go('pipes', { quiet: true });
  assert.deepEqual(L.calls, [['setSub', 'svc', 'pipes'], ['setFootPref', 'svc'], ['showFootTab', 'svc']], '#w=pipes: the map view at Servicing › Old pipes');
  assert.equal(L.B.override('svc:pipes', 'area'), null); assert.equal(L.B.override('svc:network', 'area'), null, 'no Network filtered to old pipes any more');
  // ← Page from it: Home at the map's tab and view (a host's view, as Servicing capacity's).
  L.at.subs.svc = 'network'; L.calls.length = 0; L.click('[data-ws-backpage]');
  assert.deepEqual([L.B.page(), L.B.view(), L.calls.length], ['home', 'svc:network', 0]);
  // Gone (removed by design, §5 row 21): the pipesSpec override on Network, the layer tied to the map view.
  assert.doesNotMatch(src('js/workspaces.js'), /cur === 'pipes' && key === 'svc:network'|pipesLayer\(id === 'pipes'\)|cur === 'pipes' && e\.detail/);
  assert.match(src('index.html'), /data-svcsub="network">Network<\/button>\n\s+<button type="button" class="btn small" data-svcsub="pipes">Old pipes<\/button>/);
  assert.match(src('index.html'), /<section class="f-pane svc-pane" id="pane-svc-pipes" data-pane="svc" data-sub="pipes" role="tabpanel" aria-labelledby="ftab-svc" hidden><div class="tb-head"><h2 class="sr">Old pipes<\/h2><\/div><div id="pipes-body"><\/div><\/section>/);
});

// Navigation phase 7 (design §3.2, §3.7, §5 rows 3–14 and 157, §7.1, §7.3; owner decisions 5, 6 and 17): Home's sidebar
// is five entries (Home · This week · Find · Help · Full map), then For your role's shortcuts from one ROLES list of six,
// and Labs. The old entries' ids (Explore, Servicing capacity, What's coming, Capital, Review outlets, Old pipes,
// Reference), Help's role buttons, the stored role and the start screen's Last workspace land where they did; Last place
// reopens the page's place (the browser half below; kept as each page is drawn: page-host's Last place test).
test('phase 7: Home’s sidebar is five entries; its old entries, Help’s role buttons and the stored role and start screen land where they did; Last place', () => {
  const S = require('../js/sections.js');
  assert.deepEqual(plain(W.SIDEBAR.map(e => e[0])), ['home', 'week', 'find', 'help']);
  for (const [id, what] of W.SIDEBAR) { assert.ok(isPage(W.resolvePage(id, {})), `${id}: a page or an alias to one`); assert.ok(what, id); }
  // Every old sidebar id (the team groups', Explore's, Capital's, Reference's): a page, an area page's at its view of Home.
  const OLD = { explore: ['site', null], tight: ['tight', 'svc:capacity'], coming: ['coming', 'growth:timing'], capital: ['projects', 'dca:timing'], outlets: ['outlets', null], pipes: ['pipes', 'svc:pipes'], reference: ['help', null] };
  const old = [...W.GROUPS.flatMap(g => g[1]), ...Object.keys(W.SIDE).filter(id => id !== 'find')];
  assert.deepEqual([...new Set(old)].sort(), Object.keys(OLD).sort());
  for (const id of old) {
    const p = W.resolvePage(id, {}), h = W.hostOf(p);
    assert.ok(isPage(p), `${id} → a page`);
    assert.deepEqual([p, h ? `${h.tab}:${h.sub}` : null], OLD[id], id);
    if (h) assert.equal(h.page, 'home', `${id}: a view of Home`);
  }
  assert.equal(W.hostOf('coming').fold, 'period', 'What’s coming: the Forecast, By period open');
  // Help's role buttons (until phase 7) named page ids: each still lands on a page.
  for (const id of ['site', 'fsr', 'tight', 'home', 'projects', 'growth', 'study', 'week', 'pipes']) assert.ok(isPage(W.resolvePage(id, {})), id);
  // One ROLES list (owner decision 6): the tour's five stored values unchanged, QA/QC added; up to three shortcuts each, in
  // the owner's names; each a page id (through the alias layer), a view of Home or a button's own handler.
  assert.deepEqual(plain(W.ROLES.map(r => r.key)), ['engineer', 'manager', 'growth', 'capital', 'fsr', 'qa']);
  assert.deepEqual(plain(W.ROLES.map(r => r.links.map(l => l.page || l.at || Object.entries(l.attrs).map(e => e.join('=')).join('&')))), [
    ['find', 'tight', 'svc:network'], ['data-ws-page=projects&data-dc-status=gap', 'tight', 'data-pnl-brief='], ['coming', 'data-ws-go=study', 'growth'],
    ['projects', 'eaflow', 'pipes'], ['fsr', 'week', 'tight'], ['outlets', 'records:checks', 'data']]);
  assert.equal(W.ROLES.find(r => r.key === 'qa').links[0].label, 'Review outlets', 'QA/QC: Review outlets first (owner decision 5)');
  // The FSR reviewer's Find › Files with an FSR posted: Review an FSR's Find step with no development open (data-ws-fresh,
  // openPage's o.fresh, as the sidebar's Find), the one fresh shortcut: the page id fsr itself (Check FSR, a link with
  // d=) keeps a development, at its FSR review.
  assert.deepEqual(plain(W.ROLES.flatMap(r => r.links).filter(l => l.fresh).map(W.roleAttrs)), [{ 'data-ws-page': 'fsr', 'data-ws-fresh': '' }]);
  assert.equal(W.ROLES.find(r => r.key === 'fsr').links[0].label, 'Find › Files with an FSR posted');
  const html = src('index.html'), TAB = { Growth: 'growth', Servicing: 'svc', Capital: 'dca', Records: 'records' };
  const chips = tab => { const i = html.indexOf('f-subtabs', html.indexOf(`data-pane="${tab}" hidden role="group"`) - 80); return [...html.slice(i, html.indexOf('</div>', i)).matchAll(/data-(?:gsub|svcsub|dcasub|rsub)="\w+">([^<]+)</g)].map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s*Labs$/, '').trim()); };
  for (const r of W.ROLES) {
    assert.ok(r.label && r.what && r.links.length >= 1 && r.links.length <= 3, r.key);
    for (const l of r.links) {
      const a = W.roleAttrs(l);
      for (const k of Object.keys(a)) assert.ok(['data-ws-page', 'data-ws-at', 'data-ws-fresh', 'data-ws-go', 'data-dc-status', 'data-pnl-brief'].includes(k), `${l.label}: ${k}`);
      assert.ok(a['data-ws-page'] || a['data-ws-go'] || a['data-pnl-brief'] != null, `${l.label}: opens something`);
      if (a['data-ws-page']) assert.ok(isPage(W.resolvePage(a['data-ws-page'], {})), l.label);
      if (a['data-ws-at']) { assert.equal(a['data-ws-page'], 'home', l.label); assert.ok(Object.keys(S.VIEWS.area).includes(a['data-ws-at']), l.label); }
      if (a['data-ws-go']) assert.ok(W.BY_ID[a['data-ws-go']], l.label);
      for (const [, tab, sub] of l.label.matchAll(/\b(Growth|Servicing|Capital|Records) › ([A-Z][A-Za-z&]*(?: [a-z&][a-z]*)*)/g)) assert.ok(chips(TAB[tab]).some(c => sub.startsWith(c)), `${l.label}: "${tab} › ${sub}" is a chip`);
    }
  }
  // The start screen: Last place (owner decision 17), its stored value 'last' unchanged.
  assert.deepEqual(plain(W.START), [['home', 'Home'], ['last', 'Last place'], ['full', 'Full map']]);
  // No place stored: the last workspace's rule (Last place's alias, lastWs), for each of the 12 and a retired id.
  for (const w of W.WS) assert.deepEqual(plain(W.startScreen({ pref: 'last', last: w.id, place: null })), { mode: 'home', page: w.id }, `lastWs ${w.id}`);
  assert.deepEqual(plain(W.startScreen({ pref: 'last', last: 'retired-id' })), { mode: 'home', page: 'tight' });
  // A place: its page at its view, the place itself for the browser to restore (its filter, its development).
  const site = { page: 'site', view: 'svc:network', d: 'Brampton|1 MAIN ST', mu: '', sp: '' };
  assert.deepEqual(plain(W.startScreen({ pref: 'last', last: 'pipes', place: site })), { mode: 'home', page: 'site', at: 'svc:network', place: site });
  assert.deepEqual(plain(W.startScreen({ pref: 'last', place: { page: 'home', view: 'growth:areas', mu: 'Caledon', sp: '' } })), { mode: 'home', page: 'home', at: 'growth:areas', place: { page: 'home', view: 'growth:areas', d: null, mu: 'Caledon', sp: '' } });
  assert.deepEqual(plain(W.startScreen({ pref: 'last', place: { page: 'week', view: null } })), { mode: 'home', page: 'week', place: { page: 'week', view: null, d: null, mu: '', sp: '' } }, 'a page that is no host: no view');
  // Anything else stored is no place: the lastWs rule.
  for (const bad of [{ page: 'help' }, { page: 'sewer' }, { page: 'nonsense' }, { page: '__proto__' }, { page: 'constructor' }, { page: 'site', view: 'x' }, { page: 'site', view: 'map:x' }, { page: 'site', d: 5 }, { page: 'home', mu: 'x'.repeat(201) }, 7, 'site', null, [], undefined])
    assert.deepEqual(plain(W.startScreen({ pref: 'last', last: 'outlook', place: bad })), { mode: 'home', page: 'outlook' }, JSON.stringify(bad));
  assert.equal(W.lastPlaceOf(JSON.parse('{"page":"home","__proto__":{"view":"svc:x"}}')).view, null);
  // A link wins over a place, and the place is read only for Last place.
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:tight', pref: 'last', place: site })), { mode: 'home', page: 'tight' });
  assert.deepEqual(plain(W.startScreen({ hash: '#t=census', pref: 'last', place: site })), { mode: 'full' });
  assert.deepEqual(plain(W.startScreen({ pref: 'home', place: site })), { mode: 'home', page: 'home' });
  assert.deepEqual(plain(W.startScreen({ pref: 'full', place: site })), { mode: 'full' });

  // The browser half: init opens the place's page at its view at once (a view of the host, held "loading" until its
  // data lands), then its place filter and its development once the developments are in (the first pnl:set, or
  // js/app.js applyFilters' bootRestore); a development that no longer resolves gives the page without it.
  const start = (lastPlace, ex = {}, stored = {}, glob = {}) => {
    const shown = [], drills = [], st = { projects: [], muni: '', sp: [] }; let R = null;
    // (ex.pnlOnShow: each tab shown sets the panels at once, a pnl:set, as js/panel.js sync does in the app)
    R = loadWs({ startScreen: 'last', lastPlace, ...stored }, { PeelApp: { state: st }, PeelDevNav: { projectByKey: k => (k === 'k' ? { key: 'k' } : null), showDetail: q => { shown.push(q.key); R.open(q); } }, PeelWsPages: { drillTo: x => drills.push(x) }, ...ex, onShowTab: ex.pnlOnShow ? t => R.pnlSet({ key: `${t}:`, scope: 'area' }) : null }, glob);
    R.B.init(); return Object.assign(R, { shown, drills, st });
  };
  let L = start({ page: 'site', view: 'svc:network', d: 'k', mu: '', sp: '' });
  assert.deepEqual([L.B.page(), L.calls], ['site', [['setSub', 'svc', 'network'], ['setFootPref', 'svc'], ['showFootTab', 'svc']]], 'its page at its view (the Find step until its development is open)');
  L.pnlSet({ key: 'overview:', scope: 'area' }); assert.deepEqual(L.shown, [], 'nothing before the developments are in');
  L.st.projects = [{}]; L.calls.length = 0; L.pnlSet({ key: 'overview:', scope: 'area' });
  assert.deepEqual([L.shown, L.calls, L.B.page(), L.B.view()], [['k'], [['showFootTab', 'svc']], 'site', 'svc:network'], 'then its development (its Overview first, as a link’s d=), at its view');
  L.pnlSet({ key: 'overview:', scope: 'dev:k' }); L.B.bootRestore(); assert.deepEqual(L.shown, ['k'], 'once');
  // (a development that no longer resolves, a regroup: the page without it, as it opens with none, no error)
  L = start({ page: 'site', view: 'svc:network', d: 'gone', mu: '', sp: '' }); L.st.projects = [{}]; L.calls.length = 0; L.B.bootRestore();
  assert.deepEqual([L.shown, L.B.page(), L.B.view(), L.calls], [[], 'site', null, [['showFootTab', 'overview']]], 'gone: Check a site’s Find step');
  L = start({ page: 'fsr', view: 'svc:fsr', d: 'gone', mu: '', sp: '' }); L.st.projects = [{}]; L.calls.length = 0; L.B.bootRestore();
  assert.deepEqual([L.shown, L.B.page(), L.calls], [[], 'fsr', [['setSub', 'svc', 'network'], ['showFootTab', 'svc']]], 'gone: Review an FSR’s Find step');
  // Home at a view and a municipality: the filter once, as the trail's step sets it. (init's own tab shown sets the
  // panels, a pnl:set, before its page is: not "another page opened meanwhile")
  L = start({ page: 'home', view: 'growth:areas', mu: 'Caledon', sp: '' }, { pnlOnShow: true });
  assert.deepEqual([L.B.page(), L.B.view(), L.calls], ['home', 'growth:areas', [['setSub', 'growth', 'areas'], ['setFootPref', 'growth'], ['showFootTab', 'growth']]]);
  L.st.projects = [{}]; L.B.bootRestore(); L.B.bootRestore(); assert.deepEqual(L.drills, ['m:Caledon']);
  // One plan: once the areas are in (20 s at most), the plan if it still exists, else its municipality.
  const PA = { areaById: new Map([['bw', { id: 'bw', municipality: 'Brampton' }]]) };
  L = start({ page: 'home', view: 'overview:', mu: 'Brampton', sp: 'bw' }, { PeelPlanAreas: PA }); L.st.projects = [{}];
  L.B.bootRestore(); assert.deepEqual(L.drills, [], 'waits for the areas');
  L.st.areas = {}; L.B.bootRestore(); assert.deepEqual(L.drills, ['a:bw']);
  L = start({ page: 'home', view: 'overview:', mu: 'Brampton', sp: 'old-plan' }, { PeelPlanAreas: PA }); L.st.projects = [{}]; L.st.areas = {};
  L.B.bootRestore(); assert.deepEqual(L.drills, ['m:Brampton'], 'a plan that no longer exists: its municipality');
  // (a plan whose areas never land: 20 s after init the place without it, at its municipality, once)
  let t = 1e12; const clock = { Date: class extends Date { static now() { return t; } } };
  L = start({ page: 'home', view: 'overview:', mu: 'Brampton', sp: 'bw' }, { PeelPlanAreas: PA }, {}, clock); L.st.projects = [{}];
  t += 19999; L.B.bootRestore(); assert.deepEqual(L.drills, [], 'the areas waited for, 20 s at most');
  t += 1; L.B.bootRestore(); assert.deepEqual([L.drills, L.B.page()], [['m:Brampton'], 'home'], 'then its municipality');
  L.st.areas = {}; L.B.bootRestore(); assert.deepEqual(L.drills, ['m:Brampton'], 'once: the areas landing late change nothing');
  // Another page opened before the data is in: that is where the reader is, nothing restored.
  L = start({ page: 'site', view: 'svc:network', d: 'k', mu: 'Caledon', sp: '' }); L.B.openPage('help'); L.st.projects = [{}]; L.B.bootRestore();
  assert.deepEqual([L.shown, L.drills, L.B.page()], [[], [], 'help']);
  // Only the old lastWs (Last workspace's): its page as it opened it, Home at the Forecast; a place that is none, the same.
  for (const lastPlace of [undefined, { page: 'help' }]) {
    L = start(lastPlace, {}, { lastWs: 'outlook' });
    assert.deepEqual([L.B.page(), L.B.view()], ['home', 'growth:timing'], `lastWs outlook, place ${JSON.stringify(lastPlace)}`);
  }
  L = start({ page: 'site', view: 'svc:network', d: 'k' }, {}, { startScreen: 'home' }); assert.deepEqual([L.B.page(), L.B.view()], ['home', 'overview:'], 'Home as the start screen: no place read');

  // Help's bar's Data sources and Data checks (§5 row 166): Home's Records tab, from Start here's links and the QA/QC
  // role (data-ws-at), and the old page id's links, as before.
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:data' })), { mode: 'home', page: 'data' });
  assert.deepEqual(plain(W.hostOf('data')), { page: 'home', tab: 'records', sub: 'sources', fold: null });
  for (const v of ['records:sources', 'records:checks']) {
    L = loadWs(); L.open({ key: 'k' }); L.B.openPage('home', { at: v });
    assert.deepEqual([L.B.page(), L.B.view(), L.closed, L.calls.at(-1)], ['home', v, ['dev'], ['showFootTab', 'records']], `Help › Start here's ${v}`);
  }
  const tips = src('js/tips.js'), sec = src('js/sections.js');
  assert.match(tips, /data-ws-page="home" data-ws-at="records:sources">Records › Sources<\/button> · <button type="button" class="btn small link" data-ws-page="home" data-ws-at="records:checks">Records › Data checks</);
  assert.doesNotMatch(sec, /at: 'records:/, 'no longer Help’s bar');
  // The old role lists and ASKS (one ROLES list, the views' ASK), the ⚙ menu (one Settings sheet; its Change log is Help ›
  // What's new; Labs a section of the sheet) and the Settings pointers (Counting, Records) go; the number conventions
  // are How the app decides'.
  assert.doesNotMatch(tips, /TOUR_ROLES|const ROLES = |const ASKS = /);
  assert.doesNotMatch(src('js/topbar.js'), /data-tbg=|renderGearMenu/);
  assert.match(tips, /data-help-log>What's new: the change log<\/button>/);
  assert.doesNotMatch(src('js/growth-ui.js'), /set-counting|rec-settings|numberConventionsHTML/);
  assert.match(src('js/logic.js'), /id="lg-numbers"/);
  // (the stored role: the same key in the one list; the start screen's stored 'last' unchanged, now Last place)
  assert.deepEqual(plain(W.START.find(x => x[0] === 'last')), ['last', 'Last place']);
});

// Navigation phase 8a (design §3.5, §5 row 153, §7.2): every scope kind has its row of views. A servicing scope
// shows Growth › Pipeline · Forecast, Servicing › Capacity · Network · Old pipes, Capital › DC timing and its own
// Records; a drawn area has no Records tab. A link's or a stored pick the scope leaves out shows the first view
// it has there and comes back at an area (or, Files and FSR review, at a development); an old ss=iiblock: link opens
// the block's servicing scope.
function loadTabsAt(stored = {}, extra = {}, ready = true) {
  const store = { get: (k, d) => (Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : d), set: () => {} };
  // (a document whose querySelector answers tabReady's selector: every tab's button there and its data in)
  const q = sel => (ready && /^\.f-tab\[data-tab="\w+"\]:not\(\[hidden\]\):not\(\[aria-busy\]\)$/.test(sel) ? {} : null);
  const document = { querySelector: q, querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document, PeelDcaTab: {}, ...extra }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}
test('phase 8a: every scope kind: a servicing scope’s views and Records, a drawn area without Records; ss=iiblock: opens the block’s scope; stored picks come back at an area', () => {
  const views = T => [T.getGSub(), T.getRSub(), T.getDcSub(), T.getSvcSub()];
  let cur = null, dev = null;
  const at = { PeelSvcScope: { current: () => cur, peelWideNote: () => {} }, DevScope: { current: () => dev } };
  // Stored picks the scope leaves out (Growth › Areas, Records › Files, Capital › EAs, Servicing › FSR review).
  let T = loadTabsWith({ gSub: 'areas', rSub: 'files', dcSub: 'eas', svcSub: 'fsr' }, at);
  assert.deepEqual(views(T), ['areas', 'sources', 'eas', 'capacity'], 'at Peel: Files and FSR review are not an area’s');
  cur = { kind: 'plant' }; T.rescope();
  assert.deepEqual(views(T), ['pipeline', 'sources', 'timing', 'capacity'], 'at a plant: Pipeline, its own Sources, DC timing, Capacity');
  for (const k of ['ps', 'block', 'zone', 'wsys']) { cur = { kind: k }; T.rescope(); assert.deepEqual(views(T), ['pipeline', 'sources', 'timing', 'capacity'], k); }
  cur = null; T.rescope();
  assert.deepEqual(views(T), ['areas', 'sources', 'eas', 'capacity'], 'back at Peel: the picks come back');
  dev = { key: 'k' }; T.rescope();
  assert.deepEqual(views(T), ['pipeline', 'files', 'timing', 'fsr'], 'at a development: Files and FSR review come back');
  dev = null; T.rescope();
  assert.deepEqual(views(T), ['areas', 'sources', 'eas', 'capacity']);
  // t=records&rs=checks&ss=plant:…: Records › Data checks at that scope (share.js sets ss before the tab: pinned below).
  cur = { kind: 'plant' };
  T = loadTabsAt({ footTab4: 'records', rSub: 'checks' }, at);
  assert.deepEqual([T.getFootTab(), T.getRSub()], ['records', 'checks']);
  assert.equal(T.scopeKind(), 'svc');
  // A drawn area: no Records tab. A link's or a stored t=records opens Overview, never held; the stored tab unchanged.
  cur = { kind: 'result', rkind: 'sel' };
  T = loadTabsAt({ footTab4: 'records', gSub: 'areas', svcSub: 'pipes', dcSub: 'projects' }, at);
  assert.deepEqual([T.getFootTab(), T.wantedTab(), T.getFootPref()], ['overview', 'overview', 'records']);
  T.showFootTab('records', 'checks');
  assert.deepEqual([T.getFootTab(), T.wantedTab(), T.getRSub()], ['overview', 'overview', 'checks'], 'the pick kept for an area');
  assert.equal(T.scopeKind(), 'drawn');
  T.showFootTab('growth'); assert.deepEqual(views(T), ['pipeline', 'checks', 'timing', 'capacity'], 'gs=areas, svs=pipes, dcs=projects: Pipeline, Capacity, DC timing there');
  T.showFootTab('svc'); assert.equal(T.getFootTab(), 'svc');
  // The selection closes (closeResult → rescope): the open tab again at Peel, with the picks back.
  cur = null; T.rescope();
  assert.deepEqual([T.getFootTab(), ...views(T)], ['svc', 'areas', 'checks', 'projects', 'pipes']);
  // On Overview it stays on Overview (as after any result), the strip back: Records opens again.
  cur = { kind: 'result', rkind: 'sel' }; T.showFootTab('records'); cur = null; T.rescope();
  assert.equal(T.getFootTab(), 'overview'); T.showFootTab('records'); assert.equal(T.getFootTab(), 'records');
  // A cold ss=dr:B12 (a block, station or zone resolves once js/svc-data.js fills the lookup): Peel's views,
  // then loadServicing's rescope turns them to the block's.
  let blk = null;
  T = loadTabsAt({ footTab4: 'growth', gSub: 'areas' }, { PeelSvcScope: { current: () => blk, peelWideNote: () => {} } });
  assert.deepEqual([T.getFootTab(), T.getGSub(), T.scopeKind()], ['growth', 'areas', 'area']);
  blk = { kind: 'block' }; T.rescope();
  assert.deepEqual([T.getFootTab(), T.getGSub(), T.scopeKind()], ['growth', 'pipeline', 'svc']);
  assert.match(src('js/svc-data.js'), /App\(\)\.applyFilters\(\);\n\s+if \(AT\(\)\.rescope\) AT\(\)\.rescope\(\);/);
  // share.js applies ss before it opens the link's tab (so the tab opens at the scope's kind).
  const sh = src('js/share.js');
  assert.ok(sh.indexOf('else App().state.ss = ss; }') > 0 && sh.indexOf('else App().state.ss = ss; }') < sh.indexOf('      AT().showFootTab(AT().getFootPref());'), 'ss before the tab');
  // Every kind's chips: ≤ 4, each a sub-view of its tab; a tab left out has none.
  for (const kind of Object.keys(AT.HIDDEN)) for (const tab of Object.keys(AT.TABSUBS)) {
    const c = plain(AT.chipsAt(tab, kind));
    assert.ok(c.length <= 4 && c.every(v => AT.TABSUBS[tab].valid.includes(v)), `${kind} › ${tab}: ${c}`);
    if (AT.tabOff(kind, tab)) assert.deepEqual(c, [], `${kind} › ${tab} left out`);
  }
  assert.deepEqual(Object.keys(AT.HIDDEN), ['site', 'area', 'svc', 'drawn', 'file', 'object'], '(navigation phase 8b: + object, a card)');
  // ss=iiblock:<n> (an old block link), the blocks layer's tap and [data-block]: the block's servicing scope dr:B<n>
  // once the servicing lookup and the model are in; its card where no servicing area resolves, and on a link's
  // last try while they are still out (the link kept; the scope once the model is built: click-destinations).
  const win = { PeelUtil: require('../js/util.js'), PeelDemand: {}, PeelPhases: {} };
  const sctx = { window: win, document: { addEventListener() {} }, module: undefined, globalThis: {} };
  require('node:vm').runInNewContext(src('js/svc-scope.js'), sctx);
  assert.equal(win.PeelSvcScope.blockRef('12'), 'dr:B12');
  const sc = src('js/svc-scope.js');
  assert.match(sc, /\n {4}iiblock: \(id, last\) => \{\n {6}const ready = App\(\)\.state\.servicing && SD\(\)\.svcById\.size && App\(\)\.state\.svcModel, ref = blockRef\(id\);\n {6}if \(ready && resolve\(ref\)\) \{ open\(ref\); return true; \}\n {6}if \(!ready && !last\) return false;\n {6}if \(!ST\(\) \|\| !ST\(\)\.showBlock\) return true;\n {6}const r = ST\(\)\.showBlock\(id, \{ card: true \}\);\n/);
  const st = src('js/sewer-trace.js'), sb = st.slice(st.indexOf('async function showBlock('));
  assert.ok(sb.indexOf('S.blockRef(id)') < sb.indexOf('await '), 'the scope before any wait');
  { const g = sb.indexOf('A.state.svcModel && S.resolve(ref)'); assert.ok(g > 0 && g < sb.indexOf('await '), 'the scope once the model is in, else the card'); }
  assert.match(st, /\.on\('click', ev => \{ L\.DomEvent\.stop\(ev\); showBlock\(b\.id\); \}\)/, 'the blocks layer’s tap');
  assert.match(st, /const bb = e\.target\.closest\('\[data-block\]'\); if \(bb\) showBlock\(bb\.dataset\.block\);/, '[data-block]');
  assert.match(src('js/app.js'), /showBlock: id => window\.PeelSewerTrace\.showBlock\(id\),/, 'App().showBlock');
  // The link it writes: ss=dr:B<n> (a servicing scope's ref, kept as it is); iiblock only for the fallback card.
  assert.match(sh, /!\/\^\(pipe\|file\|dcwork\|iiblock\|ea\|cap\):\/\.test\(App\(\)\.state\.ss\) \? null : App\(\)\.state\.ss\);/);
});

// Navigation phase 8b (design §3.5, §4 #7, §7.2): a file is Overview (its record sheet) and Records (the file); a
// card or a tool's result (a DC project, an EA, a capital project, a pipe, a water facility, a constraint feature,
// Help's) is its Overview alone. A link to one (ss=dcwork:|ea:|cap:|pipe:|file:…, with any t) lands on it, on
// Overview; a tab, a link, Help's Show me, a map view or the lens asking for a tab it leaves out closes it first.
test('phase 8b: a file’s and a card’s scope; old links with any t land on the card; the lens and links leave it', () => {
  // Every result kind, from js/svc-scope.js's own list (a new kind fails here until it has its row).
  const ss = src('js/svc-scope.js'), list = JSON.parse(ss.match(/const RESULT_KINDS = new Set\((\[[^\]]*\])\);/)[1].replace(/'/g, '"'));
  const WANT = { tool: 'object', dcwork: 'object', pipe: 'object', file: 'file', iiblock: 'object', wfac: 'object', sel: 'drawn', help: 'object', cx: 'object', ea: 'object', cap: 'object' };
  assert.deepEqual([...list].sort(), Object.keys(WANT).sort());
  for (const k of list) assert.equal(AT.kindOf({ ss: { kind: 'result', rkind: k } }), WANT[k], k);
  assert.equal(AT.kindOf({ dev: true, ss: { kind: 'result', rkind: 'tool' } }), 'site', 'a result kept at its development: the development’s tabs');
  for (const t of ['growth', 'svc', 'dca', 'records']) assert.equal(AT.tabOff('object', t), true, t);
  // (a file's Servicing is its own view, its flows: on the strip with no chip; 8b review, design §3.5)
  assert.deepEqual(['growth', 'svc', 'dca', 'records'].filter(t => AT.tabOff('file', t)), ['growth', 'dca']);
  assert.deepEqual(['growth', 'svc', 'dca', 'records'].filter(t => AT.ownView(t, 'file')), ['svc']);
  // A link with any t: share.js opens the link's tab at Peel, then restores the result (openResult: Overview), so
  // the card ends on Overview; the tab it names is left out there (a file's Records one tap away); the stored tab
  // is the next visit's; × brings the five tabs back, on Overview as after any result.
  let cur = null, closed = 0;
  const at = { PeelSvcScope: { current: () => cur, peelWideNote: () => {}, hasResult: () => !!(cur && cur.kind === 'result') },
    PeelAerialCheck: { closeDetail: () => { closed++; cur = null; } } };
  for (const [rkind, t, then] of [['dcwork', 'dca', 'overview'], ['ea', 'growth', 'overview'], ['cap', 'svc', 'overview'], ['pipe', 'records', 'overview'], ['file', 'growth', 'overview'], ['file', 'records', 'records'], ['file', 'svc', 'svc']]) {
    const T = loadTabsAt({ footTab4: t }, at);
    assert.equal(T.getFootTab(), t, `${rkind}, t=${t}: the link's tab at Peel first`);
    cur = { kind: 'result', rkind }; T.setFootPref('overview'); T.showFootTab('overview');   // (openResult's two calls)
    assert.equal(T.scopeKind(), WANT[rkind]);
    T.showFootTab(t); assert.deepEqual([T.getFootTab(), T.wantedTab()], [then, then], `${rkind}, t=${t}`);
    cur = null; T.rescope(); assert.equal(T.getFootTab(), then, 'closed: the tab it was on');
    T.showFootTab(t); assert.equal(T.getFootTab(), t, 'the tab again at Peel');
  }
  const sh = src('js/share.js'), ap = sh.indexOf('setTimeout(() => S.restore(ss), 0); }');
  assert.ok(ap > 0 && ap < sh.indexOf('      AT().showFootTab(AT().getFootPref());'), 'the result restored after the link’s tab');
  assert.match(ss, /function openResult\(o\) \{[^]*?AT\(\)\.setFootPref\('overview'\); AT\(\)\.showFootTab\('overview'\);/);
  // The lens (owner decision 9: it still opens its tab), a data-at link, [data-foot-tab]: openTab; at a card the card
  // closes first (× 's close), then the tab; at a file Records and Servicing (its flows) keep it; at Peel or a kept
  // result nothing closes.
  cur = { kind: 'result', rkind: 'dcwork' }; closed = 0;
  let T = loadTabsAt({}, at);
  T.openTab('dca'); assert.deepEqual([closed, T.getFootTab(), cur], [1, 'dca', null], 'Capital lens at a DC project');
  cur = { kind: 'result', rkind: 'file' }; T.showFootTab('overview'); T.openTab('records'); assert.deepEqual([closed, T.getFootTab()], [1, 'records']);
  T.openTab('svc'); assert.deepEqual([closed, T.getFootTab(), cur && cur.rkind], [1, 'svc', 'file'], 'Water lens at a file: its flows, the file kept');
  T.openTab('growth'); assert.deepEqual([closed, T.getFootTab(), cur], [2, 'growth', null], 'Growth at a file: it closes first');
  T.openTab('growth'); assert.equal(closed, 2, 'nothing open: nothing closes');
  assert.match(src('js/topbar.js'), /const tab = \{ dc: 'dca', water: 'svc', wastewater: 'svc' \}\[b\.dataset\.mview\];\n\s+if \(tab && AT\(\) && AT\(\)\.openTab\) AT\(\)\.openTab\(tab\);/);
  const a = src('js/analysis-tabs.js');
  assert.match(a, /function openTab\(tab, sub\) \{\n\s+const r = sub \? migrateSub\(tab, sub\) : null, t = r \? r\.tab : tab;\n\s+leaveFor\(t\);/);
  assert.match(a, /if \(s0\) openFold\(foldOf\(t0, s0\)\);\n\s+leaveFor\(tab\);/, 'a data-at link');
  // (Help's Show me, an EA card's EAs link, a map view's own tab: each leaves the card first)
  assert.match(src('js/tips.js'), /const openAnalysis = \(tab, sub\) => \{ if \(AT\(\)\.leaveFor\) AT\(\)\.leaveFor\(tab\);/);
  assert.match(src('js/capital-ea.js'), /if \(AT\.leaveFor\) AT\.leaveFor\('dca'\); AT\.setSub\('dca', go\.dataset\.ceGoto\);/);
  assert.match(src('js/workspaces.js'), /if \(!o\.keep && AT\(\) && AT\(\)\.leaveFor\) AT\(\)\.leaveFor\(pl\.tab\);\n\s+const A = AT\(\); if \(A && !o\.keep\)/);
  // The trail's DC timing / EA / Capital step closes the card for its list (tests/capital-merge.test.js runs it), a tab
  // pick: the link it writes says t=dca&dcs=… (8b review: it said t=overview, and a reload opened Peel's Overview).
  assert.match(ss, /go: \(\) => \{ closeResult\(\); AT\(\)\.openTab\('dca', GROUP_SUB\[g\] \|\| 'projects'\); \}/);
  // Records is real or left out, never a placeholder (§4 #7): the "no files of its own" line is gone.
  assert.doesNotMatch(src('js/records-tab.js'), /has no files of its own|for all of Peel\.<\/p>/);
  // ss= still writes each result kind (no alias needed: no share parameter renamed).
  assert.match(src('js/share.js'), /!\/\^\(pipe\|file\|dcwork\|iiblock\|ea\|cap\):\/\.test\(App\(\)\.state\.ss\) \? null : App\(\)\.state\.ss\);/);
  // Records a tab like the others (8b-S2): the trailing classes are gone from both strips (the map's and the page
  // host's), as is the placeholder; the tab's id, key and pane are kept (no alias needed: nothing renamed).
  for (const f of ['index.html', 'css/app.css', 'js/ws-pages.js', 'js/analysis-tabs.js', 'js/records-tab.js']) assert.doesNotMatch(src(f), /f-tab-trail|page-tab-trail|has no files of its own/, f);
  assert.match(src('index.html'), /<button type="button" role="tab" class="f-tab" id="ftab-records" data-tab="records" data-info="tab-records" aria-controls="pane-records" aria-selected="false">Records<\/button>\n {6}<\/div>/, 'Records last');
  assert.match(src('js/ws-pages.js'), /m\.tabs = tabsHTML\(\{ tabs: \(\(A && A\.TAB_KEYS\) \|\| Object\.keys\(TAB_INFO\)\)\.map\(t => \(\{ key: t, label: name\(t\), info: TAB_INFO\[t\], busy: busy\(t\) \}\)\)/, 'the page host: the same five, no trailing flag');
});
