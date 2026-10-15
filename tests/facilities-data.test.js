'use strict';
// Facility registry (wastewater pumping stations with Master Plan capacity, water facilities, DC
// facilities) and the candidate rules for capital work at a facility.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../scripts/facilities-lib.js');
const C = require('../scripts/capital-lib.js');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', f), 'utf8'));

test('station names reduce to their core words', () => {
  assert.equal(F.stationKey('BOLTON N HILL SEWAGE PUMPING'), F.stationKey('Bolton North Hill'));
  assert.equal(F.stationKey('RICHARD MEMORIAL SEW. PUMP STN'), F.stationKey("Richard's Memorial"));
  assert.equal(F.stationKey("O'NEIL CT SEWAGE PUMPING STN"), F.stationKey("O'Neil Court"));
  assert.equal(F.stationKey('CALEDON E SEWAGE PUMPING STN'), F.stationKey('Caledon East'));
  assert.notEqual(F.stationKey('BOLTON SEWAGE PUMPING STN'), F.stationKey('Bolton North Hill'));
  assert.equal(F.stationKind('BRITANNIA LEACHATE PUMPING STN'), 'leachate');
  assert.equal(F.stationKind('SEWER LIFT STATION - GREEN GL'), 'lift');
});

test('every Master Plan Table 6 station is located; capacities carried over', () => {
  const j = read('data/ww-facilities.json');
  const table = read('scripts/ww-pumping-stations.json').stations;
  assert.deepEqual(j.unlocated, []);
  assert.equal(j.facilities.filter(f => f.firmLs != null).length, table.length);
  const mcv = j.facilities.find(f => f.name === 'McVean Drive');
  assert.deepEqual([mcv.firmLs, mcv.pumps, mcv.role, mcv.mpSystem], [1400, 3, 'Trunk', 'McVean']);
  assert.match(mcv.mpNote, /700 L\/s/);
  for (const f of j.facilities) assert.ok(Array.isArray(f.lnglat) && f.lnglat[0] < -79 && f.lnglat[1] > 43.4, f.name);
});

test('registry merges DC facilities into located ones by name; look-alike names stay apart', () => {
  const sv = read('data/servicing.json');
  const reg = F.registry({ waterFacilities: read('data/water-facilities.json').facilities, wwFacilities: read('data/ww-facilities.json').facilities, wwPlants: sv.plants, dcInfra: read('data/dc-infra.json') });
  const by = n => reg.find(r => r.name === n);
  assert.equal(by('A.P. Kennedy').dcName, 'Arthur P. Kennedy Water Treatment Plant');
  assert.equal(by('Lakeview').dcName, 'G.E. Booth Water Resource Recovery Facility');
  assert.equal(by('Clarkson').dcName, 'Clarkson Water Resource Recovery Facility', 'the Clarkson plant, not the Clarkson pumping station');
  assert.equal(reg.find(r => r.name === 'Clarkson' && r.kind === 'pumping_station').dcName, undefined);
  assert.ok(by('Hanlan West') && by('Hanlan').dcName === 'Hanlan', 'Hanlan West is a separate (new) facility');
  assert.ok(by('Jack Darling 3 Sewer Pumping Station'), 'Jack Darling 3 is not Jack Darling 2');
  assert.equal(reg.filter(r => /leachate/i.test(r.name)).length, 0, 'leachate stations left out');
});

const fac = [{ key: 'water:t1', name: 'Tank', system: 'water', kind: 'elevated_tank', lnglat: [-79.80, 43.70], dcName: 'Tank' }];
const rec = (id, attrs, coords) => Object.assign(C.toRecord({ attributes: attrs, geometry: { paths: [coords] } }, 0), { id });
const RECS = [
  rec('a', { WorkType: 'WM', ProjectNumber: '30-1946' }, [[-79.8000, 43.7004], [-79.7990, 43.7004]]),   // ≈ 45 m, same project
  rec('b', { WorkType: 'WM' }, [[-79.8000, 43.7010], [-79.7990, 43.7010]]),                              // ≈ 110 m
  rec('c', { WorkType: 'SAN' }, [[-79.8000, 43.7002], [-79.7990, 43.7002]]),                             // ≈ 22 m, other system
  rec('d', { WorkType: 'WM-REHAB EXCAVATION' }, [[-79.8000, 43.7003], [-79.7990, 43.7003]]),             // ≈ 33 m, rehab
];
const DCF = { water: [{ name: 'Tank', items: [{ what: 'New Elevated Tank', proj: '30-1946', phases: [['C', 2030, '1']] }] }], wastewater: [] };

test('distance from a facility point to a capital line', () => {
  const m = F.distToRecord([-79.80, 43.70], RECS[1]);
  assert.ok(m > 100 && m < 120, `${m}`);
});

test('facility ↔ capital rules: project, near, same system, no rehabilitation', () => {
  const ids = rule => F.facilityCapitalLinks(fac, RECS, rule, DCF).map(l => l.capital).sort();
  assert.deepEqual(ids('project'), ['a']);
  assert.deepEqual(ids('near:50'), ['a', 'c', 'd']);
  assert.deepEqual(ids('near:200'), ['a', 'b', 'c', 'd']);
  assert.deepEqual(ids('nearsys:50'), ['a', 'd']);
  assert.deepEqual(ids('nearsysnew:50'), ['a']);
  assert.deepEqual(ids('nearsysnew:200'), ['a', 'b']);
});

test('rule model reports counts and agreement with the project rule', () => {
  const m = F.modelRules(fac, RECS, ['near:50', 'nearsysnew:200'], DCF);
  assert.deepEqual([m['near:50'].links, m['near:50'].facilitiesLinked, m['near:50'].agreesWithProject], [3, 1, 1]);
  assert.equal(m['nearsysnew:200'].links, 2);
  assert.ok(m['near:50'].byWorkType.SAN === 1);
});
