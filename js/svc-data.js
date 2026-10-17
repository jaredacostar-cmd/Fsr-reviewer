/* Servicing data — pressure-zone / drainage-area layer state, lookups,
 * Phase 6 extraction from js/app.js (app.js 490-502, 4166-4436).
 * loadServicing, tagAreas/tagServicing, svc selects, plant colour helpers.
 */
(function (root) {
  'use strict';

  const D = window.PeelDemand;
  const PF = window.PeelFilters || { FLAG_META: [], PHASE_LAYER_MAP: {}, wwLayersFromStages: () => ({ built: false, approved: false, proposed: false }), migrateLegacyFocus: () => ({ flags: [], basis: 'all', minUnits: 0, landuse: 'all', yearPreset: null }), encodeFlagParam: () => '', decodeFlagParam: () => ({}) };
  const { $, esc, fmtNum, estTag, roundPop, uML, uLs, token, store, SCREEN_NOTE, uCap } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const CA = () => window.PeelCensusAreas;
  const ST = () => window.PeelSewerTrace;
  const SC = () => window.PeelSewerCap;
  const MA = () => window.PeelMapAnalysis;
  const RL = () => window.PeelRenderList;
  const TS = () => window.PeelToolScope;
  const DI = () => window.PeelDcInfra;
  const MP = () => window.PeelMasterPlan;
  const PA = () => window.PeelPlanAreas;
  const SvcTab = () => window.PeelSvcTab;
  const SP = () => window.PeelSvcPlants;
  const DD = () => window.PeelDevDetail;
  const SProf = () => window.PeelSewerProfile;
  const Sett = () => window.PeelSettings;
  const Areas = () => window.PeelAreas;
  const DS = () => window.DevScope;
  const AT = () => window.PeelAnalysisTabs;
  const FUI = () => window.PeelFilterUI;
  const WT = () => window.PeelWaterTrace;

  // Pressure-zone / drainage-area layer state (layers are built in the servicing section).
  // Receiving-plant colours, from the --pl-* tokens (theme-aware). plantToken()
  // gives the token name for HTML/SVG `var()`; plantColor() the computed value
  // for Leaflet/canvas.
  const PLANT_TOKEN = { Lakeview: '--pl-booth', Clarkson: '--pl-clarkson', Inglewood: '--pl-inglewood', Toronto: '--pl-toronto' };
  const plantColor = name => token(PLANT_TOKEN[name] || '--nodata');
  // Where an area's sewage is treated: a Peel WRRF, or the City of Toronto (Malton).
  const PLANT_SHORT = { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood', Toronto: 'Toronto' };
  const PLANT_NAME = { Lakeview: 'G.E. Booth WRRF (Lakeview)', Clarkson: 'Clarkson WRRF', Inglewood: 'Inglewood WWTP', Toronto: 'City of Toronto system' };
  const plantLabel = pl => PLANT_NAME[pl] || `${pl} WRRF`;
  // Drainage area names carry the plant ("Lakeview · Bolton PS"); show the plant's report name.
  const drName = a => String(a.name || '').replace(/^Lakeview · /, 'G.E. Booth · ');
  const svcLayers = { pz: null, dr: null };
  // ---- Water pressure zones and wastewater drainage areas (data/servicing.json) -----------
  // Pressure zones are the Region's published polygons; drainage areas are traced from the
  // Region's sanitary sewer network (scripts/build-servicing.js). Both tag every project (by its
  // location point), filter the map, group the demand and show in the project panel.
  const svcById = new Map();
  map.createPane('svcPane', map.getPane('rotatePane') || undefined).style.zIndex = (window.PeelLayerGroups ? window.PeelLayerGroups.Z.svc : 360);
  // Flow paths (development trace, catchment / block routes) draw above the development markers.
  map.createPane('flowPane', map.getPane('rotatePane') || undefined).style.zIndex = (window.PeelLayerGroups ? window.PeelLayerGroups.Z.flow : 640);
  const flowRenderer = L.svg({ pane: 'flowPane', padding: 0.3 });
  const svcRenderer = L.canvas({ pane: 'svcPane', padding: 0.3 });
  const svcSelLayer = L.layerGroup().addTo(map);
  async function loadServicing() {
    try {
      const res = await fetch('data/servicing.json', { cache: 'no-cache' });
      if (!res.ok) return;
      const d = await res.json();
      // Assigned once the blocks are in, so nothing caches census people on the old catchments.
      const sv = { zones: Areas().prepare(d.pressureZones), drainage: Areas().prepare(d.drainageAreas), meta: d };
      // The wastewater catchments are the Region's 40 blocks (data/blocks.json), each with its
      // place in the flow from the sewer network: the block it drains into, down to its plant.
      // The traced pumping-station sewersheds are kept for the stations' firm-capacity checks.
      sv.psAreas = sv.drainage.filter(a => a.kind === 'ps');
      const bj = await ST().loadBlocks();
      if (bj && bj.version >= 2) {
        const areas = bj.blocks.filter(b => b.plant).map(b => ({
          id: `dr:B${b.id}`, block: b.id, name: `Block ${b.id}`, kind: 'block', planning: b.planning, plant: b.plant,
          downstream: b.into ? `dr:B${b.into}` : null, outletAt: b.outletAt, outlet: null, municipality: b.muni,
          manholes: b.pipes, trunkMm: b.trunkMm, blockHa: b.ha, areaHa: b.servedHa ?? b.ha, served: b.served ?? 1, rings: b.parts.map(p => p[0]),
        }));
        sv.drainage = Areas().prepare(areas);
        sv.blocks = true;
      }
      App().state.servicing = sv;
      // Optional: census shares by area overlap and the Region's 2025 annual report figures.
      const opt = async f => { try { const r = await fetch(f, { cache: 'no-cache' }); return r.ok ? r.json() : null; } catch (e) { return null; } };
      let dc;
      [App().state.svcCensus, App().state.reports, dc, App().state.dcCosts, Sett().IDF.data, App().state.housing] = await Promise.all([opt('data/svc-census.json'), opt('data/peel-reports.json'), opt('data/dc-infra.json'), opt('data/dc-costs.json'), opt('data/idf.json'), opt('data/housing.json')]);
      mergePeelHousing(App().state.housing, await opt('data/peel-housing.json'));
      opt('data/compliance.json').then(c => { App().state.compliance = c; if (c && AT().getFootTab() === 'svc') SvcTab().renderSvcTab(); });
      if (Sett().IDF.data) { Sett().applyWet(); const f = $('#wet-box'); if (f) f.outerHTML = Sett().wetBoxHTML(); }
      App().state.dcInfra = DI().prepDc(dc);
      SP().renderRefs();
      for (const a of [...App().state.servicing.zones, ...App().state.servicing.drainage, ...App().state.servicing.psAreas]) svcById.set(a.id, a);
      for (const c of Object.values(App().state.censuses || {})) delete c._svcPop;
      document.querySelectorAll('.ab-svc').forEach(e => { e.hidden = false; });
      tagServicing();
      renderSvcSelects();
      // Blocks are the catchments: one map chip for them (Wastewater blocks), not two.
      if (App().state.servicing.blocks) { const c = $('#lyr-dr'); if (c) c.closest('.mo-sw').hidden = true; { const l = $('#f-dr-label'); if (l) l.textContent = 'Wastewater block'; } Object.assign(MM().AREA_F.dr, { all: 'All wastewater blocks', find: 'Find a block…', one: 'block' }); { const q = $('#f-dr-q'); if (q) q.placeholder = 'Find a block…'; } PA().renderMulti('dr'); if (MM().svcOn.dr) { MM().svcOn.dr = false; MM().svcOn.bk = true; } }
      for (const k of ['pz', 'dr']) if (MM().svcOn[k]) setSvcLayer(k, true);
      if (MM().svcOn.bk) ST().setBlocksLayer(true);
      DI().renderDcLayer(); MA().renderLegend();
      // The model is built once the servicing lookup is filled (renderSvcTab waits for it): build it
      // now, which also replaces one built before the 2025 annual reports arrived.
      SvcTab().renderSvcTab();
      App().applyFilters();
      setTimeout(SC().loadSewers, 1500);
      // Trunk-main checks need the Master Plan tables and the water facilities (the supply routes).
      Promise.all([MP().loadWaterSupply(), MP().loadMpWater(), window.PeelWaterTrace && window.PeelWaterTrace.loadWaterFacilities()]).then(() => { if (typeof DS() !== 'undefined' && DS().current()) DS().refresh(); });
    } catch (e) { console.warn('Servicing data did not load completely:', e); }   // (was silent: a missing element stopped the model, the layers and the sewers)
  }
  // A development's pressure zone and wastewater block. Outside the mapped zones / blocks: the
  // nearest one within NEAR_M of its edge, the area it would most likely connect to (greenfield
  // lands, gaps in the network). A block the sewers barely serve (Block 40, rural Caledon on
  // septic) keeps only the sites near its own sewer; the rest go to the nearest sewered block.
  const lowServed = a => !!a && a.served != null && a.served < 0.5;
  function tagAreas(p) {
    const { zones, drainage } = App().state.servicing;
    p.pz = Areas().locate(zones, p.lng, p.lat);
    p.dr = Areas().locate(drainage, p.lng, p.lat);
    const off = id => { const a = svcById.get(id); return lowServed(a) && !(a.outletAt && p.lat != null && Math.hypot((a.outletAt[0] - p.lng) * 80600, (a.outletAt[1] - p.lat) * 111320) < 1500); };
    if (p.dr.length && off(p.dr[0])) p.dr = [];
    p.pzNear = p.pz.length ? null : DI().dcVia(p, 'pz') || Areas().nearest(zones, p.lng, p.lat, NEAR_M);
    const via = p.dr.length ? null : DI().dcVia(p, 'dr');
    p.drNear = p.dr.length ? null : (via && !lowServed(svcById.get(via.id)) ? via : null) || Areas().nearest(drainage.filter(a => !lowServed(a)), p.lng, p.lat, NEAR_M);
  }
  function tagServicing() {
    if (!App().state.servicing) return;
    for (const p of App().state.projects) tagAreas(p);
    App().state.whatifs = SProf().getWhatIfs().filter(w => w.include).map(SProf().whatIfProject);
  }
  const NEAR_M = 5000;
  // The development's pressure zone / drainage area ids: mapped, else (switch on) the nearest.
  const svcIds = (p, key) => (p[key] && p[key].length) ? p[key] : SvcTab().svcOpt.nr === 'on' && p[`${key}Near`] ? [p[`${key}Near`].id] : [];
  const nearOf = (p, key) => !(p[key] && p[key].length) && SvcTab().svcOpt.nr === 'on' ? p[`${key}Near`] : null;
  // SPEC 1.8: one pressure zone per development, used everywhere (summary, supply route, reservoir
  // check, the flag), with its reason: 'mapped' (inside a zone), 'planned-main' (the zone the planned
  // DC main it would connect to feeds), 'nearest' (the nearest zone). The ground's elevation band is
  // shown beside it as a flag when it fits another zone too (js/water-trace.js), never a second answer.
  const zoneOf = p => window.PeelZoneOf.zoneOf(p, svcById);
  const kmText = m => m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
  // How an outside development was assigned: through the planned main it would connect to, or by distance.
  const nearText = n => n.via ? `via planned ${n.via.y || ''} ${n.via.d ? `${n.via.d} mm ` : ''}main ${n.via.p || ''}, ${kmText(n.m)}`.replace(/\s+/g, ' ') : `nearest, ${kmText(n.m)}`;
  function renderSvcSelects() {
    if (!App().state.servicing) return;
    PA().renderMulti('pz'); PA().renderMulti('dr');
  }
  // Outline the chosen zone / area and zoom to it.
  function showSvcArea(zoom) {
    svcSelLayer.clearLayers();
    let bounds = null;
    for (const id of [...App().state.pz, ...App().state.dr]) {
      const a = svcById.get(id); if (!a) continue;
      const l = L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), { className: 'area-outline', interactive: false }).addTo(svcSelLayer);
      bounds = bounds ? bounds.extend(l.getBounds()) : l.getBounds();
    }
    if (zoom && bounds) map.fitBounds(bounds, { padding: [30, 30] });
  }
  const svcColor = a => a.zone ? token('--svc-drainage') : plantColor(a.plant);
  function svcTooltip(a) {
    const H = window.PeelUtil.hoverCard;
    if (a.zone) return H({ kind: 'Water pressure zone', name: a.name, sub: 'Region of Peel', also: 'what loads it' });
    if (a.kind === 'block') { const to = a.downstream && svcById.get(a.downstream); return H({ kind: `Wastewater block${a.planning ? ' · prioritised (block study)' : ''}`, name: a.name, value: `${fmtNum(a.areaHa)} ha`, sub: `drains to ${to ? `${to.name} → ` : ''}${plantLabel(a.plant)}`, html: `<span class="muted">${fmtNum(a.manholes)} sewers of 300 mm+${a.trunkMm ? ` · outlet ${a.trunkMm} mm` : ''} · Region I&amp;I block</span>`, also: 'what loads it' }); }
    return H({ kind: 'Sanitary catchment', name: drName(a), value: `${fmtNum(a.areaHa)} ha`, sub: `drains to ${plantLabel(a.plant)}${a.outlet ? ` via ${a.outlet}` : ''}`, html: `<span class="muted">${fmtNum(a.manholes)} manholes${a.trunkMm ? ` · outlet ${a.trunkMm} mm` : ''} · traced from the sewer network</span>`, also: 'what loads it' });
  }
  function setDevsOn(on) {
    MM().setDevsOn(on); store.set('devsOn', on);
    map.getContainer().classList.toggle('devs-off', !on);
    RL().renderMarkers(); MM().scheduleSites(); MA().syncMapOpts();
  }
  function setWwLay(k, on) {
    if (k !== 'existing') return;   // the growth layers follow the selected stages (syncWwLayers)
    MM().setWwLay({ ...MM().getWwLay(), [k]: on }); store.set('wwLay', MM().getWwLay());
    RL().renderMarkers(); MM().scheduleSites(); MA().renderCapLayer(); MA().renderLegend(); MA().syncMapOpts();
    // Phase 3b: pipe loads live in the Tool result tab now — re-run while that result is open.
    if (TS().loadsOf && TS().loadsOf.pipe != null && TS().toolScope && TS().toolScope.kind === 'pipe' && typeof window !== 'undefined' && window.PeelTools && window.PeelTools.hasResult() && window.PeelTools.resultTitle() === TS().toolScope.title) SC().showPipeLoads(TS().loadsOf.pipe);
  }
  // Wastewater growth layers from the stage selector; recomputed whenever the filters apply.
  // Keeps the wwLay object shape the rest of the code reads.
  function syncWwLayers() {
    const layers = PF.wwLayersFromStages([...App().state.phases]);
    if (MM().getWwLay().built === layers.built && MM().getWwLay().approved === layers.approved && MM().getWwLay().proposed === layers.proposed) return;
    MM().setWwLay({ existing: MM().getWwLay().existing !== false, ...layers });
    store.set('wwLay', MM().getWwLay());
  }
  // Map panel notice when a setting hides the developments, with one tap to bring them back.
  function devsOffReason() {
    // (a workspace switches them off on purpose: Getting tight, Projects, Old pipes)
    if (!MM().getDevsOn()) return window.PeelWorkspaces && window.PeelWorkspaces.mode() === 'ws' ? '' : 'Developments are switched off';
    if (MM().isWW() && ['built', 'approved', 'proposed'].every(k => MM().getWwLay()[k] === false)) return 'Wastewater loads: no stage selected';
    try { if (ST().getDevMode() === 'hidden' && (ST().TRACE.key || ST().WTRACE.key || ST().svcFocus.id || ST().BLK.id)) return 'Hidden while a path is shown'; } catch (e) { /* during start-up */ }
    return '';
  }
  // The collapsed Map options line: what is on.
  function syncPanelSum() {
    const el = document.getElementById('mo-psum'); if (!el) return;
    const loads = MM().isWW() && !Object.values(MM().getWwLay()).every(v => v !== false) ? `loads: ${[['existing', 'census'], ['built', 'built'], ['approved', 'committed'], ['proposed', 'proposed']].filter(([k]) => MM().getWwLay()[k] !== false).map(([, t]) => t).join(' + ') || 'none'}` : '';
    const on = [MM().getDevsOn() && 'developments', MM().svcOn.bk && 'blocks', MM().svcOn.pz && 'zones', WT().WF.on && 'water facilities', MM().mstyle.cap !== 'off' && 'capacity', Object.values(MM().getExistOn()).some(Boolean) && 'pipes', ...(window.PeelConstraints ? Object.entries(window.PeelConstraints.getOn()).filter(([, v]) => v).map(([k]) => window.PeelConstraints.LAYERS[k].short) : []), MM().getDcOn().on && 'DC works', (MM().areaOn.sp || MM().areaOn.mtsa) && 'planning areas', CA().getDaOn() && 'census areas'].filter(Boolean);
    el.textContent = [on.length ? on.join(', ') : 'none on', loads].filter(Boolean).join(' · ');
    syncAreaOn();
  }
  // An area filter (secondary plan, MTSA, pressure zone, block) narrows every development on the
  // map and in the totals: always named above Map options, with Clear, so it can't be missed.
  function syncAreaOn() {
    const el = document.getElementById('mo-area-on'); if (!el) return;
    let names;
    try { names = Object.keys(MM().AREA_F).map(k => PA().multiSummary(k, true)).filter(Boolean); } catch (e) { return; }   // during start-up
    el.hidden = !names.length;
    if (names.length) el.innerHTML = `<span>Only developments in <strong>${esc(names.join(', '))}</strong></span><button type="button" class="btn small" data-areas-clear="1">Clear</button>`;
  }
  function clearAreaFilters() {
    App().state.sp = []; App().state.mtsa = []; App().state.pz = []; App().state.dr = [];
    PA().renderAreaSelects(); renderSvcSelects(); PA().showArea(); showSvcArea(false); PA().renderPlanAreas(); App().applyFilters();
  }
  function syncDevsOff() {
    const el = document.getElementById('mo-devs-off'); if (!el) return;
    const why = devsOffReason();
    el.hidden = !why;
    if (why) el.innerHTML = `<span>${esc(why)}</span><button type="button" class="btn small" data-devs-show="1">Show developments</button>`;
  }
  function showAllDevs() {
    if (!MM().getDevsOn()) setDevsOn(true);
    // Growth layers follow the stages now: no growth layer on means no stage is selected.
    if (MM().isWW() && ['built', 'approved', 'proposed'].every(k => MM().getWwLay()[k] === false)) App().state.phases = FUI().ALL_PHASE_KEYS();
    if (ST().getDevMode() === 'hidden') { ST().setDevMode('faded'); store.set('devFade', ST().getDevMode()); ST().syncPathMode(); }
    syncDevsOff();
    App().applyFilters(); MM().scheduleSites(); MA().renderCapLayer(); MA().renderLegend(); MA().syncMapOpts();
  }
  // A development shown on the map: developments on, and (Wastewater view) its growth layer on.
  const devShown = p => MM().getDevsOn() && (!MM().isWW() || p.phase === 'cancelled' || MM().wwOn(MM().svcLayerOf(p)));
  function setSvcLayer(k, on) {
    // With the blocks as the catchments there is one wastewater area layer: the blocks (its own
    // switch), so the drainage layer (a view's preset included) turns that on or off.
    if (k === 'dr' && App().state.servicing && App().state.servicing.blocks) {
      MM().svcOn.dr = false; store.set('svc-dr', false); if (svcLayers.dr) map.removeLayer(svcLayers.dr);
      ST().setBlocksLayer(on); MA().syncMapOpts(); return;
    }
    MM().svcOn[k] = on; store.set(`svc-${k}`, on);
    if (!on) { if (svcLayers[k]) map.removeLayer(svcLayers[k]); return; }
    if (!App().state.servicing) return;
    if (!svcLayers[k]) {
      const list = k === 'pz' ? App().state.servicing.zones : App().state.servicing.drainage;
      svcLayers[k] = L.featureGroup(list.map(a => L.polygon(a.rings.map(r => r.map(([x, y]) => [y, x])), {
        renderer: svcRenderer, pane: 'svcPane', svcId: a.id, color: svcColor(a), weight: k === 'pz' ? 1.6 : 1.3, opacity: 0.85,
        dashArray: k === 'pz' ? '6 4' : null, fill: true, fillColor: svcColor(a), fillOpacity: k === 'pz' ? 0.03 : 0.07,
      }).bindTooltip(svcTooltip(a), { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); TS().showLoads(a.id); })));
    }
    svcLayers[k].addTo(map);
  }
  // Master plan pumping station for a traced drainage area (by name): firm capacity in L/s.
  const spsKey = n => String(n || '').toLowerCase().replace(/^[^·]+·\s*/, '').replace(/\s+ps$/, '').replace(/'/g, '').replace(/ memorial park/, '').replace(/ (drive|avenue|road|trail|parkway|crescent|court|mews)$/, '').trim();
  function spsOf(a) {
    const mp = App().state.reports && App().state.reports.masterPlan; if (!mp || !a || a.kind !== 'ps') return null;
    const k = spsKey(a.name); return mp.sps.find(x => x.key === k) || null;
  }
  const spsNote = sp => { const n = App().state.reports.masterPlan.spsNotes || {}; const k = Object.keys(n).find(x => sp.key.startsWith(x)); return k ? n[k] : ''; };
  // Servicing check for one development (development panel): its own flows at Peel design
  // criteria (FSR basis), its pressure zone, the sewer path from its catchment down to the plant
  // with its share of the flow at each outlet, and what it means for the plant's uncommitted
  // reserve capacity.
  // Servicing facts for one development (brief, header flags and the check): flows at design
  // criteria, pressure zone, sewer path to the plant with pumping stations, plant reserve.
  // An area plan (precinct / block plan) with its draft plans: its servicing is the whole area's,
  // its own remaining units plus each draft plan's (a view; each counts once in the totals).
  const areaMembers = p => p.areaPlan && p.areaPlan.keys ? [p, ...p.areaPlan.keys.map(k => App().state.projects.find(x => x.key === k)).filter(q => q && q !== p)] : [p];
  function svcFacts(p) {
    const M = App().state.svcModel;
    if (!App().state.servicing || !M) return null;
    const e = D.estimate(areaMembers(p), App().state.criteria, 'all', App().jobsOf), cb = e.combined;
    if (!(e.totalUnits > 0 || e.employment.jobs > 0)) return null;
    // The same layer as the Water / Wastewater tables and the map (completed before the census = existing).
    const layer = ({ existing: 'existing', built: 'built', approved: 'approved', proposed: 'proposed' })[MM().svcLayerOf(p)] || null;
    const zo = zoneOf(p), z = zo ? zo.z : null;   // (one zone everywhere, SPEC 1.8)
    const zl = z && svcIds(p, 'pz').includes(z.id) ? M.zones.get(z.id) : null;   // its load counts in the zone when mapped or "nearest" is on
    const zMax = zl ? M.wMax(M.total(zl), M.jobs(zl)) : 0;
    let d = svcIds(p, 'dr').map(id => svcById.get(id)).filter(Boolean)[0];
    const path = []; const seen = new Set();
    while (d && !seen.has(d.id)) { seen.add(d.id); path.push(d); d = d.downstream ? svcById.get(d.downstream) : null; }
    // Pumping stations on the path: build-out peak dry and ≈ peak wet (design flows) vs firm capacity.
    // (With blocks as the catchments: the stations on the development's own pipe route.)
    let onPath = path.filter(a => spsOf(a));
    if (App().state.servicing.blocks && MM().SEW.data && p.lat != null) {
      const G = SC().sewerGrowth(), k0 = G.devPipe.get(p) ?? SC().nearestPipe(p.lng, p.lat), route = k0 >= 0 ? new Set(ST().pipeRoute(k0)) : new Set();
      onPath = (App().state.servicing.psAreas || []).filter(a => spsOf(a) && route.has(MA().stationPipe(a)));
    }
    const sps = onPath.map(a => {
      const l = MA().psLoads(a);
      return { a, firm: spsOf(a).firmLs, dry: l ? M.pdwf(l, 1) * 1e6 / 86400 : 0, wet: l ? (M.pdwf(l, 1) + M.ii(l)) * 1e6 / 86400 : 0 };
    });
    const pl = path.length ? path[path.length - 1].plant : null, cap = pl && M.plantCap(pl);
    const devAvg = D.toMLd(cb.wastewater.avg);
    // The plant from the one capacity function (js/capacity.js, SPEC 1.4); the site's use of its
    // reserve says its basis (SPEC 1.5): the development's flow at the plant's measured rate
    // (calibrated) or at Peel design criteria.
    const k = pl && window.PeelCapacity ? window.PeelCapacity.of(`plant:${pl}`) : null;
    const useNote = cap ? (M.mode === 'calibrated' && cap.f !== 1 ? `its flow scaled to the plant's measured 2025 rate (×${cap.f.toFixed(2)} the design flow)` : 'flow at Peel design criteria') : '';
    return { M, e, cb, layer, z, zone: zo, zNear: zo && zo.reason !== 'mapped' ? p.pzNear : null, dNear: nearOf(p, 'dr'), zl, zMax, path, sps, pl, cap, devAvg, reserve: k ? k.reserve : cap ? cap.rated - cap.committed : 0, use: cap ? devAvg * cap.f : 0, useNote };
  }
  // Servicing check (inside the Servicing section): the development's flows at Peel design
  // criteria (FSR basis), its pressure zone, the sewer path from its catchment down to the plant
  // with its share of the flow at each outlet, and what it means for the plant's uncommitted
  // reserve capacity.
  function servicingCheckHTML(p, F, opt = {}) {
    const { M, e, cb, layer, z, zl, zMax, path, pl, cap, devAvg } = F;
    const mld = D.toMLd, ls = uLs, pct = DD().pctOf;
    const layerText = { existing: 'existing — built before the census, in the census flow', built: 'built since the census — part of today\u2019s flow', approved: 'committed (D-5-1) — already counted against capacity', proposed: 'proposed — not yet committed; it would draw on the reserve' }[layer] || 'withdrawn — not counted';
    const water = `<tr><td>Water · ${z ? esc(z.name.replace('Pressure zone ', 'Zone ')) : 'no pressure zone'}${F.zNear ? `<small>${esc(nearText(F.zNear))}</small>` : ''}</td><td>${ls(cb.water.avg)}<small>${uML(mld(cb.water.avg))}</small></td><td>${ls(cb.water.maxDay)}<small>${uML(mld(cb.water.maxDay))}</small></td><td>${ls(cb.water.peakHour)}</td><td>${zl ? `${pct(mld(cb.water.maxDay), zMax)} of the zone's build-out max day (${uML(zMax)}) ${estTag}` : ''}</td></tr>`;
    const sewer = `<tr><td>Wastewater</td><td>${ls(cb.wastewater.avg)}<small>${uML(mld(cb.wastewater.avg))}</small></td><td>${ls(cb.wastewater.peak)}<small>peak dry</small></td><td>${ls(cb.wastewater.wetPeak)}<small>peak wet</small></td><td></td></tr>`;
    const pathRows = path.map((a, i) => {
      const l = M.cum.get(a.id), f = M.fOf(a.plant), out = l ? M.adwf(l, f) : 0;
      return `<tr><td>${i ? '↳ ' : F.dNear ? `<span class="est">${esc(nearText(F.dNear))}</span> ` : ''}${a.kind === 'plant' ? `${esc(plantLabel(a.plant))} inflow` : esc(drName(a).replace(/^[^·]+· /, ''))}<small>${a.kind === 'ps' ? (spsOf(a) ? ((dry, wet) => `pumping station — firm ${fmtNum(spsOf(a).firmLs)} L/s; build-out peak dry ${fmtNum(Math.round(dry))} L/s (${Math.round(dry / spsOf(a).firmLs * 100)}%), peak wet ≈${fmtNum(Math.round(wet))} L/s (${Math.round(wet / spsOf(a).firmLs * 100)}%)`)(l ? M.pdwf(l, 1) * 1e6 / 86400 : 0, l ? (M.pdwf(l, 1) + M.ii(l)) * 1e6 / 86400 : 0) : 'pumping station — capacity not in the master plan table') : a.kind === 'trunk' ? `trunk${a.trunkMm ? ` ${a.trunkMm} mm` : ''} outlet` : a.kind === 'plant' ? 'reaches the plant' : a.kind === 'block' ? `wastewater block · ${a.trunkMm ? `${a.trunkMm} mm ` : ''}outlet → ${esc(a.downstream ? (svcById.get(a.downstream) || {}).name || '' : plantLabel(a.plant))}` : 'City of Toronto system'}</small></td><td>${uML(out)}</td><td>${pct(devAvg * f, out)}</td></tr>`;
    }).join('');
    let plant = '';
    if (cap) {
      const reserve = cap.rated - cap.committed, use = devAvg * cap.f;
      plant = `<p class="small svc-verdict"><strong>${esc(cap.name)}</strong>: rated ${uCap(cap.rated, cap.rated)}; existing + built + committed ${pct(cap.committed, cap.rated)} (${uCap(cap.committed, cap.rated)}); <strong>${window.PeelUtil.reserveWords(reserve, cap.rated)}</strong>${M.mode === 'calibrated' ? ' (capacity check)' : ' (design flows)'}.
        This development is <strong>${layerText}</strong>. Its average dry weather flow ${M.mode === 'calibrated' && cap.f !== 1 ? `at the plant's measured rate (×${cap.f.toFixed(2)}) ` : ''}is ${uCap(use, cap.rated)}${reserve > 0 ? ` = <strong>${pct(use, reserve)}</strong> of the reserve` : ' — the plant already screens over rated capacity'}. ${estTag}</p>`;
    } else if (pl === 'Toronto') plant = '<p class="small svc-verdict">Drains to the City of Toronto system (Malton): capacity is Toronto\'s, not in Peel\'s plant figures.</p>';
    return `${SCREEN_NOTE}<table class="dt chk-table"><thead><tr><th>Whole development<br><span class="muted">Peel design criteria</span></th><th>Average</th><th>Max day / peak</th><th>Peak hour / wet</th><th></th></tr></thead><tbody>${water}${sewer}</tbody></table>
      ${opt.trace === false ? '' : `<div class="trace-box"><p><button type="button" class="btn small" data-trace="${esc(p.key)}">Trace the path to the plant on the map</button></p><div class="trace-out"></div></div>`}
      ${path.length ? `<table class="dt chk-table"><caption>Sewer path to the plant · build-out ${M.mode === 'calibrated' ? 'annual average flow at each outlet (capacity check, 2025 measured rate)' : 'average dry weather flow (ADWF) at each outlet (design flows)'}</caption><thead><tr><th>Catchment outlet</th><th>Flow at outlet</th><th>This development</th></tr></thead><tbody>${pathRows}</tbody></table>` : '<p class="small muted">Not in a traced drainage area.</p>'}
      ${plant}
      <p class="small muted">${fmtNum(Math.round(e.totalUnits))} units, ${fmtNum(roundPop(e.population))} people${e.employment.jobs > 0 ? `, ${fmtNum(roundPop(e.employment.jobs))} jobs` : ''} at build-out; flows in L/s as in a functional servicing report, ML/d below. Pumping stations are checked against their firm capacity (2020 Master Plan, Vol. 4 Table 6) at peak wet weather; trunk sewer capacities are not published, so they are not checked.</p>`;
  }
  // The Region's housing activity table is CMHC's survey as Peel publishes it: where it and the
  // CMHC series both hold a municipality-year, one is kept (the Region's, which also carries the
  // years CMHC archives and the units absorbed). Building permit statistics are added alongside.
  function mergePeelHousing(H, P) {
    if (!H || !P || !P.activity) return;
    H.peel = P;
    for (const k of ['starts', 'completions']) for (const [m, ys] of Object.entries(P.activity.muni)) {
      if (m === 'Peel') continue;
      const C = (H.cmhc[k][m] = H.cmhc[k][m] || {});
      for (const [y, v] of Object.entries(ys)) if ((!v.quarters || v.quarters === 4) && v[k] && v[k].all > 0) C[y] = v[k];   // a full year only (or its four quarters)
    }
    const last = Math.max(...Object.values(P.activity.muni).flatMap(ys => Object.entries(ys).filter(([, v]) => !v.quarters || v.quarters === 4).map(([y]) => +y)));
    if (isFinite(last)) H.cmhc.asOf = `${last}-12-31`;
  }
  // Project panel line: its pressure zone and drainage area.
  function servicingLineHTML(p) {
    if (!App().state.servicing) return '';
    const z = svcIds(p, 'pz').map(id => svcById.get(id)).filter(Boolean), d = svcIds(p, 'dr').map(id => svcById.get(id)).filter(Boolean);
    const zn = nearOf(p, 'pz'), dn = nearOf(p, 'dr');
    if (!z.length && !d.length) return `<p class="small muted svc-line" data-info="drainage-area">Outside the mapped pressure zones and traced drainage areas${SvcTab().svcOpt.nr === 'on' ? ` (none within ${kmText(NEAR_M)} — likely private well / septic or not yet planned for servicing)` : ''}.</p>`;
    return `<p class="small svc-line" data-info="drainage-area"><strong>Servicing:</strong> ${z.length ? esc(z.map(a => a.name).join(', ')) + (zn ? ` <span class="est">${esc(nearText(zn))}</span>` : '') : 'no pressure zone'} · ${d.length
      ? esc(d.map(a => `${drName(a)} → ${plantLabel(a.plant)}`).join(', ')) + (dn ? ` <span class="est">${esc(nearText(dn))}</span>` : '') : 'no traced drainage area'}</p>`;
  }
  // Pressure zones in numerical order (1, 2, 2A, 3 … 9, CE9, 12A, 13B, AV13).
  const zoneKey = z => { const m = String(z.zone || '').match(/^([A-Z]*)(\d+)(.*)$/i); return m ? [Number(m[2]), m[1] ? 1 : 0, m[1] + m[3]] : [999, 0, String(z.zone)]; };
  const byZone = (a, b) => { const x = zoneKey(a), y = zoneKey(b); return x[0] - y[0] || x[1] - y[1] || x[2].localeCompare(y[2]); };

  const api = {
    PLANT_TOKEN, plantColor, PLANT_SHORT, PLANT_NAME, plantLabel, drName,
    svcFacts,
    svcLayers, svcById, flowRenderer, svcRenderer, loadServicing, tagAreas,
    tagServicing, NEAR_M, svcIds, nearOf, zoneOf, kmText, nearText, renderSvcSelects,
    showSvcArea, setDevsOn, setWwLay, syncWwLayers, syncPanelSum, syncAreaOn,
    clearAreaFilters, syncDevsOff, showAllDevs, devShown, setSvcLayer, spsKey,
    spsOf, spsNote, byZone, servicingCheckHTML, servicingLineHTML,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSvcData = api;
})(typeof window !== 'undefined' ? window : globalThis);
