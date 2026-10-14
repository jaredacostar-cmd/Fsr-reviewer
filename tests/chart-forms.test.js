'use strict';
// Chart and table forms (design audit, Group 8).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const U = require('../js/util.js');

test('charts are drawn at the panel width, so their 11-unit labels render at 11 px', () => {
  assert.equal(typeof U.chartW, 'function');
  assert.equal(U.chartW(), 560, 'no document: the old default');
  assert.equal(U.chartW(600, 900), 600, 'clamped');
  const dc = src('js/dc-cost.js');
  assert.equal((dc.match(/W = chartW\(320, 760\)/g) || []).length, 4, 'every DC chart');
  assert.doesNotMatch(dc, /const W = 560/);
  assert.match(src('js/timing.js'), /const W = window\.PeelUtil\.chartW\(320, 900\)/);
  assert.match(src('js/svc-plants.js'), /const W = window\.PeelUtil\.chartW\(320, 900\), narrow = W < 560/);
  assert.match(src('css/app.css'), /#analysis-panes small, #detail small \{ font-size: max\(var\(--fs-1\), \.83em\); \}/);
  assert.match(src('css/app.css'), /--fs-1: 11px;/);
});

test('plant figures: one table under the bars, not prose per bar; the build-up table folds', () => {
  const sp = src('js/svc-plants.js');
  assert.doesNotMatch(sp, /class="cap-text small"/, 'no prose block per bar');
  assert.match(sp, /<table class="dt cap-t">/);
  assert.match(sp, /<details class="svc-more"><summary class="svc-sub">Plant inflow by growth layer/);
});

test('colour is never the only signal on the mini bars; a % bar has a 100% tick', () => {
  const du = src('js/demand-ui.js');
  assert.match(du, /\$\{neg \? ` · \$\{negWord\}` : ''\}/);
  assert.match(du, /negWord = unitTxt === '%' \? 'over' : 'short'/);
  assert.match(du, /unitTxt === '%' && max > 100 \?/);
});

test('completions per year stop at the data year (no "2017–2027")', () => {
  const g = src('js/growth-ui.js');
  assert.match(g, /const yrs = comp\.years\.filter\(y => y\.year <= nowY\)/);
  assert.doesNotMatch(g, /comp\.totalUnits \/ yrs\.length/);
});

test('long tables show 10 rows with See all (pumping stations)', () => {
  const sp = src('js/svc-plants.js');
  assert.match(sp, /\(psAll \? st : st\.slice\(0, 10\)\)/);
  assert.match(sp, /See all \$\{st\.length\} stations/);
});
