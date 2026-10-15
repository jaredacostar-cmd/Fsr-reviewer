/*
 * Facility registry and facility ↔ capital rules (pure, unit-tested).
 *   - wastewater pumping stations: located stations (data/servicing.json, from the Region's
 *     Wastewater Pumping Station layer) joined by name to the 2020 Master Plan Table 6 capacities
 *     (scripts/ww-pumping-stations.json);
 *   - one registry of facility points (water facilities, wastewater pumping stations, DC capital
 *     map facilities) for EA placement and capital links;
 *   - candidate rules for "capital work at a facility", modelled side by side so a rule can be
 *     chosen from measured results.
 */
'use strict';
const C = require('./capital-lib.js');

const STATION_WORDS = /\b(sewage|sewer|sanitary|wastewater|pumping|pump|stn|station|sps|ps|sew|st(?=\s*$))\b\.?/gi;
/** Core name tokens of a station ("BOLTON N HILL SEWAGE PUMPING" → BOLTON HILL). */
function stationKey(name) {
  const s = String(name || '').replace(/['’]s\b/gi, '').replace(/['’]/g, '').replace(/\bsew\.\s*pump(ing)?\s*stn\b/gi, ' ').replace(STATION_WORDS, ' ');
  return [...new Set(C.streetTokens(s))].sort().join(' ');
}
function stationKind(name) {
  if (/leachate/i.test(name)) return 'leachate';
  if (/lift station/i.test(name)) return 'lift';
  return 'pumping';
}
const titleCase = s => String(s).toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, a, b) => a + b.toUpperCase()).replace(/\bMc([a-z])/g, (m, a) => `Mc${a.toUpperCase()}`);

/**
 * Located stations + Master Plan table → [{ id, name, kind, lnglat, municipality, role, pumps,
 * firmLs, mpSystem, mpNote, sourceName }]; table rows with no location are returned as `unlocated`.
 */
function joinStations(located, table) {
  const byKey = new Map(table.map(t => [stationKey(t.name), t]));
  const used = new Set();
  const facilities = located.map((p, i) => {
    const k = stationKey(p.name), t = byKey.get(k);
    if (t) used.add(k);
    const kind = stationKind(p.name);
    return {
      id: `ww${i + 1}`,
      name: t ? t.name : titleCase(String(p.name).replace(STATION_WORDS, ' ').replace(/\s+/g, ' ').trim()),
      kind, system: 'wastewater', lnglat: p.lnglat,
      municipality: t ? t.municipality : null, role: t ? t.role : null, pumps: t ? t.pumps : null, firmLs: t ? t.firmLs : null,
      mpSystem: t ? t.system : null, mpNote: t?.mpNote || null, sourceName: p.name,
      capacityFrom: t ? '2020 Master Plan Vol. 4 Table 6' : null,
    };
  });
  const unlocated = table.filter(t => !used.has(stationKey(t.name))).map(t => t.name);
  return { facilities, unlocated };
}

const GENERIC = new Set(['WATER', 'WASTEWATER', 'TREATMENT', 'PLANT', 'WTP', 'WWTP', 'RESOURCE', 'RECOVERY', 'FACILITY', 'PUMPING', 'STATION', 'PS', 'SPS', 'RESERVOIR', 'ELEVATED', 'TANK', 'SEWAGE', 'SEWER', 'SANITARY', 'STN', 'BOOSTER',
  'ROAD', 'RD', 'STREET', 'ST', 'DRIVE', 'DR', 'AVENUE', 'AVE', 'BOULEVARD', 'BLVD', 'CRESCENT', 'CRES', 'COURT', 'CT', 'CRT', 'TRAIL', 'PARKWAY', 'MEWS']);
// Core words of a facility name; directions and numbers are kept (Hanlan ≠ Hanlan West, Jack Darling 2 ≠ 3).
const coreOf = s => [...new Set(String(s || '').toUpperCase().replace(/['’]S\b/g, '').replace(/['’.]/g, '').split(/[^A-Z0-9]+/).filter(t => t && !GENERIC.has(t)))].sort().join(' ');
const isPlant = k => k === 'plant';
// Same facility by name: identical core words on one of its names, and plants only match plants.
function sameFacility(o, f) {
  if (isPlant(o.kind) !== isPlant(f.kind)) return false;
  const fn = new Set([f.name, f.label, f.plant].filter(Boolean).map(coreOf).filter(Boolean));
  return [o.name, ...(o.aliases || [])].map(coreOf).some(a => a && fn.has(a));
}

/**
 * One list of facility points: { key, name, system, kind, lnglat, source, aliases }.
 * DC facilities sharing a name with a located facility are merged into it (dcName recorded).
 */
