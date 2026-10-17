'use strict';
// Tokens and accessibility (design audit, Group 11): WCAG AA contrast for text on the accent and
// the light theme's muted / accent tokens; 44 px tap targets on a phone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');

const lum = h => { const c = [0, 2, 4].map(i => parseInt(h.slice(1 + i, 3 + i), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const block = sel => { const i = css.indexOf(sel); return css.slice(i, css.indexOf('}', i)); };
const tok = (blk, name) => (blk.match(new RegExp(`--${name}: (#[0-9a-f]{6})`)) || [])[1];

test('text on an accent fill passes AA in both themes', () => {
  const dark = css.slice(0, css.indexOf(':root[data-theme="light"]'));
  const light = block(':root[data-theme="light"] {');
  const onAccentDark = (css.match(/--on-accent: (#[0-9a-f]{6});\n/g) || []).map(x => x.match(/#[0-9a-f]{6}/)[0]);
  assert.ok(onAccentDark.includes('#0b0b0b'), 'dark theme: dark text on the light-blue accent');
  assert.ok(ratio('#0b0b0b', tok(dark, 'accent')) >= 4.5, 'dark theme');
  assert.ok(ratio('#ffffff', tok(light, 'accent')) >= 4.5, 'light theme');
  const accentFills = css.split('\n').filter(l => /background: var\(--accent\)/.test(l) && /color: var\(--on-tint\)/.test(l));
  assert.equal(accentFills.length, 0, 'no white-on-accent rules left');
});

test('light theme: muted and accent text pass AA on every surface', () => {
  for (const sel of [':root[data-theme="light"] {']) {
    const b = block(sel);
    for (const s of ['surface-0', 'surface-1', 'surface-2']) {
      assert.ok(ratio(tok(b, 'text-muted'), tok(b, s)) >= 4.5, `${sel} muted on ${s}`);
      assert.ok(ratio(tok(b, 'accent'), tok(b, s)) >= 4.5, `${sel} accent on ${s}`);
    }
  }
});

test('44 px tap targets on a phone', () => {
  const m = css.slice(css.indexOf('/* 44 px tap targets on a phone'));
  for (const s of ['.btn:not(.link)', '.chip', '.f-tab', 'select', 'details > summary', '.leaflet-bar a', '.pipeline button', '#north-btn', '.tool-rail button']) assert.ok(m.includes(s), s);
  assert.match(m, /min-height: 44px/);
  assert.match(m, /\.tool-rail \.rail-tools \{ display: grid; grid-template-columns: repeat\(2, 44px\); \}/);
  assert.match(m, /\n@media \(max-width: 700px\), \(pointer: coarse\) \{/, "a touch screen of any width");
});
