'use strict';
// Multi-phase / multi-tower developments. Cases mirror real records seen in the
// Mississauga and Brampton data (October 2026 diagnostic run).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');

const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const pt = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const appF = P.detectFields([{ name: 'FILE_NO' }, { name: 'ADDRESS' }, { name: 'TYPE_DESC' }, { name: 'STATUS' }, { name: 'DESCRIPTION' },
  { name: 'UNITS', type: 'esriFieldTypeInteger' }, { name: 'APPLICATION_DATE', type: 'esriFieldTypeDate' }]);
const bpF = P.detectFields([{ name: 'BP_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'DESCRIPTION' }, { name: 'SCOPE' },
  { name: 'RES_UNITS', type: 'esriFieldTypeInteger' }, { name: 'ISSUE_DATE', type: 'esriFieldTypeDate' }]);
const M = 'Mississauga';
let id = 0;
const app = (geom, props, srcId = 'sp') => P.normalizeRecord({ type: 'Feature', id: ++id, geometry: geom, properties: props }, appF, { id: srcId, municipality: M, kind: 'application' });
const bp = (geom, props, srcId = 'bp') => P.normalizeRecord({ type: 'Feature', id: ++id, geometry: geom, properties: { SCOPE: 'NEW BUILDING', ...props } }, bpF, { id: srcId, municipality: M, kind: 'permit' });
const D = (y, m = 0) => Date.UTC(y, m, 1);
const build = recs => P.buildProjects(P.dedupeRecords(recs));

test('canonical file numbers merge spellings and drop stage suffixes', () => {
  const same = (...refs) => assert.equal(new Set(refs.map(P.canonRef)).size, 1, refs.join(' / '));
  same('SP 22-60', 'SP 22 60', 'SP 22/060 W9', 'SP 22/060');
  same('OZ/OPA 24-15', 'OZ/OPA 24 15');
  same('BP 3NEW 17-9012', 'BP 3NEW 17-9012 CON', 'BP 3NEW 17-9012 CR1', 'BP 3NEW 17-9012 CR2', 'BP 3NEW 17 9012');
  same('BP 3NEW 18-187 COM', 'BP 3NEW 18-187 FTR', 'BP 3NEW 18 187');
  same('00-100302-000-00', '00-100302-001-00');
  same('SP 25-14', 'SP 25/O14');
  assert.notEqual(P.canonRef('SP 17/162'), P.canonRef('SP 17/050'));
  assert.notEqual(P.canonRef('SPM 19/091'), P.canonRef('SP 19/091'));
});

test('a basement second suite (alteration) adds a unit; a revision permit does not', () => {
  const suite = bp(pt(-79.6, 43.6), { BP_NO: 'BP 9ALT 23-1001', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '12 Oak St', SCOPE: 'ALTERATION TO EXISTING BLDG', DESCRIPTION: 'NEW SECOND UNIT IN BASEMENT', RES_UNITS: 1, ISSUE_DATE: D(2023) });
  assert.equal(P.permitAddsUnits(suite), true);
  const rev = bp(pt(-79.6, 43.6), { BP_NO: 'BP 9ALT 24-3057', SCOPE: 'ALTERATION TO EXISTING BLDG', DESCRIPTION: 'REVISION TO BP 24-1664 - CHANGE TO DETAIL D15', RES_UNITS: 12, ISSUE_DATE: D(2024) });
  assert.equal(P.permitAddsUnits(rev), false);
});

test('stages and minor files', () => {
  const st = (ref, type, description = '') => P.stageOf({ ref, type, description });
  assert.equal(st('SP 22/060 W9', 'SITE PLAN'), 'siteplan');
  assert.equal(st('SP 22 60', 'Downtown Core'), 'siteplan');
  assert.equal(st('OZ/OPA 24-15', 'REZONING'), 'master');
  assert.equal(st('21T-M 26-3', 'SUBDIVISION'), 'master');
  assert.equal(st('21CDM-M 24-9', 'CONDOMINIUM'), 'condo');
  assert.equal(st('OZS-2025-0042', 'OPA ZBA Subdivision'), 'master');
  assert.equal(st('SPA-2022-0122', 'Site Plan Approval'), 'siteplan');
  assert.equal(st('DPC-2021-0007', 'Draft Plan of Condo'), 'condo');
  assert.equal(st('DPS-2022-0004', 'Development Permit System'), 'siteplan');
  assert.equal(st('PRE-2024-0012', 'Pre Consultation'), 'precon');
  assert.equal(P.isMinorFile({ ref: 'SPM 24/45', type: 'SITE PLAN' }), true);
  assert.equal(P.isMinorFile({ ref: 'SPAX 24/18', type: 'SITE PLAN EXPRESS' }), true);
  assert.equal(P.isMinorFile({ ref: 'SPA-2023-0104', type: 'Site Plan Approval', description: 'Limited Site Plan — Proposed open patio' }), true);
  assert.equal(P.isMinorFile({ ref: 'SP 19/36', type: 'SITE PLAN' }), false);
});

test('3980 Confederation Pkwy: three tower site plans add up; tower permits count once each', () => {
  const lot = rect(-79.6440, 43.5870, -79.6400, 43.5900);
  const recs = [
    app(rect(-79.6440, 43.5870, -79.6425, 43.5885), { FILE_NO: 'SP/19/36', TYPE_DESC: 'SITE PLAN', STATUS: 'Approved', ADDRESS: '3980 Confederation Pkwy', UNITS: 949, APPLICATION_DATE: D(2019, 2) }),
    app(rect(-79.6425, 43.5870, -79.6410, 43.5885), { FILE_NO: 'SP 17/162', TYPE_DESC: 'SITE PLAN', STATUS: 'Approved', ADDRESS: '3980 Confederation Pkwy', UNITS: 793, APPLICATION_DATE: D(2017, 9) }),
    app(rect(-79.6410, 43.5870, -79.6400, 43.5885), { FILE_NO: 'SP 17/050', TYPE_DESC: 'SITE PLAN', STATUS: 'Approved', ADDRESS: '3980 Confederation Pkwy', UNITS: 783, APPLICATION_DATE: D(2017, 2) }),
    // Same Phase-1 file again from the monthly layer (no polygon, different spelling).
    app(pt(-79.6418, 43.5880), { FILE_NO: 'SP 17-50', TYPE_DESC: 'SITE PLAN', STATUS: 'APPROVED', ADDRESS: '3980 Confederation Pkwy', UNITS: 783 }, 'devapps'),
    app(lot, { FILE_NO: '21CDM-M 25-7', TYPE_DESC: 'CONDOMINIUM', STATUS: 'REGISTERED', ADDRESS: '3980 Confederation Pkwy', DESCRIPTION: 'Standard condo application for 949 units', APPLICATION_DATE: D(2025) }),
    // Tower 1 (783): conditional, two revisions, full permit, and the growth-management copy.
    ...['BP 3NEW 17-9012 CON', 'BP 3NEW 17-9012 CR1', 'BP 3NEW 17-9012 CR2', 'BP 3NEW 17-9012'].map(n =>
      bp(pt(-79.6405, 43.5878), { BP_NO: n, STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '3980 CONFEDERATION PKY', RES_UNITS: 783, ISSUE_DATE: D(2019) })),
    bp(pt(-79.6405, 43.5878), { BP_NO: 'BP 3NEW 17 9012', ADDRESS: '3980 Confederation PKY', RES_UNITS: 783, ISSUE_DATE: D(2019) }, 'gm'),
    // Tower 2 (952) and tower 3 (793) at their own addresses.
    bp(pt(-79.6430, 43.5878), { BP_NO: 'BP 3NEW 20-98 CON', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '448 BURNHAMTHORPE RD W', RES_UNITS: 952, ISSUE_DATE: D(2020) }),
    bp(pt(-79.6418, 43.5878), { BP_NO: 'BP 3NEW 18-1337 CON', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '3883 QUARTZ RD', RES_UNITS: 793, ISSUE_DATE: D(2018) }),
  ];
  const projects = build(recs);
  assert.equal(projects.length, 1);
  const b = projects[0].buildout;
  assert.equal(b.planned, 949 + 793 + 783, 'three tower site plans, the duplicate Phase-1 copy counted once');
  assert.equal(b.basis, 'siteplan');
  assert.equal(b.permitted, 783 + 952 + 793);
  assert.equal(b.remaining, 0);
  assert.equal(projects[0].units, 2528);
  // Per-phase: each tower's permit falls inside its own site plan polygon.
  const ph = Object.fromEntries(b.phases.map(x => [x.ref, x]));
  assert.equal(ph['SP 17/050'].permitted, 783);
  assert.equal(ph['SP 17/162'].permitted, 793);
  assert.equal(ph['SP/19/36'].permitted, 952);
});

test('2475 Eglinton Ave W: minor site plan adds nothing; servicing and alteration permits add no units', () => {
  const lot = rect(-79.7120, 43.5490, -79.7080, 43.5520);
  const recs = [
    app(lot, { FILE_NO: 'SP 19/148', TYPE_DESC: 'SITE PLAN', STATUS: 'Approved', ADDRESS: '2475 Eglinton Ave West', UNITS: 565, APPLICATION_DATE: D(2019, 11) }),
    app(lot, { FILE_NO: 'SP 21/020', TYPE_DESC: 'SITE PLAN', STATUS: 'Approved', ADDRESS: '2475 Eglinton Avenue West', UNITS: 351, APPLICATION_DATE: D(2021, 1) }),
    app(lot, { FILE_NO: 'SPM 24/45', TYPE_DESC: 'SITE PLAN', STATUS: 'Approved', ADDRESS: '2495 Eglinton Avenue West', DESCRIPTION: 'Site Plan minor for revisions to Site Plan', UNITS: 351, APPLICATION_DATE: D(2024, 10) }),
    bp(pt(-79.7100, 43.5500), { BP_NO: 'BP 3NEW 21-7746 CON', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '2495 EGLINTON AVE W', RES_UNITS: 325, ISSUE_DATE: D(2021) }),
    bp(pt(-79.7100, 43.5500), { BP_NO: 'BP 3NEW 21 7746', ADDRESS: '5065 Erin Mills PKY', RES_UNITS: 325, ISSUE_DATE: D(2021) }, 'gm'),
    bp(pt(-79.7095, 43.5505), { BP_NO: 'BP 3NEW 21-7018 FTR', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '2485 EGLINTON AVE W', RES_UNITS: 317, ISSUE_DATE: D(2021) }),
    bp(pt(-79.7105, 43.5495), { BP_NO: 'BP 3NEW 21-7093 FTR', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '2465 EGLINTON AVE W', RES_UNITS: 246, ISSUE_DATE: D(2021) }),
    bp(pt(-79.7100, 43.5500), { BP_NO: 'BP 9ALT 24-3057', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '2495 EGLINTON AVE W', SCOPE: 'ALTERATION TO EXISTING BLDG', DESCRIPTION: 'REVISION TO BP 21-7746', RES_UNITS: 12, ISSUE_DATE: D(2024) }),
    bp(pt(-79.7100, 43.5500), { BP_NO: 'DRAIN 22-2790 SS', STATUS: 'COMPLETED -ALL INSP SIGNED OFF', ADDRESS: '2495 EGLINTON AVE W', SCOPE: 'OTHER', DESCRIPTION: 'SITE SERVICING FOR NEW BUILDING', RES_UNITS: 325, ISSUE_DATE: D(2022) }),
  ];
  const p = build(recs)[0];
  assert.equal(p.buildout.planned, 565 + 351, 'the minor (SPM) file repeats an earlier plan');
  assert.equal(p.buildout.permitted, 325 + 317 + 246, 'growth-management copy, alteration and drain permits add nothing');
  assert.equal(p.buildout.remaining, 916 - 888);
});

test('one file under three spellings is counted once; rezoning resubmissions take the largest', () => {
  const lot = rect(-79.6450, 43.5880, -79.6430, 43.5900);
  const kariya = [
    app(pt(-79.644, 43.589), { FILE_NO: 'SP 22-60', TYPE_DESC: 'SITE PLAN', STATUS: 'WITHHELD', ADDRESS: '3672 Kariya Drive', DESCRIPTION: '2 towers 54 storeys each' }, 'devapps'),
    app(pt(-79.644, 43.589), { FILE_NO: 'SP 22 60', TYPE_DESC: 'Downtown Core', STATUS: 'Withheld', ADDRESS: '3672 Kariya Drive', UNITS: 2648 }, 'gm'),
    app(lot, { FILE_NO: 'SP 22/060', TYPE_DESC: 'SITE PLAN', STATUS: 'Active', ADDRESS: '3672 Kariya Drive', UNITS: 2648, APPLICATION_DATE: D(2022, 3) }),
  ];
  const projects = build(kariya);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].records.length, 1, 'three spellings merge into one record');
  assert.equal(projects[0].buildout.planned, 2648);

  const B = { id: 'opa', municipality: 'Brampton', kind: 'application' };
  const oz = (ref, d) => P.normalizeRecord({ type: 'Feature', id: ++id, geometry: rect(-79.76, 43.73, -79.758, 43.732),
    properties: { FILE_NO: ref, TYPE_DESC: 'OPA ZBA Subdivision', STATUS: 'Under Appeal', ADDRESS: '2 County Court Blvd', UNITS: 1610, APPLICATION_DATE: d } }, appF, B);
  const p = P.buildProjects([oz('OZS-2023-0003', D(2023)), oz('OZS-2025-0042', D(2025))])[0];
  assert.equal(p.buildout.planned, 1610, 'a resubmitted rezoning is the same proposal');
});

