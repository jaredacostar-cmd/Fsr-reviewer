# Allocating development applications to DC projects

Draft, October 2026. Companion to [PLAN.md](PLAN.md). The numbers here come from a prototype run
of the app's own model on the October 19, 2026 data: wastewater, the 1,724 approved or proposed
developments that link to at least one DC wastewater project.

> **Status (October 22, 2026): ready to build.** The DC mapping update merged to main as #322, and the prototype was rerun on main: the allocation is unchanged from the check on the branch. Main's new timing curves do change the timing gaps (see ALLOCATION.md, step 4).

## What the allocation has to answer

One rule should serve three uses. Each use needs something different from it.

| Use | Question | What it needs |
|---|---|---|
| **Linkage** (DC projects view, development brief) | Which DC projects does this development rely on? | A set of projects per development, with a reason |
| **Timing** | When can it be serviced? | One gating year per development |
| **Money** (Funding lab) | How much of a project's cost is attributable to it? | A share that adds back up to the project's cost, with no double counting |

Peel's water and wastewater DCs are Region-wide uniform rates, so the DC study never ties a
development to a project. This allocation is ours, for screening. It is not how charges are set.

## Options considered

| Method | How | Verdict |
|---|---|---|
| **Proximity** (today's `devWorks` "nearby") | The nearest DC main within 400 m or 1 km | **Reject for linkage.** The nearest DC main is on the development's actual flow path only **58%** of the time within 400 m, and **43%** within 1 km. Gravity sewers flow one way, so the main next door is often on another branch. |
| **Catchment** | Every DC project in the sewershed the development drains to | **Context only.** Far too broad: 28-2139 has 25 linked developments and 56 more in its catchment, and 22-2255 has 958 more. |
| **Network path** | Follow the development's sewer downstream to the plant. Every DC work on that path, plus any planned main it must use to connect, is allocated. | **Recommended** as the base, with the fixes and tiers below. |
| **Capacity need** | Only projects without which the path is over capacity (`dcAnalysis` "held back") | **Best evidence where it exists.** It depends on pipe results, which are hidden while `PIPE_RESULTS` is off. Use it as a tier, not the whole rule. |
| **Region-wide share** (DC-study style) | Cost spread by population or units | Fine for setting rates. It tells us nothing about which project serves whom. |

## Recommended method: network path, in tiers, then apportioned

### 1. Find the connection point
- **On the network:** the development's pipe (`sewerGrowth().devPipe`, the nearest sewer of
  300 mm or more).
- **Off the network** (no traced catchment, or no 300 mm+ sewer within 400 m): route along the
  planned DC mains to an existing sewer (`dcSewerPath`). The DC mains on that route are
  **tier A**.

### 2. Walk downstream, and allocate the DC works on the path
Follow `next` from the connection pipe to the plant. Each DC work on that path is allocated with
a tier:

| Tier | What | Counts for |
|---|---|---|
| **A: needs it to connect** | Planned mains on its route to the existing network | Linkage, timing, money |
| **B1: needs it for capacity** | A DC work relieving a pipe, station or plant on its path that is at or over capacity without the project in the scenario year (stations, plants and master plan trunks today; pipes once their results are back) | Linkage, timing, money |
| **B2: on its path** | A DC work on its path with no capacity evidence either way | Linkage only (shown, not counted in timing or money) |
| **C: same sewershed** | In the catchment or upstream catchments, not on the path | Context, folded |

Facilities are allocated the same way. A pumping station is on the path when the path passes
through the station's pipe (`MA().stationPipe`). The receiving plant's expansion steps are B1
when the plant's trigger is reached before build-out, otherwise B2.

### 3. Tighten "this DC main relieves that pipe" (it is wrong today)
`pipeReliefOf` matches a DC main to an existing pipe when the main lies within 150 m along at
least half of the pipe. In the prototype, 48 projects matched existing pipes, but:
- **14** DC mains are *smaller* than the pipe they supposedly relieve, carrying 3,634
  development links;
- **11** have no diameter on the map, carrying 1,313 development links;
- 34 have a median offset over 40 m: they run beside the pipe, not on it.

Example: **26-2117** (a local main, no diameter) and **26-2128** (a 450 mm local) both matched a
1,950–2,100 mm trunk 120–140 m away. Each picked up 663 developments as "drains through it",
and 26-2117 alone made 2034 the gating year for 600 developments. These are local sewers near
the trunk, not relief for it.

