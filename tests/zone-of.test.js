'use strict';
// SPEC 1.8: one zone per development, everywhere, with its reason; the elevation band only flags.
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../js/zone-of.js');

const byId = new Map([['pz:5', { id: 'pz:5', zone: '5', name: 'Pressure zone 5' }], ['pz:6', { id: 'pz:6', zone: '6', name: 'Pressure zone 6' }]]);
const PZ = { 5: [274.3, 182.4, 236.2], 6: [304.8, 214.5, 259.1], 7: [335.3, 243.4, 289.6] };

test('mapped, else via the planned main, else the nearest zone — one answer with its reason', () => {
  assert.deepEqual(Z.zoneOf({ pz: ['pz:6'] }, byId).reason, 'mapped');
  const v = Z.zoneOf({ pz: [], pzNear: { id: 'pz:5', m: 330, via: { p: '26-1245', y: 2027 } } }, byId);
  assert.equal(v.id, 'pz:5'); assert.equal(v.reason, 'planned-main'); assert.equal(v.via.p, '26-1245');
  const n = Z.zoneOf({ pzNear: { id: 'pz:6', m: 900 } }, byId);
  assert.equal(n.reason, 'nearest'); assert.equal(n.z.zone, '6');
  assert.equal(Z.zoneOf({}, byId), null);
});

test('the elevation band flags the other zone the ground fits (Heritage: ≈231 m fits 5 and 6, assigned 5)', () => {
  assert.deepEqual(Z.alsoFits(5, 231, PZ), [6]);
  assert.deepEqual(Z.alsoFits(6, 250, PZ), [7]);
  assert.deepEqual(Z.alsoFits(5, 200, PZ), []);
  assert.deepEqual(Z.alsoFits(5, null, PZ), []);
});
