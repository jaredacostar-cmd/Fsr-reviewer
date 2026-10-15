'use strict';
/* Design-system tests (Phase 1.5): theme resolution, density default,
 * per-view basemap mapping, the icon set, and the guarantee that theme/density
 * never leak into share links.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const DG = require('../js/design.js');

// Phase 6: js/app.js was split into js/util.js + 46 area modules. Structural
// assertions read the whole js/ tree (app core + modules) as one source.
const JS_DIR = path.join(__dirname, '..', 'js');
const APP = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');
const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

test('resolveTheme: dark/light/device x prefers-light', () => {
  // Explicit choices win whatever the OS says.
  assert.equal(DG.resolveTheme('dark', true), 'dark');
  assert.equal(DG.resolveTheme('dark', false), 'dark');
  assert.equal(DG.resolveTheme('light', true), 'light');
  assert.equal(DG.resolveTheme('light', false), 'light');
  // Follow device: null -> remove data-theme, the media query decides.
  assert.equal(DG.resolveTheme('device', true), null);
  assert.equal(DG.resolveTheme('device', false), null);
  // Unset or garbage -> dark is the default for everyone.
  for (const s of [null, undefined, '', 'midnight', 42]) {
    assert.equal(DG.resolveTheme(s, true), 'dark', `stored=${JSON.stringify(s)} prefersLight=true`);
    assert.equal(DG.resolveTheme(s, false), 'dark', `stored=${JSON.stringify(s)} prefersLight=false`);
  }
});

test('densityDefault: coarse pointer -> comfortable, desktop -> compact', () => {
  const mm = globalThis.matchMedia, iw = globalThis.innerWidth;
  try {
    globalThis.matchMedia = q => ({ matches: /coarse/.test(q), media: q });
    globalThis.innerWidth = 1440;
    assert.equal(DG.densityDefault(), 'comfortable');
    globalThis.matchMedia = q => ({ matches: false, media: q });
    assert.equal(DG.densityDefault(), 'compact');
    // No matchMedia (old engine): narrow window still reads as a phone.
    delete globalThis.matchMedia;
    globalThis.innerWidth = 700;
    assert.equal(DG.densityDefault(), 'comfortable');
    globalThis.innerWidth = 1440;
    assert.equal(DG.densityDefault(), 'compact');
  } finally {
    if (mm === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = mm;
    if (iw === undefined) delete globalThis.innerWidth; else globalThis.innerWidth = iw;
  }
  // applyDensity validates: anything but 'comfortable' is compact.
  assert.equal(DG.applyDensity('comfortable'), 'comfortable');
  assert.equal(DG.applyDensity('compact'), 'compact');
  assert.equal(DG.applyDensity('garbage'), 'compact');
});

test('basemapForView: planning -> aerial, servicing views -> dark canvas', () => {
  assert.equal(DG.basemapForView('planning'), 'aerial-labels');
  assert.equal(DG.basemapForView('water'), 'canvas-dark');
  assert.equal(DG.basemapForView('wastewater'), 'canvas-dark');
  assert.equal(DG.basemapForView('dc'), 'canvas-dark');
  assert.equal(DG.basemapForView('something-else'), 'aerial-labels');
});

test('icon(): inline SVG, outline style, 24x24 viewBox, every name resolves', () => {
  const names = ['planning', 'water', 'wastewater', 'dc', 'development',
    'trace', 'lasso', 'measure', 'whatif', 'tips', 'present',
    'export', 'settings', 'select', 'inspect', 'corridor', 'unitsfit'];
  for (const n of names) {
    const s = DG.icon(n);
    assert.ok(s.startsWith('<svg'), `${n}: not an svg`);
    assert.ok(s.includes('viewBox="0 0 24 24"'), `${n}: viewBox`);
    assert.ok(s.includes('stroke="currentColor"'), `${n}: stroke`);
    assert.ok(s.includes('fill="none"'), `${n}: fill`);
    assert.ok(!/#[0-9a-fA-F]{3,6}\b/.test(s), `${n}: hard-coded colour`);
  }
  // Aliases used by the UI resolve to the tool icons. 'select' is now its own
  // cursor icon (Phase 3b rail), no longer an alias of 'lasso'.
  assert.notEqual(DG.icon('select'), DG.icon('lasso'));
  assert.equal(DG.icon('test-site'), DG.icon('whatif'));
  // Unknown names fall back to the development icon, never an empty string.
  assert.equal(DG.icon('nope'), DG.icon('development'));
  assert.ok(DG.icon('nope').length > 0);
});

test('rail TOOL_ITEMS: every icon key is a real icon (no silent fallback)', () => {
  // js/app.js is a browser IIFE; read the rail definition as source.
  const m = /const TOOL_ITEMS = (\[[\s\S]*?\]);/.exec(APP);
  assert.ok(m, 'TOOL_ITEMS not found in js/');
  const items = new Function(`return (${m[1]});`)();
  assert.deepEqual(items.map(i => i[0]), ['select', 'measure', 'trace', 'whatif', 'inspect', 'corridor', 'unitsfit', 'timebox']);
  for (const [k, , , ic] of items) assert.ok(DG.iconNames.includes(ic), `rail tool ${k} uses unknown icon ${ic}`);
});

test('share-link serialization excludes theme and density', () => {
  // The share link is built by encode() inside the viewLink closure in
  // js/app.js; theme/density live only in the store (peel-dev:theme,
  // peel-dev:density) and must never become link parameters.
  const m = /const encode = \(\) => \{([\s\S]*?)\n    \};/.exec(APP);
  assert.ok(m, 'encode() not found in js/');
  const body = m[1];
  assert.ok(!/['"]theme['"]/.test(body), 'encode() references theme');
  assert.ok(!/['"]density['"]/.test(body), 'encode() references density');
  assert.ok(!/store\.get\(['"](theme|density)['"]\)/.test(body), 'encode() reads the theme/density store keys');
  // And the settings UI says so on the tin.
  assert.ok(APP.includes('data-theme') && APP.includes("store.set('theme'"), 'theme persisted via store');
  assert.ok(APP.includes("store.set('density'"), 'density persisted via store');
});

test('index.html sets the theme before first paint', () => {
  const head = HTML.slice(0, HTML.indexOf('</head>'));
  const scriptAt = head.indexOf('peel-dev:theme');
  assert.ok(scriptAt > 0, 'no inline theme script in <head>');
  const firstCss = head.indexOf('<link rel="stylesheet"');
  assert.ok(scriptAt < firstCss, 'theme script must run before the stylesheet links');
  assert.ok(head.includes("removeAttribute('data-theme')") || head.includes('removeAttribute("data-theme")'),
    'device choice should remove data-theme');
  assert.ok(head.includes('css/modes.css'), 'modes.css not linked');
  assert.ok(HTML.includes('<script src="js/design.js'), 'design.js not loaded');
  assert.ok(HTML.indexOf('<script src="js/design.js') < HTML.indexOf('<script src="js/app.js'),
    'design.js must load before app.js');
});
