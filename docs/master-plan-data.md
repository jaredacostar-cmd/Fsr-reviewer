# Master Plan water data (2020, Volume 3)

`data/master-plan-water.json` holds the water tables from the Region of Peel 2020 Water and Wastewater
Master Plan, Volume 3. Every number has a source page. `tests/master-plan-water.test.js` checks the
transcription against the plan's own totals.

Label anything built on it **"2020 Master Plan basis"**. Peel started a Master Plan update in 2025.

## What's in it

| Key | What | Source |
|---|---|---|
| `trunks` | 20 trunk mains (WT1–WT7, CT1–CT7, ET3A, ET4, ET5Y, ECT5, BT6): forecast demand, theoretical and actual capacity for 2021–2041, the plan's ok / not ok flag, and each main's diameter, year in service and C-factor | pp.19–24, 134–136 |
| `intakes` | Lorne Park and A.P. Kennedy intakes | pp.134–135 |
| `systemDemand` | Max day demand by service area (W, C, E, Bolton, York), 2019–2041 | Table 8, p.34 |
| `subzones2041` | 2041 population, employment, MDD and PHD for each sub-zone (1W, 1C … 7E, 6B) | Schematic, p.130 |
| `pumpingStations` | Installed, firm and actual firm capacity for every lake-based water pump | Tables 4–6, pp.26–28 |
| `treatmentPlants` | A.P. Kennedy and Lorne Park capacity vs demand | Table 9, p.35 |
| `designCriteria` | ADD, MDF, PHF used in the plan | p.130 notes |

## Key facts

- The lake-based system has **three trunk systems**: West (Lorne Park), Central (A.P. Kennedy) and East (fed
  from Central through the Beckett Sproule transfer). Zones 1–3 have W and C parts; zones 4–7 have W, C and E.
- The plan gives **demand by sub-zone but no sub-zone boundary map**.
- West and Central/East are **interconnected**, so a per-system shortfall is a flag, not a hard limit.
- The plan's own flags: Mayfield West (CT7) is short of capacity from 2026 to 2041; West Caledon (WT7)
  in 2026; CT4 and CT6 in 2021 until their 2022 mains came in.
- Table 6 prints the Beckett Sproule transfer's actual firm capacity as 2,750 ML/d against 408 installed.
  It's flagged in the data. Don't use it without checking.

## Wiring it in (for Claude Code)

1. **Replace the supply check.** `supplyCons()` in `js/masterplan.js` sums every large main that crosses a
   zone line at 1.5 m/s (`data/water-supply.json`). That counts distribution mains and some mains more
   than once, so it reads far too high (about 2,700 ML/d into zone 5 vs 230 + 89 + 106 in the plan).
   Build one constraint per trunk from `trunks[].actualMLd`, with the year steps already in the data.
2. **Split zones into W / C / E.** Tag each part of a pressure zone polygon by the nearest trunk facility
   that serves that zone (reservoir or pumping station named in `pumpingStations`). Label the result
   "estimated from facility locations". Check the population of each piece against `subzones2041`.
3. **Known-answer tests.** For each sub-zone, compare the app's 2041 MDD to `subzones2041.mddMLd`.
   Report the gap on screen rather than hiding it.
4. **Relief dates.** Use `mains[].inService` as the relief year for the capacity runway view.
5. Keep the South Peel plant check pooled, but show the Table 9 split by plant beside it.

---

# Master Plan wastewater data (2020, Volume 4)

`data/master-plan-wastewater.json`, checked by `tests/master-plan-wastewater.test.js`. Sewage pumping
stations from Vol 4 Table 6 were already in `data/peel-reports.json` (`masterPlan.sps`), so they aren't repeated.

| Key | What | Source |
|---|---|---|
| `designCriteria` | Plant and collection flow rates, Harmon limits, I&I, BOD loading, design storms and upgrade triggers | Tables 1–4, pp.7–15 |
| `trunks` | 34 trunk sewers in the West, East and McVean systems, with diameter ranges | Table 5, s.3.1.2, pp.18–30 |
| `flowForecast` | Average daily flow by trunk system plus York and Toronto, 2019–2041 | Table 7, p.38 |
| `plantHydraulic` | G.E. Booth and Clarkson rated capacity vs flow | Table 8, p.39 |
| `plantLoading` | BOD capacity vs loading, with the process that governs | Table 9, p.41 |
| `plannedUpgrades` | East-to-West Diversion trunk and plant expansions, with year and cost | s.5, Table 13 |
| `interRegional` | Where flow crosses between Peel and Toronto | Table 12, p.74 |

## Key facts

- **G.E. Booth is over capacity on its natural catchment from 2019** (−1 ML/d) to 2041 (−142 ML/d).
  Clarkson has room (+25 ML/d in 2041). The East-to-West Diversion (2025) moves flow from Booth to Clarkson.
- **BOD loading is the tighter limit.** Booth's secondary clarifiers are short by about 26,000 kg/d in 2019.
  Clarkson's digesters run out around 2036.
- Booth's rated 518 ML/d was only reachable after the 40 ML/d capacity restoration (2027).
- The app's collection criteria (290 L/cap/d, 270 L/emp/d, Harmon 2–4, 0.26 L/s/ha) match the plan; a test now holds that.
- The app's water criteria (270 L/cap/d, max day 1.8) come from Peel's 2024 modelling demand table, not the
  2020 plan's 280 L/cap/d and 2.0. Both are sourced. Say which one a screen uses.

## Wiring it in

1. Show Booth and Clarkson as separate plant checks, with and without the diversion.
2. Add BOD loading as a second plant check beside hydraulic flow.
3. Use `plannedUpgrades` years as relief dates in the capacity runway view.
4. Tag each sewershed with its trunk id from `trunks` so a pipe screen can name the trunk it drains to.
