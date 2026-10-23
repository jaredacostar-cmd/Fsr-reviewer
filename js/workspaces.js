(function (root) {
  'use strict';
  // ---- Workspaces and Home (Stage 4) ------------------------------------------------------------
  // A workspace is a view onto the four tabs, never a separate calculation: a task chip sets the map's
  // layer preset, the scope and the panel, and the panel header names the tab it comes from
  // ("Servicing capacity · from Servicing › Capacity"). Three modes:
  //   home  the briefing (headline, 4 figures, Needs attention, a small map of the problems, This week)
  //         with the workspaces listed by team, then "Full map";
  //   ws    the map with the task chips under the search box; the left panel and the tool rail are
  //         hidden; "Full map" on every panel keeps the scope, filters and scenario;
  //   full  the map with every tool (as before Stage 4). Old share links open here.
  // The start screen (Home · last workspace · Full map) is remembered per browser.
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s));
  const fmtNum = U.fmtNum || (n => String(n));
  const store = U.store || { get: (k, d) => d, set: () => {} };

  // ---- Pure: the workspaces, what each opens, the Old pipes list, the start screen -----------------
  // tab / sub: the sub-view it opens; scope: 'area' (Peel or the municipality filter: a development or
  // servicing scope closes), 'site' (the open development, or the Find step until one is picked) or
  // 'drawn' (the area the user draws); view: the map's layer preset (js/map-markers.js MAP_VIEWS).
  const WS = [
    { id: 'site', label: 'Check a site', group: 'Planning', tab: 'overview', sub: '', scope: 'site', view: 'planning', what: 'One development: servicing, timing, the memo' },
    { id: 'tight', label: 'Servicing capacity', group: 'Planning', tab: 'svc', sub: 'capacity', scope: 'area', view: 'wastewater', what: 'Plants, pumping and storage near their limit' },
    { id: 'growth', label: 'Growth in an area', group: 'Planning', tab: 'growth', sub: 'areas', scope: 'area', view: 'planning', what: 'Planned homes and people, by area' },
    { id: 'fsr', label: 'Review an FSR', group: 'Planning', tab: 'svc', sub: 'network', scope: 'site', view: 'wastewater', fsr: true, what: 'A consultant’s FSR against the app’s figures' },
    { id: 'outlook', label: 'Forecast', group: 'Planning', tab: 'growth', sub: 'timing', scope: 'area', view: 'planning', what: 'When homes and people arrive, by year' },
    { id: 'study', label: 'Study area', group: 'Planning', tab: 'overview', sub: '', scope: 'drawn', view: 'planning', what: 'Draw an area: its growth and servicing' },
    { id: 'projects', label: 'DC projects', group: 'Capital', tab: 'dca', sub: 'timing', scope: 'area', view: 'dc', what: 'Is each DC project in time?' },
    { id: 'eaflow', label: 'EA to construction', group: 'Capital', tab: 'dca', sub: 'eas', scope: 'area', view: 'dc', what: 'Each EA and the construction after it' },
    // QA/QC (decided with the user): where each development discharges, confirmed or set on the map (js/dev-outlets.js).
    { id: 'outlets', label: 'Review outlets', group: 'QA/QC', tab: 'svc', sub: 'network', scope: 'area', view: 'wastewater', what: 'Check and fix where developments discharge' },
    { id: 'pipes', label: 'Old pipes', group: 'Asset Management', tab: 'svc', sub: 'network', scope: 'area', view: 'wastewater', what: 'Old sewers that carry the most growth' },
    // The pipeline ledger (docs/pipeline-ledger-plan.md, Phase 2): Growth › Ledger on a page.
    { id: 'coming', label: 'What\u2019s coming', group: 'Planning', tab: 'growth', sub: 'ledger', scope: 'area', view: 'planning', what: 'Homes and people by stage and milestone' },
    { id: 'week', label: 'This week', group: 'Planning', tab: 'overview', sub: '', scope: 'area', view: 'planning', what: 'Files moved, new files, capital and EA dates' },
  ];
  const BY_ID = Object.fromEntries(WS.map(w => [w.id, w]));
  // The map under each chip (decided with the user): only what the task reads, 1–2 layers
  // (js/layer-groups.js keys); everything else off. The full map keeps its own presets.
  const LAYERS = {
    site: ['devs', 'hov'],                          // developments, site boundary on hover
    tight: ['cap', 'bk'],                           // capacity colours on the wastewater blocks
    growth: ['devs', 'sp'],                         // developments, secondary plans
    fsr: ['devs', 'ex-sanitary', 'ex-water'],       // developments, existing sewers and watermains (from zoom 15)
    study: ['devs'],
    outlook: ['devs'],
    projects: ['dcw', 'cons'],                      // planned DC works, Region construction
    eaflow: ['ea', 'cons'],                         // EA study areas, Region construction
    pipes: [],                                      // the old pipes only (drawn by this module)
    outlets: ['devs', 'ex-sanitary'],               // developments, existing sewers
    week: ['devs'],
    coming: ['devs'],
  };
  // Explore (step 3 of the page plan): Growth in an area, Check a site, Review an FSR, Forecast and
  // Study area are the views of one workspace, one entry in Home's sidebar. A site picked from an area
  // view opens on Check a site; a step up its trail opens Growth in an area there. Their map-view
  // chips, links and share links keep their own ids.
  const EXPLORE = ['growth', 'site', 'fsr', 'outlook', 'study'];
  // Capital (step 4): DC projects and EA to construction, one entry; the map's Projects and EAs are
  // sections of DC projects' page (js/sections.js WORKSPACES).
  const CAPITAL = ['projects', 'eaflow'];
  const SIDE = {
    explore: { label: 'Explore', what: 'A site, a plan or an area you draw: growth, servicing, capital, files, FSR' },
    capital: { label: 'Capital', what: 'DC timing, EA to construction, projects, EAs' },
    // Reference (step 5): Help, How it works, the Glossary and Data sources, one entry.
    reference: { label: 'Reference', what: 'Help, how it works, the glossary, data sources and checks' },
  };
  // A site's page: the live map beside its sections, at the site, with what is around it: existing
  // water, sanitary and storm mains (from street zoom), the 2026 DC works, Region construction and the
  // EA study areas, and the developments; each a chip on the page.
  const SITE_MAP = ['devs', 'ex-water', 'ex-sanitary', 'ex-storm', 'dcw', 'cons', 'ea'];
  // Home's sidebar: by team (Servicing capacity with Planning), then Full map.
  const GROUPS = [
    ['Planning', ['explore', 'tight', 'coming']],
    ['Capital', ['capital']],
    ['QA/QC', ['outlets']],
    ['Asset Management', ['pipes']],
  ];
  // Reference pages (Home's layout, no map, not a workspace): listed last in Home's sidebar.
  const REF = { help: { label: 'Help', what: 'Start here, guides, the tour, what’s new' }, guides: { label: 'How it works', what: 'Nine guides: approvals, flows, capacity, the forecast…' }, glossary: { label: 'Glossary', what: 'The terms in plain words' }, data: { label: 'Data sources', what: 'Every source, its date, and the data checks' } };
  // The guides (js/reference.js): pages of their own, listed on How it works, not in the sidebar.
  // Labs pages (Settings › Labs): a tool with a page of its own in Home's sidebar while its switch is on
  // (the page itself: the tool's module, e.g. js/sewer-designer.js page()).
  const LAB_PAGES = { sewer: { label: 'Sewer designer', what: 'Draw a sanitary sewer to an existing one: the design, profile and CSV', lab: 'sewer' } };
  for (const [id, label] of [['roles', 'Who decides what'], ['approvals', 'How approvals work'], ['flows', 'From homes to flows'], ['network', 'How sewage and water travel'], ['capacity', 'How capacity is checked'], ['fsrguide', 'What an FSR should cover'], ['capital', 'How a capital project gets built'], ['targets', 'Growth targets and forecasts'], ['forecast', 'How the forecast is timed']]) REF[id] = { label, guide: true };
  const TAB_NAME = { overview: 'Overview', growth: 'Growth', svc: 'Servicing', dca: 'Capital', records: 'Records' };
  // Sub-view names (design bundle 2: no two alike): Servicing › Model checks / Records › Data checks,
  // Growth › Forecast / Capital › DC timing. The chips in index.html carry the same words.
  const SUB_NAME = { capacity: 'Capacity', network: 'Network', alloc: 'Allocations', 'svc:checks': 'Model checks', 'records:checks': 'Data checks', checks: 'Checks', pipeline: 'Pipeline', areas: 'Areas', 'growth:timing': 'Forecast', ledger: 'Ledger', 'dca:timing': 'DC timing', dcproj: 'DC projects', timing: 'Timing', projects: 'Projects', eas: 'EAs', funding: 'Funding', sources: 'Sources', files: 'Files' };
  const tabPath = (tab, sub) => [TAB_NAME[tab] || tab, sub ? SUB_NAME[`${tab}:${sub}`] || SUB_NAME[sub] || sub : ''].filter(Boolean).join(' › ');
  // What a chip does: the tab, sub-view, scope and preset; closeScopes = area chips leave a site.
  function plan(id, ctx = {}) {
    const w = BY_ID[id]; if (!w) return null;
    const site = !!ctx.site;
    return { id, tab: w.tab, sub: w.sub, view: w.view, scope: w.scope === 'site' ? (site ? 'site' : 'find') : w.scope, closeScopes: w.scope === 'area', fsr: !!w.fsr && site, lasso: w.scope === 'drawn', source: `${w.label} · from ${tabPath(w.tab, w.sub)}` };
  }
  // The panel header line in a workspace: the workspace when the panel is its sub-view, else the tab.
  function sourceText(wsId, key) {
    const w = BY_ID[wsId]; if (!w) return '';
    const [tab, sub] = String(key || '').split(':');
    return tab === w.tab && (sub || '') === (w.sub || '') ? `${w.label} · from ${tabPath(tab, sub)}` : `${w.label} · ${tabPath(tab, sub)}`;
  }
  // Old pipes (decided with the user): installed 50+ years ago OR rated MODERATE (the highest rating in
  // the Region's data), AND carrying 100+ planned units at build-out; ranked by units carried.
  // pipes: sewers.json rows [diameterMm, slope, capacityLs, next, censusPopUp, haUp, plant, installYear,
  // material, risk, coords, …]; units: units carried per pipe (js/sewer-cap.js sewerGrowth).
  const OLD = { age: 50, minUnits: 100, risk: 'MODERATE' };
  function oldPipes(data, units, now, o = OLD) {
    if (!data || !data.pipes || !units) return [];
    const out = [];
    data.pipes.forEach((p, i) => {
      const u = units[i] || 0; if (u < o.minUnits) return;
      const y = p[7] || null, age = y ? now - y : null, risk = data.risks ? data.risks[p[9]] || '' : '';
      const old = age != null && age >= o.age, risky = risk === o.risk;
      if (!old && !risky) return;
      out.push({ i, d: p[0], year: y, age, risk, units: u, mat: data.materials ? data.materials[p[8]] || '' : '', plant: data.plants ? data.plants[p[6]] : '', old, risky, at: p[10] ? [p[10][0], p[10][1]] : null });
    });
    return out.sort((a, b) => b.units - a.units || (b.age || 0) - (a.age || 0));
  }
  // Shown as runs: listed segments that join end to end (one drains into the next) with the same size,
  // install year, material and risk are one main. A run carries the most units of its segments.
  function pipeRuns(list, data) {
    const at = new Map(list.map((r, k) => [r.i, k])), up = list.map((r, k) => k);
    const find = k => { while (up[k] !== k) { up[k] = up[up[k]]; k = up[k]; } return k; };
    const same = (a, b) => a.d === b.d && a.year === b.year && a.mat === b.mat && a.risk === b.risk;
    list.forEach((r, k) => { const nx = data.pipes[r.i][3], j = at.get(nx); if (j != null && same(r, list[j])) up[find(k)] = find(j); });
    const runs = new Map();
    list.forEach((r, k) => { const g = find(k); const x = runs.get(g) || { ...r, n: 0, lengthM: 0, pipes: [] }; x.n++; x.lengthM += data.pipes[r.i][14] || 0; x.pipes.push(r.i); if (r.units > x.units) Object.assign(x, { i: r.i, units: r.units, at: r.at }); runs.set(g, x); });
    return [...runs.values()].sort((a, b) => b.units - a.units || (b.age || 0) - (a.age || 0));
  }
  // The start screen: a link opens what it names (w=home: Home; w=p:<workspace>: its page; w=<workspace>:
  // its map view; without w the full map, as old links always did); otherwise the preference: Home
  // (default), the last workspace's page or the full map.
  const START = [['home', 'Home'], ['last', 'Last workspace'], ['full', 'Full map']];
  function startScreen({ hash = '', pref = 'home', last = null } = {}) {
    const q = new URLSearchParams(String(hash).replace(/^#/, ''));
    const w = q.get('w') || '';
    if ([...q.keys()].length) return w === 'home' ? { mode: 'home', page: 'home' } : /^p:/.test(w) && (BY_ID[w.slice(2)] || REF[w.slice(2)] || LAB_PAGES[w.slice(2)]) ? { mode: 'home', page: w.slice(2) } : BY_ID[w] ? { mode: 'ws', ws: w } : { mode: 'full' };
    if (pref === 'full') return { mode: 'full' };
    if (pref === 'last') return { mode: 'home', page: BY_ID[last] ? last : 'tight' };
    return { mode: 'home', page: 'home' };
  }
  // A workspace picked without naming one: Servicing capacity the first time, the last one after that.
  const defaultWs = last => (BY_ID[last] ? last : 'tight');

  // ---- Browser ----------------------------------------------------------------------------------
  const api = { WS, GROUPS, EXPLORE, CAPITAL, SIDE, SITE_MAP, LAB_PAGES, BY_ID, LAYERS, OLD, START, plan, sourceText, tabPath, oldPipes, pipeRuns, startScreen, defaultWs };
  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return;
  }
  const $ = s => document.querySelector(s);
  const App = () => root.PeelApp, AT = () => root.PeelAnalysisTabs, PN = () => root.PeelPanel, MM = () => root.PeelMapMarkers;
  const SC = () => root.PeelSewerCap, Cap = () => root.PeelSvcCapacity, OT = () => root.PeelOverviewTab, SS = () => root.PeelSvcScope;
  const now = () => (MM() && MM().THIS_YEAR) || new Date().getFullYear();
  let mode = 'full', cur = null, page = 'home';
  const isWs = () => mode === 'ws';

  // home: a page is open (Home or a workspace's page, js/ws-pages.js); ws: a workspace's map view with
  // the chips; full: the map with every tool.
  // Back from the full map: arriving there from a page or a workspace's map view, a bar over the map
  // offers the way back ("← Back to Check a site"); it goes when you leave the full map or close it.
  let backTo = null;
  function renderBack() {
    const wrap = mapWrap(); if (!wrap) return;
    let bar = $('#back-bar');
    if (!bar) { bar = document.createElement('div'); bar.id = 'back-bar'; bar.className = 'back-bar'; bar.setAttribute('role', 'navigation'); bar.setAttribute('aria-label', 'Back'); wrap.appendChild(bar); }
    const on = mode === 'full' && !!backTo;
    bar.hidden = !on;
    bar.innerHTML = on ? `<button type="button" class="btn small" data-ws-back>← Back to ${esc(backTo.ws ? `${pageName(backTo.ws)} (map)` : pageName(backTo.page))}</button><button type="button" class="btn small link" data-ws-back-x aria-label="Close the back bar" title="Stay on the full map">×</button>` : '';
  }
  function setMode(m, pg) {
    if (m === 'full' && mode !== 'full') backTo = mode === 'home' ? { page } : mode === 'ws' && cur ? { ws: cur } : null;
    else if (m !== 'full') backTo = null;
    const was = { mode, page };
    if (m === 'home') page = pg || page || 'home';
    else putMapBack();
    mode = m;
    if (mode !== 'home' || page !== 'sewer') sewerMapOn = false;
    const de = document.documentElement, app = $('.app');
    de.classList.toggle('ws-mode', m === 'ws'); de.classList.toggle('home-on', m === 'home');
    if (app) { app.classList.toggle('ws-mode', m === 'ws'); }
    const home = $('#home'); if (home) home.hidden = m !== 'home';
    const bar = $('#ws-bar'); if (bar) bar.hidden = m !== 'ws';
    if (m !== 'ws') { cur = null; pipesLayer(false); if (m === 'full') { unfoldLayers(); restoreView(); } }
    renderChips();
    if (m === 'home') renderPage(true); else placeSearch();
    if (root.PeelDataTab && root.PeelDataTab.fixMap) setTimeout(() => root.PeelDataTab.fixMap(), 50);
    if (PN()) PN().sync();
    renderBack();
    // (the first time on the full map: its tour is offered, js/tips.js)
    if (m === 'full' && root.PeelTips && root.PeelTips.maybeMapTour) setTimeout(() => root.PeelTips.maybeMapTour(), 800);
    if (root.PeelShare && root.PeelShare.viewLink) root.PeelShare.viewLink.write();
    // (a page's tool follows it: the Sewer designer is on while its page is open)
    if (typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('peel:page', { detail: { mode, page: mode === 'home' ? page : null, was: was.mode === 'home' ? was.page : null } }));
  }
  // The one search box: over the map in a workspace's map view, on the Find step of Check a site and
  // Review an FSR, else in the left panel (or the top bar on wide screens).
  function placeSearch() {
    const box = $('#search-box'), slot = mode === 'ws' ? $('#ws-search') : mode === 'home' ? $('#page-search') : null; if (!box) return;
    if (slot) { if (box.parentElement !== slot) slot.appendChild(box); return; }
    const pageSlot = $('#page-search');
    if (box.parentElement === $('#ws-search') || (pageSlot && box.parentElement === pageSlot) || !document.body.contains(box.parentElement)) { const home = document.querySelector('#tab-explore .search-bar'); if (home) home.insertBefore(box, home.firstChild); }
    if (root.PeelTopbar && root.PeelTopbar.placeSearch) root.PeelTopbar.placeSearch();
  }
  // Study area: the map itself moves onto its page (a small interactive map), and back after.
  const mapWrap = () => document.querySelector('.map-wrap');
  function putMapBack() {
    const m = $('#map'), w = mapWrap(); if (!m || !w || m.parentElement === w) return;
    w.insertBefore(m, w.firstChild); invalidate();
  }
  function placeMap() {
    const m = $('#map'), slot = $('#page-map-slot');
    if (slot && m) { if (m.parentElement !== slot) { slot.appendChild(m); invalidate(); if (slot.dataset.site) fitSite(); else if (slot.dataset.sewer != null) sewerMap(); else fitPeel(); } } else putMapBack();
  }
  // The Sewer designer's page map: the existing sanitary, water and storm mains (the sewer it snaps to
  // and the pipes it crosses) and the developments; the view is the designer's (js/sewer-designer.js).
  let sewerMapOn = false;
  function sewerMap() {
    if (!sewerMapOn) { sewerMapOn = true; lean('wastewater', ['devs', 'ex-sanitary', 'ex-water', 'ex-storm']); }
    if (root.PeelSewerDesigner && root.PeelSewerDesigner.fitPage) setTimeout(() => root.PeelSewerDesigner.fitPage(), 60);
  }
  const labPageOn = id => !!(LAB_PAGES[id] && root.PeelLabs && root.PeelLabs.on(LAB_PAGES[id].lab));
  // A site's page map: the infrastructure layers on, at the site (street zoom: the existing mains show).
  let siteMapFor = null;
  function fitSite() {
    const p = root.DevScope && root.DevScope.current && root.DevScope.current(), map = root.PeelMapCore && root.PeelMapCore.map;
    if (!p || !map || p.lat == null) return;
    // (once per site: a page rebuilt while it loads keeps where the user has panned)
    if (siteMapFor === p.key) return;
    siteMapFor = p.key; lean('wastewater', SITE_MAP);
    setTimeout(() => map.setView([p.lat, p.lng], 16), 60);
  }
  // Study area with nothing drawn yet: the page's map opens on all of Peel (the wastewater blocks).
  function fitPeel() {
    const AS = root.PeelAreaSelect, map = root.PeelMapCore && root.PeelMapCore.map, sv = App() && App().state.servicing;
    if (!map || !sv || (AS && AS.selection && AS.selection.size)) return;
    const bb = (sv.drainage || []).filter(d => d.bbox && !(d.served != null && d.served < 0.5)).reduce((b, d) => [Math.min(b[0], d.bbox[0]), Math.min(b[1], d.bbox[1]), Math.max(b[2], d.bbox[2]), Math.max(b[3], d.bbox[3])], [180, 90, -180, -90]);
    if (bb[0] < bb[2]) setTimeout(() => map.fitBounds([[bb[1], bb[0]], [bb[3], bb[2]]], { padding: [10, 10] }), 60);
  }
  const invalidate = () => { const map = root.PeelMapCore && root.PeelMapCore.map; if (map && map.invalidateSize) setTimeout(() => map.invalidateSize(), 30); };
  // ---- A chip -------------------------------------------------------------------------------------
  function go(id, o = {}) {
    const site = root.DevScope && root.DevScope.current ? root.DevScope.current() : null;
    const pl = plan(id, { site: !!site }); if (!pl) return;
    cur = id; store.set('lastWs', id);
    if (mode !== 'ws') setMode('ws');
    if (pl.closeScopes) {
      if (site) root.DevScope.close();
      if (SS() && SS().current && SS().current()) SS().close();
    }
    // The chip's view from its preset (nothing saved), then its lean layers.
    lean(pl.view, LAYERS[id] || []);
    const A = AT(); if (A) { if (pl.sub && A.setSub) A.setSub(pl.tab, pl.sub); if (A.setFootPref) A.setFootPref(pl.tab); A.showFootTab(pl.tab); }
    foldLayers();
    pipesLayer(id === 'pipes');
    // Review an FSR at a site: the cross-check is an open fold of the Servicing panel (fsrSpec), so the
    // site bar's own copy closes (one form on screen).
    if (pl.fsr) { const box = document.getElementById('site-bar-fsr'), b = document.querySelector('#site-bar [data-scope-fsr]'); if (box && !box.hidden && b) b.click(); }
    if (pl.lasso && !o.noDraw && root.PeelAreaSelect && root.PeelAreaSelect.setLasso) root.PeelAreaSelect.setLasso(true);
    const ss = o.ss; if (ss && SS() && SS().open) SS().open(ss);
    renderChips();
    if (PN()) PN().sync();
    if (root.PeelShare && root.PeelShare.viewLink) root.PeelShare.viewLink.write();
    // A site workspace without a site: the search box is the first step.
    if (pl.scope === 'find' && !o.quiet) { const s = $('#f-search'); if (s) try { s.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
  }
  // The map's Layers panel closes when a chip is picked (the chip has set the layers); the full map gets
  // it back as it was before the workspace.
  let layersWasOpen = null, viewKept = false, booted = false;
  // A view preset and only these layers (a chip's map, a site page's map); the full map's own settings
  // come back with it (restoreView).
  function lean(view, layers) {
    const MA = root.PeelMapAnalysis, LG = root.PeelLayerGroups;
    if (!MA || !MA.showView) return;
    // (the full map's own settings are remembered once; a flag kept in the browser says the lean
    // layers are on, so a later visit neither remembers them as the view's nor opens the full map lean)
    if (!viewKept) { if (!store.get('wsLean', null)) MA.rememberCurrent(); viewKept = true; store.set('wsLean', true); }
    MA.showView(view);
    if (LG && LG.apply) LG.apply(new Set(layers));
  }

  // Back in the full map: the open view with its own remembered layers (not the chip's).
  function restoreView() {
    const MA = root.PeelMapAnalysis;
    if (!viewKept && !booted) return;   // (before the data and the link: bootRestore does it)
    if ((viewKept || store.get('wsLean', null)) && MA && MA.showView && MA.currentView) MA.showView(MA.currentView(), { remembered: true });
    viewKept = false; store.set('wsLean', null); siteMapFor = null; sewerMapOn = false;
  }
  // At boot, before a link is applied: a workspace's lean layers left on from an earlier visit give way
  // to the view's remembered settings unless the app opens on a workspace map (once; app.js).
  function bootRestore() {
    if (booted) return; booted = true;
    if (mode !== 'ws' && store.get('wsLean', null)) restoreView();
  }
  const layersPanel = () => document.querySelector('.map-opts .mo-panel');
  function foldLayers() {
    const el = layersPanel(); if (!el) return;
    if (layersWasOpen == null) layersWasOpen = !!el.open;
    el.open = false;
  }
  function unfoldLayers() {
    const el = layersPanel();
    if (el && layersWasOpen) el.open = true;
    layersWasOpen = null;
  }
  // This week's count (the chip's badge): the Peel Overview's own list (none while it is still loading).
  function weekRows() { const WP = root.PeelWsPages, a = WP && WP.briefing ? WP.briefing() : OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null; const l = a && a.lists ? a.lists.find(x => x.title === 'This week') : null; return l ? l.rows : []; }
  // Bundle 6: the filters that stay on while you are on a page or in a workspace, as chips with
  // Reset, so a filtered page never reads as the whole of Peel.
  function filterChipsHTML() {
    const F = root.PeelFilterUI, list = F && F.activeFilters ? F.activeFilters() : [], old = F && F.oldLinkNote ? F.oldLinkNote() : '';
    if (!list.length) return old ? `<div class="page-filters small" role="group" aria-label="Filters on">${old}</div>` : '';
    return `<div class="page-filters small" role="group" aria-label="Filters on"><span class="muted">Filters on:</span> ${list.map((f, i) => `<button type="button" class="chip on removable" data-pf-i="${i}" title="Remove this filter">${esc(f.label)} <span aria-hidden="true">×</span></button>`).join('')}<button type="button" class="btn small link" data-pf-reset>Reset ${list.length === 1 ? 'it' : `all ${list.length}`}</button>${old}</div>`;
  }
  document.addEventListener('click', e => {
    const F = root.PeelFilterUI; if (!F || !e.target.closest) return;
    const r = e.target.closest('[data-pf-reset]'), c = e.target.closest('[data-pf-i]'), o = e.target.closest('.page-filters [data-include-completed]'); if (!r && !c && !o) return;
    e.preventDefault();
    if (o) F.includeCompleted(); else if (r) F.resetAllFilters(); else { const f = F.activeFilters()[+c.dataset.pfI]; if (f) { f.clear(); App().applyFilters(); } }
    renderChips(); if (mode === 'home') renderPage(true);
  });
  function renderChips() {
    const el = $('#ws-chips'); if (!el) return;
    const nW = weekRows().length;
    const fl = $('#ws-filters'); if (fl) fl.innerHTML = filterChipsHTML();
    el.innerHTML = WS.map(w => `<button type="button" class="btn small ws-chip${cur === w.id ? ' on' : ''}" data-ws-go="${w.id}" aria-pressed="${cur === w.id}" title="${esc(w.what)}">${esc(w.label)}${w.id === 'week' && nW ? ` <span class="badge-n">${fmtNum(nW)}</span>` : ''}</button>`).join('');
  }
  // The header line on every panel in a workspace: its source and "Full map".
  function srcLine(key) {
    if (!isWs() || !cur) return '';
    // Check a site / Review an FSR, once the site is open: the guided steps, Find done.
    const site = (cur === 'site' || cur === 'fsr') && root.DevScope && root.DevScope.current && root.DevScope.current();
    const steps = site ? ` <small class="pnl-steps">✓ Find › <b>Result</b> › Output: ${cur === 'fsr' ? 'the cross-check notes' : 'Servicing memo'}</small>` : '';
    return `<p class="pnl-src small"><span>${esc(sourceText(cur, key))}${steps}</span><button type="button" class="btn small link" data-ws-full title="The same scope, filters and scenario with every tool">Full map →</button></p>`;
  }
  // ---- A workspace's own view of a sub-view --------------------------------------------------------
  function override(key, scope) {
    if (!isWs() || !cur || !PN()) return null;
    const pl = plan(cur, { site: scope.startsWith('dev:') });
    if ((cur === 'site' || cur === 'fsr') && pl.scope === 'find' && key === `${pl.tab}:${pl.sub}` && scope === 'area') return findSpec(cur);
    if (cur === 'fsr' && key === 'svc:network' && scope.startsWith('dev:')) return fsrSpec(scope);
    if (cur === 'pipes' && key === 'svc:network' && scope === 'area') return pipesSpec();
    if (cur === 'week' && key === 'overview:' && scope === 'area') return weekSpec();
    return null;
  }
  // Check a site / Review an FSR before a site is picked: Find → Result → Output.
  function findSpec(id) {
    const w = BY_ID[id], P = root.PeelPhases;
    const last = p => (P && P.lastActivityOf ? P.lastActivityOf(p) || 0 : 0);
    const recent = ((App() && App().state.projects) || []).filter(p => p.phase !== 'cancelled' && p.phase !== 'completed' && (p.units || 0) > 0).map(p => [p, last(p)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
    const steps = [['Find', 'Search an address or file number above, or click a development on the map.'], ['Result', id === 'fsr' ? 'Its servicing path with the FSR cross-check (Servicing at the site).' : 'Its servicing, timing and what to confirm (Overview at the site).'], ['Output', id === 'fsr' ? 'The cross-check notes to compare with the report.' : 'The one-page servicing memo.']];
    return {
      head: { name: w.label, status: { tone: 'stage', text: 'Step 1 of 3' }, identity: esc(w.what) },
      answer: 'Find the development: search an address or file number above, or click it on the map.',
      lists: [
        { title: 'Steps', rows: steps.map(([t, d], i) => ({ kv: true, html: `<div class="pnl-step${i === 0 ? ' on' : ''}"><span class="pnl-step-n" aria-hidden="true">${i + 1}</span><span><strong>${t}</strong> ${esc(d)}</span></div>` })), total: 3 },
        { title: 'Recently active', rows: recent.map(p => ({ attrs: { 'data-pnl-dev': p.key, title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(P && P.PHASE_BY_KEY[p.phase] ? P.PHASE_BY_KEY[p.phase].label : p.phase)}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'}</small>` })), total: recent.length },
      ],
      foot: { primary: { label: 'Search', attrs: { 'data-ws-focus': '' } } },
    };
  }
  // Review an FSR at a site: Servicing at the site as it is, with the FSR cross-check as its first fold,
  // open (the same form and checks as the site bar's Check FSR, js/fsr-check.js).
  function fsrSpec(scope) {
    const e = PN().get('svc:network'), F = root.PeelFsrCheck, p = root.DevScope && root.DevScope.current && root.DevScope.current();
    if (!e || !e.spec || e.scope !== scope || !F || !F.mount || !p) return null;
    const s = e.spec;
    return { ...s,
      folds: [{ title: 'FSR cross-check: the consultant\u2019s figures vs this app\u2019s', open: true, id: 'pnl-fsr', html: '<div class="fsr-box" data-pnl-fsrbox></div>' }, ...(s.folds || [])],
      onMount: host => { if (typeof s.onMount === 'function') s.onMount(host); const b = host.querySelector('[data-pnl-fsrbox]'); if (b) F.mount(b, p); } };
  }
  // Old pipes: Servicing › Network filtered to age / risk with the build-out load (units carried).
  function oldList() {
    const S = MM() && MM().SEW; if (!S || !S.data || !SC()) return null;
    const G = SC().sewerGrowth(); if (!G) return null;
    const n = S.data.pipes.length, u = new Float64Array(n);
    for (const k of ['built', 'approved', 'proposed']) if (G[k] && G[k].units) for (let i = 0; i < n; i++) u[i] += G[k].units[i];
    return oldPipes(S.data, u, now());
  }
  function pipesSpec() {
    const list = oldList(), runs = list ? pipeRuns(list, MM().SEW.data) : [];
    if (!list) { if (MM() && MM().SEW && !MM().SEW.data && SC() && SC().loadSewers) SC().loadSewers().then(() => PN() && PN().sync()); return { head: { name: 'Old pipes', identity: 'Sanitary sewers 300 mm and larger' }, answer: 'Loading the Region’s sanitary sewer records…' }; }
    const old = list.filter(r => r.old).length, risky = list.filter(r => r.risky).length, units = list.reduce((t, r) => Math.max(t, r.units), 0);
    const oldest = list.reduce((a, r) => (r.year && (!a || r.year < a.year) ? r : a), null);
    return {
      calc: true, fullTitle: 'Servicing › Network · Old pipes',
      head: { trail: [{ label: 'Peel' }, { label: 'Servicing › Network' }], name: 'Which old pipes carry the most growth?', status: !list.length ? { tone: 'room', text: 'None' } : risky ? { tone: 'tight', text: `${fmtNum(risky)} moderate risk` } : null, identity: `Sanitary sewers 300 mm+ · ${OLD.age}+ years old or rated ${OLD.risk.toLowerCase()} risk · ${OLD.minUnits}+ units at build-out` },
      answer: list.length ? `<strong>${fmtNum(runs.length)}</strong> sewer runs (${fmtNum(list.length)} pipe segments) are ${OLD.age}+ years old or rated moderate risk and carry ${OLD.minUnits}+ planned units at build-out. The one carrying the most is <strong>${esc(`the ${runs[0].d} mm main${runs[0].plant ? ` to ${(root.PeelSvcData && root.PeelSvcData.PLANT_SHORT && root.PeelSvcData.PLANT_SHORT[runs[0].plant]) || runs[0].plant}` : ''}`)}</strong>, ${runs[0].year ? `laid in ${runs[0].year}` : 'year not recorded'} (${fmtNum(Math.round(runs[0].units))} units).` : `No sewer ${OLD.age}+ years old or rated moderate risk carries ${OLD.minUnits}+ planned units at build-out.`,
      figures: [
        { v: fmtNum(runs.length), u: 'sewer runs', label: 'on the list', ctx: `${fmtNum(list.length)} pipe segments · ${OLD.minUnits}+ units at build-out` },
        { v: fmtNum(old), u: 'pipes', label: `${OLD.age}+ years old`, ctx: `installed ${now() - OLD.age} or earlier` },
        { v: fmtNum(risky), u: 'pipes', label: 'rated moderate risk', ctx: 'the Region’s highest rating in the data', tone: risky ? 'tight' : 'room' },
        oldest ? { v: oldest.year, u: '', label: 'oldest on the list', ctx: `${oldest.d} mm${oldest.mat ? ` ${esc(oldest.mat)}` : ''} · ${fmtNum(Math.round(oldest.units))} units` } : { v: fmtNum(Math.round(units)), u: 'units', label: 'most carried', ctx: '' },
      ],
      lists: [{ title: 'Runs, most units first', rows: runs.slice(0, 5).map(r => ({ tone: r.risky ? 'tight' : null, attrs: { 'data-pipe': r.i, title: 'Show the pipe and what loads it' },
        html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.d} mm${r.mat ? ` ${esc(r.mat)}` : ''}${r.plant ? ` · to ${esc((root.PeelSvcData && root.PeelSvcData.PLANT_SHORT && root.PeelSvcData.PLANT_SHORT[r.plant]) || r.plant)}` : ''}</span><span class="pnl-r-year${r.old ? ' t-tight' : ''}">${r.year ? `${r.year} · ${r.age} yrs` : 'year not recorded'}</span></div><div class="pnl-r-meta"><span>${fmtNum(Math.round(r.units))} units at build-out · ${r.n > 1 ? `${fmtNum(r.n)} segments, ` : ''}${fmtNum(Math.round(r.lengthM))} m</span><span${r.risky ? ' class="t-tight"' : ''}>${r.risk ? `${esc(r.risk.charAt(0) + r.risk.slice(1).toLowerCase())} risk` : 'risk not rated'}</span></div>` })),
        total: runs.length, seeAll: { 'data-full-table': 'svc:network' } }],
      method: `From the Region’s sanitary sewer records (300 mm and larger): install year and risk rating as published. A pipe is listed when it was installed ${OLD.age}+ years ago or is rated ${OLD.risk.toLowerCase()} risk (the highest rating in the data; the others are low and insignificant), and the developments on the map that drain through it (built since the census, approved, proposed) plan ${OLD.minUnits}+ units. Units carried is a count of planned units, not a flow: pipe-by-pipe capacity is left to the Region’s model. Segments that join end to end with the same size, install year, material and risk are shown as one run, ranked by the most units any of its segments carries.`,
      sources: 'Region of Peel Wastewater Main (open data): diameter, install date, material, risk rating. The applications and permits on the map.',
      foot: { primary: { label: 'Show the sewers on the map', attrs: { 'data-mview': 'wastewater' } } },
    };
  }
  // The old pipes on the map while the workspace is open (amber; moderate risk heavier).
  let pLayer = null;
  function pipesLayer(on) {
    const L = root.L, map = root.PeelMapCore && root.PeelMapCore.map; if (!L || !map) return;
    if (pLayer) { map.removeLayer(pLayer); pLayer = null; }
    if (!on) return;
    const list = oldList(); if (!list) return;
    const C = SC() && SC().pipeCoords;
    pLayer = L.layerGroup(list.map(r => { const c = MM().SEW.data.pipes[r.i][10], pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k + 1], c[k]]);
      return L.polyline(C ? C(MM().SEW.data.pipes[r.i]).map(([x, y]) => [y, x]) : pts, { color: U.token ? U.token('--cap-tight') : getComputedStyle(document.documentElement).getPropertyValue('--cap-tight').trim(), weight: r.risky ? 6 : 4, opacity: 0.9, interactive: false }); })).addTo(map);
  }
  // This week: the Overview's changes, every row.
  function weekSpec() {
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null, rows = weekRows();
    const muni = App() && App().state.muni;
    return {
      head: { trail: [{ label: 'Peel' }, ...(muni ? [{ label: muni }] : []), { label: 'Overview' }], name: 'What changed this week?', status: null, identity: a && a.head ? a.head.identity : esc(muni || 'Peel') },
      answer: rows.length ? `<strong>${fmtNum(rows.length)}</strong> change${rows.length === 1 ? '' : 's'} since the last data update: files that moved stage, new files, capital and EA dates.` : 'Nothing changed since the last data update.',
      lists: [{ title: 'This week', rows: rows.slice(0, 5), total: rows.length, seeAll: { 'data-full-table': 'overview' } }],
      method: 'Changes between the last two data updates: files whose stage moved, files listed for the first time (not those already completed), Region capital projects and EAs with a review period closing or a DC-matched date moved later.',
      sources: 'The municipal application records (each update); Region of Peel capital project and EA listings.',
      foot: { primary: { label: 'Watch list', attrs: { 'data-ws-watch': '' }, title: 'The developments you watch (left panel, Watch)' } },
    };
  }
  // ---- Pages ------------------------------------------------------------------------------------
  // A chip's page (js/ws-pages.js builds it from the tabs' panels); Home is the page 'home'. Area pages
  // leave a site; Check a site and Review an FSR keep it. The page's tab and sub-view open behind it, so
  // their panels are worked out for the same scope.
  function openPage(id, o = {}) {
    // Explore: the site open, else the last of its views, else Growth in an area.
    if (id === 'explore') id = root.DevScope && root.DevScope.current && root.DevScope.current() ? 'site' : (EXPLORE.includes(store.get('lastWs', '')) ? store.get('lastWs', '') : 'growth');
    if (id === 'capital') id = CAPITAL.includes(store.get('lastWs', '')) ? store.get('lastWs', '') : 'projects';
    if (id === 'reference') id = 'help';
    if (id !== 'home' && !BY_ID[id] && !REF[id] && !labPageOn(id)) id = 'home';
    const w = BY_ID[id];
    if (w && w.scope === 'area') {
      if (root.DevScope && root.DevScope.current && root.DevScope.current()) root.DevScope.close();
      if (SS() && SS().current && SS().current()) SS().close();
    }
    if (w) { store.set('lastWs', id); const A = AT(); if (A) { if (w.sub && A.setSub) A.setSub(w.tab, w.sub); A.showFootTab(w.tab); } }
    lastHTML = '';
    setMode('home', id);
    if (!o.keepScroll) { const el = $('#home'); if (el) el.scrollTop = 0; }
  }
  let lastHTML = '', timer = null, menuOpen = false;
  const pageName = id => (id === 'home' ? 'Home' : SIDE[id] ? SIDE[id].label : BY_ID[id] ? BY_ID[id].label : REF[id] ? REF[id].label : LAB_PAGES[id] ? LAB_PAGES[id].label : id);
  function sideHTML() {
    const nW = weekRows().length, pref = store.get('startScreen', 'home'), labIds = Object.keys(LAB_PAGES).filter(labPageOn);
    // (a guide's page lights How it works)
    const isOn = id => page === id || (id === 'guides' && !!(REF[page] && REF[page].guide)) || (id === 'explore' && EXPLORE.includes(page)) || (id === 'capital' && CAPITAL.includes(page)) || (id === 'reference' && !!REF[page]);
    // (Explore is one entry for its five views: the view you are on is named in it, "Explore › Check a site")
    const cur = id => (id === 'explore' && EXPLORE.includes(page) ? ` <span class="home-ws-cur">› ${esc(BY_ID[page].label)}</span>` : '');
    const item = (id, sub) => `<li><button type="button" class="home-ws${isOn(id) ? ' on' : ''}" data-ws-page="${id}"${isOn(id) ? ' aria-current="page"' : ''}><strong>${esc(pageName(id))}${cur(id)}${id === 'week' && nW ? ` <span class="badge-n">${fmtNum(nW)}</span>` : ''}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</button></li>`;
    // (This week covers capital and EA dates too: it sits under Home, not Planning)
    // (a phone: the list folds behind one button naming the page you are on; it opens grouped)
    return `<nav class="home-side${menuOpen ? ' open' : ''}" aria-label="Workspaces"><button type="button" class="home-menu-btn" data-home-menu aria-expanded="${menuOpen}"><span aria-hidden="true">☰</span> ${EXPLORE.includes(page) ? `Explore › ${esc(pageName(page))}` : esc(pageName(page))} <span class="muted small">· all pages</span> <span aria-hidden="true">${menuOpen ? '▴' : '▾'}</span></button><ul>${item('home', 'The briefing')}${item('week', BY_ID.week.what)}</ul>
      ${GROUPS.map(([g, ids]) => `<h2 class="home-g">${esc(g)}</h2><ul>${ids.map(id => item(id, (SIDE[id] || BY_ID[id]).what)).join('')}</ul>`).join('')}
      ${labIds.length ? `<h2 class="home-g">Labs</h2><ul>${labIds.map(id => item(id, LAB_PAGES[id].what)).join('')}</ul>` : ''}
      <h2 class="home-g">Reference</h2><ul>${item('reference', SIDE.reference.what)}</ul>
      <button type="button" class="home-ws home-full" data-ws-full><strong>Full map</strong><small>Every layer, filter and tool</small></button>
      <label class="home-pref small">Start screen <select data-ws-start>${START.map(([k, t]) => `<option value="${k}"${pref === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </nav>`;
  }
  // Explore's five views in a row at the top of each of them: where you are, and the others one click away.
  const viewsHTML = () => `<nav class="page-views" aria-label="Explore">${EXPLORE.map(id => `<button type="button" class="btn small${id === page ? ' on' : ''}" data-ws-page="${id}"${id === page ? ' aria-current="page"' : ''} title="${esc(BY_ID[id].what)}">${esc(BY_ID[id].label)}</button>`).join('')}</nav>`;
  // force: rebuild even when the page HTML is unchanged (a mode switch).
  function renderPage(force) {
    const el = $('#home'), WP = root.PeelWsPages; if (!el || el.hidden || !WP) return;
    const m = WP.build(page);
    if (!REF[page] && !LAB_PAGES[page]) m.filters = filterChipsHTML();
    if (EXPLORE.includes(page)) m.views = viewsHTML();
    const main = WP.pageHTML(m, PN() ? PN().NOTE : '');
    const html = `<div class="home-grid">${sideHTML()}${main}</div>`;
    if (!force && html === lastHTML) return;
    // The search box and the map live outside the page while it is rebuilt.
    const box = $('#search-box'), side = document.querySelector('#tab-explore .search-bar');
    if (box && side && el.contains(box)) side.insertBefore(box, side.firstChild);
    putMapBack();
    const y = el.scrollTop;
    el.innerHTML = html; lastHTML = html;
    if (!force) el.scrollTop = y;
    placeSearch(); placeMap();
    if (typeof m.onMount === 'function') try { m.onMount(el.querySelector('.page-main')); } catch (e) { /* the page stays without its async parts */ }

    // A page still waiting on data that sets no panel when it lands (Home's servicing figures) tries again.
    if (m.pending) { clearTimeout(timer); timer = setTimeout(() => renderPage(false), 1000); }
  }
  const schedule = () => { if (mode !== 'home') return; clearTimeout(timer); timer = setTimeout(() => renderPage(false), 200); };
  // Kept for the tests and older callers: Home is the page 'home'.
  const renderHome = () => { if (mode === 'home') renderPage(true); };
  const homeMapSVG = rows => (root.PeelWsPages ? root.PeelWsPages.capacityMap(rows) : '');
  // ---- Settings: the start screen ------------------------------------------------------------------
  const settingsHTML = () => { const pref = store.get('startScreen', 'home'); return `<section class="gear-sec"><h3>Start screen</h3><p class="small muted">What opens when you load the app without a link. Kept in this browser.</p><div class="seg" role="group" aria-label="Start screen">${START.map(([k, t]) => `<button type="button" class="btn small${pref === k ? ' on' : ''}" data-ws-start-btn="${k}" aria-pressed="${pref === k}">${t}</button>`).join('')}</div></section>`; };
  // ---- Wiring -------------------------------------------------------------------------------------
  const devByKey = k => { const N = root.PeelDevNav; return N && N.projectByKey ? N.projectByKey(k) : null; };
  function pickDev(k) { const N = root.PeelDevNav, q = devByKey(k); if (q && N) N.showDetail(q); return q; }
  function copyText(t, btn) {
    const done = () => { if (btn) { const l = btn.textContent; btn.textContent = 'Copied'; setTimeout(() => { btn.textContent = l; }, 1500); } };
    try { navigator.clipboard.writeText(t).then(done, () => {}); } catch (e) { /* no clipboard */ }
  }
  function pipesCSV() {
    const list = oldList(); if (!list) return;
    const runs = pipeRuns(list, MM().SEW.data), Ex = root.PeelExports, WP = root.PeelWsPages;
    const cols = ['diameter_mm', 'material', 'install_year', 'age_years', 'risk', 'units_at_buildout', 'segments', 'length_m', 'plant', 'likelihood_band', 'consequence_band'];
    const cell = v => root.PeelUtil.csvCell(v);
    const rows = runs.map(r => [r.d, r.mat, r.year || '', r.age == null ? '' : r.age, r.risk, Math.round(r.units), r.n, Math.round(r.lengthM), r.plant || '', WP ? WP.likeOf(r) : '', WP ? WP.consOf(r) : ''].map(cell).join(','));
    if (Ex && Ex.download) Ex.download('peel-old-pipes.csv', (U.CSV_DISCLAIMER || '') + [cols.join(','), ...rows].join('\n'), 'text/csv');
  }
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    if (e.target.closest('[data-home-menu]')) { menuOpen = !menuOpen; renderPage(true); return; }
    const pg = e.target.closest('[data-ws-page]');
    if (pg) { e.preventDefault(); menuOpen = false; openPage(pg.dataset.wsPage); return; }
    const pk = e.target.closest('[data-ws-pick]');
    // "Its full tree →" / "show it in the tree →": the site on the full map, at Records › Files.
    if (pk && pk.dataset.wsTree) { e.preventDefault(); setMode('full'); pickDev(pk.dataset.wsPick); setTimeout(() => { const AT = root.PeelAnalysisTabs; if (AT && AT.openTab) AT.openTab('records', 'files'); }, 300); return; }
    if (pk) { e.preventDefault(); const as = pk.dataset.wsAs; pickDev(pk.dataset.wsPick); if (as && as !== page) openPage(as, { keepScroll: true }); else schedule(); return; }
    const un = e.target.closest('[data-ws-unpick]');
    if (un) { if (root.DevScope && root.DevScope.current()) root.DevScope.close(); openPage(un.dataset.wsUnpick); return; }
    const g = e.target.closest('[data-ws-go]');
    if (g) { e.preventDefault(); const dev = g.dataset.wsDev, ce = g.dataset.wsCe, pipe = g.dataset.wsPipe, ft = g.dataset.wsFulltable; go(g.dataset.wsGo, { ss: g.dataset.wsSs, quiet: !!dev });
      if (dev) pickDev(dev);
      if (ce && root.PeelCapitalEA) { const [k, ...rest] = ce.split(':'), CE = root.PeelCapitalEA; if (k === 'ea') CE.openEA(rest.join(':')); else if (k === 'cap') CE.openCapital(rest.join(':')); }
      if (pipe != null && SC() && MM().SEW && MM().SEW.data) { const i = +pipe, c = MM().SEW.data.pipes[i][10], map = root.PeelMapCore.map; SC().showPipeLoads(i); map.setView([c[1], c[0]], Math.max(map.getZoom(), 15)); }
      if (ft && PN() && PN().openFull) setTimeout(() => PN().openFull(), 400);
      // An area from Growth in an area: the map and every tab filtered to it (Growth › Areas' own filter).
      const area = g.dataset.wsArea; if (area && App()) { App().state.sp = [area]; if (root.PeelPlanAreas && root.PeelPlanAreas.renderAreaSelects) root.PeelPlanAreas.renderAreaSelects(); App().applyFilters(); }
      return; }
    if (e.target.closest('[data-ws-backpage]')) { openPage(cur || page || 'home'); return; }
    if (e.target.closest('[data-ws-back]')) { const b = backTo; if (b && b.ws) { setMode('ws'); go(b.ws, { quiet: true, noDraw: true }); } else openPage((b && b.page) || 'home', { keepScroll: true }); return; }
    if (e.target.closest('[data-ws-back-x]')) { backTo = null; renderBack(); return; }
    // Home's scope (step 6): Peel or a municipality, the same filter as the map's (a plan or MTSA in
    // another municipality no longer applies).
    const mu = e.target.closest('[data-ws-muni]');
    if (mu && App()) {
      const m = mu.dataset.wsMuni, PA = root.PeelPlanAreas, keep = id => !m || ((PA && PA.areaById && PA.areaById.get(id)) || {}).municipality === m;
      App().state.muni = m; App().state.sp = App().state.sp.filter(keep); App().state.mtsa = App().state.mtsa.filter(keep);
      if (root.PeelSearchFilter && root.PeelSearchFilter.renderMuniChips) root.PeelSearchFilter.renderMuniChips();
      if (PA && PA.renderAreaSelects) PA.renderAreaSelects();
      App().applyFilters(); renderPage(true); return;
    }
    // A layer chip under a site page's map: that layer on or off.
    const lc = e.target.closest('[data-ws-layer]');
    if (lc) { const LG = root.PeelLayerGroups, A = LG && LG.ADAPT && LG.ADAPT[lc.dataset.wsLayer]; if (A) { let on = false; try { on = !A.get(); A.set(on); } catch (er) { /* the layer is not loaded */ } lc.classList.toggle('on', on); lc.setAttribute('aria-pressed', String(on)); } return; }
    if (e.target.closest('[data-ws-full]')) { setMode('full'); return; }
    if (e.target.closest('[data-ws-home]')) { openPage('home'); return; }
    if (e.target.closest('[data-ws-focus]')) { const s = $('#f-search'); if (s) s.focus(); return; }
    if (e.target.closest('[data-ws-watch]')) { setMode('full'); if (root.PeelDataTab && root.PeelDataTab.showTab) root.PeelDataTab.showTab('week'); return; }
    // Study area: draw on the page's map; the page refreshes once the drawing ends.
    if (e.target.closest('[data-ws-draw]')) { const AS = root.PeelAreaSelect; if (AS) { AS.setLasso(true); const iv = setInterval(() => { if (!AS.getLassoOn()) { clearInterval(iv); renderPage(true); } }, 300); } return; }
    if (e.target.closest('[data-ws-clear]')) { const AS = root.PeelAreaSelect; if (AS && AS.clearSelection) AS.clearSelection(); renderPage(true); return; }
    // Review an FSR: the comparison as text for the review, or printed.
    const fc = e.target.closest('[data-ws-fsrcopy]'); if (fc) { const r = document.querySelector('#home [data-fc-results]'); copyText(r && !r.hidden ? r.innerText : 'Run Compare first.', fc); return; }
    if (e.target.closest('[data-ws-fsrprint]')) { const F = root.PeelFsrCheck; if (F && F.printCheck) F.printCheck(); return; }
    if (e.target.closest('[data-ws-pipescsv]')) { pipesCSV(); return; }
    const sb = e.target.closest('[data-ws-start-btn]'); if (sb) { store.set('startScreen', sb.dataset.wsStartBtn); document.querySelectorAll('[data-ws-start-btn]').forEach(b => { const on = b === sb; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
  });
  // A page's link to the map's tools (a tab, a servicing scope, the full table, a trace, a lens): the
  // full map first, then the link does what it does there (its own handler, as the click bubbles on).
  const MAP_LINK = '[data-at], [data-ss], [data-full-table], [data-trace], [data-mview]';
  document.addEventListener('click', e => {
    if (mode !== 'home' || !e.target.closest) return;
    const a = e.target.closest(MAP_LINK);
    if (!a || !a.closest('#home') || a.closest('[data-ws-go], [data-ws-page], [data-ws-pick], [data-ws-full], [data-ws-home], [data-ws-backpage]')) return;
    setMode('full');
  }, true);
  document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-ws-start]'); if (s) store.set('startScreen', s.value); });
  document.addEventListener('keydown', e => { if (!e.defaultPrevented && (e.key === 'Enter' || e.key === ' ') && e.target.closest && (e.target.closest('#home [role="button"]') || e.target.closest('#home [data-ws-stage]'))) { e.preventDefault(); e.target.click(); } });
  // The page and the chips follow the panels (their figures, This week's count): a page rebuilds when what
  // it shows has changed.
  let exploreDev = null;
  document.addEventListener('pnl:set', e => {
    // Explore: a site picked (the search, the map) while an area view is open opens its page.
    const sc = e.detail && e.detail.scope;
    if (sc && sc.startsWith('dev:') && sc !== exploreDev && mode === 'home' && ['growth', 'outlook', 'study'].includes(page)) { exploreDev = sc; setTimeout(() => openPage('site'), 0); }
    else if (sc && !sc.startsWith('dev:')) exploreDev = null;
    if (e.detail && e.detail.key === 'overview:' && e.detail.scope === 'area') renderChips();
    if (mode === 'ws' && cur === 'pipes' && e.detail && e.detail.key === 'svc:network') pipesLayer(true);
    schedule();
  });
  // A site picked in a workspace's map view (Check a site / Review an FSR): on to its result.
  let lastDev = null;
  document.addEventListener('pnl:set', e => {
    const d = e.detail && e.detail.scope; if (!isWs() || !d || !d.startsWith('dev:') || d === lastDev) { if (d && !d.startsWith('dev:')) lastDev = null; return; }
    lastDev = d;
    if (cur === 'site' || cur === 'fsr') setTimeout(() => { if (isWs() && (cur === 'site' || cur === 'fsr')) go(cur, { quiet: true }); }, 0);
  });
  function init() {
    const s = startScreen({ hash: location.hash, pref: store.get('startScreen', 'home'), last: store.get('lastWs', null) });
    if (s.mode === 'ws') { setMode('ws'); setTimeout(() => go(s.ws, { quiet: true, noDraw: true }), 0); }
    else if (s.mode === 'home') openPage(s.page || 'home');
    else setMode(s.mode);
  }
  Object.assign(api, { REF, bootRestore, go, openPage, setMode, mode: () => mode, current: () => cur, page: () => page, override, srcLine, renderHome, renderPage, renderChips, settingsHTML, homeMapSVG, oldList, pipesSpec, init });
  root.PeelWorkspaces = api;
})(typeof window !== 'undefined' ? window : globalThis);
