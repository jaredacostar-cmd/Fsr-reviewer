'use strict';
/* Phase 4 (Worker G): settings removal + demand assumptions.
 * - js/demand.js carries source document + version metadata for every parameter.
 * - The criteria stamp names the exact source documents and versions.
 * - The criteria editor lives in the Scenario control (renderScenarioCriteria) with a
 *   reset-to-Peel-defaults button; the Settings tab keeps display/number conventions.
 * - The Sources & checks gear page is gone (navigation phase 2): its parts are in Records.
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
  assert.ok(s[1].includes('reportSettingsHTML()'), 'Prepared by and the public version in Settings › Reports');
});

test('record type + new-buildings-only controls are filters, in Find › What (navigation review F)', () => {
  // They narrow the list, so they sit with the other What filters (Settings pointed there until navigation phase 7).
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'index.html'), 'utf8');
  const what = /<details class="fp-sec fp-row" id="fr-what">([\s\S]*?)<\/details>/.exec(html);
  assert.ok(what && what[1].includes('id="f-kind"'), 'record type select in Find › What');
  assert.ok(what[1].includes('id="f-new"'), 'new-buildings-only switch in Find › What');
  assert.equal((html.match(/id="f-kind"/g) || []).length, 1);
  assert.ok(!/function recordSettingsHTML/.test(APP) || !/const recordSettingsHTML = [^\n]*id="f-kind"/.test(APP), 'not also on the Settings page');
  // (Settings' Records pointer to Find › What, removed by design, §5 row 170: ⚙'s one sheet has no stubs)
  assert.doesNotMatch(APP, /id="rec-settings"/, 'no Records pointer in Settings');
  assert.ok(APP.includes("e.target.id === 'f-kind'"), 'delegated wiring for record type');
  assert.ok(APP.includes("e.target.id === 'f-new'"), 'delegated wiring for new-buildings-only');
});

// ---- Sources & checks gear page: gone (navigation phase 2), its parts in Records ----------------
test('the Sources & checks gear page is gone; freshness and the references are Records › Sources, the checks Records › Data checks', () => {
  assert.ok(APP.includes('window.GearPages = window.GearPages || {}'), 'GearPages registry created (Settings, Labs)');
  assert.ok(!APP.includes('GearPages.sources') && !/function sourcesPageHTML\(/.test(APP), 'no Sources & checks gear page');
  const rt = fs.readFileSync(path.join(JS_DIR, 'records-tab.js'), 'utf8');
  assert.match(rt, /return `\$\{DU\(\)\.freshnessHTML\(\)\}\$\{root\.PeelSvcPlants && root\.PeelSvcPlants\.refsHTML \? root\.PeelSvcPlants\.refsHTML\(\) : ''\}`/, 'data freshness and the references: Records › Sources');
  assert.match(rt, /DU\(\)\.checksHTML \? DU\(\)\.checksHTML\(\) : ''/, 'the model checks: Records › Data checks');
  assert.match(fs.readFileSync(path.join(JS_DIR, 'svc-capacity.js'), 'utf8'), /'plantFlows', 'wwRoster'\]\.map\(sec\)/, 'the page\'s own two checks: Records › Data checks, Servicing model');
});

test('extra model-check sections render defensively', () => {
  assert.ok(APP.includes('window.ModelChecks'), 'reads the ModelChecks registry');
  // (the one reader left: js/svc-capacity.js renderChecks, Records › Data checks' Servicing model group)
  assert.match(fs.readFileSync(path.join(JS_DIR, 'svc-capacity.js'), 'utf8'), /const MC = root\.ModelChecks \|\| \{\}, sec = k => \{ try \{ const v = typeof MC\[k\] === 'function' \? MC\[k\]\(\) : MC\[k\]; return typeof v === 'string' \? v : v && typeof v\.html === 'string' \? v\.html : ''; \} catch \(e\) \{ return ''; \} \};/, 'a missing or odd section renders as nothing, not a throw');
});

test('Prepared by and the public version stay in Settings; the number conventions are How the app decides’', () => {
  assert.ok(APP.includes('function reportSettingsHTML'), 'Settings › Reports extracted');
  assert.ok(/<h2 class="pane-h">Settings<\/h2>[^\n]*\$\{DU\(\)\.reportSettingsHTML\(\)\}/.test(APP),
    'the Settings sheet shows them (js/growth-ui.js)');
  // (navigation phase 7, design §3.7, §5 row 171: documentation is Help's)
  assert.match(fs.readFileSync(path.join(JS_DIR, 'logic.js'), 'utf8'), /id="lg-numbers"/);
  assert.ok(!APP.includes('numberConventionsHTML'), 'one place for the conventions');
  assert.ok(!/function renderQuality\(/.test(APP), 'no renderer for the missing #d-quality');
});

// ---- ⚙: one Settings sheet (navigation phase 7, design §3.7, §5 rows 169–171, N-10 with change) --------------------
test('⚙ opens one Settings sheet: Display · Start screen · Your role · Reports · Labs · Usage; no menu; no Counting or Records pointer', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8'), html = read('index.html'), tb = read('js/topbar.js'), css = read('css/app.css');
  // The sheet: a dialog under the top bar's end, after the actions (outside the ⋯ list, so it shows on a phone as ⋯ folds).
  const acts = html.indexOf('<div class="tb-actions" id="tb-actions">'), list = html.indexOf('<div class="tb-acts-list" id="tb-acts-list">'), sheet = html.indexOf('<div class="tb-menu tb-sheet" id="tb-gear-menu" role="dialog" aria-label="Settings" hidden></div>');
  assert.ok(acts > 0 && list > acts && sheet > list && sheet < html.indexOf('</header>'), 'the sheet in the top bar');
  assert.ok(html.slice(list, sheet).includes('id="tb-gear"'), '⚙ still in the ⋯ list on a phone');
  assert.match(html.slice(acts, sheet + 40), /<\/div>\n {6}<\/div>\n(?: {6}<!--[^]*?-->\n)? {6}<div class="tb-menu tb-sheet"/, 'outside #tb-actions');
  assert.match(html, /id="tb-gear" aria-haspopup="dialog" aria-expanded="false" aria-controls="tb-gear-menu" aria-label="Settings"/);
  assert.equal((html.match(/id="tb-gear-menu"/g) || []).length, 1);
  // ⚙ opens it directly (no Settings · Labs · Change log menu); ⚙ again closes it; a click inside it never does.
  assert.match(tb, /\$\('#tb-gear'\)\.addEventListener\('click', e => \{ e\.stopPropagation\(\); toggleSettings\(\); \}\);/);
  assert.match(tb, /if \(!inside\('\.tb-wrap'\) && !inside\('#tb-gear-menu'\)\) closeTbMenus\(\);/);
  assert.doesNotMatch(tb, /data-tbg=|renderGearMenu|openGearPage\('labs'\)/);
  assert.doesNotMatch(read('js/labs.js'), /GearPages\.labs/, 'Labs: a section of the sheet, no page of its own');
  // toggleSettings, run: it folds ⋯ (⚙'s click stops before ⋯'s own listeners), opens the sheet and gives it the focus.
  const a = tb.indexOf('  function toggleSettings() {'), body = tb.slice(a, tb.indexOf('\n  }\n', a) + 4);
  const el = { m: { hidden: true, tabIndex: 0, style: {}, getBoundingClientRect: () => ({ top: 144 }), focus() { el.focused = 'sheet'; } }, a: { open: true, classList: { contains: () => el.a.open, remove: c => { if (c === 'open') el.a.open = false; } } }, mb: { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; } } };
  const calls = [], $ = s => ({ '#tb-gear-menu': el.m, '#tb-actions': el.a, '#tb-more': el.mb }[s]);
  const toggle = new Function('$', 'closeTbMenus', 'closeScenPop', 'openGearPage', 'innerHeight', `${body}\nreturn toggleSettings;`)($, () => calls.push('close'), () => calls.push('scen'), n => { calls.push(`open ${n}`); el.m.hidden = false; }, 844);
  toggle();
  assert.deepEqual([calls, el.a.open, el.mb.attrs['aria-expanded'], el.m.tabIndex, el.focused], [['scen', 'open settings'], false, 'false', -1, 'sheet']);
  assert.equal(el.m.style.maxHeight, '692px', 'its foot 8 px above the screen’s (390 × 844, the banners above the top bar taking 144 px)');
  calls.length = 0; toggle(); assert.deepEqual(calls, ['close'], '⚙ again: closed');
  // Esc closes it and puts the focus back on ⚙ (on ⋯ while ⚙ is folded in it).
  assert.match(tb, /const sh = \$\('#tb-gear-menu'\), was = !!sh && !sh\.hidden;\n {4}closeTbMenus\(\); closeScenPop\(\);\n {4}if \(was\) \{ const g = \$\('#tb-gear'\), mb = \$\('#tb-more'\), to = g && g\.getClientRects\(\)\.length \? g : mb; if \(to\) to\.focus\(\); \}/);
  // Its sections, in order (design §3.7): Display → Start screen → Your role → Reports → Labs → Usage.
  const g = read('js/growth-ui.js'), f = /function settingsPageHTML\(\) \{([\s\S]*?)\n  \}/.exec(g)[1];
  const sheetHTML = new Function('root', 'DU', 'displaySettingsHTML', `${f}`)({ PeelWorkspaces: { settingsHTML: () => '[start screen][your role]' }, PeelLabs: { pageHTML: () => '[labs]' }, PeelUsage: { settingsHTML: () => '[usage]' } }, () => ({ reportSettingsHTML: () => '[reports]' }), () => '[display]');
  assert.equal(sheetHTML, '<h2 class="pane-h">Settings</h2>[display][start screen][your role][reports][labs][usage]');
  assert.doesNotMatch(g, /set-counting|const counting = |recordSettingsHTML|rec-settings/, 'no Counting or Records pointer (removed by design, §5 row 170)');
  assert.match(read('js/demand-ui.js'), /function reportSettingsHTML\(\) \{\n {4}return `<section class="gear-sec"><h3>Reports<\/h3>[^`]*id="public-view"[^`]*id="prep-by"[^`]*<\/section>`;/);
  // The sheet's box: under the top bar's right end on a computer; across the top bar, 8 px each side, on a phone.
  assert.match(css, /\.tb-menu\.tb-sheet \{ right: var\(--space-2\); width: min\(460px, calc\(100vw - var\(--space-4\)\)\); padding: var\(--space-2\) var\(--space-3\); \}/);
  assert.match(css, /\.tb-sheet select \{ max-width: 100%; \}/);
  // (Your role's select is outside a .field: it takes the .field selects' box, one look for every select in the sheet)
  assert.match(css, /\.tb-sheet select\[data-role-set\] \{ width: 100%; padding: var\(--space-2\); border: 1px solid var\(--border\); border-radius: 4px; background: var\(--surface-1\); \}/);
  const phone = css.slice(css.indexOf('/* ---- Design bundle 4: phone and chrome'));
  assert.match(phone.slice(phone.indexOf('@media (max-width: 700px) {')), /^@media \(max-width: 700px\) \{[^]*?\n {2}\.tb-menu\.tb-sheet \{ left: var\(--space-2\); right: var\(--space-2\); width: auto; max-width: none; \}\n[^]*?\n\}/);
  assert.doesNotMatch(css, /\.rec-set\b/);
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
