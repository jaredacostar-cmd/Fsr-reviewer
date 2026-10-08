/* Peel Development Tracker – UI, map and data orchestration. */
(function () {
  'use strict';

  const CFG = window.PEEL_CONFIG;
  const P = window.PeelPhases;
  const A = window.PeelArcGIS;
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
    muni: '', kind: '', search: '', activeSince: null, newOnly: true,
    sinceYear: store.get('sinceYear', CFG.sinceYear),
    maxPerLayer: store.get('maxPerLayer', CFG.maxPerLayer),
  };
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
  let tiles;
  function setTiles() {
    if (tiles) map.removeLayer(tiles);
    tiles = L.tileLayer(`https://{s}.basemaps.cartocdn.com/${dark() ? 'dark_all' : 'light_all'}/{z}/{x}/{y}{r}.png`, {
      maxZoom: 20, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a> · Data: City of Mississauga, City of Brampton, Town of Caledon, Region of Peel open data',
    }).addTo(map);
  }
  L.rectangle([[CFG.bbox.ymin, CFG.bbox.xmin], [CFG.bbox.ymax, CFG.bbox.xmax]], { color: '#77756f', weight: 1, dashArray: '4 4', fill: false, interactive: false }).addTo(map);

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
    applyFilters();
  }

  function matches(p, ignorePhase) {
    if (!ignorePhase && !state.phases.has(p.phase)) return false;
    if (state.muni && p.municipality !== state.muni) return false;
    if (state.kind === 'both' && p.kinds.length < 2) return false;
    if ((state.kind === 'application' || state.kind === 'permit') && !p.kinds.includes(state.kind)) return false;
    if (state.newOnly && !p.newBuild) return false;
    if (state.activeSince && !(p.last && p.last.getFullYear() >= state.activeSince)) return false;
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
  }

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
    const markers = [];
    for (const p of state.filtered) {
      if (p.lat == null) continue;
      const m = L.marker([p.lat, p.lng], { icon: iconFor(p.phase), phase: p.phase, keyboard: false, title: '' });
      m.bindTooltip(`<strong>${esc(p.title)}</strong><br>${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}`, { className: 'pt', direction: 'top', offset: [0, -8] });
      m.on('click', () => showDetail(p));
      markerByKey.set(p.key, m);
      markers.push(m);
    }
    cluster.addLayers(markers);
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
      units: p.units ?? '', gfa: p.gfa ?? '', types: p.types.join('; '),
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
  $('#f-active').onchange = e => { state.activeSince = Number(e.target.value) || null; applyFilters(); };

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

  // ---- Boot ------------------------------------------------------------------------
  readColors();
  setTiles();
  renderLegend();
  renderSources();
  applyFilters();
  loadAll();

  window.PeelApp = { state, rebuild, loadAll, discover };
})();
