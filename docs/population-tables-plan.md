# Population tables 1, 2 and 5: audit and plan

**Status: report only. No app code changes.** This is for you to read before anything is built.
Four decisions are marked **D1–D4**.

These tables use the planning tree, the planning areas and the servicing links to show where
the pipeline's population sits:

1. **Roll-up:** Peel → municipality → secondary plan (→ sub-area) → precinct or block plan →
   development → files. Units, persons per unit, people and jobs at every level, with a check
   column showing the children sum to the parent.
2. **Plan vs target:** each plan's target population against its pipeline population, split
   into committed (D-5-1) and proposed.
5. **Plan × servicing matrix:** secondary plans down the side; wastewater plants and pressure
   zones across the top; people at build-out in the cells.

The live figures below were measured in the app on main (`6960cc4`), at Peel scope, all
stages, basis "all", 2021–2026 timeline. Code references are to main.

---

## 1. Audit

### 1.1 What there is to build on

| Need | What exists | Where |
|---|---|---|
| One population definition | `PeelDemand.estimate(set, criteria, basis, jobsOf)`. Persons per unit: single 4.2, town 3.4, apartment 3.1, high-density apartment 2.7. Basis is all / committed / remaining. `isCommitted` follows D-5-1 | `js/demand.js` |
| One unit definition | `Growth.pipelineTotals` (planned / permitted / completed / left), shared by the header, Overview, Growth and the briefing | `js/growth.js` |
| Plan on a development | `p.sp` and `p.mtsa`: id lists from a point-in-polygon test | `js/plan-areas.js:35-41` |
| Planning areas | 120 "secondary plans" in `data/areas.json`: Mississauga 57 OP character areas, Brampton 38 (sub-areas like "40 (a): Bram West"), Caledon 25. Also 75 MTSAs and 30 Brampton precincts. Fields are `id, name, municipality, rings` only | `data/areas.json` |
| Servicing on a development | Plant: `plantOfDev(p)`, one per development, from the first wastewater block. Zone and block: `svcIds(p, 'pz' / 'dr')`, which can return more than one | `js/map-markers.js:382`, `js/svc-data.js:128` |
| The tree (PR #180) | File nodes, containment and same-land links, the counted-once rule, area tags with a primary plan, straddling and precinct lists | `js/tree.js` (**not loaded by the app**), `data/tree-audit.json` |
| Municipal targets | Region 2051 allocation per municipality: population, units and jobs for 2021 and 2051 | `data/peel-reports.json` `forecast2051` |
| An existing plan-vs-target view | Growth › Census & 2051 `forecastTableHTML`: 2051 growth allocated vs built + approved + proposed, **municipal level only** | `js/census-view.js:146-171` |

### 1.2 Measured gaps (live app)

| Check | Result | Consequence |
|---|---|---|
| Developments shown / Peel population | 1,367 / **597,132** people | Every table's Peel row must equal this figure |
| Developments with no plan (`p.sp` empty) | **40**, 22,738 people | They need an "Not in a secondary plan" row, or children won't sum to the parent |
| Developments in two plans | **15**, 18,634 people | Summing `p.sp` counts them twice |
| Naive sum over plans | 593,028, which is 4,104 short of Peel | Looks nearly right but hides both errors above. This is why the check column matters |
| Plans with any development | 107 of 120 | |
| By plant | G.E. Booth 441,363 · Clarkson 154,909 · Inglewood 55 · **none 805** | Sums exactly to Peel. The matrix needs a "no plant" column |
| By pressure zone | 1,364 developments in one zone, **2 in two**, 1 in none | The matrix needs a primary zone per development |
| By municipality | Mississauga 198,088 · Brampton 305,381 · Caledon 93,663 | Sums exactly to Peel |

### 1.3 Structural findings

1. **The tree isn't live.** `js/tree.js` isn't loaded by `index.html`. The app still groups files
   into developments with `PeelPhases.buildProjects` (`js/phases.js`, owned by the tree work).
   - The tree counts more proposed units than the app: 263,277 vs 248,340
     (`tree-audit.json` `.totals`).
   - A roll-up built on the app's developments matches the header today. One built on the tree
     won't, until Step B makes the tree live. → **D1**
2. **Nested plans.** Six "secondary plans" sit fully inside another (e.g. Bolton Core in Bolton,
   Malton CN in Malton NHD, South Common CN in Erin Mills NHD). That is the source of the 15
   double-assigned developments. They are really a sub-level, not siblings.
3. **Point vs boundary.** The app places a development in a plan by its point. The tree uses the
   root file's boundary, taking the largest overlap as primary.
   - 23 trees straddle two or more plans.
   - Example: SPA-2024-0169 has 1,878 units split about 50/50 across Hurontario-Main and
     Flowertown. → **D2**
4. **No precinct or block-plan level in the app.**
   - Precincts are in `areas.json` but not loaded.
   - 27 of 30 precincts have no block-plan file.
   - 15 block-plan roots exist in the tree.
   - Precinct numbers don't always follow plan numbers: Precinct 44-1 lies in "51: Mount
     Pleasant".
5. **Area-plan developments carry only their residual units.** Their draft plans are separate
   developments. Summing developments is correct. Adding a block plan's members on top
   (`areaMembers`) would double count.
6. **No plan-level targets anywhere.**
   - Only municipal 2051 allocations exist.
   - About three Caledon secondary-plan figures sit in rejected lookup notes: 2026-0007 = 6,680;
     2024-0010 = 7,600; 2025-0004 = 900. There is also Wildfield (OPA 285, about 6,800 units /
     22,000 people).
   - Table 2 needs a new, sourced data file. → **D3**
7. **Targets and the app use different persons-per-unit bases.**
   - The 2051 allocation counts growth since 2021 at household-size persons per unit (and
     includes the census undercount).
   - The app uses Peel design criteria (2.7–4.2).
   - Units compare like for like; people don't. `census-view.js:170` already warns about this.
8. **Definitions differ between existing views.** Units differ by view:

   | View | Units |
   |---|---|
   | Overview / header | `p.units` (pipelineTotals) |
   | Servicing tables (`growthSince`) | `buildout.unbuilt`, skipping developments with no build-out |
   | Scope lists (`loadRows`) | `estimate 'all'`, dropping `existing` and `out` |

   The new tables must use the Overview definition, so the Peel row equals the header. → **D4**
9. **The workbook's Developments sheet has no plan column.** It has zone, catchment and plant,
   but no `sp` or `mtsa`. Also, `est_population` there ignores jobs-of.

---

## 2. Decisions needed

| # | Question | Recommendation |
|---|---|---|
| **D1** | Which grouping do the tables use: the app's developments, or the tree? | **The app's developments now**, so every total equals the header and Overview. Switch to the tree when Step B makes it live. The tables are written against an interface, so the switch is one change. |
| **D2** | Where does a development that straddles plans go? | **One primary plan per development**: the innermost plan containing its point. A nested plan becomes a sub-level of its parent (Bolton › Bolton Core). Straddling developments get a ⇄ marker and an "also in …" note, never a split. A list sits under the table. A share-by-area split can come later, once the tree is live, because it needs boundaries, not points. |
| **D3** | Where do plan targets come from? | A new **`data/plan-targets.json`**. Each entry: plan id, population, units and/or jobs, horizon year, source document, page, and date. Start with the three Caledon figures already found plus Wildfield. You (or I, by researching OPs and secondary-plan bylaws) add the rest. A plan with no entry shows **"no target"**, not 0. The municipal row always has the Region's 2051 allocation. |
| **D4** | Which population basis? | **The Overview's**: `estimate(set, criteria, basis, jobsOf)` with the app's basis switch (all / committed / remaining). The Peel row equals 597,132 at "all". The matrix states the same basis and links to Wastewater › Plants for the plant-model view, which uses census-relative layers. |

---

## 3. Plan

### 3.1 Shared engine: `js/plan-rollup.js` (pure, testable, no UI)

- `primaryPlan(p)`: the innermost `p.sp` (smallest area); `null` if none.
- `planTree(areas)`: municipality → plan → nested plan, from 100% containment. Brampton
  sub-areas ("40 (a)", "40 (b)") nest under their plan number, "40".
- `precinctOf(p)`: Brampton only. Loads `areas.precincts` (already in `areas.json`) and tests
  the point.
- `rollup(set, opts)`: nodes `{ id, kind, name, children, devs, units: {planned, committed,
  proposed, permitted, completed, left}, people, jobs, ppu, check }`.
  - `check` = parent minus the sum of its children. It must be 0.
  - An **"Not in a plan"** child is added wherever needed so that holds.
- `matrix(set, cols)`: rows = primary plans; cols = plants (G.E. Booth, Clarkson, Inglewood,
  no plant) or primary pressure zones; cells = people (and units).
  - Row totals equal table 1's plan rows.
  - Column totals equal the per-plant sums.
- All sums go through `PeelDemand.estimate` and `Growth.pipelineTotals`. No new math.

### 3.2 Table 1: roll-up (Growth › new sub-view "By plan")

- **Columns:**
  - Units: planned, committed, proposed, left to build.
  - Persons per unit (people ÷ units).
  - People, jobs, developments.
  - **Check:** ✓, or the difference.
  - **Of which in an MTSA:** an overlay column, never added up.
- **Rows:** expand and collapse. Peel and municipalities are open by default. A plan's child rows
  show 10 at a time, with See all. Each development row opens the development. Each plan row
  opens the plan scope that already exists through the trail.
- **Below the table:**
  - the straddling list;
  - nested plans folded into their parent;
  - precincts with no block plan.
- **CSV and workbook sheet "By plan":** one row per node, with a `path` column
  (`Peel/Brampton/40 Bram West/…`) for pivot tables. Carries the disclaimer, screening line and
  criteria stamp.
- **Tests:**
  - every parent's check is 0 on the live-shaped fixtures;
  - the Peel row equals `estimate(set)`;
  - nested plans are not double counted;
  - the "Not in a plan" row appears;
  - straddling developments get the marker.

### 3.3 Table 2: plan vs target (columns added to Table 1, plus a focused view)

- **Columns:**
  - target (units / people, year, source link);
  - pipeline committed / proposed;
  - **% of target in the pipeline**, shown both committed-only and total;
  - **gap**.
- **Units are the main comparison.** People are shown with a note that targets use household
  persons per unit and the app uses design persons per unit (finding 7).
- **Municipal rows** use the Region 2051 allocation. Their growth (2051 minus 2021) is compared
  against the pipeline, as `forecastTableHTML` does now. That view gains plan rows instead of a
  second table appearing.
- **Plans without a target** show "no target" plus a "targets: …" note where a developer OPA
  names one (`tree.opaTargets`).
- **Tests:**
  - "no target" is never 0;
  - percentages use committed vs total correctly;
  - every number in `plan-targets.json` has a source.

### 3.4 Table 5: plan × servicing matrix (Growth › By plan, second table; also in the workbook)

- **Toggle:** Plants | Pressure zones.
- **Cells:** people at build-out (units on hover). Each cell links to that plan × plant set:
  - opens the plant's servicing scope (G5) filtered to the plan;
  - row header opens the plan;
  - column header opens the plant scope.
- **Rows:** primary plan, plus "Not in a plan". **Columns** include "No plant" / "No zone".
- **Totals:** row totals equal Table 1; column totals equal the plant figures (G.E. Booth
  441,363 · Clarkson 154,909 at "all").
- **Basis note:** "Pipeline people at Peel design criteria (same as the Overview). Plant
  capacity tables use census-relative layers; see Wastewater › Plants."
- **Pressure zones:** a development in two zones goes to the first (2 developments today), with
  a note.
- **Tests:** row and column totals reconcile; no development is counted twice; the "No plant"
  column equals the 805 today on the fixture.

### 3.5 PRs (one per step, as in Step 2)

| PR | Content | Depends on |
|---|---|---|
| A | `plan-rollup.js` + tests + precinct loading. No UI | D1, D2, D4 |
| B | Table 1 UI, CSV, workbook sheet, plan column in the Developments export | A |
| C | Table 5 matrix | A |
| D | `plan-targets.json` (sourced) + Table 2 columns in Table 1 and the Census & 2051 view | A, D3 + target data |

Each PR follows the usual workflow:
- screenshots at desk, phone and projector;
- `npm test` and `npm run lint`;
- README and tour updates.

Your known-answer figures, once pasted, go into git-ignored `tests/private/`. I'll report only
agree or differ, and by how much.

### 3.6 Risks

- **Moving totals.** When the tree goes live (Step B), plan totals change: about 15k more
  proposed units Peel-wide. The tables will then carry a "grouping: tree" stamp.
- **Point assignment.** Large sites near a plan boundary can land in the neighbour. The
  straddling list makes this visible until boundary shares arrive with the tree.
- **Target coverage.** Table 2 is only as good as `plan-targets.json`. Expect "no target" on most
  Mississauga character areas, which have no population targets.
