/* Map analysis — style/views/capacity layer, saved views, legend, map
 * Phase 6 extraction from js/app.js (app.js 5842-6159).
 * control boxes layout.
 */
(function (root) {
  'use strict';

  const P = window.PeelPhases;
  const PD = window.PeelDesign;
  const { $, esc, fmtNum, token, unit, uML, dot, store, PIPE_RESULTS } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MC = () => window.PeelMapCore;
  const MM = () => window.PeelMapMarkers;
  const ML = () => window.PeelMapLabels;
  const CA = () => window.PeelCensusAreas;
  const SD = () => window.PeelSvcData;
  const ST = () => window.PeelSewerTrace;
  const SC = () => window.PeelSewerCap;
  const DI = () => window.PeelDcInfra;
  const WT = () => window.PeelWaterTrace;
  const EP = () => window.PeelExistPipes;
  const TS = () => window.PeelToolScope;
  const RL = () => window.PeelRenderList;
  const SvcTab = () => window.PeelSvcTab;
  const SP = () => window.PeelSvcPlants;
  const Sh = () => window.PeelShare;
  const AS = () => window.PeelAreaSelect;

  // ---- Map analysis: style, Planning / Servicing views, capacity layer, "What loads this?" ----
  function setMapStyle(ch) {
    Object.assign(MM().mstyle, ch); store.set('mapStyle', MM().mstyle);
    syncMapOpts();
    if ('color' in ch || 'size' in ch || 'show' in ch) RL().renderMarkers();
    if ('cap' in ch) { renderCapLayer(); if (MM().pipeLbl && MM().getExistOn().sanitary) EP().renderExisting(); }
    renderLegend(); Sh().viewLink.write();
  }
  function setDcOn(d) {
    MM().setDcOn({ ...MM().getDcOn(), ...d }); store.set('dcOn', MM().getDcOn().on); store.set('dcSys', MM().getDcOn().sys);
    DI().renderDcLayer(); renderLegend(); syncMapOpts(); Sh().viewLink.write();
  }
  function setExistOn(e) { MM().setExistOn({ ...MM().getExistOn(), ...e }); store.set('existOn', MM().getExistOn()); EP().renderExisting(); renderLegend(); syncMapOpts(); }
  const currentView = () => { const v = store.get('mapView', 'planning'); return v === 'servicing' ? 'water' : MM().MAP_VIEWS.some(([k]) => k === v) ? v : 'planning'; };
  // Set once at startup too (applyViewSettings only runs on switches).
  document.documentElement.dataset.mapview = currentView();
  function syncMapOpts() {
    const set = (id, v) => { const e = $(id); if (e) { if (e.type === 'checkbox') e.checked = v; else e.value = v; } };
    set('#opt-mcolor', MM().mstyle.color); set('#opt-msize', MM().mstyle.size); set('#opt-mcap', MM().mstyle.cap);
    set('#opt-devs', MM().getDevsOn()); set('#opt-wf', WT().WF.on);
    const wc = $('#ww-census'); if (wc) wc.checked = MM().getWwLay().existing !== false;
    const mw = document.querySelector('.ww-loads'); if (mw) { mw.hidden = !MM().isWW(); const all = Object.values(MM().getWwLay()).every(v => v !== false); const n = mw.querySelector('.wl-sum'); n.textContent = all ? 'full build-out' : [['existing', 'census'], ['built', 'built'], ['approved', 'committed'], ['proposed', 'proposed']].filter(([k]) => MM().getWwLay()[k] !== false).map(([, t]) => t).join(' + ') || 'none'; n.classList.toggle('on', !all); }
    SD().syncDevsOff(); SD().syncPanelSum();
    set('#opt-basemap', MC().getBasemap()); set('#opt-labels', ML().getLabelMode()); set('#opt-pz', MM().svcOn.pz); set('#opt-dr', MM().svcOn.dr); set('#opt-bk', MM().svcOn.bk); set('#opt-da', CA().getDaOn());
    set('#opt-cap', MM().mstyle.cap !== 'off'); set('#opt-exist', Object.values(MM().getExistOn()).some(Boolean)); set('#opt-dcw', MM().getDcOn().on); set('#opt-plan', MM().areaOn.sp || MM().areaOn.mtsa);
    for (const k of ['water', 'sanitary', 'storm']) set(`[data-exist="${k}"]`, !!MM().getExistOn()[k]);
    for (const k of ['water', 'wastewater']) set(`[data-dcsys="${k}"]`, MM().getDcOn().on && (MM().getDcOn().sys === 'both' || MM().getDcOn().sys === k));
    const v = currentView();
    document.querySelectorAll('[data-mview]').forEach(b => b.classList.toggle('on', b.dataset.mview === v));
    if (LG()) LG().sync();
  }
  // Map views: Planning (how it was), Water and Wastewater (servicing review, one system each) and
  // DC (servicing timing against the 2026 DC program). Switching saves the current settings under the
  // view being left and restores the other view's last settings (its preset the first time).
  // The per-view basemap comes from PeelDesign.basemapForView (single source of
  // truth, unit-tested): 'auto' (grey map, aerial from street zoom) for every view.
  const VIEW_PRESETS = {
    // Stage 3 (layer groups): everything off except Developments; each view adds its own layers
    // (PeelLayerGroups.PRESETS; the groups' other layers — constraints, plan areas, hillshade — come
    // from LG_EXTRA below).
    planning: { basemap: PD.basemapForView('planning'), labelMode: 'address-units', da: false, pz: false, dr: false, mstyle: { color: 'phase', size: 'units', cap: 'off', show: 'markers' }, focus: null, exist: { water: false, sanitary: false, storm: false }, wf: false, dc: { on: false, sys: 'both' } },
    water: { basemap: PD.basemapForView('water'), labelMode: 'off', da: false, pz: true, dr: false, mstyle: { color: 'layer', size: 'pop', cap: 'zone', show: 'markers' }, focus: null, exist: { water: true, sanitary: false, storm: false }, wf: true, dc: { on: true, sys: 'water' } },
    wastewater: { basemap: PD.basemapForView('wastewater'), labelMode: 'off', da: false, pz: false, dr: true, mstyle: { color: 'layer', size: 'pop', cap: PIPE_RESULTS ? 'pipes' : 'growth', show: 'markers' }, focus: null, exist: { water: false, sanitary: true, storm: false }, wf: false, dc: { on: true, sys: 'wastewater' } },
    dc: { basemap: PD.basemapForView('dc'), labelMode: 'off', da: false, pz: false, dr: false, mstyle: { color: 'timing', size: 'pop', cap: 'off', show: 'markers' }, focus: null, exist: { water: false, sanitary: false, storm: false }, wf: false, dc: { on: true, sys: 'both' } },
  };
  // The layers the settings above don't carry: developments, site boundary on hover, plan areas,
  // constraints, hillshade. A view's saved settings list them (layers: [...]); its preset takes
  // them from PeelLayerGroups.PRESETS. Saved views from before the groups leave them as they are.
  const LG = () => window.PeelLayerGroups;
  const LG_EXTRA = ['devs', 'hov', 'sp', 'pr', 'mtsa', 'hill', 'cons', 'ea', 'reg', 'flood', 'greenbelt', 'orm', 'nep', 'natural', 'nhs', 'water'];
  function currentMapSettings() { return { basemap: MC().getBasemap(), labelMode: ML().getLabelMode(), da: CA().getDaOn(), wf: WT().WF.on, pz: MM().svcOn.pz, dr: App().state.servicing && App().state.servicing.blocks ? MM().svcOn.bk : MM().svcOn.dr, mstyle: { ...MM().mstyle }, exist: { ...MM().getExistOn() }, dc: { ...MM().getDcOn() }, ...(LG() ? { layers: [...LG().onSet()], groups: [...LG().getOpen()] } : {}) }; }
  function setMapView(v) {
    const cur = currentView();
    if (cur === v) return;
    // (in a workspace the map shows the chip's lean layers: they are not the full map's memory of a view)
    if (!(window.PeelWorkspaces && window.PeelWorkspaces.mode() === 'ws')) store.set(`mapView-${cur}`, currentMapSettings());
    applyViewSettings(v, store.get(`mapView-${v}`, null));
  }
  // Apply a view's layers and style (its saved settings over its preset).
  function applyViewSettings(v, saved) {
    const p = VIEW_PRESETS[v] || VIEW_PRESETS.planning;
    const s = { ...p, ...(saved || {}) };
    store.set('mapView', v);
    // Exposed for CSS: the Planning aerial is darkened slightly (css/modes.css).
    document.documentElement.dataset.mapview = v;
    if (MC().basemapKey(s.basemap)) { MC().setBasemap(s.basemap); store.set('basemap', MC().getBasemap()); MC().setTiles(); CA().restyleDa(); }
    if (ML().LABEL_MODES[s.labelMode]) { ML().setLabelMode(s.labelMode); store.set('labelMode', ML().getLabelMode()); }
    CA().setDaLayer(!!s.da); SD().setSvcLayer('pz', !!s.pz); SD().setSvcLayer('dr', !!s.dr); WT().setWfOn(!!s.wf);
    Object.assign(MM().mstyle, s.mstyle); store.set('mapStyle', MM().mstyle);
    MM().setExistOn({ ...p.exist, ...(s.exist || {}) }); store.set('existOn', MM().getExistOn()); EP().renderExisting();
    MM().setDcOn({ ...p.dc, ...(s.dc || {}) }); store.set('dcOn', MM().getDcOn().on); store.set('dcSys', MM().getDcOn().sys); DI().renderDcLayer();
    // The groups' other layers: as saved for this view, else its preset (old saved views: unchanged).
    if (LG()) {
      const extra = new Set(LG_EXTRA);
      if (saved && Array.isArray(saved.layers)) LG().apply(new Set(saved.layers), extra);
      else if (!saved) LG().apply(LG().presetFor(v), extra);
    }
    App().applyFilters();
    renderCapLayer(); renderLegend(); syncMapOpts(); ML().updateLabels(); Sh().viewLink.write();
  }

  // Stage 4: a workspace shows a view from its preset without saving anything (remembered: false), and
  // the full map takes the view back with its remembered settings; rememberCurrent() keeps the full
  // map's settings of the view open when the workspace starts.
  function showView(v, { remembered = false } = {}) { applyViewSettings(v, remembered ? store.get(`mapView-${v}`, null) : null); }
  function rememberCurrent() { store.set(`mapView-${currentView()}`, currentMapSettings()); }
  // "Reset" in the Layers panel: the current view back to its preset (its memory cleared).
  function resetView() { const v = currentView(); store.set(`mapView-${v}`, null); applyViewSettings(v, null); }

  // Saved views: a name for the filters, map position, view and layers (kept in this browser).
  const savedViews = () => store.get('savedViews', []) || [];
  // Bundle 6: views are saved in one place (Export › Save this view…, beside the share link) and
  // open from one-tap chips at the top of Find, each with × to delete it.
  function renderSavedPresets() {
    const el = $('#saved-presets'); if (!el) return;
    const list = savedViews();
    el.innerHTML = list.map((x, i) => `<span class="chip-saved"><button type="button" class="chip" data-preset="${i}" title="Apply the saved view “${esc(x.name)}”">${esc(x.name)}</button><button type="button" class="chip-x" data-preset-del="${i}" aria-label="Delete the saved view “${esc(x.name)}”" title="Delete this saved view">×</button></span>`).join('');
  }
  function deleteSavedView(i) {
    const list = savedViews(), x = list[i]; if (!x || !confirm(`Delete the saved view “${x.name}”?`)) return;
    list.splice(i, 1); store.set('savedViews', list); renderSavedViews();
  }
  function renderSavedViews() { renderSavedPresets(); }
  function saveCurrentView() {
    const name = (prompt('Name this view (filters, map position, view and layers):', '') || '').trim(); if (!name) return;
    const list = savedViews().filter(x => x.name !== name);
    list.push({ name, hash: Sh().viewLink.hash(), view: currentView(), settings: currentMapSettings(), saved: new Date().toISOString().slice(0, 10) });
    store.set('savedViews', list); renderSavedViews();
  }
  function openSavedView(i) {
    const x = savedViews()[i]; if (!x) return;
    store.set(`mapView-${currentView()}`, currentMapSettings());
    applyViewSettings(x.view, x.settings);
    Sh().viewLink.apply(x.hash);
  }

  // Capacity layer: catchments coloured by their local flow growth over the census, pumping
  // station catchments by build-out peak wet weather flow as % of firm capacity, or pressure zones
  // by maximum day growth; with the sewer network drawn outlet to outlet.
  const CAP_GROWTH = [[10, '--growth-1'], [25, '--growth-2'], [50, '--growth-3'], [100, '--growth-4'], [Infinity, '--growth-5']];
  const CAP_PS = [[80, '--cap-room'], [100, '--cap-tight'], [Infinity, '--cap-over']];
  // Colour for a value: the first class it falls under; Infinity (new, no census flow) takes the last.
  const bucket = (v, scale) => token(isNaN(v) ? '--nodata' : (scale.find(([t]) => v < t) || scale[scale.length - 1])[1]);
  const fmtPct = v => !isFinite(v) ? 'new (no census flow)' : `${v >= 0 ? '+' : ''}${Math.round(v)}%`;
  const capLayer = L.layerGroup().addTo(map);
  // Capacity by year: built since the census in full, approved and proposed growth phased in as in
  // Horizon years (approved over aYears from aStart, proposed over pYears from pStart).
  // Year the map's results are worked out for (map control); opens on this year.
  let capYear = MM().THIS_YEAR;
  // Before today (back to the census year): growth built since the census counts in the share of it
  // completed by the end of that year (Peel-wide, by units and completion date).
  function builtShare(y) {
    if (y == null || y >= MM().THIS_YEAR) return 1;
    const bc = CA().baselineCensus(); if (!bc) return 1;
    const k = `${bc.date}|${App().state.projects.length}`;
    if (builtShare.k !== k) {
      const by = new Map(); let tot = 0;
      for (const p of App().state.projects) if (MM().svcLayerOf(p) === 'built') { const u = p.units || 1, yr = new Date(+p.milestones.completed).getUTCFullYear(); by.set(yr, (by.get(yr) || 0) + u); tot += u; }
      builtShare.k = k; builtShare.by = by; builtShare.tot = tot;
    }
    if (!builtShare.tot) return 1;
    let n = 0; for (const [yr, u] of builtShare.by) if (yr <= y) n += u;
    return n / builtShare.tot;
  }
  const hzFrac = y => { const f = (start, n) => Math.min(1, Math.max(0, (y - start + 1) / Math.max(1, n))); return { fa: f(SP().hz.aStart, SP().hz.aYears), fp: f(SP().hz.pStart, SP().hz.pYears), fb: builtShare(y) }; };
  const atYear = (l, y) => { if (y == null || !l) return l; const { fa, fp, fb } = hzFrac(y); return { ...l, built: l.built * fb, jbuilt: (l.jbuilt || 0) * fb, approved: l.approved * fa, proposed: l.proposed * fp, japproved: (l.japproved || 0) * fa, jproposed: (l.jproposed || 0) * fp }; };
  const censusOnly = l => ({ census: l.census, built: 0, approved: 0, proposed: 0, jbuilt: 0, japproved: 0, jproposed: 0, ha: l.ha });
  // Build-out flows of a drainage area (design flows, as for pumping station firm capacity).
  // A pumping station's load when its sewershed isn't one of the catchments (blocks): what the
  // pipe arriving at it carries, from the sewer network: census people upstream, growth by layer
  // and the land draining through it (for I&I).
  function stationPipe(a) {
    if (a._pipe != null) return a._pipe;
    if (!MM().SEW.data || !a.outletAt) return -1;
    let best = -1, bp = -1;
    const gx = Math.floor(a.outletAt[0] / 0.004), gy = Math.floor(a.outletAt[1] / 0.003);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const k of MM().SEW.grid.get(`${gx + i},${gy + j}`) || []) {
      const p = MM().SEW.data.pipes[k]; if (DI().dcDist(a.outletAt, SC().pipeCoords(p)) > 120) continue;
      if (p[4] > bp) { bp = p[4]; best = k; }
    }
    return (a._pipe = best);
  }
  function psCum(a) {
    const k = stationPipe(a); if (k < 0) return null;
    const p = MM().SEW.data.pipes[k], G = SC().sewerGrowth();
    return { census: p[4], built: G.built.pop[k], approved: G.approved.pop[k], proposed: G.proposed.pop[k], jbuilt: G.built.jobs[k], japproved: G.approved.jobs[k], jproposed: G.proposed.jobs[k], ha: p[5] + G.built.ha[k] + G.approved.ha[k] + G.proposed.ha[k], pipe: k };
  }
  const psLoads = a => (App().state.svcModel && App().state.svcModel.cum.get(a.id)) || psCum(a);
  function psLoad(a, y = null) {
    const M = App().state.svcModel, sp = SD().spsOf(a), l = M && atYear(psLoads(a), y);
    if (!sp || !l) return null;
    const dry = M.pdwf(l, 1) * 1e6 / 86400, wet = (M.pdwf(l, 1) + M.ii(l)) * 1e6 / 86400;
    return { firm: sp.firmLs, dry, wet, pct: wet / sp.firmLs * 100 };
  }
  function capValue(a) {
    const M = App().state.svcModel;
    if (MM().mstyle.cap === 'zone') {
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
    if (MM().getDcOn().on) DI().renderDcLayer();
    if (window.PeelCapitalEA) window.PeelCapitalEA.renderIfChanged();
    // With capacity colours on, the developments step back (smaller, fainter); facilities carry rings.
    map.getContainer().classList.toggle('devs-quiet', MM().mstyle.cap !== 'off');
    if (WT().WF.on && WT().restyleWf) WT().restyleWf();
    if (MM().mstyle.cap === 'off' || !App().state.servicing || !App().state.svcModel) return;
    if (MM().mstyle.cap === 'pipes' && PIPE_RESULTS) { SC().renderPipes(capLayer); return; }
    const ll = rings => rings.map(r => r.map(([x, y]) => [y, x]));
    const list = MM().mstyle.cap === 'zone' ? App().state.servicing.zones : MM().mstyle.cap === 'ps' && App().state.servicing.blocks ? App().state.servicing.psAreas : App().state.servicing.drainage;
    for (const a of list) {
      let fill = null, tip = `<strong>${esc(a.zone ? a.name : SD().drName(a))}</strong>`;
      if (MM().mstyle.cap === 'ps') {
        const pl = psLoad(a, capYear);
        if (pl) { fill = bucket(pl.pct, CAP_PS); tip += `<br>Pumping station firm ${fmtNum(pl.firm)} L/s · ${capYear == null ? 'build-out' : capYear} peak dry ${fmtNum(Math.round(pl.dry))} L/s, peak wet ≈${fmtNum(Math.round(pl.wet))} L/s (<strong>${Math.round(pl.pct)}%</strong> of firm)`; }
        else tip += `<br><span class="muted">${a.kind === 'ps' ? 'Pumping station not in the master plan table' : 'Gravity catchment (no pumping station)'}</span>`;
      } else {
        const c = capValue(a);
        if (c) { fill = bucket(c.v, CAP_GROWTH); tip += `<br>${MM().mstyle.cap === 'zone' ? 'Max day' : 'Local average dry weather'} ${uML(c.now)} today → ${uML(c.bo)} ${capYear == null ? 'at build-out' : `by ${capYear}`} (<strong>${fmtPct(c.v)}</strong>)`; }
      }
      tip += '<br><span class="muted">Tap: what loads it</span>';
      L.polygon(ll(a.rings), { renderer: SD().svcRenderer, pane: 'svcPane', svcId: a.id, color: fill || token('--nodata'), weight: 1, opacity: 0.9, fill: true, fillColor: fill || token('--nodata'), fillOpacity: fill ? 0.5 : 0.05 })
        .bindTooltip(tip, { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); TS().showLoads(a.id); }).addTo(capLayer);
    }
    if (MM().mstyle.cap !== 'zone') drawNetwork(capLayer);
  }
  // Facility capacity rings (above the developments): over at build-out (≥ 100%), past the 90% trigger,
  // or room, from the Servicing › Capacity rows (js/svc-capacity.js), the same rule as Home's map.
  if (!map.getPane('facPane')) { const fp = map.createPane('facPane', map.getPane('rotatePane') || undefined); fp.style.zIndex = 620; }
  const ringTone = pct => (pct == null || !isFinite(pct) ? '' : pct >= 100 ? 'over' : pct >= 90 ? 'tight' : 'room');
  function capRing(id) {
    const k = window.PeelCapacity && window.PeelCapacity.of(id);
    const t = k ? ringTone(k.pctBuildout) : ''; return t ? ` ring-${t}` : '';
  }
  // The traced sewer network, schematic: each catchment outlet to the next one down, to the plant;
  // pumping stations as rings in their load colour, plants as squares ringed by their capacity.
  function drawNetwork(layer) {
    const ll = p => [p[1], p[0]], plants = App().state.servicing.meta.plants || [];
    // With the sewers loaded: each catchment's outlet down the pipes, drawn once as a tree (a
    // route stops where it joins one already drawn). Otherwise outlet to outlet, schematic.
    const drawn = MM().SEW.data ? new Set() : null;
    for (const d of App().state.servicing.drainage) {
      const k = drawn && d.outletAt ? SC().nearestPipe(d.outletAt[0], d.outletAt[1], 300) : -1;
      if (k >= 0) { const r = ST().pipeRoute(k, drawn); ST().drawPipeRoute(r, 'svc-flow-net', layer, 3000); r.forEach(i => drawn.add(i)); continue; }
      const nx = d.downstream && SD().svcById.get(d.downstream), pl = plants.find(p => p.name === d.plant);
      const to = nx ? nx.outletAt || (pl && pl.lnglat) : pl && pl.lnglat;
      if (d.outletAt && to && (d.outletAt[0] !== to[0] || d.outletAt[1] !== to[1])) L.polyline([ll(d.outletAt), ll(to)], { className: 'svc-flow-net', interactive: false }).addTo(layer);
    }
    // Pumping stations as capacity rings, in their own pane above the developments.
    for (const d of App().state.servicing.psAreas || []) {
      const ps = d.outletAt && psLoad(d, capYear);
      if (ps) L.circleMarker(ll(d.outletAt), { pane: 'facPane', radius: 8, weight: 4, color: bucket(ps.pct, CAP_PS), fillColor: token('--sym-outline'), fillOpacity: 1, className: 'cap-ring' })
        .bindTooltip(window.PeelUtil.hoverCard({ kind: 'Pumping station', name: SD().drName(d).replace(/^[^·]+· /, ''), value: `${Math.round(ps.pct)}%`, sub: `of firm at ${capYear == null ? 'build-out' : capYear} (peak wet)`, also: 'Trace upstream from its scope' }), { className: 'pt' })
        .on('click', ev => { L.DomEvent.stop(ev); TS().showLoads(d.id); }).addTo(layer);
    }
    for (const p of plants) L.marker(ll(p.lnglat), { zIndexOffset: 1000, icon: L.divIcon({ className: `plant-mk${capRing(`plant:${p.name}`)}`, html: `<span style="background:var(${SD().PLANT_TOKEN[p.name] || '--nodata'})"></span>`, iconSize: [16, 16] }) })
      .bindTooltip(() => { const k = window.PeelCapacity && window.PeelCapacity.of(`plant:${p.name}`); return window.PeelUtil.hoverCard({ kind: 'Wastewater treatment plant', name: SD().plantLabel(p.name), value: k ? window.PeelCapacity.pctTxt(k.pctBuildout) : null, sub: k ? `of rated at build-out (${window.PeelCapacity.pctTxt(k.pctCommitted)} committed)` : 'everything it treats' }); }, { className: 'pt' })
      .on('click', () => TS().showLoads(null, p.name)).addTo(layer);
    ST().addFlowMarker();
  }

  // Legend: marker colours and sizes, and the capacity layer's classes. Phase 2: folded into the
  // Layers panel (#mo-legend, rendered by renderLegend below) instead of its own map box.
  // Collapsed on phones until opened (remembered).
  const phoneMap = matchMedia('(max-width: 700px)').matches;
  // Year slider on the map (above the legend): the year the capacity colours, pipe loads and
  // station loads are worked out for, from the census to build-out; opens on this year.
  const yearText = () => capYear == null ? 'Build-out' : capYear <= censusYr() ? `${capYear} (census)` : String(capYear);
  // Wastewater loads (bottom right, Wastewater view): the growth layers follow the selected
  // stages now, so the box keeps only the census (existing) switch. Its own box so it stays
  // in sight whatever the Layers panel shows.
  const WwLoads = L.Control.extend({ options: { position: 'bottomright' }, onAdd() {
    const el = L.DomUtil.create('div', 'ww-loads'); L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
    el.innerHTML = `<div class="wl-h"><span data-info="ww-layers">Wastewater loads</span><span class="wl-sum"></span></div>
      <div class="wl-chips"><label class="mo-chip" title="Census (existing) flows"><input type="checkbox" id="ww-census"${MM().getWwLay().existing !== false ? ' checked' : ''}><span>Include census (existing)</span></label></div>
      <p class="wl-note small muted">The loads follow the stages selected in the sidebar</p>`;
    el.querySelector('#ww-census').onchange = e => MM().setWwLay('existing', e.target.checked);
    el.hidden = !MM().isWW();
    return el;
  } });
  // The legend: its own card in the corner (folded on phones), so it stays in sight while Layers is closed.
  const LegendCard = L.Control.extend({ options: { position: 'bottomleft' }, onAdd() {
    const el = L.DomUtil.create('div', 'mo-legend lg-card'); el.id = 'mo-legend'; el.hidden = true;
    el.innerHTML = '<details><summary>Legend</summary><div class="lg-body"></div></details>';
    L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
    const d = el.querySelector('details'); d.open = store.get('legendOpen', !phoneMap); d.addEventListener('toggle', () => store.set('legendOpen', d.open));
    return el;
  } });
  new LegendCard().addTo(map);
  const wwLoads = new WwLoads().addTo(map);
  // Map box layout (Phase 2): only the Layers panel (top right) and the optional wastewater loads
  // box (bottom right) sit on the map now, both corner-anchored by CSS. What is left here is the
  // smart part: the selection bar at the top, and the phone bottom-sheet behaviour.
  const timebarEl = document.getElementById('timebar');
  function layoutMapBoxes() {
    const op = document.querySelector('.map-opts'), wl = wwLoads && wwLoads.getContainer(), tb = timebarEl;
    if (!op || !map) return;
    const mr = map.getContainer().getBoundingClientRect(); if (!mr.width) return;
    const gap = 8, edge = phoneMap ? 8 : 12;
    // The development panel (right side, over the map on wide screens): lay out in the part left visible.
    const dt = $('#analysis'), dr = dt && !dt.hidden && dt.getBoundingClientRect().left < map.getContainer().getBoundingClientRect().right - 1 ? dt.getBoundingClientRect() : null;
    const cover = dr && dr.left > mr.left + 300 && dr.left < mr.right ? mr.right - dr.left : 0;
    // On a phone the panel is a bottom sheet: the bottom boxes sit above it.
    const coverB = dr && !cover && dr.width >= mr.width * 0.9 && dr.top > mr.top + mr.height * 0.2 && dr.top < mr.bottom ? Math.round(mr.bottom - dr.top) : 0;
    const m = { left: mr.left, top: mr.top, bottom: mr.bottom - coverB, right: mr.right - cover, width: mr.width - cover, height: mr.height - coverB };
    if (wl) wl.style.marginRight = cover ? `${Math.round(cover + edge)}px` : '';
    // Phone with the panel open: little map is left, so the timeline and wastewater loads hide
    // under the sheet (they come back when the panel closes).
    for (const b of [tb, wl]) if (b) b.classList.toggle('sheet-hide', !!coverB);
    // Selection / mode buttons (Clear selection, the developments switch): at the top of the map,
    // between the controls on the left and the Layers panel on the right; under the panel when
    // there's no room between them (a phone).
    const mb = document.querySelector('.map-bottom');
    if (mb) {
      mb.classList.add('at-top'); mb.style.bottom = 'auto'; mb.style.maxWidth = '';
      let b = mb.getBoundingClientRect();
      if (b.width) {
        const rects = sel => [...document.querySelectorAll(sel)].filter(e => !e.hidden && e.offsetParent !== null).map(e => e.getBoundingClientRect()).filter(r => r.width && r.top < mr.top + 140);
        const leftR = [...rects('.leaflet-top.leaflet-left .leaflet-control'), ...rects('.map-wrap #toggle-sidebar')].reduce((x, r) => Math.max(x, r.right), mr.left);
        const right = [op].map(e => e.getBoundingClientRect()).filter(r => r.width);
        const rightL = right.reduce((x, r) => Math.min(x, r.left), m.right);
        const avail = rightL - leftR - 2 * gap, widest = Math.max(0, ...[...mb.children].filter(c => !c.hidden).map(c => c.getBoundingClientRect().width));
        // Too wide for one row but each fits: stack them in the gap.
        if (avail < b.width && avail >= widest && widest > 0) { mb.style.maxWidth = `${Math.floor(avail)}px`; b = mb.getBoundingClientRect(); }
        if (avail >= b.width) {
          mb.style.top = `${edge}px`;
          mb.style.left = `${Math.round((leftR + rightL) / 2 - mr.left)}px`;
        } else {
          const below = right.reduce((x, r) => Math.max(x, r.bottom), mr.top + edge);
          mb.style.top = `${Math.round(below - mr.top + gap)}px`;
          const lo = leftR + gap + b.width / 2, hi = m.right - edge - b.width / 2;
          mb.style.left = `${Math.round(Math.max(Math.min((leftR + m.right) / 2, hi), Math.min(lo, hi)) - mr.left)}px`;
        }
      }
    }
    // Attribution: one line to the right of the timeline.
    const at = map.getContainer().querySelector('.leaflet-control-attribution'), tr = tb && tb.getBoundingClientRect();
    if (at && !phoneMap && tr) at.style.maxWidth = `${Math.max(120, Math.round(m.right - tr.right - 24))}px`;
  }
  // fitLegend: the legend now lives in the Layers panel, so this is a cheap no-op-safe refresh
  // hook (kept for the existing call sites and the resize observer).
  // (one layout per frame however many observers ask: each one reads and writes the layout, a forced
  // reflow every time, and opening a site asked a dozen times in one frame)
  let fitF = 0;
  const fitLegend = () => { if (fitF) return; fitF = requestAnimationFrame(() => { fitF = 0; try { layoutMapBoxes(); } catch (e) { /* map not ready */ } }); };
  if (window.ResizeObserver) { const ro = new ResizeObserver(() => fitLegend()); [document.querySelector('.map-opts'), document.querySelector('.ww-loads'), timebarEl].forEach(e => e && ro.observe(e)); }
  map.on('resize', fitLegend);
  // The year the map's capacity results are worked out for now lives in the Scenario control
  // ("Results for year"); the legend keeps naming it.
  const censusYr = () => (CA().baselineCensus() || {}).year || SP().hz.year0;
  document.addEventListener('click', e => { const b = e.target.closest('[data-lg-color]'); if (b) setMapStyle({ color: b.dataset.lgColor }); });
  function renderLegend() {
    // Bundle 3: its own card (LegendCard above), visible whether or not Layers is open.
    const el = document.getElementById('mo-legend'); if (!el) return;
    const parts = [];
    const sw = (c, t, cls = '') => `<li><span class="lg-sw${cls}" style="--mk:${c}"></span>${esc(t)}</li>`;
    // SPEC §4: the legend names the marker unit for the lens, and offers Colour sites by: Stage, Counted as,
    // Plant, Data quality and Timing (the one place to pick it; Layers › More settings no longer has it).
    {
      const c = MM().mstyle.color, b = (k, t) => `<button type="button" class="btn small${c === k ? ' on' : ''}" data-lg-color="${k}" aria-pressed="${c === k}">${t}</button>`;
      parts.push(`<div class="lg-color" role="group" aria-label="Colour sites by"><span class="small muted">Colour sites by</span> ${b('phase', 'Stage')}${b('layer', 'Counted as')}${b('plant', 'Plant')}${b('quality', 'Data quality')}${b('timing', 'Timing')}</div><p class="lg-s lg-unit">${MM().mstyle.size === 'pop' ? 'Markers sized by people + jobs at build-out; a cluster’s number is its people + jobs (51k = 51,000).' : MM().mstyle.size === 'units' ? 'Markers sized by planned homes; a cluster’s number is its planned homes (5.1k = 5,100).' : 'One marker per development; a cluster’s number counts developments (sites).'}</p>`);
    }
    // (Permit issued and Under construction share a colour, and a row: as in the sidebar.)
    if (MM().mstyle.color === 'phase') parts.push(`<div class="lg-t">Stage</div><ul>${P.ALL_PHASES.filter(p => App().state.phases.has(p.key) && !(p.key === 'construction' && App().state.phases.has('permit'))).map(p => `<li data-info="phase-${p.key}">${dot(p.key)}${esc(p.key === 'permit' && App().state.phases.has('construction') ? 'Permit issued / under construction' : p.key === 'completed' ? 'Built' : p.label)}</li>`).join('')}</ul>`);
    if (MM().mstyle.color === 'layer') parts.push(`<div class="lg-t">Developments</div><ul>${Object.entries(MM().LAYER_NAME).filter(([k]) => k !== 'out').map(([k, t]) => sw(MM().layerColors()[k], t)).join('')}</ul>`);
    if (MM().mstyle.color === 'timing') parts.push(`<div class="lg-t">Servicing timing (2026 DC draft)</div><ul>${Object.values(MM().TIMING).map(([c, t]) => sw(c, t)).join('')}</ul>`);
    if (MM().mstyle.color === 'quality') parts.push(`<div class="lg-t">Data quality</div><ul>${Object.values(MM().QUALITY).map(([c, t]) => sw(c, t)).join('')}</ul>`);
    if (MM().mstyle.color === 'plant') parts.push(`<div class="lg-t">Receiving plant</div><ul>${['Lakeview', 'Clarkson', 'Inglewood', 'Toronto'].map(k => sw(`var(${SD().PLANT_TOKEN[k]})`, SD().PLANT_SHORT[k])).join('')}${sw('var(--nodata)', 'No traced catchment')}</ul>`);
    if (MM().mstyle.size === 'units') parts.push(`<div class="lg-t">Size: planned homes</div><div class="lg-size">${[10, 100, 1000].map(n => `<span><i style="width:${MM().unitsPx(n)}px;height:${MM().unitsPx(n)}px"></i>${MM().shortNum(n)}</span>`).join('')}</div>`);
    if (MM().mstyle.size === 'pop') parts.push(`<div class="lg-t">Size: people + jobs at build-out</div><div class="lg-size">${[100, 1000, 10000].map(n => `<span><i style="width:${MM().markerPx(n)}px;height:${MM().markerPx(n)}px"></i>${MM().shortNum(n)}</span>`).join('')}</div>`);
    if (App().state.servicing && MM().mstyle.color !== 'quality' && MM().mstyle.color !== 'timing' && (MM().mstyle.color !== 'phase' || MM().mstyle.size !== 'fixed') && SvcTab().svcOpt.nr === 'on') parts.push(`<ul>${sw('var(--text-muted)', 'Outside mapped areas (nearest assigned)', ' near')}</ul>`);
    if (MM().mstyle.cap === 'ps') parts.push(`<div class="lg-t">Pumping station, build-out peak wet</div><ul>${sw(`var(${CAP_PS[0][1]})`, '< 80% of firm')}${sw(`var(${CAP_PS[1][1]})`, '80–100%')}${sw(`var(${CAP_PS[2][1]})`, '> 100%')}${sw('var(--nodata)', 'Gravity / not tabled')}</ul>`);
    if (MM().mstyle.cap !== 'off' && MM().mstyle.cap !== 'zone') parts.push(`<div class="lg-t">Facilities, at build-out</div><ul><li><span class="lg-ring t-over"></span>over capacity</li><li><span class="lg-ring t-tight"></span>past the 90% trigger (plants) or 80% of firm (stations)</li><li><span class="lg-ring t-room"></span>room</li></ul>`);
    if (MM().mstyle.cap === 'pipes') parts.push(`<div class="lg-t">Sewer load / full capacity${capYear == null ? ', build-out' : `, ${capYear}`}</div><ul>${MM().PIPE_CLS.map(([, c, t]) => `<li><span class="lg-line" style="background:var(${c})"></span>${esc(t)}</li>`).join('')}<li><span class="lg-line" style="background:var(--nodata)"></span>no reliable slope published</li></ul>${(sm => sm ? `<p class="lg-s">${sm.n.map((k, i) => `${fmtNum(k)} ${MM().PIPE_CLS[i][4]}`).join(' · ')} of ${fmtNum(sm.total)} pipes</p>` : '')(SC().pipeSummary())}<p class="lg-s">Pipes of 300 mm+ (larger ones first when zoomed out). Existing peak dry (measured rate) + growth peak wet (design); screening only.</p>${MM().isWW() && !Object.values(MM().getWwLay()).every(v => v !== false) ? `<p class="lg-s"><strong>Loads:</strong> ${[['existing', 'census'], ['built', 'built since'], ['approved', 'site plan approved'], ['proposed', 'proposed']].filter(([k]) => MM().getWwLay()[k] !== false).map(([, t]) => t).join(' + ') || 'none'} (Wastewater loads in Layers)</p>` : ''}`);
    if (MM().mstyle.cap === 'growth' || MM().mstyle.cap === 'zone') parts.push(`<div class="lg-t">${MM().mstyle.cap === 'zone' ? 'Max day growth over the census' : 'Local flow growth over the census'}</div><ul>${CAP_GROWTH.map(([t, c], i) => sw(`var(${c})`, i === 0 ? '< 10%' : t === Infinity ? `> ${CAP_GROWTH[i - 1][0]}% or new` : `${CAP_GROWTH[i - 1][0]}–${t}%`)).join('')}</ul>`);
    if (MM().svcOn.bk) parts.push(`<div class="lg-t">Wastewater blocks (I&amp;I program)</div><ul><li>${MM().blockSwatch}Block (40)</li><li><span class="blk-lbl pri"><span style="transform:none">26</span></span> prioritised: block study</li><li class="muted">tap a block: outlets and the route to the plant along the sewers</li></ul>`);
    if (Object.values(MM().getExistOn()).some(Boolean)) parts.push(`<div class="lg-t">Existing pipes (live, from zoom ${MM().EXIST_ZOOM})</div><ul>${Object.keys(MM().getExistOn()).filter(k => MM().getExistOn()[k]).map(k => `<li><span class="lg-line${MM().EXIST_STYLE[k].dash ? ' dot' : ''}" style="--lg-c:var(${MM().EXIST_STYLE[k].color})"></span>${esc(MM().EXIST_STYLE[k].label)}${k === 'storm' ? ' (Mississauga, Brampton, Region; dotted)' : ''}</li>`).join('')}<li class="muted">thicker = larger diameter; dashed = force main</li></ul>`);
    if (WT().WF.on) parts.push(`<div class="lg-t">Water facilities (existing)</div><ul>${Object.entries(WT().WF_KIND).filter(([k]) => k !== 'clearwell').map(([k, [sym, t]]) => `<li><i class="wf-ic wf-${k} wf-lg">${sym}</i>${esc(t)}</li>`).join('')}<li><span class="lg-ring t-over"></span><span class="lg-ring t-tight"></span><span class="lg-ring t-room"></span>ring: over / past 90% / room at build-out (Servicing › Capacity)</li></ul>`);
    if (MM().getDcOn().on && App().state.dcInfra) parts.push(`<div class="lg-t">Planned works (2026 DC, draft)</div><ul>${Object.entries(DI().DC_KIND).filter(([k]) => MM().getDcOn().sys === 'both' || (MM().getDcOn().sys === 'water') === (k === 'transmission' || k === 'feeder')).map(([, [t, c]]) => `<li><span class="lg-line" style="background:var(${c})"></span>${esc(t)}</li>`).join('')}<li><span class="lg-line dash"></span>dashed: approved 2026${capYear != null ? ' or after the year' : ''}</li><li><span class="dc-fac lg"><span>${DI().facIcon('pumping_station')}</span></span>facility (tap for schedule)</li></ul>`);
    if (window.PeelCapitalEA) { const ce = window.PeelCapitalEA.legendHTML(); if (ce) parts.push(ce); }
    // Then, in the Layers groups' order: Infrastructure › Other utilities, Constraints.
    if (window.PeelConstraints) for (const w of ['cx']) { const cx = window.PeelConstraints.legendHTML(w); if (cx) parts.push(cx); }
    if (MM().mstyle.cap !== 'off') parts.push(`<p class="lg-s"><strong>${yearText()}</strong> (Results for year, in the Scenario control). Approved growth over ${SP().hz.aYears} years from ${SP().hz.aStart}, proposed over ${SP().hz.pYears} from ${SP().hz.pStart} (Horizon years). ${esc(SvcTab().scenarioText())}</p>`);
    el.querySelector('.lg-body').innerHTML = parts.join('');
    el.hidden = !parts.length;
    SD().syncPanelSum(); fitLegend();
  }

  // "What loads this?": a catchment (with everything upstream), a pressure zone or a plant —
  // the developments adding flow since the census, ranked by their peak flow.

  const api = {
    VIEW_PRESETS, LG_EXTRA, resetView,
    setMapStyle, setDcOn, setExistOn, currentView, syncMapOpts, setMapView, showView, rememberCurrent,
    getCapYear() { return capYear; },
    setCapYear(v) { capYear = v; },
    renderCapLayer, renderLegend, renderSavedViews, saveCurrentView, deleteSavedView,
    savedViews,
    openSavedView, atYear, hzFrac, censusOnly, censusYr, stationPipe,
    phoneMap, timebarEl, psCum,
    psLoad, psLoads, fitLegend, layoutMapBoxes, yearText, currentMapSettings,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMapAnalysis = api;
})(typeof window !== 'undefined' ? window : globalThis);
