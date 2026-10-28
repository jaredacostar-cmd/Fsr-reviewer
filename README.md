# Peel Growth Pipeline (unofficial)

> **Unofficial prototype · public data only · not a Region of Peel product.**
> Capacity and development-charge figures are screening estimates, not engineering analysis.

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

**Original application and later files on its land.** The app loads files from 2016 on, so a site
built on an older application (before pre-consultation was required) only shows the files filed on
top of it. A development's Overview names the earlier files its own files point to (a Brampton site
plan revision such as SP13-080.002 → SP13-080.000, the earlier files on a concession lot such as
C04W14.001–.008, a file or registered plan named in a description, a legacy "Transferred" file with no
dates) and lists every planning file with at least half its land inside the site's widest file, on
this site or another, with what differs (later files reaching past the original land, the homes
stated against the homes counted). *Look up the earlier files* fetches them live with no date filter;
*Show the layers on the map* draws the original land, each parcel in its colour with its homes, and the earlier ones.

**Units on the land over time** (the development's Growth tab, *Units on this land over time*). The land
is the whole application the site was split from: the largest planning file (up to 15 ha, not a
city-initiated policy file) holding at least half the site. Its files fall into parcels, from the
smallest footprints up; a file over several parcels (a whole block, the whole application) counts for
the one whose own files state the same count or name the same building height, else sets no count.
On a parcel, a later file revises a building when its count is within 25% (or the earlier count was a
pre-consultation's); another phase, an addition ("add 4 units", "24 units addition to the existing
plaza") or a count 25%+ apart is another building. Withdrawn or inactive files don't count; buildings
and parcels add up; a parcel is built when its new-dwelling permits (from 3 years before the file that
set its count) are all closed. The table gives each parcel's count at the end of each year, the land's
total and what is built, then each parcel's files, with flags where the app's count differs from the
latest files, a site plan and its condominium disagree, or a description changes a count.

**One application, one development.** When two or more developments with homes lie on the same whole
application (a 2016 site plan for 109 townhouses later split into two towers: 209 Steeles Ave W), the
tree build (`scripts/build-tree-counts.js`) makes them one development. Each piece keeps its own count,
except a piece whose every counted file was revised by a later file of the same building in another
piece counts nothing (137 Steeles Ave W: the 2023 rezoning for 1,147 and the 2025 site plan for 991 are
the same towers), and a piece holding the latest files of buildings on separate parcels counts them all.
The pieces' old keys resolve to the development kept (`merged` in `data/tree-counts.json`).

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
its own icon, under the home-screen name **Peel Dev**.

On a phone, the **List** button opens the filters and project list. Tap the legend to show
the phase names. **Hide** folds the bottom panel to its tabs (tap a tab to open it again), and
the ▾ on the timeline folds it to just the year range (it starts folded on phones).
Opened, the scenario bar (with its Design criteria) scrolls inside the bottom strip, which stays
within the window.

**Bottom panel:** three tabs, so only one thing shows at a time (the last one picked is
remembered; **Servicing demand** opens by default): **Servicing demand**, **Growth since
2021**, and **Breakdown & criteria** (by
dwelling type and phase, plus the editable design criteria).

## Using it

The sidebar has three tabs.

**What is this?** Rest the pointer on a heading, figure or control for 3 seconds (on a phone,
a genuine press-and-hold of about two-thirds of a second, finger still down — a plain tap no
longer opens it) for a card explaining what it represents and where the data comes from
(`js/info.js`).

**Explore** — one filter panel, in order: **Search · Stage · Where · What · When · Flags**,
then the list of developments on the map. One-tap **saved-view preset chips** sit above the
search bar (save a view from More settings → Saved views).
- **Search** by address, file number or description; a notice line says when nothing matches.
- **Stage:** the bar shows how the listed developments split across the stages — Inception,
  Under review, Approved, Permit issued, Under construction, Completed, Withdrawn — each with
  its count. Tap a segment to show only that stage; tap again to go back to all. Ctrl-click
  (⌘ on a Mac) picks several.
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
- **Records** (record type and **New buildings only**) moved to Settings & sources →
  **Records**. Record type: by default only planning applications and the building permits that
  belong to them (permits with no application, such as infill houses, are hidden; choose *All
  records* to see them); also building permits only, or applications plus permits.
  **New buildings only** hides alterations, signs, pools and similar permits.
- Where the old controls went: the phase quick-view chips → the **Stage** bar; the **Focus**
  chips → **Flags** (Growth is now the default land use; Major 100+ is a size; Employment is a
  land use; Committed capacity and Left to build are the counting basis in the **Scenario** bar;
  New in last 12 months is the Last 12 months button); record type and New buildings only →
  Settings & sources → **Records**; the demand year → the Scenario bar's **Results for year**.

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
Tools → Select an area), with the same summary panel. A plain drag still moves the map.

**Timeline (floating, bottom of the map, to the right of the legend):** opens on **2021–2026**. Drag the handles to keep only projects with
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
demand** adds up the shown projects (stage, flags and filters) in that DA. The DA pill (×), or
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
stage, the counting basis, the years and any other filter, with **Change** jumping to the selectors; there
is no separate selector in the panel. Each project counts all its units, except under the
**Committed** counting basis (units left to build that a site servicing or building permit commits, the Peel rule) and the **Left to
build** counting basis (planned units not yet completed, permit issued or not). Open **Breakdown & criteria** to edit the
criteria.

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
- **Share link** (top of the sidebar): copies a link to the exact view — stages, flags, filters
  (municipality, plans, MTSA, pressure zone, drainage area, size, land use, dwelling type, years), the bottom-panel tab
  and wastewater view, the mode / max-day / diversion switches, the map position and the open
  development. The address bar keeps the same link as you work (`#…` parameters).
- **Export** (*PDF / print* and *Excel* buttons on the Growth & demand, Water, Plants and
  Catchments views, the development panel and a lasso selection): the PDF option opens a printable
  report of what is on screen (with the mode, switches, filters, data dates, the criteria table
  with edits highlighted, and references) and starts the print dialog; Excel writes a workbook
  with a Summary sheet, one sheet per table (numbers as numbers, units in the headers, second
  lines such as population as extra columns) and a Criteria sheet. SheetJS (cdnjs) loads only when
  Excel is clicked. Per-file record tables are left to *Export CSV*. CSV and Excel
  Developments / Records exports carry provenance columns: `portal`, `source_url`,
  `retrieved_at` and `source_record_id`; the Excel Summary sheet and the CSV header comments
  carry the unofficial-prototype line.
- **Default view**: the map opens on the active development applications (application to
  construction, any year) over the background. On desktop the analysis panel opens on
  **Overview**; on phones it starts folded (*Analysis* opens it). Map tools (trace a sewer path,
  select an area, measure, test a site) sit under one Tools button, and are also buttons on the
  Overview; the north arrow stays on the map (tap it to switch between road grid and north up).
  The sidebar has search, a "Showing …" line, and the unified filter panel (Search · Stage · Where · What · When · Flags).
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
  Servicing tab; Servicing › Capacity's fold *Allocations recorded* lists them and gives each plant's
  room at the 90% trigger after existing + approved development and after allocations made ahead of
  approval (also on the Overview), with Export and Import CSV in its full table. Kept in the browser;
  CSV export / import to share one list.
- **Data freshness and model checks** (Settings & sources): every source with its date, update
  interval and status (current / due for a refresh / out of date / reference / live), summarised on
  the Overview; and the model against published figures — 2021 Census population for Peel and each
  municipality, the share on municipal sewers, population today against the annual report's
  population served, and the plants' and South Peel water's design-criteria flows against the 2025
  measured averages (±10% matches, ±25% close; each row explains an expected difference).
- **Number conventions**: people and jobs are rounded the same way everywhere (whole under 1,000,
  nearest 10 to 10,000, nearest 100 above); units are exact counts; L/s for pipes, stations and
  single developments, ML/d for plants, zones and totals; ≈ marks a screening estimate.
  Capacity and DC results are labelled **screening estimate** wherever they appear.
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
- **Filter by area** (own box, bottom right of the map, under the Wastewater loads box): the
  municipality (All · Brampton · Caledon · Mississauga) on top, then secondary plan / character area, MTSA, pressure zone and drainage area (wastewater block). Each is a
  dropdown of checkboxes with a search and Clear, so several can be picked: a development counts if
  it's in any pick of a list and matches every list used. Picks are outlined on the map, named in
  the filter chips and kept in share links and saved views (comma lists; older one-id links still
  open). The box folds to one line with a summary.
- **Unofficial banner**: a slim strip at the very top of every screen reads *Unofficial
  prototype · public data only · not a Region of Peel product*. The same line is printed on the
  executive briefing, the servicing memo, the area report, the print map, the Excel Summary
  sheet, the PDF footer and the CSV header comments.
- **Map layout**: top right, the view switch (Planning / Water / Wastewater / DC) over **Layers**:
  one switch per layer — Developments, Wastewater blocks, Pressure zones, Capacity colours,
  Existing pipes, Planned DC works, Planning areas, Census areas — then *More
  settings* (saved views, development colour / size / labels, capacity shading, existing pipe kinds
  and size labels, DC works by system, planning area kinds, base map). The views set the switches;
  changes are remembered per view. With the blocks as the catchments there is one wastewater area
  layer (Wastewater blocks), so it can always be switched off. Bottom left, one box: the Demand
  year over the legend, with the timeline beside it (above it when there's no room). The boxes along
  the bottom never overlap: the timeline, the wastewater loads box and the Clear selection button
  move clear of each other and of an open development panel, and the Layers panel scrolls rather
  than run into them. When a setting hides the developments (switched off, no growth load on in
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
  week tab, changed-this-week first) and the ★ Watched flag. *Saved views* (Layers & style) keeps
  named filters + map position + view + layers in the browser. An 11-step tour shows once. *Help*
  (header), the **?** button on the map (under the north arrow) or Tools → *Help & tips* opens task guides — servicing check for a development, when DC
  projects are needed, area / secondary plan reports, testing a site, weekly changes, plant and
  pumping station capacity over time, water by pressure zone, existing mains and ground, saving /
  sharing / exporting, and how far to trust the numbers — each with *Show me*, which sets the map
  up for the task; plus quick tips and the tour again.
- **Reports**: *Memo* on a development opens a one-page servicing memo (proposal, status, flows,
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
  remembers its own settings. Every view shows the same developments and site boundaries; the
  servicing views no longer switch on the *Growth* focus, which hid applications with no unit or job
  count (e.g. 11722 Mississauga Rd). On a phone a long Layers summary is cut short with … rather
  than widening the box off the screen. *Layers & style* is grouped into Developments, Capacity,
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
  and build-out flows and pumping station load. *Shapefiles (.zip)* puts every map layer
  (developments shown, servicing areas, planned works, capital projects, EAs) in one zip for
  ArcMap / ArcGIS Pro: one shapefile per layer and shape type, WGS84 (`.prj`), UTF-8 text
  (`.cpg`); field names are shortened to 10 characters and `fields.csv` gives each full name,
  text over 254 bytes is cut, and `README.txt` carries the disclaimer, filters and scenario
  (`js/export-shapefile.js`, no library). *Print map* prints the map landscape with a title
  block, scenario, legend, north arrow and scale.
- **Map tools** (left of the map; the Tools menu opens above the north arrow, help and scale controls): *Measure* distances (*Clear* starts a fresh line without adding a stray point) and select every shown development within
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
- **Results for year** (Scenario bar): the year the
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
- Census area outlines are now off by default (turn on under Layers & style).
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
- **Trace a development to the plant** (development → Servicing → *Trace the path to the plant on the
  map*): a dashed line from the site to the 300 mm+ sewer it joins, then every pipe to the treatment
  plant coloured by its capacity state with flow arrows, the pumping stations passed and the plant;
  the panel gives the length and number of pipes, the wastewater blocks passed and the tightest pipe
  (each a link). Also for test sites.
- **Developments on / off** (map panel, every view): hides or shows all development markers, labels and
  site outlines (remembered).
- **Wastewater loads** (own box, bottom right of the map, Wastewater view; always in sight): *Census (existing) · Built since · Site plan
  approved · Proposed (in review)*; each controls both the development markers shown and the load put on the
  sewers (capacity colours, a pipe's flow table, the trace's tightest pipe). All on = full build-out
  conditions; the legend lists the loads when some are off.
  Site boundaries stay on the map whatever these switches say: a development whose layer is off
  has its boundary dashed and faint, with "Not in the wastewater loads" in its tooltip.
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
   **Aerial check** (runs when opened) and **Source records**, collapsed. Every source record
   shows its portal (e.g. *City of Brampton Open Data*), a link to the record in its ArcGIS
   FeatureServer layer (queried by object ID), and the pulled-on date (the snapshot build date,
   or the live-load time after Refresh live). The header shows *Data as of \<date\> · \<n\>
   sources*, linking to the sources list.

`data/council.json` is built weekly by `scripts/build-council.js` from the Mississauga, Brampton
and Caledon eSCRIBE portals (planning committees, council, general committee, since 2019; only
meetings in the last 120 days are fetched again), and loaded only when a development is opened.

**Applications against the 2051 forecast** (Growth tab, below the growth chart): for each
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

**Water capacity by growth layer** (Water → Treatment & capacity) uses the same bars as the
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

- **Applications in this development** (Overview tab, when a development has several files): each
  formal application once, with the pre-consultation on its land (same civic address or
  overlapping boundary) nested under it. Open any one to see it **on its own**, with the same
  tabs (Overview, Demand, Water, Wastewater, DC Analysis, History): the application, its
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

  The area plan's servicing tabs (Demand, Water, Wastewater, DC Analysis) show the whole area:
  its own remaining units plus its draft plans. Its header says "whole area: plan + N draft
  plans". This is a view; each draft plan still counts once, in its own development. Infiltration
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
- **Build-out by application** (Demand tab, under *Units, jobs & build-out*, where a development
  has several files or a file without a unit count):
  - One row per formal file: planned units, plus the permit units inside its boundary (permitted,
    completed, left). A permit counts in the smallest file boundary that holds it.
  - Each row says whether it is *counted* or *within the counted proposal*. Site plan or condo
    phases add up; for an official plan / zoning / subdivision file the largest counts.
  - Tap a file to open it on its own.
- **Units only in the attachments**: some descriptions say "refer to the attached cover letter /
  PJR" and give no unit count. About 76 files, nearly all in Brampton. Their documents are public on
  BramPlanOnline, but they are found by searching the file number and are not read automatically.
  - Those rows are flagged, and the unit count from the cover letter can be entered. Entry is also
    offered where the development has no count at all.
  - The figure is kept in this browser, marked *your figure* (× removes it), and counted like a
    published one in the development and every total.
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
    counted. The *Build-out by application* entry can add them.
  - 86 files read higher, e.g. 10512 Mississauga Rd (OZS-2025-0015) 52 → 568. Peel +4,964 units
    (+5,508 active). Snapshot records are re-read when the app loads.
- **Unit counts written as "unit count: 2656"** in a description are now read (e.g. OZS-2025-0033:
  2,656 units), including from the weekly snapshot.

## How applications connect: the development process

> **Audit in progress (report only).** `js/tree.js` and `scripts/audit-tree.js` rebuild the grouping
> as containment trees, following the Ontario process:
> - pre-consultation → block plan
> - OPA / ZBA beside a draft plan
> - draft plan ⊃ site plan ⊃ condominium ⊃ permits
>
> Each file gets a role and the reason for it. Each link records its rule, overlap, address match,
> date order and confidence. The audit writes `data/tree-audit.json`. Run it locally with
> `node scripts/audit-tree.js`, or from the *Probe data sources* workflow (mode `tree-audit`) for a
> live pull. The app's grouping and totals below are unchanged until the audit is reviewed.
>
> The audit also reports:
> - Two site plans on the same land with different counts, each judged a phase, a resubmission,
>   a redevelopment or unclear from the files' evidence.
> - The latest official plan amendment that applies to each development, site-specific or
>   area-wide. Amendments are policy and never counted. An area-wide amendment never joins
>   developments.
> - Developments where no file states a count, sorted by the growth named in their wording:
>   - non-residential: not counted
>   - a new detached house: counts 1
>   - a replacement house or an addition: 0, since only growth counts
>   - homes proposed with no number: listed to look up
>
>   Counts found online are kept in `data/unit-lookups.json`, each with its source page. They are
>   used only when the file itself states no count. Secondary-plan targets, counts already carried
>   by a linked file, and existing homes are left out (listed under `notUsed`).
> - **Areas around the tree.** Secondary plans, precinct and block-plan areas, Mississauga's
>   *OP character areas* (never called secondary plans) and MTSAs are area tags, not tree nodes.
>   - Each tree is tagged, by its root's boundary, with every area it overlaps. The largest
>     overlap is its primary area, and all tags are shown with their overlap %.
>   - An MTSA is an overlay tag only, never a primary area.
>   - A filed block plan or precinct plan, including a pre-consultation for one, is the root of
>     its tree. A file that only sits within a precinct is not.
>   - A developer-led official plan amendment that creates or amends a secondary plan stays in its
>     tree with a "targets: plan" note. Only municipal-wide amendments with no site address
>     are policy.
>   - The audit lists trees that straddle two or more plans (no plan holding 90%), and precinct
>     areas with no matching block plan file once a precinct layer is loaded. Workflow mode
>     `block-areas` looks for the published layers.

In Ontario (and Peel's municipalities) one piece of land moves through a sequence of files:

1. **Pre-consultation** (PRE-…): the proposal is discussed before a formal application.
2. **Official plan / zoning amendment, often with a draft plan of subdivision** (OZS / OZ / 21T-…).
   This sets the use and the unit count. It is refiled or revised as the proposal changes.
3. **Draft approval, then registration** of the subdivision.
4. **Site plan** (SPA / SP-…) for each block or building, sometimes revised and resubmitted.
5. **Draft plan of condominium** (DPC / CD-…), which repeats the site plan's units.
6. **Building permits, then occupancy.**

Files on the same land are one proposal and count its units once. The audit found places where the
grouping didn't follow this, and the rules now are:

- **A refiled or revised application** whose boundary lies at least 90% inside another of similar
  size (the other at least 60% covered) is the same land, whatever its address.
- **A pre-consultation** joins the one formal application whose land it overlaps most (at least half
  of either boundary). It never links two separate proposals together. Before, a pre-consultation
  bridging two neighbouring proposals on Mississauga Rd merged them (10625 Mississauga Rd lost 255
  units).
- **An older planning file inside a newer, larger one** is that land's earlier proposal and joins
  it. A precinct or block plan only takes draft plans as separate developments when its own files
  are planning files filed before them.
- **A site plan or condominium revision** (same boundary, at least half overlapping, and either the
  same unit count or a description saying revised / minor / resubmitted / amended) is counted once,
  not added as another phase. Example: 1965–1975 Cottrelle Blvd showed 348 units from two
  submissions of one 174-unit site plan.
- **Nesting needs real overlap**: a group of files is placed inside a larger development only when
  at least half its land lies within it. Before, one centre point decided, so a 185-unit stacked
  townhouse proposal (C05E17.006, at Bramalea Rd and Mayfield Rd) was filed under the neighbouring
  Walmart at 5085 Mayfield Rd. Likewise OZS-2021-0026 (201 units) was hidden under a separate
  601-unit subdivision on Torbram Rd that it doesn't overlap.
- **"16 blocks of townhouses (70 units)"**: the units in brackets are one part of a listed count.
  OZS-2022-0034 at 5759 Mayfield Rd reads 171 units (101 singles + 70 townhouses), not 70.
- **"UNASSIGNED"** and similar placeholders aren't used as a development's title.

Peel's total falls by about 1,300 units (239,944 counted, 194,206 active): revisions and same-land
refilings no longer add up. There are 31 fewer developments and 9 fewer that are only a
pre-consultation. 66 pairs of developments still share some land, and in 7 of them both count
units. Six are precinct / block plans with their draft plans, which the area-plan rule counts
once. The seventh is two neighbouring proposals at Bramalea Rd and Mayfield Rd: 90 apartments
(C05E17.005) and 185 stacked townhouses (C05E17.006). Their boundaries overlap, but they are
different buildings, so both count.

## Latest submission on labels and titles

**Latest submission.** The map labels (Address + phase and Address) and the development panel's
title show the latest application submitted on the site: its date received and file number. The
open data carries each file's first submission date, not resubmissions.

## Development panel tabs

A development opens on six tabs (the last one picked is kept):

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

The bottom panel's tabs run Overview · Growth · Demand · Water · Wastewater · DC Analysis.

## Map boxes, the results year and the tour

- **More settings** has its own box under Layers (top right). With both open they share the
  height down to the boxes at the bottom right; only open boxes are capped.
- **Site boundary on hover:** point at a development (mouse / trackpad) and its application site is
  outlined in dashed orange with its address, phase and units; one without a published boundary
  gets a dashed ring. More settings → *Site boundary on hover*: Show on / off and Reach (10–120
  screen pixels, default 40), remembered in this browser.
- **View switch** (Planning / Water / Wastewater / DC): the full labels always show; on a narrow
  screen or with a wider system font the buttons wrap onto a second row rather than being cut off.
- **Clear selection and the Developments Show / Faded / Hidden switch** sit at the top of the map,
  between the controls on the left and the boxes on the right (stacked when the gap is narrow); on
  a phone, under the Layers and More settings boxes. Fitting a trace leaves room for them.
- **Results for year** (Scenario bar) runs from the **2021 Census** to build-out
  (2021 Census · Today · Build-out). Before today, growth built since the census counts in
  the share of it completed by that year (Peel-wide, by units and completion date); approved and
  proposed growth phase in from their horizon years as before.
- **A development open:** on a wide screen Layers, More settings, the wastewater loads box and
  Filter by area move left of the panel; the Clear selection button centres in the visible map. On
  a phone (bottom sheet) Layers and Filter by area stay above the sheet, and the timeline, legend and
  loads box step aside until it closes.
- **Tour:** 15 short steps in chapters (Start, Find, Map, A development, Analysis, Help). Steps set
  the app up as they go: a real development opens, its Servicing tab and sewer trace show, then the
  Analysis tabs. Progress dots (tap to jump), Back / Next, ← → keys, Esc to end; the tour tidies up
  after itself. Help (?) → Take the tour again.

## Growth tab and the 2020 Master Plan comparison

**Growth tab.** *Growth since the census* (census population and dwellings, built since, approved,
proposed, the growth chart and the 2051 forecast check) has its own bottom-panel tab, **Growth**,
next to **Demand**, which keeps the servicing demand of the shown developments.

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

**FSR link.** A development's **Servicing** tab opens with its latest Functional Servicing Report.

- `scripts/build-fsr.js`, run weekly with the data snapshot, reads the municipalities' application
  pages. It matches their file numbers to the applications and keeps the newest document named a
  functional servicing / servicing report or brief.
- **Mississauga:** its active application pages (official plan / rezoning and subdivision files,
  about 57 of the 1,006 applications), found through the site's search and the pages' address
  pattern. The City's pages build their document list in the browser, so the tab links the
  application page and points to Project documents rather than the PDF itself. Site plans have no
  public page.
- **Caledon:** its application pages, with each application type's own numbering (direct PDF links;
  64 pages carry an FSR).
- **Brampton:** documents are public on
  [BramPlanOnline](https://planning.brampton.ca/CitizenAccess/Cap/CapHome.aspx?module=Planning&TabName=Planning),
  with no sign-in. A file is found by searching its number: the portal's pages need its internal
  record ids, which the open data doesn't carry. So the tab links the search and names the newest
  file to look up.
  - Brampton's reports aren't read automatically. The portal is open to people, but its firewall
    turns away automated requests: every page answered "Request Rejected" to an automated check on
    2026-10-21. The app doesn't try to get around that. Reading them needs the City's agreement or a data feed from it.
- A link to all of the application's documents comes with it.

**Supply route.** The Servicing tab's **Water** section shows where the water comes from, like
the sewer trace.

- From the development's pressure zone, it takes the nearest station whose pumps feed that zone
  (2020 Master Plan pump groups). It repeats from that station's reservoir zone down to the
  treatment plant.
- Each step shows the pump group's firm capacity.
- Below the route is the pumping into the development's zone as a share of firm capacity.
- Caledon's groundwater areas show their well system instead.

**Water supply trace.** At the top of the Servicing tab, beside *Trace the sewer path*, **Trace the
water supply from the plant** draws the route on the map like the sewer trace.

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
  - Ontario's housing supply progress, from the Ontario Data Catalogue (still collected, but no
    longer shown: the province's 2031 housing targets were removed from the app).
  - CMHC starts and completions by municipality, from the HMIP tables (Toronto CMA by census
    subdivision).
  - The Ministry of Finance 2025–2051 projection for the Peel census division.

  These feed:
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
  - dry weather flow at the results year, with a diurnal pattern;
  - RTK rainfall-derived I&I on each block's sewered area, with placeholder R, T and K to
    calibrate;
  - a 4-hour Chicago design storm from the MTO IDF curves.

  It runs in SWMM 5.2: this was checked with pyswmm, with a 0.03% continuity error.
- **Hydraulic check (beta).** **Settings › Labs › Hydraulic check**, then Servicing › Network's full
  table, runs EPANET 2.2 in the browser
  (epanet-js 0.9.0, loaded from jsDelivr on demand).
  - It works on the large mains crossing into each upper pressure zone, at the maximum day for
    the results year.
  - It reports each main's flow, velocity (against 1.5 m/s) and head loss per km.
  - The `.inp` can be downloaded to build on in EPANET or InfoWater.
- **Effluent compliance.** `data/compliance.json` is built by `scripts/build-compliance.py` from
  MECP Environmental Compliance Reports (municipal and private sewage, 2020–2024). It lists
  exceedances at G.E. Booth, Clarkson and Inglewood, shown in **Wastewater → Plants**.
- **Measured plant flow.** `data/plant-flows.json` is built by `scripts/build-plant-flows.py` from
  MECP's Municipal Treated Wastewater Effluent data (monthly total flow, 2008 on) for G.E. Booth,
  Clarkson and Inglewood. Each plant's scope panel shows the trend against rated capacity and the
  90% trigger; Settings → Data quality checks it against the Region's annual reports (within 0.2%).
  The March 2025 G.E. Booth → Clarkson diversion breaks either plant's trend alone, not the two
  together. Rebuild with **Probe data sources**, mode `plant-flows` (once a year).
- **Address points.** `data/address-points.json` is the Region of Peel address point (open data,
  about 504,000 points) for each address on a file: `scripts/fetch-addresses.js` pages the layer and
  `scripts/build-addresses.js` matches it with the same keys the app uses (`js/address-key.js`:
  multi-address strings split, number 0 and intersections skipped). 81% of application addresses
  and 88% of permit addresses match. Records › Data checks sorts the possible duplicates by it
  (same address point first, neighbours last), and a file in Records says whether its address
  matches and how far the map point is from it. Rebuilt every Monday after the snapshot.
- **Plan area and implied density.** `scripts/build-areas.js` keeps Brampton's published plan size
  (`EST_SIZE_HC`) and any appeal from Schedule 10, and the mapped area of every plan. Growth → Plans
  against their targets adds **Target per ha** (people + jobs, or units, over the plan's area) to set
  beside a stated density; ⚠ where the published size and the boundary disagree by more than 25%
  (Heritage Heights: 864 ha published, 1,562 ha mapped).
- **Overflows and spills.** `data/ww-events.json` holds Table 7 of the Region's Wastewater
  Collection System annual reports (2024: 18 events; 2025: 12) and the station roster in
  Appendix A, transcribed by hand because the table's layout does not parse;
  `scripts/check-ww-events.js` checks every Spills Action Centre number, the stated total and the
  roster against the report text (run in **Probe data sources**, mode `peel-reports`). Station and
  plant scope panels list their events; Servicing → Capacity folds a yearly summary; Data quality
  sets the GIS stations against the roster.
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
- **Left** (to permit) = planned − permitted per type. Every column adds up to the tiles above.
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

## One set of numbers: pages and the full map agree

Home, the workspace pages and the full map's panels show the same figure for the same thing.
Browser checks (`npm run browser`) compare them for Peel and each municipality at every counting
basis, and for every plan, sub-area and precinct.

| Figure | One rule |
|---|---|
| Built / left to build | A development marked completed with permits still open: the homes on open permits are left to build ("permit issued, not built" on the stage chart), not built. The stage chart's "not yet built" equals Growth's left to build. |
| The units figure under the Scenario | Says what it counts: *planned* (every stage), *applied for (no pre-application)*, *approved, not yet built*, or *left to build*, with "of N planned" beside it. Growth in an area follows the Scenario for units, people and jobs, as the Overview does. |
| Capacity and the DC program on Home | Region-wide (a plant serves more than one municipality): with a municipality picked, those figures say "Peel-wide". |
| First 90% trigger | The first treatment plant (wastewater or water) to reach its 90% expansion trigger, then the most loaded: the same plant on Home, Servicing capacity and the Overview's headline. A facility's own *limit* (firm capacity, full pipe) is named as a limit, not a trigger. |
| This week | One list of changes for Home, the Overview, the badge and the This week page, in the municipality picked; none on the first (baseline) update. |
| Dormant developments | Held out of every count (`PeelPhases.dormantOf`); the stage charts on Home and Growth in an area say how many homes are left out. |
| Plan areas | A plan filter on the map (and a drill on Home › Growth › Areas: the drill is the filter) holds the developments Growth › Areas counts there, by the same placement (`PeelPlanTables.areaIdsOf`): a straddling development by its share, precincts and sub-areas included. The Overview and the header count the part inside the plan (units, people, jobs), with what the straddling developments hold outside it named beside. A precinct filed under the plan holding most of it can't pull a development out of the plan it sits in (Bram West 40 (d) was counted at half). |

## Sections: a page shows every map tab for its scope

Each full-map tab's panel (Overview, Growth, Servicing, Capital, Records) is a **section**
(`js/sections.js`). Home shows them as its tabs at Peel, a municipality or a plan, the map's five tabs
and their views under its header (navigation phase 6: *Home hosts the map's tabs*, below). **Check a site** shows all of a development's sections under one bar, by the
map's tab names: Overview, Growth, Servicing (Network · FSR review), Capital (the DC projects it relies
on, then the EAs and works near it, one panel) and Records.
Each is the map tab's own panel, so the page and the map read the same answer and figures; a
section whose tab builds its panel only when opened (Capital, Records) is built for the page on
demand. Nothing about a site is only in the full map.

## Explore: one workspace for a site, a plan or an area you draw

Home's sidebar has one **Explore** entry for what were five: Growth in an area, Check a site,
Review an FSR, Forecast and Study area are its views. Since navigation phase 6 an area's two are Home's
tabs (Growth › Areas and Growth › Forecast): Explore opens them there.
- The one search (an address, a file number, a description) and **Draw an area** are in every
  page's header, not only Explore's (see *Find from every page* below). A site picked from an area
  view (the search, a list row, the map) opens on its page.
- A site shows where it sits, **Peel › municipality › plan › site** (the plan tree's placement, as
  the plan filter); each step makes that level the filter and opens Home › Growth › Areas.
- A site's sections: Overview, Growth, Servicing, Capital and Records; **FSR review** is Servicing's
  second view (the cross-check and what an FSR should cover), a row under the bar on Servicing. An
  area's are Home's tabs: Growth › Areas (the drill-down) and Growth › Forecast.
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
  sidebar (QA/QC).
- The views keep their own ids (`site`, `fsr`, `growth`, `outlook`, `study`), so links, share links and
  the map-view chips still work; Explore opens the site in scope, else the last view used.
- A site's page has the **live map** beside its sections, at the site, with the infrastructure around
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
included, has the one search and **Draw an area** beside it (the Study area page draws on its own
map). Draw an area opens the Study area map view with the Select tool on; on a phone the bottom
sheet drops to its peek, so the map is there to draw on.

On a page, a pick opens what it found (`js/workspaces.js` `pageRoute` and `routePick`):

| The pick | Opens |
|---|---|
| A development | Its page on Overview (from Review an FSR, Servicing › FSR review) |
| A file number (a development matched by it only) | Its page at Records, the file's row in the tree marked |
| A secondary plan or character area | Its filter, the map and every tab following it, on the tab you were on (from Home's Overview, the briefing at the plan with its Area report) |
| An MTSA | Its filter (as on the map), its municipality first, on the tab you were on |
| A plant, station, block, zone or South Peel water | Its scope on Servicing capacity's map view |
| A DC project | Home › Capital › DC timing at the project, in place: its developments by tier and both verdicts |
| A DC facility, or an address | Capital's or Check a site's map view, then the facility card or the pin |

- **Pages only.** On the full map and in a workspace's map view the search works as before (a plan
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

- **Servicing** (Home's tab; the sidebar's Servicing capacity opens it at Capacity): **Capacity** (the
  Servicing capacity page's builder: limits, the 90% trigger, the uncommitted reserve, no relief in time;
  the allocations recorded a fold of it, navigation phase 2, below) and **Network** (the map's panel,
  its footer's actions first).
- **Capital** (Home's tab; the sidebar's Capital opens it at DC timing): **DC timing** (the Capital
  page's builder: every 2026 DC project with both verdicts; a project opens in place, with its map, and
  *Open the map* opens its card there), **EAs** (the EAs, then EA to construction) and **Projects** (the
  map's panel; navigation phase 4, below).
- Each view is a page builder where the page adds to the panel, else the map's own panel
  (`js/sections.js` `VIEWS.area`), built on demand when its tab hasn't been opened, so the page and the
  map read the same (navigation phase 6: *Home hosts the map's tabs*, below).

## Servicing and Records (navigation phase 2)

Navigation phase 2 (docs/architecture-review/navigation-design.md §3.4, §5, §7). Servicing has two
views, **Capacity · Network**, at Peel as at a development (where Capacity is hidden, as before).

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
  Data checks (Help's bar links there) shows the same panel (kept up to date as the servicing model is rebuilt, a Scenario change
  included, whichever tab is open); its Servicing model rows and *See all* open the full map's Records
  › Data checks full table at their comparison, and its Review outlets row opens the page from there.
  The sidebar entry stays.
- **The Sources & checks gear page is gone.** It was reached only from the Overview's ⓘ line
  (*Data & checks →*); that link is now *Records › Data checks →*, and it works in the Overview
  panel's Method fold and from a page too (it did nothing there). Freshness and the references are
  Records › Sources; every check, the two that were only on that page included, is Records › Data
  checks. The gear menu's pages are Settings and Labs (`window.GearPages`).
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
- **What's coming** (the sidebar entry, the `coming` chip and page) opens the Forecast with By period
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
| The What's coming page (`#w=p:coming`, the sidebar, a stored `lastWs=coming`) | Home › Growth › Forecast, By period first and open (navigation phase 6; was the Forecast page under *What is coming, where, when and how sure?*; the page id is kept until the sidebar entry goes) |
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
  timing* step opens Capital › DC timing), a headline with both verdicts, the two verdicts as lines,
  who relies on it as the page's project says it (units and flow in the headline; the developments by
  tier, their units and people + jobs, and their flow as lines), every development on it by tier (needs
  it to connect, needs it for capacity, on its path but not needed; past the first 30 the rest in a
  fold; the map and the left panel filtered to them, a row opening the development), the Funding lab's
  lines (never in the public version), *CSV: its developments*, *All DC projects ›*, then *What it
  relieves*. The allocation is worked out after the
  card first paints ("Working out the developments relying on it…"), then the card is drawn again, once
  (the tap itself never walks every pipe; the build runs after the paint). A redraw, after the
  allocation or the sewers it waited for, never moves the reader: the tab they went on to, the phone's
  sheet and the card's scroll stay as they were.
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
  Records › Files on the map and the site's Records section on its page. On a phone
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
- **Its page** (`js/sections.js` `SITE`): the sections are the map's tabs by their names, **Overview ·
  Growth · Servicing · Capital · Records** (were Summary · … · Files · FSR review); on Servicing a second
  row, **Network · FSR review**. Review an FSR with a site (`#w=p:fsr&d=<key>`) is the site's page at
  Servicing › FSR review; without one, its Find step. The footer keeps the Servicing memo (FSR review:
  Copy the comparison, Print / PDF), Open the map and Another site; the Inquiry draft, ☆ Watch and
  Check FSR are the header's.
- **Counts**: the *Previous* counting switch is retired (owner decision 14; see *Step B1*). A development
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
| The page's sections `summary`, `files` (a search pick, `siteAt`) | The same ids, now titled Overview and Records |

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
| Servicing › Capacity | Servicing capacity's builder: the limits, the reserve, the allocations fold |
| Servicing › Network | The map's panel |
| Capital › DC timing | The Capital page's builder: a project opens in place, with its map |
| Capital › EAs | The EAs page's builder, with EA to construction |
| Capital › Projects | The map's panel |
| Records › Sources | The Data sources page's builder |
| Records › Data checks | The map's panel |

(`js/sections.js` `VIEWS.area`: its keys are exactly the map's chips at an area, a test.) A view that is
the map's panel shows its footer's actions first (Network's *Show the network on the map*, Projects'
*Show them on the map* and *CSV: every contract*, Data checks' *Duplicate check* and *Review outlets*),
then *Open the map* and *Open full table*.

- **The old pages are views of Home.** Growth in an area, the Forecast, What's coming, Servicing capacity,
  Capital (DC timing, EAs) and Data sources keep their page ids (links, sidebar entries, buttons, the start
  screen's last workspace): each opens Home at its tab and view (`js/workspaces.js` `HOST`, `hostOf`), its
  fold open (What's coming: By period; EAs: EA to construction), and Home is lit in the sidebar. Their
  section bars are gone (the strip), and so is Explore's views bar on them (a site's page, Review an FSR
  and Study area keep it until phase 6c).
- **Servicing and Capital show "loading"** until their data lands, on Home's strip and on the map's (they
  used to appear late on the map): picked early, the tab is lit, says loading and opens as soon as it can
  (the pick is held: `heldTab`, `wantedTab`); on a phone the word is "…".
- **Open the map, ← Page and the back bar keep the tab and view.** A view's *Open the map*
  (`data-ws-keep`) opens its map view, with its layers, at the same tab and view; the map view's *← Page*
  goes back to Home at the map's tab and view as they were left; the full map's *← Back to Home ›
  Servicing › Network* names the view and keeps it (and follows a tab picked on the full map meanwhile). A
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
  strip, in the map's words (`js/svc-scope.js` `peelWideText`, the map's `#scope-note`); at Peel, and on
  Growth and Records, nothing (browser path *phone: Home's Servicing and Capital at a municipality say
  Peel-wide once …*).
- **Share links** made on Home write `nav=3` with the map's tab and view; a link from before (`nav=2` or
  none) on Home or Data sources opens the page's own view (Home: Overview), as it showed when it was made
  (`js/share.js`).
- **Phones** (390 px): the strip and the views row scroll sideways in their own box, the open one scrolled
  in; their buttons are 44 px; Home's strip sits above its groups; nothing scrolls the page sideways.

Old names still land (`js/workspaces.js` `HOST`, `hostOf`; `js/share.js`; tests/nav-aliases.test.js
"phase 6a"):

| Old | Where it opens now |
|---|---|
| `#w=p:tight`, the sidebar's Servicing capacity, `lastWs=tight`, Help's role buttons | Home › Servicing › Capacity |
| `#w=p:growth` | Home › Growth › Areas, at the plan filter's level |
| `#w=p:outlook` | Home › Growth › Forecast |
| `#w=p:coming`, the sidebar's What's coming | Home › Growth › Forecast, By period first and open |
| `#w=p:projects`, `#w=p:capital`, the sidebar's Capital | Home › Capital › DC timing (an open project stays in place) |
| `#w=p:eaflow` | Home › Capital › EAs, EA to construction open |
| `#w=p:data`, Help's bar's Data sources | Home › Records › Sources |
| Help's bar's Data checks | Home › Records › Data checks |
| `#w=p:explore` | The open site, else the last Explore view (an area's: Home's tab), else Home › Growth › Areas |
| `#w=home&t=<x>`, `#w=home&nav=2&t=<x>` (Home links made before phase 6) | Home at Overview |
| `#w=p:<area page>&t=<x>`, `#w=p:data&nav=2&t=<x>` | That page's own tab and view (`#w=p:data&t=overview`: Records › Sources) |
| `#w=home&nav=3&t=…&gs=/svs=/dcs=/rs=` (new links) | Home at that tab and view |
| A saved view | Its own `t`, as before (it applies on the full map) |
| The Growth drill's page-local level, `data-ws-drill`, `data-ws-explore` | The map's filter (`drillTo`: `state.muni`, `state.sp`) |
| `data-ws-asec`, `data-ws-wsec`, `sectionAt`, `wsSpecFor`, `areaSpecFor`, `PeelSections.AREA`, `WORKSPACES.servicing` / `.capital`, `filterChipsHTML`, `#ws-filters`, *↑ Up a level* | Gone (the strip, the trail) |

No stored preference is renamed and no pane id moves; the strip counts as the map's own `tab:` / `sub:`
usage keys, so a tab's count adds the page and the map up.

## Reference and This week

- **Reference** is one sidebar entry: **Help**, **How it works** (and each guide), the **Glossary**,
  **Data sources** and **Data checks**. The last two are Home's Records tab, Records › Sources and
  Records › Data checks (the old Data tab; navigation phase 6): Help's bar links there.
- **This week** carries **Your watch list** (the developments starred ☆ Watch, each with its stage
  and whether it changed this week, changed ones first) and the week's **capacity alerts** from the
  weekly feed, both of which were only in the full map's Watch tab.

## Home: the briefing

- **Home is the page host** (navigation phase 6): under its header the map's five tabs, Overview ·
  Growth · Servicing · Capital · Records, and the open tab's views; the briefing below is its Overview.
  The sidebar's Servicing capacity, What's coming and Capital open a tab of it, and Home stays lit. See
  *Home hosts the map's tabs*.
- **The scope first**: Peel, Mississauga, Brampton or Caledon (the map's municipality filter). Every
  figure follows it; one that is Region-wide (capacity, the DC program) says so.
- **Four groups of figures**, each the answer of its page and opening it: **Growth** (homes planned,
  left to build, people at build-out, expected by 2031), **Servicing** (over capacity at build-out,
  the first 90% trigger, the first zone limit (100% of firm pumping)), **Capital** (DC projects late,
  facilities with no relief in time) and **Change** (this week's changes, files on a tight plant).
  The first 90% trigger opens its plant as a scope on Servicing capacity's map; the first zone limit
  (pumping into a pressure zone, which reaches its limit at 100% of firm pumping, not at the plants'
  90%) opens Home › Servicing › Capacity (Soonest limits, and every zone in its full table). Both use one rule
  (`js/ws-pages.js` `firstTrigger`, `firstZone`): the first to its limit, ties to the more loaded.
  When no zone reaches its limit by the horizon's end (2051), the zone figure says *None* and names
  the most loaded zone, with its % at build-out.
- The stage chart (with the homes dormant developments leave out), **Needs attention** beside the
  capacity map, **Largest left to build**, **Plans furthest behind their target** and **This week**.
  A Needs attention row opens its plant, station or water system as a scope on Servicing capacity's
  map; a row with no scope (storage, pumping into a zone) and *See all* open Home › Servicing ›
  Capacity.
- Home's sidebar has nine entries: Home and This week, then by team Explore, Servicing capacity and
  What's coming (Planning), Capital, Review outlets (QA/QC), Old pipes (Asset Management) and
  Reference, then Full map; What's coming opens Growth › Forecast on Home, By period first and open.

## Build-out: planned vs permitted vs left to build

For each project with a unit count on its planning applications:

| Figure | Meaning |
|---|---|
| Planned | Units on the planning applications. Files on the same land repeat one proposal, so the largest figure is used. Parts nested inside a larger application are summed, unless the parent's own figure is larger. |
| Permitted | Units on building permits on the land. Permits at one address (foundation, full, revisions) count once. |
| Completed | Units on permits marked closed, finaled or occupied. |
| **Left to build** | Planned − completed: units not yet built, permit issued or not. One figure on Growth, the Overview, Timing, the stage chart ("not yet built") and the Scenario's **Units: left to build**. |
| Left to permit | Planned − permitted: units with no building permit yet. |
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
| Demolition permits (Mississauga's `HOUSDEMO`, `9DEMO`) add no units: the count on them is the homes they remove. | |
| Units are **net** of the dwellings the site demolishes. Sources: demolition permits, "demolish existing dwelling" on a new house's permit, Caledon's "Demolish/Construct Detached", "existing dwelling to be demolished" on an application. The largest count stands, since they describe the same house. A tear-down rebuild adds 0; a fourplex replacing a house adds 3. | The house it replaces is already on the system. |

When a development has two or more phases, the project panel lists them, each with its file
number, status, planned units, and (where the phases have their own land) permitted units and
units left to build.

A project's units are counted once, as the larger of planned and permitted, never both added
together. A plan with units still left to permit shows as "Under construction", not
"Completed", even if every permit issued so far is finished.

In the app, the project panel shows a build-out bar, and the project list shows "planned / left"
on each row. The **Unit growth** filter has an option for **Units left to build**. The demand
panel can be based on all units, units left to build (not yet completed), or completed
units. The CSV export includes every build-out figure.

Run the tests with `npm test`.

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

## Trust signals: one note, every export, the criteria stamp, provenance

From design audit, Group 10:

- **One screening note, in the required wording:** "**General screening results only.**
  Peel's W&WW Infrastructure Planning team must validate or confirm all results."
  (`PeelUtil.SCREEN_LINE`, `SCREEN_NOTE`, `SCREEN_NOTE_SHORT`).
  - It is pinned once at the top of the analysis panel, so every tab, sub-view and tool
    result sits under it. The panes' own copies are hidden.
  - It also appears in the development panel, presentation mode, and the footer of every
    report: the briefing, memo, area report and comparison.
- **The criteria stamp.** Every result names the criteria it uses: "Peel design criteria:
  Modelling Demand Table v2.0 (Aug 2024) and Linear Wastewater Standards R1.0 (Mar 2023)"
  (`PeelUtil.CRITERIA_STAMP`). It appears in the note, the reports, the exports and the
  workbook summary.
- **Every export carries the disclaimer, the note and the stamp:**

  | Export | How |
  |---|---|
  | CSVs (developments, allocations, corridor, batch, DC timing, funding) | three `#` lines at the top |
  | GeoJSON (developments, servicing areas, planned works) | `disclaimer`, `screening` and `criteria` properties on the collection |
  | Shapefiles (.zip, all map layers) | `README.txt` in the zip |
  | SWMM and EPANET `.inp` model files | comment lines |
  | Excel workbook | Summary sheet |

- **Provenance on every exported row.** The developments CSV, GeoJSON and workbook gain
  `source_portal`, `source_record_url` and `source_pulled_on`, taken from the development's
  latest file. A missing value reads "not recorded", never blank. The Files tree view is owned
  by the tree work and is unchanged.

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
  (the form, its servicing check and the list of test sites) now open in the **Tool result**
  tab, with a trail crumb such as "Peel › Sewer path" or "Peel › Test site 1". They used to
  open in the right-hand detail panel.
  - The detail panel is used only when the tool framework is absent.
  - Every other tool already used the Tool result tab.
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
  - A test site that is placed and then closed unchanged is removed with its result.
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
    Capital, Water and Wastewater also open their tab.
  - **Present ▾** holds Present and Time-lapse; the separate Time-lapse button is gone.
  - **Export ▾** gains *Save this view…*; the Save button in the Layers card is gone. Saved
    views still open from the Layers card and the chips above the filters.
  - The **Executive briefing** is an Export item. The Overview keeps it as a link, not a big
    accent button.
  - **Search** moves into the top bar at 1600 px and wider, the projector and wide desks. It
    stays at the top of Explore on narrower screens. It is one search box, moved, not copied.
    On a page the search sits in the page header at every width; the top-bar slot is the map's.
  - On a phone, every top-bar control and menu item is at least 44 px.

## Scope-aware tabs and duplicates removed

From design audit, Group 6:

- **Peel-wide, said out loud.** Water, Wastewater and DC show Peel-wide tables. Below Peel
  scope, a note at the top says so. "Below Peel" means a municipality, a planning area, a zone
  or block filter, or a servicing scope.
  - It reads: "Peel-wide. Plants, blocks and pumping stations serve all of Peel, so these
    tables are not filtered to Brampton."
  - It then links the plants or zones the scoped developments load, with counts. For example,
    "G.E. Booth (750) · Clarkson (122)" opens each one as a servicing scope.
  - At development scope these tabs show the site's own figures instead, so no note is needed.
- **Area-only content at development scope.** Growth's *Census & 2051* and *Timing* views
  describe an area, not one development. At development scope they now say so and point to
  the trail, instead of showing Peel-wide figures.
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
- tapping it on the map ("What loads this?" now opens the scope);
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
  - the planned DC works in it.

From the Peel Overview, "the most loaded station and the developments driving it" now takes two
taps: the plant, then the top station.

## Pipe class and "not assessed"

Pipe-by-pipe sewer results are off (`PIPE_RESULTS = false`). Before the design audit's Group 4,
they were hidden in the interface but still drove the outputs: sewer pipes at 90%+ of full
capacity formed "sewer groups" that fed DC timing, the funding screen, the workbook and the
briefing. They no longer do (design audit, Group 4):

- **Not assessed, not "no constraint".** With pipe results off, `allNeeds()` builds no sewer
  groups. The development's DC needs say "Sewer pipes: not assessed (pipe-by-pipe capacity is
  left to the Region's hydraulic model)" instead of "No sewer on its path reaches 90%". The
  Overview's wastewater line says "sewer pipes not assessed". The DC method note says no sewer
  main is tested.
- **What it changes (Peel, default scenario).** DC Timing goes from 54 projects (5 screening
  late) to 33 (0 screening late). The difference is the sewer-group mains and their timing
  flags. Plants, pumping stations, water treatment, storage and connecting developments are
  unchanged.
- **Class by size, not distance.** Local vs trunk was "the first 3 km of the path" vs the rest.
  It is now the pipe's diameter. **Trunk is 750 mm and over**, the smallest "primary wastewater
  main (trunk)" on the Region's 2026 DC capital maps (`PeelUtil.TRUNK_MM`, `pipeClass`). The FSR
  check reads "Local sewers (under 750 mm)" and "Trunk sewers (750 mm and over)".
- **Stale model fixed.** If the DC tab was opened while data was still loading, a render could
  run before the servicing lookup was filled. It then threw, and the model stayed one built
  without the 2025 annual reports, so DC timing had no plant constraints. `lakeZones()` now
  skips zones not yet loaded. The model is rebuilt once the reports arrive. Every cache keys on
  the model's generation (`svcGen` in `scenarioKey()`).

## Capital schedule currency: status, "as of" and one dollar year

Every planned date comes from the 2026 DC capital maps (draft v2, **as of March 2026**). In May
2026 Regional Council paused all new growth-related water and wastewater capital procurements
from **June 11, 2026**, until upper levels of government commit funding
([Council report, May 28, 2026](https://pub-peelregion.escribemeetings.com/filestream.ashx?DocumentId=45699)).
Each planned work now shows a status (`PeelUtil.capitalStatus`):

| Status | Rule |
|---|---|
| **Paused** | Proposed for 2027 or later: not yet tendered, so its procurement is on hold |
| **Status unknown** | In the 2026 budget (approved 2026, or a plant step Council already funded): paused only if not tendered or awarded by June 11, 2026 |
| **Scheduled** | Known to be going ahead: set per project number in `CAPITAL.overrides` (none yet) |

Shown on the DC Timing and funding tables (with "Online — draft, as of March 2026"), every DC
relief text (Water, Wastewater, the briefing, the memo), the planned-works map tooltip and the
development brief; a pause note heads each DC sub-view, the briefing's DC section and the memo's
DC needs. The CSVs carry an "Online (draft, as of March 2026)" and a "Capital status" column.
The analysis itself still replays the draft schedule: the status says how far to trust each date.

**One dollar year (2026$).** The DC Timing cost column was 2020$ and the funding views 2026$; all
are now 2026$: the 2020 study's costs indexed by the Region's DC rate indexing (×1.40 wastewater,
×1.35 water, August 2026 over 2020), and G.E. Booth's $130 M (2024$) indexed from 2024 at the same
average annual rate (≈×1.12).

## Screening wording and the public version

Results say what the screen shows, never what the Region should do (design audit, Group 2). One
set of labels (`PeelUtil.SCREEN`) is used on the DC tab, the briefing, the memo, the workbook and
the CSVs:

| Was | Now |
|---|---|
| Keep · advance / "bring it forward" | **Screens late** (in service after the capacity runs out) |
| Keep | **Screens in time** |
| Keep · could defer | **Screens well ahead of need** |
| Review | **No modelled need** |
| Keep / Defer (funding) | **Within / Outside the funding screen** |
| Over-committed | **Screens over rated capacity** |
| Recommendation / Decision column | **Screening result** |
| Servicing verdict / Verdict | **Screening summary** |

"Held back" figures read "people the screen shows constrained". A range whose two ends round to
the same number shows one number (no "65,100–65,100"). The funding screen's within / outside
colours are neutral (accent / grey): they are not capacity states.

**Public version** (Settings › Number conventions › *Public version*, or add `?public` to the
link): hides the DC *Funding screen* and *Funding levels* sub-views (DC opens on Timing), the
screening-result column in the DC timing table and its CSV, and turns the red / amber / green of
the screening summary to plain text. Everything else is unchanged.

## Applying the tree: Step B0 review workbook

This is the review before the containment tree (`js/tree.js`, PR #180) feeds the app's counts.
It is **report only: the app is unchanged.** The plan is in `docs/apply-tree-plan.md`.

```
node scripts/tree-review.js          # → docs/tree-review/tree-review.json (git-ignored)
python3 scripts/tree-review-xlsx.py  # → docs/tree-review/tree-review.xlsx
```

**What a row is.** One row per **change group**: the app development(s) and the tree(s) that
share files with them. Each row has:
- app units (the header's definition) vs tree units, and the change;
- the counting rule;
- the weakest link's confidence;
- the primary plan and its share;
- the receiving plant and block;
- flags;
- three yellow **your call** columns: Accept / Override / Ask, override units, and reason or
  source.

**Sheets.**
- Read me, Summary, Changes (largest first), Pre-consultation estimates, All groups.
- The audit lists: double counts, unit mismatches, nested files not linked, unclear same-land
  pairs, condo-only trees, orphans, low-confidence links, straddling plans, reversed dates,
  counts to find.

**Flags.**
- **estimate (pre-consultation):** every file stating a count is a pre-consultation, by role or
  by its PRE file number. Large ones are promoted to block-plan roots but are still flagged.
  Decided: these count, as proposed only, never committed.
- **count from data/unit-lookups.json**
- **low-confidence link**
- **children exceed parent**
- **straddles plans:** the primary plan holds less than 90%.

**Decisions** go into `data/tree-overrides.json`. Each override is keyed `Municipality|ROOT-FILE`,
with `units`, `reason`, `source` and `decidedOn`. Overrides apply to the workbook's "after
overrides" totals now, and to the app at Step B1.

**Tree rules fixed after the first review (2026-10-15):**
- **Building permits count when no file states a count.** 121 groups had dropped to 0; this
  brings it to 94. The other 81 are replacement houses, which correctly count 0. Example:
  11261 Chinguacousy keeps 456 units, all permitted. Permits are still never counted for a
  replacement or model house.
- **A minor file's own stated count counts,** not only the number found in its wording.
- **The remaining drops to 0 are mostly correct.** The app was still counting withdrawn files.
  Example: 2 Bartley Bull's 330 units come from OZS-2021-0010, which is cancelled.

**Your bulk accepts (2026-10-15).** These are recorded in `data/tree-overrides.json` as
`accepted`:
- counts found where the app had 0;
- splits, unless the count drops by 100 or more;
- drops to 0 (replacement houses, no new homes, withdrawn files);
- pre-consultation estimates under 1,000 units;
- new trees and gone developments;
- small or well-linked changes.

**Left for you: 24 groups** on the workbook's **To review** sheet:
- 10 large pre-consultation estimates (1,000+ units);
- merges and regroupings that move 100+ units;
- splits and count changes that lower a count by 100+.

Every row carries a pre-filled call and the reason for it.

**Results** (snapshot 2026-10-12): Peel app 247,760 → tree 266,947 units (+19,187, +7.7%).
- 3,284 groups: 227 go up, 131 go down, 2,926 are unchanged.
- 88 groups are pre-consultation estimates, totalling 36,543 units.

## Definitions (one table, used everywhere)

The Overview, Growth, the header, Water, Wastewater, DC, every export and the executive briefing use
these definitions. In the app they're in the **Definitions** card (Overview ⓘ line).

| Term | Definition |
|---|---|
| Existing | Census population (and jobs) on census day |
| Built since census | Completed after census day, by the building permit completion date (estimated for Brampton and Caledon) |
| **Committed** (the Peel rule) | Units left to build that a water or wastewater site servicing permit (the whole development) or a building permit (the units it covers) commits, filed or issued. The treatment plants alone use MECP D-5-1: registered or draft-approved plans of subdivision, plus site plan approved where there is no subdivision, through permit and construction. Approved zoning alone is not committed. A development still in review is committed when its most recent subdivision file is draft-approved or registered; a newer subdivision file in review means the land is being re-proposed. The servicing layer is called *Committed*; the phase *Approved* still means site plan approved. |
| Proposed | Pre-consultation, inception and review, not committed |
| Allocated | Only the allocations you record. Peel publishes no allocation list. |
| Planned units | Each development's units counted once (the larger of planned and permitted), net of homes demolished |
| Permitted / left to build | Units with a building permit / planned units not yet completed |
| Uncommitted reserve (D-5-1) | Rated capacity − (existing + built + committed), to **100%** of rated |
| Room to the trigger | **90%** of rated (2020 Master Plan expansion trigger) − (existing + built + committed) |

**Pairings:**
- Wastewater plants: rated (annual average) capacity against average flow. The flow is the **annual average** in Capacity check (the plant's 2025 measured rate) and **ADWF** in Design flows. The label follows the mode.
- Pumping stations: firm capacity against **peak wet weather flow**. Peak dry is shown for reference only.
- Water treatment: rated capacity against **maximum day** (design ×1.8, or the 2025 observed factor; the label follows the switch).
- Pumping into zones: firm capacity, or the Master Plan's modelled actual firm where given. Facilities show both.
- Capacity bars mark the 90% trigger (dashed) and 100% rated (solid).

**Basis chips:**
- *Design*, *2025 measured*, *Master Plan 2020*, or *Mixed basis* (dashed) on each capacity figure.
- Hover a chip for its parts.

**Other changes:**
- The diversion switch, counting basis and outside-area rule are part of the scenario cache, so a result never outlives its scenario.
- The diversion counts from its start year (Horizon's diversion year, default 2028): not in today's existing flow before then.

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

## Site constraints: gas, hydro, watercourses, regulation limits

Four switches in *Layers* draw site constraints, loaded live for the map area. Gas and hydro
show from zoom 11, watercourses and regulation limits from zoom 12. Hover a line or area for
its name and source. Each layer has a short note in the legend.

| Layer | Source | Notes |
|---|---|---|
| Gas pipelines (dashed yellow) | Land Information Ontario *Utility Line* (gas / oil types) | Major pipelines only. Local gas mains are not published; call Ontario One Call before digging. |
| Hydro lines (red) | Land Information Ontario *Utility Line* (hydro / electric types) | Transmission and major distribution lines; corridors carry easements. |
| Watercourses (blue) | Ontario Hydro Network watercourses (LIO, 1:10,000) | Small or piped watercourses may be missing. |
| Regulation limits (dashed green area) | TRCA regulation limit (2025, live); Credit Valley Conservation generic regulation limit (2025, built into the site) | Screening only: the authority confirms the limit, and a feature need not be mapped to be regulated. |

- **Utility lines:** the province's Utility Line layer records 67 hydro lines, 29 "unknown
  transmission lines" and 31 "unknown pipelines" in Peel. Transmission lines are shown as hydro.
  Unknown pipelines are shown as gas pipelines, labelled "gas or oil; product not recorded".
- **Watercourses:** the Ontario Hydro Network's "virtual" lines through lakes and ponds are not
  drawn.
- **CVC regulation limit:** CVC publishes its limit as one polygon of about 12 MB, which the
  service returns whole for any query. `scripts/build-regulation.js` cuts it into the map's
  0.02° tiles over Peel (`data/regulation/cvc/`, simplified to about 6 m). Each tile holds the
  fill and the limit's own edges, so tile borders don't draw. Rebuild it with the *Probe data
  sources* workflow, `mode=regulation-build`. Tests: `tests/regulation.test.js`.
- **Not covered:** Nottawasaga Valley (north Caledon) and Conservation Halton (a small part of
  west Mississauga) don't publish an open regulation limit layer.

If a provincial service does not answer, gas, hydro and watercourses come from OpenStreetMap
instead, and the Layers panel says so. The data sources were checked with the *Probe data
sources*
workflow, `mode=constraints` (`scripts/probe-constraints.js`; `only=quick` for sizes and
types).

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

## Settings menu opens

The gear menu's *Settings* and *Sources & checks* pages (the second retired in navigation phase 2)
closed the moment they opened. The page replaces the menu item that was clicked, so the
outside-click check no longer found the menu and closed it. That check now reads the click's path as dispatched. The top bar also sits above
the map controls and the phone sheet, so its menus open on top, and long pages scroll inside
the menu.

## Opening a development doesn't trace or zoom out

Selecting a development moves the map to its site at your current zoom or closer, never further
out. It no longer traces the sewer path automatically, because the trace zoomed the map out to
the whole route to the plant. *Trace sewer* in the development's header draws the route when you want it.

## Employment: jobs from published floor areas and permits

Jobs come from floor area at typical floor space per worker (industrial 110 m², office 25,
retail 45, hotel 60, institutional 50 m² per job). Before, only floor areas written in the
description counted, plus the floor-area field on a single-use, non-residential file. So 442 of
the 724 active developments with an employment use counted no jobs. The floor area now comes,
in order, from:

1. **Figures in the description**, e.g. "2,506 sq m of retail".
2. **The non-residential floor area published with the application** (Mississauga
   `TOTAL_NON_RES_GFA`, Caledon `Non_Res_GFA`), on mixed-use buildings and multi-use files too.
   - It goes to the use the file names first. "Commercial/industrial" counts as industrial.
   - Otherwise it goes to the development's main use. With no use named, it is retail on a
     residential development (its shops) and industrial on employment lands.
   - One figure repeated on a subdivision and its site plan counts once. Marked † in the
     development's *Employment uses*.
3. **New non-residential buildings on the site's building permits.** Brampton files them under
   the Building Code's occupancies: F industrial, E retail, D office, A / B institutional, and
   hotels.
   - Interior work, alterations and demolitions don't count.
   - A building's stage permits (same floor area) count once.
   - Marked ‡.

Active developments with jobs went from 282 to 438. Jobs on the default map went from 60,300
to 81,600. About 370 developments still name an employment use without any floor area. They
aren't estimated: a site-area estimate would add about 86,000 jobs, much of it on alterations to
existing buildings, which add no new space.

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

## Net units, the screening note, and pipe results off

**Net units.** Every development's units are net of the existing dwellings it demolishes:
- A replacement-house site plan already adds 0 units.
- Second suites (ARUs) still count.
- A tear-down rebuild now adds 0 instead of 1.

The development panel shows the gross count, the dwellings removed and the net. Across the 23,824
sites this removes 1,371 units (974 of them completed), mostly from about 810 infill rebuilds. It
also stops Mississauga's `HOUSDEMO` demolition permits being counted as new homes. Committed
capacity is unchanged, because those houses were never counted as growth.

**Screening note.** A note opens every trace and every servicing demand result:
- the development's Overview, Water and Wastewater tabs, and its demand by stage
- the sewer and water traces
- the bottom Water, Wastewater and Plants tabs
- area selections
- the batch, compare, fit and inquiry tools
- the sewer panel

The note says these figures come from one screening method, not a hydraulic model, and that the
Region of Peel's water and wastewater models are the authority.

**Pipe results off.** Individual-pipe modelling results are hidden for now, behind one switch,
`PIPE_RESULTS` in `js/util.js`:
- the *Sewer pipe capacity* map shading: a saved choice falls back to Off, and the Wastewater view
  uses catchment growth instead
- pipe % labels and tooltips
- the % full, freeboard and calculation on a tapped sewer, which now just lists the developments
  draining through it
- the tightest pipe on traces and in the development panel
- the tightest pipes list
- the sewer profile
- the pipe upgrade tool
- pipe constraints in *DC needs*, batch, compare, fit and inquiry
- the EPANET hydraulic check's main-by-main table

Pumping stations, plants, pressure zones and water facilities stay. A traced sewer path is drawn
in one colour (no capacity colours), and the briefing map's sewers are plain.

**The tour** shows each step's real target again:
- The Development tab and the Wastewater tab steps open the development only once, then pick the
  tab. Opening it again had reset the tabs, so those steps pointed at nothing.
- On a phone, steps whose panel is hidden or off screen (More settings, Filter by area, This week)
  point at the button that opens it.
- The card sits beside the tool rail instead of over it.
- The step text matches the hidden pipe results.

## Region of Peel open data: housing activity, building permits, watercourses

Three of the Region's open datasets, each compared with what the app already held; where both
cover the same thing, one copy is kept.

- **Housing Construction Activity.**
  - Starts, completions and units absorbed by dwelling type, per municipality and year. This is
    the CMHC Starts and Completions Survey as the Region publishes it.
  - **Starts** match the app's CMHC copy in all 30 overlapping municipality-years.
  - **Completions** differ in all 21. The app's earlier copy has Mississauga completing 11,743
    homes in 2022 on 4,455 starts, which isn't plausible. Peel's completions track its absorptions.
  - The Region's series is kept, year by year. It also continues completions past 2022, where
    CMHC archives them by municipality.
  - The comparison is recorded in `data/peel-housing.json` (`compare`).
- **Building Permits.** Units by type and permit values, per municipality and year. These are
  statistics, not individual permits, so they sit beside the municipal permit feeds rather than
  in them.
- **Watercourses.**
  - The Region's 892 named streams, each with its watershed and conservation authority, are now
    the first source of the *Watercourses* layer.
  - The Ontario Hydro Network fills in where Peel maps nothing.
  - A provincial line running along a Peel stream is dropped: most of its points within 25 m.
    Each stream is drawn once, and its tooltip and the measure tool give the authority (CVC,
    TRCA, Conservation Halton).
  - Peel's copy of the provincial network (`Watercourse_GTA`) duplicates the Ontario Hydro
    Network and isn't used.

**Growth → Census & 2051 → Housing activity** shows the latest full year for each municipality and
Peel: starts and completions (with 5-year averages), units absorbed, and permit units and value.
A check line sets the units on this app's own permit records issued that year against the
Region's count.

`data/peel-housing.json` is built by `scripts/build-peel-housing.js` (*Probe data sources*
workflow, mode `peel-open`). A year is the Region's annual row, or its four quarters added up; a
year with fewer quarters is partial and isn't used as a full year. `scripts/probe-peel-open.js`
lists the Region's other layers.

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

## Updates reach the browser (offline service worker)

The offline service worker (`sw.js`) used to serve the page itself cache-first under a fixed
version, so a browser that had visited kept the first cached build: later fixes didn't show.
Now:
- the page is fetched from the network first, with the cached copy used only offline;
- the deploy stamps the worker with the build, so each deploy installs a new worker, which takes
  over at once and clears the previous caches;
- when a new worker takes over, the page reloads once onto the new build.

A browser still holding the old worker needs one or two reloads after this change. After that,
each deploy shows on the next visit.

## Wide screens

At 1800 px and wider, the Compare tool gets its own column to the right of the analysis
panel, but only while Compare is open. Otherwise the map takes the full width, so there is no
empty strip on the right. In the 440 px analysis column, *Needs attention* and *Top
developments* use the full width, and the *Executive briefing* button sits under the headline.

## Deploy checks

Every deploy (push to `main` and the weekly data refresh) runs two checks first. A failure stops
the deploy, so the live site keeps its last good build.

- `npm test`: the unit tests.
- `npm run lint`: every script `index.html` loads, checked with ESLint's `no-undef` rule
  (`eslint.config.mjs`). The app is plain scripts sharing `window.Peel*` modules. A name that
  isn't defined in its own module only fails when that line runs, so the unit tests can pass
  while the app fails to load. That is what happened when the phases 2–7 module split (#160)
  first went live. It left 63 such names, ran the app's start-up before `window.PeelApp`
  existed, and renamed the basemap control's id.

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

**Chronology rules (proposed, modelled; the app is unchanged).** `js/tree.js` has five date rules.
They are off unless `chrono` names them (`audit(data, { chrono: { r1, r2, r3, r4 } })`).
`scripts/tree-review.js` models them step by step, each adding to the ones before, and the
workbook's **Chronology** sheets show what each changes. On the 2026-10-12 snapshot (Peel tree
total today 266,947):

| Rule | What it does | Peel units | Groups changed |
|---|---|---|---|
| 1 | An undated file (1,544, mostly Brampton site plans) takes 1 July of the year in its file number. The number's year matches the real date within a year for 99% of dated files. | −8 | 110 (mostly regrouping files with no count) |
| 2 | An approved site plan, condo or draft plan filed 3+ years before a newer pre-consultation, rezoning or block plan on its land is history: its own tree, not the new proposal's child. | +94 | 99 (606 links not made; 466 are pre-consultations) |
| 3 | Same land, counted once: the latest file replaces the largest only when it is the same stage refiled, covers 90%+ of the earlier land, or (with no boundary) its wording reads as a resubmission; else the largest stands (a phase). | −3,057 | 23 (2 unclear, left at the largest for your call) |
| 4 | A permit issued 2+ years before the file it would sit under is the old building: not placed. | −10 | 8 (324 permits) |
| 5 | Each tree's files in filing order, with backwards steps marked (the **Filing order** sheet). | report only | 230 of 976 trees with backwards steps |

With all four, Peel goes from 266,947 to 263,966 (−2,981).

**Resubmission or phase, with no boundary (rule 3).** The later file is scored against the
largest from its own words:
- **Buildings:** the same number means a resubmission; fewer means a phase.
- **Home types:** only some of the earlier file's types means a phase.
- **Civic addresses:** the same means a resubmission; part means a phase; different means
  another building on the site.
- **Wording:** "revised" or "resubmission" against "phase", "tower" or "block".
- **Counts within 25%:** a resubmission.

Two points or more either way decides; otherwise the pair is unclear and the largest stands.
The latest file must state its own count (a draft plan counted only through one child is
not a replacement).

**Step B0 decided (2026-10-15): approve all.** Recorded in `data/tree-overrides.json`:
- Chronology rules 1–4 are on: `audit()` uses them by default; pass `chrono: {}` for the tree
  as it was before them.
- The two unclear same-land pairs keep the largest count (OZ/OPA 24-2, OZ/OPA 10-5).
- SP 22-75 is overridden to 322 units, from its own description (the record says 457).
- The 24 To review groups are accepted. So are the 6 roots whose change comes from the rules:
  - the rule 3 resubmissions (88 Park E, 51 Tannery, 2225 Erin Mills, OZS-2026-0016);
  - 2 Bartley Bull, already accepted as a withdrawn file.

Final tree totals on the 2026-10-12 snapshot:

| | App units | Tree units | After overrides |
|---|---|---|---|
| Mississauga | 90,811 | 90,574 | 90,439 |
| Brampton | 127,570 | 141,870 | 141,870 |
| Caledon | 29,379 | 31,522 | 31,522 |
| **Peel** | **247,760** | **263,966** | **263,831** |

Nothing is left to review. The Decisions sheet lists every call and what you decided.

New sheets: Decisions, Chronology (a call per rule), Chrono changes, Latest vs largest (a call per group),
History links, Permits early, Dated from number, Filing order.

## Step B1: tree counts in the app (Previous / Tree switch)

Since GO 2 (2026-10-15), each development's units are the **tree count**: the sum of the trees
whose root file it holds (`js/tree.js` with the chronology rules, plus `data/unit-lookups.json`
and your decisions in `data/tree-overrides.json`). Development keys are unchanged; Step B2
(GO 3) makes the trees the developments.

**How it runs.**
- `scripts/build-tree-counts.js` writes `data/tree-counts.json` with the weekly snapshot
  (`site.yml`). Each development key has its units, its trees (root, units, basis, flag) and a
  signature of its planning files.
- `js/tree-counts.js` (`PeelTreeCounts`) applies the counts after the developments are built.
  The browser never builds the trees, which takes seconds.
- A development the tree does not count keeps the count from its files and permits, with the
  reason shown, when:
  - it has no tree (12 developments whose only planning files are withdrawn: 2 units; and every
    development of permits only, counted from its permits);
  - its files differ from the tree build (a live refresh, or a source turned off);
  - you entered a count for one of its files;
  - the tree counts did not load (the top bar says so, with Reload).
- A development whose files are counted in another development's tree shows 0 and names that
  tree (30 developments).

**Where it shows.**
- **The Previous switch is retired** (2026-10-27, navigation phase 5; owner decision 14, approved
  2026-10-15 for one release): one total. The rule before the tree is the fallback above, and the
  note says *Counted from its permits* (or *Counted from its files and permits*: why). Settings ›
  Counting only points to the Scenario control.
- The scenario bar and the top-bar chip say "counting: All units (tree count)". Exports and share
  links carry the same scenario text.
- The development panel's At a glance has a **Tree count** note: the trees, their counts and
  flags.

**What moved** (snapshot 2026-10-12, live developments):

| | Previous | Tree | Change |
|---|---|---|---|
| Mississauga | 90,811 | 90,439 | −372 |
| Brampton | 111,536 | 141,872 | +30,336 |
| Caledon | 29,379 | 31,522 | +2,143 |
| **Peel** | **231,726** | **263,833** | **+32,107 (+13.9%)** |

382 developments change. The full list, with the reasons, is in the review workbook
(`docs/tree-review/tree-review.xlsx`, Changes sheet).

On the default view (active applications, 2021–2026), the Overview goes from 202,264 to
233,028 units and from 597,100 to 688,600 people.

**Fixed along the way: the Node tools' baseline.**
- `countUnitsFromText` (`scripts/build-snapshot-index.js`) read unit counts from the
  descriptions of the Brampton pre-consultation layer. That layer is marked `countUnits: false`,
  and the browser skips it.
- So the startup index and the Node tools counted 16,034 units that the full app never shows.
  Most are pre-consultation estimates: 111 Mayfield's 9,961, and 2,341 at 10884 Winston
  Churchill.
- The B0 workbook's "app units" column is now the true previous count (231,726, not 247,760).
  The tree counts are unchanged.
- The tree reads a pre-consultation's own figure directly. It counts it only when no other file
  states one, flagged as an estimate (decision B-a).

## Step B2: the trees are the developments

Since GO 3 (2026-10-15), each tree of files on one land is a development. An app development that
held unrelated trees splits, and developments that shared a tree merge. (The Previous switch that
put back today's developments for one release is retired; without the tree data, the developments
stay grouped by address and counted from their files and permits.)

**How it runs.**
- `data/tree-counts.json` (version 2, built by `scripts/build-tree-counts.js`) lists every tree
  as a development. Each one has:
  - its key;
  - its count and how it was made;
  - its files in tree order, each with the link that put it there (rule, overlap, confidence).

  The file also maps each planning file to its development, and lists the 1,861 permits the tree
  places somewhere other than the rest of their site.
- `js/phases.js` `buildProjects(records, { regroup })` has one new hook. The site, nesting and
  permit-joining steps run as before; then `js/tree-groups.js` moves the records into their
  trees' developments. Without the hook nothing changes.
- **Keys:** a tree keeps the key of the development that held its root file. A second tree of
  the same development is `<key>~<root file>`. On the 2026-10-12 snapshot:
  - 23,445 keys are kept;
  - 824 are new (split-off trees);
  - 379 are absorbed into another tree.
- **Saved keys are rewritten on load, and nothing is dropped:**
  - the watchlist follows its developments (a split watches every part);
  - an allocation moves to the part with the most units, noting where it came from;
  - share links, saved views and "Back to" resolve old keys, including branch keys
    (`<key>#<file>`);
  - the weekly changes and the phase history are copied to the new keys.
- **Files view** (Records at a development): the tree's files in order, drawn by the Records panel's
  own tree (`js/file-tree.js`, navigation phase 5: one renderer). Each sits under the file whose land
  holds it; the homes are counted once, on the file that says *counted here*; a link made by overlap
  only is marked *check*. *On its own* opens a file's whole branch as a sub-development (decided: one
  development, branches as subs). A development with no tree entry (the tree counts did not load, or
  permits only) keeps the list, with each file's rule, confidence and overlap.

**What moved** (live developments, snapshot 2026-10-12):

| | Previous | Tree |
|---|---|---|
| Developments | 3,342 | 3,919 |
| Peel units | 231,726 | 263,831 |

Peel matches the B0 review after your overrides exactly.

On the default view (active applications, 2021–2026), the Overview shows 228,490 units and
683,700 people with the trees, against 202,264 units and 597,100 people before.

**Tests** (`tests/tree-counts.test.js`):
- every old key resolves;
- the watchlist and allocations survive;
- no record sits in two developments, and none is lost;
- every planning file is in exactly one development, its tree's;
- keys are unique;
- Peel equals the review total.

## Population tables, C1: the plan roll-up engine

`js/plan-rollup.js` (`PeelPlanRollup`, pure, no UI yet) builds Table 1 and Table 5.

**Levels:** Peel → municipality → secondary plan / character area → sub-levels → developments.
- A nested plan is a sub-level: Bolton Core in Bolton, Malton CN in Malton NHD, and four more.
- A Brampton precinct sits in the plan holding most of it (29 of 30).
- "Not in a plan" and "Elsewhere in <plan>" make every parent equal the sum of its children.
  The `check` column is parent − Σ children, always 0.

**Placement** follows the tree. A tree development is placed by its share of its root file's
land in each plan (the tree build stores these in `data/tree-counts.json`: `devs[].a`, plus
`areas` with their nesting). So a development straddling two plans is split by area, not
assigned whole. With no boundary, or with Previous grouping, it is placed whole by its point.

**Measures** are the Overview's:
- units from `Growth.pipelineTotals`: planned, permitted, completed, left to build;
- committed by D-5-1, and proposed;
- people and jobs from `PeelDemand.estimate` at the chosen basis.

Each development is measured once and its shares multiply it, so Peel equals the Overview.
`matrix()` gives Table 5: plans down the side, plants or pressure zones across.

**Tests** (`tests/plan-rollup.test.js`), including the full snapshot regrouped into trees:
- every check is 0;
- Peel people equal `estimate(set)`, and Peel units equal the header;
- nested plans are counted once;
- straddling developments are split by area;
- shares over 100% are scaled down;
- matrix rows and columns reconcile.

## Population tables, C2: Table 1, the roll-up (Growth › By plan)

Growth has a new **By plan** sub-view (`js/plan-tables.js`). It shows the developments on screen
(the Overview's set and basis) by where they are: Peel → municipality → plan → sub-area or
precinct → developments.

**Columns:**
- Compact by default: Area, Units, People, Check. This fits the panel.
- **All columns** adds developments, committed, proposed, left to build, persons per unit, jobs,
  and people in an MTSA. The MTSA column is an overlay and is never added up.

**Check** is ✓ when a row equals the sum of the rows under it.

**Rows:**
- Rows expand and collapse; Peel and the municipalities start open.
- A plan shows 10 developments, with "See all".
- A development straddling plans appears under each plan with its share, e.g. "(45% of it)".
- **filter** narrows the map and every tab to that plan.

**Below the table:**
- the developments split between plans;
- the nested plans;
- the precincts with no development in the current set.

**Exports:**
- **Download CSV** gives one row per area and per development. It has a `path` column
  (`Peel/Caledon/Bolton/Bolton Core`) and a `share` column, plus the disclaimer, the screening
  line, the criteria stamp, and the basis and grouping.
- The workbook gains a **By plan** sheet with the same rows, after Developments.
- The Developments export gains `plan` (the innermost plan with the largest share) and
  `plan_shares`.

**On the default view (2021–2026 active):**
- Peel is 228,490 units and 683,671 people, the same as the Overview and the header.
- Every check passes.
- 42 developments are split between plans.

## Population tables, C3: Table 5, plans by plant or pressure zone

Under Table 1 in Growth › By plan, the plans run down the side: each municipality's plans and
"Not in a plan", the same rows as Table 1. Across the top are either:
- **Plants:** the plant receiving the wastewater (G.E. Booth, Clarkson, Inglewood, No plant);
- **Pressure zones:** the first zone, if a development has two.

**Cells and links:**
- Cells show people at build-out; hover for units.
- A cell filters the map and every tab to that plan and plant (or zone).
- A row header filters to the plan, a column header to the plant or zone.

**Totals:**
- Each row's total equals Table 1.
- The columns add up to Peel; the ✓ in the corner confirms both.
- Default view: G.E. Booth 476,611, Clarkson 206,147, Inglewood 55, No plant 859, which add up
  to 683,671.

The plant capacity tables use census-relative layers; see Wastewater › Plants.

**Workbook:** a new **Plan × servicing** sheet holds both matrices.

## Population tables, C4: plans against their targets (Table 2)

Growth › By plan has a third table, **Plans against their targets**.
- **Municipalities** are compared with the Region's 2051 allocation of growth (2051 minus 2021,
  from `data/peel-reports.json`).
- **Plans** are compared with their published targets in `data/plan-targets.json`.
- **Units are the main comparison.** The table shows committed units (D-5-1), all proposed
  units, the percentage of target, and the gap.
- **People-only targets:** where a target states only people, pipeline people are shown beside
  it. This is marked † and is indicative only, because targets use household persons per unit
  while the pipeline uses Peel design criteria.
- **Density-only targets** are shown but not compared.
- **Combined targets:** a target covering several plans is compared with all of them, e.g.
  48 (a)+(b) Countryside Villages, or 40 (a)–(d) Bram West.
- **No target:** a plan with no published target is left out, never shown as 0. The footnote
  counts them.
- **"total"** marks a target that counts every home at build-out, existing ones included.

**`data/plan-targets.json`** holds 15 targets, researched 2026-10-15:
- 3 state units: Mayfield West, Brookvalley, Alloa;
- 6 state people and jobs: Heritage Heights, Mount Pleasant, Countryside Villages, Bram West,
  Highway 427 Industrial, Mayfield West Phase 2 Stage 1;
- 6 are densities only: Downtown Brampton, Vales of Humber, Humber Station, Mississauga DT Core,
  Lakeview Waterfront, Ninth Line.

Each has its source, page, date, wording and a note. `leftOut` lists what was not used and why:
- applicant proposals;
- the Bolton expansion-area figure;
- Wildfield and Innis Lake, which have no plan boundary yet;
- Mississauga's class-wide node densities.

**Not yet checked against the documents.** Every figure was found in search results. The
municipal sites (brampton.ca, caledon.ca, mississauga.ca and their eScribe meeting portals)
could not be opened from the session that gathered them. Each one is marked **unchecked** in the
table (`checked: false`) until someone confirms its wording against the source.

The CSV and the By plan sheet gain target columns: units, population, jobs, density, year,
scope, % of target and source.

**Tests** check that every target:
- has a source, a link and its wording;
- names a real plan;
- is never 0;
- is one per plan.

They also check the comparison: committed vs proposed, municipal growth, combined targets, and
people-only targets.

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

## Every data file has a receipt

Every figure in the app can be checked against where it came from:

- **Each data file's source.** `data/sources.json` lists every file and folder in `data/`. Each entry has:
  - what the file is, and who published it;
  - links to the service, report or page it was read from, with the tables and pages for figures
    transcribed from a report;
  - the files it is built from, for data the app builds itself;
  - the field in the file that says when it was pulled or published, and the script that builds it.

  Items that have their own source say so. Each plan target, each count found online and each EA
  carries its own link.
- **Readable record links.** Record ↗ on a planning file or permit opens the ArcGIS page for that
  feature, with every published field (`?f=html`). The exports keep the machine-readable link
  (`?f=pjson`). Mississauga's services are published as a service root, so the layer is taken from the
  record's source (`mis-devapps/6` → `…/FeatureServer/6/22`). Before, these links queried the root,
  which ArcGIS rejects.
- **Where to see it.** The table is under Reference › Data sources › *Every data file*, and also on
  the Settings › Sources page. Each row has the source links, the date, the first 12 characters of the
  file's SHA-256 and the script that builds it. *Copy citation* gives one line to quote: publisher,
  source, date, and the exact file the app holds with its full SHA-256.
- **Dates and fingerprints at deploy.** `scripts/build-sources-index.js` reads each file's date from
  the file itself and computes its size and SHA-256. It writes `data/sources-index.json` in the
  deploy job, so the table always matches the files published with it. That file is not committed.
- **Kept that way.** `tests/sources.test.js` fails the build in any of these cases:
  - a data file has no entry;
  - published data has no link, or built data names no source files;
  - a link is not a full `https` address, or a named script doesn't exist;
  - a date field doesn't read a date from the file;
  - a plan target lacks its link, page or quote.

  One plan target, Mayfield West Phase 2 (Caledon), cites a news release with no date. It is the
  only known undated target, and any other undated target fails the test.
- **Brampton planning files on BramPlanOnline.** Each Brampton planning file's source line also has
  *Find <file> on BramPlanOnline ↗*. It opens the portal's public search (no sign-in), where the
  file number finds the file and its documents (`applicationSearch` in `js/provenance.js`). Building
  permits are a different part of the portal and are not linked.
- **Not yet.** Links straight to one file's page (`applicationPageUrl`) are not built for any of
  the three municipalities: no stable address pattern has been checked.

## How is this worked out? (every figure)

Every figure in a panel or on a page has a **?** in its corner. It opens the figure's working under
the figures:
- the rule;
- the inputs, each with its value and a link to where it comes from: a file's record, the section of
  the design criteria document, or the document a data file was read from;
- the design criteria in use;
- the data files the figure reads, each with its receipt (source link, date, *Copy citation*).

*Copy the working* puts all of it on the clipboard as text. `js/how.js` holds the working; `js/panel.js`
and `js/ws-pages.js` add the buttons.

**Exact working, line by line:**

| Figure | Working |
|---|---|
| A development's **units** | The rule that picked the count (largest rezoning figure, site plan phases added up, condo phases, permits when they're higher, net of demolitions), and each file stating a count with its record |
| **People** | Units of each type × persons per unit = people, with Linear Wastewater Standards Tables 2-1 / 2-2 |
| **Jobs**, floor area | Floor area of each use ÷ floor space per job |
| **Water**, maximum day | People × 270 L/cap/d ÷ 86,400, × 1.8 (and jobs at the non-residential rates), with the Modelling Demand Table |
| **Wastewater**, peak wet weather | Average dry weather × Harmon peaking (2–4) + I&I on the site area, with sections 2.2, 2.4 and 2.5 |
| **Servicing › Capacity**, over / tight | Each facility counted: flow at build-out ÷ its capacity, with where the capacity comes from (annual report, Master Plan table, sewer network) |
| **Servicing › Capacity**, soonest limit and largest impact | The facility's existing, built, committed and proposed flow against its capacity |

**Every other figure** opens its panel's method and sources and the data files its panel reads
(`FILES` in `js/how.js`).

**Kept that way:** `tests/how.test.js` fails the build in any of these cases:
- a panel the app sets, or a page it builds, has no `FILES` entry;
- a file named there has no receipt;
- the arithmetic shown doesn't give the figure (people, water, wastewater, capacity).

A figure's button has a fixed id (panel key and position), so a re-render is unchanged. If its panel
re-renders (Home while its figures load, a filter, the scenario), the open box comes back.

## Counts that hold still, and counts found online checked

**Loading.** The same data used to show different totals depending on how the app loaded:
- **Slow or failed tree counts:** the tree counts (`data/tree-counts.json`) arriving after 3 s, or failing, gave the previous count, with nothing on screen saying so.
- **First open after a deploy:** the old build's cached data could mix with the new code.

Now:
- **Build-tagged data:** every `data/*.json` request carries the build (`?v=<build>`, from `<meta name="app-version">`; `js/util.js`), as the scripts and styles do. A copy cached by the previous build never answers the new code.
- **Tree counts:** the developments are built once the tree counts are in (a 20 s guard only for a request that never ends). If they fail, the count says "tree counts didn't load: counted from the files and permits", with a Reload button.
- **Old links:** a link from before Completed was shown by default still opens without Completed, and now says so.

**Counts found online** (`data/unit-lookups.json`, used only when no planning file states a count). Each one with a link was checked against its page on 2026-10-17 (`scripts/probe-unit-lookups.js`, `probe-sources mode=unit-lookups`; the sandbox can't reach the sites).
- **Kept, 22 counts.** Each has `verified: { on, by }`. The development panel shows how it was confirmed.
  - **11 `municipal`:** the municipal notice or decision for the file states it (three as the sum of the types it lists).
  - **11 `other`:** a named page states it but not the file number (UrbanToronto, SquareYards, a forum post, the Region's page, an applicant letter, an OMB decision).
- **Moved to `notUsed`, 12 counts (5,051 units).** Each has the reason:
  - the notice was for a different file (OZS-2022-0046);
  - the page states another figure (C02E05.036: 1,314, not 1,026);
  - the page states no count;
  - the page could not be opened.
- **Counts with no link** are read from the file's own description.

## The pipeline headline (for management)

The app opens on **all years**, so the headline is the whole pipeline: every live development, the tree total (3,929 developments · 257,647 units on the 2026-10-12 data). 2021–2026 is a tap away on the timeline. The census baseline stays the 2021 Census.

- **Headline** (Overview, Home and the executive briefing PDF), rounded to the nearest thousand: "About 258,000 homes are in the planning pipeline: 242,000 have moved since 2021 and 16,000 haven't moved since 2020. About 230,000 are not yet built."
- **Moved since 2021:** a development with a dated event in 2021 or later (`PeelLayers.movedSince`). One with no dated event counts as not moved.
- **Not yet built:** the total less every completed unit, before and after the census.
- **Stage bar** (Growth in an area):
  - The part of each stage in developments that haven't moved since 2020 is outlined.
  - The footnote adds the units completed before the 2021 Census, so the bars reconcile to the headline (253,265 + 4,382 = 257,647).
- **Code:** `js/layers.js` (`pipeline`, `headlineText`, `roundHeadline`); tests in `tests/pipeline-headline.test.js`.

## Building permits: blank counts, stale permits, infill, and the CMHC check

Decided 2026-10-17, after testing against the committed snapshot.

- **Permits that state no units (fix A, `js/phases.js` `inferBlankPermits`).** Brampton publishes its apartment and stacked-townhouse building permits with no unit count. Such a permit, held by a site plan or condominium file, permits that file's homes not yet on a permit that states units.
  - **Share:** all of them, or the share of the buildings the file lists ("two apartment buildings and seven stacked blocks") that the blank permits cover. One building per permit number; Brampton's -P01/-P02 parts count as one.
  - **Completion:** a building counts complete when every part of its permit is.
  - **Accuracy:** tested on 69 site plans whose permits do state units, 50 are within 10% and the median ratio is 1.00.
  - **Labelling:** the build-out shows `inferred`.
- **Permits left open (fix D, `closeStalePermits`).** A permit with no status and no completion, first issued five or more years before the data date, is taken as completed at issue + 12 months (houses) or + 30 months (20+ units), marked estimated. These are mostly Mississauga's 2012–2015 permits.
- **Not homes.** Permits typed Sign, Tent, temporary or sales structures, model homes, industrial or agricultural add no units unless the description names a dwelling.
- **Scored nearby matching (tested, not adopted).** It joined 1 extra site of 300. The large permit-only buildings are 2012–2017 permits whose site plans predate the data window, and the only nearby applications are newer filings. The existing exact-count rule stays.
- **Infill and additional units (`PeelLayers.infill`).**
  - **What it counts:** homes on building permits issued since census day on sites with no planning application, net of the homes those sites demolished.
  - **Size:** about 12,000 on the 2026-10-12 data, made of 8,134 suites, 3,392 houses and 361 in small buildings.
  - **Where it shows:** beside the pipeline headline, not in it.
  - **Brampton:** its open permit data has no second-unit permits; the headline says so.
  - **Servicing:** the completed ones count as built since the census (as they did). Suites now use the apartment rate (2.7 people), not a house's.
- **Under construction against CMHC** (Records › Data checks, the model against published figures).
  - **Why a roll-forward:** CMHC archived its under-construction inventory by municipality after 2022. The check rolls it forward with CMHC starts and completions (Region of Peel Housing Construction Activity): inventory(Y) = inventory(Y − 1) + starts(Y) − completions(Y), which reproduces CMHC's own 2017–2022 figures.
  - **Against the app:** compared with homes permitted and not completed on planning applications, by municipality, refreshed with each weekly data update.
  - **Known gaps:** Mississauga (large permits signed off within two years of issue, to confirm with the City) and Caledon (no completion dates).

## Capital and EA outputs: the site brief, To check, and one row per contract

Each output answers one person's question, says why each item is listed, and says how far to trust it.
Wording stays screening wording: what the records show and what to check, never what the Region
should do.

- **Site brief (for the servicing review).** On a development's **Capital** section, and in its
  **Servicing memo**: each EA within 1 km of the site boundary and each Region capital contract that is
  planned, tendered, awarded or under construction within 1 km, nearest first.
  - An EA line gives its status, schedule, distance, next step or completion year, "no milestone
    since …" when it has been idle 18 months, and the report's preferred-solution sentence when there
    is one.
  - A contract line gives its status, % built and the year it is in service.
    - **% built:** the Region's figure, else estimated from the start and target dates (and labelled
      so).
    - **Flags:** a completion target that has passed with no completion date, and a record with no
      update in a year.
  - **Copy for review comments** (the site page's action row) puts the whole brief on the clipboard
    as plain text, one line per item with its project page and the sources' dates. If the browser
    blocks the clipboard, it is saved as a text file.
- **To check (for the planner).** At the top of Capital › Projects, and in the map's Construction
  view, worst first:
  1. EAs complete 9+ years with no construction following them.
  2. Contracts past their completion target with no completion date (how long past).
  3. EAs marked current with nothing dated ahead and no milestone in 18 months, or none published.
  4. Open contracts not updated in the year before the layer's latest update, or never dated.

  Each item says why it is listed and what to check. It follows the map's municipality. **CSV of this
  list**, and a **Capital to check** sheet in the workbook.
- **CSV: every contract** (Capital › Projects, and the Construction view). One row per contract (a
  project page and its segments), flagged ones first.
  - **Columns added:**
    - the municipality the work is in, from its ward (the published field often names all three);
    - the system and the year it is in service;
    - the % built and whether it was reported or estimated;
    - days past the completion target, the last update and months since;
    - what to check;
    - the EA it came from and how that link was made;
    - the DC program link and how sure it is;
    - the layer's "as of" date.
  - The workbook's **Capital** sheet is the same table.
- **EA placement fix.** A sewer or watermain EA is placed on DC mains that share two words with its
  name.
  - **The bug:** street words ("Drive", "Road") counted towards those two words, and so did the
    long description text read from the DC map's PDF. The Fair Birch Drive / Lorne Park Road EA
    (Mississauga) was laid on 27 mains across Peel, and showed beside Brampton sites.
  - **Now:** matching uses the main's name only and ignores street words. A match spread over more
    than 15 km is refused. The street-name fallback keeps only capital records in the EA's own
    municipality, by ward.
  - **The data:** that EA's line and links were rebuilt in `data/eas.json` with the new rules. The
    weekly build does the same for every EA.
- **Code.**
  - `js/capital-ea-model.js`: `siteBrief`, `siteBriefText`, `siteBriefHTML`, `watchList`,
    `contractCheck`, `eaCheck` and `capitalSheetRows`, tested in `tests/capital-outputs.test.js`.
  - `js/capital-ea.js`: wiring.
  - `js/sections.js`: a merged section keeps a secondary action.
  - `scripts/ea-lib.js`: placement, tested in `tests/ea-data.test.js`.

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
  tiles don't load (offline), the Check a site map names its streets from the Region's address points
  (`js/reports.js` `streetLines`).
- **Zoom**: Forecast, This week, DC projects and the EAs page zoom to the municipality chosen.
- **The EAs page** (EA to construction) draws the EA study areas (by status) and the construction that followed.
- **Labels** (the three largest developments, the largest named works, the EAs waiting longest, the
  worst old pipes by street) only on a zoomed-in map: a map of all of Peel names only the municipalities.
- **Check a site › Site › Water and wastewater** (`js/devtab.js`): within 100 m – 1 km (as the storm
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