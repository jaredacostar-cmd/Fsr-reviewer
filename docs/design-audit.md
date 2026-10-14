# Design audit — Peel Growth Pipeline (Step 1, report only)

**Status:** report only. No app code was changed. The only repo changes on this branch are this
report, its screenshots (`docs/design-audit/*.jpg`) and a `tests/private/` line in `.gitignore`
(for your known-answer figures, never committed).

**How it was measured**
- Live app from `main` at 2183a44, after the tree audit merged.
- Playwright Chromium, dark mode, at 1440×900 (desk), 390×844 (phone) and 1920×1080 (projector).
- 162 screens: Peel; Brampton; 52 Heritage Heights; zone 6, block 15 and Clarkson as map-tap results; 0 Heritage Rd; the Select tool; Presentation mode.
- Every tab and sub-view, at Peel scope and development scope.
- Every rail tool and development action, run on 0 Heritage Rd, zone 6 and block 15.
- Code read for every comparison in Section 0. Evidence is given as `file:line`.
- **Console errors:** none from the app. The only errors were 404s for basemap tiles and live services, which the test harness blocks.

**Decisions confirmed:**
- **Committed: strict MECP D-5-1** (confirmed 2026-10-14).
  - **Committed** = registered or draft-approved plans of subdivision, plus site plan approved where there is no subdivision, through permit and construction.
  - **Approved zoning alone is not committed.**
  - **Allocated** = only allocations you record. Peel publishes no allocation list, and a March 2026 Regional Council report says allocation happens within the development application process, with a Peel Capacity Allocation Program study planned for 2026.
  - Group 1 adds draft approval to the committed set, read from the file statuses ("Draft Approved" / "Closed Approved" on Brampton OZS / 21T and Caledon 21T files). Today only site plan approved, permit and construction count, so draft-approved subdivisions still in review are counted as proposed.
- **Planning roles.** Confirmed: the local municipalities approve land use, and the Region services
  (water, wastewater) and comments.

**Pending:** known-answer tests (Section 0 item 10) until you supply the figures. They will be kept
in `tests/private/` (git-ignored), and the report will give only agree / differ and by how much.

---

## 1. Section 0 — engineering correctness (pass / fail)

Any failure here is **high severity** and ranks above every UI finding.

| # | Check | Result | Evidence (summary) |
|---|---|---|---|
| 1 | Like-for-like pairings | **FAIL** | Pumping stations are headlined on peak *dry* (wrong pairing), pipes mix flows, and the plant flow is mislabelled. Details below. |
| 2 | Basis labelled, never mixed | **FAIL** | Growth flows are design criteria × the 2025 calibration factor. Observed water ×1.40 sits on top of design 270 L/cap/d and still reads "design maximum day". |
| 3 | Units / flow-type labels | **FAIL** (minor) | Ambiguous "flow" labels; ML/d mixed with ML; L/s next to ML/d in the briefing; a mis-printed Harmon formula. |
| 4 | One definitions table, used everywhere | **FAIL** | "Approved", "reserve / room", "built since census", "allocated" and "remaining" each have 2–3 meanings. Overview and Growth totals differ. |
| 5 | Network, not areas | **FAIL** | Blocks show their downstream chain. Plants, pumping stations and zones are not scopes, and a zone doesn't say what feeds it. |
| 6 | Pipe class and "not assessed" | **FAIL** | Local vs trunk is decided by distance (first 3 km). Hidden pipe results still drive DC timing and exports. |
| 7 | Currency ("as of", status, source year) | **FAIL** | No capital date has an "as of" or status. The May 2026 pause appears nowhere. 2020$ and 2026$ are mixed. |
| 8 | Position risk | **FAIL** | Keep / advance / defer, "bring forward", "over-committed" and verdict colours read as Region decisions. There is no public-version switch. |
| 9 | Jurisdiction | **PASS with one fix** | Storm and land use never feed a Regional verdict. But municipal approval status sits on the same verdict card as the Regional checks. |
| 10 | Known-answer tests | **PENDING** | Awaiting your figures. |

### 1.1 Like-for-like pairings

| Comparison | Capacity | Flow it is compared with | Required | Verdict |
|---|---|---|---|---|
| WW plant (Plants, Overview bars, DC timing, briefing) | rated, annual average ML/d | average flow, scaled to the plant's **annual average** (wet weather included) — `svc-tab.js:392` (`rep.avgMLd`, 427.8 ML/d for G.E. Booth) | rated ↔ ADWF | **Pairing OK, label wrong.** The bar says "average dry weather", but in Capacity-check mode the existing flow is the annual average. Only the reports table says "annual average" (`svc-plants.js:357`). |
| WW pumping station (Pumping stations tab) | 2020 MP firm L/s | **both** peak dry and peak wet. Sorted and coloured red by **dry** (`svc-plants.js:232,242,251`; `svc-tab.js:426`). "Tightest station" is picked by dry (Gore Road, 104% dry) while the headline ranks by wet (McVean, 179%). | firm ↔ PWWF | **FAIL.** PWWF is used correctly in the map (`map-analysis.js:180`), DC timing (`masterplan.js:273`) and tool scope (`tool-scope.js:107`). |
| WW pipe (`allNeeds`, DC timing, workbook) | Manning full flow | existing **peak dry × f (no I&I)** + growth **peak wet** (`sewer-cap.js:98–103,121`) | full flow ↔ PWWF | **FAIL** (a hybrid flow). It is labelled honestly at `sewer-cap.js:145`. |
| WW block | none | — | — | No comparison (fine). The peak wet column = calibrated PDWF + design I&I (`svc-tab.js:379,395`). |
| Water treatment | rated 1,700 ML/d | 2025 measured max day (810, includes York) + growth max day | treatment ↔ max day | **Pairing OK, two limits.** The Water tab uses 100% of rated (`water-tab.js:206`); DC timing uses 90% = 1,530 (`masterplan.js:320`); the MP table uses "90% of installed" (`masterplan.js:45`). |
| Water pumping into zones | **actual firm** (sometimes above installed: A.P. Kennedy HLP2C 998 vs 950) | design max day of zone n and above (`water-trace.js:191,101`) | firm ↔ max day (with floating storage) or peak hour (without) | **PARTIAL.** No peak-hour check and no floating-storage test. The table shows `firm` while the calculation uses `actualFirm` (`masterplan.js:141`). |
| Water storage | MP required vs available (`masterplan.js:123,328–341`) | not computed (stated) | storage ↔ storage criteria | **Pairing OK.** But the people-equivalent at `masterplan.js:340` counts equalisation + emergency only, with no fire storage. |
| Supply into zones (DC timing) | main conveyance at 1.5 m/s (`water-supply.json`) | max day | — | It also says "pumping capacities are not published" (`masterplan.js:437,593`), which contradicts the Water tab. |

