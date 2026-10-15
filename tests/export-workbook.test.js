'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const WB = require('../js/export-workbook.js');
const P = require('../js/provenance.js');

test('sheet list and order match the workbook contract', () => {
  assert.deepEqual(WB.SHEET_NAMES,
    ['Summary', 'Developments', 'By plan', 'Records', 'Water', 'Wastewater', 'DC', 'Criteria', 'Sources']);
});

test('summaryRows: title first, then one meta line per row', () => {
  const rows = WB.summaryRows({
    title: 'Peel Growth Pipeline – workbook',
    prepared: 'Prepared Oct 14, 2026 with the Peel Growth Pipeline (unofficial)',
    filters: 'Mississauga, 10+ units',
    scenario: 'Design flows · max day design · Peel criteria',
    dataDates: 'applications and permits 2026-10-12 · 2021 Census · Region of Peel 2025 annual reports',
    version: '1.111',
    disclaimer: 'Unofficial prototype · public data only · not a Region of Peel product',
  });
  assert.equal(rows[0][0], 'Peel Growth Pipeline – workbook');
  const text = rows.map(r => r[0]).join('\n');
  assert.match(text, /Filters: Mississauga, 10\+ units/);
  assert.match(text, /Scenario: Design flows/);
  assert.match(text, /Data: applications and permits 2026-10-12 · 2021 Census · Region of Peel 2025 annual reports/);
  assert.match(text, /Version: 1\.111/);
  assert.match(text, /Unofficial prototype · public data only · not a Region of Peel product/);
  // Every row is a single column, like the old exportXLSX Summary.
  for (const r of rows) assert.equal(r.length, 1);
});

test('summaryRows: skips empty metadata, keeps the disclaimer', () => {
  const rows = WB.summaryRows({ title: 'T', filters: '', scenario: null, dataDates: '', version: 'dev' });
  const text = rows.map(r => r[0]).join('\n');
  assert.doesNotMatch(text, /Filters:/);
  assert.doesNotMatch(text, /Scenario:/);
  assert.match(text, /Unofficial prototype/);
  assert.match(text, /Version: dev/);
});

test('developmentsSheetRows: header from row keys, values in order', () => {
  const { cols, rows } = WB.developmentsSheetRows([
    { address: '1 Main St', units: 100, phase: 'Approved' },
    { address: '2 Main St', units: 50, phase: 'Review' },
  ]);
  assert.deepEqual(cols, ['address', 'units', 'phase']);
  assert.deepEqual(rows, [['1 Main St', 100, 'Approved'], ['2 Main St', 50, 'Review']]);
});

test('developmentsSheetRows: empty list yields empty columns (no crash)', () => {
  assert.deepEqual(WB.developmentsSheetRows([]), { cols: [], rows: [] });
});

// A constraint in the shape allNeeds() returns (js/app.js ~8931).
const con = (extra = {}) => ({
  status: 'gap', sys: 'ww', kind: 'pipe', name: 'Trunk A', sub: 'd=900mm', n: 3,
  cap: 120.5, unit: 'L/s', util: { today: 0.95, com: 1.02, bo: 1.2 },
  room: 10.4, people: 5000, out: 2031, outAfter: null,
  relief: [{ text: 'DC 25-2269 trunk', y: 2029 }, { text: 'phase 2', y: null }],
  ...extra,
});

test('dcTimingRows: column headers match the old exportDcTiming sheet', () => {
  const { cols, rows } = WB.dcTimingRows([], { ppu: 2.5, hzEnd: 2051 });
  assert.deepEqual(cols, ['Status', 'System', 'Type', 'Existing capacity', 'Detail',
    'Pipes in group', 'Capacity (plants: rated)', 'Unit', 'Today % of capacity',
    'Committed % of capacity', 'Build-out % of capacity', 'Room after approved',
    'Room (people)', 'Room (units at 2.5)', 'Runs out', 'Runs out again with expansions',
    'DC relief', 'DC relief construction year']);
  assert.deepEqual(rows, []);
});

