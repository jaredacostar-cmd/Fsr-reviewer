'use strict';
// SPEC §4 (Phase 3): the shell. Top bar: trail with its count, lens Planning / Water / Wastewater /
// Capital that sets the map only, the scenario chip. Left panel = find: Find · Watch · Data, the count
// first, Reset n filters, Save this view, Stage with Completed and Withdrawn / refused, rows that show their value,
// "Counts as" layer chips, the In view list. Bottom bar: timeline, data date and version.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = src('index.html');

test('top bar: lenses Planning / Water / Wastewater / Capital; a lens never switches the right panel tab', () => {
  assert.match(src('js/map-markers.js'), /MAP_VIEWS = \[\['planning', 'Planning'\], \['water', 'Water'\], \['wastewater', 'Wastewater'\], \['dc', 'Capital'\]\]/);
  const tb = src('js/topbar.js');
  const h = tb.slice(tb.indexOf("$('#tb-views').addEventListener('click'"), tb.indexOf('});', tb.indexOf("$('#tb-views').addEventListener('click'")));
  assert.match(h, /MA\(\)\.setMapView\(b\.dataset\.mview\);/);
  assert.doesNotMatch(h, /openAnalysis|showFootTab/, 'no tab change from the lens');
  assert.doesNotMatch(tb, /VIEW_TAB/);
});

test('top bar: the trail carries its count (developments, units)', () => {
  assert.match(src('js/topbar.js'), /<span class="tb-count" title="Developments in scope and their planned units">· \$\{fmtNum\(set\.length\)\} development/);
});

test('left panel: Find · Watch (the Data tab folded into Records, bundle 6); rows Where / What / When / Counts as / Flags collapsed with their value', () => {
  assert.match(HTML, /data-tab="explore">Find<\/button>/);
  assert.match(HTML, /data-tab="week">Watch <span class="badge-n"/);
  assert.doesNotMatch(HTML, /data-tab="data"/);
  const order = ['fr-where', 'fr-what', 'fr-when', 'fr-counts', 'fr-flags'].map(id => HTML.indexOf(`<details class="fp-sec fp-row" id="${id}">`));
  assert.ok(order.every(i => i > 0), 'all rows present');
  assert.deepEqual([...order].sort((a, b) => a - b), order, 'in the board order');
  for (const v of ['fv-where', 'fv-what', 'fv-when', 'fv-counts', 'fv-flags']) assert.match(src('js/filter-ui.js'), new RegExp(`set\\('#${v}'`), v);
  assert.match(HTML, /data-info="projects-list">In view <span class="muted small" id="list-count">/);
});

test('left panel: the count first, Reset n filters (views are saved from Export, bundle 6)', () => {
  const f = src('js/filter-ui.js');
  assert.match(f, /<span class="find-count"><b>\$\{fmtNum\(App\(\)\.state\.filtered\.length\)\}<\/b> developments<\/span>/);
  assert.match(f, />Reset \$\{activeList\.length\} filter\$\{activeList\.length === 1 \? '' : 's'\}<\/button>/);
  assert.doesNotMatch(f, /id="f-saveview"/);
});

test('Stage: one row per stage (permit and construction share one), then Built (with how many since the census) and Withdrawn / refused', () => {
  const r = src('js/render-list.js');
  assert.match(r, /const DONE = \['completed', 'cancelled'\];/);
  assert.match(r, /rows = shown\.filter\(p => !DONE\.includes\(p\.key\)\)/);
  assert.match(r, /const DONE_LABEL = \{ completed: 'Built', cancelled: 'Withdrawn \/ refused' \};/);
  assert.match(r, /const sinceCensus = base\.filter\(p => p\.phase === 'completed' && App\(\)\.layerOf\(p\) === 'built'\)\.length;/, 'completed after census day = the Built layer');
  assert.match(r, /\$\{fmtNum\(sinceCensus\)\} since the \$\{censusYear\} census/);
  assert.match(r, /if \(next\.has\(k\)\) next\.delete\(k\); else next\.add\(k\);/, 'each one toggles on its own');
  assert.doesNotMatch(r, /Done \/ gone/);
  assert.match(src('js/app.js'), /const DEFAULT_PHASES = \(\) => new Set\(\[\.\.\.ACTIVE_PHASES, 'completed'\]\);/, 'completed shows by default; withdrawn / refused does not');
  assert.match(src('js/search-filter.js'), /const ks = b\.dataset\.phase\.split\(' '\), next = new Set\(App\(\)\.state\.phases\), on = ks\.every\(k => next\.has\(k\)\);\n      for \(const k of ks\) \{ if \(on\) next\.delete\(k\); else next\.add\(k\); \}/, 'rows toggle (a merged row both its phases)');
  assert.match(r, /\{ keys: pc\.map\(x => x\.key\), label: 'Permit \/ under construction' \}/);
});

