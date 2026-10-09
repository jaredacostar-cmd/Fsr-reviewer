/* Peel Development Tracker – UI, map and data orchestration. */
(function () {
  'use strict';

  const CFG = window.PEEL_CONFIG;
  const P = window.PeelPhases;
  const A = window.PeelArcGIS;
  const D = window.PeelDemand;
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtDate = d => d ? d.toISOString().slice(0, 10) : '';
  const fmtNum = n => n == null ? '' : Number(n).toLocaleString('en-CA');

  // ---- Persistent per-viewer settings (best effort) ---------------------------
  const store = {
    get(k, d) { try { const v = localStorage.getItem(`peel-dev:${k}`); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(`peel-dev:${k}`, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
  };

  // ---- State -------------------------------------------------------------------
  const DEFAULT_KIND = 'application';
  // Default focus: growth (planning applications proposing new dwelling units).
  const DEFAULT_FOCUS = 'growth';
  const state = {
    sources: [],                         // {id,name,municipality,kind,url,enabled,status,msg,records}
    projects: [],
    filtered: [],
    phases: new Set(P.ALL_PHASES.map(p => p.key)),
    // Default: projects with a planning application (and the permits that belong to them).
    muni: '', kind: DEFAULT_KIND, search: '', newOnly: true,
    sp: [], mtsa: '', pz: '', dr: '',   // pz / dr: water pressure zone and wastewater drainage area ids (data/servicing.json)   // secondary plan / character area ids (several) and MTSA id (data/areas.json)
    minUnits: 0,   // unit growth filter: 0 = any, otherwise at least this many new units
    focus: DEFAULT_FOCUS,   // quick-view focus (see FOCUS), combined with the phase
    // Timeline: inclusive year range (null = open-ended) on the chosen milestone.
    yearMode: 'any', yearFrom: null, yearTo: null, yearMin: null, yearMax: null,
    criteria: mergeCriteria(store.get('criteria', null)),
    sinceYear: store.get('sinceYear', CFG.sinceYear),
    maxPerLayer: store.get('maxPerLayer', CFG.maxPerLayer),
  };
  function mergeCriteria(saved) {
    const d = JSON.parse(JSON.stringify(D.DEFAULT_CRITERIA));
    if (!saved) return d;
    for (const g of Object.keys(d)) for (const k of Object.keys(d[g])) {
      const v = saved[g] && Number(saved[g][k]);
      if (v > 0) d[g][k] = v;
    }
    return d;
  }
  // Employment parsed once per project (the focus chip counts call it for every project).
  // m²/job comes from the editable criteria; clearEmp() drops the cache when it changes.
  const empOf = p => (p._emp !== undefined ? p._emp : (p._emp = window.PeelEmployment ? PeelEmployment.employmentOf(p, state.criteria.m2PerJob) : null));
  const clearEmp = () => { for (const p of state.projects) delete p._emp; };
  // Employment space moves with the project phase (no per-unit permits for it).
  const EMP_DONE = { permitted: new Set(['permit', 'construction', 'completed']), completed: new Set(['completed']) };
  const jobsOf = p => { const e = p.records ? empOf(p) : null; return e ? e.jobs : 0; };
  const removed = new Set(store.get('removed', []));
  const disabled = store.get('disabled', {});
  for (const s of CFG.services.concat(store.get('extraSources', []))) {
    if (removed.has(s.id)) continue;
    state.sources.push({ ...s, enabled: disabled[s.id] != null ? !disabled[s.id] : s.enabled !== false, status: 'idle', msg: '', records: [] });
  }
  function saveSources() {
    store.set('extraSources', state.sources.filter(s => !CFG.services.some(c => c.id === s.id))
      .map(({ id, name, municipality, kind, url, enabled, discovered }) => ({ id, name, municipality, kind, url, enabled, discovered })));
    store.set('disabled', Object.fromEntries(state.sources.map(s => [s.id, !s.enabled])));
    store.set('removed', Array.from(removed));
  }

  // ---- Colours -----------------------------------------------------------------
  let colors = {};
  function readColors() {
    const cs = getComputedStyle(document.documentElement);
    colors = Object.fromEntries(P.ALL_PHASES.map(p => [p.key, cs.getPropertyValue(`--ph-${p.key}`).trim()]));
  }
  function glyphColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return '#fff';
    const n = parseInt(m[1], 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return L > 0.35 ? '#0b0b0b' : '#ffffff';
  }
  function dot(phase, extra = '') {
    const p = P.PHASE_BY_KEY[phase], c = colors[phase];
    return `<span class="dot ${extra}" style="background:${c};color:${glyphColor(c)}" aria-hidden="true">${esc(p.short)}</span>`;
  }

  // ---- Map -----------------------------------------------------------------------
  // Orientation: Peel's concession grid (Hurontario, Dixie, Steeles…) runs about 44° off true
  // north, so "Road grid" turns the map by that much and east–west streets run straight across.
  const GRID_BEARING = 44;
  const ORIENTATIONS = { grid: 'Road grid', north: 'North up' };
  let orientation = ORIENTATIONS[store.get('orientation', 'grid')] ? store.get('orientation', 'grid') : 'grid';
  const canRotate = !!(L.Map.prototype.setBearing);
  const map = L.map('map', {
    zoomControl: true, maxZoom: 20,
    ...(canRotate ? { rotate: true, bearing: orientation === 'grid' ? GRID_BEARING : 0, rotateControl: false, touchRotate: false, shiftKeyRotate: false } : {}),
  }).setView(CFG.center, CFG.zoom);
  const dark = () => document.documentElement.dataset.theme === 'dark' ||
    (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  // Basemaps: Esri World Imagery (aerial), optionally with Esri reference
  // overlays for roads and place names, or a plain CARTO street map.
  const DATA_ATTR = 'Data: Mississauga, Brampton, Caledon, Peel open data';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const esriLayer = (svc, opts) => L.tileLayer(`${ESRI}/${svc}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, ...opts });
  const BASEMAPS = {
    'aerial-labels': { label: 'Latest aerial + roads', imagery: true, city: true },
    'aerial':        { label: 'Latest aerial', imagery: true, city: true },
    'esri':          { label: 'Esri World Imagery', imagery: true },
    'streets':       { label: 'Street map', imagery: false },
  };
  // Latest city aerials (Mississauga, Brampton, Caledon) over Esri World Imagery. Image
  // services are drawn as 512 px Web Mercator tiles from exportImage / export.
  const CityImagery = L.TileLayer.extend({
    getTileUrl(c) {
      const size = 2 * 20037508.342789244 / 2 ** c.z;
      const x0 = -20037508.342789244 + c.x * size, y1 = 20037508.342789244 - c.y * size;
      return PeelAerial.exportUrl(this._url, [x0, y1 - size, x0 + size, y1], 512, 512);
    },
  });
  function cityImageryLayers() {
    const out = [], credits = [];
    for (const muni of ['Caledon', 'Brampton', 'Mississauga']) {
      const src = CFG.imagery && CFG.imagery[muni];
      if (!src) continue;
      const year = Math.max(...Object.keys(src.years).map(Number));
      const [x0, y0, x1, y1] = src.bbox;
      const opts = { pane: 'imageryPane', bounds: L.latLngBounds([[y0, x0], [y1, x1]]), minZoom: 12, maxZoom: 20 };
      out.push(src.tiles ? L.tileLayer(src.tiles, { ...opts, maxNativeZoom: 20 })
        : new CityImagery(src.years[year].url, { ...opts, tileSize: 512, zoomOffset: -1 }));
      credits.push(`${src.owner} ${src.years[year].label}`);
    }
    return { layers: out, attribution: `Imagery: ${credits.join(', ')}; Esri elsewhere` };
  }
  let basemap = BASEMAPS[store.get('basemap', 'aerial-labels')] ? store.get('basemap', 'aerial-labels') : 'aerial-labels';
  let baseLayers = [];
  const bboxOutline = L.rectangle([[CFG.bbox.ymin, CFG.bbox.xmin], [CFG.bbox.ymax, CFG.bbox.xmax]], { weight: 1, dashArray: '4 4', fill: false, interactive: false });
  // Aerial photos sit in their own pane, 40% transparent as a whole (one blend, so the city
  // aerial and the Esri imagery under it don't show through each other); road and place labels
  // stay opaque in the tile pane above.
  const AERIAL_OPACITY = 0.6;
  const imageryPane = map.createPane('imageryPane', map.getPane('rotatePane') || undefined);
  imageryPane.style.zIndex = 150; imageryPane.style.opacity = AERIAL_OPACITY;
  function setTiles() {
    for (const l of baseLayers) map.removeLayer(l);
    const imageryAttr = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';
    if (basemap === 'streets') {
      baseLayers = [L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark() ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
        maxZoom: 20, subdomains: 'abcd',
        attribution: `&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · ${DATA_ATTR}`,
      })];
    } else if (BASEMAPS[basemap].city) {
      const city = cityImageryLayers();
      baseLayers = [esriLayer('World_Imagery', { pane: 'imageryPane', attribution: `${city.attribution} · ${DATA_ATTR}` }), ...city.layers];
      if (basemap === 'aerial-labels') baseLayers.push(
        esriLayer('Reference/World_Transportation', { opacity: 0.9 }),
        esriLayer('Reference/World_Boundaries_and_Places'));
    } else {
      baseLayers = [esriLayer('World_Imagery', { pane: 'imageryPane', attribution: `${imageryAttr} · ${DATA_ATTR}` })];
      if (basemap === 'aerial-labels') baseLayers.push(
        esriLayer('Reference/World_Transportation', { opacity: 0.9 }),
        esriLayer('Reference/World_Boundaries_and_Places'));
    }
    baseLayers.forEach((l, i) => { l.addTo(map); l.setZIndex(i); });
    const imagery = BASEMAPS[basemap].imagery;
    map.getContainer().classList.toggle('on-imagery', imagery);
    bboxOutline.setStyle({ color: imagery ? '#ffffff' : '#77756f', opacity: imagery ? 0.8 : 1 });
  }
  bboxOutline.addTo(map);

  // ---- Point labels ------------------------------------------------------------------
  // Drawn only for markers that are individually visible (not inside a cluster) in view,
  // from LABEL_ZOOM up, so they never pile up at regional scale.
  const LABEL_ZOOM = 14, LABEL_MAX = 400;
  const LABEL_MODES = {
    'address-phase': 'Address + phase',
    'address':       'Address',
    'ref':           'File / permit no.',
    'units':         'Units',
    'off':           'Off',
  };
  let labelMode = LABEL_MODES[store.get('labelMode', 'address-phase')] ? store.get('labelMode', 'address-phase') : 'address-phase';
  const labelLayer = L.layerGroup().addTo(map);
  let projectByMarker = new Map();
  function labelText(p) {
    const ph = P.PHASE_BY_KEY[p.phase].label;
    switch (labelMode) {
      case 'address': return `<b>${esc(p.title)}</b>`;
      case 'ref': {
        const refs = Array.from(new Set(p.records.map(r => r.ref).filter(Boolean)));
        return `<b>${esc(refs.slice(0, 2).join(', ') || p.title)}</b>${refs.length > 2 ? `<small>+${refs.length - 2} more</small>` : ''}`;
      }
      case 'units': return p.units ? `<b>${fmtNum(p.units)} units</b><small>${esc(p.title)}</small>` : '';
      default: return `<b>${esc(p.title)}</b><small>${esc(ph)}${p.units ? ` · ${fmtNum(p.units)} units` : ''}</small>`;
    }
  }
  function updateLabels() {
    labelLayer.clearLayers();
    const note = $('#label-note');
    if (labelMode === 'off') { if (note) note.textContent = ''; return; }
    if (map.getZoom() < LABEL_ZOOM) { if (note) note.textContent = `Zoom in to show labels`; return; }
    const view = map.getBounds().pad(0.1);
    const candidates = [];
    for (const [m, p] of projectByMarker) {
      const ll = m.getLatLng();
      if (view.contains(ll) && cluster.getVisibleParent(m) === m) candidates.push([m, p]);
    }
    // Biggest projects get first claim on space; labels that would collide are skipped.
    candidates.sort((a, b) => (b[1].units || 0) - (a[1].units || 0) || b[1].rank - a[1].rank);
    // Every visible dot is an obstacle, so a label never hides another point.
    const pts = new Map(candidates.map(([m]) => [m, map.latLngToContainerPoint(m.getLatLng())]));
    const dots = candidates.map(([m]) => { const q = pts.get(m); return { m, x: q.x - 9, y: q.y - 9, w: 18, h: 18 }; });
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const placed = [];
    let n = 0, skipped = 0;
    for (const [m, p] of candidates) {
      if (n >= LABEL_MAX) break;
      const html = labelText(p);
      if (!html) continue;
      const q = pts.get(m), size = labelSize(html);
      // Try right of the dot, then left.
      const sides = [{ side: 'r', x: q.x + 11 }, { side: 'l', x: q.x - 11 - size.w }];
      const spot = sides.map(o => ({ ...o, y: q.y - 9, w: size.w, h: size.h }))
        .find(b => !placed.some(o => hit(o, b)) && !dots.some(d => d.m !== m && hit(d, b)));
      if (!spot) { skipped++; continue; }
      placed.push(spot);
      // Labels are tappable too: on a phone the text is what people aim for.
      const label = L.marker(m.getLatLng(), {
        keyboard: false, zIndexOffset: -1000,
        icon: L.divIcon({
          className: `plabel${spot.side === 'l' ? ' left' : ''}`, html: `<div>${html}</div>`, iconSize: null,
          iconAnchor: spot.side === 'l' ? [Math.ceil(size.w) + 11, 9] : [-11, 9],
        }),
      });
      label.on('click', () => showDetail(p));
      labelLayer.addLayer(label);
      n++;
    }
    if (note) note.textContent = n >= LABEL_MAX || skipped ? `${fmtNum(n)} labels shown; zoom in for more` : '';
  }
  // On-screen size of a label's text, for collision tests.
  const measureCtx = document.createElement('canvas').getContext('2d');
  function labelSize(html) {
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const lines = Array.from(tmp.children).map(c => c.textContent);
    let w = 0;
    lines.forEach((t, i) => {
      measureCtx.font = i === 0 ? '600 12px system-ui, sans-serif' : '11px system-ui, sans-serif';
      w = Math.max(w, measureCtx.measureText(t).width);
    });
    return { w: Math.ceil(w) + 4, h: lines.length * 14 + 2 };
  }
  let labelTimer;
  const scheduleLabels = () => { clearTimeout(labelTimer); labelTimer = setTimeout(updateLabels, 60); };
  map.on('moveend zoomend', scheduleLabels);

  // ---- 2021 Census dissemination areas: very light outlines, toggled in the map options ----
  // Loaded on first use (data/das.json, built with data/areas.json); drawn on a canvas in a pane
  // under the site outlines, with the DA's population on hover / tap.
  // On by default as a faint border; the map options can turn it off.
  let daOn = store.get('censusAreas', true) !== false;
  let daLayer = null, daLoading = null, daYear = null;
  const daCache = new Map();   // census year -> Promise of its outline layer
  // Inside the rotating pane (leaflet-rotate) with the tiles and overlays: a pane made directly
  // in the map pane would sit under the whole rotating stack, i.e. under the background.
  map.createPane('daPane', map.getPane('rotatePane') || undefined).style.zIndex = 350;
  const daRenderer = L.canvas({ pane: 'daPane', padding: 0.3 });
  // The outlines follow the census used as the baseline (2021, or 2016 for an earlier timeline).
  const daBaseline = () => (typeof baselineCensus === 'function' && state.censuses ? baselineCensus() : null);
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
    if (BASEMAPS[basemap].imagery) return {
      line: { color: '#ffffff', weight: w, opacity: z >= 16 ? 0.8 : 0.6 },
      halo: { color: '#000000', weight: w + 2, opacity: z >= 16 ? 0.3 : 0.18 },
    };
    const grey = (getComputedStyle(document.documentElement).getPropertyValue('--text-muted') || '#888').trim();
    return { line: { color: grey, weight: w, opacity: z >= 16 ? 0.6 : 0.4 }, halo: { opacity: 0, weight: 0 } };
  }
  function restyleDa() {
    if (daLayer) { const st = daStyle(); daLayer.halo.setStyle(st.halo); daLayer.line.setStyle(st.line); }
    const sw = $('#da-swatch'); if (sw) sw.outerHTML = daSwatch();
  }
  // Legend swatch beside the toggle, drawn with the current style.
  function daSwatch() {
    const st = daStyle(), img = BASEMAPS[basemap].imagery;
    return `<svg id="da-swatch" class="da-swatch${img ? ' img' : ''}" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">
      ${img ? `<rect x="3" y="2" width="16" height="10" rx="1" fill="none" stroke="#000" stroke-opacity="${st.halo.opacity + 0.15}" stroke-width="3.5"/>` : ''}
      <rect x="3" y="2" width="16" height="10" rx="1" fill="none" stroke="${st.line.color}" stroke-opacity="${Math.min(1, st.line.opacity + 0.2)}" stroke-width="1.5"/></svg>`;
  }
  map.on('zoomend', () => restyleDa());
  function setDaLayer(on) {
    daOn = on; store.set('censusAreas', on);
    syncDaYear();
  }


  function setOrientation(o) {
    if (!canRotate) return;
    orientation = o; store.set('orientation', o);
    map.setBearing(o === 'grid' ? GRID_BEARING : 0);
    const sel = $('#opt-orient'); if (sel) sel.value = o;
    scheduleLabels(); updateNorth();
  }

  // Pressure-zone / drainage-area layer state (layers are built in the servicing section).
  const PLANT_COLOR = { Lakeview: '#2f7ed8', Clarkson: '#d9822b', Inglewood: '#7a5cc4', Toronto: '#868e96' };
  // Where an area's sewage is treated: a Peel WRRF, or the City of Toronto (Malton).
  const PLANT_SHORT = { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood', Toronto: 'Toronto' };
  const PLANT_NAME = { Lakeview: 'G.E. Booth WRRF (Lakeview)', Clarkson: 'Clarkson WRRF', Inglewood: 'Inglewood WWTP', Toronto: 'City of Toronto system' };
  const plantLabel = pl => PLANT_NAME[pl] || `${pl} WRRF`;
  // Drainage area names carry the plant ("Lakeview · Bolton PS"); show the plant's report name.
  const drName = a => String(a.name || '').replace(/^Lakeview · /, 'G.E. Booth · ');
  const svcLayers = { pz: null, dr: null };
  let svcOn = { pz: !!store.get('svc-pz', false), dr: !!store.get('svc-dr', false) };
  const svcSwatch = k => `<svg class="da-swatch" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">${k === 'pz'
    ? '<rect x="3" y="2" width="16" height="10" rx="1" fill="#0b7285" fill-opacity=".1" stroke="#0b7285" stroke-width="1.6" stroke-dasharray="3 2"/>'
    : '<rect x="3" y="2" width="8" height="10" fill="#2f7ed8" fill-opacity=".25" stroke="#2f7ed8"/><rect x="11" y="2" width="8" height="10" fill="#d9822b" fill-opacity=".25" stroke="#d9822b"/>'}</svg>`;
  // Map control: basemap + label pickers.
  const MapOptions = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const el = L.DomUtil.create('div', 'map-opts');
      const opts = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
      el.innerHTML = `
        <label data-info="opt-basemap"><span>Background</span><select id="opt-basemap">${opts(BASEMAPS, basemap)}</select></label>
        <label data-info="opt-labels"><span>Labels</span><select id="opt-labels">${opts(LABEL_MODES, labelMode)}</select></label>
        ${canRotate ? `<label data-info="opt-orient"><span>Orientation</span><select id="opt-orient">${opts(ORIENTATIONS, orientation)}</select></label>` : ''}
        <label class="chk" data-info="pressure-zone"><input type="checkbox" id="opt-pz"${svcOn.pz ? ' checked' : ''}>${svcSwatch('pz')}<span>Pressure zones</span></label>
        <label class="chk" data-info="drainage-area"><input type="checkbox" id="opt-dr"${svcOn.dr ? ' checked' : ''}>${svcSwatch('dr')}<span>Drainage areas</span></label>
        <label class="chk" data-info="da-layer"><input type="checkbox" id="opt-da"${daOn ? ' checked' : ''}>${daSwatch()}<span id="da-label">2021 census areas</span></label>
        <small id="label-note"></small>`;
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      el.querySelector('#opt-basemap').onchange = e => { basemap = e.target.value; store.set('basemap', basemap); setTiles(); restyleDa(); };
      el.querySelector('#opt-labels').onchange = e => { labelMode = e.target.value; store.set('labelMode', labelMode); updateLabels(); };
      el.querySelector('#opt-da').onchange = e => setDaLayer(e.target.checked);
      el.querySelector('#opt-pz').onchange = e => setSvcLayer('pz', e.target.checked);
      el.querySelector('#opt-dr').onchange = e => setSvcLayer('dr', e.target.checked);
      const orient = el.querySelector('#opt-orient');
      if (orient) orient.onchange = e => setOrientation(e.target.value);
      return el;
    },
  });
  new MapOptions().addTo(map);
  if (daOn) setDaLayer(true);

  // Cluster icon: ring segments show the phase mix of the projects inside.
  const cluster = L.markerClusterGroup({
    chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
    // At street zoom every project gets its own tappable marker (neighbouring houses
    // otherwise stay grouped and a tap only zooms in).
    disableClusteringAtZoom: 17,
    iconCreateFunction(c) {
      const kids = c.getAllChildMarkers();
      const counts = {};
      for (const m of kids) counts[m.options.phase] = (counts[m.options.phase] || 0) + 1;
      let acc = 0; const stops = [];
      for (const p of P.ALL_PHASES) {
        const n = counts[p.key]; if (!n) continue;
        const a0 = acc / kids.length * 360; acc += n; const a1 = acc / kids.length * 360;
        stops.push(`${colors[p.key]} ${a0}deg ${a1}deg`);
      }
      const n = kids.length, size = n < 10 ? 30 : n < 100 ? 36 : n < 1000 ? 42 : 50;
      return L.divIcon({
        className: 'pm',
        iconSize: [size, size],
        html: `<div class="pc" style="width:${size}px;height:${size}px;background:conic-gradient(${stops.join(',')})"><span style="width:${size - 10}px;height:${size - 10}px">${n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : n}</span></div>`,
      });
    },
  });
  map.addLayer(cluster);

  // ---- Sites on the map: application boundaries and the individual permits inside them
  const SITE_ZOOM = 14, SITE_MAX_POINTS = 3000;
  const canvas = L.canvas({ padding: 0.3 });
  // The selected project shares the same canvas (a second, empty canvas stacked on top
  // would swallow taps meant for the dots below it); it is kept on top by draw order.
  const focusCanvas = canvas;
  const siteLayer = L.layerGroup().addTo(map);   // every visible site, from street zoom
  const focusLayer = L.layerGroup().addTo(map);  // the selected project, at any zoom
  const sitePermits = p => p.records.filter(r => r.kind === 'permit' && r.lat != null);
  const siteApps = p => p.records.filter(r => r.kind === 'application' && r.poly && r.phase !== 'cancelled');
  const toLatLngs = rings => rings.map(ring => ring.map(([x, y]) => [y, x]));
  function projectBounds(p) {
    if (p._bounds) return p._bounds;
    const pts = [];
    for (const a of siteApps(p)) for (const ring of a.poly) for (const [x, y] of ring) pts.push([y, x]);
    for (const r of sitePermits(p)) pts.push([r.lat, r.lng]);
    if (p.lat != null) pts.push([p.lat, p.lng]);
    return (p._bounds = pts.length ? L.latLngBounds(pts) : null);
  }
  // Applications a permit sits inside, smallest first (fallback: all of the project's applications).
  function parentApps(r, p) {
    const apps = p.records.filter(a => a.kind === 'application' && a.phase !== 'cancelled');
    const inside = apps.filter(a => a.poly && P.pointInRings(r.lng, r.lat, a.poly))
      .sort((a, b) => P.ringsArea(a.poly) - P.ringsArea(b.poly));
    return inside.length ? inside : apps;
  }
  // Application boundaries are tappable: anywhere inside opens the project, or, for a site
  // plan nested in a larger development, that application (with a link to the whole project).
  function outline(p, strong) {
    const apps = siteApps(p);
    const biggest = Math.max(...apps.map(a => P.ringsArea(a.poly)));
    return apps.map(a => {
      const area = P.ringsArea(a.poly);
      // Application boundaries in the project's phase colour with a light fill (the census
      // areas are the white lines); the selected project is outlined more strongly.
      const ph = colors[p.phase] || colors.approved;
      const poly = L.polygon(toLatLngs(a.poly), {
        renderer: strong ? focusCanvas : canvas, color: strong ? colors.approved : ph, weight: strong ? 2.5 : 1.6,
        opacity: strong ? 1 : 0.9, fill: true, fillColor: strong ? colors.approved : ph, fillOpacity: strong ? 0.08 : 0.12,
      });
      poly._area = area;
      const nested = apps.length > 1 && area < biggest * 0.6;
      poly.bindTooltip(`<strong>${esc(a.ref || a.type || 'Application')}</strong>${a.type ? ` · ${esc(a.type)}` : ''}<br>${esc(a.address || p.title)}` +
        `${a.units ? ` · ${fmtNum(a.units)} units` : ''}<br><span class="muted">Tap for details</span>`, { className: 'pt', sticky: true });
      poly.on('click', ev => { L.DomEvent.stop(ev); if (nested) showRecordDetail(a, p); else showDetail(p); });
      return poly;
    });
  }
  function permitDot(r, p, emph, focus) {
    const m = L.circleMarker([r.lat, r.lng], {
      renderer: focus ? focusCanvas : canvas, radius: emph ? 9 : 5, weight: emph ? 4 : 1.5,
      color: emph ? colors.approved : '#ffffff', fillColor: colors[r.phase], fillOpacity: 1,
    });
    const parent = parentApps(r, p)[0];
    m.bindTooltip(`<strong>${esc(r.address || r.ref)}</strong><br>${esc(P.PHASE_BY_KEY[r.phase].label)}${r.units ? ` · ${fmtNum(r.units)} unit${r.units === 1 ? '' : 's'}` : ''}` +
      (parent ? `<br><span class="muted">Part of ${esc(parent.ref || parent.type || 'application')}</span>` : ''), { className: 'pt', direction: 'top', offset: [0, -6] });
    m.on('click', ev => { L.DomEvent.stop(ev); showRecordDetail(r, p); });
    return m;
  }
  let siteTimer;
  const scheduleSites = () => { clearTimeout(siteTimer); siteTimer = setTimeout(renderSiteLayer, 80); };
  function renderSiteLayer() {
    siteLayer.clearLayers();
    if (map.getZoom() < SITE_ZOOM) return;
    const view = map.getBounds().pad(0.2);
    let n = 0;
    const polys = [], dots = [];
    for (const p of state.filtered) {
      if (n >= SITE_MAX_POINTS) break;
      if (!siteApps(p).length) continue;
      const b = projectBounds(p);
      if (!b || !view.intersects(b)) continue;
      polys.push(...outline(p, false));
      for (const r of sitePermits(p)) {
        if (n++ >= SITE_MAX_POINTS) break;
        if (view.contains([r.lat, r.lng])) dots.push(permitDot(r, p, false));
      }
    }
    // Largest boundaries first so smaller ones (and then permit dots) sit on top and get the tap.
    polys.sort((a, b) => b._area - a._area).forEach(l => siteLayer.addLayer(l));
    dots.forEach(l => siteLayer.addLayer(l));
    // Keep the selected project's outline and dots drawn above the others.
    focusLayer.eachLayer(l => l.bringToFront && l.bringToFront());
  }
  map.on('moveend zoomend', scheduleSites);
  function highlight(p, record) {
    focusLayer.clearLayers();
    if (!p) return;
    for (const o of outline(p, true).sort((a, b) => b._area - a._area)) focusLayer.addLayer(o);
    for (const r of sitePermits(p)) if (r !== record) focusLayer.addLayer(permitDot(r, p, false, true));
    if (record && record.lat != null) focusLayer.addLayer(permitDot(record, p, true, true));
  }
  cluster.on('animationend spiderfied unspiderfied', () => scheduleLabels());
  const iconCache = {};
  // 32 px tap target around a 16 px dot.
  const iconFor = phase => iconCache[phase] || (iconCache[phase] = L.divIcon({ className: 'pm pm-hit', iconSize: [32, 32], html: dot(phase) }));
  let markerByKey = new Map();

  // ---- Loading -------------------------------------------------------------------
  async function loadSource(src) {
    src.records = []; src.layers = [];
    setSourceStatus(src, 'loading', 'connecting…');
    try {
      const res = await PeelLoader.loadSource(src, {
        bbox: CFG.bbox, sinceYear: state.sinceYear, maxPerLayer: state.maxPerLayer, pageSize: CFG.pageSize,
        onProgress: n => setSourceStatus(src, 'loading', `loading… ${fmtNum(n)}`),
      });
      src.records = res.records; src.layers = res.layers; src.live = true;
      setSourceStatus(src, 'ok', `${fmtNum(src.records.length)} records · live${res.truncated ? ` (capped at ${fmtNum(state.maxPerLayer)}/layer)` : ''}`);
    } catch (e) {
      const msg = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'unreachable (network / CORS)' : e.message;
      setSourceStatus(src, 'error', msg);
    }
    scheduleRebuild();
  }

  let inflight = 0;
  async function loadAll() {
    const todo = state.sources.filter(s => s.enabled);
    inflight += todo.length; showLoading();
    // Small concurrency so we don't hammer one server.
    const queue = todo.slice();
    const worker = async () => { while (queue.length) { const s = queue.shift(); await loadSource(s); inflight--; showLoading(); } };
    await Promise.all([worker(), worker(), worker()]);
  }
  function showLoading() {
    const el = $('#loading');
    el.hidden = inflight <= 0;
    el.textContent = `Loading ${inflight} source${inflight === 1 ? '' : 's'}…`;
  }

  async function discover() {
    const btn = $('#btn-discover');
    btn.disabled = true; btn.textContent = 'Searching hubs…';
    const found = [];
    const errors = [];
    await Promise.all(CFG.hubs.map(async h => {
      try { found.push(...await A.discoverHub(h, CFG)); }
      catch (e) { errors.push(`${h.municipality}: ${e.message}`); }
    }));
    const known = new Set(state.sources.map(s => s.url.replace(/\/+$/, '').toLowerCase()));
    const added = [];
    for (const s of found) {
      const k = s.url.replace(/\/+$/, '').toLowerCase();
      if (known.has(k) || removed.has(s.id)) continue;
      known.add(k);
      const src = { ...s, enabled: true, status: 'idle', msg: '', records: [] };
      state.sources.push(src); added.push(src);
    }
    saveSources(); renderSources();
    btn.disabled = false;
    btn.textContent = `Discover datasets${added.length ? ` (+${added.length})` : ''}`;
    if (errors.length && !found.length) alert(`Dataset discovery failed:\n${errors.join('\n')}`);
    inflight += added.length; showLoading();
    for (const s of added) { await loadSource(s); inflight--; showLoading(); }
  }

  // ---- Rebuild projects ----------------------------------------------------------
  let rebuildTimer;
  function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 150); }

  function rebuild() {
    const raw = state.sources.filter(s => s.enabled).flatMap(s => s.records);
    const records = P.dedupeRecords(raw);
    state.projects = P.buildProjects(records);
    tagProjects();
    state.auditInput = { raw, records };
    state.audit = null;
    if (!$('#tab-data').hidden) renderAudit();
    state.munis = Array.from(new Set(state.projects.map(p => p.municipality))).sort();
    renderMuniChips();
    updateYearBounds();
    applyFilters();
  }

  // Years in which the project hit the selected milestone (or any milestone).
  function yearsOf(p, mode) {
    const cache = p._years || (p._years = {});
    return cache[mode] || (cache[mode] = Array.from(new Set(
      p.timeline.filter(t => mode === 'any' || t.phase === mode).map(t => t.date.getFullYear()))));
  }
  const timeActive = () => state.yearFrom != null || state.yearTo != null;
  function inYears(p) {
    if (!timeActive()) return true;
    const lo = state.yearFrom ?? -Infinity, hi = state.yearTo ?? Infinity;
    return yearsOf(p, state.yearMode).some(y => y >= lo && y <= hi);
  }

  // Units counted by the unit-growth filter. With "Planning applications" selected,
  // only the units proposed on the applications themselves count.
  function unitsFor(p) {
    if (state.kind !== 'application') return p.units || 0;
    if (p._appUnits == null) p._appUnits = Math.max(0, ...p.records.filter(r => r.kind === 'application').map(r => r.units || 0));
    return p._appUnits;
  }

  function matches(p, ignorePhase, ignoreTime, ignoreFocus) {
    if (!ignorePhase && !state.phases.has(p.phase)) return false;
    if (!ignoreTime && !inYears(p)) return false;
    if (state.muni && p.municipality !== state.muni) return false;
    if (state.sp.length && !state.sp.some(id => (p.sp || []).includes(id))) return false;
    if (state.mtsa && !(p.mtsa || []).includes(state.mtsa)) return false;
    if (state.pz && !(p.pz || []).includes(state.pz)) return false;
    if (state.dr && !(p.dr || []).includes(state.dr)) return false;
    if (state.kind === 'both' && p.kinds.length < 2) return false;
    if ((state.kind === 'application' || state.kind === 'permit') && !p.kinds.includes(state.kind)) return false;
    if (state.newOnly && !p.newBuild) return false;
    if (state.minUnits === 'left') { if (!(p.buildout && p.buildout.remaining > 0)) return false; }
    else if (state.minUnits === 'committed') { if (!(D.unitsFor(p, 'committed') > 0)) return false; }
    else if (state.minUnits > 0 && !(unitsFor(p) >= state.minUnits)) return false;
    if (!ignoreFocus && state.focus && !FOCUS[state.focus].test(p)) return false;
    if (state.search) {
      const q = state.search;
      const hay = p._hay || (p._hay = [p.title, p.description, ...p.types, ...p.records.map(r => `${r.ref} ${r.statusRaw} ${r.address}`)].join(' ').toLowerCase());
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  function applyFilters() {
    const base = state.projects.filter(p => matches(p, true));
    state.filtered = base.filter(p => state.phases.has(p.phase));
    renderPipeline(base);
    renderMarkers();
    renderList();
    renderTimeline();
    renderDemand();
    renderCensus();
    renderFilterUI();
    renderSiteLayer();
  }

  // ---- Timeline slider -------------------------------------------------------------
  const tFrom = $('#t-from'), tTo = $('#t-to');
  // Default year range on load and after "Reset all".
  const DEFAULT_YEARS = [2021, 2026];
  let yearsInit = false;
  function updateYearBounds() {
    let lo = Infinity, hi = -Infinity;
    for (const p of state.projects) for (const t of p.timeline) {
      const y = t.date.getFullYear();
      if (y < lo) lo = y; if (y > hi) hi = y;
    }
    const now = new Date().getFullYear();
    if (!isFinite(lo)) { lo = Number(state.sinceYear) || now - 10; hi = now; }
    lo = Math.max(lo, 1980); hi = Math.min(Math.max(hi, lo + 1), now + 5);
    state.yearMin = lo; state.yearMax = hi;
    for (const el of [tFrom, tTo]) { el.min = lo; el.max = hi; el.step = 1; }
    if (!yearsInit && state.projects.length) { yearsInit = true; setDefaultYears(); }
    tFrom.value = state.yearFrom ?? lo;
    tTo.value = state.yearTo ?? hi;
  }
  function setDefaultYears() {
    const lo = state.yearMin, hi = state.yearMax;
    state.yearFrom = DEFAULT_YEARS[0] <= lo ? null : DEFAULT_YEARS[0];
    state.yearTo = DEFAULT_YEARS[1] >= hi ? null : DEFAULT_YEARS[1];
    tFrom.value = state.yearFrom ?? lo; tTo.value = state.yearTo ?? hi;
  }
  const atDefaultYears = () => {
    const lo = state.yearMin, hi = state.yearMax;
    return (state.yearFrom ?? lo) === Math.max(lo, DEFAULT_YEARS[0]) && (state.yearTo ?? hi) === Math.min(hi, DEFAULT_YEARS[1]);
  };
  function setYearsSilently(from, to) {
    state.yearFrom = null; state.yearTo = null;
    tFrom.value = from; tTo.value = to;
  }
  function setYears(from, to) {
    const lo = state.yearMin, hi = state.yearMax;
    if (from > to) [from, to] = [to, from];
    state.yearFrom = from <= lo ? null : from;
    state.yearTo = to >= hi ? null : to;
    tFrom.value = from; tTo.value = to;
    applyFilters();
  }
  function renderTimeline() {
    const lo = state.yearMin, hi = state.yearMax;
    if (lo == null) return;
    const from = state.yearFrom ?? lo, to = state.yearTo ?? hi;
    $('#t-label').textContent = timeActive() ? (from === to ? `${from}` : `${from} – ${to}`) : 'All years';
    // One button: back to the default range, or from the default to all years.
    const atDefault = atDefaultYears();
    $('#t-reset').hidden = atDefault && !timeActive();
    $('#t-reset').textContent = atDefault ? 'All years' : `${DEFAULT_YEARS[0]}–${DEFAULT_YEARS[1]}`;
    // Histogram ignores the year filter itself so you can see where to drag.
    const counts = new Map();
    for (const p of state.projects) {
      if (!matches(p, false, true)) continue;
      for (const y of yearsOf(p, state.yearMode)) if (y >= lo && y <= hi) counts.set(y, (counts.get(y) || 0) + 1);
    }
    const max = Math.max(1, ...counts.values());
    const mode = $('#t-mode').selectedOptions[0].textContent.toLowerCase();
    let bars = '';
    for (let y = lo; y <= hi; y++) {
      const n = counts.get(y) || 0;
      const on = y >= from && y <= to;
      bars += `<button type="button" class="bar${on ? ' on' : ''}" data-y="${y}" title="${y}: ${fmtNum(n)} development${n === 1 ? '' : 's'} (${esc(mode)})"
        aria-label="${y}: ${n} developments"><i style="height:${n ? Math.max(2, n / max * 100) : 0}%"></i></button>`;
    }
    $('#t-hist').innerHTML = bars;
    const span = hi - lo, step = span > 24 ? 5 : span > 10 ? 2 : 1;
    let ticks = '';
    for (let y = lo; y <= hi; y++) if ((y - lo) % step === 0 || y === hi) ticks += `<span style="left:${(y - lo + 0.5) / (span + 1) * 100}%">${y}</span>`;
    $('#t-ticks').innerHTML = ticks;
    // Keep slider thumbs centred on their year's bar.
    const pad = `(${50 / (span + 1)}% - 8px)`;
    for (const el of [tFrom, tTo]) { el.style.left = `calc${pad}`; el.style.width = `calc(100% - 2 * ${pad})`; }
  }
  tFrom.oninput = () => { if (+tFrom.value > +tTo.value) tTo.value = tFrom.value; setYears(+tFrom.value, +tTo.value); };
  tTo.oninput = () => { if (+tTo.value < +tFrom.value) tFrom.value = tTo.value; setYears(+tFrom.value, +tTo.value); };
  $('#t-reset').onclick = () => { if (atDefaultYears()) setYears(state.yearMin, state.yearMax); else { setDefaultYears(); applyFilters(); } };
  $('#t-mode').onchange = e => { state.yearMode = e.target.value; applyFilters(); };
  // Click a year bar to isolate it; shift-click to extend the range.
  let anchorYear = null;
  $('#t-hist').onclick = e => {
    const b = e.target.closest('[data-y]'); if (!b) return;
    const y = +b.dataset.y;
    if (e.shiftKey && anchorYear != null) setYears(Math.min(anchorYear, y), Math.max(anchorYear, y));
    else { anchorYear = y; setYears(y, y); }
  };

  // ---- Bottom panel tabs: servicing demand / growth since 2021 / breakdown & criteria ----
  // footPref: the tab last picked (kept), Growth & demand by default. Older tab names map onto
  // the merged tabs: demand → growth, plants → wastewater (plants view).
  let footPref = store.get('footTab3', 'growth'), footTab = 'growth';
  let wwSub = store.get('wwSub', 'plants');
  if (footPref === 'svc') footPref = 'water';
  if (footPref === 'demand') footPref = 'growth';
  if (footPref === 'plants') { footPref = 'ww'; wwSub = 'plants'; }
  function showFootTab(key) {
    if (!document.querySelector(`.f-tab[data-tab="${key}"]:not([hidden])`)) key = 'growth';
    footTab = key;
    for (const t of document.querySelectorAll('.f-tab')) t.setAttribute('aria-selected', String(t.dataset.tab === key));
    for (const p of document.querySelectorAll('.f-pane')) p.hidden = p.dataset.pane !== key || p.dataset.off === '1' || (p.dataset.sub && p.dataset.sub !== wwSub);
    for (const b of document.querySelectorAll('[data-wwsub]')) { b.classList.toggle('on', b.dataset.wwsub === wwSub); b.setAttribute('aria-pressed', String(b.dataset.wwsub === wwSub)); }
  }
  document.querySelector('.f-subtabs').addEventListener('click', e => {
    const b = e.target.closest('[data-wwsub]'); if (!b) return;
    wwSub = b.dataset.wwsub; store.set('wwSub', wwSub); showFootTab('ww');
  });
  showFootTab(footPref);

  // ---- Population & servicing demand -------------------------------------------------
  const fmt1 = n => n == null || !isFinite(n) ? '–' : n.toLocaleString('en-CA', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
  // Population rounding: whole people under 1,000, nearest 10 to 10,000, nearest 100 above.
  const roundPop = n => { const a = Math.abs(n); const k = a >= 10000 ? 100 : a >= 1000 ? 10 : 1; return Math.round(n / k) * k; };
  // Numbers with their unit beside them.
  const unit = (v, u) => `${v}<span class="u">${u}</span>`;
  const uML = v => unit(fmt1(v), 'ML/d'), uLs = v => unit(fmt1(v), 'L/s'), uPop = n => unit(fmtNum(roundPop(n)), 'pop');
  const uHa = n => unit(fmtNum(Math.round(n)), 'ha'), uDev = n => unit(fmtNum(n), n === 1 ? 'dev' : 'devs'), uUnits = n => unit(fmtNum(Math.round(n)), 'units');
  // Withdrawn projects never count; the basis picks which of each project's units count.
  // With a project selected, the shown projects in its census DA; otherwise all shown projects.
  const demandSet = () => state.filtered.filter(p => p.phase !== 'cancelled' && (!state.daCtx || state.daCtx.keys.has(p.key)));
  const BASIS_LABEL = { all: 'all units', committed: 'committed units only (approved, not yet built)', remaining: 'units with no permit yet only' };
  const demandBasis = () => (state.focus && FOCUS[state.focus].basis) || 'all';
  // What the demand covers: the phase and focus picked in the sidebar, then any other filters.
  function renderSelection(set, basis) {
    const view = currentPhaseView();
    const phase = view === 'all' ? 'All phases' : view === 'active' ? 'Active pipeline'
      : P.ALL_PHASES.filter(p => state.phases.has(p.key)).map(p => p.label).join(' + ') || 'No phase';
    const focus = state.focus ? FOCUS[state.focus].label : 'No focus';
    const others = activeFilters().map(f => f.label).filter(l => l !== focus && !(state.focus && l === FOCUS[state.focus].label))
      .filter(l => !/phases?$/.test(l) && !/^\d{4}(–\d{4})?$/.test(l) && !P.ALL_PHASES.some(p => l.split(' + ').includes(p.label)));
    const years = timeActive() ? `${state.yearFrom ?? state.yearMin}–${state.yearTo ?? state.yearMax}` : 'All years';
    const pill = (label, cls = '') => `<span class="d-pill ${cls}">${esc(label)}</span>`;
    const da = state.daCtx;
    $('#d-sel').innerHTML = `<span class="muted">Showing</span> ${da ? `<button type="button" class="d-pill da" data-clear-da title="Back to all of ${esc(daScopeName())}">DA ${esc(da.id)} · around ${esc(da.title)} <span aria-hidden="true">×</span></button>` : ''}
      ${pill(phase, 'ph')} ${pill(focus, state.focus ? 'fo' : 'off')} ${pill(years)}
      ${others.map(l => pill(l)).join(' ')}
      <span class="muted small">${fmtNum(set.length)} developments${basis !== 'all' ? ` · ${BASIS_LABEL[basis]}` : ''} · excludes withdrawn</span>
      <button type="button" class="btn small link" id="d-change">Change</button>`;
  }
  $('#d-sel').addEventListener('click', e => {
    if (e.target.closest('[data-clear-da]')) { setDaContext(null); return; }
    if (!e.target.closest('#d-change')) return;
    if (matchMedia('(max-width: 760px)').matches) toggleSidebar(true);
    const sf = $('#sect-focus'); if (sf) sf.open = true;
    $('#phase-panel').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  function renderDemand() {
    const set = demandSet();
    const c = state.criteria;
    // The demand follows the sidebar selection: the projects shown by phase, focus and the
    // other filters; the committed / left-to-build focuses count only those units.
    const basis = demandBasis();
    const e = D.estimate(set, c, basis, jobsOf);
    const em = e.employment, cb = e.combined;
    // Build-out across the shown projects (planning applications with unit counts).
    const bo = { planned: 0, permitted: 0, completed: 0, remaining: 0, n: 0 };
    for (const p of set) if (p.buildout) { bo.n++; for (const k of ['planned', 'permitted', 'completed', 'remaining']) bo[k] += p.buildout[k]; }
    // Headline numbers, then water and wastewater as two small tables:
    // residential / employment / total rows, flows in L/s.
    const stat = (label, value, unit, sub, info) =>
      `<div class="tile" data-info="${info}"><div class="tl">${label}</div><div class="tv">${value}<span class="tu">${unit}</span></div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    $('#d-stats').innerHTML = [
      stat(basis === 'all' ? 'Dwelling units' : 'Units counted', fmtNum(Math.round(e.totalUnits)), 'units',
        bo.n ? `<strong>${fmtNum(bo.remaining)}</strong> left to build · ${fmtNum(bo.permitted)} permitted` : `${fmtNum(e.withUnits)} of ${fmtNum(set.length)} developments report units`, 'demand-units'),
      stat('Population', fmtNum(Math.round(e.population)), 'people', 'Peel persons-per-unit', 'demand-pop'),
      stat('Jobs', fmtNum(Math.round(em.jobs)), 'jobs', `${fmtNum(em.projects)} employment developments`, 'demand-employment'),
    ].join('');
    $('#d-tiles').innerHTML = flowTablesHTML(e) + stampHTML('demand') + exportBar('growth');
    renderSelection(set, basis);

    // Breakdown by dwelling type and by phase.
    const typeRows = D.UNIT_TYPES.map(t => `<tr><td>${esc(t.label)}</td><td>${uUnits(e.units[t.key])}</td><td>${unit(c.ppu[t.key], 'pop/unit')}</td><td>${uPop(e.pop[t.key])}</td></tr>`).join('');
    const boRows = aggTypeRowsHTML(aggregateTypes(set));
    const phaseRows = P.PHASES.map(ph => {
      const pe = D.estimate(set.filter(p => p.phase === ph.key), c, basis, jobsOf);
      return `<tr><td>${dot(ph.key)} ${esc(ph.label)}</td><td>${uUnits(pe.totalUnits)}</td><td>${uPop(pe.population)}</td><td>${unit(fmtNum(Math.round(pe.employment.jobs)), 'jobs')}</td><td>${uLs(pe.combined.water.avg)}</td><td>${uLs(pe.combined.wastewater.avg)}</td></tr>`;
    }).join('');
    $('#d-breakdown').innerHTML = `
      <table class="dt" data-info="unit-types"><caption>Build-out by type (planning applications)</caption><thead><tr><th>Type</th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead><tbody>${boRows}</tbody></table>
      <table class="dt"><caption>By dwelling type (demand basis)</caption><thead><tr><th>Type</th><th>Units</th><th>PPU</th><th>Population</th></tr></thead><tbody>${typeRows}</tbody></table>
      <table class="dt"><caption>By phase (average day, L/s, residential + employment)</caption><thead><tr><th>Phase</th><th>Units</th><th>Population</th><th>Jobs</th><th>Water</th><th>Wastewater</th></tr></thead><tbody>${phaseRows}</tbody></table>`;
  }

  // Water and wastewater tables (residential / employment / total rows, L/s) for an estimate.
  function flowTablesHTML(e) {
    const c = state.criteria, em = e.employment, cb = e.combined, n = uLs;
    const flowTable = (title, info, cols, rows) => `<table class="dt flow" data-info="${info}">
      <caption>${title} <span class="muted">L/s</span></caption>
      <thead><tr><th></th>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, cls, info2, vals]) => `<tr class="${cls}"${info2 ? ` data-info="${info2}"` : ''}><td>${label}</td>${vals.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const iiNote = `${fmtNum(Math.round(e.area.ha + em.area.ha))} ha × ${c.wastewater.infiltration} L/s/ha${e.area.estimatedHa > 0 ? ` · ${Math.round(e.area.estimatedHa / Math.max(e.area.ha, 1e-9) * 100)}% of residential area estimated` : ''}`;
    return '<div class="flow-card">' + flowTable('Water', 'demand-water', ['Avg day', 'Max day', 'Peak hour'], [
        ['Residential', '', 'demand-water', [n(e.water.avg), n(e.water.maxDay), n(e.water.peakHour)]],
        ['Employment', '', 'demand-employment', [n(em.water.avg), n(em.water.maxDay), n(em.water.peakHour)]],
        ['Total', 'tot', 'demand-combined', [n(cb.water.avg), n(cb.water.maxDay), n(cb.water.peakHour)]],
      ]) + `<p class="small muted flow-note">${fmt1(D.toMLd(cb.water.avg))} ML/d average · residential ${c.water.avg} L/cap/d ×${c.water.maxDay} / ×${c.water.peakHour}; employment ${c.employment.water} L/emp/d ×${c.employment.maxDay} / ×${c.employment.peakHour}</p></div>`
      + '<div class="flow-card">' + flowTable('Wastewater', 'demand-wastewater', ['Avg dry', 'Peak dry', 'I&amp;I', 'Peak wet'], [
        ['Residential', '', 'demand-wastewater', [n(e.wastewater.avg), `${n(e.wastewater.peak)}<span class="muted m"> M ${e.population > 0 ? e.wastewater.peakingFactor.toFixed(2) : '–'}</span>`, n(e.wastewater.infiltration), n(e.wastewater.wetPeak)]],
        ['Employment', '', 'demand-employment', [n(em.wastewater.avg), `${n(em.wastewater.peak)}<span class="muted m"> M ${em.jobs > 0 ? em.wastewater.peakingFactor.toFixed(2) : '–'}</span>`, n(em.wastewater.infiltration), n(em.wastewater.wetPeak)]],
        ['Total', 'tot', 'demand-combined', [n(cb.wastewater.avg), n(cb.wastewater.peak), n(cb.wastewater.infiltration), n(cb.wastewater.wetPeak)]],
      ]) + `<p class="small muted flow-note">${fmt1(D.toMLd(cb.wastewater.avg))} ML/d average · I&amp;I on ${iiNote}</p></div>`;
  }

  // Build-out by dwelling type and employment floor space, summed over projects.
  function aggregateTypes(projects) {
    const bt = {}; for (const t of D.UNIT_TYPES) bt[t.key] = { planned: 0, permitted: 0, completed: 0, left: 0 };
    const emp = { planned: 0, permitted: 0, completed: 0, left: 0, jobs: 0 };
    for (const p of projects) {
      const tb = p.buildout ? D.typeBuildout(p) : null;
      if (tb) for (const k in bt) for (const col in bt[k]) bt[k][col] += tb.rows[k][col];
      const em = empOf(p);
      if (em && em.totalM2 > 0) {
        emp.planned += em.totalM2; emp.jobs += em.jobs;
        if (EMP_DONE.permitted.has(p.phase)) emp.permitted += em.totalM2; else if (p.phase !== 'cancelled') emp.left += em.totalM2;
        if (EMP_DONE.completed.has(p.phase)) emp.completed += em.totalM2;
      }
    }
    return { bt, emp };
  }
  function aggTypeRowsHTML({ bt, emp }) {
    const cols = ['planned', 'permitted', 'completed', 'left'];
    return D.UNIT_TYPES.filter(t => bt[t.key].planned || bt[t.key].permitted).map(t => `<tr><td>${esc(t.label)}</td>${cols.map(col => `<td>${uUnits(bt[t.key][col])}</td>`).join('')}</tr>`).join('')
      + (emp.planned ? `<tr class="tot"><td>Employment floor space <span class="muted">(~${fmtNum(emp.jobs)} jobs)</span></td>${cols.map(col => `<td>${unit(fmtNum(emp[col]), 'm²')}</td>`).join('')}</tr>` : '');
  }

  function renderCriteria() {
    const c = state.criteria;
    const inp = (g, k, label, step) => `<label class="field"><span>${label}</span><input type="number" min="0" step="${step}" data-g="${g}" data-k="${k}" value="${c[g][k]}"></label>`;
    $('#d-criteria').innerHTML = `
      <fieldset><legend>Persons per unit</legend>
        ${inp('ppu', 'single', 'Single / semi', 0.1)}${inp('ppu', 'town', 'Townhouse', 0.1)}${inp('ppu', 'apartment', 'Apartment', 0.1)}${inp('ppu', 'unknown', 'Type not stated', 0.1)}
      </fieldset>
      <fieldset><legend>Water</legend>
        ${inp('water', 'avg', 'Average day (L/cap/d)', 1)}${inp('water', 'maxDay', 'Max day factor', 0.1)}${inp('water', 'peakHour', 'Peak hour factor', 0.1)}
      </fieldset>
      <fieldset><legend>Wastewater</legend>
        ${inp('wastewater', 'avg', 'Residential (L/cap/d)', 0.1)}${inp('wastewater', 'infiltration', 'I&amp;I (L/s/ha)', 0.01)}
        <p class="small muted">Dry weather peak = average × Harmon M = 1 + 14 / (4 + √P), P in thousands, applied to the combined population. I&amp;I = rate × gross site area (application boundary; where there is none, estimated at ${D.AREA_PER_UNIT.single} ha per single, ${D.AREA_PER_UNIT.town} per townhouse, ${D.AREA_PER_UNIT.apartment} per apartment unit). Peak wet weather = dry weather peak + I&amp;I.</p>
      </fieldset>
      <fieldset><legend>Employment</legend>
        ${inp('employment', 'water', 'Water (L/emp/d)', 1)}${inp('employment', 'maxDay', 'Max day factor', 0.1)}${inp('employment', 'peakHour', 'Peak hour factor', 0.1)}
        ${inp('employment', 'wastewater', 'Wastewater (L/emp/d)', 1)}${inp('employment', 'peakMin', 'Peaking min', 0.1)}${inp('employment', 'peakMax', 'Peaking max', 0.1)}
      </fieldset>
      <fieldset><legend>Employment floor space (m²/job)</legend>
        ${inp('m2PerJob', 'industrial', 'Industrial', 1)}${inp('m2PerJob', 'office', 'Office', 1)}${inp('m2PerJob', 'retail', 'Retail', 1)}${inp('m2PerJob', 'hotel', 'Hotel', 1)}${inp('m2PerJob', 'institutional', 'Institutional', 1)}
        <p class="small muted">Jobs = floor area on the applications ÷ m²/job for each use. Defaults are typical planning assumptions; change them to match an FSR or employment study.</p>
      </fieldset>
      <fieldset><legend>Employment notes</legend>
        <p class="small muted">Wastewater peak = average × Harmon M on the employee count, kept between the min and max; I&amp;I on the boundary of non-residential sites. Residential and employment peaks are added for the total. A development's jobs count by its phase (committed = approved to under construction).</p>
      </fieldset>
      <p class="small muted">Defaults: Region of Peel Linear Wastewater Standards (Table 2-2 PPU from the DC Background Study; 290 L/cap/d) and Watermain Design Criteria (280 L/cap/d, ×2.0 max day, ×3.0 peak hour); employment water 300 L/emp/d ×1.4 / ×3.0 (Peel FSR requirements, ICI) and wastewater 270 L/emp/d, peaking 2–4 (Peel Water &amp; Wastewater Modelling Demand Table, Aug 2024). Apartments use 2.7 PPU, Peel's rate for high-density sites (&gt;475 persons/ha); use 3.1 for large apartments at lower density.</p>
      <button type="button" class="btn small" id="d-reset">Reset to Peel defaults</button>`;
  }
  $('#d-criteria').oninput = e => {
    const el = e.target; if (!el.dataset.g) return;
    const v = Number(el.value);
    if (!(v >= 0)) return;
    state.criteria[el.dataset.g][el.dataset.k] = v;
    store.set('criteria', state.criteria);
    refreshCriteria(el.dataset.g === 'm2PerJob' && v > 0);
  };
  // Criteria changed: redraw everything that uses them (jobs also feed the summaries and the open development).
  function refreshCriteria(jobs) {
    if (jobs) { clearEmp(); renderPipeline(state.projects.filter(p => matches(p, true))); }
    renderDemand(); renderCensus();
    // Redraw the open panel where it shows demand or jobs, keeping its scroll position.
    const det = $('#detail'), view = det.dataset.view, top = det.scrollTop;
    if (det.hidden) return;
    if (view === 'dev' && currentProject) showDetail(currentProject);
    else if (view === 'sel' && selection.size) showSelection();
    else return;
    det.scrollTop = top;
  }
  $('#d-criteria').onclick = e => {
    if (e.target.id !== 'd-reset') return;
    state.criteria = mergeCriteria(null); store.set('criteria', null);
    renderCriteria(); refreshCriteria(true);
  };

  // ---- Rendering -----------------------------------------------------------------
  function renderPipeline(base) {
    const counts = Object.fromEntries(P.ALL_PHASES.map(p => [p.key, 0]));
    for (const p of base) counts[p.phase]++;
    const total = base.length;
    $('#total-count').textContent = `${fmtNum(state.filtered.length)} of ${fmtNum(state.projects.length)} developments`;
    $('#pipeline').innerHTML = P.ALL_PHASES.filter(p => counts[p.key]).map(p =>
      `<button type="button" data-phase="${p.key}" data-info="phase-${p.key}" class="${state.phases.has(p.key) ? '' : 'off'}" style="flex:${counts[p.key]};background:${colors[p.key]}"
        title="${esc(p.label)}: ${fmtNum(counts[p.key])} (${total ? Math.round(counts[p.key] / total * 100) : 0}%)" aria-label="${esc(p.label)} ${counts[p.key]}"></button>`).join('');
    // Phase quick views: one tap shows that phase only.
    const cur = currentPhaseView();
    const n = keys => keys.reduce((a, k) => a + counts[k], 0);
    const chip = (key, label, count, title, lead = '') =>
      `<button type="button" class="chip${cur === key ? ' on' : ''}" data-pv="${key}" data-info="phase-${key}" aria-pressed="${cur === key}" title="${esc(title)}">${lead}${esc(label)} <span class="n">${fmtNum(count)}</span></button>`;
    $('#phase-chips').innerHTML = [
      chip('all', 'All', total, 'Every phase'),
      chip('active', 'Active pipeline', n(ACTIVE_PHASES), 'Not yet completed, not withdrawn'),
      ...P.ALL_PHASES.map(p => chip(p.key, p.label, counts[p.key], p.desc, dot(p.key))),
    ].join('');
    renderFocusChips();
  }

  function renderMarkers() {
    cluster.clearLayers();
    markerByKey = new Map();
    projectByMarker = new Map();
    const markers = [];
    for (const p of state.filtered) {
      if (p.lat == null) continue;
      const m = L.marker([p.lat, p.lng], { icon: iconFor(p.phase), phase: p.phase, keyboard: false, title: '' });
      m.bindTooltip(`<strong>${esc(p.title)}</strong><br>${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}`, { className: 'pt', direction: 'top', offset: [0, -8] });
      m.on('click', () => showDetail(p));
      markerByKey.set(p.key, m);
      projectByMarker.set(m, p);
      markers.push(m);
    }
    cluster.addLayers(markers);
    scheduleLabels();
  }

  const LIST_LIMIT = 300;
  // The list shows the matching projects inside the current map view; it follows the map
  // as you pan and zoom.
  const SORTS = {
    recent: (a, b) => (b.last || 0) - (a.last || 0) || b.rank - a.rank,
    units: (a, b) => (b.units || 0) - (a.units || 0),
    left: (a, b) => ((b.buildout && b.buildout.remaining) || 0) - ((a.buildout && a.buildout.remaining) || 0) || (b.units || 0) - (a.units || 0),
    name: (a, b) => String(a.title).localeCompare(String(b.title), 'en', { numeric: true }),
  };
  function renderList() {
    const bounds = map.getBounds();
    const inView = state.filtered.filter(p => p.lat != null && bounds.contains([p.lat, p.lng]));
    const sorted = inView.sort(SORTS[$('#list-sort').value] || SORTS.recent);
    $('#list-count').textContent = `· ${fmtNum(inView.length)} of ${fmtNum(state.filtered.length)}`;
    $('#list-note').textContent = !inView.length ? (state.filtered.length ? 'No matching developments in this part of the map — zoom out or pan.' : 'No developments match the filters.')
      : sorted.length > LIST_LIMIT ? `Showing ${LIST_LIMIT} of ${fmtNum(sorted.length)} — zoom in to narrow.` : '';
    $('#project-list').innerHTML = sorted.slice(0, LIST_LIMIT).map((p, i) =>
      `<li><button type="button" data-i="${i}">${dot(p.phase)}<span><span class="t">${esc(p.title)}</span>
        <span class="m">${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}${p.buildout ? ` · ${fmtNum(p.buildout.planned)} planned, ${fmtNum(p.buildout.remaining)} left` : p.units ? ` · ${fmtNum(p.units)} units` : ''}${p.last ? ` · ${fmtDate(p.last)}` : ''}</span></span></button></li>`).join('');
    $('#project-list').onclick = e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const p = sorted[+b.dataset.i];
      focusProject(p);
    };
  }

  let listTimer;
  map.on('moveend', () => { clearTimeout(listTimer); listTimer = setTimeout(renderList, 120); });
  $('#list-sort').onchange = renderList;

  function focusProject(p) {
    showDetail(p);
    if (p.lat == null) return;
    const m = markerByKey.get(p.key);
    if (m) cluster.zoomToShowLayer(m, () => m.openTooltip());
    else map.setView([p.lat, p.lng], 17);
    if (innerWidth <= 760) toggleSidebar(false);
  }

  function renderLegend() {
    $('#legend').innerHTML = P.ALL_PHASES.map(p => `<div class="li" data-info="phase-${p.key}">${dot(p.key)}<span>${esc(p.label)}</span></div>`).join('');
  }

  function renderSources() {
    const ok = state.sources.filter(s => s.enabled && s.status === 'ok').length;
    const en = state.sources.filter(s => s.enabled).length;
    $('#sources-summary').textContent = state.snapshot
      ? `Weekly snapshot · ${state.snapshot.generatedAt.slice(0, 10)}${state.sources.some(s => s.live) ? ' + live' : ''}`
      : `${ok}/${en} loaded · live`;
    $('#source-list').innerHTML = state.sources.map((s, i) =>
      `<li><input type="checkbox" data-i="${i}" ${s.enabled ? 'checked' : ''} aria-label="Enable ${esc(s.name)}">
        <a class="name" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
        <button type="button" class="rm" data-rm="${i}" title="Remove source" aria-label="Remove ${esc(s.name)}">×</button>
        <span class="st ${s.status === 'error' ? 'err' : s.status === 'ok' ? 'ok' : ''}">${esc(s.kind === 'permit' ? 'Building permits' : 'Planning applications')}${s.msg ? ' · ' + esc(s.msg) : ''}</span></li>`).join('');
  }
  function setSourceStatus(src, status, msg) { src.status = status; src.msg = msg; renderSources(); }

  // ---- Detail panel --------------------------------------------------------------
  function recordRows(r) {
    const props = r.props && Object.keys(r.props).length ? r.props : null;
    const rows = props
      ? Object.entries(props).filter(([k, v]) => v != null && v !== '' && !/^(shape|globalid)/i.test(k)).map(([k, v]) =>
          [k, typeof v === 'number' && v > 1e11 && v < 5e12 && /date|_dt|time/i.test(k) ? fmtDate(new Date(v)) : v])
      : [['File', r.ref], ['Address', r.address], ['Type', r.type], ['Status', r.statusRaw], ['Ward', r.ward],
         ['Units', r.units != null ? fmtNum(r.units) : ''], ['Floor area', r.gfa != null ? fmtNum(r.gfa) : ''],
         ...r.events.map(e => [P.humanizeField(e.label), fmtDate(e.date)])].filter(([, v]) => v !== '' && v != null);
    return rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  }

  const BASIS_TEXT = {
    master: 'from the rezoning / official plan / subdivision application (largest figure across resubmissions).',
    siteplan: 'site plan phases added up (each tower or block has its own site plan).',
    condo: 'condominium phases added up (each building registered separately).',
    other: 'from the planning applications.',
  };
  // Phases (separate site plan / condo files on one development).
  function phasesHTML(b) {
    if (!b.phases || b.phases.length < 2) return '';
    const rows = b.phases.map(f => {
      const left = f.permitted != null ? Math.max(0, f.units - f.permitted) : null;
      return `<tr><td>${dot(f.phase)} <strong>${esc(f.ref)}</strong><div class="m">${esc(f.status || '')}${f.date ? ` · ${fmtDate(f.date)}` : ''}</div></td>
        <td>${fmtNum(f.units)}</td><td>${f.permitted != null ? fmtNum(f.permitted) : '–'}</td><td>${left != null ? fmtNum(left) : '–'}</td></tr>`;
    }).join('');
    const matched = b.phases.some(f => f.permitted != null);
    return `<table class="dt phases-table"><caption>Phases (${b.phases.length})</caption>
      <thead><tr><th>File</th><th>Planned</th><th>Permitted</th><th>Left</th></tr></thead><tbody>${rows}</tbody></table>
      ${matched ? '' : '<p class="small muted">Permits can\'t be matched to individual phases here (the phases share one lot boundary); the totals above cover all phases.</p>'}`;
  }

  // Planned units (planning applications) vs units on building permits inside the site,
  // laid out like the phase stepper: planned -> permitted -> completed, then what is left.
  function buildoutHTML(p) {
    const b = p.buildout;
    const permits = p.records.filter(r => r.kind === 'permit').length;
    if (!b) return permits > 1 ? `<p class="small muted">${fmtNum(permits)} building permits on this site.</p>` : '';
    const total = Math.max(b.planned, b.permitted);
    const pct = v => {
      if (!total) return '';
      const x = v / total * 100, r = Math.round(x);
      return ` · ${r === 0 && v > 0 ? '<1' : r === 100 && v < total ? '>99' : r}%`;
    };
    const step = (cls, mark, label, sub, value) =>
      `<li class="${cls}">${mark}<span class="lbl">${label}${sub ? `<span class="desc">${sub}</span>` : ''}</span><span class="when">${value}</span></li>`;
    const reached = v => v > 0 ? 'done' : 'todo';
    const units = v => `${fmtNum(v)} units`;
    return `<details class="sect"><summary><h2 class="section-title" data-info="buildout">Build-out details</h2></summary>
      <ol class="stepper bo-steps">
        ${step('done', dot('approved'), 'Planned', 'Planning applications', units(b.planned))}
        ${step(reached(b.permitted), dot('permit'), 'Permitted', `${fmtNum(b.permits)} building permits${pct(b.permitted)}`, units(b.permitted))}
        ${step(reached(b.completed), dot('completed'), 'Completed', `Permits closed or occupied${pct(b.completed)}`, units(b.completed))}
        ${step('current left', '<span class="dot bo-left-dot" aria-hidden="true"></span>', 'Left to build', `No building permit yet${pct(b.remaining)}`, `<strong>${units(b.remaining)}</strong>`)}
      </ol>
      ${b.permitted > b.planned ? `<p class="small muted">More units are permitted than the applications state, so the permits are used as the development total.</p>` : ''}
      ${b.basis ? `<p class="small muted">Planned units: ${esc(BASIS_TEXT[b.basis] || '')}</p>` : ''}
      ${phasesHTML(b)}</details>`;
  }

  // Employment uses parsed from the applications (industrial, office, retail, hotel, institutional).
  function employmentHTML(p) {
    const e = empOf(p);
    if (!e) return '';
    const rows = e.uses.map(u => `<tr><td>${esc(u.label)}</td><td>${u.m2 ? `${fmtNum(u.m2)} m²${u.fromField ? ' <span class="muted">†</span>' : ''}` : '<span class="muted">not stated</span>'}</td><td>${u.jobs ? fmtNum(u.jobs) : '–'}</td></tr>`).join('');
    const anyField = e.uses.some(u => u.fromField);
    return `<details class="sect emp" open><summary><h2 class="section-title" data-info="employment">Employment${e.mixed ? ' <span class="muted small">(mixed use)</span>' : ''}</h2>
        <span class="muted small sect-sum">${e.totalM2 ? `${fmtNum(e.totalM2)} m² · ~${fmtNum(e.jobs)} jobs` : 'floor area not stated'}</span></summary>
      <table class="dt"><thead><tr><th>Use</th><th>Floor area</th><th>Est. jobs</th></tr></thead><tbody>${rows}</tbody></table>
      ${e.jobs > 0 ? (d => `<p class="small emp-demand"><strong>Servicing:</strong> water ${fmt1(d.water.avg)} L/s average, ${fmt1(d.water.peakHour)} L/s peak hour · wastewater ${fmt1(d.wastewater.avg)} L/s average, ${fmt1(d.wastewater.peak)} L/s peak (M ${d.wastewater.peakingFactor.toFixed(2)}). Details under Servicing demand.</p>`)(D.employmentDemand(e.jobs, state.criteria)) : ''}
      <p class="small muted">Read from the application descriptions${anyField ? '; † floor area field published with the application' : ''}. Jobs at ${Object.entries(state.criteria.m2PerJob).filter(([k]) => e.uses.some(u => u.key === k)).map(([k, v]) => `${v} m²/job ${k}`).join(', ')} (editable under Breakdown &amp; criteria).</p>
    </details>`;
  }

  // The headline numbers, first thing in the panel: planned, permitted, completed, left to build.
  function summaryHTML(p) {
    const b = p.buildout;
    const permits = p.records.filter(r => r.kind === 'permit');
    const tile = (cls, label, value, sub) => `<div class="sum-tile ${cls}"><div class="sl">${label}</div><div class="sv">${value}</div>${sub ? `<div class="ss">${sub}</div>` : ''}</div>`;
    if (b) {
      const total = Math.max(b.planned, b.permitted);
      const pc = v => total ? `${Math.round(v / total * 100)}%` : '';
      const w = v => total ? (v / total * 100).toFixed(2) : 0;
      return `<div class="summary" data-info="buildout">
        <div class="sum-tiles">
          ${tile('s-plan', 'Planned', fmtNum(b.planned), 'units')}
          ${tile('s-perm', 'Permitted', fmtNum(b.permitted), `${pc(b.permitted)} · ${fmtNum(b.permits)} permits`)}
          ${tile('s-done', 'Completed', fmtNum(b.completed), pc(b.completed))}
          ${tile('s-left', 'Left to build', fmtNum(b.remaining), 'no permit yet')}
        </div>
        <div class="sum-bar" role="img" aria-label="${fmtNum(b.completed)} completed, ${fmtNum(Math.max(0, b.permitted - b.completed))} permitted not completed, ${fmtNum(b.remaining)} left to build">
          <span class="bo-done" style="width:${w(b.completed)}%"></span><span class="bo-perm" style="width:${w(Math.max(0, b.permitted - b.completed))}%"></span><span class="bo-left" style="width:${w(b.remaining)}%"></span>
        </div>${typeTableHTML(p)}</div>`;
    }
    const done = permits.filter(r => r.phase === 'completed').length;
    return `<div class="summary"><div class="sum-tiles">
      ${tile('s-plan', 'Units', p.units ? fmtNum(p.units) : '–', p.units ? 'on the files' : 'not stated')}
      ${tile('s-perm', 'Permits', fmtNum(permits.length), '')}
      ${tile('s-done', 'Completed', fmtNum(done), done ? 'permits' : '')}
      ${tile('s-left', 'Applications', fmtNum(p.records.length - permits.length), '')}
    </div>${typeTableHTML(p)}</div>`;
  }

  // Under the headline tiles: the same four columns by dwelling type, plus employment floor
  // space (which moves with the project's phase: there are no per-unit permits for it).
  const TYPE_SOURCE = {
    mix: 'Types from the unit mix published with the application.',
    text: 'Types from the counts in the application description.',
    permits: 'Types from the building permits; the rest of the plan from the application description.',
    guess: 'Type read from the application description.',
  };
  function typeTableHTML(p) {
    const t = p.buildout ? D.typeBuildout(p) : null;
    const e = empOf(p);
    const rows = [];
    if (t) {
      for (const ut of D.UNIT_TYPES) {
        const r = t.rows[ut.key];
        if (!(r.planned || r.permitted || r.completed || r.left)) continue;
        const c = v => v ? fmtNum(v) : '<span class="muted">–</span>';
        rows.push(`<tr><td>${esc(ut.label)}</td><td>${c(r.planned)}</td><td>${c(r.permitted)}</td><td>${c(r.completed)}</td><td>${c(r.left)}</td></tr>`);
      }
    }
    if (e && e.totalM2 > 0) {
      const ph = p.phase;
      const v = on => on ? `${fmtNum(e.totalM2)}` : '<span class="muted">–</span>';
      rows.push(`<tr class="emp-row" data-info="employment"><td>Employment <span class="muted">m²</span><div class="muted small">~${fmtNum(e.jobs)} jobs · ${esc(e.uses.filter(u => u.m2).map(u => u.label.split(' /')[0].toLowerCase()).join(', '))}</div></td>
        <td>${fmtNum(e.totalM2)}</td><td>${v(EMP_DONE.permitted.has(ph))}</td><td>${v(EMP_DONE.completed.has(ph))}</td><td>${v(!EMP_DONE.permitted.has(ph) && ph !== 'cancelled')}</td></tr>`);
    }
    if (!rows.length) return '';
    const notes = [t ? TYPE_SOURCE[t.source] : '', e && e.totalM2 > 0 ? 'Employment floor space follows the development phase.' : ''].filter(Boolean).join(' ');
    return `<table class="dt type-table" data-info="unit-types"><thead><tr><th></th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table><p class="small muted type-note">${notes}</p>`;
  }

  // Source records grouped by type (zoning / subdivision, site plan, condominium,
  // pre-consultation, building permits), each group oldest first and opening to its files.
  const REC_GROUPS = [
    ['master', 'Official plan / zoning / subdivision'], ['siteplan', 'Site plan'], ['condo', 'Condominium'],
    ['precon', 'Pre-consultation'], ['other', 'Other applications'], ['permit-new', 'Building permits – new units'], ['permit', 'Building permits – other'],
  ];
  function recGroup(r) {
    if (r.kind === 'permit') return P.permitAddsUnits(r) && r.units > 0 ? 'permit-new' : 'permit';
    return r.stage || P.stageOf(r);
  }

  // Servicing demand for one project. Peaking uses the project's own population (local
  // sewer / watermain sizing), so it is higher than its share of the regional total.
  function demandHTML(p, intro = '') {
    const c = state.criteria;
    // Total = completed (finished permits) + remaining (everything not yet completed).
    const cols = [['all', 'Total'], ['completed', 'Completed'], ['unbuilt', 'Remaining']];
    const es = cols.map(([k]) => D.estimate([p], c, k, jobsOf));
    const res = es[0].totalUnits > 0, emp = es[0].employment.jobs > 0;
    if (!res && !emp) return '';
    const row = (label, f, unit = '') => `<tr><td>${label}</td>${es.map(e => `<td>${f(e)}${unit}</td>`).join('')}</tr>`;
    const sub = t => `<tr class="sub"><td colspan="${cols.length + 1}">${t}</td></tr>`;
    const typeNote = D.UNIT_TYPES.filter(t => es[0].units[t.key] > 0).map(t => `${t.label.toLowerCase()} ${c.ppu[t.key]} ppu`).join(', ');
    const resRows = !res ? '' : `
        ${row('Units', e => fmtNum(Math.round(e.totalUnits)))}
        ${row('Population', e => fmtNum(Math.round(e.population)))}
        ${sub(`Water (L/s)${emp ? ' · residential' : ''}`)}
        ${row('Average day', e => fmt1(e.water.avg))}
        ${row(`Max day ×${c.water.maxDay}`, e => fmt1(e.water.maxDay))}
        ${row(`Peak hour ×${c.water.peakHour}`, e => fmt1(e.water.peakHour))}
        ${sub(`Wastewater (L/s)${emp ? ' · residential' : ''}`)}
        ${row('Average dry weather', e => fmt1(e.wastewater.avg))}
        ${row('Peak dry (Harmon)', e => e.population > 0 ? `${fmt1(e.wastewater.peak)} <span class="muted">M ${e.wastewater.peakingFactor.toFixed(2)}</span>` : '–')}
        ${row(`I&amp;I (${c.wastewater.infiltration} L/s/ha)`, e => e.area.ha > 0 ? `${fmt1(e.wastewater.infiltration)} <span class="muted">${fmt1(e.area.ha)} ha${e.area.estimatedHa > 0 ? ' est.' : ''}</span>` : '–')}
        ${row('Peak wet weather', e => e.population > 0 ? fmt1(e.wastewater.wetPeak) : '–')}`;
    const m = e => e.employment;
    const empRows = !emp ? '' : `
        ${sub('Employment (L/s)')}
        ${row('Jobs', e => m(e).jobs > 0 ? fmtNum(Math.round(m(e).jobs)) : '–')}
        ${row(`Water average · ${c.employment.water} L/emp/d`, e => m(e).jobs > 0 ? fmt1(m(e).water.avg) : '–')}
        ${row(`Water max day ×${c.employment.maxDay}`, e => m(e).jobs > 0 ? fmt1(m(e).water.maxDay) : '–')}
        ${row(`Water peak hour ×${c.employment.peakHour}`, e => m(e).jobs > 0 ? fmt1(m(e).water.peakHour) : '–')}
        ${row(`Wastewater average · ${c.employment.wastewater} L/emp/d`, e => m(e).jobs > 0 ? fmt1(m(e).wastewater.avg) : '–')}
        ${row('Wastewater peak', e => m(e).jobs > 0 ? `${fmt1(m(e).wastewater.peak)} <span class="muted">M ${m(e).wastewater.peakingFactor.toFixed(2)}</span>` : '–')}
        ${m(es[0]).area.ha > 0 ? row(`I&amp;I (${c.wastewater.infiltration} L/s/ha)`, e => m(e).jobs > 0 ? `${fmt1(m(e).wastewater.infiltration)} <span class="muted">${fmt1(m(e).area.ha)} ha</span>` : '–') : ''}
        ${row('Peak wet weather', e => m(e).jobs > 0 ? fmt1(m(e).wastewater.wetPeak) : '–')}`;
    const totRows = !(res && emp) ? '' : `
        ${sub('Total · residential + employment (L/s)')}
        ${row('Water max day', e => fmt1(e.combined.water.maxDay))}
        ${row('Water peak hour', e => fmt1(e.combined.water.peakHour))}
        ${row('Wastewater peak wet weather', e => fmt1(e.combined.wastewater.wetPeak))}`;
    const notes = [];
    if (res) notes.push(`${esc(typeNote)}; ${c.water.avg} L/cap/d water, ${c.wastewater.avg} L/cap/d wastewater; I&amp;I on ${es[0].area.estimatedHa > 0 ? 'an estimated site area (no boundary in the data)' : 'the application boundary area'}, split by share of units.`);
    if (emp) notes.push(`Jobs from the floor areas in the Employment section; ${c.employment.water} L/emp/d water, ${c.employment.wastewater} L/emp/d wastewater, peaking ${c.employment.peakMin}–${c.employment.peakMax}${res ? '' : m(es[0]).area.ha > 0 ? '; I&amp;I on the application boundary' : '; no boundary, so no I&amp;I'}. Jobs count as completed once the development is completed.`);
    return `<details class="sect"><summary><h2 class="section-title" data-info="project-demand">Servicing demand</h2>${emp ? `<span class="muted small sect-sum">${res ? 'residential + ' : ''}${fmtNum(Math.round(m(es[0]).jobs))} jobs</span>` : ''}</summary>${intro}
      <table class="dt demand-table"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${resRows}${empRows}${totRows}
      </tbody></table>
      <p class="small muted">${notes.join(' ')}
        ${res ? 'Completed = units on finished permits; remaining = the rest, permitted or not. ' : ''}Peaks are for each column alone (peaking is not additive); edit the criteria in the bottom panel.</p></details>`;
  }

  function phaseHistoryHTML(p) {
    const h = state.history && state.history.projects && state.history.projects[p.key];
    if (!h || !h.length) return '';
    return `<h2 class="section-title">Phase history <span class="muted small">(checked weekly)</span></h2>
      <ol class="timeline">${h.map(([d, ph], i) => `<li><span class="d">${esc(d)}</span>${dot(ph)}<span>${i ? 'Moved to' : 'First seen as'} ${esc(P.PHASE_BY_KEY[ph].label)}</span></li>`).join('')}</ol>`;
  }

  // Dated events grouped by day, then by event: "Permit issued · Issue date — 20-287761, 20-287981
  // +2 more" instead of one line per file.
  function timelineHTML(events) {
    const days = new Map();
    for (const t of events) {
      const d = fmtDate(t.date);
      if (!days.has(d)) days.set(d, new Map());
      const g = days.get(d), k = `${t.phase}|${t.text}`;
      if (!g.has(k)) g.set(k, { phase: t.phase, text: t.text, tags: [] });
      if (!g.get(k).tags.includes(t.tag)) g.get(k).tags.push(t.tag);
    }
    const tags = list => list.length <= 3 ? esc(list.join(', '))
      : `${esc(list.slice(0, 2).join(', '))} <details class="tl-more"><summary>+${list.length - 2} more</summary>${esc(list.slice(2).join(', '))}</details>`;
    const rows = [...days].map(([d, g]) => `<li><span class="d">${d}</span><div class="tl-day">${[...g.values()].map(e =>
      `<div class="tl-ev">${dot(e.phase)}<span>${esc(e.text)}${e.tags.length > 1 ? ` <span class="tl-n">×${e.tags.length}</span>` : ''} <span class="muted">— ${tags(e.tags)}</span></span></div>`).join('')}</div></li>`).join('');
    return `<p class="small muted tl-sum">${fmtNum(events.length)} event${events.length === 1 ? '' : 's'} on ${fmtNum(days.size)} date${days.size === 1 ? '' : 's'}</p><ol class="timeline grouped">${rows}</ol>`;
  }

  let currentProject = null;
  function showDetail(p) {
    currentProject = p;
    setDaContext(p);
    highlight(p);
    const ph = P.PHASE_BY_KEY[p.phase];
    const cancelled = p.phase === 'cancelled';
    const steps = P.PHASES.map(s => {
      const reached = !cancelled && s.rank <= p.rank;
      const when = p.milestones[s.key];
      const cls = s.key === p.phase ? 'current done' : reached ? 'done' : 'todo';
      return `<li class="${cls}">${dot(s.key)}<span class="lbl">${esc(s.label)}</span><span class="when">${when ? fmtDate(when) : reached ? 'reached' : ''}</span></li>`;
    }).join('');
    const timeline = p.timeline.length ? timelineHTML(p.timeline)
      : '<p class="muted small">No dated milestones in the source data.</p>';
    const RECORD_LIMIT = 40;
    // Oldest first by date received (the record's earliest date); undated records last.
    const received = r => r.events.length ? Math.min(...r.events.map(e => +e.date)) : Infinity;
    const ordered = p.records.slice().sort((a, b) => received(a) - received(b));
    const recHTML = r => `
      <details class="rec"><summary>${dot(r.phase)} ${isFinite(received(r)) ? `<span class="rec-date">${fmtDate(new Date(received(r)))}</span> ` : ''}<strong>${esc(r.kind === 'permit' ? 'Building permit' : 'Application')} ${esc(r.ref)}</strong>
        ${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}</summary>
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
        <p class="small muted">Source: ${esc(r.sourceName)}${r.alsoIn ? ` (also in ${esc(r.alsoIn.join(', '))})` : ''}
          ${r.lat != null ? ` · <button type="button" class="btn small link" data-rec="${esc(r.uid)}">${r.kind === 'permit' ? 'Show on map & parent application' : 'Show on map'}</button>` : ''}</p>
        <table>${recordRows(r)}</table>
      </details>`;
    const recs = REC_GROUPS.map(([key, label]) => {
      const list = ordered.filter(r => recGroup(r) === key);
      if (!list.length) return '';
      const dates = list.map(received).filter(isFinite);
      const span = dates.length ? ` · ${fmtDate(new Date(Math.min(...dates))).slice(0, 4)}${Math.max(...dates) - Math.min(...dates) > 365 * 864e5 ? `–${fmtDate(new Date(Math.max(...dates))).slice(0, 4)}` : ''}` : '';
      const units = key === 'permit-new' ? P.permitUnits(list) : 0;
      return `<details class="rec-group"><summary><strong>${esc(label)}</strong> <span class="n">${fmtNum(list.length)}</span><span class="muted small">${span}${units ? ` · ${fmtNum(units)} units` : ''}</span></summary>
        ${list.slice(0, RECORD_LIMIT).map(recHTML).join('')}
        ${list.length > RECORD_LIMIT ? `<p class="small muted">+ ${fmtNum(list.length - RECORD_LIMIT)} more (export CSV for the full list)</p>` : ''}
      </details>`;
    }).join('');
    $('#detail-body').innerHTML = `
      ${selection.has(p.key) ? `<button type="button" class="btn small link back-sel" data-sel="back">← Selection (${fmtNum(selection.size)} projects)</button>` : ''}
      <div class="head"><h3>${esc(p.title)}</h3><div class="m">${esc(p.municipality)}${p.types.length ? ' · ' + esc(p.types.slice(0, 3).join(', ')) : ''}</div>
        <span class="badge">${dot(p.phase)}${esc(ph.label)}</span></div>
      ${summaryHTML(p)}
      <p class="facts small">${[p.first && `First filed ${fmtDate(p.first)}`, p.last && `latest activity ${fmtDate(p.last)}`,
        `${fmtNum(p.records.length)} files`, p.gfa && `${fmtNum(p.gfa)} floor area`].filter(Boolean).join(' · ')}</p>
      ${servicingLineHTML(p)}
      ${p.description ? `<p class="desc-clamp">${esc(p.description)}</p>` : ''}
      ${employmentHTML(p)}
      ${cancelled ? `<p class="small">${dot('cancelled')} All files on this site are withdrawn, refused or cancelled.</p>` : ''}
      <details class="sect" open><summary><h2 class="section-title" data-info="aerial">Aerial check</h2></summary>
        <div class="aerial" id="aerial-check"></div></details>
      ${buildoutHTML(p)}
      ${servicingCheckHTML(p)}
      ${demandHTML(p)}
      <details class="sect"><summary><h2 class="section-title" data-info="phase-progress">Progress &amp; timeline</h2></summary>
        <ol class="stepper">${steps}</ol>
        ${phaseHistoryHTML(p)}
        <h3 class="sub-title" data-info="project-timeline">All dated events</h3>${timeline}</details>
      <details class="sect" open><summary><h2 class="section-title" data-info="source-records">Source records <span class="muted small">by type · ${fmtNum(p.records.length)}</span></h2></summary>
        ${recs}</details>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'dev';
    $('#detail').scrollTop = 0;
    runAerial(p);
  }

  // ---- Aerial check -------------------------------------------------------------------
  const aerialCache = new Map();
  function runAerial(p) {
    const box = $('#aerial-check');
    if (!box) return;
    if (!window.PeelAerial || !CFG.imagery || !CFG.imagery[p.municipality] || p.lat == null) {
      box.innerHTML = '<p class="small muted">No aerial imagery is set up for this location.</p>';
      return;
    }
    const show = r => { if (currentProject === p && $('#aerial-check')) renderAerial(r); };
    if (aerialCache.has(p.key)) return show(aerialCache.get(p.key));
    box.innerHTML = '<p class="small muted aerial-loading">Comparing aerial photos…</p>';
    PeelAerial.check(p, CFG, { phaseLabel: P.PHASE_BY_KEY[p.phase].label })
      .then(r => { aerialCache.set(p.key, r); show(r); })
      .catch(e => { if (currentProject === p && $('#aerial-check')) $('#aerial-check').innerHTML = `<p class="small muted">Aerial check unavailable: ${esc(e.message)}.</p>`; });
  }
  function renderAerial(a) {
    const box = $('#aerial-check');
    const r = a.result, pctv = Math.round(r.probability * 100);
    const cls = r.probability >= 0.7 ? 'hi' : r.probability >= 0.35 ? 'mid' : 'lo';
    const label = y => a.src.years[y].label;
    const fig = (ph, y, note) => ph ? `<figure><div class="aerial-img"></div><figcaption><strong>${esc(label(y))}</strong> ${note}</figcaption></figure>` : '';
    const arrow = e => e > 0 ? '<span class="sig up" aria-label="raises">▲</span>' : e < 0 ? '<span class="sig down" aria-label="lowers">▼</span>' : '<span class="sig" aria-hidden="true">•</span>';
    box.innerHTML = `
      <div class="aerial-head ${cls}">
        <div class="aerial-pct"><strong>${pctv}%</strong><span>likely completed</span></div>
        <div class="aerial-status">${esc(r.status)}</div>
      </div>
      <div class="aerial-meter" role="img" aria-label="${pctv}% likely completed"><span style="width:${pctv}%"></span></div>
      <div class="aerial-pair">
        ${fig(a.before, a.years.before, a.years.preStart ? '· before the application' : '· earliest available')}
        ${fig(a.latest, a.years.latest, '· latest')}
      </div>
      <ul class="aerial-signals">${r.signals.map(s => `<li>${arrow(s.effect)}<span>${esc(s.text)}</span></li>`).join('')}</ul>
      <p class="small muted">${esc(a.src.owner)} aerial photos. Site: ${esc(a.geom.source)} (yellow outline). Estimate from how much the site changed compared with its surroundings and how much building structure it shows${a.fp.now != null ? ', plus building footprints traced from the photos' : ''}; not a site inspection.</p>`;
    const slots = box.querySelectorAll('.aerial-img');
    const canvases = [a.before && a.before.canvas, a.latest.canvas].filter(Boolean);
    canvases.forEach((c, i) => slots[i] && slots[i].appendChild(c));
  }
  function closeDetail() { $('#detail').hidden = true; highlight(null); setDaContext(null); }
  $('#detail-close').onclick = closeDetail;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  // A single record (usually one building permit inside a subdivision) and the planning
  // application(s) it belongs to.
  function showRecordDetail(r, p) {
    setDaContext(p);
    const ph = P.PHASE_BY_KEY[r.phase];
    const parents = r.kind === 'permit' ? parentApps(r, p) : [];
    const parentHTML = r.kind !== 'permit' ? '' : parents.length
      ? parents.slice(0, 5).map(a => `
        <div class="parent-app">${dot(a.phase)}<div>
          <strong>${esc(a.ref || 'Application')}</strong> ${a.type ? `· ${esc(a.type)}` : ''}
          <div class="m">${esc(a.address || '')}${a.statusRaw ? ` · ${esc(a.statusRaw)}` : ''}${a.units ? ` · ${fmtNum(a.units)} units planned` : ''}</div>
          ${a.description ? `<div class="m">${esc(a.description.slice(0, 240))}${a.description.length > 240 ? '…' : ''}</div>` : ''}
        </div></div>`).join('')
      : '<p class="small muted">This permit is not inside any planning application in the data.</p>';
    const b = p.buildout;
    const others = sitePermits(p).length - 1;
    $('#detail-body').innerHTML = `
      <div class="head"><h3>${esc(r.address || r.ref || 'Record')}</h3>
        <div class="m">${esc(r.kind === 'permit' ? 'Building permit' : 'Planning application')} ${esc(r.ref)}${r.type ? ' · ' + esc(r.type) : ''} · ${esc(r.municipality)}</div>
        <span class="badge">${dot(r.phase)}${esc(ph.label)}</span></div>
      <button type="button" class="btn open-project" id="open-project">
        Open whole development: ${esc(p.title)}${b ? ` — ${fmtNum(b.planned)} planned, ${fmtNum(b.remaining)} left to build` : ''}${others > 0 ? ` · ${fmtNum(others)} other permits` : ''}
      </button>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <dl class="kv">
        ${r.statusRaw ? `<dt>Status</dt><dd>${esc(r.statusRaw)}</dd>` : ''}
        ${r.units ? `<dt>Units</dt><dd>${fmtNum(r.units)}</dd>` : ''}
        ${r.events.map(e => `<dt>${esc(P.humanizeField(e.label))}</dt><dd>${fmtDate(e.date)}</dd>`).join('')}
      </dl>
      ${r.kind === 'permit' ? `<h2 class="section-title" data-info="parent-app">Part of planning application</h2>${parentHTML}` : ''}
      ${r.kind === 'application' && p.records.length > 1 ? `<p class="small muted">This application is part of a larger development with ${fmtNum(p.records.length - 1)} other files.</p>` : ''}
      ${r.units > 0 ? demandHTML({ units: r.units, phase: r.phase, types: r.type ? [r.type] : [], description: r.description || '', unitMix: r.unitMix || null },
        r.kind === 'permit' ? '<p class="small muted">For the units on this permit only; open the whole development for the full site.</p>' : '') : ''}
      <h2 class="section-title">Source record</h2>
      <table class="rec-table">${recordRows(r)}</table>`;
    $('#open-project').onclick = () => showDetail(p);
    $('#detail').hidden = false; $('#detail').dataset.view = 'record';
    $('#detail').scrollTop = 0;
    highlight(p, r);
    if (r.lat != null) {
      map.setView([r.lat, r.lng], Math.max(map.getZoom(), 17), { animate: false });
      // Phones: centre the point in the part of the map left visible above the bottom sheet.
      if (innerWidth <= 760) {
        const m = map.getContainer().getBoundingClientRect();
        const visibleBottom = Math.min(m.bottom, $('#detail').getBoundingClientRect().top);
        const target = (visibleBottom - m.top) / 2;
        const now = map.latLngToContainerPoint([r.lat, r.lng]).y;
        map.panBy([0, now - target], { animate: false });
      }
    }
  }

  // "Show on map" from a project's record list.
  $('#detail-body').addEventListener('click', e => {
    const b = e.target.closest('[data-rec]'); if (!b || !currentProject) return;
    const r = currentProject.records.find(x => x.uid === b.dataset.rec);
    if (r) showRecordDetail(r, currentProject);
  });

  // ---- Export ----------------------------------------------------------------------
  function exportRows(list = state.filtered) {
    return list.map(p => ({
      address: p.title, municipality: p.municipality, phase: P.PHASE_BY_KEY[p.phase].label,
      ...Object.fromEntries(P.PHASES.map(s => [`${s.key}_date`, fmtDate(p.milestones[s.key])])),
      units: p.units ?? '',
      planned_units: p.buildout ? p.buildout.planned : '', permitted_units: p.buildout ? p.buildout.permitted : '',
      completed_units: p.buildout ? p.buildout.completed : '', left_to_build: p.buildout ? p.buildout.remaining : '',
      building_permits: p.records.filter(r => r.kind === 'permit').length,
      est_population: p.units ? Math.round(D.estimate([p], state.criteria).population) : '',
      ...(e => ({ employment_uses: e ? e.uses.map(u => u.label).join('; ') : '', nonres_floor_area_m2: e && e.totalM2 ? e.totalM2 : '', est_jobs: e && e.jobs ? e.jobs : '', ...(d => ({ emp_water_avg_lps: d ? +d.water.avg.toFixed(2) : '', emp_wastewater_peak_lps: d ? +d.wastewater.peak.toFixed(2) : '' }))(e && e.jobs ? D.employmentDemand(e.jobs, state.criteria) : null) }))(empOf(p)),
      gfa: p.gfa ?? '', types: p.types.join('; '),
      files: p.records.map(r => `${r.kind}:${r.ref}${r.statusRaw ? ` (${r.statusRaw})` : ''}`).join('; '),
      description: p.description, lat: p.lat?.toFixed(6) ?? '', lng: p.lng?.toFixed(6) ?? '',
    }));
  }
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name; document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }
  $('#btn-csv').onclick = () => {
    const rows = exportRows(); if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    download('peel-developments.csv', [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'), 'text/csv');
  };
  $('#btn-geojson').onclick = () => {
    const rows = exportRows();
    const fc = { type: 'FeatureCollection', features: rows.filter(r => r.lat).map(r => ({ type: 'Feature', geometry: { type: 'Point', coordinates: [+r.lng, +r.lat] }, properties: r })) };
    download('peel-developments.geojson', JSON.stringify(fc), 'application/geo+json');
  };

  // ---- Area selection: draw around projects, summarize demand and growth -----------------
  // A lasso drawn on the map (finger or mouse) selects the shown projects inside it; more
  // areas add to the selection. The summary opens in the side panel.
  const selection = new Map();          // project key -> project
  let selAreas = [];                    // drawn areas as [[lng, lat], ...] rings
  const selLayer = L.layerGroup().addTo(map);
  let lassoOn = false;
  const lassoSvg = L.DomUtil.create('div', 'lasso-layer', map.getContainer());
  lassoSvg.innerHTML = '<svg><path/></svg><div class="lasso-hint">Draw around the developments to select<span class="mouse-only"> · middle-drag to move the map · Esc to cancel</span></div>';
  L.DomEvent.disableClickPropagation(lassoSvg);
  function setLasso(on) {
    lassoOn = on;
    lassoSvg.classList.toggle('on', on);
    $('#sel-btn') && $('#sel-btn').classList.toggle('on', on);
    if (on) { map.dragging.disable(); if (innerWidth <= 760) closeDetail(); }
    else map.dragging.enable();
    lassoSvg.querySelector('path').setAttribute('d', '');
  }
  const SelectControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'leaflet-bar sel-ctl');
      el.dataset.info = 'select-tool';
      el.innerHTML = `<button type="button" id="sel-btn" title="Select an area: draw around developments to add up their servicing demand and growth" aria-label="Select an area">
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><rect x="2.5" y="2.5" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M10 9l7.5 3-3.2 1.2 2.6 2.6-1.3 1.3-2.6-2.6L11.8 17z" fill="currentColor"/></svg></button>`;
      L.DomEvent.disableClickPropagation(el);
      el.querySelector('button').onclick = () => setLasso(!lassoOn);
      return el;
    },
  });
  new SelectControl().addTo(map);

  // North arrow (points to true north whatever the orientation; tap to switch between the road
  // grid and north up) and a metric scale bar.
  const NorthControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'leaflet-bar north-ctl');
      el.dataset.info = 'north';
      el.innerHTML = `<button type="button" id="north-btn" title="North. Tap to switch between road grid and north up" aria-label="North arrow: switch orientation">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g id="north-rot"><path d="M12 2.5l4.5 11h-9z" fill="currentColor"/><path d="M12 21.5l-4.5-8h9z" fill="none" stroke="currentColor" stroke-width="1.2"/>
        <text x="12" y="12.2" text-anchor="middle" font-size="5.5" font-weight="700" fill="var(--surface-1)">N</text></g></svg></button>`;
      L.DomEvent.disableClickPropagation(el);
      el.querySelector('button').onclick = () => setOrientation(orientation === 'grid' ? 'north' : 'grid');
      return el;
    },
  });
  new NorthControl().addTo(map);
  L.control.scale({ position: 'topleft', metric: true, imperial: false, maxWidth: 110 }).addTo(map);
  function updateNorth() {
    const g = document.getElementById('north-rot');
    if (g) g.setAttribute('transform', `rotate(${canRotate ? map.getBearing() : 0} 12 12)`);
  }
  map.on('rotate', updateNorth);
  updateNorth();

  let pts = null;
  const rel = e => { const b = map.getContainer().getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  // While the lasso is on, the middle mouse button drags the map (left button draws).
  let pan = null;
  lassoSvg.addEventListener('pointerdown', e => {
    if (!lassoOn) return;
    lassoSvg.setPointerCapture(e.pointerId); e.preventDefault();
    if (e.pointerType === 'mouse' && e.button === 1) { pan = [e.clientX, e.clientY]; lassoSvg.classList.add('panning'); return; }
    if (pan || (e.pointerType === 'mouse' && e.button !== 0)) return;
    pts = [rel(e)];
  });
  // No middle-click autoscroll / paste over the map while drawing.
  lassoSvg.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
  lassoSvg.addEventListener('auxclick', e => { if (e.button === 1) e.preventDefault(); });
  lassoSvg.addEventListener('pointermove', e => {
    if (pan) {
      const dx = e.clientX - pan[0], dy = e.clientY - pan[1];
      if (dx || dy) { map.panBy([-dx, -dy], { animate: false }); pan = [e.clientX, e.clientY]; }
      return;
    }
    if (!pts) return;
    const q = rel(e), l = pts[pts.length - 1];
    if (Math.hypot(q[0] - l[0], q[1] - l[1]) < 4) return;
    pts.push(q);
    lassoSvg.querySelector('path').setAttribute('d', `M${pts.map(p => p.join(',')).join('L')}Z`);
  });
  lassoSvg.addEventListener('pointerup', e => {
    if (pan) { if (e.button === 1 || !(e.buttons & 4)) { pan = null; lassoSvg.classList.remove('panning'); } return; }
    const ring = pts; pts = null;
    setLasso(false);
    if (!ring || ring.length < 3) return;
    const closed = [...ring, ring[0]];
    let added = 0;
    for (const p of state.filtered) {
      if (p.lat == null || selection.has(p.key)) continue;
      const c = map.latLngToContainerPoint([p.lat, p.lng]);
      if (P.pointInRings(c.x, c.y, [closed])) { selection.set(p.key, p); added++; }
    }
    const geo = closed.map(([x, y]) => { const ll = map.containerPointToLatLng([x, y]); return [ll.lng, ll.lat]; });
    selAreas.push(geo);
    drawSelection();
    showSelection(added);
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && lassoOn) { pts = null; setLasso(false); } });

  function drawSelection() {
    selLayer.clearLayers();
    for (const g of selAreas) L.polygon(g.map(([x, y]) => [y, x]), { className: 'sel-area', interactive: false }).addTo(selLayer);
    for (const p of selection.values()) L.circleMarker([p.lat, p.lng], { radius: 10, className: 'sel-ring', interactive: false }).addTo(selLayer);
  }
  function clearSelection() { selection.clear(); selAreas = []; drawSelection(); }

  function showSelection(added) {
    setDaContext(null);
    const sel = [...selection.values()];
    currentProject = null;
    highlight(null);
    if (!sel.length) {
      $('#detail-body').innerHTML = `<div class="head"><h3>No developments in that area</h3></div>
        <p class="small muted">Only the developments shown on the map (current phase, focus and filters) can be selected. Draw a larger area, or change the filters.</p>
        <div class="sel-actions"><button type="button" class="btn" data-sel="add">Draw again</button></div>`;
      $('#detail').hidden = false;
      return;
    }
    const c = state.criteria;
    const cols = [['all', 'Total'], ['completed', 'Completed'], ['unbuilt', 'Remaining']];
    const es = cols.map(([k]) => D.estimate(sel, c, k, jobsOf));
    const row = (label, f) => `<tr><td>${label}</td>${es.map(e => `<td>${f(e)}</td>`).join('')}</tr>`;
    const sub = t => `<tr class="sub"><td colspan="4">${t}</td></tr>`;
    // Build-out
    const bo = { planned: 0, permitted: 0, completed: 0, remaining: 0 };
    for (const p of sel) if (p.buildout) for (const k in bo) bo[k] += p.buildout[k];
    const tile = (cls, label, value, subTxt) => `<div class="sum-tile ${cls}"><div class="sl">${label}</div><div class="sv">${value}</div>${subTxt ? `<div class="ss">${subTxt}</div>` : ''}</div>`;
    const total = Math.max(bo.planned, bo.permitted);
    const pc = v => total ? `${Math.round(v / total * 100)}%` : '';
    // Growth since the census, and the census population whose DA centre is inside the areas.
    let growth = '';
    const bc = baselineCensus();
    if (bc) {
      const gr = PeelAreas.growthSince(sel, {}, bc.date, c);
      let pop = 0, dw = 0, nDa = 0;
      for (const d of bc.das) {
        if (selAreas.some(g => P.pointInRings(d.lng, d.lat, [g]))) { pop += d.pop; dw += d.dw; nDa++; }
      }
      const g = (label, cls, units, people, note) => `<div class="sum-tile ${cls}"><div class="sl">${label}</div><div class="sv">+${fmtNum(Math.round(people))}</div><div class="ss">people · +${fmtNum(units)} units${note ? ` · ${note}` : ''}</div></div>`;
      const layers = [['base', pop], ['built', gr.built.population], ['approved', gr.approved.population], ['proposed', gr.proposed.population]];
      const sum = layers.reduce((t, l) => t + l[1], 0);
      growth = `<details class="sect" open><summary><h2 class="section-title" data-info="census">Growth since ${bc.year}</h2>
          <span class="muted small sect-sum">${nDa ? `${fmtNum(Math.round(pop))} → ${fmtNum(Math.round(sum))} people` : ''}</span></summary>
        <div class="sum-tiles">
          ${nDa ? `<div class="sum-tile"><div class="sl">${bc.year} Census</div><div class="sv">${fmtNum(Math.round(pop))}</div><div class="ss">people · ${fmtNum(nDa)} DA${nDa === 1 ? '' : 's'}</div></div>` : ''}
          ${g('Built since', 's-done', gr.built.units, gr.built.population)}
          ${g('Approved', 's-perm', gr.approved.units, gr.approved.population, 'not yet built')}
          ${g('Proposed', 's-left', gr.proposed.units, gr.proposed.population, 'in review')}
        </div>
        ${sum > 0 ? `<div class="grow-bar sel-grow" role="img" aria-label="Growth layers">${layers.filter(l => l[1] > 0).map(([k, v]) => `<span class="gseg g-${k}" style="flex:${v}" title="${fmtNum(Math.round(v))} people"></span>`).join('')}</div>` : ''}
        <p class="small muted">${nDa ? 'Census: dissemination areas whose centre falls inside the drawn area(s). ' : ''}Built = units on permits completed since census day; approved = committed growth; proposed = applications in pre-consultation or review. People at Peel persons-per-unit.</p>
      </details>`;
    }
    const byUnits = sel.slice().sort((a, b) => (b.units || 0) - (a.units || 0));
    const list = byUnits.map(p => `<li><button type="button" class="sel-item" data-open="${esc(p.key)}">${dot(p.phase)}<span class="t">${esc(p.title)}</span>
        <span class="u">${p.buildout ? `${fmtNum(p.buildout.planned)} planned` : p.units ? `${fmtNum(p.units)} units` : empOf(p) && empOf(p).totalM2 ? `${fmtNum(empOf(p).totalM2)} m²` : ''}</span></button>
        <button type="button" class="sel-x" data-drop="${esc(p.key)}" aria-label="Remove ${esc(p.title)} from the selection">×</button></li>`).join('');
    $('#detail-body').innerHTML = `
      <div class="head"><h3 data-info="selection">${fmtNum(sel.length)} selected development${sel.length === 1 ? '' : 's'}</h3>
        <div class="m">${fmtNum(selAreas.length)} drawn area${selAreas.length === 1 ? '' : 's'}${added != null ? ` · ${fmtNum(added)} added` : ''} · ${esc([...new Set(sel.map(p => p.municipality))].join(', '))}</div></div>
      <div class="sel-actions">
        <button type="button" class="btn" data-sel="add">+ Add area</button>
        <button type="button" class="btn" data-sel="csv">Export CSV</button>
        <button type="button" class="btn" data-export="pdf" data-scope="dev">PDF / print</button>
        <button type="button" class="btn" data-export="xlsx" data-scope="dev">Excel</button>
        <button type="button" class="btn" data-sel="clear">Clear</button>
      </div>
      <div class="summary" data-info="buildout"><div class="sum-tiles">
        ${tile('s-plan', 'Planned', fmtNum(bo.planned), 'units')}
        ${tile('s-perm', 'Permitted', fmtNum(bo.permitted), pc(bo.permitted))}
        ${tile('s-done', 'Completed', fmtNum(bo.completed), pc(bo.completed))}
        ${tile('s-left', 'Left to build', fmtNum(bo.remaining), 'no permit yet')}
      </div>
      <table class="dt type-table" data-info="unit-types"><thead><tr><th></th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead>
        <tbody>${aggTypeRowsHTML(aggregateTypes(sel))}</tbody></table></div>
      <details class="sect" open><summary><h2 class="section-title" data-info="project-demand">Servicing demand</h2>
          <span class="muted small sect-sum">residential + employment</span></summary>
        <table class="dt demand-table"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
          ${row('Units', e => fmtNum(Math.round(e.totalUnits)))}
          ${row('Population', e => fmtNum(Math.round(e.population)))}
          ${row('Jobs', e => fmtNum(Math.round(e.employment.jobs)))}
          ${sub('Water (L/s)')}
          ${row('Average day', e => fmt1(e.combined.water.avg))}
          ${row('Max day', e => fmt1(e.combined.water.maxDay))}
          ${row('Peak hour', e => fmt1(e.combined.water.peakHour))}
          ${sub('Wastewater (L/s)')}
          ${row('Average dry weather', e => fmt1(e.combined.wastewater.avg))}
          ${row('Peak dry', e => fmt1(e.combined.wastewater.peak))}
          ${row('I&amp;I', e => fmt1(e.combined.wastewater.infiltration))}
          ${row('Peak wet weather', e => fmt1(e.combined.wastewater.wetPeak))}
        </tbody></table>
        <details class="sel-split"><summary>Residential / employment split (total)</summary><div class="sel-flows">${flowTablesHTML(es[0])}</div></details>
        <p class="small muted">Peaks for the selection as one area (Harmon on its combined population). Completed = units on finished permits; remaining = the rest. Criteria as in the bottom panel.</p>
      </details>
      ${growth}
      <details class="sect"><summary><h2 class="section-title">Developments</h2><span class="muted small sect-sum">${fmtNum(sel.length)} · largest first</span></summary>
        <ul class="sel-list">${list}</ul></details>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'sel';
    $('#detail').scrollTop = 0;
  }
  $('#detail-body').addEventListener('click', e => {
    const a = e.target.closest('[data-sel]');
    if (a) {
      const k = a.dataset.sel;
      if (k === 'add') setLasso(true);
      else if (k === 'clear') { clearSelection(); closeDetail(); }
      else if (k === 'csv') {
        const rows = exportRows([...selection.values()]); if (!rows.length) return;
        const cols = Object.keys(rows[0]);
        const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
        download('peel-selection.csv', [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'), 'text/csv');
      } else if (k === 'back') showSelection();
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o && selection.has(o.dataset.open)) { showDetail(selection.get(o.dataset.open)); return; }
    const d = e.target.closest('[data-drop]');
    if (d) { selection.delete(d.dataset.drop); drawSelection(); showSelection(); }
  });

  // ---- Events ----------------------------------------------------------------------
  function togglePhase(key) {
    const only = state.phases.size === 1 && state.phases.has(key);
    state.phases = new Set(only ? P.ALL_PHASES.map(p => p.key) : [key]);
    applyFilters();
  }
  $('#pipeline').onclick = e => { const b = e.target.closest('[data-phase]'); if (b) togglePhase(b.dataset.phase); };

  let searchTimer;
  $('#f-search').oninput = e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = e.target.value.trim().toLowerCase(); applyFilters(); }, 200); };
  $('#f-kind').onchange = e => { state.kind = e.target.value; applyFilters(); };
  $('#f-new').onchange = e => { state.newOnly = e.target.checked; applyFilters(); };
  $('#f-units').onchange = e => { const v = e.target.value; state.minUnits = v === 'left' || v === 'committed' ? v : Number(v) || 0; applyFilters(); };

  // Municipality chips (built from the data).
  function renderMuniChips() {
    const list = [''].concat(state.munis || []);
    $('#f-muni-chips').innerHTML = list.map(m =>
      `<button type="button" class="chip${state.muni === m ? ' on' : ''}" data-muni="${esc(m)}" data-info="muni-${esc(m || 'all')}" aria-pressed="${state.muni === m}">${esc(m || 'All')}</button>`).join('');
  }
  $('#f-muni-chips').onclick = e => {
    const b = e.target.closest('[data-muni]'); if (!b) return;
    state.muni = b.dataset.muni;
    // An area in another municipality no longer applies.
    const keep = id => !id || !state.muni || (areaById.get(id) || {}).municipality === state.muni;
    state.sp = state.sp.filter(keep);
    if (!keep(state.mtsa)) state.mtsa = '';
    renderMuniChips();
    renderAreaSelects();
    showArea();
    applyFilters();
  };

  // ---- Water pressure zones and wastewater drainage areas (data/servicing.json) -----------
  // Pressure zones are the Region's published polygons; drainage areas are traced from the
  // Region's sanitary sewer network (scripts/build-servicing.js). Both tag every project (by its
  // location point), filter the map, group the demand and show in the project panel.
  const svcById = new Map();
  map.createPane('svcPane', map.getPane('rotatePane') || undefined).style.zIndex = 360;
  const svcRenderer = L.canvas({ pane: 'svcPane', padding: 0.3 });
  const svcSelLayer = L.layerGroup().addTo(map);
  async function loadServicing() {
    try {
      const res = await fetch('data/servicing.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const d = await res.json();
      state.servicing = { zones: PeelAreas.prepare(d.pressureZones), drainage: PeelAreas.prepare(d.drainageAreas), meta: d };
      // Optional: census shares by area overlap and the Region's 2025 annual report figures.
      const opt = async f => { try { const r = await fetch(f, { cache: 'no-cache' }); return r.ok ? r.json() : null; } catch (e) { return null; } };
      [state.svcCensus, state.reports] = await Promise.all([opt('data/svc-census.json'), opt('data/peel-reports.json')]);
      renderRefs();
      for (const a of [...state.servicing.zones, ...state.servicing.drainage]) svcById.set(a.id, a);
      $('#f-svc-row').hidden = false;
      tagServicing();
      renderSvcSelects();
      for (const k of ['pz', 'dr']) if (svcOn[k]) setSvcLayer(k, true);
      applyFilters();
    } catch (e) { /* optional */ }
  }
  function tagServicing() {
    if (!state.servicing) return;
    for (const p of state.projects) {
      p.pz = PeelAreas.locate(state.servicing.zones, p.lng, p.lat);
      p.dr = PeelAreas.locate(state.servicing.drainage, p.lng, p.lat);
    }
  }
  function renderSvcSelects() {
    if (!state.servicing) return;
    const { zones, drainage } = state.servicing;
    $('#f-pz').innerHTML = `<option value="">All pressure zones</option>` + zones.slice().sort(byZone).map(z => `<option value="${esc(z.id)}"${z.id === state.pz ? ' selected' : ''}>${esc(z.name)}</option>`).join('');
    const plants = [...new Set(drainage.map(d => d.plant))];
    $('#f-dr').innerHTML = `<option value="">All drainage areas</option>` + plants.map(pl => `<optgroup label="${esc(plantLabel(pl))}">${drainage.filter(d => d.plant === pl)
      .map(d => `<option value="${esc(d.id)}"${d.id === state.dr ? ' selected' : ''}>${esc(drName(d))}</option>`).join('')}</optgroup>`).join('');
  }
  $('#f-pz').onchange = e => { state.pz = e.target.value; showSvcArea(true); applyFilters(); };
  $('#f-dr').onchange = e => { state.dr = e.target.value; showSvcArea(true); applyFilters(); };
  // Outline the chosen zone / area and zoom to it.
  function showSvcArea(zoom) {
    svcSelLayer.clearLayers();
    let bounds = null;
    for (const id of [state.pz, state.dr].filter(Boolean)) {
      const a = svcById.get(id); if (!a) continue;
      const l = L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), { className: 'area-outline', interactive: false }).addTo(svcSelLayer);
      bounds = bounds ? bounds.extend(l.getBounds()) : l.getBounds();
    }
    if (zoom && bounds) map.fitBounds(bounds, { padding: [30, 30] });
  }
  const svcColor = a => a.zone ? '#0b7285' : PLANT_COLOR[a.plant] || '#868e96';
  function svcTooltip(a) {
    if (a.zone) return `<strong>${esc(a.name)}</strong><br><span class="muted">Region of Peel water pressure zone</span>`;
    return `<strong>${esc(drName(a))}</strong><br>Drains to ${esc(plantLabel(a.plant))}${a.outlet ? ` via ${esc(a.outlet)}` : ''}<br>
      <span class="muted">${fmtNum(a.areaHa)} ha · ${fmtNum(a.manholes)} manholes${a.trunkMm ? ` · outlet ${a.trunkMm} mm` : ''} · traced from the sewer network</span>`;
  }
  function setSvcLayer(k, on) {
    svcOn[k] = on; store.set(`svc-${k}`, on);
    if (!on) { if (svcLayers[k]) map.removeLayer(svcLayers[k]); return; }
    if (!state.servicing) return;
    if (!svcLayers[k]) {
      const list = k === 'pz' ? state.servicing.zones : state.servicing.drainage;
      svcLayers[k] = L.featureGroup(list.map(a => L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), {
        renderer: svcRenderer, pane: 'svcPane', color: svcColor(a), weight: k === 'pz' ? 1.6 : 1.3, opacity: 0.85,
        dashArray: k === 'pz' ? '6 4' : null, fill: true, fillColor: svcColor(a), fillOpacity: k === 'pz' ? 0.03 : 0.07,
      }).bindTooltip(svcTooltip(a), { sticky: true, className: 'pt' })));
    }
    svcLayers[k].addTo(map);
  }
  // Servicing check for one development (development panel): its own flows at Peel design
  // criteria (FSR basis), its pressure zone, the sewer path from its catchment down to the plant
  // with its share of the flow at each outlet, and what it means for the plant's uncommitted
  // reserve capacity.
  function servicingCheckHTML(p) {
    const M = state.svcModel;
    if (!state.servicing || !M) return servicingLineHTML(p);
    const c = state.criteria, e = D.estimate([p], c, 'all', jobsOf), cb = e.combined;
    if (!(e.totalUnits > 0 || e.employment.jobs > 0)) return servicingLineHTML(p);
    const mld = D.toMLd, ls = uLs, pct = (a, b) => b > 0 ? `${(a / b * 100) < 1 ? (a / b * 100).toFixed(2) : Math.round(a / b * 100)}%` : '–';
    const layer = p.phase === 'completed' ? 'built' : D.COMMITTED_PHASES.has(p.phase) ? 'approved' : (p.phase === 'inception' || p.phase === 'review') ? 'proposed' : null;
    const layerText = { built: 'built — part of the existing flow', approved: 'approved — already committed', proposed: 'proposed — not yet committed; it would draw on the reserve' }[layer] || 'withdrawn — not counted';
    // Water: its pressure zone.
    const z = (p.pz || []).map(id => svcById.get(id)).filter(Boolean)[0];
    const zl = z && M.zones.get(z.id);
    const zMax = zl ? M.wMax(M.total(zl), M.jobs(zl)) : 0;
    const water = `<tr><td>Water · ${z ? esc(z.name.replace('Pressure zone ', 'Zone ')) : 'no pressure zone'}</td><td>${ls(cb.water.avg)}<small>${uML(mld(cb.water.avg))}</small></td><td>${ls(cb.water.maxDay)}<small>${uML(mld(cb.water.maxDay))}</small></td><td>${ls(cb.water.peakHour)}</td><td>${zl ? `${pct(mld(cb.water.maxDay), zMax)} of the zone's build-out max day (${uML(zMax)})` : ''}</td></tr>`;
    const sewer = `<tr><td>Wastewater</td><td>${ls(cb.wastewater.avg)}<small>${uML(mld(cb.wastewater.avg))}</small></td><td>${ls(cb.wastewater.peak)}<small>peak dry</small></td><td>${ls(cb.wastewater.wetPeak)}<small>peak wet</small></td><td></td></tr>`;
    // Sewer path to the plant.
    let d = (p.dr || []).map(id => svcById.get(id)).filter(Boolean)[0];
    const path = []; const seen = new Set();
    while (d && !seen.has(d.id)) { seen.add(d.id); path.push(d); d = d.downstream ? svcById.get(d.downstream) : null; }
    const devAvg = mld(cb.wastewater.avg);
    const pathRows = path.map((a, i) => {
      const l = M.cum.get(a.id), f = M.fOf(a.plant), out = l ? M.adwf(l, f) : 0;
      return `<tr><td>${i ? '↳ ' : ''}${a.kind === 'plant' ? `${esc(plantLabel(a.plant))} inflow` : esc(drName(a).replace(/^[^·]+· /, ''))}<small>${a.kind === 'ps' ? 'pumping station — capacity not published' : a.kind === 'trunk' ? `trunk${a.trunkMm ? ` ${a.trunkMm} mm` : ''} outlet` : a.kind === 'plant' ? 'reaches the plant' : 'City of Toronto system'}</small></td><td>${uML(out)}</td><td>${pct(devAvg * f, out)}</td></tr>`;
    }).join('');
    const pl = path.length ? path[path.length - 1].plant : null, cap = pl && M.plantCap(pl);
    let plant = '';
    if (cap) {
      const reserve = cap.rated - cap.committed, use = devAvg * cap.f;
      plant = `<p class="small svc-verdict"><strong>${esc(cap.name)}</strong>: rated ${uML(cap.rated)}; existing + approved ${pct(cap.committed, cap.rated)} (${uML(cap.committed)}); uncommitted reserve <strong>${uML(reserve)}</strong>${M.mode === 'calibrated' ? ' (capacity check)' : ' (design flows)'}.
        This development is <strong>${layerText}</strong>. Its average dry weather flow ${M.mode === 'calibrated' && cap.f !== 1 ? `at the plant's measured rate (×${cap.f.toFixed(2)}) ` : ''}is ${uML(use)}${reserve > 0 ? ` = <strong>${pct(use, reserve)}</strong> of the reserve` : ' — the plant is already over-committed'}.</p>`;
    } else if (pl === 'Toronto') plant = '<p class="small svc-verdict">Drains to the City of Toronto system (Malton): capacity is Toronto\'s, not in Peel\'s plant figures.</p>';
    return `<details class="sect" open><summary><h2 class="section-title" data-info="servicing-check">Servicing check</h2><span class="muted small sect-sum">${z ? esc(z.name.replace('Pressure zone ', 'Zone ')) : ''}${pl ? ` · ${esc(plantLabel(pl))}` : ''}</span></summary>
      ${exportBar('dev')}
      <table class="dt chk-table"><thead><tr><th>Whole development<br><span class="muted">Peel design criteria</span></th><th>Average</th><th>Max day / peak</th><th>Peak hour / wet</th><th></th></tr></thead><tbody>${water}${sewer}</tbody></table>
      ${path.length ? `<table class="dt chk-table"><caption>Sewer path to the plant · build-out average dry weather at each outlet (${M.mode === 'calibrated' ? 'capacity check' : 'design flows'})</caption><thead><tr><th>Catchment outlet</th><th>Flow at outlet</th><th>This development</th></tr></thead><tbody>${pathRows}</tbody></table>` : '<p class="small muted">Not in a traced drainage area.</p>'}
      ${plant}
      <p class="small muted">${fmtNum(Math.round(e.totalUnits))} units, ${fmtNum(roundPop(e.population))} people${e.employment.jobs > 0 ? `, ${fmtNum(Math.round(e.employment.jobs))} jobs` : ''} at build-out; flows in L/s as in a functional servicing report, ML/d below. Downstream pumping station and trunk capacities are not published by the Region, so only the plant is checked against capacity.</p></details>`;
  }
  // Project panel line: its pressure zone and drainage area.
  function servicingLineHTML(p) {
    if (!state.servicing) return '';
    const z = (p.pz || []).map(id => svcById.get(id)).filter(Boolean), d = (p.dr || []).map(id => svcById.get(id)).filter(Boolean);
    if (!z.length && !d.length) return '<p class="small muted svc-line" data-info="drainage-area">Outside the mapped pressure zones and traced drainage areas.</p>';
    return `<p class="small svc-line" data-info="drainage-area"><strong>Servicing:</strong> ${z.length ? esc(z.map(a => a.name).join(', ')) : 'no pressure zone'} · ${d.length
      ? esc(d.map(a => `${drName(a)} → ${plantLabel(a.plant)}`).join(', ')) : 'no traced drainage area'}</p>`;
  }
  // Pressure zones in numerical order (1, 2, 2A, 3 … 9, CE9, 12A, 13B, AV13).
  const zoneKey = z => { const m = String(z.zone || '').match(/^([A-Z]*)(\d+)(.*)$/i); return m ? [Number(m[2]), m[1] ? 1 : 0, m[1] + m[3]] : [999, 0, String(z.zone)]; };
  const byZone = (a, b) => { const x = zoneKey(a), y = zoneKey(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };

  // ---- Servicing areas tab: demand by pressure zone and by sanitary catchment, in layers ----
  // Like the Growth tab: the baseline census (year from the timeline) plus growth built since
  // census day, approved and proposed (in review), from every development located in the zone /
  // catchment; other filters are ignored. Census population is counted by the dissemination
  // areas whose centre falls in the zone / catchment. Residential demand at Peel per-capita rates.
  // Census population per zone / drainage area: shares by area overlap (data/svc-census.json,
  // scripts/build-svc-census.js) when published for the census year, else the DA centre point.
  function svcCensusPop(bc) {
    if (bc._svcPop) return bc._svcPop;
    const pop = new Map(), add = (id, v) => pop.set(id, (pop.get(id) || 0) + v);
    const ov = state.svcCensus && state.svcCensus.years[bc.year];
    if (ov && ov.length === bc.das.length) {
      const z = state.svcCensus.zones, w = state.svcCensus.drainage;
      bc.das.forEach((d, i) => { for (const [k, s] of ov[i][0]) add(z[k], d.pop * s); for (const [k, s] of ov[i][1]) add(w[k], d.pop * s); });
      bc._svcMethod = 'overlap';
    } else {
      const { zones, drainage } = state.servicing;
      for (const d of bc.das) for (const id of [...PeelAreas.locate(zones, d.lng, d.lat), ...PeelAreas.locate(drainage, d.lng, d.lat)]) add(id, d.pop);
      bc._svcMethod = 'centre';
    }
    return (bc._svcPop = pop);
  }
  // Jobs on development sites, by layer: built = completed since census day, approved =
  // committed (approved to under construction), proposed = in pre-consultation or review.
  // Existing employment is not in the census baseline.
  function svcJobs(devs, censusDate) {
    const since = +new Date(`${censusDate}T00:00:00Z`), j = { jbuilt: 0, japproved: 0, jproposed: 0 };
    for (const p of devs) {
      const n = jobsOf(p); if (!(n > 0)) continue;
      if (p.phase === 'completed') { if (+p.milestones.completed >= since) j.jbuilt += n; }
      else if (D.COMMITTED_PHASES.has(p.phase)) j.japproved += n;
      else if (p.phase === 'inception' || p.phase === 'review') j.jproposed += n;
    }
    return j;
  }
  function svcLayerTotals(key, a, bc) {
    const devs = state.projects.filter(p => p.phase !== 'cancelled' && (p[key] || []).includes(a.id));
    const gr = PeelAreas.growthSince(devs, {}, bc.date, state.criteria);
    return { census: svcCensusPop(bc).get(a.id) || 0, built: gr.built.population, approved: gr.approved.population, proposed: gr.proposed.population,
      ...svcJobs(devs, bc.date),
      // Developments = sites with a planning application (stand-alone permits still count in Built since).
      units: gr.built.units + gr.approved.units + gr.proposed.units, devs: devs.filter(p => p.kinds.includes('application')).length };
  }
  const SUM_KEYS = ['census', 'built', 'approved', 'proposed', 'jbuilt', 'japproved', 'jproposed', 'units', 'devs'];
  const addLayers = (rows) => rows.reduce((t, r) => { for (const k of SUM_KEYS) t[k] = (t[k] || 0) + (r[k] || 0); return t; }, {});
  const LAYER_KEYS = ['census', 'built', 'approved', 'proposed'];
  const JOB_KEY = { census: null, built: 'jbuilt', approved: 'japproved', proposed: 'jproposed' };
  // Stacked bar for a row: census / built / approved / proposed as shares of its build-out
  // (the full bar = build-out; the numbers carry the size).
  function svcBar(l) {
    const t = l.census + l.built + l.approved + l.proposed, max = t || 1;
    const seg = (k, cls, label) => l[k] > 0 ? `<span class="gseg ${cls}" style="width:${(100 * l[k] / max).toFixed(2)}%" title="${label}: ${fmtNum(Math.round(l[k]))} people"></span>` : '';
    return `<div class="svc-bar" role="img" aria-label="Build-out ${fmtNum(Math.round(t))} people">${seg('census', 'g-base', 'Census')}${seg('built', 'g-built', 'Built since')}${seg('approved', 'g-approved', 'Approved')}${seg('proposed', 'g-proposed', 'Proposed')}</div>`;
  }
  const svcLegend = Y => `<ul class="grow-legend svc-legend"><li><span class="gsw g-base"></span>${Y} Census</li><li><span class="gsw g-built"></span>Built since</li><li><span class="gsw g-approved"></span>Approved</li><li><span class="gsw g-proposed"></span>Proposed (in review)</li><li class="muted">Each bar is the row's build-out population, split by layer · click a row to zoom to it on the map</li></ul>`;
  // Drainage areas as a tree along the sewer flow path (data/servicing.json: downstream).
  function svcFlowTree() {
    const ids = new Set(state.servicing.drainage.map(d => d.id));
    const kids = new Map();
    for (const d of state.servicing.drainage) {
      const to = d.downstream && ids.has(d.downstream) ? d.downstream : null;
      if (to) (kids.get(to) || kids.set(to, []).get(to)).push(d);
    }
    return kids;
  }
  const upstreamOf = (id, kids) => { const out = []; const walk = i => { for (const c of kids.get(i) || []) { out.push(c); walk(c.id); } }; walk(id); return out; };
  // View options: wastewater 'design' (Peel criteria) or 'calibrated' (each plant scaled to its
  // 2025 reported average flow); water max day factor 'design' or 'observed' (2025 South Peel).
  const svcOpt = { ww: store.get('svcWwMode', 'calibrated'), md: store.get('svcMdMode', 'design'), div: store.get('svcDivert', 'off'), tech: store.get('svcTech', 'off') };
  const optSwitch = (key, label, opts) => `<div class="svc-switch" role="group" aria-label="${esc(label)}"><span class="muted small">${label}</span>${opts.map(([v, t]) =>
    `<button type="button" class="btn small${svcOpt[key] === v ? ' on' : ''}" data-svcopt="${key}" data-v="${v}" aria-pressed="${svcOpt[key] === v}">${t}</button>`).join('')}</div>`;
  const refLink = (r, pages) => { const rep = state.reports && state.reports.reports[r]; return rep ? `<a href="${esc(rep.url)}" target="_blank" rel="noopener">${esc(rep.title)}</a>${pages ? ` (${esc(pages)})` : ''}` : ''; };
  // Which criteria and data a table rests on, with a badge when the criteria were edited.
  const CRIT_LABEL = { ppu: 'Persons per unit', water: 'Water', wastewater: 'Wastewater', employment: 'Employment', m2PerJob: 'Floor space per job' };
  function criteriaChanges() {
    const out = [], c = state.criteria, d = D.DEFAULT_CRITERIA;
    for (const g of Object.keys(d)) for (const k of Object.keys(d[g])) if (c[g] && +c[g][k] !== +d[g][k]) out.push(`${CRIT_LABEL[g] || g} ${k} ${c[g][k]} (default ${d[g][k]})`);
    return out;
  }
  function stampHTML(kind, Y) {
    const c = state.criteria, E = c.employment, R = state.reports;
    const crit = kind === 'demand'
      ? `water ${c.water.avg} L/cap/d (×${c.water.maxDay} max day, ×${c.water.peakHour} peak hour), wastewater ${c.wastewater.avg} L/cap/d with Harmon peaking, I&amp;I ${c.wastewater.infiltration} L/s/ha; employment ${E.water} / ${E.wastewater} L/emp/d`
      : kind === 'water'
      ? `residential ${c.water.avg} L/cap/d, max day ×${c.water.maxDay}, peak hour ×${c.water.peakHour} (Peel Watermain Design Criteria / FSR requirements); employment ${E.water} L/emp/d`
      : `residential ${c.wastewater.avg} L/cap/d with Harmon peaking, I&amp;I ${c.wastewater.infiltration} L/s/ha (Peel Linear Wastewater Standards 2023); employment ${E.wastewater} L/emp/d (Peel Modelling Demand Table, Aug 2024)`;
    const mod = criteriaChanges();
    if (Y == null) { const bc = baselineCensus(); Y = bc ? bc.year : 2021; }
    const dates = [state.snapshot ? `applications ${state.snapshot.generatedAt.slice(0, 10)}` : 'applications live', `${Y} Census`, R ? `Peel ${R.year} annual reports` : null].filter(Boolean).join(' · ');
    return `<p class="stamp small"><span><strong>Criteria:</strong> ${crit}; persons per unit from Peel's DC Background Study.</span>${mod.length ? ` <span class="badge-mod" title="${esc(mod.join('; '))}">Modified criteria (${mod.length})</span>` : ''} <span class="muted">Data: ${esc(dates)}</span></p>`;
  }
  function renderSvcTab() {
    const bc = baselineCensus();
    const has = !!(state.servicing && bc);
    $('#ftab-water').hidden = $('#ftab-ww').hidden = !has;
    if (!has) return;
    const c = state.criteria, E = c.employment, Y = bc.year, R = state.reports;
    $('#footer').classList.toggle('show-tech', svcOpt.tech === 'on');
    svcCensusPop(bc);
    const censusHow = bc._svcMethod === 'overlap' ? 'shared out by the area of each dissemination area inside it' : 'by dissemination areas whose centre falls inside';
    const total = l => l.census + l.built + l.approved + l.proposed;
    const jobs = l => (l.jbuilt || 0) + (l.japproved || 0) + (l.jproposed || 0);
    const jobsK = (l, k) => JOB_KEY[k] ? (l[JOB_KEY[k]] || 0) : 0;
    const who = (people, j) => `${uPop(people)}${j > 0 ? ` · ${unit(fmtNum(Math.round(j)), 'jobs')}` : ''}`;
    const cell = (mld, people, j, cls = '') => `<td class="${cls}">${uML(mld)}${people != null ? `<small>${who(people, j)}</small>` : ''}</td>`;
    const focus = svcFocus.id;
    const rowAttrs = (id, cls) => id ? ` class="${cls} svc-row${id === focus ? ' on' : ''}" data-svc="${esc(id)}" tabindex="0"` : ` class="${cls}"`;
    const layerHead = `<th>${Y} Census</th><th>+ Built since</th><th>+ Approved</th><th>+ Proposed (in review)</th><th>Build-out</th>`;

    // ---- Water: maximum day (ML/d) by layer, peak hour at build-out; residential + employment.
    const sp = R && R.water.southPeel;
    const observed = svcOpt.md === 'observed' && sp;
    const mdR = observed ? sp.maxDayFactor : c.water.maxDay, mdE = observed ? sp.maxDayFactor : E.maxDay;
    const wAvg = (p, j) => (p * c.water.avg + j * E.water) / 1e6;
    const wMax = (p, j) => (p * c.water.avg * mdR + j * E.water * mdE) / 1e6;
    const wPH = (p, j) => (p * c.water.avg * c.water.peakHour + j * E.water * E.peakHour) / 1e6;
    const wRow = (name, l, id, cls = '') => `<tr${rowAttrs(id, cls)}><td>${name}</td><td class="bar">${svcBar(l)}</td><td>${uDev(l.devs)}</td>${LAYER_KEYS.map(k => cell(wMax(l[k], jobsK(l, k)), l[k], jobsK(l, k))).join('')}
      ${cell(wMax(total(l), jobs(l)), total(l), jobs(l), 'bo')}<td class="bo">${uML(wPH(total(l), jobs(l)))}</td></tr>`;
    const zones = state.servicing.zones.slice().sort(byZone);
    const zr = zones.map(z => ({ a: z, l: svcLayerTotals('pz', z, bc) })).filter(r => total(r.l) > 0 || r.l.devs);
    const zsum = addLayers(zr.map(r => r.l));
    $('#water-body').innerHTML = `${exportBar('water')}${stampHTML('water', Y)}<div class="svc-head">${svcLegend(Y)}${sp ? optSwitch('md', 'Max day factor', [['design', `Design ×${c.water.maxDay}`], ['observed', `Observed 2025 ×${sp.maxDayFactor.toFixed(2)}`]]) : ''}</div>
      <table class="dt svc-table" data-info="pressure-zone"><caption>Water by pressure zone · maximum day (ML/d) at ${observed ? `the observed 2025 factor ×${mdR.toFixed(2)}` : `design ×${mdR} residential, ×${mdE} employment`}; people and jobs below</caption>
      <thead><tr><th>Pressure zone</th><th class="bar-h">Build-out mix</th><th>Developments</th>${layerHead}<th>Peak hour<br>build-out</th></tr></thead>
      <tbody>${zr.map(r => wRow(esc(r.a.name.replace('Pressure zone ', 'Zone ')), r.l, r.a.id)).join('')}${wRow('All pressure zones', zsum, null, 'tot')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">ML/d = megalitres per day. Residential ${c.water.avg} L/cap/d and employment ${E.water} L/emp/d (jobs on development sites; existing employment is not in the census baseline); peak hour ×${c.water.peakHour} residential, ×${E.peakHour} employment. ${Y} Census ${censusHow}; growth from every development located in the zone (other filters ignored), as in the Growth tab.</p></details>
      ${R ? waterReportsHTML(R, wAvg(zsum.census + zsum.built, zsum.jbuilt), wMax(zsum.census + zsum.built, zsum.jbuilt)) : ''}`;
    $('#water-note').textContent = `${Y} Census baseline (follows the timeline) · pressure zones in numerical order`;

    // ---- Wastewater: each catchment's own (local) flow plus everything upstream of it along the
    // traced flow path = the total passing its outlet, building up to the plant on the lake.
    // Residential + employment; peak dry = each peaked on its own count (Harmon; employment kept
    // between Peel's min and max) and added; peak wet = peak dry + I&I on the whole drainage area.
    const kids = svcFlowTree();
    const local = new Map(state.servicing.drainage.map(d => [d.id, { ...svcLayerTotals('dr', d, bc), ha: d.areaHa || 0 }]));
    const sum = list => { const t = addLayers(list); t.ha = list.reduce((a, x) => a + (x.ha || 0), 0); return t; };
    const cum = new Map();
    const cumOf = d => { if (cum.has(d.id)) return cum.get(d.id); const v = sum([local.get(d.id), ...(kids.get(d.id) || []).map(cumOf)]); cum.set(d.id, v); return v; };
    const upOf = d => sum((kids.get(d.id) || []).map(cumOf));
    const raw = (p, j) => (p * c.wastewater.avg + j * E.wastewater) / 1e6;
    const adwf = (l, f = 1) => f * raw(total(l), jobs(l));
    const pdwf = (l, f = 1) => f * (total(l) * c.wastewater.avg / 1e6 * D.harmon(total(l)) + jobs(l) * E.wastewater / 1e6 * D.employmentPeaking(jobs(l), E));
    const ii = l => l.ha * c.wastewater.infiltration * 86400 / 1e6;
    const plants = ['Lakeview', 'Clarkson', 'Inglewood'];
    const plantList = pl => state.servicing.drainage.filter(d => d.plant === pl);
    const rootsOf = list => list.filter(d => !d.downstream || !list.some(x => x.id === d.downstream));
    const plantSum = pl => sum(rootsOf(plantList(pl)).map(cumOf));
    // Calibration: scale each plant's population / employment flow so that today's model
    // (census + built since, plus the external inflows known to reach it) matches its 2025
    // reported annual average.
    const inflowsTo = pl => R ? R.wastewater.inflows.filter(x => x.plant === pl).reduce((t, x) => t + x.mld, 0) : 0;
    const calib = {};
    for (const pl of plants) {
      const rep = R && R.wastewater.plants[pl], s = plantSum(pl);
      const today = raw(s.census + s.built, s.jbuilt);
      calib[pl] = { today, rep, f: rep && today > 0 ? Math.max(0.1, (rep.avgMLd - inflowsTo(pl)) / today) : null };
    }
    const fOf = pl => (svcOpt.ww === 'calibrated' && calib[pl] && calib[pl].f) || 1;
    const peakCells = (l, f) => `<td>${uML(pdwf(l, f))}<small class="tech">M ${total(l) > 0 ? D.harmon(total(l)).toFixed(2) : '–'}</small></td><td>${uML(ii(l))}<small class="tech">${uHa(l.ha)}</small></td><td class="bo">${uML(pdwf(l, f) + ii(l))}</td>`;
    const nameCell = (name, sub, depth) => `<td style="padding-left:${6 + depth * 12}px">${depth ? '<span class="flow-arrow" aria-hidden="true">↳</span>' : ''}${name}${sub ? `<small>${sub}</small>` : ''}</td>`;
    const lay = (l, k, f) => f * raw(l[k], jobsK(l, k));
    const sRow = (name, sub, d, l, id, f, cls = '', depth = 0) => {
      const lo = d ? local.get(d.id) : null, up = d ? upOf(d) : null;
      // Where the flow comes from (local + upstream) and what it is made of (census + growth
      // layers); both add up to the total average dry weather flow at the outlet.
      const mid = (d ? cell(adwf(lo, f), total(lo), jobs(lo)) + (total(up) > 0 || up.ha ? cell(adwf(up, f), total(up), jobs(up)) : '<td class="muted">–</td>') : '<td></td><td></td>')
        + LAYER_KEYS.map((k, i) => cell(lay(l, k, f), l[k], jobsK(l, k), i ? '' : 'sep')).join('') + cell(adwf(l, f), total(l), jobs(l), 'bo');
      return `<tr${rowAttrs(id, cls)}>${nameCell(name, sub, depth)}<td class="bar">${svcBar(l)}</td><td>${uDev(d ? lo.devs : l.devs)}</td>${mid}${peakCells(l, f)}</tr>`;
    };
    const short = (d, pl) => d.name.replace(`${pl} · `, '');
    // Rows run from the top of each sewershed down to the lake: a branch's furthest catchment
    // first (by distance of its outlet from the plant), each catchment after everything that
    // drains into it, the plant's total inflow last.
    const plantAt = Object.fromEntries((state.servicing.meta.plants || []).map(p => [p.name, p.lnglat]));
    const far = (d, pl) => { const o = d.outletAt, p = plantAt[pl]; return o && p ? Math.hypot((o[0] - p[0]) * 0.72, o[1] - p[1]) : 0; };
    const reach = new Map();   // furthest outlet distance in a branch
    const reachOf = (d, pl) => reach.has(d.id) ? reach.get(d.id) : reach.set(d.id, Math.max(far(d, pl), ...(kids.get(d.id) || []).map(k => reachOf(k, pl)))).get(d.id);
    const shown = l => total(l) > 0 || l.devs;
    const sec = pl => {
      const roots = rootsOf(plantList(pl)), tot = sum(roots.map(cumOf)), f = fOf(pl);
      const rows = [];
      const walk = (d, depth) => {
        for (const k of (kids.get(d.id) || []).slice().sort((x, y) => reachOf(y, pl) - reachOf(x, pl))) walk(k, depth + 1);
        const l = cumOf(d);
        if (!shown(l)) return;
        const to = d.downstream ? svcById.get(d.downstream) : null;
        const n = (kids.get(d.id) || []).filter(k => shown(cumOf(k))).length;
        const sub = d.kind === 'plant' ? `direct-to-plant area${n ? ` + ${n} catchment${n > 1 ? 's' : ''} upstream` : ''}`
          : d.kind === 'untraced' ? 'drains to the City of Toronto system'
          : `→ ${esc(to ? short(to, pl) : plantLabel(pl))}${n ? ` · ${n} upstream` : ''}`;
        const label = d.kind === 'plant' ? `${esc(plantLabel(pl))} · total inflow` : esc(short(d, pl));
        rows.push(sRow(label, sub, d, l, d.id, f, roots.length === 1 && d === roots[0] ? 'sub' : '', depth));
      };
      for (const r of roots.sort((x, y) => reachOf(y, pl) - reachOf(x, pl))) walk(r, 0);
      if (roots.length > 1) rows.push(sRow(`${esc(PLANT_SHORT[pl])} total`, '', null, tot, null, f, 'sub'));
      return { pl, rows, sum: tot, f };
    };
    const secs = plants.map(sec).filter(x => x.rows.length);
    const tor = sec('Toronto');
    const cols = 13;
    const peel = sum(secs.map(x => x.sum));
    // The Peel total under calibration: each plant at its own factor (flows add; Harmon on the total).
    const peelF = peel.census + peel.built + peel.approved + peel.proposed > 0 ? secs.reduce((t, x) => t + adwf(x.sum, x.f), 0) / Math.max(1e-9, adwf(peel)) : 1;
    const calNote = svcOpt.ww === 'calibrated' ? `<p class="small cal-note"><strong>Capacity check (calibrated to 2025 flows):</strong> ${secs.filter(x => x.f !== 1).map(x => `${esc(PLANT_SHORT[x.pl])} ×${x.f.toFixed(2)}`).join(' · ')}. Each plant's population and employment flow is scaled so that today (census + built since${R && R.wastewater.inflows.some(x => x.plant) ? ', plus the York Region inflow at G.E. Booth' : ''}) matches its 2025 reported annual average; the factor absorbs existing employment, institutional and commercial flow, infiltration in dry weather and any flows not modelled. I&amp;I is not scaled.</p>` : '';
    $('#ww-body').innerHTML = `${exportBar('catchments')}${stampHTML('ww', Y)}<div class="svc-head">${svcLegend(Y)}<div class="svc-switches">${R ? optSwitch('ww', 'Mode', [['calibrated', 'Capacity check (2025 flows)'], ['design', 'Design flows (Peel criteria)']]) : ''}${optSwitch('tech', 'Details', [['off', 'Simple'], ['on', 'Engineering']])}</div></div>${calNote}
      <table class="dt svc-table ww-table" data-info="drainage-area"><caption>Wastewater by sanitary catchment, building up along the flow path to the lake · average dry weather (ML/d); people and jobs below</caption>
      <thead><tr><th rowspan="2">Catchment (top of the sewershed → plant)</th><th rowspan="2" class="bar-h">Build-out mix</th><th rowspan="2">Developments</th>
        <th colspan="2" class="grp-h">Where it comes from</th><th colspan="4" class="grp-h sep">What it is made of</th><th rowspan="2">= Total<br>average dry</th><th rowspan="2">Peak dry<br>weather</th><th rowspan="2">I&amp;I</th><th rowspan="2">Peak wet<br>weather</th></tr>
        <tr><th>Local</th><th>+ Upstream</th><th class="sep">${Y} Census</th><th>+ Built since ${Y}</th><th>+ Approved</th><th>+ Proposed (in review)</th></tr></thead>
      <tbody>${secs.map(x => `<tr class="grp"><td colspan="${cols}">${esc(plantLabel(x.pl))}</td></tr>${x.rows.join('')}`).join('')}
        ${sRow(`Peel total (${secs.map(x => PLANT_SHORT[x.pl]).join(' + ')})`, '', null, peel, null, peelF, 'tot')}
        ${tor.rows.length ? `<tr class="grp"><td colspan="${cols}">${esc(plantLabel('Toronto'))} · not in the Peel total</td></tr>${tor.rows.join('')}` : ''}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">ML/d = megalitres per day, at build-out (${Y} Census + growth). <strong>Local</strong> = the catchment's own population, jobs and flow; <strong>upstream</strong> = everything that drains into it (the indented rows above it); <strong>total</strong> = local + upstream = ${Y} Census + built + approved + proposed, the average dry weather flow leaving its outlet. Each plant's last row is its total inflow from Peel catchments; external inflows (York Region, City of Toronto) are in the Plants tab. Residential ${c.wastewater.avg} L/cap/d, employment ${E.wastewater} L/emp/d (jobs on development sites; existing employment is not in the census baseline). <strong>Peak dry weather</strong> = residential average × Harmon M = 1 + 14 / (4 + √P) on the total population (M shown) + employment average × Harmon on the jobs, kept between ${E.peakMin} and ${E.peakMax}; <strong>I&amp;I</strong> = ${c.wastewater.infiltration} L/s/ha on the whole traced drainage area to the outlet; <strong>peak wet weather</strong> = peak dry + I&amp;I. Peaks are not additive. ${Y} Census ${censusHow}; growth from every development located in the catchment (other filters ignored). Click a catchment to see its flow path to the lake on the map.</p></details>`;
    renderPlantsTab(secs, peel, tor, { Y, c, total, jobs, adwf, pdwf, ii, calib, inflowsTo, censusHow });
    // Kept for the development panel's servicing check and the export.
    const dvR = R && R.wastewater.diversion, divMldOf = pl => !(dvR && svcOpt.div === 'on') ? 0 : pl === dvR.from ? -dvR.mld : pl === dvR.to ? dvR.mld : 0;
    const plantCap = pl => {
      const rep = R && R.wastewater.plants[pl]; if (!rep) return null;
      const s = plantSum(pl), f = fOf(pl), ext = inflowsTo(pl) + divMldOf(pl);
      const up = n => { const o = { census: s.census, built: n > 0 ? s.built : 0, approved: n > 1 ? s.approved : 0, proposed: n > 2 ? s.proposed : 0, jbuilt: n > 0 ? s.jbuilt : 0, japproved: n > 1 ? s.japproved : 0, jproposed: n > 2 ? s.jproposed : 0 }; return adwf(o, f) + ext; };
      const today = { census: s.census, built: s.built, approved: 0, proposed: 0, jbuilt: s.jbuilt }, popToday = total(today);
      return { rated: rep.ratedMLd, name: rep.name, existing: up(1), committed: up(2), buildout: up(3), f, perPerson: popToday > 0 ? adwf(today, f) * 1e6 / popToday : 0 };
    };
    for (const d of state.servicing.drainage) cumOf(d);
    state.svcModel = { Y, mode: svcOpt.ww, cum, local, fOf, adwf, pdwf, ii, total, jobs, plantCap, zones: new Map(zr.map(r => [r.a.id, r.l])), wMax, wPH, wAvg };
    $('#ww-note').textContent = `${Y} Census baseline (follows the timeline) · flows build up from the top of each sewershed down to G.E. Booth (Lakeview), Clarkson and Inglewood`;
  }
  // Reported 2025 water production next to the model (Water tab).
  function waterReportsHTML(R, modelAvg, modelMax) {
    const sp = R.water.southPeel, cal = R.water.caledon, pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const calAvg = cal.reduce((t, s) => t + s.avgM3d, 0) / 1000;
    const m3 = v => unit(fmtNum(Math.round(v)), 'm³/d');
    return `<h3 class="svc-sub">Reported 2025 production <span class="muted small">Region of Peel annual reports</span></h3>
      <table class="dt svc-table rep-table" data-info="water-reports"><thead><tr><th>Treatment plant</th><th>Rated capacity</th><th>2025 average day</th><th>2025 maximum day</th><th>Max day ÷ average</th></tr></thead>
      <tbody>${sp.plants.map(p => `<tr><td>${esc(p.name)}<small>${refLink(p.ref, p.pages)}</small></td><td>${uML(p.ratedMLd)}</td><td>${uML(p.avgMLd)}<small>${pct(p.avgMLd, p.ratedMLd)} of capacity</small></td><td>${uML(p.maxDayMLd)}<small>${esc(p.maxDayMonth)} · ${pct(p.maxDayMLd, p.ratedMLd)}</small></td><td>×${(p.maxDayMLd / p.avgMLd).toFixed(2)}</td></tr>`).join('')}
        <tr class="sub"><td>South Peel system (lake-based)<small>${esc(sp.maxDayNote)}</small></td><td>${uML(sp.plants.reduce((t, p) => t + p.ratedMLd, 0))}</td><td>${uML(sp.avgMLd)}</td><td>≤ ${uML(sp.maxDayMLd)}</td><td>×${sp.maxDayFactor.toFixed(2)}</td></tr>
        <tr><td>Caledon groundwater systems (5)</td><td></td><td>${uML(calAvg)}</td><td></td><td></td></tr>
        <tr class="tot"><td>Model today, all pressure zones<small>census + built since; residential + development jobs</small></td><td></td><td>${uML(modelAvg)}<small>${pct(modelAvg, sp.avgMLd + calAvg)} of reported</small></td><td>${uML(modelMax)}<small>${svcOpt.md === 'observed' ? 'observed factor' : 'design factor'}</small></td><td></td></tr></tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Reported production includes water supplied to York Region and Halton, all industrial, commercial and institutional use and non-revenue water; transfer volumes to York are not published, so the model (residential + new development jobs) is expected to be lower. Population served in 2025: ${fmtNum(sp.populationServed)} (${esc(sp.populationNote)}). ${refLink(sp.ref, sp.pages)}.</p></details>
      <h3 class="svc-sub">Caledon groundwater systems <span class="muted small">2025</span></h3>
      <table class="dt svc-table rep-table" data-info="water-reports"><thead><tr><th>System</th><th>Population served</th><th>Rated capacity</th><th>2025 average day</th><th>2025 maximum day</th><th>Per person</th><th>Max day ÷ average</th></tr></thead>
      <tbody>${cal.map(s => `<tr><td>${esc(s.name)}<small>${esc(s.communities)}</small></td><td>${uPop(s.population)}<small>${unit(fmtNum(s.connections), 'connections')}</small></td><td>${m3(s.ratedM3d)}</td><td>${m3(s.avgM3d)}<small>${pct(s.avgM3d, s.ratedM3d)} of capacity</small></td><td>${m3(s.maxDayM3d)}<small>${esc(s.maxDayNote)} · ${pct(s.maxDayM3d, s.ratedM3d)}</small></td><td>${unit(fmtNum(Math.round(s.avgM3d * 1000 / s.population)), 'L/cap/d')}</td><td>×${(s.maxDayM3d / s.avgM3d).toFixed(2)}</td></tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Treated water. Populations are as stated in each system's report ("close to", "just over"); rated capacity is the wells' combined rated capacity. Sources: ${cal.map(s => refLink(s.ref, s.pages)).join('; ')}.</p></details>`;
  }
  // Plants tab: a comparison of the model with each plant's 2025 annual report, then each
  // plant's total inflow built up layer by layer like the Growth tab: census + built since +
  // approved + proposed = build-out, with the external inflows (York Region, City of Toronto).
  // Peaks are not additive, so a growth layer's peak is what it adds to the peak (the running
  // total, peaked on its population, is shown below). I&I is on the whole drainage area, so it
  // all sits with the existing system.
  // Horizon years (Plants & capacity): each plant's average dry weather flow as a % of its rated
  // capacity by year, with approved growth phased in over a set number of years, proposed growth
  // after it, optional further growth beyond today's applications, and the diversion from its
  // start year. Assumptions are editable and kept in the browser.
  const HZ_DEFAULT = { year0: 2025, aStart: 2026, aYears: 5, pStart: 2028, pYears: 10, extra: 0, divYear: 2028, end: 2051 };
  const hz = { ...HZ_DEFAULT, ...(store.get('horizon', {}) || {}) };
  function capHorizonHTML(plants, dv) {
    if (!plants.length) return '';
    const frac = (y, start, n) => Math.min(1, Math.max(0, (y - start + 1) / Math.max(1, n)));
    const popAll = plants.reduce((t, p) => t + p.popShare, 0) || 1;
    const years = []; for (let y = hz.year0; y <= hz.end; y++) years.push(y);
    const divOn = svcOpt.div === 'on';
    const series = plants.map(p => ({ ...p, v: years.map(y => {
      const extraPeople = hz.extra * Math.max(0, y - hz.year0) * p.popShare / popAll;
      const f = p.existing + p.A * frac(y, hz.aStart, hz.aYears) + p.P * frac(y, hz.pStart, hz.pYears) + (divOn && y >= hz.divYear ? p.div : 0) + extraPeople * p.perPerson / 1e6;
      return f / p.rated * 100;
    }) }));
    const narrow = innerWidth < 640, W = narrow ? 420 : 760, H = narrow ? 230 : 250, L = 36, Rr = narrow ? 100 : 120, T = 10, B = 26;
    const yMax = Math.max(110, Math.ceil(Math.max(...series.flatMap(s => s.v)) / 10) * 10 + 5);
    const X = y => L + (y - hz.year0) / (hz.end - hz.year0) * (W - L - Rr), Yp = v => T + (1 - v / yMax) * (H - T - B);
    const ticksY = []; for (let v = 0; v <= yMax; v += 20) ticksY.push(v);
    const ticksX = years.filter(y => y % (narrow ? 10 : 5) === 0 || y === hz.year0);
    const cross = t => { const r = {}; for (const s of series) { const i = s.v.findIndex(v => v >= t); r[s.key] = i < 0 ? `after ${hz.end}` : i === 0 ? `by ${years[0]}` : String(years[i]); } return r; };
    const c80 = cross(80), c90 = cross(90), c100 = cross(100);
    const at = y => years.indexOf(y);
    const pick = [hz.year0, 2031, 2041, hz.end].filter((y, i, a) => at(y) >= 0 && a.indexOf(y) === i);
    // End labels: nudge apart when close.
    const ends = series.map(s => ({ s, y: Yp(s.v[s.v.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plant flow as a percentage of rated capacity, ${hz.year0} to ${hz.end}">
      <g class="grid">${ticksY.map(v => `<line x1="${L}" x2="${W - Rr}" y1="${Yp(v)}" y2="${Yp(v)}"/>`).join('')}</g>
      <g class="axis">${ticksY.map(v => `<text x="${L - 6}" y="${Yp(v) + 4}" text-anchor="end">${v}%</text>`).join('')}${ticksX.map(y => `<text x="${X(y)}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}</g>
      ${[80, 90, 100].map(t => `<g class="ref r${t}"><line x1="${L}" x2="${W - Rr}" y1="${Yp(t)}" y2="${Yp(t)}"/><text x="${W - Rr - 4}" y="${Yp(t) + (t === 100 ? -4 : 12)}" text-anchor="end">${t}%${t === 100 ? ' rated' : ''}</text></g>`).join('')}
      ${series.map(s => `<polyline class="line s-${s.key}" points="${s.v.map((v, i) => `${X(years[i]).toFixed(1)},${Yp(v).toFixed(1)}`).join(' ')}"/>`).join('')}
      ${ends.map(e => `<text class="lbl end" x="${W - Rr + 6}" y="${e.y + 4}">${esc(e.s.name)} ${Math.round(e.s.v[e.s.v.length - 1])}%</text>`).join('')}
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      ${series.map(s => `<circle class="pt f-${s.key}" r="4" cx="0" cy="0" visibility="hidden" data-k="${s.key}"/>`).join('')}
      <rect class="hz-hit" x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - B}" fill="transparent"/>
    </svg>`;
    const inp = (k, label, w = '') => `<label>${label} <input type="number" data-hz="${k}" value="${hz[k]}" ${w}></label>`;
    // Keep the data for the hover layer.
    capHorizonHTML.data = { years, series, X, Yp, W, H, T, B };
    return `<section class="hz" data-info="horizon">
      <h3 class="svc-sub">Horizon years <span class="muted small">average dry weather as a % of rated capacity, ${hz.year0}–${hz.end} · ${svcOpt.ww === 'calibrated' ? 'capacity check' : 'design flows'}</span></h3>
      <div class="hz-form">${inp('aStart', 'Approved built from', 'min="2020" max="2060" step="1"')}${inp('aYears', 'over', 'min="1" max="40" step="1"')} years ·
        ${inp('pStart', 'Proposed built from', 'min="2020" max="2060" step="1"')}${inp('pYears', 'over', 'min="1" max="40" step="1"')} years ·
        ${inp('extra', 'Further growth beyond applications', 'min="0" step="1000" style="width:84px"')} people / year${dv ? ` · ${inp('divYear', `${fmt1(dv.mld)} ML/d diversion from`, 'min="2020" max="2060" step="1"')}${divOn ? '' : ' <span class="muted">(switch the diversion on to use it)</span>'}` : ''}
        <button type="button" class="btn small" data-hz-reset>Reset</button></div>
      <div class="hz-wrap">${svg}<div class="hz-tip" hidden></div></div>
      <ul class="grow-legend">${series.map(s => `<li><span class="hz-key f-${s.key}" style="background:var(--pl-${s.key})"></span>${esc(s.full)}</li>`).join('')}<li class="muted">dashed: 80% and 90% thresholds; solid: rated capacity</li></ul>
      <table class="dt svc-table rep-table"><thead><tr><th>Plant</th>${pick.map(y => `<th>${y}</th>`).join('')}<th>Reaches 80%</th><th>Reaches 90%</th><th>Reaches 100%</th></tr></thead>
        <tbody>${series.map(s => `<tr><td>${esc(s.full)}<small>rated ${uML(s.rated)}</small></td>${pick.map(y => `<td>${Math.round(s.v[at(y)])}%<small>${uML(s.v[at(y)] * s.rated / 100)}</small></td>`).join('')}<td>${c80[s.key]}</td><td>${c90[s.key]}</td><td class="bo">${c100[s.key]}</td></tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Starts from today (${hz.year0}: ${svcOpt.ww === 'calibrated' ? 'the 2025 reported flow' : 'census + built since at design rates'}, plus external inflows). Approved growth is added evenly over its years, then proposed growth over its years; further growth beyond today's applications (if set) is shared among the plants by today's population at each plant's flow per person. The diversion moves its flow from its start year. 80% and 90% of rated capacity are thresholds commonly used to start planning and building an expansion; they are shown for reference. These are scenarios, not forecasts: actual timing depends on market absorption, servicing and approvals.</p></details>
    </section>`;
  }
  $('#plants-body').addEventListener('input', e => {
    const el = e.target.closest('[data-hz]'); if (!el) return;
    const v = Number(el.value); if (!isFinite(v)) return;
    hz[el.dataset.hz] = v; store.set('horizon', hz);
    clearTimeout(capHorizonHTML.t); capHorizonHTML.t = setTimeout(() => { const y = $('#plants-body').parentElement.scrollTop; renderSvcTab(); const f = $(`#plants-body [data-hz="${el.dataset.hz}"]`); if (f) { f.focus(); const n = f.value.length; try { f.setSelectionRange(n, n); } catch (er) { /* number inputs */ } } $('#plants-body').parentElement.scrollTop = y; }, 350);
  });
  $('#plants-body').addEventListener('click', e => {
    if (!e.target.closest('[data-hz-reset]')) return;
    Object.assign(hz, HZ_DEFAULT); store.set('horizon', null); renderSvcTab();
  });
  // Hover layer: crosshair at the nearest year with each plant's value.
  $('#plants-body').addEventListener('mousemove', e => {
    const svg = e.target.closest('.hz svg'); const D0 = capHorizonHTML.data;
    const wrap = svg && svg.parentElement, tip = wrap && wrap.querySelector('.hz-tip');
    if (!svg || !D0) { document.querySelectorAll('.hz-tip').forEach(t => { t.hidden = true; }); return; }
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * D0.W;
    let i = 0, best = Infinity; D0.years.forEach((y, k) => { const d = Math.abs(D0.X(y) - x); if (d < best) { best = d; i = k; } });
    const cx = D0.X(D0.years[i]);
    const cross = svg.querySelector('.cross'); cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    for (const c of svg.querySelectorAll('.pt')) { const s = D0.series.find(q => q.key === c.dataset.k); c.setAttribute('cx', cx); c.setAttribute('cy', D0.Yp(s.v[i])); c.setAttribute('visibility', 'visible'); }
    tip.textContent = `${D0.years[i]}: ${D0.series.map(s => `${s.name} ${Math.round(s.v[i])}%`).join(' · ')}`;
    tip.hidden = false; tip.style.left = `${Math.min(r.width - tip.offsetWidth, Math.max(0, cx / D0.W * r.width + 10))}px`; tip.style.top = '0px';
  });
  // Plant capacity chart (Plants tab). One bar per plant on a % of rated capacity axis; the
  // 100% line is the rated capacity. Segment colours follow the Growth tab (census grey, built
  // green, approved blue, proposed hatched), every value is also written out below the bar.
  function capChartHTML(rows, Y) {
    const pct = (x, r) => x / r * 100;
    const maxPct = Math.max(110, ...rows.map(r => pct(r.v.reduce((a, b) => a + b, 0), r.rated)));
    const axisMax = Math.ceil(maxPct / 25) * 25;
    const X = p => `${(p / axisMax * 100).toFixed(2)}%`;
    const ticks = []; for (let t = 0; t <= axisMax; t += 25) ticks.push(t);
    const ppl = n => unit(fmtNum(Math.round(n / 100) * 100), 'people');
    const segs = [['g-base', `${Y} Census (existing)`], ['g-built', `Built since ${Y}`], ['g-approved', 'Approved']
      , ['g-proposed', 'Proposed (in review)']];
    const body = rows.map(r => {
      const tot = r.v.reduce((a, b) => a + b, 0), committed = r.v[0] + r.v[1] + r.v[2];
      const reserve = r.rated - committed, afterProposed = r.rated - tot;
      // Too few people mapped to the sewershed (Inglewood: a village inside a large rural census
      // area) makes the flow per person meaningless; skip the population equivalents then.
      const okPop = r.popToday >= 1000 && r.perPerson > 0;
      const people = mld => okPop ? mld * 1e6 / r.perPerson : 0;
      const eq = mld => okPop ? ` ≈ ${ppl(people(mld))}` : '';
      const popAt100 = r.perPerson > 0 ? (r.rated - r.extMld) * 1e6 / r.perPerson : 0;
      const bar = r.v.map((v, i) => v > 0 ? `<span class="gseg ${segs[i][0]}" style="flex:${(v / tot * 1000).toFixed(3)} 1 0" tabindex="0" data-tip="${esc(`${segs[i][1]}: ${fmt1(v)} ML/d · ${pct(v, r.rated).toFixed(1)}% of rated capacity`)}"></span>` : '').join('');
      const resBox = reserve > 0 ? `<span class="cap-reserve" style="left:${X(pct(committed, r.rated))};width:${X(pct(reserve, r.rated))}" data-tip="${esc(`Uncommitted reserve: ${fmt1(reserve)} ML/d${okPop ? ` ≈ ${fmtNum(Math.round(people(reserve) / 100) * 100)} people` : ''}`)}"></span>` : '';
      return `<div class="cap-row">
        <div class="cap-name">${r.name}<small>rated ${uML(r.rated)}${r.note ? ` · ${esc(r.note)}` : ''}</small></div>
        <div class="cap-track"><div class="cap-bar" style="width:${X(pct(tot, r.rated))}">${bar}</div>${resBox}<span class="cap-line" style="left:${X(100)}" aria-hidden="true"></span>
          <span class="cap-end${Math.abs(pct(tot, r.rated) - 100) < 9 ? ' near' : ''}" style="left:${X(Math.max(pct(tot, r.rated), 100))}">${Math.round(pct(tot, r.rated))}%</span></div>
        <div class="cap-text small">
          <span>Existing + built + approved <strong>${Math.round(pct(committed, r.rated))}%</strong> (${uML(committed)})</span>
          <span>${reserve >= 0 ? `Uncommitted reserve <strong>${uML(reserve)}</strong>${okPop ? ` ≈ <strong>${ppl(people(reserve))}</strong>` : ''}` : `<strong class="over">Over-committed by ${uML(-reserve)}</strong>`}</span>
          <span>${afterProposed >= 0 ? `After proposed: ${uML(afterProposed)}${eq(afterProposed)}` : `<span class="over">After proposed: short ${uML(-afterProposed)}${eq(-afterProposed)}</span>`}</span>
          <span>${okPop ? `Population at 100%: <strong>${ppl(popAt100)}</strong> <span class="muted">(today ${ppl(r.popToday)}, ${unit(fmtNum(Math.round(r.perPerson)), 'L/person/d')})</span>` : '<span class="muted">Population equivalents not shown: too few census people are mapped to this sewershed</span>'}</span>
        </div></div>`;
    }).join('');
    return `<h3 class="svc-sub">Plant capacity <span class="muted small">average dry weather as a % of rated capacity · ${svcOpt.ww === 'calibrated' ? 'capacity check, calibrated to 2025 flows' : 'design flows, Peel criteria'}${svcOpt.div === 'on' ? ' · with the 70 ML/d diversion' : ''}</span></h3>
      <div class="cap-chart" data-info="plant-capacity">
        <div class="cap-axis"><div></div><div class="cap-ticks">${ticks.map(t => `<span style="left:${X(t)}"${t === 100 ? ' class="hundred"' : ''}>${t}%</span>`).join('')}</div></div>
        ${body}
        <ul class="grow-legend"><li><span class="gsw g-base"></span>${Y} Census (existing) + external inflows</li><li><span class="gsw g-built"></span>Built since ${Y}</li><li><span class="gsw g-approved"></span>Approved</li><li><span class="gsw g-proposed"></span>Proposed (in review)</li><li><span class="gsw cap-reserve-sw"></span>Uncommitted reserve</li><li><span class="cap-line-sw"></span>Rated capacity (100%)</li></ul>
        <div class="grow-tip" id="cap-tip" hidden></div>
      </div>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted"><strong>Uncommitted reserve capacity</strong> (Ontario MECP Procedure D-5-1) = rated capacity − existing flow − flow committed to approved development. Here existing = ${Y} Census + built since (plus external inflows), committed = approved; proposed applications then draw on the reserve. Its population equivalent divides by the plant's flow per person today (residential + development jobs${svcOpt.ww === 'calibrated' ? ', calibrated to the 2025 reported flow, so it also carries existing employment and infiltration' : ' at Peel design rates'}). <em>Population at 100%</em> = (rated capacity − external inflows) ÷ that flow per person. ${svcOpt.ww === 'calibrated' ? '' : 'D-5-1 uses measured flows: switch to <em>Capacity check</em> for that basis.'}</p></details>`;
  }
  function renderPlantsTab(secs, peel, tor, k) {
    const { Y, c, total, jobs, adwf, pdwf, ii, calib, inflowsTo, censusHow } = k;
    const R = state.reports, rep = pl => R && R.wastewater.plants[pl];
    const inflows = R ? R.wastewater.inflows : [];
    const stages = [['census', `${Y} Census`], ['built', `+ Built since ${Y}`], ['approved', '+ Approved'], ['proposed', '+ Proposed (in review)']];
    const upTo = (l, n) => { const o = { census: 0, built: 0, approved: 0, proposed: 0, jbuilt: 0, japproved: 0, jproposed: 0, ha: l.ha }; stages.slice(0, n + 1).forEach(([s]) => { o[s] = l[s]; if (JOB_KEY[s]) o[JOB_KEY[s]] = l[JOB_KEY[s]]; }); return o; };
    const pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const run = (x, show) => show ? `<small>→ ${uML(x)}</small>` : '';
    const block = (title, l, f, ext, rated, note = '') => {
      let prev = { pop: 0, j: 0, a: 0, d: 0, ii: 0, w: 0 };
      const rows = [];
      const row = (label, r, n, cls = '') => {
        const inc = q => r[q] - prev[q];
        rows.push(`<tr class="${cls}"><td>${label}</td><td>${uPop(inc('pop'))}${inc('j') > 0 ? ` <small>${unit(fmtNum(Math.round(inc('j'))), 'jobs')}</small>` : ''}${n ? `<small>→ ${uPop(r.pop)}</small>` : ''}</td>
          <td>${uML(inc('a'))}${run(r.a, n)}</td><td>${uML(inc('d'))}${run(r.d, n)}</td><td>${uML(inc('ii'))}${n ? '' : `<small class="tech">${uHa(l.ha)}</small>`}</td><td class="bo">${uML(inc('w'))}${run(r.w, n)}</td><td>${rated ? pct(r.a, rated) : ''}</td></tr>`);
        prev = r;
      };
      let extSoFar = 0, n = 0;
      stages.forEach(([key, label], i) => {
        const o = upTo(l, i);
        const mk = () => ({ pop: total(o), j: jobs(o), a: adwf(o, f) + extSoFar, d: pdwf(o, f) + extSoFar, ii: ii(o), w: pdwf(o, f) + extSoFar + ii(o) });
        row(esc(label), mk(), n++);
        // External inflows come in with the existing system, after the census row.
        if (key === 'census') for (const x of ext) { extSoFar += x.mld; row(`${x.mld < 0 ? '−' : '+'} ${esc(x.name)}<small>${esc(x.detail)} · ${x.refs || refLink(x.ref, x.pages)}</small>`, mk(), n++, x.mld < 0 ? 'ext neg' : 'ext'); }
      });
      const r = prev;
      return `<tr class="grp"><td colspan="7">${title}${note ? ` <span class="muted small">${note}</span>` : ''}</td></tr>${rows.join('')}
        <tr class="tot"><td>= Build-out</td><td>${uPop(r.pop)}${r.j > 0 ? ` <small>${unit(fmtNum(Math.round(r.j)), 'jobs')}</small>` : ''}</td><td>${uML(r.a)}</td><td>${uML(r.d)}<small class="tech">M ${r.pop > 0 ? D.harmon(r.pop).toFixed(2) : '–'}</small></td><td>${uML(r.ii)}</td><td class="bo">${uML(r.w)}</td><td>${rated ? pct(r.a, rated) : ''}</td></tr>
        <tr class="plant-bar"><td colspan="7">${svcBar(l)}</td></tr>`;
    };
    // Comparison with the 2025 reports.
    // Planned east-to-west diversion: a fixed transfer of average flow (and the same amount off
    // the peaks) from G.E. Booth to Clarkson, when switched on; the Peel total is unchanged.
    const dv = R && R.wastewater.diversion, divOn = !!(dv && svcOpt.div === 'on');
    const dvRefs = dv ? dv.refs.map(([r, pg]) => refLink(r, pg)).join('; ') : '';
    const divTo = pl => !divOn ? [] : pl === dv.from ? [{ name: `Diversion to ${plantLabel(dv.to)} (planned ${dv.when})`, detail: dv.detail, mld: -dv.mld, refs: dvRefs }]
      : pl === dv.to ? [{ name: `Diversion from ${plantLabel(dv.from)} (planned ${dv.when})`, detail: dv.detail, mld: dv.mld, refs: dvRefs }] : [];
    const divMld = pl => divTo(pl).reduce((t, x) => t + x.mld, 0);
    const ratedOf = pl => rep(pl) ? rep(pl).ratedMLd : 0;
    const peelFc = secs.length ? secs.reduce((t, x) => t + adwf(x.sum, x.f), 0) / Math.max(1e-9, adwf(peel)) : 1;
    // Capacity chart: each plant's average dry weather flow as a % of its rated (annual average)
    // capacity, stacked existing → built → approved → proposed, with the uncommitted reserve
    // (rated − existing − built − approved, MECP Procedure D-5-1) and its population equivalent.
    let chart = '';
    if (R) {
      const rows = [];
      const mkRow = (name, l, f, extMld, rated, note) => {
        if (!(rated > 0)) return;
        const a = n => adwf(upTo(l, n), f) + extMld;
        const v = [a(0), a(1) - a(0), a(2) - a(1), a(3) - a(2)];
        const today = upTo(l, 1), popToday = total(today);
        const perPerson = popToday > 0 ? adwf(today, f) * 1e6 / popToday : 0;   // L/person/d, incl. development jobs
        rows.push({ name, rated, v, extMld, perPerson, popToday, note });
      };
      for (const x of secs) mkRow(esc(rep(x.pl) ? rep(x.pl).name : plantLabel(x.pl)), x.sum, x.f, inflowsTo(x.pl) + divMld(x.pl), ratedOf(x.pl));
      if (secs.length > 1) mkRow('All Peel plants', peel, peelFc, inflows.reduce((t, e) => t + e.mld, 0), secs.reduce((t, x) => t + ratedOf(x.pl), 0), 'incl. the City of Toronto inflow');
      chart = capChartHTML(rows, Y);
      // Horizon years: existing today, approved and proposed phased in over the set years.
      const hzPlants = secs.filter(x => ratedOf(x.pl) > 0).map(x => {
        const a = n => adwf(upTo(x.sum, n), x.f);
        const today = upTo(x.sum, 1), popToday = total(today);
        return { key: { Lakeview: 'booth', Clarkson: 'clarkson', Inglewood: 'inglewood' }[x.pl] || 'booth', name: PLANT_SHORT[x.pl], full: rep(x.pl) ? rep(x.pl).name : plantLabel(x.pl), rated: ratedOf(x.pl),
          existing: a(1) + inflowsTo(x.pl), A: a(2) - a(1), P: a(3) - a(2), div: divMld(x.pl), perPerson: popToday > 0 ? adwf(today, x.f) * 1e6 / popToday : 0, popShare: popToday };
      });
      chart += capHorizonHTML(hzPlants, dv);
    }
    let cmp = '';
    if (R) {
      const rows = secs.map(x => {
        const p = rep(x.pl); if (!p) return '';
        const cb = calib[x.pl], todayDesign = cb.today + inflowsTo(x.pl), bo = adwf(x.sum, x.f) + inflowsTo(x.pl) + divMld(x.pl);
        return `<tr><td>${esc(p.name)}<small>${refLink(p.ref, p.pages)}</small></td><td>${uML(p.ratedMLd)}</td><td>${uML(p.avgMLd)}<small>${p.pctOfCapacity}% of capacity</small></td><td>${uML(p.maxDayMLd)}<small>${esc(p.maxDayMonth)}${p.bypasses ? ` · ${p.bypasses} bypasses, ${fmtNum(p.bypassML)} ML` : ''}</small></td>
          <td>${uML(todayDesign)}<small>${pct(todayDesign, p.avgMLd)} of reported</small></td><td>${cb.f ? `×${cb.f.toFixed(2)}` : '–'}</td><td class="bo">${uML(bo)}<small>${pct(bo, p.ratedMLd)} of capacity${svcOpt.ww === 'calibrated' ? ', calibrated' : ''}${divMld(x.pl) ? `, ${divMld(x.pl) > 0 ? '+' : '−'}${fmt1(Math.abs(divMld(x.pl)))} ML/d diversion` : ''}</small></td></tr>`;
      }).join('');
      const tor = inflows.find(x => !x.plant);
      const sumRep = secs.reduce((t, x) => t + (rep(x.pl) ? rep(x.pl).avgMLd : 0), 0), sumRated = secs.reduce((t, x) => t + (rep(x.pl) ? rep(x.pl).ratedMLd : 0), 0);
      const sumToday = secs.reduce((t, x) => t + calib[x.pl].today + inflowsTo(x.pl), 0) + (tor ? tor.mld : 0);
      const sumBo = secs.reduce((t, x) => t + adwf(x.sum, x.f) + inflowsTo(x.pl), 0) + (tor ? tor.mld : 0);
      cmp = `<h3 class="svc-sub">2025 annual reports vs. the model <span class="muted small">average dry weather, ML/d</span></h3>
        <table class="dt svc-table rep-table" data-info="plant-reports"><thead><tr><th>Plant</th><th>Rated capacity<br>(annual average)</th><th>2025 reported<br>average</th><th>2025 highest day</th><th>Model today<br>(design criteria)</th><th>Calibration<br>factor</th><th>Model<br>build-out</th></tr></thead>
        <tbody>${rows}<tr class="tot"><td>Peel plants${tor ? `<small>model includes the City of Toronto inflow (${uML(tor.mld)}, plant not stated)</small>` : ''}</td><td>${uML(sumRated)}</td><td>${uML(sumRep)}<small>${pct(sumRep, sumRated)} of capacity</small></td><td></td><td>${uML(sumToday)}<small>${pct(sumToday, sumRep)} of reported</small></td><td></td><td class="bo">${uML(sumBo)}<small>${pct(sumBo, sumRated)} of capacity</small></td></tr></tbody></table>
        <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Model today = ${Y} Census + built since, residential + development jobs, plus external inflows known to reach the plant. The plants also treat existing employment, institutional and commercial flow, dry-weather infiltration and inflows the model does not hold, so the design-criteria model is expected to run low; the calibration factor is reported ÷ model and is applied in <em>Capacity check</em> mode. ${R.wastewater.plants.Lakeview ? esc(R.wastewater.plants.Lakeview.notes.slice(1).join(' ')) : ''}</p></details>`;
    }
    const peelExt = inflows;
    const peelF = secs.length ? secs.reduce((t, x) => t + adwf(x.sum, x.f), 0) / Math.max(1e-9, adwf(peel)) : 1;
    $('#plants-body').innerHTML = `${exportBar('plants')}${stampHTML('ww', Y)}<div class="svc-head">${svcLegend(Y).replace(' · click a row to zoom to it on the map', '')}<div class="svc-switches">${R ? optSwitch('ww', 'Mode', [['calibrated', 'Capacity check (2025 flows)'], ['design', 'Design flows (Peel criteria)']]) : ''}${optSwitch('tech', 'Details', [['off', 'Simple'], ['on', 'Engineering']])}${dv ? optSwitch('div', `${fmt1(dv.mld)} ML/d diversion to ${PLANT_SHORT[dv.to]}`, [['off', 'Off'], ['on', `On (planned ${dv.when})`]]) : ''}</div></div>
      ${divOn ? `<p class="small cal-note"><strong>Diversion on:</strong> ${fmt1(dv.mld)} ML/d moved from ${esc(plantLabel(dv.from))} to ${esc(plantLabel(dv.to))} at every growth layer, taken off its average and its peaks alike (a fixed transfer); the Peel total is unchanged. ${esc(dv.detail)}. ${dvRefs}.</p>` : ''}
      ${chart}
      ${cmp}
      <h3 class="svc-sub">Plant inflow by growth layer</h3>
      <table class="dt svc-table plants-table" data-info="tab-plants"><caption>Wastewater treatment plant inflow · ML/d; each layer is what it adds, the running total below${svcOpt.ww === 'calibrated' ? ' · capacity check (calibrated to 2025 flows)' : ''}</caption>
      <thead><tr><th>Layer</th><th>Population</th><th>Average dry<br>weather</th><th>Peak dry<br>weather</th><th>I&amp;I</th><th>Peak wet<br>weather</th><th>Average<br>% of rated</th></tr></thead>
      <tbody>${secs.map(x => block(esc(plantLabel(x.pl)), x.sum, x.f, [...peelExt.filter(e => e.plant === x.pl), ...divTo(x.pl)], ratedOf(x.pl), x.f !== 1 ? `calibrated ×${x.f.toFixed(2)}` : '')).join('')}
        ${block(`Peel total (${secs.map(x => PLANT_SHORT[x.pl]).join(' + ')})`, peel, peelF, peelExt, secs.reduce((t, x) => t + ratedOf(x.pl), 0))}
        ${tor.rows.length ? block(esc(plantLabel('Toronto')), tor.sum, 1, [], 0, 'Malton · not in the Peel total') : ''}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Each plant's whole sewershed (all catchments traced to it): ${Y} Census + external inflows + built since census day + approved + proposed (in review) = build-out. Residential ${c.wastewater.avg} L/cap/d, employment ${c.employment.wastewater} L/emp/d (jobs on development sites). Peak dry weather = residential average × Harmon M on the population + employment average × its peaking factor; external inflows are added at their annual average. Because peaking is not additive, a growth layer's figure is the increase in the plant's peak when it is added (→ running total). I&amp;I = ${c.wastewater.infiltration} L/s/ha on the traced drainage area, counted with the existing system; peak wet weather = peak dry + I&amp;I. Average % of rated = average dry weather ÷ the plant's rated (annual average) capacity. ${Y} Census ${censusHow} (Inglewood's village sits in a large rural dissemination area, so its census share is small; calibration corrects its flow).</p></details>`;
    $('#plants-note').textContent = `${Y} Census baseline (follows the timeline) · flows reaching each wastewater treatment plant, compared with the 2025 annual reports`;
  }
  // References (Breakdown & criteria tab): the Region's 2025 annual reports used for comparison.
  function renderRefs() {
    const R = state.reports, box = $('#d-refs');
    if (!R || !box) return;
    box.hidden = false;
    box.innerHTML = `<h3 class="svc-sub">References <span class="muted small">Region of Peel ${R.year} annual reports, used in the Water, Wastewater and Plants tabs</span></h3>
      <ul class="ref-list">${Object.values(R.reports).map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></li>`).join('')}</ul>
      <p class="small muted">Index pages: <a href="${esc(R.indexPages.wastewater)}" target="_blank" rel="noopener">wastewater annual reports</a> · <a href="${esc(R.indexPages.water)}" target="_blank" rel="noopener">water quality reports</a>. ${esc(R.note)}</p>`;
  }
  // Hover / tap tooltip for the plant capacity chart.
  const capTip = e => {
    const tip = $('#cap-tip'); if (!tip) return;
    const t = e.target.closest && e.target.closest('.cap-chart [data-tip]');
    if (!t) { tip.hidden = true; return; }
    const box = tip.parentElement.getBoundingClientRect(), x = (e.clientX ?? t.getBoundingClientRect().left) - box.left, y = (e.clientY ?? t.getBoundingClientRect().top) - box.top;
    tip.textContent = t.dataset.tip; tip.hidden = false;
    tip.style.left = `${Math.min(box.width - tip.offsetWidth - 4, Math.max(0, x + 12))}px`; tip.style.top = `${Math.max(0, y - 34)}px`;
  };
  $('#plants-body').addEventListener('mousemove', capTip);
  $('#plants-body').addEventListener('mouseleave', () => { const t = $('#cap-tip'); if (t) t.hidden = true; });
  $('#plants-body').addEventListener('focusin', capTip);
  $('#plants-body').addEventListener('click', capTip);
  // ---- Export: a printable report (save as PDF) and an Excel workbook of what is on screen ----
  // Scopes: water, plants, catchments, growth (bottom panel) and dev / selection (side panel).
  const exportBar = scope => `<div class="export-bar" role="group" aria-label="Export"><button type="button" class="btn small" data-export="pdf" data-scope="${scope}">PDF / print</button><button type="button" class="btn small" data-export="xlsx" data-scope="${scope}">Excel</button></div>`;
  const SCOPES = {
    water: { title: 'Water by pressure zone', els: () => [$('#water-body')] },
    plants: { title: 'Wastewater treatment plants and capacity', els: () => [$('#plants-body')] },
    catchments: { title: 'Wastewater by sanitary catchment', els: () => [$('#ww-body')] },
    growth: { title: 'Growth and demand', els: () => [$('#pane-demand'), $('#census')].filter(e => e && !e.hidden) },
    dev: { title: 'Development servicing summary', els: () => [$('#detail-body')] },
  };
  function cleanClone(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('.export-bar, .svc-switch, .svc-switches, button, .grow-tip, #aerial-check, .sel-actions, .d-sel').forEach(x => x.remove());
    c.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
    c.querySelectorAll('[hidden]').forEach(x => x.remove());
    return c;
  }
  function criteriaTableHTML() {
    const c = state.criteria, d = D.DEFAULT_CRITERIA;
    const rows = Object.keys(d).flatMap(g => Object.keys(d[g]).map(k => `<tr${+c[g][k] !== +d[g][k] ? ' class="mod"' : ''}><td>${esc(CRIT_LABEL[g] || g)}</td><td>${esc(k)}</td><td>${esc(String(c[g][k]))}</td><td>${esc(String(d[g][k]))}</td></tr>`));
    return `<table class="dt"><thead><tr><th>Group</th><th>Item</th><th>Used</th><th>Peel default</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;
  }
  function reportMeta(scope) {
    const bc = baselineCensus(), R = state.reports;
    const title = scope === 'dev' && currentProject ? `${SCOPES.dev.title} – ${currentProject.title}` : scope === 'dev' && selection.size ? `Selection servicing summary – ${fmtNum(selection.size)} developments` : SCOPES[scope].title;
    return { title, lines: [
      `Prepared ${new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} with the Peel Development Tracker`,
      `Data: ${state.snapshot ? `applications and permits ${state.snapshot.generatedAt.slice(0, 10)}` : 'live applications'} · ${bc ? `${bc.year} Census` : ''}${R ? ` · Region of Peel ${R.year} annual reports` : ''}`,
      `Wastewater mode: ${svcOpt.ww === 'calibrated' ? 'Capacity check (calibrated to 2025 reported flows)' : 'Design flows (Peel criteria)'} · water max day factor: ${svcOpt.md === 'observed' ? 'observed 2025' : 'design'} · 70 ML/d G.E. Booth → Clarkson diversion: ${svcOpt.div === 'on' ? 'on' : 'off'}`,
      `Filters: ${activeFilters().map(f => f.label).join(', ') || 'none'}`,
      criteriaChanges().length ? `Modified criteria: ${criteriaChanges().join('; ')}` : 'Criteria: Peel defaults',
    ] };
  }
  function exportPDF(scope) {
    const S = SCOPES[scope], m = reportMeta(scope), R = state.reports;
    const base = location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
    const body = S.els().map(e => cleanClone(e).innerHTML).join('<hr>');
    const refs = R ? `<ul>${Object.values(R.reports).map(r => `<li>${esc(r.title)} — ${esc(r.url)}</li>`).join('')}</ul>` : '';
    const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(m.title)}</title>
      <link rel="stylesheet" href="${base}css/app.css"><style>body.report{background:#fff;color:#111;max-width:1100px;margin:0 auto;padding:16px;font:13px/1.4 system-ui,sans-serif}
      .report h1{font-size:20px;margin:0 0 4px}.report .meta{color:#444;margin:0 0 2px}.report .noprint{margin:10px 0}.report section{margin-top:18px}
      .report .svc-table,.report .rep-table,.report .ww-table{min-width:0}.report .svc-table small.tech{display:block}.report tr.mod td{background:#fff3d6}
      .report .cap-chart{max-width:100%}@media print{.noprint{display:none}body.report{padding:0}.report details>summary{display:none}table{page-break-inside:auto}tr{page-break-inside:avoid}}</style></head>
      <body class="report"><h1>${esc(m.title)}</h1>${m.lines.map(l => `<p class="meta small">${esc(l)}</p>`).join('')}
      <p class="noprint"><button onclick="print()">Print / Save as PDF</button></p>
      <main>${body}</main>
      <section><h2>Criteria used</h2>${criteriaTableHTML()}</section>
      <section><h2>References</h2>${refs}<p class="small">Peel Linear Wastewater Standards (2023); Peel Water and Wastewater Modelling Demand Table (Aug 2024); Peel Watermain Design Criteria; Peel Development Charges Background Study (persons per unit); Ontario MECP Procedure D-5-1 (uncommitted reserve capacity). Catchments traced from the Region of Peel sewer network; Statistics Canada census.</p></section>
      <script>addEventListener('load', () => setTimeout(() => print(), 400));<\/script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = `${m.title}.html`; a.click(); }
  }
  // Table → rows for Excel: header labels from (possibly two-row) headers; each cell's main value
  // as a number where it is one, and its sub-lines with a unit (people, jobs, ha) as extra columns.
  function tableRows(t) {
    const grid = [];
    [...(t.tHead ? t.tHead.rows : [])].forEach((tr, r) => {
      grid[r] = grid[r] || []; let col = 0;
      for (const th of tr.cells) {
        while (grid[r][col] !== undefined) col++;
        for (let i = 0; i < th.rowSpan; i++) for (let j = 0; j < th.colSpan; j++) { (grid[r + i] = grid[r + i] || [])[col + j] = th.innerText.replace(/\s+/g, ' ').trim(); }
        col += th.colSpan;
      }
    });
    const ncol = Math.max(0, ...grid.map(g => g.length));
    const heads = Array.from({ length: ncol }, (_, i) => [...new Set(grid.map(g => g[i]).filter(Boolean))].join(' – '));
    const val = el => {
      const c = el.cloneNode(true); c.querySelectorAll('small, .u').forEach(x => x.remove());
      const txt = c.innerText.replace(/\s+/g, ' ').trim(), n = txt.replace(/[,\s]/g, '').replace(/^−/, '-').replace(/^×/, '');
      return /^-?\d+(\.\d+)?%?$/.test(n) ? Number(n.replace('%', '')) : txt;
    };
    const unitOf = el => { const u = el.querySelector(':scope > .u'); if (u) return u.textContent.trim(); const c = el.cloneNode(true); c.querySelectorAll('small').forEach(x => x.remove()); return /^\s*[−-]?[\d,.]+%\s*$/.test(c.textContent) ? '%' : /^\s*×[\d.]+\s*$/.test(c.textContent) ? '×' : ''; };
    const extraKeys = []; const rows = [];
    for (const tr of t.tBodies[0] ? t.tBodies[0].rows : []) {
      const row = { main: [], extra: {} }; let col = 0;
      for (const td of tr.cells) {
        row.main[col] = val(td);
        td.querySelectorAll('small').forEach(sm => sm.querySelectorAll('.u').forEach(u => {
          const prev = u.previousSibling, num = prev && prev.textContent.match(/[−-]?[\d,]+(\.\d+)?\s*$/);
          if (!num) return; const k = `${heads[col] || ''} · ${u.textContent.trim()} (second line)`;
          if (!extraKeys.includes(k)) extraKeys.push(k); row.extra[k] = Number(num[0].replace(/[,\s]/g, '').replace('−', '-'));
        }));
        col += td.colSpan;
      }
      rows.push(row);
    }
    const unitHead = heads.map((h, i) => { const r = t.tBodies[0] && [...t.tBodies[0].rows].find(tr => tr.cells[i] && unitOf(tr.cells[i])); return r ? `${h} (${unitOf(r.cells[i])})` : h; });
    return [[...unitHead, ...extraKeys], ...rows.map(r => [...Array.from({ length: ncol }, (_, i) => r.main[i] ?? ''), ...extraKeys.map(k => r.extra[k] ?? '')])];
  }
  const loadScript = src => new Promise((ok, fail) => { if (window.XLSX) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = fail; document.head.appendChild(s); });
  async function exportXLSX(scope) {
    const S = SCOPES[scope], m = reportMeta(scope);
    try { await loadScript('https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'); } catch (e) { alert('Could not load the Excel library; use PDF / print instead.'); return; }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[m.title], ...m.lines.map(l => [l])]), 'Summary');
    const used = new Set();
    S.els().forEach(el => el.querySelectorAll('table').forEach((t, i) => {
      if (t.closest('[hidden]')) return;
      if (t.closest('details.sect') && t.closest('details.sect').querySelector('[data-info="source-records"]')) return;   // per-file tables: use Export CSV
      const sect = t.closest('details.sect'), h = sect && sect.querySelector('summary h2, summary h3');
      let name = (t.caption ? t.caption.innerText : h ? h.innerText : t.dataset.info || (t.closest('[data-info]') ? t.closest('[data-info]').dataset.info : `Table ${i + 1}`)).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 28) || `Table ${i + 1}`;
      while (used.has(name)) name = `${name.slice(0, 25)} ${used.size}`;
      used.add(name);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(tableRows(t)), name);
    }));
    const crit = state.criteria, d = D.DEFAULT_CRITERIA;
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Group', 'Item', 'Used', 'Peel default'], ...Object.keys(d).flatMap(g => Object.keys(d[g]).map(k => [CRIT_LABEL[g] || g, k, +crit[g][k], +d[g][k]]))]), 'Criteria');
    XLSX.writeFile(wb, `${m.title.replace(/[^\w\s.–-]+/g, '').slice(0, 80)}.xlsx`);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-export]'); if (!b) return;
    (b.dataset.export === 'pdf' ? exportPDF : exportXLSX)(b.dataset.scope);
  });
  // Switches in the Water / Wastewater / Plants tabs.
  for (const id of ['#water-body', '#ww-body', '#plants-body']) $(id).addEventListener('click', e => {
    const b = e.target.closest('[data-svcopt]'); if (!b) return;
    svcOpt[b.dataset.svcopt] = b.dataset.v;
    store.set({ ww: 'svcWwMode', md: 'svcMdMode', div: 'svcDivert', tech: 'svcTech' }[b.dataset.svcopt], b.dataset.v);
    renderSvcTab();
  });
  // Click a zone / catchment row: outline it on the map and zoom to it (a catchment also shades
  // everything upstream that drains through it). Click it again to clear.
  const svcFocus = { id: null, layer: L.layerGroup().addTo(map) };
  function focusSvc(id) {
    svcFocus.layer.clearLayers();
    svcFocus.id = svcFocus.id === id ? null : id;
    for (const r of document.querySelectorAll('.svc-row')) r.classList.toggle('on', r.dataset.svc === svcFocus.id);
    const a = svcFocus.id && svcById.get(svcFocus.id);
    if (!a) return;
    const poly = (x, cls) => L.polygon(x.rings.map(r => r.map(([lng, lat]) => [lat, lng])), { className: cls, interactive: false });
    const up = a.zone ? [] : upstreamOf(a.id, svcFlowTree());
    for (const u of up) poly(u, 'svc-focus-up').addTo(svcFocus.layer);
    const main = poly(a, 'svc-focus').addTo(svcFocus.layer);
    if (!a.zone) drawFlowPath(a, up);
    const b = main.getBounds();
    for (const u of up) b.extend(L.latLngBounds(u.rings.flat().map(([lng, lat]) => [lat, lng])));
    // …and the next outlet downstream, so the first flow arrow out of it is in view.
    const nx = !a.zone && a.downstream && svcById.get(a.downstream);
    const pl = !a.zone && (state.servicing.meta.plants || []).find(p => p.name === a.plant);
    const nxAt = nx ? nx.outletAt || (pl && pl.lnglat) : pl && pl.lnglat;
    if (nxAt) b.extend([nxAt[1], nxAt[0]]);
    map.fitBounds(b, { padding: [30, 30] });
  }
  // Flow arrows (schematic, outlet to outlet): from each upstream outlet into the next
  // catchment, then from this catchment's outlet down the chain to the plant on the lake.
  function drawFlowPath(a, up) {
    const plant = (state.servicing.meta.plants || []).find(p => p.name === a.plant);
    const ll = p => [p[1], p[0]];
    const arrow = (from, to, cls) => { if (from && to && (from[0] !== to[0] || from[1] !== to[1])) L.polyline([ll(from), ll(to)], { className: cls, interactive: false }).addTo(svcFocus.layer); };
    const endOf = d => { const nx = d.downstream && svcById.get(d.downstream); return nx ? (nx.outletAt || (plant && plant.lnglat)) : plant && plant.lnglat; };
    for (const u of up) arrow(u.outletAt, endOf(u), 'svc-flow-up');
    for (let d = a, n = 0; d && n < 30; d = d.downstream && svcById.get(d.downstream), n++) arrow(d.outletAt, endOf(d), 'svc-flow');
    if (plant) L.circleMarker(ll(plant.lnglat), { radius: 6, className: 'svc-plant', interactive: true }).bindTooltip(esc(plantLabel(a.plant)), { className: 'pt' }).addTo(svcFocus.layer);
    addFlowMarker();
  }
  // SVG arrowheads for the flow lines (one <marker> per map renderer).
  function addFlowMarker() {
    const svg = map.getPanes().overlayPane.querySelector('svg');
    if (!svg || svg.querySelector('#flow-head')) return;
    const ns = 'http://www.w3.org/2000/svg';
    const defs = document.createElementNS(ns, 'defs');
    defs.innerHTML = '<marker id="flow-head" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#c2410c"/></marker>';
    svg.insertBefore(defs, svg.firstChild);
  }
  for (const id of ['#water-body', '#ww-body']) {
    $(id).addEventListener('click', e => { const r = e.target.closest('[data-svc]'); if (r) focusSvc(r.dataset.svc); });
    $(id).addEventListener('keydown', e => { const r = e.target.closest('[data-svc]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); focusSvc(r.dataset.svc); } });
  }

  // ---- Planning areas: secondary plans / character areas and MTSAs ------------------------
  const areaById = new Map();
  const areaLayer = L.layerGroup().addTo(map);
  async function loadAreas() {
    try {
      const res = await fetch('data/areas.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const a = await res.json();
      state.areas = { secondaryPlans: PeelAreas.prepare(a.secondaryPlans), mtsas: PeelAreas.prepare(a.mtsas), census: a.census, sources: a.sources, generatedAt: a.generatedAt };
      for (const x of [...state.areas.secondaryPlans, ...state.areas.mtsas]) areaById.set(x.id, x);
      // Census years (newest first): 2021 always; earlier ones (2016) when published.
      const list = a.censuses || (a.census ? [{ year: 2021, ...a.census }] : []);
      state.censuses = list.map(c => {
        const year = c.year || Number(String(c.date).slice(0, 4));
        return { year, date: c.date, source: c.source, das: PeelAreas.tagCensus(c), outlines: c.outlines ? `data/${c.outlines}` : year === 2021 ? 'data/das.json' : `data/das-${year}.json` };
      }).sort((x, y) => y.year - x.year);
      state.censusDas = state.censuses.length ? state.censuses[0].das : null;
      tagProjects();
      renderAreaSelects();
      applyFilters();
    } catch (e) { /* areas are optional */ }
  }
  function tagProjects() {
    tagServicing();
    if (!state.areas) return;
    for (const p of state.projects) {
      p.sp = PeelAreas.locate(state.areas.secondaryPlans, p.lng, p.lat, p.municipality);
      p.mtsa = PeelAreas.locate(state.areas.mtsas, p.lng, p.lat, p.municipality);
    }
  }
  function renderAreaSelects() {
    if (!state.areas) return;
    const fill = (sel, list, all, cur) => {
      const munis = [...new Set(list.map(a => a.municipality))].filter(m => !state.muni || m === state.muni);
      sel.innerHTML = `<option value="">${all}</option>` + munis.map(m =>
        `<optgroup label="${esc(m)}">${list.filter(a => a.municipality === m).map(a => `<option value="${esc(a.id)}"${a.id === cur ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</optgroup>`).join('');
    };
    fill($('#f-mtsa'), state.areas.mtsas, 'All MTSAs', state.mtsa);
    renderSpList();
    $('#f-sp-note').hidden = !(state.muni === 'Mississauga' || state.sp.some(id => (areaById.get(id) || {}).municipality === 'Mississauga'));
  }
  // Secondary plans: a checkbox list (several can be chosen), grouped by municipality.
  function spSummary() {
    const n = state.sp.length;
    return !n ? 'All areas' : n === 1 ? (areaById.get(state.sp[0]) || {}).name || '1 area' : `${n} areas`;
  }
  function renderSpList() {
    const q = ($('#f-sp-q').value || '').trim().toLowerCase();
    const list = state.areas.secondaryPlans.filter(a => (!state.muni || a.municipality === state.muni) && (!q || a.name.toLowerCase().includes(q)));
    const munis = [...new Set(list.map(a => a.municipality))];
    $('#f-sp-list').innerHTML = munis.map(m => `<div class="multi-group">${esc(m)}</div>` + list.filter(a => a.municipality === m).map(a =>
      `<label class="multi-item"><input type="checkbox" value="${esc(a.id)}"${state.sp.includes(a.id) ? ' checked' : ''}><span>${esc(a.name)}</span></label>`).join('')).join('')
      || '<p class="small muted">No match.</p>';
    $('#f-sp-summary').textContent = spSummary();
    $('#f-sp').classList.toggle('on', state.sp.length > 0);
  }
  // Outline the chosen areas on the map and zoom to them.
  function showArea(zoom) {
    areaLayer.clearLayers();
    const shown = [...state.sp, state.mtsa].filter(Boolean).map(id => areaById.get(id)).filter(Boolean);
    let bounds = null;
    for (const a of shown) {
      const l = L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), {
        renderer: canvas, interactive: false, fill: true, fillOpacity: 0.06, weight: 2.5, dashArray: '8 6',
        color: a.id.startsWith('mtsa') ? '#d4a017' : '#e8590c',
      });
      areaLayer.addLayer(l);
      bounds = bounds ? bounds.extend(l.getBounds()) : l.getBounds();
    }
    if (zoom && bounds) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 16 });
  }
  $('#f-sp-list').onchange = e => {
    const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
    state.sp = cb.checked ? [...new Set([...state.sp, cb.value])] : state.sp.filter(id => id !== cb.value);
    $('#f-sp-summary').textContent = spSummary();
    $('#f-sp').classList.toggle('on', state.sp.length > 0);
    $('#f-sp-note').hidden = !(state.muni === 'Mississauga' || state.sp.some(id => (areaById.get(id) || {}).municipality === 'Mississauga'));
    showArea(true); applyFilters();
  };
  $('#f-sp-q').oninput = () => renderSpList();
  $('#f-sp-clear').onclick = () => { state.sp = []; $('#f-sp-q').value = ''; renderSpList(); showArea(); applyFilters(); };
  // Close the list when tapping elsewhere.
  document.addEventListener('click', e => { const d = $('#f-sp'); if (d.open && !d.contains(e.target)) d.open = false; });
  $('#f-mtsa').onchange = e => { state.mtsa = e.target.value; showArea(true); applyFilters(); };

  // ---- Selected project's census dissemination area ----------------------------------------
  // Opening a project narrows the Growth and Servicing demand tabs to the census DA its point
  // falls in (for the baseline census year): the DA's census count, and the development
  // applications located in the same DA. Closing the project goes back to Peel.
  const daFocusLayer = L.layerGroup().addTo(map);
  const daScopeName = () => [state.mtsa && areaById.get(state.mtsa) && areaById.get(state.mtsa).name, state.sp.length && spSummary(), state.muni].filter(Boolean)[0] || 'Peel';
  let daCtxToken = 0;
  function setDaContext(p) {
    const token = ++daCtxToken;
    const bc = baselineCensus();
    if (!p || p.lat == null || !bc) {
      if (state.daCtx) { state.daCtx = null; daFocusLayer.clearLayers(); renderDemand(); renderCensus(); }
      return;
    }
    loadDaData(bc.year, bc.outlines).then(d => {
      if (token !== daCtxToken) return;
      const x = p.lng, y = p.lat;
      const hit = d.das.find(da => x >= da.bbox[0] && x <= da.bbox[2] && y >= da.bbox[1] && y <= da.bbox[3] && P.pointInRings(x, y, da[4]));
      daFocusLayer.clearLayers();
      if (!hit) { state.daCtx = null; renderDemand(); renderCensus(); return; }
      const [id, pop, dw, muni, rings] = hit;
      const inside = state.projects.filter(q => q.lat != null && q.lng >= hit.bbox[0] && q.lng <= hit.bbox[2] && q.lat >= hit.bbox[1] && q.lat <= hit.bbox[3] && P.pointInRings(q.lng, q.lat, rings));
      state.daCtx = { key: p.key, project: p, title: p.title, year: bc.year, id, pop, dw, muni, rings, projects: inside, keys: new Set(inside.map(q => q.key)) };
      L.polygon(rings.map(r => r.map(([lx, ly]) => [ly, lx])), { className: 'da-focus', interactive: false }).addTo(daFocusLayer);
      renderDemand(); renderCensus();
    }).catch(() => { if (token === daCtxToken && state.daCtx) { state.daCtx = null; daFocusLayer.clearLayers(); renderDemand(); renderCensus(); } });
  }

  $('#census').addEventListener('click', e => { if (e.target.closest('[data-clear-da]')) setDaContext(null); });

  // ---- Growth since the census (selected geography) ---------------------------------------
  // The baseline follows the timeline: the latest census held in or before its first year
  // (2021–2026 → 2021 Census; 2018–2026 → 2016 Census). Before the earliest census with data,
  // or with all years, the earliest one.
  function baselineCensus() {
    const cs = state.censuses || [];
    if (!cs.length) return null;
    const start = timeActive() ? (state.yearFrom ?? state.yearMin) : -Infinity;
    return cs.find(c => c.year <= start) || cs[cs.length - 1];
  }
  const censusDay = d => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-CA', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  function renderCensus() {
    renderSvcTab();
    const bc = baselineCensus();
    const has = !!(bc && bc.das.length && state.projects.length);
    $('#census').dataset.off = has ? '' : '1';
    if (bc) $('#c-head').textContent = `Growth since the ${bc.year} Census`;
    showFootTab(footPref);
    syncDaYear();
    if (!has) return;
    const Y = bc.year;
    const da = state.daCtx;
    // The baseline year changed under a selected project: find its DA for the new year.
    if (da && da.year !== Y) { setDaContext(da.project); return; }
    const g = { muni: state.muni, sp: state.sp, mtsa: state.mtsa };
    const base = da ? { population: da.pop, dwellings: da.dw, das: 1 } : PeelAreas.censusTotals(bc.das, g);
    const gr = PeelAreas.growthSince(da ? da.projects : state.projects, da ? {} : g, bc.date, state.criteria);
    const name = da ? `DA ${da.id} (${da.muni || 'Peel'}), around ${da.title} · ${fmtNum(da.projects.length)} development site${da.projects.length === 1 ? '' : 's'} in this DA`
      : [state.mtsa && areaById.get(state.mtsa).name, state.sp.length && spSummary(), state.muni].filter(Boolean)[0] || 'Peel Region';
    $('#c-ctx').innerHTML = da ? `<button type="button" class="d-pill da" data-clear-da title="Back to all of ${esc(daScopeName())}">DA ${esc(da.id)} · around ${esc(da.title)} <span aria-hidden="true">×</span></button>
      <span class="muted small">Census dissemination area of the selected development; growth from every development application located in it.</span>` : '';
    const pct = (a, b) => b > 0 ? ` (+${(a / b * 100).toFixed(1)}%)` : '';
    const nowPop = base.population + gr.built.population, nowDw = base.dwellings + gr.built.units;
    const futPop = nowPop + gr.approved.population, futDw = nowDw + gr.approved.units;
    const allPop = futPop + gr.proposed.population, allDw = futDw + gr.proposed.units;
    const tile = (label, pop, dw, sub, info) => `<div class="tile" data-info="${info}"><div class="tl">${label}</div>
      <div class="tv">${fmtNum(Math.round(pop))}<span class="tu">people</span></div>
      <div class="ts">${fmtNum(Math.round(dw))} dwellings${sub ? ` · ${sub}` : ''}</div></div>`;
    $('#c-tiles').innerHTML = [
      tile(da ? `${Y} Census · DA ${da.id}` : `${Y} Census`, base.population, base.dwellings, da ? 'the selected development’s dissemination area' : `${fmtNum(base.das)} dissemination area${base.das === 1 ? '' : 's'}${state.sp.length || state.mtsa ? ', share by land area' : ''}`, 'census-base'),
      tile('+ Built since (estimate today)', nowPop, nowDw, `+${fmtNum(gr.built.units)} units${pct(gr.built.units, base.dwellings)}`, 'census-built'),
      tile('+ Approved, not yet built', futPop, futDw, `+${fmtNum(gr.approved.units)} units${pct(futDw - base.dwellings, base.dwellings)} vs ${Y}`, 'census-approved'),
      tile('+ Proposed: full build-out of applications', allPop, allDw, `+${fmtNum(gr.proposed.units)} units${pct(allDw - base.dwellings, base.dwellings)} vs ${Y}`, 'census-proposed'),
    ].join('');
    renderGrowthChart(base, gr, Y);
    const ha = gr.built.ha + gr.approved.ha + gr.proposed.ha, ii = gr.built.ii + gr.approved.ii + gr.proposed.ii;
    $('#c-ii').textContent = ha > 0 ? `Wastewater I&I from growth since ${Y}: ${fmt1(ii)} L/s on ${fmtNum(Math.round(ha))} ha of development sites (built ${fmt1(gr.built.ii)} · approved ${fmt1(gr.approved.ii)} · proposed ${fmt1(gr.proposed.ii)} L/s; ${state.criteria.wastewater.infiltration} L/s/ha).` : '';
    const start = timeActive() ? (state.yearFrom ?? state.yearMin) : null;
    const earliest = state.censuses[state.censuses.length - 1].year;
    const why = start == null ? `all years: earliest census with data (${earliest})` : start < earliest ? `timeline starts ${start}; earliest census with data is ${earliest}` : `timeline starts ${start}`;
    $('#c-note').textContent = `${name} · ${Y} Census baseline (${why}) · built = permits completed since census day (${censusDay(bc.date)})${gr.built.estimatedDates ? '; Brampton and Caledon completion dates estimated from issue date' : ''}; approved = committed growth; proposed = applications in pre-consultation or review; people at Peel persons-per-unit · other filters ignored`;
  }

  // Stacked bar: 2021 baseline, then each layer of growth up to full build-out of the
  // planning applications. One bar per measure (people, dwellings), sharing nothing but the
  // layer order, so there is no second axis. Values are direct-labelled in the legend.
  function renderGrowthChart(base, gr, Y = 2021) {
    const layers = [
      { key: 'base', label: `${Y} Census`, people: base.population, dwellings: base.dwellings },
      { key: 'built', label: `Built since ${Y}`, people: gr.built.population, dwellings: gr.built.units },
      { key: 'approved', label: 'Approved', people: gr.approved.population, dwellings: gr.approved.units },
      { key: 'proposed', label: 'Proposed (in review)', people: gr.proposed.population, dwellings: gr.proposed.units },
    ];
    const bar = (measure, unit) => {
      const total = layers.reduce((t, l) => t + l[measure], 0);
      if (!(total > 0)) return '';
      const segs = layers.filter(l => l[measure] > 0).map(l => {
        const w = l[measure] / total * 100;
        const tip = `${l.label}: ${fmtNum(Math.round(l[measure]))} ${unit} (${w.toFixed(1)}% of build-out)`;
        return `<span class="gseg g-${l.key}" style="flex:${l[measure]}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></span>`;
      }).join('');
      return `<div class="grow-row"><div class="grow-label">${unit[0].toUpperCase() + unit.slice(1)}</div>
        <div class="grow-bar" role="img" aria-label="${esc(layers.map(l => `${l.label} ${fmtNum(Math.round(l[measure]))}`).join(', '))} ${unit}">${segs}</div>
        <div class="grow-total">${fmtNum(Math.round(total))}<span class="u">${unit === 'people' ? 'pop' : 'units'}</span></div></div>`;
    };
    const legend = layers.map(l => `<li><i class="gsw g-${l.key}" aria-hidden="true"></i><span>${esc(l.label)}</span>
      <span class="gv">${l.key === 'base' ? '' : '+'}${fmtNum(Math.round(l.people))} people · ${l.key === 'base' ? '' : '+'}${fmtNum(Math.round(l.dwellings))} dwellings</span></li>`).join('');
    $('#c-chart').innerHTML = `${bar('people', 'people')}${bar('dwellings', 'dwellings')}
      <ul class="grow-legend">${legend}</ul><div class="grow-tip" id="grow-tip" hidden></div>`;
  }
  // Hover / tap tooltip for the growth bars.
  const growTip = e => {
    const s = e.target.closest('[data-tip]'), tip = $('#grow-tip');
    if (!tip) return;
    if (!s) { tip.hidden = true; return; }
    tip.textContent = s.dataset.tip; tip.hidden = false;
    const box = $('#c-chart').getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 220, Math.max(0, e.clientX - box.left + 12))}px`;
    tip.style.top = `${e.clientY - box.top - 34}px`;
  };
  $('#c-chart').addEventListener('pointermove', growTip);
  $('#c-chart').addEventListener('pointerdown', growTip);   // tap on phones
  $('#c-chart').addEventListener('pointerleave', () => { const t = $('#grow-tip'); if (t) t.hidden = true; });
  $('#c-chart').addEventListener('focusin', e => {
    const s = e.target.closest('[data-tip]'), tip = $('#grow-tip'); if (!s || !tip) return;
    tip.textContent = s.dataset.tip; tip.hidden = false; tip.style.left = '0px'; tip.style.top = '-28px';
  });

  // Quick views: a phase (or phase group) plus an optional focus.
  const ALL_PHASE_KEYS = () => new Set(P.ALL_PHASES.map(p => p.key));
  const ACTIVE_PHASES = ['inception', 'review', 'approved', 'permit', 'construction'];
  const PLANNING_PHASES = ['inception', 'review', 'approved'];
  const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  function currentPhaseView() {
    if (state.phases.size === P.ALL_PHASES.length) return 'all';
    if (sameSet(state.phases, new Set(ACTIVE_PHASES))) return 'active';
    return state.phases.size === 1 ? [...state.phases][0] : null;
  }
  $('#phase-chips').onclick = e => {
    const b = e.target.closest('[data-pv]'); if (!b) return;
    const k = b.dataset.pv;
    if (k === 'all') state.phases = ALL_PHASE_KEYS();
    else if (k === 'active') state.phases = currentPhaseView() === 'active' ? ALL_PHASE_KEYS() : new Set(ACTIVE_PHASES);
    else return togglePhase(k);
    applyFilters();
  };

  const YEAR_MS = 365.25 * 864e5;
  const appUnits = p => p._appUnits ?? (p._appUnits = Math.max(0, ...p.records.filter(r => r.kind === 'application').map(r => r.units || 0)));
  const weekKeys = () => {
    const c = state.snapshot && state.snapshot.changes;
    if (!c || c.baseline) return null;
    return state._weekKeys || (state._weekKeys = new Set([...(c.moved || []), ...(c.added || [])].map(x => x.key)));
  };
  // Each focus narrows the projects; `basis` switches the demand panel to the matching units.
  const FOCUS = {
    growth:    { label: 'Growth', title: 'Planning applications proposing new dwelling units', test: p => appUnits(p) > 0 },
    committed: { label: 'Committed capacity', basis: 'committed', title: 'Growth that is approved or permitted and not yet completed', test: p => D.unitsFor(p, 'committed') > 0 },
    left:      { label: 'Left to build', basis: 'remaining', title: 'Planned units with no building permit yet', test: p => !!(p.buildout && p.buildout.remaining > 0) },
    employment: { label: 'Employment', title: 'Applications for industrial, office, retail / commercial, hotel or institutional uses', test: p => !!(empOf(p)) },
    major:     { label: 'Major (100+ units)', title: 'Projects with 100 or more units', test: p => (p.units || 0) >= 100 },
    newapps:   { label: 'New in last 12 months', title: 'First filed in the last 12 months', test: p => !!p.first && Date.now() - p.first < YEAR_MS },
    // Planning stage only: many open permits have no inspection dates in the source data.
    stalled:   { label: 'Stalled 2+ years', title: 'Applications in planning (no building permit) with no activity for 2 years', test: p => PLANNING_PHASES.includes(p.phase) && !!p.last && Date.now() - p.last > 2 * YEAR_MS },
    week:      { label: 'Changed this week', title: 'New, or moved to another phase, in the latest weekly update', test: p => { const k = weekKeys(); return !!k && k.has(p.key); }, hidden: () => !weekKeys() },
  };
  function renderFocusChips() {
    const base = state.projects.filter(p => matches(p, false, false, true));
    $('#focus-chips').innerHTML = Object.entries(FOCUS).filter(([, f]) => !(f.hidden && f.hidden())).map(([k, f]) => {
      const on = state.focus === k;
      const count = base.reduce((a, p) => a + (f.test(p) ? 1 : 0), 0);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-focus="${k}" data-info="focus-${k}" aria-pressed="${on}" title="${esc(f.title)}">${esc(f.label)} <span class="n">${fmtNum(count)}</span></button>`;
    }).join('');
  }
  function setFocus(k) {
    state.focus = state.focus === k ? '' : k;
    applyFilters();
  }
  $('#focus-chips').onclick = e => { const b = e.target.closest('[data-focus]'); if (b) setFocus(b.dataset.focus); };

  // Active-filter chips: everything that narrows the view, each removable.
  function activeFilters() {
    const out = [];
    const kindLabel = { application: 'Planning applications', permit: 'Building permits', both: 'Application + permits' };
    const unitsLabel = { 1: 'Growth', 10: '10+ units', 50: '50+ units', 100: '100+ units', 500: '500+ units', left: 'Units left to build', committed: 'Committed capacity' };
    if (state.search) out.push({ label: `“${state.search}”`, clear: () => { state.search = ''; $('#f-search').value = ''; } });
    if (state.muni) out.push({ label: state.muni, clear: () => { state.muni = ''; renderMuniChips(); renderAreaSelects(); } });
    if (state.sp.length <= 3) for (const id of state.sp) out.push({ label: (areaById.get(id) || {}).name || 'Secondary plan', clear: () => { state.sp = state.sp.filter(x => x !== id); renderAreaSelects(); showArea(); } });
    else out.push({ label: `${state.sp.length} secondary plans`, clear: () => { state.sp = []; renderAreaSelects(); showArea(); } });
    if (state.mtsa) out.push({ label: `MTSA: ${(areaById.get(state.mtsa) || {}).name || ''}`, clear: () => { state.mtsa = ''; renderAreaSelects(); showArea(); } });
    if (state.pz) out.push({ label: (svcById.get(state.pz) || {}).name || 'Pressure zone', clear: () => { state.pz = ''; renderSvcSelects(); showSvcArea(); } });
    if (state.dr) out.push({ label: `Drainage: ${(svcById.get(state.dr) || {}).name || ''}`, clear: () => { state.dr = ''; renderSvcSelects(); showSvcArea(); } });
    if (state.kind !== DEFAULT_KIND) out.push({ label: kindLabel[state.kind] || 'All records', clear: () => { state.kind = DEFAULT_KIND; $('#f-kind').value = DEFAULT_KIND; } });
    if (state.minUnits) out.push({ label: unitsLabel[state.minUnits], clear: () => { state.minUnits = 0; $('#f-units').value = '0'; } });
    if (state.focus) out.push({ label: FOCUS[state.focus].label, clear: () => setFocus(state.focus) });
    if (state.phases.size < P.ALL_PHASES.length) {
      const names = P.ALL_PHASES.filter(p => state.phases.has(p.key)).map(p => p.label);
      out.push({ label: names.length <= 2 ? names.join(' + ') : `${names.length} phases`, clear: () => { state.phases = ALL_PHASE_KEYS(); } });
    }
    if (timeActive()) {
      const from = state.yearFrom ?? state.yearMin, to = state.yearTo ?? state.yearMax;
      out.push({ label: from === to ? `${from}` : `${from}–${to}`, clear: () => setYearsSilently(state.yearMin, state.yearMax) });
    }
    if (!state.newOnly) out.push({ label: 'Including alterations', clear: () => { state.newOnly = true; $('#f-new').checked = true; } });
    return out;
  }
  let activeList = [];
  // One-line summaries on the collapsed sidebar sections.
  function renderSectionSummaries() {
    $('#sum-focus').textContent = state.focus ? FOCUS[state.focus].label : 'None';
    $('#sect-focus').classList.toggle('active', !!state.focus);
    const where = [state.muni || 'All of Peel', state.sp.length ? spSummary() : '', state.mtsa ? `MTSA: ${(areaById.get(state.mtsa) || {}).name || ''}` : '',
      state.pz ? (svcById.get(state.pz) || {}).name : '', state.dr ? `Drainage: ${(svcById.get(state.dr) || {}).name || ''}` : ''].filter(Boolean);
    $('#sum-where').textContent = where.join(' · ');
    $('#sect-where').classList.toggle('active', !!(state.muni || state.sp.length || state.mtsa || state.pz || state.dr));
    const kindLabel = { application: 'Applications + their permits', '': 'All records', permit: 'Building permits', both: 'Application + permits' };
    const more = [kindLabel[state.kind], state.minUnits ? $('#f-units').selectedOptions[0].textContent : '', state.newOnly ? '' : 'incl. alterations'].filter(Boolean);
    $('#sum-more').textContent = more.join(' · ');
    $('#sect-more').classList.toggle('active', state.kind !== DEFAULT_KIND || !!state.minUnits || !state.newOnly);
  }
  function renderFilterUI() {
    renderSectionSummaries();
    activeList = activeFilters();
    $('#active-filters').innerHTML = activeList.length
      ? activeList.map((f, i) => `<button type="button" class="chip on removable" data-i="${i}" title="Remove filter">${esc(f.label)} <span aria-hidden="true">×</span></button>`).join('') +
        `<button type="button" class="btn small link" id="f-reset">Reset all</button>`
      : '';
  }
  $('#active-filters').onclick = e => {
    if (e.target.closest('#f-reset')) {
      Object.assign(state, { muni: '', sp: [], mtsa: '', pz: '', dr: '', kind: DEFAULT_KIND, search: '', minUnits: 0, newOnly: true, phases: ALL_PHASE_KEYS(), focus: DEFAULT_FOCUS });
      $('#f-search').value = ''; $('#f-kind').value = DEFAULT_KIND; $('#f-units').value = '0'; $('#f-new').checked = true;
      renderMuniChips();
      setDefaultYears();
      applyFilters();
      return;
    }
    const b = e.target.closest('[data-i]'); if (!b) return;
    activeList[+b.dataset.i].clear();
    applyFilters();
  };

  // ---- Duplicate check (Data tab) ------------------------------------------------------
  // Evidence that every file and unit is counted once; computed on demand (all records,
  // ignoring the filters).
  function renderAudit() {
    if (!state.auditInput || !state.projects.length || !window.PeelAudit) return;
    const a = state.audit || (state.audit = PeelAudit.audit(state.auditInput.raw, state.auditInput.records, state.projects));
    const u = a.units, r = a.records;
    const ok = a.checks.every(c => c.value === 0);
    $('#audit-status').textContent = ok ? 'All checks pass' : 'Check failed';
    const line = (label, v, sign = '−') => `<tr><td>${sign} ${esc(label)}</td><td>${fmtNum(Math.round(v))}</td></tr>`;
    const pairs = a.possible.slice(0, 12).map((x, i) => `<li>
        <button type="button" class="btn small link" data-ap="${i}|0">${esc(x.projects[0].title)}</button> (${fmtNum(x.projects[0].units)})
        ↔ <button type="button" class="btn small link" data-ap="${i}|1">${esc(x.projects[1].title)}</button> (${fmtNum(x.projects[1].units)})
        <span class="muted">· ${Math.round(x.metres)} m${x.sameUnits ? ' · same units' : ''}</span></li>`).join('');
    $('#audit-body').innerHTML = `
      <p class="small">${fmtNum(r.raw)} records from ${fmtNum(r.bySource.length)} layers → <strong>${fmtNum(r.copiesMerged)}</strong> copies of the same file merged
        (${fmtNum(r.mergedGroups)} files listed in more than one layer or spelling) → ${fmtNum(r.unique)} unique files → ${fmtNum(r.projects)} projects.</p>
      <ul class="audit-checks">${a.checks.map(c => `<li class="${c.value ? 'bad' : 'good'}"><span aria-hidden="true">${c.value ? '✕' : '✓'}</span> ${esc(c.label)}: <strong>${fmtNum(c.value)}</strong></li>`).join('')}</ul>
      <table class="dt audit-units"><caption>Units: every record → counted once</caption><tbody>
        <tr><td>Units on every record</td><td>${fmtNum(u.raw)}</td></tr>
        ${line('copies of the same file', u.duplicateCopies)}
        ${line('withdrawn / refused files', u.withdrawn)}
        ${line('repeat applications for one proposal', u.repeatApps)}
        ${line('repeat permits for one building', u.repeatPermits)}
        ${line('permits already in their planning application', u.permitsInApps)}
        ${line('sites with no plan: largest figure on any file', Math.abs(u.other), u.other < 0 ? '+' : '−')}
        <tr class="total"><td>= Units counted</td><td>${fmtNum(u.counted)}</td></tr>
      </tbody></table>
      <p class="small muted">Units counted equals the demand panel's “All units” with every filter off (all years, all phases).</p>
      <h3 class="label sub-label">Possible duplicates left: ${fmtNum(a.possible.length)}</h3>
      <p class="small muted">Separate developments of 20+ units within 60 m of each other${a.possibleSameUnits ? `, ${fmtNum(a.possibleSameUnits)} with the same unit count` : ' (none with the same unit count)'}. Usually neighbouring buildings; tap to check.</p>
      ${pairs ? `<ol class="audit-pairs small">${pairs}</ol>` : ''}
      <div class="row btns"><button type="button" class="btn small" id="audit-csv" title="Every file, the development it is counted in, and its units">Download audit CSV</button></div>`;
  }
  $('#audit-body').addEventListener('click', e => {
    const b = e.target.closest('[data-ap]');
    if (b) { const [i, j] = b.dataset.ap.split('|').map(Number); focusProject(state.audit.possible[i].projects[j]); return; }
    if (e.target.closest('#audit-csv')) {
      const cell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
      const cols = ['project', 'project_address', 'municipality', 'project_units_counted', 'planned', 'permitted', 'file', 'kind', 'file_address', 'file_units', 'file_status', 'phase', 'source', 'also_in'];
      const rows = [cols.join(',')];
      for (const p of state.projects) for (const r of p.records) {
        rows.push([p.key, p.title, p.municipality, p.phase === 'cancelled' ? 0 : p.units || 0, p.buildout ? p.buildout.planned : '', p.buildout ? p.buildout.permitted : '',
          r.ref, r.kind, r.address, r.units ?? '', r.statusRaw, r.phase, r.sourceName, (r.alsoIn || []).join('; ')].map(cell).join(','));
      }
      download('peel-duplicate-audit.csv', rows.join('\n'), 'text/csv');
    }
  });

  // Sidebar tabs.
  function showTab(name) {
    for (const b of document.querySelectorAll('.tabs [data-tab]')) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      $('#tab-' + b.dataset.tab).hidden = !on;
    }
    store.set('tab', name);
    if (name === 'data') renderAudit();
  }
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
  showTab(store.get('tab', 'explore'));

  $('#s-since').value = state.sinceYear;
  $('#s-max').value = state.maxPerLayer;
  $('#s-since').onchange = e => { state.sinceYear = Number(e.target.value) || 0; store.set('sinceYear', state.sinceYear); };
  $('#s-max').onchange = e => { state.maxPerLayer = Math.max(500, Number(e.target.value) || CFG.maxPerLayer); store.set('maxPerLayer', state.maxPerLayer); };
  // Refresh live: re-query every enabled source now instead of using the weekly snapshot.
  $('#btn-reload').onclick = () => { for (const s of state.sources) { s.records = []; s.status = 'idle'; s.msg = ''; } scheduleRebuild(); loadAll(); };
  $('#btn-discover').onclick = discover;

  $('#source-list').onchange = e => {
    const i = e.target.dataset.i; if (i == null) return;
    const s = state.sources[+i];
    s.enabled = e.target.checked; saveSources(); renderSources();
    if (s.enabled && s.status !== 'ok') { inflight++; showLoading(); loadSource(s).then(() => { inflight--; showLoading(); }); }
    else scheduleRebuild();
  };
  $('#source-list').onclick = e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [s] = state.sources.splice(+b.dataset.rm, 1);
    removed.add(s.id); saveSources(); renderSources(); scheduleRebuild();
  };
  $('#add-source').onsubmit = e => {
    e.preventDefault();
    const url = $('#a-url').value.trim();
    const muni = $('#a-muni').value, kind = $('#a-kind').value;
    const name = `${muni} – ${decodeURIComponent((url.match(/services\/(.+?)\/(Feature|Map)Server/i) || [, url])[1]).replace(/_/g, ' ')}`;
    const src = { id: `custom-${Date.now()}`, name, municipality: muni, kind, url, enabled: true, status: 'idle', msg: '', records: [] };
    state.sources.push(src); saveSources(); renderSources();
    $('#a-url').value = '';
    inflight++; showLoading(); loadSource(src).then(() => { inflight--; showLoading(); });
  };

  function toggleSidebar(open) {
    const sb = $('#sidebar');
    const o = open ?? !sb.classList.contains('open');
    sb.classList.toggle('open', o);
    document.querySelector('.app').classList.toggle('sidebar-open', o);
    $('#toggle-sidebar').textContent = o ? 'Map' : 'List';
  }
  $('#toggle-sidebar').onclick = () => toggleSidebar();
  $('#legend').onclick = () => $('#legend').classList.toggle('expanded');
  // Bottom panel: collapse to just its tabs to give the map room; tapping a tab opens it again.
  function setFooterCollapsed(collapsed) {
    $('#footer').classList.toggle('collapsed', collapsed);
    $('#footer-toggle').textContent = collapsed ? 'Show' : 'Hide';
    $('#footer-toggle').setAttribute('aria-expanded', String(!collapsed));
  }
  $('#footer-toggle').onclick = () => setFooterCollapsed(!$('#footer').classList.contains('collapsed'));
  $('#footer').querySelector('.f-tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    footPref = t.dataset.tab; store.set('footTab3', footPref);
    showFootTab(footPref); setFooterCollapsed(false);
  });
  // Floating timeline: folds to its header (collapsed by default on phones).
  function setTimelineOpen(open) {
    $('#timebar').classList.toggle('folded', !open);
    $('#t-toggle').setAttribute('aria-expanded', String(open));
    $('#t-toggle').textContent = open ? '▾' : '▴';
  }
  $('#t-toggle').onclick = () => { const open = $('#timebar').classList.contains('folded'); setTimelineOpen(open); store.set('timelineOpen', open); };
  setTimelineOpen(store.get('timelineOpen', !matchMedia('(max-width: 760px)').matches));

  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    readColors(); for (const k in iconCache) delete iconCache[k]; setTiles(); renderLegend(); applyFilters();
  });

  // Keep the map and the detail drawer sized around the footer.
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--footer-h', `${$('#footer').offsetHeight}px`);
    map.invalidateSize();
  }).observe($('#footer'));

  // Version stamped at deploy time (index.html meta + ?v= on every script).
  const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || 'dev';
  function renderVersion() {
    const d = state.snapshot ? ` · data ${state.snapshot.generatedAt.slice(0, 10)}` : '';
    $('#app-version').textContent = `App version ${APP_VERSION === '__BUILD__' ? 'dev' : APP_VERSION}${d}`;
  }

  // ---- Boot ------------------------------------------------------------------------
  readColors();
  setTiles();
  renderLegend();
  renderSources();
  renderVersion();
  renderCriteria();
  updateYearBounds();
  applyFilters();
  boot();

  // Start from the weekly snapshot (fast, survives source outages); fall back to live.
  async function boot() {
    let snap = null;
    try {
      const res = await fetch('data/snapshot.json', { cache: 'no-cache' });
      if (res.ok) snap = await res.json();
    } catch (e) { /* no snapshot published, or opened from disk */ }
    if (!snap || !Array.isArray(snap.records)) { loadAll(); return; }
    applySnapshot(snap);
    // User-added sources aren't in the snapshot: load those live.
    const missing = state.sources.filter(s => s.enabled && !s.fromSnapshot);
    inflight += missing.length; showLoading();
    for (const s of missing) { await loadSource(s); inflight--; showLoading(); }
    fetch('data/history.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(h => { state.history = h; }).catch(() => {});
  }
  loadAreas();
  loadServicing();

  function applySnapshot(snap) {
    state.snapshot = { generatedAt: snap.generatedAt, changes: snap.changes, note: snap.note };
    const byRoot = new Map();
    for (const o of snap.records) {
      const id = String(o.sourceId).split('/')[0];
      if (!byRoot.has(id)) byRoot.set(id, []);
      byRoot.get(id).push(o);
    }
    for (const meta of snap.sources) {
      if (removed.has(meta.id)) continue;
      let src = state.sources.find(s => s.id === meta.id);
      if (!src) {
        src = { ...meta, enabled: disabled[meta.id] != null ? !disabled[meta.id] : true, records: [] };
        state.sources.push(src);
      }
      src.fromSnapshot = true;
      src.records = (byRoot.get(meta.id) || []).map(o => ({
        sourceName: meta.name, ref: '', address: '', type: '', description: '', ward: '', statusRaw: '',
        units: null, gfa: null, newBuild: false, unitMix: null, props: {}, ...o,
        events: (o.events || []).map(([d, phase, label]) => ({ date: new Date(`${d}T00:00:00Z`), phase, label })),
      }));
      const n = fmtNum(src.records.length);
      if (meta.status === 'ok') { src.status = 'ok'; src.msg = `${n} records · ${meta.updated}`; }
      else if (meta.status === 'stale') { src.status = 'error'; src.msg = `${n} records from ${meta.updated} (source unreachable this week)`; }
      else { src.status = 'error'; src.msg = meta.error || 'failed in last snapshot'; }
    }
    renderSources();
    renderVersion();
    renderChanges();
    scheduleRebuild();
  }

  // "This week" panel: projects that appeared or changed phase since the previous snapshot.
  function renderChanges() {
    const c = state.snapshot && state.snapshot.changes;
    if (!c || c.baseline) return;
    $('#changes-head').textContent = `${c.since} → ${c.until}`;
    const n = (c.movedCount || 0) + (c.addedCount || 0);
    $('#week-count').hidden = !n;
    $('#week-count').textContent = n > 99 ? '99+' : String(n);
    const items = [
      ...c.moved.map(m => ({ ...m, html: `${dot(m.to)}<span><span class="t">${esc(m.title)}</span><span class="m">${esc(P.PHASE_BY_KEY[m.from].label)} → ${esc(P.PHASE_BY_KEY[m.to].label)} · ${esc(m.municipality)}</span></span>` })),
      ...c.added.map(a => ({ ...a, html: `${dot(a.phase)}<span><span class="t">${esc(a.title)}</span><span class="m">New · ${esc(P.PHASE_BY_KEY[a.phase].label)} · ${esc(a.municipality)}${a.units ? ` · ${fmtNum(a.units)} units` : ''}</span></span>` })),
    ];
    $('#changes-summary').textContent = `${fmtNum(c.movedCount)} changed phase · ${fmtNum(c.addedCount)} new`;
    const SHOW = 25;
    $('#changes-list').innerHTML = items.slice(0, SHOW).map((it, i) => `<li><button type="button" data-i="${i}">${it.html}</button></li>`).join('') +
      (items.length > SHOW ? `<li class="muted small">+ ${fmtNum(items.length - SHOW)} more</li>` : '');
    $('#changes-list').onclick = e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const p = state.projects.find(x => x.key === items[+b.dataset.i].key);
      if (p) focusProject(p);
    };
  }

  window.PeelApp = { state, rebuild, loadAll, discover, map, showDetail };
})();
