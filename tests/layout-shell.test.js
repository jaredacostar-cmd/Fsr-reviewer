'use strict';
/* Layout-shell tests (Phase 2): the map-box consolidation, tool rail, tab↔view
 * linking and the Developments sub-view.
 *
 * js/app.js is a browser IIFE, so these tests read it as source: structural
 * assertions (what exists / what is gone) plus real unit tests of the pure
 * logic extracted from it (TAB_VIEW, pageOf).
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
const CSS = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');

// Extract a `const NAME = <value>;` literal from app.js source and evaluate it
// (the value is a plain object/array literal from our own source).
function extractConst(name) {
  const m = new RegExp(`const ${name} = (\\{[\\s\\S]*?\\}|\\[[\\s\\S]*?\\]);`).exec(APP);
  assert.ok(m, `const ${name} not found in js/`);
  return new Function(`return (${m[1]});`)();
}
// Extract a `const name = <arrow function>` and evaluate it standalone (pure only).
function extractFn(name) {
  const m = new RegExp(`const ${name} = (\\([\\s\\S]*?\\n  \\});`).exec(APP);
  assert.ok(m, `const ${name} not found in js/`);
  return new Function(`return (${m[1]});`)();
}

test('map boxes: area, more-settings and legend controls are gone', () => {
  for (const gone of ['new Legend(', 'new MoreBox(', 'new AreaBox(', 'legend.getContainer(',
    "create('div', 'map-legend')", "create('div', 'more-box')", "create('details', 'area-box')"]) {
    assert.ok(!APP.includes(gone), `still present: ${gone}`);
  }
  // CSS: no box rules remain for the removed boxes.
  for (const gone of ['.area-box', '.more-box', '.map-legend']) {
    assert.ok(!new RegExp(`\\${gone}(?![\\w-])`).test(CSS), `CSS still has ${gone}`);
  }
  // ...except the info-key style references that were renamed, not deleted:
  assert.ok(!CSS.includes('.map-legend'), 'no .map-legend rule left at all');
});

test('legend renders inline in the Layers panel (#mo-legend)', () => {
  assert.ok(APP.includes('id="mo-legend"'), 'panel markup lacks #mo-legend');
  assert.ok(APP.includes("document.getElementById('mo-legend')"), 'renderLegend does not target #mo-legend');
  assert.ok(APP.includes('.mo-legend details'), 'legend open state not wired on the panel details');
  assert.ok(CSS.includes('.mo-legend'), 'CSS has no .mo-legend section styles');
  assert.ok(!APP.includes('WwLoads().addTo(map); const legend'), 'legend control block not removed');
});

test('tool rail: one toggle button per tool, no dropdown', () => {
  for (const gone of ['ToolsControl', '.tools-btn', '.tools-menu', '.tools-ctl']) {
    assert.ok(!APP.includes(gone) && !CSS.includes(gone), `still present: ${gone}`);
  }
  assert.ok(APP.includes('tool-rail'), 'no .tool-rail control');
  assert.ok(APP.includes("options: { position: 'topleft' }"), 'rail not topleft');
  // Rail is added after the north arrow, so it renders below zoom + north.
  assert.ok(APP.indexOf('new ToolRail().addTo(map);') > APP.indexOf('new NorthControl().addTo(map);'),
    'rail not added after the north control');
  assert.ok(APP.includes("document.querySelectorAll('.tool-rail [data-tool]')"), 'syncToolsBtn does not target the rail');
  const items = extractConst('TOOL_ITEMS');
  assert.deepEqual(items.map(i => i[0]), ['select', 'measure', 'trace', 'whatif', 'inspect', 'corridor', 'unitsfit', 'timebox']);
  // Rail renders one button per tool with the same data-tool values.
  assert.ok(/TOOL_ITEMS\.map\(\(\[k, t, d, ic\]\) => `<button[^>]*data-tool="\$\{k\}"/.test(APP),
    'rail does not render a button per TOOL_ITEMS entry');
});

test('tab -> view mapping: only water/ww/dca/overview switch the map view', () => {
  const TAB_VIEW = extractConst('TAB_VIEW');
  assert.deepEqual(TAB_VIEW, { water: 'water', ww: 'wastewater', dca: 'dc', overview: 'planning' });
  for (const t of ['growth', 'criteria', 'log', 'census', 'developments']) {
    assert.ok(!(t in TAB_VIEW), `tab ${t} must not change the map view`);
  }
  // Guard flag against view-switch re-entry exists.
  assert.ok(APP.includes('tabViewLink'), 'missing tabViewLink guard');
  // Wired against the Phase 2 analysis column (the footer tab bar was removed in the merge).
  assert.ok(APP.includes("wireTabView(document.querySelector('.analysis-tabs'))"), 'not wired to .analysis-tabs');
});

test('the In view list stays in the left panel (SPEC §4–5): no Developments tab; its pager is added once', () => {
  assert.ok(APP.includes('function ensureDevelopmentsTab()'), 'ensureDevelopmentsTab missing');
  const fn = APP.slice(APP.indexOf('function ensureDevelopmentsTab()'), APP.indexOf('function focusProject'));
  assert.ok(fn.includes("if (document.getElementById('dev-pages')) return;"), 'guarded');
  assert.ok(fn.includes("document.querySelector('.list-panel')"), 'pager in the left list panel');
  assert.ok(!fn.includes('ftab-developments') && !fn.includes("dataset.pane = 'developments'"), 'no Developments tab or pane');
  assert.ok(APP.includes("$('#list-count')"), 'renderList must still update #list-count');
});

test('pageOf: 25-per-page pagination clamps and slices', () => {
  const pageOf = extractFn('pageOf');
  const items = Array.from({ length: 60 }, (_, i) => i);
  let pg = pageOf(items, 0, 25);
  assert.deepEqual([pg.page, pg.pages, pg.start], [0, 3, 0]);
  assert.equal(pg.items.length, 25);
  assert.equal(pg.items[0], 0);
  pg = pageOf(items, 2, 25);
  assert.deepEqual([pg.page, pg.items.length, pg.start], [2, 10, 50]);
  // Clamps out-of-range pages.
  assert.equal(pageOf(items, 9, 25).page, 2);
  assert.equal(pageOf(items, -3, 25).page, 0);
  // Empty and short lists: one page, no items.
  pg = pageOf([], 0, 25);
  assert.deepEqual([pg.pages, pg.items.length], [1, 0]);
  assert.equal(pageOf(items.slice(0, 25), 0, 25).pages, 1);
});

test('renderList paginates and resets on filter/sort/pan changes', () => {
  assert.ok(APP.includes('const LIST_PAGE = 25;'), 'LIST_PAGE missing');
  assert.ok(APP.includes('pageOf(sorted, listPage, LIST_PAGE)'), 'renderList does not paginate');
  assert.ok(APP.includes('data-i="${pg.start + i}"'), 'row indexes must stay global for focusProject');
  assert.ok(!APP.includes('LIST_LIMIT'), 'LIST_LIMIT should be gone');
  for (const id of ['dev-prev', 'dev-next', 'dev-page-ind']) {
    assert.ok(APP.includes(id), `pagination control missing: ${id}`);
  }
  assert.ok(APP.includes("listPage = 0; renderList();"), 'page reset missing');
});

test('layoutMapBoxes simplified; fitLegend is a no-op-safe hook', () => {
  const body = APP.slice(APP.indexOf('function layoutMapBoxes()'), APP.indexOf("map.on('resize', fitLegend);"));
  for (const gone of ['.area-box', '.more-box', 'legend.getContainer', 'lg-squeezed', 'ab.style', 'more.style']) {
    assert.ok(!body.includes(gone), `layoutMapBoxes still references ${gone}`);
  }
  assert.ok(APP.includes('const fitLegend = () => requestAnimationFrame('), 'fitLegend not a rAF hook');
  assert.ok(/const fitLegend = \(\) => requestAnimationFrame\(\(\) => \{ try \{/.test(APP), 'fitLegend not no-op-safe');
});

test('tour no longer points at removed boxes', () => {
  const tour = APP.slice(APP.indexOf('const TOUR = ['), APP.indexOf('const HELP = ['));
  for (const gone of ['.more-box', '.area-box', '.tools-btn']) {
    assert.ok(!tour.includes(gone), `tour still points at ${gone}`);
  }
  assert.ok(tour.includes('.tool-rail'), 'tour missing tool rail step');
  assert.ok(tour.includes('#filter-panel'), 'tour missing filter-panel step');
  assert.ok(tour.includes("$('#analysis')"), 'tour analysis step missing #analysis');
});
