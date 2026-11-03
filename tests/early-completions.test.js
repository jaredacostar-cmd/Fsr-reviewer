'use strict';
/* Closed permits that can't be the finished building (js/phases.js holdEarlyCompletions, decided
 * 2026-11-03): a stage permit (partial, or conditional for only the foundation / below grade / parking
 * structure), or 100+ homes closed within 18 months of issue, is held at construction.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');

const permit = (o) => ({
  kind: 'permit', municipality: 'Mississauga', phase: 'completed', statusRaw: 'COMPLETED -ALL INSP SIGNED OFF', units: 430,
  events: [{ date: new Date('2022-01-01'), phase: 'permit', label: 'ISSUE_DATE' }, { date: new Date('2025-01-16'), phase: 'completed', label: 'COMPLETE_DATE' }], ...o,
});

test('a partial permit is a stage, not the building', () => {
  assert.equal(P.earlyCompletion(permit({ units: 1002, description: 'PARTIAL PERMIT - FTR - NEW (48) & (37) STOREY APT BLDG' })), 'stage');
});
test('a conditional permit for the parking structure only is a stage', () => {
  assert.equal(P.earlyCompletion(permit({ units: 40, description: 'CONDITIONAL PERMIT - 1 LVL U/G PARKING STRUCTURE TO SUPPORT (3) BLKS OF STACKED TOWNHOUSES' })), 'stage');
});
test('a superstructure stage or a full conditional permit is the building', () => {
  assert.equal(P.earlyCompletion(permit({ units: 855, description: 'CONDITIONAL PERMIT – FTR SUPERSTRUCTURE ONLY ABOVE 31 FLR' })), null);
  assert.equal(P.earlyCompletion(permit({ units: 437, description: 'FULL CONDITIONAL PERMIT– NEW (42) STOREY MIX USE BLDG' })), null);
});
test('100+ homes closed within 18 months of issue are not the finished building', () => {
  const fast = permit({ description: 'NEW (36) STOREY RESIDENTIAL BLDG - M5 BLDG',
    events: [{ date: new Date('2024-04-05'), phase: 'permit', label: 'ISSUE_DATE' }, { date: new Date('2025-01-16'), phase: 'completed', label: 'COMPLETE_DATE' }] });
  assert.equal(P.earlyCompletion(fast), 'fast');
  assert.equal(P.earlyCompletion({ ...fast, units: 60 }), null, 'a small building can be that quick');
  assert.equal(P.earlyCompletion(permit({ description: 'NEW (36) STOREY RESIDENTIAL BLDG' })), null, 'three years is a building');
});
test('a fast closure is re-dated to issue + 30 months, marked estimated, and still counts', () => {
  const r = permit({ description: 'NEW (36) STOREY RESIDENTIAL BLDG - M5 BLDG',
    events: [{ date: new Date('2024-04-05'), phase: 'permit', label: 'ISSUE_DATE' }, { date: new Date('2025-01-16'), phase: 'completed', label: 'COMPLETE_DATE' }] });
  assert.equal(P.holdEarlyCompletions([r]), 1);
  assert.equal(r.phase, 'completed');
  assert.equal(r.completedEstimated, true);
  const done = r.events.filter(e => e.phase === 'completed');
  assert.equal(done.length, 1);
  assert.ok(Math.abs(+done[0].date - (Date.parse('2024-04-05') + 30 * 30.4375 * 864e5)) < 864e5);
  assert.equal(P.holdEarlyCompletions([r]), 0, 'estimated dates are not re-read');
});
test('held stage permits stay permitted, not completed', () => {
  const r = permit({ units: 1002, description: 'PARTIAL PERMIT - FTR - NEW (48) & (37) STOREY APT BLDG' });
  assert.equal(P.holdEarlyCompletions([r]), 1);
  assert.equal(r.phase, 'construction');
  assert.equal(r.completionHeld, 'stage');
  assert.equal(P.holdEarlyCompletions([r]), 0, 'running twice changes nothing');
});
