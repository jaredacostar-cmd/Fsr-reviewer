'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const AR = require('../js/areas.js');
const { insidePoint } = require('../scripts/build-areas.js');

const sq = (x0, y0, x1, y1) => [[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]];

test('locate: projects fall in every area containing them (MTSAs can overlap), within their municipality', () => {
  const list = AR.prepare([
    { id: 'sp:a', municipality: 'Brampton', rings: sq(0, 0, 10, 10) },
    { id: 'mtsa:x', municipality: 'Brampton', rings: sq(4, 4, 6, 6) },
    { id: 'mtsa:y', municipality: 'Brampton', rings: sq(5, 5, 7, 7) },
    { id: 'sp:m', municipality: 'Mississauga', rings: sq(0, 0, 10, 10) },
  ]);
  assert.deepEqual(AR.locate(list, 5.5, 5.5, 'Brampton'), ['sp:a', 'mtsa:x', 'mtsa:y']);
  assert.deepEqual(AR.locate(list, 20, 20, 'Brampton'), []);
});

test('census totals are weighted by the share of each DA inside the area', () => {
  const das = AR.tagCensus({ das: [
    [1, 1, 1000, 400, 390, 'Brampton', { 'sp:a': 1, 'mtsa:x': 0.25 }],
    [2, 2, 600, 200, 200, 'Brampton', { 'sp:a': 0.5 }],
    [3, 3, 900, 300, 300, 'Caledon', {}],
  ] });
  assert.equal(AR.censusTotals(das, {}).population, 2500);
  assert.equal(AR.censusTotals(das, { muni: 'Brampton' }).population, 1600);
  assert.equal(AR.censusTotals(das, { sp: 'sp:a' }).population, 1300);
  assert.equal(AR.censusTotals(das, { mtsa: 'mtsa:x' }).population, 250);
  assert.equal(AR.censusTotals(das, { sp: 'sp:a', mtsa: 'mtsa:x' }).dwellings, 100);
});

test('growth since the census: completed permits after census day, estimated when no completion date', () => {
  const ev = (phase, d) => ({ phase, date: new Date(d) });
  const permit = (units, events) => ({ kind: 'permit', phase: 'completed', units, newBuild: true, ref: `BP${units}${events.length}`, description: 'New dwelling', events });
  const p = (recs, extra = {}) => ({ phase: 'completed', municipality: 'Brampton', records: recs, types: [], description: 'single detached', buildout: null, ...extra });
  const projects = [
    p([permit(1, [ev('permit', '2019-01-01'), ev('completed', '2020-06-01')])]),   // before census
    p([permit(1, [ev('permit', '2021-02-01'), ev('completed', '2022-03-01')])]),   // after
    p([permit(1, [ev('permit', '2020-09-01')])]),                                   // est. 2021-09: after
    p([permit(1, [ev('permit', '2019-09-01')])]),                                   // est. 2020-09: before
    p([], { phase: 'approved', buildout: { planned: 50, permitted: 0, completed: 0, remaining: 50, unbuilt: 50 } }),
  ];
  const g = AR.growthSince(projects, {}, '2021-05-11');
  assert.equal(g.built.units, 2);
  assert.equal(g.built.estimatedDates, true);
  assert.equal(g.approved.units, 50);
  assert.ok(g.built.population > 8 && g.built.population < 9, `${g.built.population}`);
});

test('a point inside a concave DA', () => {
  const c = [[[0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10], [0, 0]]];
  const [x, y] = insidePoint(c);
  assert.ok(require('../js/phases.js').pointInRings(x, y, c));
});
