# Scenario 1 2031 Priority Areas: population analysis

The 19 priority areas on the Region map *4507-WW Development Application Modelling Update* (2026-05-20), crossed with
the developments in this app. Every figure is the app's own: units, residential population and jobs at **existing**,
**anticipated 2031** and **build-out**, for each area and each development in it.

| File | What it is |
|---|---|
| `Priority_Areas_2031_Population_Analysis.xlsx` | Read Me, Summary (SUMIFS formulas; block A = all developments, block B = planning applications only), Crosswalk (Region map points → app development), Developments (master list), and one sheet per area, A01–A19 |
| `Priority_Areas_2031_Population_Analysis.pptx` | 26 slides: findings, overview map, summary table, Region-vs-app chart, crosswalk, one slide per area (slide = 6 + area no.), method |
| `maps/A00_overview.png`, `maps/Axx_<name>.png` | Overview map and one map per area; every planning application is numbered with its development ID |
| `priority_areas_2031.geojson` | The area boxes, the developments and the Region map points, for GIS (WGS84) |
| `scripts/` | How the figures were produced, so they can be re-run on a newer snapshot |

**Cross-references.** Area `A08` = Excel sheet `A08` = PPT slide 14 = `maps/A08_SP47.png`. Development `A08-012` is
label 12 on that map and appears on that sheet and in sheet `Developments`.

**How the figures were produced.** `scripts/extract.js` loads the app headless with Playwright, using the published
`data/`, and reads each development's figures from the app's modules: `PeelDemand.estimate`, `PeelPhases.unbuiltOf`,
`PeelLedger.rows` with the `PeelTiming` forecast, and `PeelEmployment`. `geo.py` georeferences the PDF by fitting its
municipal boundary to `data/munis.json`. `compute.py` assigns developments to the boxes. The workbook's Read Me gives
the definitions and caveats.

Unofficial screening estimate from public data. Not the Region's capacity ledger.
