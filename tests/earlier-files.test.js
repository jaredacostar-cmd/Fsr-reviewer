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
