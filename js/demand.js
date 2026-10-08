/*
 * Population and water / wastewater demand estimates from dwelling units,
 * using Region of Peel design criteria. Pure functions (testable in Node).
 *
 * Defaults (all editable in the UI):
 *  - Persons per unit: Peel Linear Wastewater Standards R1.0, Table 2-2
 *    (from the Region's DC Background Study): single/semi 4.2, townhouse 3.4,
 *    large apartment 3.1; apartments above 475 persons/ha are designed at 2.7 ppu.
 *  - Wastewater: 290 L/cap/day residential (Linear Wastewater Standards R1.0),
 *    peaked with the Harmon formula M = 1 + 14 / (4 + sqrt(P / 1000)).
 *  - Water: 280 L/cap/day average day, maximum day factor 2.0, peak hour
 *    factor 3.0 (Peel Watermain Design Criteria, rev. June 2010).
 *  - Infiltration & inflow (I&I): 0.26 L/s per hectare of gross site area (Linear
 *    Wastewater Standards); peak wet weather flow = Harmon peak + I&I. Site area comes from
 *    the application boundary; where there is none it is estimated from the units by type.
 */
(function (root) {
  'use strict';

  const UNIT_TYPES = [
    { key: 'single',    label: 'Single / semi-detached' },
    { key: 'town',      label: 'Townhouse' },
    { key: 'apartment', label: 'Apartment' },
    { key: 'unknown',   label: 'Type not stated' },
  ];

  const DEFAULT_CRITERIA = {
    ppu: { single: 4.2, town: 3.4, apartment: 2.7, unknown: 2.7 },
    water: { avg: 280, maxDay: 2.0, peakHour: 3.0 },
    wastewater: { avg: 290, infiltration: 0.26 },
  };

  const SECONDS_PER_DAY = 86400;

  /** Guess the dwelling type of a project from its type / description text. */
  function unitTypeOf(text) {
    const s = String(text || '');
    if (/apart|condo|tower|high[- ]?rise|mid[- ]?rise|storey|mixed[- ]use|stacked|back[- ]to[- ]back|multi[- ]?(unit|res)|residential building/i.test(s)) return 'apartment';
    if (/town|row ?house|\brow\b|street ?town|common element/i.test(s)) return 'town';
    if (/single|semi|detached|\bsfd\b|\bsdd\b|dwelling/i.test(s)) return 'single';
    return 'unknown';
  }

  // Committed capacity: growth only (units planned on a planning application) that has
  // approval or a building permit and is not yet built and occupied. Applications still in
  // pre-consultation or review are proposed, not committed; completed units already draw on
  // the system; permits with no planning application (infill houses) are not growth.
  const COMMITTED_PHASES = new Set(['approved', 'permit', 'construction']);

  /** How many of a project's units count, by basis. */
  function unitsFor(project, basis = 'all') {
    const b = project.buildout;
    if (basis === 'committed') {
      if (!b || !COMMITTED_PHASES.has(project.phase)) return 0;
      return b.unbuilt;
    }
    if (basis === 'remaining') return b ? b.remaining : 0;   // planned, no building permit yet
    if (basis === 'unbuilt') return b ? b.unbuilt : (project.phase === 'completed' ? 0 : project.units || 0);
    if (basis === 'completed') return b ? b.completed : (project.phase === 'completed' ? project.units || 0 : 0);
    return project.units || 0;
  }

  /**
   * Units of a project split by type: uses a published unit mix when present
   * (scaled to the counted units), else the dwelling type read from its text.
   */
  function unitSplit(project, basis = 'all') {
    const n = unitsFor(project, basis);
    const split = { single: 0, town: 0, apartment: 0, unknown: 0 };
    if (!(n > 0)) return split;
    const m = project.unitMix;
    if (m) {
      const mix = { single: (m.single || 0) + (m.semi || 0), town: m.town || 0, apartment: m.apartment || 0 };
      const total = mix.single + mix.town + mix.apartment;
      if (total > 0) {
        for (const k in mix) split[k] = n * mix[k] / total;
        return split;
      }
    }
    const text = [project.types.join(' '), project.description].join(' ');
    split[unitTypeOf(text)] += n;
    return split;
  }

  function harmon(pop) {
    if (!(pop > 0)) return 0;
    return 1 + 14 / (4 + Math.sqrt(pop / 1000));
  }

  // Gross site area per unit (ha) used when a project has no boundary: about 25 singles,
  // 50 townhouses or 330 apartment units per gross hectare. Type not stated is treated as
  // apartments, as for persons per unit (most unit-bearing files without a type are towers).
  const AREA_PER_UNIT = { single: 0.04, town: 0.02, apartment: 0.003, unknown: 0.003 };

  /**
   * Site area (ha) counted for a project and basis: the boundary area prorated by the share of
   * the project's units the basis counts, else an estimate from those units by type.
   */
  function areaFor(project, basis = 'all') {
    const n = unitsFor(project, basis);
    if (!(n > 0)) return { ha: 0, estimated: false };
    if (project.siteAreaHa > 0) {
      const all = project.units || n;
      return { ha: project.siteAreaHa * Math.min(1, n / all), estimated: false };
    }
    const s = unitSplit(project, basis);
    let ha = 0;
    for (const k in s) ha += s[k] * AREA_PER_UNIT[k];
    return { ha, estimated: true };
  }

  /**
   * Aggregate estimate for a set of projects.
   * Harmon peaking is applied to the combined population (system-level peak),
   * which is lower than summing each site's individually peaked flow.
   */
  function estimate(projects, criteria = DEFAULT_CRITERIA, basis = 'all') {
    const units = { single: 0, town: 0, apartment: 0, unknown: 0 };
    let withUnits = 0, ha = 0, haEstimated = 0;
    for (const p of projects) {
      const a = areaFor(p, basis);
      ha += a.ha; if (a.estimated) haEstimated += a.ha;
      const s = unitSplit(p, basis);
      const total = s.single + s.town + s.apartment + s.unknown;
      if (total > 0) withUnits++;
      for (const k in units) units[k] += s[k];
    }
    const pop = {};
    let population = 0;
    for (const k in units) { pop[k] = units[k] * (criteria.ppu[k] || 0); population += pop[k]; }
    const totalUnits = units.single + units.town + units.apartment + units.unknown;

    const wAvg = population * criteria.water.avg / SECONDS_PER_DAY;          // L/s
    const sAvg = population * criteria.wastewater.avg / SECONDS_PER_DAY;      // L/s
    const M = harmon(population);
    const ii = ha * (criteria.wastewater.infiltration ?? DEFAULT_CRITERIA.wastewater.infiltration);
    return {
      projects: projects.length,
      withUnits,
      units, totalUnits,
      pop, population,
      water: { avg: wAvg, maxDay: wAvg * criteria.water.maxDay, peakHour: wAvg * criteria.water.peakHour },
      area: { ha, estimatedHa: haEstimated },
      wastewater: { avg: sAvg, peakingFactor: M, peak: sAvg * M, infiltration: ii, wetPeak: sAvg * M + ii },
    };
  }

  /** L/s -> ML/day */
  const toMLd = lps => lps * SECONDS_PER_DAY / 1e6;

  const api = { UNIT_TYPES, DEFAULT_CRITERIA, COMMITTED_PHASES, AREA_PER_UNIT, areaFor, unitTypeOf, unitSplit, unitsFor, harmon, estimate, toMLd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDemand = api;
})(typeof window !== 'undefined' ? window : globalThis);
