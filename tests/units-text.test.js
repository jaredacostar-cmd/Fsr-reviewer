'use strict';
// Counts read from a file's description (js/phases.js unitsFromText): densities and decimals are not
// unit counts. Synthetic wording.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');

test('unitsFromText: a density is not a count', () => {
  assert.equal(P.unitsFromText('a 30-storey building; 400 residential units; Proposed Density: 1,250 units/net hectare (500 unit/net acre)'), 400);
  assert.equal(P.unitsFromText('Thirty (30) townhouse dwellings. The density proposed is 44 units per hectare.'), 30);
  assert.equal(P.unitsFromText('a net density of 61 units per gross hectare'), null);
  assert.equal(P.unitsFromText('about 20 units per acre'), null);
  assert.equal(P.unitsFromText('12 units / ha'), null);
});

test('unitsFromText: the decimals of a figure are not a count', () => {
  assert.equal(P.unitsFromText('The density proposed is 46.50 units per hectare'), null, 'not 50');
  assert.equal(P.unitsFromText('a density of 48.78 units per hectare'), null, 'not 78');
  assert.equal(P.unitsFromText('to facilitate ~210.5 residential dwelling units'), null, 'not 5');
  assert.equal(P.unitsFromText('approximately 99.5 units, a mix of singles and towns'), null);
});

test('unitsFromText: a count after a full stop still counts', () => {
  assert.equal(P.unitsFromText('connected at grade by a 1-storey amenity building.160 units are proposed.'), 160);
  assert.equal(P.unitsFromText('Phase one. 75 residential units'), 75);
  assert.equal(P.unitsFromText('a 6 storey building with 1,200 residential units'), 1200, 'a thousands comma is a count');
});

test('a count an earlier parser read from the text, and today\'s reads as none, is dropped', () => {
  const ev = { date: new Date('2024-01-01T00:00:00Z'), phase: 'review', label: 'x' };
  const r = { uid: 'u1', kind: 'application', municipality: 'Brampton', ref: 'SPA-9', fileKey: 'SPA|9', stage: 'siteplan', type: 'Site plan', address: '1 TEST ST', phase: 'review',
    description: 'The density proposed is 46.50 units per hectare', units: 50, unitsFromText: true, events: [ev] };
  const keep = { ...r, uid: 'u2', ref: 'SPA-8', fileKey: 'SPA|8', address: '2 TEST ST', units: 50, unitsFromText: false };
  const ps = P.buildProjects([r, keep]);
  assert.equal(r.units, null); assert.equal(ps.find(p => p.records.includes(r)).units, null);
  assert.equal(keep.units, 50, 'a count from a data field stays');
  const t = { ...r, uid: 'u3', ref: 'SPA-7', fileKey: 'SPA|7', address: '3 TEST ST', description: 'a building with 514 residential units; 1,475 units/net hectare', units: 1475, unitsFromText: true };
  P.buildProjects([t]);
  assert.equal(t.units, 514, 'read again with today\'s parser');
});