test('Counts as: a rung of the commitment ladder (js/layers.js) in the filter, the chips, the reset and the link', () => {
  const a = src('js/app.js');
  assert.match(a, /lyr: null,/);
  assert.match(a, /state\.filtered = base\.filter\(p => state\.phases\.has\(p\.phase\) && \(!state\.lyr \|\| state\.lyr\.has\(rungOf\(p\)\)\)\);/);
  assert.match(src('js/render-list.js'), /function renderLayerChips\(base\)/);
  assert.match(src('js/filter-ui.js'), /ss: null, lyr: null,/);
  const sh = src('js/share.js');
  assert.match(sh, /set\('ly', \[\.\.\.App\(\)\.state\.lyr\]\.join\(','\)\)/);
  assert.match(sh, /App\(\)\.state\.lyr = ly\.length \? new Set\(ly\) : null;/);
});

test('Watch: real changes; backfill (newly listed, already completed) counted and filed under Data › Sources', () => {
  const a = src('js/app.js');
  assert.match(a, /const real = c\.added\.filter\(a => a\.phase !== 'completed'\), backfill = c\.added\.filter\(a => a\.phase === 'completed'\);/);
  assert.match(a, /\.\.\.real\.map\(a =>/);
  assert.match(HTML, /<p class="small muted" id="backfill-note" hidden><\/p>/);
});

test('the old Data tab, in Records: the duplicate check under Data checks, the sources (and Advanced) under Sources', () => {
  const rec = HTML.slice(HTML.indexOf('id="pane-records"'));
  assert.ok(rec.indexOf('id="rec-data-sources"') >= 0 && rec.indexOf('id="sources-panel"') > rec.indexOf('id="rec-data-sources"'));
  assert.ok(rec.indexOf('id="audit-panel"') > rec.indexOf('id="rec-data-checks"'), 'the duplicate check under Data checks');
  const adv = rec.slice(rec.indexOf('<details class="panel advanced">'));
  assert.ok(adv.includes('<ul class="source-list" id="source-list"></ul>'), 'sources behind Advanced');
});

test('bottom bar: timeline only, data date · version · change log at the right; no scenario line', () => {
  assert.match(HTML, /<span class="tb-meta small muted" id="tb-meta"><\/span>/);
  assert.match(src('js/app.js'), /el\.innerHTML = `Data \$\{esc\(state\.snapshot && state\.snapshot\.generatedAt/);
  assert.match(src('css/app.css'), /\.footer > \.scen-bar \{ display: none; \}/);
});

test('map: legend names the marker unit and offers Colour sites by Stage | Counted as; In view in the Layers header', () => {
  const m = src('js/map-analysis.js');
  assert.match(m, /Colour sites by<\/span> \$\{b\('phase', 'Stage'\)\}\$\{b\('layer', 'Counted as'\)\}/);
  assert.match(m, /a cluster’s number is its people \+ jobs/);
  assert.match(src('js/render-list.js'), /el\.textContent = `In view \$\{fmtNum\(n\)\} of \$\{fmtNum\(of\)\}`;/);
  assert.match(src('js/map-markers.js'), /<span>Layers<\/span><span class="mo-inview" id="mo-inview" role="button"/, 'in the Layers header (design bundle 4)');
});
