# How the numbers are worked out

Stages, the development trees, units, people, jobs and flows, the definitions, the checks and the screening rules. Part of the [Peel Growth Pipeline README](../../README.md); the other parts: [Using the app](../guide/README.md), [The data: sources, receipts, updates and deploys](../data/README.md).

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
**Employment** row with the non-residential floor area and estimated jobs. **Growth › Pipeline**'s full
table (*Build-out by dwelling type*) totals them for the developments shown.

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
are editable in the **Scenario** control (*Change the scenario › Design criteria › Floor space per job*; saved in the
browser; *Reset to Peel criteria* restores them) and every job count, employment demand and
summary updates. Shown as an **Employment** section in the development panel, the **Employment** land use under Find › What, and in the CSV export
(`employment_uses`, `nonres_floor_area_m2`, `est_jobs`).

## Aerial check (is it built?)

In each development's Servicing › Network (its *Site* fold), the app compares the site on the aerial photo from
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

**Records › Data checks** has a **Duplicate check**, recomputed from every record (filters ignored):

1. **Records:** raw records → copies of the same file merged (same file number across layers
   or spellings) → unique files → projects.
2. **Integrity checks** that must be 0: a file still listed twice, a file counted in more than
   one project, a file in no project.
3. **Unit reconciliation:** units on every record, minus each rule that removes a repeat
   (copies of a file, withdrawn files, repeat applications for one proposal, repeat permits for
   one building, permits already inside their planning application) = **units counted**, which
   equals the units counted with the Scenario control at its defaults (all units) and every filter off.
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
| **Left to build** | Planned − completed: units not yet built, permit issued or not. One figure on Growth, the Overview, Forecast, the stage chart ("not yet built") and the Scenario's **Units: left to build**. |
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

In the app, the project panel shows a build-out bar, and Find's *In view* list shows "planned, left
to build" on each row. The Scenario control's **Units** has **Left to build**: the figures can be
based on all units or units left to build (not yet completed). The CSV export includes every
build-out figure.

Run the tests with `npm test`.

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

Shown on the Capital › DC timing and funding tables (with "Online — draft, as of March 2026"), every DC
relief text (Servicing, the briefing, the memo), the planned-works map tooltip and the
development brief; a pause note heads each DC timing and funding table, the briefing's DC section and the memo's
DC needs. The CSVs carry an "Online (draft, as of March 2026)" and a "Capital status" column.
The analysis itself still replays the draft schedule: the status says how far to trust each date.

**One dollar year (2026$).** The DC Timing cost column was 2020$ and the funding views 2026$; all
are now 2026$: the 2020 study's costs indexed by the Region's DC rate indexing (×1.40 wastewater,
×1.35 water, August 2026 over 2020), and G.E. Booth's $130 M (2024$) indexed from 2024 at the same
average annual rate (≈×1.12).

## Screening wording and the public version

Results say what the screen shows, never what the Region should do (design audit, Group 2). One
set of labels (`PeelUtil.SCREEN`) is used on the Capital tab, the briefing, the memo, the workbook and
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

