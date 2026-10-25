# Pros and cons of each recommendation

Companion to [the architecture review](../architecture-review.md).

Each recommendation was set against the strongest case against it: effort and who pays it (the owner, nearly
always), what could break, what users lose or relearn, test churn (1,943 regex assertions on source text in 178 test
files), ordering, weekly data and review cost, reversibility, and whether a cheaper option gets most of the gain.
Figures were re-measured on the shipped data where cheap (`node` over `data/`, grep, git history); what was not
reproduced is marked unverified. The parts were weighed separately, then cross-checked (44 claims re-verified), and
conflicting advice is resolved below. Where the report states one recommendation twice (a design row, its phase, its
Part 4 question), it is weighed once. Added, because no part had weighed them: L-IDS, M7, four appendix decisions
(AD-5, AD-9, AD-13, AD-17) and L-NET, the [infrastructure dependencies](infrastructure-dependencies.md) method the
review linked in `f87eca2`, which also corrected Part 2.4 #2 and #17. Line numbers are for `2a9d7fc`; in
`js/analysis-tabs.js`, `js/share.js` and `js/workspaces.js`, which phase 0 changed, the navigation parts cite `57c7ce6`.

## Summary

Effort: S a day or two, M up to a week, L one to two weeks, XL more. Risk is the chance of a visible regression.

**Data architecture (Part 1.2)**

| Id | Recommendation | Verdict | Reason | Effort | Risk |
|---|---|---|---|---|---|
| D-A | Content-hash data URLs | keep-with-change | ~4× less re-download, not "weekly"; version check mandatory | S–M | medium |
| D-B | Developments table from the weekly job | keep-with-change | Paint from it now via paint-then-swap; the rest waits on P4-1, M1 | L | medium–high |
| D-C | Load files when their view opens | keep-with-change | Idle load, `dc-infra` first, without late tabs | M | medium |
| D-C2 | Module manifest, lazy code | keep-with-change | 231 KB of code vs 5.4 MB of data; generate `sw.js`'s list | S | low |
| D-D | Snapshot v2 encoding | reconsider | −8% gzip; near zero once the table paints | M | medium |
| D-D2 | Cold file for second units, old permits | keep-with-change | Second units yes; old permits are the calibration | M | medium |
| D-E | Stop publishing unread files | keep-with-change | No visitor gains; exclude at publish | S | low |
| D-F | Manifest with `staleWhenNewer` | keep-with-change | Builders record input dates; check in PRs | S–M | low |
| D-G1 | Folders by role, renames | reconsider | Churn nobody sees; a registry gets the gain | L | medium |
| D-G2 | `scripts/lib`, archive probes | keep-with-change | Archive now; geometry with the hole rule | M | medium |
| D-G3 | Screenshots out; split README | keep-with-change | Stop committing new ones first | S | low |
| D-H | Alerts feed, frozen ledger | keep-with-change | UI already hidden; capacity alerts need no ids | S | low |

**Development model and data decisions (Part 1.3, Part 4)**

| Id | Recommendation | Verdict | Reason | Effort | Risk |
|---|---|---|---|---|---|
| M1 | Retire *Previous* counting | keep-with-change | Remove the switch; the rule stays as a fallback | S | low |
| M2 | Sticky development ids | keep-with-change | Opaque ids, history by file; measure before dropping SITE ids | L | high |
| M3 | One `dev-facts.js` | keep-with-change | Parity tests first; copies go in phase 5 | L | medium–high |
| M4 | One Files view | keep | Belongs inside phase 5 | L | medium–high |
| M5 | Rules on the data date | keep | Small; counts become reproducible | S | low |
| M6 | One plan / MTSA placement | keep-with-change | Any share for membership, shares for totals | S | low–medium |
| M7 | One classifier, one sampler (added) | keep-with-change | Fix the hard-coded role decode | S | low |
| P4-1 | Keep the live-data controls | keep-with-change | Add a counter; decide in wave 3 | S | low |
| P4-2 | Delete the startup index | keep-with-change | Delete the builder; keep paint-then-swap | S | low |
| P4-5 | Publish only receipts | keep-with-change | Larger receipt set; exclude, do not move | S | low |
| P4-6 | Compact servicing tables | keep-with-change | Second units now (~0.6 MB gzip) | M | medium |
| P4-12 | By-type "Left": relabel, recompute later | keep-with-change | Recompute now (~5 lines) | S | low–medium |
| P4-13 | Capital / EA changes on This week | keep-with-change | Wire now, hidden when empty | S | low |
| P4-14 | Count-once audit blocks deploys | reconsider | Wrong grouping; blocks code for data | S | medium |

**How the data relates (Part 2)**

| Id | Recommendation | Verdict | Reason | Effort | Risk |
|---|---|---|---|---|---|
| L-INF / L-8 | Link step, link files, development link table | keep-with-change | Columns in D-B's table, one `infra-links.json` | L | medium |
| L-NET | Affected by network trace (added) | keep-with-change | The buffer misses 97%; quick fix and ids first | L | medium |
| L-ID | One canonical file id | keep-with-change | The gain is parsing; `Muni\|fileId` as the key | S–M | medium |
| L-IDS | Other canonical ids (added) | keep-with-change | Record uids churn; area, EA, capital ids do not | S–M | low–medium |
| L-XW | Hand-reviewed crosswalks | reconsider | Nobody reviews today; one crosswalk | M | low |
| L-HOLE | Hole rule per layer | keep-with-change | Opt-in now; blocks unaffected | S | low |
| L-1 | History on today's developments | keep-with-change | With history by file and a PR check | S–M | medium |
| L-2 | DC ↔ capital status in the chip | keep-with-change | Same-system records, no project-number roll-up | S | low–medium |
| L-3 | File id, then council fixes | keep-with-change | Address fallback first | S–M | medium |
| L-4 | Servicing permit by number | keep | 960 vs 556 matches | S | low |
| L-5 | Census DA × block by area | keep | 7.64% of people misplaced | S | low |
| L-6 | Block 23's plant | keep | 546 of 557 pipes drain to Toronto | S | low |
| L-7 | Zone → water system table | keep-with-change | A field, not a link file; hold 8A | S | low–medium |
| L-9 | Build the alerts feed | reconsider | Fold into D-H's two halves | S–M | medium |
| L-10 | EA → DC mains | reconsider | Low precision | M | medium |
| L-11 | Facility and plant registry | keep-with-change | Derivations first; ids from GIS | M | medium |
| L-12 | Area × area tables | keep-with-change | Shares in `areas.json` | S | low |
| L-13 | Ward ids, imputation | keep-with-change | No imputation without polygons | S | low |
| L-14 | 2020 DC projects → capital | keep-with-change | Tag unreviewed; check 14 | S | low |
| L-15 | Related applications | keep-with-change | Fix `implied()`; no file | S | low |
| L-16 | Constraints on the boundary | keep-with-change | Fixes a false clear; raise its rank | S–M | low–medium |
| L-17 | Receiving pipe, path, pipe ids | keep-with-change | L-NET's first step, not "defer" | S–M | low |
| L-18 | Regional council reports | reconsider | Thin evidence; a hand list first | L | medium |
| P4-15 | Ask the Region (13/14, 8A) | keep | One email settles 2,282 points | S | low |

