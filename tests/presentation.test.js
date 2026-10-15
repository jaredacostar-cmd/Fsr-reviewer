'use strict';
// Presentation mode (design audit, Group 9).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('presents the open scope: no longer closes the development', () => {
  const as = src('js/area-select.js');
  const enter = as.match(/function enterPresentation\(\) \{[\s\S]*?\n  \}/)[0];
  assert.doesNotMatch(enter, /closeDetail/);
  assert.match(as, /document\.querySelector\('#ov-body \.ov-top \.headline'\)/, 'headline from the current Overview (any scope)');
  assert.match(as, /if \(!presRendering && OT && OT\.renderOverview\)/, 'no render loop with the Overview');
});

test('screening note and data date in presentation', () => {
  const U = require('../js/util.js');
  assert.equal(U.SCREEN_LINE, 'General screening results only. Peel’s W&WW Infrastructure Planning team must validate or confirm all results.');
  assert.match(src('index.html'), /<p class="pres-note" id="pres-note" role="note"><\/p>/);
  assert.match(src('js/area-select.js'), /\$\('#pres-note'\)\.textContent = `\$\{U\.SCREEN_LINE\} · Data \$\{snap && snap\.generatedAt/);
});

test('only Exit is a control; tiles ≥40 px and headline ≥28 px', () => {
  const css = src('css/modes.css');
  for (const sel of ['.topbar', '.analysis', '.tool-rail', '.map-bottom', '.toggle-sidebar']) assert.ok(css.includes(`html[data-presentation] ${sel}`), sel);
  assert.match(css, /html\[data-presentation\] \.pres-tiles \.ov-tile b \{ font-size: 2\.75rem;/, '44 px');
  assert.match(css, /html\[data-presentation\] \.pres-hl \{ font-size: 1\.9rem;/, '30 px');
});

test('light theme by default for projectors, restored on exit; a setting keeps the app theme', () => {
  const as = src('js/area-select.js');
  assert.match(as, /store\.get\('presentTheme', 'light'\) === 'light'/);
  assert.match(as, /if \(presTheme\) \{ PD\.applyTheme\(presTheme\); presTheme = null; App\(\)\.refreshTheme\(\); \}/);
  assert.match(src('js/growth-ui.js'), /sel\('dsp-present'/);
  assert.match(src('js/settings.js'), /store\.set\('presentTheme', e\.target\.value === 'app' \? 'app' : 'light'\)/);
});
