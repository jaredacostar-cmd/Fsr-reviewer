'use strict';
/* Needs-attention card tests (Phase 4, Worker B): the pure needsAttention derivation
 * extracted from js/app.js, plus structural assertions that renderOverview follows the
 * Phase 4 Overview structure (headline → tiles → Needs attention → one chart → one
 * top-N table → one ⓘ line) and dropped the cards that moved to the Growth tab.
 *
 * js/app.js is a browser IIFE, so — as in tests/verdict.test.js — these tests read
 * it as source: structural assertions plus real unit tests of the pure logic extracted
 * from it (needsAttention).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Phase 6: js/app.js was split into js/util.js + 46 area modules. Structural
// assertions read the whole js/ tree (app core + modules) as one source.
const JS_DIR = path.join(__dirname, '..', 'js');
const APP = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');

// Extract a `const name = (args) => { ... };` and evaluate it standalone (pure only).
function extractFn(name) {
  const m = new RegExp(`const ${name} = (\\([\\s\\S]*?\\n  \\});`).exec(APP);
  assert.ok(m, `const ${name} not found in js/`);
  return new Function(`return (${m[1]});`)();
}

const needsAttention = extractFn('needsAttention');

test('needsAttention: empty input gives no items', () => {
  assert.deepEqual(needsAttention({}), []);
  assert.deepEqual(needsAttention({ adv: [], trig: [], stalled: [], changes: [] }), []);
});

test('needsAttention: DC projects that run out before relief come first, bad tone, dca tab', () => {
  const items = needsAttention({ adv: [{ name: 'Main A' }, { name: 'Main B' }] });
  assert.equal(items.length, 1);
  assert.equal(items[0].tone, 'bad');
  assert.equal(items[0].tab, 'dca');
  assert.equal(items[0].dev, null);
  assert.match(items[0].text, /2 DC projects come online after the capacity they relieve runs out/);
  assert.match(items[0].text, /Main A; Main B/);
});

test('needsAttention: one late project uses singular wording; many are capped at 3 names', () => {
  const one = needsAttention({ adv: [{ name: 'Main A' }] });
  assert.match(one[0].text, /1 DC project comes online after the capacity it relieves runs out: Main A/);
  const many = needsAttention({ adv: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }, { name: 'E' }] });
  assert.match(many[0].text, /5 DC projects/);
  assert.match(many[0].text, /A; B; C \(\+2 more\)/);
});

test('needsAttention: 90% trigger constraints map sys to tab, now is bad, later is warn', () => {
  const items = needsAttention({ trig: [
    { sys: 'ww', now: true, text: 'G.E. Booth is at its 90% expansion trigger now' },
    { sys: 'water', now: false, text: 'South Peel water treatment reaches its 90% expansion trigger ≈2034' },
  ] });
  assert.equal(items.length, 2);
  assert.equal(items[0].tone, 'bad');
  assert.equal(items[0].tab, 'ww');
  assert.equal(items[1].tone, 'warn');
  assert.equal(items[1].tab, 'water');
});

test('needsAttention: stalled large sites are filtered to 250+ units, largest first, capped at 3', () => {
  const stalled = [
    { key: 's', title: 'Small', muni: 'Mississauga', units: 100, unitsTxt: '100', years: '2.5 yrs' },
    { key: 'b', title: 'Big', muni: 'Brampton', units: 1200, unitsTxt: '1,200', years: '3.1 yrs' },
    { key: 'm', title: 'Mid', muni: 'Caledon', units: 400, unitsTxt: '400', years: '2.2 yrs' },
    { key: 'x', title: 'Xl', muni: 'Mississauga', units: 2000, unitsTxt: '2,000', years: '4.0 yrs' },
    { key: 'y', title: 'Yl', muni: 'Brampton', units: 900, unitsTxt: '900', years: '2.8 yrs' },
  ];
  const items = needsAttention({ stalled });
  assert.equal(items.length, 3, 'small site dropped, capped at 3');
  assert.deepEqual(items.map(i => i.dev), ['x', 'b', 'y'], 'largest first');
  assert.equal(items[0].tone, 'warn');
  assert.match(items[0].text, /Stalled 4\.0 yrs with no activity — Xl \(2,000 units, Mississauga\)/);
});

test('needsAttention: changes this week are capped at 4 and link to the development', () => {
  const changes = Array.from({ length: 6 }, (_, i) => ({ key: `k${i}`, text: `Change ${i}` }));
  const items = needsAttention({ changes });
  assert.equal(items.length, 4);
  assert.equal(items[0].tone, 'ok');
  assert.equal(items[0].tab, null);
  assert.equal(items[0].dev, 'k0');
});

test('needsAttention: display order is advance, trigger, stalled, changes', () => {
  const items = needsAttention({
    changes: [{ key: 'c', text: 'New: Foo' }],
    stalled: [{ key: 's', title: 'S', muni: 'M', units: 300, unitsTxt: '300', years: '2.1 yrs' }],
    trig: [{ sys: 'ww', now: false, text: 'Clarkson reaches its 90% expansion trigger ≈2031' }],
    adv: [{ name: 'Main A' }],
  });
  assert.deepEqual(items.map(i => i.tab || i.dev), ['dca', 'ww', 's', 'c']);
});

test('renderOverview: Phase 4 structure and removed cards', () => {
  // Bound to this worker's region: renderOverview through the #ov-body click listener.
  const start = APP.indexOf('function renderOverview(set, e, basis)');
  const body = APP.slice(start, APP.indexOf('function scopeText()', start));
  // New structure present.
  assert.match(body, /Needs attention/, 'Needs-attention card heading');
  assert.match(body, /const nd = needsAttentionData\(set, capList\), na = DV\(\)\.needsAttention\(nd\), groups = DV\(\)\.needsGroups\(nd\);/, 'needsAttention wired to DCA/stalled/trigger/change data, grouped (SPEC §5)');
  assert.match(body, /\$\{topDevsHTML\(set, basis\)\}/, 'top-N developments table rendered');
  assert.match(APP, /See all →/, '"See all" link');
  assert.match(APP, /Largest developments/, 'top-N developments table heading');
  assert.match(body, /ov-info/, 'ⓘ line');
  // Capacity bars: the shared layer bar (SPEC §2) with the 90% trigger and 100% rated ticks.
  assert.match(APP, /LB\(\)\.capacityBarHTML\(k\)/, 'Overview bars use the shared layer bar');
  assert.match(APP, /class="ly-tick ly-trig"/, '90% trigger tick kept');
  assert.match(APP, /class="ly-tick ly-rated"/, '100% rated tick kept');
  // Removed from Overview: housing, outlook, demand-by-phase, DC card, tools line.
  assert.doesNotMatch(body, /housingCardHTML\(\)/, 'housing targets card removed');
  assert.doesNotMatch(body, /outlookCardHTML\(\)/, 'population outlook card removed');
  assert.doesNotMatch(body, /Servicing demand by phase/, 'demand-by-phase section removed');
  assert.doesNotMatch(body, /ov-dc/, 'DC program card removed');
  assert.doesNotMatch(body, /every tool lives on the map's tool rail/, 'tools note removed');
});
