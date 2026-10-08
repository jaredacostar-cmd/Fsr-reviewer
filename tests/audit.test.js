'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const { audit } = require('../js/audit.js');

const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const point = (x, y) => ({ type: 'Point', coordinates: [x, y] });
const appFields = P.detectFields([{ name: 'FILE_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'UNITS', type: 'esriFieldTypeInteger' },
  { name: 'RECEIVED_DATE', type: 'esriFieldTypeDate' }]);
const permitFields = P.detectFields([{ name: 'BP_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'DWELLINGS', type: 'esriFieldTypeInteger' },
  { name: 'DESCRIPTION' }, { name: 'ISSUE_DATE', type: 'esriFieldTypeDate' }]);
let n = 0;
const src = (id, kind) => ({ id, name: id, municipality: 'Mississauga', kind });
const app = (geom, props, s = 'apps') => P.normalizeRecord({ type: 'Feature', id: ++n, geometry: geom, properties: props }, appFields, src(s, 'application'));
const permit = (x, y, props) => P.normalizeRecord({ type: 'Feature', id: ++n, geometry: point(x, y), properties: { DESCRIPTION: 'New apartment building', ...props } }, permitFields, src('bp', 'permit'));
const Y = y => Date.UTC(y, 0, 1);

test('multi-address application joins the permit at one of its addresses', () => {
  const a = app(point(-79.64, 43.59), { FILE_NO: 'OZ 20-1', ADDRESS: '202 and 204 Burnhamthorpe Road East', STATUS: 'Approved', UNITS: 406, RECEIVED_DATE: Y(2019) });
  const b = permit(-79.6402, 43.5901, { BP_NO: '21-100', ADDRESS: '202 BURNHAMTHORPE RD E', STATUS: 'Closed', DWELLINGS: 406, ISSUE_DATE: Y(2021) });
  const ps = P.buildProjects([a, b]);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].units, 406, 'not 812');
  const r = P.buildProjects([app(point(-79.6, 43.6), { FILE_NO: 'X', ADDRESS: '65-71 Agnes Street', STATUS: 'Approved', UNITS: 358, RECEIVED_DATE: Y(2020) }),
    permit(-79.6, 43.6, { BP_NO: 'Y', ADDRESS: '65 Agnes St', STATUS: 'Issued', DWELLINGS: 358, ISSUE_DATE: Y(2022) })]);
  assert.equal(r.length, 1);
});

test('permit-only project with the same units next to an application joins it', () => {
  const a = app(rect(-79.6400, 43.5900, -79.6398, 43.5902), { FILE_NO: 'OZ 1', ADDRESS: '34 Elm Drive West', STATUS: 'Approved', UNITS: 418, RECEIVED_DATE: Y(2018) });
  const b = permit(-79.6402, 43.5903, { BP_NO: 'B1', ADDRESS: '30 ELM DR W', STATUS: 'Closed', DWELLINGS: 418, ISSUE_DATE: Y(2020) });
  const ps = P.buildProjects([a, b]);
  assert.equal(ps.length, 1);
  assert.equal(ps[0].buildout.permitted, 418);
  // Different unit count: a neighbouring building, kept separate.
  const c = permit(-79.6402, 43.5903, { BP_NO: 'B2', ADDRESS: '30 ELM DR W', STATUS: 'Closed', DWELLINGS: 300, ISSUE_DATE: Y(2020) });
  assert.equal(P.buildProjects([a, c]).length, 2);
});

test('audit: integrity checks are zero and the unit reconciliation adds up', () => {
  const a1 = app(rect(-79.70, 43.70, -79.69, 43.705), { FILE_NO: 'OZ 21-5', ADDRESS: '10 Main St', STATUS: 'Approved', UNITS: 200, RECEIVED_DATE: Y(2021) }, 'layer A');
  const a2 = app(rect(-79.70, 43.70, -79.69, 43.705), { FILE_NO: 'OZ-21-005', ADDRESS: '10 Main St', STATUS: 'Approved', UNITS: 200, RECEIVED_DATE: Y(2021) }, 'layer B');
  const z = app(rect(-79.70, 43.70, -79.69, 43.705), { FILE_NO: 'ZBA 21-6', ADDRESS: '10 Main St', STATUS: 'Approved', UNITS: 190, RECEIVED_DATE: Y(2021) });
  const bp1 = permit(-79.695, 43.702, { BP_NO: '22-1 CON', ADDRESS: '10 Main St', STATUS: 'Issued', DWELLINGS: 120, ISSUE_DATE: Y(2022) });
  const bp2 = permit(-79.695, 43.702, { BP_NO: '22-1', ADDRESS: '10 Main St', STATUS: 'Issued', DWELLINGS: 120, ISSUE_DATE: Y(2022) });
  const w = app(point(-79.5, 43.6), { FILE_NO: 'OZ 9', ADDRESS: '5 Gone Rd', STATUS: 'Withdrawn', UNITS: 50, RECEIVED_DATE: Y(2021) });
  const raw = [a1, a2, z, bp1, bp2, w];
  const before = JSON.stringify(raw.map(r => [r.units, r.events.length]));
  const deduped = P.dedupeRecords(raw);
  const projects = P.buildProjects(deduped);
  assert.equal(JSON.stringify(raw.map(r => [r.units, r.events.length])), before, 'merging does not change the source records');
  const a = audit(raw, deduped, projects);
  assert.deepEqual(a.checks.map(c => c.value), [0, 0, 0]);
  assert.equal(a.records.copiesMerged, 2, 'OZ 21-5 / OZ-21-005 and the CON permit');
  const u = a.units;
  assert.equal(u.raw, 880);
  assert.equal(u.counted, 200);
  assert.equal(u.raw - u.duplicateCopies - u.withdrawn - u.repeatApps - u.repeatPermits - u.permitsInApps - u.other, u.counted);
});
