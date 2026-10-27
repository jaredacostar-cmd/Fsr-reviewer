'use strict';
/* Phase 3 scope tests: js/devscope.js against a minimal DOM stub. The module is
 * browser code (attaches to window); here we drive DevScope.open/current/close
 * with a fake PeelApp.scope bridge and assert the UI transitions it performs.
 * Navigation phase 5: the site bar went (design §5 row 113; removed by design: its hidden title,
 * facts and servicing line, which the Overview's figures and Servicing rows carry, tests/dev-layout.test.js,
 * and its Tools ▾). The header is every panel's (js/panel.js siteHead); DevScope works out its flags
 * (flagsFor) and runs the ⋯ menu's Record allocation, Compare and Export (one document listener).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

function makeEl() {
  return { hidden: true, innerHTML: '', open: false, textContent: '', dataset: {} };
}

let els, listeners;
function resetDOM() {
  els = { '.map-opts .mo-panel': makeEl() };
  els['.map-opts .mo-panel'].open = true; // Layers panel starts unfolded
  const curTab = makeEl();
  curTab.dataset.tab = 'overview';
  els['.f-tab[aria-selected="true"]'] = curTab;
  listeners = [];
  global.document = { querySelector: s => els[s] || null, addEventListener: (t, fn) => listeners.push([t, fn]) };
}
// A click on the document (the header's ⋯ menu items, on any tab or the page).
const click = sel => { const btn = { closest: s => (s === sel ? btn : null) }; for (const [t, fn] of listeners) if (t === 'click') fn({ target: btn }); };

const calls = [];
const devFlagsArgs = [];
function mockBridge() {
  calls.length = 0; devFlagsArgs.length = 0;
  return {
    setProject: p => calls.push(['setProject', p && p.key]),
    getProject: () => null,
    renderTrail: () => calls.push(['renderTrail']),
    showFootTab: k => calls.push(['showFootTab', k]),
    highlight: p => calls.push(['highlight', p && p.key]),
    flyToSite: p => calls.push(['flyToSite', p && p.key]),
    traceDev: p => { calls.push(['traceDev', p.key]); return Promise.resolve({}); },
    clearTrace: () => calls.push(['clearTrace']),
    traceKey: () => 'dev1',
    statusOf: () => ({ stalled: true, years: 2.5, sig: [{ kind: 'appeal', text: 'OLT' }] }),
    svcFacts: () => ({ e: { totalUnits: 100, population: 250 }, cb: { water: { maxDay: 5.5 }, wastewater: { wetPeak: 7.2 } }, z: { name: 'Pressure zone 5' }, zNear: 0, pl: 'Lakeview', dNear: 0, sps: [] }),
    devWorks: () => ({ gap: true, needBy: 2030 }),
    devFlags: (p, st) => { devFlagsArgs.push(st); return ['<span class="chip warn">Stalled 2.5 yrs</span>', '<span class="chip warn">Under appeal (OLT)</span>', ...(st.works && st.works.gap ? [`<span class="chip warn">Needs planned main ${st.works.needBy}</span>`] : [])]; },
    qualityOf: () => 'far',
    QUALITY: { far: ['#c00', 'No zone / catchment within 5 km'] },
    setDaContext: () => calls.push(['setDaContext']),
    ensureCouncil: () => calls.push(['ensureCouncil']),
    showAllocSub: () => calls.push(['showAllocSub']),
    writeLink: () => calls.push(['writeLink']),
    estimate: () => ({ totalUnits: 10, population: 25 }),
    isWatched: () => false,
    PLANT_SHORT: { Lakeview: 'G.E. Booth' },
    fmt: { esc: s => String(s ?? ''), fmtNum: n => String(n), uUnits: n => `${n} units`, uPop: n => `${n} pop`, uLs: v => `${v} L/s`, roundPop: n => n, dot: () => '<i class="dot"></i>' },
  };
}

const P = { key: 'dev1', title: '123 Main St', phase: 'approved', municipality: 'Mississauga', lat: 43.6, lng: -79.6 };

function loadModule() {
  resetDOM();
  delete require.cache[require.resolve('../js/devscope.js')];
  global.window = {};
  global.window.PeelPhases = { PHASE_BY_KEY: { approved: { label: 'Approved' } } };
  global.window.PeelApp = { scope: mockBridge(), state: { svcModel: {}, dcInfra: {}, council: null } };
  return require('../js/devscope.js');
}

test('open: sets the scope, calls the bridge, works out the header’s flags', async () => {
  const DevScope = loadModule();
  DevScope.open(P);
  await Promise.resolve(); await Promise.resolve(); // let the trace promise settle
  assert.equal(DevScope.current(), P);
  assert.ok(calls.some(c => c[0] === 'showFootTab' && c[1] === 'dev'), 'its Overview selected');
  assert.ok(calls.some(c => c[0] === 'renderTrail'), 'trail re-rendered');
  for (const c of ['setProject', 'setDaContext', 'ensureCouncil', 'highlight', 'flyToSite', 'writeLink'])
    assert.ok(calls.some(x => x[0] === c), `bridge ${c} called`);
  // Opening doesn't trace the sewer path (that zoomed the map out); Trace sewer does.
  assert.ok(!calls.some(x => x[0] === 'traceDev'), 'sewer path not traced on open');
  const f = DevScope.flagsFor(P);
  for (const re of [/Stalled 2\.5 yrs/, /Under appeal \(OLT\)/, /Needs planned main 2030/, /No zone \/ catchment within 5 km/]) assert.match(f, re);
  assert.ok(devFlagsArgs.length && devFlagsArgs[0].works && devFlagsArgs[0].works.gap === true, 'st.works set for devFlags (DC-works flag)');
  // The data-quality flag opens Records (the development's files), as the bar's did.
  assert.match(f, /<button type="button" class="chip chip-link" data-at="records:files" title="Data quality: the files and how the homes were counted, in Records"><span class="q-dot" style="background:#c00" aria-hidden="true"><\/span>No zone \/ catchment within 5 km/);
  // Only the open development's; nothing for another.
  assert.equal(DevScope.flagsFor({ key: 'other' }), '');
  // No bar: nothing writes a #site-bar, and nothing reads #ftab-dev / #pane-dev (gone since Stage 2).
  assert.doesNotMatch(src('js/devscope.js'), /site-bar|renderSiteBar|#ftab-dev|#pane-dev|data-scope-close|data-scope-fsr|data-memo\b/);
  // Layers panel folded.
  assert.equal(els['.map-opts .mo-panel'].open, false);
  assert.ok(!calls.some(c => c[0] === 'clearTrace'), 'no trace cleared on open');
});

test('the flags are worked out once, and again when the data they read has come in (the DC program, the servicing model, the council items)', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  const n = devFlagsArgs.length;
  DevScope.flagsFor(P); DevScope.flagsFor(P);
  assert.equal(devFlagsArgs.length, n, 'cached for the open development');
  // A panel built before the DC data loaded: "Needs planned main" once it is in.
  const S = global.window.PeelApp.state, h = global.window.PeelApp.scope;
  h.devWorks = () => ({ gap: false });
  S.dcInfra = {};   // (a new DC program object)
  assert.doesNotMatch(DevScope.flagsFor(P), /Needs planned main/);
  h.devWorks = () => ({ gap: true, needBy: 2031 });
  S.svcModel = {};
  assert.match(DevScope.flagsFor(P), /Needs planned main 2031/);
  S.council = { files: {} };
  DevScope.flagsFor(P);
  assert.equal(devFlagsArgs.length, n + 3, 'each new input once');
});

test('open is idempotent; Check FSR opens Servicing › FSR review (the header’s, not a box under a bar)', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  DevScope.open(P);
  assert.equal(DevScope.current(), P);
  const PN = require('../js/panel.js');
  const fsr = PN.siteTools(P).tools.find(t => t.label === 'Check FSR');
  assert.deepEqual(fsr.attrs, { 'data-at': 'svc:fsr' });
  assert.deepEqual(fsr.page, { 'data-ws-page': 'fsr' });
});

test('close: clears the scope, restores the tab, unfolds', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  calls.length = 0;
  DevScope.close();
  assert.equal(DevScope.current(), null);
  assert.equal(DevScope.flagsFor(P), '', 'no flags once closed');
  assert.ok(calls.some(c => c[0] === 'showFootTab' && c[1] === 'overview'), 'returns to the previous tab');
  assert.ok(calls.some(c => c[0] === 'clearTrace'), 'own sewer trace cleared');
  assert.ok(calls.some(c => c[0] === 'renderTrail'), 'trail re-rendered');
  assert.equal(els['.map-opts .mo-panel'].open, true, 'Layers panel unfolded');
  assert.ok(calls.some(c => c[0] === 'setProject' && c[1] === null), 'app currentProject cleared');
});

test('close is a no-op with no scope open', () => {
  const DevScope = loadModule();
  DevScope.close();
  assert.ok(!calls.some(c => c[0] === 'showFootTab'), 'no tab switch');
});

test('Record allocation (the header’s ⋯) routes to the allocation fold', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  assert.equal(listeners.filter(([t]) => t === 'click').length, 1, 'one document listener');
  DevScope.open(P);
  assert.equal(listeners.filter(([t]) => t === 'click').length, 1, 'wired once');
  click('[data-scope-alloc]');
  assert.ok(calls.some(c => c[0] === 'showAllocSub'), 'showAllocSub called');
});

test('the header’s × clears the scope', () => {
  const PN = require('../js/panel.js');
  assert.deepEqual(PN.siteHead(P).close, { 'data-pnl-dev-close': '' });
  assert.match(src('js/panel.js'), /if \(e\.target\.closest\('\[data-pnl-dev-close\]'\)\) \{ if \(root\.DevScope\) root\.DevScope\.close\(\); return; \}/);
});

test('open degrades without the app.js bridge', () => {
  resetDOM();
  delete require.cache[require.resolve('../js/devscope.js')];
  global.window = {};
  global.window.PeelPhases = { PHASE_BY_KEY: { approved: { label: 'Approved' } } };
  const DevScope = require('../js/devscope.js');
  DevScope.open(P); // must not throw
  assert.equal(DevScope.current(), P);
  assert.equal(DevScope.flagsFor(P), '', 'no flags without the bridge');
  DevScope.close();
  assert.equal(DevScope.current(), null);
});

test('refresh: no-op when no scope is open', () => {
  const DevScope = loadModule();
  DevScope.refresh(); // must not throw
  assert.deepEqual(calls, [], 'no bridge calls without a scope');
});

test('refresh: re-renders without moving the map or switching tabs; the flags worked out again', async () => {
  const DevScope = loadModule();
  // Extend the mock bridge with renderScopeTab for this test.
  global.window.PeelApp.scope.renderScopeTab = () => calls.push(['renderScopeTab']);
  let devTabRenders = 0;
  global.window.DevTab = { render: () => { devTabRenders++; } };
  DevScope.open(P);
  await Promise.resolve(); await Promise.resolve();
  calls.length = 0;
  const n = devFlagsArgs.length;
  DevScope.refresh();
  assert.equal(DevScope.current(), P, 'scope still open');
  assert.ok(calls.some(c => c[0] === 'renderTrail'), 'trail re-rendered');
  assert.ok(calls.some(c => c[0] === 'renderScopeTab'), 'current tab re-rendered');
  assert.ok(calls.some(c => c[0] === 'writeLink'), 'share link updated');
  assert.equal(devTabRenders, 2, 'Development tab body re-rendered (open + refresh)');
  assert.ok(!calls.some(c => c[0] === 'flyToSite'), 'map not moved');
  assert.ok(!calls.some(c => c[0] === 'showFootTab'), 'tab selection unchanged');
  assert.ok(!calls.some(c => c[0] === 'traceDev'), 'trace not redrawn');
  assert.equal(devFlagsArgs.length, n + 1, 'the flags again (background data arrived)');
  assert.match(DevScope.flagsFor(P), /Stalled 2\.5 yrs/);
});

test('Compare and Export (the header’s ⋯) are guarded: they call their modules when present, no-throw when absent', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  const added = [], csv = [];
  global.window.PeelToolCompare = { addDevelopment: p => added.push(p.key) };
  global.window.PeelExports = { exportDevsCSV: (list, name) => csv.push([list[0].key, name]) };
  click('[data-scope-compare]');
  assert.deepEqual(added, ['dev1'], 'open development handed to the Compare tool');
  click('[data-scope-export]');
  assert.deepEqual(csv, [['dev1', 'peel-123-main-st.csv']]);
  delete global.window.PeelToolCompare; delete global.window.PeelExports;
  click('[data-scope-compare]'); click('[data-scope-export]'); // must not throw without the sibling modules
  assert.deepEqual(added, ['dev1'], 'nothing added when the module is absent');
});
