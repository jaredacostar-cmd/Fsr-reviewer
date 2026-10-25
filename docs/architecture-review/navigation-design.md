# Navigation redesign: judgement of three designs and one recommended design

Part 3 of [the architecture review](../architecture-review.md), in full. Reviewed at `60cd0e3`
(2026-10-25, with the Part 0 fixes; `node --test tests/*.test.js`: 1,434 pass). All `file:line` refs are
at that commit.

Three independent designs were written from the same brief and the mapping passes: **spec-faithful**
(docs/redesign/SPEC.md §0 binding), **scope-first** (pages and map tabs as one system) and **task-first**
(the ten tasks in docs/design-audit.md §9). They are not in the repo; this file scores them and gives
the recommended design built from the best of each. Inputs also included the completeness critic's list
of contradictions, docs/redesign/SPEC.md §0 and §3–§7, and docs/design-audit.md §8–§10.

Every claim that decides a score was checked in code (section 1).

**Counting rule for clicks** (used for all four columns, so the designs can be compared):
- Start on Home at 1440×900.
- Typing is free, and so is focusing a search box that is already on screen.
- Each tap on a control, suggestion, row, tab, chip or menu item counts 1, and so does a drawing gesture.
- Task 2 counts the zone part, task 3 the full list, task 7 a drawn area's horizon split, task 8 the list of developments that rely on the project (not the delay), and task 9 a draft you can see on screen.
- The designers counted differently (spec-faithful counted a click into the search box; task-first did not), so their own totals are not comparable. Section 6 recounts them all.

---------------------------------------------------------------------------------------------------

## 0. Verdict in brief

| Design | (a) duplication | (b) clicks | (c) SPEC §0 | (d) compat | (e) risk/cost | (f) names | Total /60 |
|---|---|---|---|---|---|---|---|
| spec-faithful | 8 | 7 | 9 | 7 | 6 | 7 | **44** |
| scope-first | 9 | 7 | 7 | 9 | 4 | 6 | 42 |
| task-first | 6 | 9 | 6 | 8 | 8 | 5 | 42 |

**Base: spec-faithful.** It removes the second navigation on the right terms: a page and the full map become two hosts of the same scope, with the same five tabs and the same chips. It does this inside SPEC §0 without the highest-risk mechanics.