**Rule (tested, version 2).** A DC main relieves an existing pipe only when, in addition to
today's test (within 150 m along at least half the pipe):
- **Size:** the DC main is at least **half the pipe's diameter**. With no diameter on the map,
  it must be a primary or force main, or the pipe must be 600 mm or smaller. A description
  saying twin, relief, replacement, upsizing or parallel (`ln.n` / `ln.t`) always passes.
- **Offset:** a **local** main must be on the same street, with a median offset of **30 m** or
  less along the pipe. A trunk or force main may be up to **150 m** away, since twins run in a
  parallel corridor.

I dropped the same-flow-direction check I first proposed. The DC lines are traced from PDFs
and have no flow direction, so the check would need direction inferred from where each main
meets the network. That's a later refinement.

**Results** (wastewater, 1,724 linked developments):

| | Before | Size only (v1) | Size + offset (v2, adopted) |
|---|---|---|---|
| Development–project links | 6,670 | 4,992 | **4,849** |
| DC projects matched to existing pipes | 47 | 38 | 40 |
| Projects with developments relying on them | 71 | 63 | **62** |
| Projects with a timing gap | 38 | 35 | 34 |
| Developments expected before their gate year | 840 | 530 | **530** |
| Gate year 2034 (the 26-2117 artifact) | 600 developments | 0 | **0** |
| Developments gated in 2028 | 997 | 1,458 | 1,464 |
| Not in the funding screen, with developments relying on them | 45 projects | 37 | **36** |

What changed:
- **Removed (wrong):**
  - 26-2117 (663 developments → 0) and 26-2128 (663 → 0), small local mains beside a 2 m trunk;
  - 24-2104, 26-2179 and 26-2221, each down to 0;
  - 25-2158, a 750 mm local on a parallel street (242 → 15).
- **Kept or restored (right):**
  - 15-2153, a local main with no diameter on 300–675 mm pipes (back with 125 developments);
  - 28-2137, which sits 3 m from its pipe;
  - every trunk twin. For example, 25-2219, the Lower West Sanitary Trunk Sewer Twinning,
    keeps its 653 developments.
- **Gating projects now:**
  - 22-2255: 709 developments, 2028;
  - 25-2219: 630, 2028;
  - 26-2242: 125, 2028;
  - 25-2266: 70, 2029;
  - 29-2271: 66, 2031.
- **Unchanged:** the 1,720 developments relying on unscreened projects. Those come from the
  big trunks, which the rule keeps.

Still to check: 22-2255 now gates the most developments, and its matched pipes run a median
114 m from the trunk. That's plausible for a twin corridor, but it's the first case to confirm
with the Region and the FSRs (below).

The 2020 study's text can't do this alone: 64 of the 96 wastewater projects have no 2020
description.

### Rerun on the DC mapping update (October 22, 2026)

