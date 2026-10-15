# Sources: lidar elevation and constraint layers (Stage 0, report only)

Checked in GitHub Actions on 2026-10-15 (Probe data sources, `mode=constraints-lidar`; the sandbox
cannot reach these hosts). The raw results are in `data/probe/constraints-lidar.json`; the script is
`scripts/probe-constraints-lidar.js`. "In Peel" is the number of features intersecting Peel's extent
(−80.16, 43.47 to −79.48, 44.00). "CORS" is whether a browser on `https://jaredacostar-cmd.github.io`
may read the endpoint (`*` or the site's origin returned in `Access-Control-Allow-Origin`).

Nothing has been built or shipped in this stage. The recommendations below were approved on
2026-10-15 with the four decisions under "Decisions".

## Elevation

| Dataset | Endpoint / download | Format | Peel coverage | Resolution | Updated | Licence | CORS | Recommendation |
|---|---|---|---|---|---|---|---|---|
| **Ontario Digital Terrain Model (Lidar-Derived)**, bare earth (LIO / Ontario Provincial Mapping) | `ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DTM_LidarDerived/ImageServer` (identify / getSamples / exportImage); package downloads indexed at `services1.arcgis.com/TJH5KDher0W13Kgo/…/Ontario_Digital_Terrain_Model_Lidar_Derived_WFL1/FeatureServer/0` | ArcGIS ImageServer (Mensuration, Pixels, Download); packages as raster tiles | All four test points: Port Credit 76.13 m, Brampton centre 211.99 m, Caledon East 294.51 m, Hockley 375.08 m. 32 packages over Peel from projects **GTA 2023**, **GTA 2014–18**, OMAFRA 2016–18, York–Lake Simcoe 2019, DEDSFM Huron–Georgian Bay 2022–23, DEDSFM Upper Thames–Grand River 2025 | **0.5 m** | Package index edited 2026-06-08; web map 2026-06-11 | Open Government Licence – Ontario (item licence; credit link ontario.ca/page/open-government-licence-ontario) | Yes (site origin) | **Use as the primary source.** The browser can query it directly (no tiles to host): `getSamples` takes a multipoint, so a whole profile is one request. Label "Lidar DTM 0.5 m (Ontario, GTA 2023)" with the project of the package under the point. |
| NRCan HRDEM / CanElevation (lidar DTM) | STAC `datacube.services.geo.ca/stac/api`, collections `hrdem-lidar` (14 items over Peel, 2018–2025), `hrdem-mosaic-1m`, `hrdem-mosaic-2m`; COGs on `canelevation-dem.s3.ca-central-1.amazonaws.com` | Cloud-optimised GeoTIFF (range requests: 206 Partial Content) + `hillshade-dtm` asset | Peel covered by the 1 m mosaic tile `8_2` | **1 m** (mosaic); per-project 1 m | Mosaic 2025-11-14 (files dated 2026-05) | OGL – Canada 2.0 (STAC licence field) | Yes (`*`) | **Second source** (geotiff.js range reads), and the **hillshade** (its `hillshade-dtm` COG), so the hillshade needs no processing or hosting either. |
| AWS Terrain Tiles (Mapzen) | `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | Terrarium PNG tiles | Global | ±1–2 m (z15) | — | AWS Open Data terms (as used today) | Yes (`*`) | **Keep as the fallback** outside lidar coverage, as today. |
| Ontario DSM (Lidar-Derived) | `…/Elevation/Ontario_DSM_LidarDerived/ImageServer` | ImageServer | Peel | 0.5 m | 2026 | OGL – Ontario | Yes | Not for ground (it includes buildings and trees). Not used. |
| Ontario Provincial DEM | `…/Elevation/Ontario_Provincial_DEM/ImageServer` | ImageServer | Peel | 30 m | — | OGL – Ontario | Yes | Not needed (coarser than the fallback). |

**Benchmark for the 0.5 m test.** City of Brampton, *Engineering Survey Controls*
(`maps1.brampton.ca/arcgis/rest/services/ACRIS/ACRIS/MapServer/15`): 451 monuments in Peel with
`ELEVATION`, `DATUM_V` and inspection fields; item licence "CC BY"; CORS yes. The probe's comparison
query was rejected by that server (HTTP 400), so I will pick the benchmark in Stage 1. **Vertical
datum to confirm:** the lidar DTM is in CGVD2013; if Brampton's monuments are CGVD28 the two differ
by roughly 0.3–0.5 m in Peel, which matters for a 0.5 m test. The test will convert or pick a
CGVD2013 monument.

## Constraints

| Dataset | Owner | Endpoint | Format | In Peel | Scale / resolution | Updated | Licence | CORS | Recommendation |
|---|---|---|---|---|---|---|---|---|---|
| **CVC regulation limit 2025** (current, O. Reg. 41/24) | Credit Valley Conservation | `services1.arcgis.com/d0ZCwU7eGKVeNiEE/…/Generic_Regulations_Limit_2025/FeatureServer/0` (also on `geohub.cvc.ca`) | Feature service (1 multipart polygon) | 1 (whole watershed) | Parcel scale | Edited 2026-09-10 | CVC Open Data Licence v1.0 (2024 item states it; the 2025 item links the licence PDF) | Yes | **Keep** (in the app today, pre-cut into tiles). Rebuild from the 2026-09 edit. |
| **TRCA regulation limit 2025** | Toronto and Region CA | `…/TRCA_Regulation_Limit2/FeatureServer/0` | Feature service | 3,513 | Parcel scale | 2026-04-29 | TRCA Open Data Licence v1.0 | Yes | **Keep** (in the app today). |
| NVCA regulation limit (north Caledon) | Nottawasaga Valley CA | — none published by NVCA; only a Dufferin County copy (`DufferinGIS/NVCA_Regulation_Line_2024`, "DufferinOnly") and a 2021 Grey County mirror (0 in Peel) | — | — | — | — | — | — | **Skipped** (decision 3): "not published for the NVCA area". |
| **CVC regulatory floodplain** | Credit Valley Conservation | `…/Regulatory_Floodplain_areas/FeatureServer/0` (CVC_RegulatoryFloodlines_Feb2026) | Polygons | 1,000+ | Engineered floodlines | 2026-02-13 | CVC Open Data Licence v1.0 (stated in the service copyright) | Yes | **Use.** |
| TRCA floodplain (generalized) | Toronto and Region CA | `…/FloodPlain_Regulatory/FeatureServer/2` and `…/Floodline_TRCA_Polygon/FeatureServer/1` | Polygons (+ floodlines) | 640 | 1:144,448 min scale; TRCA says "generalized, not a regulatory floodplain map" | 2026-09-21 | **Item states a disclaimer only, no licence** | Yes | **Use, with TRCA's disclaimer** (decision 1). |
| NVCA floodplain | NVCA | none for Caledon (Grey County mirror, 0 in Peel) | — | — | — | — | — | — | "Not published for Caledon (NVCA area)". |
| **Greenbelt Plan area** | Ontario (MMAH), LIO | `ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA/LIO_Open06/MapServer/17` (outer boundary), `/15` (designation: Protected Countryside, Urban River Valley, ORM Conservation Plan, Niagara Escarpment Plan) | Polygons | 1 / 31 | Provincial plan schedules | Item 2025-11-27 | OGL – Ontario | Yes | **Use** (`/15` gives all four designations in one layer). |
| **Oak Ridges Moraine Conservation Plan** | Ontario, LIO | `…/LIO_Open06/MapServer/29` (planning area), `/28` (land use designation) | Polygons | 1 / 113 | Plan schedules | 2026-08-04 | OGL – Ontario | Yes | **Use** both. |
| **Niagara Escarpment Plan** | NEC / Ontario, LIO | `…/LIO_Open06/MapServer/25` (boundary), `/26` (designations: Natural, Protection, Rural, Recreation, Mineral Resource Extraction) | Polygons | 1 / 343 | Plan schedules | — | OGL – Ontario | Yes | **Use.** |
| **Provincially significant wetlands** | Ontario (MNR), LIO | `…/LIO_Open01/MapServer/15` (Wetland With Significance; `WETLAND_SIGNIFICANCE` = Evaluated-Provincial) | Polygons | 19,252 wetlands (PSW subset by field) | 1:10,000 | — (`VERIFICATION_STATUS_DATE` per feature) | OGL – Ontario | Yes | **Use**, filtered to Evaluated-Provincial (PSW). |
| **ANSI** | Ontario (MNR), LIO | `…/LIO_Open05/MapServer/3` | Polygons | 101 | — | — | OGL – Ontario | Yes | **Use.** |
| **Growth Plan Natural Heritage System** | Ontario, LIO | `…/LIO_Open06/MapServer/22` (`ENABLING_PLAN` = Growth Plan for the GGH; same layer also holds the Greenbelt, ORM and NEP systems) | Polygons | 354 | — | — | OGL – Ontario | Yes | **Use**, filtered to the Growth Plan (other plans' NHS shown with their plan). |
| **Source protection (CTC)**: wellhead protection areas (A–D, E, Q1, Q2), intake protection zones, highly vulnerable aquifers, significant groundwater recharge areas, issue contributing areas | CTC Source Protection Region (TRCA, CVC, CLOCA), hosted by CVC | `geohub.cvc.ca/server/rest/services/SWP_Wellhead_Protection_Area_2024/FeatureServer/0`, `SWP_Intake_Protection_Zone_2024`, `SWP_Highly_Vulnerable_Aquifer_2024`, `SWP_Significant_Groundwater_RechargeArea_2024`, `SWP_Wellhead_ProtectionArea_E/Q1/Q2_2024` | Polygons | WHPA 101, IPZ 6, HVA 435, SGRA 1,316 | Assessment-report mapping | 2024 edition (items 2025-10 to 2026-03) | **Linked PDF** (camaps item 9813a6fc…; presumed CVC Open Data Licence v1.0) | Yes | **Skipped** (decision 2). |
| **Watercourses** | Ontario (MNR), Ontario Hydro Network, LIO | `…/LIO_Open01/MapServer/26` (OHN Watercourse), `/25` (Waterbody) | Lines / polygons | 15,343 / 7,421 | 1:10,000 | — | OGL – Ontario | Yes | **Use OHN** as the base layer (in the app today). |
| Watercourses (Region of Peel) | Region of Peel | `services6.arcgis.com/ONZht79c8QWuX759/…/Watercourses/FeatureServer/0` | Lines | 890 | — | 2021-10-04 | Open Data Licence for the Regional Municipality of Peel v1.0 | Yes | Keep as today (named, with watershed); OHN for the 30 m / 120 m checks. |
| Gas pipelines, hydro lines | Ontario, LIO Utility Line | `…/LIO_Open05/MapServer/11` | Lines | 127 | Varies ("located" accuracy field) | — | OGL – Ontario | Yes | **Keep, off by default**, labelled "approximate; call Ontario One Call before any work". The app's OpenStreetMap fallback (ODbL) needs its attribution shown, or drop it. |
| Brampton survey controls (benchmark) | City of Brampton | `maps1.brampton.ca/…/ACRIS/ACRIS/MapServer/15` | Points | 451 | Survey | — | CC BY | Yes | For the Stage 1 benchmark test only. |

## Decisions (2026-10-15)

1. **TRCA floodplain: ship, with TRCA's own disclaimer** on the layer, its legend entry, the feature
   card and the Site checklist line ("generalized representation of the regulatory flood plain, not a
   regulatory flood plain map; confirm with TRCA").
2. **CTC source protection: skipped.** Not built. The Site checklist has no source protection line,
   and the Constraints group has no source protection layer.
3. **NVCA: skipped.** Nothing is built for the NVCA area. The checklist's regulation-limit and
   floodplain lines read "not published for the NVCA area (north Caledon)" for a site there, so they
   are never blank.
4. **Gas pipelines / hydro lines: kept, off by default**, labelled approximate ("approximate location
   (Land Information Ontario); call Ontario One Call before any work").

Everything else in the tables above is approved as recommended.

## Notes for Stages 1–2

- **No tile hosting needed for elevation.** Both lidar sources allow browser access, so Stage 1 needs
  no `tiles` branch or release:
  - the Ontario DTM image service, via `getSamples` / `identify` (CORS for the site origin);
  - the NRCan COGs (`*`).
  The hillshade comes from NRCan's `hillshade-dtm` COG.
- **Size and loading.** Each constraint dataset will be pulled in Actions, clipped to Peel,
  simplified to display scale, and written to `data/constraints/<name>.json` with
  `data/constraints/manifest.json` (source, owner, licence, as-of). The ~2 MB first-load budget
  doesn't apply because each file loads only when switched on.
  - Large layers (PSW 19k, OHN 15k, SGRA 1.3k) will be cut into tiles like the CVC regulation limit
    today, so one switch never pulls more than ~2 MB.
- **Current regulation limits.** CVC 2025 and TRCA 2025 both post-date O. Reg. 41/24 (April 2024)
  and are current.

## Stage 1 (lidar elevation): checks and what was built

Checked in Actions (`mode=elev-check` → `data/probe/elevation.json`; `mode=elev-bench` →
`data/probe/elevation-bench.json`):

- **Sampler.** The Ontario DTM image service's `getSamples` takes a multipoint, so a whole profile
  is one request (60 points per request).
  - Each value comes with the raster's attributes, including `Project` (e.g. "GTA 2023") and
    `Resolution_m`. That means the project label needs no second lookup in the package index.
  - Values are strings ("231.069992065").
  - Off the coverage, the service leaves the point out of `samples`. When no point in the request
    has a value, it answers with error 400.
- **Hillshade.** The same service has a `Hillshade` raster function (15 others too), and
  `exportImage` with that rendering rule returns a 256 × 256 PNG for the site origin.
  - The hillshade therefore comes from the Ontario service, not NRCan's `hillshade-dtm` COG as
    planned in Stage 0. It is one source with no COG reader to add, and the licence is the same
    OGL – Ontario.
  - NRCan HRDEM is not used in Stage 1.
- **Benchmarks.** City of Brampton benchmarks are brass tablets set in walls, foundations, culverts
  and bridges, on **CGVD28** (1978 Southern Ontario adjustment). The lidar is on **CGVD2013**.
  - For the 142 active benchmarks whose description states the tablet's height above grade:
    ground (CGVD2013) = published elevation − height above grade + (N28 − N2013).
  - N28 − N2013 comes from NRCan's HT2_2010v70 and CGG2013a grids (via PROJ `cct`). It is
    **−0.40 to −0.41 m** across Brampton.
  - Lidar − ground over all 142: median **−0.09 m**; 76 within 0.5 m (55 within 0.25 m); p10
    −1.85 m, p90 +0.97 m.
  - The tails are tablets on bridges, culverts and raised porches. There, the bare-earth pixel at
    the mapped point is not the grade at the tablet.
  - Example: benchmark 544 (inspected 2019, tablet 0.30 m above ground) differs by −0.09 m.
  - The fixture `tests/fixtures/elevation-benchmarks.json` keeps the monument number, position and
    values only. The descriptions name private addresses, so they are dropped.

Built:

- `js/elevation.js` (`PeelElevation`):
  - `getGround(lat, lng)` → `{ z, source, res, project, label }`. Single calls in the same tick go
    out as one request.
  - `getGroundMany(points)`.
  - Terrain Tiles as the fallback, used both off the lidar coverage and when the service does not
    answer.
  - `sourceLabel` / `shortLabel` / `sourcesNote` / `sourceRuns` for the source on every result.
  - The hillshade layer (a switch under Layers › More settings › Base map, off by default; the Base
    map group comes in Stage 3).
- Switched to the sampler:
  - Measure & ground profile: each run's source along the line, and terrain-tile stretches drawn
    dashed.
  - Pipe depth (ground − invert, with the ground's source).
  - Development › Site, both views: ground and the fall to the catchment outlet, each with its
    source. The fall to outlet now also shows in the newer Site tab.
  - The sewer profile's ground.
  - The pressure-zone estimate's ground.

## Stage 2 (constraint layers): what was built

Built in Actions (`mode=constraints-build`, `scripts/build-constraints.js`) on 2026-10-15, into
`data/constraints/`:
- one folder per layer: `index.json`, 0.02° tiles, and `overview.json` for area layers;
- `manifest.json`: source, owner, licence and as-of date of every layer, with its size;
- `grid.json`: the 25 m screening grid, 0.58 MB.

How the build works:
- Each layer is queried over Peel's extent and simplified at the service to about 2–11 m.
- It is cut into tiles where Peel has land, using the 2021 census areas.
- Area layers also get one overview, simplified to about 30 m and clipped to Peel's extent, for
  zooms below 13.
- Nothing about people is stored: no item owners, editors or comments.
- The Stage 0 probe file's account names were removed in this stage too.

| Layer (id) | Owner | Licence | As of | Features in Peel | Tiles | Size (largest tile) | Overview |
|---|---|---|---|---|---|---|---|
| Regulation limit (CVC) (`reg-cvc`) | Credit Valley Conservation | CVC Open Data Licence v1.0 | 2026-03-03 | 1 | 226 | 9.58 MB (166 kB) | 372 kB |
| Regulation limit (TRCA) (`reg-trca`) | Toronto and Region Conservation Authority | TRCA Open Data Licence v1.0 | 2026-04-29 | 3,513 | 223 | 1.78 MB (22 kB) | 411 kB |
| Regulatory floodplain (CVC) (`flood-cvc`) | Credit Valley Conservation | CVC Open Data Licence v1.0 | 2026-02-13 | 1,000 | 211 | 1.58 MB (23 kB) | 238 kB |
| Floodplain, generalized (TRCA) (`flood-trca`) | Toronto and Region Conservation Authority | No licence stated; published by TRCA with a disclaimer (shown with the layer) | 2026-09-21 | 640 | 218 | 2.38 MB (34 kB) | 299 kB |
| Greenbelt Plan (`greenbelt`) | Province of Ontario (Municipal Affairs and Housing) | Open Government Licence – Ontario | 2023-12-14 | 31 | 313 | 0.13 MB (3 kB) | 65 kB |
| Oak Ridges Moraine Conservation Plan (`orm`) | Province of Ontario (Municipal Affairs and Housing) | Open Government Licence – Ontario | 2025-02-26 | 113 | 74 | 0.07 MB (4 kB) | 34 kB |
| Niagara Escarpment Plan (`nep`) | Niagara Escarpment Commission / Province of Ontario | Open Government Licence – Ontario | 2026-07-13 | 343 | 69 | 0.28 MB (12 kB) | 108 kB |
| Provincially significant wetlands (`psw`) | Province of Ontario (Natural Resources) | Open Government Licence – Ontario | 2026-10-13 | 8,825 | 217 | 1.63 MB (46 kB) | 287 kB |
| Areas of natural and scientific interest (ANSI) (`ansi`) | Province of Ontario (Natural Resources) | Open Government Licence – Ontario | 2026-08-18 | 101 | 140 | 0.33 MB (8 kB) | 106 kB |
| Natural Heritage System (Growth Plan) (`nhs`) | Province of Ontario (Municipal Affairs and Housing) | Open Government Licence – Ontario | 2022-12-14 | 59 | 43 | 0.01 MB (4 kB) | 23 kB |
| Watercourses (Region of Peel) (`wc-peel`) | Region of Peel | Open Data Licence for the Regional Municipality of Peel v1.0 | 2021-10-04 | 890 | 389 | 0.55 MB (6 kB) | — |
| Watercourses (Ontario Hydro Network) (`wc-ohn`) | Province of Ontario (Natural Resources) | Open Government Licence – Ontario | 2026-06-22 | 11,859 | 425 | 1.08 MB (9 kB) | — |
| Gas pipelines and hydro lines (approximate) (`utility`) | Province of Ontario (Land Information Ontario, Utility Line) | Open Government Licence – Ontario | not stated | 127 | 92 | 0.01 MB (1 kB) | — |

Not built (decisions of 2026-10-15): source protection (CTC); NVCA regulation limit and floodplain
(not published for north Caledon). Both appear in the manifest's `skipped` list and in the checklist.

**Loading.**
- Nothing loads at start.
- A layer loads only when switched on:
  - below zoom 13, its overview (23–411 kB);
  - above it, the tiles in view (at most 90; the largest tile is 166 kB).
- The screening grid loads with the first area-scope Overview (municipality, plan area, MTSA,
  zone or block), or when "Show for all of Peel" is pressed.
- The old CVC tiles (`data/regulation/cvc`, 13 MB) and `mode=regulation-build` are retired. The new
  build replaces them, and its clipping is still `scripts/build-regulation.js`.

**In the app.**
- **Layers:** ten switches:
  - regulation limits, floodplain;
  - Greenbelt, Oak Ridges Moraine, Niagara Escarpment;
  - PSW / ANSI, Natural Heritage System;
  - watercourses;
  - gas and hydro lines (approximate, off by default).
  All are off by default. Stage 3 groups them.
- **Feature card:** click a feature for its name, type, owner, as-of date, licence, source and
  screening note, plus TRCA's disclaimer on its floodplain.
- **Development › Site:** a Constraints checklist at the top, one line per check. Each line is
  flagged, nearby, clear, not published or not checked, and links to the layer and its source.
- **Overview, "Land under constraints":** for an area scope, the share of the land in regulation
  limits, floodplain and provincial plan areas, and the developments whose point is inside each
  (click to list them).

**Assumptions (Stage 2).**
1. **Checklist point:** checks run at the development's point. Site boundaries are not used, and
   "within 120 m" is measured from the point.
2. **Not published:** "not published" for regulation limit and floodplain comes from the
   conservation authority on the nearest Region of Peel watercourse within 3 km (NVCA, or
   Conservation Halton / HRCA). This is used only where no CVC or TRCA layer covers the point.
3. **Provincial plan areas:** these are the three plans' designation layers. Their union is each
   plan's area, so the checklist can name the designation, e.g. "Greenbelt: Protected Countryside".
4. **Watercourses:** checked against both the Region of Peel and the Ontario Hydro Network
   (virtual flow lines excluded).
5. **"Peel-clipped" means two things:**
   - tiles exist only where the 2021 census areas (Peel's land) reach;
   - overviews are clipped to Peel's extent.
   Features crossing the boundary are drawn to the tile edge.
6. **Area card figures:**
   - shares are measured on the 25 m grid, inside Peel's land;
   - municipalities are taken from the census areas;
   - the Peel total is 128,591 ha against Peel's published ~125,000 ha, because census outlines
     include some water.
7. **Missing as-of dates:** the Utility Line layer has no update date, so its as-of reads
   "not stated by the source".

## Stage 3 (layer groups): what was built

`js/layer-groups.js` (`PeelLayerGroups`) holds the group definitions; `js/map-markers.js` builds the
Layers panel from it.

**Groups.** Each group is an accordion section with:
- a group switch: on turns on the group's main layers, off turns off all of them;
- a count of layers on and in view, e.g. "2 on · 1 in view";
- a one-line summary when folded.

The six groups:
1. **Developments:** developments, heatmap, site boundary on hover.
2. **Capacity:** capacity colours, pressure zones, wastewater blocks, drainage areas.
3. **Infrastructure:** existing watermains / sanitary / storm sewers, water facilities, planned DC
   works. Under "Other utilities": gas pipelines and hydro lines (approximate, off by default).
4. **Constraints:** regulation limits, floodplain, Greenbelt, Oak Ridges Moraine, Niagara Escarpment,
   PSW / ANSI, Natural Heritage System, source protection (listed as "not included"), watercourses.
5. **Planning context:** secondary plans / character areas, precincts (new layer), MTSAs, census
   areas.
6. **Base map:** background, lidar hillshade, labels, aerial opacity (new), orientation.

**Presets.** Everything is off except Developments (and the site boundary on hover). Each view adds:
- Planning: the planning context.
- Water: pressure zones (capacity colours by zone), water facilities, existing watermains, planned
  water DC works.
- Wastewater: blocks, capacity colours, sanitary sewers, planned wastewater DC works.
- Capital: planned DC works.

Changes are remembered per view, as before, and the memory now includes the constraints, plan areas
and hillshade. Water and Wastewater also show their own system's planned DC works (restored
2026-10-15 after review); Capital shows both.

**Draw order**, bottom to top, set in `PeelLayerGroups.Z` and used by every pane:
1. base map (150)
2. hillshade (210)
3. constraints (300; fills ≤ 25%)
4. census areas (320)
5. planning areas (330)
6. capacity (360)
7. existing pipes (370)
8. planned works (380)
9. site boundaries (400)
10. markers (600)
11. traces (640)
12. selection (650)

**Share links and saved views.**
- Share links carry `lg=<layers>~<open groups>`.
- Saved views and per-view memory store `layers` and `groups`.
- Links and saved views from before the groups carry no `lg`. They open as they did: the view's layers
  plus `ms=`, with the other layers unchanged.

**Legend.** It follows the group order: developments, capacity, infrastructure (with other
utilities), then constraints.

**Phone.** One group is open at a time, and the group headers wrap to fit the 236 px panel. Opening a
development still folds the Layers panel, so it doesn't cover the selection.

**Assumptions (Stage 3).**
1. **Layers not built yet:** wastewater facilities, "Planned & under construction" and EAs are not in
   the app. The capital-ea work owns them, and its files are not touched here, so their rows are left
   out until they exist.
2. **"Wastewater loads":** this is the loads selector (census / built / committed / proposed), not a
   map layer, so it stays where it is.
3. **"In view":**
   - constraint layers report the features they drew;
   - existing pipes count only from zoom 15, and the hillshade from zoom 11;
   - other layers count as in view when on.
4. **"Site boundaries":** these are drawn with Developments whenever it is on. The switch in the group
   is the boundary on hover, the one setting the app has.

## Design alignment (redesign spec and design audit)

Stages 2–3 were checked against `docs/redesign/SPEC.md`, its Map controls board
(`boards/MapControls.dc.html`) and `docs/design-audit.md`, and brought into line.

- **One destination for clicks (SPEC §0.3, §3):**
  - A constraint feature opens in the right panel as a result scope, and the trail updates.
  - It uses **the same hover card** as plants, zones, DC works and files: kind, name, what it is,
    "Click: …".
  - Hover and click are hit-tested at the map level. Each pane draws on its own canvas and the top
    one takes the pointer, so planning areas or zones drawn above no longer swallow it.
  - While a constraint layer is on, planning areas are context outlines; filtering to a plan from
    the left panel still works.
- **Two ladders kept apart (SPEC §0.1) and the Stage 3 colours:**
  - Constraint areas are **hatched**, not filled, so they never read as a phase, layer or capacity
    colour. Hazards hatch one way; plans and the heritage system hatch the other.
  - Swatches in the panel and legend match.
- **Every number says its basis once (SPEC §0.5):** the Site checklist and the Land under
  constraints card each end with one basis line (layers, grid, built date, screening) instead of a
  separate disclaimer paragraph.
- **Map controls board (SPEC §4):**
  - Zoom thresholds are stated on each layer: "Existing watermains · from zoom 15", "Watercourses ·
    from zoom 12", "Gas pipelines · from zoom 11", "Lidar hillshade · from zoom 11", and for
    constraint areas "detail from zoom 13".
  - A layer below its zoom is dimmed, with "Zoom in to see it".
  - Gas and hydro are back to the spec's zoom 11.
  - The panel opens with the view's preset ("Planning preset", or "· changed · Reset").
  - "Planned DC works · 2026 draft" carries its basis.
- **Five tabs at every scope (SPEC §0.4):**
  - The checklist sits in Development › Site.
  - The area card is in the Overview at municipality, plan, MTSA, zone and block scope.
  - The feature card is a result scope; no new tab is added.
- **Design audit:**
  - Text at least 11 px (`--fs-1`).
  - Screening wording on every constraint line, with no determinations.
  - Constraints stay out of the Regional servicing verdict (jurisdiction: CA and province).
- **Kept from the Stage 3 brief, not the board:** the brief's **six** groups replace the board's three
  (Growth / Servicing / Capital & constraints).

Also fixed: the "Show developments" button in the "Developments are switched off" note was white
on white.
