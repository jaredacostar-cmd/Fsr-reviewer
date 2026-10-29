# The data: sources, receipts, updates and deploys

Where each file comes from, its receipt, the weekly update, the service worker and the deploy checks. Part of the [Peel Growth Pipeline README](../../README.md); the other parts: [Using the app](../guide/README.md), [How the numbers are worked out](../method/README.md).

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

**Housing activity** (Growth › Areas) shows the latest full year for each municipality and
Peel: starts and completions (with 5-year averages), units absorbed, and permit units and value.
A check line sets the units on this app's own permit records issued that year against the
Region's count.

`data/peel-housing.json` is built by `scripts/build-peel-housing.js` (*Probe data sources*
workflow, mode `peel-open`). A year is the Region's annual row, or its four quarters added up; a
year with fewer quarters is partial and isn't used as a full year. `scripts/probe-peel-open.js`
lists the Region's other layers.

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
| Brampton | Pre-consultation (always shown as Pre-application; units not counted) | Applications |
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
- **Where to see it.** The table is under Records › Sources, the fold *Every data file* (Home's Records
  tab and the map's). Each row has the source links, the date, the first 12 characters of the
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
