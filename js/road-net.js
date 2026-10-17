/* Road centrelines for routing (PeelRoadNet): the Ontario Road Network (Land Information Ontario,
 * "ORN Road Net Element", LIO_Open09/MapServer/0; probed in data/probe/roads.json), read live around
 * a pair of points, as a graph of its junctions; the shortest way along the roads between two taps,
 * and the line simplified into the straight runs a sewer takes between maintenance holes.
 *
 * Pure: graph(), snap(), route(), simplify() (tests/road-net.test.js). Browser: roadsAround(),
 * routeBetween().
 */
(function (root) {
  'use strict';
  const ORN_URL = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open09/MapServer/0';
  const SOURCE = 'Ontario Road Network (Land Information Ontario, Open Government Licence – Ontario)';
  // The tool's tolerance (not Peel's): the straight runs stay within 3 m of the road centreline.
  const TOL = 3;

  // Local metres about an origin, and back.
  const K = 6371008.8 * Math.PI / 180;
  const proj = o => { const kx = K * Math.cos(o.lat * Math.PI / 180); return { to: (lng, lat) => [(lng - o.lng) * kx, (lat - o.lat) * K], from: ([x, y]) => ({ lat: o.lat + y / K, lng: o.lng + x / kx }) }; };
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const len = pts => pts.reduce((t, p, i) => (i ? t + dist(pts[i - 1], p) : 0), 0);

  /** The road graph from segments [{ from, to (junction ids), pts: [[x, y]…] (m) }]: junctions with
   * their position, edges both ways (the sewer runs either way along a road). */
  function graph(segs) {
    const nodes = new Map(), edges = [];
    const node = (id, p) => { if (!nodes.has(id)) nodes.set(id, { id, p, out: [] }); return nodes.get(id); };
    segs.forEach((s, i) => {
      if (!s.pts || s.pts.length < 2) return;
      const a = node(s.from, s.pts[0]), b = node(s.to, s.pts[s.pts.length - 1]), L = len(s.pts);
      edges.push({ i, a: a.id, b: b.id, pts: s.pts, L });
      a.out.push({ e: edges.length - 1, to: b.id, L }); b.out.push({ e: edges.length - 1, to: a.id, L });
    });
    return { nodes, edges };
  }
  /** The nearest point on any road to p: { e (edge), k (segment), t, at, m (m off the road), along }. */
  function snap(G, p) {
    let best = null;
    G.edges.forEach((ed, e) => {
      let along = 0;
      for (let k = 1; k < ed.pts.length; k++) {
        const a = ed.pts[k - 1], b = ed.pts[k], dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy || 1;
        const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)), at = [a[0] + dx * t, a[1] + dy * t], m = dist(p, at);
        if (!best || m < best.m) best = { e, k, t, at, m, along: along + Math.sqrt(l2) * t };
        along += Math.sqrt(l2);
      }
    });
    return best;
  }
  // The part of an edge's line between two distances along it (either way round).
  function cut(pts, d0, d1) {
    const rev = d1 < d0, lo = Math.min(d0, d1), hi = Math.max(d0, d1), out = [];
    let acc = 0;
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k], l = dist(a, b), s0 = acc, s1 = acc + l;
      const at = d => { const t = l ? (d - s0) / l : 0; return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; };
      if (s1 >= lo && s0 <= hi) { if (!out.length) out.push(at(Math.max(lo, s0))); out.push(at(Math.min(hi, s1))); }
      acc = s1;
    }
    return rev ? out.reverse() : out;
  }
  /** The shortest way along the roads from point a to point b (both snapped onto the nearest road):
   * { pts: [[x, y]…], L, off: [m off the road at a, at b], edges: [{ e, forward, frac }] }, or null
   * when they don't connect. weight(edge, forward) (optional) scales an edge's length, by the
   * direction it is run in (the corridor finder's costs: forward is a → b as the edge is stored). */
  function route(G, a, b, weight) {
    const sa = snap(G, a), sb = snap(G, b); if (!sa || !sb) return null;
    const W = (e, fwd) => (weight ? weight(G.edges[e], fwd) : 1);
    // Both on one road: the part of it between them, unless the way round by other roads costs less
    // (with weights, a dear stretch between them; Dijkstra below starts from that cost).
    let direct = null;
    if (sa.e === sb.e) {
      const pts = cut(G.edges[sa.e].pts, sa.along, sb.along), L0 = G.edges[sa.e].L || 1, fwd = sb.along >= sa.along;
      direct = { pts, L: len(pts), off: [sa.m, sb.m], edges: [{ e: sa.e, forward: fwd, frac: Math.abs(sb.along - sa.along) / L0 }], cost: Math.abs(sb.along - sa.along) * W(sa.e, fwd) };
    }
    // Dijkstra from a's two ends of its edge to b's two ends.
    const ea = G.edges[sa.e], eb = G.edges[sb.e], dist0 = new Map(), prev = new Map(), done = new Set();
    const start = [[ea.a, sa.along * W(sa.e, false)], [ea.b, (ea.L - sa.along) * W(sa.e, true)]];
    for (const [id, c] of start) if (!dist0.has(id) || c < dist0.get(id)) { dist0.set(id, c); prev.set(id, { from: 'A' }); }
    const goal = new Map([[eb.a, sb.along * W(sb.e, true)], [eb.b, (eb.L - sb.along) * W(sb.e, false)]]);
    let best = direct ? { c: direct.cost, direct: true } : null;
    while (true) {
      let u = null, du = Infinity;
      for (const [id, c] of dist0) if (!done.has(id) && c < du) { u = id; du = c; }
      if (u == null || (best && du >= best.c)) break;
      done.add(u);
      if (goal.has(u) && (!best || du + goal.get(u) < best.c)) best = { c: du + goal.get(u), end: u };
      for (const o of G.nodes.get(u).out) {
        const c = du + o.L * W(o.e, G.edges[o.e].a === u);
        if (!dist0.has(o.to) || c < dist0.get(o.to) - 1e-9) { dist0.set(o.to, c); prev.set(o.to, { from: u, e: o.e }); }
      }
    }
    if (!best) return null;
    if (best.direct) return direct;
    // Back from b's end to a's: the edges in between, then the partial edges at each end.
    const chain = []; let n = best.end;
    while (prev.get(n).from !== 'A') { const pv = prev.get(n); chain.unshift({ e: pv.e, from: pv.from, to: n }); n = pv.from; }
    const first = n, pts = [], edges = [];
    const add = seg => { for (const p of seg) if (!pts.length || dist(pts[pts.length - 1], p) > 1e-6) pts.push(p); };
    add(cut(ea.pts, sa.along, first === ea.a ? 0 : ea.L)); edges.push({ e: sa.e, forward: first !== ea.a, frac: (first === ea.a ? sa.along : ea.L - sa.along) / (ea.L || 1) });
    for (const c of chain) { const ed = G.edges[c.e], fwd = c.from === ed.a; add(fwd ? ed.pts : ed.pts.slice().reverse()); edges.push({ e: c.e, forward: fwd, frac: 1 }); }
    add(cut(eb.pts, best.end === eb.a ? 0 : eb.L, sb.along)); edges.push({ e: sb.e, forward: best.end === eb.a, frac: (best.end === eb.a ? sb.along : eb.L - sb.along) / (eb.L || 1) });
    return { pts, L: len(pts), off: [sa.m, sb.m], edges: edges.filter(x => x.frac > 1e-9), cost: best.c };
  }
  /** Douglas-Peucker: the fewest straight runs within tol of the line (the runs between
   * maintenance holes, on a curved road). */
  function simplify(pts, tol = TOL) {
    if (pts.length < 3) return pts.slice();
    const off = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy); return l ? Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / l : dist(p, a); };
    let k = -1, m = 0;
    for (let i = 1; i < pts.length - 1; i++) { const d = off(pts[i], pts[0], pts[pts.length - 1]); if (d > m) { m = d; k = i; } }
    if (m <= tol) return [pts[0], pts[pts.length - 1]];
    return [...simplify(pts.slice(0, k + 1), tol).slice(0, -1), ...simplify(pts.slice(k), tol)];
  }

  const api = { ORN_URL, SOURCE, TOL, proj, graph, snap, route, simplify, len };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---- Browser: the roads around two points, live from LIO (cached by 0.01° tile) ------------------
  const cache = new Map();
  async function tile(tx, ty) {
    const key = `${tx},${ty}`; if (cache.has(key)) return cache.get(key);
    const A = root.PeelArcGIS;
    const pr = (async () => {
      const info = await A.layerInfo(ORN_URL);
      const { features } = await A.queryAll(ORN_URL, info, { bbox: { xmin: tx * 0.01, ymin: ty * 0.01, xmax: (tx + 1) * 0.01, ymax: (ty + 1) * 0.01 }, max: 8000, outFields: 'OGF_ID,FROM_JUNCTION_ID,TO_JUNCTION_ID,ROAD_ELEMENT_TYPE' });
      return (features || []).filter(f => f.geometry && !/FERRY|VIRTUAL/i.test((f.properties || {}).ROAD_ELEMENT_TYPE || ''));
    })();
    cache.set(key, pr); pr.catch(() => cache.delete(key));
    return pr;
  }
  /** The road segments around a set of points (and pad metres beyond), in local metres. */
  async function roadsAround(lls, pad = 300) {
    const o = { lat: lls.reduce((t, p) => t + p.lat, 0) / lls.length, lng: lls.reduce((t, p) => t + p.lng, 0) / lls.length }, P = proj(o);
    const dLat = pad / K, dLng = pad / (K * Math.cos(o.lat * Math.PI / 180));
    const x0 = Math.floor((Math.min(...lls.map(p => p.lng)) - dLng) / 0.01), x1 = Math.floor((Math.max(...lls.map(p => p.lng)) + dLng) / 0.01);
    const y0 = Math.floor((Math.min(...lls.map(p => p.lat)) - dLat) / 0.01), y1 = Math.floor((Math.max(...lls.map(p => p.lat)) + dLat) / 0.01);
    const tiles = []; for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) tiles.push(tile(x, y));
    const seen = new Set(), segs = [];
    for (const fs of await Promise.all(tiles)) for (const f of fs) {
      const p = f.properties || {}, id = p.OGF_ID; if (seen.has(id)) continue; seen.add(id);
      const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
      for (const l of lines) segs.push({ id, from: p.FROM_JUNCTION_ID, to: p.TO_JUNCTION_ID, pts: l.map(([x, y]) => P.to(x, y)) });
    }
    return { P, segs };
  }
  /** Along the roads from a to b ({lat, lng}): the vertices of the straight runs, a's and b's road
   * points included; null when no road joins them within reach. */
  async function routeBetween(a, b) {
    const { P, segs } = await roadsAround([a, b]);
    if (!segs.length) return null;
    const G = graph(segs), r = route(G, P.to(a.lng, a.lat), P.to(b.lng, b.lat));
    if (!r) return null;
    return { pts: simplify(r.pts).map(P.from), L: r.L, off: r.off };
  }
  root.PeelRoadNet = { ...api, roadsAround, routeBetween };
})(typeof window !== 'undefined' ? window : globalThis);
