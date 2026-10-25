'use strict';
// Smoother: the work a filter change, a site and start-up do is done once, out of sight when it can
// wait, and the caches on the hot paths give the same answers as the code without them.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('PeelUtil.later: one view per task, the latest per key, all at once on flushLater', async () => {
  const U = require('../js/util.js'), ran = [];
  U.later('a', () => ran.push('a1'));
  U.later('b', () => ran.push('b'));
  U.later('a', () => ran.push('a2'));   // replaces the waiting one, keeps its place
  U.later('c', () => ran.push('c'));
  assert.equal(U.laterPending(), 3);
  assert.equal(U.cancelLater('c'), true);
  await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(ran, ['a2'], 'one per task');
  U.flushLater();
  assert.deepEqual(ran, ['a2', 'b']);
  assert.equal(U.laterPending(), 0);
  // A view that throws doesn't stop the others.
  const err = console.error; console.error = () => {};
  try { U.later('x', () => { throw new Error('boom'); }); U.later('y', () => ran.push('y')); U.flushLater(); } finally { console.error = err; }
  assert.deepEqual(ran, ['a2', 'b', 'y']);
});

test('pointInRings: the bounding box first, the same answers as the plain ray test', () => {
  const P = require('../js/phases.js');
  const plain = (x, y, rings) => rings.some(r => { let inside = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; } return inside; });
  // An L shape and a far square, points inside, outside, on edges and on the box's edges.
  const rings = [[[0, 0], [4, 0], [4, 1], [1, 1], [1, 3], [0, 3], [0, 0]], [[10, 10], [11, 10], [11, 11], [10, 11], [10, 10]]];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pts = [[0, 0], [4, 1], [0.5, 2], [2, 2], [4, 0.5], [0, 3], [10.5, 10.5], [11, 11], [5, 5], [-1, 0]];
  for (let i = 0; i < 2000; i++) pts.push([rnd() * 13 - 1, rnd() * 13 - 1]);
  for (const [x, y] of pts) assert.equal(P.pointInRings(x, y, rings), plain(x, y, rings), `${x}, ${y}`);
});

test('locate: kept per list and point, the same ids, a fresh copy each time', () => {
  const A = require('../js/areas.js');
  const list = A.prepare([{ id: 'a', municipality: 'Brampton', rings: [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]] }, { id: 'b', municipality: 'Caledon', rings: [[[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]] }]);
  assert.deepEqual(A.locate(list, 1.5, 1.5), ['a', 'b']);
  const r = A.locate(list, 1.5, 1.5); r.push('x');
  assert.deepEqual(A.locate(list, 1.5, 1.5), ['a', 'b'], 'a caller changing its answer changes nothing');
  assert.deepEqual(A.locate(list, 1.5, 1.5, 'Caledon'), ['b'], 'the municipality is part of the key');
  assert.deepEqual(A.locate(list, 5, 5), []);
  assert.deepEqual(A.locate(list, null, 1), []);
  // A list that grew is located afresh.
  list.push(...A.prepare([{ id: 'c', municipality: 'Brampton', rings: [[[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]]] }]));
  assert.deepEqual(A.locate(list, 5, 5), ['c']);
});

test('normalizeAddress: the same canonical form, kept per address', () => {
  const P = require('../js/phases.js');
  for (const a of ['1203-55 Main St, Brampton ON', '0 HERITAGE ROAD', '  12  Queen Street East ', null, '']) assert.equal(P.normalizeAddress(a), P.normalizeAddress(a));
  assert.equal(P.normalizeAddress('1203-55 Main Street, Brampton ON'), P.normalizeAddress('55 MAIN ST'));
});

