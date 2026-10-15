/*
 * Pure helpers for the Region's capital projects layer ("Proposed Projects - Line") and its
 * links to the DC capital program. No network access: scripts/build-capital.js fetches, this
 * module cleans, classifies, measures and matches, so every rule is unit-tested.
 *
 *   - KEEP is the only set of source fields that survive; personnel / contractor / conflict /
 *     comment fields never reach data/capital.json (privacy rule).
 *   - status, system, length (m) and slip (months) are derived.
 *   - DC works (data/dc-infra.json lines, scripts/dc-facilities.json items) are matched by
 *     component number, then project number, then by street + overlapping line.
 */
'use strict';

// Source field → output key. Field names on the layer vary in case and abbreviation, so each
// output key lists the names it accepts (first present wins).
const KEEP = {
  projectNumber: ['ProjectNumber'],
  street: ['StreetName'],
  municipality: ['Municipality'],
  ward: ['Ward'],
  workType: ['WorkType'],
  phase: ['Phase'],
  projectStatus: ['ProjectStatus'],
  from: ['LocationFrom'],
  to: ['LocationTo'],
  tenderTarget: ['TenderDateTarget'],
  tenderActual: ['TenderDateActual'],
  awardTarget: ['AwardDateTarget'],
  awardActual: ['AwardDateActual'],
  startTarget: ['ConstructionStartDateTarget'],
  startActual: ['ConstructionStartDateActual'],
  substantialTarget: ['ConstructionSubstantialCompleti', 'SubstantialCompletionDateTarget', 'SubstantialCompletionTarget', 'SubstantialCompDateTarget', 'SubstantialCompletionDateTarg'],
  substantialActual: ['ConstructionSubstantialComple_1', 'SubstantialCompletionDateActual', 'SubstantialCompletionActual', 'SubstantialCompDateActual', 'SubstantialCompletionDateActu'],
  percentComplete: ['PercentageOfConstructionComplet', 'PercentageOfConstructionComplete'],
  website: ['ProjectWebsite'],
  lastUpdate: ['LastUpdate'],
  componentId: ['ComponentID'],
};
// Never stored, whatever the layer returns (checked again on the output by the tests).
const NEVER = ['ProjectManager', 'Inspector', 'Contractor', 'ContractAdmin', 'Consultant', 'ConflictResolved', 'ConflictResolutionDate', 'ConflictNotes', 'Comments', 'AssignmentID'];
const DATE_KEYS = ['tenderTarget', 'tenderActual', 'awardTarget', 'awardActual', 'startTarget', 'startActual', 'substantialTarget', 'substantialActual', 'lastUpdate'];
const MILESTONES = ['tender', 'award', 'start', 'substantial'];
const STATUSES = ['planned', 'tendered', 'awarded', 'under construction', 'substantially complete', 'complete', 'unknown'];
const SYSTEMS = ['water', 'wastewater', 'roads', 'other'];

const blank = v => v == null || (typeof v === 'string' && !v.trim());
// Epoch ms (ArcGIS) or a date string → YYYY-MM-DD; anything else → null.
function isoDate(v) {
  if (blank(v)) return null;
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v).trim());
  if (isNaN(d)) return null;
  const y = d.getUTCFullYear();
  if (y < 1950 || y > 2100) return null;
  return d.toISOString().slice(0, 10);
}

// Case-insensitive field lookup.
function pick(attrs, names) {
  const lower = {};
  for (const k of Object.keys(attrs || {})) lower[k.toLowerCase()] = k;
  for (const n of names) { const k = lower[n.toLowerCase()]; if (k != null && !blank(attrs[k])) return attrs[k]; }
  return null;
}

