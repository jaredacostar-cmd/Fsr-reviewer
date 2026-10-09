'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');

test('status text maps to lifecycle phases', () => {
  const cases = {
    'Pre-Consultation': 'inception',
    'Application Received': 'inception',
    'Complete Application': 'review',
    'Incomplete': 'review',
    'Under Review': 'review',
    'Circulated': 'review',
    'Appealed to OLT': 'review',
    'Approved': 'approved',
    'Draft Plan Approved': 'approved',
    'Registered': 'approved',
    'Issued': 'permit',
    'Permit Issued': 'permit',
    'Under Inspection': 'construction',
    'Framing Inspection Passed': 'construction',
    'Final Inspection Complete': 'completed',
    'Closed': 'completed',
    'Occupancy Granted': 'completed',
    'Withdrawn': 'cancelled',
    'Refused': 'cancelled',
    'Permit Cancelled': 'cancelled',
    'Expired': 'cancelled',
  };
  for (const [s, want] of Object.entries(cases)) assert.equal(P.phaseFromStatus(s), want, s);
  assert.equal(P.phaseFromStatus(''), null);
  assert.equal(P.phaseFromStatus('zzz'), null);
});

const permitFields = [
  { name: 'OBJECTID', type: 'esriFieldTypeOID' },
  { name: 'BP_NUMBER', type: 'esriFieldTypeString' },
  { name: 'ADDRESS', type: 'esriFieldTypeString' },
  { name: 'PERMIT_TYPE', type: 'esriFieldTypeString' },
  { name: 'WORK_DESCRIPTION', type: 'esriFieldTypeString' },
  { name: 'STATUS', type: 'esriFieldTypeString' },
  { name: 'APPLIED_DATE', type: 'esriFieldTypeDate' },
  { name: 'ISSUE_DATE', type: 'esriFieldTypeDate' },
  { name: 'FINAL_DATE', type: 'esriFieldTypeDate' },
  { name: 'EditDate', type: 'esriFieldTypeDate' },
  { name: 'NEW_UNITS', type: 'esriFieldTypeInteger' },
];

test('field detection finds the key columns and date roles', () => {
  const m = P.detectFields(permitFields);
  assert.equal(m.id, 'BP_NUMBER');
  assert.equal(m.address, 'ADDRESS');
  assert.equal(m.type, 'PERMIT_TYPE');
  assert.equal(m.description, 'WORK_DESCRIPTION');
  assert.equal(m.status, 'STATUS');
  assert.equal(m.units, 'NEW_UNITS');
  assert.deepEqual(m.dates.map(d => [d.field, d.event]), [
    ['APPLIED_DATE', 'inception'], ['ISSUE_DATE', 'permit'], ['FINAL_DATE', 'completed'],
  ]);
});

const permitSrc = { id: 'p', name: 'Permits', municipality: 'Mississauga', kind: 'permit' };
const appSrc = { id: 'a', name: 'Apps', municipality: 'Mississauga', kind: 'application' };

test('permit records: status and dates combine, dates only move forward', () => {
  const m = P.detectFields(permitFields);
  const f = (props) => ({ type: 'Feature', id: 1, geometry: { type: 'Point', coordinates: [-79.64, 43.59] }, properties: props });
  const issued = P.normalizeRecord(f({ BP_NUMBER: 'BP 1', ADDRESS: '100 Main Street', STATUS: 'Issued', ISSUE_DATE: Date.UTC(2023, 0, 5), PERMIT_TYPE: 'New Building', NEW_UNITS: 120 }), m, permitSrc);
  assert.equal(issued.phase, 'permit');
  assert.equal(issued.lat, 43.59);
  assert.equal(issued.newBuild, true);

  const finaled = P.normalizeRecord(f({ BP_NUMBER: 'BP 2', STATUS: 'Issued', ISSUE_DATE: Date.UTC(2021, 0, 5), FINAL_DATE: Date.UTC(2023, 5, 1) }), m, permitSrc);
  assert.equal(finaled.phase, 'completed');

  const inspecting = P.normalizeRecord(f({ BP_NUMBER: 'BP 3', STATUS: 'Under Inspection' }), m, permitSrc);
  assert.equal(inspecting.phase, 'construction');

  const noStatus = P.normalizeRecord(f({ BP_NUMBER: 'BP 4' }), m, permitSrc);
  assert.equal(noStatus.phase, 'permit', 'a record in an issued-permits layer is at least issued');

  const deck = P.normalizeRecord(f({ BP_NUMBER: 'BP 5', PERMIT_TYPE: 'Residential Deck', STATUS: 'Issued' }), m, permitSrc);
  assert.equal(deck.newBuild, false);
});

