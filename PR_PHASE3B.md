# PR: Phase 3b — Tools

**Branch:** `phase-3b-tools` (from `phase-3-development-scope`)
**Scope:** Phase 3b of the improvement plan only. No Phase 4 work.
**Tests:** `npm test` → **222/222 pass** (164 baseline + 58 new). `node --check` clean on all JS.

## Summary

Every tool now has exactly one home, and seven new tools ship. The map toolbar (left edge) holds 7 tools — Select, Measure, Trace, Test a site, Inspect point, Corridor select, How many more units fit? — with one active at a time, an active-tool banner ("Measuring · tap points · Esc to finish"), and Esc to finish. Tool results open in the analysis panel as a scope (trail: Peel › \<title\>) via a new Tool result tab, never as pop-up panels. New tools: How many more units fit?, Inspect point, Corridor select, Compare, Inquiry response draft, Upgrade-a-pipe what-if, Batch test sites. Nothing deleted without a new home; the old Tools menu was already gone (replaced by the rail in an earlier phase).

## What changed per file

| File | Change |
|---|---|
| `js/tools.js` | **New.** Tool framework: registry (`PeelTools.register`), one-tool-at-a-time sync, active-tool banner, result-as-scope (`openResult`/`closeResult`/`trailCrumb`), Esc handling, banner-action delegation. Loaded before app.js. |
| `js/tools-fit.js` | **New.** Tool 1 "How many more units fit?": tap a point/zone → four constraint families (tightest sewer pipe via trace, pumping station at firm capacity, plant at the 90% trigger, zone supply) under the current scenario → headline "≈N more people before \<limiting constraint\>" + table, all figures screening-estimate labelled. |
| `js/tools-inspect.js` | **New.** Tool 2 "Inspect point": composite report — pressure zone, wastewater block, nearest mains (live ArcGIS), sewer path, plant reserve, planned works. Sections fail independently. |
| `js/tools-corridor.js` | **New.** Tool 3 "Corridor select": draw a centreline, width 50–1,000 m → developments, existing sewers and DC projects within the swathe; counts, top-15 tables, CSV export. |
| `js/tools-compare.js` | **New.** Tool 4 "Compare": 2–3 developments/areas side by side in `#compare-col` (≥1800px grid, drawer 1200–1799px, stacked sheet on phones); 4th add replaces oldest. |
| `js/tools-inquiry.js` | **New.** Tool 5 "Inquiry response draft": plain-text servicing summary (zone, path, constraints, caveats, data dates, unofficial disclaimer, Prepared by) + copy button. Pure `buildDraft` tested. |
| `js/tools-upgrade.js` | **New.** Tool 6 "Upgrade a pipe (what-if)": change diameter/slope → Manning capacity recompute → downstream recolor overlay, labelled "screening · what-if", reset restores published values. |
| `js/tools-batch.js` | **New.** Tool 7 "Batch test sites": CSV upload (point, units by type, jobs, ha) → per-row servicing check → results table + CSV export. |
| `js/upstream.js` | **New.** Pure `upstreamIdsOf` helper (upstream catchments), used by blockNet and the new Show upstream action. |
| `js/app.js` | Rail rewritten to 7 tools; banner replaces `.tool-panel`; Select sub-modes (tap/lasso/box/radius); trace sewer/water toggle; setTool↔PeelTools.sync wiring + map-click delegation; `PeelApp` bridge extended (constraint objects, lookups, traces, `setTool`, `upgBump`/`pipeColour`); pop-up results (`showLoads`, `showPipeLoads`, `existSewerLoads`, `showDcLine`, `showFacility`, `showDcTiming`) routed through Tool result scope; new Show upstream action; Overview Tools card removed; map ? HelpControl removed; Export menu gains "Inquiry response draft"; Help panel gains change-log link; Esc closes tool result first. |
| `js/design.js` | 4 new outline icons: select, inspect, corridor, unitsfit. |
| `js/devscope.js` | Site bar gains "Compare" (add to comparison) after Check FSR. |
| `js/info.js` | Tour rewritten for the 7-tool rail, banner/Esc, result-as-scope, pop-up actions, site-bar Compare, Export inquiry draft. |
| `css/app.css` | `/* Phase 3b: tool rail/banner */` block: top-center banner, 7-button rail, segmented controls; old `.tool-panel` rules removed. CSS variables only. |
| `index.html` | `#tool-banner`, `#ftab-tool`/`#pane-tool` (Tool result tab), script tags for the 8 tool modules + upstream.js. |
| `README.md` | Tools section rewritten: every tool + its one home; moved/removed list. |
| `tests/` | 8 new test files (tools, tools-fit, tools-corridor, tools-compare, tools-inquiry, tools-upgrade, tools-batch, upstream) + extended design/devscope/layout-shell tests. |

