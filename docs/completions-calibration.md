# Completions calibration to CMHC: charter and decision log

Each bucket ends at a checkpoint where the owner reviews the output before the next bucket starts.
This file records the charter and every decision made at a checkpoint. Check new work against it.

## Charter (confirmed by the owner 2026-11-06)

**Goal:** a growth forecast of homes per year by municipality. One set of numbers serves three uses:
infrastructure timing, council reporting, and the pace against the 2031 provincial targets.

**Core decision it drives:** how fast the pipeline actually turns into homes. That pace comes from
completions, so completions have to be right first.

| # | Decision | Detail |
|---|---|---|
| 1 | Source of truth | The app's own permit-based count, **calibrated** to CMHC: fix the data until it lands within tolerance. Do not replace it with CMHC's numbers. |
| 2 | Match target | Within **~10%** of CMHC for **each municipality, each year**. |
| 3 | Geography | Municipality: Mississauga, Brampton, Caledon. |
| 4 | Calibration years | **2021–2025**, full years. 2026 is shown year to date only. |
| 5 | What counts | Two figures. **All** completed permits are matched to CMHC. All splits into **application developments** + **other** (permits with no planning application), and the two always add up to All. |
| 6 | Remaining gaps | A municipality-year still more than 10% off after the data fixes is **decided case by case** at a checkpoint. Nothing is scaled automatically. |

## Buckets

| # | Bucket | Status |
|---|---|---|
| 1 | Baseline and definitions: CMHC's definition, reconciliation report, no app changes | Done (checkpoint 1, 2026-11-06) |
| 2 | Mississauga dating: date a building's completion correctly (re-scoped, see Bucket 2 findings) | Done: rule C applied (checkpoint 2b) |
| 3 | Brampton and Caledon coverage | **At checkpoint 3** |
| 4 | Remaining gaps, reviewed case by case | – |
| 5 | In the app: application + other = all, CMHC beside it, flag when over 10% | – |
| 6 | Forecast on the calibrated completion pace (2031 / 2041 / 2051) | – |

## Bucket 1: baseline and definitions

### What CMHC counts as a completion

