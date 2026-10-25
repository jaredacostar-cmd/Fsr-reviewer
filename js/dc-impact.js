/* Peel Growth Pipeline (unofficial) – which developments each DC project affects.
 *
 * The allocation of docs/dc-impact/ALLOCATION.md: each development in the pipeline is allocated to
 * the planned DC works it relies on, by tier:
 *   A  needs it to connect: outside the existing sewers, its route to one runs along the planned
 *      main (js/sewer-trace.js dcSewerPath); water: the planned main it would connect to, outside
 *      the mapped pressure zones;
 *   B  on its path: it drains through an existing sewer the main relieves (js/dc-relief.js), i.e.
 *      its pipe's downstream chain reaches one of them. As in the DC main's panel
 *      (js/masterplan.js devsOfDcHTML): B1, needed, where that sewer runs short (its constraint's
 *      status is not 'ok'); B2, on the path only, where it has room to build-out or has no
 *      capacity to compare. B1 gates and shares the cost; B2 is shown, never counted;
 *   C  same sewershed: in the catchment the main serves or upstream of it, not on its path (counts
 *      only, context).
 * Developments built since the census are counted apart (context), never in a tier. Each development
 * gets a gate year (the latest construction year of the projects it relies on, in opts.gateTiers:
 * A and B1),
 * its first-homes year (the forecast's first year with homes; under construction: this year), and a
 * timing gap when the first homes come before the gate. A project's DC cost is apportioned across
 * its developments in the gating tiers by peak flow.
 *
 * Pure helpers (no DOM) are exported for node tests; model() reads the app's state.
 */
