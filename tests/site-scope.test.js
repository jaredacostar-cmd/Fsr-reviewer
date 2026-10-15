'use strict';
// Stage 1, item 2: at a development's scope a sub-view with nothing to show is hidden, never blank,
// and area-only content (pace, census, 2051, by-plan tables, plant and facility tables, allocations,
// DC funding, the Region-wide construction list) never renders there.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
function loadTabs() {
  const el = () => null, store = { get: (k, d) => d, set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const window = { PeelUtil: { store }, document };
  const ctx = { window, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}

// What each sub-view shows at a development's scope (the audit of 0 Heritage Rd, Brampton).
const AT_SITE = {
  growth: { pipeline: 'show', census2051: 'hide', byplan: 'hide', timing: 'hide' },
  ww: { plants: 'hide', catchments: 'show', alloc: 'hide', pumpstations: 'hide' },
  water: { capacity: 'hide', zones: 'show', facilities: 'hide', hydro: 'hide' },
  dca: { timing: 'show', build: 'hide', eas: 'show', recommendations: 'hide', funding: 'hide' },
};

test('site scope: every sub-view is either shown with site content or hidden', () => {
  const AT = loadTabs();
  for (const [tab, subs] of Object.entries(AT_SITE)) {
    assert.deepEqual([...AT.TABSUBS[tab].valid].sort(), Object.keys(subs).sort(), `${tab}: the inventory covers every sub-view`);
    for (const [sub, want] of Object.entries(subs)) assert.equal(AT.siteHidden(tab, sub), want === 'hide', `${tab} › ${sub} at site scope: ${want}`);
  }
});

test('site scope: a hidden sub-view falls back to the first one with site content; Peel scope keeps the pick', () => {
  const AT = loadTabs();
  assert.equal(AT.subFor('ww', 'plants', true), 'catchments');
  assert.equal(AT.subFor('water', 'capacity', true), 'zones');
  assert.equal(AT.subFor('growth', 'byplan', true), 'pipeline');
  assert.equal(AT.subFor('dca', 'funding', true), 'timing');
  assert.equal(AT.subFor('dca', 'eas', true), 'eas');
  for (const [tab, subs] of Object.entries(AT_SITE)) for (const sub of Object.keys(subs)) assert.equal(AT.subFor(tab, sub, false), sub, `${tab} › ${sub} stays at Peel scope`);
});

test('site scope: hidden sub-view buttons get .site-off (CSS hides them); Growth leaves out completions and pace', () => {
  const at = src('js/analysis-tabs.js');
  assert.match(at, /b\.classList\.toggle\('site-off', site && siteHidden\(tk, b\.dataset\[s\.attr\]\)\)/);
  assert.match(src('css/app.css'), /#analysis\.site-scope \.site-off \{ display: none; \}/);
  assert.match(src('js/growth-ui.js'), /\$\{site \? '' : strip \+ muniTable\}/, 'completions by municipality are area content');
});

test('site scope: in-panel links land on a sub-view with site content (no dead links)', () => {
  const AT = loadTabs();
  // Overview › "Files & history (Records) →", "Servicing →" (water / ww), "Capital →"; Capital's
  // "Servicing › Wastewater →": the stored sub-view may be one hidden at site scope; it falls back.
  for (const [tab, stored] of [['ww', 'plants'], ['ww', 'alloc'], ['water', 'capacity'], ['water', 'facilities'], ['dca', 'build'], ['growth', 'byplan']]) {
    const v = AT.subFor(tab, stored, true);
    assert.ok(v && !AT.siteHidden(tab, v), `${tab} (stored ${stored}) lands on ${v}`);
  }
  assert.match(src('js/fsr.js'), /homeLine\('ww', 'Servicing › Wastewater'\)/, 'no "Wastewater tab": the tab is Servicing');
  assert.doesNotMatch(src('js/census-view.js'), /'Wastewater tab'/);
  assert.match(src('js/overview-tab.js'), /data-ov-tab="records">Files &amp; history \(Records\) →/);
});
