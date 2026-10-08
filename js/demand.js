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
    wastewater: { avg: 290 },
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

  /** Units of a project split by type: uses a published unit mix when present. */
  function unitSplit(project) {
    if (project.unitMix) {
      const m = project.unitMix;
      return { single: (m.single || 0) + (m.semi || 0), town: m.town || 0, apartment: m.apartment || 0, unknown: 0 };
    }
    const split = { single: 0, town: 0, apartment: 0, unknown: 0 };
    if (project.units > 0) {
      const text = [project.types.join(' '), project.description].join(' ');
      split[unitTypeOf(text)] += project.units;
    }
    return split;
  }

  function harmon(pop) {
    if (!(pop > 0)) return 0;
    return 1 + 14 / (4 + Math.sqrt(pop / 1000));
  }

  /**
   * Aggregate estimate for a set of projects.
   * Harmon peaking is applied to the combined population (system-level peak),
   * which is lower than summing each site's individually peaked flow.
   */
  function estimate(projects, criteria = DEFAULT_CRITERIA) {
    const units = { single: 0, town: 0, apartment: 0, unknown: 0 };
    let withUnits = 0;
    for (const p of projects) {
      const s = unitSplit(p);
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
    return {
      projects: projects.length,
      withUnits,
      units, totalUnits,
      pop, population,
      water: { avg: wAvg, maxDay: wAvg * criteria.water.maxDay, peakHour: wAvg * criteria.water.peakHour },
      wastewater: { avg: sAvg, peakingFactor: M, peak: sAvg * M },
    };
  }

  /** L/s -> ML/day */
  const toMLd = lps => lps * SECONDS_PER_DAY / 1e6;

  const api = { UNIT_TYPES, DEFAULT_CRITERIA, unitTypeOf, unitSplit, harmon, estimate, toMLd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDemand = api;
})(typeof window !== 'undefined' ? window : globalThis);
