'use strict';
/* Phase 3b "Show upstream" pure logic: js/upstream.js upstreamIdsOf —
 * the downstream-chain closure used for blocks (js/app.js blockNet) and,
 * by the same shape, catchment chains. No DOM: safe to require directly.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { upstreamIdsOf } = require('../js/upstream.js');

const intoOf = into => id => (id in into ? into[id] : null);

test('collects every id whose chain passes through the target', () => {
  // A → B → C → plant, D → B, E → D
  const into = intoOf({ A: 'B', B: 'C', C: null, D: 'B', E: 'D' });
  assert.deepEqual(upstreamIdsOf(['A', 'B', 'C', 'D', 'E'], into, 'B'), ['A', 'D', 'E']);
  assert.deepEqual(upstreamIdsOf(['A', 'B', 'C', 'D', 'E'], into, 'C'), ['A', 'B', 'D', 'E']);
});

test('head-of-system block has no upstream; the target itself is excluded', () => {
  const into = intoOf({ A: 'B', B: null });
  assert.deepEqual(upstreamIdsOf(['A', 'B'], into, 'A'), []);
  assert.deepEqual(upstreamIdsOf(['A', 'B'], into, 'B'), ['A']);
});

test('disconnected branches are not picked up', () => {
  const into = intoOf({ A: 'B', B: null, X: 'Y', Y: null });
  assert.deepEqual(upstreamIdsOf(['A', 'B', 'X', 'Y'], into, 'B'), ['A']);
});

test('a cycle in the data cannot hang the walk', () => {
  const into = intoOf({ A: 'B', B: 'A' });
  assert.deepEqual(upstreamIdsOf(['A', 'B'], into, 'A'), ['B']);
});

test('missing into entries end the chain', () => {
  const into = id => ({ A: 'B' }[id] ?? null);
  assert.deepEqual(upstreamIdsOf(['A', 'B', 'C'], into, 'B'), ['A']);
});
