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
| 2 | Mississauga dating: date a building's completion correctly (re-scoped, see Bucket 2 findings) | **At checkpoint 2** |
| 3 | Brampton undercount: units on permits that state none, issue→completion lag, permit coverage | – |
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
