'use strict';
// Step B0 review workbook: pure helpers and the overrides file (the review itself is run by
// scripts/tree-review.js on the snapshot; it is report only and the app is unchanged).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { inParts } = require('../scripts/tree-review.js');

test('point in a block (multi)polygon, holes excluded', () => {
  const sq = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]], hole = [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]];
  assert.equal(inParts(5, 2, [[sq]]), true);
  assert.equal(inParts(5, 5, [[sq, hole]]), false, 'inside the hole');
  assert.equal(inParts(15, 5, [[sq]]), false);
  assert.equal(inParts(15, 5, [[sq], [[[12, 0], [20, 0], [20, 10], [12, 10], [12, 0]]]]), true, 'second part');
});

test('data/tree-overrides.json: every override is keyed by municipality|root file and has units, a reason and a source', () => {
  const o = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tree-overrides.json'), 'utf8'));
  assert.equal(o.version, 1);
  assert.match(o.rules.preconsultationOnlyCount, /never committed/);
  for (const [k, v] of Object.entries(o.overrides)) {
    assert.match(k, /^(Mississauga|Brampton|Caledon)\|\S/, k);
    assert.ok(Number.isFinite(v.units) && v.units >= 0, `${k} units`);
    assert.ok(v.reason && v.source && /^\d{4}-\d{2}-\d{2}$/.test(v.decidedOn), `${k} reason, source, date`);
  }
});

test('the pre-consultation flag is not vacuous: a tree with no stated count is not an estimate', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'tree-review.js'), 'utf8');
  assert.match(src, /c\.units > 0 && stating\.length > 0 && stating\.every\(/);
});

test('bulk calls: your accepted categories accept, the rest ask', () => {
  const { callOf } = require('../scripts/tree-review.js');
  const t = (o = {}) => ({ override: null, ...o });
  const r = o => callOf({ kind: 'count changed', change: 0, treeUnits: 0, flags: [], trees: [t()], ...o });
  assert.equal(r({ kind: 'count found (app had 0)', change: 1946, treeUnits: 1946 }).call, 'Accept');
  assert.equal(r({ kind: 'split: one app development, several trees', change: 991 }).call, 'Accept');
  assert.equal(r({ kind: 'split: one app development, several trees', change: -360 }).call, 'Ask', 'a split that lowers the count by 100+');
  assert.equal(r({ kind: 'count dropped to 0', change: -330 }).call, 'Accept', 'withdrawn file / replacement house');
  assert.equal(r({ kind: 'unchanged', flags: ['estimate (pre-consultation)'], treeUnits: 9961 }).call, 'Ask', 'large pre-consultation estimate, even unchanged');
  assert.equal(r({ kind: 'unchanged', flags: ['estimate (pre-consultation)'], treeUnits: 265 }).call, 'Accept');
  assert.equal(r({ kind: 'merge: one tree over several app developments', change: 2928, flags: ['low-confidence link'] }).call, 'Ask');
  assert.equal(r({ kind: 'count changed', change: -401 }).call, 'Ask');
  assert.equal(r({ kind: 'count changed', change: 40 }).call, 'Accept');
  assert.equal(r({ kind: 'count changed', change: -401, trees: [t({ override: 845 })] }).call, 'Override', 'your override wins');
});
