# Peel Growth Pipeline (unofficial)

> **Unofficial prototype · public data only · not a Region of Peel product.**
> Capacity and development-charge figures are screening estimates, not engineering analysis.

A map of every development in Peel Region (Mississauga, Brampton, Caledon), following each
site from application to completion.

It pulls planning applications and building permits from the municipalities' public ArcGIS
open-data services, refreshed weekly into a data snapshot. Files on the same site are linked
into one **project**, and each project is placed in a construction phase:

| # | Phase | What it means |
|---|-------|---------------|
| 1 | Inception | Pre-consultation or application submitted |
| 2 | Under review | Circulation, public meeting, appeal; also zoning / official plan / subdivision approved with no site plan approval yet |
| 3 | Approved | Site plan approved, or plan of subdivision registered (the last planning step before building permits) |
| 4 | Permit issued | Building permit issued |
| 5 | Under construction | Inspections underway |
| ✓ | Completed | Occupancy, final inspection or permit closed |
| × | Withdrawn / refused | Every file on the site was withdrawn, refused, cancelled or expired |

Each file keeps its own status; the site takes the furthest phase of its files, except that
**only a site plan approval, or a plan of subdivision shown as registered, makes a site
Approved**. An approved zoning, official plan, draft subdivision or condominium file keeps the
site under review (shown as *Zoning approved · site plan pending*); a site plan approved before
a newer rezoning that is still in review was for an earlier proposal and does not count.
Demolition permits (HOUSDEMO / DEMO) clear a site and don't set its phase. A permit sets the
site's phase only when it is for the site's buildings (adds units, a new dwelling building, or
a new non-residential building); site servicing, shoring, signs, sales pavilions and additions
don't count. A change to these rules is recorded in `data/history.json` as a re-read (marked
`rules`), not as a phase change on the ground.

## Run it

It's a static site with no build step:

```sh
npm start            # serves on http://localhost:8080
```

Live at <https://jaredacostar-cmd.github.io/peel-growth-pipeline/>. After your first visit
the app shell is cached by the service worker, so it opens offline (see "Developing" below);
the data files refresh in the background whenever you're online.

