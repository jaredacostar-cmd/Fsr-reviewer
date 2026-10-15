'use strict';
// SPEC 1.4: one capacity function. The core is pure: the layered flows against rated / firm capacity
// give every % (always of rated or firm, never of the 90% trigger), the uncommitted reserve (to 100%)
// and the room to the trigger, under fixed names.
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/capacity.js');

test('a plant: G.E. Booth — reserve to 100% of rated, room to the 90% trigger, % of rated', () => {
  const k = C.compute({ rated: 518, existing: 450, built: 0, committed: 487.6, buildout: 530 });
  assert.equal(k.cap, 518);
  assert.ok(Math.abs(k.reserve - 30.4) < 1e-9, 'uncommitted reserve 30.4 ML/d (D-5-1, to 100% of rated)');
  assert.ok(Math.abs(k.room - (-21.4)) < 1e-9, 'room to the 90% trigger −21.4 ML/d (a different figure, a different name)');
  assert.equal(Math.round(k.pctCommitted), 94);
  assert.equal(Math.round(k.pctBuildout), 102);
  assert.equal(C.pctTxt(k.pctBuildout), '102%');
  assert.equal(k.proposed, 530 - 487.6);
});

test('% is of rated capacity, never of the trigger (South Peel 54 → 67, not 60 → 75)', () => {
  const k = C.compute({ rated: 1700, existing: 810, committed: 918, buildout: 1139 });
  assert.equal(Math.round(k.pctCommitted), 54);
  assert.equal(Math.round(k.pctBuildout), 67);
});

test('a pumping station: against its firm capacity, its trigger is the firm capacity itself', () => {
  const k = C.compute({ firm: 100, existing: 80, committed: 95, buildout: 110 });
  assert.equal(k.cap, 100);
  assert.equal(k.reserve, 5);
  assert.equal(k.room, 5);
  assert.equal(Math.round(k.pctBuildout), 110);
});

test('layers never run backwards: committed ≥ existing + built, build-out ≥ committed', () => {
  const k = C.compute({ rated: 10, existing: 6, built: 1, committed: 5, proposed: 2 });
  assert.equal(k.committed, 7);
  assert.equal(k.buildout, 9);
  assert.equal(k.proposed, 2);
  assert.equal(Math.round(k.pctToday), 70);
});

test('the same inputs give the same answer, wherever it is asked (no state)', () => {
  const x = { rated: 0.243, existing: 0.102, committed: 0.11, buildout: 0.12, triggerYear: 2031 };
  assert.deepEqual(C.compute(x), C.compute({ ...x }));
  assert.equal(C.compute(x).triggerYear, 2031);
});
