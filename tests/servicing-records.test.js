'use strict';
// Navigation phase 2 (docs/architecture-review/navigation-design.md §3.4, §5, §7): Servicing is Capacity ·
// Network. Allocations is a fold of Capacity ("Allocations recorded", its tables and CSV in Capacity's full
// table); the existing water facilities and the hydraulic check (Labs) are Network's; the servicing model's
// checks are Records › Data checks, its Servicing model group. Pane ids are kept (exports and reports read
// them). The aliases for old links and stored picks are in tests/nav-aliases.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = src('index.html');
const plain = o => JSON.parse(JSON.stringify(o));

test('index.html: Servicing has three chips at an area (and FSR review at a development); the panes move by data-sub / data-pane and keep their ids', () => {
  const row = HTML.slice(HTML.indexOf('<div class="f-pane f-subtabs svc-subtabs" data-pane="svc"'), HTML.indexOf('</div>', HTML.indexOf('svc-subtabs')));
  // (navigation phase 5: FSR review is a development's view, hidden at an area; 6c: Old pipes an area's, hidden at a
  // development: tests/nav-aliases.test.js)
  assert.deepEqual([...row.matchAll(/<button[^>]*data-svcsub="(\w+)">([^<]+)</g)].map(m => [m[1], m[2]]), [['capacity', 'Capacity'], ['network', 'Network'], ['pipes', 'Old pipes'], ['fsr', 'FSR review']]);
  const at = id => HTML.indexOf(`id="${id}"`);
  for (const id of ['pane-alloc', 'alloc-body', 'pane-wfac', 'wfac-body', 'pane-hydro', 'hyd-box', 'pane-svc-checks', 'svc-checks-body']) assert.equal(HTML.split(`id="${id}"`).length, 2, `#${id} once`);
  // Capacity's full table: the table, the charts, then the allocations recorded.
  assert.ok(at('pane-wcap') < at('pane-alloc') && at('pane-alloc') < at('pane-svc-netbar'), '#pane-alloc right after #pane-wcap');
  assert.match(HTML, /id="pane-alloc" data-pane="svc" data-sub="capacity"/);
  // Network's: after the pressure zones, the existing water facilities and the hydraulic check.
  assert.ok(at('pane-water') < at('pane-wfac') && at('pane-wfac') < at('pane-hydro') && at('pane-hydro') < HTML.indexOf('data-pane="dca" hidden role="group"'), 'after #pane-water');
  // Records' own: the Servicing model group after the data checks, still in .analysis-panes.
  assert.match(HTML, /<section class="f-pane svc-pane" id="pane-svc-checks" data-pane="records" data-sub="checks" role="tabpanel" aria-labelledby="ftab-records" hidden>\n {8}<div class="tb-head"><h2 class="sr">Servicing model<\/h2><\/div>/);
  const rec = at('pane-records'), panesEnd = HTML.indexOf('</aside>', rec);
  assert.ok(rec < at('pane-svc-checks') && at('pane-svc-checks') < panesEnd, 'after #pane-records, before the panel column ends');
  assert.ok(HTML.lastIndexOf('</section>', at('pane-svc-checks')) > at('rec-data-checks'), 'not inside #pane-records');
});

test('css: at a development, Network leaves out the Peel-wide water facilities and hydraulic check', () => {
  // (and, since navigation phase 4, DC timing's Peel-wide list in full and the funding tables: the site's brief only)
  assert.match(src('css/app.css'), /#analysis\.site-scope #pane-svc-netbar, #analysis\.site-scope #pane-wfac, #analysis\.site-scope #pane-hydro, #analysis\.site-scope #pane-dca-dcproj, #analysis\.site-scope #pane-dca-rec, #analysis\.site-scope #pane-dca-funding \{ display: none; \}/);
});

test('the workbook at a development leaves out the Peel-wide panes Network hides there (the Water sheet read #wfac-body)', () => {
  const ex = src('js/exports.js'), off = /const OFF_AT_SITE = '([^']+)';/.exec(ex);
  assert.ok(off, 'OFF_AT_SITE');
  const rule = /\n(#analysis\.site-scope #pane-svc-netbar[^{]*)\{ display: none; \}/.exec(src('css/app.css'))[1].split(',').map(x => x.trim());
  const sels = off[1].split(',').map(x => x.trim());
  assert.deepEqual(sels, ['#analysis.site-scope #pane-wfac', '#analysis.site-scope #pane-hydro']);
  for (const x of sels) assert.ok(rule.includes(x), `${x}: hidden on screen as well`);
  assert.match(ex, /const tables = \[\.\.\.body\.querySelectorAll\('table'\)\]\.filter\(t => !t\.closest\(`\[hidden\], \$\{OFF_AT_SITE\}`\)\);/);
  // (the Water sheet's facilities table is inside #pane-wfac; at Peel it is in the sheet, Network's now)
  assert.match(ex, /\['Existing water facilities', '#wfac-body'\]/);
  const i = HTML.indexOf('id="pane-wfac"'), j = HTML.indexOf('id="wfac-body"');
  assert.ok(i > 0 && j > i && j < HTML.indexOf('</section>', i), '#wfac-body in #pane-wfac');
});

test('sections, labs, names: no Allocations or Model checks section; the hydraulic check is Network’s', () => {
  globalThis.PeelPanel = { get: () => null };
  delete require.cache[require.resolve('../js/sections.js')];
  const S = require('../js/sections.js');
  delete globalThis.PeelPanel;
  // (navigation phase 6: Servicing's views are Home's, the strip's: Capacity · Network · Old pipes at an area, 6c)
  assert.deepEqual(Object.keys(S.VIEWS.area).filter(k => k.startsWith('svc:')), ['svc:capacity', 'svc:network', 'svc:pipes']);
  assert.equal(S.WORKSPACES.servicing, undefined, 'no Servicing workspace bar');
  assert.deepEqual(S.WORKSPACES.reference.secs.map(s => s.title).slice(-2), ['Data sources', 'Data checks']);
  assert.ok(!src('js/sections.js').includes("'svc:alloc'"), 'no Allocations panel builder');
  const L = require('../js/labs.js');
  assert.equal(L.LABS.find(l => l.id === 'hydro').where, 'Servicing › Network');
  const W = require('../js/workspaces.js');
  assert.equal(W.tabPath('svc', 'alloc'), 'Servicing › alloc', 'no name for a sub-view that is gone');
  assert.equal(W.tabPath('records', 'checks'), 'Records › Data checks');
  assert.doesNotMatch(src('js/how.js'), /'svc:(alloc|checks)'/, 'no data files for a panel that is gone');
  assert.match(src('js/how.js'), /'records:checks': \[\.\.\.SVC, [^\]]*'compliance\.json', 'ww-events\.json', 'dev-outlets\.json'\]/, 'Records › Data checks reads the servicing model’s files too');
});

