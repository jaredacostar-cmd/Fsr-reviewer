/*
 * Growth-tab data logic (Phase 4): pipeline buckets, completions per year and the
 * pace of approvals — pure functions over the normalised projects, unit-tested in Node.
 *
 * In the browser the module is available as `Growth`; in Node it is requireable.
 * The dependencies on the other modules (D, P, PeelAreas) are injected so the
 * functions stay pure and testable without a browser.
 */
(function (root) {
  'use strict';

  const MONTH = 30.44 * 864e5;
  const P = typeof module !== 'undefined' && module.exports ? require('./phases.js') : root.PeelPhases;

  /**
   * Planned / permitted / completed / left-to-build units, summed over the projects
   * that carry a build-out (the `bo` accumulation the old Demand tab's renderDemand did).
   */
  // One definition of the pipeline, used by the Overview, Growth, the header and the briefing:
  // planned = each development's units counted once (the larger of planned and permitted, net of
  // homes demolished: project.units); permitted / completed from its build-out; left to build =
  // planned not yet completed (P.unbuiltOf, the same figure Timing calls unbuilt: SPEC 1.6). A
  // development with no build-out counts by its stage.
  const PERMIT_STAGES = new Set(['permit', 'construction', 'completed']);
  function pipelineTotals(projects) {
    const t = { planned: 0, permitted: 0, completed: 0, left: 0, n: 0, withBuildout: 0 };
    for (const p of projects) {
      if (!p || p.phase === 'cancelled' || !(p.units > 0)) continue;
      t.n++;
      t.planned += p.units;
      if (p.buildout) {
        t.withBuildout++;
        t.permitted += p.buildout.permitted || 0;
        t.completed += Math.min(p.units, p.buildout.completed || 0);   // (more completed than counted: the count)
      } else if (PERMIT_STAGES.has(p.phase)) {
        t.permitted += p.units;
        if (p.phase === 'completed') t.completed += p.units;
      }
      t.left += P.unbuiltOf(p);
    }
    return t;
  }

  /**
   * Build-out by dwelling type and employment floor space, summed over projects
   * (moved from js/app.js; dependencies injected).
   *
   * deps: { typeBuildout(project), unitTypes, empOf(project),
   *         permittedPhases:Set, completedPhases:Set }
   */
  function aggregateTypes(projects, deps) {
    const { typeBuildout, unitTypes, empOf, permittedPhases, completedPhases } = deps;
    const bt = {};
    for (const t of unitTypes) bt[t.key] = { planned: 0, permitted: 0, completed: 0, left: 0 };
    const emp = { planned: 0, permitted: 0, completed: 0, left: 0, jobs: 0 };
    for (const p of projects) {
      const tb = p.buildout ? typeBuildout(p) : null;
      if (tb) for (const k in bt) for (const col in bt[k]) bt[k][col] += tb.rows[k][col];
      const em = empOf(p);
      if (em && em.totalM2 > 0) {
        emp.planned += em.totalM2; emp.jobs += em.jobs;
        if (permittedPhases.has(p.phase)) emp.permitted += em.totalM2;
        else if (p.phase !== 'cancelled') emp.left += em.totalM2;
        if (completedPhases.has(p.phase)) emp.completed += em.totalM2;
      }
    }
    return { bt, emp };
  }

  /**
   * Completions grouped by completion year and municipality. A completion is a building
   * permit in phase 'completed'; the date is the recorded completion date, else the
   * estimate from the issue date (Brampton and Caledon publish no completion date).
   * Units within one year are de-duplicated the way growthSince does (revised permits
   * share a base permit number); the same building counted in two different years is
   * the residual edge case.
   *
   * deps: { completedAt(record), permitUnits(records) }
   * Returns { years: [{ year, units, projects }], byMuni: [{ m, units, projects,
   *   years, perYear }], estimated, totalUnits }.
   */
  function completionStats(projects, deps) {
    const { completedAt, permitUnits } = deps;
    const years = new Map(), munis = new Map();
    let estimated = 0, totalUnits = 0;
    for (const p of projects) {
      if (p.phase === 'cancelled') continue;
      const done = [];
      for (const r of p.records || []) {
        if (r.kind !== 'permit' || r.phase !== 'completed') continue;
        const c = completedAt(r);
        if (!c) continue;
        if (c.estimated) estimated++;
        done.push([r, new Date(c.date).getUTCFullYear()]);
      }
      // Attribute whole-year record lists to permitUnits so revised permits of one
      // building count once per year.
      const byYear = new Map();
      for (const [r, y] of done) {
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(r);
      }
      for (const [y, rs] of byYear) {
        const units = permitUnits(rs) || 0;
        let yy = years.get(y);
        if (!yy) { yy = { year: y, units: 0, projects: new Set() }; years.set(y, yy); }
        yy.units += units; yy.projects.add(p.key);
        // (by municipality only up to the data year, as the Peel row is clipped: an estimated completion
        // date can fall after today, and its year would count as a year of completions)
        if (deps.nowYear != null && y > deps.nowYear) { totalUnits += units; continue; }
        let m = munis.get(p.municipality);
        if (!m) { m = { units: 0, projects: new Set(), years: new Set() }; munis.set(p.municipality, m); }
        m.units += units; m.projects.add(p.key); m.years.add(y);
        totalUnits += units;
      }
    }
    const yearList = [...years.values()]
      .map(y => ({ year: y.year, units: y.units, projects: y.projects.size }))
      .sort((a, b) => a.year - b.year);
    const muniList = [...munis.entries()].map(([m, o]) => ({
      m, units: o.units, projects: o.projects.size, years: o.years.size,
      perYear: o.years.size ? o.units / o.years.size : 0,
    }));
    return { years: yearList, byMuni: muniList, estimated, totalUnits };
  }

  /**
   * Approval lags: months from the first application activity to the site's own
   * approval, from the milestones mergeProject records. Lags over 30 years are
   * treated as data noise and dropped.
   */
  function approvalLags(projects) {
    const out = [];
    for (const p of projects) {
      const ms = p.milestones || {};
      const start = ms.inception, appr = ms.approved;
      if (start == null || appr == null || !(appr > start)) continue;
      const months = (appr - start) / MONTH;
      if (!(months > 0) || months > 30 * 12) continue;
      out.push({ muni: p.municipality, months, key: p.key });
    }
    return out;
  }

  function median(values) {
    const s = values.filter(v => v > 0).sort((a, b) => a - b);
    if (!s.length) return null;
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  /** Median approval lag per municipality: [{ m, medianMonths, n }]. */
  function medianApprovalByMuni(lags) {
    const byM = new Map();
    for (const l of lags) {
      if (!byM.has(l.muni)) byM.set(l.muni, []);
      byM.get(l.muni).push(l.months);
    }
    return [...byM.entries()].map(([m, ms]) => ({ m, medianMonths: median(ms), n: ms.length }));
  }

  // What the units figure counts under each counting basis (the Scenario's Count / Units settings),
  // so a figure never says "planned" for a count that is not every planned unit.
  const BASIS_UNITS = { all: 'planned', buildout: 'applied for (no pre-application)', committed: 'committed, not yet built', remaining: 'left to build' };
  const basisUnits = basis => BASIS_UNITS[basis] || BASIS_UNITS.all;

  const api = { pipelineTotals, basisUnits, BASIS_UNITS, aggregateTypes, completionStats, approvalLags, median, medianApprovalByMuni };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Growth = api;
})(typeof self !== 'undefined' ? self : this);
