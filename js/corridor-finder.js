/* Labs: the corridor finder (PeelCorridorFinder), the Sewer designer's "Find a route". Between the start
 * and an end near the sewer, the way along the roads (js/road-net.js) that keeps out of the
 * constraint layers where it can, keeps the sewer from climbing, and crosses a watercourse only
 * where it must, at the shortest crossing. The cost of a road is its length, plus, for every metre
 * inside a constraint area, that many metres more (its weight), plus a set length for each
 * watercourse crossed, plus a set length for each metre the ground rises in the direction of flow
 * (a gravity sewer digs deeper there). The weights are the tool's, not Peel's: shown and adjustable.
 *
 * Pure: edgeInfo(), costOf(), summary(), WEIGHTS (tests/corridor-finder.test.js). Browser: find().
 */
(function (root) {
  'use strict';
  // The tool's weights (not Peel's): extra metres per metre inside, per crossing, per metre of rise.
  const WEIGHTS = { flood: 4, natural: 4, reg: 1, nhs: 1, plan: 1, water: 200, up: 50 };
  const KINDS = {
    flood: { label: 'floodplain', ids: ['flood-cvc', 'flood-trca'] },
    natural: { label: 'provincially significant wetland or ANSI', ids: ['psw', 'ansi'] },
    reg: { label: 'conservation authority regulation limit', ids: ['reg-cvc', 'reg-trca'] },
    nhs: { label: 'Natural Heritage System', ids: ['nhs'] },
    plan: { label: 'Greenbelt, Oak Ridges Moraine or Niagara Escarpment plan area', ids: ['greenbelt', 'orm', 'nep'] },
  };
  const WATER_IDS = ['wc-peel', 'wc-ohn'];
  const STEP = 25;   // the constraint areas are sampled every 25 m along a road (their screening grid)

  const segX = (p, q, r, s) => {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-12) return false;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1;
  };
  /** What each road edge runs through: { in: { kind: metres inside }, water: [names of the
   * watercourses crossed], rise: ground at b minus ground at a }. inside(kind, [x, y]) → bool;
   * waters: [{ name, segs: [[p, q]…] }] (local metres); gOf(junction id) → ground (m) or null. */
  function edgeInfo(G, inside, waters, gOf) {
    return G.edges.map(ed => {
      const inn = {}; for (const k of Object.keys(KINDS)) inn[k] = 0;
      for (let k = 1; k < ed.pts.length; k++) {
        const a = ed.pts[k - 1], b = ed.pts[k], l = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(l / STEP));
        for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, p = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; for (const kk of Object.keys(KINDS)) if (inside(kk, p)) inn[kk] += l / n; }
      }
      const water = [];
      for (const w of waters) if (w.segs.some(([p, q]) => ed.pts.some((_, k) => k && segX(ed.pts[k - 1], ed.pts[k], p, q)))) water.push(w.name || 'a watercourse');
      const ga = gOf(ed.a), gb = gOf(ed.b);
      return { in: inn, water, rise: ga != null && gb != null ? gb - ga : 0 };
    });
  }
  /** The cost of running an edge (forward: a → b), with the weights. */
  function costOf(ed, info, forward, W = WEIGHTS) {
    let c = ed.L;
    for (const k of Object.keys(KINDS)) c += (W[k] || 0) * info.in[k];
    c += (W.water || 0) * info.water.length;
    const up = forward ? info.rise : -info.rise;
    if (up > 0) c += (W.up || 0) * up;
    return c;
  }
  /** What a route passes through: metres in each kind of area, the watercourses it crosses (each a
   * permit and a 2.0 m clearance under the bed, s. 3.4.2.2), the metres of rise in the flow direction. */
  function summary(G, infos, edges) {
    const inn = {}; for (const k of Object.keys(KINDS)) inn[k] = 0;
    const water = []; let up = 0, L = 0;
    for (const { e, forward, frac } of edges) {
      const ed = G.edges[e], I = infos[e]; L += ed.L * frac;
      for (const k of Object.keys(KINDS)) inn[k] += I.in[k] * frac;
      if (frac > 0.5 || frac === 1) water.push(...I.water);
      const r = (forward ? I.rise : -I.rise) * frac; if (r > 0) up += r;
    }
    return { L, in: inn, water, up };
  }

  const api = { WEIGHTS, KINDS, WATER_IDS, STEP, edgeInfo, costOf, summary };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---- Browser ---------------------------------------------------------------------------------
  const RN = () => root.PeelRoadNet, CX = () => root.PeelCxData, CG = () => root.PeelConstraintGeo, EL = () => root.PeelElevation;
  /** The corridor from a to b ({lat, lng}) with weights W: { pts (lat/lng, straight runs), L, sum,
   * plain (the shortest road way's summary), straight (m) }, or null. */
  async function find(a, b, W = WEIGHTS) {
    const { P, segs } = await RN().roadsAround([a, b], 400);
    if (!segs.length) return null;
    const G = RN().graph(segs);
    // The constraint layers around the corridor, by kind; the watercourses as local segments.
    const o = P.from([0, 0]), r = Math.max(...[a, b].map(p => Math.hypot(...P.to(p.lng, p.lat)))) + 500;
    const byKind = {}, waters = [];
    let missing = 0;
    for (const [k, def] of Object.entries(KINDS)) {
      byKind[k] = [];
      for (const id of def.ids) { try { for (const f of await CX().featuresNear(id, o.lng, o.lat, r)) if (f.polys) byKind[k].push(...f.polys.map(rings => ({ rings, box: boxOf(rings) }))); } catch (e) { missing++; } }
    }
    for (const id of WATER_IDS) {
      try { for (const f of await CX().featuresNear(id, o.lng, o.lat, r)) for (const ln of f.lines || []) { const q = ln.map(([x, y]) => P.to(x, y)); waters.push({ name: (f.label && f.label[0]) || '', segs: q.slice(1).map((p, i) => [q[i], p]) }); } } catch (e) { missing++; }
    }
    const inside = (k, p) => { const ll = P.from(p), pt = [ll.lng, ll.lat]; return byKind[k].some(x => pt[0] >= x.box[0] && pt[0] <= x.box[2] && pt[1] >= x.box[1] && pt[1] <= x.box[3] && CG().pointInRings(pt, x.rings)); };
    // The ground at every junction (lidar, else the terrain tiles).
    const ids = [...G.nodes.keys()], gs = await EL().getGroundMany(ids.map(id => P.from(G.nodes.get(id).p)));
    const gMap = new Map(ids.map((id, i) => [id, gs[i] && gs[i].z != null ? gs[i].z : null]));
    const infos = edgeInfo(G, inside, waters, id => gMap.get(id));
    const A = P.to(a.lng, a.lat), B = P.to(b.lng, b.lat);
    const EI = new Map(G.edges.map((ed, i) => [ed, i]));
    const best = RN().route(G, A, B, (ed, fwd) => costOf(ed, infos[EI.get(ed)], fwd, W) / (ed.L || 1));
    if (!best) return null;
    const plain = RN().route(G, A, B);
    return {
      pts: RN().simplify(best.pts).map(P.from), L: best.L, off: best.off, sum: summary(G, infos, best.edges),
      plain: plain ? { L: plain.L, sum: summary(G, infos, plain.edges) } : null, straight: Math.hypot(B[0] - A[0], B[1] - A[1]), missing,
    };
  }
  const boxOf = rings => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const r of rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  root.PeelCorridorFinder = { ...api, find };
})(typeof window !== 'undefined' ? window : globalThis);
