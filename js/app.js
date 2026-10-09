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
  // Default view: development applications in progress (application to construction), any year, no
  // focus — the map opens on the active applications and the background.
  const DEFAULT_FOCUS = '';
  const ACTIVE_PHASES = ['inception', 'review', 'approved', 'permit', 'construction'];
  const DEFAULT_PHASES = () => new Set(ACTIVE_PHASES);
  const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  const state = {
    sources: [],                         // {id,name,municipality,kind,url,enabled,status,msg,records}
    projects: [],
    filtered: [],
    phases: DEFAULT_PHASES(),
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
  // Defaults before the Peel 2023–2024 criteria were adopted: a saved value equal to one of these
  // was never edited, so it gives way to the current default.
  function mergeCriteria(saved) {
    const OLD_DEFAULTS = { water: { avg: 280, maxDay: 2.0 }, employment: { water: 300 }, ppu: { apartment: 2.7 } };
    const d = JSON.parse(JSON.stringify(D.DEFAULT_CRITERIA));
    if (!saved) return d;
    for (const g of Object.keys(d)) for (const k of Object.keys(d[g])) {
      const v = saved[g] && Number(saved[g][k]);
      if (!(v > 0)) continue;
      if (!saved.version && OLD_DEFAULTS[g] && OLD_DEFAULTS[g][k] === v) continue;
      d[g][k] = v;
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
    'streets':       { label: 'Street map (light)', imagery: false },
    'streets-color': { label: 'Street map (colour)', imagery: false },
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
    // Street maps: Esri basemaps (no key needed), like the aerial layers.
    if (basemap === 'streets') {
      const g = dark() ? 'Dark' : 'Light';
      baseLayers = [esriLayer(`Canvas/World_${g}_Gray_Base`, { maxNativeZoom: 16, attribution: `Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ${DATA_ATTR}` }),
        esriLayer(`Canvas/World_${g}_Gray_Reference`, { maxNativeZoom: 16 })];
    } else if (basemap === 'streets-color') {
      baseLayers = [esriLayer('World_Street_Map', { attribution: `Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ${DATA_ATTR}` })];
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
  // Off by default (needed for the Growth tab's context); the map options turn it on.
  let daOn = store.get('censusAreas', false) === true;
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
  const MSTYLE = {
    color: { phase: 'Phase', layer: 'Servicing layer', plant: 'Receiving plant', quality: 'Data quality', timing: 'Servicing timing (2026 DC)' },
    size: { fixed: 'Same size', pop: 'People + jobs' },
    cap: { off: 'Off', growth: 'Catchment flow growth', ps: 'Pumping station load', pipes: 'Sewer pipe capacity', zone: 'Pressure zone growth' },
  };
  let mstyle = Object.assign({ color: 'phase', size: 'fixed', cap: 'off' }, store.get('mapStyle', null) || {});
  for (const k of Object.keys(MSTYLE)) if (!MSTYLE[k][mstyle[k]]) mstyle[k] = Object.keys(MSTYLE[k])[0];
  const THIS_YEAR = new Date().getFullYear();
  // Existing pipes layer (live): which kinds are shown.
  let existOn = Object.assign({ water: false, sanitary: false, storm: false }, store.get('existOn', {}) || {});
  // Planned works layer (2026 DC capital maps): on / off and which system.
  let dcOn = { on: !!store.get('dcOn', false), sys: store.get('dcSys', 'both') };
  // Map views: presets of the layers and style, each remembering its last settings.
  const MAP_VIEWS = [['planning', 'Planning'], ['water', 'Water'], ['wastewater', 'Wastewater'], ['dc', 'DC']];
  // Sewer pipe screen state and classes (used by the legend from the first render).
  const SEW = { data: null, loading: null, grid: null, growth: null, key: '' };
  const PIPE_CLS = [[50, '#2f9e44', '< 50% of full capacity'], [80, '#fab005', '50–80%'], [100, '#f76707', '80–100%'], [Infinity, '#e03131', 'over 100%']];
  const EXIST_STYLE = { water: { color: '#1971c2', label: 'Watermain' }, sanitary: { color: '#a0522d', label: 'Sanitary sewer' }, storm: { color: '#2b8a3e', label: 'Storm sewer' } };
  const EXIST_ZOOM = 15;
  // Map control: basemap + label pickers.
  const MapOptions = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const el = L.DomUtil.create('div', 'map-opts');
      const opts = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
      const small = matchMedia('(max-width: 700px)').matches;
      // An on / off chip (a checkbox styled as a pill).
      const chip = (attrs, on, body, info) => `<label class="mo-chip"${info ? ` data-info="${info}"` : ''}><input type="checkbox" ${attrs}${on ? ' checked' : ''}><span>${body}</span></label>`;
      el.innerHTML = `
        <div class="seg mo-view" role="group" aria-label="Map view" data-info="map-view">${MAP_VIEWS.map(([k, t]) => `<button type="button" class="btn small" data-mview="${k}">${t}</button>`).join('')}</div>
        <details class="mo-more"${store.get('moOpen', false) ? ' open' : ''}><summary>Layers &amp; style</summary>
        <div class="mo-sec"><div class="mo-h">Developments</div>
          <label data-info="map-color"><span>Colour</span><select id="opt-mcolor">${opts(MSTYLE.color, mstyle.color)}</select></label>
          <label data-info="map-size"><span>Size</span><select id="opt-msize">${opts(MSTYLE.size, mstyle.size)}</select></label>
          <label data-info="opt-labels"><span>Labels</span><select id="opt-labels">${opts(LABEL_MODES, labelMode)}</select></label>
        </div>
        <div class="mo-sec"><div class="mo-h">Capacity</div>
          <label data-info="map-capacity"><span>Shade</span><select id="opt-mcap">${opts(MSTYLE.cap, mstyle.cap)}</select></label>
        </div>
        <div class="mo-sec"><div class="mo-h">Infrastructure</div>
          <div class="mo-chips">${chip('id="opt-pz"', svcOn.pz, `${svcSwatch('pz')}Pressure zones`, 'pressure-zone')}${chip('id="opt-dr"', svcOn.dr, `${svcSwatch('dr')}Drainage areas`, 'drainage-area')}</div>
          <div class="mo-row" data-info="existing-pipes"><span class="mo-k">Existing</span><div class="mo-chips">${['water', 'sanitary', 'storm'].map(k => chip(`data-exist="${k}"`, existOn[k], `<i class="lg-line" style="background:${EXIST_STYLE[k].color}"></i>${{ water: 'Water', sanitary: 'Sanitary', storm: 'Storm' }[k]}`)).join('')}</div></div>
          <small id="exist-note"></small>
          <div class="mo-row" data-info="dc-works"><span class="mo-k">DC works</span><div class="mo-chips">${[['water', 'Water', '#1c7ed6'], ['wastewater', 'Wastewater', '#d6336c']].map(([k, t, c]) => chip(`data-dcsys="${k}"`, dcOn.on && (dcOn.sys === 'both' || dcOn.sys === k), `<i class="lg-line" style="background:${c}"></i>${t}`)).join('')}</div></div>
          <button type="button" class="btn small link mo-dct" data-info="dc-needs" id="opt-dctiming">DC timing: capacity vs DC projects →</button>
        </div>
        <div class="mo-sec"><div class="mo-h">Base map</div>
          <label data-info="opt-basemap"><span>Background</span><select id="opt-basemap">${opts(BASEMAPS, basemap)}</select></label>
          ${canRotate ? `<label data-info="opt-orient"><span>Orientation</span><select id="opt-orient">${opts(ORIENTATIONS, orientation)}</select></label>` : ''}
          <div class="mo-chips">${chip('id="opt-da"', daOn, `${daSwatch()}<span id="da-label">2021 census areas</span>`, 'da-layer')}</div>
        </div>
        </details>
        <small id="label-note"></small>`;
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      el.querySelector('.mo-more').addEventListener('toggle', e => store.set('moOpen', e.target.open));
      el.querySelector('#opt-basemap').onchange = e => { basemap = e.target.value; store.set('basemap', basemap); setTiles(); restyleDa(); };
      el.querySelector('#opt-labels').onchange = e => { labelMode = e.target.value; store.set('labelMode', labelMode); updateLabels(); };
      el.querySelector('#opt-da').onchange = e => setDaLayer(e.target.checked);
      el.querySelectorAll('[data-exist]').forEach(c => { c.onchange = e => setExistOn({ [e.target.dataset.exist]: e.target.checked }); });
      el.querySelector('#opt-dctiming').onclick = () => { if (typeof showDcTiming === 'function') { loadSewers(); showDcTiming(); } };
      el.querySelectorAll('[data-dcsys]').forEach(c => { c.onchange = () => {
        const on = k => el.querySelector(`[data-dcsys="${k}"]`).checked, w = on('water'), ww = on('wastewater');
        setDcOn({ on: w || ww, sys: w && ww ? 'both' : w ? 'water' : ww ? 'wastewater' : dcOn.sys });
      }; });
      el.querySelector('#opt-mcolor').onchange = e => setMapStyle({ color: e.target.value });
      el.querySelector('#opt-msize').onchange = e => setMapStyle({ size: e.target.value });
      el.querySelector('#opt-mcap').onchange = e => setMapStyle({ cap: e.target.value });
      el.querySelector('.mo-view').onclick = e => { const b = e.target.closest('[data-mview]'); if (b) setMapView(b.dataset.mview); };
      el.querySelector('#opt-pz').onchange = e => setSvcLayer('pz', e.target.checked);
      el.querySelector('#opt-dr').onchange = e => setSvcLayer('dr', e.target.checked);
      const orient = el.querySelector('#opt-orient');
      if (orient) orient.onchange = e => setOrientation(e.target.value);
      return el;
    },
  });
  new MapOptions().addTo(map);
  // Map height for the CSS that splits it between the options panel and the legend.
  const setMapH = () => map.getContainer().style.setProperty('--map-h', `${map.getSize().y}px`);
  setMapH(); map.on('resize', setMapH);
  if (daOn) setDaLayer(true);

  // Cluster icon: ring segments show the phase mix of the projects inside.
  const cluster = L.markerClusterGroup({
    chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
    // At street zoom every project gets its own tappable marker (neighbouring houses
    // otherwise stay grouped and a tap only zooms in).
    disableClusteringAtZoom: 17,
    iconCreateFunction(c) {
      const kids = c.getAllChildMarkers();
      // Ring: the mix by the marker colour (phase / layer / plant), weighted by count, or by
      // people + jobs when markers are sized; the number is the count or the people + jobs.
      const sized = mstyle.size === 'pop';
      const w = new Map(), col = new Map();
      let tot = 0;
      for (const m of kids) { const v = sized ? m.options.pop || 0 : 1; tot += v; w.set(m.options.cat, (w.get(m.options.cat) || 0) + v); col.set(m.options.cat, m.options.col); }
      const order = mstyle.color === 'phase' ? P.ALL_PHASES.map(p => p.key) : mstyle.color === 'layer' ? Object.keys(LAYER_NAME) : mstyle.color === 'quality' ? Object.keys(QUALITY) : mstyle.color === 'timing' ? Object.keys(TIMING) : [...w.keys()].sort();
      let acc = 0; const stops = [];
      for (const k of order) {
        const n = w.get(k); if (!n) continue;
        const a0 = acc / (tot || 1) * 360; acc += n; const a1 = acc / (tot || 1) * 360;
        stops.push(`${col.get(k)} ${a0}deg ${a1}deg`);
      }
      if (!stops.length) stops.push('#b8b8b8 0deg 360deg');
      const n = kids.length;
      const size = sized ? (tot < 1000 ? 32 : tot < 10000 ? 40 : tot < 50000 ? 48 : 56) : n < 10 ? 30 : n < 100 ? 36 : n < 1000 ? 42 : 50;
      return L.divIcon({
        className: 'pm',
        iconSize: [size, size],
        html: `<div class="pc" style="width:${size}px;height:${size}px;background:conic-gradient(${stops.join(',')})" title="${fmtNum(n)} developments${sized ? ` · ${fmtNum(Math.round(tot))} people + jobs at build-out` : ''}"><span style="width:${size - 10}px;height:${size - 10}px">${sized ? shortNum(tot) : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : n}</span></div>`,
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
  // ---- Marker style (map options): colour by phase, servicing layer or receiving plant; size
  // the same or by build-out people + jobs; clusters show the mix and, when sized, the total.
  const LAYER_NAME = { existing: 'Existing (built before the census)', built: 'Built since the census', approved: 'Approved', proposed: 'Proposed (in review)', out: 'Withdrawn / refused' };
  const layerColors = () => ({ existing: '#8a8f98', built: colors.completed, approved: colors.approved, proposed: '#8fbbe9', out: '#cfcfcf' });
  // Servicing layer of a development, as in the Water / Wastewater tables.
  function svcLayerOf(p) {
    if (p.phase === 'cancelled') return 'out';
    if (p.phase === 'completed') { const bc = state.censuses && baselineCensus(); return bc && +p.milestones.completed < +new Date(`${bc.date}T00:00:00Z`) ? 'existing' : 'built'; }
    return D.COMMITTED_PHASES.has(p.phase) ? 'approved' : 'proposed';
  }
  const plantOfDev = p => { const a = state.servicing && svcIds(p, 'dr').map(id => svcById.get(id)).filter(Boolean)[0]; return a ? a.plant : 'none'; };
  // Data quality: what to check before relying on a development's numbers.
  const QUALITY = {
    far: ['#e03131', 'No zone / catchment within 5 km'], near: ['#f08c00', 'Assigned to the nearest area'],
    nounits: ['#9c36b5', 'No units or floor area stated'], estarea: ['#4dabf7', 'Site area estimated (no boundary)'], ok: ['#2f9e44', 'Complete'],
  };
  function qualityOf(p) {
    if (state.servicing && p.lat != null && !svcIds(p, 'dr').length && !svcIds(p, 'pz').length) return 'far';
    if (state.servicing && (nearOf(p, 'dr') || nearOf(p, 'pz'))) return 'near';
    if (!(p.units > 0) && !(jobsOf(p) > 0)) return 'nounits';
    if (!(p.siteAreaHa > 0)) return 'estarea';
    return 'ok';
  }
  // Servicing timing: construction year of the planned main (wastewater or water, within 400 m)
  // a development would connect to, from the 2026 DC maps; none = the existing network.
  const TIMING = { none: ['#2f9e44', 'On the existing network'], far: ['#868e96', 'Outside the network, no planned main within 1 km'], y27: ['#94d82d', `Connects via a planned main by ${THIS_YEAR + 1}`], y30: ['#fab005', 'Planned main 2028–2030'], y35: ['#f76707', 'Planned main 2031–2035'], y36: ['#c92a2a', 'Planned main 2036 or later'] };
  function timingOf(p) {
    if (p._dcT !== undefined) return p._dcT;
    const pt = p.lat == null ? null : [p.lng, p.lat];
    const outs = [!(p.dr && p.dr.length) && 'wastewater', !(p.pz && p.pz.length) && 'water'].filter(Boolean);
    if (!outs.length || !pt) return (p._dcT = 'none');
    const ns = outs.map(sys => dcNearest(sys, pt, DC_CONNECT_M));
    if (!ns.some(Boolean)) return (p._dcT = 'far');
    const y = Math.max(0, ...ns.filter(Boolean).map(n => n.ln.y || 0));
    return (p._dcT = y <= THIS_YEAR + 1 ? 'y27' : y <= 2030 ? 'y30' : y <= 2035 ? 'y35' : 'y36');
  }
  function markerCat(p) {
    if (mstyle.color === 'timing') { const k = state.dcInfra ? timingOf(p) : 'none'; return [k, TIMING[k][0]]; }
    if (mstyle.color === 'quality') { const k = qualityOf(p); return [k, QUALITY[k][0]]; }
    if (mstyle.color === 'layer') { const k = svcLayerOf(p); return [k, layerColors()[k]]; }
    if (mstyle.color === 'plant') { const k = plantOfDev(p); return [k, PLANT_COLOR[k] || '#b8b8b8']; }
    return [p.phase, colors[p.phase]];
  }
  // Build-out people + jobs (cached per criteria).
  let popKey = '', popCache = new WeakMap();
  function popOf(p) {
    const k = JSON.stringify(state.criteria);
    if (k !== popKey) { popKey = k; popCache = new WeakMap(); }
    if (!popCache.has(p)) { const e = D.estimate([p], state.criteria, 'all', jobsOf); popCache.set(p, e.population + e.employment.jobs); }
    return popCache.get(p);
  }
  const markerPx = pop => Math.min(46, Math.round((8 + 2.2 * Math.sqrt(Math.max(0, pop) / 10)) / 2) * 2);
  const styledIcons = new Map();
  function markerIcon(p) {
    if (mstyle.color === 'phase' && mstyle.size === 'fixed' && !(svcOpt.nr === 'on' && (p.drNear || p.pzNear))) return iconFor(p.phase);
    const [, col] = markerCat(p), d = mstyle.size === 'pop' ? markerPx(popOf(p)) : 14;
    const near = !!(state.servicing && (nearOf(p, 'dr') || nearOf(p, 'pz')));
    const key = `${col}|${d}|${near}|${p.phase === 'cancelled'}`;
    if (!styledIcons.has(key)) styledIcons.set(key, L.divIcon({ className: 'pm pm-hit', iconSize: [Math.max(d, 24), Math.max(d, 24)],
      html: `<span class="mk${near ? ' near' : ''}${p.phase === 'cancelled' ? ' out' : ''}" style="width:${d}px;height:${d}px;--mk:${col}"></span>` }));
    return styledIcons.get(key);
  }
  const shortNum = n => n >= 1e4 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
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
    if (state.pz && !svcIds(p, 'pz').includes(state.pz)) return false;
    if (state.dr && !svcIds(p, 'dr').includes(state.dr)) return false;
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
    if (mstyle.color === 'phase') renderLegend();   // the phase legend lists the shown phases
    viewLink.ready();
  }

  // ---- Shareable links: filters, tab, switches, map view and the open development in the URL ----
  // #ph=…&fo=…&mu=…&k=…&q=…&sp=…&mt=…&pz=…&dr=…&u=…&nn=0&ym=…&yf=…&yt=…&t=…&ws=…&wm=…&md=…&dv=…&m=lat,lng,zoom&d=key
  const viewLink = (() => {
    let pending = location.hash.length > 1 ? new URLSearchParams(location.hash.slice(1)) : null, applied = !pending, timer;
    const encode = () => {
      const q = new URLSearchParams(), set = (k, v) => { if (v !== '' && v != null) q.set(k, v); };
      if (!sameSet(state.phases, DEFAULT_PHASES())) set('ph', [...state.phases].join(','));
      if (state.focus !== DEFAULT_FOCUS) set('fo', state.focus || 'none');
      set('mu', state.muni); if (state.kind !== DEFAULT_KIND) set('k', state.kind); set('q', state.search);
      if (state.sp.length) set('sp', state.sp.join(',')); set('mt', state.mtsa); set('pz', state.pz); set('dr', state.dr);
      if (state.minUnits) set('u', state.minUnits); if (!state.newOnly) set('nn', '0');
      if (state.yearMode !== 'any') set('ym', state.yearMode);
      if (!atDefaultYears()) { set('yf', tFrom.value); set('yt', tTo.value); }
      set('t', footPref); if (footPref === 'ww') set('ws', wwSub);
      if (svcOpt.ww !== 'calibrated') set('wm', svcOpt.ww); if (svcOpt.md !== 'design') set('md', svcOpt.md); if (svcOpt.div !== 'off') set('dv', svcOpt.div); if (svcOpt.nr !== 'on') set('nr', svcOpt.nr);
      if (mstyle.color !== 'phase' || mstyle.size !== 'fixed' || mstyle.cap !== 'off') set('ms', `${mstyle.color}.${mstyle.size}.${mstyle.cap}`);
      const c = map.getCenter(); set('m', `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
      if (!$('#detail').hidden && currentProject && $('#detail').dataset.view === 'dev') set('d', currentProject.key);
      return q.toString();
    };
    const write = () => { if (!applied) return; clearTimeout(timer); timer = setTimeout(() => { const h = encode(); history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search); }, 300); };
    // Apply a link once the developments (and the areas / servicing layers it names) have loaded.
    const ready = () => {
      if (applied) { write(); return; }
      const q = pending;
      if (!state.projects.length || ((q.get('sp') || q.get('mt')) && !state.areas) || ((q.get('pz') || q.get('dr')) && !state.servicing)) return;
      applied = true;
      if (q.get('ph')) state.phases = new Set(q.get('ph').split(',').filter(k => P.PHASE_BY_KEY[k]));
      if (q.has('fo')) state.focus = q.get('fo') === 'none' ? '' : q.get('fo');
      state.muni = q.get('mu') || ''; state.kind = q.get('k') || DEFAULT_KIND; state.search = q.get('q') || '';
      state.sp = q.get('sp') ? q.get('sp').split(',') : []; state.mtsa = q.get('mt') || ''; state.pz = q.get('pz') || ''; state.dr = q.get('dr') || '';
      state.minUnits = Number(q.get('u')) || 0; state.newOnly = q.get('nn') !== '0';
      if (q.get('ym')) { state.yearMode = q.get('ym'); $('#t-mode').value = state.yearMode; }
      $('#f-search').value = state.search; $('#f-kind').value = state.kind; $('#f-units').value = String(state.minUnits); $('#f-new').checked = state.newOnly;
      for (const [k, o] of [['wm', 'ww'], ['md', 'md'], ['dv', 'div'], ['nr', 'nr']]) if (q.get(k)) svcOpt[o] = q.get(k);
      if (q.get('ms')) { const [color, size, cap] = q.get('ms').split('.'); for (const [k, v] of [['color', color], ['size', size], ['cap', cap]]) if (MSTYLE[k][v]) mstyle[k] = v; }
      if (q.get('t')) { footPref = q.get('t'); if (q.get('ws')) wwSub = q.get('ws'); }
      renderMuniChips(); if (state.areas) renderAreaSelects(); renderSvcSelects(); showSvcArea(false);
      if (q.get('m')) { const [la, ln, z] = q.get('m').split(',').map(Number); if (isFinite(la) && isFinite(ln)) map.setView([la, ln], isFinite(z) ? z : map.getZoom()); }
      if (q.get('yf') && q.get('yt')) setYears(Number(q.get('yf')), Number(q.get('yt'))); else applyFilters();
      showFootTab(footPref);
      const d = q.get('d') && state.projects.find(p => p.key === q.get('d'));
      if (d) showDetail(d);
      write();
    };
    map.on('moveend', write);
    return { ready, write, url: () => `${location.origin}${location.pathname}#${encode()}` };
  })();
  async function copyViewLink(btn) {
    const url = viewLink.url();
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; }
    catch (e) { prompt('Copy this link:', url); }
    setTimeout(() => { btn.textContent = 'Share link'; }, 1800);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) copyViewLink(b); });

  // ---- Timeline slider -------------------------------------------------------------
  const tFrom = $('#t-from'), tTo = $('#t-to');
  // Default year range on load and after "Reset all".
  const DEFAULT_YEARS = null;   // all years
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
    state.yearFrom = !DEFAULT_YEARS || DEFAULT_YEARS[0] <= lo ? null : DEFAULT_YEARS[0];
    state.yearTo = !DEFAULT_YEARS || DEFAULT_YEARS[1] >= hi ? null : DEFAULT_YEARS[1];
    tFrom.value = state.yearFrom ?? lo; tTo.value = state.yearTo ?? hi;
  }
  const atDefaultYears = () => {
    const lo = state.yearMin, hi = state.yearMax;
    if (!DEFAULT_YEARS) return state.yearFrom == null && state.yearTo == null;
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
    $('#t-reset').textContent = atDefault || !DEFAULT_YEARS ? 'All years' : `${DEFAULT_YEARS[0]}–${DEFAULT_YEARS[1]}`;
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
    wwSub = b.dataset.wwsub; store.set('wwSub', wwSub); showFootTab('ww'); viewLink.write();
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
    const phase = view === 'all' ? 'All phases' : view === 'active' ? 'Active applications'
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
    const sf = $('#sect-more'); if (sf) sf.open = true;
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
    $('#f-sum').innerHTML = `${state.daCtx ? `<span class="muted">Around ${esc(state.daCtx.title)}:</span> ` : ''}<strong>${fmtNum(set.length)}</strong> developments · ${fmtNum(Math.round(e.totalUnits))} units<span class="f-sum-pop"> · ${fmtNum(roundPop(e.population))} people</span>`;
    renderSelection(set, basis);

    // Breakdown by dwelling type and by phase.
    const typeRows = D.UNIT_TYPES.map(t => `<tr><td>${esc(t.label)}</td><td>${uUnits(e.units[t.key])}</td><td>${t.key === 'apartment' ? unit(`${c.ppu.apartment} / ${c.ppu.apartmentHigh}`, 'pop/unit') : unit(c.ppu[t.key], 'pop/unit')}</td><td>${uPop(e.pop[t.key])}</td></tr>`).join('');
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
        ${inp('ppu', 'single', 'Single / semi', 0.1)}${inp('ppu', 'town', 'Townhouse', 0.1)}${inp('ppu', 'apartment', 'Apartment', 0.1)}${inp('ppu', 'apartmentHigh', 'Apartment, &gt;475 persons/ha', 0.1)}${inp('ppu', 'unknown', 'Type not stated', 0.1)}
        <p class="small muted">Apartments use the large-apartment rate unless the site holds more than ${D.APT_DENSITY} persons/ha at that rate, or its area is not known; then the high-density rate (Peel Linear Wastewater Standards, Tables 2-1 / 2-2). Peel's 1.7 for small (≤1 bedroom) apartments needs the bedroom mix, which the applications don't publish.</p>
      </fieldset>
      <fieldset><legend>Water</legend>
        ${inp('water', 'avg', 'Average day (L/cap/d)', 1)}${inp('water', 'maxDay', 'Max day factor', 0.1)}${inp('water', 'peakHour', 'Peak hour factor', 0.1)}
      </fieldset>
      <fieldset><legend>Wastewater</legend>
        ${inp('wastewater', 'avg', 'Residential (L/cap/d)', 0.1)}${inp('wastewater', 'infiltration', 'I&amp;I (L/s/ha)', 0.01)}${inp('wastewater', 'peakMin', 'Peaking min', 0.1)}${inp('wastewater', 'peakMax', 'Peaking max', 0.1)}
        <p class="small muted">Dry weather peak = average × Harmon M = 1 + 14 / (4 + √P), P in thousands, applied to the combined population and kept between the min and max (Peel: 2.0–4.0). I&amp;I = rate × gross site area (application boundary; where there is none, estimated at ${D.AREA_PER_UNIT.single} ha per single, ${D.AREA_PER_UNIT.town} per townhouse, ${D.AREA_PER_UNIT.apartment} per apartment unit). Peak wet weather = dry weather peak + I&amp;I.</p>
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
      <p class="small muted">Defaults: Region of Peel Water and Wastewater Modelling Demand Table (v2.0, Aug 2024): water 270 L/cap/d ×1.8 max day ×3.0 peak hour, employment 250 L/emp/d ×1.4 / ×3.0 (from the 2020 DC Background Study); wastewater per the Linear Wastewater Standards (2023): 290 L/cap/d and 270 L/emp/d, Harmon limited to 2.0–4.0, I&amp;I 0.26 L/s/ha, persons per unit 4.2 / 3.4 / 3.1 (2.7 above 475 persons/ha). These replace the 2010 Watermain Design Criteria (280 L/cap/d ×2.0, 300 L/emp/d). The 2.0 minimum peaking factor is a sewer design rule, so plant-level peaks are conservative.</p>
      <button type="button" class="btn small" id="d-reset">Reset to Peel defaults</button>`;
  }
  $('#d-criteria').oninput = e => {
    const el = e.target; if (!el.dataset.g) return;
    const v = Number(el.value);
    if (!(v >= 0)) return;
    state.criteria[el.dataset.g][el.dataset.k] = v;
    store.set('criteria', { ...state.criteria, version: 2 });
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
      chip('active', 'Active applications', n(ACTIVE_PHASES), 'In progress: application to construction (not completed, not withdrawn)'),
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
      const [cat, col] = markerCat(p), pop = mstyle.size === 'pop' ? popOf(p) : 0;
      const m = L.marker([p.lat, p.lng], { icon: markerIcon(p), phase: p.phase, cat, col, pop, keyboard: false, title: '', zIndexOffset: pop ? -Math.round(Math.sqrt(pop)) : 0 });
      const near = state.servicing && (nearOf(p, 'dr') || nearOf(p, 'pz'));
      m.bindTooltip(`<strong>${esc(p.title)}</strong><br>${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}${mstyle.color === 'layer' ? `<br>${esc(LAYER_NAME[cat])}` : mstyle.color === 'quality' ? `<br>${esc(QUALITY[cat][1])}` : mstyle.color === 'timing' ? `<br>${esc(TIMING[cat][1])}` : mstyle.color === 'plant' ? `<br>→ ${esc(cat === 'none' ? 'no traced catchment' : PLANT_SHORT[cat])}` : ''}${pop ? `<br>${fmtNum(Math.round(pop))} people + jobs at build-out` : ''}${near ? '<br><span class="muted">Outside the mapped areas: nearest assigned</span>' : ''}`, { className: 'pt', direction: 'top', offset: [0, -8] });
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
    return `<details class="sub-sect"><summary><h3 class="sub-title" data-info="buildout">Build-out by stage and phase</h3></summary>
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
    return `<details class="sub-sect emp"><summary><h3 class="sub-title" data-info="employment">Employment uses${e.mixed ? ' <span class="muted small">(mixed use)</span>' : ''}</h3>
        <span class="muted small sect-sum">${e.totalM2 ? `${fmtNum(e.totalM2)} m² · ~${fmtNum(e.jobs)} jobs` : 'floor area not stated'}</span></summary>
      <table class="dt"><thead><tr><th>Use</th><th>Floor area</th><th>Est. jobs</th></tr></thead><tbody>${rows}</tbody></table>
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
  function demandHTML(p, intro = '', nested = false) {
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
    return `<details class="${nested ? 'sub-sect' : 'sect'}"><summary>${nested ? '<h3 class="sub-title" data-info="project-demand">Demand by stage: total, completed, remaining</h3>' : '<h2 class="section-title" data-info="project-demand">Servicing demand</h2>'}${emp ? `<span class="muted small sect-sum">${res ? 'residential + ' : ''}${fmtNum(Math.round(m(es[0]).jobs))} jobs</span>` : ''}</summary>${intro}
      <table class="dt demand-table"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${resRows}${empRows}${totRows}
      </tbody></table>
      <p class="small muted">${notes.join(' ')}
        ${res ? 'Completed = units on finished permits; remaining = the rest, permitted or not. ' : ''}Peaks are for each column alone (peaking is not additive); edit the criteria in the bottom panel.</p></details>`;
  }

  // Why a development is where it is: the file and status behind its phase, signals in the
  // municipal status text (appeals, inactivity, lapses, withdrawals, resubmissions, council
  // endorsement, draft approval), and whether it has stalled. Council and committee items that
  // name its file numbers are added when data/council.json is published.
  const STATUS_SIGNALS = [
    [/\b(OMB|OLT|LPAT)\b|appeal/i, 'appeal', 'Under appeal to the Ontario Land Tribunal (formerly the OMB / LPAT) — the decision rests with the Tribunal'],
    [/withdrawn/i, 'stop', 'Withdrawn by the applicant'],
    [/refused/i, 'stop', 'Refused'],
    [/cancel|revoked/i, 'stop', 'Cancelled or revoked'],
    [/deemed abandoned|lapsed|expired/i, 'stop', 'Lapsed, expired or deemed abandoned'],
    [/inactive/i, 'stall', 'Marked inactive by the municipality (no activity on the file)'],
    [/recirculation|resubmi/i, 'info', 'Resubmission being recirculated for comments (revisions after the first review)'],
    [/initial submission rejected|incomplete|invalid/i, 'info', 'Submission rejected, incomplete or invalid — waiting on the applicant'],
    [/public mtg complete|public meeting/i, 'info', 'Statutory public meeting held; recommendation report to follow'],
    [/pre.?public mtg|pre public/i, 'info', 'Awaiting the statutory public meeting'],
    [/comments released/i, 'info', 'Pre-consultation comments released to the applicant'],
    [/staff review complete|satisfactory/i, 'info', 'Staff review complete'],
    [/endorsed by council|adoption|adopted/i, 'ok', 'Endorsed or adopted by council'],
    [/draft approv/i, 'ok', 'Draft approved — conditions to clear before registration'],
    [/registered|registration|m-plan/i, 'ok', 'Plan registered or being registered'],
    [/agreement/i, 'ok', 'Agreement being prepared or executed'],
    [/\bmzo\b/i, 'ok', "Approved by Minister's Zoning Order"],
    [/withheld/i, 'info', 'Status withheld in the municipal data'],
  ];
  // Council and committee items naming the development's files (data/council.json, loaded on
  // first use): date, meeting, item, outcome, the reports and correspondence attached, and the
  // minutes text (discussion, motion and vote) — the reasons behind decisions.
  let councilLoading = null;
  function loadCouncil() {
    if (state.council || councilLoading) return;
    councilLoading = fetch('data/council.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
      state.council = d || { meetings: {}, files: {} };
      if (currentProject && !$('#detail').hidden && $('#detail').dataset.view === 'dev') { const y = $('#detail').scrollTop; showDetail(currentProject); $('#detail').scrollTop = y; }
    }).catch(() => { state.council = { meetings: {}, files: {} }; });
  }
  function councilItems(p) {
    const C = state.council; if (!C || !C.files) return [];
    const keys = new Set();
    for (const r of p.records) if (r.kind === 'application' && r.ref) {
      const k = r.fileKey || P.canonRef(r.ref); if (!k) continue;
      keys.add(`${p.municipality}|${k}`);
      if (/^OZ\|OPA\|/.test(k)) { keys.add(`${p.municipality}|${k.replace(/^OZ\|OPA\|/, 'OZ|')}`); }
      if (/^OZ\|\d/.test(k)) keys.add(`${p.municipality}|${k.replace(/^OZ\|/, 'OZ|OPA|')}`);
    }
    const seen = new Set(), out = [];
    for (const k of keys) for (const [mid, i] of C.files[k] || []) {
      const id = `${mid}#${i}`; if (seen.has(id)) continue; seen.add(id);
      const m = C.meetings[mid]; if (m && m.items[i]) out.push({ m, it: m.items[i] });
    }
    return out.sort((a, b) => b.m.date.localeCompare(a.m.date));
  }
  const OUTCOME_LABEL = { CARRIED: 'Carried', 'CARRIED AS AMENDED': 'Carried as amended', DEFEATED: 'Defeated', LOST: 'Lost', DEFERRED: 'Deferred', REFERRED: 'Referred', RECEIVED: 'Received', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', ADOPTED: 'Adopted' };
  // ---- Development panel: a brief first (status, latest decision, servicing, build-out), then
  // one dated history (phase changes, council and committee items, file and permit events) and
  // the details (servicing, units, aerial, source records), each opened when needed.
  const B = window.PeelBrief;
  // Council items with their brief (verdict, motion, issues raised, requirements), newest first.
  const briefCache = new WeakMap();
  function councilBriefs(p) {
    const c = briefCache.get(p);
    if (c && c.C === state.council) return c.list;
    const refs = p.records.filter(r => r.kind === 'application' && r.ref).map(r => r.ref);
    const list = councilItems(p).map(x => ({ ...x, s: B.summarizeItem(x.it, x.m.passed, refs) }));
    briefCache.set(p, { C: state.council, list });
    return list;
  }
  // Status: the event behind the current phase, signals in the status text, stalled or not.
  function statusOf(p) {
    const apps = p.records.filter(r => r.kind === 'application');
    const seen = new Map();
    for (const r of apps) for (const [re, kind, text] of STATUS_SIGNALS) if (re.test(r.statusRaw || '')) {
      if (!seen.has(text)) seen.set(text, { kind, text, files: [], main: false });
      seen.get(text).files.push(`${r.ref || 'file'} (“${r.statusRaw}”)`);
      if (recGroup(r) !== 'precon') seen.get(text).main = true;
      break;
    }
    const ev = p.timeline.filter(t => t.phase === p.phase).sort((a, b) => b.date - a.date)[0];
    const label = P.PHASE_BY_KEY[p.phase].label;
    const why = ev ? `${esc(label)} since ${fmtDate(ev.date)} — ${esc(ev.text.replace(/^[^·]*· /, ''))} on ${esc(ev.tag)}` : `${esc(label)}: from the status of ${esc(apps.map(r => `${r.ref} (“${r.statusRaw}”)`).slice(0, 2).join(', ') || 'its files')}`;
    const stalled = PLANNING_PHASES.includes(p.phase) && p.last && Date.now() - p.last > 2 * YEAR_MS;
    const years = p.last ? (Date.now() - p.last) / YEAR_MS : 0;
    const RANK = { appeal: 0, stop: 1, stall: 2, ok: 3, info: 4 };
    const sig = [...seen.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    const cause = stalled ? (sig.find(x => x.kind === 'appeal') ? 'while under appeal' : sig.find(x => x.kind === 'stall') ? 'and marked inactive' : sig.find(x => /Draft approved/.test(x.text)) ? 'after draft approval (conditions not yet cleared)' : 'with no reason in the municipal data — check the council and committee items') : '';
    // The most recently active application and its status text.
    const lastOf = r => r.events.length ? Math.max(...r.events.map(e => +e.date)) : 0;
    const latest = apps.slice().sort((a, b) => lastOf(b) - lastOf(a))[0];
    return { sig, why, stalled, years, cause, latest, latestAt: latest ? lastOf(latest) : 0 };
  }

  const psName = a => drName(a).replace(/^[^·]+· /, '');
  const trigger = () => (state.reports && state.reports.masterPlan && state.reports.masterPlan.plantTriggerPct) || 90;
  const chip = (html, cls = '') => `<span class="chip${cls ? ` ${cls}` : ''}">${html}</span>`;
  const outBadge = (it, s) => it.outcome || s.vote ? `<span class="c-out c-${String(it.outcome || s.vote).toLowerCase().replace(/\s.*$/, '')}">${esc(s.vote || OUTCOME_LABEL[it.outcome] || it.outcome)}</span>` : '';
  const pctOf = (a, b) => b > 0 ? `${(a / b * 100) < 1 ? (a / b * 100).toFixed(2) : Math.round(a / b * 100)}%` : '–';

  // Flags for the header: what an infrastructure planner should look at first.
  function devFlags(p, st, f) {
    const out = [];
    if (st.sig.some(x => x.kind === 'appeal')) out.push(chip('Under appeal (OLT)', 'warn'));
    if (st.stalled) out.push(chip(`Stalled ${st.years.toFixed(1)} yrs`, 'warn'));
    if (st.works && st.works.gap) out.push(chip(`Needs planned main ${st.works.needBy}`, 'warn'));
    if (f) {
      for (const s of f.sps) if (s.wet >= s.firm) out.push(chip(`${esc(psName(s.a))} ${Math.round(s.wet / s.firm * 100)}% of firm`, 'warn'));
      if (f.cap) {
        if (f.reserve <= 0) out.push(chip(`${esc(PLANT_SHORT[f.pl] || f.pl)} over-committed`, 'warn'));
        else if (f.cap.committed / f.cap.rated >= trigger() / 100) out.push(chip(`${esc(PLANT_SHORT[f.pl] || f.pl)} ≥${trigger()}% committed`, 'warn'));
      }
    }
    return out;
  }

  function devHeadHTML(p, st, f) {
    const e = f ? f.e : D.estimate([p], state.criteria, 'all', jobsOf);
    const facts = [];
    if (e.totalUnits > 0) facts.push(chip(`${uUnits(e.totalUnits)} · ${uPop(e.population)}`));
    if (e.employment.jobs > 0) facts.push(chip(unit(fmtNum(Math.round(e.employment.jobs)), 'jobs')));
    if (f && f.z) facts.push(chip(`${esc(f.z.name.replace('Pressure zone ', 'Zone '))}${f.zNear ? ' (nearest)' : ''}`));
    if (f && f.pl) facts.push(chip(`→ ${esc(PLANT_SHORT[f.pl] || plantLabel(f.pl))}${f.dNear ? ' (nearest catchment)' : ''}`));
    if (p.last) facts.push(chip(`Last activity ${fmtDate(new Date(p.last))}`, 'muted'));
    const flags = devFlags(p, st, f);
    return `<div class="head"><h3>${esc(p.title)}</h3><div class="m">${esc(p.municipality)}${p.types.length ? ' · ' + esc(p.types.slice(0, 3).join(', ')) : ''}</div>
        <span class="badge">${dot(p.phase)}${esc(P.PHASE_BY_KEY[p.phase].label)}</span></div>
      <div class="chips dev-chips">${facts.join('')}${flags.join('')}</div>`;
  }

  // The latest council / committee decision in brief, plus what all the items raised.
  function latestDecisionHTML(p, st) {
    const loaded = state.council && Object.keys(state.council.files || {}).length;
    const fileStatus = st.latest ? `Latest file status: <strong>${esc(st.latest.ref || 'file')}</strong> “${esc(st.latest.statusRaw || 'no status')}”${st.latestAt ? ` (${fmtDate(new Date(st.latestAt))})` : ''}.` : '';
    if (!state.council) return `<p class="small muted">Loading council and committee items…</p>${fileStatus ? `<p class="small">${fileStatus}</p>` : ''}`;
    const list = loaded ? councilBriefs(p) : [];
    if (!list.length) return `<p class="small">${fileStatus} <span class="muted">No council or committee items name its files since 2019.</span></p>`;
    const top = B.latestDecisive(list), { m, it, s } = top;
    const newer = list[0] !== top ? list[0] : null;
    const all = B.across(list);
    const chips = (xs, withN) => xs.map(x => chip(`${esc(x.label)}${withN && x.n > 1 ? ` ×${x.n}` : ''}`, x.infra ? 'infra' : '')).join('');
    return `<div class="c-brief">
        <div class="c-head small"><span class="d">${esc(m.date)}</span> · ${esc(m.name)} · <span class="c-kind">${esc(s.kind)}</span> ${outBadge(it, s)}</div>
        <p class="c-verdict">${s.verdict ? `<strong>${esc(s.verdict)}</strong>` : ''}${s.verdict && s.verdict.startsWith(it.title) ? '' : `${s.verdict ? ' — ' : ''}${esc(it.title)}`}</p>
        ${s.decision ? `<p class="small c-motion">${esc(s.decision)}</p>` : ''}
        ${newer ? `<p class="small">Since then: <span class="d">${esc(newer.m.date)}</span> · ${esc(newer.s.kind)}${newer.s.verdict ? ` — ${esc(newer.s.verdict)}` : ''} · <span class="muted">${esc(newer.it.title)}</span></p>` : ''}
        ${all.requirements.length ? `<div class="chips small"><span class="ck">Requirements on record</span>${chips(all.requirements)}</div>` : ''}
        ${all.concerns.length ? `<div class="chips small"><span class="ck">Issues raised</span>${chips(all.concerns, true)}</div>` : ''}
        <p class="small muted">${list.length > 1 ? `${fmtNum(list.length)} council and committee items since ${esc(list[list.length - 1].m.date.slice(0, 4))}` : 'One council or committee item'} — <button type="button" class="btn small link" data-open="dev-hist">all in History</button>. ${fileStatus}</p>
      </div>`;
  }

  // Servicing in one or two lines: flows, pressure zone, sewer path constraint, plant reserve.
  function servicingBriefHTML(p, f) {
    if (!f) return servicingLineHTML(p) || '<p class="small muted">No units or jobs stated — flows not estimated.</p>';
    const cb = f.cb, lines = [];
    lines.push(`<strong>Water</strong> ${uLs(cb.water.maxDay)} max day, ${uLs(cb.water.peakHour)} peak hour${f.z ? ` · ${esc(f.z.name.replace('Pressure zone ', 'Zone '))}${f.zMax ? ` (${pctOf(D.toMLd(cb.water.maxDay), f.zMax)} of its build-out max day)` : ''}` : ' · no pressure zone'}`);
    const ps = f.sps.slice().sort((a, b) => b.wet / b.firm - a.wet / a.firm)[0];
    if (f.zNear || f.dNear) lines.push(`<span class="est-line">Outside the ${[f.zNear && 'mapped pressure zones', f.dNear && 'traced catchments'].filter(Boolean).join(' and ')} — assigned to: ${[f.zNear && `${esc(f.z.name.replace('Pressure zone ', 'Zone '))} (${esc(nearText(f.zNear))})`, f.dNear && f.path[0] && `${esc(drName(f.path[0]))} (${esc(nearText(f.dNear))})`].filter(Boolean).join(', ')}. A screening estimate: the connection point comes from the FSR / master plan.</span>`);
    lines.push(`<strong>Wastewater</strong> ${uLs(cb.wastewater.peak)} peak dry, ${uLs(cb.wastewater.wetPeak)} peak wet${ps ? ` · via ${esc(psName(ps.a))} (build-out ≈${Math.round(ps.wet / ps.firm * 100)}% of firm, peak wet)` : ''}`);
    const pp = pathPipes(p);
    const pipeTxt = x => `${x.p[0]} mm at <strong>${Math.round(x.r1 * 100)}%</strong> <button type="button" class="btn small link" data-pipe="${x.i}">what loads it</button>`;
    if (pp && pp.worst) lines.push(`<strong>Sewer pipes</strong> (load / full capacity at ${capYear == null ? 'build-out' : capYear}): ${pp.local ? `local tightest ${pipeTxt(pp.local)}` : ''}${pp.local && pp.trunk ? ' · ' : ''}${pp.trunk ? `downstream trunk tightest ${pipeTxt(pp.trunk)}` : ''}`);
    if (f.cap) lines.push(`<strong>${esc(f.cap.name)}</strong> uncommitted reserve ${uML(f.reserve)}${f.reserve > 0 ? ` — this development ${f.layer === 'proposed' ? 'would use' : f.layer === 'built' ? 'is in the existing flow,' : 'is committed,'} ${pctOf(f.use, f.reserve)} of it` : ' — the plant is over-committed'}`);
    else if (f.pl === 'Toronto') lines.push('Drains to the City of Toronto system (Malton).');
    return `<ul class="b-lines small">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
      <p class="small"><button type="button" class="btn small link" data-open="dev-svc">Flows, sewer path and demand by stage</button></p>`;
  }

  function buildoutBriefHTML(p) {
    const b = p.buildout;
    if (!b) {
      const permits = p.records.filter(r => r.kind === 'permit').length;
      return `<p class="small">${p.units ? `${uUnits(p.units)} on the files` : 'Units not stated'}${permits ? ` · ${fmtNum(permits)} building permits` : ''}</p>`;
    }
    const total = Math.max(b.planned, b.permitted), w = v => total ? (v / total * 100).toFixed(2) : 0;
    return `<div class="sum-bar" role="img" aria-label="${fmtNum(b.completed)} completed, ${fmtNum(Math.max(0, b.permitted - b.completed))} permitted not completed, ${fmtNum(b.remaining)} left to build">
        <span class="bo-done" style="width:${w(b.completed)}%"></span><span class="bo-perm" style="width:${w(Math.max(0, b.permitted - b.completed))}%"></span><span class="bo-left" style="width:${w(b.remaining)}%"></span></div>
      <p class="small">${uUnits(b.planned)} planned · ${fmtNum(b.permitted)} permitted · ${fmtNum(b.completed)} completed · <strong>${uUnits(b.remaining)} left</strong> <button type="button" class="btn small link" data-open="dev-units">by type and phase</button></p>`;
  }

  // The brief in two parts: 'overview' (status, decision, build-out, proposal) and 'servicing'
  // (servicing summary, existing mains, fire flow, stormwater, planned works, DC needs).
  function devBriefHTML(p, st, f, part = 'overview') {
    const row = (k, body) => `<div class="b-row"><div class="b-k">${k}</div><div class="b-v">${body}</div></div>`;
    const status = `<p class="small">${st.why}</p>
      ${st.stalled ? `<p class="small why-stall"><strong>Stalled:</strong> no activity since ${fmtDate(new Date(p.last))} (${st.years.toFixed(1)} years), ${st.cause}.</p>` : ''}
      ${(x => x && x.kind !== 'info' ? `<p class="small why-${x.kind}-t">${esc(x.text)} <span class="muted">· ${esc(x.files[0])}</span></p>` : '')(st.sig.find(x => x.main))}
      ${p.phase === 'cancelled' ? `<p class="small">${dot('cancelled')} All files on this site are withdrawn, refused or cancelled.</p>` : ''}`;
    if (part === 'overview') return `<section class="brief" data-info="dev-brief">
      ${row('Status', status)}
      ${row('Latest decision', latestDecisionHTML(p, st))}
      ${row('Build-out', buildoutBriefHTML(p))}
      ${p.description ? row('Proposal', `<p class="desc-clamp small">${esc(p.description)}</p>`) : ''}
      ${exportBar('dev')}
    </section>`;
    return `<section class="brief" data-info="dev-brief">
      ${row('Summary', servicingBriefHTML(p, f))}
      ${p.lat != null ? row('Existing mains', '<div id="dev-exist"><p class="small muted">Looking up the nearest existing mains…</p></div>') : ''}
      ${p.lat != null ? row('Fire flow', '<div id="dev-fire" data-info="fire-storm"><p class="small muted">Looking up hydrants…</p></div>') : ''}
      ${p.lat != null ? row('Stormwater', '<div id="dev-storm" data-info="fire-storm"><p class="small muted">Looking up stormwater ponds…</p></div>') : ''}
      ${st.works ? row('Planned works', devWorksHTML(st.works)) : ''}
      ${state.dcInfra && f ? row('DC needs', `<div id="dev-dcn" data-info="dc-needs">${dcNeedsHTML(p)}</div>`) : ''}
    </section>`;
  }

  // One dated history: phase changes (weekly check), council and committee items, file events
  // and building permit events; newest first, by year.
  function devEvents(p) {
    const byUid = new Map(p.records.map(r => [r.uid, r]));
    const ev = [], groups = new Map();
    for (const t of p.timeline) {
      const r = byUid.get(t.record), type = r && r.kind === 'permit' ? 'permit' : 'file';
      const k = `${fmtDate(t.date)}|${t.text}|${type}`;
      if (!groups.has(k)) { const g = { date: t.date, type, phase: t.phase, text: t.text, tags: [] }; groups.set(k, g); ev.push(g); }
      const g = groups.get(k); if (!g.tags.includes(t.tag)) g.tags.push(t.tag);
    }
    const h = (state.history && state.history.projects && state.history.projects[p.key]) || [];
    // Only actual moves: the first weekly check ("first seen as") is when tracking began, not an event.
    h.forEach(([d, ph], i) => {
      if (!i) return;
      const at = new Date(`${d}T23:59:59`), why = p.timeline.filter(e => e.phase === ph && e.date <= at).sort((a, b) => b.date - a.date)[0];
      ev.push({ date: new Date(`${d}T12:00:00`), seq: i + 1, type: 'phase', phase: ph, text: `Moved to ${P.PHASE_BY_KEY[ph].label}`, why });
    });
    if (state.council) for (const c of councilBriefs(p)) ev.push({ date: new Date(`${c.m.date}T12:00:00`), type: 'council', c });
    return ev.sort((a, b) => b.date - a.date || (b.seq || 0) - (a.seq || 0));
  }
  // Key events: everything but individual permits, which are counted per year instead.
  function keyEvents(all) {
    const out = [], years = new Map();
    for (const x of all) {
      if (x.type !== 'permit') { out.push(x); continue; }
      const y = fmtDate(x.date).slice(0, 4);
      if (!years.has(y)) { const s = { date: x.date, type: 'permits', byPhase: new Map(), tags: new Set() }; years.set(y, s); out.push(s); }
      const s = years.get(y);
      if (!s.byPhase.has(x.phase)) s.byPhase.set(x.phase, new Set());
      for (const t of x.tags) { s.byPhase.get(x.phase).add(t); s.tags.add(t); }
    }
    return out;
  }
  const TL_TYPE = { council: 'Council', phase: 'Phase', file: 'File', permit: 'Permit', permits: 'Permits' };
  function evHTML(x) {
    const tags = list => list.length <= 3 ? esc(list.join(', '))
      : `${esc(list.slice(0, 2).join(', '))} <details class="tl-more"><summary>+${list.length - 2} more</summary>${esc(list.slice(2).join(', '))}</details>`;
    let body;
    if (x.type === 'council') {
      const { m, it, s } = x.c;
      body = `<details class="c-ev"><summary>${s.verdict ? `<strong>${esc(s.verdict)}</strong> · ` : ''}${esc(m.name)}${it.n ? ` · item ${esc(it.n)}` : ''} <span class="c-kind">${esc(s.kind)}</span> ${outBadge(it, s)}
          <span class="c-title">${esc(it.title)}</span></summary>
        ${s.decision ? `<p class="small c-motion">${esc(s.decision)}</p>` : ''}
        ${s.requirements.length || s.concerns.length ? `<div class="chips small">${s.requirements.map(r => chip(esc(r.label), r.infra ? 'infra' : '')).join('')}${s.concerns.map(c => chip(`Concern: ${esc(c)}`, 'concern')).join('')}</div>` : ''}
        <p class="small"><a href="${esc(m.url)}" target="_blank" rel="noopener">Meeting page</a>${it.docs.map(([id, name]) => ` · <a href="https://${esc(m.host)}/filestream.ashx?DocumentId=${esc(id)}" target="_blank" rel="noopener">${esc(name.replace(/\.pdf$/i, ''))}</a>`).join('')}</p>
        ${it.text ? `<details class="c-text"><summary>${m.passed ? 'Minutes: discussion, motion and vote' : 'Agenda text'}</summary><p class="small">${esc(it.text)}</p></details>` : ''}
      </details>`;
    } else if (x.type === 'phase') {
      body = `${dot(x.phase)}<span><strong>${esc(x.text)}</strong>${x.why ? ` <span class="muted">— ${esc(x.why.text.replace(/^[^·]*· /, ''))} on ${esc(x.why.tag)} (${fmtDate(x.why.date)})</span>` : ''}</span>`;
    } else if (x.type === 'permits') {
      const ph = P.PHASES.map(q => q.key).concat('cancelled').filter(k => x.byPhase.has(k)).reverse();
      body = `${dot(ph[0] || 'permit')}<span>${fmtNum(x.tags.size)} building permit${x.tags.size === 1 ? '' : 's'} with dates this year: ${ph.map(k => `${esc(P.PHASE_BY_KEY[k].label.toLowerCase())} ${fmtNum(x.byPhase.get(k).size)}`).join(' · ')} <span class="muted">— each under All dated events</span></span>`;
    } else {
      body = `${dot(x.phase)}<span>${esc(x.text)}${x.tags.length > 1 ? ` <span class="tl-n">×${x.tags.length}</span>` : ''} <span class="muted">— ${tags(x.tags)}</span></span>`;
    }
    return `<li class="t-${x.type}"><span class="d">${fmtDate(x.date).slice(5)}</span><span class="tl-type">${TL_TYPE[x.type]}</span><div class="tl-body">${body}</div></li>`;
  }
  function evListHTML(list) {
    if (!list.length) return '<p class="muted small">No dated events in the source data.</p>';
    const years = new Map();
    for (const x of list) { const y = fmtDate(x.date).slice(0, 4); if (!years.has(y)) years.set(y, []); years.get(y).push(x); }
    return [...years].map(([y, xs], i) => {
      const n = t => xs.filter(x => x.type === t).length;
      const sum = [n('council') && `${n('council')} council`, n('phase') && `${n('phase')} phase`, n('file') && `${n('file')} file`, (n('permit') + n('permits')) && 'permits'].filter(Boolean).join(' · ');
      return `<details class="tl-year"${i < 2 ? ' open' : ''}><summary><strong>${y}</strong> <span class="muted small">${sum}</span></summary><ol class="tl2">${xs.map(evHTML).join('')}</ol></details>`;
    }).join('');
  }
  function devHistoryHTML(p, st) {
    const cancelled = p.phase === 'cancelled';
    const steps = P.PHASES.map(s => {
      const reached = !cancelled && s.rank <= p.rank, when = p.milestones[s.key];
      return `<li class="${s.key === p.phase ? 'current done' : reached ? 'done' : 'todo'}">${dot(s.key)}<span class="lbl">${esc(s.label)}</span><span class="when">${when ? fmtDate(when) : reached ? 'reached' : ''}</span></li>`;
    }).join('');
    const all = devEvents(p), key = keyEvents(all);
    const nC = all.filter(x => x.type === 'council').length;
    return `<details class="sect" id="dev-hist" open><summary><h2 class="section-title" data-info="dev-history">History</h2><span class="muted small sect-sum">${p.first ? `since ${fmtDate(p.first).slice(0, 4)}` : ''}${nC ? ` · ${nC} council` : ''}</span></summary>
      <ol class="stepper compact">${steps}</ol>
      ${st.sig.length ? `<ul class="why-list" data-info="status-why">${st.sig.map(x => `<li class="why-${x.kind}"><span>${esc(x.text)}</span><small>${esc(x.files.slice(0, 3).join('; '))}${x.files.length > 3 ? ` +${x.files.length - 3} more` : ''}</small></li>`).join('')}</ul>` : ''}
      <div class="seg tl-toggle" role="group" aria-label="Events shown"><button type="button" class="btn small on" data-tl="key">Key events</button><button type="button" class="btn small" data-tl="all">All dated events (${fmtNum(all.length)})</button></div>
      <div data-tlv="key">${evListHTML(key)}</div><div data-tlv="all" hidden>${evListHTML(all)}</div>
      <p class="small muted">Phase changes from the weekly check; council and committee items that name the files (${state.council ? 'agendas and minutes since 2019' : 'loading…'}); file and permit dates from the municipal records. Open a council item for its motion, reports and minutes.</p></details>`;
  }

  function devServicingHTML(p, f) {
    const dem = demandHTML(p, '', true);
    const sum = f ? `${fmt1(f.cb.water.maxDay)} L/s max day · ${fmt1(f.cb.wastewater.wetPeak)} L/s peak wet` : '';
    return `<details class="sect" id="dev-svc"><summary><h2 class="section-title" data-info="servicing-check">Servicing check</h2><span class="muted small sect-sum">${sum}</span></summary>
      ${f ? servicingCheckHTML(p, f) : servicingLineHTML(p)}
      ${dem}</details>`;
  }
  function devUnitsHTML(p) {
    const b = p.buildout, e = empOf(p);
    const sum = [b ? `${fmtNum(b.planned)} planned · ${fmtNum(b.remaining)} left` : p.units ? `${fmtNum(p.units)} units` : '', e && e.jobs ? `~${fmtNum(e.jobs)} jobs` : ''].filter(Boolean).join(' · ');
    return `<details class="sect" id="dev-units"><summary><h2 class="section-title" data-info="buildout">Units, jobs &amp; build-out</h2><span class="muted small sect-sum">${sum}</span></summary>
      ${summaryHTML(p)}
      ${buildoutHTML(p)}
      ${employmentHTML(p)}
      <p class="facts small muted">${[p.first && `First filed ${fmtDate(p.first)}`, p.last && `latest activity ${fmtDate(p.last)}`,
        `${fmtNum(p.records.length)} files`, p.gfa && `${fmtNum(p.gfa)} floor area`].filter(Boolean).join(' · ')}</p></details>`;
  }

  let currentProject = null, backToLoads = null, devBack = null;
  // Development panel tabs (the last one picked is kept for the next development).
  const DV_TABS = [['overview', 'Overview'], ['servicing', 'Servicing'], ['history', 'History & records']];
  function showDvTab(k) {
    if (!DV_TABS.some(([x]) => x === k)) k = 'overview';
    document.querySelectorAll('#detail-body [data-dvt]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.dvt === k)));
    document.querySelectorAll('#detail-body .dv-pane').forEach(p => { p.hidden = p.dataset.dvp !== k; });
  }
  function showDetail(p) {
    // "← What loads …" when opened from that list (kept while the same development is re-rendered).
    if (backToLoads) { devBack = backToLoads; backToLoads = null; } else if (currentProject !== p) devBack = null;
    // Re-rendering the same development (council items arrived, criteria changed): keep what is open.
    const keep = currentProject === p && $('#detail').dataset.view === 'dev'
      ? { open: new Map([...document.querySelectorAll('#detail-body details[id]')].map(d => [d.id, d.open])), tl: (document.querySelector('#detail-body [data-tl].on') || {}).dataset, dvt: (document.querySelector('#detail-body [data-dvt][aria-selected="true"]') || {}).dataset?.dvt } : null;
    currentProject = p;
    setDaContext(p);
    highlight(p);
    loadCouncil();
    const st = statusOf(p), f = svcFacts(p);
    st.works = devWorks(p, f);
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
      ${devBack ? `<button type="button" class="btn small link back-sel" data-loads-back="1">${devBack.dc ? `← ${devBack.dc.ln ? 'DC main' : devBack.dc.fc ? esc(devBack.dc.fc.name) : devBack.dc.cons ? 'Who relies on it' : 'DC timing'}` : `← What loads ${devBack.pipe != null ? `the ${SEW.data.pipes[devBack.pipe][0]} mm sewer` : esc(devBack.plantName ? PLANT_SHORT[devBack.plantName] : (svcById.get(devBack.id) ? (svcById.get(devBack.id).zone ? svcById.get(devBack.id).name : drName(svcById.get(devBack.id))) : 'it'))}`}</button>` : selection.has(p.key) ? `<button type="button" class="btn small link back-sel" data-sel="back">← Selection (${fmtNum(selection.size)} projects)</button>` : ''}
      ${devHeadHTML(p, st, f)}
      <div class="dv-tabs" role="tablist" aria-label="Development">${DV_TABS.map(([k, t]) => `<button type="button" role="tab" data-dvt="${k}" aria-selected="false">${t}</button>`).join('')}</div>
      <div class="dv-pane" data-dvp="overview" role="tabpanel">
        ${devBriefHTML(p, st, f, 'overview')}
        ${devUnitsHTML(p)}
        <details class="sect" id="dev-aerial"><summary><h2 class="section-title" data-info="aerial">Aerial check</h2><span class="muted small sect-sum">before / latest photo</span></summary>
          <div class="aerial" id="aerial-check"></div></details>
      </div>
      <div class="dv-pane" data-dvp="servicing" role="tabpanel">
        ${devBriefHTML(p, st, f, 'servicing')}
        ${devServicingHTML(p, f)}
      </div>
      <div class="dv-pane" data-dvp="history" role="tabpanel">
        ${devHistoryHTML(p, st)}
        <details class="sect" id="dev-recs"><summary><h2 class="section-title" data-info="source-records">Source records</h2><span class="muted small sect-sum">${fmtNum(p.records.length)} files by type</span></summary>
          ${recs}</details>
      </div>`;
    showDvTab(keep && keep.dvt || store.get('dvTab', 'overview'));
    if (keep) {
      for (const [id, open] of keep.open) { const d = document.getElementById(id); if (d) d.open = open; }
      if (keep.tl && keep.tl.tl) showTl(keep.tl.tl);
    }
    $('#detail').hidden = false; $('#detail').dataset.view = 'dev';
    if (!keep) $('#detail').scrollTop = 0;
    if ($('#dev-aerial').open) runAerial(p);
    fillExisting(p);
    viewLink.write();
  }
  function showTl(v) {
    document.querySelectorAll('#detail-body [data-tl]').forEach(b => b.classList.toggle('on', b.dataset.tl === v));
    document.querySelectorAll('#detail-body [data-tlv]').forEach(d => { d.hidden = d.dataset.tlv !== v; });
  }
  $('#detail-body').addEventListener('click', e => {
    if (e.target.closest('[data-loads-back]') && devBack) { const b = devBack; devBack = null; if (b.dc) return showDcBack(b.dc); return b.pipe != null ? showPipeLoads(b.pipe) : showLoads(b.id, b.plantName); }
    const pb = e.target.closest('[data-pipe]'); if (pb && SEW.data) { const i = +pb.dataset.pipe; showPipeLoads(i); const c = SEW.data.pipes[i][10]; map.setView([c[1], c[0]], Math.max(map.getZoom(), 15)); return; }
    const t = e.target.closest('[data-tl]');
    if (t) return showTl(t.dataset.tl);
    const dt = e.target.closest('[data-dvt]');
    if (dt) { store.set('dvTab', dt.dataset.dvt); showDvTab(dt.dataset.dvt); return; }
    const o = e.target.closest('[data-open]');
    if (o) { const d = document.getElementById(o.dataset.open); if (d) { const pane = d.closest('.dv-pane'); if (pane && pane.hidden) showDvTab(pane.dataset.dvp); d.open = true; d.scrollIntoView({ behavior: 'smooth', block: 'start' }); } }
  });
  $('#detail-body').addEventListener('toggle', e => { if (e.target.id === 'dev-aerial' && e.target.open && currentProject) runAerial(currentProject); }, true);

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
  function closeDetail() { $('#detail').hidden = true; highlight(null); setDaContext(null); viewLink.write(); }
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
      ...svcExportFields(p),
    }));
  }
  // Servicing fields for GIS / spreadsheet: layer, build-out people + jobs, flows at Peel design
  // criteria (L/s), pressure zone, catchment and plant (with the distance when assigned to the nearest).
  function svcExportFields(p) {
    const e = D.estimate([p], state.criteria, 'all', jobsOf), cb = e.combined, r2 = v => +v.toFixed(2);
    const z = state.servicing ? svcIds(p, 'pz').map(id => svcById.get(id)).filter(Boolean)[0] : null;
    const d = state.servicing ? svcIds(p, 'dr').map(id => svcById.get(id)).filter(Boolean)[0] : null;
    const zn = state.servicing && nearOf(p, 'pz'), dn = state.servicing && nearOf(p, 'dr');
    return {
      servicing_layer: svcLayerOf(p), buildout_population: Math.round(e.population), buildout_jobs: Math.round(e.employment.jobs),
      water_avg_lps: r2(cb.water.avg), water_maxday_lps: r2(cb.water.maxDay), water_peakhour_lps: r2(cb.water.peakHour),
      ww_avg_dry_lps: r2(cb.wastewater.avg), ww_peak_dry_lps: r2(cb.wastewater.peak), ww_peak_wet_lps: r2(cb.wastewater.wetPeak),
      pressure_zone: z ? z.name : '', pressure_zone_nearest_m: zn ? Math.round(zn.m) : '',
      catchment: d ? drName(d) : '', catchment_nearest_m: dn ? Math.round(dn.m) : '', catchment_via_planned_main: dn && dn.via ? `${dn.via.p || ''} (${dn.via.y || ''})` : '', plant: d ? plantLabel(d.plant) : '',
      ...(w => ({ dc_ww_main: w && w.ww ? `${w.ww.ln.y || ''} ${w.ww.ln.d || ''}mm ${w.ww.ln.p || ''}`.trim() : '', dc_water_main: w && w.wa ? `${w.wa.ln.y || ''} ${w.wa.ln.d || ''}mm ${w.wa.ln.p || ''}`.trim() : '', dc_servicing_year: w && w.needBy ? w.needBy : '', dc_timing_gap: w && w.gap ? 'yes' : '' }))(state.dcInfra ? devWorks(p, svcFacts(p)) : null),
    };
  }
  // Pressure zones and catchments as polygons with their census / build-out figures (GIS).
  function areasGeoJSON() {
    const M = state.svcModel; if (!state.servicing || !M) return null;
    const r2 = v => +(+v).toFixed(3);
    const feat = (a, props) => ({ type: 'Feature', geometry: { type: 'Polygon', coordinates: a.rings }, properties: { id: a.id, name: a.zone ? a.name : drName(a), ...props } });
    const zones = state.servicing.zones.map(a => { const l = M.zones.get(a.id); return feat(a, { kind: 'pressure_zone', ...(l ? { census_pop: Math.round(l.census), buildout_pop: Math.round(M.total(l)), buildout_jobs: Math.round(M.jobs(l)), maxday_census_mld: r2(M.wMax(l.census, 0)), maxday_buildout_mld: r2(M.wMax(M.total(l), M.jobs(l))) } : {}) }); });
    const dr = state.servicing.drainage.map(a => {
      const l = M.local.get(a.id), c = M.cum.get(a.id), ps = psLoad(a);
      return feat(a, { kind: a.kind, plant: plantLabel(a.plant), downstream: a.downstream || '', area_ha: a.areaHa,
        ...(l ? { local_census_pop: Math.round(l.census), local_buildout_pop: Math.round(M.total(l)), local_adwf_census_mld: r2(M.adwf(censusOnly(l))), local_adwf_buildout_mld: r2(M.adwf(l)) } : {}),
        ...(c ? { outlet_adwf_buildout_mld: r2(M.adwf(c)), outlet_pdwf_buildout_mld: r2(M.pdwf(c, 1)), outlet_pwwf_buildout_mld: r2(M.pdwf(c, 1) + M.ii(c)) } : {}),
        ...(ps ? { ps_firm_lps: ps.firm, ps_peak_wet_lps: Math.round(ps.wet), ps_pct_firm: Math.round(ps.pct) } : {}) });
    });
    return { type: 'FeatureCollection', properties: { scenario: scenarioText(), criteria: 'Peel design criteria', generated: new Date().toISOString() }, features: [...zones, ...dr] };
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
    fc.properties = { scenario: state.svcModel ? scenarioText() : '', generated: new Date().toISOString() };
    download('peel-developments.geojson', JSON.stringify(fc), 'application/geo+json');
  };
  $('#btn-areas-geojson').onclick = () => { const fc = areasGeoJSON(); if (fc) download('peel-servicing-areas.geojson', JSON.stringify(fc), 'application/geo+json'); };

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
    syncToolsBtn();
    if (on) { map.dragging.disable(); if (innerWidth <= 760) closeDetail(); }
    else map.dragging.enable();
    lassoSvg.querySelector('path').setAttribute('d', '');
  }
  // Tools: one button under the zoom with the map tools — select an area, measure / select within a
  // radius, test a site.
  const TOOL_ITEMS = [
    ['lasso', 'Select an area', 'Draw around developments to add up their servicing demand and growth', '<rect x="2.5" y="2.5" width="12" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 2"/><path d="M10 9l7.5 3-3.2 1.2 2.6 2.6-1.3 1.3-2.6-2.6L11.8 17z" fill="currentColor"/>'],
    ['measure', 'Measure', 'Measure a distance, or select developments within a radius', '<path d="M3 15 15 3l3 3L6 18z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M6 11.5l1.6 1.6M8.5 9l1.6 1.6M11 6.5l1.6 1.6" stroke="currentColor" stroke-width="1.4"/>'],
    ['whatif', 'Test a site', 'Servicing check for a proposed development: tap the map where it is', '<path d="M10 18.5s6-6.2 6-10.2a6 6 0 0 0-12 0c0 4 6 10.2 6 10.2z" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 5.5v5M7.5 8h5" stroke="currentColor" stroke-width="1.6"/>'],
  ];
  const ToolsControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'leaflet-bar tools-ctl');
      el.innerHTML = `<button type="button" class="tools-btn" aria-expanded="false" aria-haspopup="true" title="Map tools: select an area, measure, test a site" aria-label="Map tools">
          <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M12.6 2.6a4 4 0 0 0-4.9 5.2L2.6 12.9a1.6 1.6 0 0 0 2.3 2.3l5.1-5.1a4 4 0 0 0 5.2-4.9l-2.4 2.4-2.1-.4-.4-2.1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg></button>
        <div class="tools-menu" role="menu" hidden>${TOOL_ITEMS.map(([k, t, d, svg]) => `<button type="button" role="menuitem" data-tool="${k}" title="${esc(d)}"><svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">${svg}</svg><span>${esc(t)}</span></button>`).join('')}</div>`;
      L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
      const menu = el.querySelector('.tools-menu'), btn = el.querySelector('.tools-btn');
      const open = o => { menu.hidden = !o; btn.setAttribute('aria-expanded', String(o)); };
      btn.onclick = () => open(menu.hidden);
      menu.onclick = e => {
        const b = e.target.closest('[data-tool]'); if (!b) return;
        open(false);
        if (b.dataset.tool === 'lasso') { if (tool.mode) setTool(null); setLasso(!lassoOn); }
        else { if (lassoOn) setLasso(false); setTool(b.dataset.tool); }
      };
      document.addEventListener('click', e => { if (!el.contains(e.target)) open(false); });
      return el;
    },
  });
  new ToolsControl().addTo(map);
  // The Tools button shows when a tool is on.
  const syncToolsBtn = () => { const b = document.querySelector('.tools-btn'); if (b) b.classList.toggle('on', lassoOn || !!tool.mode); document.querySelectorAll('.tools-menu [data-tool]').forEach(x => x.classList.toggle('on', x.dataset.tool === 'lasso' ? lassoOn : tool.mode === x.dataset.tool)); };

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
    const b = canRotate ? map.getBearing() : 0;
    if (g) g.setAttribute('transform', `rotate(${b} 12 12)`);
    const c = document.querySelector('.north-ctl'); if (c) c.hidden = Math.abs(((b % 360) + 360) % 360) < 0.5;
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
  // Address search: as you type, developments whose address matches and street addresses from a
  // geocoder (Esri World Geocoder, else OpenStreetMap Nominatim), limited to Peel; picking one pans
  // and zooms the map there (a development also opens). Enter takes the first suggestion.
  const sugEl = $('#search-sug'), geoCache = new Map();
  let sugItems = [], sugSel = -1, sugTimer, sugSeq = 0;
  const PEEL_EXT = `${CFG.bbox.xmin},${CFG.bbox.ymin},${CFG.bbox.xmax},${CFG.bbox.ymax}`;
  async function geocode(q) {
    if (geoCache.has(q)) return geoCache.get(q);
    let out = [];
    try {
      const u = `https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/findAddressCandidates?f=json&singleLine=${encodeURIComponent(q)}&searchExtent=${PEEL_EXT}&countryCode=CAN&maxLocations=5&outFields=Match_addr`;
      const r = await fetch(u); const j = r.ok ? await r.json() : null;
      out = (j && j.candidates || []).filter(c => c.score >= 75).map(c => ({ label: c.address, lat: c.location.y, lng: c.location.x }));
    } catch (e) { /* try the next geocoder */ }
    if (!out.length) try {
      const b = CFG.bbox, u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&countrycodes=ca&bounded=1&viewbox=${b.xmin},${b.ymax},${b.xmax},${b.ymin}&q=${encodeURIComponent(q)}`;
      const r = await fetch(u, { headers: { 'Accept-Language': 'en' } }); const j = r.ok ? await r.json() : [];
      out = j.map(x => ({ label: x.display_name.split(', ').slice(0, 4).join(', '), lat: +x.lat, lng: +x.lon }));
    } catch (e) { /* offline */ }
    const inPeel = x => x.lng >= CFG.bbox.xmin && x.lng <= CFG.bbox.xmax && x.lat >= CFG.bbox.ymin && x.lat <= CFG.bbox.ymax;
    out = out.filter(inPeel);
    geoCache.set(q, out);
    return out;
  }
  function renderSug() {
    sugEl.hidden = !sugItems.length;
    sugEl.innerHTML = sugItems.map((x, i) => `<li role="option" data-i="${i}" class="${i === sugSel ? 'on' : ''}" aria-selected="${i === sugSel}">${x.p ? dot(x.p.phase) : '<span class="sug-pin" aria-hidden="true"></span>'}<span>${esc(x.label)}<small>${x.p ? `${esc(x.p.municipality)} · ${esc(P.PHASE_BY_KEY[x.p.phase].label)}` : x.loading ? 'searching addresses…' : 'Go to address'}</small></span></li>`).join('');
  }
  async function updateSug(q) {
    const seq = ++sugSeq;
    if (q.length < 3) { sugItems = []; renderSug(); return; }
    const ql = q.toLowerCase();
    const devs = state.projects.filter(p => p.lat != null && (p.title.toLowerCase().includes(ql) || p.records.some(r => (r.address || '').toLowerCase().includes(ql) || (r.ref || '').toLowerCase() === ql)))
      .sort((a, b) => (b.title.toLowerCase().startsWith(ql) - a.title.toLowerCase().startsWith(ql)) || (b.units || 0) - (a.units || 0)).slice(0, 4);
    sugItems = [...devs.map(p => ({ label: p.title, p })), ...(/\d/.test(q) || q.length > 4 ? [{ label: q, loading: true }] : [])];
    sugSel = -1; renderSug();
    if (!sugItems.some(x => x.loading)) return;
    const geo = await geocode(q);
    if (seq !== sugSeq) return;
    sugItems = [...devs.map(p => ({ label: p.title, p })), ...geo.map(g => ({ label: g.label, g }))];
    renderSug();
  }
  const pinLayer = L.layerGroup().addTo(map);
  function goSug(x) {
    if (!x || x.loading) return;
    sugItems = []; renderSug();
    // On a phone the search sits in the list view: switch to the map to show the place.
    if (innerWidth <= 760 && $('#sidebar').classList.contains('open')) { toggleSidebar(false); setTimeout(() => map.invalidateSize(), 50); }
    if (x.p) { map.setView([x.p.lat, x.p.lng], Math.max(map.getZoom(), 17)); showDetail(x.p); return; }
    // An address: pan and zoom there with a pin; the text filter is cleared so nothing is hidden.
    $('#f-search').value = ''; if (state.search) { state.search = ''; applyFilters(); }
    pinLayer.clearLayers();
    L.marker([x.g.lat, x.g.lng], { icon: L.divIcon({ className: 'addr-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 22] }), keyboard: false })
      .bindTooltip(`<strong>${esc(x.g.label)}</strong><br><span class="muted">Tap to remove</span>`, { className: 'pt', direction: 'top', offset: [0, -20], permanent: true })
      .on('click', () => pinLayer.clearLayers()).addTo(pinLayer);
    map.setView([x.g.lat, x.g.lng], 17);
    if (innerWidth <= 760) closeDetail();
  }
  $('#f-search').addEventListener('input', e => { clearTimeout(sugTimer); const q = e.target.value.trim(); sugTimer = setTimeout(() => updateSug(q), 300); });
  $('#f-search').addEventListener('keydown', async e => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!sugItems.length) return; e.preventDefault();
      sugSel = (sugSel + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length; renderSug();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const q = e.target.value.trim(); if (q.length < 3) return;
      if (sugSel >= 0) return goSug(sugItems[sugSel]);
      const ready = sugItems.find(x => !x.loading);
      if (ready) return goSug(ready);
      const geo = await geocode(q); if (geo.length) goSug({ label: geo[0].label, g: geo[0] });
    } else if (e.key === 'Escape') { sugItems = []; renderSug(); }
  });
  sugEl.addEventListener('mousedown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); goSug(sugItems[+li.dataset.i]); } });
  $('#f-search').addEventListener('blur', () => setTimeout(() => { sugItems = []; renderSug(); }, 150));
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
      let dc;
      [state.svcCensus, state.reports, dc] = await Promise.all([opt('data/svc-census.json'), opt('data/peel-reports.json'), opt('data/dc-infra.json')]);
      state.dcInfra = prepDc(dc);
      renderRefs();
      for (const a of [...state.servicing.zones, ...state.servicing.drainage]) svcById.set(a.id, a);
      $('#f-svc-group').hidden = false;
      tagServicing();
      renderSvcSelects();
      for (const k of ['pz', 'dr']) if (svcOn[k]) setSvcLayer(k, true);
      renderDcLayer(); renderLegend();
      applyFilters();
      setTimeout(loadSewers, 1500);
      loadWaterSupply().then(() => { if (currentProject && !$('#detail').hidden && $('#detail').dataset.view === 'dev') showDetail(currentProject); });
    } catch (e) { /* optional */ }
  }
  function tagServicing() {
    if (!state.servicing) return;
    for (const p of state.projects) {
      p.pz = PeelAreas.locate(state.servicing.zones, p.lng, p.lat);
      p.dr = PeelAreas.locate(state.servicing.drainage, p.lng, p.lat);
      // Outside the mapped zones / traced catchments: the nearest one within NEAR_M of its edge,
      // the area it would most likely connect to (greenfield lands, gaps in the traced network).
      p.pzNear = p.pz.length ? null : dcVia(p, 'pz') || PeelAreas.nearest(state.servicing.zones, p.lng, p.lat, NEAR_M);
      p.drNear = p.dr.length ? null : dcVia(p, 'dr') || PeelAreas.nearest(state.servicing.drainage, p.lng, p.lat, NEAR_M);
    }
    state.whatifs = whatIfs.filter(w => w.include).map(whatIfProject);
  }
  const NEAR_M = 5000;
  // The development's pressure zone / drainage area ids: mapped, else (switch on) the nearest.
  const svcIds = (p, key) => (p[key] && p[key].length) ? p[key] : svcOpt.nr === 'on' && p[`${key}Near`] ? [p[`${key}Near`].id] : [];
  const nearOf = (p, key) => !(p[key] && p[key].length) && svcOpt.nr === 'on' ? p[`${key}Near`] : null;
  const kmText = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  // How an outside development was assigned: through the planned main it would connect to, or by distance.
  const nearText = n => n.via ? `via planned ${n.via.y || ''} ${n.via.d ? `${n.via.d} mm ` : ''}main ${n.via.p || ''}, ${kmText(n.m)}`.replace(/\s+/g, ' ') : `nearest, ${kmText(n.m)}`;
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
    if (a.zone) return `<strong>${esc(a.name)}</strong><br><span class="muted">Region of Peel water pressure zone · tap: what loads it</span>`;
    return `<strong>${esc(drName(a))}</strong><br>Drains to ${esc(plantLabel(a.plant))}${a.outlet ? ` via ${esc(a.outlet)}` : ''}<br>
      <span class="muted">${fmtNum(a.areaHa)} ha · ${fmtNum(a.manholes)} manholes${a.trunkMm ? ` · outlet ${a.trunkMm} mm` : ''} · traced from the sewer network · tap: what loads it</span>`;
  }
  function setSvcLayer(k, on) {
    svcOn[k] = on; store.set(`svc-${k}`, on);
    if (!on) { if (svcLayers[k]) map.removeLayer(svcLayers[k]); return; }
    if (!state.servicing) return;
    if (!svcLayers[k]) {
      const list = k === 'pz' ? state.servicing.zones : state.servicing.drainage;
      svcLayers[k] = L.featureGroup(list.map(a => L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), {
        renderer: svcRenderer, pane: 'svcPane', svcId: a.id, color: svcColor(a), weight: k === 'pz' ? 1.6 : 1.3, opacity: 0.85,
        dashArray: k === 'pz' ? '6 4' : null, fill: true, fillColor: svcColor(a), fillOpacity: k === 'pz' ? 0.03 : 0.07,
      }).bindTooltip(svcTooltip(a), { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); showLoads(a.id); })));
    }
    svcLayers[k].addTo(map);
  }
  // Master plan pumping station for a traced drainage area (by name): firm capacity in L/s.
  const spsKey = n => String(n || '').toLowerCase().replace(/^[^·]+·\s*/, '').replace(/\s+ps$/, '').replace(/'/g, '').replace(/ memorial park/, '').replace(/ (drive|avenue|road|trail|parkway|crescent|court|mews)$/, '').trim();
  function spsOf(a) {
    const mp = state.reports && state.reports.masterPlan; if (!mp || !a || a.kind !== 'ps') return null;
    const k = spsKey(a.name); return mp.sps.find(x => x.key === k) || null;
  }
  const spsNote = sp => { const n = state.reports.masterPlan.spsNotes || {}; const k = Object.keys(n).find(x => sp.key.startsWith(x)); return k ? n[k] : ''; };
  // Servicing check for one development (development panel): its own flows at Peel design
  // criteria (FSR basis), its pressure zone, the sewer path from its catchment down to the plant
  // with its share of the flow at each outlet, and what it means for the plant's uncommitted
  // reserve capacity.
  // Servicing facts for one development (brief, header flags and the check): flows at design
  // criteria, pressure zone, sewer path to the plant with pumping stations, plant reserve.
  function svcFacts(p) {
    const M = state.svcModel;
    if (!state.servicing || !M) return null;
    const e = D.estimate([p], state.criteria, 'all', jobsOf), cb = e.combined;
    if (!(e.totalUnits > 0 || e.employment.jobs > 0)) return null;
    const layer = p.phase === 'completed' ? 'built' : D.COMMITTED_PHASES.has(p.phase) ? 'approved' : (p.phase === 'inception' || p.phase === 'review') ? 'proposed' : null;
    const z = svcIds(p, 'pz').map(id => svcById.get(id)).filter(Boolean)[0];
    const zl = z && M.zones.get(z.id);
    const zMax = zl ? M.wMax(M.total(zl), M.jobs(zl)) : 0;
    let d = svcIds(p, 'dr').map(id => svcById.get(id)).filter(Boolean)[0];
    const path = []; const seen = new Set();
    while (d && !seen.has(d.id)) { seen.add(d.id); path.push(d); d = d.downstream ? svcById.get(d.downstream) : null; }
    // Pumping stations on the path: build-out peak dry and ≈ peak wet (design flows) vs firm capacity.
    const sps = path.filter(a => spsOf(a)).map(a => {
      const l = M.cum.get(a.id);
      return { a, firm: spsOf(a).firmLs, dry: l ? M.pdwf(l, 1) * 1e6 / 86400 : 0, wet: l ? (M.pdwf(l, 1) + M.ii(l)) * 1e6 / 86400 : 0 };
    });
    const pl = path.length ? path[path.length - 1].plant : null, cap = pl && M.plantCap(pl);
    const devAvg = D.toMLd(cb.wastewater.avg);
    return { M, e, cb, layer, z, zNear: nearOf(p, 'pz'), dNear: nearOf(p, 'dr'), zl, zMax, path, sps, pl, cap, devAvg, reserve: cap ? cap.rated - cap.committed : 0, use: cap ? devAvg * cap.f : 0 };
  }
  // Servicing check (inside the Servicing section): the development's flows at Peel design
  // criteria (FSR basis), its pressure zone, the sewer path from its catchment down to the plant
  // with its share of the flow at each outlet, and what it means for the plant's uncommitted
  // reserve capacity.
  function servicingCheckHTML(p, F) {
    const { M, e, cb, layer, z, zl, zMax, path, pl, cap, devAvg } = F;
    const mld = D.toMLd, ls = uLs, pct = pctOf;
    const layerText = { built: 'built — part of the existing flow', approved: 'approved — already committed', proposed: 'proposed — not yet committed; it would draw on the reserve' }[layer] || 'withdrawn — not counted';
    const water = `<tr><td>Water · ${z ? esc(z.name.replace('Pressure zone ', 'Zone ')) : 'no pressure zone'}${F.zNear ? `<small>${esc(nearText(F.zNear))}</small>` : ''}</td><td>${ls(cb.water.avg)}<small>${uML(mld(cb.water.avg))}</small></td><td>${ls(cb.water.maxDay)}<small>${uML(mld(cb.water.maxDay))}</small></td><td>${ls(cb.water.peakHour)}</td><td>${zl ? `${pct(mld(cb.water.maxDay), zMax)} of the zone's build-out max day (${uML(zMax)})` : ''}</td></tr>`;
    const sewer = `<tr><td>Wastewater</td><td>${ls(cb.wastewater.avg)}<small>${uML(mld(cb.wastewater.avg))}</small></td><td>${ls(cb.wastewater.peak)}<small>peak dry</small></td><td>${ls(cb.wastewater.wetPeak)}<small>peak wet</small></td><td></td></tr>`;
    const pathRows = path.map((a, i) => {
      const l = M.cum.get(a.id), f = M.fOf(a.plant), out = l ? M.adwf(l, f) : 0;
      return `<tr><td>${i ? '↳ ' : F.dNear ? `<span class="est">${esc(nearText(F.dNear))}</span> ` : ''}${a.kind === 'plant' ? `${esc(plantLabel(a.plant))} inflow` : esc(drName(a).replace(/^[^·]+· /, ''))}<small>${a.kind === 'ps' ? (spsOf(a) ? ((dry, wet) => `pumping station — firm ${fmtNum(spsOf(a).firmLs)} L/s; build-out peak dry ${fmtNum(Math.round(dry))} L/s (${Math.round(dry / spsOf(a).firmLs * 100)}%), peak wet ≈${fmtNum(Math.round(wet))} L/s (${Math.round(wet / spsOf(a).firmLs * 100)}%)`)(l ? M.pdwf(l, 1) * 1e6 / 86400 : 0, l ? (M.pdwf(l, 1) + M.ii(l)) * 1e6 / 86400 : 0) : 'pumping station — capacity not in the master plan table') : a.kind === 'trunk' ? `trunk${a.trunkMm ? ` ${a.trunkMm} mm` : ''} outlet` : a.kind === 'plant' ? 'reaches the plant' : 'City of Toronto system'}</small></td><td>${uML(out)}</td><td>${pct(devAvg * f, out)}</td></tr>`;
    }).join('');
    let plant = '';
    if (cap) {
      const reserve = cap.rated - cap.committed, use = devAvg * cap.f;
      plant = `<p class="small svc-verdict"><strong>${esc(cap.name)}</strong>: rated ${uML(cap.rated)}; existing + approved ${pct(cap.committed, cap.rated)} (${uML(cap.committed)}); uncommitted reserve <strong>${uML(reserve)}</strong>${M.mode === 'calibrated' ? ' (capacity check)' : ' (design flows)'}.
        This development is <strong>${layerText}</strong>. Its average dry weather flow ${M.mode === 'calibrated' && cap.f !== 1 ? `at the plant's measured rate (×${cap.f.toFixed(2)}) ` : ''}is ${uML(use)}${reserve > 0 ? ` = <strong>${pct(use, reserve)}</strong> of the reserve` : ' — the plant is already over-committed'}.</p>`;
    } else if (pl === 'Toronto') plant = '<p class="small svc-verdict">Drains to the City of Toronto system (Malton): capacity is Toronto\'s, not in Peel\'s plant figures.</p>';
    return `<table class="dt chk-table"><thead><tr><th>Whole development<br><span class="muted">Peel design criteria</span></th><th>Average</th><th>Max day / peak</th><th>Peak hour / wet</th><th></th></tr></thead><tbody>${water}${sewer}</tbody></table>
      ${path.length ? `<table class="dt chk-table"><caption>Sewer path to the plant · build-out average dry weather at each outlet (${M.mode === 'calibrated' ? 'capacity check' : 'design flows'})</caption><thead><tr><th>Catchment outlet</th><th>Flow at outlet</th><th>This development</th></tr></thead><tbody>${pathRows}</tbody></table>` : '<p class="small muted">Not in a traced drainage area.</p>'}
      ${plant}
      <p class="small muted">${fmtNum(Math.round(e.totalUnits))} units, ${fmtNum(roundPop(e.population))} people${e.employment.jobs > 0 ? `, ${fmtNum(Math.round(e.employment.jobs))} jobs` : ''} at build-out; flows in L/s as in a functional servicing report, ML/d below. Pumping stations are checked against their firm capacity (2020 Master Plan, Vol. 4 Table 6) at peak wet weather; trunk sewer capacities are not published, so they are not checked.</p>`;
  }
  // Project panel line: its pressure zone and drainage area.
  function servicingLineHTML(p) {
    if (!state.servicing) return '';
    const z = svcIds(p, 'pz').map(id => svcById.get(id)).filter(Boolean), d = svcIds(p, 'dr').map(id => svcById.get(id)).filter(Boolean);
    const zn = nearOf(p, 'pz'), dn = nearOf(p, 'dr');
    if (!z.length && !d.length) return `<p class="small muted svc-line" data-info="drainage-area">Outside the mapped pressure zones and traced drainage areas${svcOpt.nr === 'on' ? ` (none within ${kmText(NEAR_M)} — likely private well / septic or not yet planned for servicing)` : ''}.</p>`;
    return `<p class="small svc-line" data-info="drainage-area"><strong>Servicing:</strong> ${z.length ? esc(z.map(a => a.name).join(', ')) + (zn ? ` <span class="est">${esc(nearText(zn))}</span>` : '') : 'no pressure zone'} · ${d.length
      ? esc(d.map(a => `${drName(a)} → ${plantLabel(a.plant)}`).join(', ')) + (dn ? ` <span class="est">${esc(nearText(dn))}</span>` : '') : 'no traced drainage area'}</p>`;
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
    const devs = state.projects.concat(state.whatifs || []).filter(p => p.phase !== 'cancelled' && svcIds(p, key).includes(a.id));
    const gr = PeelAreas.growthSince(devs, {}, bc.date, state.criteria);
    return { census: svcCensusPop(bc).get(a.id) || 0, built: gr.built.population, approved: gr.approved.population, proposed: gr.proposed.population,
      ...svcJobs(devs, bc.date),
      // Developments = sites with a planning application (stand-alone permits still count in Built since).
      units: gr.built.units + gr.approved.units + gr.proposed.units, devs: devs.filter(p => p.kinds.includes('application')).length,
      near: devs.filter(p => p.kinds.includes('application') && nearOf(p, key)).length };
  }
  const SUM_KEYS = ['census', 'built', 'approved', 'proposed', 'jbuilt', 'japproved', 'jproposed', 'units', 'devs', 'near'];
  // Developments cell: count, and how many are outside the area and assigned to it as the nearest.
  const devCell = l => `<td>${uDev(l.devs)}${l.near ? `<small>${fmtNum(l.near)} nearest</small>` : ''}</td>`;
  const nearNote = (n, what) => `<p class="small muted">${svcOpt.nr === 'on'
    ? `<strong>Outside mapped areas:</strong> ${fmtNum(n)} developments outside every ${what} are counted in the nearest one within ${kmText(NEAR_M)} of its edge (“nearest” under Developments) — mostly greenfield lands beyond the existing network, which would most likely connect there. A screening assumption: the actual connection comes from the functional servicing report or master plan. Farther away, a development is left out (likely private well / septic).`
    : `<strong>Outside mapped areas:</strong> developments outside every ${what} are left out; switch “Assign to nearest” to count them in the nearest ${what}.`}</p>`;
  // Scenario: every assumption behind the servicing figures in one place (footer bar), summarised
  // on the tabs, the map legend, the exports and share links.
  function scenarioText() {
    const R = state.reports, dv = R && R.wastewater.diversion, n = criteriaChanges().length;
    return [svcOpt.ww === 'calibrated' ? 'Capacity check (2025 flows)' : 'Design flows', `max day ${svcOpt.md === 'observed' ? 'observed' : 'design'}`,
      dv ? `diversion ${svcOpt.div === 'on' ? 'on' : 'off'}` : null, `outside areas ${svcOpt.nr === 'on' ? 'to nearest' : 'left out'}`, state.dcInfra ? `plant expansions ${hz.exp ? 'on' : 'off'}` : null, n ? `${n} criteria modified` : 'Peel criteria'].filter(Boolean).join(' · ');
  }
  // Scenario A: a pinned set of results to compare the current scenario with.
  function scenarioMetrics() {
    const M = state.svcModel; if (!M || !state.servicing) return null;
    const plants = {}, ps = {}, zones = {};
    for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) { const c = M.plantCap(pl); if (c) plants[pl] = { committed: c.committed, buildout: c.buildout, rated: c.rated }; }
    for (const d of state.servicing.drainage) { const x = psLoad(d); if (x) ps[d.id] = Math.round(x.pct); }
    for (const z of state.servicing.zones) { const l = M.zones.get(z.id); if (l) zones[z.id] = M.wMax(M.total(l), M.jobs(l)); }
    return { text: scenarioText(), at: new Date().toISOString().slice(0, 16).replace('T', ' '), plants, ps, zones };
  }
  function compareHTML() {
    const A = store.get('scenA', null), B = scenarioMetrics();
    if (!B) return '';
    if (!A) return `<p class="small"><button type="button" class="btn small" data-scen-pin="1">Pin this scenario as A</button> <span class="muted">then change the switches to compare plants, pumping stations and zones with it.</span></p>`;
    const pc = (v, r) => r ? Math.round(v / r * 100) : 0, d = (a, b) => { const x = b - a; return x === 0 ? '<span class="muted">0</span>' : `<strong class="${x > 0 ? 'up' : 'down'}">${x > 0 ? '+' : ''}${x}</strong>`; };
    const rows = Object.keys(B.plants).filter(pl => A.plants[pl]).map(pl => {
      const a = A.plants[pl], b = B.plants[pl];
      return `<tr><td>${esc(PLANT_SHORT[pl])}</td><td>${pc(a.committed, a.rated)}%</td><td>${pc(b.committed, b.rated)}%</td><td>${d(pc(a.committed, a.rated), pc(b.committed, b.rated))}</td><td>${pc(a.buildout, a.rated)}%</td><td>${pc(b.buildout, b.rated)}%</td><td>${d(pc(a.buildout, a.rated), pc(b.buildout, b.rated))}</td></tr>`;
    }).join('');
    const over = m => Object.values(m.ps).filter(v => v > 100).length;
    const changed = Object.keys(B.ps).filter(id => A.ps[id] != null && (A.ps[id] > 100) !== (B.ps[id] > 100)).map(id => svcById.get(id)).filter(Boolean);
    const zA = Object.values(A.zones).reduce((t, v) => t + v, 0), zB = Object.values(B.zones).reduce((t, v) => t + v, 0);
    return `<div class="scen-cmp"><p class="small"><strong>A</strong> (pinned ${esc(A.at)}): ${esc(A.text)}<br><strong>Now</strong>: ${esc(B.text)} <button type="button" class="btn small link" data-scen-pin="1">Re-pin as A</button> <button type="button" class="btn small link" data-scen-clear="1">Clear A</button></p>
      <table class="dt"><thead><tr><th>Plant</th><th>Existing + approved A</th><th>Now</th><th>Δ pts</th><th>Build-out A</th><th>Now</th><th>Δ pts</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small">Pumping stations over firm capacity at build-out: A ${over(A)} → now ${over(B)}${changed.length ? ` (changed: ${changed.map(a => esc(drName(a).replace(/^[^·]+· /, ''))).join(', ')})` : ''}. Water max day at build-out, all zones: A ${fmt1(zA)} → now ${fmt1(zB)} ML/d.</p></div>`;
  }
  const scenarioChip = () => `<button type="button" class="chip scen-chip" data-open-scen="1" title="Change the scenario">Scenario: ${esc(scenarioText())}</button>`;
  function renderScenario() {
    const el = $('#scen-bar'); if (!el) return;
    const R = state.reports, c = state.criteria, sp = R && R.water.southPeel, dv = R && R.wastewater.diversion, n = criteriaChanges().length;
    const open = el.querySelector('details') && el.querySelector('details').open;
    el.innerHTML = `<details class="scen"${open ? ' open' : ''}><summary><span class="scen-k">Scenario</span> <span class="scen-t">${esc(scenarioText())}</span>${store.get('scenA', null) ? ' <span class="chip">comparing with A</span>' : ''}</summary>
      <div class="svc-switches">
        ${R ? optSwitch('ww', 'Wastewater', [['calibrated', 'Capacity check (2025 flows)'], ['design', 'Design flows (Peel criteria)']]) : ''}
        ${sp ? optSwitch('md', 'Water max day', [['design', `Design ×${c.water.maxDay}`], ['observed', `Observed 2025 ×${sp.maxDayFactor.toFixed(2)}`]]) : ''}
        ${dv ? optSwitch('div', `${fmt1(dv.mld)} ML/d diversion to ${PLANT_SHORT[dv.to]}`, [['off', 'Off'], ['on', `On (planned ${dv.when})`]]) : ''}
        ${nearSwitch()}
      </div>
      ${compareHTML()}
      <p class="small muted">Horizon years: Wastewater → Plants & capacity. Criteria: ${n ? `<strong>${n} modified</strong>` : 'Peel defaults'} — <button type="button" class="btn small link" data-goto-tab="criteria">Criteria &amp; references</button>. The scenario is saved in this browser and carried in share links and exports.</p></details>`;
  }
  const nearSwitch = () => optSwitch('nr', 'Outside mapped areas', [['on', `Assign to nearest (≤${kmText(NEAR_M)})`], ['off', 'Leave out']]);
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
  const svcOpt = { ww: store.get('svcWwMode', 'calibrated'), md: store.get('svcMdMode', 'design'), div: store.get('svcDivert', 'off'), tech: store.get('svcTech', 'off'), nr: store.get('svcNear', 'on') };
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
      ? `residential ${c.water.avg} L/cap/d, max day ×${c.water.maxDay}, peak hour ×${c.water.peakHour} (Peel Modelling Demand Table, Aug 2024); employment ${E.water} L/emp/d`
      : `residential ${c.wastewater.avg} L/cap/d with Harmon peaking (${c.wastewater.peakMin}–${c.wastewater.peakMax}), I&amp;I ${c.wastewater.infiltration} L/s/ha (Peel Linear Wastewater Standards 2023); employment ${E.wastewater} L/emp/d (Peel Modelling Demand Table, Aug 2024)`;
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
    const wRow = (name, l, id, cls = '') => `<tr${rowAttrs(id, cls)}><td>${name}</td><td class="bar">${svcBar(l)}</td>${devCell(l)}${LAYER_KEYS.map(k => cell(wMax(l[k], jobsK(l, k)), l[k], jobsK(l, k))).join('')}
      ${cell(wMax(total(l), jobs(l)), total(l), jobs(l), 'bo')}<td class="bo">${uML(wPH(total(l), jobs(l)))}</td></tr>`;
    const zones = state.servicing.zones.slice().sort(byZone);
    const zr = zones.map(z => ({ a: z, l: svcLayerTotals('pz', z, bc) })).filter(r => total(r.l) > 0 || r.l.devs);
    const zsum = addLayers(zr.map(r => r.l));
    $('#water-body').innerHTML = `${exportBar('water')}${stampHTML('water', Y)}<div class="svc-head">${svcLegend(Y)}<div class="svc-switches">${scenarioChip()}${inViewBox()}</div></div>
      <table class="dt svc-table" data-info="pressure-zone"><caption>Water by pressure zone · maximum day (ML/d) at ${observed ? `the observed 2025 factor ×${mdR.toFixed(2)}` : `design ×${mdR} residential, ×${mdE} employment`}; people and jobs below</caption>
      <thead><tr><th>Pressure zone</th><th class="bar-h">Build-out mix</th><th>Developments</th>${layerHead}<th>Peak hour<br>build-out</th></tr></thead>
      <tbody>${zr.map(r => wRow(esc(r.a.name.replace('Pressure zone ', 'Zone ')), r.l, r.a.id)).join('')}${wRow('All pressure zones', zsum, null, 'tot')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary>${nearNote(zsum.near, 'pressure zone')}<p class="small muted">ML/d = megalitres per day. Residential ${c.water.avg} L/cap/d and employment ${E.water} L/emp/d (jobs on development sites; existing employment is not in the census baseline); peak hour ×${c.water.peakHour} residential, ×${E.peakHour} employment. ${Y} Census ${censusHow}; growth from every development located in the zone (other filters ignored), as in the Growth tab.</p></details>
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
    const pdwf = (l, f = 1) => f * (total(l) * c.wastewater.avg / 1e6 * D.residentialPeaking(total(l), c.wastewater) + jobs(l) * E.wastewater / 1e6 * D.employmentPeaking(jobs(l), E));
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
    const peakCells = (l, f) => `<td>${uML(pdwf(l, f))}<small class="tech">M ${total(l) > 0 ? D.residentialPeaking(total(l), c.wastewater).toFixed(2) : '–'}</small></td><td>${uML(ii(l))}<small class="tech">${uHa(l.ha)}</small></td><td class="bo">${uML(pdwf(l, f) + ii(l))}</td>`;
    const nameCell = (name, sub, depth) => `<td style="padding-left:${6 + depth * 12}px">${depth ? '<span class="flow-arrow" aria-hidden="true">↳</span>' : ''}${name}${sub ? `<small>${sub}</small>` : ''}</td>`;
    const lay = (l, k, f) => f * raw(l[k], jobsK(l, k));
    const sRow = (name, sub, d, l, id, f, cls = '', depth = 0) => {
      const lo = d ? local.get(d.id) : null, up = d ? upOf(d) : null;
      // Where the flow comes from (local + upstream) and what it is made of (census + growth
      // layers); both add up to the total average dry weather flow at the outlet.
      const mid = (d ? cell(adwf(lo, f), total(lo), jobs(lo)) + (total(up) > 0 || up.ha ? cell(adwf(up, f), total(up), jobs(up)) : '<td class="muted">–</td>') : '<td></td><td></td>')
        + LAYER_KEYS.map((k, i) => cell(lay(l, k, f), l[k], jobsK(l, k), i ? '' : 'sep')).join('') + cell(adwf(l, f), total(l), jobs(l), 'bo');
      return `<tr${rowAttrs(id, cls)}>${nameCell(name, sub, depth)}<td class="bar">${svcBar(l)}</td>${devCell(d ? lo : l)}${mid}${peakCells(l, f)}</tr>`;
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
          : `→ ${esc(to ? short(to, pl) : plantLabel(pl))}${n ? ` · ${n} upstream` : ''}${(sp => { if (!sp) return ''; const ls = v => v * 1e6 / 86400, dry = ls(pdwf(l, 1)) / sp.firmLs * 100, wet = ls(pdwf(l, 1) + ii(l)) / sp.firmLs * 100; return ` · <span class="${dry >= 100 ? 'over' : ''}" title="${esc(spsNote(sp))}">firm ${fmtNum(sp.firmLs)} L/s: peak dry ${Math.round(dry)}%, wet ≈${Math.round(wet)}%</span>`; })(spsOf(d))}`;
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
    $('#ww-body').innerHTML = `${exportBar('catchments')}${stampHTML('ww', Y)}<div class="svc-head">${svcLegend(Y)}<div class="svc-switches">${optSwitch('tech', 'Details', [['off', 'Simple'], ['on', 'Engineering']])}${scenarioChip()}${inViewBox()}</div></div>${calNote}
      <table class="dt svc-table ww-table" data-info="drainage-area"><caption>Wastewater by sanitary catchment, building up along the flow path to the lake · average dry weather (ML/d); people and jobs below</caption>
      <thead><tr><th rowspan="2">Catchment (top of the sewershed → plant)</th><th rowspan="2" class="bar-h">Build-out mix</th><th rowspan="2">Developments</th>
        <th colspan="2" class="grp-h">Where it comes from</th><th colspan="4" class="grp-h sep">What it is made of</th><th rowspan="2">= Total<br>average dry</th><th rowspan="2">Peak dry<br>weather</th><th rowspan="2">I&amp;I</th><th rowspan="2">Peak wet<br>weather</th></tr>
        <tr><th>Local</th><th>+ Upstream</th><th class="sep">${Y} Census</th><th>+ Built since ${Y}</th><th>+ Approved</th><th>+ Proposed (in review)</th></tr></thead>
      <tbody>${secs.map(x => `<tr class="grp"><td colspan="${cols}">${esc(plantLabel(x.pl))}</td></tr>${x.rows.join('')}`).join('')}
        ${sRow(`Peel total (${secs.map(x => PLANT_SHORT[x.pl]).join(' + ')})`, '', null, peel, null, peelF, 'tot')}
        ${tor.rows.length ? `<tr class="grp"><td colspan="${cols}">${esc(plantLabel('Toronto'))} · not in the Peel total</td></tr>${tor.rows.join('')}` : ''}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary>${nearNote([...local.values()].reduce((a, l) => a + (l.near || 0), 0), 'traced catchment')}<p class="small muted">ML/d = megalitres per day, at build-out (${Y} Census + growth). <strong>Local</strong> = the catchment's own population, jobs and flow; <strong>upstream</strong> = everything that drains into it (the indented rows above it); <strong>total</strong> = local + upstream = ${Y} Census + built + approved + proposed, the average dry weather flow leaving its outlet. Each plant's last row is its total inflow from Peel catchments; external inflows (York Region, City of Toronto) are in the Plants tab. Residential ${c.wastewater.avg} L/cap/d, employment ${E.wastewater} L/emp/d (jobs on development sites; existing employment is not in the census baseline). <strong>Peak dry weather</strong> = residential average × Harmon M = 1 + 14 / (4 + √P) on the total population (M shown) + employment average × Harmon on the jobs, kept between ${E.peakMin} and ${E.peakMax}; <strong>I&amp;I</strong> = ${c.wastewater.infiltration} L/s/ha on the whole traced drainage area to the outlet; <strong>peak wet weather</strong> = peak dry + I&amp;I. Peaks are not additive. ${Y} Census ${censusHow}; growth from every development located in the catchment (other filters ignored). Pumping stations: firm capacity from the 2020 Master Plan (Vol. 4, Table 6; largest pump out of service) against the build-out flow at Peel design criteria (not calibrated); the Region expands a station when peak wet weather flow reaches firm capacity. Peak dry is the firmer comparison: I&amp;I here uses the traced catchment outline, which overstates the area of small catchments, so peak wet is approximate (≈). Very small stations (Watersedge, Meadowvale) showing over 100% even at peak dry most likely have a traced catchment larger than the area they really serve. Click a catchment to see its flow path to the lake on the map.</p></details>`;
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
    renderScenario(); renderCapLayer(); renderLegend(); filterInView();
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
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Treated water. Populations are as stated in each system's report ("close to", "just over"); rated capacity is the wells' combined rated capacity. Sources: ${cal.map(s => refLink(s.ref, s.pages)).join('; ')}.</p></details>${(mp => !mp ? '' : `
      <h3 class="svc-sub">Water storage <span class="muted small">2020 Master Plan assessment, ML</span></h3>
      <table class="dt svc-table rep-table"><thead><tr><th>Facility</th>${mp.storageYears.map(y => `<th>${y}</th>`).join('')}</tr></thead>
        <tbody>${mp.storage.map(r => `<tr><td>${esc(r.facility)}</td>${r.required.map((v, i) => `<td class="${v > r.available[i] ? 'over' : ''}">${unit(fmtNum(v), 'ML')}<small>of ${fmtNum(r.available[i])} available</small></td>`).join('')}</tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Required storage = equalization + fire + emergency. ${esc(mp.storageCriteria)} Source: <a href="${esc(mp.vol3)}" target="_blank" rel="noopener">${esc(mp.title)}, Volume 3</a> — ${esc(mp.storageSource)}. Reported from the Region's assessment, not recomputed here.</p></details>`)(R.masterPlan)}`;
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
  const HZ_DEFAULT = { year0: 2025, aStart: 2026, aYears: 5, pStart: 2028, pYears: 10, extra: 0, divYear: 2028, end: 2051, exp: 1 };
  const hz = { ...HZ_DEFAULT, ...(store.get('horizon', {}) || {}) };
  function capHorizonHTML(plants, dv) {
    if (!plants.length) return '';
    const frac = (y, start, n) => Math.min(1, Math.max(0, (y - start + 1) / Math.max(1, n)));
    const popAll = plants.reduce((t, p) => t + p.popShare, 0) || 1;
    const years = []; for (let y = hz.year0; y <= hz.end; y++) years.push(y);
    const divOn = svcOpt.div === 'on';
    // Planned treatment expansions (2026 DC maps): rated capacity steps up from the given years.
    const PL = { booth: 'Lakeview', clarkson: 'Clarkson', inglewood: 'Inglewood' };
    const steps = k => (hz.exp && state.dcInfra && state.dcInfra.plantCapacity[PL[k]] || []).map((x, i) => ({ ...x, year: hz[`ex_${PL[k]}_${i}`] || x.year }));
    const ratedAt = (p, y) => steps(p.key).reduce((r, x) => y >= x.year ? Math.max(r, x.mld) : r, p.rated);
    const series = plants.map(p => ({ ...p, steps: steps(p.key), r: years.map(y => ratedAt(p, y)), v: years.map(y => {
      const extraPeople = hz.extra * Math.max(0, y - hz.year0) * p.popShare / popAll;
      const f = p.existing + p.A * frac(y, hz.aStart, hz.aYears) + p.P * frac(y, hz.pStart, hz.pYears) + (divOn && y >= hz.divYear ? p.div : 0) + extraPeople * p.perPerson / 1e6;
      return f / ratedAt(p, y) * 100;
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
      ${[80, 90, 100].map(t => `<g class="ref r${t}"><line x1="${L}" x2="${W - Rr}" y1="${Yp(t)}" y2="${Yp(t)}"/><text x="${W - Rr - 4}" y="${Yp(t) + (t === 100 ? -4 : 12)}" text-anchor="end">${t}%${t === 100 ? ' rated' : t === 90 ? ' expansion trigger' : ''}</text></g>`).join('')}
      ${series.flatMap(s => s.steps.filter(x => x.year >= hz.year0 && x.year <= hz.end).map(x => `<g class="hz-exp"><line x1="${X(x.year)}" x2="${X(x.year)}" y1="${T}" y2="${H - B}" class="s-${s.key}"/><text x="${X(x.year) + 3}" y="${T + 10}">${esc(s.name)} ${x.mld}</text></g>`)).join('')}
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
        ${state.dcInfra ? `<br><label class="chk"><input type="checkbox" data-hz="exp"${hz.exp ? ' checked' : ''}> Planned expansions (2026 DC draft):</label> ${Object.entries(state.dcInfra.plantCapacity).map(([pl, st]) => st.map((x, i) => `${esc(PLANT_SHORT[pl])} ${x.mld} ML/d from <input type="number" data-hz="ex_${pl}_${i}" value="${hz[`ex_${pl}_${i}`] || x.year}" min="2020" max="2060" step="1" title="${esc(x.note)}">`).join(', ')).join(' · ')}` : ''}
        <button type="button" class="btn small" data-hz-reset>Reset</button></div>
      <div class="hz-wrap">${svg}<div class="hz-tip" hidden></div></div>
      <ul class="grow-legend">${series.map(s => `<li><span class="hz-key f-${s.key}" style="background:var(--pl-${s.key})"></span>${esc(s.full)}</li>`).join('')}<li class="muted">dashed: 80% warning and 90% expansion trigger (2020 Master Plan); solid: rated capacity</li></ul>
      <table class="dt svc-table rep-table"><thead><tr><th>Plant</th>${pick.map(y => `<th>${y}</th>`).join('')}<th>Reaches 80%</th><th>Reaches 90%</th><th>Reaches 100%</th></tr></thead>
        <tbody>${series.map(s => `<tr><td>${esc(s.full)}<small>rated ${uML(s.rated)}${s.steps.length ? ` → ${s.steps.map(x => `${x.mld} (${x.year})`).join(' → ')}` : ''}</small></td>${pick.map(y => `<td>${Math.round(s.v[at(y)])}%<small>${uML(s.v[at(y)] * s.r[at(y)] / 100)}${s.r[at(y)] !== s.rated ? ` of ${fmtNum(s.r[at(y)])}` : ''}</small></td>`).join('')}<td>${c80[s.key]}</td><td>${c90[s.key]}</td><td class="bo">${c100[s.key]}</td></tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Starts from today (${hz.year0}: ${svcOpt.ww === 'calibrated' ? 'the 2025 reported flow' : 'census + built since at design rates'}, plus external inflows). Approved growth is added evenly over its years, then proposed growth over its years; further growth beyond today's applications (if set) is shared among the plants by today's population at each plant's flow per person. The diversion moves its flow from its start year. With planned expansions on, each % is of the rated capacity in that year: G.E. Booth +40 ML/d (council-approved February 2024, by 2028) and 518 to 600 ML/d after the 2036 construction, Clarkson 350 to 500 ML/d after the 2026–2028 construction (2026 DC capital map, draft; capacities from the 2020 DC Background Study); in service the year after construction, editable. 90% is the Region's own trigger: in the 2020 Master Plan an expansion is required when 90% of a plant's rated capacity is projected to be reached; 80% is shown as an earlier warning. Ontario's Procedure D-5-1 notes that plant expansions typically take at least 3 to 5 years to deliver. These are scenarios, not forecasts: actual timing depends on market absorption, servicing and approvals.</p></details>
    </section>`;
  }
  $('#plants-body').addEventListener('input', e => {
    const el = e.target.closest('[data-hz]'); if (!el) return;
    const v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Number(el.value); if (!isFinite(v)) return;
    hz[el.dataset.hz] = v; store.set('horizon', hz);
    clearTimeout(capHorizonHTML.t); capHorizonHTML.t = setTimeout(() => { const y = $('#plants-body').parentElement.scrollTop; renderSvcTab(); const f = $(`#plants-body [data-hz="${el.dataset.hz}"]`); if (f) { f.focus(); const n = f.value.length; try { f.setSelectionRange(n, n); } catch (er) { /* number inputs */ } } $('#plants-body').parentElement.scrollTop = y; }, 350);
  });
  $('#plants-body').addEventListener('click', e => {
    if (!e.target.closest('[data-hz-reset]')) return;
    for (const k of Object.keys(hz)) if (k.startsWith('ex_')) delete hz[k];
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
        <tr class="tot"><td>= Build-out</td><td>${uPop(r.pop)}${r.j > 0 ? ` <small>${unit(fmtNum(Math.round(r.j)), 'jobs')}</small>` : ''}</td><td>${uML(r.a)}</td><td>${uML(r.d)}<small class="tech">M ${r.pop > 0 ? D.residentialPeaking(r.pop, c.wastewater).toFixed(2) : '–'}</small></td><td>${uML(r.ii)}</td><td class="bo">${uML(r.w)}</td><td>${rated ? pct(r.a, rated) : ''}</td></tr>
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
    $('#plants-body').innerHTML = `${exportBar('plants')}${stampHTML('ww', Y)}<div class="svc-head">${svcLegend(Y).replace(' · click a row to zoom to it on the map', '')}<div class="svc-switches">${optSwitch('tech', 'Details', [['off', 'Simple'], ['on', 'Engineering']])}${scenarioChip()}</div></div>
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
    box.innerHTML = `<h3 class="svc-sub">References <span class="muted small">standards, guidelines and reports behind the criteria and comparisons</span></h3>
      ${R.standards ? `<h4 class="ref-h">Design criteria and guidelines</h4><ul class="ref-list">${R.standards.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="small muted">${esc(r.used)}</div></li>`).join('')}</ul>` : ''}
      <h4 class="ref-h">Region of Peel ${R.year} annual reports <span class="muted small">(Water, Wastewater and Plants comparisons)</span></h4>
      <ul class="ref-list">${Object.values(R.reports).map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></li>`).join('')}</ul>
      <p class="small muted">Index pages: <a href="${esc(R.indexPages.wastewater)}" target="_blank" rel="noopener">wastewater annual reports</a> · <a href="${esc(R.indexPages.water)}" target="_blank" rel="noopener">water quality reports</a>. ${esc(R.note)}</p>`;
  }
  // ---- Export: a printable report (save as PDF) and an Excel workbook of what is on screen ----
  // Scopes: water, plants, catchments, growth (bottom panel) and dev / selection (side panel).
  const exportBar = scope => `<div class="export-bar" role="group" aria-label="Export"><button type="button" class="btn small" data-export="pdf" data-scope="${scope}">PDF / print</button><button type="button" class="btn small" data-export="xlsx" data-scope="${scope}">Excel</button></div>`;
  const SCOPES = {
    water: { title: 'Water by pressure zone', els: () => [$('#water-body')] },
    plants: { title: 'Wastewater treatment plants and capacity', els: () => [$('#plants-body')] },
    catchments: { title: 'Wastewater by sanitary catchment', els: () => [$('#ww-body')] },
    growth: { title: 'Growth and demand', els: () => [$('#pane-demand'), $('#census')].filter(e => e && !e.hidden) },
    dev: { title: 'Development servicing summary', els: () => [$('#detail-body')] },
    loads: { title: 'What loads it', els: () => [$('#detail-body')] },
    whatif: { title: 'Test site servicing check', els: () => [$('#detail-body')] },
  };
  function cleanClone(el) {
    const c = el.cloneNode(true);
    c.querySelectorAll('.export-bar, .svc-switch, .svc-switches, button, .grow-tip, #aerial-check, .sel-actions, .d-sel').forEach(x => x.remove());
    c.querySelectorAll('details').forEach(d => d.setAttribute('open', ''));
    c.querySelectorAll('.dv-pane').forEach(x => { x.hidden = false; }); c.querySelectorAll('.dv-tabs').forEach(x => x.remove());   // every development tab in the export
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
    const title = scope === 'loads' ? ($('#detail-body h3') || {}).textContent || SCOPES.loads.title : scope === 'dev' && currentProject ? `${SCOPES.dev.title} – ${currentProject.title}` : scope === 'dev' && selection.size ? `Selection servicing summary – ${fmtNum(selection.size)} developments` : SCOPES[scope].title;
    return { title, lines: [
      `Prepared ${new Date().toLocaleString('en-CA', { dateStyle: 'medium', timeStyle: 'short' })} with the Peel Development Tracker`,
      `Data: ${state.snapshot ? `applications and permits ${state.snapshot.generatedAt.slice(0, 10)}` : 'live applications'} · ${bc ? `${bc.year} Census` : ''}${R ? ` · Region of Peel ${R.year} annual reports` : ''}`,
      `Wastewater mode: ${svcOpt.ww === 'calibrated' ? 'Capacity check (calibrated to 2025 reported flows)' : 'Design flows (Peel criteria)'} · water max day factor: ${svcOpt.md === 'observed' ? 'observed 2025' : 'design'} · 70 ML/d G.E. Booth → Clarkson diversion: ${svcOpt.div === 'on' ? 'on' : 'off'} · developments outside mapped areas: ${svcOpt.nr === 'on' ? `assigned to the nearest within ${kmText(NEAR_M)}` : 'left out'}`,
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
  for (const id of ['#water-body', '#ww-body', '#plants-body', '#scen-bar']) $(id).addEventListener('click', e => {
    if (e.target.closest('[data-open-scen]')) { const d = $('#scen-bar details'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); } return; }
    if (e.target.closest('[data-goto-tab]')) return showFootTab(e.target.closest('[data-goto-tab]').dataset.gotoTab);
    if (e.target.closest('[data-scen-pin]')) { store.set('scenA', scenarioMetrics()); return renderScenario(); }
    if (e.target.closest('[data-scen-clear]')) { store.set('scenA', null); return renderScenario(); }
    if (e.target.closest('[data-inview]')) { store.set('svcInView', e.target.closest('[data-inview]').checked); document.querySelectorAll('[data-inview]').forEach(c => { c.checked = store.get('svcInView', false); }); return filterInView(); }
    const b = e.target.closest('[data-svcopt]'); if (!b) return;
    svcOpt[b.dataset.svcopt] = b.dataset.v;
    store.set({ ww: 'svcWwMode', md: 'svcMdMode', div: 'svcDivert', tech: 'svcTech', nr: 'svcNear' }[b.dataset.svcopt], b.dataset.v);
    if (b.dataset.svcopt === 'nr') { applyFilters(); if (currentProject && !$('#detail').hidden && $('#detail').dataset.view === 'dev') showDetail(currentProject); }
    renderSvcTab(); viewLink.write();
    if (b.dataset.svcopt === 'nr') renderMarkers();
  });
  // Click a zone / catchment row: outline it on the map and zoom to it (a catchment also shades
  // everything upstream that drains through it). Click it again to clear.
  const svcFocus = { id: null, layer: L.layerGroup().addTo(map) };
  function focusSvc(id, opt = {}) {
    const { zoom = true, loads = true } = opt;
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
    if (zoom) map.fitBounds(b, { padding: [30, 30] });
    if (loads) showLoads(a.id);
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

  // ---- Map analysis: style, Planning / Servicing views, capacity layer, "What loads this?" ----
  function setMapStyle(ch) {
    Object.assign(mstyle, ch); store.set('mapStyle', mstyle);
    syncMapOpts();
    if ('color' in ch || 'size' in ch) renderMarkers();
    if ('cap' in ch) renderCapLayer();
    renderLegend(); viewLink.write();
  }
  function setDcOn(d) {
    dcOn = { ...dcOn, ...d }; store.set('dcOn', dcOn.on); store.set('dcSys', dcOn.sys);
    renderDcLayer(); renderLegend(); syncMapOpts(); viewLink.write();
  }
  function setExistOn(e) { existOn = { ...existOn, ...e }; store.set('existOn', existOn); renderExisting(); renderLegend(); syncMapOpts(); }
  const currentView = () => { const v = store.get('mapView', 'planning'); return v === 'servicing' ? 'water' : MAP_VIEWS.some(([k]) => k === v) ? v : 'planning'; };
  function syncMapOpts() {
    const set = (id, v) => { const e = $(id); if (e) { if (e.type === 'checkbox') e.checked = v; else e.value = v; } };
    set('#opt-mcolor', mstyle.color); set('#opt-msize', mstyle.size); set('#opt-mcap', mstyle.cap);
    set('#opt-basemap', basemap); set('#opt-labels', labelMode); set('#opt-pz', svcOn.pz); set('#opt-dr', svcOn.dr); set('#opt-da', daOn);
    for (const k of ['water', 'sanitary', 'storm']) set(`[data-exist="${k}"]`, !!existOn[k]);
    for (const k of ['water', 'wastewater']) set(`[data-dcsys="${k}"]`, dcOn.on && (dcOn.sys === 'both' || dcOn.sys === k));
    const v = currentView();
    document.querySelectorAll('[data-mview]').forEach(b => b.classList.toggle('on', b.dataset.mview === v));
  }
  // Map views: Planning (how it was), Water and Wastewater (servicing review, one system each) and
  // DC (servicing timing against the 2026 DC program). Switching saves the current settings under the
  // view being left and restores the other view's last settings (its preset the first time).
  const VIEW_PRESETS = {
    planning: { basemap: 'aerial-labels', labelMode: 'address-phase', da: false, pz: false, dr: false, mstyle: { color: 'phase', size: 'fixed', cap: 'off' }, focus: null, exist: { water: false, sanitary: false, storm: false }, dc: { on: false, sys: 'both' } },
    water: { basemap: 'streets', labelMode: 'off', da: false, pz: true, dr: false, mstyle: { color: 'layer', size: 'pop', cap: 'zone' }, focus: 'growth', exist: { water: true, sanitary: false, storm: false }, dc: { on: true, sys: 'water' } },
    wastewater: { basemap: 'streets', labelMode: 'off', da: false, pz: false, dr: true, mstyle: { color: 'layer', size: 'pop', cap: 'pipes' }, focus: 'growth', exist: { water: false, sanitary: true, storm: false }, dc: { on: true, sys: 'wastewater' } },
    dc: { basemap: 'streets', labelMode: 'off', da: false, pz: false, dr: false, mstyle: { color: 'timing', size: 'pop', cap: 'off' }, focus: 'growth', exist: { water: false, sanitary: false, storm: false }, dc: { on: true, sys: 'both' } },
  };
  function currentMapSettings() { return { basemap, labelMode, da: daOn, pz: svcOn.pz, dr: svcOn.dr, mstyle: { ...mstyle }, focus: state.focus, exist: { ...existOn }, dc: { ...dcOn } }; }
  function setMapView(v) {
    const cur = currentView();
    if (cur === v) return;
    store.set(`mapView-${cur}`, currentMapSettings());
    const p = VIEW_PRESETS[v] || VIEW_PRESETS.planning;
    const s = { ...p, ...(store.get(`mapView-${v}`, null) || {}) };
    store.set('mapView', v);
    if (BASEMAPS[s.basemap]) { basemap = s.basemap; store.set('basemap', basemap); setTiles(); restyleDa(); }
    if (LABEL_MODES[s.labelMode]) { labelMode = s.labelMode; store.set('labelMode', labelMode); }
    setDaLayer(!!s.da); setSvcLayer('pz', !!s.pz); setSvcLayer('dr', !!s.dr);
    Object.assign(mstyle, s.mstyle); store.set('mapStyle', mstyle);
    state.focus = s.focus == null ? DEFAULT_FOCUS : s.focus || '';
    existOn = { ...p.exist, ...(s.exist || {}) }; store.set('existOn', existOn); renderExisting();
    dcOn = { ...p.dc, ...(s.dc || {}) }; store.set('dcOn', dcOn.on); store.set('dcSys', dcOn.sys); renderDcLayer();
    applyFilters();
    renderCapLayer(); renderLegend(); syncMapOpts(); updateLabels(); viewLink.write();
  }

  // Capacity layer: catchments coloured by their local flow growth over the census, pumping
  // station catchments by build-out peak wet weather flow as % of firm capacity, or pressure zones
  // by maximum day growth; with the sewer network drawn outlet to outlet.
  const CAP_GROWTH = [[10, '#fdf0d5'], [25, '#fbd08a'], [50, '#f6a04d'], [100, '#e3672a'], [Infinity, '#a83a12']];
  const CAP_PS = [[80, '#2f9e44'], [100, '#f08c00'], [Infinity, '#e03131']];
  // Colour for a value: the first class it falls under; Infinity (new, no census flow) takes the last.
  const bucket = (v, scale) => isNaN(v) ? '#9aa0a6' : (scale.find(([t]) => v < t) || scale[scale.length - 1])[1];
  const fmtPct = v => !isFinite(v) ? 'new (no census flow)' : `${v >= 0 ? '+' : ''}${Math.round(v)}%`;
  const capLayer = L.layerGroup().addTo(map);
  // Capacity by year: built since the census in full, approved and proposed growth phased in as in
  // Horizon years (approved over aYears from aStart, proposed over pYears from pStart).
  let capYear = null;
  const hzFrac = y => { const f = (start, n) => Math.min(1, Math.max(0, (y - start + 1) / Math.max(1, n))); return { fa: f(hz.aStart, hz.aYears), fp: f(hz.pStart, hz.pYears) }; };
  const atYear = (l, y) => { if (y == null || !l) return l; const { fa, fp } = hzFrac(y); return { ...l, approved: l.approved * fa, proposed: l.proposed * fp, japproved: (l.japproved || 0) * fa, jproposed: (l.jproposed || 0) * fp }; };
  const censusOnly = l => ({ census: l.census, built: 0, approved: 0, proposed: 0, jbuilt: 0, japproved: 0, jproposed: 0, ha: l.ha });
  // Build-out flows of a drainage area (design flows, as for pumping station firm capacity).
  function psLoad(a, y = null) {
    const M = state.svcModel, sp = spsOf(a), l = M && atYear(M.cum.get(a.id), y);
    if (!sp || !l) return null;
    const dry = M.pdwf(l, 1) * 1e6 / 86400, wet = (M.pdwf(l, 1) + M.ii(l)) * 1e6 / 86400;
    return { firm: sp.firmLs, dry, wet, pct: wet / sp.firmLs * 100 };
  }
  function capValue(a) {
    const M = state.svcModel;
    if (mstyle.cap === 'zone') {
      const l = atYear(M.zones.get(a.id), capYear); if (!l) return null;
      const now = M.wMax(l.census, 0), bo = M.wMax(M.total(l), M.jobs(l));
      return { v: now > 0 ? (bo - now) / now * 100 : bo > 0 ? Infinity : 0, now, bo };
    }
    const l = atYear(M.local.get(a.id), capYear); if (!l) return null;
    const now = M.adwf(censusOnly(l)), bo = M.adwf(l);
    return { v: now > 0 ? (bo - now) / now * 100 : bo > 0 ? Infinity : 0, now, bo, l };
  }
  function renderCapLayer() {
    capLayer.clearLayers();
    if (dcOn.on) renderDcLayer();
    if (mstyle.cap === 'off' || !state.servicing || !state.svcModel) return;
    if (mstyle.cap === 'pipes') { renderPipes(capLayer); return; }
    const ll = rings => rings.map(r => r.map(([x, y]) => [y, x]));
    const list = mstyle.cap === 'zone' ? state.servicing.zones : state.servicing.drainage;
    for (const a of list) {
      let fill = null, tip = `<strong>${esc(a.zone ? a.name : drName(a))}</strong>`;
      if (mstyle.cap === 'ps') {
        const pl = psLoad(a, capYear);
        if (pl) { fill = bucket(pl.pct, CAP_PS); tip += `<br>Pumping station firm ${fmtNum(pl.firm)} L/s · ${capYear == null ? 'build-out' : capYear} peak dry ${fmtNum(Math.round(pl.dry))} L/s, peak wet ≈${fmtNum(Math.round(pl.wet))} L/s (<strong>${Math.round(pl.pct)}%</strong> of firm)`; }
        else tip += `<br><span class="muted">${a.kind === 'ps' ? 'Pumping station not in the master plan table' : 'Gravity catchment (no pumping station)'}</span>`;
      } else {
        const c = capValue(a);
        if (c) { fill = bucket(c.v, CAP_GROWTH); tip += `<br>${mstyle.cap === 'zone' ? 'Max day' : 'Local average dry weather'} ${uML(c.now)} today → ${uML(c.bo)} ${capYear == null ? 'at build-out' : `by ${capYear}`} (<strong>${fmtPct(c.v)}</strong>)`; }
      }
      tip += '<br><span class="muted">Tap: what loads it</span>';
      L.polygon(ll(a.rings), { renderer: svcRenderer, pane: 'svcPane', svcId: a.id, color: fill || '#9aa0a6', weight: 1, opacity: 0.9, fill: true, fillColor: fill || '#9aa0a6', fillOpacity: fill ? 0.5 : 0.05 })
        .bindTooltip(tip, { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); showLoads(a.id); }).addTo(capLayer);
    }
    if (mstyle.cap !== 'zone') drawNetwork(capLayer);
  }
  // The traced sewer network, schematic: each catchment outlet to the next one down, to the plant;
  // pumping stations as dots in their load colour, plants as squares.
  function drawNetwork(layer) {
    const ll = p => [p[1], p[0]], plants = state.servicing.meta.plants || [];
    for (const d of state.servicing.drainage) {
      const nx = d.downstream && svcById.get(d.downstream), pl = plants.find(p => p.name === d.plant);
      const to = nx ? nx.outletAt || (pl && pl.lnglat) : pl && pl.lnglat;
      if (d.outletAt && to && (d.outletAt[0] !== to[0] || d.outletAt[1] !== to[1])) L.polyline([ll(d.outletAt), ll(to)], { className: 'svc-flow-net', interactive: false }).addTo(layer);
      const ps = d.kind === 'ps' && d.outletAt && psLoad(d, capYear);
      if (ps) L.circleMarker(ll(d.outletAt), { radius: 6, weight: 2, color: '#fff', fillColor: bucket(ps.pct, CAP_PS), fillOpacity: 1 })
        .bindTooltip(`<strong>${esc(drName(d).replace(/^[^·]+· /, ''))}</strong><br>${Math.round(ps.pct)}% of firm at build-out (peak wet)`, { className: 'pt' })
        .on('click', ev => { L.DomEvent.stop(ev); showLoads(d.id); }).addTo(layer);
    }
    for (const p of plants) L.marker(ll(p.lnglat), { icon: L.divIcon({ className: 'plant-mk', html: `<span style="background:${PLANT_COLOR[p.name] || '#555'}"></span>`, iconSize: [16, 16] }) })
      .bindTooltip(`<strong>${esc(plantLabel(p.name))}</strong><br><span class="muted">Tap: everything it treats</span>`, { className: 'pt' })
      .on('click', () => showLoads(null, p.name)).addTo(layer);
    addFlowMarker();
  }

  // Legend (bottom left): marker colours and sizes, and the capacity layer's classes.
  // Bottom right on wide screens (the timeline sits bottom left), bottom left on phones; collapsed on
  // phones until opened (remembered).
  const phoneMap = matchMedia('(max-width: 700px)').matches;
  const Legend = L.Control.extend({ options: { position: 'bottomright' }, onAdd() {
    const el = L.DomUtil.create('div', 'map-legend'); L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
    el.addEventListener('toggle', e => store.set('legendOpen', e.target.open), true);
    el.addEventListener('input', e => {
      if (!e.target.dataset.capyear) return;
      const v = +e.target.value; capYear = v > hz.end ? null : v;
      e.target.previousElementSibling.textContent = capYear == null ? 'Build-out' : `Year ${capYear}`;
      clearTimeout(el._t); el._t = setTimeout(renderCapLayer, 120);
    });
    return el;
  } });
  const legend = new Legend().addTo(map);
  function renderLegend() {
    const el = legend.getContainer(), parts = [];
    const sw = (c, t, cls = '') => `<li><span class="lg-sw${cls}" style="--mk:${c}"></span>${esc(t)}</li>`;
    if (mstyle.color === 'phase') parts.push(`<div class="lg-t">Phase</div><ul>${P.ALL_PHASES.filter(p => state.phases.has(p.key)).map(p => `<li data-info="phase-${p.key}">${dot(p.key)}${esc(p.label)}</li>`).join('')}</ul>`);
    if (mstyle.color === 'layer') parts.push(`<div class="lg-t">Developments</div><ul>${Object.entries(LAYER_NAME).filter(([k]) => k !== 'out').map(([k, t]) => sw(layerColors()[k], t)).join('')}</ul>`);
    if (mstyle.color === 'timing') parts.push(`<div class="lg-t">Servicing timing (2026 DC draft)</div><ul>${Object.values(TIMING).map(([c, t]) => sw(c, t)).join('')}</ul>`);
    if (mstyle.color === 'quality') parts.push(`<div class="lg-t">Data quality</div><ul>${Object.values(QUALITY).map(([c, t]) => sw(c, t)).join('')}</ul>`);
    if (mstyle.color === 'plant') parts.push(`<div class="lg-t">Receiving plant</div><ul>${['Lakeview', 'Clarkson', 'Inglewood', 'Toronto'].map(k => sw(PLANT_COLOR[k], PLANT_SHORT[k])).join('')}${sw('#b8b8b8', 'No traced catchment')}</ul>`);
    if (mstyle.size === 'pop') parts.push(`<div class="lg-t">Size: people + jobs at build-out</div><div class="lg-size">${[100, 1000, 10000].map(n => `<span><i style="width:${markerPx(n)}px;height:${markerPx(n)}px"></i>${shortNum(n)}</span>`).join('')}</div>`);
    if (state.servicing && mstyle.color !== 'quality' && mstyle.color !== 'timing' && (mstyle.color !== 'phase' || mstyle.size !== 'fixed') && svcOpt.nr === 'on') parts.push(`<ul>${sw('#777', 'Outside mapped areas (nearest assigned)', ' near')}</ul>`);
    if (mstyle.cap === 'ps') parts.push(`<div class="lg-t">Pumping station, build-out peak wet</div><ul>${sw(CAP_PS[0][1], '< 80% of firm')}${sw(CAP_PS[1][1], '80–100%')}${sw(CAP_PS[2][1], '> 100%')}${sw('#9aa0a6', 'Gravity / not tabled')}</ul>`);
    if (mstyle.cap === 'pipes') parts.push(`<div class="lg-t">Sewer load / full capacity${capYear == null ? ', build-out' : `, ${capYear}`}</div><ul>${PIPE_CLS.map(([, c, t]) => `<li><span class="lg-line" style="background:${c}"></span>${esc(t)}</li>`).join('')}<li><span class="lg-line" style="background:#adb5bd"></span>no slope published</li></ul>${(sm => sm ? `<p class="lg-s">${sm.n.map((k, i) => `${fmtNum(k)} ${['under 50%', '50–80%', '80–100%', 'over 100%'][i]}`).join(' · ')} of ${fmtNum(sm.total)} pipes</p>` : '')(pipeSummary())}<p class="lg-s">Pipes of 300 mm+ (larger ones first when zoomed out). Existing peak dry (measured rate) + growth peak wet (design); screening only.</p>`);
    if (mstyle.cap === 'growth' || mstyle.cap === 'zone') parts.push(`<div class="lg-t">${mstyle.cap === 'zone' ? 'Max day growth over the census' : 'Local flow growth over the census'}</div><ul>${CAP_GROWTH.map(([t, c], i) => sw(c, i === 0 ? '< 10%' : t === Infinity ? `> ${CAP_GROWTH[i - 1][0]}% or new` : `${CAP_GROWTH[i - 1][0]}–${t}%`)).join('')}</ul>`);
    if (Object.values(existOn).some(Boolean)) parts.push(`<div class="lg-t">Existing pipes (live, from zoom ${EXIST_ZOOM})</div><ul>${Object.keys(existOn).filter(k => existOn[k]).map(k => `<li><span class="lg-line" style="background:${EXIST_STYLE[k].color}"></span>${esc(EXIST_STYLE[k].label)}${k === 'storm' ? ' (Mississauga, Brampton, Region)' : ''}</li>`).join('')}<li class="muted">thicker = larger diameter; dashed = force main</li></ul>`);
    if (dcOn.on && state.dcInfra) parts.push(`<div class="lg-t">Planned works (2026 DC, draft)</div><ul>${Object.entries(DC_KIND).filter(([k]) => dcOn.sys === 'both' || (dcOn.sys === 'water') === (k === 'transmission' || k === 'feeder')).map(([, [t, c]]) => `<li><span class="lg-line" style="background:${c}"></span>${esc(t)}</li>`).join('')}<li><span class="lg-line dash"></span>dashed: approved 2026${capYear != null ? ' or after the year' : ''}</li><li><span class="dc-fac lg"><span>S</span></span>facility (tap for schedule)</li></ul>`);
    if (mstyle.cap !== 'off') parts.push(`<label class="lg-year"><span>${capYear == null ? 'Build-out' : `Year ${capYear}`}</span><input type="range" min="${hz.year0}" max="${hz.end + 1}" step="1" value="${capYear == null ? hz.end + 1 : capYear}" data-capyear="1" aria-label="Capacity year"></label>
      <p class="lg-s">Approved growth over ${hz.aYears} years from ${hz.aStart}, proposed over ${hz.pYears} from ${hz.pStart} (Horizon years). ${esc(scenarioText())}</p>`);
    el.innerHTML = parts.length ? `<details${store.get('legendOpen', !phoneMap) ? ' open' : ''}><summary>Legend</summary>${parts.join('')}</details>` : '';
    el.hidden = !parts.length;
  }

  // "What loads this?": a catchment (with everything upstream), a pressure zone or a plant —
  // the developments adding flow since the census, ranked by their peak flow.
  let loadsOf = null;
  function showLoads(id, plantName) {
    if (!state.servicing || !state.svcModel) return;
    const M = state.svcModel, a = id && svcById.get(id), c = state.criteria;
    loadsOf = { id, plantName };
    let ids, title, sub = '', key = 'dr';
    if (plantName) {
      ids = new Set(state.servicing.drainage.filter(d => d.plant === plantName).map(d => d.id));
      title = plantLabel(plantName); sub = `${fmtNum(ids.size)} catchments`;
      const cap = M.plantCap(plantName);
      if (cap) sub += ` · rated ${fmt1(cap.rated)} ML/d · existing + approved ${Math.round(cap.committed / cap.rated * 100)}% · uncommitted reserve ${fmt1(cap.rated - cap.committed)} ML/d`;
    } else if (a && a.zone) {
      key = 'pz'; ids = new Set([a.id]); title = a.name;
      const l = M.zones.get(a.id); if (l) sub = `max day ${fmt1(M.wMax(l.census, 0))} ML/d at the census → ${fmt1(M.wMax(M.total(l), M.jobs(l)))} ML/d at build-out`;
    } else if (a) {
      const up = upstreamOf(a.id, svcFlowTree());
      ids = new Set([a.id, ...up.map(u => u.id)]); title = drName(a);
      const l = M.cum.get(a.id), ps = psLoad(a);
      sub = `${up.length ? `with ${fmtNum(up.length)} upstream catchment${up.length === 1 ? '' : 's'} · ` : ''}${l ? `${fmt1(M.adwf(censusOnly(l)))} ML/d at the census → ${fmt1(M.adwf(l))} ML/d at build-out (average dry, design)` : ''}${ps ? ` · pumping station ${Math.round(ps.pct)}% of firm ${fmtNum(ps.firm)} L/s at build-out peak wet` : ''}`;
    } else return;
    const rows = [];
    for (const p of state.projects) {
      const lay = svcLayerOf(p);
      if (lay === 'out' || lay === 'existing') continue;
      const inIds = svcIds(p, key).filter(x => ids.has(x));
      if (!inIds.length) continue;
      const e = D.estimate([p], c, 'all', jobsOf);
      if (!(e.totalUnits > 0 || e.employment.jobs > 0)) continue;
      const cb = e.combined;
      rows.push({ p, lay, e, avg: key === 'pz' ? cb.water.avg : cb.wastewater.avg, peak: key === 'pz' ? cb.water.maxDay : cb.wastewater.wetPeak, via: svcById.get(inIds[0]), near: !!nearOf(p, key) });
    }
    rows.sort((x, y) => y.peak - x.peak);
    const totAvg = rows.reduce((t, r) => t + r.avg, 0);
    const byLayer = ['built', 'approved', 'proposed'].map(k => [k, rows.filter(r => r.lay === k).reduce((t, r) => t + r.avg, 0)]);
    const LIMIT = 60;
    const what = key === 'pz' ? ['Average day', 'Max day'] : ['Average dry', 'Peak wet'];
    $('#detail-body').innerHTML = `
      <div class="head"><h3>What loads ${esc(title)}</h3><div class="m">${key === 'pz' ? 'Water pressure zone' : plantName ? 'Wastewater treatment plant' : 'Sanitary catchment and everything upstream'}</div></div>
      <p class="small">${esc(sub)}</p>
      <div class="chips">${byLayer.map(([k, v]) => `<span class="chip"><span class="lg-sw" style="--mk:${layerColors()[k]}"></span>${esc(LAYER_NAME[k])} ${uLs(v)}</span>`).join('')}<span class="chip">Growth total ${uLs(totAvg)} · ${uML(D.toMLd(totAvg))}</span></div>
      ${exportBar('loads')}
      <table class="dt loads-table"><caption>${fmtNum(rows.length)} developments adding flow since the census, largest ${key === 'pz' ? 'max day' : 'peak wet weather'} first · Peel design criteria, each development alone</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>${what[0]}</th><th>${what[1]}</th><th class="ld-share">Share</th></tr></thead>
        <tbody>${rows.slice(0, LIMIT).map(r => `<tr class="ld-row" data-dev="${esc(r.p.key)}" tabindex="0"><td>${dot(r.p.phase)} ${esc(r.p.title)}<small><span class="lg-sw" style="--mk:${layerColors()[r.lay]}"></span>${esc(LAYER_NAME[r.lay])} · ${esc(r.p.municipality)}${r.via && !a?.zone && r.via.id !== id ? ` · via ${esc(drName(r.via).replace(/^[^·]+· /, ''))}` : ''}${r.near ? ' · nearest assigned' : ''}</small></td>
          <td>${fmtNum(Math.round(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.avg)}</td><td>${uLs(r.peak)}</td><td class="ld-share">${totAvg > 0 ? `${Math.round(r.avg / totAvg * 100)}%` : '–'}</td></tr>`).join('')}</tbody></table>
      ${rows.length > LIMIT ? `<p class="small muted">+ ${fmtNum(rows.length - LIMIT)} smaller developments (Excel export has the top ${LIMIT}).</p>` : ''}
      ${dcAreaWorksHTML(ids, key, plantName)}
      <p class="small muted">Developments built since the census, approved and proposed (existing development is in the census flow). Flows are each development's own at Peel design criteria; peaks are not additive. ${esc(scenarioText())}.</p>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'loads'; $('#detail').scrollTop = 0;
    viewLink.write();
    if (id && svcFocus.id !== id) focusSvc(id, { zoom: false, loads: false });
  }
  $('#detail-body').addEventListener('click', e => {
    const r = e.target.closest('.ld-row'); if (!r) return;
    const p = state.projects.find(x => x.key === r.dataset.dev); if (!p) return;
    backToLoads = { ...loadsOf }; showDetail(p);
    if (p.lat != null) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15));
  });
  $('#detail-body').addEventListener('keydown', e => { const r = e.target.closest('.ld-row'); if (r && e.key === 'Enter') r.click(); });
  renderLegend(); syncMapOpts();

  // Linked map and tables: hovering a zone / catchment row outlines it on the map; hovering an
  // area on the map highlights its row. "Only areas in map view" limits the rows to the view.
  const hoverLayer = L.layerGroup().addTo(map);
  function hoverArea(id) {
    hoverLayer.clearLayers();
    const a = id && svcById.get(id); if (!a) return;
    L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), { className: 'svc-hover', interactive: false }).addTo(hoverLayer);
  }
  const hoverRow = (id, on) => document.querySelectorAll(`.svc-row[data-svc="${CSS.escape(id)}"]`).forEach(r => r.classList.toggle('hl', on));
  for (const id of ['#water-body', '#ww-body']) {
    $(id).addEventListener('mouseover', e => { const r = e.target.closest('.svc-row'); if (r) hoverArea(r.dataset.svc); });
    $(id).addEventListener('mouseleave', () => hoverArea(null));
  }
  // Polygons on the map (overlays and capacity layer) report hover through their layer's id.
  map.on('layeradd', e => {
    const l = e.layer; if (!(l instanceof L.Polygon) || l._svcHover) return;
    const a = l.options.svcId && svcById.get(l.options.svcId); if (!a) return;
    l._svcHover = true;
    l.on('mouseover', () => hoverRow(a.id, true)).on('mouseout', () => hoverRow(a.id, false));
  });
  const inViewBox = () => `<label class="chk small inview" title="Show only the zones / catchments in the current map view"><input type="checkbox" data-inview="1"${store.get('svcInView', false) ? ' checked' : ''}> Only areas in map view</label>`;
  function filterInView() {
    const on = store.get('svcInView', false), b = map.getBounds();
    document.querySelectorAll('#water-body .svc-row, #ww-body .svc-row').forEach(r => {
      const a = svcById.get(r.dataset.svc);
      r.hidden = !!(on && a && a.bbox && !b.intersects([[a.bbox[1], a.bbox[0]], [a.bbox[3], a.bbox[2]]]));
    });
  }
  map.on('moveend', () => { if (store.get('svcInView', false)) filterInView(); });

  // Map print: the map full page (landscape) with a title block, the scenario, legend, north
  // arrow and scale; the rest of the page is hidden while printing.
  function printMap() {
    const head = document.createElement('div');
    head.className = 'print-head';
    const filt = activeFilters().map(f => f.label).join(', ');
    head.innerHTML = `<strong>Peel Development Tracker — ${esc(({ water: 'water servicing map', wastewater: 'wastewater servicing map', dc: 'development charges map' })[currentView()] || 'development map')}</strong>
      <span>${fmtNum(state.filtered.length)} developments${filt ? ` · ${esc(filt)}` : ''}</span>
      ${state.svcModel ? `<span>Scenario: ${esc(scenarioText())}</span>` : ''}
      <span>Map style: ${esc(MSTYLE.color[mstyle.color])} colour · ${esc(MSTYLE.size[mstyle.size])}${mstyle.cap !== 'off' ? ` · ${esc(MSTYLE.cap[mstyle.cap])}` : ''} · prepared ${new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' })}</span>`;
    $('.map-wrap').appendChild(head);
    const lg = legend.getContainer().querySelector('details'); const lgOpen = lg && lg.open; if (lg) lg.open = true;
    document.body.classList.add('print-map');
    map.invalidateSize();
    const done = () => { document.body.classList.remove('print-map'); head.remove(); if (lg) lg.open = lgOpen; map.invalidateSize(); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 1200);
  }
  $('#btn-print-map').onclick = printMap;

  // ---- Measure, buffer select and test-site tools -------------------------------------------
  // Measure: tap points on the map for the distance along them; Buffer: select the shown
  // developments within a radius of the last point (adds to the selection, like the lasso).
  const toolLayer = L.layerGroup().addTo(map);
  const tool = { mode: null, pts: [] };
  const toolPanel = L.DomUtil.create('div', 'tool-panel', map.getContainer());
  L.DomEvent.disableClickPropagation(toolPanel); L.DomEvent.disableScrollPropagation(toolPanel);
  toolPanel.hidden = true;
  const metres = (a, b) => map.distance(a, b);
  const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  function setTool(mode) {
    tool.mode = tool.mode === mode ? null : mode;
    tool.pts = []; toolLayer.clearLayers();
    syncToolsBtn();
    map.getContainer().classList.toggle('tool-on', !!tool.mode);
    if (tool.mode && lassoOn) setLasso(false);
    if (tool.mode && innerWidth <= 760) closeDetail();
    renderToolPanel();
  }
  function renderToolPanel() {
    toolPanel.hidden = !tool.mode;
    if (tool.mode === 'measure') {
      const d = tool.pts.reduce((t, p, i) => i ? t + metres(tool.pts[i - 1], p) : 0, 0);
      toolPanel.innerHTML = `<strong>Measure</strong> ${tool.pts.length < 2 ? '<span class="muted">tap points on the map</span>' : `<span>${fmtDist(d)}</span>`}
        ${tool.pts.length ? `<span class="tp-row">Select within <span class="seg">${[250, 500, 1000, 2000].map(r => `<button type="button" class="btn small" data-buffer="${r}">${fmtDist(r)}</button>`).join('')}</span> of the last point</span>` : ''}
        <span class="tp-row"><button type="button" class="btn small link" data-tool-clear="1">Clear</button> <button type="button" class="btn small link" data-tool-done="1">Done</button></span>`;
    } else if (tool.mode === 'whatif') {
      toolPanel.innerHTML = `<strong>Test a site</strong> <span class="muted">tap the map where the site is</span> <button type="button" class="btn small link" data-tool-done="1">Cancel</button>`;
    }
  }
  toolPanel.addEventListener('click', e => {
    if (e.target.closest('[data-tool-done]')) return setTool(null);
    if (e.target.closest('[data-tool-clear]')) { tool.pts = []; toolLayer.clearLayers(); return renderToolPanel(); }
    const b = e.target.closest('[data-buffer]'); if (!b || !tool.pts.length) return;
    const c = tool.pts[tool.pts.length - 1], r = +b.dataset.buffer;
    let added = 0;
    for (const p of state.filtered) if (p.lat != null && !selection.has(p.key) && metres(c, [p.lat, p.lng]) <= r) { selection.set(p.key, p); added++; }
    // The circle as a ring, so it draws and exports like a lasso area.
    const ring = []; for (let i = 0; i <= 48; i++) { const t = i / 48 * 2 * Math.PI, dy = r * Math.cos(t) / 111320, dx = r * Math.sin(t) / (111320 * Math.cos(c.lat * Math.PI / 180)); ring.push([c.lng + dx, c.lat + dy]); }
    selAreas.push(ring); drawSelection(); showSelection(added);
  });
  map.on('click', e => {
    if (tool.mode === 'measure') {
      tool.pts.push(e.latlng);
      toolLayer.clearLayers();
      if (tool.pts.length > 1) L.polyline(tool.pts, { className: 'measure-line', interactive: false }).addTo(toolLayer);
      tool.pts.forEach((p, i) => L.circleMarker(p, { radius: 4, className: 'measure-pt', interactive: false }).bindTooltip(i ? fmtDist(tool.pts.slice(0, i + 1).reduce((t, q, j) => j ? t + metres(tool.pts[j - 1], q) : 0, 0)) : 'start', { permanent: i === tool.pts.length - 1 && i > 0, className: 'pt', direction: 'right' }).addTo(toolLayer));
      renderToolPanel();
    } else if (tool.mode === 'whatif') {
      setTool(null);
      showWhatIf(e.latlng);
    }
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && tool.mode) setTool(null); });

  // Test a site: a proposed development placed on the map, with its servicing check — pressure
  // zone, sewer path, pumping station and plant reserve — before an application exists. It can be
  // counted in the Water / Wastewater totals as a proposed development (kept in this browser).
  state.whatifs = [];
  const whatIfLayer = L.layerGroup().addTo(map);
  function whatIfProject(w) {
    const units = w.single + w.town + w.apartment;
    const p = {
      key: `whatif:${w.id}`, whatif: true, title: w.name || 'Test site', municipality: w.municipality || '', lat: w.lat, lng: w.lng,
      phase: w.phase, rank: P.PHASE_BY_KEY[w.phase].rank, units, unitMix: { single: w.single, semi: 0, town: w.town, apartment: w.apartment },
      types: [], description: '', records: [], kinds: ['application'], milestones: {}, timeline: [], sp: [], mtsa: [], siteAreaHa: w.ha > 0 ? w.ha : null,
      buildout: units ? { planned: units, permitted: 0, completed: 0, remaining: units, unbuilt: units, permits: 0 } : null,
      _emp: w.jobs > 0 ? { jobs: w.jobs, uses: [], totalM2: 0 } : null,
    };
    if (state.servicing) {
      p.pz = PeelAreas.locate(state.servicing.zones, p.lng, p.lat); p.dr = PeelAreas.locate(state.servicing.drainage, p.lng, p.lat);
      p.pzNear = p.pz.length ? null : dcVia(p, 'pz') || PeelAreas.nearest(state.servicing.zones, p.lng, p.lat, NEAR_M);
      p.drNear = p.dr.length ? null : dcVia(p, 'dr') || PeelAreas.nearest(state.servicing.drainage, p.lng, p.lat, NEAR_M);
    }
    return p;
  }
  let whatIfs = (store.get('whatifs', []) || []).filter(w => w && w.lat != null);
  function syncWhatIfs() {
    store.set('whatifs', whatIfs);
    state.whatifs = whatIfs.filter(w => w.include).map(whatIfProject);
    whatIfLayer.clearLayers();
    for (const w of whatIfs) {
      L.marker([w.lat, w.lng], { draggable: true, icon: L.divIcon({ className: 'whatif-mk', html: '<span>?</span>', iconSize: [24, 24] }) })
        .bindTooltip(`<strong>${esc(w.name || 'Test site')}</strong><br>${fmtNum(w.single + w.town + w.apartment)} units${w.jobs ? ` · ${fmtNum(w.jobs)} jobs` : ''}${w.include ? '<br>Counted in the totals' : ''}`, { className: 'pt' })
        .on('click', () => showWhatIf(null, w.id))
        .on('dragend', e => { const ll = e.target.getLatLng(); w.lat = ll.lat; w.lng = ll.lng; syncWhatIfs(); showWhatIf(null, w.id); })
        .addTo(whatIfLayer);
    }
    if (state.svcModel) renderSvcTab();
  }
  function showWhatIf(latlng, id) {
    let w = id ? whatIfs.find(x => x.id === id) : null;
    if (!w) {
      const muni = (state.areas && state.censusDas) ? '' : '';
      w = { id: Date.now().toString(36), name: `Test site ${whatIfs.length + 1}`, lat: latlng.lat, lng: latlng.lng, single: 0, town: 0, apartment: 200, jobs: 0, ha: 0, phase: 'review', include: false, municipality: muni };
      whatIfs.push(w); syncWhatIfs();
    }
    const num = (k, label, step = 1) => `<label class="field"><span>${label}</span><input type="number" min="0" step="${step}" data-wf="${k}" value="${w[k]}"></label>`;
    $('#detail-body').innerHTML = `
      <div class="head"><h3><input class="wf-name" data-wf="name" value="${esc(w.name)}" aria-label="Name"></h3><div class="m">Test site · drag the pin to move it · not a real application</div></div>
      <div class="wf-form">${num('single', 'Single / semi')}${num('town', 'Townhouses')}${num('apartment', 'Apartments')}${num('jobs', 'Jobs')}${num('ha', 'Site area (ha)', 0.1)}
        <label class="field"><span>Layer</span><select data-wf="phase"><option value="review"${w.phase === 'review' ? ' selected' : ''}>Proposed</option><option value="approved"${w.phase === 'approved' ? ' selected' : ''}>Approved</option></select></label></div>
      <label class="chk small"><input type="checkbox" data-wf="include"${w.include ? ' checked' : ''}> Count it in the Water / Wastewater totals and plant capacity</label>
      <div id="wf-out"></div>
      <p class="small"><button type="button" class="btn small link" data-wf-del="1">Remove this test site</button></p>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'whatif';
    $('#detail-body').dataset.wf = w.id;
    renderWhatIfOut(w);
  }
  function renderWhatIfOut(w) {
    const p = whatIfProject(w), f = svcFacts(p), out = $('#wf-out'); if (!out) return;
    const e = D.estimate([p], state.criteria, 'all', jobsOf);
    out.innerHTML = `<p class="small">${fmtNum(Math.round(e.population))} people${e.employment.jobs ? ` + ${fmtNum(Math.round(e.employment.jobs))} jobs` : ''} at Peel persons per unit${p.siteAreaHa ? '' : ' · site area estimated from units for I&amp;I'}.</p>
      <section class="brief"><div class="b-row"><div class="b-k">Servicing</div><div class="b-v">${servicingBriefHTML(p, f).replace(/<p class="small"><button[^]*?<\/p>/, '')}</div></div></section>
      ${f ? servicingCheckHTML(p, f) : ''}${exportBar('whatif')}`;
  }
  $('#detail-body').addEventListener('input', e => {
    const k = e.target.dataset && e.target.dataset.wf; if (!k) return;
    const w = whatIfs.find(x => x.id === $('#detail-body').dataset.wf); if (!w) return;
    w[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(0, +e.target.value || 0) : e.target.value;
    clearTimeout(w._t); w._t = setTimeout(() => { delete w._t; syncWhatIfs(); renderWhatIfOut(w); }, 250);
  });
  $('#detail-body').addEventListener('change', e => { if (e.target.dataset && (e.target.dataset.wf === 'include' || e.target.dataset.wf === 'phase')) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  $('#detail-body').addEventListener('click', e => {
    if (!e.target.closest('[data-wf-del]')) return;
    whatIfs = whatIfs.filter(x => x.id !== $('#detail-body').dataset.wf); syncWhatIfs(); closeDetail();
  });
  syncWhatIfs();

  // ---- Planned infrastructure: Region of Peel 2026 DC capital maps (draft) ------------------
  // data/dc-infra.json (scripts/build-dc-infra.py): proposed and approved water / wastewater mains
  // with construction year, component and project numbers and diameter; facilities (plants,
  // stations, reservoirs, tanks) with their EA / design / property / construction years; and
  // plant treatment capacity steps.
  const DC_KIND = {
    primary: ['Primary wastewater main (trunk)', '#d6336c', 4], local: ['Local wastewater main', '#2b8a3e', 2.5], force: ['Force main', '#9c36b5', 2.5],
    transmission: ['Water transmission main', '#1c3d8f', 4], feeder: ['Water distribution feeder main', '#1c7ed6', 2.5],
  };
  const DC_FAC = { plant: 'Treatment plant', pumping_station: 'Pumping station', odour_control: 'Odour control facility', reservoir: 'Reservoir', elevated_tank: 'Elevated tank', well: 'Well', program: 'Program' };
  const PHASE_NAME = { EA: 'environmental assessment', P: 'property', D: 'design', C: 'construction' };
  const dcM = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111320);
  // Distance (m) from a point to a polyline, on a local flat projection.
  function dcDist(pt, g) {
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320;
    let best = Infinity;
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1][0] - pt[0]) * kx, ay = (g[i - 1][1] - pt[1]) * ky, bx = (g[i][0] - pt[0]) * kx, by = (g[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  }
  const lastYear = f => Math.max(0, ...f.items.flatMap(i => i.phases.filter(ph => ph[0] === 'C').map(ph => ph[1])));
  function prepDc(d) {
    if (!d) return null;
    for (const sys of ['wastewater', 'water']) {
      for (const ln of d[sys].lines) {
        ln.sys = sys;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of ln.g) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        ln.bbox = [x0, y0, x1, y1]; ln.mid = ln.g[Math.floor(ln.g.length / 2)];
      }
      for (const f of d[sys].facilities) f.sys = sys;
    }
    return d;
  }
  // Which traced catchment / pressure zone a planned main serves: the one containing it, else the
  // one nearest its ends (a main beyond the network connects at its end nearest the network).
  function dcTarget(ln) {
    if (ln._target !== undefined) return ln._target;
    const list = ln.sys === 'wastewater' ? state.servicing.drainage : state.servicing.zones;
    let id = PeelAreas.locate(list, ln.mid[0], ln.mid[1])[0];
    if (!id) { const n = [ln.g[0], ln.g[ln.g.length - 1]].map(e => PeelAreas.nearest(list, e[0], e[1], 3000)).filter(Boolean).sort((a, b) => a.m - b.m)[0]; id = n ? n.id : null; }
    return (ln._target = id || null);
  }
  // Nearest planned main of a system within r metres of a point.
  function dcNearest(sys, pt, r, filter = () => true) {
    if (!state.dcInfra || !pt || pt[0] == null) return null;
    const dLng = r / (111320 * Math.cos(pt[1] * Math.PI / 180)), dLat = r / 111320;
    let best = null;
    for (const ln of state.dcInfra[sys].lines) {
      const b = ln.bbox;
      if (pt[0] < b[0] - dLng || pt[0] > b[2] + dLng || pt[1] < b[1] - dLat || pt[1] > b[3] + dLat || !filter(ln)) continue;
      const m = dcDist(pt, ln.g);
      if (m <= r && (!best || m < best.m)) best = { ln, m };
    }
    return best;
  }
  // Greenfield connection: a development outside the traced network takes the catchment / zone
  // of the planned main it would connect to (within 1 km), before the distance-only nearest area.
  const DC_CONNECT_M = 1000;
  function dcVia(p, key) {
    if (!state.dcInfra || p.lat == null) return null;
    const n = dcNearest(key === 'dr' ? 'wastewater' : 'water', [p.lng, p.lat], DC_CONNECT_M);
    const id = n && dcTarget(n.ln);
    return id ? { id, m: n.m, via: { p: n.ln.p, y: n.ln.y, d: n.ln.d, k: n.ln.k } } : null;
  }
  const dcLineText = ln => `${ln.y || 'year not labelled'} ${ln.d ? `${ln.d} mm ` : ''}${DC_KIND[ln.k][0].toLowerCase()}${ln.p ? ` (project ${ln.p}${ln.c ? `, component ${ln.c}` : ''})` : ''}${ln.s === 'approved' ? ', approved 2026' : ''}`;
  // Planned works a development relies on: the planned mains it would connect to (wastewater and
  // water, within 400 m), primary mains and facilities in the catchments on its sewer path, water
  // facilities in its pressure zone, and the receiving plant's capacity steps.
  function devWorks(p, f) {
    if (!state.dcInfra || p.lat == null) return null;
    const pt = [p.lng, p.lat];
    const ww = dcNearest('wastewater', pt, 400), wa = dcNearest('water', pt, 400);
    const pathIds = new Set(f && f.path ? f.path.slice(0, 5).map(a => a.id) : []);
    const trunks = !pathIds.size ? [] : state.dcInfra.wastewater.lines.filter(ln => ln.k !== 'local' && ln.y && ln.y >= THIS_YEAR && pathIds.has(dcTarget(ln)) && ln !== (ww && ww.ln));
    const byProj = new Map(); for (const t of trunks) { const k = t.p || t.c; if (!byProj.has(k) || (t.d || 0) > (byProj.get(k).d || 0)) byProj.set(k, t); }
    const inArea = (fac, list) => fac.g && list.some(a => P.pointInRings(fac.g[0], fac.g[1], a.rings));
    const facs = [
      ...state.dcInfra.wastewater.facilities.filter(x => x.kind !== 'plant' && f && f.path && inArea(x, f.path.slice(0, 5))),
      ...state.dcInfra.water.facilities.filter(x => f && f.z && inArea(x, [f.z])),
    ].filter(x => lastYear(x) >= THIS_YEAR);
    const plant = f && f.pl && state.dcInfra.plantCapacity[f.pl] || [];
    // Timing applies where the site is outside the existing network (no traced catchment / mapped
    // pressure zone) and relies on a planned main to connect; elsewhere nearby works are context.
    const outWw = !(p.dr && p.dr.length), outWa = !(p.pz && p.pz.length);
    const conn = [outWw && (dcNearest('wastewater', pt, DC_CONNECT_M) || null), outWa && (dcNearest('water', pt, DC_CONNECT_M) || null)].filter(Boolean);
    const needBy = Math.max(0, ...conn.filter(n => n.ln.y && n.ln.y >= THIS_YEAR).map(n => n.ln.y));
    const committed = D.COMMITTED_PHASES.has(p.phase);
    return { ww: outWw ? conn.find(n => n.ln.sys === 'wastewater') || ww : ww, wa: outWa ? conn.find(n => n.ln.sys === 'water') || wa : wa, outWw, outWa,
      trunks: [...byProj.values()].sort((a, b) => a.y - b.y), facs, plant, needBy, gap: committed && needBy > THIS_YEAR };
  }
  function devWorksHTML(w) {
    if (!w) return '';
    const li = [];
    for (const [n, what, out] of [[w.ww, 'Wastewater', w.outWw], [w.wa, 'Water', w.outWa]]) if (n) li.push(`<li><strong>${what} ${out ? 'connection' : 'nearby'}:</strong> ${esc(dcLineText(n.ln))}, ${fmtNum(Math.round(n.m))} m away${out ? '' : ' <span class="muted">(site is on the existing network)</span>'}${n.ln.n ? `<small>${esc(n.ln.n)}</small>` : ''}</li>`);
    if (w.trunks.length) li.push(`<li><strong>Downstream trunks:</strong> ${w.trunks.slice(0, 4).map(t => esc(`${t.y} ${t.d ? `${t.d} mm` : ''} ${t.p || ''}`.trim())).join(' · ')}${w.trunks.length > 4 ? ` +${w.trunks.length - 4}` : ''}</li>`);
    if (w.facs.length) li.push(`<li><strong>Facilities:</strong> ${w.facs.slice().sort((a, b) => lastYear(a) - lastYear(b)).slice(0, 4).map(x => `<button type="button" class="btn small link" data-dcfac="${esc(x.sys)}|${esc(x.name)}">${esc(x.name)}</button> ${lastYear(x)}`).join(' · ')}${w.facs.length > 4 ? ` +${w.facs.length - 4} more (What loads this)` : ''}</li>`);
    if (w.plant.length) li.push(`<li><strong>Plant capacity:</strong> ${w.plant.map(s => `${s.mld} ML/d from ${s.year}`).join(' → ')}</li>`);
    if (!li.length) return '<p class="small muted">No planned works on the 2026 DC maps near this site or on its sewer path (served by the existing network).</p>';
    return `<ul class="b-lines small dc-works">${li.join('')}</ul>
      ${w.gap ? `<p class="small why-stall"><strong>Servicing timing:</strong> committed development outside the existing network, but the planned main it would connect to is not built until ${w.needBy} (2026 DC draft).</p>` : w.needBy ? `<p class="small muted">Outside the existing network: servicing about ${w.needBy} on the 2026 DC draft schedule.</p>` : ''}`;
  }

  // Map layer: planned mains (dashed when approved in 2026) and facilities.
  const dcLayer = L.layerGroup();
  function renderDcLayer() {
    dcLayer.clearLayers();
    if (!dcOn.on || !state.dcInfra) { map.removeLayer(dcLayer); return; }
    dcLayer.addTo(map);
    const yr = capYear;
    for (const sys of ['wastewater', 'water']) {
      if (dcOn.sys !== 'both' && dcOn.sys !== sys) continue;
      for (const ln of state.dcInfra[sys].lines) {
        const [label, col, w] = DC_KIND[ln.k], later = yr != null && ln.y && ln.y > yr;
        L.polyline(ln.g.map(([x, y]) => [y, x]), { color: col, weight: w, opacity: later ? 0.35 : 0.95, dashArray: ln.s === 'approved' || later ? '6 5' : null, className: 'dc-line' })
          .bindTooltip(`<strong>${esc(label)}</strong><br>${ln.y ? `Construction ${ln.y}` : 'Year not labelled'}${ln.d ? ` · ${ln.d} mm` : ''}${ln.s === 'approved' ? ' · approved 2026' : ' · proposed'}${ln.p ? `<br>Project ${esc(ln.p)}${ln.c ? ` · component ${esc(ln.c)}` : ''}` : ''}${ln.n ? `<br><span class="muted">${esc(ln.n)}</span>` : ''}${ln.t ? `<br><span class="muted small">${esc(ln.t)} (2020 DC study)</span>` : ''}<br><span class="muted">2026 DC capital map (draft) · tap: what it relieves</span>`, { sticky: true, className: 'pt' })
          .on('click', ev => { L.DomEvent.stop(ev); showDcLine(ln); }).addTo(dcLayer);
      }
      for (const fc of state.dcInfra[sys].facilities) {
        if (!fc.g) continue;
        const y = lastYear(fc), later = yr != null && y > yr;
        L.marker([fc.g[1], fc.g[0]], { icon: L.divIcon({ className: `dc-fac dc-${sys}${later ? ' later' : ''}`, html: `<span>${{ plant: 'P', pumping_station: 'S', odour_control: 'O', reservoir: 'R', elevated_tank: 'T', well: 'W' }[fc.kind] || '•'}</span>`, iconSize: [20, 20] }) })
          .bindTooltip(`<strong>${esc(fc.name)}</strong><br>${esc(DC_FAC[fc.kind] || fc.kind)} · ${fc.items.length} project${fc.items.length === 1 ? '' : 's'}, last construction ${y || '–'}${fc.approx ? '<br><span class="muted">approximate location</span>' : ''}<br><span class="muted">Tap for the schedule</span>`, { className: 'pt' })
          .on('click', () => showFacility(fc)).addTo(dcLayer);
      }
    }
  }
  function showFacility(fc) {
    $('#detail-body').innerHTML = `
      <div class="head"><h3>${esc(fc.name)}</h3><div class="m">${esc(DC_FAC[fc.kind] || fc.kind)} · ${fc.sys === 'water' ? 'water' : 'wastewater'} · 2026 DC capital map (draft, not approved by Council)</div></div>
      <table class="dt dc-sched"><thead><tr><th>Project</th><th>Schedule</th></tr></thead><tbody>
        ${fc.items.map(i => `<tr><td>${esc(i.what)}<small>${esc(i.proj)}</small></td><td>${i.phases.map(ph => `<span class="dc-ph dc-${ph[0]}" title="${esc(PHASE_NAME[ph[0]] || ph[0])} · component ${esc(ph[2])}">${esc(ph[0])} ${ph[1]}</span>`).join(' ')}</td></tr>`).join('')}
      </tbody></table>
      <p class="small muted">EA = environmental assessment, P = property, D = design, C = construction (year and component number from the map). Schedules are subject to annual review and approval by Regional Council.</p>
      ${dcNeedsSection({ fc })}
      ${exportBar('loads')}`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'facility'; $('#detail').scrollTop = 0;
    loadsOf = { dc: { fc } };
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-dcfac]'); if (!b || !state.dcInfra) return;
    const [sys, name] = b.dataset.dcfac.split('|'); const fc = state.dcInfra[sys].facilities.find(x => x.name === name);
    if (fc) { showFacility(fc); if (fc.g) map.setView([fc.g[1], fc.g[0]], Math.max(map.getZoom(), 14)); }
  });
  // Planned works serving a catchment (and everything upstream), a pressure zone or a plant.
  function dcAreaWorksHTML(ids, key, plantName) {
    if (!state.dcInfra || !ids) return '';
    const sys = key === 'pz' ? 'water' : 'wastewater';
    const byProj = new Map();
    for (const ln of state.dcInfra[sys].lines) {
      if (!ids.has(dcTarget(ln))) continue;
      const k = ln.p || ln.c || `${ln.k}${ln.y}`;
      const g = byProj.get(k) || { p: ln.p, k: ln.k, y0: Infinity, y1: 0, d: 0, n: ln.n || '', s: ln.s, len: 0 };
      if (ln.y) { g.y0 = Math.min(g.y0, ln.y); g.y1 = Math.max(g.y1, ln.y); }
      g.d = Math.max(g.d, ln.d || 0); for (let i = 1; i < ln.g.length; i++) g.len += dcM(ln.g[i - 1], ln.g[i]);
      byProj.set(k, g);
    }
    const areas = [...ids].map(id => svcById.get(id)).filter(Boolean);
    const facs = state.dcInfra[sys].facilities.filter(f => f.g && (plantName ? f.plant === plantName : areas.some(a => P.pointInRings(f.g[0], f.g[1], a.rings))));
    const steps = plantName ? state.dcInfra.plantCapacity[plantName] || [] : [];
    const rows = [...byProj.values()].sort((a, b) => (a.y0 - b.y0) || (b.d - a.d));
    if (!rows.length && !facs.length && !steps.length) return '<p class="small muted">No planned works on the 2026 DC maps in this area.</p>';
    return `<h3 class="sub-title" data-info="dc-works">Planned works (2026 DC capital map, draft)</h3>
      ${steps.length ? `<p class="small"><strong>Treatment capacity:</strong> ${steps.map(x => `${x.mld} ML/d from ${x.year}`).join(' → ')} <span class="muted">(${esc(steps.map(x => x.note).join('; '))})</span></p>` : ''}
      ${facs.length ? `<p class="small"><strong>Facilities:</strong> ${facs.map(f => `<button type="button" class="btn small link" data-dcfac="${esc(f.sys)}|${esc(f.name)}">${esc(f.name)}</button> (last construction ${lastYear(f)})`).join(' · ')}</p>` : ''}
      ${rows.length ? `<table class="dt dc-sched"><thead><tr><th>Construction</th><th>Main</th><th>Length</th></tr></thead><tbody>${rows.slice(0, 40).map(g => `<tr><td>${isFinite(g.y0) ? (g.y0 === g.y1 ? g.y0 : `${g.y0}–${g.y1}`) : '–'}</td><td>${esc(DC_KIND[g.k][0])}${g.d ? ` · ${g.d} mm` : ''}${g.s === 'approved' ? ' · approved 2026' : ''}<small>${esc(g.p || 'no project label')}${g.n ? ` · ${esc(g.n)}` : ''}</small></td><td>${unit(fmtNum(Math.round(g.len / 10) * 10), 'm')}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  // Planned works as GeoJSON (GIS).
  function dcGeoJSON() {
    const feats = [];
    for (const sys of ['wastewater', 'water']) {
      for (const ln of state.dcInfra[sys].lines) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ln.g }, properties: { system: sys, kind: ln.k, status: ln.s, construction_year: ln.y, component: ln.c, project: ln.p, diameter_mm: ln.d, study_name: ln.n || '', study_description: ln.t || '' } });
      for (const fc of state.dcInfra[sys].facilities) if (fc.g) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: fc.g }, properties: { system: sys, kind: fc.kind, name: fc.name, approximate: !!fc.approx, last_construction_year: lastYear(fc), projects: fc.items.map(i => `${i.what} ${i.proj}: ${i.phases.map(ph => `${ph[0]}-${ph[1]} (${ph[2]})`).join(', ')}`).join(' | ') } });
    }
    return { type: 'FeatureCollection', properties: { source: state.dcInfra.source }, features: feats };
  }

  // ---- Sewer pipe capacity screen (data/sewers.json, scripts/build-sewer-capacity.js) -------------
  // Every Peel sanitary pipe of 300 mm or more: full-flow capacity (Manning, n 0.013, published
  // slope), the 2021 Census population and land (ha) draining through it, and the next pipe down.
  // Growth since the census is added here: each development joins the nearest of these pipes and
  // its people, jobs and site area are carried down the chain. Flows at Peel design criteria.
  function loadSewers() {
    if (SEW.data || SEW.loading) return SEW.loading;
    SEW.loading = fetch('data/sewers.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return null;
      SEW.data = d;
      const grid = new Map();
      d.pipes.forEach((p, i) => {
        const c = p[10];
        for (let k = 0; k < c.length; k += 2) { const key = `${Math.floor(c[k] / 0.004)},${Math.floor(c[k + 1] / 0.003)}`; (grid.get(key) || grid.set(key, []).get(key)).push(i); }
      });
      SEW.grid = grid;
      if (mstyle.cap === 'pipes') renderCapLayer();
      if (currentProject && !$('#detail').hidden && $('#detail').dataset.view === 'dev') showDetail(currentProject);
      if (!$('#detail').hidden && $('#detail').dataset.view === 'dctiming') showDcTiming();
      return d;
    }).catch(() => null);
    return SEW.loading;
  }
  const pipeCoords = p => { const c = p[10], out = []; for (let k = 0; k < c.length; k += 2) out.push([c[k], c[k + 1]]); return out; };
  // Nearest pipe (index) to a point within r metres.
  function nearestPipe(lng, lat, r = 400) {
    if (!SEW.grid) return -1;
    const gx = Math.floor(lng / 0.004), gy = Math.floor(lat / 0.003), R = Math.ceil(r / 300);
    let best = -1, bd = Infinity;
    const seen = new Set();
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const k of SEW.grid.get(`${gx + i},${gy + j}`) || []) {
      if (seen.has(k)) continue; seen.add(k);
      const d = dcDist([lng, lat], pipeCoords(SEW.data.pipes[k]));
      if (d < bd) { bd = d; best = k; }
    }
    return bd <= r ? best : -1;
  }
  // Growth loads per pipe (built since the census, approved, proposed; test sites counted in the
  // totals included), recomputed when criteria or data change.
  function sewerGrowth() {
    if (!SEW.data) return null;
    const key = `${JSON.stringify(state.criteria)}|${state.projects.length}|${(state.whatifs || []).length}`;
    if (SEW.growth && SEW.key === key) return SEW.growth;
    const n = SEW.data.pipes.length, L = ['built', 'approved', 'proposed'];
    const g = Object.fromEntries(L.map(k => [k, { pop: new Float64Array(n), jobs: new Float64Array(n), ha: new Float64Array(n) }]));
    const devPipe = new Map();
    for (const p of state.projects.concat(state.whatifs || [])) {
      const lay = svcLayerOf(p);
      if (!L.includes(lay) || p.lat == null) continue;
      const e = D.estimate([p], state.criteria, 'all', jobsOf);
      if (!(e.population > 0 || e.employment.jobs > 0)) continue;
      const k = nearestPipe(p.lng, p.lat); if (k < 0) continue;
      devPipe.set(p, k);
      const ha = e.area.ha + (e.employment.area ? e.employment.area.ha : 0);
      for (let i = k, hop = 0; i >= 0 && hop < 2000; i = SEW.data.pipes[i][3], hop++) { g[lay].pop[i] += e.population; g[lay].jobs[i] += e.employment.jobs; g[lay].ha[i] += ha; }
    }
    SEW.growth = { ...g, devPipe }; SEW.key = key;
    return SEW.growth;
  }
  // Flow (L/s) through pipe i. Existing (census) load: peak dry weather at the plant's measured
  // rate (capacity check calibration; ×1 in design mode) — design I&I on all existing land would
  // overstate today's flows several times. Growth since the census: peak wet weather at Peel design
  // criteria, with I&I on its own site area. 'none' = existing only; 'today' = + built since; a year
  // or null (build-out) adds approved and proposed growth as phased in Horizon years; 'committed' =
  // existing + built + all approved.
  function pipeFlow(i, y) {
    const p = SEW.data.pipes[i], G = sewerGrowth(), c = state.criteria, E = c.employment;
    const fb = y === 'none' ? 0 : 1;
    const { fa, fp } = y === 'none' || y === 'today' ? { fa: 0, fp: 0 } : y === 'committed' ? { fa: 1, fp: 0 } : y == null ? { fa: 1, fp: 1 } : hzFrac(y);
    const M = state.svcModel, f = M && M.fOf ? M.fOf(SEW.data.plants[p[6]]) || 1 : 1;
    const exist = p[4] * c.wastewater.avg / 86400 * f * D.residentialPeaking(p[4], c.wastewater);
    const gp = fb * G.built.pop[i] + fa * G.approved.pop[i] + fp * G.proposed.pop[i];
    const gj = fb * G.built.jobs[i] + fa * G.approved.jobs[i] + fp * G.proposed.jobs[i];
    const gh = fb * G.built.ha[i] + fa * G.approved.ha[i] + fp * G.proposed.ha[i];
    const growth = gp * c.wastewater.avg / 86400 * D.residentialPeaking(gp, c.wastewater) + gj * E.wastewater / 86400 * D.employmentPeaking(gj, E) + gh * c.wastewater.infiltration;
    return { pop: p[4] + gp, jobs: gj, ha: p[5] + gh, exist, growth, q: exist + growth, f };
  }
  // Pipes by class at the legend year (all pipes, for the legend summary).
  function pipeSummary() {
    if (!SEW.data) return null;
    const n = PIPE_CLS.map(() => 0); let none = 0;
    SEW.data.pipes.forEach((p, i) => { const s = pipeStats(i); if (s.r1 == null) none++; else n[PIPE_CLS.findIndex(([t]) => s.r1 * 100 < t)]++; });
    return { n, none, total: SEW.data.pipes.length };
  }
  const pipeColour = r => r == null || isNaN(r) ? '#adb5bd' : (PIPE_CLS.find(([t]) => r * 100 < t) || PIPE_CLS[PIPE_CLS.length - 1])[1];
  function pipeStats(i) {
    const p = SEW.data.pipes[i], cap = p[2];
    const today = pipeFlow(i, 'today'), then = pipeFlow(i, capYear);
    return { p, cap, today, then, r0: cap ? today.q / cap : null, r1: cap ? then.q / cap : null, growthShare: cap ? then.growth / cap : null };
  }
  function pipeTip(i) {
    const s = pipeStats(i), p = s.p, D0 = SEW.data;
    return `<strong>${p[0]} mm sanitary sewer</strong>${p[7] ? ` · ${p[7]}` : ''} · ${esc(D0.materials[p[8]] || '')}${D0.risks[p[9]] && D0.risks[p[9]] !== 'INSIGNIFICANT' ? ` · risk ${esc(D0.risks[p[9]].toLowerCase())}` : ''}
      <br>Slope ${(p[1] * 100).toFixed(2)}% · full capacity ${s.cap ? `${fmtNum(s.cap)} L/s` : 'n/a (no slope)'}
      <br>Upstream: ${fmtNum(Math.round(s.then.pop))} people${s.then.jobs ? ` + ${fmtNum(Math.round(s.then.jobs))} jobs` : ''}
      <br>Existing peak dry ${fmtNum(Math.round(s.then.exist))} L/s${s.then.f !== 1 ? ` (×${s.then.f.toFixed(2)} measured)` : ''} + growth peak wet ${fmtNum(Math.round(s.then.growth))} L/s
      <br>Today ${fmtNum(Math.round(s.today.q))} L/s${s.r0 != null ? ` (${Math.round(s.r0 * 100)}%)` : ''} → ${capYear == null ? 'build-out' : capYear} ${fmtNum(Math.round(s.then.q))} L/s${s.r1 != null ? ` (<strong>${Math.round(s.r1 * 100)}%</strong>)` : ''}
      ${s.growthShare != null ? `<br>Growth since the census uses ${Math.round(s.growthShare * 100)}% of its capacity` : ''}${p[11] < 1 ? `<br><span class="muted">carries ${Math.round(p[11] * 100)}% of the flow at a split</span>` : ''}
      <br><span class="muted">Screening only; tap for what loads it</span>`;
  }
  function renderPipes(layer) {
    if (!SEW.data) { loadSewers(); return; }
    const z = map.getZoom(), minD = z < 12 ? 900 : z < 13 ? 600 : z < 14 ? 375 : 300;
    const b = map.getBounds().pad(0.2);
    const ren = svcRenderer;
    SEW.data.pipes.forEach((p, i) => {
      if (p[0] < minD) return;
      const c = p[10]; if (!b.contains([c[1], c[0]]) && !b.contains([c[c.length - 1], c[c.length - 2]])) return;
      const s = pipeStats(i);
      L.polyline(pipeCoords(p).map(([x, y]) => [y, x]), { renderer: ren, pane: 'svcPane', color: pipeColour(s.r1), weight: Math.max(2, Math.min(7, p[0] / 300)), opacity: 0.9 })
        .bindTooltip(() => pipeTip(i), { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); showPipeLoads(i); }).addTo(layer);
    });
  }
  map.on('moveend', () => { if (mstyle.cap === 'pipes') renderCapLayer(); });
  // Tightest pipe on a development's path to the plant (build-out or the legend year).
  function pathPipes(p) {
    if (!SEW.data || p.lat == null) return null;
    const G = sewerGrowth(); const k = G.devPipe.get(p) ?? nearestPipe(p.lng, p.lat);
    if (k < 0) return null;
    // Local: the first 3 km of the path; downstream: the rest to the plant.
    let local = null, trunk = null, n = 0, dist = 0;
    for (let i = k, hop = 0; i >= 0 && hop < 2000; i = SEW.data.pipes[i][3], hop++) {
      const s = pipeStats(i); n++;
      const c = SEW.data.pipes[i][10]; dist += dcM([c[0], c[1]], [c[c.length - 2], c[c.length - 1]]);
      const slot = dist <= 3000 ? 'local' : 'trunk';
      if (s.r1 != null) { if (slot === 'local' && (!local || s.r1 > local.r1)) local = { i, ...s }; if (slot === 'trunk' && (!trunk || s.r1 > trunk.r1)) trunk = { i, ...s }; }
    }
    return { first: k, local, trunk, worst: [local, trunk].filter(Boolean).sort((a, b) => b.r1 - a.r1)[0] || null, n };
  }
  function showPipeLoads(i) {
    const G = sewerGrowth(), s = pipeStats(i), p = s.p;
    const up = [];
    for (const [dev, k] of G.devPipe) {
      let hit = false; for (let j = k, hop = 0; j >= 0 && hop < 2000; j = SEW.data.pipes[j][3], hop++) if (j === i) { hit = true; break; }
      if (hit) { const e = D.estimate([dev], state.criteria, 'all', jobsOf); up.push({ dev, e, q: e.combined.wastewater.wetPeak }); }
    }
    up.sort((a, b) => b.q - a.q);
    $('#detail-body').innerHTML = `
      <div class="head"><h3>${p[0]} mm sanitary sewer</h3><div class="m">${esc(SEW.data.plants[p[6]] === 'Toronto' ? 'City of Toronto system' : plantLabel(SEW.data.plants[p[6]]))} sewershed · slope ${(p[1] * 100).toFixed(2)}% · full capacity ${s.cap ? `${fmtNum(s.cap)} L/s` : 'n/a'}${p[7] ? ` · installed ${p[7]}` : ''}</div></div>
      <div class="chips"><span class="chip">Today ${fmtNum(Math.round(s.today.q))} L/s${s.r0 != null ? ` · ${Math.round(s.r0 * 100)}%` : ''}</span><span class="chip ${s.r1 > 1 ? 'warn' : ''}">${capYear == null ? 'Build-out' : capYear} ${fmtNum(Math.round(s.then.q))} L/s${s.r1 != null ? ` · ${Math.round(s.r1 * 100)}%` : ''}</span>${s.growthShare != null ? `<span class="chip">Growth uses ${Math.round(s.growthShare * 100)}%</span>` : ''}</div>
      ${exportBar('loads')}
      <table class="dt loads-table"><caption>${fmtNum(up.length)} developments since the census draining through this pipe, largest peak wet first</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>Peak wet</th></tr></thead>
        <tbody>${up.slice(0, 50).map(r => `<tr class="ld-row" data-dev="${esc(r.dev.key)}" tabindex="0"><td>${dot(r.dev.phase)} ${esc(r.dev.title)}<small><span class="lg-sw" style="--mk:${layerColors()[svcLayerOf(r.dev)]}"></span>${esc(LAYER_NAME[svcLayerOf(r.dev)])} · ${esc(r.dev.municipality)}</small></td><td>${fmtNum(Math.round(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.q)}</td></tr>`).join('')}</tbody></table>
      <p class="small muted">Existing: ${fmtNum(p[4])} people upstream (2021 Census) at peak dry weather, ${s.today.f !== 1 ? `scaled ×${s.today.f.toFixed(2)} to the plant's 2025 measured flow (capacity check)` : 'at design rates'}; growth since the census at Peel design peak wet weather (Harmon, employment rates, I&amp;I ${state.criteria.wastewater.infiltration} L/s/ha on its site area). Full-pipe capacity by Manning (n 0.013) on the published slope. A screen for where to look, not a hydraulic model: existing wet-weather inflow and infiltration, surcharge, storage and relief sewers are not modelled. Developments join the nearest sewer of 300 mm or more.</p>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'loads'; $('#detail').scrollTop = 0;
    loadsOf = { pipe: i };
  }


  // ---- Existing pipes (live from the Region / municipal GIS, by map area) ----------------------
  // Region of Peel watermains and sanitary sewers; Mississauga and Brampton storm sewers and the
  // Region's storm mains. Drawn from street zoom, fetched by ~1 km tile and cached; tap a pipe for
  // its size, material and year. Development panel: the nearest existing mains to the site.
  const PEEL_FS = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
  const EXIST = {
    water: [{ url: `${PEEL_FS}/waterwastWater/FeatureServer/5`, f: 'Diameter,Material', src: 'Region of Peel' }, { url: `${PEEL_FS}/waterwastWater/FeatureServer/6`, f: 'Diameter,Material', src: 'Region of Peel' }],
    sanitary: [{ url: `${PEEL_FS}/waterwastWater/FeatureServer/10`, f: 'Diameter,Material,InstallationDate,Slope,MainType', src: 'Region of Peel' }],
    storm: [
      { url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/StormSegment/FeatureServer/0', f: 'DIAMETER,MATERIAL,INSTALLDAT', src: 'City of Mississauga' },
      { url: 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/2', f: 'HEIGHT,WIDTH,MATERIAL,SLOPE,SHAPE_PIPE,WATERSHED,SUBSHED', src: 'City of Brampton' },
      { url: `${PEEL_FS}/storm_infrastructure/FeatureServer/4`, f: 'Diameter,Material,MainType', src: 'Region of Peel' },
    ],
  };
  const existLayer = L.layerGroup().addTo(map);
  const existCache = new Map();      // `${kind}|${i}|${tile}` -> Promise<features>
  const existRenderer = L.canvas({ padding: 0.3 });
  // Attributes common to all sources.
  function pipeAttrs(kind, src, p) {
    const g = k => p[k] ?? p[k.toUpperCase()] ?? p[k.toLowerCase()];
    let d = g('Diameter') || g('DIAMETER') || 0;
    if (!d && (p.HEIGHT || p.WIDTH)) d = Math.max(p.HEIGHT || 0, p.WIDTH || 0);
    const yRaw = p.InstallationDate || p.INSTALLDAT;
    const year = yRaw && yRaw > -1e12 && yRaw < 4e12 ? new Date(yRaw).getUTCFullYear() : null;
    const slope = p.Slope || p.SLOPE;
    return { d: Math.round(d), mat: String(p.Material || p.MATERIAL || '').trim(), year, slope: slope > 0 && slope < 0.5 ? slope : (slope > 0.5 && slope < 50 ? slope / 100 : null), type: p.MainType || '', src, shed: [p.WATERSHED, p.SUBSHED].filter(x => x && String(x).trim()).join(' / ') };
  }
  const existText = (kind, a) => `${EXIST_STYLE[kind].label}${a.d ? ` ${a.d} mm` : ''}${a.mat ? ` ${a.mat}` : ''}${a.year ? `, ${a.year}` : ''}${a.slope ? `, slope ${(a.slope * 100).toFixed(2)}%` : ''}${/FM/.test(a.type) ? ' (force main)' : ''}`;
  async function existTile(kind, i, tx, ty) {
    const key = `${kind}|${i}|${tx},${ty}`;
    if (existCache.has(key)) return existCache.get(key);
    const S = EXIST[kind][i];
    const pr = (async () => {
      const info = await A.layerInfo(S.url);
      const bbox = { xmin: tx * 0.01, ymin: ty * 0.01, xmax: (tx + 1) * 0.01, ymax: (ty + 1) * 0.01 };
      const { features } = await A.queryAll(S.url, info, { bbox, max: 4000, outFields: S.f });
      return features;
    })().catch(() => []);
    existCache.set(key, pr);
    return pr;
  }
  let existSeq = 0;
  async function renderExisting() {
    const seq = ++existSeq;
    existLayer.clearLayers();
    const kinds = Object.keys(existOn).filter(k => existOn[k]);
    const note = $('#exist-note');
    if (!kinds.length) { if (note) note.textContent = ''; return; }
    if (map.getZoom() < EXIST_ZOOM) { if (note) note.textContent = 'Zoom in to see existing pipes'; return; }
    if (note) note.textContent = 'Loading existing pipes…';
    const b = map.getBounds();
    const tiles = [];
    for (let tx = Math.floor(b.getWest() / 0.01); tx <= Math.floor(b.getEast() / 0.01); tx++) for (let ty = Math.floor(b.getSouth() / 0.01); ty <= Math.floor(b.getNorth() / 0.01); ty++) tiles.push([tx, ty]);
    if (tiles.length > 30) { if (note) note.textContent = 'Zoom in further to see existing pipes'; return; }
    const seen = new Set();
    await Promise.all(kinds.flatMap(kind => EXIST[kind].flatMap((S, i) => tiles.map(async ([tx, ty]) => {
      const feats = await existTile(kind, i, tx, ty);
      if (seq !== existSeq) return;
      for (const f of feats) {
        const id = `${kind}|${i}|${f.id ?? JSON.stringify(f.geometry.coordinates[0])}`;
        if (seen.has(id) || !f.geometry) continue; seen.add(id);
        const a = pipeAttrs(kind, S.src, f.properties || {});
        const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
        L.polyline(lines.map(l => l.map(([x, y]) => [y, x])), { renderer: existRenderer, color: EXIST_STYLE[kind].color, weight: a.d >= 900 ? 6 : a.d >= 600 ? 5 : a.d >= 375 ? 3.5 : 2, opacity: 0.85, dashArray: /FM/.test(a.type) ? '6 4' : null })
          .bindTooltip(`<strong>${esc(existText(kind, a))}</strong><br><span class="muted">${esc(S.src)} (live)</span>`, { sticky: true, className: 'pt' }).addTo(existLayer);
      }
    }))));
    if (seq === existSeq && note) note.textContent = '';
  }
  map.on('moveend', () => { if (Object.values(existOn).some(Boolean)) renderExisting(); });
  // Nearest existing main of each kind to a point, within r metres (live query, cached per site).
  const nearCache = new Map();
  function nearestExisting(lng, lat, r = 200) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (nearCache.has(key)) return nearCache.get(key);
    const pr = Promise.all(Object.entries(EXIST).map(async ([kind, srcs]) => {
      let best = null;
      for (const S of srcs) {
        try {
          const j = await A.fetchJSON(`${S.url}/query`, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: r, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields: S.f, outSR: 4326, returnGeometry: true, resultRecordCount: 50, f: 'json' });
          for (const f of j.features || []) {
            const paths = (f.geometry && f.geometry.paths) || [];
            const m = Math.min(...paths.map(pth => dcDist([lng, lat], pth)));
            if (isFinite(m) && (!best || m < best.m)) best = { m, a: pipeAttrs(kind, S.src, f.attributes || {}) };
          }
        } catch (e) { /* source unavailable */ }
      }
      return [kind, best];
    })).then(Object.fromEntries);
    nearCache.set(key, pr);
    return pr;
  }
  if (Object.values(existOn).some(Boolean)) setTimeout(renderExisting, 1500);
  // Age and risk of the sanitary sewers on the development's path (first 3 km), from sewers.json.
  function pathAgeRisk(p) {
    if (!SEW.data || p.lat == null) return null;
    const G = sewerGrowth(); const k = G.devPipe.get(p) ?? nearestPipe(p.lng, p.lat);
    if (k < 0) return null;
    let oldest = null, dist = 0, n = 0; const risky = [];
    for (let i = k, hop = 0; i >= 0 && hop < 2000 && dist <= 3000; i = SEW.data.pipes[i][3], hop++) {
      const q = SEW.data.pipes[i], c = q[10]; n++;
      dist += dcM([c[0], c[1]], [c[c.length - 2], c[c.length - 1]]);
      if (q[7] && (!oldest || q[7] < oldest.y)) oldest = { y: q[7], i, d: q[0], mat: SEW.data.materials[q[8]] || '' };
      if (SEW.data.risks[q[9]] === 'MODERATE') risky.push(i);
    }
    return { oldest, risky, n };
  }
  const MAT_NOTE = { AC: 'asbestos cement', ACP: 'asbestos cement', VIT: 'vitrified clay', CONC: 'concrete', CONP: 'concrete', RCOP: 'reinforced concrete', PVC: 'PVC', DI: 'ductile iron', ST: 'steel', HDPE: 'HDPE', PE: 'polyethylene' };
  function fillExisting(p) {
    const el = $('#dev-exist'); if (!el || p.lat == null) return;
    nearestExisting(p.lng, p.lat).then(r => {
      if (currentProject !== p || !$('#dev-exist')) return;
      const parts = Object.entries(r).map(([k, v]) => v ? `<li><strong>${EXIST_STYLE[k].label}:</strong> ${esc(existText(k, v.a).replace(EXIST_STYLE[k].label, '').trim() || 'size not recorded')}, ${fmtNum(Math.round(v.m))} m <span class="muted">(${esc(v.a.src)})</span></li>` : `<li class="muted"><strong>${EXIST_STYLE[k].label}:</strong> none within 200 m${k === 'storm' && p.municipality === 'Caledon' ? ' (Caledon storm sewers are not published)' : ''}</li>`);
      const ar = pathAgeRisk(p);
      if (ar && (ar.oldest || ar.risky.length)) {
        const o = ar.oldest, age = o ? THIS_YEAR - o.y : 0;
        parts.push(`<li${age >= 50 || ar.risky.length ? ' class="why-warn-t"' : ''}><strong>Sewer path age / risk</strong> <span class="muted">(first 3 km, ${fmtNum(ar.n)} pipes)</span>: ${o ? `oldest <button type="button" class="btn small link" data-pipe="${o.i}">${o.d} mm, ${o.y}</button>${o.mat ? ` ${esc(MAT_NOTE[o.mat] || o.mat)}` : ''} (${age} years)` : 'install years not recorded'}${ar.risky.length ? ` · ${ar.risky.length} rated moderate risk by the Region <button type="button" class="btn small link" data-pipe="${ar.risky[0]}">show</button>` : ' · none rated above low risk'}</li>`);
      }
      $('#dev-exist').innerHTML = `<ul class="b-lines small">${parts.join('')}</ul><p class="small muted">Nearest to the development's point, live from the Region / municipal GIS — not the connection point.${ar ? ' Age and risk rating from the Region\'s sanitary sewer records.' : ''}</p>`;
    });
    fillFire(p); fillStorm(p);
  }

  // ---- Fire flow context: hydrants near the site, their pressure zone, nearest large watermain ----
  // Peel hydrants (live). Hydrant flow tests are not published, so this is coverage and zone only.
  const HYDRANTS = `${PEEL_FS}/HydrantsExport_/FeatureServer/0`;
  const FIRE_R = 150, TRANS_R = 1500;
  const geoQ = (url, lng, lat, r, outFields) => A.fetchJSON(`${url}/query`, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: r, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields, outSR: 4326, returnGeometry: true, resultRecordCount: 200, f: 'json' });
  const fireCache = new Map();
  function fireContext(lng, lat) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (fireCache.has(key)) return fireCache.get(key);
    const pr = Promise.all([
      geoQ(HYDRANTS, lng, lat, FIRE_R, 'PressureZone,ServiceStatus').then(j => (j.features || []).filter(f => f.geometry && !/^ANY/.test((f.attributes || {}).ServiceStatus || '')).map(f => ({ m: dcM([lng, lat], [f.geometry.x, f.geometry.y]), zone: String((f.attributes || {}).PressureZone || '').trim() }))).catch(() => null),
      geoQ(EXIST.water[1].url, lng, lat, TRANS_R, 'Diameter,Material').then(j => {
        let best = null;
        for (const f of j.features || []) { const m = Math.min(...((f.geometry && f.geometry.paths) || []).map(pth => dcDist([lng, lat], pth))); if (isFinite(m) && (!best || m < best.m)) best = { m, a: pipeAttrs('water', 'Region of Peel', f.attributes || {}) }; }
        return best;
      }).catch(() => undefined),
    ]).then(([hyd, trans]) => ({ hyd, trans }));
    fireCache.set(key, pr);
    return pr;
  }
  function fillFire(p) {
    if (!$('#dev-fire')) return;
    fireContext(p.lng, p.lat).then(({ hyd, trans }) => {
      if (currentProject !== p || !$('#dev-fire')) return;
      const L0 = [];
      if (hyd == null) L0.push('<li class="muted">Hydrants: the Region\'s hydrant layer did not respond</li>');
      else if (!hyd.length) L0.push(`<li class="why-warn-t"><strong>Hydrants:</strong> none within ${FIRE_R} m${p.municipality === 'Caledon' ? ' (rural Caledon may rely on tanker supply)' : ''}</li>`);
      else {
        hyd.sort((a, b) => a.m - b.m);
        const zones = {}; for (const h of hyd) if (h.zone) zones[h.zone] = (zones[h.zone] || 0) + 1;
        const zs = Object.entries(zones).sort((a, b) => b[1] - a[1]).map(([z]) => z);
        const sitePz = (p.pz || []).map(id => String(id).replace(/^pz:/, ''));
        const mismatch = zs.length && sitePz.length && !zs.some(z => sitePz.includes(z));
        L0.push(`<li><strong>Hydrants:</strong> ${hyd.length} within ${FIRE_R} m, nearest ${fmtNum(Math.round(hyd[0].m))} m${zs.length ? ` · pressure zone ${esc(zs.join(', '))}` : ''}${zs.length > 1 ? ' <span class="muted">(near a zone boundary)</span>' : ''}</li>`);
        if (mismatch) L0.push(`<li class="muted">The site's mapped pressure zone is ${esc(sitePz.join(', '))}; nearby hydrants are recorded in ${esc(zs.join(', '))}.</li>`);
      }
      if (trans === undefined) L0.push('<li class="muted">Transmission mains: no response</li>');
      else L0.push(trans ? `<li><strong>Nearest large watermain:</strong> ${trans.a.d ? `${trans.a.d} mm` : 'size not recorded'}${trans.a.mat ? ` ${esc(trans.a.mat)}` : ''}, ${fmtNum(Math.round(trans.m))} m</li>` : `<li class="muted"><strong>Large watermains:</strong> none within ${fmtNum(TRANS_R / 1000)} km</li>`);
      $('#dev-fire').innerHTML = `<ul class="b-lines small">${L0.join('')}</ul><p class="small muted">Live from the Region's hydrant and watermain layers. Hydrant flow tests are not published: coverage and zone only, not available fire flow.</p>`;
    });
  }

  // ---- Stormwater context: nearest stormwater management pond, its design controls, subwatershed ----
  // Brampton (726 ponds, with design controls) and Caledon (96 ponds) publish ponds; Mississauga does not.
  const PONDS = [
    { url: 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/3', f: 'NAME,POND_ID,CATEGORY,FEATURE_TYPE,WATERSHED,SUBSHED,QUAL_DESIGN,EROSN_DESIGN,FLOOD_DESIGN,RISK_GRADE', src: 'City of Brampton' },
    { url: 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/GISProd_GISDBO_StormWaterMngPonds/FeatureServer/19', f: 'POND,TYPE_OF_FA,ASSUMED_OR,COMMUNITY,SWM_REPORT', src: 'Town of Caledon' },
  ];
  const POND_R = 1000;
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
  function pondAttrs(a, src) {
    const yes = v => v != null && String(v).trim() && !/^(no|n|none|0|null)$/i.test(String(v).trim());
    const ctl = [['QUAL_DESIGN', 'quality'], ['EROSN_DESIGN', 'erosion'], ['FLOOD_DESIGN', 'quantity / flood']].filter(([k]) => yes(a[k])).map(([k, l]) => `${l}${/^(y|yes)$/i.test(String(a[k]).trim()) ? '' : ` (${String(a[k]).trim()})`}`);
    return { name: String(a.NAME || a.POND || a.POND_ID || '').trim(), type: String(a.FEATURE_TYPE || a.CATEGORY || a.TYPE_OF_FA || '').trim(), ctl, hasCtl: 'QUAL_DESIGN' in a, shed: [a.WATERSHED, a.SUBSHED].filter(x => x && String(x).trim()).join(' / '), risk: String(a.RISK_GRADE || '').trim(), assumed: String(a.ASSUMED_OR || '').trim(), report: String(a.SWM_REPORT || '').trim(), src };
  }
  const pondCache = new Map();
  function nearestPond(lng, lat) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (pondCache.has(key)) return pondCache.get(key);
    const pr = Promise.all(PONDS.map(S => geoQ(S.url, lng, lat, POND_R, S.f).then(j => (j.features || []).map(f => {
      const rings = (f.geometry && f.geometry.rings) || [];
      const m = rings.some(r => inRing(lng, lat, r)) ? 0 : Math.min(...rings.map(r => dcDist([lng, lat], r)));
      return { m, a: pondAttrs(f.attributes || {}, S.src) };
    })).catch(() => null))).then(rs => {
      const all = rs.filter(Boolean).flat().filter(x => isFinite(x.m)).sort((a, b) => a.m - b.m);
      return { ponds: all, failed: rs.every(r => r == null) };
    });
    pondCache.set(key, pr);
    return pr;
  }
  function fillStorm(p) {
    if (!$('#dev-storm')) return;
    if (p.municipality === 'Mississauga') { $('#dev-storm').innerHTML = '<p class="small muted">Mississauga does not publish its stormwater ponds; see the nearest storm sewer under Existing mains.</p>'; return; }
    Promise.all([nearestPond(p.lng, p.lat), nearestExisting(p.lng, p.lat)]).then(([{ ponds, failed }, ex]) => {
      if (currentProject !== p || !$('#dev-storm')) return;
      const L0 = [];
      if (failed) L0.push('<li class="muted">The pond layers did not respond</li>');
      else if (!ponds.length) L0.push(`<li class="muted"><strong>Ponds:</strong> none within ${fmtNum(POND_R / 1000)} km</li>`);
      else {
        const o = ponds[0].a;
        L0.push(`<li><strong>Nearest pond:</strong> ${esc(o.name || 'unnamed')}${o.type ? ` <span class="muted">(${esc(o.type.toLowerCase())})</span>` : ''}, ${ponds[0].m ? `${fmtNum(Math.round(ponds[0].m))} m` : 'on the site'} <span class="muted">(${esc(o.src)})</span></li>`);
        if (o.hasCtl) L0.push(`<li>Design controls: ${o.ctl.length ? esc(o.ctl.join(', ')) : '<span class="muted">none recorded</span>'}${o.risk ? ` · risk grade ${esc(o.risk)}` : ''}</li>`);
        if (o.assumed) L0.push(`<li class="muted">Status: ${esc(o.assumed)}${o.report ? ` · SWM report ${esc(o.report)}` : ''}</li>`);
        if (ponds.length > 1) L0.push(`<li class="muted">${ponds.length - 1} more within ${fmtNum(POND_R / 1000)} km</li>`);
      }
      const shed = (ponds && ponds.find(x => x.a.shed) || {}).a?.shed || (ex.storm && ex.storm.a.shed);
      if (shed) L0.push(`<li><strong>Watershed / subwatershed:</strong> ${esc(shed)}</li>`);
      $('#dev-storm').innerHTML = `<ul class="b-lines small">${L0.join('')}</ul><p class="small muted">Live from the municipal stormwater layers. Whether the pond was sized for this site is in its SWM report, not the GIS.</p>`;
    });
  }


  // ---- DC needs: existing capacity against the 2026 DC works ----------------------------------
  // For each existing constraint a development relies on — sanitary sewers on its path (Manning,
  // as in the pipe screen), pumping stations (master plan firm capacity), the wastewater plant (90%
  // trigger), the water treatment system, storage (master plan) and the large mains into its
  // pressure zone (rough, 1.5 m/s) — the room left after existing + approved development (people and
  // units), the year approved and proposed growth uses it up (Horizon years phasing), and the DC
  // project that relieves it. Reverse: a DC main or facility lists the developments relying on it.
  const DCN = { supply: null, pipeRelief: null, cache: new Map(), key: '' };
  const PP_HA = 1 / 150;               // hectares per added person (I&I on new land, ~50 units/ha)
  const PLANT_TRIGGER = 0.9;
  async function loadWaterSupply() {
    if (DCN.supply !== null) return DCN.supply;
    try { const r = await fetch('data/water-supply.json', { cache: 'no-cache' }); DCN.supply = r.ok ? await r.json() : false; } catch (e) { DCN.supply = false; }
    return DCN.supply;
  }
  const zLevel = z => { const m = /^(\d+)/.exec(z || ''); return m ? +m[1] : null; };
  const wellSystem = { AV13: 'Caledon Village – Alton', CE9: 'Palgrave – Caledon East' };
  const yearsAhead = () => { const ys = []; for (let y = THIS_YEAR; y <= hz.end; y++) ys.push(y); return ys; };
  // First year the flow reaches the limit: 'today' if already there, null if not by build-out.
  function runOut(q, limit) {
    if (q('today') >= limit(THIS_YEAR)) return 'today';
    for (const y of yearsAhead()) if (q(y) >= limit(y)) return y;
    return null;
  }
  // People that fit in a room (same units as add(x)), by bisection; negative rooms scale linearly.
  function peopleFor(room, add) {
    if (!(room > 0)) { const m = add(1000) / 1000; return m > 0 ? room / m : 0; }
    let lo = 0, hi = 1000; while (add(hi) < room && hi < 1e8) hi *= 2;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (add(mid) < room) lo = mid; else hi = mid; }
    return lo;
  }
  const constructionYear = items => { const ys = items.flatMap(i => i.phases.filter(ph => ph[0] === 'C').map(ph => ph[1])).filter(y => y >= THIS_YEAR - 1); return ys.length ? Math.min(...ys) : null; };

  // Wastewater: the DC main running along an existing sewer (half its length within 150 m) — a
  // twin or replacement.
  function pipeReliefOf(i) {
    if (!DCN.pipeRelief) DCN.pipeRelief = new Map();
    if (DCN.pipeRelief.has(i)) return DCN.pipeRelief.get(i);
    const c = SEW.data.pipes[i][10], pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k], c[k + 1]]);
    const mid = pts[Math.floor(pts.length / 2)], r = 150, dLng = 300 / (111320 * Math.cos(mid[1] * Math.PI / 180)), dLat = 300 / 111320;
    let best = null;
    for (const ln of state.dcInfra.wastewater.lines) {
      const b = ln.bbox; if (mid[0] < b[0] - dLng || mid[0] > b[2] + dLng || mid[1] < b[1] - dLat || mid[1] > b[3] + dLat) continue;
      const near = pts.filter(pt => dcDist(pt, ln.g) <= r).length / pts.length;
      if (near >= 0.5 && (!best || near > best.near || (near === best.near && (ln.d || 0) > (best.ln.d || 0)))) best = { ln, near };
    }
    const out = best ? best.ln : null;
    DCN.pipeRelief.set(i, out);
    return out;
  }
  const lineRelief = ln => ({ kind: 'line', ln, y: ln.y || null, text: `${ln.y || 'year not labelled'} ${ln.d ? `${ln.d} mm ` : ''}${DC_KIND[ln.k][0].toLowerCase()}${ln.p ? ` ${ln.p}` : ''}` });
  const facRelief = (fc, what) => { const it = what ? fc.items.filter(i => what.test(i.what)) : fc.items; const y = constructionYear(it.length ? it : fc.items); return { kind: 'fac', fc, y, text: `${y || '–'} ${fc.name}${it.length ? ` · ${it.map(i => i.what).join(', ')}` : ''}` }; };
  // Growth (peak wet, L/s) of gp people, gj jobs on gh hectares, as in pipeFlow.
  function growthLs(gp, gj, gh) {
    const c = state.criteria, E = c.employment;
    return gp * c.wastewater.avg / 86400 * D.residentialPeaking(gp, c.wastewater) + gj * E.wastewater / 86400 * D.employmentPeaking(gj, E) + gh * c.wastewater.infiltration;
  }
  function pipeCons(i) {
    const p = SEW.data.pipes[i], cap = p[2]; if (!cap) return null;
    const q = y => pipeFlow(i, y).q, com = pipeFlow(i, 'committed'), bo = pipeFlow(i, null), none = pipeFlow(i, 'none').q;
    const room = cap - com.q;
    const gp = com.pop - p[4], gh = com.ha - p[5];
    const people = peopleFor(room, x => growthLs(gp + x, com.jobs, gh + x * PP_HA) - growthLs(gp, com.jobs, gh));
    const ln = state.dcInfra && pipeReliefOf(i);
    return { id: `pipe:${i}`, sys: 'ww', kind: 'pipe', i, name: `${p[0]} mm sanitary sewer`, sub: `slope ${(p[1] * 100).toFixed(2)}%${p[7] ? ` · ${p[7]}` : ''}`, cap, unit: 'L/s',
      util: { today: q('today') / cap, com: com.q / cap, bo: bo.q / cap }, room, people, out: runOut(q, () => cap), relief: ln ? [lineRelief(ln)] : [],
      // The census flow alone over the full-pipe capacity: most likely the published slope (or a
      // parallel pipe the trace does not follow), not a sewer surcharging in dry weather.
      check: none >= cap };
  }
  // Pumping station on a traced catchment's outlet.
  function psCons(a) {
    const M = state.svcModel, sp = spsOf(a), l = M && M.cum.get(a.id); if (!sp || !l) return null;
    const flow = ll => (M.pdwf(ll, 1) + M.ii(ll)) * 1e6 / 86400;
    const at = y => y === 'today' ? { ...l, approved: 0, proposed: 0, japproved: 0, jproposed: 0 } : y === 'committed' ? { ...l, proposed: 0, jproposed: 0 } : atYear(l, y);
    const q = y => flow(at(y)), cap = sp.firmLs, com = at('committed'), room = cap - flow(com);
    const people = peopleFor(room, x => flow({ ...com, approved: com.approved + x }) - flow(com));
    const words = s => spsKey(s).replace(/\b(sewer|sanitary|sewage|pumping|station|ps|\d+)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const k = words(sp.name);
    const facs = state.dcInfra ? state.dcInfra.wastewater.facilities.filter(f => f.kind === 'pumping_station' && words(f.name) && (k.includes(words(f.name)) || words(f.name).includes(k))) : [];
    return { id: `ps:${a.id}`, sys: 'ww', kind: 'ps', a, name: `${sp.name} pumping station`, sub: `firm ${fmtNum(cap)} L/s (2020 Master Plan) · peak wet`, cap, unit: 'L/s', note: spsNote(sp),
      util: { today: q('today') / cap, com: flow(com) / cap, bo: q(null) / cap }, room, people, out: runOut(q, () => cap), relief: facs.map(f => facRelief(f)) };
  }
  // Wastewater treatment plant: average dry weather against 90% of rated capacity.
  function plantCons(pl) {
    const M = state.svcModel, cap = M && M.plantCap(pl); if (!cap) return null;
    const A0 = cap.committed - cap.existing, P0 = cap.buildout - cap.committed;
    const q = y => { if (y === 'today') return cap.existing; if (y === 'committed') return cap.committed; if (y == null) return cap.buildout; const { fa, fp } = hzFrac(y); return cap.existing + A0 * fa + P0 * fp; };
    const steps = (state.dcInfra && state.dcInfra.plantCapacity[pl]) || [];
    const ratedAt = y => steps.reduce((r, s) => y >= s.year ? Math.max(r, s.mld) : r, cap.rated);
    const lim = PLANT_TRIGGER * cap.rated, room = lim - cap.committed;
    const fac = state.dcInfra && state.dcInfra.wastewater.facilities.find(f => f.kind === 'plant' && f.plant === pl);
    const after = runOut(q, y => PLANT_TRIGGER * ratedAt(y === 'today' ? THIS_YEAR : y));
    return { id: `plant:${pl}`, sys: 'ww', kind: 'plant', pl, name: cap.name, sub: `rated ${fmt1(cap.rated)} ML/d · ${Math.round(PLANT_TRIGGER * 100)}% expansion trigger (2020 Master Plan) · average dry`, cap: lim, unit: 'ML/d',
      util: { today: cap.existing / lim, com: cap.committed / lim, bo: cap.buildout / lim }, room, people: room * 1e6 / (cap.perPerson || 1), out: runOut(q, () => lim), outAfter: steps.length ? after : undefined,
      relief: steps.map(s => ({ kind: 'step', y: s.year, fc: fac, text: `${s.year} ${s.mld} ML/d${s.proj ? ` (${s.proj})` : ''}` })) };
  }
  // Water: max day of a set of zones by year (ML/d).
  function zonesMax(ids, y) {
    const M = state.svcModel; let t = 0;
    for (const id of ids) {
      const l = M.zones.get(id); if (!l) continue;
      const ll = y === 'today' ? { ...l, approved: 0, proposed: 0, japproved: 0, jproposed: 0 } : y === 'committed' ? { ...l, proposed: 0, jproposed: 0 } : atYear(l, y);
      t += M.wMax(M.total(ll), M.jobs(ll));
    }
    return t;
  }
  const perPersonMax = () => state.svcModel.wMax(1, 0);
  const lakeZones = () => state.servicing.zones.filter(z => zLevel(z.zone) != null && !wellSystem[z.zone]).map(z => z.id);
  function waterPlantCons(zone) {
    const R = state.reports; if (!R || !state.svcModel) return null;
    if (wellSystem[zone.zone]) {
      const s = R.water.caledon.find(x => x.name === wellSystem[zone.zone]); if (!s) return null;
      const ids = [zone.id], base = s.maxDayM3d / 1000, rated = s.ratedM3d / 1000, lim = PLANT_TRIGGER * rated;
      const q = y => base + zonesMax(ids, y) - zonesMax(ids, 'today');
      const room = lim - q('committed');
      const wells = state.dcInfra ? state.dcInfra.water.facilities.filter(f => f.kind === 'well' && s.communities.includes(f.name)) : [];
      return { id: `wsys:${s.name}`, sys: 'water', kind: 'wplant', name: `${s.name} wells`, sub: `rated ${fmt1(rated)} ML/d · 2025 max day ${fmt1(base)} ML/d + growth`, cap: lim, unit: 'ML/d', zones: ids,
        util: { today: q('today') / lim, com: q('committed') / lim, bo: q(null) / lim }, room, people: room / perPersonMax(), out: runOut(q, () => lim), relief: wells.map(f => facRelief(f)) };
    }
    const sp = R.water.southPeel, ids = lakeZones(), rated = sp.plants.reduce((t, p) => t + p.ratedMLd, 0), lim = PLANT_TRIGGER * rated;
    const q = y => sp.maxDayMLd + zonesMax(ids, y) - zonesMax(ids, 'today');
    const room = lim - q('committed');
    const facs = state.dcInfra ? state.dcInfra.water.facilities.filter(f => f.kind === 'plant') : [];
    return { id: 'wsys:southPeel', sys: 'water', kind: 'wplant', name: 'South Peel water treatment (A.P. Kennedy + Lorne Park)', sub: `rated ${fmt1(rated)} ML/d · 2025 max day ≤ ${fmt1(sp.maxDayMLd)} ML/d (incl. York supply) + growth`, cap: lim, unit: 'ML/d', zones: ids,
      util: { today: q('today') / lim, com: q('committed') / lim, bo: q(null) / lim }, room, people: room / perPersonMax(), out: runOut(q, () => lim), relief: facs.map(f => facRelief(f, /treatment expansion/i)) };
  }
  // Storage: master plan required vs available (interpolated by year), at the facility's zone.
  function storageCons() {
    const mp = state.reports && state.reports.masterPlan; if (!mp || !state.dcInfra) return [];
    const ys = mp.storageYears;
    const interp = (arr, y) => { if (y <= ys[0]) return arr[0]; for (let k = 1; k < ys.length; k++) if (y <= ys[k]) return arr[k - 1] + (arr[k] - arr[k - 1]) * (y - ys[k - 1]) / (ys[k] - ys[k - 1]); return arr[arr.length - 1]; };
    return mp.storage.map(r => {
      const nm = r.facility.replace(/ \(.*$/, '').replace(/ (Reservoir|Elevated Tank)$/, '');
      const fc = state.dcInfra.water.facilities.find(f => f.name === nm);
      const zid = fc && fc.g ? PeelAreas.locate(state.servicing.zones, fc.g[0], fc.g[1])[0] : null;
      const req = y => interp(r.required, y === 'today' || y === 'committed' ? THIS_YEAR : y == null ? hz.end : y), avail = y => interp(r.available, y === 'today' || y === 'committed' ? THIS_YEAR : y == null ? hz.end : y);
      const now = avail(THIS_YEAR) || Math.max(...r.available);
      const room = avail('today') > 0 ? avail('today') - req('today') : null;
      return { id: `stor:${nm}`, sys: 'water', kind: 'storage', name: r.facility, sub: `required vs available storage (2020 Master Plan forecast)${zid ? ` · in ${svcById.get(zid).name}` : ''}`, cap: now, unit: 'ML', zones: zid ? [zid] : [],
        util: { today: req('today') / (avail('today') || now), com: req('today') / (avail('today') || now), bo: req(null) / (avail(null) || now) }, room, people: room == null ? 0 : room * 1e6 / (1.25 * 0.25 * perPersonMax() * 1e6),
        out: (() => { for (const y of yearsAhead()) if (avail(y) > 0 && req(y) > avail(y)) return y; return null; })(), relief: fc ? [facRelief(fc, /reservoir|tank/i)] : [], mp: true };
    });
  }
  // Supply: large mains across the boundary into zone level L carry the max day of every lake-based
  // zone at level L and above (rough: 1.5 m/s, valves and pumping not modelled).
  function supplyCons(b) {
    const L = zLevel(b.upper), ids = lakeZones().filter(id => zLevel(svcById.get(id).zone) >= L);
    const q = y => zonesMax(ids, y), cap = b.capMLd, room = cap - q('committed');
    const lines = state.dcInfra ? state.dcInfra.water.lines.filter(ln => ln.y && ln.y >= THIS_YEAR && (ln.k === 'transmission') && (() => {
      let lo = false, hi = false; for (let k = 0; k < ln.g.length; k += 3) { const z = PeelAreas.locate(state.servicing.zones, ln.g[k][0], ln.g[k][1])[0]; const lv = z && zLevel(svcById.get(z).zone); if (lv === L - 1 || svcById.get(z || '')?.zone === b.lower) lo = true; if (lv === L) hi = true; } return lo && hi;
    })()) : [];
    const byP = new Map(); for (const ln of lines) { const k = ln.p || ln.c; if (!byP.has(k) || (ln.d || 0) > (byP.get(k).d || 0)) byP.set(k, ln); }
    const pss = state.dcInfra ? state.dcInfra.water.facilities.filter(f => (f.kind === 'pumping_station' || f.kind === 'reservoir') && f.g && (() => { const z = PeelAreas.locate(state.servicing.zones, f.g[0], f.g[1])[0]; const lv = z && zLevel(svcById.get(z).zone); return lv === L - 1 || lv === L; })()) : [];
    return { id: `sup:${b.lower}|${b.upper}`, sys: 'water', kind: 'supply', name: `Supply into zone ${b.upper} and above`, sub: `${b.mains.length} large mains cross from zone ${b.lower} (${b.mains.map(m => m.d).join(', ')} mm) ≈ ${fmtNum(cap)} ML/d at 1.5 m/s · rough`, cap, unit: 'ML/d', zones: ids,
      util: { today: q('today') / cap, com: q('committed') / cap, bo: q(null) / cap }, room, people: room / perPersonMax(), out: runOut(q, () => cap),
      relief: [...[...byP.values()].sort((a, b) => a.y - b.y).map(lineRelief), ...pss.map(f => facRelief(f, /pumping|expansion/i))].sort((a, b) => (a.y || 9999) - (b.y || 9999)) };
  }
  // Status of a constraint: ok (lasts to build-out), planned (relief before it runs out), gap.
  function consStatus(c) {
    if (c.check) return 'check';
    if (c.out == null && !(c.outAfter != null)) return 'ok';
    const ry = c.relief.map(r => r.y).filter(Boolean);
    const outY = c.out === 'today' ? THIS_YEAR : c.out;
    if (c.kind === 'plant' && c.out != null) return c.outAfter != null ? 'gap' : (ry.length && Math.min(...ry) <= outY ? 'planned' : 'gap');
    if (!ry.length) return 'gap';
    return Math.min(...ry) <= outY ? 'planned' : 'gap';
  }
  function scenarioKey() { return `${SEW.key}|${JSON.stringify(hz)}|${capYear}|${state.svcModel && state.svcModel.Y}|${svcOpt.ww}|${svcOpt.md}`; }
  function cached(id, fn) {
    const k = scenarioKey(); if (DCN.key !== k) { DCN.cache.clear(); DCN.key = k; }
    if (!DCN.cache.has(id)) DCN.cache.set(id, fn());
    return DCN.cache.get(id);
  }
  // Constraints a development relies on.
  function devNeeds(p) {
    const f = svcFacts(p); if (!f) return null;
    const out = [];
    // Sewers on its path: pipes at 90%+ of full capacity by build-out, grouped by the DC main that
    // relieves them (or by run when none does); the tightest of each group.
    if (SEW.data && p.lat != null) {
      sewerGrowth(); const k = SEW.growth.devPipe.get(p) ?? nearestPipe(p.lng, p.lat);
      const groups = new Map(); let run = 0, prevFlag = false;
      for (let i = k, hop = 0; i >= 0 && hop < 2000; i = SEW.data.pipes[i][3], hop++) {
        const c = cached(`pipe:${i}`, () => pipeCons(i));
        const flag = c && c.util.bo >= 0.9; if (!flag) { prevFlag = false; continue; }
        const ln = c.relief[0] && c.relief[0].ln, key = ln ? `ln:${ln.p || ln.c}` : `run:${prevFlag ? run : ++run}`;
        prevFlag = true;
        const g = groups.get(key) || { list: [] }; g.list.push(c); groups.set(key, g);
      }
      for (const g of groups.values()) { const ok = g.list.filter(x => !x.check), c = (ok.length ? ok : g.list).slice().sort((a, b) => a.people - b.people)[0]; out.push({ ...c, id: `dgrp:${c.i}`, n: g.list.length, members: g.list.map(x => x.i) }); }
    }
    for (const a of f.path) { const c = a.kind === 'ps' && cached(`ps:${a.id}`, () => psCons(a)); if (c) out.push(c); }
    if (f.pl && f.pl !== 'Toronto') { const c = cached(`plant:${f.pl}`, () => plantCons(f.pl)); if (c) out.push(c); }
    if (f.z) {
      const c = cached(wellSystem[f.z.zone] ? `wsys:${f.z.zone}` : 'wsys:lake', () => waterPlantCons(f.z)); if (c) out.push(c);
      for (const s of cached('storage', storageCons)) if (s.zones.includes(f.z.id)) out.push(s);
      const L = zLevel(f.z.zone);
      if (DCN.supply && L != null && !wellSystem[f.z.zone]) {
        const sup = DCN.supply.boundaries.filter(b => zLevel(b.upper) <= L).map(b => cached(`sup:${b.lower}|${b.upper}`, () => supplyCons(b)));
        if (sup.length) out.push(sup.sort((a, b) => a.people - b.people)[0]);
      }
    }
    const order = { gap: 0, planned: 1, check: 2, ok: 3 };
    for (const c of out) c.status = consStatus(c);
    return out.sort((a, b) => order[a.status] - order[b.status] || (a.out === 'today' ? 0 : a.out || 9999) - (b.out === 'today' ? 0 : b.out || 9999) || a.people - b.people);
  }
  const ppuOf = p => { const e = p && D.estimate([p], state.criteria, 'all', jobsOf); return e && e.totalUnits > 0 && e.population > 0 ? e.population / e.totalUnits : (state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment; };
  const outText = c => c.out === 'today' ? '<strong>already</strong>' : c.out == null ? `after ${hz.end}` : `≈${c.out}`;
  const STATUS = { gap: ['dcn-gap', 'Needed before the DC project'], planned: ['dcn-ok', 'DC project in time'], check: ['dcn-check', 'Check the data: the existing flow alone is over the full-pipe capacity from the published slope'], ok: ['dcn-fine', 'Room to build-out'] };
  function roomText(c, ppu) {
    if (c.room == null) return '<span class="muted">new facility</span>';
    if (c.room <= 0) return `<strong>none</strong> <small>over by ${c.unit === 'L/s' ? fmtNum(Math.round(-c.room)) : fmt1(-c.room)} ${c.unit} (${Math.round((c.util.com - 1) * 100)}%)</small>`;
    return `${fmtNum(roundPop(c.people))} people<small>≈${fmtNum(Math.round(c.people / ppu))} units</small>`;
  }
  const reliefHTML = c => c.relief.length ? c.relief.slice(0, 3).map(r => `<button type="button" class="btn small link" data-dcn-relief="${esc(c.id)}|${c.relief.indexOf(r)}">${esc(r.text)}</button>`).join('<br>') + (c.relief.length > 3 ? ` <small>+${c.relief.length - 3}</small>` : '') : '<span class="muted">none on the 2026 DC map</span>';
  const consName = c => `${c.kind === 'pipe' ? `<button type="button" class="btn small link" data-pipe="${c.i}">${esc(c.name)}</button>` : `<button type="button" class="btn small link" data-dcn-cons="${esc(c.id)}">${esc(c.name)}</button>`}${c.kind === 'pipe' ? ` <button type="button" class="btn small link dcn-who" data-dcn-cons="${esc(c.id)}">who relies</button>` : ''}<small>${esc(c.sub)}${c.n > 1 ? ` · ${c.n} pipes over 90%` : ''}${c.mp ? '' : ` · ${Math.round(c.util.com * 100)}% committed → ${Math.round(c.util.bo * 100)}% build-out`}</small>`;
  function needsTable(list, ppu, opts = {}) {
    return `<table class="dt dcn-table"><thead><tr><th>${opts.first || 'Existing capacity'}</th><th>Room after approved</th><th>Runs out</th><th>DC relief (construction)</th></tr></thead><tbody>
      ${list.map(reg).map(c => `<tr class="${STATUS[c.status][0]}"><td>${c.sys === 'water' ? '💧 ' : ''}${consName(c)}</td><td data-l="Room after approved">${roomText(c, ppu)}</td><td data-l="Runs out">${outText(c)}${c.outAfter != null ? `<small>again ${c.outAfter === 'today' ? 'now' : `≈${c.outAfter}`} with the expansions</small>` : ''}<small>${esc(STATUS[c.status][1])}</small></td><td data-l="DC relief">${reliefHTML(c)}</td></tr>`).join('')}</tbody></table>`;
  }
  function dcNeedsHTML(p) {
    if (!state.svcModel) return '';
    const list = devNeeds(p); if (!list) return '<p class="small muted">No servicing demand to compare.</p>';
    if (!list.length) return '<p class="small muted">No sewer on its path reaches 90% of capacity by build-out and no tabled facility applies.</p>';
    const ppu = ppuOf(p), gaps = list.filter(c => c.status === 'gap').length, main = list.filter(c => c.status !== 'ok'), rest = list.filter(c => c.status === 'ok');
    const nChk = list.filter(c => c.status === 'check').length;
    return `<p class="small">${gaps ? `<strong class="dcn-gap-t">${gaps} constraint${gaps === 1 ? '' : 's'} run${gaps === 1 ? 's' : ''} out before a DC project relieves ${gaps === 1 ? 'it' : 'them'}.</strong>` : 'Every constraint has room to build-out or a DC project before it runs out.'} Room in units at this development's ${ppu.toFixed(1)} persons per unit.${nChk ? ` <span class="muted">${nChk} sewer group${nChk === 1 ? '' : 's'} flagged “check the data”: the census flow alone exceeds the full-pipe capacity from the published slope, so the slope (or a parallel pipe) is more likely than a real shortfall.</span>` : ''}</p>
      ${main.length ? needsTable(main, ppu) : ''}
      ${rest.length ? `<details class="dcn-more"${main.length ? '' : ' open'}><summary class="small">${fmtNum(rest.length)} with room to build-out (tightest ${Math.round(Math.max(...rest.map(c => c.util.bo)) * 100)}% of capacity)</summary>${needsTable(rest, ppu)}</details>` : ''}
      <p class="small"><button type="button" class="btn small link" data-dcn-all="1">All DC timing →</button></p>
      <p class="small muted">Room = capacity − (existing + built + approved), in people at Peel design criteria; runs out = the year approved and proposed growth reach it (${esc(scenarioText())}). Sewers: full-pipe capacity at peak wet (pipe screen); pumping stations: firm capacity; plants: ${Math.round(PLANT_TRIGGER * 100)}% of rated. Water supply is a rough conveyance estimate: water pumping station capacities are not published. A screen, not a hydraulic model.</p>`;
  }
  // Developments relying on a constraint (growth since the census: built, approved, proposed).
  function consDevs(c) {
    const rows = [], water = c.sys === 'water';
    const members = c.kind === 'pipe' ? new Set(c.members || [c.i]) : null;
    const zones = c.zones ? new Set(c.zones) : null;
    if (members) sewerGrowth();
    for (const p of state.projects.concat(state.whatifs || [])) {
      const lay = svcLayerOf(p); if (!['built', 'approved', 'proposed'].includes(lay)) continue;
      let hit = false;
      if (members) { const k = SEW.growth.devPipe.get(p); if (k == null) continue; for (let i = k, hop = 0; i >= 0 && hop < 2000; i = SEW.data.pipes[i][3], hop++) if (members.has(i)) { hit = true; break; } }
      else if (zones) hit = svcIds(p, 'pz').some(id => zones.has(id));
      else {
        let d = svcById.get(svcIds(p, 'dr')[0]); const seen = new Set();
        if (c.kind === 'plant') hit = !!d && d.plant === c.pl;
        else while (d && !seen.has(d.id)) { if (d.id === c.a.id) { hit = true; break; } seen.add(d.id); d = d.downstream && svcById.get(d.downstream); }
      }
      if (!hit) continue;
      const e = D.estimate([p], state.criteria, 'all', jobsOf); if (!(e.population > 0 || e.employment.jobs > 0)) continue;
      rows.push({ p, lay, e, q: water ? e.combined.water.maxDay : e.combined.wastewater.wetPeak });
    }
    return rows.sort((a, b) => b.q - a.q);
  }
  function consDevsHTML(cs, extra = []) {
    const seen = new Map();
    for (const c of cs) for (const r of consDevs(c)) if (!seen.has(r.p.key)) seen.set(r.p.key, r);
    for (const r of extra) if (!seen.has(r.p.key)) seen.set(r.p.key, r);
    const rows = [...seen.values()].sort((a, b) => b.q - a.q), LIMIT = 60, water = cs.length && cs.every(c => c.sys === 'water');
    if (!rows.length) return '<p class="small muted">No development since the census relies on it.</p>';
    const by = k => rows.filter(r => r.lay === k);
    return `<div class="chips">${['built', 'approved', 'proposed'].map(k => `<span class="chip"><span class="lg-sw" style="--mk:${layerColors()[k]}"></span>${esc(LAYER_NAME[k])} ${fmtNum(by(k).length)} · ${fmtNum(roundPop(by(k).reduce((t, r) => t + r.e.population, 0)))} people</span>`).join('')}</div>
      <table class="dt loads-table"><caption>${fmtNum(rows.length)} developments relying on it, largest ${water ? 'max day' : 'peak wet weather'} first</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>${water ? 'Max day' : 'Peak wet'}</th></tr></thead>
        <tbody>${rows.slice(0, LIMIT).map(r => `<tr class="ld-row" data-dev="${esc(r.p.key)}" tabindex="0"><td>${dot(r.p.phase)} ${esc(r.p.title)}<small><span class="lg-sw" style="--mk:${layerColors()[r.lay]}"></span>${esc(LAYER_NAME[r.lay])} · ${esc(r.p.municipality)}${r.conn ? ' · connects to it' : ''}</small></td><td>${fmtNum(Math.round(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.q)}</td></tr>`).join('')}</tbody></table>
      ${rows.length > LIMIT ? `<p class="small muted">+ ${fmtNum(rows.length - LIMIT)} smaller developments.</p>` : ''}`;
  }
  const reg = c => { (DCN.reg || (DCN.reg = new Map())).set(c.id, c); return c; };
  // Constraints a DC main or facility relieves.
  function dcItemCons(it) {
    const out = [];
    if (it.ln) {
      const ln = it.ln, proj = ln.p || ln.c, lines = state.dcInfra[ln.sys].lines.filter(x => (x.p || x.c) === proj);
      if (ln.sys === 'wastewater' && SEW.data) {
        const b = lines.reduce((a, x) => [Math.min(a[0], x.bbox[0]), Math.min(a[1], x.bbox[1]), Math.max(a[2], x.bbox[2]), Math.max(a[3], x.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]), pad = 0.003;
        const members = [];
        SEW.data.pipes.forEach((p, i) => { const c = p[10]; if (c[0] < b[0] - pad || c[0] > b[2] + pad || c[1] < b[1] - pad || c[1] > b[3] + pad) return; const r = pipeReliefOf(i); if (r && (r.p || r.c) === proj) members.push(i); });
        if (members.length) {
          const cs = members.map(i => cached(`pipe:${i}`, () => pipeCons(i))).filter(Boolean);
          if (cs.length) { const ok = cs.filter(x => !x.check), c = (ok.length ? ok : cs).slice().sort((a, b) => b.util.bo - a.util.bo)[0]; out.push(reg({ ...c, id: `pipegrp:${proj}`, n: members.length, members, sub: `${c.sub} · tightest of ${members.length} existing pipes it runs along` })); }
        }
      }
      if (ln.sys === 'water' && DCN.supply) for (const bd of DCN.supply.boundaries) { const c = cached(`sup:${bd.lower}|${bd.upper}`, () => supplyCons(bd)); if (c.relief.some(r => r.ln && (r.ln.p || r.ln.c) === proj)) out.push(reg(c)); }
    } else if (it.fc) {
      const fc = it.fc;
      if (fc.sys === 'wastewater' && fc.kind === 'plant' && fc.plant) { const c = cached(`plant:${fc.plant}`, () => plantCons(fc.plant)); if (c) out.push(reg(c)); }
      if (fc.sys === 'wastewater' && fc.kind === 'pumping_station') for (const a of state.servicing.drainage) { if (a.kind !== 'ps') continue; const c = cached(`ps:${a.id}`, () => psCons(a)); if (c && c.relief.some(r => r.fc === fc)) out.push(reg(c)); }
      if (fc.sys === 'water') {
        if (fc.kind === 'plant') { const c = cached('wsys:lake', () => waterPlantCons({ zone: '1' })); if (c) out.push(reg(c)); }
        for (const z of ['AV13', 'CE9']) { const zz = state.servicing.zones.find(x => x.zone === z); const c = zz && cached(`wsys:${z}`, () => waterPlantCons(zz)); if (c && c.relief.some(r => r.fc === fc)) out.push(reg(c)); }
        for (const s of cached('storage', storageCons)) if (s.relief.some(r => r.fc === fc)) out.push(reg(s));
        if (DCN.supply) for (const bd of DCN.supply.boundaries) { const c = cached(`sup:${bd.lower}|${bd.upper}`, () => supplyCons(bd)); if (c.relief.some(r => r.fc === fc)) out.push(reg(c)); }
      }
    }
    for (const c of out) c.status = consStatus(c);
    return out;
  }
  // Developments that would connect to a planned main (outside the existing network, within 1 km).
  function dcConnectors(ln) {
    const proj = ln.p || ln.c, rows = [];
    for (const p of state.projects) {
      const lay = svcLayerOf(p); if (!['built', 'approved', 'proposed'].includes(lay) || p.lat == null) continue;
      const out = ln.sys === 'wastewater' ? !(p.dr && p.dr.length) : !(p.pz && p.pz.length); if (!out) continue;
      const n = dcNearest(ln.sys, [p.lng, p.lat], DC_CONNECT_M); if (!n || (n.ln.p || n.ln.c) !== proj) continue;
      const e = D.estimate([p], state.criteria, 'all', jobsOf); if (!(e.population > 0 || e.employment.jobs > 0)) continue;
      rows.push({ p, lay, e, q: ln.sys === 'water' ? e.combined.water.maxDay : e.combined.wastewater.wetPeak, conn: true });
    }
    return rows;
  }
  function dcNeedsSection(it) {
    if (!state.svcModel) return '';
    const cs = dcItemCons(it), conn = it.ln ? dcConnectors(it.ln) : [];
    let zoneRows = [];
    // A water facility or main with no tabled constraint: the developments in its pressure zone.
    let zoneNote = '';
    if (!cs.length && ((it.fc && it.fc.sys === 'water' && it.fc.g) || (it.ln && it.ln.sys === 'water'))) {
      const zid = it.fc ? PeelAreas.locate(state.servicing.zones, it.fc.g[0], it.fc.g[1])[0] : dcTarget(it.ln);
      if (zid) { const z = reg({ id: `zone:${zid}`, sys: 'water', kind: 'zone', zones: [zid] }); zoneRows = consDevs(z); zoneNote = `<p class="small muted">No published capacity to compare: developments in ${esc(svcById.get(zid).name)} (${it.fc ? 'where it is' : 'the zone it serves'}).</p>`; }
    }
    const ppu = (state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    return `<h3 class="sub-title" data-info="dc-needs">What it relieves</h3>
      ${cs.length ? `${needsTable(cs, ppu)}<p class="small muted">Room in units at ${ppu} persons per unit (apartment).</p>` : `<p class="small muted">${it.ln && it.ln.sys === 'wastewater' ? 'It does not run along an existing sanitary sewer of 300 mm or more (a new trunk or a local main).' : 'No tabled capacity matched to it.'}</p>`}
      ${conn.length ? `<p class="small"><strong>${fmtNum(conn.length)} development${conn.length === 1 ? '' : 's'}</strong> outside the existing network would connect to it.</p>` : ''}
      ${zoneNote}
      <h3 class="sub-title">Developments relying on it</h3>
      ${consDevsHTML(cs.filter(c => c.kind !== 'wplant' || cs.length === 1), [...conn, ...zoneRows])}`;
  }
  // Panel for a planned main (tap on the map or a relief link).
  function showDcLine(ln) {
    const proj = ln.p || ln.c, parts = state.dcInfra[ln.sys].lines.filter(x => (x.p || x.c) === proj);
    const len = parts.reduce((t, x) => { for (let i = 1; i < x.g.length; i++) t += dcM(x.g[i - 1], x.g[i]); return t; }, 0);
    const ys = parts.map(x => x.y).filter(Boolean);
    $('#detail-body').innerHTML = `
      <div class="head"><h3>${esc(DC_KIND[ln.k][0])}${ln.d ? ` · ${ln.d} mm` : ''}</h3><div class="m">${ln.p ? `Project ${esc(ln.p)}` : 'No project label'} · construction ${ys.length ? (Math.min(...ys) === Math.max(...ys) ? ys[0] : `${Math.min(...ys)}–${Math.max(...ys)}`) : 'year not labelled'} · ${unit(fmtNum(Math.round(len / 10) * 10), 'm')} · ${ln.s === 'approved' ? 'approved 2026' : 'proposed'} · 2026 DC capital map (draft)</div></div>
      ${ln.n ? `<p class="small">${esc(ln.n)}</p>` : ''}
      ${dcNeedsSection({ ln })}
      ${exportBar('loads')}`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'dcitem'; $('#detail').scrollTop = 0;
    loadsOf = { dc: { ln } };
  }
  // All constraints in the network, for the DC timing table.
  function allNeeds() {
    return cached('all', () => {
      const out = [];
      if (SEW.data) {
        const flagged = [];
        SEW.data.pipes.forEach((p, i) => { if (p[2] && pipeFlow(i, null).q >= 0.9 * p[2]) flagged.push(i); });
        const fset = new Set(flagged), grp = new Map(), rootOf = new Map();
        // Group: same relieving project, else a run of consecutive unrelieved pipes.
        const relief = i => { const r = pipeReliefOf(i); return r ? `ln:${r.p || r.c}` : null; };
        const find = i => { let r = i; while (rootOf.has(r) && rootOf.get(r) !== r) r = rootOf.get(r); return r; };
        for (const i of flagged) { rootOf.set(i, i); }
        for (const i of flagged) { const n = SEW.data.pipes[i][3]; if (fset.has(n) && !relief(i) && !relief(n)) rootOf.set(find(i), find(n)); }
        for (const i of flagged) { const k = relief(i) || `run:${find(i)}`; (grp.get(k) || grp.set(k, []).get(k)).push(i); }
        for (const [k, members] of grp) {
          const cs = members.map(i => cached(`pipe:${i}`, () => pipeCons(i))).filter(Boolean); if (!cs.length) continue;
          const ok = cs.filter(x => !x.check), c = (ok.length ? ok : cs).slice().sort((a, b) => a.people - b.people)[0];
          out.push(reg({ ...c, id: `grp:${k}`, n: members.length, members }));
        }
      }
      for (const a of state.servicing.drainage) { const c = a.kind === 'ps' && cached(`ps:${a.id}`, () => psCons(a)); if (c) out.push(reg(c)); }
      for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) { const c = cached(`plant:${pl}`, () => plantCons(pl)); if (c) out.push(reg(c)); }
      { const c = cached('wsys:lake', () => waterPlantCons({ zone: '1' })); if (c) out.push(reg(c)); }
      for (const z of ['AV13', 'CE9']) { const zz = state.servicing.zones.find(x => x.zone === z); const c = zz && cached(`wsys:${z}`, () => waterPlantCons(zz)); if (c) out.push(reg(c)); }
      for (const s of cached('storage', storageCons)) out.push(reg(s));
      if (DCN.supply) for (const bd of DCN.supply.boundaries) out.push(reg(cached(`sup:${bd.lower}|${bd.upper}`, () => supplyCons(bd))));
      for (const c of out) c.status = consStatus(c);
      const order = { gap: 0, planned: 1, check: 2, ok: 3 }, yr = c => c.out === 'today' ? 0 : c.out || 9999;
      return out.sort((a, b) => order[a.status] - order[b.status] || yr(a) - yr(b) || a.people - b.people);
    });
  }
  let dcnFilter = 'gap';
  function showDcTiming() {
    if (!state.svcModel) return;
    const all = allNeeds(), ppu = (state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    const sysF = dcnFilter.split(':')[1] || 'all', stF = dcnFilter.split(':')[0];
    const list = all.filter(c => (stF === 'all' || c.status === stF) && (sysF === 'all' || c.sys === sysF));
    const n = k => all.filter(c => c.status === k).length;
    $('#detail-body').innerHTML = `
      <div class="head"><h3 data-info="dc-needs">DC timing</h3><div class="m">Existing capacity against the 2026 DC capital program (draft) · ${esc(scenarioText())}</div></div>
      <div class="chips">${[['gap', `Needed before the DC project ${n('gap')}`], ['planned', `DC project in time ${n('planned')}`], ['check', `Check the data ${n('check')}`], ['ok', `Room to build-out ${n('ok')}`], ['all', `All ${all.length}`]].map(([k, t]) => `<button type="button" class="chip btn small${stF === k ? ' on' : ''}" data-dcn-filter="${k}:${sysF}">${esc(t)}</button>`).join('')}
        <span class="seg">${[['all', 'Both'], ['ww', 'Wastewater'], ['water', 'Water']].map(([k, t]) => `<button type="button" class="btn small${sysF === k ? ' on' : ''}" data-dcn-filter="${stF}:${k}">${t}</button>`).join('')}</span></div>
      ${exportBar('loads')}
      ${list.length ? needsTable(list.slice(0, 150), ppu) : '<p class="small muted">Nothing in this group.</p>'}
      ${list.length > 150 ? `<p class="small muted">+ ${fmtNum(list.length - 150)} more.</p>` : ''}
      <p class="small"><span class="muted">Tap a name for what loads it; tap a DC project for what it relieves and who relies on it.</span></p>
      <p class="small muted">Sewers: pipes reaching 90% of full capacity by build-out, grouped by the DC main that runs along them (or by run); the tightest pipe of each group is shown. Room in units at ${ppu} persons per unit (apartment). Room = capacity − (existing + built + approved); runs out = the year approved and proposed growth reach it, phased as in Horizon years. Plants at ${Math.round(PLANT_TRIGGER * 100)}% of rated; pumping stations at firm capacity; storage from the 2020 Master Plan forecast; water supply into the upper zones is a rough conveyance estimate (1.5 m/s in the large mains crossing each zone boundary; water pumping station capacities are not published). A screen, not a hydraulic model.</p>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'dctiming'; $('#detail').scrollTop = 0;
    loadsOf = { dc: { timing: true } };
  }
  function showConsDevs(c) {
    const ppu = (state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    $('#detail-body').innerHTML = `<div class="head"><h3>${esc(c.name)}</h3><div class="m">${esc(c.sub)}</div></div>
      ${needsTable([c], ppu)}${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ''}
      <h3 class="sub-title">Developments relying on it</h3>${consDevsHTML([c])}
      <p class="small"><button type="button" class="btn small link" data-dcn-all="1">← DC timing</button></p>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'dcitem'; $('#detail').scrollTop = 0;
    loadsOf = { dc: { cons: c.id } };
  }
  function showDcBack(b) { if (b.ln) showDcLine(b.ln); else if (b.fc) showFacility(b.fc); else if (b.cons && DCN.reg && DCN.reg.get(b.cons)) showConsDevs(DCN.reg.get(b.cons)); else showDcTiming(); }
  $('#detail-body').addEventListener('click', e => {
    const f = e.target.closest('[data-dcn-filter]'); if (f) { dcnFilter = f.dataset.dcnFilter; return showDcTiming(); }
    if (e.target.closest('[data-dcn-all]')) { loadSewers(); return showDcTiming(); }
    const cn = e.target.closest('[data-dcn-cons]'); if (cn && DCN.reg && DCN.reg.get(cn.dataset.dcnCons)) return showConsDevs(DCN.reg.get(cn.dataset.dcnCons));
    const r = e.target.closest('[data-dcn-relief]'); if (!r) return;
    const [id, k] = r.dataset.dcnRelief.split('|'), c = DCN.reg && DCN.reg.get(id), rl = c && c.relief[+k]; if (!rl) return;
    if (rl.ln) { showDcLine(rl.ln); map.fitBounds(L.latLngBounds(rl.ln.g.map(([x, y]) => [y, x])), { maxZoom: 15, padding: [30, 30] }); if (!dcOn.on) setDcOn({ on: true, sys: 'both' }); }
    else if (rl.fc) { showFacility(rl.fc); if (rl.fc.g) map.setView([rl.fc.g[1], rl.fc.g[0]], Math.max(map.getZoom(), 14)); }
  });

  $('#btn-dc-geojson').onclick = () => { if (state.dcInfra) download('peel-2026-dc-planned-works.geojson', JSON.stringify(dcGeoJSON()), 'application/geo+json'); };


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
    // Newest first: the census at or before the timeline's start; with no year range, the latest.
    if (!timeActive() || state.yearFrom == null) return cs[0];
    return cs.find(c => c.year <= state.yearFrom) || cs[cs.length - 1];
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
    renderForecast(bc);
    $('#c-note').textContent = `${name} · ${Y} Census baseline (${why}) · built = permits completed since census day (${censusDay(bc.date)})${gr.built.estimatedDates ? '; Brampton and Caledon completion dates estimated from issue date' : ''}; approved = committed growth; proposed = applications in pre-consultation or review; people at Peel persons-per-unit · other filters ignored`;
  }

  // Growth in the application pipeline against the 2051 growth allocated to each municipality
  // (Peel Land Needs Assessment, draft municipal allocation): how much of the forecast growth
  // is already built, approved or proposed, and how much is still to be planned for.
  function renderForecast(bc) {
    const box = $('#c-forecast'), F = state.reports && state.reports.forecast2051;
    if (!box) return;
    if (!F || state.daCtx) { box.innerHTML = ''; return; }
    const munis = Object.keys(F.municipalities).filter(m => !state.muni || m === state.muni);
    const pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const rows = munis.map(m => {
      const f = F.municipalities[m], projects = state.projects.filter(p => p.municipality === m && p.phase !== 'cancelled');
      const gr = PeelAreas.growthSince(projects, { muni: m }, bc.date, state.criteria), j = svcJobs(projects, bc.date);
      return { m, fp: f.pop2051 - f.pop2021, fu: f.units2051 - f.units2021, fj: f.jobs2051 - f.jobs2021,
        p: [gr.built.population, gr.approved.population, gr.proposed.population], u: [gr.built.units, gr.approved.units, gr.proposed.units], j: [j.jbuilt, j.japproved, j.jproposed] };
    });
    if (munis.length > 1) rows.push(rows.reduce((t, r) => ({ m: 'Peel', fp: t.fp + r.fp, fu: t.fu + r.fu, fj: t.fj + r.fj, p: t.p.map((v, i) => v + r.p[i]), u: t.u.map((v, i) => v + r.u[i]), j: t.j.map((v, i) => v + r.j[i]) }), { fp: 0, fu: 0, fj: 0, p: [0, 0, 0], u: [0, 0, 0], j: [0, 0, 0] }));
    const sum = a => a[0] + a[1] + a[2];
    const cell = (a, f, unit) => `<td>${unit(sum(a))}<small>${pct(sum(a), f)} of 2051 growth</small></td>`;
    const bar = (a, f) => { const mx = Math.max(f, sum(a)) || 1; return `<div class="svc-bar fc-bar" role="img" aria-label="${pct(sum(a), f)} of the 2051 growth">${['g-built', 'g-approved', 'g-proposed'].map((c, i) => a[i] > 0 ? `<span class="gseg ${c}" style="width:${(a[i] / mx * 100).toFixed(2)}%"></span>` : '').join('')}${f > sum(a) ? `<span class="fc-left" style="width:${((f - sum(a)) / mx * 100).toFixed(2)}%"></span>` : ''}</div>`; };
    const uU = n => unit(fmtNum(Math.round(n)), 'units'), uJ = n => unit(fmtNum(Math.round(n)), 'jobs');
    box.innerHTML = `<h3 class="svc-sub">Applications against the 2051 forecast <span class="muted small">growth since the ${bc.year} Census vs. growth allocated to 2051</span></h3>
      <table class="dt svc-table rep-table"><thead><tr><th>Municipality</th><th class="bar-h">Pipeline vs. 2051 growth (people)</th><th>2051 growth allocated</th><th>Built + approved + proposed</th><th>Units</th><th>Jobs on development sites</th><th>Still to plan for</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.m === 'Peel' ? 'tot' : ''}"><td>${esc(r.m)}</td><td class="bar">${bar(r.p, r.fp)}</td><td>${uPop(r.fp)}<small>${uU(r.fu)} · ${uJ(r.fj)}</small></td>${cell(r.p, r.fp, uPop)}${cell(r.u, r.fu, uU)}${cell(r.j, r.fj, uJ)}<td class="bo">${r.fp > sum(r.p) ? uPop(r.fp - sum(r.p)) : `<span class="over">exceeds by ${uPop(sum(r.p) - r.fp)}</span>`}</td></tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">${esc(F.note)} Pipeline = growth since census day from every development in the municipality (built = permits completed since census day; approved; proposed = in pre-consultation or review), at Peel's design persons per unit; jobs only where the applications state floor area. Design persons per unit (2.7 per apartment) are higher than the average household size behind the forecast, so the units column is the fairer comparison; the pipeline also includes applications that may not be built by 2051. The bar shows built (green), approved (blue) and proposed (hatched) against the 2051 growth (grey outline = still to plan for). Source: <a href="${esc(F.url)}" target="_blank" rel="noopener">${esc(F.title)}</a>, ${esc(F.pages)}.</p></details>`;
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
  const PLANNING_PHASES = ['inception', 'review', 'approved'];
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
      out.push({ label: currentPhaseView() === 'active' ? 'Active applications' : names.length <= 2 ? names.join(' + ') : `${names.length} phases`, clear: () => { state.phases = ALL_PHASE_KEYS(); } });
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
    const kindLabel = { '': 'All records', permit: 'Building permits', both: 'Application + permits' };
    const more = [state.focus ? FOCUS[state.focus].label : '', state.sp.length ? spSummary() : '', state.mtsa ? `MTSA: ${(areaById.get(state.mtsa) || {}).name || ''}` : '',
      state.pz ? (svcById.get(state.pz) || {}).name : '', state.dr ? `Drainage: ${(svcById.get(state.dr) || {}).name || ''}` : '',
      state.kind !== DEFAULT_KIND ? kindLabel[state.kind] : '', state.minUnits ? $('#f-units').selectedOptions[0].textContent : '', state.newOnly ? '' : 'incl. alterations'].filter(Boolean);
    $('#sum-more').textContent = more.length ? more.join(' · ') : 'Focus, areas, record type';
    $('#sect-more').classList.toggle('active', more.length > 0);
  }
  // One line saying what the map shows and why.
  function renderShowing() {
    const v = currentPhaseView();
    const what = v === 'all' ? 'developments (all phases)' : v === 'active' ? 'active applications' : `developments: ${P.ALL_PHASES.filter(p => state.phases.has(p.key)).map(p => p.label.toLowerCase()).join(', ')}`;
    const years = timeActive() ? (() => { const a = state.yearFrom ?? state.yearMin, b = state.yearTo ?? state.yearMax; return a === b ? `in ${a}` : `${a}–${b}`; })() : 'all years';
    const extra = activeFilters().length - (v === 'all' ? 0 : 1) - (timeActive() ? 1 : 0) - (state.muni ? 1 : 0) - (state.search ? 1 : 0);
    $('#f-showing').innerHTML = `Showing <strong>${fmtNum(state.filtered.length)}</strong> ${esc(what)} · ${esc(years)} · ${esc(state.muni || 'all of Peel')}${state.search ? ` · matching “${esc(state.search)}”` : ''}${extra > 0 ? ` · ${extra} more filter${extra === 1 ? '' : 's'}` : ''}`;
  }
  function renderFilterUI() {
    renderSectionSummaries();
    renderShowing();
    activeList = activeFilters();
    $('#active-filters').innerHTML = activeList.length
      ? activeList.map((f, i) => `<button type="button" class="chip on removable" data-i="${i}" title="Remove filter">${esc(f.label)} <span aria-hidden="true">×</span></button>`).join('') +
        `<button type="button" class="btn small link" id="f-reset">Reset all</button>`
      : '';
  }
  $('#active-filters').onclick = e => {
    if (e.target.closest('#f-reset')) {
      Object.assign(state, { muni: '', sp: [], mtsa: '', pz: '', dr: '', kind: DEFAULT_KIND, search: '', minUnits: 0, newOnly: true, phases: DEFAULT_PHASES(), focus: DEFAULT_FOCUS });
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
  // Bottom panel: collapse to just its tabs to give the map room; tapping a tab opens it again.
  // Closed by default: a slim bar with the headline numbers; "Analysis" opens the tabs.
  function setFooterCollapsed(collapsed) {
    $('#footer').classList.toggle('collapsed', collapsed);
    $('#footer-toggle').innerHTML = collapsed ? 'Analysis <span aria-hidden="true">▴</span>' : 'Hide <span aria-hidden="true">▾</span>';
    $('#footer-toggle').setAttribute('aria-expanded', String(!collapsed));
    store.set('footOpen', !collapsed);
  }
  $('#footer-toggle').onclick = () => setFooterCollapsed(!$('#footer').classList.contains('collapsed'));
  $('#f-sum').onclick = () => setFooterCollapsed(false);
  setFooterCollapsed(!store.get('footOpen', false));
  $('#footer').querySelector('.f-tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    footPref = t.dataset.tab; store.set('footTab3', footPref);
    showFootTab(footPref); setFooterCollapsed(false); viewLink.write();
  });
  // Floating timeline: folds to its header (collapsed by default on phones).
  function setTimelineOpen(open) {
    $('#timebar').classList.toggle('folded', !open);
    $('#t-toggle').setAttribute('aria-expanded', String(open));
    $('#t-toggle').textContent = open ? '▾' : '▴';
  }
  $('#t-toggle').onclick = () => { const open = $('#timebar').classList.contains('folded'); setTimelineOpen(open); store.set('timelineOpen', open); };
  setTimelineOpen(store.get('timelineOpen', false));

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

  window.PeelApp = { state, rebuild, loadAll, discover, map, showDetail, pipeSummary: () => pipeSummary(), devNeeds: p => devNeeds(p), allNeeds: () => allNeeds(), showDcTiming: () => showDcTiming(), showDcLine: ln => showDcLine(ln), sewersReady: () => !!SEW.data };
})();
