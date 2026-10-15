(function (root) {
'use strict';
  // ---- Time Box arithmetic (PeelTimeBoxCore): Part 3 of the measure / 3D / Time Box brief --------
  // Pure functions, no DOM and no network; js/time-box.js drives them in the browser and the tests
  // run them in Node. The imagery source sits behind a small interface (WAYBACK below):
  //   { id, label, attribution, capabilitiesURL, parse(text) → releases, tileURL(release, z, x, y) }
  // so another archive (the municipalities' yearly aerials) could be added without touching the rest.
  const MAX_TILES = 16;        // tiles hashed per release at most: the zoom is chosen to fit this
  const MAX_Z = 18, MIN_Z = 12;
  const CONCURRENCY = 6;       // requests in flight at most

  // Esri World Imagery Wayback: each release is a WMTS layer in one capabilities document.
  //   <Layer><ows:Title>World Imagery (Wayback 2014-02-20)</ows:Title><ows:Identifier>WB_2014_R01</ows:Identifier>
  //   <ResourceURL template="https://wayback.maptiles.arcgis.com/…/MapServer/tile/10/{TileMatrix}/{TileRow}/{TileCol}"/></Layer>
  const WAYBACK = {
    id: 'wayback',
    label: 'Esri World Imagery Wayback',
    attribution: 'Imagery: Esri World Imagery Wayback (Esri, Maxar, Earthstar Geographics and the GIS User Community)',
    capabilitiesURL: 'https://wayback.maptiles.arcgis.com/arcgis/rest/services/World_Imagery/WMTS/1.0.0/WMTSCapabilities.xml',
    parse: parseWaybackCapabilities,
    tileURL: (r, z, x, y) => fillTemplate(r).replace('{TileMatrix}', z).replace('{TileRow}', y).replace('{TileCol}', x),
    // The same address as a Leaflet tile-layer template ({z}/{y}/{x}).
    // Anything still unfilled fails here, inside the Time Box, not later on every pan in Leaflet.
    leafletTemplate: r => {
      const t = fillTemplate(r).replace('{TileMatrix}', '{z}').replace('{TileRow}', '{y}').replace('{TileCol}', '{x}');
      const left = /\{(?!(?:z|x|y)\})[^}]*\}/.exec(t);
      if (left) throw new Error(`The Wayback tile address has a part the app cannot fill (${left[0]}).`);
      return t;
    },
  };
  // The live capabilities give …/WMTS/1.0.0/{TileMatrixSet}/MapServer/tile/<release>/{TileMatrix}/…:
  // the tile matrix set (and a style, if given) are filled from the layer, else Esri's defaults.
  // Leaflet refuses a template with an unfilled {…}; Esri's server tolerates one, so only the map broke.
  function fillTemplate(r) {
    return String(r.template || '').replace(/\{TileMatrixSet\}/g, r.matrixSet || 'default028mm').replace(/\{Style\}/g, r.style || 'default');
  }
  function parseWaybackCapabilities(xml) {
    const out = [];
    const layers = String(xml || '').split(/<Layer[\s>]/).slice(1);
    for (const L of layers) {
      const title = (/<ows:Title>([^<]*)<\/ows:Title>/.exec(L) || [])[1] || '';
      const id = (/<ows:Identifier>([^<]*)<\/ows:Identifier>/.exec(L) || [])[1] || '';
      const tpl = (/<ResourceURL[^>]*template="([^"]+)"/.exec(L) || [])[1] || '';
      const date = (/(\d{4}-\d{2}-\d{2})/.exec(title) || [])[1];
      const rel = (/\/tile\/(\d+)\/\{TileMatrix\}/.exec(tpl) || [])[1];
      if (!date || !rel || !tpl) continue;
      const matrixSet = (/<TileMatrixSet>([^<]+)<\/TileMatrixSet>/.exec(L) || [])[1];
      const style = (/<Style[^>]*>\s*<ows:Identifier>([^<]+)<\/ows:Identifier>/.exec(L) || [])[1];
      out.push({ id, release: +rel, date, year: +date.slice(0, 4), title: title.trim(), template: tpl.replace(/&amp;/g, '&'), ...(matrixSet ? { matrixSet: matrixSet.trim() } : {}), ...(style ? { style: style.trim() } : {}) });
    }
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.release - b.release);
  }

  // Fallback list: Esri's waybackconfig.json (what Esri's own Wayback app reads):
  //   { "10": { "itemTitle": "World Imagery (Wayback 2014-02-20)", "layerIdentifier": "WB_2014_R01",
  //            "itemURL": "https://wayback…/MapServer/tile/10/{level}/{row}/{col}" }, … }
  function parseWaybackConfig(json) {
    const o = typeof json === 'string' ? JSON.parse(json) : json || {}, out = [];
    for (const [k, v] of Object.entries(o)) {
      const date = (/(\d{4}-\d{2}-\d{2})/.exec(v && v.itemTitle || '') || [])[1];
      if (!date || !v.itemURL) continue;
      out.push({ id: v.layerIdentifier || `release ${k}`, release: +k, date, year: +date.slice(0, 4), title: v.itemTitle, template: v.itemURL.replace('{level}', '{TileMatrix}').replace('{row}', '{TileRow}').replace('{col}', '{TileCol}') });
    }
    return out.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.release - b.release);
  }
  WAYBACK.configURL = 'https://s3-us-west-2.amazonaws.com/config.maptiles.arcgis.com/waybackconfig.json';
  WAYBACK.parseConfig = parseWaybackConfig;

  // ---- The box ---------------------------------------------------------------------------------
  const lngLatToTile = (lng, lat, z) => { const n = 2 ** z, r = lat * Math.PI / 180; return { x: Math.floor((lng + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) }; };
  // bbox: [west, south, east, north]
  function tilesForBox([w, s, e, n], z) {
    const a = lngLatToTile(w, n, z), b = lngLatToTile(e, s, z), out = [];
    for (let y = a.y; y <= b.y; y++) for (let x = a.x; x <= b.x; x++) out.push({ z, x, y });
    return out;
  }
  // The deepest zoom whose tiles over the box number MAX_TILES or fewer (detail without hundreds of requests).
  function chooseZoom(bbox, maxTiles = MAX_TILES) {
    for (let z = MAX_Z; z >= MIN_Z; z--) if (tilesForBox(bbox, z).length <= maxTiles) return z;
    return MIN_Z;
  }
  const normBox = ([w, s, e, n]) => [Math.min(w, e), Math.min(s, n), Math.max(w, e), Math.max(s, n)];
  const cacheKey = (sourceId, bbox, z, latest) => `${sourceId}|${normBox(bbox).map(v => v.toFixed(4)).join(',')}|z${z}|${latest || ''}`;

  // ---- Dedupe ----------------------------------------------------------------------------------
  // signatures: release number → the hashes of the box's tiles in that release (joined), or null
  // when a tile did not load. Consecutive releases with the same signature show the same imagery in
  // the box; the first of each run is when it appeared. Releases that failed are left out.
  function distinctReleases(releases, signatures) {
    const out = []; let last = null;
    for (const r of releases) {
      const sig = signatures[r.release];
      if (sig == null) continue;
      if (sig !== last) { out.push({ ...r, sig }); last = sig; }
    }
    return out;
  }
  // At most one release per year: the latest distinct imagery published that year.
  function onePerYear(distinct) {
    const byYear = new Map();
    for (const r of distinct) byYear.set(r.year, r);   // sorted oldest first: the last one wins
    return [...byYear.values()].sort((a, b) => a.year - b.year);
  }
  // Releases checked newest first would let a cancelled run still show the latest years; but the
  // dedupe needs order, so the check runs over the full list and the result is sorted afterwards.

  // A small promise pool: runs task(i) for i in 0…n-1 with at most `limit` in flight; stops
  // starting new ones when signal aborts (the ones in flight finish or reject on their own).
  async function pool(n, limit, task, signal, onProgress) {
    let next = 0, done = 0; const results = new Array(n);
    async function worker() {
      while (next < n) {
        if (signal && signal.aborted) return;
        const i = next++;
        try { results[i] = await task(i); } catch (e) { results[i] = undefined; if (signal && signal.aborted) return; }
        done++; if (onProgress) onProgress(done, n);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, n) }, worker));
    if (signal && signal.aborted) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
    return results;
  }
  // Signatures by bisection: releases are in date order and imagery changes rarely, so when the
  // first and last of a range show identical tiles the whole range is taken as identical; otherwise
  // the range is split. About (changes × log n) checks instead of n. Limitation: imagery that changed
  // and changed back between two identical releases is not seen. sigAt(i) → Promise<string | null>.
  async function bisectSignatures(n, sigAt, signal) {
    const sig = new Array(n).fill(undefined), memo = new Map();
    const at = i => { if (!memo.has(i)) memo.set(i, Promise.resolve(sigAt(i)).catch(() => null)); return memo.get(i); };
    async function range(a, b) {
      if (signal && signal.aborted) return;
      const [sa, sb] = await Promise.all([at(a), at(b)]);
      sig[a] = sa; sig[b] = sb;
      if (b - a <= 1) return;
      if (sa != null && sa === sb) { for (let i = a + 1; i < b; i++) sig[i] = sa; return; }
      const m = (a + b) >> 1;
      await Promise.all([range(a, m), range(m, b)]);
    }
    if (n) await range(0, n - 1);
    if (signal && signal.aborted) { const e = new Error('cancelled'); e.name = 'AbortError'; throw e; }
    return { sig, checked: memo.size };
  }
  // A limiter: run(fn) starts fn when fewer than `limit` are in flight.
  function limiter(limit) {
    let active = 0; const queue = [];
    const pump = () => { while (active < limit && queue.length) { const { fn, ok, fail } = queue.shift(); active++; Promise.resolve().then(fn).then(ok, fail).finally(() => { active--; pump(); }); } };
    const run = fn => new Promise((ok, fail) => { queue.push({ fn, ok, fail }); pump(); });
    run.active = () => active; run.queued = () => queue.length;
    return run;
  }
  // FNV-1a over bytes, as hex: enough to tell tiles apart (identical bytes → identical hash).
  function hashBytes(bytes) {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) { h ^= bytes[i]; h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(16).padStart(8, '0') + ':' + bytes.length.toString(36);
  }

  // ---- Applications by filing date ---------------------------------------------------------------
  // The filing date of a development: the earliest submission (inception) date on its applications;
  // failing that, its earliest dated application milestone (it was filed on or before then: basis
  // 'by'); failing that, unknown. Events are { date: Date | 'YYYY-MM-DD', phase } (browser) or
  // [date, phase, field] (snapshot).
  const evDate = e => Array.isArray(e) ? e[0] : e && e.date;
  const evPhase = e => Array.isArray(e) ? e[1] : e && e.phase;
  const toTime = d => d instanceof Date ? +d : d ? Date.parse(String(d).length === 10 ? `${d}T00:00:00Z` : d) : NaN;
  function filingDate(p) {
    const recs = (p.records || [p]).filter(r => !r.kind || r.kind === 'application');
    let sub = Infinity, any = Infinity;
    for (const r of recs) for (const e of r.events || []) {
      const t = toTime(evDate(e)); if (!Number.isFinite(t)) continue;
      if (evPhase(e) === 'inception' && t < sub) sub = t;
      if (t < any) any = t;
    }
    if (sub < Infinity) return { time: sub, year: new Date(sub).getUTCFullYear(), basis: 'filed' };
    if (any < Infinity) return { time: any, year: new Date(any).getUTCFullYear(), basis: 'by' };
    return { time: null, year: null, basis: 'unknown' };
  }
  const inBox = ([w, s, e, n], lat, lng) => lat >= s && lat <= n && lng >= w && lng <= e;
  // Point in a ring of [lng, lat] (ray casting): the box as drawn on a rotated map is a turned
  // rectangle in map coordinates, so the bbox alone would take in its corners' surroundings.
  function inRing(ring, lat, lng) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > lat) !== (yj > lat) && lng < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // The bbox of a ring of [lng, lat].
  const ringBox = ring => [Math.min(...ring.map(c => c[0])), Math.min(...ring.map(c => c[1])), Math.max(...ring.map(c => c[0])), Math.max(...ring.map(c => c[1]))];
  // The developments in the box filed by the end of `year`, and those whose date is unknown
  // (shown, flagged, whatever the year).
  // ring (optional): the box's own outline; only developments inside it count.
  function applicationsAsOf(projects, bbox, year, ring) {
    const shown = [], unknown = [], later = [];
    for (const p of projects) {
      if (p.lat == null || p.lng == null || !inBox(bbox, p.lat, p.lng)) continue;
      if (ring && !inRing(ring, p.lat, p.lng)) continue;
      if (!(p.records || [p]).some(r => !r.kind || r.kind === 'application')) continue;
      const f = filingDate(p);
      if (f.basis === 'unknown') unknown.push({ p, f });
      else if (f.year <= year) shown.push({ p, f });
      else later.push({ p, f });
    }
    return { shown, unknown, later };
  }

  // The slider: one stop per year that has imagery; the nearest stop to a requested year.
  function snapYear(years, y) {
    if (!years.length) return null;
    return years.reduce((best, v) => Math.abs(v - y) < Math.abs(best - y) ? v : best, years[0]);
  }

  const api = { fillTemplate, MAX_TILES, MAX_Z, MIN_Z, CONCURRENCY, WAYBACK, parseWaybackCapabilities, parseWaybackConfig, lngLatToTile, tilesForBox, chooseZoom, normBox, cacheKey, distinctReleases, onePerYear, pool, bisectSignatures, limiter, hashBytes, filingDate, applicationsAsOf, inRing, ringBox, snapYear };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTimeBoxCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
