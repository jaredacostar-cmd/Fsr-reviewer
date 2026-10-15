'use strict';
// Capital projects data (Stage 1a / 1b): field whitelist, derived status / system / length /
// slip, reprojection, DC ↔ capital matching, overrides and the audit.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const C = require('../scripts/capital-lib.js');

const data = f => path.join(__dirname, '..', 'data', f);

// A line ~1 km east–west along latitude 43.7 near Brampton.
const LINE = [[-79.75, 43.7], [-79.7376, 43.7]];
function feature(attrs, paths = [LINE]) { return { attributes: attrs, geometry: { paths } }; }

test('only whitelisted fields are kept; personnel, contractor and notes fields never are', () => {
  const attrs = { ProjectNumber: '22-2255', StreetName: 'Mayfield Rd', WorkType: 'Watermain', ComponentID: '58439',
    ProjectManager: 'A Person', Inspector: 'B Person', Contractor: 'Acme Ltd', ContractAdmin: 'C', Consultant: 'D Eng',
    ConflictResolved: 'Y', ConflictResolutionDate: 1700000000000, ConflictNotes: 'utility clash', Comments: 'call Bob', AssignmentID: 'X1', OBJECTID: 7 };
  const r = C.toRecord(feature(attrs), 0);
  for (const k of C.NEVER) assert.equal(k in r, false, k);
  assert.equal(C.hasForbidden(r), false);
  assert.equal(JSON.stringify(r).includes('Person'), false);
  assert.equal(JSON.stringify(r).includes('Acme'), false);
  assert.equal('OBJECTID' in r, false);
  assert.deepEqual(Object.keys(C.cleanAttributes(attrs)).sort(), Object.keys(C.KEEP).sort());
  assert.equal(C.hasForbidden({ records: [{ contractor: 'x' }] }), true, 'case-insensitive');
});

test('data/capital.json (when built) carries no forbidden key', () => {
  if (!fs.existsSync(data('capital.json'))) return;
  const j = JSON.parse(fs.readFileSync(data('capital.json'), 'utf8'));
  assert.equal(C.hasForbidden(j), false);
  for (const r of j.records) for (const k of Object.keys(r)) assert.ok([...Object.keys(C.KEEP), 'id', 'contract', 'system', 'status', 'lengthM', 'slip', 'geometry'].includes(k), k);
});

test('ids are stable across reordering; contract key from the project page, else the project number', () => {
  const a = feature({ ProjectNumber: '22-2300', ProjectWebsite: 'https://www.peelregion.ca/pw/construction/bram/22-2300F.asp' });
  const b = feature({ ProjectNumber: '22-2300' }, [[[-79.70, 43.70], [-79.69, 43.70]]]);
  const id1 = C.toRecord(a, 0).id, id2 = C.toRecord(a, 57).id;
  assert.equal(id1, id2, 'position in the layer does not change the id');
  assert.match(id1, /^p22-2300-[0-9a-f]{8}$/);
  assert.notEqual(C.toRecord(b, 0).id, id1, 'another segment of the same project gets its own id');
  assert.equal(C.toRecord(feature({ ComponentID: '058439' }), 3).id, 'c58439');
  assert.equal(C.toRecord(a, 0).contract, 'web:peelregion.ca/pw/construction/bram/22-2300f.asp');
  assert.equal(C.toRecord(b, 0).contract, 'proj:22-2300');
});

test('dates become YYYY-MM-DD; non-http project websites are dropped', () => {
  assert.equal(C.isoDate(Date.UTC(2025, 2, 4)), '2025-03-04');
  assert.equal(C.isoDate('2024-11-30'), '2024-11-30');
  assert.equal(C.isoDate(''), null);
  assert.equal(C.isoDate(-2208988800000), null, '1900 placeholder dates ignored');
  const r = C.cleanAttributes({ ProjectWebsite: 'javascript:alert(1)', TenderDateTarget: Date.UTC(2026, 0, 1), PercentageOfConstructionComplet: 140 });
  assert.equal(r.website, null);
  assert.equal(r.tenderTarget, '2026-01-01');
  assert.equal(r.percentComplete, 100);
});

