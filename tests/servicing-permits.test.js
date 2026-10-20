'use strict';
/* Servicing permits (js/servicing-permits.js) and the DC servicing gate (scripts/build-dc-gate.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const SP = require('../js/servicing-permits.js');
const G = require('../scripts/build-dc-gate.js');

const permit = (o) => ({ kind: 'permit', props: {}, type: '', scope: '', description: '', ref: '', events: [], ...o });

test('Mississauga site servicing: pipes read from the description', () => {
  const c = SP.classify(permit({ ref: 'DRAIN 26-2543 SS', props: { APP_DETAIL: 'SITE SERVICING' },
    description: 'SITE SERVICING- NEW WATERMAIN & SANITARY SEWER - NEW (2) STOREY BUILDING' }));
  assert.equal(c.kind, 'site');
  assert.ok(c.water && c.wastewater && !c.storm && !c.existing && c.regional);
});

test('storm-only site servicing is not Regional', () => {
  const c = SP.classify(permit({ props: { APP_DETAIL: 'SITE SERVICING' },
    description: 'SITE SERVICING NEW STORM SEWER LINE WITH (2) MANHOLES' }));
  assert.equal(c.kind, 'site');
  assert.ok(c.storm && !c.wastewater && !c.water && !c.regional);
});

test('work for an existing building is flagged existing', () => {
  const c = SP.classify(permit({ props: { APP_DETAIL: 'SITE SERVICING' },
    description: 'SITE SERVICING REPLACEMENT (6") WATERMAIN EXIST (1) STOREY INDUSTRIAL BUILDING' }));
  assert.ok(c.water && c.existing);
  const conv = SP.classify(permit({ description: 'Plumbing — Site Services (Decommission septic and connect to town sewer)' }));
  assert.equal(conv.kind, 'site');
  assert.ok(conv.wastewater && conv.existing, 'septic-to-sewer conversion is a site permit on an existing building');
});

test('Brampton site service type with no description: regional, pipes not stated', () => {
  const c = SP.classify(permit({ type: 'Site Service Residential', props: { SUBDESC: 'Site Service Residential', WORKDESC: 'New' } }));
  assert.equal(c.kind, 'site');
  assert.ok(c.unspecified && c.regional);
});

test('Caledon: WORKDESC survives only in the description', () => {
  const c = SP.classify(permit({ type: 'Industrial', description: 'Site Services — Site Services (Water, Sanitary Lines, Storm Lines & Man Holes)' }));
  assert.equal(c.kind, 'site');
  assert.ok(c.water && c.wastewater && c.storm && c.regional);
});

test('septic: typed permits and new homes "with septic"', () => {
  assert.equal(SP.classify(permit({ type: 'Class 4 (Main)', props: { SUBDESC: 'Class 4 (Main)' } })).kind, 'septic');
  assert.equal(SP.classify(permit({ description: 'PRIVATE SEWAGE SYSTEM FOR DETACHED DWELLING' })).kind, 'septic');
  assert.equal(SP.classify(permit({ type: 'Residential', description: 'New — Construct Detached (With Septic)' })).kind, 'septic');
});

test('ordinary permits are not servicing permits', () => {
  assert.equal(SP.classify(permit({ type: 'Residential', description: 'New — Construct Detached' })), null);
  assert.equal(SP.classify({ kind: 'application', description: 'site servicing plan' }), null);
});

test('row round trip keeps kind, flags and dates', () => {
  const rec = permit({ municipality: 'Brampton', ref: '26-1', phase: 'review', lat: 43.7, lng: -79.7, address: '1 Main St',
    type: 'Site Service Com/Ind/Inst', props: { SUBDESC: 'Site Service Com/Ind/Inst' },
    events: [{ date: new Date('2026-09-04T00:00:00Z'), phase: 'inception' }] });
  const c = SP.classify(rec);
  const o = SP.fromRow(SP.toRow(rec, c));
  assert.equal(o.kind, 'site');
  assert.equal(o.status, 'applied');
  assert.equal(o.applied, '2026-09-04');
  assert.equal(o.issued, null);
  assert.ok(o.regional && o.unspecified);
});

// ---- Gate ----------------------------------------------------------------------
const ring = [[-79.701, 43.701], [-79.699, 43.701], [-79.699, 43.699], [-79.701, 43.699], [-79.701, 43.701]];
const project = (o) => ({ key: 'k', title: 't', municipality: 'Brampton', phase: 'approved', units: 100, gfa: 0,
  lat: 43.7, lng: -79.7, siteRings: [ring], first: new Date('2024-01-01T00:00:00Z'),
  records: [{ kind: 'application', address: '10 Main St', phase: 'approved' }], ...o });
const svc = (o) => ({ municipality: 'Brampton', ref: 'S1', kind: 'site', status: 'applied', applied: '2025-05-01', issued: null,
  lat: 43.7, lng: -79.7, address: '', water: true, wastewater: false, storm: false, unspecified: false, existing: false, regional: true, ...o });

test('gate: a water / wastewater site permit inside the boundary counts', () => {
  const [r] = G.gate([project()], [svc()]);
  assert.equal(r.bucket, 'counted');
  assert.equal(r.servicingApplied, '2025-05-01');
  assert.equal(r.evidence[0].match, 'boundary');
});

test('gate: storm-only, cancelled and predating permits do not count', () => {
  assert.equal(G.gate([project()], [svc({ water: false, storm: true, regional: false })])[0].bucket, 'none');
  assert.equal(G.gate([project()], [svc({ status: 'cancelled' })])[0].bucket, 'none');
});

// The order a file moves: pre-consultation → formal application → site servicing permit → building permit.
const ev = (d, phase) => ({ date: new Date(`${d}T00:00:00Z`), phase });
const withFiles = (...recs) => project({ records: recs });
const app = (ref, type, d, more = []) => ({ kind: 'application', ref, type, address: '10 Main St', phase: 'review', events: [ev(d, 'inception'), ...more] });
const bp = (ref, d) => ({ kind: 'permit', ref, type: 'Single Family Detached', address: '10 Main St', phase: 'permit', events: [ev(d, 'permit')] });

test('order: a site servicing permit filed before the formal application is not linked', () => {
  const p = withFiles(app('PRE-2022-0001', 'Pre-consultation', '2022-08-16'), app('OZS-2024-0001', 'Zoning by-law amendment', '2024-03-21'));
  const [r] = G.gate([p], [svc({ applied: '2023-08-10' })]);
  assert.equal(r.bucket, 'none');
  assert.equal(r.outOfOrder.length, 1);
  assert.match(r.outOfOrder[0].reason, /before the first formal application \(OZS-2024-0001 2024-03-21\)/);
});

test('order: filed with the site plan (within 90 days before) or after it, linked; steps in date order', () => {
  const p = withFiles(app('SP 24-30', 'Site plan', '2024-03-01', [ev('2025-01-10', 'approved')]), bp('26-1', '2026-02-01'));
  const [a] = G.gate([p], [svc({ applied: '2024-01-15' })]);
  assert.equal(a.bucket, 'counted');
  assert.deepEqual(a.steps.map(x => x.k), ['ssp', 'formal', 'approved', 'bp']);
  const [b] = G.gate([p], [svc({ applied: '2023-09-01' })]);
  assert.equal(b.bucket, 'permitNoSvc', '6 months before the site plan: not linked');
});

test('order: only a pre-consultation links no site servicing permit', () => {
  const [r] = G.gate([withFiles(app('PRE-2016-0001', 'Pre-consultation', '2016-07-05'))], [svc({ applied: '2018-09-05' })]);
  assert.equal(r.bucket, 'none');
  assert.match(r.outOfOrder[0].reason, /only a pre-consultation/);
});

test('order: lots in a registered plan (building permits only) link a permit up to 2 years ahead', () => {
  const p = withFiles(bp('26-2', '2025-06-01'));
  assert.equal(G.gate([p], [svc({ applied: '2024-01-01' })])[0].bucket, 'counted');
  assert.equal(G.gate([p], [svc({ applied: '2022-01-01' })])[0].bucket, 'permitNoSvc');
});

test('gate: existing-building servicing is listed for review, not counted', () => {
  assert.equal(G.gate([project()], [svc({ existing: true })])[0].bucket, 'existingOnly');
});

test('gate: septic marks a small site private, a large one for review', () => {
  const sep = svc({ kind: 'septic', water: false, regional: false, unspecified: true });
  assert.equal(G.gate([project({ units: 1 })], [sep])[0].bucket, 'private');
  const [big] = G.gate([project({ units: 500 })], [sep]);
  assert.equal(big.bucket, 'none');
  assert.equal(big.septicReview, true);
});

test('gate: nearest site permit within the match distance, not beyond', () => {
  const p = project({ siteRings: null });
  const near = svc({ lat: 43.7 + 40 / 111195 }); // ~40 m north
  const far = svc({ lat: 43.7 + 120 / 111195 }); // ~120 m north
  assert.equal(G.gate([p], [near])[0].bucket, 'counted');
  assert.equal(G.gate([p], [far])[0].bucket, 'none');
});

test('gate: a building permit with no servicing permit is shown separately', () => {
  const p = project({ records: [{ kind: 'application', address: '10 Main St' }, { kind: 'permit', address: '10 Main St', phase: 'permit' }] });
  assert.equal(G.gate([p], [])[0].bucket, 'permitNoSvc');
});

test('gate: built, withdrawn and empty developments are out of scope', () => {
  assert.equal(G.gate([project({ phase: 'completed' }), project({ phase: 'cancelled' }), project({ units: 0, gfa: 0 })], [svc()]).length, 0);
});

test('summary totals add up by bucket', () => {
  const rows = G.gate([project({ key: 'a' }), project({ key: 'b', units: 5, lat: 43.8, lng: -79.8, siteRings: null })], [svc()]);
  const s = G.summarise(rows);
  assert.equal(s.total.counted.units, 100);
  assert.equal(s.total.none.units, 5);
  assert.equal(s.byMunicipality.Brampton.counted.developments, 1);
});

test('order: a minor site plan for what is already there does not start the clock', () => {
  const p = withFiles(app('SPM 19/091', 'Site plan minor', '2019-07-09'), app('OZ 23/001', 'Zoning by-law amendment', '2023-05-01'));
  const [r] = G.gate([p], [svc({ applied: '2019-06-06' })]);
  assert.equal(r.bucket, 'none');
  assert.match(r.outOfOrder[0].reason, /OZ 23\/001/);
});

test('order: in a block of plans, a permit is held to the plan it sits in', () => {
  const sq = (x0, y0) => [[[x0, y0], [x0 + 0.001, y0], [x0 + 0.001, y0 + 0.001], [x0, y0 + 0.001], [x0, y0]]];
  const a = { ...app('21T-19001', 'Draft plan of subdivision', '2019-03-01'), poly: sq(-79.701, 43.699) };
  const b = { ...app('SP 24-15', 'Site plan', '2024-05-06'), poly: sq(-79.6995, 43.699) };
  const p = project({ siteRings: [[[-79.702, 43.698], [-79.698, 43.698], [-79.698, 43.701], [-79.702, 43.701], [-79.702, 43.698]]], records: [a, b] });
  const inA = svc({ applied: '2022-06-20', lat: 43.6995, lng: -79.7005 });
  const inB = svc({ applied: '2022-06-20', lat: 43.6995, lng: -79.699 });
  assert.equal(G.gate([p], [inA])[0].bucket, 'counted', 'in the 2019 plan: in order');
  const [r] = G.gate([p], [inB]);
  assert.equal(r.bucket, 'none', 'in the 2024 plan: before it');
  assert.match(r.outOfOrder[0].reason, /before the plan it sits in \(SP 24-15 2024-05-06\)/);
});
