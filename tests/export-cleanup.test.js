'use strict';
/* Phase 5 (Worker B): export centralization cleanup checks.
 *
 * Static/source-level: the scattered per-panel export buttons are gone and
 * every removed output stays reachable from the top-bar Export menu
 * (renderExportMenu in js/app.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const APP = fs.readFileSync(path.join(root, 'js', 'app.js'), 'utf8');
const HTML = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const CSS = fs.readFileSync(path.join(root, 'css', 'app.css'), 'utf8');

// The menu-building source, so assertions target the menu, not the whole app.
const menuSrc = APP.slice(APP.indexOf('function renderExportMenu()'), APP.indexOf('function renderGearMenu()'));
assert.ok(menuSrc.length > 500, 'could not isolate renderExportMenu source');

test('exportBar is gone: no invocations and no const definition', () => {
  assert.ok(!APP.includes('exportBar('), 'exportBar( still referenced in js/app.js');
  assert.ok(!APP.includes('const exportBar'), 'exportBar const still defined');
  assert.ok(!HTML.includes('exportBar('), 'exportBar( still referenced in index.html');
});

test('dead PDF machinery is gone: exportPDF and cleanClone', () => {
  assert.ok(!APP.includes('function exportPDF'), 'exportPDF still defined');
  assert.ok(!APP.includes('exportPDF('), 'exportPDF( still called');
  assert.ok(!APP.includes('function cleanClone'), 'cleanClone still defined');
  assert.ok(!APP.includes('cleanClone('), 'cleanClone( still called');
  assert.ok(!APP.includes('data-export="pdf"'), 'a data-export="pdf" button remains');
  assert.ok(!HTML.includes('data-export="pdf"'), 'a data-export="pdf" button remains in index.html');
});

test('sidebar export row is gone from index.html and its wiring from app.js', () => {
  for (const id of ['btn-csv', 'btn-geojson', 'btn-areas-geojson', 'btn-dc-geojson', 'btn-print-map']) {
    assert.ok(!HTML.includes(id), `${id} still in index.html`);
    assert.ok(!APP.includes(id), `${id} still referenced in js/app.js`);
  }
  assert.ok(!HTML.includes('export-row'), 'export-row still in index.html');
});

test('DC timing Excel button and handler are gone; rows live in the workbook DC sheet', () => {
  assert.ok(!APP.includes('data-dct-xlsx'), 'data-dct-xlsx still referenced');
  assert.ok(!HTML.includes('data-dct-xlsx'), 'data-dct-xlsx still in index.html');
  const WB = fs.readFileSync(path.join(root, 'js', 'export-workbook.js'), 'utf8');
  assert.ok(WB.includes('dcTimingRows'), 'dcTimingRows missing from js/export-workbook.js');
  assert.ok(APP.includes('dcTimingRows('), 'workbook does not call dcTimingRows');
  assert.ok(!APP.includes('function exportDcTiming'), 'old standalone exportDcTiming should be gone');
});

test('document-level [data-export] delegation no longer routes PDF', () => {
  // The only remaining data-export user is the top-bar menu's Excel item
  // (Worker A owns that line); the delegation must not mention exportPDF.
  const hits = [...APP.matchAll(/data-export/g)].map(m => m.index);
  assert.ok(hits.length >= 1, 'expected at least the menu Excel item to use data-export');
  assert.ok(!APP.includes("dataset.export === 'pdf'"), 'delegation still routes data-export="pdf"');
});

test('menu carries the comparison PDF item, guarded on comparisonPDF', () => {
  assert.ok(menuSrc.includes('data-tbx="comparepdf"'), 'menu lacks the comparison PDF item');
  assert.ok(menuSrc.includes('typeof comparisonPDF'), 'menu does not guard on comparisonPDF');
  assert.ok(menuSrc.includes('disabled'), 'comparison item has no disabled state');
  assert.ok(menuSrc.includes('title='), 'comparison item has no title tooltip');
  assert.ok(APP.includes("comparepdf: () => { if (typeof comparisonPDF === 'function') comparisonPDF(); }"),
    'menu click handler does not route comparepdf to comparisonPDF()');
});

test('menu preserves the SWMM model download removed from exportBar', () => {
  assert.ok(menuSrc.includes('data-tbx="swmm"'), 'menu lacks the SWMM model item');
  assert.ok(menuSrc.includes('SWMM model (.inp)'), 'SWMM menu label missing');
  assert.ok(APP.includes('function exportSwmmModel()'), 'exportSwmmModel missing');
  assert.ok(APP.includes('swmm: exportSwmmModel'), 'menu click handler does not route swmm');
  assert.ok(!APP.includes('[data-swmm]'), 'dead data-swmm delegation remains');
});

test('every removed sidebar/menu output is still routed in the export menu', () => {
  // csv / geojson / areas / dc / print map -> the kept named functions.
  const routing = menuSrc.slice(menuSrc.indexOf('const fn ='));
  for (const [key, fn] of [['csv', 'exportDevsCSV'], ['geojson', 'exportDevsGeoJSON'],
      ['areas', 'exportAreasGeoJSON'], ['dc', 'exportDcGeoJSON'], ['print', 'printMap']]) {
    assert.ok(routing.includes(`${key}: ${fn}`), `menu does not route ${key} to ${fn}`);
    assert.ok(APP.includes(`function ${fn}(`), `${fn} must be kept`);
  }
});

test('shared export helpers are kept', () => {
  for (const name of ['reportMeta', 'criteriaTableHTML', 'UNOFFICIAL', 'exportXLSX']) {
    assert.ok(APP.includes(name), `${name} must be kept`);
  }
  // SCOPES stays: exportXLSX still reads SCOPES[scope].
  assert.ok(APP.includes('const SCOPES ='), 'SCOPES must be kept for exportXLSX');
});

test('Excel menu item still exists (Worker A owns the line; tolerate either form)', () => {
  assert.ok(/Excel/.test(menuSrc), 'no Excel item left in the export menu');
});

test('unrelated allocation CSV export-bar is untouched', () => {
  assert.ok(APP.includes('data-alloc-csv'), 'allocation CSV export was removed by accident');
  assert.ok(APP.includes('data-alloc-imp'), 'allocation CSV import was removed by accident');
  assert.ok(CSS.includes('.export-bar'), 'export-bar CSS removed while the allocation bar still uses it');
});
