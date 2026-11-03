# Using the app

Home, Find, the pages and the full map: the five tabs, their views, the tools, Help and Settings, and how each changed. Part of the [Peel Growth Pipeline README](../../README.md); the other parts: [How the numbers are worked out](../method/README.md), [The data: sources, receipts, updates and deploys](../data/README.md).

## Using it

The full map's left panel has two tabs, **Find** and **Watch**. (The entries below grew with the app; the older
ones name the tabs and panels of their day: Help › *What moved where* gives each old name's place now.)

**What is this?** Rest the pointer on a heading, figure or control for 3 seconds (on a phone,
a genuine press-and-hold of about two-thirds of a second, finger still down — a plain tap no
longer opens it) for a card explaining what it represents and where the data comes from
(`js/info.js`).

**Find** — one filter panel, in order: **Search · Stage · Where · What · When · Flags**,
then the list of developments on the map. One-tap **saved-view preset chips** sit above the
search bar (save a view from Export ▾ › Save this view…).
- **Search** by address, file number or description; a notice line says when nothing matches.
- **Stage:** the bar shows how the listed developments split across the stages — Pre-application,
  In review, Plan approved, Permit / under construction (one row; the bar keeps Building permit and
  Under construction apart), Built, Withdrawn / refused — each with its count. Tap a segment to show
  only that stage; tap again to go back to all. Ctrl-click (⌘ on a Mac) picks several.
- **Where:** **municipality** (All, Brampton, Caledon, Mississauga); **secondary plans** (tick
  one or several; type to find a plan) and **MTSA** drop-downs — a project counts if it is
  inside any pick, and the picks are outlined on the map; and the **receiving plant** (G.E.
  Booth, Clarkson or Inglewood — the plant the development's catchment drains to).
  Secondary plans: Brampton Plan Schedule 10 and Caledon's in-effect Secondary Plan Areas;
  Mississauga has no secondary plans, so its Official Plan Character Areas are listed. MTSAs:
  the Region of Peel delineation (published by Mississauga) and Brampton Plan Schedule 1A/1B
  primary and planned MTSAs. A project is in an area when its location falls inside it.
- **What:** **Size** (Adds units or jobs, 10+ … 500+ units), **Dwelling type** (single /
  semi-detached, townhouse, apartment), and **Land use** — Adds units or jobs is the default
  (growth: applications proposing new dwelling units or new jobs), with Residential, Mixed and
  Employment.
- **When:** a **milestone** (any, application submitted, approved, permit issued, completed)
  with a from/to year; quick buttons **Last 12 months** and **This week**.
- **Flags:** ★ Watched (developments on your watchlist), Stalled 2+ years (still in planning,
  no activity for 2 years), Changed this week (new or moved stage in the latest weekly update).
- **Active filters** appear as chips under the search. Tap a chip's × to remove that filter,
  or use **Reset all** (back to the defaults: all stages, Adds units or jobs).
- **Record type** and **New buildings only** are under **What** (they were Settings › Records).
  Record type: by default only planning applications and the building permits that
  belong to them (permits with no application, such as infill houses, are hidden; choose *All
  records* to see them); also building permits only, or applications plus permits.
  **New buildings only** hides alterations, signs, pools and similar permits.
- Where the old controls went: the phase quick-view chips → the **Stage** bar; the **Focus**
  chips → **Flags** (Growth is now the default land use; Major 100+ is a size; Employment is a
  land use; Committed capacity and Left to build are the counting basis in the **Scenario** control;
  New in last 12 months is the Last 12 months button); record type and New buildings only →
  **What**; the demand year → the Scenario control's **Results for year**.

**Watch:** the developments you starred with ☆ Watch. *This week* (Home's menu) lists the projects that are
new, or that changed stage, since the previous weekly update.

The old **Data** tab is **Records › Sources** (design bundle 6, before the navigation phases): the source list, **Refresh live**, and an
**Advanced** section for adding sources.

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
- **Subdivisions up close:** application boundaries show at every zoom; at street zoom, or when you
  select a project, every building permit inside one appears as its own dot. Tap anywhere inside a
  boundary to open that application (a site plan or condo nested in a larger development opens on
  its own, with a link to the whole project). Tap a dot to see that
  permit and the **planning application it belongs to** (file number, type, status, planned
  units). **Open whole project** shows the build-out for the whole subdivision.
- **Project panel:** shows the build-out as steps (planned → permitted → completed, then
  left to build), the project's **servicing demand** (population, water average / max day /
  peak hour, wastewater average / Harmon peak, for the total, completed and remaining units), a phase
  stepper, the weekly phase history and the dated timeline, grouped by date (same-day events on several files show once, with a count and the file numbers). Every source record has **Show on
  map**. On phones, the panel opens as a bottom sheet so the selected point stays visible.

**Picking several (desktop):** Ctrl-click (⌘-click on a Mac) a Stage bar segment
to add or remove that phase; a plain click still shows one phase only. Holding Ctrl / ⌘ over the
map shows a crosshair: drag a box to add the shown developments inside it to the selection (like
Tools → *Select*), with the same summary panel. A plain drag still moves the map.

**Timeline (floating, bottom of the map, to the right of the legend):** opens on **2021–2026**. Drag the handles to keep only projects with
activity in those years; the button next to the range switches between **All years** and the
2021–2026 default (**Reset all** also returns to 2021–2026).
The dropdown picks which milestone must fall in the range. Click a bar to isolate one year, and
shift-click to extend the range.

**Census baseline follows the timeline:** the Growth tab, an area selection and the census-area
outlines use the latest census held in or before the timeline's first year: **2021–2026 → 2021
Census** (11 May 2021), **2016–2020 starts → 2016 Census** (10 May 2016). Planning application
data starts in 2016, so 2016 is the earliest baseline; an earlier start also uses 2016; All years
uses the latest, 2021. "Built since" then counts permits completed since that census day. The 2016 counts come
from the *Immigration in Peel by DA as of 2016* layer (2016 dissemination areas, total population
and private dwellings) and match the published totals (Peel 1,381,739; Mississauga 721,599;
Brampton 593,638; Caledon 66,502). Statistics Canada's own download site blocks automated
access, so it can't be used directly.

**Selected project → its census area:** opening a project narrows the analysis panel's Growth tab to the
census dissemination area (DA) its point falls in, for the baseline census year (outlined on the
map). **Growth** shows that DA's census population and dwellings, then built / approved /
proposed growth from every development application located in the same DA. (The old **Servicing
demand** tab, which added up the shown projects in that DA, is gone.) The DA pill (×), or
closing the project, goes back to all of Peel (or the selected municipality / plan / MTSA).

**Growth since the census (Growth › 2021 existing):** for Peel, the selected municipality,
secondary plan or MTSA:

| Tile | Meaning |
|---|---|
| 2021 Census | Population and private dwellings (Statistics Canada, by dissemination area). For a secondary plan or MTSA, each DA counts by the share of its land inside the area. |
| + Built since | Plus units on building permits completed since census day (11 May 2021), at Peel persons-per-unit. Brampton and Caledon publish no completion date, so it is estimated as issue date + 12 months (houses) or + 30 months (20+ units). |
| + Committed, not yet built | Plus committed growth: the units left to build that a site servicing or building permit commits (the Peel rule), not yet completed. |
| + Not committed yet: full build-out of applications | Plus the rest of build-out, not committed yet (plan approved without a permit, zoning approved, in review, pre-application): the full build-out of the planning applications. |

Each growth tile also gives the jobs added on development sites (from the floor area the
applications state; existing jobs are not in the census), and a third bar shows jobs.

Two stacked bars (people, dwellings) show the 2021 baseline (grey), built since (green),
approved (blue) and proposed (hatched blue) up to full build-out; hover or tap a segment for
its value.

Peel's small geographic unit (SGU) forecasts are not published as open data (only Caledon's are),
so the census baseline uses dissemination areas. `data/areas.json` is rebuilt weekly
(`scripts/build-areas.js`).

**Population & servicing demand (the old bottom panel's Servicing demand tab, gone; a selection's summary keeps its table):** dwelling units,
population and jobs, then a **Water** table and a **Wastewater** table with residential,
employment and total rows (L/s: average / max day / peak hour; average dry / peak dry / I&I /
peak wet). Population, water and wastewater are estimated
from the units in the projects shown. **The selection was Find's:** the header showed the
stage, the counting basis, the years and any other filter, with **Change** jumping to the selectors; there
was no separate selector in the panel. Each project counts all its units, except under the
**Committed** counting basis (units left to build that a site servicing or building permit commits, the Peel rule) and the **Left to
build** counting basis (planned units not yet completed, permit issued or not). The criteria are edited in the Scenario control
(*Criteria & references*).

**Scale, north arrow and boundaries:** a metric scale bar and a north arrow sit under the zoom
and select tools; the arrow always points to true north (turned 44° on the road grid), and
tapping it switches between road grid and north up. At every zoom every shown project's
planning application boundaries are drawn in its phase colour with a light fill (no cap; each is
built once and reused as you pan); tap one for its application. Building-permit dots join them
from street zoom (14), up to 3,000 in view.

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
- Each development is tagged by its location point. The Layers panel's **Capacity** group toggles both
  layers, and Find › **Where** has the Pressure zone and Drainage area filters; a development's Servicing ›
  Network shows its zone and the blocks to the plant.
- **Bottom panel tabs** (before the five tabs; now Growth, Servicing › Capacity · Network, the Scenario control's
  criteria and Records › Sources' references): **Growth & demand** (demand of the shown developments, then growth
  since the census), **Water**, **Wastewater** (two views: *Plants & capacity* and *Catchments*)
  and **Criteria & references**. Every servicing table opens with a stamp of the criteria it uses
  and the data dates, with a **Modified criteria** badge when the criteria have been edited; method
  notes fold under *Method & notes*. The Scenario control's Wastewater switch has two modes: **Capacity check** (default;
  calibrated to the 2025 reported flows, the basis for capacity statements) and **Design flows**
  (Peel criteria, for sizing); the tables have a *Columns* switch (Engineering shows the Harmon factor and
  drainage areas). Plants carry the names in Peel's reports (G.E. Booth WRRF (Lakeview), Clarkson
  WRRF, Inglewood WWTP). Population is rounded to the nearest 100 above 10,000 and the nearest 10
  above 1,000.
- **Share link** (Export ▾ › *Copy share link*): copies a link to the exact view — stages, flags, filters
  (municipality, plans, MTSA, pressure zone, drainage area, size, land use, dwelling type, years), the analysis tab
  and its view, the mode / max-day / diversion switches, the map position and the open
  development. The address bar keeps the same link as you work (`#…` parameters).
- **Export** (Export ▾ in the top bar: *Excel workbook (.xlsx)*, the PDFs and *Print map*; the *PDF / print* and
  *Excel* buttons the old bottom-panel views and development panel had are gone, and a lasso selection has *Export CSV*):
  the old PDF option opened a printable report of what is on screen (with the mode, switches, filters, data dates,
  the criteria table with edits highlighted, and references); Excel writes a workbook
  with a Summary sheet, one sheet per table (numbers as numbers, units in the headers, second
  lines such as population as extra columns) and a Criteria sheet. SheetJS (cdnjs) loads only when
  Excel is clicked. Per-file record tables are left to *Export CSV*. CSV and Excel
  Developments / Records exports carry provenance columns: `portal`, `source_url`,
  `retrieved_at` and `source_record_id`; the Excel Summary sheet and the CSV header comments
  carry the unofficial-prototype line.
- **Default view**: the map opens on the active development applications (application to
  construction, any year) over the background. On desktop the analysis panel opens on
  **Overview**; on phones it starts folded (its summary line raises it). Map tools (trace a sewer path,
  select an area, measure, test a site) sit under one Tools button, the rail on the map's left
  edge; the north arrow stays on the map (tap it to switch between road grid and north up).
  Find (the full map's left panel) has search, a "Showing …" line, and the unified filter panel (Search · Stage · Where · What · When · Flags).
- **Executive briefing (PDF)** (Overview, top right): one printable Letter page for management —
  title block with the date, *Prepared by* (set it in Settings › Reports) and the data date; the
  headline sentences; growth and demand tiles; servicing demand by phase; the plants' and South
  Peel water treatment's share of the 90% expansion trigger; room after servicing allocations; a
  map of the wastewater blocks with the larger developments and the plants; the DC projects to
  bring forward and those most growth relies on; the criteria and the app version in the footer.
- **Plain-language headlines**: one sentence at the top of each tab, written from the numbers
  (e.g. which plant reaches its trigger first, which zone adds the most, how many pumping stations
  exceed firm capacity, which DC projects come too late).
- **Servicing allocations**: record a development's allocation (units, date, reference) in its
  Servicing tab; Servicing › Capacity's fold *Allocations recorded* lists them and gives each plant's
  room at the 90% trigger after existing + approved development and after allocations made ahead of
  approval (also on the Overview), with Export and Import CSV in its full table. Kept in the browser;
  CSV export / import to share one list.
- **Data freshness and model checks** (Records › Sources and Records › Data checks): every source with its date, update
  interval and status (current / due for a refresh / out of date / reference / live), summarised on
  the Overview; and the model against published figures — 2021 Census population for Peel and each
  municipality, the share on municipal sewers, population today against the annual report's
  population served, and the plants' and South Peel water's design-criteria flows against the 2025
  measured averages (±10% matches, ±25% close; each row explains an expected difference).
- **Number conventions** (Help › How the app decides): people and jobs are rounded the same way everywhere (whole under 1,000,
  nearest 10 to 10,000, nearest 100 above); units are exact counts; L/s for pipes, stations and
  single developments, ML/d for plants, zones and totals; ≈ marks a screening estimate.
  Capacity and DC results are labelled **screening estimate** wherever they appear.
- **Bottom panel tabs** (before the five tabs, Overview · Growth · Servicing · Capital · Records; the criteria are
  the Scenario control's, the sources Records › Sources): **Overview** (the headline numbers on one screen: developments, units,
  people, jobs, water max day and wastewater peak wet; the plants' and South Peel water treatment's
  capacity against the 90% expansion trigger, committed and at build-out; the servicing demand by
  phase; the DC projects that come online too late and those most growth relies on; the tools —
  each card links to its tab), **Demand** (flows of the shown developments, then the *servicing
  demand breakdown* by phase, by dwelling type and build-out by type, then growth since the census),
  **Water**, **Wastewater** (plants / blocks), **DC Analysis** and **Settings & sources** (the
  editable criteria and the references). Each tab's criteria and data sources fold to one line
  (ⓘ Criteria & data); the Scenario control sits once, in the top bar. Tables open in **Simple** columns
  (the build-out flows and peaks); **Engineering** adds the layer-by-layer and local / upstream
  columns.
- **Filter by area** (Find › **Where**; it was its own box on the map, under the Wastewater loads box): the
  municipality (All · Brampton · Caledon · Mississauga) on top, then secondary plan / character area, MTSA, pressure zone and drainage area (wastewater block). Each is a
  dropdown of checkboxes with a search and Clear, so several can be picked: a development counts if
  it's in any pick of a list and matches every list used. Picks are outlined on the map, named in
  the filter chips and kept in share links and saved views (comma lists; older one-id links still
  open). Where folds to one line with a summary.
- **Unofficial banner**: a slim strip at the very top of every screen reads *Unofficial
  prototype · public data only · not a Region of Peel product*. The same line is printed on the
  executive briefing, the servicing memo, the area report, the print map, the Excel Summary
  sheet, the PDF footer and the CSV header comments.
- **Map layout**: top right, **Layers** (the view switch, Planning / Water / Wastewater / Capital, is in the top bar):
  a switch per group and per layer — Developments, Capacity, Existing network, Capital program,
  Constraints, Planning context, Base map — then *More
  settings* (development size and boundary reach, capacity shading, pipe size labels, DC works by
  system, DC joins). The views set the switches;
  changes are remembered per view. With the blocks as the catchments there is one wastewater area
  layer (Wastewater blocks), so it can always be switched off. Bottom left, the legend card (the Demand
  year is the Scenario control's *Results for year*), with the timeline beside it (above it when there's no room). The boxes along
  the bottom never overlap: the timeline, the wastewater loads box and the Clear selection button
  move clear of each other and of the analysis panel, and the Layers panel scrolls rather
  than run into them. When a setting hides the developments (switched off, no growth load on in
  the Wastewater view, or Hidden while a path is shown) a notice above Layers says why, with *Show
  developments*; an area filter is always named there too, with *Clear*. The legend box takes the
  height the panel leaves free, so the two never overlap. Planning area outlines: tap one on the
  map to filter to it, tap again to clear.
  The development panel had three tabs (a development now has the five, *One development layout* below):
  Overview, Servicing and
  History & records. **Servicing** opened with *Trace the sewer path to the plant*, then a **Water**
  section (demand and pressure zone, watermains nearby, fire flow, planned water works, water DC
  needs), a **Wastewater** section (flows; the blocks to the plant, the tightest pipes with their
  freeboard and pumping stations; plant reserve; sanitary sewers nearby with the path's age / risk;
  planned wastewater works; wastewater DC needs) and **Site** (ground, storm sewers, stormwater
  ponds), with *Flows by stage and sewer path* below. The trace is *Trace sewer* in a development's header,
  and under Tools → *Trace* (tap a development, or any point on the map). History & records opened with *How the phase
  was set* (now the stage chip in a development's header, *How the stage was set*): the file behind the phase, approvals by stage with the latest submission in each, and
  flags where the status and the submissions disagree (a newer submission in review after an
  earlier approval, permits issued while planning is in review, a bare "Closed" read as approved,
  an OLT appeal, a demolition permit, a redevelopment cycle), plus each file's status and how it
  was read.
- **Watchlist, saved views, tips**: ☆ Watch on a development adds it to *Your watchlist* (the full
  map's Watch tab, changed-this-week first) and the ★ Watched flag. *Saved views* (Export ▾ › *Save this view…*, reopened from the chips at the top of Find) keep
  named filters + map position + view + layers in the browser. An 11-step tour shows once. *Help*
  (the top bar) opens task guides — servicing check for a development, when DC
  projects are needed, area / secondary plan reports, testing a site, weekly changes, plant and
  pumping station capacity over time, water by pressure zone, existing mains and ground, saving /
  sharing / exporting, and how far to trust the numbers — each with *Show me*, which sets the map
  up for the task; plus quick tips and the tour again.
- **Reports**: *Servicing memo* in a development's header opens a one-page servicing memo (proposal, status, flows,
  sewer path, plant reserve, DC needs, planned works, live site context, a map sketch of sewers by
  load and DC works) to print or save as PDF. *Area report* (a drawn selection, or *Report* on the
  Showing line for what is shown, or *Area report (PDF)* on Home › Growth › Areas for the level it is at,
  and on Home's Overview at one plan: the filter's level since navigation phase 6)
  gives combined demand, the capacity relied on with the DC timing, and the largest developments.
  The workbook's DC sheet (Export → Excel) lists every constraint, filtered as Capital › DC timing's
  Status was last set (Late to start).
- **Search places**: the search also finds secondary plans / character areas, MTSAs, pressure zones,
  catchments and pumping stations, DC projects (by number or name) and DC facilities, file numbers
  by prefix, and intersections ("Main St & Queen St").
- **Heatmap** (removed; it was Layers & style → Show as → Heatmap: people + jobs at build-out of the shown
  developments). Clusters show their phase counts on hover.
- **Ground elevation** (AWS Terrain Tiles, Terrarium; CDEM / SRTM, no key): Tools → *Measure &
  ground profile* gives the ground at a point and a profile with fall / grade along a line; the
  development's Servicing tab shows the site's ground and the fall to its catchment outlet.
- **Selection colour**: the open development's application boundaries, and every development in a
  lasso selection, are outlined and filled in orange (a colour no phase uses).
- **Unselect**: tap an empty part of the map, press Esc, or use *Clear selection* (bottom of the map)
  to close the open panel (closing the drawn-area summary also removes the drawn areas; the lasso
  hint has a Cancel button) and clear the highlighted development, catchment / zone, drawn selection,
  address pin and highlighted mains; filters stay. In the Servicing tab the tables scroll
  inside the panel with their column headers kept in view.
- **Map views**: *Planning* (aerial, addresses, markers by phase), *Water* (street map, pressure
  zones shaded by max day growth, markers by servicing layer sized by people + jobs, existing
  watermains, DC water works), *Wastewater* (drainage areas, sewer pipe capacity, existing sanitary
  sewers, DC wastewater works) and *Capital* (markers by servicing timing, all DC works). Each view
  remembers its own settings. Every view shows the same developments and site boundaries; the
  servicing views no longer switch on the *Growth* focus, which hid applications with no unit or job
  count (e.g. 11722 Mississauga Rd). On a phone a long Layers summary is cut short with … rather
  than widening the box off the screen. *Layers* is grouped into Developments, Capacity, Existing network,
  Capital program, Constraints, Planning context and Base map (on / off switches for zones, blocks, existing pipes,
  DC works and more). The legend card's *Colour sites by* picks the marker colour (stage / counted as / receiving
  plant / data quality / timing); Layers › *More settings* has the size (same / planned homes / people + jobs;
  clusters then total people + jobs) and a **capacity layer** (*Capacity colours*) — catchment flow growth over the
  census, pumping station build-out peak wet weather flow as % of firm capacity (green / amber /
  red), or pressure zone max day growth — with the sewer network drawn outlet to outlet. A legend
  explains what is shown.
- **What loads this?**: tap a catchment, pumping station, pressure zone or plant (on the map or in
  Servicing › Network) for the developments adding flow since the census through it,
  largest first, with built / approved / proposed totals; open one and come back to the list.
- **Scenario control** (the top bar): wastewater mode, water max day factor, the diversion,
  outside-area assignment and modified criteria in one place, summarised on every tab, the map
  legend, exports and share links (map style is in the link too).
- **Compare scenarios**: in the Scenario control, *Pin this scenario as A*, change the switches, and
  see plant existing + approved and build-out % (A, now, Δ), pumping stations over firm capacity
  and total water max day side by side.
- **Linked map and tables**: hovering a zone / catchment row outlines it on the map, hovering an
  area highlights its row; *Only areas in map view* limits the rows to what is on screen.
- **GIS export** (Export ▾ in the top bar): developments as CSV / GeoJSON now carry servicing layer,
  build-out people and jobs, flows in L/s, pressure zone, catchment and plant (with the distance
  when assigned to the nearest); *Servicing areas (GeoJSON)* gives zones and catchments with census
  and build-out flows and pumping station load. *Shapefiles (.zip)* puts every map layer
  (developments shown, servicing areas, planned works, capital projects, EAs) in one zip for
  ArcMap / ArcGIS Pro: one shapefile per layer and shape type, WGS84 (`.prj`), UTF-8 text
  (`.cpg`); field names are shortened to 10 characters and `fields.csv` gives each full name,
  text over 254 bytes is cut, and `README.txt` carries the disclaimer, filters and scenario
  (`js/export-shapefile.js`, no library). *Print map* prints the map landscape with a title
  block, scenario, legend, north arrow and scale.
- **Map tools** (left of the map; the Tools menu opens above the north arrow and scale controls): *Measure* distances (*Clear* starts a fresh line without adding a stray point), *Select* › Radius selects every shown development within
  250 m – 2 km of a point; *Test a site* drops a proposed development (units by type, jobs, site
  area) and gives its servicing check — zone, sewer path and pumping station load, plant reserve —
  and can count it in the totals (kept in this browser, draggable). While any exist, a bar at the
  bottom of the map shows *N test sites* (tap for the list, each with *Remove*) and *Remove all*,
  with *Undo* for a few seconds after; each test site's panel has *Remove this test site* at the top.
- **Wastewater blocks** (Layers › Capacity): the Region of Peel's 40 sewersheds for its
  inflow & infiltration program (`data/blocks.json`, from its *Block_view* feature service; the blocks
  of "Dragonfly: An Integrated Approach to Resiliency", F. Salehzadeh, WEFTEC 2024), with the blocks
  prioritised for a block study highlighted; each block's number sits at a point inside it (`lp`), in
  the marker pane so it stays on its block when the map is turned to the road grid. Tap a block to open it as a
  servicing scope (navigation phase 8a: Peel › plant › Block N, as a search pick opens it): its Overview's fold *The
  block in the I&I program* lists its outlets on the existing sewers (main outlet with capacity and people
  upstream, the other outlets as pipe buttons), the 300 mm+ mains inside it and the distance along the pipes to
  the plant; the rest of its Overview the blocks it drains into down to the plant (its ladder), the blocks
  upstream and the growth loading it; the map outlines the block and the blocks upstream, with arrows to the plant.
  Where a block has no servicing area (no plant), and until the servicing model is built, its card opens as before.
  Rebuild with `node scripts/build-blocks.js` (or the `dragonfly` probe mode).
- **Flow arrows follow the pipes**: a selected catchment's (and block's) arrows to the treatment plant
  run along the Region's sanitary mains (`data/sewers.json`), not straight outlet-to-outlet lines.
