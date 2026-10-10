# Peel Development Tracker

A map of every development in Peel Region (Mississauga, Brampton, Caledon), following each
site from application to completion.

It pulls planning applications and building permits live from the municipalities' public ArcGIS
open-data services. Files on the same site are linked into one **project**, and each project is
placed in a construction phase:

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
Approved** (freehold houses go from registration straight to building permits). An approved zoning,
official plan, draft subdivision or condominium file keeps the site under review (shown as *Zoning approved · site
plan pending*); a site plan approved before a newer rezoning that is still in review was for an
earlier proposal and does not count; Brampton's legacy site plans (status "Transferred", carried
over from its old system, mostly 1980s–1990s, no dates) don't count for a current proposal, and a
site with only legacy files is shown as completed. Demolition permits (HOUSDEMO / DEMO) clear a site
and don't set its phase or start a redevelopment cycle.

**Building permits must be for the site's buildings.** A permit sets the site's phase only when it
adds units, is a new dwelling building whose unit count isn't published, or is a new
non-residential building. Site servicing and shoring permits stay on the site (useful for
servicing) but don't set its phase; signs, below-grade entrances, doors, windows, equipment, sales
pavilions, temporary structures and additions don't count, and a site made only of those is not
shown as a development (the audit reports them as set aside). Minor / limited / express site plans
(a patio, a revision) don't approve the building, and a Brampton site plan that only reads
"Closed" (no approval date) counts as approved only when a building permit was issued after it.

**Building permits follow the planning approval.** A permit issued well before the site's first
site plan / subdivision / zoning file (completed more than a year before it, or issued more than 3
years before it) was for what stood there before: it doesn't set the phase or count toward the
build-out. A permit issued shortly before the earliest file in the open data still counts and is
flagged (an earlier phase whose site plan isn't published; Mississauga's "PDOX TRANSFER FILE"
site plans are dated by their original file number). Alterations count units only when they
create one (a second suite); a second suite is new homes, but not a site plan building, so it
doesn't set a site plan's phase. A change to these rules is recorded in
`data/history.json` as a re-read (marked `rules`), not as a phase change on the ground.

## Run it

It's a static site with no build step:

```sh
npm start            # serves on http://localhost:8080
```

Any static host works, for example GitHub Pages. You can also open `index.html` straight from
disk. The data is fetched by your browser, so you need internet access.

## On iPhone / iPad

The app runs in Safari. It needs to be served from a web address, because opening the file
from the iPhone's Files app won't work. Any one of these options does it:

1. **Netlify Drop (easiest, free, about 2 minutes).** On a computer, download this branch as a
   ZIP and unzip it. Go to <https://app.netlify.com/drop> and drag the folder onto the page.
   You get an `https://….netlify.app` link; open it in Safari on the iPhone.
2. **GitHub Pages.** This works for public repositories; private repositories need a paid
   GitHub plan. In the repository, go to Settings → Pages and set Source to **GitHub Actions**.
   The included workflow then deploys the site and keeps it updated weekly (see "Weekly
   automatic update" below). The site appears at `https://<user>.github.io/<repo>/`.
3. **Same Wi-Fi, no hosting.** On a computer, run `npm start`, then open
   `http://<computer's IP address>:8080` on the iPhone. This works only while the computer is
   on and on the same network.

To use it like an app, tap **Share → Add to Home Screen** in Safari. It opens full screen with
its own icon.

On a phone, the **List** button opens the filters and project list. Tap the legend to show
the phase names. **Hide** folds the bottom panel to its tabs (tap a tab to open it again), and
the ▾ on the timeline folds it to just the year range (it starts folded on phones).

**Bottom panel:** three tabs, so only one thing shows at a time (the last one picked is
remembered; **Servicing demand** opens by default): **Servicing demand**, **Growth since
2021**, and **Breakdown & criteria** (by
dwelling type and phase, plus the editable design criteria).

## Using it

The sidebar has three tabs.

**What is this?** Rest the pointer on a heading, figure or control for 3 seconds (on a phone,
press and hold) for a card explaining what it represents and where the data comes from
(`js/info.js`).

**Explore**
- **Quick views by phase:** All, Active pipeline (not completed or withdrawn), or one phase
  (Inception, Under review, Approved, Permit issued, Under construction, Completed, Withdrawn),
  each with its count. Tap a selected phase again to go back to All. The bar above shows the
  mix of phases; tap a segment to isolate it.
- **Focus** (combines with the phase, tap again to turn off; **Growth** is on by default, and **Reset all** returns to it):

  | Focus | Shows |
  |---|---|
  | Growth | Planning applications proposing new dwelling units or new jobs (non-residential floor area); used by the Water, Wastewater and DC views |
  | Committed capacity | Growth that is approved or permitted and not yet completed (switches the demand panel to committed) |
  | Left to build | Planned units with no building permit yet (switches the demand panel to left to build) |
  | Major (100+ units) | Projects with 100 or more units |
  | New in last 12 months | First filed in the last year |
  | Stalled 2+ years | In planning (no building permit) with no activity for 2 years |
  | Changed this week | New, or moved phase, in the latest weekly update |
- **Search** by address, file number or description.
- **Municipality** buttons: All, Brampton, Caledon, Mississauga.
- **Secondary plans** (tick one or several; type to find a plan) and **MTSA** (one) drop-downs,
  right after Municipality, keep only projects inside the chosen areas and outline them on the map;
  the census panel adds the chosen plans together. Secondary plans: Brampton Plan Schedule 10 and
  Caledon's in-effect Secondary Plan Areas; Mississauga has no secondary plans, so its Official
  Plan Character Areas are listed. MTSAs: the Region of Peel delineation (published by
  Mississauga) and Brampton Plan Schedule 1A/1B primary and planned MTSAs. A project is in an
  area when its location falls inside it.
- **Record type:** by default only **planning applications and the building permits that belong
  to them** (permits with no application, such as infill houses, are hidden; choose *All records*
  to see them). Also building permits only, or sites with both. **Units**
  (adds units, 10+ … 500+).
- **New buildings only** hides alterations, signs, pools and similar permits.
- **Active filters** appear as chips. Tap a chip's × to remove that filter, or use **Reset
  all**.

**This week:** projects that are new, or that changed phase, since the previous weekly update.

**Data:** the source list, **Refresh live**, and an **Advanced** section for adding sources.

**Map**
- **Background:** the latest city aerials are the default: City of Mississauga 2024, City of
  Brampton fall 2025 and Town of Caledon 2025 (from zoom 12), over Esri World Imagery, with road
  and place-name overlays. The picker at the top right switches to plain aerial, Esri World
  Imagery or a street map.
- **Labels:** from zoom level 14, every point not inside a cluster gets a label. Choose what it
  shows: address and phase, address only, file or permit number, units, or off. The largest
  projects are labelled first, and a label is left out if it would overlap another.
- **Clusters** show how many projects they hold. The ring around each cluster shows the mix of
  phases.
- **Subdivisions up close:** at street zoom, or when you select a project, its application
  boundary appears with every building permit inside it as its own dot. Tap anywhere inside a
  boundary to open that application (a site plan or condo nested in a larger development opens on
  its own, with a link to the whole project). Tap a dot to see that
  permit and the **planning application it belongs to** (file number, type, status, planned
  units). **Open whole project** shows the build-out for the whole subdivision.
- **Project panel:** shows the build-out as steps (planned → permitted → completed, then
  left to build), the project's **servicing demand** (population, water average / max day /
  peak hour, wastewater average / Harmon peak, for the total, completed and remaining units), a phase
  stepper, the weekly phase history and the dated timeline, grouped by date (same-day events on several files show once, with a count and the file numbers). Every source record has **Show on
  map**. On phones, the panel opens as a bottom sheet so the selected point stays visible.

**Timeline (floating, bottom left of the map):** opens on **2021–2026**. Drag the handles to keep only projects with
activity in those years; the button next to the range switches between **All years** and the
2021–2026 default (**Reset all** also returns to 2021–2026).
The dropdown picks which milestone must fall in the range. Click a bar to isolate one year, and
shift-click to extend the range.

**Census baseline follows the timeline:** the Growth tab, an area selection and the census-area
outlines use the latest census held in or before the timeline's first year: **2021–2026 → 2021
Census** (11 May 2021), **2016–2020 starts → 2016 Census** (10 May 2016). Planning application
data starts in 2016, so 2016 is the earliest baseline; an earlier start (or All years) also uses
2016. "Built since" then counts permits completed since that census day. The 2016 counts come
from the *Immigration in Peel by DA as of 2016* layer (2016 dissemination areas, total population
and private dwellings) and match the published totals (Peel 1,381,739; Mississauga 721,599;
Brampton 593,638; Caledon 66,502). Statistics Canada's own download site blocks automated
access, so it can't be used directly.

