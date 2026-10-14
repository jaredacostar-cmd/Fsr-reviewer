# PR: Phase 0 — Trust and transparency

**Branch:** `phase-0-trust-and-transparency` (4 commits on top of baseline `1816a73`)
**Scope:** Phase 0 of the improvement plan only. No Phase 1+ work.
**Tests:** `npm test` → **86/86 pass** (75 baseline + 11 new provenance tests). `node --check` clean on all edited JS.

## Summary

Makes the app's unofficial status unmistakable, renames it so it can't be mistaken for a Region product, gives every source record visible provenance, labels every capacity/DC figure as a screening estimate, and fixes the phone tap-vs-hold bug. No features removed, no information lost.

## What changed per file

| File | Change |
|---|---|
| `index.html` | Slim always-visible banner strip (`<div class="unofficial-banner">`) before `.app`: "Unofficial prototype · public data only · not a Region of Peel product". `<title>` and brand `<h1>` → "Peel Growth Pipeline (unofficial)". Added `<script src="js/provenance.js?v=__BUILD__">` before app.js. |
| `css/app.css` | `.unofficial-banner` style (existing CSS vars only; dark default + light mode; slim 11.5px). `body` → flex column and `.app` flex-fills remaining viewport so the banner never covers content, even if it wraps to two lines on narrow phones. New `.est-tag` (11px muted) for screening-estimate labels. |
| `manifest.webmanifest` | `name` → "Peel Growth Pipeline (unofficial)"; `short_name` stays "Peel Dev" (home-screen name). |
| `js/info.js` | Phone fix: press-and-hold info card no longer opens on a normal tap. Root cause: the 650ms hold timer was cleared on `pointerup`/`pointermove` but not `pointercancel` (fired when the browser takes over a touch gesture), so the card popped up after the finger lifted. Now clears on `pointercancel` too, and the timer callback only shows the card if the pointer is still down and unmoved. Genuine long-press behavior preserved. |
| `js/provenance.js` | **New.** Pure, dependency-free helpers (node- and browser-safe): `portalFor(sourceName)` → "City of Mississauga/Brampton Open Data", "Town of Caledon Open Data", "Region of Peel Open Data" (falls back to sourceName); `recordSourceUrl(record, serviceUrl)` → ArcGIS FeatureServer query by object ID; `applicationPageUrl()` → null (deliberately unimplemented — no stable municipality application-page URL pattern exists in the codebase); `retrievedAt(record, snapshotMeta)` → pulled-on date (record stamp → snapshot build date). |
| `tests/provenance.test.js` | **New.** 11 tests: portal mappings + fallback, URL forms, uid-parsed object IDs, retrievedAt precedence. |
| `js/app.js` | Provenance UI (see below), export disclaimers, screening-estimate tags, rename (8 spots), tour welcome text, Refresh-live timestamp capture. |
| `README.md` | Renamed title, unofficial disclaimer blockquote, banner/export/provenance/phone-fix docs, Phase 0 changelog entry. |

## js/app.js detail

**Provenance per record**
- Source records (`recHTML`): old "Source: …" line replaced with `Source: <portal> · Record ↗ · pulled <date> (also in …)`. "Also in" unchanged; the map button kept.
- Permit pop-ups (`showRecordDetail`): same provenance row above the props table.
- Development header (`devHeadHTML` via new `devDataLine`): new line "Data as of `<date>` · `<n>` sources" — `<date>` = latest pulled date across the dev's records (fallback: snapshot build date 2026-10-12); `<n>` = distinct data sources. The date is a button that opens the criteria tab and scrolls to Sources & checks (`#d-quality`), reusing the existing "Data & checks →" pattern.
- Refresh live (`loadSource` success): now stamps `src.retrievedAt` and each returned record, so re-pulled records show the live-load date instead of the snapshot date.
- Layer-URL resolution: `sourceId.split('/')[0]` (e.g. `"mis-devapps/6"` → `"mis-devapps"`) joined against `state.sources[]` `{id, url}` (live + snapshot sources merged by `applySnapshot`).

**Unofficial line on every output** (via `UNOFFICIAL` constant in `reportMeta` + targeted spots)
- Excel Summary sheet, PDF header/footer (footer is new — none existed), `#`-comment first line on all four data CSVs (selection, audit, DC timing, DC funding), print-map header, servicing memo, area report, DC timing Excel Summary, executive briefing header.

