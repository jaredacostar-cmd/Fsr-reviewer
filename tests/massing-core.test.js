'use strict';
// js/massing-core.js: building heights and proposed massing for the 3D view (Part 2).
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/massing-core.js');

test('OSM building height: height tag, then levels × 3.2 m, then 2 storeys (estimated)', () => {
  assert.deepEqual(M.buildingHeight({ height: '24.5' }), { h: 24.5, basis: 'height', estimated: false });
  assert.equal(M.buildingHeight({ height: '30 m' }).h, 30);
  assert.equal(M.buildingHeight({ height: "40'" }).h, 12.2);
  const lv = M.buildingHeight({ 'building:levels': '12' });
  assert.equal(lv.h, 38.4); assert.equal(lv.basis, 'levels'); assert.equal(lv.estimated, true);
  assert.equal(M.buildingHeight({ 'building:levels': '2', 'roof:levels': '1' }).h, 9.6);
  const d = M.buildingHeight({ building: 'house' });
  assert.equal(d.h, 6.4); assert.equal(d.basis, 'default'); assert.equal(d.estimated, true);
  assert.equal(M.buildingHeight({ height: 'tall', 'building:levels': '3' }).basis, 'levels', 'an unreadable height falls back');
  assert.equal(M.buildingBase({ min_height: '9' }), 9); assert.equal(M.buildingBase({ 'building:min_level': '3' }), 9.6); assert.equal(M.buildingBase({}), 0);
});

test('stated height in a description: tallest storeys or metres; existing buildings ignored', () => {
  assert.deepEqual(M.statedHeight('Two towers of 25 and 32 storeys with 640 units'), { storeys: 32, metres: null });
  assert.equal(M.statedHeight('a 12-storey apartment building').storeys, 12);
  assert.equal(M.statedHeight('six storey mixed use building').storeys, 6);
  assert.equal(M.statedHeight('demolish the existing 1-storey dwelling; new 4 storey stacked towns').storeys, 4);
  assert.equal(M.statedHeight('existing 2 storey dwelling to be demolished').storeys, null);
  assert.equal(M.statedHeight('a building with a height of 38 m').metres, 38);
  assert.equal(M.statedHeight('12 m road widening').metres, null, 'a distance is not a height');
});

test('units → storeys: units × 90 m² ÷ (footprint × 85%), 1–60', () => {
  assert.equal(M.storeysFromUnits(100, 1000), Math.ceil(100 * 90 / 850));
  assert.equal(M.storeysFromUnits(1, 5000), 1);
  assert.equal(M.storeysFromUnits(5000, 100), 60);
  assert.equal(M.storeysFromUnits(0, 1000), null);
});

test('massing: stated height → storeys × 3.2 → units estimate → hidden', () => {
  const at = { lat: 43.72, lng: -79.79 };
  const a = M.massingFor({ ...at, description: 'a 20-storey tower, height of 70 m' });
  assert.equal(a.h, 70); assert.equal(a.basis, 'stated height'); assert.equal(a.estimated, false);
  const b = M.massingFor({ ...at, description: '12 storey apartment building' });
  assert.equal(b.h, 38.4); assert.equal(b.basis, 'stated storeys');
  const c = M.massingFor({ ...at, description: 'Apartment building', units: 200 });
  assert.equal(c.basis, 'estimated from units'); assert.equal(c.estimated, true);
  assert.equal(c.storeys, M.storeysFromUnits(200, 900)); assert.equal(c.footprint, 'square');
  assert.equal(M.massingFor({ ...at, description: '120 detached dwellings', units: 120 }), null, 'houses: hidden');
  assert.equal(M.massingFor({ ...at, description: 'Official plan amendment' }), null);
  assert.equal(M.massingFor({ description: '12 storey' }), null, 'no location: hidden');
});

test('footprint: half the application site about its centroid, or a 30 m square', () => {
  const d = 100 / 110574, e = 100 / (111320 * Math.cos(43.72 * Math.PI / 180));
  const site = [[-79.79, 43.72], [-79.79 + e, 43.72], [-79.79 + e, 43.72 + d], [-79.79, 43.72 + d], [-79.79, 43.72]];
  const f = M.footprint({ siteRings: [site] });
  assert.equal(f.basis, 'site');
  assert.ok(Math.abs(M.ringAreaM2(site) - 10000) < 50);
  assert.ok(Math.abs(f.areaM2 - 5000) < 50, `${f.areaM2}`);
  const sq = M.footprint({ lat: 43.72, lng: -79.79 });
  assert.equal(sq.basis, 'square'); assert.ok(Math.abs(M.ringAreaM2(sq.ring) - 900) < 5);
  assert.match(M.massingLabel(M.massingFor({ siteRings: [site], description: '8 storey condo' })), /50% of the application site.*Indicative only/);
});

test('massing features: hidden ones counted, phase and basis carried for colours and popups', () => {
  const fc = M.massingFeatures([{ key: 'a', lat: 43.7, lng: -79.7, phase: 'review', description: '15 storey condo' }, { key: 'b', lat: 43.7, lng: -79.7, phase: 'approved', description: 'severance' }]);
  assert.equal(fc.features.length, 1); assert.equal(fc.hidden, 1);
  assert.equal(fc.features[0].properties.phase, 'review'); assert.equal(fc.features[0].properties.basis, 'stated storeys');
});

test('tiles and terrarium encoding', () => {
  const t = M.lngLatToTile(-79.79, 43.72, 14); const b = M.tileBounds(14, t.x, t.y);
  assert.ok(b.w <= -79.79 && b.e > -79.79 && b.s <= 43.72 && b.n > 43.72);
  assert.ok(M.tilesInBbox([-79.83, 43.70, -79.76, 43.74], 14).length >= 4);
  const [r, g, bl] = M.terrariumEncode(186.37);
  assert.ok(Math.abs(r * 256 + g + bl / 256 - 32768 - 186.37) < 0.005);
  const [r2, g2, b2] = M.terrariumEncode(186.37, 0.1);
  assert.ok(Math.abs(r2 * 256 + g2 + b2 / 256 - 32768 - 186.4) < 0.005);
});
