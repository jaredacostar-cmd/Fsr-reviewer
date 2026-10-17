'use strict';
// The map by keyboard (js/map-keys.js): the arrow keys move between developments on screen.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const K = require('../js/map-keys.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('pick: the nearest development in the pressed direction, straight ahead before off to the side', () => {
  const pts = [[110, 100], [100, 140], [160, 100], [140, 60], [60, 100]];
  assert.equal(K.pick([100, 100], K.DIRS.ArrowRight, pts), 0);   // 10 px right
  assert.equal(K.pick([100, 100], K.DIRS.ArrowDown, pts), 1);
  assert.equal(K.pick([100, 100], K.DIRS.ArrowLeft, pts), 4);
  assert.equal(K.pick([100, 100], K.DIRS.ArrowUp, pts), 3);      // up-right, within 60°
  // (nothing within 60° that way: -1, the cursor stays)
  assert.equal(K.pick([200, 100], K.DIRS.ArrowRight, pts), -1);
  // straight ahead at 40 px beats 30 px at 55° off
  assert.equal(K.pick([0, 0], K.DIRS.ArrowRight, [[17, 25], [40, 0]]), 1);
});

test('wired: before Leaflet\'s arrow keys, Enter opens, Shift + arrows still pan, a live region names it', () => {
  const s = src('js/map-keys.js');
  assert.match(s, /el\.addEventListener\('keydown', onKey, true\);/);
  assert.match(s, /if \(!d \|\| e\.shiftKey\) return;/);
  assert.match(s, /if \(e\.key === 'Enter' && cur\) \{[^\n]*N\.showDetail\(p\)/);
  assert.match(s, /live\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(src('index.html'), /<script src="js\/map-keys\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/map-keys\.js',/);
  assert.match(src('js/tips.js'), /By keyboard: Tab to the map, then the arrow keys move/);
});