- **Pipe depths in the ground profile** (Measure): the Region's sanitary sewer inverts along the line
  (nearest main within 12 m), with depth to invert = ground − invert (approximate: terrain tiles are
  ±1–2 m); watermains within 8 m are drawn at Peel's 1.7 m minimum cover, labelled assumed, since the
  Region publishes no watermain depth.
- **Data quality colours**: outside every area, assigned to the nearest, no units / floor area,
  site area estimated, complete.
- **Results for year** (Scenario control): the year the
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
- **DC Analysis** (was the bottom panel's tab; now Capital › DC timing, its full table's capacity analysis): every
  2026 DC project that relieves a capacity constraint
  (sanitary sewer groups, pumping stations, the plants, water treatment and supply into the upper
  zones) or serves developments outside the existing network, replayed year by year with growth
  phased as in Horizon years. **Diversion:** from each project's construction year, flow above
  the existing capacity goes to the project, up to the capacity it adds (a main along an existing
  sewer at Manning full-pipe capacity for its diameter on the existing slope, a twin when the size
  isn't mapped; a plant expansion at its published step; other facilities taken as sized for
  build-out). **Cancelled:** the same without that one project; the growth held back is given in
  people (each constraint's own rate) and units (the approved and proposed developments' average
  persons per unit) at the chosen year and at build-out; developments that would connect to a new
  main count in full. **Screening results** (not Region decisions): Screens late (in service
  after the capacity runs out), Screens in time, Screens well ahead of need (nothing constrained
  until 5+ years after it is due), No modelled need (nothing constrained by build-out in this
  screen); the five largest impacts are listed first. Tap a row
  for each constraint's timeline (demand, capacity with and without, flow diverted to it) and
  *Show on the map*; CSV export with the impact by year. A screen to rank and question projects:
  condition, I&I reduction, servicing beyond today's applications and cost are not in it.
- **Freeboard**: each pipe's flow depth and freeboard (D − y) from Manning part-full flow in a
  circular pipe, y / D from Q / Q_full (e.g. 85% of capacity ≈ 0.71 D deep); in the pipe tooltip,
  the pipe panel and its *How the flow is calculated* table, and on a development's tightest pipes.
  Over 100% the pipe runs full: no freeboard, with the rise above the crown shown instead.
- Census area outlines are now off by default (turn on under Layers › Planning context).
- **Planned works (2026 DC capital maps, draft)**: `data/dc-infra.json`, built by
  `scripts/build-dc-infra.py` from the Region's water and wastewater Development Charges capital
  maps (geospatial PDFs fetched by the probe workflow, `mode=dc-maps`). Proposed (2027–2051) and
  approved (2026) mains with construction year, component and project numbers and diameter, inset
  maps placed through their extent boxes and georeferenced from the PDF (a few metres). Inside an
  extent box the inset's mains replace the main map's only where the inset redraws them (a main
  running on past the box, or a trunk the inset leaves out, is kept); the legend box is never taken
  for an inset. Checked against every pipe stroke in both PDFs: under 50 m of mains not carried; facility
  schedules (EA / property / design / construction) transcribed in `scripts/dc-facilities.json`;
  route descriptions joined from the 2020 DC Background Study by component number. Used for:
  - a **Planned works** map layer (water, wastewater or both; tap a facility for its schedule;
    works after the results year are faded);
  - a **DC joins** layer (Layers › Pipes and works): each planned main's end and what it joins, as
    the sewer and water traces use it: green within 60 m as drawn, orange a bridged gap to 200 m,
    red a longer one worth checking, grey an open end. A planned main joins an existing main of a
    matching size (a sewer at least its size, a watermain at least half), and is bridged to another
    planned main only where no such sewer is nearer. A sewer head (one end joins within 200 m, the
    other has nothing within 200 m and no existing sewer in reach, in a group of mains that already
    hands over to the existing sewers) is left open, not bridged to another planned main. Water
    ends can be set through a facility (a station, reservoir or tank). Water joins stay in the end's pressure zone (at
    the ends and wherever the main runs within 25 m of another), crossing zones only at a station,
    reservoir or tank within 150 m (existing or planned); a water end with nothing joined is
    flagged (red; violet when the only main in reach is across a zone boundary). An end joins a
    main wherever it is drawn onto it (mains are straight for hundreds of metres between bends), and
    an end the DC map cuts off (`x` in dc-infra.json: at the edge of the map or an inset) is marked
    as such rather than as an open end. Planned mains also join the capital projects that lay a new
    main (`data/capital.json`: WM / SAN, tunnelling and development work, tendered to complete; not
    relining or trenchless work), where drawn onto one (within 60 m): an earlier DC program's main is
    often built, or being built, before it is in the watermain / sewer data. Tap an end to set its join by hand (Pick where
    it joins, then tap the pipe or planned main; or Open end): reviewed joins are blue and the traces
    follow them. An edited join is always marked as edited: a ringed end with an ✎ Edited tag (what
    it was set to, by whom, when, why), the count on the layer switch, and a "Relies on an edited DC
    join" line in any development's sewer or water trace that uses it. Edits stay in the browser
    (marked so) until exported (dc-joins.json) and committed to
    `data/dc-joins.json`; they are matched to the main's end by position (5 m), so they survive a
    rebuild of the DC data or the existing network (`js/dc-joins.js`);
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
  (flow shared at splits by capacity; loops broken). Pipes that only look connected are kept apart:
  a dead-end stub leaving a manhole whose main pipe carries on (a chamber, siphon or overflow stub;
  62 of them) takes no flow, and a loose end more than 25 m from the next sewer joins the nearest of
  the same size or bigger (any size only when none is in reach). Before this, a 1,500 mm trunk stub
  at Old Derry Rd was joined across the Credit River into a 675 mm local sewer, which showed 231%;
  it now shows 13%. Twinned trunks that a false join had cut off now share the flow, and 17 fewer
  pipes screen over capacity. In the app each development since the census
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
- **Trace a development to the plant** (*Trace sewer* in a development's header, or Servicing › Network's
  *Trace the sewer path*): a dashed line from the site to the 300 mm+ sewer it joins, then every pipe to the treatment
  plant coloured by its capacity state with flow arrows, the pumping stations passed and the plant;
  the panel gives the length and number of pipes, the wastewater blocks passed and the tightest pipe
  (each a link). Also for test sites.
- **Developments on / off** (Layers › Developments, every view): hides or shows all development markers, labels and
  site outlines (remembered).
- **Wastewater loads** (own box, bottom right of the map, Wastewater view; always in sight): *Census (existing) · Built since · Site plan
  approved · Proposed (in review)*; each controls both the development markers shown and the load put on the
  sewers (capacity colours, a pipe's flow table, the trace's tightest pipe). All on = full build-out
  conditions; the legend lists the loads when some are off.
  Site boundaries stay on the map whatever these switches say: a development whose layer is off
  has its boundary dashed and faint, with "Not in the wastewater loads" in its tooltip.
- **Resizable analysis panel**: drag the analysis column's left edge (or focus it and use the arrow keys)
  to give the map more or less room (the width is remembered); on a phone the panel is a sheet at the
  bottom: tap its summary line to raise it, and Esc folds it back.
- **Paths over developments**: flow paths (a development trace, a catchment's or block's route) draw
  above the development markers, and the markers fade while a path is shown; *Developments: Show ·
  Faded · Hidden* in the bottom bar picks how (remembered). The map fits the path into the part not
  covered by the panel.
- **Tap an existing sanitary sewer** (Layers › Existing network › Existing sanitary sewers): a 300 mm+ sewer opens the same pipe in the
  network screen, with every development draining through it and how its flow is calculated; a
  smaller local sewer (not traced) lists the developments within 100 m that likely connect to it and
  links to the nearest 300 mm+ sewer.
- **Existing pipes** (Layers › Existing network): Region of Peel watermains and sanitary sewers, Mississauga /
  Brampton / Region storm sewers, loaded live by map area from zoom 15 (cached by ~1 km tile); tap
  for diameter, material, year, slope; *Size labels* labels each pipe (and the sewer capacity
  layer) with its diameter. While the sewer capacity colours are on, the existing sanitary sewers
  carry no labels of their own (they covered the capacity labels, which show size and %); their
  size stays in each pipe's tooltip. The development's Servicing tab reports every existing main of each type
  within 100 / 200 / 400 m — size, material, year, the street it runs along (reverse geocoded:
  ArcGIS World, then OpenStreetMap) and distance, pieces of the same main merged; tap one to see it
  on the map — and the oldest / moderate-risk sanitary sewer on the site's path (first
  3 km, from `data/sewers.json`).
- **DC needs** (development brief, DC main / facility panels, *Capital › DC timing* from Layers › More settings):
  existing capacity against the 2026 DC capital program. For each constraint a development relies
  on — sanitary sewers on its path at 90%+ of full-pipe capacity by build-out (grouped by the DC
  main that runs along them, i.e. a twin or replacement), pumping stations (master plan firm
  capacity), the plant (90% of rated), the water treatment system (South Peel or Caledon wells,
  90% of rated max day), storage (master plan assessment) and the large mains into its pressure
  zone level (rough, 1.5 m/s; `data/water-supply.json` from `scripts/build-water-supply.js`) — the
  room after existing + approved development in people and units, the year approved and proposed
  growth uses it up (Horizon years phasing), and the relieving DC project. Red when it runs out
  before the DC project (or none is planned), orange "check the data" when the census flow alone
  exceeds the full-pipe capacity from the published slope. Tap a DC facility for what it relieves and
  the developments relying on it; a DC main's card has both verdicts and the developments relying on it
  by tier (the DC projects allocation), then what it relieves. Every constraint, at DC timing's Status
  and System, is in Capital › DC timing's full table (the table the DC timing tool result drew).
- **Fire flow and stormwater** (development brief, live): Region hydrants within 150 m (count,
  nearest, recorded pressure zone, flagged against the mapped zone) and the nearest large
  (750 mm+) watermain within 1.5 km — hydrant flow tests are not published; the nearest
  stormwater pond within 1 km (Brampton with design controls and risk grade, Caledon with
  assumption status; Mississauga publishes none) and the watershed / subwatershed.
- **Outside the mapped areas**: a development outside every pressure zone or traced drainage
  area is assigned to the nearest one within 5 km of its edge (greenfield lands beyond the existing
  network, gaps in the trace) and marked "nearest" in the panel and tables; the Scenario control's
  switch "Outside mapped areas: Leave out" restores the strict boundaries. Farther away it is left
  out (likely private well / septic).
- **Servicing check** (a development's Servicing › Network): the whole development's flows at Peel design criteria
  (L/s as in an FSR, ML/d below), its pressure zone and share of the zone's build-out max day, the
  traced sewer path from its catchment to the plant with its share of the flow at each outlet, and
  what it means for the plant's uncommitted reserve (built / approved are already counted,
  proposed would draw on the reserve). Pumping station and trunk capacities aren't published by
  the Region, so only the plant is checked against capacity.
- **Water** and **Wastewater** tables (Servicing › Network's full table; they were the bottom panel's tabs). Like the Growth tab, each row is split into
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

- **Plants** (Servicing › Capacity's full table; was the Plants tab): each plant beside its 2025 annual report — rated
  capacity, reported average and highest day, the model today (census + built since + external inflows) and a
  calibration factor (reported ÷ model) — is in Records › Data checks (the Servicing model group). The table is each plant's total inflow (Lakeview, Clarkson,
  Inglewood, the Peel total, and Malton / City of Toronto separately) as census + external
  inflows (York Region 36.1 ML/d to G.E. Booth; City of Toronto 30.2 ML/d, plant not stated, in
  the Peel total) + built since + approved + proposed = build-out: population and jobs, average
  dry, peak dry, I&I and peak wet weather in ML/d, and average as a % of rated capacity. A growth
  layer's peak is the increase in the plant's peak when it is added (peaking is not additive),
  with the running total below; I&I sits with the existing system.
