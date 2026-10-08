/*
 * Load one data source (a FeatureServer/MapServer and all its layers) into
 * normalised records. Shared by the browser app and the weekly snapshot job.
 */
(function (root) {
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const P = isNode ? require('./phases.js') : root.PeelPhases;
  const A = isNode ? require('./arcgis.js') : root.PeelArcGIS;

  // The date field used for the "records since" filter and newest-first ordering.
  function sinceFieldFor(fmap, kind) {
    const order = kind === 'permit' ? ['permit', 'inception', 'approved'] : ['inception', 'review', 'approved'];
    for (const ev of order) { const d = fmap.dates.find(x => x.event === ev); if (d) return d.field; }
    return null;
  }

  // Servers differ in which date-literal syntax they accept, so try each, then no filter.
  async function queryWithFallback(url, info, fmap, src, opts) {
    const f = sinceFieldFor(fmap, src.kind);
    const y = Number(opts.sinceYear);
    const wheres = [];
    if (f && y) {
      wheres.push(`(${f} >= DATE '${y}-01-01' OR ${f} IS NULL)`);
      wheres.push(`(${f} >= timestamp '${y}-01-01 00:00:00' OR ${f} IS NULL)`);
    }
    wheres.push('1=1');
    let lastErr;
    for (const where of wheres) {
      try {
        return await A.queryAll(url, info, {
          where, bbox: opts.bbox, max: opts.maxPerLayer, pageSize: opts.pageSize,
          orderBy: f ? `${f} DESC` : undefined,
          onProgress: opts.onProgress,
        });
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  /**
   * @param {object} src  { id, name, municipality, kind, url }
   * @param {object} opts { bbox, sinceYear, maxPerLayer, pageSize, onProgress }
   * @returns {Promise<{records: object[], layers: object[], truncated: boolean}>}
   */
  async function loadSource(src, opts) {
    const records = [], layers = [];
    let truncated = false;
    for (const layer of await A.resolveLayers(src.url)) {
      const info = await A.layerInfo(layer.url);
      if (!info.geometryType) continue; // table without geometry
      const fmap = P.detectFields(info.fields || []);
      const res = await queryWithFallback(layer.url, info, fmap, src, opts);
      truncated = truncated || res.truncated;
      const lsrc = { ...src, id: `${src.id}/${layer.url.split('/').pop()}` };
      for (const f of res.features) {
        const r = P.normalizeRecord(f, fmap, lsrc);
        if (r.lat != null) records.push(r);
      }
      layers.push({ name: info.name || layer.name, url: layer.url, count: res.features.length });
    }
    return { records, layers, truncated };
  }

  const api = { loadSource, sinceFieldFor };
  if (isNode) module.exports = api;
  else root.PeelLoader = api;
})(typeof window !== 'undefined' ? window : globalThis);
