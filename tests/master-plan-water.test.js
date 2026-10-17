'use strict';
// data/master-plan-water.json is transcribed from the 2020 Master Plan, Volume 3. These tests check the
// transcription against the plan's own totals, so a typo in one cell shows up as a failed sum.
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../data/master-plan-water.json');

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);
const sum = a => a.reduce((s, x) => s + x, 0);
const yearOf = s => (/^\d{4}$/.test(s) ? +s : Infinity); // 'Post-2041' never counts

test('three trunk systems, every trunk has five years of demand and capacity', () => {
  assert.deepEqual([...new Set(D.trunks.map(t => t.system))].sort(), ['C', 'E', 'W']);
  for (const t of D.trunks) {
    for (const k of ['demandMLd', 'theoreticalMLd', 'actualMLd', 'status']) assert.equal(t[k].length, 5, `${t.id} ${k}`);
    assert.ok(t.mains.length >= 1, `${t.id} has mains`);
  }
});

// The plan is not consistent about a main that enters service in a table year: West Caledon (2026)
// first counts in 2031, the Tullamore–North Brampton main (2026) already counts in 2026. Accept either.
test('trunk capacity in each year = sum of the mains in service by then', () => {
  for (const t of D.trunks) {
    D.years.forEach((y, i) => {
      for (const k of ['actualMLd', 'theoreticalMLd']) {
        const by = cmp => sum(t.mains.filter(m => cmp(yearOf(m.inService), y)).map(m => m[k]));
        const ok = [by((a, b) => a <= b), by((a, b) => a < b)].some(v => Math.abs(v - t[k][i]) <= 2);
        assert.ok(ok, `${t.id} ${k} ${y}: ${t[k][i]} vs mains ${by((a, b) => a <= b)}`);
      }
    });
  }
});

test('the plan’s ok / not ok flags match demand vs actual capacity', () => {
  for (const t of D.trunks) D.years.forEach((y, i) => {
    const ok = t.demandMLd[i] <= t.actualMLd[i];
    assert.equal(t.status[i] === 'ok', ok, `${t.id} ${y}: demand ${t.demandMLd[i]} cap ${t.actualMLd[i]}`);
  });
});

test('system demand rows add to the Peel totals (Table 8)', () => {
  const s = D.systemDemand;
  s.years.forEach((y, i) => {
    near(s.W[i] + s.C[i] + s.E[i] + s.B[i], s.peelTotal[i], 1, `Peel ${y}`);
    near(s.peelTotal[i] + s.york[i], s.peelTotalInclYork[i], 1, `Peel+York ${y}`);
  });
});

test('2041 sub-zones add up to each system’s 2041 demand', () => {
  const rows = D.subzones2041.rows, s = D.systemDemand, i = s.years.indexOf(2041);
  for (const sys of ['W', 'C', 'E', 'B']) {
    near(sum(rows.filter(r => r.system === sys).map(r => r.mddMLd)), s[sys][i], 1, `sub-zones ${sys}`);
  }
  for (const r of rows) assert.ok(r.phdMLd > r.mddMLd, `${r.id} PHD > MDD`);
});

test('West demand = Lorne Park demand; Central + East = A.P. Kennedy demand less York (Table 9)', () => {
  const s = D.systemDemand, p = D.treatmentPlants;
  const lp = p.rows.find(r => /Lorne Park/.test(r.plant)), apk = p.rows.find(r => /Kennedy/.test(r.plant));
  p.years.forEach((y, k) => {
    const i = s.years.indexOf(y);
    near(lp.demandMLd[k], s.W[i], 1, `Lorne Park ${y}`);
    near(apk.demandMLd[k], s.C[i] + s.E[i] + s.B[i] + s.york[i], 2, `A.P. Kennedy ${y}`);
  });
});

test('pumping stations: firm never exceeds installed; the suspect transfer value is flagged', () => {
  for (const p of D.pumpingStations.rows) assert.ok(p.firmMLd <= p.installedMLd, `${p.facility} ${p.pumps}`);
  const odd = D.pumpingStations.rows.filter(p => p.actualFirmMLd != null && p.actualFirmMLd > p.installedMLd * 1.5);
  assert.deepEqual(odd.map(p => p.pumps), ['Transfer']);
  assert.ok(odd[0].note, 'transfer row carries a note');
});
