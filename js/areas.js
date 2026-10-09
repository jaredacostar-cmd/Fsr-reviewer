/*
 * Planning areas (secondary plans / character areas, MTSAs) and the 2021 Census baseline.
 * Pure functions (testable in Node): point-in-area lookup, census totals for a geography, and
 * growth since the census from the development records.
 */
(function (root) {
  'use strict';
  const P = root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);
  const D = root.PeelDemand || (typeof require === 'function' ? require('./demand.js') : null);

  /** Adds a bbox to each area for quick rejection. */
  function prepare(list) {
    for (const a of list || []) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of a.rings) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      a.bbox = [x0, y0, x1, y1];
    }
    return list || [];
  }
  /** Ids of the areas containing the point (MTSAs can overlap). */
  function locate(list, lng, lat, muni) {
    if (lng == null || lat == null) return [];
    const out = [];
    for (const a of list) {
      if (muni && a.municipality !== muni) continue;
      const b = a.bbox;
      if (lng < b[0] || lng > b[2] || lat < b[1] || lat > b[3]) continue;
      if (P.pointInRings(lng, lat, a.rings)) out.push(a.id);
    }
    return out;
  }

  /**
   * The nearest area to a point outside all of them, within maxM metres of its edge:
   * { id, m } or null. Distances on a local flat projection (accurate to well under 1% here).
   */
  function nearest(list, lng, lat, maxM = 5000) {
    if (lng == null || lat == null) return null;
    const ky = 111320, kx = 111320 * Math.cos(lat * Math.PI / 180);
    const dLng = maxM / kx, dLat = maxM / ky;
    let best = null;
    for (const a of list) {
      const b = a.bbox;
      if (lng < b[0] - dLng || lng > b[2] + dLng || lat < b[1] - dLat || lat > b[3] + dLat) continue;
      for (const r of a.rings) for (let i = 1; i < r.length; i++) {
        const ax = (r[i - 1][0] - lng) * kx, ay = (r[i - 1][1] - lat) * ky, bx = (r[i][0] - lng) * kx, by = (r[i][1] - lat) * ky;
        const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
        const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
        const d = Math.hypot(ax + t * dx, ay + t * dy);
        if (d <= maxM && (!best || d < best.m)) best = { id: a.id, m: d };
      }
    }
    return best;
  }

  /**
   * DAs with the share of their land in each area (precomputed in data/areas.json).
   * das: [lng, lat, pop, dwellings, occupied, muni, { areaId: share }].
   */
  function tagCensus(census) {
    if (!census) return [];
    return census.das.map(([lng, lat, pop, dw, occ, muni, shares]) => ({ lng, lat, pop, dw, occ, muni, shares: shares || {} }));
  }
  // Share of a DA inside a geography: municipality is whole DAs; several secondary plans add
  // up (they don't overlap); with both plans and an MTSA, the smaller share (the MTSA usually
  // sits inside a plan). g.sp is a list of ids (or one id).
  const ids = v => (Array.isArray(v) ? v : v ? [v] : []);
  function shareOf(g, d) {
    if (g.muni && d.muni !== g.muni) return 0;
    let s = 1;
    const sps = ids(g.sp);
    if (sps.length) s = Math.min(s, sps.reduce((t, id) => t + (d.shares[id] || 0), 0));
    if (g.mtsa) s = Math.min(s, d.shares[g.mtsa] || 0);
    return s;
  }
  const inGeo = (g, x) => (!g.muni || x.muni === g.muni) && (!ids(g.sp).length || ids(g.sp).some(id => (x.sp || []).includes(id))) && (!g.mtsa || (x.mtsa || []).includes(g.mtsa));

  /** 2021 Census population and dwellings inside a geography { muni, sp, mtsa } (area-weighted). */
  function censusTotals(das, g) {
    let pop = 0, dw = 0, occ = 0, n = 0;
    for (const d of das) {
      const s = shareOf(g, d);
      if (!(s > 0)) continue;
      pop += d.pop * s; dw += d.dw * s; occ += d.occ * s; n++;
    }
    return { population: pop, dwellings: dw, occupied: occ, das: n };
  }

  // Completion date of a permit: the recorded one, else estimated from the issue date (Brampton
  // and Caledon publish no completion date): 12 months for houses, 30 for buildings of 20+ units.
  const MONTH = 30.44 * 864e5;
  const PROPOSED_PHASES = new Set(['inception', 'review']);
  function completedAt(r) {
    const done = r.events.filter(e => e.phase === 'completed').map(e => +e.date);
    if (done.length) return { date: Math.max(...done), estimated: false };
    const issued = r.events.filter(e => e.phase === 'permit').map(e => +e.date);
    if (!issued.length) return null;
    return { date: Math.min(...issued) + ((r.units || 0) >= 20 ? 30 : 12) * MONTH, estimated: true };
  }

  /**
   * Growth since the census in a geography:
   *  - built: units on building permits completed on or after census day;
   *  - approved: growth that is approved or permitted and not yet completed (committed);
   *  - proposed: growth on applications still in pre-consultation or review, not yet built
   *    (with approved, the full build-out of the planning applications);
   * each with the population they add at the design persons-per-unit.
   */
  function growthSince(projects, g, censusDate, criteria = D.DEFAULT_CRITERIA) {
    const since = +new Date(`${censusDate}T00:00:00Z`);
    const built = [], approved = [];
    const proposed = [];
    let builtUnits = 0, approvedUnits = 0, builtProjects = 0, approvedProjects = 0, estimated = 0, proposedUnits = 0, proposedProjects = 0;
    for (const p of projects) {
      if (p.phase === 'cancelled' || !inGeo(g, { muni: p.municipality, sp: p.sp, mtsa: p.mtsa })) continue;
      const done = p.records.filter(r => {
        if (r.kind !== 'permit' || r.phase !== 'completed') return false;
        const c = completedAt(r);
        if (c && c.estimated) estimated++;
        return c && c.date >= since;
      });
      const n = done.length ? P.permitUnits(done) : 0;
      const part = k => ({ ...p, units: k, buildout: null, siteAreaHa: p.siteAreaHa > 0 && p.units > 0 ? p.siteAreaHa * Math.min(1, k / p.units) : null });
      if (n > 0) { built.push(part(n)); builtUnits += n; builtProjects++; }
      const c = D.unitsFor(p, 'committed');
      if (c > 0) { approved.push(part(c)); approvedUnits += c; approvedProjects++; }
      const q = PROPOSED_PHASES.has(p.phase) && p.buildout ? p.buildout.unbuilt : 0;
      if (q > 0) { proposed.push(part(q)); proposedUnits += q; proposedProjects++; }
    }
    const layer = (list, units, projects) => {
      const e = D.estimate(list, criteria, 'all');
      return { units, projects, population: e.population, ha: e.area.ha, ii: e.wastewater.infiltration };
    };
    return {
      built: { ...layer(built, builtUnits, builtProjects), estimatedDates: estimated > 0 },
      approved: layer(approved, approvedUnits, approvedProjects),
      proposed: layer(proposed, proposedUnits, proposedProjects),
    };
  }

  const api = { prepare, locate, nearest, tagCensus, censusTotals, growthSince, completedAt, inGeo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAreas = api;
})(typeof window !== 'undefined' ? window : globalThis);
