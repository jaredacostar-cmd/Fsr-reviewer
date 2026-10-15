/* Ground elevation (PeelElevation): the province's lidar terrain model first, terrain tiles where
 * it has no value.
 *
 *  - Ontario Digital Terrain Model (Lidar-Derived), Ontario Ministry of Natural Resources image
 *    service: 0.5 m pixels, CGVD2013, one getSamples request for many points; each value carries
 *    the lidar project it came from (e.g. "GTA 2023"). Open Government Licence – Ontario.
 *  - Fallback: AWS / Mapzen Terrain Tiles (Terrarium PNG, zoom 14, ~7 m pixels here; Canada's
 *    CDEM and SRTM, ±1–2 m), where the lidar returns no value (off its coverage) or the service
 *    does not answer.
 *
 * getGround(lat, lng) → { z, source: 'lidar' | 'terrain', res, project, label }; single calls made
 * in the same tick are sent as one request. Every result names its source; sourcesNote() and
 * sourceRuns() say which parts of a profile came from which.
 *
 * The hillshade (hillshadeLayer) is the same service drawn with its Hillshade raster function.
 */
(function (root) {
  'use strict';
  const DTM = 'https://ws.geoservices.lrc.gov.on.ca/arcgis5/rest/services/Elevation/Ontario_DTM_LidarDerived/ImageServer';
  const TERRAIN_Z = 14;
  // Each source's vertical datum is recorded, so values are never mixed silently: the lidar DTM is
  // CGVD2013 (MNR); the terrain tiles' Canadian part is CDEM (CGVD28), their fill SRTM (EGM96).
  const SRC = {
    lidar: { name: 'Ontario lidar terrain model', short: 'lidar', res: 0.5, datum: 'CGVD2013', note: 'bare-earth lidar, 0.5 m pixels (Ontario Digital Terrain Model, Ministry of Natural Resources, CGVD2013)' },
    terrain: { name: 'terrain tiles', short: 'terrain tiles', res: 7, datum: 'CGVD28 (CDEM) / EGM96 (SRTM)', note: 'terrain tiles (CDEM / SRTM, ~7 m pixels, ±1–2 m)' },
  };
  // Bilinear sampling across tile edges (js/profile-core.js).
  const PC = typeof module !== 'undefined' && module.exports ? require('./profile-core.js') : root.PeelProfileCore;
  const num = v => { if (v == null || v === '') return null; const n = +v; return isFinite(n) ? n : null; };
  const fmtRes = r => `${r < 1 ? r.toFixed(1) : Math.round(r)} m`;

  // ---- Labels -----------------------------------------------------------------------------
  // One result: "Ontario lidar terrain model (GTA 2023, 0.5 m)" / "terrain tiles (~7 m)".
  function sourceLabel(r) {
    if (!r || r.z == null) return 'unavailable';
    if (r.source === 'lidar') return `${SRC.lidar.name} (${[r.project, fmtRes(r.res || 0.5)].filter(Boolean).join(', ')})`;
    return `${SRC.terrain.name} (~${SRC.terrain.res} m)`;
  }
  // Short form for a row: "lidar 0.5 m" / "terrain tiles ~7 m".
  const shortLabel = r => !r || r.z == null ? 'unavailable' : r.source === 'lidar' ? `lidar ${fmtRes(r.res || 0.5)}` : `terrain tiles ~${SRC.terrain.res} m`;
  // The sources behind a set of results, for the note under a result:
  // "Ground: Ontario lidar terrain model (GTA 2023, 0.5 m)." or, mixed,
  // "Ground: Ontario lidar terrain model (GTA 2023, 0.5 m) for 80% of points; terrain tiles (~7 m, ±1–2 m) for the rest."
  function sourcesNote(rs) {
    const ok = (rs || []).filter(r => r && r.z != null);
    if (!ok.length) return 'Ground elevation unavailable (neither the lidar service nor the terrain tiles answered).';
    const lid = ok.filter(r => r.source === 'lidar'), projects = [...new Set(lid.map(r => r.project).filter(Boolean))];
    const res = [...new Set(lid.map(r => r.res || 0.5))];
    const lidTxt = `${SRC.lidar.name} (${[projects.join(', '), res.map(fmtRes).join(' / ')].filter(Boolean).join(', ')})`;
    if (lid.length === ok.length) return `Ground: ${lidTxt}.`;
    if (!lid.length) return `Ground: ${SRC.terrain.note}; the lidar terrain model had no value here.`;
    return `Ground: ${lidTxt} for ${Math.round(lid.length / ok.length * 100)}% of points; ${SRC.terrain.note} for the rest (outside the lidar coverage).`;
  }
  // Consecutive profile samples ({ d, source, project }) from one source, as runs:
  // [{ source, project, label, from, to, n }]. The label changes where the coverage does.
  function sourceRuns(prof) {
    const runs = [];
    for (const p of prof || []) {
      const key = p.z == null ? 'none' : `${p.source}|${p.source === 'lidar' ? p.project || '' : ''}`, last = runs[runs.length - 1];
      if (last && last.key === key) { last.to = p.d; last.n++; continue; }
      runs.push({ key, source: p.z == null ? null : p.source, project: p.source === 'lidar' ? p.project || null : null, label: p.z == null ? 'unavailable' : shortLabel(p), from: p.d, to: p.d, n: 1 });
    }
    return runs.map(({ key, ...r }) => r);
  }

  // ---- Lidar: getSamples on a multipoint ----------------------------------------------------
  // A sample's value is a string ("231.069992065"); off the coverage the service leaves the point
  // out, gives "NoData", or (when no point has a value) answers with an error: all mean no value.
  function parseSamples(json, n) {
    const out = Array.from({ length: n }, () => null);
    if (!json || json.error || !Array.isArray(json.samples)) return out;
    for (const s of json.samples) {
      const i = s.locationId, z = num(s.value);
      if (i == null || i < 0 || i >= n || z == null || z < -100 || z > 3000) continue;
      const a = s.attributes || {};
      out[i] = { z, res: num(a.Resolution_m) || num(s.resolution) || 0.5, project: a.Project ? String(a.Project) : null };
    }
    return out;
  }
  const LIDAR_CHUNK = 60;
  async function lidarFetch(pts) {
    const geometry = JSON.stringify({ points: pts.map(p => [+p.lng.toFixed(6), +p.lat.toFixed(6)]), spatialReference: { wkid: 4326 } });
    // Bilinear: the service blends the four pixels around each point (not the nearest one).
    const qs = new URLSearchParams({ geometry, geometryType: 'esriGeometryMultipoint', returnFirstValueOnly: 'true', interpolation: 'RSP_BilinearInterpolation', outFields: 'Project,Resolution_m', f: 'json' });
    const r = await fetch(`${DTM}/getSamples?${qs}`);
    if (!r.ok) throw new Error(`lidar service ${r.status}`);
    return parseSamples(await r.json(), pts.length);
  }

  // ---- Terrain tiles (the fallback) ---------------------------------------------------------
  // Elevation (m) = R × 256 + G + B / 256 − 32768.
  const terrainTiles = new Map();
  function terrainTile(x, y) {
    const k = `${x}/${y}`; if (terrainTiles.has(k)) return terrainTiles.get(k);
    const pr = new Promise((ok, fail) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(img, 0, 0); ok(g.getImageData(0, 0, 256, 256).data); } catch (e) { fail(e); } };
      img.onerror = () => fail(new Error('terrain tile unavailable'));
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${TERRAIN_Z}/${x}/${y}.png`;
    });
    terrainTiles.set(k, pr); pr.catch(() => terrainTiles.delete(k));
    return pr;
  }
  // Bilinear: the four pixels around the point, fetching the neighbouring tile at an edge; tiles
  // are loaded once (decoded and cached) however many samples use them.
  async function terrainAt(lat, lng) {
    const taps = PC.bilinearTaps(lat, lng, TERRAIN_Z), keys = [...new Set(taps.map(t => `${t.tx}/${t.ty}`))];
    const data = new Map(await Promise.all(keys.map(async k => { const [x, y] = k.split('/').map(Number); return [k, await terrainTile(x, y)]; })));
    return PC.bilinear(taps, (tx, ty, px, py) => { const d = data.get(`${tx}/${ty}`), i = (py * 256 + px) * 4; return PC.terrarium(d[i], d[i + 1], d[i + 2]); });
  }

  // ---- The sampler ----------------------------------------------------------------------------
  // lidar(pts) → [{ z, res, project } | null] (rejects when the service does not answer);
  // terrain(lat, lng) → z (rejects when the tile does not load).
  function makeSampler({ lidar = lidarFetch, terrain = terrainAt, chunk = LIDAR_CHUNK, defer = fn => setTimeout(fn, 0) } = {}) {
    const cache = new Map(), key = p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;
    const stats = { lidarRequests: 0, lidarFailures: 0 };
    async function resolve(pts) {
      const lid = [];
      for (let i = 0; i < pts.length; i += chunk) {
        const part = pts.slice(i, i + chunk);
        stats.lidarRequests++;
        let got; try { got = await lidar(part); } catch (e) { stats.lidarFailures++; got = part.map(() => null); }
        lid.push(...part.map((_, k) => (got && got[k]) || null));
      }
      return Promise.all(pts.map(async (p, i) => {
        const l = lid[i];
        if (l && l.z != null) return finish({ z: l.z, source: 'lidar', res: l.res || 0.5, project: l.project || null });
        try { const z = await terrain(p.lat, p.lng); if (z != null && isFinite(z)) return finish({ z, source: 'terrain', res: SRC.terrain.res, project: null }); } catch (e) { /* no tile */ }
        return finish({ z: null, source: null, res: null, project: null });
      }));
    }
    const finish = r => ({ ...r, label: sourceLabel(r) });
    // Many points ({ lat, lng }) → results in the same order; z is null where neither source has a value.
    async function getGroundMany(pts) {
      const todo = [], seen = new Map();
      for (const p of pts) { const k = key(p); if (!cache.has(k) && !seen.has(k)) { seen.set(k, todo.length); todo.push(p); } }
      if (todo.length) {
        const pr = resolve(todo);
        todo.forEach((p, i) => { const k = key(p); const one = pr.then(rs => rs[i]); cache.set(k, one); one.then(r => { if (r.z == null) cache.delete(k); }, () => cache.delete(k)); });
      }
      return Promise.all(pts.map(p => cache.get(key(p))));
    }
    // Single points asked in the same tick go out as one request.
    let queue = null;
    function flush() { const q = queue; queue = null; getGroundMany(q.map(e => e.p)).then(rs => q.forEach((e, i) => e.ok(rs[i])), err => q.forEach(e => e.fail(err))); }
    function getGround(lat, lng) {
      return new Promise((ok, fail) => { const first = !queue; if (first) queue = []; queue.push({ p: { lat, lng }, ok, fail }); if (first) defer(flush); });
    }
    // The number only (callers that predate the sources); rejects when there is no value.
    async function elevAt(lat, lng) { const r = await getGround(lat, lng); if (r.z == null) throw new Error('elevation unavailable'); return r.z; }
    return { getGround, getGroundMany, elevAt, stats, clear: () => cache.clear() };
  }

  // ---- Hillshade tiles ------------------------------------------------------------------------
  // Web Mercator bounds of a tile, for exportImage.
  function tileBBox(x, y, z) {
    const R = 6378137 * Math.PI, size = 2 * R / 2 ** z;
    return [-R + x * size, R - (y + 1) * size, -R + (x + 1) * size, R - y * size];
  }
  function hillshadeURL(x, y, z, size = 256) {
    const qs = new URLSearchParams({ bbox: tileBBox(x, y, z).map(v => v.toFixed(2)).join(','), bboxSR: '3857', imageSR: '3857', size: `${size},${size}`, format: 'png', transparent: 'true', renderingRule: JSON.stringify({ rasterFunction: 'Hillshade' }), f: 'image' });
    return `${DTM}/exportImage?${qs}`;
  }
  const HILL_MIN_ZOOM = 11;
  function hillshadeLayer(L, opts = {}) {
    const Hill = L.TileLayer.extend({ getTileUrl: c => hillshadeURL(c.x, c.y, c.z) });
    return new Hill('', { minZoom: HILL_MIN_ZOOM, maxZoom: 20, maxNativeZoom: 18, opacity: 0.45, attribution: 'Hillshade: Ontario Digital Terrain Model (Lidar-Derived), Ontario Ministry of Natural Resources, OGL-Ontario', crossOrigin: true, ...opts });
  }

  const api = { DTM, SRC, TERRAIN_Z, terrainAt, sourceLabel, shortLabel, sourcesNote, sourceRuns, parseSamples, makeSampler, tileBBox, hillshadeURL, hillshadeLayer, HILL_MIN_ZOOM };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }

  // ---- Browser: the shared sampler and the hillshade switch ------------------------------------
  const sampler = makeSampler();
  Object.assign(api, { getGround: sampler.getGround, getGroundMany: sampler.getGroundMany, elevAt: sampler.elevAt });
  const store = root.PeelUtil && root.PeelUtil.store;
  const MC = root.PeelMapCore, map = MC && MC.map;
  let hill = null, hillOn = !!(store && store.get('hillshade', false));
  function setHillshade(on) {
    hillOn = !!on; if (store) store.set('hillshade', hillOn);
    if (!map) return;
    if (!hill) {
      if (!map.getPane('hillPane')) { const p = map.createPane('hillPane', map.getPane('rotatePane') || undefined); p.style.zIndex = (root.PeelLayerGroups ? root.PeelLayerGroups.Z.hill : 210); p.style.mixBlendMode = 'multiply'; }
      hill = hillshadeLayer(root.L, { pane: 'hillPane' });
    }
    if (hillOn) hill.addTo(map); else map.removeLayer(hill);
  }
  api.setHillshade = setHillshade;
  api.getHillshade = () => hillOn;
  if (hillOn && map) map.whenReady(() => setHillshade(true));
  root.PeelElevation = api;
})(typeof window !== 'undefined' ? window : globalThis);
