(function (root) {
'use strict';
  // The layer function (SPEC §2). Every development, and every file in it, sits in exactly one
  // layer; its units split over the layers they count in (what is built since the census is Built,
  // what is left is the development's layer):
  //
  //   Existing     on the system today (in the 2021 Census: completed before census day)
  //   Built        demand not in the census yet: permits completed after census day (completion
  //                estimated from the issue date where none is published, js/areas.js completedAt)
  //   Committed    MECP Procedure D-5-1: draft plan or site plan approved, registered, permit
  //                issued, under construction. Zoning / OPA approval alone does not commit.
  //   Proposed     under formal review (incl. zoning approved and under appeal), not approved
  //   Anticipated  early signals: pre-consultation, block and precinct plans with no formal file
  //   To 2051      the plan allows it, not yet applied for: target − the layers above
  //
  //   ofDev(p, opts)  → { layer, units, parts: { existing, built, committed, proposed, anticipated },
  //                       unbuilt, toPermit, estimated, confidence, people, jobs }
  //   ofFile(r, p)    → { layer, units, confidence }
  //   totals(devs, opts) → { units: {layer: n}, people: {layer: n}, jobs, devs: {layer: n} }
  //   toTarget(target, t) → units the plan allows beyond the applied-for layers (≥ 0)
  // Pure; opts: { censusDate ('2021-05-11'), criteria, jobsOf(p) }.
  const req = f => (typeof require === 'function' ? require(f) : null);
  const P = () => root.PeelPhases || req('./phases.js');
  const D = () => root.PeelDemand || req('./demand.js');
  const A = () => root.PeelAreas || req('./areas.js');

  const LAYERS = ['existing', 'built', 'committed', 'proposed', 'anticipated', 'to2051'];
  const LABEL = { existing: 'On the system (2021 census)', built: 'Built since 2021', committed: 'Approved, not yet built (committed)', proposed: 'In review', anticipated: 'Pre-application', to2051: 'To 2051' };
  const NOTE = {
    existing: 'on the system today (2021 Census)',
    built: 'completed since census day, not in the census yet',
    committed: 'draft plan or site plan approved, through permit and construction (MECP D-5-1)',
    proposed: 'under formal review, not approved',
    anticipated: 'pre-consultation, block or precinct plan: no formal file yet',
    to2051: 'the plan allows it, not yet applied for',
  };
  // Phase → layer (SPEC §2). Completed splits on census day; withdrawn has none.
  const PHASE_LAYER = { inception: 'anticipated', review: 'proposed', approved: 'committed', permit: 'committed', construction: 'committed', completed: 'built', cancelled: null };
  const CENSUS_DATE = '2021-05-11';
  const ESTIMATED = new Set(['online', 'precon', 'estimate', 'permits']);
  const zero = () => ({ existing: 0, built: 0, committed: 0, proposed: 0, anticipated: 0 });

  const censusMs = opts => +new Date(`${(opts && opts.censusDate) || CENSUS_DATE}T00:00:00Z`);
  const livePermits = p => (p.records || []).filter(r => r.kind === 'permit' && r.phase !== 'cancelled' && !r.prePlan && !r.outside);

  // Units completed since census day (Built) and before it (Existing), of the development's completed.
  function completedSplit(p, opts) {
    const since = censusMs(opts), done = livePermits(p).filter(r => r.phase === 'completed');
    const completed = p.buildout ? Math.min(p.units || 0, p.buildout.completed || 0) : (p.phase === 'completed' ? p.units || 0 : 0);
    if (!(completed > 0)) return { built: 0, existing: 0, estimatedDates: false };
    if (!done.length) {
      // No permits to date it: the development's own completion milestone decides.
      const at = p.milestones && p.milestones.completed ? +p.milestones.completed : null;
      return at != null && at < since ? { built: 0, existing: completed, estimatedDates: false } : { built: completed, existing: 0, estimatedDates: false };
    }
    let est = false;
    const after = done.filter(r => { const c = A().completedAt(r); if (c && c.estimated) est = true; return c && c.date >= since; });
    const all = P().permitUnits(done), aft = after.length ? P().permitUnits(after) : 0;
    const built = all > 0 ? Math.round(completed * Math.min(1, aft / all)) : 0;
    return { built, existing: completed - built, estimatedDates: est };
  }

  function layerOfPhase(phase) { return Object.prototype.hasOwnProperty.call(PHASE_LAYER, phase) ? PHASE_LAYER[phase] : null; }

  /** The development's layer: its phase's, a completed one on census day's side. */
  function layerOf(p, opts) {
    const l = layerOfPhase(p && p.phase);
    if (l !== 'built') return l;
    const s = completedSplit(p, opts);
    return s.built > 0 || !(s.existing > 0) ? 'built' : 'existing';
  }

  function confidenceOf(p) {
    const parts = (p.count && p.count.parts) || [];
    const est = parts.filter(x => ESTIMATED.has(x.kind)).reduce((t, x) => t + x.units, 0);
    if (parts.length && est >= (p.units || 0) && est > 0) return 'estimated';
    if (parts.filter(x => x.units > 0).length > 1) return 'summed';
    return 'stated';
  }

  /** People (and jobs) for a share of a development's units, at Peel design criteria. */
  function peopleOf(p, units, opts) {
    if (!(units > 0) || !(p.units > 0)) return 0;
    // As js/areas.js growthSince: the share of the units, on the same share of the site (the
    // apartment density, and so persons per unit, stays the development's own).
    const part = { ...p, types: p.types || [], description: p.description || '', units, buildout: null, siteAreaHa: p.siteAreaHa > 0 ? p.siteAreaHa * Math.min(1, units / p.units) : null };
    return D().estimate([part], (opts && opts.criteria) || D().DEFAULT_CRITERIA, 'all').population;
  }

  function ofDev(p, opts = {}) {
    const layer = layerOf(p, opts);
    const parts = zero();
    const out = { layer, units: 0, parts, unbuilt: 0, toPermit: 0, estimated: 0, confidence: 'stated', people: 0, jobs: 0, estimatedDates: false };
    if (!layer || !p) return out;
    const units = p.units > 0 ? p.units : 0;
    const s = completedSplit(p, opts);
    out.estimatedDates = s.estimatedDates;
    parts.existing = s.existing; parts.built = s.built;
    const rest = Math.max(0, units - s.existing - s.built);
    // A completed development's units not on a completed permit: with a build-out, they are on
    // permits still open (every unit is permitted, or the phase would be construction), so they are
    // committed, not built, the same as Growth's left to build (P.unbuiltOf). 0 McLaughlin Rd: 397
    // planned, 260 on closed permits, 137 still building.
    if (layer !== 'built' && layer !== 'existing') parts[layer] += rest;
    else if (p.buildout) parts.committed += rest;
    else parts[layer] += rest;
    out.units = units;
    out.unbuilt = rest;
    out.toPermit = p.buildout ? p.buildout.remaining || 0 : (layer === 'built' || layer === 'existing' ? 0 : rest);
    // Estimated units (found online, pre-consultation, wording): in what is left to build.
    const est = ((p.count && p.count.parts) || []).filter(x => ESTIMATED.has(x.kind)).reduce((t, x) => t + x.units, 0);
    out.estimated = Math.min(est, rest);
    out.confidence = confidenceOf(p);
    const jobs = opts.jobsOf ? opts.jobsOf(p) || 0 : 0;
    out.jobs = jobs;
    out.people = Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, peopleOf(p, v, opts)]));
    return out;
  }

  /** A single file: its own phase's layer and its own units in the development's count. */
  function ofFile(r, p) {
    const layer = r.kind === 'permit'
      ? (r.phase === 'completed' ? 'built' : r.phase === 'cancelled' ? null : 'committed')
      : layerOfPhase(P().fileKind && /^(draft|siteplan|condo)$/.test(P().fileKind(r)) ? r.phase : (r.phase === 'approved' ? 'review' : r.phase));
    const part = p && p.count && (p.count.parts || []).find(x => x.ref === r.ref);
    return { layer, units: part ? part.units : (r.units > 0 ? r.units : 0), confidence: part ? (ESTIMATED.has(part.kind) ? 'estimated' : 'stated') : (r.unitsFromText ? 'estimated' : 'stated') };
  }

  function totals(devs, opts = {}) {
    const units = zero(), people = zero(), n = zero(), est = zero();
    let jobs = 0, estimated = 0;
    for (const p of devs) {
      const L = ofDev(p, opts); if (!L.layer) continue;
      n[L.layer]++;
      for (const k in units) { units[k] += L.parts[k]; people[k] += L.people[k] || 0; }
      jobs += L.jobs; estimated += L.estimated;
      if (L.estimated > 0 && L.layer in est) est[L.layer] += L.estimated;
    }
    return { units, people, devs: n, jobs, estimated, estimatedBy: est };
  }

  /** Units by dwelling type × layer: each development's layer parts split by its own type mix
   *  (js/demand.js unitSplit). → { single: { existing, built, … }, town, apartment, unknown } */
  function byType(devs, opts = {}) {
    const out = {};
    for (const t of D().UNIT_TYPES) out[t.key] = zero();
    for (const p of devs) {
      const L = ofDev(p, opts); if (!L.layer || !(L.units > 0)) continue;
      const s = D().unitSplit({ ...p, types: p.types || [], description: p.description || '' }, 'all'), n = Object.values(s).reduce((a, v) => a + v, 0);
      if (!(n > 0)) continue;
      for (const k in s) if (s[k] > 0) for (const ly in L.parts) out[k][ly] += L.parts[ly] * s[k] / n;
    }
    return out;
  }

  /** What a plan target allows beyond the layers applied for (Existing is the base, not counted). */
  function toTarget(target, t) {
    if (!(target > 0) || !t) return 0;
    const u = t.units || t;
    return Math.max(0, target - (u.built || 0) - (u.committed || 0) - (u.proposed || 0) - (u.anticipated || 0));
  }

  // ---- The pipeline headline (for management) ----------------------------------------------------
  // One total that its parts add up to: every live development (the tree total), split by whether
  // its files have moved since 2021 (a dated event in 2021 or later; no dated event counts as not
  // moved), and what is still to build (units not yet completed, before or after the census).
  const MOVED_SINCE = 2021;
  function movedSince(p, year = MOVED_SINCE) {
    for (const t of (p && p.timeline) || []) if (t.date && t.date.getUTCFullYear() >= year) return true;
    return false;
  }
  function pipeline(devs, opts = {}) {
    const out = { total: 0, moved: 0, notMoved: 0, existing: 0, built: 0, notBuilt: 0, developments: 0, notMovedDevelopments: 0 };
    for (const p of devs || []) {
      const L = ofDev(p, opts); if (!L.layer || !(L.units > 0)) continue;
      out.developments++; out.total += L.units;
      if (movedSince(p)) out.moved += L.units; else { out.notMoved += L.units; out.notMovedDevelopments++; }
      out.existing += L.parts.existing || 0; out.built += L.parts.built || 0;
    }
    out.notBuilt = Math.max(0, out.total - out.existing - out.built);
    return out;
  }
  // ---- Infill and additional units ----------------------------------------------------------------
  // Homes added by building permit alone since census day: permits on sites with no planning
  // application (secondary and garden suites, new houses on existing lots, the odd small building),
  // net of the homes the same sites demolished since then. Not in the planning pipeline above; the
  // servicing model already counts the completed ones as built since the census (js/areas.js).
  // Brampton's open permit data has no second-unit permits, so its suites are missing (flagged).
  function infill(projects, opts = {}) {
    const since = censusMs(opts), out = { units: 0, suites: 0, houses: 0, buildings: 0, completed: 0, sites: 0, byMuni: {}, brampton: false };
    const issuedAt = r => { const d = (r.events || []).filter(e => e.phase === 'permit').map(e => +e.date); return d.length ? Math.min(...d) : null; };
    for (const p of projects || []) {
      if (!p || p.phase === 'cancelled' || (p.kinds || []).includes('application')) continue;
      const recs = (p.records || []).filter(r => r.kind === 'permit' && r.phase !== 'cancelled' && issuedAt(r) != null && issuedAt(r) >= since);
      const adds = recs.filter(r => P().permitAddsUnits(r)); if (!adds.length) continue;
      const suite = adds.filter(r => P().permitRole(r) === 'suite'), other = adds.filter(r => P().permitRole(r) !== 'suite');
      const s = P().permitUnits(suite), o = P().permitUnits(other);
      const lost = P().lostHomes ? P().lostHomes(recs) || 0 : 0;
      const net = Math.max(0, s + o - lost); if (!(net > 0)) continue;
      const big = other.filter(r => r.units >= 3).length ? P().permitUnits(other.filter(r => r.units >= 3)) : 0;
      const oNet = Math.max(0, o - lost);
      out.units += net; out.suites += Math.min(s, net); out.buildings += Math.min(big, oNet); out.houses += Math.max(0, oNet - Math.min(big, oNet)); out.sites++;
      out.completed += Math.min(net, P().permitUnits(adds.filter(r => r.phase === 'completed')));
      out.byMuni[p.municipality] = (out.byMuni[p.municipality] || 0) + net;
      if (p.municipality === 'Brampton') out.brampton = true;
    }
    // Second units in existing houses held aside by the developments build (js/phases.js
    // isSecondUnitConversion): their new homes, once per permit.
    const seen = new Set(); let bramptonSecond = false;
    for (const r of opts.secondUnits || []) {
      const k = `${r.municipality}|${r.ref || r.uid}`;
      if (seen.has(k) || r.phase === 'cancelled' || !(r.units > 0)) continue;
      const at = issuedAt(r); if (at == null || at < since) continue;
      seen.add(k);
      out.units += r.units; out.suites += r.units; out.sites++;
      if (r.phase === 'completed') out.completed += r.units;
      out.byMuni[r.municipality] = (out.byMuni[r.municipality] || 0) + r.units;
      if (r.municipality === 'Brampton') bramptonSecond = true;
    }
    // (Brampton's second units were missing from its open data until October 2026)
    if (bramptonSecond) out.brampton = false;
    return out;
  }

  // ---- Under construction: the app against CMHC -----------------------------------------------------
  // CMHC archived its under-construction inventory by municipality after 2022 (the tables now read
  // "This data series is now archived"); its starts and completions still come through the Region of
  // Peel's Housing Construction Activity layer. Rolled forward: inventory(Y) = inventory(Y − 1) +
  // starts(Y) − completions(Y), full years only (the identity reproduces CMHC's own 2017–2022 figures).
  function cmhcUnderConstruction(H) {
    const uc = H && H.cmhc && H.cmhc.underConstruction, act = H && H.peel && H.peel.activity && H.peel.activity.muni;
    if (!uc) return null;
    const out = { byMuni: {}, base: null, year: null };
    for (const m of Object.keys(uc)) {
      const ys = Object.keys(uc[m]).map(Number).sort((a, b) => a - b), b = ys[ys.length - 1]; if (!isFinite(b)) continue;
      let v = uc[m][b].all, y = b;
      const a = act && act[m];
      for (let n = b + 1; a && a[n] && (!a[n].quarters || a[n].quarters === 4) && a[n].starts && a[n].completions; n++) { v += a[n].starts.all - a[n].completions.all; y = n; }
      out.byMuni[m] = v; out.base = out.base == null ? b : Math.min(out.base, b); out.year = out.year == null ? y : Math.min(out.year, y);
    }
    return out;
  }
  // The app's under construction: homes permitted and not yet completed on planning applications.
  function permittedNotCompleted(projects) {
    const out = {};
    for (const p of projects || []) {
      if (!p || p.phase === 'cancelled' || !(p.kinds || []).includes('application') || !p.buildout) continue;
      const b = p.buildout, v = Math.max(0, Math.min(b.planned || 0, b.permitted || 0) - (b.completed || 0));
      out[p.municipality] = (out[p.municipality] || 0) + v;
    }
    return out;
  }

  // Rounded for a headline: the nearest thousand from 10,000, the nearest hundred from 1,000.
  const roundHeadline = v => (v >= 10000 ? Math.round(v / 1000) * 1000 : v >= 1000 ? Math.round(v / 100) * 100 : Math.round(v));
  // "About 258,000 homes are in the planning pipeline: 242,000 have moved since 2021 and 16,000
  // haven't moved since 2020. About 237,000 are not yet built." (where: " in Brampton", or '').
  function headlineText(pl, where = '', fmt = v => Number(v).toLocaleString('en-CA'), strong = s => s, inf = null) {
    if (!pl || !(pl.total > 0)) return '';
    const r = v => fmt(roundHeadline(v));
    const split = pl.notMoved >= 0.5 ? `: ${r(pl.moved)} have moved since ${MOVED_SINCE} and ${r(pl.notMoved)} haven\u2019t moved since ${MOVED_SINCE - 1}` : '';
    const plus = inf && inf.units >= 0.5 ? ` Plus about ${r(inf.units)} added by building permit alone since ${MOVED_SINCE} (secondary suites and new houses on existing lots)${inf.brampton ? '; Brampton\u2019s second units are not in its open data' : ''}.` : '';
    return `About ${strong(r(pl.total))} homes are in the planning pipeline${where}${split}. About ${r(pl.notBuilt)} are not yet built.${plus}`;
  }

  const api = { LAYERS, LABEL, NOTE, PHASE_LAYER, CENSUS_DATE, layerOfPhase, layerOf, ofDev, ofFile, totals, byType, toTarget, confidenceOf, MOVED_SINCE, movedSince, pipeline, roundHeadline, headlineText, infill, cmhcUnderConstruction, permittedNotCompleted };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLayers = api;
})(typeof window !== 'undefined' ? window : globalThis);
