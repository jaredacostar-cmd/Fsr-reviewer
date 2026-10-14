'use strict';
/* Phase 4 "Tightest pipes": js/tightpipes.js topTightPipes — the top-N pipes by
 * % of full capacity at build-out shown in Wastewater › Plants. No DOM: safe to
 * require directly.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { topTightPipes } = require('../js/tightpipes.js');

const e = (i, r1) => ({ i, r1, mm: 600 });

test('ranks highest load ratio first and caps at n', () => {
  const inList = [e(0, 0.4), e(1, 1.2), e(2, 0.9), e(3, 0.1)];
  const top = topTightPipes(inList, 2);
  assert.deepEqual(top.map(x => x.i), [1, 2]);
});

test('defaults to the top 10', () => {
  const inList = Array.from({ length: 25 }, (_, i) => e(i, (i + 1) / 100));
  const top = topTightPipes(inList);
  assert.equal(top.length, 10);
  assert.equal(top[0].i, 24);
  assert.equal(top[9].i, 15);
});

test('skips pipes whose capacity is not trusted (null, NaN, Infinity)', () => {
  const inList = [e(0, null), e(1, NaN), e(2, Infinity), e(3, 0.5), e(4, -Infinity), null, undefined];
  const top = topTightPipes(inList, 10);
  assert.deepEqual(top.map(x => x.i), [3]);
});

test('ties break by pipe index for a stable order', () => {
  const inList = [e(7, 0.8), e(2, 0.8), e(5, 0.8)];
  assert.deepEqual(topTightPipes(inList, 10).map(x => x.i), [2, 5, 7]);
});

test('returns fewer than n when fewer pipes qualify', () => {
  assert.deepEqual(topTightPipes([e(0, 0.3)], 10).map(x => x.i), [0]);
  assert.deepEqual(topTightPipes([], 10), []);
});

test('bad input returns an empty list', () => {
  assert.deepEqual(topTightPipes(null, 10), []);
  assert.deepEqual(topTightPipes('x', 10), []);
  assert.deepEqual(topTightPipes([e(0, 0.5)], 0), []);
  assert.deepEqual(topTightPipes([e(0, 0.5)], -3), []);
});

test('does not mutate the input array', () => {
  const inList = [e(0, 0.2), e(1, 0.9), e(2, 0.5)];
  const before = inList.map(x => x.i);
  topTightPipes(inList, 2);
  assert.deepEqual(inList.map(x => x.i), before);
});

test('keeps the entry objects intact (caller adds display fields)', () => {
  const inList = [{ i: 4, r1: 1.05, mm: 900, plant: 'Lakeview', q: 321 }];
  const [one] = topTightPipes(inList, 10);
  assert.equal(one.mm, 900);
  assert.equal(one.plant, 'Lakeview');
});
