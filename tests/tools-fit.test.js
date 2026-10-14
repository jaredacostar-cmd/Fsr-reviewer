'use strict';
/* Phase 3b "How many more units fit?" tool tests: the pure parts of
 * js/tools-fit.js (rankConstraints, peopleToUnits, outText, fmtInt,
 * matchStationAreas). The module is browser code; under node it skips the
 * PeelTools registration (no window) and exports the pure helpers. */
const test = require('node:test');
const assert = require('node:assert/strict');

const fit = require('../js/tools-fit.js');

test('rankConstraints: orders by people ascending, tightest first', () => {
  const { limiting, ranked } = fit.rankConstraints([
    { id: 'plant', label: 'Plant', people: 50000 },
    { id: 'pipe', label: 'Pipe', people: 1200 },
    { id: 'ps', label: 'PS', people: 8000 },
  ]);
  assert.deepEqual(ranked.map(r => r.id), ['pipe', 'ps', 'plant']);
  assert.equal(limiting.id, 'pipe');
});

test('rankConstraints: rows with no usable people figure sort last and never limit', () => {
  const { limiting, ranked } = fit.rankConstraints([
    { id: 'a', label: 'A', people: null },
    { id: 'b', label: 'B', people: 100 },
    { id: 'c', label: 'C' },
    { id: 'd', label: 'D', people: NaN },
  ]);
  assert.deepEqual(ranked.map(r => r.id), ['b', 'a', 'c', 'd']);
  assert.equal(limiting.id, 'b');
  // the _p sort key is stripped from the output rows
  assert.ok(!('._p' in ranked[0]) && !('_p' in ranked[0]));
});

test('rankConstraints: all no-data gives null limiting but keeps the rows', () => {
  const { limiting, ranked } = fit.rankConstraints([
    { id: 'a', label: 'A', people: null },
    { id: 'b', label: 'B', people: null },
  ]);
  assert.equal(limiting, null);
  assert.equal(ranked.length, 2);
});

test('rankConstraints: empty and null input', () => {
  assert.deepEqual(fit.rankConstraints([]), { limiting: null, ranked: [] });
  assert.deepEqual(fit.rankConstraints(null), { limiting: null, ranked: [] });
});

test('rankConstraints: negative people (already over capacity) ranks tightest', () => {
  const { limiting } = fit.rankConstraints([
    { id: 'a', label: 'A', people: 500 },
    { id: 'b', label: 'B', people: -200 },
  ]);
  assert.equal(limiting.id, 'b');
});

test('peopleToUnits: converts at the ppu assumption, rounds, clamps', () => {
  assert.equal(fit.peopleToUnits(2700, 2.7), 1000);
  assert.equal(fit.peopleToUnits(100, 2.7), 37);
  assert.equal(fit.peopleToUnits(0, 2.7), 0);
  assert.equal(fit.peopleToUnits(-50, 2.7), 0);
  assert.equal(fit.peopleToUnits(100, 0), 0);
});

test('outText: today / year / null', () => {
  assert.equal(fit.outText('today'), 'at capacity today');
  assert.equal(fit.outText(2041), 'runs out ≈2041');
  assert.equal(fit.outText(null), 'holds to build-out');
  assert.equal(fit.outText(undefined), 'holds to build-out');
});

test('fmtInt: thousands separators, dash for missing', () => {
  assert.equal(fit.fmtInt(1234567), '1,234,567');
  assert.equal(fit.fmtInt(0), '0');
  assert.equal(fit.fmtInt(null), '–');
});

test('matchStationAreas: nearest outlet within maxM, deduped', () => {
  const areas = [
    { id: 'dr:1', outletAt: [-79.60, 43.53] },
    { id: 'dr:2', outletAt: [-79.70, 43.60] },
  ];
  const stations = [
    { name: 'STN A', lnglat: [-79.6001, 43.5301] }, // ~14 m from dr:1
    { name: 'STN B', lnglat: [-79.6002, 43.5302] }, // also dr:1 -> dedupe
    { name: 'STN C', lnglat: [-79.90, 43.90] },     // nowhere near -> dropped
  ];
  const out = fit.matchStationAreas(stations, areas, 500);
  assert.equal(out.length, 1);
  assert.equal(out[0].area.id, 'dr:1');
  assert.equal(out[0].stationName, 'STN A');
});

test('matchStationAreas: station beyond maxM is not matched', () => {
  const areas = [{ id: 'dr:1', outletAt: [-79.60, 43.53] }];
  const stations = [{ name: 'Far', lnglat: [-79.62, 43.53] }]; // ~1.6 km away
  assert.deepEqual(fit.matchStationAreas(stations, areas, 500), []);
});

test('distM: ~111 m per 0.001 degree of latitude', () => {
  const d = fit.distM([-79.6, 43.53], [-79.6, 43.531]);
  assert.ok(Math.abs(d - 111.32) < 0.5, `got ${d}`);
});

test('zLevel: leading digits of a zone name', () => {
  assert.equal(fit.zLevel('13B'), 13);
  assert.equal(fit.zLevel('2'), 2);
  assert.equal(fit.zLevel('AV13'), null);
  assert.equal(fit.zLevel(null), null);
});
