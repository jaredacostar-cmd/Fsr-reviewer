#!/usr/bin/env node
/*
 * Compact startup index for the Peel Development Tracker (Phase 6).
 *
 * The weekly snapshot (data/snapshot.json, ~26MB) holds every record; the app
 * used to fetch all of it before first paint. This module builds
 * data/snapshot-index.json instead: one compact object per *project* (as
 * js/phases.js buildProjects groups them — the same grouping the app uses),
 * carrying only what first paint needs:
 *
 *   - map markers: position, phase (colour), title/units (tooltip, pop sizing)
 *   - the development list: title, phase, municipality, units/build-out, last activity
 *   - every filter: phase, milestone years, municipality, area tags (re-tagged in
 *     the browser), kinds, new-build, unit counts, all seven flags, plant,
 *     dwelling type, land use and full-text search
 *
 * Everything else (record rows, timelines, polygons, detail panels) arrives with
 * the full snapshot, fetched right after first paint; js/snapshot-index.js
 * hydrates these entries back into project-shaped objects so every consumer
 * keeps working unchanged.
 *
 * Field allowlist (short keys keep the file small):
 *   k key, t title, m municipality idx, ph phase idx, g [lng,lat] | null,
 *   u units, au max units on planning applications, kd kinds bitmask
 *   (1 = application, 2 = permit), nb newBuild, tm [[year, phaseIdx]...] deduped,
 *   l last-activity yyyymmdd, ms [inception, approved, completed] yyyymmdd,
 *   b [planned, permitted, completed, remaining, unbuilt] build-out,
 *   j employment jobs, em employment floor-space m², um unitMix, ty types,
 *   d description, h search haystack (description + deduped per-record
 *   "ref statusRaw address" parts, lowercased; the hydrator prepends the title
 *   and types), sa siteAreaHa, gfa, ap appeal flag.
 *
 * Usage (from scripts/build-snapshot.js): buildIndex(projects, snapshot).
 */
'use strict';
const E = require('../js/employment.js');
const D = require('../js/demand.js');
const P = require('../js/phases.js');

// Mirrors js/dev-detail.js STATUS_SIGNALS[0][0] — the "Under appeal" test the
// appeal flag in js/filter-ui.js applies to each planning application's status
// text. tests/snapshot-index.test.js asserts the two stay identical.
const APPEAL_RE = /\b(OMB|OLT|LPAT)\b|appeal/i;

// Header order; also the phase-idx encoding. Rank is idx for the six live
// phases, -1 for cancelled — matching js/phases.js PHASE_BY_KEY.
const PHASES = ['inception', 'review', 'approved', 'permit', 'construction', 'completed', 'cancelled'];
const PHIDX = Object.fromEntries(PHASES.map((k, i) => [k, i]));
const KIND_APP = 1, KIND_PERMIT = 2;

const ymd = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();

/**
 * The browser's unit-count-from-description pass (js/app.js applySnapshot):
 * files whose count lives only in an attachment ("unit count: 2656") get it
 * here so the index and the full-load projects agree on units.
 */
function countUnitsFromText(records) {
  for (const r of records) {
    if (r.kind !== 'application' || r.unitMix || (r.units > 0 && !r.unitsFromText)) continue;
    const t = P.unitsFromText(r.description);
    if (t && !(r.units >= t)) { r.units = t; r.unitsFromText = true; }
  }
}

function entryOf(p, midx, m2PerJob) {
  const emp = E.employmentOf(p, m2PerJob);
  // Timeline as deduped (year, phase) pairs: yearsOf() and the year histogram
  // only ever read the year and the phase.
  const seen = new Set(), tm = [];
  for (const t of p.timeline) {
    const k = t.date.getUTCFullYear() * 8 + PHIDX[t.phase];
    if (seen.has(k)) continue;
    seen.add(k);
    tm.push([t.date.getUTCFullYear(), PHIDX[t.phase]]);
  }
  // Search haystack: the description plus each record's ref/status/address,
  // deduped within the project (files on one site repeat the same text).
  const parts = new Set();
  for (const r of p.records) parts.add(`${r.ref} ${r.statusRaw} ${r.address}`);
  const o = {
    k: p.key,
    t: p.title,
    m: midx[p.municipality],
    ph: PHIDX[p.phase],
    g: p.lat == null ? null : [+p.lng.toFixed(6), +p.lat.toFixed(6)],
    u: p.units ?? null,
    au: Math.max(0, ...p.records.filter(r => r.kind === 'application').map(r => r.units || 0)),
    kd: (p.kinds.includes('application') ? KIND_APP : 0) | (p.kinds.includes('permit') ? KIND_PERMIT : 0),
    tm,
    j: emp ? emp.jobs : 0,
    em: emp ? emp.totalM2 : 0,
    ty: p.types,
    h: [p.description, ...parts].join(' ').toLowerCase(),
  };
  if (p.newBuild) o.nb = 1;
  if (p.last) o.l = ymd(p.last);
  const ms = [p.milestones.inception && ymd(p.milestones.inception),
    p.milestones.approved && ymd(p.milestones.approved),
    p.milestones.completed && ymd(p.milestones.completed)];
  if (ms.some(Boolean)) o.ms = ms;
  if (p.buildout) o.b = [p.buildout.planned, p.buildout.permitted, p.buildout.completed, p.buildout.remaining, p.buildout.unbuilt];
  if (p.unitMix) o.um = p.unitMix;
  if (p.description) o.d = p.description;
  if (p.siteAreaHa) o.sa = p.siteAreaHa;
  if (p.gfa) o.gfa = p.gfa;
  if (p.records.some(r => r.kind === 'application' && APPEAL_RE.test(r.statusRaw || ''))) o.ap = 1;
  return o;
}

/**
 * Build the startup index for a list of projects (exactly as
 * js/phases.js buildProjects returns them).
 * @param {object[]} projects projects from P.buildProjects(P.dedupeRecords(records))
 * @param {object} snapshot the snapshot these projects came from (generatedAt, sinceYear, changes)
 */
function buildIndex(projects, snapshot) {
  const muni = [...new Set(projects.map(p => p.municipality))].sort();
  const midx = Object.fromEntries(muni.map((m, i) => [m, i]));
  const m2PerJob = D.DEFAULT_CRITERIA.m2PerJob;
  return {
    version: 1,
    generatedAt: snapshot.generatedAt,
    sinceYear: snapshot.sinceYear,
    muni,
    phases: PHASES,
    changes: snapshot.changes,
    projects: projects.map(p => entryOf(p, midx, m2PerJob)),
  };
}

module.exports = { buildIndex, entryOf, countUnitsFromText, APPEAL_RE, PHASES };
