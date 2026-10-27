# Capital › DC projects: which developments does each one affect?

(2026-10: since navigation phase 4 this list is Capital › DC timing, merged with the capacity timing; a project opens its `dcwork:` card.)

Draft plan, October 2026. Nothing built yet.

> **Status (October 22, 2026): ready to build.** The DC mapping update merged to main as #322, and the prototype was rerun on main: the allocation is unchanged from the check on the branch. Main's new timing curves do change the timing gaps (see ALLOCATION.md, step 4).

## The ask

In the Capital tab, list the DC projects. Click one and see which developments it could affect.
For sanitary works that means the developments **upstream** of the project: the ones whose flow
passes through it, or that need it in order to connect.

## What we have today

Most of the pieces exist. They are spread across the app and nothing shows them as a list.

| Piece | Where | What it does today |
|---|---|---|
| DC program: 227 wastewater lines and 188 water lines (173 project numbers), 35 facilities with 77 scheduled items | `data/dc-infra.json`, `js/dc-infra.js` | Drawn on the map; tapping a line opens `showDcLine` |
| Panel for a tapped DC main ("What it relieves" and "Developments relying on it") | `js/masterplan.js` `showDcLine` / `dcNeedsSection` | Lists developments only where the main relieves a **flagged** pipe constraint (hidden while `PIPE_RESULTS` is off), or where a greenfield site connects to it within 1 km |
| Sewer network: 14,056 pipes of 300 mm+, each with a `next` (downstream) pointer | `data/sewers.json` | `showPipeLoads(i)` already walks each development's pipe downstream to find the ones that drain through pipe *i* |
| Development → the pipe it joins | `js/sewer-cap.js` `sewerGrowth().devPipe` | |
| Existing pipe → the DC main that runs along it (replacement, upsizing or twin) | `js/masterplan.js` `pipeReliefOf(i)` | Internal, not exported |
| Greenfield route along the planned DC mains to the existing sewer | `js/sewer-trace.js` `dcSewerPath(p)` (exported) | Returns the DC lines it uses (`lines`) |
| Greenfield sites that connect to a given main | `js/masterplan.js` `dcConnectors(ln)` | Internal |
| Catchments upstream of a catchment | `js/svc-tab.js` `upstreamOf` | Used by "Show upstream" on Servicing › Network |
| The other direction: development → works it relies on | `js/dc-infra.js` `devWorks` | Shown on the development brief |
| Capital tab: DC timing · Projects · EAs · Funding (Labs) | `js/dca-tab.js`, `js/capital-ea.js` | DC timing lists only projects with a constraint or connectors (`dcAnalysis().list`), so most sanitary mains are missing while pipe results are hidden |

What's missing is the project-first view: every DC project in a list, and an upstream set worked
out for each project instead of only for a flagged constraint.

## Where it goes

Add a **DC projects** sub-view to the Capital tab (built in the third PR):

`DC timing · DC projects · Projects · EAs`

A tab shows at most four sub-views, so the Funding lab no longer has a chip of its own. With the
lab on, its funding screen (the budget, the projects within or outside it, and the funding levels)
sits in DC projects: as a fold in the list panel, and as the screening results and funding levels
in its full table. Old links to Capital › Funding open DC projects. In the Capital workspace, DC
projects is a section after DC timing, and a project opens in place on the page.

- **DC timing** keeps answering "what must be built first?"
- **DC projects** (new) answers "what does this project affect?"
- **Projects** is the Region's live capital contracts (`capital.json`). Two sub-views both called
  "projects" will confuse people, so I'd rename this one **Contracts** (see open questions).

## What to show

### 1. The list (DC projects, nothing selected)

Use the standard panel (`PeelPanel` spec), with the full table behind "Open full table".

- **Head:** "Capital › DC projects · What does each project affect?" · Peel or the scoped
  municipality · 2026 DC capital maps (draft, as of …)
- **Answer:** "**N** DC projects; **M** have developments upstream or connecting. The most
  affected is the **{project}** (≈X units)."
