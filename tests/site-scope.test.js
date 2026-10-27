'use strict';
// Stage 1, item 2 (Stage 2 tabs): at a development's scope a sub-view with nothing to show is hidden,
// never blank, and area-only content (pace, Areas, Timing, the capacity table, allocations, checks,
// DC funding, the Region-wide projects list, Peel's sources) never renders there.
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

// What each sub-view shows at a development's scope (the audit of 0 Heritage Rd, Brampton; Stage 2).
// (Capital is one view at a site: its EAs are in DC timing's site panel; FSR review is a development's
// Servicing view, navigation phase 5.)
const AT_SITE = {
  growth: { pipeline: 'show', areas: 'hide', timing: 'hide' },
  svc: { capacity: 'hide', network: 'show', fsr: 'show' },
  dca: { timing: 'show', eas: 'hide', projects: 'hide' },
  records: { sources: 'hide', checks: 'hide', files: 'show' },
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
  assert.equal(AT.subFor('svc', 'capacity', true), 'network');
  // (a stored Allocations pick is Capacity now, hidden at a site; a stored Model checks pick is Records ›
  // Data checks, Files at a site)
  assert.equal(AT.subFor('svc', AT.migrateSub('svc', 'alloc').sub, true), 'network');
  assert.equal(AT.subFor('records', AT.migrateSub('svc', 'checks').sub, true), 'files');
  assert.equal(AT.subFor('growth', AT.migrateSub('growth', 'ledger').sub, true), 'pipeline');   // (a stored Ledger pick is Forecast now, hidden at a site)
  assert.equal(AT.subFor('growth', 'areas', true), 'pipeline');
  assert.equal(AT.subFor('dca', 'projects', true), 'timing');
  assert.equal(AT.subFor('dca', 'eas', true), 'timing', 'a stored EAs pick lands on the one Capital view');
  assert.equal(AT.subFor('records', 'sources', true), 'files');
  assert.equal(AT.subFor('records', 'files', false), 'sources', 'Peel has no files of its own');
  assert.equal(AT.subFor('svc', 'fsr', false), 'capacity', 'FSR review is a development\u2019s');
  assert.equal(AT.subFor('svc', 'fsr', true), 'fsr');
  for (const [tab, subs] of Object.entries(AT_SITE)) for (const sub of Object.keys(subs)) {
    if ((tab === 'dca' && sub === 'funding') || (tab === 'records' && sub === 'files') || (tab === 'svc' && sub === 'fsr')) continue;   // Labs / site only
    assert.equal(AT.subFor(tab, sub, false), sub, `${tab} › ${sub} stays at Peel scope`);
  }
});

test('site scope: hidden sub-view buttons get .site-off (CSS hides them); Growth leaves out completions and pace', () => {
  const at = src('js/analysis-tabs.js');
  assert.match(at, /b\.classList\.toggle\('site-off', hiddenAt\(scopeOf\(tk\), tk, b\.dataset\[s\.attr\]\)\)/);
  assert.match(src('css/app.css'), /\.f-subtabs \.site-off, #analysis\.site-scope #screen-note-top \{ display: none !important; \}/);
  assert.match(src('js/growth-ui.js'), /\$\{site \? siteCompareHTML\(root\.PeelDevVerdict && root\.PeelDevVerdict\.scopedDev\(\)\) : strip \+ muniTable\}/, 'completions by municipality are area content; a site shows how it compares');
});

test('site scope: in-panel links land on a sub-view with site content (no dead links)', () => {
  const AT = loadTabs();
  for (const [tab, stored] of [['svc', 'capacity'], ['svc', 'alloc'], ['svc', 'checks'], ['dca', 'projects'], ['dca', 'dcproj'], ['dca', 'eas'], ['growth', 'areas'], ['growth', 'ledger'], ['records', 'checks']]) {
    // (a stored pick goes through the alias it takes first: Servicing › Model checks is Records › Data checks)
    const r = AT.migrateSub(tab, stored) || { tab, sub: stored }, v = AT.subFor(r.tab, r.sub, true);
    assert.ok(v && !AT.siteHidden(r.tab, v) && AT.TABSUBS[r.tab].valid.includes(v), `${tab} (stored ${stored}) lands on ${r.tab}:${v}`);
  }
  assert.match(src('js/fsr.js'), /homeLine\('svc:network', 'Servicing › Network'\)/, 'no "Wastewater tab": the tab is Servicing');
  assert.doesNotMatch(src('js/census-view.js'), /'Wastewater tab'/);
  // (navigation phase 5: the card's "Files & history (Records)" link went with the card; the header's
  // "n files · history ›" opens them on every tab)
  assert.doesNotMatch(src('js/overview-tab.js'), /Files &amp; history/);
  assert.match(src('js/panel.js'), /data-dev-hist="" title="History, with each file's source record"/);
});
