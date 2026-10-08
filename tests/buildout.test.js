'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../js/phases.js');
const D = require('../js/demand.js');

// Rectangle polygon in lng/lat.
const rect = (x0, y0, x1, y1) => ({ type: 'Polygon', coordinates: [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]] });
const point = (x, y) => ({ type: 'Point', coordinates: [x, y] });

const appFields = P.detectFields([{ name: 'FILE_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'UNITS', type: 'esriFieldTypeInteger' },
  { name: 'RECEIVED_DATE', type: 'esriFieldTypeDate' }]);
const permitFields = P.detectFields([{ name: 'BP_NO' }, { name: 'ADDRESS' }, { name: 'STATUS' }, { name: 'DWELLINGS', type: 'esriFieldTypeInteger' },
  { name: 'DESCRIPTION' }, { name: 'ISSUE_DATE', type: 'esriFieldTypeDate' }]);
const APP = { id: 'app', municipality: 'Brampton', kind: 'application' };
const BP = { id: 'bp', municipality: 'Brampton', kind: 'permit' };
let n = 0;
const app = (geom, props) => P.normalizeRecord({ type: 'Feature', id: ++n, geometry: geom, properties: props }, appFields, APP);
const permit = (x, y, props) => P.normalizeRecord({ type: 'Feature', id: ++n, geometry: point(x, y), properties: { DESCRIPTION: 'New single detached dwelling', ...props } }, permitFields, BP);
const Y = (y, m = 0) => Date.UTC(y, m, 1);

// A ~600 m x 550 m subdivision.
const SUB = rect(-79.80, 43.70, -79.7925, 43.705);

test('subdivision encompasses the house permits on its land; units are counted once', () => {
  const sub = app(SUB, { FILE_NO: 'OZS-2020-01', ADDRESS: '0 Heritage Rd', STATUS: 'Draft Approved', UNITS: 10, RECEIVED_DATE: Y(2020) });
  // Zoning amendment on the same land, same proposal.
  const zba = app(rect(-79.8001, 43.6999, -79.7924, 43.7051), { FILE_NO: 'OZS-2020-02', ADDRESS: '10500 Heritage Rd', STATUS: 'Approved', UNITS: 10, RECEIVED_DATE: Y(2020, 3) });
  const houses = [
    permit(-79.799, 43.701, { BP_NO: 'BP1', ADDRESS: '1 Maple Cres', STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2022) }),
    permit(-79.798, 43.702, { BP_NO: 'BP2', ADDRESS: '3 Maple Cres', STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2022) }),
    permit(-79.797, 43.703, { BP_NO: 'BP3', ADDRESS: '5 Maple Cres', STATUS: 'Issued', DWELLINGS: 1, ISSUE_DATE: Y(2024) }),
    // Two permits for one building (foundation + full) repeat its 2 units: count once.
    permit(-79.796, 43.704, { BP_NO: 'BP4', ADDRESS: '7 Maple Cres', STATUS: 'Issued', DWELLINGS: 2, ISSUE_DATE: Y(2024) }),
    permit(-79.796, 43.704, { BP_NO: 'BP5', ADDRESS: '7 Maple Cres', STATUS: 'Issued', DWELLINGS: 2, ISSUE_DATE: Y(2024, 6) }),
  ];
  const outside = permit(-79.70, 43.70, { BP_NO: 'BP9', ADDRESS: '99 Far Rd', STATUS: 'Issued', DWELLINGS: 1, ISSUE_DATE: Y(2024) });

  const projects = P.buildProjects([sub, zba, ...houses, outside]);
  assert.equal(projects.length, 2, 'one subdivision project + one unrelated permit');
  const p = projects.find(x => x.records.includes(sub));
  assert.ok(p.records.includes(zba), 'same-land applications merge');
  assert.equal(p.records.filter(r => r.kind === 'permit').length, 5);
  assert.equal(p.title, '0 Heritage Rd');
  assert.deepEqual(p.buildout, { planned: 10, permitted: 5, completed: 2, remaining: 5, unbuilt: 8, permits: 5 });
  assert.equal(p.units, 10, 'not 10 + 5');
  assert.equal(p.phase, 'construction', 'some houses finished, units still to permit');
  // Population is based on the project's units, so nothing is double counted.
  assert.equal(D.estimate(projects).totalUnits, 11);
});

test('a plan with units left to permit is not "completed" even if every permit so far is', () => {
  const sub = app(SUB, { FILE_NO: 'S1', ADDRESS: '0 Heritage Rd', STATUS: 'Registered', UNITS: 4, RECEIVED_DATE: Y(2019) });
  const h = permit(-79.799, 43.701, { BP_NO: 'B1', ADDRESS: '1 Oak St', STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2021) });
  const p = P.buildProjects([sub, h])[0];
  assert.equal(p.buildout.remaining, 3);
  assert.equal(p.phase, 'construction');
  const all = [1, 2, 3, 4].map(i => permit(-79.799 + i * 0.001, 43.701, { BP_NO: `C${i}`, ADDRESS: `${i} Elm St`, STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2021) }));
  const done = P.buildProjects([app(SUB, { FILE_NO: 'S2', ADDRESS: '0 Heritage Rd', STATUS: 'Registered', UNITS: 4, RECEIVED_DATE: Y(2019) }), ...all])[0];
  assert.equal(done.buildout.remaining, 0);
  assert.equal(done.phase, 'completed');
});