- **Figures:** projects · wastewater / water · with developments relying on them · built after
  the first relying development is expected (timing gap)
- **Filters:** system (wastewater / water / both) · municipality (follows scope) · construction
  year · status (approved 2026 / proposed / paused)
- **Sort:** most developments affected (default) · soonest construction · project number
- **Row:** `🟤 600 mm primary main · 22-2255` / `construction 2026–2027 · 3.4 km · approved` /
  right side `41 devs · ≈6,200 units` / a red "gap" chip when developments arrive before it is built
- Facilities (stations, plants) are listed as their own rows, one per facility, with their items
  folded inside

### 2. A selected project

Clicking a row (or a DC main on the map) opens the project.

**Panel**
- **Head:** kind, diameter, project / component numbers, length, construction years,
  approved / proposed, capital status (paused, in budget), and a link to its EA where
  `easForDcHTML` finds one
- **Answer:** "**41 developments** (≈6,200 units, ≈14,800 people + jobs, ≈95 L/s peak wet)
  drain through or connect to this main. **12** are committed. **5** expect occupancy before
  2027, when construction is scheduled to finish."
- **Figures:** developments · units · people + jobs · added peak wet flow (L/s) · existing
  population upstream (2021, from `censusPopUp`) for scale · timing-gap count
- **Developments, in three groups** (each row: name, municipality, phase colour, units, peak
  flow, how it is linked, and a timing chip):
  1. **Needs it to connect.** Outside the existing network; its route to an existing sewer
     uses this main (`dcSewerPath(p).lines` includes it, or `dcConnectors`). Strongest link: no
     project, no servicing.
  2. **Drains through it.** On the existing network, upstream of the existing pipes this main
     replaces or twins (`pipeReliefOf`). Its flow passes through the project. It loses
     capacity relief if the project slips.
  3. **Same sewershed, upstream (broader).** In the catchment the main serves (`dcTarget`) or
     any catchment upstream of it. Folded by default and labelled lower confidence.
- **Timing chip** per development: "needed by 2026, built 2027". Compares the development's
  expected completion from the Growth forecast's per-development schedule
  (`js/timing.js` `stageSchedules` / `projectSchedule`, median band) with the project's last
  construction year. Developments already under construction or built count as "needed now".
- **Actions:** open a development (the existing `data-dev` rows, with Back to the project) ·
  CSV of the affected developments · "Show on map" · jump to its DC timing row (people held back
  if cancelled, where the project is in `dcAnalysis`)

**Map**
- The project's lines, glowing (`traceGlow`), zoomed to fit
- Upstream existing pipes in a light tint; for group 3, upstream catchments shaded the way
  "Show upstream" does it (`svc-focus-up`)
- Affected developments stay at full strength and the rest fade (the `devKeys` mechanism
  `showPipeLoads` already uses), coloured by group
- Flow arrows toward the project's outlet

### 3. Water and facilities

Water has no "upstream," so for water use the area the project serves:
- **Water main:** developments that connect to it (`dcConnectors`) plus developments in the
  pressure zone it serves (`dcTarget`). The current `dcNeedsSection` already does this.
- **Reservoir / tank / water station:** developments in its pressure zone.
- **Wastewater pumping station:** developments upstream of the pipe arriving at the station
  (`MA().stationPipe` → the same pipe walk).
- **Treatment plant:** every development in the plant's sewershed (what
  `showLoads(null, plant)` already lists). Plant rows can say "all of the {plant} sewershed"
  and link there rather than list thousands.

### 4. Funding (with the Funding lab on)

The Funding lab (Capital › Funding) already has the money side:

| What | Where |
|---|---|
| Each project's DC-recoverable cost in 2026$, and how much of it is estimated | `js/dc-cost.js` `costEstimate(r)` |
| Water and wastewater DCs per unit by unit type, and a range when the unit mix isn't stated | `dcRevenue(e)`, `dcRange(e)`, `data/dc-costs.json` `rates` |
| The budget screen: committed projects first, then growth let through per dollar; each project falls within or outside the screen | `dcaBudget(budget, years)`, `DCB` |
| People held back if a project is cancelled, and DC revenue at risk (`revRisk`) | `dcAnalysis()` |

What's missing is the link to the developments each project affects. DC projects joins the two.
Everything below appears only while the Funding lab is on, and never in the public view. This is
the same rule that gates the Funding sub-view (`hiddenAt` in `js/analysis-tabs.js`).

**On the list**
- New columns: **DC cost** (2026$, "estimated" when more than half of it is estimated) and
  **$ per affected unit** (DC cost ÷ units in groups 1 and 2)
- A **funding-screen chip** on each row: Within / Outside / Committed / After the window, read
  from `dcaBudget(DCB.budget, DCB.years)`
- A new sort, **cost per affected unit**, and a filter, **outside the funding screen**
- Head figure: "N projects outside the screen affect **M** developments (≈X units)"