**Selected project → its census area:** opening a project narrows the bottom panel to the
census dissemination area (DA) its point falls in, for the baseline census year (outlined on the
map). **Growth** shows that DA's census population and dwellings, then built / approved /
proposed growth from every development application located in the same DA. **Servicing
demand** adds up the shown projects (phase, focus and filters) in that DA. The DA pill (×), or
closing the project, goes back to all of Peel (or the selected municipality / plan / MTSA).

**Growth since the census (bottom panel, Growth since 2021 / 2016 tab):** for Peel, the selected municipality,
secondary plan or MTSA:

| Tile | Meaning |
|---|---|
| 2021 Census | Population and private dwellings (Statistics Canada, by dissemination area). For a secondary plan or MTSA, each DA counts by the share of its land inside the area. |
| + Built since | Plus units on building permits completed since census day (11 May 2021), at Peel persons-per-unit. Brampton and Caledon publish no completion date, so it is estimated as issue date + 12 months (houses) or + 30 months (20+ units). |
| + Approved or permitted, not yet built | Plus committed growth (site plan approved, building permit issued or under construction, not yet completed). |

| + Proposed (full build-out) | Plus growth on applications still in pre-consultation or review: the full build-out of the planning applications. |

Each growth tile also gives the jobs added on development sites (from the floor area the
applications state; existing jobs are not in the census), and a third bar shows jobs.

Two stacked bars (people, dwellings) show the 2021 baseline (grey), built since (green),
approved (blue) and proposed (hatched blue) up to full build-out; hover or tap a segment for
its value.

Peel's small geographic unit (SGU) forecasts are not published as open data (only Caledon's are),
so the census baseline uses dissemination areas. `data/areas.json` is rebuilt weekly
(`scripts/build-areas.js`).

**Population & servicing demand (bottom panel, Servicing demand tab):** dwelling units,
population and jobs, then a **Water** table and a **Wastewater** table with residential,
employment and total rows (L/s: average / max day / peak hour; average dry / peak dry / I&I /
peak wet). Population, water and wastewater are estimated
from the units in the projects shown. **The selection is the sidebar's:** the header shows the
phase, the focus, the years and any other filter, with **Change** jumping to the selectors; there
is no separate selector in the panel. Each project counts all its units, except under the
**Committed capacity** focus (approved or permitted units not yet completed) and the **Left to
build** focus (planned units with no permit yet). Open **Breakdown & criteria** to edit the
criteria.

**Scale, north arrow and boundaries:** a metric scale bar and a north arrow sit under the zoom
and select tools; the arrow always points to true north (turned 44° on the road grid), and
tapping it switches between road grid and north up. From street zoom (14) every shown project's
planning application boundaries are drawn in its phase colour with a light fill; tap one for its
application.

**Water pressure zones and wastewater drainage areas** (`data/servicing.json`, built by
`scripts/build-servicing.js`; Probe data sources mode `servicing-build` rebuilds it):
- **Pressure zones:** the Region of Peel's 24 published water pressure zones.
- **Drainage areas:** traced from the Region's sanitary sewer network, since the 2020 Water and
  Wastewater Master Plan polygons are not published as data. Every pipe (manhole to manhole,
  through pumping stations) is followed downstream to Lakeview (G.E. Booth), Clarkson or
  Inglewood WRRF; at a split the larger pipe is followed; small gaps in the published network
  are bridged to the nearest pipe. The Malton area by Pearson airport drains to the City of
  Toronto: its 1,200 mm trunk crosses the boundary at Hwy 427 near Derry Road, 3.7 km from the
  nearest sewer reaching a Peel plant (`UNTRACED=15 node scripts/build-servicing.js --raw …`
  lists where untraced sewers end). Pumping stations take the names in the Region's 2025
  Wastewater Collection System report. Areas split at pumping stations and where a tributary of 2,500+ manholes joins a
  larger trunk (36 areas; 96.9% of 57,512 manholes reach a Peel plant). Plant split reviewed.
- Each development is tagged by its location point. The map panel's **Areas** fold toggles both
  layers and has the Pressure zone and Wastewater block filters; the development panel shows its
  zone and block.
- **Bottom panel tabs:** **Growth & demand** (demand of the shown developments, then growth
  since the census), **Water**, **Wastewater** (two views: *Plants & capacity* and *Catchments*)
  and **Criteria & references**. Every servicing table opens with a stamp of the criteria it uses
  and the data dates, with a **Modified criteria** badge when the criteria have been edited; method
  notes fold under *Method & notes*. Wastewater has two modes: **Capacity check** (default;
  calibrated to the 2025 reported flows, the basis for capacity statements) and **Design flows**
  (Peel criteria, for sizing), and a *Details* switch (Engineering shows the Harmon factor and
  drainage areas). Plants carry the names in Peel's reports (G.E. Booth WRRF (Lakeview), Clarkson
  WRRF, Inglewood WWTP). Population is rounded to the nearest 100 above 10,000 and the nearest 10
  above 1,000.
- **Share link** (top of the sidebar): copies a link to the exact view — phases, focus, filters
  (municipality, plans, MTSA, pressure zone, drainage area, units, years), the bottom-panel tab
  and wastewater view, the mode / max-day / diversion switches, the map position and the open
  development. The address bar keeps the same link as you work (`#…` parameters).
- **Export** (*PDF / print* and *Excel* buttons on the Growth & demand, Water, Plants and
  Catchments views, the development panel and a lasso selection): the PDF option opens a printable
  report of what is on screen (with the mode, switches, filters, data dates, the criteria table
  with edits highlighted, and references) and starts the print dialog; Excel writes a workbook
  with a Summary sheet, one sheet per table (numbers as numbers, units in the headers, second
  lines such as population as extra columns) and a Criteria sheet. SheetJS (cdnjs) loads only when
  Excel is clicked. Per-file record tables are left to *Export CSV*.
- **Default view**: the map opens on the active development applications (application to
  construction, any year) over the background. On desktop the analysis panel opens on
  **Overview**; on phones it starts folded (*Analysis* opens it). Map tools (trace a sewer path,
  select an area, measure, test a site) sit under one Tools button, and are also buttons on the
  Overview; the north arrow stays on the map (tap it to switch between road grid and north up).
  The sidebar has search, a "Showing …" line, Phase and one *More filters* fold (focus, record type).
- **Executive briefing (PDF)** (Overview, top right): one printable Letter page for management —
  title block with the date, *Prepared by* (set it in Settings & sources) and the data date; the
  headline sentences; growth and demand tiles; servicing demand by phase; the plants' and South
  Peel water treatment's share of the 90% expansion trigger; room after servicing allocations; a
  map of the wastewater blocks with the larger developments and the plants; the DC projects to
  bring forward and those most growth relies on; the criteria and the app version in the footer.
- **Plain-language headlines**: one sentence at the top of each tab, written from the numbers
  (e.g. which plant reaches its trigger first, which zone adds the most, how many pumping stations
  exceed firm capacity, which DC projects come too late).
- **Servicing allocations**: record a development's allocation (units, date, reference) in its
  Servicing tab; Wastewater → *Allocations* lists them and gives each plant's room at the 90%
  trigger after existing + approved development and after allocations made ahead of approval (also
  on the Overview). Kept in the browser; CSV export / import to share one list.
- **Data freshness and model checks** (Settings & sources): every source with its date, update
  interval and status (current / due for a refresh / out of date / reference / live), summarised on
  the Overview; and the model against published figures — 2021 Census population for Peel and each
  municipality, the share on municipal sewers, population today against the annual report's
  population served, and the plants' and South Peel water's design-criteria flows against the 2025
  measured averages (±10% matches, ±25% close; each row explains an expected difference).
- **Number conventions**: people and jobs are rounded the same way everywhere (whole under 1,000,
  nearest 10 to 10,000, nearest 100 above); units are exact counts; L/s for pipes, stations and
  single developments, ML/d for plants, zones and totals; ≈ marks a screening estimate.
- **Bottom panel tabs**: **Overview** (the headline numbers on one screen: developments, units,
  people, jobs, water max day and wastewater peak wet; the plants' and South Peel water treatment's
  capacity against the 90% expansion trigger, committed and at build-out; the servicing demand by
  phase; the DC projects that come online too late and those most growth relies on; the tools —
  each card links to its tab), **Demand** (flows of the shown developments, then the *servicing
  demand breakdown* by phase, by dwelling type and build-out by type, then growth since the census),
  **Water**, **Wastewater** (plants / blocks), **DC Analysis** and **Settings & sources** (the
  editable criteria and the references). Each tab's criteria and data sources fold to one line
  (ⓘ Criteria & data); the scenario line sits once at the top. Tables open in **Simple** columns
  (the build-out flows and peaks); **Engineering** adds the layer-by-layer and local / upstream
  columns.
