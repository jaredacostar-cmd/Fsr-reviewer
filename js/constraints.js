/* Site constraint layers (PeelConstraints): one map switch per layer, drawn from the built files in
 * data/constraints/ (scripts/build-constraints.js, rebuilt in Actions; source, owner, licence and
 * as-of date of each in data/constraints/manifest.json). Nothing loads until a layer is switched on.
 *
 *  - Regulation limits (CVC, TRCA), floodplain (CVC regulatory floodlines; TRCA generalized, with
 *    TRCA's disclaimer), Greenbelt, Oak Ridges Moraine, Niagara Escarpment, PSW / ANSI, the
 *    Growth Plan Natural Heritage System, watercourses (Region of Peel, then the Ontario Hydro
 *    Network where Peel maps none), gas pipelines and hydro lines (approximate; off by default).
 *  - Area layers draw from one coarse overview file below zoom 13 and from 0.02° tiles above it.
 *  - Click a feature: its card (name, type, owner, as-of date, source, screening note).
 * Screening only: the conservation authority or province confirms; nothing here is a determination.
 */
(function (root) {
  'use strict';
  const { $, esc, store, token } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const G = root.PeelConstraintGeo;
  const CX = () => root.PeelCxData;
  const MA = () => root.PeelMapAnalysis;
  const SD = () => root.PeelSvcData;
  const SS = () => root.PeelSvcScope;

  const SCREEN = 'Screening only: the owner confirms.';
  const isGas = lab => /(^|· )gas( |$)/.test(lab[1] || '') || /pipeline/i.test(lab[0] || '');
  const LAYERS = {
    reg: { label: 'Regulation limits', short: 'regulation limits', color: '--cx-reg', ids: ['reg-cvc', 'reg-trca'], area: true, dash: '6 4', weight: 1.6,
      note: `Conservation authority regulated areas (O. Reg. 41/24): CVC and TRCA. ${SCREEN} A feature need not be mapped to be regulated; NVCA and Conservation Halton publish no open layer.` },
    flood: { label: 'Floodplain', short: 'floodplain', color: '--cx-flood', ids: ['flood-cvc', 'flood-trca'], area: true, dash: null, weight: 1.2,
      note: `CVC regulatory floodlines; TRCA generalized floodplain (TRCA: not a regulatory flood plain map; contact TRCA for the precise limit). ${SCREEN}` },
    greenbelt: { label: 'Greenbelt', short: 'Greenbelt', color: '--cx-greenbelt', ids: ['greenbelt'], area: true, dash: '2 3', weight: 1.2, note: `Greenbelt Plan designations (province). ${SCREEN}` },
    orm: { label: 'Oak Ridges Moraine', short: 'Oak Ridges Moraine', color: '--cx-orm', ids: ['orm'], area: true, dash: '2 3', weight: 1.2, note: `Oak Ridges Moraine Conservation Plan designations (province). ${SCREEN}` },
    nep: { label: 'Niagara Escarpment', short: 'Niagara Escarpment', color: '--cx-nep', ids: ['nep'], area: true, dash: '2 3', weight: 1.2, note: `Niagara Escarpment Plan designations. ${SCREEN}` },
    natural: { label: 'PSW / ANSI', short: 'PSW / ANSI', color: '--cx-natural', ids: ['psw', 'ansi'], area: true, dash: null, weight: 1.2, note: `Provincially significant wetlands (evaluated) and areas of natural and scientific interest (province). ${SCREEN}` },
    nhs: { label: 'Natural Heritage System', short: 'Natural Heritage System', color: '--cx-nhs', ids: ['nhs'], area: true, dash: '4 3', weight: 1.2, note: `The Growth Plan's Natural Heritage System (province), outside settlement areas. ${SCREEN}` },
    water: { label: 'Watercourses', short: 'watercourses', color: '--cx-water', ids: ['wc-peel', 'wc-ohn'], area: false, dash: null, weight: 2, minZoom: 12,
      note: 'Region of Peel watercourses (watershed and conservation authority), and the Ontario Hydro Network (1:10,000) where Peel maps none: small and piped watercourses may be missing.' },
    gas: { label: 'Gas pipelines', short: 'gas', color: '--cx-gas', ids: ['utility'], keep: isGas, area: false, dash: '9 5', weight: 2.5, minZoom: 11,
      note: 'Approximate location (Land Information Ontario); call Ontario One Call before any work. Major pipelines only: local gas mains are not published.' },
    hydro: { label: 'Hydro lines', short: 'hydro', color: '--cx-hydro', ids: ['utility'], keep: lab => !isGas(lab), area: false, dash: null, weight: 2.5, minZoom: 11,
      note: 'Approximate location (Land Information Ontario); call Ontario One Call before any work. Transmission lines; corridors carry easements.' },
  };
  const ORDER = ['nhs', 'greenbelt', 'orm', 'nep', 'reg', 'flood', 'natural', 'water', 'gas', 'hydro'];
  const TILE_ZOOM = 13, MAX_TILES = 90;
  // Constraint areas are hatched, not solid: they must not read as phase, layer or capacity colours
  // (SPEC §0 two ladders; Stage 3 colours). One small pattern per colour, ≤ 25% ink.
  const HATCH = new Map();
  function hatch(col, back) {
    const k = `${col}|${back ? 1 : 0}`; if (HATCH.has(k)) return HATCH.get(k);
    let pat = col;
    try {
      const c = document.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
      g.strokeStyle = col; g.lineWidth = 1.4; g.globalAlpha = 0.9;
      g.beginPath(); if (back) { g.moveTo(0, 0); g.lineTo(8, 8); g.moveTo(-4, 4); g.lineTo(4, 12); g.moveTo(4, -4); g.lineTo(12, 4); } else { g.moveTo(0, 8); g.lineTo(8, 0); g.moveTo(-4, 4); g.lineTo(4, -4); g.moveTo(4, 12); g.lineTo(12, 4); } g.stroke();
      pat = g.createPattern(c, 'repeat') || col;
    } catch (e) { /* no canvas: solid */ }
    HATCH.set(k, pat); return pat;
  }
  // Plans and the heritage system hatch the other way from the hazard layers.
  const BACK = new Set(['greenbelt', 'orm', 'nep', 'nhs']);

  const on = Object.fromEntries(Object.keys(LAYERS).map(k => [k, false]));
  Object.assign(on, Object.fromEntries(Object.entries(store.get('cxOn', {}) || {}).filter(([k]) => k in on)));
  map.createPane('cxPane', map.getPane('rotatePane') || undefined).style.zIndex = (root.PeelLayerGroups ? root.PeelLayerGroups.Z.cx : 300);
  const renderer = L.canvas({ pane: 'cxPane', padding: 0.3 });
  const layer = L.layerGroup().addTo(map);
  const status = {};   // layer key -> 'ok' | 'none'
  const drawn = {};    // layer key -> features drawn in the last render (the Layers header's "in view")

  // ---- Loading ----------------------------------------------------------------------------------
  const overviews = new Map();
  function overview(id) {
    if (!overviews.has(id)) overviews.set(id, Promise.all([fetch(`${CX().BASE}${id}/overview.json`).then(r => r.ok ? r.json() : null).catch(() => null), CX().index(id)]).then(([o, ix]) => o ? o.p.map(([li, rings]) => ({ label: ix.labels[li] || ['', ''], polys: [rings.map(r => r.map(([x, y]) => [x / o.units, y / o.units]))] })) : null));
    return overviews.get(id);
  }
  const viewTiles = b => { const t = []; for (let tx = Math.floor(b.getWest() / G.TILE); tx <= Math.floor(b.getEast() / G.TILE); tx++) for (let ty = Math.floor(b.getSouth() / G.TILE); ty <= Math.floor(b.getNorth() / G.TILE); ty++) t.push([tx, ty]); return t; };
  // The tiles of a dataset in view that exist (the index lists them).
  async function tilesInView(id, b) { const ix = await CX().index(id); return viewTiles(b).filter(([tx, ty]) => ix._have.has(G.tileKey(tx, ty))); }

  // Drop OHN lines that run along a Region of Peel line (most points within ~25 m): one line per stream.
  function onePerStream(all, primary) {
    const CELL = 0.0005, grid = new Map(), add = (k, s) => { if (!grid.has(k)) grid.set(k, []); grid.get(k).push(s); };
    for (const f of primary) for (const r of f.lines || []) for (let i = 1; i < r.length; i++) {
      const [a, b] = [r[i - 1], r[i]];
      for (let gx = Math.floor(Math.min(a[0], b[0]) / CELL); gx <= Math.floor(Math.max(a[0], b[0]) / CELL); gx++)
        for (let gy = Math.floor(Math.min(a[1], b[1]) / CELL); gy <= Math.floor(Math.max(a[1], b[1]) / CELL); gy++) add(`${gx},${gy}`, [a, b]);
    }
    const near = p => { for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const seg of grid.get(`${Math.floor(p[0] / CELL) + dx},${Math.floor(p[1] / CELL) + dy}`) || []) if (G.distToLine(p, seg) < 25) return true; return false; };
    return all.filter(f => { const pts = (f.lines || []).flat(); if (!pts.length) return true; let n = 0; for (const p of pts) if (near(p)) n++; return n / pts.length < 0.6; });
  }

  // ---- Drawing ----------------------------------------------------------------------------------
  let seq = 0, manifestP = null;
  const manifest = () => (manifestP = manifestP || CX().manifest().catch(() => { manifestP = null; return null; }));
  function featureClick(id, label) {
    manifest().then(m => {
      const d = m && m.datasets.find(x => x.id === id); if (!d || !SS()) return;
      SS().openResult({ ref: `cx:${id}-${String(label[0]).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}`, title: label[0], html: CX().featureCardHTML(d, label) });
    });
  }
  // coarse: the overview (low zoom): thin outlines, no dashes, so many small polygons stay readable.
  // What is drawn, for the map-level hover card and click (below): each map pane draws on its own
  // canvas and the top one takes the pointer, so constraint shapes are not interactive themselves.
  let hits = [];
  function draw(key, id, feats, edges, coarse) {
    const L0 = LAYERS[key], col = token(L0.color) || token('--nodata'), w = coarse ? 0.7 : L0.weight, dash = coarse ? null : L0.dash;
    for (const f of feats) {
      if (L0.keep && !L0.keep(f.label)) continue;
      drawn[key] = (drawn[key] || 0) + 1;
      if (f.polys) L.polygon(f.polys[0].map(r => r.map(([x, y]) => [y, x])), { renderer, interactive: false, stroke: !edges, color: col, weight: w, dashArray: dash, fillColor: hatch(col, BACK.has(key)), fillOpacity: coarse ? 0.25 : 0.22, opacity: coarse ? 0.6 : 0.9 }).addTo(layer);
      else if ((f.lines || []).length) L.polyline(f.lines.map(l => l.map(([x, y]) => [y, x])), { renderer, interactive: false, color: col, weight: L0.weight, dashArray: L0.dash, opacity: 0.9 }).addTo(layer);
      else continue;
      const pts = (f.polys ? f.polys[0] : f.lines).flat();
      hits.push({ key, id, label: f.label, rings: f.polys ? f.polys[0] : null, lines: f.lines || null, bb: [Math.min(...pts.map(p => p[0])), Math.min(...pts.map(p => p[1])), Math.max(...pts.map(p => p[0])), Math.max(...pts.map(p => p[1]))] });
    }
    for (const g of edges || []) {
      if (L0.keep && !L0.keep(g.label)) continue;
      L.polyline(g.edges.map(l => l.map(([x, y]) => [y, x])), { renderer, color: col, weight: L0.weight, dashArray: L0.dash, opacity: 0.9, interactive: false }).addTo(layer);
    }
  }
  async function render() {
    const my = ++seq;
    layer.clearLayers(); hits = []; hideTip();
    for (const k of Object.keys(drawn)) delete drawn[k];
    const keys = ORDER.filter(k => on[k]);
    const note = $('#cx-note');
    if (!keys.length) { if (note) note.textContent = ''; return; }
    const z = map.getZoom(), b = map.getBounds(), notes = [];
    if (note) note.textContent = 'Loading…';
    for (const key of keys) {
      const L0 = LAYERS[key];
      if (z < (L0.minZoom || 0)) { notes.push(`Zoom in to see ${L0.short}`); continue; }
      try {
        let drew = false;
        for (const id of L0.ids) {
          const tiles = await tilesInView(id, b);
          if (my !== seq) return;
          if (L0.area && (z < TILE_ZOOM || tiles.length > MAX_TILES)) {
            const ov = await overview(id); if (my !== seq) return;
            if (ov) { draw(key, id, ov, null, true); drew = true; continue; }
          }
          if (tiles.length > MAX_TILES) { notes.push(`Zoom in to see ${L0.short}`); continue; }
          const got = await Promise.all(tiles.map(([tx, ty]) => CX().tile(id, tx, ty)));
          if (my !== seq) return;
          let feats = got.flatMap(t => (Array.isArray(t) ? t : t.feats)), edges = got.flatMap(t => (Array.isArray(t) ? [] : t.edges));
          if (id === 'wc-ohn' && on.water) {
            const peel = (await Promise.all(tiles.map(([tx, ty]) => CX().tile('wc-peel', tx, ty).catch(() => [])))).flatMap(t => (Array.isArray(t) ? t : t.feats));
            feats = onePerStream(feats, peel);
          }
          draw(key, id, feats, L0.area ? edges : null); drew = true;
        }
        status[key] = drew ? 'ok' : status[key];
      } catch (e) { status[key] = 'none'; notes.push(`${L0.label} did not load`); }
    }
    if (my === seq && note) note.textContent = [...new Set(notes)].join(' · ');
    if (my === seq && root.PeelLayerGroups) root.PeelLayerGroups.sync();
  }
  // ---- Hover card and click, at the map level (SPEC §3: one hover card; click opens the right panel) ----
  // Lines are hit within ~6 px; the top-most (last drawn) feature wins.
  function hitAt(latlng) {
    if (!hits.length) return null;
    const x = latlng.lng, y = latlng.lat, tolM = 6 * 40075016 * Math.cos(y * Math.PI / 180) / 2 ** (map.getZoom() + 8), tolD = tolM / 111320;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i], b = h.bb;
      if (x < b[0] - tolD * 2 || x > b[2] + tolD * 2 || y < b[1] - tolD || y > b[3] + tolD) continue;
      if (h.rings ? G.pointInRings([x, y], h.rings) : h.lines.some(l => G.distToLine([x, y], l) <= tolM)) return h;
    }
    return null;
  }
  const toolOn = () => !!(root.PeelMeasure && root.PeelMeasure.tool && root.PeelMeasure.tool.mode);
  let tip = null, tipFor = null, moveT = 0;
  function hideTip() { if (tip) { map.closeTooltip(tip); tip = null; tipFor = null; } map.getContainer().classList.remove('cx-hover'); }
  map.on('mousemove', e => {
    const now = Date.now(); if (now - moveT < 60) return; moveT = now;
    const h = !toolOn() && hitAt(e.latlng);
    if (!h) { hideTip(); return; }
    const L0 = LAYERS[h.key];
    if (tipFor !== h) {
      // The same hover card as every other feature: kind, name, what it is; click opens its card.
      const html = window.PeelUtil.hoverCard({ kind: `${L0.label} · screening`, name: h.label[0] || L0.label, sub: h.label[1] || '', open: 'its card (owner, as-of date, source)' });
      if (!tip) tip = L.tooltip({ className: 'pt', direction: 'top', offset: [0, -10] });
      tip.setContent(html); tipFor = h;
    }
    tip.setLatLng(e.latlng); if (!map.hasLayer(tip)) map.openTooltip(tip);
    map.getContainer().classList.add('cx-hover');
  });
  map.on('mouseout', hideTip);
  map.on('click', e => { if (toolOn()) return; const h = hitAt(e.latlng); if (h) { hideTip(); featureClick(h.id, h.label); } });

  let timer = null;
  map.on('moveend', () => { if (Object.values(on).some(Boolean)) { clearTimeout(timer); timer = setTimeout(render, 150); } });

  const anyOn = () => Object.values(on).some(Boolean);
  function setOn(o) {
    const was = anyOn();
    for (const k of Object.keys(o)) if (k in on) on[k] = !!o[k];
    // Planning areas are context outlines while constraints are on (they would take the taps).
    if (was !== anyOn() && root.PeelPlanAreas && root.PeelPlanAreas.renderPlanAreas) root.PeelPlanAreas.renderPlanAreas();
    store.set('cxOn', on);
    render();
    if (MA() && MA().renderLegend) MA().renderLegend();
    if (SD() && SD().syncPanelSum) SD().syncPanelSum();
    if (typeof document !== 'undefined') for (const k of Object.keys(o)) { const el = document.getElementById(`opt-cx-${k}`); if (el) el.checked = !!on[k]; }
  }
  // "Show layer" from the checklist or the area card: switch it on and look at the site.
  function showLayer(key, latlng) {
    if (!(key in LAYERS)) return;
    setOn({ [key]: true });
    if (latlng) map.setView(latlng, Math.max(map.getZoom(), 15));
  }
  // Watercourses inside a box ({ xmin, ymin, xmax, ymax }) for the measure tool: [{ g, name }].
  async function watercoursesIn(bbox) {
    const tiles = []; for (let tx = Math.floor(bbox.xmin / G.TILE); tx <= Math.floor(bbox.xmax / G.TILE); tx++) for (let ty = Math.floor(bbox.ymin / G.TILE); ty <= Math.floor(bbox.ymax / G.TILE); ty++) tiles.push([tx, ty]);
    if (tiles.length > MAX_TILES) return null;
    const get = id => Promise.all(tiles.map(([tx, ty]) => CX().tile(id, tx, ty))).then(ts => ts.flatMap(t => (Array.isArray(t) ? t : t.feats)));
    const [peel, ohn] = await Promise.all([get('wc-peel'), get('wc-ohn')]);
    status.water = 'ok';
    return [...peel, ...onePerStream(ohn, peel)].flatMap(f => (f.lines || []).map(g => ({ g, name: f.label[0] === 'Watercourse' ? '' : f.label[0] })));
  }
  const watercourseSource = () => status.water === 'ok' ? 'Region of Peel watercourses and the Ontario Hydro Network (LIO)' : 'OpenStreetMap';
  // The legend follows the Layers groups: 'cx' (Constraints) or 'utility' (Infrastructure ›
  // Other utilities: gas, hydro).
  function legendHTML(which = 'cx') {
    const keys = ORDER.filter(k => on[k] && ((k === 'gas' || k === 'hydro') === (which === 'utility')));
    if (!keys.length) return '';
    return `<div class="lg-t">${which === 'utility' ? 'Other utilities (approximate)' : 'Constraints (screening)'}</div><ul>${keys.map(k => { const L0 = LAYERS[k]; return `<li title="${esc(L0.note)}">${L0.area ? `<span class="lg-area hatch${BACK.has(k) ? ' back' : ''}" style="--c:var(${L0.color})"></span>` : `<span class="lg-line${L0.dash ? ' dash' : ''}" style="background:var(${L0.color})"></span>`}${esc(L0.label)}</li>`; }).join('')}</ul><p class="lg-s">${keys.map(k => esc(LAYERS[k].note)).join(' ')}</p>`;
  }

  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cx-show]'); if (!b) return;
    const p = root.DevScope && root.DevScope.current && root.DevScope.current();
    showLayer(b.dataset.cxShow, p && p.lat != null ? [p.lat, p.lng] : null);
  });
  if (Object.values(on).some(Boolean)) map.whenReady(() => setTimeout(render, 0));
  const api = { LAYERS, ORDER, getOn: () => ({ ...on }), anyOn, hitAt, drawnCount: k => drawn[k] || 0, setOn, showLayer, render, watercoursesIn, watercourseSource, legendHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelConstraints = api;
})(typeof window !== 'undefined' ? window : globalThis);
