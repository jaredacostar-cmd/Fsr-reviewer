'use strict';
// Scope-aware tabs and duplicates removed (design audit, Group 6).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('Water / Wastewater / DC say "Peel-wide" below Peel scope, and link what the scope loads', () => {
  assert.match(src('index.html'), /<p class="scope-note small" id="scope-note" role="note" hidden><\/p>/);
  const ss = src('js/svc-scope.js');
  assert.match(ss, /const below = st\.muni \|\| st\.sp\.length \|\| st\.mtsa\.length \|\| st\.pz\.length \|\| st\.dr\.length \|\| st\.ss;/);
  // (one rule for both hosts, navigation phase 6: peelWideText words it, '' when there is nothing to say; the
  // map's #scope-note hides then, Home's Servicing and Capital tabs leave it out, js/ws-pages.js host)
  assert.match(ss, /if \(!below \|\| \(window\.DevScope && window\.DevScope\.current\(\)\) \|\| !PEEL_WIDE\[tab\]\) return '';/);
  assert.match(ss, /function peelWideNote\(\) \{\n[^\n]*\n {4}const html = peelWideText\(AT\(\) && AT\(\)\.getFootTab\(\)\);\n {4}el\.innerHTML = html; el\.hidden = !html;\n {2}\}/);
  assert.match(ss, /<strong>Peel-wide\.<\/strong> \$\{PEEL_WIDE\[tab\]\} serve all of Peel, so these tables are not filtered to/);
  assert.match(src('js/topbar.js'), /window\.PeelSvcScope\.peelWideNote\(\)/, 'refreshed with every filter change');
  assert.match(src('js/analysis-tabs.js'), /root\.PeelSvcScope\.peelWideNote\(\)/, 'and every tab change');
});

test('area-only Growth content is not shown at development scope', () => {
  const U = require('../js/util.js');
  assert.match(U.AREA_ONLY_NOTE, /describe an area, not one development/);
  for (const f of ['js/timing.js', 'js/census-view.js']) assert.match(src(f), /if \(window\.DevScope && window\.DevScope\.current\(\)\) \{ body\.innerHTML = window\.PeelUtil\.AREA_ONLY_NOTE; return; \}/, f);
});

test('duplicate controls removed: Layers-card view switch, map Present, Measure radius', () => {
  assert.doesNotMatch(src('js/map-markers.js'), /mo-view/, 'view switch lives in the top bar only');
  assert.doesNotMatch(src('js/area-select.js'), /new PresentControl\(\)|L\.Control\.extend\(\{[^}]*present/i, 'Present lives in the top bar only');
  assert.doesNotMatch(src('js/measure.js'), /data-ptool-act="buffer:/, 'radius select lives in Select only');
  assert.match(src('js/tips.js'), /document\.querySelector\('#tb-views'\), t: 'Map views'/, 'tour points at the top-bar switch');
});

test('Needs attention drops newly listed files that are already completed', () => {
  assert.match(src('js/overview-tab.js'), /\(ch\.added \|\| \[\]\)\.filter\(a => a\.phase !== 'completed' && inMuni\(a\)\)/);
});