test('wired: the servicing model only when its inputs change; hidden Growth views later; one start-up build', () => {
  const st = src('js/svc-tab.js');
  assert.match(st, /function ensureSvcModel\(o = \{\}\) \{\n    if \(!\(App\(\)\.state\.svcModel && wide && renderSvcTab\.key != null && renderSvcTab\.key === modelKey\(\)\)\) \{ renderSvcTab\(\); return; \}/);
  assert.match(st, /svcIdx = indexSvc\(\);\n    try \{ buildSvcTab\(bc\); \} finally \{ svcIdx = null; \}/, 'the developments indexed by area for one build');
  for (const f of ['js/census-view.js', 'js/timing.js']) assert.match(src(f), /SvcTab\(\)\.ensureSvcModel\(\)/, f);
  assert.doesNotMatch(src('js/census-view.js') + src('js/timing.js'), /SvcTab\(\)\.renderSvcTab\(\)/, 'no view rebuilds the model just to read it');
  const g = src('js/growth-ui.js');
  for (const k of ['growth:pipeline', 'growth:timing', 'growth:plans', 'growth:census']) assert.ok(g.includes(`run('${k}'`), k);
  assert.match(src('js/panel.js'), /const get = key => \{ if \(root\.PeelUtil && root\.PeelUtil\.flushLater\) root\.PeelUtil\.flushLater\(\);/, 'panels read by pages render first');
  assert.match(src('js/exports.js'), /function panelTableRows\(panels\) \{\n    if \(window\.PeelUtil && window\.PeelUtil\.flushLater\) window\.PeelUtil\.flushLater\(\);/, 'the workbook reads rendered views');
  const app = src('js/app.js');
  assert.match(app, /if \(indexPainted && !fullLoaded\) return;\n[\s\S]{0,260}clearTimeout\(rebuildTimer\);/, 'a rebuild cancels the one waiting');
  assert.match(app, /await Promise\.race\(\[treeCountsLoad, new Promise\(r => setTimeout\(r, 20000\)\)\]\);\n        finishFull\(\);/);
  assert.match(app, /applyFilters\.deferGrowth = true;\n    try \{ applyFilters\(\); \} finally \{ applyFilters\.deferGrowth = false; \}/);
});

test('phone: the map\'s way back sits above the bottom sheet, where it can be tapped', () => {
  assert.match(src('css/app.css'), /@media \(max-width: 700px\) \{ \.back-bar \{ left: var\(--space-2\); top: auto; bottom: calc\(var\(--space-2\) \+ var\(--sheet-h, 56px\)\); \}/);
  const app = src('js/app.js');
  assert.match(app, /document\.documentElement\.style\.setProperty\('--sheet-h', `\$\{analysisSnapPx\(name\)\}px`\);/);
  assert.match(app, /analysisEl\.style\.setProperty\('--analysis-h', v\); document\.documentElement\.style\.setProperty\('--sheet-h', v\);/, 'while dragged too');
  // At full the sheet stops under the bar while it shows (a kept Inquiry draft opens the sheet full), and
  // the full height is worked out again when the bar comes or goes.
  assert.match(app, /const back = document\.querySelector\('#back-bar:not\(\[hidden\]\)'\), backH = back \? Math\.round\(back\.getBoundingClientRect\(\)\.height\) \+ 8 : 0;\n\s+if \(name === 'full'\) return Math\.max\(240, Math\.round\(vh - footH - topB - backH\) - 8\);/);
  const rb = src('js/workspaces.js'), i = rb.indexOf('  function renderBack() {');
  assert.match(rb.slice(i, rb.indexOf('\n  }\n', i)), /bar\.hidden = !on;[\s\S]+const A = App\(\); if \(A && A\.getAnalysisSnap && A\.getAnalysisSnap\(\) === 'full'\) A\.setAnalysisSnap\('full', false\);$/);
});

test('the Census view switches tab only when its pane comes or goes (it can render after a tab change)', () => {
  const cv = src('js/census-view.js');
  assert.match(cv, /if \(gcPane && gcPane\.dataset\.off !== off\) \{ gcPane\.dataset\.off = off; AT\(\)\.refreshFootTab\(\); \}/);
  assert.doesNotMatch(cv, /\n    AT\(\)\.showFootTab\(AT\(\)\.getFootPref\(\)\);\n/, 'no unconditional switch back to the remembered tab');
});
