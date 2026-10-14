# PR: Phase 5 — Exports

**Branch:** `phase-5-exports` (on top of `phase-4-analysis-tabs`)
**Scope:** Phase 5 of the improvement plan only. No Phase 6 work.
**Tests:** `npm test` → **325/325 pass** (296 baseline + 29 new). `node --check` clean on all touched JS.

## Summary

One Export button in the top bar now produces every output the app can hand off.
All scattered export buttons are gone — the 11 per-panel PDF/Excel bars, the sidebar
export row, and the DC tab's "Excel (all rows)" button — and every one of their
outputs is reachable from the menu. The per-scope Excel exports are replaced by a
single workbook with a fixed sheet set, always for the current scope and filters.
New: a comparison PDF for the Compare tool.

## The Export menu (top bar → Export)

| Menu item | Output |
|---|---|
| CSV — developments shown | Filtered developments, with provenance columns |
| GeoJSON — developments shown | Same list as GeoJSON |
| Servicing areas (GeoJSON) | Pressure zones + catchments with flows |
| Planned works (GeoJSON) | 2026 DC capital-map works |
| SWMM model (.inp) | 40 wastewater blocks as SWMM 5 skeleton (disabled until servicing data loads) |
| Excel workbook (.xlsx) | Fixed sheets: Summary, Developments, Records, Water, Wastewater, DC, Criteria, Sources |
| PDF — comparison | Compare tool's items side by side + totals row |
| PDF — executive briefing | Pipeline headlines, capacity, DC program |
| PDF — development memo | One-page servicing memo (open development) |
| PDF — area report | Drawn selection or what's shown |
| Print map | Map landscape with title block, legend, north arrow, scale |
| Inquiry response draft | Plain-text servicing summary, copy button |
| Copy share link | Exact view (filters, tab, scenario, map, open development) |

## What changed per file

| File | Change |
|---|---|
| `js/app.js` | `exportWorkbook()` replaces `exportXLSX(scope)`; `exportSwmmModel()` extracted from the old export-bar template; `comparisonPDF()` added (global via `window.comparisonPDF`); all 11 `exportBar(...)` invocations + the `exportBar` const removed; `exportPDF(scope)`/`SCOPES`/`cleanClone` removed; the `[data-export]` click delegation removed (nothing uses it anymore); DC `data-dct-xlsx` button + handler removed; menu gained SWMM / workbook / comparison items with disabled-state guards. |
| `js/export-workbook.js` | **New.** Pure, Node-testable builders: `SHEET_NAMES`, `summaryRows`, `developmentsSheetRows`, `dcTimingRows`, `sourceRows` (provenance.js `portalFor` for portals). |
| `js/export-comparison.js` | **New.** Pure builders for the comparison PDF rows + totals (`totalsFor` = `sumEstimates` over the same estimates). |
| `js/tools-compare.js` | `api.items()` accessor added (plus `sumEstimates`/`tightestConstraint` on the api); `_items()` kept for existing tests. |
| `index.html` | Sidebar export row removed (`#btn-csv`, `#btn-geojson`, `#btn-areas-geojson`, `#btn-dc-geojson`, `#btn-print-map`); script tags added for `js/export-workbook.js` and `js/export-comparison.js`. |
| `README.md` | Export section rewritten around the single Export button; SWMM location updated (was "Wastewater → Blocks"). |
| `tests/export-workbook.test.js` | **New.** 12 tests: sheet list/order, Summary metadata, DC headers/math/filtering, Sources columns. |
| `tests/export-totals.test.js` | **New.** 7 tests: one row per compared item, totals == `sumEstimates`, area-row member sums, null tolerance. |
| `tests/export-cleanup.test.js` | **New.** 11 static checks: no `exportBar(`, no sidebar ids, no `data-dct-xlsx`, dead PDF machinery gone, menu carries every removed output. |
| `tests/p4-settings.test.js` | One stale assertion updated (old exportPDF references section → Criteria sheet source columns). |

## Where each removed button's output went

- 11× per-panel "PDF / print" → retired by design; surviving PDFs are the briefing, memo, area report, comparison in the menu.
- 11× per-panel "Excel" → the single Excel workbook (current scope + filters).
- Sidebar CSV / GeoJSON / Servicing areas / Planned works / Print map → identical menu items (same functions).
- DC "Excel (all N rows)" → workbook's DC sheet (`dcTimingRows()` — same headers, labels, plant-trigger math; the standalone `peel-dc-timing.xlsx` is superseded).
- Catchments "SWMM model (.inp)" (was inside the export-bar template) → menu item `exportSwmmModel()`.
- Selection panel's PDF/Excel buttons → selection CSV + area-report buttons stay in-panel; Excel via menu.

## Totals match

- Developments sheet uses `exportRows()` with no args → `state.filtered`, the same list the screen shows.
- Comparison PDF totals row = `sumEstimates` over the same estimate objects the rows use (tested field-by-field).
- DC sheet rows = same `allNeeds()` + `dcnFilter` computation as the DC tab.

## Test results

- `npm test`: 325/325 pass, 0 fail (296 pre-existing + 29 new).
- `node --check`: clean on `js/app.js`, `js/export-workbook.js`, `js/export-comparison.js`, `js/tools-compare.js`.

## Not verified

- No live browser: the Export menu was not click-tested end-to-end; new items reuse the existing `role="menuitem"` markup/disabled patterns (dark/light + phone inherit menu CSS — code inspection only).
- The comparison PDF reuses the exact `openReport` path as memo/area PDFs, so print styling matches by construction.
- Water/Wastewater workbook sheets read rendered tab DOM: a tab never opened yields a "(no tables rendered — open the tab first)" placeholder row.

## Assumptions

1. Retiring the generic per-panel print/PDF (the old `exportPDF(scope)` DOM-dump format) is intended — the plan's "PDF: chosen by scope" lists only briefing / area report / memo / comparison.
2. The standalone `peel-dc-timing.xlsx` download is superseded by the workbook's DC sheet (same rows).
3. App version in the Summary sheet comes from `data/changelog.json` `"latest"` (what the change log displays), falling back to the build stamp.
4. The comparison menu item is disabled when there's nothing to compare (no pinned scenario A and no Compare items) — the PDF itself alerts if opened empty.
5. Merge conflicts in the menu dispatch map were resolved to keep the guarded `comparepdf` handler and all three workers' items.
