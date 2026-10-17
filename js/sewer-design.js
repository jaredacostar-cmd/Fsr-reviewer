/* A preliminary gravity sanitary sewer, to Peel's rules (PeelSewerDesign). Pure: no DOM, no fetch
 * (tests/sewer-design.test.js). Used by the Labs Gravity check and Sewer designer.
 *
 * The rules are the Region of Peel Linear Wastewater Standards (published Nov 2022, R1.0 Mar 2023):
 *   - Manning's n 0.013; minimum pipe 200 mm (s. 3.2.1)
 *   - velocity ≥ 0.75 m/s at the design flow, ≤ 3.0 m/s flowing full (s. 3.1.1–3.1.2)
 *   - the last leg (the upstream end of the run) at 1.00% or more (s. 3.1.3)
 *   - design flow ≤ 0.7 of full-flow capacity (s. 3.1.4)
 *   - obvert ≥ 2.5 m below the road centreline in residential areas, 3.5 m in industrial /
 *     commercial (s. 3.4.1.1); trench ≤ 8.0 m (deeper needs a special design)
 *   - maintenance holes ≤ 200 m apart up to 525 mm, 190 m from 600 mm (Table 6-1)
 *   - drops through a maintenance hole 0.03–0.20 m for 200–300 mm; for larger pipes the velocity
 *     head rule (½ V²/2g at a 90° bend, ¼ at 45°); a drop structure from 0.9 m, none in between
 *     (s. 6.1.4); obverts matched where the size changes, never a larger pipe into a smaller one.
 * "Best" is the least excavation (the user's choice): the profile that keeps the pipe as shallow
 * as the rules allow, found by dynamic programming over the inverts at each maintenance hole.
 * A screening design, not a detailed design: Peel's W&WW Infrastructure Planning team must
 * validate or confirm all results.
 */