test('application records default to review; "issued" on a planning file means approved', () => {
  const m = P.detectFields([{ name: 'FILE_NUMBER' }, { name: 'APP_STATUS' }, { name: 'LOCATION' }, { name: 'RECEIVED_DATE', type: 'esriFieldTypeDate' }]);
  assert.equal(m.id, 'FILE_NUMBER');
  const poly = { type: 'Polygon', coordinates: [[[-79.7, 43.6], [-79.6, 43.6], [-79.6, 43.7], [-79.7, 43.7], [-79.7, 43.6]]] };
  const r = P.normalizeRecord({ type: 'Feature', id: 9, geometry: poly, properties: { FILE_NUMBER: 'OZ 21/004', APP_STATUS: '', LOCATION: '5 King St W', RECEIVED_DATE: Date.UTC(2021, 3, 1) } }, m, appSrc);
  assert.equal(r.phase, 'review');
  assert.ok(Math.abs(r.lat - 43.65) < 1e-9 && Math.abs(r.lng + 79.65) < 1e-9, 'polygon centroid');
  const r2 = P.normalizeRecord({ type: 'Feature', id: 10, geometry: poly, properties: { FILE_NUMBER: 'SP 1', APP_STATUS: 'Issued' } }, m, appSrc);
  assert.equal(r2.phase, 'approved');
});

test('address normalisation links application and permit on one site', () => {
  assert.equal(P.normalizeAddress('1203-55 Main Street West, Mississauga ON'), '55 MAIN ST W');
  assert.equal(P.normalizeAddress('55 MAIN ST W UNIT 4'), '55 MAIN ST W');
  assert.equal(P.normalizeAddress('10-20 Queen Street East'), '20 QUEEN ST E', 'unit-civic convention');
});

test('projects take the furthest live phase and earliest milestone dates', () => {
  const pt = { type: 'Point', coordinates: [-79.7, 43.6] };
  const am = P.detectFields([{ name: 'FILE_NO' }, { name: 'STATUS' }, { name: 'ADDRESS' }, { name: 'SUBMITTED_DATE', type: 'esriFieldTypeDate' }, { name: 'APPROVAL_DATE', type: 'esriFieldTypeDate' }]);
  const pm = P.detectFields(permitFields);
  const app = P.normalizeRecord({ type: 'Feature', id: 1, geometry: pt, properties: { FILE_NO: 'SP 20/1', STATUS: 'Approved', ADDRESS: '55 Main Street West', SUBMITTED_DATE: Date.UTC(2020, 0, 1), APPROVAL_DATE: Date.UTC(2021, 0, 1) } }, am, appSrc);
  const permit = P.normalizeRecord({ type: 'Feature', id: 2, geometry: pt, properties: { BP_NUMBER: 'BP 9', ADDRESS: '55 MAIN ST W', STATUS: 'Under Inspection', ISSUE_DATE: Date.UTC(2022, 0, 1) } }, pm, permitSrc);
  const withdrawn = P.normalizeRecord({ type: 'Feature', id: 3, geometry: pt, properties: { FILE_NO: 'OZ 1', STATUS: 'Withdrawn', ADDRESS: '55 Main St. W.' } }, am, appSrc);
  const projects = P.buildProjects([app, permit, withdrawn]);
  assert.equal(projects.length, 1);
  const p = projects[0];
  assert.equal(p.phase, 'construction');
  assert.deepEqual(p.kinds.sort(), ['application', 'permit']);
  assert.equal(p.milestones.inception.toISOString().slice(0, 10), '2020-01-01');
  assert.equal(p.milestones.approved.toISOString().slice(0, 10), '2021-01-01');
  assert.equal(p.milestones.permit.toISOString().slice(0, 10), '2022-01-01');
  assert.equal(p.timeline.length, 3);

  const only = P.buildProjects([withdrawn])[0];
  assert.equal(only.phase, 'cancelled');

  // A finished building followed by a new rezoning on the same site = redevelopment in review.
  const old = P.normalizeRecord({ type: 'Feature', id: 4, geometry: pt, properties: { BP_NUMBER: 'BP 1', ADDRESS: '55 Main St W', STATUS: 'Closed', ISSUE_DATE: Date.UTC(2010, 0, 1), FINAL_DATE: Date.UTC(2012, 0, 1) } }, pm, permitSrc);
  const redo = P.normalizeRecord({ type: 'Feature', id: 5, geometry: pt, properties: { FILE_NO: 'OZ 24/1', STATUS: 'Under Review', ADDRESS: '55 Main St W', SUBMITTED_DATE: Date.UTC(2024, 0, 1) } }, am, appSrc);
  assert.equal(P.buildProjects([old, redo])[0].phase, 'review');
});

