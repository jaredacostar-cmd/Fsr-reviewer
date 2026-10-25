/* Construction (Region capital projects) and environmental assessments on the map.
 *   - Layers › "Planned & under construction": solid = tendered / awarded / under construction
 *     (with "% built" labels from street zoom), dotted = planned. Filters water / wastewater / roads.
 *   - Layers › "EAs": outlines (study areas), lines and points; dashed = approximate or traced.
 *     Filters current / completed / all (completed off by default) and water / wastewater / roads.
 *   - Results year: work not in service by that year fades.
 *   - Hover: a one-line preview. Tap: js/map-pick.js (several features → picker). Opening an item
 *     shows its scope in the analysis panel (trail Peel › EA › name / Peel › Capital › project);
 *     Esc or × returns to the previous scope. An EA highlights its linked capital lines and DC works;
 *     a capital project outlines its EA.
 * Data: data/capital.json (optional; held off publication until Peel GIS confirms) and data/eas.json.
 */
(function (root) {
  'use strict';

  const M = window.PeelCapitalEAModel;
  const U = window.PeelUtil;
  const { esc, token, store } = U;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MA = () => window.PeelMapAnalysis;
  const MP = () => window.PeelMasterPlan;
  const DI = () => window.PeelDcInfra;
  const TS = () => window.PeelToolScope;
  const RI = () => window.PeelReportIssue;
  const PK = () => window.PeelPick;

  const LABEL_ZOOM = 14;
  const SYS_DEFAULT = { water: true, wastewater: true, roads: true };
  const ce = Object.assign({ cons: false, ea: false, show: 'current', consSys: { ...SYS_DEFAULT }, eaSys: { ...SYS_DEFAULT } }, store.get('ceOn', null) || {});
  const save = () => store.set('ceOn', ce);
  const data = { capital: null, eas: null, contracts: new Map(), recById: new Map(), eaById: new Map(), loaded: false };

  // Draw order (PeelLayerGroups.Z): construction with the planned works, EAs above them, under the
  // developments. Shapes don't take the pointer: js/map-pick.js gives the hover card and the tap.
  const Zs = (window.PeelLayerGroups && window.PeelLayerGroups.Z) || { infra: 380, eas: 390 };
  for (const [pane, z] of [['infraPane', Zs.infra], ['eaPane', Zs.eas]]) if (!map.getPane(pane)) map.createPane(pane, map.getPane('rotatePane') || undefined).style.zIndex = z;
  const consLayer = L.layerGroup(), eaLayer = L.layerGroup(), labelLayer = L.layerGroup(), hlLayer = L.layerGroup(), pvLayer = L.layerGroup();
  let openKind = null;

  // ---- data ----------------------------------------------------------------------------------------
  async function load() {
    const opt = async f => { try { const r = await fetch(f, { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; } };
    // (data/capital.json is shared with js/dc-joins.js: one request, one parsed copy)
    const [cap, eas] = await Promise.all([U.dataJSON ? U.dataJSON('data/capital.json') : opt('data/capital.json'), opt('data/eas.json')]);
    // (once every script has run: setting the data redraws the legend and the views, which read the
    // app's state from js/app.js, the last script; the files can arrive first)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setData(cap, eas), { once: true });
    else setData(cap, eas);
  }
  function setData(cap, eas) {
    data.capital = cap; data.eas = eas;
    data.recById = new Map(((cap && cap.records) || []).map(r => [r.id, r]));
    data.contracts = M.contracts((cap && cap.records) || []);
    data.eaById = new Map(((eas && eas.eas) || []).map(e => [e.id, e]));
    data.loaded = true;
    if (App() && App().state) { App().state.capital = cap; App().state.eas = eas; }
    syncControls(); render();
    if (MA()) MA().renderLegend();
    refreshViews();
  }
  const contractOf = id => { const r = data.recById.get(id); return r ? data.contracts.get(r.contract || `id:${r.id}`) : null; };

  // ---- drawing ---------------------------------------------------------------------------------------
  const ll = cs => cs.map(([x, y]) => [y, x]);
  const pathsOf = g => !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const yr = () => (MA() ? MA().getCapYear() : null);
  const shownRecords = () => ((data.capital && data.capital.records) || []).filter(r => M.capitalShown(r, ce.consSys));
  const shownEAs = () => ((data.eas && data.eas.eas) || []).filter(e => !M.eaUnplaced(e) && M.eaShown(e, ce.show, ce.eaSys));
  const unplacedEAs = () => ((data.eas && data.eas.eas) || []).filter(e => M.eaUnplaced(e) && M.eaShown(e, ce.show, ce.eaSys));

  // The map-analysis capacity re-render runs on every pan in pipes mode: redraw only when what is drawn
  // could differ (results year, filters, data, theme, picker presence).
  let drawnKey = null;
  const drawKey = () => JSON.stringify([yr(), ce, data.loaded, !!data.capital, !!data.eas, document.documentElement.dataset.theme || '', !!PK()]);
  function renderIfChanged() { if (drawKey() !== drawnKey) render(); }
  function render() {
    drawnKey = drawKey();
    consLayer.clearLayers(); eaLayer.clearLayers();
    const y = yr();
    if (ce.cons && data.capital) {
      consLayer.addTo(map);
      for (const r of shownRecords()) {
        const c = data.contracts.get(r.contract || `id:${r.id}`), build = M.isBuilding(r), faded = M.fadedAt(r, y);
        for (const p of pathsOf(r.geometry)) {
          // The system as a casing in the existing-pipe colours (water blue, wastewater brown, roads grey).
          L.polyline(ll(p), { pane: 'infraPane', interactive: false, color: token(M.SYS_CASING[r.system] || '--xing-street'), weight: (build ? 3 : 2) + 4, opacity: faded ? 0.15 : 0.55, lineCap: 'round' }).addTo(consLayer);
          L.polyline(ll(p), { pane: 'infraPane', interactive: !PK(), color: token(build ? '--cons-build' : '--cons-plan'), weight: build ? 3 : 2, opacity: faded ? 0.3 : 0.95, dashArray: build ? null : '2 6', lineCap: 'round', bubblingMouseEvents: false, className: 'ce-cons' })
            .bindTooltip(esc(M.capitalHover(c)), { sticky: true, className: 'pt' })
            .on('click', () => openCapital(c.key)).addTo(consLayer);
        }
      }
    } else map.removeLayer(consLayer);
    if (ce.ea && data.eas) {
      eaLayer.addTo(map);
      const low = map.getZoom() < M.EA_OUTLINE_ZOOM;
      for (const e of shownEAs()) {
        const st = M.eaStyle(e), col = token('--ea-line');
        const style = { pane: 'eaPane', interactive: !PK(), color: col, weight: st.weight, opacity: st.opacity, dashArray: st.dashArray, fill: /Polygon/.test(e.geometry.type) && st.fillOpacity > 0, fillColor: col, fillOpacity: st.fillOpacity, bubblingMouseEvents: false, className: 'ce-ea' };
        // Region view: one small marker per EA (current filled, completed hollow), outlines from zoom 12.
        if (low) {
          const lp = M.labelPoint(e.geometry); if (!lp) continue;
          L.circleMarker([lp[1], lp[0]], { pane: 'eaPane', interactive: !PK(), radius: e.status === 'complete' ? 4 : 5, color: col, weight: 1.5, opacity: st.opacity, fill: true, fillColor: col, fillOpacity: e.status === 'complete' ? 0 : 0.85, bubblingMouseEvents: false, className: 'ce-ea' })
            .bindTooltip(esc(M.eaHover(e)), { sticky: true, className: 'pt' }).on('click', () => openEA(e.id)).addTo(eaLayer);
          continue;
        }
        const lyr = e.geometry.type === 'Point'
          ? L.circleMarker([e.geometry.coordinates[1], e.geometry.coordinates[0]], { ...style, radius: 7, fill: true, fillOpacity: 0.25 })
          : L.geoJSON(e.geometry, { style: () => style, interactive: !PK(), pane: 'eaPane', pointToLayer: (f, ll) => L.circleMarker(ll, { ...style, radius: 7, fill: true, fillOpacity: 0.25 }) });   // MultiPoint: several intersections
        lyr.bindTooltip(esc(M.eaHover(e)), { sticky: true, className: 'pt' }).on('click', () => openEA(e.id)).addTo(eaLayer);
      }
    } else map.removeLayer(eaLayer);
    renderLabels();
  }

  // Labels from street zoom only: "% built" on construction, the EA name on EAs.
  function renderLabels() {
    labelLayer.clearLayers();
    if (map.getZoom() < LABEL_ZOOM || (!ce.cons && !ce.ea)) { map.removeLayer(labelLayer); return; }
    labelLayer.addTo(map);
    const b = map.getBounds().pad(0.1), seen = new Set();
    const lbl = (latlng, text, cls) => L.marker(latlng, { interactive: false, keyboard: false, icon: L.divIcon({ className: `ce-lbl ${cls}`, html: `<span>${esc(text)}</span>`, iconSize: null }) }).addTo(labelLayer);
    if (ce.cons && data.capital) for (const r of shownRecords()) {
      if (!M.isBuilding(r) || r.percentComplete == null) continue;
      const c = data.contracts.get(r.contract || `id:${r.id}`); if (seen.has(c.key)) continue;
      const p = pathsOf(r.geometry)[0]; if (!p) continue;
      const mid = p[Math.floor(p.length / 2)]; if (!b.contains([mid[1], mid[0]])) continue;
      const t = M.pctLabel(c); if (!t) continue;
      seen.add(c.key); lbl([mid[1], mid[0]], t, 'ce-lbl-cons');
    }
    if (ce.ea && data.eas) for (const e of shownEAs()) {
      const pt = M.labelPoint(e.geometry); if (!pt) continue;
      if (b.contains([pt[1], pt[0]])) lbl([pt[1], pt[0]], e.name.length > 48 ? `${e.name.slice(0, 46)}…` : e.name, `ce-lbl-ea${e.status === 'complete' ? ' done' : ''}`);
    }
    declutter();
  }
  // EA and construction labels give way to development labels (and to each other): after the
  // development labels are placed, a label that overlaps one is hidden.
  let declutterT = null;
  function declutter() {
    clearTimeout(declutterT);
    declutterT = setTimeout(() => {
      const box = el => el.getBoundingClientRect(), hit = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
      const taken = [...document.querySelectorAll('.plabel > div, .marker-cluster, .leaflet-marker-icon.pm')].map(box);
      for (const el of document.querySelectorAll('.ce-lbl > span')) {
        el.parentElement.style.visibility = '';
        const r = box(el);
        if (taken.some(t => hit(t, r))) { el.parentElement.style.visibility = 'hidden'; continue; }
        taken.push(r);
      }
    }, 80);
  }
  let lowZoom = map.getZoom() < M.EA_OUTLINE_ZOOM;
  map.on('zoomend moveend', () => {
    const low = map.getZoom() < M.EA_OUTLINE_ZOOM;
    if (ce.ea && low !== lowZoom) { lowZoom = low; render(); return; }
    lowZoom = low; if (ce.cons || ce.ea) renderLabels();
  });

  // ---- highlight (selection cyan) -----------------------------------------------------------------
  function highlight(geoms, linked, layer = hlLayer) {
    layer.clearLayers(); layer.addTo(map);
    const sel = token('--select');
    for (const g of geoms) if (g) L.geoJSON(g, { interactive: false, style: () => ({ color: sel, weight: 5, opacity: 0.95, fill: false }), pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 10, color: sel, weight: 3, fill: false, interactive: false }) }).addTo(layer);
    for (const g of linked || []) if (g) L.geoJSON(g, { interactive: false, style: () => ({ color: sel, weight: 3, opacity: 0.8, dashArray: '4 4', fill: false }), pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 8, color: sel, weight: 2, dashArray: '3 3', fill: false, interactive: false }) }).addTo(layer);
  }
  const clearHl = () => { hlLayer.clearLayers(); map.removeLayer(hlLayer); };
  // Picker hover previews (a row under the pointer): their own layer, so the open scope's highlight stays.
  const preview = (on, geoms) => { if (on) highlight(geoms, null, pvLayer); else { pvLayer.clearLayers(); map.removeLayer(pvLayer); } };

  // DC works for an EA's linked DC projects (lines with that project number, facilities with that item).
  function dcGeomsFor(projs) {
    const dc = App() && App().state.dcInfra; if (!dc || !projs.length) return [];
    const set = new Set(projs), out = [];
    for (const sys of ['water', 'wastewater']) {
      for (const ln of dc[sys].lines) if (set.has(ln.p)) out.push({ type: 'LineString', coordinates: ln.g });
      for (const f of dc[sys].facilities) if (f.g && f.items.some(i => set.has(i.proj))) out.push({ type: 'Point', coordinates: f.g });
    }
    return out;
  }
  function dcStatus(d) {
    const dc = App() && App().state.dcInfra; if (!dc) return '';
    const f = (dc[d.system] || dc.water).facilities.find(x => x.name === d.facility);
    const it = f && f.items.find(i => i.proj === d.proj);
    const c = it && it.phases.filter(p => p[0] === 'C').map(p => p[1]);
    return c && c.length ? `construction ${Math.min(...c)} (DC schedule)` : 'in the DC program';
  }

  // ---- scopes ------------------------------------------------------------------------------------------
  const isWatched = k => !!(App() && App().isWatched && App().isWatched(k));
  function openEA(id) {
    const e = data.eaById.get(id); if (!e) return;
    const html = M.eaScopeHTML(e, {
      screenNote: U.SCREEN_NOTE_SHORT,
      reportLink: RI() ? RI().reportLinkHTML({ uid: `ea:${e.id}`, ref: e.name, kind: 'ea', municipality: e.municipality }, { sourceUrl: e.links && e.links.page, portal: 'Region of Peel environmental assessments', pulledOn: e.lastChecked }) : '',
      watched: isWatched(`ea:${e.id}`), capitalById: cid => data.recById.get(cid), dcStatus, thisYear: new Date().getFullYear(),
    });
    openKind = 'ea';
    TS().toolResult('ea', e.name, html, () => openEA(id), { group: 'EA', ref: `ea:${e.id}` });
    const caps = ((e.related && e.related.capitalProjects) || []).map(c => data.recById.get(c.id)).filter(Boolean).map(r => r.geometry);
    highlight([e.geometry], [...caps, ...dcGeomsFor(((e.related && e.related.dcProjects) || []).map(d => d.proj))]);
  }
  function eaForContract(c) {
    const ids = new Set(c.records.map(r => r.id));
    const page = c.lead.website && c.lead.website.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '');
    return ((data.eas && data.eas.eas) || []).find(e => ((e.related && e.related.capitalProjects) || []).some(x => ids.has(x.id)) || (page && e.links && e.links.page && e.links.page.toLowerCase().replace(/^https?:\/\/(www\.)?/, '').replace(/\/+$/, '') === page)) || null;
  }
  function dcLinksFor(c) {
    const ids = new Set(c.records.map(r => r.id)), dc = App() && App().state.dcInfra;
    const out = [], seen = new Set();
    for (const l of (data.capital && data.capital.links) || []) {
      if (!ids.has(l.capital) || seen.has(l.dc)) continue;
      seen.add(l.dc);
      const [sys, kind, ref] = l.dc.split(':');
      let info = {};
      if (dc && kind === 'line') { const ln = dc[sys].lines.find(x => `c${x.c}` === ref || String(x.c) === ref.replace(/^c/, '')); if (ln) info = { name: ln.n || `${sys === 'water' ? 'Water' : 'Wastewater'} main ${ln.p || ''}`.trim(), diameter: ln.d, year: ln.y }; }
      if (kind === 'fac') info = { name: l.dc.split(':').slice(2).join(' – ') };
      out.push({ key: l.dc, method: l.method, confidence: l.confidence, ...info });
    }
    return out;
  }
  function openCapital(key) {
    const c = data.contracts.get(key); if (!c) return;
    const ea = eaForContract(c);
    const html = M.capitalScopeHTML(c, {
      screenNote: U.SCREEN_NOTE_SHORT,
      reportLink: RI() ? RI().reportLinkHTML({ uid: `cap:${c.key}`, ref: c.projectNumbers.join(', ') || M.workLabel(c.lead.workType), kind: 'capital', municipality: c.lead.municipality }, { sourceUrl: c.lead.website, portal: 'Region of Peel capital projects layer', pulledOn: c.lastUpdate }) : '',
      watched: isWatched(`cap:${c.key}`), dcLinks: dcLinksFor(c), ea: ea && { id: ea.id, name: ea.name, status: ea.status },
    });
    openKind = 'capital';
    TS().toolResult('capital', c.projectNumbers.length ? `Project ${c.projectNumbers.join(', ')}` : M.workLabel(c.lead.workType), html, () => openCapital(key), { group: 'Capital', ref: `cap:${c.key}` });
    highlight(c.records.map(r => r.geometry), ea ? [ea.geometry] : []);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-ce-cap]'); if (a) { const c = contractOf(a.dataset.ceCap); if (c) openCapital(c.key); return; }
      const b = e.target.closest('[data-ce-ea]'); if (b) openEA(b.dataset.ceEa);
    });
    document.addEventListener('peel:tool-closed', () => { if (openKind) { openKind = null; clearHl(); } });
    document.addEventListener('peel:result-opened', e => { const ref = (e.detail && e.detail.ref) || ''; if (openKind && !/^(ea|cap):/.test(ref)) { openKind = null; clearHl(); } });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !openKind || document.querySelector('.pick-sheet, .pick-pop')) return;
      if (window.PeelTools && window.PeelTools.hasResult()) window.PeelTools.closeResult();
    });
  }

  // ---- picker providers ----------------------------------------------------------------------------------
  // Each feature's lng/lat bounding box (cached), so a hover far from it skips the per-vertex distance.
  const BB = new WeakMap();
  function bboxOf(coords) {
    let b = BB.get(coords); if (b) return b;
    b = [Infinity, Infinity, -Infinity, -Infinity];
    const walk = c => { if (typeof c[0] === 'number') { if (c[0] < b[0]) b[0] = c[0]; if (c[1] < b[1]) b[1] = c[1]; if (c[0] > b[2]) b[2] = c[0]; if (c[1] > b[3]) b[3] = c[1]; } else c.forEach(walk); };
    walk(coords); BB.set(coords, b); return b;
  }
  function near(ctx, coords, pad = 0) {
    if (!coords) return false;
    const b = bboxOf(coords), q = [[b[0], b[1]], [b[2], b[1]], [b[0], b[3]], [b[2], b[3]]].map(ctx.toPx), t = ctx.tol + pad, [x, y] = ctx.point;
    return x >= Math.min(...q.map(p => p[0])) - t && x <= Math.max(...q.map(p => p[0])) + t && y >= Math.min(...q.map(p => p[1])) - t && y <= Math.max(...q.map(p => p[1])) + t;
  }
  function consHits(ctx) {
    if (!ce.cons || !data.capital) return [];
    const best = new Map();
    for (const r of shownRecords()) {
      if (!r.geometry || !near(ctx, r.geometry.coordinates)) continue;
      const d = M.hitDistance(ctx.point, r.geometry, ctx.toPx); if (d > ctx.tol) continue;
      const c = data.contracts.get(r.contract || `id:${r.id}`);
      if (!best.has(c.key) || best.get(c.key).d > d) best.set(c.key, {
        kind: 'construction', kindLabel: 'Capital project · screening', key: `cap:${c.key}`, d, label: M.capitalHover(c), short: M.workLabel(c.lead.workType).split(/[ (:]/)[0].toLowerCase(),
        sub: c.projectNumbers.join(', '), swatch: `background:var(${M.isBuilding(c.lead) ? '--cons-build' : '--cons-plan'})`,
        open: () => openCapital(c.key), highlight: on => preview(on, c.records.map(x => x.geometry)),
      });
    }
    return [...best.values()];
  }
  function eaHits(ctx) {
    if (!ce.ea || !data.eas) return [];
    const out = [];
    for (const e of shownEAs()) {
      if (!near(ctx, e.geometry.coordinates)) continue;
      const d = M.hitDistance(ctx.point, e.geometry, ctx.toPx); if (d > ctx.tol) continue;
      const inside = d === 0 && /Polygon/.test(e.geometry.type);
      out.push({ kind: inside ? 'area' : 'ea', kindLabel: 'Environmental assessment · screening', key: `ea:${e.id}`, d, label: inside ? `EA study area: ${e.name}` : M.eaHover(e), short: 'EA', sub: M.EA_STATUS[e.status], swatch: 'background:var(--ea-line)', open: () => openEA(e.id), highlight: on => preview(on, [e.geometry]) });
    }
    return out;
  }
  // Planned DC works, so a tap on overlapping construction / DC lines offers both.
  function dcHits(ctx) {
    const on = window.PeelMapMarkers && window.PeelMapMarkers.getDcOn(), dc = App() && App().state.dcInfra;
    if (!on || !on.on || !dc) return [];
    const out = [];
    for (const sys of ['water', 'wastewater']) {
      if (on.sys !== 'both' && on.sys !== sys) continue;
      for (const ln of dc[sys].lines) {
        if (!near(ctx, ln.g)) continue;
        const d = M.hitDistance(ctx.point, { type: 'LineString', coordinates: ln.g }, ctx.toPx); if (d > ctx.tol) continue;
        const k = `dc:${sys}:${ln.c || ln.p}`, prev = out.find(h => h.key === k);
        if (prev) { if (d < prev.d) prev.d = d; continue; }
        out.push({ kind: 'dc', key: k, d, label: `Planned DC ${sys === 'water' ? 'watermain' : 'sewer'}${ln.d ? ` ${ln.d} mm` : ''}${ln.y ? ` · ${ln.y}` : ''}`, short: 'planned DC', sub: ln.p ? `Project ${ln.p}` : '', swatch: `background:var(${(DI().DC_KIND[ln.k] || [])[1] || '--dc-ww-main'})`, open: () => MP().showDcLine(ln), highlight: hon => preview(hon, [{ type: 'LineString', coordinates: ln.g }]) });
      }
      for (const f of dc[sys].facilities) {
        if (!f.g || !near(ctx, f.g, 6)) continue;
        const d = M.hitDistance(ctx.point, { type: 'Point', coordinates: f.g }, ctx.toPx); if (d > ctx.tol + 6) continue;
        out.push({ kind: 'facility', key: `dcf:${sys}:${f.name}`, d, label: f.name, short: 'facility', sub: (DI().DC_FAC[f.kind] || f.kind), swatch: 'background:var(--dc-ww-force)', open: () => DI().showFacility(f), highlight: hon => preview(hon, [{ type: 'Point', coordinates: f.g }]) });
      }
    }
    return out;
  }
  if (PK()) { PK().register({ id: 'construction', hits: consHits }); PK().register({ id: 'ea', hits: eaHits }); PK().register({ id: 'dc', hits: dcHits }); }

  // ---- Layers panel ------------------------------------------------------------------------------------------
  function syncControls() {
    const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.checked = v; };
    set('#lyr-cons', ce.cons); set('#lyr-ea', ce.ea);
    for (const k of Object.keys(SYS_DEFAULT)) { set(`[data-ce-cons="${k}"]`, ce.consSys[k]); set(`[data-ce-easys="${k}"]`, ce.eaSys[k]); }
    document.querySelectorAll('[data-ce-show]').forEach(b => { b.checked = b.value === ce.show; });
    // A layer whose data is not there (capital projects: held until Peel GIS confirms) is not offered.
    const cl = document.querySelector('#lyr-cons'); if (cl) { const lab = cl.closest('label'); if (lab) lab.hidden = data.loaded && !data.capital; }
    const el = document.querySelector('#lyr-ea'); if (el) { const lab = el.closest('label'); if (lab) lab.hidden = data.loaded && !data.eas; }
    const n = document.querySelector('#ce-note');
    if (n) n.textContent = data.loaded && !data.capital ? 'Construction: capital projects are not published yet.' : '';
  }
  function setOn(ch) {
    Object.assign(ce, ch); save(); render(); syncControls(); if (MA()) MA().renderLegend();
    if (window.PeelLayerGroups) window.PeelLayerGroups.sync();
  }
  if (typeof document !== 'undefined') document.addEventListener('change', e => {
    const t = e.target;
    // The layer switches themselves are PeelLayerGroups' (Infrastructure); these are the filters.
    if (t.dataset && t.dataset.ceCons) setOn({ cons: true, consSys: { ...ce.consSys, [t.dataset.ceCons]: t.checked } });
    else if (t.dataset && t.dataset.ceEasys) setOn({ ea: true, eaSys: { ...ce.eaSys, [t.dataset.ceEasys]: t.checked } });
    else if (t.dataset && t.dataset.ceShow && t.checked) setOn({ ea: true, show: t.value });
  });

  /** Layers › Infrastructure: the construction and EA filters (the switches are the group's rows). */
  function settingsHTML() {
    const chip = (attr, on, body) => `<label class="mo-chip"><input type="checkbox" ${attr}${on ? ' checked' : ''}><span>${body}</span></label>`;
    const sysChips = (attr, cur) => [['water', 'Water'], ['wastewater', 'Wastewater'], ['roads', 'Roads']].map(([k, t]) => chip(`${attr}="${k}"`, cur[k], t)).join('');
    return `<div class="mo-sec ce-filters" data-info="construction-eas"><div class="mo-h">Construction and EA filters</div>
      <div class="mo-row"><span class="mo-k">Construction</span><div class="mo-chips">${sysChips('data-ce-cons', ce.consSys)}</div></div>
      <div class="mo-row"><span class="mo-k">EAs</span><div class="mo-chips" role="radiogroup" aria-label="Which EAs">${[['current', 'Current'], ['completed', 'Completed'], ['all', 'All']].map(([k, t]) => `<label class="mo-chip"><input type="radio" name="ce-show" data-ce-show="1" value="${k}"${ce.show === k ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <div class="mo-row"><span class="mo-k"></span><div class="mo-chips">${sysChips('data-ce-easys', ce.eaSys)}</div></div>
      <small id="ce-note"></small></div>`;
  }

  /** Legend section (js/map-analysis.js renderLegend). */
  function legendHTML() {
    const parts = [];
    if (ce.cons && data.capital) parts.push(`<div class="lg-t">Capital projects (Region layer, as of ${esc(M.fmtDate(data.capital.source && data.capital.source.latestLastUpdate))})</div><ul><li><span class="lg-line" style="background:var(--cons-build)"></span>Under construction, awarded or tendered</li><li><span class="lg-line dot" style="--c:var(--cons-plan)"></span>Planned</li><li><span class="lg-cased" style="--c:var(--pipe-water)"></span>Water <span class="lg-cased" style="--c:var(--pipe-sanitary)"></span>Wastewater <span class="lg-cased" style="--c:var(--xing-street)"></span>Roads <span class="muted">(edging)</span></li>${yr() != null ? `<li class="muted">faded: not in service by ${yr()}</li>` : ''}<li class="muted">from street zoom: "% built" (1–99%), "finishing" at 100%</li></ul>`);
    if (ce.ea && data.eas) parts.push(`<div class="lg-t">Environmental assessments (${esc({ current: 'current', completed: 'completed', all: 'all' }[ce.show])})</div><ul>${map.getZoom() < M.EA_OUTLINE_ZOOM ? '<li><span class="lg-dot" style="background:var(--ea-line)"></span>Current EA <span class="lg-dot hollow" style="--c:var(--ea-line)"></span>completed <span class="muted">(outlines from zoom 12)</span></li>' : '<li><span class="lg-area" style="--c:var(--ea-line)"></span>Current: study area, route or site</li><li><span class="lg-line dot" style="--c:var(--ea-line)"></span>Completed (fainter)</li>'}<li><span class="lg-line dash" style="background:var(--ea-line);opacity:.6"></span>thinner, dashed: approximate or traced</li>${unplacedEAs().length ? `<li class="muted">${unplacedEAs().length} with no mapped location yet (listed in Capital › EAs)</li>` : ''}</ul>`);
    return parts.join('');
  }

  // ---- Capital tab lists, DC timing status, This week, Needs attention, watchlist ----------------------------
  let dcIdx = null, dcIdxFor = null, allCap = false, allWatch = false;
  function dcIndex() {
    const dc = App() && App().state.dcInfra;
    if (!dcIdx || dcIdxFor !== `${!!dc}|${data.capital ? data.capital.generatedAt : ''}`) { dcIdx = M.dcCapitalIndex(data.capital, dc); dcIdxFor = `${!!dc}|${data.capital ? data.capital.generatedAt : ''}`; }
    return dcIdx;
  }
  const dcActualHTML = (proj, y) => (proj ? M.dcActualHTML(dcIndex().get(proj), !!data.capital, y) : '');
  const metres = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 110574);
  const easForDcHTML = fc => (data.eas ? M.easForDcHTML(M.easForDc(fc, data.eas.eas, metres)) : '');
  const muni = () => (App() && App().state.muni) || null;
  const capAsOf = () => (data.capital && data.capital.source && data.capital.source.latestLastUpdate) || '';
  // The watch list (Capital › Construction › To check), at the map's municipality.
  const watchList = () => (data.loaded ? M.watchList({ capital: data.capital, eas: (data.eas && data.eas.eas) || [], contracts: data.contracts, today: new Date().toISOString().slice(0, 10), asOf: capAsOf(), muni: muni() }) : []);
  const listsHTML = () => (data.loaded ? M.listsHTML({ contracts: data.contracts, eas: data.eas && data.eas.eas, muni: muni(), thisYear: new Date().getFullYear(), hasCapital: !!data.capital, capitalAsOf: capAsOf(), screenNote: U.SCREEN_NOTE_SHORT, allCap, watch: watchList(), allWatch }) : U.skel ? U.skel('Loading capital projects and EAs') : '');
  const attention = () => (data.loaded ? M.attentionItems(data.capital, data.eas, new Date().toISOString().slice(0, 10)) : []);
  const watchRows = watch => (data.loaded ? M.watchRows(watch, data.capital, data.eas) : []);
  // Refresh everything that reads the data once it arrives.
  function refreshViews() {
    if (App() && App().renderWatch) App().renderWatch();
    const AT = window.PeelAnalysisTabs;
    if (AT && AT.getFootTab() === 'dca' && window.PeelDcaTab) window.PeelDcaTab.renderDca();
    if (AT && AT.getFootTab() === 'overview' && window.PeelOverviewTab) window.PeelOverviewTab.renderOverview();
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const o = e.target.closest('[data-ce-open]');
    if (o) { const [k, ...rest] = o.dataset.ceOpen.split(':'), id = rest.join(':'); if (k === 'ea') openEA(id); else if (k === 'cap') openCapital(id); return; }
    if (e.target.closest('[data-ce-allcap]')) { allCap = true; const bb = document.querySelector('#dca-build-body'); if (bb) bb.innerHTML = listsHTML(); }
    if (e.target.closest('[data-ce-allwatch]')) { allWatch = true; const bb = document.querySelector('#dca-build-body'); if (bb) bb.innerHTML = listsHTML(); }
    const csv = (name, { cols, rows }) => { if (window.PeelExports) window.PeelExports.download(`${name}-${(muni() || 'peel').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`, (U.CSV_DISCLAIMER || '') + [cols, ...rows].map(r => r.map(v => U.csvCell(v, true)).join(',')).join('\n'), 'text/csv'); };
    if (e.target.closest('[data-ce-watch-csv]')) csv('peel-capital-to-check', M.watchSheetRows(watchList(), capAsOf()));
    if (e.target.closest('[data-ce-cap-csv]')) csv('peel-capital-contracts', capitalRows(muni()));
    if (e.target.closest('[data-ce-copy-brief]')) copyBrief();
  });
  // Every contract, one row each (the Construction CSV and the workbook's Capital sheet).
  const capitalRows = m => M.capitalSheetRows(data.contracts, { today: new Date().toISOString().slice(0, 10), asOf: capAsOf(), eas: (data.eas && data.eas.eas) || [], links: (data.capital && data.capital.links) || [], muni: m });

  // ---- Capital › EAs ----------------------------------------------------------------------------------
  const eaTab = Object.assign({ f: { q: '', show: 'current', sys: {} }, sort: 'next' }, store.get('eaTab', null) || {});
  eaTab.f.q = '';   // the search box starts empty each visit
  const saveEaTab = () => store.set('eaTab', { f: { ...eaTab.f, q: '' }, sort: eaTab.sort });
  const today = () => new Date().toISOString().slice(0, 10);
  // A development in scope: the EAs within 1 km of its site, measured from the site's boundary (the
  // outlines of its applications; its point where it has none), and the unmapped EAs naming its
  // municipality or the whole Region.
  const nearScope = () => nearOf(window.PeelDevVerdict && window.PeelDevVerdict.scopedDev && window.PeelDevVerdict.scopedDev());
  function nearOf(p) {
    if (!p || p.lat == null) return null;
    const pts = [];
    for (const a of p.records || []) if (a.kind === 'application' && a.poly && a.phase !== 'cancelled') for (const ring of a.poly) for (const [x, y] of ring) pts.push([y, x]);
    const step = Math.max(1, Math.ceil(pts.length / 150));
    return { title: p.title, lat: p.lat, lng: p.lng, m: 1000, pts: pts.filter((_, i) => i % step === 0), muni: p.municipality, edge: pts.length > 0 };
  }
  function eaTabHTML() {
    if (!data.loaded) return U.skel ? U.skel('Loading the environmental assessments') : '';
    if (!data.eas) return '<p class="small muted">The environmental assessments did not load.</p>';
    return M.eaTabHTML({ eas: data.eas.eas, f: eaTab.f, picked: !!eaTab.picked, sort: eaTab.sort, today: today(), thisYear: new Date().getFullYear(), muni: muni(), near: nearScope(), checked: data.eas.generatedAt && data.eas.generatedAt.slice(0, 10), screenNote: U.SCREEN_NOTE_SHORT });
  }
  let eaBox = null;
  function renderEaTab(box) {
    eaBox = box || eaBox || document.querySelector('#dca-eas-body'); if (!eaBox) return;
    const q = eaBox.querySelector('[data-eatab-q]'), focused = q && document.activeElement === q, pos = q ? q.selectionStart : 0;
    eaBox.innerHTML = eaTabHTML();
    if (focused) { const q2 = eaBox.querySelector('[data-eatab-q]'); if (q2) { q2.focus(); q2.setSelectionRange(pos, pos); } }
  }
  // ---- Stage 3: Capital › Projects and Capital › EAs as standard panels ---------------------------------
  const inScope = e => String(e.municipality || '').toUpperCase().includes(String(muni()).toUpperCase()) || /region-wide/i.test(e.municipality || '');
  function projectsPanelSpec() {
    const PN = root.PeelPanel, act = data.loaded ? M.activeConstruction(data.contracts || new Map(), muni()) : [];
    const n = st => act.filter(c => c.status === st).length, asOf = data.capital && data.capital.source && data.capital.source.latestLastUpdate;
    const watch = data.capital ? watchList() : [];
    return {
      fullTitle: `Capital › Projects · ${muni() || 'Peel'}: active Region capital projects`,
      head: PN.areaHead('Capital › Projects', 'What is being built?', null, `${U.esc(muni() || 'Peel')}${asOf ? ` · capital projects as of ${U.esc(M.fmtDate(asOf))}` : ''}`),
      answer: !data.capital ? 'Capital projects are not published yet (waiting on Peel GIS).' : act.length ? `<strong>${act.length}</strong> Region capital project${act.length === 1 ? ' is' : 's are'} active${muni() ? ` in ${U.esc(muni())}` : ''}: ${n('under construction')} under construction, ${n('awarded')} awarded and ${n('tendered')} tendered.` : `No active construction${muni() ? ` in ${U.esc(muni())}` : ''}.`,
      figures: data.capital ? [{ v: act.length, u: 'active', label: 'capital projects', ctx: 'tendered, awarded or under construction' }, { v: n('under construction'), u: '', label: 'under construction', ctx: '' }, { v: n('awarded'), u: '', label: 'awarded', ctx: '' }, { v: n('tendered'), u: '', label: 'tendered', ctx: '' }] : [],
      lists: [...(watch.length ? [{ title: 'To check', rows: watch.slice(0, 5).map(x => ({ attrs: { 'data-ce-open': x.key }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${U.esc(x.label)}<small>${U.esc(M.WATCH_KINDS.find(k => k[0] === x.kind)[1])}${x.where ? ` · ${U.esc(x.where)}` : ''}</small></span></div><small class="pnl-r-line">${U.esc(x.why)}. To check: ${U.esc(x.check)}.</small>` })), total: watch.length, seeAll: { 'data-full-table': 'dca' } }] : []),
        { title: 'Furthest along', rows: act.slice(0, 5).map(c => ({ attrs: { 'data-ce-open': `cap:${c.key}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${U.esc(M.workLabel(c.lead.workType))}${c.lead.street ? `<small>${U.esc(M.titleCase(c.lead.street))}${c.lead.municipality ? ` · ${U.esc(M.titleCase(c.lead.municipality))}` : ''}</small>` : ''}</span><span class="pnl-r-fig">${c.percent != null ? `${Math.round(c.percent)}%` : ''}<small>${U.esc(M.statusLabel(c.status))}</small></span></div>` })), total: act.length, seeAll: { 'data-full-table': 'dca' } }],
      method: 'To check: contracts past their completion target with no completion date, open work not updated in the year before the layer\u2019s latest update, EAs marked current with nothing ahead and no milestone in 18 months, and EAs complete 9+ years with no construction following. Furthest along: Region capital projects that are tendered, awarded or under construction. Screening wording: the capital program and its status are the Region\u2019s; nothing here is a Region decision.',
      sources: 'Region of Peel capital projects (Peel GIS)' + (asOf ? `, as of ${U.esc(M.fmtDate(asOf))}` : '') + '.',
      foot: { primary: { label: 'Show them on the map', attrs: { 'data-pnl-ce-map': 'cons' } }, ...(data.capital ? { secondary: [{ label: 'CSV: every contract', attrs: { 'data-ce-cap-csv': '' } }] } : {}) },
    };
  }
  function easPanelSpec() {
    const PN = root.PeelPanel, near = nearScope(), all = (data.eas && data.eas.eas) || [], t = today(), y = new Date().getFullYear();
    const scoped = near ? M.easNear(all, near.lat, near.lng, near.m, near.pts).map(h => ({ ...h.e, _d: h.d })) : muni() ? all.filter(inScope) : all;
    const cur = M.eaSort(scoped.filter(e => M.EA_CURRENT.has(e.status)), 'next'), up = M.upcoming(scoped, t, 90), open = M.openPeriods(scoped, t);
    const recent = scoped.filter(e => e.status === 'complete' && e.completedYear && e.completedYear >= y - M.RECENT_YEARS);
    const may = near ? M.easMayApply(all, near.muni) : [], p = near && root.PeelDevVerdict ? root.PeelDevVerdict.scopedDev() : null;
    const works = near ? (siteBriefFor() || { works: [] }).works : [];
    const workRow = x => { const [head, tail] = M.briefWorkLine(x); return { attrs: { 'data-ce-open': `cap:${x.c.key}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${U.esc(head)}</span>${M.statusBadge(x.c.status)}</div><small class="pnl-r-line">${U.esc(tail.replace(/^[^;,]+[;,] ?/, ''))}</small>` }; };
    const eaRow = e => ({ attrs: { 'data-ce-open': `ea:${e.id}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${U.esc(e.name)}<small>${U.esc(M.titleCase(e.system))}${e._d != null ? ` · ${e._d < 1 ? 'on the site' : `${Math.round(e._d)} m away`}` : ''}</small></span>${M.eaBadge(e.status)}</div><small class="pnl-r-line">${e.nextStep ? `next: ${U.esc(e.nextStep.text)}${e.nextStep.date ? ` · ${U.esc(M.fmtDate(e.nextStep.date))}` : ''}` : e.completedYear ? `completed ${e.completedYear}` : 'no next step published'}</small>` });
    return {
      fullTitle: `Capital › EAs · ${p ? p.title : muni() || 'Peel'}: every environmental assessment, with filters`,
      head: p ? PN.siteHead(p) : PN.areaHead('Capital › EAs', 'What is being studied?', open.length ? { tone: 'tight', text: `${open.length} open for comment` } : null, `${U.esc(muni() || 'Peel')} · ${scoped.length} EAs`),
      answer: near ? `${scoped.length ? `<strong>${scoped.length}</strong> EA${scoped.length === 1 ? '' : 's'} within 1 km of the site boundary (${cur.length} current)` : 'No EA mapped within 1 km of the site boundary'}${may.length ? `; <strong>${may.length}</strong> more may apply (not on the map yet)` : ''}; <strong>${works.length}</strong> capital work${works.length === 1 ? '' : 's'} planned or under way within 1 km${works.filter(x => x.check.overdue).length ? ` (${works.filter(x => x.check.overdue).length} past ${works.filter(x => x.check.overdue).length === 1 ? 'its' : 'their'} completion target)` : ''}.`
        : `<strong>${cur.length}</strong> current EA${cur.length === 1 ? '' : 's'}${muni() ? ` in ${U.esc(muni())}` : ''}; ${up.length} milestone${up.length === 1 ? '' : 's'} in the next 90 days${open.length ? `, <strong>${open.length}</strong> open for comment now` : ''}.`,
      figures: [{ v: cur.length, u: 'current', label: 'EAs under way', ctx: 'commenced, consultation, review or addendum' }, { v: up.length, u: '', label: 'milestones, next 90 days', ctx: '', attrs: { 'data-full-table': 'dca' } }, { v: open.length, u: '', label: 'open for comment now', ctx: '', tone: open.length ? 'tight' : null, attrs: open.length === 1 ? { 'data-ce-open': `ea:${open[0].e.id}` } : { 'data-full-table': 'dca' } }, { v: recent.length, u: '', label: `completed ${y - M.RECENT_YEARS} or later`, ctx: '' }],
      lists: [
        ...(up.length ? [{ title: 'Coming up (90 days)', rows: up.slice(0, 5).map(x => ({ attrs: { 'data-ce-open': `ea:${x.e.id}` }, html: `<div class="pnl-kv"><span>${U.esc(M.MS_LABEL[x.m.type] || x.m.type)}: ${U.esc(x.e.name)}</span><span>${U.esc(M.fmtDate(x.m.date))}</span></div>` })), total: up.length, seeAll: { 'data-full-table': 'dca' } }] : []),
        { title: near ? 'Near the site' : 'Current EAs', rows: (near ? M.eaSort(scoped, 'next') : cur).slice(0, 5).map(eaRow), total: near ? scoped.length : cur.length, seeAll: { 'data-full-table': 'dca' } },
        ...(may.length ? [{ title: 'May apply (not on the map yet)', rows: may.slice(0, 5).map(eaRow), total: may.length, seeAll: { 'data-full-table': 'dca' } }] : []),
        ...(near ? [{ title: 'Capital works planned or under way near the site', rows: works.slice(0, 5).map(workRow), total: works.length, seeAll: { 'data-full-table': 'dca' } }] : []),
      ],
      method: near ? 'EAs whose mapped study area is within 1 km of the site boundary (0 inside it); "may apply" lists EAs with no mapped study area that name the site\u2019s municipality or the whole Region. Capital works: planned, tendered, awarded or under construction contracts with a segment within 1 km; % built is the Region\u2019s figure, else estimated from the start and target dates; a target passed with no completion date, or a record not updated in a year, is said. Copy for review comments gives all of it as plain text with each project page.' : 'Region of Peel environmental assessments: current ones (commenced, in consultation, under review or in addendum), their dated milestones and open comment periods. Screening wording only.',
      sources: `Region of Peel EA project pages${data.eas && data.eas.generatedAt ? `, checked ${U.esc(M.fmtDate(data.eas.generatedAt.slice(0, 10)))}` : ''}.`,
      foot: { primary: { label: 'Show EAs on the map', attrs: { 'data-pnl-ce-map': 'ea' } }, ...(near ? { secondary: [{ label: 'Copy for review comments', attrs: { 'data-ce-copy-brief': '' } }] } : {}) },
    };
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-pnl-ce-map]'); if (b) setOn({ [b.dataset.pnlCeMap]: true }); });
  // EAs within the site's radius (null when no site is scoped): an empty Capital › EAs is hidden.
  // (Any status: a site with only completed EAs nearby still lists them under its filter.)
  const siteEaCount = () => { const near = nearScope(); return near && data.eas ? M.easNear(data.eas.eas || [], near.lat, near.lng, near.m, near.pts).length + M.easMayApply(data.eas.eas || [], near.muni).length : null; };
  // The site brief (a reviewer's): the EAs and the planned or active capital work within 1 km of a
  // development (p; else the one in scope). null before the data loads or with no site.
  function siteBriefFor(p) {
    const near = p ? nearOf(p) : nearScope();
    if (!near || !data.loaded) return null;
    return M.siteBrief({ eas: (data.eas && data.eas.eas) || [], contracts: data.contracts, lat: near.lat, lng: near.lng, pts: near.pts, muni: near.muni, m: near.m, today: today(), asOf: capAsOf() });
  }
  const briefSources = () => ({ asOf: capAsOf(), easChecked: data.eas && data.eas.generatedAt ? data.eas.generatedAt.slice(0, 10) : '' });
  const siteBriefText = p => { const b = siteBriefFor(p), q = p || (window.PeelDevVerdict && window.PeelDevVerdict.scopedDev()); return b ? M.siteBriefText(b, { title: q && q.title, ...briefSources() }) : ''; };
  const siteBriefHTML = (p, o = {}) => { const b = siteBriefFor(p); return b ? M.siteBriefHTML(b, o) : ''; };
  // EAs and works near the site in scope (null when none is scoped): an empty Capital › EAs is hidden.
  const siteBriefCount = () => { const b = siteBriefFor(); return b ? b.eas.length + b.may.length + b.works.length : null; };
  async function copyBrief() {
    const t = siteBriefText(); if (!t) return;
    let ok = false;
    try { await navigator.clipboard.writeText(t); ok = true; } catch (err) { ok = false; }
    if (!ok && window.PeelExports) window.PeelExports.download(`site-brief-${today()}.txt`, t, 'text/plain');
    if (U.toast) U.toast(ok ? 'Copied: the EAs and capital works near the site, ready to paste into review comments' : 'Copy was blocked, so the brief was saved as a text file');
  }
  const filteredEAs = () => {
    const near = nearScope(), all = (data.eas && data.eas.eas) || [];
    const scoped = near ? M.easNear(all, near.lat, near.lng, near.m, near.pts).map(h => h.e) : muni() ? all.filter(e => String(e.municipality || '').toUpperCase().includes(String(muni()).toUpperCase()) || /region-wide/i.test(e.municipality || '')) : all;
    const cur = scoped.filter(e => M.EA_CURRENT.has(e.status));
    const fx = near && !eaTab.picked && !cur.length && scoped.length ? { ...eaTab.f, show: 'all' } : eaTab.f;   // (as the list on screen: eaTabHTML)
    return M.eaSort(scoped.filter(e => M.eaMatch(e, fx)), eaTab.sort);
  };
  if (typeof document !== 'undefined') {
    let qTimer = null;
    document.addEventListener('input', e => {
      const q = e.target.closest && e.target.closest('[data-eatab-q]'); if (!q) return;
      clearTimeout(qTimer); qTimer = setTimeout(() => { eaTab.f.q = q.value; renderEaTab(); }, 200);
    });
    document.addEventListener('change', e => {
      const t = e.target; if (!t.closest || !t.closest('#dca-eas-body')) return;
      if (t.dataset.eatabShow != null && t.checked) { eaTab.f.show = t.dataset.eatabShow; eaTab.picked = true; }
      else if (t.dataset.eatabSys != null) eaTab.f.sys = { ...eaTab.f.sys, [t.dataset.eatabSys]: t.checked };
      else if (t.dataset.eatabSort != null) eaTab.sort = t.value;
      else return;
      saveEaTab(); renderEaTab();
    });
    document.addEventListener('click', e => {
      const go = e.target.closest('[data-ce-goto]');
      if (go) { const AT = window.PeelAnalysisTabs; if (AT) { AT.setSub('dca', go.dataset.ceGoto); AT.showFootTab('dca'); } return; }
      if (!e.target.closest('#dca-eas-body')) return;
      const stamp = today();
      if (e.target.closest('[data-eatab-csv]')) {
        const { cols, rows } = M.eaSheetRows(filteredEAs()), q = v => U.csvCell(v, true);
        if (window.PeelExports) window.PeelExports.download(`peel-environmental-assessments-${stamp}.csv`, (U.CSV_DISCLAIMER || '') + [cols, ...rows].map(r => r.map(q).join(',')).join('\n'), 'text/csv');
      } else if (e.target.closest('[data-eatab-geo]')) {
        if (window.PeelExports) window.PeelExports.download(`peel-environmental-assessments-${stamp}.geojson`, JSON.stringify(M.easGeoJSON(filteredEAs(), { ...exportProps(), asOf: data.eas.generatedAt })), 'application/geo+json');
      } else if (e.target.closest('[data-eatab-ics]')) {
        const near = nearScope(), all = (data.eas && data.eas.eas) || [];
        const scoped = near ? M.easNear(all, near.lat, near.lng, near.m, near.pts).map(h => h.e) : muni() ? all.filter(x => String(x.municipality || '').toUpperCase().includes(String(muni()).toUpperCase()) || /region-wide/i.test(x.municipality || '')) : all;
        if (window.PeelExports) window.PeelExports.download(`peel-ea-milestones-${stamp}.ics`, M.eaICS(M.upcoming(scoped, stamp, 90), new Date().toISOString()), 'text/calendar');
      } else if (e.target.closest('[data-eatab-map]')) {
        const sys = { water: eaTab.f.sys.water !== false, wastewater: eaTab.f.sys.wastewater !== false, roads: eaTab.f.sys.roads !== false || eaTab.f.sys.storm !== false };
        setOn({ ea: true, show: eaTab.f.show === 'complete' ? 'completed' : eaTab.f.show, eaSys: sys });
        const pts = filteredEAs().filter(x => !M.eaUnplaced(x)).map(x => L.geoJSON(x.geometry).getBounds()).filter(b => b.isValid());
        if (pts.length) map.fitBounds(pts.reduce((a, b) => a.extend(b), L.latLngBounds(pts[0].getSouthWest(), pts[0].getNorthEast())), { padding: [30, 30], maxZoom: 15 });
      }
    });
  }

  // ---- Exports: GeoJSON for both layers; sheets for the workbook (js/exports.js). No people. ----------
  const exportProps = () => ({ ...(U.DISCLAIMER_PROPS || {}), generated: new Date().toISOString() });
  // The collections (null until loaded); the shapefile export (js/exports.js) uses them too.
  const consGeoJSON = () => (data.capital ? M.capitalGeoJSON(data.capital.records, { ...exportProps(), asOf: data.capital.source && data.capital.source.latestLastUpdate }) : null);
  const easGeoJSON = () => (data.eas ? M.easGeoJSON(data.eas.eas, { ...exportProps(), asOf: data.eas.generatedAt }) : null);
  function exportConsGeoJSON() {
    if (!data.capital || !window.PeelExports) return;
    window.PeelExports.download('peel-capital-projects.geojson', JSON.stringify(consGeoJSON()), 'application/geo+json');
  }
  function exportEasGeoJSON() {
    if (!data.eas || !window.PeelExports) return;
    window.PeelExports.download('peel-environmental-assessments.geojson', JSON.stringify(easGeoJSON()), 'application/geo+json');
  }
  const workbookSheets = () => [
    ...(data.capital ? [['Capital', capitalRows(null)], ['Capital to check', M.watchSheetRows(M.watchList({ capital: data.capital, eas: (data.eas && data.eas.eas) || [], contracts: data.contracts, today: today(), asOf: capAsOf() }), capAsOf())]] : []),
    ...(data.eas ? [['EAs', M.eaSheetRows(data.eas.eas)]] : []),
  ];

  // Startup: the Layers control is already on the map (map-markers.js), so fill its section, then load.
  if (typeof document !== 'undefined') {
    const slot = document.querySelector('#ce-settings'); if (slot) slot.outerHTML = settingsHTML();
    syncControls();
    load();
  }

  // Stage 1 #9: a DC project's status in the capital records (null when it has no record).
  const dcStatusOf = proj => (proj && data.capital ? dcIndex().get(proj) || null : null);
  const api = { projectsPanelSpec, easPanelSpec, siteEaCount, siteBriefCount, siteBriefFor, siteBriefText, siteBriefHTML, watchList, dcStatusOf, statusText: s => M.statusLabel(s), renderEaTab, eaTabHTML, renderIfChanged, exportConsGeoJSON, exportEasGeoJSON, consGeoJSON, easGeoJSON, workbookSheets, setOn, consHits, eaHits, easForDcHTML, listsHTML, dcActualHTML, attention, watchRows, load, setData, render, renderLabels, openEA, openCapital, settingsHTML, legendHTML, syncControls, getState: () => ce, data };
  root.PeelCapitalEA = api;
})(typeof window !== 'undefined' ? window : globalThis);