CMHC's site is blocked from this project's build environment. These points come from search
results quoting CMHC's methodology and Housing Information Monthly. Confirm them against
[CMHC's methodology page](https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-research/surveys/methods/methodologies-starts-completions-market-absorption-survey) before treating them as settled.

- **When a home counts as complete:** when all the proposed work is done. Under some circumstances a
  dwelling counts as complete with **up to 10% of the work still to do**. In practice this is about
  ready to occupy. A municipal permit's final sign-off ("all inspections signed off") is usually later.
- **How the survey is run:** a census, not a sample, of new structures, monthly in urban areas over
  50,000 people. Field staff visit sites to confirm each stage. Since 2023 completions are collected
  only in CMAs; Peel is in the Toronto CMA, so it is covered.
- **New structures only:** renovations and conversions inside existing buildings are out. A
  **secondary suite added to an existing house** (existing foundation) is a conversion, not counted.
  Suites built **with a new house** are counted, as apartments. Laneway homes count as singles.
- **Unit:** a structurally separate set of self-contained living premises.

Sources:
[CMHC methodology](https://www.cmhc-schl.gc.ca/professionals/housing-markets-data-and-research/housing-research/surveys/methods/methodologies-starts-completions-market-absorption-survey) ·
[Housing Information Monthly, 2021](https://publications.gc.ca/collections/collection_2021/schl-cmhc/nh12-11/NH12-11-2021-3.pdf) ·
[CMHC housing starts, August 2026](https://www.cmhc-schl.gc.ca/media-newsroom/news-releases/2026/housing-starts-construction-data-august-2026) ·
[TMU CUR blog 106](https://www.torontomu.ca/centre-urban-research-land-development/blog/blogentry106-plaudits-to-cmhcs-economics-team-for-its-contributions-to-market-insights/) ·
[TMU CUR blog 66](https://www.torontomu.ca/centre-urban-research-land-development/blog/blogentry66-ggh-housing-supply-oddities-when-comparing-cmhc-and-census-data/) ·
[Mountain Math, ins and outs of CMHC data](https://doodles.mountainmath.ca/posts/2022-06-12-ins-and-outs-of-cmhc-data/)

### Baseline (data: snapshot 2026-10-19; CMHC via Region of Peel open data, edited 2026-08-31)

Run it again with `node scripts/cmhc-reconcile.js`. The data refreshes weekly, so this table is the
record of where we started, and the tests do not pin it.

| 2021–2025 | Application developments | Other | **All** | CMHC | Gap | Years within ±10% |
|---|---|---|---|---|---|---|
| Mississauga | 15,739 | 5,754 | **21,493** | 13,974 | +54% | 0 of 5 |
| Brampton | 3,170 | 2,235 | **5,405** | 9,407 | −43% | 1 of 5 |
| Caledon | 938 | 1,881 | **2,819** | 2,667 | +6% | 2 of 5 |
| Peel | 19,847 | 9,870 | **29,717** | 26,048 | +14% | 1 of 5 |

All, by year, against CMHC:

| | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|
| Mississauga | 2,798 / 3,368 (−17%) | 1,997 / 1,161 (+72%) | 3,910 / 3,083 (+27%) | 5,369 / 2,469 (+117%) | 7,419 / 3,893 (+91%) |
| Brampton | 1,465 / 1,598 (−8%) ✓ | 1,673 / 2,251 (−26%) | 905 / 3,518 (−74%) | 727 / 1,287 (−44%) | 635 / 753 (−16%) |
| Caledon | 305 / 409 (−25%) | 636 / 640 (−1%) ✓ | 909 / 854 (+6%) ✓ | 363 / 415 (−13%) | 606 / 349 (+74%) |

Diagnostics, as parts of All for 2021–2025:
- **Suites on existing houses:** Mississauga 3,788; Caledon 930; Brampton 0. Brampton's second units
  are already held aside by the app.
- **Estimated completion dates:** all of Brampton's and Caledon's completions; Mississauga almost none.

### Checkpoint 1: for the owner

1. Confirm the CMHC definition above as the one to match.
2. Should **suites added to existing houses** come out of All, as CMHC leaves them out?
3. Once Bucket 1 is approved, Bucket 2 starts on Mississauga's dating (first sign-off).

### Checkpoint 1 decisions (owner, 2026-11-06)

| # | Decision |
|---|---|
| 7 | The CMHC definition above is the one to match: complete at about ready to occupy, new structures only. |
| 8 | **Suites added to existing houses come out of All**, as CMHC leaves them out. They stay a separate line so those homes are not lost from the forecast. |
| 9 | The baseline is recorded here, not pinned in tests (the data refreshes weekly). |
| 10 | Bucket 2 (Mississauga dating) starts. |

## Bucket 2: Mississauga (findings before the plan, 2026-11-06)

Using the first sign-off, the original Bucket 2 idea, is **not supported by the data**:

- **By dwelling type, 2021–2025, suites removed:** singles 616 vs CMHC 611 and semis 110 vs 128
  already match. Rows are 1,446 vs 1,066. **Apartments are 14,715 vs 12,169**, and with an 855-unit
  tower whose type wasn't recognised, about 15,570.
- **Why the dates are wrong:** Mississauga publishes each high-rise as several rows under one permit
  number. **CON** is a conditional permit, usually "foundation only", and it carries the units.
  **CR1, CR2, …** are later conditional stages, each "completed" when the next stage replaces it. The
  **base permit** (no suffix) is the full permit, and its completion is the final "all inspections
  signed off". The app merges the rows, so every stage closure looks like the building being
  completed. Example: 17-4898 (25 and 34 storeys) shows completions in Nov 2018, Apr 2019, Dec 2020
  and Feb 2021.
- **The first closure** is usually the foundation permit, years too early. **The last** is the final
  sign-off, which can come years after people move in.
- **The base permit's sign-off alone undercounts:** a rough test gives about 8,000–9,300 apartments
  in 2021–2025 against CMHC's 12,169. 32 buildings (13,046 units) have no final sign-off yet, and
  some are already occupied (151 City Centre Dr is a registered condominium with no full permit row).

### Bucket 2 decisions (owner, 2026-11-06)

| # | Decision |
|---|---|
| 11 | Replace "first sign-off" with dating each building filed in stages from its stage closures and final sign-off. |
| 12 | A dating rule may be fitted to CMHC, with **one** explainable number per rule, not one per year. |

### Bucket 2 results (data: snapshot 2026-10-19)

Built:
- **Suites:** out of All, reported as a line of their own (decision 8).
- **Stage labels:** each permit event now records which part of the permit it belongs to (`e.part`:
  `stage` or `final`, from `js/phases.js permitPart`), kept when rows are merged. No figure in the
  app changes.
- **Rules A, B and C:** in `scripts/cmhc-reconcile.js` (`--rules`), each with its one number fitted
  to CMHC.

2021–2025 with suites removed (Mississauga 17,705, +27%; Brampton 5,405, −43%; Caledon 1,889, −29%;
Peel 24,999, −4%).

Mississauga under each rule (units, gap against CMHC):

| Mississauga | 2021 | 2022 | 2023 | 2024 | 2025 | 2021–2025 | Years ±10% |
|---|---|---|---|---|---|---|---|
| CMHC | 3,368 | 1,161 | 3,083 | 2,469 | 3,893 | **13,974** | |
| Today (latest date) | 2,368 (−30%) | 1,495 (+29%) | 3,121 (+1%) ✓ | 4,323 (+75%) | 6,398 (+64%) | **17,705** (+27%) | 1 of 5 |
| A: final sign-off (lead fitted: 0 mo) | 2,368 (−30%) | 1,194 (+3%) ✓ | 1,941 (−37%) | 2,507 (+2%) ✓ | 2,299 (−41%) | **10,309** (−26%) | 2 of 5 |
| B: last stage closure | 1,500 (−55%) | 2,483 (+114%) | 4,159 (+35%) | 3,432 (+39%) | 5,697 (+46%) | **17,271** (+24%) | 0 of 5 |
| C: final, else last stage + 24 mo | 3,046 (−10%) ✓ | 1,194 (+3%) ✓ | 1,941 (−37%) | 2,808 (+14%) | 3,479 (−11%) | **12,468** (−11%) | 2 of 5 |

- **Two numbers don't help:** a final-sign-off lead and a stage lag fitted together don't beat C.
- **Why single years swing:** 68% of Mississauga's 2021–2025 completions are in towers of 300+
  units, and only 2–5 such towers finish in a year, so one tower is 10–35% of the year. If a tower's
  date falls on the wrong side of December 31, that year misses ±10%, whatever the rule.
- **Two-year windows under C:** 2021–22 −6%, 2022–23 −26%, 2023–24 −14%, 2024–25 −1%.

### Checkpoint 2 decisions (owner, 2026-11-06)

| # | Decision |
|---|---|
| 13 | **Rule C** dates a building filed in stages: its final sign-off; with none yet, its last stage closure + 24 months. |
| 14 | **Match target, Mississauga:** within ~10% over **two-year windows** (2021–22, 2022–23, 2023–24, 2024–25), plus the five-year total. Brampton and Caledon stay per year. This revises decision 2 for Mississauga only: its completions come in towers too large for single years to match. |
| 15 | Rule C is applied in the app (`js/areas.js completedAt`), with what else moves shown at the checkpoint. |

### Rule C applied in the app (2026-11-06)

`js/areas.js completedAt`: a building filed in stages is complete at its final sign-off; with none
yet, at its last stage closure + 24 months, marked estimated.

2021–2025 against CMHC, after the change:

| | All | CMHC | Gap | Target |
|---|---|---|---|---|
| Mississauga | 12,468 | 13,974 | −11% | two-year windows: 2021–22 −6% ✓, 2022–23 −26% ✗, 2023–24 −14% ✗, 2024–25 −1% ✓ → not met |
| Brampton | 5,405 | 9,407 | −43% | 1 of 5 years → not met |
| Caledon | 1,889 | 2,667 | −29% | 0 of 5 years → not met |
| Peel | 19,762 | 26,048 | −24% | 1 of 5 years |

What else moved in the app:
- **Completions per year** (Growth › Pipeline with years selected, the per-year strip, the
  by-municipality table) moved in **Mississauga only**. Application developments, before → after:
  2021 1,516 → 2,194; 2022 1,048 → 747; 2023 2,694 → 1,514; 2024 4,228 → 2,713; 2025 6,253 → 3,334;
  2026 4,976 → 5,090.
- **Unchanged:** built since the 2021 census, the Built and Existing layers, the Completed /
  Permitted / Left to build tiles, Brampton and Caledon. Every staged tower lands after census day
  under either dating, and the tiles do not use dates.
- **Open item, not changed:** 17 Mississauga towers (5,801 units) have a full permit still open,
  so rule C dates them after today. Their merged status is still "completed", so the tiles and the
  Built layer count them as built. Settle this in Bucket 4 or 5.
- **Outside the calibration years:** Mississauga 2026 to date is 3,379 units at final sign-off plus
  1,816 estimated, while CMHC has 77 for January–June. Some final sign-offs come well after people
  move in.

### Bucket 3 findings (before the plan)

Units on building permits issued, the app against the Region of Peel's permit statistics:

| | 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 |
|---|---|---|---|---|---|---|---|
| Brampton, app | 2,104 | 1,465 | 1,691 | 945 | 778 | 758 | 690 |
| Brampton, Region | 5,424 | 5,983 | 8,786 | 6,984 | 6,307 | 5,523 | 4,602 |
| Caledon, app | 377 | 358 | 936 | 968 | 321 | 911 | 264 |
| Caledon, Region | 403 | 434 | 1,110 | 1,498 | 568 | 853 | 357 |
| Mississauga, app | 3,580 | 1,903 | 4,930 | 5,864 | 2,896 | 1,833 | 1,297 |
| Mississauga, Region | 3,747 | 2,352 | 4,945 | 6,235 | 3,626 | 1,371 | 1,734 |

Brampton's permits carry 15–25% of the units the Region reports: a **coverage** gap, not mainly a
dating one. Caledon's and Mississauga's permits are close to the Region's.

### Bucket 3 decisions (owner, 2026-11-06)

| # | Decision |
|---|---|
| 16 | Bucket 3 covers Brampton **and Caledon**. |
| 17 | The 17 Mississauga towers dated after today (full permit still open) are deferred to Bucket 4/5. |

### Bucket 3 results: where Brampton's and Caledon's gaps sit (no app change yet)

`node scripts/cmhc-reconcile.js --types` gives completions by CMHC's four dwelling types. As CMHC
counts them: a back-to-back townhouse is a row, a stacked townhouse an apartment.

**Brampton: houses match; apartments are missing.** 2021–2025, app vs CMHC: singles 2,936 vs 3,010,
semis 286 vs 288, rows 2,183 vs 2,414, **apartments 0 vs 3,695**.
- **The Region's permit statistics** count Brampton's second units: 15,550 "Change of Use – Two Unit
  Dwelling" permits in 2021–2023 alone, all in existing houses. CMHC leaves those out, and so does
  the app (held aside). They explain most of the gap with the Region's figure.
- **Apartment permits state no units:** Brampton's 94 completed apartment permits in 2021–2025 say
  nothing about units. The app already estimates units for a development's build-out from its
  planning file (`inferBlankPermits`), but completions per year do not use the estimate.
  - **Fix B1:** count those estimated units in completions per year, dated by the permits. It
    recovers 2021–2025: 296 · 420 · 384 · 756 · 512 = **2,368 of CMHC's 3,695** apartments.

**Caledon: houses short, a few apartments extra.** Singles 983 vs 1,720, rows 348 vs 798,
apartments 176 vs 73, unclassed 325 (builders' model homes named only by model: mostly singles).
- **Permits left open:** Caledon's permits match the Region's, but many house permits stay "Issued"
  for years. Of the homes issued in 2021, 443 units are open and 492 closed. CMHC counts the houses
  once built; the app counts only closed permits, or open ones after five years with no status.
  - **Fix C1:** count an open house permit as complete N months after issue, estimated. It
    recovers 2021–2025: +12 mo 1,579 · +18 mo 1,293 · +24 mo 1,143.
- **"(BB)" basement apartments:** most Caledon suites are "Alter Detached (Basement Apartment)",
  which are conversions. About 884 units (2021–2025) are tagged "(BB)", a tag also on builders'
  model homes, so it likely marks builder permits in new subdivisions. A basement apartment built
  with a new house is one CMHC counts.
  - **Fix C2, the owner's call:** count "(BB)" basement apartments in All.
- **Data error:** a few garage and deck permits carry unit counts.

### Checkpoint 3 decisions (owner, 2026-11-06)

| # | Decision |
|---|---|
| 18 | **Fix B1 applied:** completions per year count the homes inferred on Brampton's permits that state no units. |
| 19 | **Fix C2 skipped:** Caledon's "(BB)" basement apartments stay out of All. The tag's meaning is unconfirmed. |
| 20 | **Fix C1, fitted:** a Caledon house permit still "Issued" is built N months after issue. N is fitted to CMHC. |

### Fix B1 applied (2026-11-06)

`js/growth.js completionStats`: a development's inferred completed homes are spread evenly over its
completed permits that state no units, in their years, as "built since the census" already does
(`js/areas.js builtSince`).
- **Brampton 2021–2025:** 5,405 → **7,773** against CMHC 9,407 (−43% → −17%). Years: 1,761 (+10%) ·
  2,093 (−7%) ✓ · 1,289 (−63%) · 1,483 (+15%) · 1,147 (+52%).
- **Single years still swing** because Brampton's apartment completions are dated issue + 30 months,
  an estimate. CMHC's 2023 alone has 2,145 apartments.
- **What moved:** Brampton's completions per year only. Built since the census and the tiles already
  counted the inferred homes.

### Fix C1: fitted, held for the owner's review (saved as `docs/completions-calibration-c1.patch`, not applied)

`js/phases.js closeOpenCaledonHouses`: a Caledon house permit (fewer than 20 units, homes not suites)
still "Issued" N months after first issue is taken as built then, estimated. The date is kept on the
permit, not added as an event, so the forecast curves (Timing learns from dated completions only)
never learn from it.

Caledon, 2021–2025, by N (each year's gap; ✓ within 10%):

| N | 2021 | 2022 | 2023 | 2024 | 2025 | Total |
|---|---|---|---|---|---|---|
| 12 | −31% | +46% | +13% | −28% | +154% | 3,374 (+27%) |
| 18 | −36% | +18% | +9% ✓ | +7% ✓ | +99% | 3,088 (+16%) |
| **24 (best)** | −44% | −7% ✓ | +31% | −3% ✓ | +75% | **2,958 (+11%)** |
| 30 | −42% | −11% | +10% | −11% | +116% | 2,870 (+8%) |
| 36 | −29% | −16% | −9% ✓ | +34% | +104% | 2,880 (+8%) |

What else C1 moves, because those houses become built across the app:
- **Caledon built since the 2021 census:** 3,019 → 4,154.
- **Built layer:** 636 more Caledon developments.
- **DC servicing gate (`data/dc-gate.json`):** 768 Caledon developments leave it. Built houses no
  longer wait on servicing.
- **Development keys:** 3 Caledon developments get new keys. A key comes partly from its files'
  stages.

To apply C1 once approved: `git apply docs/completions-calibration-c1.patch`, then rebuild the DC gate
(`node scripts/build-dc-gate.js --data data`), which its test asks for.
