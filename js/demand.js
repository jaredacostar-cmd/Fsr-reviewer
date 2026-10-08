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
 *  - Employment (industrial, office, retail, hotel, institutional jobs estimated from the
 *    floor areas on the applications): water 300 L/employee/day, max day ×1.4, peak hour ×3.0
 *    (Peel Functional Servicing Report requirements / Watermain Design Criteria, ICI);
 *    wastewater 270 L/employee/day peaked with Harmon on the employee count, bounded 2–4
 *    (Peel Water & Wastewater Modelling Demand Table, Aug 2024, non-residential). Employment
 *    I&I is counted on the boundary of non-residential sites (mixed-use sites already count
 *    theirs with the dwellings).
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
    employment: { water: 300, maxDay: 1.4, peakHour: 3.0, wastewater: 270, peakMin: 2, peakMax: 4 },
    // Floor space per job (m²/job) by use, used to estimate jobs from application floor areas.
    m2PerJob: { industrial: 110, office: 25, retail: 45, hotel: 60, institutional: 50 },
  };

  const SECONDS_PER_DAY = 86400;

  /** Guess the dwelling type of a project from its type / description text. */
  function unitTypeOf(text) {
    const s = String(text || '');
    if (/apart|\bapts?\b|condo|tower|high[- ]?rise|mid[- ]?rise|storey|\bsty\b|\d\s*sty|mixed[- ]use|stacked|back[- ]to[- ]back|multi[- ]?(unit|res)|residential building|second (dwelling )?unit|secondary (dwelling )?(unit|suite)|basement (unit|apartment|suite)|additional (residential|dwelling) unit/i.test(s)) return 'apartment';
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

  // Jobs a project counts for a basis. Employment space has no unit-level build-out, so the
  // project's phase decides: committed = approved / permitted / under construction, left to
  // build = not yet permitted, completed = completed.
  const NOT_PERMITTED = new Set(['inception', 'review', 'approved']);
  function jobsFor(project, jobs, basis = 'all') {
    if (!(jobs > 0)) return 0;
    const ph = project.phase;
    if (ph === 'cancelled') return 0;
    if (basis === 'committed') return COMMITTED_PHASES.has(ph) ? jobs : 0;
    if (basis === 'remaining') return NOT_PERMITTED.has(ph) ? jobs : 0;
    if (basis === 'unbuilt') return ph !== 'completed' ? jobs : 0;
    if (basis === 'completed') return ph === 'completed' ? jobs : 0;
    return jobs;
  }

  /** Employment peaking factor: Harmon on the employee count, bounded by the Peel min / max. */
  function employmentPeaking(jobs, ec = DEFAULT_CRITERIA.employment) {
    if (!(jobs > 0)) return 0;
    return Math.min(ec.peakMax ?? 4, Math.max(ec.peakMin ?? 2, harmon(jobs)));
  }

  /** Water and wastewater for a number of jobs (L/s), plus I&I on a non-residential site area. */
  function employmentDemand(jobs, criteria = DEFAULT_CRITERIA, ha = 0) {
    const ec = { ...DEFAULT_CRITERIA.employment, ...(criteria.employment || {}) };
    const w = jobs * ec.water / SECONDS_PER_DAY, s = jobs * ec.wastewater / SECONDS_PER_DAY;
    const M = employmentPeaking(jobs, ec);
    const ii = ha * (criteria.wastewater && criteria.wastewater.infiltration != null ? criteria.wastewater.infiltration : DEFAULT_CRITERIA.wastewater.infiltration);
    return {
      jobs, area: { ha },
      water: { avg: w, maxDay: w * ec.maxDay, peakHour: w * ec.peakHour },
      wastewater: { avg: s, peakingFactor: M, peak: s * M, infiltration: ii, wetPeak: s * M + ii },
    };
  }

  /**
   * Aggregate estimate for a set of projects.
   * Harmon peaking is applied to the combined population (system-level peak),
   * which is lower than summing each site's individually peaked flow.
   */
  function estimate(projects, criteria = DEFAULT_CRITERIA, basis = 'all', jobsOf = null) {
    const units = { single: 0, town: 0, apartment: 0, unknown: 0 };
    let withUnits = 0, ha = 0, haEstimated = 0, jobs = 0, empHa = 0, withJobs = 0;
    for (const p of projects) {
      const j = jobsOf ? jobsFor(p, jobsOf(p), basis) : 0;
      if (j > 0) {
        jobs += j; withJobs++;
        if (!(p.units > 0) && p.siteAreaHa > 0) empHa += p.siteAreaHa;
      }
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
    const emp = { ...employmentDemand(jobs, criteria, empHa), projects: withJobs };
    // Residential and employment flows are peaked separately and added (as in a servicing
    // report), with I&I on both site areas.
    const combined = {
      water: { avg: wAvg + emp.water.avg, maxDay: wAvg * criteria.water.maxDay + emp.water.maxDay, peakHour: wAvg * criteria.water.peakHour + emp.water.peakHour },
      wastewater: { avg: sAvg + emp.wastewater.avg, peak: sAvg * M + emp.wastewater.peak, infiltration: ii + emp.wastewater.infiltration, wetPeak: sAvg * M + ii + emp.wastewater.wetPeak },
    };
    return {
      projects: projects.length,
      withUnits,
      units, totalUnits,
      pop, population,
      water: { avg: wAvg, maxDay: wAvg * criteria.water.maxDay, peakHour: wAvg * criteria.water.peakHour },
      area: { ha, estimatedHa: haEstimated },
      wastewater: { avg: sAvg, peakingFactor: M, peak: sAvg * M, infiltration: ii, wetPeak: sAvg * M + ii },
      employment: emp,
      combined,
    };
  }

  // ---- Build-out by dwelling type -------------------------------------------------------
  const Ph = () => root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);
  const ZERO = () => ({ single: 0, town: 0, apartment: 0, unknown: 0 });
  const sumOf = o => Object.values(o).reduce((t, v) => t + v, 0);

  /** Split an integer total in proportion to weights (largest remainder), so parts add up. */
  function apportion(total, weights) {
    const keys = Object.keys(weights), w = sumOf(weights), out = {};
    if (!(total > 0) || !(w > 0)) { for (const k of keys) out[k] = 0; return out; }
    let given = 0;
    const rem = keys.map(k => { const x = total * weights[k] / w; out[k] = Math.floor(x); given += out[k]; return [k, x - out[k]]; });
    rem.sort((a, b) => b[1] - a[1]);
    for (let i = 0; given < total; i++, given++) out[rem[i % rem.length][0]]++;
    return out;
  }

  // "299 single detached, 217 street townhouse and 52 back-to-back townhouse dwelling units",
  // "559 apartment units and 16 townhouses": counts by type in an application's description.
  // Stacked and back-to-back towns count with apartments, as for persons per unit.
  const MIX_RE = /(\d{1,3}(?:,\d{3})|\d{1,5})\s*(?:\(\d+\)\s*)?((?:[a-z][a-z-]*\s+){0,4}?)(single[- ]detached|single family|singles?\b|detached|semi[- ]detached|semis?\b|townhouses?|townhomes?|town ?house|towns\b|row ?houses?|back[- ]to[- ]back|stacked|apartments?|apt\b|condominium (?:apartment )?units?|condo units?)/gi;
  function mixFromText(text, units) {
    const t = String(text || '');
    const hits = [];
    for (const m of t.matchAll(MIX_RE)) {
      const n = Number(m[1].replace(/,/g, ''));
      if (!(n > 0) || n > 20000) continue;
      // Heights, lots, blocks and parking, not dwellings ("12 storey apartment", "19 reserve lots").
      if (/stor|sty|floor|level|metre|\bha\b|acre|lot|block|building|tower|phase|parking|space|bed/i.test(m[2] || '')) continue;
      if (/^\s*-?\s*(stor|sty)/i.test(t.slice(m.index + m[1].length, m.index + m[1].length + 8))) continue;
      const w = m[3].toLowerCase();
      hits.push({ n, k: /stacked|back/.test(w) ? 'apartment' : /town|row/.test(w) ? 'town' : /single|detached|semi/.test(w) ? 'single' : 'apartment' });
    }
    // "287 townhouse units consisting of 104 standard, 164 back-to-back and 19 rear-lane":
    // drop a summary figure that equals the stated total when the parts add up to it.
    let total = hits.reduce((s2, h) => s2 + h.n, 0);
    if (units > 0 && total > units) {
      const i = hits.findIndex(h => h.n === units);
      if (i >= 0 && total - units === units) { hits.splice(i, 1); total -= units; }
    }
    const out = { single: 0, town: 0, apartment: 0 };
    for (const h of hits) out[h.k] += h.n;
    return out;
  }

  // Planned units by type: a published unit mix, else counts in the application text, else
  // the type read from the project's description.
  function plannedByType(project, planned) {
    const out = ZERO();
    const m = project.unitMix;
    if (m) {
      const mix = { single: (m.single || 0) + (m.semi || 0), town: m.town || 0, apartment: m.apartment || 0 };
      if (sumOf(mix) > 0) return { split: { ...out, ...apportion(planned, mix) }, source: 'mix' };
    }
    let best = null;
    for (const r of project.records || []) {
      if (r.kind !== 'application' || r.phase === 'cancelled' || r.minor) continue;
      const mix = mixFromText(r.description, r.units);
      const tot = sumOf(mix);
      if (!tot) continue;
      const cover = Math.min(tot, planned) / planned;
      if (!best || cover > best.cover) best = { mix, tot, cover };
    }
    if (best && best.cover >= 0.5) {
      if (best.tot >= planned) return { split: { ...out, ...apportion(planned, best.mix) }, source: 'text' };
      return { split: { ...best.mix, unknown: planned - best.tot }, source: 'text' };
    }
    const text = [(project.types || []).join(' '), project.description || ''].join(' ');
    out[unitTypeOf(text)] = planned;
    return { split: out, source: 'guess' };
  }

  // Units on permits by type, one figure per building as in the build-out (largest of a
  // building's conditional / full / revised permits), typed from each permit's own text.
  function permitsByType(permits) {
    const P = Ph();
    const byKey = new Map();
    for (const r of permits) {
      if (!P.permitAddsUnits(r)) continue;
      const k = r.fileKey || P.canonRef(r.ref) || P.normalizeAddress(r.address) || r.uid;
      const prev = byKey.get(k);
      if (!prev || r.units > prev.units) byKey.set(k, r);
    }
    const out = ZERO();
    for (const r of byKey.values()) out[unitTypeOf(`${r.type || ''} ${r.description || ''}`)] += r.units;
    return out;
  }
  // Permit units with no type in their text go to the types that still have room under
  // their cap (planned, or permitted for completions); what doesn't fit stays untyped.
  function placeUntyped(typed, caps) {
    const out = { ...typed };
    const room = {};
    for (const k of ['single', 'town', 'apartment']) room[k] = Math.max(0, (caps[k] || 0) - out[k]);
    const give = Math.min(out.unknown, sumOf(room));
    const add = apportion(give, room);
    for (const k in add) out[k] += add[k];
    out.unknown -= give;
    return out;
  }

  /**
   * Planned / permitted / completed / left to build, by dwelling type, for a project with a
   * build-out. Columns add up to the build-out totals. source: 'mix' (published unit mix),
   * 'text' (counts in the application description), 'permits' (types on the building permits,
   * rest from the description) or 'guess' (type read from the description).
   */
  function typeBuildout(project) {
    const b = project.buildout;
    if (!b) return null;
    let { split: planned, source } = plannedByType(project, b.planned);
    const permits = (project.records || []).filter(r => r.kind === 'permit' && r.phase !== 'cancelled');
    const typed = permitsByType(permits);
    // With no stated mix, the permits' own types are better evidence for the units they
    // cover; the rest of the plan keeps the type read from the description.
    if (source === 'guess' && typed.single + typed.town + typed.apartment > 0) {
      const guess = Object.keys(planned).find(k => planned[k] > 0) || 'unknown';
      const known = { single: typed.single, town: typed.town, apartment: typed.apartment, unknown: 0 };
      const k = sumOf(known);
      planned = k >= b.planned ? { ...ZERO(), ...apportion(b.planned, known) } : { ...known, [guess]: known[guess] + b.planned - k };
      source = 'permits';
    }
    const permitted = placeUntyped(typed, planned);
    const completed = placeUntyped(permitsByType(permits.filter(r => r.phase === 'completed')), permitted);
    const gap = {};
    for (const k in planned) gap[k] = Math.max(0, planned[k] - permitted[k]);
    const left = sumOf(gap) === b.remaining ? gap : { ...ZERO(), ...apportion(b.remaining, gap) };
    if (sumOf(left) < b.remaining) left.unknown += b.remaining - sumOf(left);
    const rows = {};
    for (const t of UNIT_TYPES) rows[t.key] = { planned: planned[t.key], permitted: permitted[t.key], completed: completed[t.key], left: left[t.key] };
    return { rows, source };
  }

  /** L/s -> ML/day */
  const toMLd = lps => lps * SECONDS_PER_DAY / 1e6;

  const api = { UNIT_TYPES, DEFAULT_CRITERIA, COMMITTED_PHASES, AREA_PER_UNIT, areaFor, unitTypeOf, unitSplit, unitsFor, harmon, estimate, toMLd, jobsFor, employmentPeaking, employmentDemand, mixFromText, typeBuildout, apportion };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDemand = api;
})(typeof window !== 'undefined' ? window : globalThis);
