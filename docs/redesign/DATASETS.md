# New open datasets: what each adds and how to build it

Checked against main at `4dfedab` (2026-10-16). Each item says what is already in the app, what the
new source adds, how to fetch and build it in this repo's pattern (fetch on GitHub Actions, build
script, `data/*.json`, app module), where it shows in the redesign (`SPEC.md`, `boards/`), the test
that proves it, and the effort.

Repo pattern used throughout:

- **Fetch** in `scripts/fetch-external.js` (new `--only <name>` part), run by *Probe data sources*
  mode `external`; raw files land on the `ext-raw` branch.
- **Build** with a `scripts/build-<name>.js` that reads the raw files and writes `data/<name>.json`
  with `version`, `source`, `url`, `fetched`, and a `note`.
- **Load** in the app next to the other `data/*.json` loads; never fetch these hosts from the browser.
- Every figure keeps its source line in the UI ("MECP effluent data, 2024").

---

## Wave 1: corrects numbers the app already shows

### 1. MECP municipal treated wastewater effluent, monthly plant flows (2008–2024)

**Already in the app.** `data/peel-reports.json → wastewater.plants.*.history`: annual average flow
2019–2025 (Booth) and 2020–2025 (Clarkson), from Peel's annual reports. Used to calibrate the model.

**What it adds.**
- 17 years instead of 6–7, so the plant trend is a fitted line, not a few points.
- 12 monthly totals a year, so the wettest month and the seasonal swing are visible (Booth 2024:
  annual 453.3 ML/d, wettest month 538.5 ML/d, above its 518 ML/d rating).
- An independent check of Peel's figures. It matches: Booth 2024 453.3 vs 452.1, 2021 439.9 vs 439.9;
  Clarkson 2024 215.7 vs 215, 2021 218.2 vs 218 (ML/d).

