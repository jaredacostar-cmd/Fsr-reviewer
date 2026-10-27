# Pipeline ledger: build plan

**Status: plan only. No app code changes yet.** Read this, settle decisions D1 to D6, then hand
one phase at a time to the coding agent.

Code references are to `main` at `699e3e8` (Oct 21, 2026).

## The story

The app tells you what growth is coming, where, when, and how sure we are. The hydraulic model
tells you whether it fits. Together they make the Annual Constraint Register from the August 31
West Area meeting.

The app does the demand side only. Capacity, headroom and constraints stay in the Region's models. Set against capital in-service dates, the same forecast shows which projects run early or late (Phase 9).

## What the meeting asked for, and where it lands

| Ask from the minutes | Where it lands in this plan |
|---|---|
| A ledger of each commitment and when it reaches occupancy | Phase 1 (ledger), Phase 3 (expected year) |
| Track registration through to building permit | Already in the file tree; shown as columns in Phase 1 |
| Reconcile at the site plan level | Phase 1: one row per development, not per secondary plan |
| Anchor to 2031, 2041, 2051 | Phase 1 buckets, Phase 2 view |
| Each application's "spend program" (build-out time) | Phase 3 |
| Confidence in committed capacity | Phase 4 |
| Repeatable annual snapshot with a standard template | Phase 5 |
| SGU benchmark: are approvals running ahead of the forecast? | Phase 6 (depends on public data) |
| Cross-check against Development Services' ledger | Phase 8 (offline only) |
| A clear story with fewer features | Phase 7 |
| Which capital projects can be deferred (and Justin: when to speed up or slow down) | Phase 9 |

## Decisions to settle first

**D1. What counts as a commitment. SETTLED (Oct 21, 2026).** Committed means the development has
a building permit, a site servicing permit, or both. Capacity is checked at every stage, so the
ledger must show load at every stage, not only the committed part.

The app uses MECP D-5-1 today (`js/demand.js:101-118`): draft or site plan approval through
construction. That is wider than the new rule. Approved sites with no permit move from committed to
"approved, not committed."

How to change it (Phase 1A):

- Add `isCommittedPeel(p)` in `js/demand.js`: true when the development has a building permit
  (file tree) or a site servicing permit (`data/dc-gate.json` bucket "counted").
- Make it the default "committed" in the ledger, the Overview and the briefing.
- Keep D-5-1 as a named option ("MECP D-5-1"). The layer bar labels its check by that name
  (`js/layer-bar.js:18-175`), so do not remove it.
- Septic and existing-building-only buckets do not count.

Phase rule (settled): a building permit commits only the units it covers, not the whole
development. Phase 1A must read units per building permit from the file tree and sum them; where a
permit lists no units, fall back to the development's units split evenly across its permits, and
flag the row.

Lapsed permits (settled: show them). No city publishes an expiry date. Flag a servicing permit as
"possibly lapsed" when it was issued 3 or more years ago with no building permit since, or the city
marks it cancelled (Brampton, Caledon). Show these flagged and drop the tier one step; a switch
hides them.

Coverage (measured at `699e3e8`): servicing permits alone cover 22.9% of Mississauga pipeline
units, 5.7% of Brampton's and 0.8% of Caledon's. Adding building permits lifts that to 29.9%,
23.8% and 12.8%. Subdivision homes rarely get a site servicing permit, so the building permit
half of the rule matters most in Brampton and Caledon.

Open point: does "permit" mean filed or issued? The DC gate counts a servicing permit once it is
filed, per earlier direction. This plan assumes filed for both permits, and shows the issue date
as its own column so issued-only can be filtered.

**D2. The servicing area for rollups.** Options: pressure zone (`zoneOf`, one per development,
`js/zone-of.js`), wastewater plant (`plantOfDev`, `js/map-markers.js:358`), or wastewater drainage
block (`svcIds(p,'dr')`, can return more than one). Recommendation: export pressure zone and plant
per row, plus coordinates, so the modelling team can re-assign to their own zones. Roll up the view
by municipality and pressure zone.

**D3. Milestone buckets.** Recommendation: 2026 to 2031, 2032 to 2041, 2042 to 2051, after 2051 or
unknown. Units already built are not in the ledger.

**D4. The confidence rule.** See the table in Phase 4. Confirm the tiers with Justin before
building.