- **Map layout**: top right, the view switch (Planning / Water / Wastewater / DC) over **Layers**:
  one switch per layer — Developments, Wastewater blocks, Pressure zones, Capacity colours,
  Existing pipes, Planned DC works, Planning areas, Census areas — then the municipality, *Wastewater
  loads* (Wastewater view), *Filter by area* (secondary plan, MTSA, pressure zone, block) and *More
  settings* (saved views, development colour / size / labels, capacity shading, existing pipe kinds
  and size labels, DC works by system, planning area kinds, base map). The views set the switches;
  changes are remembered per view. With the blocks as the catchments there is one wastewater area
  layer (Wastewater blocks), so it can always be switched off. Bottom right, one box: the Demand
  year over the legend. When a setting hides the developments (switched off, no growth load on in
  the Wastewater view, or Hidden while a path is shown) a notice above Layers says why, with *Show
  developments*; an area filter is always named there too, with *Clear*. The legend box takes the
  height the panel leaves free, so the two never overlap. Planning area outlines: tap one on the
  map to filter to it, tap again to clear.
  The development panel has three tabs: Overview, Servicing and
  History & records. **Servicing** opens with *Trace the sewer path to the plant*, then a **Water**
  section (demand and pressure zone, watermains nearby, fire flow, planned water works, water DC
  needs), a **Wastewater** section (flows; the blocks to the plant, the tightest pipes with their
  freeboard and pumping stations; plant reserve; sanitary sewers nearby with the path's age / risk;
  planned wastewater works; wastewater DC needs) and **Site** (ground, storm sewers, stormwater
  ponds), with *Flows by stage and sewer path* below. The trace is also under Tools → *Trace sewer
  path* (tap a development, or any point on the map) and on the → plant chip at the top of a
  development. History & records opens with *How the phase
  was set*: the file behind the phase, approvals by stage with the latest submission in each, and
  flags where the status and the submissions disagree (a newer submission in review after an
  earlier approval, permits issued while planning is in review, a bare "Closed" read as approved,
  an OLT appeal, a demolition permit, a redevelopment cycle), plus each file's status and how it
  was read.
- **Watchlist, saved views, tips**: ☆ Watch on a development adds it to *Your watchlist* (This
  week tab, changed-this-week first) and the ★ Watched focus. *Saved views* (Layers & style) keeps
  named filters + map position + view + layers in the browser. An 11-step tour shows once. *Help*
  (header), the **?** button on the map (under the north arrow) or Tools → *Help & tips* opens task guides — servicing check for a development, when DC
  projects are needed, area / secondary plan reports, testing a site, weekly changes, plant and
  pumping station capacity over time, water by pressure zone, existing mains and ground, saving /
  sharing / exporting, and how far to trust the numbers — each with *Show me*, which sets the map
  up for the task; plus quick tips and the tour again.
- **Reports**: *Memo* on a development opens a one-page servicing memo (proposal, status, flows,
  sewer path, plant reserve, DC needs, planned works, live site context, a map sketch of sewers by
  load and DC works) to print or save as PDF. *Area report* (a drawn selection, or *Report* on the
  Showing line for what is shown) gives combined demand, the capacity relied on with the DC timing,
  and the largest developments. DC timing → *Excel (all rows)* exports every constraint.
- **Search places**: the search also finds secondary plans / character areas, MTSAs, pressure zones,
  catchments and pumping stations, DC projects (by number or name) and DC facilities, file numbers
  by prefix, and intersections ("Main St & Queen St").
- **Heatmap**: Layers & style → Show as → Heatmap (people + jobs at build-out of the shown
  developments). Clusters show their phase counts on hover.
- **Ground elevation** (AWS Terrain Tiles, Terrarium; CDEM / SRTM, no key): Tools → *Measure &
  ground profile* gives the ground at a point and a profile with fall / grade along a line; the
  development's Servicing tab shows the site's ground and the fall to its catchment outlet.
- **Selection colour**: the open development's application boundaries, and every development in a
  lasso selection, are outlined and filled in orange (a colour no phase uses).
- **Unselect**: tap an empty part of the map, press Esc, or use *Clear selection* (bottom of the map)
  to close the open panel (closing the drawn-area summary also removes the drawn areas; the lasso
  hint has a Cancel button) and clear the highlighted development, catchment / zone, drawn selection,
  address pin and highlighted mains; filters stay. In the Water and Wastewater tabs the tables scroll
  inside the panel with their column headers kept in view.
- **Map views**: *Planning* (aerial, addresses, markers by phase), *Water* (street map, pressure
  zones shaded by max day growth, markers by servicing layer sized by people + jobs, existing
  watermains, DC water works), *Wastewater* (drainage areas, sewer pipe capacity, existing sanitary
  sewers, DC wastewater works) and *DC* (markers by servicing timing, all DC works). Each view
  remembers its own settings. *Layers & style* is grouped into Developments, Capacity,
  Infrastructure (on / off chips for zones, catchments, existing pipes, DC works and the DC timing
  table) and Base map. Under *Layers & style*: marker colour (phase / servicing layer / receiving plant), size (same / people + jobs;
  clusters then total people + jobs) and a **capacity layer** — catchment flow growth over the
  census, pumping station build-out peak wet weather flow as % of firm capacity (green / amber /
  red), or pressure zone max day growth — with the sewer network drawn outlet to outlet. A legend
  explains what is shown.
- **What loads this?**: tap a catchment, pumping station, pressure zone or plant (on the map or in
  the Water / Wastewater tables) for the developments adding flow since the census through it,
  largest first, with built / approved / proposed totals; open one and come back to the list.
- **Scenario bar** (bottom panel): wastewater mode, water max day factor, the diversion,
  outside-area assignment and modified criteria in one place, summarised on every tab, the map
  legend, exports and share links (map style is in the link too).
- **Compare scenarios**: in the Scenario bar, *Pin this scenario as A*, change the switches, and
  see plant existing + approved and build-out % (A, now, Δ), pumping stations over firm capacity
  and total water max day side by side.
- **Linked map and tables**: hovering a zone / catchment row outlines it on the map, hovering an
  area highlights its row; *Only areas in map view* limits the rows to what is on screen.
- **GIS export** (Explore → Export): developments as CSV / GeoJSON now carry servicing layer,
  build-out people and jobs, flows in L/s, pressure zone, catchment and plant (with the distance
  when assigned to the nearest); *Servicing areas (GeoJSON)* gives zones and catchments with census
  and build-out flows and pumping station load. *Print map* prints the map landscape with a title
  block, scenario, legend, north arrow and scale.
- **Map tools** (left of the map): *Measure* distances and select every shown development within
  250 m – 2 km of a point; *Test a site* drops a proposed development (units by type, jobs, site
  area) and gives its servicing check — zone, sewer path and pumping station load, plant reserve —
  and can count it in the totals (kept in this browser, draggable). While any exist, a bar at the
  bottom of the map shows *N test sites* (tap for the list, each with *Remove*) and *Remove all*,
  with *Undo* for a few seconds after; each test site's panel has *Remove this test site* at the top.
- **Wastewater blocks** (Layers & style → Infrastructure): the Region of Peel's 40 sewersheds for its
  inflow & infiltration program (`data/blocks.json`, from its *Block_view* feature service; the blocks
  of "Dragonfly: An Integrated Approach to Resiliency", F. Salehzadeh, WEFTEC 2024), with the blocks
  prioritised for a block study highlighted; each block's number sits at a point inside it (`lp`), in
  the marker pane so it stays on its block when the map is turned to the road grid. Tap a block for its outlets on the existing sewers (main
  outlet with capacity and people upstream), the blocks it drains into down to the plant and the
  distance along the pipes, the blocks upstream and the growth inside it; arrows on the map follow the
  sewers to the plant. Rebuild with `node scripts/build-blocks.js` (or the `dragonfly` probe mode).
- **Flow arrows follow the pipes**: a selected catchment's (and block's) arrows to the treatment plant
  run along the Region's sanitary mains (`data/sewers.json`), not straight outlet-to-outlet lines.
- **Pipe depths in the ground profile** (Measure): the Region's sanitary sewer inverts along the line
  (nearest main within 12 m), with depth to invert = ground − invert (approximate: terrain tiles are
  ±1–2 m); watermains within 8 m are drawn at Peel's 1.7 m minimum cover, labelled assumed, since the
  Region publishes no watermain depth.
- **Data quality colours**: outside every area, assigned to the nearest, no units / floor area,
  site area estimated, complete.
- **Demand year** (on the map, at the top of the legend box, whenever a capacity layer is on): the year the
  map's results are worked out for. It opens on the current year (the census + built since, with
  approved and proposed growth phased in as set in Horizon years) and slides to build-out, so
  catchments, pumping stations and pipes change colour as growth arrives; the pipe and station
  panels and a development's tightest pipes follow it.
