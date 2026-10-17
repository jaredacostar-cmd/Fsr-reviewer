'use strict';
// The management headline: the whole pipeline (the tree total, all years by default), rounded, split
// by whether developments have moved since 2021; the stage bar adds up to it (js/layers.js, ws-pages).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const L = require('../js/layers.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const d = s => ({ date: new Date(`${s}T00:00:00Z`) });

test('moved since 2021: any dated event in 2021 or later; no dated event counts as not moved', () => {
  assert.equal(L.movedSince({ timeline: [d('2019-03-01'), d('2021-01-01')] }), true);
  assert.equal(L.movedSince({ timeline: [d('2018-03-01'), d('2020-12-31')] }), false);
  assert.equal(L.movedSince({ timeline: [] }), false);
  assert.equal(L.movedSince({}), false);
});

test('headline rounding and wording', () => {
  assert.equal(L.roundHeadline(257647), 258000);
  assert.equal(L.roundHeadline(15637), 16000);
  assert.equal(L.roundHeadline(1726), 1700);
  assert.equal(L.roundHeadline(412), 412);
  assert.equal(L.headlineText({ total: 257647, moved: 242010, notMoved: 15637, notBuilt: 230184 }),
    'About 258,000 homes are in the planning pipeline: 242,000 have moved since 2021 and 16,000 haven’t moved since 2020. About 230,000 are not yet built.');
  assert.equal(L.headlineText({ total: 900, moved: 900, notMoved: 0, notBuilt: 700 }, ' (Caledon)'), 'About 900 homes are in the planning pipeline (Caledon). About 700 are not yet built.');
  assert.equal(L.headlineText({ total: 0 }), '');
});

test('pipeline: parts add up; not-built leaves out every completed unit', () => {
  const pl = L.pipeline([]);
  assert.deepEqual([pl.total, pl.moved, pl.notMoved, pl.notBuilt], [0, 0, 0, 0]);
});

test('the default view is all years; the headline leads the Overview and the briefing; the stage bar reconciles', () => {
  assert.match(src('js/timeline.js'), /const DEFAULT_YEARS = null;/);
  assert.match(src('js/overview-tab.js'), /const hl = set\.length \? `\$\{mgmt\}The/);
  assert.match(src('js/reports.js'), /const hl = \[mgmt, `The/);
  const ws = src('js/ws-pages.js');
  assert.match(ws, /completed before the 2021 Census \(already in it\), <strong>\$\{fmtNum\(Math\.round\(st\.total \+ st\.existing\)\)\}<\/strong> in all/);
  assert.match(ws, /class="stg-nm"/);
  // The census baseline stays the 2021 Census with all years (the latest when no years are picked).
  assert.match(src('js/map-census.js'), /if \(!App\(\)\.timeActive\(\) \|\| App\(\)\.state\.yearFrom == null\) return cs\[0\];/);
});
