# Phase 4 — Analysis tab restructure

Branch: `phase-4-analysis-tabs` (from `phase-3b-tools`). **Do not push** — local branch only.

## Summary

The analysis column is now **five tabs** (+ Development when a site is open): **Overview · Growth · Water · Wastewater · DC**. Every tab has at most four sub-views, picked with buttons instead of stacked scrolling, and every sub-view follows the same order: one-sentence headline → up to four tiles → one chart → one top-N table with "See all" → one ⓘ line (method, criteria, data dates).

Removed tabs are **moved, not lost** — see "Where everything went" below.

## What changed per file

- **`index.html`** — new five-tab shell, sub-view button rails, `#scen-criteria-mount` (criteria editor mount in the Scenario control), removed the old Settings / Demand / Change-log panes, removed the tools card.
- **`css/app.css`** — sub-view buttons, headline/tiles/top-N table patterns, "Needs attention" card, merged DC table chips, beta label.
- **`js/app.js`** (bulk of the work) —
  - Tab skeleton: `TABS`, `TABSUBS`, `gSub`/`dcSub` state, `migrateTabKey` (share-link migration for old tab keys), `GearPages` registry + `openGearPage`, change log moved into the Help menu (keeps the "new" dot), single scenario bar.
  - **Overview**: headline → tiles → plant + water treatment capacity bars → new **Needs attention** card (constraints that run out before relief, stalled large sites, sites past the 90% trigger, this week's changes) → top-5 table → ⓘ.
  - **Growth**: Pipeline sub-view (by phase and dwelling type — planned / permitted / completed / left) + Census & 2051 sub-view (growth since the census, 2051 allocation, housing targets to 2031, population outlook). New `js/growth.js` module: **completions per year** and **median time to approval by municipality**.
  - **Water**: Capacity / Zones / Facilities / Hydraulic check (beta, the EPANET check, clearly labelled). New **room-left and trigger-year table** per zone and storage facility, matching the plant horizon table.
  - **Wastewater**: Plants / Blocks / Pumping stations / Allocations. New **Tightest pipes** (`js/tightpipes.js`): top 10 by % of capacity at build-out. Plant inflow by growth layer merged into Plants. Effluent exceedances → the plant's map pop-up.
  - **DC**: Timing / Recommendations / Funding. Keep (47) and Defer (26) tables merged into one table with a recommendation column and All / Keep / Defer filter chips.
  - **Settings & sources tab removed**: editable criteria → the **Scenario control** (with a "Modified criteria" badge, every edited value shown beside its Peel default, and "Reset to Peel criteria"); data freshness / model checks / references → **Sources & checks** gear page; number conventions / Prepared by / theme / density → **Settings** gear page; record type + New buildings only → Settings → **Records** (restored — they briefly lost their UI); change log → **Help** menu.
  - Demand assumptions: every demand figure's ⓘ shows its formula with the site's inputs (as the pipe tables already did); the criteria stamp on every table names the exact documents and versions (e.g. "Peel Water and Wastewater Modelling Demand Table, Aug 2024; Watermain Design Criteria, 2010"); the Criteria export sheet lists value, default, unit and source document + version for every parameter.
  - Tour text updated (see below).
- **`js/demand.js`** — source document + version metadata (`CRIT_SOURCES`, `CRIT_UNITS`) for every editable parameter.
- **`js/info.js`** — tour entries rewritten for the five tabs; pointers updated ("editable in the Scenario control", "Sources & checks (gear menu)", "Settings (gear menu) → Records"); `tab-overview`, `tab-growth`, `tab-water`, `tab-ww`, `tab-dca` rewritten; `compliance` now points at the plant pop-up; `water-capacity` mentions the room-and-trigger table.
- **`js/growth.js`** (new) — completions per year, median approval time by municipality.
- **`js/tightpipes.js`** (new) — tightest pipes top-10 computation.
- **`README.md`** — new "Analysis tabs" section, Phase 4 change-log entry, all "Settings & sources tab" / "Demand tab" / "Change log tab" references updated.
- **`tests/`** — `analysis-tabs.test.js`, `growth.test.js`, `tightpipes.test.js`, `water-room.test.js`, `needs-attention.test.js`, `dc-analysis.test.js` (new), `p4-settings.test.js` extended (exact-source stamps, criteria editor in Scenario control, Sources & checks, Records controls on the Settings page), `verdict.test.js` updated.

## Where everything went

| Before (Phase 3b) | Phase 4 home |
|---|---|
| Overview housing targets / population outlook / servicing demand by phase | Growth → Census & 2051 |
| Overview Tools card | Map toolbar (tool rail) |
| Overview DC program card | Overview → Needs attention (one line) |
| Demand tab — unit counts, build-out breakdown | Growth → Pipeline |
| Demand tab — flows | Water → Capacity, Wastewater → Plants |
| Growth's census story | Growth → Census & 2051 |
| Water — 2025 production, Caledon groundwater | Sources & checks → Model checks |
| Water — EPANET hydraulic check | Water → Hydraulic check (beta) |
| Wastewater — 2025 reports vs model | Sources & checks → Model checks |
| Wastewater — Master Plan vs tracker | Sources & checks → Model checks |
| Wastewater — effluent exceedances | Plant's map pop-up |
| Wastewater — plant inflow by growth layer | Wastewater → Plants (merged) |
| Wastewater — pumping stations | Wastewater → Pumping stations (own sub-view) |
| DC Keep (47) + Defer (26) tables | DC → Recommendations (one merged table, recommendation column, filter chips) |
| Settings & sources — editable criteria | Scenario control (criteria editor, Modified criteria badge, Reset to Peel criteria) |
| Settings & sources — data freshness / model checks / references | Sources & checks gear page |
| Settings & sources — number conventions, Prepared by, theme, density | Settings gear page |
| Settings & sources — record type, New buildings only | Settings gear page → Records |
| Change log tab | Help menu (keeps the "new" dot) |

## Test results

- `npm test`: **295/295 pass** (was 294 before this coordinator's README/tour/info pass; the +1 is the new Records-on-Settings-page test).
- `node --check` clean on `js/app.js`, `js/info.js`, `js/growth.js`, `js/tightpipes.js`, `js/demand.js`.
- Dark/light, desktop/phone and click paths verified by **code inspection only** — no live browser available; recommend a visual check in review.

## Coordinator fixes beyond the worker briefs

- Merged all 7 worker branches; resolved a `<<<<<<< HEAD` marker left in `tests/verdict.test.js`, a stale `$('#c-head')` line, and dead `stampHTML()` / `renderSelection()` functions.
- Fixed a **boot crash**: `#d-criteria` / `#d-quality` were removed from `index.html` but `renderCriteria()` and a `$('#d-quality')` listener still ran at boot. Built a real Settings gear page (Display fieldset + number conventions incl. Prepared by + wet-weather box) and made `renderCriteria()` a safe no-op.
- **Restored the Records controls** (record type + New buildings only): they lost their UI when the Settings tab was removed — the state still filtered but the user couldn't change it. They now render on the Settings gear page with delegated wiring.
- Fixed `go('census')` → `go('growth')` (dead link).
- Tour (`js/info.js`) and README rewritten for the new tab structure (see "Tour updates" in the report).

## Assumptions

- The plan's "no tab or sub-view needs scrolling at 1440×900" is treated as a design target; long tables use "See all" to stay within one screen, and sub-view content is bounded by the same pattern. Verified by code inspection only — no live browser was available.
- `flowTablesHTML` in `tests/verdict.test.js` asserts exactly one definition site after the Water tab's demand-flow copy was consolidated into Water → Capacity.
- Growth's `completions/year` and `median approval time by municipality` are computed from the permit/application milestone dates in the tracker data (same records as the pipeline); they are screening estimates, not municipal performance statistics.
- "Tightest pipes" ranks by % of capacity at build-out under the same capacity-check assumptions as the Plants sub-view.
- The Demand-tab share-link keys (`migrateTabKey`) map old `demand`/`criteria`/`log` keys to their new homes so existing share links don't break.