- **Results stay visible zoomed in**: the live existing pipes (from zoom 15) draw under the sewer
  screen's capacity colours, and from zoom 16 each pipe is labelled with its capacity used (with
  its size when Size labels is on).
- **Tapping a pipe works with nothing selected**: the canvas the development dots are drawn on no
  longer swallows taps meant for the pipes and areas below it; a tap or hover it doesn't hit is
  handed to the canvases underneath (pipes, catchments, census areas).
- **DC Analysis** (bottom panel tab): every 2026 DC project that relieves a capacity constraint
  (sanitary sewer groups, pumping stations, the plants, water treatment and supply into the upper
  zones) or serves developments outside the existing network, replayed year by year with growth
  phased as in Horizon years. **Diversion:** from each project's construction year, flow above
  the existing capacity goes to the project, up to the capacity it adds (a main along an existing
  sewer at Manning full-pipe capacity for its diameter on the existing slope, a twin when the size
  isn't mapped; a plant expansion at its published step; other facilities taken as sized for
  build-out). **Cancelled:** the same without that one project; the growth held back is given in
  people (each constraint's own rate) and units (the approved and proposed developments' average
  persons per unit) at the chosen year and at build-out; developments that would connect to a new
  main count in full. **Recommendations:** Keep · advance (online after the capacity runs out),
  Keep, Keep · could defer (nothing held back until 5+ years after it is due), Review (nothing
  held back by build-out in this screen); the five largest impacts are listed first. Tap a row
  for each constraint's timeline (demand, capacity with and without, flow diverted to it) and
  *Show on the map*; CSV export with the impact by year. A screen to rank and question projects:
  condition, I&I reduction, servicing beyond today's applications and cost are not in it.
- **Freeboard**: each pipe's flow depth and freeboard (D − y) from Manning part-full flow in a
  circular pipe, y / D from Q / Q_full (e.g. 85% of capacity ≈ 0.71 D deep); in the pipe tooltip,
  the pipe panel and its *How the flow is calculated* table, and on a development's tightest pipes.
  Over 100% the pipe runs full: no freeboard, with the rise above the crown shown instead.
- Census area outlines are now off by default (turn on under Layers & style).
- **Planned works (2026 DC capital maps, draft)**: `data/dc-infra.json`, built by
  `scripts/build-dc-infra.py` from the Region's water and wastewater Development Charges capital
  maps (geospatial PDFs fetched by the probe workflow, `mode=dc-maps`). Proposed (2027–2051) and
  approved (2026) mains with construction year, component and project numbers and diameter, inset
  maps placed through their extent boxes and georeferenced from the PDF (a few metres); facility
  schedules (EA / property / design / construction) transcribed in `scripts/dc-facilities.json`;
  route descriptions joined from the 2020 DC Background Study by component number. Used for:
  - a **Planned works** map layer (water, wastewater or both; tap a facility for its schedule;
    works after the Demand year are faded);
  - the development brief: the planned main it would connect to, trunks and facilities on its sewer
    path / in its pressure zone, plant capacity steps, and a **timing flag** when a committed
    development outside the existing network relies on a main not built until later; a marker
    colour *Servicing timing (2026 DC)*;
  - **greenfield connection**: a development outside the traced network takes the catchment / zone
    of the planned main it would connect to (within 1 km) before the nearest-area rule;
  - **plant expansions** in Horizon years: G.E. Booth +40 ML/d by 2028 (council-approved February
    2024) and 600 ML/d after the 2036 construction, Clarkson 500 ML/d after the 2026–2028
    construction; the years are editable and the expansions can be switched off;
  - *What loads this?* lists the planned works for the catchment / zone / plant; *Planned works
    (GeoJSON)* exports them.
- **Address search**: the search box suggests matching developments and street addresses (Esri
  World Geocoder, falling back to OpenStreetMap Nominatim, limited to Peel); picking one, or
  pressing Enter, pans and zooms the map there (a development also opens; an address gets a pin).
- Street basemaps are Esri's light grey canvas and World Street Map (no API key).
- **Sewer pipe capacity screen**: `data/sewers.json`, built by `scripts/build-sewer-capacity.js`
  from the Region's sanitary mains (diameter, slope, inverts, install year, risk rating;
  `scripts/fetch-linework-raw.js`, probe `mode=sewer-build`): every pipe of 300 mm or more with its
  Manning full-flow capacity (n 0.013) and the 2021 Census population and land draining through it
  (flow shared at splits by capacity; loops broken). In the app each development since the census
  joins the nearest of these pipes and its load is carried down the network: existing load at
  peak dry weather (scaled to the plant's measured flow in the capacity check), growth at design
  peak wet weather. Capacity layer *Sewer pipe capacity* (year slider aware), the development
  brief's local and downstream tightest pipe, and *What loads this* for a pipe. A screen, not a
  hydraulic model. Slopes published under 0.01% (six trunks, e.g. a 3048 mm main at 0.002%) are taken
  as data errors: no capacity, grey, left out of tightest-pipe checks. Colours give the flow state: **green** under 85% of full-pipe capacity (free
  flowing), **orange** 85–100% (near full), **red** over 100% (surcharged). Tapping a pipe shows
  *How the flow is calculated* with its numbers: existing people × rate ÷ 86,400 × Harmon × the
  plant calibration; growth residential + employment + I&I at design rates (phased to the slider
  year); Q; Manning capacity from diameter and slope; Q / Q<sub>full</sub>; and, when surcharged, the
  hydraulic gradient needed (S<sub>f</sub> = S × (Q / Q<sub>full</sub>)²) and how far the water level rises
  above the crown over that pipe. The calculation is a results table (today and the slider year:
  existing, growth residential / employment / I&I, Q, capacity, % used, state, surcharge); each row's
  ⓘ opens its formula with that pipe's numbers.
- **Trace a development to the plant** (development → Servicing → *Trace the path to the plant on the
  map*): a dashed line from the site to the 300 mm+ sewer it joins, then every pipe to the treatment
  plant coloured by its capacity state with flow arrows, the pumping stations passed and the plant;
  the panel gives the length and number of pipes, the wastewater blocks passed and the tightest pipe
  (each a link). Also for test sites.
- **Developments on / off** (map panel, every view): hides or shows all development markers, labels and
  site outlines (remembered).
- **Wastewater loads** (map panel, Wastewater view): *Census (existing) · Built since · Site plan
  approved · Proposed (in review)*; each controls both the developments shown and the load put on the
  sewers (capacity colours, a pipe's flow table, the trace's tightest pipe). All on = full build-out
  conditions; the legend lists the loads when some are off.
- **Resizable bottom panels**: drag the analysis panel's top edge (or focus it and use the arrow keys)
  to give the map more or less room; on a phone, drag the info sheet's grip, or tap it to step
  30% → 50% → 62% → 92%. Heights are remembered.
- **Paths over developments**: flow paths (a development trace, a catchment's or block's route) draw
  above the development markers, and the markers fade while a path is shown; *Developments: Show ·
  Faded · Hidden* in the bottom bar picks how (remembered). The map fits the path into the part not
  covered by the panel.
- **Tap an existing sanitary sewer** (Existing → Sanitary): a 300 mm+ sewer opens the same pipe in the
  network screen, with every development draining through it and how its flow is calculated; a
  smaller local sewer (not traced) lists the developments within 100 m that likely connect to it and
  links to the nearest 300 mm+ sewer.
- **Existing pipes** (Layers & style): Region of Peel watermains and sanitary sewers, Mississauga /
  Brampton / Region storm sewers, loaded live by map area from zoom 15 (cached by ~1 km tile); tap
  for diameter, material, year, slope; *Size labels* labels each pipe (and the sewer capacity
  layer) with its diameter. The development's Servicing tab reports every existing main of each type
  within 100 / 200 / 400 m — size, material, year, the street it runs along (reverse geocoded:
  ArcGIS World, then OpenStreetMap) and distance, pieces of the same main merged; tap one to see it
  on the map — and the oldest / moderate-risk sanitary sewer on the site's path (first
  3 km, from `data/sewers.json`).
- **DC needs** (development brief, DC main / facility panels, *DC timing* in Layers & style):
  existing capacity against the 2026 DC capital program. For each constraint a development relies
  on — sanitary sewers on its path at 90%+ of full-pipe capacity by build-out (grouped by the DC
  main that runs along them, i.e. a twin or replacement), pumping stations (master plan firm
  capacity), the plant (90% of rated), the water treatment system (South Peel or Caledon wells,
  90% of rated max day), storage (master plan assessment) and the large mains into its pressure
  zone level (rough, 1.5 m/s; `data/water-supply.json` from `scripts/build-water-supply.js`) — the
  room after existing + approved development in people and units, the year approved and proposed
  growth uses it up (Horizon years phasing), and the relieving DC project. Red when it runs out
  before the DC project (or none is planned), orange "check the data" when the census flow alone
  exceeds the full-pipe capacity from the published slope. Tap a DC main or facility for what it
  relieves and the developments relying on it.
