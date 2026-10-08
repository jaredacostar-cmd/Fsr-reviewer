/* Peel Region Projects — map + project details + Gantt chart.
 * Plain JS, no build step. Data is kept in the browser (localStorage) and
 * can be exported/imported as JSON. */
(function () {
  'use strict';

  const STORAGE_KEY = 'peel-projects-v2';
  const PEEL_CENTER = [43.73, -79.78];
  const PEEL_ZOOM = 10;

  const STATUSES = [
    { id: 'planning', label: 'Planning', color: '#7a5af8' },
    { id: 'design', label: 'Design', color: '#0e9384' },
    { id: 'tendering', label: 'Tendering', color: '#dc6803' },
    { id: 'construction', label: 'Construction', color: '#1570ef' },
    { id: 'complete', label: 'Complete', color: '#12b76a' },
    { id: 'hold', label: 'On hold', color: '#98a2b3' },
  ];
  const STATUS_BY_ID = Object.fromEntries(STATUSES.map((s) => [s.id, s]));

  const CATEGORIES = {
    linear: ['Road widening', 'Road resurfacing', 'Watermain', 'Wastewater / sewer', 'Stormwater', 'Transit', 'Active transportation', 'Bridge / culvert'],
    vertical: ['Community facility', 'Housing', 'Paramedic station', 'Water treatment', 'Wastewater treatment', 'Pumping station', 'Reservoir', 'Office / admin', 'Long-term care'],
  };

  const STANDARD_PHASES = [
    ['Environmental assessment', 0, 6],
    ['Detailed design', 6, 12],
    ['Utility relocation', 12, 4],
    ['Tender & award', 16, 3],
    ['Construction', 19, 18],
    ['Commissioning & close-out', 37, 2],
  ];

  // ---------- utilities ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const uid = () => Math.random().toString(36).slice(2, 10);

  function esc(str) {
    return String(str ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // Dates are 'YYYY-MM-DD' strings; arithmetic is done in UTC days so time
  // zones never shift a bar by one day.
  const DAY = 86400000;
  function toUTC(s) {
    const [y, m, d] = String(s).split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  }
  function isoDate(t) { return new Date(t).toISOString().slice(0, 10); }
  function addMonths(iso, months) {
    const d = new Date(toUTC(iso));
    d.setUTCMonth(d.getUTCMonth() + months);
    return isoDate(d.getTime());
  }
  function validDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !Number.isNaN(toUTC(s)); }
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(s) {
    if (!validDate(s)) return '—';
    const d = new Date(toUTC(s));
    return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }
  function todayISO() {
    const n = new Date();
    return isoDate(Date.UTC(n.getFullYear(), n.getMonth(), n.getDate()));
  }
  function fmtMoney(n) {
    if (n === '' || n == null || Number.isNaN(Number(n))) return '—';
    return Number(n).toLocaleString('en-CA', { style: 'currency', currency: 'CAD', maximumFractionDigits: 0 });
  }

  function projectSpan(p) {
    const tasks = (p.tasks || []).filter((t) => validDate(t.start) && validDate(t.end));
    if (!tasks.length) return null;
    let start = tasks[0].start, end = tasks[0].end;
    for (const t of tasks) {
      if (t.start < start) start = t.start;
      if (t.end > end) end = t.end;
    }
    return { start, end };
  }

  // Duration-weighted average of task progress.
  function projectProgress(p) {
    let total = 0, done = 0;
    for (const t of p.tasks || []) {
      if (!validDate(t.start) || !validDate(t.end)) continue;
      const dur = Math.max(1, (toUTC(t.end) - toUTC(t.start)) / DAY);
      total += dur;
      done += dur * (Number(t.progress) || 0) / 100;
    }
    return total ? Math.round((done / total) * 100) : 0;
  }

  // ---------- persistence ----------
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw);
        if (Array.isArray(data)) return data;
      }
    } catch (e) { /* storage unavailable or corrupt — fall back to the bundled data */ }
    return seedProjects();
  }
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(projects)); } catch (e) { /* ignore */ }
  }

  // ---------- state ----------
  let projects = load();
  let selectedId = null;
  let typeFilter = 'all';
  let draft = null;          // project being edited in the dialog
  let drawState = null;      // { type, points: [[lat,lng]] }
  let detailTab = 'schedule';
  let impact = null;         // { projectId, geomKey, buffer, source, status, items, error, controller }
  let parcels = null;        // { name, list } loaded parcel layer
  const bufferDefault = { linear: 50, vertical: 120 };

  // ---------- map ----------
  const map = L.map('map', { zoomControl: true }).setView(PEEL_CENTER, PEEL_ZOOM);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);

  const projectLayer = L.layerGroup().addTo(map);
  const drawLayer = L.layerGroup().addTo(map);
  const layers = new Map(); // project id -> leaflet layer
  const parcelOutlineLayer = L.layerGroup().addTo(map);
  const impactLayer = L.layerGroup().addTo(map);
  let bufferLine = null;     // linear buffer drawn as a thick line, rescaled on zoom

  function statusColor(p) { return (STATUS_BY_ID[p.status] || STATUS_BY_ID.planning).color; }

  function vertIcon(p, selected) {
    return L.divIcon({
      className: '',
      html: `<div class="vert-marker${selected ? ' selected' : ''}" style="background:${statusColor(p)}"></div>`,
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });
  }

  function renderMap() {
    projectLayer.clearLayers();
    layers.clear();
    for (const p of visibleProjects()) {
      if (!hasGeometry(p)) continue;
      const selected = p.id === selectedId;
      let layer;
      if (p.type === 'linear') {
        const group = L.featureGroup();
        // wide transparent line underneath makes thin lines easy to click
        L.polyline(p.geometry, { weight: 16, opacity: 0 }).addTo(group);
        if (selected) L.polyline(p.geometry, { color: '#000', weight: 10, opacity: 0.35 }).addTo(group);
        L.polyline(p.geometry, { color: statusColor(p), weight: selected ? 7 : 5, opacity: 0.95, lineCap: 'round' }).addTo(group);
        layer = group;
      } else {
        layer = L.marker(p.geometry, { icon: vertIcon(p, selected), zIndexOffset: selected ? 1000 : 0 });
      }
      layer.bindTooltip(esc(p.name), { sticky: p.type === 'linear' });
      layer.on('click', (e) => {
        if (drawState) return;
        L.DomEvent.stopPropagation(e);
        select(p.id, false);
      });
      layer.addTo(projectLayer);
      layers.set(p.id, layer);
    }
  }

  function hasGeometry(p) {
    if (p.type === 'linear') return Array.isArray(p.geometry) && p.geometry.length >= 2;
    return Array.isArray(p.geometry) && p.geometry.length === 2 && typeof p.geometry[0] === 'number';
  }

  function zoomTo(p) {
    if (!hasGeometry(p)) return;
    if (p.type === 'linear') map.fitBounds(L.latLngBounds(p.geometry), { padding: [60, 60], maxZoom: 15 });
    else map.setView(p.geometry, Math.max(map.getZoom(), 14));
  }

  // ---------- sidebar ----------
  function visibleProjects() {
    const q = $('#search').value.trim().toLowerCase();
    const muni = $('#filter-muni').value;
    return projects.filter((p) => {
      if (typeFilter !== 'all' && p.type !== typeFilter) return false;
      if (muni && p.municipality !== muni) return false;
      if (q && ![p.name, p.ref, p.category, p.municipality, p.lead, p.contractor].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }

  function renderList() {
    const list = $('#project-list');
    const items = visibleProjects().sort((a, b) => a.name.localeCompare(b.name));
    if (!items.length) {
      list.innerHTML = `<li class="empty">${projects.length ? 'No projects match the filters.' : 'No projects yet. Click “+ New project” to add one.'}</li>`;
      return;
    }
    list.innerHTML = items.map((p) => {
      const st = STATUS_BY_ID[p.status] || STATUS_BY_ID.planning;
      const span = projectSpan(p);
      const yrs = span ? `${span.start.slice(0, 4)}–${span.end.slice(0, 4)}` : 'No schedule';
      const noGeo = hasGeometry(p) ? '' : ' · <em>not mapped</em>';
      return `<li data-id="${esc(p.id)}" class="${p.id === selectedId ? 'selected' : ''}">
        <span class="swatch ${p.type === 'linear' ? 'linear' : ''}" style="background:${st.color}"></span>
        <span class="pl-name">${esc(p.name)}</span>
        <span class="pl-meta">${esc(p.municipality || '')} · ${esc(st.label)} · ${yrs}${noGeo}</span>
      </li>`;
    }).join('');
  }

  function renderLegend() {
    $('#legend-items').innerHTML = STATUSES.map((s) =>
      `<span class="legend-row"><span class="swatch" style="background:${s.color}"></span>${s.label}</span>`).join('');
  }

  function renderMuniFilter() {
    const sel = $('#filter-muni');
    const current = sel.value;
    const munis = [...new Set(projects.map((p) => p.municipality).filter(Boolean))].sort();
    sel.innerHTML = '<option value="">All municipalities</option>' + munis.map((m) => `<option>${esc(m)}</option>`).join('');
    sel.value = munis.includes(current) ? current : '';
  }

  // ---------- detail panel ----------
  function renderDetail() {
    const panel = $('#detail');
    const p = projects.find((x) => x.id === selectedId);
    if (!p) { panel.hidden = true; panel.innerHTML = ''; map.invalidateSize(); return; }
    const st = STATUS_BY_ID[p.status] || STATUS_BY_ID.planning;
    const span = projectSpan(p);
    const pct = projectProgress(p);
    const lengthKm = p.type === 'linear' && hasGeometry(p) ? polylineKm(p.geometry) : null;

    panel.innerHTML = `
      <div class="info">
        <div class="info-head">
          <h2>${esc(p.name)}</h2>
          <button class="icon-btn" data-action="close" aria-label="Close details">✕</button>
        </div>
        <div class="badges">
          <span class="badge status" style="background:${st.color}">${esc(st.label)}</span>
          <span class="badge">${p.type === 'linear' ? 'Linear' : 'Vertical'}</span>
          ${p.category ? `<span class="badge">${esc(p.category)}</span>` : ''}
        </div>
        <dl>
          ${p.ref ? `<dt>Project #</dt><dd>${esc(p.ref)}</dd>` : ''}
          <dt>Municipality</dt><dd>${esc(p.municipality || '—')}</dd>
          <dt>Lead</dt><dd>${esc(p.lead || '—')}</dd>
          ${p.contractor ? `<dt>Contractor</dt><dd>${esc(p.contractor)}</dd>` : ''}
          <dt>Budget</dt><dd>${fmtMoney(p.budget)}</dd>
          <dt>Start</dt><dd>${span ? fmtDate(span.start) : '—'}</dd>
          <dt>Finish</dt><dd>${span ? fmtDate(span.end) : '—'}</dd>
          ${lengthKm != null ? `<dt>Length</dt><dd>${lengthKm.toFixed(2)} km</dd>` : ''}
          ${!hasGeometry(p) ? '<dt>Location</dt><dd><em>Not drawn on map</em></dd>' : ''}
        </dl>
        <div class="progress-wrap">
          <span class="muted">Overall progress: ${pct}%</span>
          <div class="progress"><div style="width:${pct}%"></div></div>
        </div>
        ${p.description ? `<p class="desc">${esc(p.description)}</p>` : ''}
        ${sourcesHTML(p)}
        <div class="info-actions">
          <button class="btn sm" data-action="edit">Edit</button>
          <button class="btn sm" data-action="zoom">Zoom to</button>
          <button class="btn sm ghost danger" data-action="delete">Delete</button>
        </div>
      </div>
      <div class="gantt-wrap">
        <div class="tabs" role="tablist">
          <button role="tab" data-tab="schedule" aria-selected="${detailTab === 'schedule'}">Schedule</button>
          <button role="tab" data-tab="props" aria-selected="${detailTab === 'props'}">Impacted properties${impactFor(p)?.status === 'done' ? ` (${impactFor(p).items.length})` : ''}</button>
        </div>
        ${detailTab === 'schedule' ? `<div class="gantt">${ganttHTML(p, st.color)}</div>` : propsHTML(p)}
      </div>`;
    panel.hidden = false;
    map.invalidateSize();
    // On long schedules, scroll so the current year (and today line) is in view.
    const gantt = panel.querySelector('.gantt');
    const todayLine = panel.querySelector('.g-today');
    if (gantt && todayLine) {
      const left = (el) => el.getBoundingClientRect().left - gantt.getBoundingClientRect().left;
      if (left(todayLine) > gantt.clientWidth) {
        const yearLabel = panel.querySelector(`.g-year[data-year="${todayISO().slice(0, 4)}"]`);
        const labelCol = panel.querySelector('.g-label').offsetWidth;
        gantt.scrollLeft = (yearLabel ? left(yearLabel) : left(todayLine) - gantt.clientWidth / 2) - labelCol;
      }
    }
  }

  function sourcesHTML(p) {
    const links = (p.sources || []).filter((u) => /^https?:\/\//i.test(u));
    if (!links.length) return '';
    return `<div class="sources"><span class="muted">Sources</span><ul>${links.map((u) =>
      `<li><a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${esc(u.replace(/^https?:\/\/(www\.)?/i, ''))}</a></li>`).join('')}</ul></div>`;
  }

  function polylineKm(points) {
    let m = 0;
    for (let i = 1; i < points.length; i++) m += L.latLng(points[i - 1]).distanceTo(L.latLng(points[i]));
    return m / 1000;
  }

  // ---------- Gantt ----------
  function ganttHTML(p, color) {
    const tasks = (p.tasks || []).filter((t) => validDate(t.start) && validDate(t.end));
    if (!tasks.length) return '<div class="g-empty">No schedule yet — edit the project to add tasks.</div>';

    const span = projectSpan(p);
    // Pad the window to whole months.
    const s = new Date(toUTC(span.start));
    const e = new Date(toUTC(span.end));
    const winStart = Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1);
    const winEnd = Date.UTC(e.getUTCFullYear(), e.getUTCMonth() + 1, 1);
    const total = winEnd - winStart;
    const pos = (t) => ((t - winStart) / total) * 100;

    // Month & year scale
    const months = [];
    for (let d = new Date(winStart); d.getTime() < winEnd; d.setUTCMonth(d.getUTCMonth() + 1)) {
      const a = d.getTime();
      const b = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
      months.push({ a, b, m: d.getUTCMonth(), y: d.getUTCFullYear() });
    }
    const pxPerMonth = months.length > 60 ? 14 : 30;
    const minWidth = 190 + months.length * pxPerMonth;
    const showMonthLabels = months.length <= 60;
    const years = [];
    for (const mo of months) {
      const last = years[years.length - 1];
      if (last && last.y === mo.y) last.b = mo.b; else years.push({ y: mo.y, a: mo.a, b: mo.b });
    }

    const scale = years.map((y) => `<div class="g-year" data-year="${y.y}" style="left:${pos(y.a)}%;width:${pos(y.b) - pos(y.a)}%">${y.y}</div>`).join('')
      + months.map((mo) => `<div class="g-month" style="left:${pos(mo.a)}%;width:${pos(mo.b) - pos(mo.a)}%">${showMonthLabels ? MONTHS[mo.m][0] : ''}</div>`).join('');
    const grid = months.filter((mo) => mo.m === 0 || months.length <= 24).map((mo) => `<div class="g-grid" style="left:${pos(mo.a)}%"></div>`).join('');

    const now = toUTC(todayISO());
    const today = now >= winStart && now <= winEnd ? `<div class="g-today" style="left:${pos(now)}%" title="Today"></div>` : '';

    const bar = (start, end, progress, c, label) => {
      const a = toUTC(start), b = toUTC(end) + DAY; // end date is inclusive
      if (start === end) {
        return `<div class="g-milestone" style="left:${pos(a)}%;--bar:${c}" title="${esc(label)} · ${fmtDate(start)}"></div>`;
      }
      const pct = Math.max(0, Math.min(100, Number(progress) || 0));
      return `<div class="g-bar" style="left:${pos(a)}%;width:${pos(b) - pos(a)}%;--bar:${c}" title="${esc(label)} · ${fmtDate(start)} – ${fmtDate(end)} · ${pct}%">
        <div class="g-fill" style="width:${pct}%"></div><div class="g-pct">${pct}%</div></div>`;
    };

    const rows = tasks.map((t) => `
      <div class="g-row">
        <div class="g-label"><div class="g-name" title="${esc(t.name)}">${esc(t.name || 'Untitled task')}</div><small>${fmtDate(t.start)} – ${fmtDate(t.end)}</small></div>
        <div class="g-track">${grid}${today}${bar(t.start, t.end, t.progress, color, t.name)}</div>
      </div>`).join('');

    return `<div class="gantt-inner" style="min-width:${minWidth}px">
      <div class="g-row head"><div class="g-label">Task</div><div class="g-scale">${scale}</div></div>
      <div class="g-row summary">
        <div class="g-label"><div class="g-name">Overall project</div><small>${fmtDate(span.start)} – ${fmtDate(span.end)}</small></div>
        <div class="g-track">${grid}${today}${bar(span.start, span.end, projectProgress(p), '#475467', 'Overall project')}</div>
      </div>
      ${rows}
    </div>`;
  }

  // ---------- impacted properties ----------
  const geomKey = (p) => JSON.stringify(p.geometry);

  function impactFor(p) {
    return impact && impact.projectId === p.id && impact.geomKey === geomKey(p) ? impact : null;
  }

  function ensureImpact(p) {
    if (!impactFor(p)) {
      clearImpact();
      impact = { projectId: p.id, geomKey: geomKey(p), buffer: bufferDefault[p.type], source: parcels ? 'parcels' : 'osm', status: 'idle', items: [] };
    }
    return impact;
  }

  function clearImpact() {
    if (impact && impact.controller) impact.controller.abort();
    impact = null;
    impactLayer.clearLayers();
    bufferLine = null;
  }

  const CATEGORY_ORDER = ['Residential', 'Commercial', 'Industrial', 'Institutional', 'Parcel', 'Building', 'Address', 'Accessory'];
  const MAX_ROWS = 500;

  function propsHTML(p) {
    if (!hasGeometry(p)) return '<div class="g-empty">Draw this project on the map first (Edit → Draw on map).</div>';
    const im = ensureImpact(p);
    const parcelInfo = parcels
      ? `<span>Parcel layer: <strong>${esc(parcels.name)}</strong> (${parcels.list.length.toLocaleString()} parcels)</span>
         <button class="btn sm ghost" data-action="parcels-remove">Remove</button>`
      : `<span class="muted">No parcel layer loaded.</span>`;
    let body = '';
    if (im.status === 'loading') body = '<p class="muted">Searching…</p>';
    else if (im.status === 'error') body = `<p class="error">${esc(im.error)}</p>`;
    else if (im.status === 'done') {
      const counts = {};
      for (const it of im.items) counts[it.category] = (counts[it.category] || 0) + 1;
      const chips = CATEGORY_ORDER.filter((c) => counts[c]).map((c) => `<span class="badge">${c}: ${counts[c]}</span>`).join('');
      const withAddr = im.items.filter((it) => it.address).length;
      body = im.items.length ? `
        <div class="impact-summary">
          <strong>${im.items.length} ${im.source === 'parcels' ? (im.items.length === 1 ? 'parcel' : 'parcels') : (im.items.length === 1 ? 'property' : 'properties')}</strong> within ${im.buffer} m
          <span class="muted">· ${withAddr} with an address</span>
          <button class="btn sm" data-action="impact-csv">Export CSV</button>
          <button class="btn sm ghost" data-action="impact-clear">Clear</button>
        </div>
        <div class="badges">${chips}</div>
        <div class="impact-table-wrap"><table class="impact-table">
          <thead><tr><th>Address</th><th>Type</th><th class="num">Distance</th></tr></thead>
          <tbody>${im.items.slice(0, MAX_ROWS).map((it, i) => `
            <tr data-idx="${i}" tabindex="0">
              <td>${it.address ? esc(it.address) : '<span class="muted">No address on record</span>'}${it.name ? `<br><small class="muted">${esc(it.name)}</small>` : ''}</td>
              <td>${esc(it.category)}${it.detail ? `<br><small class="muted">${esc(it.detail)}</small>` : ''}</td>
              <td class="num">${Math.round(it.distance)} m</td>
            </tr>`).join('')}</tbody>
        </table></div>
        ${im.items.length > MAX_ROWS ? `<p class="muted">Showing the closest ${MAX_ROWS}. Export CSV for all ${im.items.length}.</p>` : ''}`
        : `<p class="muted">Nothing found within ${im.buffer} m. Try a larger distance${im.source === 'osm' ? ' or load a parcel layer' : ''}.</p>`;
    }
    return `<div class="impact">
      <div class="impact-controls">
        <label>Within
          <input type="number" name="impact-buffer" min="5" max="1000" step="5" value="${im.buffer}"> m of the ${p.type === 'linear' ? 'line' : 'site'}
        </label>
        <label>Using
          <select name="impact-source">
            <option value="osm" ${im.source === 'osm' ? 'selected' : ''}>OpenStreetMap buildings &amp; addresses</option>
            <option value="parcels" ${im.source === 'parcels' ? 'selected' : ''} ${parcels ? '' : 'disabled'}>Loaded parcel layer</option>
          </select>
        </label>
        <button class="btn sm primary" data-action="impact-run" ${im.status === 'loading' ? 'disabled' : ''}>Find properties</button>
      </div>
      <div class="impact-parcels">${parcelInfo}
        <button class="btn sm" data-action="parcels-load">Load parcel GeoJSON…</button>
      </div>
      ${body}
      <p class="muted fine">${im.source === 'parcels'
        ? 'Distances are measured from the project to the parcel boundary.'
        : 'Building footprints and addresses come from OpenStreetMap and may be incomplete; distances are measured to the building footprint. Sheds and garages without an address are left out.'}
        Owner names are not included. Use MPAC or municipal assessment records for those.</p>
    </div>`;
  }

  async function runImpact(p) {
    const im = ensureImpact(p);
    if (im.controller) im.controller.abort();
    im.status = 'loading';
    im.error = '';
    renderDetail();
    try {
      if (im.source === 'parcels') {
        if (!parcels) throw new Error('Load a parcel GeoJSON file first.');
        im.items = PeelProperties.findParcels(p, im.buffer, parcels.list);
      } else {
        im.controller = new AbortController();
        im.items = await PeelProperties.findOSM(p, im.buffer, im.controller.signal);
      }
      if (impact !== im) return; // project changed while waiting
      im.status = 'done';
    } catch (e) {
      if (e.name === 'AbortError' || impact !== im) return;
      im.status = 'error';
      im.error = `Could not get properties: ${e.message}`;
    } finally {
      im.controller = null;
    }
    renderDetail();
    renderImpactLayer(p);
  }

  function metresPerPixel(lat) {
    return (40075016.686 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, map.getZoom() + 8);
  }

  function updateBufferWeight() {
    if (!bufferLine || !impact) return;
    const lat = bufferLine.getBounds().getCenter().lat;
    bufferLine.setStyle({ weight: Math.max(2, (2 * impact.buffer) / metresPerPixel(lat)) });
  }

  function renderImpactLayer(p) {
    impactLayer.clearLayers();
    bufferLine = null;
    const im = impactFor(p);
    if (!im || im.status !== 'done') return;
    const zone = { color: '#d92d20', opacity: 0.12, fillColor: '#d92d20', fillOpacity: 0.08, interactive: false };
    if (p.type === 'linear') {
      bufferLine = L.polyline(p.geometry, { ...zone, lineCap: 'round', lineJoin: 'round' }).addTo(impactLayer);
      updateBufferWeight();
    } else {
      L.circle(p.geometry, { ...zone, radius: im.buffer, weight: 1, opacity: 0.5 }).addTo(impactLayer);
    }
    const style = { color: '#c2410c', weight: 1.5, fillColor: '#f97316', fillOpacity: 0.55 };
    im.items.forEach((it) => {
      const layer = it.point
        ? L.circleMarker(it.point, { ...style, radius: 5 })
        : L.polygon(it.rings, style);
      layer.bindTooltip(`${esc(it.address || it.name || it.category)} · ${Math.round(it.distance)} m`);
      it.layer = layer;
      layer.addTo(impactLayer);
    });
  }

  function focusImpactItem(idx) {
    const it = impact && impact.items[idx];
    if (!it || !it.layer) return;
    if (it.point) map.setView(it.point, Math.max(map.getZoom(), 18));
    else map.fitBounds(it.layer.getBounds(), { maxZoom: 19, padding: [80, 80] });
    it.layer.openTooltip();
  }

  // Parcel outlines are only drawn when zoomed in, and only those in view.
  function renderParcelOutlines() {
    parcelOutlineLayer.clearLayers();
    if (!parcels || map.getZoom() < 16) return;
    const b = map.getBounds();
    const view = [b.getSouth(), b.getWest(), b.getNorth(), b.getEast()];
    for (const pc of PeelProperties.parcelsInView(parcels.list, view, 3000)) {
      L.polygon(pc.rings, { color: '#667085', weight: 1, fill: false, interactive: false }).addTo(parcelOutlineLayer);
    }
  }

  map.on('zoomend', updateBufferWeight);
  map.on('moveend', renderParcelOutlines);

  async function loadParcelFile(file) {
    try {
      const list = PeelProperties.parseParcels(JSON.parse(await file.text()));
      parcels = { name: file.name, list };
      try { await PeelProperties.saveParcels(parcels); } catch (e) { /* too large or storage blocked: keep for this session */ }
      if (impact) { impact.source = 'parcels'; impact.status = 'idle'; impactLayer.clearLayers(); }
      renderParcelOutlines();
      renderDetail();
    } catch (e) {
      alert(`Could not load parcel file: ${e.message}`);
    }
  }

  $('#file-parcels').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (file) loadParcelFile(file);
  });

  PeelProperties.loadParcels().then((saved) => {
    if (saved && Array.isArray(saved.list)) { parcels = saved; renderParcelOutlines(); renderDetail(); }
  }).catch(() => { /* IndexedDB unavailable */ });

  // ---------- selection ----------
  function select(id, zoom = true) {
    if (id !== selectedId) clearImpact();
    selectedId = id;
    renderAll();
    const p = projects.find((x) => x.id === id);
    if (p && zoom) zoomTo(p);
    const li = $(`#project-list li[data-id="${CSS.escape(id || '')}"]`);
    if (li) li.scrollIntoView({ block: 'nearest' });
  }

  function renderAll() {
    renderMuniFilter();
    renderList();
    renderMap();
    renderDetail();
  }

  // ---------- editor ----------
  const editor = $('#editor');
  const form = $('#editor-form');

  function openEditor(p) {
    draft = p ? JSON.parse(JSON.stringify(p)) : {
      id: uid(), name: '', ref: '', type: 'linear', category: '', municipality: 'Mississauga',
      status: 'planning', lead: '', budget: '', contractor: '', description: '', geometry: null, tasks: [],
    };
    $('#editor-title').textContent = p ? 'Edit project' : 'New project';
    form.status.innerHTML = STATUSES.map((s) => `<option value="${s.id}">${s.label}</option>`).join('');
    for (const k of ['name', 'ref', 'type', 'category', 'municipality', 'status', 'lead', 'budget', 'contractor', 'description']) {
      form[k].value = draft[k] ?? '';
    }
    form.sources.value = (draft.sources || []).join('\n');
    updateCategoryOptions();
    renderTaskRows();
    updateGeoStatus();
    $('#editor-error').hidden = true;
    if (!editor.open) editor.showModal();
    form.name.focus();
  }

  function updateCategoryOptions() {
    $('#category-options').innerHTML = (CATEGORIES[form.type.value] || []).map((c) => `<option value="${esc(c)}">`).join('');
  }

  function updateGeoStatus() {
    const type = form.type.value;
    const g = draft.geometry;
    let msg;
    if (type === 'linear') {
      msg = Array.isArray(g) && g.length >= 2 && Array.isArray(g[0])
        ? `Line with ${g.length} points (${polylineKm(g).toFixed(2)} km).`
        : 'No line drawn yet. Click “Draw on map” and click along the alignment.';
    } else {
      msg = Array.isArray(g) && g.length === 2 && typeof g[0] === 'number'
        ? `Site at ${g[0].toFixed(5)}, ${g[1].toFixed(5)}.`
        : 'No site placed yet. Click “Draw on map” then click the site location.';
    }
    $('#geo-status').textContent = msg;
    $('#btn-draw').textContent = g ? 'Redraw on map' : 'Draw on map';
  }

  function readTaskRows() {
    return [...$('#task-rows').querySelectorAll('tr')].map((tr) => ({
      id: tr.dataset.id,
      name: tr.querySelector('[name=t-name]').value.trim(),
      start: tr.querySelector('[name=t-start]').value,
      end: tr.querySelector('[name=t-end]').value,
      progress: Math.max(0, Math.min(100, Number(tr.querySelector('[name=t-progress]').value) || 0)),
    }));
  }

  function renderTaskRows() {
    $('#task-rows').innerHTML = draft.tasks.map((t) => `
      <tr data-id="${esc(t.id)}">
        <td><input name="t-name" value="${esc(t.name)}" placeholder="Task name" aria-label="Task name"></td>
        <td><input name="t-start" type="date" value="${esc(t.start)}" aria-label="Start date"></td>
        <td><input name="t-end" type="date" value="${esc(t.end)}" aria-label="End date"></td>
        <td><input name="t-progress" type="number" min="0" max="100" value="${Number(t.progress) || 0}" aria-label="Percent complete"></td>
        <td><button type="button" class="icon-btn" data-remove aria-label="Remove task">✕</button></td>
      </tr>`).join('');
  }

  function lastTaskEnd() {
    const ends = draft.tasks.map((t) => t.end).filter(validDate).sort();
    return ends.length ? ends[ends.length - 1] : todayISO();
  }

  form.type.addEventListener('change', () => {
    // geometry shape differs between types, so drop it on switch
    draft.geometry = null;
    updateCategoryOptions();
    updateGeoStatus();
  });

  $('#btn-add-task').addEventListener('click', () => {
    draft.tasks = readTaskRows();
    const start = lastTaskEnd();
    draft.tasks.push({ id: uid(), name: '', start, end: addMonths(start, 3), progress: 0 });
    renderTaskRows();
    $('#task-rows tr:last-child input').focus();
  });

  $('#btn-template').addEventListener('click', () => {
    draft.tasks = readTaskRows();
    if (draft.tasks.length && !confirm('Replace the current tasks with the standard phases?')) return;
    const base = todayISO().slice(0, 8) + '01';
    draft.tasks = STANDARD_PHASES.map(([name, offset, dur]) => ({
      id: uid(), name, start: addMonths(base, offset), end: isoDate(toUTC(addMonths(base, offset + dur)) - DAY), progress: 0,
    }));
    renderTaskRows();
  });

  $('#task-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    draft.tasks = readTaskRows().filter((t) => t.id !== btn.closest('tr').dataset.id);
    renderTaskRows();
  });

  editor.addEventListener('click', (e) => {
    if (e.target.closest('[data-close]')) editor.close();
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const err = $('#editor-error');
    const data = Object.fromEntries(['name', 'ref', 'type', 'category', 'municipality', 'status', 'lead', 'budget', 'contractor', 'description']
      .map((k) => [k, form[k].value.trim()]));
    const tasks = readTaskRows();
    const problems = [];
    if (!data.name) problems.push('Project name is required.');
    tasks.forEach((t, i) => {
      const label = t.name || `Task ${i + 1}`;
      if (!validDate(t.start) || !validDate(t.end)) problems.push(`${label}: start and end dates are required.`);
      else if (t.end < t.start) problems.push(`${label}: end date is before start date.`);
    });
    if (problems.length) {
      err.textContent = problems.join(' ');
      err.hidden = false;
      return;
    }
    const sources = form.sources.value.split(/\s+/).filter(Boolean);
    const project = { ...draft, ...data, budget: data.budget === '' ? '' : Number(data.budget), sources, tasks };
    const idx = projects.findIndex((p) => p.id === project.id);
    if (idx >= 0) projects[idx] = project; else projects.push(project);
    if (impact && impact.projectId === project.id && impact.geomKey !== geomKey(project)) clearImpact();
    save();
    editor.close();
    draft = null;
    select(project.id);
  });

  // ---------- drawing ----------
  $('#btn-draw').addEventListener('click', () => {
    draft.tasks = readTaskRows();
    for (const k of ['name', 'ref', 'type', 'category', 'municipality', 'status', 'lead', 'budget', 'contractor', 'description']) {
      draft[k] = form[k].value;
    }
    draft.sources = form.sources.value.split(/\s+/).filter(Boolean);
    startDrawing(form.type.value);
  });

  function startDrawing(type) {
    drawState = { type, points: [] };
    editor.close(); // a modal dialog would make the map inert
    document.body.classList.add('placing');
    $('.map-wrap').classList.add('drawing');
    $('#draw-bar').hidden = false;
    $('#draw-undo').hidden = type !== 'linear';
    updateDrawBar();
    if (hasGeometry(draft) && draft.type === type) zoomTo(draft);
    setTimeout(() => map.invalidateSize(), 0);
  }

  function updateDrawBar() {
    const n = drawState.points.length;
    $('#draw-msg').textContent = drawState.type === 'linear'
      ? (n < 2 ? `Click along the alignment to add points (${n} so far, need 2+).` : `${n} points · ${polylineKm(drawState.points).toFixed(2)} km. Keep clicking or press Done.`)
      : (n ? 'Site placed. Click elsewhere to move it, or press Done.' : 'Click the map to place the site.');
    $('#draw-done').disabled = drawState.type === 'linear' ? n < 2 : n < 1;
    drawLayer.clearLayers();
    if (!n) return;
    if (drawState.type === 'linear') {
      L.polyline(drawState.points, { color: '#d92d20', weight: 4, dashArray: '6 6' }).addTo(drawLayer);
      drawState.points.forEach((pt) => L.circleMarker(pt, { radius: 5, color: '#d92d20', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(drawLayer));
    } else {
      L.circleMarker(drawState.points[0], { radius: 9, color: '#d92d20', fillColor: '#d92d20', fillOpacity: 0.6, weight: 3 }).addTo(drawLayer);
    }
  }

  function endDrawing(commit) {
    if (commit) {
      const pts = drawState.points.map(([a, b]) => [+a.toFixed(6), +b.toFixed(6)]);
      draft.geometry = drawState.type === 'linear' ? pts : pts[0];
    }
    drawState = null;
    drawLayer.clearLayers();
    document.body.classList.remove('placing');
    $('.map-wrap').classList.remove('drawing');
    $('#draw-bar').hidden = true;
    updateGeoStatus();
    editor.showModal();
  }

  map.on('click', (e) => {
    if (!drawState) return;
    const pt = [e.latlng.lat, e.latlng.lng];
    if (drawState.type === 'linear') drawState.points.push(pt); else drawState.points = [pt];
    updateDrawBar();
  });
  $('#draw-undo').addEventListener('click', () => { drawState.points.pop(); updateDrawBar(); });
  $('#draw-done').addEventListener('click', () => endDrawing(true));
  $('#draw-cancel').addEventListener('click', () => endDrawing(false));
  document.addEventListener('keydown', (e) => {
    if (!drawState) return;
    if (e.key === 'Escape') endDrawing(false);
    if (e.key === 'Enter' && !$('#draw-done').disabled) endDrawing(true);
  });

  // ---------- wiring ----------
  $('#project-list').addEventListener('click', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li) select(li.dataset.id);
  });

  $('#detail').addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]')?.dataset.tab;
    if (tab) { detailTab = tab; renderDetail(); return; }
    const row = e.target.closest('tr[data-idx]');
    if (row) { focusImpactItem(Number(row.dataset.idx)); return; }
    const action = e.target.closest('[data-action]')?.dataset.action;
    const p = projects.find((x) => x.id === selectedId);
    if (!action || !p) return;
    if (action === 'impact-run') runImpact(p);
    if (action === 'impact-clear') { clearImpact(); renderDetail(); }
    if (action === 'impact-csv' && impact) {
      const name = p.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
      download(`${name}-impacted-properties.csv`, PeelProperties.toCSV(impact.items), 'text/csv');
    }
    if (action === 'parcels-load') $('#file-parcels').click();
    if (action === 'parcels-remove' && confirm('Remove the loaded parcel layer?')) {
      parcels = null;
      PeelProperties.clearParcels().catch(() => {});
      if (impact && impact.source === 'parcels') clearImpact();
      renderParcelOutlines();
      renderDetail();
    }
    if (action === 'close') select(null, false);
    if (action === 'zoom') zoomTo(p);
    if (action === 'edit') openEditor(p);
    if (action === 'delete' && confirm(`Delete “${p.name}”? This cannot be undone.`)) {
      projects = projects.filter((x) => x.id !== p.id);
      save();
      select(null, false);
    }
  });

  $('#detail').addEventListener('change', (e) => {
    const p = projects.find((x) => x.id === selectedId);
    if (!p || !impact) return;
    if (e.target.name === 'impact-buffer') {
      const v = Math.round(Number(e.target.value));
      impact.buffer = Math.max(5, Math.min(1000, Number.isFinite(v) && v > 0 ? v : bufferDefault[p.type]));
      bufferDefault[p.type] = impact.buffer;
      e.target.value = impact.buffer;
    }
    if (e.target.name === 'impact-source') impact.source = e.target.value;
  });
  $('#detail').addEventListener('keydown', (e) => {
    const row = e.target.closest('tr[data-idx]');
    if (row && e.key === 'Enter') focusImpactItem(Number(row.dataset.idx));
  });

  $('#btn-new').addEventListener('click', () => openEditor(null));
  $('#search').addEventListener('input', () => { renderList(); renderMap(); });
  $('#filter-muni').addEventListener('change', () => { renderList(); renderMap(); });
  document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => {
    typeFilter = b.dataset.type;
    document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('active', x === b));
    renderList();
    renderMap();
  }));

  function download(filename, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  $('#btn-export').addEventListener('click', () => {
    download(`peel-projects-${todayISO()}.json`, JSON.stringify(projects, null, 2), 'application/json');
  });

  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!Array.isArray(data)) throw new Error('Expected a JSON array of projects.');
      const cleaned = data.filter((p) => p && typeof p === 'object' && p.name).map((p) => ({
        ...p,
        id: String(p.id || uid()),
        type: p.type === 'vertical' ? 'vertical' : 'linear',
        tasks: Array.isArray(p.tasks) ? p.tasks.map((t) => ({ ...t, id: String(t.id || uid()) })) : [],
      }));
      const replace = projects.length && confirm(`Import ${cleaned.length} projects.\n\nOK = replace existing projects\nCancel = add to existing projects`);
      if (replace) projects = cleaned;
      else {
        const ids = new Set(projects.map((p) => p.id));
        projects = projects.concat(cleaned.map((p) => (ids.has(p.id) ? { ...p, id: uid() } : p)));
      }
      save();
      select(null, false);
    } catch (err) {
      alert(`Could not import file: ${err.message}`);
    }
  });

  $('#btn-reset').addEventListener('click', () => {
    if (projects.length && !confirm('Replace all current projects with the bundled Peel Region project list?')) return;
    projects = seedProjects();
    save();
    select(null, false);
    map.setView(PEEL_CENTER, PEEL_ZOOM);
  });

  renderLegend();
  renderAll();

  // ---------- bundled data ----------
  // Peel Region projects compiled from public sources (data/peel-projects.js).
  function seedProjects() {
    const data = Array.isArray(window.PEEL_PROJECTS) ? window.PEEL_PROJECTS : [];
    return JSON.parse(JSON.stringify(data)).map((p) => ({
      ...p,
      id: uid(),
      tasks: (p.tasks || []).map((t) => ({ ...t, id: uid() })),
    }));
  }
})();
