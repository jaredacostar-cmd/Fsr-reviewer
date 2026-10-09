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

test('sewer pipe capacity data: Manning capacities, downstream links, census load conserved', () => {
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'sewers.json'), 'utf8'));
  const P = d.pipes;
  assert.ok(P.length > 10000);
  assert.ok(P.every(p => p[0] >= 300 && p[3] < P.length && p[10].length >= 4));
  assert.ok(P.filter(p => p[2] > 0).length / P.length > 0.95, 'most pipes have a capacity');
  // 600 mm at 0.5 % ≈ 435 L/s full (Manning n 0.013).
  const m = (dmm, s) => { const D = dmm / 1000; return 1000 * Math.PI * D * D / 4 * Math.pow(D / 4, 2 / 3) * Math.sqrt(s) / 0.013; };
  assert.ok(Math.abs(m(600, 0.005) - 435) < 5);
  const ends = P.filter(p => p[3] === -1).reduce((t, p) => t + p[4], 0);
  assert.ok(ends > 1.3e6 && ends < 1.5e6, `census reaching the outlets ${ends}`);
});

test('info texts load (no syntax errors) and every entry has a title and body', () => {
  const vm = require('vm');
  const ctx = { window: {}, self: {} }; ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'info.js'), 'utf8'), ctx);
  const app = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');
  new vm.Script(app);
  const info = fs.readFileSync(path.join(__dirname, '..', 'js', 'info.js'), 'utf8');
  for (const k of ['fire-storm', 'existing-pipes', 'dev-brief']) {
    assert.ok(app.includes(`data-info="${k}"`), `app uses ${k}`);
    assert.ok(info.includes(`'${k}': {`), `info has ${k}`);
  }
});
