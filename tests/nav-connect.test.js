'use strict';
// Navigation review, part 3: search finds without filtering, one Start over, the Peel crumb only
// navigates, and the pages and the full map connect both ways.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('typing in the search finds; it filters the list only from "Filter the list by …"', () => {
  const s = src('js/search-filter.js');
  assert.doesNotMatch(s, /\$\('#f-search'\)\.oninput = e => \{[^\n]*state\.search = /);
  assert.match(s, /const filterBy = q => \{ App\(\)\.state\.search = String\(q \|\| ''\)\.trim\(\)\.toLowerCase\(\); \$\('#f-search'\)\.value = ''; App\(\)\.applyFilters\(\); \};/);
  assert.match(s, /const filterItem = \{ label: `Filter the list by “\$\{q\}”`, filter: q \};/);
  assert.match(s, /if \(x\.filter\) \{ filterBy\(x\.filter\); return; \}/);
  // Enter takes the first real result, never the filter item.
  assert.match(s, /sugItems\.find\(x => !x\.loading && !x\.filter\)/);
});

test('a suggestion tells developments at the same address apart (units, file number, plan)', () => {
  const s = src('js/search-filter.js');
  assert.match(s, /function devLine\(p, ql\) \{[^]*?\[p\.municipality, P\.PHASE_BY_KEY\[p\.phase\]\.label, p\.units \? `\$\{fmtNum\(p\.units\)\} unit\$\{p\.units === 1 \? '' : 's'\}` : '', ref, sp\]/);
  assert.match(s, /<li class="sug-h" role="presentation">Places and facilities<\/li>/);
});

test('the default years are the starting view, not a filter: no chip, and Reset leaves nothing behind', () => {
  const f = src('js/filter-ui.js');
  assert.match(f, /const yearsFilterActive = \(\) => App\(\)\.timeActive\(\) && !TL\(\)\.atDefaultYears\(\);/);
  assert.match(f, /if \(yearsFilterActive\(\)\) \{[^]*?clear: \(\) => TL\(\)\.setDefaultYears\(\) \}\);/);
  assert.doesNotMatch(f, /if \(App\(\)\.timeActive\(\)\) \{\n\s+const from/);
});

test('Reset keeps the settings: the capacity year and the scenario are not filters', () => {
  const body = src('js/filter-ui.js').match(/function resetAllFilters\(\) \{[^]*?\n {2}\}/)[0];
  assert.doesNotMatch(body, /setCapYear|basis:/);
  assert.match(body, /TL\(\)\.setDefaultYears\(\);/);
});

test('Start over (top bar) clears filters, search, selection, development, scope and tool result, then Home', () => {
  assert.match(src('index.html'), /<button type="button" class="btn small tb-btn" id="tb-restart" title="Start over: [^"]*">Start over<\/button>/);
  const t = src('js/topbar.js');
  const body = t.match(/function startOver\(\) \{[^]*?\n {2}\}/)[0];
  for (const re of [/PeelSvcScope\.clear\(\)/, /DevScope\.close\(\)/, /PeelTools\.closeResult\(\)/, /AS\(\)\.clearSelected\(\)/, /\$\('#f-search'\)/, /FI\(\)\.resetAllFilters\(\)/, /setMode\('home', 'home'\)/]) assert.match(body, re);
  // (the lens and the scenario stay)
  assert.doesNotMatch(body, /setMapView|setView|criteria|basis/);
  assert.match(t, /\$\('#tb-restart'\); if \(so\) so\.addEventListener\('click', startOver\);/);
  assert.match(src('js/design.js'), /restart: '<path/);
});

test('the Peel crumb only navigates: back to all of Peel, the filters stay', () => {
  const t = src('js/topbar.js');
  const body = t.match(/function goPeel\(\) \{[^]*?\n {2}\}/)[0];
  assert.doesNotMatch(body, /resetAllFilters/);
  assert.match(body, /Object\.assign\(App\(\)\.state, \{ muni: '', sp: \[\], mtsa: \[\], pz: \[\], dr: \[\] \}\);/);
  assert.match(t, /label: 'Peel', go: trailGoPeel, title: 'All of Peel: [^']*Start over clears them\)'/);
});

test('arriving on the full map from a page or a workspace, a bar offers the way back', () => {
  const w = src('js/workspaces.js');
  assert.match(w, /if \(m === 'full' && mode !== 'full'\) backTo = mode === 'home' \? \{ page \} : mode === 'ws' && cur \? \{ ws: cur \} : null;/);
  assert.match(w, /else if \(m !== 'full'\) backTo = null;/);
  assert.match(w, /data-ws-back>← Back to \$\{esc\(/);
  assert.match(w, /if \(e\.target\.closest\('\[data-ws-back\]'\)\) \{[^\n]*openPage\(\(b && b\.page\) \|\| 'home', \{ keepScroll: true \}\)/);
});

test('a page\'s link to the map\'s tools goes to the full map first, then does what it does there', () => {
  const w = src('js/workspaces.js');
  assert.match(w, /const MAP_LINK = '\[data-at\], \[data-ss\], \[data-full-table\], \[data-trace\], \[data-mview\]';/);
  assert.match(w, /if \(mode !== 'home' \|\| !e\.target\.closest\) return;[^]*?setMode\('full'\);\n {2}\}, true\);/);
});

test('Home\'s small map says where it goes: Servicing capacity', () => {
  const p = src('js/ws-pages.js');
  assert.match(p, /\$\{esc\(m\.map\.link \|\| 'Open the map'\)\} →<\/button>/);
  assert.match(p, /attrs: \{ 'data-ws-page': 'tight' \}, link: 'Servicing capacity'/);
});
