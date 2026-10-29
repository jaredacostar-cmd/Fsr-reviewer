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
  // (navigation phase 8a: a block is its servicing scope dr:B<n>, opened before showBlock awaits anything, once
  // the model its Overview reads is built, the sheet raised from its peek on a phone; the iiblock card above is
  // the fallback where no servicing area resolves, before the model, and for a link's last try: opt.card)
  const sb = src('js/sewer-trace.js'), body = sb.slice(sb.indexOf('async function showBlock('));
  assert.match(body, /^async function showBlock\(id, opt = \{\}\) \{\n {4}const S = root\.PeelSvcScope, ref = S && S\.blockRef \? S\.blockRef\(id\) : null, A = App\(\);\n {4}if \(!opt\.card && ref && A\.state\.svcModel && S\.resolve\(ref\)\) \{\n {6}clearBlockFocus\(\); if \(!\(S\.current\(\) && S\.current\(\)\.ref === ref\)\) S\.open\(ref\);\n {6}const DT = root\.PeelDataTab; if \(DT && DT\.shellNarrow && DT\.shellNarrow\(\) && A\.getAnalysisSnap && A\.getAnalysisSnap\(\) === 'peek'\) A\.setAnalysisSnap\('half'\);\n {6}return;\n {4}\}\n {4}await Promise\.all/);
  assert.ok(body.indexOf('S.blockRef(id)') < body.indexOf('await Promise.all') && body.indexOf('await Promise.all') < body.indexOf('openResult({ ref: `iiblock:'), 'the scope first, the card after the loads');
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

// Navigation phase 8a (design §5 row 153, §3.5 "iiblock opens as the block servicing scope"): an old
// ss=iiblock:<n> link lands on the block's servicing scope, once the servicing lookup is filled.
function loadRestore(o = {}) {
  const calls = [], timers = [], shown = [];
  const byId = new Map(o.byId || []);
  const state = { ss: null, svcGen: 0, servicing: o.servicing === false ? null : { drainage: [...byId.values()], zones: [], psAreas: [] }, svcModel: o.model === false ? null : {} };
  const win = {
    PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelPhases: require('../js/phases.js'),
    PeelApp: { state, applyFilters: () => calls.push('filter') },
    PeelOverviewTab: { renderOverview: () => calls.push('render') },
    PeelAnalysisTabs: { setFootPref: () => {}, showFootTab: t => calls.push(`tab:${t}`) },
    PeelShare: { viewLink: { write: () => calls.push('link') } },
    PeelTopbar: { renderTrail: () => calls.push('trail') },
    PeelSvcData: { svcById: byId, PLANT_SHORT: { Clarkson: 'Clarkson' }, plantLabel: pl => `${pl} plant`, drName: a => a.name },
    PeelSvcTab: { svcFlowTree: () => new Map(), upstreamOf: () => [] },
    // (the card: opt.card, the fallback; o.cardOpens: it opens as the real one does, through openResult)
    PeelSewerTrace: { showBlock: (id, opt) => { shown.push(opt && opt.card ? `${id}:card` : id); if (o.cardOpens) win.PeelSvcScope.openResult({ ref: `iiblock:${id}`, title: `Wastewater Block ${id}`, html: '' }); }, focusSvc: id => calls.push(`focus:${id}`) },
  };
  win.window = win;
  const document = { addEventListener() {}, getElementById: () => null, dispatchEvent() {} };
  const ctx = vm.createContext({ window: win, document, console, Set, Map, CustomEvent: undefined, setTimeout: (f, ms) => timers.push([f, ms]) });
  vm.runInContext(src('js/svc-scope.js'), ctx);
  return { S: win.PeelSvcScope, state, calls, timers, shown, byId };
}
// Every retry the link has, to its last (restore's 40 × 500 ms after the first try): the number of tries.
const drain = L => { let n = 1; while (L.timers.length) { L.timers.shift()[0](); n++; } return n; };
test('phase 8a: a block is its servicing scope; an old ss=iiblock: link opens it once the servicing lookup is filled, the card only as the fallback', () => {
  const B12 = { id: 'dr:B12', block: '12', name: 'Block 12', kind: 'block', plant: 'Clarkson', downstream: null };
  let L = loadRestore({ byId: [[B12.id, B12]] });
  assert.equal(L.S.blockRef('12'), 'dr:B12'); assert.equal(L.S.blockRef(12), 'dr:B12');
  L.S.restore('iiblock:12');
  assert.equal(L.state.ss, 'dr:B12', 'the block’s scope'); assert.equal(L.S.hasResult(), false, 'no card');
  assert.deepEqual(L.shown, []); assert.equal(L.timers.length, 0);
  assert.ok(L.calls.includes('tab:overview') && L.calls.includes('link') && L.calls.includes('focus:dr:B12'), 'its Overview, the link (ss=dr:B12), the scope’s map focus');
  assert.equal(L.S.current().kind, 'block'); assert.equal(L.S.current().a.block, '12');
  // No servicing data yet: tried again (RESTORE's 500 ms), nothing opened.
  L = loadRestore({ servicing: false, byId: [[B12.id, B12]] });
  L.S.restore('iiblock:12');
  assert.equal(L.state.ss, null); assert.equal(L.timers.length, 1); assert.equal(L.timers[0][1], 500); assert.deepEqual(L.shown, []);
  // Servicing in, the lookup still empty (js/svc-data.js fills svcById seconds later): tried again, never the card.
  L = loadRestore({});
  L.S.restore('iiblock:12');
  assert.equal(L.state.ss, null); assert.equal(L.timers.length, 1); assert.deepEqual(L.shown, [], 'not the old card in that window');
  L.byId.set(B12.id, B12); L.state.servicing.drainage.push(B12); L.timers[0][0]();
  assert.equal(L.state.ss, 'dr:B12', 'the retry opens the scope'); assert.deepEqual(L.shown, []);
  // The lookup filled, the servicing model (its Overview's headroom) not built yet: tried again.
  L = loadRestore({ model: false, byId: [[B12.id, B12]] });
  L.S.restore('iiblock:12');
  assert.equal(L.state.ss, null); assert.equal(L.timers.length, 1); assert.deepEqual(L.shown, []);
  L.state.svcModel = {}; L.timers[0][0]();
  assert.equal(L.state.ss, 'dr:B12');
  // A filled lookup without that block (a block with no servicing area): the old card, once.
  L = loadRestore({ byId: [['dr:B1', { ...B12, id: 'dr:B1', block: '1', name: 'Block 1' }]] });
  L.S.restore('iiblock:12');
  assert.deepEqual(L.shown, ['12:card']); assert.equal(L.timers.length, 0); assert.equal(L.state.ss, null);
  // The restore row reads the filled lookup and the model, not servicing alone (the window js/search-filter.js
  // guards too); each try is told whether it is the last.
  const sc = src('js/svc-scope.js');
  assert.match(sc, /\n {4}iiblock: \(id, last\) => \{\n {6}const ready = App\(\)\.state\.servicing && SD\(\)\.svcById\.size && App\(\)\.state\.svcModel, ref = blockRef\(id\);\n {6}if \(ready && resolve\(ref\)\) \{ open\(ref\); return true; \}\n {6}if \(!ready && !last\) return false;/);
  assert.match(sc, /let done = false; try \{ done = f\(id, tries === 0\); \} catch \(e\) \{ done = false; \}/);
});

// Review of navigation phase 8a: a link whose data comes after restore's 20 s (a late data/dc-infra.json: the
// lookup fills only after it; a late or missing census: no model) lands on the block's card on the last try, as
// before 8a, the link kept (ss=iiblock:<n>), never dropped; once the model is built the block's scope replaces
// that card, if it is still what is open.
test('phase 8a: an old ss=iiblock: link with its data out at the last try opens the block’s card, then its scope once the model is built', () => {
  const B12 = { id: 'dr:B12', block: '12', name: 'Block 12', kind: 'block', plant: 'Clarkson', downstream: null };
  // The model never built (the census late or missing): the card, once, on the 41st try, the link kept.
  let L = loadRestore({ model: false, byId: [[B12.id, B12]], cardOpens: true });
  L.S.restore('iiblock:12');
  assert.equal(L.state.ss, null); assert.deepEqual(L.shown, []);
  assert.equal(drain(L), 41, 'the first try and its 40 retries');
  assert.deepEqual(L.shown, ['12:card'], 'showBlock(id, { card: true }) exactly once');
  assert.equal(L.state.ss, 'iiblock:12', 'the link kept'); assert.equal(L.S.hasResult(), true);
  L.S.settleLate(); assert.equal(L.timers.length, 0, 'no model yet: the card stays');
  // The model built (js/svc-tab.js renderSvcTab → settleLate): the block's scope replaces the card, once.
  L.state.svcModel = {}; L.S.settleLate();
  assert.equal(L.timers.length, 1); L.timers.shift()[0]();
  assert.equal(L.state.ss, 'dr:B12'); assert.equal(L.S.hasResult(), false); assert.equal(L.S.current().kind, 'block');
  L.S.settleLate(); assert.equal(L.timers.length, 0, 'once');
  // The lookup itself still empty at the last try (a late dc-infra.json): the card too, never dropped.
  L = loadRestore({ cardOpens: true });
  L.S.restore('iiblock:12'); drain(L);
  assert.deepEqual(L.shown, ['12:card']); assert.equal(L.state.ss, 'iiblock:12');
  L.byId.set(B12.id, B12); L.state.servicing.drainage.push(B12); L.S.settleLate(); L.timers.shift()[0]();
  assert.equal(L.state.ss, 'dr:B12', 'the lookup filled and the model built: the scope');
  // A card the reader closed, or left for another scope, stays left.
  L = loadRestore({ model: false, byId: [[B12.id, B12]], cardOpens: true });
  L.S.restore('iiblock:12'); drain(L); L.S.closeResult();
  L.state.svcModel = {}; L.S.settleLate(); assert.equal(L.timers.length, 0); assert.equal(L.state.ss, null);
  L.state.ss = 'plant:Clarkson'; L.S.settleLate(); assert.equal(L.timers.length, 0); assert.equal(L.state.ss, 'plant:Clarkson');
  // A card left between settleLate and its timer stays left too.
  L = loadRestore({ model: false, byId: [[B12.id, B12]], cardOpens: true });
  L.S.restore('iiblock:12'); drain(L); L.state.svcModel = {}; L.S.settleLate(); L.S.closeResult(); L.timers.shift()[0]();
  assert.equal(L.state.ss, null);
  // Wired: renderSvcTab asks once its model is built.
  assert.match(src('js/svc-tab.js'), /try \{ buildSvcTab\(bc\); \} finally \{ svcIdx = null; \}\n[^\n]*\n {4}if \(root\.PeelSvcScope && root\.PeelSvcScope\.settleLate\) root\.PeelSvcScope\.settleLate\(\);/);
});

// js/sewer-trace.js showBlock in a vm (the blocks layer's tap, a [data-block] button, App().showBlock): the scope
// once the model is built, the sheet raised from its peek on a phone; the card's loads before the model, for a
// link's last try (opt.card), and where no servicing area resolves.
function loadShowBlock(o = {}) {
  const opened = [], loads = [], snaps = [];
  let cur = null, snap = o.snap || 'peek';
  const state = { svcModel: o.model === false ? null : {}, servicing: {} };
  const win = {
    PeelUtil: require('../js/util.js'),
    PeelMapCore: { map: { getContainer: () => ({ classList: { toggle() {} }, dataset: {} }) }, canRotate: false },
    PeelSewerProfile: { mapBottom: {} },
    PeelApp: { state, getAnalysisSnap: () => snap, setAnalysisSnap: v => { snap = v; snaps.push(v); } },
    PeelDataTab: { shellNarrow: () => !!o.narrow },
    PeelSvcData: { syncDevsOff() {} },
    PeelSewerCap: { loadSewers: () => { loads.push('sewers'); return Promise.resolve(); } },
    PeelMapMarkers: { SEW: { data: null } },
    PeelSvcScope: { blockRef: id => `dr:B${id}`, resolve: ref => (o.areas || ['dr:B12']).includes(ref) ? { ref } : null, current: () => cur, open: ref => { opened.push(ref); cur = { ref }; } },
  };
  win.window = win;
  const layer = () => ({ addTo() { return this; }, clearLayers() {} });
  const ctx = vm.createContext({ window: win, document: { addEventListener() {} }, L: { layerGroup: layer }, fetch: () => { loads.push('blocks'); return Promise.resolve({ ok: false }); }, console, Set, Map, Promise });
  vm.runInContext(src('js/sewer-trace.js'), ctx);
  return { ST: win.PeelSewerTrace, opened, loads, snaps, state, snap: () => snap };
}
test('phase 8a review: a block tapped opens its scope once the model is built (the sheet up on a phone); before it, its card as before', async () => {
  // A phone, the sheet at its peek: the scope, and the sheet to half, as the card did through openResult.
  let B = loadShowBlock({ narrow: true });
  await B.ST.showBlock('12');
  assert.deepEqual(B.opened, ['dr:B12']); assert.deepEqual(B.loads, [], 'no card loads'); assert.equal(B.snap(), 'half');
  // The same block again: no second open (focusSvc would toggle its focus off).
  await B.ST.showBlock('12'); assert.deepEqual(B.opened, ['dr:B12']);
  B = loadShowBlock({ narrow: true, snap: 'full' }); await B.ST.showBlock('12');
  assert.deepEqual(B.opened, ['dr:B12']); assert.equal(B.snap(), 'full', 'a sheet higher than its peek stays'); assert.deepEqual(B.snaps, []);
  B = loadShowBlock({ narrow: false }); await B.ST.showBlock('12');
  assert.deepEqual(B.opened, ['dr:B12']); assert.deepEqual(B.snaps, [], 'a wide screen has no sheet');
  // The lookup filled, the model not built (a slow or missing census): the card's loads, no scope (whose Overview
  // reads the model), no throw.
  B = loadShowBlock({ narrow: true, model: false }); await B.ST.showBlock('12');
  assert.deepEqual(B.opened, []); assert.deepEqual(B.loads.sort(), ['blocks', 'sewers']);
  // A link's last try (opt.card) and a block with no servicing area: the card too.
  B = loadShowBlock({}); await B.ST.showBlock('12', { card: true });
  assert.deepEqual(B.opened, []); assert.deepEqual(B.loads.sort(), ['blocks', 'sewers']);
  B = loadShowBlock({ areas: [] }); await B.ST.showBlock('12');
  assert.deepEqual(B.opened, []); assert.deepEqual(B.loads.sort(), ['blocks', 'sewers']);
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

// Navigation phase 5 (design §3.6, §5 rows 94, 113): the site bar and its Tools ▾ went; one header on every
// tab and on the page. Removed by design: the bar's menu; asserted now on the header that replaces it.
test('the development\u2019s header: Trace sewer, Trace water, Check FSR, Servicing memo, Inquiry draft one click away, the rest behind ⋯; ☆ Watch beside the flags (navigation design §3.6)', () => {
  const PN = require('../js/panel.js');
  const t = PN.siteTools({ key: 'Brampton|1 A ST', title: '1 A ST', lat: 43.7, lng: -79.7 }, { watched: true, flags: '<span class="chip warn">Stalled 2.5 yrs</span>' });
  assert.deepEqual(t.tools.map(x => x.label), ['Trace sewer', 'Trace water', 'Check FSR', 'Servicing memo', 'Inquiry draft']);
  assert.deepEqual(t.more.map(x => x.label), ['Record allocation', 'Compare', 'Export (CSV)', 'Copy link']);
  const map = PN.toolsHTML(t, 'map'), page = PN.toolsHTML(t, 'page');
  const row = map.slice(map.indexOf('<div class="pnl-tools-row"'), map.indexOf('<details')), menu = map.slice(map.indexOf('<details'));
  for (const a of ['data-trace="Brampton|1 A ST"', 'data-wtrace="Brampton|1 A ST"', 'data-at="svc:fsr"', 'data-pnl-memo', 'data-inquiry']) { assert.ok(row.includes(a), a); assert.equal(map.split(a).length, 2, `${a} once`); }
  for (const a of ['data-scope-alloc', 'data-scope-compare', 'data-scope-export', 'data-share']) { assert.ok(menu.includes(a), a); assert.equal(map.split(a).length, 2, `${a} once`); }
  // ⋯ outside the row (a phone scrolls the row sideways; the menu is never clipped).
  assert.match(map, /<\/div><details class="site-more pnl-more"><summary class="btn small"[^>]*>⋯<\/summary>/);
  assert.match(map, /<div class="pnl-flags chips"><span class="pnl-flag-list"><span class="chip warn">Stalled 2\.5 yrs<\/span><\/span><button type="button" class="watch-btn on" data-watch="Brampton\|1 A ST" aria-pressed="true"[^>]*>★ Watching<\/button><\/div>/);
  // On a page Check FSR opens the page's FSR review; on the map Servicing › FSR review.
  assert.ok(page.includes('data-ws-page="fsr"') && !page.includes('data-at="svc:fsr"'));
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
  assert.equal(snap, 'full', 'on a phone the sheet opens all the way: the header and tabs sit above the result');
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
  // The Overview shows the result over the site (still checking the development scope first); the site's own
  // panel stays out (below: kept), and since navigation phase 5 it has no card or sub-views to hide.
  assert.match(ov, /if \(resultHost\(rsc && rsc\.kind === 'result' && \(!DV\(\)\.scopedDev\(\) \|\| rsc\.result\.keepDev\) \? rsc : null\)\) return;/);
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
  // The development's header holds it, beside the memo, on every tab of the map and on its page (navigation
  // phase 5; the site page's footer and the Overview's no longer repeat it).
  assert.match(src('js/panel.js'), /label: 'Inquiry draft', attrs: \{ 'data-inquiry': '' \}/);
  assert.match(src('js/panel.js'), /label: 'Servicing memo', attrs: \{ 'data-pnl-memo': '' \}/);
  assert.match(src('js/panel.js'), /\$\{h\.tools \? toolsHTML\(h\.tools, 'map'\) : ''\}/);
  assert.match(src('js/ws-pages.js'), /tools: s\.head\.tools/);
  assert.match(src('js/ws-pages.js'), /toolsHTML\(m\.tools, 'page'\)/);
  assert.match(src('js/overview-tab.js'), /foot: \{ primary: \{ label: 'Servicing memo', attrs: \{ 'data-pnl-memo': '' \}, title: '[^']*' \} \},/);
  assert.doesNotMatch(src('js/ws-pages.js').slice(src('js/ws-pages.js').indexOf('function site()'), src('js/ws-pages.js').indexOf('// ---- Growth in an area')), /'data-inquiry'|'data-watch'|Review its FSR/);
  assert.ok(src('js/ws-pages.js').includes('function site()'), 'the site page (FSR review its Servicing view; the page host at a development, navigation phase 6b)');
});

// Navigation phase 1 (AD-5, design §9 #5): Review outlets is a tool page reached from Records › Data
// checks, a site's path line (Review →) and the sidebar (QA/QC; since navigation phase 7 the QA/QC role's first
// shortcut, owner decisions 5 and 6); each way in is a data-ws-page button, which opens the page from the map and
// from a page alike (one document-wide handler).
test('Review outlets opens from Records › Data checks, a site’s path line and the QA/QC shortcut', () => {
  const r = src('js/records-tab.js');
  assert.match(r, /btn: '<button type="button" class="btn small link" data-ws-page="outlets">Review outlets →<\/button>'/);
  assert.match(r, /<p class="small muted">\$\{OUTLETS\.what\}: \$\{OUTLETS\.btn\}<\/p>`;/, 'the full table (checksHTML)');
  // (navigation phase 2: the list is "Where developments discharge", with the count to review once the DC
  // model is worked out, and the footer's secondary action; tests/servicing-records.test.js runs it)
  assert.match(r, /\{ title: 'Where developments discharge', rows: \[\{ attrs: \{ 'data-ws-page': 'outlets', title: 'Review outlets: check and fix where each development discharges' \}, html: `<div class="pnl-r-top"><span class="pnl-r-name">Review outlets →<\/span>\$\{n == null \? '' : `<span class="pnl-r-fig">\$\{fmtNum\(n\)\}<small>to review<\/small><\/span>`\}<\/div><small class="pnl-r-line">\$\{OUTLETS\.what\}<\/small>` \}\], total: 1 \}\]/, 'the panel: its own list, whatever the checks');
  assert.match(r, /secondary: \[\{ label: 'Review outlets', attrs: \{ 'data-ws-page': 'outlets' \}/, 'and its footer');
  assert.match(src('js/overview-tab.js'), /data-ws-page="outlets" data-dvo="pick-dev"/, 'the path line');
  const W = require('../js/workspaces.js');
  assert.equal(W.roleAttrs(W.ROLES.find(r => r.key === 'qa').links[0])['data-ws-page'], 'outlets', 'the QA/QC role’s shortcut');
  assert.match(src('js/workspaces.js'), /const pg = e\.target\.closest\('\[data-ws-page\]'\);\n {4}if \(pg\) \{ e\.preventDefault\(\); menuOpen = false; openPage\(pg\.dataset\.wsPage, \{ at: pg\.dataset\.wsAt, fresh: pg\.dataset\.wsFresh != null \}\); return; \}/);
  assert.match(src('js/tips.js'), /Also Records › Data checks \(Review outlets →\), and "Review →" on a development’s Overview/);
});
