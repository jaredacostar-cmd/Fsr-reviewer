(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc, dot, fmtNum } = window.PeelUtil;
  const P = window.PeelPhases;
  const CFG = window.PEEL_CONFIG;
  const map = window.PeelMapCore.map;
  const PA = () => window.PeelPlanAreas;
  const SD = () => window.PeelSvcData;
  const MP = () => window.PeelMasterPlan;
  const DI = () => window.PeelDcInfra;
  const MA = () => window.PeelMapAnalysis;
  const MM = () => window.PeelMapMarkers;
  const Nav = () => window.PeelDevNav;
  const DT = () => window.PeelDataTab;
  const AC = () => window.PeelAerialCheck;
  const TL = () => window.PeelTimeline;
  const FU = () => window.PeelFilterUI;
  const SvcTab = () => window.PeelSvcTab;
  const App = () => window.PeelApp;

  // ---- Events ----------------------------------------------------------------------
  // A tap shows that phase only (again: all phases). Ctrl / ⌘ + click adds or removes it instead,
  // so several phases can be picked.
  function togglePhase(key, add) {
    if (add) {
      const all = App().state.phases.size === P.ALL_PHASES.length, next = new Set(all ? [] : App().state.phases);
      if (next.has(key)) next.delete(key); else next.add(key);
      App().state.phases = next.size ? next : new Set(P.ALL_PHASES.map(p => p.key));
    } else {
      const only = App().state.phases.size === 1 && App().state.phases.has(key);
      App().state.phases = new Set(only ? P.ALL_PHASES.map(p => p.key) : [key]);
    }
    App().applyFilters();
  }
  // Stage rows toggle their phase on and off (SPEC §4: "tap to toggle"); a tap on the bar shows that
  // phase only (Ctrl / ⌘ adds or removes it).
  $('#pipeline').onclick = e => {
    const b = e.target.closest('[data-phase]'); if (!b) return;
    if (b.closest('.pipe-rows')) {
      // (one row can hold two phases of one stage: "permit construction")
      const ks = b.dataset.phase.split(' '), next = new Set(App().state.phases), on = ks.every(k => next.has(k));
      for (const k of ks) { if (on) next.delete(k); else next.add(k); }
      App().state.phases = next.size ? next : new Set(App().DEFAULT_PHASES()); App().applyFilters(); return;
    }
    togglePhase(b.dataset.phase, e.ctrlKey || e.metaKey);
  };

  // Typing finds; it no longer filters the whole app. The list is filtered by the text only when you
  // choose "Filter the list by …" (the last suggestion), which shows as a filter chip.
  const filterBy = q => { App().state.search = String(q || '').trim().toLowerCase(); $('#f-search').value = ''; App().applyFilters(); };
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
  // What tells two developments at the same address apart: units, the main file number, the plan.
  function devLine(p, ql) {
    const ML = window.PeelMapLabels, ls = ML && ML.latestSub ? ML.latestSub(p) : null;
    const hit = ql && p.records.find(r => r.ref && r.ref.toLowerCase().startsWith(ql));
    const ref = (hit && hit.ref) || (ls && ls.ref) || '';
    const A = App().state.areas, sp = A && (p.sp || []).length ? (A.secondaryPlans.find(a => a.id === p.sp[0]) || {}).name : '';
    return [p.municipality, P.PHASE_BY_KEY[p.phase].label, p.units ? `${fmtNum(p.units)} units` : '', ref, sp].filter(Boolean).map(esc).join(' · ');
  }
  function renderSug() {
    sugEl.hidden = !sugItems.length;
    const ql = $('#f-search').value.trim().toLowerCase();
    let placed = false;
    sugEl.innerHTML = sugItems.map((x, i) => {
      // (places and facilities in their own group, under the developments)
      const head = !placed && (x.place || x.g) && i > 0 ? (placed = true, '<li class="sug-h" role="presentation">Places and facilities</li>') : '';
      if (x.place || x.g) placed = true;
      return `${head}<li role="option" data-i="${i}" class="${i === sugSel ? 'on' : ''}${x.filter ? ' sug-filter' : ''}" aria-selected="${i === sugSel}">${x.p ? dot(x.p.phase) : x.filter ? '<span class="sug-fl" aria-hidden="true">⌕</span>' : '<span class="sug-pin" aria-hidden="true"></span>'}<span>${esc(x.label)}<small>${x.p ? devLine(x.p, ql) : x.filter ? 'the developments, the map and every tab, until you remove the chip' : x.place ? esc(x.place.kind) : x.loading ? 'searching addresses…' : x.kind || 'Go to address'}</small></span></li>`;
    }).join('');
  }
  async function updateSug(q) {
    const seq = ++sugSeq;
    if (q.length < 3) { sugItems = []; renderSug(); return; }
    const ql = q.toLowerCase();
    const devs = App().state.projects.filter(p => p.lat != null && (p.title.toLowerCase().includes(ql) || p.records.some(r => (r.address || '').toLowerCase().includes(ql) || (ql.length >= 5 && /\d/.test(ql) && (r.ref || '').toLowerCase().startsWith(ql)))))
      .sort((a, b) => (b.title.toLowerCase().startsWith(ql) - a.title.toLowerCase().startsWith(ql)) || (b.units || 0) - (a.units || 0)).slice(0, 4);
    const places = placeMatches(ql);
    const filterItem = { label: `Filter the list by “${q}”`, filter: q };
    sugItems = [...devs.map(p => ({ label: p.title, p })), ...places, ...(/\d/.test(q) || q.length > 4 ? [{ label: q, loading: true }] : []), filterItem];
    sugSel = -1; renderSug();
    if (!sugItems.some(x => x.loading)) return;
    const geo = await geocode(q);
    if (seq !== sugSeq) return;
    sugItems = [...devs.map(p => ({ label: p.title, p })), ...places, ...geo.map(g => ({ label: g.label, g, kind: /&| and /i.test(q) ? 'Go to intersection' : null })), filterItem];
    renderSug();
  }
  // Places in the search: secondary plans / character areas, MTSAs, pressure zones, catchments and
  // pumping stations, DC projects (by number or name) and DC facilities.
  function placeMatches(ql) {
    const out = [], has = t => String(t || '').toLowerCase().includes(ql);
    const area = (kind, a, go) => out.push({ label: a.name, place: { kind, go } });
    if (App().state.areas) {
      for (const a of App().state.areas.secondaryPlans) if (has(a.name)) area(`${a.municipality || ''} ${a.municipality === 'Mississauga' ? 'character area' : 'secondary plan'}`.trim(), a, () => { App().state.sp = [a.id]; PA().renderAreaSelects(); PA().showArea(true); App().applyFilters(); });
      for (const a of App().state.areas.mtsas) if (has(a.name)) area('MTSA (major transit station area)', a, () => { App().state.mtsa = [a.id]; PA().renderAreaSelects(); PA().showArea(true); App().applyFilters(); });
    }
    if (App().state.servicing) {
      // Servicing items open as servicing scopes (design audit, Group 5).
      const SS = () => window.PeelSvcScope;
      for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) if (has(SD().PLANT_NAME[pl]) || has(SD().PLANT_SHORT[pl])) out.push({ label: SD().plantLabel(pl), place: { kind: 'Wastewater treatment plant', go: () => SS().open(`plant:${pl}`) } });
      if (has('south peel') || has('water system')) out.push({ label: 'South Peel water system', place: { kind: 'Water system (lake-based)', go: () => SS().open('wsys:lake') } });
      for (const a of App().state.servicing.zones) if (has(a.name)) area('Water pressure zone', a, () => SS().open(a.id));
      for (const a of App().state.servicing.psAreas || []) if (has(SD().drName(a))) out.push({ label: SD().drName(a), place: { kind: 'Pumping station catchment', go: () => SS().open(a.id) } });
      for (const a of App().state.servicing.drainage) if (has(SD().drName(a))) out.push({ label: SD().drName(a), place: { kind: a.kind === 'ps' ? 'Pumping station catchment' : a.kind === 'block' ? 'Wastewater block' : 'Sanitary catchment', go: () => SS().open(a.id) } });
    }
    if (App().state.dcInfra && ql.length >= 3) {
      const seen = new Set();
      for (const sys of ['wastewater', 'water']) for (const ln of App().state.dcInfra[sys].lines) {
        const k = ln.p || ln.c; if (!k || seen.has(k) || !(has(ln.p) || has(ln.n))) continue; seen.add(k);
        out.push({ label: `DC project ${ln.p || ln.c}${ln.n ? ` – ${ln.n}` : ''}`, place: { kind: `${DI().DC_KIND[ln.k][0]}${ln.y ? ` · ${ln.y}` : ''}`, go: () => { if (!MM().getDcOn().on) MA().setDcOn({ on: true, sys: 'both' }); MP().showDcLine(ln); map.fitBounds(L.latLngBounds(ln.g.map(([x, y]) => [y, x])), { maxZoom: 15, padding: [30, 30] }); } } });
      }
      for (const sys of ['wastewater', 'water']) for (const fc of App().state.dcInfra[sys].facilities) if (has(fc.name) || fc.items.some(i => has(i.proj))) out.push({ label: fc.name, place: { kind: `${DI().DC_FAC[fc.kind] || fc.kind} · DC ${sys}`, go: () => { if (!MM().getDcOn().on) MA().setDcOn({ on: true, sys: 'both' }); DI().showFacility(fc); if (fc.g) map.setView([fc.g[1], fc.g[0]], Math.max(map.getZoom(), 14)); } } });
    }
    return out.slice(0, 5);
  }
  const pinLayer = L.layerGroup().addTo(map);
  function goSug(x) {
    if (!x || x.loading) return;
    sugItems = []; renderSug();
    if (x.filter) { filterBy(x.filter); return; }
    // Picking opens it: the box empties and nothing is left filtered.
    $('#f-search').value = '';
    // On a phone the search sits in the list view: switch to the map to show the place.
    if (innerWidth <= 700 && $('#sidebar').classList.contains('open')) { DT().toggleSidebar(false); setTimeout(() => map.invalidateSize(), 50); }
    if (x.p) { Nav().showDetail(x.p); return; }
    if (x.place) return x.place.go();
    // An address: pan and zoom there with a pin.
    pinLayer.clearLayers();
    L.marker([x.g.lat, x.g.lng], { icon: L.divIcon({ className: 'addr-pin', html: '<span></span>', iconSize: [22, 22], iconAnchor: [11, 22] }), keyboard: false })
      .bindTooltip(`<strong>${esc(x.g.label)}</strong><br><span class="muted">Tap to remove</span>`, { className: 'pt', direction: 'top', offset: [0, -20], permanent: true })
      .on('click', () => pinLayer.clearLayers()).addTo(pinLayer);
    map.setView([x.g.lat, x.g.lng], 17);
    if (innerWidth <= 700) AC().closeDetail();
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
      const ready = sugItems.find(x => !x.loading && !x.filter);
      if (ready) return goSug(ready);
      const geo = await geocode(q); if (geo.length) goSug({ label: geo[0].label, g: geo[0] });
    } else if (e.key === 'Escape') { sugItems = []; renderSug(); }
  });
  sugEl.addEventListener('mousedown', e => { const li = e.target.closest('[data-i]'); if (li) { e.preventDefault(); goSug(sugItems[+li.dataset.i]); } });
  $('#f-search').addEventListener('blur', () => setTimeout(() => { sugItems = []; renderSug(); }, 150));
  // Record-type controls (Find › What): kind and new-build only.
  document.addEventListener('change', e => {
    if (e.target.id === 'f-kind') { App().state.kind = e.target.value; App().applyFilters(); }
    else if (e.target.id === 'f-new') { App().state.newOnly = e.target.checked; App().applyFilters(); }
  });
  // Unified filter panel.
  const panelChange = (id, fn) => { const el = $(id); if (el) el.onchange = fn; };
  const panelClick = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
  function syncPanelYears() {
    const lo = App().state.yearMin, hi = App().state.yearMax; if (lo == null) return;
    const yf = $('#f-yfrom'), yt = $('#f-yto');
    let a = parseInt((yf && yf.value) || '', 10), b = parseInt((yt && yt.value) || '', 10);
    if (!isFinite(a)) a = App().state.yearFrom ?? lo; if (!isFinite(b)) b = App().state.yearTo ?? hi;
    TL().setYears(a, b);
  }
  panelChange('#f-size', e => { App().state.minUnits = Number(e.target.value) || 0; App().applyFilters(); });
  panelChange('#f-plant', e => { App().state.plant = e.target.value; App().applyFilters(); });
  panelChange('#f-dwelling', e => { App().state.dwelling = e.target.value; App().applyFilters(); });
  panelChange('#f-landuse', e => { App().state.landuse = e.target.value || App().DEFAULT_LANDUSE; App().applyFilters(); });
  panelChange('#f-milestone', e => { App().state.yearMode = e.target.value; const tm = $('#t-mode'); if (tm) tm.value = App().state.yearMode; App().applyFilters(); });
  panelChange('#f-yfrom', syncPanelYears); panelChange('#f-yto', syncPanelYears);
  panelClick('#f-when-12m', () => TL().setLast12Months());
  panelClick('#f-when-week', () => { App().state.flags.week = true; App().applyFilters(); });
  panelClick('#flag-chips', e => { const b = e.target.closest('[data-flag]'); if (b) FU().toggleFlag(b.dataset.flag); });
  panelClick('#f-muni', e => {
    const b = e.target.closest('[data-muni]'); if (!b) return;
    App().state.muni = b.dataset.muni;
    // An area in another municipality no longer applies.
    const keep = id => !id || !App().state.muni || (PA().areaById.get(id) || {}).municipality === App().state.muni;
    App().state.sp = App().state.sp.filter(keep);
    App().state.mtsa = App().state.mtsa.filter(keep);
    renderMuniChips();
    PA().renderAreaSelects();
    PA().showArea();
    PA().renderPlanAreas();
    App().applyFilters();
  });
  panelClick('#saved-presets', e => { const d = e.target.closest('[data-preset-del]'); if (d) { MA().deleteSavedView(+d.dataset.presetDel); return; } const b = e.target.closest('[data-preset]'); if (b) MA().openSavedView(+b.dataset.preset); });
  // The sp / mtsa / pz / dr dropdowns live in the filter panel (#f-areas) now.
  // NOTE: the #f-areas fill (faBox.innerHTML = areaMultiHTML()) moved to js/plan-areas.js
  // top-level: PeelPlanAreas loads after this module, so it cannot run here.
  // Push the filter state into every panel control (after a share link, a saved view or Reset).
  function syncFilterControls() {
    const setV = (id, v) => { const el = $(id); if (el) el.value = v; };
    const setC = (id, v) => { const el = $(id); if (el) el.checked = !!v; };
    setV('#f-search', App().state.search);
    setV('#f-kind', App().state.kind); setC('#f-new', App().state.newOnly);
    setV('#f-size', String(App().state.minUnits));
    setV('#f-plant', App().state.plant); setV('#f-dwelling', App().state.dwelling); setV('#f-landuse', App().state.landuse);
    setV('#f-milestone', App().state.yearMode); setV('#t-mode', App().state.yearMode);
    const yf = $('#f-yfrom'); if (yf) yf.value = App().state.yearFrom == null ? '' : App().state.yearFrom;
    const yt = $('#f-yto'); if (yt) yt.value = App().state.yearTo == null ? '' : App().state.yearTo;
    renderMuniChips(); if (App().state.areas) PA().renderAreaSelects(); SD().renderSvcSelects();
    FU().renderFlagChips(); SvcTab().renderScenario();
  }

  // Municipality chips (built from the data) in the filter panel.
  function renderMuniChips() {
    const el = $('#f-muni'); if (!el) return;
    const list = [''].concat(App().state.munis || []);
    el.innerHTML = list.map(m =>
      `<button type="button" class="chip${App().state.muni === m ? ' on' : ''}" data-muni="${esc(m)}" data-info="muni-${esc(m || 'all')}" aria-pressed="${App().state.muni === m}">${esc(m || 'All')}</button>`).join('');
  }

  const api = { togglePhase, geocode, pinLayer, syncFilterControls, renderMuniChips, syncPanelYears };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSearchFilter = api;
})(typeof window !== 'undefined' ? window : globalThis);
