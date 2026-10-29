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
  for (const sel of ['#home .page-main', "homeMenu('ul')", 'data-ws-page="find"', ".home-full'", '#tb-restart']) assert.ok(home.includes(sel), `the Home tour points at ${sel}`);
  // (it never points at the map's controls, hidden behind Home)
  for (const sel of ['#f-search', '#pipeline', '.map-opts', '.tool-rail', '#analysis']) assert.ok(!home.includes(sel), `not at ${sel}`);
  // the roles, the shortcuts to start with: the one list (navigation phase 7, owner decision 6; the tour's own five
  // went, its keys kept), six with QA/QC; a pick redraws Home's menu, so the next step shows its shortcuts
  assert.match(t, /const roles = \(\) => \(root\.PeelWorkspaces && root\.PeelWorkspaces\.ROLES\) \|\| \[\];/);
  assert.match(t, /<div class="tour-roles" role="group" aria-label="Your role">\$\{roles\(\)\.map\(r => /);
  // (no local of the same name hides roles() where it is read: const roles = `…${roles().map(` would throw on the
  // Welcome step, before its card is drawn)
  assert.equal((t.match(/\bconst roles = /g) || []).length, 1, 'one roles: the module’s');
  assert.doesNotMatch(t, /TOUR_ROLES/);
  assert.deepEqual(require('../js/workspaces.js').ROLES.map(r => r.key), ['engineer', 'manager', 'growth', 'capital', 'fsr', 'qa']);
  assert.match(t, /const r = e\.target\.closest\('\[data-tour-role\]'\); if \(r\) \{ store\.set\('role', r\.dataset\.tourRole\);[^\n]*W\.renderPage\(true\);[^\n]*tourGo\(tourI \+ 1\); \}/);
  assert.match(t, /const homeMenu = sel => vis\(`#home \.home-side\.open \$\{sel\}`, `#home \.home-side \$\{sel\}`, '#tb-nav'\);/, 'on a phone the step points at ☰');
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
  for (const stale of ["t: 'Phases'", 'Water and Wastewater for capacity', 'DC for timing', "t: 'Wastewater'", "t: 'Timing forecast'", "t: 'This week: watchlist", 'Files & history', 'The Demand year', 'How developments are coloured', '#ov-dev', "tourShow('overview', 'files')", '#site-bar']) assert.ok(!tour.includes(stale), `stale: ${stale}`);
  for (const now of ["t: 'Stages'", 'Servicing for capacity', 'Capital for DC timing', 'Records for the files', "t: 'Watch: your watchlist", "t: 'Forecast'", 'History and source records']) assert.ok(tour.includes(now), `missing: ${now}`);
});

test('phone: Home\'s menu is ☰ in the top bar; page actions in a bar at the bottom; scenario and years in the panel', () => {
  const w = src('js/workspaces.js'), css = src('css/app.css'), p = src('js/panel.js');
  // (navigation phase 7, §3.8, §5 row 14: the in-page "☰ … · all pages" row went, removed by design; ☰ sits beside Home)
  assert.match(w, /<nav class="home-side\$\{menuOpen \? ' open' : ''\}" id="home-side" aria-label="Pages">/);
  assert.match(src('index.html'), /id="tb-home" data-ws-home [^>]*>Home<\/button>\n[^\n]*\n\s*<button type="button" class="btn small tb-btn tb-nav" id="tb-nav" data-home-menu aria-expanded="false" aria-controls="home-side"/);
  assert.match(w, /if \(e\.target\.closest\('\[data-home-menu\]'\)\) \{ menuOpen = !menuOpen; renderPage\(true\); if \(menuOpen\) \{ const el = \$\('#home'\); if \(el\) el\.scrollTop = 0; \} return; \}/);
  assert.doesNotMatch(w + css, /home-menu-btn/);
  const ph = css.slice(css.indexOf('/* Navigation 4, phone: Home'));
  assert.match(ph, /@media \(max-width: 700px\) \{\n {2}html\.home-on \.topbar \.tb-btn\.tb-nav \{ display: inline-flex;/);
  assert.match(ph, /\.home-side:not\(\.open\) \{ display: none; \}/);
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