test('site plans nested in a subdivision roll up into it; planned = max(parent, sum of parts)', () => {
  const sub = app(SUB, { FILE_NO: 'OZS-1', ADDRESS: '0 Heritage Rd', STATUS: 'Draft Approved', UNITS: 500, RECEIVED_DATE: Y(2018) });
  const blockA = app(rect(-79.7995, 43.7005, -79.798, 43.702), { FILE_NO: 'SPA-1', ADDRESS: '20 Block A Rd', STATUS: 'Approved', UNITS: 200, RECEIVED_DATE: Y(2021) });
  const blockB = app(rect(-79.7960, 43.7030, -79.794, 43.7045), { FILE_NO: 'SPA-2', ADDRESS: '40 Block B Rd', STATUS: 'In Review', UNITS: 150, RECEIVED_DATE: Y(2022) });
  const tower = permit(-79.799, 43.701, { BP_NO: 'T1', ADDRESS: '20 Block A Rd', STATUS: 'Issued', DWELLINGS: 200, ISSUE_DATE: Y(2023), DESCRIPTION: 'New 12 storey apartment building' });
  const projects = P.buildProjects([sub, blockA, blockB, tower]);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].buildout.planned, 500, 'parent 500 covers parts 200 + 150');
  assert.equal(projects[0].buildout.permitted, 200);
  assert.equal(projects[0].buildout.remaining, 300);

  // When the parent states no units, the parts add up.
  const sub2 = app(SUB, { FILE_NO: 'OZS-2', ADDRESS: '0 Heritage Rd', STATUS: 'Approved', RECEIVED_DATE: Y(2018) });
  const p2 = P.buildProjects([sub2, blockA, blockB])[0];
  assert.equal(p2.buildout.planned, 350);
});

test('older buildings, withdrawn applications and area-wide plans do not absorb permits', () => {
  // Permit issued years before the application: an earlier building on the land.
  const sub = app(SUB, { FILE_NO: 'S', ADDRESS: '0 Heritage Rd', STATUS: 'In Review', UNITS: 50, RECEIVED_DATE: Y(2024) });
  const old = permit(-79.799, 43.701, { BP_NO: 'OLD', ADDRESS: '1 Old Farm Rd', STATUS: 'Closed', DWELLINGS: 1, ISSUE_DATE: Y(2017) });
  assert.equal(P.buildProjects([sub, old]).length, 2);

  // Withdrawn application.
  const gone = app(SUB, { FILE_NO: 'W', ADDRESS: '0 Heritage Rd', STATUS: 'Withdrawn', UNITS: 50, RECEIVED_DATE: Y(2019) });
  const h = permit(-79.799, 43.701, { BP_NO: 'H', ADDRESS: '1 Oak St', STATUS: 'Issued', DWELLINGS: 1, ISSUE_DATE: Y(2022) });
  assert.equal(P.buildProjects([gone, h]).length, 2);

  // A ~5 km x 5 km secondary plan area is too large to be a site.
  const area = app(rect(-79.85, 43.68, -79.79, 43.725), { FILE_NO: 'OPA', ADDRESS: '0 Area Rd', STATUS: 'Approved', UNITS: 20000, RECEIVED_DATE: Y(2016) });
  const h2 = permit(-79.80, 43.70, { BP_NO: 'H2', ADDRESS: '2 Oak St', STATUS: 'Issued', DWELLINGS: 1, ISSUE_DATE: Y(2022) });
  assert.equal(P.buildProjects([area, h2]).length, 2);
});

test('demand basis: left to build, not yet completed, completed', () => {
  const sub = app(SUB, { FILE_NO: 'S', ADDRESS: '0 Heritage Rd', STATUS: 'Registered', UNITS: 100, RECEIVED_DATE: Y(2019) });
  const hs = [1, 2, 3, 4].map(i => permit(-79.799 + i * 0.001, 43.701, { BP_NO: `H${i}`, ADDRESS: `${i} Elm St`, STATUS: i <= 2 ? 'Closed' : 'Issued', DWELLINGS: 10, ISSUE_DATE: Y(2021) }));
  const projects = P.buildProjects([sub, ...hs]);
  assert.equal(projects.length, 1);
  assert.equal(D.estimate(projects, D.DEFAULT_CRITERIA, 'all').totalUnits, 100);
  assert.equal(D.estimate(projects, D.DEFAULT_CRITERIA, 'remaining').totalUnits, 60);
  assert.equal(D.estimate(projects, D.DEFAULT_CRITERIA, 'unbuilt').totalUnits, 80);
  assert.equal(D.estimate(projects, D.DEFAULT_CRITERIA, 'completed').totalUnits, 20);
});