**On iPhone / iPad:** it needs to be served from a web address — opening the file from the
Files app won't work. Use the GitHub Pages link above, Netlify Drop
(<https://app.netlify.com/drop>), or run `npm start` on a computer and open
`http://<computer's IP>:8080` on the same Wi-Fi. Tap **Share → Add to Home Screen** to
install it under the name **Peel Dev**.

## Layout

One screen, no page scroll:

- **Top bar:** the scope trail (Peel › municipality › area › development), the view switch
  (Planning / Water / Wastewater / DC, which also sets the map layers), the Scenario chip,
  Export, Present, Help and the Settings gear (Settings, Sources & checks, Change log).
- **Filter column (left):** three tabs — **Explore** (the filter panel: Search · Stage ·
  Where · What · When · Flags, plus saved-view preset chips), **This week** (new or
  phase-changed projects since the last weekly update, with your watchlist), and **Data**
  (source list, Refresh live, duplicate check, advanced source settings).
- **Map (middle):** developments over aerial or street basemaps, with a tool rail on the
  left edge and the Layers panel on the right. A slim timeline strip runs along the bottom.
- **Analysis column (right):** six tabs — **Overview · Growth · Water · Wastewater · DC ·
  Developments** — plus **Development** when a site is open and **Tool result** for tool
  outputs. Resizable by dragging its left edge.
- **Phones:** the filters open from a **Filters** button (with the active-filter count), and the analysis column
  becomes a bottom sheet (tap the grip to step summary → half → full).

The same slim banner — *Unofficial prototype · public data only · not a Region of Peel
product* — sits at the top of every screen, and the same line is printed on every export.

## Features

### Overview
Headline sentence, four tiles, a **Needs attention** card (constraints that run out before
relief, stalled large sites, sites past the 90% trigger, this week's changes), plant and
water-treatment capacity bars, the largest developments — and the **executive briefing** PDF
(one printable page: headlines, growth and demand tiles, servicing demand by phase, plant
triggers, DC projects to bring forward).

### Growth
**Pipeline** — the application pipeline by phase and dwelling type (planned / permitted /
completed / left to build), completions per year, median time from application to approval by
municipality. **Census & 2051** — growth since the census (built + approved + proposed),
the 2051 population / unit / job allocations, housing targets to 2031, the population
outlook. The census baseline follows the timeline (2021 or 2016 dissemination areas).

### Water
**Capacity** (treatment, pumping into each pressure zone as % of firm capacity, storage, with
room left and trigger year), **Zones**, **Facilities** (existing plants, pumping stations,
reservoirs, tanks, wells), and **Hydraulic check (beta)** — an EPANET 2.2 check running in
the browser on the large mains into the upper zones at the results-year maximum day.

### Wastewater
**Plants** (capacity chart with the uncommitted reserve, horizon table 2025–2051, inflow by
growth layer, the tightest pipes), **Blocks** (the Region's 40 I&I sewersheds, with outlets
and upstream/downstream block tracing), **Pumping stations** (build-out flow vs firm
capacity), and **Allocations** (servicing allocations recorded per development, with each
plant's room at the 90% trigger after allocations). **Trace** a development's sewer path to
the plant — pipes coloured by capacity state, with flow arrows, stations and the tightest
pipe — or open a **sewer profile** long-section (ground, pipe, flow depth, freeboard) along
any path. The pipe model (`data/sewers.json`): every 300 mm+ sanitary main with Manning
full-flow capacity and the census population draining through it; a screen, not a hydraulic
model.

### DC
**Timing** — every 2026 DC project replayed year by year against phased growth, with
diversion of flow to each project from its construction year; **Recommendations** — Keep /
advance / defer per project, with what cancelling holds back in people and units;
**Funding** — a DC budget scenario (default 10 years) ranking projects by growth let through
per dollar. Planned works come from the Region's 2026 DC capital maps (`data/dc-infra.json`).

### Developments
The project list for the current scope and filters, paged with sorts (units, phase, last
activity …); opening one sets the scope for every tab (see Development below).

### Development (open site)
Opening a project sets the scope for every tab. The Development tab has three views:
**About** (proposal, status, latest council decision, latest Functional Servicing Report
link), **Files & history** (*How the phase was set*, dated timeline, source records with
portal, source link and pulled-on date), and **Site** (aerial before/latest check, ground
elevation, storm sewers and ponds). The site bar offers trace sewer / water, watch, memo,
record allocation, FSR check and compare. The **development memo** PDF is a one-page
servicing memo for the site.

### Map & tools
- **Views:** Planning, Water, Wastewater and DC — each remembers its own layers. Markers can
  be coloured by phase, servicing layer or receiving plant; a capacity layer shows catchment
  flow growth, pumping-station % of firm capacity, or pressure-zone max-day growth.
- **Tool rail** (left edge, one active at a time): *Select* (tap, lasso, or Ctrl-drag a box),
  *Measure & ground profile*, *Trace* (sewer path to the plant or water supply from the
  plant), *Test a site* (proposed development: units by type, jobs, site area), *Inspect
  point* (sewers, mains, zones nearby), *Corridor select*, *How many more units fit?*.
  Results open in the **Tool result** tab. Also: Compare, Upgrade this pipe, DC timing, Area
  report, Inquiry response draft, and Present mode (full-screen map + headline + four tiles).
- **Search** finds addresses, developments, file numbers, secondary plans / character areas,
  MTSAs, pressure zones, catchments, pumping stations, DC projects and intersections
  ("Main St & Queen St").
- **Filters** — Stage (tap the phase bar; Ctrl-click for several), Where (municipality,
  secondary plan, MTSA, pressure zone, drainage area), What (size, dwelling type, land use),
  When (milestone + year range), Flags (Watched, Stalled 2+ years, Changed this week).
  Filters appear as chips and are kept in share links.

### Exports & sharing
Top bar → **Export**: CSV and GeoJSON of the shown developments (with provenance columns
`portal`, `source_url`, `retrieved_at`, `source_record_id`), servicing areas and planned
works as GeoJSON, a **SWMM 5 skeleton** of the 40 wastewater blocks, an **Excel workbook**
(fixed sheets: Summary, Developments, Records, Water, Wastewater, DC, Criteria, Sources),
print-ready PDFs (executive briefing, development memo, area report, comparison), and Print
map. **Copy share link** captures the exact view — filters, tabs, scenario, map position and
the open development — and the address bar keeps the same link as you work.

### Data you can trust
- Every source record shows its **portal** (e.g. *City of Brampton Open Data*), a link to
  the record in its ArcGIS FeatureServer layer, and the pulled-on date.
- **Sources & checks** (gear menu): every source with its date, update interval and status,
  and the model checked against published figures — the 2021 Census, the plants' 2025
  reported flows (±10% matches, ±25% close), South Peel water production.
- Capacity and DC results are labelled **screening estimate** wherever they appear; the
  pipeline's unit totals are reconciled by a weekly **duplicate check** (Data tab).

## Project structure

`index.html` loads ~79 modules from `js/`, each owning one area (no global soup; `js/app.js`
is a 720-line boot file that wires them together). Every script tag carries
`?v=__BUILD__`, replaced by the deploy workflow for cache-busting.

| Group | Modules | Owns |
|---|---|---|
| Boot & shell | `js/app.js`, `index.html`, `css/`, `404.html` | Startup wiring, page, styles, repo-rename redirect |
| Shared core | `js/util.js`, `js/config.js` (source catalogue), `js/phases.js` (phase model), `js/loader.js`, `js/snapshot-index.js` (startup-index hydration), `js/filters.js`, `js/search-filter.js`, `js/filter-ui.js` | Data loading, phase rules, filter state |
| Top bar | `js/topbar.js`, `js/share.js`, `js/settings.js`, `js/tips.js`, `js/changelog.js`, `js/info.js`, `js/analysis-tabs.js`, `js/tool-scope.js` | Scope trail, share links, settings, tour, press-and-hold info cards |
| Map | `js/map-core.js`, `js/map-markers.js`, `js/map-labels.js`, `js/map-census.js`, `js/map-analysis.js`, `js/area-select.js`, `js/measure.js` | Leaflet base, markers, labels, census outlines, capacity layer, lasso select |
| Analysis tabs | `js/overview-tab.js`, `js/growth-ui.js` + `js/growth.js`, `js/water-tab.js`, `js/svc-tab.js` + `js/svc-data.js` + `js/svc-plants.js`, `js/dca-tab.js` + `js/dc-infra.js` + `js/dc-cost.js`, `js/developments-tab.js` + `js/render-list.js`, `js/data-tab.js`, `js/census-view.js`, `js/demand.js` + `js/demand-ui.js`, `js/employment.js`, `js/masterplan.js`, `js/plan-areas.js` + `js/areas.js` | The six analysis tabs, demand criteria, census growth, DC data |
| Development drill-down | `js/dev-detail.js`, `js/dev-nav.js`, `js/dev-verdict.js`, `js/devscope.js`, `js/devtab.js`, `js/brief.js`, `js/fsr.js`, `js/aerial.js` + `js/aerial-check.js`, `js/site-context.js` | Open-site views, council-decision summaries, FSR links, aerial build check |
| Servicing network | `js/sewer-trace.js`, `js/sewer-cap.js`, `js/sewer-profile.js`, `js/water-trace.js`, `js/tightpipes.js`, `js/upstream.js`, `js/exist-pipes.js` | Sewer/water traces, pipe capacity model, profiles, existing-mains layers |
| Tools | `js/tools.js` + `js/tools-{batch,compare,corridor,fit,inquiry,inspect,upgrade}.js` | The tool rail and tool result views |
| Exports & reports | `js/exports.js`, `js/export-workbook.js`, `js/export-comparison.js`, `js/reports.js` | CSV/GeoJSON/Excel/PDFs, memos, SWMM |
| Provenance & audit | `js/provenance.js`, `js/audit.js`, `js/arcgis.js`, `js/design.js` | Source links, duplicate check, ArcGIS queries, design tokens |
| Offline | `sw.js`, `js/offline.js`, `manifest.webmanifest` | Service worker, install metadata |

`tests/` holds the 350 unit tests (`npm test`). `scripts/` holds the data builders (below).
`PR_PHASE0.md` … `PR_PHASE5.md` are the build history; the in-app change log lives in
`data/changelog.json` (built by `scripts/build-changelog.js` from git history).

## Data pipeline

The weekly snapshot is the only thing the app reads at startup:

```sh
npm run snapshot        # node scripts/build-snapshot.js --out data
```

It pulls every configured source (`js/config.js`) plus the development / permit datasets
found on the municipalities' open-data hubs, and writes:

- `data/snapshot.json` — every record (applications + new-build permits), compact-encoded.
- `data/snapshot-index.json` — one compact object per **project** carrying only what first
  paint needs (position, phase, units, filters, search text). The app fetches this first so
  the map paints fast, then loads the full snapshot in the background;
  `js/snapshot-index.js` hydrates the entries back into project objects.
- `data/history.json` — each project's phase, recorded on every run, so phase changes are
  kept even though the sources only publish current status.

A source that fails keeps last week's records (marked stale); the run exits non-zero only if
every source fails.

Topic builders (most run in the weekly job; the rest are one-off or on demand):

| Script | Builds |
|---|---|
| `scripts/build-areas.js` | `data/areas.json`, `data/das.json` (secondary plans, census DAs) |
| `scripts/build-servicing.js` | `data/servicing.json` (pressure zones, traced drainage areas) |
| `scripts/build-sewer-capacity.js` | `data/sewers.json` (pipe capacity model) |
| `scripts/build-blocks.js` | `data/blocks.json` (40 wastewater blocks, I&I sewersheds) |
| `scripts/build-dc-infra.py` | `data/dc-infra.json` (2026 DC capital maps: mains, facilities) |
| `scripts/build-watermains.js` | `data/watermains.json` (Region watermains, for the water trace) |
| `scripts/build-svc-census.js` | `data/svc-census.json` (census population by servicing area) |
| `scripts/build-water-facilities.py` | `data/water-facilities.json` (existing water facilities) |
| `scripts/build-water-supply.js` | `data/water-supply.json` (large mains into pressure zones) |
| `scripts/build-council.js` | `data/council.json` (eSCRIBE agendas/minutes, loaded per development) |
| `scripts/build-fsr.js` | `data/fsr.json` (Functional Servicing Report links) |
| `scripts/build-changelog.js` | `data/changelog.json` (releases from git history) |
| `scripts/build-idf.js`, `build-housing.py`, `build-compliance.py`, `build-dc-costs.py` | IDF storms, housing targets / projections, effluent compliance, DC costs |
| `scripts/audit-snapshot.js` | Audits the snapshot (unit reconciliation, integrity checks) |

`data/peel-reports.json` holds figures read from the Region's 2025 annual reports and the
2020 Master Plan (with page numbers), used by the model checks. The **Probe data sources**
workflow (`.github/workflows/probe-sources.yml`, run manually) dry-runs fetches and maps
statuses before the real build.

## Developing

```sh
npm start        # serve on http://localhost:8080
npm test         # 350 tests (node --test tests/*.test.js)
npm run snapshot # rebuild data/snapshot.json + data/snapshot-index.json
```

- **Offline:** `js/offline.js` registers `sw.js`. The app shell (HTML, CSS, JS, icons,
  manifest) is precached under a versioned cache name; `data/*.json` uses
  stale-while-revalidate — instant from cache, refreshed silently when online. After one
  visit the app opens fully offline from the last successful load.
- **Cache-busting:** every script/CSS URL carries `?v=__BUILD__`, which the deploy workflow
  replaces with the build stamp, so a release never serves stale JS.
- Dark mode is the default (Settings → Display: Dark / Light / Follow device); report and
  print output always render light.

## Deployment

GitHub Pages, via `.github/workflows/site.yml`:

- Push to `main` redeploys the site.
- The Monday scheduled run (and manual runs) refreshes the data snapshot, commits it, runs
  the audit (`scripts/audit-snapshot.js`) and the changelog build, stamps `__BUILD__`, and
  redeploys.

The repository was renamed from `Fsr-reviewer` to **`peel-growth-pipeline`**. The live site
is <https://jaredacostar-cmd.github.io/peel-growth-pipeline/>. Old URLs under
`/Fsr-reviewer/` (including deep and share links) keep working: `404.html` redirects them to
the matching path under `/peel-growth-pipeline/`.

## Data sources

| Municipality | Source | Kind |
|---|---|---|
| Mississauga | Development applications (monthly `DevApps_*` layer) | Applications |
| Mississauga | Growth Management – active development applications | Applications |
| Mississauga | Site plan applications (with units by dwelling type) | Applications |
| Mississauga | Issued building permits (since 2018, with status and completion date) | Permits |
| Mississauga | Growth Management – issued permits adding units or floor area | Permits |
| Brampton | OPA / ZBA / plans of subdivision, site plans, condos, development permits | Applications |
| Brampton | Pre-consultation (always Inception; units not counted) | Applications |
| Brampton | Building permits (`maps1.brampton.ca`, with dwelling counts) | Permits |
| Caledon | Development applications (with units by dwelling type) | Applications |
| Caledon | AMANDA building permits (units created) | Permits |

Brampton's planning files don't publish a unit count; the app reads it from the proposal
text ("312 residential units"). Every query is clipped to the Peel bounding box. Coverage
depends on what each municipality publishes — Mississauga publishes the most; Caledon's
development-applications layer is described as possibly incomplete; some Brampton datasets
update irregularly. Phases are inferred from status wording and dates, which differ between
municipalities — open the source record in the project panel to check a specific project.

## Population and demand criteria (`js/demand.js`)

Every value is editable in the app (Scenario control in the top bar); edits are kept in the
browser. Planning-level estimates, not a substitute for a functional servicing report.

| Parameter | Default | Source |
|---|---|---|
| Persons per unit: single / semi | 4.2 | Peel Linear Wastewater Standards, Table 2-2 |
| Persons per unit: townhouse | 3.4 | same |
| Persons per unit: apartment | 3.1, or 2.7 above 475 persons/ha | same standard |
| Persons per unit: type not stated | 2.7 | assumption: most unit-bearing projects are apartments |
| Water, average day | 270 L/cap/day | Peel Water and Wastewater Modelling Demand Table (v2.0, Aug 2024) |
| Water, max day / peak hour | ×1.8 / ×3.0 | same |
| Wastewater, residential | 290 L/cap/day | Peel Linear Wastewater Standards (2023) s. 2.2 |
| Wastewater peaking | Harmon, M = 1 + 14 / (4 + √P), P in thousands, 2.0–4.0 | Peel Linear Wastewater Standards s. 2.4 |
| Employment water | 250 L/employee/day, max day ×1.4, peak hour ×3.0 | Peel Modelling Demand Table (Aug 2024), ICI |
| Employment wastewater | 270 L/employee/day; Harmon on employees, 2–4; I&I 0.26 L/s/ha | same, site-plan applications |
| I&I (infiltration and inflow) | 0.26 L/s per ha of gross site area | editable; **Peak wet weather = Harmon dry-weather peak + I&I** |

Dwelling type is taken from a published unit-mix column when the dataset has one, otherwise
guessed from the project's type and description. Employment jobs are estimated from the floor
areas stated on applications (industrial 110 m²/job, office 25, retail 45, hotel 60,
institutional 50) × 250 / 270 L/employee/day water / wastewater; these are editable under
Breakdown & criteria → Employment floor space.
