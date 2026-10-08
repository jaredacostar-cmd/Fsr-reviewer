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
   * DAs with the share of their land in each area (precomputed in data/areas.json).
   * das: [lng, lat, pop, dwellings, occupied, muni, { areaId: share }].
   */
  function tagCensus(census) {
    if (!census) return [];
    return census.das.map(([lng, lat, pop, dw, occ, muni, shares]) => ({ lng, lat, pop, dw, occ, muni, shares: shares || {} }));
  }
  // Share of a DA inside a geography: municipality is whole DAs; with both a secondary plan
  // and an MTSA, the smaller share (the MTSA usually sits inside the plan).
  function shareOf(g, d) {
    if (g.muni && d.muni !== g.muni) return 0;
    let s = 1;
    if (g.sp) s = Math.min(s, d.shares[g.sp] || 0);
    if (g.mtsa) s = Math.min(s, d.shares[g.mtsa] || 0);
    return s;
  }
  const inGeo = (g, x) => (!g.muni || x.muni === g.muni) && (!g.sp || (x.sp || []).includes(g.sp)) && (!g.mtsa || (x.mtsa || []).includes(g.mtsa));

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
   * each with the population they add at the design persons-per-unit.
   */
  function growthSince(projects, g, censusDate, criteria = D.DEFAULT_CRITERIA) {
    const since = +new Date(`${censusDate}T00:00:00Z`);
    const built = [], approved = [];
    let builtUnits = 0, approvedUnits = 0, builtProjects = 0, approvedProjects = 0, estimated = 0;
    for (const p of projects) {
      if (p.phase === 'cancelled' || !inGeo(g, { muni: p.municipality, sp: p.sp, mtsa: p.mtsa })) continue;
      const done = p.records.filter(r => {
        if (r.kind !== 'permit' || r.phase !== 'completed') return false;
        const c = completedAt(r);
        if (c && c.estimated) estimated++;
        return c && c.date >= since;
      });
      const n = done.length ? P.permitUnits(done) : 0;
      if (n > 0) { built.push({ ...p, units: n, buildout: null }); builtUnits += n; builtProjects++; }
      const c = D.unitsFor(p, 'committed');
      if (c > 0) { approved.push({ ...p, units: c, buildout: null }); approvedUnits += c; approvedProjects++; }
    }
    const pop = list => D.estimate(list, criteria, 'all').population;
    return {
      built: { units: builtUnits, projects: builtProjects, population: pop(built), estimatedDates: estimated > 0 },
      approved: { units: approvedUnits, projects: approvedProjects, population: pop(approved) },
    };
  }

  const api = { prepare, locate, tagCensus, censusTotals, growthSince, completedAt, inGeo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAreas = api;
})(typeof window !== 'undefined' ? window : globalThis);
