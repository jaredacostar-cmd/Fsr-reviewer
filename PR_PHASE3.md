# PR: Phase 3 — Development as a scope, not a side panel

**Branch:** `phase-3-development-scope` (from `phase-2-layout-shell`)
**Scope:** Phase 3 of the improvement plan only. No Phase 3b+ work.
**Tests:** `npm test` → **154/154 pass** (116 baseline + 38 new). `node --check` clean on all edited/added JS.

## Summary

Opening a development no longer opens the separate `#detail` side panel. It sets the
**scope**: a site bar appears at the top of the analysis column, a Development tab appears
and is selected, and every analysis tab shows that site. Each number now has exactly one
home — the duplicated site numbers across the old development panel's six tabs are gone.
No features deleted; every old development-panel section is reachable in its new home.

## What changed per file

| File | Change |
|---|---|
| `index.html` | `#ftab-dev` tab button (after DC Analysis, `hidden` until a site opens); `#pane-dev` skeleton with `dev-subtabs` (About / Files & history / Site) + `#pane-dev-body`; `<div id="site-bar" hidden>` above the tab strip; `<script>` tags for `js/devscope.js` and `js/devtab.js` before app.js. |
| `js/devscope.js` | **New.** `DevScope.open(p)` / `.close()` / `.current()` / `.refresh()`. Open: syncs `currentProject`, renders trail + site bar, shows/selects the Development tab, renders the tab body, folds the Layers panel, flies to the site and draws the sewer path (display-only, stale-token guarded). Close: restores everything, returns to the previous tab. `refresh()`: re-renders site bar + trail + Development tab + current scope-aware tab with no map movement (used by background data loads). |
| `js/devtab.js` | **New.** `DevTab.render(sub)` / `setSub(sub)` into `#pane-dev-body`. About (proposal, concise status, latest decision, FSR link); Files & history (raw status block, applications + related, phase basis, dated history, source records with provenance); Site (aerial check, ground, storm sewers, stormwater ponds). Reuses public builders; copies IIFE-private ones with `devtab-` IDs and `data-dt-*` attributes. |
| `js/app.js` | `showDetail(p)` → `DevScope.open(p)` for developments (record/sel/block `#detail` views untouched); trail dev step keys off `DevScope.current()`; `trailGoPeel` clears scope; `closeDetail` routes through scope; share-link `d=` encodes the scope; new `PeelApp.scope.renderScopeTab` bridge; six stale `$('#detail').dataset.view === 'dev'` re-render conditions re-pointed at `DevScope.refresh()`; scoped renders — Overview verdict card, Growth site units only, Water/WW site servicing, DC site brief; ground/storm/ponds removed from Wastewater; tour steps + servicing help guide rewritten for the scope model. |
| `css/app.css` | Theme-token-only styles for the site bar and `dev-subtabs` (dark/light safe, wraps on phone). |
| `js/info.js` | New `tab-dev` help entry; `tab-overview` notes the verdict card; `dev-brief` / `existing-pipes` / `watchlist` updated for the new homes. |
| `README.md` | "Development panel tabs" section rewritten as "Development tab (open development)"; stale "development panel" references updated. |
| `tests/devscope.test.js` | **New.** 9 tests: open/close transitions, site-bar content + flags, FSR toggle, alloc routing, × button, bridge-less degradation, `refresh()` no-op + re-render-without-map-movement. |
| `tests/devtab.test.js` | **New.** 12 tests: record grouping, group ordering/limit, stalled/appeal signals, phase basis. |
| `tests/verdict.test.js` | **New.** Verdict-line derivation (`verdictWater/Wastewater/Dc/Milestone`, `firstSentence`). |

## Where each moved item went

- Old `#detail` development view (six tabs) → **Development analysis tab** (About / Files & history / Site) + scope-aware analysis tabs.
- Development header (address, phase, numbers) → **site bar** at the top of the analysis column.
- Site flows (was: detail Demand tab) → **Water / Wastewater tabs only**; Demand shows a one-line pointer.
- Units / build-out (was: header, Overview, Demand ×2) → **Growth tab only**.
- Files (was: Overview, History, Source records) → **Development › Files & history only**.
- Status (was: header, Overview, History) → **Development tab only** (concise line in About, raw block in Files & history).
- Sewer path + plant reserve (was: Demand, DC) → **Wastewater tab only**; one-line pointers elsewhere.
- Ground / storm sewers / ponds (was: inside Wastewater) → **Development › Site only**.
- `#detail` record / selection / block views → unchanged (still in the side panel).
- Old tour "A development" steps (detail-panel based) → rewritten for site bar + Development tab + scoped tabs.

## Test results

- `npm test`: 154/154 pass, 0 fail (116 pre-existing + 38 new across the three test files).
- `node --check`: clean on `js/app.js`, `js/devscope.js`, `js/devtab.js`, `js/info.js`.
- New-ID wiring null-guarded; full ID contract verified statically (no duplicate IDs; old `#detail-body` handlers can't double-fire thanks to `data-dt-*` namespacing).

## Not verified

- No live browser in this environment: scope open/close, the trace draw, map fade/fold, and the verdict card were verified by code inspection + unit tests only. Recommended human smoke test: open a development, cycle Overview → Growth → Water → Wastewater → DC → Development (all three sub-views), run a trace from the site bar, close via × and via Peel in the trail, confirm Peel-wide content returns.
- Dark/light and desktop/phone rendering by code inspection (theme tokens only, existing responsive classes reused).

## Assumptions

1. The `#detail` panel keeps its record, selection ('sel'), and block views — only the development ('dev') view was removed. Its `[data-dvt]`/`[data-open]` click handlers are now inert for developments but left in place (harmless).
2. `DevScope.refresh()` intentionally does not re-fly the map or reset tab state on background data loads (old `showDetail` re-render preserved scroll; the new model preserves the whole UI state).
3. `showDvTab` (old detail-panel tab switcher) is kept for the remaining `#detail-body` handlers; the tour no longer uses it.
4. The Check FSR site-bar button is a Phase 7 stub: it opens an inline "coming in Phase 7" note, not a dead end.
5. "Record allocation" jumps to Wastewater → Allocations (the allocations sub-view), reusing the existing `wwSub='alloc'` mechanism.
6. Verdict-card "Next milestone" line opens the Development tab (its home) rather than linking elsewhere.
7. Worker B copied IIFE-private builders into `js/devtab.js` instead of refactoring app.js (per the no-cross-file-refactor instruction); the copies are verbatim and namespaced.
8. Site-bar warning flags reuse the existing `devFlags`/`qualityOf` computations; flags render only when they apply.
9. Map fade applies when the sewer trace draws (deferring to the user's Developments Show/Faded/Hidden setting); if no path is found the map still flies/highlights.