- **Calibrated to 2025 flows** (the Scenario control's Wastewater › *Capacity check (2025 flows)*) scales each plant's population and
  employment flow so the model today matches its 2025 reported average (G.E. Booth ×1.63,
  Clarkson ×1.19 on the 2021 baseline); the factor absorbs existing employment and institutional
  flow, dry-weather infiltration and anything not modelled. I&I is not scaled.
- **Plant capacity chart** (top of the Plants table, Servicing › Capacity's full table): each plant's average dry weather flow as a %
  of its rated capacity, stacked existing (census + external inflows) → built since → approved →
  proposed, with a 100% line. The gap from existing + approved up to 100% is the **uncommitted
  reserve capacity** (Ontario MECP Procedure D-5-1: rated − existing − committed), shown as a
  dashed box with its population equivalent at the plant's flow per person today, plus what is
  left (or short) after proposed applications and the **population at 100%** = (rated − external
  inflows) ÷ flow per person. It follows the Flows and diversion switches; D-5-1 uses measured
  flows, so *Calibrated to 2025 flows* is the matching basis. Population equivalents are skipped
  where too few census people map to the sewershed (Inglewood).
- **Horizon years** (Servicing › Capacity › Charts and method): each plant's average dry weather flow as a % of rated
  capacity from 2025 to 2051, with approved growth phased in over a set number of years (default
  2026, 5 years), then proposed growth (default 2028, 10 years), optional further growth beyond
  today's applications (people per year, shared by today's population) and the diversion from its
  start year. A table gives 2025 / 2031 / 2041 / 2051 and the year each plant reaches 80%, 90% and
  100%. Assumptions are editable and kept in the browser; hover shows each year's values.
- **70 ML/d diversion** switch (the Scenario control): models the planned east-to-west diversion from
  G.E. Booth to Clarkson (operational 2027–2028 per the 2025 reports) as a fixed transfer, taken
  off G.E. Booth's average and peaks and added to Clarkson's at every growth layer; the Peel
  total is unchanged. On the 2021 baseline, calibrated build-out moves from about 107% to 94% of
  G.E. Booth's rated capacity and from about 70% to 90% of Clarkson's.

**2020 Master Plan** (`data/peel-reports.json` → `masterPlan`; Probe data sources mode
`masterplan` downloads Volumes 1–4 as text to the `ref-docs-mp` branch):
- Pumping stations: firm capacities of the 31 lake-based stations (Vol. 4, Table 6) are matched to
  the traced pumping-station areas, and each station is loaded by the sewer arriving at it (the
  pipe within 120 m carrying the most people). Servicing › Network's wastewater table, the development servicing
  check (the stations on the development's own pipe route) and the capacity layer show the
  build-out peak dry and peak wet weather flow (design criteria) as a % of firm capacity; the
  Region expands a station when peak wet weather reaches firm capacity. Peak wet is approximate
  (I&I on the land draining through the published 300 mm+ network). Hover a station for the master
  plan's note (e.g. McVean: exceeds firm capacity before 2026, +700 L/s needed).
- Plants: the 90% line in Horizon years is the Region's expansion trigger (Vol. 4, s. 2.3.1).
- Water storage: the Region's storage assessment (Vol. 3, Table 12; required vs available, 2019–2041)
  and storage criteria in Servicing › Capacity.

**Development panel** (its layout before the five tabs, *One development layout* below: the Brief is now the Overview's *About*, History and the source records Records') — high level first, details on demand:
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
   **Aerial check** (runs when opened) and **Source records**, collapsed. Every source record
   shows its portal (e.g. *City of Brampton Open Data*), a link to the record in its ArcGIS
   FeatureServer layer (queried by object ID), and the pulled-on date (the snapshot build date,
   or the live-load time after Refresh live). The header shows *Data as of \<date\> · \<n\>
   sources*, linking to the sources list.

`data/council.json` is built weekly by `scripts/build-council.js` from the Mississauga, Brampton
and Caledon eSCRIBE portals (planning committees, council, general committee, since 2019; only
meetings in the last 120 days are fetched again), and loaded only when a development is opened.

**Applications against the 2051 forecast** (Growth › 2021 existing, below the growth chart): for each
municipality, the 2051 population, unit and job growth allocated by the Region (Land Needs
Assessment Report Update, draft municipal allocation, appendix pp. 5.2-109 / 5.2-119; Peel 2.28
million people and 1.07 million jobs by 2051) beside the growth already in the pipeline since the
census — built, approved, proposed — and what is still to be planned for. Units are the fairer
comparison (design persons per unit are higher than average household size).

**References** (Records › Sources, `data/peel-reports.json` → `standards`): the Peel Linear
Wastewater Standards, the Water and Wastewater Modelling Demand Table (Aug 2024), the Watermain
Design Criteria (2010), the FSR requirements, the 2020 Master Plan, the 2020 DC Background Study,
MECP Procedure D-5-1 and the MECP design guidelines, and the Fire Underwriters Survey — each with
what is used from it, checked against the documents (Probe data sources mode `refs-council`
downloads them to the `ref-docs` branch).

**Region of Peel 2025 annual reports** (`data/peel-reports.json`, listed under References in
Records › Sources): the [wastewater annual reports](https://peelregion.ca/water/wastewater/wastewater-annual-reports)
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
straight across. Switch to **North up** in Layers › Base map (*Orientation*; top right). Rotation uses the
[leaflet-rotate](https://github.com/Raruto/leaflet-rotate) plugin.

**Aerial photos** are drawn 40% transparent (60% opacity, as one layer) so project dots, boundaries and census lines stand out; road and place labels stay fully opaque.

**2021 census areas:** the 2021 Census dissemination areas show as a light border
(off by default: tick **2021 census areas** in Layers › Planning context to show them; the swatch beside the toggle shows
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

## Existing water facilities

**Layers → Water facilities** shows the Region's existing water facilities: treatment plants,
pumping stations, reservoirs, elevated tanks, standpipes, boosters, wells and re-chlorination
stations. The layer is on by default in the Water view. Servicing › Network's full table lists them
(Existing water facilities), by transmission system.

`scripts/build-water-facilities.py` builds `data/water-facilities.json` from these sources:

- **Locations:** the Region's open data (`water_infrastructure` layers 1–3), on the
  `servicing-raw` branch.
- **Capacities:** the 2020 Master Plan, Volume 3.
  - Tables 4–6: each pumping station's pumps by the zone they feed, with installed, firm and
    actual firm capacity.
  - Table 7: reservoir and tank volumes.
  - Tables 9, 11 and 12: treatment, pumping and storage against the forecast to 2041, with
    shortfalls flagged.
- **Plant ratings and 2025 flows:** the drinking water reports.
- **Planned works:** linked from the 2026 DC maps by name.

**Water capacity by growth layer** (Servicing › Capacity's full table) uses the same bars as the
wastewater plants: existing, built since, approved and proposed, with the uncommitted reserve.

- **Treatment** compares South Peel and the Caledon well systems against their rated capacity.
  Existing is the 2025 measured maximum day, with growth added at Peel's design criteria, the same
  basis as the Overview.
- **Pumping into each pressure zone** compares the firm capacity of the pumps that lift water into
  zone n or above against the design maximum day of zone n and every zone above it.

Alloa's location isn't published, so it is listed in the table but not shown on the map.

## Sewer profile

**⌇ Sewer profile along this path** (in a sewer trace's summary) and **Sewer profile downstream** (in a pipe's panel, about 3 km) open a long-section of the sanitary sewer:

- **Ground**: from terrain tiles (AWS Terrarium), sampled at each pipe's ends and middle. Accurate to roughly ±1–2 m, and it can miss creek crossings, so the ground can look lower than the pipe where a trunk crosses a valley.
- **Pipe**: drawn from the published upstream and downstream inverts and the diameter (`invertUp`, `invertDown` and `lengthM` in `data/sewers.json`, from the Region's wastewater mains layer). About 200 of 14,057 pipes have no inverts; these are estimated from the next pipe and the slope, and drawn dashed.
- **Sewage**: the flow in each pipe at the results year and scenario (the same model as the capacity colours), drawn at its Manning normal depth (n = 0.013). Blue means part full, orange means 85–100% of capacity, and red means surcharged. For a surcharged pipe a red line shows the hydraulic grade, rising upstream from the crown at Sf = S0 × (Q / Qfull)².
- Hover or tap the profile for a pipe's invert, ground, cover, flow vs capacity, and freeboard or surcharge height.
- **Click a pipe** on the profile (on a phone, tap it, then *Show on the map*) to close the profile and zoom to that pipe on the map. The pipe is marked with its size and % of capacity, and the bar at the top of the map has *‹ Back to profile*, *Pipe details* and × (clear). On a phone the bottom sheet drops to 30% while you look; going back restores it.
- Long paths have windows: whole path, the first 2 km, and ±1 km around the tightest pipe (the default above 8 km).

This is a screening view, not a hydraulic model. It shows normal depth pipe by pipe, so it ignores backwater from downstream, drops and manhole losses.

## Applications in a development, related applications and drilling down

- **Applications in this development** (Records' full table at a development, when it has several files): each
  formal application once, with the pre-consultation on its land (same civic address or
  overlapping boundary) nested under it. Open any one to see it **on its own**, with the same
  five tabs: the application, its
  pre-consultation and the building permits inside its land. *← Whole development* goes back.
  On the map the application stands out in purple, with the rest of the development dashed in
  orange (a key sits at the top of the panel), and the map fits the application. Hovering a file
  in the lists previews it on the map in purple.
- **Related applications**: other developments with a file on the same land, either overlapping
  by at least 15% of either boundary or at the same civic address. Neighbours that only share an
  edge don't count. Each link says how they relate (covers / within / overlaps / same address).
  For example, the precinct 52-6 pre-consultation PRE-2026-0007 lists the draft plan OZS-2025-0035
  on its land. That development lists the block plan whose land it overlaps, OZS-2025-0033 at
  10869 Heritage Rd (2,656 units), with its pre-consultation PRE-2024-0117. *← (development)*
  goes back across.
- **No double counting**:
  - A file opened on its own is a view and is never added to a total.
  - Pre-consultation units are never counted, because the formal application repeats them.
  - Each file appears once in a development's list.
- **"0" addresses**: "0 Heritage Rd" and similar addresses are placeholders for land with no
  civic number, used for many unrelated files along one road. They no longer group files into one
  development. Such files group by land (boundaries and location) instead. 334 files at 125
  placeholder addresses were affected. Previously "0 Heritage Rd" merged a 13-tower site, two
  precinct draft plans and their pre-consultations, and counted only the largest file's units.
  Across Peel this adds 50 developments and 1,382 active units that the merging had hidden.
- **Precinct and block plans**: a draft plan of subdivision inside a precinct or block plan is
  its own development, linked through *Related applications*. Before this, a 114 ha precinct
  plan absorbed every draft plan inside its boundary. The precinct plan counts only the units its
  draft plans don't already carry, and says so. Example: precinct 52-2, OZS-2025-0014 at
  10344 Mississauga Rd, holds three draft plans as separate developments with 259 units:
  - OZS-2026-0034 at "0 Mississauga Rd" (207 units);
  - OZS-2025-0015 at 10512 Mississauga Rd;
  - OZS-2025-0017 at 10916 Mississauga Rd.

  The area plan's Servicing and Capital tabs show the whole area:
  its own remaining units plus its draft plans. Records' full table names them (*Area plan: N draft
  plans inside this precinct …*). This is a view; each draft plan still counts once, in its own development. Infiltration
  is counted on the draft plans' land, not the whole precinct boundary. Example: precinct 52-2
  shows 41.7 L/s peak wet for its 259 units.

  Site plans and condos inside a subdivision are still part of it. Peel's unit total is
  unchanged (+1 unit), with 17 more developments. Each related link reads *within* / *covers* /
  *overlaps* / *same address as* the file it matches.
- **Are the files in a development related?** An audit checks every development with several
  planning files: each pair should share land (at least 15% overlap) or a civic address. 1,167
  developments have several files, and 7 contain a file that doesn't connect to the rest. Those
  are phased master-planned communities (e.g. Lakeview Village) and neighbouring parcels that one
  owner filed together. Two grouping errors are fixed:
  - Brampton's "unit-civic" addresses ("102-499 Main St S" is unit 102 at 499 Main St S) were
    read as number ranges. "10-499 Main St S" invented a "10 Main St S" and pulled in a site plan
    2.5 km away. In Brampton a leading pair is now always unit-civic. Elsewhere it is a range only
    when ascending, on the same side of the street and within 60 numbers ("65-71 Agnes St").
  - A file more than 1.5 km from the rest of its address group (a mistyped or mis-geocoded
    address) groups by its own location, and a multi-address join never links groups more than
    1.5 km apart. Peel's totals are unchanged.
- **Build-out by application** (it was the Demand tab's, under *Units, jobs & build-out*, where a development
  has several files or a file without a unit count; the five tabs do not show it):
  - One row per formal file: planned units, plus the permit units inside its boundary (permitted,
    completed, left). A permit counts in the smallest file boundary that holds it.
  - Each row says whether it is *counted* or *within the counted proposal*. Site plan or condo
    phases add up; for an official plan / zoning / subdivision file the largest counts.
  - Tap a file to open it on its own.
- **Units only in the attachments**: some descriptions say "refer to the attached cover letter /
  PJR" and give no unit count. About 76 files, nearly all in Brampton. Their documents are public on
  BramPlanOnline, but they are found by searching the file number and are not read automatically.
  - Those rows were flagged in *Build-out by application* (above), and the unit count from the cover
    letter could be entered. Entry was also offered where the development had no count at all.
  - The figure is kept in this browser (that table marked it *your figure*, × removing it) and counted
    like a published one in the development and every total.
- **One address, different land**: official plan / zoning / subdivision files filed at the same
  address whose boundaries don't overlap are separate proposals. Each is its own development, and
  the precinct rules above relate them.
  - Example: OZS-2025-0016, a 9 ha draft plan filed at precinct 52-2's address, is now a draft
    plan within the precinct.
  - Example: on The Gore Rd in Caledon, 21T-22002C (394 units) was hidden under a larger
    subdivision at the same address. Peel's total rises by 394 units.
- **Unit counts listed by type are added up**: "a maximum of 299 single detached, 217 street
  townhouse, and 52 back-to-back townhouse dwelling units" is 568 units, not 52. Rules:
  - A figure followed by "consisting of / comprising / including / of which" is a summary of the
    parts after it and is counted once.
  - Not counted: buildings and blocks ("2 apartment buildings"), decimals and measures
    ("126.5 single", "1181.36 SQM", "11.1m towns"), zone names ("to Residential Semi-Detached"),
    existing houses, and industrial / commercial condominium units.
  - Units the description leaves open ("additional units in two future mixed-use blocks") aren't
    counted. The *Build-out by application* entry could add them.
  - 86 files read higher, e.g. 10512 Mississauga Rd (OZS-2025-0015) 52 → 568. Peel +4,964 units
    (+5,508 active). Snapshot records are re-read when the app loads.
- **Unit counts written as "unit count: 2656"** in a description are now read (e.g. OZS-2025-0033:
  2,656 units), including from the weekly snapshot.

## Latest submission on labels and titles

**Latest submission.** The map labels (*Address, stage + latest submission* and *Address*) and the
development's header show the latest application submitted on the site: its date received and file number. The
open data carries each file's first submission date, not resubmissions.

## Development panel tabs

A development opened on six tabs (the last one picked was kept; since navigation phase 5 it has the five, Overview · Growth · Servicing · Capital · Records: *One development layout* below):

- **Overview** — status, latest decision, build-out, the latest Functional Servicing Report link,
  the proposal, aerial check.
- **Demand** — units, jobs & build-out, with *Demand by stage* (total, completed, remaining) in
  place of the build-out stepper: a Water | Wastewater switch shows one system's rows at a time
  (water average / max day / peak hour, or wastewater average / peak dry / I&I / peak wet; employment
  and totals likewise; the choice is remembered). Then flows by stage and the sewer path. (Servicing
  allocation is hidden from the panel.)
- **Water** — trace the water supply from the plant; demand, supply route, watermains, fire flow.
- **Wastewater** — trace the sewer path to the plant; flows, path and tightest pipe, plant reserve,
  sanitary sewers; the site (ground, storm sewers, stormwater).
- **DC Analysis** — the DC projects potentially required: each wastewater and water constraint the
  development relies on, when it runs out and the DC project that relieves it; the planned works it
  connects to or sits on the path of (with the year it needs them); and the DCs it would pay.
- **History** — how the phase was set, the dated history, source records.

The bottom panel's tabs ran Overview · Growth · Demand · Water · Wastewater · DC Analysis (now the same five).

## Map boxes, the results year and the tour

- **More settings** is a fold at the foot of Layers (top right). Layers stops at the map's
  height and scrolls, More settings with it.
- **Site boundary on hover:** point at a development (mouse / trackpad) and its application site is
  outlined in dashed orange with its address, phase and units; one without a published boundary
  gets a dashed ring. Layers › Developments › *Site boundary on hover* (on / off) and More settings › *Boundary reach* (10–120
  screen pixels, default 40), remembered in this browser.
- **View switch** (Planning / Water / Wastewater / Capital, in the top bar): the full labels always show; on a narrow
  screen or with a wider system font the buttons wrap onto a second row rather than being cut off.
- **Clear selection and the Developments Show / Faded / Hidden switch** sit at the top of the map,
  between the controls on the left and the boxes on the right (stacked when the gap is narrow); on
  a phone, under the Layers panel. Fitting a trace leaves room for them.
- **Results for year** (Scenario control) runs from the **2021 Census** to build-out
  (2021 Census · Today · Build-out). Before today, growth built since the census counts in
  the share of it completed by that year (Peel-wide, by units and completion date); approved and
  proposed growth phase in from their horizon years as before.
- **A development open:** on a wide screen Layers and the wastewater loads box
  move left of the panel; the Clear selection button centres in the visible map. On
  a phone (bottom sheet) Layers stays above the sheet, and the timeline, legend and
  loads box step aside until it closes.
- **Tour:** 15 short steps in chapters (Start, Find, Map, A development, Analysis, Help). Steps set
  the app up as they go: a real development opens, its Servicing tab and sewer trace show, then the
  Analysis tabs. Progress dots (tap to jump), Back / Next, ← → keys, Esc to end; the tour tidies up
  after itself. Help › *Tour of the full map*.

## Growth tab and the 2020 Master Plan comparison

**Growth tab.** *Growth since the census* (census population and dwellings, built since, committed,
not committed yet, the growth chart and the 2051 forecast check) is Growth › 2021 existing (Growth › Areas' until
2026-11-03; before that its own bottom-panel tab, **Growth**, next to **Demand**, which kept the servicing demand of
the shown developments).

**2020 Master Plan vs this tracker.** Servicing › Network's existing water facilities and Records › Data
checks' Servicing model group (the wastewater plants) open with a table
of the facilities the 2020 Water and Wastewater Master Plan assessed: capacity, the Master Plan's
forecast for 2026 · 2031 · 2041, and the tracker's numbers (today, + approved, + proposed, build-out),
with a bar per row (Master Plan years as dashed ticks, capacity as a line) and the Master Plan
year whose forecast matches the tracker's build-out.

- Water (maximum day, Vol. 3 Tables 8, 9, 11): South Peel system, A.P. Kennedy and Lorne Park
  WTPs (today = 2025 measured maximum day), Lorne Park Zone 2 high lift, Beckett Sproule transfer,
  West Brampton Zone 5 low lift and Zone 6 high lift (today = Master Plan 2021 + growth built since
  the census). A development counts at a facility when its supply route (the water trace's station
  chain) passes it.
- Storage (Vol. 3 Table 12): Silverthorn and West Brampton reservoirs, Master Plan figures only
  (fire and emergency storage isn't modelled).
- Wastewater (average day, Vol. 4 Tables 7–8): G.E. Booth (incl. York and Toronto flows) and
  Clarkson, using the plant chart's sewershed totals.

## Functional Servicing Reports and the water supply route

**FSR link.** A development's **Overview** (*About*, its *Servicing report* row) gives its latest Functional Servicing Report.

- `scripts/build-fsr.js`, run weekly with the data snapshot, reads the municipalities' application
  pages. It matches their file numbers to the applications and keeps the newest document named a
  functional servicing / servicing report or brief.
- **Mississauga:** its active application pages (official plan / rezoning and subdivision files,
  about 57 of the 1,006 applications), found through the site's search and the pages' address
  pattern. The City's pages build their document list in the browser, so the row links the
  application page and points to Project documents rather than the PDF itself. Site plans have no
  public page.
- **Caledon:** its application pages, with each application type's own numbering (direct PDF links;
  64 pages carry an FSR).
- **Brampton:** documents are public on
  [BramPlanOnline](https://planning.brampton.ca/CitizenAccess/Cap/CapHome.aspx?module=Planning&TabName=Planning),
  with no sign-in. A file is found by searching its number: the portal's pages need its internal
  record ids, which the open data doesn't carry. So the row links the search and names the newest
  file to look up.
  - Brampton's reports aren't read automatically. The portal is open to people, but its firewall
    turns away automated requests: every page answered "Request Rejected" to an automated check on
    2026-10-21. The app doesn't try to get around that. Reading them needs the City's agreement or a data feed from it.
- A link to all of the application's documents comes with it.

**Supply route.** Servicing › Network's fold *Water: supply route and fire flow* shows where the water comes from, like
the sewer trace.

- From the development's pressure zone, it takes the nearest station whose pumps feed that zone
  (2020 Master Plan pump groups). It repeats from that station's reservoir zone down to the
  treatment plant.
- Each step shows the pump group's firm capacity.
- Below the route is the pumping into the development's zone as a share of firm capacity.
- Caledon's groundwater areas show their well system instead.

**Water supply trace.** In a development's header, beside *Trace sewer*, **Trace
water** draws the route on the map like the sewer trace.

- Between the stops above (plant → stations → site), it takes the shortest path along the Region's
  watermains of 300 mm and larger, preferring larger mains, and the planned water mains of the 2026
  DC capital maps. Planned mains join existing ones at their ends (within 300 m) and wherever they
  run within 25 m of one.
- Existing mains are solid blue (thicker = larger), planned DC mains are dashed (tap for size, year
  and project), and arrows run from the plant to the site. The stations are labelled. A step with no
  mapped main between its stops is drawn straight (dashed grey).
- Developments fade while it shows (Show / Faded / Hidden switch), and Clear selection removes it.
- The summary gives the length on existing and on planned mains (with the DC years), the stations
  passed with their firm capacity, the distance from the site to the network, and the pumping
  capacity used.
- `data/watermains.json` is built by `scripts/build-watermains.js` from the Region's watermains
  (linework-raw download), rebuilt by the probe workflow's `sewer-build` mode. It loads only when a
  water trace runs.
- Indicative only: valves, pressure reducing stations and the hydraulics decide the real flow.

**Sites outside the mapped zones and catchments (both traces).**

- *Water*: the pressure zone is estimated from the ground elevation (terrain tiles) and the 2020
  Master Plan's zone table (Volume 3, Table 3: grade line and serviceable ground per lake-based
  zone, e.g. Zone 6 serves 214.5–259.1 m below a 304.8 m grade line). Where the ground fits two
  zones, the zone a planned DC water main within 1 km feeds decides, then the nearest mapped zone,
  then the grade line giving about 55 m of pressure. Ground above Zone 7's range goes to the nearest
  Caledon groundwater system. The Supply route row and the trace say how the zone was chosen.
- *Wastewater*: a site outside the traced catchments, or with no existing sewer of 300 mm+ within
  400 m, follows the planned DC wastewater mains. From the planned main nearest the site (within
  1 km) it takes the shortest path along them to where they reach an existing sewer, preferring the
  catchment that main serves, then the usual pipe-by-pipe route to the plant. Mains that stop short
  of the one they feed are bridged (up to 600 m, straight, and noted). The planned path is dashed
  pink; the maps don't give flow direction, so it is indicative. With no planned main reaching the
  network, the trace joins the nearest existing sewer within 3 km and says so.
  - Sewers flow into the same size or bigger. A planned main hands over only to an existing sewer
    at least its own diameter (a main the DC maps give no size for: at least half the largest
    planned main on the path so far). Where no such sewer is in reach, the trace falls back to one
    at least half the size. A 900 mm trunk doesn't empty into a 375 mm local sewer; it carries on
    along the planned trunk to an existing one. The Region's own network is used as published:
    about 1.6% of its pipe-to-pipe links step down in size, nearly all at manholes where the
    published network does. For example, 11722 Mississauga Road and
    0 Creditview Road (21T-25008C) follow the Credit Valley trunk (25-2225 → 25-2224 → 28-2139) to
    the 600 mm sewer, not the 375 mm sewer near Wanless Drive. A site whose join point is within
    25 m of an existing sewer still connects to that sewer.
  - The summary lists the DC projects the path relies on and their DC map years. Before the latest
    of them (at the results year) the site has no outlet on this route. The line updates as the
    results year moves; already built sites are shown as indicative.
- Both traces fit the route on the rotated map, clear of the open panel and the boxes along the
  map's edges. The route stands out: a white halo with a dark casing under it, white dashes moving
  in the flow direction (still if the device asks for reduced motion), and the other map layers
  and the base map dimmed while a trace is shown.

## DC funding scenario

**Funding scenario** (Settings › Labs › *DC funding*, then Capital › DC timing's full table) tests a DC budget over the next N years (default 10). There
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
- the projects outside the window that Capital › DC timing says to bring forward, with their cost;
- a CSV export.

## Change log and versions

The **change log** (Help › Start here › *What's new*; on the full map, *Change log* beside the data date
on the timebar) lists every release of the app, newest
first. One release is one pull request merged into `main`, numbered **1.<pull request number>**
(for example 1.111). Each release shows its title, the bullet points from its description, the
date, a link to the pull request and the build (commit).

- `scripts/build-changelog.js` builds `data/changelog.json` from the first-parent git history.
  The deploy job runs it with full history, so the log always includes the release being
  deployed. The weekly data snapshots are listed as data updates, which you can switch on.
- **Current version:** the release whose commit matches the app-version stamp. It is marked
  "You're using this version", and it is also shown under Records › Sources.
- **What's new:** releases since this browser last opened the log are marked New, and a dot
  shows on the top bar's Help until you open it.
- You can filter to new features or fixes, search the log, and download it as CSV.

### Phase 0 — Trust and transparency

- Renamed the app to **Peel Growth Pipeline (unofficial)**; the home-screen install name stays
  **Peel Dev**. A slim banner strip at the very top of every screen reads *Unofficial prototype
  · public data only · not a Region of Peel product*; the same line is printed on the executive
  briefing, the servicing memo, the area report, the print map, the Excel Summary sheet, the PDF
  footer and the CSV header comments.
- Every source record (development → Source records, permit pop-ups) now shows the portal name
  (e.g. *City of Brampton Open Data*), a link to the record in its ArcGIS FeatureServer layer
  (queried by object ID), and the pulled-on date (the snapshot build date, or the live-load time
  after Refresh live). CSV and Excel Developments / Records exports gained `portal`,
  `source_url`, `retrieved_at` and `source_record_id` columns.
- Capacity and DC results are labelled **screening estimate** wherever they appear.
- On phones, a plain tap no longer opens the press-and-hold info card: it appears only on a
  genuine ~650 ms press-and-hold with the finger still down (pointercancel handled; `js/info.js`).

### Phase 1.5 — Design system

- **Dark mode is the default.** Settings → Display offers Dark / Light / Follow device, remembered
  per browser (localStorage `peel-dev:theme`); it is never part of share links. An inline script in
  `<head>` sets `data-theme` before first paint, so there is no flash of the wrong theme.
  PDF / print output always renders light (report documents set `<html data-theme="light">`; the
  main app forces light on `beforeprint` and restores after).
- **Colour tokens, single source.** Every colour is a CSS variable in `css/app.css`
  (`:root` = dark, `:root[data-theme="light"]` = light, plus a follow-device media query).
  No hard-coded colours remain in `js/` — `js/app.js` reads them via `phaseColor()` /
  `token()` (getComputedStyle, cached; cache reset on theme change).
- **Phase colours are distinct hues** (no longer a blue ramp): Inception light violet, Under
  review violet, Approved blue, Permit issued cyan, Under construction teal, Completed grey,
  Withdrawn/refused grey outline only. Red / amber / green are reserved for capacity state
  (over / tight / room: `--cap-over` / `--cap-tight` / `--cap-room`); orange (`--select`) is
  reserved for the current selection. The palette passes WCAG AA (4.5:1 text, 3:1 symbols) and
  protanopia/deuteranopia pair-distinguishability checks — see `scripts/colorblind-check.js`
  and `tests/tokens.test.js`. All map symbols carry a thin outline so they read on any
  background.
- **Type:** five sizes (11 / 12 / 14 / 16 / 22 px), two weights (regular 400, medium 500),
  tabular numerals in tables and tiles, tile numbers larger and heavier than their labels,
  sentence case throughout.
- **Spacing/shape:** 8 px grid (4 px tight gaps); 8 px radius on panels and cards, fully round
  chips; decorative borders removed (kept on inputs and tables); floating map panels are
  280 px wide and corner-anchored.
- **Modes:** density Compact (desktop default) / Comfortable (phone default, meetings), toggled
  in Settings → Display. **Present** (top-left map control, under Help): full-screen map +
  headline sentence + four large tiles (developments shown, units planned, people at build-out,
  jobs); Esc exits.
- **Motion/loading:** opening a site flies the map to it and fades the panel (≤250 ms);
  `prefers-reduced-motion` disables both. Loading spinners are replaced by skeleton
  placeholder blocks.
- **Basemaps:** Water, Wastewater and DC views use a dark grey canvas; Planning uses aerial,
  slightly darkened so data stands out. Zooming to 15+ on the canvas basemap switches to
  aerial automatically for site checks; a manual pick in Layers is respected otherwise.

## One set of numbers: pages and the full map agree

Home, the other pages and the full map's panels show the same figure for the same thing.
Browser checks (`npm run browser`) compare them for Peel and each municipality at every counting
basis, and for every plan, sub-area and precinct.

| Figure | One rule |
|---|---|
| Built / left to build | A development marked completed with permits still open: the homes on open permits are left to build ("permit issued, not built" on the stage chart), not built. The stage chart's "not yet built" equals Growth's left to build. |
| The units figure under the Scenario | Says what it counts: *planned* (every stage), *applied for (no pre-application)*, *approved, not yet built*, or *left to build*, with "of N planned" beside it. Home › Growth › Areas follows the Scenario for units, people and jobs, as the Overview does. |
| Capacity and the DC program on Home | Region-wide (a plant serves more than one municipality): with a municipality picked, those figures say "Peel-wide". |
| First 90% trigger | The first treatment plant (wastewater or water) to reach its 90% expansion trigger, then the most loaded: the same plant on Home, Servicing › Capacity and the Overview's headline. A facility's own *limit* (firm capacity, full pipe) is named as a limit, not a trigger. |
| This week | One list of changes for Home, the Overview, the badge and the This week page, in the municipality picked; none on the first (baseline) update. |
| Dormant developments | Held out of every count (`PeelPhases.dormantOf`); the stage charts on Home and Growth › Areas say how many homes are left out. |
| Plan areas | A plan filter on the map (and a drill on Home › Growth › Areas: the drill is the filter) holds the developments Growth › Areas counts there, by the same placement (`PeelPlanTables.areaIdsOf`): a straddling development by its share, precincts and sub-areas included. The Overview and the header count the part inside the plan (units, people, jobs), with what the straddling developments hold outside it named beside. A precinct filed under the plan holding most of it can't pull a development out of the plan it sits in (Bram West 40 (d) was counted at half). |

## Sections: a page shows every map tab for its scope

Each full-map tab's panel (Overview, Growth, Servicing, Capital, Records) is a **section**
(`js/sections.js`, the registry of the views a page hosts, `VIEWS`, by scope and `tab:sub`). A page hosts
them as the map does, under its header, by the map's five tabs and their views (navigation phase 6: *Home
hosts the map's tabs*, below): **Home** at Peel, a municipality or a plan, and **a site's page** (a development
picked in Find or the search; `#w=p:fsr&d=` opens it at Servicing › FSR review) at a development: Overview, Growth, Servicing (its views Network · FSR review),
Capital (the DC projects it relies on, then the EAs and works near it, one panel) and Records, the open
tab the map's own.
Each is the map tab's own panel, so the page and the map read the same answer and figures; a
section whose tab builds its panel only when opened (Capital, Records) is built for the page on
demand. Nothing about a site is only in the full map.

## Find: one step for a site, a plan or an area you draw

Home's sidebar had one **Explore** entry for what were five: Growth in an area, Check a site,
Review an FSR, Forecast and Study area were its views. Since navigation phase 6 an area's two are Home's
tabs (Growth › Areas and Growth › Forecast); since navigation phase 7 the sidebar's entry is **Find**, the
Find step (the `site` page with no development: an open one closes first, as Home closes it), and the old
`explore` id opens the site you have open, else Find. The row of the five views at the top of each is gone
(navigation phase 6c, §5 row 45): Home's Growth tab, Find and the search (a site), Draw an area (Study area)
and *Check FSR* in a site's header (Review an FSR) reach the same places. Find lists **Recently active**,
**Large files under review** and **Files with an FSR posted** (a row with an FSR opens the site's page at
Servicing › FSR review); the FSR reviewer's own Find step stays (`#w=p:fsr`, its shortcut *Find › Files with an
FSR posted*, the step's eyebrow too), its FSR list first and its line linking back to Find (*Any development → Find*).
- The one search (an address, a file number, a description) and **Draw an area** are in every
  page's header, not only Find's (see *Find from every page* below). A site picked from an area
  view (the search, a list row, the map) opens on its page.
- A site shows where it sits on the top bar's trail, **Peel › municipality › plan › site** (the plan
  tree's placement, as the plan filter), on its page and on the map; each step makes that level the
  filter, closes the site and keeps the tab (from its page, Home at that tab: navigation phase 6b).
- A site's page has the map's tabs: Overview, Growth, Servicing, Capital and Records; **FSR review** is
  Servicing's second view (the cross-check and what an FSR should cover), Servicing's views Network · FSR
  review under the strip, as on the map. An area's are Home's tabs: Growth › Areas (the drill-down) and
  Growth › Forecast.
- A site's Overview (the map's development Overview, the same panel) has the **path line** under
  Wastewater, *Path to the plant*: from the site, the pumping stations on its sewer path in flow order, each at its
  build-out peak wet weather against firm capacity, then the plant and its uncommitted reserve (or the
  City of Toronto system), and how the outlet was set (Automatic, Confirmed or Set by hand). *Review →*
  opens Review outlets at the development when its review queue lists it, once the DC impact model
  has been worked out in this visit (Capital › DC timing once its list has painted, Review outlets or
  the DC project map; the Overview never builds it). Its *Infrastructure coming* row names the DC projects it relies on, by
  number and name as the search lists them, late ones first ("Relies on 25-2945 – G.E. Booth Water
  Resource Recovery Facility (late), 22-1005 (in time)"): each constraint on its path that needs
  relief, by its first relief with a project number; the name is the DC main's, else the facility's
  (a plant step, a facility's item). One late project makes the row *Check*, whatever the connection's
  own verdict. Review outlets also opens from Records › Data checks (*Review outlets →*) and the
  QA/QC role's shortcut (navigation phase 7: the sidebar's QA/QC entry went).
- The views keep their own ids (`site`, `fsr`, `growth`, `outlook`, `study`), so links, share links and
  the map views' `#w=` links still work.
- A site's page has the **live map** beside the open tab's answer, at the site, with the infrastructure around
  it: existing water, sanitary and storm mains (from street zoom), the 2026 DC works, Region
  construction and the EA study areas, and the developments; each layer is a chip under the map.
  The full map gets its own layers back when you open it.
- Home's **Servicing** and **Capital** tabs (were an area's sections): the map's Servicing › Capacity and
  Capital › DC timing panels and their other views. They are Region-wide (the plants and the DC program
  serve more than one municipality), and say so once inside a municipality or a plan, in the map's words
  (one *Peel-wide* note under the strip: `js/svc-scope.js` `peelWideText`).
- An area's developments are **one table** (js/dev-table.js), in place of the lists of plans, site
  servicing permits and developments. Group it by the next level down (municipality, plan or
  sub-area: each group makes its level the filter), by stage, by site servicing permit (each group shows its
  developments on the map) or not at all; sort by name, units, left to build or last activity. Each
  group heading carries its totals and a bar of its homes left to build by stage; ten rows a group,
  then **Show all**. A row opens the site. The stage buttons filter the table, the treemap and the chart.
- Under the map, a **treemap** of the same: a box per area, sized by homes left to build (homes built,
  under Built since 2021), a tile per development coloured by its stage (the 30 largest a box, the
  rest as one tile). A tile opens the site, a box's name makes its level the filter. Hovering a tile or a table
  row rings the development on the map; hovering a box rings its developments and outlines its area.

## Find from every page

Navigation phase 1 (docs/architecture-review/navigation-design.md §3.3). Every page's header, Home
included, has the one search and **Draw an area** beside it (the drawn area's own page, *Draw an area*, draws on its own
map). Draw an area opens the map with the Select tool on; on a phone the bottom
sheet drops to its peek, so the map is there to draw on.

On a page, a pick opens what it found (`js/workspaces.js` `pageRoute` and `routePick`):

| The pick | Opens |
|---|---|
| A development | Its page on Overview (from FSR review's Find step, Servicing › FSR review) |
| A file number (a development matched by it only) | Its page at Records, the file's row in the tree marked |
| A secondary plan or character area | Its filter, the map and every tab following it, on the tab you were on (from Home's Overview, the briefing at the plan with its Area report) |
| An MTSA | Its filter (as on the map), its municipality first, on the tab you were on |
| A plant, station, block, zone or South Peel water | Its scope on the map (← Page: Home › Servicing) |
| A DC project | Home › Capital › DC timing at the project, in place: its developments by tier and both verdicts |
| A DC facility, or an address | The map (Capital's or a site's map view), then the facility card or the pin |

- **Pages only.** On the full map and in a page's map view the search works as before (a plan
  sets the map's plan filter, a facility opens its scope there); `routePick` returns false outside a
  page.
- **The drill is the filter** (navigation phase 6, owner decision 10). A plan picked on a page, a level
  picked on Home › Growth › Areas (a municipality, plan, precinct or sub-area row, a table group's *Open →*,
  a treemap box) and Home's *Plans furthest behind their target* rows set the map's filter
  (`js/ws-pages.js` `drillTo`: `state.muni` and `state.sp`, the MTSA, zone and block filters cleared, one
  `applyFilters`), so the map and every tab follow it; the page stays on the tab it was on. The
  **two-part rule** (pros-and-cons M6, P4-11): a development partly in the plan is in the filter (any
  share, `PeelPlanTables.areaIdsOf`, as before); the plan's own totals count only its share
  (`PeelPlanRollup.within`): the top bar's count, Home's Growth figures at the plan ("+ N planned in the
  parts of k developments outside it", as the Overview says), Growth › Areas' node and By period's rows.
  Two plans in the filter, one inside the other (a link's `sp=a,b`: a plan and its precinct), count the
  level under once, in the plan, so these never exceed the developments shown.
  The Forecast and the Overview's other figures count the members whole, and say so where both show
  ("the developments in or partly in <plan>, whole"). *Not in a plan* and *Elsewhere in the plan* stay
  groups of the table, not levels (no filter expresses them). *↑ Up a level* and the drill's crumbs are
  gone: the way up is the top bar's trail (*One trail*, below); Home's Peel and municipality buttons are
  places too (a municipality is the whole of it, a plan or MTSA filter going with it). An MTSA pick sets
  its municipality first, then (the map's own handler) its own filter.
- **Its Area report is the level's.** At a municipality, plan, precinct or sub-area, *Area report (PDF)*
  reports that level's developments (`data-ws-areareport`, js/ws-pages.js; Home's Overview at one plan has
  it too), with the outline on its map: a development partly in the plan counts whole, as the map's plan
  filter counts it, so the title says "(developments in or partly in it)" where the level has an outline.
  At Peel it is the developments shown, as before. The report lists the plan's developments, any share,
  as the filter does; Home's figures and By period count the plan's share.
- **"← Page"** after a facility pick goes to Home › Servicing, at the view the map view was on
  (Capacity unless another was picked there), as from the pages' facility rows.
- **Typing is never interrupted.** While the box has the focus, the page it is on is not rebuilt
  (Home refreshes every second while its figures load, and data landing redraws a page): the render
  waits until the box lets go. A pick lets go of it on a page, so what it opens renders at once.
- **Hits need loaded data.** Plans, facilities and DC projects come from `state.areas`,
  `state.servicing` and `state.dcInfra`, and file numbers from each development's `records`; until
  they are in, the list says so in a muted line. Zones, stations and blocks are offered once the
  servicing lookup is filled (`svcById`, with the DC program), so a pick never lands on an empty map
  view; a scope that still does not open is taken on a page and nothing moves. A change that loads
  these lazily must load them by the box's first focus.

## Servicing and Capital: Home's tabs, the map's sub-views as views

- **Servicing** (Home's tab; the old `tight` page id, the role shortcuts and Home's group link open it at
  Capacity: the sidebar entry went in navigation phase 7): **Capacity** (the
  old Servicing capacity page's builder: limits, the 90% trigger, the uncommitted reserve, no relief in time;
  the allocations recorded a fold of it, navigation phase 2, below), **Network** (the map's panel,
  its footer's actions first) and **Old pipes** (the old `pipes` id and the capital role's shortcut open it: one spec with the map's
  panel, its small map of the runs beside it; navigation phase 6c, below).
- **Capital** (Home's tab; the old page ids, the role shortcuts and Home's group link open it at DC timing): **DC timing** (the old Capital
  page's builder: every 2026 DC project with both verdicts; a project opens in place, with its map, and
  *Open the map* opens its card there), **EAs** (the EAs, then EA to construction) and **Projects** (the
  map's panel; navigation phase 4, below).
- Each view is a page builder where the page adds to the panel, else the map's own panel
  (`js/sections.js` `VIEWS.area`), built on demand when its tab hasn't been opened, so the page and the
  map read the same (navigation phase 6: *Home hosts the map's tabs*, below).

## Servicing and Records (navigation phase 2)

Navigation phase 2 (docs/architecture-review/navigation-design.md §3.4, §5, §7). Servicing has two
views, **Capacity · Network**, at Peel as at a development (where Capacity is hidden, as before). (Phase 5
adds FSR review at a development, phase 6c Old pipes at an area: *Home hosts the map's tabs*, its 6c part.)

- **Allocations recorded** is a fold of Capacity's panel (the status, each plant's room at the 90%
  trigger after the allocations, the latest five, and *Export or import the CSV ›*). Its tables (the
  plants' room after allocations, the Export / Import CSV bar, every allocation, each row opening its
  development) are a section of Capacity's full table, after the facility table and the charts.
  Allocations are still recorded at each development (its Servicing panel's *Servicing allocation*
  fold). Home's Servicing › Capacity shows the fold too.
- **Network** lists the **existing water facilities** (and, with Settings › Labs › Hydraulic check on,
  the **hydraulic check**); both are in its full table, after the pressure zones. They are Peel-wide,
  so a development's Network full table leaves them out (`#analysis.site-scope`, css/app.css).
- **Records › Data checks** is the one list of checks: the data checks, the duplicate check, then the
  **Servicing model** group (was Servicing › Model checks): the 2020 Master Plan against this
  tracker, the 2025 reports against the model with each plant's calibration factor, the 2025 water
  production, the Caledon wells, and, once they load, the Ministry's measured plant flow and the
  collection system report's pumping-station roster (until now only on the gear's Sources & checks
  page). `#pane-svc-checks` keeps its id; it is Records' pane now (`data-pane="records"`).
- **Records › Data checks' panel** lists the data checks, then the **Servicing model** (a row a
  comparison with its measured figure: each plant's calibration factor, South Peel's maximum day, the
  largest difference between the Ministry's and the Region's plant flow, the station roster, the
  Caledon wells; each row opens the full table at its comparison, *See all* at the first), then
  **Where developments discharge**: *Review outlets →*, with the count still to review once Capital ›
  DC timing has worked out the DC model (building that model walks every sewer pipe, so Records
  never builds it). *Review outlets* is in its footer too, beside *Duplicate check*. Home's Records ›
  Data checks (Help › Start here links there) shows the same panel (kept up to date as the servicing model is rebuilt, a Scenario change
  included, whichever tab is open); its Servicing model rows and *See all* open the full map's Records
  › Data checks full table at their comparison, and its Review outlets row opens the page from there.
  Review outlets is the QA/QC role's first shortcut since navigation phase 7 (its sidebar entry went).
- **The Sources & checks gear page is gone.** It was reached only from the Overview's ⓘ line
  (*Data & checks →*); that link is now *Records › Data checks →*, and it works in the Overview
  panel's Method fold and from a page too (it did nothing there). Freshness and the references are
  Records › Sources; every check, the two that were only on that page included, is Records › Data
  checks. ⚙ opens Settings, one sheet, Labs a section of it (navigation phase 7; `window.GearPages`).
- **One System control**, *Both · Wastewater · Water*, on Servicing › Capacity's list and Capital ›
  DC timing's list (DC projects' until navigation phase 4; and Home's Servicing and Capital tabs): one pick, kept in
  this browser (`sysPick`, `js/analysis-tabs.js` `setSys`), Both to start. It was two switches, *All ·
  Wastewater · Water* (Capacity, for the visit only) and *Wastewater · Water · Both* (DC projects, stored,
  Wastewater to start); DC timing now opens at Both, and a browser that had picked a system there
  keeps that pick, for both lists, the first time. Each list names its system (Capacity's header *Peel ·
  water*, *Water projects*). The System narrows the panel's list; Capacity's full table keeps every
  facility of both systems, and Home's figures never filter. Home's Servicing › Capacity header and
  figures count both systems too, so they match Home's figure that opens the page; the System narrows
  its *Soonest limits* list, which names it (*Soonest limits: water*). A System tap redraws DC timing
  only while its DC model is worked out for the Scenario or its list is on screen (building that model
  walks every sewer pipe); otherwise the next Capital open draws it at the new System. A share link
  carries it as `sy=` (only when not Both; a link without it opens at Both and does not change the
  stored pick).
- **The lens sets the System** to what its map shows: Water → Water, Wastewater → Wastewater, Capital
  → Both; Planning leaves it. Water and Wastewater still open Servicing and Capital opens Capital (the
  owner's change of 2026-10-16). Only a lens tap sets it: a workspace or a page that sets its map view
  (the Servicing capacity page opens the Wastewater view) leaves the System as it is.
- **One sort vocabulary**: Capacity's panel sorts *Soonest · Largest impact* (its full table keeps the
  panel's order). Capital › DC timing (navigation phase 4, below) sorts *Soonest · Largest impact ·
  Most affected* (and *$ a unit*, Labs): a different measure (units relying on a project) keeps its
  own words, and every sort button's tooltip names what it sorts by, so each *Soonest* says which year.
- Pane ids are unchanged (`#alloc-body`, `#wfac-body`, `#svc-checks-body`): the workbook and the
  reports read them as before. At a development the workbook's Water sheet leaves out the Peel-wide
  water facilities, as Network's full table does there (`OFF_AT_SITE`, `js/exports.js`).

Old names still land (`js/analysis-tabs.js` `SUB_MAP`, `FOLD_OF`, `sysKey`; tests/nav-aliases.test.js):

| Old | Where it opens now |
|---|---|
| `#t=svc&svs=alloc`, `#t=ww&ws=alloc`, a saved view, `data-at="svc:alloc"` | Servicing › Capacity, the fold *Allocations recorded* open (for the visit, until it is closed) |
| `#t=svc&svs=checks` | Records › Data checks (`t=records&rs=checks`) |
| `#t=water&ws=facilities` | Servicing › Network |
| `#t=water&ws=hydro` | Servicing › Network, with Labs › Hydraulic check turned on |
| A stored Allocations pick (`svcSub=alloc`) | Capacity |
| A stored Model checks pick (`svcSub=checks`) | Records › Data checks when Servicing was the tab last picked; otherwise Servicing opens on Capacity and Records keeps its own pick |
| The Overview's ⓘ *Data & checks →* (the Sources & checks gear page) | Records › Data checks (`data-at="records:checks"`) |
| Settings › Usage counts `sub:svc.alloc`, `sub:svc.checks` | Shown and exported as `sub:svc.capacity`, `sub:records.checks` (`js/usage.js` `aliasKey`, through `migrateSub`); the counts kept are not rewritten |
| DC projects' stored system pick (`dcProjSys`) | The one System pick (`sysPick`), read once while that is unset |
| A link without `sy=` (every link before phase 2) | The System at Both, as Capacity opened them |

## Growth: By period in the Forecast (navigation phase 3)

Navigation phase 3 (docs/architecture-review/navigation-design.md §3.4, §5, §7; pros-and-cons N-4).
Growth has three views, **Pipeline · Areas · Forecast**. The pipeline ledger (was Growth › Ledger,
docs/pipeline-ledger-plan.md) is the Forecast panel's fold **By period**:

- **By period** (open to start; a reader who shuts it finds it shut next time, `ledgerOpen`): the
  units (or people) left to build in the developments shown by milestone (2026 to 2031, 2032 to 2041,
  2042 to 2051, after 2051 or not timed), each cell stacked by stage, committed first, with its answer,
  key and notes. Its **own stage cut-off** (*Committed only · + Plan approved · + In review ·
  Everything*), *Units | People* and *Hide possibly lapsed* are the ledger's, kept in this browser as
  before (`ledgerCut`, `ledgerMeasure`, `ledgerHideLapsed`). The cut-off counts stages for this table
  only, as its hint line says: it is a filter of the table (owner decision 2), never the Scenario's
  Count, which sets the rest of the app.
- **Its rows are the scope's child nodes**: the municipalities at Peel, a drawn area or a servicing
  scope; at a municipality (the map's municipality filter, with no plan, MTSA or census-area filter)
  its plans and *Not in a plan*, each development split by its share of each plan as Growth › Areas
  places it (`PeelPlanTables.compute()`, the plan tree), so each plan's row is its left to build in
  Areas and the total row (named for the municipality) is the municipality's. At a plan (one plan filter,
  with no MTSA or census-area filter, a municipality set or not; navigation phase 6) its parts (its
  sub-areas and precincts) and *Elsewhere in the plan*, each development by its share of each (a plan with
  no parts: one row, the plan, at each development's share); the footer is the plan's (its share-weighted
  left to build, = Growth › Areas' node: `rollup(…, { byShare })`), and a note names the developments
  with homes left to build that lie partly outside it (By period counts the part inside, the Forecast's
  figures count them whole). A plan the tree does not hold keeps municipality rows.
- Then the folds **How sure** (the tiers A to E) and **Since the last snapshot** (shut to start; the
  latter only once `data/ledger/index.json` names a frozen snapshot, until then the full table says
  how the first is written).
- **The developments list** (sortable; stage, tier and expected year; a row opens the development)
  is the Forecast's **full table**, after the Forecast's own tables: the fold's *The N developments,
  with stage, tier and expected year (full table) ›* opens it there. The full table also holds By
  period's table, the tiers, Since the last snapshot and the ledger's method (`#ledger-body`, in
  `#pane-growth-ledger`, which keeps its id and is now `data-sub="timing"`).
- **The numbers are the ledger's, unchanged**: `js/ledger.js`, `compute()` and the roll-up are
  untouched; at Everything, units, nothing hidden, Peel equals Growth's left to build, and By
  period's 2026 to 2031 column equals the Forecast's units expected by 2031 (one time-in-stage model;
  both checked in the browser paths). Export ▾ › Pipeline snapshot (CSV) reads the same model.
- **What's coming** (the analyst's shortcut, the sidebar entry until navigation phase 7; the `coming` chip and page) opens the Forecast with By period
  open: the chip on the map, the page as Home › Growth › Forecast with By period first, above the
  Forecast's figures, under the Forecast's question (navigation phase 6; the map's panel keeps its order). The page
  lost the ledger's own four figures (its answer keeps three of them) and its inline developments
  list (one tap: the full table); its *Open Growth › Ledger* is gone.

Old names still land (`js/analysis-tabs.js` `SUB_MAP`, `FOLD_OF`, `openFold`; tests/nav-aliases.test.js):

| Old | Where it opens now |
|---|---|
| `#t=growth&gs=ledger`, a saved view | Growth › Forecast (`gs=timing`), By period open |
| `data-at="growth:ledger"`, `openTab('growth', 'ledger')`, `showFootTab('growth', 'ledger')` | Growth › Forecast, By period open (`setSub('growth', 'ledger')`: the Forecast, the fold as it is) |
| A stored Ledger pick (`gSub=ledger`) | The Forecast (never Pipeline) |
| The `coming` chip (`#w=coming`) | Growth › Forecast, By period open (`WS` `fold: 'period'`) |
| The What's coming page (`#w=p:coming`, the sidebar's entry until phase 7, the analyst's shortcut, a stored `lastWs=coming`) | Home › Growth › Forecast, By period first and open (navigation phase 6; was the Forecast page under *What is coming, where, when and how sure?*; the page id is kept as an alias now that the sidebar entry has gone, navigation phase 7) |
| The ledger's stored settings (`ledgerCut`, `ledgerMeasure`, `ledgerHideLapsed`, `ledgerSort`) | Unchanged |
| Settings › Usage counts `sub:growth.ledger` | Shown and exported as `sub:growth.timing` (`aliasKey`, through `migrateSub`); the counts kept are not rewritten |

New links write `gs=timing` and carry no fold state.

## Capital: DC timing · EAs · Projects (navigation phase 4)

Navigation phase 4 (docs/architecture-review/navigation-design.md §3.4, §5, §7; pros-and-cons N-6, N-11).
Capital has three views, **DC timing · EAs · Projects**. DC timing and DC projects are one list
(`js/dc-projects.js`); the page and the workspace keep the name *DC projects*.

- **One row per 2026 DC project**, on the key both DC models give a DC line (its project number, its
  contract where it has none: `ln.p || ln.c`), with **both verdicts, named**: *in service before the
  capacity it relieves runs out* (the capacity model, `js/dc-cost.js` `dcAnalysis`: the year the
  capacity runs out, "in service after it runs out" or "in service in time", "nothing held back if
  cancelled", "check the data") and *first homes before it is built* (the DC projects allocation,
  `js/dc-impact.js`: "3 expected before it is built" or "first homes in time for the 14 relying on
  it"). The two answer different questions and can disagree: a main can be in service before the
  capacity it relieves runs out and still after the first homes of a development that needs it to
  connect, or the reverse; the method says so. A project that relieves no modelled constraint says
  so and shows under All only; so does one the capacity model has only for the developments connecting
  to it ("relieves no capacity constraint: developments connect to it", never "in time" for a capacity
  that does not run out, and not drawn on the chart; Soonest puts it after every capacity verdict).
- **Status** (Late · In time · Check the data · Room · All, each with its count, Late's with the late
  reliefs that are no DC line; a status no row has is left out), the **one System control** and **one
  row of sorts**: *Soonest* (the year the capacity it relieves runs out), *Largest impact* (held back by
  build-out if it were cancelled), *Most affected* (units relying on it), *$ a unit* (Labs). Each button's tooltip names its measure. The *late* figure
  sets the list to Late. At Wastewater or Water the answer's largest relief is that System's, and the
  build-out total (the largest constraint of either system) says *both systems*.
- **The second verdict is worked out after the list paints** (the allocation walks every sewer pipe and
  development): the rows say "working out who relies on it…" for a second or so, then fill; once per
  Scenario. Home and a development's Overview never build it.
- **Plant expansions, 2020 Master Plan mains and DC facilities** relieve constraints too but are no DC
  line. Late, they count in the header, the *late* figure and the Late chip, the answer names each
  ("Also late, with no DC line: G.E. Booth WRRF (Lakeview): expansion to 600 ML/d (in service 2037,
  capacity runs out ≈2029)", the name opening the facility it relieves), Late lists them after the DC
  projects and the chart draws them; a plant's or a pumping station's is with its facility in Servicing
  › Capacity, and the full table's capacity analysis lists every relief.
- **The full table**: the list in full (both verdicts, filtered as the panel; a row opens the project;
  at Late the late reliefs that are no DC line named), then **the constraints** at the Status and System
  (`js/masterplan.js` `consTableHTML`: the DC timing tool result's table, a name opening what loads it, a
  relief its project or facility; BOD loading and the 2020 Master Plan trunks have no facility in
  Servicing › Capacity, so this is their panel home), then the capacity analysis (if one project were
  cancelled: its Year select, sorts, CSV and timelines), then, with the Funding lab on, the screening
  results and funding levels. The Funding lab's screen is a fold of the panel (with the DC projects
  relied on but not in the screen). Not moved by this phase, and listed by no later one (§8): the Year
  select still sets the analysis year itself (§5 row 199 would have it read Scenario › Results for
  year), and the funding screen's Within · Outside filter stays on its Screening results table (§5 row
  197 would put it in the Funding fold).
- **A row opens the project's scope** (`dcwork:<sys>:<key>`, the same as a tap on the DC main, a search
  pick or an `ss=dcwork:…` link). On the map, its **card** on the Overview (`js/dc-projects.js`
  `cardHTML`, drawn by `js/masterplan.js` `showDcLine`): trail *Peel › DC timing › the main* (the *DC
  timing* step closes the card and opens Capital › DC timing, navigation phase 8b), a headline with both
  verdicts, the two verdicts as lines,
  who relies on it as the page's project says it (units and flow in the headline; the developments by
  tier, their units and people + jobs, and their flow as lines), every development on it by tier (needs
  it to connect, needs it for capacity, on its path but not needed; past the first 30 the rest in a
  fold; the map and the left panel filtered to them, a row opening the development), the Funding lab's
  lines (never in the public version), *CSV: its developments*, *All DC projects ›*, then *What it
  relieves*. The allocation is worked out after the
  card first paints ("Working out the developments relying on it…"), then the card is drawn again, once
  (the tap itself never walks every pipe; the build runs after the paint). A redraw, after the
  allocation or the sewers it waited for, never moves the reader: the phone's sheet and the card's scroll
  stay as they were (the card is its Overview alone: another tab closes it first, navigation phase 8b).
  For a DC main the developments come from the DC projects allocation (one model per answer: the card's
  older "Developments relying on it" list, the first draft of the same rule, stays for DC facilities,
  which the allocation does not cover). On Home's Capital › DC timing the project opens in place (both
  verdicts, then the developments by tier, five a tier with *See all* opening the rest in place, the
  funding fold with the lab, its own map), the strip's *DC timing* returns to the list, and *Open the map*
  opens its card. A DC project picked in a page's search opens there.
- **A Status no project has** keeps the list and its chips, with one line saying none is, so *All* is
  one tap away. (Today no DC line is late and a plant expansion is: Late lists it.)
- **The DC timing tool result is the list.** Layers › More settings *DC timing: capacity vs DC projects
  →*, a development's *All DC timing →*, a constraint's *← DC timing*, Help's *Show me* and
  `App().showDcTiming()` open Capital › DC timing (on a page, Home's Capital tab) at the Status the
  workbook's filter holds (`PeelMasterPlan.dcnFilter`, Late to start), closing the development or result
  open, as the result did. The System is the one control as the reader left it: a link never sets it.
  The result's own Both · Wastewater · Water seg (the last of three System controls) is gone. Its
  constraints are in the list's full table, at the list's Status and System (see above); the workbook's
  DC sheet still lists them, filtered by `dcnFilter`, which only the list's Status chips write (their status and the System at the
  tap; the late figure and Home's figure set the list's Status only).
- **Home's *DC projects late*** keeps its source: every relief in service after the capacity it relieves
  runs out (`dcAnalysis`), Peel-wide, never filtered. A tap opens Home › Capital › DC timing with the
  list at Late: at System Both its header, *late* figure
  and Late chip say Home's number, and Late lists every one.
- **Home's Capital tab** (was the Capital page; navigation phase 6): DC timing · EAs · Projects. The
  Projects and EAs lists it borrowed under DC timing are gone: they are its views.
- **EA to construction joins EAs.** One builder (`js/capital-ea-model.js` `eaFlowSpec`, with the
  timeline `eaTimelineHTML`) for both hosts. On the map, Capital › EAs ends with the fold *EA to
  construction* (shut to start; its answer, four figures and the timeline, a row opening the EA; *The
  EAs and the construction after them (full table) ›* opens the full table at its first list), and the
  full table has the EA table, then EA to construction (the timeline, its four lists as tables, the
  other-work, unknown-date and conflict folds, its method). The fold is kept as the reader leaves it (a
  tap on its own summary, never a redraw: phase 3's rule) and worked out once per data and
  municipality. At a development there is no fold (the EAs near the site, as before; since navigation
  phase 5 they are in Capital's one view there, under the DC projects it relies on). The EA to
  construction chip (`#w=eaflow`, an old link) opens Capital › EAs with the fold open (`fold: 'eaflow'`,
  `js/analysis-tabs.js` `openFold`). On Home, Capital › **EAs** is the `eaflow` page's
  builder: the map's Capital › EAs (its answer, figures and lists, built when the map has not drawn it),
  then EA to construction (its timeline, lists and folds), the EA map; every row opens the EA on the map.
  Home → Capital → EAs is two taps, as EA to construction was. Beside the EAs its counts say their own
  measure: an EA with an addendum is complete there (current in the EAs' count) and one with no status
  published is under way ("Of 45 completed EAs (2 with an addendum under way) … 30 are under way (4 with no
  status published)"). On a phone the timeline's rows are 44 px and the fold's link wraps.

Old names still land (`js/analysis-tabs.js` `SUB_MAP`; tests/nav-aliases.test.js):

| Old | Where it opens now |
|---|---|
| `#t=dca&dcs=dcproj`, a saved view, `data-at="dca:dcproj"`, `openTab('dca', 'dcproj')` | Capital › DC timing (`dcs=timing`) |
| `#t=dca&dcs=funding`, `dcs=recommendations` | Capital › DC timing (`funding` still turns Labs › DC funding on, and the Funding fold is in the panel while it is on) |
| A stored DC projects pick (`dcSub=dcproj`) | DC timing |
| The stored sorts `dcaPnlSort` (DC timing's), `dcProjSort` (DC projects') | One stored sort, `dcSort`: DC timing's, else DC projects' *Most affected* or *$ a unit* (its *Soonest*, the construction year, is not carried), else *Soonest* |
| The stored open project (`dcProjSel`) | No longer read: Capital opens on the list |
| A DC project picked in a page's search (`wsec: 'dcproj'`) | Home › Capital › DC timing at the project (navigation phase 6: no `wsec`, the page's view is the map's) |
| Settings › Usage counts `sub:dca.dcproj` | Shown and exported as `sub:dca.timing` (`aliasKey`, through `migrateSub`); the counts kept are not rewritten |
| The DC timing tool result (`PeelMasterPlan.showDcTiming()`, `App().showDcTiming()`, `[data-dcn-all]`, `#opt-dctiming`, Help's *Show me*) | Capital › DC timing at `dcnFilter`'s Status (`PeelDcProjects.openList`); the System left as it is |
| `ss=dcwork:<sys>:<key>` (a shared link, a saved view) | The DC main's card, now with both verdicts and the developments by tier (`js/svc-scope.js` `RESTORE.dcwork`) |
| The EA to construction chip (`#w=eaflow`) | Capital › EAs with the fold *EA to construction* open |
| The EA to construction page (`#w=p:eaflow`, `lastWs=eaflow`, `data-ws-page="eaflow"`) | The same page id: Home › Capital › EAs, the fold open (the EAs, then EA to construction; navigation phase 6, `hostOf`); no `PAGE_ALIAS` row |

New links write `dcs=timing|eas|projects`. No page id, `ss=` kind or pane id changes (`#pane-dca-dcproj`
keeps its id; it is DC timing's now, `data-sub="timing"`, above `#pane-dca-timing`).

## One development layout (navigation phase 5)

Navigation phase 5 (docs/architecture-review/navigation-design.md §3.6, §5, §7; pros-and-cons N-7, N-8 /
NP-5, M1, M3, M4, AD-13). A development reads the same on its page and on the full map: one header, the
five tabs, one view per tab except Servicing (Network · FSR review), nothing only in a full table.

- **One header, on every tab and on its page** (`js/panel.js` `siteHead`, `siteTools`, `toolsHTML`): the
  name, the stage, aerial and site servicing permit chips; the flags (stalled, appeal, needs a planned
  main, a station or plant over its limit, the data-quality and "links to check" chips) with **☆ Watch**;
  the identity line (latest file · types · latest submission · n files · *history ›*); one row of tools,
  **Trace sewer · Trace water** (with a location) **· Check FSR · Servicing memo · Inquiry draft**, and
  **⋯** for *Record allocation · Compare · Export (CSV) · Copy link*. The map's site bar (its hidden
  title, facts and servicing line, *Tools ▾* and its FSR box) is gone; its key numbers and zone → plant
  are the Overview's figures and Servicing rows. Each tab's panel keeps its own copy of the header, put
  right when it is shown (☆, a trace on or off, the flags once the DC data is in: `syncTools`; browser path
  *a development’s one header on every tab and its page* follows them, and ⋯'s four items). On a page
  Check FSR opens the page's FSR review and Trace water and Compare open the full map first; on either it
  scrolls the form's fold into view (the cross-check first, §3.6). The "n links to check" flag opens
  Records › Files on the map and on its page. On a phone
  the row scrolls sideways (⋯ outside it, so its menu is never clipped) and a development's header
  scrolls with its panel: with the flags and tools it is taller than the half sheet (364–458 px of 423
  measured), so it no longer sticks.
- **Overview**: the answer, the four figures and the plant bar; the Servicing rows (the path line, the
  DC projects it relies on by name), Timing with the **next milestone**, five things to confirm (the
  rest in a fold), **At a glance** (units, people, people per unit or jobs and floor area by the site's
  type, and how it is counted: "Tree count…" or "Counted from its permits"); folds **About** (open:
  status and why, the latest decision, the FSR, the proposal) and **Approvals timeline**. The verdict
  card that was Open full table's view is gone: Open full table widens the same panel (`spec.widen`).
- **Records**: one view of its files and history: the tree, on this site, the latest activity,
  **Related applications** (were in the full table only) and the fold **Files and events** (the Gantt
  chart and the dated events, without the About block). Its full table draws the files with the panel's
  own tree (`js/file-tree.js` `treeHTML`, each file with *on its own* and, with `links: true`, the link
  that put it there: "same land: use + draft plan · medium confidence, 86% inside"; the panel's tree
  stays compact); *← Whole development* goes back from a file opened on its own. The older list stays only
  for a development with no tree entry. The development's sub-tabs (About · Files & history · Site) and
  `#ov-dev` are gone; *history ›* in the header opens Records.
- **Servicing › Network**: the path (zone → pumping stations → **Discharges to** the outlet: Automatic,
  Confirmed or Set by hand, with *Review →* to Review outlets when its queue lists it → the plant and its
  reserve), the four flows (water maximum day, wastewater average dry, peak dry, peak wet with I&I); folds
  Infrastructure coming, **Water: supply route and fire flow** (was in the full table only; the fire flow
  is looked up when the fold first opens), **Site** (constraints, the aerial check, ground, *Mains near*
  (was "Water and wastewater"), storm sewers and ponds: the old Site sub-view, the Overview's Site fold
  and Servicing's ground fold in one), Servicing allocation and Labs. A development with no units or jobs
  (no servicing figures: about one in five) still gets the panel, its answer saying so, with the Site
  and allocation folds.
- **Servicing › FSR review** (`svs=fsr`, `js/fsr-check.js` `panelSpec`): the one host of the FSR
  cross-check: the path and flows, the fold *The consultant’s figures against this app’s* (the form;
  your figures are kept per development while the app is open), *What the FSR should cover* (all seven
  items), Copy the comparison and Print / PDF; Open full table widens it. At an area it is hidden
  (Capacity · Network), and comes back when a development opens.
- **Capital**: one view at a development: the DC projects it relies on, then the EAs and capital works
  within 1 km (with *Copy for review comments*; *Show EAs on the map* heads the list of the EAs near) and
  the fold *DCs it would pay* (were a second chip and the full table). Its full table ends with the
  site's EA table (Capital › EAs' at the site: Current · Complete · All, the systems, sort, CSV, GeoJSON,
  *Show these on the map*, *Add to calendar (.ics)*), drawn once (`#dca-site-eas`; the hidden EAs pane is
  emptied at a site).
- **Its page**: the map's tabs by their names, **Overview · Growth · Servicing · Capital · Records**
  (were Summary · … · Files · FSR review); on Servicing a second row, **Network · FSR review**. Since
  navigation phase 6b they are the map's own strip and views, the open one the map's (`js/sections.js`
  `VIEWS.site`; *Home hosts the map's tabs*, below). Review an FSR with a site (`#w=p:fsr&d=<key>`) is the
  site's page at Servicing › FSR review; without one, its Find step. Each view's footer is its panel's
  (the Servicing memo; FSR review: Copy the comparison, Print / PDF; …), then Open the map and Another
  site; the Inquiry draft, ☆ Watch and Check FSR are the header's.
- **Counts**: the *Previous* counting switch is retired (owner decision 14; see *Step B1* in [How the numbers are worked out](../method/README.md#step-b1-tree-counts-in-the-app-previous--tree-switch)). A development
  the tree does not count keeps the count from its files and permits and says so. Where the tree
  counts did not load, developments group by address and are counted from their files and permits, with
  Reload in the top bar.
- **The same figures on both hosts** (M3): tests/dev-parity.test.js checks the development model's
  status, files, sub-files and units across the Overview, Growth, the trail and Records for every file
  development (with `data/snapshot.json` and `data/tree-counts.json`); browser path *a development’s
  page and the full map agree* checks a sample in the app. Records' copies of those figures (in
  `js/devtab.js`) now call the development model.

Help › What moved where lists each move. Old names still land (tests/nav-aliases.test.js; browser path
*kept from before phase 5* opens the stored ones and the old links cold in the app):

| Old | Where it opens now |
|---|---|
| `#t=svc&svs=fsr&d=<key>` (new), a stored FSR review pick | Servicing › FSR review at the development; at an area Servicing's first view, FSR review again when a development opens |
| `#w=fsr` (the Review an FSR chip) | At a site, Servicing › FSR review; without one, the Find step on Servicing › Network |
| `#w=p:fsr`, `lastWs=fsr`, `data-ws-page="fsr"` | The same page id: with a site, the site's page at Servicing › FSR review (the map behind it too, so the stored pick, the address and the way back stay on FSR review); without one, the Find step |
| `t=dev`, `t=developments`, a stored `peel-dev:devsub` (About · Files · Site) | Overview; the stored sub-tab is no longer read |
| `dcs=eas` at a development | Capital's one view (DC timing); EAs again at an area |
| A stored `countMode: 'previous'` | Ignored: the tree count |
| The page's sections `summary`, `files` (a search pick) | Overview and Records › Files (navigation phase 6b: `SITE_SEC`; `fileAt` marks the file) |

## Home hosts the map's tabs (navigation phase 6)

Navigation phase 6a (docs/architecture-review/navigation-design.md §3.1 rule 1, §3.3, §3.4, §5, §7;
pros-and-cons N-3 / NP-6, M6, P4-11). Home is the **page host** at an area (Peel, a municipality, a plan):
under its header the full map's five tabs, **Overview · Growth · Servicing · Capital · Records**, in the
map's order and words, then the open tab's views in a row under it (only when it has two or more). A page
and the full map host the same scope with the same tab state: the tab and view the page shows are the
map's (`js/analysis-tabs.js` `viewKey`), so a pick on either is the other's, stored the same way
(`footTab4`, `gSub`, `svcSub`, `dcSub`, `rSub`).

| Home's view | Drawn by |
|---|---|
| Overview | The briefing (`home`, below) |
| Growth › Pipeline | The map's panel |
| Growth › Areas | Growth in an area's builder: the drill-down, its table and treemap |
| Growth › Forecast | The Forecast page's builder, By period first |
| Growth › 2021 existing | The map's panel (`js/census-view.js` `existingPanelSpec`); its full table the census block |
| Servicing › Capacity | Servicing capacity's builder: the limits, the reserve, the allocations fold |
| Servicing › Network | The map's panel |
| Servicing › Old pipes | The Old pipes page's builder: the map's panel (one spec), its small map (navigation phase 6c) |
| Capital › DC timing | The Capital page's builder: a project opens in place, with its map |
| Capital › EAs | The EAs page's builder, with EA to construction |
| Capital › Projects | The map's panel |
| Records › Sources | The Data sources page's builder |
| Records › Data checks | The map's panel |

(`js/sections.js` `VIEWS.area`: its keys are exactly the map's chips at an area, a test.) A view that is
the map's panel shows its footer's actions first (Network's *Show the network on the map*, Projects'
*Show them on the map* and *CSV: every contract*, Data checks' *Duplicate check* and *Review outlets*),
then *Open the map* and *Full table*. A view drawn by its page builder keeps that page's own actions (DC
timing's *Open the map* and *Full table*, not its panel's *Show the planned works*), as before this phase.
A *Show … on the map* action, on a page or a panel, sets that lens (`js/topbar.js`; a page's on the full map,
at its tab and view; the System as it is); before the 6c review only the top bar's switch set it, so these
opened the map at the lens it had.

- **The old pages are views of Home.** Growth in an area, the Forecast, What's coming, Servicing capacity,
  Capital (DC timing, EAs), Data sources (and Old pipes since 6c, below) keep their page ids (links, the role
  shortcuts (sidebar entries until phase 7), buttons, the start screen's last workspace): each opens Home at its tab and view (`js/workspaces.js`
  `HOST`, `hostOf`), its fold open (What's coming: By period; EAs: EA to construction), and Home is lit in the
  sidebar. A view picked on the strip that is one of them (Growth › Forecast, Capital › EAs, Servicing › Old
  pipes) is the start screen's last workspace, as
  the old section bars' buttons were (a view that is none, such as Servicing › Network, leaves it). Their
  section bars are gone (the strip), and so is Explore's views bar on them (on every page since 6c, below).
- **Servicing and Capital show "loading"** until their data lands, on Home's strip and on the map's (they
  used to appear late on the map): picked early, the tab is lit, says loading and opens as soon as it can
  (the pick is held: `heldTab`, `wantedTab`); on a phone the word is "…". Capital › EAs needs neither the
  servicing model nor the DC program: it draws as soon as the EA lists land, the strip still saying Capital is
  loading.
- **Open the map, ← Page and the back bar keep the tab and view.** A view's *Open the map*
  (`data-ws-keep`) opens its map view, with its layers, at the same tab and view; the map view's *← Page*
  goes back to Home at the map's tab and view as they were left; the full map's *← Back to Home ›
  Servicing › Network* names the view and keeps it (and follows a tab picked on the full map meanwhile); its
  way back to a task's map view (This week, Review outlets) opens that view's own tab again, as before (Old
  pipes' is a host's since 6c, kept as the map was left). A
  development or facility opened on the map (a search pick, a facility link) shows its own Overview, which Home
  closes on the way back (it hosts an area), so there *← Page* lands on the map view's page at its own view and
  the back bar at the view the page was left at, never on Home's Overview (`scopeOverview`, `backView`).
- **Home opens on its Overview** (the top bar's Home, Start over, the tours, a Home link made before this
  phase) and closes an open development and servicing scope, as the area pages did. So the full map opened
  from Home is at Overview too; a full map set as the start screen still opens at the last tab picked.
- **The drill is the filter**, with the **two-part rule**: see *Find from every page* above; By period at
  a plan: *Growth: By period* above.
- **One trail.** The top bar's trail is the place: with one plan filter, **Peel › municipality › plan ›
  precinct** (the plan tree's placement, `PeelPlanTables.areaPath`). Each step is a place: a plan's step
  that plan alone (the level under it goes), the municipality's the whole of it (the plan, MTSA, zone and
  block filters go, the others stay; it no longer clicks the filter panel's chip, which kept a plan of the
  same municipality, so a drilled plan had no way up), Peel's all of Peel (the filters stay). After the
  count, **k filters ×**: the other filters on (the place left out: the `activeFilters()` entries without
  `scope`), listed in a popover, each removable, with *Clear these k*, *Reset all* (every filter, the place
  and the search too: the old row's Reset) and an older link's *Include Completed*; × clears the k. It
  replaces the pages' and the workspace bar's *Filters on* row, on the pages and the map. On a phone it is
  one 44 px button (the funnel and the count), its × the popover's *Clear*. On the full map below 1200 px
  (a phone, a tablet), where the top bar's *Filters (n)* button beside it opens the same filters with their
  chips, it is left out, so the steps keep their room; a page and a map view keep it (browser path *one
  trail: a precinct drilled to is the filter …*).
- **What's coming opens on By period**: Home › Growth › Forecast with By period first and open, above
  the Forecast's figures, under the Forecast's question (What's coming's own h1 retired with its page);
  shut, it stays shut. The map's panel keeps its order.
- **One Peel-wide note**: Home's Servicing and Capital views below Peel say *Peel-wide.* once, under the
  strip, in the map's words (`js/svc-scope.js` `peelWideText`, the map's `#scope-note`); at Peel, on Growth
  and Records, and on Capital › EAs and Projects, whose EAs and contracts are the area's own (filtered to
  it), nothing, on both hosts (browser path *phone: Home's Servicing and Capital at a municipality say
  Peel-wide once …*).
- **Share links** made on Home write `nav=3` with the map's tab and view; a link from before (`nav=2` or
  none) on Home or Data sources opens the page's own view (Home: Overview), as it showed when it was made
  (`js/share.js`).
- **Phones** (390 px): the strip and the views row scroll sideways in their own box, the open one scrolled
  in; their buttons are 44 px; Home's strip sits above its groups; nothing scrolls the page sideways (a table
  wider than the phone, Growth › Pipeline's *By dwelling type and stage*, scrolls inside itself, `.dt-wide`,
  on Home as on the map). A place four levels deep scrolls sideways in the trail's own box, scrolled to its
  end, so the place is whole beside the filters button. Above the answer a phone had four navigation rows
  until phase 7 (Home's ☰ *all pages*, the header, the strip, the views row); since ☰ is in the top bar
  (navigation phase 7, §3.8) it has the design's three.

Old names still land (`js/workspaces.js` `HOST`, `hostOf`; `js/share.js`; tests/nav-aliases.test.js
"phase 6a"):

| Old | Where it opens now |
|---|---|
| `#w=p:tight`, the sidebar's Servicing capacity and Help's role buttons (the role shortcuts since phase 7), `lastWs=tight` | Home › Servicing › Capacity |
| `#w=p:growth` | Home › Growth › Areas, at the plan filter's level |
| `#w=p:outlook` | Home › Growth › Forecast |
| `#w=p:coming`, the sidebar's What's coming (the analyst's shortcut since phase 7) | Home › Growth › Forecast, By period first and open |
| `#w=p:projects`, `#w=p:capital`, the sidebar's Capital (the capital role's shortcut since phase 7) | Home › Capital › DC timing (an open project stays in place) |
| `#w=p:eaflow` | Home › Capital › EAs, EA to construction open |
| `#w=p:data`, Help's bar's Data sources (Help › Start here's *Records › Sources* since phase 7) | Home › Records › Sources |
| Help's bar's Data checks (Help › Start here's *Records › Data checks* and the QA/QC role's since phase 7) | Home › Records › Data checks |
| `#w=p:explore` | The open site, else Find (navigation phase 7; in 6a the last Explore view, an area's Home's tab, else Home › Growth › Areas) |
| `#w=home&t=<x>`, `#w=home&nav=2&t=<x>` (Home links made before phase 6) | Home at Overview |
| `#w=p:<area page>&t=<x>`, `#w=p:data&nav=2&t=<x>` | That page's own tab and view (`#w=p:data&t=overview`: Records › Sources) |
| `#w=home&nav=3&t=…&gs=/svs=/dcs=/rs=` (new links) | Home at that tab and view |
| A saved view | Its own `t`, as before (it applies on the full map) |
| The Growth drill's page-local level, `data-ws-drill`, `data-ws-explore` | The map's filter (`drillTo`: `state.muni`, `state.sp`) |
| `data-ws-asec`, `data-ws-wsec`, `sectionAt`, `wsSpecFor`, `areaSpecFor`, `PeelSections.AREA`, `WORKSPACES.servicing` / `.capital`, `filterChipsHTML`, `#ws-filters`, *↑ Up a level* | Gone (the strip, the trail) |

No stored preference is renamed and no pane id moves; the strip counts as the map's own `tab:` / `sub:`
usage keys, so a tab's count adds the page and the map up.

### The site's page hosts a development's tabs (6b)

Navigation phase 6b (§3.1 rule 1, §5 rows 29, 47, 49, 56–57, §7.1). **The site's page is the page host at a
development**: Check a site with a development, and Review an FSR with one, which is the same page at
Servicing › FSR review. Under its header (the flags, ☆ Watch, the tools) the map's five tabs, **Overview ·
Growth · Servicing · Capital · Records**, and on Servicing its views **Network · FSR review**
(`js/sections.js` `VIEWS.site`: its keys are exactly Overview and the map's chips at a development, a test);
the open tab and view are the map's, a pick on either the other's. Phase 5's section bar and its Network ·
FSR review row are gone.

- **Each view is the map's panel for the development** (`js/ws-pages.js` `site`, `host('site')`): its
  answer, figures, lists and folds, and **its footer's own actions first** (§5 row 56: the Overview's and
  Records' *Servicing memo*, Network's *Trace the sewer path*, Growth's *Area report (PDF)*, Capital's
  *Show the planned works*, FSR review's *Copy the comparison*), then *Open the map* at the view and
  *Another site*. A view the map hides at a development (Servicing › Capacity, …) shows its tab's first
  (Network). The eyebrow names the view and the place ("Servicing › FSR review · Brampton"); the Find ›
  Result › Output steps are the Find step's only. Servicing or Capital still loading: the development's
  header stays and the view says it is loading.
- **Where it opens.** A development picked (Check a site's Find step, Home, the search) opens on
  Overview; on Review an FSR's Find step (its list of files with an FSR posted, or a link's `d=`) at
  Servicing › FSR review; a search pick from FSR review stays there; a file number at Records › Files, the
  file marked (another view or development clears the mark). The header's *history ›* and the "n links to
  check" flag open Records › Files on the page. The *FSR review* chip, like *Check FSR* in the header, opens the
  form's fold and brings it into view (on a phone it is far down the page); any other pick keeps the strip
  in sight. A pick on the strip is the start screen's last workspace as the page is named: Review an FSR
  at FSR review, else Check a site (the same as *Check FSR* and the old section buttons left it).
- **Open the map, ← Page and the back bar keep the tab and view** here too: *Open the map* (the footer's, a
  row's, the live map's) opens the site's map view at the view; its *← Page* lands back at it; the full
  map's *← Back to Check a site › Servicing › Network* keeps it (the page hosts its development's
  Overview, so nothing closes on the way back).
- **The trail places the development** (§5 row 47): the top bar's trail at a development reads **Peel ›
  municipality › plan › … › the site**, on the page and on the map (it was *Peel › the site* on the map; the
  site's page had a line of its own, which is gone). The place is the plan tree's
  (`PeelPlanTables.placeOf`: its deepest area; one straddling two, the area holding its largest share,
  where Growth › Areas places most of it), after the steps the filter already has (a Brampton filter's
  step is not repeated). A municipality or plan filter that does not hold it (a Caledon filter, a
  Brampton site picked from the search; Bram West on, the site in Mount Pleasant) gives way to the site's
  own place, never the filter's (*Peel › Brampton › … › the site*, not *Peel › Caledon › the site*), and
  that filter is in the trail's *k filters*, removable there; an MTSA, zone or block, or two plans (no
  plan-tree steps) keep the trail as the filter has it. Each step is that place as the filter
  (`drillTo`), the site closed, the tab kept for the visit, not stored (the site's Overview was never
  picked: a reload opens the tab the map had, as closing the site leaves it) (`js/topbar.js` `devPlace`,
  `leaveDev`); from the site's page, Home, the place's host, at that tab (a view only a development has,
  FSR review or Records › Files, gives way to the area's: Capacity, Sources). The filter's own steps
  (Peel, the municipality, a plan) do the same at a development; the site's own step on its page is its
  Overview from the top. A result kept at the site (the Inquiry draft) keeps *Peel › the site › the
  draft*. On a phone the trail scrolls in its own box, scrolled to its end (the site).
- **Phones** (390 px): above the answer the header, the strip and, on Servicing, the views row (the site's
  own trail line is gone, and Explore's views bar since 6c; Home's ☰ row stays until phase 7); the strip
  scrolls sideways in its own box, the open tab in view.

Old names still land (`js/workspaces.js` `SITE_HOST`, `SITE_SEC`, `hostOf(id, { site })`; tests/nav-aliases.test.js
"phase 6b"):

| Old | Where it opens now |
|---|---|
| `#w=p:site&d=<key>`, Check a site with a development | The site's page at Overview |
| `#w=p:fsr&d=<key>`, a pick on Review an FSR's list, Review an FSR with a development | The site's page at Servicing › FSR review |
| `#w=p:fsr` (no `d`) | The Find step, the files with an FSR posted (unchanged) |
| `#w=p:fsr&nav=2&t=svc&svs=network&d=<key>` (phase 5's FSR review links) | Servicing › FSR review, by rule (`nav` below 3: the page's own view) |
| `#w=p:site&nav=3&t=…&d=<key>` (new links from the site's page) | The site's page at that tab and view |
| The site page's sections `summary`, `growth`, `servicing`, `capital`, `files` (phase 1's search routes, phase 5's sections) | `SITE_SEC`: Overview, Growth › Pipeline, Servicing › Network, Capital › DC timing, Records › Files |
| The site's own trail line (Peel › municipality › plan › site, each a `data-ws-explore` step) | The top bar's trail at the development |
| `siteAt`, `data-ws-sec`, `viewsBar`, `PeelSections.SITE` / `BY_ID` / `viewOf`, `siteTrail`, `exploreBar` | Gone (the strip, the trail; `fileAt` marks a file) |

### The views bar, the task chips and the source line go; Old pipes is a Servicing view; one This week (6c)

Navigation phase 6c (§3.4 "WS BAR ← Page · search · Full map", §5 rows 2, 16, 18, 22, 45, 63, 71; N-2, N-3).

- **Explore's views bar is gone** from the site's page, Review an FSR's and Check a site's Find steps and
  Study area (one row less above the answer on a phone): see *Find: one step for a site, a plan or an area you draw* above. The two Find steps link to each
  other's list in their step line (`js/ws-pages.js` `find`), so Review an FSR's *Files with an FSR posted*, the
  FSR reviewer's start, stays one click from Check a site's, and back; Help › Start here's role buttons open
  both. (Since navigation phase 7 the menu's Find lists both, and Review an FSR's step line links back to Find.)
- **A workspace's map view is the map with only its layers**, the panel at its tab and view, and over the map
  **← Page · the search · Full map** (its *← Page*: "Back to the page, at the same tab and view"). The twelve task
  chips under the search and every panel's source line ("Servicing capacity · from Servicing › Capacity",
  *Full map →*, and once a site was open "✓ Find › Result › Output") are gone: a page's *Open the map* is the
  way in (its layer preset, `LAYERS`, applied once, the page's tab and view kept), *← Page* the way back, the
  page's strip and the panel's own trail name the place. A `#w=<id>` link (all twelve) still opens its map view
  at its tab and view with its preset and only its layers (`startScreen` → `go`). Phone: one row less over the
  map. (Browser path *A map view without task chips*: a cold `#w=tight` opens it with the capacity colours and
  the wastewater blocks, a layer the reader turns on stays on through the map's chips; a cold `#w=week` is the
  one This week spec below, *Open in Watch* on its panel and on its page opens the Watch tab.)
- **One This week** (`js/ws-pages.js` `weekSpec`): the page, its map view (`#w=week`, the Overview panel there,
  `js/workspaces.js` `override`) and Home's *Change* figures read one spec: the answer (the changes since the
  last data update), the four figures (moved stage, new, capital and EA dates, on a tight plant), the lists
  (Moved stage, New files, Capital and EA dates, Your watch list, and the capacity alerts only when the weekly
  feed is published: owner decision 8), the method and sources. Its rows are a panel's (a development opens it,
  a date its record; on the map the top five and *See all* into the Overview's full table); the page makes them
  its own (a development opens its page; a date the map view at it). Its first action is **Open in Watch** (was
  *Watch list*): the full map's Watch, the watch list and alerts. Home's *on a tight plant* figure is the spec's,
  without building the page. Workspaces.js's own `weekSpec` (the Overview's This week rows, top five) is gone.
- **Old pipes is Servicing › Old pipes** (`svc:pipes`; §3.4, §5 rows 9, 21, 38, 104, 136): an area's third
  Servicing view, Capacity · Network · Old pipes, on Home and the map (at a development Servicing shows Network in
  its place, and the pick comes back at an area; `HIDDEN.site`). One spec (`js/workspaces.js` `pipesSpec`) is the
  map's panel (`js/svc-capacity.js` `renderFor`) and Home's view (`js/ws-pages.js` `pipes`): the four figures
  (sewer runs on the list, their length, the oldest and most loaded, the pipes rated moderate risk), the
  likelihood × consequence grid as its chart (`pipeGridHTML`: one grid), the runs (most units first, each opening
  the pipe and what loads it) and the plants they drain to; its first action **Export the list (CSV)**, then *Show
  the sewers on the map*. Its full table (`#pane-svc-pipes`, new; no pane id changed) is the grid, the runs by
  plant and every run (size, installed, risk, units at build-out, segments, length, plant, its grid bands), with
  the CSV. On the map (a map view or the full map, never under a page) the **amber pipes** show while it is open
  (`syncPipes`, run on every tab or view shown; drawn once per list), and stay around a run picked from it (its
  pipe's result on Overview) and after that closes, until another tab or view is shown. It was a page of its own (Asset
  Management) whose map view put its own panel over Servicing › Network (the `pipesSpec` override, gone); the
  sidebar's Old pipes and Help's role buttons (the capital role's shortcut since phase 7) and old links open Home › Servicing › Old pipes. It is Peel's sewers,
  so below Peel it says Peel-wide, as Servicing's other views do. Phone: three chips in the row; the grid fits the
  sheet, scrolling inside its own box if it must.

Old names still land (`js/workspaces.js` `startScreen`, `go`, `HOST`; `js/analysis-tabs.js` `SUB_MAP`;
tests/nav-aliases.test.js "phase 6c"):

| Old | Where it opens now |
|---|---|
| `#w=<id>` (all twelve: `site`, `tight`, `growth`, `fsr`, `outlook`, `study`, `projects`, `eaflow`, `outlets`, `pipes`, `coming`, `week`) | Its map view at its tab and view, with its layer preset, without a chip row |
| Explore's views bar's buttons | Home's Growth tab, the search, Draw an area, a site's *Check FSR*; the Find steps' links |
| `#w=week` | The map view at Overview, the one This week spec in its panel |
| `#w=p:pipes`, `data-ws-page="pipes"` (the sidebar's Old pipes and Help's role buttons; the capital role's shortcut since phase 7), a stored last workspace `pipes`; a link copied on the Old pipes page in 6a or 6b (`w=p:pipes&nav=3&t=svc&svs=network`: the map's tab behind the page, whatever tab it names) | Home › Servicing › Old pipes (`HOST.pipes`; the id stays the last workspace, a strip pick of Old pipes stores it; `js/share.js` reads that nav=3 link as an older page link) |
| `#w=pipes`; a link made in its map view before 6c (`w=pipes&t=svc&svs=network`: its panel sat on Network) | The map view at Servicing › Old pipes, its amber pipes on (`js/share.js` reads that link's Network as Old pipes) |
| `t=svc&svs=pipes` (new), a stored `svcSub: 'pipes'` | Servicing › Old pipes; at a development Network, Old pipes again at an area |
| The `pipesSpec` override on Servicing › Network, the layer tied to the Old pipes map view | Gone (Servicing › Old pipes' own panel; `syncPipes`) |
| `viewsHTML`, `m.views`, `.page-views`, `renderChips`, `#ws-chips`, `.ws-chip`, `srcLine`, `sourceText`, `plan().source`, `.pnl-src`, workspaces.js's `weekSpec` | Gone (no producer left) |

## Home's sidebar, Help and Settings (navigation phase 7)

Navigation phase 7 (docs/architecture-review/navigation-design.md §3.2, §3.3, §3.7, §3.8, §3.9, §5 rows 3–14,
40–43, 53, 157–158, 161–171; owner decisions 5, 6 and 17; pros-and-cons N-1, N-9, N-10, NP-7, P4-10, AD-5, AD-17).

- **Home's sidebar is five entries**: **Home** · **This week** [N] · **Find** · **Help** · **Full map**
  (`js/workspaces.js` `SIDEBAR`, each with §3.2's line: This week's *What changed, and your watch list*). Home is lit on every tab of Home, Find on the Find steps, a site's page and
  Study area, Help on every Help page (a guide's too), This week on This week, a Labs page's own entry while its
  switch is on; nothing on Review outlets (a tool page). The team headings (Planning, Capital, QA/QC, Asset
  Management, Reference) and the entries Explore, Servicing capacity, What's coming, Capital, Review outlets,
  Old pipes and Reference are gone; their ids stay valid (`GROUPS`, `EXPLORE`, `CAPITAL` and `SIDE` are kept as
  alias data) and land where they went: Servicing › Capacity, Growth › Forecast at By period, Capital › DC
  timing, Servicing › Old pipes (Home's tabs), Find, Review outlets (from Records › Data checks, a
  development's path line and the QA/QC role) and Help.
- **For your role**, under Full map once a role is picked: *For your role · <role> (change)* and up to three
  shortcuts, from **one list of six roles** (`ROLES`, owner decision 6: Infrastructure planner or engineer,
  Manager or director, Growth or policy analyst, Capital or asset management, FSR reviewer, and QA/QC). A
  shortcut is a page id (an old page name, through the alias layer), a view of Home (`data-ws-page="home"
  data-ws-at="<tab:sub>"`, `openPage(id, { at })`: not the strip's `data-pg-tab`, which at a site would open the
  development's tab) or a button's own (the Briefing PDF, Draw an area, DC projects late). The FSR reviewer's
  *Find › Files with an FSR posted* is Review an FSR's Find step, its files first, with an open development closed
  as Find closes it (`fresh: true`, `data-ws-fresh`, `openPage(id, { fresh })`); the page id `fsr` itself (Check
  FSR, a link with `d=`) keeps the development, at Servicing › FSR review. With no role, one
  line: *Pick your role for shortcuts →* (Help › Start here). The role is picked on the first-run tour (six
  buttons), Help › Start here (*This is my role*) or Settings › Your role; it is stored as the role's key
  (`role`; the tour's five keys kept, `qa` new), never free text.
- **☰ in the top bar on a phone** (≤ 700 px, on a page): `#tb-nav`, beside Home, opens the same list at the
  top of the page (aria-expanded follows it); the in-page *☰ … · all pages* row is gone, so a phone has three
  navigation rows above the answer (the header, the strip, the views row); the menu's entries and shortcuts, Help's
  role buttons and its questions wrap, so nothing scrolls the page sideways at 390 px. Not on the full map or a map view:
  the map's top bar is full, and Home there is one tap from the list (a departure from §3.3's "pages and map",
  left as it is: phase 9 changed words only; for the owner to revisit).
- **Find** (`find`, an alias of the `site` page's Find step; an open development closes first, as Home closes
  it; `#w=p:find&d=…` opens that development's page) lists **Recently active**, **Large files under review** and
  **Files with an FSR posted** (a row opens Servicing › FSR review; every development's FSR looked up once per load
  of the developments and of `data/fsr.json`, not on each redraw). `explore` opens the open site, else Find.
- **Last place** (owner decision 17, AD-17): Settings › Start screen is **Home · Last place · Full map** (the
  select under the sidebar went). Last place reopens the page last shown (Home or a workspace page: never Help,
  a guide or a Labs page), its tab and view, its place filter (a municipality, or one plan) and its
  development (`lastPlace = { page, view, d, mu, sp }`, stored only when it changes and never while a restore
  is pending; `lastPlaceOf` validates it). The restore waits for the developments (and the areas for a plan,
  20 s at most) and draws the page at once; a development that no longer resolves opens the page without it
  (a site's page: its Find step), a plan that has gone its municipality. A browser with no `lastPlace` yet opens
  its last workspace (`lastWs`) as *Last workspace* did, which is still written. Servicing and Capital say
  "loading" until their data lands, as from any link.
- **Help is four sections** (`js/sections.js` `WORKSPACES.reference`): **Start here** · **How it works** ·
  **Glossary** · **How the app decides**; every eyebrow says *Help*. Start here: the six roles, each with its
  shortcuts and *This is my role*; *Data sources and checks are Home's Records tab* (Records › Sources ·
  Records › Data checks); **What each tab answers**, one row per view of Home with the question Home heads it
  with (`PeelSections.ASK`, keyed as `VIEWS.area`: one registry, a test holds the two key lists equal), then *A
  development's page (Find)*; task guides, tours, What's new (the change log), What moved where and quick
  tips. Data sources and Data checks left Help's bar (Home's Records tab since phase 6; `#w=p:data` still opens
  Records › Sources).
- **The Glossary opens with the Definitions** (`PeelInfo.INFO.definitions`, one text; the Overview's ⓘ card
  stays). **How the app decides** gains the **Number conventions** (`#lg-numbers`, was a Settings section).
- **⚙ opens one Settings sheet** (`#tb-gear-menu`, `role="dialog"`, under the top bar's end, outside the ⋯ list):
  **Display · Start screen · Your role · Reports** (Public version, Prepared by) **· Labs · Usage**
  (`js/growth-ui.js` `settingsPageHTML`; `js/topbar.js` `toggleSettings`). The Settings · Labs · Change log menu
  is gone (the change log is Help › What's new), and so are the Counting and Records pointer stubs (counting
  is the Scenario control's; record type Find › What). The focus goes into the sheet as it opens and back to ⚙
  on Escape (to ⋯ when ⚙ is folded in it); on a phone opening or closing it folds ⋯, ⋯ opening closes it (never
  one over the other), and it spans the top bar with a small margin each side (`--space-2`), scrolling inside
  itself to the screen's foot. `openGearPage('labs')`, the old Labs page, opens the sheet at its Labs.
- **Usage records the role and the searches** (NP-7, P4-10 with change): one `role:<key>` count per visit (a
  `ROLES` key or `none`), and one `search:<kind>` count per search pick, by what it found (`dev`, `file`,
  `plan`, `mtsa`, `svc`, `dc`, `dcfac`, `filter`, `place`, `address`; `bump` takes no other name), never the
  text. A role shortcut or a Help row into a view of Home counts the view (`sub:records.checks`), as the
  strip's chips do. No page id, tab key or count was renamed; `page:find` is new.
- **Home's words**: the group links and the figures say where they go as tabs, *Growth › Areas →*,
  *Servicing › Capacity →*, *Capital › DC timing →*; the small map *Servicing › Capacity →*.

Old names still land (`js/workspaces.js` `PAGE_ALIAS`, `HOST`, `startScreen`; tests/nav-aliases.test.js "phase 7"):

| Old | Where it opens now |
|---|---|
| The sidebar's Explore, `data-ws-page="explore"`, `#w=p:explore` | The open site's page, else Find |
| `find`, `#w=p:find` (new) | The Find step (an open development closes first); `#w=p:find&d=…` its development's page |
| The sidebar's Servicing capacity, What's coming, Capital, Old pipes (`tight`, `coming`, `capital`, `pipes`) | Home › Servicing › Capacity, Growth › Forecast (By period open), Capital › DC timing, Servicing › Old pipes (unchanged); the role shortcuts |
| The sidebar's Review outlets (`outlets`) | The tool page (unchanged): Records › Data checks' row, a site's path line, the QA/QC shortcut |
| The sidebar's Reference (`reference`) | Help (unchanged) |
| Help › Start here's role buttons (four roles), the tour's five | The six roles' shortcuts (page ids through the same aliases, or `data-ws-at`) |
| A stored `role` (`engineer`, `manager`, `growth`, `capital`, `fsr`) | The same role (`qa` new) |
| A stored `startScreen: 'last'` (*Last workspace*) | Last place (the stored value unchanged) |
| A stored `lastWs` with no `lastPlace` | That page, as Last workspace opened it |
| The Start screen select under the sidebar (`data-ws-start`), the phone's ☰ row (`.home-menu-btn`) | Gone: Settings › Start screen (`data-ws-start-btn`); ☰ in the top bar (`#tb-nav`, `data-home-menu`) |
| Help's bar's Data sources / Data checks | Start here's *Records › Sources* / *Records › Data checks* (`data-ws-at`), the QA/QC shortcuts |
| Help › What each workspace answers (`ASKS`), `TOUR_ROLES`, tips.js `ROLES` | What each tab answers (`PeelSections.ASK`); `PeelWorkspaces.ROLES` |
| ⚙ menu Settings · Labs · Change log (`data-tbg`, `renderGearMenu`) | ⚙ opens the Settings sheet; Labs its section; Help › What's new |
| Settings › Counting, Settings › Records (pointers); Settings › Number conventions | Gone (the Scenario control; Find › What); How the app decides (`#lg-numbers`), Public version and Prepared by Settings › Reports |
| Usage `page:explore`, `page:tight`, … | Unchanged (kept as counted); new `page:find`, `role:<key>`, `search:<kind>` |

No page id, tab key, share parameter or pane id is renamed or moved: every §7 link holds.

## Every scope kind (navigation phase 8)

Navigation phase 8 (docs/architecture-review/navigation-design.md §3.4, §3.5, §8 row 8, §5 rows 146–147 and
150–156, §7.2; pros-and-cons NP-8, N-7, N-RULE; owner decisions 5, 7 and 11). Every scope the map's panel can
show has one kind, and one row of the scope × tab matrix says which tabs and views it shows. It comes in two
parts (NP-8 with change): **8a**, servicing scopes and drawn areas, and **8b**, files and cards (both below).

### Servicing scopes and drawn areas (8a)

- **One kind per scope** (`js/analysis-tabs.js` `kindOf` / `scopeKind()`): `site` (a development; a result
  kept at it, the Inquiry draft, keeps its tabs), `area` (Peel, a municipality, a plan), `svc` (a plant, a
  pumping station, a wastewater block, a pressure zone, the South Peel water system), `drawn` (a selection,
  drawn or the developments inside a constraint layer: `sel:`), `file` (`file:`) and, since 8b, `object`
  (every other result: a card or a tool's result). One kind for every tab (the per-tab file rule went into the
  `file` row).
- **What each kind shows** (`HIDDEN`; ≤ 4 chips each):

  | Kind | Growth | Servicing | Capital | Records |
  |---|---|---|---|---|
  | Development (`site`) | its one view (its units) | Network · FSR review | its one view (the DC projects it relies on) | its one view (its files) |
  | Area (`area`) | Pipeline · Areas · Forecast · 2021 existing | Capacity · Network · Old pipes | DC timing · EAs · Projects | Sources · Data checks |
  | Servicing scope (`svc`) | Pipeline · Forecast | Capacity · Network · Old pipes | DC timing | its own Sources · Data checks |
  | Drawn area (`drawn`) | Pipeline · Forecast | Capacity · Network | DC timing | (no Records tab) |
  | File (`file`, 8b) | (left out) | its one view (its flows) | (left out) | the file (Files) |
  | Card or tool's result (`object`, 8b) | (left out) | (left out) | (left out) | (left out) |

- **A whole tab left out**: a drawn area has no Records tab (`HIDDEN.drawn.records = '*'`): its button is
  left out of the map's strip (`.f-tab-off`, never the `hidden` attribute, which means "loading" to the strip
  and the page host), it has no chips, and a link's or a stored pick of it opens Overview (since 8b a tab call,
  a `[data-at]` link or Help's *Show me* asking for it closes the selection first, then opens it, as at a
  card). When the scope closes (`js/svc-scope.js` `clear()` / `closeResult()`, and once the servicing lookup
  fills for a cold link: `rescope()`), the strip, the chips and a view it replaced come back, and an open tab
  redraws for the new scope.
- **Records at a servicing scope is its own** (`js/records-tab.js` `svcSourcesSpec` / `svcChecksSpec`, was
  *"… has no files of its own"* above Peel's sources). **Sources**: where its capacity comes from and its date
  (a plant's rated capacity: the Region's 2025 annual report, its 90% trigger the 2020 Master Plan; a station's
  firm capacity: the 2020 Master Plan; South Peel: the annual report; a zone or a block: no published capacity
  of its own), its map layer, and the rows of Peel's freshness table it rests on. **Data checks**: a plant's
  2025 annual report against the model, the Ministry's measured flow against the report, its pumping stations
  against the collection system report's roster; a station's place on the roster; South Peel's 2025
  production; a zone or block has none, said in one line. The Ministry's and the roster's rows say *Loads when
  needed* until `data/plant-flows.json` / `data/ww-events.json` are in, then fill in place. The trail's Peel
  step and the footer lead back to Peel's; Review outlets stays reached from Records › Data checks (owner
  decision 5); Peel's live-data controls stay under Records › Sources at Peel (owner decision 7); a plant's
  overflows and measured flow stay on its Overview (owner decision 11).
- **A wastewater block is its servicing scope** (§5 row 153): tapped on the blocks layer, a `[data-block]`
  button or an old `ss=iiblock:<n>` link opens `dr:B<n>` (`js/svc-scope.js` `blockRef`; js/sewer-trace.js
  `showBlock`), Peel › plant › Block N with every tab at it, the link `ss=dr:B<n>`. Its I&I program facts are
  the fold *The block in the I&I program* (`blockFactsHTML`: prioritised, its area, the outlets as pipe buttons,
  the 300 mm+ mains inside it, the distance to the plant; filled once the sewers are in); its ladder names every
  block it drains through down to the plant, as the card's *Drains to* did. On a phone a tap raises the sheet from
  its peek, as the card did. The old card stays where no servicing area resolves and until the servicing model is
  built (a slow or missing census: a tap then opens the card, as before 8a). An old link waits for the servicing
  lookup and the model (retried as every shared result is, 20 s); still out at the last try (a late file, no
  census) it opens the card, the link kept, and the block's scope replaces that card once the model is built
  (`settleLate`, from `renderSvcTab`). Until the model is built a servicing scope's panel says it is loading (a
  link, a search pick), as its full table does.
- **Phones**: the strip has fewer tabs, never more; the new rows wrap and the fold's buttons are short
  (*900 mm*); nothing makes the panes scroll sideways at 390 px.

Old links and stored picks still land (`js/analysis-tabs.js` `HIDDEN` / `subFor`, `js/svc-scope.js` `RESTORE`;
tests/nav-aliases.test.js "phase 8a"):

| Old | Where it opens now |
|---|---|
| `ss=iiblock:<n>`, the blocks layer's tap, `[data-block]`, `App().showBlock(id)` | The block's servicing scope `dr:B<n>` (Overview); its card where no servicing area resolves or before the servicing model is built (an old link: on its last try, the scope once the model is in) |
| `t=records&rs=sources\|checks&ss=<plant:, wsys:, dr:, pz:, ps: ref>` | Records at that scope, its own Sources / Data checks (a block, station or zone once the servicing lookup fills: Peel's until then) |
| `rs=files`, a stored `rSub: 'files'` at a servicing scope | Records › Sources there; Files again at a development |
| `gs=areas`, a stored Areas pick, at a servicing scope or a drawn area | Growth › Pipeline there; Areas again at an area |
| `svs=pipes\|fsr` at a drawn area; `dcs=eas\|projects` at a servicing scope or a drawn area | Servicing › Capacity / Capital › DC timing there; the pick back at an area |
| `t=records`, a stored `footTab4: 'records'`, while a selection is open | Overview (no Records tab there); the stored tab unchanged, so the next visit opens Records |

No page id, tab key, share parameter or pane id is renamed: every §7 link holds (browser paths *Every scope kind (8a)*:
a plant's Records, a block, the stored picks moving between kinds; a station's, a zone's and the water system's
Records, and the link made at a scope's Records opened cold).

### Files and cards; Records a tab like the others (8b)

- **A file is its record sheet, its flows and the file** (`HIDDEN.file`: Growth and Capital left out; Servicing's
  four views left out, so it shows the file's own; Records › Files): a marker's record opens on Overview as before
  (SPEC §3: its units alone, its flows, what it counts as, its tree links), Servicing shows its flows (design §3.5
  "one view: its flows", SPEC §5 "this file's flows": the record sheet's demand table, the same renderer,
  `js/aerial-check.js` `renderFlows` in `#pane-svc-file`; no chips, no panel, no Peel-wide note, no Old pipes on
  the map; the Servicing pick is kept for the next area) and Records shows the file (its source record, every
  field, its provenance). A tab showing a scope's own view is `ownView(tab)` (`js/analysis-tabs.js`); a pane for
  one kind only is `data-kind`. The Water and Wastewater lenses open it with the file kept; a file whose record is
  not in yet says *Loading the file*, as Records does. *Open as a development* and the tree links open the
  development, every tab at it. (8b first left Servicing out at a file, the build's own reading of §3.5; the
  review put it back as the design and SPEC have it.)
- **A card or a tool's result is its Overview alone** (`HIDDEN.object`, `kindOf`'s fallback `object`): a DC
  project, an EA, a capital project, a pipe, a water facility, a constraint layer's feature, a block's fallback
  card, What loads this?, a trace, Inspect point, Test a site, Upgrade a pipe, the sewer designer's and Help's
  results. The strip shows Overview only (the other four `.f-tab-off`); the card is the scope, its developments
  the filter. A DC project's card lists every development relying on it, by tier, with its CSV. A result kept at
  its development (the Inquiry draft, owner decision 13) is `site`: the five tabs.
- **Leaving a card for a tab it leaves out** (`js/analysis-tabs.js` `leaveFor(tab)`): a tab call (`openTab`, a
  `[data-at]` link, `[data-foot-tab]`), the lens, Help's *Show me* (`js/tips.js` `openAnalysis`), an EA card's
  link to its list (`[data-ce-goto]`) and a map view's own tab (`js/workspaces.js` `go`) close the card first,
  as × does (`js/aerial-check.js` `closeDetail`), then open the tab: no link is dead. The lens still opens its
  tab, its map preset and System as before (owner decision 9). Closing runs the result's own close handlers, as
  × does: a test site placed and not counted goes with it (a counted one stays), and the sewer designer's design
  goes when its tool is off.
- **The trail's group step** (Peel › DC timing / EA / Capital › the card) closes the card and opens that list:
  Capital › DC timing · EAs · Projects, a tab pick as a `[data-at]` link is (`openTab`): the tab is kept and
  the address and *Copy link* say the list (`t=dca&dcs=timing|eas|projects`), so a reload opens it. Peel closes
  the card as × does (`PeelTools.closeResult()` first, while it is still open, so its close handlers run: an
  uncounted test site goes, an EA's highlight clears). The five tabs come back (`rescope()`), on Overview after ×
  or Peel.
- **Records is real or left out, never a placeholder** (§4 #7): the line *"… has no files of its own …
  Below: the sources for all of Peel"* is gone. A file whose record is not in yet says *Loading the file*, never
  Peel's sources.
- **Records is a tab like the others** (§8 row 8): the muted, right-aligned trailing style is gone from the
  map's strip (`.f-tab-trail`) and the page host's (`.page-tab-trail`); five tabs alike, Records still last.
  It reverses the owner's small trailing tab of 2026-10-16 (NP-8's con): one class on each strip, so it can be
  put back on its own.
- **What a reader notices** (risk 6): at a card, Growth, Servicing, Capital and Records were one tap away,
  filtered to its developments; now the card closes first, and its filter with it. A servicing scope or a drawn
  area keeps the tabs for a set of developments; the trail's group step leads to the card's list.
- **Phones**: the sheet's strip is one tab at a card, three at a file; nothing makes the panes scroll sideways at
  390 px.

Old links still land (`js/analysis-tabs.js` `HIDDEN` / `leaveFor`; tests/nav-aliases.test.js "phase 8b"):

| Old | Where it opens now |
|---|---|
| `ss=dcwork:…\|ea:…\|cap:…\|pipe:…` with any `t` | The card on Overview, the other tabs left out; after × or the trail's Peel, Overview with the five tabs; the stored tab is the next visit's |
| `ss=file:<uid>` with any `t` | The record sheet on Overview (the link's restore opens Overview, as before); its flows are in Servicing and the file in Records, one tap each |
| The trail's DC timing / EA / Capital step at a card | The card closes; Capital › DC timing / EAs / Projects, the tab kept and in the link (`t=dca&dcs=…`) |
| A lens (Capital, Water, Wastewater), a `[data-at]` link, Help's *Show me*, an EA card's link or a map view's tab, at a card that leaves that tab out | The card closes (as × does), then that tab |
| `.f-tab-trail`, `.page-tab-trail` | Gone: Records a tab like the others |

No page id, tab key, share parameter or pane id is renamed in 8b either (browser paths *Every scope kind (8b)*: a
file, a DC project's card, an EA's card and the lens; an old link to each with any `t`, opened cold, and closing it).

## One name per thing, and the README split (navigation phase 9)

Navigation phase 9, the last (docs/architecture-review/navigation-design.md §3.9, §3.7, §5 rows 167–168, §7.4, §8
row 9; pros-and-cons NP-9 and D-G3). **Words only**: no page id, tab key, share parameter, pane id, data attribute,
info key or stored preference was renamed, so every link, saved view and stored choice works as before
(`tests/nav-aliases.test.js`, "phase 9"). What changed is what the screen, the guides and these notes call a thing.

- **The pages by their one name** (`js/workspaces.js`): the Find step is *Find* (the site's page before a development
  is picked, `find: 'Find'` on its row); the FSR reviewer's first step is *Find › Files with an FSR posted* (its
  role shortcut says the same; the step's eyebrow and the back bar *← Back to Find › Files with an FSR posted* use it); the `fsr`
  page, where it is named as a page, is *Servicing › FSR review*; the drawn area's page is *Draw an area*; an area
  page is named by the view of Home it opens (`pageLabel(id, fold)`: *Servicing › Capacity*, *Growth › Forecast › By
  period*, *Capital › EAs › EA to construction*); a development's files and history are *Records*
  (`tabPath('records', 'files')`; the chip is still *Files*); a tool's output is *a result*, on Overview; the full
  map's left panel is *Find* and *Watch*. The eyebrows, the back bar, the map view's Find step, Settings › Usage
  (`kind:id` keys unchanged, so the pilot CSVs stay comparable) and the guides' footer buttons use them; the old
  names live only in Help › *What moved where* (first column).
- **The owner's names of 2026-10-16 stay**: Capital › DC timing, Capital › Projects, Records › Data checks (the
  design's DC projects, Construction and Checks are not applied); the DC timing sort keeps *Most affected* and *$ a
  unit*; the back bar at a development still says *Check a site › …*; the analyst's shortcut keeps *What’s coming
  (Growth › Forecast › By period)*.
- **Orphans out**: 41 "What is this?" cards that nothing showed are gone (168 → 127; each remaining card has a
  producer, `tests/vocabulary.test.js`), and with them the dead `.map-year` rules; the live cards that named a
  retired place say today's. The map tour (`TOUR`), Home's tour (`HOME_TOUR`) and *What moved where* were read
  against the app row by row (the Watch step no longer promises alerts: the alerts UI stays hidden until a
  feed exists; the stage names in the front README's opening are the app's: Pre-application · In review · Plan
  approved · Building permit · Under construction · Built · Withdrawn / refused).
- **Kept by two browser paths** (`tests/browser/run.js`): *One name per thing* (the FSR reviewer's shortcut and the
  step it opens named alike, the map view's Find head, the full map's back bar from each Find step, an area page's
  map view, Draw an area and a development's Records) and *Help's guides* (each footer button names the place it
  opens and opens it; Settings › Usage and What moved where use the same names; no ⓘ on Home's views or the full
  map's tabs is one of the deleted cards). Both fail on the code before this phase.
- **The README is split** (D-G3): the front page keeps what the project is, how the stages are worked out, *Run
  it* and *On iPhone / iPad*, then an index; [Using the app](README.md) (this file) holds the sections about the
  pages and the full map, [How the numbers are worked out](../method/README.md) the rules and definitions, and
  [The data](../data/README.md) the sources, receipts, updates and deploys. Each section moved whole, in its
  order, and every line of the old README is in exactly one of the four files (the split was checked by script);
  the pointers that cross a file are links, and `tests/docs-split.test.js` keeps every link and anchor working.
  The `README:NNN` citations in `docs/architecture-review/` are to the README of their day.
- **Left for later** (named, not forgotten): "phase" for a development's stage in older cards and notes, the
  full map's ☰ (see *Home's sidebar, Help and Settings*), and the sideways scroll of Servicing › Capacity's panes at
  390 px (a layout fix, not a word).
- **From the review**: *What an FSR should cover*'s button names where it lands, *Find › Files with an FSR posted*
  with no development open (as the role shortcut says) and *Servicing › FSR review* with one; the full map's back bar
  from the site's page or a Find step's map view follows a development picked or closed there (*Check a site* with
  one, *Find* without), as the click lands; a development's files are *Records* in the approvals guide, the flows guide
  and the "links to check" chip too; What moved where says only the Inquiry draft keeps the development (any other
  result closes it); the map tour's Forecast step points at Growth's panel, and on a phone its Timeline, Present and
  Help steps at Filters and ⋯; the phone sheet rises from its summary line (its grip is hidden; the README said
  otherwise).

## Growth › 2021 existing (owner, 2026-11-03)

The owner's request of 2026-11-03: the census block at the top of Growth › Areas is Growth's fourth view, **2021
existing**, so Growth is **Pipeline · Areas · Forecast · 2021 existing** on Home and on the full map (one registry:
`js/analysis-tabs.js` `TABSUBS`, `js/sections.js` `VIEWS`). The whole block moved: the headline (*Since the 2021
Census, Peel Region has added ≈… people in … dwellings; … more people are committed or not committed yet*), the four
cards (*2021 Census*, *+ Built since (estimate today)*, *+ Committed, not yet built*, *+ Not committed yet: full
build-out of applications*, each with people, dwellings, units and jobs), the growth chart, *Applications against the
2051 forecast*, *Housing activity* and the *Population outlook*. Growth › Areas keeps the plan areas only: the
drill-down, the plans against their targets (each municipality against the Region's 2051 allocation) and the plans by
plant or pressure zone; its method says where the census went.

- **A view with a panel of its own** (`js/census-view.js` `existingPanelSpec`, set by `renderGrowthCensus` as
  `growth:existing`): its question *What has been built since the census, and what is still to come?*, the headline as
  its answer, the four cards as its figures, the chart, two lists (*Against the 2051 forecast*, one row per
  municipality and Peel; *Housing activity* for the latest full year), the outlook as a fold, then the method (the ⓘ
  line, one copy) and the sources. Its full table is the census block itself (`#pane-growth-census`, now
  `data-sub="existing"`). It has no footer action of its own: the area report counts the developments shown with every
  filter, while this block counts the area's applications with the other filters ignored. On the map the footer is
  *Open full table*; on Home, *Open the map · Full table · Growth targets and forecasts ›*, and *Open the map* keeps the
  tab and view. The targets guide's first button is *Growth › 2021 existing* (*Growth › Areas* the second); Growth ›
  Pipeline's chart says *not every permit: see Growth › 2021 existing* for the census view's every-permit *Built since*.
- **An area's view** (`HIDDEN`): shown at Peel, a municipality and a plan; left out at a development, a servicing scope
  and a drawn area (it counts the area's census and the applications in its geography, so it would show Peel's census
  as the scope's), as Areas is. At those scopes the block still fills its hidden pane but does not replace the area's
  panel, which Home reads.
- **The year**: the chip stays *2021 existing* (one name); the panel names the census it uses. With a timeline that
  starts 2016 to 2020, or before 2016, the first card is *2016 Census*, the answer *Since the 2016 Census, …* and the
  identity line *… · 2016 Census baseline (timeline starts …)*. All years uses the latest, 2021 (`js/map-census.js`
  `baselineCensus`): the ⓘ line said *all years: earliest census with data (2016)* while it used 2021, and now says *all
  years: the latest census (2021)*, as *Census baseline follows the timeline* (above) does. The baseline reads the
  timeline's start alone, and so does the reason: with only its end set, *timeline with no start year: the latest
  census (2021)* (it named the first year with data and the earliest census while it used 2021; review).
- **A file's census area**: a file's record sheet narrows the block to the file's dissemination area (its hidden pane:
  Growth is off at a file). That DA goes as the sheet closes (×, its trail step, Escape, the trail's Peel, Start over) or
  another result replaces it; it stayed set before, so 2021 existing at Peel headlined that one DA, on the map and on
  Home (review). At an area the block never reads a DA.
- **Loading**: the block used to hide itself (and switch the tab) while the census loaded, which inside Areas left the
  plan tables. As a view of its own it says *Census data is still loading.* in place, and Home's view *Loading Growth ›
  2021 existing…* until the panel is set: a view is never blank.
- **Phones**: Home's views row has lighter side padding at 700 px and under, so all four views show without a swipe
  (the row already scrolls inside itself), and a bar's tooltip in the growth chart (`.grow-tip`) wraps at 220 px: it
  was one line (676 px wide at the people bar's end), so a tap there made `#analysis-panes` scroll sideways at 390 px.
  It now stays inside the chart, on the map, on Home and in Growth › Pipeline's and the capacity charts' full tables.
  Wrapped, it is 3 or 4 lines, so it is placed from its own height (`js/census-view.js` `placeTip`): above the bar it
  describes, or below it where the chart has no room above (the first bar); placed for one line, it covered the bar.
- **Help**: *What moved where* has the rows (*Growth › Census & 2051* → 2021 existing; *Growth › By plan* → Areas; the
  census part of Areas → 2021 existing); the map tour's Tabs step and Growth's ⓘ name the four views.

Old links and stored picks still land (`js/analysis-tabs.js` `SUB_MAP` / `migrateTabKey`; tests/growth-existing.test.js):

| Old | Where it opens now |
|---|---|
| `gs=census2051`, `t=census`, a stored `gSub: 'census2051'` or `footTab4: 'census'` | Growth › 2021 existing (those names were the census block) |
| `gs=existing`, a stored 2021 existing pick, at a development, a servicing scope or a drawn area | Growth › Pipeline there; 2021 existing again at an area |
| `gs=areas`, `gs=byplan`, a stored Areas pick, Last place `growth:areas`, `#w=p:growth` | Still Growth › Areas, the plan areas only |

No page id, tab key or pane id is renamed; a link written at the view says `gs=existing` (browser path *Growth › 2021
existing*: the map and Home, Areas' full table, the stored pick and the old links, a plant and back, the phone).

- **Left for later** (named, not forgotten): a development's own 2021 existing (its dissemination area's census and the
  growth in it) would be a new view, offered to the owner; *Selected project → its census area* (above) has been stale
  since navigation phase 5 (a development never shows the block).

## Help and This week

- **Help** is one entry of Home's menu, four sections: **Start here**, **How it works** (and each guide), the
  **Glossary** and **How the app decides** (navigation phase 7, above). Data sources and Data checks are
  Home's Records tab, Records › Sources and Records › Data checks (the old Data tab; navigation phase 6):
  Help › Start here and the QA/QC role link there.
- **This week** carries **Your watch list** (the developments starred ☆ Watch, each with its stage
  and whether it changed this week, changed ones first) and the week's **capacity alerts** from the
  weekly feed (shown once the feed is published: no weekly job writes it yet, owner decision 8), both of which were only in the full map's Watch tab. One spec draws it, on its page, in its
  map view and in Home's *Change* figures (navigation phase 6c); its first action, *Open in Watch*, opens the
  full map's Watch tab.

## Home: the briefing

- **Home is the page host** (navigation phase 6): under its header the map's five tabs, Overview ·
  Growth · Servicing · Capital · Records, and the open tab's views; the briefing below is its Overview.
  The old page ids (`tight`, `coming`, `projects`), the role shortcuts and its groups' links (*Growth › Areas
  →*, *Servicing › Capacity →*, *Capital › DC timing →*) open a tab of it, and Home stays lit. See *Home hosts
  the map's tabs*.
- **The scope first**: Peel, Mississauga, Brampton or Caledon (the map's municipality filter). Every
  figure follows it; one that is Region-wide (capacity, the DC program) says so.
- **Four groups of figures**, each the answer of its page and opening it: **Growth** (homes planned,
  left to build, people at build-out, expected by 2031), **Servicing** (over capacity at build-out,
  the first 90% trigger, the first zone limit (100% of firm pumping)), **Capital** (DC projects late,
  facilities with no relief in time) and **Change** (this week's changes, files on a tight plant).
  The first 90% trigger opens its plant as a scope on the map (← Page: Home › Servicing); the first zone limit
  (pumping into a pressure zone, which reaches its limit at 100% of firm pumping, not at the plants'
  90%) opens Home › Servicing › Capacity (Soonest limits, and every zone in its full table). Both use one rule
  (`js/ws-pages.js` `firstTrigger`, `firstZone`): the first to its limit, ties to the more loaded.
  When no zone reaches its limit by the horizon's end (2051), the zone figure says *None* and names
  the most loaded zone, with its % at build-out.
- The stage chart (with the homes dormant developments leave out), **Needs attention** beside the
  capacity map, **Largest left to build**, **Plans furthest behind their target** and **This week**.
  A Needs attention row opens its plant, station or water system as a scope on the
  map; a row with no scope (storage, pumping into a zone) and *See all* open Home › Servicing ›
  Capacity.
- Home's menu has five entries, Home · This week · Find · Help · Full map, then *For your role* (up to
  three shortcuts) and Labs while one is on; on a phone ☰ in the top bar opens it (navigation phase 7: *Home's
  sidebar, Help and Settings* above). It had nine, by team, until then.

## Tokens and accessibility

From design audit, Group 11:

- **Text on the accent passes WCAG AA.** A new `--on-accent` token is used by every rule that
  paints text on an accent fill: active chips, buttons and tabs, and the active view switch.
  - Dark theme: dark text on the light-blue accent, 7.9:1. White on #6da7ec was 2.5:1.
  - Light theme: white text on a deeper accent (#2269c0), 5.4:1.
- **Light-theme tokens.**
  - Muted text goes from #77756f to #6b6963: at least 4.7:1 on every surface. It was 3.97:1
    on surface-2.
  - The accent goes from #2a78d6 to #2269c0: at least 4.7:1 on every surface. It was 4.30:1
    on surface-1.
- **44 px tap targets on a phone.** Every visible control was measured in the browser at
  390 px. The phone rule now covers:
  - buttons, chips, tabs and form fields;
  - disclosure summaries, the stage buttons and the timeline toggle;
  - the map's zoom, north and tool-rail buttons. The rail goes to two columns so it still
    fits the phone map.

  Exempt: inline text links, map markers, and chart segments that only carry a tooltip.
- `tests/tokens-a11y.test.js` reads the tokens from the stylesheet and checks the WCAG ratios
  directly.

## Presentation mode

From design audit, Group 9:

- **Any scope.** Present shows whatever is open: Peel, a municipality or area, a servicing
  scope (a plant, station, block or zone) or a development. It takes that view's Overview
  headline and first four tiles. Entering it no longer closes the development.
- **Only Exit.** The top bar, the analysis panel, the tool rail, the time bar, the test-site
  bar and the map's own controls are hidden. The map takes the whole screen. Esc also leaves.
- **Readable on a projector.** The headline is about 30 px and the tile numbers 44 px. On a
  phone the tiles stack in one column.
- **The screening note and the data date** sit at the foot: "General screening results only.
  Peel's W&WW Infrastructure Planning team must validate or confirm all results. · Data
  2026-10-12 · Unofficial prototype…".
- **Light by default.** Projectors wash out dark themes, so presentation switches to the light
  theme and restores yours on exit. To keep the app theme, set Settings › Display ›
  Presentation › *Same as the app*.

## Chart and table forms

From design audit, Group 8:

- **11 px minimum, measured.** Text sizes were measured in the browser on every analysis view
  at desk and phone sizes:
  - **Chart labels** were drawn at 11 units, but the charts scaled down to fit the panel, so
    they rendered at 5–9 px. This affected the DC charts, the Growth timing band and the plant
    Horizon chart. Charts are now drawn at the panel's own width (`PeelUtil.chartW`), so 11
    units render as 11 px. On narrow screens the label column shrinks and names are trimmed
    to fit.
  - **Small text** (`<small>` lines and unit suffixes) in the analysis and detail panels was
    8–10 px. It now never goes below 11 px.
- **Plant figures in a table.** Each plant bar on Wastewater › Plants used to carry four lines
  of prose. One table under the bars now holds the same figures:

  | Column | What it shows |
  |---|---|
  | Plant | name, with population at 100% under it |
  | Rated | rated capacity |
  | Committed | % and ML/d |
  | Reserve (D-5-1) | uncommitted reserve, ≈ people |
  | After proposed | room left after proposed growth |

  Water's treatment chart uses the same table, with "Room to rated".
- **Plants pane shortened.** The stage-by-stage "Plant inflow by growth layer" table folds
  behind a summary line. The pane drops from 5,177 to 2,539 px at desk (5,678 → 3,018 on a
  phone).
- **Colour is never the only signal.** The pumping-station and allocation mini bars say
  "over" or "short" in words next to the value, and a % bar has a 100% tick. The DC funding
  screen colours became neutral in Group 2.
- **No future years.** "≈N/yr completed 2017–2027" was caused by a completion dated in the
  future. It now stops at the data year.
- **See all after 10** on the pumping-station table. The DC tables and the Developments list
  already had it. The Files tree is owned by the tree work and is unchanged.
- **Ranges** whose two ends round to the same number show one number (Group 2).

## One home for tool results, and the top bar

From design audit, Group 7:

- **One home for tool results.** Results from the **sewer trace** and from **Test a site**
  (the form, its servicing check and the list of test sites) open as **a result** on Overview, a
  scope of its own, with a trail step such as "Peel › Sewer path" or "Peel › Test site 1"; × closes it.
  They used to open in the right-hand detail panel, then in a tab of their own; both are gone.
  - Every other tool's result opens the same way.
- **A result is a scope of its own on Overview** (navigation phase 8b): the other tabs are left out while it is
  open, and a tab, the lens or a link to another tab closes it first, as × does; a result kept at its
  development keeps the development's tabs ("Every scope kind" above).
- **A result started at a development keeps it** (navigation phase 1, `keepDev` in
  `PeelSvcScope.openResult`). The **Inquiry draft** is a development action (in the development's
  header, beside *Servicing memo*, on every tab and on its page) and stays an Export ▾ item: both call one function
  (`js/topbar.js` `draftInquiryResponse` → `PeelToolInquiry.draftForDevelopment`) and open one result,
  with its Copy button.
  - It opens on the map's Overview with the development still open; from a page the map opens first,
    with its way back to the page.
  - The trail reads Peel › the site › Inquiry draft. × or the site step closes the draft and shows the
    site again; Peel closes both. Opening another development replaces the draft.
  - On a phone the draft opens the bottom sheet all the way (the header and the tabs above it leave a
    half sheet no room), for the draft only: the sheet is not remembered at full, and closing the draft puts it
    back where it was. A full sheet stops under the map's way back to the page, so it still takes a
    tap.
  - Every other result still replaces the development (one scope at a time).
- **Inspect point and Fit fixed.** Both use the sewer trace. The trace returned nothing and
  opened a panel as a side effect, so Inspect's sewer-path section was empty. The trace now
  comes back to them with no panel.
- **Test sites don't outlive the tool.**
  - A test site that is placed and then closed unchanged is removed with its result (closed by ×, or, since
    navigation phase 8b, by a tab, the lens or a link to another tab).
  - A test site that was edited or counted in the totals stays. The bar under the map lists
    it, with Remove.
- **Top bar**, left to right:

  | Group | Controls |
  |---|---|
  | Navigation | name · trail · search |
  | View | view switch · Scenario |
  | Output | Export ▾ · Present ▾ |
  | Help and settings | Help · ⚙ |

  - A **lens** (the view switch) sets the map preset and the System control (navigation phase 2);
    Capital, Water and Wastewater also open their tab (at a card or a tool's result, which leaves that tab
    out, the result closes first: navigation phase 8b, owner decision 9).
  - **Present ▾** holds Present and Time-lapse; the separate Time-lapse button is gone.
  - **Export ▾** gains *Save this view…*; the Save button in the Layers card is gone. Saved
    views still open from the Layers card and the chips above the filters.
  - The **Executive briefing** is an Export item. The Overview keeps it as a link, not a big
    accent button.
  - **Search** moves into the top bar at 1600 px and wider, the projector and wide desks. It
    stays at the top of the full map's Find on narrower screens. It is one search box, moved, not copied.
    On a page the search sits in the page header at every width; the top-bar slot is the map's.
  - On a phone, every top-bar control and menu item is at least 44 px.

## Scope-aware tabs and duplicates removed

From design audit, Group 6:

- **Peel-wide, said out loud.** Servicing and Capital show Peel-wide tables. Below Peel
  scope, a note at the top says so. "Below Peel" means a municipality, a planning area, a zone
  or block filter, or a servicing scope.
  - It reads (Servicing): "Peel-wide. Plants, pumping stations, storage and pressure zones serve all
    of Peel, so these tables are not filtered to Brampton."
  - It then links the plants or zones the scoped developments load, with counts. For example,
    "G.E. Booth (750) · Clarkson (122)" opens each one as a servicing scope.
  - At development scope these tabs show the site's own figures instead, so no note is needed.
- **Area-only content at development scope.** Growth's *Areas*, *Forecast* and *2021 existing* views (and Servicing's
  Capacity and Old pipes, Capital's EAs and Projects) describe an area, not one development: at a
  development they are left out and each tab shows the site's own view (navigation phases 5 and 8: the
  scope × tab rows, `HIDDEN` in `js/analysis-tabs.js`); the trail's steps go back to an area.
- **Duplicates removed:**
  - The **view switch** is only in the top bar; it is gone from the Layers card. The tour's
    map-views step points at the top bar.
  - **Present** is only in the top bar; the map's own button is gone.
  - **Select within a distance** is only in Select › Radius; it is gone from Measure.
- **Needs attention** no longer lists newly listed files that are already completed. This week
  still has them.

## Servicing scopes: the servicing ladder

Plants, pumping stations, wastewater blocks, pressure zones and the South Peel water system are
now **scopes**, like a municipality or a secondary plan (design audit, Group 5; `js/svc-scope.js`).
Before this change, tapping one gave a "What loads this?" tool result.

| Ladder | Trail |
|---|---|
| Wastewater | Peel › plant › pumping-station catchment, or block (with everything upstream) |
| Water | Peel › South Peel water › pressure zone (well-based zones stand alone) |

**Opening a scope.** You can open one by:
- tapping it on the map ("What loads this?" now opens the scope; a wastewater block on the blocks layer too
  since navigation phase 8a);
- tapping a plant or South Peel water in the Peel Overview's capacity bars;
- searching for its name (plants, stations, blocks and zones are all searchable; from a page it
  opens on the map);
- following a link in another scope's ladder;
- following a share link (`ss=`).

**What a scope does.**
- It filters the developments to those it serves.
- It adds its rungs to the trail. Each rung opens that level, and "Peel" clears the scope.
- Its Overview shows:
  - a headline;
  - headroom tiles:

    | Scope | Headroom tiles |
    |---|---|
    | Plant | rated, % committed, uncommitted reserve and people, 90% trigger year |
    | Station | firm capacity vs peak wet (the check) and peak dry (reference) |
    | Block | average dry at the census vs build-out; upstream count; outlet sewer size and class (capacity not assessed) |
    | Zone, water system | maximum day |

  - the **servicing ladder both ways**:

    | Scope | Ladder links |
    |---|---|
    | Plant | its stations ranked by % of firm; the blocks arriving at it |
    | Block | drains to (up); fed by (down) |
    | Station | pumps to (up) |
    | Zone | supplied by (up) |
    | Water system | its zones (down) |

  - the developments loading it, largest peak first, with *See all* and *Area report*;
  - the planned DC works in it;
  - a block: the fold *The block in the I&I program* (its outlets, the mains inside it, the distance to the
    plant; navigation phase 8a).
- Its other tabs show its views (Growth › Pipeline · Forecast, Servicing › Capacity · Network · Old pipes, Capital › DC timing) and its own
  Records (navigation phase 8a: see *Every scope kind*).

From the Peel Overview, "the most loaded station and the developments driving it" now takes two
taps: the plant, then the top station.

## Measure: coloured points, streets and watercourses crossed

- **Points:** each measured point has its own colour and letter, on the map and in the ground
  profile. A is green (start), the last point is red, and the points between them are amber,
  violet, pink, teal, gold and blue. A dashed line in the profile marks each point, and a key
  under it gives each point's distance along the line.
- **Crossings:** the streets and watercourses the line crosses are numbered in order along the
  line, as grey (street) or blue (watercourse) ticks on the ground profile. They are listed by
  name and distance under the profile and labelled on the map. Nearby pieces of one street or
  watercourse within 25 m (a divided road, a road drawn in pieces) count once. Streets come
  from OpenStreetMap. Watercourses come from the Ontario Hydro Network when it loads, otherwise
  OpenStreetMap. Lines longer than about 15 km skip the lookup.
- **Pipe colours fixed:** the sanitary and watermain lines in the profile, and the existing
  pipes on the map, had lost their colours with the design-token change. They now use the pipe
  colours again.

## Stage selector

The *Stage* section shows a slim bar with each phase's share, in its phase colour. Under it is a
row per phase with its colour, name and count. Before, each bar segment carried its own label,
and small phases were cut off ("pprove", "Inde truc").
- Tap a row or a bar segment to show only that phase. Tap again for all phases. Ctrl / ⌘-click
  adds or removes a phase.
- Phases switched off are dimmed and struck through.
- The phase colours had stopped showing since the module split: two modules read the colours
  once at load, before they were set. They now read them each time they draw.

## Settings: one sheet

The gear menu's *Settings* and *Sources & checks* pages (the second retired in navigation phase 2)
closed the moment they opened. The page replaced the menu item that was clicked, so the
outside-click check no longer found the menu and closed it. That check now reads the click's path as dispatched. The top bar also sits above
the map controls and the phone sheet, so its menus open on top, and long pages scroll inside
the menu. Since navigation phase 7 ⚙ opens Settings directly, one sheet (no menu), outside the ⋯ list:
the outside-click check spares the sheet by its id, ⚙'s own click does not reach it, and Escape closes it.

## Opening a development doesn't trace or zoom out

Selecting a development moves the map to its site at your current zoom or closer, never further
out. It no longer traces the sewer path automatically, because the trace zoomed the map out to
the whole route to the plant. *Trace sewer* in the development's header draws the route when you want it.

## Land use filter: every application by default

The *Land use* filter (What) defaults to **Any land use**, so the map shows every active
application, as the municipalities map them. The phase 1 filter redesign (#151) had made *Adds
units or jobs* the default. That hid any development without a published unit or job count, such
as most of Brampton's Heritage Heights (Area 52) precinct and block plans and its institutional
and retail site plans: the default view dropped from 2,027 developments to 619.

*Adds units or jobs* is still an option. It now also keeps growth proposals whose unit count
isn't published yet: official plan, zoning, subdivision or block plan files, and descriptions
naming a subdivision, precinct, mixed use, apartments or townhouses. Replacement houses,
additions, temporary uses and day cares stay out.

## Units read from proposals, the development Overview, Growth layout, wide tables

**Units from proposal text.**
- Counts written in the description are read more fully:
  - spelled-out numbers: "sixty (60)", "seven street townhouses"
  - a single dwelling type: "10 townhouses", "34 semi-detached homes", "15 stacked townhouses",
    "115 condominium townhomes"
  - residential lots, one house each: "47 residential lots", "202 single detached lots"
- Units in a retail plaza, an industrial building, a hotel or a care home are not counted as homes.
- A pre-consultation's count is used when no later file on the site states one, marked *from the
  pre-consultation* in the build-out notes. An area-wide precinct or block plan's figure is not
  used: its subdivisions are separate sites.
- Counts are re-read when the app builds its developments, so the weekly snapshot doesn't have to
  be rebuilt first.
- This adds about 22,000 units across 73 developments. About 14,700 are on sites still in review
  or pre-consultation (proposed). About 7,300 are on approved or under-construction sites whose
  later files never stated a count, which raises committed units by about 6,700.

**The development Overview** shows the development, not just its demand:
- Its homes (or *net of N demolished*), people and jobs, with the employment floor area. An
  employment site with no homes no longer shows "0 units".
- Its flows: water max day, wastewater average dry weather, peak dry weather and peak wet weather,
  in Servicing › Network's Flows (navigation phase 5).
- About and the approvals timeline fold under it; its files and history are Records (one view), its
  site checks a fold of Servicing › Network (navigation phase 5). The separate Development tab is
  gone, and links to it open the Overview.

**Growth** shows employment in the same layout as homes: floor area planned, permitted,
completed and left to build, with jobs. The jobs by stage in the pipeline chart are filled in
(they read 0 before).

**The panel header** reads *N developments · X homes proposed · Y jobs*. Hover for what "homes
proposed" counts: the applications' figure, net of demolitions, at every stage.

**Wide tables** in the analysis panel wrap their text to fit. A table still wider than the panel
scrolls sideways inside itself with its first column pinned, instead of being cut off at the
panel's edge (Water by pressure zone, 2020 Master Plan vs this tracker, and others).

## Panels start below the top bar

The top bar sits above the map's panels so its menus open over them. The panels that open from
the side start where the top bar ends (`--top-h`, measured as the top bar resizes), so their
headings and close buttons aren't hidden under it:
- the side panel (Help & tips, a selection, a pipe or block)
- the phone and tablet Filters panel
- the Compare column

On a phone the bottom sheet never grows up under the top bar.

## Wide screens

At 1800 px and wider, the Compare tool gets its own column to the right of the analysis
panel, but only while Compare is open. Otherwise the map takes the full width, so there is no
empty strip on the right. In the 440 px analysis column, *Needs attention* and *Top
developments* use the full width, and the *Executive briefing* button sits under the headline.

## Measure, Part 1: ground profile accuracy, manholes, and the sewer profile

Everything here is **indicative, not design**.

- **Sampling.** The ground is now read with bilinear interpolation. This works across tile
  edges, with no stair steps. The lidar service is asked for bilinear samples too.
  - Samples are spaced every 5 m, or one pixel, or length ÷ 600, whichever is largest. A line
    never has more than 600 samples.
  - Terrain tiles are fetched once, shared, and cached after decoding. The raw value is kept on
    every sample. `js/profile-core.js` holds the arithmetic and is tested in
    `tests/profile-core.test.js`.
- **Peel manhole ground.**
  - **Ground** = invert + published depth, at each end of a sanitary main.
  - **Not used:** depths of 0.5 m or less, depths of 15 m or more, and force mains.
  - **Matching:** manholes within 15 m of the line are drawn as dots, labelled *Peel manhole
    ground*.
  - **Correction:** between two matched manholes no more than 150 m apart, the ground is
    corrected by the offset at each manhole, linearly interpolated, and labelled *corrected*. It
    is never extrapolated. The raw line stays as a dotted line.
  - **Datum:** the datum of Peel's inverts is not confirmed, so manhole grounds are used as
    published and the app says so. If the validation finds they are CGVD28, the NRCan shift
    (about −0.4 m) is applied and named. Datums are never mixed silently.
- **Accuracy label.** Under every profile: "typically within X m of Peel manholes in this
  area".
  - It is read from `data/elevation-validation.json`, per area and per source (lidar or
    terrain tiles).
  - For lidar it names the project and the year flown.
  - Outside the validated areas it says "No validation against Peel manholes for this area".
- **Profile.**
  - **Expand** gives a larger chart.
  - **Crosshair** on hover or touch: distance, ground and its source, invert, depth, and
    watermain cover (assumed).
  - Grade per leg (A→B, B→C…) and a note of the vertical exaggeration.
  - **Shading** where the depth to invert is under 2.0 m. The threshold is a setting, kept per
    browser.
  - **CSV** columns: `d, lat, lng, ground, ground_raw, source, invert, depth, watermain_flag`.
- **Along a sewer** (Measure › *Along a sewer*). Tap a sanitary main and the app follows it
  downstream, manhole to manhole, using Peel's published inverts and depths.
  - It stops after 40 pipes, after 3 km, or where no gravity main continues.
  - Each pipe shows its length, diameter, invert up → down, slope % and depth.
  - **Adverse slopes** (the invert rises downstream) are flagged in red.
  - The raw lidar or terrain ground is drawn for comparison. No FacilityIDs are shown.
- **Validation.** In Actions, run *Probe data sources* with `mode=elev-validate`
  (`scripts/probe-elev-validate.js`).
  - It samples up to 60 Peel manholes in each of five areas, against the raw lidar and the raw
    terrain tiles. Ground is shifted to the lidar's datum (CGVD2013) with PROJ and the NRCan
    grids.
  - It writes the table and a stored sample with no IDs, `tests/fixtures/manhole-sample.json`.
  - `tests/elevation-validation.test.js` recomputes the table from the stored sample and fails
    if they differ. The *Elevation validation* workflow runs it when the sampler changes.
  - **Lidar target:** median |error| under 0.3 m, and 90% within 0.5 m. The table records
    whether it is met.
- **Internal data check (not public).** The same run lists manholes where invert + depth is
  more than 5 m from the lidar, with FacilityID.
  - It is uploaded only as a private workflow artifact (`internal-manhole-check`) and never
    committed.
  - The site deploy now publishes only the app files (`_site`: index.html, manifest, sw.js,
    css, js, data, icons). It fails if anything internal is in them.
- **Polite fetching.** Overpass is retried at most 3 times, honouring `Retry-After` on 429.

## 3D view, Part 2: terrain, buildings and proposed massing

Tap **3D** on the map, under the tool buttons. A 3D map opens over the 2D map at the same place.
Everything drawn is **indicative, not design**.

- **Camera.** Tilted 60°. *Tilt* toggles a straight-down view. **2D** or Esc goes back, keeping
  the place you moved to.
- **Libraries.** MapLibre GL 4.7.1 and PMTiles 3.2.1 load only the first time the view opens.
  Without WebGL the view says so.
- **Ground.**
  - Terrain is exaggerated ×1.2 and hillshaded.
  - It comes from the same module as the ground profile: `PeelElevation.demTile`.
  - Inside the **North Brampton pilot box** (dashed) it is the province's lidar terrain model:
    bare earth (the DTM, never the surface model), CGVD2013, up to z16 (about 1.8 m pixels),
    rounded to 0.1 m.
  - Everywhere else it is the terrain tiles (CDEM / SRTM, CGVD28 / EGM96). Above their z15 they
    are upsampled from decoded heights.
  - The legend names the sources in view, and says the two datums are about 0.4 m apart and
    not adjusted.
- **Buildings** (pilot box only): OpenStreetMap buildings and building parts.
  - **Height:** the `height` tag, else `building:levels` (+ roof levels) × 3.2 m, else
    2 storeys.
  - Estimated heights are drawn darker, and a tap says which rule applied.
- **Proposals:** the developments shown in 2D, coloured by status (the phase colours).
  - **Height:** the stated height in metres, else the stated storeys × 3.2 m, else (apartment
    types only) units × 90 m² ÷ (footprint × 85% efficiency), 1–60 storeys. Anything else is
    hidden, and the legend counts how many.
  - Additions and extensions are hidden unless they add units.
  - **Footprint:** half the application site, scaled about its centre. Where no site boundary
    exists, a 30 m square at the address. Never the real building outline.
  - A tap shows the basis and opens the development.
  - The rules are in `js/massing-core.js` and tested in `tests/massing-core.test.js`.
- **Pilot tiles.** In Actions, run *Probe data sources* with `mode=tiles-3d`
  (`scripts/build-3d-tiles.js`). It writes:
  - `data/3d/lidar-pilot.pmtiles` (Terrarium PNG, z12–16): five pixels per zoom are checked
    against the lidar service's own samples;
  - `data/3d/buildings-pilot.pmtiles` (vector, z13–16);
  - `data/3d/manifest.json`: sources, datums, dates, counts and attribution.
- **Dependencies.** The PMTiles writer, PNG encoder and TIFF reader are small dependency-free
  helpers in `scripts/`, tested in `tests/tiles-3d.test.js`. The writer was checked against the
  pmtiles library's reader.
- **Attribution.** A line at the bottom of the 3D view credits the sources in view:
  - Esri imagery or canvas;
  - Ontario DTM (OGL-Ontario);
  - Terrain Tiles (Mapzen / AWS; CDEM © NRCan, SRTM);
  - © OpenStreetMap contributors (ODbL);
  - municipal open data.
- **Planned deviation from the brief.** The lidar tiles stop at z16 rather than the 0.5 m
  native resolution (z18 would be about 3,500 tiles). The ground profile still reads the lidar
  at native resolution.

## Time Box, Part 3: a place's imagery over the years

Tools › **Time Box** (the clock button). Drag a box on the map. While drawing, the map stays
still; **Pan the map** in the banner lets you move it first, and **Draw a box** switches back.
Once a box is drawn, the map pans and zooms as usual.

- **Rotated maps.** The box is the rectangle you drag on screen, so it stays square to the screen
  on the road-grid orientation (44°). The imagery clip, the swipe divider and the applications
  filter all use its four corners.
- **Live check** (`mode=wayback`, `scripts/probe-wayback.js`): 197 releases, CORS allowed. A
  Brampton box took 128 requests (2.7 MB) and about 3 s, finding 10 years from 2014 to 2026.

- **Releases.** The app reads the Esri World Imagery Wayback release list from the WMTS
  capabilities document. If that fails, it reads Esri's `waybackconfig.json` instead.
- **New imagery only.** Each release's tiles over the box are hashed.
  - The tiles are fetched at the deepest zoom where the box fits in 4 tiles or fewer.
  - Releases with identical tiles show the same imagery, so only releases where the box
    changed are kept, with at most one per year (the latest that year).
  - The search bisects the release list: when two releases match, the ones between them are
    taken as the same. About 100 tile requests cover 60 releases with 6 changes, instead of
    240.
  - **Limitation:** imagery that changed and then changed back between two matching releases
    is missed.
  - At most 6 requests are in flight. A progress bar and **Cancel** show while it checks.
  - The result is cached per box and zoom: in memory, and the last 20 boxes in the browser.
  - If the tiles cannot be compared, one release per year is shown, and the notes say so.
- **Year slider.** It snaps to the years found. **Play** steps through them every 1.5 s.
  - The imagery shows **inside the box only**. Outside the box the map is unchanged; the
    normal development markers and outlines are dimmed.
  - A release date is when Esri published the imagery, not when it was flown, and the notes
    say so.
- **Applications.** The developments in the box that were **filed by the end of the year** are
  shown in their phase colour as of that year.
  - **Filing date:** the earliest submission date on its applications. Failing that, its
    earliest dated milestone ("filed on or before"). Developments with no dated application
    events are drawn dashed as **date unknown**, in every year, and counted.
  - Tap a marker to open the development.
- **Compare with** another year: a swipe handle splits the box, with the slider year on the
  left and the compare year on the right. Drag the handle, or use the arrow keys.
- **Attribution.** "Imagery © Esri Wayback" shows in the banner, and the full Esri credit in
  the notes and the map's attribution.
- **Code.**
  - `js/timebox-core.js`: pure functions, tested in `tests/timebox-core.test.js`. The
    capabilities and config parsing, dedupe, one per year, bisection, request limiter, tile
    hash, filing dates and slider snapping. The imagery source sits behind a small interface
    (`WAYBACK`).
  - `js/time-box.js`: the tool.

## Capital › EAs: the environmental assessments list

The Capital tab's sub-views are now **DC timing · Construction · EAs · Funding screen · Funding levels**.
EAs is a sub-view rather than a sixth tab, because the design keeps the same five tabs at every
scope (SPEC §0.4). The EA lists moved here from the old "Construction & EAs" view, which is now
**Construction**.

- **Scope.**
  - At Peel: all 75 EAs.
  - At a municipality: its EAs plus the Region-wide studies.
  - At a development: the EAs whose study area, route or site is within 1 km, nearest first
    ("covers the site" or "350 m away"). EAs placed only approximately or not yet mapped are not
    checked against a site, and the panel says so. (Navigation phase 5: at a development these
    lists, with the capital works within 1 km, are part of Capital's one view, under the DC
    projects it relies on; EAs is no chip there.)
- **Tiles.** Current EAs, milestones in the next 90 days, comment or review periods open now, and
  EAs completed in the last two years.
- **Coming up.** Dated public meetings, comment and review deadlines and report releases in the
  next 90 days. A month-only date counts from its month and is marked "(month)".
- **Every EA.**
  - Filters: search (name, place, purpose), Current / Complete / All, and system (Water,
    Wastewater, Roads, Storm; a multi-system EA counts as water or wastewater).
  - Sort by next step, name, completed year or municipality.
  - Each row shows its system, schedule, status, municipality, next step or completion year, a
    location note ("approximate location", "not on the map yet") and the report link.
  - Tap a row to open the EA, with the trail Peel › EA › name, and see it highlighted on the map.
- **Outputs.**
  - **CSV** of the filtered list, with the disclaimer header.
  - **GeoJSON** of the filtered list.
  - **Add to calendar (.ics):** all-day events for the dated milestones in the next 90 days, with
    the project page link. Month-only dates are left out.
  - **Show these on the map** turns on the EA layer with the same filters and fits the map to
    them.
- **Code.** `js/capital-ea-model.js` (`eaTabHTML`, `eaMatch`, `eaSort`, `easNear`, `upcoming`,
  `openPeriods`, `eaICS`), tested in `tests/ea-tab.test.js`; `js/capital-ea.js` (state and events).

### EA and construction improvements

- **Capital links.**
  - A contract is linked to an EA when it shares the EA's project page (as before).
  - A contract is also linked when it is in the same system and at least half its points fall
    inside the EA's study area. This is not done for roads EAs or for study areas placed with low
    confidence.
  - Each link says how it was made.
- **Decisions.** For completed EAs with a PDF report, the build reads the report (`pdftotext`, the
  first 40 pages) and keeps the sentence naming the preferred or recommended solution. It is
  labelled "extracted from the report (automatic; check the report)" and is included in the CSV.
- **Freshness.** The weekly site job rebuilds `data/capital.json` and `data/eas.json`. Each build
  refuses to write if it read fewer than 80% of the previous count (`--force` overrides), so a
  partial outage cannot empty the lists.
- **Map styling.**
  - EAs are magenta, chosen to stay clear of the secondary-plan orange and the pipe colours.
  - Current EAs use solid, heavier lines. Completed EAs are fainter, with a dotted line and no
    fill.
  - Traced outlines are dashed at full weight. Approximate or low-confidence shapes are thinner
    and fainter.
  - Below zoom 12, each EA is a dot at its centre: filled if current, hollow if complete.
  - Construction lines have a casing in their system's colour (water, wastewater, roads).
- **Labels.**
  - EA labels sit at the centre of the area, or the middle of the route.
  - Construction labels say "N% built", or "finishing" at 100%. Nothing is shown when the figure
    is 0% or missing.
  - Any EA or construction label that overlaps a development label, cluster or marker is hidden,
    so development labels take priority.

## Home: EA to construction, and the Forecast

Two pages added to Home's sidebar, so they are no longer only on the full map:

- **Planning › Forecast** (`outlook`): Growth › Forecast on a page (Home › Growth › Forecast since
  navigation phase 6). By period first (navigation phase 6), then units expected by 2031 and 2041
  with their ranges, the plants' 90% trigger years at the forecast pace, the largest contributors,
  then the folds How sure and (once a frozen snapshot exists) Since the last snapshot, and
  a link to *How the forecast is timed*. Same figures as the full map (`growth:timing`).
- **What's coming** (`coming`): the same view, opened with By period (its own question, *What is
  coming, where, when and how sure?*, retired with its page in navigation phase 6).
- **Capital › EAs** (`eaflow`, the EAs page, Home › Capital › EAs since navigation phase 6; on the map
  the fold *EA to construction* of Capital › EAs, since navigation phase 4): each Region Class EA and the construction that
  followed it, as a timeline (EA study, public information centres, completion, then the
  construction bars, with today marked), and lists: complete and waiting (oldest first, those
  10+ years old flagged: the Class EA must be reviewed before construction), construction that
  followed (flagged when it starts 10+ years after its EA), **possible links to check** (below),
  EAs under way by expected report (report dates already past marked as due).

Both are also linked from Home's *Start here* line.

**The rule (`js/capital-ea-model.js` `eaProgress`)**: a capital contract linked to an EA counts as
the EA's outcome only when it starts **on or after the EA was complete** (by year where only the year
is known). For an EA still under way, only construction due after its expected report counts.
Earlier work in the study area is shown as *other work*, never as following the EA. When the
project's own page links the work to the EA but it started earlier, it is listed as a *date conflict
to check*. A start date is the actual start where recorded, else the target start.

**Completion years (`scripts/ea-lib.js` `completionOf`)**, best evidence first: the notice of
completion, the report filing / review-end date, the page's wording, the report's cover (first
pages of the PDF), the report's file name. The year must fall between the EA's commencement (or
first PIC) and today. Each EA carries `completedYear` and `completedBasis`. Completed EAs with no
year stay *date unknown* and their construction is not ordered against them.

**Possible links (`possibleLinks`)**: current construction near a past EA that the weekly build
has not linked: planned, tendered, awarded or under-construction contracts of the same system
(roads EAs: road work; storm EAs: storm sewers) and municipality, at least half within 250 m of a
completed EA's study area (500 m of a facility), starting after the EA was complete. Left out:
repairs and renewals (relining, trenchless rehabilitation, inlet repair, resurfacing, noise walls),
developer-built works, Region-wide studies (master plans: everything lies near them), and, for a
study area placed with low confidence, anything not on a street named in the EA. They are listed
with the reasons and never count as following the EA.

## Home page maps: street context, zoom, labels; Site: water and wastewater

- **Basemap** (`js/ws-pages.js` `tilesSVG`): every small map on the Home pages draws the full map's
  grey street map (Esri World Gray Canvas, base + labels, in the theme's shade) under it, each tile
  placed by its projected corners so it turns with the map (road grid). One probe tile decides; when
  tiles don't load (offline), a site's page map names its streets from the Region's address points
  (`js/reports.js` `streetLines`).
- **Zoom**: Growth › Forecast, This week, Capital › DC timing and Capital › EAs zoom to the municipality chosen.
- **Capital › EAs** (EA to construction) draws the EA study areas (by status) and the construction that followed.
- **Labels** (the three largest developments, the largest named works, the EAs waiting longest, the
  worst old pipes by street) only on a zoomed-in map: a map of all of Peel names only the municipalities.
- **A development's Servicing › Network, fold Site: water and wastewater** (`js/devtab.js`): within 100 m – 1 km (as the storm
  sewers), the Region's watermains and sanitary sewers of 300 mm+, the 2026 DC works and the Region's
  projects planned or under construction; a small map of them all, a row tapped highlights its main.
  No pressure zone: the open watermain layers carry none, and the zone a main runs through isn't the
  zone it serves. Street: **along** a road when the road's Region project or DC line covers 70%+ of the
  pipe's length (parallel, within 40 m); **near** a road when only the nearest house address gives it
  (a guess; a main of 600 mm+ never gets a crescent or court). DC works are named from their title
  (kind; the size is the 2026 DC map's, with the 2020 DC Background Study's size beside it where it
  differs: 17 of 98 works, mostly upsized since 2020);
  a Region project that builds a DC work joins its row; relining and trenchless works are tagged
  renewal; in-service years are the DC program's, construction dates the Region's schedule.
