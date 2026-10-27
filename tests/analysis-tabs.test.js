'use strict';
/* Analysis-tab restructure tests (Phase 4, Worker A shell):
 * - the final tab set (Overview · Growth · Water · Wastewater · Capital + Development/Tool result),
 *   with the removed tabs' buttons and panes gone from index.html;
 * - the new sub-view shells (growth pipeline/census, water hydro, ww pumpstations, DC timing/rec/funding);
 * - tab-key migration for old share links / stored prefs (migrateTabKey, pure — extracted and unit-tested);
 * - sub-view defaults and persistence (gSub/dcSub);
 * - the share-link gs/dcs params;
 * - the GearPages registry + openGearPage contract;
 * - the change log living in the Help menu with the "new" dot on Help.
 *
 * js/app.js is a browser IIFE, so these tests read it as source: structural
 * assertions plus real unit tests of the pure logic extracted from it.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Phase 6: js/app.js was split into js/util.js + 46 area modules. Structural
// assertions read the whole js/ tree (app core + modules) as one source.
const JS_DIR = path.join(__dirname, '..', 'js');
const APP = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extract a `const name = (args) => { ... };` (2-space indent) and evaluate it standalone (pure only).
function extractArrow(name) {
  const m = new RegExp(`const ${name} = ([\\s\\S]*?\\n  \\});`).exec(APP);
  assert.ok(m, `const ${name} not found in js/`);
  return new Function(`return (${m[1]});`)();
}

// Stage 2: migrateTabKey uses the module's TAB_KEYS and SUB_MAP: load js/analysis-tabs.js in a vm.
function loadTabs() {
  const el = () => null, store = { get: (k, d) => d, set: () => {} };
  const document = { querySelector: el, querySelectorAll: () => [], getElementById: el, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  require('node:vm').runInNewContext(fs.readFileSync(path.join(JS_DIR, 'analysis-tabs.js'), 'utf8'), ctx);
  return ctx.module.exports;
}
const AT = loadTabs();
const migrateTabKey = AT.migrateTabKey;
const plain = o => JSON.parse(JSON.stringify(o));

test('migrateTabKey: removed tabs map onto the new tab set', () => {
  assert.deepEqual(plain(migrateTabKey('demand')), { tab: 'growth' });
  assert.deepEqual(plain(migrateTabKey('census')), { tab: 'growth', gSub: 'areas' });
  assert.deepEqual(plain(migrateTabKey('criteria')), { tab: 'overview' });
  assert.deepEqual(plain(migrateTabKey('log')), { tab: 'overview' });
});

test('migrateTabKey: current tabs are untouched; the Wastewater / Water halves are Servicing', () => {
  for (const t of ['overview', 'growth', 'svc', 'dca', 'records']) assert.deepEqual(plain(migrateTabKey(t)), { tab: t }, `changed current tab ${t}`);
  assert.deepEqual(plain(migrateTabKey('developments')), { tab: 'overview' });
  assert.deepEqual(plain(migrateTabKey('tool')), { tab: 'overview' });
  assert.deepEqual(plain(migrateTabKey('dev')), { tab: 'overview' });
  assert.deepEqual(plain(migrateTabKey('plants')), { tab: 'svc', svcSub: 'capacity' });
  assert.deepEqual(plain(migrateTabKey('ww')), { tab: 'svc', svcSub: 'capacity' });
  assert.deepEqual(plain(migrateTabKey('water', 'zones')), { tab: 'svc', svcSub: 'network' });
});

test('migrateTabKey is applied to the stored tab pref and to share links', () => {
  assert.ok(APP.includes('const old = footPref, m = migrateTabKey(footPref); footPref = m.tab;'), 'stored footPref not migrated');
  assert.ok(APP.includes('const m = AT().migrateTabKey(t, oldSub);'), 'share-link t param not migrated');
});

test('sub-view defaults: gSub pipeline, dcSub timing, Servicing capacity, Records sources', () => {
  for (const d of [`store.get('gSub', 'pipeline')`, `store.get('dcSub', 'timing')`, `store.get('svcSub', null)`, `store.get('rSub', 'sources')`]) {
    assert.ok(APP.includes(d), `default missing: ${d}`);
  }
  // Stored picks from before Stage 2 (wwSub / wSub) map onto the Servicing sub-views.
  assert.ok(APP.includes(`store.get(sys === 'water' ? 'wSub' : 'wwSub', '')`), 'old ww / water sub-view prefs not migrated');
});

test('sub-view valid values: at most four per tab', () => {
  assert.deepEqual(plain(AT.TABSUBS.growth.valid), ['pipeline', 'areas', 'timing']);
  assert.deepEqual(plain(AT.TABSUBS.svc.valid), ['capacity', 'network', 'fsr']);
  assert.deepEqual(plain(AT.TABSUBS.dca.valid), ['timing', 'eas', 'projects']);
  assert.deepEqual(plain(AT.TABSUBS.records.valid), ['sources', 'checks', 'files']);
});

test('sub-view persistence: picks are stored and restored', () => {
  for (const s of [`store: 'gSub'`, `store: 'dcSub'`, `store: 'svcSub'`, `store: 'rSub'`]) {
    assert.ok(APP.includes(s), `store key missing from TABSUBS: ${s}`);
  }
  assert.ok(APP.includes('store.set(s.store, v)'), 'subtab clicks do not persist');
  assert.ok(APP.includes(`store.set(AT().TABSUBS[tab].store, sub)`), 'openAnalysis does not persist the sub-view');
  assert.ok(APP.includes(`store.set('footTab4', tab)`), 'openAnalysis does not persist the tab');
});

test('share link: gs/dcs params are written and read', () => {
  assert.ok(APP.includes(`set('gs', AT().getGSub())`), 'gs not written to share links');
  assert.ok(APP.includes(`set('dcs', AT().getDcSub())`), 'dcs not written to share links');
  assert.ok(APP.includes(`q.get('gs')`), 'gs not read from share links');
  assert.ok(APP.includes(`q.get('dcs')`), 'dcs not read from share links');
});

test('showFootTab: generalized pane visibility and subtab button toggles', () => {
  assert.ok(APP.includes('[data-gsub]') && APP.includes('[data-dcasub]'), 'subtab toggles miss gSub/dcSub');
  assert.ok(!APP.includes(`p.dataset.pane === 'water' ? wSub : wwSub`), 'old water/ww-only sub logic remains');
  assert.ok(!APP.includes(`if (key === 'log')`), 'old log tab handling remains in showFootTab');
  assert.ok(!APP.includes(`if (key === 'criteria')`), 'old criteria tab handling remains in showFootTab');
});

test('index.html: final tab set — removed tabs gone, labels renamed', () => {
  for (const gone of ['ftab-log', 'ftab-criteria', 'ftab-census', 'pane-log', 'pane-criteria', 'pane-demand', 'id="census"',
    'data-tab="criteria"', 'data-tab="log"', 'data-tab="census"', 'Settings &amp; sources', '>Demand</button>']) {
    assert.ok(!HTML.includes(gone), `still present: ${gone}`);
  }
  // Stage 2: four tabs at every scope, then Records as a small trailing tab.
  const tabs = [...HTML.matchAll(/<button type="button" role="tab" class="f-tab( f-tab-trail)?" id="ftab-(\w+)"[^>]*>([^<]+)</g)].map(m => [m[2], m[3], !!m[1]]);
  assert.deepEqual(tabs, [['overview', 'Overview', false], ['growth', 'Growth', false], ['svc', 'Servicing', false], ['dca', 'Capital', false], ['records', 'Records', true]]);
  for (const gone of ['data-tab="tool"', 'id="pane-tool"', 'id="detail"', 'id="detail-body"', 'id="ftab-water"', 'id="ftab-ww"', 'id="ftab-dev"', 'id="pane-dev"', 'data-pane="water"', 'data-pane="ww"', 'data-wwsub', 'data-wsub', 'id="ov-dev"', 'id="pane-dev-body"', 'data-devsub', 'id="site-bar"']) assert.ok(!HTML.includes(gone), `still present: ${gone}`);
  assert.ok(HTML.includes('<div id="scope-body" class="scope-body" hidden aria-live="polite"></div>'), 'scope host');
});

test('index.html: growth sub-views (Pipeline · Areas · Forecast)', () => {
  assert.ok(HTML.includes('data-gsub="pipeline">Pipeline</button>') && HTML.includes('data-gsub="areas">Areas</button>') && HTML.includes('data-gsub="timing">Forecast</button>'));
  assert.ok(HTML.includes('id="pane-growth-byplan" data-pane="growth" data-sub="areas"'), 'plan tables in Areas');
  assert.ok(HTML.includes('id="pane-growth-census" data-pane="growth" data-sub="areas"'), 'census & 2051 in Areas');
  assert.ok(HTML.includes('id="growth-pipeline-body"') && HTML.includes('id="growth-census-body"') && HTML.includes('id="timing-body"'), 'growth body divs missing');
  assert.ok(HTML.includes('js/timing.js?v=__BUILD__'), 'timing.js script tag missing');
  assert.ok(!HTML.includes('data-gsub="ledger"'), 'the Ledger is Forecast’s By period (navigation phase 3)');
  assert.ok(HTML.includes('id="pane-growth-ledger" data-pane="growth" data-sub="timing"') && HTML.includes('id="ledger-body"'), 'its pane in Forecast’s full table, id kept');
});

test('index.html: Servicing sub-views (Capacity · Network, and FSR review at a development), the hydraulic check behind Labs in Network, pumping stations in Network', () => {
  for (const [k, t] of [['capacity', 'Capacity'], ['network', 'Network'], ['fsr', 'FSR review']]) assert.ok(HTML.includes(`data-svcsub="${k}">${t}</button>`), k);
  assert.ok(!/data-svcsub="(alloc|checks)"/.test(HTML), 'Allocations and Model checks are no chips (navigation phase 2)');
  assert.ok(/class="f-pane svc-pane lab-hydro" id="pane-hydro" data-pane="svc" data-sub="network"/.test(HTML) && HTML.includes('id="hyd-box"'), 'hydro pane in Network, Labs');
  assert.ok(HTML.includes('id="pane-pumpstations" data-pane="svc" data-sub="network"') && HTML.includes('id="pumpstations-body"'), 'pumping stations in Network');
});

test('index.html: Capital sub-views (DC timing · EAs · Projects; the Funding lab a fold of DC timing)', () => {
  for (const [sub, label] of [['timing', 'DC timing'], ['eas', 'EAs'], ['projects', 'Projects']]) assert.ok(HTML.includes(`data-dcasub="${sub}">${label}</button>`), `DC subtab ${sub} missing`);
  assert.ok(!HTML.includes('data-dcasub="dcproj"') && !HTML.includes('data-dcasub="funding"'), 'no DC projects or Funding chip: DC timing is the one list, the funding screen its fold (navigation phase 4)');
  assert.ok(HTML.includes('id="pane-dca-dcproj" data-pane="dca" data-sub="timing"') && HTML.includes('id="dca-dcproj-body"'), 'the list in full: DC timing’s full table');
  assert.ok(HTML.indexOf('id="pane-dca-dcproj"') < HTML.indexOf('id="pane-dca-timing"'), 'the list first, then the capacity analysis');
  assert.ok(HTML.includes('id="pane-dca-timing"') && HTML.includes('id="dca-timing-body"'), 'dca timing pane/body missing');
  assert.ok(HTML.includes('id="pane-dca-rec" data-pane="dca" data-sub="timing"') && HTML.includes('id="dca-rec-body"'), 'screening results in DC timing (Funding lab)');
  assert.ok(HTML.includes('id="pane-dca-funding" data-pane="dca" data-sub="timing"') && HTML.includes('id="dca-funding-body"'), 'funding levels in DC timing (Funding lab)');
  assert.ok(!HTML.includes('id="pane-dca"'), 'old single DC pane still present');
  assert.ok(!HTML.includes('id="dca-body"'), 'old dca-body still present');
});

test('index.html: scenario bar carries the criteria mount', () => {
  const m = /<div class="scen-bar" id="scen-bar"[^>]*>([\s\S]*?)<\/div>/.exec(HTML);
  assert.ok(m, '#scen-bar missing');
  assert.ok(m[1].includes('id="scen-criteria-mount"'), '#scen-criteria-mount not inside #scen-bar');
});

test('gear menu: GearPages registry and openGearPage contract', () => {
  assert.ok(APP.includes('window.GearPages = window.GearPages || {};'), 'GearPages registry missing');
  assert.ok(/function openGearPage\(name\)/.test(APP), 'openGearPage missing');
  // The Sources & checks page is gone (navigation phase 2): its parts are Records › Sources and Data checks.
  assert.ok(!APP.includes(`openGearPage('sources')`) && !APP.includes('GearPages.sources'), 'no Sources & checks gear page');
  assert.match(fs.readFileSync(path.join(JS_DIR, 'overview-tab.js'), 'utf8'), /data-at="records:checks">Records › Data checks →<\/button>/, 'the Overview\'s ⓘ link opens Records › Data checks');
  assert.ok(APP.includes('window.openGearPage = openGearPage'), 'openGearPage not exposed for other workers');
});

test('change log moved to the Help menu', () => {
  assert.ok(APP.includes(`$('#help-log-body')`), 'renderChangelog does not target the Help view');
  assert.ok(APP.includes(`document.querySelector('#tb-help .log-dot')`), 'new-dot not on the Help button');
  assert.ok(!HTML.includes('id="help-log-body"'), 'help-log-body should be built by showHelp, not static HTML');
  assert.ok(APP.includes('id="help-log-body"'), 'showHelp does not build the help-log-body container');
  assert.ok(HTML.includes('<span class="log-dot" hidden aria-label="new changes"></span>'), 'log dot span missing from Help button');
  assert.ok(APP.includes('function showHelpLog()'), 'showHelpLog missing');
  for (const gone of [`openAnalysis('log')`, `showFootTab('criteria')`, `openAnalysis('criteria')`, `$('#log-body')`, `#ftab-log`]) {
    assert.ok(!APP.includes(gone), `still present: ${gone}`);
  }
});