test('date parsing handles epoch ms, ISO and yyyymmdd', () => {
  assert.equal(P.parseDate(Date.UTC(2020, 1, 2)).toISOString().slice(0, 10), '2020-02-02');
  assert.equal(P.parseDate('2020-02-02').getUTCFullYear(), 2020);
  assert.equal(P.parseDate(20200202).getMonth(), 1);
  assert.equal(P.parseDate('not a date'), null);
  assert.equal(P.parseDate(0), null);
});

test('only a site plan approval makes the site Approved', () => {
  const pt = { type: 'Point', coordinates: [-79.7, 43.6] };
  const am = P.detectFields([{ name: 'FILE_NO' }, { name: 'STATUS' }, { name: 'ADDRESS' }, { name: 'SUBMITTED_DATE', type: 'esriFieldTypeDate' }, { name: 'APPROVAL_DATE', type: 'esriFieldTypeDate' }]);
  const rec = (id, ref, status, approved) => P.normalizeRecord({ type: 'Feature', id, geometry: pt, properties: { FILE_NO: ref, STATUS: status, ADDRESS: '9 King St', SUBMITTED_DATE: Date.UTC(2020, 0, 1), APPROVAL_DATE: approved ? Date.UTC(2022, 0, 1) : null } }, am, appSrc);
  const oz = rec(1, 'OZ 20/1', 'Approved', true);
  assert.equal(oz.phase, 'approved', 'the zoning file itself reads approved');
  const only = P.buildProjects([oz])[0];
  assert.equal(only.phase, 'review', 'zoning approval alone keeps the site under review');
  assert.equal(only.milestones.approved, undefined);
  assert.equal(only.planApproved.date.toISOString().slice(0, 10), '2022-01-01');
  const withSp = P.buildProjects([oz, rec(2, 'SP 21/4', 'Under Review', false)])[0];
  assert.equal(withSp.phase, 'review');
  const spOk = P.buildProjects([oz, rec(3, 'SP 21/4', 'Approved', true)])[0];
  assert.equal(spOk.phase, 'approved');
  assert.equal(spOk.milestones.approved.toISOString().slice(0, 10), '2022-01-01');
});

test('legacy "Transferred" site plans and approvals before a pending rezoning do not make a site Approved', () => {
  const pt = { type: 'Point', coordinates: [-79.7, 43.6] };
  const am = P.detectFields([{ name: 'FILE_NO' }, { name: 'STATUS' }, { name: 'ADDRESS' }, { name: 'SUBMITTED_DATE', type: 'esriFieldTypeDate' }, { name: 'APPROVAL_DATE', type: 'esriFieldTypeDate' }]);
  const rec = (id, ref, status, sub, appr) => P.normalizeRecord({ type: 'Feature', id, geometry: pt, properties: { FILE_NO: ref, STATUS: status, ADDRESS: '3 Elm St', SUBMITTED_DATE: sub ? Date.UTC(sub, 0, 1) : null, APPROVAL_DATE: appr ? Date.UTC(appr, 0, 1) : null } }, am, appSrc);
  const legacy = rec(1, 'SP89-009.000', 'Transferred');
  assert.equal(P.buildProjects([legacy])[0].phase, 'completed', 'legacy files only: an old, built approval');
  assert.equal(P.buildProjects([legacy, rec(2, 'OZS-2024-0001', 'In Review', 2024)])[0].phase, 'review');
  const sp = rec(3, 'SP 18/2', 'Approved', 2017, 2018);
  assert.equal(P.buildProjects([sp])[0].phase, 'approved');
  assert.equal(P.buildProjects([rec(3, 'SP 18/2', 'Approved', 2017, 2018), rec(4, 'OZ 23/1', 'Under Review', 2023)])[0].phase, 'review', 'pending rezoning after the approval');
  assert.equal(P.buildProjects([rec(3, 'SP 18/2', 'Approved', 2017, 2018), rec(5, 'OZ 23/1', 'Approved', 2023, 2024)])[0].phase, 'approved', 'an approved later rezoning does not undo it');
});

