# Peel Growth Pipeline (unofficial)

> **Unofficial prototype · public data only · not a Region of Peel product.**
> Capacity and development-charge figures are screening estimates, not engineering analysis.

A map of every development in Peel Region (Mississauga, Brampton, Caledon), following each
site from application to completion.

It pulls planning applications and building permits live from the municipalities' public ArcGIS
open-data services. Files on the same site are linked into one **project**, and each project is
placed at a stage, the app's one set of words for how far it has come (each file keeps its municipality's own
status wording):

| # | Stage | What it means |
|---|-------|---------------|
| 1 | Pre-application | Pre-consultation or application submitted (the municipalities' inception or intake) |
| 2 | In review | Circulation, public meeting, appeal; also zoning / official plan / subdivision approved with no site plan approval yet |
| 3 | Plan approved | Site plan approved, or plan of subdivision registered (the last planning step before building permits) |
| 4 | Building permit | Building permit issued |
| 5 | Under construction | Inspections underway |
| ✓ | Built | Occupancy, final inspection or permit closed |
| × | Withdrawn / refused | Every file on the site was withdrawn, refused, cancelled or expired |

Each file keeps its own status; the site takes the furthest stage of its files, except that
**only a site plan approval, or a plan of subdivision shown as registered, makes a site
Plan approved** (freehold houses go from registration straight to building permits). An approved zoning,
official plan, draft subdivision or condominium file keeps the site In review (shown as *Zoning approved · site
plan pending*); a site plan approved before a newer rezoning that is still in review was for an
earlier proposal and does not count; Brampton's legacy site plans (status "Transferred", carried
over from its old system, mostly 1980s–1990s, no dates) don't count for a current proposal, and a
site with only legacy files is shown as Built. Demolition permits (HOUSDEMO / DEMO) clear a site
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
top of it. A development's Records tab, in *Files and events*, names the earlier files its own files point to (a Brampton site
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
   The included workflow then deploys the site and keeps it updated weekly (the
   weekly data refresh: see [Deploy checks](docs/data/README.md#deploy-checks)). The site appears at `https://<user>.github.io/<repo>/`.
3. **Same Wi-Fi, no hosting.** On a computer, run `npm start`, then open
   `http://<computer's IP address>:8080` on the iPhone. This works only while the computer is
   on and on the same network.

To use it like an app, tap **Share → Add to Home Screen** in Safari. It opens full screen with
its own icon, under the home-screen name **Peel Dev**.

On a phone, Home's menu is ☰ in the top bar, beside Home, and ⋯ holds Export, Present, Help and
Settings; a page's actions sit in a bar at its foot. On the full map, **Filters** opens the search, the
filters and the developments on the map, and the five tabs (Overview · Growth · Servicing · Capital ·
Records) are a sheet at the bottom: tap its summary line to raise it, and Esc folds it back. Each panel has a
**Scenario** and a **Years** chip (the timeline sits under the sheet); the legend is a card on the map,
folded until you open it. Help › *What moved where* gives each older control's place now.

## Where the rest is

The rest of this documentation is in three files, each section in the order it had here:

- **[Using the app](docs/guide/README.md)**: Home, Find, the pages and the full map: the five tabs, their views, the tools, Help and Settings, and how each changed.
  - [Using it](docs/guide/README.md#using-it)
  - [Existing water facilities](docs/guide/README.md#existing-water-facilities)
  - [Sewer profile](docs/guide/README.md#sewer-profile)
  - [Applications in a development, related applications and drilling down](docs/guide/README.md#applications-in-a-development-related-applications-and-drilling-down)
  - [Latest submission on labels and titles](docs/guide/README.md#latest-submission-on-labels-and-titles)
  - [Development panel tabs](docs/guide/README.md#development-panel-tabs)
  - [Map boxes, the results year and the tour](docs/guide/README.md#map-boxes-the-results-year-and-the-tour)
  - [Growth tab and the 2020 Master Plan comparison](docs/guide/README.md#growth-tab-and-the-2020-master-plan-comparison)
  - [Functional Servicing Reports and the water supply route](docs/guide/README.md#functional-servicing-reports-and-the-water-supply-route)
  - [DC funding scenario](docs/guide/README.md#dc-funding-scenario)
  - [Change log and versions](docs/guide/README.md#change-log-and-versions)
  - [One set of numbers: pages and the full map agree](docs/guide/README.md#one-set-of-numbers-pages-and-the-full-map-agree)
  - [Sections: a page shows every map tab for its scope](docs/guide/README.md#sections-a-page-shows-every-map-tab-for-its-scope)
  - [Find: one step for a site, a plan or an area you draw](docs/guide/README.md#find-one-step-for-a-site-a-plan-or-an-area-you-draw)
  - [Find from every page](docs/guide/README.md#find-from-every-page)
  - [Servicing and Capital: Home's tabs, the map's sub-views as views](docs/guide/README.md#servicing-and-capital-homes-tabs-the-maps-sub-views-as-views)
  - [Servicing and Records (navigation phase 2)](docs/guide/README.md#servicing-and-records-navigation-phase-2)
  - [Growth: By period in the Forecast (navigation phase 3)](docs/guide/README.md#growth-by-period-in-the-forecast-navigation-phase-3)
  - [Capital: DC timing · EAs · Projects (navigation phase 4)](docs/guide/README.md#capital-dc-timing--eas--projects-navigation-phase-4)
  - [One development layout (navigation phase 5)](docs/guide/README.md#one-development-layout-navigation-phase-5)
  - [Home hosts the map's tabs (navigation phase 6)](docs/guide/README.md#home-hosts-the-maps-tabs-navigation-phase-6)
  - [Home's sidebar, Help and Settings (navigation phase 7)](docs/guide/README.md#homes-sidebar-help-and-settings-navigation-phase-7)
  - [Every scope kind (navigation phase 8)](docs/guide/README.md#every-scope-kind-navigation-phase-8)
  - [One name per thing, and the README split (navigation phase 9)](docs/guide/README.md#one-name-per-thing-and-the-readme-split-navigation-phase-9)
  - [Help and This week](docs/guide/README.md#help-and-this-week)
  - [Home: the briefing](docs/guide/README.md#home-the-briefing)
  - [Tokens and accessibility](docs/guide/README.md#tokens-and-accessibility)
  - [Presentation mode](docs/guide/README.md#presentation-mode)
  - [Chart and table forms](docs/guide/README.md#chart-and-table-forms)
  - [One home for tool results, and the top bar](docs/guide/README.md#one-home-for-tool-results-and-the-top-bar)
  - [Scope-aware tabs and duplicates removed](docs/guide/README.md#scope-aware-tabs-and-duplicates-removed)
  - [Servicing scopes: the servicing ladder](docs/guide/README.md#servicing-scopes-the-servicing-ladder)
  - [Measure: coloured points, streets and watercourses crossed](docs/guide/README.md#measure-coloured-points-streets-and-watercourses-crossed)
  - [Stage selector](docs/guide/README.md#stage-selector)
  - [Settings: one sheet](docs/guide/README.md#settings-one-sheet)
  - [Opening a development doesn't trace or zoom out](docs/guide/README.md#opening-a-development-doesnt-trace-or-zoom-out)
  - [Land use filter: every application by default](docs/guide/README.md#land-use-filter-every-application-by-default)
  - [Units read from proposals, the development Overview, Growth layout, wide tables](docs/guide/README.md#units-read-from-proposals-the-development-overview-growth-layout-wide-tables)
  - [Panels start below the top bar](docs/guide/README.md#panels-start-below-the-top-bar)
  - [Wide screens](docs/guide/README.md#wide-screens)
  - [Measure, Part 1: ground profile accuracy, manholes, and the sewer profile](docs/guide/README.md#measure-part-1-ground-profile-accuracy-manholes-and-the-sewer-profile)
  - [3D view, Part 2: terrain, buildings and proposed massing](docs/guide/README.md#3d-view-part-2-terrain-buildings-and-proposed-massing)
  - [Time Box, Part 3: a place's imagery over the years](docs/guide/README.md#time-box-part-3-a-places-imagery-over-the-years)
  - [Capital › EAs: the environmental assessments list](docs/guide/README.md#capital--eas-the-environmental-assessments-list)
  - [Home: EA to construction, and the Forecast](docs/guide/README.md#home-ea-to-construction-and-the-forecast)
  - [Home page maps: street context, zoom, labels; Site: water and wastewater](docs/guide/README.md#home-page-maps-street-context-zoom-labels-site-water-and-wastewater)
- **[How the numbers are worked out](docs/method/README.md)**: Stages, the development trees, units, people, jobs and flows, the definitions, the checks and the screening rules.
  - [How applications connect: the development process](docs/method/README.md#how-applications-connect-the-development-process)
  - [How classification works (`js/phases.js`)](docs/method/README.md#how-classification-works-jsphasesjs)
  - [Build-out by dwelling type](docs/method/README.md#build-out-by-dwelling-type)
  - [Employment uses (`js/employment.js`)](docs/method/README.md#employment-uses-jsemploymentjs)
  - [Aerial check (is it built?)](docs/method/README.md#aerial-check-is-it-built)
  - [Duplicate check (proof of counting once)](docs/method/README.md#duplicate-check-proof-of-counting-once)
  - [Build-out: planned vs permitted vs left to build](docs/method/README.md#build-out-planned-vs-permitted-vs-left-to-build)
  - [Trust signals: one note, every export, the criteria stamp, provenance](docs/method/README.md#trust-signals-one-note-every-export-the-criteria-stamp-provenance)
  - [Pipe class and "not assessed"](docs/method/README.md#pipe-class-and-not-assessed)
  - [Capital schedule currency: status, "as of" and one dollar year](docs/method/README.md#capital-schedule-currency-status-as-of-and-one-dollar-year)
  - [Screening wording and the public version](docs/method/README.md#screening-wording-and-the-public-version)
  - [Applying the tree: Step B0 review workbook](docs/method/README.md#applying-the-tree-step-b0-review-workbook)
  - [Definitions (one table, used everywhere)](docs/method/README.md#definitions-one-table-used-everywhere)
  - [Population and demand criteria (`js/demand.js`)](docs/method/README.md#population-and-demand-criteria-jsdemandjs)
  - [Site constraints: gas, hydro, watercourses, regulation limits](docs/method/README.md#site-constraints-gas-hydro-watercourses-regulation-limits)
  - [Employment: jobs from published floor areas and permits](docs/method/README.md#employment-jobs-from-published-floor-areas-and-permits)
  - [Net units, the screening note, and pipe results off](docs/method/README.md#net-units-the-screening-note-and-pipe-results-off)
  - [Step B1: tree counts in the app (Previous / Tree switch)](docs/method/README.md#step-b1-tree-counts-in-the-app-previous--tree-switch)
  - [Step B2: the trees are the developments](docs/method/README.md#step-b2-the-trees-are-the-developments)
  - [Population tables, C1: the plan roll-up engine](docs/method/README.md#population-tables-c1-the-plan-roll-up-engine)
  - [Population tables, C2: Table 1, the roll-up (Growth › By plan)](docs/method/README.md#population-tables-c2-table-1-the-roll-up-growth--by-plan)
  - [Population tables, C3: Table 5, plans by plant or pressure zone](docs/method/README.md#population-tables-c3-table-5-plans-by-plant-or-pressure-zone)
  - [Population tables, C4: plans against their targets (Table 2)](docs/method/README.md#population-tables-c4-plans-against-their-targets-table-2)
  - [How is this worked out? (every figure)](docs/method/README.md#how-is-this-worked-out-every-figure)
  - [Counts that hold still, and counts found online checked](docs/method/README.md#counts-that-hold-still-and-counts-found-online-checked)
  - [The pipeline headline (for management)](docs/method/README.md#the-pipeline-headline-for-management)
  - [Building permits: blank counts, stale permits, infill, and the CMHC check](docs/method/README.md#building-permits-blank-counts-stale-permits-infill-and-the-cmhc-check)
  - [Capital and EA outputs: the site brief, To check, and one row per contract](docs/method/README.md#capital-and-ea-outputs-the-site-brief-to-check-and-one-row-per-contract)
- **[The data: sources, receipts, updates and deploys](docs/data/README.md)**: Where each file comes from, its receipt, the weekly update, the service worker and the deploy checks.
  - [Outside data: targets, projections, costs, storms, compliance, hydraulics](docs/data/README.md#outside-data-targets-projections-costs-storms-compliance-hydraulics)
  - [Region of Peel open data: housing activity, building permits, watercourses](docs/data/README.md#region-of-peel-open-data-housing-activity-building-permits-watercourses)
  - [Updates reach the browser (offline service worker)](docs/data/README.md#updates-reach-the-browser-offline-service-worker)
  - [Deploy checks](docs/data/README.md#deploy-checks)
  - [Data sources (`js/config.js`)](docs/data/README.md#data-sources-jsconfigjs)
  - [Every data file has a receipt](docs/data/README.md#every-data-file-has-a-receipt)