test('system from WorkType', () => {
  assert.equal(C.systemOf('Watermain'), 'water');
  assert.equal(C.systemOf('WATER MAIN REPLACEMENT'), 'water');
  assert.equal(C.systemOf('Sanitary Sewer'), 'wastewater');
  assert.equal(C.systemOf('Forcemain'), 'wastewater');
  assert.equal(C.systemOf('Storm Sewer'), 'other');
  assert.equal(C.systemOf('ROAD-EA STUDY'), 'roads');
  assert.equal(C.systemOf('Road Widening'), 'roads');
  assert.equal(C.systemOf('Landscaping'), 'other');
  assert.equal(C.systemOf(null), 'other');
  // codes on the layer
  assert.equal(C.systemOf('SAN-TRENCHLESS'), 'wastewater');
  assert.equal(C.systemOf('SAN-SMH_REPAIR/REPLACE'), 'wastewater');
  assert.equal(C.systemOf('Sanitary - Trenchless'), 'wastewater');
  assert.equal(C.systemOf('WM'), 'water');
  assert.equal(C.systemOf('WM-TUNNELING'), 'water');
  assert.equal(C.systemOf('Road - Storm sewer'), 'roads');
  assert.equal(C.systemOf('ROAD – STORM INLET REPAIR/REPLACE'), 'roads');
  assert.equal(C.systemOf('ROAD-NOISEWALL'), 'roads');
});

test('status from Phase, ProjectStatus and dates', () => {
  assert.equal(C.statusOf({ projectStatus: 'Complete' }), 'complete');
  assert.equal(C.statusOf({ phase: 'Substantial Completion' }), 'substantially complete');
  assert.equal(C.statusOf({ phase: 'Construction' }), 'under construction');
  assert.equal(C.statusOf({ phase: 'Pre-Construction' }), 'planned');
  assert.equal(C.statusOf({ phase: 'Awarded' }), 'awarded');
  assert.equal(C.statusOf({ phase: 'Tendered' }), 'tendered');
  assert.equal(C.statusOf({ phase: 'Design' }), 'planned');
  assert.equal(C.statusOf({ phase: 'Design', tenderActual: '2026-02-01' }), 'tendered', 'dates move a planned record forward');
  assert.equal(C.statusOf({ startActual: '2025-05-01' }), 'under construction');
  assert.equal(C.statusOf({ percentComplete: 60 }), 'under construction');
  assert.equal(C.statusOf({ substantialActual: '2025-05-01' }), 'substantially complete');
  assert.equal(C.statusOf({ awardActual: '2025-05-01' }), 'awarded');
  assert.equal(C.statusOf({ startTarget: '2027-05-01' }), 'planned');
  assert.equal(C.statusOf({}), 'unknown');
  // Phase / ProjectStatus values on the layer
  assert.equal(C.statusOf({ phase: 'COMPLETE', projectStatus: 'COMPLETED' }), 'complete');
  assert.equal(C.statusOf({ phase: 'MAINTENANCE', projectStatus: 'ACTIVE' }), 'substantially complete');
  assert.equal(C.statusOf({ phase: 'RESTORATION', projectStatus: 'ACTIVE' }), 'under construction');
  assert.equal(C.statusOf({ phase: 'CONSTRUCTION', projectStatus: 'ACTIVE' }), 'under construction');
  assert.equal(C.statusOf({ phase: 'PROCUREMENT RFQ/RFT' }), 'tendered');
  assert.equal(C.statusOf({ phase: 'RFP', awardActual: '2026-05-01' }), 'awarded');
  assert.equal(C.statusOf({ phase: 'EA-ENVIRONMENTAL ASSESSMENT' }), 'planned');
  assert.equal(C.statusOf({ phase: 'INITIATION' }), 'planned');
  assert.equal(C.statusOf({ phase: 'DESIGN', projectStatus: 'ACTIVE' }), 'planned');
  assert.equal(C.statusOf({ phase: 'ON-HOLD', startTarget: '2027-01-01' }), 'unknown');
  assert.equal(C.statusOf({ phase: 'CANCELLED' }), 'unknown');
  assert.equal(C.statusOf({ phase: 'DEFERRED' }), 'unknown');
  for (const s of ['planned', 'tendered', 'awarded', 'under construction', 'substantially complete', 'complete', 'unknown']) assert.ok(C.STATUSES.includes(s));
});

