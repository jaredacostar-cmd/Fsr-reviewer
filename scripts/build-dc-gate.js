#!/usr/bin/env node
/*
 * DC servicing gate: which developments count toward the DC analysis.
 *
 * Direction from management: a development counts once it has applied for servicing. The public
 * signal is a site servicing building permit (js/servicing-permits.js). Each development in the
 * pipeline lands in one bucket:
 *   counted         a water / wastewater site servicing permit (applied or issued) on the site
 *   existingOnly    servicing permits only for existing buildings (a replacement main, a fire line):
 *                   not counted, listed for review
 *   private         privately serviced (septic): outside the Regional DC count
 *   permitNoSvc     a building permit but no site servicing permit: often serviced through a
 *                   subdivision agreement or an existing connection; not counted, shown separately
 *   none            no servicing evidence yet
 *
 * A permit joins a development when it sits inside the site boundary, shares a normalised address,
 * or (site permits only) lies within MATCH_M metres of the development point. Septic permits join
 * on boundary or address only, so a neighbour's septic never marks a site private.
 *
 * Usage: node scripts/build-dc-gate.js [--data data] [--out data/dc-gate.json]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('../js/phases.js');
const SP = require('../js/servicing-permits.js');
const { decodeRecord } = require('./build-snapshot.js');
const { countUnitsFromText } = require('./build-snapshot-index.js');

const MATCH_M = 60;
// A septic permit marks a site privately serviced only when the site is small (a house or a few):
// on a larger development it is usually the house already on the land, so it is listed for review.
const PRIVATE_MAX_UNITS = 10;
// The order a file moves: pre-consultation → formal application (official plan / zoning, subdivision,
// site plan) → site servicing permit → building permit → condominium. A site servicing permit links to
// a development only in that order: applied no earlier than GRACE_DAYS before its first formal
// application (a consultant can file it while the site plan is being circulated). Without a formal
// application in the data (approved before 2016, or lots in a registered plan), no earlier than
// PERMIT_LEAD_DAYS before its first building permit. A site with only a pre-consultation links none.
const GRACE_DAYS = 90;
const PERMIT_LEAD_DAYS = 730;
const day = d => (d ? new Date(d).toISOString().slice(0, 10) : null);
const minus = (d, n) => new Date(Date.parse(d) - n * 864e5).toISOString().slice(0, 10);
const STEP_LABEL = { precon: 'Pre-consultation', formal: 'Formal application', approved: 'Planning approval', ssp: 'Site servicing permit applied', bp: 'Building permit', condo: 'Condominium file' };

/** The development's steps, each with its first date and file: { precon, formal, approved, bp, condo }. */
function stepsOf(p) {
  const out = {};
  const put = (k, d, ref, extra) => { const x = day(d); if (x && (!out[k] || x < out[k].d)) out[k] = { k, d: x, ref: ref || '', ...extra }; };
  for (const r of p.records) {
    if (r.phase === 'cancelled') continue;
    const first = (r.events || []).slice().sort((a, b) => a.date - b.date)[0];
    if (r.kind === 'application') {
      const st = r.stage || P.stageOf(r);
      // (a minor, express or revision file tweaks what is already there: it doesn't start the development)
      if (st !== 'precon' && st !== 'condo' && P.isMinorFile(r)) continue;
      const k = st === 'precon' ? 'precon' : st === 'condo' ? 'condo' : 'formal';
      if (first) put(k, first.date, r.ref, k === 'formal' ? { type: r.type || '' } : undefined);
      for (const e of r.events || []) if (e.phase === 'approved' && k === 'formal') put('approved', e.date, r.ref);
    } else if (r.kind === 'permit' && !SP.classify(r)) {
      const iss = (r.events || []).find(e => e.phase === 'permit') || first;
      if (iss) put('bp', iss.date, r.ref);
    }
  }
  return out;
}

/** Does a site servicing permit fit the development's order? → null (fits) or the reason it doesn't. */
function orderCheck(s, steps) {
  if (!s.applied) return null;
  if (steps.formal) return s.applied >= minus(steps.formal.d, GRACE_DAYS) ? null : `applied ${s.applied}, before the first formal application (${steps.formal.ref} ${steps.formal.d}): for what was on the land before`;
  if (steps.bp) return s.applied >= minus(steps.bp.d, PERMIT_LEAD_DAYS) ? null : `applied ${s.applied}, more than 2 years before the first building permit (${steps.bp.ref} ${steps.bp.d})`;
  if (steps.condo) return null;
  if (steps.precon) return `applied ${s.applied}, but the site has only a pre-consultation (${steps.precon.ref} ${steps.precon.d}): no formal application yet`;
  return null;
}
const BUCKETS = ['counted', 'existingOnly', 'private', 'permitNoSvc', 'none'];
const IN_SCOPE = new Set(['inception', 'review', 'approved', 'permit', 'construction']);

function metres(aLat, aLng, bLat, bLng) {
  const k = Math.PI / 180, x = (bLng - aLng) * k * Math.cos((aLat + bLat) / 2 * k), y = (bLat - aLat) * k;
  return Math.sqrt(x * x + y * y) * 6371008;
}

