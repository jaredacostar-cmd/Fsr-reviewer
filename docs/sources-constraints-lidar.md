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
