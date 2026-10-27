(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { store } = window.PeelUtil;
  const DcaTab = () => window.PeelDcaTab;
  const OT = () => window.PeelOverviewTab;
  const DUI = () => window.PeelDemandUI;
  const Sh = () => window.PeelShare;

  // ---- The right panel (Stage 2): four tabs at every scope, Overview · Growth · Servicing · Capital,
  // plus Records, a small trailing tab (the Overview's ⓘ line opens its Data checks). Sub-views: at most four
  // per tab, one chip row under the tab bar (TABSUBS). Overview has none.
  //   Growth:    Pipeline · Areas · Forecast (its By period fold: the pipeline ledger, js/ledger-ui.js)
  //   Servicing: Capacity · Network   (water and wastewater together; Allocations is a fold of Capacity), and at a
  //              development Network · FSR review (the FSR cross-check, js/fsr-check.js)
  //   Capital:   DC timing · EAs · Projects (DC timing: every 2026 DC project with both verdicts, js/dc-projects.js, the Funding lab a fold of it)
  //   Records:   Sources · Data checks · Files (every check: the data, then the servicing model)
  // footPref: the tab last picked (kept); each tab's sub-view last picked is kept too. Old tab and
  // sub-view names (share links, stored prefs) migrate onto these (migrateTabKey / migrateSub).
  const TAB_KEYS = ['overview', 'growth', 'svc', 'dca', 'records'];
  // Old keys still reach the right tab: 'ww' / 'water' (and 'svc') are Servicing.
  const tabOf = key => (key === 'ww' || key === 'water' ? 'svc' : key);
  // Old sub-view names → the new ones (pure; tests/four-tabs.test.js, tests/nav-aliases.test.js).
  // Every sub-view of the four tabs is a row, so a link's or a stored sub-view always goes through
  // here; a value 'tab:sub' moves it to another tab (the navigation redesign moves sub-views between
  // tabs: docs/architecture-review/navigation-design.md §7.2–7.3).
  // Phase 2: Allocations is a fold of Capacity, the model checks are Records › Data checks, the water
  // facilities and the hydraulic check are Network's. Phase 3: the Ledger is Forecast's By period fold.
  // Phase 4: DC projects is DC timing (one list, both verdicts); the funding screen is its fold. Phase 5: FSR
  // review is a development's Servicing view.
  const SUB_MAP = {
    ww: { plants: 'capacity', catchments: 'network', alloc: 'capacity', pumpstations: 'network' },
    water: { capacity: 'capacity', zones: 'network', facilities: 'network', hydro: 'network' },
    growth: { pipeline: 'pipeline', census2051: 'areas', byplan: 'areas', timing: 'timing', areas: 'areas', ledger: 'timing' },
    dca: { timing: 'timing', build: 'projects', dcproj: 'timing', projects: 'projects', eas: 'eas', recommendations: 'timing', funding: 'timing' },
    svc: { capacity: 'capacity', network: 'network', alloc: 'capacity', checks: 'records:checks', fsr: 'fsr' },
    records: { sources: 'sources', checks: 'checks', files: 'files' },
  };
  // The state key of each tab's sub-view.
  const SUB_KEY = { growth: 'gSub', svc: 'svcSub', dca: 'dcSub', records: 'rSub' };
  // A tab's sub-view name → { tab, sub } (another tab when SUB_MAP moved it), or null when it names none.
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const migrateSub = (tab, sub) => {
    const v = sub && own(SUB_MAP, tab) && own(SUB_MAP[tab], sub) ? SUB_MAP[tab][sub] : null;
    if (typeof v !== 'string' || !v) return null;
    const i = v.indexOf(':');
    return i > 0 ? { tab: v.slice(0, i), sub: v.slice(i + 1) } : { tab: tabOf(tab), sub: v };
  };
  // A moved sub-view that became a fold of its new view: the fold to open (navigation-design §7.2).
  const FOLD_OF = { ww: { alloc: 'alloc' }, svc: { alloc: 'alloc' }, growth: { ledger: 'period' } };
  const foldOf = (tab, sub) => (sub && own(FOLD_OF, tab) && own(FOLD_OF[tab], sub) ? FOLD_OF[tab][sub] : null);
  // Open the fold a moved sub-view or a chip opens: Allocations recorded (js/demand-ui.js), By period
  // (js/ledger-ui.js), EA to construction (js/capital-ea.js, the EA to construction chip and page); a fold whose
  // module is not loaded, or none, opens nothing.
  const FOLD_OPEN = { alloc: () => DUI() && DUI().openAllocFold, eaflow: () => root.PeelCapitalEA && root.PeelCapitalEA.openEaFlow, period: () => root.PeelLedgerUI && root.PeelLedgerUI.openPeriod };
  const openFold = f => { const fn = f && own(FOLD_OPEN, f) ? FOLD_OPEN[f]() : null; if (typeof fn === 'function') fn(); };
  const subKey = r => (SUB_KEY[r.tab] ? { tab: r.tab, [SUB_KEY[r.tab]]: r.sub } : { tab: r.tab });
  // A tab key from a link or a stored pref (with its sub-view, when the link or the old key named one).
  const migrateTabKey = (t, sub) => {
    if (t === 'demand') return { tab: 'growth' };
    if (t === 'census') return { tab: 'growth', gSub: 'areas' };
    if (t === 'criteria' || t === 'log') return { tab: 'overview' };
    if (t === 'developments' || t === 'tool' || t === 'dev') return { tab: 'overview' };
    if (t === 'plants') return { tab: 'svc', svcSub: 'capacity' };
    const r = sub ? migrateSub(t, sub) : null;
    if (r) return subKey(r);
    if (t === 'ww' || t === 'water') return { tab: 'svc', svcSub: 'capacity' };
    if (t === 'growth' && sub) return { tab: 'growth', gSub: 'pipeline' };
    if (t === 'dca' && sub) return { tab: 'dca', dcSub: 'timing' };
    return { tab: TAB_KEYS.includes(t) ? t : 'overview' };
  };
  // Stored sub-views through SUB_MAP (pure): a renamed one keeps its view; one moved to another tab
  // goes with it when its tab was the one last picked (footPref), else that tab opens on its first.
  function migratePrefs(p) {
    const o = { ...p };
    for (const [tab, k] of Object.entries(SUB_KEY)) {
      const r = migrateSub(tab, o[k]);
      if (!r) { if (tab === 'growth') o[k] = 'pipeline'; else if (tab === 'dca') o[k] = 'timing'; continue; }
      if (r.tab === tab) { o[k] = r.sub; continue; }
      o[k] = null;
      if (o.footPref === tab) { o.footPref = r.tab; if (SUB_KEY[r.tab]) o[SUB_KEY[r.tab]] = r.sub; }
    }
    return o;
  }
  let footPref = store.get('footTab4', 'overview'), footTab = 'overview';
  let gSub = store.get('gSub', 'pipeline'), dcSub = store.get('dcSub', 'timing');
  let svcSub = store.get('svcSub', null), rSub = store.get('rSub', 'sources');
  // Stored sub-views from before Stage 2 (wwSub / wSub, census2051, build …) map onto the new ones.
  if (!svcSub) { const sys = store.get('svcSys', 'ww'); svcSub = (SUB_MAP[sys === 'water' ? 'water' : 'ww'] || {})[store.get(sys === 'water' ? 'wSub' : 'wwSub', '')] || 'capacity'; }
  // (a stored 'ww' / 'water' tab keeps the Servicing sub-view stored with it; only 'plants' names one)
  { const old = footPref, m = migrateTabKey(footPref); footPref = m.tab; if (m.gSub) gSub = m.gSub; if (m.svcSub && old !== 'ww' && old !== 'water') svcSub = m.svcSub; }
  // (before the reset to each tab's first valid sub-view below, which would lose a moved one)
  ({ footPref, gSub, svcSub, dcSub, rSub } = migratePrefs({ footPref, gSub, svcSub, dcSub, rSub }));
  // (Labs add no sub-view: the Funding lab's screen is a fold of Capital › DC timing, js/dc-projects.js.)
  // Sub-view state per tab: the chip data-attribute, the store key, the valid values, get / set.
  const TABSUBS = {
    growth: { attr: 'gsub', store: 'gSub', valid: ['pipeline', 'areas', 'timing'], get: () => gSub, set: v => { gSub = v; } },
    svc: { attr: 'svcsub', store: 'svcSub', valid: ['capacity', 'network', 'fsr'], get: () => svcSub, set: v => { svcSub = v; } },
    dca: { attr: 'dcasub', store: 'dcSub', valid: ['timing', 'eas', 'projects'], get: () => dcSub, set: v => { dcSub = v; } },
    records: { attr: 'rsub', store: 'rSub', valid: ['sources', 'checks', 'files'], get: () => rSub, set: v => { rSub = v; } },
  };
  for (const s of Object.values(TABSUBS)) if (!s.valid.includes(s.get())) s.set(s.valid[0]);
  // ---- One System control (navigation-design §3.4, N-11): Both · Wastewater · Water, one pick kept in this
  // browser for Servicing › Capacity and Capital › DC timing; the lens sets it (js/topbar.js). A link
  // carries it (sy=, js/share.js); one without it opens at Both.
  const SYS = [['both', 'Both'], ['ww', 'Wastewater'], ['water', 'Water']];
  // Any value → one of SYS: the old words too ('all' was Capacity's, 'wastewater' DC projects').
  const sysKey = v => (v === 'ww' || v === 'wastewater' ? 'ww' : v === 'water' ? 'water' : 'both');
  // A lens sets the System its map shows: its DC layer's system (js/map-analysis.js VIEW_PRESETS);
  // Planning, with no DC layer, leaves it.
  const SYS_OF_VIEW = { water: 'water', wastewater: 'ww', dc: 'both' };
  let sysOn = sysKey(store.get('sysPick', null) ?? store.get('dcProjSys', 'both'));   // (DC projects' own pick, once)
  const sysSeg = () => `<div class="seg" role="group" aria-label="System">${SYS.map(([k, t]) => `<button type="button" class="btn small${sysOn === k ? ' on' : ''}" data-sys="${k}" aria-pressed="${sysOn === k}">${t}</button>`).join('')}</div>`;
  // What each scope hides (a sub-view with nothing to show is hidden, never blank; area-only content
  // never renders at a site). 'site': a development is the scope; 'area': Peel, a municipality, a plan
  // or a result with no files of its own.
  // At a site, Capital › DC timing is the site's DC projects (the projects it relies on); the Projects
  // list is Region-wide, so it is hidden there; the EAs and works near the site are in that one view
  // (navigation phase 5: Capital has no chip row at a site). FSR review is a development's: an area, a servicing
  // scope or a result never shows it, and Servicing opens on its own first view there.
  const HIDDEN = {
    site: { growth: ['areas', 'timing'], svc: ['capacity'], dca: ['eas', 'projects'], records: ['sources', 'checks'] },
    area: { svc: ['fsr'], records: ['files'] },
  };
  const SITE_HIDDEN = HIDDEN.site;
  const hiddenAt = (scope, tab, sub) => !!((HIDDEN[scope] || {})[tab] && HIDDEN[scope][tab].includes(sub));
  const siteHidden = (tab, sub) => hiddenAt('site', tab, sub);
  // The sub-view a tab shows: the one picked, else (hidden at this scope) the first that is not.
  const subFor = (tab, sub, site, scope = site ? 'site' : 'area') => (hiddenAt(scope, tab, sub) ? TABSUBS[tab].valid.find(v => !hiddenAt(scope, tab, v)) : sub);
  // The chips a tab shows at a scope (≤ 4: tests/four-tabs.test.js).
  const chipsAt = (tab, scope) => (TABSUBS[tab] ? TABSUBS[tab].valid.filter(v => !hiddenAt(scope, tab, v)) : []);
  const areaPick = {};
  let heldTab = null;
  function showFootTab(key, sub) {
    if (key === 'dev' || key === 'developments' || key === 'tool') key = 'overview';   // the development's views live in the Overview
    if (key === 'growth' && root.PeelUtil && root.PeelUtil.flushLater) root.PeelUtil.flushLater();   // (its views, if they wait to render)
    if (key === 'ww' || key === 'water') { if (!sub) sub = svcSub === 'capacity' || svcSub === 'network' ? svcSub : 'network'; key = 'svc'; }
    // (a sub-view another tab now holds opens there: SUB_MAP 'tab:sub'; one that became a fold opens it)
    if (sub) openFold(foldOf(key, sub));
    { const r = sub ? migrateSub(key, sub) : null; if (r) { key = r.tab; sub = r.sub; } }
    if (sub && TABSUBS[key] && TABSUBS[key].valid.includes(sub)) { delete areaPick[key]; TABSUBS[key].set(sub); store.set(TABSUBS[key].store, sub); }
    // (Servicing and Capital show once the servicing data loads, js/svc-tab.js: a tab picked before then
    // is held and opened when it shows, tabShown below, unless another tab is picked meanwhile)
    if (!document.querySelector(`.f-tab[data-tab="${key}"]:not([hidden])`)) { heldTab = key; key = 'overview'; } else heldTab = null;
    const site = !!(root.DevScope && root.DevScope.current());
    const ssCur = root.PeelSvcScope && root.PeelSvcScope.current && root.PeelSvcScope.current();
    const fileScope = !!(ssCur && ssCur.kind === 'result' && ssCur.rkind === 'file');
    const scopeOf = tk => (site || (tk === 'records' && fileScope) ? 'site' : 'area');
    const an = document.getElementById('analysis'); if (an) an.classList.toggle('site-scope', site);
    // A sub-view hidden at this scope shows the first that is not; the pick it replaced comes back
    // when the scope allows it again (closing a development returns to the sub-view picked before).
    for (const [tk, s] of Object.entries(TABSUBS)) {
      const back = areaPick[tk];
      if (back != null && !hiddenAt(scopeOf(tk), tk, back)) { delete areaPick[tk]; if (back !== s.get()) s.set(back); }
      const v = subFor(tk, s.get(), null, scopeOf(tk)); if (v !== s.get()) { if (areaPick[tk] == null) areaPick[tk] = s.get(); s.set(v); }
    }
    footTab = key;
    for (const t of document.querySelectorAll('.f-tab')) t.setAttribute('aria-selected', String(t.dataset.tab === key));
    for (const p of document.querySelectorAll('.f-pane')) {
      const pk = p.dataset.pane;
      if (p.classList.contains('f-subtabs')) { p.hidden = pk !== key || chipsAt(pk, scopeOf(pk)).length < 2; continue; }   // one chip is no choice: no row
      p.hidden = pk !== key || p.dataset.off === '1' || (p.dataset.sub != null && (!TABSUBS[pk] || !p.dataset.sub.split(' ').includes(TABSUBS[pk].get())));
    }
    for (const [tk, s] of Object.entries(TABSUBS))
      for (const b of document.querySelectorAll(`[data-${s.attr}]`)) { const on = b.dataset[s.attr] === s.get(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); b.classList.toggle('site-off', hiddenAt(scopeOf(tk), tk, b.dataset[s.attr])); }
    if (key === 'records' && root.PeelRecordsTab) setTimeout(() => root.PeelRecordsTab.render(), 0);
    if (root.PeelSvcScope) root.PeelSvcScope.peelWideNote();
    if (key === 'dca' && typeof DcaTab().renderDca === 'function') setTimeout(() => DcaTab().renderDca(), 0);
    if (key === 'overview') setTimeout(() => { if (OT() && window.PeelApp) OT().renderOverview(); }, 0);   // (may fire before the app has loaded; its boot renders the overview)
    if (key === 'svc' && svcSub === 'capacity') setTimeout(() => DUI().renderAlloc(), 0);   // (Allocations recorded: Capacity's fold, its tables in the full table)
    if (key === 'svc' && root.PeelSvcCapacity) setTimeout(() => root.PeelSvcCapacity.renderFor(svcSub), 0);
    if (key === 'growth' && gSub === 'areas' && root.PeelPlanTables) setTimeout(() => root.PeelPlanTables.render(), 0);
    if (key === 'growth' && gSub === 'timing' && root.PeelLedgerUI) setTimeout(() => root.PeelLedgerUI.render(), 0);   // (By period's full table, #ledger-body)
    // The standard panel of the open tab and sub-view (js/panel.js).
    if (root.PeelPanel) root.PeelPanel.sync();
    // A narrow screen scrolls the tab strip: keep the open tab in view.
    const ft = document.querySelector(`.f-tab[data-tab="${key}"]`), strip = ft && ft.parentElement;
    if (strip && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: Math.max(0, ft.offsetLeft - (strip.clientWidth - ft.offsetWidth) / 2), behavior: 'smooth' });
  }
  for (const g of document.querySelectorAll('.f-subtabs')) g.addEventListener('click', e => {
    const b = e.target.closest('[data-svcsub],[data-gsub],[data-dcasub],[data-rsub]'); if (!b) return;
    const hit = Object.entries(TABSUBS).find(([, s]) => b.dataset[s.attr] != null); if (!hit) return;
    const [tab, s] = hit, v = b.dataset[s.attr];
    delete areaPick[tab];   // a pick made here wins over the one kept from before
    s.set(v); store.set(s.store, v); showFootTab(tab); Sh().viewLink.write();
  });
  // A link to a tab and sub-view anywhere in the panel: data-at="tab" or "tab:sub-view".
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-at]'); if (!a) return;
    const [t0, s0] = a.dataset.at.split(':'), r = s0 ? migrateSub(t0, s0) : null, tab = r ? r.tab : t0, sub = r ? r.sub : s0;
    if (s0) openFold(foldOf(t0, s0));
    footPref = tabOf(tab); store.set('footTab4', footPref); showFootTab(tab, sub); Sh().viewLink.write();
  });
  // The System pick (a link's is for the visit: not stored). Capacity redraws every time (cheap; Home's
  // Servicing capacity page reads its panel); Capital › DC timing once it has drawn, and only while its
  // second verdict's model (the DC projects allocation) is worked out for this scenario or its list is on
  // screen: a System tap on Capacity (or a lens) never builds that model (it walks every sewer pipe).
  // Otherwise its stored panel goes (never a development's: its Capital panel is js/dca-tab.js's), and the
  // next Capital open or page draws it at the new System. On a page the redraw comes through pnl:set.
  const dcOnScreen = () => [...document.querySelectorAll('[data-dcproj-sort], [data-dcproj-back]')].some(b => b.getClientRects().length > 0);
  function setSys(v, o = {}) {
    sysOn = sysKey(v); if (!o.link) store.set('sysPick', sysOn);
    if (o.quiet) return;
    if (root.PeelSvcCapacity && root.PeelSvcCapacity.render) root.PeelSvcCapacity.render();
    const DP = root.PeelDcProjects, DI = root.PeelDcImpact;
    if (DP && DP.shown && DP.shown()) { if ((DI && DI.current && DI.current()) || dcOnScreen()) DP.refresh(); else if (root.PeelPanel && !(root.DevScope && root.DevScope.current())) root.PeelPanel.clear('dca:timing'); }
  }
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-sys]'); if (b) { setSys(b.dataset.sys); Sh().viewLink.write(); } });
  showFootTab(footPref);

  // A tab button just shown (js/svc-tab.js renderSvcTab): open it if it was the one asked for and held.
  function tabShown(key) { if (heldTab === key && footTab === 'overview') showFootTab(key); }
  // A view re-rendering the open tab (its pane came or went: census-view.js, a Labs switch): the tab on
  // screen again, or the one still held; never the remembered one, which a pick since may have left.
  const refreshFootTab = () => showFootTab(heldTab || footTab);
  // Helper for other modules: set a tab's sub-view, persisting the choice.
  // A link or button that opens a tab (and sub-view): the tab becomes the one picked (kept, and in
  // the share link), as a click on the tab itself does.
  // (a sub-view another tab now holds, SUB_MAP: that tab is the one picked, as a data-at link's)
  function openTab(tab, sub) {
    const r = sub ? migrateSub(tab, sub) : null, t = r ? r.tab : tab;
    footPref = tabOf(t === 'dev' || t === 'developments' || t === 'tool' ? 'overview' : t); store.set('footTab4', footPref);
    showFootTab(tab, sub);
    if (root.PeelShare && root.PeelShare.viewLink) root.PeelShare.viewLink.write();
  }
  // (An old sub-view name maps onto its new one: 'build' → 'projects', 'byplan' → 'areas', …)
  // (one moved to another tab is set there: the tab it now lives in is returned, for the caller to open)
  const setSub = (tab, sub) => { const r = migrateSub(tab, sub) || { tab, sub }, s = TABSUBS[r.tab]; if (!s) return r.tab; const v = r.sub; if (s.valid.includes(v)) { s.set(v); store.set(s.store, v); } return r.tab; };
  const api = {
    tabOf, TAB_KEYS, SUB_MAP, HIDDEN, hiddenAt, chipsAt,
    getFootPref: () => footPref, setFootPref: v => { footPref = tabOf(v); }, openTab,
    getFootTab: () => footTab, tabShown, refreshFootTab,
    getSvcSub: () => svcSub, setSvcSub: v => { svcSub = v; store.set('svcSub', v); },
    getGSub: () => gSub, setGSub: v => { gSub = v; },
    getDcSub: () => dcSub, setDcSub: v => { dcSub = v; },
    getRSub: () => rSub, setRSub: v => { rSub = v; },
    showFootTab, TABSUBS, SUB_KEY, migrateTabKey, migrateSub, migratePrefs, setSub, SITE_HIDDEN, siteHidden, subFor, FOLD_OF, foldOf, openFold,
    SYS, SYS_OF_VIEW, sysKey, sysSeg, getSys: () => sysOn, setSys,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAnalysisTabs = api;
})(typeof window !== 'undefined' ? window : globalThis);