**D5. What moves to Labs.** Recommendation: the capacity screen ("Where is it getting tight?")
moves to Labs or keeps a strong screening label. FSR review moves to Labs. 3D and Time Box are
already there (`js/labs.js:13-22`).

## What already exists

Most of the parts are built. This plan mostly joins them into one view and one export.

| Need | What exists | Where |
|---|---|---|
| Committed vs proposed | `isCommitted`, `unitsFor(p,'committed')`, D-5-1 | `js/demand.js` |
| Units counted once | `Growth.pipelineTotals` | `js/growth.js` |
| Population from units | `PeelDemand.estimate`, Peel ppu (4.2 / 3.4 / 3.1 / 2.7) | `js/demand.js` |
| Servicing permit gate | Buckets per development, weekly build | `js/dc-gate.js`, `data/dc-gate.json` |
| Where a site stands now | Phase estimate with evidence and "how sure" | `js/phase-estimate.js` |
| Build-out timing | Calibrated lags, LOW / LIKELY / HIGH bands, survival curves by stage | `js/timing.js` |
| Per-site schedule | `projectSchedule(item,row,band)` exists but is only used inside `forecastBands` | `js/timing.js:199` |
| Plan rollup that sums | Peel to municipality to plan to development, with a check column | `js/plan-rollup.js` |
| Pressure zone, plant | `zoneOf`, `plantOfDev`, `svcIds` | `js/zone-of.js`, `js/svc-data.js` |
| Weekly history | Phase log since Oct 8, 2026 | `data/history.json` |
| Exports | CSV with disclaimer, Excel workbook | `js/exports.js`, `js/export-workbook.js` |
| 2051 forecast | Per municipality only (pop, units, jobs, 2021 and 2051) | `data/peel-reports.json` `forecast2051` |
| Plan targets | Published targets per plan, with source and page | `data/plan-targets.json` |
| Labs switch | Off by default, remembered per browser | `js/labs.js` |

**Gaps:** no per-development expected year, no single confidence tier, no milestone rollup, no
frozen annual snapshot, no SGU layer (`scripts/probe-areas.js` searched; none found public).

## Phase 0. Baseline (0.5 day)

- Settle D1 to D6 (D6 is in Phase 9).
- Record today's numbers at Peel scope: developments, units, committed units, people. Every later
  phase must reconcile back to these.
- Run `npm test` and note the pass count.

## Phase 1. Ledger core (4 days)

**1A. New commitment rule (1 day).** Add `isCommittedPeel` as set out in D1, with tests: a site
with only a servicing permit, only a building permit, both, neither, and septic only. Record the
change in committed units against the Phase 0 baseline, so the drop from D-5-1 is explained, not a
surprise.

**1B. Ledger rows and rollup (3 days).**

New pure module `js/ledger.js` (no DOM, requireable in Node, like `js/plan-rollup.js`).

`rows(projects, opts)` returns one row per development:

| Field | Source |
|---|---|
| id, name, address, municipality, lat, lon | project |
| stage, stage date | `js/phases.js` |
| committed (Peel rule) | `isCommittedPeel` (D1) |
| committed (D-5-1), for reference | `isCommitted` |
| capacity stage | committed / approved, not committed / in review / early |
| registered (yes / no, date) | subdivision or site plan file events |
| servicing permit (bucket, date) | `data/dc-gate.json` |
| building permit (yes / no, first issue date) | file tree |
| units left to build, by type | `Growth` / `unitsFor` |
| people | `PeelDemand.estimate` |
| pressure zone, plant | `zoneOf`, `plantOfDev` |
| secondary plan | `p.sp` |
| expected year (likely, low, high) | Phase 3; blank until then |
| milestone bucket | from expected year |
| confidence tier and reasons | Phase 4; blank until then |
| source links | provenance |

`rollup(rows, by)` sums by municipality, zone, plant or plan, crossed with milestone bucket and
capacity stage. Since capacity is checked at every stage, each cell splits into committed, approved,
in review and early, so a zone's load can be read at any stage cut-off.
Each parent must equal the sum of its children (check column, same rule as `plan-rollup.js`).

**Done when:** totals match the Phase 0 baseline exactly; `tests/ledger.test.js` covers the
sums, a development split across two plans, and a cancelled file.

