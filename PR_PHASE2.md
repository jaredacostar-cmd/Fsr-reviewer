# PR: Phase 2 — Layout shell (one screen)

**Branch:** `phase-2-layout-shell` (from `phase-1-5-design-system`)
**Scope:** Phase 2 of the improvement plan only. No Phase 3+ work.
**Tests:** `npm test` → **116/116 pass** (107 carried + 9 new in `tests/layout-shell.test.js`). `node --check` clean on `js/app.js`.
**Built by:** three parallel workers in isolated worktrees (`wt-topbar-2`, `wt-shell-2`, `wt-boxes-2`), merged by the coordinator with 3 conflict resolutions.

## Summary

The app is now a true one-screen layout: a one-line top bar, a three-column desktop shell (filters | full-height map | analysis), the footer slimmed to a timeline strip, and a map-first phone layout with a bottom sheet. The map carries two boxes only (left tool rail, right Layers panel). The view switch and analysis tabs are linked in both directions. No features removed — everything moved is listed below.

## What changed per file

| File | Change |
|---|---|
| `index.html` | New `<header class="topbar" id="topbar">` (wordmark, `#trail`, `#tb-views`, scenario chip + popover, Export/Present/Help/gear). Sidebar `.brand` header removed. New `<aside class="analysis" id="analysis">` (resize handle, sheet grip, `#f-sum`, `.analysis-tabs` with all `ftab-*` buttons moved verbatim, `#analysis-panes` with all `.f-pane` sections moved verbatim). New `<aside class="compare-col" id="compare-col" hidden>` provision for Phase 3b. `#timebar` moved into the slim `footer`. `#toggle-sidebar` repurposed as the "Filters (n)" button. |
| `css/app.css` | `.app` is now a grid: `300px minmax(0,1fr) var(--analysis-w,440px)` ≥1200px (rows `auto minmax(0,1fr) auto`, areas top/side/map/analysis/foot); 4th 440px column ≥1800px; <1200px map-first with off-canvas sidebar sheet and bottom-sheet analysis. Topbar, tool rail, Layers panel, sheet snaps, and compare column styled from design tokens. Removed: footer-collapse styles, `.f-grip`, `.map-legend`, `.area-box`, `.tools-menu`, `.more-box` styles. |
| `css/modes.css` | Presentation mode now hides `#analysis` (was `#footer`). |
| `js/app.js` | Topbar behavior (`renderTrail`, view switch → `setMapView` + `openAnalysis`, scenario chip popover moving `#scen-bar`, Export/Present/Help/gear menus, export handlers extracted as named functions); analysis column resize + bottom-sheet snaps (`ANALYSIS_SNAPS`); tool rail control replacing the Tools dropdown; legend folded into Layers (`#mo-legend`); tab→view linking (`TAB_VIEW` + `tabViewLink` guard); Developments sub-view (`ensureDevelopmentsTab`, 25/page `pageOf`); simplified `layoutMapBoxes`/`fitLegend`; tour entries retargeted. |
| `js/design.js` | Two new icons: `export`, `settings` (topbar). |
| `js/info.js` | One new info entry (`tab-developments`); stale "box under Layers" strings fixed. |
| `tests/design.test.js` | Updated for the two new icons. |
| `tests/layout-shell.test.js` | **New.** 9 tests: tool rail, tab→view mapping, developments sub-view, `pageOf` pagination, tour targets. |

## Where each moved/renamed item went

- Sidebar title block (`.brand`, ~80px) → removed; compact "Peel Growth Pipeline" wordmark in the topbar.
- Sidebar "Share link" button → topbar Export menu → "Copy share link" (same `viewLink` logic; old share links unaffected).
- Sidebar "Help" button → topbar Help button (same handler).
- Sidebar export row (CSV/GeoJSON/servicing areas/planned works/print map) → topbar Export menu (same named handler functions; the row itself left in place for now — Worker 3's contract).
- Footer analysis tabs (`.f-tabs`) → `.analysis-tabs` inside `#analysis` (same button IDs, `data-tab`, badges).
- Footer analysis panes (all `.f-pane` sections) → `#analysis-panes` inside `#analysis` (same IDs, `data-pane`).
- Footer collapse (`setFooterCollapsed`, `#footer-toggle`, `.f-sum` opener) → removed; footer is now a non-collapsible slim timeline strip (`#timebar` + `#t-toggle` fold). `#f-sum` repurposed as the analysis summary line (same `renderDemand` updates).
- `#scen-bar` → moved (not cloned) into the topbar scenario-chip popover; comment-node placeholder restores it on close.
- Map view switch (was `.mo-view` in the Layers panel) → topbar `#tb-views` (same `data-mview` values, `syncMapOpts` active states).
- `.area-box` ("Filter by area") → removed; its selects already live in the filter panel (Phase 1).
- `.map-legend` separate box → `#mo-legend` "Legend" section inside the Layers panel (same `renderLegend()` output, same update calls).
- `.more-box` ("More settings") → merged back into the Layers panel (`.mo-adv` never left `.map-opts`).
- `.tools-btn`/`.tools-menu` dropdown → left-edge `ToolRail` Leaflet control (below zoom + north arrow), one toggle button per `TOOL_ITEMS` entry, same `data-tool` values/handlers.
- `.ww-loads` box → **kept**: it holds the only UI for the census/existing-layers switch (`#ww-census` → `setWwLay('existing', …)`), which has no filter-panel equivalent. Removing it would delete unique function.
- Sidebar development list (`#project-list`, sorts, counts) → new "Developments" tab in the analysis column (`#pane-developments`), paged 25/page, sorts unchanged.
- "List"/"Map" toggle button → "Filters (n)" button (active filter count).
- North arrow, zoom, scale bar, `.map-bottom`/`.wf-bar` test-site bar → unchanged.

## Test results

- `npm test`: 116/116 pass, 0 fail (107 pre-existing incl. Phase 0/1/1.5, 9 new).
- `node --check js/app.js`: clean.
- Merge integration verified by inspection: tab click handler bound to `#analysis .analysis-tabs`; `showFootTab` generic over `data-tab`/`data-pane` (developments integrates); `ensureDevelopmentsTab` guarded; no leftover conflict markers.

## Not verified

- No live browser: rendering at breakpoints (1200px/1800px/phone), drag-resize of the analysis column, sheet-snap gestures, tool-rail stacking, pagination UI, popover/menu open-close, and tour highlight positions were verified by code inspection only. Recommend a click-through in review.

## Assumptions

1. The `.unofficial-banner` stays as its own strip above the topbar (Phase 0's "always-visible" guarantee preserved) rather than being folded into the one-line topbar.
2. View→tab mapping: planning→overview, water→water, wastewater→ww, dc→dca. Tab→view is the exact reverse; growth/criteria/log/census/developments don't touch the map view.
3. The ≥1800px fourth column is an empty provision (`#compare-col`, hidden) — Phase 3b's Compare tool activates it.
4. `#f-sum`'s repurposing (summary line above the tabs) keeps `renderDemand`'s existing updates working; desktop click jumps to Overview, compact click expands the sheet.
5. Phone sheet "full" snap = viewport height minus the footer strip (strip stays visible).
6. The sidebar export row was intentionally left in place (Worker 1's menu duplicates its actions via the same handlers); its removal is a trivial follow-up.
7. `store` keys added: `analysisW` (column width), `analysisSnap` (sheet snap). `footTab4`/`footPref` unchanged.
