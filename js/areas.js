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
   * Tags each DA with the areas it falls in. das: [lng, lat, pop, dwellings, occupied, muni].
   */
  function tagCensus(census, secondaryPlans, mtsas) {
    if (!census) return [];
    return census.das.map(([lng, lat, pop, dw, occ, muni]) => ({
      lng, lat, pop, dw, occ, muni,
      sp: locate(secondaryPlans, lng, lat, muni || null),
      mtsa: locate(mtsas, lng, lat, muni || null),
    }));
  }
  const inGeo = (g, x) => (!g.muni || x.muni === g.muni) && (!g.sp || (x.sp || []).includes(g.sp)) && (!g.mtsa || (x.mtsa || []).includes(g.mtsa));

  /** 2021 Census population and dwellings inside a geography { muni, sp, mtsa }. */
  function censusTotals(das, g) {
    let pop = 0, dw = 0, occ = 0, n = 0;
    for (const d of das) if (inGeo(g, d)) { pop += d.pop; dw += d.dw; occ += d.occ; n++; }
    return { population: pop, dwellings: dw, occupied: occ, das: n };
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
    let builtUnits = 0, approvedUnits = 0, builtProjects = 0, approvedProjects = 0;
    for (const p of projects) {
      if (p.phase === 'cancelled' || !inGeo(g, { muni: p.municipality, sp: p.sp, mtsa: p.mtsa })) continue;
      const done = p.records.filter(r => r.kind === 'permit' && r.phase === 'completed' &&
        r.events.some(e => e.phase === 'completed' && +e.date >= since));
      const n = done.length ? P.permitUnits(done) : 0;
      if (n > 0) { built.push({ ...p, units: n, buildout: null }); builtUnits += n; builtProjects++; }
      const c = D.unitsFor(p, 'committed');
      if (c > 0) { approved.push({ ...p, units: c, buildout: null }); approvedUnits += c; approvedProjects++; }
    }
    const pop = list => D.estimate(list, criteria, 'all').population;
    return {
      built: { units: builtUnits, projects: builtProjects, population: pop(built) },
      approved: { units: approvedUnits, projects: approvedProjects, population: pop(approved) },
    };
  }

  const api = { prepare, locate, tagCensus, censusTotals, growthSince, inGeo };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAreas = api;
})(typeof window !== 'undefined' ? window : globalThis);