test('length (m) from geometry; UTM 17N coordinates are reprojected', () => {
  const m = C.lengthM({ type: 'LineString', coordinates: LINE });
  assert.ok(m > 990 && m < 1010, `≈1 km: ${m}`);
  // Brampton City Hall ≈ 43.6858 N, 79.7599 W ≈ UTM 17N 599 300 E, 4 837 600 N.
  const [lng, lat] = C.utmToLngLat(599300, 4837600);
  assert.ok(Math.abs(lng - -79.76) < 0.01 && Math.abs(lat - 43.686) < 0.01, `${lng},${lat}`);
  const p = C.toWgs84Paths({ paths: [[[599300, 4837600], [600300, 4837600]]] });
  assert.ok(p[0][0][0] < -79 && p[0][0][1] > 43);
  const len = C.lengthM(p);
  assert.ok(len > 995 && len < 1005, `1 km in UTM stays 1 km: ${len}`);
});

test('slip only when both a target and an actual exist', () => {
  assert.equal(C.slipOf({ startTarget: '2025-01-01' }), null, 'target only');
  assert.equal(C.slipOf({ startActual: '2025-08-01' }), null, 'actual only');
  assert.deepEqual(C.slipOf({ startTarget: '2025-01-01', startActual: '2025-08-01' }), { start: 7 });
  assert.deepEqual(C.slipOf({ tenderTarget: '2025-06-01', tenderActual: '2025-04-01', awardTarget: '2025-07-01' }), { tender: -2 });
  const r = C.toRecord(feature({ ConstructionStartDateTarget: Date.UTC(2025, 0, 1), ConstructionStartDateActual: Date.UTC(2025, 7, 1) }), 0);
  assert.deepEqual(r.slip, { start: 7 });
});

test('overlap share: ≥ 50 % of the shorter line within 30 m', () => {
  const parallel20m = [[-79.745, 43.70018], [-79.740, 43.70018]];     // ≈ 20 m north, inside the long line
  const parallel60m = [[-79.745, 43.70054], [-79.740, 43.70054]];     // ≈ 60 m north
  const halfOut = [[-79.7400, 43.7], [-79.7300, 43.7]];               // ≈ 1/3 along the long line
  assert.ok(C.overlapShare(parallel20m, LINE) > 0.95);
  assert.equal(C.overlapShare(parallel60m, LINE), 0);
  const s = C.overlapShare(halfOut, LINE);
  assert.ok(s > 0.2 && s < 0.4, `${s}`);
  assert.equal(C.overlapShare([[-79.6, 43.6], [-79.59, 43.6]], LINE), 0, 'far apart');
});

test('street names compare on their core words', () => {
  assert.ok(C.sameStreet('MAYFIELD RD', '600-mm Water Main - Mayfield Road'));
  assert.ok(C.sameStreet('Queen St E', 'C 400-mm Water Main - Queen Street East Qu'));
  assert.equal(C.sameStreet('Queen St E', '400-mm Water Main - Old School Road'), false);
  assert.equal(C.sameStreet('', 'anything'), false);
  assert.equal(C.normProj('Project 22-2255'), '22-2255');
  assert.equal(C.normComp('058439'), '58439');
});

const DC = {
  water: { lines: [
    { k: 'feeder', s: 'approved', y: 2026, c: '57150', p: '24-1192', d: 600, g: LINE },
    { k: 'feeder', s: 'proposed', y: 2030, c: '11111', p: '30-1000', d: 400, g: [[-79.70, 43.71], [-79.69, 43.71]] },
    { k: 'feeder', s: 'proposed', y: 2031, c: '22222', p: '31-2000', d: 400, n: '400-mm Water Main - Queen Street East', g: [[-79.65, 43.72], [-79.64, 43.72]] },
    { k: 'feeder', s: 'proposed', y: 2031, c: null, p: '31-3000', d: 300, g: [[-79.60, 43.73], [-79.59, 43.73]] },
    { k: 'feeder', s: 'proposed', y: 2032, c: '44444', p: '32-4000', d: 300, g: [[-79.50, 43.74], [-79.49, 43.74]] },
  ], facilities: [] },
  wastewater: { lines: [], facilities: [] },
};
const FAC = { water: [{ name: 'Snelgrove', kind: 'elevated_tank', items: [{ what: 'New Elevated Tank', proj: '30-1946', phases: [['EA', 2026, '55555'], ['C', 2030, '55556']] }] }], wastewater: [] };
const CAP = [
  C.toRecord(feature({ ProjectNumber: '24-1192', ComponentID: '57150', WorkType: 'Watermain', StreetName: 'Mayfield Rd', ConstructionStartDateTarget: Date.UTC(2027, 3, 1) }), 0),
  C.toRecord(feature({ ProjectNumber: '30-1000', ComponentID: '99999', WorkType: 'Watermain', StreetName: 'X Rd' }, [[[-79.70, 43.71], [-79.69, 43.71]]]), 1),
  C.toRecord(feature({ ProjectNumber: '50-0001', WorkType: 'Watermain', StreetName: 'Queen St E' }, [[[-79.65, 43.72005], [-79.64, 43.72005]]]), 2),
  C.toRecord(feature({ ProjectNumber: '50-0002', WorkType: 'Watermain', StreetName: 'Elm Dr' }, [[[-79.60, 43.73005], [-79.59, 43.73005]]]), 3),
  Object.assign(C.toRecord(feature({ ProjectNumber: '50-0003', WorkType: 'Watermain', StreetName: 'Far Rd' }, [[[-79.40, 43.80], [-79.39, 43.80]]]), 4), { id: 'p50-0003#4' }),
  C.toRecord(feature({ ProjectNumber: '30-1946', ComponentID: '55556', WorkType: 'Watermain', StreetName: 'Tank Rd', ConstructionStartDateActual: Date.UTC(2030, 5, 1) }), 5),
];

