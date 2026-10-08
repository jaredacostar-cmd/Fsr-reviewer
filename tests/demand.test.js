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

test('committed capacity: growth (planned on an application) that is approved or permitted, not yet completed', () => {
  const bo = (planned, permitted, completed) => ({ planned, permitted, completed, remaining: Math.max(0, planned - permitted), unbuilt: Math.max(planned, permitted) - completed });
  const p = (phase, units, buildout) => ({ phase, units, buildout, types: ['Townhouse'], description: '' });
  assert.equal(D.unitsFor(p('review', 300, bo(300, 0, 0)), 'committed'), 0, 'under review is proposed, not committed');
  assert.equal(D.unitsFor(p('approved', 300, bo(300, 0, 0)), 'committed'), 300);
  assert.equal(D.unitsFor(p('construction', 300, bo(300, 120, 50)), 'committed'), 250);
  assert.equal(D.unitsFor(p('permit', 4, null), 'committed'), 0, 'a permit with no planning application is not growth');
  assert.equal(D.unitsFor(p('completed', 4, null), 'committed'), 0);
  assert.equal(D.unitsFor(p('cancelled', 40, null), 'committed'), 0);
});

test('I&I: 0.26 L/s/ha on the site area, prorated by units; estimated from units without a boundary', () => {
  const bo = { planned: 100, permitted: 40, completed: 40, remaining: 60, unbuilt: 60 };
  const site = { phase: 'construction', units: 100, siteAreaHa: 10, buildout: bo, types: ['Townhouse'], description: '' };
  const all = D.estimate([site]);
  assert.equal(all.area.ha, 10);
  assert.ok(Math.abs(all.wastewater.infiltration - 2.6) < 1e-9);
  assert.ok(Math.abs(all.wastewater.wetPeak - (all.wastewater.peak + 2.6)) < 1e-9);
  const rest = D.estimate([site], D.DEFAULT_CRITERIA, 'unbuilt');
  assert.ok(Math.abs(rest.area.ha - 6) < 1e-9, 'remaining 60 of 100 units -> 60% of the site');
  const noBoundary = D.estimate([{ phase: 'approved', units: 50, types: ['Single detached'], description: '', buildout: null }]);
  assert.ok(Math.abs(noBoundary.area.ha - 2) < 1e-9, '50 singles x 0.04 ha');
  assert.equal(noBoundary.area.estimatedHa, noBoundary.area.ha);
});

test('employment demand: Peel ICI water and non-residential wastewater rates', () => {
  const D = require('../js/demand.js');
  const d = D.employmentDemand(1000);
  assert.ok(Math.abs(d.water.avg - 1000 * 300 / 86400) < 1e-9);
  assert.ok(Math.abs(d.water.maxDay - d.water.avg * 1.4) < 1e-9);
  assert.ok(Math.abs(d.water.peakHour - d.water.avg * 3.0) < 1e-9);
  assert.ok(Math.abs(d.wastewater.avg - 1000 * 270 / 86400) < 1e-9);
  // Harmon on employees, bounded 2–4.
  assert.equal(D.employmentPeaking(5), 4);
  assert.equal(D.employmentPeaking(5e6), 2);
  assert.ok(Math.abs(D.employmentPeaking(1000) - D.harmon(1000)) < 1e-9);
  assert.equal(D.employmentDemand(0).wastewater.peak, 0);
});

test('employment counted by phase and added to residential', () => {
  const D = require('../js/demand.js');
  const ind = { units: 0, phase: 'approved', siteAreaHa: 10, types: [], description: '', records: [] };
  const done = { units: 0, phase: 'completed', types: [], description: '', records: [] };
  const jobs = new Map([[ind, 500], [done, 200]]);
  const jobsOf = p => jobs.get(p) || 0;
  const all = D.estimate([ind, done], D.DEFAULT_CRITERIA, 'all', jobsOf);
  assert.equal(all.employment.jobs, 700);
  assert.equal(all.employment.area.ha, 10);
  assert.ok(Math.abs(all.employment.wastewater.infiltration - 2.6) < 1e-9);
  assert.equal(D.estimate([ind, done], D.DEFAULT_CRITERIA, 'committed', jobsOf).employment.jobs, 500);
  assert.equal(D.estimate([ind, done], D.DEFAULT_CRITERIA, 'completed', jobsOf).employment.jobs, 200);
  assert.equal(D.estimate([ind, done], D.DEFAULT_CRITERIA, 'remaining', jobsOf).employment.jobs, 500);
  // Without jobsOf, residential only (backwards compatible).
  assert.equal(D.estimate([ind]).employment.jobs, 0);
  const res = { units: 100, phase: 'review', types: ['Townhouses'], description: '', records: [] };
  const mix = D.estimate([res, ind], D.DEFAULT_CRITERIA, 'all', jobsOf);
  assert.ok(Math.abs(mix.combined.water.peakHour - (mix.water.peakHour + mix.employment.water.peakHour)) < 1e-9);
  assert.ok(Math.abs(mix.combined.wastewater.wetPeak - (mix.wastewater.wetPeak + mix.employment.wastewater.wetPeak)) < 1e-9);
});

test('unit mix read from application text', () => {
  const D = require('../js/demand.js');
  assert.deepEqual(D.mixFromText('a maximum of 299 single detached, 217 street townhouse, and 52 back-to-back townhouse dwelling units'), { single: 299, town: 217, apartment: 52 });
  assert.deepEqual(D.mixFromText('A twenty-five storey residential apartment building (559 apartment units) and 16 townhouses'), { single: 0, town: 16, apartment: 559 });
  // Heights and lots are not dwellings.
  assert.deepEqual(D.mixFromText('12 storey apartment building with 19 reserve lots'), { single: 0, town: 0, apartment: 0 });
  // A summary figure equal to the total, followed by its parts, is not counted twice.
  assert.deepEqual(D.mixFromText('287 townhouse units consisting of 104 standard townhouses, 164 back-to-back townhouses & 19 rear-lane townhouses', 287), { single: 0, town: 123, apartment: 164 });
});

test('build-out by type adds up to the build-out totals', () => {
  const D = require('../js/demand.js');
  const permit = (ref, units, desc, phase) => ({ kind: 'permit', ref, fileKey: ref, units, description: desc, type: 'RESIDENTIAL', phase });
  const p = {
    types: ['Subdivision'], description: '40 single detached and 60 townhouses',
    buildout: { planned: 100, permitted: 30, completed: 10, remaining: 70, unbuilt: 90 },
    records: [
      { kind: 'application', phase: 'approved', units: 100, description: '40 single detached and 60 townhouses' },
      permit('A1', 10, 'New single detached dwelling', 'completed'),
      permit('A2', 12, 'New townhouse block', 'permit'),
      permit('A3', 8, 'Conditional permit - foundation only', 'permit'),
    ],
  };
  const t = D.typeBuildout(p);
  assert.equal(t.source, 'text');
  const sum = col => Object.values(t.rows).reduce((a, r) => a + r[col], 0);
  assert.equal(sum('planned'), 100); assert.equal(sum('permitted'), 30); assert.equal(sum('completed'), 10); assert.equal(sum('left'), 70);
  assert.equal(t.rows.single.planned, 40); assert.equal(t.rows.town.planned, 60);
  assert.equal(t.rows.single.completed, 10);
  // The untyped foundation permit goes to the types with room left in the plan.
  assert.equal(t.rows.unknown.permitted, 0);
  assert.equal(t.rows.single.left + t.rows.town.left, 70);
});
