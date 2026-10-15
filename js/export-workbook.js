/*
 * Excel workbook builders (Phase 5: Exports — one workbook for the current
 * scope + filters).
 *
 * Pure functions, no DOM access, no dependencies: safe to require under
 * `node --test` and to load in the browser as a plain <script>
 * (exposes window.PeelExportWorkbook).
 *
 * js/app.js `exportWorkbook()` gathers live state (filters, scenario,
 * snapshot dates) and the DOM tables (water / wastewater tab bodies), calls
 * these builders for the Summary / Developments / DC / Sources sheets, and
 * writes the .xlsx via the SheetJS loader it already uses.
 *
 * Grounding:
 * - Sheet order is the workbook contract: Summary, Developments, Records,
 *   Water, Wastewater, DC, Criteria, Sources.
 * - dcTimingRows() ports the row-building logic of js/app.js
 *   `exportDcTiming()` (~line 10502): the same status/kind labels, the same
 *   filter split on dcnFilter ('status:system'), the same capacity math
 *   (pctRated at line 4695: util * PLANT_TRIGGER(0.9) * 100 for plants, *
 *   100 otherwise), the same 'Room (units at ppu)' header interpolation.
 * - summaryRows() keeps the Summary style exportXLSX() used: title row, then
 *   one meta line per row.
 */
