'use strict';
// Clipping CVC's regulation limit into map tiles (scripts/build-regulation.js).
const test = require('node:test');
const assert = require('node:assert');
const { clipRing, clipSeg, clipEdges } = require('../scripts/build-regulation.js');

const B = { xmin: 0, ymin: 0, xmax: 10, ymax: 10 };
const area = r => Math.abs(r.reduce((t, p, i) => { const q = r[(i + 1) % r.length]; return t + p[0] * q[1] - q[0] * p[1]; }, 0) / 2);

test('a ring inside the tile is kept whole', () => {
  const r = [[2, 2], [8, 2], [8, 8], [2, 8], [2, 2]];
  assert.strictEqual(area(clipRing(r, B)), 36);
});

test('a ring across the tile edge is cut at the edge', () => {
  const r = [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]];
  const c = clipRing(r, B);
  assert.strictEqual(area(c), 25);
  assert.ok(c.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10));
});

test('a ring outside the tile clips to nothing', () => {
  assert.strictEqual(clipRing([[20, 20], [30, 20], [30, 30], [20, 20]], B).length, 0);
});

test('a ring covering the tile fills it', () => {
  assert.strictEqual(area(clipRing([[-5, -5], [15, -5], [15, 15], [-5, 15], [-5, -5]], B)), 100);
});

test('segments are clipped to the tile; outside ones are dropped', () => {
  assert.deepStrictEqual(clipSeg([-5, 5], [5, 5], B), [[0, 5], [5, 5]]);
  assert.strictEqual(clipSeg([-5, -5], [-1, 20], B), null);
});

test('outline edges stop at the tile border and carry no tile-border segments', () => {
  const r = [[5, 5], [15, 5], [15, 15], [5, 15], [5, 5]];
  const lines = clipEdges(r, B);
  // The two edges inside: (5,5)->(10,5) and (5,10)->(5,5), joined where they meet.
  const pts = lines.flat();
  assert.ok(pts.every(([x, y]) => x >= 0 && x <= 10 && y >= 0 && y <= 10));
  assert.ok(!pts.some(([x, y]) => x === 10 && y === 10), 'no point at the far tile corner');
  const len = lines.reduce((t, l) => t + l.slice(1).reduce((u, q, i) => u + Math.hypot(q[0] - l[i][0], q[1] - l[i][1]), 0), 0);
  assert.strictEqual(len, 10);
});
