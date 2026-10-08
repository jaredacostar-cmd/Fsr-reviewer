/*
 * Minimal ArcGIS REST client: service/layer discovery, paged queries,
 * Esri-JSON -> GeoJSON conversion, and ArcGIS Hub dataset discovery.
 */
(function (root) {
  'use strict';

  async function fetchJSON(url, params, { timeout = 60000, method } = {}) {
    const qs = new URLSearchParams(params || {});
    const full = qs.toString() ? `${url}${url.includes('?') ? '&' : '?'}${qs}` : url;
    // Long query strings (big WHERE clauses / objectId lists) go as POST.
    const usePost = method === 'POST' || full.length > 1800;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeout);
    try {
      const res = usePost
        ? await fetch(url, { method: 'POST', body: qs, signal: ctrl.signal, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
        : await fetch(full, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json && json.error) throw new Error(json.error.message || JSON.stringify(json.error));
      return json;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('timed out');
      throw e;
    } finally {
      clearTimeout(t);
    }
  }

  const LAYER_URL = /\/(FeatureServer|MapServer)\/\d+\/?$/i;
  const SERVICE_URL = /\/(FeatureServer|MapServer)\/?$/i;

  /** Expand a service URL into its spatial layers. */
  async function resolveLayers(url) {
    url = url.replace(/\/+$/, '').replace(/\?.*$/, '');
    if (LAYER_URL.test(url)) return [{ url, name: null }];
    if (!SERVICE_URL.test(url)) throw new Error('Not an ArcGIS FeatureServer/MapServer URL');
    const svc = await fetchJSON(url, { f: 'json' });
    const layers = (svc.layers || []).filter(l => !l.subLayerIds && (!l.type || /feature layer/i.test(l.type)));
    if (!layers.length) throw new Error('Service has no feature layers');
    return layers.map(l => ({ url: `${url}/${l.id}`, name: l.name }));
  }

  function layerInfo(url) {
    return fetchJSON(url, { f: 'json' });
  }

  // ---- Esri JSON -> GeoJSON ----------------------------------------------------
  function esriGeomToGeoJSON(g) {
    if (!g) return null;
    if (g.x != null && g.y != null) return { type: 'Point', coordinates: [g.x, g.y] };
    if (g.points) return { type: 'MultiPoint', coordinates: g.points };
    if (g.rings) return { type: 'Polygon', coordinates: g.rings };
    if (g.paths) return { type: 'MultiLineString', coordinates: g.paths };
    return null;
  }
  function esriToGeoJSON(json, oidField) {
    return {
      type: 'FeatureCollection',
      features: (json.features || []).map(f => ({
        type: 'Feature',
        id: oidField ? f.attributes[oidField] : undefined,
        properties: f.attributes,
        geometry: esriGeomToGeoJSON(f.geometry),
      })),
      exceededTransferLimit: json.exceededTransferLimit,
    };
  }

  function oidFieldOf(info) {
    if (info.objectIdField) return info.objectIdField;
    const f = (info.fields || []).find(x => x.type === 'esriFieldTypeOID');
    return f ? f.name : 'OBJECTID';
  }

  /**
   * Query every feature of a layer matching `where`, clipped to the bbox.
   * Pages with resultOffset when supported, otherwise by objectId batches.
   * @returns {Promise<{features: object[], truncated: boolean}>}
   */
  async function queryAll(url, info, { where = '1=1', bbox, max = 20000, pageSize = 2000, orderBy, onProgress } = {}) {
    const oid = oidFieldOf(info);
    const geojsonOK = /geojson/i.test(info.supportedQueryFormats || '');
    const pageable = info.advancedQueryCapabilities ? info.advancedQueryCapabilities.supportsPagination !== false : !!info.supportsPagination;
    const size = Math.min(pageSize, info.maxRecordCount || pageSize);
    const base = {
      where,
      outFields: '*',
      outSR: 4326,
      returnGeometry: true,
      f: geojsonOK ? 'geojson' : 'json',
    };
    if (bbox) Object.assign(base, {
      geometry: `${bbox.xmin},${bbox.ymin},${bbox.xmax},${bbox.ymax}`,
      geometryType: 'esriGeometryEnvelope', inSR: 4326, spatialRel: 'esriSpatialRelIntersects',
    });
    // Polygons are only used for a marker position; simplify server-side.
    if (/polygon|polyline/i.test(info.geometryType || '')) base.maxAllowableOffset = 0.00005;

    const toFC = j => geojsonOK ? j : esriToGeoJSON(j, oid);
    const out = [];
    let truncated = false;

    if (pageable) {
      if (orderBy) base.orderByFields = orderBy;
      else base.orderByFields = `${oid} DESC`;
      for (let offset = 0; out.length < max; offset += size) {
        const fc = toFC(await fetchJSON(`${url}/query`, { ...base, resultOffset: offset, resultRecordCount: size }));
        const feats = fc.features || [];
        out.push(...feats);
        onProgress && onProgress(out.length);
        const more = fc.exceededTransferLimit || (fc.properties && fc.properties.exceededTransferLimit) || feats.length === size;
        if (!more || !feats.length) break;
        if (out.length >= max) truncated = true;
      }
    } else {
      const idsResp = await fetchJSON(`${url}/query`, { ...base, returnIdsOnly: true, f: 'json' });
      let ids = (idsResp.objectIds || []).sort((a, b) => b - a);
      if (ids.length > max) { ids = ids.slice(0, max); truncated = true; }
      const batch = Math.min(size, 500);
      for (let i = 0; i < ids.length; i += batch) {
        const q = { ...base, objectIds: ids.slice(i, i + batch).join(',') };
        delete q.where;
        const fc = toFC(await fetchJSON(`${url}/query`, q));
        out.push(...(fc.features || []));
        onProgress && onProgress(out.length);
      }
    }
    return { features: out.slice(0, max), truncated };
  }

  // ---- Hub discovery -----------------------------------------------------------
  const SHARING = 'https://www.arcgis.com/sharing/rest';

  async function hubOrgId(host) {
    const d = await fetchJSON(`https://hub.arcgis.com/api/v3/domains/${encodeURIComponent(host)}`, {});
    if (!d || !d.orgId) throw new Error('could not resolve hub organisation');
    return d.orgId;
  }

  function intersects(ext, bbox) {
    if (!Array.isArray(ext) || ext.length !== 2) return true; // unknown extent: keep
    const [[x1, y1], [x2, y2]] = ext;
    return !(x2 < bbox.xmin || x1 > bbox.xmax || y2 < bbox.ymin || y1 > bbox.ymax);
  }

  /** List development / permit feature services published by a hub's organisation. */
  async function discoverHub(hub, cfg) {
    let q;
    try {
      const orgId = await hubOrgId(hub.host);
      q = `orgid:${orgId} AND type:"Feature Service" AND ${cfg.discoverQuery}`;
    } catch (e) {
      // Fall back to a keyword search scoped by municipality name + extent.
      q = `type:"Feature Service" AND "${hub.municipality}" AND ${cfg.discoverQuery}`;
    }
    const items = [];
    for (let start = 1; start > 0 && items.length < 300;) {
      const r = await fetchJSON(`${SHARING}/search`, { q, num: 100, start, f: 'json', sortField: 'modified', sortOrder: 'desc' });
      items.push(...(r.results || []));
      start = r.nextStart;
    }
    return items
      .filter(it => it.url && intersects(it.extent, cfg.bbox) && !cfg.discoverExclude.test(it.title))
      .map(it => ({
        id: `hub-${it.id}`,
        name: `${hub.municipality} – ${it.title}`,
        municipality: hub.municipality,
        kind: cfg.permitPattern.test(it.title) ? 'permit' : 'application',
        url: it.url,
        modified: it.modified,
        itemId: it.id,
        discovered: true,
      }));
  }

  const api = { fetchJSON, resolveLayers, layerInfo, queryAll, discoverHub, esriToGeoJSON };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelArcGIS = api;
})(typeof window !== 'undefined' ? window : globalThis);
