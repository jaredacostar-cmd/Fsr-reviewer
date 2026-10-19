'use strict';
// Brampton's second units (decided 2026-10-19): "Change of Use – Two / Three Unit Dwelling" permits
// add the homes beyond the house, count in the infill layer only, and form no development.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const P = require('../js/phases.js');
const L = require('../js/layers.js');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const D = (y, m = 6) => Date.UTC(y, m, 1);
const permit = (o = {}) => ({ uid: o.ref, kind: 'permit', municipality: 'Brampton', address: o.address || '1 Main St', ref: '25-100000-P01-00', type: 'Two Unit Dwelling', description: 'Change of Use - Two Unit Dwelling', units: 2, phase: 'completed', lat: 43.7, lng: -79.75, events: [{ phase: 'permit', date: D(2023), label: 'Issued' }, { phase: 'completed', date: D(2024), label: 'Final' }], ...o });

test('which permits are second units, and their new homes', () => {
  assert.ok(P.isSecondUnitConversion(permit()));
  assert.ok(P.isSecondUnitConversion(permit({ type: 'Two Unit Dwelling - 9.8 Retrofit' })));
  assert.ok(P.isSecondUnitConversion(permit({ type: 'Three Unit Dwelling', description: 'Change of Use - Two and Three Unit Dwelling', units: 3 })));
  assert.ok(!P.isSecondUnitConversion(permit({ type: 'RESIDENTIAL', description: 'NEW (1) STOREY SELF CONTAINED ATTACHED DWELLING' })));
  assert.ok(!P.isSecondUnitConversion(permit({ type: 'Two Unit Dwelling', description: 'NEW 2 storey detached dwelling with second unit' })));
  assert.ok(!P.isSecondUnitConversion({ ...permit(), kind: 'application' }));
  const { held } = P.holdSecondUnits([permit(), permit({ ref: 'b', units: 3, type: 'Three Unit Dwelling', description: 'Change of Use - Three Unit Dwelling' }), permit({ ref: 'c', units: null, type: 'Three Unit Dwelling', description: 'Change of Use - Three Unit Dwelling' })]);
  assert.deepEqual(held.map(r => [r.unitsStated, r.units]), [[2, 1], [3, 2], [null, 2]], 'the house was there already');
  // Held once: a second build does not take the house off again.
  assert.deepEqual(P.holdSecondUnits(held).held.map(r => r.units), [1, 2, 2]);
});

test('they form no development and join no file; the infill layer counts their new homes', () => {
  const app = { uid: 'a', kind: 'application', municipality: 'Brampton', address: '1 Main St', ref: 'OZS-2025-0001', type: 'Zoning', stage: 'zoning', description: 'Draft plan of subdivision for 100 units', units: 100, phase: 'review', lat: 43.7, lng: -79.75, events: [{ phase: 'inception', date: D(2025), label: 'Received' }] };
  const two = permit({ ref: '24-200000-P01-00' }), old = permit({ ref: '19-100000-P01-00', events: [{ phase: 'permit', date: D(2019), label: 'Issued' }] });
  const projects = P.buildProjects([app, two, old]);
  assert.equal(projects.length, 1);
  assert.ok(projects[0].records.every(r => r.kind === 'application'), 'not joined to the planning file');
  assert.equal(projects.secondUnits.length, 2);
  const inf = L.infill([], { secondUnits: projects.secondUnits });
  assert.equal(inf.units, 1, 'only permits issued since census day');
  assert.equal(inf.suites, 1);
  assert.deepEqual(inf.byMuni, { Brampton: 1 });
  assert.equal(inf.brampton, false, 'Brampton’s second units are now in its data');
  // Without them, the note that they are missing stays.
  const house = { key: 'x', municipality: 'Brampton', phase: 'completed', kinds: ['permit'], records: [permit({ type: 'Detached', description: 'NEW 2 STOREY DETACHED DWELLING', units: 1 })] };
  assert.equal(L.infill([house]).brampton, true);
});

test('wired: Overview and the area report pass the second units for the same scope; the snapshot stores scrubbed text', () => {
  assert.match(src('js/overview-tab.js'), /root\.PeelLayers\.infill\(infillScope\(\), \{ secondUnits: secondUnitScope\(\) \}\)/);
  assert.match(src('js/reports.js'), /infill\(OT\(\)\.infillScope\(\), \{ secondUnits: OT\(\)\.secondUnitScope \? OT\(\)\.secondUnitScope\(\) : \[\] \}\)/);
  assert.match(src('scripts/build-snapshot.js'), /k === 'description' \? PV\.scrubDescription\(v\.slice\(0, max\) \+ '…', r\)/, 'scrubbed again once cut');
});
