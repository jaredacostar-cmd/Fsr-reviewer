(function (root) {
  'use strict';
  const { $, esc, store } = window.PeelUtil;
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

  // ---- Top bar (Phase 2): scope trail, view switch, scenario chip, menus --------------
  // View switch: one button per MAP_VIEWS entry; clicking switches the map AND opens
  // the mapped analysis tab. syncMapOpts() toggles .on on every [data-mview], so this
  // switch stays in sync with the map control's own switch for free.
  const VIEW_TAB = { planning: 'overview', water: 'water', wastewater: 'ww', dc: 'dca' };
  function renderViewSwitch() {
    const el = $('#tb-views'); if (!el) return;
    el.innerHTML = MM().MAP_VIEWS.map(([k, t]) => `<button type="button" class="btn small" data-mview="${k}" title="Switch to the ${t} map view and its analysis tab">${PD.icon(k)}<span>${t}</span></button>`).join('');
    MA().syncMapOpts();
  }
  $('#tb-views').addEventListener('click', e => {
    const b = e.target.closest('[data-mview]'); if (!b) return;
    MA().setMapView(b.dataset.mview);
    Tips().openAnalysis(VIEW_TAB[b.dataset.mview] || 'overview');
  });

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
  function trailGoPeel() { if (window.PeelSvcScope) window.PeelSvcScope.clear(); if (typeof DevScope !== 'undefined') DevScope.close(); if (typeof PeelTools !== 'undefined' && PeelTools.closeResult) PeelTools.closeResult(); FI().resetAllFilters(); AS().clearSelected(); }
  function trailGoMuni() {
    if (!App().state.muni) return;
    // Reuse the filter panel's own chip: it also drops areas from other municipalities.
    const chip = document.querySelector(`#f-muni [data-muni="${CSS.escape(App().state.muni)}"]`);
    if (chip) chip.click();
    AS().clearSelected();
  }
  function trailGoArea() {
    const a = trailArea(); if (!a) return;
    App().state.sp = []; App().state.mtsa = []; App().state.pz = []; App().state.dr = [];
    App().state[a.kind] = [a.id];
    PA().renderAreaSelects(); SD().renderSvcSelects();
    PA().showArea(); SD().showSvcArea(); PA().renderPlanAreas();
    AS().clearSelected();
    App().applyFilters();
  }
  function trailGoDev() { if (Nav().getCurrentProject()) Nav().showDetail(Nav().getCurrentProject()); }
  function renderTrail() {
    const el = $('#trail'); if (!el) return;
    const steps = [{ label: 'Peel', go: trailGoPeel, title: 'Clear all filters and the selection' }];
    if (App().state.muni) steps.push({ label: App().state.muni, go: trailGoMuni, title: `Filter to ${App().state.muni}` });
    const a = trailArea();
    if (a) steps.push({ label: a.label, go: trailGoArea, title: 'Filter to this area only' });
    // Servicing ladder (plant › block / station; water system › zone): one step per rung.
    if (window.PeelSvcScope) steps.push(...window.PeelSvcScope.crumbs());
    // Phase 3: the development step follows the dev scope, not the #detail panel.
    const scoped = typeof DevScope !== 'undefined' ? DevScope.current() : null;
    if (scoped) steps.push({ label: scoped.title || 'Development', go: trailGoDev, title: 'Reopen this development' });
    // Phase 3b: a tool result scope adds its own crumb (Peel › Lasso selection).
    const tc = (typeof PeelTools !== 'undefined' && PeelTools.trailCrumb) ? PeelTools.trailCrumb() : null;
    if (tc) steps.push(tc);
    el.innerHTML = steps.map((s, i) => `${i ? '<span class="tb-sep" aria-hidden="true">›</span>' : ''}<button type="button" class="tb-step" data-i="${i}" title="${esc(s.title)}">${esc(s.label)}</button>`).join('');
    el._steps = steps;
    if (window.PeelSvcScope) window.PeelSvcScope.peelWideNote();
  }
  $('#trail').addEventListener('click', e => {
    const b = e.target.closest('[data-i]'); if (!b) return;
    const s = ($('#trail')._steps || [])[+b.dataset.i]; if (s) s.go();
  });

  // Scenario chip: a one-line summary plus a "modified" badge when criteria differ
  // from Peel defaults (criteriaChanges() is the existing detection). Clicking opens
  // a popover that holds the real #scen-bar node (moved, not duplicated); closing
  // puts the node back where it was. renderScenario() calls renderTbScen(), so the
  // chip follows every scenario change.
  const BASIS_SHORT = { all: 'all units', committed: 'committed units', remaining: 'units left to build' };
  function renderTbScen() {
    const chip = $('#tb-scen'); if (!chip) return;
    const n = SvcTab().criteriaChanges().length;
    const txt = ['Scenario', SvcTab().svcOpt.ww === 'calibrated' ? 'calibrated (2025 flows)' : 'design flows', n ? `${n} criteria modified` : 'Peel criteria', `counting ${BASIS_SHORT[App().state.basis] || 'all units'}`].join(' · ');
    chip.innerHTML = `<span class="tb-scen-t">${esc(txt)}</span>${n ? `<span class="tb-mod" title="${esc(SvcTab().criteriaChanges().join('; '))}">${n} modified</span>` : ''}`;
  }
  let scenHome = null;
  function openScenPop() {
    const bar = $('#scen-bar'), pop = $('#tb-scen-pop'); if (!bar || !pop) return;
    if (!scenHome) { scenHome = document.createComment('scen-bar home'); bar.replaceWith(scenHome); }
    if (bar.parentNode !== pop) pop.appendChild(bar);
    pop.hidden = false;
    $('#tb-scen').setAttribute('aria-expanded', 'true');
    SvcTab().renderScenario();
  }
  function closeScenPop() {
    const bar = $('#scen-bar'), pop = $('#tb-scen-pop'); if (!bar || !pop || pop.hidden) return;
    pop.hidden = true;
    $('#tb-scen').setAttribute('aria-expanded', 'false');
    if (scenHome && scenHome.parentNode) { scenHome.parentNode.replaceChild(bar, scenHome); scenHome = null; }
  }
  $('#tb-scen').addEventListener('click', () => { $('#tb-scen-pop').hidden ? openScenPop() : closeScenPop(); });

  // Menus. Items carrying data-export / data-share / data-area-report are handled by
  // the existing document-level handlers; the rest use data-tbx (export) / data-tbg
  // (gear). The list-panel export actions are named functions, so the menu keeps
  // working after the Export row itself is removed.
  // Phase 3b: "Inquiry response draft" export item. Drafts a response for the open
  // development via js/tools-inquiry.js (sibling worker C); guarded so the menu still
  // works before that module loads.
  function draftInquiryResponse() {
    const I = (typeof window !== 'undefined') ? window.PeelToolInquiry : null;
    const p = (typeof DevScope !== 'undefined' && DevScope.current) ? DevScope.current() : null;
    if (!I || typeof I.draftForDevelopment !== 'function') {
      if (Meas().hasTools()) PeelTools.openResult({ title: 'Inquiry response draft', html: '<p class="small muted">The inquiry module has not loaded yet — try again in a moment.</p>' });
      return;
    }
    if (p) {
      const text = I.draftForDevelopment(p) || '';
      if (Meas().hasTools()) {
        PeelTools.openResult({ title: `Inquiry response — ${p.title}`, html: `<p><button type="button" class="btn small" id="inq-copy">Copy</button></p><pre class="inq-draft">${esc(text)}</pre>` });
        const btn = document.getElementById('inq-copy');
        if (btn) btn.addEventListener('click', async () => {
          try {
            if (typeof I.copy === 'function') await I.copy(text);
            else if (navigator.clipboard && navigator.clipboard.writeText) await navigator.clipboard.writeText(text);
            btn.textContent = 'Copied ✓';
          } catch (e) { btn.textContent = 'Copy failed — select the text manually'; }
        });
      }
      return;
    }
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
      `<button type="button" role="menuitem" data-tbx="swmm"${swmmOk ? '' : ' disabled title="The wastewater servicing data is not loaded yet"'}>SWMM model (.inp) \u2014 wastewater blocks</button>` +
      '<button type="button" role="menuitem" data-tbx="workbook">Excel workbook (.xlsx)</button>' +
      `<button type="button" role="menuitem" data-tbx="comparepdf"${cmpOk ? '' : ` disabled title="${cmpTitle}"`}>PDF \u2014 comparison</button>` +
      '<button type="button" role="menuitem" data-tbx="brief">PDF \u2014 executive briefing</button>' +
      `<button type="button" role="menuitem" data-tbx="memo"${Nav().getCurrentProject() ? '' : ' disabled'}>PDF \u2014 development memo</button>` +
      '<button type="button" role="menuitem" data-area-report="shown">PDF \u2014 area report</button>' +
      '<button type="button" role="menuitem" data-tbx="print">Print map</button>' +
      '<hr>' +
      '<button type="button" role="menuitem" data-tbx="inquiry">Inquiry response draft</button>' +
      '<button type="button" role="menuitem" data-share>Copy share link</button>' +
      '<button type="button" role="menuitem" data-tbx="saveview">Save this view…</button>';
  }
  $('#tb-export-menu').addEventListener('click', e => {
    const item = e.target.closest('[role="menuitem"]'); if (!item || item.disabled) return;
    closeTbMenus();
    const b = e.target.closest('[data-tbx]'); if (!b) return;
    const fn = { saveview: () => MA().saveCurrentView(), csv: PE().exportDevsCSV, geojson: PE().exportDevsGeoJSON, areas: PE().exportAreasGeoJSON, dc: DCT().exportDcGeoJSON, swmm: SC().exportSwmmModel, workbook: PE().exportWorkbook, print: TS().printMap, brief: RP().briefingPDF, memo: () => { if (Nav().getCurrentProject()) RP().devMemo(Nav().getCurrentProject()); }, comparepdf: () => { if (typeof RP().comparisonPDF === 'function') RP().comparisonPDF(); }, inquiry: draftInquiryResponse }[b.dataset.tbx];
    if (fn) fn();
  });
  function renderGearMenu() {
    const m = $('#tb-gear-menu'); if (!m) return;
    m.innerHTML =
      '<button type="button" role="menuitem" data-tbg="settings">Settings</button>' +
      '<button type="button" role="menuitem" data-tbg="sources">Sources &amp; checks</button>' +
      '<button type="button" role="menuitem" data-tbg="log">Change log</button>';
  }
  // Gear menu pages (Phase 4): workers register page renderers on window.GearPages —
  // Worker G registers GearPages.sources for the Sources & checks page. openGearPage
  // renders the page into the gear menu, which stays open on the page. A renderer may
  // return an HTML string, a Node, or fill the container element itself.
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
    // Phase 4: the Settings & sources and Change log tabs are gone — Settings opens the
    // scenario popover (the criteria editor lives in the scenario bar now), the change
    // log lives in the Help menu, and Sources & checks is a gear page (Worker G).
    if (k === 'settings') openGearPage('settings');
    else if (k === 'log') { closeTbMenus(); Tips().showHelpLog(); }
    else if (k === 'sources') openGearPage('sources');
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
  $('#tb-gear').addEventListener('click', e => { e.stopPropagation(); toggleTbMenu('#tb-gear', '#tb-gear-menu'); });
  // Outside a menu closes it. The click's path is read as it was dispatched: a menu item that
  // opens a page (Settings, Sources & checks) is replaced by the page, so the clicked element
  // is no longer in the document and e.target.closest() would find no menu.
  document.addEventListener('click', e => {
    const path = typeof e.composedPath === 'function' ? e.composedPath() : [];
    const inside = sel => path.some(n => n && n.matches && n.matches(sel)) || !!(e.target.closest && e.target.closest(sel));
    if (!inside('.tb-wrap')) closeTbMenus();
    if (!inside('.tb-scen-wrap')) closeScenPop();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeTbMenus(); closeScenPop(); if (typeof PeelTools !== 'undefined' && PeelTools.escape) PeelTools.escape(); } });

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
  // on narrower screens it stays at the top of the Explore panel. The node moves: one search box.
  function placeSearch() {
    const box = $('#search-box'), slot = $('#tb-search'), home = document.querySelector('#tab-explore .search-bar'); if (!box || !slot || !home) return;
    const wide = matchMedia('(min-width: 1600px)').matches;
    if (wide && box.parentElement !== slot) slot.appendChild(box);
    else if (!wide && box.parentElement !== home) home.insertBefore(box, home.firstChild);
    slot.hidden = !wide;
  }
  function initTopbar() {
    if (!$('#topbar')) return;
    placeSearch(); matchMedia('(min-width: 1600px)').addEventListener('change', placeSearch);
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
    initTopbar,
    renderTrail,
    renderViewSwitch,
    renderTbScen,
    openScenPop,
    closeScenPop,
    openGearPage,
    renderExportMenu,
    renderGearMenu,
    draftInquiryResponse,
    initTopbar,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTopbar = api;
})(typeof window !== 'undefined' ? window : globalThis);