test('Allocations recorded: rendered when Capacity is the sub-view (its full-table section)', () => {
  assert.match(src('js/analysis-tabs.js'), /if \(key === 'svc' && svcSub === 'capacity'\) setTimeout\(\(\) => DUI\(\)\.renderAlloc\(\), 0\);/);
  assert.match(src('js/svc-tab.js'), /if \(AT\(\)\.getFootTab\(\) === 'svc' && AT\(\)\.getSvcSub\(\) === 'capacity'\) DUI\(\)\.renderAlloc\(\);/);
  assert.doesNotMatch(src('js/analysis-tabs.js') + src('js/svc-tab.js'), /=== 'alloc'\)/);
});

// js/demand-ui.js in a vm: two plants, two allocations (one ahead of approval).
function loadDemandUI({ model = true, allocations, drawn } = {}) {
  const docL = {}, store = { allocations: allocations || { a: { units: 120, date: '2026-09-01', ref: 'R-1' }, b: { units: 40, date: '2026-10-01' } } };
  const el = { addEventListener: () => {} };
  const U = { $: () => el, esc: s => String(s).replace(/</g, '&lt;'), fmtNum: n => String(Math.round(n)), fmt1: n => n.toFixed(1), skel: t => t, store: { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; } }, dot: () => '', roundPop: n => n, hlP: h => `<p>${h}</p>`, isSmallSystem: c => c < 10, roomWords: v => String(v) };
  const projects = { a: { key: 'a', title: '1 Main St', phase: 'review' }, b: { key: 'b', title: '2 King St', phase: 'approved' } };
  const window = {
    PeelUtil: U, PeelPhases: {},
    PeelDemand: { estimate: () => ({ totalUnits: 100, population: 250 }), DEFAULT_CRITERIA: { ppu: { apartment: 2 } } },
    PeelApp: { state: { svcModel: model ? { plantCap: pl => (pl === 'Inglewood' ? null : { rated: 100, committed: 70, perPerson: 300 }) } : null, criteria: {} }, jobsOf: () => 0 },
    PeelDevNav: { projectByKey: k => projects[k] },
    PeelMapMarkers: { plantOfDev: () => 'Lakeview', svcLayerOf: p => (p.phase === 'review' ? 'proposed' : 'approved') },
    PeelMasterPlan: { PLANT_TRIGGER: 0.9 },
    PeelSvcData: { PLANT_SHORT: { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood' } },
    PeelPanel: { chip: s => `<span class="pnl-chip t-${s.tone}">${s.text}</span>`, kv: (l, v, t) => ({ html: `<div class="pnl-kv"><span>${l}</span><span${t ? ` class="t-${t}"` : ''}>${v}</span></div>`, kv: true }) },
  };
  // (drawn: the folds on screen, the map's and the page's; without it the document has no querySelectorAll)
  const document = { addEventListener: (t, f) => { (docL[t] = docL[t] || []).push(f); }, querySelector: () => el, ...(drawn ? { querySelectorAll: s => (s === '#pnl-alloc-rec' ? drawn : []) } : {}) };
  const ctx = { window, document, module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/demand-ui.js'), ctx);
  return { DU: ctx.module.exports, fire: (t, e) => (docL[t] || []).forEach(f => f(e)) };
}

test('Allocations recorded: a fold of Capacity’s panel, closed unless an old link asked, the reader’s choice kept', () => {
  const { DU, fire } = loadDemandUI();
  let f = DU.allocFold();
  assert.equal(f.title, 'Allocations recorded (2)');
  assert.equal(f.id, 'pnl-alloc-rec', 'not pnl-alloc: that is the development’s own form, js/app.js showAllocSub');
  assert.equal(f.open, false, 'closed to start');
  assert.match(f.html, /<strong>2<\/strong> allocations recorded for <strong>160 units<\/strong>; 1 ahead of approval\./);
  assert.match(f.html, /G\.E\. Booth (room|nearly full|over)/, 'each plant’s room after them');
  assert.match(f.html, /<div class="pnl-kv"><span>1 Main St<\/span><span>120 units · G\.E\. Booth<\/span><\/div>/, 'the latest, as text');
  assert.doesNotMatch(f.html, /data-pnl-dev/, 'no button that would open a development in the hidden map, on a page');
  assert.match(f.html, /<button type="button" class="btn small link" data-at="svc:capacity" data-full-table="svc:capacity" data-ft-go="Plants: room at the 90%">Export or import the CSV ›<\/button>/);
  // An old Allocations link opens it, for the visit; a reader who closes it keeps it closed.
  DU.openAllocFold(); assert.equal(DU.allocFold().open, true);
  fire('toggle', { target: { id: 'pnl-alloc-rec', open: false } }); assert.equal(DU.allocFold().open, false);
  fire('toggle', { target: { id: 'pnl-alloc', open: true } }); assert.equal(DU.allocFold().open, false, 'another fold leaves it');
  fire('toggle', { target: { id: 'pnl-alloc-rec', open: true } }); assert.equal(DU.allocFold().open, true);
  // The link applied again (a saved view, a data-at svc:alloc) after the reader closed a drawn fold: it opens
  // again, both copies (the map's and the page's); the toggle that follows records it.
  const drawn = [{ id: 'pnl-alloc-rec', open: false }, { id: 'pnl-alloc-rec', open: false }], L2 = loadDemandUI({ drawn });
  L2.DU.openAllocFold(); L2.fire('toggle', { target: drawn[0] });
  assert.deepEqual(drawn.map(d => d.open), [true, true]); assert.equal(L2.DU.allocFold().open, true);
  drawn[0].open = false; L2.fire('toggle', { target: drawn[0] });
  assert.equal(L2.DU.allocFold().open, false, 'closed again by the reader: a redraw (a System tap) keeps it closed');
  // None recorded: it says how to record one; no servicing model: no fold.
  f = loadDemandUI({ allocations: {} }).DU.allocFold();
  assert.equal(f.title, 'Allocations recorded (0)');
  assert.match(f.html, /No allocations recorded yet: record one from a development \(its ⋯ menu, Record allocation\) or import a CSV in the full table\./);
  assert.equal(loadDemandUI({ model: false }).DU.allocFold(), null);
});

test('Allocations recorded: the jump has its stop, the CSV stays, the fold is Capacity’s on the map and the page', () => {
  const d = src('js/demand-ui.js');
  // (the full table's stop the fold jumps to: the plants table's own caption, with the CSV bar under it)
  assert.match(d, /<table class="dt"><caption>Plants: room at the 90% expansion trigger after existing \+ built \+ committed, and after allocations/);
  assert.ok(d.indexOf('<caption>Plants: room at the 90%') < d.indexOf('data-alloc-csv>Export CSV'), 'the CSV bar under it');
  assert.ok(!d.includes("PN.set('svc:alloc'"), 'no Allocations panel');
  assert.match(d, /const api = \{ allocBoxHTML, [^\n]*allocFold, openAllocFold \};/);
  assert.match(d, /document\.addEventListener\('toggle', e => \{ if \(e\.target && e\.target\.id === 'pnl-alloc-rec'\) allocOpen = e\.target\.open; \}, true\);/, 'toggle does not bubble: a capture listener');
  assert.match(d, /share the list from Servicing › Capacity, Allocations recorded \(Export CSV in its full table\), at Peel\./);
  assert.match(d, /function onAllocChange\(\) \{ renderAlloc\(\); if \(root\.PeelSvcCapacity && root\.PeelSvcCapacity\.render\) root\.PeelSvcCapacity\.render\(\);/, 'recording one redraws the fold');
  const c = src('js/svc-capacity.js');
  assert.match(c, /folds: \[\.\.\.\(root\.PeelWwEvents && App\(\)\.state\.wwEvents \? \[\{ title: 'Overflows and spills reported', html: root\.PeelWwEvents\.summaryHTML\(\) \}\] : \[\]\), \.\.\.\(root\.PeelDemandUI && root\.PeelDemandUI\.allocFold \? \[root\.PeelDemandUI\.allocFold\(\)\]\.filter\(Boolean\) : \[\]\)\],/);
  // The Servicing capacity page shows the panel's folds (it dropped them before).
  const w = src('js/ws-pages.js'), t = w.slice(w.indexOf('function tight()'), w.indexOf('\n  }\n', w.indexOf('function tight()')));
  assert.match(t, /\n {6}folds: s\.folds \|\| \[\],\n/);
});

// js/svc-capacity.js in a vm, with a document holding #svc-checks-body.
function loadCapacity(window, body = { innerHTML: '' }) {
  const document = { querySelector: s => (s === '#svc-checks-body' ? body : null), querySelectorAll: () => [], addEventListener: () => {} };
  const U = { esc: x => String(x), fmtNum: n => String(n), fmt1: n => n.toFixed(1), hlP: h => `<p>${h}</p>`, skel: t => `[${t}]` };
  const ctx = { window: { PeelUtil: U, PeelSvcTab: { optSwitch: () => '<div class="svc-switch"></div>' }, PeelMapMarkers: { THIS_YEAR: 2026 }, ...window }, document, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/svc-capacity.js'), ctx);
  return ctx.module.exports;
}

test('Records › Data checks, Servicing model: the six comparisons, a section as a string or { html }, the calibration in words', () => {
  const body = { innerHTML: '' };
  const MC = { wwMasterPlanVsTracker: () => '<h3>2020 Master Plan vs this tracker</h3>', wwReportsVsModel: () => '<h3>2025 annual reports</h3>', waterProduction: () => { throw new Error('not loaded'); }, caledonGroundwater: null };
  Object.defineProperty(MC, 'plantFlows', { enumerable: true, get: () => ({ html: '<h3>Plant flow: Ministry data</h3>' }) });
  Object.defineProperty(MC, 'wwRoster', { enumerable: true, get: () => ({ html: 7 }) });
  const model = { mode: 'calibrated', plantCap: pl => ({ f: { Lakeview: 1.12, Clarkson: 0.95, Inglewood: 1.3 }[pl] }) };
  const C = loadCapacity({ ModelChecks: MC, PeelApp: { state: { svcModel: model } }, PeelSvcData: { PLANT_SHORT: { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood' } } }, body);
  C.renderChecks();
  const h = body.innerHTML;
  assert.match(h, /<h3 class="sub-title">Servicing model<\/h3>/);
  assert.ok(h.indexOf('2020 Master Plan vs this tracker') < h.indexOf('2025 annual reports') && h.indexOf('2025 annual reports') < h.indexOf('Plant flow: Ministry data'), 'in order; a { html } section is read');
  assert.doesNotMatch(h, /not loaded|undefined|\[object/, 'a throwing, missing or odd section renders as nothing');
  assert.match(h, /<strong>G\.E\. Booth<\/strong> measured 1\.12 times the model's flow, <strong>Clarkson<\/strong> measured 0\.95 times the model's flow/);
  // Design flows: no factors, a way to them.
  const b2 = { innerHTML: '' };
  loadCapacity({ ModelChecks: {}, PeelApp: { state: { svcModel: { mode: 'design', plantCap: () => ({ f: 1 }) } } } }, b2).renderChecks();
  assert.match(b2.innerHTML, /switch the Scenario to the capacity check \(2025 flows\) to see the calibration factors/);
  assert.match(b2.innerHTML, /\[Loading the servicing model\]/, 'nothing registered yet: the loading line');
  const c = src('js/svc-capacity.js');
  assert.ok(!c.includes("PN.set('svc:checks'"), 'no Model checks panel');
  assert.match(c, /const renderFor = sub => \{ if \(sub === 'capacity'\) render\(\); else if \(sub === 'network'\) \{/, 'no checks sub-view');
  // Records draws it with its Data checks; the old link to Servicing › Model checks is gone.
  const r = src('js/records-tab.js');
  assert.match(r, /body\.innerHTML = note \+ \(sub === 'checks' \? checksHTML\(\) : sourcesHTML\(\)\);\n {4}if \(sub === 'checks' && root\.PeelSvcCapacity && root\.PeelSvcCapacity\.renderChecks\) root\.PeelSvcCapacity\.renderChecks\(\);/);
  assert.doesNotMatch(r, /svc:checks|Servicing › Model checks|label: 'Servicing checks'/);
  assert.match(r, /fullTitle: 'Records › Data checks: duplicates, published totals, permit counts, the accuracy report and the servicing model'/);
});

test('Servicing › Network lists the existing water facilities, and the hydraulic check while its lab is on', () => {
  const run = labs => {
    let spec = null;
    const PeelPanel = { set: (k, s) => { if (k === 'svc:network') spec = s; }, areaHead: (where, name) => ({ where, name }) };
    const C = loadCapacity({ PeelPanel, PeelLabs: { on: id => labs && id === 'hydro' }, PeelApp: { state: { svcModel: { zones: new Map() }, servicing: { zones: [] } } }, PeelSvcTab: { rankedBlocks: () => [], optSwitch: () => '' }, PeelSvcData: { drName: a => a.name } });
    C.renderNetworkPanel([]);
    return spec.lists.find(l => l.title === 'Existing water facilities');
  };
  let l = run(false);
  assert.deepEqual(plain(l.seeAll), { 'data-full-table': 'svc', 'data-ft-go': 'Existing water facilities' });
  assert.deepEqual(plain(l.rows.map(r => r.attrs['data-ft-go'])), ['Existing water facilities']);
  assert.equal(l.total, 1);
  l = run(true);
  assert.deepEqual(plain(l.rows.map(r => r.attrs['data-ft-go'])), ['Existing water facilities', 'Hydraulic']);
  assert.match(l.rows[1].html, /Hydraulic check \(beta, Labs\)/);
  // (each value names a stop the full table has: the facilities table sits under its own heading)
  assert.match(src('js/masterplan.js'), /<h3 class="svc-sub">Existing water facilities <span class="muted small">/);
  assert.match(src('js/masterplan.js'), /<h3 class="svc-sub">Hydraulic check <span class="fr-b fr-ref">/);
});

// ---- Chunk 2: Records › Data checks, one home; the Sources & checks gear page retires ----------------

test('Records › Data checks, Servicing model list: a row a comparison with its measured figure, the Caledon wells last', () => {
  const PN = require('../js/panel.js');
  const model = { mode: 'calibrated', plantCap: pl => ({ f: { Lakeview: 1.12, Clarkson: 0.95, Inglewood: 1.3 }[pl] }) };
  const reports = { water: { southPeel: { maxDayMLd: 612.4, plants: [{ ratedMLd: 600 }, { ratedMLd: 500 }] }, caledon: [{}, {}, {}, {}, {}] } };
  const state = { svcModel: model, reports, plantFlows: { checks: [{ diffPct: 1.2 }, { diffPct: -3.4 }] }, wwEvents: { stations: { southPeel: ['a', 'b'], inglewood: ['c'] } } };
  const SDs = { PeelSvcData: { PLANT_SHORT: { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood' } } };
  const rows = loadCapacity({ PeelPanel: PN, PeelApp: { state }, ...SDs }).checksRows();
  const cells = rows.map(r => [...r.html.matchAll(/<span[^>]*>([^<]*)<\/span>/g)].map(m => m[1]));
  assert.deepEqual(plain(cells.map(c => c[0])), ['2020 Master Plan vs this tracker', '2025 annual reports vs the model', '2025 water production', 'Plant flow: Ministry data vs the annual reports', 'Pumping stations: GIS layer vs the collection system report', 'Caledon groundwater systems']);
  assert.equal(cells[1][1], "measured G.E. Booth 1.12, Clarkson 0.95, Inglewood 1.30 times the model's flow", 'the calibration factors, in words');
  assert.equal(cells[2][1], 'South Peel maximum day 612.4 of 1100.0 ML/d rated (incl. York supply)');
  assert.equal(cells[3][1], 'largest difference 3.4%, close'); assert.match(rows[3].html, /<span class="t-tight">/);
  assert.equal(cells[4][1], 'the report’s 3 stations against the open layer');
  // Each row opens the full table at its comparison (the Model checks rows did; the plain kv lines did nothing).
  assert.ok(rows.every(r => r.kv && r.attrs['data-full-table'] === 'records' && r.attrs['data-ft-go']), 'kv rows, each a jump into the full table');
  assert.deepEqual(plain(rows.map(r => r.attrs['data-ft-go'])), ['2020 Master Plan vs this tracker', '2025 annual reports vs.', 'Reported 2025 production', 'Plant flow: Ministry data', 'Pumping stations: open GIS layer', 'Caledon groundwater systems']);
  // (each names its section's own heading in the full table)
  assert.match(src('js/svc-plants.js'), /<h3 class="svc-sub">2025 annual reports vs\. the model <span/);
  assert.match(src('js/water-tab.js'), /<h3 class="svc-sub">Reported 2025 production <span[\s\S]*<h3 class="svc-sub">Caledon groundwater systems <span/);
  assert.match(src('js/plant-flows.js'), /<h3 class="sub-title">Plant flow: Ministry data against the Region's annual reports<\/h3>\n\s*<table/);
  assert.match(src('js/ww-events.js'), /<h3 class="sub-title">Pumping stations: open GIS layer against the collection system report<\/h3>/);
  // (the roster has no table under its heading: the full table finds such a section by its heading, js/panel.js)
  assert.match(src('js/panel.js'), /const goTo = go => [^\n]*\|\| headNamed\(g\); if \(j\) jumpTo\(j\.at\); \}\);/);
  assert.match(PN.html({ key: 'records:checks', lists: [{ title: 'Servicing model', rows, total: rows.length }] }), /<li class="pnl-row kv" data-full-table="records" data-ft-go="Reported 2025 production" tabindex="0" role="button">/);
  // Design flows: the way to the factors; the gear page's two checks only once their data is in.
  const d = loadCapacity({ PeelPanel: PN, PeelApp: { state: { svcModel: { mode: 'design', plantCap: () => ({ f: 1 }) }, reports } }, ...SDs }).checksRows();
  assert.match(d[1].html, /design flows: the capacity check shows the factors/);
  assert.equal(d.length, 4, 'no plant flow or station roster rows before their data loads');
  assert.deepEqual(plain(loadCapacity({ PeelPanel: PN, PeelApp: { state: { reports } }, ...SDs }).checksRows()), [], 'none before the servicing model');
  // (the list's See all lands on a stop the full table has: the Master Plan section's own heading)
  assert.match(src('js/svc-plants.js'), /<h3 class="svc-sub">2020 Master Plan vs this tracker <span class="muted small">/);
});

// js/records-tab.js in a vm, with the real panel builder.
function loadRecords(window) {
  const PN = require('../js/panel.js');
  const ctx = { window: { PeelUtil: { $: () => null, esc: s => String(s), fmtNum: n => String(n) }, PeelPanel: PN, PeelApp: { state: { audit: null } }, ...window }, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/records-tab.js'), ctx);
  return ctx.module.exports;
}

test('Records › Data checks panel: the Servicing model group, then Review outlets (its count only once the DC model is worked out)', () => {
  const PN = require('../js/panel.js');
  const six = ['a', 'b', 'c', 'd', 'e', 'f'].map(t => PN.kv(t, 'x'));
  let asked = 0;
  const DO = { queue: () => { asked++; return { all: [{ rec: null }, { rec: {} }, { rec: null }] }; } };
  let s = loadRecords({ PeelSvcCapacity: { checksRows: () => six }, PeelDevOutlets: DO }).checksPanelSpec();
  assert.deepEqual(plain(s.head.trail.map(t => t.label)), ['Peel', 'Records › Data checks']);
  assert.deepEqual(plain(s.lists.map(l => l.title)), ['Servicing model', 'Where developments discharge'], 'no data checks list before the audit runs');
  const [svc, out] = s.lists;
  assert.equal(svc.total, 6);
  assert.deepEqual(plain(svc.seeAll), { 'data-full-table': 'records', 'data-ft-go': '2020 Master Plan vs this tracker' });
  assert.match(PN.html({ ...s, key: 'records:checks' }), /<h3>Servicing model<\/h3>[\s\S]*?data-ft-go="2020 Master Plan vs this tracker">See all \(6\) →<\/button>/, 'five rows, then See all into the full table');
  assert.deepEqual(plain(out.rows[0].attrs), { 'data-ws-page': 'outlets', title: 'Review outlets: check and fix where each development discharges' });
  assert.doesNotMatch(out.rows[0].html, /to review/, 'no PeelDcImpact.current: no count');
  assert.equal(asked, 0, 'and the queue is never asked (it would build the DC model)');
  assert.deepEqual(plain(s.foot.secondary), [{ label: 'Review outlets', attrs: { 'data-ws-page': 'outlets' }, title: 'Where each development discharges (QA/QC)' }]);
  assert.match(s.method, /Calibration factor = \(reported − external inflows\) ÷ the model today/, 'the factors explained (was the Model checks panel’s method)');
  // The model not worked out yet in this visit: still no count, no queue.
  s = loadRecords({ PeelSvcCapacity: { checksRows: () => six }, PeelDevOutlets: DO, PeelDcImpact: { current: () => null } }).checksPanelSpec();
  assert.doesNotMatch(s.lists[1].rows[0].html, /to review/); assert.equal(asked, 0);
  // Worked out (Capital › DC projects built it): the developments with no reviewed outlet.
  s = loadRecords({ PeelSvcCapacity: { checksRows: () => six }, PeelDevOutlets: DO, PeelDcImpact: { current: () => ({}) } }).checksPanelSpec();
  assert.match(s.lists[1].rows[0].html, /<span class="pnl-r-fig">2<small>to review<\/small><\/span>/); assert.equal(asked, 1);
  // No servicing module (a page building the spec on demand, a test): one muted row, no throw.
  s = loadRecords({}).checksPanelSpec();
  assert.equal(s.lists[0].title, 'Servicing model');
  assert.deepEqual(plain(s.lists[0].rows), [{ html: '<span class="small muted">The servicing model loads with the servicing data.</span>' }]);
  assert.doesNotMatch(PN.html({ ...s, key: 'records:checks' }), /See all/);
});

test('Records › Data checks on a page, and once the model lands', () => {
  // A page's section keeps a row that opens a page (Reference › Data checks' Review outlets).
  const w = src('js/ws-pages.js'), line = /\n {2}(const toMap = [^\n]*)\n/.exec(w);
  assert.ok(line, 'toMap');
  const toMap = new Function(`${line[1]}; return toMap;`)();
  const r = { attrs: { 'data-ws-page': 'outlets', title: 'Review outlets' }, html: 'x' };
  assert.equal(toMap('data', r), r, 'a data-ws-page row is left as it is');
  assert.deepEqual(toMap('tight', { attrs: { 'data-ss': 'plant:Lakeview', title: 't' }, html: 'y' }).attrs, { 'data-ws-go': 'tight', 'data-ws-ss': 'plant:Lakeview', title: 't' }, 'a scope row still opens the map');
  // The Servicing model group fills in when the model is built (Peel or an area; at a development Records is its files),
  // and with another tab open its panel is stored all the same: Reference › Data checks reads it (a stale group
  // there kept the loading line, or the last Scenario's factors).
  assert.match(src('js/svc-tab.js'), /if \(AT\(\)\.getFootTab\(\) === 'dca'\) DCAT\(\)\.renderDca\(\);\n[^\n]*\n[^\n]*\n[^\n]*\n {4}if \(!p && root\.PeelRecordsTab\) \{ if \(AT\(\)\.getFootTab\(\) === 'records'\) root\.PeelRecordsTab\.render\(\); else if \(root\.PeelPanel && root\.PeelRecordsTab\.checksPanelSpec\) root\.PeelPanel\.set\('records:checks', root\.PeelRecordsTab\.checksPanelSpec\(\)\); \}/);
  // (Home's Records › Data checks, Reference's on a page before navigation phase 6, takes the stored panel while
  // it is the area's: js/sections.js areaPanel)
  const sec = src('js/sections.js');
  assert.match(sec, /'records:checks': \{ keys: \['records:checks'\] \}/);
  assert.match(sec, /\{ id: 'checks', title: 'Data checks', at: 'records:checks' \}/, 'Help’s bar links there');
  assert.match(sec, /if \(e && e\.spec && e\.scope === 'area'\) return e\.spec;/);
});

// js/ws-pages.js in a vm: a page built from the stored panels (PeelPanel.get), with the page's own modules stubbed.
function loadPages(window) {
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  Object.assign(window, { document, PeelUtil: { esc: x => String(x), fmtNum: n => String(n), fmt1: n => n.toFixed(1) } }, window);
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/ws-pages.js'), ctx);
  return window.PeelWsPages;
}

// (navigation phase 6: Reference › Data checks on a page is Home's Records › Data checks, the map's panel as a view)
test('Records › Data checks on Home: its Servicing model rows and See all open the map’s full table at their comparison; its footer’s actions first', () => {
  const PN = require('../js/panel.js');
  const rows = ['2020 Master Plan vs this tracker', '2025 annual reports vs.', 'Reported 2025 production', 'Plant flow: Ministry data', 'Pumping stations: open GIS layer', 'Caledon groundwater systems'].map(go => ({ ...PN.kv(go, 'x'), attrs: { 'data-full-table': 'records', 'data-ft-go': go } }));
  const foot = { primary: { label: 'Duplicate check', attrs: { 'data-full-table': 'records', 'data-ft-go': 'Units: every record' } }, secondary: [{ label: 'Review outlets', attrs: { 'data-ws-page': 'outlets' } }] };
  const checks = { head: { name: 'Are the data and the model sound?' }, answer: 'a', figures: [], method: '', sources: '', foot,
    lists: [{ title: 'Servicing model', rows, total: 6, seeAll: { 'data-full-table': 'records', 'data-ft-go': '2020 Master Plan vs this tracker' } }, { title: 'Where developments discharge', rows: [{ attrs: { 'data-ws-page': 'outlets', title: 'Review outlets' }, html: 'r' }, { attrs: { 'data-pnl-dev': 'd1', title: 'Open it' }, html: 'd' }], total: 2 }] };
  const secs = require('../js/sections.js').WORKSPACES.reference.secs;
  const P = loadPages({ PeelPanel: { get: () => null, scenarioChip: () => '' }, PeelWorkspaces: { BY_ID: { tight: {}, projects: {} } }, PeelApp: { state: {} },
    PeelSections: { VIEWS: require('../js/sections.js').VIEWS, WORKSPACES: { reference: { secs } }, areaPanel: k => (k === 'records:sources' ? { head: {}, answer: 's', lists: [] } : checks) } });
  const m = P.build('records:checks'), [svc, out] = m.lists;
  assert.equal(m.id, 'records:checks'); assert.equal(m.name, 'Are the data and the model sound?');
  // (Records has no map workspace: a data-ws-go row would do nothing; data-at + data-full-table opens the map there)
  assert.deepEqual(plain(svc.rows.map(r => r.attrs)), rows.map(r => ({ 'data-at': 'records:checks', 'data-full-table': 'records', 'data-ft-go': r.attrs['data-ft-go'] })));
  assert.deepEqual(plain(svc.see), { 'data-at': 'records:checks', 'data-full-table': 'records', 'data-ft-go': '2020 Master Plan vs this tracker' });
  assert.match(P.listHTML(svc), /data-ft-go="2020 Master Plan vs this tracker">See all \(6\) →<\/button>/, 'the sixth (the Caledon wells) reachable from the page');
  assert.deepEqual(plain(out.rows[0].attrs), { 'data-ws-page': 'outlets', title: 'Review outlets' }, 'a page row is left as it is');
  assert.deepEqual(plain(out.rows[1].attrs), { 'data-pnl-dev': 'd1', title: 'Open it', 'data-at': 'records:checks' }, 'another row: the full map at the view, then its own handler');
  // The footer's own actions first (foot.primary restored, design §5 row 56), then the map at the view.
  assert.deepEqual(plain(m.actions), [{ ...foot.primary, primary: true }, foot.secondary[0], { label: 'Open the map', attrs: { 'data-ws-full': '', 'data-at': 'records:checks' } }, { label: 'Full table', attrs: { 'data-at': 'records:checks', 'data-full-table': '' } }]);
  // Help's bar: Data sources and Data checks open Home's Records tab (the strip's attributes).
  const bar = P.build('help').top;
  assert.match(bar, /data-pg-tab="records" data-pg-sub="sources" aria-pressed="false">Data sources</);
  assert.match(bar, /data-pg-tab="records" data-pg-sub="checks" aria-pressed="false">Data checks</);
  // (a page link to the map's tools: the full map first, then its own handler; js/workspaces.js MAP_LINK)
  assert.match(src('js/workspaces.js'), /const MAP_LINK = '\[data-at\], \[data-ss\], \[data-full-table\], \[data-trace\], \[data-wtrace\], \[data-scope-compare\], \[data-mview\], \[data-pnl-ce-map\]';/);
});

test('the Servicing capacity page under a System: its header and figures count both systems (as Home’s figure); Soonest limits follows the System and names it', () => {
  let sys = 'water';
  const spec = s => ({ head: { status: { tone: 'over', text: `${s} over` }, identity: `Peel · ${s}` }, answer: `answer ${s}`, figures: [{ v: s, label: 'over capacity at build-out' }], lists: [{ title: 'Facilities', tools: `[seg ${s}]`, rows: [{ html: `row ${s}`, attrs: { 'data-ss': 'plant:Lakeview' } }], total: 1 }], folds: [], method: 'm', sources: 's' });
  const asked = [];
  const P = loadPages({ PeelPanel: { get: k => (k === 'svc:capacity' ? { scope: 'area', spec: spec(sys) } : null), scenarioChip: () => '' }, PeelWorkspaces: { BY_ID: { tight: { label: 'Servicing capacity' } } }, PeelAnalysisTabs: { getSys: () => sys },
    PeelSvcCapacity: { collect: () => [], panelSpec: (rows, s) => { asked.push(s); return spec(s); } },
    PeelApp: { state: { criteria: { wastewater: { avg: 290 }, water: { avg: 280, maxDay: 1.8 } }, servicing: { psAreas: [] }, muni: '' } } });
  let m = P.build('tight');
  assert.deepEqual(asked, ['both'], 'the header from both systems');
  assert.equal(m.identity, 'Peel · both'); assert.equal(m.answer, 'answer both'); assert.equal(m.status.text, 'both over'); assert.equal(m.figures[0].v, 'both');
  assert.equal(m.lists[0].title, 'Soonest limits: water'); assert.equal(m.lists[0].tools, '[seg water]'); assert.equal(m.lists[0].rows[0].html, 'row water');
  sys = 'ww'; assert.equal(P.build('tight').lists[0].title, 'Soonest limits: wastewater');
  sys = 'both'; asked.length = 0; m = P.build('tight');
  assert.deepEqual(asked, [], 'at Both the stored panel is the page’s');
  assert.equal(m.lists[0].title, 'Soonest limits'); assert.equal(m.identity, 'Peel · both');
  // Capacity's panelSpec takes the System as asked (the map's panel: the one picked).
  assert.match(src('js/svc-capacity.js'), /function panelSpec\(all, sys = sysNow\(\)\) \{\n {4}const now = MM\(\)\.THIS_YEAR, end = SP\(\)\.hz\.end;\n {4}const rows = sys === 'both' \? all : all\.filter\(r => r\.sys === sys\)/);
});

test('the Sources & checks gear page is gone: the Overview’s ⓘ link opens Records › Data checks, wherever it is drawn', () => {
  const ov = src('js/overview-tab.js');
  assert.match(ov, /'<span class="fr-b fr-ok">all sources current<\/span>'\} <button type="button" class="btn small link ov-go" data-at="records:checks">Records › Data checks →<\/button><\/p>`;/, 'a data-at link: handled document-wide, so the panel’s Method fold and a page work too');
  assert.doesNotMatch(ov, /ovTab === 'criteria'|openGearPage|const TB = /);
  const all = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => src(`js/${f}`)).join('\n');
  assert.doesNotMatch(all, /GearPages\.sources|openGearPage\('sources'\)|data-tbg="sources"|function (sourcesPageHTML|modelSectionsHTML)\(/);
  assert.doesNotMatch(src('js/topbar.js'), /k === 'sources'/, 'no dead gear-menu branch');
  assert.match(src('js/svc-plants.js'), /The 2025-report comparison and the Master Plan comparison are in Records › Data checks\./);
  assert.match(src('js/info.js'), /'accuracy-report': \{ title: 'Accuracy report', body: 'The tracker\\u2019s own error rates, in Records › Data checks/);
});

// ---- Chunk 3: one System control (navigation-design §3.4, N-11), the lens sets it (AD-9), one sort vocabulary.
// js/analysis-tabs.js in a vm (it reads the DOM and the store at load), with the window's other modules.
// (dom: what document.querySelectorAll finds for a selector, [] by default)
function loadTabs(win = {}, stored = {}, dom = () => []) {
  const el = () => null, store = { get: (k, d) => (Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : d), set: () => {} };
  const document = { querySelector: el, querySelectorAll: s => dom(s), getElementById: el, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document, ...win }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}

test('one System control: Both · Wastewater · Water, one on; a pick redraws Capacity, and Capital › DC timing once it has drawn, when that is cheap or on screen', () => {
  const T = loadTabs();
  const seg = T.sysSeg();
  assert.match(seg, /^<div class="seg" role="group" aria-label="System">/);
  assert.deepEqual([...seg.matchAll(/data-sys="(\w+)"[^>]*>([^<]+)</g)].map(m => [m[1], m[2]]), [['both', 'Both'], ['ww', 'Wastewater'], ['water', 'Water']]);
  assert.equal((seg.match(/class="btn small on"/g) || []).length, 1, 'exactly one on');
  assert.match(seg, /class="btn small on" data-sys="both" aria-pressed="true">Both</);
  // A pick: Capacity redraws every time; DC timing (DC projects' list until navigation phase 4) only once it
  // has drawn, and only while its DC impact model is worked out for this scenario or its panel is on screen (a
  // tap on Capacity, or a lens, never builds that model: it walks every sewer pipe); else its stored panel
  // goes, for the next Capital open or page to draw (never a development's own). A quiet set (a link, before
  // the panels draw) redraws neither.
  let current = null, onScreen = [], dev = null;
  const calls = [], W = { PeelSvcCapacity: { render: () => calls.push('capacity') }, PeelDcProjects: { shown: () => false, refresh: () => calls.push('dcproj') },
    PeelDcImpact: { current: () => current }, PeelPanel: { sync: () => {}, clear: k => calls.push(`clear ${k}`) }, DevScope: { current: () => dev } };
  const T2 = loadTabs(W, {}, s => (s === '[data-dcproj-sort], [data-dcproj-back]' ? onScreen : []));
  T2.setSys('water'); assert.deepEqual(calls, ['capacity']);
  assert.match(T2.sysSeg(), /class="btn small on" data-sys="water" aria-pressed="true">Water</);
  calls.length = 0; W.PeelDcProjects.shown = () => true;
  T2.setSys('wastewater'); assert.deepEqual(calls, ['capacity', 'clear dca:timing'], 'drawn once, the model since out of date, off screen: not rebuilt in the tap'); assert.equal(T2.getSys(), 'ww');
  calls.length = 0; onScreen = [{ getClientRects: () => [] }];
  T2.setSys('water'); assert.deepEqual(calls, ['capacity', 'clear dca:timing'], 'its Sort in a hidden tab is not on screen');
  calls.length = 0; onScreen = [{ getClientRects: () => [{}] }];
  T2.setSys('ww'); assert.deepEqual(calls, ['capacity', 'dcproj'], 'on screen: redrawn');
  calls.length = 0; onScreen = []; current = {};
  T2.setSys('water'); assert.deepEqual(calls, ['capacity', 'dcproj'], 'the model worked out for this scenario: cheap, redrawn');
  calls.length = 0; current = null; dev = { key: 'd1' };
  T2.setSys('ww'); assert.deepEqual(calls, ['capacity'], 'at a development its own Capital panel (js/dca-tab.js) stays');
  calls.length = 0; dev = null;
  T2.setSys('both', { quiet: true }); assert.deepEqual(calls, []); assert.equal(T2.getSys(), 'both');
  // A tap anywhere (the map's panels, a page's sections) and the share link follows.
  assert.match(src('js/analysis-tabs.js'), /document\.addEventListener\('click', e => \{ const b = e\.target\.closest && e\.target\.closest\('\[data-sys\]'\); if \(b\) \{ setSys\(b\.dataset\.sys\); Sh\(\)\.viewLink\.write\(\); \} \}\);/);
});

test('openTab with a sub-view another tab now holds: that tab is the one picked (as a data-at link)', () => {
  const T = loadTabs({ PeelPanel: { sync: () => {} } });
  T.openTab('svc', 'checks');
  assert.equal(T.getFootPref(), 'records'); assert.equal(T.getRSub(), 'checks');
  T.openTab('svc', 'network'); assert.equal(T.getFootPref(), 'svc');
  T.openTab('dev'); assert.equal(T.getFootPref(), 'overview');
});

test('Servicing › Capacity reads the one System: its list, its counts and its header name the system; the full table keeps both', () => {
  const window = { PeelUtil: { esc: x => String(x), fmtNum: n => String(Math.round(n)), fmt1: n => n.toFixed(1) }, PeelMapMarkers: { THIS_YEAR: 2026 }, PeelSvcPlants: { hz: { end: 2051 } }, PeelSvcTab: { optSwitch: () => '' } };
  { const c = { window }; c.globalThis = c; vm.runInNewContext(src('js/panel.js'), c); }
  let sys = 'water';
  window.PeelAnalysisTabs = { getSys: () => sys, sysSeg: () => `<div class="seg" aria-label="System">[${sys}]</div>` };
  const ctx = { window, module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/svc-capacity.js'), ctx);
  const C = ctx.module.exports, hz = { end: 2051, at: [], c80: null, c90: null, c100: null };
  const rows = [
    { id: 'plant:Lakeview', ss: 'plant:Lakeview', sys: 'ww', kind: 'plant', name: 'G.E. Booth', sub: 'plant', compared: 'Flow vs rated', basis: 'metered', unit: 'ML/d', cap: 518, capWord: 'rated', existing: 400, built: 0, committed: 480, buildout: 620, limit: { y: 2028, what: '90% trigger' }, horizon: hz },
    { id: 'ps:y', sys: 'ww', kind: 'ps', name: 'Y', sub: 'pumping station', compared: 'Peak wet vs firm', basis: 'design', unit: 'L/s', cap: 800, capWord: 'firm', existing: 436, built: 0, committed: 437, buildout: 441, limit: { y: null, what: '100% firm' }, horizon: hz },
    { id: 'wsys:southPeel', ss: 'wsys:lake', sys: 'water', kind: 'wplant', name: 'South Peel', sub: 'treatment', compared: 'Max day vs rated', basis: 'metered', unit: 'ML/d', cap: 1700, capWord: 'rated', existing: 900, built: 0, committed: 1000, buildout: 1100, limit: { y: null, what: '90% trigger' }, horizon: hz },
  ].map(C.derive);
  let s = C.panelSpec(rows);
  assert.equal(s.lists[0].total, 1, 'Water: the water facilities only');
  assert.match(s.lists[0].rows[0].html, /💧 South Peel/);
  assert.match(s.head.identity, /^Peel · water: /); assert.equal(s.fullTitle, 'Servicing › Capacity · Peel · water');
  assert.match(s.answer, /of 1 facilities/);
  assert.ok(s.lists[0].tools.startsWith('<div class="seg" aria-label="System">[water]</div>'), 'the one control, first');
  assert.match(s.lists[0].tools, /data-cap-sort="limit" aria-pressed="(true|false)" title="The soonest limit year first">Soonest</);
  assert.match(s.lists[0].tools, /data-cap-sort="impact" aria-pressed="(true|false)" title="How far past its Master Plan limit at build-out, furthest first">Largest impact</);
  sys = 'ww'; s = C.panelSpec(rows);
  assert.equal(s.lists[0].total, 2); assert.match(s.head.identity, /^Peel · wastewater: /);
  sys = 'both'; s = C.panelSpec(rows);
  assert.equal(s.lists[0].total, 3); assert.match(s.head.identity, /^Peel · water and wastewater: /);
  // (the full table keeps every facility, both systems: the System is the panel's filter)
  sys = 'water';
  assert.equal((C.fullTableHTML(rows).match(/<tr data-basis=/g) || []).length, 3);
  // No System of its own any more.
  const c = src('js/svc-capacity.js');
  assert.doesNotMatch(c, /data-cap-sys|st\.sys/);
  assert.match(c, /const tools = `\$\{AT\(\) && AT\(\)\.sysSeg \? AT\(\)\.sysSeg\(\) : ''\}/);
});

test('Capital › DC timing (DC projects’ list until navigation phase 4) reads the one System (Both to start, was Wastewater); its sort words keep their own measure, each named', () => {
  const sets = [];
  const U = { esc: x => String(x), fmtNum: n => String(n), fmtMoney: n => `$${n}`, roundPop: n => Math.round(n), store: { get: (k, d) => d, set: () => {} }, CAPITAL: { asOf: 'Oct 2026' } };
  let sys = 'both';
  const window = { PeelUtil: U, PeelAnalysisTabs: { getSys: () => sys, sysSeg: () => `<div class="seg" aria-label="System">[${sys}]</div>` },
    PeelPanel: { areaHead: (w, name, status, identity) => ({ trail: [{ label: 'Peel' }, { label: w }], name, status, identity }), set: k => sets.push(k) },
    PeelDcCost: { projLabels: o => ({ short: `Project ${o.id}` }), dcAnalysis: () => ({ list: [], ppu: 2.5, baseBo: 0 }), dcaTimingChart: () => '' },
    PeelApp: { state: { svcModel: {}, dcInfra: {} } }, PeelMapMarkers: { THIS_YEAR: 2026, SEW: { data: {} } }, PeelMasterPlan: { allNeeds: () => [], reliefKey: () => null } };
  const pr = (key, s) => ({ key, sys: s, k: 'main', d: 600, devs: [{ tier: 'A', units: 10 }], gaps: 0, y0: 2028, y1: 2030, status: 'approved' });
  const m = { projects: new Map([['wastewater:W1', pr('W1', 'wastewater')], ['wastewater:W2', pr('W2', 'wastewater')], ['water:A1', pr('A1', 'water')]]), gateTiers: ['A', 'B1'], byDev: new Map() };
  window.PeelDcImpact = { model: () => m, current: () => m };
  const ctx = { window, setTimeout: () => 0 }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/dc-projects.js'), ctx);
  const D = window.PeelDcProjects;
  let s = D.panelSpec();
  assert.equal(s.lists[0].title, 'Water and wastewater projects'); assert.equal(s.lists[0].total, 3);
  sys = 'water'; s = D.panelSpec();
  assert.equal(s.lists[0].title, 'Water projects'); assert.equal(s.lists[0].total, 1);
  assert.match(s.lists[0].rows[0].html, /💧 Project A1/);
  sys = 'ww'; s = D.panelSpec();
  assert.equal(s.lists[0].title, 'Wastewater projects'); assert.equal(s.lists[0].total, 2);
  // (the Status chips first, then the one control, then the sorts)
  const t = s.lists[0].tools;
  assert.ok(t.startsWith('<div class="chips dcp-status"') && t.indexOf('<div class="seg" aria-label="System">[ww]</div>') > 0 && t.indexOf('[ww]') < t.indexOf('aria-label="Sort"'), 'the one control');
  // "Soonest" is the capacity year now (DC timing's measure); "Most affected" (units relying) keeps its own
  // words: each button names its measure.
  assert.match(t, /<div class="seg" role="group" aria-label="Sort"><button type="button" class="btn small on" data-dcproj-sort="soonest" aria-pressed="true" title="The year the capacity it relieves runs out, earliest first">Soonest</);
  assert.match(t, /data-dcproj-sort="affected" aria-pressed="false" title="Most units relying on it first">Most affected</);
  // shown: false until the panel has drawn (the System control redraws it only then).
  assert.equal(D.shown(), false);
  D.render(); assert.deepEqual(sets, ['dca:timing']); assert.equal(D.shown(), true);
  const d = src('js/dc-projects.js');
  assert.doesNotMatch(d, /data-dcproj-sys|dcprojSys|store\.get\('dcProjSys'/);
  assert.match(d, /const sysOk = x => \{ const s = sysNow\(\), pr = x\.pr; return s === 'both' \|\| pr\.sys === \(s === 'ww' \? 'wastewater' : 'water'\); \};/);
  assert.match(d, /\['perunit', '\$ a unit', 'Lowest DC cost per unit relying on it first'\]/);
});

test('the lens sets the System to what its map shows, then opens its tab; only a lens tap does', () => {
  const tb = src('js/topbar.js'), h0 = tb.indexOf("$('#tb-views').addEventListener('click'"), h = tb.slice(h0, tb.indexOf('\n  });', h0));
  const sy = h.indexOf('const sy = AT() && AT().SYS_OF_VIEW ? AT().SYS_OF_VIEW[b.dataset.mview] : null; if (sy && AT().setSys) AT().setSys(sy);');
  assert.ok(sy > h.indexOf('MA().setMapView(b.dataset.mview);') && sy < h.indexOf('AT().openTab(tab)'), 'after the map preset, before the tab opens');
  // (workspace chips, pages and Help's "Show me" call setMapView: they never set it)
  assert.doesNotMatch(src('js/map-analysis.js'), /setSys/);
});