test('DC ↔ capital matching: component, project, street + overlap, overlap only, unmatched', () => {
  const works = C.dcWorks(DC, FAC);
  assert.equal(works.length, 6);
  const links = C.matchDc(works, CAP);
  const of = key => links.filter(l => l.dc === key);
  assert.deepEqual(of('water:line:c57150').map(l => [l.capital, l.method, l.confidence]), [['c57150', 'component', 'high']]);
  assert.deepEqual(of('water:line:c11111').map(l => [l.capital, l.method, l.confidence]), [['c99999', 'project', 'medium']]);
  assert.deepEqual(of('water:line:c22222').map(l => [l.method, l.confidence]), [['street+overlap', 'medium']]);
  assert.deepEqual(of('water:line:3').map(l => [l.method, l.confidence]), [['overlap', 'low']]);
  assert.equal(of('water:line:c44444').length, 0, 'nothing nearby → unmatched');
  assert.deepEqual(of('water:fac:Snelgrove:30-1946:New Elevated Tank').map(l => l.method), ['component']);
});

test('overrides: accept, reject and reassign apply on every build', () => {
  const works = C.dcWorks(DC, FAC);
  const ov = { links: [
    { dc: 'water:line:3', action: 'reject' },
    { dc: 'water:line:c44444', capital: 'p50-0003#4', action: 'accept' },
    { dc: 'water:line:c11111', capital: 'c99999', action: 'reassign', to: 'p50-0003#4' },
  ] };
  const links = C.matchDc(works, CAP, ov);
  assert.equal(links.filter(l => l.dc === 'water:line:3').length, 0);
  assert.deepEqual(links.find(l => l.dc === 'water:line:c44444'), { dc: 'water:line:c44444', capital: 'p50-0003#4', method: 'manual', confidence: 'high' });
  assert.deepEqual(links.filter(l => l.dc === 'water:line:c11111').map(l => l.capital), ['p50-0003#4']);
  const file = JSON.parse(fs.readFileSync(data('capital-overrides.json'), 'utf8'));
  assert.ok(Array.isArray(file.links));
});

test('audit: counts, unmatched both ways, low confidence, schedule differences', () => {
  const works = C.dcWorks(DC, FAC);
  const links = C.matchDc(works, CAP);
  const a = C.audit(works, CAP, links);
  assert.equal(a.counts.dcWorks, 6);
  assert.equal(a.counts.dcMatched, 5);
  assert.deepEqual(a.unmatchedDc.map(w => w.dc), ['water:line:c44444']);
  assert.deepEqual(a.unmatchedCapital.map(r => r.projectNumber), ['50-0003']);
  assert.equal(a.lowConfidence.length, 1);
  // DC line 57150 is scheduled 2026; its capital record targets a 2027 start.
  assert.deepEqual(a.scheduleDiffs.map(d => [d.dc, d.dcYear, d.capitalStartYears]), [['water:line:c57150', 2026, [2027]]]);
  const t = C.tally(CAP);
  assert.equal(t.water.planned, 1);
  assert.equal(t.water['under construction'], 1);
  assert.equal(t.water.unknown, 4);
});
