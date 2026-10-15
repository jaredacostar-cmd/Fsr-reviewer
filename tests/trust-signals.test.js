'use strict';
// Trust signals (design audit, Group 10): one screening note in the user's wording, a disclaimer on
// every export, the criteria stamp, and provenance on every exported row.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const U = require('../js/util.js');
const NOTE = 'General screening results only. Peel’s W&WW Infrastructure Planning team must validate or confirm all results.';

test('the screening note is the user’s wording, in every form', () => {
  assert.equal(U.SCREEN_LINE, NOTE);
  for (const html of [U.SCREEN_NOTE, U.SCREEN_NOTE_SHORT]) {
    assert.match(html, /<strong>General screening results only\.<\/strong> Peel’s W&amp;WW Infrastructure Planning team must validate or confirm all results\./);
    assert.doesNotMatch(html, /Screening estimate, not a model result/);
  }
  assert.match(U.SCREEN_NOTE, /Modelling Demand Table v2\.0 \(Aug 2024\) and Linear Wastewater Standards R1\.0 \(Mar 2023\)/, 'criteria stamp');
});

test('one note at the top of the analysis panel covers every tab and tool result', () => {
  assert.match(src('index.html'), /<div class="analysis-panes" id="analysis-panes">\n      <div id="screen-note-top"><\/div>/);
  assert.match(src('js/app.js'), /window\.PeelUtil\.SCREEN_NOTE\.replace\('<p class="screen-note"', '<p class="screen-note" id="screen-note-top"'\)/);
  assert.match(src('css/app.css'), /\.screen-note \+ \.screen-note, \.screen-note ~ \* \.screen-note \{ display: none; \}/, 'the panes’ own copies are hidden');
});

test('every CSV, GeoJSON and model file carries the disclaimer, the note and the criteria', () => {
  assert.equal(U.CSV_DISCLAIMER.split('\n').filter(Boolean).length, 3);
  assert.ok(U.CSV_DISCLAIMER.includes(NOTE) && U.CSV_DISCLAIMER.includes(U.CRITERIA_STAMP) && U.CSV_DISCLAIMER.includes(U.UNOFFICIAL));
  assert.deepEqual(Object.keys(U.DISCLAIMER_PROPS), ['disclaimer', 'screening', 'criteria']);
  const ex = src('js/exports.js');
  assert.match(ex, /download\('peel-developments\.csv', CSV_DISCLAIMER \+/);
  assert.equal((ex.match(/\.\.\.DISCLAIMER_PROPS/g) || []).length, 2, 'developments and servicing-area GeoJSON');
  assert.match(src('js/dc-infra.js'), /properties: \{ \.\.\.window\.PeelUtil\.DISCLAIMER_PROPS/);
  assert.match(src('js/demand-ui.js'), /\.csv`, root\.PeelUtil\.CSV_DISCLAIMER \+ lines/);
  assert.match(src('js/tools-corridor.js'), /window\.PeelUtil\.CSV_DISCLAIMER\) \|\| ''\) \+ rows/);
  assert.match(src('js/tools-batch.js'), /new Blob\(\[disc \+ lines\.join/);
  assert.match(src('js/sewer-cap.js'), /CSV_DISCLAIMER\.replace\(\/\^# \/gm, ';; '\) \+ swmmInp\(\)/);
  assert.match(src('js/masterplan.js'), /CSV_DISCLAIMER\.replace\(\/\^# \/gm, '; '\) \+ HYD\.inp/);
  assert.match(ex, /disclaimer: UNOFFICIAL, screening: SCREEN_LINE, criteria: CRITERIA_STAMP,/, 'workbook summary');
  assert.match(src('js/export-workbook.js'), /meta\.screening \|\| null,\n    meta\.criteria \|\| null,/);
});

test('reports open with the note and the criteria stamp', () => {
  const r = src('js/reports.js');
  assert.equal((r.match(/root\.PeelUtil\.SCREEN_LINE\)\}<\/strong> \$\{esc\(root\.PeelUtil\.CRITERIA_STAMP\)\}/g) || []).length, 2, 'report footer (memo, area report, comparison) and the briefing');
});

test('provenance on every exported row: portal, record link and pulled-on, never blank', () => {
  const ex = src('js/exports.js');
  assert.match(ex, /\.\.\.provenanceFields\(p\),/);
  assert.match(ex, /source_portal: 'not recorded', source_record_url: 'not recorded', source_pulled_on: 'not recorded'/);
  assert.match(ex, /source_record_url: url \|\| 'not recorded', source_pulled_on: pulled \|\| 'not recorded'/);
});
