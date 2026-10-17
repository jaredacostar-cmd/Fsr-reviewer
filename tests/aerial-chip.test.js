'use strict';
// The aerial check as an answer in a development's header (js/aerial-chip.js): a chip beside the
// stage says what the latest aerial shows; pressed, the check opens under the header.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const AC = require('../js/aerial-chip.js');

test('the chip words each aerial status, with the photo year', () => {
  assert.deepEqual(AC.label({ status: 'Not visibly started' }, 'review', 2025), { text: 'Aerial 2025: not visibly started', tone: 'aer', note: '' });
  assert.equal(AC.label({ status: 'Likely under construction' }, 'permit', 2025).text, 'Aerial 2025: likely under construction');
  assert.equal(AC.label({ status: 'Likely completed' }, 'completed', 2024).text, 'Aerial 2024: likely built');
  assert.equal(AC.label(null, 'review', 2025), null);
});

test('a photo that disagrees with the records is marked: built in the records, not confirmed on the photo', () => {
  assert.deepEqual(AC.label({ status: 'Completed in the records; not confirmed on the aerial' }, 'completed', 2025), { text: 'Aerial 2025: not confirmed built', tone: 'tight', note: 'differs from the records' });
  assert.equal(AC.label({ status: 'Not visibly started' }, 'review', 2025).tone, 'aer', 'in review and not started: as expected');
});

test('the year comes from the latest photo’s label', () => {
  assert.equal(AC.yearOf({ years: { latest: 'y2025' }, src: { years: { y2025: { label: 'Spring 2025' } } } }), '2025');
  assert.equal(AC.yearOf(null), null);
});

test('wired in: the site header carries the chip and its box, on the panels and on Check a site / Review an FSR; one check per development', () => {
  const pn = src('js/panel.js'), wp = src('js/ws-pages.js'), dt = src('js/devtab.js');
  assert.match(pn, /\$\{chip\(h\.status\)\}\$\{h\.badge \|\| ''\}/);
  assert.match(pn, /badge: root\.PeelAerialChip\.chipHTML\(p\), extra: root\.PeelAerialChip\.boxHTML\(p\)/);
  assert.match(wp, /\$\{chipHTML\(m\.status\)\}\$\{m\.badge \|\| ''\}/);
  assert.equal((wp.match(/badge: s\.head\.badge, extra: s\.head\.extra/g) || []).length, 2, 'site and fsr pages');
  assert.match(dt, /const aerialRuns = new Map\(\);/);
  assert.match(dt, /aerialRun\(p\)\n {6}\.then\(show\)/, 'the Site view uses the same run');
  assert.match(src('index.html'), /<script src="js\/aerial-chip\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/aerial-chip\.js',/);
});
