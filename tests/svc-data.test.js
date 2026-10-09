const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const read = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', f), 'utf8'));

test('census shares by area overlap line up with the census and servicing data', () => {
  const sc = read('svc-census.json'), svc = read('servicing.json'), areas = read('areas.json');
  assert.deepStrictEqual(sc.zones, svc.pressureZones.map(z => z.id));
  assert.deepStrictEqual(sc.drainage, svc.drainageAreas.map(d => d.id));
  for (const c of areas.censuses) {
    const rows = sc.years[c.year];
    assert.equal(rows.length, c.das.length, `${c.year} DAs`);
    for (const [z, w] of rows) for (const list of [z, w]) {
      const s = list.reduce((t, [, f]) => t + f, 0);
      assert.ok(s <= 1.001, `shares add to ${s}`);
    }
  }
});

test('2025 report figures are internally consistent', () => {
  const r = read('peel-reports.json');
  for (const [k, p] of Object.entries(r.wastewater.plants)) {
    assert.ok(p.avgMLd < p.ratedMLd && p.maxDayMLd > p.avgMLd, k);
    assert.ok(Math.abs(p.avgMLd / p.ratedMLd * 100 - p.pctOfCapacity) < 1, `${k} % of capacity`);
    assert.ok(r.reports[p.ref], `${k} reference`);
  }
  const sp = r.water.southPeel;
  assert.ok(Math.abs(sp.plants.reduce((t, p) => t + p.avgMLd, 0) - sp.avgMLd) < 2);
  for (const s of r.water.caledon) assert.ok(s.avgM3d < s.ratedM3d && s.maxDayM3d >= s.avgM3d && r.reports[s.ref], s.name);
  for (const x of r.wastewater.inflows) assert.ok(x.mld > 0 && r.reports[x.ref], x.id);
});

test('reference standards each name a source link and what is used from it', () => {
  const r = read('peel-reports.json');
  assert.ok(r.standards.length >= 8);
  for (const x of r.standards) assert.ok(/^https:\/\//.test(x.url) && x.title && x.used, x.id);
});

test('nearest area: distance to the closest edge, within the limit', () => {
  const A = require('../js/areas.js');
  // Two 0.01° squares near 43.7° N; the point is 0.005° east of the first one (~400 m).
  const sq = (id, x) => ({ id, rings: [[[x, 43.7], [x + 0.01, 43.7], [x + 0.01, 43.71], [x, 43.71], [x, 43.7]]] });
  const list = A.prepare([sq('a', -79.8), sq('b', -79.7)]);
  const n = A.nearest(list, -79.785, 43.705, 5000);
  assert.equal(n.id, 'a');
  assert.ok(Math.abs(n.m - 0.005 * 111320 * Math.cos(43.705 * Math.PI / 180)) < 2, `${n.m}`);
  assert.equal(A.nearest(list, -79.785, 43.705, 300), null, 'beyond the limit');
  assert.equal(A.nearest(list, null, 43.7), null);
});

test('2026 DC planned works: lines and facilities inside Peel, labelled, plant capacity steps', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'dc-infra.json'), 'utf8'));
  const inPeel = ([x, y]) => x > -80.3 && x < -79.4 && y > 43.4 && y < 44.1;
  for (const sys of ['wastewater', 'water']) {
    const L = d[sys].lines;
    assert.ok(L.length > 150, `${sys} lines ${L.length}`);
    assert.ok(L.every(l => l.g.length > 1 && l.g.every(inPeel)), `${sys} lines inside Peel`);
    assert.ok(L.filter(l => l.y && l.p).length / L.length > 0.8, `${sys} mostly labelled`);
    assert.ok(d[sys].facilities.filter(f => f.g).every(f => inPeel(f.g)));
  }
  assert.ok(d.source.status.includes('Draft'));
  assert.deepEqual(d.plantCapacity.Clarkson.map(s => s.mld), [500]);
  assert.ok(d.plantCapacity.Lakeview.some(s => s.mld === 600));
});
