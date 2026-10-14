/* Site constraint layers (PeelConstraints): gas pipelines, hydro (transmission) lines,
 * watercourses and conservation authority regulation limits, each a map toggle.
 *
 * Live from public services, drawn from the zoom each layer needs, fetched by ~2 km tile and
 * cached (like the existing pipes):
 *  - gas, hydro: the province's Utility Line layer (Land Information Ontario); OpenStreetMap
 *    when that service doesn't answer.
 *  - watercourses: the Ontario Hydro Network (LIO); OpenStreetMap as the fallback. The measure
 *    tool reads them too, for the watercourses a line crosses.
 *  - regulation limits: each conservation authority covering Peel that publishes its limit
 *    (Ontario Regulation 41/24). Screening only: the authority confirms what is regulated.
 */
(function (root) {
  'use strict';
  const { $, esc, store, token } = window.PeelUtil;
  const A = window.PeelArcGIS;
  const map = window.PeelMapCore.map;
  const MA = () => root.PeelMapAnalysis;
  const SD = () => root.PeelSvcData;

  const LIO = 'https://ws.lioservices.lrc.gov.on.ca/arcgis2/rest/services/LIO_OPEN_DATA';
  const UTIL_LINE = `${LIO}/LIO_Open05/MapServer/11`;
  // A field that may be named differently in each source: the first one present.
  const pick = (p, ...ks) => { for (const k of ks) { const v = p[k] ?? p[k.toUpperCase()] ?? p[k.toLowerCase()]; if (v != null && String(v).trim() !== '') return String(v).trim(); } return ''; };
  // The province's Utility Line type (CLASS_SUBTYPE), e.g. "Unknown Pipeline", "Unknown Transmission Line".
  const utilType = p => pick(p, 'CLASS_SUBTYPE', 'UTILITY_LINE_TYPE', 'TYPE');

  const LAYERS = {
    gas: {
      label: 'Gas pipelines', short: 'gas', color: '--cx-gas', minZoom: 11, area: false, dash: '9 5', weight: 2.5,
      // Peel's pipelines are recorded as "Unknown Pipeline" (product not given): the gas and oil
      // transmission pipelines; water pipelines are excluded.
      sources: [{ url: UTIL_LINE, f: 'CLASS_SUBTYPE,LOCATION_DESCR,LOCATION_ACCURACY', src: 'Land Information Ontario (Utility Line)', keep: p => /pipeline/i.test(utilType(p)) && !/water|sewer/i.test(utilType(p)), name: p => [/unknown pipeline/i.test(utilType(p)) ? 'Pipeline (gas or oil; product not recorded)' : utilType(p), pick(p, 'LOCATION_DESCR'), pick(p, 'LOCATION_ACCURACY') && `located ${pick(p, 'LOCATION_ACCURACY').toLowerCase()}`].filter(Boolean).join(' · ') }],
      osm: 'way["man_made"="pipeline"]["substance"~"gas|oil|fuel",i]', osmName: t => [t.substance && `${t.substance} pipeline`, t.operator, t.name].filter(Boolean).join(' · '),
      note: 'Major pipelines only: local gas mains are not published. Call Ontario One Call before digging.',
    },
    hydro: {
      label: 'Hydro lines', short: 'hydro', color: '--cx-hydro', minZoom: 11, area: false, dash: null, weight: 2.5,
      sources: [{ url: UTIL_LINE, f: 'CLASS_SUBTYPE,LOCATION_DESCR,LOCATION_ACCURACY', src: 'Land Information Ontario (Utility Line)', keep: p => /transmission line|hydro|electric|power/i.test(utilType(p)) && !/communication|pipeline/i.test(utilType(p)), name: p => [/unknown transmission/i.test(utilType(p)) ? 'Transmission line' : utilType(p), pick(p, 'LOCATION_DESCR'), pick(p, 'LOCATION_ACCURACY') && `located ${pick(p, 'LOCATION_ACCURACY').toLowerCase()}`].filter(Boolean).join(' · ') }],
      osm: 'way["power"~"^(line|minor_line|cable)$"]', osmName: t => [t.power === 'line' ? 'Transmission line' : t.power === 'cable' ? 'Power cable' : 'Power line', t.voltage && `${Math.round(+String(t.voltage).split(';')[0] / 1000) || t.voltage} kV`, t.operator].filter(Boolean).join(' · '),
      note: 'Transmission and major distribution lines. Corridors carry easements: check with the utility.',
    },
    water: {
      label: 'Watercourses', short: 'watercourses', color: '--cx-water', minZoom: 12, area: false, dash: null, weight: 2,
      // "Virtual Flow" / "Virtual Connector" lines carry the network through lakes and ponds: not drawn.
      sources: [{ url: `${LIO}/LIO_Open01/MapServer/26`, f: 'WATERCOURSE_TYPE,OFFICIAL_NAME_LABEL,PERMANENCY', src: 'Ontario Hydro Network (LIO)', keep: p => !/^virtual/i.test(pick(p, 'WATERCOURSE_TYPE')), name: p => [pick(p, 'OFFICIAL_NAME_LABEL'), /intermittent/i.test(pick(p, 'PERMANENCY')) && 'intermittent'].filter(Boolean).join(' · ') }],
      osm: 'way["waterway"~"^(river|stream|canal|drain|ditch|brook)$"]', osmName: t => t.name || '',
      note: 'Ontario Hydro Network (1:10,000): small and piped watercourses may be missing.',
    },
    reg: {
      label: 'Regulation limits', short: 'regulation limits', color: '--cx-reg', minZoom: 12, area: true, dash: '6 4', weight: 1.6,
      sources: [
        { url: 'https://services1.arcgis.com/d0ZCwU7eGKVeNiEE/ArcGIS/rest/services/TRCA_Regulation_Limit2/FeatureServer/0', f: 'OBJECTID', src: 'Toronto and Region Conservation Authority (2025)', keep: () => true, name: () => 'TRCA regulated area' },
        // CVC publishes its limit as one ~12 MB polygon, so it is cut into tiles at build time
        // (scripts/build-regulation.js) and served with the site.
        { url: 'data/regulation/cvc/', tiled: true, src: 'Credit Valley Conservation (2025)', keep: () => true, name: () => 'CVC regulated area' },
      ],
      note: 'Conservation authority regulated areas (O. Reg. 41/24). Screening only: the authority confirms the limit, and a feature need not be mapped to be regulated.',
    },
  };

  const on = { gas: false, hydro: false, water: false, reg: false, ...(store.get('cxOn', {}) || {}) };
  map.createPane('cxPane', map.getPane('rotatePane') || undefined).style.zIndex = 352;
  const renderer = L.canvas({ pane: 'cxPane', padding: 0.3 });
  const layer = L.layerGroup().addTo(map);
  const TILE = 0.02, MAX_TILES = 30;
  const cache = new Map();          // `${key}|${src}|${tile}` -> Promise<[{ g, name, src }]>
  const failed = new Set();         // sources that didn't answer this session -> use OSM
  const status = {};                // layer key -> 'ok' | 'osm' | 'none'

  const linesOf = geom => !geom ? [] : geom.type === 'MultiLineString' ? geom.coordinates : geom.type === 'LineString' ? [geom.coordinates] : geom.type === 'Polygon' ? geom.coordinates : geom.type === 'MultiPolygon' ? geom.coordinates.flat() : [];
  // Pre-built tiles: an index of the tiles that hold anything, then one file per tile with the
  // clipped fill (no outline) and the limit's own edges.
  const tileIndex = new Map();
  async function builtTile(S, i, tx, ty) {
    if (!tileIndex.has(S.url)) tileIndex.set(S.url, fetch(`${S.url}index.json`).then(r => r.ok ? r.json() : Promise.reject(new Error(r.status))).then(j => new Set(j.tiles)));
    const have = await tileIndex.get(S.url);
    if (!have.has(`${tx}_${ty}`)) return [];
    const t = await (await fetch(`${S.url}${tx}_${ty}.json`)).json();
    return [
      ...(t.f && t.f.length ? [{ id: `${i}|${tx}_${ty}|f`, rings: t.f, poly: true, fillOnly: true, name: S.name({}), src: S.src }] : []),
      ...(t.e && t.e.length ? [{ id: `${i}|${tx}_${ty}|e`, rings: t.e, poly: false, name: S.name({}), src: S.src }] : []),
    ];
  }
  async function arcTile(key, i, tx, ty) {
    const S = LAYERS[key].sources[i], ck = `${key}|${i}|${tx},${ty}`;
    if (cache.has(ck)) return cache.get(ck);
    if (S.tiled) { const pr = builtTile(S, i, tx, ty); cache.set(ck, pr); pr.catch(() => { cache.delete(ck); tileIndex.delete(S.url); }); return pr; }
    const pr = (async () => {
      const info = await A.layerInfo(S.url);
      const bbox = { xmin: tx * TILE, ymin: ty * TILE, xmax: (tx + 1) * TILE, ymax: (ty + 1) * TILE };
      const { features } = await A.queryAll(S.url, info, { bbox, max: 3000, outFields: S.f || '*' });
      return features.filter(f => f.geometry && S.keep(f.properties || {})).map(f => ({ id: `${i}|${f.id ?? JSON.stringify(linesOf(f.geometry)[0]?.[0])}`, rings: linesOf(f.geometry), poly: /Polygon/.test(f.geometry.type), name: S.name(f.properties || {}), src: S.src }));
    })();
    cache.set(ck, pr); pr.catch(() => { cache.delete(ck); failed.add(S.url); });
    return pr;
  }
  async function osmTile(key, tx, ty) {
    const ck = `${key}|osm|${tx},${ty}`;
    if (cache.has(ck)) return cache.get(ck);
    const L0 = LAYERS[key], bb = `${ty * TILE},${tx * TILE},${(ty + 1) * TILE},${(tx + 1) * TILE}`;
    const pr = (async () => {
      const r = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(`[out:json][timeout:25];${L0.osm}(${bb});out geom tags;`), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const j = await r.json();
      return (j.elements || []).filter(e => e.geometry).map(e => ({ id: `osm|${e.id}`, rings: [e.geometry.map(q => [q.lon, q.lat])], poly: false, name: L0.osmName(e.tags || {}), src: 'OpenStreetMap' }));
    })();
    cache.set(ck, pr); pr.catch(() => cache.delete(ck));
    return pr;
  }
  // Features of one layer on one tile: its published sources, or OpenStreetMap where they failed.
  async function tileFeatures(key, tx, ty) {
    const L0 = LAYERS[key];
    const res = await Promise.all(L0.sources.map((S, i) => failed.has(S.url) ? null : arcTile(key, i, tx, ty).catch(() => null)));
    const got = res.filter(Boolean).flat();
    if (res.some(r => r) || !L0.osm) { status[key] = res.some(r => r) ? 'ok' : 'none'; return got; }
    status[key] = 'osm';
    return osmTile(key, tx, ty).catch(() => { status[key] = 'none'; return []; });
  }
  const tilesOf = b => { const t = []; for (let tx = Math.floor(b.xmin / TILE); tx <= Math.floor(b.xmax / TILE); tx++) for (let ty = Math.floor(b.ymin / TILE); ty <= Math.floor(b.ymax / TILE); ty++) t.push([tx, ty]); return t; };

  let seq = 0;
  async function render() {
    const my = ++seq;
    layer.clearLayers();
    const keys = Object.keys(LAYERS).filter(k => on[k]);
    const note = $('#cx-note');
    if (!keys.length) { if (note) note.textContent = ''; return; }
    const z = map.getZoom(), b = map.getBounds();
    const tiles = tilesOf({ xmin: b.getWest(), ymin: b.getSouth(), xmax: b.getEast(), ymax: b.getNorth() });
    const shown = keys.filter(k => z >= LAYERS[k].minZoom);
    const hidden = keys.filter(k => z < LAYERS[k].minZoom);
    if (note) note.textContent = hidden.length ? `Zoom in to see ${hidden.map(k => LAYERS[k].short).join(', ')}` : '';
    if (!shown.length) return;
    if (tiles.length > MAX_TILES) { if (note) note.textContent = `Zoom in to see ${keys.map(k => LAYERS[k].short).join(', ')}`; return; }
    if (note) note.textContent = 'Loading…';
    // Regulation areas first (underneath), then lines.
    const order = shown.sort((a, c) => (LAYERS[c].area ? 1 : 0) - (LAYERS[a].area ? 1 : 0));
    const seen = new Set();
    for (const key of order) {
      const L0 = LAYERS[key], col = token(L0.color) || token('--nodata');
      await Promise.all(tiles.map(async ([tx, ty]) => {
        const feats = await tileFeatures(key, tx, ty);
        if (my !== seq) return;
        for (const f of feats) {
          const id = `${key}|${f.id}`; if (seen.has(id)) continue; seen.add(id);
          const ll = f.rings.map(r => r.map(([x, y]) => [y, x]));
          const tip = `<strong>${esc(f.name || L0.label.replace(/s$/, ''))}</strong><br><span class="muted">${esc(L0.label)} · ${esc(f.src)} (live)</span>`;
          const shape = f.poly
            ? L.polygon(ll, { renderer, stroke: !f.fillOnly, color: col, weight: L0.weight, dashArray: L0.dash, fillColor: col, fillOpacity: 0.14, opacity: 0.9 })
            : L.polyline(ll, { renderer, color: col, weight: L0.weight, dashArray: L0.dash, opacity: 0.9 });
          shape.bindTooltip(tip, { sticky: true, className: 'pt' }).addTo(layer);
        }
      }));
    }
    if (my === seq && note) {
      const osm = order.filter(k => status[k] === 'osm'), none = order.filter(k => status[k] === 'none');
      note.textContent = [osm.length && `${osm.map(k => LAYERS[k].label).join(', ')}: from OpenStreetMap (the provincial service did not answer)`, none.length && `${none.map(k => LAYERS[k].label).join(', ')} did not load`].filter(Boolean).join(' · ');
    }
  }
  let timer = null;
  map.on('moveend', () => { if (Object.values(on).some(Boolean)) { clearTimeout(timer); timer = setTimeout(render, 150); } });

  function setOn(o) {
    Object.assign(on, o);
    store.set('cxOn', on);
    render();
    if (MA() && MA().renderLegend) MA().renderLegend();
    if (SD() && SD().syncPanelSum) SD().syncPanelSum();
  }
  // Watercourses inside a box ({ xmin, ymin, xmax, ymax }) for the measure tool: [{ g, name }].
  async function watercoursesIn(bbox) {
    const feats = (await Promise.all(tilesOf(bbox).slice(0, MAX_TILES).map(([tx, ty]) => tileFeatures('water', tx, ty)))).flat();
    if (status.water !== 'ok') return null;   // the measure tool has its own OSM lookup
    const seen = new Set();
    return feats.filter(f => !seen.has(f.id) && seen.add(f.id)).flatMap(f => f.rings.map(g => ({ g, name: f.name })));
  }
  const watercourseSource = () => status.water === 'ok' ? 'Ontario Hydro Network (LIO)' : 'OpenStreetMap';
  function legendHTML() {
    const keys = Object.keys(LAYERS).filter(k => on[k]);
    if (!keys.length) return '';
    return `<div class="lg-t">Site constraints (live)</div><ul>${keys.map(k => { const L0 = LAYERS[k]; return `<li title="${esc(L0.note)}">${L0.area ? `<span class="lg-area" style="--c:var(${L0.color})"></span>` : `<span class="lg-line${L0.dash ? ' dash' : ''}" style="background:var(${L0.color})"></span>`}${esc(L0.label)}</li>`; }).join('')}</ul><p class="lg-s">${keys.map(k => esc(LAYERS[k].note)).join(' ')}</p>`;
  }

  if (Object.values(on).some(Boolean)) map.whenReady(() => setTimeout(render, 0));
  const api = { LAYERS, getOn: () => ({ ...on }), setOn, render, watercoursesIn, watercourseSource, legendHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelConstraints = api;
})(typeof window !== 'undefined' ? window : globalThis);
