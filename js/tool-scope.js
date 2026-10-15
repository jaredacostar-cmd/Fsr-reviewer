/* Phase-3b tool result scope — toolResult, "what loads this" (showLoads),
 * Phase 6 extraction from js/app.js (app.js 6160-6366).
 * upstream trace display, in-view filter, print.
 */
(function (root) {
  'use strict';

  const D = window.PeelDemand;
  const { $, esc, fmtNum, fmt1, roundPop, unit, uML, uLs, estTag, UNOFFICIAL, dot, store } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const ST = () => window.PeelSewerTrace;
  const SC = () => window.PeelSewerCap;
  const MA = () => window.PeelMapAnalysis;
  const SD = () => window.PeelSvcData;
  const MP = () => window.PeelMasterPlan;
  const DI = () => window.PeelDcInfra;
  const SvcTab = () => window.PeelSvcTab;
  const DN = () => window.PeelDevNav;
  const Rep = () => window.PeelReports;
  const FUI = () => window.PeelFilterUI;
  const Sh = () => window.PeelShare;
  const SP = () => window.PeelSvcPlants;
  const EP = () => window.PeelExistPipes;

  let loadsOf = null;
  // ---- Phase 3b: pop-up results as a Tool result scope ----------------------------------
  // Feature taps (catchment / zone / plant / pipe / DC line / facility) open their
  // result as a scope in the right panel (SPEC §3; trail: Peel › title) via
  // PeelTools.openResult → PeelSvcScope.openResult. Each show* builds {title, html}.
  let toolScope = null; // {kind, title} of the result currently shown in the Tool tab
  // Exports read the result scope's host while it holds a result.
  const toolScopeBody = () => (toolScope && typeof window !== 'undefined' && window.PeelTools && window.PeelTools.hasResult()) ? $('#scope-body') : null;
  // Feature results open as scopes in the right panel (SPEC §3): opts.ref names the scope
  // (dcwork:<sys>:<id>, pipe:<i>, …); the developments it lists filter the left panel and the map.
  function toolResult(kind, title, html, reopen, opts = {}) {
    toolScope = { kind, title };
    window.PeelTools.openResult({ title, html, reopen, filter: true, ...opts });
    return true;
  }
  // Pop-up action row shared by the feature result views. Buttons carry data-pt
  // and are handled by the #scope-body delegation below.
  const ptActions = btns => btns.length ? `<div class="pt-actions" role="group" aria-label="Actions">${btns.join('')}</div>` : '';
  const ptBtn = (act, v, label, title, extra = '') => `<button type="button" class="btn small" data-pt="${act}"${v != null ? ` data-pt-v="${esc(v)}"` : ''}${extra} title="${esc(title)}">${esc(label)}</button>`;
  // The "Area report" action reports on the developments of the most recent
  // "What loads this?" view; the "What loads this?" action on a local sewer
  // re-runs with the stashed geometry.
  let lastLoads = null, existSewerOf = null;
  // Phase 3b: "Show upstream" — the catchments draining through this one, as a
  // tool result; the map highlights them through focusSvc (it already shades the
  // upstream areas and draws their flow path to the plant).
  function showUpstream(id) {
    if (!App().state.servicing || !App().state.svcModel) return;
    const a = id && SD().svcById.get(id);
    if (!a || a.zone) return;
    const M = App().state.svcModel;
    const up = SvcTab().upstreamOf(id, SvcTab().svcFlowTree());
    const rows = up.map(u => { const l = M.cum.get(u.id); return { u, flow: l ? M.adwf(l) : null }; })
      .sort((x, y) => (y.flow || 0) - (x.flow || 0));
    const html = `
      <div class="head"><h3>Upstream of ${esc(SD().drName(a))}</h3><div class="m">${up.length ? `${fmtNum(up.length)} catchment${up.length === 1 ? '' : 's'} drain${up.length === 1 ? 's' : ''} through it` : 'Nothing drains through it: a head-of-system catchment'} · average dry weather at build-out (design)</div></div>
      ${up.length ? `<table class="dt"><caption>Tap a catchment for what loads it</caption><thead><tr><th>Catchment</th><th class="n">Build-out avg dry</th></tr></thead>
        <tbody>${rows.map(r => `<tr class="pt-svc" data-pt="svc" data-pt-v="${esc(r.u.id)}" tabindex="0"><td>${esc(SD().drName(r.u))}</td><td class="n">${r.flow != null ? `${fmt1(r.flow)} ML/d` : '–'}</td></tr>`).join('')}</tbody></table>` : ''}
      <p class="small muted">The map shades the upstream catchments and draws their flow path to ${esc(SD().plantLabel(a.plant))}.</p>`;
    ST().focusSvc(id, { zoom: true, loads: false, keep: true });
    toolResult('upstream', `Upstream of ${SD().drName(a)}`, html, () => showUpstream(id));
  }
  // Pop-up actions (Phase 3b): what each data-pt button does.
  function toolAction(act, v, el) {
    if (act === 'loads') return showLoads(v || null, el && el.dataset.ptP ? el.dataset.ptP : null);
    if (act === 'ploads') return SC().showPipeLoads(+v);
    if (act === 'eloads' && existSewerOf) return EP().existSewerLoads(existSewerOf.lines, existSewerOf.a);
    if (act === 'upstream') return showUpstream(v);
    if (act === 'areareport' && lastLoads) return Rep().areaReport(lastLoads.devs, `Area report – ${lastLoads.title}`, lastLoads.rings);
    if (act === 'upgrade' && typeof window !== 'undefined' && window.PeelToolUpgrade) return window.PeelToolUpgrade.open(+v);
    if (act === 'svc') return showLoads(v, null);
  }
  function showLoads(id, plantName) {
    if (!App().state.servicing || !App().state.svcModel) return;
    // Design audit, Group 5: a plant, station, block or zone is a level, not a tool — it opens as a
    // servicing scope (its own Overview and trail steps). The tool result below stays as the fallback.
    if (window.PeelSvcScope && window.PeelSvcScope.open(plantName ? `plant:${plantName}` : id)) return;
    const M = App().state.svcModel, a = id && SD().svcById.get(id), c = App().state.criteria;
    // A pumping station beside the blocks: what passes through the pipe arriving at it.
    if (a && a.kind === 'ps' && App().state.servicing.blocks) { const k = MA().stationPipe(a); if (k >= 0) { if (ST().svcFocus.id !== id) ST().focusSvc(id, { zoom: false, loads: false }); SC().showPipeLoads(k); } return; }
    loadsOf = { id, plantName };
    let ids, title, sub = '', key = 'dr';
    if (plantName) {
      ids = new Set(App().state.servicing.drainage.filter(d => d.plant === plantName).map(d => d.id));
      title = SD().plantLabel(plantName); sub = `${fmtNum(ids.size)} ${App().state.servicing.blocks ? 'blocks' : 'catchments'}`;
      const k = window.PeelCapacity && window.PeelCapacity.of(`plant:${plantName}`);
      if (k) sub += ` · rated ${fmt1(k.rated)} ML/d · existing + built + committed ${window.PeelCapacity.pctTxt(k.pctCommitted)} · uncommitted reserve ${fmt1(k.reserve)} ML/d`;
      const ce = SP().plantComplianceNote(plantName);   // Phase 4: effluent exceedances live here now
      if (ce) sub += ` · ${ce}`;
    } else if (a && a.zone) {
      key = 'pz'; ids = new Set([a.id]); title = a.name;
      const l = M.zones.get(a.id); if (l) sub = `max day ${fmt1(M.wMax(l.census, 0))} ML/d at the census → ${fmt1(M.wMax(M.total(l), M.jobs(l)))} ML/d at build-out`;
    } else if (a) {
      const up = SvcTab().upstreamOf(a.id, SvcTab().svcFlowTree());
      ids = new Set([a.id, ...up.map(u => u.id)]); title = SD().drName(a);
      const l = M.cum.get(a.id), ps = MA().psLoad(a);
      const unitW = a.kind === 'block' ? 'block' : 'catchment';
      sub = `${up.length ? `with ${fmtNum(up.length)} upstream ${unitW}${up.length === 1 ? '' : 's'} · ` : ''}${l ? `${fmt1(M.adwf(MA().censusOnly(l)))} ML/d at the census → ${fmt1(M.adwf(l))} ML/d at build-out (average dry, design)` : ''}${ps ? ` · pumping station ${Math.round(ps.pct)}% of firm ${fmtNum(ps.firm)} L/s at build-out peak wet` : ''}`;
    } else return;
    const rows = [];
    for (const p of App().state.projects) {
      const lay = MM().svcLayerOf(p);
      if (lay === 'out' || lay === 'existing') continue;
      const inIds = SD().svcIds(p, key).filter(x => ids.has(x));
      if (!inIds.length) continue;
      const e = D.estimate([p], c, 'all', App().jobsOf);
      if (!(e.totalUnits > 0 || e.employment.jobs > 0)) continue;
      const cb = e.combined;
      rows.push({ p, lay, e, avg: key === 'pz' ? cb.water.avg : cb.wastewater.avg, peak: key === 'pz' ? cb.water.maxDay : cb.wastewater.wetPeak, via: SD().svcById.get(inIds[0]), near: !!SD().nearOf(p, key) });
    }
    rows.sort((x, y) => y.peak - x.peak);
    // Phase 3b pop-up actions: re-run, area report, and (catchments) the upstream list.
    const acts = [ptBtn('loads', plantName ? null : id, 'What loads this?', 'Re-run this analysis (picks up scenario changes)', plantName ? ` data-pt-p="${esc(plantName)}"` : '')];
    if (!plantName && a && !a.zone) acts.push(ptBtn('upstream', id, 'Show upstream', 'List the catchments draining through this one'));
    acts.push(ptBtn('areareport', null, 'Area report', 'A printable report on the developments loading this area'));
    const totAvg = rows.reduce((t, r) => t + r.avg, 0);
    const totPj = rows.reduce((t, r) => t + r.e.population + r.e.employment.jobs, 0);
    const byLayer = ['built', 'approved', 'proposed'].map(k => [k, rows.filter(r => r.lay === k).reduce((t, r) => t + r.avg, 0)]);
    const LIMIT = 60;
    const what = key === 'pz' ? ['Average day', 'Max day'] : ['Average dry', 'Peak wet'];
    const html = `
      <div class="head"><h3>What loads ${esc(title)}</h3><div class="m">${key === 'pz' ? 'Water pressure zone' : plantName ? 'Wastewater treatment plant' : `${a.kind === 'block' ? 'Wastewater block' : 'Sanitary catchment'} and everything upstream`}</div></div>
      ${ptActions(acts)}
      <p class="small">${esc(sub)}${plantName ? ` ${estTag}` : ''}</p>
      <div class="chips">${byLayer.map(([k, v]) => `<span class="chip"><span class="lg-sw" style="--mk:${MM().layerColors()[k]}"></span>${esc(MM().LAYER_NAME[k])} ${uLs(v)}</span>`).join('')}<span class="chip">Growth total, ${key === 'pz' ? 'average day' : 'average dry weather (design)'} ${uLs(totAvg)} · ${uML(D.toMLd(totAvg))}</span></div>

      <table class="dt loads-table"><caption>${fmtNum(rows.length)} developments adding flow since the census, largest ${key === 'pz' ? 'max day' : 'peak wet weather'} first · Peel design criteria, each development alone</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>${what[0]}</th><th>${what[1]}</th><th class="ld-share" title="Share of all the growth loading it, by people + jobs (not of capacity or reserve)">Share of growth (people + jobs)</th></tr></thead>
        <tbody>${rows.slice(0, LIMIT).map(r => `<tr class="ld-row" data-dev="${esc(r.p.key)}" tabindex="0"><td>${dot(r.p.phase)} ${esc(r.p.title)}<small><span class="lg-sw" style="--mk:${MM().layerColors()[r.lay]}"></span>${esc(MM().LAYER_NAME[r.lay])} · ${esc(r.p.municipality)}${r.via && !a?.zone && r.via.id !== id ? ` · via ${esc(SD().drName(r.via).replace(/^[^·]+· /, ''))}` : ''}${r.near ? ' · nearest assigned' : ''}</small></td>
          <td>${fmtNum(roundPop(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.avg)}</td><td>${uLs(r.peak)}</td><td class="ld-share">${totPj > 0 ? `${Math.round((r.e.population + r.e.employment.jobs) / totPj * 100)}%` : '–'}</td></tr>`).join('')}</tbody></table>
      ${rows.length > LIMIT ? `<p class="small muted">+ ${fmtNum(rows.length - LIMIT)} smaller developments (Excel export has the top ${LIMIT}).</p>` : ''}
      ${DI().dcAreaWorksHTML(ids, key, plantName)}
      <p class="small muted">Developments built since the census, approved and proposed (existing development is in the census flow). Flows are each development's own at Peel design criteria; peaks are not additive. ${esc(SvcTab().scenarioText())}.</p>`;
    lastLoads = { devs: rows.map(r => r.p), title, rings: a && a.rings ? a.rings : [] };
    toolResult('loads', `What loads ${title}`, html, () => showLoads(id, plantName));
    Sh().viewLink.write();
    if (id && ST().svcFocus.id !== id) ST().focusSvc(id, { zoom: false, loads: false });
  }
  // The result scope's delegation (right panel): pop-up actions, development rows, pipe links and DC
  // links.
  const toolBody = $('#scope-body');
  if (toolBody) {
    toolBody.addEventListener('click', e => {
      const pa = e.target.closest('[data-pt]');
      if (pa) { toolAction(pa.dataset.pt, pa.dataset.ptV, pa); return; }
      const r = e.target.closest('.ld-row');
      if (r) { const p = DN().projectByKey(r.dataset.dev); if (p) { if (loadsOf) DN().setBackToLoads({ ...loadsOf }); DN().showDetail(p); if (p.lat != null) map.setView([p.lat, p.lng], Math.max(map.getZoom(), 15)); } return; }
      const pb = e.target.closest('[data-pipe]');
      if (pb && MM().SEW.data) { const i = +pb.dataset.pipe; SC().showPipeLoads(i); const c = MM().SEW.data.pipes[i][10]; map.setView([c[1], c[0]], Math.max(map.getZoom(), 15)); return; }
      const f = e.target.closest('[data-dcn-filter]');
      if (f) { MP().dcnFilter = f.dataset.dcnFilter; return MP().showDcTiming(); }
      if (e.target.closest('[data-dcn-all]')) { SC().loadSewers(); return MP().showDcTiming(); }
      const cn = e.target.closest('[data-dcn-cons]');
      if (cn && MP().DCN.reg && MP().DCN.reg.get(cn.dataset.dcnCons)) return MP().showConsDevs(MP().DCN.reg.get(cn.dataset.dcnCons));
      const rl = e.target.closest('[data-dcn-relief]');
      if (rl) {
        const [cid, k] = rl.dataset.dcnRelief.split('|'), c = MP().DCN.reg && MP().DCN.reg.get(cid), r2 = c && c.relief[+k];
        if (r2 && r2.ln) { MP().showDcLine(r2.ln); map.fitBounds(L.latLngBounds(r2.ln.g.map(([x, y]) => [y, x])), { maxZoom: 15, padding: [30, 30] }); if (!MM().getDcOn().on) MA().setDcOn({ on: true, sys: 'both' }); }
        else if (r2 && r2.fc) { DI().showFacility(r2.fc); if (r2.fc.g) map.setView([r2.fc.g[1], r2.fc.g[0]], Math.max(map.getZoom(), 14)); }
      }
    });
    toolBody.addEventListener('keydown', e => { const r = e.target.closest('.ld-row, .pt-svc'); if (r && e.key === 'Enter') r.click(); });
  }

  // Linked map and tables: hovering a zone / catchment row outlines it on the map; hovering an
  // area on the map highlights its row. "Only areas in map view" limits the rows to the view.
  const hoverLayer = L.layerGroup().addTo(map);
  function hoverArea(id) {
    hoverLayer.clearLayers();
    const a = id && SD().svcById.get(id); if (!a) return;
    L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), { className: 'svc-hover', interactive: false }).addTo(hoverLayer);
  }
  const hoverRow = (id, on) => document.querySelectorAll(`.svc-row[data-svc="${CSS.escape(id)}"]`).forEach(r => r.classList.toggle('hl', on));
  for (const id of ['#water-body', '#ww-body']) {
    $(id).addEventListener('mouseover', e => { const r = e.target.closest('.svc-row'); if (r) hoverArea(r.dataset.svc); });
    $(id).addEventListener('mouseleave', () => hoverArea(null));
  }
  // Polygons on the map (overlays and capacity layer) report hover through their layer's id.
  map.on('layeradd', e => {
    const l = e.layer; if (!(l instanceof L.Polygon) || l._svcHover) return;
    const a = l.options.svcId && SD().svcById.get(l.options.svcId); if (!a) return;
    l._svcHover = true;
    l.on('mouseover', () => hoverRow(a.id, true)).on('mouseout', () => hoverRow(a.id, false));
  });
  const inViewBox = () => `<label class="chk small inview" title="Show only the zones / catchments in the current map view"><input type="checkbox" data-inview="1"${store.get('svcInView', false) ? ' checked' : ''}> Only areas in map view</label>`;
  function filterInView() {
    const on = store.get('svcInView', false), b = map.getBounds();
    document.querySelectorAll('#water-body .svc-row, #ww-body .svc-row').forEach(r => {
      const a = SD().svcById.get(r.dataset.svc);
      r.hidden = !!(on && a && a.bbox && !b.intersects([[a.bbox[1], a.bbox[0]], [a.bbox[3], a.bbox[2]]]));
    });
  }
  map.on('moveend', () => { if (store.get('svcInView', false)) filterInView(); });

  // Map print: the map full page (landscape) with a title block, the scenario, legend, north
  // arrow and scale; the rest of the page is hidden while printing.
  function printMap() {
    const head = document.createElement('div');
    head.className = 'print-head';
    const filt = FUI().activeFilters().map(f => f.label).join(', ');
    head.innerHTML = `<strong>Peel Growth Pipeline (unofficial) — ${esc(({ water: 'water servicing map', wastewater: 'wastewater servicing map', dc: 'development charges map' })[MA().currentView()] || 'development map')}</strong>
      <span>${fmtNum(App().state.filtered.length)} developments${filt ? ` · ${esc(filt)}` : ''}</span>
      ${App().state.svcModel ? `<span>Scenario: ${esc(SvcTab().scenarioText())}</span>` : ''}
      <span>${UNOFFICIAL}</span>
      <span>Map style: ${esc(MM().MSTYLE.color[MM().mstyle.color])} colour · ${esc(MM().MSTYLE.size[MM().mstyle.size])}${MM().mstyle.cap !== 'off' ? ` · ${esc(MM().MSTYLE.cap[MM().mstyle.cap])}` : ''} · prepared ${new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' })}</span>`;
    $('.map-wrap').appendChild(head);
    // The legend lives in the Layers panel (hidden when printing): print a copy in the title block.
    const lgBox = document.getElementById('mo-legend'), lgd = lgBox && lgBox.querySelector('details');
    let lgClone = null;
    if (lgd && !lgBox.hidden) { lgClone = lgd.cloneNode(true); lgClone.open = true; lgClone.classList.add('print-legend'); lgClone.removeAttribute('id'); head.appendChild(lgClone); }
    document.body.classList.add('print-map');
    map.invalidateSize();
    const done = () => { document.body.classList.remove('print-map'); head.remove(); map.invalidateSize(); removeEventListener('afterprint', done); };
    addEventListener('afterprint', done);
    setTimeout(() => window.print(), 1200);
  }

  const api = {
    get loadsOf() { return loadsOf; },
    set loadsOf(v) { loadsOf = v; },
    get toolScope() { return toolScope; },
    get existSewerOf() { return existSewerOf; }, set existSewerOf(v) { existSewerOf = v; },
    set toolScope(v) { toolScope = v; },
    toolResult, showLoads, showUpstream, toolScopeBody, ptActions, ptBtn,
    filterInView, inViewBox, printMap,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelToolScope = api;
})(typeof window !== 'undefined' ? window : globalThis);
