# Peel Growth Pipeline — redesign spec

Reviewed on main at `fa6faee` (C4, 2026-10-15) on desktop at 1440×900, headless Chromium, every tab and
sub-tab, all four map lenses, 13 layers one at a time, zoom 10–18, and clicks on a plant, pressure
zone, block, pumping station, DC facility, DC main, sewer pipe, planning area, permit record,
application record, the seven site tools, Compare and Present. Four sites were walked end to end:
9763 Heritage Rd (greenfield block, Brampton), 1580–1650 Dundas St E (high-rise, Mississauga),
14337 Hwy 50 (greenfield outside the mapped zones, Bolton), 12489 Dixie Rd (employment only,
Caledon). Raw captures are under `captures/`; the design boards under `boards/`.

This file is ordered for implementation. Do the phases in order: each later phase assumes the
earlier ones, and the first two are what make the numbers trustworthy.

---

## 0. Principles

1. **Two ladders, kept apart.** *Phase* is where a file is in the approvals process (1–7).
   *Layer* is whether its demand counts against capacity and how firmly
   (Existing → Built → Committed → Proposed → Anticipated → To 2051). Phases colour markers;
   layers colour bars. Every development has one phase; its units land in exactly one layer by a
   published mapping (§2).
2. **One capacity function.** Every % of rated / firm, every reserve and every trigger year on
   every tab comes from the same function with the same inputs. No tab computes its own.
3. **One destination for clicks.** Anything clicked on the map opens in the right panel as a scope
   (trail updates, left panel filters to it). No Tool-result tab, no sheet over the left panel.
4. **Same five tabs at every scope.** Overview · Growth · Servicing · Capital · Records, for Peel,
   a municipality, a plan, a plant, a zone, a block, a station, a development, a single file.
   A sub-view with nothing to show at that scope is hidden, never a "shown when no site is
   scoped" message.
