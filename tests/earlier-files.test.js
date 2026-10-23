'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
globalThis.PeelPhases = require('../js/phases.js');
const P = globalThis.PeelPhases;
const EF = require('../js/earlier-files.js');

const ev = iso => ({ date: new Date(`${iso}T12:00:00Z`), phase: 'inception', label: 'Date Received' });
const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];
const app = (ref, extra = {}) => ({ uid: ref, ref, kind: 'application', municipality: 'Brampton', type: 'Site Plan Approval', stage: 'siteplan', phase: 'approved', statusRaw: 'Approved', events: [], ...extra });
const known = recs => new Set(recs.map(r => P.canonRef(r.ref)));

test('implied: a site plan revision points to its original', () => {
  const p = { records: [app('SP13-080.002', { events: [ev('2017-05-04')] })] };
  const m = EF.implied(p, known(p.records), 2016);
  assert.equal(m.length, 1);
  assert.equal(m[0].ref, 'SP13-080.000');
  assert.equal(m[0].kind, 'revision');
  assert.equal(m[0].year, 2013);
  assert.equal(m[0].before, true);
  assert.equal(m[0].like, 'SP13-080.%');
});

test('implied: an original in the data elsewhere is not missing', () => {
  const p = { records: [app('SP13-080.002')] };
  assert.equal(EF.implied(p, known([...p.records, app('SP13-080.000')]), 2016).length, 0);
});

test('implied: a concession-lot file names the earlier files on its lot that the data lacks', () => {
  const p = { records: [app('C04W14.009', { type: 'Draft Plan of Condo', stage: 'condo' })] };
  const m = EF.implied(p, known([...p.records, app('C04W14.003')]), 2016);
  assert.equal(m.length, 1);
  assert.equal(m[0].kind, 'lot');
  assert.equal(m[0].count, 7);
  assert.equal(m[0].ref, 'C04W14.001–.008');
  assert.match(m[0].why, /Concession 4 West, Lot 14/);
});

test('implied: a legacy Transferred file with no dates, and a registered plan named in a description', () => {
  const p = { records: [app('SP83-006.000', { statusRaw: 'Transferred' }), app('SPA-2019-0063', { description: 'Located at 175 Veterans Drive (i.e. Block 157 on R.P. 43M-1940)' })] };
  const m = EF.implied(p, known(p.records), 2016);
  assert.deepEqual(m.map(x => x.kind).sort(), ['legacy', 'plan']);
  assert.equal(m.find(x => x.kind === 'plan').ref, '43M-1940');
  assert.equal(m.find(x => x.kind === 'legacy').year, 1983);
});

