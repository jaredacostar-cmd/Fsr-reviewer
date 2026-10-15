'use strict';
// SPEC 1.6: one unit basis everywhere. The tree count is the development's units and its
// build-out's planned figure; it reconciles to its files (stated counts plus labelled estimates);
// Growth's "left to build" and Timing's "unbuilt" are one figure, planned − completed.
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../js/growth.js');
const T = require('../js/timing.js');
const TC = require('../js/tree-counts.js');
const H = require('./helpers/real-devs.js');
const skip = !H.available() && 'snapshot not present';

test('every development: its file counts plus labelled estimates add up to its units', { skip }, () => {
  const { projects } = H.realDevs();
  let checked = 0;
  for (const p of projects) {
    if (!p.count || p.count.mode !== 'tree' || !(p.units > 0)) continue;
    const sum = p.count.parts.reduce((t, x) => t + x.units, 0);
    assert.equal(sum, p.units, `${p.key}: parts ${sum} ≠ units ${p.units}`);
    for (const x of p.count.parts) assert.ok(TC.PART_KIND[x.kind], `${p.key}: part kind ${x.kind} has a label`);
    if (p.buildout) assert.equal(p.buildout.planned, p.units, `${p.key}: the build-out plans the tree count`);
    checked++;
  }
  assert.ok(checked > 500, `${checked} developments checked`);
});

test('Brampton|2055 BOVAIRD DR W reconciles: 6,289 + 592 + 52 stated, 2,929 found online (labelled), = 9,862', { skip }, () => {
  const p = H.realDevs().byKey.get('Brampton|2055 BOVAIRD DR W');
  assert.equal(p.units, 9862);
  const by = Object.fromEntries(p.count.parts.map(x => [x.ref, x]));
  assert.deepEqual([by['OZS-2025-0034'].units, by['OZS-2025-0032'].units, by['C05W07.006'].units], [6289, 592, 52]);
  for (const r of ['OZS-2025-0034', 'OZS-2025-0032', 'C05W07.006']) assert.equal(by[r].kind, 'stated');
  assert.equal(by['OZS-2024-0051'].units, 2929);
  assert.equal(by['OZS-2024-0051'].kind, 'online');
  assert.match(by['OZS-2024-0051'].source, /Brampton/);
  assert.equal(TC.estimatedUnits(p), 2929);
  assert.equal(p.buildout.planned, 9862);
  const html = TC.noteHTML(p);
  assert.match(html, /2,929 OZS-2024-0051 <span class="muted">\(found online: /);
  assert.match(html, /<span class="tag">estimate<\/span>/);
  assert.match(html, /= <strong>9,862<\/strong>/);
  assert.doesNotMatch(html, /previous rule/, 'the previous count is only in Settings › Counting');
  // SPEC 1.9: a block of several proposals is titled as a block, naming its draft plans.
  assert.equal(p.title, 'Heritage / Bovaird block · 3 draft plans');
});

test('Growth › Pipeline "left" == Timing "unbuilt" == planned − completed', { skip }, () => {
  const { projects } = H.realDevs();
  const t = G.pipelineTotals(projects);
  assert.equal(t.left, t.planned - t.completed);
  const unbuilt = T.pipelineItems(projects).reduce((s, i) => s + i.units, 0);
  assert.equal(unbuilt, t.left);
});

test('1.7 I&I follows the files counted: the Heritage block is its three draft plans and the old subdivision (≈165 ha)', { skip }, () => {
  const D = require('../js/demand.js');
  const p = H.realDevs().byKey.get('Brampton|2055 BOVAIRD DR W');
  assert.equal(p.siteAreaFrom, 'counted files');
  assert.ok(Math.abs(p.siteAreaHa - 165) < 3, `${p.siteAreaHa} ha`);
  const e = D.estimate([p]);
  assert.match(D.iiText(e.combined.wastewater.infiltration), /^I&I \d+(\.\d)? L\/s over 1[56]\d(\.\d)? ha \(0\.26 L\/s\/ha\)$/);
  assert.equal(D.iiText(0), '');
});

test('SPEC 1.9: an employment site (no units, nothing counted) gets no "Tree count" note', () => {
  assert.equal(TC.noteHTML({ units: 0, count: { mode: 'tree', trees: [], parts: [] } }), '');
  assert.equal(TC.noteHTML({ units: 0, count: { mode: 'tree', trees: [], parts: [], with: 'OZS-1' } }) === '', false, 'kept when counted in another tree');
});

test('SPEC 1.9: an employment site\'s DC room is in people, never units at a persons-per-unit', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'js', 'masterplan.js'), 'utf8');
  assert.match(src, /const ppu = p\.units > 0 \? ppuOf\(p\) : null/);
  assert.match(src, /\$\{ppu \? `<small>≈/);
  assert.match(src, /Room in people at Peel design criteria \(an employment site: no units\)/);
});