**Fixes (Group 1):**
- Pumping stations: rank, colour and tile on peak wet vs firm. Peak dry becomes a secondary column.
- Plants: call the flow "annual average flow (2025)" in Capacity-check mode and "ADWF (design)" in Design mode.
- Pipes: either compare full PWWF (existing calibrated peak wet + growth peak wet), or keep the hybrid and say "not a PWWF check".
- Treatment: one limit everywhere. Show 100% rated and the 90% trigger as two marks on the same bar.
- Water pumping: state firm vs actual firm, and use one of them.

### 1.2 Basis

| Figure | Basis today | Labelled? |
|---|---|---|
| Per-capita rates and peaking | Design criteria: Modelling Demand Table v2.0 (Aug 2024); Linear WW Standards R1.0 (Mar 2023) (`demand.js:37–65`) | Only in the Scenario editor and the workbook. No per-table stamp. The header comment in `demand.js:11–18` is stale (280 / ×2.0 / 300). |
| Existing WW flow | 2025 measured, through a calibration factor f (`svc-tab.js:392`) | Yes (chart subtitle, cal-note) |
| **Growth WW flow in Capacity check** | design × f (`svc-tab.js:377`) | **No.** It reads as design criteria. |
| Water max day "observed ×1.40" | summed, non-coincident plant max days (including York, ICI, NRW) applied on top of design 270 L/cap/d, and also to employment and Caledon wells (their own ratios are 2.2–2.9) | Labels still say "design maximum day" (`water-tab.js:211,215`). |
| PS firm, 90% trigger, storage | 2020 Master Plan | Yes (footnotes) |
| Plant rated | 2025 annual reports | Reports table only |
| DC projects and costs | 2026 DC map (draft) / 2020 DC study | Draft is labelled; the cost year is mixed (1.7). |

**Fix:** a basis chip on every capacity figure — *design*, *2025 measured* or *Master Plan 2020* — and a
"mixed" chip when two are combined, with the reason in its ⓘ.

### 1.3 Units

The convention (L/s for sites, pipes and pumping stations; ML/d for plants and zones) is stated at
`demand-ui.js:270` and mostly kept. Ambiguous labels:
- "Flow at build-out" (`svc-plants.js:209`)
- "Flow at outlet" (`svc-data.js:302`, an average)
- "delivers the most flow" (`svc-tab.js:309`)
- tool-scope "Growth total" (`tool-scope.js:133`)
- DC timing "% committed → % build-out" with no flow type (`masterplan.js:421`)
- Water "Room left at build-out", which mixes ML/d (zones) and ML (storage) (`water-tab.js:124–134`)
- the briefing gives water max day in L/s next to plant ML/d (`reports.js:136`)
- the Harmon formula is printed without /1000 (`svc-tab.js:465`). The code is right.

### 1.4 Definitions table (one, used everywhere)

Proposed. Items marked ⚑ change today's behaviour.

| Term | Definition | Phases / test | Today |
|---|---|---|---|
| Existing | Census population (and jobs) on census day | census | Plant "existing" = census + built + inflows (`svc-tab.js:475`). It should be called "existing + built". |
| Built since census | Completed after census day, by the **permit completion date** (estimated for Brampton / Caledon) | completed, date ≥ census | **Three tests** (`areas.js:116`, `svc-tab.js:76`, `map-markers.js:380`). `svc-data.js:258` treats every completed project as built ⚑ |
| Approved | ⚑ Rename the servicing layer to **Committed**. "Approved" stays the phase name (site plan approved). | — | The same word means "site plan approved" (phase) and "approved + permit + construction" (layer). |
| Committed | ⚑ **Strict D-5-1 (confirmed):** registered or draft-approved subdivisions, plus site plan approved where there's no subdivision, through construction; approved zoning alone is not committed | approved, permit, construction (+ draft-approved once readable) | `COMMITTED_PHASES` = approved, permit, construction (`demand.js:101`) |
| Allocated | Only allocations you record (by-law / agreement reference) | recorded | Also used for the 2051 LNA municipal allocation (`census-view.js:139`) ⚑ rename that one "LNA 2051 forecast" |
| Proposed | Pre-consultation, inception and review | inception, review | Defined three times (`areas.js:93`, `svc-data.js:258`, `svc-tab.js:78`) |
| Planned / permitted / left to build | planned − permitted = left to build (no permit yet) | — | Consistent, except "Remaining" means *unbuilt* in demand tables, Growth "still to build" and Timing ⚑ |
| Uncommitted reserve (MECP D-5-1) | rated − (existing + built + committed) at **100%** of rated | — | Used at 100% in some places and "room" at **90%** in others (Inspect, Fit, Allocations, memo, DC) ⚑ Show both, named: "uncommitted reserve (D-5-1)" and "room to the 90% trigger". |

The same `cap.committed` number is labelled "existing + approved", "existing + built + approved" and
"% committed". The Overview and briefing "committed %" **includes census flow**.

**Totals disagree across tabs (Peel default):**
- Overview tile: **202,264 units, 597,100 people** (demand estimate, basis "all").
- Growth and the header: **201,111 homes, 590,808 people** (`Growth.pipelineTotals`, net of demolitions).
- The Overview ⓘ calls basis "all" "approved + proposed"; it actually includes completed (`overview-tab.js:199`).

Fix: one totals function, one label.

### 1.5 Network, not areas

