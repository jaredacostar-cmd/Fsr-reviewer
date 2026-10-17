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

// ---- A network: branches joining at maintenance holes, a size for each reach ----------------------
// A trunk of four maintenance holes (0 → 3, 3 the connection) and a branch (4 → 5 → 2) joining at 2.
const netOf = (gf, qTrunk, qBranch) => {
  const xy = [[0, 0], [150, 0], [300, 0], [420, 0], [300, 300], [300, 150]];
  const nodes = xy.map(([x, y]) => ({ g: gf(x, y), bend: 0 }));
  const seg = (from, to, q) => { const [x0, y0] = xy[from], [x1, y1] = xy[to], L = Math.hypot(x1 - x0, y1 - y0); return { from, to, L, q, pts: Array.from({ length: Math.floor(L / 10) }, (_, k) => { const t = (k * 10 + 5) / L; return { d: k * 10 + 5, g: gf(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t) }; }) }; };
  return { nodes, reaches: [seg(0, 1, qTrunk), seg(1, 2, qTrunk), seg(4, 5, qBranch), seg(5, 2, qBranch), seg(2, 3, qTrunk + qBranch)] };
};

test('on a single line, the network design is design(): the same size, profile and digging', () => {
  for (const [rt, conn, q] of [[route(240, () => 180), { invert: 174, dmm: 375 }, 8], [route(300, x => 200 - x * 0.04), { invert: 183, dmm: 450 }, 20]]) {
    const a = SD.design(rt, conn, q), b = SD.designNet(SD.lineNet(rt, q), conn);
    assert.ok(a.ok && b.ok);
    assert.equal(b.dmm, a.dmm);
    assert.ok(near(b.cost, a.cost, 1e-6));
    assert.deepEqual(b.mhs.map(m => m.inv_out), a.mhs.map(m => m.inv_out));
  }
});

test('a branch joins the trunk: the flows add, the pipe grows downstream (never smaller), every rule holds', () => {
  const gf = (x, y) => 200 - x * 0.012 + y * 0.01;   // the branch comes down from the north
  const net = netOf(gf, 20, 30), d = SD.designNet(net, { invert: 189, dmm: 450 });
  assert.ok(d.ok, d.why);
  const by = (f, t) => d.reaches.find(r => r.from === f && r.to === t);
  assert.equal(by(2, 3).q, 50);
  assert.ok(by(2, 3).dmm >= by(1, 2).dmm && by(2, 3).dmm >= by(5, 2).dmm, 'never a larger pipe into a smaller one');
  assert.ok(by(2, 3).dmm > 200, 'the trunk below the junction is larger');
  for (const r of d.reaches) {
    const D = r.dmm / 1000, rc = net.reaches.find(x => x.from === r.from && x.to === r.to);
    assert.ok(r.v >= 0.75 - 1e-6 && r.vFull <= 3.0 + 1e-6 && r.qRatio <= 0.7 + 1e-6, `${r.from}→${r.to}`);
    if ([0, 4].includes(r.from)) assert.ok(r.S >= 0.01 - 1e-9, 'the last leg of each branch ≥ 1%');
    for (const p of [{ d: 0, g: net.nodes[r.from].g }, ...rc.pts, { d: rc.L, g: net.nodes[r.to].g }]) {
      const e = r.inv_up - r.S * p.d;
      assert.ok(p.g - (e + D) >= 2.5 - 1e-6, `cover ${r.from}→${r.to} at ${p.d}`);
      assert.ok(p.g - e + 0.15 <= 8 + 1e-6, `trench ${r.from}→${r.to} at ${p.d}`);
    }
  }
  // At the junction: both pipes in, each at or above the pipe out's obvert (obverts matched where it grows)
  const j = d.mhs[2], out = by(2, 3);
  assert.equal(j.ins.length, 2);
  for (const x of j.ins) {
    const rin = d.reaches[x.reach];
    assert.ok(x.inv + rin.dmm / 1000 >= j.inv_out + out.dmm / 1000 - 1e-6, 'obvert in at or above obvert out');
    assert.ok(x.structure ? x.drop >= 0.9 - 1e-6 : x.drop >= Math.max(0.03, (out.dmm - rin.dmm) / 1000) - 1e-6 && x.drop <= Math.max(0.2, (out.dmm - rin.dmm) / 1000) + 1e-6, `drop ${x.drop}`);
  }
  // the connection
  const c = d.mhs[3].ins[0];
  assert.ok(c.inv + out.dmm / 1000 >= 189 + 0.45 - 1e-6);
});

