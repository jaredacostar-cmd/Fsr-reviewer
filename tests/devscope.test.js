'use strict';
/* Phase 3 scope tests: js/devscope.js against a minimal DOM stub. The module is
 * browser code (attaches to window); here we drive DevScope.open/current/close
 * with a fake PeelApp.scope bridge and assert the UI transitions it performs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

function makeEl() {
  return {
    hidden: true, innerHTML: '', open: false, textContent: '',
    dataset: {},
    _attrs: {},
    setAttribute(k, v) { this._attrs[k] = v; },
    getAttribute(k) { return this._attrs[k]; },
    addEventListener(t, fn) { (this._l = this._l || {})[t] = fn; },
    querySelector() { return null; },
    dispatchClick(target) { this._l && this._l.click && this._l.click({ target }); },
  };
}

let els;
function resetDOM() {
  els = {
    '#ftab-dev': makeEl(),
    '#pane-dev': makeEl(),
    '#site-bar': makeEl(),
    '.map-opts .mo-panel': makeEl(),
  };
  els['.map-opts .mo-panel'].open = true; // Layers panel starts unfolded
  const curTab = makeEl();
  curTab.dataset.tab = 'overview';
  els['.f-tab[aria-selected="true"]'] = curTab;
  global.document = { querySelector: s => els[s] || null };
}

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
    devFlags: (p, st) => { devFlagsArgs.push(st); return ['<span class="chip warn">Stalled 2.5 yrs</span>', '<span class="chip warn">Under appeal (OLT)</span>', '<span class="chip warn">Needs planned main 2030</span>']; },
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

const P = { key: 'dev1', title: '123 Main St', phase: 'approved', municipality: 'Mississauga' };

function loadModule() {
  resetDOM();
  delete require.cache[require.resolve('../js/devscope.js')];
  global.window = {};
  global.window.PeelPhases = { PHASE_BY_KEY: { approved: { label: 'Approved' } } };
  global.window.PeelApp = { scope: mockBridge() };
  return require('../js/devscope.js');
}

test('open: sets scope, shows the Development tab and renders the site bar', async () => {
  const DevScope = loadModule();
  DevScope.open(P);
  await Promise.resolve(); await Promise.resolve(); // let the trace promise settle
  assert.equal(DevScope.current(), P);
  assert.equal(els['#ftab-dev'].hidden, false);
  assert.ok(calls.some(c => c[0] === 'showFootTab' && c[1] === 'dev'), 'Development tab selected');
  assert.ok(calls.includes('renderTrail') || calls.some(c => c[0] === 'renderTrail'), 'trail re-rendered');
  for (const c of ['setProject', 'setDaContext', 'ensureCouncil', 'highlight', 'flyToSite', 'traceDev', 'writeLink'])
    assert.ok(calls.some(x => x[0] === c), `bridge ${c} called`);
  const bar = els['#site-bar'];
  assert.equal(bar.hidden, false);
  assert.match(bar.innerHTML, /123 Main St/);
  assert.match(bar.innerHTML, /Approved/);
  assert.match(bar.innerHTML, /100 units/);
  assert.match(bar.innerHTML, /250 pop/);
  assert.match(bar.innerHTML, /5\.5 L\/s max day/);
  assert.match(bar.innerHTML, /7\.2 L\/s peak wet/);
  assert.match(bar.innerHTML, /Zone 5/);
  assert.match(bar.innerHTML, /G\.E\. Booth/);
  assert.match(bar.innerHTML, /Stalled 2\.5 yrs/);
  assert.match(bar.innerHTML, /Under appeal \(OLT\)/);
  assert.match(bar.innerHTML, /Needs planned main 2030/);
  assert.ok(devFlagsArgs.length && devFlagsArgs[0].works && devFlagsArgs[0].works.gap === true, 'st.works set for devFlags (DC-works flag)');
  assert.match(bar.innerHTML, /No zone \/ catchment within 5 km/);
  for (const a of ['data-trace="dev1"', 'data-wtrace="dev1"', 'data-watch="dev1"', 'data-memo', 'data-scope-alloc', 'data-scope-fsr', 'data-scope-close'])
    assert.match(bar.innerHTML, new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `site bar has ${a}`);
  // Layers panel folded.
  assert.equal(els['.map-opts .mo-panel'].open, false);
  // Trace drew without being cleared (scope still current).
  assert.ok(!calls.some(c => c[0] === 'clearTrace'), 'own trace not cleared');
});

test('open is idempotent and the FSR note toggles', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  DevScope.open(P);
  assert.equal(DevScope.current(), P);
  const bar = els['#site-bar'];
  const btn = { closest: sel => (sel === '[data-scope-fsr]' ? btn : null), setAttribute(k, v) { this[k] = v; } };
  const note = { hidden: true };
  bar.querySelector = () => note;
  bar.dispatchClick(btn);
  assert.equal(note.hidden, false);
  assert.equal(btn['aria-expanded'], 'true');
  bar.dispatchClick(btn);
  assert.equal(note.hidden, true);
});

test('close: clears scope, restores tab, unfades and unfolds', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  calls.length = 0;
  DevScope.close();
  assert.equal(DevScope.current(), null);
  assert.equal(els['#ftab-dev'].hidden, true);
  assert.equal(els['#pane-dev'].hidden, true);
  assert.equal(els['#site-bar'].hidden, true);
  assert.equal(els['#site-bar'].innerHTML, '');
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

test('Record allocation routes to the allocations sub-view', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  const bar = els['#site-bar'];
  const btn = { closest: sel => (sel === '[data-scope-alloc]' ? btn : null) };
  bar.dispatchClick(btn);
  assert.ok(calls.some(c => c[0] === 'showAllocSub'), 'showAllocSub called');
});

test('the site-bar × clears the scope', () => {
  const DevScope = loadModule();
  DevScope.open(P);
  const bar = els['#site-bar'];
  const btn = { closest: sel => (sel === '[data-scope-close]' ? btn : null) };
  bar.dispatchClick(btn);
  assert.equal(DevScope.current(), null);
});

test('open degrades without the app.js bridge', () => {
  resetDOM();
  delete require.cache[require.resolve('../js/devscope.js')];
  global.window = {};
  global.window.PeelPhases = { PHASE_BY_KEY: { approved: { label: 'Approved' } } };
  const DevScope = require('../js/devscope.js');
  DevScope.open(P); // must not throw
  assert.equal(DevScope.current(), P);
  assert.equal(els['#site-bar'].hidden, false);
  assert.match(els['#site-bar'].innerHTML, /123 Main St/);
  DevScope.close();
  assert.equal(DevScope.current(), null);
});

test('refresh: no-op when no scope is open', () => {
  const DevScope = loadModule();
  DevScope.refresh(); // must not throw
  assert.deepEqual(calls, [], 'no bridge calls without a scope');
  assert.equal(els['#site-bar'].hidden, true);
});

test('refresh: re-renders without moving the map or switching tabs', async () => {
  const DevScope = loadModule();
  // Extend the mock bridge with renderScopeTab for this test.
  global.window.PeelApp.scope.renderScopeTab = () => calls.push(['renderScopeTab']);
  let devTabRenders = 0;
  global.window.DevTab = { render: () => { devTabRenders++; } };
  DevScope.open(P);
  await Promise.resolve(); await Promise.resolve();
  calls.length = 0;
  DevScope.refresh();
  assert.equal(DevScope.current(), P, 'scope still open');
  assert.ok(calls.some(c => c[0] === 'renderTrail'), 'trail re-rendered');
  assert.ok(calls.some(c => c[0] === 'renderScopeTab'), 'current tab re-rendered');
  assert.ok(calls.some(c => c[0] === 'writeLink'), 'share link updated');
  assert.equal(devTabRenders, 2, 'Development tab body re-rendered (open + refresh)');
  assert.ok(!calls.some(c => c[0] === 'flyToSite'), 'map not moved');
  assert.ok(!calls.some(c => c[0] === 'showFootTab'), 'tab selection unchanged');
  assert.ok(!calls.some(c => c[0] === 'traceDev'), 'trace not redrawn');
  assert.equal(els['#site-bar'].hidden, false);
  assert.match(els['#site-bar'].innerHTML, /123 Main St/);
});