## Phase 2. Ledger view (3 days)

> Since navigation phase 3 (2026-10): Growth › Forecast, fold By period (the table, its cut-off,
> Units | People, Hide possibly lapsed), with How sure and Since the last snapshot; the developments list is
> the full table; Home › What's coming opens it there. Numbers unchanged.

- New sub-view Growth › Ledger (`js/analysis-tabs.js`), and a Home workspace "What's coming"
  (`js/workspaces.js`) that opens it.
- Top: a table of units and people by municipality × milestone bucket, stacked by capacity stage
  (committed first). A switch picks the cut-off: "committed only," "+ approved," "+ in review,"
  "everything." This matches checking capacity at each stage.
- Below: the row list, sortable, each row opening the development.
- Every total carries the line: "Public-data estimate. Not the Region's committed capacity ledger."
- Until Phase 3 lands, bucket with the existing aggregate `forecastBands`, labelled as such.

**Done when:** works at phone width; numbers match Phase 1; browser test added
(`tests/browser/`).

**Milestone M1: demo for Justin.**

## Phase 3. Expected year per development (3 days)

- Export `scheduleFor(project, cal)` from `js/timing.js` that returns likely, low and high years
  per development, using the existing `projectSchedule` and calibration rows.
- Show the sample size behind each estimate ("based on 212 similar Mississauga apartments").
- Brampton and Caledon have no completion dates. Fall back to Mississauga lags for the build
  step, and mark the row so.
- Backtest: take files as they stood in a past year from `data/snapshot.json` events, predict, and
  compare to what was built. Report the hit rate in the view's "How this is estimated" note.

**Done when:** per-row years sum to the same yearly totals as `forecastBands` (within rounding);
backtest result written to `docs/ledger/backtest.md`.

## Phase 4. Confidence tier (2 days)

One tier per development, with its reasons listed:

| Tier | Rule |
|---|---|
| A. Underway | Building permit, and the phase estimate says under construction |
| B. Committed | Building permit or site servicing permit (D1) |
| C. Approved, not committed | Draft or site plan approval (D-5-1), no permit yet |
| D. In review | Zoning, draft plan or site plan in review |
| E. Early | Pre-consultation or OPA only |

Flags that lower confidence one step: no file activity in 3 years, superseded plan, permit out of
order (dc-gate "Out of order").

**Done when:** tier counts reconcile to the committed and proposed totals; tests cover each rule
and each flag.

## Phase 5. Annual snapshot export (3 days)

- New `scripts/build-ledger.js` writes `data/ledger/<year>-<season>.json` and `.csv`
  (for example `2026-fall`). Frozen once written; never rebuilt.
- Fixed column template (Phase 1 table), versioned with a `template` number.
- A short `README` in the CSV header: source date, definitions, disclaimer.
- A diff view: what changed since the last snapshot (new, moved bucket, changed tier, dropped).
- Export menu item "Pipeline snapshot (CSV)".

**Done when:** the modelling team (Hong or Arash) confirms the template loads. Write the
procedure as `docs/ledger/annual-procedure.md`, as the minutes asked.

**Milestone M2: first frozen snapshot, Fall 2026.**

## Phase 6. SGU benchmark (1 to 2 days, conditional)

- Probe for public SGU boundaries and forecast tables (DC Background Study, Master Plan appendices).
- If found: compare pipeline units per SGU against the forecast increment to 2031, 2041, 2051.
- If not: compare at municipality level with `forecast2051`, and at plan level with
  `data/plan-targets.json`. Label it a benchmark, not a limit.

## Phase 7. Trim and label (2 days)

- Move per D5. Reorder Home so "What's coming" is first.
- Rename the app's one-line description to match the story.
- Release on the stable channel only after M1 is demoed, so the demo version stays fixed.

## Phase 8. DS cross-check (2 days, offline)

- A local script that takes a DS export (CSV) and matches it to ledger rows by address and
  coordinates.
- Reports matches, units differences, and rows only in one side.
- Runs on your work machine only. DS data never goes into the repo or the public app.

## Phase 9. Capital pace check (4 days)

Justin's ask: when should a capital project speed up or slow down? Answer it by setting the date
growth needs a facility against the date the project that relieves it goes into service.

Two of the three parts exist:

