'use strict';
// Position-risk wording and the public version (design audit, Group 2): the app reports what the
// screen shows, never what the Region should do.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const U = require('../js/util.js');

const JS = path.join(__dirname, '..', 'js');
const src = f => fs.readFileSync(path.join(JS, f), 'utf8');
const ALL = fs.readdirSync(JS).filter(f => f.endsWith('.js')).map(f => [f, src(f)]);

test('screening labels: one set, no advice verbs', () => {
  assert.equal(U.SCREEN.advance, 'Screens late');
  assert.equal(U.SCREEN.keep, 'Screens in time');
  assert.equal(U.SCREEN.defer, 'Screens well ahead of need');
  assert.equal(U.SCREEN.within, 'Within the funding screen');
  assert.equal(U.SCREEN.outside, 'Outside the funding screen');
  assert.equal(U.SCREEN.over, 'Screens over rated capacity');
  for (const v of Object.values(U.SCREEN)) assert.doesNotMatch(v, /\b(keep|defer|advance|bring|should|recommend)\b/i, v);
});

test('no position wording left in the app', () => {
  const banned = [/bring (it|them) forward/i, /should be brought forward/i, /over-committed/i, /<th>Recommendation<\/th>/,
    /'Decision'/, /Keep\/defer screen/, /could follow later/, /Over budget:/, /'Keep · advance'/, /Servicing verdict/, /<h3>Verdict<\/h3>/,
    /commit capacity now/, /Needed before the DC project/];
  for (const [f, s] of ALL) for (const re of banned) assert.doesNotMatch(s, re, `${f}: ${re}`);
});

test('the DC REC labels and funding-screen labels come from SCREEN', () => {
  const dc = src('dc-cost.js');
  assert.match(dc, /advance: \['dca-advance', SCREEN\.advance\]/);
  assert.match(dc, /const DEC = \{ Keep: SCREEN\.within, Defer: SCREEN\.outside \}/);
});

test('a range whose ends round the same shows one value', () => {
  const s = src('dca-tab.js');
  const line = s.match(/const ppRange = [^\n]+/)[0];
  const ppRange = new Function('fmtNum', 'roundPop', `${line}; return ppRange;`)(n => n.toLocaleString('en-CA'), v => Math.round(v / 100) * 100);
  assert.equal(ppRange(65080, 65120), '65,100');
  assert.equal(ppRange(1000, 2000), '1,000–2,000');
  assert.equal(ppRange(10, 14, v => String(Math.round(v / 10))), '1');
  assert.doesNotMatch(s, /\$\{pp\(B\.lower\)\}–\$\{pp\(B\.upper\)\}/, 'no unguarded lower–upper range');
});

test('public version: ?public or the setting, and what it hides', () => {
  const g = globalThis;
  const had = 'location' in g, old = g.location;
  try {
    g.location = { search: '?public' }; assert.equal(U.isPublic(), true);
    g.location = { search: '?x=1&public=1' }; assert.equal(U.isPublic(), true);
    g.location = { search: '?publication=1' }; assert.equal(U.isPublic(), false);
    g.location = { search: '' }; U.store.set('publicView', true); assert.equal(U.isPublic(), true);
    U.store.set('publicView', false); assert.equal(U.isPublic(), false);
  } finally { if (had) g.location = old; else delete g.location; }
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  // The funding screen (Screening results) and funding levels sit in Capital › DC timing behind the
  // Funding lab, hidden in the public version.
  assert.match(html, /class="f-pane lab-funding-pane pv-hide" id="pane-dca-rec" data-pane="dca" data-sub="timing"/);
  const dca = src('dca-tab.js');
  assert.match(dca, /<th class="pv-hide">Screening result<\/th>/);
  assert.match(dca, /\.\.\.\(isPublic\(\) \? \[\] : \['Screening result', 'Why'\]\)/, 'CSV drops the screening columns when public');
  assert.match(src('dc-projects.js'), /!\(U\.isPublic && U\.isPublic\(\)\)/, 'public: no funding screen in DC timing');
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
  assert.match(css, /\[data-public\] \.pv-hide \{ display: none !important; \}/);
});
