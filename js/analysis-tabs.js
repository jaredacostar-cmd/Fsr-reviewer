(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { store } = window.PeelUtil;
  const DcaTab = () => window.PeelDcaTab;
  const OT = () => window.PeelOverviewTab;
  const DUI = () => window.PeelDemandUI;
  const Sh = () => window.PeelShare;

  // ---- Analysis tabs (Phase 4): Overview · Growth · Water · Wastewater · DC ----
  // (+ Development when a site is open, + Tool result). footPref: the tab last picked
  // (kept). Growth / Water / Wastewater / DC each have sub-views (TABSUBS): the sub-view
  // last picked is kept too. Removed tabs migrate onto the new set (migrateTabKey).
  let footPref = store.get('footTab4', 'overview'), footTab = 'overview';
  let wwSub = store.get('wwSub', 'plants'), wSub = store.get('wSub', 'capacity');
  let gSub = store.get('gSub', 'pipeline'), dcSub = store.get('dcSub', 'timing');
  // Share links and stored prefs may name tabs removed in the restructure; migrate
  // them onto the new tab set (pure — unit-tested in tests/analysis-tabs.test.js).
  const migrateTabKey = (t) => {
    if (t === 'demand') return { tab: 'growth' };
    if (t === 'census') return { tab: 'growth', gSub: 'census2051' };
    if (t === 'criteria' || t === 'log') return { tab: 'overview' };
    if (t === 'svc') return { tab: 'water' };
    if (t === 'plants') return { tab: 'ww', wwSub: 'plants' };
    return { tab: t };
  };
  { const m = migrateTabKey(footPref); footPref = m.tab; if (m.gSub) gSub = m.gSub; if (m.wwSub) wwSub = m.wwSub; }
  // Sub-view state per tab: the button data-attribute, the store key, the valid
  // values, and get/set behind showFootTab, the subtab buttons and the share link.
  const TABSUBS = {
    water: { attr: 'wsub', store: 'wSub', valid: ['capacity', 'zones', 'facilities', 'hydro'], get: () => wSub, set: v => { wSub = v; } },
    ww: { attr: 'wwsub', store: 'wwSub', valid: ['plants', 'catchments', 'alloc', 'pumpstations'], get: () => wwSub, set: v => { wwSub = v; } },
    growth: { attr: 'gsub', store: 'gSub', valid: ['pipeline', 'census2051', 'timing'], get: () => gSub, set: v => { gSub = v; } },
    dca: { attr: 'dcasub', store: 'dcSub', valid: ['timing', 'recommendations', 'funding'], get: () => dcSub, set: v => { dcSub = v; } },
  };
  for (const s of Object.values(TABSUBS)) if (!s.valid.includes(s.get())) s.set(s.valid[0]);
  function showFootTab(key) {
    if (key === 'dev') key = 'overview';   // the development's views live in the Overview
    // The public version shows DC timing only (no funding screen or recommendations).
    if (dcSub !== 'timing' && root.PeelUtil && root.PeelUtil.isPublic && root.PeelUtil.isPublic()) dcSub = 'timing';
    if (!document.querySelector(`.f-tab[data-tab="${key}"]:not([hidden])`)) key = 'overview';
    footTab = key;
    for (const t of document.querySelectorAll('.f-tab')) t.setAttribute('aria-selected', String(t.dataset.tab === key));
    for (const p of document.querySelectorAll('.f-pane')) {
      const pk = p.dataset.pane === 'dc' ? 'dca' : p.dataset.pane;   // the DC subtab row uses data-pane="dc"
      p.hidden = pk !== key || p.dataset.off === '1' || (p.dataset.sub != null && (!TABSUBS[pk] || p.dataset.sub !== TABSUBS[pk].get()));
    }
    for (const s of Object.values(TABSUBS))
      for (const b of document.querySelectorAll(`[data-${s.attr}]`)) { const on = b.dataset[s.attr] === s.get(); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }
    if (root.PeelSvcScope) root.PeelSvcScope.peelWideNote();
    if (key === 'dca' && typeof DcaTab().renderDca === 'function') setTimeout(() => DcaTab().renderDca(), 0);
    if (key === 'overview') setTimeout(() => { if (OT() && window.PeelApp) OT().renderOverview(); }, 0);   // (may fire before the app has loaded; its boot renders the overview)
    if (key === 'ww' && wwSub === 'alloc') setTimeout(() => DUI().renderAlloc(), 0);
    // A narrow screen scrolls the tab strip: keep the open tab in view.
    const ft = document.querySelector(`.f-tab[data-tab="${key}"]`), strip = ft && ft.parentElement;
    if (strip && strip.scrollWidth > strip.clientWidth) strip.scrollTo({ left: Math.max(0, ft.offsetLeft - (strip.clientWidth - ft.offsetWidth) / 2), behavior: 'smooth' });
  }
  for (const g of document.querySelectorAll('.f-subtabs')) g.addEventListener('click', e => {
    const b = e.target.closest('[data-wwsub],[data-wsub],[data-gsub],[data-dcasub]'); if (!b) return;
    const hit = Object.entries(TABSUBS).find(([, s]) => b.dataset[s.attr] != null); if (!hit) return;
    const [tab, s] = hit, v = b.dataset[s.attr];
    s.set(v); store.set(s.store, v); showFootTab(tab); Sh().viewLink.write();
  });
  showFootTab(footPref);

  // Helper for other modules: set a tab's sub-view, persisting the choice.
  const setSub = (tab, sub) => { const s = TABSUBS[tab]; if (s) { s.set(sub); store.set(s.store, sub); } };
  const api = {
    getFootPref: () => footPref, setFootPref: v => { footPref = v; },
    getFootTab: () => footTab,
    getWwSub: () => wwSub, setWwSub: v => { wwSub = v; store.set('wwSub', v); },
    getWSub: () => wSub, setWSub: v => { wSub = v; },
    getGSub: () => gSub, setGSub: v => { gSub = v; },
    getDcSub: () => dcSub, setDcSub: v => { dcSub = v; },
    showFootTab, TABSUBS, migrateTabKey, setSub,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAnalysisTabs = api;
})(typeof window !== 'undefined' ? window : globalThis);