test('a network that is not a tree, or with no connection, is refused', () => {
  const gf = () => 200, net = netOf(gf, 10, 10);
  assert.throws(() => SD.designNet({ ...net, reaches: [...net.reaches, { from: 2, to: 4, L: 10, q: 1, pts: [] }] }, { invert: 190, dmm: 450 }), /two pipes out/);
  assert.equal(SD.designNet({ nodes: net.nodes, reaches: [] }, { invert: 190, dmm: 450 }).ok, false);
});

test('on a single line the network design equals design() even when a flatter way in allows a drop a steeper one can\'t (375 mm and more at bends)', () => {
  // the velocity head rule's least drop grows with the slope: keeping only the cheapest way into each
  // inlet invert lost the dearer, flatter one design() keeps
  const nodes = [[0, 200, 90], [56.28, 198.861, 90], [112.56, 197.721, 0], [168.84, 196.58, 45], [225.12, 195.437, 90], [281.4, 194.293, 45], [337.68, 193.147, 0], [393.96, 192.001, 90]].map(([x, g, bend]) => ({ x, g, bend }));
  const rt = { nodes, samples: [] }, conn = { invert: 187.934, dmm: 900 }, q = 159.2;
  const a = SD.design(rt, conn, q), b = SD.designNet(SD.lineNet(rt, q), conn);
  assert.ok(a.ok && b.ok, `${a.why} ${b.why}`);
  assert.equal(b.dmm, a.dmm);
  assert.ok(Math.abs(b.cost - a.cost) < 1e-6, `designNet ${b.cost} vs design ${a.cost}`);   // was 1,194.23 vs 1,166.66
  assert.deepEqual(b.mhs.map(m => m.inv_out), a.mhs.map(m => m.inv_out));
  // every drop keeps its own rule
  b.mhs.forEach((m, n) => { if (!n || n === b.root) return; const rin = b.reaches[n - 1], dr = SD.dropRange(rin.dmm, rin.v, nodes[n].bend); assert.ok(m.drop >= dr.min - 1e-6 && m.drop <= dr.max + 1e-6, `MH ${n + 1}: ${m.drop} in ${dr.min}–${dr.max}`); });
});

test('the audit\'s case: 734 m, 450 mm, bends of 30° and 60° (design() costs 2,960.83 there)', () => {
  // the generator the case came from (seed 7, the 22nd line)
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let rt, conn, q;
  for (let k = 0; k < 22; k++) {
    const L = 60 + rnd() * 700, sl = (rnd() - 0.6) * 0.03, amp = rnd() * 2, w = 30 + rnd() * 100, gf = x => 200 - sl * x + amp * Math.sin(x / w), sp = 80 + rnd() * 110;
    rt = { nodes: SD.placeMHs([0, L], sp).map(x => ({ x, g: gf(x), bend: Math.round(rnd() * 3) * 30 })), samples: Array.from({ length: Math.floor(L / 10) }, (_, i) => ({ x: i * 10 + 5, g: gf(i * 10 + 5) })) };
    const dmm = [300, 375, 450, 600, 900][Math.floor(rnd() * 5)];
    conn = { invert: gf(L) - 2.5 - rnd() * 5, dmm }; q = 1 + rnd() * 120;
  }
  const t = Date.now(), b = SD.designNet(SD.lineNet(rt, q), conn), ms = Date.now() - t;
  assert.ok(b.ok, b.why);
  assert.equal(b.dmm, 450);
  // design() on this line (about 4 s, so not run here): 2,960.83; designNet was 2,962.93
  assert.ok(Math.abs(b.cost - 2960.83) < 0.005, `${b.cost}`);
  assert.ok(ms < 3000, `${ms} ms`);
});