test('layered and discrepancies: later files on the original land, one reaching past it, in filing order', () => {
  const base = app('SP83-006.000', { statusRaw: 'Transferred', poly: sq(0, 0, 0.01, 0.01) });
  const own = app('C04W14.009', { stage: 'condo', units: 195, events: [ev('2017-06-22')], poly: sq(0.001, 0.001, 0.004, 0.004) });
  const p = { key: 'a', title: 'A', units: 195, records: [base, own] };
  const tower = app('SPA-2022-0225', { events: [ev('2022-12-16')], poly: sq(0.006, 0.006, 0.012, 0.009) });
  const far = app('SP99-001.000', { events: [ev('2018-01-01')], poly: sq(0.05, 0.05, 0.06, 0.06) });
  const q = { key: 'b', title: 'B', units: 1062, records: [tower] }, r = { key: 'c', title: 'C', units: 10, records: [far] };
  assert.equal(EF.baseOf(p), base);
  const rows = EF.layered(p, [p, q, r]);
  assert.deepEqual(rows.map(x => x.r.ref), ['C04W14.009', 'SPA-2022-0225']);
  assert.ok(rows[1].inside >= 0.5 && rows[1].inside < 0.9);
  const d = EF.discrepancies(p, base, rows, EF.implied(p, known([base, own, tower, far]), 2016));
  const text = d.map(x => x.text).join('\n');
  assert.match(text, /legacy file with no dates/);
  assert.match(text, /reaches past SP83-006\.000's land: SPA-2022-0225/);
  assert.match(text, /2 developments on its land \(1 shown as separate sites\) count 1,257/);
  assert.match(text, /8 earlier files/);
});

test('yearOfRef', () => {
  assert.equal(EF.yearOfRef('SP98-001.000'), 1998);
  assert.equal(EF.yearOfRef('OZS-2021-0002'), 2021);
  assert.equal(EF.yearOfRef('PRE17.035'), 2017);
  assert.equal(EF.yearOfRef('C04W14.009'), null);
});

test('statedOf: an explicit total adds up its home counts; else the app reading', () => {
  assert.equal(EF.statedOf(app('PRE-2020-0098', { precUnits: 1055, description: 'Proposal for three (3) stacked townhouse blocks. A total of 36 stacked townhouse units, 1016 residential condominium units, and 850 square metres of retail space are being proposed.' })).units, 1052);
  assert.equal(EF.statedOf(app('SPA-2022-0225', { description: 'Phased residential development with ground floor commercial uses and total of 1062 units. Revised resubmission.' })).units, 1062);
  const s = EF.statedOf(app('SP17-105.000', { units: 245, unitsFromText: true, description: 'two 12 storey buildings with 245 units' }));
  assert.equal(s.units, 245); assert.equal(s.how, 'the description');
  assert.equal(EF.statedOf(app('SP16-088.000', { description: 'NEW COMMERCIAL PLAZA' })).units, null);
});

test('revisionOf: a count changed inside a description', () => {
  const r = EF.revisionOf(app('SPA-2022-0225', { description: 'Total of 1062 units. Revised resubmission for phase 1 includes reduction in units proposed for Tower B (from 353 to 298) and modifications.' }));
  assert.deepEqual([r.from, r.to, r.delta], [353, 298, -55]);
  assert.equal(EF.revisionOf(app('X', { description: 'Parking changed from 3 to 1 levels.' })), null);
});

test('unitsOverTime: parcels by land, the latest count on a parcel stands, parcels add up, built from permits', () => {
  const base = app('SP83-006.000', { statusRaw: 'Transferred', poly: sq(0, 0, 0.02, 0.01) });
  // Parcel 1: townhouses, built in 2016, the condominium filed after.
  const th = app('C04W14.009', { stage: 'condo', units: 195, events: [ev('2017-06-22')], poly: sq(0.001, 0.001, 0.006, 0.009) });
  const permit = (lng, lat, at) => ({ uid: `bp${at}${lng}`, kind: 'permit', municipality: 'Brampton', lng, lat, phase: 'completed', type: 'Residential', description: 'New townhouse dwelling', events: [ev(at)] });
  // Parcel 2: a plaza, then towers proposed: the latest count stands, a resubmission changes it.
  const plaza = app('SP16-088.000', { events: [ev('2016-11-29')], description: 'NEW COMMERCIAL PLAZA', poly: sq(0.012, 0.001, 0.019, 0.009) });
  const precon = app('PRE-2020-0098', { stage: 'precon', phase: 'inception', precUnits: 1055, events: [ev('2020-08-18')], poly: sq(0.012, 0.001, 0.018, 0.009), description: 'A total of 36 stacked townhouse units, 1016 residential condominium units.' });
  const inactive = app('PRE18.001', { stage: 'precon', phase: 'cancelled', statusRaw: 'Inactive', precUnits: 190, events: [ev('2018-01-19')], poly: sq(0.012, 0.001, 0.019, 0.009) });
  const towers = app('SPA-2022-0225', { events: [ev('2022-12-16')], poly: sq(0.013, 0.002, 0.018, 0.008), description: 'Residential towers, total of 1062 units. Reduction in units for Tower B (from 353 to 298).' });
  // A pre-consultation over both parcels sets no count.
  const wide = app('PRE17.035', { stage: 'precon', phase: 'inception', precUnits: 400, events: [ev('2017-04-12')], poly: sq(0.003, 0.002, 0.016, 0.008) });
  const p = { key: 'a', title: 'Townhouses', units: 195, records: [base, th, permit(0.003, 0.005, '2016-06-06')] };
  const q = { key: 'b', title: 'Towers', units: 1055, records: [plaza, precon, inactive, towers] }, w = { key: 'c', title: 'W', units: 0, records: [wide] };
  const u = EF.unitsOverTime(p, [p, q, w], Date.UTC(2026, 9, 23));
  assert.equal(u.parcels.length, 2);
  const on = r => u.parcels.find(pc => pc.files.some(x => x.r === r)), A = on(th), B = on(plaza);
  assert.equal(A.count, 195); assert.equal(A.built.year, 2016);
  assert.equal(B.count, 1007); assert.equal(B.total.units, 1062); assert.equal(B.built, null);
  assert.ok(B.steps.find(s => s.r === inactive && !s.counted), 'an inactive file does not count');
  assert.deepEqual(u.spans.map(s => s.x.r.ref), ['PRE17.035', 'SP83-006.000'], 'the original land, over both parcels, states no count');
  const y = Object.fromEntries(u.years.map(r => [r.year, r]));
  assert.equal(y[2016].land, 195, 'built before its condominium file: the homes stand from 2016');
  assert.equal(y[2020].land, 195 + 1052);
  assert.equal(y[2022].land, 195 + 1007);
  assert.equal(y[2026].built, 195);
  const text = u.flags.map(f => f.text).join('\n');
  assert.match(text, /the app counts 1,055 homes; the latest file states 1,062, ≈1,007 after its resubmission/);
  assert.match(text, /PRE-2020-0098 states 1,052 \(the total stated\); the app reads 1,055/);
  assert.match(EF.unitsSummary(u), /^195 homes built on 1 parcel .*≈1,007–1,062 more on parcel/);
});

test('unitsOverTime: one application split into buildings; whole-block files counted for the building they match; an addition adds', () => {
  const sq3 = (...c) => sq(...c.map(v => v / 3));   // (about 150 × 370 m: under the 15 ha frame limit)
  // 209 Steeles Ave W: a 2016 site plan over the whole strip (109 townhouses), then two towers on block 2,
  // with later revisions drawn over the whole block.
  const whole = app('SP16-091.000', { units: 109, events: [ev('2016-12-15')], poly: sq3(0, 0, 0.004, 0.01), description: 'To construct 109 back to back townhouse units.' });
  const thCondo = app('T01W15.038', { stage: 'condo', units: 109, events: [ev('2019-07-26')], poly: sq3(0, 0, 0.004, 0.005) });
  const t1 = app('SPA-2020-0152', { units: 290, events: [ev('2020-10-16')], poly: sq3(0, 0.006, 0.0018, 0.01), description: 'To develop a 21-storey residential apartment building with 290 residential units' });
  const t1z = app('OZS-2020-0028', { stage: 'master', units: 290, events: [ev('2020-10-16')], poly: sq3(0, 0.0055, 0.004, 0.01), description: 'To develop a 21-storey residential apartment building with 290 residential units' });
  const t2 = app('SPA-2021-0230', { units: 462, events: [ev('2021-11-15')], poly: sq3(0.0025, 0.007, 0.0038, 0.0095), description: 'A 40-storey mixed-use residential building with 462 residential suites' });
  const add = app('SPA-2024-0129', { units: 4, events: [ev('2024-09-16')], poly: sq3(0, 0.0055, 0.004, 0.01), description: '40-storey mixed-use building under construction. Limited Site Plan to add 4 units to ground floor' });
  const condo2 = app('DPC-2025-0009', { stage: 'condo', units: 466, events: [ev('2025-12-01')], poly: sq3(0, 0.0055, 0.004, 0.01), description: 'a 40-storey, 466-unit mixed-use Condominium' });
  const a = { key: 'a', title: 'TH', units: 109, records: [whole, thCondo] }, b = { key: 'b', title: 'Tower 1', units: 290, records: [t1, t1z, add, condo2] }, c = { key: 'c', title: 'Tower 2', units: 449, records: [t2] };
  const all = [a, b, c];
  assert.equal(EF.frameOf(c, all), whole, 'the whole application is the frame, from any of its developments');
  const u = EF.unitsOverTime(c, all, Date.UTC(2026, 9, 23));
  const on = r => u.parcels.find(pc => pc.steps.some(s => s.r === r));
  assert.equal(u.parcels.length, 3);
  assert.equal(on(whole), on(thCondo), 'the whole application counts for the townhouses (its count matches)');
  assert.equal(on(t1z), on(t1));
  assert.equal(on(add), on(t2), 'the 40-storey addition goes to the 40-storey building, not the 21-storey one');
  assert.equal(on(t2).count, 466);
  assert.ok(on(add).steps.find(s => s.r === add).added);
  assert.equal(on(t1).count, 290);
  assert.equal(u.totals.land, 109 + 290 + 466);
  assert.match(u.flags.map(f => f.text).join('\n'), /split across 2 developments in the app/);
});

test('addOf', () => {
  assert.equal(EF.addOf(app('X', { description: 'Limited Site Plan Application being submitted to add 4 units to ground floor' })), 4);
  assert.equal(EF.addOf(app('X', { description: '40-storey building with 466 residential units' })), null);
});
