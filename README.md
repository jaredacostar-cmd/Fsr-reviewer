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

- **Background:** aerial imagery is the default (Esri World Imagery), with road and place-name
  overlays. Switch to plain aerial or a street map with the picker at the top right of the map.
- **Labels:** from zoom level 14, every point not inside a cluster gets a label. Choose what it
  shows: address and phase, address only, file or permit number, units, or off. The largest
  projects are labelled first. A label moves to the left side when the right side is blocked,
  and it is left out if it would cover another label or point.
- **Map:** clusters show how many projects they hold. The ring around each cluster shows the
  mix of phases. Click a marker to open the project.
- **Project panel:** shows a phase stepper with the date each phase was reached, a dated
  timeline of every milestone, and every underlying record with all of its source fields.
- **Phase filter:** click a phase to toggle it. Alt-click a phase, or click a segment of the
  pipeline bar, to show only that phase.
- **Filters:** search by address, file number or description. You can also filter by
  municipality and record type (applications, permits, or sites with both). "New builds only"
  hides alteration-type permits such as decks, signs and HVAC. **Unit growth** keeps only
  projects that add dwelling units (any, 10+, 50+, 100+ or 500+). With "Planning applications"
  selected, only units proposed on the applications count. **Applications adding units** sets
  both filters in one tap; tap it again to turn it off.
- **Timeline (bottom left):** drag the two handles to keep only projects with activity in that
  range of years, for example 2022–2024. The dropdown picks which milestone must fall in the
  range: any milestone, application submitted, approved, permit issued, or completed. The bars
  show projects per year. Click a bar to isolate that year, and shift-click another bar to
  extend the range.
- **Population & servicing demand (bottom right):** estimates the population and the water and
  wastewater demand of the dwelling units in the projects currently shown. It responds to every
  filter and to the timeline. You can include all shown projects, only those not yet completed,
  or only completed ones. Withdrawn projects are always excluded. Open "Breakdown & design
  criteria" to see totals by dwelling type and by phase, and to edit the criteria.
- **Export:** download the filtered projects as CSV or GeoJSON, one column per phase date.
- **Data sources:** turn any source on or off and set how far back to load. **Discover
  datasets** searches the Mississauga, Brampton, Caledon and Peel ArcGIS Hub sites for every
  development, planning and permit feature service they publish. You can also paste in any
  FeatureServer or MapServer URL.

## Weekly automatic update

A GitHub Action (`.github/workflows/site.yml`) runs every Monday at 10:17 UTC, which
is early morning in Toronto. You can also start it by hand from the Actions tab with **Run
workflow**. Each run does the following:

1. It loads every configured source, plus every development or permit dataset it finds on the
   Mississauga, Brampton, Caledon and Peel open-data hubs. This means new datasets are picked
   up without anyone editing the config.
2. It writes `data/snapshot.json`, which holds planning applications and new-build permits.
3. It adds this week's phase for every project to `data/history.json`. The sources only
   publish current status, so this file builds a record of when each project moved from one
   phase to the next.
4. It commits both files if anything changed, then redeploys the site to GitHub Pages.

The same workflow also redeploys the site on every push to `main`.

If a source is down that week, its records from the previous week are kept and marked as
stale. Nothing is written if every source fails.

When the page opens, it loads the snapshot first, which is fast and doesn't depend on the city
servers being up. The app then shows:

- **This week:** projects that are new, or that changed phase, since the previous run.
- **Phase history:** in each project panel, the date each phase change was detected.
- **Data sources:** the date of the snapshot. **Refresh live** re-queries every source right
  away and also includes alteration-type permits.

**Setup:**

- Scheduled workflows only run from the repository's **default branch** (`main`), so this
  branch needs to be merged first.
- **GitHub Pages (used here):** the repository must be public, or on a paid plan. Go to
  Settings → Pages and set Source to **GitHub Actions**. Then start **Update data and deploy
  site** from the Actions tab. The site is published at
  `https://<user>.github.io/<repo>/`.
- **Netlify (alternative):** use **Add new site → Import an existing project → GitHub**
  instead of Netlify Drop. This works with private repositories on the free plan, and every
  weekly commit then deploys itself.
- Run it locally with `npm run snapshot`.

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
