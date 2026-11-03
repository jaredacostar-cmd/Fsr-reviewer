'use strict';
// Repair and replacement permits state the suites they touch, not new homes: Mississauga's Kitec
// piping and furnace permits ("IN-SUITE KITEC PIPING REPLACEMENT FOR 337 SUITES") were counted as
// ~800 homes built by permit alone. A second unit or a new dwelling still counts.
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const L = require('../js/layers.js');
const ev = (phase, d) => ({ phase, date: new Date(`${d}T00:00:00Z`), label: phase });
const permit = (ref, description, units, type = 'RESIDENTIAL') => ({
  uid: ref, kind: 'permit', phase: 'completed', ref, type, description, units, address: `${ref} MAIN ST`,
  events: [ev('permit', '2022-03-01'), ev('completed', '2023-03-01')],
});

const REPAIRS = [
  ['PLU/BLDG 21-9302 PLU', 'IN-SUITE KITEC PIPING REPLACEMENT - 340 UNITS IN TOTAL', 340],
  ['PLU/BLDG 23-8023 PLU', 'IN-SUITE KITEC PIPING REPLACEMENT FOR 337 SUITES', 337],
  ['PLU/BLDG 22-1422 PLU', 'IN-SUITE AND EXTERIOR KITEC PIPING REPLACEMENT ( 20 SUITES)', 20],
  ['PLU/BLDG 22-1424 PLU', 'IN-SUITE AND EXTERIOR KITEC PIPING REPLACEMENT (24 SUITES)', 24],
  ['HVACHOUS 21-6892', 'REPLACE FURNACE FOR UNITS 1 2 5 8 9 10 12 20 22 23 26 27 28 - 13 UNITS TOTAL', 13],
  ['BP 9X 1', 'BALCONY GUARD REPLACEMENT (120 UNITS)', 120],
  ['BP 9X 2', 'WINDOW REPLACEMENT FOR 88 SUITES', 88],
  ['BP 9X 3', 'ROOF REPAIRS - 40 UNITS', 40],
  ['BP 9X 4', 'FIRE ALARM UPGRADE THROUGHOUT 200 UNITS', 200],
  ['BP 9X 5', 'SPRINKLER RETROFIT, 150 SUITES', 150],
  ['BP 9X 6', 'ELEVATOR MODERNIZATION - 96 UNIT APARTMENT', 96],
  ['BP 9X 7', 'RE-CLADDING OF EXISTING 12 STOREY APARTMENT (140 UNITS)', 140],
  ['BP 9X 8', 'PLUMBING RISER WORK - 60 UNITS', 60],
];

test('repair and replacement permits add no homes, whatever count they state', () => {
  for (const [ref, d, n] of REPAIRS) {
    const r = permit(ref, d, n);
    assert.equal(P.permitAddsUnits(r), false, d);
    assert.equal(P.permitRole(r), 'none', `${d}: not a building of homes`);
    assert.equal(P.permitUnits([r]), 0, d);
  }
});

test('a second unit and a new building still count, even beside replacement work', () => {
  const homes = [
    [permit('SEC UNIT 21-9072 SU', 'RESIDENTIAL SECOND UNIT IN BASEMENT WITH BELOW GRADE STAIRWELL', 1), 1, 'suite'],
    [permit('SEC UNIT 25-10424 ARU', 'RESIDENTIAL SECOND & THIRD UNIT IN BASEMENT BELOW GRADE STAIRWELL 2 NEW WINDOWS ENLARGE 1 EGRESS WINDOW', 1), 1, 'suite'],
    [permit('BP 9ALT 24-329 ARU', 'RESIDENTIAL UNIT IN BASEMENT WITH EXISTING ABOVE GROUND ENTRANCE IN SIDE YARD & NEW EGRESS WINDOWS (ARU)', 1), 1, 'suite'],
    [permit('BP 9NEW 1', 'NEW 2 STOREY DETACHED DWELLING - REPLACE EXISTING HOUSE', 1), 1, 'units'],
    [permit('BP 9NEW 2', 'DEMOLISH EXISTING HOUSE AND BUILD A REPLACEMENT DWELLING', 1), 1, 'units'],
    [permit('BP 3NEW 16-4285 COM', 'NEW 22 STOREY APARTMENT (344 UNITS) WITH 3 LEVELS OF PARKING GARAGE', 344), 344, 'units'],
  ];
  for (const [r, n, role] of homes) {
    assert.equal(P.permitAddsUnits(r), true, r.description);
    assert.equal(P.permitUnits([r]), n, r.description);
    assert.equal(P.permitRole(r), role, r.description);
  }
});

test('the infill layer counts the new building, not the Kitec replacement', () => {
  const site = recs => ({ municipality: 'Mississauga', kinds: ['permit'], phase: 'completed', records: recs });
  const out = L.infill([
    site([permit('PLU/BLDG 21-9302 PLU', 'IN-SUITE KITEC PIPING REPLACEMENT - 340 UNITS IN TOTAL', 340)]),
    site([permit('HVACHOUS 21-6892', 'REPLACE FURNACE FOR UNITS 1 2 5 8 9 10 12 20 22 23 26 27 28 - 13 UNITS TOTAL', 13)]),
    site([permit('SEC UNIT 21-9072 SU', 'RESIDENTIAL SECOND UNIT IN BASEMENT', 1)]),
    site([permit('BP 3NEW 17-6203', 'NEW 3-STOREY RESIDENTIAL BUILDING (19 UNITS)', 19)]),
  ], { census: new Date('2021-05-11T00:00:00Z') });
  assert.equal(out.units, 20);
  assert.equal(out.suites, 1);
  assert.equal(out.buildings, 19);
});
