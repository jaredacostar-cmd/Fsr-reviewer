/* Where each development discharges — reviewed, and set by hand on the map (QA/QC › Review outlets).
 * The app sends a development's sewage into the nearest sanitary sewer of 300 mm or more (js/sewer-cap.js
 * sewerGrowth), or, off the existing network, along the planned DC mains (js/sewer-trace.js
 * dcSewerPath). A reviewer can confirm that outlet, or set another: an existing sewer, or a planned DC
 * main. Reviewed outlets: data/dev-outlets.json (committed) plus this browser's edits (store
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
  const DI = () => root.PeelDcInfra, MP = () => root.PeelMasterPlan, IM = () => root.PeelDcImpact;
  const r6 = p => [Math.round(p[0] * 1e6) / 1e6, Math.round(p[1] * 1e6) / 1e6];
  const today = () => new Date().toISOString().slice(0, 10);

  // ---- Pure: the records ----------------------------------------------------------------------------
  // A record: { key, sys, mode: 'confirmed' | 'set', kind: 'sewer' | 'dc', at: [lng, lat], mm, project,
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
    return { version: 1, note: 'Reviewed development outlets (js/dev-outlets.js, QA/QC › Review outlets). key: the development; sys: wastewater (or water); mode: confirmed (the automatic outlet, checked) or set (by hand); kind: sewer (an existing sanitary sewer) or dc (a planned DC main); at: the point it joins; mm: that pipe\'s size; project: the DC project; src: what says so; date: when.',
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
  function pipeFor(p) {
    const r = recordOf(p); if (!r || r.mode !== 'set' || !r.at || !SC() || !MM().SEW.data) return null;
    if (pipeCache.has(p.key)) return pipeCache.get(p.key);
    let k = null;
    if (r.kind === 'dc') { const path = ST() && ST().dcSewerPath({ lng: r.at[0], lat: r.at[1] }); k = path ? path.exit : null; }
    else { let s = SC().nearestPipe(r.at[0], r.at[1], 15, r.mm || 0); if (s < 0) s = SC().nearestPipe(r.at[0], r.at[1], 15); k = s >= 0 ? s : null; }
    pipeCache.set(p.key, k);
    return k;
  }
  // A set outlet's route along the planned mains (tier A in js/dc-impact.js), or 'sewer': set onto an
  // existing sewer (no planned main needed to connect), or null: none set.
  function dcRouteFor(p) {
    const r = recordOf(p); if (!r || r.mode !== 'set') return null;
    if (r.kind !== 'dc') return 'sewer';
    return ST() && ST().dcSewerPath({ lng: r.at[0], lat: r.at[1] });
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
    if (cand.kind === 'dc') { const path = ST().dcSewerPath({ lng: cand.at[0], lat: cand.at[1] }); if (path) { for (const ln of [path.first, ...path.lines]) add(ln.p || ln.c, 'A'); k = path.exit; } }
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
  // A tap on the map while picking: the nearest existing sewer (300 mm+) or planned DC main within r metres.
  function pickAt(lng, lat, r) {
    if (S.mode !== 'pick') return;
    const pt = [lng, lat], k = SC().nearestPipe(lng, lat, r), dc = DI().dcNearest('wastewater', pt, r);
    const mk = k >= 0 ? DI().dcDist(pt, SC().pipeCoords(MM().SEW.data.pipes[k])) : Infinity;
    if (k < 0 && !dc) { if (U.toast) U.toast('No sewer or planned main there: tap closer to one'); return; }
    if (dc && dc.m < mk) {
      const g = dc.ln.g, near = g.reduce((b, v) => (DI().dcM(v, pt) < DI().dcM(b, pt) ? v : b), g[0]);
      S.cand = { kind: 'dc', at: r6(near), mm: dc.ln.d || null, project: dc.ln.p || dc.ln.c, label: `${dc.ln.d ? `${dc.ln.d} mm ` : ''}planned DC main ${dc.ln.p || dc.ln.c}` };
    } else {
      const c = SC().pipeCoords(MM().SEW.data.pipes[k]), q = nearestOn(pt, c);
      S.cand = { kind: 'sewer', k, at: r6(q), mm: MM().SEW.data.pipes[k][0], label: `${MM().SEW.data.pipes[k][0]} mm sanitary sewer` };
    }
    S.mode = 'preview'; refresh();
  }
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

  const api = { merge, exportJSON, diff, load, recordOf, pipeFor, dcRouteFor, version, queue, selected, projectsFor, pickAt, nearestOn, recText, state: S, edits: () => O.edits.length, records: () => recs, setRecord, backToAuto };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevOutlets = api;
})(typeof window !== 'undefined' ? window : globalThis);
