'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../js/employment.js');

test('uses are read from type and description', () => {
  assert.deepEqual(E.usesOf('Site plan application for 2 industrial buildings'), ['industrial']);
  assert.deepEqual(E.usesOf('Office building with parking structure'), ['office']);
  assert.deepEqual(E.usesOf('Truck fuel dispensing facility, gas bar and take out restaurant with drive thru'), ['retail']);
  assert.deepEqual(E.usesOf('Site Plan for a 16 storey hotel'), ['hotel']);
  assert.deepEqual(E.usesOf('expansion of the existing place of worship, private school, and community centre'), ['institutional']);
  assert.deepEqual(E.usesOf('207 townhouse dwelling units'), []);
});

test('floor areas are assigned to the nearest use, in m²', () => {
  assert.deepEqual(E.areasOf('Multiple buildings from 3 to 41 storeys with a total of 3027 dwelling units and 2506 sq m of retail GFA'), [{ use: 'retail', m2: 2506 }]);
  assert.deepEqual(E.areasOf('a place of worship (1,445 m²), a private school (13,050 m²)'), [{ use: 'institutional', m2: 1445 }, { use: 'institutional', m2: 13050 }]);
  assert.deepEqual(E.areasOf('a commercial plaza with a total GFA of 3509.71 square metres'), [{ use: 'retail', m2: 3509 }]);
  assert.deepEqual(E.areasOf('a 45,000 sq ft warehouse'), [{ use: 'industrial', m2: 4181 }]);
  assert.deepEqual(E.areasOf('hotel with 101 rooms and a total GFA of 7,077 square metres'), [{ use: 'hotel', m2: 7077 }]);
});

test('project summary: largest figure per use across files, jobs from floor space per worker', () => {
  const app = (description, extra = {}) => ({ kind: 'application', phase: 'review', type: 'Site Plan', description, ...extra });
  const e = E.employmentOf({ units: 3027, records: [
    app('3027 dwelling units and 2506 sq m of retail GFA'),
    app('3027 dwelling units and 2,506 square metres of retail'),
  ] });
  assert.equal(e.uses.length, 1);
  assert.equal(e.uses[0].m2, 2506);
  assert.equal(e.jobs, Math.round(2506 / 45));
  assert.equal(e.mixed, true);
  const ind = E.employmentOf({ units: 0, records: [app('Two industrial buildings', { gfa: 22000 })] });
  assert.equal(ind.uses[0].m2, 22000);
  assert.equal(ind.jobs, 200);
  assert.equal(E.employmentOf({ units: 40, records: [app('40 townhouses')] }), null);
});