test('plannedFromApps: largest of rezoning total, site plans added up, condos added up', () => {
  const a = (ref, type, units, extra = {}) => ({ kind: 'application', phase: 'approved', ref, type, units, fileKey: P.canonRef(ref), events: [], ...extra });
  const r = P.plannedFromApps([
    a('OZS-2019-0007', 'OPA ZBA Subdivision', 1157),
    a('SPA-2024-0097', 'Site Plan Approval', 84), a('SPA-2025-0167', 'Site Plan Approval', 154), a('SPA-2025-0106', 'Site Plan Approval', 434),
    a('DPC-2024-0009', 'Draft Plan of Condo', 434),
    a('PRE-2018-0001', 'Pre Consultation', 5000),
    a('SPA-2020-0001', 'Site Plan Approval', 999, { phase: 'cancelled' }),
  ]);
  assert.equal(r.planned, 1157);
  assert.equal(r.basis, 'master');
  assert.equal(r.phases.length, 4, 'three site plans + one condo listed as phases');

  const towers = P.plannedFromApps([a('OZ 20/1', 'REZONING', 1500), a('SP 21/1', 'SITE PLAN', 900), a('SP 23/7', 'SITE PLAN', 800)]);
  assert.equal(towers.planned, 1700, 'phased site plans exceed the original rezoning figure');
  assert.equal(towers.basis, 'siteplan');
});

test('city-initiated area by-laws do not absorb other developments', () => {
  const B = { id: 'opa', municipality: 'Brampton', kind: 'application' };
  const f = (ref, geom, units, extra = {}) => P.normalizeRecord({ type: 'Feature', id: ++id, geometry: geom,
    properties: { FILE_NO: ref, TYPE_DESC: 'OPA ZBA Subdivision', STATUS: 'Approved', ADDRESS: extra.addr || '1 X St', UNITS: units, DESCRIPTION: extra.desc || '', APPLICATION_DATE: D(2020) } }, appF, B);
  const area = f('CI18.002', rect(-79.77, 43.68, -79.75, 43.695), null, { addr: 'Downtown', desc: 'City of Brampton Initiated Zoning By-Law' });
  const a1 = f('OZS-2022-0035', rect(-79.765, 43.685, -79.764, 43.686), 362, { addr: '22 John St' });
  const a2 = f('OZS-2021-0053', rect(-79.760, 43.688, -79.759, 43.689), 771, { addr: '28 Elizabeth St N' });
  const projects = P.buildProjects([area, a1, a2]);
  assert.equal(projects.length, 3);
});
