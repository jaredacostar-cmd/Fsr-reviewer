/*
 * PeelOffline — service-worker registration and offline bookkeeping
 * (Phase 6: offline support).
 *
 * Wiring (merge step adds these; this file is inert on its own):
 *   <script src="js/offline.js?v=__BUILD__"></script>  (after js/loader.js, before js/app.js)
 *   app.js boot:  if (window.PeelOffline) PeelOffline.register();
 *
 * API:
 *   register()      guarded sw.js registration; resolves to the
 *                   ServiceWorkerRegistration, or null when unavailable.
 *   status()        {supported, online, cachedAt} for a future UI indicator.
 *   setCachedAt(ts) / getCachedAt()  snapshot timestamp in localStorage
 *                   (key `peel-dev:sw-cached-at`, matching the `peel-dev:`
 *                   prefix used in js/app.js). The service worker's
 *                   stale-while-revalidate pass for data/snapshot.json is
 *                   what makes the timestamp real; app.js stamps it after a
 *                   successful snapshot load (see OFFLINE_WIRING.md).
 *   clearCache()    deletes all `peel-dev-*` caches; resolves to the names
 *                   deleted ([] when the Cache API is unavailable).
 *
 * Pure functions, no DOM/service-worker access at load time: safe to
 * require under `node --test` and to load as a plain <script>. Every
 * platform access is lazy and guarded, and register() never rejects.
 */
(function (root) {
'use strict';

const CACHED_AT_KEY = 'peel-dev:sw-cached-at';
const CACHE_PREFIX = 'peel-dev-';
const SW_URL = 'sw.js';

function isBrowser() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function hasServiceWorker() {
  if (!isBrowser()) return false;
  const nav = navigatorOrNull();
  if (!nav || !('serviceWorker' in nav)) return false;
  try {
    return typeof location !== 'undefined' && /^https?:$/.test(location.protocol);
  } catch (e) { return false; }
}

function navigatorOrNull() {
  try {
    return typeof navigator !== 'undefined' ? navigator : null;
  } catch (e) { return null; }
}

// Versioned cache-name helper (mirrors sw.js: `peel-dev-shell-${SW_VERSION}`).
// Exposed for tests and so future tooling can compute cache names without
// reading sw.js.
function cacheName(base, version) {
  return `${String(base)}-${String(version)}`;
}

function storage() {
  try {
    if (typeof localStorage !== 'undefined' && localStorage) return localStorage;
  } catch (e) { /* storage may throw in restricted contexts */ }
  return null;
}

function parseCachedAt(raw) {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!/^\d+$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Record the moment the snapshot was last successfully loaded/cached.
 * Accepts an epoch-ms number or a Date; stores epoch ms as a string.
 * @returns {number|null} the stored epoch-ms value, or null when storage
 *   is unavailable
 */
function setCachedAt(ts) {
  const n = ts instanceof Date && !isNaN(ts) ? ts.getTime() : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const store = storage();
  if (!store) return null;
  try {
    store.setItem(CACHED_AT_KEY, String(Math.floor(n)));
    return Math.floor(n);
  } catch (e) { return null; }
}

/**
 * Epoch-ms timestamp of the last cached snapshot, or null when unknown.
 */
function getCachedAt() {
  const store = storage();
  if (!store) return null;
  try {
    return parseCachedAt(store.getItem(CACHED_AT_KEY));
  } catch (e) { return null; }
}

/**
 * Offline readiness for a future UI indicator.
 * @returns {{supported:boolean, online:boolean, cachedAt:number|null}}
 *   supported: service workers usable in this context;
 *   online:    navigator.onLine (true when the API is absent, so we never
 *              report "offline" on a guess);
 *   cachedAt:  epoch ms of the last cached snapshot, or null.
 */
function status() {
  const nav = navigatorOrNull();
  let online = true;
  try {
    if (nav && typeof nav.onLine === 'boolean') online = nav.onLine;
  } catch (e) { /* keep the optimistic default */ }
  return {
    supported: hasServiceWorker(),
    online,
    cachedAt: getCachedAt(),
  };
}

/**
 * Register sw.js. Guarded: only on http(s) with service-worker support;
 * no-ops (resolves null) on file:// and under node --test. Never rejects.
 * @param {object} [opts] {scope} — pass-through for the registration options
 * @returns {Promise<ServiceWorkerRegistration|null>}
 */
function register(opts) {
  if (!hasServiceWorker()) return Promise.resolve(null);
  const options = opts && typeof opts === 'object' ? opts : {};
  // A new deploy's worker takes over (skipWaiting + clients.claim): reload once so the page
  // that an older worker served from its cache is replaced by the new build.
  try {
    const had = !!navigator.serviceWorker.controller;
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!had || reloaded) return;
      reloaded = true;
      try { window.location.reload(); } catch (e) { /* defensive */ }
    });
  } catch (e) { /* defensive */ }
  const doRegister = () => {
    try {
      return Promise.resolve(navigator.serviceWorker.register(SW_URL, options))
        .catch(() => null);
    } catch (e) { return Promise.resolve(null); }
  };
  try {
    if (document.readyState === 'loading') {
      return new Promise((resolve) => {
        window.addEventListener('load', () => { doRegister().then(resolve, () => resolve(null)); }, { once: true });
      });
    }
    return doRegister();
  } catch (e) { return Promise.resolve(null); }
}

/**
 * Delete every cache this app owns (the `peel-dev-` prefix, both the
 * current version and stale leftovers).
 * @returns {Promise<string[]>} deleted cache names; [] when the Cache API
 *   is unavailable
 */
function clearCache() {
  let cachesApi = null;
  try {
    cachesApi = typeof caches !== 'undefined' ? caches : null;
  } catch (e) { /* restricted context */ }
  if (!cachesApi || typeof cachesApi.keys !== 'function') return Promise.resolve([]);
  return cachesApi.keys()
    .then((names) => {
      const ours = (names || []).filter((n) => typeof n === 'string' && n.startsWith(CACHE_PREFIX));
      return Promise.all(ours.map((n) => cachesApi.delete(n).catch(() => false).then(() => n)));
    })
    .catch(() => []);
}

const api = {
  CACHED_AT_KEY,
  SW_VERSION: null, // version authority lives in sw.js (SW_VERSION const); bump there
  cacheName,
  setCachedAt,
  getCachedAt,
  status,
  register,
  clearCache,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelOffline = api;
})(typeof window !== 'undefined' ? window : globalThis);
