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

  const consLayer = L.layerGroup(), eaLayer = L.layerGroup(), labelLayer = L.layerGroup(), hlLayer = L.layerGroup();
  let openKind = null;

  // ---- data ----------------------------------------------------------------------------------------
  async function load() {
    const opt = async f => { try { const r = await fetch(f, { cache: 'no-cache' }); return r.ok ? r.json() : null; } catch (e) { return null; } };
    const [cap, eas] = await Promise.all([opt('data/capital.json'), opt('data/eas.json')]);
    setData(cap, eas);
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
  }
  const contractOf = id => { const r = data.recById.get(id); return r ? data.contracts.get(r.contract || `id:${r.id}`) : null; };

  // ---- drawing ---------------------------------------------------------------------------------------
  const ll = cs => cs.map(([x, y]) => [y, x]);
  const pathsOf = g => !g ? [] : g.type === 'LineString' ? [g.coordinates] : g.type === 'MultiLineString' ? g.coordinates : [];
  const yr = () => (MA() ? MA().getCapYear() : null);
  const shownRecords = () => ((data.capital && data.capital.records) || []).filter(r => M.capitalShown(r, ce.consSys));
  const shownEAs = () => ((data.eas && data.eas.eas) || []).filter(e => !M.eaUnplaced(e) && M.eaShown(e, ce.show, ce.eaSys));
  const unplacedEAs = () => ((data.eas && data.eas.eas) || []).filter(e => M.eaUnplaced(e) && M.eaShown(e, ce.show, ce.eaSys));

  function render() {
    consLayer.clearLayers(); eaLayer.clearLayers();
    const y = yr();
    if (ce.cons && data.capital) {
      consLayer.addTo(map);
      for (const r of shownRecords()) {
        const c = data.contracts.get(r.contract || `id:${r.id}`), build = M.isBuilding(r), faded = M.fadedAt(r, y);
        for (const p of pathsOf(r.geometry)) {
          L.polyline(ll(p), { color: token(build ? '--cons-build' : '--cons-plan'), weight: build ? 3 : 2, opacity: faded ? 0.3 : 0.95, dashArray: build ? null : '2 6', lineCap: 'round', bubblingMouseEvents: false, className: 'ce-cons' })
            .bindTooltip(esc(M.capitalHover(c)), { sticky: true, className: 'pt' })
            .on('click', ev => (PK() ? PK().at(ev) : openCapital(c.key))).addTo(consLayer);
        }
      }
    } else map.removeLayer(consLayer);
    if (ce.ea && data.eas) {
      eaLayer.addTo(map);
      for (const e of shownEAs()) {
        const dash = M.eaDashed(e), col = token('--ea-line');
        const style = { color: col, weight: 2, opacity: 0.9, dashArray: dash ? '5 5' : null, fill: /Polygon/.test(e.geometry.type), fillColor: col, fillOpacity: 0.05, bubblingMouseEvents: false, className: 'ce-ea' };
        const lyr = e.geometry.type === 'Point'
          ? L.circleMarker([e.geometry.coordinates[1], e.geometry.coordinates[0]], { ...style, radius: 7, fill: true, fillOpacity: 0.25 })
          : L.geoJSON(e.geometry, { style: () => style });
        lyr.bindTooltip(esc(M.eaHover(e)), { sticky: true, className: 'pt' }).on('click', ev => (PK() ? PK().at(ev) : openEA(e.id))).addTo(eaLayer);
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
      seen.add(c.key); lbl([mid[1], mid[0]], `${c.percent}% built`, 'ce-lbl-cons');
    }
    if (ce.ea && data.eas) for (const e of shownEAs()) {
      const g = e.geometry, pt = g.type === 'Point' ? g.coordinates : g.type === 'LineString' ? g.coordinates[Math.floor(g.coordinates.length / 2)] : g.type === 'MultiLineString' ? g.coordinates[0][Math.floor(g.coordinates[0].length / 2)] : g.type === 'Polygon' ? g.coordinates[0][0] : g.coordinates[0][0][0];
      if (b.contains([pt[1], pt[0]])) lbl([pt[1], pt[0]], e.name.length > 48 ? `${e.name.slice(0, 46)}…` : e.name, 'ce-lbl-ea');
    }
  }
  map.on('zoomend moveend', () => { if (ce.cons || ce.ea) renderLabels(); });

  // ---- highlight (selection orange) -----------------------------------------------------------------
  function highlight(geoms, linked) {
    hlLayer.clearLayers(); hlLayer.addTo(map);
    const sel = token('--select');
    for (const g of geoms) if (g) L.geoJSON(g, { interactive: false, style: () => ({ color: sel, weight: 5, opacity: 0.95, fill: false }), pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 10, color: sel, weight: 3, fill: false, interactive: false }) }).addTo(hlLayer);
    for (const g of linked || []) if (g) L.geoJSON(g, { interactive: false, style: () => ({ color: sel, weight: 3, opacity: 0.8, dashArray: '4 4', fill: false }), pointToLayer: (f, latlng) => L.circleMarker(latlng, { radius: 8, color: sel, weight: 2, dashArray: '3 3', fill: false, interactive: false }) }).addTo(hlLayer);
  }
  const clearHl = () => { hlLayer.clearLayers(); map.removeLayer(hlLayer); };

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
      watched: isWatched(`ea:${e.id}`), capitalById: cid => data.recById.get(cid), dcStatus,
    });
    openKind = 'ea';
    TS().toolResult('ea', e.name, html, () => openEA(id), { group: 'EA' });
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
    TS().toolResult('capital', c.projectNumbers.length ? `Project ${c.projectNumbers.join(', ')}` : M.workLabel(c.lead.workType), html, () => openCapital(key), { group: 'Capital' });
    highlight(c.records.map(r => r.geometry), ea ? [ea.geometry] : []);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const a = e.target.closest('[data-ce-cap]'); if (a) { const c = contractOf(a.dataset.ceCap); if (c) openCapital(c.key); return; }
      const b = e.target.closest('[data-ce-ea]'); if (b) openEA(b.dataset.ceEa);
    });
    document.addEventListener('peel:tool-closed', () => { if (openKind) { openKind = null; clearHl(); } });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !openKind || document.querySelector('.pick-sheet, .pick-pop')) return;
      if (window.PeelTools && window.PeelTools.hasResult()) window.PeelTools.closeResult();
    });
  }

  // ---- picker providers ----------------------------------------------------------------------------------
  function consHits(ctx) {
    if (!ce.cons || !data.capital) return [];
    const best = new Map();
    for (const r of shownRecords()) {
      const d = M.hitDistance(ctx.point, r.geometry, ctx.toPx); if (d > ctx.tol) continue;
      const c = data.contracts.get(r.contract || `id:${r.id}`);
      if (!best.has(c.key) || best.get(c.key).d > d) best.set(c.key, {
        kind: 'construction', key: `cap:${c.key}`, d, label: M.capitalHover(c), short: M.workLabel(c.lead.workType).split(/[ (:]/)[0].toLowerCase(),
        sub: c.projectNumbers.join(', '), swatch: `background:var(${M.isBuilding(c.lead) ? '--cons-build' : '--cons-plan'})`,
        open: () => openCapital(c.key), highlight: on => (on ? highlight(c.records.map(x => x.geometry)) : clearHl()),
      });
    }
    return [...best.values()];
  }
  function eaHits(ctx) {
    if (!ce.ea || !data.eas) return [];
    const out = [];
    for (const e of shownEAs()) {
      const d = M.hitDistance(ctx.point, e.geometry, ctx.toPx); if (d > ctx.tol) continue;
      const inside = d === 0 && /Polygon/.test(e.geometry.type);
      out.push({ kind: inside ? 'area' : 'ea', key: `ea:${e.id}`, d, label: inside ? `EA study area: ${e.name}` : M.eaHover(e), short: 'EA', sub: M.EA_STATUS[e.status], swatch: 'background:var(--ea-line)', open: () => openEA(e.id), highlight: on => (on ? highlight([e.geometry]) : clearHl()) });
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
        const d = M.hitDistance(ctx.point, { type: 'LineString', coordinates: ln.g }, ctx.toPx); if (d > ctx.tol) continue;
        out.push({ kind: 'dc', key: `dc:${sys}:${ln.c || ln.p}`, d, label: `Planned DC ${sys === 'water' ? 'watermain' : 'sewer'}${ln.d ? ` ${ln.d} mm` : ''}${ln.y ? ` · ${ln.y}` : ''}`, short: 'planned DC', sub: ln.p ? `Project ${ln.p}` : '', swatch: `background:var(${(DI().DC_KIND[ln.k] || [])[1] || '--dc-ww-main'})`, open: () => MP().showDcLine(ln), highlight: hon => (hon ? highlight([{ type: 'LineString', coordinates: ln.g }]) : clearHl()) });
      }
      for (const f of dc[sys].facilities) {
        if (!f.g) continue;
        const d = M.hitDistance(ctx.point, { type: 'Point', coordinates: f.g }, ctx.toPx); if (d > ctx.tol + 6) continue;
        out.push({ kind: 'facility', key: `dcf:${sys}:${f.name}`, d, label: f.name, short: 'facility', sub: (DI().DC_FAC[f.kind] || f.kind), swatch: 'background:var(--dc-ww-force)', open: () => DI().showFacility(f), highlight: hon => (hon ? highlight([{ type: 'Point', coordinates: f.g }]) : clearHl()) });
      }
    }
    return out;
  }
  if (PK()) { PK().register({ id: 'construction', hits: consHits }); PK().register({ id: 'ea', hits: eaHits }); PK().register({ id: 'dc', hits: dcHits }); }

  // ---- Layers panel ------------------------------------------------------------------------------------------
  function syncControls() {
    const set = (sel, v) => { const el = document.querySelector(sel); if (el) el.checked = v; };
    set('#opt-cons', ce.cons); set('#opt-eas', ce.ea);
    for (const k of Object.keys(SYS_DEFAULT)) { set(`[data-ce-cons="${k}"]`, ce.consSys[k]); set(`[data-ce-easys="${k}"]`, ce.eaSys[k]); }
    document.querySelectorAll('[data-ce-show]').forEach(b => { b.checked = b.value === ce.show; });
    const cl = document.querySelector('#opt-cons'); if (cl) { const lab = cl.closest('label'); if (lab) lab.hidden = data.loaded && !data.capital; }
    const el = document.querySelector('#opt-eas'); if (el) { const lab = el.closest('label'); if (lab) lab.hidden = data.loaded && !data.eas; }
    const n = document.querySelector('#ce-note');
    if (n) n.textContent = data.loaded && !data.capital ? 'Construction: capital projects are not published yet.' : '';
  }
  function setOn(ch) {
    Object.assign(ce, ch); save(); render(); syncControls(); if (MA()) MA().renderLegend();
  }
  if (typeof document !== 'undefined') document.addEventListener('change', e => {
    const t = e.target;
    if (t.id === 'opt-cons') setOn({ cons: t.checked });
    else if (t.id === 'opt-eas') setOn({ ea: t.checked });
    else if (t.dataset && t.dataset.ceCons) setOn({ cons: true, consSys: { ...ce.consSys, [t.dataset.ceCons]: t.checked } });
    else if (t.dataset && t.dataset.ceEasys) setOn({ ea: true, eaSys: { ...ce.eaSys, [t.dataset.ceEasys]: t.checked } });
    else if (t.dataset && t.dataset.ceShow && t.checked) setOn({ ea: true, show: t.value });
  });

  /** Layers panel: the More settings section (switches are in the main list, map-markers.js). */
  function settingsHTML() {
    const chip = (attr, on, body) => `<label class="mo-chip"><input type="checkbox" ${attr}${on ? ' checked' : ''}><span>${body}</span></label>`;
    const sysChips = (attr, cur) => [['water', 'Water'], ['wastewater', 'Wastewater'], ['roads', 'Roads']].map(([k, t]) => chip(`${attr}="${k}"`, cur[k], t)).join('');
    return `<div class="mo-sec" data-info="construction-eas"><div class="mo-h">Construction and EAs</div>
      <div class="mo-row"><span class="mo-k">Construction</span><div class="mo-chips">${sysChips('data-ce-cons', ce.consSys)}</div></div>
      <div class="mo-row"><span class="mo-k">EAs</span><div class="mo-chips" role="radiogroup" aria-label="Which EAs">${[['current', 'Current'], ['completed', 'Completed'], ['all', 'All']].map(([k, t]) => `<label class="mo-chip"><input type="radio" name="ce-show" data-ce-show="1" value="${k}"${ce.show === k ? ' checked' : ''}><span>${t}</span></label>`).join('')}</div></div>
      <div class="mo-row"><span class="mo-k"></span><div class="mo-chips">${sysChips('data-ce-easys', ce.eaSys)}</div></div>
      <small id="ce-note"></small></div>`;
  }

  /** Legend section (js/map-analysis.js renderLegend). */
  function legendHTML() {
    const parts = [];
    if (ce.cons && data.capital) parts.push(`<div class="lg-t">Capital projects (Region layer, as of ${esc(M.fmtDate(data.capital.source && data.capital.source.latestLastUpdate))})</div><ul><li><span class="lg-line" style="background:var(--cons-build)"></span>Under construction, awarded or tendered</li><li><span class="lg-line dot" style="--c:var(--cons-plan)"></span>Planned</li>${yr() != null ? `<li class="muted">faded: not in service by ${yr()}</li>` : ''}<li class="muted">"% built" labels from street zoom</li></ul>`);
    if (ce.ea && data.eas) parts.push(`<div class="lg-t">Environmental assessments (${esc({ current: 'current', completed: 'completed', all: 'all' }[ce.show])})</div><ul><li><span class="lg-area" style="--c:var(--ea-line)"></span>Study area, route or site</li><li><span class="lg-line dash" style="background:var(--ea-line)"></span>dashed: approximate or traced</li>${unplacedEAs().length ? `<li class="muted">${unplacedEAs().length} with no mapped location yet (listed in the Capital tab)</li>` : ''}</ul>`);
    return parts.join('');
  }

  // Startup: the Layers control is already on the map (map-markers.js), so fill its section, then load.
  if (typeof document !== 'undefined') {
    const slot = document.querySelector('#ce-settings'); if (slot) slot.outerHTML = settingsHTML();
    syncControls();
    load();
  }

  const api = { load, setData, render, renderLabels, openEA, openCapital, settingsHTML, legendHTML, syncControls, getState: () => ce, data };
  root.PeelCapitalEA = api;
})(typeof window !== 'undefined' ? window : globalThis);
