'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Offline = require('../js/offline.js');

// Minimal in-memory localStorage stand-in. Assigned to globalThis so the
// module's guarded `storage()` lookup finds it; restored after each test.
function stubStorage(initial = {}) {
  const map = new Map(Object.entries(initial));
  const prev = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(String(k), String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
  return () => {
    if (prev === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = prev;
  };
}

test('module exports the documented PeelOffline API', () => {
  for (const name of ['cacheName', 'setCachedAt', 'getCachedAt', 'status', 'register', 'clearCache']) {
    assert.equal(typeof Offline[name], 'function', name);
  }
  assert.equal(Offline.CACHED_AT_KEY, 'peel-dev:sw-cached-at');
});

test('CACHED_AT_KEY uses the existing peel-dev: key prefix', () => {
  assert.ok(Offline.CACHED_AT_KEY.startsWith('peel-dev:'),
    `expected peel-dev: prefix, got ${Offline.CACHED_AT_KEY}`);
});

test('cacheName: versioned cache names match the sw.js convention', () => {
  assert.equal(Offline.cacheName('peel-dev-shell', '2026-10-14'), 'peel-dev-shell-2026-10-14');
  assert.equal(Offline.cacheName('peel-dev-data', '2026-10-14'), 'peel-dev-data-2026-10-14');
  assert.notEqual(Offline.cacheName('peel-dev-shell', '2026-10-14'), Offline.cacheName('peel-dev-shell', '2026-10-15'));
});

test('status: shape and offline-by-default values under node', () => {
  const restore = stubStorage();
  try {
    const s = Offline.status();
    assert.deepEqual(Object.keys(s).sort(), ['cachedAt', 'online', 'supported']);
    assert.equal(s.supported, false); // no serviceWorker in node
    assert.equal(s.online, true);     // onLine API absent -> optimistic default
    assert.equal(s.cachedAt, null);
  } finally { restore(); }
});

test('status: cachedAt reflects the stored timestamp', () => {
  const restore = stubStorage({ 'peel-dev:sw-cached-at': '1760420000000' });
  try {
    assert.equal(Offline.status().cachedAt, 1760420000000);
  } finally { restore(); }
});

test('setCachedAt/getCachedAt: round-trip epoch ms', () => {
  const restore = stubStorage();
  try {
    assert.equal(Offline.getCachedAt(), null);
    assert.equal(Offline.setCachedAt(1760420000000), 1760420000000);
    assert.equal(Offline.getCachedAt(), 1760420000000);
  } finally { restore(); }
});

test('setCachedAt: accepts a Date and stores whole ms', () => {
  const restore = stubStorage();
  try {
    const d = new Date('2026-10-14T12:00:00.000Z');
    assert.equal(Offline.setCachedAt(d), d.getTime());
    assert.equal(Offline.getCachedAt(), d.getTime());
  } finally { restore(); }
});

test('setCachedAt: rejects non-positive / non-numeric input', () => {
  const restore = stubStorage();
  try {
    for (const bad of [0, -5, NaN, Infinity, 'nonsense', undefined]) {
      assert.equal(Offline.setCachedAt(bad), null, String(bad));
    }
    assert.equal(Offline.getCachedAt(), null);
  } finally { restore(); }
});

test('getCachedAt: garbage in storage yields null, never throws', () => {
  for (const raw of ['', 'abc', '-42', '1.5', '  ', null]) {
    const restore = stubStorage(raw === null ? {} : { 'peel-dev:sw-cached-at': raw });
    try {
      assert.equal(Offline.getCachedAt(), null, String(raw));
    } finally { restore(); }
  }
});

test('setCachedAt/getCachedAt: null storage is a clean no-op', () => {
  assert.equal(Offline.setCachedAt(1760420000000), null);
  assert.equal(Offline.getCachedAt(), null);
  assert.equal(Offline.status().cachedAt, null);
});

test('register: resolves null without serviceWorker support, never rejects', async () => {
  const prev = globalThis.window;
  delete globalThis.window; // belt-and-braces: module already required, so no export flip
  try {
    await assert.doesNotReject(Offline.register());
    assert.equal(await Offline.register(), null);
  } finally {
    if (prev !== undefined) globalThis.window = prev;
  }
});

test('clearCache: resolves [] when the Cache API is unavailable', async () => {
  const prev = globalThis.caches;
  delete globalThis.caches;
  try {
    await assert.doesNotReject(Offline.clearCache());
    assert.deepEqual(await Offline.clearCache(), []);
  } finally {
    if (prev !== undefined) globalThis.caches = prev;
  }
});

test('clearCache: deletes only peel-dev-* caches and reports their names', async () => {
  let names = ['peel-dev-shell-1', 'peel-dev-data-1', 'peel-dev-shell-2', 'other-app'];
  const prev = globalThis.caches;
  globalThis.caches = {
    keys: async () => [...names],
    delete: async (n) => { names = names.filter((x) => x !== n); return true; },
  };
  try {
    const deleted = await Offline.clearCache();
    assert.deepEqual(deleted.sort(), ['peel-dev-data-1', 'peel-dev-shell-1', 'peel-dev-shell-2']);
    assert.deepEqual(names, ['other-app']);
  } finally {
    if (prev === undefined) delete globalThis.caches;
    else globalThis.caches = prev;
  }
});