The update on branch `claude/ecstatic-ride-s5n337` (`c78c797`, merged to main as #322; the DC data and routing on main are identical to that commit):
- recovers mains the build had dropped at the inset boxes: 227 → 234 wastewater lines and
  188 → 197 water lines, with 5 new projects;
- adds hand-reviewed **DC joins** (`data/dc-joins.json`): where each planned main meets the
  network, which `dcSewerPath` now follows.

The prototype, with the version 2 rule, against the version 2 run on the old mapping:

| | Old mapping | Updated mapping |
|---|---|---|
| DC projects | 173 | 178 |
| Development–project links (wastewater) | 4,849 | 4,777 |
| Developments that need a DC main to connect | 32 | 33 |
| DC projects matched to existing pipes | 40 | 41 |
| Projects with developments relying on them | 62 | 64 |
| Projects with a timing gap | 34 | 33 |
| Developments expected before their gate year | 530 | 530 |
| In the funding screen / not in it but relied on | 26 / 36 | 27 / 37 |
| Unique developments relying on unscreened projects | 1,720 | 1,715 |

- **The relief rule holds on the new lines.** The only new match is 25-2146, a 600 mm local
  main on 3 pipes with no developments. Nothing wrong slips through.
- **The gating projects are unchanged:** 22-2255 (709), 25-2219 (630) and 26-2242 (125). One
  development, 14044 McLaughlin Road, now gates in 2034 via 31-2199 (a 750 mm main, 2034).
  That's a real case.
- **Mayfield West (Caledon) is rerouted by the joins:**
  - the greenfield sites that went through 28-2139 and the 27-2147 / 25-2224 / 25-2225 chain now
    run through **27-2189** (375 mm, 2027) and the **25-2267** trunk (1,500 mm, 2030);
  - 28-2139 falls from 25 developments to 6, 25-2267 rises from 5 to 25, and 27-2189 from 0 to 19;
  - the 825-unit site at 0 Chinguacousy Road now gates in 2030 instead of 2028.

  This is the joins doing their job. It's also the area to check first against the FSRs.

### 4. Gate year, for timing
**Gate year = the latest construction year among the development's tier A and B1 projects.**
Its timing gap is its forecast occupancy year (`PeelTiming` schedules) falling before the gate
year. B2 never gates.

Before the step 3 fix, most gates were 2028 (997 developments) or 2034 (600). The 2034 group
was the 26-2117 artifact. With the fix, 1,464 developments are gated in 2028, and 530 are
expected before their gate year.

**Which year counts as "needed"? (decide before building).** Main now times developments with
faster curves: Mississauga's dated completions, since Brampton and Caledon publish none. It also
gives each development an official expected year, `PeelTiming.scheduleFor`, which is the year
half its homes are done. On main, with the allocation unchanged:

| A development is "needed" by | Developments expected before their gate year | Projects with a gap |
|---|---|---|
| Its first homes (the prototype's test) | **1,041** (530 on the old curves) | 39 |
| Half its homes done (`scheduleFor`, the app's expected year) | **567** | 33 |

The two years are a median of 1 year apart. My recommendation: flag the gap at the **first
homes**, because servicing has to be in place before anyone moves in. Show the app's expected
year beside it, so the row agrees with Growth › Ledger. The prototype now records both
(`need` / `needHalf`).

### 5. Apportion money, without double counting
A development can sit on up to 9 DC projects in series (prototype: 359 on one project, 468 on
two, and 162–198 each on five to seven). Summing "affected" across projects counts the same
development many times. So for money:
- **Share of a project's cost = the development's peak wet flow ÷ the growth flow allocated to
  the project** (tiers A and B1). For a plant step, use average dry weather flow, which is what
  sizes plants. The shares add back up to the project's DC cost.
- **Attributable cost of a development = the sum of its shares.** That can then be compared once
  with its own DCs (`dcRevenue`, the wastewater share), never summed per project.
- Region-wide totals count **unique** developments.

## How we'll know it's right

1. **Rerun after the step 3 fix.** Done (see step 3): 26-2117 and 26-2128 dropped out and the
   2034 gate went.
2. **FSRs as ground truth.** `data/fsr.json` links 66 functional servicing reports. Read a sample
   of about 30 for the stated sanitary outlet (for example, "connect to the existing 525 mm on
   Creditview Road" or "to the future Mayfield West trunk"). Compare it with the model's
   connection pipe and tier A project. Target: at least 80% agreement on the receiving
   sewer, and every disagreement explained.
3. **Site servicing permits** (`data/servicing-permits.json`, 2,468 permits with location, date
   and a description such as "Regional connection at street"):
   - the permit location checks the connection point;
   - the issued date checks timing: a permit issued before a tier A project's construction year
     means the allocation or the year is wrong.
4. **The Region's own words.** Where the 2026 DC background study or a master plan names the
   area a project serves (such as "Mayfield West Phase 2"), check that the allocated
   developments fall inside it.
5. **Ask Peel W&WW Infrastructure Planning to confirm 3 to 5 projects.** Suggested:
   - 28-2139, a greenfield connector;
   - 25-2219, the Lower West trunk twinning;
   - 22-2255, a large trunk;
   - 25-2120, a local relief.

## Decisions needed

1. **Is the tier model right?** A + B1 count everywhere, B2 is shown but not counted for timing
   or money, and C is context. My recommendation: yes.
2. **Apportionment basis for money:** peak wet flow (recommended), units, or an equal share per
   development?
3. **Water:** pressure zones flow upward through pumping. Allocate a development to the
   connection main (A), plus the stations, feedermains and storage serving its zone *and the
   zones it is pumped through* (B1/B2). Do we take that on now, or keep water at "zone served"
   for the first release?
