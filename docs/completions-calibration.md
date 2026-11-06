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
| 1 | Baseline and definitions: CMHC's definition, reconciliation report, no app changes | **At checkpoint 1** |
| 2 | Mississauga dating: date a completion by its first sign-off, not the latest | – |
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
