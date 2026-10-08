# Peel Development Tracker

A map of every development in Peel Region (Mississauga, Brampton, Caledon), following each
site from application to completion.

It pulls planning applications and building permits live from the municipalities' public ArcGIS
open-data services. Files on the same site are linked into one **project**, and each project is
placed in a construction phase:

| # | Phase | What it means |
|---|-------|---------------|
| 1 | Inception | Pre-consultation or application submitted |
| 2 | Under review | Circulation, public meeting, appeal |
| 3 | Approved | Planning approval (OPA, ZBA, subdivision, site plan) |
| 4 | Permit issued | Building permit issued |
| 5 | Under construction | Inspections underway |
| ✓ | Completed | Occupancy, final inspection or permit closed |
| × | Withdrawn / refused | Every file on the site was withdrawn, refused, cancelled or expired |

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
the phase names. **Hide** collapses the timeline and demand panel to give the map more room.

## Using it

The sidebar has three tabs.

**Explore**
- **Quick views:** one tap for All developments, Applications adding units, Units left to
  build, Being built (permit issued or under construction), or Completed.
- **Search** by address, file number or description.
- **Municipality** buttons: All, Brampton, Caledon, Mississauga.
- **Record type** (planning applications, building permits, or sites with both) and **Units**
  (adds units, 10+ … 500+, or units left to build).
- **New buildings only** hides alterations, signs, pools and similar permits.
- **Active filters** appear as chips. Tap a chip's × to remove that filter, or use **Reset
  all**.
- **Phases:** tap a phase to show or hide it. The list below shows the matching projects.

**This week:** projects that are new, or that changed phase, since the previous weekly update.

**Data:** the source list, **Refresh live**, and an **Advanced** section for adding sources.

**Map**
- **Background:** aerial imagery is the default (Esri World Imagery), with road and place-name
  overlays. Switch to plain aerial or a street map with the picker at the top right.
- **Labels:** from zoom level 14, every point not inside a cluster gets a label. Choose what it
  shows: address and phase, address only, file or permit number, units, or off. The largest
  projects are labelled first, and a label is left out if it would overlap another.
- **Clusters** show how many projects they hold. The ring around each cluster shows the mix of
  phases.
- **Subdivisions up close:** at street zoom, or when you select a project, its application
  boundary appears with every building permit inside it as its own dot. Tap a dot to see that
  permit and the **planning application it belongs to** (file number, type, status, planned
  units). **Open whole project** shows the build-out for the whole subdivision.
- **Project panel:** shows the build-out (planned, permitted, completed, left to build), a phase
  stepper, the weekly phase history and the dated timeline. Every source record has **Show on
  map**. On phones, the panel opens as a bottom sheet so the selected point stays visible.

**Timeline (bottom left):** drag the handles to keep only projects with activity in those years.
The dropdown picks which milestone must fall in the range. Click a bar to isolate one year, and
shift-click to extend the range.

**Population & servicing demand (bottom right):** population, water and wastewater estimated
from the units in the projects shown. It can be based on all units, units left to build, units
not yet completed, or completed units. Open **Breakdown & design criteria** to edit the criteria.

**Export:** download the filtered projects as CSV or GeoJSON.

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

## Build-out: planned vs permitted vs left to build

For each project with a unit count on its planning applications:

| Figure | Meaning |
|---|---|
| Planned | Units on the planning applications. Files on the same land repeat one proposal, so the largest figure is used. Parts nested inside a larger application are summed, unless the parent's own figure is larger. |
| Permitted | Units on building permits on the land. Permits at one address (foundation, full, revisions) count once. |
| Completed | Units on permits marked closed, finaled or occupied. |
| **Left to build** | Planned − permitted: units with no building permit yet. |
| Not yet completed | Planned − completed. |

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
| Persons per unit: apartment | 2.7 | same standard's rate for apartments above 475 persons/ha (3.1 for large apartments at lower density) |
| Persons per unit: type not stated | 2.7 | assumption: most unit-bearing projects in Peel's pipeline are apartments |
| Water, average day | 280 L/cap/day | Peel Watermain Design Criteria (rev. June 2010), long-term residential rate |
| Water, max day / peak hour | ×2.0 / ×3.0 | same |
| Wastewater, residential | 290 L/cap/day | Peel Linear Wastewater Standards R1.0 |
| Wastewater peaking | Harmon, M = 1 + 14 / (4 + √P), P in thousands | Peel Sanitary Sewer Design Criteria |

How the estimate works:

- **Dwelling type:** taken from a published unit-mix column (singles, semis, towns,
  apartments) when the dataset has one. Otherwise it is guessed from the project's type and
  description text.
- **Peaking:** the Harmon factor is applied to the combined population of everything shown.
  That gives a system-level peak, which is lower than adding up each site's own peak flow.
- **Not included:** infiltration (0.26 L/s/ha) and ICI (employment) demand, because they need
  site area and employment data that the source datasets don't provide.

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
