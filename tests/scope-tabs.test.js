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
  // (asked with the tab's view: Capital › EAs and Projects are the area's own, filtered to it, so neither host says it there)
  assert.match(ss, /if \(!below \|\| \(window\.DevScope && window\.DevScope\.current\(\)\) \|\| !PEEL_WIDE\[tab\] \|\| AREA_OWN\[`\$\{tab\}:\$\{sub\}`\]\) return '';/);
  assert.match(ss, /const AREA_OWN = \{ 'dca:eas': 1, 'dca:projects': 1 \};\n {2}function peelWideText\(tab, sub\) \{/);
  // (a tab showing the scope's own view, a file's flows, has none: navigation phase 8b review)
  assert.match(ss, /function peelWideNote\(\) \{\n[^\n]*\n {4}const A = AT\(\), t = A && A\.getFootTab\(\), html = A && A\.ownView && A\.ownView\(t\) \? '' : peelWideText\(t, A && A\.TABSUBS && A\.TABSUBS\[t\] \? A\.TABSUBS\[t\]\.get\(\) : ''\);\n {4}el\.innerHTML = html; el\.hidden = !html;\n {2}\}/);
  assert.match(ss, /<strong>Peel-wide\.<\/strong> \$\{PEEL_WIDE\[tab\]\} serve all of Peel, so these tables are not filtered to/);
  assert.match(src('js/topbar.js'), /window\.PeelSvcScope\.peelWideNote\(\)/, 'refreshed with every filter change');
  assert.match(src('js/analysis-tabs.js'), /root\.PeelSvcScope\.peelWideNote\(\)/, 'and every tab change');
});

test('the map’s #scope-note at Capital › EAs and Projects below Peel: none (their tables are the area’s); DC timing says it', () => {
  const vm = require('node:vm'), el = { innerHTML: '', hidden: true }, sub = { v: 'eas' };
  const win = { PeelUtil: require('../js/util.js'), PeelApp: { state: { muni: 'Caledon', sp: [], mtsa: [], pz: [], dr: [], ss: null, filtered: [] } }, PeelOverviewTab: { scopeText: () => 'Caledon' },
    PeelAnalysisTabs: { getFootTab: () => 'dca', TABSUBS: { dca: { get: () => sub.v } } } };
  win.window = win;
  vm.runInContext(src('js/svc-scope.js'), vm.createContext({ window: win, document: { addEventListener() {}, getElementById: id => (id === 'scope-note' ? el : null) }, Map, Set }));
  const note = v => { sub.v = v; win.PeelSvcScope.peelWideNote(); return [el.hidden, el.innerHTML]; };
  for (const v of ['eas', 'projects']) assert.deepEqual(note(v), [true, ''], v);
  const [hidden, html] = note('timing');
  assert.equal(hidden, false); assert.match(html, /^<strong>Peel-wide\.<\/strong> DC projects serve all of Peel, so these tables are not filtered to Caledon\.$/);
  assert.equal(win.PeelSvcScope.peelWideText('dca'), html, 'a tab with no view named: the tab’s note');
  // A tab showing the scope's own view (a file's Servicing, its flows: js/analysis-tabs.js ownView): none; the page
  // host's words (peelWideText) as they were (navigation phase 8b review).
  win.PeelAnalysisTabs.ownView = t => t === 'dca';
  assert.deepEqual(note('timing'), [true, '']);
  assert.equal(win.PeelSvcScope.peelWideText('dca', 'timing'), html);
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