5. **Every number says its basis once.** A header line per panel ("tree count · all units · Peel
   criteria v2.0 · 2025 flows · layers: E+B+C+P"), one disclaimer at the bottom, not two per tab.

---

## 1. Phase 0 — data fixes (do first)

Each item: evidence → rule → acceptance test. Tests go in `tests/`.

### 1.1 A permit can only commit the file whose boundary contains it
- **Evidence.** 9763 Heritage Rd shows *Under construction*, 9,862 units, set "from 22-234447-000-00":
  one detached house at 9362 Heritage Rd, occupancy 2022. The record sheet for permit
  21-277241-000-00 (59 Dairymaid Rd) is in the same tree through C05W07.006, a 1990s subdivision.
  The cascade: block counted as Committed → Clarkson reserve 123 → 112 ML/d → Pipeline 6,913
  committed vs 916 proposed in the area.
- **Rule.** In `js/tree.js` / `js/dev-verdict.js`: a permit sets the phase of (and commits) only the
  planning file whose boundary contains its point, and only if that file is a draft plan / site plan
  (not a block or precinct plan). The development's phase is derived per file, then summarised;
  the block never inherits one file's phase. Permits older than the file's first submission follow
  the existing "permit before the planning approval" rule.
- **Test.** `Brampton|2055 BOVAIRD DR W` phase = Under review; layer of OZS-2025-0032 = Proposed;
  no unit of OZS-2025-0034 or OZS-2025-0032 is Committed; C05W07.006 (52 units, Closed Approved) is
  Committed.

### 1.2 Council decisions feed the phase
- **Evidence.** 9763 Heritage: status "Under review · next milestone Approved" while *Latest
  decision* two lines below reads "By-law 153-2026 passed, 2026-09-09".
- **Rule.** A passed zoning by-law moves the file to *Zoning approved* (still phase 2 for the
  ladder, layer Proposed), shown as the status. A draft plan approval or registration recorded in
  council items moves it to phase 3.
- **Test.** OZS-2025-0032 status text contains "By-law 153-2026"; phase 2; layer Proposed.

### 1.3 Stalled clock uses every event, and appeals are not stalled
- **Evidence.** 1580–1650 Dundas St E: "Stalled 4.1 yrs" from the last file event (2022-09-21) while
  a Planning & Development Committee item was carried 10–0 on 2023-09-18, and the file is at the OLT.
- **Rule.** Stalled = no file event, council item or permit in 2+ years. A file under appeal is
  *Under appeal*, never Stalled. "Stalled 2+ yrs" is 734 of 1,485 today: it is a sub-split of
  Proposed (active · stalled · appeal), not a flag.

### 1.4 One capacity function
- **Evidence.** Inglewood 398→495% (Overview) vs 45% (Wastewater); South Peel water 48→48%
  (Overview) vs 54→67% (Water) vs 60→75% (DC); G.E. Booth 120% / 121% in one session; G.E. Booth
  reserve 30.4 ML/d (sites), 26.4 (pre-merge Overview), −21.4 (Allocations).
- **Rule.** `js/capacity.js` (new): `capacity(facility, layers, scenario)` →
  `{rated, firm, existing, built, committed, proposed, reserve, pctCommitted, pctBuildout, triggerYear}`.
  Overview, Water, Wastewater, DC, scope cards and site "% of reserve" all call it. Plants use the
  2025 metered flow as *Existing* (it already contains Built); zones, blocks and stations use
  census + built.
- **Test.** For each facility in `data/servicing.json` and `data/water-facilities.json`, the value
  shown on every tab is identical to the function's output (snapshot test over rendered text).

### 1.5 Site share of a reserve says its basis
- **Evidence.** Dundas St E: 27.6 L/s average (2.4 ML/d) against a 30.4 ML/d reserve = 7.8%, panel
  says 10%. Heritage: 0.74%. Both are population at the plant's measured per-capita rate
  (~373 L/cap/d), while the flows beside them are at design criteria (~292 L/cap/d).
- **Rule.** Show "10% of reserve (population at the plant's measured rate)" or show the flow at
  that rate next to it. The *Share* column in every "Developments loading it" table is labelled
  "of growth (people)".

### 1.6 Unit counts: one basis per screen, and show the gap
- **Evidence.** Heritage block: 9,862 (Overview, Peel table) · 6,289 planned / 6,236 left
  (Developments list, record sheet) · 6,236 (Pipeline, Site). Peel: 228,490 planned vs 202,557
  dwellings that land in a layer; left-to-build 219,299 (Pipeline) vs 222,511 (Timing).
  Completions fell 9,060 → 5,792 (≈944 → ≈653/yr) when the tree became the count.
- **Rule.** `p.units` is the tree count everywhere; "previous" is only in Settings › Counting.
  The block total must reconcile: draft plans with a stated count (6,289 + 592 + 52 = 6,933) plus
  an *explicitly labelled* estimate for files without one (OZS-2024-0051), never a silent 2,929.
  Check which permits the tree drops before trusting the completion pace.
- **Test.** For every development, `sum(file counts) + labelled estimates == p.units`;
  Growth › Pipeline "left" == Timing "unbuilt" == planned − completed.

### 1.7 Area and I&I follow the scope
- **Evidence.** Block (9,862 units): I&I 11 L/s (284 − 273). Single draft plan (592 units, 101.5 ha):
  26.4 L/s. Employment site: I&I 60.5 L/s = 66% of peak wet.
- **Rule.** Infiltration uses the area of the files being counted; show "I&I x L/s over y ha
  (z L/s/ha)" wherever peak wet is shown.

### 1.8 Zone assignment outside the mapped zones
- **Evidence.** 14337 Hwy 50: Zone 6 (summary, reservoir check), Zone 7A (ground elevation
  text), Zone 7 (pumping chain, North Brampton HLP7C).
- **Rule.** One `estimateZone()` result used everywhere, returned with its reason
  (`nearest` | `elevation-band` | `planned-main`) and shown once as a flag. Decision needed: nearest
  by distance or elevation band (the pumping chain already uses the band).

### 1.9 Small ones
- Wastewater tab shows the water-zone message (Heritage, Hwy 50) — copy bug.
- DC tab: "Outside the existing network" and "site is on the existing network" both appear.
- "Looking up the nearest watermains / hydrants / sanitary sewers…" never resolves without the
  ArcGIS host: add a timeout and a "couldn't load · retry" state.
- "Built since 2021": +14,831 people / +5,096 dwellings (Growth › Pipeline, pipeline sites only)
  vs +98,797 / +33,524 (Census & 2051, every permit). Same label, one definition.
- Flags: "PS over firm capacity 0" while Richards Memorial PS reads 110%; "Waiting on DC works 0"
  while Capital says 234,100 people wait on works. Flags must count the same things the panels show.
- Employment sites: no "persons per unit", no "room in units", no "Tree count · –"; add the
  non-residential DC rate (per m² GFA) from the same rate schedule.
- DC estimate: when unit types aren't stated, show a range (small apartment → townhouse), never
  the cheapest rate silently (Dundas St E: all 3,027 at "Apartment ≤750 sq ft").
- Present mode label "all of Peel · 52: Heritage Heights"; its 26,722 units vs 26,525 in By plan.
- Project key `Brampton|2055 BOVAIRD DR W` titled "9763 HERITAGE RD": a multi-address tree gets a
  block title ("Heritage / Bovaird block · 3 draft plans").

---

## 2. Phase 1 — the layer function

`js/layers.js` (new, pure, tested). Input: a development (its files, permits, events) and the
scenario. Output per file and per development: `{layer, units, people, jobs, confidence}`.

| Layer | Represents | Rule | Counts in |
|---|---|---|---|
| Existing | on the system today | 2021 Census; plants: 2025 metered flow (contains Built) | D-5-1, build-out |
| Built | demand not in the census yet | permits completed after May 2021 (completion estimated from issue date where none is published) | D-5-1, build-out |
| Committed | capacity the Region must supply (Procedure D-5-1) | draft plan or site plan **approved**, registered, permit issued, under construction. Zoning/OPA approval alone does not commit. A permit commits only the file whose boundary contains it | D-5-1, build-out |
| Proposed | under formal review | OPA/ZBA/draft plan/site plan filed, not approved; sub-split active · stalled 2+ yrs · under appeal | build-out |
| Anticipated | early signals | pre-consultation, block and precinct plans with no formal file (210 developments) | stress test only, hatched |
| To 2051 | plan allows, not yet applied for | Region allocation (municipality) or published plan target − the layers above; density estimate where neither exists | master-plan view |

Phase → layer: 1 Inception → Anticipated · 2 Under review (incl. zoning approved, appeal) →
Proposed · 3 Draft/site plan approved → Committed · 4 Permit → Committed · 5 Construction →
Committed · 6 Completed (after May 2021) → Built · 7 Withdrawn → none.
Rename phase 3 from "Approved" to **"Draft / site plan approved"** so the word stops colliding with
zoning approval.

Confidence is cross-cutting: `stated` (on the file) · `summed` (children) · `estimated`. Estimated
portions are hatched in every bar.

**Scenario chip** (replaces the read-only scenario line, which appears twice today): the basis is
a set of layers. Existing + Built are always on; Committed = D-5-1 check; + Proposed = build-out;
+ Anticipated = stress test. Also: flows (2025 metered), criteria, count (tree/previous),
expansions on/off, outside-zones rule. The same swatches appear on every bar.

**Encoding.** One hue, lightness = certainty: Existing `#3b4a5e`, Built `#5f7fae`, Committed
`#9cc0fa`, Proposed `#cfe0fb`, Anticipated hatched `#cfe0fb`, To 2051 dashed outline. Reference
marks: 90% trigger white tick, 100% rated grey tick, beyond-rated red hatch
(`repeating-linear-gradient(135deg,#f0665f 0 3px,transparent 3px 6px)`). Plants keep their hue
(`--pl-booth`, `--pl-clarkson`, `--pl-inglewood`); layers never use hue. Add the tokens to
`css/app.css` (`--ly-existing` … `--ly-anticipated`).

**Where layers show** (each a stacked bar from the same component):
1. every capacity bar (plant, zone, station, block, site % of reserve) with reserve to 100%;
2. Growth › Pipeline strip: Peel today = built 5,096 · committed 55,033 · proposed 142,428
   dwellings on 450,746 census (and by dwelling type × layer);
3. By plan: per row committed | proposed | to-target;
4. bottom timeline: year bars coloured by layer;
5. Pace: expected by 2031/2041 split by layer;
6. Capital: growth waiting on works, committed vs proposed;
7. site badge: phase *and* layer ("Zoning approved · counts as Proposed");
8. list rows and "Developments loading it" tables carry the layer name.

**Tests.** Every development: exactly one layer; sum over layers == Peel totals on the Overview;
`Brampton|2055 BOVAIRD DR W` → Proposed; Embleton & Heritage (C05W06.007, 537 units, under
construction) → Committed with 343 left; a 2021 completed permit → Built.

---

## 3. Phase 2 — click destinations and scope

Today: polygon → right panel; plant/zone/block/station → right panel scope (good);
DC facility / DC main / sewer pipe → "Tool result" tab (`js/dc-infra.js showFacility`,
`js/masterplan.js showDcLine`, `js/sewer-cap.js showPipeLoads`); permit/application marker →
`#detail` aside over the **left** sidebar (`js/aerial-check.js showRecordDetail`).

- Everything opens through `PeelSvcScope.open(ref)` or `DevScope`, in the right panel, with the
  trail (`#trail`) updated and the left panel filtered to the scope. Add scope kinds `dcwork:<id>`,
  `pipe:<i>`, `file:<uid>`.
- Delete `#pane-tool` and the `#detail` aside once all producers are moved.
- A single file (`file:` scope) renders `boards/RecordSheet.dc.html`: units of that file alone
  (592 for OZS-2025-0032, which the marker click already shows today), its flows, "counts as"
  layer, its tree links, "Open as a development / See its tree / City record".
- One hover card for every feature (name, the one number that matters, Open scope / Trace), see
  `boards/MapControls.dc.html`.
- Site tools: Trace sewer / Trace water / Check FSR stay as buttons; Memo, Record allocation,
  Compare, Export move into a ⋯ menu. Check FSR is the best tool in the app: keep it one click away.

---

## 4. Phase 3 — the shell

Board: `boards/Desktop.dc.html` (composite), `boards/TopBar.dc.html`, `boards/Left.dc.html`,
`boards/MapControls.dc.html`.

**Top bar.** Title · scope trail with its count · lens switch (Planning / Water / Wastewater /
Capital) · Scenario chip (§2) · Export ▾ · Present · ? · ⚙. The lens sets the map layer preset,
marker encoding and legend only; it no longer changes which tabs exist (today Peel in Planning
has no DC tab; a selected site gets 7 tabs).

**Left panel = find.** Tabs *Find · Watch · Data*.
- Result count first, active-filter chips, "Reset n filters", "Save this view".
- Stage: stacked bar + 5 toggles, then Completed (with how many finished since the 2021 census: the Built layer) and Withdrawn / refused as their own buttons; Completed is on by default, Withdrawn / refused hidden (was one hidden "Done / gone" button)
  (today the greyed counts read as a mismatch with the 1,485 header).
- Where / What / When / Counts as / Flags as collapsed rows that show their current value.
  "Counts as" = layer chips (Built 471 · Committed 710 · Proposed 565 · Anticipated 210, by the
  phase mapping).
- Flags counted from the same data the panels show (§1.9).
- The **In view · n of N** list moves here from the right panel (`js/render-list.js` already
  filters by `map.getBounds()`); each row shows units, left, layer.
- *Watch*: watched sites + real changes; backfill (1986–1994 site plans surfacing as "New ·
  Completed") goes to Data › Sources. *Data*: checks and duplicates first; source × buttons behind
  "Advanced".

**Map.** Layers collapse into a chip → grouped popover (Growth / Servicing / Capital &
constraints) with zoom thresholds stated on the layer ("Existing pipes · from zoom 15"); Legend
chip names the marker unit for the lens ("51k" bubbles in Water mode have no unit today) and
offers "Colour sites by: Phase | Layer"; an **In view** chip with "filter to view"; one hover card.
Clusters < 14, dots and labels ≥ 14, imagery ≥ 12, existing pipes ≥ 15, gas/hydro ≥ 11,
watercourses/regulation ≥ 12 — unchanged, but stated.

**Bottom bar.** Timeline only (milestone select, range, histogram coloured by layer, collapse).
Data date and version at the right. The footer scenario line goes.

---

## 5. Phase 4 — right panel, same five tabs at every scope

Boards: `PeelOverview`, `PeelGrowth`, `PeelServicing`, `PeelCapital`, `ScopeCard`, `RecordSheet`,
and for a development `Main`, `Servicing`, `Tree`, `Phone`.

| Tab | Peel / municipality / plan | Plant · zone · block · station | Development | Single file |
|---|---|---|---|---|
| Overview | 4 tiles with layer sub-labels · Needs attention (Capacity / Stalled / This week, counted) · Capacity at build-out (one bar set) · Where the growth is · Largest unbuilt (one list) · reports | status pill · 3 tiles + layered bar · servicing ladder with % on every rung · developments loading it (layer, people, peak, share-of-growth) · planned works | "n things to confirm" (computed per site: layer, zone ambiguity, paused works, unassessed pipes, appeal, I&I) · build-out (units · people · ppu · mix bar) · water / wastewater side by side + peak-wet composition bar · approvals timeline · DC + share-of-area cards | aerial · units/people/share tiles · what was filed · read-as + counts-as · demand of this file alone · tree links |
| Growth | pipeline strip by layer (+ the 228,490 vs 202,557 gap) · By plan tree with target bar per row · Pace · Census | the area's pipeline by layer | "around this site": the area's pipeline, this site's share | — (hidden) |
| Servicing | plant bars (layered) · stations over 85% · water supply / pumping / storage · zones | the scope's ladder and loads | water + wastewater, elevation strip for outside-zone sites, pump chain with firm, path to plant, I&I with area, couldn't-load states | this file's flows |
| Capital | pause notice · 4 tiles · runs-out vs online · growth waiting on works by layer · DC rate table incl. non-residential · Funding screen / levels (Peel only) | works in the catchment | works this site needs, each with paused chip · DC estimate (range when types unknown) | — |
| Records | sources, checks, duplicates | — | tree with per-file layer and link confidence · block vs draft-plan switch · unexplained-count card · weak-link decision · history | the file |

Remove: the *Development* tab (duplicate of Overview); duplicate disclaimer and banner; the second
"Largest" list; plans with 0 units in By plan (behind "show empty"); the approval-pace column until
it has data; the `Growth › Census & 2051` / `Timing` and `DC › Funding screen` / `Funding levels`
placeholders at site scope.

**Site templates by type** (tiles follow the site):

| Type | Build-out | Servicing | Funding |
|---|---|---|---|
| Residential | units · people · ppu | water + WW columns | DC by dwelling type |
| Mixed-use | units · people · jobs · GFA | same, jobs' share noted | residential + non-res DC |
| Employment | jobs · GFA · site area | same, I&I called out | non-res DC per m² |
| Outside mapped zones | + zone-ambiguity flag | elevation strip; one zone everywhere | — |

---

## 6. Boards index

`boards/canvas.json` is the layout; each `*.dc.html` is a self-contained page (open in a browser;
the `support.js` reference is the canvas runtime and can be ignored). Colours and fonts match
`css/app.css` tokens (IBM Plex Sans / Mono).

| Board | Shows |
|---|---|
| Desktop.dc.html | 1440×900 composite at Peel scope |
| Layers.dc.html | layer vocabulary: ramp, definitions, phase mapping, scenario chip, the same bar in four places |
| TopBar.dc.html | top bar (scope Block 16) and bottom timeline |
| Left.dc.html | Find panel, with Watch and Data sketches |
| MapControls.dc.html | layers popover, legend, in-view chip, hover card, tools |
| PeelOverview / PeelGrowth / PeelServicing / PeelCapital.dc.html | the four Peel-scope tabs |
| ScopeCard.dc.html | Clarkson WRRF as a scope; notes for zone, block, station, DC work |
| RecordSheet.dc.html | OZS-2025-0032 as a single file |
| Main / Servicing / Tree / Phone.dc.html | 9763 Heritage Rd at site scope |

Every figure on a board is from `captures/` or is a correction listed in §1, except three marked
placeholders: Watch count (2; real 0), "Waits on paused works ≥2", `[ADD RATE]` for non-residential
DCs.

---

## 7. Open decisions

1. Outside the mapped zones: nearest zone by distance, or the zone whose elevation band contains
   the ground? (The pumping chain already uses the band.)
2. Should "approved, no permit" Committed units age out (e.g. draft plan approvals older than
   3 years shown separately)?
3. Anticipated visible by default (hatched) or opt-in?
4. Lens switch: map only (as drawn) or also the default right-hand tab?
5. Developments list in the left panel (as drawn) or kept as a right-hand tab?

---

## 8. Acceptance checklist

- [ ] `Brampton|2055 BOVAIRD DR W`: Under review · zoning approved · counts as Proposed · block
      title names 3 draft plans · reconciled count with labelled estimate.
- [ ] Same facility, same % on Overview, Water, Wastewater, DC, scope card, site.
- [ ] Inglewood, South Peel water, G.E. Booth reserve: one number each.
- [ ] Flags "Station over firm" ≥ 1 (Richards Memorial 110%), "Waiting on DC works" > 0.
- [ ] No `#pane-tool`, no `#detail`; every click lands in the right panel with the trail updated.
- [ ] Five tabs at every scope; no placeholder sub-views.
- [ ] One disclaimer per panel; scenario line shown once, as the chip.
- [ ] Layer bars use the tokens; hatched = estimated or anticipated; red hatch = beyond rated.
- [ ] `npm test` passes with the new `tests/layers.test.js`, `tests/capacity.test.js`,
      `tests/tree-permit-boundary.test.js`.
- [ ] `npm run lint` clean.