**Public version** (Settings › Reports › *Public version*, or add `?public` to the
link): hides the DC *Funding screen* and *Funding levels* (the DC funding lab's fold of Capital › DC timing), the
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

The Overview, Growth, the header, Servicing, Capital, every export and the executive briefing use
these definitions. In the app they're in the **Definitions** card (Overview ⓘ line) and at the top of the
Glossary (navigation phase 7).

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
  since 2021 in Growth › 2021 existing.
- **Employment demand:** jobs estimated from the floor areas on the applications (see
  Employment uses) × 250 L/employee/day water and 270 L/employee/day wastewater. Wastewater is
  peaked with Harmon on the employee count, kept between 2 and 4; I&I is added on the boundary
  of purely non-residential sites (mixed-use sites already count theirs with the dwellings).
  Employment space has no unit-level build-out, so a project's jobs count by its phase
  (committed = approved to under construction; completed once the project is completed).
  Shown as the Employment and Total rows of the water and wastewater tables in a drawn area's
  *Residential / employment split* and of Servicing › Capacity's water *Demand flows*, as
  Employment rows and a combined total in each project's servicing table, as a one-line summary
  in the project's Employment section, in the by-phase breakdown, and in the CSV (`emp_water_avg_lps`, `emp_wastewater_peak_lps`). Residential and employment peaks are
  computed separately and added, as in a servicing report. Projects whose descriptions state no
  floor area have no jobs and so no employment demand.

Every value can be edited in the app, and your edits are kept in your browser. These numbers
are planning-level estimates, not a substitute for a functional servicing report. Check the
values against the current Region of Peel standards; a 2025 edition of the Linear Wastewater
Standards is listed on the Region's site.

## Site constraints: gas, hydro, watercourses, regulation limits

Switches in *Layers › Constraints* draw site constraints
(regulation limits, floodplain, Greenbelt, Oak Ridges Moraine, Niagara Escarpment, PSW / ANSI, the
Natural Heritage System and watercourses). Watercourses show from zoom 12. Hover a line or area for
its name; click it for its card (owner, as-of date, source). Each layer has a short note in the legend.
The gas pipeline and hydro line layers are removed (Stage 2); the table and notes below record the
first build's four layers.

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
- the development's Overview and Servicing tabs, and its demand by stage
- the sewer and water traces
- Servicing › Capacity and Network
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
- The development's Overview and Servicing steps open the development only once, then pick the
  tab. Opening it again had reset the tabs, so those steps pointed at nothing.
- On a phone, steps whose panel is hidden or off screen (More settings, Find, Watch)
  point at the button that opens it.
- The card sits beside the tool rail instead of over it.
- The step text matches the hidden pipe results.

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
  note says *Counted from its permits* (or *Counted from its files and permits*: why). Counting is
  the Scenario control's (Count, Units).
- The Scenario control lists *Units per development: tree count* (so does the top-bar chip's hover),
  and exports say "counting: All units (tree count)". Share links carry the same scenario.
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

Growth › Areas' full table has the **By plan** roll-up (`js/plan-tables.js`). It shows the developments on screen
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

Under Table 1 in Growth › Areas' full table, the plans run down the side: each municipality's plans and
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

The plant capacity tables use census-relative layers; see Servicing › Capacity.

**Workbook:** a new **Plan × servicing** sheet holds both matrices.

## Population tables, C4: plans against their targets (Table 2)

Growth › Areas' full table has a third table, **Plans against their targets**.
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
- **Stage bar** (Home › Growth › Areas):
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
- **Repair and replacement work adds no homes (`js/phases.js` `isRepairWork`, decided 2026-11-03).**
  - **Why:** Mississauga's maintenance permits state the suites they touch: "IN-SUITE KITEC PIPING REPLACEMENT FOR 337 SUITES" (4080 Living Arts Dr), "REPLACE FURNACE FOR UNITS 1 2 5 8 … - 13 UNITS TOTAL" (5955 Creditview Rd). Their refs (`PLU/BLDG`, `HVACHOUS`) passed the ref filter and "in-suite" read as a second suite, so about 800 such units counted as homes built by permit alone.
  - **Rule:** a permit whose description or scope names piping (Kitec), plumbing, a furnace, HVAC or boiler, balconies, windows, a roof, a fire alarm, sprinklers, elevators, re-cladding, or any repair or replacement adds no units and builds nothing (role `none`), unless it names a new home: a second or third unit, a basement unit, a duplex or triplex, "new / replacement … dwelling / house / building", construct or erect. `SEC UNIT` and `ARU` permits always keep their units. "In-suite" is no longer read as a suite.
  - **Effect on the 2026-10-23 data:** infill 29,153 → 28,346 (−807; Mississauga 4,879 → 4,077); built since census 34,894 → 34,083 (−811); completions by year −802 in Mississauga and −21 in Caledon. Also dropped: Caledon "Revision Permit — revised window headers" records, which repeated their base permit's townhouses under another number (−17 permitted and completed on build-out), septic repairs, and rooftop HVAC units on commercial and industrial buildings (`nonres` → `none`). 21 permit-only sites made of repair work alone are no longer developments.
  - **Test:** `tests/repair-permits.test.js`.
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

- **Site brief (for the servicing review).** On a development's **Capital** tab, and in its
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
  - **Copy for review comments** (the footer of its Capital tab) puts the whole brief on the clipboard
    as plain text, one line per item with its project page and the sources' dates. If the browser
    blocks the clipboard, it is saved as a text file.
- **To check (for the planner).** At the top of Capital › Projects, and in its full
  table, worst first:
  1. EAs complete 9+ years with no construction following them.
  2. Contracts past their completion target with no completion date (how long past).
  3. EAs marked current with nothing dated ahead and no milestone in 18 months, or none published.
  4. Open contracts not updated in the year before the layer's latest update, or never dated.

  Each item says why it is listed and what to check. It follows the map's municipality. **CSV of this
  list**, and a **Capital to check** sheet in the workbook.
- **CSV: every contract** (Capital › Projects, its footer and full table). One row per contract (a
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