**Navigation structure (Part 3.2–3.3, with phases 2–6 and Part 4 #8)**

| Id | Recommendation | Verdict | Reason | Effort | Risk |
|---|---|---|---|---|---|
| N-RULE | Five tabs at every scope | keep-with-change | No clicks after phase 1; commit to phases 0–2 | L–XL | high |
| N-1 | Sidebar 9 → 5, role shortcuts | reconsider | Lengthens three paths; flatten if agreed | M | medium |
| N-2 | Find on every page | keep-with-change | All the click savings; keep the views bar a while | M | medium |
| N-3 / NP-6 | Pages render the tab strip | reconsider | 0 clicks, high risk, gate not measurable | L | high |
| N-4 / NP-3 | Ledger into Forecast | reconsider | One chip vs an active owner project | S–M | low–medium |
| N-5 / NP-2 | Servicing re-cut, checks move | keep-with-change | Fold Allocations with its CSV | M | medium |
| N-6 / NP-4 / P4-8 | Capital 4 → 3, one DC list | keep-with-change | 2026 DC lines share a key; ask on the rename | M–L | medium–high |
| N-7 | Records: one home for checks | keep | Checks 4 homes → 1 | M | low–medium |
| N-8 / NP-5 | One development layout | keep-with-change | Dead code first; keep a fallback path | L | medium–high |
| N-9 | Help with four sections | keep-with-change | Rename now; move data sections later | S–M | low–medium |
| N-10 | One Settings sheet | keep | "⚙ 3 → 1" | S–M | low |
| N-11 | One System control, sort words | keep-with-change | Same words only for same measures | S | low |
| N-12 | Keep Watch; no Data tab | keep-with-change | No top-5 copy of This week | S | low |

**Navigation delivery and decisions (Part 3.4–3.5, Part 4 #7–#11, Part 5)**

| Id | Recommendation | Verdict | Reason | Effort | Risk |
|---|---|---|---|---|---|
| NP-0 | Phase 0: alias layer | keep | Done; fixes a share-link bug | S | low |
| NP-1 | Phase 1: Find, `keepDev`, path line | keep-with-change | All 14 saved clicks; no P4-11 yet | M | medium |
| NP-7 | Phase 7: sidebar, Help, Settings | keep-with-change | ⚙ sheet and role list now | M | medium |
| NP-8 | Phase 8: tabs at every scope | keep-with-change | HIDDEN rows early | L | medium |
| NP-9 | Phase 9: words sweep | keep-with-change | Fix stale text now | S–M | low |
| NP-10 | Phase 10: Page \| Map | drop | XL for what phase 6 gives | XL | high |
| P4-7 | SPEC §0 binding | keep-with-change | Two questions: map panel, pages | none | none |
| P4-9 | Drop the Ledger cut-off | drop | Loses "+ Plan approved" | S | low |
| P4-10 | Role shortcuts after usage CSVs | keep-with-change | Count section bars, search, role first | S–M | low–medium |
| P4-11 | Plan drill sets the filter | keep-with-change | Two-part rule; phase 6 | M | medium |
| R-WAVES | Four-wave roadmap | keep-with-change | Fix wave 1; navigation through phase 2 | n/a | n/a |
| AD-5 | Review outlets as a tool page (added) | keep-with-change | Keep its sidebar entry for now | S | low |
| AD-9 | Lens stops opening tabs (added) | reconsider | Reverses an owner change of 10-16 | S | low |
| AD-13 | Inquiry draft also in Export (added) | keep | Already there | S | low |
| AD-17 | "Last place" start screen (added) | keep-with-change | Only with phase 6 | S | low |

## Where the weighing changed the recommendation

**Drop:** NP-10 (revisit only if users ask after phase 6); P4-9 (keep the cut-off as the ledger's local filter).

**Reconsider**
- **D-D:** only if D-B is dropped, as a shared columnar codec.
- **D-G1:** registry with D-A, inputs/reports split through D-E; no housing merge.
- **P4-14:** a hold in the weekly review gate, on the tree grouping.
- **L-XW:** one crosswalk (DC ↔ capital); facility ids from GIS; the rest waits for a reviewer.
- **L-9:** folded into D-H's two halves.
- **L-10:** reviewed suggestions only, after L-2.
- **L-18:** a hand list of key Regional reports first.
- **N-1:** flatten if the owner agrees; cut to 5 after usage counts.
- **N-3 / NP-6:** rename and trim now; count section-bar clicks first.
- **N-4 / NP-3:** decide with the ledger plan's Phase 7; cross-link meanwhile.
- **AD-9:** ask the owner; fix the comment that contradicts the code.

**Keep, with these changes**
- **D-A:** quote ~4×; inline the hash map; prune; mandatory version check; the map is the data registry.
- **D-B:** step 1 paints from `developments.json` via the existing hydration path; delete the Previous `buildIndex` pass.
- **D-C:** idle load with `dc-infra.json` first (or "loading" tabs); triggers only for history, capital, EAs.
- **D-C2:** generate `sw.js` from `index.html` with a parity test; defer lazy groups.
- **D-D2:** second units now; old permits stay unless the calibration is precomputed.
- **D-E / P4-5:** exclude at publish; the receipts include the five files `how.js` reads.
- **D-F:** `job`, `publish`, a tested `from`; builder-recorded dates; PRs fail, the weekly check warns.
- **D-G2:** archive now; helpers as touched; workflow split last.
- **D-G3:** a no-commit screenshot policy before the navigation phases; README split in phase 9.
- **D-H:** fix the text, stop the request; capacity alerts in wave 2; the ledger after block 23.
- **M1:** remove the switch only; reword the permit-only note; amend SPEC 1.6.
- **M2:** opaque ids for file developments; history by file; measure permit-only churn first.
- **M3:** parity tests now; copies deleted in phase 5; `factsOf` for five figures later.
- **M6 / P4-11:** filter by any share, totals by share; P4-11 in phase 6.
- **M7:** fix the role decode; a parity test instead of a merge.
- **P4-1:** usage counter; label refreshed counts; decide in wave 3.
- **P4-2:** keep `applyIndex` and paint-then-swap for `developments.json`.
- **P4-6:** second units now, independent of snapshot v2.
- **P4-12:** recompute now, with a before/after table.
- **P4-13:** wire now into the one This week spec.
- **L-INF / L-8:** link columns in D-B's table; one `infra-links.json`; PR checks.
- **L-NET:** dc-impact fix and "nearby" labels now; ids and scheduled network builds next; `affected.json` after a reviewed sample.
- **L-ID:** parsing fixes in place; the readable id as a display alias.
- **L-IDS:** fix record uids; a disappearing-id check instead of new prefixes.
- **L-HOLE:** opt-in per list now; drop blocks.
- **L-1:** with history by file and a PR check.
- **L-2:** status from each work's own same-system records; method shown.
- **L-3:** address fallback and Caledon typing first.
- **L-7:** a field on the zones.
- **L-11:** derivations first; registry from GIS ids.
- **L-12:** shares in `areas.json`; warn on a null name.
- **L-13:** normalise stated wards only.
- **L-14:** tag `reviewed: false`; check the 14.
- **L-15:** `implied()` lists resolved mentions.
- **L-16:** test on open; raise its rank.
- **L-17:** stable pipe ids in the next network build.
- **N-RULE / R-WAVES:** commit to phases 0–2 plus the small slices; corrected wave 1.
- **N-2:** keep Explore's views bar until Home hosts the area tabs.
- **N-5 / NP-2:** fold Allocations with its CSV and new alloc-box text.
- **N-6 / NP-4 / P4-8:** merge the 2026 DC lines once Part 4 #8 is answered; ask before renaming Projects.
- **N-8 / NP-5:** dead code and path line first; layout after the Previous switch goes.
- **N-9:** rename now; move the data sections later.
- **N-11:** shared state only if the lens drives it.
- **N-12:** keep Watch as it is.
- **NP-1:** two PRs; "100% of firm"; no P4-11 dependency.
- **NP-7:** ⚙ sheet and one role list now.
- **NP-8:** HIDDEN rows for servicing scopes and drawn areas first.
- **NP-9:** fix stale text now.
- **P4-7:** ask as two questions.
- **P4-10:** count section bars, Explore views, search and role; collect 2–4 weeks.
- **AD-5:** add Records and site paths; keep the sidebar entry.
- **AD-17:** with phase 6, with a fallback.

## Where recommendations pulled against each other, and the resolution

1. **D-B / P4-2:** delete `buildIndex` and its Previous pass; keep paint-then-swap for `developments.json` (a re-keyed index would be ~43% of the snapshot).
2. **D-H / L-9 / M2 / Part 4 #4:** capacity alerts need blocks, not ids (wave 2); watch and change alerts wait for ids.
3. **N-RULE / N-4 / N-6 / R-WAVES:** commit to phases 0–2 plus phase 4's EA move and tool link, phase 5's dead code and path line, phase 7's ⚙ sheet and role list, phase 8's HIDDEN rows.
4. **Allocations, fold or view (N-5 / NP-2):** fold; where allocations are stored has no bearing, since entries are made at each development (`demand-ui.js:108-115`) and the fold keeps the CSV.
5. **N-6 / NP-4 / P4-8:** the 2026 DC lines share `ln.p || ln.c` (`masterplan.js:832`, `dc-impact.js:28`); only non-DC reliefs lack a key; ask before reversing `tips.js:147`.
6. **P4-6 / D-D / D-D2:** second units now, without v2; about 0.6 MB gzip saved with the fields the app reads.
7. **M6 / P4-11:** a filter decides in or out: membership by any share, totals share-weighted.
8. **D-F / L-INF:** staleness fails in pull requests and only warns weekly; three inputs are built by hand.
9. **NP-1 / navigation-design §8:** phase 1 uses the page-local drill; P4-11 gates phase 6.
10. **R-WAVES / D-H / D-F:** "hide the alerts UI" is already true (`index.html:176`); builder dates replace `staleWhenNewer`.
11. **M3 / Part 0:** the mutation was fixed in `e1479e2`; `mergeProject` still writes placement onto given records.
12. **D-C / N-3 / NP-1:** lazy files hide the Capital tab (`svc-tab.js:381`) and Find's hits: start `dc-infra.json` first or show "loading" tabs.
13. **M3 / NP-5 / R-WAVES:** only M3's parity tests must precede phase 5, which deletes the devtab copies itself.
14. **N-1 / N-RULE:** the flatten is offered to the owner, not committed (it drops the 10-23 QA/QC heading).
15. **L-17 / L-NET:** "the 1 km brief catches 92% of sites" measured nearness, not dependence; the trace shows the 400 m buffer finds 2.9% of wastewater dependencies.
16. **L-2 / `f87eca2`:** 3 of 4 "Paused but under way" lines were a cross-system roll-up; the same-system rule removes false contradictions.

## Data architecture

### D-A · Version data by content, not by build
**What:** tag each data URL with its file's content hash instead of the code build (`js/util.js:15-24`), keep one data cache and a data-schema check.

**Pros**
- Across 111 deploys (10-16 to 10-24) a once-a-day visitor fetched 48 MB gzip; with hashes about 11 MB (after every deploy: 667 → 18 MB).
- The hashes exist at deploy (`build-sources-index.js:24`, `:37-44`); two test files pin today's tag.
- The offline cache survives deploys; today `sw.js` deletes it on each (`:234-238`).

**Cons**
- Data is not weekly: it changed on 8 of 9 days (29 commits, mostly hand rebuilds), so the gain is about 4×.
- Timestamps alone change hashes (`build-areas.js:286`, `changelog.json`), so most of the 6.0 MB eager set still re-downloads weekly.
- Pages ignores query strings: a deploy mid-load can cache new bytes under an old hash, so the version check is mandatory (frequency unverified).
- The map must be inlined into `index.html`, old entries pruned (42 MB per snapshot), and a plain-URL fallback kept.

Effort S–M · Risk medium (every fetch) · Reversible yes, one deploy · Depends on nothing

**Alternatives**
- Network-first data with ETag revalidation (~10 lines): no map, 29 conditional requests per load, no instant cache-first start.

**Verdict: keep-with-change.** Do it with the map inlined, pruning on activate and a mandatory version check; quote about 4×; make the map the name → path + hash registry D-C and D-G1 use.

### D-B · Publish one developments table, built in the weekly job
**What:** `scripts/app-devs.js` plus plan, zone and plant tags writes `data/developments.json` after Tree counts; the app paints from it and loads `snapshot.json` only for detail, exports and audits.

**Pros**
- Removes the per-visit rebuild: 1.2 s parse and 4.4 s `buildAppDevs` at 792 MB RSS in Node (a phone is slower, unverified).
- 6.2 MB / 0.78 MB gzip with the list and filter fields, against a 4.07 MB gzip snapshot; about 6 s of weekly CPU.
- One grouping: `app-devs.js` already feeds `build-dc-gate`, `build-ledger` and 18 test files; the paint-then-swap path exists (`snapshot-index.js:9-14`, `app.js:686-690`).

**Cons**
- Wider than "detail": 131 reads of `p.records` in 38 files, and the default filters read records (`app.js:276-280`, the search text at `:340`).
- Weekly tags go stale when zones or blocks are rebuilt by hand; the table must carry mapped and nearest zone (`p.pzNear`).
- While Refresh live and Previous stay (P4-1, M1), the browser build stays: two paths, already differing in units-from-text (`build-snapshot-index.js:62-69` against `app.js:711-715`).
- 21 test files read `app.js`'s source; a ~6 MB file is committed weekly.

Effort L (step 1: M) · Risk medium–high · Reversible yes, with the browser build as fallback · Depends on Tree counts; the end state on P4-1, M1

**Alternatives**
- The browser build in a Web Worker (`docs/perf-audit.md` #6): one code path, a responsive UI, no new file.
- Re-key the old startup index on the trees and publish it: better only if the table is abandoned, since it is about 43% of the snapshot.

**Verdict: keep-with-change.** Build `developments.json` from `app-devs` after Tree counts and paint from it through the existing hydration path while the snapshot loads on idle, deleting the Previous `buildIndex` pass (`build-snapshot.js:185`); only the end state, the snapshot for detail alone, waits on Part 4 #1 and #3.

### D-C · Load each data file when its view first opens
**What:** only the snapshot, tree counts, council decisions, areas and servicing load at start, plus small Home summaries; the rest waits for its view.

**Pros**
- 14 deferrable files: 9.51 MB raw / 1.36 MB gzip, 22.7% of eager gzip; less parse for visits that never open Capital or Servicing.

**Cons**
- Without D-B the snapshot is about 75% of eager gzip; after D-A returning visitors already have the rest.
- Late tabs: `#ftab-dca` stays hidden until `dcInfra` loads (`svc-tab.js:381`), a hidden tab falls back to Overview (`analysis-tabs.js:83`), and Find's place hits need areas, servicing and dcInfra (`search-filter.js:116`, `:120`, `:129`); `dc-infra.json` is not on the eager list.
- Home summaries are new files on mixed cadences: the drift Part 0 fixed.
- Every consumer must wait (the DC gate has 16, including the filter, `app.js:337`); a missed wait is a blank table or a wrong export.

Effort M (idle: S) · Risk medium · Reversible yes · Depends on D-A's registry

**Alternatives**
- Start the non-Home files after first paint, on idle (S, no new files).

**Verdict: keep-with-change.** The idle deferral now, `dc-infra.json` first (or "loading" tabs, navigation-design §10.4); per-view triggers only for history, capital and EAs; no Home summary files.

### D-C2 · A module manifest and lazy code groups
**What:** one manifest from which `index.html`'s 154 scripts, `sw.js`, eslint and tests derive; `PeelLazy.need(group)` loads about 231 KB gzip of labs, tools, exports, help, tour and ledger code on demand.

**Pros**
- One edit per new module instead of three; 27 test files read `sw.js`'s hand copy.
- About 20% of first-load JS could wait.

**Cons**
- Small: 231 KB gzip against 5.4 MB of eager data, and the JS is cached per build.
- No build step: generated tags mean the committed `index.html` is not what ships, or a runtime loader the preload scanner cannot see.
- Self-registering modules fail silently when lazy; lazy files escape eslint's no-undef (`eslint.config.mjs:7-8`); 55 test files read `index.html`.

Effort S (manifest) / M (lazy) · Risk low / medium · Reversible yes · Depends on nothing

**Alternatives**
- Generate `sw.js`'s list in the deploy step that already rewrites it (`site.yml:228`), plus a parity test.

**Verdict: keep-with-change.** Generate `sw.js` from `index.html` with a parity test now; lazy groups only if a phone trace shows JS cost matters.

### D-D · Snapshot v2 encoding
**What:** dictionaries and short keys, dropping constant or derivable fields (`newBuild`, `municipality`, `kind`, the uid prefix) after flipping the decoders' `newBuild` default.

**Pros**
- Parsed size 42.1 → 23.0 MB; `newBuild` is true on 85,141 of 85,141 records; weekly blobs shrink by about 19 MB.

**Cons**
- Gzip only 4.04 → 3.72 MB (−8%), about 90 ms of a 4.4 s build; decoded memory barely moves.
- 17 scripts read the snapshot, 8 without the shared decoder; three decoders default `newBuild` to false (`app.js:714`, `scripts/build-snapshot.js:62`, `scripts/snapshot-summary.js:9`).
- The change week trips the shrink guard and the data check; after D-B the user gain is near zero.

Effort M · Risk medium · Reversible yes, with a transition week · Depends on D-B's decision

**Alternatives**
- If re-encoding, the `columns + rows` form `servicing-permits.json` already uses.

**Verdict: reconsider.** Not worth −8% gzip; only if D-B is dropped, as a columnar codec shared with other files.

### D-D2 · Move second units and pre-2021 completed permits to a cold file
**What:** move the 31,944 second units (15.6 MB) and 21,427 pre-2021 completed permits (10.2 MB), 22.3 MB together, out of the snapshot.

**Pros**
- Second units never form developments (`phases.js:880-884`); with the fields the app reads they measured 0.78–0.90 MB gzip as a table, against 1.37 MB as records.

**Cons**
- Second units are not cold: servicing loads (`svc-data.js:130-131`), the infill layer (`layers.js:362`) and the reports (`reports.js:164`) read them.
- Pre-2021 permits are the Forecast's calibration (`COHORT_YEARS`, `js/timing.js:57`, used at `:116-117`): without them observations fall 11,330 → 2,422 (−79%) and 9,911 developments (11,551 units) leave the screens.
- 3,623 of them sit inside 248 file developments whose completed counts need them.

Effort M (second units) · Risk medium; high for pre-2021 · Reversible yes · Depends on `data-check.js` learning the new file

**Alternatives**
- Precompute calibration and completed counts weekly; only then can pre-2021 permits go cold.

**Verdict: keep-with-change.** The second units now, as a compact table loaded with servicing (P4-6); drop the pre-2021 move unless the calibration is precomputed.

### D-E · Stop publishing what the app never reads
**What:** move 3.71 MB of reports, inputs and probes out of the published folder; drop the legacy census copy in `areas.json` (194 KB) and `servicing.json`'s old drainage areas (147 KB).

**Pros**
- 3,707,212 bytes deploy and are never fetched; the census copy is read only when `censuses` is missing (`plan-areas.js:22`).

**Cons**
- No visitor gains, and nothing becomes private (the repo is public).
- Some are receipts: `how.js:28-30`, `:38`, `:50` reads five, and `privacy-data.test.js` scrubs two for publication.
- Moving touches 12 test files, 20 scripts or workflows, `sources.test.js` and `site.yml:163`; the drainage areas wait for L-5.

Effort S (exclusion) · Risk low · Reversible yes · Depends on P4-5

**Alternatives**
- `publish: false` in `sources.json` and one removal after `cp -r … data` (`site.yml:243`).

**Verdict: keep-with-change.** Exclude at publish instead of moving; drop the census copy now, the drainage areas with L-5.

### D-F · One dataset manifest that drives the build
**What:** add `job`, `inputs`, `consumers`, `publish` and `staleWhenNewer` to `data/sources.json`, and generate the weekly `git add` list, publish exclusions and the README data table from it.

**Pros**
- Hand metadata has drifted (`from` on 21 of 53 entries); the `git add` list is 17 hand-kept paths (`site.yml:163`), the class of Part 0's `96ab5cf` hold.
- An input-date check would have flagged the DC gate (10-20) as older than the trees (10-23).

**Cons**
- Five more hand fields; `consumers` cannot stay true where paths are built at run time (`plan-areas.js:25`).
- A generator behind the weekly commit can drop or add a file silently.
- The gate drift is already caught by a PR check (`2421eb2`), and link files record their own input dates.
- A weekly hold would trip most weeks: `blocks.json`, `dc-infra.json` and `svc-census.json` are built by hand or in probe modes.

Effort S–M (as changed) · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Builders record their inputs' dates; a pull-request check fails on a newer input (like `2421eb2`); the weekly data check only warns.

**Verdict: keep-with-change.** `job`, `publish` and a tested `from`, plus that builder-recorded date check; skip `consumers`, `staleWhenNewer` and the README table.

### D-G1 · Group `data/` by role, rename, merge housing
**What:** folders by role (`developments/`, `areas/`, `servicing/`, `capital/` …); rename `dc-gate` → `servicing-gate`, `das` → `das-2021`; merge `peel-housing` into `housing`.

**Pros**
- 50 flat files mix products, inputs and reports; the `dc-gate` name misleads.

**Cons**
- Churn nobody sees: 33 fetch sites, 52 test files, 56 scripts, 53 manifest keys.
- `sw.js:200` revalidates only top-level `data/*.json`; sub-folders fall to cache-first (pinned in `data-loading.test.js:72-76`).
- Renaming `dc-gate.json` but not `js/dc-gate.js` (16 dependents) trades one mismatch for another; the housing merge couples a hand build and a probe build to save one 10 KB request.

Effort L · Risk medium · Reversible yes, at cost · Depends on D-A's registry

**Alternatives**
- Do nothing: the prefixes (`svc-`, `dc-`, `master-plan-`) already group the files.

**Verdict: reconsider.** Build the registry with D-A and the inputs/reports split through D-E; folders and renames later; no housing merge.

### D-G2 · Shared `scripts/lib`, archive the probes, split `probe-sources.yml`
**What:** one library for fetch and retry, point-in-ring, simplify and the Peel bounding box; archive about 15 probes; split the probe workflow by purpose.

**Pros**
- 24 fetch helpers, 10 point-in-ring and 9 simplify copies; the probe workflow is 515 lines with 44 modes, 15 missing from its description.

**Cons**
- One bad retry change breaks every weekly builder against services the tests never reach.
- The point-in-ring copies treat holes differently; merging moves outputs, so it must land with L-HOLE.
- `GITHUB_TOKEN` pushes trigger no workflow (`site.yml:3-6`), so a split needs `workflow_call`; 26 test files require scripts by path.

Effort M (lib) / S (archive) · Risk medium / low · Reversible yes · Depends on L-HOLE for geometry

**Alternatives**
- Extract helpers only when a script is next edited.

**Verdict: keep-with-change.** Archive and fix the mode list now; share fetch and CLI helpers as scripts are touched; geometry with the hole rule; the workflow split last.

### D-G3 · Move the screenshots out; split the README
**What:** move 206 MB of screenshots to a release or orphan branch, and split the 223 KB README into a short README plus `docs/guide/`, `docs/method/`, `docs/data/`.

**Pros**
- 1,496 JPGs and 11 PNGs (203.6 MB) ride on every CI checkout; the README is 3,149 lines in 73 flat sections.

**Cons**
- `docs/design-audit.md` cites its screenshots (2.0 MB); without a history rewrite only checkouts shrink, and a rewrite means force-pushing `main`.
- It does not stop growth: navigation-design §8 asks for two screenshots per PR, and past rounds added 11–26 MB each (`docs/workspaces`, `docs/four-tabs`, `docs/step2`).
- A README split breaks 9 `README:NNN` citations and `definitions-text.test.js:26`; phase 9 rewrites the same text.

Effort S (screenshots) / M (README) · Risk low · Reversible yes · Depends on NP-9 for the README

**Alternatives**
- Stop committing new screenshots: attach them to the PR or a release.

**Verdict: keep-with-change.** A no-commit screenshot policy before the navigation phases; move existing sets later (keeping `docs/design-audit/`); split the README in phase 9.

### D-H · The never-built outputs: the alerts feed and the frozen ledger
**What:** hide the alerts UI now, wire `build-alerts.js` once development ids are stable, keep the Forecast's "Since the last snapshot" fold, and run `build-ledger.js` on its annual procedure.

**Pros**
- No workflow runs either builder; as written, alerts would use the Previous grouping (`build-alerts.js:85`) and give 641 of 2,745 developments no plant.
- The ledger run is due ("Once a year, in the fall", `docs/ledger/annual-procedure.md:9`).

**Cons**
- "Hide the UI" is already true (`index.html:176`); the visible fault is help text promising a Monday feed (`info.js:83`, `README.md:1560`).
- Waiting for ids (wave 3) likely means never, though the capacity half needs only blocks.
- The ledger diff joins on an `id` it calls stable (`ledger-snapshot.js:18`, `:117-118`); a frozen file run before L-6 keeps block 23's wrong plant for good.

Effort S · Risk low · Reversible yes; the frozen ledger by design no · Depends on L-6 (ledger), M2 (watch alerts)

**Alternatives**
- Do nothing: one failed request per load and wrong help text.

**Verdict: keep-with-change.** Fix the text and stop the request now; capacity alerts on blocks via `app-devs` in wave 2; watch and change alerts after ids; the ledger after the block 23 fix, with a file-id fallback in its diff.

## Development model and data decisions

### M1 · Retire the *Previous* counting mode
**What:** remove the Scenario's "Previous count" (approved 2026-10-15 "for one release") before the development-layout work, and route every Node tool through `scripts/app-devs.js`.

**Pros**
- One Peel total: the switch flips between 228,803 and 254,594 units.
- A precondition of phase 5, already approved (`tree-counts.js:10`); the switch is about 16 references in 8 files, 3 test files.

**Cons**
- The rule stays as the fallback for all 20,138 permit-only developments, a failed tree load, changed files and entered counts (`tree-counts.js:78-86`).
- Its note "Previous count: no tree for this development" shows on every permit-only development (`:140`); `SPEC.md:95` and `:159` need amending.
- The Node half touches the weekly job: history is written at `site.yml:52`, before Tree counts at `:81`.
- The live comparison goes, with no usage evidence either way.

Effort S (switch) · Risk low · Reversible yes · Depends on L-1 for the Node half

**Alternatives**
- Move it to Labs if the comparison is still wanted.

**Verdict: keep-with-change.** Remove the switch, reword the note ("counted from its permits"), keep the fallback, ask the owner to amend SPEC 1.6, and route Node tools through `app-devs` once history moves behind Tree counts.

### M2 · Sticky development ids
**What:** `DEV-<MUN>-<root file id>` for file developments and `SITE-<MUN>-<ROPADRID>` for permit-only ones, inherited weekly by file majority, old keys as aliases in `dev-ids.json`.

**Pros**
- 1,180 of 4,626 file developments (25.5%) get their own history instead of the parent's copy (`translateHistory`, `tree-groups.js:133`, called at `app.js:636`, `:682`).
- File majority works: over three tree rebuilds it kept 3,971 same-root and 238 changed-root ids; 417 changed, against 474 address-key changes.
- SITE ids are feasible: 19,734 of 20,138 permit-only developments (98.0%) match exactly one address point.
- Alias plumbing exists (`migrateKeys`, `migrateAllocations`; tree-counts `keyChanges`, `merged`), lowering the migration cost.

**Cons**
- The build becomes stateful: a bad or held week propagates; a rebuild from scratch gives other ids.
- About 4.4 MB raw / 567 KB gzip before aliases (rough), growing weekly.
- `DEV-<root>` names go wrong: 238 of 4,626 would carry a non-root after three rule changes.
- Wide and hard to undo: `p.key` appears 266 times in `js/`, 24 test files touch key resolution, aliases in shared links are forever; address points build after the DC gate (`site.yml:113`).

Effort L · Risk high · Reversible hard once in links · Depends on L-1

**Alternatives**
- Key history by file id and derive a development's history from its files: no registry, nothing orphaned.

**Verdict: keep-with-change.** Opaque file-majority ids (`DEV-MIS-000123`) for file developments, and history by file; measure permit-only address-key churn over the last three rebuilds before choosing address keys over SITE ids (the size saving is unverified).

### M3 · One derived-figures module (`dev-facts.js`); delete the devtab copies
**What:** one pure `factsOf(p, {basis, commit, asOf})` computes units, completed, left, stage, committed and people for every page; the drifted copies in `devtab.js` go.

**Pros**
- Measured drift: completed uncapped for 27 developments (1,050 units); per-file "counted" labels disagree with the tree for 69 of 491 multi-file developments (10,919 units).
- `devtab.js` (1,496 lines) redefines 25 functions of other modules, five drifted; SPEC 1.6's left == planned − completed is enforced in one place.

**Cons**
- L in wave 3, paid by the owner; 67 test files reference the modules, some through source pins.
- A cache per (data, criteria, basis, commit, asOf): stale-cache bugs look like wrong numbers (Part 0's `e1479e2` was one).
- `mergeProject` still writes permit placement onto the records it is given, so `factsOf` must not call it on shared records.
- Phase 5 rewrites `devtab.js` too.

Effort L · Risk medium–high · Reversible yes · Depends on permit placement stored on the development

**Alternatives**
- Parity tests over `tests/helpers/real-devs.js` (S): drift caught without the refactor.

**Verdict: keep-with-change.** Parity tests now; the devtab copies deleted inside phase 5; `factsOf` only for units, completed, left, committed and stage, after permit placement is stored on the development.

### M4 · One Files view for a development
**What:** one Files view (Records at a development) replaces Overview › Files & history, Records › Files and Explore › site › Files.

**Pros**
- Two renderers draw the same tree entry; all three designs agree; Records already hosts the devtab node (`records-tab.js:41-55`).

**Cons**
- It is phase 5 work; the duplication is two, not three (`sections.js:27`, `:92` are one spec).
- The legacy list stays while `treeGrouped` can be false; exports read these panes (`exports.js:260-261`).

Effort L (in phase 5) · Risk medium–high · Reversible per PR · Depends on NP-5

**Alternatives**
- Unify the two tree renderers only (S), if phase 5 slips.

**Verdict: keep.** Inside phase 5, with one tree renderer as its data-side piece.

### M5 · Dormant, stalled and lapse on the data date
**What:** compute dormant, stalled and the servicing-permit lapse against the data date, not `Date.now()`.

**Pros**
- Same data, same counts, in every test; matches `build-ledger.js:40`; about 10 call sites in 6 files.

**Cons**
- Users see little: a week of clock adds 2 dormant (101 units) and 3 stalled.
- Ages must say "as of 2026-10-19", and a live refresh mixes source dates, so it needs a rule (the newest pull date).

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Pass the data date only in `holdDormant` (one line).

**Verdict: keep.** Small, and it removes numbers nobody can reproduce.

### M6 · One plan / MTSA placement
**What:** filters, Growth in an area and the ledger all use `plan-tables.js areaIdsOf` (tree area shares, else the point).

**Pros**
- 52 developments (3,966 units) fall in another plan and 93 in another MTSA by screen; three rules today (`app.js:323`, `:324`, `ledger.js:173`).

**Cons**
- A boundary development is in both plans' filters (any share, `plan-tables.js:57`), so summing lists double counts.
- Shares exist only for tree developments; `build-ledger.js` has its own placer; ledger figures move for 52 / 93 developments.

Effort S · Risk low–medium · Reversible yes · Depends on nothing

**Alternatives**
- Wait for one weekly placement (L-INF).

**Verdict: keep-with-change.** Route the MTSA filter and ledger through `areaIdsOf` now; state the rule in two parts: membership by any share, a plan's totals share-weighted (`plan-rollup.js:11-13`).

### M7 · One file classifier and one land-overlap sampler (added)
**What:** Part 1.3 lists 3 classifiers of a planning file and 4 land-overlap samplers for `dev-facts.js` to own; M3 narrows `factsOf` to five figures, so these have no owner.

**Pros**
- `fileKind` (`phases.js:1310`) and the tree role (`tree.js:69`) disagree on 23 of 6,316 applications.
- A latent bug: `file-tree.js:15-16` decodes roles by a hard-coded index, while the build assigns codes by first appearance (`build-tree-counts.js:122`); they match today, and no test pins it.
- Samplers differ: 10×10, 12×12 twice (one a `devtab.js:476` copy), 24×24.

**Cons**
- 0.4% of applications; a merge changes their phase rules.
- `stageOf` is stored in the snapshot; the 10×10 sampler feeds the grouping, so changing it can move Peel totals.

Effort S · Risk low · Reversible yes · Depends on phase 5 for the copy

**Alternatives**
- Merge the classifiers (M), if the 23 cases matter to users.

**Verdict: keep-with-change.** Decode roles through `data.codes` (as `tree-groups.fileRows` does) with an order test; drop the `devtab.js` sampler copy in phase 5; a parity test instead of a classifier merge.

### P4-1 · Keep Refresh live / Add source / Discover / Records since / Max per layer
**What:** keep the live-data controls under Records › Sources › Advanced, rather than removing them and the in-browser build.

**Pros**
- Nobody loses a feature; fresher data when an update is held.

**Cons**
- A refresh mixes count models: changed files fall back to Previous (`tree-counts.js:86`).
- `buildProjects` (124 KB) keeps shipping, every D-B consumer must accept both shapes, and added layers are invisible to every link file.
- Entered counts rebuild in the browser anyway (`app.js:183-200`); no usage counter exists.

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Remove them and the browser build, with entered counts as an overlay, if usage shows no use.

**Verdict: keep-with-change.** Keep them, label refreshed counts "previous rule", add a usage counter, and decide at the start of wave 3.

### P4-2 · Delete the startup index; the developments table takes its job
**What:** delete `bootFromIndex`, `snapshot-index.js` and `buildIndex`, and let D-B's table do the job.

**Pros**
- Dead (`STARTUP_INDEX = false`, `app.js:567`) and on the wrong grouping (it would paint 23,963 developments, then swap to 24,764).
- Every weekly run builds and discards it (`build-snapshot.js:185`), about 2.8 s.

**Cons**
- `countUnitsFromText` lives in its builder and is used by `app-devs.js:16` and `audit-tree.js:22`.
- Deleting `applyIndex` and the paint-then-swap guard (`app.js:221`) removes the plumbing D-B step 1 paints through.
- Test churn: `snapshot-index.test.js`, `data-loading.test.js:42-48`, `build-guards.test.js:199`, the script lists.

Effort S · Risk low · Reversible yes · Depends on moving `countUnitsFromText`

**Alternatives**
- Leave it gated: 2.8 s of weekly CPU.

**Verdict: keep-with-change.** Delete `buildIndex`, its weekly pass and the `snapshot-index.json` path; keep `applyIndex` and paint-then-swap, pointed at `developments.json`; move `countUnitsFromText` first.

### P4-5 · Publish only the reports the Sources page links as receipts
**What:** keep publishing the linked receipts; move the rest out of the published folder.

**Pros**
- 3.71 MB never fetched leaves the artifact.

**Cons**
- Visitors save nothing; the receipt set is larger (`how.js` reads five more, 2.61 MB), so moving the rest saves 1.10 MB.
- Moves touch six writers, `site.yml:163` and `sources.test.js`.

Effort S · Risk low · Reversible yes · Depends on D-F's `publish` flag

**Alternatives**
- A publish exclusion in the Public build step (`site.yml:238-245`).

**Verdict: keep-with-change.** Exclude at publish through the manifest.

### P4-6 · Permit-only developments and second units as compact servicing tables
**What:** store permit-only developments and the 31,944 second units as compact servicing tables, not snapshot records.

**Pros**
- Second units are 15.6 MB raw / 1.37 MB gzip; a table with the fields the app reads (uid, ref, address, point, phase, units, events) measured 5.47 MB / 0.78 MB gzip, saving about 0.6 MB gzip.
- They serve only as one-permit servicing sites (`phases.js:897-905`) and the infill layer (`layers.js:362-369`).

**Cons**
- Permit-only developments are full developments everywhere: they need D-B and lazy records first.
- The review gate counts records per source (`data-check.js:37-39`): Brampton permits drop about 57% and the week is held unless it learns the file.
- A live refresh brings full records back, so one source has two shapes; the saving is less than D-A's per deploy.

Effort M · Risk medium · Reversible yes · Depends on `data-check.js`; D-B for permit-only

**Alternatives**
- Second units only (D-D2).

**Verdict: keep-with-change.** Second units now, independent of snapshot v2, with `data-check.js` taught the file; permit-only developments after D-B and lazy records.

### P4-12 · Growth's by-type "Left": relabel "To permit" now, recompute later
**What:** the by-type "Left" column is planned − permitted; relabel it "To permit" now and recompute it as left to build later with `dev-facts.js`.

**Pros**
- The relabel changes no numbers (about six strings, no pinned header) and matches "Left to permit" in `area-select`.

**Cons**
- Growth's table still will not match its tile: 194,013 "To permit" beside 198,100 "Left to build" (4,087 units over 51 developments).
- "Later" waits on wave 3 for about 5 lines (`typeBuildout` already apportions `remaining`, `demand.js:468-493`).
- The recompute costs too: figures move on Growth's by-type table and the development's table, `tests/demand.test.js:151` tests the values, and the by-type unbuilt is an estimate with an "unknown" remainder.

Effort S · Risk low–medium · Reversible yes · Depends on nothing

**Alternatives**
- Show both columns: tight at 390 px.

**Verdict: keep-with-change.** Recompute "Left to build" by type now, with a before/after table in the PR; "To permit" only beside "Left to permit" tiles.

### P4-13 · Capital contract and EA page changes on This week
**What:** list capital contract and EA page changes on This week once those files have any.

**Pros**
- The model is written and unused (`capital-ea-model.js:292-306`); 10-15 against 10-19 matched 3,157 of 3,157 ids with 0 changes.

**Cons**
- Every committed version is empty (2 capital, 4 EA builds), so nothing can be checked on real data.
- This week already shows on about 10 surfaces; adding a section before they are one adds it to each copy.

Effort S · Risk low · Reversible yes · Depends on the one This week spec

**Alternatives**
- Do nothing: Needs attention already flags DC slips.

**Verdict: keep-with-change.** Wire it now into the one This week spec, hidden when empty, tested on a fixture.

### P4-14 · Make the deploy's count-once audit blocking
**What:** remove `continue-on-error` from the deploy job's Duplicate audit now that it reads 0.

**Pros**
- Reads 0 in 6.5 s; one line (`site.yml:217`); non-blocking was red for days and ignored.

**Cons**
- Wrong grouping: `audit-snapshot.js:20` audits Previous (23,963 developments), not the 24,764 shown.
- A data problem would block unrelated code (the 10-19 false positive: about 6 days), with no override; fixtures already cover the rules (`tests/audit.test.js:41`).

Effort S · Risk medium as written · Reversible yes · Depends on the audit moving to `app-devs`

**Alternatives**
- A hold in the weekly review gate, which has an override and opens the review issue.

**Verdict: reconsider.** On the tree grouping, as a hold in the weekly review gate, not a deploy blocker.

## How the data relates

### L-INF / L-8 · A build-time link step, link files and a precomputed development link table
**What:** `scripts/build-links.js` runs after Tree counts and after capital and EAs, writing `dev-ids`, `file-links`, `dev-links` (zone, block, plant, plan, DA, ward, trunk per development), `area-links` and `infra-links.json`.

**Pros**
- One answer per join: three development → plant placers disagree (the alerts placer gives no plant to 641 of 2,745; data-relationships.md J29).
- Drift becomes visible: the gate's 231 missed developments came from a newer input; trees were rebuilt on 6 days of one week, the gate on 1.
- It stores links computed but never kept (relief pairs for 952 trunks, DC ↔ capital status).

**Cons**
- 7 steps over waves 1–4, paid by the owner; likely more code than it deletes (`dcCapitalIndex` is 20 lines, `tagAreas` 18).
- Runtime joins stay for what-ifs, drawn areas and Refresh live (P4-1): two paths that must agree.
- 8 weekly steps are continue-on-error (`site.yml:57-114`) and three builders are not weekly, so staleness moves rather than goes.
- 12 new files, each needing a receipt (`sources.test.js:19`); 59 test files reference the modules whose joins move.
- `dev-links` duplicates D-B's table: 156 KB gzip before the DA, trunk and DC columns, stale on hand rebuilds of zones and blocks.

Effort L · Risk medium (a wrong link is wrong everywhere) · Reversible yes, with runtime fallbacks · Depends on Tree counts, M2

**Alternatives**
- Wave-1 fixes only (L-2's system check, L-5, L-6): most of 2.3's visible errors at S each.

**Verdict: keep-with-change.** Development links as columns of D-B's table, one `infra-links.json`, one shared placer for runtime cases; staleness checked in pull requests, not by holding the weekly update.

### L-NET · Affected developments by network trace, not radius (added; infrastructure-dependencies.md)
**What:** a graph of the existing network keyed by the Region's ids; each project placed on it as effect records; each development's path stored weekly; "affected" means on that path, tested against first homes.

**Pros**
- The 400 m buffer the app uses finds 238 of 8,113 wastewater (development, project) pairs (2.9%), and 383 of its 621 pairs (61.7%) are not on the path; water 347 of 7,821 and 270 of 617 (re-counted in its §9.1).
- Large misses: 22-2255 reaches 1,511 developments (145,123 units) by the network, 10 by the buffer.
- Cheap to run (about 18 s for 20,990 developments); 139 developments (35,475 units) connect through a main not built before their first homes.
- A quick fix stands alone: dc-impact's tier A skips sites in a block (`dc-impact.js:140`), so only 34 of 174 such pipeline developments (52,330 units) pass it.

**Cons**
- Ten data gaps first, in order (§6): stable ids, stations and force mains in the graph, small pipes (M), a facility registry, sticky ids (M2), outlet reviews, and a capital layer for facilities (L, a new source).
- "On its path" is not "needs it": pipe results are off (`util.js:55 PIPE_RESULTS = false`), so a downstream relief lists 1,511 developments a median 25 km away; only "connects through" gives a firm wait.
- No reviewed set yet: precision is unknown, planned-main flow direction is unpublished (65.7% of planned routes bridge a gap), and a point finds the receiving pipe 30.4% of the time.
- `affected.json` (about 35,000 pairs) and the network extract are unmeasured in size; it replaces runtime code in `dc-infra.js`, `masterplan.js` and `dc-impact.js`, which 10, 13 and 3 test files reference.

Effort L in total (quick fix S) · Risk medium (alarming counts if "on the path" reads as "needs") · Reversible yes, the trace stays for what-ifs · Depends on L-17's ids, L-2, M2

**Alternatives**
- Compute "on its path" in the browser from stored path signatures, with no `affected.json`: no new pairs file, nothing to go stale.
- Relabel today's buffer lists "nearby" rather than "relies on" (S).

**Verdict: keep-with-change.** Now the dc-impact fix and "nearby" labels; next stable ids, component keys and the system gate, and scheduled network builds (its §6 #1, #3, #10); `affected.json` only after sticky ids and a reviewed top-25 sample, showing "on its path" apart from "connects through".

### L-ID · One canonical file id
**What:** `js/file-id.js` produces `<MUN>-<SERIES>-<YYYY>-<NNNN>[.PART]` (`MIS-SP-2022-0060`) for every build, override file, the DC gate and the browser.

**Pros**
- Spelling loses links: 498 of 1,088 council keys hit; 41 of 71 Caledon records with council items get a wrong-type item.
- Permit revisions (`-RV01`, `REV02`) meet their house permit (L-4 needs this); series markers prevent 55 Brampton collisions.

**Cons**
- The gain is parsing, not format: `canonRef` / `fileId` are already shared by Node and the browser (`js/phases.js:341-369`); format-only gains are +4 keys and 3 developments.
- Each format rule can merge or split files (needs a collision test over 7,046 refs); hand files migrate; 14 test files change; in links, aliases are forever.

Effort S–M in place (M as written) · Risk medium · Reversible until published · Depends on nothing

**Alternatives**
- A display-only readable id for Find and exports, never a key.

**Verdict: keep-with-change.** Parsing fixes in `js/phases.js` and `Muni|fileId` as the one key now; the readable form later, as a display alias.

### L-IDS · The other canonical ids (added)
**What:** Part 2.1 / 2.3 also propose source ids for plan areas, uids not taken from OBJECTID, tree area tags by id, `capr:` / `cap:` capital ids and `ea:<slug>` ids with aliases.

**Pros**
- Record uids churn: from the 10-16 to the 10-19 snapshot, 4,800 of 4,801 Brampton planning records (matched by ref) and 1,065 Brampton permits changed uid (cause unverified); tree counts key permits by uid (`tree-groups.js:55`), and a feature with no id gets a random uid (`phases.js:574`).
- Area ids are name slugs (`build-areas.js:109`) that plan targets and tree counts join on.

**Cons**
- No churn elsewhere: 225 of 225 area ids and 75 of 75 EA slugs (10-16 to today), 3,157 of 3,157 capital ids (10-15 to 10-19).
- Tree area tags index the file's own `areas` array, so they are consistent within the file; a ref-based uid needs L-ID first.

Effort S–M per id · Risk low–medium · Reversible yes · Depends on L-ID

**Alternatives**
- A PR check that fails when an area id, EA slug or capital id disappears between builds.

**Verdict: keep-with-change.** Fix record uids now (source-stable, never random); the disappearing-id check instead of new area, EA and capital ids; leave tree area tags (DC, pipe, census and facility ids sit in L-2, L-17, L-5, L-11).

### L-XW · Hand-reviewed crosswalk files
**What:** reviewed crosswalks for facilities, plants, DC ↔ capital, 21T ↔ 43M plan numbers and MP 2020, with method, confidence and reviewed columns.

**Pros**
- Replaces five name rules that disagree (the Inglewood DC well maps to 1 record by one, 3 by another).
- 110 of 282 DC ↔ capital links are low-confidence and 19 cross systems; reviewed rows make L-2's chip trustworthy.

**Cons**
- The channel exists and is unused: `dev-outlets.json` 0 outlets, `capital-overrides.json` 0 links, `dc-joins.json` 6 joins against 72 open ends, though the screens export.
- About 600 rows to review (rough; the facility crosswalk alone is about 50 rows per infrastructure-dependencies.md §6), needing Region knowledge; DC ↔ capital grows weekly.
- Reviews on positional keys go stale (12 stale keys dropped 28 links); seven more files with receipts.

Effort M plus unassigned review time · Risk low in code · Reversible yes · Depends on L-2's keys

**Alternatives**
- Facility ids from GIS FacilityID / FACSCADA (39 of 39 wastewater names match), reviewing conflicts only.

**Verdict: reconsider.** One reviewed crosswalk (DC ↔ capital) after component keys; facility and plant ids from GIS; the rest when someone is named to review.

### L-HOLE · A hole rule per layer in point-in-polygon
**What:** even-odd for DAs, pressure zones, PS catchments and blocks; any-ring kept for plans, whose roll-up needs a parent to contain its child.

**Pros**
- 30 developments (253 units) get the wrong DA; 32 (1,528 units) sit in a catchment hole; pz:7's census is 4.2% low.
- Even-odd exists twice already (`constraint-geo.js:38`, `build-svc-census.js:33`).

**Cons**
- Smaller than it reads: the 12 zone cases hold 0 units, and blocks change nothing (`svc-data.js:75`).
- `pointInRings` has about 50 call sites, the grouping among them; a changed default would move Peel totals.

Effort S · Risk low if opt-in · Reversible yes · Depends on nothing

**Alternatives**
- Smallest containing DA (as `fsr.js:361` does).

**Verdict: keep-with-change.** Opt-in now on the DA, zone and catchment lists and the census sampler, not tied to `link-placer.js`; drop blocks.

### L-1 · Side files and history rebuilt for today's developments
**What:** write `history.json` and the weekly changes from the tree grouping, after Tree counts.

**Pros**
- 1,180 file developments get their own history; weekly changes resolve for 1,000 of 1,000, against 355.

**Cons**
- History moves into a continue-on-error step (`site.yml:78-81`): if trees fail, it is written against last week's trees.
- Old phase dates under old keys need a one-off translation (aliases recover 939), and new splits still start blank.

Effort S–M · Risk medium · Reversible yes · Depends on M1's Node half

**Alternatives**
- Key history by file id (M2).

**Verdict: keep-with-change.** With history by file, after the trees, and a PR check that fails when history or gate keys miss current developments.

### L-2 · DC ↔ capital status into the DC chip; same-system rule; component keys
**What:** status for each DC work from its own same-system capital records (`capital-lib.js:349`), works keyed by component or end hash (`:311`), `CAPITAL.overrides` filled from medium and high links.

**Pros**
- `f87eca2` found 3 of the 4 "Paused but under way" lines take that status from a watermain record on the same contract page; the rule removes false contradictions, leaving 1 paused and 4 budget lines genuinely ahead of the chip.
- Removes 19 cross-system links; stable keys stop 28 links dropping.

**Cons**
- Project-number links still overclaim: one contract can mark every component "Going ahead" (`capital-lib.js:330-336`).
- The chip has three states (`util.js:107-112`); end-hashed keys move when a DC map draft moves a line's ends.

Effort S · Risk low–medium · Reversible yes · Depends on nothing

**Alternatives**
- Status from component and street+overlap links only.

**Verdict: keep-with-change.** Ship the same-system status and keys now; show the method; project-number matches only as "project under way" in the tooltip.

### L-3 · File id, then the council index fixes
**What:** adopt L-ID, widen `FILE_RE`, type Caledon keys only when the item names the type, add an address fallback labelled "by address", and a 21T / 43M crosswalk.

**Pros**
- The address fallback resolves 155 of 693 unresolved items (Mississauga 143 of 351) without a file id.

**Cons**
- A wider regex recovers nothing alone: the build keeps only items naming a recognised file (`build-council.js:67`), so it needs a refetch of 1,022 meetings inside a 40-minute step.
- An address match can attach an old application's item to a new development.

Effort S (fallback) / M (regex) · Risk medium · Reversible yes · Depends on L-ID for the regex

**Alternatives**
- The fallback and Caledon typing only.

**Verdict: keep-with-change.** Address fallback and Caledon typing first; the regex later, with a planned refetch and a before/after count.

### L-4 · Servicing permit → development by permit number
**What:** `build-dc-gate` joins by permit number first, then by location.

**Pros**
- 960 of 2,468 permits match by number against 556 by location; 957 of the 960 also match the address.

**Cons**
- Needs L-ID's revision stripping; 129 same-folder matches may be other buildings (unverified).
- Where number and location disagree a rule must say which wins; the gate is a user-facing filter and chip (3,291 developments).

Effort S · Risk low · Reversible yes · Depends on L-ID

**Alternatives**
- Number first, location kept as a flagged fallback.

**Verdict: keep.** With a stated rule for disagreements and a before/after gate count in the PR.

### L-5 · Census DA × block by area, keyed by `dauid`
**What:** apportion census DAs to wastewater blocks by area overlap, with `dauid` on every row.

**Pros**
- Centre points put 7.64% of people (110,832) in another block; README:643-646 already claims overlap.

**Cons**
- `svc-census` runs only in a probe mode and `blocks.json` is built by hand, so it drifts again without a trigger.
- Block baselines jump (block 22 doubles), which the change log must explain; 1 test file changes.

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Do nothing: the README's claim stays false.

**Verdict: keep,** with a PR check that `svc-census` is newer than `blocks.json`.

### L-6 · Block plant labels (block 23)
**What:** choose a block's plant by its own pipes, moving block 23 (Malton) from Lakeview to Toronto.

**Pros**
- 546 of its 557 pipes drain to Toronto; 486 development points leave G.E. Booth.

**Cons**
- G.E. Booth is calibrated to its 2025 flow (`svc-plants.js:288`), so the other blocks' factor shifts (size unverified).
- `build-blocks.js` is manual and needs the raw linework; 2,282 of 2,866 disagreeing points are blocks 13/14 (P4-15).

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Override block 23's plant by hand in `blocks.json`.

**Verdict: keep.** Re-check the calibration, and do it before the first frozen ledger (D-H).

### L-7 · One zone → water system table
**What:** one mapping of pressure zone to water system, used by `masterplan.js:244` and `water-trace.js:194`.

**Pros**
- The two rules disagree; six well zones (807 developments, 1,780 units) are charged to the lake.

**Cons**
- Each assignment is a judgement, and 8A may be partly lake-fed (unverified).
- 1,780 units is small for the lake but large for a well system, so new "near its limit" results need checking; 2 test files pin `wellSystem` / `lakeZones`.

Effort S · Risk low–medium · Reversible yes · Depends on P4-15 for 8A

**Alternatives**
- A row in `area-links.json`, as the review proposed.

**Verdict: keep-with-change.** A `system` field on the zones (or a constant); ship the five clear zones, hold 8A.

### L-9 · Build the alerts feed
**What:** run `build-alerts.js` weekly so This week's capacity alerts and the Watch alerts appear.

**Pros**
- Both panels would show; today `alerts.js:110` gets a 404.

**Cons**
- As written it uses the pre-tree grouping (`build-alerts.js:85`) and drainage outlines (641 of 2,745 developments get no plant).
- Change alerts on churning keys (1,212 new, 411 gone per rebuild) would be regroup noise.

Effort S–M · Risk medium · Reversible yes · Depends on D-H's split

**Alternatives**
- Wire it after sticky ids, as Part 4 #4 says.

**Verdict: reconsider.** Fold into D-H: capacity alerts on blocks through `app-devs` in wave 2; watch and change alerts after the ids.

### L-10 · EA → DC mains
**What:** link each EA to the DC mains it leads to, by area or by name.

**Pros**
- 5 of 75 EAs link today; by area, 7 EAs / 72 pairs.

**Cons**
- The name rule matches 6 of 22 pipe EAs, 2 of them falsely.
- 26 of 75 EAs have low geometry confidence, and one false link exists already (the lower-west trunk EA → the Clarkson expansion).

Effort M · Risk medium · Reversible yes · Depends on L-2

**Alternatives**
- DC mains inside an EA's study area as a map overlay, nothing stored.

**Verdict: reconsider.** Reviewed suggestions only, after L-2.

### L-11 · Facility and plant registry
**What:** one registry of every physical facility and plant with its names, GIS ids and kind.

**Pros**
- Events reaching a plant go 6 → 10 of 10; planned reservoirs appear in their zone.

**Cons**
- "10 of 10" is 10 events: only 10 of 30 name a station; the zone gain needs no registry (`dc-infra.js:79-85`).
- A hand registry carries L-XW's review cost, and today's registry merges across kinds (a well becomes a reservoir).

Effort M · Risk medium · Reversible yes · Depends on L-6

**Alternatives**
- The two derivations only.

**Verdict: keep-with-change.** Derivations first; the registry from GIS / SCADA ids, reviewing only conflicts.

### L-12 · Area × area tables
**What:** precinct census shares, MTSA × plan, served-weighted plan × block / zone and the null MTSA split, in `area-links.json`, failing the build on a null name.

**Pros**
- Precincts have no census shares (0 of 30); the unnamed MTSA holds 241 developments.

**Cons**
- Failing the build fails silently: `build-areas` is continue-on-error (`site.yml:57`), so last week's areas stay.
- Served-weighted shares are figures users have not seen; a new file needs a receipt.

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- The null MTSA split only.

**Verdict: keep-with-change.** Split the null MTSA now; shares in `areas.json`, not a new file; warn on a null name.

### L-13 · Normalised ward ids, with imputation flagged estimated
**What:** one ward id across developments and capital; impute missing wards as estimates.

**Pros**
- 27 shared ids (capital 3,154 of 3,157); a ward filter and roll-ups.

**Cons**
- Only 21,346 of 85,141 records carry a ward, and no Brampton or Caledon permit does, so most developments would be imputed.
- The 1–5% error falls at ward boundaries, where councillor questions are likeliest; some values span wards ("Ward 5 & 6").

Effort S · Risk low · Reversible yes · Depends on ward polygons

**Alternatives**
- Do nothing until ward polygons are fetched.

**Verdict: keep-with-change.** Normalise stated wards, show "not stated" otherwise, impute only with polygons.

### L-14 · 2020 DC projects → capital records
**What:** tag capital records with the 2020 DC project they fund.

**Pros**
- 14 matching numbers cover 57 records (35 under construction); 2 are linked.

**Cons**
- Some may be programme numbers (14-2429 relining), so the 14 need checking by hand.
- The audience is small: 57 records, 2 already linked.

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Do nothing: few users ask.

**Verdict: keep-with-change.** Tag as `reviewed: false`; check the 14 by hand.

### L-15 · Related applications across developments
**What:** a "Related applications" list with the reason, from stored links.

**Pros**
- 11 resolved mentions are never shown (`earlier-files.js:45`).

**Cons**
- 11 mentions is small.
- Storing 1,515 pairs ties a per-open feature to a weekly file, and the list already exists in the full-map tables, so most of the gain is placement (phase 5).

Effort S · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Leave it to phase 5's placement.

**Verdict: keep-with-change.** `implied()` lists the resolved mentions; no file.

### L-16 · Constraints tested on the site boundary
**What:** flag regulated and flood land by the cells inside a site's boundary, not its centre point.

**Pros**
- 772 of 2,411 sites flagged, against 345; it removes a false "Outside the mapped regulation limits", since those checks have no "nearby" status (`constraint-data.js:41-66`).

**Cons**
- Flags more than double (32% of sites): a sliver at the edge flags the whole site, so wording must say "on part of the site".
- A weekly bitmask means scanning `grid.json` for 2,411 boundaries (time not measured).

Effort S–M · Risk low–medium · Reversible yes · Depends on nothing

**Alternatives**
- A weekly bitmask (scan time unmeasured).

**Verdict: keep-with-change.** Test it when the site opens, with "on part of the site", and raise its rank.

### L-17 · The receiving pipe and the whole servicing path, with stable pipe ids
**What:** keep manhole and WND ids on every pipe and store each development's path (now restated by `f87eca2` from L-NET's appendix).

**Pros**
- A full path exists for 16,937 of 20,990 developments (80.7%); 1,733 receiving pipes are shared by 2+ developments.
- Ids are S–M: they are read and dropped today (`build-sewer-capacity.js:89`, `:249`), and nothing linked to a pipe survives a rebuild.

**Cons**
- The path needs the raw linework rebuild, run by hand (`probe-sources.yml` modes); the pipeline path covers 67.6% of developments.
- The largest sites have no trunk within 400 m (111 Mayfield, 9,961 units); they depend on planned mains.

Effort S–M (ids) / L (path) · Risk low · Reversible yes · Depends on the network build

**Alternatives**
- Ids only, at the next sewer build, with the path deferred.

**Verdict: keep-with-change.** Stable ids in the next network build, with a check that fails when a link names a missing id; the path itself through L-NET.

### L-18 · Regional council reports
**What:** scrape Regional council reports and link them to DC projects, capital and EAs.

**Pros**
- Would show which report funded or paused each project (the May 2026 pause is one constant, `util.js:96-100`).

**Cons**
- L: a new portal, a scraper and one more networked weekly step, joined by text.
- The evidence shows a gap (0 of 2,414 municipal items), not that Regional items name DC components.

Effort L · Risk medium · Reversible yes · Depends on nothing

**Alternatives**
- A hand list of the key reports (the pause, the DC by-law, the budget).

**Verdict: reconsider.** The hand list first.

### P4-15 · Ask the Region about blocks 13/14 and zone 8A
**What:** ask which plant blocks 13 and 14 drain to and whether zone 8A is partly lake-fed.

**Pros**
- One email settles 2,282 of 2,866 disagreeing points and zone 8A.

**Cons**
- The answer time is unknown.
- A "split flows" answer would not fit the one-plant-per-block model (unverified).

Effort S · Risk low · Reversible n/a · Depends on nothing

**Alternatives**
- Decide from the traced pipes alone.

**Verdict: keep.** Mark blocks 13/14 "plant to confirm" meanwhile.

## Navigation structure

Two findings shape this part. Phase 1 alone takes the design audit's ten tasks from 30 clicks to 16; phases 2–8 save none (navigation-design §6.1, §8). And the owner built much of what would be replaced 2–9 days before the review (`4779c05`, `1d8c728`, `6fe0004`, `0553779`), with no usage data.

### N-RULE · Five tabs at every scope; a page and the full map host the same scope
**What:** a scope has Overview · Growth · Servicing · Capital · Records; a page and the full map share the tab strip and chips; the page section bars, the Explore views bar, extra trails and the 12 workspace chips go.

**Pros**
- The owner's own principle (SPEC §0.4, `SPEC.md:29-32`) and the judge's top score (44 of 60).
- Removes measured doubling: 25 page sections → 0, 3 trails → 1, 12 chips → 0, rows above the answer 5 → 3 (6 → 3 on a phone).
- Pages are already built from the map's panel specs (`sections.js:1-16`).

**Cons**
- No clicks of its own; 34–53 developer-days for phases 0–9 and 17 owner decisions; every PR needs screenshots, MOVED rows and README edits.
- 20 test files pin navigation names; it rewrites `ws-pages.js` (58 commits since 10-15), `index.html` (40) and `devtab.js` (25).
- It reverses this month's owner-built structure without usage evidence; the base won by 2 points of 60, from one judge.

Effort L–XL · Risk high (phases 5–6) · Reversible per phase until phase 6 · Depends on P4-7, NP-0

**Alternatives**
- Task-first: keep the page sections, renamed and ordered like the tabs; the same 16 clicks at lower risk.

**Verdict: keep-with-change.** Keep it as the target; commit to phases 0–2 plus the small slices (phase 4's EA move and tool link, phase 5's dead code and path line, phase 7's ⚙ sheet and role list, phase 8's HIDDEN rows); the rest stays conditional.

### N-1 · Home sidebar 9 → 5 with "For your role" shortcuts
**What:** Home · This week · Find · Help · Full map, up to 3 role shortcuts from one role list, and Labs; the team headings and the Start-screen select go.

**Pros**
- 3 of 4 headings hold one entry each (`workspaces.js:74-79`); two role lists that disagree (5 and 4 roles, `tips.js:41-47`, `:183-188`) become one, with QA/QC.

**Cons**
- Old pipes and What's coming 1 → 2 clicks, Review outlets 1 → 3; shortcuts appear only after a role is picked.
- Contradicts the ledger plan ("What's coming first", `pipeline-ledger-plan.md:227`) and reverses the QA/QC heading decided with the user on 10-23.
- 8–11 test files; safe only once phases 2–6 put each entry one tab away.

Effort M · Risk medium · Reversible yes · Depends on N-3, N-5, N-6, usage counts

**Alternatives**
- Flatten: drop the headings and the Start select, keep the entries (S).

**Verdict: reconsider.** Offer the flatten if the owner accepts losing the QA/QC heading; cut to 5 only after N-3 and usage counts; keep What's coming while the ledger plan wants it first.

### N-2 · Find: one search on every page, routed by hit type
**What:** one search on every page, a pick routed by kind (development, file number, plan, facility or DC project), Draw an area beside it, replacing Explore's five views.

**Pros**
- All the click savings (30 → 16); no Home search exists below 1,600 px, so none on a 1440 px laptop (`topbar.js:376`).
- Mostly routing: plans, zones, blocks and DC projects are already hits (`search-filter.js:113-139`); it fixes the Inquiry draft closing its development (`svc-scope.js:92`).

**Cons**
- Typing counts as free, so the savings assume the user knows an address or a number.
- `goSug` also serves the map (`search-filter.js:140-160`); routing must apply on pages only.
- Retiring the views bar removes named starting points (Study area, Forecast) until Home hosts the tabs; search reads `p.records`, which D-B makes lazy.

Effort M · Risk medium · Reversible yes · Depends on NP-0; the views-bar removal on N-3

**Alternatives**
- A header search box without routing (S): a same-week fix for the 1,600 px gap.

**Verdict: keep-with-change.** Ship search and routing first; keep the views bar until Home hosts the area tabs, rather than replacing the five views at once.

### N-3 / NP-6 · Pages render the five-tab strip instead of their section bars (phase 6)
**What:** pages drop their own section bars (Summary, Files, DC timing …) and the Explore views bar, and render the map's tab strip and chips from TABSUBS with one trail; the 12 workspace chips go.

**Pros**
- One name per thing (`sections.js:23-27`, `:59`): 25 page sections → 0, 3 trails → 1, rows above the answer 5 → 3 (6 → 3 on a phone).
- Safest after phases 2–5, when the strip has its final chips.

**Cons**
- The largest, riskiest phase (6–10 days): it rewrites `pageHTML` in `ws-pages.js` (58 commits since 10-15); 12 test files, 433 asserts.
- 0 clicks saved; page-only content (Growth in an area's treemap, Old pipes' grid, EA to construction) must become specs or be lost; it reverses map presets "decided with the user" (`workspaces.js:39`).
- Late tabs: Servicing and Capital stay hidden until their data loads, and links fall back to Overview (`svc-tab.js:378-381`, `analysis-tabs.js:83`).
- Its usage gate cannot be measured: `usage.js` counts pages, maps, tabs, chips and the sidebar (`:95-102`), not section-bar clicks (`data-ws-sec`, `data-ws-wsec`; `ws-pages.js:626`, `:632`).

Effort L · Risk high · Reversible hard once the bars and tests are rewritten · Depends on phases 2–5, P4-7(b), P4-11, P4-10's counters

**Alternatives**
- Rename and trim (S): SITE's Summary → Overview and Files → Records; drop the views bar and the site trail.

**Verdict: reconsider.** Rename and trim now; add section-bar and Explore-view counts to `usage.js` before collecting CSVs; build the page host after phases 2–5 only if those counts show users do not navigate by the sections.

### N-4 / NP-3 · Growth's Ledger merged into Forecast as "By period" (phase 3)
**What:** Growth becomes Pipeline · Areas · Forecast; the Ledger becomes Forecast's "By period" block, with its stage cut-off kept inside it.

**Pros**
- One model (`ledger-ui.js:11-13`); Growth's chips 4 → 3; S–M (2–3 days), low risk.

**Cons**
- A live owner project: the ledger plan made Growth › Ledger and What's coming its M1 demo (`pipeline-ledger-plan.md:159-160`) and releases "after M1 is demoed, so the demo version stays fixed" (`:225-229`).
- Two "which stages count" controls on one panel (`ledger.js:26-31`, `layer-bar.js:151`); Forecast already holds five blocks.
- 0 clicks saved; 10 test files, 196 asserts; stored `ledgerCut` and `gSub=ledger` must be mapped.

Effort S–M · Risk low–medium · Reversible yes · Depends on the ledger plan's Phase 7 and D5

**Alternatives**
- Keep both chips and cross-link them ("built on the Forecast's model"; S).

**Verdict: reconsider.** One chip of gain against an active owner project; decide with the ledger plan's Phase 7 and cross-link the views until then.

### N-5 / NP-2 · Servicing re-cut, with the checks move (phase 2)
**What:** Servicing is Capacity · Network · Old pipes at an area and Network · FSR review at a development; Allocations becomes a Capacity fold plus a column; Model checks move to Records › Checks; one System control.

**Pros**
- Allocations is a per-browser register (`demand-ui.js:75`) whose table is the plants plus one column; checks 4 homes → 1, and the gear page retires (`:306-314`).
- FSR cross-check hosts 3 → 1 (`svs=fsr`); pane ids are kept, so the workbook still finds `#wfac-body`.

**Cons**
- The fold must keep Export and Import CSV (`demand-ui.js:138`) and change the alloc-box text "share the list from Servicing › Allocations (CSV)" (`:114`); entries are made at each development (`:108-115`).
- Servicing reaches the cap of 4 sub-views (`four-tabs.test.js:145`); the ledger plan's open D5 would move FSR review to Labs.
- Shared System state couples panels (N-11); a page export must render the pane first (`growth-ui.js:36-45`).
- Phase 2 is 3–4 days; 11 test files, 209 asserts (`pilot.test.js:103-108` and `vocabulary.test.js:51` pin the old names).

Effort M · Risk medium · Reversible behind NP-0 · Depends on NP-0

**Alternatives**
- Only the checks move plus one System order and wording (1–2 days).

**Verdict: keep-with-change.** Phase 2 moves the checks, folds Allocations with its CSV and new alloc-box text (where allocations are stored has no bearing on fold or chip) and gives System one order and wording, shared only if the lens drives it; Old pipes and FSR review as views wait for N-3 and N-8.

### N-6 / NP-4 / P4-8 · Capital 4 views → 3, one DC projects list with both verdicts (phase 4, Part 4 #8)
**What:** one DC projects list whose rows carry "in service before capacity runs out" and "first homes before it is built"; EAs with EA to construction; Projects renamed Construction; the tool result opens the list.

**Pros**
- One 2026 project gets two lateness answers in two views today (`dc-cost.js:279`); 3 DC-timing surfaces → 1; EA to construction (page-only, `ws-pages.js:970`) reaches the map.
- The 2026 DC lines already share a key: both models key a line `ln.p || ln.c` (`masterplan.js:832`, `dc-impact.js:28`), 178 keys (97 wastewater, 81 water).

**Cons**
- The non-DC reliefs (`step`, `mp`, `mpu`, `fc`: plant steps, 2020 Master Plan mains, facilities) have no shared key and no row; projects that relieve nothing have no first verdict.
- Two models: `dcAnalysis` needs `sewers.json` (1.42 MB); verdicts that disagree need a line of method, and Home's "DC projects late" must say it counts the first (`ws-pages.js:495-497`).
- Reworks a 3-day-old owner feature; "Projects → Construction" reverses the owner's rename (`tips.js:147`); 9 test files, 170 asserts.

Effort M–L (4–6 days) · Risk medium–high · Reversible behind NP-0, at a cost · Depends on the owner's answer to Part 4 #8

**Alternatives**
- Two views named by their question ("Capacity timing", "Developments waiting"), cross-linked row by row.

**Verdict: keep-with-change.** EA to construction and the tool-result link now; merge the 2026 DC lines on their shared key, with named verdict columns, once the owner answers Part 4 #8 (no Part 2 link work needed); non-DC reliefs stay in Servicing › Capacity; ask before renaming Projects.

### N-7 · Records: one home for all checks; one files-and-history view at a development
**What:** at an area Records is Sources · Checks; at a development one files-and-history view; a file shows its record.

**Pros**
- Checks 4 homes → 1; the MECP effluent and station roster checks, reachable only through a hidden gear page (`overview-tab.js:436`), become findable.

**Cons**
- Checks becomes a long mixed list read by different people; plant-level checks need separately loaded data ("loads when needed").
- The development half waits for N-8; about 10 test files change.

Effort M · Risk low–medium · Reversible yes · Depends on N-5, N-8

**Alternatives**
- A link from Servicing to the model checks, without moving them.

**Verdict: keep,** with a "Servicing model" group in Checks.

### N-8 / NP-5 · One development layout on page and map (phase 5)
**What:** one header plus the five tabs on page and map; `#ov-dev` dissolves into Overview, Records and a Network fold; the dev sub-tabs, the verdict card and the hidden site bar go; FSR review becomes `svs=fsr`.

**Pros**
- Removes hidden or doubled DOM (the site bar's facts hidden by CSS, `devscope.js:197-206`; the verdict card rebuilt on every open, `overview-tab.js:203-226`); `fsr.js:138-406` has no caller.
- Files views 3 → 1 and FSR hosts 3 → 1; fire flow, supply route and related applications get a visible home.

**Cons**
- L (5–8 days) on `devtab.js` (1,496 lines, 25 commits since 10-15); 36 test files mention the surfaces; tours and exports read `#site-bar`, `#ov-dev` and pane ids (`reports.js:274`).
- Users relearn the object they use most; FSR review's home is contested (the ledger plan's D5 says Labs).
- The *Previous* fallback stays (M1), so the layout must still handle `treeGrouped = false` (`devtab.js:506`, `dev-nav.js:74`) or show an error state.

Effort L · Risk medium–high · Reversible per PR; deleted code one-way · Depends on the Previous switch removed (M1), M3's parity tests, D5

**Alternatives**
- Retire only the dev sub-tabs and add the path line to Overview (M).

**Verdict: keep-with-change.** Dead code and the path line first; the layout after the Previous switch goes and M3's parity tests land (phase 5 deletes the devtab copies), keeping a `treeGrouped = false` path; the owner settles FSR review's home.

### N-9 · Help with four sections
**What:** Help is Start here · How it works · Glossary (absorbing the Definitions card) · How the app decides; Data sources and checks move to Records.

**Pros**
- One place has two names (Reference, Help) and a "Help › Help" section (`sections.js:51`); one role list replaces two.

**Cons**
- The owner moved Data sources and checks into Reference on 10-21 so pages could reach them (README:1556-1557); moving them before pages have Records makes them map-only again.
- The Definitions card must keep its ⓘ (`info.js:16`); `reference.test.js` has 54 asserts.

Effort S–M · Risk low–medium · Reversible yes · Depends on N-3 for the moves

**Alternatives**
- Link to Records from Help instead of moving the sections.

**Verdict: keep-with-change.** Rename and merge the role lists now; move the data sections once Records is reachable from pages.

### N-10 · One Settings sheet behind ⚙
**What:** ⚙ opens one sheet: Display · Start screen · Reports · Labs · Usage.

**Pros**
- Settings is drawn inside a dropdown (`topbar.js:303-316`) and 2 of its 6 sections only point elsewhere; low risk.

**Cons**
- "8+ places → 1" overstates it: the Scenario, Layers and Legend stay; ⚙ goes from 3 items to 1.
- The change log moves to Help, a small relearn; about 4 test files.

Effort S–M · Risk low · Reversible yes · Depends on nothing

**Alternatives**
- Move Labs into Settings and delete the two stubs (S).

**Verdict: keep,** stated as "⚙ 3 → 1".

### N-11 · One System control and one sort vocabulary
**What:** one Both / Wastewater / Water control replaces three; one set of sort words replaces three.

**Pros**
- Three controls, three orders, three defaults (`svc-capacity.js:247`, `dc-projects.js:70`, `masterplan.js:800`); Capacity names the same sorts two ways.

**Cons**
- One vocabulary over different measures misleads ("Largest impact" is % of capacity; "Most affected" is units relying, `dc-projects.js:51`).
- Shared state couples panels: Water on Capacity flips DC projects, whose Wastewater default changes.

Effort S · Risk low · Reversible yes · Depends on N-6 for the tool result

**Alternatives**
- The same order and words everywhere, state kept per panel.

**Verdict: keep-with-change.** One control, state shared only if the lens drives it; the same sort words only for the same measures.

### N-12 · Keep the Watch tab with the top 5 of This week; no Data tab
**What:** the full map keeps Find · Watch; Watch shows the watch list and This week's top 5; SPEC §4's Data tab is not built.

**Pros**
- Keeps SPEC §4's Find · Watch and the watched sites beside the map; Records › Sources keeps one home.

**Cons**
- The top 5 reverses bundle 6, which gave This week one home (`index.html:173`), while the review counts its ~10 surfaces as a problem.
- The Alerts badge has no feed, so "one badge" needs deciding.

Effort S · Risk low · Reversible yes · Depends on D-H's text fix and stopped request, and the one-badge decision

**Alternatives**
- Remove Watch (scope-first), only if usage shows nobody uses it.

**Verdict: keep-with-change.** Keep Watch as it is and build no Data tab, without the top-5 copy.

## Navigation delivery and decisions

Test counts here are the files navigation-design §8 lists for a phase and the regex asserts in them: text at risk, not lines that will change.

Phases 2–6 and Part 4 #8 are weighed with their design items above: N-5 / NP-2, N-4 / NP-3, N-6 / NP-4 / P4-8, N-8 / NP-5, N-3 / NP-6.

### NP-0 · Phase 0: alias and link layer, no visible change
**What:** one alias table so every old page id, tab key, sub-view and share parameter keeps resolving; new links carry `nav=2`; moved `svs` / `rs` values are no longer dropped.

**Pros**
- Done and cheap (`57c7ce6`: 6 files, +223 / −29, then fixes in `773c921`; 1,442 of 1,442 tests passed); it fixes a live bug (old `share.js:134-135`) and makes every later move link-safe.

**Cons**
- An invisible change still broke a source pin (`approvals-guide.test.js:50`); every later phase pays this.
- A missed alias row falls back to Home silently, and the usage alias is still owed, or the pilot's counts split.

Effort S (done) · Risk low · Reversible one commit · Depends on nothing

**Alternatives**
- Fix only `share.js:134-135`, if no phase will ever ship.

**Verdict: keep.** Merge it to `main`; add the usage alias with the first retired id.

### NP-1 · Phase 1: Find from every page; `keepDev`; path line; "first zone limit"
**What:** search and Draw an area in every page header with routed picks; `keepDev`; the path line on the site Overview; Home's "first zone limit"; Needs-attention rows that open their facility.

**Pros**
- All 14 saved clicks (30 → 16); fixes the Inquiry draft drawing out of sight (`svc-scope.js:92`).
- The parts exist (search hits, the path in `svcFacts`, zone limits); no structure change; small data cost (`dc-infra.json` 36 KB gzip).

**Cons**
- `goSug` serves the map too: there a plan pick sets `state.sp` (`search-filter.js:117`), on a page the page-local drill (`ws-pages.js:700`).
- Hits need loaded data (`search-filter.js:116`, `:120`, `:129`); with D-C they vanish on Home unless focusing the box loads them.
- "First zone limit" mixes thresholds (plants at 90%, zones at 100% of firm pumping, `svc-capacity.js:104`, `:128`); 8 test files, 164 asserts.

Effort M · Risk medium · Reversible per PR · Depends on NP-0

**Alternatives**
- Header search plus `keepDev` only (1–2 days, unverified).

**Verdict: keep-with-change.** Two PRs (search, routing, `keepDev`; then Home figures and path line); label the zone figure "100% of firm"; a page plan pick opens the page-local drill, so P4-11 waits for phase 6.

### NP-7 · Phase 7: sidebar 9 → 5, Help, one Settings sheet
**What:** N-1's sidebar, Reference as Help (N-9), and ⚙ as one sheet (N-10).

**Pros**
- Entries 9 → 5, headings 4 → 0, one role list; gated on usage evidence (owner decision 12).

**Cons**
- Three paths lengthen without a shortcut; it reverses QA/QC › Review outlets (`workspaces.js:31`) and the ledger plan's "What's coming first".
- Weak evidence as built: per browser, no role, no searches (`usage.js:1-15`); counting began 10-16, the sidebar changed 10-21 and 10-23.

Effort M · Risk medium · Reversible yes · Depends on NP-6, P4-10, the ledger plan

**Alternatives**
- The ⚙ sheet and one role list alone (S).

**Verdict: keep-with-change.** The ⚙ sheet and one role list now; the sidebar after phase 6, with counts that record role.

### NP-8 · Phase 8: every scope kind gets real tabs
**What:** HIDDEN rows for drawn areas, servicing scopes, files and objects; Records real at servicing scopes; object scopes for DC projects, EAs, capital projects, pipes and facilities; Records a peer tab.

**Pros**
- HIDDEN knows only site and area (`analysis-tabs.js:94-99` at `57c7ce6`), so a plant shows every area sub-view; it replaces the `records-tab.js:72` placeholder.

**Cons**
- L, with "loads when needed" states for plant flows, events and the roster; 0 clicks saved; 6 test files, 174 asserts.
- Records as a peer reverses the owner's "small trailing tab" (`four-tabs.test.js:38-43`).

Effort L · Risk medium · Reversible per scope kind · Depends on NP-0; NP-4 for DC projects

**Alternatives**
- The file record sheet only, if files are opened more than objects (no data).

**Verdict: keep-with-change.** HIDDEN rows for servicing scopes and drawn areas early, as a small PR; object and file scopes later; Records stays trailing unless the owner says otherwise.

### NP-9 · Phase 9: words sweep
**What:** update README sections, the tour, info cards and "What moved where"; audit MOVED.

**Pros**
- Text is wrong today: README:1573 says "seven entries" (there are 9); "Tool result tab" appears in 7 places.

**Cons**
- As a phase it duplicates each phase's own rule to update its words (§8).
- `vocabulary.test.js:54-62` ties names to live chips, so words cannot run ahead of the moves.

Effort S–M · Risk low · Reversible yes · Depends on each phase

**Alternatives**
- Do nothing until the end: the README stays wrong meanwhile.

**Verdict: keep-with-change.** Fix today's stale text now; the rest in each phase's definition of done, with a closing MOVED and tour audit and the README split (D-G3).

### NP-10 · Optional phase 10: Page | Map as one address, a live map beside every page
**What:** a persistent map slot beside every page and a Page | Map toggle replacing Full map, Open the map and the back bar.

**Pros**
- Removes the last second navigation (ws mode); map context always on screen.

**Cons**
- XL, high risk: `renderPage` rebuilds `#home` and moves `#map` on every render (`workspaces.js:220-228`).
- Its continuity lands in phase 6 already (§9 #16); at 390 px the map is a toggle anyway (unverified).

Effort XL · Risk high · Reversible hard · Depends on NP-6

**Alternatives**
- Today's per-page live maps (site, study area, Sewer designer).

**Verdict: drop.** Revisit only if users still ask for it after phase 6.

### P4-7 · SPEC §0 binding, with §4's Data tab superseded by Records
**What:** "Is SPEC §0 still binding (five tabs at every scope), with §4's Data tab superseded by Records? Yes, as stated."

**Pros**
- The owner's own principle (the code cites "SPEC §" 55 times in 33 modules); free to decide.

**Cons**
- SPEC never mentions Home, pages or workspaces, so extending §0.4 to pages is the review's design and the question bundles two decisions.
- A "yes" commits by implication to phases 6–8: 16–26 developer-days, 0 clicks saved.

Effort none to decide · Risk none · Reversible yes · Depends on nothing

**Alternatives**
- Binding for the map's panel only, pages free (task-first).

**Verdict: keep-with-change.** Ask two questions: §0 for the map panel (already true) and §0.4 for pages (what phase 6 rests on).

### P4-9 · Drop the Ledger stage cut-off after the merge
**What:** keep the cut-off in the merge, then remove it so the Scenario's Count drives By period.

**Pros**
- One "which layers count" control (`layer-bar.js:151`); one stored preference less.

**Cons**
- Loses "+ Plan approved" (`ledger.js:28`), the bucket the ledger plan's settled D1 created (`pipeline-ledger-plan.md:34-39`).
- Makes a local view filter a global switch; the cut-off was the meeting's own ask (`:162-163`).

Effort S · Risk low, but a loss of function · Reversible yes · Depends on NP-3

**Alternatives**
- Keep the cut-off and use the Count's words where they overlap.

**Verdict: drop.** Keep the cut-off as the ledger's local filter; at most align its labels.

### P4-10 · Team headings → role shortcuts, after pilot users' usage exports
**What:** replace the headings with "For your role" shortcuts (adding QA/QC) once pilot users send their Usage CSVs.

**Pros**
- The headings are roles by another name; a stored role exists (`tips.js:48`); evidence first is the right order.

**Cons**
- The CSVs cannot answer it: per browser, no role, no searches, and no section-bar or Explore-view clicks (`usage.js:95-102`).
- Shortcuts show only after a role is picked, and two role lists must merge first; the pilot's size is unknown.

Effort S–M · Risk low–medium · Reversible yes · Depends on the usage-export change

**Alternatives**
- Flatten the headings and keep the entries, if the data stays thin.

**Verdict: keep-with-change.** First count `data-ws-sec`, `data-ws-wsec` and `data-ws-explore` clicks, searches and the stored role; agree the threshold; collect 2–4 weeks (this also gates N-3 / NP-6).

### P4-11 · Drilling into a plan sets the plan filter for the map and every tab
**What:** drilling Peel › Brampton › a plan sets `state.sp`, so the map and every tab follow; today the drill is page-local.

**Pros**
- One "where": a search pick already sets `state.sp` (`search-filter.js:117`); `sp` is shareable (`share.js:37`), the drill's `gAt` is not.

**Cons**
- About 90 developments straddle two or more top-level plans (88 with 7,153 units by one count); the drill splits them by share (`plan-rollup.js:11-13`), the filter counts each whole (`plan-tables.js:57`).
- A visible change: Servicing and the map stay filtered until the filter is cleared (§10.6).

Effort M · Risk medium (the numbers) · Reversible yes · Depends on M6

**Alternatives**
- Keep the drill local and add "Filter the map to this plan" (S).

**Verdict: keep-with-change.** Yes, with a two-part rule (the filter keeps any share; a plan's totals are share-weighted), in phase 6.

### R-WAVES · The roadmap's four waves
**What:** wave 1 stops the drift (with phase 0), wave 2 loads less (phases 1–3), wave 3 builds one model (phases 4–5), wave 4 one system (phases 6–8).

**Pros**
- Cheapest first (phase 0 took a day); data before navigation where it matters; 23 browser paths and the unit suite guard each wave.

**Cons**
- Same-wave collisions: the module manifest with phase 1; M3 with phase 5 on `devtab.js`; the README split with phase 9.
- Wave 1 lists "hide the alerts UI" (already hidden) and `staleWhenNewer` (replaced in D-F).
- Screenshots add 11–26 MB per round before wave 4, and moving them later does not stop growth; the usage gate is not on the timeline.

Effort n/a · Risk n/a · Reversible yes · Depends on the branch merge (done, `65b7f44`)

**Alternatives**
- Data waves 1–2 plus phases 0–2 and the small slices, then re-plan with usage counts.

**Verdict: keep-with-change.** Keep the data order, with wave 1 as D-H's text fix and stopped request, D-F's fields and builder-recorded dates with a PR check, and a no-commit screenshot policy; commit navigation through phase 2 plus the small slices, with M3's parity tests before phase 5 and the `sw.js` generator before phase 1.

### AD-5 · Review outlets as a tool page (added; navigation-design §9 #5)
**What:** Review outlets leaves the sidebar and opens from Records › Checks, a site's path and the QA/QC shortcut.

**Pros**
- Keeps the editor (queue, 6 filters, map) intact and Servicing within 4 sub-views.

**Cons**
- Reverses the entry added 10-23, "decided with the user" (`workspaces.js:31`); 1 → 3 clicks without a shortcut.
- The review channel is already unused (`dev-outlets.json` has 0 outlets); a deeper entry makes review less likely (L-XW, L-NET).

Effort S · Risk low · Reversible yes · Depends on N-1, P4-10

**Alternatives**
- Keep it where it is.

**Verdict: keep-with-change.** Add the Records and site paths now; keep the sidebar entry until role shortcuts and usage counts exist.

### AD-9 · The lens stops opening tabs (added; §9 #9)
**What:** a lens (Planning / Water / Wastewater / Capital) sets the map preset and the System control only, not the right-hand tab.

**Pros**
- SPEC draws the lens as map-only (`SPEC.md:212-215`), and the code's comment says it never changes the tab (`topbar.js:25-26`) while `:41-44` does.

**Cons**
- Reverses an owner change of 10-16 (`877c878`, "A map view opens its tab"), pinned by `organization.test.js:139-142`; SPEC's open question 4 (`SPEC.md:303`) left this open.
- Water and Wastewater users lose the jump to Servicing; §10.6 lists it as a change users notice.

Effort S · Risk low · Reversible yes · Depends on N-11

**Alternatives**
- Keep the jump and fix the comment.

**Verdict: reconsider.** Ask the owner, who added the jump eight days before the review; fix the misleading comment either way.

### AD-13 · Inquiry draft also in Export ▾ (added; §9 #13)
**What:** keep the Inquiry response draft as a development action and as an Export item, both calling one function with `keepDev`.

**Pros**
- It is already an Export item with an "Open a development first" state (`topbar.js:212-242`); nothing moves.

**Cons**
- Two entries for one action, the doubling the review removes elsewhere.
- From Export with no development open it is a detour to a tool result asking for one (`topbar.js:237-239`).

Effort S · Risk low · Reversible yes · Depends on NP-1's `keepDev`

**Alternatives**
- The development action only.

**Verdict: keep.** No cost beyond NP-1.

### AD-17 · Start screen "Last workspace" becomes "Last place" (added; §9 #17)
**What:** the Start option reopens the last scope, tab and view instead of the last workspace page.

**Pros**
- After phase 6 workspaces are no longer places; scope, tab and view are already in share links.

**Cons**
- A stored development key can stop resolving after a regroup (M2), so it needs a fallback.
- Phase 0 already maps a retired last page (`workspaces.js:156`), so nothing is gained before phase 6; `workspaces.test.js:98-99` pins it.

Effort S · Risk low · Reversible yes · Depends on NP-6, M2

**Alternatives**
- Keep "Last workspace", with phase 0's alias.

**Verdict: keep-with-change.** With phase 6, falling back to the page when the stored development no longer resolves.