(function (root) {
  'use strict';
  const RULES = {
    n: 0.013, dMin: 200, vMin: 0.75, vMaxFull: 3.0, sLastLeg: 0.01, qRatioMax: 0.7,
    coverRes: 2.5, coverIci: 3.5, trenchMax: 8.0, bedding: 0.15,
    mhSpacing: d => (d >= 600 ? 190 : 200),
    dropSmall: [0.03, 0.20], dropStructure: 0.9,
  };
  const SIZES = [200, 250, 300, 375, 450, 525, 600, 675, 750, 825, 900, 975, 1050, 1200];
  const G = 9.81;
  const SOURCE = 'Region of Peel Linear Wastewater Standards (published Nov 2022, R1.0 Mar 2023), s. 3.1–3.4 and 6.1';

  // ---- Hydraulics (Manning, circular pipe) ---------------------------------------------------------
  const fullArea = D => Math.PI * D * D / 4;
  const qFull = (D, S, n = RULES.n) => fullArea(D) * Math.pow(D / 4, 2 / 3) * Math.sqrt(S) / n;   // m³/s
  const vFull = (D, S, n = RULES.n) => qFull(D, S, n) / fullArea(D);
  // Part-full flow at central angle θ (0 … 2π): area, flow, velocity, depth, Froude.
  function partAt(D, S, th, n = RULES.n) {
    const A = D * D / 8 * (th - Math.sin(th)), P = D * th / 2, R = P ? A / P : 0, T = D * Math.sin(th / 2);
    const Q = A * Math.pow(R, 2 / 3) * Math.sqrt(S) / n, V = A ? Q / A : 0, y = D / 2 * (1 - Math.cos(th / 2));
    return { A, Q, V, y, F: T > 0 && A > 0 ? V / Math.sqrt(G * A / T) : 0 };
  }
  // The part-full flow carrying Q (bisection on θ up to the angle of maximum flow, ≈ 0.94 D).
  function partFor(D, S, Q, n = RULES.n) {
    let lo = 1e-6, hi = 5.278;
    if (partAt(D, S, hi, n).Q < Q) return null;
    for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (partAt(D, S, m, n).Q < Q) lo = m; else hi = m; }
    return partAt(D, S, hi, n);
  }
  // The flattest slope meeting the flow ratio and the minimum velocity at Q (both rise with S).
  function minSlope(D, Q, r = RULES) {
    const ok = S => qFull(D, S, r.n) * r.qRatioMax >= Q && (partFor(D, S, Q, r.n) || { V: 0 }).V >= r.vMin;
    let lo = 1e-5, hi = 0.5;
    if (!ok(hi)) return null;
    for (let i = 0; i < 60; i++) { const m = Math.sqrt(lo * hi); if (ok(m)) hi = m; else lo = m; }
    return hi;
  }
  // The steepest slope with the full-flow velocity at 3.0 m/s.
  const maxSlope = (D, r = RULES) => Math.pow(r.vMaxFull * r.n / Math.pow(D / 4, 2 / 3), 2);
  // Drops allowed through a maintenance hole for this pipe (m), given its velocity and the bend.
  function dropRange(dmm, V, bendDeg = 0, r = RULES) {
    if (dmm <= 300) return { min: r.dropSmall[0], max: r.dropSmall[1] };
    const hv = V * V / (2 * G), k = Math.min(0.5, Math.max(0, bendDeg) / 180);
    const min = Math.max(r.dropSmall[0], k * hv);
    return { min, max: Math.max(min, r.dropSmall[1]) };
  }

  // ---- The design ----------------------------------------------------------------------------------
  // route: { nodes: [{ x (chainage m), g (ground m), bend (deg) }], samples: [{ x, g }] } upstream →
  // downstream; the last node is the connection. conn: { invert (m) of the existing pipe there,
  // dmm (its size) }. q: design flow (L/s). opts: { ici, step (m; 0.02, or 0.05 past 800 m),
  // avoidStructures }.
  // Returns { ok, dmm, reaches: [...], mhs: [...], cost, why } for the smallest size that works.
  function design(route, conn, q, opts = {}) {
    const r = { ...RULES, ...(opts.rules || {}) }, Q = q / 1000;
    const len = route.nodes.length ? route.nodes[route.nodes.length - 1].x - route.nodes[0].x : 0;
    const cover = opts.ici ? r.coverIci : r.coverRes, step = opts.step || (len > 800 ? 0.05 : 0.02);
    const reasons = [];
    for (const dmm of SIZES) {
      if (conn && conn.dmm && dmm > conn.dmm) { reasons.push(`${dmm} mm would be larger than the existing ${conn.dmm} mm sewer (a larger pipe may not flow into a smaller one)`); break; }
      const res = designSize(route, conn, Q, dmm, cover, step, r, opts.avoidStructures ? Infinity : 30);
      if (res.ok) return { ...res, q, cover, rules: r, source: SOURCE };
      reasons.push(res.why);
      if (res.stop) break;
    }
    // The reason to give: when sizes fall short of the existing obvert, the closest one (a steeper,
    // smaller pipe falls further); else the first size that failed for more than its capacity.
    const short = reasons.map(x => [x, +((/about ([\d.]+) m below/.exec(x) || [])[1])]).filter(([, m]) => m > 0).sort((a, b) => a[1] - b[1]);
    const why = (short[0] && short[0][0]) || reasons.find(x => !/can't carry/.test(x)) || reasons[0] || 'no size works';
    return { ok: false, q, cover, why, reasons, source: SOURCE };
  }
  function designSize(route, conn, Q, dmm, cover, step, r, pen) {
    const D = dmm / 1000, nodes = route.nodes, N = nodes.length;
    if (N < 2) return { ok: false, why: 'the route needs two points', stop: true };
    const sMin = minSlope(D, Q, r), sMax = maxSlope(D, r);
    if (sMin == null || sMin > sMax) return { ok: false, why: `${dmm} mm can't carry ${(Q * 1000).toFixed(1)} L/s within 3.0 m/s full and the 0.7 flow ratio` };
    for (let i = 1; i < N; i++) if (nodes[i].x - nodes[i - 1].x > r.mhSpacing(dmm) + 0.01) return { ok: false, why: `maintenance holes more than ${r.mhSpacing(dmm)} m apart`, stop: true };
    // The ground along each reach (the nodes and the samples between them).
    const along = i => [nodes[i], ...route.samples.filter(s => s.x > nodes[i].x && s.x < nodes[i + 1].x), nodes[i + 1]];
    // Inverts on a grid: each maintenance hole's outlet invert, between the deepest trench allowed
    // and the shallowest cover allowed there.
    const hi = i => nodes[i].g - cover - D, lo = i => nodes[i].g - r.trenchMax + r.bedding;
    const grid = i => { const out = []; for (let e = Math.floor(hi(i) / step) * step; e >= lo(i) - 1e-9; e -= step) out.push(+e.toFixed(3)); return out; };
    // A reach from invert a (out of node i) to invert b (into node i+1): within the slope range,
    // under the cover line and over the deepest trench at every ground sample.
    const reachOK = (i, a, b, sLo) => {
      const L = nodes[i + 1].x - nodes[i].x, S = (a - b) / L;
      if (S < sLo - 1e-9 || S > sMax + 1e-9) return null;
      let dig = 0; const pts = along(i);
      for (let k = 0; k < pts.length; k++) {
        const e = a - S * (pts[k].x - nodes[i].x);
        if (e + D > pts[k].g - cover + 1e-6) return null;
        if (pts[k].g - e + r.bedding > r.trenchMax + 1e-6) return null;
        if (k) { const dx = pts[k].x - pts[k - 1].x, d0 = pts[k - 1].g - (a - S * (pts[k - 1].x - nodes[i].x)), d1 = pts[k].g - e; dig += dx * (d0 + d1) / 2; }
      }
      return { S, dig, L };
    };
    const V = (S) => (partFor(D, S, Q, r.n) || { V: 0 }).V;
    // Dynamic programming, upstream → downstream. State: the outlet invert at node i.
    let layer = new Map(grid(0).map(e => [e, { cost: 0, path: [{ out: e }] }]));
    for (let i = 0; i < N - 1; i++) {
      const sLo = i === 0 ? Math.max(sMin, r.sLastLeg) : sMin, next = new Map(), L = nodes[i + 1].x - nodes[i].x, last = i + 1 === N - 1;
      for (const [a, st] of layer) {
        // Inverts in at the next node: from the flattest to the steepest slope.
        const bTop = a - sLo * L, bBot = a - sMax * L;
        for (let b = Math.floor(bTop / step) * step; b >= bBot - 1e-9; b -= step) {
          const rch = reachOK(i, a, +b.toFixed(3), sLo); if (!rch) continue;
          const bIn = +b.toFixed(3);
          if (last) {
            // The connection: the new obvert at or above the existing one (obverts matched), and an
            // allowed drop into it.
            if (!conn) { put(next, bIn, st, rch, bIn, 0, false, a, i, pen); continue; }
            const target = conn.invert + (conn.dmm / 1000) - D, d = bIn - target;
            if (d < -1e-6) continue;
            const dr = dropRange(dmm, V(rch.S), nodes[i + 1].bend || 0, r);
            const structure = d >= r.dropStructure;
            if (!structure && d > dr.max + 1e-6) continue;
            if (structure && pen === Infinity) continue;
            // (obverts matched exactly is a drop of the size difference: allowed)
            if (!structure && d < dr.min - 1e-6 && d > 1e-6) continue;
            put(next, target, st, rch, bIn, d, structure, a, i, pen);
            continue;
          }
          const dr = dropRange(dmm, V(rch.S), nodes[i + 1].bend || 0, r);
          // Through the maintenance hole: every grid invert within the allowed drop, or a drop
          // structure (0.9 m and more: three depths), unless the user asked to avoid them.
          for (let out = Math.floor((bIn - dr.min) / step + 1e-9) * step; out >= bIn - dr.max - 1e-9; out -= step) {
            const o = +out.toFixed(3); if (o > hi(i + 1) + 1e-6 || o < lo(i + 1) - 1e-6) continue;
            put(next, o, st, rch, bIn, bIn - o, false, a, i, pen);
          }
          if (pen < Infinity) for (const extra of [r.dropStructure, r.dropStructure + 0.5, r.dropStructure + 1.5]) {
            const o = +(Math.floor((bIn - extra) / step + 1e-9) * step).toFixed(3);
            if (o > hi(i + 1) + 1e-6 || o < lo(i + 1) - 1e-6) continue;
            put(next, o, st, rch, bIn, bIn - o, true, a, i, pen);
          }
        }
      }
      if (!next.size) return { ok: false, why: whyStuck(i, layer, nodes, conn, D, sLo, sMax, cover, r, last) };
      layer = next;
    }
    let best = null; for (const st of layer.values()) if (!best || st.cost < best.cost) best = st;
    const path = best.path;
    const mhs = nodes.map((nd, i) => ({ x: nd.x, g: nd.g, inv_in: i ? path[i].in : null, inv_out: i < N - 1 ? path[i].out : null, drop: path[i].drop || 0, structure: !!path[i].structure, depth: +(nd.g - Math.min(i ? path[i].in : Infinity, i < N - 1 ? path[i].out : Infinity)).toFixed(2) }));
    const reaches = [];
    for (let i = 0; i < N - 1; i++) {
      const a = path[i].out, b = path[i + 1].in, L = nodes[i + 1].x - nodes[i].x, S = (a - b) / L, pf = partFor(D, S, Q, r.n) || {};
      reaches.push({ from: i, to: i + 1, L: +L.toFixed(1), S, inv_up: a, inv_dn: b, qFull: qFull(D, S, r.n) * 1000, qRatio: Q / qFull(D, S, r.n), v: pf.V || 0, vFull: vFull(D, S, r.n), depthRatio: pf.y ? pf.y / D : 0, froude: pf.F || 0 });
    }
    return { ok: true, dmm, sMin, sMax, reaches, mhs, cost: best.cost, structures: mhs.filter(m => m.structure).length };
  }
  // Keep the cheapest path into each state. A drop structure costs as much as 30 m of 1 m extra depth
  // (a deeper pipe wins unless the structure saves more digging: s. 6.1.4.2), or is not allowed
  // at all when the user asks to avoid them (pen = Infinity).
  function put(next, out, st, rch, bIn, drop, structure, a, i, pen) {
    const cost = st.cost + rch.dig + (structure ? pen : 0);
    const prev = next.get(out); if (prev && prev.cost <= cost) return;
    const path = st.path.slice(); path[i] = { ...path[i], out: a };
    path[i + 1] = { in: bIn, out, drop: +drop.toFixed(3), structure };
    next.set(out, { cost, path });
  }
  function whyStuck(i, layer, nodes, conn, D, sLo, sMax, cover, r, last) {
    if (last && conn) {
      const target = conn.invert + conn.dmm / 1000 - D;
      const deepest = Math.min(...[...layer.keys()]) - sLo * (nodes[i + 1].x - nodes[i].x), highest = Math.max(...[...layer.keys()]);
      if (highest - sLo * (nodes[i + 1].x - nodes[i].x) < target) return `by gravity the new sewer reaches the connection about ${(target - (highest - sLo * (nodes[i + 1].x - nodes[i].x))).toFixed(2)} m below the existing obvert: it needs pumping, a deeper outlet or another route`;
      if (deepest > target + r.dropSmall[1]) return 'the drop into the existing sewer falls between 0.2 m and 0.9 m, which the standard does not allow, and no steeper slope or drop structure fits';
    }
    return `no slope between ${(sLo * 100).toFixed(2)}% and ${(sMax * 100).toFixed(1)}% keeps ${cover} m of cover and an 8 m trench from point ${i + 1} to ${i + 2}`;
  }

  // ---- A network: branches joining at maintenance holes, a size for each reach ----------------------
  // net: { nodes: [{ g (ground m), bend (deg) }], reaches: [{ from, to, L (m), pts: [{ d (m from the
  // upstream node), g }] (the ground between), q (L/s: the design flow in that reach), bend (deg, into
  // the next maintenance hole; else the node's) }] }, a tree:
  // every node has at most one reach out, and one node (the connection) has none. conn and opts as
  // design(). Each reach gets the smallest size that carries its flow (200 mm at the least), never
  // smaller than a reach flowing into it; when no profile fits, every reach goes up a size together
  // (as design() goes up a size), until one fits or the pipe would be larger than the existing sewer.
  // At a junction each pipe in keeps its own drop rule; where the size grows the obverts are matched
  // (a drop of the size difference). On a single line with one flow this is design(), reach for
  // reach.
  function designNet(net, conn, opts = {}) {
    const r = { ...RULES, ...(opts.rules || {}) }, nodes = net.nodes, R = net.reaches, N = nodes.length;
    const cover = opts.ici ? r.coverIci : r.coverRes, pen = opts.avoidStructures ? Infinity : 30;
    const outOf = nodes.map(() => -1), into = nodes.map(() => []);
    R.forEach((rc, i) => { if (outOf[rc.from] >= 0) throw new Error('a maintenance hole with two pipes out'); outOf[rc.from] = i; into[rc.to].push(i); });
    const roots = nodes.map((_, i) => i).filter(i => outOf[i] < 0);
    if (R.length < 1 || roots.length !== 1) return { ok: false, why: 'the network needs one connection', reasons: [], source: SOURCE };
    const root = roots[0];
    // Leaves first: a reach once every reach into its upstream node is done.
    const order = [], seen = new Set(), ready = i => into[R[i].from].every(j => seen.has(j));
    while (order.length < R.length) {
      const nx = R.findIndex((_, i) => !seen.has(i) && ready(i)); if (nx < 0) return { ok: false, why: 'the network has a loop', reasons: [], source: SOURCE };
      order.push(nx); seen.add(nx);
    }
    const total = R.reduce((t, rc) => t + rc.L, 0), step = opts.step || (total > 800 ? 0.05 : 0.02);
    // The smallest size for each reach's flow, then never smaller than a reach upstream of it.
    const IDX = SIZES.map((d, k) => k).filter(k => SIZES[k] >= r.dMin);
    const hmin = R.map(rc => { const k = IDX.find(k => { const D = SIZES[k] / 1000, sMin = minSlope(D, rc.q / 1000, r); return sMin != null && sMin <= maxSlope(D, r); }); return k == null ? null : k; });
    if (hmin.some(k => k == null)) { const i = hmin.findIndex(k => k == null); return { ok: false, why: `${R[i].q.toFixed(1)} L/s is more than the largest pipe carries within 3.0 m/s full and the 0.7 flow ratio`, reasons: [], source: SOURCE }; }
    const reasons = [];
    for (let k = 0; k < SIZES.length; k++) {
      const idx = R.map((_, i) => Math.min(SIZES.length - 1, hmin[i] + k));
      for (const i of order) for (const j of into[R[i].from]) idx[i] = Math.max(idx[i], idx[j]);
      const dmm = idx.map(x => SIZES[x]);
      const big = into[root].find(i => conn && conn.dmm && dmm[i] > conn.dmm);
      if (big != null) { reasons.push(`${dmm[big]} mm would be larger than the existing ${conn.dmm} mm sewer (a larger pipe may not flow into a smaller one)`); break; }
      const res = netSizes(net, conn, dmm, order, outOf, into, root, cover, step, r, pen);
      if (res.ok) return { ...res, cover, rules: r, source: SOURCE };
      reasons.push(res.why);
      if (res.stop || k > 0 && idx.every(x => x === SIZES.length - 1)) break;
    }
    const short = reasons.map(x => [x, +((/about ([\d.]+) m below/.exec(x) || [])[1])]).filter(([, m]) => m > 0).sort((a, b) => a[1] - b[1]);
    const why = (short[0] && short[0][0]) || reasons.find(x => !/can't carry/.test(x)) || reasons[0] || 'no size works';
    return { ok: false, cover, why, reasons, source: SOURCE };
  }
  // One set of sizes: dynamic programming from the leaves to the connection over each maintenance
  // hole's outlet invert (on a lattice of `step`).
  function netSizes(net, conn, dmm, order, outOf, into, root, cover, step, r, pen) {
    const nodes = net.nodes, R = net.reaches, E = k => +(k * step).toFixed(3);
    for (let i = 0; i < R.length; i++) if (R[i].L > r.mhSpacing(dmm[i]) + 0.01) return { ok: false, why: `maintenance holes more than ${r.mhSpacing(dmm[i])} m apart`, stop: true };
    const D = dmm.map(x => x / 1000), sMin = R.map((rc, i) => minSlope(D[i], rc.q / 1000, r)), sMax = D.map(d => maxSlope(d, r));
    for (let i = 0; i < R.length; i++) if (sMin[i] == null || sMin[i] > sMax[i]) return { ok: false, why: `${dmm[i]} mm can't carry ${R[i].q.toFixed(1)} L/s within 3.0 m/s full and the 0.7 flow ratio` };
    // Each maintenance hole's outlet range: the shallowest cover over the pipe out, the deepest trench.
    const hiK = (n, d) => Math.floor((nodes[n].g - cover - d) / step + 1e-9), loK = n => Math.ceil((nodes[n].g - r.trenchMax + r.bedding) / step - 1e-9);
    const V = (i, S) => (partFor(D[i], S, R[i].q / 1000, r.n) || { V: 0 }).V;
    // A reach's ground points, and their trapezoid integral: the digging from invert a at slope S is
    // ∫(g − e) = Gint − a·L + S·L²/2, and the cover and the trench at each point bound S, so a reach
    // is checked in one pass for each invert out of its upstream maintenance hole.
    const PTS = R.map(rc => [{ d: 0, g: nodes[rc.from].g }, ...rc.pts.filter(p => p.d > 0 && p.d < rc.L), { d: rc.L, g: nodes[rc.to].g }]);
    const GINT = PTS.map(P => P.reduce((t, p, k) => (k ? t + (p.d - P[k - 1].d) * (p.g + P[k - 1].g) / 2 : 0), 0));
    const slopeBounds = (i, a) => {
      let lo = -Infinity, hi = Infinity;
      for (const p of PTS[i]) {
        if (p.d <= 0) { if (a + D[i] > p.g - cover + 1e-6 || p.g - a + r.bedding > r.trenchMax + 1e-6) return null; continue; }
        lo = Math.max(lo, (a - (p.g - cover - D[i]) - 1e-6) / p.d);
        hi = Math.min(hi, (a - (p.g - r.trenchMax + r.bedding) + 1e-6) / p.d);
      }
      return [lo, hi];
    };
    const outState = nodes.map(() => null);   // node → Map(k → { cost, ins: [{ reach, b, drop, structure }] })
    const inBest = R.map(() => null);          // reach → Map(bK → { cost, a, S })
    const leafOf = n => !into[n].length;
    const doReach = i => {
      const rc = R[i], u = rc.from, first = leafOf(u), sLo = first ? Math.max(sMin[i], r.sLastLeg) : sMin[i];
      if (!outState[u]) { const m = new Map(); for (let k = hiK(u, D[i]); k >= loK(u); k--) m.set(k, { cost: 0, ins: [] }); outState[u] = m; }
      const out = new Map(), bHi = hiK(rc.to, D[i]), bLo = loK(rc.to);
      for (const [ak, st] of outState[u]) {
        const a = E(ak), sb = slopeBounds(i, a); if (!sb) continue;
        const s0 = Math.max(sLo - 1e-9, sb[0]), s1 = Math.min(sMax[i] + 1e-9, sb[1]); if (s0 > s1) continue;
        const top = Math.min(bHi, Math.floor((a - s0 * rc.L) / step + 1e-9)), bot = Math.max(bLo, Math.ceil((a - s1 * rc.L) / step - 1e-9));
        for (let bk = top; bk >= bot; bk--) {
          const S = (a - E(bk)) / rc.L; if (S < s0 - 1e-12 || S > s1 + 1e-12) continue;
          const c = st.cost + GINT[i] - a * rc.L + S * rc.L * rc.L / 2, prev = out.get(bk);
          if (!prev || c < prev.cost) out.set(bk, { cost: c, a: ak, S });
        }
      }
      inBest[i] = out;
      return out.size > 0;
    };
    // The cheapest way for reach i into an outlet invert ok at its downstream node (pipe out size dOut,
    // or the existing sewer at the connection).
    const bestInto = (i, ok, dOut, atConn) => {
      const m = inBest[i], bend = R[i].bend != null ? R[i].bend : nodes[R[i].to].bend || 0; let best = null;
      const drOf = st => st.dr || (st.dr = dropRange(dmm[i], V(i, st.S), bend, r));
      const consider = (bk, drop, structure) => { const st = m.get(bk); if (!st) return; const c = st.cost + (structure ? pen : 0); if (!best || c < best.cost) best = { cost: c, b: bk, drop, structure }; };
      if (atConn) {
        // The connection: the new obvert at or above the existing one, and an allowed drop into it.
        const target = conn.invert + conn.dmm / 1000 - D[i];
        for (const [bk, st] of m) {
          const b = E(bk), d = b - target; if (d < -1e-6) continue;
          const dr = drOf(st), structure = d >= r.dropStructure;
          if (!structure && d > dr.max + 1e-6) continue;
          if (structure && pen === Infinity) continue;
          if (!structure && d < dr.min - 1e-6 && d > 1e-6) continue;
          consider(bk, d, structure);
        }
        return best;
      }
      // Through a maintenance hole: the lattice outlets within the allowed drop (as design() takes
      // them), or a drop structure at 0.9, 1.4 or 2.4 m; only the pipes-in that can reach outlet ok.
      const o = E(ok), grow = Math.max(0, dOut - D[i]), wide = Math.max(r.dropSmall[1], 0.5 * r.vMaxFull * r.vMaxFull / (2 * G), grow) + step;
      for (let bk = ok + 1; bk <= Math.ceil((o + wide) / step); bk++) {
        const st = m.get(bk); if (!st) continue;
        const b = E(bk), dr = drOf(st), lo = Math.max(dr.min, grow), hi = Math.max(dr.max, grow);
        if (ok <= Math.floor((b - lo) / step + 1e-9) && ok >= Math.ceil((b - hi) / step - 1e-9)) consider(bk, b - o, false);
      }
      if (pen < Infinity) for (const extra of [r.dropStructure, r.dropStructure + 0.5, r.dropStructure + 1.5]) {
        for (let bk = Math.floor((o + extra) / step) - 1; bk <= Math.ceil((o + extra + step) / step) + 1; bk++) { if (!m.has(bk)) continue; const b = E(bk); if (Math.floor((b - extra) / step + 1e-9) === ok) consider(bk, b - o, true); }
      }
      return best;
    };
    // Leaves to the connection.
    for (const i of order) {
      const u = R[i].from;
      if (!leafOf(u) && !outState[u]) {
        // Combine every reach into u for each outlet invert.
        const m = new Map();
        for (let k = hiK(u, D[i]); k >= loK(u); k--) {
          let cost = 0; const ins = [];
          for (const j of into[u]) { const b = bestInto(j, k, D[i], false); if (!b) { cost = Infinity; break; } cost += b.cost; ins.push({ reach: j, ...b }); }
          if (cost < Infinity) m.set(k, { cost, ins });
        }
        if (!m.size) return { ok: false, why: `no outlet at maintenance hole ${u + 1} takes every pipe in within the drop rules` };
        outState[u] = m;
      }
      if (!doReach(i)) {
        const last = R[i].to === root;
        return { ok: false, why: whyNet(i, outState[u], net, conn, D[i], leafOf(u) ? Math.max(sMin[i], r.sLastLeg) : sMin[i], sMax[i], cover, r, last, step) };
      }
    }
    // The connection.
    let rootCost = 0; const rootIns = [];
    for (const j of into[root]) { const b = bestInto(j, null, 0, true); if (!b) { const i = j; return { ok: false, why: whyNet(i, outState[R[i].from], net, conn, D[i], leafOf(R[i].from) ? Math.max(sMin[i], r.sLastLeg) : sMin[i], sMax[i], cover, r, true, step) }; } rootCost += b.cost; rootIns.push({ reach: j, ...b }); }
    // Back from the connection: each reach's inverts, each maintenance hole's outlet.
    const outK = nodes.map(() => null), insOf = nodes.map(() => []), inv = R.map(() => ({}));
    insOf[root] = rootIns;
    const walk = n => { for (const x of insOf[n]) { const st = inBest[x.reach].get(x.b), u = R[x.reach].from; inv[x.reach] = { up: E(st.a), dn: E(x.b), S: st.S }; outK[u] = st.a; insOf[u] = outState[u].get(st.a).ins; walk(u); } };
    walk(root);
    const mhs = nodes.map((nd, n) => {
      const ins = insOf[n].map(x => ({ reach: x.reach, inv: E(x.b), drop: +x.drop.toFixed(3), structure: !!x.structure }));
      const io = outK[n] == null ? null : E(outK[n]), lowIn = ins.length ? Math.min(...ins.map(x => x.inv)) : null;
      return { g: nd.g, inv_in: lowIn, inv_out: io, ins, drop: ins.length ? Math.max(...ins.map(x => x.drop)) : 0, structure: ins.some(x => x.structure), depth: +(nd.g - Math.min(lowIn == null ? Infinity : lowIn, io == null ? Infinity : io)).toFixed(2) };
    });
    const reaches = R.map((rc, i) => {
      const { up: a, dn: b, S } = inv[i], Q = rc.q / 1000, pf = partFor(D[i], S, Q, r.n) || {};
      return { from: rc.from, to: rc.to, L: +rc.L.toFixed(1), S, dmm: dmm[i], q: rc.q, inv_up: a, inv_dn: b, qFull: qFull(D[i], S, r.n) * 1000, qRatio: Q / qFull(D[i], S, r.n), v: pf.V || 0, vFull: vFull(D[i], S, r.n), depthRatio: pf.y ? pf.y / D[i] : 0, froude: pf.F || 0, sMin: sMin[i], sMax: sMax[i] };
    });
    const cost = rootCost;
    return { ok: true, dmm: Math.max(...dmm), dmms: dmm, reaches, mhs, cost, structures: mhs.reduce((t, m) => t + m.ins.filter(x => x.structure).length, 0), root };
  }
  function whyNet(i, state, net, conn, D, sLo, sMax, cover, r, last, step) {
    const rc = net.reaches[i], keys = state ? [...state.keys()].map(k => k * step) : [];
    if (last && conn && keys.length) {
      const target = conn.invert + conn.dmm / 1000 - D, highest = Math.max(...keys) - sLo * rc.L, deepest = Math.min(...keys) - sLo * rc.L;
      if (highest < target) return `by gravity the new sewer reaches the connection about ${(target - highest).toFixed(2)} m below the existing obvert: it needs pumping, a deeper outlet or another route`;
      if (deepest > target + r.dropSmall[1]) return 'the drop into the existing sewer falls between 0.2 m and 0.9 m, which the standard does not allow, and no steeper slope or drop structure fits';
    }
    return `no slope between ${(sLo * 100).toFixed(2)}% and ${(sMax * 100).toFixed(1)}% keeps ${cover} m of cover and an 8 m trench from maintenance hole ${rc.from + 1} to ${rc.to + 1}`;
  }
  // A single drawn line as a network: route { nodes, samples } (design()'s), one flow throughout.
  function lineNet(route, q) {
    const n = route.nodes;
    return { nodes: n.map(({ g, bend }) => ({ g, bend: bend || 0 })), reaches: n.slice(1).map((b, k) => ({ from: k, to: k + 1, L: b.x - n[k].x, q, pts: route.samples.filter(s => s.x > n[k].x && s.x < b.x).map(s => ({ d: s.x - n[k].x, g: s.g })) })) };
  }

  // ---- Helpers for the tools -----------------------------------------------------------------------
  // Maintenance holes along a drawn line: at each vertex (a change of direction) and between them so
  // none is more than the spacing apart. pts: [{ x }] chainages of the vertices.
  function placeMHs(vertexX, spacing) {
    const out = [vertexX[0]];
    for (let i = 1; i < vertexX.length; i++) {
      const a = vertexX[i - 1], b = vertexX[i], n = Math.ceil((b - a) / spacing - 1e-9);
      for (let k = 1; k <= n; k++) out.push(+(a + (b - a) * k / n).toFixed(2));
    }
    return out;
  }
  // The design flow (L/s) from what the user types: population, jobs, area (ha), or a flow, at Peel
  // criteria (290 L/cap/d and 270 L/job/d with Harmon peaking held to 2–4, I&I 0.26 L/s/ha).
  function flowFrom({ pop = 0, jobs = 0, ha = 0, q = null } = {}, c = { res: 290, emp: 270, ii: 0.26, pMin: 2, pMax: 4 }) {
    if (q != null && q !== '' && isFinite(+q) && +q > 0) return { q: +q, typed: true };
    const harmon = P => Math.min(c.pMax, Math.max(c.pMin, 1 + 14 / (4 + Math.sqrt(P / 1000))));
    const res = pop * c.res / 86400, emp = jobs * c.emp / 86400;
    const peak = res * (pop ? harmon(pop) : 0) + emp * (jobs ? harmon(jobs) : 0), ii = ha * c.ii;
    return { q: peak + ii, avg: res + emp, peak, ii, typed: false };
  }

  const api = { RULES, SIZES, SOURCE, qFull, vFull, partAt, partFor, minSlope, maxSlope, dropRange, design, designNet, lineNet, placeMHs, flowFrom };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSewerDesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
