# DC impact prototype

These are the throwaway scripts behind the figures in [../PLAN.md](../PLAN.md),
[../ALLOCATION.md](../ALLOCATION.md) and the mock-up. They are not part of the app. They load
the app in a headless browser and run the allocation on its live state, using the app's own
modules (sewers, `sewerGrowth().devPipe`, `dcSewerPath`, `D.estimate`, `dcaBudget`).

Rerun them whenever `data/dc-infra.json` (the DC mapping) changes. Every count, gate year and
relief match depends on it.

| File | What it does |
|---|---|
| `run.js` | Serves the repo, opens the app in Chromium, waits for the data, then evaluates a script in the page and writes its result as JSON |
| `impact.js` | The allocation: relief matching with the size and same-street rule (ALLOCATION.md step 3, version 2), tiers A and B, built split out, the "same sewershed" counts, costs, the funding screen, and map geometry for ten sample projects |
| `make-mockup-data.py` | Turns that JSON into the mock-up's data file (`<dir>/build/data.json`): rows, project details, map paths and funding rows |

## Running

```sh
# Playwright and Chromium, plus local copies of the unpkg packages if unpkg is blocked
# (CDN_DIR layout: <name>-<version>/package/..., as tests/browser/run.js uses)
PLAYWRIGHT=/path/to/playwright-core CHROMIUM=/path/to/chrome CDN_DIR=/path/to/cdn \
  node docs/dc-impact/prototype/run.js docs/dc-impact/prototype/impact.js /tmp/out/impact.json

python3 docs/dc-impact/prototype/make-mockup-data.py /tmp/out impact.json
```

The run takes about a minute, most of it loading the app. The allocation itself takes about
2 s.

## After the DC mapping update

1. Rerun `impact.js`. Compare it with the October 2026 figures recorded in ALLOCATION.md
   (step 3, Results) and PLAN.md (Prototype findings).
2. Check the relief-matching rule still holds on the new lines. Look in particular at mains with
   no diameter, local mains near trunks, and 22-2255 as the largest gate.
3. Refresh the mock-up's data file and the figures in both documents.