## Where each moved/renamed item went

- Old Tools dropdown → already the tool rail (pre-3b); rail now the single 7-tool toolbar.
- `tips` rail button → removed; Help's single home is the topbar Help button (map ? control also removed).
- Overview Tools card (Trace / Select / Test a site / Help / DC timing / Area report / Executive briefing duplicates) → deleted; each lives at its one home (rail, Export menu, Help).
- `.tool-panel` floating panel → the `#tool-banner` (same prompts/controls, one banner UX).
- Selection summary → Tool result pane ("Peel › Lasso selection" trail); `showSelection` HTML preserved via `selectionSummaryHTML()`.
- `showLoads` / `showPipeLoads` / `existSewerLoads` / `showDcLine` / `showFacility` results → Tool result scope (Peel › title) with reopen-via-trail; `#detail` fallback only if the framework is absent.
- "Show upstream" → new pop-up action (upstream catchments + map highlight).
- "Upgrade this pipe" → new pipe pop-up action → Tool 6.
- "Inquiry response draft" → new Export menu item (dev scope) / Inspect-point flow.
- "Batch from CSV" → Test-a-site banner → Tool 7.
- Site bar: + Compare (add to comparison). Check FSR stub kept for Phase 7.
- Change log → linked from Help panel ("What's new") as well as the gear menu.
- Kept where they were (explicit exceptions): sewer-profile modal dialog, `showBlock` panel, Present buttons, exportBar/list-panel export duplication (Phase 5's scope), per-view PDF buttons (Phase 5).

## Test results

- `npm test`: 222/222 pass, 0 fail (164 pre-existing + 58 new across 8 new test files).
- `node --check`: clean on every js/ file.
- New tools 1–3 ship with unit tests (rankConstraints, corridor geometry, CSV quoting) as required; tools 4–7 have pure-logic tests (draft builder, CSV parser, compare aggregation, upgrade math, upstream helper).

## Not verified

- No live browser in this environment: tap flows, banner rendering, trail crumb clicks, dark/light, phone layouts verified by code inspection only. Suggested smoke test: tap catchment → actions → upstream → Esc; tap pipe → Upgrade this pipe; Help → change log; run each rail tool once.
- `tracePoint` (used by units-fit/inspect) also writes the trace into the old `#detail` panel as a side effect — the Tool result tab opens alongside it. Cosmetic wart, flagged for follow-up.
- Upgrade overlay: the base sewer layer refreshes on next pan/zoom; zoomed-in % labels may briefly show pre-upgrade values.

## Assumptions

1. Tool modules access app.js only through the `PeelApp` bridge + `PeelDemand`/`PeelAreas` globals, all lazily — they degrade gracefully if app.js hasn't run.
2. `pipeCons`/`psCons`/`plantCons`/`waterPlantCons`/`supplyCons` "people" figures are the committed-room basis; units-fit converts via `DEFAULT_CRITERIA.ppu.unknown` (2.7), labelled as such.
3. Pumping-station matching for units-fit uses trace station outlets ↔ drainage-area `outletAt` (≈0 m in current data; 500 m tolerance).
4. Corridor `state.filtered` mirrors the lasso's development set; DC line/facility proximity uses segment distance with bbox prefilter.
5. Compare's `addArea` accepts `{name/title, members|devs|projects|items|keys}` or a bare project array.
6. Batch CSV: 200-row cap; headerless positional parsing supported; rows never touch the map.
7. Upgrade what-if mutates the live pipe record for the session only; `sewUpgKey` suffix in `scenarioKey()` busts the DCN cache (empty in normal use → zero behaviour change); reload restores published data.
8. Select tap within 16px of a development lets the marker open it (DevScope); 16–40px adds to selection.
