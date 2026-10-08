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
  cluster.on('animationend spiderfied unspiderfied', () => scheduleLabels());
  const iconCache = {};
  const iconFor = phase => iconCache[phase] || (iconCache[phase] = L.divIcon({ className: 'pm', iconSize: [16, 16], html: dot(phase) }));
  let markerByKey = new Map();

  // ---- Loading -------------------------------------------------------------------
  function sinceFieldFor(fmap, kind) {
    const order = kind === 'permit' ? ['permit', 'inception', 'approved'] : ['inception', 'review', 'approved'];
    for (const ev of order) { const d = fmap.dates.find(x => x.event === ev); if (d) return d.field; }
    return null;
  }

  async function queryWithFallback(url, info, fmap, src) {
    const f = sinceFieldFor(fmap, src.kind);
    const y = Number(state.sinceYear);
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
          where, bbox: CFG.bbox, max: state.maxPerLayer, pageSize: CFG.pageSize,
          orderBy: f ? `${f} DESC` : undefined,
          onProgress: n => setSourceStatus(src, 'loading', `loading… ${fmtNum(n)}`),
        });
      } catch (e) { lastErr = e; }
    }
    throw lastErr;
  }

  async function loadSource(src) {
    src.records = []; src.layers = [];
    setSourceStatus(src, 'loading', 'connecting…');
    try {
      const layers = await A.resolveLayers(src.url);
      let truncated = false;
      for (const layer of layers) {
        const info = await A.layerInfo(layer.url);
        if (!info.geometryType) continue; // table without geometry
        const fmap = P.detectFields(info.fields || []);
        const res = await queryWithFallback(layer.url, info, fmap, src);
        truncated = truncated || res.truncated;
        const lsrc = { ...src, id: `${src.id}/${layer.url.split('/').pop()}` };
        for (const f of res.features) {
          const r = P.normalizeRecord(f, fmap, lsrc);
          if (r.lat != null) src.records.push(r);
        }
        src.layers.push({ name: info.name || layer.name, url: layer.url, count: res.features.length, fields: fmap });
      }
      setSourceStatus(src, 'ok', `${fmtNum(src.records.length)} records${truncated ? ` (capped at ${fmtNum(state.maxPerLayer)}/layer)` : ''}`);
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

  // The same permit can come from two layers (e.g. "all permits" and "growth" permits).
  function dedupe(records) {
    const byRef = new Map(); const out = [];
    for (const r of records) {
      if (!r.ref) { out.push(r); continue; }
      const k = `${r.municipality}|${r.kind}|${r.ref}`;
      const prev = byRef.get(k);
      if (!prev) { byRef.set(k, r); out.push(r); continue; }
      // merge into the first: union of events, furthest phase, fill blanks
      const seen = new Set(prev.events.map(e => `${e.phase}|${+e.date}`));
      for (const e of r.events) if (!seen.has(`${e.phase}|${+e.date}`)) prev.events.push(e);
      prev.events.sort((a, b) => a.date - b.date);
      if (prev.phase === 'cancelled' || (r.phase !== 'cancelled' && P.PHASE_BY_KEY[r.phase].rank > P.PHASE_BY_KEY[prev.phase].rank)) {
        if (r.phase !== 'cancelled' || prev.phase === 'cancelled') { prev.phase = r.phase; prev.statusRaw = r.statusRaw || prev.statusRaw; }
      }
      for (const f of ['address', 'type', 'description', 'units', 'gfa', 'statusRaw']) if (!prev[f] && r[f]) prev[f] = r[f];
      prev.props = { ...r.props, ...prev.props };
      prev.newBuild = prev.newBuild || r.newBuild;
      prev.alsoIn = (prev.alsoIn || []).concat(r.sourceName);
    }
    return out;
  }

  function rebuild() {
    const records = dedupe(state.sources.filter(s => s.enabled).flatMap(s => s.records));
    state.projects = P.buildProjects(records);
    const munis = Array.from(new Set(state.projects.map(p => p.municipality))).sort();
    const sel = $('#f-muni'), cur = sel.value;
    sel.innerHTML = '<option value="">All</option>' + munis.map(m => `<option${m === cur ? ' selected' : ''}>${esc(m)}</option>`).join('');
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

  function matches(p, ignorePhase, ignoreTime) {
    if (!ignorePhase && !state.phases.has(p.phase)) return false;
    if (!ignoreTime && !inYears(p)) return false;
    if (state.muni && p.municipality !== state.muni) return false;
    if (state.kind === 'both' && p.kinds.length < 2) return false;
    if ((state.kind === 'application' || state.kind === 'permit') && !p.kinds.includes(state.kind)) return false;
    if (state.newOnly && !p.newBuild) return false;
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
  function demandSet() {
    const live = state.filtered.filter(p => p.phase !== 'cancelled');
    if (state.demandBasis === 'pipeline') return live.filter(p => p.phase !== 'completed');
    if (state.demandBasis === 'completed') return live.filter(p => p.phase === 'completed');
    return live;
  }
  function renderDemand() {
    const set = demandSet();
    const c = state.criteria;
    const e = D.estimate(set, c);
    const tile = (label, value, unit, sub) =>
      `<div class="tile"><div class="tl">${label}</div><div class="tv">${value}<span class="tu">${unit}</span></div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    $('#d-tiles').innerHTML = [
      tile('Dwelling units', fmtNum(Math.round(e.totalUnits)), '', `${fmtNum(e.withUnits)} of ${fmtNum(set.length)} projects report units`),
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
    $('#d-note').textContent = `${fmtNum(set.length)} projects · ${range} · excludes withdrawn`;

    // Breakdown by dwelling type and by phase.
    const typeRows = D.UNIT_TYPES.map(t => `<tr><td>${esc(t.label)}</td><td>${fmtNum(Math.round(e.units[t.key]))}</td><td>${c.ppu[t.key]}</td><td>${fmtNum(Math.round(e.pop[t.key]))}</td></tr>`).join('');
    const phaseRows = P.PHASES.map(ph => {
      const pe = D.estimate(set.filter(p => p.phase === ph.key), c);
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
        <span class="m">${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}${p.units ? ` · ${fmtNum(p.units)} units` : ''}${p.last ? ` · ${fmtDate(p.last)}` : ''}</span></span></button></li>`).join('');
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
    $('#sources-summary').textContent = `${ok}/${en} loaded`;
    $('#source-list').innerHTML = state.sources.map((s, i) =>
      `<li><input type="checkbox" data-i="${i}" ${s.enabled ? 'checked' : ''} aria-label="Enable ${esc(s.name)}">
        <a class="name" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
        <button type="button" class="rm" data-rm="${i}" title="Remove source" aria-label="Remove ${esc(s.name)}">×</button>
        <span class="st ${s.status === 'error' ? 'err' : s.status === 'ok' ? 'ok' : ''}">${esc(s.kind === 'permit' ? 'Building permits' : 'Planning applications')}${s.msg ? ' · ' + esc(s.msg) : ''}</span></li>`).join('');
  }
  function setSourceStatus(src, status, msg) { src.status = status; src.msg = msg; renderSources(); }

  // ---- Detail panel --------------------------------------------------------------
  function showDetail(p) {
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
    const recs = p.records.map(r => `
      <details class="rec"><summary>${dot(r.phase)} <strong>${esc(r.kind === 'permit' ? 'Building permit' : 'Application')} ${esc(r.ref)}</strong>
        ${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}</summary>
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
        <p class="small muted">Source: ${esc(r.sourceName)}${r.alsoIn ? ` (also in ${esc(r.alsoIn.join(', '))})` : ''}</p>
        <table>${Object.entries(r.props).filter(([k, v]) => v != null && v !== '' && !/^(shape|globalid)/i.test(k)).map(([k, v]) => {
          const d = typeof v === 'number' && v > 1e11 && v < 5e12 && /date|_dt|time/i.test(k) ? fmtDate(new Date(v)) : v;
          return `<tr><td>${esc(k)}</td><td>${esc(d)}</td></tr>`;
        }).join('')}</table>
      </details>`).join('');
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
      <h2 class="section-title">Phase progress</h2>
      ${cancelled ? `<p class="small">${dot('cancelled')} All files on this site are withdrawn, refused or cancelled.</p>` : ''}
      <ol class="stepper">${steps}</ol>
      <h2 class="section-title">Timeline</h2>${timeline}
      <h2 class="section-title">Source records</h2>${recs}`;
    $('#detail').hidden = false;
  }
  $('#detail-close').onclick = () => { $('#detail').hidden = true; };
  addEventListener('keydown', e => { if (e.key === 'Escape') $('#detail').hidden = true; });

  // ---- Export ----------------------------------------------------------------------
  function exportRows() {
    return state.filtered.map(p => ({
      address: p.title, municipality: p.municipality, phase: P.PHASE_BY_KEY[p.phase].label,
      ...Object.fromEntries(P.PHASES.map(s => [`${s.key}_date`, fmtDate(p.milestones[s.key])])),
      units: p.units ?? '', est_population: p.units ? Math.round(D.estimate([p], state.criteria).population) : '',
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
  $('#f-muni').onchange = e => { state.muni = e.target.value; applyFilters(); };
  $('#f-kind').onchange = e => { state.kind = e.target.value; applyFilters(); };
  $('#f-new').onchange = e => { state.newOnly = e.target.checked; applyFilters(); };

  $('#s-since').value = state.sinceYear;
  $('#s-max').value = state.maxPerLayer;
  $('#s-since').onchange = e => { state.sinceYear = Number(e.target.value) || 0; store.set('sinceYear', state.sinceYear); };
  $('#s-max').onchange = e => { state.maxPerLayer = Math.max(500, Number(e.target.value) || CFG.maxPerLayer); store.set('maxPerLayer', state.maxPerLayer); };
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
  loadAll();

  window.PeelApp = { state, rebuild, loadAll, discover };
})();
