'use strict';
/* Phase 3b "Corridor select" tool tests: the pure geometry of
 * js/tools-corridor.js (distToSegM, distToPolylineM, corridorContains,
 * bufferRects, lineHitsCorridor, segSegDistM, csvCell). */
const test = require('node:test');
const assert = require('node:assert/strict');

const cor = require('../js/tools-corridor.js');

const near = (got, want, tol, msg) => assert.ok(Math.abs(got - want) <= tol, `${msg || ''} got ${got}, want ${want} ± ${tol}`);

test('distToSegM: perpendicular distance to a horizontal segment', () => {
  // segment 0.01 deg lng long at lat 43.65; point 0.001 deg north of its middle
  const d = cor.distToSegM([-79.7, 43.65], [-79.69, 43.65], [-79.695, 43.651]);
  near(d, 111.32, 0.5, 'perpendicular');
});

test('distToSegM: beyond an endpoint clamps to the endpoint', () => {
  const d = cor.distToSegM([0, 0], [0.001, 0], [0.003, 0]);
  near(d, 2 * 111.32 * Math.cos(0), 1, 'endpoint');
});

test('distToSegM: zero-length segment is distance to the point', () => {
  const d = cor.distToSegM([-79.6, 43.53], [-79.6, 43.53], [-79.6, 43.531]);
  near(d, 111.32, 0.5, 'zero-length');
});

test('distToSegM: point on the segment is zero', () => {
  assert.equal(cor.distToSegM([0, 0], [1, 1], [0.5, 0.5]), 0);
});

test('distToPolylineM: minimum over segments', () => {
  const pts = [[-79.7, 43.65], [-79.69, 43.65], [-79.69, 43.66]];
  const d = cor.distToPolylineM(pts, [-79.685, 43.66]); // 0.005 deg east of 2nd segment
  near(d, 0.005 * 111320 * Math.cos(43.6575 * Math.PI / 180), 2, 'polyline');
});

test('corridorContains: inside / outside / degenerate', () => {
  const centre = [[-79.7, 43.65], [-79.6, 43.65]];
  assert.equal(cor.corridorContains(centre, 125, [-79.65, 43.65]), true);      // on the line
  assert.equal(cor.corridorContains(centre, 125, [-79.65, 43.651]), true);     // ~111 m off, inside 125
  assert.equal(cor.corridorContains(centre, 100, [-79.65, 43.651]), false);     // ~111 m off, outside 100
  assert.equal(cor.corridorContains([[-79.65, 43.65]], 125, [-79.65, 43.65]), false); // < 2 points
  assert.equal(cor.corridorContains(centre, 0, [-79.65, 43.65]), false);       // non-positive width
});

test('bufferRects: one rectangle per segment, 2*halfW across', () => {
  const rects = cor.bufferRects([[-79.7, 43.65], [-79.6, 43.65]], 125);
  assert.equal(rects.length, 1);
  assert.equal(rects[0].length, 4);
  // the two corners at the first vertex are halfW either side of the centreline
  const d0 = cor.distToSegM(rects[0][0], rects[0][3], [-79.7, 43.65]);
  near(d0, 0, 1, 'corners straddle the vertex');
  const across = Math.hypot(
    (rects[0][0][0] - rects[0][3][0]) * 111320 * Math.cos(43.65 * Math.PI / 180),
    (rects[0][0][1] - rects[0][3][1]) * 111320);
  near(across, 250, 2, 'full width');
});

test('bufferRects: zero-length segments are skipped', () => {
  const rects = cor.bufferRects([[-79.7, 43.65], [-79.7, 43.65], [-79.6, 43.65]], 125);
  assert.equal(rects.length, 1);
});

test('segSegDistM: crossing segments are zero, parallels measure the gap', () => {
  assert.equal(cor.segSegDistM([0, 0], [1, 1], [0, 1], [1, 0]), 0);
  const d = cor.segSegDistM([-79.7, 43.65], [-79.6, 43.65], [-79.7, 43.651], [-79.6, 43.651]);
  near(d, 111.32, 0.5, 'parallel gap');
});

test('lineHitsCorridor: a crossing pipe hits, a distant one misses', () => {
  const centre = [[-79.7, 43.65], [-79.6, 43.65]];
  const segs = [[centre[0], centre[1]]];
  const crossing = [[-79.65, 43.64], [-79.65, 43.66]];
  const far = [[-79.5, 43.65], [-79.4, 43.65]];
  assert.equal(cor.lineHitsCorridor(segs, crossing, 250), true);
  assert.equal(cor.lineHitsCorridor(segs, far, 250), false);
});

test('lineHitsCorridor: a near-parallel line just outside the width misses', () => {
  const centre = [[-79.7, 43.65], [-79.6, 43.65]];
  const segs = [[centre[0], centre[1]]];
  // ~167 m north of the centreline, halfW 125 m
  const near_ = [[-79.7, 43.6515], [-79.6, 43.6515]];
  assert.equal(cor.lineHitsCorridor(segs, near_, 125), false);
  assert.equal(cor.lineHitsCorridor(segs, near_, 200), true);
});

test('csvCell: quotes cells containing commas, quotes or newlines', () => {
  assert.equal(cor.csvCell('plain'), 'plain');
  assert.equal(cor.csvCell('a,b'), '"a,b"');
  assert.equal(cor.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(cor.csvCell(null), '');
});

test('WIDTHS: 50–1000 m as specced', () => {
  assert.deepEqual(cor.WIDTHS, [50, 100, 250, 500, 1000]);
});