(function (root) {
  'use strict';

  // ---- Pure helpers ------------------------------------------------------------------------------
  const projectKey = ln => ln.p || ln.c || null;

  /** DC lines grouped by project: [{ key, sys, k (largest kind), d (largest), y0, y1, lenM, status, lines }]. dist(a, b): metres. */
  function groupProjects(dcInfra, dist) {
    const out = [], RANK = { primary: 3, transmission: 3, force: 2, feeder: 1, local: 1 };
    for (const sys of ['wastewater', 'water']) {
      const by = new Map();
      for (const ln of (dcInfra && dcInfra[sys] && dcInfra[sys].lines) || []) {
        const key = projectKey(ln); if (!key) continue;
        let g = by.get(key);
        if (!g) { g = { key, sys, k: ln.k, d: 0, y0: null, y1: null, lenM: 0, status: ln.s, lines: [] }; by.set(key, g); out.push(g); }
        g.lines.push(ln);
        if ((RANK[ln.k] || 0) > (RANK[g.k] || 0)) g.k = ln.k;
        g.d = Math.max(g.d, ln.d || 0);
        if (ln.y) { g.y0 = g.y0 == null ? ln.y : Math.min(g.y0, ln.y); g.y1 = g.y1 == null ? ln.y : Math.max(g.y1, ln.y); }
        if (ln.s === 'approved') g.status = 'approved';
        for (let i = 1; i < ln.g.length; i++) g.lenM += dist(ln.g[i - 1], ln.g[i]);
      }
    }
    return out;
  }

  /**
   * Every pipe whose downstream chain reaches a member pipe: a Uint8Array, 1 = upstream of (or one of)
   * the members. next(i): the pipe i drains into (< 0 at the end). One pass, memoised; cycles end the
   * walk as "not upstream".
   */
  function markUpstream(n, next, members) {
    const mark = new Uint8Array(n);   // 0 unknown, 1 reaches a member, 2 does not, 3 on the current walk
    for (const i of members) if (i >= 0 && i < n) mark[i] = 1;
    const path = [];
    for (let s = 0; s < n; s++) {
      if (mark[s]) continue;
      path.length = 0;
      let j = s;
      while (j >= 0 && j < n && !mark[j]) { mark[j] = 3; path.push(j); j = next(j); }
      const r = j >= 0 && j < n && mark[j] === 1 ? 1 : 2;
      for (const k of path) mark[k] = r;
    }
    for (let i = 0; i < n; i++) if (mark[i] !== 1) mark[i] = 0;
    return mark;
  }

  /** The gate: the latest construction year among links in the given tiers ({ key, tier, y }), with its project; null when none. */
  function gateOf(links, tiers = ['A', 'B1']) {
    let best = null;
    for (const l of links) if (tiers.includes(l.tier) && l.y && (!best || l.y > best.y)) best = { y: l.y, key: l.key };
    return best;
  }

  /** A timing gap: the first homes come before the gate year. */
  const gapOf = (firstYear, gate) => !!(firstYear && gate && firstYear < gate.y);

  /** A project's cost apportioned by flow: rows [{ q }] → shares (same order) summing to cost. */
  function flowShares(rows, cost) {
    const tot = rows.reduce((t, r) => t + Math.max(0, r.q || 0), 0);
    if (!(cost > 0)) return rows.map(() => 0);
    if (!(tot > 0)) return rows.map(() => cost / Math.max(1, rows.length));
    return rows.map(r => cost * Math.max(0, r.q || 0) / tot);
  }

  // ---- The model, from the app's state -------------------------------------------------------------
  const W = () => (typeof window !== 'undefined' ? window : root);
  const App = () => W().PeelApp, MM = () => W().PeelMapMarkers, SC = () => W().PeelSewerCap, ST = () => W().PeelSewerTrace;
  const DI = () => W().PeelDcInfra, MP = () => W().PeelMasterPlan, SD = () => W().PeelSvcData, SvcTab = () => W().PeelSvcTab;
  const D = () => W().PeelDemand, DC = () => W().PeelDcCost, TM = () => W().PeelTiming;
  const IN = new Set(['approved', 'proposed']);
  const M = { key: null, res: null };
  const DEFAULTS = { gateTiers: ['A', 'B1'] };

  // First-homes year per development: the forecast's first year with homes (likely band).
  function firstYears() {
    const out = new Map();
    try { const fm = TM().forecastModel(); for (const [k, s] of fm.ss.sched) { const ys = Object.keys(s.likely || {}).map(Number).sort((a, b) => a - b); if (ys.length) out.set(k, ys[0]); } } catch (e) { /* no forecast: no years */ }
    return out;
  }
  const ready = () => { const s = App() && App().state; return !!(s && s.dcInfra && s.servicing && s.svcModel && MM() && MM().SEW && MM().SEW.data); };
  // (the scenario, the developments loaded, the gating tiers and the reviewed outlets: a change re-runs it)
  const keyOf = o => { const DO = W().PeelDevOutlets; return [MP().scenarioKey(), App().state.projects.length, o.gateTiers.join(''), DO ? DO.version() : 0].join('|'); };

  /**
   * The allocation for the current scenario, or null until the DC program, the servicing model and
   * the sewers are loaded. → { projects: Map key → project (+ devs [{ p, tier, how, e, q, units, pop,
   * share }], built, builtUnits, shed, shedUnits, cost), byDev: Map devKey → { p, links, gate, first,
   * gap }, gateTiers }.
   */
  function model(opts = {}) {
    if (!ready()) return null;
    const o = { ...DEFAULTS, ...opts }, k = keyOf(o), DO = W().PeelDevOutlets;
    if (M.key === k && M.res) return M.res;
    const st = App().state, pipes = MM().SEW.data.pipes, N = pipes.length, THIS = MM().THIS_YEAR;
    const est = p => D().estimate([p], st.criteria, 'all', App().jobsOf);
    const projects = new Map(groupProjects(st.dcInfra, DI().dcM).map(g => [`${g.sys}:${g.key}`, { ...g, devs: [], built: 0, builtUnits: 0, shed: 0, shedUnits: 0, cost: null }]));
    // Developments: in the pipeline (or built since the census, for context), with an estimate.
    const devs = [];
    for (const p of st.projects) {
      const lay = MM().svcLayerOf(p); if ((!IN.has(lay) && lay !== 'built') || p.lat == null) continue;
      const e = est(p); if (!(e.totalUnits > 0 || e.employment.jobs > 0)) continue;
      devs.push({ p, lay, e });
    }
    const add = (pk, d, tier, how, sys) => {
      const pr = projects.get(`${sys}:${pk}`); if (!pr) return false;
      if (d.lay === 'built') { pr.built++; pr.builtUnits += d.e.totalUnits || 0; return true; }
      if (pr.devs.some(x => x.p === d.p)) return true;
      const q = sys === 'wastewater' ? d.e.combined.wastewater.wetPeak : d.e.combined.water.maxDay;
      pr.devs.push({ p: d.p, tier, how, e: d.e, q, units: d.e.totalUnits || 0, pop: d.e.population + d.e.employment.jobs });
      return true;
    };
    // Tier A, wastewater: off the existing sewers, along the planned mains (dcSewerPath).
    // (an outlet set by hand, js/dev-outlets.js: onto an existing sewer, no planned main to connect;
    // onto a planned main, its route from there)
    for (const d of devs) {
      const setR = DO ? DO.dcRouteFor(d.p) : null; if (setR === 'sewer') continue;
      if (!setR && d.p.dr && d.p.dr.length) continue;
      const path = setR || ST().dcSewerPath(d.p); if (!path) continue;
      for (const ln of new Set([path.first, ...path.lines])) add(projectKey(ln), d, 'A', { joinM: path.joinM, km: path.km }, 'wastewater');
    }
    // Tier A, water: outside the mapped pressure zones, the planned main within 1 km.
    for (const d of devs) {
      if (d.p.pz && d.p.pz.length) continue;
      const n = DI().dcNearest('water', [d.p.lng, d.p.lat], DI().DC_CONNECT_M);
      if (n) add(projectKey(n.ln), d, 'A', { joinM: n.m }, 'water');
    }
    // Tier B: upstream of the existing sewers each project relieves; B1 where they run short, as the
    // DC main's panel says (its sewer group from dcItemCons: the members and the tightest pipe's status).
    const members = new Map();
    for (let i = 0; i < N; i++) { const ln = MP().pipeReliefOf(i); if (ln) { const pk = projectKey(ln); (members.get(pk) || members.set(pk, []).get(pk)).push(i); } }
    const devPipe = SC().sewerGrowth().devPipe, next = i => pipes[i][3];
    for (const [pk, mem] of members) {
      const pr = projects.get(`wastewater:${pk}`); if (!pr) continue;
      const grp = MP().dcItemCons({ ln: pr.lines[0] }).find(c => c.members);
      const tier = grp && grp.status !== 'ok' ? 'B1' : 'B2';
      pr.relieves = grp ? { name: grp.name, status: grp.status } : null;
      const mark = markUpstream(N, next, grp ? grp.members : mem);
      for (const d of devs) { const i = devPipe.get(d.p); if (i != null && i >= 0 && mark[i]) add(pk, d, tier, { pipe: i, mm: pipes[i][0] }, 'wastewater'); }
    }
    // Tier C (counts): the catchment a main serves and those upstream of it, or the zone it serves.
    const tree = SvcTab().svcFlowTree();
    for (const pr of projects.values()) {
      const tg = DI().dcTarget(pr.lines[0]); if (!tg) continue;
      const ids = new Set(pr.sys === 'wastewater' ? [tg, ...SvcTab().upstreamOf(tg, tree).map(u => u.id)] : [tg]);
      const seen = new Set(pr.devs.map(x => x.p));
      for (const d of devs) if (d.lay !== 'built' && !seen.has(d.p) && SD().svcIds(d.p, pr.sys === 'wastewater' ? 'dr' : 'pz').some(x => ids.has(x))) { pr.shed++; pr.shedUnits += d.e.totalUnits || 0; }
    }
    // Cost (DC-recoverable 2026$) and its flow shares (the gating tiers; B2 carries none).
    for (const pr of projects.values()) {
      const c = DC() && DC().costEstimate ? DC().costEstimate(MP().lineRelief(pr.lines[0])) : null;
      pr.cost = c ? c.dc : null; pr.costEst = c ? c.est : null;
      const counted = pr.devs.filter(x => o.gateTiers.includes(x.tier)), sh = flowShares(counted, pr.cost || 0);
      pr.devs.forEach(x => { x.share = 0; }); counted.forEach((x, i) => { x.share = sh[i]; });
    }
    // Per development: its links, gate, first homes and gap.
    const first = firstYears(), byDev = new Map();
    for (const pr of projects.values()) for (const x of pr.devs) {
      const r = byDev.get(x.p.key) || byDev.set(x.p.key, { p: x.p, links: [] }).get(x.p.key);
      r.links.push({ key: pr.key, sys: pr.sys, tier: x.tier, y: pr.y1, share: x.share });
    }
    for (const r of byDev.values()) {
      r.gate = gateOf(r.links, o.gateTiers);
      r.first = r.p.phase === 'construction' ? THIS : first.get(r.p.key) || null;
      r.gap = gapOf(r.first, r.gate);
      r.cost = r.links.reduce((t, l) => t + (l.share || 0), 0);
    }
    // A project's gaps: developments relying on it (gating tiers) whose first homes come before it is finished.
    for (const pr of projects.values()) pr.gaps = pr.devs.filter(x => { const r = byDev.get(x.p.key); return o.gateTiers.includes(x.tier) && r && r.first && pr.y1 && r.first < pr.y1; }).length;
    M.key = k; M.res = { projects, byDev, gateTiers: o.gateTiers };
    return M.res;
  }
  /** One project's allocation by its key ("wastewater:22-2255" or the bare project number). */
  function impactOf(key, opts) {
    const m = model(opts); if (!m) return null;
    return m.projects.get(key) || m.projects.get(`wastewater:${key}`) || m.projects.get(`water:${key}`) || null;
  }
  /** A development's DC projects, gate and timing gap, or null. */
  function devImpact(p, opts) { const m = model(opts); return m ? m.byDev.get(p.key) || null : null; }

  // The allocation already worked out for these options, else null: it never builds one (a development's
  // Overview asks it for "Review →", on the view opened most: building walks every pipe and development).
  const current = (opts = {}) => (ready() && M.res && M.key === keyOf({ ...DEFAULTS, ...opts }) ? M.res : null);
  const api = { projectKey, groupProjects, markUpstream, gateOf, gapOf, flowShares, model, current, impactOf, devImpact, DEFAULTS };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDcImpact = api;
})(typeof window !== 'undefined' ? window : globalThis);
