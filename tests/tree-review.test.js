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
