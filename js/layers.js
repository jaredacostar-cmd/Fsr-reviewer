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
  const LABEL = { existing: 'Existing', built: 'Built', committed: 'Committed', proposed: 'Proposed', anticipated: 'Anticipated', to2051: 'To 2051' };
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
    if (layer !== 'built' && layer !== 'existing') parts[layer] += rest;
    else parts[layer] += rest;   // a completed development's units not on a dated permit
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
    const units = zero(), people = zero(), n = zero();
    let jobs = 0, estimated = 0;
    for (const p of devs) {
      const L = ofDev(p, opts); if (!L.layer) continue;
      n[L.layer]++;
      for (const k in units) { units[k] += L.parts[k]; people[k] += L.people[k] || 0; }
      jobs += L.jobs; estimated += L.estimated;
    }
    return { units, people, devs: n, jobs, estimated };
  }

  /** What a plan target allows beyond the layers applied for (Existing is the base, not counted). */
  function toTarget(target, t) {
    if (!(target > 0) || !t) return 0;
    const u = t.units || t;
    return Math.max(0, target - (u.built || 0) - (u.committed || 0) - (u.proposed || 0) - (u.anticipated || 0));
  }

  const api = { LAYERS, LABEL, NOTE, PHASE_LAYER, CENSUS_DATE, layerOfPhase, layerOf, ofDev, ofFile, totals, toTarget, confidenceOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLayers = api;
})(typeof window !== 'undefined' ? window : globalThis);
