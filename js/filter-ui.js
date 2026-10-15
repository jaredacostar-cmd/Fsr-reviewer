(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc, fmtNum } = window.PeelUtil;
  const P = window.PeelPhases;
  const PF = window.PeelFilters || { FLAG_META: [], PHASE_LAYER_MAP: {}, wwLayersFromStages: () => ({ built: false, approved: false, proposed: false }), migrateLegacyFocus: () => ({ flags: [], basis: 'all', minUnits: 0, landuse: 'all', yearPreset: null }), encodeFlagParam: () => '', decodeFlagParam: () => ({}) };
  const App = () => window.PeelApp;
  const DD = () => window.PeelDevDetail;
  const SD = () => window.PeelSvcData;
  const MM = () => window.PeelMapMarkers;
  const PA = () => window.PeelPlanAreas;
  const SF = () => window.PeelSearchFilter;
  const TL = () => window.PeelTimeline;
  const DT = () => window.PeelDataTab;
  const MA = () => window.PeelMapAnalysis;

  // Quick views: a phase (or phase group) plus an optional focus.
  const ALL_PHASE_KEYS = () => new Set(P.ALL_PHASES.map(p => p.key));
  const PLANNING_PHASES = ['inception', 'review', 'approved'];
  function currentPhaseView() {
    if (App().state.phases.size === P.ALL_PHASES.length) return 'all';
    if (App().sameSet(App().state.phases, App().DEFAULT_PHASES())) return 'default';
    if (App().sameSet(App().state.phases, new Set(App().ACTIVE_PHASES))) return 'active';
    return App().state.phases.size === 1 ? [...App().state.phases][0] : null;
  }
  // (The #pipeline segments above are the phase selector; togglePhase keeps the tap /
  // Ctrl-click behaviour. The old All / Active / per-phase chips are gone.)

  const YEAR_MS = 365.25 * 864e5;
  const appUnits = p => p._appUnits ?? (p._appUnits = Math.max(0, ...p.records.filter(r => r.kind === 'application').map(r => r.units || 0)));
  const weekKeys = () => {
    const c = App().state.snapshot && App().state.snapshot.changes;
    if (!c || c.baseline) return null;
    return App().state._weekKeys || (App().state._weekKeys = new Set([...(c.moved || []), ...(c.added || [])].map(x => x.key)));
  };
  // Flag filters: each flag narrows the projects; several can be on at once. Labels and
  // tooltips come from js/filters.js FLAG_META so share links and tests share them.
  // - stalled / week / watched: the old focus tests, unchanged.
  // - appeal: the first DD().STATUS_SIGNALS regex (OMB / OLT / LPAT) on an application's status text.
  // - dcwait: the per-project servicing-timing category is a planned 2026 DC main (2027 or later).
  // - psover: a pumping station on the project's sewer path is over firm capacity at build-out —
  //   via SD().svcFacts(p).sps (build-out peak wet vs firm capacity, the same >= threshold the
  //   development panel uses for its warning chip); cached per servicing-model build.
  // - est: the per-project data-quality category is anything but 'ok'.
  function psOverFirm(p) {
    if (p._psoverM !== App().state.svcModel) {
      const F = SD().svcFacts(p);
      p._psover = !!F && F.sps.some(s => s.firm > 0 && s.wet >= s.firm);
      p._psoverM = App().state.svcModel;
    }
    return !!p._psover;
  }
  const FLAG_TESTS = {
    // Planning stage only: many open permits have no inspection dates in the source data.
    // SPEC 1.3: under review with no file event, permit or council item in 2+ years; never under appeal.
    stalled: p => { const s = window.PeelPhases.proposedStateOf(p); return !!s && s.state === 'stalled'; },
    // The index precomputes this per project (p.appeal); full projects fall back
    // to scanning their records — the same test either way.
    appeal: p => p.appeal ?? (p.records || []).some(r => r.kind === 'application' && DD().STATUS_SIGNALS[0][0].test(r.statusRaw || '')),
    dcwait: p => { const t = MM().timingOf(p); return t === 'y27' || t === 'y30' || t === 'y35' || t === 'y36'; },
    psover: p => psOverFirm(p),
    week: p => { const k = weekKeys(); return !!k && k.has(p.key); },
    watched: p => App().watch.has(p.key),
    est: p => MM().qualityOf(p) !== 'ok',
  };
  // Flag chips: multi-select; each chip's count is the projects passing every filter but the
  // flags (so the count shows what turning the flag on would add).
  function renderFlagChips() {
    const el = $('#flag-chips'); if (!el) return;
    const base = App().state.projects.filter(p => App().matches(p, false, false, true));
    el.innerHTML = PF.FLAG_META.map(([k, label, title]) => {
      const on = !!App().state.flags[k];
      const count = base.reduce((a, p) => a + (FLAG_TESTS[k](p) ? 1 : 0), 0);
      return `<button type="button" class="chip${on ? ' on' : ''}" data-flag="${k}" data-info="flag-${k}" aria-pressed="${on}" title="${esc(title)}">${esc(label)} <span class="n">${fmtNum(count)}</span></button>`;
    }).join('');
  }
  function toggleFlag(k) {
    if (!(k in App().state.flags)) return;
    App().state.flags[k] = !App().state.flags[k];
    App().applyFilters();
  }

  // The stage selector narrows the phases when the pick is neither the default active set
  // nor every phase (a chip then offers one tap back to all phases).
  const phaseFilterActive = () => App().state.phases.size < P.ALL_PHASES.length && !App().sameSet(App().state.phases, App().DEFAULT_PHASES());
  // Active-filter chips: everything that narrows the view, each removable. The counting basis
  // lives in the Scenario control, so it has no chip here.
  function activeFilters() {
    const out = [];
    const kindLabel = { application: 'Planning applications', permit: 'Building permits', both: 'Application + permits' };
    const unitsLabel = { 1: 'Adds units or jobs', 10: '10+ units', 50: '50+ units', 100: '100+ units', 500: '500+ units' };
    const landuseLabel = { all: 'Any land use', growth: 'Adds units or jobs', residential: 'Residential', mixed: 'Mixed use', employment: 'Employment' };
    const dwellingLabel = { single: 'Single / semi-detached', town: 'Townhouse', apartment: 'Apartment' };
    const setVal = (id, v) => { const el = $(id); if (el) el.value = v; };
    if (App().state.search) out.push({ label: `“${App().state.search}”`, clear: () => { App().state.search = ''; setVal('#f-search', ''); } });
    if (App().state.muni) out.push({ label: App().state.muni, clear: () => { App().state.muni = ''; SF().renderMuniChips(); PA().renderAreaSelects(); } });
    if (App().state.sp.length <= 3) for (const id of App().state.sp) out.push({ label: (PA().areaById.get(id) || {}).name || 'Secondary plan', clear: () => { App().state.sp = App().state.sp.filter(x => x !== id); PA().renderAreaSelects(); PA().showArea(); } });
    else out.push({ label: `${App().state.sp.length} secondary plans`, clear: () => { App().state.sp = []; PA().renderAreaSelects(); PA().showArea(); } });
    for (const k of ['mtsa', 'pz', 'dr']) if (App().state[k].length) out.push({ label: k === 'mtsa' ? (App().state[k].length === 1 ? `MTSA: ${PA().multiSummary(k)}` : PA().multiSummary(k)) : k === 'dr' && App().state[k].length === 1 ? `Drainage: ${PA().multiSummary(k)}` : PA().multiSummary(k), clear: () => { App().state[k] = []; if (MM().AREA_F[k].svc) { SD().renderSvcSelects(); SD().showSvcArea(); } else { PA().renderAreaSelects(); PA().showArea(); } } });
    if (App().state.kind !== App().DEFAULT_KIND) out.push({ label: kindLabel[App().state.kind] || 'All records', clear: () => { App().state.kind = App().DEFAULT_KIND; setVal('#f-kind', App().DEFAULT_KIND); } });
    if (App().state.minUnits) out.push({ label: unitsLabel[App().state.minUnits] || `${App().state.minUnits}+ units`, clear: () => { App().state.minUnits = 0; setVal('#f-size', '0'); } });
    if (App().state.plant) out.push({ label: SD().PLANT_SHORT[App().state.plant] || App().state.plant, clear: () => { App().state.plant = ''; setVal('#f-plant', ''); } });
    if (App().state.dwelling) out.push({ label: dwellingLabel[App().state.dwelling] || App().state.dwelling, clear: () => { App().state.dwelling = ''; setVal('#f-dwelling', ''); } });
    if (App().state.landuse !== App().DEFAULT_LANDUSE) out.push({ label: landuseLabel[App().state.landuse] || App().state.landuse, clear: () => { App().state.landuse = App().DEFAULT_LANDUSE; setVal('#f-landuse', App().DEFAULT_LANDUSE); } });
    for (const [k, label] of PF.FLAG_META) if (App().state.flags[k]) out.push({ label, clear: () => { App().state.flags[k] = false; } });
    if (phaseFilterActive()) {
      const names = P.ALL_PHASES.filter(p => App().state.phases.has(p.key)).map(p => p.label);
      out.push({ label: names.length <= 2 ? names.join(' + ') : `${names.length} phases`, clear: () => { App().state.phases = ALL_PHASE_KEYS(); } });
    }
    if (App().timeActive()) {
      const from = App().state.yearFrom ?? App().state.yearMin, to = App().state.yearTo ?? App().state.yearMax;
      out.push({ label: from === to ? `${from}` : `${from}–${to}`, clear: () => TL().setYearsSilently(App().state.yearMin, App().state.yearMax) });
    }
    if (!App().state.newOnly) out.push({ label: 'Including alterations', clear: () => { App().state.newOnly = true; const el = $('#f-new'); if (el) el.checked = true; } });
    if (App().state.lyr) out.push({ label: `Counts as ${[...App().state.lyr].map(k => (window.PeelLayerBar ? window.PeelLayerBar.LABEL[k] : k)).join(' + ')}`, clear: () => { App().state.lyr = null; } });
    return out;
  }
  let activeList = [];
  // One-line summaries on the collapsed sidebar sections.
  function renderSectionSummaries() {
    const kindLabel = { '': 'All records', permit: 'Building permits', both: 'Application + permits' };
    // Where & areas (map panel): municipality, planning and service areas.
    const areas = Object.keys(MM().AREA_F).map(k => PA().multiSummary(k, true)).filter(Boolean);
    SD().syncPanelSum();
    const more = [
      App().state.kind !== App().DEFAULT_KIND ? kindLabel[App().state.kind] : '',
      App().state.minUnits ? ((($('#f-size') || {}).selectedOptions || [])[0] || { textContent: `${App().state.minUnits}+ units` }).textContent : '',
      App().state.newOnly ? '' : 'incl. alterations'].filter(Boolean);
    const sm = $('#sum-more'); if (sm) sm.textContent = more.length ? more.join(' · ') : 'Record type, size';
    const sx = $('#sect-more'); if (sx) sx.classList.toggle('active', more.length > 0);
  }
  // The collapsed rows show their current value (SPEC §4: Where / What / When / Counts as / Flags).
  function renderRowValues() {
    const S = App().state, set = (id, t) => { const el = $(id); if (el) el.textContent = t; };
    const sel = id => { const el = $(id); return el && el.selectedOptions && el.selectedOptions[0] ? el.selectedOptions[0].textContent.toLowerCase() : ''; };
    const areas = Object.keys(MM().AREA_F).map(k => PA().multiSummary(k, true)).filter(Boolean);
    set('#fv-where', [S.muni || 'All of Peel', S.plant ? (SD().PLANT_SHORT[S.plant] || S.plant) : 'any plant', areas.length ? areas.join(', ') : 'any plan'].join(' · '));
    set('#fv-what', [S.minUnits ? sel('#f-size') : 'any size', S.dwelling ? sel('#f-dwelling') : 'any dwelling', S.landuse !== App().DEFAULT_LANDUSE ? sel('#f-landuse') : 'any land use'].join(' · ').replace(/^./, c => c.toUpperCase()));
    const from = S.yearFrom ?? S.yearMin, to = S.yearTo ?? S.yearMax;
    set('#fv-when', `${App().timeActive() ? (from === to ? `${from}` : `${from}–${to}`) : 'All years'} · ${S.yearMode === 'any' ? 'any milestone' : sel('#f-milestone')}`);
    set('#fv-counts', S.lyr ? [...S.lyr].map(k => (window.PeelLayerBar ? window.PeelLayerBar.LABEL[k] : k)).join(' + ') : 'Every layer');
    const fl = PF.FLAG_META.filter(([k]) => S.flags[k]).map(([, l]) => l);
    set('#fv-flags', fl.length ? fl.join(', ') : 'None');
    for (const [id, on] of [['#fr-where', S.muni || S.plant || areas.length], ['#fr-what', S.minUnits || S.dwelling || S.landuse !== App().DEFAULT_LANDUSE], ['#fr-when', App().timeActive() || S.yearMode !== 'any'], ['#fr-counts', !!S.lyr], ['#fr-flags', fl.length]]) { const el = $(id); if (el) el.classList.toggle('active', !!on); }
  }
  // One line saying what the map shows and why.
  function renderShowing() {
    const v = currentPhaseView();
    const what = v === 'all' ? 'developments (all phases)' : v === 'default' ? 'active and completed applications' : v === 'active' ? 'active applications' : `developments: ${P.ALL_PHASES.filter(p => App().state.phases.has(p.key)).map(p => p.label.toLowerCase()).join(', ')}`;
    const years = App().timeActive() ? (() => { const a = App().state.yearFrom ?? App().state.yearMin, b = App().state.yearTo ?? App().state.yearMax; return a === b ? `in ${a}` : `${a}–${b}`; })() : 'all years';
    const extra = activeFilters().length - (phaseFilterActive() ? 1 : 0) - (App().timeActive() ? 1 : 0) - (App().state.muni ? 1 : 0) - (App().state.search ? 1 : 0);
    // The result count first (SPEC §4), then what it is.
    $('#f-showing').innerHTML = `<span class="find-count"><b>${fmtNum(App().state.filtered.length)}</b> developments</span> <span class="muted">${esc(what)} · ${esc(years)} · ${esc(App().state.muni || 'all of Peel')}${App().state.search ? ` · matching “${esc(App().state.search)}”` : ''}${extra > 0 ? ` · ${extra} more filter${extra === 1 ? '' : 's'}` : ''}</span> · <button type="button" class="btn small link" data-area-report="shown" title="A printable report on the developments shown">Report</button>`;
  }
  function renderFilterUI() {
    renderSectionSummaries();
    renderShowing();
    renderRowValues();
    activeList = activeFilters();
    $('#active-filters').innerHTML = (activeList.length
      ? `<button type="button" class="btn small" id="f-reset">Reset ${activeList.length} filter${activeList.length === 1 ? '' : 's'}</button>` + activeList.map((f, i) => `<button type="button" class="chip on removable" data-i="${i}" title="Remove filter">${esc(f.label)} <span aria-hidden="true">×</span></button>`).join('')
      : '') + '<button type="button" class="btn small link" id="f-saveview" title="Save the filters, scope and map as a named view">+ Save this view</button>';
    renderEmptyMsg();
    DT().syncFiltersBtn();   // Phase 2 shell: the compact "Filters (n)" button label
  }
  // Reset every filter to its default. Shared by the "Reset all" chip and the
  // topbar's Peel trail step.
  function resetAllFilters() {
    Object.assign(App().state, { muni: '', sp: [], mtsa: [], pz: [], dr: [], ss: null, lyr: null, kind: App().DEFAULT_KIND, search: '', minUnits: 0, newOnly: true, phases: App().DEFAULT_PHASES(), flags: App().DEFAULT_FLAGS(), plant: '', dwelling: '', landuse: App().DEFAULT_LANDUSE, basis: App().DEFAULT_BASIS, yearMode: 'any' });
    MA().setCapYear(MM().THIS_YEAR);
    SF().syncFilterControls();
    SF().renderMuniChips();
    TL().setDefaultYears();
    App().applyFilters();
  }
  $('#active-filters').onclick = e => {
    if (e.target.closest('#f-reset')) { resetAllFilters(); return; }
    if (e.target.closest('#f-saveview')) { MA().saveCurrentView(); return; }
    const b = e.target.closest('[data-i]'); if (!b) return;
    activeList[+b.dataset.i].clear();
    App().applyFilters();
  };
  // Empty results: name the one filter whose removal alone restores results, with a button
  // that removes it. Each active filter is tried on its own against a snapshot of the state.
  let emptyBlocker = null;
  function snapshotFilterState() {
    return { phases: new Set(App().state.phases), muni: App().state.muni, sp: [...App().state.sp], mtsa: [...App().state.mtsa], pz: [...App().state.pz], dr: [...App().state.dr], kind: App().state.kind, search: App().state.search, minUnits: App().state.minUnits, newOnly: App().state.newOnly, flags: { ...App().state.flags }, plant: App().state.plant, dwelling: App().state.dwelling, landuse: App().state.landuse, basis: App().state.basis, yearMode: App().state.yearMode, yearFrom: App().state.yearFrom, yearTo: App().state.yearTo };
  }
  function restoreFilterState(s) {
    Object.assign(App().state, { ...s, phases: new Set(s.phases), flags: { ...s.flags }, sp: [...s.sp], mtsa: [...s.mtsa], pz: [...s.pz], dr: [...s.dr] });
  }
  function findBlockingFilter() {
    const saved = snapshotFilterState();
    for (const f of activeList) {
      f.clear();
      const ok = App().state.projects.some(p => App().matches(p, false, false, false));
      restoreFilterState(saved);
      if (ok) { emptyBlocker = f; return f; }
    }
    emptyBlocker = null;
    return null;
  }
  function renderEmptyMsg() {
    const em = $('#empty-msg'); if (!em) return;
    if (App().state.filtered.length === 0 && activeList.length) {
      const blocker = findBlockingFilter();
      if (blocker) {
        em.innerHTML = `No developments match — try removing <button type="button" class="btn small link" data-empty-clear="1">${esc(blocker.label)}</button>.`;
        em.hidden = false;
        return;
      }
    }
    emptyBlocker = null;
    em.hidden = true; em.innerHTML = '';
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-empty-clear]'); if (!b || !emptyBlocker) return;
    const c = emptyBlocker; emptyBlocker = null; c.clear(); App().applyFilters();
  });

  const api = {
    FLAG_TESTS, ALL_PHASE_KEYS, PLANNING_PHASES, YEAR_MS, appUnits, renderFlagChips,
    toggleFlag, activeFilters, renderFilterUI, resetAllFilters, renderEmptyMsg,
    currentPhaseView,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelFilterUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