What I grafted from the other two:
- **From task-first:**
  - one search on every page, Home included, routed by what it finds (a file number opens Records, a plan opens the plan's scope, a facility opens its scope, a DC project opens the project);
  - the site Overview carries the sewer path and names the DC projects;
  - "first zone limit" on Home;
  - Inquiry draft as a visible site action;
  - the "DC projects" and "Construction" names;
  - its migration order: the first steps touch no renderer;
  - role shortcuts that carry the old page names.
- **From scope-first:**
  - the alias registry and a test that lists every old link;
  - the `nav=2` marker (old links always carry `t`);
  - the `keepDev` fix (results started from a development close it today);
  - Old pipes as a Servicing view;
  - FSR review as a Servicing view at a development;
  - the DC project as an object scope whose Overview lists the developments relying on it;
  - "Open the map" and "← Page" keeping scope, tab and view.
- **Rejected:**
  - spec-faithful's new left-panel Data tab (the owner already moved Data into Records, README:1557-1558);
  - scope-first's removal of Watch, its no-sidebar Home, the live map beside every page, and the Where/When renames;
  - task-first's page section bars that differ from the map's tabs, and its "Summary"/"Files" second names.

Verified facts that moved scores:
1. **Task 7 already works today.** A drawn selection opens `sel:selection` with `devKeys` (measure.js:79). Those keys filter `state.filtered` (app.js:327, via svc-scope.js:56), and the Forecast runs on the filtered set (timing.js:554). Only scope-first counted it as possible; spec-faithful and task-first call it "not available" or "new".
2. **`ss=` already writes item refs.** share.js:57 drops only result refs that are *not* `pipe|file|dcwork|iiblock|ea|cap`, so those six are written. Spec-faithful's owner decision 11 ("make item scopes shareable") rests on a misreading.
3. **A moved sub-view is silently dropped from old links.** share.js:134-135 apply `svs` / `rs` only when the value is still valid. Spec-faithful found this; task-first fixes only `svs=checks`; scope-first routes everything through its registry.
4. **Every link carries `t`** (share.js:42). A page host that obeys `t` would open an old `#w=p:home&t=svc` link on Servicing. Only scope-first saw this, and its fix is the `nav=2` marker.
5. **The Inquiry draft closes the development.** `openResult` closes it unless `keepDev` is passed (svc-scope.js:92), and no caller passes it (grep: one hit, the check itself). Both draft paths call `openResult` (tools-inquiry.js:208; topbar.js:225 calls it again). On a page the panel hosts are emptied (panel.js:177), so the draft is drawn out of sight. Scope-first found this; I verified the code path but did not run it.
6. **Search already finds plans, MTSAs, plants, zones, catchments, blocks and DC projects** (search-filter.js:120-150). File numbers resolve only to a development (search-filter.js:99). What is missing is routing on pages and a file-level hit, not plan search.
7. **Home has no search below 1,600 px.** The box sits in `#tb-search` only at min-width 1600 (topbar.js:376). `#page-search` exists only on the Find step and the Explore bar (ws-pages.js:616, :665).
8. **Home's Needs attention rows open the bare Servicing capacity page** (`toPage('tight', needs)`, ws-pages.js:519, :553), not the facility.
9. **The hidden Watch copies are already gone at HEAD.** App.js:766 only writes the backfill note; `#changes`, `#ce-week-panel` and `#week-count` are removed. Spec-faithful's "4 This week renderers" and its "three badges" risk are stale. Two live builders remain: `weekSpec` (workspaces.js:415) and `week()` (ws-pages.js:1024).
10. **The Ledger has 4 cut-offs and the Scenario Count has 3.** Ledger: Committed only · + Plan approved · + In review · Everything (ledger.js:26-31). Scenario Count: committed only · + in review · + pre-application (layer-bar.js:151). "+ Plan approved" has no Scenario step.
11. **The test pins are heavy.** Across 178 test files there are 1,943 `assert.match` / `doesNotMatch` calls, 443 of them of the form `assert.match(src(…))`. Twenty files pin navigation names:
    - workspaces, four-tabs, five-tabs, reference, pilot, vocabulary, nav-firstrun, ws-pages, sections;
    - site-scope, devtab, capital-ea-ui, analysis-tabs, approvals-guide, forecast-stage, layer-groups, map-readability, nav-connect, organization, plain-language.

    tests/vocabulary.test.js:54-62 fails if Help or MOVED names a "Tab › Sub" that is not a chip in index.html, so every rename spreads to tips.js in the same PR.

---------------------------------------------------------------------------------------------------

## 1. Claims checked against the code

| Claim | Design(s) | Verdict | Evidence |
|---|---|---|---|
| Home sidebar: 9 entries, 4 team headings (+ Labs, Reference), Full map, Start-screen select | all | true | workspaces.js:74-79 GROUPS; :449-466 sideHTML |
| 25 page sections in 5 bars + Explore views bar | spec-faithful | true | sections.js:22-66 (SITE 6, AREA 4, servicing 4, reference 6, capital 5); workspaces.js:467 viewsHTML |
| 28 page ids | all | true | ws-pages.js:1275 BUILD |
| Area sub-views today: 15 (TABSUBS) / 14 shown at area | spec-faithful 15, task-first 14 | both right | analysis-tabs.js:49-54 (4+4+4+3); HIDDEN.area hides records:files (:61-64) |
| HIDDEN knows only site and area | all | true | analysis-tabs.js:61-64 |
| ≤4 rule tests TABSUBS valid length, not only chips per scope | scope-first | true | tests/four-tabs.test.js:139-146 (`s.valid.length <= 4`) |
| Unknown page id → Home; unknown `w=p:` → full map | spec-faithful | true | workspaces.js:435; :139 startScreen |
| `svs` / `rs` silently dropped when the value moved | spec-faithful | true | share.js:134-135 |
| Item refs not written to `ss=` | spec-faithful | **false** | share.js:57 writes `pipe|file|dcwork|iiblock|ea|cap` |
| Old links always carry `t` | scope-first | true | share.js:42 |
| `openResult` closes the development; no caller passes keepDev | scope-first | true (path read, not run) | svc-scope.js:92; tools-inquiry.js:208; topbar.js:225; panel.js:177 |
| Search finds plans, MTSAs, plants, zones, catchments, blocks, DC projects | spec-faithful ("needs plan names") | already present | search-filter.js:120-150 |
| File-number hit folds into the development | task-first | true | search-filter.js:99 |
| No search on Home below 1,600 px | spec-faithful, task-first | true | topbar.js:376; ws-pages.js:616, :665 |
| Needs attention rows open the bare tight page | task-first | true | ws-pages.js:519, :553 |
| First 90% trigger is plants only | task-first (zones need a new figure) | true | ws-pages.js:484-487 |
| Forecast for a drawn area not available | spec-faithful, task-first | **false** | measure.js:79 → svc-scope.js:56 → app.js:327 → timing.js:554 |
| Hidden #changes, #ce-week-panel, #week-count | spec-faithful (as live) | **stale** | gone at 60cd0e3: index.html:166-180; app.js:766 |
| Data tab already folded into Records | scope-first, task-first | true | README:1557-1558 "(the old Data tab)" |
| Lens opens a tab | all | true | topbar.js:41-43; pages hide the lens, css/app.css:3186 |
| Exports scrape panes by id | all | true | exports.js:144-153; :256-257 (#wcap-body, #water-body, #wfac-body, #plants-body, #ww-body) |
| 12 ws-mode chips | all | true | workspaces.js:322-327 (WS list) |
| Two roles lists, 5 and 4; no QA/QC role | all | true | tips.js:41-47 TOUR_ROLES; :183-188 ROLES |
| MOVED rows that become wrong | all | true | tips.js:139 (Water › Facilities), :145 (Checks), :146 (Projects workspace), :147 (Construction → Projects); pinned by pilot.test.js:103-107 |
| `max-width: 700px` blocks | spec-faithful 38, others 36 | 38 | `grep -c` css/app.css |
| Allocations is a plant-level register (room after allocations, CSV in/out) | spec-faithful, scope-first fold it | true | demand-ui.js:123-150 |
| Hydraulic check = EPANET on the mains feeding upper zones | spec-faithful places it in Network | true; labs.js:14 still says "Servicing › Model checks" | info.js:135; labs.js:14 |

---------------------------------------------------------------------------------------------------

## 2. Scores, criterion by criterion

### 2.1 spec-faithful: 44

| Criterion | Score | Why |
|---|---|---|
| (a) duplication / nesting | 8 | Sidebar 9 → 5; 25 page sections → 0; Explore bar gone; 3 trails → 1; area chips 14 → 10; dev sub-tabs → 0; ws chips 12 → 0; 4 checks homes → 1; 3 System controls → 1. Nav rows above the answer: 5 → 3 on desktop, 6 → 3 on a phone. Minus: it adds a left Data tab that duplicates Records › Sources; it buries Old pipes (a page with a grid, runs, CSV and a layer) as a Network list. |
| (b) clicks | 7 | Recounted total for tasks 1–10: **19** (today 30). Task 1 still needs the Servicing tab for the path. Task 8 goes through the Capital tab. Review outlets costs 3 without a shortcut. |
| (c) SPEC §0 | 9 | P1–P5 at every scope, including item scopes. One destination. Find · Watch · Data. Lens map-only. But it re-adds the Data tab as if SPEC §4 still bound, after the owner superseded it (bundle 6). |
| (d) compat | 7 | Strengths: PAGE_ALIAS, the migrateTabKey route for svs/rs (fixes the share.js:134-135 drop), stored-pref migration and a nav-aliases test. Misses the `t` problem (share.js:42). Decision 11 is a misread of share.js:57. |
| (e) risk / cost | 6 | Keeps every pane id. But it rebuilds every page as a tab host, adds five-tab item scopes and a Data tab: 13 PRs, several large. Its working-tree assumptions are stale (HEAD moved twice). |
| (f) names | 7 | Summary → Overview and Files → Records are good. But "Help › Help" collides, "DC program" is a third name for the DC project list (WS label, Home figure and vocabulary.test.js:50 all say "DC projects"), and "Old sewers carrying growth" sits beside "Old pipes". |

### 2.2 scope-first: 42

| Criterion | Score | Why |
|---|---|---|
| (a) | 9 | 4 navigation systems → 1. No sidebar. ws mode gone (chips, overrides, srcLine, back bar). 6 mode switches → 1 toggle. 3 trails → 1. 28 builders → 1 renderer. FSR hosts 3 → 1. Files renderers 3 → 1. DC timing surfaces 3 → 1. Minus: a new Overview chip row (Briefing · This week) and a launcher block. |
| (b) | 7 | Recounted: **20**. File numbers are not routed (task 5 = 2), and zones take 1 click. It is the only design that counted task 7 honestly. Old pipes, Review outlets and What's coming are +1 without a shortcut. |
| (c) | 7 | Five sections at every scope and one destination, extended to pages. Removes Watch, a departure from SPEC §4. Its reason ("no unique content") is only partly true: Watch is the map-side list of watched sites. Data in Records is owner-backed. |
| (d) | 9 | The most complete: a registry and a test listing every page id, chip id, section id and `data-ws-*` attribute, and every t / gs / svs / dcs / rs / ws value. It adds the `nav=2` marker, reads `ss` correctly, migrates stored prefs and keeps usage kinds. |
| (e) | 4 | Highest cost:<br>- one renderer for panel and page (the duplicate-id hazard, devtab.js:24);<br>- a live map beside every page, while renderPage rebuilds `#home` and moves `#map` on each render (workspaces.js:469-489, :207-215);<br>- Page \| Map replaces ws mode;<br>- renames (Where, When, Briefing, Construction, Outlets) that cascade through vocabulary.test.js:54-62 and MOVED;<br>- Overview chips break four-tabs.test.js:60. |
| (f) | 6 | "One address" is clear. But "Where" and "When" replace Pipeline / Areas / Forecast (the product is the Growth *Pipeline*), "Briefing" is a new word for Home, and the Construction rename is churn. |

### 2.3 task-first: 42

| Criterion | Score | Why |
|---|---|---|
| (a) | 6 | Sidebar 9 → 6 + pins; 0 headings; views bar gone; 1 trail; map chips 14 → 11; dev sub-tabs → 0; ws chips 12 → ≤5. But it keeps 21 page sections in 5 bars that **differ** from the map's tabs: the Servicing capacity page has 5 sections against the map's 3 chips, and Growth in an area keeps Growth · Forecast · Servicing · Capital. So the double navigation stays. Facility scopes open "in place" on a page: a second home for the scope card. |
| (b) | 9 | Recounted: **16**, the best. Search on every page is routed by hit. Summary carries the path and names the DC projects. Home gets "first zone limit". A file hit opens Files. Inquiry draft is a visible action. Minus: it claims task 7 is a new capability, but it already works. |
| (c) | 6 | Five tabs at every scope on the map, and Find · Watch. But page sections ≠ tabs (against P3, one destination), and it keeps the Ledger cut-off as a second "which stages count" control (P1, P5). |
| (d) | 8 | ALIAS plus BY_ID keeping all 12 WS ids, so `w=<ws>` keeps working natively; SUB_MAP; svs=checks migration. Misses the share.js:134-135 drop for other moved values and the `t` problem. |
| (e) | 8 | Lowest risk: its first steps touch no renderer (sections.js already supports `{page: id}` sections, :45). Keeps ws mode and the page builders. Minus: it bundles 5 new capabilities, adds 2 new roles, and its global search routing must be gated to page mode. |
| (f) | 5 | "DC projects" and "Construction" are good. But two names per thing remain: Summary = Overview, Files = Records › Files, "Servicing capacity › Capacity", "Check a site" vs the Overview tab. Its 7 roles include 2 that exist nowhere today. |

---------------------------------------------------------------------------------------------------

## 3. The recommended design

### 3.1 Rules

1. **A scope has five tabs: Overview · Growth · Servicing · Capital · Records.** A page and the full map are two hosts of the same scope, with the same tab strip and the same chips. A page has no section bar of its own, no views bar and no second trail (SPEC §0.4; spec-faithful's core idea).
2. **One destination for a click** (SPEC §0.3). Every row that opens something opens a scope: a site, a plan, a facility, a DC project, an EA, a file or a result. The trail updates. A result started from a development keeps the development.
3. **One search, on every page and in Find, routed by what it found** (task-first).
4. **One name per thing** (§3.9). Old names live only in Help › What moved where.
5. **Every old id, tab key and share parameter resolves through one alias table**, tested row by row. New links carry `nav=2` (scope-first).
6. **Departures from SPEC, with reasons:**
   - **No left-panel Data tab.** The owner moved Data into Records after SPEC was written (README:1557-1558). A third left tab would be a second home for Records › Sources.
   - **The Ledger's cut-off stays inside the merged view until the owner decides.** Removing a control is a separate decision from merging a chip.
   - Everything else in §0 holds.

### 3.2 Home sidebar (exact)

```
Home            What needs attention: Peel or a municipality          #w=home     (page host, area scope, Overview)
This week  [N]  What changed, and your watch list                     #w=p:week   (the one This week spec)
Find            A site, a file number, a plan, a facility, or an area you draw
                                                                      #w=p:find   (aliases: site, fsr, study, explore)
Help            Start here, guides, glossary, the app's rules         #w=p:help   (aliases: reference, guides, glossary, logic, the 9 guides)
Full map        Every layer, filter and tool

For your role · <role> (change)       only once a role is picked (first-run tour, Help › Start here, Settings);
                                      ≤3 deep links {scope, tab, sub, fold}, from one ROLES list
  Infrastructure planner or engineer   Find › Recently active · Servicing › Capacity · Servicing › Network
  FSR reviewer                         Find › Files with an FSR posted · This week · Servicing › Capacity
  Growth or policy analyst             What's coming (Growth › Forecast › By period) · Draw an area · Plans behind their target (Growth › Areas)
  Manager or director                  DC projects late (Capital › DC projects) · No relief in time (Servicing › Capacity) · Briefing PDF
  Capital or asset management          Capital › DC projects · EA to construction (Capital › EAs) · Old pipes (Servicing › Old pipes)
  QA/QC (data review)  [owner dec. 6]  Review outlets · Records › Checks · Records › Sources

Labs            Sewer designer        (only while Settings › Labs › Sewer designer is on)
```

**Removed:**
- the team headings Planning, Capital, QA/QC, Asset Management and Reference (workspaces.js:74-79);
- the entries Explore, Servicing capacity, What's coming, Capital, Review outlets, Old pipes and Reference, which become tabs, Find, Help and role shortcuts;
- the Start-screen select (workspaces.js:465). It stays in Settings (workspaces.js:492).

**Which entry is lit:**
- Home is lit on any tab of an area scope (Peel, a municipality, a plan).
- Find is lit on the find step and on any non-area scope (site, facility, DC project, file, drawn area). The trail names the scope.

**Widths:**
- ≥1200 px: a column.
- 700–1199 px: a scrollable row (css/app.css:3088-3095, unchanged).
- ≤700 px: ☰ in the top bar beside Home, instead of its own full-width row (css/app.css:3577-3588).

### 3.3 Page tree

```
TOP BAR (pages and map)
  wordmark · Home · ☰ (phone) · TRAIL: Peel ▾ › municipality ▾ › plan ▾ › site | plant › station | water system › zone |
  DC project | file | drawn area | result · count · k filters ×
  search (top bar ≥1600 px; page header row below) · lens (map only) · Scenario · Start over · Export ▾ · Present ▾ · Help · ⚙
  banners: #refresh-held (weekly update held), #error-banner (index.html:37, :52) — unchanged

PAGE HOST (every scope; js/ws-pages.js pageHTML)
  header: eyebrow · question h1 · status · scenario chip · [search] [Draw an area]
  TAB STRIP: Overview · Growth · Servicing · Capital · Records    (= index.html:213-218; hidden tabs left out; Servicing and
                                                                   Capital show "loading" until their data lands)
  CHIPS (only when ≥2 at this scope): the open tab's views       (= TABSUBS / chipsAt)
  answer · ≤4 figures · chart · lists ‖ map · folds · Method · Sources · footer (primary + ≤2) · How it works guide
  rows above the answer: 3 (top bar · tab strip · chips); 2 when the tab has one view

Home   area scope Peel | municipality (scope switch on Home; elsewhere the trail's first-step menu)
│  Overview  4 groups: Growth → Growth (Areas) · Forecast; Servicing → Servicing › Capacity (+ "first zone limit");
│            Capital → Capital › DC projects ("with no relief in time" → Servicing › Capacity, list No relief in time);
│            Change → This week
│            stage strip · Needs attention (a row opens its facility scope; grouped Capacity · Stalled · This week in the
│            full table) · Largest left to build · Plans furthest behind their target · This week (5) · capacity map ·
│            Briefing PDF · (at a plan) Area report
│  Growth    Pipeline · Areas · Forecast
│  Servicing Capacity · Network · Old pipes
│  Capital   DC projects · EAs · Construction
│  Records   Sources · Checks
This week [N]   moved stage · new files · capital and EA dates · on a tight plant; lists incl. Your watch list,
                Capacity alerts (only when fed); Open in Watch · Open the map
Find            search · Draw an area · Recently active · Large files under review · Files with an FSR posted · map pick
   → a development: its page on Overview (from the FSR list: Servicing › FSR review)
   → a file number: its development's page on Records, the file highlighted
   → a plan / MTSA / municipality: Home's host at that node, on the tab you were on
   → a plant / station / block / zone / water system: its scope page on Overview
   → a DC project: its object scope (Overview lists the developments relying on it, by tier)
   → a drawn area: the drawn-area scope page (Growth › Forecast gives its horizon split)
Help            Start here · How it works · Glossary · How the app decides
Review outlets  tool page (no sidebar entry): from Records › Checks, a site's "Discharges to … Review →", the QA/QC shortcut
Labs › Sewer designer (while on)
```

### 3.4 Full map: left panel, tabs, sub-tabs, controls

```
LEFT PANEL  Find · Watch
  Find   saved views · search · active chips · one count line (+ Stage "N of M" folded in) · Stage (phase ladder) · Where ·
         What · When (desktop: shortcuts, Milestone on the timebar; phones: as today) · Counts as (layer ladder) · Flags ·
         In view list + pager                                            (SPEC §4 Find; P1)
  Watch  Your watch list (in scope first) · This week in scope (top 5 of the one This week spec; See all → This week) ·
         Alerts (only while the feed exists, owner decision 8). One badge: watched sites with a change.
         (removed: the "This week: what changed →" button, index.html:175)

ANALYSIS  Overview · Growth · Servicing · Capital · Records
  Overview   no chips. Area: the briefing spec (full table = Needs attention grouped; the #ov-body card grid goes).
             Site: §3.6. Servicing scope: the scope card. Object / file / result: its card, the record sheet, #scope-body.
  Growth     Pipeline · Areas · Forecast          keys pipeline · areas · timing
             Forecast gains "By period" (the Ledger): municipality or child-node × 2026–31 / 2032–41 / 2042–51 / later,
             stacked by stage, Units | People, Hide possibly lapsed, the cut-off (until owner decision 2), fold How sure
             (tiers A–E), fold Since the last snapshot; full table = the developments list.
             #pane-growth-ledger: data-sub "ledger" → "timing" (id kept)
  Servicing  Capacity · Network · Old pipes (area) | Network · FSR review (development)    keys capacity · network · pipes · fsr
             Capacity  = #pane-svc-capacity, #pane-plants, #pane-wcap + #pane-alloc (fold "Allocations recorded",
                         column "room after allocations"; data-sub → capacity)
             Network   = #pane-svc-netbar, #pane-ww, #pane-pumpstations, #pane-water + #pane-wfac (Existing water
                         facilities) + #pane-hydro [Lab] (data-sub → network)
             Old pipes = the Old pipes page's spec (pipesSpec): figures · likelihood × consequence grid · runs · by plant ·
                         CSV · the amber layer on the map
             #pane-svc-checks moves to Records (data-pane → records, id kept)
  Capital    DC projects · EAs · Construction     keys timing · eas · projects (keys kept; labels change)
             DC projects  = #pane-dca-timing + #pane-dca-dcproj: one row per DC project with BOTH verdicts — "in service
                            before the capacity runs out" (dcAnalysis, dc-cost.js:279) and "first homes before it is built"
                            (DI().model(), dc-projects.js:58-90, built lazily); Status filter · System · Sort;
                            fold Funding [Lab, pv-hide] (#pane-dca-rec, #pane-dca-funding); a row opens the DC project scope
             EAs          = #pane-dca-eas + the EA-to-construction spec (figures, timeline, folds; today page-only, ws-pages.js:970)
             Construction = #pane-dca-build (To check · Furthest along)
  Records    Sources · Checks (area, servicing scope) | one view, files and history (development) | the file (file scope)
             Sources = freshness · receipts · backfill note · Advanced (#rec-data-sources: Refresh live, sources, Records since,
                       Max per layer, Discover, Add source — owner decision 7)
             Checks  = data checks (duplicates, published totals, permit counts, accuracy) + "Servicing model" group (from
                       Servicing › Model checks: MP vs tracker, reports vs model, water production, Caledon groundwater) +
                       MECP effluent vs report (plantFlows) + stations GIS vs roster (wwRoster) — both only on the legacy gear
                       page today + "Outlets to review (n) → Review outlets"; full table = the duplicate-pair review

TABSUBS valid: growth 3 · svc 4 (capacity, network, pipes, fsr) · dca 3 · records 3 — all ≤4, so four-tabs.test.js:145 holds.
Chips at area: 3 + 3 + 3 + 2 = 11 (today 14). At a development: only Servicing shows a chip row (2).

IN-PANEL CONTROLS ("tabs within tabs")
  System   ONE control "Both · Wastewater · Water", one stored state, default Both — replaces All/WW/Water
           (svc-capacity.js:247), WW/Water/Both (dc-projects.js:70) and Both/WW/Water (masterplan.js:800). The lens sets it
           (owner decision 9).
  Status   DC projects: Screens late · In time · Check the data · Room · All (from the DC timing result, masterplan.js:799)
  Sort     ONE vocabulary "Soonest · Largest impact" (+ "$ a unit" [Lab]) — replaces "Limit year · Impact"
           (svc-capacity.js:212) and "Most affected · Soonest · $ a unit" (dc-projects.js:70)
  Kept     Columns Simple/Engineering · Charts and method · Areas columns Plants/Pressure zones · developments table
           group/sort · Growth stage buttons (now write state.lyr, Counts as) · Forecast Units/People, Hide possibly lapsed ·
           Funding filter [Lab] · Events Key/All (Records at a site) · outlet editor filters ×6 · Sewer designer "Profile of"
  Removed  DC timing full-table Year select (dca-tab.js:159; reads Scenario › Results for year) · dead Events copy
           (fsr.js:317) · dev sub-tabs

MAP       Layers card + More settings ("DC timing: capacity vs DC projects →" opens Capital › DC projects) · Legend
          "Colour sites by" · tool rail (9) · tool banner · map picker and keyboard (every pick opens a scope) · 3D [Lab]
WS BAR    ← Page · search · Full map (the 12 task chips go; w=<chip> applies its LAYERS preset once, workspaces.js:41-54)
          "Open the map" and "← Page" keep scope, tab and view
FOOTER    timebar; the scenario line goes (SPEC §4); #scen-bar stays as the popover's DOM
```

### 3.5 Scope × tab matrix (replaces HIDDEN and EMPTY_AT_SITE, analysis-tabs.js:61-67)

| Tab | Area (Peel · municipality · plan) | Drawn area (`sel`) | Servicing scope (plant · ps · block · zone · wsys) | Development | File (`file:`) | Object (`dcwork` · `ea` · `cap` · `pipe` · `wfac`) / result |
|---|---|---|---|---|---|---|
| Overview | briefing | selection summary · Area report | scope card: status · headroom · ladder both ways · developments loading it · planned works · overflows · measured flow | §3.6 | record sheet (SPEC §3) | its card (DC project: developments relying on it by tier A/B1/B2, both verdicts) / the result |
| Growth | Pipeline · Areas · Forecast | Pipeline · Forecast | Pipeline · Forecast (its developments) | one view | hidden | hidden |
| Servicing | Capacity · Network · Old pipes | Capacity · Network | Capacity · Network · Old pipes (in it) | Network · FSR review | one view: its flows | hidden |
| Capital | DC projects · EAs · Construction | DC projects | DC projects (works in its catchment) | one view | hidden | hidden |
| Records | Sources · Checks | hidden | Sources (its capacity source and date, GIS layer) · Checks (model vs 2025 report for it, MECP effluent, roster) — hidden if it has none | one view: files and history | the file | hidden |

```
HIDDEN = {
  area:   { svc: ['fsr'], records: ['files'] },
  drawn:  { svc: ['pipes','fsr'], dca: ['eas','projects'], records: '*' , growth: ['areas'] },
  svc:    { growth: ['areas'], svc: ['fsr'], dca: ['eas','projects'], records: ['files'] },
  site:   { growth: ['areas','timing'], svc: ['capacity','pipes'], dca: ['eas','projects'], records: ['sources','checks'] },
  file:   { growth: '*', svc: ['capacity','network','pipes','fsr'] /* its flows only */, dca: '*', records: ['sources','checks'] },
  object: { growth: '*', svc: '*', dca: '*', records: '*' },   // Overview only (a later phase may add more, owner dec. 14)
}
```
`iiblock` (sewer-trace.js:506) opens as the `block` servicing scope.

### 3.6 One development layout (page and map)

```
HEADER   name · stage chip ▸ (how the stage was set, next step) · aerial chip ▸ · site servicing permit chip ▸ · flags · ☆ Watch
         identity: latest file · types · latest submission
         tools  [Trace sewer] [Trace water] [Check FSR → Servicing › FSR review]           (SPEC §3: one click away)
         actions [Servicing memo] [Inquiry draft] [⋯ Record allocation · Compare · Export CSV · Copy link]
         (one siteHead, panel.js:127-146, on both hosts; replaces #site-bar: its hidden title / facts / servicing line,
          Tools ▾ and #site-bar-fsr, devscope.js:150-225)
TABS     Overview · Growth · Servicing [Network · FSR review] · Capital · Records

OVERVIEW   answer (can it be serviced, when) · 4 figures (units | jobs · people | m² · water max day · ww peak wet) ·
           receiving plant bar (reserve)
           Servicing rows: water · zone; wastewater · THE PATH LINE (stations → discharges to <outlet> → <plant>, reserve);
           tightest pipe (not assessed while PIPE_RESULTS is off); DC projects it relies on (top 3 by name, in time / late);
           EAs near
           Timing rows · N things to confirm · At a glance (units · people · ppu; was the full-table verdict card)
           About (status + why, latest decision, FSR link, proposal) · approvals timeline (compact)
GROWTH     planned · permitted · completed · left (+ left to permit) · layer strip · how it compares · by dwelling type ·
           its census area · employment · fold Units on this land over time
SERVICING  › Network: flows · the path: zone → pumping stations (firm %) → DISCHARGES TO (outlet · Automatic / Confirmed /
             Set by hand · Review → Review outlets at this development) → plant reserve
             folds: Infrastructure coming (open) · Water (supply route, watermains near, fire flow) · Wastewater (sanitary
             sewers near, demand by stage, the 4 flows) · Site (constraints, aerial detail, ground elevation, storm, ponds,
             existing mains) · Servicing allocation (the one form; ⋯ Record allocation opens it) · Labs checks (gravity,
             pressure)
           › FSR review: FSR cross-check (the one host, fsr-check.js) · What the FSR should cover · path lists ·
             Copy the comparison · Print / PDF
CAPITAL    one view: DC projects it relies on (tiers A / B1 / B2, gate year, first homes, both verdicts) · DCs it would pay ·
           EAs within 1 km · Region construction near · Copy for review comments
RECORDS    one view (files and history): file tree (each file's layer, link confidence) · earlier files on its land · on
           this site · related applications · dated events (Key | All) · how the stage was set · source records with
           provenance · Report a data issue
MAP        page: the live site map + 7 layer chips (SITE_MAP, ws-pages.js:655-663); map: the full map at the site
```

**Retired:**
- `#ov-dev` (index.html:234) and `#pane-dev-body`;
- `syncDevHome` (records-tab.js:40);
- the full-table verdict card (overview-tab.js:134-227);
- the Overview story and Site folds;
- the FSR review section and page builder (its id `fsr` stays as a deep link);
- the names "Summary" and "Files";
- the dead `[data-ov-devsec]` handler (overview-tab.js:543-544), the dead Events copy (fsr.js:317) and the exports `dev` scope (exports.js:151).

Nothing about a development is full-table-only any more:
- fire flow, supply route, DCs it would pay and related applications join their views;
- "Open full table" only widens the same content.

### 3.7 Help, settings, tools

- **Help** (the top-bar ? and the sidebar entry are the same place). Four sections:
  - **Start here:** one ROLES list (merges tips.js:41-47 and :183-188), task guides whose "Show me" opens the tab that does the task, tours, What's new (the change log, one entry point), What moved where, Quick tips, and "What each tab answers", generated from the tab:sub questions (ASKS goes).
  - **How it works:** the 9 guides. GUIDE_OF is keyed by tab:sub, so map tabs and pages show the same guide.
  - **Glossary:** absorbs the Definitions card (info.js:17).
  - **How the app decides:** gains Number conventions from Settings.

  Data sources and Data checks leave Help; they are Records at Peel, and Help links there.
- **Settings.** ⚙ opens one sheet, not a page inside a dropdown (topbar.js:303-316).
  - Sections: Display · Start screen (Home · Last place · Map) · Reports (Prepared by, Public version) · Labs (9 switches) · Usage.
  - Removed: the Counting and Records pointer stubs (growth-ui.js:262-268) and the legacy `GearPages.sources` page (demand-ui.js:306-314). Its two unique checks go to Records › Checks; Overview's "Data & checks →" opens Records › Checks.
- **Tools.**
  - The rail is unchanged (9 tools).
  - The words "Tool result tab" go everywhere: README:1736, info.js:62, tips.js:78 and :83, tools-corridor.js:6, sewer-cap.js:44, svc-data.js:181. A result is a scope on Overview with a trail step. A result started from a development keeps the development (`keepDev`).
  - The DC timing tool result (masterplan.js:791-806) and every "All DC timing →" link open Capital › DC projects with the same status and system filters.
  - EA and Region capital project cards (capital-ea.js:190-231) open as `ea:` / `cap:` object scopes.
  - Export ▾ is grouped: Data files · Reports · Share.
  - Inquiry draft becomes a development action. Export ▾ keeps an item that runs it for the open development (owner decision 13).

### 3.8 Phone (390×844)

| Part | Today | Proposed |
|---|---|---|
| Top bar | wordmark · Home · trail · ⋯ | wordmark (short) · Home · ☰ · trail (last step; tap for all) · ⋯ |
| Home's pages menu | its own full-width row, grouped by team (css/app.css:3577-3588) | ☰ in the top bar; 5 entries + role shortcuts |
| Rows above the answer on a page | up to 6 (☰ row, views bar, explore bar, section bar, filters) | 3 (top bar, tab strip, chips) |
| Tab strip | — on pages | 5 tabs, scrolls, the open tab kept in view (analysis-tabs.js:117-118) |
| Chips | 4 per tab | ≤3 at every scope |
| Search | in the hidden map's Find below 1600 px | the page header row, ≥44 px, phone suggestions as the map picker's bottom sheet |
| Full map | bottom sheet (#analysis-grip), Filters sheet, picker sheet | same; the sheet's top is the tab strip + chips |

There are 38 `max-width: 700px` blocks in css/app.css. Each PR attaches 390×844 and 1440×900 screenshots (design audit §10).

### 3.9 One name per thing

| Thing | The one name | Retired names (kept only in What moved where) |
|---|---|---|
| A development's first tab | Overview | Summary |
| A development's files and history | Records | Files (as a page section), Files & history (sub-tab), About (sub-tab) |
| The list of 2026 DC projects with their timing | Capital › DC projects | DC timing, DC program, Capital › Timing |
| Region capital contracts | Capital › Construction | Projects, Capital › Projects |
| Data checks + servicing model checks | Records › Checks | Data checks, Model checks, Sources & checks (gear page), Reference › Data checks |
| The time view of growth, incl. the period table | Growth › Forecast (block "By period") | Ledger, What's coming (page), Forecast (page) |
| The plant-level allocation register | Servicing › Capacity, fold "Allocations recorded" | Servicing › Allocations |
| Old sewers carrying growth | Servicing › Old pipes | Old pipes (page), Asset Management |
| Where a development discharges, reviewed | Review outlets (tool page) | QA/QC |
| The FSR comparison at a development | Servicing › FSR review (button: Check FSR) | Review an FSR (page), FSR cross-check (fold), #site-bar-fsr |
| The find step | Find | Explore, Check a site (with no site), Study area |
| The help pages | Help (sections Start here · How it works · Glossary · How the app decides) | Reference, Data sources, Help › Help |
| A tool's output | a result (on Overview) | Tool result tab |
| Water / wastewater filter in panels | System: Both · Wastewater · Water | All · WW · Water, WW · Water · Both |
| Panel sort | Soonest · Largest impact | Limit year · Impact, Most affected |

---------------------------------------------------------------------------------------------------

## 4. The critic's contradictions, resolved

| # | Topic | Decision | Reason |
|---|---|---|---|
| 1 | Ledger vs Forecast | Merge: Growth › Ledger becomes the "By period" block of Growth › Forecast. `gs=ledger` and page `coming` open Forecast with the block open. In the merge PR the cut-off stays inside the block, so behaviour is unchanged; removing it is owner decision 2. | The Ledger's buckets come from the Forecast's own time-in-stage model (ledger-ui.js:11-13): one model, two chips. Merging a chip and removing a control are separate changes. The Ledger has 4 cut-offs and the Scenario Count 3 (ledger.js:26-31 vs layer-bar.js:151), so dropping the cut-off loses "+ Plan approved". |
| 2 | Model checks' home | Records › Checks, group "Servicing model", with MECP effluent and the station roster from the legacy gear page. Existing water facilities and the Hydraulic check [Lab] go to Servicing › Network. | Model checks answer "can the data be trusted?", the Records › Data checks question (records-tab.js:100). The two names were coined only to tell two checks lists apart (workspaces.js:94-95). Water facilities is an inventory and the Hydraulic check is a network run (info.js:135), so neither is a check of the data. One list replaces 4 homes. |
| 3 | FSR review | A Servicing view at a development (`svs=fsr`, page id `fsr`): Servicing shows Network · FSR review. It is the one host of the cross-check. Check FSR in the header opens it. | It keeps Check FSR one click away (SPEC §3) and gives it a shareable address that a fold lacks. Network stays readable (it already carries 6 folds). The ≤4 rule holds (svc valid = 4). The three hosts (#site-bar-fsr devscope.js:225, the fsr page, fsrSpec workspaces.js:256) become one. |
| 4 | Site scope: Records / Files | Records stays a tab at a development, with one view: files and history (DM-15's one Files view). About and the compact approvals timeline go to Overview (SPEC §5 lists "approvals timeline" in a development's Overview). The Site sub-tab becomes one Servicing › Network fold "Site". The dev sub-tabs and a sixth "Site" section are not added. | P4: the same five tabs. One renderer per block. Moving the Site partial whole into one fold, instead of splitting it across two tabs, is one move, not two. |
| 5 | Reference sections | Four: Start here · How it works · Glossary · How the app decides. The entry is named Help, like the top-bar button. Data sources and Data checks leave for Records at Peel. | They are the map's Records panels on a page (sections.js:48-56), so keeping them in Help makes a second home. "Start here" removes the "Help › Help" collision. How the app decides keeps its own page id (`logic`) and section: rules are not guides. |
| 6 | "Tool result tab" | No such tab, and the words go. Results are result scopes shown on Overview, with a trail step. A result started at a development keeps it (`keepDev`). | Results already open in Overview `#scope-body` (svc-scope.js:89-101). The wording is in 7 places (§3.7). Without `keepDev` (svc-scope.js:92) the Inquiry draft closes the site and, on a page, is drawn out of sight. |
| 7 | Watch, Records vs SPEC | Records stays a tab at every scope, real or hidden (never a placeholder; records-tab.js:72 goes). Watch stays in the left panel and renders the one This week spec in scope. SPEC §4's Data tab is not built. | SPEC §0.4 and §5 hold. Watch is the map-side list of watched sites, used beside the map, and SPEC §4 keeps it. The Data tab was folded into Records by the owner (README:1557-1558), so building it again would be a second home. |

---------------------------------------------------------------------------------------------------

## 5. Move table (every current surface → its new home)

| # | Now | Proposed | Reason |
|---|---|---|---|
| | **HOME SIDEBAR** (workspaces.js:449-466) | | |
| 1 | Home "The briefing" | Home: page host at Peel / municipality, Overview tab, with the briefing | Same entry, now with the five-tab strip |
| 2 | This week [N] | This week [N], one spec | Two builders today (workspaces.js:415, ws-pages.js:1024) |
| 3 | Headings Planning, Capital, QA/QC, Asset Management (GROUPS :74-79) | Removed; "For your role" shortcuts | Two headings hold one entry each |
| 4 | Explore › its 5 views (SIDE.explore, EXPLORE :58) | Find; the area views are Home's tabs | 5 views = 3 tab:sub keys + a find step + a drawn scope |
| 5 | Servicing capacity (tight) | Home › Servicing (Capacity) | The tab replaces the entry; still 1 click |
| 6 | What's coming (coming) | Growth › Forecast › By period; analyst shortcut | Same model (ledger-ui.js:11-13) |
| 7 | Capital (SIDE.capital, CAPITAL) | Home › Capital (DC projects · EAs · Construction) | The tab replaces the entry |
| 8 | Review outlets (outlets) | Review outlets tool page; Records › Checks row; site path "Review →"; QA/QC shortcut | An editor, reached where the question arises |
| 9 | Old pipes (pipes) | Servicing › Old pipes; asset-management shortcut | A Servicing view (WS tab svc, workspaces.js:31) |
| 10 | Labs › Sewer designer (LAB_PAGES) | Kept while the lab is on | Lab page |
| 11 | Reference | Help | One name with the top-bar button |
| 12 | Full map button | Kept | — |
| 13 | Start-screen select (:465) | Settings › Start screen only (:492) | A setting shown twice |
| 14 | Phone ☰ "all pages" row | ☰ in the top bar | One row less at 390 px |
| | **WORKSPACE MAP VIEW (ws mode)** | | |
| 15 | ws-bar ← Page · search · Full map (index.html:189) | Kept | The way back |
| 16 | 12 task chips (renderChips :322-327) | Removed; `w=<chip>` → alias + LAYERS preset once | The pre-consolidation list again |
| 17 | `#ws-filters` | The trail's "k filters ×" | One filters line |
| 18 | srcLine "<WS> · from <Tab › Sub>" | Removed; "Full map →" kept | The tab strip names the place |
| 19 | findSpec override | Find page; on the map, Overview shows it while nothing is scoped | One find step |
| 20 | fsrSpec override (:256) | Servicing › FSR review | One FSR host |
| 21 | pipesSpec override | Servicing › Old pipes spec | No override |
| 22 | weekSpec (:415) | The one This week spec | Second builder |
| 23 | LAYERS presets (:41-54) | Kept, keyed by tab:sub | Each task keeps its map look |
| 24 | Back bar "← Back to …" (:163) | Kept; scope, tab and view kept both ways | — |
| 25 | pnl:set auto-open on growth/outlook/study (:571-576) | Rule on every page: a picked development opens its page on Overview | One destination |
| | **PAGES** (28 ids, ws-pages.js:1275) | | |
| 26 | home | Home host | — |
| 27 | week | This week | — |
| 28 | site (none / a site) | Find / the site page, five tabs | — |
| 29 | fsr | Find (FSR list) / with d=: Servicing › FSR review | FSR review was a sixth section |
| 30 | study | Find › Draw an area → drawn-area scope | A drawn area is a scope |
| 31 | growth | Home host › Growth › Areas | Growth in an area = Areas |
| 32 | outlook | Growth › Forecast | Page twin of growth:timing |
| 33 | coming | Growth › Forecast (By period open) | Ledger merged |
| 34 | tight | Servicing › Capacity | — |
| 35 | projects, capital | Capital › DC projects | — |
| 36 | eaflow | Capital › EAs | — |
| 37 | outlets | Review outlets (kept) | An editor |
| 38 | pipes | Servicing › Old pipes | — |
| 39 | sewer | Kept (Labs) | — |
| 40 | help | Help › Start here | — |
| 41 | guides + roles, approvals, flows, network, capacity, fsrguide, capguide, targets, forecast | Help › How it works (ids kept) | — |
| 42 | glossary | Help › Glossary (+ Definitions card) | One definitions list |
| 43 | logic | Help › How the app decides (+ Number conventions) | — |
| 44 | data | Records › Sources at Peel | Data is Records |
| | **PAGE BARS** | | |
| 45 | Explore views bar (viewsHTML :467) | Removed | Tab strip and Find replace it |
| 46 | Explore bar: search · trail · Draw an area (ws-pages.js:664-666) | Page header: search + Draw an area; trail → top bar | One search, one trail |
| 47 | siteTrail plan-tree trail (ws-pages.js:668-677) | Top-bar trail with plan-tree placement | 2 trails today |
| 48 | Growth drill crumbs (data-ws-drill) + ↑ Up a level | The trail; each step sets the scope | The drill is the scope (owner decision 10) |
| 49 | SITE bar (6; sections.js:22-29) | Five-tab strip; Servicing chips Network · FSR review | Same tabs as the map |
| 50 | AREA bar (4; :33-38) | Five-tab strip + chips | — |
| 51 | WORKSPACES.servicing (4; :41-46) | Servicing chips Capacity · Network · Old pipes | Allocations folded, checks to Records |
| 52 | WORKSPACES.capital (5; :58-64) | Capital chips DC projects · EAs · Construction | 5 sections over 2 model families → 3 |
| 53 | WORKSPACES.reference (6; :48-56) | Help sections (4); Data → Records | — |
| 54 | Page filter-chip row (m.filters) | Trail "k filters ×" | — |
| 55 | Area "Peel-wide" note (ws-pages.js:646-653) | One `peelWideNote` (svc-scope.js) on both hosts | Two wordings |
| 56 | Section foot.primary dropped on pages | Restored (Trace the sewer path, Area report, Show the planned works) | Pages drop it today |
| 57 | Stepper "Find › Result › Output" | Kept on Find only | — |
| | **HOME CONTENT** (ws-pages.js:507-556) | | |
| 58 | Header, status chip, Scenario chip | Kept | — |
| 59 | Scope switch Peel \| Mississauga \| Brampton \| Caledon | Kept on Home; elsewhere the trail's first-step menu | One scope control |
| 60 | Growth group | Kept; → Growth › Areas, Forecast | — |
| 61 | Servicing group | Kept + "first zone limit"; each figure opens its facility scope | Task 2 at 0 (firstTrigger is plants only, :484-487) |
| 62 | Capital group: DC projects late; with no relief in time | → Capital › DC projects (late first); → Servicing › Capacity "No relief in time" | Each figure opens the list of its own rows |
| 63 | Change group (builds the whole `BUILD.week()`, :528) | Read from the one This week spec | Built twice |
| 64 | Stage strip + dormant note | Kept | — |
| 65 | Needs attention (rows → bare tight page, :519, :553) | A row opens its facility scope; full table grouped Capacity · Stalled · This week | Task 6 at 2; SPEC §5 |
| 66 | Largest left to build | Kept | — |
| 67 | Plans furthest behind their target | Kept; a row sets the plan scope | — |
| 68 | This week (5) | Kept; See all → This week | — |
| 69 | Capacity map | Kept | — |
| 70 | Actions Briefing PDF · Full map | Kept | — |
| | **THIS WEEK PAGE** (ws-pages.js:1024-1065) | | |
| 71 | Figures, lists, map | The one This week spec | — |
| 72 | Action "Watch list" | "Open in Watch" | Plainer |
| 73 | Capacity alerts this week | Shown only when fed (owner decision 8) | build-alerts.js runs in no workflow |
| | **GROWTH IN AN AREA / FORECAST / WHAT'S COMING CONTENT** | | |
| 74 | Figures; 8-rung stage chart (STAGES, ws-pages.js:126-135) | Growth › Areas; chart from layers.js LADDER | STAGES copies LADDER (critic D8) |
| 75 | Developments table + treemap (dev-table.js) | Growth › Areas | — |
| 76 | Estimated counts: files to confirm | Records › Checks (scoped) | A data check |
| 77 | Employment list | Growth › Pipeline | Duplicate |
| 78 | Area report · Show on the map · Up a level | Overview footer Area report · Open the map · the trail | — |
| 79 | Forecast page (outlook :929) | Growth › Forecast | — |
| 80 | Ledger cut-off ×4 (ledger-ui.js:87) | Inside By period (phase 3); owner decision 2 | No behaviour change in the merge |
| 81 | Ledger Units / People, Hide possibly lapsed | By period | — |
| 82 | Municipality × period table | By period, rows = child nodes at any scope | Task 7 at any scope |
| 83 | Tiers A–E table | Fold "How sure" | — |
| 84 | Developments list (sortable) | Forecast full table | — |
| 85 | Since the last snapshot (ledger-ui.js:252-268) | Forecast fold (owner decision 12) | Annual diff |
| 86 | "Open Growth › Ledger" action | Removed | No Ledger chip |
| | **SITE PAGE AND FIND STEP** | | |
| 87 | Summary | Overview (+ path line, named DC projects, About, timeline) | One name; task 1 at 1 |
| 88 | Growth | Growth | — |
| 89 | Servicing | Servicing › Network | — |
| 90 | Capital (dca:timing + dca:eas merged, sections.js:27) | Capital, one view on both hosts | The map showed 2 chips |
| 91 | Files | Records | One name |
| 92 | FSR review section / page (ws-pages.js:1068-1084) | Servicing › FSR review | One host |
| 93 | Live site map + 7 layer chips | Kept | — |
| 94 | Actions Servicing memo · Review its FSR · ☆ Watch · Open the map · Another site | Header tools + actions + ⋯; ☆ in the header | SPEC §3 |
| 95 | Find step lists (find(), ws-pages.js:595) | Find page | — |
| 96 | Study area page (ws-pages.js:1242-1251) | Find › Draw an area → drawn scope | — |
| | **SERVICING CAPACITY AND CAPITAL PAGE CONTENT** | | |
| 97 | Servicing capacity page figures and lists (tight :559-590) | Servicing › Capacity spec on both hosts | Page enrichment becomes the spec |
| 98 | DC timing section + borrowed Projects / EAs lists (ws-pages.js:918-921) | Capital › DC projects; borrowed lists go | Shown twice |
| 99 | DC projects section, drill in place (dc-projects.js:208) | A row opens the DC project scope (trail back) | One destination |
| 100 | EA to construction (eaflow :970) | Capital › EAs | Page-only today |
| 101 | Projects section | Capital › Construction | Name collision with DC projects |
| 102 | EAs section | Capital › EAs | — |
| | **OUTLETS AND OLD PIPES** | | |
| 103 | Review outlets page (queue filters ×6, panel, map; ws-pages.js:1127-1210) | Kept as a tool page; its queue count in Records › Checks | Editor unchanged |
| 104 | Old pipes page (figures, grid, runs, by plant, map, CSV; :1218-1239) | Servicing › Old pipes view (grid and CSV in the full table) | Addressable view |
| | **FULL-MAP LEFT PANEL** (index.html:88-180) | | |
| 105 | Find tab | Unchanged | SPEC §4 |
| 106 | Stage link "How approvals map to these stages →" | Kept → the approvals guide | — |
| 107 | Watch › Your watchlist (#watch-panel) | Watch, in scope first | — |
| 108 | Watch "This week: what changed →" (:175) | Top 5 of the This week spec + See all | It left the map |
| 109 | Watch › Alerts (#alerts-panel) | Shown only when fed | Dead today |
| 110 | Badges #week-watch-n, #alerts-n | One badge | — |
| 111 | (SPEC §4 Data tab, never rebuilt after bundle 6) | Not built; Records › Sources / Checks | Owner moved it (README:1557) |
| | **ANALYSIS COLUMN SHELL** | | |
| 112 | #f-sum (index.html:211) | Desktop: removed (trail count); phone: sheet summary | Counted many times |
| 113 | #site-bar (hidden title, facts, svc line; Tools ▾; ☆; flags; #site-bar-fsr) | Removed; the header carries tools, ☆ and flags; the form goes to FSR review | Hidden DOM |
| 114 | Tab strip; Servicing / Capital appear late (svc-tab.js:378-381) | Kept; they show "loading" instead (analysis-tabs.js:83 fallback) | A page link would land on Overview |
| 115 | #ft-bar, #screen-note-top, #scope-note | Kept | — |
| 116 | #analysis-grip, panel phone chip "Years" | Kept | — |
| | **OVERVIEW TAB** | | |
| 117 | #pnl-overview (area / site / svc specs) | Kept | — |
| 118 | #ov-body area card grid (overview-tab.js:442-455) | Removed; full table = Needs attention grouped | Third rendering |
| 119 | #ov-body site verdict card (:134-227) | Removed; At a glance → Overview; 4 flows → Servicing | Repeats the panel |
| 120 | #scope-body | Kept (result host) | P3 |
| 121 | ⓘ line: Definitions; "Data & checks →" (:436, :538) | Glossary; Records › Checks | Gear page goes |
| 122 | Executive briefing link (.ov-brief) | Overview footer + Export ▾ | Output, not content (audit §8) |
| 123 | Dev sub-tab About | Overview About block | — |
| 124 | Dev sub-tab Files & history | Records | — |
| 125 | Dev sub-tab Site | Servicing › Network fold Site | — |
| 126 | Overview story fold (overview-tab.js:124) | About + timeline in Overview; files and events in Records | No copy across tabs |
| 127 | Overview Site fold (:125); Servicing "ground" fold (svc-capacity.js:429) | One fold "Site" in Servicing › Network | Split in two today |
| 128 | #pane-dev-body; exports SCOPES.dev (exports.js:151) | Removed | Unreachable |
| 129 | [data-ov-devsec] handler (overview-tab.js:543-544) | Removed | No producer |
| | **GROWTH TAB** | | |
| 130 | Pipeline, Areas, Forecast | Kept | — |
| 131 | Ledger (#pane-growth-ledger, no panel spec) | Forecast › By period; data-sub → timing, id kept | Same model |
| | **SERVICING TAB** | | |
| 132 | Capacity (#pane-svc-capacity, #pane-plants, #pane-wcap) | Kept | — |
| 133 | Network (#pane-svc-netbar, #pane-ww, #pane-pumpstations, #pane-water) | Kept + #pane-wfac, #pane-hydro [Lab] | Inventory and network run |
| 134 | Allocations (#pane-alloc) | Capacity fold "Allocations recorded" + column "room after allocations"; data-sub → capacity | A plant register (demand-ui.js:123-150) |
| 135 | Model checks (#pane-svc-checks) | Records › Checks "Servicing model"; data-pane → records, id kept | One checks list |
| 136 | (new) Old pipes | From the Old pipes page | — |
| 137 | (new, development only) FSR review | From the FSR review section | — |
| | **CAPITAL TAB** | | |
| 138 | DC timing (#pane-dca-timing) | DC projects (key timing), verdict 1 | Two model families, one list |
| 139 | DC projects (#pane-dca-dcproj) + #pane-dca-rec, #pane-dca-funding [Lab, pv-hide] | DC projects, verdict 2; fold Funding [Lab] | — |
| 140 | fundingSpec head "Capital › Funding" (dca-tab.js:113-127) | "Capital › DC projects · Funding [Lab]" | Names a gone sub-view |
| 141 | Projects (#pane-dca-build) | Construction (key projects) | — |
| 142 | EAs (#pane-dca-eas) | EAs + EA to construction | — |
| | **RECORDS TAB** | | |
| 143 | Sources (+ #rec-data-sources, index.html:313-353) | Sources; Advanced per owner decision 7 | — |
| 144 | Data checks (+ #rec-data-checks) | Checks (+ servicing model, plantFlows, wwRoster, outlets row) | One list |
| 145 | Files | Records at a development (no chip row) | — |
| 146 | Servicing-scope placeholder (records-tab.js:72) | Scoped Sources / Checks, else hidden | P4 |
| 147 | Records at a file result (analysis-tabs.js:86) | File scope Records + record sheet on Overview | SPEC RecordSheet |
| 148 | Link "Servicing › Model checks →" (records-tab.js:28) | Removed | Same list now |
| 149 | Records › Sources footer Copy share link (records-tab.js:92) | Export ▾ › Share | Not a Records action |
| | **SCOPES AND DETAIL VIEWS** | | |
| 150 | Servicing scopes plant / ps / block / zone / wsys (HIDDEN has no row) | HIDDEN.svc per §3.5 | Critic N1 |
| 151 | Servicing-scope overflows and measured flow (svc-scope.js:282-285) | Kept on its Overview (owner decision 11) | Operating status |
| 152 | dcwork / cap / ea / pipe / wfac / cx cards | Object scopes; the DC project card lists the developments relying on it | Task 8 at 1 |
| 153 | iiblock (sewer-trace.js:506) | Block servicing scope | The same thing twice |
| 154 | tool / sel / help results | Result scopes on Overview; keepDev at a development | §4 #6 |
| 155 | EA / capital project cards (capital-ea.js:190-231) | ea / cap object scopes | P3 |
| 156 | Single file (rkind file) | Overview (record sheet) · Servicing (its flows) · Records (the file) | SPEC §5 |
| | **HELP / REFERENCE** | | |
| 157 | ROLES (4) + TOUR_ROLES (5) | One ROLES list (5, + QA/QC per owner decision 6) | Two lists disagree |
| 158 | "What each workspace answers" (ASKS, tips.js:189) | Generated from tab:sub questions | Third copy |
| 159 | 10 task guides, "Show me on the map" | "Show me" opens the tab that does the task | — |
| 160 | More help, Quick tips | Kept | — |
| 161 | Change log (⚙ menu and Help) | Help › Start here › What's new | Two entry points |
| 162 | What moved where (MOVED, tips.js:129-166) | Kept + a row per move (§7.4) | — |
| 163 | How it works + 9 guides; GUIDE_OF by page id | Kept; GUIDE_OF by tab:sub | Same guide on both hosts |
| 164 | Glossary | Kept + Definitions card | — |
| 165 | How the app decides | Kept + Number conventions | — |
| 166 | Reference › Data sources, Data checks | Records › Sources, Checks at Peel | One home |
| 167 | "What is this?" cards; orphans tab-water, tab-ww, tab-dev | tab-* cards rewritten; orphans deleted | Old names |
| 168 | HOME_TOUR (team groups, explore selector, tips.js:53-60); TOUR (Watch, #site-bar, #ov-dev) | Rewritten | Point at removed elements |
| | **SETTINGS** | | |
| 169 | ⚙ menu Settings · Labs · Change log (topbar.js:290-296) | ⚙ = one Settings sheet | — |
| 170 | Counting and Records stubs (growth-ui.js:262-268) | Removed | Pointers only |
| 171 | Settings › Number conventions | Help › How the app decides | Documentation |
| 172 | Legacy GearPages.sources (demand-ui.js:306-314) | Removed; plantFlows, wwRoster → Records › Checks | Its only unique content |
| 173 | labs.js:14 Hydraulic check "where: Servicing › Model checks" | "Servicing › Network" | The pane moves |
| 174 | Scenario chip + popover | Kept | — |
| 175 | Layers › More settings "DC timing: capacity vs DC projects →" | Capital › DC projects | One DC timing home |
| 176 | Saved views | Kept | — |
| 177 | Usage kinds (usage.js:19) | rows() maps old ids through the alias table | Pilot CSVs stay comparable |
| | **TOOLS** | | |
| 178 | Tool rail (9) | Kept | — |
| 179 | "Tool result tab" wording (7 places) | Removed | No such tab |
| 180 | DC timing tool result (masterplan.js:791-806), "All DC timing →" | Capital › DC projects with filters | Third DC timing surface |
| 181 | Site bar Tools ▾ (devscope.js:212-222) | Header tools + ⋯ | SPEC §3 |
| 182 | Export ▾ › Inquiry response draft (topbar.js:279) | Development action (keepDev); Export item kept (owner decision 13) | Task 9 at 2 |
| 183 | Export ▾ other items (flat) | Grouped Data files · Reports · Share | — |
| 184 | Servicing memo ×4 | Export ▾ + development action | — |
| 185 | Present ▾, Compare, Measure profile, What loads this, Upgrade a pipe, map picker, keyboard | Kept | — |
| | **TOP BAR** | | |
| 186 | Home (#tb-home) | Kept | — |
| 187 | Trail (#trail, topbar.js:112-142) | The one trail | 3 → 1 |
| 188 | Search ≥1600 px only | + every page header below 1600 px, Home included | Task 1, 4, 5 |
| 189 | Lens opens a tab (topbar.js:41-43) | Map preset + System control only (owner decision 9) | SPEC §4 |
| 190 | Banners #refresh-held, #error-banner | Kept | — |
| | **IN-PANEL CONTROLS** | | |
| 191 | System ×3 (svc-capacity.js:247; dc-projects.js:70; masterplan.js:800) | One "Both · Wastewater · Water" | 3 orders, 3 states |
| 192 | DC timing result status chips (masterplan.js:799) | DC projects Status filter | — |
| 193 | Sort ×3 vocabularies | "Soonest · Largest impact" (+ $ a unit [Lab]) | Same sort, other words |
| 194 | Columns Simple / Engineering; Charts and method | Kept | — |
| 195 | Areas columns Plants / Pressure zones (plan-tables.js:350) | Kept | — |
| 196 | Dev table group / sort; Growth in an area stage buttons (ws-pages.js:746) | Kept; stage buttons write state.lyr | One stage filter |
| 197 | Funding filter [Lab] (dca-tab.js:184) | In the Funding fold | — |
| 198 | Events Key / All (devtab.js:396); dead copy (fsr.js:317) | Records at a site; dead copy removed | — |
| 199 | DC timing full-table Year select (dca-tab.js:159) | Reads Scenario › Results for year | Two year controls |
| 200 | Outlet editor filters ×6, Sewer designer "Profile of", tool banners | Kept | — |
| 201 | Milestone on the timebar and in Find › When (desktop) | Timebar only on desktop; phones keep both | Two synced copies |

---------------------------------------------------------------------------------------------------

## 6. Click counts (counting rule at the top)

### 6.1 The design audit's ten tasks (docs/design-audit.md §9)

| # | Task | Today (HEAD, from Home) | spec-faithful | scope-first | task-first | **Recommended** |
|---|---|---|---|---|---|---|
| 1 | Servicing check for a development (zone, sewer path, plant reserve, DC) | 3: Explore → pick → Servicing (path) | 2 | 2 | 1 | **1**: search pick → Overview (path line, plant reserve, named DC projects) |
| 2 | Plant / zone first to its trigger (zone) | 2: Servicing capacity → System Water | 0 | 1 | 0 | **0**: Home "first zone limit" |
| 3 | What changed this week (full list) | 1 (top 5 at 0) | 1 | 1 | 1 | **1** (top 5 at 0) |
| 4 | Area report for a secondary plan | 4: Explore → municipality → plan → Area report | 2 | 2 | 2 | **2**: search pick the plan → Area report on its Overview |
| 5 | File number → its tree | 3: Explore → pick → Files | 1 | 2 | 1 | **1**: file-number hit → Records, file highlighted |
| 6 | Most loaded zone / station + developments driving it | 3: sort → row (bare tight page) → row (map scope) | 2 | 2 (designer: 4) | 2 | **2**: sort Largest impact → row opens its scope; pipe part waits on pipe class |
| 7 | Growth by horizon year for a drawn area | 5: Full map → Select → drag → Growth → Ledger (works today: measure.js:79 → app.js:327) | 4 | 4 | 4 (designer: 3) | **4**: Draw an area → drag → Growth → Forecast (By period) |
| 8 | Developments relying on a DC project | 3: Capital → DC projects → row | 2 | 1 | 1 | **1**: search the project number → its scope lists them (+2 years: new feature, owner decision 15) |
| 9 | Servicing statement (pre-consultation) | 4: Explore → pick → Export → Inquiry draft, and it is drawn out of sight | 3 | 3 | 2 | **2**: search pick → Inquiry draft (keepDev) |
| 10 | DC study inputs export | 2: Export → Excel workbook | 2 | 2 | 2 | **2** |
| | **Total** | **30** | **19** | **20** | **16** | **16** |

### 6.2 Other paths

| Path | Today | Recommended |
|---|---|---|
| Check a site from Home at 1440 px | 2 (Explore → pick) | 1 (search pick) |
| Review an FSR from Home | 3 (Explore → Review an FSR → pick) | 2 (Find → FSR-posted row, lands on Servicing › FSR review); 2 from the FSR-reviewer shortcut |
| Servicing capacity from Home | 1 | 1 (Servicing tab) |
| What's coming from Home | 1 | 2 (Growth → Forecast) · 1 with the analyst shortcut |
| Old pipes from Home | 1 | 2 (Servicing → Old pipes) · 1 with the asset shortcut |
| Review outlets from Home | 1 | 3 (Records → Checks → Outlets row) · 1 with the QA/QC shortcut · 1 from a site's path |
| EA to construction from Home | 2 | 2 (Capital → EAs) · 1 with the capital shortcut |
| Data checks from Home | 2 (Reference → Data checks) | 2 (Records → Checks) |
| A guide from Home | 3 | 3 (Help → How it works → guide) |
| The same view on the full map | 1 (the sub-view not always kept) | 1 (scope, tab and view kept) |
| Back from the full map to the development's page | 1 (back bar) | 1 |
| Site page: Overview → its files | 1 | 1 (Records) |
| Max click depth from Home to any screen | 3 | 3 |
| Nav rows above the answer: site page | 4 | 2 (3 on Servicing) |
| Nav rows above the answer: Growth in an area, desktop / phone | 5 / up to 6 | 3 / 3 |

### 6.3 Surfaces before and after

| Surface | Today | Recommended |
|---|---|---|
| Home sidebar | 9 entries, 4–6 headings, Full map, Start select | 5 entries, 0 headings, ≤3 role shortcuts, Labs while on |
| Page section bars | 5 kinds, 25 sections + Explore views bar (5) | 0 (the map's tab strip + chips) |
| Trails | 3 | 1 |
| ws-mode chips | 12 | 0 |
| Area chips | 14 shown (15 valid) | 11 |
| Development sub-tabs / chip rows | 3 sub-tabs + Capital 2 chips | 0 sub-tabs; Servicing 2 chips |
| FSR cross-check hosts | 3 | 1 |
| This week builders | 2 | 1 |
| Homes of "checks" | 4 | 1 |
| DC timing surfaces | 3 | 1 |
| System controls / Sort vocabularies | 3 / 3 | 1 / 1 |
| Help (Reference) sections | 6 | 4 |
| ⚙ items | 3 | 1 |

---------------------------------------------------------------------------------------------------

## 7. Links that must keep working

### 7.1 Page ids (`#w=p:<id>`, `openPage`, `data-ws-page`, `lastWs`, Help role buttons)

One `PAGE_ALIAS` table, used by `startScreen` (workspaces.js:136), `openPage` (:431), `renderPage` (:469) and `lastWs`.

Two fallbacks today:
- an unknown id becomes Home (:435);
- an unknown `w=p:` opens the full map (:139).

With every old id aliased, neither fallback fires for a real old link.

| Old id | Resolves to |
|---|---|
| home | Home, Overview |
| week | This week |
| explore | the open site, else Find |
| site | Find; with `d=`, the site page on Overview |
| fsr | Find (FSR list); with `d=`, the site page on Servicing › FSR review |
| study | Find with Draw an area armed |
| growth | Home host, growth:areas |
| outlook | growth:timing |
| coming | growth:timing, By period open |
| tight | svc:capacity |
| pipes | svc:pipes |
| projects, capital | dca:timing (DC projects) |
| eaflow | dca:eas |
| data | records:sources at Peel |
| reference | help |
| outlets, sewer, help, guides, glossary, logic, the 9 guide ids | kept as they are |

### 7.2 Share parameters (share.js:17-147)

| Param | Old value | New value |
|---|---|---|
| `w=<chip>` (12) | map view of a workspace | full map at the alias's tab:sub, its LAYERS preset applied once |
| `t` | overview, growth, svc, dca, records; legacy demand, census, criteria, log, developments, tool, dev, plants, ww, water | unchanged (migrateTabKey, analysis-tabs.js:28-38) |
| `gs` | ledger | timing (By period open); census2051, byplan → areas unchanged |
| `svs` | alloc | capacity, Allocations fold open |
| `svs` | checks | `t=records&rs=checks` (SUB_MAP returns a tab) |
| `svs` | — | new values: pipes, fsr |
| `dcs` | dcproj, recommendations, funding | timing (funding still turns Labs › DC funding on, share.js:138); build → projects |
| `ws` (with t=water) | facilities, hydro | network (hydro still turns the lab on, share.js:139) |
| `rs` | sources, checks, files | unchanged |
| `d` | development key | unchanged (share.js:145-147) |
| `ss` | plant:, wsys:, servicing-area ids; pipe:, file:, dcwork:, iiblock:, ea:, cap: (already written, share.js:57) | unchanged; tool:, sel:, help:, cx:, wfac: stay transient |
| `nav` | — | `nav=2` on every new link. Without it, a page id wins over `t` (old links always wrote `t`, share.js:42) |
| `fo`, `u=left\|committed`, `ms`, `k`, `lg`, `ly`, `ph`, `fl`, `sd` and the rest | — | unchanged |

**The bug to fix first:** share.js:134-135 apply `svs` and `rs` only when the value is still valid, so a moved value is dropped. All four sub params must go through migrateTabKey.

### 7.3 Stored preferences

- `gSub` ledger → timing.
- `svcSub` alloc → capacity; checks → footPref records, rSub checks.
- `dcSub` dcproj → timing (analysis-tabs.js:43-44 already maps gSub and dcSub through SUB_MAP).
- `lastWs` and `startScreen=last` go through PAGE_ALIAS.
- `ledgerCut` is kept until owner decision 2.
- Today TABSUBS' reset (analysis-tabs.js:55) would send `gSub=ledger` to pipeline, not timing. Map it before the reset.

### 7.4 tips.js MOVED and the pinned tests

- **Rows to rewrite:**
  - :139 Water › Facilities → Servicing › Network;
  - :145 → Records › Checks;
  - :146 The Projects workspace → Capital › DC projects;
  - :147 Capital › Construction → "Capital › Construction (again)".
- **Rows to add:**
  - What's coming / Growth › Ledger → Growth › Forecast (By period);
  - Servicing › Allocations → Servicing › Capacity (fold);
  - Servicing › Model checks → Records › Checks;
  - DC timing → Capital › DC projects;
  - Projects → Construction;
  - EA to construction → Capital › EAs;
  - Explore's views → Find and the tabs;
  - the old sidebar entries → tabs;
  - Reference → Help, and Data sources / Data checks → Records;
  - About / Files & history / Site → Overview / Records / Servicing;
  - FSR review → Servicing › FSR review;
  - Labs and Change log → Settings and Help;
  - Summary → Overview, Files → Records.
- **Tests pinned to this text** (each edit lands in the same PR as its rows):
  - pilot.test.js:103-107 (`now('Water › Facilities')` /Servicing › Model checks/; `now('Capital › Construction')` /Capital › Projects/) and :106-108 (the SUB_MAP text);
  - vocabulary.test.js:51 (`areaHead('Servicing › Model checks'`, `'Capital › DC timing'`, `'Records › Data checks'`) and :54-62 (every Tab › Sub named in Help or MOVED must be a chip).

---------------------------------------------------------------------------------------------------

## 8. Implementation plan: independently shippable phases

Rules for every phase:
- Each phase is one PR, or a short series of PRs, that leaves `node --test tests/*.test.js` green.
- It changes each test pin in the same commit as its code.
- It updates MOVED, the tours, the info cards and the README sections it touches.
- It attaches 390×844 and 1440×900 screenshots.
- No phase depends on a later one. Phases 2–4 can ship in any order.

| # | Phase | What changes | Effort | Risk | Tests touched |
|---|---|---|---|---|---|
| 0 | **Alias and link layer** (no visible change) | PAGE_ALIAS in workspaces.js (startScreen, openPage, renderPage, lastWs); SUB_MAP able to return a tab; share.js sends gs / svs / dcs / rs through migrateTabKey (fixes :134-135); `nav=2` on new links; stored-pref migration before the TABSUBS reset; usage.js rows() alias. New tests/nav-aliases.test.js lists all 28 page ids, the 12 `w` chips, every t / gs / svs / dcs / rs / ws value and every stored pref. | S, 1–2 days | Low | new nav-aliases; four-tabs (migrateTabKey); pilot.test.js:106-108 (keep the pinned substrings or edit them); share tests |
| 1 | **Find from every page** (task wins, no structure change) | `#page-search` + Draw an area in every page header, Home included. In page mode only, route a pick: development → site page; file-number hit (new `hit:'file'`, search-filter.js:99) → site page Files with the file highlighted; plan / MTSA → Growth in an area at the node; facility → its scope; DC project → its scope. `keepDev` for results started at a development (svc-scope.js:92); one openResult for the Inquiry draft (topbar.js:225 duplicate removed); Inquiry draft as a site action. Site Overview: path line + named DC projects. Home: "first zone limit"; Needs attention rows open their facility scope. | M, 3–5 days | Medium: goSug also serves the map (gate on mode === 'home') | workspaces.test.js (placeSearch), ws-pages.test.js, topbar, site-scope, search tests, click-destinations, new routing test |
| 2 | **Servicing and Records merges** | #pane-svc-checks → Records › Checks group "Servicing model" (id kept), with plantFlows and wwRoster; chip "Data checks" → "Checks"; GearPages.sources retired; "Data & checks →" → Records › Checks; records-tab.js:28 link removed. #pane-wfac and #pane-hydro → Network (labs.js:14 text). #pane-alloc → Capacity fold + column. Servicing chips 4 → 2. One System control, one Sort vocabulary. WORKSPACES.servicing follows. | M, 3–4 days | Medium: the workbook reads #wfac-body (keep the id; render before export) | four-tabs :33-36, :55-60; five-tabs :16-20, :26-36; pilot :103-108; vocabulary :51, :54-62; sections (WORKSPACES); reference (Data checks); svc-capacity / svc tests; labs; p4-settings |
| 3 | **Growth: Ledger into Forecast** | #pane-growth-ledger data-sub → timing; the Forecast panel gains By period (horizon table at any scope: rows = child nodes) + How sure + Since the last snapshot; full table = the developments list; cut-off kept inside (no behaviour change). `coming` aliases to it. | S–M, 2–3 days | Low–medium: ledger render trigger in showFootTab (analysis-tabs.js:110) | four-tabs; ledger tests; forecast-stage; pilot; vocabulary; ws-pages (coming); workspaces (WS 'coming' sub 'ledger') |
| 4 | **Capital: 4 views → 3** | DC timing + DC projects → "DC projects" (key timing) with both verdict columns (dcAnalysis + DI().model(), the second built lazily), Status filter, Funding fold [Lab, pv-hide]. Projects → "Construction" (key projects). The EA-to-construction spec joins EAs. DC timing tool result and "All DC timing →" open Capital › DC projects. Home's "DC projects late" keeps its source (ws-pages.js:495-497). A DC project row opens its `dcwork:` scope (already written to `ss=`). WORKSPACES.capital 5 → 3. | M–L, 4–6 days | Medium–high: two model families; Home figure; the funding lab | capital-ea-ui (67 regex asserts); four-tabs :48-57; sections; dc tests; pilot ('Capital › Construction'); vocabulary (:50 WS label 'DC projects' kept; :51 'Capital › DC timing' head) |
| 5 | **One development layout** | #ov-dev dissolved (About + timeline → Overview; Files & history → Records; Site → Network fold); syncDevHome removed. Verdict card removed (At a glance → Overview; flows → Servicing). Site-bar hidden parts removed; header tools + actions + ⋯. FSR review = Servicing view `svs=fsr`, one host (#site-bar-fsr, fsrSpec go). Capital one view on the map. Full-table-only blocks join their views. Dead `[data-ov-devsec]`, fsr.js:317 and exports SCOPES.dev removed. SITE 6 → 5. Precondition: owner decision 14 (Previous mode). | L, 5–8 days | Medium–high: duplicate ids (devtab-aerial / byIdShown devtab.js:24, devtab-site); tour steps | devtab; site-scope; devscope; sections (SITE); four-tabs (site inventory); click-destinations; fsr tests; nav-firstrun; tips TOUR |
| 6 | **Page host = the five-tab strip** (the core unification) | pageHTML renders the tab strip + chips from TABSUBS / chipsAt instead of the SITE / AREA / WORKSPACES bars and the Explore views bar; sections.js becomes the tab:sub registry over specs. Old pipes registered as svc:pipes; weekSpec + week() → one spec. One trail (siteTrail, page filter chips and the Growth drill → top-bar trail; the drill writes the plan filter). Servicing / Capital show "loading" instead of hiding. foot.primary restored on pages. ws-mode chips removed. Ship as 6a area pages → Home host tabs, 6b site / fsr, 6c views bar + ws chips. | L, 6–10 days | High: the largest UI change; ws-pages (50 regex asserts), workspaces (54) | workspaces; ws-pages; sections; layout-shell; shell; nav-connect; click-destinations; four-tabs; organization; plain-language; map-readability; layer-groups |
| 7 | **Home sidebar 9 → 5, Help, Settings** | sideHTML: Home · This week · Find · Help · Full map + role shortcuts + Labs (GROUPS, SIDE, EXPLORE and CAPITAL kept only as alias data); Start screen only in Settings; ☰ into the top bar on phones. Help: Start here · How it works · Glossary · How the app decides; one ROLES list; ASKS generated; Glossary + Definitions; change log into Help. ⚙ = one Settings sheet; stubs removed. Precondition: owner decision 12 (usage CSVs). | M, 3–5 days | Medium: tours and role lists | workspaces :17-26 (GROUPS, EXPLORE, CAPITAL, sideHTML regex); reference :122-124 (isOn, GUIDE_OF); nav-firstrun :19 (TOUR_ROLES); p4-settings; labs; topbar; approvals-guide; vocabulary (the tips.js "grouped: Planning…" string) |
| 8 | **Every scope kind** | HIDDEN for drawn / svc / file / object (§3.5). Records real at servicing scopes (its capacity source; wwReportsVsModel, plantFlows, wwRoster for that facility; "loads when needed" while plant-flows, ww-events and the roster load), replacing records-tab.js:72. File record sheet. Object scopes for DC project / EA / capital project / pipe / water facility; iiblock → block scope; EA and capital cards open as scopes. Records becomes a peer tab (drop its muted trailing style, four-tabs test 1). | L, 5–8 days | Medium: separately loaded data | analysis-tabs; four-tabs (HIDDEN, test 1 style pin); five-tabs :39 (HIDDEN.site regex); svc-scope tests; records tests; capital-ea-ui |
| 9 | **Words sweep** | README sections (Sections 1506, Explore 1515, Servicing and Capital 1545, Reference and This week 1554, Home 1563 — "seven entries" is already wrong — One home for tool results 1727, Scope-aware tabs 1762, Servicing scopes 1785); "Tool result tab" in 7 places; info.js tab-* cards and orphans; HOME_TOUR / TOUR; a MOVED audit. | S–M, 2 days | Low | vocabulary; plain-language; pilot; nav-firstrun |
| 10 | *(optional, owner decision 16)* **Page \| Map as one address** | Scope-first's persistent live-map slot beside every page and a Page \| Map toggle replacing "Full map / Open the map / ← Page / back bar". Needs a persistent `#map` slot; today renderPage moves the map out and back on every render (workspaces.js:207-215, :469-489). | XL | High | most shell and workspace tests |

**Order and why:**
- Phase 0 protects every old link before anything moves.
- Phase 1 delivers most of the click savings: tasks 1, 4, 5, 8 and 9 drop to their final counts with no structural change.
- Phases 2–4 are chip-level merges inside the existing shells. They cut the area chips to 11 and remove the four checks homes, the three DC timing surfaces and the three System controls.
- Phase 5 fixes the development views.
- Phase 6 is the point of the redesign: one navigation for pages and the map. It is safest after 2–5, because the tab strip it renders already has its final chips.
- Phase 7 removes the sidebar entries only once their content is one tab away.

---------------------------------------------------------------------------------------------------

## 9. Decisions only the owner can make

| # | Question | Options | Recommendation |
|---|---|---|---|
| 1 | Is SPEC §0 still binding, and SPEC §4's left-panel Data tab? | (a) §0 and §4 as written; (b) §0 binding, §4's Data tab superseded by bundle 6 (Records › Sources / Checks); (c) neither | **(b).** The five tabs at every scope and one destination carry the design. The Data tab was already folded into Records (README:1557-1558). |
| 2 | Ledger stage cut-off (Committed only · + Plan approved · + In review · Everything) | (a) keep it inside Forecast › By period; (b) drop it, let the Scenario Count drive By period, keeping the four stage colours in the stacked bars; (c) add "+ Plan approved" as a Scenario Count step | **(a) in phase 3, then (b).** One "which layers count" control (P1, P5). The stacked bars still show the "plan approved, not committed" share. |
| 3 | DC timing and DC projects | (a) one "DC projects" list with both verdicts from the two models; (b) two views | **(a).** Same projects, two questions (critic T1). Two columns keep both answers. |
| 4 | FSR review at a development | (a) Servicing view (`svs=fsr`); (b) a fold in Servicing › Network; (c) a sixth section | **(a).** Shareable, one host, Check FSR one click away. |
| 5 | Review outlets | (a) tool page reached from Records › Checks, a site's path and the QA/QC shortcut; (b) a Records view; (c) a Servicing view | **(a).** Keeps the editor (queue, 6 filters, map) intact, and keeps TABSUBS ≤4. |
| 6 | Team headings → role shortcuts | (a) "For your role", one ROLES list of 6 (today's 5 + QA/QC); (b) 5 roles only; (c) keep the headings | **(a).** Restores the one-click paths the headings gave. QA/QC is the only team with no role today. |
| 7 | Live-data features (Refresh live, Add source, Discover, Records since, Max per layer) | (a) keep under Records › Sources › Advanced; (b) remove them and the in-browser build | **(a) for this redesign.** Decide (b) with the data-architecture review: it decides whether buildProjects ships to the browser (critic D3). |
| 8 | Alerts | (a) wire scripts/build-alerts.js into the weekly job; (b) hide the Alerts UI until wired | **(b) now.** No workflow runs it (critic DF-07). Wiring it would key alerts by Previous keys (DM-03). |
| 9 | Lens | (a) map preset + the one System control, no tab switch (SPEC §7.4); (b) keep opening a tab | **(a).** The tab strip does the navigating; the lens says what the map shows. |
| 10 | Plan drill = scope | (a) drilling Peel › Brampton › plan sets the plan filter, so the map and every tab follow; (b) keep the page-local drill | **(a).** One "where" (P4). This is a visible behaviour change. |
| 11 | Overflows reported and measured flow at a plant / station | (a) keep on its Overview; Records gets sources and model-vs-report checks; (b) move to Records › Checks | **(a).** They are operating status, read with the headroom. Records is real without them. |
| 12 | Usage evidence before phase 7 | (a) ask pilot users for their Settings › Usage CSVs; (b) proceed on structure | **(a).** usage.js counts per browser only; the removals rest on structure and the ten tasks. |
| 13 | Inquiry draft | (a) development action only; (b) also an Export ▾ item for the open development | **(b).** Keeps muscle memory; both call one function with keepDev. |
| 14 | Previous mode | (a) retire it before phase 5 (DM-09, approved 2026-10-15 "for one release"); (b) keep it | **(a).** Phase 5 rewrites the development views that Previous mode still feeds. |
| 15 | New capabilities the tasks ask for | DC project +2-year delay (task 8); point inquiry draft (wire draftForPoint, tools-inquiry.js:229); "DC study inputs" workbook sheet (task 10) | **Separate PRs after phase 4.** They are features, not navigation. |
| 16 | Page \| Map single address with a live map beside every page (scope-first) | (a) phase 10 after phase 6; (b) no | **Decide after phase 6.** The continuity it promises (scope, tab and view kept) already lands in phase 6 at a fraction of the cost. |
| 17 | Start screen "Last workspace" | (a) becomes "Last place" (scope + tab + view); (b) keep | **(a).** Workspaces no longer exist as places. |

---------------------------------------------------------------------------------------------------

## 10. Risks

1. **Exports scrape panes by id.**
   - exports.js:144-153 (SCOPES `els`) and :256-257 (workbook `panelTableRows`) read #wcap-body, #water-body, #wfac-body, #plants-body, #ww-body, #growth-pipeline-body, #growth-census-body, #pane-dev-body and #scope-body.
   - Every phase keeps pane ids and changes only `data-sub` / `data-pane`.
   - Off-screen renders are deferred (growth-ui.js:36-45), so an export started from a page must render or `flushLater` first.
   - The `dev` scope is already unreachable and goes in phase 5.
2. **Pinned source text.**
   - 1,943 regex assertions in 178 files, 443 of the `assert.match(src(…))` form.
   - Twenty files pin navigation names. tests/vocabulary.test.js:54-62 ties every Help and MOVED name to a live chip.
   - A pure refactor breaks pins, so each PR edits its pins and its code together.
3. **Search routing is global.** goSug (search-filter.js:140-160) also serves the map. Page routing must apply only in page mode, through the `pnl:set` hook (workspaces.js:571-580).
4. **Late tabs.** Servicing and Capital stay hidden until their data loads (svc-tab.js:378-381), and a hidden tab falls back to Overview (analysis-tabs.js:83). On a page host, a Servicing link would land on Overview, so show "loading" instead.
5. **Two DC model families in one list** (dc-cost.js:279; dc-projects.js:58-90).
   - Both verdicts must survive.
   - Build the second model lazily.
   - Home's "DC projects late" keeps its source (ws-pages.js:495-497).
6. **Behaviour changes users will notice:**
   - the plan drill filters the whole app;
   - the lens stops opening tabs;
   - results started at a development keep it;
   - Old pipes, Review outlets and What's coming are one click further without a role shortcut.
7. **Phone.**
   - Five tabs plus a chip row at 390 px: the strip scrolls (analysis-tabs.js:117-118) and chips stay ≤3.
   - 38 `max-width: 700px` blocks.
   - The ☰ moves into the top bar.
   - The page-header search must be ≥44 px.
8. **The repo moves.** HEAD moved twice while the designs were written (fff631d, 60cd0e3, both navigation commits). Re-base each phase and re-check the line refs.
9. **Usage history splits** unless usage.js rows() maps old page ids and tab.sub keys through the alias table (phase 0).
