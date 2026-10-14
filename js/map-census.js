(function (root) {
'use strict';
  // Census dissemination-area outlines + selected-project DA context (PeelCensusAreas).
  const { $, esc, fmtNum, store, token } = window.PeelUtil;
  const P = window.PeelPhases;
  const map = window.PeelMapCore.map;
  const App = () => root.PeelApp;
  const MC = () => root.PeelMapCore;
  const GU = () => root.PeelGrowthUI;
  const PA = () => root.PeelPlanAreas;
  // ---- 2021 Census dissemination areas: very light outlines, toggled in the map options ----
  // Loaded on first use (data/das.json, built with data/areas.json); drawn on a canvas in a pane
  // under the site outlines, with the DA's population on hover / tap.
  // Off by default (needed for the Growth tab's context); the map options turn it on.
  let daOn = store.get('censusAreas', false) === true;
  let daLayer = null, daLoading = null, daYear = null;
  const daCache = new Map();   // census year -> Promise of its outline layer
  // Inside the rotating pane (leaflet-rotate) with the tiles and overlays: a pane made directly
  // in the map pane would sit under the whole rotating stack, i.e. under the background.
  map.createPane('daPane', map.getPane('rotatePane') || undefined).style.zIndex = 350;
  const daRenderer = L.canvas({ pane: 'daPane', padding: 0.3 });
  // The outlines follow the census used as the baseline (2021, or 2016 for an earlier timeline).
  const daBaseline = () => (typeof baselineCensus === 'function' && App().state.censuses ? baselineCensus() : null);
  // Two passes over aerial photos: a faint dark halo under a light line, so the border reads
  // on bright roofs and pavement as well as on trees and fields.
  // DA outlines (JSON) per census year, shared by the map layer and the selected-project context.
  const daDataCache = new Map();
  function loadDaData(year, url) {
    if (daDataCache.has(year)) return daDataCache.get(year);
    const p = fetch(url, { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }).then(d => {
      // Bounding boxes for quick point lookups.
      for (const da of d.das) {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const r of da[4]) for (const [x, y] of r) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
        da.bbox = [x0, y0, x1, y1];
      }
      return d;
    });
    daDataCache.set(year, p);
    p.catch(() => daDataCache.delete(year));
    return p;
  }
  function loadDaLayer(year, url) {
    if (daCache.has(year)) return daCache.get(year);
    const p = loadDaData(year, url).then(d => {
      const st = daStyle();
      const halo = L.featureGroup(), line = L.featureGroup();
      for (const [id, pop, dw, muni, rings] of d.das) {
        const ll = rings.map(r => r.map(([x, y]) => [y, x]));
        halo.addLayer(L.polygon(ll, { renderer: daRenderer, pane: 'daPane', ...st.halo, fill: false, interactive: false, smoothFactor: 0.5 }));
        line.addLayer(L.polygon(ll, { renderer: daRenderer, pane: 'daPane', ...st.line, fill: true, fillOpacity: 0, smoothFactor: 0.5 })
          .bindTooltip(`<strong>DA ${esc(id)}</strong>${muni ? ` · ${esc(muni)}` : ''}<br>${fmtNum(pop)} people · ${fmtNum(dw)} dwellings (${year})`, { sticky: true, className: 'pt' }));
      }
      const l = L.layerGroup([halo, line]);
      l.halo = halo; l.line = line;
      return l;
    });
    daCache.set(year, p);
    p.catch(() => daCache.delete(year));
    return p;
  }
  // Show the outlines of the baseline census year (when the layer is on).
  function syncDaYear() {
    const bc = daBaseline();
    const year = bc ? bc.year : 2021, url = bc ? bc.outlines : 'data/das.json';
    const lab = $('#da-label'); if (lab) lab.textContent = `${year} census areas`;
    if (!daOn) { if (daLayer) { map.removeLayer(daLayer); daLayer = null; } daYear = null; return; }
    if (daYear === year && daLayer) return;
    daYear = year;
    loadDaLayer(year, url).then(l => {
      if (!daOn || daYear !== year) return;
      if (daLayer && daLayer !== l) map.removeLayer(daLayer);
      daLayer = l; restyleDa(); l.addTo(map);
    }).catch(() => {
      // Outlines for that year not published: fall back to 2021's.
      if (year !== 2021) { daYear = 2021; loadDaLayer(2021, 'data/das.json').then(l => { if (daOn && daYear === 2021) { if (daLayer && daLayer !== l) map.removeLayer(daLayer); daLayer = l; restyleDa(); l.addTo(map); } }); return; }
      daOn = false; daYear = null;
      const cb = $('#opt-da'); if (cb) { cb.checked = false; cb.disabled = true; cb.closest('label').title = 'Census area outlines are not published yet'; }
    });
  }
  // A light border, thicker as you zoom in so it stays visible at street scale: white with a
  // faint dark halo over aerial photos, grey over the street map.
  function daStyle() {
    const z = map.getZoom();
    const w = z >= 18 ? 2.2 : z >= 16 ? 1.6 : z >= 13 ? 1.1 : 0.8;
    if (MC().BASEMAPS[MC().getBasemap()].imagery) return {
      line: { color: token('--map-label'), weight: w, opacity: z >= 16 ? 0.8 : 0.6 },
      halo: { color: token('--map-halo'), weight: w + 2, opacity: z >= 16 ? 0.3 : 0.18 },
    };
    const grey = token('--text-muted');
    return { line: { color: grey, weight: w, opacity: z >= 16 ? 0.6 : 0.4 }, halo: { opacity: 0, weight: 0 } };
  }
  function restyleDa() {
    if (daLayer) { const st = daStyle(); daLayer.halo.setStyle(st.halo); daLayer.line.setStyle(st.line); }
    const sw = $('#da-swatch'); if (sw) sw.outerHTML = daSwatch();
  }
  // Legend swatch beside the toggle, drawn with the current style.
  function daSwatch() {
    const st = daStyle(), img = MC().BASEMAPS[MC().getBasemap()].imagery;
    return `<svg id="da-swatch" class="da-swatch${img ? ' img' : ''}" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
      ${img ? `<rect x="3" y="2" width="16" height="10" rx="1" fill="none" style="stroke:var(--map-halo)" stroke-opacity="${st.halo.opacity + 0.15}" stroke-width="3.5"/>` : ''}
      <rect x="3" y="2" width="16" height="10" rx="1" fill="none" stroke="${st.line.color}" stroke-opacity="${Math.min(1, st.line.opacity + 0.2)}" stroke-width="1.5"/></svg>`;
  }
  map.on('zoomend', () => restyleDa());
  function setDaLayer(on) {
    daOn = on; store.set('censusAreas', on);
    syncDaYear();
  }
  // ---- Selected project's census dissemination area ----------------------------------------
  // Opening a project narrows the Growth and Servicing demand tabs to the census DA its point
  // falls in (for the baseline census year): the DA's census count, and the development
  // applications located in the same DA. Closing the project goes back to Peel.
  const daFocusLayer = L.layerGroup().addTo(map);
  const daScopeName = () => [App().state.mtsa.length && PA().multiSummary('mtsa'), App().state.sp.length && PA().spSummary(), App().state.muni].filter(Boolean)[0] || 'Peel';
  let daCtxToken = 0;
  function setDaContext(p) {
    const token = ++daCtxToken;
    const bc = baselineCensus();
    if (!p || p.lat == null || !bc) {
      if (App().state.daCtx) { App().state.daCtx = null; daFocusLayer.clearLayers(); GU().renderGrowth(); }
      return;
    }
    loadDaData(bc.year, bc.outlines).then(d => {
      if (token !== daCtxToken) return;
      const x = p.lng, y = p.lat;
      const hit = d.das.find(da => x >= da.bbox[0] && x <= da.bbox[2] && y >= da.bbox[1] && y <= da.bbox[3] && P.pointInRings(x, y, da[4]));
      daFocusLayer.clearLayers();
      if (!hit) { App().state.daCtx = null; GU().renderGrowth(); return; }
      const [id, pop, dw, muni, rings] = hit;
      const inside = App().state.projects.filter(q => q.lat != null && q.lng >= hit.bbox[0] && q.lng <= hit.bbox[2] && q.lat >= hit.bbox[1] && q.lat <= hit.bbox[3] && P.pointInRings(q.lng, q.lat, rings));
      App().state.daCtx = { key: p.key, project: p, title: p.title, year: bc.year, id, pop, dw, muni, rings, projects: inside, keys: new Set(inside.map(q => q.key)) };
      L.polygon(rings.map(r => r.map(([lx, ly]) => [ly, lx])), { className: 'da-focus', interactive: false }).addTo(daFocusLayer);
      GU().renderGrowth();
    }).catch(() => { if (token === daCtxToken && App().state.daCtx) { App().state.daCtx = null; daFocusLayer.clearLayers(); GU().renderGrowth(); } });
  }

  // The DA pill now lives in the Growth tab's census body (Phase 4); delegate so the
  // handler survives the tab restructure.
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('#growth-census-body [data-clear-da]')) setDaContext(null); });

  // ---- Growth since the census (selected geography) ---------------------------------------
  // The baseline follows the timeline: the latest census held in or before its first year
  // (2021–2026 → 2021 Census; 2018–2026 → 2016 Census). Before the earliest census with data,
  // or with all years, the earliest one.
  function baselineCensus() {
    const cs = App().state.censuses || [];
    if (!cs.length) return null;
    // Newest first: the census at or before the timeline's start; with no year range, the latest.
    if (!App().timeActive() || App().state.yearFrom == null) return cs[0];
    return cs.find(c => c.year <= App().state.yearFrom) || cs[cs.length - 1];
  }
  const censusDay = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const getDaOn = () => daOn;

  // ---- Public contract ------------------------------------------------------------------
  const api = { baselineCensus, setDaContext, getDaOn, setDaLayer, syncDaYear, daSwatch, restyleDa, daScopeName, censusDay, daFocusLayer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCensusAreas = api;
})(typeof window !== 'undefined' ? window : globalThis);