function registry({ waterFacilities = [], wwFacilities = [], wwPlants = [], dcInfra = {} }) {
  const out = [];
  for (const p of wwPlants) if (p.lnglat) out.push({ key: `wastewater:plant:${p.name}`, name: p.name, system: 'wastewater', kind: 'plant', lnglat: p.lnglat, source: 'wastewater plants', aliases: [p.label, p.full].filter(Boolean) });
  for (const f of waterFacilities) if (f.lnglat) out.push({ key: `water:${f.id}`, name: f.name, system: 'water', kind: f.kind, lnglat: f.lnglat, source: 'water facilities', aliases: [...new Set(f.parts || [])] });
  for (const f of wwFacilities) if (f.lnglat && f.kind === 'pumping') out.push({ key: `wastewater:${f.id}`, name: f.name, system: 'wastewater', kind: 'pumping_station', lnglat: f.lnglat, source: 'wastewater pumping stations', aliases: [f.sourceName] });
  for (const sys of ['water', 'wastewater']) for (const f of dcInfra[sys]?.facilities || []) {
    if (!f.g || f.approx) continue;
    const near = out.find(o => o.system === sys && C.haversine(o.lnglat, f.g) < 1500 && sameFacility(o, f));
    if (near) { near.dcName = f.name; near.aliases.push(f.name, f.label, f.plant); continue; }
    out.push({ key: `${sys}:dc:${f.name}`, name: f.name, system: sys, kind: f.kind, lnglat: f.g, source: 'DC capital map', aliases: [f.label, f.plant].filter(Boolean), dcName: f.name });
  }
  for (const o of out) o.aliases = [...new Set(o.aliases.filter(Boolean))];
  return out;
}

// Distance (m) from a point to a capital record's line.
function distToRecord(pt, r) {
  const paths = r.geometry ? (r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.coordinates) : [];
  const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 110574;
  let best = Infinity;
  for (const p of paths) for (let i = 1; i < p.length; i++) {
    const ax = (p[i - 1][0] - pt[0]) * kx, ay = (p[i - 1][1] - pt[1]) * ky, bx = (p[i][0] - pt[0]) * kx, by = (p[i][1] - pt[1]) * ky;
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
  }
  return best;
}
const REHAB = /trenchless|relining|rehab|smh|repair|inlet/i;

/**
 * Candidate rules for "capital work at a facility":
 *   project        same project number as one of the facility's DC items
 *   near:<d>       the capital line passes within d m of the facility point
 *   nearsys:<d>    near:<d> and the same system (water / wastewater)
 *   nearsysnew:<d> nearsys:<d>, excluding rehabilitation work types (trenchless, relining, repairs)
 * Returns links [{ facility, capital, rule, distM }].
 */
function facilityCapitalLinks(facilities, records, rule, dcFacilities = {}) {
  const [kind, dStr] = rule.split(':');
  const d = +dStr;
  const out = [];
  if (kind === 'project') {
    const projOf = new Map();
    for (const sys of ['water', 'wastewater']) for (const fc of dcFacilities[sys] || []) for (const it of fc.items || []) {
      const p = C.normProj(it.proj); if (p) (projOf.get(fc.name) || projOf.set(fc.name, new Set()).get(fc.name)).add(p);
    }
    for (const f of facilities) {
      const ps = projOf.get(f.dcName || f.name); if (!ps) continue;
      for (const r of records) if (ps.has(C.normProj(r.projectNumber))) out.push({ facility: f.key, capital: r.id, rule, distM: Math.round(distToRecord(f.lnglat, r)) });
    }
    return out;
  }
  for (const f of facilities) for (const r of records) {
    if (kind !== 'near' && r.system !== f.system) continue;
    if (kind === 'nearsysnew' && REHAB.test(r.workType || '')) continue;
    const m = distToRecord(f.lnglat, r);
    if (m <= d) out.push({ facility: f.key, capital: r.id, rule, distM: Math.round(m) });
  }
  return out;
}

/** Measured results of each rule (aggregate only: no record-level capital values). */
function modelRules(facilities, records, rules, dcFacilities) {
  const byId = new Map(records.map(r => [r.id, r]));
  const res = {};
  const base = new Set(facilityCapitalLinks(facilities, records, 'project', dcFacilities).map(l => `${l.facility}|${l.capital}`));
  for (const rule of rules) {
    const links = facilityCapitalLinks(facilities, records, rule, dcFacilities);
    const perFac = {}, perCap = {};
    for (const l of links) { perFac[l.facility] = (perFac[l.facility] || 0) + 1; perCap[l.capital] = (perCap[l.capital] || 0) + 1; }
    const tally = f => links.reduce((m, l) => { const k = f(byId.get(l.capital)); m[k] = (m[k] || 0) + 1; return m; }, {});
    res[rule] = {
      links: links.length,
      facilitiesLinked: Object.keys(perFac).length,
      maxPerFacility: Math.max(0, ...Object.values(perFac)),
      capitalOnSeveralFacilities: Object.values(perCap).filter(n => n > 1).length,
      agreesWithProject: links.filter(l => base.has(`${l.facility}|${l.capital}`)).length,
      byStatus: tally(r => r.status),
      byWorkType: Object.fromEntries(Object.entries(tally(r => r.workType || '(blank)')).sort((a, b) => b[1] - a[1]).slice(0, 6)),
    };
  }
  return res;
}

module.exports = { stationKey, stationKind, joinStations, registry, distToRecord, facilityCapitalLinks, modelRules, REHAB };
