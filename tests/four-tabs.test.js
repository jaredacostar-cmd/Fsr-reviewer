'use strict';
// Stage 2 — four tabs, Servicing combined. The brief's tests:
//   1. the tab and sub-view inventory per scope matches the spec;
//   2. Servicing › Capacity has both systems in one table with a basis on every row;
//   3. no tab shows more than 4 sub-views;
//   4. old links map to the new tabs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = src('index.html');
const plain = o => JSON.parse(JSON.stringify(o));

// js/analysis-tabs.js in a vm: labs = the Labs switches on; site = a development is the scope.
function loadTabs({ labs = [], site = false, publicView = false, siteEas = 3 } = {}) {
  const el = () => null, store = { get: (k, d) => d, set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const window = { PeelUtil: { store, isPublic: () => publicView }, document,
    PeelLabs: { on: id => labs.includes(id) },
    DevScope: { current: () => (site ? { key: 'x' } : null) },
    PeelCapitalEA: { siteBriefCount: () => (site ? siteEas : null) } };
  const ctx = { window, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}

// The spec's inventory: the chips each tab shows at each scope. (navigation phase 6c: Old pipes, an area's Servicing view;
// navigation phase 8a, design §3.5: a servicing scope, a drawn area, a single file; a drawn area has no Records tab;
// navigation phase 8b: a file is Overview and Records, a card or a tool's result Overview alone)
const SPEC = {
  area: { overview: [], growth: ['pipeline', 'areas', 'timing'], svc: ['capacity', 'network', 'pipes'], dca: ['timing', 'eas', 'projects'], records: ['sources', 'checks'] },
  site: { overview: [], growth: ['pipeline'], svc: ['network', 'fsr'], dca: ['timing'], records: ['files'] },
  svc: { overview: [], growth: ['pipeline', 'timing'], svc: ['capacity', 'network', 'pipes'], dca: ['timing'], records: ['sources', 'checks'] },
  drawn: { overview: [], growth: ['pipeline', 'timing'], svc: ['capacity', 'network'], dca: ['timing'], records: [] },
  file: { overview: [], growth: [], svc: [], dca: [], records: ['files'] },
  object: { overview: [], growth: [], svc: [], dca: [], records: [] },
};

test('1. tabs: Overview · Growth · Servicing · Capital · Records, in that order, Records a tab like the others (navigation phase 8b)', () => {
  const tabs = [...HTML.matchAll(/role="tab" class="(f-tab[^"]*)" id="ftab-(\w+)"[^>]*>([^<]+)</g)].map(m => [m[2], m[3], m[1]]);
  assert.deepEqual(tabs, [['overview', 'Overview', 'f-tab'], ['growth', 'Growth', 'f-tab'], ['svc', 'Servicing', 'f-tab'], ['dca', 'Capital', 'f-tab'], ['records', 'Records', 'f-tab']]);
  assert.deepEqual(plain(loadTabs().TAB_KEYS), ['overview', 'growth', 'svc', 'dca', 'records']);
  // Records is no longer right-aligned and muted (the trailing style is removed by design, §8 row 8): no rule
  // styles it apart from the other four; since bundle 6 it is not in the Settings gear too.
  const css = src('css/app.css');
  assert.doesNotMatch(css, /f-tab-trail/); assert.doesNotMatch(HTML, /f-tab-trail/);
  assert.doesNotMatch(css, /#ftab-records|\[data-tab="records"\]/);
  assert.doesNotMatch(src('js/topbar.js'), /data-tbg="records"/);
});

test('1. sub-views per scope match the spec (Peel / area, a development, a servicing scope, a drawn area, a file, a card)', () => {
  for (const [scope, tabs] of Object.entries(SPEC)) {
    const AT = loadTabs({ site: scope === 'site' });
    for (const [tab, want] of Object.entries(tabs)) assert.deepEqual(plain(AT.chipsAt(tab, scope)), want, `${scope} › ${tab}`);
  }
  // Labs › DC funding adds no chip: its screen is a fold of Capital › DC timing (js/dc-projects.js).
  assert.deepEqual(plain(loadTabs({ labs: ['funding'] }).chipsAt('dca', 'area')), ['timing', 'eas', 'projects']);
  assert.deepEqual(plain(loadTabs({ labs: ['funding'], site: true }).chipsAt('dca', 'site')), ['timing']);
  assert.deepEqual(plain(loadTabs({ labs: ['funding'], publicView: true }).chipsAt('dca', 'area')), ['timing', 'eas', 'projects']);
  // EAs never show a chip at a site: the one Capital view lists them (navigation phase 5), with or without any near.
  assert.deepEqual(plain(loadTabs({ site: true, siteEas: 3 }).chipsAt('dca', 'site')), ['timing']);
  assert.deepEqual(plain(loadTabs({ site: true, siteEas: 0 }).chipsAt('dca', 'site')), ['timing']);
  // One chip is no choice: the row is hidden (Overview has none at all).
  assert.match(src('js/analysis-tabs.js'), /p\.hidden = pk !== key \|\| chipsAt\(pk, scopeOf\(pk\)\)\.length < 2;/);
  assert.ok(!/class="f-pane f-subtabs"[^>]*data-pane="overview"/.test(HTML), 'Overview has no sub-views');
  // The chip rows in index.html: one per tab, in the spec's order and words.
  const row = tab => { const i = HTML.indexOf(`f-subtabs`, HTML.indexOf(`data-pane="${tab}" hidden role="group"`) - 80); const s = HTML.slice(i, HTML.indexOf('</div>', i)); return [...s.matchAll(/data-(?:gsub|svcsub|dcasub|rsub)="(\w+)">([^<]+)</g)].map(m => m[2].trim()); };
  // (no two sub-views share a name: design bundle 2)
  assert.deepEqual(row('growth'), ['Pipeline', 'Areas', 'Forecast']);
  assert.deepEqual(row('svc'), ['Capacity', 'Network', 'Old pipes', 'FSR review']);
  assert.deepEqual(row('dca'), ['DC timing', 'EAs', 'Projects']);
  assert.deepEqual(row('records'), ['Sources', 'Data checks', 'Files']);
});

// js/analysis-tabs.js in a vm with the map's strip: five .f-tab buttons (each ready unless busy: tabReady's
// selector answered, so "held" and "left out" are told apart), #analysis, each tab's chips; the scope is the
// DevScope / PeelSvcScope stubs the test switches; the document's listeners are kept (on), extra adds globals.
function loadStrip({ stored = {}, busy = [], extra = {} } = {}) {
  const cls = () => { const s = new Set(); return { toggle: (c, on) => { if (on) s.add(c); else s.delete(c); }, contains: c => s.has(c), add: c => s.add(c), remove: c => s.delete(c) }; };
  const el = dataset => ({ dataset, classList: cls(), attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, parentElement: null });
  const tabs = ['overview', 'growth', 'svc', 'dca', 'records'].map(tab => el({ tab }));
  const CHIPS = { gsub: ['pipeline', 'areas', 'timing'], svcsub: ['capacity', 'network', 'pipes', 'fsr'], dcasub: ['timing', 'eas', 'projects'], rsub: ['sources', 'checks', 'files'] };
  const chips = Object.fromEntries(Object.entries(CHIPS).map(([a, vs]) => [a, vs.map(v => el({ [a]: v }))]));
  const an = el({}), scope = { dev: null, ss: null, ref: null }, on = {};
  const document = {
    querySelector: sel => {
      const m = /^\.f-tab\[data-tab="(\w+)"\]:not\(\[hidden\]\):not\(\[aria-busy\]\)$/.exec(sel); if (m) return busy.includes(m[1]) ? null : tabs.find(t => t.dataset.tab === m[1]) || null;
      const m2 = /^\.f-tab\[data-tab="(\w+)"\]$/.exec(sel); return m2 ? tabs.find(t => t.dataset.tab === m2[1]) || null : null;
    },
    querySelectorAll: sel => { if (sel === '.f-tab') return tabs; const m = /^\[data-(\w+)\]$/.exec(sel); return m && chips[m[1]] ? chips[m[1]] : []; },
    getElementById: id => (id === 'analysis' ? an : null), addEventListener: (t, f) => (on[t] = on[t] || []).push(f) };
  const store = { get: (k, d) => (Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : d), set: () => {} };
  const window = { PeelUtil: { store }, document, PeelDcaTab: {},
    DevScope: { current: () => scope.dev },
    PeelSvcScope: { current: () => scope.ss, peelWideNote: () => {}, hasResult: () => !!(scope.ss && scope.ss.kind === 'result') }, ...extra };
  const ctx = { window, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  const tab = t => tabs.find(x => x.dataset.tab === t), chip = (a, v) => chips[a].find(x => x.dataset[a] === v);
  return { AT: ctx.module.exports, scope, an, tab, chip, on };
}

test('1. every scope kind (navigation phase 8a, design §3.5): one kind for every tab; a tab a scope leaves out is not on the strip and opens Overview, never held; closing the scope brings the strip, the chips and the pick back', () => {
  const AT = loadTabs();
  // (a) The kind: a development (a result kept at it too), no scope, a servicing scope, a result by its kind.
  const kinds = [[{}, 'area'], [{ dev: true }, 'site'], [{ dev: true, ss: { kind: 'result', rkind: 'tool' } }, 'site'],
    ...['plant', 'zone', 'block', 'ps', 'wsys'].map(k => [{ ss: { kind: k } }, 'svc']),
    [{ ss: { kind: 'result', rkind: 'sel' } }, 'drawn'], [{ ss: { kind: 'result', rkind: 'file' } }, 'file'],
    // (a card or a tool's result is its own kind, 'object', navigation phase 8b; an inherited name is no kind)
    ...['dcwork', 'iiblock', 'tool', '__proto__', 'constructor'].map(k => [{ ss: { kind: 'result', rkind: k } }, 'object'])];
  for (const [o, want] of kinds) assert.equal(AT.kindOf(o), want, JSON.stringify(o));
  assert.equal(AT.kindOf(), 'area');
  // (b) A whole tab left out: a drawn area's Records; no chip there; its pick is kept.
  assert.equal(AT.tabOff('drawn', 'records'), true);
  for (const [k, t] of [['svc', 'records'], ['drawn', 'growth'], ['area', 'records'], ['site', 'records'], ['file', 'records'], ['nowhere', 'records']]) assert.equal(AT.tabOff(k, t), false, `${k} › ${t}`);
  assert.deepEqual(plain(AT.chipsAt('records', 'drawn')), []);
  for (const sub of ['sources', 'checks', 'files']) assert.equal(AT.hiddenAt('drawn', 'records', sub), true, sub);
  assert.equal(AT.subFor('records', 'sources', null, 'drawn'), 'sources');
  assert.equal(AT.subFor('growth', 'areas', null, 'svc'), 'pipeline');
  assert.equal(AT.subFor('dca', 'projects', null, 'drawn'), 'timing');
  assert.equal(AT.subFor('svc', 'pipes', null, 'drawn'), 'capacity');
  assert.equal(AT.subFor('records', 'files', null, 'svc'), 'sources');
  // (c) On the strip: Records at a drawn area opens Overview (not held: wantedTab), its button left out.
  const L = loadStrip({ busy: ['dca'] }), T = L.AT;
  L.scope.ss = { kind: 'result', rkind: 'sel' };
  T.showFootTab('records');
  assert.equal(T.getFootTab(), 'overview'); assert.equal(T.wantedTab(), 'overview', 'left out, never held');
  assert.ok(L.tab('records').classList.contains('f-tab-off')); assert.ok(!L.tab('records').classList.contains('f-tab-held'));
  assert.ok(!L.tab('growth').classList.contains('f-tab-off'));
  assert.equal(L.an.dataset.scope, 'drawn'); assert.ok(!L.an.classList.contains('site-scope'));
  assert.ok(L.chip('svcsub', 'pipes').classList.contains('site-off'), 'Old pipes not shown at a drawn area');
  // (a tab still loading is held, as before: held is not left out)
  T.showFootTab('dca'); assert.equal(T.getFootTab(), 'overview'); assert.equal(T.wantedTab(), 'dca'); assert.ok(L.tab('dca').classList.contains('f-tab-held'));
  T.showFootTab('growth'); assert.equal(T.getFootTab(), 'growth');
  // The selection closes: rescope brings Records back; another tab open is drawn again at the new scope.
  L.scope.ss = null; T.rescope();
  assert.ok(!L.tab('records').classList.contains('f-tab-off')); assert.equal(L.an.dataset.scope, 'area'); assert.equal(T.getFootTab(), 'growth');
  assert.ok(!L.chip('svcsub', 'pipes').classList.contains('site-off'));
  T.showFootTab('records'); assert.equal(T.getFootTab(), 'records', 'Records again at an area');
  // At a plant: a stored Areas pick shows Pipeline, and comes back when the plant closes.
  L.scope.ss = { kind: 'plant', pl: 'Clarkson', ref: 'plant:Clarkson' };
  T.setGSub('areas'); T.showFootTab('growth');
  assert.equal(T.getGSub(), 'pipeline'); assert.equal(L.an.dataset.scope, 'svc');
  assert.ok(L.chip('gsub', 'areas').classList.contains('site-off')); assert.ok(!L.chip('gsub', 'timing').classList.contains('site-off'));
  assert.ok(!L.tab('records').classList.contains('f-tab-off'), 'a servicing scope keeps every tab');
  L.scope.ss = null; T.rescope(); assert.equal(T.getGSub(), 'areas', 'the pick back at Peel');
  // On Overview, rescope redraws the strip only (the caller draws the Overview).
  L.scope.ss = { kind: 'result', rkind: 'sel' }; T.showFootTab('overview'); assert.ok(L.tab('records').classList.contains('f-tab-off'));
  L.scope.ss = null; T.rescope(); assert.ok(!L.tab('records').classList.contains('f-tab-off')); assert.equal(T.getFootTab(), 'overview');
  // A stored Files pick at a plant (the app loaded at it): Sources there, Files again at a development.
  const P = loadStrip({ stored: { rSub: 'files' } });
  P.scope.ss = { kind: 'plant', pl: 'Clarkson' }; P.AT.showFootTab('records');
  assert.equal(P.AT.getRSub(), 'sources');
  P.scope.ss = null; P.scope.dev = { key: 'k' }; P.AT.rescope(); assert.equal(P.AT.getRSub(), 'files');
  assert.ok(P.an.classList.contains('site-scope')); assert.equal(P.an.dataset.scope, 'site');
  // (e) A cold link to a block (ss=dr:B12): unresolved until the servicing lookup fills (the stub null), the
  // strip is Peel's; once it resolves, rescope (js/svc-data.js loadServicing) turns it to the block's.
  const C = loadStrip({ stored: { gSub: 'areas', footTab4: 'growth' } });
  C.AT.showFootTab('growth');
  assert.equal(C.AT.getGSub(), 'areas'); assert.ok(!C.chip('gsub', 'areas').classList.contains('site-off')); assert.equal(C.an.dataset.scope, 'area');
  C.scope.ss = { kind: 'block', ref: 'dr:B12' }; C.AT.rescope();
  assert.equal(C.AT.getGSub(), 'pipeline'); assert.equal(C.an.dataset.scope, 'svc'); assert.ok(C.chip('gsub', 'areas').classList.contains('site-off'));
  // (d) Source: the left-out check before the hold line; the CSS; the callers; never [hidden] on a tab.
  const at = src('js/analysis-tabs.js');
  const off = at.indexOf("const kind = scopeKind(); if (tabOff(kind, key)) key = 'overview';"), hold = at.indexOf("if (!tabReady(key)) { heldTab = key; key = 'overview'; } else heldTab = null;");
  assert.ok(off > 0 && off < hold, 'a left-out tab opens Overview before the hold');
  assert.match(at, /t\.classList\.toggle\('f-tab-off', tabOff\(kind, t\.dataset\.tab\)\);/);
  assert.match(at, /const rescope = \(\) => \(footTab === 'overview' && !heldTab \? scopeTabs\(\) : refreshFootTab\(\)\);/);
  assert.doesNotMatch(at, /\bt\.hidden =/);
  assert.match(src('css/app.css'), /\n\.f-tab\.f-tab-off \{ display: none; \}\n/);
  const ss = src('js/svc-scope.js');
  assert.match(ss, /function clear\(\) \{ if \(App\(\)\) App\(\)\.state\.ss = null; result = null; lower\(\); if \(AT\(\) && AT\(\)\.rescope\) AT\(\)\.rescope\(\); \}/);
  assert.match(ss, /function closeResult\(\) \{[^]*?Sh\(\)\.viewLink\.write\(\);\n\s+if \(AT\(\) && AT\(\)\.rescope\) AT\(\)\.rescope\(\);[^\n]*\n\s+return true;\n\s+\}/);
  assert.match(src('js/svc-data.js'), /SvcTab\(\)\.renderSvcTab\(\);\n\s+App\(\)\.applyFilters\(\);\n\s+if \(AT\(\)\.rescope\) AT\(\)\.rescope\(\);/);
});

test('1. a file and a card (navigation phase 8b, design §3.5): a file is Overview and Records, a card or a tool’s result Overview alone; a tab, a link or the lens to a tab it leaves out closes it first (leaveFor)', () => {
  const shown = L => ['overview', 'growth', 'svc', 'dca', 'records'].filter(t => !L.tab(t).classList.contains('f-tab-off'));
  // (PeelAerialCheck.closeDetail, × 's close: the stub closes the result and the tabs follow, as closeResult's rescope)
  const closed = [], share = { viewLink: { write() {} } };
  const L = loadStrip({ extra: { PeelShare: share, PeelAerialCheck: { closeDetail: () => { closed.push(L.scope.ss && L.scope.ss.rkind); L.scope.ss = null; L.AT.rescope(); } } } }), T = L.AT;
  // A DC project's card: Overview alone; a pick of another tab opens Overview (never held), the picks kept.
  L.scope.ss = { kind: 'result', rkind: 'dcwork', ref: 'dcwork:wastewater:22-1' };
  T.showFootTab('overview');
  assert.deepEqual(shown(L), ['overview']); assert.equal(L.an.dataset.scope, 'object');
  T.showFootTab('dca'); assert.deepEqual([T.getFootTab(), T.wantedTab()], ['overview', 'overview']);
  for (const t of ['growth', 'svc', 'dca', 'records']) assert.deepEqual(plain(T.chipsAt(t, 'object')), [], t);
  assert.equal(T.tabOff('object', 'overview'), false);
  // leaveFor: openTab to a tab the card leaves out closes it (once), then that tab opens at Peel.
  T.openTab('dca', 'timing');
  assert.deepEqual(closed, ['dcwork']); assert.deepEqual([T.getFootTab(), T.getFootPref(), T.getDcSub()], ['dca', 'dca', 'timing']);
  assert.deepEqual(shown(L), ['overview', 'growth', 'svc', 'dca', 'records'], 'the five tabs back');
  assert.equal(T.leaveFor('svc'), false, 'nothing open: nothing closes');
  // The same through a data-at link (the document's listener): an EA's card, Servicing › Network.
  L.scope.ss = { kind: 'result', rkind: 'ea', ref: 'ea:x' }; T.showFootTab('overview');
  const at = v => { for (const f of L.on.click) f({ target: { closest: q => (q === '[data-at]' ? { dataset: { at: v } } : null) } }); };
  at('svc:network');
  assert.deepEqual(closed, ['dcwork', 'ea']); assert.deepEqual([T.getFootTab(), T.getSvcSub()], ['svc', 'network']);
  // A link to Overview at a card leaves it open.
  L.scope.ss = { kind: 'result', rkind: 'pipe', ref: 'pipe:7' }; T.showFootTab('overview'); at('overview');
  assert.deepEqual(closed, ['dcwork', 'ea']); assert.equal(L.scope.ss.rkind, 'pipe');
  // A single file: Overview (its record sheet) and Records (the file, its one view); Records opens with it open.
  L.scope.ss = { kind: 'result', rkind: 'file', ref: 'file:u1' }; T.showFootTab('overview');
  assert.deepEqual(shown(L), ['overview', 'records']); assert.equal(L.an.dataset.scope, 'file');
  assert.deepEqual(plain(T.chipsAt('records', 'file')), ['files']);
  T.openTab('records'); assert.deepEqual([T.getFootTab(), T.getRSub()], ['records', 'files']); assert.deepEqual(closed, ['dcwork', 'ea'], 'Records is a file’s');
  T.openTab('growth'); assert.deepEqual(closed, ['dcwork', 'ea', 'file']); assert.equal(T.getFootTab(), 'growth');
  assert.equal(T.getRSub(), 'sources', 'the Records pick back at Peel');
  // A drawn area: Records closes the selection, then opens; at a plant Records closes nothing (its own Records).
  L.scope.ss = { kind: 'result', rkind: 'sel', ref: 'sel:a' }; T.showFootTab('overview');
  T.openTab('records'); assert.equal(closed.at(-1), 'sel'); assert.equal(T.getFootTab(), 'records');
  L.scope.ss = { kind: 'plant', pl: 'Clarkson', ref: 'plant:Clarkson' }; T.showFootTab('overview');
  T.openTab('records'); assert.equal(closed.length, 4); assert.deepEqual([T.getFootTab(), L.scope.ss.kind], ['records', 'plant']);
  // A result kept at its development (the Inquiry draft): the development's five tabs, nothing closed.
  L.scope.ss = { kind: 'result', rkind: 'tool', ref: 'tool:inquiry-draft' }; L.scope.dev = { key: 'k' }; T.showFootTab('overview');
  assert.deepEqual(shown(L), ['overview', 'growth', 'svc', 'dca', 'records']); assert.equal(L.an.dataset.scope, 'site');
  T.openTab('dca'); assert.equal(closed.length, 4); assert.equal(T.getFootTab(), 'dca');
  // No PeelAerialCheck (a page or a test): the result's own close.
  let rc = 0, ss = { kind: 'result', rkind: 'tool', ref: 'tool:x' };
  const N = loadStrip({ extra: { PeelShare: share, PeelSvcScope: { current: () => ss, peelWideNote() {}, hasResult: () => !!ss, closeResult: () => { rc++; ss = null; } } } });
  assert.deepEqual(shown(N), ['overview']);
  N.AT.openTab('svc'); assert.equal(rc, 1); assert.equal(N.AT.getFootTab(), 'svc');
  // Source: openTab and the data-at handler call it first (before footPref: dev-layout.test.js's pin after it holds);
  // the other entry points that open a tab themselves (Help's Show me, an EA card's ce-goto, a map view's go()).
  const a = src('js/analysis-tabs.js');
  assert.match(a, /const r = sub \? migrateSub\(tab, sub\) : null, t = r \? r\.tab : tab;\n\s+leaveFor\(t\);[^\n]*\n\s+footPref = tabOf\(t === 'dev'/);
  assert.match(a, /if \(s0\) openFold\(foldOf\(t0, s0\)\);\n\s+leaveFor\(tab\);[^\n]*\n\s+footPref = tabOf\(tab\); store\.set\('footTab4', footPref\); showFootTab\(tab, sub\);/);
  assert.match(a, /function leaveFor\(tab\) \{\n\s+const S = root\.PeelSvcScope; if \(!tabOff\(scopeKind\(\), tabOf\(tab\)\) \|\| !\(S && S\.hasResult && S\.hasResult\(\)\)\) return false;\n\s+const AC = root\.PeelAerialCheck; if \(AC && AC\.closeDetail\) AC\.closeDetail\(\); else S\.closeResult\(\);/);
  assert.match(src('js/tips.js'), /const openAnalysis = \(tab, sub\) => \{ if \(AT\(\)\.leaveFor\) AT\(\)\.leaveFor\(tab\); if \(sub && AT\(\)\.TABSUBS\[tab\]\)/);
  assert.match(src('js/capital-ea.js'), /if \(go\) \{ const AT = window\.PeelAnalysisTabs; if \(AT\) \{ if \(AT\.leaveFor\) AT\.leaveFor\('dca'\); AT\.setSub\('dca', go\.dataset\.ceGoto\); AT\.showFootTab\('dca'\); \} return; \}/);
  assert.match(src('js/workspaces.js'), /\n {4}if \(!o\.keep && AT\(\) && AT\(\)\.leaveFor\) AT\(\)\.leaveFor\(pl\.tab\);\n {4}const A = AT\(\); if \(A && !o\.keep\) \{ if \(pl\.sub/);
  // The lens: its tab through openTab, as before (owner decision 9).
  assert.match(src('js/topbar.js'), /if \(tab && AT\(\) && AT\(\)\.openTab\) AT\(\)\.openTab\(tab\);/);
});

test('1. the panes behind each sub-view: Areas is one drill-down; Network holds blocks, stations, zones and the water facilities', () => {
  const pane = id => (HTML.match(new RegExp(`id="${id}" data-pane="(\\w+)" data-sub="([\\w ]+)"`)) || []).slice(1).join('/');
  assert.equal(pane('pane-growth-byplan'), 'growth/areas');
  assert.equal(pane('pane-growth-census'), 'growth/areas');
  assert.equal(pane('pane-svc-capacity'), 'svc/capacity');
  for (const id of ['pane-ww', 'pane-pumpstations', 'pane-water']) assert.equal(pane(id), 'svc/network', id);
  // Navigation phase 2: Allocations is a fold of Capacity (its tables in Capacity's full table); the
  // water facilities and the hydraulic check are Network's; the servicing model is Records › Data checks.
  assert.equal(pane('pane-alloc'), 'svc/capacity');
  for (const id of ['pane-wfac', 'pane-hydro']) assert.equal(pane(id), 'svc/network', id);
  assert.equal(pane('pane-svc-checks'), 'records/checks');
  // Navigation phase 3: the Ledger is Forecast's By period fold; its pane (id kept) is in Forecast's full table.
  for (const id of ['pane-growth-timing', 'pane-growth-ledger']) assert.equal(pane(id), 'growth/timing', id);
  assert.equal(pane('pane-dca-build'), 'dca/projects');
  // Navigation phase 4: DC projects is DC timing; its list in full, the screening results and funding levels are DC timing's.
  for (const id of ['pane-dca-timing', 'pane-dca-dcproj', 'pane-dca-rec', 'pane-dca-funding']) assert.equal(pane(id), 'dca/timing', id);
  // The funding screen is "Screening results" now.
  assert.match(src('js/dca-tab.js'), /<h3 class="sub-title">Screening results/);
  // The lens (owner decision 9): its map preset and the one System control; Capital, Water and Wastewater
  // still open their tab, and the comment says so (AD-9).
  assert.match(src('js/topbar.js'), /encoding and legend, and the one System control \(js\/analysis-tabs\.js setSys\) to what its map/);
  assert.doesNotMatch(src('js/topbar.js'), /it never changes the right panel's tabs/);
});

test('2. Servicing › Capacity: water and wastewater in ONE table, a basis on every row', () => {
  const s = src('js/svc-capacity.js');
  // Every row the collector adds names its basis (one of the three).
  const coll = s.slice(s.indexOf('function collect()'), s.indexOf('\n  }\n', s.indexOf('function collect()')));
  const pushes = coll.match(/rows\.push\(\{/g).length;
  assert.equal((coll.match(/rows\.push\(\{[^]*?basis: (wwB|'metered'|'design'|'mp')/g) || []).length, pushes, 'a basis on every row');
  for (const kind of ["kind: 'plant'", "kind: 'wplant'", "kind: 'pump'", "kind: 'storage'", "kind: 'ps'", "kind: 'pipe'"]) assert.ok(coll.includes(kind), kind);
  // Rendered: one table, both systems, data-basis on every row, the spec's columns.
  const U = { esc: x => String(x), fmtNum: n => Math.round(n).toLocaleString('en-CA'), fmt1: n => n.toFixed(1), capTxt: v => `${Math.round(v * 1000)} m³/d`,
    roomWords: (v, u, f) => (v < 0 ? `over by ${f(-v)}` : `room ${f(v)}`), basisChip: b => `<span class="basis" data-basis="${b}">${b}</span>`, hlP: h => `<p>${h}</p>`, BASIS_KEYS: ['metered', 'design', 'mp'] };
  const window = { PeelUtil: U, PeelSvcTab: { optSwitch: () => '<div class="svc-switch"></div>' }, PeelMapMarkers: { THIS_YEAR: 2026 }, PeelSvcPlants: { hz: { end: 2051, aStart: 2026, aYears: 5, pStart: 2028, pYears: 10 } } };
  const ctx = { window, module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(s, ctx);
  const C = ctx.module.exports;
  const hz = { end: 2051, at: [[2031, 70], [2041, 85], [2051, 95]], c80: 2035, c90: 2048, c100: null };
  const rows = [
    { id: 'plant:Lakeview', sys: 'ww', kind: 'plant', name: 'G.E. Booth', sub: 'plant', compared: 'Flow vs rated', basis: 'metered', unit: 'ML/d', cap: 518, capWord: 'rated', existing: 400, built: 0, committed: 480, buildout: 620, limit: { y: 2028, what: '90% trigger' }, horizon: hz },
    { id: 'wsys:southPeel', sys: 'water', kind: 'wplant', name: 'South Peel', sub: 'treatment', compared: 'Max day vs rated', basis: 'metered', unit: 'ML/d', cap: 1700, capWord: 'rated', existing: 900, built: 0, committed: 1000, buildout: 1100, limit: { y: null, what: '90% trigger' }, horizon: hz },
    { id: 'stor:x', sys: 'water', kind: 'storage', name: 'X Reservoir', sub: 'storage', compared: 'Required vs available', basis: 'mp', unit: 'ML', cap: 40, capWord: 'available', existing: 34, built: 0, committed: 34, buildout: 49, limit: { y: 2029, what: 'required > available' }, horizon: hz },
    { id: 'ps:y', sys: 'ww', kind: 'ps', name: 'Y', sub: 'pumping station', compared: 'Peak wet vs firm', basis: 'design', unit: 'L/s', cap: 800, capWord: 'firm', existing: 436, built: 0, committed: 437, buildout: 441, limit: { y: null, what: '100% firm' }, horizon: hz },
  ].map(C.derive);
  const html = C.tableHTML(rows);
  assert.equal((html.match(/<table class="dt svc-table cap-all"/g) || []).length, 1, 'one table');
  const trs = html.match(/<tr class="cap-row[^"]*" data-basis="(\w+)"/g);
  assert.equal(trs.length, rows.length);
  for (const t of trs) assert.match(t, /data-basis="(metered|design|mp)"/);
  assert.match(html, /<td class="c-sys" data-l="System">Wastewater<\/td>/); assert.match(html, /<td class="c-sys" data-l="System">💧 Water<\/td>/);
  const head = html.match(/<thead><tr>([\s\S]*?)<\/tr><\/thead>/)[1];
  const th = [...head.matchAll(/<th( class="[^"]*")?>([^<]+)/g)].map(m => [m[2].trim(), /xc/.test(m[1] || '')]);
  assert.deepEqual(th.filter(x => !x[1]).map(x => x[0]), ['Facility', 'System', 'Compared', 'Committed', 'Build-out', 'Limit year', 'Room / over']);
  assert.deepEqual(th.filter(x => x[1]).map(x => x[0]), ['Capacity', 'Today', 'Committed', 'Build-out'], 'Engineering columns');
  // Room / over in signed words; the limit year as a year, "now" or "after <end>".
  assert.match(html, /over by 102\.0 ML\/d/); assert.match(html, /room 600\.0 ML\/d/);
  assert.match(html, /≈2028<small>90% trigger/); assert.match(html, /after 2051<small>90% trigger/);
  // One sort vocabulary (N-11): the panel's words, Soonest · Largest impact; each button names its measure.
  assert.match(html, /data-cap-sort="limit"[^>]*>Soonest</); assert.match(html, /data-cap-sort="impact"[^>]*>Largest impact</);
  assert.match(html, /data-cap-sort="limit"[^>]*title="The soonest limit year first"/);
  assert.doesNotMatch(html, />Limit year<\/button>|>Impact<\/button>/);
  // Sort by limit year (soonest first) or by impact (most loaded at build-out first).
  assert.deepEqual(C.sortRows(rows, 'limit', 2026).map(r => r.id), ['plant:Lakeview', 'stor:x', 'wsys:southPeel', 'ps:y']);
  // (Stage 3: impact in the Master Plan's own test, how far build-out goes past each limit.)
  assert.deepEqual(C.sortRows(rows, 'impact', 2026).map(r => r.id), ['plant:Lakeview', 'stor:x', 'wsys:southPeel', 'ps:y']);
  // The horizon table (2031 / 2041 / 2051; reaches 80 / 90 / 100%) folds under each row.
  assert.match(s, /\$\{open \? `<tr class="cap-hz"><td colspan="11">\$\{horizonHTML\(r\)\}<\/td><\/tr>` : ''\}/);
  assert.match(s, /<th class="n">Reaches 80%<\/th><th class="n">Reaches 90%<\/th><th class="n">Reaches 100%<\/th>/);
  // One stacked bar per row, with the 90% and 100% marks; the Simple / Engineering column switch.
  assert.match(s, /rated: r\.cap, trigger: 0\.9 \* r\.cap/);
  assert.match(s, /SvcTab\(\)\.optSwitch\('tech', 'Columns', \[\['off', 'Simple'\], \['on', 'Engineering'\]\]\)/);
  assert.ok(/<th class="n xc">Capacity<\/th>/.test(html), 'engineering columns (.xc) behind the switch');
});

test('2. the Simple / Engineering switch is on every Servicing sub-view', () => {
  assert.match(src('js/svc-tab.js'), /\$\('#water-body'\)\.innerHTML = `\$\{SCREEN_NOTE\}<div class="svc-head">\$\{svcLegend\(Y\)\}<div class="svc-switches">\$\{optSwitch\('tech'/);
  assert.match(src('js/svc-tab.js'), /\$\('#ww-body'\)\.innerHTML = `\$\{SCREEN_NOTE\}<div class="svc-head">\$\{svcLegend\(Y\)\}<div class="svc-switches">\$\{optSwitch\('tech'/);
  assert.match(src('js/svc-capacity.js'), /el\.innerHTML = `\$\{U\.SCREEN_NOTE \|\| ''\}<div class="svc-head"><div class="svc-switches">\$\{SvcTab\(\)\.optSwitch\('tech'/, 'Checks');
  assert.match(src('js/svc-tab.js'), /'#svc-capacity-body', '#svc-checks-body'/, 'the switch handler covers the new bodies');
});

test('3. no tab shows more than 4 sub-views, at any scope, with every Labs switch on', () => {
  const all = ['hydro', 'funding', '3d', 'timebox', 'swmm', 'batch', 'gravity', 'sewer', 'pressure'];
  // (every scope kind, navigation phase 8a)
  assert.deepEqual(plain(Object.keys(loadTabs().HIDDEN)).sort(), Object.keys(SPEC).sort());
  for (const kind of Object.keys(loadTabs().HIDDEN)) {
    const AT = loadTabs({ labs: all, site: kind === 'site' });
    for (const tab of Object.keys(SPEC.area)) assert.ok(AT.chipsAt(tab, kind).length <= 4, `${tab} (${kind})`);
  }
  for (const [tab, s] of Object.entries(loadTabs().TABSUBS)) assert.ok(s.valid.length <= 4, tab);
  for (const row of HTML.matchAll(/<div class="f-pane f-subtabs[^"]*" data-pane="\w+"[^>]*>([\s\S]*?)<\/div>/g)) assert.ok((row[1].match(/<button/g) || []).length <= 4, row[0].slice(0, 80));
  // Labs: the extra tools sit behind Settings › Labs (a section of ⚙'s one Settings sheet since navigation phase 7: the
  // ⚙ menu's Labs item, removed by design, §5 row 169).
  const L = require('../js/labs.js');
  assert.deepEqual(plain(L.IDS), all);
  const css = src('css/app.css');
  for (const g of ['html:not(.lab-3d) .view3d-ctl', 'html:not(.lab-timebox) .tool-rail [data-tool="timebox"]', 'html:not(.lab-swmm) [data-tbx="swmm"]', 'html:not(.lab-batch) [data-ptool-act="batch"]', 'html:not(.lab-hydro) .lab-hydro', 'html:not(.lab-funding) .lab-funding-pane']) assert.ok(css.includes(g), g);
  assert.match(src('js/growth-ui.js'), /\$\{root\.PeelLabs && root\.PeelLabs\.pageHTML \? root\.PeelLabs\.pageHTML\(\) : ''\}/);
  assert.doesNotMatch(src('js/topbar.js'), /data-tbg=|renderGearMenu/);
});

test('4. old links and stored views map to the new tabs', () => {
  const AT = loadTabs();
  const m = (t, sub) => plain(AT.migrateTabKey(t, sub));
  const cases = [
    [['ww', 'plants'], { tab: 'svc', svcSub: 'capacity' }], [['ww', 'catchments'], { tab: 'svc', svcSub: 'network' }], [['ww', 'alloc'], { tab: 'svc', svcSub: 'capacity' }], [['ww', 'pumpstations'], { tab: 'svc', svcSub: 'network' }],
    [['water', 'capacity'], { tab: 'svc', svcSub: 'capacity' }], [['water', 'zones'], { tab: 'svc', svcSub: 'network' }], [['water', 'facilities'], { tab: 'svc', svcSub: 'network' }], [['water', 'hydro'], { tab: 'svc', svcSub: 'network' }],
    [['growth', 'census2051'], { tab: 'growth', gSub: 'areas' }], [['growth', 'byplan'], { tab: 'growth', gSub: 'areas' }], [['growth', 'timing'], { tab: 'growth', gSub: 'timing' }], [['growth', 'ledger'], { tab: 'growth', gSub: 'timing' }], [['census'], { tab: 'growth', gSub: 'areas' }],
    [['dca', 'build'], { tab: 'dca', dcSub: 'projects' }], [['dca', 'dcproj'], { tab: 'dca', dcSub: 'timing' }], [['dca', 'recommendations'], { tab: 'dca', dcSub: 'timing' }], [['dca', 'funding'], { tab: 'dca', dcSub: 'timing' }], [['dca', 'eas'], { tab: 'dca', dcSub: 'eas' }],
    [['plants'], { tab: 'svc', svcSub: 'capacity' }], [['demand'], { tab: 'growth' }], [['criteria'], { tab: 'overview' }], [['developments'], { tab: 'overview' }], [['records'], { tab: 'records' }],
  ];
  for (const [[t, sub], want] of cases) assert.deepEqual(m(t, sub), want, `t=${t}${sub ? ` / ${sub}` : ''}`);
  // The share link reads the old sub-view param for the old tab, and turns on the Labs switch an old
  // funding-screen or hydraulic-check link needs; new links carry svs / rs.
  const sh = src('js/share.js');
  // (svs: the link's own, but Network on a link to Old pipes' map view from before navigation phase 6c is Old pipes)
  assert.match(sh, /const svs = w === 'pipes' && t === 'svc' && q\.get\('svs'\) === 'network' \? 'pipes' : q\.get\('svs'\);/);
  assert.match(sh, /const oldSub = pageWs \? pageWs\.sub : t === 'ww' \|\| t === 'water' \? q\.get\('ws'\) : t === 'growth' \? q\.get\('gs'\) : t === 'dca' \? q\.get\('dcs'\) : t === 'svc' \? svs : t === 'records' \? q\.get\('rs'\) : null;/);
  assert.match(sh, /if \(window\.PeelLabs && \(m\.dcSub === 'funding' \|\| q\.get\('dcs'\) === 'funding'\)\) window\.PeelLabs\.set\('funding', true\);/);
  assert.match(sh, /if \(window\.PeelLabs && q\.get\('t'\) === 'water' && q\.get\('ws'\) === 'hydro'\) window\.PeelLabs\.set\('hydro', true\);/);
  assert.match(sh, /if \(tab === 'svc'\) set\('svs', AT\(\)\.getSvcSub\(\)\); if \(tab === 'records'\) set\('rs', AT\(\)\.getRSub\(\)\);/);
  // In-app callers with an old name still land: setSub maps it, showFootTab('ww' | 'water') is Servicing.
  assert.match(src('js/analysis-tabs.js'), /const setSub = \(tab, sub\) => \{ const r = migrateSub\(tab, sub\) \|\| \{ tab, sub \}, s = TABSUBS\[r\.tab\];/);
  assert.equal(AT.setSub('dca', 'build'), 'dca'); assert.equal(AT.getDcSub(), 'projects', "setSub maps an old name ('build' → 'projects')");
  assert.equal(AT.tabOf('ww'), 'svc'); assert.equal(AT.tabOf('water'), 'svc');
});

test('removed: the heatmap and the gas / hydro layers', () => {
  const LG = src('js/layer-groups.js'), MM = src('js/map-markers.js'), CX = src('js/constraints.js');
  assert.doesNotMatch(LG, /\['heat',|\['gas',|\['hydro',/);
  assert.match(MM, /show: \{ markers: 'Markers' \},/);
  assert.doesNotMatch(MM, /heat-canvas|const heat = /);
  assert.doesNotMatch(CX, /\b(gas|hydro): \{ label/);
  assert.doesNotMatch(src('css/app.css'), /heat-canvas|--heat-ramp|--cx-gas|--cx-hydro/);
});

test('every panel keeps the screening note', () => {
  // Stage 3: the Capacity panel is a standard panel, whose footer carries the note (js/panel.js);
  // its full table keeps the note too.
  assert.match(src('js/svc-capacity.js'), /el\.innerHTML = `\$\{U\.SCREEN_NOTE \|\| ''\}\$\{fullTableHTML\(rows\)\}`;/);
  assert.match(src('js/svc-capacity.js'), /root\.PeelPanel\.set\('svc:capacity', panelSpec\(rows\)\)/);
  assert.match(src('js/panel.js'), /<p class="pnl-note small">\$\{NOTE\}\$\{reportLink\(s\.key, h\.name\)\}<\/p><\/footer>/);
  assert.match(src('js/labs.js'), /General screening results only\. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results\./);
});

test('a development: Growth is its units and how the site compares (other applications with homes)', () => {
  const s = src('js/growth-ui.js');
  const siteCompare = new Function(`${s.match(/function siteCompare\(v, others\) \{[\s\S]*?\n  \}/)[0]}; return siteCompare;`)();
  assert.deepEqual(siteCompare(10, [1, 5, 20, 30]), { n: 4, pctLarger: 50, median: 12.5 });
  assert.deepEqual(siteCompare(100, [1, 5, 20]), { n: 3, pctLarger: 100, median: 5 });
  assert.equal(siteCompare(0, [1]), null); assert.equal(siteCompare(5, []), null);
  // Permit-only houses are not "developments" to compare a site with.
  assert.match(s, /const hasApp = q => \(q\.records \|\| \[\]\)\.some\(r => r\.kind === 'application'\);/);
});

test('Servicing › Network: blocks, stations and zones, with "What loads this?" and "Show upstream"', () => {
  assert.match(HTML, /id="pane-svc-netbar" data-pane="svc" data-sub="network"/);
  const s = src('js/svc-capacity.js');
  assert.match(s, /data-net-loads\$\{dis\} title="The developments loading it, as a scope">What loads this\?<\/button>/);
  assert.match(s, />Show upstream<\/button>/);
  assert.match(s, /if \(e\.target\.closest\('\[data-net-loads\]'\)\) \{ if \(root\.PeelToolScope\) root\.PeelToolScope\.showLoads\(id\); return; \}/);
  assert.match(s, /if \(e\.target\.closest\('\[data-net-up\]'\)\) ST\.focusSvc\(id, \{ zoom: true, loads: false, keep: true \}\);/);
  // A row tap selects it (on the map, with everything upstream) and stays on Network.
  assert.match(src('js/dca-tab.js'), /const netPick = id => \{ ST\(\)\.focusSvc\(id, \{ loads: false \}\);/);
});
