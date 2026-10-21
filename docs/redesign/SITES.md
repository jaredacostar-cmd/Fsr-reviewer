# Site → proposal → file

Step 1 was a report; step 2 (below) applies it. The step 1 report is built from the 2026-10-19 snapshot by
`node scripts/audit-sites.js` → `data/site-audit.json`; rules in `js/sites.js`, tests in
`tests/sites.test.js`.

## Why

A development today is one tree of files (`js/tree.js`), and files mostly join a tree because their
land overlaps. Overlap says two files are on the same land, not that they are one project. 1-30
Gillingham Dr held a 1,753-home redevelopment, a patio, a temporary trailer and a unit fit-out; the
patio's approval and the fit-out's permit put the 1,753 homes "Under construction".

## The model

| Layer | What it is | Stage |
|---|---|---|
| **Site** | The land, and everything filed on it, history included | None of its own |
| **Proposal** | One development intent: adds homes or floor space, or changes what the land allows | Its own, from its own files only |
| **File** | One municipal record, as published | Its own status |

Each file gets a **scope** first:

- **major**: states homes, is a rezoning / official plan / subdivision / block plan / condominium,
  or describes a building (a storey, a tower, a new building, a redevelopment). A file that says
  nothing either way ("Application for Site Plan Control") is taken as a building.
- **minor**: a limited / express / minor site plan, or wording about what already stands (patio,
  fit-out, interior, garage, door, gate, parking lot, car wash, signage…), and no homes.
- **admin**: cancelled, withdrawn or superseded: history, kept with the proposal it ties to (as
  10194 Heart Lake Rd keeps SPA-2022-0101, which SPA-2024-0144 replaces), else the site's.

Then, within each tree (the site), the major files join one proposal by the tree's links, except a
**redevelopment of a plan built long ago**, which is a second proposal on the site. A minor file
stays with a proposal only when it names one of its files or reads as a revision of it; otherwise
it is **site activity**. A cancelled or superseded file ties the files filed before and after it. Overlap-only links are kept (they are already marked "check" for review, and
are usually right: a condominium repeating its site plan's 949 homes).

## Results

**Files** (5,998 in trees): 4,870 major · 917 minor · 211 admin. Minor files are mostly Brampton's
(811; its open data publishes every limited site plan).

**Developments** (3,924 live):

| Outcome | Developments | What changes |
|---|---|---|
| Unchanged | 3,166 | One proposal, nothing set aside |
| Site activity set aside | 301 | One proposal; patios, fit-outs, old history beside it |
| Split | 50 | Two or more proposals on one site: an old built plan and a new one |
| No proposal left | 407 | Only site activity (a plaza's alterations): a site page, not a development |

**Homes: 256,814 → 256,805.** No split counts homes twice; no proposal gains or loses homes but
the 8 single-house files below.

**Stages: 97 developments would change stage**, 3 of them with homes:

| Site | Homes | Today | Proposal | Set aside as site activity |
|---|---|---|---|---|
| 263 Queen St E | 2,810 | In review | Pre-consultation | SPA-2026-0058 (day care interior and play area), SPA-2021-0018 (minor variance conditions), SP86-085 (old plan, superseded) |
| 10100 Heart Lake Rd | 945 | Approved | In review | SPA-2025-0179 (an addition to the existing buildings) |
| 273 Main St N | 52 | Approved | In review | DPS16-002 (2016 rear addition, superseded by the new 5-storey plan) |

The other 94 have no homes: plazas and industrial sites whose stage today is their latest
alteration's ("Approved" for a new door) and would be the building's own (mostly "Completed").

1-30 Gillingham Dr is not in the table: it was fixed in the tree on 2026-10-21 (a limited site plan
is never a pre-consultation's formal file), and this model gives the same answer without that rule.

## Your calls before step 2

1. **No proposal left (407).** These developments become site pages and leave the development list
   and counts (they hold no homes but 8 single houses). Keep them listed as "site activity" instead?
2. **Single houses (8 files, 1–2 homes each):** a garage, a door, a shed on an existing house whose
   count comes from the wording (116 Massey St, 2 Gable Dr, 3 Knightsbridge Rd…). Today counted as
   homes; under the model, an existing house. Drop them?
3. **Additions and change of use.** An addition to an existing building (10100 Heart Lake Rd's
   SPA-2025-0179) counts as minor site activity when its wording says "addition to the existing";
   a 760 m² day care addition (PRE-2025-0048, 263 Queen St E) reads as a building and joins the
   2,810-home proposal as its main file. Non-residential floor space as its own proposal is the
   cleaner rule; it needs a GFA or wording threshold.
4. **The minor-wording list** (`MINOR_TEXT` in `js/sites.js`) is the judgement most worth a look:
   the reasons in `data/site-audit.json` (`site[].why`) show which word set each file aside.

## Step 2 (done 2026-10-21)

Your calls were left at these defaults; each is one switch or one list to change:

1. **Site activity is held aside like dormant developments**: out of every count and list, with
   "N site activity left out · include" in Find (kept in the share link as `sx=1`). Its pages still
   open.
2. **The 8 single-house files** (8 homes) are site activity, so they leave the counts with it.
3. **Additions** stay as `js/sites.js` reads them today.
4. **The minor-wording list** is unchanged.

How it works:

- `scripts/build-tree-counts.js` splits each tree with `js/sites.js`: each proposal is a
  development (the main one keeps the tree's key, others `<key>~<file>`), and the site activity is
  one more (`sa: 1`). Parts of one site carry the main development's key (`st`). Site activity filed
  as a tree of its own (the Gillingham patio) joins the site of the live development whose land
  holds it. A tree of cancelled files only stays a cancelled development.
- The app reads `sa` / `st` (`js/tree-counts.js`), holds site activity aside (`js/app.js`), and
  every development page has **On this site**: the other proposals on its land, then its other
  activity (`js/dev-nav.js`, `js/devtab.js`, `PeelTreeGroups.siteParts`).
- 755 site-activity developments are held aside (8 homes); 892 developments share a site.
