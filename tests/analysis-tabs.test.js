'use strict';
/* Analysis-tab restructure tests (Phase 4, Worker A shell):
 * - the final tab set (Overview · Growth · Water · Wastewater · DC + Development/Tool result),
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

const migrateTabKey = extractArrow('migrateTabKey');

test('migrateTabKey: removed tabs map onto the new tab set', () => {
  assert.deepEqual(migrateTabKey('demand'), { tab: 'growth' });
  assert.deepEqual(migrateTabKey('census'), { tab: 'growth', gSub: 'census2051' });
  assert.deepEqual(migrateTabKey('criteria'), { tab: 'overview' });
  assert.deepEqual(migrateTabKey('log'), { tab: 'overview' });
});

test('migrateTabKey: current and legacy tabs are untouched or mapped as before', () => {
  for (const t of ['overview', 'growth', 'water', 'ww', 'dca', 'dev', 'tool', 'developments']) {
    assert.deepEqual(migrateTabKey(t), { tab: t }, `changed current tab ${t}`);
  }
  assert.deepEqual(migrateTabKey('svc'), { tab: 'water' });
  assert.deepEqual(migrateTabKey('plants'), { tab: 'ww', wwSub: 'plants' });
});

test('migrateTabKey is applied to the stored tab pref and to share links', () => {
  assert.ok(APP.includes('const m = migrateTabKey(footPref); footPref = m.tab;'), 'stored footPref not migrated');
  assert.ok(APP.includes('AT().migrateTabKey(q.get(\'t\'))'), 'share-link t param not migrated');
});

test('sub-view defaults: gSub pipeline, dcSub timing (and the old water/ww defaults kept)', () => {
  for (const d of [`store.get('gSub', 'pipeline')`, `store.get('dcSub', 'timing')`,
    `store.get('wwSub', 'plants')`, `store.get('wSub', 'capacity')`]) {
    assert.ok(APP.includes(d), `default missing: ${d}`);
  }
});

test('sub-view valid values cover the new sub-views', () => {
  assert.ok(APP.includes(`valid: ['pipeline', 'census2051', 'timing', 'byplan']`), 'growth valid values wrong');
  assert.ok(APP.includes(`valid: ['timing', 'recommendations', 'funding']`), 'dca valid values wrong');
  assert.ok(APP.includes(`'hydro'`), 'hydro not a valid water sub-view');
  assert.ok(APP.includes(`'pumpstations'`), 'pumpstations not a valid ww sub-view');
});

test('sub-view persistence: picks are stored and restored', () => {
  // Persistence goes through the TABSUBS table: each entry names its store key,
  // and both the subtab click handler and openAnalysis write through it.
  for (const s of [`store: 'gSub'`, `store: 'dcSub'`, `store: 'wSub'`, `store: 'wwSub'`]) {
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
  assert.ok(/id="ftab-growth"[^>]*>Growth</.test(HTML), 'Growth tab button missing/renamed wrong');
  assert.ok(/id="ftab-dca"[^>]*>DC</.test(HTML), 'DC tab button missing/renamed wrong');
  for (const kept of ['data-tab="overview"', 'data-tab="growth"', 'data-tab="water"', 'data-tab="ww"',
    'data-tab="dca"', 'data-tab="dev"', 'data-tab="tool"']) {
    assert.ok(HTML.includes(kept), `missing tab: ${kept}`);
  }
});

test('index.html: growth sub-views', () => {
  assert.ok(HTML.includes('data-gsub="pipeline"') && HTML.includes('>Pipeline</button>'), 'pipeline subtab missing');
  assert.ok(HTML.includes('data-gsub="census2051"') && HTML.includes('Census &amp; 2051'), 'census2051 subtab missing');
  assert.ok(HTML.includes('data-gsub="timing"') && HTML.includes('>Timing</button>'), 'timing subtab missing');
  assert.ok(HTML.includes('id="pane-growth-pipeline"') && HTML.includes('data-sub="pipeline"'), 'pipeline pane missing');
  assert.ok(HTML.includes('id="pane-growth-census"') && HTML.includes('data-sub="census2051"'), 'census pane missing');
  assert.ok(HTML.includes('id="pane-growth-timing"') && HTML.includes('data-sub="timing"'), 'timing pane missing');
  assert.ok(HTML.includes('id="growth-pipeline-body"') && HTML.includes('id="growth-census-body"') && HTML.includes('id="timing-body"'), 'growth body divs missing');
  assert.ok(HTML.includes('js/timing.js?v=__BUILD__'), 'timing.js script tag missing');
});

test('index.html: water hydraulic check and ww pumping stations sub-views', () => {
  assert.ok(HTML.includes('data-wsub="hydro"') && HTML.includes('Hydraulic check (beta)'), 'hydro subtab missing');
  assert.ok(HTML.includes('id="pane-hydro"') && HTML.includes('id="hyd-box"'), 'hydro pane/body missing');
  assert.ok(HTML.includes('data-wwsub="pumpstations"') && HTML.includes('>Pumping stations</button>'), 'pumpstations subtab missing');
  assert.ok(HTML.includes('id="pane-pumpstations"') && HTML.includes('id="pumpstations-body"'), 'pumpstations pane/body missing');
});

test('index.html: DC sub-views', () => {
  for (const [sub, label] of [['timing', 'Timing'], ['recommendations', 'Funding screen'], ['funding', 'Funding levels']]) {
    assert.ok(HTML.includes(`data-dcasub="${sub}"`) && HTML.includes(`>${label}</button>`), `DC subtab ${sub} missing`);
  }
  assert.ok(HTML.includes('id="pane-dca-timing"') && HTML.includes('id="dca-timing-body"'), 'dca timing pane/body missing');
  assert.ok(HTML.includes('id="pane-dca-rec"') && HTML.includes('id="dca-rec-body"'), 'dca recommendations pane/body missing');
  assert.ok(HTML.includes('id="pane-dca-funding"') && HTML.includes('id="dca-funding-body"'), 'dca funding pane/body missing');
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
  assert.ok(APP.includes(`openGearPage('sources')`), 'Sources & checks does not call openGearPage');
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
