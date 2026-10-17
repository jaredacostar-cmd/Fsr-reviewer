'use strict';
// The preliminary gravity sanitary sewer (js/sewer-design.js): Peel's Linear Wastewater Standards
// rules hold on every design, and "best" is the least excavation.
const test = require('node:test');
const assert = require('node:assert/strict');
const SD = require('../js/sewer-design.js');

// A straight route of length L with ground gf(x), maintenance holes at most `sp` apart, samples every 10 m.
const route = (L, gf, sp = 120) => ({ nodes: SD.placeMHs([0, L], sp).map(x => ({ x, g: gf(x), bend: 0 })), samples: Array.from({ length: Math.floor(L / 10) }, (_, k) => ({ x: k * 10 + 5, g: gf(k * 10 + 5) })) });
const near = (a, b, tol) => Math.abs(a - b) <= tol;

test('Manning, n 0.013: a 200 mm pipe at 1% carries about 32.8 L/s full', () => {
  assert.ok(near(SD.qFull(0.2, 0.01) * 1000, 32.8, 0.1));
  assert.ok(near(SD.vFull(0.2, 0.01), 1.04, 0.01));
  // the steepest slope: 3.0 m/s full
  assert.ok(near(SD.vFull(0.2, SD.maxSlope(0.2)), 3.0, 1e-6));
  // part-full: half full carries half the full flow at the full-flow velocity
  const half = SD.partAt(0.3, 0.005, Math.PI);
  assert.ok(near(half.Q, SD.qFull(0.3, 0.005) / 2, 1e-9));
  assert.ok(near(half.V, SD.vFull(0.3, 0.005), 1e-9));
});

test('the minimum slope meets 0.75 m/s at the design flow and the 0.7 flow ratio', () => {
  for (const [D, q] of [[0.2, 1], [0.2, 8], [0.25, 15], [0.3, 30], [0.45, 120]]) {
    const S = SD.minSlope(D, q / 1000);
    assert.ok(S > 0, `${D} m @ ${q} L/s`);
    assert.ok(SD.partFor(D, S, q / 1000).V >= 0.75 - 1e-6, 'velocity');
    assert.ok(q / 1000 <= 0.7 * SD.qFull(D, S) + 1e-9, 'flow ratio');
    // and is the flattest: 2% flatter fails one of them
    const S2 = S * 0.98, pf = SD.partFor(D, S2, q / 1000);
    assert.ok(!pf || pf.V < 0.75 || q / 1000 > 0.7 * SD.qFull(D, S2), 'flattest');
  }
  // too much flow for the pipe within 3.0 m/s full: no slope
  assert.equal(SD.minSlope(0.2, 0.2), null);
});

test('drops through a maintenance hole: 0.03–0.20 m up to 300 mm; the velocity head rule above', () => {
  assert.deepEqual(SD.dropRange(250, 1.2), { min: 0.03, max: 0.2 });
  const r = SD.dropRange(450, 2, 90);   // ½ V²/2g at 90°
  assert.ok(near(r.min, 0.5 * 4 / (2 * 9.81), 1e-9));
});

