'use strict';
// Stage 1 (fix-correctness): each finding from the 2026-10-15 audit has a test here that would
// have caught it (items 1, 2 and 11 are in tests/no-template-leak.test.js and tests/site-scope.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const U = require('../js/util.js');

// ---- 3. Small systems ---------------------------------------------------------------------------
test('3. small systems: Inglewood (0.243 ML/d) reads 243 m³/d; large plants stay in ML/d', () => {
  assert.equal(U.SMALL_SYSTEM_MLD, 5);
  assert.ok(U.isSmallSystem(0.243));
  assert.ok(!U.isSmallSystem(518) && !U.isSmallSystem(350) && !U.isSmallSystem(0));
  assert.equal(U.capTxt(0.243, 0.243), '243 m³/d');
  assert.equal(U.capTxt(0.1, 0.243), '100 m³/d', 'flows at a small system are in m³/d too');
  assert.equal(U.capTxt(518, 518), '518 ML/d');
  assert.match(U.uCap(0.243, 0.243), /^243<span class="u">m³\/d<\/span>$/);
});

test('3. small systems sit in their own group and never set a shared chart scale', () => {
  const sp = src('js/svc-plants.js');
  assert.match(sp, /const main = rows\.filter\(r => !isSmallSystem\(r\.rated\)\), small = rows\.filter\(r => isSmallSystem\(r\.rated\)\);/);
  assert.match(sp, /const S0 = scaleOf\(main\.length \? main : rows\), S1 = scaleOf\(small\);/, 'the shared axis is computed from the large plants only');
  assert.match(sp, /Small systems <span class="muted small">own scale · capacity in m³\/d<\/span>/);
  assert.doesNotMatch(sp, /rated \$\{fmtNum\(r\.rated\)\} ML\/d/, 'tiles say m³/d for a small system');
  assert.match(src('js/overview-tab.js'), /<h4 class="ov-small-h">Small systems<\/h4>/);
  assert.match(src('js/timing.js'), /Small systems <small>capacity in m³\/d<\/small>/);
  for (const f of ['js/masterplan.js', 'js/svc-scope.js', 'js/tool-scope.js']) assert.match(src(f), /capTxt\(/, `${f} prints rated capacity through capTxt`);
});
