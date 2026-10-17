/* Peel Growth Pipeline (unofficial) – UI, map and data orchestration. */
(function () {
  'use strict';

  const CFG = window.PEEL_CONFIG;
  const P = window.PeelPhases;
  const A = window.PeelArcGIS;
  const D = window.PeelDemand;
  // Phase 0 (trust and transparency): provenance helpers from js/provenance.js.
  // Defensive: when the script failed to load the page keeps its old rendering.
  const PV = (typeof window !== 'undefined' && window.PeelProvenance) || null;
  // The unofficial banner line, reused everywhere data leaves the app.
  // Inline "screening estimate" tag for calculated figures (small muted text only,
  // never a status colour).
  // Phase 6: pure helpers moved to js/util.js (window.PeelUtil, loads first).
  const { $, esc, fmtNum, store, dot, readColors } = window.PeelUtil;

  // ---- Persistent per-viewer settings (best effort) ---------------------------
  const PD = window.PeelDesign;
  PD.applyTheme(store.get('theme', 'dark'));
  PD.applyDensity(store.get('density', PD.densityDefault()));
  window.PeelUtil.applyPublic();
  // One screening note, the user's wording, at the top of the analysis panel: it covers every tab and
  // tool result (the panes' own copies are hidden by the .screen-note ~ * rule; design audit, Group 10).
  { const n = document.getElementById('screen-note-top'); if (n) n.outerHTML = window.PeelUtil.SCREEN_NOTE.replace('<p class="screen-note"', '<p class="screen-note" id="screen-note-top"'); }

  // ---- State -------------------------------------------------------------------
  const DEFAULT_KIND = 'application';
  // Watchlist: developments the user starred (kept in this browser).
  const watch = new Set(store.get('watch', []) || []);
  // Default view: development applications in progress (application to construction) and the
  // completed ones, any year — what has been built since the 2021 Census is on the system but not in
  // the census, so it shows by default. Withdrawn / refused stay hidden.
  const ACTIVE_PHASES = ['inception', 'review', 'approved', 'permit', 'construction'];
  const DEFAULT_PHASES = () => new Set([...ACTIVE_PHASES, 'completed']);
  const sameSet = (a, b) => a.size === b.size && [...a].every(x => b.has(x));
  // Filter-panel state (Phase 1): flags are multi-select (see FLAG_TESTS and js/filters.js
  // FLAG_META); the counting basis lives in the Scenario control, not the filters.
  const DEFAULT_FLAGS = () => ({ stalled: false, appeal: false, dcwait: false, psover: false, week: false, watched: false, est: false });
  const DEFAULT_BASIS = 'all';        // counting basis: 'all' | 'buildout' | 'committed' | 'remaining'
  // 'all' (the default: every application, as the municipalities map them) | 'growth' |
  // 'residential' | 'mixed' | 'employment'.
  const DEFAULT_LANDUSE = 'all';
  // Phase 1 filter helpers (js/filters.js, loaded before this script): the flag metadata, the
  // phase -> wastewater-layer map and the old share-link migration. Degrades to no-ops if the
  // script tag is missing so the app still runs.
  const PF = window.PeelFilters || { FLAG_META: [], PHASE_LAYER_MAP: {}, wwLayersFromStages: () => ({ built: false, approved: false, proposed: false }), migrateLegacyFocus: () => ({ flags: [], basis: 'all', minUnits: 0, landuse: 'all', yearPreset: null }), encodeFlagParam: () => '', decodeFlagParam: () => ({}) };
  const state = {
    sources: [],                         // {id,name,municipality,kind,url,enabled,status,msg,records}
    projects: [],
    filtered: [],
    phases: DEFAULT_PHASES(),
    lyr: null,   // "Counts as" (SPEC §4): a Set of layers (js/layers.js), or null for every layer
    // Default: projects with a planning application (and the permits that belong to them).
    muni: '', kind: DEFAULT_KIND, search: '', newOnly: true,
    sp: [], mtsa: [], pz: [], dr: [], ss: null,   // pz / dr: water pressure zone and wastewater drainage area ids (data/servicing.json)   // secondary plan / character area ids (several) and MTSA id (data/areas.json)
    minUnits: 0,   // unit growth filter: 0 = any, otherwise at least this many new units
    flags: DEFAULT_FLAGS(),   // flag filters, multi-select (see FLAG_TESTS)
    plant: '',                // receiving wastewater plant: '' | 'Lakeview' | 'Clarkson' | 'Inglewood'
    dwelling: '',             // dwelling type: '' | 'single' | 'town' | 'apartment'
    landuse: DEFAULT_LANDUSE,
    basis: ['all', 'buildout', 'committed', 'remaining'].includes(store.get('svcBasis')) ? store.get('svcBasis') : DEFAULT_BASIS,   // counting basis (Scenario)
    // Timeline: inclusive year range (null = open-ended) on the chosen milestone.
    yearMode: 'any', yearFrom: null, yearTo: null, yearMin: null, yearMax: null,
    criteria: mergeCriteria(store.get('criteria', null)),
    sinceYear: store.get('sinceYear', CFG.sinceYear),
    maxPerLayer: store.get('maxPerLayer', CFG.maxPerLayer),
  };
  // Wet weather scenario (design storm): the I&I allowance as entered (state.iiBase) is scaled to the
  // chosen storm; state.criteria carries the scaled value the model uses. See applyWet().
  state.iiBase = state.criteria.wastewater.infiltration;
  state.wet = Object.assign({ rp: 0, ref: 25, clim: 'none' }, store.get('wetWx', {}));
  // Defaults before the Peel 2023–2024 criteria were adopted: a saved value equal to one of these
  // was never edited, so it gives way to the current default.
  function mergeCriteria(saved) {
    const OLD_DEFAULTS = { water: { avg: 280, maxDay: 2.0 }, employment: { water: 300 }, ppu: { apartment: 2.7 } };
    const d = JSON.parse(JSON.stringify(D.DEFAULT_CRITERIA));
    if (!saved) return d;
    for (const g of Object.keys(d)) for (const k of Object.keys(d[g])) {
      const v = saved[g] && Number(saved[g][k]);
      if (!(v > 0)) continue;
      if (!saved.version && OLD_DEFAULTS[g] && OLD_DEFAULTS[g][k] === v) continue;
      d[g][k] = v;
    }
    return d;
  }
  // Employment parsed once per project (the focus chip counts call it for every project).
  // m²/job comes from the editable criteria; clearEmp() drops the cache when it changes.
  const empOf = p => (p._emp !== undefined ? p._emp : (p._emp = window.PeelEmployment ? PeelEmployment.employmentOf(p, state.criteria.m2PerJob) : null));
  const clearEmp = () => { for (const p of state.projects) { delete p._emp; delete p._psover; delete p._psoverM; } state.empGen = (state.empGen || 0) + 1; };
  // Employment space moves with the project phase (no per-unit permits for it).
  const EMP_DONE = { permitted: new Set(['permit', 'construction', 'completed']), completed: new Set(['completed']) };
  const jobsOf = p => { const e = p.records ? empOf(p) : null; return e ? e.jobs : 0; };
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

  // ---- Loading -------------------------------------------------------------------
  async function loadSource(src) {
    src.records = []; src.layers = [];
    PeelDevelopmentsTab.setSourceStatus(src, 'loading', 'connecting…');
    try {
      const res = await PeelLoader.loadSource(src, {
        bbox: CFG.bbox, sinceYear: state.sinceYear, maxPerLayer: state.maxPerLayer, pageSize: CFG.pageSize,
        onProgress: n => PeelDevelopmentsTab.setSourceStatus(src, 'loading', `loading… ${fmtNum(n)}`),
      });
      src.records = res.records; src.layers = res.layers; src.live = true;
      // Phase 0: stamp when this pull happened; records carry it so provenance
      // can say "pulled <date>" (PeelProvenance.retrievedAt picks it up).
      src.retrievedAt = new Date().toISOString();
      for (const r of src.records) r.retrievedAt = src.retrievedAt;
      PeelDevelopmentsTab.setSourceStatus(src, 'ok', `${fmtNum(src.records.length)} records · live${res.truncated ? ` (capped at ${fmtNum(state.maxPerLayer)}/layer)` : ''}`);
    } catch (e) {
      const msg = /Failed to fetch|NetworkError|Load failed/i.test(e.message) ? 'unreachable (network / CORS)' : e.message;
      PeelDevelopmentsTab.setSourceStatus(src, 'error', msg);
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
    saveSources(); PeelDevelopmentsTab.renderSources();
    btn.disabled = false;
    btn.textContent = `Discover datasets${added.length ? ` (+${added.length})` : ''}`;
    if (errors.length && !found.length) alert(`Dataset discovery failed:\n${errors.join('\n')}`);
    inflight += added.length; showLoading();
    for (const s of added) { await loadSource(s); inflight--; showLoading(); }
  }

  // ---- Rebuild projects ----------------------------------------------------------
  let rebuildTimer;
  function scheduleRebuild() { clearTimeout(rebuildTimer); rebuildTimer = setTimeout(rebuild, 150); }

  // Unit counts entered by the user for files whose count is only in their attachments (cover
  // letter, planning justification report): kept in this browser, applied before grouping.
  // (Keyed by file: a Caledon number carries its type, js/phases.js fileId. A count saved under the
  // bare number before that still applies, as it did.)
  const unitKey = r => `${r.municipality}|${P.fileId(r) || r.ref}`;
  const oldUnitKey = r => `${r.municipality}|${P.canonRef(r.ref) || r.ref}`;
  let userUnits = store.get('userUnits', {}) || {};
  function applyUserUnits(records) {
    for (const r of records) {
      if (r.kind !== 'application') continue;
      if (r._unitsOrig === undefined) r._unitsOrig = r.units ?? null;
      const u = userUnits[unitKey(r)] ?? userUnits[oldUnitKey(r)];
      if (u > 0) { r.units = u; r.unitsUser = true; } else if (r.unitsUser) { r.units = r._unitsOrig; r.unitsUser = false; }
    }
  }
  function setUserUnits(r, n) {
    const k = unitKey(r);
    if (k !== oldUnitKey(r)) delete userUnits[oldUnitKey(r)];
    if (n > 0) userUnits[k] = Math.round(n); else delete userUnits[k];
    store.set('userUnits', userUnits);
    const key = PeelDevNav.getCurrentProject() && (PeelDevNav.getCurrentProject().parent || PeelDevNav.getCurrentProject()).key;
    rebuild();
    const p = state.projects.find(x => x.records.some(q => q.ref === r.ref && q.municipality === r.municipality)) || PeelDevNav.projectByKey(key);
    if (p) PeelDevNav.showDetail(p);
  }
  function rebuild() {
    // Phase 6: while the startup index is serving first paint, stray rebuilds
    // (e.g. a source refresh racing the full snapshot) must not wipe it.
    if (indexPainted && !fullLoaded) return;
    // (one waiting from scheduleRebuild is this one: applySnapshot schedules one and loadFullSnapshot
    // then rebuilds at once, which built every development twice at start-up)
    clearTimeout(rebuildTimer);
    const raw = state.sources.filter(s => s.enabled).flatMap(s => s.records);
    applyUserUnits(raw);
    if (typeof PeelDevNav !== 'undefined') PeelDevNav.SUBS.clear();
    const records = P.dedupeRecords(raw);
    // Council decisions (zoning by-laws passed, draft plans approved) onto their files (SPEC 1.2).
    if (window.PeelCouncilDecisions && PeelCouncilDecisions.data) PeelCouncilDecisions.applyTo(records, PeelCouncilDecisions.data, P.canonRef);
    // Step B2: with the tree count in use, the trees are the developments (js/tree-groups.js
    // through buildProjects' regroup hook); Previous keeps today's grouping.
    const TG = window.PeelTreeGroups, TC = window.PeelTreeCounts;
    const grouped = !!(TG && TC && TC.mode() === 'tree' && TG.ready());
    state.projects = P.buildProjects(records, grouped ? { regroup: parts => TG.regroup(parts) } : {});
    state.treeGrouped = grouped;
    if (TC) TC.apply(state.projects);
    // Old address keys → today's developments (js/phases.js keyAliases), worked out when first needed.
    if (TG && TG.setAliases) { const list = state.projects; TG.setAliases(() => P.keyAliases(list)); }
    migrateSavedKeys(grouped);
    PeelPlanAreas.tagProjects();
    state.auditInput = { raw, records };
    state.audit = null;
    { const c = $('#rec-data-checks'); if (c && !c.hidden) PeelDataTab.renderAudit(); }   // (the duplicate check is under Records › Data checks since bundle 6)
    state.munis = Array.from(new Set(state.projects.map(p => p.municipality))).sort();
    PeelSearchFilter.renderMuniChips();
    PeelTimeline.updateYearBounds();
    // (the map and the list first; Growth, the Overview and the servicing model in the next task, so
    // the page paints between the two halves of a rebuild instead of freezing for both)
    applyFilters.deferGrowth = true;
    try { applyFilters(); } finally { applyFilters.deferGrowth = false; }
    // The servicing model follows the developments: rebuilt with them (it used to wait for the Water /
    // Wastewater tab, so the Overview, the DC tab and the scope cards read a model of the first-paint
    // data — Inglewood 398% vs 42%, SPEC 1.4).
    if (state.servicing && window.PeelSvcTab) { clearTimeout(rebuild.svcT); rebuild.svcT = setTimeout(() => window.PeelSvcTab.ensureSvcModel(), 0); }
  }

  // Years in which the project hit the selected milestone (or any milestone).
  function yearsOf(p, mode) {
    const cache = p._years || (p._years = {});
    return cache[mode] || (cache[mode] = Array.from(new Set(
      p.timeline.filter(t => mode === 'any' || t.phase === mode).map(t => t.date.getUTCFullYear()))));   // (dates are UTC midnight: their year in UTC)
  }
  const timeActive = () => state.yearFrom != null || state.yearTo != null;
  function inYears(p) {
    if (!timeActive()) return true;
    const lo = state.yearFrom ?? -Infinity, hi = state.yearTo ?? Infinity;
    return yearsOf(p, state.yearMode).some(y => y >= lo && y <= hi);
  }

  // Units counted by the Size filter: the development's units, as every screen shows them (the
  // tree count or the previous count, net of homes demolished). With "Planning applications"
  // selected, a site with no planning application counts none (only permits behind it).
  function unitsFor(p) {
    if (state.kind === 'application' && !p.kinds.includes('application')) return 0;
    return p.units || 0;
  }
  // Size: "Adds units or jobs" (1) is units or jobs; the others are at least that many units.
  const sizeMatch = p => (state.minUnits === 1 ? unitsFor(p) > 0 || jobsOf(p) > 0 : unitsFor(p) >= state.minUnits);

  // Land-use filter: what the development adds. 'growth' is the old Growth focus test —
  // planning applications proposing new homes or new jobs — plus growth proposals whose unit
  // count isn't published yet (precinct and block plans, subdivisions: often "see the
  // attached"), which would otherwise vanish. New homes are the units the screens show (p.units).
  const GROWTH_TEXT = /subdivision|block plan|precinct|mixed[- ]use|secondary plan|draft plan|apartment|townhouse|condominium|stacked|residential (development|community|uses|units)|dwelling units/i;
  const NOT_GROWTH = /replac|existing (dwelling|house|building)|addition to|renovat|accessory|garage|pool|deck|tenant|interior|temporary use|day ?care/i;
  const growthUnstated = p => !(p.units > 0) && p.records.some(r => r.kind === 'application' && r.phase !== 'cancelled'
    && !NOT_GROWTH.test(r.description || '') && (GROWTH_TEXT.test(`${r.description || ''} ${r.type || ''}`) || /official plan|zoning|subdivision|block plan/i.test(r.type || ''))
    && (['master', 'precon'].includes(r.stage || P.stageOf(r)) || GROWTH_TEXT.test(r.description || '')));
  const LANDUSE_TEST = {
    all: () => true,
    growth: p => (p.kinds.includes('application') && ((p.units || 0) > 0 || jobsOf(p) > 0)) || growthUnstated(p),
    residential: p => (p.units || 0) > 0 && !empOf(p),
    mixed: p => (p.units || 0) > 0 && !!empOf(p),
    employment: p => !!empOf(p),
  };
  // Every active flag must pass (multi-select). FLAG_TESTS holds the per-flag tests.
  const flagMatch = p => { for (const [k] of PF.FLAG_META) if (state.flags[k] && !PeelFilterUI.FLAG_TESTS[k](p)) return false; return true; };

  function matches(p, ignorePhase, ignoreTime, ignoreFlags) {
    if (!ignorePhase && !state.phases.has(p.phase)) return false;
    if (!ignoreTime && !inYears(p)) return false;
    if (state.muni && p.municipality !== state.muni) return false;
    if (state.sp.length && !state.sp.some(id => (p.sp || []).includes(id))) return false;
    if (state.mtsa.length && !state.mtsa.some(id => (p.mtsa || []).includes(id))) return false;
    if (state.pz.length && !PeelSvcData.svcIds(p, 'pz').some(id => state.pz.includes(id))) return false;
    if (state.dr.length && !PeelSvcData.svcIds(p, 'dr').some(id => state.dr.includes(id))) return false;
    if (state.ss && window.PeelSvcScope && !window.PeelSvcScope.has(p)) return false;   // servicing scope (plant / station / block / zone)
    if (state.kind === 'both' && p.kinds.length < 2) return false;
    if ((state.kind === 'application' || state.kind === 'permit') && !p.kinds.includes(state.kind)) return false;
    if (state.newOnly && !p.newBuild) return false;
    if (state.minUnits > 0 && !sizeMatch(p)) return false;
    if (!ignoreFlags && !flagMatch(p)) return false;
    if (state.plant && PeelMapMarkers.plantOfDev(p) !== state.plant) return false;
    if (state.dwelling && !(D.unitSplit(p)[state.dwelling] > 0)) return false;
    if (!LANDUSE_TEST[state.landuse || DEFAULT_LANDUSE](p)) return false;
    if (state.search) {
      const q = state.search;
      const hay = p._hay || (p._hay = [p.title, p.description, ...p.types, ...p.records.map(r => `${r.ref} ${r.statusRaw} ${r.address}`)].join(' ').toLowerCase());
      if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
    }
    return true;
  }

  // A development's layer (js/layers.js), kept per development object (rebuilt ones are new objects).
  const lyCache = new WeakMap();
  const layerOf = p => { if (!window.PeelLayers) return null; if (!lyCache.has(p)) lyCache.set(p, window.PeelLayers.layerOf(p)); return lyCache.get(p); };
  function applyFilters() {
    PeelSvcData.syncWwLayers();   // growth layers follow the selected stages
    const base = state.projects.filter(p => matches(p, true));
    state.filtered = base.filter(p => state.phases.has(p.phase) && (!state.lyr || state.lyr.has(layerOf(p))));
    PeelRenderList.renderPipeline(base);
    PeelRenderList.renderMarkers();
    PeelRenderList.setListPage(0); PeelRenderList.renderList();   // filters changed: back to the first page
    PeelTimeline.renderTimeline();
    if (applyFilters.deferGrowth && window.PeelUtil && PeelUtil.later) PeelUtil.later('growth', () => PeelGrowthUI.renderGrowth());
    else { if (window.PeelUtil && PeelUtil.cancelLater) PeelUtil.cancelLater('growth'); PeelGrowthUI.renderGrowth(); }
    PeelFilterUI.renderFilterUI();
    PeelMapMarkers.renderSiteLayer();
    if (PeelMapMarkers.mstyle.color === 'phase') PeelMapAnalysis.renderLegend();   // the phase legend lists the shown phases
    renderWatch();
    PeelTips.maybeTour();
    if (window.PeelWorkspaces && window.PeelWorkspaces.bootRestore) window.PeelWorkspaces.bootRestore();
    PeelShare.viewLink.ready();
    PeelTopbar.renderTrail();
  }

  // ---- Analysis column (Phase 2 shell) --------------------------------------------
  // Desktop (≥1200px): the right-hand column, resizable by its left-edge handle.
  const analysisEl = $('#analysis');
  function setAnalysisW(w) {
    const v = Math.max(320, Math.min(680, Math.round(w)));
    document.querySelector('.app').style.setProperty('--analysis-w', `${v}px`);
    if (window.PeelDataTab) PeelDataTab.fixMap(); return v;
  }
  if (store.get('analysisW', null)) setAnalysisW(store.get('analysisW'));
  PeelDataTab.dragResize($('#analysis-resize'), {
    axis: 'x',   // (the column's left edge: dragged left or right, as its cursor and label say)
    get: () => analysisEl.getBoundingClientRect().width,
    set: setAnalysisW,
    done: moved => {
      if (moved) store.set('analysisW', parseInt(document.querySelector('.app').style.getPropertyValue('--analysis-w'), 10));
      window.PeelDataTab && PeelDataTab.fixMap();
    },
  });
  $('#analysis-resize').addEventListener('keydown', e => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return; e.preventDefault();
    store.set('analysisW', setAnalysisW(analysisEl.getBoundingClientRect().width + (e.key === 'ArrowRight' ? 40 : -40)));
  });
  // The #detail bottom sheet is gone (SPEC §3: every click lands in the right panel). setSheetH stays
  // as a no-op for callers that lowered it to make room on a phone.
  const setSheetH = vh => vh;
  // The summary line: the totals for what is on the map (filled by renderGrowth).
  // Desktop: jump to the Overview tab. Compact: expand the bottom sheet.
  $('#f-sum').onclick = () => {
    PeelAnalysisTabs.showFootTab('overview');
    if (PeelDataTab.shellNarrow() && analysisSnap === 'peek') setAnalysisSnap('half');
  };
  $('#analysis').querySelector('.analysis-tabs').addEventListener('click', e => {
    const t = e.target.closest('[data-tab]'); if (!t) return;
    // (Stage 2: Servicing is one tab, 'svc'; it opens on the sub-view last picked.)
    PeelAnalysisTabs.setFootPref(t.dataset.tab); store.set('footTab4', PeelAnalysisTabs.getFootPref());
    PeelAnalysisTabs.showFootTab(PeelAnalysisTabs.getFootPref()); PeelShare.viewLink.write();
  });
  // Bottom-sheet snaps (compact): peek shows the summary + tabs, half and full the
  // tables. Tap the grip to cycle the snaps; drag to the nearest snap. Remembered.
  const ANALYSIS_SNAPS = ['peek', 'half', 'full'];
  let analysisSnap = store.get('analysisSnap', 'peek');
  if (!ANALYSIS_SNAPS.includes(analysisSnap)) analysisSnap = 'peek';
  function analysisSnapPx(name) {
    const vh = window.innerHeight;
    const footH = $('#footer') ? $('#footer').getBoundingClientRect().height : 0;
    if (name === 'half') return Math.round(vh * 0.5);
    // Full stops at the top bar, so the sheet's tabs and the panel header stay in view.
    const topB = $('#topbar') ? Math.max(0, $('#topbar').getBoundingClientRect().bottom) : 0;
    if (name === 'full') return Math.max(240, Math.round(vh - footH - topB) - 8);
    return 96;
  }
  function setAnalysisSnap(name, save = true) {
    if (!ANALYSIS_SNAPS.includes(name)) name = 'peek';
    analysisSnap = name;
    analysisEl.style.setProperty('--analysis-h', `${analysisSnapPx(name)}px`);
    // (the page knows the sheet's height too: on a phone the map's way back sits just above it)
    document.documentElement.style.setProperty('--sheet-h', `${analysisSnapPx(name)}px`);
    analysisEl.dataset.snap = name;
    if (save) store.set('analysisSnap', name);
    window.PeelDataTab && PeelDataTab.fixMap();
  }
  setAnalysisSnap(analysisSnap, false);
  PeelDataTab.dragResize($('#analysis-grip'), {
    get: () => analysisEl.getBoundingClientRect().height,
    set: h => { const v = `${Math.max(72, Math.min(window.innerHeight, Math.round(h)))}px`; analysisEl.style.setProperty('--analysis-h', v); document.documentElement.style.setProperty('--sheet-h', v); },
    done: moved => {
      if (!PeelDataTab.shellNarrow()) return;
      const cur = analysisEl.getBoundingClientRect().height;
      const near = ANALYSIS_SNAPS.reduce((a, n) => Math.abs(analysisSnapPx(n) - cur) < Math.abs(analysisSnapPx(a) - cur) ? n : a);
      setAnalysisSnap(moved ? near : ANALYSIS_SNAPS[(ANALYSIS_SNAPS.indexOf(analysisSnap) + 1) % ANALYSIS_SNAPS.length]);
    },
  });
  // Compact shell: Esc closes the filter sheet first, then folds the analysis sheet
  // back to its peek — back to the map. (The detail drawer and the tour handle Esc
  // themselves; form fields keep theirs.)
  addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !PeelDataTab.shellNarrow()) return;
    if (document.querySelector('.tour')) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if ($('#sidebar').classList.contains('open')) PeelDataTab.toggleSidebar(false);
    else if (analysisSnap !== 'peek') setAnalysisSnap('peek');
  }, true);
  // Keep the map sized around the analysis column: the column resizes by drag
  // (desktop) or by sheet snaps (compact); Leaflet only learns its new box on invalidateSize.
  if (window.ResizeObserver) new ResizeObserver(() => { window.PeelDataTab && PeelDataTab.fixMap(); }).observe(analysisEl);
  // View ↔ tab linking, reverse direction (Worker 1 wires view-switch → analysis tab): picking an
  // analysis tab also sets the matching map view. The tabViewLink guard keeps a view-switch event
  // from re-entering (setMapView is already a no-op when the view is current). Tabs without a
  // mapped view (growth, dev, developments, tool) leave the map view alone.
  const TAB_VIEW = { water: 'water', ww: 'wastewater', dca: 'dc', overview: 'planning' };
  let tabViewLink = false;
  const wireTabView = strip => {
    if (!strip || strip.dataset.tabview) return; strip.dataset.tabview = '1';
    strip.addEventListener('click', e => {
      const t = e.target.closest('.f-tab[data-tab], .f-tab[data-atab]'); if (!t) return;
      const k = t.dataset.tab === 'svc' ? (store.get('svcSys', 'ww') === 'water' ? 'water' : 'ww') : t.dataset.tab || t.dataset.atab;
      const v = TAB_VIEW[k];
      if (!v || tabViewLink || PeelMapAnalysis.currentView() === v) return;
      tabViewLink = true;
      try { PeelMapAnalysis.setMapView(v); } finally { tabViewLink = false; }
    });
  };
  wireTabView(document.querySelector('.analysis-tabs'));   // Phase 2 analysis column
  // Timeline (in the slim footer strip): folds to its header via #t-toggle.
  function setTimelineOpen(open) {
    $('#timebar').classList.toggle('folded', !open);
    $('#t-toggle').setAttribute('aria-expanded', String(open));
    $('#t-toggle').textContent = open ? '▾' : '▴';
  }
  $('#t-toggle').onclick = () => { const open = $('#timebar').classList.contains('folded'); setTimelineOpen(open); store.set('timelineOpen', open); };
  setTimelineOpen(store.get('timelineOpen', false));

  // A theme change (manual, or OS-level for follow-device): drop the computed-
  // colour cache, rebuild the marker icons, and re-tile (the grey-canvas
  // basemap follows the theme).
  function refreshTheme() {
    readColors(); for (const k in PeelMapMarkers.iconCache) delete PeelMapMarkers.iconCache[k]; PeelMapCore.setTiles(); PeelMapAnalysis.renderLegend(); applyFilters();
  }
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (store.get('theme', 'dark') === 'device' && window.PeelDesign) window.PeelDesign.applyTheme('device'); refreshTheme(); });

  // Keep --footer-h fresh: the slim timeline strip still offsets the detail drawer.
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--footer-h', `${$('#footer').offsetHeight}px`);
    window.PeelMapCore.map.invalidateSize();
  }).observe($('#footer'));
  // Analysis tables wider than their place even with wrapped text scroll inside themselves (.dt-wide)
  // rather than being cut off by the panel.
  const panes = document.getElementById('analysis-panes');
  if (panes) {
    let t = null;
    const markWide = () => { for (const tb of panes.querySelectorAll('table.dt')) { if (!tb.offsetParent) continue; tb.classList.remove('dt-wide'); const room = tb.parentElement.clientWidth; if (room && tb.scrollWidth > room + 2) tb.classList.add('dt-wide'); } };
    new MutationObserver(() => { clearTimeout(t); t = setTimeout(markWide, 120); }).observe(panes, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(markWide, 120); }).observe(panes);
  }
  // And --top-h: where the top bar ends (banner included). The top bar sits above the drawers so
  // its menus open over them; the detail drawer (Help, a selection…) starts below it.
  const topEl = document.querySelector('.topbar');
  if (topEl) {
    const setTop = () => {
      document.documentElement.style.setProperty('--top-h', `${Math.max(0, Math.round(topEl.getBoundingClientRect().bottom))}px`);
      if (analysisSnap === 'full') setAnalysisSnap('full', false);
    };
    new ResizeObserver(setTop).observe(topEl); addEventListener('resize', setTop); setTop();
  }

  // Version stamped at deploy time (index.html meta + ?v= on every script).
  const APP_VERSION = (document.querySelector('meta[name="app-version"]') || {}).content || 'dev';
  function renderVersion() {
    const d = state.snapshot ? ` · data ${state.snapshot.generatedAt.slice(0, 10)}` : '';
    $('#app-version').textContent = `App version ${APP_VERSION === '__BUILD__' ? 'dev' : APP_VERSION}${d}`;
    // The bottom bar's right end (SPEC §4): data date, version, change log.
    const meta = v => { const el = $('#tb-meta'); if (el) el.innerHTML = `Data ${esc(state.snapshot && state.snapshot.generatedAt ? state.snapshot.generatedAt.slice(0, 10) : 'live')} · ${esc(v)} · <button type="button" class="btn small link" data-tbg-log>Change log</button>`; };
    meta(APP_VERSION === '__BUILD__' ? 'dev' : APP_VERSION);
    PeelChangelog.loadChangelog().then(() => { const r = PeelChangelog.currentRelease(); if (r) { $('#app-version').textContent = `App version ${r.version} (build ${APP_VERSION === '__BUILD__' ? 'dev' : APP_VERSION})${d} · see the Change log tab`; meta(`v${r.version}`); } });
  }

  // ---- Boot ------------------------------------------------------------------------
  // Browsers (iOS especially) restore form controls when a tab is reopened; after a layout change the
  // restored values can land on the wrong control or match no option. Start from the app's state.
  // Phase 6 (R4): these ran at app.js eval time before the old boot section;
  // PeelSewerProfile.init() preserves that ordering and must run first.
  // (Runs from startApp(), after window.PeelApp is assigned below: every module reaches the
  // app through it.)
  function startApp() {
    window.PeelSewerProfile.init();
    // Offline support (OFFLINE_WIRING): register the service worker early, before
    // the first network fetch. Guarded: no-ops on file://, under node, or without SW.
    if (window.PeelOffline) PeelOffline.register();
    $('#t-mode').value = state.yearMode;
    PeelSearchFilter.syncFilterControls();
    for (const sel of document.querySelectorAll('select')) if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = 0;
    readColors();
    PeelMapCore.setTiles();
    PeelMapAnalysis.renderLegend();
    PeelMapAnalysis.syncMapOpts();
    PeelMapAnalysis.renderSavedViews();
    PeelDevelopmentsTab.renderSources();
    renderVersion();
    PeelGrowthUI.renderCriteria();
    PeelTimeline.updateYearBounds();
    applyFilters();
    boot();
  }

  // Phase 6: paint first from the compact per-project index
  // (data/snapshot-index.json, ~43% of the snapshot), then swap in the full
  // records once the browser is idle. First paint has the map, the list and
  // every filter working; the full snapshot replaces the lightweight projects
  // (same keys, same grouping) so detail views, exports and live refresh keep
  // working against full records.
  let indexPainted = false, fullLoaded = false, fullLoadPromise = null;

  async function bootFromIndex() {
    try {
      const SI = window.PeelSnapshotIndex;
      if (!SI) return false;
      const res = await fetch('data/snapshot-index.json', { cache: 'no-cache' });
      if (!res.ok) return false;
      const idx = await res.json();
      if (!idx || !Array.isArray(idx.projects) || !Array.isArray(idx.phases) || !Array.isArray(idx.muni)) return false;
      applyIndex(idx);
      return true;
    } catch (e) { return false; }
  }

  // First paint from the index: hydrate the lightweight projects and run the
  // same tail as rebuild() (tags, year bounds, filters) without the grouping.
  function applyIndex(idx) {
    state.snapshot = { generatedAt: idx.generatedAt, changes: idx.changes };
    indexPainted = true;
    if (typeof PeelDevNav !== 'undefined') PeelDevNav.SUBS.clear();
    state.projects = idx.projects.map(e => window.PeelSnapshotIndex.hydrate(e, idx));
    PeelPlanAreas.tagProjects();
    state.auditInput = null;
    state.audit = null;
    state.munis = Array.from(new Set(state.projects.map(p => p.municipality))).sort();
    PeelSearchFilter.renderMuniChips();
    PeelTimeline.updateYearBounds();
    PeelDevelopmentsTab.renderSources();
    renderVersion();
    renderChanges();
    applyFilters();
  }

  // The full records, after first paint (or immediately when the index missed).
  // One shared promise: concurrent callers (e.g. opening a development early)
  // await the same load.
  function loadFullSnapshot() {
    if (!fullLoadPromise) fullLoadPromise = (async () => {
      const finishFull = () => { fullLoaded = true; indexPainted = false; };
      let snap = null;
      try {
        const res = await fetch('data/snapshot.json', { cache: 'no-cache' });
        if (res.ok) snap = await res.json();
      } catch (e) { /* no snapshot published, or opened from disk */ }
      if (!snap || !Array.isArray(snap.records)) {
        await loadAll();
        finishFull();
      } else {
        await Promise.race([treeCountsLoad, new Promise(r => setTimeout(r, 3000))]);
        finishFull();
        applySnapshot(snap);
        if (window.PeelOffline) PeelOffline.setCachedAt(Date.now());
        // User-added sources aren't in the snapshot: load those live.
        const missing = state.sources.filter(s => s.enabled && !s.fromSnapshot);
        inflight += missing.length; showLoading();
        for (const s of missing) { await loadSource(s); inflight--; showLoading(); }
        fetch('data/history.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(h => {
          state.history = h;
          if (window.PeelTreeGroups) { const keys = new Set(state.projects.map(p => p.key)); PeelTreeGroups.translateHistory(h, k => keys.has(k), { aliasesOnly: !state.treeGrouped }); }
        }).catch(() => {});
      }
      rebuild();
    })();
    return fullLoadPromise;
  }

  // Start from the weekly snapshot (fast, survives source outages); fall back to live.
  // Step B1: the tree counts (small, built with the snapshot) load alongside; when they arrive
  // after first paint, the developments take them and every view refreshes.
  // Step B2: the developments become the trees once the data is in; a switch in Settings ›
  // Counting regroups (Tree) or puts today's grouping back (Previous).
  // (the full snapshot waits for both, a few seconds at most, so the developments are built once:
  // each one arriving after it rebuilt everything again, a 4 s freeze at start-up)
  let treeCountsLoad = Promise.resolve();
  function loadTreeCounts() {
    const ps = [];
    if (window.PeelCouncilDecisions) ps.push(PeelCouncilDecisions.load().then(d => { if (d && fullLoaded && state.projects && state.projects.length) recount(); }));
    if (window.PeelTreeCounts) ps.push(PeelTreeCounts.load().then(d => { if (d && fullLoaded && state.projects && state.projects.length) recount(); }));
    treeCountsLoad = Promise.all(ps.map(x => x.catch(() => {})));
  }
  function recount() {
    if (!window.PeelTreeCounts || !state.projects) return;
    const cur = typeof PeelDevNav !== 'undefined' && PeelDevNav.getCurrentProject && PeelDevNav.getCurrentProject();
    const curKey = cur && cur.key;
    rebuild();
    if (window.PeelSvcTab && PeelSvcTab.renderScenario) PeelSvcTab.renderScenario();
    else if (window.PeelTopbar && PeelTopbar.renderTbScen) PeelTopbar.renderTbScen();
    const again = curKey && PeelDevNav.projectByKey(curKey);
    if (again && PeelDevNav.showDetail) PeelDevNav.showDetail(again);
  }
  // Keys saved under today's developments (watchlist, allocations), the weekly changes and the
  // phase history, rewritten to the trees' keys. Nothing saved is dropped (js/tree-groups.js).
  // With the trees off (Previous), only old address keys are rewritten (js/phases.js keyAliases).
  function migrateSavedKeys(grouped) {
    const TG = window.PeelTreeGroups; if (!TG) return;
    const keys = new Set(state.projects.map(p => p.key)), exists = k => keys.has(k), opts = { aliasesOnly: !grouped };
    if ([...watch].some(k => !exists(k))) {
      const w = TG.migrateKeys([...watch], exists, opts);
      if (w.length !== watch.size || w.some(k => !watch.has(k))) { watch.clear(); w.forEach(k => watch.add(k)); store.set('watch', w); }
    }
    const unitsOf = k => { const p = state.projects.find(x => x.key === k); return p ? p.units : 0; };
    const al = TG.migrateAllocations(store.get('allocations', {}) || {}, exists, unitsOf, opts);
    if (al.moved) store.set('allocations', al.all);
    TG.translateChanges(state.snapshot && state.snapshot.changes, exists, opts);
    TG.translateHistory(state.history, exists, opts);
  }
  async function boot() {
    loadTreeCounts();
    if (await bootFromIndex()) {
      // First paint is up; pull the full snapshot when the browser is idle.
      const go = () => { loadFullSnapshot().catch(() => {}); };
      if (typeof requestIdleCallback === 'function') requestIdleCallback(go, { timeout: 4000 });
      else setTimeout(go, 60);
      return;
    }
    await loadFullSnapshot();
  }

  function applySnapshot(snap) {
    state.snapshot = { generatedAt: snap.generatedAt, changes: snap.changes, note: snap.note };
    const byRoot = new Map();
    for (const o of snap.records) {
      const id = String(o.sourceId).split('/')[0];
      if (!byRoot.has(id)) byRoot.set(id, []);
      byRoot.get(id).push(o);
    }
    for (const meta of snap.sources) {
      if (removed.has(meta.id)) continue;
      let src = state.sources.find(s => s.id === meta.id);
      if (!src) {
        src = { ...meta, enabled: disabled[meta.id] != null ? !disabled[meta.id] : true, records: [] };
        state.sources.push(src);
      }
      src.fromSnapshot = true;
      src.records = (byRoot.get(meta.id) || []).map(o => ({
        sourceName: meta.name, ref: '', address: '', type: '', description: '', ward: '', statusRaw: '',
        units: null, gfa: null, newBuild: false, unitMix: null, props: {}, ...o,
        events: (o.events || []).map(([d, phase, label]) => ({ date: new Date(`${d}T00:00:00Z`), phase, label })),
      }));
      // Unit counts written in the description since this snapshot was built ("unit count: 2656").
      if (src.countUnits !== false) for (const r of src.records) {
        if (r.kind !== 'application' || r.unitMix || (r.units > 0 && !r.unitsFromText)) continue;
        const t = P.unitsFromText(r.description); if (t && !(r.units >= t)) { r.units = t; r.unitsFromText = true; }
      }
      const n = fmtNum(src.records.length);
      if (meta.status === 'ok') { src.status = 'ok'; src.msg = `${n} records · ${meta.updated}`; }
      else if (meta.status === 'stale') { src.status = 'error'; src.msg = `${n} records from ${meta.updated} (source unreachable this week)`; }
      else { src.status = 'error'; src.msg = meta.error || 'failed in last snapshot'; }
    }
    PeelDevelopmentsTab.renderSources();
    renderVersion();
    renderChanges();
    scheduleRebuild();
  }

  // Watchlist (This week tab): starred developments, those changed this week first.
  function weekChangeOf(key) {
    const c = state.snapshot && state.snapshot.changes; if (!c || c.baseline) return null;
    const m = (c.moved || []).find(x => x.key === key); if (m) return `${P.PHASE_BY_KEY[m.from].label} → ${P.PHASE_BY_KEY[m.to].label}`;
    return (c.added || []).some(x => x.key === key) ? 'New this week' : null;
  }
  function renderWatch() {
    const box = $('#watch-list'); if (!box) return;
    const list = state.projects.filter(p => watch.has(p.key)).map(p => ({ p, ch: weekChangeOf(p.key) })).sort((a, b) => (!!b.ch - !!a.ch) || a.p.title.localeCompare(b.p.title));
    // Watched EAs and capital projects (js/capital-ea.js).
    const ceRows = window.PeelCapitalEA ? window.PeelCapitalEA.watchRows(watch) : [];
    const nCh = list.filter(x => x.ch).length;
    $('#watch-head').textContent = watch.size ? `${fmtNum(watch.size)} watched${nCh ? ` · ${nCh} changed this week` : ''}` : '';
    box.innerHTML = list.length || ceRows.length ? ceRows.join('') + list.map(({ p, ch }) => `<li><button type="button" data-watch-open="${esc(p.key)}">${dot(p.phase)}<span><span class="t">★ ${esc(p.title)}</span><span class="m">${ch ? `<strong class="watch-ch">${esc(ch)}</strong> · ` : ''}${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}${p.units ? ` · ${fmtNum(p.units)} units` : ''}</span></span></button></li>`).join('')
      : '<li class="muted small">Tap ☆ Watch on a development to follow it here.</li>';
    const wk = $('#week-watch-n'); if (wk) { wk.hidden = !nCh; wk.textContent = `★${nCh}`; }
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-watch]');
    if (b) {
      const k = b.dataset.watch; if (watch.has(k)) watch.delete(k); else watch.add(k);
      store.set('watch', [...watch]);
      const on = watch.has(k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.textContent = on ? '★ Watching' : '☆ Watch';
      renderWatch(); PeelFilterUI.renderFlagChips(); if (window.PeelCapitalEA) window.PeelCapitalEA.renderWeek(); return;
    }
    const o = e.target.closest('[data-watch-open]');
    if (o) { const p = PeelDevNav.projectByKey(o.dataset.watchOpen); if (p) PeelDevelopmentsTab.focusProject(p); }
  });

  // "This week" panel: projects that appeared or changed phase since the previous snapshot.
  document.addEventListener('click', e => { if (e.target.closest('[data-tbg-log]')) PeelTips.showHelpLog(); });
  function renderChanges() {
    const c = state.snapshot && state.snapshot.changes;
    if (!c || c.baseline) return;
    $('#changes-head').textContent = `${c.since} → ${c.until}`;
    // Real changes vs backfill (SPEC §4): a newly listed file that is already completed is an old
    // record surfacing in the refresh, not news; it is counted here and listed under Data › Sources.
    const real = c.added.filter(a => a.phase !== 'completed'), backfill = c.added.filter(a => a.phase === 'completed');
    const n = (c.movedCount || c.moved.length || 0) + real.length;
    $('#week-count').hidden = true;   // (bundle 6: the Watch tab is the watchlist; this week's count is on Home's This week)
    $('#week-count').textContent = n > 99 ? '99+' : String(n);
    const items = [
      ...c.moved.map(m => ({ ...m, html: `${dot(m.to)}<span><span class="t">${watch.has(m.key) ? '★ ' : ''}${esc(m.title)}</span><span class="m">${esc(P.PHASE_BY_KEY[m.from].label)} → ${esc(P.PHASE_BY_KEY[m.to].label)} · ${esc(m.municipality)}</span></span>` })),
      ...real.map(a => ({ ...a, html: `${dot(a.phase)}<span><span class="t">${watch.has(a.key) ? '★ ' : ''}${esc(a.title)}</span><span class="m">New · ${esc(P.PHASE_BY_KEY[a.phase].label)} · ${esc(a.municipality)}${a.units ? ` · ${fmtNum(a.units)} units` : ''}</span></span>` })),
    ];
    $('#changes-summary').textContent = `${fmtNum(c.movedCount || c.moved.length)} changed phase · ${fmtNum(real.length)} new${backfill.length ? ` · ${fmtNum(backfill.length)} backfill hidden (older completed files that surfaced in the refresh: Data › Sources)` : ''}`;
    const bf = $('#backfill-note');
    if (bf) { bf.hidden = !backfill.length; bf.innerHTML = backfill.length ? `<strong>Backfill ${esc(c.since)} → ${esc(c.until)}:</strong> ${fmtNum(backfill.length)} older completed file${backfill.length === 1 ? '' : 's'} surfaced in the refresh (not counted as changes): ${backfill.slice(0, 8).map(a => esc(a.title)).join(' · ')}${backfill.length > 8 ? ` · +${fmtNum(backfill.length - 8)} more` : ''}.` : ''; }
    const SHOW = 25;
    $('#changes-list').innerHTML = items.slice(0, SHOW).map((it, i) => `<li><button type="button" data-i="${i}">${it.html}</button></li>`).join('') +
      (items.length > SHOW ? `<li class="muted small">+ ${fmtNum(items.length - SHOW)} more</li>` : '');
    $('#changes-list').onclick = e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const p = PeelDevNav.projectByKey(items[+b.dataset.i].key);
      if (p) PeelDevelopmentsTab.focusProject(p);
    };
  }

  // Phase 6: PeelApp bridge — core-owned values are direct references; module-owned
  // functions are lazy arrow wrappers (app.js loads last, so all modules exist).
  window.PeelApp = {
    state, rebuild, loadAll, discover,
    map: window.PeelMapCore.map,
    showDetail: (...a) => window.PeelDevNav.showDetail(...a),
    // ---- newly exposed core internals (used cross-module) ----
    applyFilters, matches, layerOf, scheduleRebuild, recount, loadSource, showLoading, saveSources,
    applySnapshot, jobsOf, empOf, clearEmp, mergeCriteria, setUserUnits,
    timeActive, yearsOf, setSheetH, refreshTheme,
    // Phase 6: full-snapshot load state (startup index paints first; the detail
    // view awaits the full records).
    fullSnapshotReady: () => fullLoaded, whenFullSnapshot: () => loadFullSnapshot(),
    getAnalysisSnap: () => analysisSnap, setAnalysisSnap,
    watch, removed, disabled, renderWatch,
    inflight: () => inflight,
    setInflight: v => { inflight = v; },
    // shared filter/state constants (core-owned, used by share/filter-ui/search-filter)
    DEFAULT_KIND, DEFAULT_PHASES, DEFAULT_FLAGS, DEFAULT_BASIS, DEFAULT_LANDUSE,
    ACTIVE_PHASES, sameSet, EMP_DONE, PF,
    // ---- re-wired to extracted modules (were app.js-local) ----
    pipeSummary: () => window.PeelSewerCap.pipeSummary(),
    devNeeds: p => window.PeelMasterPlan.devNeeds(p),
    allNeeds: () => window.PeelMasterPlan.allNeeds(),
    showDcTiming: () => window.PeelMasterPlan.showDcTiming(),
    showDcLine: ln => window.PeelMasterPlan.showDcLine(ln),
    sewersReady: () => !!(window.PeelMapMarkers && window.PeelMapMarkers.SEW.data),
    showBlock: id => window.PeelSewerTrace.showBlock(id),
    showPipeLoads: i => window.PeelSewerCap.showPipeLoads(i),
    pipeRatio: i => window.PeelSewerCap.pipeStats(i).r1,
    setBlocksLayer: on => window.PeelSewerTrace.setBlocksLayer(on),
    focusSvc: id => window.PeelSewerTrace.focusSvc(id),
    setMapStyle: ch => window.PeelMapAnalysis.setMapStyle(ch),
    blockAt: (x, y) => window.PeelSewerTrace.blockAt(x, y),
    sewerPipes: () => { const s = window.PeelMapMarkers && window.PeelMapMarkers.SEW; return s.data && s.data.pipes; },
    dcSewerPath: p => window.PeelSewerTrace.dcSewerPath(p),
    pipeCons: i => window.PeelMasterPlan.pipeCons(i),
    psCons: a => window.PeelMasterPlan.psCons(a),
    plantCons: pl => window.PeelMasterPlan.plantCons(pl),
    waterPlantCons: z => window.PeelMasterPlan.waterPlantCons(z),
    supplyCons: b => window.PeelMasterPlan.supplyCons(b),
    trunkNeeds: (p, zid) => window.PeelMasterPlan.trunkNeeds(p, zid),
    loadMpWater: () => window.PeelMasterPlan.loadMpWater(),
    storageCons: () => window.PeelMasterPlan.storageCons(),
    nearestPipe: (lng, lat, r, minD) => window.PeelSewerCap.nearestPipe(lng, lat, r, minD),
    upgBump: k => { window.PeelMasterPlan.setSewUpgKey(k || ''); },
    pipeColour: r => window.PeelSewerCap.pipeColour(r),
    peopleFor: (room, add) => window.PeelMasterPlan.peopleFor(room, add),
    runOut: (q, lim) => window.PeelMasterPlan.runOut(q, lim),
    tracePoint: ll => window.PeelSewerProfile.tracePoint(ll, false),   // returns the trace, no panel (Inspect, Fit)
    traceSummaryHTML: t => window.PeelSewerTrace.traceSummaryHTML(t),
    waterTrace: (p, zid) => window.PeelWaterTrace.waterTrace(p, zid),
    waterTraceSummaryHTML: r => window.PeelWaterTrace.waterTraceSummaryHTML(r),
    existingAround: (lng, lat, r) => window.PeelExistPipes.existingAround(lng, lat, r),
    dcNearest: (sys, pt, r, f) => window.PeelDcInfra.dcNearest(sys, pt, r, f),
    dcLineText: ln => window.PeelDcInfra.dcLineText(ln),
    estimateZone: p => window.PeelWaterTrace.estimateZone(p),
    tagAreas: p => window.PeelSvcData.tagAreas(p),
    showWhatIf: (ll, id) => window.PeelSewerProfile.showWhatIf(ll, id),
    whatIfProject: w => window.PeelSewerProfile.whatIfProject(w),
    scope: {
      setProject: p => { window.PeelDevNav.setCurrentProject(p); },
      getProject: () => window.PeelDevNav.getCurrentProject(),
      renderTrail: (...a) => window.PeelTopbar.renderTrail(...a),
      showFootTab: (...a) => window.PeelAnalysisTabs.showFootTab(...a),
      highlight: (...a) => window.PeelMapMarkers.highlight(...a),
      flyToSite: (...a) => window.PeelDevNav.flyToSite(...a),
      traceDev: (...a) => window.PeelSewerTrace.traceDev(...a),
      clearTrace: (...a) => window.PeelSewerTrace.clearTrace(...a),
      traceKey: () => window.PeelSewerTrace.TRACE.key,
      setTool: m => window.PeelMeasure.setTool(m),
      statusOf: (...a) => window.PeelDevDetail.statusOf(...a),
      svcFacts: (...a) => window.PeelSvcData.svcFacts(...a),
      devWorks: (...a) => window.PeelDcInfra.devWorks(...a),
      devFlags: (...a) => window.PeelDevDetail.devFlags(...a),
      qualityOf: (...a) => window.PeelMapMarkers.qualityOf(...a),
      QUALITY: window.PeelMapMarkers.QUALITY,
      setDaContext: (...a) => window.PeelCensusAreas.setDaContext(...a),
      ensureCouncil: () => window.PeelDevDetail.loadCouncil(),
      // At a development the allocation form is a fold of its Servicing panel (Allocations is Peel-wide).
      showAllocSub: () => {
        if (window.PeelWorkspaces && document.documentElement.classList.contains('home-on')) window.PeelWorkspaces.setMode('full');
        window.PeelAnalysisTabs.openTab('svc', 'network');
        setTimeout(() => { const d = document.getElementById('pnl-alloc'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); const u = d.querySelector('[data-alloc-f="units"]'); if (u) u.focus(); } }, 300);
        window.PeelShare.viewLink.write();
      },
      writeLink: () => window.PeelShare.viewLink.write(),
      estimate: p => D.estimate([p], state.criteria, 'all', jobsOf),
      renderScopeTab: () => {
        const t = window.PeelAnalysisTabs.getFootPref();
        if (t === 'overview') window.PeelOverviewTab.renderOverview();
        else if (t === 'growth') window.PeelGrowthUI.renderGrowth();
        else if (t === 'svc' || t === 'water' || t === 'ww') window.PeelSvcTab.ensureSvcModel({ rescope: true });   // (a site swaps its bodies in; the model is rebuilt only if its inputs changed)
        else if (t === 'dca') window.PeelDcaTab.renderDca();
      },
      isWatched: k => watch.has(k),
      PLANT_SHORT: window.PeelSvcData.PLANT_SHORT,
      fmt: {
        // Re-wired to PeelUtil (were app.js/PeeDemandUI locals). Existing
        // consumers (devscope.js, devtab.js, tools-*.js) keep working unchanged.
        esc: window.PeelUtil.esc, fmtNum: window.PeelUtil.fmtNum,
        fmtDate: window.PeelUtil.fmtDate, skel: window.PeelUtil.skel,
        dot: window.PeelUtil.dot, token: window.PeelUtil.token,
        phaseColor: window.PeelUtil.phaseColor, glyphColor: window.PeelUtil.glyphColor,
        uUnits: window.PeelUtil.uUnits, uPop: window.PeelUtil.uPop,
        uLs: window.PeelUtil.uLs, uML: window.PeelUtil.uML,
        uHa: window.PeelUtil.uHa, uDev: window.PeelUtil.uDev,
        roundPop: window.PeelUtil.roundPop, fmt1: window.PeelUtil.fmt1,
        unit: window.PeelUtil.unit, hlP: window.PeelUtil.hlP,
        fmtMoney: window.PeelUtil.fmtMoney,
      },
    } };

  // Phase 6: deferred module inits that need window.PeelApp (assigned above).
  // In the single-file app these ran inline with the bare `state` variable.
  startApp();
  PeelPlanAreas.loadAreas();
  PeelSvcData.loadServicing();
  window.PeelTopbar.initTopbar();
  window.PeelDataTab.initDataTab();
  // Stage 4: the start screen (Home, the last workspace or the full map; a link opens what it names).
  if (window.PeelWorkspaces) window.PeelWorkspaces.init();
})();