| Level | Upstream / downstream shown? | Openable as a scope? |
|---|---|---|
| WW plant | Lists block count and developments only (`tool-scope.js:92–96`); no trunk / PS chain | No: a map-tap tool result ("What loads Clarkson WRRF") |
| Trunk | No view | No |
| Pumping station | No view of its own: a tap goes to the arriving pipe (`tool-scope.js:89`) | No |
| Block | **Yes:** "→ next block", upstream count, Local / + Upstream columns, Drains to / Upstream / Outlets (`svc-tab.js:402,424`; `sewer-trace.js:431`) | No: a tool result |
| Local sewer | "feeds the nearest 300 mm+ sewer" (`exist-pipes.js:145`) | — |
| Connection (site) | **Yes:** the development trace, site → 300 mm+ → plant (`sewer-trace.js:253–305`) | the development is the scope |
| Water plant → pumping → zone | Facility panel "Pumps to" (`water-trace.js:61`); the zone panel doesn't say what feeds it; the Zones table is sorted by demand, not supply order (README claims numerical order) | No |

### 1.6 Pipe class and "not assessed"

- **Class:** "local" vs "trunk" is decided by distance along the path (first 3 km), not by pipe class (`sewer-cap.js:175–180`; `fsr-check.js:136`).
- **Hidden but still used:** `PIPE_RESULTS = false` hides pipe results in the UI (`util.js:18`). But `allNeeds()` still flags pipes ≥90% (`masterplan.js:554`), and these feed DC timing, DC analysis and the workbook.
- **Contradiction:** `svc-data.js:304` says trunk capacities are not checked.
- **Wrong message:** when pipes are skipped, the text says "No sewer on its path reaches 90%" (`masterplan.js:430`). It should say **"not assessed"**.

### 1.7 Currency

- **Capital dates:** only *approved* / *proposed* exist (`dc-infra.json`). There is **no "as of" date and no paused / unknown status**, and the **Region's May 2026 pause is not mentioned anywhere**.
- **Cost years:** Timing shows 2020$ (`dca-tab.js:78`). Recommendations and Funding show 2026$ (indexed ×1.35 / ×1.40). G.E. Booth's $130M (2024$) is added unindexed (`dc-cost.js:51`).
- **Source years:** most sources show their year. Gaps: mains capacity (no year) and pumping firm (year only in footnotes).

### 1.8 Position risk

Labels that read as a Region decision or capital advice (full list with lines in Appendix A):
- **DC recommendations:** "Keep · advance / Keep / Keep · could defer / Review" and the rationale "bring it forward". Keep / Defer filters and green / amber colours. "growth held back". The CSV column "Decision".
- **Briefing:** a "Bring forward" heading, and "should be brought forward".
- **Plants and allocations:** "over-committed" in 8 places; "at its 90% expansion trigger now"; "Room / Room left"; "commit capacity now".
- **Verdicts:** the Overview verdict card (ok / warn / bad tones); "Needs a planned main by X — committed before it is built"; batch "OK / Constrained".
- **Presentation mode** re-shows the trigger headline.

There is no public-version switch.

**Proposed screening wording** (Group 2):

| Today | Proposed |
|---|---|
| Keep · advance / Keep / Keep · could defer | *Screen: in service after capacity runs out* / *in service in time* / *in service well ahead of need* |
| Bring forward | *Projects that screen as late* |
| Over-committed | *Screens over rated capacity at existing + committed* |
| Room available / Room left | *Screening headroom* |
| Verdict (card) | *Screening summary* |
| At its expansion trigger now | *Screens at the 90% trigger now* |

A **public version** (a `?public` / Settings switch) hides the DC Recommendations and Funding views,
the verdict tones and the Keep / Defer CSV column.

### 1.9 Jurisdiction

- **Storm:** appears only in Development › Site, sourced per row from the municipal GIS (`devtab.js:682–778`). It never feeds a Regional verdict. Pass.
- **Land-use status:** "Zoning approved · site plan pending" sits on the same verdict card as the Regional water / wastewater / DC lines (`dev-detail.js:407`; `dev-verdict.js:61–67`). Fix: a "Local approvals (municipality)" row, visually separate from "Regional servicing (screening)".

### 1.10 Known-answer tests: pending

| Case | App figure (to compare) | Your figure | Agree / differ |
|---|---|---|---|
| Heritage Heights water demand | Development scope: 0 Heritage Rd 78.2 L/s max day. Area: 52 Heritage Heights filter → Water zones (zone 6). | private | pending |
| Bolton zone 7 storage need | Water › Facilities, MP storage table | private | pending |
| A 2020 Master Plan trigger year | DC › Timing / Wastewater › Plants horizon | private | pending |

---

## 2. Top 10 changes, ranked by (impact × frequency) ÷ effort, correctness first

| # | Change | Why | Effort |
|---|---|---|---|
| 1 | **One definitions table and one totals function** (Section 1.4); Overview = Growth = header | Two different Peel totals on screen; "reserve" at 100% vs 90% | M |
| 2 | **Pumping stations on PWWF vs firm** (rank, colour, tile); plant flow labelled annual average vs ADWF | Wrong pairing in a headline | S |
| 3 | **Capital currency:** "as of", a status column (scheduled / paused / unknown), a May 2026 pause banner on DC and the briefing; one dollar year | Dates read as current schedule | S–M |
| 4 | **Position-risk wording** + a public-version switch (Section 1.8) | Reads as Region advice | S |
| 5 | **Diversion cache bug + year-gating:** add `svcOpt.div`, `basis`, `nr` to `scenarioKey()` (`masterplan.js:373`); apply the diversion from its year only | Plant numbers stay stale after a switch | S |
| 6 | **Pipe "not assessed"** wherever `PIPE_RESULTS` is off, including DC timing and the workbook; class by pipe size / owner, not distance | Hidden results still drive outputs | S |
| 7 | **Basis chip + screening note** on every capacity figure, including the Overview, briefing, memo, area report, Water capacity, Pumping stations, DC and Inspect | Note missing where directors look | S |
| 8 | **Servicing ladder scopes:** plant → trunk / PS → block, and plant → zone, each with its own Overview and the trail | No servicing scope today | L |
| 9 | **Presentation mode for any scope** (development included); only Exit visible; tiles ≥40 px; screening note + data date; light theme for projectors | Closes the development; 18 controls visible | M |
| 10 | **One home for tool results** (the Tool result tab), traces included; test sites cleared on exit | Results land in 3 places | M |

