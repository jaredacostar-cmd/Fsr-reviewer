/* Sewer path tracing — path-mode (focusSvc, dev fade), pipe routes,
 * Phase 6 extraction from js/app.js (app.js 5429-5841).
 * TRACE/WTRACE/BLK state, traceDev, blocks layer.
 */
(function (root) {
  'use strict';

  const { $, esc, fmtNum, store, estTag, token, PIPE_RESULTS, SCREEN_NOTE } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const canRotate = window.PeelMapCore.canRotate;
  const mapBottom = window.PeelSewerProfile.mapBottom;
  const App = () => window.PeelApp;
  const SC = () => window.PeelSewerCap;
  const DI = () => window.PeelDcInfra;
  const DJ = () => window.PeelDcJoins;
  const SD = () => window.PeelSvcData;
  const SvcTab = () => window.PeelSvcTab;
  const MA = () => window.PeelMapAnalysis;
  const TS = () => window.PeelToolScope;
  const CA = () => window.PeelCensusAreas;
  const MM = () => window.PeelMapMarkers;
  const SProf = () => window.PeelSewerProfile;
  const DN = () => window.PeelDevNav;
  const AS = () => window.PeelAreaSelect;
  const EP = () => window.PeelExistPipes;
  const SCtx = () => window.PeelSiteContext;
  const PU = () => window.PeelUpstream;
  const Areas = () => window.PeelAreas;

  // Click a zone / catchment row: outline it on the map and zoom to it (a catchment also shades
  // everything upstream that drains through it). Click it again to clear.
  const svcFocus = { id: null, layer: L.layerGroup().addTo(map) };
  function focusSvc(id, opt = {}) {
    const { zoom = true, loads = true, keep = false } = opt;
    svcFocus.layer.clearLayers();
    svcFocus.id = svcFocus.id === id && !keep ? null : id;
    if (typeof AS().syncClearBtn === 'function') setTimeout(AS().syncClearBtn, 0);
    for (const r of document.querySelectorAll('.svc-row')) r.classList.toggle('on', r.dataset.svc === svcFocus.id);
    const a = svcFocus.id && SD().svcById.get(svcFocus.id);
    syncPathMode();
    if (!a) return;
    const poly = (x, cls) => L.polygon(x.rings.map(r => r.map(([lng, lat]) => [lat, lng])), { className: cls, interactive: false });
    const up = a.zone ? [] : SvcTab().upstreamOf(a.id, SvcTab().svcFlowTree());
    for (const u of up) poly(u, 'svc-focus-up').addTo(svcFocus.layer);
    const main = poly(a, 'svc-focus').addTo(svcFocus.layer);
    if (!a.zone) drawFlowPath(a, up);
    const b = main.getBounds();
    for (const u of up) b.extend(L.latLngBounds(u.rings.flat().map(([lng, lat]) => [lat, lng])));
    // …and the next outlet downstream, so the first flow arrow out of it is in view.
    const nx = !a.zone && a.downstream && SD().svcById.get(a.downstream);
    const pl = !a.zone && (App().state.servicing.meta.plants || []).find(p => p.name === a.plant);
    const nxAt = nx ? nx.outletAt || (pl && pl.lnglat) : pl && pl.lnglat;
    if (nxAt) b.extend([nxAt[1], nxAt[0]]);
    if (zoom) map.fitBounds(b, { padding: [30, 30] });
    if (loads) TS().showLoads(a.id);
  }
  // Flow arrows (schematic, outlet to outlet): from each upstream outlet into the next
  // catchment, then from this catchment's outlet down the chain to the plant on the lake.
  function drawFlowPath(a, up) {
    const plant = (App().state.servicing.meta.plants || []).find(p => p.name === a.plant);
    const ll = p => [p[1], p[0]];
    // Along the sewers (data/sewers.json) when loaded: from the catchment's outlet down the pipes
    // to the plant, and from each upstream outlet until it joins that route.
    if (!MM().SEW.data) { SC().loadSewers().then(d => { if (d && svcFocus.id === a.id) focusSvc(a.id, { zoom: false, loads: false, keep: true }); }); }
    else {
      const start = a.outletAt && SC().nearestPipe(a.outletAt[0], a.outletAt[1], 400);
      if (start >= 0) {
        const main = pipeRoute(start); drawPipeRoute(main, 'svc-flow', svcFocus.layer);
        const onMain = new Set(main);
        for (const u of up) { const k = u.outletAt && SC().nearestPipe(u.outletAt[0], u.outletAt[1], 400); if (k >= 0) drawPipeRoute(pipeRoute(k, onMain), 'svc-flow-up', svcFocus.layer); }
        if (plant) L.circleMarker(ll(plant.lnglat), { radius: 6, className: 'svc-plant', interactive: true }).bindTooltip(esc(SD().plantLabel(a.plant)), { className: 'pt' }).addTo(svcFocus.layer);
        addFlowMarker();
        return;
      }
    }
    const arrow = (from, to, cls) => { if (from && to && (from[0] !== to[0] || from[1] !== to[1])) L.polyline([ll(from), ll(to)], { className: cls, interactive: false }).addTo(svcFocus.layer); };
    const endOf = d => { const nx = d.downstream && SD().svcById.get(d.downstream); return nx ? (nx.outletAt || (plant && plant.lnglat)) : plant && plant.lnglat; };
    for (const u of up) arrow(u.outletAt, endOf(u), 'svc-flow-up');
    for (let d = a, n = 0; d && n < 30; d = d.downstream && SD().svcById.get(d.downstream), n++) arrow(d.outletAt, endOf(d), 'svc-flow');
    if (plant) L.circleMarker(ll(plant.lnglat), { radius: 6, className: 'svc-plant', interactive: true }).bindTooltip(esc(SD().plantLabel(a.plant)), { className: 'pt' }).addTo(svcFocus.layer);
    addFlowMarker();
  }
  // SVG arrowheads for the flow lines (one <marker> per map renderer).
  function addFlowMarker() {
    for (const svg of map.getContainer().querySelectorAll('.leaflet-overlay-pane svg, .leaflet-flow-pane svg')) addFlowDefs(svg);
    syncPathMode();
  }
  // While a flow path is shown (development trace, catchment or block), the development markers
  // fade (or hide) so the path reads clearly; a switch in the bottom bar picks Show / Faded / Hidden.
  let devMode = store.get('devFade', 'faded'), devChip = null;
  function syncPathMode() {
    const on = !!(TRACE.key || WTRACE.key || svcFocus.id || BLK.id), el = map.getContainer();
    el.classList.toggle('paths-on', on); el.classList.toggle('trace-on', !!(TRACE.key || WTRACE.key)); el.dataset.devmode = devMode;
    SD().syncDevsOff();
    if (!devChip && on) {
      devChip = L.DomUtil.create('div', 'dev-mode', mapBottom); L.DomEvent.disableClickPropagation(devChip);
      devChip.addEventListener('click', e => { const b = e.target.closest('[data-devmode]'); if (!b) return; setTimeout(() => { devMode = b.dataset.devmode; store.set('devFade', devMode); syncPathMode(); }); });
    }
    if (devChip) {
      devChip.hidden = !on;
      devChip.innerHTML = `<span>Developments</span>${[['show', 'Show'], ['faded', 'Faded'], ['hidden', 'Hidden']].map(([k, t]) => `<button type="button" class="btn small${devMode === k ? ' on' : ''}" data-devmode="${k}" aria-pressed="${devMode === k}">${t}</button>`).join('')}`;
    }
  }
  function addFlowDefs(svg) {
    if (!svg || svg.querySelector('#flow-head-s')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = '<marker id="flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--flow)"/></marker>'
      + '<marker id="flow-head-s" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="12" markerHeight="12" orient="auto"><path d="M0,1 L10,5 L0,9 z" style="fill:var(--text-primary);stroke:var(--map-label)" stroke-width="1"/></marker>';
    svg.insertBefore(defs, svg.firstChild);
  }

  // ---- Routes along the sewer network (data/sewers.json: each pipe's next pipe downstream) ----
  // Pipe indices from `start` down to the plant (or until a pipe in `stopAt`, joining another route).
  function pipeRoute(start, stopAt) {
    const out = []; const seen = new Set();
    for (let k = start; k != null && k >= 0 && !seen.has(k) && out.length < 8000; k = MM().SEW.data.pipes[k][3]) { out.push(k); seen.add(k); if (stopAt && stopAt.has(k)) break; }
    return out;
  }
  const routeKm = route => route.reduce((t, k) => { const c = SC().pipeCoords(MM().SEW.data.pipes[k]); for (let i = 1; i < c.length; i++) t += DI().dcM(c[i - 1], c[i]); return t; }, 0) / 1000;
  // Drawn as pieces of ~1.2 km, each ending in an arrowhead, so the direction shows all along.
  function drawPipeRoute(route, cls, layer, every = 1200) {
    let seg = [], run = 0;
    const flush = () => { if (seg.length > 1) L.polyline(seg.map(([x, y]) => [y, x]), { className: cls, interactive: false, renderer: SD().flowRenderer }).addTo(layer); };
    for (const k of route) for (const c of SC().pipeCoords(MM().SEW.data.pipes[k])) {
      if (seg.length) { const last = seg[seg.length - 1]; if (last[0] === c[0] && last[1] === c[1]) continue; run += DI().dcM(last, c); }
      seg.push(c);
      if (run >= every) { flush(); seg = [c]; run = 0; }
    }
    flush();
  }

  // ---- Trace a development's sewer path to the treatment plant -----------------------------------
  // From the site to the 300 mm+ sewer it joins (dashed), then pipe by pipe to the plant: each pipe
  // coloured by its capacity state at the legend year, arrows along the route, the pumping stations
  // it passes and the plant. Summary: length, pipes, blocks passed, tightest pipe.
  const TRACE = { layer: L.layerGroup().addTo(map), key: null };
  const WTRACE = { layer: L.layerGroup().addTo(map), key: null, last: null };
  // Fit bounds into the part of the map the open panel doesn't cover (beside it on a wide screen,
  // above the bottom sheet on a phone).
  function fitClear(bd) {
    const d = $('#analysis'), m = map.getContainer().getBoundingClientRect();
    let br = [30, 30];
    if (d && !d.hidden) {
      const r = d.getBoundingClientRect();
      if (r.top > m.top + m.height * 0.25 && r.width >= m.width * 0.9) br = [30, Math.min(m.height * 0.75, Math.max(30, m.bottom - r.top + 20))];
      else if (r.left > m.left + m.width * 0.3) br = [Math.min(m.width * 0.6, Math.max(30, m.right - r.left + 20)), 30];
    }
    // Room for the boxes along the bottom edge (timeline, Clear selection and the path switch).
    const low = [MA().timebarEl].filter(e => e && !e.hidden).map(e => e.getBoundingClientRect()).filter(r => r.height && r.top < m.bottom);
    if (low.length) br[1] = Math.max(br[1], Math.round(m.bottom - Math.min(...low.map(r => r.top)) + 12));
    // On a phone the map panel spans the top: start below it.
    const op = document.querySelector('.map-opts'), tl = [30, MA().phoneMap && op ? Math.max(30, Math.round(op.getBoundingClientRect().bottom - m.top + 8)) : 30];
    // The selection buttons sit at the top of the map: start below them.
    const mbr = (e => e && !e.hidden ? e.getBoundingClientRect() : null)(document.querySelector('.map-bottom'));
    if (mbr && mbr.height) tl[1] = Math.max(tl[1], Math.round(mbr.bottom - m.top + 10));
    const bearing = canRotate ? map.getBearing() : 0;
    if (!bearing) { map.fitBounds(bd, { paddingTopLeft: tl, paddingBottomRight: br }); return; }
    // Rotated map: size the bounds' corners as they appear on screen, then centre them in the clear part.
    const a = bearing * Math.PI / 180, cos = Math.cos(a), sin = Math.sin(a);
    const corners = [bd.getNorthWest(), bd.getNorthEast(), bd.getSouthEast(), bd.getSouthWest()];
    const W = m.width - tl[0] - br[0], H = m.height - tl[1] - br[1];
    let z = map.getMaxZoom();
    for (; z > map.getMinZoom(); z--) {
      const pts = corners.map(ll => map.project(ll, z)).map(p => [p.x * cos - p.y * sin, p.x * sin + p.y * cos]);
      const w = Math.max(...pts.map(p => p[0])) - Math.min(...pts.map(p => p[0])), h = Math.max(...pts.map(p => p[1])) - Math.min(...pts.map(p => p[1]));
      if (w <= W && h <= H) break;
    }
    map.setView(bd.getCenter(), Math.min(z, 17), { animate: false });
    // Shift so the centre sits in the middle of the clear area.
    map.panBy([(br[0] - tl[0]) / 2, (br[1] - tl[1]) / 2], { animate: false });
  }
  function clearTrace() { TRACE.layer.clearLayers(); TRACE.key = null; SProf().profMapOff(); syncPathMode(); }
  // Sites outside the traced catchments: along the planned DC wastewater mains to the existing sewers.
  // The planned mains (2026 DC maps) form a network: each main's ends join another main within 60 m;
  // a main's end within 200 m of an existing sewer of 300 mm+ (or any point within 25 m) is where it
  // can hand over. From the planned main nearest the site (within 1 km), the trace takes the shortest
  // path to a hand-over, preferring one in the catchment that main serves. The maps don't give the
  // flow direction, so the path is indicative. Sewers flow into the same size or bigger: a planned
  // main hands over only to an existing sewer at least its own diameter (a main with no size on the
  // maps: at least half the largest planned main on the path so far), so a 900 mm trunk doesn't empty
  // into a 375 mm local sewer, it carries on along the planned trunk to the existing one. A site
  // whose join point is within 25 m of an existing sewer still connects to that sewer.
  const DCW = { g: null };
  function dcSewerNet() {
    if (DCW.g && DCW.v === (DJ() ? DJ().version() : 0)) return DCW.g;
    if (!App().state.dcInfra || !MM().SEW.data) return DCW.g;
    const xs = [], ys = [], E = [], lineOf = [], lines = [...App().state.dcInfra.wastewater.lines, ...(DJ() ? DJ().capLines('wastewater') : [])];     // (with the capital projects' new sewers: js/dc-joins.js)
    for (const ln of lines) { const a = xs.length; ln.g.forEach(([x, y], k) => { xs.push(x); ys.push(y); lineOf.push(ln); if (k) E.push([a + k - 1, a + k, ln]); }); ln._n = [a, xs.length - 1]; }
    // Hand-overs to the existing sewers: a main's end within 600 m of a 300 mm+ sewer (beyond 200 m
    // costed as a bridged gap), any point within 25 m.
    // Each node keeps the nearest pipe of each larger size (nearest first), for the size rule.
    const ends = lines.flatMap(ln => ln._n), endSet = new Set(ends), exit = new Map();
    // A reviewed join (js/dc-joins.js) replaces the automatic one at that end: onto the sewer or
    // planned main it was set to (no size rule), or none (an open end, nothing hands over there).
    const ov = new Map(ends.map(t => [t, DJ() ? DJ().override('wastewater', [xs[t], ys[t]]) : null]));
    for (let i = 0; i < xs.length; i++) {
      const o = ov.get(i);
      if (o) {
        const k = o.to && o.into === 'sewer' ? SC().nearestPipe(o.to[0], o.to[1], 15) : -1;
        if (k >= 0) exit.set(i, [{ k, m: DI().dcDist([xs[i], ys[i]], SC().pipeCoords(MM().SEW.data.pipes[k])), d: MM().SEW.data.pipes[k][0], cost: 0, reviewed: true, ov: o }]);
        continue;
      }
      const r = endSet.has(i) ? 600 : 25, list = [];
      for (let minD = 0, k; (k = SC().nearestPipe(xs[i], ys[i], r, minD)) >= 0; minD = MM().SEW.data.pipes[k][0] + 1) {
        const m = DI().dcDist([xs[i], ys[i]], SC().pipeCoords(MM().SEW.data.pipes[k]));
        list.push({ k, m, d: MM().SEW.data.pipes[k][0], cost: m > 200 ? m * 2.5 : 0 });
      }
      if (list.length) exit.set(i, list);
    }
    // A main's end joins the nearest point on another main: within 60 m as drawn, up to 600 m as a
    // bridged gap (the maps often stop a main short of the one it feeds), costed 2.5× its length.
    // Mains are straight between their vertices, often for hundreds of metres: an end drawn onto one
    // joins it there (a tap), with a join to both ends of that piece, each costed along it. A
    // bridged gap only where no existing sewer of the main's size is nearer: that sewer is where the
    // main ends, not a planned main 400 m off.
    const nEp = E.length, joins = [];
    const tapDc = (pt, maxM, ok) => {
      const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320, rx = maxM / kx, ry = maxM / ky;
      let best = null;
      for (let k = 0; k < nEp; k++) {
        const [a, b, l] = E[k]; if (!ok(l)) continue;
        if (Math.min(xs[a], xs[b]) > pt[0] + rx || Math.max(xs[a], xs[b]) < pt[0] - rx || Math.min(ys[a], ys[b]) > pt[1] + ry || Math.max(ys[a], ys[b]) < pt[1] - ry) continue;
        const ax = (xs[a] - pt[0]) * kx, ay = (ys[a] - pt[1]) * ky, bx = (xs[b] - pt[0]) * kx, by = (ys[b] - pt[1]) * ky;
        const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, u = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, m = Math.hypot(ax + u * dx, ay + u * dy);
        if (m <= maxM && (!best || m < best.m)) best = { a, b, l, m, q: [xs[a] + (xs[b] - xs[a]) * u, ys[a] + (ys[b] - ys[a]) * u] };
      }
      return best;
    };
    const cand = new Map();
    for (const t of ends) {
      const o = ov.get(t), ln = lineOf[t], pt = [xs[t], ys[t]];
      let tp = null;
      if (!o) {
        // (onto a planned main at least half its size: an 1800 mm trunk doesn't end in a 450 mm local;
        // onto a capital project's new sewer only where drawn onto it)
        tp = tapDc(pt, 600, l => l !== ln && !l.cap && !(l.d && ln.d && l.d < ln.d / 2));
        const tc = tapDc(pt, DJ() ? DJ().CAP_REACH_M : 60, l => l !== ln && l.cap);
        if (tc && (!tp || tc.m < tp.m)) tp = tc;
      }
      else if (o.to && o.into === 'dc') { tp = tapDc(o.to, 15, l => l !== ln); if (tp) tp = { ...tp, m: DI().dcM(pt, tp.q) }; }
      // The sewer it hands over to: its size or bigger, or at least half its size where the main is
      // drawn onto it (within 60 m: a twin of the existing trunk).
      const sewer = (exit.get(t) || []).find(c => c.reviewed || c.d >= (ln.d || 0) || (c.m <= 60 && c.d >= (ln.d || 0) / 2));
      if (!o && tp && tp.m > 60 && sewer && sewer.m < tp.m) tp = null;
      cand.set(t, { o, ln, pt, tp, sewer, near: !!o || (tp && tp.m <= 200) || (sewer && sewer.m <= 200) });
    }
    // A sewer starts at its head: where a planned main's one end joins (within 200 m) and the other
    // has nothing within 200 m and no existing sewer in reach at all, that other end is the head, left
    // open (no bridged gap to another planned main: a shortcut the sewer doesn't have). Only where the mains
    // joined within reach already hand over to an existing sewer: a group that reaches one only
    // through a long gap keeps it (that gap is its outlet).
    const grp = new Map(), find = l => { while (grp.get(l) !== l) { grp.set(l, grp.get(grp.get(l))); l = grp.get(l); } return l; };
    for (const ln of lines) grp.set(ln, ln);
    const outlet = new Set();
    for (const c of cand.values()) if (c.tp && c.tp.m <= 200) grp.set(find(c.ln), find(c.tp.l));
    for (const c of cand.values()) if ((c.sewer && c.sewer.m <= 200) || (c.o && c.o.into === 'sewer')) outlet.add(find(c.ln));
    for (const [i, list] of exit) if (!endSet.has(i) && list.length) outlet.add(find(lineOf[i]));     // (a main running within 25 m of a sewer)
    for (const t of ends) {
      const c = cand.get(t), { o, ln, pt } = c, other = cand.get(ln._n[0] === t ? ln._n[1] : ln._n[0]);
      const head = !o && !c.near && !c.sewer && other && other !== c && other.near && outlet.has(find(ln));     // (an end with an existing sewer in reach may be the outlet: kept)
      let { tp, sewer } = c;
      if (head) { tp = null; sewer = null; exit.set(t, (exit.get(t) || []).filter(x => x.m <= 200)); }
      if (tp) for (const e of [tp.a, tp.b]) E.push([t, e, null, tp.m + DI().dcM(tp.q, [xs[e], ys[e]]), !o && tp.m > 60, tp.q, o]);
      const sewerNearer = sewer && (!tp || sewer.m < tp.m);
      if (!ln.cap) joins.push({ sys: 'wastewater', ln, pt, auto: !o, ov: o, head,
        ...(o && o.to && (sewerNearer || tp) ? { to: o.to, m: DI().dcM(pt, o.to), into: sewerNearer ? { kind: 'sewer', d: sewer.d, k: sewer.k } : { kind: 'dc', ln: tp.l } }
          : sewerNearer ? { to: SC().pipeCoords(MM().SEW.data.pipes[sewer.k]).reduce((a, c) => (DI().dcM(pt, c) < DI().dcM(pt, a) ? c : a)), m: sewer.m, into: { kind: 'sewer', d: sewer.d, k: sewer.k } }
          : tp ? { to: tp.q, m: tp.m, into: { kind: 'dc', ln: tp.l } } : { to: null, m: null, into: null }) });
    }
    const adj = Array.from({ length: xs.length }, () => []); E.forEach(([a, b], k) => { adj[a].push(k); adj[b].push(k); });
    // (a join edge: [end, node, null, length, bridged, tap point, reviewed join or null])
    const len = E.map(([a, b, , l]) => l ?? DI().dcM([xs[a], ys[a]], [xs[b], ys[b]]));
    const cost = E.map((e, k) => (e[2] ? len[k] : len[k] * (e[4] ? 2.5 : 1)));
    DCW.g = { xs, ys, E, adj, len, cost, exit, lineOf, joins }; DCW.v = DJ() ? DJ().version() : 0;
    return DCW.g;
  }
  // opts.cap: start on the capital project's new sewer nearest the point (within 60 m), not the
  // nearest planned main (an outlet set onto a sewer being built: js/dev-outlets.js).
  function capNearest(pt, r) {
    let best = null;
    for (const ln of DJ() ? DJ().capLines('wastewater') : []) { const m = DI().dcDist(pt, ln.g); if (m <= r && (!best || m < best.m)) best = { ln, m }; }
    return best;
  }
  function dcSewerPath(p, opts = {}) {
    const G = dcSewerNet(); if (!G) return null;
    const n = opts.cap ? capNearest([p.lng, p.lat], 60) : DI().dcNearest('wastewater', [p.lng, p.lat], DI().DC_CONNECT_M); if (!n || !n.ln._n) return null;
    const [a, b] = n.ln._n; let s = a, sd = Infinity;
    for (let i = a; i <= b; i++) { const m = DI().dcM([p.lng, p.lat], [G.xs[i], G.ys[i]]); if (m < sd) { sd = m; s = i; } }
    const target = n.ln.cap ? null : DI().dcTarget(n.ln), inTarget = new Map();
    const pipeIn = k => { if (!inTarget.has(k)) { const c = SC().pipeCoords(MM().SEW.data.pipes[k])[0]; inTarget.set(k, !target || Areas().locate(App().state.servicing.drainage, c[0], c[1]).includes(target)); } return inTarget.get(k); };
    // Same size or bigger first; where no such sewer is in reach, at least half the size.
    const search = strict => {
      const dist = new Float64Array(G.xs.length).fill(Infinity), via = new Int32Array(G.xs.length).fill(-1), dmax = new Float64Array(G.xs.length), Q = [[0, s]]; dist[s] = 0;
      dmax[s] = G.lineOf[s].d || 0;
      let best = Infinity, bt = -1, bex = null;
      while (Q.length) {
        let qi = 0; for (let i = 1; i < Q.length; i++) if (Q[i][0] < Q[qi][0]) qi = i;
        const [dd, u] = Q.splice(qi, 1)[0]; if (dd > dist[u]) continue; if (dd >= best) break;
        const need = strict ? G.lineOf[u].d || dmax[u] / 2 : dmax[u] / 2, ex = (G.exit.get(u) || []).find(c => c.reviewed || c.d >= need || (c.m <= 60 && c.d >= need / 2) || (u === s && c.m <= 25));
        if (ex) { const tot = dd + ex.cost + (pipeIn(ex.k) ? 0 : 3000); if (tot < best) { best = tot; bt = u; bex = ex; } }
        for (const k of G.adj[u]) { const [x, y] = G.E[k], v = x === u ? y : x, nd = dd + G.cost[k]; if (nd < dist[v]) { dist[v] = nd; via[v] = k; dmax[v] = Math.max(dmax[u], G.lineOf[v].d || 0); Q.push([nd, v]); } }
      }
      return { bt, bex, via };
    };
    let r = search(true); if (r.bt < 0) r = search(false);
    const { bt, bex, via } = r;
    if (bt < 0) return null;
    const nodes = [bt], used = new Set(), edited = new Set(), coords = [[G.xs[bt], G.ys[bt]]]; let km = 0, gaps = 0;
    for (let v = bt; v !== s;) { const k = via[v]; km += G.len[k] / 1000; if (G.E[k][2]) used.add(G.E[k][2]); else { if (G.E[k][4]) gaps++; if (G.E[k][6]) edited.add(G.E[k][6]); } const [x, y] = G.E[k]; v = x === v ? y : x; if (G.E[k][5]) coords.push(G.E[k][5]); nodes.push(v); coords.push([G.xs[v], G.ys[v]]); }
    nodes.reverse(); coords.reverse();
    const ex = bex;
    if (ex.ov) edited.add(ex.ov);
    return { start: s, joinM: sd, coords, km, gaps: gaps + (ex.m > 200 ? 1 : 0), lines: [...used], first: n.ln, exit: ex.k, inTarget: pipeIn(ex.k), target, edited: [...edited] };
  }
  // Make a traced route stand out: a dark casing and a white halo under it (kept at the back of the
  // path pane), and white dashes moving along it in the flow direction (still with reduced motion).
  // coords: [lng, lat] in flow order.
  function traceGlow(coords, layer, w = 7) {
    const ll = []; for (const [x, y] of coords) { const q = ll[ll.length - 1]; if (!q || q[0] !== y || q[1] !== x) ll.push([y, x]); }
    if (ll.length < 2) return;
    for (const [cls, ww] of [['trace-halo', w + 6], ['trace-case', w + 12]]) L.polyline(ll, { className: cls, weight: ww, interactive: false, renderer: SD().flowRenderer }).addTo(layer).bringToBack();
    L.polyline(ll, { className: 'trace-ants', weight: 2.5, interactive: false, renderer: SD().flowRenderer }).addTo(layer);
  }
  async function traceDev(p) {
    await Promise.all([SC().loadSewers(), loadBlocks()]);
    if (!MM().SEW.data || p.lat == null) return null;
    clearTrace(); TRACE.key = p.key;
    // Outside the traced catchments: along the planned DC mains first, when one is within 1 km.
    // Also where the site has no existing sewer of 300 mm+ within 400 m (greenfield in a mapped catchment).
    const G = SC().sewerGrowth(), k0 = G.devPipe.get(p) ?? SC().nearestPipe(p.lng, p.lat);
    // (an outlet set by hand: onto an existing sewer, that sewer; onto a planned main, its route: js/dev-outlets.js)
    const DO = window.PeelDevOutlets, setR = DO ? DO.dcRouteFor(p) : null;
    const outside = setR ? setR !== 'sewer' : !(p.dr && p.dr.length) || k0 < 0, pl = setR && setR !== 'sewer' ? setR : outside ? dcSewerPath(p) : null;
    // No planned path either: the nearest existing sewer within 3 km, joined straight.
    const far = !pl && k0 < 0 ? SC().nearestPipe(p.lng, p.lat, 3000) : -1;
    const k = pl ? pl.exit : k0 >= 0 ? k0 : far;
    if (k == null || k < 0) { TRACE.key = null; syncPathMode(); return null; }
    const route = pipeRoute(k), P = MM().SEW.data.pipes;
    // Connection from the site (or the planned main's hand-over) to the first pipe.
    const from = pl ? pl.coords[pl.coords.length - 1] : [p.lng, p.lat];
    const first = SC().pipeCoords(P[k]); let jn = first[0], jd = Infinity;
    for (const c of first) { const d = DI().dcM(from, c); if (d < jd) { jd = d; jn = c; } }
    if (pl) {
      const st = pl.coords[0];
      if (pl.joinM > 5) L.polyline([[p.lat, p.lng], [st[1], st[0]]], { className: 'trace-link', interactive: false, renderer: SD().flowRenderer }).addTo(TRACE.layer);
      L.polyline(pl.coords.map(([x, y]) => [y, x]), { className: 'trace-plan', renderer: SD().flowRenderer })
        .bindTooltip(`<strong>Planned (2026 DC)</strong><br>${pl.lines.map(ln => esc(DI().dcLineText(ln))).join('<br>') || esc(DI().dcLineText(pl.first))}`, { sticky: true, className: 'pt' }).addTo(TRACE.layer);
      L.polyline([[from[1], from[0]], [jn[1], jn[0]]], { className: 'trace-link', interactive: false, renderer: SD().flowRenderer }).addTo(TRACE.layer);
    } else L.polyline([[p.lat, p.lng], [jn[1], jn[0]]], { className: 'trace-link', interactive: false, renderer: SD().flowRenderer }).addTo(TRACE.layer);
    L.circleMarker([p.lat, p.lng], { radius: 7, className: 'trace-site', interactive: false, renderer: SD().flowRenderer }).addTo(TRACE.layer);
    // The path in one colour (no capacity colours), with a tooltip each (tap: what drains through it).
    let worst = null, km = 0;
    for (const i of route) {
      const st = SC().pipeStats(i), c = SC().pipeCoords(P[i]);
      for (let q = 1; q < c.length; q++) km += DI().dcM(c[q - 1], c[q]) / 1000;
      if (st.r1 != null && (!worst || st.r1 > worst.r1)) worst = { i, r1: st.r1 };
      L.polyline(c.map(([x, y]) => [y, x]), { color: token('--select'), weight: P[i][0] >= 1200 ? 8 : P[i][0] >= 600 ? 7 : 6, opacity: 1, lineCap: 'round', lineJoin: 'round', renderer: SD().flowRenderer })
        .bindTooltip(() => SC().pipeTip(i), { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); SC().showPipeLoads(i); }).addTo(TRACE.layer);
    }
    traceGlow([[p.lng, p.lat], ...(pl ? pl.coords : []), jn, ...route.flatMap(i => SC().pipeCoords(P[i]))], TRACE.layer, 7);
    drawPipeRoute(route, 'trace-flow', TRACE.layer, Math.max(900, km * 1000 / 14));
    if (pl && pl.coords.length > 1) L.polyline(pl.coords.map(([x, y]) => [y, x]), { className: 'trace-flow', interactive: false, renderer: SD().flowRenderer }).addTo(TRACE.layer);
    // Pumping stations within 80 m of the route, and the plant at its end.
    const stations = ((App().state.servicing && App().state.servicing.meta.pumpingStations) || []).filter(ps => route.some(i => DI().dcDist(ps.lnglat, SC().pipeCoords(P[i])) <= 80));
    for (const ps of stations) L.circleMarker([ps.lnglat[1], ps.lnglat[0]], { radius: 6, className: 'trace-ps', renderer: SD().flowRenderer }).bindTooltip(`<strong>${esc(ps.name.replace(/SEWAGE PUMPING( STN| STATION)?/i, 'pumping station'))}</strong>`, { className: 'pt' }).addTo(TRACE.layer);
    const plantName = MM().SEW.data.plants[P[route[route.length - 1]][6]] || '';
    const end = SC().pipeCoords(P[route[route.length - 1]]).pop();
    L.circleMarker([end[1], end[0]], { radius: 8, className: 'svc-plant', renderer: SD().flowRenderer }).bindTooltip(esc(plantName === 'Toronto' ? 'City of Toronto system' : SD().plantLabel(plantName)), { className: 'pt' }).addTo(TRACE.layer);
    addFlowMarker();
    // Blocks passed, in order.
    const blocks = []; if (BLK.data) for (const i of route) { const c = SC().pipeCoords(P[i])[0], b = blockAt(c[0], c[1]); if (b && !blocks.includes(b.id)) blocks.push(b.id); }
    const bd = L.latLngBounds([[p.lat, p.lng], [end[1], end[0]]]); for (const i of route) for (const [x, y] of SC().pipeCoords(P[i])) bd.extend([y, x]);
    if (pl) for (const [x, y] of pl.coords) bd.extend([y, x]);
    fitClear(bd);
    const res = { route, km, worst, stations, plantName, blocks, joinM: jd, first: k, pl, outside, far: far >= 0 && k === far, built: MM().svcLayerOf(p) === 'built' };
    TRACE.last = res;
    return res;
  }
  // The planned projects a DC-routed path relies on, and whether they're in service by the demand
  // year (the DC map's year for each main); before then the site has no outlet on this route.
  function dcWaitHTML(pl, built) {
    const by = new Map();
    for (const ln of [pl.first, ...pl.lines]) if (ln.p) { const o = by.get(ln.p) || { p: ln.p, y: 0, n: ln.n }; o.y = Math.max(o.y, ln.y || 0); o.n = o.n || ln.n; by.set(ln.p, o); }
    const list = [...by.values()]; if (!list.length) return '';
    const due = Math.max(...list.map(o => o.y)), wait = !built && due && MA().getCapYear() != null && MA().getCapYear() < due;
    const txt = list.map(o => `<strong>${esc(o.p)}</strong>${o.n ? ` ${esc(o.n.replace(/\s+/g, ' '))}` : ''} (${o.y || 'year not labelled'})`).join(', ');
    return `<li class="${wait ? 'why-stall' : 'why-ok'}"><span>Relies on planned DC project${list.length === 1 ? '' : 's'} ${txt}. ${built ? 'Already built: the route along the planned mains is indicative.' : wait ? `Not in service in ${MA().getCapYear()}: the site has no outlet on this route until ${due} (DC map year). It isn't connected to the smaller local sewers nearby in the meantime.` : MA().getCapYear() == null ? 'In service by build-out.' : `In service by ${MA().getCapYear()}.`}</span></li>`;
  }
  // The demand year moved: refresh the open trace's summary (projects in service or not).
  function syncTraceSum() {
    const b = document.querySelector('.trace-box [data-trace][data-on="1"]'), o = b && b.closest('.trace-box').querySelector('.trace-out');
    if (o && TRACE.last && TRACE.last.pl) o.innerHTML = traceSummaryHTML(TRACE.last);
  }
  function traceSummaryHTML(t) {
    if (!t) return '<p class="small muted">No existing sewer of 300 mm+ within 3 km of the site and no planned DC wastewater main reaching one, to trace from.</p>';
    const P = MM().SEW.data.pipes, w = PIPE_RESULTS ? t.worst : null, st = w && MM().pipeState(w.r1);
    return `${SCREEN_NOTE}<ul class="why-list trace-sum">
      ${t.pl ? `<li class="why-ok"><span>Outside the traced catchments: joins the planned <strong>${esc(DI().dcLineText(t.pl.first))}</strong> ${fmtNum(Math.round(t.pl.joinM / 10) * 10)} m from the site, then <strong>${t.pl.km.toFixed(1)} km along planned DC mains</strong>${t.pl.lines.length > 1 ? ` (${t.pl.lines.length} mains)` : ''} to the existing sewers${t.pl.gaps ? `, bridging ${t.pl.gaps} gap${t.pl.gaps === 1 ? '' : 's'} where the mapped mains stop short (straight)` : ''}${t.pl.inTarget ? '' : ' (outside the catchment that main is mapped to)'}.</span></li>` : t.far ? `<li class="why-stall"><span>No existing sewer within 400 m and no planned DC main that reaches one: joined straight to the nearest existing sewer, ${SD().kmText(t.joinM)} away. Its route will depend on works not yet on the DC maps.</span></li>` : t.outside ? '<li class="why-stall"><span>Outside the traced catchments and no planned DC main within 1 km: joined to the nearest existing sewer.</span></li>' : ''}
      ${t.pl && t.pl.edited && t.pl.edited.length ? `<li class="why-stall"><span>${DJ() ? DJ().editedHTML(t.pl.edited) : ''}</span></li>` : ''}
      ${t.pl ? dcWaitHTML(t.pl, t.built) : ''}
      <li class="why-ok"><span>Joins a <button type="button" class="btn small link" data-pipe="${t.first}">${P[t.first][0]} mm sewer</button> ${fmtNum(Math.round(t.joinM))} m from ${t.pl ? 'the planned main' : 'the site'}, then <strong>${t.km.toFixed(1)} km</strong> through ${fmtNum(t.route.length)} pipes to <strong>${esc(t.plantName === 'Toronto' ? 'the City of Toronto system' : SD().plantLabel(t.plantName))}</strong>.</span></li>
      ${t.blocks.length ? `<li class="why-ok"><span>Through wastewater block${t.blocks.length === 1 ? '' : 's'} ${t.blocks.map(b => `<button type="button" class="btn small link" data-block="${esc(b)}">${esc(b)}</button>`).join(' → ')}.</span></li>` : ''}
      ${t.stations.length ? `<li class="why-ok"><span>Pumping station${t.stations.length === 1 ? '' : 's'} on the way: ${t.stations.map(ps => esc(ps.name.replace(/\s*SEWAGE PUMPING( STN| STATION)?/i, '').replace(/\b\w+/g, x => x[0] + x.slice(1).toLowerCase()))).join(', ')}.</span></li>` : ''}
      ${w ? `<li class="${w.r1 > 1 ? 'why-stall' : 'why-ok'}"><span>Tightest pipe on the way: <button type="button" class="btn small link" data-pipe="${w.i}">${P[w.i][0]} mm</button> at <strong>${Math.round(w.r1 * 100)}%</strong> of full capacity (${esc(st[3].toLowerCase())}, ${MA().getCapYear() == null ? 'build-out' : MA().getCapYear()}). ${estTag}</span></li>` : ''}
    </ul>${PIPE_RESULTS ? '<p class="small"><button type="button" class="btn small" data-profile="trace"><span aria-hidden="true">⌇</span> Sewer profile along this path</button></p>' : ''}<p class="small muted">On the map: the dashed line joins the site to the sewer${t.pl ? ' (dashed pink: the planned DC mains, flow direction not published)' : ''}; each pipe is coloured by its state (green under 85%, orange 85–100%, red over 100%), arrows show the flow, purple dots are pumping stations. Tap a pipe for what loads it and how its flow is calculated.</p>`;
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-trace]'); if (!b) return;
    const wf = b.dataset.trace.startsWith('whatif:') && SProf().getWhatIfs().find(w => `whatif:${w.id}` === b.dataset.trace);
    const p = wf ? SProf().whatIfProject(wf) : DN().projectByKey(b.dataset.trace); if (!p) return;
    const box = b.closest('.trace-box');
    const label = b._label || (b._label = b.innerHTML);
    if (TRACE.key === p.key && b.dataset.on) { clearTrace(); b.dataset.on = ''; b.innerHTML = label; b.classList.remove('on'); if (box) box.querySelector('.trace-out').innerHTML = ''; return; }
    b.textContent = 'Tracing…';
    const t = await traceDev(p);
    b.dataset.on = '1'; b.textContent = 'Hide the path'; b.classList.add('on');
    if (box) box.querySelector('.trace-out').innerHTML = traceSummaryHTML(t);
  });

  // ---- Wastewater blocks: the Region of Peel's 40 sewersheds for its inflow & infiltration
  // program (data/blocks.json; the blocks of "Dragonfly: An Integrated Approach to Resiliency",
  // WEFTEC 2024). Each block is joined to the existing sewers: the pipes inside it, the ones
  // leaving it (outlets), the block its main outlet drains into, and the route to the plant.
  const BLK = { data: null, loading: null, layer: null, focus: L.layerGroup().addTo(map), net: null, id: null };
  const blkColor = () => token('--block');
  function loadBlocks() {
    if (BLK.data || BLK.loading) return BLK.loading;
    BLK.loading = fetch('data/blocks.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => { BLK.data = d; return d; }).catch(() => null);
    return BLK.loading;
  }
  // (inRing: the even-odd ring test defined with the existing-pipes code below.)
  const inBlock = (b, x, y) => b.parts.some(p => SCtx().inRing(x, y, p[0]) && !p.slice(1).some(h => SCtx().inRing(x, y, h)));
  function blockAt(x, y) { if (!BLK.data) return null; for (const b of BLK.data.blocks) if (inBlock(b, x, y)) return b; return null; }
  // Blocks ⇄ pipes, computed once both files are loaded.
  function blockNet() {
    if (BLK.net || !BLK.data || !MM().SEW.data) return BLK.net;
    const P = MM().SEW.data.pipes, B = BLK.data.blocks, of = new Int16Array(P.length).fill(-1);
    P.forEach((p, i) => { const c = p[10], k = Math.floor(c.length / 4) * 2; of[i] = B.findIndex(b => inBlock(b, c[k], c[k + 1])); });
    const info = B.map((b, j) => {
      const pipes = [], outs = [];
      P.forEach((p, i) => { if (of[i] !== j) return; pipes.push(i); if (p[3] < 0 || of[p[3]] !== j) outs.push(i); });
      outs.sort((x, y) => P[y][4] - P[x][4]);
      const main = outs.length ? outs[0] : -1, nx = main >= 0 ? P[main][3] : -1;
      return { b, pipes, outs, main, into: nx >= 0 && of[nx] >= 0 ? B[of[nx]].id : null, plant: main >= 0 ? (MM().SEW.data.plants[P[main][6]] || '') : '' };
    });
    const byId = new Map(info.map(x => [x.b.id, x]));
    // Phase 3b: the upstream closure is the tested pure helper in js/upstream.js
    // (loaded before js/app.js; window.PeelUpstream).
    const blkIds = info.map(y => y.b.id), intoOf = y => { const n = byId.get(y); return n ? n.into : null; };
    for (const x of info) { x.up = PU().upstreamIdsOf(blkIds, intoOf, x.b.id); x.direct = info.filter(y => y.into === x.b.id).map(y => y.b.id); }
    BLK.net = { of, info, byId };
    return BLK.net;
  }
  async function setBlocksLayer(on) {
    MM().svcOn.bk = on; store.set('svc-bk', on);
    if (!on) { if (BLK.layer) map.removeLayer(BLK.layer); MA().renderLegend(); return; }
    if (!(await loadBlocks())) return;
    if (!BLK.layer) {
      BLK.layer = L.featureGroup();
      for (const b of BLK.data.blocks) {
        const pl = L.polygon(b.parts.map(p => p.map(r => r.map(([x, y]) => [y, x]))), { renderer: SD().svcRenderer, pane: 'svcPane', color: blkColor(), weight: b.planning ? 2.4 : 1.3, opacity: 0.9, fill: true, fillColor: blkColor(), fillOpacity: b.planning ? 0.12 : 0.03 })
          .bindTooltip(window.PeelUtil.hoverCard({ kind: `Wastewater block (I&I program)${b.planning ? ' · prioritised' : ''}`, name: `Block ${b.id}`, value: `${fmtNum(b.ha)} ha`, also: 'its outlets and route to the plant' }), { sticky: true, className: 'pt' })
          .on('click', ev => { L.DomEvent.stop(ev); showBlock(b.id); });
        BLK.layer.addLayer(pl);
        // In the marker pane: leaflet-rotate places markers there on the turned map (in another pane
        // a label lands off its block when the map is turned to the road grid). White text with a halo,
        // from zoom 12 (css: .z-lt12 hides them); further out, only the block under the pointer.
        const lbl = L.marker([(b.lp || b.c)[1], (b.lp || b.c)[0]], { interactive: false, keyboard: false, icon: L.divIcon({ className: `blk-lbl${b.planning ? ' pri' : ''}`, html: `<span>${esc(b.id)}</span>`, iconSize: [26, 16] }) });
        BLK.layer.addLayer(lbl);
        pl.on('mouseover', () => { const e = lbl.getElement(); if (e) e.classList.add('hov'); }).on('mouseout', () => { const e = lbl.getElement(); if (e) e.classList.remove('hov'); });
      }
    }
    if (MM().svcOn.bk) BLK.layer.addTo(map);
    MA().renderLegend();
  }
  function clearBlockFocus() { BLK.focus.clearLayers(); BLK.id = null; syncPathMode(); }
  // The block is its servicing scope (navigation phase 8a): Peel › plant › Block n, its I&I facts its
  // Overview's fold (blockFactsHTML), the map the scope's focus; the open scope again is a no-op (focusSvc
  // would toggle its own focus off); on a phone the sheet comes up from its peek, as the card's did. The card
  // below is the fallback: where no servicing area resolves, until the servicing model its Overview reads is
  // built (a slow or missing census), and for an old link's last try (opt.card, js/svc-scope.js RESTORE).
  async function showBlock(id, opt = {}) {
    const S = root.PeelSvcScope, ref = S && S.blockRef ? S.blockRef(id) : null, A = App();
    if (!opt.card && ref && A.state.svcModel && S.resolve(ref)) {
      clearBlockFocus(); if (!(S.current() && S.current().ref === ref)) S.open(ref);
      const DT = root.PeelDataTab; if (DT && DT.shellNarrow && DT.shellNarrow() && A.getAnalysisSnap && A.getAnalysisSnap() === 'peek') A.setAnalysisSnap('half');
      return;
    }
    await Promise.all([loadBlocks(), SC().loadSewers()]);
    const net = blockNet(); const x = net && net.byId.get(String(id)); if (!x) return;
    const b = x.b, P = MM().SEW.data.pipes;
    clearBlockFocus(); BLK.id = b.id;
    if (svcFocus.id) focusSvc(svcFocus.id, { zoom: false, loads: false });
    // Map: the block, the blocks draining through it, and the routes to the plant along the pipes.
    const poly = (bb, cls) => L.polygon(bb.parts.map(p => p.map(r => r.map(([lx, ly]) => [ly, lx]))), { className: cls, interactive: false }).addTo(BLK.focus);
    for (const u of x.up) poly(net.byId.get(u).b, 'blk-focus-up');
    const main = poly(b, 'blk-focus');
    const route = x.main >= 0 ? pipeRoute(x.main) : [], onRoute = new Set(route);
    drawPipeRoute(route, 'svc-flow', BLK.focus);
    const big = x.outs.filter(i => i !== x.main && P[i][4] >= 500).slice(0, 6);
    for (const i of big) drawPipeRoute(pipeRoute(i, onRoute), 'svc-flow-up', BLK.focus);
    for (const i of [x.main, ...big]) if (i >= 0) { const c = SC().pipeCoords(P[i]), e = c[c.length - 1]; L.circleMarker([e[1], e[0]], { radius: i === x.main ? 6 : 4, className: 'blk-outlet', interactive: true }).bindTooltip(`Outlet: ${P[i][0]} mm sewer${i === x.main ? ' (main)' : ''}`, { className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); SC().showPipeLoads(i); }).addTo(BLK.focus); }
    const plant = route.length && (App().state.servicing ? (App().state.servicing.meta.plants || []).find(p => p.name === x.plant) : null);
    const endC = route.length ? SC().pipeCoords(P[route[route.length - 1]]).pop() : null;
    if (endC) L.circleMarker([endC[1], endC[0]], { radius: 7, className: 'svc-plant', interactive: true }).bindTooltip(esc(plant ? SD().plantLabel(plant.name) : x.plant || 'Plant'), { className: 'pt' }).addTo(BLK.focus);
    addFlowMarker();
    if (opt.zoom !== false) { const bd = main.getBounds(); if (endC && route.length && routeKm(route) < 30) bd.extend([endC[1], endC[0]]); fitClear(bd); }
    // Panel
    const chain = []; for (let z = x.into, n = 0; z && n < 40; z = net.byId.get(z) && net.byId.get(z).into, n++) chain.push(z);
    const devs = App().state.projects.filter(p => p.lat != null && p.phase !== 'cancelled' && inBlock(b, p.lng, p.lat));
    const gr = (() => { const bc = CA().baselineCensus(); return bc ? Areas().growthSince(devs, {}, bc.date, App().state.criteria) : null; })();
    const jb = SvcTab().svcJobs(devs, (CA().baselineCensus() || { date: '2021-05-11' }).date);
    const own = x.pipes.length, km = route.length ? routeKm(route) : 0;
    const blkBtn = z => `<button type="button" class="btn small link" data-block="${esc(z)}">Block ${esc(z)}${net.byId.get(z) && net.byId.get(z).b.planning ? ' ★' : ''}</button>`;
    const pipeBtn = i => `<button type="button" class="btn small link" data-pipe="${i}">${P[i][0]} mm</button>`;
    root.PeelSvcScope.openResult({ ref: `iiblock:${b.id}`, title: `Wastewater Block ${b.id}`, devKeys: devs.map(p => p.key), reopen: () => showBlock(b.id, { zoom: false }), html: `<div class="head"><h3>Wastewater Block ${esc(b.id)}</h3><div class="m">${b.planning ? '<strong>Prioritised for a block study</strong> · ' : ''}${fmtNum(b.ha)} ha · Region of Peel inflow &amp; infiltration program</div></div>
      <section class="brief">
        <div class="b-row"><div class="b-k">Drains to</div><div class="b-v">${x.into ? `${blkBtn(x.into)}${chain.length > 1 ? ` → ${chain.slice(1).map(blkBtn).join(' → ')}` : ''} → ` : ''}<strong>${esc(plant ? SD().plantLabel(plant.name) : x.plant || 'plant')}</strong>${km ? ` · ${km.toFixed(1)} km along the sewers` : ''}</div></div>
        <div class="b-row"><div class="b-k">Outlets</div><div class="b-v">${x.main >= 0 ? `Main: ${pipeBtn(x.main)} sewer, full-flow capacity ${fmtNum(P[x.main][2])} L/s, ${fmtNum(P[x.main][4])} people upstream (2021)` : 'No mapped sewer of 300 mm+ leaves the block'}${x.outs.length > 1 ? `<br><span class="muted small">${x.outs.length - 1} other pipe${x.outs.length === 2 ? ' leaves' : 's leave'} the block: ${x.outs.slice(1, 6).map(pipeBtn).join(', ')}${x.outs.length > 6 ? '…' : ''}</span>` : ''}</div></div>
        <div class="b-row"><div class="b-k">Upstream</div><div class="b-v">${x.direct.length ? `${x.direct.map(blkBtn).join(', ')} drain${x.direct.length === 1 ? 's' : ''} into it${x.up.length > x.direct.length ? ` (${x.up.length} blocks upstream in all)` : ''}` : 'None: a head-of-system block'}</div></div>
        <div class="b-row"><div class="b-k">Sewers</div><div class="b-v">${fmtNum(own)} Region sanitary mains of 300 mm+ inside the block</div></div>
        <div class="b-row"><div class="b-k">Growth</div><div class="b-v">${fmtNum(devs.length)} development site${devs.length === 1 ? '' : 's'}${gr ? ` · since the census: +${fmtNum(gr.built.units)} built, +${fmtNum(gr.approved.units)} approved / permitted, +${fmtNum(gr.proposed.units)} proposed units` : ''}${jb.jbuilt + jb.japproved + jb.jproposed ? ` · +${fmtNum(Math.round(jb.jbuilt + jb.japproved + jb.jproposed))} jobs` : ''}</div></div>
      </section>
      <p class="small muted">Blocks: Region of Peel <em>Block_view</em> feature service — the 40 sewersheds of its inflow &amp; infiltration (I&amp;I) program, as used in a 2024 conference paper on its inflow &amp; infiltration program; ★ / heavier outline = prioritised for a block study. Outlets and route: Region sanitary mains of 300 mm+ (each pipe's next pipe downstream); the main outlet is the one carrying the most people. Arrows follow the pipes to the plant; dashed = other outlets until they join.</p>` });
  }
  document.addEventListener('click', e => { const bb = e.target.closest('[data-block]'); if (bb) showBlock(bb.dataset.block); });
  // The block's I&I program facts, a fold of its scope's Overview (js/svc-scope.js panelSpec, cardHTML): what
  // the block's card said that the scope does not (its outlets on the existing sewers, the mains inside it,
  // the distance to the plant). '' until the blocks and the sewers are in: asked for once per block, then the
  // Overview redrawn if that block is still the scope. (worked out once per block: the Overview's panel and its
  // full table both ask, on every redraw)
  const factsAsked = new Set(), factsMemo = new Map();
  function blockFactsHTML(id) {
    if (id == null) return '';
    if (factsMemo.has(String(id))) return factsMemo.get(String(id));
    const net = blockNet(), x = net && net.byId.get(String(id));
    if (!net) {
      if (!factsAsked.has(String(id))) {
        factsAsked.add(String(id));
        Promise.all([loadBlocks(), SC().loadSewers()]).then(() => { const S = root.PeelSvcScope, s = S && S.current(); if (blockNet() && s && s.ref === S.blockRef(id) && root.PeelOverviewTab) root.PeelOverviewTab.renderOverview(); }).catch(() => {});
      }
      return '';
    }
    if (!x) return '';
    if (!App().state.servicing) return '';
    const b = x.b, P = MM().SEW.data.pipes, route = x.main >= 0 ? pipeRoute(x.main) : [], km = route.length ? routeKm(route) : 0;
    const plant = (App().state.servicing.meta.plants || []).find(p => p.name === x.plant);
    const pipeBtn = i => `<button type="button" class="btn small link" data-pipe="${i}">${P[i][0]} mm</button>`;
    const html = `<ul class="small ss-list">
      <li>${b.planning ? '<strong>Prioritised for a block study</strong> ★ · ' : ''}${fmtNum(b.ha)} ha · Region of Peel inflow &amp; infiltration program</li>
      <li><strong>Outlets</strong> ${x.main >= 0 ? `main: ${pipeBtn(x.main)} sewer, full-flow capacity ${fmtNum(P[x.main][2])} L/s, ${fmtNum(P[x.main][4])} people upstream (2021)` : 'no mapped sewer of 300 mm+ leaves the block'}${x.outs.length > 1 ? `; ${x.outs.length - 1} other pipe${x.outs.length === 2 ? ' leaves' : 's leave'} it: ${x.outs.slice(1, 6).map(pipeBtn).join(', ')}${x.outs.length > 6 ? '…' : ''}` : ''}</li>
      <li><strong>Sewers</strong> ${fmtNum(x.pipes.length)} Region sanitary mains of 300 mm+ inside the block</li>
      ${km ? `<li><strong>To the plant</strong> ${km.toFixed(1)} km along the sewers to ${esc(plant ? SD().plantLabel(plant.name) : x.plant || 'the plant')}</li>` : ''}
    </ul>
    <p class="small muted">Blocks: Region of Peel <em>Block_view</em> feature service, the 40 sewersheds of its inflow &amp; infiltration (I&amp;I) program; ★ = prioritised for a block study. Outlets: Region sanitary mains of 300 mm+ leaving the block (each pipe's next pipe downstream); the main outlet is the one carrying the most people.</p>`;
    factsMemo.set(String(id), html);
    return html;
  }

  const api = {
    svcFocus, focusSvc, drawFlowPath, addFlowMarker,
    getDevMode() { return devMode; },
    setDevMode(v) { devMode = v; },
    syncPathMode, addFlowDefs, pipeRoute, drawPipeRoute, TRACE, WTRACE,
    fitClear, clearTrace, dcSewerNet, dcSewerPath, traceDev, syncTraceSum,
    traceGlow,
    traceSummaryHTML, BLK, loadBlocks, blockAt, setBlocksLayer,
    clearBlockFocus, showBlock, blockFactsHTML,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSewerTrace = api;
})(typeof window !== 'undefined' ? window : globalThis);
