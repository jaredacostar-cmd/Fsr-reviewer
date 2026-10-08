'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../js/demand.js');
const P = require('../js/phases.js');

const proj = (units, types, description = '', unitMix = null) => ({ units, types, description, unitMix });

test('dwelling type is read from type / description text', () => {
  assert.equal(D.unitTypeOf('New 32 storey residential tower'), 'apartment');
  assert.equal(D.unitTypeOf('Stacked townhouses'), 'apartment');
  assert.equal(D.unitTypeOf('Freehold townhouse block'), 'town');
  assert.equal(D.unitTypeOf('New single detached dwelling'), 'single');
  assert.equal(D.unitTypeOf('Rezoning'), 'unknown');
});

test('estimate applies Peel ppu, water peaking and Harmon', () => {
  const e = D.estimate([
    proj(100, ['Apartment']),            // 100 × 2.7 = 270
    proj(10, ['Townhouse']),             // 10 × 3.4  = 34
    proj(null, ['Plaza']),               // no units: ignored
    proj(5, [], '', { single: 2, semi: 1, town: 0, apartment: 2 }), // 3×4.2 + 2×2.7 = 18
  ]);
  assert.equal(e.withUnits, 3);
  assert.equal(e.totalUnits, 115);
  assert.ok(Math.abs(e.population - 322) < 1e-9);
  const avgW = 322 * 280 / 86400;
  assert.ok(Math.abs(e.water.avg - avgW) < 1e-12);
  assert.ok(Math.abs(e.water.maxDay - 2 * avgW) < 1e-12);
  assert.ok(Math.abs(e.water.peakHour - 3 * avgW) < 1e-12);
  const M = 1 + 14 / (4 + Math.sqrt(0.322));
  assert.ok(Math.abs(e.wastewater.peakingFactor - M) < 1e-12);
  assert.ok(Math.abs(e.wastewater.peak - M * 322 * 290 / 86400) < 1e-12);
});

test('editable criteria are honoured; empty set is zero', () => {
  const c = { ppu: { single: 4.2, town: 3.4, apartment: 3.1, unknown: 3.1 }, water: { avg: 409, maxDay: 2, peakHour: 3 }, wastewater: { avg: 302.8 } };
  const e = D.estimate([proj(10, ['Condo'])], c);
  assert.ok(Math.abs(e.population - 31) < 1e-9);
  assert.equal(D.estimate([]).population, 0);
  assert.equal(D.estimate([]).wastewater.peak, 0);
  assert.ok(Math.abs(D.toMLd(1) - 0.0864) < 1e-12);
});

test('unit mix columns are detected and carried to the project', () => {
  const fields = [{ name: 'FILE_NO' }, { name: 'ADDRESS' }, { name: 'SINGLES', type: 'esriFieldTypeInteger' }, { name: 'SEMIS', type: 'esriFieldTypeInteger' },
    { name: 'TOWNS', type: 'esriFieldTypeInteger' }, { name: 'APTS', type: 'esriFieldTypeInteger' }];
  const m = P.detectFields(fields);
  assert.deepEqual(m.unitMix, { single: ['SINGLES'], semi: ['SEMIS'], town: ['TOWNS'], apartment: ['APTS'] });
  assert.equal(m.units, null);
  const r = P.normalizeRecord({ type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [-79.7, 43.6] },
    properties: { FILE_NO: 'OZ 1', ADDRESS: '1 A St', SINGLES: 4, SEMIS: 0, TOWNS: 6, APTS: 200 } }, m, { id: 'a', municipality: 'Brampton', kind: 'application' });
  assert.equal(r.units, 210);
  const p = P.buildProjects([r])[0];
  assert.deepEqual(D.unitSplit(p), { single: 4, town: 6, apartment: 200, unknown: 0 });
});

test('committed capacity: approved or permitted units not yet completed', () => {
  const bo = (planned, permitted, completed) => ({ planned, permitted, completed, remaining: Math.max(0, planned - permitted), unbuilt: Math.max(planned, permitted) - completed });
  const p = (phase, units, buildout) => ({ phase, units, buildout, types: ['Townhouse'], description: '' });
  assert.equal(D.unitsFor(p('review', 300, bo(300, 0, 0)), 'committed'), 0, 'under review is proposed, not committed');
  assert.equal(D.unitsFor(p('approved', 300, bo(300, 0, 0)), 'committed'), 300);
  assert.equal(D.unitsFor(p('construction', 300, bo(300, 120, 50)), 'committed'), 250);
  assert.equal(D.unitsFor(p('permit', 4, null), 'committed'), 4, 'single permit, not finished');
  assert.equal(D.unitsFor(p('completed', 4, null), 'committed'), 0);
  assert.equal(D.unitsFor(p('cancelled', 40, null), 'committed'), 0);
});