test('a registered plan of subdivision is Approved; demolition permits do not set the phase', () => {
  const pt = { type: 'Point', coordinates: [-79.7, 43.6] };
  const am = P.detectFields([{ name: 'FILE_NO' }, { name: 'STATUS' }, { name: 'ADDRESS' }, { name: 'SUBMITTED_DATE', type: 'esriFieldTypeDate' }]);
  const pm = P.detectFields(permitFields);
  const app = (id, ref, status) => P.normalizeRecord({ type: 'Feature', id, geometry: pt, properties: { FILE_NO: ref, STATUS: status, ADDRESS: '7 Oak St', SUBMITTED_DATE: Date.UTC(2021, 0, 1) } }, am, appSrc);
  const bp = (id, ref, status, issued, fin) => P.normalizeRecord({ type: 'Feature', id, geometry: pt, properties: { BP_NUMBER: ref, ADDRESS: '7 Oak St', STATUS: status, ISSUE_DATE: Date.UTC(issued, 0, 1), FINAL_DATE: fin ? Date.UTC(fin, 0, 1) : null } }, pm, permitSrc);
  assert.equal(P.buildProjects([app(1, '21T-M 21-1', 'Draft Approved')])[0].phase, 'review');
  assert.equal(P.buildProjects([app(1, '21T-M 21-1', 'Registered')])[0].phase, 'approved');
  const demo = bp(2, 'HOUSDEMO 22-1', 'Completed', 2022, 2022);
  assert.equal(P.buildProjects([app(3, 'SP 22/9', 'Under Review'), demo])[0].phase, 'review', 'a finished demolition is not the new building');
});

test('only permits for the site\'s building set its phase; a bare "Closed" site plan needs a permit after it', () => {
  const pt = { type: 'Point', coordinates: [-79.7, 43.6] };
  const am = P.detectFields([{ name: 'FILE_NO' }, { name: 'STATUS' }, { name: 'ADDRESS' }, { name: 'SUBMITTED_DATE', type: 'esriFieldTypeDate' }, { name: 'APPROVAL_DATE', type: 'esriFieldTypeDate' }]);
  const app = (id, ref, status, sub, appr) => P.normalizeRecord({ type: 'Feature', id, geometry: pt, properties: { FILE_NO: ref, STATUS: status, ADDRESS: '4 Pine St', SUBMITTED_DATE: Date.UTC(sub, 0, 1), APPROVAL_DATE: appr ? Date.UTC(appr, 0, 1) : null } }, am, appSrc);
  const bp = (ref, type, description, units, issued) => ({ kind: 'permit', ref, type, description, units, uid: ref, municipality: 'Mississauga', statusRaw: 'Issued', phase: 'permit', address: '4 PINE ST', lat: 43.6, lng: -79.7,
    events: [{ date: new Date(Date.UTC(issued, 0, 1)), phase: 'permit', label: 'Issue Date' }] });
  assert.equal(P.permitRole(bp('25-1', 'Permanent', 'New', null, 2025)), 'none', 'a sign');
  assert.equal(P.permitRole(bp('25-2', 'Below Grade Entrance', 'New', null, 2025)), 'none');
  assert.equal(P.permitRole(bp('DRAIN 25-3 SS', 'RESIDENTIAL', 'SITE SERVICING FOR NEW APARTMENT', null, 2025)), 'servicing');
  assert.equal(P.permitRole(bp('BP 3NEW 25-4', 'RESIDENTIAL', 'NEW (20) STOREY APARTMENT', 200, 2025)), 'units');
  assert.equal(P.permitRole(bp('BP 3NEW 25-5', 'INDUSTRIAL', 'NEW SHELL INDUSTRIAL BUILDING INCL (2) DEMISING WALLS', null, 2025)), 'nonres');
  const sp = app(1, 'SP 22/1', 'Approved', 2022, 2023);
  assert.equal(P.buildProjects([sp, bp('25-1', 'Permanent', 'New', null, 2025)])[0].phase, 'approved', 'a sign permit is not the building');
  assert.equal(P.buildProjects([app(1, 'SP 22/1', 'Approved', 2022, 2023), bp('BP 3NEW 25-4', 'RESIDENTIAL', 'NEW (20) STOREY APARTMENT', 200, 2025)])[0].phase, 'permit');
  assert.equal(P.buildProjects([app(2, 'SPA-2021-0001', 'Closed', 2021)])[0].phase, 'review', 'bare Closed, no permit since');
  assert.equal(P.buildProjects([app(2, 'SPA-2021-0001', 'Closed', 2021), bp('BP 3NEW 22-9', 'RESIDENTIAL', 'NEW DWELLING', 1, 2022)])[0].phase, 'permit');
  assert.equal(P.buildProjects([bp('25-1', 'Permanent', 'New', null, 2025)]).length, 0, 'a site with only a sign permit is not a development');
});
