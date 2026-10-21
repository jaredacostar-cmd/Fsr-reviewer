'use strict';
// A registered condominium is a finished building; a condominium conversion adds no homes
// (js/phases.js isRegisteredCondo, isCondoConversion; decided 2026-10-20).
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const H = require('./helpers/real-devs.js');

const ev = (d, phase) => ({ date: new Date(`${d}T00:00:00Z`), phase, label: 'x' });
let n = 0;
const app = (ref, stage, props) => ({ uid: `t:${++n}`, kind: 'application', municipality: 'Brampton', ref, fileKey: P.canonRef(ref), stage,
  type: stage === 'condo' ? 'Draft Plan of Condominium' : 'Site Plan', address: '1 TEST RD', phase: 'approved', statusRaw: 'Approved',
  description: '', units: null, events: [ev('2019-01-01', 'inception')], sourceName: 'test', sourceId: 'test/0', ...props });
const build = recs => P.mergeProject('Brampton|1 TEST RD', P.dedupeRecords(recs));

test('a registered condominium covering the plan: built, whatever the permits say', () => {
  const p = build([app('SPA-2019-0001', 'siteplan', { units: 120, description: 'Two 6-storey apartment buildings with 120 units' }),
    app('DPC-2023-0001', 'condo', { statusRaw: 'Registered', description: 'Standard condominium for the apartment buildings' })]);
  assert.equal(p.phase, 'completed');
  assert.deepEqual([p.buildout.planned, p.buildout.permitted, p.buildout.completed, p.buildout.remaining], [120, 120, 120, 0]);
  assert.deepEqual(p.buildout.condoBuilt, { units: 120, refs: ['DPC-2023-0001'] }, 'a condominium with no unit count covers the site');
});

test('a registered condominium for one phase: its own homes built, the site under construction', () => {
  const p = build([app('SPA-2019-0002', 'siteplan', { units: 300, description: 'Three towers, 300 units' }),
    app('DPC-2023-0002', 'condo', { statusRaw: 'Plan of Condo Registered', units: 100, description: 'Phase 1 tower, 100 units' })]);
  assert.equal(p.phase, 'construction');
  assert.equal(p.buildout.completed, 100);
  assert.equal(p.buildout.unbuilt, 200);
});

test('a condominium in registration, not yet registered, changes nothing', () => {
  const p = build([app('SPA-2019-0003', 'siteplan', { units: 50 }), app('DPC-2025-0003', 'condo', { statusRaw: 'Registration' })]);
  assert.equal(p.phase, 'approved');
  assert.equal(p.buildout.completed, 0);
});

test('a condominium conversion and the site plan filed for it add no homes; an office-to-apartment conversion does', () => {
  const conv = build([app('C01W06.079', 'condo', { statusRaw: 'Registered', units: 72, description: 'Proposal to convert the existing 6 storey, 72 unit rental apartment building into a standard condominium.' }),
    app('SPA-2019-0069', 'siteplan', { units: 72, description: 'Basic Site Plan — Existing 72-unit apartment building to be converted to a condominium. No development proposed.' })]);
  assert.ok(!(conv.units > 0), 'no units counted');
  assert.ok(conv.records.every(r => r.conversion && r.unitsStated === 72), 'each file keeps its stated count aside');
  assert.ok(!conv.buildout || !conv.buildout.condoBuilt, 'a registered conversion is not a new building');
  const office = build([app('SPA-2024-0100', 'siteplan', { units: 40, description: 'Convert the existing office building to 40 apartment units' })]);
  assert.equal(office.units, 40);
  assert.ok(!P.isCondoConversion(app('C03W05.022', 'condo', { description: 'To convert the proposed townhouse development to common-element condominium tenure.' })), 'a proposed development is a new build');
});

test('the real sites: 151 City Centre built, 123 Railroad St counts no new homes', { skip: !H.available() }, () => {
  const { projects } = H.realDevs();
  const of = ref => projects.find(p => p.records.some(r => r.ref === ref));
  const cc = of('SP 19/056');
  assert.equal(cc.phase, 'completed', 'condominium 21CDM-M 24-1 is registered');
  assert.equal(cc.buildout.unbuilt, 0);
  assert.ok(!(of('C01W06.079').units > 0), 'C01W06.079 converts an existing rental building');
  assert.equal(of('C05E13.008').phase, 'completed', 'a registered condominium alone no longer reads "in review"');
});
