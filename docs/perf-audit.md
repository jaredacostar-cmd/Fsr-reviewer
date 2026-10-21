# Speed and efficiency audit (October 2026)

Measured on the real `data/snapshot.json`: 85,141 records → 70,306 after dedupe → 24,786 developments.
Node 22, 4 cores. No browser profiling: the browser timings below are estimates.

## Done in this pass

All of these give the same results (1270/1270 unit tests pass, and the built developments hash the same before and after).

| Change | Where | Effect |
|---|---|---|
| Dormant / site-activity switches (Find, share links) re-hold the built developments instead of rebuilding them | `js/app.js` `rehold()`, `filter-ui.js`, `share.js` | ~3 s → a filter pass per toggle |
| `canonRef` and `humanizeField` cached per string; `numberWords` regexes compiled once | `js/phases.js` | ~90k + ~75k repeated calls per rebuild become lookups |
| Sewer designer caches the part-full velocity per slope | `js/sewer-design.js` | `sewer-design.test.js` 11.4 s → 5.0 s; the Design tool is faster by about the same factor |
| Service worker installs the page's own `?v=<build>` URLs | `sw.js` | the first visit no longer downloads the ~1 MB (gzip) app shell twice |
| Service worker skips rewriting a data file revalidated as unchanged (same ETag / Last-Modified) | `sw.js` | no 42 MB Cache Storage write on every load |
| Canvas hit-test reads each canvas's z once per call, not inside the sort | `js/map-core.js` | fewer `getComputedStyle` calls per mouse move |
| Existing-pipes redraw and layer-bar sync debounced on `moveend` | `js/exist-pipes.js`, `js/layer-groups.js` | one redraw per run of pans |
| Search splits the query once per query, not once per development | `js/app.js` | |
| Only permit dots in view count toward the 3,000-dot cap | `js/map-markers.js` | fixes dots missing once many were off screen |
| Time-lapse holds its year while the tab is hidden | `js/timelapse.js` | no rendering in background tabs |
| Deploy checkout is a treeless clone (`filter: tree:0`) | `.github/workflows/site.yml` | the change log needs only commit messages |

## Biggest remaining wins (need a decision or a larger change)

1. **Publish `data/snapshot-index.json` (owner decision).** `bootFromIndex` (`js/app.js`) already paints from it, but the weekly commit leaves it out on purpose (`tests/build-guards.test.js`: "stays out until the owner enables it"). Until it is published, every visit 404s on the index and waits for the 42 MB snapshot (4.1 MB gzip) before anything shows.
2. **Slim the snapshot format.** Measured on the real file, raw / gzip:
   - Now: 42.2 MB / 4.09 MB.
   - After step 1 below: 33.6 MB / 3.59 MB.
   - After step 2: 16.4 MB / 2.52 MB.

   JSON parse time follows raw size (~700 ms in Node for today's file).
   1. Drop the redundant fields: `newBuild` (always true), `municipality` and `kind` (one value per source), the `sourceId` prefix in `uid`, and `fileKey` (the client recomputes it). Round coordinates to 5 decimals.
   2. Go columnar, with string dictionaries for type, status, source, phase and description.

   Decode in `applySnapshot`.
3. **Map markers are rebuilt on every filter change.** `renderMarkers` (`js/render-list.js`) clears the cluster and creates a new `L.marker` plus a tooltip for every project. Keep a `Map<key, marker>`, call `setIcon` when the look changes, and use `removeLayers` / `addLayers` for the difference. Each filter change also runs `matches()` over all projects 3 times, plus a pass for each of the 7 flags (`app.js`, `timeline.js`, `filter-ui.js`). Fold these into one loop.
4. **The site layer rebuilds its permit dots on every pan.** In `renderSiteLayer` (`js/map-markers.js`), cache the dots per project the way outlines are cached (`p._ol`), and memoise `siteApps`, `sitePermits` and `parentApps`.
5. **The capital-works layer draws on SVG with eager tooltips.** In `js/capital-ea.js`, give its panes an `L.canvas` renderer and build tooltip content lazily.
6. **Snapshot parse and build run on the main thread.** Parse takes ~0.7 s, decode ~0.3 s, dedupe + build ~2.8 s (Node). Move them to a Worker.
7. **The build repeats per-record work.** `permitRole` runs ~200k times per build (~360 ms): cache it per build, but invalidate wherever `units` changes inside `buildProjects`. Build `timeline[].text` lazily: ~75k strings per build, much of the ~1 s of GC. `landShare` could be cached on polygon pairs (~200 ms).
8. **`history.json` (3.6 MB) is fetched and parsed at startup** by `js/accuracy.js` for one section of Sources & checks, then again by `app.js`. Share one load and build the report when the page opens. `council.json` and `fsr.json` each have two separate loaders too.
9. **Third-party scripts block rendering.** Leaflet comes from unpkg with no `preconnect`, and it is never cached for offline use. Host it locally, or at least add `preconnect` and SRI hashes. About 740 KB of rarely used tool scripts could load when their tab opens. Minifying in the deploy step would take JS from ~1.07 MB to an estimated ~0.6 MB gzip.
10. **The data cache is wiped on every deploy** (`DATA_CACHE` carries the build). An unversioned data cache would keep the 42 MB across deploys. It needs a guard for format changes.

## Tests and CI

- **13 test files each rebuild the real developments in their own process**, at ~4–6 s each and ~55 s of the ~125 s CPU total. Caching the built `{ projects, records }` with `v8.serialize` in the OS temp dir, keyed on the data files' size and mtime, measured 1.6 s per load instead.
- **`servicing-permits.test.js` builds the developments twice** (12 s).
- **The unit tests run three times on the weekly run** (`site.yml`: snapshot job, data gate, deploy). The deploy job could skip them when the snapshot job succeeded.
- **There is no caching** for Playwright browsers or the `npx eslint` download.
- **`js/arcgis.js` `fetchJSON` has a timeout but no retry.** One transient 5xx marks a whole source stale for the week.
- **The 13 sources are fetched one after another** in `build-snapshot.js`. Bounded parallelism (3–4) would shorten the weekly job.
- **`docs/` is ~165 MB of the ~199 MB pack** (screenshots). Sparse checkout in CI, or LFS for new screenshots, would help. Shrinking the history would need a coordinated rewrite.
