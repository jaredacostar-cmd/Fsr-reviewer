'use strict';
// js/profile-core.js: the ground profile's arithmetic (Part 1 of the measure / 3D / Time Box brief).
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/profile-core.js');

const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('sample spacing: at least 5 m and the pixel, at most 600 samples', () => {
  assert.equal(C.spacing(100), 5);
  assert.equal(C.spacing(100, 7), 7);
  assert.equal(C.spacing(12000, 0.5), 20);
  const line = [{ lat: 43.6, lng: -79.7 }, { lat: 43.6, lng: -79.5 }];   // ~16 km
  const s = C.samplePoints(line, 0.5);
  assert.ok(s.length <= 600 && s.length >= 590, `${s.length}`);
  near(s[0].d, 0); near(s[s.length - 1].lng, -79.5);
  const short = C.samplePoints([{ lat: 43.6, lng: -79.7 }, { lat: 43.6, lng: -79.6995 }], 0.5);   // ~40 m
  assert.ok(Math.abs(short[1].d - short[0].d) >= 5 - 1e-9);
});

test('bilinear: a plane is reproduced exactly, including across a tile edge', () => {
  // A raster whose value is a plane in global pixel coordinates: v = 2·X + 3·Y.
  const size = 256, read = (tx, ty, px, py) => 2 * (tx * size + px) + 3 * (ty * size + py);
  const z = 14;
  for (const [lat, lng] of [[43.6, -79.7], [43.71234, -79.81234]]) {
    const { X, Y } = C.pixelPos(lat, lng, z);
    near(C.bilinear(C.bilinearTaps(lat, lng, z), read), 2 * X + 3 * Y, 1e-6);
  }
  // A point whose four neighbours straddle two tiles (global X just below a multiple of 256).
  const n = 2 ** z, lng = ((4578 * 256 + 255.9) / (n * 256)) * 360 - 180;
  const taps = C.bilinearTaps(43.6, lng, z);
  assert.equal(new Set(taps.map(t => t.tx)).size, 2, 'neighbour tile used');
  const { X, Y } = C.pixelPos(43.6, lng, z);
  near(C.bilinear(taps, read), 2 * X + 3 * Y, 1e-6);
  near(taps.reduce((t, k) => t + k.w, 0), 1);
  assert.ok(C.tilesFor([{ lat: 43.6, lng }], z).length >= 2);
});

test('bilinear removes stair steps: values vary smoothly between pixel centres', () => {
  const read = (tx, ty, px) => (px % 2 ? 10 : 0);   // alternating columns
  const vals = [0, 0.25, 0.5, 0.75].map(f => { const z = 14, n = 2 ** z; const lng = ((4578 * 256 + 100.5 + f) / (n * 256)) * 360 - 180; return C.bilinear(C.bilinearTaps(43.6, lng, z), read); });
  assert.ok(vals.every((v, i) => i === 0 || Math.abs(v - vals[i - 1]) <= 2.6), JSON.stringify(vals));
});

test('terrarium decoding', () => { assert.equal(C.terrarium(128, 0, 0), 0); near(C.terrarium(128, 200, 128), 200.5); });

test('manholes: invert + published depth; depths ≤ 0.5 m or ≥ 15 m and force mains are not used', () => {
  const mains = [
    { id: 'A', g: [[-79.7, 43.6], [-79.699, 43.6]], up: 150, dn: 149, dUp: 3, dDn: 0.4 },
    { id: 'B', g: [[-79.699, 43.6], [-79.698, 43.6]], up: 148.8, dn: 148, dUp: 4, dDn: 15 },
    { id: 'FM', g: [[-79.69, 43.6], [-79.68, 43.6]], up: 150, dn: 149, dUp: 3, dDn: 3, fm: true },
  ];
  const mh = C.manholesFromMains(mains);
  assert.deepEqual(mh.map(m => [m.id, m.end, m.ground]), [['A', 'up', 153], ['B', 'up', 152.8]]);
  assert.equal(C.depthOk(0.5), false); assert.equal(C.depthOk(15), false); assert.equal(C.depthOk(2), true);
});

test('manholes are matched only within 15 m of the line, with their distance along it', () => {
  const prof = C.samplePoints([{ lat: 43.6, lng: -79.7 }, { lat: 43.6, lng: -79.69 }]);
  const onLine = { id: 'x', lat: 43.6, lng: -79.695, ground: 150 }, off10 = { id: 'y', lat: 43.6 + 10 / 110574, lng: -79.697, ground: 150 }, off20 = { id: 'z', lat: 43.6 + 20 / 110574, lng: -79.696, ground: 150 };
  const m = C.matchManholes(prof, [onLine, off10, off20]);
  assert.deepEqual(m.map(x => x.id).sort(), ['x', 'y']);
  const x = m.find(v => v.id === 'x'); assert.ok(Math.abs(x.d - prof[prof.length - 1].d / 2) < 2);
});

