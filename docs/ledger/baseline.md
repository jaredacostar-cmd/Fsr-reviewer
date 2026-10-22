# Pipeline ledger: Phase 0 baseline

Taken Oct 21, 2026, on branch `claude/new-session-nwxgo0` from `main` at `30b8805` (the latest `main`, two
commits after the plan's `699e3e8`); the numbers below are measured there. Snapshot of applications and permits: Oct 19, 2026
(`data/snapshot.json`, generated 2026-10-19T10:45Z). DC gate: `data/dc-gate.json`, built 2026-10-20.

Every later phase must reconcile back to these numbers.

## Tests

`npm test` before any change: **1,282 tests, 1,282 pass**, 0 fail (54 s).

## Peel scope, as the app shows it

Measured in the running app (`npm start`, headless Chromium), Peel with no filters: the developments
the Overview counts (`PeelDemandUI.overviewSet()`: the default stages, applications only, new building,
dormant developments held aside, 2,801 of 23,240 developments built from the files).

| Measure | Peel | Mississauga | Brampton | Caledon |
|---|---:|---:|---:|---:|
| Developments | 2,801 | 785 | 1,871 | 145 |
| Units planned (`Growth.pipelineTotals`) | 234,355 | 85,779 | 120,732 | 27,844 |
| Units left to build (`PeelPhases.unbuiltOf`) | 198,152 | 63,246 | 108,250 | 26,656 |
| Committed, D-5-1: developments | 429 | | | |
| Committed, D-5-1: units planned | 41,743 | 9,671 | 22,013 | 10,059 |
| Committed, D-5-1: units left to build | 35,367 | 6,892 | 18,780 | 9,695 |
| People (all units planned, Peel design criteria) | 693,204 | | | |
| People in units left to build | 587,106 | | | |
| People, D-5-1 committed, left to build | 116,077 | | | |

Other figures on the same set: 688 developments state units; 43,031 units permitted; 36,203 completed;
112,066 jobs. The Overview headline reads "About 234,000 homes are in the planning pipeline … About
198,000 are not yet built."

The ledger counts **units left to build** (built units are not in it), so its Peel total is 198,152
units and 587,106 people. Checked: Growth › Ledger at "Everything" shows 198,152, and the people
switch shows the people figure, with every parent row equal to the sum of its rows.

## Phase 1A: committed under the Peel rule

Rule (D1, settled Oct 21, 2026): committed = a site servicing permit (dc-gate bucket "counted",
filed or issued), which commits the whole development, or a building permit, which commits only the
units it covers, not yet built. Septic sites never count. Since Oct 21 this is the default
"committed" in the ledger, the Overview and the briefing; the capacity checks keep MECP D-5-1.

| Units left to build | Peel | Mississauga | Brampton | Caledon |
|---|---:|---:|---:|---:|
| Committed, D-5-1 (baseline) | 35,367 | 6,892 | 18,780 | 9,695 |
| Committed, Peel rule | **15,128** | 7,658 | 6,223 | 1,247 |
| of which by site servicing permit | 12,221 | 7,104 | 4,940 | 177 |
| of which by building permits | 2,907 | 554 | 1,283 | 1,070 |
| Change | **−20,239 (−57%)** | +766 | −12,557 | −8,448 |
| Developments committed | 429 → 251 | 136 → 116 | 265 → 101 | 28 → 34 |

Why it drops, at Peel (the parts add up: 35,367 − 20,052 − 1,440 − 3,385 + 3,849 + 789 = 15,128):

- **−20,052 units: approved, no permit yet.** Draft or site plan approval with no building permit and
  no site servicing permit. D-5-1 counts them; the Peel rule makes them "approved, not committed".
  The drop is largest in Brampton (11,175) and Caledon (7,204), where subdivision homes rarely get a
  site servicing permit (as the plan's coverage figures foresaw).
- **−1,440 units: permits that cover no homes still to build.** Approved developments with building
  permits whose permitted units are none, or already built (almost all in Brampton, 1,437). They count
  as committed developments, but commit 0 units.
- **−3,385 units: permitted only in part.** Only the units the building permits cover are committed
  (Caledon 1,833, Brampton 1,117, Mississauga 435).
- **+3,849 units: committed before approval.** Developments still in review or pre-application that
  already filed a site servicing or building permit, mostly in Mississauga (2,793). This is why
  Mississauga goes up.
- **+789 units: still building on completed developments.** Units on open building permits of
  developments whose stage is Built; D-5-1 counts a completed development as not committed.

As the Overview, the briefing and the ledger show it: **14,759** units committed (15,128 less the
369 units on possibly lapsed servicing permits, below) and 25,144 approved, not committed. People
committed: 116,077 under D-5-1, 43,372 under the Peel rule.

Flags on the same set:

- **Possibly lapsed: 8 developments, 369 units.** A site servicing permit issued 3 or more years ago
  with no building permit filed since. Their commitment drops back to the development's planning
  stage (approved, not committed, for an approved site; in review for one still in review). None is
  flagged "cancelled by the city" yet: `data/dc-gate.json` lists cancelled permits only from the next
  weekly build (see below).
- **Permit units estimated: 13 developments** (9 before completed developments' open permits counted, the +789 above). A residential building permit states no units (and the
  build-out could not infer them): the development's units are split evenly across its permits.
- **54 developments with units left to build have no dc-gate row** (the gate was built a day before
  the snapshot the app now loads). They are judged on building permits only until the next build.

## Data notes

- Rebuilding `data/dc-gate.json` from today's inputs does not reproduce the committed file (counted
  units would go from 23,877 to 17,118), so the data file is not rebuilt in this branch. The build
  script now also writes each development's cancelled water / wastewater servicing permits
  (`cancelled`); the weekly build on Monday picks it up, and the "cancelled by the city" flag then
  works. A rebuild today finds 2 developments with one.
- "Permit" means filed, not only issued, for both permits (the open point in D1). The ledger rows
  carry the first building permit issue date and the servicing permit issue date, so issued-only can
  be filtered later.
