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

## Wiring status

**Done (trunk supply check).** `trunkCons()` in `js/masterplan.js` replaces the zone-boundary estimate in
DC timing, each development's needs, DC links and the "How many more units fit?" tool:

- Capacity: the actual capacity of the mains in service, from `trunks[].mains`. Planned mains are relief,
  with their year and added capacity.
- Flow: the plan's 2021 figure + a share of the tracker's growth since the census. Each trunk's share is
  its own 2021→2041 increase over its pool's (Table 8): West trunks share West growth, East trunks East
  (+ Bolton), Central trunks Central + East (East water climbs the Central trunks to Beckett Sproule).
  The two Central trunks that carry York (CT2H, CT3) add the York agreement schedule on top.
- A development's system comes from its water trace (West from Lorne Park, East if it uses East pumps,
  else Central). It relies on the tightest trunk in its pool at or below its zone.
- Why shares, not traces: the trace picks one route per development, but parallel mains split the flow
  in the plan's model. All-or-nothing tracing put 2,649 developments on a main the plan gives 4 ML/d.

The old `supplyCons()` and `data/water-supply.json` remain only for the Labs EPANET skeleton.

**Still to do**

1. Split zones into W / C / E on the map, from facility locations or a traced line. Check each piece's
   population against `subzones2041`.
2. Known-answer tests: compare the app's 2041 MDD per sub-zone to `subzones2041.mddMLd` and show the gap.
3. Keep the South Peel plant check pooled, but show the Table 9 split by plant beside it.

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

## Wiring status

**Done (plant checks).**

- **Flow, both ways.** `plantCons()` treats the 70 ML/d diversion as a step at its start year, so each
  plant shows its run-out year with the scenario's setting and with the other one. Numbers match the
  model for both settings.
- **BOD loading.** `bodCons()` checks G.E. Booth and Clarkson against their governing capacity (Booth
  secondary clarifiers 96,695 kg/d; Clarkson digestion 58,790 kg/d). Loading = the plan's 2021 figure +
  growth since the census at 75 g/person and 37.5 g/job + the plan's high-strength increase (500 kg/d a
  year, split by 2019 loadings). The diversion moves loading at Booth's 2021 strength (≈262 kg/ML).
- Both appear in DC timing and each development's needs, beside the flow check.

**Caveats**

- Booth's BOD reads about 50% over today. The plan found it over in 2019 too. But the governing capacity is
  2020's: New Plant 1 (2024) may have changed it, and the annual reports' BOD figures aren't in the app yet.
- Clarkson's 2023 digester expansion should have raised its governing capacity; the plan's figure may be low.
- The app adds 40 ML/d to Booth in 2028 (558 ML/d, "council-approved February 2024"). The plan describes the
  same 40 ML/d as a capacity *restoration* back to 518 ML/d (WW-TR-182). One of the two is wrong. Check before
  relying on Booth's 2028 step.
- Booth's measured 2025 flow (428 ML/d) is well below the plan's 2026 forecast (514). Flow growth has run
  slower than the plan.

**Still to do**

1. Add measured BOD loadings from the annual reports so today's loading is metered, not forecast.
2. Tag each sewershed with its trunk id from `trunks`.
