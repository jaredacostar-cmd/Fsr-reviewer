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
  const state = {
    sources: [],                         // {id,name,municipality,kind,url,enabled,status,msg,records}
    projects: [],
    filtered: [],
    phases: new Set(P.ALL_PHASES.map(p => p.key)),
    // Default: projects with a planning application (and the permits that belong to them).
    muni: '', kind: DEFAULT_KIND, search: '', newOnly: true,
    sp: [], mtsa: '',   // secondary plan / character area ids (several) and MTSA id (data/areas.json)
    minUnits: 0,   // unit growth filter: 0 = any, otherwise at least this many new units
    focus: '',     // quick-view focus (see FOCUS), combined with the phase
    // Timeline: inclusive year range (null = open-ended) on the chosen milestone.
    yearMode: 'any', yearFrom: null, yearTo: null, yearMin: null, yearMax: null,
    demandBasis: 'all',
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
  const map = L.map('map', { zoomControl: true, maxZoom: 20 }).setView(CFG.center, CFG.zoom);
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
      const opts = { bounds: L.latLngBounds([[y0, x0], [y1, x1]]), minZoom: 12, maxZoom: 20 };
      out.push(src.tiles ? L.tileLayer(src.tiles, { ...opts, maxNativeZoom: 20 })
        : new CityImagery(src.years[year].url, { ...opts, tileSize: 512, zoomOffset: -1 }));
      credits.push(`${src.owner} ${src.years[year].label}`);
    }
    return { layers: out, attribution: `Imagery: ${credits.join(', ')}; Esri elsewhere` };
  }
  let basemap = BASEMAPS[store.get('basemap', 'aerial-labels')] ? store.get('basemap', 'aerial-labels') : 'aerial-labels';
  let baseLayers = [];
  const bboxOutline = L.rectangle([[CFG.bbox.ymin, CFG.bbox.xmin], [CFG.bbox.ymax, CFG.bbox.xmax]], { weight: 1, dashArray: '4 4', fill: false, interactive: false });
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
      baseLayers = [esriLayer('World_Imagery', { attribution: `${city.attribution} · ${DATA_ATTR}` }), ...city.layers];
      if (basemap === 'aerial-labels') baseLayers.push(
        esriLayer('Reference/World_Transportation', { opacity: 0.9 }),
        esriLayer('Reference/World_Boundaries_and_Places'));
    } else {
      baseLayers = [esriLayer('World_Imagery', { attribution: `${imageryAttr} · ${DATA_ATTR}` })];
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

  // Map control: basemap + label pickers.
  const MapOptions = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const el = L.DomUtil.create('div', 'map-opts');
      const opts = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
      el.innerHTML = `
        <label><span>Background</span><select id="opt-basemap">${opts(BASEMAPS, basemap)}</select></label>
        <label><span>Labels</span><select id="opt-labels">${opts(LABEL_MODES, labelMode)}</select></label>
        <small id="label-note"></small>`;
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      el.querySelector('#opt-basemap').onchange = e => { basemap = e.target.value; store.set('basemap', basemap); setTiles(); };
      el.querySelector('#opt-labels').onchange = e => { labelMode = e.target.value; store.set('labelMode', labelMode); updateLabels(); };
      return el;
    },
  });
  new MapOptions().addTo(map);

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
  const SITE_ZOOM = 15, SITE_MAX_POINTS = 3000;
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
      const poly = L.polygon(toLatLngs(a.poly), {
        renderer: strong ? focusCanvas : canvas, color: strong ? colors.approved : '#ffffff', weight: strong ? 2.5 : 1.2,
        opacity: strong ? 1 : 0.8, dashArray: strong ? null : '5 4', fill: true, fillColor: colors.approved, fillOpacity: strong ? 0.08 : 0.04,
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
      bars += `<button type="button" class="bar${on ? ' on' : ''}" data-y="${y}" title="${y}: ${fmtNum(n)} project${n === 1 ? '' : 's'} (${esc(mode)})"
        aria-label="${y}: ${n} projects"><i style="height:${n ? Math.max(2, n / max * 100) : 0}%"></i></button>`;
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

  // ---- Population & servicing demand -------------------------------------------------
  const fmt1 = n => n == null || !isFinite(n) ? '–' : n.toLocaleString('en-CA', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
  // Withdrawn projects never count; the basis picks which of each project's units count.
  const demandSet = () => state.filtered.filter(p => p.phase !== 'cancelled');
  const BASIS_LABEL = { all: 'all units', committed: 'committed capacity: approved, not yet built', remaining: 'units left to build (no permit yet)', unbuilt: 'units not yet completed', completed: 'completed units' };
  function renderDemand() {
    const set = demandSet();
    const c = state.criteria;
    const basis = state.demandBasis;
    const e = D.estimate(set, c, basis);
    // Build-out across the shown projects (planning applications with unit counts).
    const bo = { planned: 0, permitted: 0, completed: 0, remaining: 0, n: 0 };
    for (const p of set) if (p.buildout) { bo.n++; for (const k of ['planned', 'permitted', 'completed', 'remaining']) bo[k] += p.buildout[k]; }
    const tile = (label, value, unit, sub, info) =>
      `<div class="tile" data-info="${info}"><div class="tl">${label}</div><div class="tv">${value}<span class="tu">${unit}</span></div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    $('#d-tiles').innerHTML = [
      tile(basis === 'all' ? 'Dwelling units' : 'Dwelling units counted', fmtNum(Math.round(e.totalUnits)), '',
        bo.n ? `Planned ${fmtNum(bo.planned)} · permitted ${fmtNum(bo.permitted)} · <strong>${fmtNum(bo.remaining)} left to build</strong>`
          : `${fmtNum(e.withUnits)} of ${fmtNum(set.length)} projects report units`, 'demand-units'),
      tile('Population', fmtNum(Math.round(e.population)), 'people', 'Peel persons-per-unit', 'demand-pop'),
      `<div class="tile group" data-info="demand-water"><div class="tl">Water demand</div><div class="trow">
        <div><div class="tv">${fmt1(e.water.avg)}<span class="tu">L/s</span></div><div class="ts">Average day · ${fmt1(D.toMLd(e.water.avg))} ML/d</div></div>
        <div><div class="tv">${fmt1(e.water.maxDay)}<span class="tu">L/s</span></div><div class="ts">Max day ×${c.water.maxDay}</div></div>
        <div><div class="tv">${fmt1(e.water.peakHour)}<span class="tu">L/s</span></div><div class="ts">Peak hour ×${c.water.peakHour}</div></div></div></div>`,
      `<div class="tile group" data-info="demand-wastewater"><div class="tl">Wastewater flow</div><div class="trow">
        <div><div class="tv">${fmt1(e.wastewater.avg)}<span class="tu">L/s</span></div><div class="ts">Avg dry weather · ${fmt1(D.toMLd(e.wastewater.avg))} ML/d</div></div>
        <div><div class="tv">${fmt1(e.wastewater.peak)}<span class="tu">L/s</span></div><div class="ts">Peak dry · Harmon M = ${e.population > 0 ? e.wastewater.peakingFactor.toFixed(2) : '–'}</div></div>
        <div><div class="tv">${fmt1(e.wastewater.infiltration)}<span class="tu">L/s</span></div><div class="ts">I&amp;I · ${fmtNum(Math.round(e.area.ha))} ha × ${c.wastewater.infiltration}${e.area.estimatedHa > 0 ? ` (${Math.round(e.area.estimatedHa / Math.max(e.area.ha, 1e-9) * 100)}% of area estimated)` : ''}</div></div>
        <div><div class="tv">${fmt1(e.wastewater.wetPeak)}<span class="tu">L/s</span></div><div class="ts">Peak wet weather</div></div></div></div>`,
    ].join('');
    const range = timeActive() ? `${state.yearFrom ?? state.yearMin}–${state.yearTo ?? state.yearMax}` : 'all years';
    $('#d-note').textContent = `${BASIS_LABEL[basis] || ''} · ${fmtNum(set.length)} projects · ${range} · excludes withdrawn`;

    // Breakdown by dwelling type and by phase.
    const typeRows = D.UNIT_TYPES.map(t => `<tr><td>${esc(t.label)}</td><td>${fmtNum(Math.round(e.units[t.key]))}</td><td>${c.ppu[t.key]}</td><td>${fmtNum(Math.round(e.pop[t.key]))}</td></tr>`).join('');
    const phaseRows = P.PHASES.map(ph => {
      const pe = D.estimate(set.filter(p => p.phase === ph.key), c, basis);
      return `<tr><td>${dot(ph.key)} ${esc(ph.label)}</td><td>${fmtNum(Math.round(pe.totalUnits))}</td><td>${fmtNum(Math.round(pe.population))}</td><td>${fmt1(pe.water.avg)}</td><td>${fmt1(pe.wastewater.avg)}</td></tr>`;
    }).join('');
    $('#d-breakdown').innerHTML = `
      <table class="dt"><caption>By dwelling type</caption><thead><tr><th>Type</th><th>Units</th><th>PPU</th><th>Population</th></tr></thead><tbody>${typeRows}</tbody></table>
      <table class="dt"><caption>By phase (average day, L/s)</caption><thead><tr><th>Phase</th><th>Units</th><th>Population</th><th>Water</th><th>Wastewater</th></tr></thead><tbody>${phaseRows}</tbody></table>`;
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
        <p class="small muted">Dry weather peak = average × Harmon M = 1 + 14 / (4 + √P), P in thousands, applied to the combined population. I&amp;I = rate × gross site area (application boundary; where there is none, estimated at ${D.AREA_PER_UNIT.single} ha per single, ${D.AREA_PER_UNIT.town} per townhouse, ${D.AREA_PER_UNIT.apartment} per apartment unit). Peak wet weather = dry weather peak + I&amp;I. ICI (employment) flows are not included.</p>
      </fieldset>
      <p class="small muted">Defaults: Region of Peel Linear Wastewater Standards (Table 2-2 PPU from the DC Background Study; 290 L/cap/d) and Watermain Design Criteria (280 L/cap/d, ×2.0 max day, ×3.0 peak hour). Apartments use 2.7 PPU, Peel's rate for high-density sites (&gt;475 persons/ha); use 3.1 for large apartments at lower density.</p>
      <button type="button" class="btn small" id="d-reset">Reset to Peel defaults</button>`;
  }
  $('#d-criteria').oninput = e => {
    const el = e.target; if (!el.dataset.g) return;
    const v = Number(el.value);
    if (!(v >= 0)) return;
    state.criteria[el.dataset.g][el.dataset.k] = v;
    store.set('criteria', state.criteria);
    renderDemand();
  };
  $('#d-criteria').onclick = e => {
    if (e.target.id !== 'd-reset') return;
    state.criteria = mergeCriteria(null); store.set('criteria', null);
    renderCriteria(); renderDemand();
  };
  $('#d-basis').onchange = e => { state.demandBasis = e.target.value; renderDemand(); };

  // ---- Rendering -----------------------------------------------------------------
  function renderPipeline(base) {
    const counts = Object.fromEntries(P.ALL_PHASES.map(p => [p.key, 0]));
    for (const p of base) counts[p.phase]++;
    const total = base.length;
    $('#total-count').textContent = `${fmtNum(state.filtered.length)} of ${fmtNum(state.projects.length)} projects`;
    $('#pipeline').innerHTML = P.ALL_PHASES.filter(p => counts[p.key]).map(p =>
      `<button type="button" data-phase="${p.key}" class="${state.phases.has(p.key) ? '' : 'off'}" style="flex:${counts[p.key]};background:${colors[p.key]}"
        title="${esc(p.label)}: ${fmtNum(counts[p.key])} (${total ? Math.round(counts[p.key] / total * 100) : 0}%)" aria-label="${esc(p.label)} ${counts[p.key]}"></button>`).join('');
    // Phase quick views: one tap shows that phase only.
    const cur = currentPhaseView();
    const n = keys => keys.reduce((a, k) => a + counts[k], 0);
    const chip = (key, label, count, title, lead = '') =>
      `<button type="button" class="chip${cur === key ? ' on' : ''}" data-pv="${key}" aria-pressed="${cur === key}" title="${esc(title)}">${lead}${esc(label)} <span class="n">${fmtNum(count)}</span></button>`;
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
    $('#list-note').textContent = !inView.length ? (state.filtered.length ? 'No matching projects in this part of the map — zoom out or pan.' : 'No projects match the filters.')
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
    $('#legend').innerHTML = P.ALL_PHASES.map(p => `<div class="li">${dot(p.key)}<span>${esc(p.label)}</span></div>`).join('');
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
      ${b.permitted > b.planned ? `<p class="small muted">More units are permitted than the applications state, so the permits are used as the project total.</p>` : ''}
      ${b.basis ? `<p class="small muted">Planned units: ${esc(BASIS_TEXT[b.basis] || '')}</p>` : ''}
      ${phasesHTML(b)}</details>`;
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
        </div></div>`;
    }
    const done = permits.filter(r => r.phase === 'completed').length;
    return `<div class="summary"><div class="sum-tiles">
      ${tile('s-plan', 'Units', p.units ? fmtNum(p.units) : '–', p.units ? 'on the files' : 'not stated')}
      ${tile('s-perm', 'Permits', fmtNum(permits.length), '')}
      ${tile('s-done', 'Completed', fmtNum(done), done ? 'permits' : '')}
      ${tile('s-left', 'Applications', fmtNum(p.records.length - permits.length), '')}
    </div></div>`;
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
    const es = cols.map(([k]) => D.estimate([p], c, k));
    if (!(es[0].totalUnits > 0)) return '';
    const row = (label, f, unit = '') => `<tr><td>${label}</td>${es.map(e => `<td>${f(e)}${unit}</td>`).join('')}</tr>`;
    const typeNote = D.UNIT_TYPES.filter(t => es[0].units[t.key] > 0).map(t => `${t.label.toLowerCase()} ${c.ppu[t.key]} ppu`).join(', ');
    return `<details class="sect"><summary><h2 class="section-title" data-info="project-demand">Servicing demand</h2></summary>${intro}
      <table class="dt demand-table"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${row('Units', e => fmtNum(Math.round(e.totalUnits)))}
        ${row('Population', e => fmtNum(Math.round(e.population)))}
        <tr class="sub"><td colspan="${cols.length + 1}">Water (L/s)</td></tr>
        ${row('Average day', e => fmt1(e.water.avg))}
        ${row(`Max day ×${c.water.maxDay}`, e => fmt1(e.water.maxDay))}
        ${row(`Peak hour ×${c.water.peakHour}`, e => fmt1(e.water.peakHour))}
        <tr class="sub"><td colspan="${cols.length + 1}">Wastewater (L/s)</td></tr>
        ${row('Average dry weather', e => fmt1(e.wastewater.avg))}
        ${row('Peak dry (Harmon)', e => e.population > 0 ? `${fmt1(e.wastewater.peak)} <span class="muted">M ${e.wastewater.peakingFactor.toFixed(2)}</span>` : '–')}
        ${row(`I&amp;I (${c.wastewater.infiltration} L/s/ha)`, e => e.area.ha > 0 ? `${fmt1(e.wastewater.infiltration)} <span class="muted">${fmt1(e.area.ha)} ha${e.area.estimatedHa > 0 ? ' est.' : ''}</span>` : '–')}
        ${row('Peak wet weather', e => e.population > 0 ? fmt1(e.wastewater.wetPeak) : '–')}
      </tbody></table>
      <p class="small muted">${esc(typeNote)}; ${c.water.avg} L/cap/d water, ${c.wastewater.avg} L/cap/d wastewater; I&amp;I on ${es[0].area.estimatedHa > 0 ? 'an estimated site area (no boundary in the data)' : 'the application boundary area'}, split by share of units.
        Completed = units on finished permits; remaining = the rest, permitted or not. Peaks are for each column alone (Harmon is not additive); edit the criteria in the bottom panel.</p></details>`;
  }

  function phaseHistoryHTML(p) {
    const h = state.history && state.history.projects && state.history.projects[p.key];
    if (!h || !h.length) return '';
    return `<h2 class="section-title">Phase history <span class="muted small">(checked weekly)</span></h2>
      <ol class="timeline">${h.map(([d, ph], i) => `<li><span class="d">${esc(d)}</span>${dot(ph)}<span>${i ? 'Moved to' : 'First seen as'} ${esc(P.PHASE_BY_KEY[ph].label)}</span></li>`).join('')}</ol>`;
  }

  let currentProject = null;
  function showDetail(p) {
    currentProject = p;
    highlight(p);
    const ph = P.PHASE_BY_KEY[p.phase];
    const cancelled = p.phase === 'cancelled';
    const steps = P.PHASES.map(s => {
      const reached = !cancelled && s.rank <= p.rank;
      const when = p.milestones[s.key];
      const cls = s.key === p.phase ? 'current done' : reached ? 'done' : 'todo';
      return `<li class="${cls}">${dot(s.key)}<span class="lbl">${esc(s.label)}</span><span class="when">${when ? fmtDate(when) : reached ? 'reached' : ''}</span></li>`;
    }).join('');
    const timeline = p.timeline.length
      ? `<ol class="timeline">${p.timeline.map(t => `<li><span class="d">${fmtDate(t.date)}</span>${dot(t.phase)}<span>${esc(t.text)} <span class="muted">— ${esc(t.tag)}</span></span></li>`).join('')}</ol>`
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
      <div class="head"><h3>${esc(p.title)}</h3><div class="m">${esc(p.municipality)}${p.types.length ? ' · ' + esc(p.types.slice(0, 3).join(', ')) : ''}</div>
        <span class="badge">${dot(p.phase)}${esc(ph.label)}</span></div>
      ${summaryHTML(p)}
      <p class="facts small">${[p.first && `First filed ${fmtDate(p.first)}`, p.last && `latest activity ${fmtDate(p.last)}`,
        `${fmtNum(p.records.length)} files`, p.gfa && `${fmtNum(p.gfa)} floor area`].filter(Boolean).join(' · ')}</p>
      ${p.description ? `<p class="desc-clamp">${esc(p.description)}</p>` : ''}
      ${cancelled ? `<p class="small">${dot('cancelled')} All files on this site are withdrawn, refused or cancelled.</p>` : ''}
      <details class="sect" open><summary><h2 class="section-title" data-info="aerial">Aerial check</h2></summary>
        <div class="aerial" id="aerial-check"></div></details>
      ${buildoutHTML(p)}
      ${demandHTML(p)}
      <details class="sect"><summary><h2 class="section-title" data-info="phase-progress">Progress &amp; timeline</h2></summary>
        <ol class="stepper">${steps}</ol>
        ${phaseHistoryHTML(p)}
        <h3 class="sub-title" data-info="project-timeline">All dated events</h3>${timeline}</details>
      <details class="sect" open><summary><h2 class="section-title" data-info="source-records">Source records <span class="muted small">by type · ${fmtNum(p.records.length)}</span></h2></summary>
        ${recs}</details>`;
    $('#detail').hidden = false;
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
  function closeDetail() { $('#detail').hidden = true; highlight(null); }
  $('#detail-close').onclick = closeDetail;
  addEventListener('keydown', e => { if (e.key === 'Escape') closeDetail(); });

  // A single record (usually one building permit inside a subdivision) and the planning
  // application(s) it belongs to.
  function showRecordDetail(r, p) {
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
        Open whole project: ${esc(p.title)}${b ? ` — ${fmtNum(b.planned)} planned, ${fmtNum(b.remaining)} left to build` : ''}${others > 0 ? ` · ${fmtNum(others)} other permits` : ''}
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
        r.kind === 'permit' ? '<p class="small muted">For the units on this permit only; open the whole project for the full site.</p>' : '') : ''}
      <h2 class="section-title">Source record</h2>
      <table class="rec-table">${recordRows(r)}</table>`;
    $('#open-project').onclick = () => showDetail(p);
    $('#detail').hidden = false;
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
  function exportRows() {
    return state.filtered.map(p => ({
      address: p.title, municipality: p.municipality, phase: P.PHASE_BY_KEY[p.phase].label,
      ...Object.fromEntries(P.PHASES.map(s => [`${s.key}_date`, fmtDate(p.milestones[s.key])])),
      units: p.units ?? '',
      planned_units: p.buildout ? p.buildout.planned : '', permitted_units: p.buildout ? p.buildout.permitted : '',
      completed_units: p.buildout ? p.buildout.completed : '', left_to_build: p.buildout ? p.buildout.remaining : '',
      building_permits: p.records.filter(r => r.kind === 'permit').length,
      est_population: p.units ? Math.round(D.estimate([p], state.criteria).population) : '',
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
      `<button type="button" class="chip${state.muni === m ? ' on' : ''}" data-muni="${esc(m)}" aria-pressed="${state.muni === m}">${esc(m || 'All')}</button>`).join('');
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
      state.censusDas = PeelAreas.tagCensus(a.census);
      tagProjects();
      renderAreaSelects();
      applyFilters();
    } catch (e) { /* areas are optional */ }
  }
  function tagProjects() {
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

  // ---- Growth since the 2021 Census (selected geography) ----------------------------------
  function renderCensus() {
    const box = $('#census');
    if (!state.censusDas || !state.censusDas.length || !state.projects.length) { box.hidden = true; return; }
    box.hidden = false;
    const g = { muni: state.muni, sp: state.sp, mtsa: state.mtsa };
    const base = PeelAreas.censusTotals(state.censusDas, g);
    const gr = PeelAreas.growthSince(state.projects, g, state.areas.census.date, state.criteria);
    const name = [state.mtsa && areaById.get(state.mtsa).name, state.sp.length && spSummary(), state.muni].filter(Boolean)[0] || 'Peel Region';
    const pct = (a, b) => b > 0 ? ` (+${(a / b * 100).toFixed(1)}%)` : '';
    const nowPop = base.population + gr.built.population, nowDw = base.dwellings + gr.built.units;
    const futPop = nowPop + gr.approved.population, futDw = nowDw + gr.approved.units;
    const allPop = futPop + gr.proposed.population, allDw = futDw + gr.proposed.units;
    const tile = (label, pop, dw, sub, info) => `<div class="tile" data-info="${info}"><div class="tl">${label}</div>
      <div class="tv">${fmtNum(Math.round(pop))}<span class="tu">people</span></div>
      <div class="ts">${fmtNum(Math.round(dw))} dwellings${sub ? ` · ${sub}` : ''}</div></div>`;
    $('#c-tiles').innerHTML = [
      tile('2021 Census', base.population, base.dwellings, `${fmtNum(base.das)} dissemination area${base.das === 1 ? '' : 's'}${state.sp.length || state.mtsa ? ', share by land area' : ''}`, 'census-base'),
      tile('+ Built since (estimate today)', nowPop, nowDw, `+${fmtNum(gr.built.units)} units${pct(gr.built.units, base.dwellings)}`, 'census-built'),
      tile('+ Approved, not yet built', futPop, futDw, `+${fmtNum(gr.approved.units)} units${pct(futDw - base.dwellings, base.dwellings)} vs 2021`, 'census-approved'),
      tile('+ Proposed: full build-out of applications', allPop, allDw, `+${fmtNum(gr.proposed.units)} units${pct(allDw - base.dwellings, base.dwellings)} vs 2021`, 'census-proposed'),
    ].join('');
    renderGrowthChart(base, gr);
    const ha = gr.built.ha + gr.approved.ha + gr.proposed.ha, ii = gr.built.ii + gr.approved.ii + gr.proposed.ii;
    $('#c-ii').textContent = ha > 0 ? `Wastewater I&I from growth since 2021: ${fmt1(ii)} L/s on ${fmtNum(Math.round(ha))} ha of development sites (built ${fmt1(gr.built.ii)} · approved ${fmt1(gr.approved.ii)} · proposed ${fmt1(gr.proposed.ii)} L/s; ${state.criteria.wastewater.infiltration} L/s/ha).` : '';
    $('#c-note').textContent = `${name} · built = permits completed since census day (11 May 2021)${gr.built.estimatedDates ? '; Brampton and Caledon completion dates estimated from issue date' : ''}; approved = committed growth; proposed = applications in pre-consultation or review; people at Peel persons-per-unit · other filters ignored`;
  }

  // Stacked bar: 2021 baseline, then each layer of growth up to full build-out of the
  // planning applications. One bar per measure (people, dwellings), sharing nothing but the
  // layer order, so there is no second axis. Values are direct-labelled in the legend.
  function renderGrowthChart(base, gr) {
    const layers = [
      { key: 'base', label: '2021 Census', people: base.population, dwellings: base.dwellings },
      { key: 'built', label: 'Built since', people: gr.built.population, dwellings: gr.built.units },
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
        <div class="grow-total">${fmtNum(Math.round(total))}</div></div>`;
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
      return `<button type="button" class="chip${on ? ' on' : ''}" data-focus="${k}" aria-pressed="${on}" title="${esc(f.title)}">${esc(f.label)} <span class="n">${fmtNum(count)}</span></button>`;
    }).join('');
  }
  function setFocus(k) {
    state.focus = state.focus === k ? '' : k;
    const basis = (state.focus && FOCUS[state.focus].basis) || 'all';
    state.demandBasis = basis; $('#d-basis').value = basis;
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
    const where = [state.muni || 'All of Peel', state.sp.length ? spSummary() : '', state.mtsa ? `MTSA: ${(areaById.get(state.mtsa) || {}).name || ''}` : ''].filter(Boolean);
    $('#sum-where').textContent = where.join(' · ');
    $('#sect-where').classList.toggle('active', !!(state.muni || state.sp.length || state.mtsa));
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
      Object.assign(state, { muni: '', sp: [], mtsa: '', kind: DEFAULT_KIND, search: '', minUnits: 0, newOnly: true, phases: ALL_PHASE_KEYS(), focus: '', demandBasis: 'all' });
      $('#d-basis').value = 'all';
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
      <p class="small muted">Separate projects of 20+ units within 60 m of each other${a.possibleSameUnits ? `, ${fmtNum(a.possibleSameUnits)} with the same unit count` : ' (none with the same unit count)'}. Usually neighbouring buildings; tap to check.</p>
      ${pairs ? `<ol class="audit-pairs small">${pairs}</ol>` : ''}
      <div class="row btns"><button type="button" class="btn small" id="audit-csv" title="Every file, the project it is counted in, and its units">Download audit CSV</button></div>`;
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
  // Phones: collapse the timeline / demand footer to give the map room.
  $('#footer-toggle').onclick = () => {
    const f = $('#footer'), collapsed = f.classList.toggle('collapsed');
    $('#footer-toggle').textContent = collapsed ? 'Show' : 'Hide';
    $('#footer-toggle').setAttribute('aria-expanded', String(!collapsed));
  };

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
