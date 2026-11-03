# Scenario 1 2031 Priority Areas: population analysis

The 19 priority areas on the Region map *4507-WW Development Application Modelling Update* (2026-05-20), crossed with
the developments in this app. Every figure is the app's own: units, residential population and jobs as **growth on
top of the 2021 Census** (census day 2021-05-11), the base year of the hydraulic models:

- **Existing (2021–2026)**: built from census day to the app snapshot (2026-10-19): every building permit completed
  since census day, as in the app's Growth › 2021 existing "+ Built since".
- **Anticipated 2031 (2021–2031)**: existing 2021–2026 plus the app Forecast's 2026–2031 share of what is left to build.
- **Build-out (growth since 2021)**: existing 2021–2026 plus everything left to build.
- **Built before census day** is shown for reference only: it is already in the 2021 Census and is not added.

| File | What it is |
|---|---|
| `Priority_Areas_2031_Population_Analysis.xlsx` | Read Me, Summary (SUMIFS formulas; block A = all developments, block B = planning applications only), Crosswalk (Region map points → app development), Developments (master list), and one sheet per area, A01–A19 |
| `Priority_Areas_2031_Population_Analysis.pptx` | 27 slides: findings, the Region map (reference), the 19 areas in the app, summary table, Region-vs-app chart, crosswalk, one slide per area built on its app screenshot (slide = 7 + area no.), method |
| `app-screens/Axx_<name>_app.png` | Screenshots of the app, one per area (plus `A00_all_areas_app.png`): the full map with the area drawn as the app's own selection, every development in it selected, each planning application labelled with its number, and the app's selection panel open |
| `maps/A00_overview.png`, `maps/Axx_<name>.png` | Reference: the Region PDF map, with the app's developments plotted on it and numbered the same way |
| `priority_areas_2031.geojson` | The area boxes, the developments and the Region map points, for GIS (WGS84) |
| `scripts/` | How the figures were produced, so they can be re-run on a newer snapshot |

**Cross-references.** Area `A08` = Excel sheet `A08` = PPT slide 15 = `app-screens/A08_SP47_app.png` (Region map
reference: `maps/A08_SP47.png`). Development `A08-012` is label 12 in both images and appears on that sheet and in sheet
`Developments`. The screenshots were taken offline, so they show the app's own layers without basemap tiles; the app's
panel in them gives the developments' full size, pre-2021 included.

**How the figures were produced.** `scripts/extract.js` loads the app headless with Playwright, using the published
`data/`, and reads each development's figures from the app's modules: `PeelDemand.estimate`, `PeelPhases.unbuiltOf`,
`PeelLedger.rows` with the `PeelTiming` forecast, `PeelAreas.growthSince` (built since census day) and `PeelEmployment`. `geo.py` georeferences the PDF by fitting its
municipal boundary to `data/munis.json`. `compute.py` assigns developments to the boxes. The workbook's Read Me gives
the definitions and caveats.

Unofficial screening estimate from public data. Not the Region's capacity ledger.
