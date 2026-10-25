/* Area selection — lasso/box/radius select, selection summary + CSV, tool
 * Phase 6 extraction from js/app.js (app.js 3576-3985, 7652-7681 (fillGround 7682-7695 moved to site-context)).
 * rail, north/present controls, presentation mode, hover, clear-selection.
 */
(function (root) {
  'use strict';

  const P = window.PeelPhases;
  const PD = window.PeelDesign;
  const D = window.PeelDemand;
  const { $, esc, fmtNum, fmt1, roundPop, store, dot, CSV_DISCLAIMER, SCREEN_NOTE } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const canRotate = window.PeelMapCore.canRotate;
  const mapBottom = window.PeelSewerProfile.mapBottom;
  const App = () => window.PeelApp;
  const MC = () => window.PeelMapCore;
  const MM = () => window.PeelMapMarkers;
  const MA = () => window.PeelMapAnalysis;
  const ST = () => window.PeelSewerTrace;
  const WT = () => window.PeelWaterTrace;
  const AC = () => window.PeelAerialCheck;
  const DN = () => window.PeelDevNav;
  const SD = () => window.PeelSvcData;
  const SvcTab = () => window.PeelSvcTab;
  const Meas = () => window.PeelMeasure;
  const CA = () => window.PeelCensusAreas;
  const TB = () => window.PeelTopbar;
  const SF = () => window.PeelSearchFilter;
  const WTab = () => window.PeelWaterTab;
  const EP = () => window.PeelExistPipes;
  const Ex = () => window.PeelExports;
  const GUI = () => window.PeelGrowthUI;
  const Areas = () => window.PeelAreas;

  // ---- Area selection: draw around projects, summarize demand and growth -----------------
  // A lasso drawn on the map (finger or mouse) selects the shown projects inside it; more
  // areas add to the selection. The summary opens in the side panel.
  const selection = new Map();          // project key -> project
  let selAreas = [];                    // drawn areas as [[lng, lat], ...] rings
  if (!map.getPane('selPane')) map.createPane('selPane', map.getPane('rotatePane') || undefined).style.zIndex = (window.PeelLayerGroups ? window.PeelLayerGroups.Z.sel : 650);
  const selLayer = L.layerGroup().addTo(map), selCanvas = L.canvas({ pane: 'selPane', padding: 0.3 });
  let lassoOn = false;
  const lassoSvg = L.DomUtil.create('div', 'lasso-layer', map.getContainer());
  lassoSvg.innerHTML = '<svg><path/></svg><div class="lasso-hint">Draw around the developments to select<span class="mouse-only"> · middle-drag to move the map · Esc to cancel</span> <button type="button" class="btn small lasso-cancel">Cancel</button></div>';
  lassoSvg.querySelector('.lasso-cancel').addEventListener('click', e => { e.stopPropagation(); setLasso(false); });
  L.DomEvent.disableClickPropagation(lassoSvg);
  function setLasso(on) {
    lassoOn = on;
    lassoSvg.classList.toggle('on', on);
    syncToolsBtn();
    if (on) { map.dragging.disable(); if (innerWidth <= 700) AC().closeDetail({ keepSelection: true }); }
    else map.dragging.enable();
    if (typeof syncClearBtn === 'function') syncClearBtn();
    lassoSvg.querySelector('path').setAttribute('d', '');
  }
  // Tools: a rail of toggle buttons under the zoom (and the north arrow) — select an area,
  // measure, trace a sewer path or a water route, test a site, and the Phase 3b registered
  // tools (inspect point, corridor select, how-many-more-units-fit — see the PeelTools
  // registrations in the tool section below). Icons come from js/design.js (icon()) so
  // the set stays consistent. Help is no longer on the rail: it lives on the topbar Help button.
  const TOOL_ITEMS = [
    ['select', 'Select', 'Select developments: tap one, draw a lasso around them, hold Ctrl / ⌘ and drag a box, or tap for a radius', 'select'],
    ['measure', 'Measure & ground profile', 'Measure a distance with its ground profile, along a line or a sewer', 'measure'],
    ['trace', 'Trace', 'Trace a sewer path to the plant, or a water route from the plant, from any point', 'trace'],
    ['whatif', 'Test a site', 'Servicing check for a proposed development: tap the map where it is', 'whatif'],
    ['inspect', 'Inspect point', 'What is at this point: sewers, watermains, pressure zones and plants nearby', 'inspect'],
    ['corridor', 'Corridor select', 'Select the developments along a drawn corridor', 'corridor'],
    ['unitsfit', 'How many more units fit?', 'Tap a point: how many more units fit before its tightest sewer, pumping station, plant or water zone', 'unitsfit'],
    ['timebox', 'Time Box', 'Drag a box to see its aerial imagery over the years, with the applications filed by then', 'clock'],
    ['sewer', 'Sewer designer', 'Draw a gravity sanitary sewer from a site to an existing sewer: a preliminary design to Peel\u2019s rules, in plan and profile', 'sewer'],
  ];
  // Phase 3b: Help lives in the topbar Help button only — the map ? control is removed
  // (no tool in two places). The tool rail shows which tool is on (one tool active at a time).
  // The legacy standalone lasso (started from the selection panel's "+ Add area") lights the
  // Select button too.
  const syncToolsBtn = () => {
    let any = false;
    document.querySelectorAll('.tool-rail [data-tool]').forEach(x => { const on = x.dataset.tool === 'select' ? (lassoOn || Meas().tool.mode === 'select') : Meas().tool.mode === x.dataset.tool; any = any || on; x.classList.toggle('on', on); x.setAttribute('aria-pressed', String(on)); });
    const t = document.querySelector('.tool-rail [data-rail-toggle]'); if (t) t.classList.toggle('on', any);   // (a tool is on while the rail is folded)
  };

  // North arrow (points to true north whatever the orientation; tap to switch between the road
  // grid and north up) and a metric scale bar.
  const NorthControl = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'leaflet-bar north-ctl');
      el.dataset.info = 'north';
      // The arrow points north; the caption names the orientation (Road grid is the default).
      el.innerHTML = `<button type="button" id="north-btn" title="North. Tap to switch between road grid and north up" aria-label="North arrow: switch orientation">
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><g id="north-rot"><path d="M12 2.5l4.5 11h-9z" fill="currentColor"/><path d="M12 21.5l-4.5-8h9z" fill="none" stroke="currentColor" stroke-width="1.2"/>
        <text x="12" y="12.2" text-anchor="middle" font-size="5.5" font-weight="700" fill="var(--surface-1)">N</text></g></svg><span class="north-cap" id="north-cap"></span></button>`;
      L.DomEvent.disableClickPropagation(el);
      el.querySelector('button').onclick = () => MC().setOrientation(MC().getOrientation() === 'grid' ? 'north' : 'grid');
      return el;
    },
  });
  new NorthControl().addTo(map);
  // Tool rail: one toggle button per tool, below the zoom and the north arrow. Same data-tool
  // values and handlers as the old dropdown; one tool active at a time (existing behaviour).
  const ToolRail = L.Control.extend({
    options: { position: 'topleft' },
    onAdd() {
      const el = L.DomUtil.create('div', 'leaflet-bar tool-rail');
      el.setAttribute('role', 'toolbar'); el.setAttribute('aria-label', 'Map tools');
      // Behind one Tools button (design bundle 4): open by default on a computer, folded on a phone or
      // tablet; remembered. The button shows the tool that is on while folded.
      const open = store.get('railOpen', !matchMedia('(max-width: 1199px), (pointer: coarse)').matches) !== false;
      el.classList.toggle('folded', !open);
      el.innerHTML = `<button type="button" class="rail-toggle" data-rail-toggle aria-expanded="${open}" title="Map tools: select, measure, trace, test a site, inspect, corridor, units fit">${PD.icon('tools')}<span class="rail-cap">Tools</span></button><div class="rail-tools">${TOOL_ITEMS.map(([k, t, d, ic]) => `<button type="button" data-tool="${k}" title="${esc(t)} — ${esc(d)}" aria-label="${esc(t)}" aria-pressed="false">${PD.icon(ic)}</button>`).join('')}</div>`;
      L.DomEvent.disableClickPropagation(el); L.DomEvent.disableScrollPropagation(el);
      el.addEventListener('click', e => {
        if (e.target.closest('[data-rail-toggle]')) { const o = el.classList.contains('folded'); el.classList.toggle('folded', !o); el.querySelector('[data-rail-toggle]').setAttribute('aria-expanded', String(o)); store.set('railOpen', o); return; }
        const b = e.target.closest('[data-tool]'); if (!b) return;
        if (lassoOn) setLasso(false);
        Meas().setTool(b.dataset.tool);
      });
      return el;
    },
  });
  new ToolRail().addTo(map);
  // Present lives in the top bar only (the map's own Present button was a duplicate; design audit, Group 6).
  // Fill the presentation bar from the Overview: its headline sentence plus the
  // four key tiles of the Growth card (developments shown, units planned,
  // people at build-out, jobs).
  // Presentation shows the scope that is open: Peel, an area, a servicing scope or a development
  // (design audit, Group 9): the Overview's own headline and first four tiles, the screening note and
  // the data date. Only Exit is a control; the theme turns light for projectors unless set otherwise.
  let presRendering = false;   // the Overview calls back here when it re-renders in presentation
  function renderPresentation() {
    const bar = $('#presentation-bar'); if (!bar) return;
    const OT = window.PeelOverviewTab;
    if (!presRendering && OT && OT.renderOverview) { presRendering = true; try { OT.renderOverview(); } finally { presRendering = false; } }
    const hl = document.querySelector('#ov-body .ov-top .headline');
    const tiles = document.querySelectorAll('#ov-body .ov-tiles:not(.ov-flow) .ov-tile');
    $('#pres-hl').innerHTML = hl ? hl.innerHTML : '';
    $('#pres-tiles').innerHTML = [...tiles].slice(0, 4).map(t => t.outerHTML).join('');
    const snap = App().state.snapshot, U = window.PeelUtil;
    $('#pres-note').textContent = `${U.SCREEN_LINE} · Data ${snap && snap.generatedAt ? snap.generatedAt.slice(0, 10) : 'as loaded'} · ${U.UNOFFICIAL}`;
  }
  let presTheme = null;   // the app theme to restore on exit, when presentation switched to light
  function enterPresentation() {
    if (PD && store.get('presentTheme', 'light') === 'light' && document.documentElement.getAttribute('data-theme') !== 'light') {
      presTheme = store.get('theme', 'dark'); PD.applyTheme('light'); App().refreshTheme();
    }
    renderPresentation();
    $('#presentation-bar').hidden = false;
    setLasso(false);
    if (Meas().tool.mode) Meas().setTool(null);
    document.documentElement.setAttribute('data-presentation', '');
    setTimeout(() => map.invalidateSize(), 60);   // the map takes the freed columns
    try {
      const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
      if (p && p.catch) p.catch(() => { /* fullscreen unavailable: the layout still presents */ });
    } catch (e) { /* fullscreen unavailable */ }
  }
  function exitPresentation() {
    document.documentElement.removeAttribute('data-presentation');
    const bar = $('#presentation-bar'); if (bar) bar.hidden = true;
    if (presTheme) { PD.applyTheme(presTheme); presTheme = null; App().refreshTheme(); }
    setTimeout(() => map.invalidateSize(), 60);
    try { if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen(); } catch (e) { /* noop */ }
  }
  const inPresentation = () => document.documentElement.hasAttribute('data-presentation');
  // Esc exits fullscreen on its own; this clears the presentation layout (and
  // covers the case where fullscreen was never entered).
  document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitPresentation(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && inPresentation()) exitPresentation(); });
  document.addEventListener('click', e => { if (e.target.closest('#pres-exit')) exitPresentation(); });
  PD.initPrintHandlers({ onAfter: () => App().refreshTheme() });
  // The scale sits beside the attribution (bottom right), clear of the tool rail.
  L.control.scale({ position: 'bottomright', metric: true, imperial: false, maxWidth: 110 }).addTo(map);
  function updateNorth() {
    const g = document.getElementById('north-rot');
    const b = canRotate ? map.getBearing() : 0;
    if (g) g.setAttribute('transform', `rotate(${b} 12 12)`);
    const cap = document.getElementById('north-cap'), grid = MC().getOrientation() === 'grid' && canRotate;
    if (cap) cap.textContent = grid ? 'Grid' : 'North';
    const btn = document.getElementById('north-btn'); if (btn) btn.setAttribute('aria-label', `Orientation: ${grid ? 'road grid' : 'north up'}. Switch to ${grid ? 'north up' : 'road grid'}`);
  }
  map.on('rotate', updateNorth);
  updateNorth();

  let pts = null;
  const rel = e => { const b = map.getContainer().getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  // While the lasso is on, the middle mouse button drags the map (left button draws).
  let pan = null;
  lassoSvg.addEventListener('pointerdown', e => {
    if (!lassoOn || e.target.closest('.lasso-cancel')) return;
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
    for (const p of App().state.filtered) {
      if (p.lat == null || selection.has(p.key)) continue;
      const c = map.latLngToContainerPoint([p.lat, p.lng]);
      if (P.pointInRings(c.x, c.y, [closed])) { selection.set(p.key, p); added++; }
    }
    const geo = closed.map(([x, y]) => { const ll = map.containerPointToLatLng([x, y]); return [ll.lng, ll.lat]; });
    selAreas.push(geo);
    drawSelection();
    Meas().openSelectionResult('Lasso selection', added);
    if (Meas().tool.mode === 'select') Meas().setSelectSub('tap'); // back to tap mode after the draw
  });
  addEventListener('keydown', e => { if (e.key === 'Escape' && lassoOn) { pts = null; setLasso(false); e.preventDefault(); } });   // (handled: the selection stays)

  // Ctrl (⌘ on a Mac) + drag on the map: a box that adds the shown developments inside it to the
  // selection, like the lasso. Holding the key over the map shows a crosshair.
  const mapEl = map.getContainer(), boxEl = L.DomUtil.create('div', 'sel-box', mapEl);
  boxEl.hidden = true;
  let box = null, boxed = false;
  const ctrlCursor = on => mapEl.classList.toggle('ctrl-select', on);
  addEventListener('keydown', e => { if ((e.key === 'Control' || e.key === 'Meta') && mapEl.matches(':hover') && !lassoOn) ctrlCursor(true); });
  addEventListener('keyup', e => { if (e.key === 'Control' || e.key === 'Meta') ctrlCursor(false); });
  addEventListener('blur', () => ctrlCursor(false));
  mapEl.addEventListener('mousemove', e => { if (!box) ctrlCursor((e.ctrlKey || e.metaKey) && !lassoOn); });
  mapEl.addEventListener('mousedown', e => {
    if (!(e.ctrlKey || e.metaKey) || e.button !== 0 || lassoOn || (Meas().tool.mode && Meas().tool.mode !== 'select')) return;
    if (e.target.closest('.leaflet-control, .map-bottom, .lasso-layer')) return;
    e.preventDefault(); e.stopPropagation();
    box = { a: rel(e), b: rel(e) }; map.dragging.disable();
  }, true);
  addEventListener('mousemove', e => {
    if (!box) return;
    box.b = rel(e);
    const [x0, y0] = box.a, [x1, y1] = box.b;
    Object.assign(boxEl.style, { left: `${Math.min(x0, x1)}px`, top: `${Math.min(y0, y1)}px`, width: `${Math.abs(x1 - x0)}px`, height: `${Math.abs(y1 - y0)}px` });
    boxEl.hidden = Math.abs(x1 - x0) < 4 && Math.abs(y1 - y0) < 4;
  });
  addEventListener('mouseup', e => {
    if (!box) return;
    const { a } = box, b = rel(e); box = null; boxEl.hidden = true; map.dragging.enable(); ctrlCursor(e.ctrlKey || e.metaKey);
    if (Math.abs(b[0] - a[0]) < 6 && Math.abs(b[1] - a[1]) < 6) return;
    boxed = true; setTimeout(() => { boxed = false; }, 0);
    const ring = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]], [a[0], a[1]]];
    let added = 0;
    for (const p of App().state.filtered) {
      if (p.lat == null || selection.has(p.key) || !SD().devShown(p)) continue;
      const c = map.latLngToContainerPoint([p.lat, p.lng]);
      if (P.pointInRings(c.x, c.y, [ring])) { selection.set(p.key, p); added++; }
    }
    selAreas.push(ring.map(([x, y]) => { const ll = map.containerPointToLatLng([x, y]); return [ll.lng, ll.lat]; }));
    drawSelection();
    Meas().openSelectionResult('Selection', added);
  });
  // The click that ends a box doesn't also count as a tap on the map (which would unselect).
  document.addEventListener('click', e => { if (boxed && mapEl.contains(e.target)) { e.stopPropagation(); e.preventDefault(); } }, true);
  mapEl.addEventListener('contextmenu', e => { if (box) e.preventDefault(); });

  // Site boundary on hover: the shown development nearest the pointer, within the reach (More
  // settings), has its application site outlined; one without a published boundary gets a dashed
  // ring. Mouse / trackpad only (a phone has no hover). Positions are cached per view.
  const hovLayer = L.layerGroup().addTo(map);
  let hovPts = null, hovKey = null, hovRaf = 0;
  const hovReset = () => { hovPts = null; };
  map.on('moveend zoomend viewreset rotate', hovReset);
  function hovCandidates() {
    const src = `${MM().getDevsOn()}|${MM().isWW()}|${JSON.stringify(MM().getWwLay())}`;
    if (hovPts && hovPts.list === App().state.filtered && hovPts.src === src) return hovPts;
    const b = map.getBounds().pad(0.05);
    hovPts = []; hovPts.list = App().state.filtered; hovPts.src = src;
    for (const p of App().state.filtered) {
      if (p.lat == null || !SD().devShown(p) || !b.contains([p.lat, p.lng])) continue;
      const c = map.latLngToContainerPoint([p.lat, p.lng]); hovPts.push([c.x, c.y, p]);
    }
    return hovPts;
  }
  function hovClear() { if (hovKey) { hovLayer.clearLayers(); hovKey = null; } }
  function hovShow(p, onMarker) {
    const k = `${p.key}|${onMarker ? 1 : 0}`; if (hovKey === k) return;
    hovLayer.clearLayers(); hovKey = k;
    const apps = MM().siteApps(p);
    if (apps.length) for (const a of apps) L.polygon(MM().toLatLngs(a.poly), { className: 'hov-site', interactive: false, color: MM().selColor(), weight: 2.5, dashArray: '6 4', fillColor: MM().selColor(), fillOpacity: 0.12 }).addTo(hovLayer);
    else L.circleMarker([p.lat, p.lng], { radius: 16, className: 'hov-ring', interactive: false, color: MM().selColor(), weight: 2, dashArray: '4 4', fill: false }).addTo(hovLayer);
    if (onMarker) return;   // the marker's own tooltip shows
    const t = L.tooltip({ direction: 'top', offset: [0, -14], className: 'hov-tip', opacity: 1 }).setLatLng([p.lat, p.lng])
      .setContent(`<strong>${esc(p.title)}</strong><br><span class="muted">${esc(P.PHASE_BY_KEY[p.phase].label)}${p.units ? ` · ${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'}` : ''}${apps.length ? '' : ' · no site boundary published'}</span>`);
    hovLayer.addLayer(t);
  }
  function setHov(ch) { Object.assign(MM().hov, ch); store.set('hoverPoly', { on: MM().hov.on, r: MM().hov.r }); if (!MM().hov.on) hovClear(); }
  mapEl.addEventListener('mousemove', e => {
    if (!MM().hov.on || box || lassoOn || (Meas().tool && Meas().tool.mode) || e.buttons) { if (!MM().hov.on) hovClear(); return; }
    if (e.target.closest && e.target.closest('.leaflet-control, .map-bottom')) { hovClear(); return; }
    const [x, y] = rel(e);
    cancelAnimationFrame(hovRaf);
    hovRaf = requestAnimationFrame(() => {
      let best = null, bd = MM().hov.r * MM().hov.r;
      for (const q of hovCandidates()) { const dx = q[0] - x, dy = q[1] - y, d = dx * dx + dy * dy; if (d <= bd) { bd = d; best = q[2]; } }
      if (best) hovShow(best, bd < 13 * 13); else hovClear();
    });
  });
  mapEl.addEventListener('mouseleave', () => { cancelAnimationFrame(hovRaf); hovClear(); });
  map.on('movestart zoomstart', hovClear);

  function drawSelection() {
    selLayer.clearLayers();
    for (const g of selAreas) L.polygon(g.map(([x, y]) => [y, x]), { className: 'sel-area', interactive: false }).addTo(selLayer);
    for (const p of selection.values()) {
      // Each selected development's application boundaries in cyan, and a ring for zoomed-out views.
      for (const a of MM().siteApps(p)) L.polygon(MM().toLatLngs(a.poly), { renderer: selCanvas, color: MM().selColor(), weight: 2.5, fillColor: MM().selColor(), fillOpacity: 0.2, interactive: false }).addTo(selLayer);
      L.circleMarker([p.lat, p.lng], { radius: 10, className: 'sel-ring', interactive: false }).addTo(selLayer);
    }
  }
  function clearSelection() { selection.clear(); selAreas = []; drawSelection(); if (typeof syncClearBtn === 'function') syncClearBtn(); }

  // The selection summary as a standalone HTML block: rendered into #detail by the legacy
  // showSelection(), or into the Tool result pane by openSelectionResult() (Phase 3b).
  function selectionSummaryHTML(sel, added) {
    if (!sel.length) return `<div class="head"><h3>No developments in that area</h3></div>
        <p class="small muted">Only the developments shown on the map (current phase, focus and filters) can be selected. Draw a larger area, or change the filters.</p>
        <div class="sel-actions"><button type="button" class="btn" data-sel="add">Draw again</button></div>`;
    const c = App().state.criteria;
    const cols = [['all', 'Total'], ['completed', 'Completed'], ['unbuilt', 'Remaining']];
    const es = cols.map(([k]) => D.estimate(sel, c, k, App().jobsOf));
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
    const bc = CA().baselineCensus();
    if (bc) {
      const sj = SvcTab().svcJobs(sel.filter(p => p.phase !== 'cancelled'), bc.date);
      // (the growth layers on the commitment ladder: committed by a site servicing or building permit, then the rest)
      const lg = Areas().ladderLayers(Areas().growthSince(sel, {}, bc.date, c), sj), gr = { built: lg.built, approved: lg.committed, proposed: lg.notYet };
      let pop = 0, dw = 0, nDa = 0;
      for (const d of bc.das) {
        if (selAreas.some(g => P.pointInRings(d.lng, d.lat, [g]))) { pop += d.pop; dw += d.dw; nDa++; }
      }
      const g = (label, cls, units, people, note, jobs) => `<div class="sum-tile ${cls}"><div class="sl">${label}</div><div class="sv">+${fmtNum(Math.round(people))}</div><div class="ss">people · +${fmtNum(units)} units${jobs > 0 ? ` · +${fmtNum(roundPop(jobs))} jobs` : ''}${note ? ` · ${note}` : ''}</div></div>`;
      const layers = [['base', pop], ['built', gr.built.population], ['approved', gr.approved.population], ['proposed', gr.proposed.population]];
      const sum = layers.reduce((t, l) => t + l[1], 0);
      growth = `<details class="sect" open><summary><h2 class="section-title" data-info="census">Growth since ${bc.year}</h2>
          <span class="muted small sect-sum">${nDa ? `${fmtNum(Math.round(pop))} → ${fmtNum(Math.round(sum))} people` : ''}</span></summary>
        <div class="sum-tiles">
          ${nDa ? `<div class="sum-tile"><div class="sl">${bc.year} Census</div><div class="sv">${fmtNum(Math.round(pop))}</div><div class="ss">people · ${fmtNum(nDa)} DA${nDa === 1 ? '' : 's'}</div></div>` : ''}
          ${g('Built since', 's-done', gr.built.units, gr.built.population, '', sj.jbuilt)}
          ${g('Committed, not yet built', 's-perm', gr.approved.units, gr.approved.population, 'a site servicing or building permit', gr.approved.jobs)}
          ${g('Not committed yet', 's-left', gr.proposed.units, gr.proposed.population, 'plan approved without a permit, in review or pre-application', gr.proposed.jobs)}
        </div>
        ${sum > 0 ? `<div class="grow-bar sel-grow" role="img" aria-label="Growth layers">${layers.filter(l => l[1] > 0).map(([k, v]) => `<span class="gseg g-${k}" style="flex:${v}" title="${fmtNum(Math.round(v))} people"></span>`).join('')}</div>` : ''}
        <p class="small muted">${nDa ? 'Census: dissemination areas whose centre falls inside the drawn area(s). ' : ''}Built = units on permits completed since census day; committed = units left to build a site servicing permit (the whole development) or a building permit (the units it covers) commits (the Peel rule); not committed yet = the rest of build-out: plan approved without a permit, zoning approved, in review or pre-application. People at Peel persons-per-unit; jobs from the floor area the applications state.</p>
      </details>`;
    }
    const byUnits = sel.slice().sort((a, b) => (b.units || 0) - (a.units || 0));
    const list = byUnits.map(p => `<li><button type="button" class="sel-item" data-open="${esc(p.key)}">${dot(p.phase)}<span class="t">${esc(p.title)}</span>
        <span class="u">${p.buildout ? `${fmtNum(p.buildout.planned)} planned` : p.units ? `${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'}` : App().empOf(p) && App().empOf(p).totalM2 ? `${fmtNum(App().empOf(p).totalM2)} m²` : ''}</span></button>
        <button type="button" class="sel-x" data-drop="${esc(p.key)}" aria-label="Remove ${esc(p.title)} from the selection">×</button></li>`).join('');
    return `
      <div class="head"><h3 data-info="selection">${fmtNum(sel.length)} selected development${sel.length === 1 ? '' : 's'}</h3>
        <div class="m">${fmtNum(selAreas.length)} drawn area${selAreas.length === 1 ? '' : 's'}${added != null ? ` · ${fmtNum(added)} added` : ''} · ${esc([...new Set(sel.map(p => p.municipality))].join(', '))}</div></div>
      ${SCREEN_NOTE}
      <div class="sel-actions">
        <button type="button" class="btn" data-sel="add">+ Add area</button>
        <button type="button" class="btn" data-area-report="sel">Area report</button>
        <button type="button" class="btn" data-sel="csv">Export CSV</button>
        <button type="button" class="btn" data-sel="clear">Clear</button>
      </div>
      <div class="summary" data-info="buildout"><div class="sum-tiles">
        ${tile('s-plan', 'Planned', fmtNum(bo.planned), 'units')}
        ${tile('s-perm', 'Permitted', fmtNum(bo.permitted), pc(bo.permitted))}
        ${tile('s-done', 'Completed', fmtNum(bo.completed), pc(bo.completed))}
        ${tile('s-left', 'Left to build', fmtNum(bo.remaining), 'no permit yet')}
      </div>
      <table class="dt type-table" data-info="unit-types"><thead><tr><th></th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead>
        <tbody>${GUI().aggTypeRowsHTML(GUI().aggregateTypes(sel))}</tbody></table></div>
      <details class="sect" open><summary><h2 class="section-title" data-info="project-demand">Servicing demand</h2>
          <span class="muted small sect-sum">residential + employment</span></summary>
        <table class="dt demand-table"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
          ${row('Units', e => fmtNum(Math.round(e.totalUnits)))}
          ${row('Population', e => fmtNum(roundPop(e.population)))}
          ${row('Jobs', e => fmtNum(roundPop(e.employment.jobs)))}
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
        <details class="sel-split"><summary>Residential / employment split (total)</summary><div class="sel-flows">${WTab().flowTablesHTML(es[0])}</div></details>
        <p class="small muted">Peaks for the selection as one area (Harmon on its combined population). Completed = units on finished permits; remaining = the rest. Criteria as in the bottom panel.</p>
      </details>
      ${growth}
      <details class="sect"><summary><h2 class="section-title">Developments</h2><span class="muted small sect-sum">${fmtNum(sel.length)} · largest first</span></summary>
        <ul class="sel-list">${list}</ul></details>`;
  }
  // The selection summary, as a scope in the right panel (sel:selection).
  function showSelection(added) { Meas().openSelectionResult('Selection', added); }
  function exportSelectionCSV() {
    const rows = Ex().exportRows([...selection.values()]); if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const cell = v => window.PeelUtil.csvCell(v);
    Ex().download('peel-selection.csv', CSV_DISCLAIMER + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'), 'text/csv');
  }
  // The selection actions, in the selection scope (right panel) and on the Study area page.
  const selClick = e => {
    const a = e.target.closest('[data-sel]');
    if (a) {
      const k = a.dataset.sel;
      if (k === 'add') setLasso(true);
      else if (k === 'clear') { clearSelection(); PeelTools.closeResult(); }
      else if (k === 'csv') exportSelectionCSV();
      else if (k === 'back') Meas().openSelectionResult('Selection');
      return;
    }
    const o = e.target.closest('[data-open]');
    if (o && selection.has(o.dataset.open)) { DN().showDetail(selection.get(o.dataset.open)); if (e.currentTarget && e.currentTarget.id === 'home' && root.PeelWorkspaces) root.PeelWorkspaces.openPage('site'); return; }
    const d = e.target.closest('[data-drop]');
    if (d) { selection.delete(d.dataset.drop); drawSelection(); Meas().openSelectionResult('Selection'); }
    // (on the page: the page shows the new selection)
    if (e.currentTarget && e.currentTarget.id === 'home' && root.PeelWorkspaces && root.PeelWorkspaces.renderPage) setTimeout(() => root.PeelWorkspaces.renderPage(true), 0);
  };
  $('#scope-body').addEventListener('click', selClick);
  { const h = $('#home'); if (h) h.addEventListener('click', e => { if (e.target.closest('[data-page-map], .page-sel')) selClick(e); }); }

  // ---- Unselect: tap empty map, Esc, or the Clear selection button ----------------------------
  // Clears the open panel (development, area, DC item…), the highlighted catchment / zone, a drawn
  // selection, the address pin and highlighted mains. Filters stay as they are.
  let panelAt = 0;
  // A result scope opening or closing (a file, a block, a DC work…) is a selection too.
  const resultOpen = () => !!(window.PeelSvcScope && window.PeelSvcScope.hasResult());
  new MutationObserver(() => { panelAt = Date.now(); syncClearBtn(); MA().fitLegend(); }).observe($('#scope-body'), { childList: true, attributes: true, attributeFilter: ['hidden'] });
  const clearBtn = L.DomUtil.create('button', 'btn clear-sel', mapBottom);
  clearBtn.type = 'button'; clearBtn.innerHTML = 'Clear selection <span aria-hidden="true">×</span>'; clearBtn.title = 'Unselect (or tap an empty part of the map, or press Esc)'; clearBtn.hidden = true;
  L.DomEvent.disableClickPropagation(clearBtn);
  const somethingSelected = () => resultOpen() || !!ST().BLK.id || !!ST().TRACE.key || !!ST().svcFocus.id || selection.size > 0 || selAreas.length > 0 || lassoOn || EP().exHL.getLayers().length > 0 || SF().pinLayer.getLayers().length > 0 || ST().WTRACE.layer.getLayers().length > 0;
  function syncClearBtn() { clearBtn.hidden = !somethingSelected(); }
  function clearSelected() {
    if (lassoOn) setLasso(false);
    if (resultOpen()) AC().closeDetail();
    MM().highlight(null);
    if (ST().svcFocus.id) ST().focusSvc(ST().svcFocus.id, { zoom: false, loads: false });
    if (selection.size || selAreas.length) clearSelection();
    ST().clearBlockFocus(); ST().clearTrace(); WT().clearWaterTrace();
    EP().exHL.clearLayers(); SF().pinLayer.clearLayers();
    syncClearBtn();
  }
  clearBtn.onclick = clearSelected;
  // A tap on the map itself (not a marker, area or line that opened something in the same tap).
  map.on('click', () => {
    if (Meas().tool.mode || lassoOn) return;
    const t0 = Date.now();
    setTimeout(() => { if (panelAt < t0 - 5) clearSelected(); }, 30);
  });
  // (an Escape that closed a menu, a pop-up or the lasso is not also a "clear the selection")
  addEventListener('keydown', e => { if (e.key === 'Escape' && !e.defaultPrevented && !Meas().tool.mode && !lassoOn && !document.querySelector('.tour') && !(e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName))) clearSelected(); });

  const api = {
    selection,
    get selAreas() { return selAreas; },
    set selAreas(v) { selAreas = v; },
    getLassoOn() { return lassoOn; },
    setLasso, drawSelection, clearSelection, showSelection,
    selectionSummaryHTML, exportSelectionCSV, enterPresentation,
    exitPresentation, inPresentation, renderPresentation, updateNorth,
    setHov, syncToolsBtn, syncClearBtn, clearSelected,
    get pan() { return pan; },
    set pan(v) { pan = v; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAreaSelect = api;
})(typeof window !== 'undefined' ? window : globalThis);
