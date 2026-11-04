# Scenario 1 2031 Priority Areas: growth from development applications

Growth in the 19 priority areas of the Region map *4507-WW Development Application Modelling Update* (Scenario 1 2031,
2026-05-20), for hydraulic models based on the 2021 Census. Every figure is growth on top of the 2021 Census (census day
2021-05-11), from planning applications in this app, computed by the app's own modules:

| Growth | What it is |
|---|---|
| 2021–2026 | Built since census day (every building permit completed since then, as in Growth › 2021 existing) |
| 2026–2031 | The app Forecast's share of what is left to build, placed in 2026–2031 (Growth › Forecast › By period) |
| Total to 2031 | The two added |
| Final growth | Full build-out of the applications |

Each is given in units, residential population (Peel persons per unit) and jobs (floor area on the applications).

## Boundaries

Each area was checked against every boundary the app holds (120 secondary plans, 75 MTSAs, 30 precincts) and each
application's own parcel (Excel sheet *Boundary review*):

1. **Your direction:** A01 Macville = the Region map's blue applications (ArgoMcville, Bolton North Hill Op 1 and 2,
   Solmar) plus the two applications in its box. A15 Steeles MTSA = the whole *Steeles at Mississauga (Transit Hub)* MTSA.
2. **Existing boundary where its size matches the Region's:** A06 McLaughlin Road = Brookvalley (Mayfield West Phase 2)
   Secondary Plan, 438.1 ha vs 435.7 ha.
3. **Otherwise, application parcels:** the app's planning applications with at least half their land in the Region box.

Only planning applications with growth since census day count, and each counts in one area.

## Files

| File | What it is |
|---|---|
| `Priority_Areas_2031_Growth_Analysis.xlsx` | Read Me, Summary (formulas), Boundary review, Crosswalk (Region map points → applications), Developments, and one sheet per area, A01–A19 |
| `Priority_Areas_2031_Growth_Analysis.pptx` | 31 slides on the Peel template; area slides are 11–29 (slide = 10 + area no.), each built on its app screenshot |
| `app-screens/Axx_<name>_app.png` | The app's full map with the boundary drawn as its own selection and each application labelled; `A00_all_areas_app.png` shows all 19 |
| `maps/Axx_<name>.png` | Reference: the Region PDF map with the boundary used, numbered the same way |
| `priority_areas_2031.geojson` | Boundaries, Region boxes, applications and Region map points (WGS84) |
| `scripts/` | How the figures, screenshots, workbook and deck were produced |

**Cross-references.** Area `A08` = Excel sheet `A08` = PPT slide 18 = `app-screens/A08_SP47_app.png` =
`maps/A08_SP47.png`. Development `A08-012` is label 12 in both images.

The screenshots were taken offline: they show the app's own layers without basemap tiles. Unofficial screening estimate
from public data, not the Region's capacity ledger.