test('correction: interpolated between manholes ≤ 150 m apart, never extrapolated; raw value kept', () => {
  const prof = Array.from({ length: 41 }, (_, i) => ({ d: i * 10, z: 100 }));   // flat DEM, 0–400 m
  const mh = [{ id: 'a', d: 50, ground: 101 }, { id: 'b', d: 150, ground: 103 }, { id: 'c', d: 350, ground: 99 }];
  const r = C.correct(prof, mh);
  const at = d => r.prof.find(p => p.d === d);
  near(at(50).z, 101); near(at(100).z, 102); near(at(150).z, 103);   // a–b: 100 m apart, interpolated
  assert.equal(at(100).corrected, true); assert.equal(at(100).zRaw, 100);
  assert.equal(at(250).corrected, false, 'b–c are 200 m apart: not corrected'); near(at(250).z, 100);
  assert.equal(at(0).corrected, false, 'no extrapolation before the first manhole'); near(at(0).z, 100);
  assert.equal(at(400).corrected, false, 'no extrapolation after the last'); near(at(400).z, 100);
  assert.deepEqual(r.spans.map(s => [s.from, s.to]), [[50, 150]]);
  assert.deepEqual(r.manholes.map(m => m.offset), [1, 3, -1]);
});

test('correction applies a datum shift to the manhole ground, never silently', () => {
  const prof = Array.from({ length: 11 }, (_, i) => ({ d: i * 10, z: 100 }));
  const r = C.correct(prof, [{ d: 0, ground: 100.4 }, { d: 100, ground: 100.4 }], { shift: -0.4 });
  near(r.prof[5].z, 100); near(r.manholes[0].groundAdj, 100);
});

test('grades per leg, shallow runs, vertical exaggeration', () => {
  const prof = [{ d: 0, z: 100, leg: 0 }, { d: 50, z: 99, leg: 0 }, { d: 100, z: 98, leg: 0, san: { inv: 96.5 } }, { d: 100, z: 98, leg: 1, san: { inv: 96.5 } }, { d: 200, z: 100, leg: 1, san: { inv: 95 } }];
  const g = C.legGrades(prof);
  near(g[0].grade, -0.02); near(g[1].grade, 0.02);
  assert.deepEqual(C.shallowRuns(prof), [{ from: 100, to: 100 }]);
  assert.deepEqual(C.shallowRuns(prof, 6), [{ from: 100, to: 200 }]);
  near(C.exaggeration(300, 100, 1000, 10), (100 / 10) / (300 / 1000));
});

test('CSV: the stated columns, corrected samples marked, depth only under a gravity main', () => {
  const prof = [{ d: 0, lat: 43.6, lng: -79.7, z: 101.234, zRaw: 100.5, source: 'lidar', corrected: true, san: { inv: 98, fm: false }, wat: { d: 300 } }, { d: 5, lat: 43.6, lng: -79.69994, z: 100, source: 'terrain' }];
  const csv = C.toCSV(prof, '# indicative\n').split('\n');
  assert.equal(csv[0], '# indicative');
  assert.equal(csv[1], 'd,lat,lng,ground,ground_raw,source,invert,depth,watermain_flag');
  assert.equal(csv[2], '0.0,43.600000,-79.700000,101.23,100.50,lidar+manhole,98.00,3.23,1');
  assert.equal(csv[3], '5.0,43.600000,-79.699940,100.00,100.00,terrain,,,0');
});

test('sewer slopes: % per pipe, adverse flagged, ground only from published depths', () => {
  const s = C.sewerSlopes([{ id: 'p1', up: 150, dn: 149, len: 100, dUp: 3, dDn: 3.2 }, { id: 'p2', up: 149, dn: 149.2, len: 50, dUp: 0.3, dDn: 2 }]);
  near(s[0].slope, 1); assert.equal(s[0].adverse, false); near(s[0].groundUp, 153);
  near(s[1].slope, -0.4); assert.equal(s[1].adverse, true); assert.equal(s[1].groundUp, null, 'depth ≤ 0.5 m not used');
  assert.equal(s[1].from, 100);
});

test('validation stats and the accuracy label come from the table, never hard-coded', () => {
  const st = C.validationStats([-0.2, 0.1, 0.3, -0.6, 1.2]);
  assert.deepEqual(st, { n: 5, median: 0.1, medianAbs: 0.3, within05: 60, within1: 80 });
  const table = { areas: { cooksville: { name: 'Cooksville', bbox: [-79.65, 43.57, -79.6, 43.6], rows: { lidar: { n: 40, medianAbs: 0.18 }, terrain: { n: 40, medianAbs: 1.4 } } } } };
  const l = C.accuracyLabel(table, 43.58, -79.62, 'lidar', { project: 'GTA 2023', year: 2023 });
  assert.match(l.text, /typically within 0\.18 m of Peel manholes in Cooksville \(median of 40, lidar flown 2023\)/);
  assert.match(C.accuracyLabel(table, 43.58, -79.62, 'terrain').text, /within 1\.4 m/);
  assert.match(C.accuracyLabel(table, 43.9, -79.9, 'lidar').text, /No validation against Peel manholes for this area/);
  assert.match(C.accuracyLabel({ areas: { c: { name: 'C', bbox: [-80, 43, -79, 44], rows: {} } } }, 43.5, -79.5, 'lidar').text, /No validation .* the lidar in C/);
});
