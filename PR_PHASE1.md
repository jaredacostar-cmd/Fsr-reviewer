# PR: Phase 1 — Filters vs scenario

**Branch:** `phase-1-filters-scenario` (from `phase-0-trust-and-transparency`)
**Tests:** `npm test` → 92 pass, 0 fail (86 baseline + 6 new in `tests/filters.test.js`)
**Scope:** Phase 1 of the improvement plan only. No Phase 1.5+ work.

## Summary

All filtering now lives in one unified panel in the sidebar (Explore tab), in the plan's order:
**Search → Stage → Where → What → When → Flags**. The Scenario bar (`#scen-bar`)
holds everything that changes the math: counting basis (new) and "Results for
year" (moved from the on-map demand-year control). Record type and "New
buildings only" moved to Settings & sources → Records. Nothing was deleted —
every old control's new home is listed below.

## What changed per file

- **`js/app.js`** (+489/−152): deleted `state.focus`, `FOCUS`, `renderFocusChips`,
  `setFocus`; new `state.flags` (7-key multi-select), `state.plant`,
  `state.dwelling`, `state.landuse`, `state.basis`; new `js/filters.js` pure
  module wired in; `#pipeline` segments now render label + count and are the
  stage selector (tap / Ctrl-click); `#phase-chips` rendering deleted; Scenario
  bar gains counting-basis switch + `#scen-year` ("Results for year"); on-map
  demand-year control removed; wastewater-loads map box reduced to the
  "Include census (existing)" switch with built/approved/proposed following the
  selected stages; `activeFilters()` chip row covers flags/plant/dwelling/
  landuse; empty-results message names the blocking filter with a one-tap
  remove; saved views render as one-tap preset chips; share-link params
  extended (`fl`, `pl`, `dw`, `lu`, `basis`, `cy`) with full migration of old
  `fo=` links; all new panel controls wired (`#f-size`, `#f-plant`,
  `#f-dwelling`, `#f-landuse`, `#f-milestone`, `#f-yfrom`/`#f-yto`,
  `#f-when-12m`, `#f-when-week`, `#flag-chips`, `#f-muni`, `#f-areas`).
- **`js/filters.js`** (new, 118 lines): pure-logic module (same pattern as
  `js/provenance.js`: `module.exports` / `window.PeelFilters`) — flag metadata,
  `PHASE_LAYER_MAP`, `wwLayersFromStages()`, `migrateLegacyFocus()`, flag
  param encode/decode.
- **`tests/filters.test.js`** (new): covers the legacy-focus migration table,
  stage→wastewater-layer mapping, and flag param round-trip.
- **`index.html`**: new `#filter-panel` (Stage / Where / What / When / Flags),
  `#saved-presets` above the search bar, `#empty-msg` in the search bar,
  Records fieldset (`#rec-settings` with `#f-kind`, `#f-new`) at the top of
  Settings & sources; deleted `#phase-chips` and the old "More filters"
  section; added the `js/filters.js` script tag.
- **`css/app.css`**: panel section styles, labeled pipeline segments, flag
  chips, preset chips, empty-message notice, scenario year select; dead rules
  for the removed controls deleted. No new hardcoded colors — existing theme
  variables only.
- **`js/info.js`**: tour/help entries retargeted to the new panel; new entries
  for each filter section; nothing deleted, only moved.
- **`README.md`**: Explore docs rewritten for the new panel, ending with an
  explicit "Where the old controls went" list.

## Where each old item went

| Old | New |
|---|---|
| Phase quick-view chips | Stage bar segments (tap to isolate, Ctrl-click multi-select) |
| Focus: Growth | Default land use — What → "Adds units or jobs" |
| Focus: Major (100+) | What → Size buckets (100+) |
| Focus: Employment | What → Land use → Employment |
| Focus: Committed capacity / Left to build | Scenario → Counting basis |
| Focus: New in last 12 months | When → "Last 12 months" button |
| Focus: Stalled 2+ years / ★ Watched / Changed this week | Flags chips (multi-select, with counts) |
| Record type + New buildings only | Settings & sources → Records |
| Demand year (on-map slider) | Scenario bar → "Results for year" |
| Wastewater load layer chips (map box) | Follow the selected stages + "Include census (existing)" switch |

## New flags (with counts)

Stalled 2+ years · Under appeal (OLT, from municipal status text) ·
Relies on DC works not yet built (timing flag) · Pumping station over firm
capacity on its path · Changed this week · ★ Watched · Estimated /
low-confidence data (data-quality colours).

## New filters

Receiving plant (G.E. Booth / Clarkson / Inglewood) · Dwelling type
(single/town/apartment, from the demand unit split) · Land use
(residential / mixed / employment).

## Behaviour notes

- One chip row (`#active-filters`): every active filter appears once with ×,
  whichever control set it.
- Empty results name the blocking filter and offer one-tap removal.
- Old share links: `fo=growth|none`→dropped, `fo=major`→100+ units,
  `fo=committed|left`→counting basis, `fo=employment`→land use,
  `fo=newapps`→last 12 months, `fo=stalled|week|watched`→flags.
- Saved views appear as one-tap preset chips at the top of the filter panel.

## Assumptions

1. `landuse='growth'` (default) applies the old Growth test in `matches()`,
   so the default view shows only projects adding units or jobs (a deliberate
   product change from the plan).
2. The pumping-station flag uses the same per-project build-out peak-wet ≥
   firm-capacity computation as the development panel's warning chip.
3. Old `u=left`/`u=committed` share-link params migrate to counting basis
   (consistent with the `fo` migration table).
4. The map AreaBox is slimmed to summary + draw hint; its selects now live in
   the panel's Where section. (Phase 2 removes the box entirely.)
5. Pipeline segment dark/light contrast verified by code inspection of the
   phase colour ramps, not screenshots — worth a visual check in review.
6. No live-browser testing available; all new-ID wiring is null-guarded.