- **When growth needs it.** `js/timing.js:414` already gives trigger-year ranges (low, likely,
  high) for each wastewater plant, water treatment plant and pressure-zone pumping station, from the
  forecast against rated or firm capacity.
- **When relief arrives.** `js/capital-ea-model.js:62` reads each project's in-service year
  (substantial completion, actual or target).
- **Missing: which project relieves which facility.** `js/dc-infra.js` links planned works to
  catchments and zones, but not yet to a named facility constraint. Build a small hand-checked
  table `data/relief-links.json` (facility id, project id, source page). Keep it short: backbone
  facilities only, as the minutes asked.

New pure function `paceCheck(facility, triggers, project)` returns one verdict:

| Verdict | Rule |
|---|---|
| Speed up | In-service year is after the *likely* trigger year |
| Watch | In-service year falls between the low and likely trigger years |
| On pace | In-service year is within 2 years before the low trigger year |
| Room to slow | In-service year is more than 3 years before the low trigger year (D6) |
| No relief project | A trigger falls before 2051 and no project is linked |

Show it as Capital › Pace: one row per facility with the trigger range, the project, its
in-service year, the verdict and the gap in years. A small timeline per row: trigger band as a
shaded bar, in-service year as a marker.

Tie-in to the budget scenarios in the minutes: let the user shift a project's in-service year
(for example, "defer 3 years") and see the verdict change. This answers "which projects can be
deferred" without the app holding any budget data.

Limits to state on the page:

- Covers plants and zone pumping only. Trunk sewers and feedermains need the model.
- Capacity is the public rated or firm figure, not modelled headroom. I&I and the
  commissioning lag are not in it.
- This is a screen to start a conversation with the modelling and capital teams, not a
  recommendation to change the capital plan.

**D6. Slack before "room to slow."** Recommendation: 3 years, about one design and tender
cycle. Confirm with Justin.

**Placement.** Start it in Labs and show it to the modelling team first. A public page that says a
named project could slow down will be read as a Region position. Move it out of Labs only once
they agree with the method. In the annual snapshot (Phase 5), add the trigger range per facility
so the Constraint Register's "in-service date of relief project" column has a forecast beside it.

**Done when:** verdicts match a hand check on three facilities (one per verdict type); tests
cover each rule and the deferral slider.

**Milestone M3: pace check reviewed with the modelling team.**

## Effort and order

| Phase | Days (part-time) | Depends on |
|---|---|---|
| 0 Baseline | 0.5 | |
| 1 Ledger core (incl. new rule) | 4 | 0 |
| 2 Ledger view (M1) | 3 | 1 |
| 3 Expected year | 3 | 1 |
| 4 Confidence | 2 | 1 |
| 5 Snapshot (M2) | 3 | 3, 4 |
| 6 SGU benchmark | 1 to 2 | 1 |
| 7 Trim and label | 2 | 2 |
| 8 DS cross-check | 2 | 5 |
| 9 Capital pace check (M3) | 4 | 3 |
| **Total** | **about 25** | |

Phases 3, 4 and 6 can run in parallel after Phase 1. Phase 9 needs Phase 3 only, so it can start
before the snapshot if Justin wants it sooner.

## Risks

- **Definition drift.** The rule changed on Oct 21, 2026 (D1). If DS reads "permit" as issued and
  the app reads it as filed, totals will differ. The issue-date column and Phase 8 catch this.
- **Old definition mismatch.** If the app's "committed" differs from DS's, the totals will not match
  theirs. D1 and Phase 8 handle this.
- **Thin timing data.** Only Mississauga dates completions. The backtest and sample sizes make
  the weakness visible instead of hiding it.
- **Looking official.** A public tool with Region-style numbers can be read as the Region's
  position. Keep the disclaimer on every total and keep capacity out of the main view.
- **Employer data.** Nothing internal (models, SCADA, DS data) goes into the public app. This also
  matters if the app becomes a business.
- **Feature creep.** Each phase must serve the story line above, or it waits.

## Handing a phase to the coding agent

Give the agent this file plus one phase at a time, for example:

> Read docs/pipeline-ledger-plan.md. Build Phase 1 only. Keep js/ledger.js pure and add
> tests/ledger.test.js. Totals must match the Phase 0 baseline. Open one PR for the phase.