---

## 3. Level × lens grid

**Planning ladder**

| Level | Overview | Growth | Water | Wastewater | DC | Gap |
|---|---|---|---|---|---|---|
| Peel | ✔ headline, 4 tiles, needs attention, capacity bars | ✔ pipeline, census, timing | ✔ treatment, zones, facilities | ✔ plants, blocks, PS, allocations | ✔ timing, recs, funding | No trends chart on the Overview; needs-attention isn't ranked by consequence (stalled sites first). |
| Municipality | ✔ (filter) | ✔ | **Peel figures** (zones / plants not filtered) | **Peel figures** | **Peel figures** | Servicing tabs don't scope to the municipality, and don't say so. |
| Secondary plan / precinct | ✔ (filter via map tap) | ✔ | Peel figures | Peel figures | Peel figures | Hidden entry point (Layers › Planning areas, then a map tap). No area Overview headline, no precinct tags. |
| Development | ✔ verdict, About / Files / Site | Peel-wide pace / census still shown | ✔ zone share | ✔ trace | ✔ projects nearby | Area-only content (pace, census, 2051) shown at development scope; no "compared with similar sites (n=)". |
| File / record | Files & history tree | — | — | — | — | Provenance can be blank; CSV rows carry no source link. |

**Servicing ladder** (planned in the brief; absent today)

| Level | Today | Should be |
|---|---|---|
| Peel | Plants and zones as table rows | the same, plus clickable rows that open a scope |
| Plant (G.E. Booth, Clarkson, South Peel WTP) | Map-tap tool result | Overview: headroom vs ADWF / 90% trigger, people-equivalent, what feeds it (trunks / PS), top loading developments |
| Trunk / PS catchment | None / arriving pipe | Overview: PWWF vs firm, upstream blocks, downstream plant |
| Block (WW) / pressure zone (water) | Tool result / table row | Overview: what feeds it, what it feeds, headroom, developments |
| Development | ✔ | — |

---

## 4. Tab cards (K)

Fit = px below the fold in the analysis panel, at desk / phone / projector (from the inventory).
At development scope most servicing sub-views collapse to the site's figures (0 below the fold).