**Export provenance columns** — `portal, source_url, retrieved_at, source_record_id` added to the audit/per-file CSV and a **new "Records" sheet** in the Excel export (both built from one `recordAuditRows()` helper; the old 14 columns are unchanged).

**Screening-estimate labels** — new subtle `.est-tag` added to: servicing brief water/wastewater/plant lines, dev servicing zone-share / pumping-%-of-firm / plant-reserve lines, trace tightest-pipe line, Plants tab reserve line, sewer loads screen, plant tooltips. Already-labelled surfaces (criteria note, analysis footer, memo note, DC summaries, pipe legend/tips) untouched.

**Rename** — all 8 "Peel Development Tracker" occurrences → "Peel Growth Pipeline (unofficial)" (file comment, reportMeta, printMap, SWMM titles ×2, analysis footer, memo meta, area report meta; version numbers kept).

**Tour** — Welcome step: "This is an unofficial prototype built from public open data, not a Region of Peel product."

**Defensive loading** — `js/provenance.js` is loaded before app.js; app.js uses `window.PeelProvenance` guarded by a null fallback to the old rendering, so a failed script load can never break the page.

## Where each renamed/moved item went

- "Peel Development Tracker" (title, H1, manifest name, report footers, memo/area-report metas, SWMM titles) → "Peel Growth Pipeline (unofficial)". Home-screen/install name stays "Peel Dev" (unchanged `short_name`).
- Old source line `Source: <layer name> (also in …)` → `Source: <portal> · Record ↗ · pulled <date> (also in …)` (same place, richer).
- Per-file export tables: previously skipped in Excel ("use Export CSV") → now also available as the new "Records" sheet with provenance columns.
- Nothing was deleted or moved to a different screen; all Phase 0 changes are additive or in-place.

## Test results

- `npm test`: 86/86 pass, 0 fail (75 pre-existing + 11 new `tests/provenance.test.js`).
- `node --check`: clean on `js/app.js`, `js/info.js`, `js/provenance.js`, `js/brief.js`.
- Logic smoke-tested in node against real `data/snapshot.json`: sourceId-root join resolves; layer endpoints → `…/FeatureServer/9/45?f=pjson`; service roots → `…/query?objectIds=123&f=pjson`; portal names resolve; snapshot date fallback 2026-10-12; live stamp takes precedence; null link for non-numeric uids.

## Not verified / screenshots

- No screenshots: this environment has no live browser for subagents, so dark/light-mode and desktop/phone rendering were verified by code inspection only (CSS-variable-only styling, existing muted/small classes reused, no magic-number heights). Recommend a quick visual check on deploy.
- The new "Data as of" button → criteria-tab scroll reuses the exact handler pattern of the existing "Data & checks →" button but was not click-tested live.
- The phone tap fix was verified by code inspection (pointercancel path + still-down guard); not tested on a physical device.

## Assumptions

1. Portal names ("City of … Open Data", etc.) are interpretive — config gives municipality names and hub hosts, not official portal titles; the `PORTALS` table in `js/provenance.js` is data-driven and easy to correct.
2. `recordSourceUrl` assumes ArcGIS REST semantics (integer object IDs; `/query?objectIds=` for service roots).
3. `retrievedAt` returns date-only ISO (`YYYY-MM-DD`), matching the "pulled-on date" phrasing.
4. `<n>` in "Data as of · n sources" = distinct data sources (sourceId roots), not record count.
5. `applicationPageUrl()` intentionally returns null — no stable municipality application-page URL pattern exists in the codebase; inventing one would be fabrication.
6. The `#` disclaimer comment was added to the four data CSVs only; the change-log CSV and developments CSV were left as-is (out of the enumerated scope, easy to extend).
7. Memo plant line left untagged: the memo already carries the screening-estimate note via `reportFooter`.
8. Banner placement: before `<div class="app">` in document order (always visible, not a fixed overlay); transient full-screen overlays (detail panel, tour) may still cover it, matching the error banner's behavior.
9. Repo/site URL rename ("Fsr-reviewer" → "peel-growth-pipeline") is Phase 6, not done here.