**Watch out.** Booth fell to 427.8 ML/d in 2025 because a west-to-east connection was closed on
2025-03-12 and flow moved to Clarkson (Peel's 2025 report). Any trend must treat that as a step, not
growth slowing. Fit Booth and Clarkson separately before and after the step, and fit their sum
across it. The sum is the South Peel system trend and is not affected by the diversion.

**Source.** Ontario Data Catalogue, *Municipal Treated Wastewater Effluent*. One XLSX per year at
`https://files.ontario.ca/moe_mapping/downloads/2Water/MWD/MWD{year}.xlsx` (get each year's URL from
CKAN `resource_show`; the 2024 record has a broken `https:///` prefix, so normalise). Columns:
`Company Code, Works Name, Municipality, Month (YYYY/MM), Parameter Name, Reported Value, Unit`.
Flow rows: `Parameter Name = "SEWAGE FLOW, MONTHLY TOTAL"`, unit 10³ m³. Peel plants by company
code: 110001284 G.E. Booth (named "LAKEVIEW WPCP" before ~2018), 110001328 Clarkson, 110001440
Inglewood. Yearly release; the 2024 file came out January 2026.

**Build.** `fetch-external.js --only mwd` → `ext-raw/mwd/MWD{2008..2024}.xlsx`.
`scripts/build-plant-flows.js` → `data/plant-flows.json`:

```json
{ "version": 1, "source": "MECP Municipal Treated Wastewater Effluent", "url": "...",
  "fetched": "2026-10-17",
  "steps": [{ "date": "2025-03-12", "from": "Lakeview", "to": "Clarkson",
              "note": "west-to-east connection closed (Peel 2025 annual report)" }],
  "plants": { "Lakeview": { "code": "110001284", "ratedMLd": 518,
     "monthly": { "2024-01": 13891.2, "...": 0 },
     "annual":  { "2024": { "avgMLd": 453.3, "maxMonthMLd": 538.5, "months": 12 } } } } }
```

Merge with `peel-reports.json` history for 2025 (MECP lags a year). Where both have a year, keep
Peel's and store the difference as a check.

**App.**
- Plant scope card (`boards/ScopeCard.dc.html`): a small line chart under the capacity bar,
  2008 → today in the Existing colour, the 90% trigger and 100% rated as reference lines, the
  diversion step marked, and build-out shown as committed + proposed stacked at the right edge.
- Servicing tab: "wettest month" beside each plant's annual figure.
- Overview "Needs attention": the trigger year comes from the fitted trend plus committed growth,
  with the method in the tooltip.
- Model checks (`js/demand-ui.js` validation rows): add "MECP vs Peel report, same year".

**Test.** `tests/plant-flows.test.js`: 2024 Booth annual average = 453.3 ± 0.1; 2021 Booth matches
`peel-reports.json` within 1%; the trend fit ignores months after the step for Booth alone.

**Effort.** Small: one fetch part, one build script, one chart. 1–2 days.

---

### 2. 2021 Census profile: observed persons per unit by dwelling type

**Already in the app.** DA population and dwelling counts (`data/das.json`). Persons per unit are
Peel design values (single 4.2, town 3.4, apartment 3.1).

**What it adds.** A check on those design values from what people actually live in. If new
apartment areas show 2.0 people per unit, every apartment-heavy site's population and flow is
overstated by about half, and every capacity bar with it.

**Source.** Statistics Canada, Census Profile 2021, dissemination area level, Ontario
(catalogue 98-401-X2021006). Needed rows per DA: population in private households, private
dwellings by structural type (single-detached, semi, row, apartment < 5 storeys, apartment 5+),
and period of construction (2011–2015, 2016–2021). The Ontario file is large (over 1 GB unzipped);
filter to Peel's DA codes in the fetch step and commit only the filtered CSV.

**Method.** For each municipality, take DAs where at least 60% of dwellings were built 2011–2021
(new growth areas). Fit household population = a·singles + b·semis + c·rows + d·apartments with
non-negative least squares. a, b, c, d are observed persons per unit for new housing. Report the fit
quality and the DA count; do not show a value with fewer than 20 DAs.

**Build.** `fetch-external.js --only census-profile` → filtered CSV. `scripts/build-ppu-check.js`
→ `data/ppu-check.json`: `{ muni: { single, semi, row, apartment, das, r2 } }` plus Peel overall.

**App.**
- Scenario control: a line under persons per unit, "Observed in 2011–2021 neighbourhoods:
  single 3.9 · town 3.3 · apartment 2.4 (Census 2021)". Design values stay the default.
- Site Overview, build-out block: if the site is mostly one type and observed differs from design
  by more than 15%, add it to "things to confirm".
- A Scenario toggle "persons per unit: Peel criteria | observed" so the capacity effect can be seen.

**Test.** Fit on a synthetic fixture recovers known values; Peel overall household population from
the fit is within 2% of the census total.

**Effort.** Medium: the file size and the fit. 2–3 days.

---

### 3. Brampton Official Plan layers: plan area and land-use designation

**Already in the app.** Secondary plan and precinct polygons (`data/areas.json`), hand-collected
plan targets (`data/plan-targets.json`).

**What it adds.**
- Published plan area (`EST_SIZE_HC`, hectares) for each secondary plan, so every target gets an
  implied density (target ÷ area). This exposes mixed bases: today the five Brampton targets range
  from 16 to 155 people per hectare (Bram West 38,600 over 2,489 ha vs Heritage Heights 134,000 over
  864 ha), so they are not all build-out totals.
- The Official Plan designation under each site (Schedule A: Residential, Industrial, Office, Open
  space, "N-W Brampton Urban Development Area"…). Useful on the site card and as a "use differs from
  designation" hint for OPA files.
- Not usable: Schedule G "housing mix and density categories" has no category field
  (`AMENDMENT`, `APPEALS` only), so densities cannot be derived from the data. Keep targets as the
  To 2051 source.

**Source.** `https://services3.arcgis.com/rl7ACuZkiFsmDA2g/ArcGIS/rest/services/Planning_Official_Plan/FeatureServer`
layers 0 (secondary plans, `SPA_NUMBER`, `SPA_NAME`, `EST_SIZE_HC`, `APPEALS`) and 4 (land use,
`OP_LANDUSE`). Same host the app already uses for Brampton applications. Check Mississauga and
Caledon open data for their Official Plan land-use layers in the same probe.

**Build.** Extend `scripts/build-areas.js`: add `areaHa` and `appeals` to each Brampton secondary
plan; tag each development with `opLandUse` (point in polygon, largest share for site boundaries).

**App.**
- Growth › By plan: an "implied density" column (people per ha) beside the target, and a muted
  "likely remaining growth, not build-out" note where it is under 30.
- Site Overview header line: "Brampton OP: Residential" (or the designation).
- Records › a file: "Designation differs from proposed use" when an OPA is filed and the use and
  designation disagree.

**Test.** Heritage Heights `areaHa` = 864; 9763 Heritage Rd `opLandUse` = "N-W BRAMPTON URBAN
DEVELOPMENT AREA".

**Effort.** Small. 1 day.

---

## Wave 2: provenance and events for the wastewater system

### 4. Peel Wastewater Collection System annual report: spills, overflows, station roster

**Already in the app.** The report is downloaded by mode `peel-reports` and linked in
`peel-reports.json → reports.collection`. Not parsed.

**What it adds.**
- Every spill and overflow with date, place, volume and Spills Action Centre number (2025: 12
  spills, 6 overflows, 4 on April 2: Clarkson GO weir 944 m³, Cavendish Creek 62.1 m³, Credit
  Woodlands 27.3 m³, Stavebank; 2 on December 28).
- The station roster under ECA 009-W601: 32 South Peel stations plus Inglewood SPS. The open GIS
  layer has 39 points, so the roster says which are Regional sewage pumping stations.
- Bypass totals per plant are already in `peel-reports.json` (Booth 7 bypasses, 725 ML in 2025).

**Source.** `peel-reports.json → reports.collection.url` each year; text via `pdftotext -layout`.
Table 7 (spills) and Appendix A Tables 9–11 (facilities). Layout is stable 2024 → 2025.

**Build.** `scripts/build-ww-events.js` → `data/ww-events.json`:
`{ year, events: [{ date, place, kind: "overflow"|"spill", volumeM3, cause, action, sacRef, lnglat }],
stations: [{ name, muni, system }] }`. Geocode places once into `data/ww-event-places.json` (hand
checked; there are few). Fail loudly if the table header moves.

**App.**
- Map, Servicing lens: an "Overflows and spills" layer (dots sized by volume, year chips).
- Block and station scope cards: "Overflowed 2× in 2025 (April 2, December 28)".
- Site "things to confirm": "Drains to a reach that overflowed in wet weather in 2025" when the
  sewer trace passes the overflow's block.
- Data checks: GIS stations not in the ECA roster, and roster stations with no GIS point.

**Test.** 2025 parse returns 12 events with SAC references; Clarkson GO weir 944 m³ on 2025-04-02.

**Effort.** Small to medium. 1–2 days.

---

### 5. Station capacities from ECA 009-W601 (manual table)

**Already in the app.** Firm capacities from the 2020 Master Plan, Volume 4, Table 6, lake-based
system only (`data/ww-facilities.json`). Stations outside it have none.

**What it adds.** The approved capacity, with an instrument number, for the stations that decide
answers: the one over 85% of firm at build-out (Richards Memorial, 110%), the next highest (Silver Birch Trail, 75%), and
those on the sewer path of the largest sites.

**Source.** Access Environment, instrument 009-W601 and its amendments (the consolidated linear
ECA for Peel's collection system). Not reachable from automation; a person looks it up.

**Build.** Add to each entry in `data/ww-facilities.json`:
`"eca": { "number": "009-W601", "amendment": "YYYY-MM-DD", "ratedLps": null, "firmLps": null,
"forcemain": "", "checkedBy": "", "checkedOn": "" }`. A fill-in sheet:
`docs/redesign/eca-lookup.csv` with one row per station to check.

**App.** Wherever a station's firm capacity shows, use the ECA figure when present, label its
source, and show the Master Plan figure beside it when they differ by more than 10%.

**Test.** If `eca.firmLps` is set it wins in the capacity function; the label names the source.

**Effort.** Code: half a day. Lookup: an afternoon of manual work.

---

### 6. Compliance exceedances (already in): two small additions

**Already in the app.** `data/compliance.json`, 2020–2024, Peel's three plants, on the plant panel.

**Add.**
- A "flow" exceedance at any plant becomes a capacity flag in Needs attention (none for Peel in
  2023–2024).
- Keep the private and communal Peel rows (e.g. Osprey Valley Resorts, Alton) as "on a private
  system": a map marker and a note on nearby developments that they are not on the Regional system.

**Effort.** Small. Half a day.

---

## Wave 3: the approvals story

### 7. Zoning (Brampton first)

**What it adds.** The zone under each site, split-zoned parcels, interim control by-laws and
temporary-use by-laws. Insights: "needs rezoning" when the proposal differs from the zone; interim
control as a reason a file is stalled; zoned-but-vacant residential land as a second view of
To 2051.

**Source.** Brampton `COB/Zoning` MapServer (layers: Zoning, Split Zoned Properties, Interim Control
Bylaws, Temporary Use By-Law, Parcel Fabric). Found on `mapsdev.brampton.ca`, a development host:
confirm the production URL (likely `maps1.brampton.ca`, which the app already uses for permits)
before building. Probe Mississauga and Caledon zoning layers in the same run.

**Build.** Probe mode `zoning` (log only) → then `scripts/build-zoning.js` tagging developments
with `zone`, `interimControl`, `temporaryUse`. Do not ship the zoning polygons; tag only.

**App.** Records › a file: "Zone today: R1D; proposal needs rezoning". Find › Flags: "Interim
control area". Site card: the zone beside the OP designation.

**Effort.** Medium (three municipalities, three schemas). 2–4 days.

---

### 8. Ontario Land Tribunal case status

**Already in the app.** 64 records carry an appeal status; `scripts/probe-council.js` already pings
OLT e-status. Only one OLT case number (OLT-22-003367) appears anywhere in council data, and none in
application records.

**What it adds.** Hearing dates and outcomes, so "under appeal" becomes "hearing booked 2027-03" or
"decision issued, appeal allowed".

**Source.** OLT e-status, per case. No bulk download.

**Build.** Two steps. First, link: search e-status by municipal file number for each of the 64
appeal records and store matches in `data/olt-links.json` (reviewed by hand). Second, fetch status
for linked cases weekly into `data/olt.json`.

**App.** Site status line and Records history; Pace model treats a scheduled hearing as a date.

**Effort.** Medium, with access risk (the site may block automation). Do after 1–7.

---

## Wave 4: data quality

### 9. Statistics Canada Open Database of Addresses

**What it adds.** One normalised key per civic address, to merge the "possible duplicates" in
Records › Data checks (40 today, e.g. "10194 HEART LAKE RD (200) ↔ 10194 HEART LAKE RD (200)") and to
help the tree when files spell one site differently.

**Source.** StatCan ODA, Ontario file. Filter to Peel's three municipalities in the fetch step.

**Build.** `scripts/build-addresses.js` → `data/address-index.json` (normalised street + number →
point). The snapshot build uses it to add `addrKey` to records.

**App.** No new panel. The duplicate count should fall; the tree audit reports matches by address.

**Effort.** Small to medium. 1–2 days.

---

## Parked

- **Electricity headroom (IESO regional plans, Alectra, Hydro One).** PDFs, not data, and outside a
  water and wastewater screen. Revisit as a hand-entered note per area if planners ask for it.
- **Peel station service areas.** The open layer has the field (`WWPumpingStationServiceArea`) but
  it is empty for all 39 stations.
- **Brampton Schedule G densities.** No density field in the data (see item 3).

---

## Order and acceptance

| Wave | Items | Changes a number on screen? | Rough effort |
|---|---|---|---|
| 1 | 1 MECP flows · 2 observed ppu · 3 OP area and designation | yes: trigger year, population, target % | 4–6 days |
| 2 | 4 overflows and roster · 5 ECA capacities · 6 compliance flags | yes: station capacity; adds events | 2–3 days + manual lookup |
| 3 | 7 zoning · 8 OLT | adds status and flags | 4–7 days |
| 4 | 9 addresses | fewer duplicates | 1–2 days |

Done when, for each item: the build script runs in *Probe data sources*, the JSON has a source and
date, the app shows the source line wherever the figure appears, `npm test` covers the parser, and
`docs/redesign/captures/text/` is refreshed for the panels it changes.
