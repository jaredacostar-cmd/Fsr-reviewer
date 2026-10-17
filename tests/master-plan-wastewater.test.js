'use strict';
// data/master-plan-wastewater.json is transcribed from the 2020 Master Plan, Volume 4. These tests check
// the transcription against the plan's own totals and against the app's own design criteria.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../data/master-plan-wastewater.json');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('flow forecast rows add up (Table 7)', () => {
  const f = D.flowForecast;
  f.years.forEach((y, i) => {
    near(f.east[i] + f.york[i] + f.toronto[i], f.eastSubtotal[i], 1, `east subtotal ${y}`);
    near(f.eastSubtotal[i] + f.westSubtotal[i], f.total[i], 1, `total ${y}`);
  });
});

test('plant demand = trunk subtotal; surplus = 90% rated − demand (Table 8)', () => {
  const f = D.flowForecast, [booth, clarkson] = D.plantHydraulic.rows;
  for (const [p, sub] of [[booth, f.eastSubtotal], [clarkson, f.westSubtotal]]) {
    near(p.rated90MLd, 0.9 * p.ratedMLd, 1, `${p.plant} 90%`);
    p.demandMLd.forEach((d, i) => {
      near(d, sub[i], 0, `${p.plant} demand ${f.years[i]}`);
      near(p.rated90MLd - d, p.surplusMLd[i], 1, `${p.plant} surplus ${f.years[i]}`);
    });
  }
});

test('loading surplus = governing capacity − demand (Table 9)', () => {
  for (const p of D.plantLoading.rows) {
    near(p.rated90Kgd, 0.9 * p.ratedKgd, 1, `${p.plant} 90%`);
    p.demandKgd.forEach((d, i) => near(p.governingKgd - d, p.surplusKgd[i], 1, `${p.plant} ${D.plantLoading.years[i]}`));
  }
});

test('34 trunk sewers across West, East and McVean, ids unique', () => {
  const rows = D.trunks.rows, by = s => rows.filter(r => r.system === s).length;
  assert.equal(rows.length, 34);
  assert.deepEqual([by('W'), by('E'), by('M')], [10, 17, 7]);
  assert.equal(new Set(rows.map(r => r.id)).size, rows.length);
  for (const r of rows) assert.ok(r.diameterMinMm <= r.diameterMaxMm, r.id);
});

test('the app’s collection criteria match the plan (290 L/cap/d, Harmon 2–4, 0.26 L/s/ha)', () => {
  const C = D.designCriteria.collection, { DEFAULT_CRITERIA: K } = require('../js/demand.js');
  assert.equal(K.wastewater.avg, C.residentialADWF_Lpd);
  assert.equal(K.wastewater.infiltration, C.infiltration_Lsha);
  assert.equal(K.wastewater.peakMin, C.peakMin);
  assert.equal(K.wastewater.peakMax, C.peakMax);
  assert.equal(K.employment.wastewater, C.employmentADWF_Lpd);
});

test('plant checks: BOD loading from the plan, and the diversion as a step both ways', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'masterplan.js'), 'utf8');
  const body = name => { const i = src.indexOf(`function ${name}(`); return src.slice(i, src.indexOf('\n  }\n', i)); };
  assert.match(body('bodCons'), /governingKgd/, 'BOD capacity is the governing capacity');
  assert.match(body('bodCons'), /residential_gpd/, 'BOD growth uses the plan criteria');
  assert.match(body('plantCons'), /qWith\(!di\.on\)/, 'flow check computes the other diversion case');
  assert.match(body('devNeeds'), /bodCons\(/);
  assert.match(body('allNeeds'), /bodCons\(/);
  // The plan's own BOD strength gives the loading the diversion moves: ~262 kg per ML at G.E. Booth.
  const L = D.plantLoading, F = D.flowForecast, booth = L.rows[0];
  const kgPerMl = booth.demandKgd[L.years.indexOf(2021)] / F.eastSubtotal[F.years.indexOf(2021)];
  near(kgPerMl, 262, 1, 'Booth kg/ML 2021');
});
