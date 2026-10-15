'use strict';
// SPEC §2: one stacked-bar component in the layer tokens; hatched = estimated, red hatch = beyond rated.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const B = require('../js/layer-bar.js');

const widths = html => [...html.matchAll(/class="ly-seg ly-(\w+)" style="left:([\d.]+)%;width:([\d.]+)%/g)].map(m => [m[1], +m[2], +m[3]]);

test('segments stack in order, proportional to value', () => {
  const h = B.barHTML({ segments: [{ layer: 'existing', value: 50 }, { layer: 'committed', value: 25 }, { layer: 'proposed', value: 25 }], max: 100 });
  assert.deepEqual(widths(h), [['existing', 0, 50], ['committed', 50, 25], ['proposed', 75, 25]]);
  assert.match(h, /role="img" aria-label="Existing 50, Committed 25, Proposed 25"/);
});

test('rated: grey tick at 100%, white tick at the trigger, red hatch only beyond rated', () => {
  const h = B.barHTML({ segments: [{ layer: 'existing', value: 80 }, { layer: 'proposed', value: 40 }], rated: 100, trigger: 90, max: 125 });
  assert.match(h, /ly-tick ly-rated" style="left:80.00%/);
  assert.match(h, /ly-tick ly-trig" style="left:72.00%/);
  assert.match(h, /ly-over" style="left:80.00%;width:16.00%/);
  assert.doesNotMatch(B.barHTML({ segments: [{ layer: 'existing', value: 50 }], rated: 100 }), /ly-over/);
});

test('estimated portions are hatched at the end of their segment', () => {
  const h = B.barHTML({ segments: [{ layer: 'proposed', value: 100, est: 30 }], max: 100 });
  assert.match(h, /class="ly-est" style="left:70.00%;width:30.00%/);
});

test('zero or unknown layers draw nothing; values escape in tooltips', () => {
  const h = B.barHTML({ segments: [{ layer: 'built', value: 0 }, { layer: 'nope', value: 5 }, { layer: 'committed', value: 5, title: '<b>x</b>' }] });
  assert.equal(widths(h).length, 1);
  assert.match(h, /title="&lt;b&gt;x&lt;\/b&gt;"/);
});

test('the site badge: phase and layer together, with what is left to permit', () => {
  assert.match(B.badgeHTML('5 · under construction', { layer: 'committed', units: 537, toPermit: 343 }), /counts as Committed · 343 left/);
  assert.match(B.badgeHTML('2 · under review · zoning approved', { layer: 'proposed', units: 9862, toPermit: 9862 }), /counts as Proposed<\/span>/);
});

test('the tokens exist in css/app.css and the bar uses them', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'app.css'), 'utf8');
  for (const [k, v] of [['existing', '#3b4a5e'], ['built', '#5f7fae'], ['committed', '#9cc0fa'], ['proposed', '#cfe0fb'], ['anticipated', '#cfe0fb']]) assert.match(css, new RegExp(`--ly-${k}: ${v};`), k);
  assert.match(css, /--ly-over: repeating-linear-gradient\(135deg, #f0665f 0 3px, transparent 3px 6px\)/);
  for (const k of ['existing', 'built', 'committed', 'proposed', 'anticipated']) assert.match(css, new RegExp(`\\.ly-${k} \\{ background: var\\(--ly`), k);
});

test('scenario chip: the basis is a set of layers (Existing + Built always)', () => {
  assert.deepEqual(B.layersOf('committed'), ['existing', 'built', 'committed']);
  assert.deepEqual(B.layersOf('buildout'), ['existing', 'built', 'committed', 'proposed']);
  assert.deepEqual(B.layersOf('all'), ['existing', 'built', 'committed', 'proposed', 'anticipated']);
  assert.equal(B.nextBasis('all', 'proposed'), 'committed', 'untick Proposed → the D-5-1 check');
  assert.equal(B.nextBasis('committed', 'proposed'), 'buildout', 'tick Proposed → build-out');
  assert.equal(B.nextBasis('buildout', 'anticipated'), 'all', 'tick Anticipated → stress test');
  assert.equal(B.nextBasis('all', 'anticipated'), 'buildout');
  assert.equal(B.nextBasis('committed', 'committed'), 'committed', 'Committed stays on');
  const h = B.scenarioChipHTML({ basis: 'buildout', flows: '2025 metered', criteria: 'Peel v2.0', count: 'tree', expansions: 'on', outside: 'nearest' });
  assert.match(h, /data-scen-layer="proposed" aria-pressed="true"/);
  assert.match(h, /data-scen-layer="anticipated" aria-pressed="false"/);
  assert.match(h, /= build-out/);
  assert.match(h, /Flows: 2025 metered · Criteria: Peel v2.0 · Count: tree · Expansions: on · Outside zones: nearest/);
  assert.doesNotMatch(h, /data-scen-layer="existing"/, 'Existing is not a toggle');
});

test('the buildout basis counts every layer applied for, without Anticipated', () => {
  const D = require('../js/demand.js');
  assert.equal(D.unitsFor({ phase: 'inception', units: 100 }, 'buildout'), 0);
  assert.equal(D.unitsFor({ phase: 'review', units: 100 }, 'buildout'), 100);
  assert.equal(D.unitsFor({ phase: 'cancelled', units: 100 }, 'buildout'), 0);
  assert.equal(D.unitsFor({ phase: 'inception', units: 100 }, 'all'), 100);
});

test('one scenario line: the chip in the top bar; no footer line, no in-tab copy', () => {
  const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  assert.match(read('js/topbar.js'), /PeelLayerBar\.scenarioChipHTML\(/);
  assert.doesNotMatch(read('js/svc-tab.js'), /data-scen-t|const scenarioChip/);
  assert.match(read('css/app.css'), /\.footer > \.scen-bar \{ display: none; \}/);
});
