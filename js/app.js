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
  const state = {
    sources: [],                         // {id,name,municipality,kind,url,enabled,status,msg,records}
    projects: [],
    filtered: [],
    phases: new Set(P.ALL_PHASES.map(p => p.key)),
    muni: '', kind: '', search: '', newOnly: true,
    minUnits: 0,   // unit growth filter: 0 = any, otherwise at least this many new units
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
    'aerial-labels': { label: 'Aerial + roads', imagery: true },
    'aerial':        { label: 'Aerial', imagery: true },
    'streets':       { label: 'Street map', imagery: false },
  };
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
      labelLayer.addLayer(L.marker(m.getLatLng(), {
        interactive: false, keyboard: false,
        icon: L.divIcon({
          className: `plabel${spot.side === 'l' ? ' left' : ''}`, html: `<div>${html}</div>`, iconSize: null,
          iconAnchor: spot.side === 'l' ? [Math.ceil(size.w) + 11, 9] : [-11, 9],
        }),
      }));
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
  function outline(p, strong) {
    return siteApps(p).map(a => L.polygon(toLatLngs(a.poly), {
      renderer: strong ? focusCanvas : canvas, interactive: false, color: strong ? colors.approved : '#ffffff', weight: strong ? 2.5 : 1.2,
      opacity: strong ? 1 : 0.8, dashArray: strong ? null : '5 4', fill: strong, fillColor: colors.approved, fillOpacity: 0.08,
    }));
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
    for (const p of state.filtered) {
      if (n >= SITE_MAX_POINTS) break;
      if (!siteApps(p).length) continue;
      const b = projectBounds(p);
      if (!b || !view.intersects(b)) continue;
      for (const o of outline(p, false)) siteLayer.addLayer(o);
      for (const r of sitePermits(p)) {
        if (n++ >= SITE_MAX_POINTS) break;
        if (view.contains([r.lat, r.lng])) siteLayer.addLayer(permitDot(r, p, false));
      }
    }
    // Keep the selected project's outline and dots drawn above the others.
    focusLayer.eachLayer(l => l.bringToFront && l.bringToFront());
  }
  map.on('moveend zoomend', scheduleSites);
  function highlight(p, record) {
    focusLayer.clearLayers();
    if (!p) return;
    for (const o of outline(p, true)) focusLayer.addLayer(o);
    for (const r of sitePermits(p)) if (r !== record) focusLayer.addLayer(permitDot(r, p, false, true));
    if (record && record.lat != null) focusLayer.addLayer(permitDot(record, p, true, true));
  }
  cluster.on('animationend spiderfied unspiderfied', () => scheduleLabels());
  const iconCache = {};
  const iconFor = phase => iconCache[phase] || (iconCache[phase] = L.divIcon({ className: 'pm', iconSize: [16, 16], html: dot(phase) }));
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
    const records = P.dedupeRecords(state.sources.filter(s => s.enabled).flatMap(s => s.records));
    state.projects = P.buildProjects(records);
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

  function matches(p, ignorePhase, ignoreTime) {
    if (!ignorePhase && !state.phases.has(p.phase)) return false;
    if (!ignoreTime && !inYears(p)) return false;
    if (state.muni && p.municipality !== state.muni) return false;
    if (state.kind === 'both' && p.kinds.length < 2) return false;
    if ((state.kind === 'application' || state.kind === 'permit') && !p.kinds.includes(state.kind)) return false;
    if (state.newOnly && !p.newBuild) return false;
    if (state.minUnits === 'left') { if (!(p.buildout && p.buildout.remaining > 0)) return false; }
    else if (state.minUnits > 0 && !(unitsFor(p) >= state.minUnits)) return false;
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
    renderFilterUI();
    renderSiteLayer();
  }

  // ---- Timeline slider -------------------------------------------------------------
  const tFrom = $('#t-from'), tTo = $('#t-to');
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
    tFrom.value = state.yearFrom ?? lo;
    tTo.value = state.yearTo ?? hi;
  }
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
    $('#t-reset').hidden = !timeActive();
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
  $('#t-reset').onclick = () => setYears(state.yearMin, state.yearMax);
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
  const BASIS_LABEL = { all: 'all units', remaining: 'units left to build (no permit yet)', unbuilt: 'units not yet completed', completed: 'completed units' };
  function renderDemand() {
    const set = demandSet();
    const c = state.criteria;
    const basis = state.demandBasis;
    const e = D.estimate(set, c, basis);
    // Build-out across the shown projects (planning applications with unit counts).
    const bo = { planned: 0, permitted: 0, completed: 0, remaining: 0, n: 0 };
    for (const p of set) if (p.buildout) { bo.n++; for (const k of ['planned', 'permitted', 'completed', 'remaining']) bo[k] += p.buildout[k]; }
    const tile = (label, value, unit, sub) =>
      `<div class="tile"><div class="tl">${label}</div><div class="tv">${value}<span class="tu">${unit}</span></div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    $('#d-tiles').innerHTML = [
      tile(basis === 'all' ? 'Dwelling units' : 'Dwelling units counted', fmtNum(Math.round(e.totalUnits)), '',
        bo.n ? `Planned ${fmtNum(bo.planned)} · permitted ${fmtNum(bo.permitted)} · <strong>${fmtNum(bo.remaining)} left to build</strong>`
          : `${fmtNum(e.withUnits)} of ${fmtNum(set.length)} projects report units`),
      tile('Population', fmtNum(Math.round(e.population)), 'people', 'Peel persons-per-unit'),
      `<div class="tile group"><div class="tl">Water demand</div><div class="trow">
        <div><div class="tv">${fmt1(e.water.avg)}<span class="tu">L/s</span></div><div class="ts">Average day · ${fmt1(D.toMLd(e.water.avg))} ML/d</div></div>
        <div><div class="tv">${fmt1(e.water.maxDay)}<span class="tu">L/s</span></div><div class="ts">Max day ×${c.water.maxDay}</div></div>
        <div><div class="tv">${fmt1(e.water.peakHour)}<span class="tu">L/s</span></div><div class="ts">Peak hour ×${c.water.peakHour}</div></div></div></div>`,
      `<div class="tile group"><div class="tl">Wastewater flow</div><div class="trow">
        <div><div class="tv">${fmt1(e.wastewater.avg)}<span class="tu">L/s</span></div><div class="ts">Avg dry weather · ${fmt1(D.toMLd(e.wastewater.avg))} ML/d</div></div>
        <div><div class="tv">${fmt1(e.wastewater.peak)}<span class="tu">L/s</span></div><div class="ts">Peak · Harmon M = ${e.population > 0 ? e.wastewater.peakingFactor.toFixed(2) : '–'}</div></div></div></div>`,
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
        ${inp('wastewater', 'avg', 'Residential (L/cap/d)', 0.1)}
        <p class="small muted">Peak = average × Harmon M = 1 + 14 / (4 + √P), P in thousands, applied to the combined population. Infiltration (0.26 L/s/ha) and ICI flows are not included: they need site area and employment data.</p>
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
    $('#phase-list').innerHTML = P.ALL_PHASES.map(p =>
      `<li><button type="button" data-phase="${p.key}" class="${state.phases.has(p.key) ? '' : 'off'}" aria-pressed="${state.phases.has(p.key)}">
        ${dot(p.key)}<span>${esc(p.label)}<span class="desc">${esc(p.desc)}</span></span><span class="count">${fmtNum(counts[p.key])}</span></button></li>`).join('');
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
  function renderList() {
    const sorted = state.filtered.slice().sort((a, b) => (b.last || 0) - (a.last || 0) || b.rank - a.rank);
    $('#list-note').textContent = sorted.length > LIST_LIMIT ? `Showing the ${LIST_LIMIT} most recently active of ${fmtNum(sorted.length)} — zoom the map or search to narrow.` : '';
    $('#project-list').innerHTML = sorted.slice(0, LIST_LIMIT).map((p, i) =>
      `<li><button type="button" data-i="${i}">${dot(p.phase)}<span><span class="t">${esc(p.title)}</span>
        <span class="m">${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}${p.buildout ? ` · ${fmtNum(p.buildout.planned)} planned, ${fmtNum(p.buildout.remaining)} left` : p.units ? ` · ${fmtNum(p.units)} units` : ''}${p.last ? ` · ${fmtDate(p.last)}` : ''}</span></span></button></li>`).join('');
    $('#project-list').onclick = e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const p = sorted[+b.dataset.i];
      focusProject(p);
    };
  }

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

  // Planned units (planning applications) vs units on building permits inside the site.
  function buildoutHTML(p) {
    const b = p.buildout;
    const permits = p.records.filter(r => r.kind === 'permit').length;
    if (!b) return permits > 1 ? `<p class="small muted">${fmtNum(permits)} building permits on this site.</p>` : '';
    const pct = v => `${Math.min(100, v / Math.max(b.planned, b.permitted) * 100).toFixed(1)}%`;
    const inProgress = Math.max(0, b.permitted - b.completed);
    return `<h2 class="section-title">Build-out</h2>
      <div class="bo-bar" role="img" aria-label="${fmtNum(b.completed)} completed, ${fmtNum(inProgress)} permitted, ${fmtNum(b.remaining)} left to build of ${fmtNum(b.planned)} planned">
        <span class="bo-done" style="width:${pct(b.completed)}"></span><span class="bo-perm" style="width:${pct(inProgress)}"></span><span class="bo-left" style="width:${pct(b.remaining)}"></span>
      </div>
      <dl class="kv bo-kv">
        <dt>Planned (applications)</dt><dd>${fmtNum(b.planned)} units</dd>
        <dt><i class="sw bo-perm"></i>Permitted (building permits)</dt><dd>${fmtNum(b.permitted)} units · ${fmtNum(b.permits)} permits</dd>
        <dt><i class="sw bo-done"></i>Completed</dt><dd>${fmtNum(b.completed)} units</dd>
        <dt><i class="sw bo-left"></i>Left to build (no permit yet)</dt><dd><strong>${fmtNum(b.remaining)} units</strong></dd>
        <dt>Not yet completed</dt><dd>${fmtNum(b.unbuilt)} units</dd>
      </dl>
      ${b.permitted > b.planned ? `<p class="small muted">More units are permitted than the applications state, so the permits are used as the project total.</p>` : ''}`;
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
    const ordered = p.records.slice().sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'application' ? -1 : 1));
    const recs = ordered.slice(0, RECORD_LIMIT).map(r => `
      <details class="rec"><summary>${dot(r.phase)} <strong>${esc(r.kind === 'permit' ? 'Building permit' : 'Application')} ${esc(r.ref)}</strong>
        ${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}</summary>
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
        <p class="small muted">Source: ${esc(r.sourceName)}${r.alsoIn ? ` (also in ${esc(r.alsoIn.join(', '))})` : ''}
          ${r.lat != null ? ` · <button type="button" class="btn small link" data-rec="${esc(r.uid)}">${r.kind === 'permit' ? 'Show on map & parent application' : 'Show on map'}</button>` : ''}</p>
        <table>${recordRows(r)}</table>
      </details>`).join('') + (ordered.length > RECORD_LIMIT
        ? `<p class="small muted">+ ${fmtNum(ordered.length - RECORD_LIMIT)} more records (export CSV for the full list)</p>` : '');
    $('#detail-body').innerHTML = `
      <div class="head"><h3>${esc(p.title)}</h3><div class="m">${esc(p.municipality)}${p.types.length ? ' · ' + esc(p.types.slice(0, 3).join(', ')) : ''}</div>
        <span class="badge">${dot(p.phase)}${esc(ph.label)}</span></div>
      ${p.description ? `<p>${esc(p.description)}</p>` : ''}
      <dl class="kv">
        ${p.units ? `<dt>Units</dt><dd>${fmtNum(p.units)}</dd>` : ''}
        ${p.gfa ? `<dt>Floor area</dt><dd>${fmtNum(p.gfa)}</dd>` : ''}
        ${p.first ? `<dt>First record</dt><dd>${fmtDate(p.first)}</dd>` : ''}
        ${p.last ? `<dt>Latest activity</dt><dd>${fmtDate(p.last)}</dd>` : ''}
        <dt>Files</dt><dd>${p.records.length} (${p.kinds.map(k => k === 'permit' ? 'permits' : 'applications').join(' + ')})</dd>
      </dl>
      ${buildoutHTML(p)}
      <h2 class="section-title">Phase progress</h2>
      ${cancelled ? `<p class="small">${dot('cancelled')} All files on this site are withdrawn, refused or cancelled.</p>` : ''}
      <ol class="stepper">${steps}</ol>
      ${phaseHistoryHTML(p)}
      <h2 class="section-title">Timeline</h2>${timeline}
      <h2 class="section-title">Source records</h2>${recs}`;
    $('#detail').hidden = false;
    $('#detail').scrollTop = 0;
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
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <dl class="kv">
        ${r.statusRaw ? `<dt>Status</dt><dd>${esc(r.statusRaw)}</dd>` : ''}
        ${r.units ? `<dt>Units</dt><dd>${fmtNum(r.units)}</dd>` : ''}
        ${r.events.map(e => `<dt>${esc(P.humanizeField(e.label))}</dt><dd>${fmtDate(e.date)}</dd>`).join('')}
      </dl>
      ${r.kind === 'permit' ? `<h2 class="section-title">Part of planning application</h2>${parentHTML}` : ''}
      <button type="button" class="btn open-project" id="open-project">
        Open whole project: ${esc(p.title)}${b ? ` — ${fmtNum(b.planned)} planned, ${fmtNum(b.remaining)} left to build` : ''}${others > 0 ? ` · ${fmtNum(others)} other permits` : ''}
      </button>
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
  function togglePhase(key, solo) {
    if (solo) {
      const only = state.phases.size === 1 && state.phases.has(key);
      state.phases = new Set(only ? P.ALL_PHASES.map(p => p.key) : [key]);
    } else if (state.phases.has(key)) state.phases.delete(key);
    else state.phases.add(key);
    applyFilters();
  }
  $('#pipeline').onclick = e => { const b = e.target.closest('[data-phase]'); if (b) togglePhase(b.dataset.phase, true); };
  $('#phase-list').onclick = e => { const b = e.target.closest('[data-phase]'); if (b) togglePhase(b.dataset.phase, e.altKey || e.metaKey); };

  let searchTimer;
  $('#f-search').oninput = e => { clearTimeout(searchTimer); searchTimer = setTimeout(() => { state.search = e.target.value.trim().toLowerCase(); applyFilters(); }, 200); };
  $('#f-kind').onchange = e => { state.kind = e.target.value; applyFilters(); };
  $('#f-new').onchange = e => { state.newOnly = e.target.checked; applyFilters(); };
  $('#f-units').onchange = e => { state.minUnits = e.target.value === 'left' ? 'left' : Number(e.target.value) || 0; applyFilters(); };

  // Municipality chips (built from the data).
  function renderMuniChips() {
    const list = [''].concat(state.munis || []);
    $('#f-muni-chips').innerHTML = list.map(m =>
      `<button type="button" class="chip${state.muni === m ? ' on' : ''}" data-muni="${esc(m)}" aria-pressed="${state.muni === m}">${esc(m || 'All')}</button>`).join('');
  }
  $('#f-muni-chips').onclick = e => {
    const b = e.target.closest('[data-muni]'); if (!b) return;
    state.muni = b.dataset.muni;
    renderMuniChips();
    applyFilters();
  };

  // Quick views set several filters at once.
  const ALL_PHASE_KEYS = () => new Set(P.ALL_PHASES.map(p => p.key));
  const VIEWS = {
    all:      { kind: '', minUnits: 0, phases: ALL_PHASE_KEYS },
    growth:   { kind: 'application', minUnits: 1, phases: ALL_PHASE_KEYS },
    left:     { kind: '', minUnits: 'left', phases: ALL_PHASE_KEYS },
    building: { kind: '', minUnits: 0, phases: () => new Set(['permit', 'construction']) },
    done:     { kind: '', minUnits: 0, phases: () => new Set(['completed']) },
  };
  const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  function currentView() {
    for (const [k, v] of Object.entries(VIEWS)) {
      if (state.kind === v.kind && String(state.minUnits) === String(v.minUnits) && sameSet(state.phases, v.phases())) return k;
    }
    return null;
  }
  $('#views').onclick = e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    const v = VIEWS[b.dataset.view];
    state.kind = v.kind; state.minUnits = v.minUnits; state.phases = v.phases();
    $('#f-kind').value = state.kind;
    $('#f-units').value = String(state.minUnits);
    applyFilters();
  };

  // Active-filter chips: everything that narrows the view, each removable.
  function activeFilters() {
    const out = [];
    const kindLabel = { application: 'Planning applications', permit: 'Building permits', both: 'Application + permits' };
    const unitsLabel = { 1: 'Adds units', 10: '10+ units', 50: '50+ units', 100: '100+ units', 500: '500+ units', left: 'Units left to build' };
    if (state.search) out.push({ label: `“${state.search}”`, clear: () => { state.search = ''; $('#f-search').value = ''; } });
    if (state.muni) out.push({ label: state.muni, clear: () => { state.muni = ''; renderMuniChips(); } });
    if (state.kind) out.push({ label: kindLabel[state.kind], clear: () => { state.kind = ''; $('#f-kind').value = ''; } });
    if (state.minUnits) out.push({ label: unitsLabel[state.minUnits], clear: () => { state.minUnits = 0; $('#f-units').value = '0'; } });
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
  function renderFilterUI() {
    activeList = activeFilters();
    $('#active-filters').innerHTML = activeList.length
      ? activeList.map((f, i) => `<button type="button" class="chip on removable" data-i="${i}" title="Remove filter">${esc(f.label)} <span aria-hidden="true">×</span></button>`).join('') +
        `<button type="button" class="btn small link" id="f-reset">Reset all</button>`
      : '';
    const v = currentView();
    for (const b of document.querySelectorAll('#views [data-view]')) {
      const on = b.dataset.view === v;
      b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
    }
  }
  $('#active-filters').onclick = e => {
    if (e.target.closest('#f-reset')) {
      Object.assign(state, { muni: '', kind: '', search: '', minUnits: 0, newOnly: true, phases: ALL_PHASE_KEYS() });
      $('#f-search').value = ''; $('#f-kind').value = ''; $('#f-units').value = '0'; $('#f-new').checked = true;
      renderMuniChips();
      setYearsSilently(state.yearMin, state.yearMax);
      applyFilters();
      return;
    }
    const b = e.target.closest('[data-i]'); if (!b) return;
    activeList[+b.dataset.i].clear();
    applyFilters();
  };

  // Sidebar tabs.
  function showTab(name) {
    for (const b of document.querySelectorAll('.tabs [data-tab]')) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      $('#tab-' + b.dataset.tab).hidden = !on;
    }
    store.set('tab', name);
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

  // ---- Boot ------------------------------------------------------------------------
  readColors();
  setTiles();
  renderLegend();
  renderSources();
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

  window.PeelApp = { state, rebuild, loadAll, discover, map };
})();
