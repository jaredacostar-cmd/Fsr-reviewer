'use strict';
// Design bundle 4 — phone and chrome: one top-bar row on a phone, the pages without the map's view
// switch and second scenario chip, the site's tools in one place, a one-row footer with the note in
// full, touch targets by pointer, the map's tools behind one button, and a picked site kept in sight
// above the phone sheet.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const CSS = src('css/app.css'), HTML = src('index.html');
const phoneBlock = () => { const i = CSS.indexOf('/* ---- Design bundle 4: phone and chrome'); return CSS.slice(i); };

test('phone top bar: one row — Export, Present, Help and Settings in ⋯; the current view only; no second scenario chip', () => {
  assert.match(HTML, /<button type="button" class="btn small tb-btn tb-more" id="tb-more" aria-expanded="false" aria-controls="tb-acts-list"/);
  const list = HTML.slice(HTML.indexOf('<div class="tb-acts-list" id="tb-acts-list">'), HTML.indexOf('</header>'));
  for (const id of ['tb-export', 'tb-present', 'tb-help', 'tb-gear']) assert.ok(list.includes(`id="${id}"`), `${id} in the ⋯ list`);
  const b = phoneBlock();
  assert.match(CSS, /\.tb-acts-list \{ display: contents; \}/, 'unchanged on a computer');
  assert.match(b, /\.tb-acts-list \{ display: none; \}/);
  assert.match(b, /\.tb-actions\.open \.tb-acts-list \{ display: flex; flex-direction: column;/);
  assert.match(b, /\.topbar \{ flex-wrap: nowrap; \}/);
  assert.match(b, /\.tb-views:not\(\.open\) \.btn:not\(\.on\) \{ display: none; \}/);
  assert.match(b, /\.topbar \.tb-scen \{ display: none; \}/);
  assert.match(b, /\.unofficial-banner \{[^}]*white-space: nowrap;/, 'the banner on one line');
  const tb = src('js/topbar.js');
  assert.match(tb, /if \(phone\(\) && b\.classList\.contains\('on'\) && !v\.classList\.contains\('open'\)\) \{ v\.classList\.add\('open'\); return; \}/);
  // The panels' and pages' chips still open the scenario control.
  assert.match(src('js/panel.js'), /if \(e\.target\.closest\('\[data-pnl-scen\]'\)\) \{ const T = root\.PeelTopbar; if \(T && T\.openScenPop\) T\.openScenPop\(\); return; \}/);
});

test('pages: no map view switch and no second scenario chip in the top bar', () => {
  assert.match(CSS, /html\.home-on \.tb-views, html\.home-on \.tb-scen \{ display: none; \}/);
});

test('the Filters button sits in the top bar below 1200 px (off the map and the phone sheet)', () => {
  const dt = src('js/data-tab.js');
  assert.match(dt, /if \(shellNarrow\(\)\) \{ if \(fBtn\.parentElement !== tb\) tb\.insertBefore\(fBtn, acts\); \} else if \(fBtn\.parentElement !== fHome\) fHome\.appendChild\(fBtn\);/);
  assert.match(dt, /placeFilters\(\); addEventListener\('resize', placeFilters\);/);
  assert.match(CSS, /\.topbar \.toggle-sidebar \{ position: static;/);
  assert.match(src('js/map-analysis.js'), /rects\('\.map-wrap #toggle-sidebar'\)/, 'the map boxes only avoid it while it is on the map');
});

test('touch targets follow touch screens of any width; no zoom buttons on a touch screen', () => {
  assert.match(CSS, /@media \(max-width: 700px\), \(pointer: coarse\) \{\n {2}\.btn:not\(\.link\), \.chip,/);
  assert.match(CSS, /@media \(max-width: 700px\), \(pointer: coarse\) \{\n {2}\.topbar \.tb-btn,/);
  assert.match(CSS, /@media \(pointer: coarse\) \{ \.leaflet-control-zoom \{ display: none; \} \}/);
});

// (navigation phase 5: the site bar's Tools ▾ went; its tools are the header's, one row, ⋯ for the rest)
test('the development: its tools once (the header), the footer without them; a pick folds the ⋯ menu', () => {
  assert.match(src('js/panel.js'), /<details class="site-more pnl-more"><summary class="btn small"[^>]*>⋯<\/summary>/);
  assert.match(src('js/panel.js'), /const mi = e\.target\.closest\('\.pnl-more \[role="menuitem"\]'\), md = mi && mi\.closest\('details'\);\n {6}if \(md\) setTimeout\(\(\) => \{ md\.open = false; \}, 0\);/);
  assert.doesNotMatch(src('js/overview-tab.js'), /'data-pnl-fsr'/);
  // A phone: the row scrolls sideways (no page scroll), each button 44 px; ☆ Watch and the ⋯ items too.
  assert.match(CSS, /\.pnl-tools-row \{ flex-wrap: nowrap; overflow-x: auto;/);
  assert.match(CSS, /\.pnl-tools-row \.btn \{ flex: none; white-space: nowrap; \}/);
  assert.match(CSS, /\.pnl-flags \.watch-btn, \.pnl-more \.site-more-menu \.btn \{ min-height: 44px; \}/);
});

test('footer: one row of actions; the screening note in full with Report a data issue at its end; never cut', () => {
  assert.match(src('js/panel.js'), /<p class="pnl-note small">\$\{NOTE\}\$\{reportLink\(s\.key, h\.name\)\}<\/p><\/footer>/);
  assert.match(src('js/ws-pages.js'), /<p class="pnl-note small">\$\{note \|\| ''\}\$\{report\}<\/p><\/footer>/);
  assert.match(CSS, /\.pnl-foot \{ bottom: 0; \}/);
  assert.match(CSS, /\.pnl-foot \.pnl-acts \{ flex-wrap: nowrap; overflow-x: auto;/);
});

test('map: tools behind one Tools button (open on a computer, folded on touch, remembered); scale by the attribution; In view in the Layers header', () => {
  const as = src('js/area-select.js');
  assert.match(as, /const open = store\.get\('railOpen', !matchMedia\('\(max-width: 1199px\), \(pointer: coarse\)'\)\.matches\) !== false;/);
  assert.match(as, /<button type="button" class="rail-toggle" data-rail-toggle aria-expanded="\$\{open\}"/);
  assert.match(as, /store\.set\('railOpen', o\)/);
  assert.match(CSS, /\.tool-rail\.folded \.rail-tools \{ display: none; \}/);
  assert.match(as, /L\.control\.scale\(\{ position: 'bottomright'/);
  assert.match(src('js/map-markers.js'), /<span class="mo-inview" id="mo-inview"/);
  assert.doesNotMatch(src('js/render-list.js'), /inview-chip/);
  assert.ok(require('../js/design.js').iconNames.includes('tools'));
});

test('a site picked on a phone: the sheet at its peek, the site in the middle of the map left above it', () => {
  assert.match(src('js/devscope.js'), /if \(typeof innerWidth === 'number' && innerWidth <= 700 && window\.PeelApp && window\.PeelApp\.setAnalysisSnap\) window\.PeelApp\.setAnalysisSnap\('peek', false\);\n {8}h\.flyToSite\(p\);/);
  const dn = src('js/dev-nav.js');
  const body = dn.slice(dn.indexOf('  function clearCentre(t, z) {'), dn.indexOf('  function flyToSite('));
  // A fake map: pixels = degrees × 1000 (y down), container 0..800 tall, the sheet's top at 500.
  const pt = (x, y) => ({ x, y, add(o) { return pt(x + o.x, y + o.y); } });
  const run = bearing => new Function('map', 'L', 'document', 'window', `${body}; return clearCentre;`)(
    { getContainer: () => ({ getBoundingClientRect: () => ({ top: 0, bottom: 800 }) }), getBearing: () => bearing, project: ll => pt(ll.lng * 1000, -ll.lat * 1000), unproject: p => ({ lat: -p.y / 1000, lng: p.x / 1000 }) },
    { point: pt }, { getElementById: () => ({ getBoundingClientRect: () => ({ top: 500 }) }) }, { PeelDataTab: { shellNarrow: () => true } })({ lat: 43.7, lng: -79.7 }, 15);
  // Visible middle 250, map middle 400: the centre goes 150 px below the site on screen.
  const n = run(0);
  assert.ok(Math.abs((43.7 - n.lat) * 1000 - 150) < 1e-6 && Math.abs(n.lng + 79.7) < 1e-9, 'north up: straight down');
  const g = run(44);
  assert.ok(Math.abs((g.lng + 79.7) * 1000 - 150 * Math.sin(44 * Math.PI / 180)) < 1e-6, 'road grid: the shift turns with the map');
});
