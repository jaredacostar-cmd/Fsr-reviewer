'use strict';
// Tool consolidation and the top bar (design audit, Group 7).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('one home for tool results: traces and test sites open as a scope in the right panel', () => {
  const sp = src('js/sewer-profile.js');
  assert.match(sp, /Tools\(\)\.openResult\(\{ title, html, reopen \}\);/);
  assert.match(sp, /showResult\('trace', 'Sewer path',/);
  assert.match(sp, /showResult\('whatif', w\.name \|\| 'Test site',/);
  assert.match(sp, /showResult\('whatifs', 'Test sites',/);
  assert.doesNotMatch(sp, /\$\('#detail-body'\)\.dataset\.wf/, 'no state kept on the detail panel');
  assert.match(sp, /const wfBodies = \['#scope-body'\]/, 'the form works in the scope host');
  assert.doesNotMatch(sp, /#detail/, 'no #detail fallback');
});

test('Inspect point and Fit get the trace back, without opening a panel', () => {
  assert.match(src('js/sewer-profile.js'), /async function tracePoint\(ll, show = true\) \{[\s\S]*?if \(!show\) return ST\(\)\.traceDev\(pt\);[\s\S]*?return t;\n  \}/);
  assert.match(src('js/app.js'), /tracePoint: ll => window\.PeelSewerProfile\.tracePoint\(ll, false\)/);
});

test('a test site placed and closed without a change is cleared with its result', () => {
  const sp = src('js/sewer-profile.js');
  assert.match(sp, /include: false, municipality: muni, fresh: true \}/);
  assert.match(sp, /delete w\.fresh;/);
  assert.match(sp, /document\.addEventListener\('peel:tool-closed', \(\) => \{[\s\S]*?if \(w && w\.fresh && !w\.include\)/);
  assert.match(src('js/svc-scope.js'), /document\.dispatchEvent\(new CustomEvent\('peel:tool-closed'\)\)/);
});

test('top bar: Present ▾ holds Present and Time-lapse; saved views in Export; search moves up on wide screens', () => {
  const html = src('index.html');
  assert.match(html, /id="tb-present" aria-haspopup="menu"/);
  assert.match(html, /<div class="tb-menu" id="tb-present-menu" role="menu" hidden>\s*<button type="button" role="menuitem" id="tb-present-go"[^>]*>Present<\/button>\s*<button type="button" role="menuitem" id="tb-timelapse"/);
  assert.match(html, /<div class="tb-search" id="tb-search"><\/div>/);
  assert.match(html, /<div class="search-box" id="search-box">/);
  const tb = src('js/topbar.js');
  assert.match(tb, /data-tbx="saveview">Save this view…<\/button>/);
  assert.match(tb, /saveview: \(\) => MA\(\)\.saveCurrentView\(\)/);
  assert.match(tb, /matchMedia\('\(min-width: 1600px\)'\)/);
  assert.doesNotMatch(src('js/map-markers.js'), /id="opt-save"/, 'no Save button in the Layers card');
  assert.match(src('css/app.css'), /@media \(max-width: 700px\) \{\n  \.topbar \.tb-btn, \.topbar \.tb-step, \.topbar \.tb-views \.btn, \.topbar \.tb-scen \{ min-height: 44px; min-width: 44px; \}/);
});
