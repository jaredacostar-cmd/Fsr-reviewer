# Pipeline ledger: the annual snapshot procedure

Phase 5 of `docs/pipeline-ledger-plan.md`, as the August 31 West Area meeting asked: a repeatable annual
snapshot in a standard template. Each snapshot is frozen once written and never rebuilt, so last year's
figures stay what they were.

## When

Once a year, in the fall, after the Monday weekly data build (`.github/workflows/site.yml`) has refreshed
`data/snapshot.json` and `data/dc-gate.json`. Take it the same week each year so the snapshots compare like
for like. An extra snapshot (spring, or after a policy change) gets its own season name.

## Steps

1. Pull the latest `main`. Check that `data/snapshot.json` (`generatedAt`) and `data/dc-gate.json`
   (`generatedAt`) are from the same weekly build: the gate lists the site servicing permits the
   commitment rule reads.
2. See what it will write, without writing anything:

   ```
   node scripts/build-ledger.js --dry-run
   ```

   It prints the name (e.g. `2026-fall`, from the data date), the template number, the developments,
   the units left to build and committed, the people and the tier counts. These should match
   Growth › Forecast's By period in the app at Peel with no filters (the app counts dormant
   developments by today's date, the snapshot by the data date, so one or two developments can
   differ).
3. Write it:

   ```
   node scripts/build-ledger.js
   ```

   This writes `data/ledger/<name>.json`, `data/ledger/<name>.csv` and adds it to `data/ledger/index.json`.
   If the name already exists the script stops: snapshots are never rebuilt. A second snapshot in the
   same season takes `--name` (e.g. `--name 2026-fall-b`).
4. Commit the three files on a branch and open a pull request; merge it once the totals are checked.
5. Send the CSV to the modelling team (Hong, Arash). The `#` lines at the top are its README: the
   source date, the scope, the definitions and the disclaimer, and what every column holds. Most tools
   skip them as comments; in Excel, start the import at the header row (`id,name,…`).
6. In the app, Growth › Forecast shows **Since the last snapshot** (a fold under By period; with
   buttons in its full table): the developments new since it, dropped (built, withdrawn or held
   aside), moved milestone and changed tier, at Peel with no filters.

## The template

`js/ledger-snapshot.js` fixes the columns (`COLUMNS`) and their meaning; the CSV's README lists them.
`TEMPLATE` is the template's number (1 today). A change to the columns is a new number, and a frozen
file is never edited to match: the diff reads both by their column names.

Key columns for the modelling team:

- `id`: the development's key, stable between snapshots (municipality and address).
- `lat`, `lon`: to place each development in the team's own zones.
- `pressure_zone`, `plant`: where the app puts it (the mapped area, else the nearest within 5 km).
- `units_left` and its split by stage (`units_committed`, `units_approved`, `units_review`, `units_early`),
  and by dwelling type; `people` at Peel design criteria.
- `expected_year`, `expected_low`, `expected_high`, `milestone` and the `share_*` columns: when.
- `tier`, `tier_reasons`, `tier_flags`: how sure.

## Notes

- Public data only. Nothing internal to the Region (hydraulic models, SCADA, Development Services data)
  goes into a snapshot or the repository.
- The cross-check against Development Services' ledger (Phase 8) runs on a work machine only, against a
  frozen snapshot.
- The app's Export menu has **Pipeline snapshot (CSV)**: the same template for whatever is on screen,
  today, with the filters set. It is an export, not a frozen snapshot.
