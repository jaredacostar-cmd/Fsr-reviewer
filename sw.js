/*
 * Peel Development Tracker — service worker (Phase 6: offline support).
 *
 * Strategy:
 * - App shell (index.html, css/, js/, icons/, manifest) is precached at
 *   install under a versioned cache name and served cache-first, so the
 *   app opens fully offline from the last successful visit.
 * - data/*.json (snapshot.json plus the ~19 per-topic files) uses
 *   stale-while-revalidate: an instant answer from the cache on every
 *   load, refreshed silently in the background when the network is there.
 *
 * Dependency-free. Everything is guarded: if caches are unavailable, or a
 * fetch throws, the request falls through to the network and the page is
 * never broken by this worker.
 */

// Bump this on every release that changes the app shell or data contract.
// The worker deletes every cache whose name does not carry this version,
// so a bump is the cache-bust mechanism (see activate handler below).
const SW_VERSION = '2026-10-14-phase6';

const SHELL_CACHE = `peel-dev-shell-${SW_VERSION}`;
const DATA_CACHE = `peel-dev-data-${SW_VERSION}`;
const CACHE_PREFIX = 'peel-dev-';

// The app shell. Relative URLs resolve against the worker's scope (site root
// when sw.js is registered from the root, which is how js/offline.js does it).
const SHELL_ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'css/modes.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'js/aerial-check.js',
  'js/aerial.js',
  'js/analysis-tabs.js',
  'js/app.js',
  'js/arcgis.js',
  'js/area-select.js',
  'js/areas.js',
  'js/audit.js',
  'js/brief.js',
  'js/census-view.js',
  'js/changelog.js',
  'js/config.js',
  'js/data-tab.js',
  'js/dc-cost.js',
  'js/dc-infra.js',
  'js/dca-tab.js',
  'js/demand-ui.js',
  'js/demand.js',
  'js/design.js',
  'js/dev-detail.js',
  'js/dev-nav.js',
  'js/dev-verdict.js',
  'js/developments-tab.js',
  'js/devscope.js',
  'js/devtab.js',
  'js/employment.js',
  'js/exist-pipes.js',
  'js/export-comparison.js',
  'js/export-workbook.js',
  'js/exports.js',
  'js/filter-ui.js',
  'js/filters.js',
  'js/fsr.js',
  'js/growth-ui.js',
  'js/growth.js',
  'js/info.js',
  'js/loader.js',
  'js/map-analysis.js',
  'js/map-census.js',
  'js/map-core.js',
  'js/map-labels.js',
  'js/map-markers.js',
  'js/masterplan.js',
  'js/measure.js',
  'js/offline.js',
  'js/overview-tab.js',
  'js/phases.js',
  'js/plan-areas.js',
  'js/provenance.js',
  'js/render-list.js',
  'js/reports.js',
  'js/search-filter.js',
  'js/settings.js',
  'js/sewer-cap.js',
  'js/sewer-profile.js',
  'js/sewer-trace.js',
  'js/share.js',
  'js/site-context.js',
  'js/svc-data.js',
  'js/svc-plants.js',
  'js/svc-tab.js',
  'js/tightpipes.js',
  'js/timeline.js',
  'js/tips.js',
  'js/tool-scope.js',
  'js/tools-batch.js',
  'js/tools-compare.js',
  'js/tools-corridor.js',
  'js/tools-fit.js',
  'js/tools-inquiry.js',
  'js/tools-inspect.js',
  'js/tools-upgrade.js',
  'js/tools.js',
  'js/topbar.js',
  'js/upstream.js',
  'js/util.js',
  'js/water-tab.js',
  'js/water-trace.js'
];

// Data payloads: the snapshot plus every per-topic JSON under data/.
// Add new files here if future phases add data/*.json assets.
// snapshot.json is ~26.5MB parsed; it is the whole point of the offline cache.
const DATA_URL_RE = /(?:^|\/)data\/[^/]+\.json(\?|$)/;

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    if (!('caches' in self)) return;
    try {
      const cache = await caches.open(SHELL_CACHE);
      // addAll is atomic-ish: one failure rejects the whole batch. Try it
      // first, then fall back to best-effort per-asset caching so a single
      // missing asset never kills the install.
      try {
        await cache.addAll(SHELL_ASSETS);
      } catch (e) {
        await Promise.allSettled(SHELL_ASSETS.map((url) =>
          cache.add(url).catch(() => {})
        ));
      }
    } catch (e) {
      // Defensive: a failed install must not leave the page unusable.
    }
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((n) => n.startsWith(CACHE_PREFIX) && n !== SHELL_CACHE && n !== DATA_CACHE)
          .map((n) => caches.delete(n))
      );
    } catch (e) {
      // Defensive.
    }
    // Take over already-open tabs so the new worker guards them too.
    try { await self.clients.claim(); } catch (e) { /* defensive */ }
  })());
});

// stale-while-revalidate for data/*.json: answer from cache immediately,
// refresh in the background when the network is reachable.
async function staleWhileRevalidate(request) {
  const cache = await caches.open(DATA_CACHE);
  const cached = await cache.match(request).catch(() => null);
  const network = fetch(request)
    .then((res) => {
      if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
      return res;
    })
    .catch(() => null);
  if (cached) {
    // Kick the refresh off; the user sees the cached answer right away.
    network.catch(() => {});
    return cached;
  }
  const res = await network;
  return res || new Response('offline', { status: 503, statusText: 'offline' });
}

// cache-first for the app shell; navigation requests fall back to index.html
// when the network is unreachable.
async function shellFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request).catch(() => null);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok && request.method === 'GET' && new URL(request.url).origin === self.location.origin) {
      cache.put(request, res.clone()).catch(() => {});
    }
    return res;
  } catch (e) {
    if (request.mode === 'navigate') {
      const fallback = await cache.match('index.html').catch(() => null);
      if (fallback) return fallback;
    }
    return new Response('offline', { status: 503, statusText: 'offline' });
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin) return; // third-party left alone
  if (DATA_URL_RE.test(url.pathname + url.search)) {
    event.respondWith((async () => {
      try { return await staleWhileRevalidate(req); }
      catch (e) { return fetch(req); }
    })());
  } else {
    event.respondWith((async () => {
      try { return await shellFirst(req); }
      catch (e) { return fetch(req); }
    })());
  }
});