### Overview — Peel
- **Question:** what needs attention? Headline: "The 1,367 developments shown would add about 597,100 people… G.E. Booth reaches its 90% expansion trigger ≈2028 (91% committed → 119% at build-out)." It answers the growth half. The capacity half uses decision wording, and "committed" includes census flow.
- **Inventory:** headline → Executive briefing (PDF) → 4 growth tiles → Needs attention (stalled sites, "New:" completed files, DC lateness) → Capacity bars (South Peel, plants) → ⓘ.
- **Correctness:** plant bars pair correctly but are labelled "average dry" (1.1). Totals differ from Growth (1.4). No screening note.
- **Fit:** 643 / 1,763 / 758 px below.
- **Verdicts:**

  | Section | Verdict | Reason |
  |---|---|---|
  | Headline | Keep | Reword (1.8) |
  | Tiles | Keep | One totals function |
  | Needs attention | Keep | Rank by consequence (constraint before relief → stalled large sites → changes); drop "New: completed SP94…" (old files) or move it to This week |
  | Capacity bars | Keep | Add basis chip and screening note |
  | Briefing button | Move | Export menu (it's an output, not content) |

- **Missing:** a trend line (units approved / permitted per year).

### Overview — development (About / Files & history / Site)
- **Question:** can this site be serviced, and when?
- **Inventory:** title + phase → Servicing verdict (status sentence) → 6 tiles (units, people, water max day, ADWF, PDWF, PWWF) → Verdict bullets (water zone share, WW plant reserve, DC works) → Files & history → Site.
- **Correctness:**
  - "reserve 125 ML/d — this site 5% of it" uses the 100% reserve while other views use the 90% room (1.4).
  - The verdict card mixes local approvals with Regional checks (1.9).
  - The screening note appears only in the scope bar (short version).
- **Fit:** About 486, Files 1,864, Site 498 px (desk).
- **Verdicts:** Keep all three; Files needs a "See all" after 10 rows.

### Growth › Pipeline / Census & 2051 / Timing
- **Question:** how much, and when?
- **Inventory:**
  - **Pipeline:** headline (201,111 homes, net of demolitions) → Homes (4 tiles) → Employment (4 tiles) → people / dwellings / jobs bars → Largest pipelines table.
  - **Census & 2051:** census vs build-out by municipality; LNA 2051.
  - **Timing:** pace table, lag medians.
- **Correctness:**
  - Pipeline adds up (planned = permitted + left).
  - "≈859/yr completed 2017–2027" runs into the future (`growth-ui.js:93`).
  - "Completed 0 m² ≈0 jobs" (Employment): either no data or a bug; label it "not reported".
  - "still to build" = *unbuilt* while elsewhere it's *left to build* (1.4).
- **Fit (desk):** 750 / 31 / 1,268 px. Tiny-text count is high on Pipeline and Timing (chart SVG labels under 11 px).
- **At development scope:** pace / census / 2051 are still Peel-wide. **Hide them, or show "how this site compares (n = similar sites)".**
- **Missing:** a horizon view (2031 / 2041 / 2051) at any scope.

### Water › Treatment & capacity / Pressure zones / Facilities / Hydraulic check (beta)
- **Question:** can water serve it?
- **Headline:** "South Peel water treatment has room to 2051 (52% → 66%)." It answers at 100% rated, while DC timing uses 90% (1.1).
- **Inventory:**
  - **Capacity:** 4 tiles (66% treatment, 79% firm pumping, 1,060 ML/d max day, 12 ML storage short by 2041) → demand flows table → bars by growth layer.
  - **Zones:** table sorted by demand.
  - **Facilities:** MP tables by system.
  - **Hydraulic check:** beta, results hidden.
- **Correctness:** firm vs actual firm; observed ×1.40 labelled "design"; zones not in supply order; no screening note on Capacity / Facilities / Hydro.
- **Fit (desk):** 2,792 / 740 / 1,903 / 0 px. Capacity is the longest pane at Peel. Split it: tiles + one chart on top, tables behind "See all".
- **Missing:** a zone scope with "fed by" / "feeds"; storage vs criteria per zone (only MP numbers).

### Wastewater › Plants & capacity / Blocks / Allocations / Pumping stations
- **Question:** can sewers take it?
- **Inventory:**
  - **Plants:** 4 plant tiles → % of rated bars with reserve / after-proposed / population-equivalent text (4,179 px).
  - **Blocks:** table with → next block (2,883).
  - **Allocations:** recorded list (109).
  - **Pumping stations:** 4 tiles + bar chart of PWWF % firm (894).
- **Correctness:** plant label (1.1); PS tile and sort by dry (1.1); the diversion cache bug (top 10 #5); allocations at 90% vs reserve at 100%.
- **Fit:** the Plants pane is 4,179 px below the fold at desk (5,426 on phone). Each plant carries five lines of text under its bar. **Merge them into one table:** rated · existing + committed · reserve (D-5-1) · room to 90% · after proposed · people-equivalent.
- **Missing:** a PS → plant link; a calibration factor value shown (only the subtitle mentions calibration); the diversion's effect as a ± figure per plant.

### DC › Timing / Recommendations / Funding
- **Question:** what must be built first?
- **Inventory:**
  - **Timing:** project table with "% committed → % build-out", status.
  - **Recommendations:** headline "…keep 39 ($997 M), defer 13… holds back ≈65,100–65,100 people (≈21,974–21,974 units)" → 4 tiles → top-10 bar chart (Keep / Defer colours) → Keep / Defer filter → table.
  - **Funding:** budget screen.
- **Correctness:**
  - **Degenerate range shown as "65,100–65,100" and "21,974–21,974"** (a display bug).
  - The default "$1.00 B of DC funding over 10 years" is an assumption presented as a fact.
  - Position risk (1.8); no "as of" or paused status (1.7); mixed dollar years (1.7).
- **Fit (desk):** 1,433 / 424 + 1,080 inner scroll / 374 + 332 px.
- **Verdicts:**

  | Sub-view | Verdict | Reason |
  |---|---|---|
  | Timing | Keep | Add status and "as of" |
  | Recommendations | Rename "Screening: in service vs need"; hide in the public version | Decision wording |
  | Funding | Hide in the public version | Funding screen |

- **Missing:** "if delayed 2 years" (proposed: a per-project toggle that shifts in-service by +2 years and re-runs the timing); links from a project to the developments relying on it (the loads list exists only via the map).

### Developments (list sub-view) and the Development tab
- **List:** sortable; columns are units, stage and municipality. Left to build, last activity and zone → plant are missing. A "See all" pattern exists.
- **Development tab:** About / Files & history / Site each run past one screen at desk (Files 1,864 px).
  - The Site checklist is never blank (good).
  - The Files tree is not yet the tree audit's structure (Step B of the tree work).
- **Verdict:** add the missing columns; Files gets "See all" after 10.

### Tool result
- Appears only while a result exists, and clears on × / Esc. ✔
- **But traces and Test a site don't use it.** They open the right-hand detail panel instead (screens `tool-rail-trace-tap`, `tool-rail-whatif-tap`). See 5.

---

## 5. Tool cards (L)

Run at 1440×900 dark on 0 Heritage Rd, zone 6 and block 15. Times are app response after the tap
(excluding fixed waits).

| Tool | Entry points | Banner / exit | Output home | Screening note | Known-case result | Verdict |
|---|---|---|---|---|---|---|
| Select (tap / lasso / box / radius / add area) | Rail | "Select · Tap/Lasso/Box/Radius… + Add area · Done"; Esc clears ✔ | Opens the development; a selection goes to the analysis panel | — | Tap opened 0 Heritage Rd (144 ms) | Keep |
| Measure & ground profile | Rail | "Measure: tap points…"; Esc ✔ | Banner (distance, elevation, "select within" radius) | n/a | Elevation unavailable here (blocked tiles) | Keep; move "select within radius" to Select (two homes for radius select) |
| Trace (sewer / water, any point) | Rail; dev scope bar (Trace sewer / Trace water) | Banner disappears after the tap | **Right-hand detail panel** ("Sewer path from this point"), not the Tool result tab | ✔ | 32.6 km to Clarkson WRRF through blocks 15→11→12→8→6→3→2; relies on DC 28-2136 / 28-2137 (2028) (267 ms) | Keep; result → Tool result tab; one home (rail) + the dev shortcut |
| Test a site | Rail ("Batch from CSV" inside) | Banner ends after the tap; **the test site stays on the map** after Esc | Detail panel (form + servicing) | ✔ (twice) | 200 apts → zone 6 3.04 L/s max day; Clarkson reserve 125 ML/d (458 ms) | Keep; result in the Tool result tab; clear on exit or list it in the trail |
| Inspect point | Rail | "tap anywhere · Esc" ✔ | Tool result ✔ (trail "Peel › Inspect point") | ✗ (estTag only) | Zone 6, block 15, "No watermain within 200 m" (204 ms) | Keep; add the note |
| Corridor select | Rail | Width chips, point count ✔ | Tool result on Done | ✔ | Needs ≥2 points (ran with 1) | Keep; add a horizon-year split (task 7) |
| How many more units fit? | Rail | "tap a point or zone · Esc" ✔ | Tool result ✔ | ✔ | Ran (244 ms) | Keep; label it screening |
| Compare | Dev scope bar | — | New report window (PDF) | ✔ | Opened | Keep |
| Upgrade a pipe (what-if) | Pipe popup only | — | Pipe panel | — | Not reachable while pipe results are hidden | Move behind the pipe-class work (Group 4) |
| Batch test sites | Inside Test a site | — | Tool result + CSV (CSV lacks the disclaimer) | ✔ | Not run (needs a CSV) | Keep; add the disclaimer to its CSV |
| What loads this? | Map tap on zone / block / plant / pipe | Trail crumb ✔ | Tool result ✔ | ✗ | Zone 6: 157 → 245 ML/d max day; block 15: 10.6 → 35.4 ML/d average dry; Clarkson: 13 blocks, 64% committed, reserve 125 ML/d (≈190 ms) | **Promote to the scope Overview** of the servicing ladder (Top 10 #8) |
| Area report | Export menu; What-loads result | — | Report window | ✗ | Opened | Keep; add the note |
| Memo | Dev scope bar; Export menu | — | Report window | ✗ (footer only) | Opened | Keep; add the note |
| FSR check | Dev scope bar | — | Report window / panel | ✔ | Opened (no FSR file) | Keep |
| Record allocation | Dev scope bar | — | Switches to Wastewater › Allocations | — | Opened | Keep; define "allocated" (1.4) |
| Watch | Dev scope bar | toggles ★ | This week | — | Toggled | Keep |
| Saved views | Layers card "Save" | — | Local storage | — | — | Move to the Export / share menu (it's a view, not a layer) |
| Heatmap / capacity colours | Layers card | — | Map | — | — | Keep |
| Presentation mode | **Top bar "Present" + map control** (two homes) | "Exit" + Esc ✔ restores | Overlay bar | ✗ | See card below | Fix (Group 9) |
| Time-lapse | Top bar | Presentation-style overlay | Map | — | — | Move into the Present menu |
| Inquiry response draft | Export menu | — | Text window | ✔ ("draft") | Opened | Keep (task 9) |

**Global checks**
- One tool at a time ✔: switching Measure → Inspect turns Measure off.
- Tools don't change filters or scenario ✔: before and after compared on every run.
- Tool results are in the trail ✔ for Inspect / Fit / What loads; ✗ for Trace and Test a site.
- A result survives a tab switch ✔ (Tool result tab).

### Presentation mode card (1920×1080)

| Check | Result |
|---|---|
| Headline ≥28 px and tile numbers ≥40 px | ✗ The largest text on screen is 33.6 px (the tile numbers), so tiles miss 40 px. The headline is smaller. |
| Only Exit visible | ✗ **18 controls stay visible:** top bar, tool rail, view switch, the analysis panel squeezed to the left |
| Shows the current scope | ✗ **Entering it closes the development** (`area-select.js:136` `closeDetail`), so it always shows the filter scope's Overview |
| Screening note and data date | ✗ neither |
| Dark vs light | Dark only. Recommend **light by default in Presentation mode** (projectors wash out dark themes) with a toggle. |
| Move between scopes without leaving | ✗ |
| Esc restores | ✔ (the view is restored; the closed development is not) |

---

## 6. Top bar and icon audit (M)

Measured at 1440×900 (w×h px). At 390 px the gear is pushed off-screen.

| Control | Icon | Label | Tooltip | Does | Keyboard | Phone tap size | Icon alone clear? |
|---|---|---|---|---|---|---|---|
| Peel (trail) | — | "Peel" | Clear all filters… | Scope trail | ✔ | 45×29 ✗ | n/a |
| Planning / Water / Wastewater / DC | ✔ | text | Switch to the … view | Map view + analysis tab | ✔ | 36×28 ✗ (icon only on phone) | Water / WW yes; Planning (map) and DC ($ in a circle) no |
| Scenario chip | — | "Scenario · calibrated (2025 flows)…" | ✔ | Opens assumptions | ✔ | 200×31 ✗ | n/a |
| Export | ✔ | text | ✔ | 13-item menu | ✔ | 80×31 ✗ | yes |
| Present | ✔ | text | ✔ | Presentation | ✔ | 86×31 ✗ | **two homes** (also a map control) |
| Time-lapse | ✔ | text | ✔ | Replay | ✔ | 107×31 ✗ | used less than weekly → menu |
| Help | ✔ | text | ✔ | Guides, tour | ✔ | 69×31 ✗ | yes |
| Settings (gear) | gear | aria-label only | "Settings" | Settings, Sources & checks, Change log | ✔ | 38×30, **off-screen** | yes |
| Zoom ± | +/− | — | ✔ | Map zoom | ✔ | 30×30 ✗ | yes |
| North (N) | arrow | "N" | ✔ | Rotation toggle | ✔ | 34×34 ✗ | yes |
| Tool rail (7) | custom | aria + title | ✔ | Tools | ✔ | 34×34 ✗ | Select / Measure yes. Trace, Test a site, Inspect, Corridor and Fit are **not standard**; add labels on hover / long-press, or a labelled flyout. |
| Present (map) | screen | aria | ✔ | Presentation | ✔ | 33×26 ✗ | duplicate |
| Layers card view switch | ✔ | text | ✗ none | **Duplicates the top-bar view switch** | ✔ | — | duplicate |
| Save (view) | — | "Save" | ✔ | Saved view | ✔ | 42×25 ✗ | misplaced (Layers card) |

**Duplicates:**
- the view switch (top bar and Layers card);
- Present (top bar and map);
- radius select (Select and Measure);
- the Memo (dev scope bar and the Export menu: acceptable as a shortcut).

**Proposed layout** (left → right):
1. **Navigation:** app name · scope trail · search (moved up from the Explore panel, so it's always reachable).
2. **View:** view switch (Planning · Water · Wastewater · DC) · Scenario chip.
3. **Output:** Export ▾ (CSV / GeoJSON / workbook / reports / print / share / saved views) · Present ▾ (Present · Time-lapse).
4. **Help / settings:** Help · ⚙.

Moves into menus: Time-lapse (→ Present ▾), Saved views (→ Export ▾), the Layers-card view switch (removed).

On phone: the view switch and Scenario go into a second row; Export, Present and Help go into one "⋯" menu. Every control is ≥44 px.

---

## 7. Findings B–J

| Id | Area | Finding | Severity | Screenshot | Recommendation |
|---|---|---|---|---|---|
| B1 | Network | Plants, pumping stations, trunks and zones aren't scopes; "what loads this" is a tool result | High | `desk-pz6-tool.jpg` | Servicing ladder (Group 5) |
| B2 | Network | A zone doesn't say what feeds it; the Zones table is not in supply order | Medium | `desk-peel-water-capacity.jpg` | "Fed by / feeds" line; supply-order sort |
| C1 | Levels | Municipality, area and development scopes still show Peel-wide Water / WW / DC tables | High | `desk-sp52-overview.jpg` | Scope-aware tabs (Group 6) |
| C2 | Levels | Areas can be picked only through Layers › Planning areas + a map tap; zones and blocks can't be picked as a filter | High | — | Area scopes in the trail and search |
| C3 | Levels | Items don't show their share of the level above, except a site's zone share and plant share | Medium | `desk-dev-overview-about.jpg` | "x% of zone 6's max day" on every row |
| D1 | Lens | No analysis pane fits at 1440×900 at Peel scope (643–4,179 px below the fold) | Medium | `desk-peel-ww-plants.jpg` | Headline → ≤4 tiles → one chart → top table + "See all" |
| D2 | Lens | The Layers card opens by default and covers about 40% of the map | Medium | `desk-peel-default.jpg` | Collapsed by default |
| E1 | Duplication | Peel units / people differ between the Overview and Growth / header | High | `desk-peel-overview.jpg`, `desk-peel-growth-pipeline.jpg` | One totals function |
| E2 | Duplication | Plant capacity appears in the Overview bars, Plants, DC timing, the briefing and the What-loads result with three different "room" bases | High | — | One plant table, linked |
| F1 | Areas | Tree audit: area tags by overlap with primary + others ✔ (in `tree-audit.json`); not yet in the app | Info | — | Step B of the tree work |
| F2 | Areas | No area holds units or acts as an application node ✔. Mississauga's OP character areas are explained in the ⓘ (`info.js:20`), but are toggled under the layer chip **"Secondary plans"** (`map-markers.js:123`) and fall back to "Secondary plan" as a filter label (`filter-ui.js:95`, `map-markers.js:189`) | Low | — | Label them "OP character areas" in Mississauga |
| F3 | Areas | 23 developments straddle 2+ plans; 27 precinct areas have no block plan file (lists in `data/tree-audit.json` › `areas`) | Info | — | Review lists |
| G1 | Form | DC Recommendations: degenerate range "65,100–65,100" | Medium | `desk-peel-dca-recommendations.jpg` | Show a single value when low = high |
| G2 | Form | Charts with colour as the only signal (Keep green / Defer amber; PS bars red / green) | Medium | `desk-peel-ww-pumpstations.jpg` | Add text labels or patterns; red / amber / green reserved for capacity only (Keep / Defer isn't capacity) |
| G3 | Form | Plant bars carry five lines of prose each | Medium | `desk-peel-ww-plants.jpg` | Table (6 columns) + a bar with threshold marks |
| G4 | Form | Timing / Pipeline chart labels below 11 px | Low | — | 11 px minimum |
| G5 | Form | "≈859/yr completed 2017–2027" (a future year) | Low | — | Clip to the data year |
| H1 | Interaction | Tool results land in 3 places (Tool result tab, detail panel, report window) | Medium | `tool-rail-trace-tap.jpg`, `tool-rail-whatif-tap.jpg` | One home |
| H2 | Interaction | Test site persists after Esc; chips overlap the Layers card | Low | `tool-dev-trace-sewer.jpg` | Clear on exit; move chips |
| I1 | Trust | Screening note wording differs from the one you require, and is missing on the Overview, verdict card, Water Capacity / Facilities / Hydro, Pumping stations, Allocations, DC, Growth, the briefing, memo, area report and Inspect | High | — | One note, your wording, everywhere (Group 10) |
| I2 | Trust | Main CSV, GeoJSON, allocations, corridor and batch exports have no disclaimer | Medium | — | Add `CSV_DISCLAIMER` |
| I3 | Trust | No criteria stamp with document + version on tables | Medium | — | Stamp under each table |
| I4 | Trust | Record provenance (portal, link, pulled-on) can be blank; CSV rows carry none | Medium | `desk-dev-overview-files.jpg` | Required fields |
| J1 | A11y | White on accent (#fff on #6da7ec) is 2.5:1 (fails AA): active view chip, Executive briefing button | Medium | — | Darken the accent fill or use dark text |
| J2 | A11y | Light theme: muted on surface-2 3.97:1; accent on surface-1 4.30:1 (fail AA for small text) | Low | — | Adjust tokens |
| J3 | A11y | Phone: 148 of 151 controls under 44 px; gear and filter panel controls off-screen | Medium | `phone-peel-default.jpg` | 44 px minimum on phone; top bar "⋯" menu |
| J4 | A11y | Keyboard focus is visible (2 px accent outline) ✔; colours are tokenised (no stray hex in CSS) ✔ | — | — | — |

---

## 8. Move / remove / merge

| Item | Now | Proposed | Reason |
|---|---|---|---|
| Executive briefing button | Overview body | Export menu (keep a link on the Overview) | Output, not content |
| View switch in the Layers card | Layers card | Remove | Duplicates the top bar |
| Map "Present" control | Map | Remove | Duplicates the top bar |
| Time-lapse | Top bar | Present ▾ | Used less than weekly |
| Saved views "Save" | Layers card | Export / share ▾ | It's a view |
| Radius select | Measure banner | Select only | Two homes |
| Plant prose under bars | Wastewater › Plants | One plant table | 4,179 px of scrolling |
| Uncommitted reserve vs room | 5 views, 2 bases | One plant table with both columns | Definitions |
| "New: SP94-…" completed old files | Overview › Needs attention | This week | Not a Peel-level concern |
| Pace / census / 2051 | Growth at development scope | Hidden at development scope; "compared with similar sites" instead | Wrong level |
| DC Recommendations / Funding | DC tab | Kept; hidden in the public version | Position risk |
| What loads this? (zone / block / plant) | Tool result | Scope Overview (servicing ladder) | It's a level, not a tool |
| Upgrade a pipe | Pipe popup | Behind the pipe-class work | Pipe results are hidden |

---

## 9. Task click counts

| # | Task | Today | Projected | Note |
|---|---|---|---|---|
| 1 | Servicing check for a development (zone, sewer path, plant reserve, DC) | 3 (search → pick → Trace sewer) | 2 | Trace summary in the Tool result tab |
| 2 | Which plant / zone reaches its trigger first, and when | 0 (plants, Overview headline); 2 for zones | 0 | Add zones to the needs-attention line |
| 3 | What changed this week | 1 | 1 | — |
| 4 | Area report for a secondary plan | **5** (Layers → Planning areas → tap area → Export → Area report) | 3 | Search finds areas; Area report on the area Overview |
| 5 | Find a file number and see its tree | 3 (search → pick → Files & history) | 2 | — |
| 6 | Most loaded zone / PS at build-out, tightest pipe local or trunk, developments driving it | **≈8, and the pipe part is impossible** (pipe results hidden) | 4 | Servicing ladder; pipe class |
| 7 | Growth by horizon year for an EA study area or corridor | **not available** (Corridor gives a total only) | 4 | Horizon split in the Corridor / area result |
| 8 | Developments relying on a DC project, and the effect of a 2-year delay | **not available** (loads only via the map; no delay toggle) | 3 | Project → loads link; +2 years toggle |
| 9 | Servicing statement for a pre-consultation response (with disclaimer) | **4** (search → pick → Export → Inquiry response draft) | 3 | In the dev scope bar |
| 10 | Export pipeline inputs for the next DC background study | 2 (Export → Excel workbook) | 2 | Add a "DC study inputs" sheet (units by phase, year and block) |

---

## 10. Proposed implementation PRs (Step 2, after your approval)

Correctness groups first. Each PR includes:
- before / after screenshots at 1440×900, 390×844 and 1920×1080;
- `npm test` passing, with tests for every changed calculation or label;
- README and tour updated.

| Group | Contents | Done when |
|---|---|---|
| 1. Pairings, basis, units, definitions | 1.1–1.4; one totals function; one definitions table (in Help and the ⓘ) used by every tab, export and the briefing; `scenarioKey` and diversion fixes | Every capacity figure names its capacity type, flow type and basis; Overview = Growth = header totals; tests pin each pairing |
| 2. Position-risk wording + public version | 1.8 table; `?public` / Settings switch hiding DC Recommendations / Funding, verdict tones and the Decision column | No decision words in the UI, exports or briefing; the public version verified by a test |
| 3. Capital currency | Status (scheduled / paused / unknown), "as of", May 2026 pause note, one dollar year with the index shown | Every capital date has status and "as of"; costs in one year-dollar |
| 4. Pipe class + "not assessed" | Class by size / ownership; "not assessed" wherever pipe results are off, including DC timing and the workbook | No pipe number is shown or exported while `PIPE_RESULTS` is off |
| 5. Servicing ladder + planning area scopes + trail | Plant / trunk / PS / block and plant / zone scopes with Overviews; area search; trail both ways | Task 6 ≤4 clicks; every servicing item opens as a scope |
| 6. Scope-aware tabs; duplicates removed | Servicing tabs filter to the scope or say "Peel-wide"; area-only content hidden at development scope | No Peel table at development scope without a label |
| 7. Tool consolidation + top bar | One result home; test-site cleanup; the top-bar layout in 6 | No duplicates; every control ≥44 px on phone |
| 8. Chart / table forms | Plant table; range fix; labels on colour-coded charts; ≥11 px; "See all" after 10 rows | Every pane at Peel fits headline + tiles + chart at 1440×900 |
| 9. Presentation mode | Any scope (development included), only Exit visible, ≥40 px tiles, note + data date, light default | Card in 5 passes |
| 10. Trust signals | Your screening note everywhere; CSV disclaimers; criteria stamp; required provenance | Note on every result; every export has the disclaimer |
| 11. Tokens and accessibility | Accent contrast; light-theme tokens; tap sizes | AA in both themes; 44 px on phone |

---

## Appendix A — position-risk strings (file:line)

- **DC recommendations:**
  - `dc-cost.js`: 302 REC "Keep · advance" / "Keep" / "Keep · could defer" / "Review"; 263 "bring it forward"; 264 "could follow later"; 265 "growth is held back"; 136 "advance it"; 100 "Over budget: holds back…"; 94 / 104 / 152 Keep / Defer; 127 / 152 / 155 keep / defer colours.
  - `dca-tab.js`: 69 / 92 headline; 71–73 / 95–97 tiles; 101–102 filters; 131 "needed sooner"; 167 CSV "Decision".
- **Briefing:** `reports.js` 113 "should be brought forward"; 143 "Bring forward"; 114 "at trigger now"; 192 memo status "Before DC" / "DC in time" / "Room"; 195 "Room after approved"; 213 "plant over-committed".
- **Over-committed:** `svc-plants.js:169`, `svc-data.js:298`, `fsr-check.js:152`, `fsr.js:99`, `dev-detail.js:413,481`, `dev-verdict.js:56`.
- **Trigger and timing:** `svc-tab.js:292` "is at its 90% expansion trigger now"; `overview-tab.js:135,145,196`; `masterplan.js:414,433,588` "Needed before the DC project" / "DC project in time" / "Room to build-out"; `tools-compare.js:204`; `tools-inquiry.js:126`; `export-comparison.js:29`.
- **Verdicts:** `dev-verdict.js:47,57,61,63,82`; `overview-tab.js:106,111,192`; `tools-batch.js:143–146`.
- **Room:** `tools-fit.js:212`, `tools-inspect.js:89`, `water-tab.js:134,137`, `masterplan.js:96–101`, `demand-ui.js:128,131`.

## Appendix B — measurement files
The inventory JSON (per screen: tabs, sub-tabs, controls, px below the fold, wide tables, small
text, screening note, trail) and all 162 full-size screenshots are kept out of the repo (63 MB). The
20 compressed screenshots referenced above are in `docs/design-audit/`.
