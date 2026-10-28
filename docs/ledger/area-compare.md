# Area comparison (offline)

Compares units per area from a sheet you fill with what the app finds in the same areas. The first
use is the Region's Deferral Concept Plan, whose units come from FSRs submitted to the Region.

**The filled sheet stays off the repo.** FSRs submitted to the Region are internal, and so are the
figures taken from them. Fill the sheet in `reports-internal/` (in `.gitignore`, never committed);
the script writes its report there too. The repo holds only the blank template.

## Run it

```
cp docs/ledger/area-compare-template.csv reports-internal/deferral-areas.csv
# fill start_year, fsr_units (and any other columns) in reports-internal/deferral-areas.csv
node scripts/compare-areas.js reports-internal/deferral-areas.csv
```

It builds the ledger rows as `scripts/build-ledger.js` does (Peel, no filters, the Peel rule) and
writes, in `reports-internal/`:

- `<sheet>-compare.csv` and `.md`: one line per area. Sheet units, the app's units left to build in
  planning applications (by stage, committed), the gap, the app's share, the units the app expects
  before the area's start year, and the adopted secondary plan total where `data/plan-targets.json`
  has one.
- `<sheet>-sites.csv`: the app's developments in each area, largest first, with stage, tier,
  expected year and file numbers, to tick off against the FSR list.

## Reading the gap

The sheet counts units with an FSR; the app counts units in a planning application. The gap is
mostly land with an FSR but no application yet (block plans, secondary plan areas ahead of draft
plans), or an area drawn differently. The sites file shows which: an FSR site with no matching app
development is land the app can't see yet.

"Before start" counts a whole development when its likely expected year (half its homes built) is
before the area's start year. It is sensitive at the boundary: the script times from the data date
and the app from today, so a large site expected around the start year can fall on either side
(Streetsville's 1,808-unit Queen St S site moved 2032 → 2031 between the two in October 2026).

## Areas

`match` finds an area in the app; parts joined by `;`, any matching:

- an area id from `data/areas.json` as is (`sp:caledon:alloa`, `mtsa:…`, `precinct:…`): its
  polygon, or a row tagged with it;
- `circle:<lng>,<lat>,<metres>`;
- `geojson:<path>`: inside any polygon of a local file (keep a Region boundary in
  `reports-internal/` too);
- `dev:<ledger id>`: one development.

The template's Macville and North Hill circles and Heritage Heights (the whole secondary plan, not
only north of the CNR line) are stand-ins until a boundary is drawn.
