'use strict';
// Design bundle 7, stylesheet hygiene: one copy of each theme, five shared breakpoints, named
// stacking layers, no undefined tokens or stale fallbacks, no rules for classes nothing uses, and a
// focus ring that can't be mistaken for "selected".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const CSS = src('css/app.css') + src('css/modes.css');
const JS = fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js')).map(f => src(`js/${f}`)).join('\n') + src('index.html');
const noComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '');

test('"Follow device" resolves in code: data-theme is always dark or light', () => {
  assert.match(src('js/design.js'), /if \(stored === 'device'\) return prefersLight \? 'light' : 'dark';/);
  assert.match(src('js/design.js'), /document\.documentElement\.setAttribute\('data-theme', t\);/);
  assert.doesNotMatch(/function applyTheme\(stored\) \{[^]*?\n {2}\}/.exec(src('js/design.js'))[0], /removeAttribute/);
  // (the system setting changes while "Follow device" is on: the theme follows)
  assert.match(src('js/app.js'), /if \(store\.get\('theme', 'dark'\) === 'device' && window\.PeelDesign\) window\.PeelDesign\.applyTheme\('device'\);/);
  assert.doesNotMatch(noComments(CSS), /prefers-color-scheme|:root:not\(\[data-theme/);
});

test('five shared breakpoints, the same in the stylesheet and the scripts', () => {
  const css = [...noComments(CSS).matchAll(/@media[^{]*/g)].flatMap(m => [...m[0].matchAll(/(\d+)px/g)].map(x => +x[1]));
  assert.deepEqual([...new Set(css)].sort((a, b) => a - b), [480, 700, 1199, 1200, 1600, 1799, 1800]);
  const js = [...JS.matchAll(/matchMedia\('\([^)]*?(\d+)px/g), ...JS.matchAll(/innerWidth\s*(?:<=|<|>=|>)\s*(\d+)/g)].map(m => +m[1]);
  for (const w of js) assert.ok([480, 700, 1199, 1200, 1600, 1800].includes(w), `the scripts use ${w}px`);
});

test('stacking layers are named tokens (z-index 1–5 stay local to a component)', () => {
  const nums = [...noComments(CSS).matchAll(/z-index:\s*(\d+)/g)].map(m => +m[1]);
  for (const n of nums) assert.ok(n <= 5, `z-index ${n} is a raw number`);
  const names = [...CSS.matchAll(/z-index:\s*var\((--z-[\w-]+)\)/g)].map(m => m[1]);
  assert.ok(names.length >= 40);
  for (const n of new Set(names)) assert.match(CSS, new RegExp(`${n}: \\d+;`), `${n} is defined`);
  assert.match(CSS, /--z-tour: 4000;/);
});

test('every token used is defined, and defined tokens carry no stale fallback', () => {
  const css = noComments(CSS);
  const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]).concat([...JS.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]), [...JS.matchAll(/setProperty\(\s*['`"](--[\w-]+)/g)].map(m => m[1])));
  for (const [, n] of css.matchAll(/var\((--[\w-]+)/g)) assert.ok(defined.has(n), `${n} is used but never defined`);
  const cssDefined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
  for (const [, n] of css.matchAll(/var\((--[\w-]+)\s*,/g)) assert.ok(!cssDefined.has(n), `${n} is defined, so its fallback can only go stale`);
});

test('no rules for classes that no script or page writes', () => {
  const css = noComments(src('css/app.css'));
  const classes = new Set([...css.matchAll(/([^{}]+)\{[^{}]*\}/g)].flatMap(m => (m[1].trim().startsWith('@') ? [] : [...m[1].matchAll(/\.([a-zA-Z_][\w-]*)/g)].map(x => x[1]))));
  // (classes built in a template, `ph-${k}`, `r${t}`, count as used)
  const dyn = [...JS.matchAll(/([a-z][\w-]*?)\$\{/g)].map(m => m[1]).filter(Boolean);
  const unused = [...classes].filter(c => !/^(leaflet|maplibregl|marker-cluster)/.test(c)
    && !new RegExp(`(?<![\\w-])${c.replace(/[-]/g, '\\-')}(?![\\w-])`).test(JS)
    && !dyn.some(p => c.startsWith(p) && (p.endsWith('-') || /^\d/.test(c.slice(p.length)))));
  assert.deepEqual(unused, []);
});

test('the focus ring is the text colour, never the accent ("selected")', () => {
  const dark = /^:root\s*{([^}]*)}/m.exec(src('css/app.css'))[1], light = /^:root\[data-theme="light"\]\s*{([^}]*)}/m.exec(src('css/app.css'))[1];
  const v = (b, n) => (new RegExp(`${n}:\\s*(#[0-9a-f]{6})`).exec(b) || [])[1];
  assert.equal(v(dark, '--focus'), v(dark, '--text-primary'));
  assert.equal(v(light, '--focus'), v(light, '--text-primary'));
  assert.notEqual(v(dark, '--focus'), v(dark, '--accent'));
  assert.match(src('css/app.css'), /\.stg-row\[data-ws-stage\]:focus-visible \{ outline: 2px solid var\(--focus\); outline-offset: -2px; \}/);
});

test('storm sewers are dotted: pipe kinds differ by line, not colour alone', () => {
  assert.match(src('js/map-markers.js'), /storm: \{ color: '--pipe-storm', label: 'Storm sewer', dash: '1 5' \}/);
  assert.match(src('js/exist-pipes.js'), /dashArray: \/FM\/\.test\(a\.type\) \? '6 4' : MM\(\)\.EXIST_STYLE\[kind\]\.dash/);
  assert.match(src('css/app.css'), /\.lg-line\.dot \{ background: repeating-linear-gradient\(90deg, var\(--lg-c\) 0 3px, transparent 3px 6px\); \}/);
});
