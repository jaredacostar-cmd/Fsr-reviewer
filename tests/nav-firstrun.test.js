'use strict';
// Navigation review, part 4: a first run that fits Home, the phone, settings in their place, one name each.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('the first run on Home: "What\'s your role?", then a short tour of Home that points at Home', () => {
  const t = src('js/tips.js');
  const home = t.slice(t.indexOf('const HOME_TOUR = ['), t.indexOf('const TOUR = ['));
  const n = (home.match(/\{ ch: '/g) || []).length;
  assert.ok(n >= 5 && n <= 6, `the Home tour is short (${n} steps)`);
  assert.match(home, /roles: true, t: 'Welcome', b: '[^\n]*What\\'s your role\?/);
  for (const sel of ['#home .page-main', "homeMenu('ul')", 'data-ws-page="site"', ".home-full'", '#tb-restart']) assert.ok(home.includes(sel), `the Home tour points at ${sel}`);
  // (it never points at the map's controls, hidden behind Home)
  for (const sel of ['#f-search', '#pipeline', '.map-opts', '.tool-rail', '#analysis']) assert.ok(!home.includes(sel), `not at ${sel}`);
  // five roles, the pages to start with
  assert.match(t, /const TOUR_ROLES = \[\n {4}\['engineer'[^]*?\['manager'[^]*?\['growth'[^]*?\['capital'[^]*?\['fsr'/);
  assert.match(t, /const r = e\.target\.closest\('\[data-tour-role\]'\); if \(r\) \{ store\.set\('role', r\.dataset\.tourRole\); tourGo\(tourI \+ 1\); \}/);
  assert.match(t, /if \(onHome\(\)\) \{ if \(!homeDone\(\)\) setTimeout\(\(\) => \{ if \(onHome\(\) && !tourEl\) startTour\('home'\); \}, 1200\); \} else maybeMapTour\(\);/);
});

test('the map has its own tour, offered once the first time the full map opens', () => {
  const t = src('js/tips.js');
  assert.match(t, /function maybeMapTour\(\) \{\n {4}if \(mapDone\(\) \|\| tourEl \|\| offerEl \|\| onHome\(\) \|\| store\.get\('mapTourOffered', false\)/);
  assert.match(t, /<strong>New to the full map\?<\/strong>[^]*?data-tour-offer="yes">Take the map tour<\/button>/);
  assert.match(src('js/workspaces.js'), /if \(m === 'full' && root\.PeelTips && root\.PeelTips\.maybeMapTour\) setTimeout\(\(\) => root\.PeelTips\.maybeMapTour\(\), 800\);/);
  // Help offers both
  assert.match(t, /data-help-tour="home">Tour of Home<\/button> <button type="button" class="btn small" data-help-tour="map">Tour of the full map<\/button>/);
  // (someone who saw the old tour sees neither again)
  assert.match(t, /const homeDone = \(\) => store\.get\('homeTourDone', store\.get\('tourDone', false\)\);/);
});

test('a tour never leaves a development, a selection or the Watch tab open', () => {
  const body = src('js/tips.js').match(/function endTour\(\) \{[^]*?\n {2}\}/)[0];
  assert.match(body, /AS\(\)\.clearSelected\(\);/);
  assert.match(body, /DevScope\.current\(\) && DevScope\.current\(\) !== tourSet\.dev\) DevScope\.close\(\);/);
  assert.match(body, /DT\(\)\.showTab\('explore'\)/);
});

test('the map tour\'s text matches the app: stages, the legend, Servicing, Capital, Records, Watch, Forecast', () => {
  const t = src('js/tips.js'), tour = t.slice(t.indexOf('const TOUR = ['), t.indexOf('const HELP = ['));
  for (const stale of ["t: 'Phases'", 'Water and Wastewater for capacity', 'DC for timing', "t: 'Wastewater'", "t: 'Timing forecast'", "t: 'This week: watchlist", 'Files & history', 'The Demand year', 'How developments are coloured']) assert.ok(!tour.includes(stale), `stale: ${stale}`);
  for (const now of ["t: 'Stages'", 'Servicing for capacity', 'Capital for DC timing', 'Records for the files', "t: 'Watch: your watchlist", "t: 'Forecast'", 'History and source records']) assert.ok(tour.includes(now), `missing: ${now}`);
});

test('phone: Home\'s menu behind one button, grouped; page actions in a bar at the bottom; scenario and years in the panel', () => {
  const w = src('js/workspaces.js'), css = src('css/app.css'), p = src('js/panel.js');
  assert.match(w, /<nav class="home-side\$\{menuOpen \? ' open' : ''\}" aria-label="Workspaces"><button type="button" class="home-menu-btn" data-home-menu aria-expanded="\$\{menuOpen\}">/);
  assert.match(w, /if \(e\.target\.closest\('\[data-home-menu\]'\)\) \{ menuOpen = !menuOpen; renderPage\(true\); return; \}/);
  assert.match(css, /\.home-side:not\(\.open\) > :not\(\.home-menu-btn\) \{ display: none; \}/);
  assert.match(css, /\.home-side\.open \.home-g \{ display: block;/);
  assert.match(css, /\.home-main \.page-foot \.pnl-acts \{ position: fixed; left: 0; right: 0; bottom: 0;/);
  assert.match(p, /<div class="pnl-phone-ctx small">\$\{scenarioChip\(\)\}\$\{yearsChip\(\)\}<\/div>/);
  assert.match(p, /if \(e\.target\.closest\('\[data-pnl-years\]'\)\) \{[^]*?D\.toggleSidebar\(true\)[^]*?w\.open = true;/);
  assert.match(css, /#fr-when \.when-years-in \{ display: grid; \}/);
  assert.match(css, /\.pnl-phone-ctx \{ display: none; \}/);
});

test('settings in their place: wet weather in the Scenario control, record type in Find › What, colour in the legend', () => {
  assert.match(src('js/svc-tab.js'), /\$\{Sett\(\) && Sett\(\)\.wetBoxHTML \? Sett\(\)\.wetBoxHTML\(\) : ''\}/);
  assert.doesNotMatch(src('js/growth-ui.js'), /SET\(\)\.wetBoxHTML\(\)/);
  const what = /<details class="fp-sec fp-row" id="fr-what">([^]*?)<\/details>/.exec(src('index.html'))[1];
  assert.ok(what.includes('id="f-kind"') && what.includes('id="f-new"'));
  const ma = src('js/map-analysis.js');
  assert.match(ma, /\$\{b\('phase', 'Stage'\)\}\$\{b\('layer', 'Counted as'\)\}\$\{b\('plant', 'Plant'\)\}\$\{b\('quality', 'Data quality'\)\}\$\{b\('timing', 'Timing'\)\}/);
  assert.doesNotMatch(src('js/map-markers.js'), /id="opt-mcolor"/);
});

test('one name per thing: Full map, Servicing memo, Watch, Forecast', () => {
  const all = ['js/workspaces.js', 'js/ws-pages.js', 'js/approvals-guide.js', 'js/glossary.js', 'js/reference.js', 'js/dev-detail.js', 'js/devscope.js', 'js/topbar.js', 'js/info.js', 'js/timing.js'].map(src).join('\n');
  assert.doesNotMatch(all, /Full map \(all tools\)<|'Full map \(all tools\)'|Open full map →|'Open the full map'/);
  assert.doesNotMatch(all, />Memo<\/button>|development memo<\/button>/);
  assert.doesNotMatch(all, /'Timing forecast|skel\('Timing forecast'\)/);
  assert.doesNotMatch(src('js/info.js'), /on the This week tab/);
});

test('the reload banner ignores the browser\'s ResizeObserver notice (it is not a failure)', () => {
  assert.match(src('index.html'), /window\.addEventListener\('error', function \(e\) \{\n\s*\/\/[^\n]*\n\s*if \(e && \/ResizeObserver loop\/\.test\(e\.message \|\| ''\)\) return;/);
});
