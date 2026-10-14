/*
 * Compact startup index hydration (Phase 6).
 *
 * data/snapshot-index.json holds one compact per-project entry (built by
 * scripts/build-snapshot-index.js); hydrate() turns an entry back into a
 * project-shaped object with everything first paint needs — map markers, the
 * development list and every filter — so all consumers keep working unchanged
 * until the full snapshot arrives and replaces these lightweight projects.
 *
 * The light projects carry no records (p.records = []): per-record inputs the
 * filters need are precomputed into the entry (appUnits, employment, the
 * appeal flag, the search haystack) and installed as the caches the app
 * already uses (p._appUnits, p._emp, p._hay), so the filter code paths are
 * the same ones the full records take.
 *
 * Pure functions, no DOM access, no dependencies: safe to require under
 * `node --test` and to load in the browser as a plain <script> (before
 * js/app.js, which reads the `window.PeelSnapshotIndex` global).
 */
(function (root) {
'use strict';

// yyyymmdd -> Date (noon UTC; only the calendar day is ever read back).
const ymdDate = y => new Date(Date.UTC(Math.floor(y / 10000), Math.floor(y / 100) % 100 - 1, y % 100, 12));

/**
 * Hydrate one index entry into a project-shaped object.
 * @param {object} e the compact entry (short keys, see scripts/build-snapshot-index.js)
 * @param {object} H the index header ({muni: [...], phases: [...]})
 * @returns {object} project with the fields first paint reads
 */
function hydrate(e, H) {
  const phase = H.phases[e.ph];
  const p = {
    key: e.k,
    title: e.t,
    municipality: H.muni[e.m],
    phase,
    // Header phase order matches js/phases.js ALL_PHASES: the six live phases
    // rank 0-5, cancelled ranks -1.
    rank: e.ph < 6 ? e.ph : -1,
    lat: e.g ? e.g[1] : null,
    lng: e.g ? e.g[0] : null,
    units: e.u ?? null,
    kinds: [(e.kd & 1) ? 'application' : null, (e.kd & 2) ? 'permit' : null].filter(Boolean),
    newBuild: !!e.nb,
    records: [],
    types: e.ty || [],
    description: e.d || '',
    unitMix: e.um || null,
    siteAreaHa: e.sa ?? null,
    gfa: e.gfa ?? null,
    timeline: (e.tm || []).map(([y, pi]) => ({ date: new Date(Date.UTC(y, 0, 1)), phase: H.phases[pi] })),
    milestones: {},
    last: e.l ? ymdDate(e.l) : null,
    buildout: e.b ? { planned: e.b[0], permitted: e.b[1], completed: e.b[2], remaining: e.b[3], unbuilt: e.b[4] } : null,
    // Precomputed by the builder; the appeal flag test (js/filter-ui.js) prefers
    // this over scanning records, so the light projects filter identically.
    appeal: !!e.ap,
  };
  if (e.ms) {
    const [i, a, c] = e.ms;
    if (i) p.milestones.inception = ymdDate(i);
    if (a) p.milestones.approved = ymdDate(a);
    if (c) p.milestones.completed = ymdDate(c);
  }
  p.first = p.timeline.length ? p.timeline[0].date : null;
  // First-paint caches, mirroring what the app computes from full records:
  // max units on the planning applications (unitsFor / appUnits),
  // employment (jobsOf / empOf — null when the project has none, so the
  // land-use tests read exactly what the full records would give),
  // and the search haystack (title + types + the entry's record parts).
  p._appUnits = e.au || 0;
  p._emp = (e.j > 0 || e.em > 0) ? { jobs: e.j || 0, totalM2: e.em || 0 } : null;
  p._hay = [e.t, e.h || '', ...(e.ty || [])].join(' ').toLowerCase();
  return p;
}

const api = { hydrate };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelSnapshotIndex = api;
})(typeof window !== 'undefined' ? window : globalThis);
