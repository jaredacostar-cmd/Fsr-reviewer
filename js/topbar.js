(function (root) {
  'use strict';
  const { $, esc, store, fmtNum, toast } = window.PeelUtil;
  const PD = window.PeelDesign;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const MA = () => window.PeelMapAnalysis;
  const Tips = () => window.PeelTips;
  const Nav = () => window.PeelDevNav;
  const AS = () => window.PeelAreaSelect;
  const Meas = () => window.PeelMeasure;
  const SvcTab = () => window.PeelSvcTab;
  const RP = () => window.PeelReports;
  const PE = () => window.PeelExports;
  const SC = () => window.PeelSewerCap;
  const DCT = () => window.PeelDcaTab;
  const TS = () => window.PeelToolScope;
  const PA = () => window.PeelPlanAreas;
  const SD = () => window.PeelSvcData;
  const FI = () => window.PeelFilterUI;
  const AT = () => window.PeelAnalysisTabs;
  const Sh = () => window.PeelShare;

  // ---- Top bar: scope trail with its count, lens switch, scenario chip, menus ----------------
  // Lens switch (SPEC §4): one button per MAP_VIEWS entry. A lens sets the map's layer preset, marker
  // encoding and legend, and the one System control (js/analysis-tabs.js setSys) to what its map
  // shows; Capital, Water and Wastewater also open their tab (the owner's change of 2026-10-16, kept:
  // navigation-design §9 #9). syncMapOpts() toggles .on on every [data-mview], so this stays in sync
  // with the map control.
  function renderViewSwitch() {
    const el = $('#tb-views'); if (!el) return;
    el.innerHTML = MM().MAP_VIEWS.map(([k, t]) => `<button type="button" class="btn small" data-mview="${k}" title="${t} lens: the map's layers, marker colours and legend">${PD.icon(k)}<span>${t}</span></button>`).join('');
    MA().syncMapOpts();
  }
  // On a phone the switch shows the current view only: a tap opens the other three, a pick closes it.
  const phone = () => matchMedia('(max-width: 700px)').matches;
  $('#tb-views').addEventListener('click', e => {
    const b = e.target.closest('[data-mview]'); if (!b) return;
    const v = $('#tb-views');
    if (phone() && b.classList.contains('on') && !v.classList.contains('open')) { v.classList.add('open'); return; }
    v.classList.remove('open');
    MA().setMapView(b.dataset.mview);
    // (only a lens tap sets the System: a workspace or a page calling setMapView leaves it; Planning too)
    const sy = AT() && AT().SYS_OF_VIEW ? AT().SYS_OF_VIEW[b.dataset.mview] : null; if (sy && AT().setSys) AT().setSys(sy);
    // Bundle 6: a view opens its tab (picking Capital used to leave Overview open): Capital → Capital,
    // Water and Wastewater → Servicing; Planning keeps the tab you are on.
    const tab = { dc: 'dca', water: 'svc', wastewater: 'svc' }[b.dataset.mview];
    if (tab && AT() && AT().openTab) AT().openTab(tab);
  });
  // Phones: Export, Present, Help and Settings in one ⋯ menu.
  const more = $('#tb-more'), acts = $('#tb-actions');
  if (more && acts) {
    const setMore = o => { acts.classList.toggle('open', o); more.setAttribute('aria-expanded', String(o)); };
    more.addEventListener('click', e => { e.stopPropagation(); setMore(!acts.classList.contains('open')); });
    // (a pick inside it, or a tap elsewhere, folds it; a sub-menu it opens stays until its own pick)
    document.addEventListener('click', e => { if (acts.classList.contains('open') && !e.target.closest('#tb-actions')) setMore(false); });
    acts.addEventListener('click', e => { if (e.target.closest('[role="menuitem"], #tb-help, #tb-restart')) setMore(false); });
  }

  // Scope trail: Peel › municipality › area › development. Only the active steps show;
  // the development step is there while its panel is open, and reopens it.
  function trailArea() {
    const kinds = ['sp', 'mtsa', 'pz', 'dr'];
    const total = kinds.reduce((t, k) => t + App().state[k].length, 0);
    if (!total) return null;
    const kind = kinds.find(k => App().state[k].length);
    return { kind, id: App().state[kind][0], label: PA().areaName(kind, App().state[kind][0]) + (total > 1 ? ` +${total - 1}` : '') };
  }
  // Phase 3: the "Peel" trail step also clears the dev scope.
  // The Peel crumb only navigates: back to all of Peel (no municipality, area, servicing step,
  // development or tool result); the filters stay. Start over clears them.
  function goPeel() {
    if (window.PeelSvcScope) window.PeelSvcScope.clear();
    if (typeof DevScope !== 'undefined') DevScope.close();
    if (typeof PeelTools !== 'undefined' && PeelTools.closeResult) PeelTools.closeResult();
    Object.assign(App().state, { muni: '', sp: [], mtsa: [], pz: [], dr: [] });
    if (window.PeelSearchFilter && window.PeelSearchFilter.renderMuniChips) window.PeelSearchFilter.renderMuniChips();
    PA().renderAreaSelects(); SD().renderSvcSelects(); PA().showArea(); SD().showSvcArea();
    AS().clearSelected();
    App().applyFilters();
  }
  const trailGoPeel = goPeel;
  // Start over (top bar): every filter, the search, the selection, the development, the scope and any
  // tool result cleared, and back to Home. The map view (lens), the scenario and the capacity year
  // stay: they are settings, not where you are.
  function startOver() {
    closeTbMenus();
    if (root.PeelPanel && root.PeelPanel.isFull && root.PeelPanel.isFull()) root.PeelPanel.closeFull();
    if (window.PeelSvcScope) window.PeelSvcScope.clear();
    if (typeof DevScope !== 'undefined') DevScope.close();
    if (typeof PeelTools !== 'undefined' && PeelTools.closeResult) PeelTools.closeResult();
    AS().clearSelected();
    const box = $('#f-search'); if (box) box.value = '';
    const sug = $('#search-sug'); if (sug) sug.hidden = true;
    FI().resetAllFilters();
    // (Home at its Overview, navigation phase 6: Home hosts the map's tabs, and opens on the briefing)
    if (root.PeelWorkspaces && root.PeelWorkspaces.openPage) root.PeelWorkspaces.openPage('home');
    if (toast) toast('Started over: filters, search and selection cleared. The map view and scenario stay.');
  }
  // The place's steps (navigation phase 6: the drill is the filter, so the trail is the way up). An area step: that
  // area alone the filter, the levels under it gone (the municipality and the other filters stay).
  function setArea(kind, id) {
    const S = App().state; S.sp = []; S.mtsa = []; S.pz = []; S.dr = [];
    if (kind) S[kind] = [id];
    PA().renderAreaSelects(); SD().renderSvcSelects();
    PA().showArea(); SD().showSvcArea(); PA().renderPlanAreas();
    AS().clearSelected();
    App().applyFilters();
  }
  // The municipality's step is the whole of it: the plan, MTSA, zone and block filters go, the others stay. (It
  // clicked the filter panel's chip, which keeps a plan of the same municipality: a drilled plan had no way up.)
  function trailGoMuni() {
    if (!App().state.muni) return;
    setArea(null);
  }
  function trailGoArea() {
    const a = trailArea(); if (!a) return;
    setArea(a.kind, a.id);
  }
  // A level of the plan tree by its name (a sub-area the filter panel does not list, by the tree's).
  function areaLabel(id) {
    const PT = window.PeelPlanTables;
    return PA().areaName('sp', id) || ((PT && PT.areas ? PT.areas() : []).find(a => a.id === id) || {}).name || id;
  }
  // The filters on besides the place (the place is the steps): the trail's "k filters", each removable.
  const otherFilters = () => (FI() && FI().activeFilters ? FI().activeFilters().filter(f => !f.scope) : []);
  let filtersOpen = false;
  // (a page follows at once, as it did with its own row of chips)
  const pageFollows = () => { const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.renderPage) W.renderPage(true); };
  function clearOthers() {
    const fl = otherFilters(); filtersOpen = false;
    if (!fl.length) { renderTrail(); return; }
    fl.forEach(f => f.clear()); App().applyFilters(); pageFollows();
  }
  function trailGoDev() { if (Nav().getCurrentProject()) Nav().showDetail(Nav().getCurrentProject()); }
  function renderTrail() {
    const el = $('#trail'); if (!el) return;
    const steps = [{ label: 'Peel', go: trailGoPeel, title: 'All of Peel: closes the development, the area and the selection (the filters stay; Start over clears them)' }];
    if (App().state.muni) steps.push({ label: App().state.muni, go: trailGoMuni, title: `All of ${App().state.muni} (the plan and area filters go; the others stay)` });
    const a = trailArea();
    // (one plan filter: its place in the plan tree first, Peel › Brampton › Bram West › Precinct 40-3, each step that
    // level as the filter: navigation phase 6)
    const PT = window.PeelPlanTables, up = a && a.kind === 'sp' && App().state.sp.length === 1 && PT && PT.areaPath ? PT.areaPath(a.id).slice(0, -1) : [];
    for (const id of up) { const nm = areaLabel(id); steps.push({ label: nm, go: () => setArea('sp', id), title: `All of ${nm} (the level under it goes; the other filters stay)` }); }
    if (a) steps.push({ label: a.label, go: trailGoArea, title: 'Filter to this area only' });
    // Phase 3: the development step follows the dev scope, not the #detail panel. A result started at
    // the development (the Inquiry draft) keeps it: Peel › the site › the result, the site step closing
    // the result (reopening the site would drop the result unannounced). Else it follows the ladder.
    const SS = window.PeelSvcScope, scoped = typeof DevScope !== 'undefined' ? DevScope.current() : null, kept = !!(scoped && SS && SS.keepsDev && SS.keepsDev());
    const devStep = scoped && (kept ? { label: scoped.title || 'Development', go: () => SS.closeResult(), title: `Back to ${scoped.title || 'the development'}` } : { label: scoped.title || 'Development', go: trailGoDev, title: 'Reopen this development' });
    if (kept) steps.push(devStep);
    // Servicing ladder (plant › block / station; water system › zone): one step per rung.
    if (window.PeelSvcScope) steps.push(...window.PeelSvcScope.crumbs());
    if (scoped && !kept) steps.push(devStep);
    // Phase 3b: a tool result scope adds its own crumb (Peel › Lasso selection).
    const tc = (typeof PeelTools !== 'undefined' && PeelTools.trailCrumb) ? PeelTools.trailCrumb() : null;
    if (tc) steps.push(...[].concat(tc));
    // The trail carries its count (SPEC §4), and owns it (bundle 6): at a development, that site's
    // homes (the map's 1,956 belong to Peel, not to the site); else the developments in scope.
    // (a plan filter: the units inside it, by share, as the Overview and Growth in an area count them)
    const set = App().state.filtered || [], ins = App().state.sp.length && window.PeelPlanTables && window.PeelPlanTables.inside ? window.PeelPlanTables.inside() : null;
    const units = ins && ins.found ? ins.planned : window.Growth ? window.Growth.pipelineTotals(set).planned : 0;
    const devU = scoped && window.Growth ? window.Growth.pipelineTotals([scoped]).planned : 0;
    const count = scoped ? `<span class="tb-count" title="This development's planned homes">· ${fmtNum(Math.round(devU))} home${Math.round(devU) === 1 ? '' : 's'} planned</span>`
      : `<span class="tb-count" title="Developments in scope and their planned units">· ${fmtNum(set.length)} development${set.length === 1 ? '' : 's'}${units > 0 ? ` · ${fmtNum(Math.round(units))} units` : ''}</span>`;
    // The tree counts didn't load: the units are counted from the files and permits (the fallback),
    // so the total differs. Say so.
    const TC = window.PeelTreeCounts;
    const warn = TC && TC.status === 'failed'
      ? ' <span class="tb-count-warn" role="status" title="The tree counts (data/tree-counts.json) did not load, so each development is counted from its files and permits, and the total differs from the usual one.">· tree counts didn\u2019t load: counted from the files and permits <button type="button" class="btn small link" data-tb-reload>Reload</button></span>' : '';
    // Then the other filters on (navigation phase 6: the pages' "Filters on" row and the workspace bar's, one trail
    // on the pages and the map): "k filters" opens them in a popover, each removable, Reset all and the older-link
    // note; × clears the k (the place stays: it is the steps). A phone: one 44 px button, the funnel and the count.
    const fl = otherFilters(), k = fl.length, old = FI() && FI().oldLinkNote ? FI().oldLinkNote() : '', ks = `${k} filter${k === 1 ? '' : 's'}`;
    if (!k && !old) filtersOpen = false;
    const flHTML = k || old ? `<span class="tb-fl-wrap"><button type="button" class="tb-fl" data-tb-filters aria-expanded="${filtersOpen}" aria-controls="tb-fl-pop" aria-label="${k ? ks : 'Opened from an older link'}" title="${k ? 'The filters on besides the place: each one, Reset all' : 'Opened from an older link: Completed is hidden'}">${PD.icon('filter')}${k ? `<span class="tb-fl-n">${k}</span><span class="tb-fl-w"> filter${k === 1 ? '' : 's'}</span>` : '<span class="tb-fl-w">Older link</span>'}</button>`
      + `${k ? `<button type="button" class="tb-fl tb-fl-x" data-tb-filters-x aria-label="Clear the ${ks}" title="Clear these filters (the place stays)">×</button>` : ''}</span>` : '';
    el.innerHTML = steps.map((s, i) => `${i ? '<span class="tb-sep" aria-hidden="true">›</span>' : ''}<button type="button" class="tb-step" data-i="${i}" title="${esc(s.title)}">${esc(s.label)}</button>`).join('')
      + count + flHTML + warn;
    el._steps = steps;
    // (a phone: a deep place, Peel › Brampton › 48 (b) › Precinct 48-1, scrolls sideways in the trail's own box, its
    // steps whole: the place, the last step, in sight beside the filters button; css/app.css)
    if (el.scrollWidth > el.clientWidth && window.matchMedia && window.matchMedia('(max-width: 700px)').matches) el.scrollLeft = el.scrollWidth;
    const pop = $('#tb-fl-pop');
    if (pop) {
      pop.hidden = !filtersOpen;
      pop.innerHTML = !filtersOpen ? '' : `<div class="page-filters small" role="group" aria-label="Filters on">${k ? `<span class="muted">Filters on:</span> ${fl.map((f, i) => `<button type="button" class="chip on removable" data-pf-i="${i}" title="Remove this filter">${esc(f.label)} <span aria-hidden="true">×</span></button>`).join('')}`
        + `<button type="button" class="btn small link" data-tb-filters-x title="The place stays">Clear ${k === 1 ? 'it' : `these ${k}`}</button><button type="button" class="btn small link" data-pf-reset title="Every filter back to its default, the place and the search too">Reset all</button>` : ''}${old}</div>`;
      placeFlPop(pop);
    }
    if (window.PeelSvcScope) window.PeelSvcScope.peelWideNote();
  }
  // The popover under its button (a phone: the top bar's width, as the scenario's).
  function placeFlPop(pop) {
    pop.style.left = '';
    const b = $('#trail [data-tb-filters]'), tb = $('#topbar'); if (pop.hidden || !b || !tb || phone()) return;
    const x = b.getBoundingClientRect().left - tb.getBoundingClientRect().left;
    pop.style.left = `${Math.max(8, Math.min(x, tb.clientWidth - pop.offsetWidth - 8))}px`;
  }
  $('#trail').addEventListener('click', e => {
    if (e.target.closest('[data-tb-reload]')) { location.reload(); return; }
    if (e.target.closest('[data-tb-filters]')) { filtersOpen = !filtersOpen; renderTrail(); return; }
    if (e.target.closest('[data-tb-filters-x]')) { clearOthers(); return; }
    const b = e.target.closest('[data-i]'); if (!b) return;
    const s = ($('#trail')._steps || [])[+b.dataset.i];
    if (filtersOpen) { filtersOpen = false; renderTrail(); }
    if (s) s.go();
  });
  // The popover's chips (data-pf-i indexes the list it shows, the place left out), Clear, Reset all (every filter,
  // the place too: the old row's Reset) and the older link's Include Completed.
  { const pop = $('#tb-fl-pop'); if (pop) pop.addEventListener('click', e => {
    const F = FI(); if (!F) return;
    if (e.target.closest('[data-include-completed]')) { F.includeCompleted(); pageFollows(); return; }
    if (e.target.closest('[data-tb-filters-x]')) { clearOthers(); return; }
    if (e.target.closest('[data-pf-reset]')) { filtersOpen = false; F.resetAllFilters(); pageFollows(); return; }
    const c = e.target.closest('[data-pf-i]'); if (!c) return;
    const f = otherFilters()[+c.dataset.pfI]; if (f) { f.clear(); App().applyFilters(); pageFollows(); }
  }); }

  // Scenario chip: a one-line summary plus a "modified" badge when criteria differ
  // from Peel defaults (criteriaChanges() is the existing detection). Clicking opens
  // a popover that holds the real #scen-bar node (moved, not duplicated); closing
  // puts the node back where it was. renderScenario() calls renderTbScen(), so the
  // chip follows every scenario change.
  const BASIS_SHORT = { all: 'all units', buildout: 'units applied for', committed: 'committed units', remaining: 'units left to build' };
  // The scenario's settings, as the chip shows them (also the panels' read-only chip: js/panel.js).
  function scenParts() {
    const n = SvcTab().criteriaChanges().length, o = SvcTab().svcOpt, SPl = root.PeelSvcPlants, MA = root.PeelMapAnalysis;
    const R = App().state.reports, LB = root.PeelLayerBar;
    const p = {
      basis: App().state.basis,
      count: LB.countLabel(App().state.basis),
      flows: o.ww === 'calibrated' ? '2025 metered' : 'design',
      criteria: n ? `${n} modified` : 'Peel v2.0',
      unitCount: root.PeelTreeCounts ? root.PeelTreeCounts.label() : 'tree count',
      expansions: App().state.dcInfra && SPl && SPl.hz ? (SPl.hz.exp ? 'on' : 'off') : null,
      outside: o.nr === 'on' ? 'nearest' : 'left out',
      md: o.md, div: R && R.wastewater && R.wastewater.diversion ? o.div : null,
      year: MA && MA.getCapYear ? MA.getCapYear() : null, yearDefault: root.PeelMapMarkers ? root.PeelMapMarkers.THIS_YEAR : null,
      loads: (() => { const MMk = root.PeelMapMarkers, wl = MMk && MMk.getWwLay ? MMk.getWwLay() : null; if (!wl) return null; const on = [['built', 'built'], ['approved', 'committed'], ['proposed', 'in review']].filter(([k]) => wl[k] !== false).map(x => x[1]); return on.length === 3 ? 'every stage' : on.length ? `${on.join(' + ')} only (Stage filter)` : 'none (Stage filter)'; })(),
    };
    // Bundle 5: every setting with its default (the chip's "Default" / "n changes", the control's list).
    p.settings = LB.scenarioSettings({ ...p, criteria: n, count: p.unitCount });
    p.text = LB.scenarioChipText(p.settings);
    return p;
  }
  function renderTbScen() {
    const chip = $('#tb-scen'); if (!chip) return;
    // The scenario chip: "Default" or "n changes", the full settings on hover and in the popover.
    const sp = scenParts();
    const open = !$('#tb-scen-pop').hidden;
    chip.innerHTML = root.PeelLayerBar.scenarioChipHTML({ ...sp, criteria: SvcTab().criteriaChanges().length, count: sp.unitCount });
    const more = chip.querySelector('[data-scen-open]'); if (more) more.setAttribute('aria-expanded', String(open));
  }
  let scenHome = null;
  // A control outside the top bar (a panel's Scenario chip, a guide) can open the popover: the
  // outside-click below must not close it in that same click.
  let scenJustOpened = false;
  function openScenPop() {
    scenJustOpened = true; setTimeout(() => { scenJustOpened = false; }, 0);
    const bar = $('#scen-bar'), pop = $('#tb-scen-pop'); if (!bar || !pop) return;
    if (!scenHome) { scenHome = document.createComment('scen-bar home'); bar.replaceWith(scenHome); }
    if (bar.parentNode !== pop) pop.appendChild(bar);
    pop.hidden = false;
    { const m = $('#tb-scen [data-scen-open]'); if (m) m.setAttribute('aria-expanded', 'true'); }
    SvcTab().renderScenario();
  }
  function closeScenPop() {
    const bar = $('#scen-bar'), pop = $('#tb-scen-pop'); if (!bar || !pop || pop.hidden) return;
    pop.hidden = true;
    { const m = $('#tb-scen [data-scen-open]'); if (m) m.setAttribute('aria-expanded', 'false'); }
    if (scenHome && scenHome.parentNode) { scenHome.parentNode.replaceChild(bar, scenHome); scenHome = null; }
  }
  // The chip is read-only (Stage 1 #6): a click opens the Scenario control, where the count is set.
  $('#tb-scen').addEventListener('click', e => {
    if (e.target.closest('[data-scen-open]')) { $('#tb-scen-pop').hidden ? openScenPop() : closeScenPop(); }
  });

  // Menus. Items carrying data-export / data-share / data-area-report are handled by
  // the existing document-level handlers; the rest use data-tbx (export) / data-tbg
  // (gear). The list-panel export actions are named functions, so the menu keeps
  // working after the Export row itself is removed.
  // Phase 3b: "Inquiry response draft" export item. Drafts a response for the open
  // development via js/tools-inquiry.js (sibling worker C); guarded so the menu still
  // works before that module loads. The same function is a development's Inquiry draft
  // action ([data-inquiry]: its header, on every tab and its page), one result either way (AD-13):
  // on the map's Overview, the development kept, its Copy button tools-inquiry's own.
  function draftInquiryResponse() {
    // (on a page the panel hosts are empty: the draft opens on the map, with its way back)
    const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.setMode) W.setMode('full');
    const I = (typeof window !== 'undefined') ? window.PeelToolInquiry : null;
    const p = (typeof DevScope !== 'undefined' && DevScope.current) ? DevScope.current() : null;
    if (!I || typeof I.draftForDevelopment !== 'function') {
      if (Meas().hasTools()) PeelTools.openResult({ title: 'Inquiry response draft', html: '<p class="small muted">The inquiry module has not loaded yet — try again in a moment.</p>' });
      return;
    }
    if (p) { I.draftForDevelopment(p); return; }
    if (Meas().hasTools()) {
      PeelTools.openResult({ title: 'Inquiry response draft', html: `<p>Open a development first, then draft its inquiry response.</p>
        <p><button type="button" class="btn small" id="inq-inspect">Use Inspect point</button> <span class="muted small">— or draft one for any point on the map.</span></p>` });
      const b = document.getElementById('inq-inspect');
      if (b) b.addEventListener('click', () => Meas().setTool('inspect'));
    }
  }
  function renderExportMenu() {
    const m = $('#tb-export-menu'); if (!m) return;
    // Comparison PDF (Worker C exposes window.comparisonPDF): disabled until the
    // module is loaded and there is something to compare \u2014 a pinned scenario A
    // or items in the Compare column.
    const cmpFn = typeof RP().comparisonPDF === 'function' ? RP().comparisonPDF : null;
    let cmpEmpty = true;
    if (cmpFn) {
      let n = 0;
      try { const T = window.PeelToolCompare; if (T && typeof T._items === 'function') n = T._items().length; } catch (e) { /* compare tool not loaded */ }
      cmpEmpty = !store.get('scenA', null) && !n;
    }
    const cmpOk = !!(cmpFn && !cmpEmpty);
    const cmpTitle = cmpFn ? 'Nothing to compare yet \u2014 pin a scenario as A or add developments to Compare' : 'The comparison PDF is not available yet';
    // SWMM model download (was a per-panel export-bar button): needs the wastewater servicing data.
    const swmmOk = !!(App().state.svcModel && App().state.servicing && App().state.servicing.blocks);
    m.innerHTML =
      '<button type="button" role="menuitem" data-tbx="csv">CSV \u2014 developments shown</button>' +
      '<button type="button" role="menuitem" data-tbx="geojson">GeoJSON \u2014 developments shown</button>' +
      '<button type="button" role="menuitem" data-tbx="areas">Servicing areas (GeoJSON)</button>' +
      '<button type="button" role="menuitem" data-tbx="dc">Planned works (GeoJSON)</button>' +
      // Capital projects only once the layer is published (held until Peel GIS confirms).
      (window.PeelCapitalEA && window.PeelCapitalEA.data.capital ? '<button type="button" role="menuitem" data-tbx="cons">Capital projects (GeoJSON)</button>' : '') +
      '<button type="button" role="menuitem" data-tbx="eas">Environmental assessments (GeoJSON)</button>' +
      '<button type="button" role="menuitem" data-tbx="shp">Shapefiles (.zip) \u2014 all map layers, for ArcMap / ArcGIS Pro</button>' +
      `<button type="button" role="menuitem" data-tbx="swmm"${swmmOk ? '' : ' disabled title="The wastewater servicing data is not loaded yet"'}>SWMM model (.inp) \u2014 wastewater blocks</button>` +
      '<button type="button" role="menuitem" data-tbx="workbook">Excel workbook (.xlsx)</button>' +
      // (the pipeline ledger's rows in the annual snapshot's template: js/ledger-snapshot.js)
      '<button type="button" role="menuitem" data-tbx="ledger">Pipeline snapshot (CSV)</button>' +
      `<button type="button" role="menuitem" data-tbx="comparepdf"${cmpOk ? '' : ` disabled title="${cmpTitle}"`}>PDF \u2014 comparison</button>` +
      '<button type="button" role="menuitem" data-tbx="brief">PDF \u2014 executive briefing</button>' +
      `<button type="button" role="menuitem" data-tbx="memo"${Nav().getCurrentProject() ? '' : ' disabled'}>PDF \u2014 servicing memo</button>` +
      '<button type="button" role="menuitem" data-area-report="shown">PDF \u2014 area report</button>' +
      '<button type="button" role="menuitem" data-tbx="print">Print map</button>' +
      '<hr>' +
      '<button type="button" role="menuitem" data-tbx="inquiry">Inquiry response draft</button>' +
      '<button type="button" role="menuitem" data-share>Copy share link</button>' +
      '<button type="button" role="menuitem" data-tbx="saveview">Save this view…</button>';
  }
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-inquiry]')) draftInquiryResponse(); });
  $('#tb-export-menu').addEventListener('click', e => {
    const item = e.target.closest('[role="menuitem"]'); if (!item || item.disabled) return;
    closeTbMenus();
    const b = e.target.closest('[data-tbx]'); if (!b) return;
    const fn = { saveview: () => MA().saveCurrentView(), csv: PE().exportDevsCSV, geojson: PE().exportDevsGeoJSON, areas: PE().exportAreasGeoJSON, shp: PE().exportShapefiles, dc: DCT().exportDcGeoJSON, cons: () => window.PeelCapitalEA && window.PeelCapitalEA.exportConsGeoJSON(), eas: () => window.PeelCapitalEA && window.PeelCapitalEA.exportEasGeoJSON(), swmm: SC().exportSwmmModel, workbook: PE().exportWorkbook, ledger: () => window.PeelLedgerUI && window.PeelLedgerUI.exportSnapshotCSV(), print: TS().printMap, brief: RP().briefingPDF, memo: () => { if (Nav().getCurrentProject()) RP().devMemo(Nav().getCurrentProject()); }, comparepdf: () => { if (typeof RP().comparisonPDF === 'function') RP().comparisonPDF(); }, inquiry: draftInquiryResponse }[b.dataset.tbx];
    if (fn) fn();
  });
  function renderGearMenu() {
    const m = $('#tb-gear-menu'); if (!m) return;
    m.innerHTML =
      '<button type="button" role="menuitem" data-tbg="settings">Settings</button>' +
      // Stage 2: Records (Sources · Data checks · Files) took the Sources & checks page's place;
      // navigation phase 2 retired the page.
      '<button type="button" role="menuitem" data-tbg="labs">Labs</button>' +
      '<button type="button" role="menuitem" data-tbg="log">Change log</button>';
  }
  // Gear menu pages (Phase 4): workers register page renderers on window.GearPages:
  // Settings and Labs. openGearPage renders the page into the gear menu, which stays
  // open on the page. A renderer may return an HTML string, a Node, or fill the
  // container element itself.
  window.GearPages = window.GearPages || {};
  function openGearPage(name) {
    const m = $('#tb-gear-menu'); if (!m) return;
    closeTbMenus();
    const page = window.GearPages[name];
    let out;
    try { out = typeof page === 'function' ? page() : undefined; } catch (e) { out = undefined; }
    m.innerHTML = '';
    if (typeof out === 'string') m.innerHTML = out;
    else if (out instanceof Node) m.appendChild(out);
    else if (typeof page === 'function') page(m);
    else m.innerHTML = '<p class="small muted">That page is not available yet — try again in a moment.</p>';
    m.hidden = false;
    const gb = $('#tb-gear'); if (gb) gb.setAttribute('aria-expanded', 'true');
  }
  window.openGearPage = openGearPage;
  $('#tb-gear-menu').addEventListener('click', e => {
    const b = e.target.closest('[data-tbg]'); if (!b) return;
    const k = b.dataset.tbg;
    // Phase 4: the Settings & sources and Change log tabs are gone: Settings is a gear page
    // (the criteria editor lives in the scenario bar now) and the change log is in the Help
    // menu. (Navigation phase 2: the Sources & checks page is gone, its parts in Records.)
    if (k === 'settings') openGearPage('settings');
    else if (k === 'log') { closeTbMenus(); Tips().showHelpLog(); }
    // Stage 2: Records is the panel's trailing tab; Labs holds the extra tools.
    else if (k === 'labs') openGearPage('labs');
  });
  function closeTbMenus() {
    for (const id of ['#tb-export-menu', '#tb-gear-menu', '#tb-present-menu']) { const m = $(id); if (m) m.hidden = true; }
    for (const id of ['#tb-export', '#tb-gear', '#tb-present']) { const b = $(id); if (b) b.setAttribute('aria-expanded', 'false'); }
  }
  function toggleTbMenu(btnId, menuId) {
    const m = $(menuId); if (!m) return;
    const willOpen = m.hidden;
    closeTbMenus(); closeScenPop();
    if (!willOpen) return;
    if (btnId === '#tb-export') renderExportMenu(); else if (btnId === '#tb-gear') renderGearMenu();
    m.hidden = false;
    $(btnId).setAttribute('aria-expanded', 'true');
  }
  $('#tb-export').addEventListener('click', e => { e.stopPropagation(); toggleTbMenu('#tb-export', '#tb-export-menu'); });
  { const so = $('#tb-restart'); if (so) so.addEventListener('click', startOver); }
  $('#tb-gear').addEventListener('click', e => { e.stopPropagation(); toggleTbMenu('#tb-gear', '#tb-gear-menu'); });
  // Outside a menu closes it. The click's path is read as it was dispatched: a menu item that
  // opens a page (Settings, Labs) is replaced by the page, so the clicked element
  // is no longer in the document and e.target.closest() would find no menu.
  document.addEventListener('click', e => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const inside = sel => path.some(n => n && n.matches && n.matches(sel)) || !!(e.target.closest && e.target.closest(sel));
    if (!inside('.tb-wrap')) closeTbMenus();
    if (!inside('.tb-scen-wrap') && !scenJustOpened) closeScenPop();
    if (filtersOpen && !inside('#tb-fl-pop') && !inside('.tb-fl-wrap')) { filtersOpen = false; renderTrail(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && filtersOpen) { filtersOpen = false; renderTrail(); } });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { if (['#tb-export-menu', '#tb-gear-menu', '#tb-present-menu', '#tb-scen-pop'].some(id => { const m = $(id); return m && !m.hidden; })) e.preventDefault(); closeTbMenus(); closeScenPop(); if (typeof PeelTools !== 'undefined' && PeelTools.escape) PeelTools.escape(); } });

  // Present toggles the existing presentation mode; the button follows its state.
  function syncPresentBtn() {
    const b = $('#tb-present'); if (!b) return;
    const on = AS().inPresentation();
    b.setAttribute('aria-pressed', String(on));
    b.classList.toggle('on', on);
  }
  // Present ▾ (design audit, Group 7): Present and Time-lapse in one menu.
  $('#tb-present').addEventListener('click', e => { e.stopPropagation(); toggleTbMenu('#tb-present', '#tb-present-menu'); });
  $('#tb-present-go').addEventListener('click', () => { closeTbMenus(); if (AS().inPresentation()) AS().exitPresentation(); else AS().enterPresentation(); syncPresentBtn(); });
  $('#tb-timelapse').addEventListener('click', () => closeTbMenus());
  document.addEventListener('fullscreenchange', syncPresentBtn);

  // Search sits in the top bar on wide screens, so it is always reachable (design audit, Group 7);
  // on narrower screens it stays at the top of the Explore panel. The node moves: one search box. On a
  // page it is in the page's header at every width, so the top-bar slot hides (the slot is the map's).
  function placeSearch() {
    const box = $('#search-box'), slot = $('#tb-search'), home = document.querySelector('#tab-explore .search-bar'); if (!box || !slot || !home) return;
    if (document.documentElement.classList.contains('ws-mode')) { slot.hidden = true; return; }   // a workspace keeps it over the map
    if (document.documentElement.classList.contains('home-on') && box.closest('#page-search')) { slot.hidden = true; return; }   // a page keeps it, at every width
    const wide = matchMedia('(min-width: 1600px)').matches;
    if (wide && box.parentElement !== slot) slot.appendChild(box);
    else if (!wide && box.parentElement !== home) home.insertBefore(box, home.firstChild);
    slot.hidden = !wide;
  }
  function initTopbar() {
    if (!$('#topbar')) return;
    placeSearch(); matchMedia('(min-width: 1600px)').addEventListener('change', placeSearch);
    { const so = $('#tb-restart'); if (so) so.insertAdjacentHTML('afterbegin', PD.icon('restart')); }
    $('#tb-export').insertAdjacentHTML('afterbegin', PD.icon('export'));
    $('#tb-present').insertAdjacentHTML('afterbegin', PD.icon('present'));
    $('#tb-present-go').insertAdjacentHTML('afterbegin', PD.icon('present'));
    $('#tb-help').insertAdjacentHTML('afterbegin', PD.icon('tips'));
    $('#tb-gear').innerHTML = PD.icon('settings');
    renderViewSwitch();
    renderTrail();
    renderTbScen();
    syncPresentBtn();
  }
  // initTopbar() is deferred: app.js calls PeelTopbar.initTopbar() after window.PeelApp exists.


  const api = {
    initTopbar, startOver, goPeel,
    placeSearch,
    renderTrail,
    renderViewSwitch,
    renderTbScen,
    openScenPop,
    closeScenPop,
    scenParts,
    openGearPage,
    renderExportMenu,
    renderGearMenu,
    draftInquiryResponse,
    initTopbar,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTopbar = api;
})(typeof window !== 'undefined' ? window : globalThis);
