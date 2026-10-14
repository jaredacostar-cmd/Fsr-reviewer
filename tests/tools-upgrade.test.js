'use strict';
/* Phase 3b tool 6 tests: the pure helpers in js/tools-upgrade.js —
 * manningLs, routeFrom and pipeXY. */
const test = require('node:test');
const assert = require('node:assert/strict');

const { manningLs, routeFrom, pipeXY } = require('../js/tools-upgrade.js');

test('manningLs matches Manning full-pipe for a 300 mm pipe at 1%', () => {
  // Hand-computed: (1/0.013) · A · R^(2/3) · √S, A = π·0.3²/4, R = 0.075, S = 0.01.
  const d = 0.3, S = 0.01;
  const expected = 1000 * (1 / 0.013) * (Math.PI * d * d / 4) * Math.pow(d / 4, 2 / 3) * Math.sqrt(S);
  assert.ok(Math.abs(manningLs(300, S) - expected) < 1e-9);
  assert.ok(manningLs(300, 0.01) > 90 && manningLs(300, 0.01) < 105, `got ${manningLs(300, 0.01)}`);
});

test('manningLs scales with diameter and slope', () => {
  const q300 = manningLs(300, 0.01), q600 = manningLs(600, 0.01);
  assert.ok(q600 > q300 * 5 && q600 < q300 * 7, '≈ D^(8/3)'); // (2)^(8/3) ≈ 6.35
  assert.ok(Math.abs(manningLs(300, 0.04) / q300 - 2) < 1e-9, '√S scaling');
});

test('manningLs returns 0 for non-positive slope', () => {
  assert.equal(manningLs(300, 0), 0);
  assert.equal(manningLs(300, -0.01), 0);
});

test('routeFrom follows downstream links to the plant', () => {
  // pipes[i][3] = next pipe downstream; -1 ends the route.
  const pipes = [[300, 0.01, 90, 1], [450, 0.01, 200, 2], [600, 0.008, 350, -1]];
  assert.deepEqual(routeFrom(pipes, 0), [0, 1, 2]);
  assert.deepEqual(routeFrom(pipes, 2), [2]);
});

test('routeFrom is safe on cycles and bad indices', () => {
  const pipes = [[300, 0.01, 90, 1], [450, 0.01, 200, 0]];
  assert.deepEqual(routeFrom(pipes, 0), [0, 1]);
  assert.deepEqual(routeFrom(pipes, 5), []);
  assert.deepEqual(routeFrom(pipes, -1), []);
});

test('pipeXY pairs the flat coordinate array', () => {
  const p = []; p[10] = [-79.7, 43.6, -79.69, 43.61];
  assert.deepEqual(pipeXY(p), [[-79.7, 43.6], [-79.69, 43.61]]);
  assert.deepEqual(pipeXY([]), []);
});