- **Fire flow and stormwater** (development brief, live): Region hydrants within 150 m (count,
  nearest, recorded pressure zone, flagged against the mapped zone) and the nearest large
  (750 mm+) watermain within 1.5 km — hydrant flow tests are not published; the nearest
  stormwater pond within 1 km (Brampton with design controls and risk grade, Caledon with
  assumption status; Mississauga publishes none) and the watershed / subwatershed.
- **Outside the mapped areas**: a development outside every pressure zone or traced drainage
  area is assigned to the nearest one within 5 km of its edge (greenfield lands beyond the existing
  network, gaps in the trace) and marked "nearest" in the panel and tables; the Water / Wastewater
  switch "Outside mapped areas: Leave out" restores the strict boundaries. Farther away it is left
  out (likely private well / septic).
- **Servicing check** (development panel): the whole development's flows at Peel design criteria
  (L/s as in an FSR, ML/d below), its pressure zone and share of the zone's build-out max day, the
  traced sewer path from its catchment to the plant with its share of the flow at each outlet, and
  what it means for the plant's uncommitted reserve (built / approved are already counted,
  proposed would draw on the reserve). Pumping station and trunk capacities aren't published by
  the Region, so only the plant is checked against capacity.
- **Water** and **Wastewater** tabs (bottom panel). Like the Growth tab, each row is split into
  the census baseline (year from the timeline), + built since census day, + approved and +
  proposed (in review), adding up to build-out, with a stacked bar of that split; growth from
  every development in the zone / catchment, other filters ignored. Flows are residential plus
  jobs on development sites (existing employment is not in the census baseline). Census
  population is shared out by **area overlap** (`data/svc-census.json`, built by
  `scripts/build-svc-census.js` from ~400 sample points per dissemination area; about 10% of
  people sit in a different area than with the DA centre point). Click a row to outline and zoom to it on the map
  (click again to clear).
  - **Water:** pressure zones in numerical order; maximum day in ML/d (people and jobs below each
    figure) and peak hour at build-out. The max day factor switches between Peel design (×1.8)
    and the factor observed at the South Peel plants in 2025 (×1.40). Below the table: 2025
    production reported by the Region (Arthur P. Kennedy and Lorne Park plants, the five Caledon
    groundwater systems) beside the model.
  - **Wastewater (ML/d):** the catchments are the Region's **40 wastewater blocks**
    (`data/blocks.json`, the sewersheds of its I&I program), building up block by block along the
    sewers to the plants on the lake. `scripts/build-blocks.js` gives each block its place in the
    flow from `data/sewers.json`: its main outlet (the pipe leaving it that carries the most
    people, `outletAt`, `trunkMm`), the block that outlet's pipes reach next (`into`, walking past
    pipes outside every block) and its plant; e.g. 26 → 25 → 24 → 22 → 16 → G.E. Booth. It also
    records how much of each block the sewers serve (`served`, `servedHa`: each pipe's own share
    of the people and land draining through it, summed): census people are by dissemination-area
    centre less the unserved share, I&I uses the sewered land, and developments in rural Block 40
    (mostly on septic) go to the nearest sewered block unless they sit by its own sewer. Without
    `data/blocks.json` the app falls back to the traced drainage areas of `data/servicing.json`
    (`downstream`, `outletAt`).
    Rows run from the top of each sewershed (furthest outlet first) down to the plant, whose last
    row is its total inflow; then a Peel total, with Malton (City of Toronto) listed separately.
    Each row shows where the flow comes from — **local** (the catchment's own build-out population
    and average flow) **+ upstream** (everything draining into it) — and what it is made of —
    census **+ built since + approved + proposed** — both adding up to the **total** average dry
    weather flow at its outlet; then **peak dry weather** (total average × Harmon M on the total
    population), **I&I** (0.26 L/s/ha on the whole traced drainage area to the outlet) and **peak
    wet weather** (peak dry + I&I). Clicking a block shades everything upstream and draws flow
    arrows along the pipes down to the plant. Below the table, **pumping stations**: each master
    plan station's firm capacity against the build-out flow in the sewer arriving at it (people,
    growth and land upstream from the pipe network); tap one for the developments draining
    through it.

- **Plants** tab: first each plant beside its 2025 annual report — rated capacity, reported
  average and highest day, the model today (census + built since + external inflows) and a
  calibration factor (reported ÷ model). Then each plant's total inflow (Lakeview, Clarkson,
  Inglewood, the Peel total, and Malton / City of Toronto separately) as census + external
  inflows (York Region 36.1 ML/d to G.E. Booth; City of Toronto 30.2 ML/d, plant not stated, in
  the Peel total) + built since + approved + proposed = build-out: population and jobs, average
  dry, peak dry, I&I and peak wet weather in ML/d, and average as a % of rated capacity. A growth
  layer's peak is the increase in the plant's peak when it is added (peaking is not additive),
  with the running total below; I&I sits with the existing system.
- **Calibrated to 2025 flows** (Wastewater and Plants tabs) scales each plant's population and
  employment flow so the model today matches its 2025 reported average (G.E. Booth ×1.63,
  Clarkson ×1.19 on the 2021 baseline); the factor absorbs existing employment and institutional
  flow, dry-weather infiltration and anything not modelled. I&I is not scaled.
- **Plant capacity chart** (top of the Plants tab): each plant's average dry weather flow as a %
  of its rated capacity, stacked existing (census + external inflows) → built since → approved →
  proposed, with a 100% line. The gap from existing + approved up to 100% is the **uncommitted
  reserve capacity** (Ontario MECP Procedure D-5-1: rated − existing − committed), shown as a
  dashed box with its population equivalent at the plant's flow per person today, plus what is
  left (or short) after proposed applications and the **population at 100%** = (rated − external
  inflows) ÷ flow per person. It follows the Flows and diversion switches; D-5-1 uses measured
  flows, so *Calibrated to 2025 flows* is the matching basis. Population equivalents are skipped
  where too few census people map to the sewershed (Inglewood).
- **Horizon years** (Plants & capacity): each plant's average dry weather flow as a % of rated
  capacity from 2025 to 2051, with approved growth phased in over a set number of years (default
  2026, 5 years), then proposed growth (default 2028, 10 years), optional further growth beyond
  today's applications (people per year, shared by today's population) and the diversion from its
  start year. A table gives 2025 / 2031 / 2041 / 2051 and the year each plant reaches 80%, 90% and
  100%. Assumptions are editable and kept in the browser; hover shows each year's values.
- **70 ML/d diversion** switch (Plants tab): models the planned east-to-west diversion from
  G.E. Booth to Clarkson (operational 2027–2028 per the 2025 reports) as a fixed transfer, taken
  off G.E. Booth's average and peaks and added to Clarkson's at every growth layer; the Peel
  total is unchanged. On the 2021 baseline, calibrated build-out moves from about 107% to 94% of
  G.E. Booth's rated capacity and from about 70% to 90% of Clarkson's.