**On a selected project**
- A **Funding** block under the figures:
  - **DC cost:** "$48.2 M DC-recoverable (2026$), 30% estimated"
  - **Funding screen:** within / outside at the current budget, and why (the `dcbCells`
    wording), with a link to its row on Capital › Funding
  - **DCs from the developments relying on it:** the sum of `dcRevenue` (or the `dcRange`
    low–high when unit types aren't stated) for groups 1 and 2. A wastewater project counts only
    the wastewater share of the rate (`rates.single.wastewater` ÷ the water + wastewater
    total); a water project counts the water share. Shown next to the cost as "covers ≈Y%".
  - **Revenue at risk if it slips:** the DCs from affected developments with a timing gap. If
    the project is outside the screen, use every affected development, since they wait on it.
- Each development row gets its DC amount (or range), so the list can be sorted by revenue
- **Wording:** DCs go into Region-wide reserves, not to one project. So the panel says "DCs
  from the developments that rely on it," never "paid for by." Coverage is a way to compare
  projects, not a funding source.

**On Capital › Funding**
- The rows in Screening results and Funding levels get `data-dc-proj`, so clicking one opens
  the same project view. Back returns to Funding.
- **"Affects" column:** developments and units that rely on each project (groups 1 and 2),
  next to the existing "growth by {year}". This explains the "No growth relies on it in this
  screen" rows, which are mostly sanitary mains whose pipe constraints are hidden while
  `PIPE_RESULTS` is off.
- **Optional ranking switch (Labs):** rank by *held back* (today's measure, capacity-based) or by
  *relying on it* (the upstream and connecting units from this plan, phased to the window's end
  year with `MA().hzFrac`). Default stays *held back*. "Relying on it" overstates need where the
  existing pipe still has room, so it is offered as a lens, not a replacement.

**In the model** (`js/dc-impact.js`)
- `impactOf(key).funding = { cost, est, screen: 'keep' | 'defer' | 'committed' | 'later', revenue: { lo, hi }, revAtRisk, perUnit }`.
  This is only built when `App().state.dcCosts` is loaded.
- The screen result needs a key that matches across both models. `dcAnalysis` keys lines as
  `ln:{sys}:{p||c}` (connectors) or `MP().reliefKey(r)` (constraints). `projects()` should store
  both keys so it can look up its `dcaBudget` row. Projects that aren't in `dcAnalysis` are
  "not screened," because no constraint or connector puts them in the funding screen. The
  ranking switch above is what brings them in.
- Cache on `MP().scenarioKey()` + `DCB.budget` + `DCB.years`, so moving the budget updates the
  chips.

> **Allocation method:** how a development is allocated to DC projects (tiers, the relief-match fix, gate year, cost apportioning) is in [ALLOCATION.md](ALLOCATION.md). The groups above map to its tiers: "needs it to connect" = A, "drains through it" = B1 + B2, "same sewershed" = C.

## How to build it

### Step 1: an impact model (new `js/dc-impact.js`, `PeelDcImpact`)

**Built in the second PR.** `model()` gives, per project:
- the developments in tiers A, B1 and B2 (B1/B2 as the DC main panel rates the sewer it relieves);
- the built developments and the same-sewershed count, kept apart as context;
- its DC cost and each development's flow share of it.

Per development it gives the links, the gate year, the first-homes year and the timing gap.
`impactOf(key)` and `devImpact(p)` read it. It takes 0.7 s and is cached per scenario. There is
no UI yet.

Pure where possible, so it can be tested in Node like `js/upstream.js`.

```js
projects()          // dcInfra lines grouped by project number (p || c), plus facilities:
                    // { key, sys, kind, d, y0, y1, lenM, status, lines[], fac? }
impactOf(key)       // { connect: rows[], drain: rows[], shed: rows[], pipes:Set, areas:Set, totals }
pipesUpstream(memberPipes, pipes)   // pure: Uint8Array marking every pipe whose `next` chain
                                    // reaches a member pipe (memoised, one pass, O(pipes))
```

- **Drains through it:** members = pipes where `pipeReliefOf(i)` belongs to the project. Run
  `pipesUpstream` once per project, then for each `[dev, k]` in `sewerGrowth().devPipe`, the
  development is upstream when `mark[k]` is set. This replaces `showPipeLoads`'s per-development
  walk of up to 2,000 hops, which is too slow to run across 173 projects.
- **Needs it to connect:** for developments outside the traced catchments, run `dcSewerPath(p)`
  once per development, cache it, and index `lines → devs`. Add `dcConnectors` rows that have no
  path.
- **Same sewershed:** `{dcTarget(ln)} ∪ upstreamOf(...)` catchments → `SD().svcIds(p, 'dr')`.
  Exclude developments already counted in groups 1 and 2.
- **Which developments count:** `svcLayerOf(p)` approved or proposed, with a non-zero
  estimate. Built since 2021 is shown as a context line (see Prototype findings). Use
  `D.estimate` for units, people and peak wet.
- **Cache** on `MP().scenarioKey()` like `dcAnalysis`, so a scenario change recomputes.
- **List counts** for every project at once: build the per-project marks lazily, then cache. If
  computing all 95 wastewater projects up front is too slow on a phone, compute the list counts
  in an idle callback and show "counting…" until they're ready.

Exports needed: `dcConnectors` from `js/masterplan.js` (add it to its `api`). `pipeReliefOf` is
exported, with the corrected relief rule (`js/dc-relief.js`), in the first PR.

### Step 2: the sub-view

- `index.html`: add `<button data-dcasub="dcproj">DC projects</button>` and
  `<section id="pane-dca-dcproj" data-sub="dcproj"><div id="dca-dcproj-body">`
- `js/analysis-tabs.js`: add `'dcproj'` to `dca.valid`
- `js/dca-tab.js` `renderDca()`: `PN.set('dca:dcproj', DCI().listSpec())`, with the full table
  in `#dca-dcproj-body`
- `js/usage.js`: nothing needed (`dcasub` is already mapped)

### Step 3: selecting a project

- Rows carry `data-dc-proj="{key}"`. One click handler (in `dc-impact.js`) sets the selection,
  sets `PN.set('dca:dcproj', DCI().projectSpec(key))`, draws the map layer and stores
  `TS().loadsOf = { dc: { proj: key } }` so opening a development offers Back.
- **One panel for both entry points:** `showDcLine(ln)` and `showFacility(fc)` render the same
  impact section, so the map tap and the list click never disagree. Replace the "Developments
  relying on it" part of `dcNeedsSection` with `DCI().impactHTML(key)`, and keep "What it
  relieves" as it is.
- **DC timing rows:** add `data-dc-proj` so a timing row opens the same project.
- **URL/state:** remember the selected project (`store`, like `dcaPnlSort`) so a reload keeps it.

### Step 4: tests

- `tests/dc-impact.test.js`, unit tests on `pipesUpstream`:
  - a Y network
  - a cycle (guard with `seen`, as in `upstreamIdsOf`)
  - a pipe with `next = -1`
  - a member pipe in the middle of a run
- Grouping: a development counted in group 1 is not repeated in groups 2 or 3.
- An e2e or browser check: open Capital › DC projects, click the first wastewater project, and
  check that the map has a highlighted line and the panel has at least one group.
- Run `npm test` and `npm run lint`.

### Step 5: wording and caveats

- Every screen carries `SCREEN_NOTE`: a screen for where to look, not the Region's hydraulic
  model. The DC maps are a draft, not approved by Council.
- `data-info="dc-impact"` method text: how each group is found and why group 3 is lower
  confidence.
- Add a changelog entry (`data/changelog.json`).

## Prototype findings (October 2026 data)

I ran a throwaway version of the model in the app against the October 19 data, with all 173
projects. These numbers are behind the mock-up.

- **Speed:** about 2 s for every project in one pass. That includes matching each pipe to its
  DC main, routing the 818 off-network sites along the DC mains, and walking upstream. The list
  counts can be computed when the sub-view opens.
- **Built developments:** count only approved and proposed developments. Built-since-2021
  developments swamp the counts. For example, 6,653 built developments drain through
  **26-2242**, against 1,035 that are approved or proposed. Show built as a context line, not in
  the groups.
- **Coverage:** 62 of the 173 projects have pipeline developments relying on them. 34 of those
  have developments expected before the project is finished. These figures use the corrected
  relief matching from ALLOCATION.md step 3; before the fix they were 71 and 38.
- **Funding screen:** only 26 projects are in it today. 36 projects with developments relying on
  them are not, and they carry 1,720 unique developments (≈146,000 units). That is the gap the
  "Affects" column and the ranking lens are meant to show.
- **Totals across projects:** a development upstream of a trunk is also upstream of the trunks
  below it. Totals across several projects must count unique developments, never sum the
  per-project counts.
- **DC coverage:** wastewater DCs from the developments relying on a project are often several
  times its DC cost. **28-2139**, for example, is $14 M against ≈$118 M, or 8.6×. Show coverage
  as "×" and keep the "Region-wide reserves" wording so no one reads it as a funding source.

## Suggested order (small PRs)

1. `dc-impact.js` model, exports and unit tests (no UI)
2. DC projects list sub-view (list, filters, sort)
3. Selection: panel, map highlight, Back from a development
4. Unify `showDcLine` / `showFacility` / DC timing rows onto it
5. Water and facility rules, CSV, changelog
6. Funding (Labs): cost, screen chip, DCs from the affected developments, revenue at risk;
   click-through and the "Affects" column on Capital › Funding
7. Optional: the "relying on it" ranking switch in the funding screen

## Open questions

1. **Rename the existing "Projects" sub-view to "Contracts"?** That avoids two "projects" chips.
   My recommendation: yes.
2. **Which developments count?** After the prototype, I recommend approved + proposed in the
   groups, with built since 2021 as a context line. Should pre-application be included too?
3. **Group 3 (same sewershed):** show it folded, or leave it out at first? It is broad and can
   be large near the trunks.
4. **Labs first?** Ship behind a Labs switch like Funding until the counts have been checked
   against the Region's own understanding of a couple of projects (e.g. 22-2255).
5. **Timing gap:** decided October 22, 2026: need is measured at a development's first homes
   (1,041 developments on main), with the app's `scheduleFor` year shown beside it. Still open:
   should it be compared with the project's last construction year or its first? See
   ALLOCATION.md, step 4.
6. **DCs per development:** use the residential rate only (as `dcRevenueHTML` does today), or
   add non-residential once `rates.nonResidential` is in `data/dc-costs.json`?
7. **Ranking switch:** should "relying on it" ever become the default for the funding screen, or
   stay a lens? My recommendation: keep it a lens until the pipe results are back on.
