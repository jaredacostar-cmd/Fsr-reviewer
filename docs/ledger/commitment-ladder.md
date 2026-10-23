# The commitment ladder

**Settled Oct 23, 2026.** One ordered set of stages, one name each, used on every screen. A figure
says which rung it counts through instead of reusing the word "committed" for two rules.

Code: `js/layers.js` (`LADDER`, `rungsOf`, `ladderTotals`, `throughText`).

## The rungs

| # | Rung | A development's units sit here when… |
|---|---|---|
| 0 | Pre-application | pre-consultation, block or precinct plan: no formal file yet |
| 1 | In review | zoning, official plan, draft plan or site plan in review |
| 2 | Zoning approved | zoning approved (or under appeal), no draft or site plan approval yet |
| 3 | Plan approved | draft or site plan approved (MECP D-5-1), no site servicing or building permit yet. *Registered* is a marker here, not a rung |
| 4 | Servicing permit | a water or wastewater site servicing permit filed or issued: it lifts the whole development |
| 5 | Building permit | a building permit filed or issued (one rung for both): it lifts the units it covers |
| 6 | Under construction | a building permit, and its permits' history says it is being built (confidence tier A) |

Then **Built since 2021** (completed since census day) and **On the system** (in the 2021 Census).

Each unit left to build sits on the **highest rung it has reached**. A site servicing permit lifts
the whole development; a building permit only the units it covers (`js/demand.js`
`committedPeelUnits`); the rest stay on the development's planning rung. A servicing permit issued
3 or more years ago with no building permit since (possibly lapsed, `js/ledger.js` `lapseOf`)
lifts nothing.

A permit can come before the plan approval: those units are on rungs 4 to 6 without having passed
rung 3 (`permitAhead`). On the Oct 2026 data that is 3,854 units, mostly 7 in-review
developments with a site servicing permit.

## Which line each screen counts through

| Line | Rungs | Used by |
|---|---|---|
| **Committed** (the Peel rule, the default) | Servicing permit and up (4 to 6) | Explore › Growth in an area, What's coming (Growth › Ledger), the Overview, the briefing, and the committed horizon of every capacity check except the treatment plants: pumping stations, sewers, water pumping into each zone, supply into a zone, trunk mains |
| **Past plan approval** (MECP D-5-1) | Plan approved, whatever the permits | The treatment plants only: wastewater plants (flow and BOD loading), South Peel water treatment, the Caledon well systems, and their uncommitted reserve |

The capacity bars name the rule per facility (`js/layer-bar.js` `commitSegs`): the committed segment
is "Past plan approval (MECP D-5-1)" at a plant and "Committed (site servicing or building permit)"
elsewhere, where the rest of build-out is "Not committed yet". `js/map-analysis.js`
`committedLoad(l, rule)` and `ruleOf(kind)` are the one place that says which facilities keep D-5-1.
Build-out is the same under both rules.

## On the map and in the filters

- **Counts as** (Find › Counts as) has a chip per rung, plus Built since 2021 and On the system;
  each development sits on the rung holding most of its units left to build (`rungKeyOf`; one with
  no units stated takes the rung of its stage and permits). Share links carry the rung keys (`ly=`).
- **Colour sites by › Counted as** colours each development by that rung, with the rungs in the legend.
- **Stage** (the process view, one row per planning phase) uses the same names: Pre-application,
  In review, Plan approved, Building permit, Under construction, Built.

## How the figures reconcile (Oct 2026 data, every development)

| | Units |
|---|---|
| Committed (rungs 4 to 6) = the ledger's committed | 17,143 |
| Plan approved, not committed (rung 3) = the ledger's approved | 30,526 |
| Past plan approval (MECP D-5-1) | 43,815 |
| = committed + plan approved − permitted ahead of approval (3,854) | |

`tests/ladder.test.js` checks these on the real data.

## Still on MECP D-5-1 (named as such)

- The Scenario's counting basis "approved only" (`js/demand.js` `unitsFor(p, 'committed')`) and
  the growth layers it feeds (the census view, a drawn area's growth, the servicing tables' "+ Approved"
  columns): these are growth layers, not a committed line, and keep their D-5-1 meaning.
- The 2020 Master Plan comparison table (Water › Facilities), whose "+ Approved" column sits beside the
  plan's own forecasts.
