# PR: Phase 6 — Maintenance and performance

**Branch:** `phase-6-maintenance` (5 commits on top of `phase-5-exports`)
**Scope:** Phase 6 of the improvement plan only. No Phase 7 work.
**Tests:** `npm test` → **350/350 pass** (325 baseline + 25 new: 13 offline, 12 snapshot-index).

## Summary

Pays down the structural debt accumulated in Phases 0–5: `js/app.js` (11,126 lines) is split into 47 focused modules plus a ~720-line core, the 26.5MB snapshot no longer blocks first paint (compact per-project index loads first, full data streams in behind), the app works offline via a service worker, the README is rewritten around the real structure, and everything in-code is prepared for the `Fsr-reviewer` → `peel-growth-pipeline` repo rename (including a redirect for the old Pages URL). No features removed, no behaviour change.

## 1. Module split (was: one 11,126-line file)

`js/app.js` → 1 shared helper module + 46 area modules + ~720-line app-core (state, boot, `PeelApp` bridge). Largest file now: `js/phases.js` (1,198 lines); every JS file is under the 2,000-line budget.

**New modules** (all follow the established `window.PeelXxx` + `module.exports` pattern; extracted verbatim, only reference rewrites):

| Area | Files |
|---|---|
| Shared helpers | `js/util.js` (`$`, `esc`, `fmtNum`, `store`, colours, units, disclaimers) |
| Map | `map-core.js`, `map-labels.js`, `map-census.js`, `map-markers.js`, `map-analysis.js` |
| Filters | `search-filter.js`, `filter-ui.js` (pure logic already in `js/filters.js`) |
| Tabs | `analysis-tabs.js`, `developments-tab.js`, `overview-tab.js`, `growth-ui.js`, `data-tab.js`, `water-tab.js`, `dca-tab.js`, `render-list.js`, `tips.js` |
| Development | `dev-nav.js`, `dev-detail.js`, `dev-verdict.js`, `fsr.js`, `aerial-check.js` |
| Servicing | `svc-data.js`, `svc-tab.js`, `svc-plants.js`, `sewer-trace.js`, `sewer-profile.js`, `sewer-cap.js`, `water-trace.js`, `site-context.js`, `exist-pipes.js` |
| DC | `dc-infra.js`, `dc-cost.js`, `masterplan.js` |
| Tools | `measure.js`, `tool-scope.js`, `area-select.js` |
| Misc | `share.js`, `timeline.js`, `changelog.js`, `settings.js`, `census-view.js`, `demand-ui.js`, `exports.js`, `reports.js`, `plan-areas.js`, `topbar.js` |

Cross-module access goes through the `window.PeelApp` bridge (rewritten, §4 of the split plan) with lazy call-time accessors; shared mutable `let`s became getter/setter pairs. `index.html` now loads 83 scripts in dependency order with `?v=__BUILD__` cache-busting. The split plan (`SPLIT_MAP.md`, working doc) was deleted before this PR.

## 2. Startup performance

- **New `data/snapshot-index.json`** (built by new `scripts/build-snapshot-index.js`, wired into `npm run snapshot`): compact per-project index — 11.5MB raw / 1.56MB gzipped vs 26.5MB / 2.64MB for the full snapshot (43% / 59%).
- **Boot reworked** (`js/app.js` + new `js/snapshot-index.js`): index loads first → map, list, and filters paint immediately (~100ms hydration for 23,824 projects vs ~2s of record decoding before); the full snapshot streams in via `requestIdleCallback` and swaps in. Opening a development early shows the skeleton placeholder until full data arrives (`PeelApp.whenFullSnapshot`).
- Verified: full parity across all 23,824 projects (hydrated fields vs `buildProjects` output), appeal-flag parity (0 mismatches).

## 3. Offline support

- **`sw.js`** (new, repo root): precaches the app shell (versioned `peel-dev-shell-<version>`), `data/*.json` stale-while-revalidate, offline navigation fallback, old-cache cleanup. Defensive: a worker bug can never break the page.
- **`js/offline.js`** (new, `window.PeelOffline`): registers the worker on http(s), `status()` / `clearCache()` API, `peel-dev:sw-cached-at` timestamp. Wired into boot per the (since removed) wiring doc.
- 13 new tests in `tests/offline.test.js`.

## 4. Rename prep (`Fsr-reviewer` → `peel-growth-pipeline`)

Everything in-code is ready; the actual GitHub repo rename is a separate owner action (repo settings).
- `scripts/build-changelog.js` REPO const, `data/changelog.json` (112 URLs), `scripts/build-fsr.js` + `scripts/fetch-external.js` user-agent URLs, `package.json` name → new slug.
- **New `404.html`**: redirects `/Fsr-reviewer/*` → `/peel-growth-pipeline/*` preserving path, query, and hash (old share links keep working); plain 404 otherwise.
- Deliberately untouched: `window.PeelApp`, `peel-dev:` storage prefix, FSR-feature files (Functional Servicing Report ≠ repo slug).

## 5. README rewrite

`README.md`: ~1,580 → ~250 lines. Removed the four conflicting tab-layout descriptions and all stale pre-Phase-4 sections; now: disclaimer-led intro → run instructions → one layout description → features by tab → project-structure table → data pipeline → developing → deployment → data sources → demand criteria. All claims verified against the repo.

## Where each moved item went

- `js/app.js` helpers → `js/util.js`; everything else → the 46 modules above (full range map was in `SPLIT_MAP.md`, deleted as a working doc).
- Snapshot boot: `data/snapshot.json`-first → `data/snapshot-index.json`-first + deferred full load.
- Nothing deleted or moved to a different screen; all changes are structural or additive.

## Test results

- `npm test`: 350/350 pass, 0 fail (325 pre-existing + 13 `tests/offline.test.js` + 12 `tests/snapshot-index.test.js`).
- `node --check`: clean on every new/edited JS file.
- Merge smoke test: all 47 modules required in exact `<script>` order with DOM stubs — 47/47 load cleanly. Caught and fixed 5 load-time bugs the extractors couldn't see (undefined `getDmSys`/`setDmSys` in fsr.js; two modules touching `PeelApp` before it exists — now deferred inits called post-bridge; a regex-mangled `'#btn-discover'` id; a top-level `MA().renderLegend()` moved into boot).
- Custom cross-module accessor audit: 0 unresolved references; no duplicate definitions.

## Not verified (no live browser in this environment)

- Real-browser first-paint timing, `requestIdleCallback` scheduling, service-worker registration/caching, and the skeleton display — need a page-load smoke test on deploy.
- Visual check that the module split didn't disturb rendering (dark/light, desktop/phone).

## Assumptions

1. The per-project (not per-record) index is the right granularity: a per-record index kept >85% of snapshot size because `buildProjects` reads nearly every field.
2. Transient first-paint differences (growth-tab completions strip, permit-refined dwelling splits, site polygons, export file lists, servicing flags) all converge when the full snapshot lands seconds later — same async timing as today's per-source loads.
3. `SW_VERSION` must be bumped whenever the js/ module list changes (done: `2026-10-14-phase6`); the deploy workflow regenerates the snapshot + index weekly.
4. GitHub redirects `github.com` repo URLs on rename automatically; `404.html` covers only the Pages site path.
5. `data/snapshot-index.json` is committed alongside the snapshot (consistent pair); the weekly job regenerates both.
