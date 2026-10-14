/*
 * Filter-panel logic (Phase 1: filters vs scenario).
 *
 * Pure functions, no DOM access, no dependencies: safe to require under
 * `node --test` and to load in the browser as a plain <script> (the sibling
 * adds `<script src="js/filters.js?v=__BUILD__"></script>` to index.html,
 * before js/app.js, which reads the `window.PeelFilters` global).
 *
 * Grounding (see the doc comments for detail):
 * - Flag keys mirror the old FOCUS keys they replace in js/app.js (~line
 *   8523): stalled / week / watched keep their tests; appeal reuses the
 *   first STATUS_SIGNALS regex; dcwait reuses the per-project TIMING
 *   category (timingOf); est reuses the per-project QUALITY category
 *   (qualityOf); psover reuses the per-development servicing facts
 *   (svcFacts, whose sps entries carry build-out peak wet vs firm capacity).
 * - Phase keys come from js/phases.js ALL_PHASES. The layer map mirrors
 *   js/app.js svcLayerOf (~line 809): completed -> built (built since the
 *   census), approved / permit / construction -> approved (committed),
 *   inception / review -> proposed; cancelled maps to no layer.
 * - migrateLegacyFocus maps the old `fo` share-link values onto the new
 *   state: growth drops to the defaults (the default land use IS growth),
 *   major becomes the 100+ size step, committed / left become the counting
 *   basis, employment becomes the employment land use, newapps becomes the
 *   last-12-months year range, and the stalled / week / watched focuses
 *   become flags. `none` (and anything unknown) drops to the defaults.
 */
(function (root) {
'use strict';

// The seven multi-select flags: key, chip label, chip tooltip. The per-project
// tests live in js/app.js FLAG_TESTS (they need the app's data); the keys and
// labels live here so share links, saved views and tests can use them.
const FLAG_META = [
  ['stalled', 'Stalled 2+ years', 'Applications in planning (no building permit) with no activity for 2 years'],
  ['appeal', 'Under appeal', 'A planning application whose status text names an OMB / OLT / LPAT appeal'],
  ['dcwait', 'Waiting on DC works', 'Connects via a planned 2026 DC main (2027 or later), not the existing network'],
  ['psover', 'PS over firm capacity', 'A pumping station on the project\u2019s sewer path is over firm capacity at build-out (peak wet)'],
  ['week', 'Changed this week', 'New, or moved to another phase, in the latest weekly update'],
  ['watched', '\u2605 Watched', 'Developments on your watchlist'],
  ['est', 'Estimate check', 'Data quality: something to check before relying on this development\u2019s numbers'],
];
const FLAG_KEYS = new Set(FLAG_META.map(([k]) => k));

// Which wastewater growth layer a development phase loads onto. Mirrors
// svcLayerOf in js/app.js: the map's layers are census (existing), built
// since, approved and proposed; cancelled developments load onto none.
const PHASE_LAYER_MAP = {
  inception: 'proposed', review: 'proposed',
  approved: 'approved', permit: 'approved', construction: 'approved',
  completed: 'built',
  cancelled: null,
};

/**
 * Wastewater growth layers implied by the selected development phases.
 * @param {string[]} phasesArray selected phase keys (js/phases.js ALL_PHASES)
 * @returns {{built:boolean, approved:boolean, proposed:boolean}}
 */
function wwLayersFromStages(phasesArray) {
  const layers = { built: false, approved: false, proposed: false };
  for (const ph of phasesArray || []) {
    const l = PHASE_LAYER_MAP[ph];
    if (l) layers[l] = true;
  }
  return layers;
}

/**
 * Migrate a pre-Phase-1 `fo` (focus) share-link value onto the new filter state.
 * @param {string} fo the old focus key ('growth', 'major', 'committed', 'left',
 *   'employment', 'newapps', 'stalled', 'week', 'watched', 'none', …)
 * @returns {{flags:string[], basis:string, minUnits:number, landuse:string, yearPreset:string|null}}
 *   flags: flag keys to turn on; basis: 'all' | 'committed' | 'remaining';
 *   minUnits: size step; landuse: 'growth' | 'residential' | 'mixed' | 'employment';
 *   yearPreset: null or 'last12m' (year mode 'any', last 12 months).
 */
function migrateLegacyFocus(fo) {
  const out = { flags: [], basis: 'all', minUnits: 0, landuse: 'growth', yearPreset: null };
  switch (fo) {
    case 'major': out.minUnits = 100; break;
    case 'committed': out.basis = 'committed'; break;
    case 'left': out.basis = 'remaining'; break;
    case 'employment': out.landuse = 'employment'; break;
    case 'newapps': out.yearPreset = 'last12m'; break;
    case 'stalled':
    case 'week':
    case 'watched': out.flags = [fo]; break;
    // 'growth', 'none' and anything unknown: drop to the defaults.
  }
  return out;
}

/**
 * Encode the active flags for a share link (`fl` param).
 * @param {object|string[]} flags `{key: boolean}` state or an array of active keys
 * @returns {string} comma-separated flag keys ('' when none)
 */
function encodeFlagParam(flags) {
  const keys = Array.isArray(flags) ? flags : Object.keys(flags || {}).filter(k => flags[k]);
  return keys.filter(k => FLAG_KEYS.has(k)).join(',');
}

/**
 * Decode a share link's `fl` param back into flag state.
 * @param {string} s comma-separated flag keys
 * @returns {object} `{key: boolean}` for every known flag (unknown keys dropped)
 */
function decodeFlagParam(s) {
  const out = {};
  for (const [k] of FLAG_META) out[k] = false;
  for (const k of String(s || '').split(',')) if (FLAG_KEYS.has(k)) out[k] = true;
  return out;
}

const api = { FLAG_META, FLAG_KEYS, PHASE_LAYER_MAP, wwLayersFromStages, migrateLegacyFocus, encodeFlagParam, decodeFlagParam };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelFilters = api;
})(typeof window !== 'undefined' ? window : globalThis);
