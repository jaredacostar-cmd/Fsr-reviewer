'use strict';
// Building permits that state no units (inferred from the site plan that holds them), permits left open
// for years, non-dwelling permits, the infill layer and the under-construction check against CMHC.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const L = require('../js/layers.js');
const ev = (phase, d) => ({ phase, date: new Date(`${d}T00:00:00Z`), label: phase });

test('buildings a file lists, and one building per permit number', () => {
  assert.equal(P.buildingsListed('two (2) apartment buildings (11-storeys and 14 storeys) totalling 314 units, and seven (7) 3-storey stacked back-to-back townhouse blocks'), 9);
  assert.equal(P.buildingsListed('a 14-storey purpose built rental apartment building containing 154 units'), null);
  assert.equal(P.buildingsListed('5 towers 22-44 storeys'), 5);
  assert.equal(P.buildingsListed('a 12-storey building with 200 units'), null, 'a height is not a count of buildings');
  assert.equal(P.permitBase({ ref: '23-227913-P01-00' }), P.permitBase({ ref: '23-227913-P02-00' }));
  assert.equal(P.permitBase({ ref: 'BP 3NEW 24-4832' }), '24-4832');
});

test('a residential building permit with no units permits the homes of the site plan that holds it', () => {
  const sp = { uid: 'sp', kind: 'application', phase: 'approved', ref: 'SPA-1', stage: 'siteplan', type: 'Site Plan', units: 300, description: 'two apartment buildings', poly: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]], events: [] };
  const blank = (ref, phase = 'permit') => ({ uid: ref, kind: 'permit', phase, ref, type: 'C: Apartments - Condominium', description: 'New Complete Building', units: null, fileOf: 'sp', events: [ev('permit', '2024-01-01')] });
  const one = P.inferBlankPermits([sp, blank('24-111111-P01-00'), blank('24-111111-P02-00')], [blank('24-111111-P01-00'), blank('24-111111-P02-00')], 300);
  assert.equal(one.units, 150, 'one building of the two listed (its two parts are one permit number)');
  const both = P.inferBlankPermits([sp], [blank('24-111111-P01-00'), blank('24-222222-P01-00', 'completed')], 300);
  assert.equal(both.units, 300); assert.equal(both.completed, 150, 'a building counts complete when every part of its permit is');
  assert.equal(P.inferBlankPermits([sp], [blank('24-111111-P01-00')], 0).units, 0, 'no room left: nothing inferred');
  const house = { ...blank('24-9'), type: 'Single Family Detached' };
  assert.equal(P.inferBlankPermits([sp], [house], 300).units, 0, 'a house permit is not a building of homes');
});

test('a permit with no status left open five years or more is completed (estimated); a sign is not a home', () => {
  const r = { kind: 'permit', phase: 'permit', statusRaw: '', units: 300, events: [ev('permit', '2014-06-01')] };
  const recent = { kind: 'permit', phase: 'permit', statusRaw: '', units: 1, events: [ev('permit', '2024-06-01')] };
  const latest = { kind: 'permit', phase: 'permit', statusRaw: 'ISSUED', units: 1, events: [ev('permit', '2026-09-01')] };
  assert.equal(P.closeStalePermits([r, recent, latest]), 1);
  assert.equal(r.phase, 'completed'); assert.equal(r.completedEstimated, true);
  assert.equal(r.events.find(e => e.phase === 'completed').date.toISOString().slice(0, 7), '2016-11', 'issue + 30 months (20+ units)');
  assert.equal(recent.phase, 'permit');
  assert.equal(P.permitAddsUnits({ kind: 'permit', ref: 'X', type: 'Sign', units: 10, description: '' }), false);
  assert.equal(P.permitAddsUnits({ kind: 'permit', ref: 'X', type: 'Tent', units: 5, description: '' }), false);
  assert.equal(P.permitAddsUnits({ kind: 'permit', ref: 'X', type: 'Residential', units: 2, description: 'new dwelling' }), true);
});