/** Grid index of permits for nearest-point lookups (~0.002° cells, about 160 m by 220 m). */
function gridOf(permits) {
  const g = new Map(), key = (lat, lng) => `${Math.floor(lat / 0.002)}:${Math.floor(lng / 0.002)}`;
  for (const s of permits) {
    const k = key(s.lat, s.lng);
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(s);
  }
  return {
    near(lat, lng) {
      const i = Math.floor(lat / 0.002), j = Math.floor(lng / 0.002), out = [];
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) out.push(...(g.get(`${i + a}:${j + b}`) || []));
      return out;
    },
    /** Every permit in the cells covering a set of rings (a site can span many cells). */
    inBox(rings) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of rings) for (const [x, y] of r) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
      const out = [];
      for (let i = Math.floor(y0 / 0.002); i <= Math.floor(y1 / 0.002); i++) {
        for (let j = Math.floor(x0 / 0.002); j <= Math.floor(x1 / 0.002); j++) out.push(...(g.get(`${i}:${j}`) || []));
      }
      return out;
    },
  };
}

/** Is a development in the DC pipeline: not built, not withdrawn, and adding homes or floor area. */
function inScope(p) {
  return IN_SCOPE.has(p.phase) && ((p.units || 0) > 0 || (p.gfa || 0) > 0);
}

/**
 * Join servicing permits to developments and bucket each development.
 * @param {object[]} projects  P.buildProjects output
 * @param {object[]} permits   SP.fromRow rows
 */
function gate(projects, permits) {
  const byAddr = new Map();
  for (const s of permits) {
    const a = P.normalizeAddress(s.address);
    if (!a) continue;
    const k = `${s.municipality}|${a}`;
    if (!byAddr.has(k)) byAddr.set(k, []);
    byAddr.get(k).push(s);
  }
  const grid = gridOf(permits.filter(s => s.kind === 'site'));
  const gridAll = gridOf(permits);
  const out = [];
  for (const p of projects) {
    if (!inScope(p)) continue;
    const hits = new Map(); // permit -> how it matched
    const add = (s, how) => { if (!hits.has(s)) hits.set(s, how); };
    // 1. Inside the site boundary.
    if (p.siteRings && p.siteRings.length) {
      for (const s of gridAll.inBox(p.siteRings)) if (P.pointInRings(s.lng, s.lat, p.siteRings)) add(s, 'boundary');
      for (const r of p.records) {
        for (const s of byAddr.get(`${p.municipality}|${P.normalizeAddress(r.address)}`) || []) {
          if (P.pointInRings(s.lng, s.lat, p.siteRings)) add(s, 'boundary');
        }
      }
    }
    // 2. Same address as any of the development's files or permits.
    for (const r of p.records) {
      for (const s of byAddr.get(`${p.municipality}|${P.normalizeAddress(r.address)}`) || []) add(s, 'address');
    }
    // 3. Site permits only: nearest within MATCH_M of the development point.
    if (p.lat != null && ![...hits.keys()].some(s => s.kind === 'site')) {
      let best = null, bestD = Infinity;
      for (const s of grid.near(p.lat, p.lng)) {
        if (s.municipality !== p.municipality) continue;
        const d = metres(p.lat, p.lng, s.lat, s.lng);
        if (d < bestD) { best = s; bestD = d; }
      }
      if (best && bestD <= MATCH_M) add(best, `within ${Math.round(bestD)} m`);
    }
    // The development's own records can say "with septic" (a new home permit in Caledon).
    const ownSeptic = p.records.some(r => { const c = SP.classify(r); return c && c.kind === 'septic'; });

    const steps = stepsOf(p);
    // (septic permits are not held to the order: a house on septic can come at any point)
    const why = new Map([...hits.keys()].map(s => [s, s.kind === 'site' && s.status !== 'cancelled' ? orderCheck(s, steps) : null]));
    const live = [...hits.entries()].filter(([s]) => s.status !== 'cancelled' && !why.get(s));
    const regional = live.filter(([s]) => s.regional);
    const septic = live.filter(([s]) => s.kind === 'septic');
    let bucket;
    if (regional.some(([s]) => !s.existing)) bucket = 'counted';
    else if (regional.length) bucket = 'existingOnly';
    else if ((septic.length || ownSeptic) && !((p.units || 0) > PRIVATE_MAX_UNITS)) bucket = 'private';
    else if (p.records.some(r => r.kind === 'permit' && r.phase !== 'cancelled')) bucket = 'permitNoSvc';
    else bucket = 'none';

    const first = regional.map(([s]) => s.applied).filter(Boolean).sort()[0] || null;
    out.push({
      key: p.key, title: p.title, municipality: p.municipality, phase: p.phase,
      units: p.units > 0 ? p.units : 0, gfa: p.gfa > 0 ? Math.round(p.gfa) : 0,
      bucket, servicingApplied: first,
      // A septic permit on a larger development: probably the existing house; check before relying on it.
      septicReview: (septic.length || ownSeptic) && bucket !== 'private' ? true : undefined,
      // The development's steps in date order, with the linked site servicing permit in its place.
      steps: [...Object.values(steps), ...(first ? [{ k: 'ssp', d: first, ref: (regional.find(([s]) => s.applied === first) || [{}])[0].ref || '' }] : [])]
        .sort((a, b) => a.d.localeCompare(b.d)).map(x => ({ ...x, label: STEP_LABEL[x.k] })),
      // Permits on the site that don't fit the order, and why (not linked).
      outOfOrder: [...why.entries()].filter(([, w]) => w).map(([s, w]) => ({ ref: s.ref, src: s.source || undefined, applied: s.applied, issued: s.issued, lat: s.lat, lng: s.lng, reason: w })),
      // Regional (water / wastewater) permits first, newest first; then the rest.
      evidence: live.sort(([a], [b]) => (b.regional && !b.existing) - (a.regional && !a.existing) || String(b.applied || '').localeCompare(String(a.applied || ''))).map(([s, how]) => ({
        ref: s.ref, src: s.source || undefined, kind: s.kind, status: s.status, applied: s.applied, issued: s.issued,
        lat: s.lat, lng: s.lng, address: s.address || undefined, description: s.description || undefined,
        services: [s.water && 'water', s.wastewater && 'wastewater', s.storm && 'storm', s.unspecified && 'not stated'].filter(Boolean),
        existing: s.existing || undefined, match: how,
      })).concat(ownSeptic && !septic.length ? [{ kind: 'septic', match: 'own permit text' }] : []),
    });
  }
  return out;
}

