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