/** Keep only the whitelisted fields, trimmed; dates as YYYY-MM-DD. */
function cleanAttributes(attrs) {
  const out = {};
  for (const [key, names] of Object.entries(KEEP)) {
    let v = pick(attrs, names);
    if (DATE_KEYS.includes(key)) v = isoDate(v);
    else if (key === 'percentComplete') v = v == null || isNaN(+v) ? null : Math.max(0, Math.min(100, Math.round(+v)));
    else if (typeof v === 'string') v = v.replace(/\s+/g, ' ').trim();
    else if (v != null) v = String(v);
    if (key === 'website' && v && !/^https?:\/\//i.test(v)) v = null;
    out[key] = v == null ? null : v;
  }
  return out;
}

/** System from WorkType. */
function systemOf(workType) {
  const w = String(workType || '').toLowerCase();
  if (!w) return 'other';
  // Layer codes: SAN-…, WM-…, ROAD-… (and a few spelled out: "Sanitary - Trenchless", "Road - Storm sewer").
  if (/^road\b/.test(w)) return 'roads';
  if (/^san\b|^sanitary|^ww\b|wastewater|sewage|forcemain|force main/.test(w) || (/\bsewer\b/.test(w) && !/storm/.test(w))) return 'wastewater';
  if (/^wm\b|water ?main|^water\b|reservoir|elevated tank/.test(w)) return 'water';
  if (/road|intersection|bridge|traffic|sidewalk|multi-use|cycle|culvert|noise ?wall/.test(w)) return 'roads';
  return 'other';
}

/**
 * Status from Phase, ProjectStatus and dates. The layer's Phase values map as below; a record whose
 * Phase says nothing usable falls back to its dates. ON-HOLD / CANCELLED / DEFERRED read "unknown"
 * (the raw phase stays on the record for display).
 */
const PHASE_STATUS = [
  [/^complete|^closed/, 'complete'],
  [/substantial|^maintenance|warranty/, 'substantially complete'],
  [/^construction|^restoration/, 'under construction'],
  [/^award/, 'awarded'],
  [/^procurement|^rfp\b|^rfq|^rft|^tender/, 'tendered'],
  [/^design|^planned|^planning|^initiation|^ea\b|environmental assessment|^study|^future|^proposed|^pre-?construction/, 'planned'],
  [/^on.?hold|^cancel|^deferred/, 'unknown'],
];
function statusOf(r) {
  const ph = String(r.phase || '').trim().toLowerCase();
  const ps = String(r.projectStatus || '').trim().toLowerCase();
  if (/^complete/.test(ps)) return 'complete';
  for (const [re, st] of PHASE_STATUS) if (re.test(ph)) {
    if (st === 'unknown') return 'unknown';
    // A procurement / planned record whose actual dates are further along moves forward on them.
    if (st === 'planned' || st === 'tendered') {
      const byDate = statusFromDates(r), order = STATUSES.indexOf.bind(STATUSES);
      return byDate !== 'unknown' && byDate !== 'planned' && order(byDate) > order(st) ? byDate : st;
    }
    return st;
  }
  return statusFromDates(r);
}
function statusFromDates(r) {
  if (r.substantialActual) return 'substantially complete';
  if (r.percentComplete >= 100) return 'substantially complete';
  if (r.startActual || r.percentComplete > 0) return 'under construction';
  if (r.awardActual) return 'awarded';
  if (r.tenderActual) return 'tendered';
  if (r.tenderTarget || r.awardTarget || r.startTarget || r.substantialTarget) return 'planned';
  return 'unknown';
}

// ---- geometry ---------------------------------------------------------------------------------
const R = 6371008.8;
function haversine(a, b) {
  const toR = Math.PI / 180, dLat = (b[1] - a[1]) * toR, dLng = (b[0] - a[0]) * toR;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * toR) * Math.cos(b[1] * toR) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
// [[x,y],...] paths of a LineString / MultiLineString (or bare array of paths).
function pathsOf(g) {
  if (!g) return [];
  if (Array.isArray(g)) return typeof g[0][0] === 'number' ? [g] : g;
  if (g.type === 'LineString') return [g.coordinates];
  if (g.type === 'MultiLineString') return g.coordinates;
  if (g.paths) return g.paths;
  return [];
}
function lengthM(g) {
  let m = 0;
  for (const p of pathsOf(g)) for (let i = 1; i < p.length; i++) m += haversine(p[i - 1], p[i]);
  return Math.round(m);
}

// Inverse UTM (NAD83 / zone 17N = EPSG:26917; GRS80) → [lng, lat]. Used when the server
// returns projected coordinates instead of honouring outSR=4326.
function utmToLngLat(E, N, zone = 17) {
  const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996;
  const e2 = f * (2 - f), ep2 = e2 / (1 - e2), e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const x = E - 500000, M = N / k0;
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));
  const p1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu) + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu) + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const s = Math.sin(p1), c = Math.cos(p1), t = Math.tan(p1);
  const N1 = a / Math.sqrt(1 - e2 * s * s), T1 = t * t, C1 = ep2 * c * c, R1 = a * (1 - e2) / (1 - e2 * s * s) ** 1.5, D = x / (N1 * k0);
  const lat = p1 - (N1 * t / R1) * (D * D / 2 - (5 + 3 * T1 + 10 * C1 - 4 * C1 * C1 - 9 * ep2) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 * T1 - 252 * ep2 - 3 * C1 * C1) * D ** 6 / 720);
  const lng0 = (zone * 6 - 183) * Math.PI / 180;
  const lng = lng0 + (D - (1 + 2 * T1 + C1) * D ** 3 / 6 + (5 - 2 * C1 + 28 * T1 - 3 * C1 * C1 + 8 * ep2 + 24 * T1 * T1) * D ** 5 / 120) / c;
  return [lng * 180 / Math.PI, lat * 180 / Math.PI];
}
const round6 = n => Math.round(n * 1e6) / 1e6;
/** Paths in WGS84 with 6 decimals; projected (metre) coordinates are converted from UTM 17N. */
function toWgs84Paths(g) {
  return pathsOf(g).map(p => p.map(([x, y]) => (Math.abs(x) > 360 || Math.abs(y) > 90 ? utmToLngLat(x, y) : [x, y])).map(([x, y]) => [round6(x), round6(y)]))
    .filter(p => p.length >= 2);
}