test('dcTimingRows: row values, labels and capacity math', () => {
  const { rows } = WB.dcTimingRows([con()], { filter: 'all:all', ppu: 2.5, hzEnd: 2051, plantTrigger: 0.9 });
  assert.equal(rows.length, 1);
  const r = rows[0];
  assert.equal(r[0], 'Screens late: runs out before the DC project');   // status label
  assert.equal(r[1], 'Wastewater');                      // sys label (sys !== 'water')
  assert.equal(r[2], 'Sewer');                           // kind label
  assert.equal(r[3], 'Trunk A');
  assert.equal(r[5], 3);                                 // pipes in group
  assert.equal(r[6], 120.5);                             // non-plant capacity, unadjusted
  assert.equal(r[8], 95);                                // today % (0.95 * 100)
  assert.equal(r[9], 102);
  assert.equal(r[11], 10.4);                             // room after approved
  assert.equal(r[12], 5000);                             // room (people)
  assert.equal(r[13], 2000);                             // room units at ppu 2.5
  assert.equal(r[14], 2031);                             // runs out
  assert.equal(r[15], '');                               // runs out again: none
  assert.equal(r[16], 'DC 25-2269 trunk; phase 2');
  assert.equal(r[17], 2029);                             // earliest relief year (null skipped)
});

test('dcTimingRows: plant capacity divided by the trigger, % of trigger', () => {
  const { rows } = WB.dcTimingRows(
    [con({ kind: 'plant', cap: 448, util: { today: 0.8, com: 0.85, bo: 0.95 } })],
    { filter: 'all:all', ppu: 2.5, hzEnd: 2051, plantTrigger: 0.9 });
  const r = rows[0];
  assert.equal(r[2], 'Treatment plant');
  assert.equal(r[6], Math.round(448 / 0.9 * 10) / 10);   // rated capacity
  assert.equal(r[8], Math.round(0.8 * 0.9 * 100));        // % of the 90% trigger
});

test('dcTimingRows: dcnFilter split filters by status and system', () => {
  const list = [
    con({ status: 'gap', sys: 'ww' }),
    con({ status: 'ok', sys: 'ww' }),
    con({ status: 'gap', sys: 'water' }),
  ];
  const opts = { ppu: 2.5, hzEnd: 2051 };
  assert.equal(WB.dcTimingRows(list, { ...opts, filter: 'gap:all' }).rows.length, 2);
  assert.equal(WB.dcTimingRows(list, { ...opts, filter: 'all:ww' }).rows.length, 2);
  assert.equal(WB.dcTimingRows(list, { ...opts, filter: 'gap:water' }).rows.length, 1);
  assert.equal(WB.dcTimingRows(list, { ...opts, filter: 'all:all' }).rows.length, 3);
});

test('dcTimingRows: no room / no out year edge cases', () => {
  const { rows } = WB.dcTimingRows(
    [con({ room: 0, people: 0, out: 'today', outAfter: 'today', relief: [] })],
    { filter: 'all:all', ppu: 2.5, hzEnd: 2051 });
  const r = rows[0];
  assert.equal(r[12], '');        // room (people) blank when room <= 0
  assert.equal(r[13], '');        // room units blank when room <= 0
  assert.equal(r[14], 'already'); // out today
  assert.equal(r[15], 'already');
  assert.equal(r[16], '');
  assert.equal(r[17], '');
  const r2 = WB.dcTimingRows([con({ out: null })], { filter: 'all:all', ppu: 2.5, hzEnd: 2051 }).rows[0];
  assert.equal(r2[14], 'after 2051');
});

test('sourceRows: columns and portal/URL/retrieved values', () => {
  const { cols, rows } = WB.sourceRows(
    [{ name: 'Mississauga – development applications (latest monthly)', url: 'https://data.mississauga.ca/x' }],
    { generatedAt: '2026-10-12T10:34:39.519Z', portalFor: P.portalFor });
  assert.deepEqual(cols, ['Source', 'Portal', 'URL', 'Retrieved']);
  assert.deepEqual(rows, [[
    'Mississauga – development applications (latest monthly)',
    'City of Mississauga Open Data',
    'https://data.mississauga.ca/x',
    '2026-10-12',
  ]]);
});

test('sourceRows: per-source retrievedAt beats the snapshot date', () => {
  const { rows } = WB.sourceRows(
    [{ name: 'X', url: 'https://x', retrievedAt: '2026-10-13T08:00:00Z' }],
    { generatedAt: '2026-10-12T10:34:39.519Z', portalFor: P.portalFor });
  assert.equal(rows[0][3], '2026-10-13');
});
