/* Where each development discharges — reviewed, and set by hand on the map (QA/QC › Review outlets).
 * The app sends a development's sewage into the nearest sanitary sewer of 300 mm or more (js/sewer-cap.js
 * sewerGrowth), or, off the existing network, along the planned DC mains (js/sewer-trace.js
 * dcSewerPath). A reviewer can confirm that outlet, or set another: an existing sewer, or a planned DC
 * main, or a sewer being built (a capital project's new sewer, js/dc-joins.js capLines). Reviewed outlets: data/dev-outlets.json (committed) plus this browser's edits (store
 * 'devOutletEdits'), by development key and system. An outlet is kept as a point and the pipe's size,
 * not a pipe number, so it survives a rebuild of the sewer data. The load model, the trace and the DC
 * impact model (js/dc-impact.js) follow a set outlet; every place that shows it says it was set by hand.
 * Water (the main a development connects to) uses the same records with sys 'water' (next step).
 */
(function (root) {
  'use strict';

  const U = root.PeelUtil || {};
  const store = U.store || { get: (k, d) => d, set() {} };
  const App = () => root.PeelApp, MM = () => root.PeelMapMarkers, SC = () => root.PeelSewerCap, ST = () => root.PeelSewerTrace;
  const DI = () => root.PeelDcInfra, MP = () => root.PeelMasterPlan, IM = () => root.PeelDcImpact, DJ = () => root.PeelDcJoins, CEM = () => root.PeelCapitalEAModel;
  const r6 = p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  const today = () => new Date().toISOString().slice(0, 10);

  // ---- Pure: the records ----------------------------------------------------------------------------
  // A record: { key, sys, mode: 'confirmed' | 'set', kind: 'sewer' | 'dc' | 'cap', at: [lng, lat], mm, project,
  // src, by, date }. A local edit with auto: true drops a committed record (back to the automatic outlet).
  const idOf = r => `${r.sys || 'wastewater'}|${r.key}`;
  function merge(shipped, edits) {
    const out = new Map();
    for (const r of shipped || []) out.set(idOf(r), r);
    for (const e of edits || []) { if (e.auto) out.delete(idOf(e)); else out.set(idOf(e), e); }
    return out;
  }
  // The committed file, from the merged records (local marks dropped).
  function exportJSON(recs) {
    return { version: 1, note: 'Reviewed development outlets (js/dev-outlets.js, QA/QC › Review outlets). key: the development; sys: wastewater (or water); mode: confirmed (the automatic outlet, checked) or set (by hand); kind: sewer (an existing sanitary sewer), cap (a sewer being built: a capital project) or dc (a planned DC main); at: the point it joins; mm: that pipe\'s size; project: the DC project (or the capital project); src: what says so; date: when.',
      outlets: [...recs.values()].map(({ key, sys, mode, kind, at, mm, project, src, by, date }) => ({ key, sys: sys || 'wastewater', mode, ...(kind ? { kind } : {}), ...(at ? { at } : {}), ...(mm ? { mm } : {}), ...(project ? { project } : {}), ...(src ? { src } : {}), ...(by ? { by } : {}), ...(date ? { date } : {}) })) };
  }
  // Which projects a candidate puts on the path and what that does to the gate: { add, drop, gate }.
  // now / then: [{ key, tier, y }]; gating tiers count for the gate.
  function diff(now, then, gating = ['A', 'B1']) {
    const has = (list, k) => list.some(x => x.key === k);
    const gate = list => Math.max(0, ...list.filter(x => gating.includes(x.tier) && x.y).map(x => x.y)) || null;
    return { add: then.filter(x => !has(now, x.key)), drop: now.filter(x => !has(then, x.key)), gate: gate(then), gateNow: gate(now) };
  }

  // ---- State ----------------------------------------------------------------------------------------
  const O = { shipped: [], edits: store.get('devOutletEdits', []), v: 1, loading: null };
  let recs = merge(O.shipped, O.edits);
  const changed = () => { recs = merge(O.shipped, O.edits); O.v++; store.set('devOutletEdits', O.edits); pipeCache.clear(); };
  function load() {
    if (O.loading) return O.loading;
    const get = u => (typeof fetch === 'function' ? fetch(u).then(r => (r.ok ? r.json() : null)).catch(() => null) : Promise.resolve(null));
    if (DJ() && DJ().load) DJ().load().then(refresh);     // (the capital projects' new sewers)
    O.loading = get('data/dev-outlets.json').then(d => { if (d && Array.isArray(d.outlets)) O.shipped = d.outlets; recs = merge(O.shipped, O.edits); O.v++; pipeCache.clear(); refresh(); return d; });
    return O.loading;
  }
  const recordOf = (p, sys = 'wastewater') => (p ? recs.get(`${sys}|${p.key}`) || null : null);
  const setRecord = (p, rec, sys = 'wastewater') => {
    O.edits = O.edits.filter(e => idOf(e) !== `${sys}|${p.key}`);
    O.edits.push({ key: p.key, sys, ...rec, date: today(), local: true });
    changed(); refresh();
  };
  const backToAuto = (p, sys = 'wastewater') => {
    O.edits = O.edits.filter(e => idOf(e) !== `${sys}|${p.key}`);
    if (O.shipped.some(r => idOf(r) === `${sys}|${p.key}`)) O.edits.push({ key: p.key, sys, auto: true, date: today(), local: true });
    changed(); refresh();
  };

  // ---- A set outlet, for the models ----------------------------------------------------------------
  // The existing pipe a set outlet joins: the nearest pipe to its point (within 15 m), the same size where
  // there is one; a planned-main outlet joins the existing network where its route along the planned mains
  // leaves them (dcSewerPath's exit). null: no set outlet, or nothing found (the automatic one applies).
  const pipeCache = new Map();
  // The route from an outlet point along the planned mains (dc), or along the sewer being built and on (cap).
  const routeFrom = (kind, at) => (ST() ? ST().dcSewerPath({ lng: at[0], lat: at[1] }, { cap: kind === 'cap' }) : null);
  function pipeFor(p) {
    const r = recordOf(p); if (!r || r.mode !== 'set' || !r.at || !SC() || !MM().SEW.data) return null;
    if (pipeCache.has(p.key)) return pipeCache.get(p.key);
    let k = null;
    const path = r.kind === 'dc' || r.kind === 'cap' ? routeFrom(r.kind, r.at) : null;
    if (path) k = path.exit;
    else if (r.kind === 'dc') k = null;
    // (a sewer being built with no route traced on from it: the existing sewer nearest where it was set)
    else if (r.kind === 'cap') { const s = SC().nearestPipe(r.at[0], r.at[1], 600); k = s >= 0 ? s : null; }
    else { let s = SC().nearestPipe(r.at[0], r.at[1], 15, r.mm || 0); if (s < 0) s = SC().nearestPipe(r.at[0], r.at[1], 15); k = s >= 0 ? s : null; }
    pipeCache.set(p.key, k);
    return k;
  }
  // A set outlet's route along the planned mains (tier A in js/dc-impact.js), or 'sewer': set onto an
  // existing sewer (no planned main needed to connect), or null: none set. A sewer being built: its
  // route on from it (a planned main downstream still counts), else 'sewer' (it joins the existing ones).
  function dcRouteFor(p) {
    const r = recordOf(p); if (!r || r.mode !== 'set') return null;
    if (r.kind === 'sewer') return 'sewer';
    return routeFrom(r.kind, r.at) || (r.kind === 'cap' ? 'sewer' : null);
  }
  const version = () => O.v;

  // ---- The page: queue, selection, pick, preview --------------------------------------------------
  const S = { sel: store.get('dvoSel', null), mode: 'idle', cand: null, src: '', filter: store.get('dvoFilter', 'all'), all: false };
  const projectsAlong = k => {
    const pipes = MM().SEW.data.pipes, keys = new Set();
    for (let j = k, h = 0; j != null && j >= 0 && h < 3000; j = pipes[j][3], h++) { const ln = MP().pipeReliefOf(j); if (ln) keys.add(ln.p || ln.c); }
    return keys;
  };
  // The projects an outlet puts on the path: [{ key, tier, y }].
  function projectsFor(cand) {
    const m = IM().model(); if (!m || !cand) return [];
    const out = [], seen = new Set();
    const add = (key, tier) => { if (seen.has(key)) return; seen.add(key); const pr = m.projects.get(`wastewater:${key}`); out.push({ key, tier, y: pr ? pr.y1 : null }); };
    let k = cand.k;
    if (cand.kind === 'dc' || cand.kind === 'cap') {
      const path = routeFrom(cand.kind, cand.at);
      // (a capital project's sewer on the route is not a DC project)
      if (path) { for (const ln of [path.first, ...path.lines]) if (!ln.cap) add(ln.p || ln.c, 'A'); k = path.exit; }
      else if (cand.kind === 'cap') k = SC().nearestPipe(cand.at[0], cand.at[1], 600);
    }
    if (k != null && k >= 0) for (const key of projectsAlong(k)) { const pr = m.projects.get(`wastewater:${key}`); add(key, pr && pr.relieves && pr.relieves.status !== 'ok' ? 'B1' : 'B2'); }
    return out;
  }
  // The queue: developments relying on a DC project (needs it to connect, or for capacity), largest first.
  function queue() {
    const m = IM() && IM().model(); if (!m) return null;
    // (wastewater: a development relying only on a water project has no outlet to review here)
    const units = new Map();
    for (const pr of m.projects.values()) if (pr.sys === 'wastewater') for (const x of pr.devs) if (m.gateTiers.includes(x.tier)) units.set(x.p.key, x.units);
    const rows = [...m.byDev.values()].filter(r => units.has(r.p.key)).map(r => {
      const links = r.links.filter(l => l.sys === 'wastewater'), gate = IM().gateOf(links, m.gateTiers);
      return { r, p: r.p, units: units.get(r.p.key) || 0, rec: recordOf(r.p), links, gate, first: r.first, gap: IM().gapOf(r.first, gate) };
    });
    const f = { all: () => true, gap: x => x.gap, todo: x => !x.rec, done: x => !!x.rec }[S.filter] || (() => true);
    return { all: rows, rows: rows.filter(f).sort((a, b) => b.units - a.units) };
  }
  const selected = () => { const q = queue(); if (!q) return null; return (S.sel && q.all.find(x => x.p.key === S.sel)) || q.rows[0] || null; };
  // A candidate outlet: a point on an existing sewer (pipe k) or on a planned DC main (line ln).
  function sewerCand(k, pt, street) {
    const pp = MM().SEW.data.pipes[k], at = r6(nearestOn(pt, SC().pipeCoords(pp)));
    return { kind: 'sewer', k, at, mm: pp[0], status: 'existing', label: `${pp[0]} mm sanitary sewer${street ? ` on ${street}` : ''}` };
  }
  // (a planned main says how far it is built where the capital records match it: js/capital-ea-model.js)
  const BUILD_WORD = { tendered: 'tendered', awarded: 'awarded', 'under construction': 'under construction', 'substantially complete': 'built', complete: 'built' };
  let capIdx = null, capIdxFor = null;
  function dcStatus(proj) {
    const cap = App() && App().state.capital, dc = App() && App().state.dcInfra;
    if (!cap || !dc || !CEM()) return null;
    if (capIdxFor !== cap) { capIdx = CEM().dcCapitalIndex(cap, dc); capIdxFor = cap; }
    const e = capIdx.get(proj); if (!e || e.conf === 'low' || !BUILD_WORD[e.status]) return null;
    return e.status === 'under construction' && e.percent != null ? `${e.percent}% built` : BUILD_WORD[e.status];
  }
  function dcCand(ln, pt) {
    const proj = ln.p || ln.c, st = dcStatus(proj);
    return { kind: 'dc', at: r6(nearestOn(pt, ln.g)), mm: ln.d || null, project: proj, status: st ? `planned · ${st}` : 'planned', label: `${ln.d ? `${ln.d} mm ` : ''}planned DC main ${proj}` };
  }
  // A capital project's new sewer (tendered or further: js/dc-joins.js capLines).
  const capWord = s => (/complete/.test(s) ? 'recently built' : s);
  function capCand(ln, pt) {
    const street = ln.n ? String(ln.n).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()) : '';
    return { kind: 'cap', at: r6(nearestOn(pt, ln.g)), mm: null, project: ln.p, status: capWord(ln.s), label: `New sanitary sewer${street ? ` on ${street}` : ''} (${ln.p})` };
  }
  // A tap on the map while picking: the nearest existing sewer or planned DC main within r metres.
  function pickAt(lng, lat, r) {
    if (S.mode !== 'pick' && S.mode !== 'preview') return;
    const pt = [lng, lat], k = SC().nearestPipe(lng, lat, r), dc = DI().dcNearest('wastewater', pt, r), cp = capNear(pt, r)[0];
    const opts = [k >= 0 ? { m: DI().dcDist(pt, SC().pipeCoords(MM().SEW.data.pipes[k])), c: () => sewerCand(k, pt) } : null,
      dc ? { m: dc.m, c: () => dcCand(dc.ln, pt) } : null, cp ? { m: cp.m, c: () => capCand(cp.ln, pt) } : null].filter(Boolean).sort((a, b) => a.m - b.m);
    if (!opts.length) { if (U.toast) U.toast('No sewer or planned main there: tap closer to one'); return; }
    S.cand = opts[0].c();
    S.mode = 'preview'; refresh();
  }
  // Keep the nearest of each run: items sorted by distance; sameRun(a, b) says two are one sewer (or one
  // project), so the list shows each pipe once, not every length of it.
  function distinct(items, sameRun, max = Infinity) {
    const out = [];
    for (const it of items) { if (out.length >= max) break; if (!out.some(o => sameRun(o, it))) out.push(it); }
    return out;
  }
  // The infrastructure near a development, to pick its outlet from: existing sanitary sewers (any size:
  // a site can connect to a local sewer) and planned DC mains within r metres, nearest first, each sewer
  // run and each DC project once. Each: a candidate (as a tap makes) plus m, its distance from the site.
  const nearCache = { key: null, list: [] };
  // The capital projects' new sewers within r metres, nearest first ({ ln, m }); a built one already in
  // the sewer data (an existing sewer within 10 m of its middle) is left out: it is listed as existing.
  function capNear(pt, r) {
    if (!DJ() || !DJ().capReady || !DJ().capReady()) return [];
    const out = [];
    for (const ln of DJ().capLines('wastewater')) {
      const m = DI().dcDist(pt, ln.g); if (m > r) continue;
      if (/complete/.test(ln.s)) { const mid = ln.g[Math.floor(ln.g.length / 2)]; if (SC().nearestPipe(mid[0], mid[1], 10) >= 0) continue; }
      out.push({ ln, m });
    }
    return out.sort((a, b) => a.m - b.m);
  }
  function nearby(p, { r = 400, sewers = 6, mains = 4, streetOf = null } = {}) {     // (mains: of each, planned and being built)
    if (!p || p.lat == null || !MM().SEW.data || !MM().SEW.grid) return [];
    const key = `${p.key}|${r}|${O.v}|${App() && App().state.dcInfra ? 1 : 0}|${App() && App().state.addressPoints ? 1 : 0}|${DJ() && DJ().capReady && DJ().capReady() ? 1 : 0}|${App() && App().state.capital ? 1 : 0}`; // (street names arrive later)
    if (nearCache.key === key) return nearCache.list;
    const pt = [p.lng, p.lat], pipes = MM().SEW.data.pipes, grid = MM().SEW.grid;
    const gx = Math.floor(pt[0] / 0.004), gy = Math.floor(pt[1] / 0.003), R = Math.ceil(r / 300), seen = new Set(), sw = [];
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const k of grid.get(`${gx + i},${gy + j}`) || []) {
      if (seen.has(k)) continue; seen.add(k);
      const m = DI().dcDist(pt, SC().pipeCoords(pipes[k])); if (m <= r) sw.push({ k, m });
    }
    sw.sort((a, b) => a.m - b.m);
    // (one sewer: the same size, one a few lengths downstream of the other)
    const down = (a, b) => { for (let j = pipes[a][3], h = 0; j != null && j >= 0 && h < 8; j = pipes[j][3], h++) if (j === b) return true; return false; };
    // (or the same size on the same street: twin lengths the network doesn't join)
    const named = sw.map(x => { const c = sewerCand(x.k, pt), st = streetOf ? streetOf(c.at[0], c.at[1]) : ''; return { ...(st ? sewerCand(x.k, pt, st) : c), st, m: x.m }; });
    const sameSewer = (a, b) => a.mm === b.mm && ((a.st && a.st === b.st) || down(a.k, b.k) || down(b.k, a.k));
    const out = distinct(named, sameSewer, sewers).map(({ st, ...c }) => c);
    const di = App() && App().state.dcInfra;
    if (di) {
      const dl = di.wastewater.lines.map(ln => ({ ln, m: DI().dcDist(pt, ln.g) })).filter(x => x.m <= r).sort((a, b) => a.m - b.m);
      for (const x of distinct(dl, (a, b) => (a.ln.p || a.ln.c) === (b.ln.p || b.ln.c), mains)) out.push({ ...dcCand(x.ln, pt), m: x.m });
    }
    for (const x of distinct(capNear(pt, r), (a, b) => a.ln.p === b.ln.p, mains)) out.push({ ...capCand(x.ln, pt), m: x.m });
    out.sort((a, b) => a.m - b.m);
    nearCache.key = key; nearCache.list = out;
    return out;
  }
  // Two candidates on the same pipe (sewer) or the same project (planned main).
  const sameOutlet = (a, b) => !!a && !!b && a.kind === b.kind && (a.kind === 'sewer' ? a.k === b.k : a.project === b.project);
  // Is a candidate the outlet in use now? (cur: { k, path } as the page shows it)
  const isCurrent = (c, cur) => !!cur && (c.kind === 'sewer' ? !cur.path && cur.k === c.k : !!(cur.path && !!cur.path.first.cap === (c.kind === 'cap') && (cur.path.first.p || cur.path.first.c) === c.project));
  // The nearest point on a polyline (flat, local).
  function nearestOn(pt, g) {
    const kx = Math.cos(pt[1] * Math.PI / 180); let best = g[0], bd = Infinity;
    for (let i = 1; i < g.length; i++) {
      const [ax, ay] = g[i - 1], [bx, by] = g[i], dx = (bx - ax) * kx, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, (((pt[0] - ax) * kx) * dx + (pt[1] - ay) * dy) / L)) : 0, q = [ax + t * (bx - ax), ay + t * (by - ay)];
      const d = Math.hypot((q[0] - pt[0]) * kx, q[1] - pt[1]); if (d < bd) { bd = d; best = q; }
    }
    return best;
  }
  function download() {
    const E = root.PeelExports; if (E && E.download) E.download('dev-outlets.json', JSON.stringify(exportJSON(recs), null, 1), 'application/json');
  }
  // (the page re-renders; the models re-run on their next read: their keys carry version())
  function refresh() {
    const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.page && W.page() === 'outlets' && W.renderPage) W.renderPage(true);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-dvo]'); if (!t) return;
      const [act, arg] = String(t.dataset.dvo).split(':'), cur = selected(), p = cur && cur.p;
      if (act === 'pick-dev') { S.sel = t.dataset.dvoKey; store.set('dvoSel', S.sel); S.mode = 'idle'; S.cand = null; refresh(); }
      else if (act === 'filter') { S.filter = arg; store.set('dvoFilter', arg); refresh(); }
      else if (act === 'all') { S.all = !S.all; refresh(); }
      else if (!p) return;
      else if (act === 'start') { S.mode = 'pick'; S.cand = null; refresh(); }
      else if (act === 'near') { const c = nearCache.list[+arg]; if (c) { S.cand = c; S.mode = 'preview'; refresh(); } }
      else if (act === 'cancel') { S.mode = 'idle'; S.cand = null; refresh(); }
      else if (act === 'save' && S.cand) { const src = (document.querySelector('[data-dvo-src]') || {}).value || ''; setRecord(p, { mode: 'set', kind: S.cand.kind, at: S.cand.at, mm: S.cand.mm, ...(S.cand.project ? { project: S.cand.project } : {}), ...(src ? { src } : {}) }); S.mode = 'idle'; S.cand = null; refresh(); }
      else if (act === 'confirm') { const src = (document.querySelector('[data-dvo-src]') || {}).value || ''; setRecord(p, { mode: 'confirmed', ...(src ? { src } : {}) }); }
      else if (act === 'auto') backToAuto(p);
      else if (act === 'export') download();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.mode !== 'idle') { S.mode = 'idle'; S.cand = null; refresh(); } });
  }
  // How a record reads wherever the outlet is used.
  const recText = r => (!r ? '' : `${r.mode === 'set' ? 'outlet set by hand' : 'outlet confirmed'}${r.src ? ` · ${r.src}` : ''}${r.date ? ` · ${r.date}` : ''}${r.local ? ' (this browser)' : ''}`);

  const api = { merge, exportJSON, diff, load, recordOf, pipeFor, dcRouteFor, version, queue, selected, projectsFor, pickAt, routeFrom, nearby, distinct, isCurrent, sameOutlet, nearestOn, recText, state: S, edits: () => O.edits.length, records: () => recs, setRecord, backToAuto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevOutlets = api;
})(typeof window !== 'undefined' ? window : globalThis);