// Local flat projection (metres) around a reference latitude.
function projector(lat0) {
  const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
  return ([x, y]) => [x * kx, y * ky];
}
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy;
  let t = L ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
// Points every `step` metres along projected paths.
function sample(paths, step) {
  const pts = [];
  for (const p of paths) {
    pts.push(p[0]);
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      for (let d = step; d < L; d += step) pts.push([a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]);
      pts.push(b);
    }
  }
  return pts;
}
function bbox(paths) {
  const b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of paths) for (const [x, y] of p) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); }
  return b;
}
/**
 * Share (0–1) of the shorter line lying within `tol` metres of the longer one, sampled every
 * 5 m. Lines are WGS84 geometries / path arrays.
 */
function overlapShare(g1, g2, tol = 30) {
  const p1 = pathsOf(g1), p2 = pathsOf(g2);
  if (!p1.length || !p2.length) return 0;
  const b1 = bbox(p1), b2 = bbox(p2), pad = tol / 80000;
  if (b1[2] + pad < b2[0] || b2[2] + pad < b1[0] || b1[3] + pad < b2[1] || b2[3] + pad < b1[1]) return 0;
  const proj = projector((b1[1] + b1[3]) / 2);
  const P1 = p1.map(p => p.map(proj)), P2 = p2.map(p => p.map(proj));
  const [short, long] = lengthM(g1) <= lengthM(g2) ? [P1, P2] : [P2, P1];
  const pts = sample(short, 5);
  if (!pts.length) return 0;
  let near = 0;
  for (const pt of pts) {
    let best = Infinity;
    for (const p of long) for (let i = 1; i < p.length && best > tol; i++) best = Math.min(best, segDist(pt, p[i - 1], p[i]));
    if (best <= tol) near++;
  }
  return near / pts.length;
}

// ---- dates / slip -----------------------------------------------------------------------------
function monthsBetween(a, b) {
  const da = new Date(a), db = new Date(b);
  return Math.round((db - da) / (1000 * 60 * 60 * 24 * 30.4375));
}
/**
 * Slip per milestone: actual date minus original target, in whole months (positive = later).
 * Only when both the target and the actual exist; null when no milestone has both.
 */
function slipOf(r) {
  const out = {};
  for (const m of MILESTONES) {
    const t = r[`${m}Target`], a = r[`${m}Actual`];
    if (t && a) out[m] = monthsBetween(t, a);
  }
  return Object.keys(out).length ? out : null;
}

