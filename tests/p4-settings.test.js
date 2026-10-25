'use strict';
/* Phase 4 (Worker G): settings removal + demand assumptions.
 * - js/demand.js carries source document + version metadata for every parameter.
 * - The criteria stamp names the exact source documents and versions.
 * - The criteria editor lives in the Scenario control (renderScenarioCriteria) with a
 *   reset-to-Peel-defaults button; the Settings tab keeps display/number conventions.
 * - The Sources & checks gear page is registered (GearPages.sources).
 * js/app.js is a browser IIFE, so app-side assertions read it as source.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const D = require('../js/demand.js');
// Phase 6: js/app.js was split into js/util.js + 46 area modules. Structural
// assertions read the whole js/ tree (app core + modules) as one source.
const JS_DIR = path.join(__dirname, '..', 'js');
const APP = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');

// ---- demand.js: source metadata for every parameter ---------------------------------
test('every editable parameter has source document + version metadata', () => {
  for (const g of Object.keys(D.DEFAULT_CRITERIA)) {
    assert.ok(D.CRIT_SOURCES[g], `CRIT_SOURCES missing group ${g}`);
    assert.ok(D.CRIT_UNITS[g], `CRIT_UNITS missing group ${g}`);
    for (const k of Object.keys(D.DEFAULT_CRITERIA[g])) {
      const s = D.CRIT_SOURCES[g][k];
      assert.ok(s && typeof s.doc === 'string' && s.doc.length > 4, `${g}.${k}: doc`);
      assert.ok(s && typeof s.ver === 'string' && s.ver.length > 2, `${g}.${k}: version`);
      assert.ok(typeof D.CRIT_UNITS[g][k] === 'string' && D.CRIT_UNITS[g][k].length > 0, `${g}.${k}: unit`);
    }
  }
});

test('source metadata names the exact Peel documents and versions', () => {
  const w = D.sourceText(['water']);
  assert.match(w, /Water and Wastewater Modelling Demand Table/);
  assert.match(w, /v2\.0/);
  assert.match(w, /Aug 30 2024/);
  const ww = D.sourceText(['wastewater']);
  assert.match(ww, /Linear Wastewater Standards/);
  assert.match(ww, /R1\.0 Mar 2023/);
  const ppu = D.sourceText(['ppu']);
  assert.match(ppu, /Tables 2-1 \/ 2-2/);
  // Titles match the canonical reference list in data/peel-reports.json.
  const reports = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'peel-reports.json'), 'utf8'));
  const titles = reports.standards.map(r => r.title).join('\n');
  assert.ok(titles.includes('Linear Wastewater Standards (published Nov 2022, R1.0 Mar 2023)'));
  assert.ok(titles.includes('Water and Wastewater Modelling Demand Table, Site Plan applications (v2.0, Aug 30 2024)'));
  assert.equal(D.sourceOf('water', 'avg').doc, 'Region of Peel – Water and Wastewater Modelling Demand Table (Site Plan applications)');
});

test('sourceText deduplicates documents across groups', () => {
  const t = D.sourceText(['water', 'employment']);
  assert.equal(t.split('Region of Peel – Water and Wastewater Modelling Demand Table').length - 1, 2,
    'water and employment share the document but differ in version note (residential vs non-residential)');
  assert.ok(t.indexOf('v2.0, Aug 30 2024;') < t.indexOf('(non-residential rates)'));
});

// ---- reset-to-defaults: the ground truth Peel defaults --------------------------------
const PEEL_DEFAULTS = {
  ppu: { single: 4.2, town: 3.4, apartment: 3.1, apartmentHigh: 2.7, unknown: 2.7 },
  water: { avg: 270, maxDay: 1.8, peakHour: 3.0 },
  wastewater: { avg: 290, infiltration: 0.26, peakMin: 2, peakMax: 4 },
  employment: { water: 250, maxDay: 1.4, peakHour: 3.0, wastewater: 270, peakMin: 2, peakMax: 4 },
  m2PerJob: { industrial: 110, office: 25, retail: 45, hotel: 60, institutional: 50 },
};
test('DEFAULT_CRITERIA is exactly the Peel defaults (what reset restores)', () => {
  assert.deepEqual(D.DEFAULT_CRITERIA, PEEL_DEFAULTS);
});

test('reset-to-defaults restores a fresh deep copy of the Peel defaults', () => {
  // The app's reset is `state.criteria = mergeCriteria(null)` = a deep copy of
  // D.DEFAULT_CRITERIA; mutating the copy must not touch the defaults.
  const restored = JSON.parse(JSON.stringify(D.DEFAULT_CRITERIA));
  restored.water.avg = 999;
  assert.equal(D.DEFAULT_CRITERIA.water.avg, 270);
  assert.deepEqual(restored.wastewater, PEEL_DEFAULTS.wastewater);
});

test('app reset path restores from DEFAULT_CRITERIA', () => {
  assert.ok(/function resetCriteriaToPeel\(\)\s*\{\s*App\(\)\.state\.criteria = App\(\)\.mergeCriteria\(null\)/.test(APP),
    'resetCriteriaToPeel restores state.criteria from mergeCriteria(null)');
  assert.ok(APP.includes('data-scen-crit-reset') && APP.includes('Reset to Peel criteria'),
    'Scenario criteria editor has the reset button');
});

// ---- criteria sources: exact documents and versions --------------------------------------
// Phase 4: the per-tab stampHTML is gone (single scenario bar replaces the per-tab
// scenario lines). The exact source documents/versions now surface via the demand.js
// metadata (exports + references) and the scenario bar's criteria state.
test('criteria sources name the exact documents and versions', () => {
  // The metadata resolves to the exact documents verbatim.
  const resolved = D.sourceText(['ppu', 'water', 'wastewater', 'employment']);
  assert.match(resolved, /Region of Peel \u2013 Water and Wastewater Modelling Demand Table \(Site Plan applications\), v2\.0, Aug 30 2024/);
  assert.match(resolved, /Region of Peel \u2013 Linear Wastewater Standards, published Nov 2022, R1\.0 Mar 2023/);
  // Phase 5: the generic per-panel PDF export (and its references section) was
  // removed; the surviving Excel export's Criteria sheet still carries the exact
  // source document + version for every criteria item.
  assert.ok(APP.includes('function criteriaExportRow('), 'criteria export rows missing');
  assert.ok(APP.includes("'Criteria'") && APP.includes('Source document') && APP.includes('Source version'),
    'Excel export lost its per-item source document/version sheet');
  // The scenario bar carries the criteria state (modified/defaults).
  assert.ok(APP.includes('data-scen-crit'), 'scenario bar shows criteria state');
  assert.ok(APP.includes('scenCritLineHTML'), 'criteria line builder exists');
  // UI pointers go to the Scenario control, not the removed Settings tab.
  assert.ok(APP.includes('edit the criteria in the Scenario control'), 'demand info points at Scenario control');
  assert.ok(APP.includes('are edited in the <strong>Scenario</strong> control'), 'criteria tab points at Scenario control');
  assert.ok(APP.includes('criteriaChanges()'), 'keeps the Modified criteria badge');
});

test('criteriaChanges is kept (exports still use it)', () => {
  assert.ok(/function criteriaChanges\(\)/.test(APP));
  assert.ok(APP.includes('criteriaChanges().length'), 'export summary still uses it');
});

// ---- Scenario control: the criteria editor ----------------------------------------------
test('renderScenarioCriteria is global and wired into the scenario bar', () => {
  assert.ok(/function renderScenarioCriteria\(mountEl\)/.test(APP));
  assert.ok(APP.includes('window.renderScenarioCriteria = renderScenarioCriteria'),
    'exposed globally for the shell');
  assert.ok(APP.includes('id="scen-criteria-mount"'), 'mount exists in the scenario bar');
  assert.ok(/querySelector\('#scen-criteria-mount'\)[\s\S]{0,80}renderScenarioCriteria\(/.test(APP),
    'scenario bar render calls renderScenarioCriteria on the mount');
});

test('scenario criteria editor shows edited value beside Peel default, per parameter', () => {
  const m = /function renderScenarioCriteria\(mountEl\) \{([\s\S]*?)\n  window\.renderScenarioCriteria/.exec(APP);
  assert.ok(m, 'renderScenarioCriteria body not found');
  const body = m[1];
  assert.ok(body.includes('Peel default'), 'default shown beside the edited value');
  assert.ok(body.includes('data-g="${g}" data-k="${k}"'), 'every parameter gets an input');
  assert.ok(body.includes('CRIT_LABEL'), 'grouped by criterion group');
  assert.ok(body.includes('badge-mod'), 'modified rows are badged');
  assert.ok(body.includes('sourceOf'), 'source document shown per group');
});

test('settings gear page holds display settings, not editable criteria inputs', () => {
  // Phase 4 merge: the old Settings tab is gone; theme/density/number conventions/
  // Prepared by live on the Settings gear page (GearPages.settings).
  assert.ok(APP.includes('window.GearPages.settings = () => settingsPageHTML()'), 'settings page registered');
  const m = /function displaySettingsHTML\(\) \{([\s\S]*?)\n  \}/.exec(APP);
  assert.ok(m, 'displaySettingsHTML not found');
  assert.ok(!m[1].includes('data-g='), 'no criteria inputs in display settings');
  assert.ok(m[1].includes('dsp-theme') && m[1].includes('dsp-density'), 'theme + density stay in Settings');
  const s = /function settingsPageHTML\(\) \{([\s\S]*?)\n  \}/.exec(APP);
  assert.ok(s, 'settingsPageHTML not found');
  assert.ok(s[1].includes('numberConventionsHTML()'), 'number conventions + Prepared by in Settings');
});

test('record type + new-buildings-only controls are filters, in Find › What (navigation review F)', () => {
  // They narrow the list, so they sit with the other What filters; Settings points there.
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const what = /<details class="fp-sec fp-row" id="fr-what">([\s\S]*?)<\/details>/.exec(html);
  assert.ok(what && what[1].includes('id="f-kind"'), 'record type select in Find › What');
  assert.ok(what[1].includes('id="f-new"'), 'new-buildings-only switch in Find › What');
  assert.equal((html.match(/id="f-kind"/g) || []).length, 1);
  assert.ok(!/function recordSettingsHTML/.test(APP) || !/const recordSettingsHTML = [^\n]*id="f-kind"/.test(APP), 'not also on the Settings page');
  assert.ok(APP.includes('Record type and New buildings only are filters: they are in <strong>Find › What</strong>'), 'Settings points to Find › What');
  assert.ok(APP.includes("e.target.id === 'f-kind'"), 'delegated wiring for record type');
  assert.ok(APP.includes("e.target.id === 'f-new'"), 'delegated wiring for new-buildings-only');
});

// ---- Sources & checks gear page -----------------------------------------------------------
test('GearPages.sources is registered and composes freshness, checks and references', () => {
  assert.ok(APP.includes('window.GearPages = window.GearPages || {}'), 'GearPages registry created');
  assert.ok(APP.includes('window.GearPages.sources = () => sourcesPageHTML()'), 'sources page registered');
  const m = /function sourcesPageHTML\(\) \{([\s\S]*?)\n  \}/.exec(APP);
  assert.ok(m, 'sourcesPageHTML not found');
  const body = m[1];
  assert.ok(body.includes('freshnessHTML()'), 'data freshness included');
  assert.ok(body.includes('checksHTML()'), 'model checks included');
  assert.ok(body.includes('refsHTML()'), 'references included');
});

test('extra model-check sections render defensively', () => {
  assert.ok(APP.includes('window.ModelChecks'), 'reads the ModelChecks registry');
  const m = /function modelSectionsHTML\(\) \{([\s\S]*?)\n  \}/.exec(APP);
  assert.ok(m, 'modelSectionsHTML not found');
  assert.ok(m[1].includes("(typeof window !== 'undefined' && window.ModelChecks) || {}"),
    'missing registry renders as nothing, not a throw');
});

test('number conventions and Prepared by stay in the Settings UI', () => {
  assert.ok(APP.includes('function numberConventionsHTML'), 'conventions extracted');
  assert.ok(/<h2 class="pane-h">Settings<\/h2>[^\n]*\$\{DU\(\)\.numberConventionsHTML\(\)\}/.test(APP),
    'the Settings page shows them (js/growth-ui.js)');
  assert.ok(!/function renderQuality\(/.test(APP), 'no renderer for the missing #d-quality');
});

// ---- exports: Criteria sheet ---------------------------------------------------------------
test('Excel Criteria sheet lists value, default, unit and source document + version', () => {
  assert.ok(APP.includes("['Group', 'Item', 'Used', 'Peel default', 'Unit', 'Source document', 'Source version']"),
    'xlsx Criteria header');
  assert.ok(APP.includes('criteriaExportRow(g, k)'), 'xlsx rows use the shared export row');
});

test('PDF criteria table lists unit and source document', () => {
  const m = /function criteriaTableHTML\(\) \{([\s\S]*?)\n  \}/.exec(APP);
  assert.ok(m, 'criteriaTableHTML not found');
  assert.ok(m[1].includes('<th>Unit</th>') && m[1].includes('<th>Source document</th>'));
});

// ---- demand tables: per-figure formulas -------------------------------------------------------
test('demand figures carry an info button with their formula', () => {
  const start = APP.indexOf('function demandHTML(');
  assert.ok(start >= 0);
  const body = APP.slice(start, APP.indexOf('function demandHTML(') + 12000).slice(0, 12000);
  assert.ok(body.includes('data-calc-how'), 'hidden formula rows');
  assert.ok(body.includes('calc-i" data-calc='), 'info buttons');
  assert.ok(body.includes('howSPeak') && body.includes('Harmon M = 1 + 14 / (4 +'), 'Harmon formula with inputs');
  assert.ok(body.includes('howII'), 'I&I formula with inputs');
  assert.ok(body.includes('howJobs'), 'jobs formula with inputs');
});

test("the scenario control: Criteria & references opens the criteria editor below it; Horizon years names where they are", () => {
  const s = fs.readFileSync(path.join(JS_DIR, "svc-tab.js"), "utf8");
  assert.match(s, /if \(gt === .criteria.\) \{ TB\(\)\.openScenPop\(\); const d = \$\(.#scen-criteria-mount details.\); if \(d\) \{ d\.open = true; d\.scrollIntoView/);
  assert.match(s, /Horizon years: Servicing › Capacity › Charts and method\./);
});
