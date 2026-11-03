# 2031 development application modelling review

Scripts that turn the Region's development-application points into a workbook for Planning to
review before the 2031 (Scenario 1) population goes to the water / wastewater modelling team.

**Core decision this supports:** which development-charge-funded water and wastewater linear
projects are needed by 2031 and should get capital funding.

**Goal:** a complete, clean 2031 population dataset by development application, rolled up to the
19 priority areas, with each unit count, density and share-built-by-2031 assumption stated openly.
Planning approves, corrects and judges likelihood and timing; Modelling runs the approved version.

## Data stays out of git

This repository is public. The inputs (Region-internal shapefile, map PDF) and every generated
workbook live in `private/`, which is in `.gitignore`. Only the scripts are committed.

```
private/
  input/Dev_Apps_V7.{shp,dbf,shx,prj,...}   the application points (V7)
  input/4507-WW-...Modelling_Update.pdf     the map
  map_labels.csv                            the 19 area labels, copied by hand from the map
  Map_Areas_2031.xlsx                       built by build_map_areas.py
  decisions.csv                             decisions locked at each checkpoint (shown in the workbooks)
  Bucket1_Inventory.xlsx                    built by build_inventory.py
  map_boxes.json                            built by extract_map_boxes.py
  Bucket2_Areas.xlsx, Bucket2_check_map.png built by build_areas.py
  Bucket3_App_Check.xlsx                    built by build_app_check.py (runs app_match.js)
  exclusions.csv, stated_units.csv          checkpoint exclusions; unit totals stated in the Region text
  Bucket4_Assumptions.xlsx                  built by build_assumptions.py
  Planning_Review_2031.xlsx                 built by build_review.py: the workbook Planning reviews
  App_Estimate_2031.xlsx                    built by build_app_estimate.py: the app's own estimate (side, proof of concept)
  servicing_limits.csv, meeting_notes.csv   from the servicing meeting
  Modelling_Handoff_2031.xlsx / .csv        built by build_handoff.py: the file for Modelling
```

## Buckets

| # | Bucket | Script | Status |
|---|--------|--------|--------|
| 0 | Map areas workbook | `build_map_areas.py` | reviewed |
| 1 | Inventory and reconciliation | `build_inventory.py` | reviewed |
| 2 | Area assignment (by location) | `extract_map_boxes.py`, `build_areas.py` | reviewed |
| 3 | Cross-validation against the app | `app_match.js`, `build_app_check.py` | reviewed |
| 4 | Assumptions (units, density, share built by 2031) | `build_assumptions.py` | reviewed |
| 5 | Planning review workbook | `build_review.py` | round 1 with Planning |
| 6 | Modelling handoff | `build_handoff.py` | round 1 draft built |

## Running

Python 3 with `openpyxl` and Pillow, plus poppler (`pdftocairo`, `pdftoppm`) to read the map PDF.
No GIS libraries needed: `shapefile_lite.py` reads point shapefiles and `geo.py` converts to UTM.

```bash
python3 build_map_areas.py
python3 build_inventory.py
python3 extract_map_boxes.py
python3 build_areas.py
python3 build_app_check.py      # needs Node 18+; reads the app's data/ read-only
python3 build_assumptions.py
python3 build_review.py          # the single workbook for Planning
python3 build_app_estimate.py    # side workbook: the app's own 2031 estimate
python3 build_handoff.py         # the file for Modelling; --from <Planning's returned workbook>
```

**How the area assignment works.** The map PDF is vector: each priority area is a dark-red
rectangle and each application a point symbol. `extract_map_boxes.py` matches the symbols to the
shapefile points (rotation search at the map's printed scale, then an iterated affine fit) to
georeference the page, so the rectangles are known on the ground. `build_areas.py` places each
application in its rectangle, names each rectangle after the label whose area its applications add
up to, and checks the population against the label. Municipality comes from the app's
`data/munis.json` where the file has none.

Formulas are written uncalculated; Excel calculates them on open.

**How the app check works.** `app_match.js` builds the app's developments exactly as the app does
(`scripts/app-devs.js`) and matches each application: by file number translated to the
municipality's numbering (and within 1 km), else by the application site outline the point falls in
(current developments before legacy-only ones), else the nearest development within 150 m. It only
reads the app's data. `build_app_check.py` grades each match, raises flags (withdrawn, non-residential,
built by 2021, people per unit), weighs the open duplicate pairs and summarises population by app
phase. Flags that could take people out of 2031 growth are raised only on High / Medium matches.

**How the 2031 population is worked out.** `build_assumptions.py` writes every assumption as an
editable cell (people per unit by density class, share built by 2031 by app phase, a share per
priority area for rows the app cannot confirm, and a build-out speed limit) and every row and total
as a live formula: 2031 population = full population x share built by 2031.
