'use strict';
/* Water room-left / trigger-year tests (Phase 4, Worker D): the pure computations behind
 * the Capacity sub-view's "Room left & trigger years" table, extracted from js/app.js.
 *
 * js/app.js is a browser IIFE, so — as in tests/verdict.test.js — these tests read it as
 * source and evaluate the pure functions standalone.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// Extract a `const name = (args) => { ... };` and evaluate it standalone (pure only).
function extractFn(name) {
  const m = new RegExp(`const ${name} = (\\([\\s\\S]*?\\n  \\});`).exec(APP);
  assert.ok(m, `const ${name} not found in js/app.js`);
  return new Function(`return (${m[1]});`)();
}

const roomTrigger = extractFn('roomTrigger');
const storageRoomTrigger = extractFn('storageRoomTrigger');

const PH = { year0: 2025, aStart: 2026, aYears: 5, pStart: 2028, pYears: 10, end: 2051 };

test('roomTrigger: room left at build-out and 80/90/100% crossing years', () => {
  // today 50, +20 approved (2026–2030), +30 proposed (2028–2037) → 100 at build-out.
  const r = roomTrigger(100, { today: 50, approved: 20, proposed: 30 }, PH);
  assert.equal(r.room, 0);
  assert.equal(r.roomPct, 0);
  assert.equal(r.c80, 2031);   // 50 + 20 + 30×0.4 = 82 ≥ 80
  assert.equal(r.c90, 2034);   // 50 + 20 + 30×0.7 = 91 ≥ 90
  assert.equal(r.c100, 2037);  // fully phased in
});

test('roomTrigger: already at the trigger reads "today"; never-reached reads null', () => {
  const r = roomTrigger(100, { today: 95, approved: 0, proposed: 0 }, PH);
  assert.equal(r.room, 5);
  assert.equal(r.roomPct, 5);
  assert.equal(r.c80, 'today');
  assert.equal(r.c90, 'today');
  assert.equal(r.c100, null);
});

test('roomTrigger: plenty of room → null crossings, positive room', () => {
  const r = roomTrigger(1000, { today: 50, approved: 20, proposed: 30 }, PH);
  assert.equal(r.room, 900);
  assert.equal(r.roomPct, 90);
  assert.equal(r.c80, null);
  assert.equal(r.c90, null);
  assert.equal(r.c100, null);
});

test('roomTrigger: no capacity → nulls', () => {
  const r = roomTrigger(0, { today: 50, approved: 20, proposed: 30 }, PH);
  assert.equal(r.c80, null);
  assert.equal(r.c90, null);
  assert.equal(r.c100, null);
  assert.equal(r.roomPct, null);
});

test('roomTrigger: approved ramps evenly from aStart over aYears', () => {
  // Only approved growth: 0 today, +100 over 2026–2030 → 20/yr; 80% of 100 hit in 2029.
  const r = roomTrigger(100, { today: 0, approved: 100, proposed: 0 }, PH);
  assert.equal(r.c80, 2029);
  assert.equal(r.c100, 2030);
});

test('storageRoomTrigger: Silverthorn Reservoir (short by 2041)', () => {
  const years = [2019, 2021, 2026, 2031, 2036, 2041];
  const r = storageRoomTrigger(years, [31, 31, 43, 44, 46, 49], [46, 46, 46, 46, 46, 46]);
  assert.equal(r.room, -3);
  assert.ok(Math.abs(r.roomPct - (-3 / 46 * 100)) < 1e-9);
  assert.equal(r.c100, 2036);  // required hits 46 ML between 2031 (44) and 2036 (46)
  assert.equal(r.c90, 2025);   // 90% of 46 = 41.4 between 2021 (31) and 2026 (43)
  assert.equal(r.c80, 2023);   // 80% of 46 = 36.8 between 2021 (31) and 2026 (43)
});

test('storageRoomTrigger: West Brampton Reservoir trigger interpolates to 2029', () => {
  const years = [2019, 2021, 2026, 2031, 2036, 2041];
  const r = storageRoomTrigger(years, [31, 32, 34, 44, 46, 49], [40, 40, 40, 40, 40, 40]);
  assert.equal(r.room, -9);
  assert.equal(r.c100, 2029);  // 40 ML between 2026 (34) and 2031 (44)
});

test('storageRoomTrigger: future facility with room → positive room, null crossings', () => {
  const years = [2019, 2021, 2026, 2031, 2036, 2041];
  const r = storageRoomTrigger(years, [0, 0, 18, 19, 19, 19], [0, 0, 40, 40, 40, 40]);
  assert.equal(r.room, 21);
  assert.equal(r.c80, null);
  assert.equal(r.c90, null);
  assert.equal(r.c100, null);
});

test('water tab restructure: no per-tab scenario stamp, ModelChecks exposed, hydro pane target', () => {
  assert.ok(!/stampHTML\('water'/.test(APP), 'stampHTML(water) call sites removed');
  assert.ok(/window\.ModelChecks\s*=\s*window\.ModelChecks\s*\|\|\s*\{\}/.test(APP), 'window.ModelChecks defined');
  assert.ok(/ModelChecks\.waterProduction\s*=/.test(APP), 'ModelChecks.waterProduction defined');
  assert.ok(/ModelChecks\.caledonGroundwater\s*=/.test(APP), 'ModelChecks.caledonGroundwater defined');
  assert.ok(/<section id="hyd-box"/.test(APP), 'hydroBoxHTML renders #hyd-box');
  assert.ok(/\$\('#hyd-box'\)/.test(APP), 'renderSvcTab targets #hyd-box');
  assert.ok(/beta/.test(APP), 'hydro check labelled beta');
});