test('infill: homes on permits since census day with no planning application, net of demolitions', () => {
  const site = (muni, recs) => ({ municipality: muni, kinds: ['permit'], phase: 'permit', records: recs });
  const permit = (ref, units, type, d, extra = {}) => ({ kind: 'permit', phase: 'permit', ref, units, type, description: '', events: [ev('permit', d)], ...extra });
  const out = L.infill([
    site('Mississauga', [permit('SEC UNIT 22-1', 1, 'Detached Dwelling', '2022-03-01')]),
    site('Brampton', [permit('22-1', 1, 'Single Family Detached', '2022-03-01')]),
    site('Caledon', [permit('19-1', 1, 'Residential', '2019-03-01')]),   // before census day
    { municipality: 'Caledon', kinds: ['application', 'permit'], phase: 'permit', records: [permit('22-2', 40, 'Residential', '2022-03-01')] },
  ]);
  assert.equal(out.units, 2); assert.equal(out.suites, 1); assert.equal(out.houses, 1); assert.equal(out.brampton, true);
  assert.match(L.headlineText({ total: 1000, moved: 1000, notMoved: 0, notBuilt: 500 }, '', undefined, undefined, out), /Plus about 2 added by building permit alone since 2021 \(secondary suites and new houses on existing lots\); Brampton’s second units are not in its open data\./);
});

test('CMHC under construction rolled forward from its last published year with starts and completions', () => {
  const H = { cmhc: { underConstruction: { Mississauga: { 2021: { all: 8449 }, 2022: { all: 11743 } } } },
    peel: { activity: { muni: { Mississauga: { 2023: { starts: { all: 2392 }, completions: { all: 3083 } }, 2024: { starts: { all: 3036 }, completions: { all: 2469 } }, 2025: { starts: { all: 2129 }, completions: { all: 3893 } }, 2026: { quarters: 2, starts: { all: 578 }, completions: { all: 77 } } } } } } };
  const c = L.cmhcUnderConstruction(H);
  assert.deepEqual(c, { byMuni: { Mississauga: 9855 }, base: 2022, year: 2025 });
  const pn = L.permittedNotCompleted([{ municipality: 'Brampton', phase: 'permit', kinds: ['application', 'permit'], buildout: { planned: 676, permitted: 676, completed: 0 } }, { municipality: 'Brampton', phase: 'permit', kinds: ['permit'], buildout: { planned: 5, permitted: 5, completed: 0 } }]);
  assert.deepEqual(pn, { Brampton: 676 });
});

test('a change of use to a two- or three-unit dwelling adds one (two) homes, as a suite, from no planning file', () => {
  const at = { lat: 43.65, lng: -79.82, events: [{ date: new Date('2026-05-25T00:00:00Z'), phase: 'permit', label: 'Issue Date' }] };
  const two = { kind: 'permit', ref: '26-050190-P01-00', type: 'Two Unit Dwelling', description: 'Change of Use - Two Unit Dwelling', units: 2, newBuild: true, phase: 'permit', ...at };
  const three = { kind: 'permit', ref: '26-000001-P01-00', type: 'Three Unit Dwelling', description: 'Change of Use - Three Unit Dwelling', units: 3, newBuild: true, phase: 'permit', ...at };
  const house = { kind: 'permit', ref: '21-252012-000-00', type: 'Single Family Detached', description: 'New Complete Building', units: 1, newBuild: true, phase: 'permit', ...at };
  P.convertedUnits([two, three, house]);
  assert.deepEqual([two.units, three.units, house.units], [1, 2, 1]);
  assert.deepEqual([two.newBuild, two.conversion, house.conversion], [false, true, undefined]);
  assert.equal(P.permitRole(two), 'suite');
  assert.equal(P.permitRole(house), 'units');
  // Run twice: no double reduction.
  P.convertedUnits([two]); assert.equal(two.units, 1);
});