test('a design keeps every rule: slopes, velocity, flow ratio, cover, trench, spacing, drops, the connection', () => {
  const cases = [
    { name: 'flat ground, deep sewer', rt: route(240, () => 180), conn: { invert: 174, dmm: 375 }, q: 8 },
    { name: 'falling ground', rt: route(300, x => 200 - x * 0.04), conn: { invert: 183, dmm: 450 }, q: 20 },
    { name: 'rolling ground', rt: route(700, x => 190 - x * 0.006 + Math.sin(x / 70) * 1.2, 190), conn: { invert: 179, dmm: 600 }, q: 25 },
  ];
  for (const c of cases) {
    const d = SD.design(c.rt, c.conn, c.q);
    assert.ok(d.ok, `${c.name}: ${d.why}`);
    const D = d.dmm / 1000;
    d.reaches.forEach((rc, i) => {
      assert.ok(rc.S >= (i === 0 ? Math.max(d.sMin, 0.01) : d.sMin) - 1e-9, `${c.name}: reach ${i} slope (the last leg ≥ 1%)`);
      assert.ok(rc.vFull <= 3.0 + 1e-6, `${c.name}: ≤ 3.0 m/s full`);
      assert.ok(rc.v >= 0.75 - 1e-6, `${c.name}: ≥ 0.75 m/s at design flow`);
      assert.ok(rc.qRatio <= 0.7 + 1e-6, `${c.name}: flow ratio ≤ 0.7`);
      assert.ok(rc.L <= 200 + 1e-6, `${c.name}: spacing`);
    });
    // cover and trench at every ground point along each reach
    const pts = [...c.rt.nodes, ...c.rt.samples];
    for (const pt of pts) {
      const rc = d.reaches.find(x => c.rt.nodes[x.from].x <= pt.x + 1e-9 && pt.x <= c.rt.nodes[x.to].x + 1e-9);
      const e = rc.inv_up - rc.S * (pt.x - c.rt.nodes[rc.from].x);
      assert.ok(pt.g - (e + D) >= 2.5 - 1e-6, `${c.name}: 2.5 m of cover at ${pt.x}`);
      assert.ok(pt.g - e + 0.15 <= 8.0 + 1e-6, `${c.name}: 8 m trench at ${pt.x}`);
    }
    // drops at the maintenance holes: allowed, or a drop structure (0.9 m and more)
    d.mhs.slice(1, -1).forEach(m => assert.ok(m.structure ? m.drop >= 0.9 - 1e-6 : m.drop >= 0.03 - 1e-6 && m.drop <= 0.2 + 1e-6, `${c.name}: drop ${m.drop}`));
    // the connection: obverts matched or the new one above, never a larger pipe into a smaller one
    const last = d.mhs[d.mhs.length - 1];
    assert.ok(last.inv_in + D >= c.conn.invert + c.conn.dmm / 1000 - 1e-6, `${c.name}: obvert at or above the existing`);
    assert.ok(d.dmm <= c.conn.dmm);
  }
});

test('least excavation: the shallowest profile the rules allow (the site end at the minimum cover)', () => {
  const d = SD.design(route(240, () => 180), { invert: 174, dmm: 375 }, 8);
  // obvert 2.5 m below ground at the upstream end, 200 mm pipe: depth to invert 2.7 m
  assert.ok(near(d.mhs[0].depth, 2.7, 0.03));
  assert.equal(d.dmm, 200);
  // avoiding drop structures: none, and more digging
  const a = SD.design(route(240, () => 180), { invert: 174, dmm: 375 }, 8, { avoidStructures: true });
  assert.ok(a.ok); assert.equal(a.structures, 0); assert.ok(a.cost >= d.cost - 1e-6);
});

test('when gravity can\'t reach the existing sewer, it says so; never a larger pipe into a smaller one', () => {
  const d = SD.design(route(240, () => 180), { invert: 176.3, dmm: 375 }, 8);
  assert.equal(d.ok, false);
  assert.match(d.why, /below the existing obvert: it needs pumping, a deeper outlet or another route/);
  // (100 L/s is more than any 200 mm pipe carries within 3.0 m/s full and the 0.7 flow ratio)
  const big = SD.design(route(100, () => 180), { invert: 172, dmm: 200 }, 100);
  assert.equal(big.ok, false);
  assert.match(big.why, /larger than the existing 200 mm sewer/);
});

test('maintenance holes along a line: at each vertex and at most the spacing apart', () => {
  assert.deepEqual(SD.placeMHs([0, 450], 200), [0, 150, 300, 450]);
  assert.deepEqual(SD.placeMHs([0, 100, 350], 200), [0, 100, 225, 350]);
});

test('the design flow from what is typed: Peel criteria, or the flow itself', () => {
  const f = SD.flowFrom({ pop: 1000, ha: 10 });
  // 1,000 people: 290 L/cap/d, Harmon 1 + 14 / (4 + 1) = 3.8, I&I 0.26 L/s/ha
  assert.ok(near(f.q, 1000 * 290 / 86400 * 3.8 + 2.6, 1e-9));
  assert.deepEqual(SD.flowFrom({ q: 12.5 }), { q: 12.5, typed: true });
  assert.match(SD.SOURCE, /Linear Wastewater Standards \(published Nov 2022, R1\.0 Mar 2023\)/);
});
