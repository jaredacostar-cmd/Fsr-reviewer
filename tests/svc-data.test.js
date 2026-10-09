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
