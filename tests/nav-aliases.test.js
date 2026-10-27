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

test('the sidebar ids that are not pages (Explore, Capital, Reference) resolve to a page, from a link too', () => {
  for (const id of Object.keys(W.PAGE_ALIAS)) assert.ok(!isPage(id), `${id} is an alias, not a page`);
  const r = (id, ctx) => W.resolvePage(id, ctx);
  assert.equal(r('explore', {}), 'growth', 'Explore: Growth in an area');
  assert.equal(r('explore', { site: true }), 'site', 'Explore with a development open: its page');
  for (const v of W.EXPLORE) assert.equal(r('explore', { last: v }), v, `Explore: the last of its views (${v})`);
  assert.equal(r('explore', { last: 'pipes' }), 'growth', 'a last workspace outside Explore');
  assert.equal(r('capital', {}), 'projects');
  for (const v of W.CAPITAL) assert.equal(r('capital', { last: v }), v);
  assert.equal(r('reference', {}), 'help');
  for (const id of Object.keys(W.PAGE_ALIAS)) assert.ok(isPage(r(id, {})), `${id} → a page`);
  // A link names them as pages (the app writes the page it resolved to; older or hand-made links may not).
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:explore' })), { mode: 'home', page: 'growth' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:explore&d=Brampton%7C1%20MAIN%20ST' })), { mode: 'home', page: 'site' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:capital' })), { mode: 'home', page: 'projects' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:reference' })), { mode: 'home', page: 'help' });
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:nonsense' })), { mode: 'full' }, 'an unknown page: the full map, as before');
  // In the browser every route into a page goes through openPage, which resolves the id first.
  assert.match(src('js/workspaces.js'), /function openPage\(id, o = \{\}\) \{\n {4}id = resolvePage\(id, \{ site: !!\(root\.DevScope && root\.DevScope\.current && root\.DevScope\.current\(\)\), last: store\.get\('lastWs', ''\) \}\);/);
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

test('share links: every sub-view param goes through migrateTabKey; nav=2; an older page link opens the page\'s own tab', () => {
  const sh = src('js/share.js');
  assert.doesNotMatch(sh, /TABSUBS\.svc\.valid\.includes\(q\.get\('svs'\)\)|TABSUBS\.records\.valid\.includes\(q\.get\('rs'\)\)/, 'a moved svs / rs value is no longer dropped');
  assert.match(sh, /if \(m\.dcSub\) AT\(\)\.setDcSub\(m\.dcSub\); if \(m\.rSub\) AT\(\)\.setRSub\(m\.rSub\);/);
  assert.match(sh, /set\('nav', '2'\);\n {6}set\('t', tab\);/);
  assert.match(sh, /const tab = pageWs \? pageWs\.tab : AT\(\)\.getFootPref\(\);/, 'on a workspace page, the page\'s own tab');
  // (an older page link: nav below 2, the page it names open; a saved view applied on the full map opens
  // no page, so it keeps its own t)
  assert.match(sh, /const pid = !\(Number\(q\.get\('nav'\)\) >= 2\) && \/\^p:\/\.test\(w\) && W && W\.resolvePage \? W\.resolvePage\(w\.slice\(2\), \{ site: !!q\.get\('d'\), last: window\.PeelUtil\.store\.get\('lastWs', ''\) \}\) : '';/);
  assert.match(sh, /const pageWs = pid && W\.mode\(\) === 'home' && W\.page\(\) === pid && Object\.prototype\.hasOwnProperty\.call\(W\.BY_ID, pid\) \? W\.BY_ID\[pid\] : null;\n {6}if \(q\.get\('t'\) \|\| pageWs\) \{/);
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

test('a tab named before its data arrived (Servicing, Capital) opens when its button shows, unless another was picked', () => {
  const shown = new Set(['overview', 'growth', 'records']);
  const q = sel => { const m = /^\.f-tab\[data-tab="(\w+)"\]:not\(\[hidden\]\)$/.exec(sel); return m ? (shown.has(m[1]) ? {} : null) : null; };
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
  assert.match(src('js/svc-tab.js'), /if \(AT\(\) && AT\(\)\.tabShown\) for \(const k of \['svc', 'dca'\]\) if \(!\$\(`#ftab-\$\{k\}`\)\.hidden\) AT\(\)\.tabShown\(k\);/);
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
  // (navigation phase 5 adds FSR review, a development's view: an area shows the two, below)
  assert.deepEqual(plain(AT.TABSUBS.svc.valid), ['capacity', 'network', 'fsr']);
  assert.deepEqual(plain(AT.chipsAt('svc', 'area')), ['capacity', 'network']);
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
  assert.match(ws, /function openPage\(id, o = \{\}\) \{[\s\S]*?A\.showFootTab\(w\.tab\); if \(w\.fold && A\.openFold\) A\.openFold\(w\.fold\); \} \}\n {4}lastHTML = '';\n {4}setMode\('home', id\);/);
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
  // A search pick on a page: the Capital page at the project, DC timing's section.
  assert.deepEqual(plain(W.pageRoute({ place: { hit: 'dc', key: 'water:25-9' } }, 'home')), { page: 'projects', wsec: 'timing', dcSel: 'water:25-9' });
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
  assert.deepEqual(plain(AT.chipsAt('svc', 'area')), ['capacity', 'network']);
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

// The site page's sections take the map's tab names (navigation phase 5, design §3.1 rule 1); their ids are kept,
// since phase 1's search routes (pageRoute's sec) and siteAt name them; the old FSR review section is Servicing's
// second view, the page fsr (§7.1: #w=p:fsr&d=<key> is the site's page there; without a site, the Find step).
test('phase 5: the site page’s sections by the tabs’ names; the old ids and the FSR review section land', () => {
  const vm = require('node:vm'), p = { key: 'k', title: '1 A St', municipality: 'Brampton' };
  let dev = p;
  const spec = a => ({ scope: 'dev:k', spec: { head: { status: null, tools: { key: 'k' } }, answer: a, lists: [], folds: [] } });
  const panels = { 'overview:': spec('Overview'), 'records:files': spec('Records'), 'svc:network': spec('Network'), 'svc:fsr': spec('FSR review') };
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelPanel: { get: k => panels[k] || null, scenarioChip: () => '' }, PeelWorkspaces: { BY_ID: { site: { label: 'Check a site' }, fsr: { label: 'Review an FSR' } } }, PeelApp: { state: { projects: [], filtered: [] } }, DevScope: { current: () => dev } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams, CSS: { escape: x => x } }; ctx.globalThis = ctx;
  for (const f of ['js/sections.js', 'js/ws-pages.js']) vm.runInNewContext(src(f), ctx);
  const WP = window.PeelWsPages, on = m => (/<button type="button" class="page-sec on"[^>]*>([^<]*)</.exec(m.top) || [])[1];
  // A pick routes to the ids (phase 1): summary is Overview, files is Records.
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'home')), { page: 'site', dev: 'k', sec: 'summary' });
  WP.siteAt('k', 'summary'); assert.equal(on(WP.build('site')), 'Overview');
  WP.siteAt('k', 'files'); let m = WP.build('site'); assert.equal(on(m), 'Records'); assert.equal(m.answer, 'Records');
  // An id no section has now (the old fsr section was a page button, never an id; any other): Overview.
  WP.siteAt('k', 'fsr'); m = WP.build('site'); assert.equal(on(m), 'Overview'); assert.equal(m.answer, 'Overview');
  // The page fsr: with a site, the site's page at Servicing › FSR review; a pick from it lands there too.
  assert.deepEqual(plain(W.pageRoute({ label: 'x', p }, 'fsr')), { page: 'fsr', dev: 'k', sec: 'summary' });
  m = WP.build('fsr'); assert.equal(m.id, 'fsr'); assert.equal(on(m), 'Servicing'); assert.equal(m.answer, 'FSR review');
  assert.match(m.top, /aria-label="Views"[^>]*><button type="button" class="page-sec" data-ws-sec="servicing"[^>]*>Network<\/button><button type="button" class="page-sec on" data-ws-page="fsr"/);
  dev = null; m = WP.build('fsr'); assert.equal(m.id, 'fsr'); assert.match(m.answer, /^Find the development/, 'without a site: the Find step');
  assert.deepEqual(plain(W.startScreen({ hash: '#w=p:fsr' })), { mode: 'home', page: 'fsr' });
});