function summarise(rows) {
  const blank = () => Object.fromEntries(BUCKETS.map(b => [b, { developments: 0, units: 0, gfa: 0 }]));
  const total = blank(), byMunicipality = {};
  for (const r of rows) {
    const m = byMunicipality[r.municipality] || (byMunicipality[r.municipality] = blank());
    for (const t of [total, m]) {
      t[r.bucket].developments++;
      t[r.bucket].units += r.units;
      t[r.bucket].gfa += r.gfa;
    }
  }
  return { total, byMunicipality };
}

function build(snapshot, servicing, now = new Date()) {
  const recs = snapshot.records.map(o => decodeRecord(o, ''));
  countUnitsFromText(recs);
  const projects = P.buildProjects(P.dedupeRecords(recs));
  const permits = ((servicing && servicing.rows) || []).map(SP.fromRow);
  const rows = gate(projects, permits);
  return {
    version: 1,
    generatedAt: now.toISOString(),
    rules: {
      note: 'A development counts toward the DC analysis once a water or wastewater site servicing permit is applied for or issued on its site. '
        + 'Site servicing permits are local Building Code permits for private-side pipes, not the Region\'s servicing application. '
        + 'Storm-only permits are local servicing and do not count. Septic (private sewage) sites are outside the Regional count.',
      scope: 'Developments in the pipeline (pre-application to under construction) adding homes or floor area.',
      matchMetres: MATCH_M,
      privateMaxUnits: PRIVATE_MAX_UNITS,
      graceDays: GRACE_DAYS,
      permitLeadDays: PERMIT_LEAD_DAYS,
      buckets: {
        counted: 'Water / wastewater site servicing permit applied for or issued',
        existingOnly: 'Servicing permits only for existing buildings: not counted, review',
        private: 'Privately serviced (septic): outside the Regional DC count',
        permitNoSvc: 'Building permit but no site servicing permit (often serviced through a subdivision agreement): not counted',
        none: 'No servicing evidence yet',
      },
    },
    permits: { total: permits.length, site: permits.filter(s => s.kind === 'site').length,
      regional: permits.filter(s => s.regional).length, stormOnly: permits.filter(s => s.kind === 'site' && !s.regional).length,
      septic: permits.filter(s => s.kind === 'septic').length },
    summary: summarise(rows),
    developments: rows.sort((a, b) => BUCKETS.indexOf(a.bucket) - BUCKETS.indexOf(b.bucket) || b.units - a.units),
  };
}

function main() {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const dataDir = path.resolve(arg('--data', path.join(__dirname, '..', 'data')));
  const outFile = path.resolve(arg('--out', path.join(dataDir, 'dc-gate.json')));
  const read = f => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
  let servicing = null;
  try { servicing = read('servicing-permits.json'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const result = build(read('snapshot.json'), servicing);
  fs.writeFileSync(outFile, JSON.stringify(result));
  const t = result.summary.total;
  console.log(`dc-gate: ${result.permits.total} servicing permits; ` + BUCKETS.map(b => `${b} ${t[b].developments} (${t[b].units} units)`).join(', '));
}

if (require.main === module) main();
module.exports = { gate, summarise, build, inScope, metres, stepsOf, orderCheck, BUCKETS, MATCH_M, PRIVATE_MAX_UNITS, GRACE_DAYS, PERMIT_LEAD_DAYS };