**2020 Master Plan** (`data/peel-reports.json` → `masterPlan`; Probe data sources mode
`masterplan` downloads Volumes 1–4 as text to the `ref-docs-mp` branch):
- Pumping stations: firm capacities of the 31 lake-based stations (Vol. 4, Table 6) are matched to
  the traced pumping-station areas, and each station is loaded by the sewer arriving at it (the
  pipe within 120 m carrying the most people). The Catchments table, the development servicing
  check (the stations on the development's own pipe route) and the capacity layer show the
  build-out peak dry and peak wet weather flow (design criteria) as a % of firm capacity; the
  Region expands a station when peak wet weather reaches firm capacity. Peak wet is approximate
  (I&I on the land draining through the published 300 mm+ network). Hover a station for the master
  plan's note (e.g. McVean: exceeds firm capacity before 2026, +700 L/s needed).
- Plants: the 90% line in Horizon years is the Region's expansion trigger (Vol. 4, s. 2.3.1).
- Water storage: the Region's storage assessment (Vol. 3, Table 12; required vs available, 2019–2041)
  and storage criteria in the Water tab.

**Development panel** — high level first, details on demand:
1. **Header**: phase, units / people / jobs, pressure zone, receiving plant, last activity, and
   flags (under appeal, stalled 2+ years, a pumping station at or over firm capacity at build-out,
   plant over-committed or past the 90% expansion trigger).
2. **Brief** (always shown): *Status* — the dated event behind the current phase, the main signal
   in the status text and a stall flag with its likely cause; *Latest decision* — the most recent
   council / committee item with a decision: verdict, the motion (shortened, and on a consent
   report the clause naming this file), the vote, the requirements on record across all items
   (holding provision, servicing / allocation, stormwater, Region of Peel comments, draft plan
   conditions, agreements, Section 37…; infrastructure items highlighted) and the issues raised;
   *Servicing* — water max day / peak hour and share of the zone, wastewater peak dry / wet, the
   most loaded pumping station and the share of the plant's uncommitted reserve; *Build-out*;
   *Proposal*. Summaries are extractive (`js/brief.js`): every phrase comes from the agenda /
   minutes text.
3. **History**: progress bar, status signals, and one dated list, newest first by year — phase
   changes (weekly check, with the event that moved it), council and committee items (open for
   motion, requirements, concerns, reports, correspondence and minutes), file events and permits.
   *Key events* counts permits per year; *All dated events* lists each one.
4. **Servicing** (flows, sewer path, plant reserve, demand by stage), **Units, jobs & build-out**,
   **Aerial check** (runs when opened) and **Source records**, collapsed.

`data/council.json` is built weekly by `scripts/build-council.js` from the Mississauga, Brampton
and Caledon eSCRIBE portals (planning committees, council, general committee, since 2019; only
meetings in the last 120 days are fetched again), and loaded only when a development is opened.

**Applications against the 2051 forecast** (Growth & demand tab, below the growth chart): for each
municipality, the 2051 population, unit and job growth allocated by the Region (Land Needs
Assessment Report Update, draft municipal allocation, appendix pp. 5.2-109 / 5.2-119; Peel 2.28
million people and 1.07 million jobs by 2051) beside the growth already in the pipeline since the
census — built, approved, proposed — and what is still to be planned for. Units are the fairer
comparison (design persons per unit are higher than average household size).

**References** (Criteria & references tab, `data/peel-reports.json` → `standards`): the Peel Linear
Wastewater Standards, the Water and Wastewater Modelling Demand Table (Aug 2024), the Watermain
Design Criteria (2010), the FSR requirements, the 2020 Master Plan, the 2020 DC Background Study,
MECP Procedure D-5-1 and the MECP design guidelines, and the Fire Underwriters Survey — each with
what is used from it, checked against the documents (Probe data sources mode `refs-council`
downloads them to the `ref-docs` branch).

**Region of Peel 2025 annual reports** (`data/peel-reports.json`, listed under References in
Breakdown & criteria): the [wastewater annual reports](https://peelregion.ca/water/wastewater/wastewater-annual-reports)
(G.E. Booth, Clarkson, Inglewood, Collection System) and [water quality reports](https://peelregion.ca/water/drinking-water/water-quality/water-quality-reports)
(Drinking Water in Peel Summary, South Peel, four Caledon systems) were read in full; figures
are kept with their report page numbers. The sandbox can't reach peelregion.ca, so Probe data
sources mode `peel-reports` (`scripts/fetch-peel-reports.js`) downloads them to the
`peel-reports` branch. Key points for this tool: G.E. Booth averaged 427.8 ML/d in 2025, 83% of its
518 ML/d rating, with 7 wet-weather bypasses (725 ML) and a ~70 ML/d diversion to Clarkson planned
for 2027–2028; Clarkson 211.9 of 350 ML/d (61%); Inglewood 102 of 243 m³/d (42%); South Peel
water 580 ML/d average against 1,700 ML/d of plant capacity, with a maximum day about 1.4× the
average.

**Map orientation:** opens on **Road grid**: the map is turned 44° so Peel's concession grid
(Hurontario, Dixie, Mavis…) runs up the screen and east–west streets (Steeles, Queen, Dundas…) run
straight across. Switch to **North up** in the map options (top right). Rotation uses the
[leaflet-rotate](https://github.com/Raruto/leaflet-rotate) plugin.

**Aerial photos** are drawn 40% transparent (60% opacity, as one layer) so project dots, boundaries and census lines stand out; road and place labels stay fully opaque.

**2021 census areas:** the 2021 Census dissemination areas show as a light border by default
(untick **2021 census areas** in the map options to hide them; the swatch beside the toggle shows
the line). The border gets thicker as you zoom in so it stays visible at street scale, and over
aerial photos it is a white line with a faint dark halo so it reads on bright roofs and pavement (white over aerial photos, grey over the street
map); hover or tap one for its 2021 population and dwellings. The outlines (`data/das.json`,
simplified to ~4 m, about 0.8 MB) load after the map opens, and are built by
`scripts/build-areas.js` with `data/areas.json` (Probe data sources, mode `areas`).

**Select an area:** the select tool under the zoom buttons turns the next drag into a lasso (with a mouse, the
middle button still drags the map while the lasso is on; Esc cancels). The
projects shown on the map inside it are added up in the side panel: planned / permitted /
completed / left by unit type plus employment, servicing demand (residential + employment, for
the total, completed and remaining units, peaked as one area), and growth since the 2021 Census
(census population of the dissemination areas whose centre is inside, plus built, approved and
proposed growth). **+ Add area** draws another area into the selection, × removes a project,
**Export CSV** downloads the selection, and opening a project gives a link back to it.

**Export:** download the filtered projects as CSV or GeoJSON.

## DC funding scenario

**DC Analysis → Funding scenario** tests a DC budget over the next N years (default 10). There
are quick buttons for $1 B, $5 B and the whole program.

**What's in the window.** The projects coming online in the window are costed in 2026$, at their
DC-recoverable share:

- **Priced projects:** the 2020 DC study's costs, indexed ×1.40 (wastewater) and ×1.35 (water).
  These are the Region's DC rate indexing since 2020.
- **Mains not in the 2020 study:** a cost per metre fitted by diameter to the study's priced mains,
  times the main's length on the map.
- **Facilities:** their 2020 project number where it still matches, else the median priced item
  of their kind.
- **G.E. Booth to 558 ML/d:** the $130 M Council approved in February 2024.

**Funding order:**

1. Projects in the 2026 capital program as approved (committed).
2. Then the growth each project lets through by the window's last year, per dollar.
3. Then, with money left, projects that no modelled growth needs in the window. They are kept for
   their other drivers.

Whatever doesn't fit is deferred. Each deferred project shows the people, units and DCs it holds
back by then. The headline gives the combined effect of all the deferrals as a range: from the
largest single shortfall to the sum of the projects' own impacts.

**Also shown:**

- a comparison row for $0.5–3 B and the whole program;
- the projects outside the window that DC Analysis says to bring forward, with their cost;
- a CSV export.

## Change log and versions

The **Change log** tab (last tab in the bottom panel) lists every release of the app, newest
first. One release is one pull request merged into `main`, numbered **1.<pull request number>**
(for example 1.111). Each release shows its title, the bullet points from its description, the
date, a link to the pull request and the build (commit).

- `scripts/build-changelog.js` builds `data/changelog.json` from the first-parent git history.
  The deploy job runs it with full history, so the log always includes the release being
  deployed. The weekly data snapshots are listed as data updates, which you can switch on.
- **Current version:** the release whose commit matches the app-version stamp. It is marked
  "You're using this version", and it is also shown under Data → Data sources.
- **What's new:** releases since this browser last opened the tab are marked New, and a red dot
  shows on the tab until you open it.
- You can filter to new features or fixes, search the log, and download it as CSV.

## Outside data: targets, projections, costs, storms, compliance, hydraulics

These sources are fetched on GitHub Actions, because the sandbox can't reach the hosts. Run
**Probe data sources** with mode `external` (`scripts/fetch-external.js`); raw files go to the
`ext-raw` branch. Then build the data files locally:

- **DC costs and rates.** `data/dc-costs.json` is built by `scripts/build-dc-costs.py` from the
  2020 DC Background Study text on the `ref-docs-dc` branch. Its capital tables give each
  component's gross cost and DC-recoverable cost in 2020$. Components are matched to the 2026 DC
  maps by component number: 164 of 506 match, and newer components have no published cost yet.
  - The file also holds the water and wastewater DCs per single / semi from August 1, 2026 to
    January 31, 2027 (water $30,180.96, wastewater $32,776.33). Other unit types are scaled by the
    2020 schedule's ratios.
  - **DC Analysis** uses them to show each project's cost, its cost per person held back if
    cancelled, and the DC revenue those held-back units would pay. The table can be sorted by
    cost per person.
  - A development's **Servicing** tab estimates its Regional water and wastewater DCs.
- **Housing targets, CMHC and Ministry of Finance projections.** `data/housing.json` is built by
  `scripts/build-housing.py`. It holds:
  - Ontario's housing supply progress, from the Ontario Data Catalogue.
  - CMHC starts and completions by municipality, from the HMIP tables (Toronto CMA by census
    subdivision).
  - The Ministry of Finance 2025–2051 projection for the Peel census division.

  These feed:
  - The Overview's **Housing targets to 2031** card: progress against the share of time gone,
    CMHC starts, and pipeline units against what's left.
  - The Overview's **Population outlook** card: the Ministry of Finance projection against the
    Region's 2.28 M forecast for 2051.
  - The briefing.
  - New **Model checks**: units completed against CMHC completions, the approved build pace
    against CMHC starts, and population today against the July 2025 estimate.
- **Design storms and climate (wet weather scenario).** `data/idf.json` is built by
  `scripts/build-idf.js`. It holds the MTO IDF Curve Look-up coefficients at each wastewater block
  (`--only mto`) and MTO's climate trend.
  - **Settings & sources → Wet weather scenario** scales the I&I allowance by the 1-hour intensity
    ratio. The choices are:
    - the storm (2- to 100-year);
    - the climate: MTO trend to 2050 or 2080, or a +10, 20 or 30% uplift, for example from IDF_CC;
    - the storm the allowance represents (25-year by default).
  - The pipes, capacity colours and DC Analysis follow the scenario, and the Scenario chip shows it.
- **SWMM model.** **Wastewater → Blocks → SWMM model (.inp)** exports the 40 blocks as a SWMM 5
  skeleton:
  - junctions at the block outlets, and conduits to the downstream block (trunk size, nearest
    trunk slope, relative inverts);
  - dry weather flow at the Demand year, with a diurnal pattern;
  - RTK rainfall-derived I&I on each block's sewered area, with placeholder R, T and K to
    calibrate;
  - a 4-hour Chicago design storm from the MTO IDF curves.

  It runs in SWMM 5.2: this was checked with pyswmm, with a 0.03% continuity error.
- **Hydraulic check (beta).** **Water → Hydraulic check** runs EPANET 2.2 in the browser
  (epanet-js 0.9.0, loaded from jsDelivr on demand).
  - It works on the large mains crossing into each upper pressure zone, at the maximum day for
    the Demand year.
  - It reports each main's flow, velocity (against 1.5 m/s) and head loss per km.
  - The `.inp` can be downloaded to build on in EPANET or InfoWater.
- **Effluent compliance.** `data/compliance.json` is built by `scripts/build-compliance.py` from
  MECP Environmental Compliance Reports (municipal and private sewage, 2020–2024). It lists
  exceedances at G.E. Booth, Clarkson and Inglewood, shown in **Wastewater → Plants**.
- **2026 Census.** The first release is February 10, 2027. Run `scripts/build-areas.js` with
  `CENSUS_2026_CSV` (Statistics Canada's DA counts CSV, joined to the 2021 DA geometry) or
  `CENSUS_2026_URL`, plus `CENSUS_2026_PEEL` to check the total. 2026 then becomes the baseline
  automatically.
- **Building permits** were already live: Mississauga issued and Growth Management permits,
  Brampton `maps1.brampton.ca` and Caledon AMANDA (see Data sources).
- **Not public:** the 2025/26 Master Plan report (finalization expected in 2026; Data freshness
  flags it), the allocation list (use the allocation CSV import), Dragonfly flow monitoring
  (would calibrate the RTK values) and the 2026 DC study's cost tables.

## How classification works (`js/phases.js`)

Each municipality uses its own schema, so nothing is hard-coded per dataset:

1. **Field detection:** file number, address, status, type, description, units, GFA and
   date fields are matched by name. Each date field is assigned to the lifecycle event it
   records: received, approved, issued, inspected, finaled or cancelled.
2. **Record phase:** the status text gives the phase. Dates can only move a record forward;
   for example, a final-inspection date beats a stale "Issued" status. With no status, a
   permit counts as issued and an open application counts as under review.
3. **Projects:** records are grouped by normalised civic address, or by location when there
   is no address. The project takes the furthest live phase. If new files start after an
   earlier building on the site was completed, they count as a redevelopment, and the
   project's phase comes from the new files.
4. **Duplicates:** a permit that shows up in more than one layer is merged by permit number.
5. **Permits on application land:** subdivisions are filed as one polygon, often under an
   address like "0 Heritage Rd", but their houses get permits at new street addresses. The app
   links them by location:
   - Each permit joins the smallest planning-application polygon it falls inside, as long as
     it's in the same municipality and isn't dated more than a year before the application.
   - Applications that cover the same land (official plan amendment, zoning, subdivision,
     condo) merge into one project.
   - A site plan inside a subdivision rolls up into the subdivision.
   - Withdrawn applications and area-wide plans larger than 4 km² don't absorb permits.

## Build-out by dwelling type

Under the Planned / Permitted / Completed / Left to build tiles, each project shows the same
four columns by type (single / semi, townhouse, apartment, type not stated), and an
**Employment** row with the non-residential floor area and estimated jobs. The bottom panel's
**Breakdown & criteria** tab totals them for the projects shown.

- **Planned** by type: the unit mix published with the application; else counts in the
  application description (“299 single detached, 217 street townhouse and 52 back-to-back
  townhouse dwelling units”); else the type read from the description. When only that guess is
  available, building permits with a stated type set the type of the units they cover.
- **Permitted / completed** by type: each building permit's own description (one figure per
  building, as in the build-out). Permits that don't say (e.g. foundation-only conditional
  permits) go to the types with room left in the plan.
- **Left** = planned − permitted per type. Every column adds up to the tiles above.
- Stacked and back-to-back towns count as apartments, as in Peel's persons-per-unit.
- Employment floor space has no unit-level permits, so it moves with the project's phase.

## Employment uses (`js/employment.js`)

Applications are scanned for non-residential uses — industrial / logistics, office, retail /
commercial, hotel, institutional — and for floor areas stated in the description (“2,506 sq m
of retail GFA”, “a place of worship (1,445 m²)”, “45,000 sq ft warehouse”, converted to m²),
each assigned to the nearest use. A purely non-residential file's floor-area field is used when
the text gives none (marked †). Files on one site repeat the proposal, so the largest figure per
use counts; minor / limited files are skipped. Estimated jobs use typical floor space per
worker: industrial 110 m², office 25, retail 45, hotel 60, institutional 50 by default. These
are editable under **Breakdown & criteria → Employment floor space (m²/job)** (saved in the
browser; *Reset to Peel defaults* restores them) and every job count, employment demand and
summary updates. Shown as an **Employment** section in the development panel, an **Employment** focus chip, and in the CSV export
(`employment_uses`, `nonres_floor_area_m2`, `est_jobs`).

## Aerial check (is it built?)

At the bottom of each project's panel, the app compares the site on the aerial photo from
**before the application** with the **latest** aerial (same city source, so colours and
alignment match) and gives a **probability that the development is completed**, with the
before / latest photos (site outlined in yellow) and the reasons:

| Evidence | Effect |
|---|---|
| Records: phase, share of units on completed permits, permit age, units with no permit yet | starting estimate |
| More building edges on the site (roofs, roads) between the two photos | raises |
| Fewer edges (site cleared or graded) | lowers; marks construction under way |
| No visible change while records say it is in progress | lowers |
| Mississauga building footprints traced from each year's photo: new footprints since the application | raises strongly |
| No footprints on a small site in the latest year (Mississauga) | lowers |
| Brampton footprints (undated) covering the site | raises a little |
| Latest photo older than the building permit | photo evidence counts less |

Imagery: Mississauga 2013–2024, Brampton 2004–2025 (spring / fall), Caledon 2014–2025, read
directly from the cities' image services. The photos are leaf-off spring / fall flights with
muted colour, so the check measures structure and change rather than colour. It is an estimate
for screening, not a site inspection; small infill sites and redevelopments of already built
land show the least. `node scripts/aerial-e2e.js` (Actions: *Probe data sources*, mode
`aerial`) runs it against the live imagery for sample projects.

## Duplicate check (proof of counting once)

The **Data** tab has a **Duplicate check**, recomputed from every record (filters ignored):

1. **Records:** raw records → copies of the same file merged (same file number across layers
   or spellings) → unique files → projects.
2. **Integrity checks** that must be 0: a file still listed twice, a file counted in more than
   one project, a file in no project.
3. **Unit reconciliation:** units on every record, minus each rule that removes a repeat
   (copies of a file, withdrawn files, repeat applications for one proposal, repeat permits for
   one building, permits already inside their planning application) = **units counted**, which
   equals the demand panel's “All units” with every filter off.
4. **Possible duplicates left:** separate projects of 20+ units within 60 m, for review (tap to
   open).
5. **Download audit CSV:** every file with the project it is counted in, so anyone can check.

Every deploy (including the weekly update) runs the same audit on the snapshot
(`node scripts/audit-snapshot.js`) and writes it to the Actions run summary.

Two linking rules close gaps the audit found: a multi-address application (“202 and 204 Main
St”, “65-71 Agnes St”, “… (formerly …)”) joins the records at each address it names, and a
permit-only project of 20+ units within 60 m of an application with exactly the same unit count
joins that application.

## Build-out: planned vs permitted vs left to build

For each project with a unit count on its planning applications:

| Figure | Meaning |
|---|---|
| Planned | Units on the planning applications. Files on the same land repeat one proposal, so the largest figure is used. Parts nested inside a larger application are summed, unless the parent's own figure is larger. |
| Permitted | Units on building permits on the land. Permits at one address (foundation, full, revisions) count once. |
| Completed | Units on permits marked closed, finaled or occupied. |
| **Left to build** | Planned − permitted: units with no building permit yet. |
| Not yet completed | Planned − completed. |
| **Committed capacity** | Growth only (units planned on a planning application), not yet completed, on projects that are approved, permitted or under construction. Applications still in pre-consultation or review are proposed, not committed; permits with no planning application are not growth. |

### Multi-phase developments (towers, blocks, condo phases)

| Rule | Why |
|---|---|
| Each file is counted once: `SP 22-60`, `SP 22 60` and `SP 22/060 W9` are the same file, and so are permits `BP 3NEW 17-9012`, `… CON`, `… CR1` and `… FTR`. | Mississauga publishes a file in up to three layers, each with different formatting. |
| Rezoning, official plan amendment and subdivision files describe the whole proposal, so the **largest** figure across them (and any resubmissions) is used. | A resubmitted rezoning is the same proposal. |
| Separate **site plan** files on a development are **added up**, and so are separate **condominium** files. | Each tower or block usually has its own site plan and its own condo registration. |
| Planned = the largest of: the rezoning figure, the site plans added up, or the condos added up. | Each stage of approval covers the same homes. |
| Minor, express and limited site plans (`SPM`, `SPAX`, "Limited Site Plan") and pre-consultations add no units. | They revise or precede an earlier plan. |
| Permitted units are counted once per base permit number, and different base numbers are added up. | A tower's conditional, foundation, full and revised permits share one base number. |
| Drain, site-servicing and "revision to permit" permits add no units. Basement second suites, filed as alteration permits, do count. | |

When a development has two or more phases, the project panel lists them, each with its file
number, status, planned units, and (where the phases have their own land) permitted units and
units left to build.

A project's units are counted once, as the larger of planned and permitted, never both added
together. A plan with units still left to permit shows as "Under construction", not
"Completed", even if every permit issued so far is finished.

In the app, the project panel shows a build-out bar, and the project list shows "planned / left"
on each row. The **Unit growth** filter has an option for **Units left to build**. The demand
panel can be based on all units, units left to build, units not yet completed, or completed
units. The CSV export includes every build-out figure.

Run the tests with `npm test`.

## Population and demand criteria (`js/demand.js`)

| Parameter | Default | Source |
|---|---|---|
| Persons per unit: single / semi | 4.2 | Peel Linear Wastewater Standards R1.0, Table 2-2 (from the Region's DC Background Study) |
| Persons per unit: townhouse | 3.4 | same |
| Persons per unit: apartment | 3.1, or 2.7 above 475 persons/ha | same standard: large apartments 3.1; where the site holds more than 475 persons/ha at that rate (or its area is unknown) the high-density 2.7 applies. Peel's 1.7 for small (≤1 bedroom) apartments needs a bedroom mix the applications don't publish |
| Persons per unit: type not stated | 2.7 | assumption: most unit-bearing projects in Peel's pipeline are apartments |
| Water, average day | 270 L/cap/day | Peel Water and Wastewater Modelling Demand Table (v2.0, Aug 2024), from the 2020 DC Background Study (replaces the 2010 Watermain Design Criteria's 280) |
| Water, max day / peak hour | ×1.8 / ×3.0 | same (2010 criteria: ×2.0 / ×3.0) |
| Wastewater, residential | 290 L/cap/day | Peel Linear Wastewater Standards (2023) s. 2.2 |
| Wastewater peaking | Harmon, M = 1 + 14 / (4 + √P), P in thousands, limited to 2.0–4.0 | Peel Linear Wastewater Standards s. 2.4 (a sewer design rule; at plant scale it makes peaks conservative) |
| Employment water | 250 L/employee/day, max day ×1.4, peak hour ×3.0 | Peel Modelling Demand Table (Aug 2024), ICI (2010 criteria: 300) |
| Employment wastewater | 270 L/employee/day; Harmon on employees, bounded 2–4; I&I 0.26 L/s/ha | Peel Water & Wastewater Modelling Demand Table, site plan applications (Aug 2024), non-residential |

How the estimate works:

- **Dwelling type:** taken from a published unit-mix column (singles, semis, towns,
  apartments) when the dataset has one. Otherwise it is guessed from the project's type and
  description text.
- **Peaking:** the Harmon factor is applied to the combined population of everything shown and
  kept between 2.0 and 4.0. That gives a system-level peak, which is lower than adding up each
  site's own peak flow. Saved criteria that still hold the 2010 defaults (280 L/cap/d, ×2.0, 300
  L/emp/d, apartments 2.7) move to the current ones; edited values are kept.
- **I&I (infiltration and inflow):** 0.26 L/s per hectare of gross site area (editable). Site
  area is the planning application boundary (about 87% of planned units have one); where there
  is none it is estimated from the units: 0.04 ha per single / semi, 0.02 per townhouse, 0.003
  per apartment or unstated unit, and marked “est.”. For completed / remaining / left-to-build
  figures the site area is split by share of units. **Peak wet weather = Harmon dry-weather
  peak + I&I.** Shown on the wastewater tile, in each project's servicing table, and for growth
  since 2021 in the census panel.
- **Employment demand:** jobs estimated from the floor areas on the applications (see
  Employment uses) × 250 L/employee/day water and 270 L/employee/day wastewater. Wastewater is
  peaked with Harmon on the employee count, kept between 2 and 4; I&I is added on the boundary
  of purely non-residential sites (mixed-use sites already count theirs with the dwellings).
  Employment space has no unit-level build-out, so a project's jobs count by its phase
  (committed = approved to under construction; completed once the project is completed).
  Shown as the Employment and Total rows of the water and wastewater tables in the bottom
  panel, as Employment rows and a combined total in each project's servicing table, as a
  one-line summary in the project's Employment section, in the by-phase breakdown, and in the
  CSV (`emp_water_avg_lps`, `emp_wastewater_peak_lps`). Residential and employment peaks are
  computed separately and added, as in a servicing report. Projects whose descriptions state no
  floor area have no jobs and so no employment demand.

Every value can be edited in the app, and your edits are kept in your browser. These numbers
are planning-level estimates, not a substitute for a functional servicing report. Check the
values against the current Region of Peel standards; a 2025 edition of the Linear Wastewater
Standards is listed on the Region's site.

## Data sources (`js/config.js`)

| Municipality | Source | Kind |
|---|---|---|
| Mississauga | Development applications (newest monthly `DevApps_*` layer, found automatically) | Applications |
| Mississauga | Growth Management – active development applications | Applications |
| Mississauga | Site plan applications (with units by dwelling type) | Applications |
| Mississauga | Issued building permits (since 2018, with status and completion date) | Permits |
| Mississauga | Growth Management – issued permits adding units or floor area | Permits |
| Brampton | OPA / ZBA / plans of subdivision | Applications |
| Brampton | Site plan approval | Applications |
| Brampton | Draft plans of condominium | Applications |
| Brampton | Development permit system | Applications |
| Brampton | Pre-consultation (always shown as Inception; units not counted) | Applications |
| Brampton | Building permits (`maps1.brampton.ca`, with dwelling counts) | Permits |
| Caledon | Development applications (with units by dwelling type) | Applications |
| Caledon | AMANDA building permits (units created) | Permits |

Brampton's planning files don't include a unit count. The app reads the count from the
proposal text when it states one, such as "312 residential units". Brampton minor variances
and consents are left out. Every query is clipped to the Peel bounding box. In live mode, each
layer loads up to the "Max per layer" limit (20,000 by default), newest first.

**Discover datasets** in the app searches the four open-data hubs for more layers. Its results
include unrelated layers, such as election "subdivisions", so it is a manual exploration tool
only; the weekly job uses just the list above.

**Checking the sources:** the **Probe data sources** workflow, run manually from the Actions
tab, does two things. It lists what each municipality publishes, with fields, counts and status
values. It also does a dry run of the snapshot that reports per-source counts and how each raw
status maps to a phase.

### Caveats

- Coverage depends on what each municipality publishes. Mississauga publishes the most.
  Caledon's development applications layer is described as possibly incomplete. Some
  Brampton datasets are updated irregularly.
- Phases are inferred from status wording and dates, which differ between municipalities.
  Open the source record in the project panel to check a specific project.