(function (root) {
'use strict';

// The workbook contract: exactly these sheets, in this order.
var SHEET_NAMES = ['Summary', 'Developments', 'By plan', 'Records', 'Water', 'Wastewater', 'DC', 'Criteria', 'Sources'];

var DC_STATUS_LABEL = { gap: 'Screens late: runs out before the DC project', planned: 'DC project in time', check: 'Check the data', ok: 'Room to build-out' };
var DC_KIND_LABEL = { pipe: 'Sewer', ps: 'Pumping station', plant: 'Treatment plant', wplant: 'Water treatment', storage: 'Storage', supply: 'Supply mains (rough)' };
// Column 13 interpolates the apartment persons-per-unit; built by dcCols().
var DC_COLS_BASE = ['Status', 'System', 'Type', 'Existing capacity', 'Detail', 'Pipes in group', 'Capacity (plants: rated)', 'Unit', 'Today % of capacity', 'Committed % of capacity', 'Build-out % of capacity', 'Room after approved', 'Room (people)', null, 'Runs out', 'Runs out again with expansions', 'DC relief', 'DC relief construction year'];

var SOURCE_COLS = ['Source', 'Portal', 'URL', 'Retrieved'];

function dateOnly(v) {
  if (v == null) return '';
  var s = v instanceof Date && !isNaN(v) ? v.toISOString() : String(v);
  var m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m ? m[1] : '';
}

function dcCols(ppu) {
  var cols = DC_COLS_BASE.slice();
  cols[13] = 'Room (units at ' + ppu + ')';
  return cols;
}

/**
 * Summary sheet rows: title row, then one meta line per row (the style
 * exportXLSX() used). app.js gathers the live values; this builder only
 * formats them, so tests can assert every required metadata line is present.
 * @param {object} meta { title, prepared, filters, scenario, dataDates, version, disclaimer }
 *   every value is a string; falsy values (except the disclaimer) are skipped
 * @returns {Array<Array>} rows for XLSX.utils.aoa_to_sheet
 */
function summaryRows(meta) {
  meta = meta || {};
  var lines = [
    meta.prepared,
    meta.filters != null && meta.filters !== '' ? 'Filters: ' + meta.filters : null,
    meta.scenario != null && meta.scenario !== '' ? 'Scenario: ' + meta.scenario : null,
    meta.dataDates != null && meta.dataDates !== '' ? 'Data: ' + meta.dataDates : null,
    meta.version != null && meta.version !== '' ? 'Version: ' + meta.version : null,
    meta.disclaimer || 'Unofficial prototype · public data only · not a Region of Peel product',
    meta.screening || null,
    meta.criteria || null,
  ].filter(function (l) { return l != null && l !== ''; });
  return [[meta.title || 'Peel Growth Pipeline – workbook']]
    .concat(lines.map(function (l) { return [l]; }));
}

/**
 * Developments sheet from exportRows() objects: header from the first row's
 * keys, then one row per development. app.js calls exportRows() with its
 * default (state.filtered), which is what makes the totals match the screen.
 * @param {Array<object>} rows the exportRows() output (may be empty)
 * @returns {{cols: Array<string>, rows: Array<Array>}}
 */
function developmentsSheetRows(rows) {
  rows = rows || [];
  var cols = rows.length ? Object.keys(rows[0]) : [];
  return { cols: cols, rows: rows.map(function (r) { return cols.map(function (c) { return r[c]; }); }) };
}

/**
 * DC timing rows: the row-building logic of js/app.js exportDcTiming().
 * @param {Array<object>} constraints allNeeds() output: { status, sys, kind,
 *   name, sub, n, cap, unit, util:{today,com,bo}, room, people, out, outAfter,
 *   relief:[{text, y}] }
 * @param {object} opts { filter: dcnFilter ('status:system', default 'all:all'),
 *   ppu: apartment persons per unit, hzEnd: horizon end year for 'runs out',
 *   plantTrigger: default 0.9 (js/app.js PLANT_TRIGGER) }
 * @returns {{cols: Array<string>, rows: Array<Array>}}
 */
function dcTimingRows(constraints, opts) {
  opts = opts || {};
  var ppu = opts.ppu || 2.5;
  var plantTrigger = opts.plantTrigger == null ? 0.9 : opts.plantTrigger;
  var hzEnd = opts.hzEnd;
  var f = String(opts.filter == null ? 'all:all' : opts.filter).split(':');
  var stF = f[0] || 'all', sysF = f[1] || 'all';
  var cols = dcCols(ppu);
  var rows = [];
  (constraints || []).forEach(function (c) {
    if (!c) return;
    if (stF !== 'all' && c.status !== stF) return;
    if (sysF !== 'all' && c.sys !== sysF) return;
    var plantish = c.kind === 'plant' || c.kind === 'wplant';
    var pct = function (k) { return Math.round((c.util && c.util[k] || 0) * (plantish ? plantTrigger : 1) * 100); };
    var relief = c.relief || [];
    var reliefYears = relief.map(function (r) { return r.y; }).filter(Boolean);
    rows.push([
      DC_STATUS_LABEL[c.status] || c.status,
      c.sys === 'water' ? 'Water' : 'Wastewater',
      DC_KIND_LABEL[c.kind] || c.kind,
      c.name, c.sub, c.n || 1,
      Math.round((plantish ? c.cap / plantTrigger : c.cap) * 10) / 10,
      c.unit, pct('today'), pct('com'), pct('bo'),
      c.room == null ? '' : Math.round(c.room * 10) / 10,
      c.room == null || c.room <= 0 ? '' : Math.round(c.people),
      c.room == null || c.room <= 0 ? '' : Math.round(c.people / ppu),
      c.out === 'today' ? 'already' : c.out == null ? 'after ' + hzEnd : c.out,
      c.outAfter == null ? '' : c.outAfter === 'today' ? 'already' : c.outAfter,
      relief.map(function (r) { return r.text; }).join('; '),
      reliefYears.length ? Math.min.apply(null, reliefYears) : '',
    ]);
  });
  return { cols: cols, rows: rows };
}

/**
 * Sources sheet: one row per data source on state.sources.
 * @param {Array<object>} sources { name, url, retrievedAt? }
 * @param {object} opts { generatedAt: snapshot generatedAt (fallback for
 *   Retrieved), portalFor: portal-name function (js/provenance.js portalFor) }
 * @returns {{cols: Array<string>, rows: Array<Array>}}
 */
function sourceRows(sources, opts) {
  opts = opts || {};
  var portalFor = typeof opts.portalFor === 'function' ? opts.portalFor : function (n) { return n; };
  var fallback = opts.generatedAt ? dateOnly(opts.generatedAt) : '';
  var rows = (sources || []).map(function (s) {
    return [s.name || '', portalFor(s.name) || '', s.url || '',
      s.retrievedAt ? dateOnly(s.retrievedAt) : fallback];
  });
  return { cols: SOURCE_COLS.slice(), rows: rows };
}

var api = {
  SHEET_NAMES: SHEET_NAMES,
  summaryRows: summaryRows,
  developmentsSheetRows: developmentsSheetRows,
  dcTimingRows: dcTimingRows,
  sourceRows: sourceRows,
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelExportWorkbook = api;
})(typeof window !== 'undefined' ? window : globalThis);
