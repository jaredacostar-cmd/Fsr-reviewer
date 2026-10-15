(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { store } = window.PeelUtil;
  const DcaTab = () => window.PeelDcaTab;
  const OT = () => window.PeelOverviewTab;
  const DUI = () => window.PeelDemandUI;
  const Sh = () => window.PeelShare;

  // ---- The right panel (Stage 2): four tabs at every scope, Overview · Growth · Servicing · Capital,
  // plus Records, a small trailing tab (also opened from the Settings gear). Sub-views: at most four
  // per tab, one chip row under the tab bar (TABSUBS). Overview has none.
  //   Growth:    Pipeline · Areas · Timing
  //   Servicing: Capacity · Network · Allocations · Checks   (water and wastewater together)
  //   Capital:   Timing · Projects · EAs (+ Funding while its Labs switch is on)
  //   Records:   Sources · Checks · Files
  // footPref: the tab last picked (kept); each tab's sub-view last picked is kept too. Old tab and
  // sub-view names (share links, stored prefs) migrate onto these (migrateTabKey / migrateSub).
  const TAB_KEYS = ['overview', 'growth', 'svc', 'dca', 'records'];
  // Old sub-view names → the new ones (pure; tests/four-tabs.test.js).
  const SUB_MAP = {
    ww: { plants: 'capacity', catchments: 'network', alloc: 'alloc', pumpstations: 'network' },
    water: { capacity: 'capacity', zones: 'network', facilities: 'checks', hydro: 'checks' },
    growth: { pipeline: 'pipeline', census2051: 'areas', byplan: 'areas', timing: 'timing', areas: 'areas' },
    dca: { timing: 'timing', build: 'projects', projects: 'projects', eas: 'eas', recommendations: 'funding', funding: 'funding' },
  };
  // A tab key from a link or a stored pref (with its sub-view, when the old key named one).
  const migrateTabKey = (t, sub) => {
    if (t === 'demand') return { tab: 'growth' };
    if (t === 'census') return { tab: 'growth', gSub: 'areas' };
    if (t === 'criteria' || t === 'log') return { tab: 'overview' };
    if (t === 'developments' || t === 'tool' || t === 'dev') return { tab: 'overview' };
    if (t === 'plants') return { tab: 'svc', svcSub: 'capacity' };
    if (t === 'ww' || t === 'water') return { tab: 'svc', svcSub: (sub && SUB_MAP[t][sub]) || (t === 'ww' ? 'capacity' : 'capacity') };
    if (t === 'growth' && sub) return { tab: 'growth', gSub: SUB_MAP.growth[sub] || 'pipeline' };
    if (t === 'dca' && sub) return { tab: 'dca', dcSub: SUB_MAP.dca[sub] || 'timing' };
    return { tab: TAB_KEYS.includes(t) ? t : 'overview' };
  };
  let footPref = store.get('footTab4', 'overview'), footTab = 'overview';
  let gSub = store.get('gSub', 'pipeline'), dcSub = store.get('dcSub', 'timing');
  let svcSub = store.get('svcSub', null), rSub = store.get('rSub', 'sources');
  // Stored sub-views from before Stage 2 (wwSub / wSub, census2051, build …) map onto the new ones.
  if (!svcSub) { const sys = store.get('svcSys', 'ww'); svcSub = (SUB_MAP[sys === 'water' ? 'water' : 'ww'] || {})[store.get(sys === 'water' ? 'wSub' : 'wwSub', '')] || 'capacity'; }
  gSub = SUB_MAP.growth[gSub] || 'pipeline'; dcSub = SUB_MAP.dca[dcSub] || 'timing';
  { const m = migrateTabKey(footPref); footPref = m.tab; if (m.gSub) gSub = m.gSub; if (m.svcSub) svcSub = m.svcSub; }
  // Labs (Settings › Labs) can add a sub-view: Capital › Funding. Never a fifth chip elsewhere.
  const labOn = id => !!(root.PeelLabs && root.PeelLabs.on(id));
  // Sub-view state per tab: the chip data-attribute, the store key, the valid values, get / set.
  const TABSUBS = {
    growth: { attr: 'gsub', store: 'gSub', valid: ['pipeline', 'areas', 'timing'], get: () => gSub, set: v => { gSub = v; } },
    svc: { attr: 'svcsub', store: 'svcSub', valid: ['capacity', 'network', 'alloc', 'checks'], get: () => svcSub, set: v => { svcSub = v; } },
    dca: { attr: 'dcasub', store: 'dcSub', valid: ['timing', 'projects', 'eas', 'funding'], get: () => dcSub, set: v => { dcSub = v; } },
    records: { attr: 'rsub', store: 'rSub', valid: ['sources', 'checks', 'files'], get: () => rSub, set: v => { rSub = v; } },
  };
  for (const s of Object.values(TABSUBS)) if (!s.valid.includes(s.get())) s.set(s.valid[0]);
  // What each scope hides (a sub-view with nothing to show is hidden, never blank; area-only content
  // never renders at a site). 'site': a development is the scope; 'area': Peel, a municipality, a plan
  // or a result with no files of its own.
  // At a site, Capital › Timing is the site's DC projects (the projects it relies on); the Projects
  // list is Region-wide, so it is hidden there.
  const HIDDEN = {
    site: { growth: ['areas', 'timing'], svc: ['capacity', 'alloc', 'checks'], dca: ['projects', 'funding'], records: ['sources', 'checks'] },
    area: { records: ['files'] },
  };
  const SITE_HIDDEN = HIDDEN.site;
  // Sub-views that are empty at a site are hidden too: EAs with none near the site.
  const EMPTY_AT_SITE = { 'dca:eas': () => !!(root.PeelCapitalEA && root.PeelCapitalEA.siteEaCount && root.PeelCapitalEA.siteEaCount() === 0) };
  // Capital › Funding: only while its Labs switch is on, and never in the public version.
  const isPublic = () => !!(root.PeelUtil && root.PeelUtil.isPublic && root.PeelUtil.isPublic());
  const hiddenAt = (scope, tab, sub) => !!((HIDDEN[scope] || {})[tab] && HIDDEN[scope][tab].includes(sub)) || (tab === 'dca' && sub === 'funding' && (!labOn('funding') || isPublic()))
    || (scope === 'site' && !!(EMPTY_AT_SITE[`${tab}:${sub}`] && root.DevScope && root.DevScope.current() && EMPTY_AT_SITE[`${tab}:${sub}`]()));
  const siteHidden = (tab, sub) => hiddenAt('site', tab, sub);
  // The sub-view a tab shows: the one picked, else (hidden at this scope) the first that is not.
  const subFor = (tab, sub, site, scope = site ? 'site' : 'area') => (hiddenAt(scope, tab, sub) ? TABSUBS[tab].valid.find(v => !hiddenAt(scope, tab, v)) : sub);
  // The chips a tab shows at a scope (≤ 4: tests/four-tabs.test.js).
  const chipsAt = (tab, scope) => (TABSUBS[tab] ? TABSUBS[tab].valid.filter(v => !hiddenAt(scope, tab, v)) : []);
  // Old keys still reach the right tab: 'ww' / 'water' (and 'svc') are Servicing.
  const tabOf = key => (key === 'ww' || key === 'water' ? 'svc' : key);
  function showFootTab(key, sub) {
    if (key === 'dev' || key === 'developments' || key === 'tool') key = 'overview';   // the development's views live in the Overview
    if (key === 'ww' || key === 'water') { if (!sub) sub = svcSub === 'capacity' || svcSub === 'network' ? svcSub : 'network'; key = 'svc'; }
    if (sub && TABSUBS[key] && TABSUBS[key].valid.includes(sub)) { TABSUBS[key].set(sub); store.set(TABSUBS[key].store, sub); }
    if (!document.querySelector(`.f-tab[data-tab="${key}"]:not([hidden])`)) key = 'overview';
    const site = !!(root.DevScope && root.DevScope.current());
    const ssCur = root.PeelSvcScope && root.PeelSvcScope.current && root.PeelSvcScope.current();
    const fileScope = !!(ssCur && ssCur.kind === 'result' && ssCur.rkind === 'file');
    const scopeOf = tk => (site || (tk === 'records' && fileScope) ? 'site' : 'area');
    const an = document.getElementById('analysis'); if (an) an.classList.toggle('site-scope', site);
    for (const [tk, s] of Object.entries(TABSUBS)) { const v = subFor(tk, s.get(), null, scopeOf(tk)); if (v !== s.get()) s.set(v); }
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
    if (root.PeelRecordsTab && root.PeelRecordsTab.syncDevHome) root.PeelRecordsTab.syncDevHome(key);
    if (root.PeelSvcScope) root.PeelSvcScope.peelWideNote();
    if (key === 'dca' && typeof DcaTab().renderDca === 'function') setTimeout(() => DcaTab().renderDca(), 0);
    if (key === 'overview') setTimeout(() => { if (OT() && window.PeelApp) OT().renderOverview(); }, 0);   // (may fire before the app has loaded; its boot renders the overview)
    if (key === 'svc' && svcSub === 'alloc') setTimeout(() => DUI().renderAlloc(), 0);
    if (key === 'svc' && root.PeelSvcCapacity) setTimeout(() => root.PeelSvcCapacity.renderFor(svcSub), 0);
    if (key === 'growth' && gSub === 'areas' && root.PeelPlanTables) setTimeout(() => root.PeelPlanTables.render(), 0);
    // A narrow screen scrolls the tab strip: keep the open tab in view.
    const ft = document.querySelector(`.f-tab[data-tab="${key}"]`), strip = ft && ft.parentElement;
    if (strip && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: Math.max(0, ft.offsetLeft - (strip.clientWidth - ft.offsetWidth) / 2), behavior: 'smooth' });
  }
  for (const g of document.querySelectorAll('.f-subtabs')) g.addEventListener('click', e => {
    const b = e.target.closest('[data-svcsub],[data-gsub],[data-dcasub],[data-rsub]'); if (!b) return;
    const hit = Object.entries(TABSUBS).find(([, s]) => b.dataset[s.attr] != null); if (!hit) return;
    const [tab, s] = hit, v = b.dataset[s.attr];
    s.set(v); store.set(s.store, v); showFootTab(tab); Sh().viewLink.write();
  });
  // A link to a tab and sub-view anywhere in the panel: data-at="tab" or "tab:sub-view".
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('[data-at]'); if (!a) return;
    const [tab, sub] = a.dataset.at.split(':');
    footPref = tabOf(tab); store.set('footTab4', footPref); showFootTab(tab, sub); Sh().viewLink.write();
  });
  showFootTab(footPref);

  // Helper for other modules: set a tab's sub-view, persisting the choice.
  // (An old sub-view name maps onto its new one: 'build' → 'projects', 'byplan' → 'areas', …)
  const setSub = (tab, sub) => { const s = TABSUBS[tab]; if (!s) return; const v = (SUB_MAP[tab] && SUB_MAP[tab][sub]) || sub; if (s.valid.includes(v)) { s.set(v); store.set(s.store, v); } };
  const api = {
    tabOf, TAB_KEYS, SUB_MAP, HIDDEN, hiddenAt, chipsAt,
    getFootPref: () => footPref, setFootPref: v => { footPref = v; },
    getFootTab: () => footTab,
    getSvcSub: () => svcSub, setSvcSub: v => { svcSub = v; store.set('svcSub', v); },
    getGSub: () => gSub, setGSub: v => { gSub = v; },
    getDcSub: () => dcSub, setDcSub: v => { dcSub = v; },
    getRSub: () => rSub, setRSub: v => { rSub = v; },
    showFootTab, TABSUBS, migrateTabKey, setSub, SITE_HIDDEN, siteHidden, subFor,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAnalysisTabs = api;
})(typeof window !== 'undefined' ? window : globalThis);
