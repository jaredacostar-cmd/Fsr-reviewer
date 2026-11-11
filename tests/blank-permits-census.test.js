'use strict';
/* Brampton's apartment permits state no units (js/phases.js inferBlankPermits infers their homes).
 * Decided 2026-11-03: those inferred homes count on the side of census day their buildings were
 * completed (js/layers.js completedSplit, as js/areas.js builtSince does), by year in the completions
 * (js/growth.js completionStats), and a blank apartment permit's completion is estimated as a 20+ unit
 * building's (issue + 30 months), not a house's.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const A = require('../js/areas.js');
const LY = require('../js/layers.js');
const G = require('../js/growth.js');

const MONTH = 30.44 * 864e5;
const blankApt = (ref, issued, status = 'Closed') => ({
  kind: 'permit', ref, uid: ref, type: 'C: Apartments', description: 'New Complete Building', statusRaw: status,
  units: null, municipality: 'Brampton', phase: status === 'Closed' ? 'completed' : 'permit',
  events: [{ date: new Date(issued), phase: 'permit', label: 'Issue Date' }],
});
const dev = (records, completed) => ({
  key: 'Brampton|test', municipality: 'Brampton', phase: 'completed', units: completed, records,
  buildout: { planned: completed, permitted: completed, completed, remaining: 0, unbuilt: 0, inferred: { units: completed, completed, files: [] } },
});

test('a blank apartment permit is one the inference covers', () => {
  assert.equal(P.isBlankPermit(blankApt('22-1-P01', '2022-01-01')), true);
});

test('a blank apartment permit completes at issue + 30 months, not 12', () => {
  const r = blankApt('22-1-P01', '2022-01-01');
  const c = A.completedAt(r);
  assert.equal(c.estimated, true);
  assert.ok(Math.abs(c.date - (Date.parse('2022-01-01') + 30 * MONTH)) < 864e5);
  const house = { ...r, type: 'Single Family Detached', units: 1 };
  assert.ok(Math.abs(A.completedAt(house).date - (Date.parse('2022-01-01') + 12 * MONTH)) < 864e5);
});

test('homes inferred on blank permits completed after census day are Built since 2021, not in the census', () => {
  const p = dev([blankApt('22-1-P01', '2022-01-01'), blankApt('22-2-P01', '2022-06-01')], 300);
  const L = LY.ofDev(p);
  assert.equal(L.parts.built, 300);
  assert.equal(L.parts.existing, 0);
});

test('blank permits split at census day by the share of buildings completed on each side', () => {
  // one building completed 2018 (issue 2016 + 30 months), one 2024
  const p = dev([blankApt('16-1-P01', '2016-01-01'), blankApt('22-2-P01', '2022-01-01')], 200);
  const L = LY.ofDev(p);
  assert.equal(L.parts.built, 100);
  assert.equal(L.parts.existing, 100);
});

test('completions per year include the inferred homes, in the years their buildings were completed', () => {
  const p = dev([blankApt('20-1-P01', '2020-01-01'), blankApt('21-2-P01', '2021-01-01')], 200);
  const s = G.completionStats([p], { completedAt: A.completedAt, permitUnits: rs => P.permitUnits(rs) });
  const by = Object.fromEntries(s.years.map(y => [y.year, y.units]));
  assert.deepEqual(by, { 2022: 100, 2023: 100 });
  assert.equal(s.totalUnits, 200);
});
