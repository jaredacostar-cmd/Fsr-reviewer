'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Ph = require('../js/phases.js');
globalThis.PeelPhases = Ph;
const DT = require('../js/devtab.js');

const appRec = (extra = {}) => ({
  uid: 'src/1', ref: 'OZ 24-001', kind: 'application', stage: 'master', phase: 'review',
  statusRaw: '', events: [], description: '', address: '', type: '',
  ...extra,
});
const permitRec = (extra = {}) => ({
  uid: 'src/2', ref: 'BP 24-100', kind: 'permit', phase: 'permit',
  statusRaw: '', events: [], description: '', units: 0, type: 'New building',
  ...extra,
});
const project = (extra = {}) => ({
  key: 'p1', title: 'Test dev', municipality: 'Mississauga', phase: 'review', rank: 2,
  last: null, first: null, records: [], timeline: [], milestones: {}, planApproved: null, phaseRecs: null,
  ...extra,
});

test('recGroup: applications group by their stage', () => {
  assert.equal(DT.recGroup(appRec({ stage: 'master' })), 'master');
  assert.equal(DT.recGroup(appRec({ stage: 'siteplan' })), 'siteplan');
  assert.equal(DT.recGroup(appRec({ stage: 'precon' })), 'precon');
});

test('recGroup: permits with units are permit-new, other permits are permit', () => {
  assert.equal(DT.recGroup(permitRec({ ref: 'BP 24-100', units: 12 })), 'permit-new');
  assert.equal(DT.recGroup(permitRec({ ref: 'BP 24-101', units: 0 })), 'permit');
  // Servicing / sign permits never count as new units.
  assert.equal(DT.recGroup(permitRec({ ref: 'SIGN 24-5', units: 12 })), 'permit');
});

test('REC_GROUPS order matches the old Source records section', () => {
  assert.deepEqual(DT.REC_GROUPS.map(([k]) => k),
    ['master', 'siteplan', 'condo', 'precon', 'other', 'permit-new', 'permit']);
});

test('groupRecords: groups in order, oldest first, undated last, 40-record limit', () => {
  const d = iso => ({ label: 'Received', date: new Date(iso) });
  const recs = [
    appRec({ uid: 'a', stage: 'siteplan', events: [d('2024-06-01')] }),
    appRec({ uid: 'b', stage: 'master', events: [d('2023-01-15')] }),
    appRec({ uid: 'c', stage: 'master', events: [] }),
    permitRec({ uid: 'e', ref: 'BP 1', units: 5, events: [d('2025-02-01')] }),
    ...Array.from({ length: 45 }, (_, i) => appRec({ uid: `m${i}`, stage: 'master', events: [d('2022-01-01')] })),
  ];
  const groups = DT.groupRecords(recs);
  assert.deepEqual(groups.map(g => g.key), ['master', 'siteplan', 'permit-new']);
  const master = groups[0];
  // Oldest first: the 2022 batch before the 2023 file; undated record last.
  assert.equal(master.list[0].uid, 'm0');
  assert.equal(master.list[master.list.length - 1].uid, 'c');
  assert.equal(master.shown.length, 40);
  assert.equal(master.more, 47 - 40);
  assert.equal(groups[2].units, 5);
  assert.match(master.span, /2022–2023/);
});

test('groupRecords: empty input gives no groups', () => {
  assert.deepEqual(DT.groupRecords([]), []);
});

test('statusOf: stalled when a planning phase has no activity for 2+ years', () => {
  const three = Date.now() - 3 * 365.25 * 864e5;
  const st = DT.statusOf(project({ last: three, records: [appRec({ statusRaw: 'Inactive' })] }));
  assert.ok(st.stalled);
  assert.ok(st.years > 2.9 && st.years < 3.1);
  assert.match(st.cause, /inactive/);
  assert.ok(st.sig.some(x => x.kind === 'stall' && x.main));
});

test('statusOf: not stalled for recent activity or non-planning phases', () => {
  const recent = Date.now() - 30 * 864e5;
  assert.equal(DT.statusOf(project({ last: recent, records: [appRec()] })).stalled, false);
  const old = Date.now() - 5 * 365.25 * 864e5;
  assert.equal(DT.statusOf(project({ phase: 'completed', last: old, records: [appRec()] })).stalled, false);
});

test('statusOf: appeal signal outranks the stalled signal', () => {
  const old = Date.now() - 4 * 365.25 * 864e5;
  const st = DT.statusOf(project({ last: old, records: [appRec({ statusRaw: 'Under appeal to the OLT' })] }));
  assert.ok(st.stalled);
  assert.match(st.cause, /appeal/);
  assert.equal(st.sig[0].kind, 'appeal');
});

test('statusOf: why names the phase-setting event when the timeline has one', () => {
  const p = project({
    records: [appRec({ ref: 'OZ 24-001' })],
    timeline: [{ date: new Date('2024-03-01'), phase: 'review', text: 'OZ 24-001 · Initial submission', tag: 'OZ 24-001', record: 'src/1' }],
  });
  const st = DT.statusOf(p);
  assert.match(st.why, /Under review since 2024-03-01/);
  assert.match(st.why, /Initial submission/);
});

test('phaseBasis: demolition permit does not set the phase', () => {
  assert.match(DT.phaseBasis(permitRec({ ref: 'DEMO 1', description: 'Demolition of house' })), /demolition permit/);
});

test('phaseBasis: pre-consultation counts as inception whatever its status', () => {
  assert.match(DT.phaseBasis(appRec({ stage: 'precon', phase: 'inception', statusRaw: 'Approved' })), /pre-consultation/);
});

test('phaseBasis: no published status falls back to the event date', () => {
  const r = appRec({ statusRaw: '', phase: 'review', events: [{ label: 'Received', date: new Date('2023-05-02'), phase: 'review' }] });
  assert.match(DT.phaseBasis(r), /from its received date/);
});