// ---- streets / numbers -----------------------------------------------------------------------
const SUFFIX = { ROAD: 'RD', RD: 'RD', STREET: 'ST', ST: 'ST', DRIVE: 'DR', DR: 'DR', AVENUE: 'AVE', AVE: 'AVE', AV: 'AVE', BOULEVARD: 'BLVD', BLVD: 'BLVD', LINE: 'LINE', SIDEROAD: 'SDRD', SDRD: 'SDRD', SIDE: 'SIDE', COURT: 'CRT', CRT: 'CRT', CT: 'CRT', CRESCENT: 'CRES', CRES: 'CRES', PARKWAY: 'PKWY', PKWY: 'PKWY', TRAIL: 'TRL', TRL: 'TRL', HIGHWAY: 'HWY', HWY: 'HWY', WAY: 'WAY', LANE: 'LANE', GATE: 'GATE', PLACE: 'PL', PL: 'PL', CIRCLE: 'CIR', TERRACE: 'TERR' };
const DIRS = new Set(['N', 'S', 'E', 'W', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
/** Core street-name tokens: upper case, suffix and direction words removed. */
function streetTokens(s) {
  return String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(t => t && !SUFFIX[t] && !DIRS.has(t) && t !== 'THE');
}
/** True when every core token of `street` appears in `text` (both non-empty). */
function sameStreet(street, text) {
  const a = streetTokens(street);
  if (!a.length) return false;
  const b = new Set(streetTokens(text));
  return a.every(t => b.has(t));
}
const normProj = s => { const m = /(\d{2})\s*-\s*(\d{4})/.exec(String(s || '')); return m ? `${m[1]}-${m[2]}` : null; };
const normComp = s => { const m = /\d{4,6}/.exec(String(s || '')); return m ? String(+m[0]) : null; };

// ---- records ---------------------------------------------------------------------------------
/** Source feature (attributes + geometry) → output record. */
function toRecord(feature, i) {
  const attrs = feature.attributes || feature.properties || {};
  const r = cleanAttributes(attrs);
  const paths = toWgs84Paths(feature.geometry);
  r.id = stableId(r, paths);
  r.contract = contractKey(r);
  r.system = systemOf(r.workType);
  r.status = statusOf(r);
  r.lengthM = paths.length ? lengthM(paths) : null;
  r.slip = slipOf(r);
  r.geometry = paths.length ? (paths.length === 1 ? { type: 'LineString', coordinates: paths[0] } : { type: 'MultiLineString', coordinates: paths }) : null;
  return r;
}
// Stable ids: component number when present, else project number + a short hash of the line's
// rounded end points, so ids survive reordering and additions on the layer (Watch / This week /
// overrides key on them).
function stableId(r, paths) {
  if (r.componentId && normComp(r.componentId)) return `c${normComp(r.componentId)}`;
  const ends = paths.length ? [paths[0][0], paths[paths.length - 1][paths[paths.length - 1].length - 1]].map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).sort().join('|') : String(r.street || '');
  const h = require('crypto').createHash('sha1').update(`${r.projectNumber || ''}|${ends}`).digest('hex').slice(0, 8);
  return `p${normProj(r.projectNumber) || 'x'}-${h}`;
}
/** Contract a record belongs to: its project page (one page covers many segments), else its project number. */
function contractKey(r) {
  if (r.website) return `web:${String(r.website).toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '').replace(/\/+$/, '')}`;
  return r.projectNumber ? `proj:${normProj(r.projectNumber) || r.projectNumber}` : null;
}
// Unique ids (a component can come back as several features).
function uniqueIds(records) {
  const seen = {};
  for (const r of records) { const n = seen[r.id] = (seen[r.id] || 0) + 1; if (n > 1) r.id = `${r.id}.${n}`; }
  return records;
}

// ---- DC works --------------------------------------------------------------------------------
/**
 * DC works as matchable units: lines grouped by system + component (or one per line when the
 * component is missing), and facility items. Each: key, system, kind, proj, comps, year
 * (construction), geometry (lines only), name, text.
 */
function dcWorks(dcInfra, dcFacilities) {
  const works = [];
  for (const sys of ['water', 'wastewater']) {
    const groups = new Map();
    (dcInfra?.[sys]?.lines || []).forEach((ln, i) => {
      const c = normComp(ln.c), key = c ? `${sys}:line:c${c}` : `${sys}:line:${i}`;
      if (!groups.has(key)) groups.set(key, { key, system: sys, kind: 'line', proj: normProj(ln.p), comps: c ? [c] : [], year: ln.y || null, diameter: ln.d || null, name: ln.n || null, text: ln.t || null, paths: [] });
      const w = groups.get(key);
      w.paths.push(ln.g);
      if (ln.d && !w.diameter) w.diameter = ln.d;
      if (ln.n && !w.name) w.name = ln.n;
      if (ln.y && (!w.year || ln.y < w.year)) w.year = ln.y;
    });
    works.push(...groups.values());
    for (const fc of (dcFacilities?.[sys] || [])) for (const it of fc.items || []) {
      const cons = (it.phases || []).filter(p => p[0] === 'C').map(p => p[1]);
      works.push({ key: `${sys}:fac:${fc.name}:${it.proj}:${it.what}`, system: sys, kind: 'facility', facility: fc.name, proj: normProj(it.proj), comps: (it.phases || []).map(p => normComp(p[2])).filter(Boolean), year: cons.length ? Math.min(...cons) : null, phases: it.phases || [], name: `${fc.name} – ${it.what}`, text: null, paths: [] });
    }
  }
  return works;
}

const CONF_RANK = { high: 3, medium: 2, low: 1 };
/**
 * Match DC works to capital records.
 *   1. component number (DC phase/line component = capital ComponentID) → high
 *   2. project number (same ProjectNumber) → medium (a project spans several components)
 *   3. lines only: overlap ≥ 50 % of the shorter within 30 m AND the capital street named in the
 *      DC label → medium; overlap alone (the DC line carries no street name) → low
 * Overrides (accept / reject / reassign) apply last.
 */
function matchDc(works, records, overrides = {}, { tol = 30, share = 0.5 } = {}) {
  const byComp = new Map(), byProj = new Map();
  for (const r of records) {
    const c = normComp(r.componentId), p = normProj(r.projectNumber);
    if (c) (byComp.get(c) || byComp.set(c, []).get(c)).push(r);
    if (p) (byProj.get(p) || byProj.set(p, []).get(p)).push(r);
  }
  const links = [];
  const add = (w, r, method, confidence, extra) => links.push({ dc: w.key, capital: r.id, method, confidence, ...extra });
  for (const w of works) {
    const found = new Set();
    for (const c of w.comps) for (const r of byComp.get(c) || []) if (!found.has(r.id)) { found.add(r.id); add(w, r, 'component', 'high'); }
    if (!found.size && w.proj) for (const r of byProj.get(w.proj) || []) if (!found.has(r.id)) { found.add(r.id); add(w, r, 'project', 'medium'); }
    if (!found.size && w.kind === 'line') {
      for (const r of records) {
        if (!r.geometry || r.system !== w.system) continue;
        const sh = overlapShare(w.paths, r.geometry, tol);
        if (sh < share) continue;
        const named = sameStreet(r.street, `${w.name || ''} ${w.text || ''}`);
        add(w, r, named ? 'street+overlap' : 'overlap', named ? 'medium' : 'low', { overlap: Math.round(sh * 100) / 100 });
      }
    }
  }
  return applyOverrides(links, overrides);
}

/**
 * Overrides: { links: [{ dc, capital, action: 'accept' | 'reject' | 'reassign', to }] }.
 *   accept   → the link is kept (added when missing) as method 'manual', confidence high
 *   reject   → the link is removed
 *   reassign → the DC work's links to `capital` move to `to`, method 'manual', confidence high
 */
function applyOverrides(links, overrides) {
  let out = links.slice();
  for (const o of (overrides && overrides.links) || []) {
    if (!o || !o.dc) continue;
    const same = l => l.dc === o.dc && (!o.capital || l.capital === o.capital);
    if (o.action === 'reject') out = out.filter(l => !same(l));
    else if (o.action === 'accept' && o.capital) {
      out = out.filter(l => !same(l));
      out.push({ dc: o.dc, capital: o.capital, method: 'manual', confidence: 'high' });
    } else if (o.action === 'reassign' && o.to) {
      out = out.filter(l => !same(l));
      out.push({ dc: o.dc, capital: o.to, method: 'manual', confidence: 'high' });
    }
  }
  return out;
}

const yearOf = d => (d ? +d.slice(0, 4) : null);
/** Audit of the match: counts, unmatched both ways, low-confidence links, schedule differences. */
function audit(works, records, links) {
  const byId = new Map(records.map(r => [r.id, r]));
  const linkedDc = new Set(links.map(l => l.dc)), linkedCap = new Set(links.map(l => l.capital));
  const methods = {};
  for (const l of links) methods[l.method] = (methods[l.method] || 0) + 1;
  const scheduleDiffs = [];
  for (const w of works) {
    if (!w.year) continue;
    const caps = links.filter(l => l.dc === w.key).map(l => byId.get(l.capital)).filter(Boolean);
    const yrs = [...new Set(caps.map(r => yearOf(r.startActual || r.startTarget)).filter(Boolean))];
    if (yrs.length && !yrs.includes(w.year)) scheduleDiffs.push({ dc: w.key, proj: w.proj, dcYear: w.year, capitalStartYears: yrs.sort() });
  }
  const dcSummary = w => ({ dc: w.key, system: w.system, kind: w.kind, proj: w.proj, comps: w.comps, year: w.year, name: w.name });
  return {
    counts: {
      dcWorks: works.length, dcMatched: works.filter(w => linkedDc.has(w.key)).length,
      dcLines: works.filter(w => w.kind === 'line').length, dcLinesMatched: works.filter(w => w.kind === 'line' && linkedDc.has(w.key)).length,
      dcFacilityItems: works.filter(w => w.kind === 'facility').length, dcFacilityItemsMatched: works.filter(w => w.kind === 'facility' && linkedDc.has(w.key)).length,
      capitalRecords: records.length, capitalMatched: records.filter(r => linkedCap.has(r.id)).length,
      links: links.length, byMethod: methods,
      byConfidence: { high: links.filter(l => l.confidence === 'high').length, medium: links.filter(l => l.confidence === 'medium').length, low: links.filter(l => l.confidence === 'low').length },
    },
    unmatchedDc: works.filter(w => !linkedDc.has(w.key)).map(dcSummary),
    unmatchedCapital: records.filter(r => !linkedCap.has(r.id) && (r.system === 'water' || r.system === 'wastewater')).map(r => ({ id: r.id, projectNumber: r.projectNumber, componentId: r.componentId, system: r.system, workType: r.workType, street: r.street, status: r.status })),
    lowConfidence: links.filter(l => l.confidence === 'low'),
    scheduleDiffs,
  };
}

const DATE_LABEL = { tenderTarget: 'Tender target', tenderActual: 'Tender', awardTarget: 'Award target', awardActual: 'Award', startTarget: 'Start target', startActual: 'Start', substantialTarget: 'Substantial completion target', substantialActual: 'Substantial completion' };
/**
 * Changes since the previous build (weekly): status or milestone dates changed, new records.
 * slipMonths = the largest move later of a start / substantial-completion date (target or actual);
 * dc = the record is matched to the DC program. First build (no previous file) → [].
 */
function changesSince(prev, records, links, date) {
  if (!prev || !Array.isArray(prev.records)) return [];
  const before = new Map(prev.records.map(r => [r.id, r]));
  const dcIds = new Set((links || []).map(l => l.capital));
  const out = [];
  for (const r of records) {
    const p = before.get(r.id);
    const base = { id: r.id, contract: r.contract || null, projectNumber: r.projectNumber || null, system: r.system, dc: dcIds.has(r.id), date };
    if (!p) { out.push({ ...base, change: 'new on the capital layer', slipMonths: 0 }); continue; }
    const ch = [];
    if (p.status !== r.status) ch.push(`status ${p.status} → ${r.status}`);
    let slip = 0;
    for (const k of Object.keys(DATE_LABEL)) {
      if ((p[k] || null) === (r[k] || null)) continue;
      ch.push(`${DATE_LABEL[k]} ${p[k] || '–'} → ${r[k] || '–'}`);
      if (p[k] && r[k] && /^(start|substantial)/.test(k)) slip = Math.max(slip, monthsBetween(p[k], r[k]));
    }
    if (p.percentComplete !== r.percentComplete && r.percentComplete != null) ch.push(`${r.percentComplete}% built`);
    if (ch.length) out.push({ ...base, change: ch.join('; '), slipMonths: slip });
  }
  return out;
}

/** Counts by system × status. */
function tally(records) {
  const t = {};
  for (const s of SYSTEMS) { t[s] = {}; for (const st of STATUSES) t[s][st] = 0; }
  for (const r of records) t[r.system][r.status]++;
  return t;
}

/** True when an object (any depth) carries a forbidden source field. */
function hasForbidden(obj) {
  const bad = new Set(NEVER.map(k => k.toLowerCase()));
  const walk = o => {
    if (Array.isArray(o)) return o.some(walk);
    if (o && typeof o === 'object') return Object.keys(o).some(k => bad.has(k.toLowerCase()) || walk(o[k]));
    return false;
  };
  return walk(obj);
}

module.exports = {
  KEEP, NEVER, STATUSES, SYSTEMS, MILESTONES,
  isoDate, cleanAttributes, systemOf, statusOf, lengthM, haversine, utmToLngLat, toWgs84Paths, overlapShare,
  monthsBetween, slipOf, streetTokens, sameStreet, normProj, normComp,
  toRecord, uniqueIds, stableId, contractKey, changesSince, dcWorks, matchDc, applyOverrides, audit, tally, hasForbidden, CONF_RANK,
};
