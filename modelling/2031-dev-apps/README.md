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
  Bucket1_Inventory.xlsx                    built by build_inventory.py
```

## Buckets

| # | Bucket | Script | Status |
|---|--------|--------|--------|
| 0 | Map areas workbook | `build_map_areas.py` | built, in review |
| 1 | Inventory and reconciliation | `build_inventory.py` | built, in review |
| 2 | Area assignment (by location) | | not started |
| 3 | Cross-validation against the app | | not started |
| 4 | Assumptions (units, density, share built by 2031) | | not started |
| 5 | Planning review workbook | | not started |
| 6 | Modelling handoff | | not started |

## Running

Python 3 with `openpyxl`; no GIS libraries needed (`shapefile_lite.py` reads point shapefiles).

```bash
python3 build_map_areas.py
python3 build_inventory.py
```

Formulas are written uncalculated; Excel calculates them on open.
