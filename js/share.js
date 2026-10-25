(function (root) {
'use strict';
  const { $ } = window.PeelUtil;
  const P = window.PeelPhases;
  const PF = window.PeelFilters || { FLAG_META: [], PHASE_LAYER_MAP: {}, wwLayersFromStages: () => ({ built: false, approved: false, proposed: false }), migrateLegacyFocus: () => ({ flags: [], basis: 'all', minUnits: 0, landuse: 'all', yearPreset: null }), encodeFlagParam: () => '', decodeFlagParam: () => ({}) };
  const map = window.PeelMapCore.map;
  const App = () => root.PeelApp;
  const TL = () => root.PeelTimeline;
  const AT = () => root.PeelAnalysisTabs;
  const DN = () => root.PeelDevNav;
  const SD = () => root.PeelSvcData;
  const MM = () => root.PeelMapMarkers;
  const MA = () => root.PeelMapAnalysis;
  const SVCT = () => root.PeelSvcTab;
  const SF = () => root.PeelSearchFilter;
  // ---- Shareable links: filters, tab, switches, map view and the open development in the URL ----
  // #ph=…&fl=…&pl=…&dw=…&lu=…&basis=…&cy=…&mu=…&k=…&q=…&sp=…&mt=…&pz=…&dr=…&u=…&nn=0&ym=…&yf=…&yt=…&t=…&ws=…&gs=…&dcs=…&wm=…&md=…&dv=…&m=lat,lng,zoom&d=key
  // (pre-Phase-1 links used fo=… for the quick-view focus; it is migrated on read —
  // see migrateLegacyFocus in js/filters.js)
  const viewLink = (() => {
    let pending = location.hash.length > 1 ? new URLSearchParams(location.hash.slice(1)) : null, applied = !pending, timer;
    const encode = () => {
      const q = new URLSearchParams(), set = (k, v) => { if (v !== '' && v != null) q.set(k, v); };
      const W = window.PeelWorkspaces;
      // (always written: links made before Completed was shown by default carry no ph and open with the
      // active phases, as they did)
      set('ph', [...App().state.phases].join(','));
      const fl = PF.encodeFlagParam(App().state.flags); if (fl) set('fl', fl);
      set('pl', App().state.plant); set('dw', App().state.dwelling);
      if (App().state.landuse !== App().DEFAULT_LANDUSE) set('lu', App().state.landuse);
      if (App().state.dcgate) set('dg', App().state.dcgate);
      if (App().state.basis !== App().DEFAULT_BASIS) set('basis', App().state.basis);
      if (App().state.showDormant) set('dm', '1');
      if (App().state.showSiteActivity) set('sx', '1');
      if (MA().getCapYear() !== MM().THIS_YEAR) set('cy', MA().getCapYear() == null ? 'bo' : String(MA().getCapYear()));
      set('mu', App().state.muni); if (App().state.kind !== App().DEFAULT_KIND) set('k', App().state.kind); set('q', App().state.search);
      if (App().state.sp.length) set('sp', App().state.sp.join(',')); set('mt', App().state.mtsa.join(',')); set('pz', App().state.pz.join(',')); set('dr', App().state.dr.join(','));
      if (App().state.lyr) set('ly', [...App().state.lyr].join(','));   // "Counts as" layers
      if (App().state.minUnits) set('u', App().state.minUnits); if (!App().state.newOnly) set('nn', '0');
      if (App().state.yearMode !== 'any') set('ym', App().state.yearMode);
      if (!TL().atDefaultYears()) { set('yf', TL().tFrom.value); set('yt', TL().tTo.value); }
      // The tab and its sub-view (Stage 2: Servicing is one tab, svs=capacity|network|alloc|checks). On a
      // workspace's page, the page's own tab (the one behind it), not the map's last pick; nav=2 says so
      // (links before it always wrote the map's tab: on a page link that one is not read, below).
      const pageWs = W && W.mode() === 'home' && W.page && W.BY_ID[W.page()];
      const tab = pageWs ? pageWs.tab : AT().getFootPref();
      set('nav', '2');
      set('t', tab);
      if (tab === 'svc') set('svs', AT().getSvcSub()); if (tab === 'records') set('rs', AT().getRSub());
      if (tab === 'growth') set('gs', AT().getGSub()); if (tab === 'dca') set('dcs', AT().getDcSub());
      if (SVCT().svcOpt.ww !== 'calibrated') set('wm', SVCT().svcOpt.ww); if (SVCT().svcOpt.md !== 'design') set('md', SVCT().svcOpt.md); if (SVCT().svcOpt.div !== 'off') set('dv', SVCT().svcOpt.div); if (SVCT().svcOpt.nr !== 'on') set('nr', SVCT().svcOpt.nr);
      if (MM().mstyle.color !== 'phase' || MM().mstyle.size !== 'fixed' || MM().mstyle.cap !== 'off') set('ms', `${MM().mstyle.color}.${MM().mstyle.size}.${MM().mstyle.cap}`);
      // Layer groups: the layers on and the groups open (js/layer-groups.js).
      if (window.PeelLayerGroups) set('lg', window.PeelLayerGroups.encodeCurrent());
      const c = map.getCenter(); set('m', `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
      // Stage 4: Home, a workspace's page or its map view (w=home | w=p:<chip> | w=<chip>); a link without
      // w opens the full map.
      if (W && W.mode() === 'home') set('w', W.page && W.page() !== 'home' ? `p:${W.page()}` : 'home'); else if (W && W.mode() === 'ws' && W.current()) set('w', W.current());
      // Phase 3: the scoped development carries the dev focus in the link, not the #detail panel.
      const sc = typeof DevScope !== 'undefined' ? DevScope.current() : null;
      if (sc) set('d', sc.key);
      // servicing scope (plant / station / block / zone), or a result scope that can be re-opened
      set('ss', App().state.ss && window.PeelSvcScope && window.PeelSvcScope.isResultRef(App().state.ss) && !/^(pipe|file|dcwork|iiblock|ea|cap):/.test(App().state.ss) ? null : App().state.ss);
      return q.toString();
    };
    const write = () => { if (!applied) return; clearTimeout(timer); timer = setTimeout(() => { const h = encode(); history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search); }, 300); };
    // Apply a link once the developments (and the areas / servicing layers it names) have loaded.
    // (a link naming areas or servicing layers waits for them, 20 s at most: one that failed to load
    // would otherwise leave the whole link unapplied, and the address never updated again)
    let waitT = null, wait0 = null;
    const ready = () => {
      if (applied) { write(); return; }
      const q = pending;
      if (!App().state.projects.length) return;
      const needAreas = (q.get('sp') || q.get('mt')) && !App().state.areas, needSvc = (q.get('pz') || q.get('dr') || q.get('ss')) && !App().state.servicing;
      if (needAreas || needSvc) {
        if (wait0 == null) wait0 = Date.now();
        if (Date.now() - wait0 < 20000) { if (!waitT) waitT = setTimeout(() => { waitT = null; ready(); }, 20500); return; }
        for (const k of needAreas ? ['sp', 'mt'] : []) q.delete(k);
        for (const k of needSvc ? ['pz', 'dr', 'ss'] : []) q.delete(k);
      }
      clearTimeout(waitT); waitT = null; wait0 = null;
      applied = true;
      // A link carries its whole scenario: what it leaves out is at its default (the counting basis and
      // the servicing switches would otherwise be whatever this browser last used).
      App().state.basis = App().DEFAULT_BASIS;
      for (const [k, o, d] of [['wm', 'ww', 'calibrated'], ['md', 'md', 'design'], ['dv', 'div', 'off'], ['nr', 'nr', 'on']]) SVCT().svcOpt[o] = q.get(k) || d;
      if (q.get('ph')) { App().state.phases = new Set(q.get('ph').split(',').filter(k => P.PHASE_BY_KEY[k])); App().state.oldLink = false; }
      else {
        App().state.phases = new Set(App().ACTIVE_PHASES);   // an older link: the default then (no Completed)
        // Say so: the same data then shows fewer developments and units than a fresh open. A line where the
        // filters are, with Include Completed (js/filter-ui.js oldLinkNote), not a toast over the figures.
        App().state.oldLink = true;
      }
      if (q.has('fo')) {
        // Pre-Phase-1 focus link: migrate onto the new state (growth / none drop to the defaults).
        const mig = PF.migrateLegacyFocus(q.get('fo'));
        for (const k of mig.flags) App().state.flags[k] = true;
        if (mig.basis !== App().DEFAULT_BASIS) App().state.basis = mig.basis;
        if (mig.minUnits) App().state.minUnits = mig.minUnits;
        if (mig.landuse !== App().DEFAULT_LANDUSE) App().state.landuse = mig.landuse;
        if (mig.yearPreset === 'last12m') TL().setLast12Months();
      } else {
        App().state.flags = PF.decodeFlagParam(q.get('fl'));
      }
      if (q.get('pl') && SD().PLANT_SHORT[q.get('pl')]) App().state.plant = q.get('pl');
      if (q.get('dw') && ['single', 'town', 'apartment'].includes(q.get('dw'))) App().state.dwelling = q.get('dw');
      if (q.get('lu') && ['all', 'growth', 'residential', 'mixed', 'employment'].includes(q.get('lu'))) App().state.landuse = q.get('lu');
      if (q.get('dg') && window.PeelDcGate && window.PeelDcGate.FILTER_KEYS.has(q.get('dg'))) { App().state.dcgate = q.get('dg'); window.PeelDcGate.load(); }
      if (q.get('basis') && ['all', 'buildout', 'committed', 'remaining'].includes(q.get('basis'))) App().state.basis = q.get('basis');
      // Dormant developments shown (they are held aside when the developments are built: rebuild).
      if ((q.get('dm') === '1') !== !!App().state.showDormant) { App().state.showDormant = q.get('dm') === '1'; if (App().state.projects.length) App().rehold(); }
      // Site activity shown (held aside like the dormant ones).
      if ((q.get('sx') === '1') !== !!App().state.showSiteActivity) { App().state.showSiteActivity = q.get('sx') === '1'; if (App().state.projects.length) App().rehold(); }
      { const ly = (q.get('ly') || '').split(',').filter(k => (window.PeelLayers && window.PeelLayers.RUNG_VIEW ? window.PeelLayers.RUNG_VIEW.map(r => r.key) : []).includes(k)); App().state.lyr = ly.length ? new Set(ly) : null; }
      if (q.get('cy')) MA().setCapYear(q.get('cy') === 'bo' ? null : (+q.get('cy') || MM().THIS_YEAR));
      App().state.muni = q.get('mu') || ''; App().state.kind = q.get('k') || App().DEFAULT_KIND; App().state.search = q.get('q') || '';
      App().state.sp = q.get('sp') ? q.get('sp').split(',') : []; const list = k => (q.get(k) || '').split(',').filter(Boolean); App().state.mtsa = list('mt'); App().state.pz = list('pz'); App().state.dr = list('dr');
      // A result scope (a pipe, a file, a DC work, a block) re-runs its producer once its data loads (SPEC §3).
      { const ss = q.get('ss') || null, S = window.PeelSvcScope; if (ss && S && S.isResultRef(ss)) { App().state.ss = null; setTimeout(() => S.restore(ss), 0); } else App().state.ss = ss; }
      // Old links could carry u=left / u=committed (the old size select's basis steps):
      // they migrate to the counting basis, like the old fo=left / fo=committed.
      if (q.get('u') === 'left') { App().state.minUnits = 0; App().state.basis = 'remaining'; }
      else if (q.get('u') === 'committed') { App().state.minUnits = 0; App().state.basis = 'committed'; }
      else App().state.minUnits = Number(q.get('u')) || 0;
      App().state.newOnly = q.get('nn') !== '0';
      if (q.get('ym') && [...$('#t-mode').options].some(o => o.value === q.get('ym'))) { App().state.yearMode = q.get('ym'); $('#t-mode').value = App().state.yearMode; }
      SF().syncFilterControls();
      if (q.get('ms')) { const [color, size, cap] = q.get('ms').split('.'); for (const [k, v] of [['color', color], ['size', size], ['cap', cap]]) if (MM().MSTYLE[k][v]) MM().mstyle[k] = v; }
      // Layers (lg=…). Links from before the groups have none: their layers stay as the view sets them
      // (and ms= above), as they opened before.
      if (q.get('lg') && window.PeelLayerGroups) { const lg = q.get('lg'); setTimeout(() => window.PeelLayerGroups.applyEncoded(lg), 0); }
      // A workspace page's link from before nav=2 carried the map's tab, not the page's: when that page is
      // the one open (the link opened it), the page's own tab and sub-view go behind it. A saved view
      // applied on the full map opens no page, so it keeps its own t.
      const W = window.PeelWorkspaces, w = q.get('w') || '';
      const pid = !(Number(q.get('nav')) >= 2) && /^p:/.test(w) && W && W.resolvePage ? W.resolvePage(w.slice(2), { site: !!q.get('d'), last: window.PeelUtil.store.get('lastWs', '') }) : '';
      const pageWs = pid && W.mode() === 'home' && W.page() === pid && Object.prototype.hasOwnProperty.call(W.BY_ID, pid) ? W.BY_ID[pid] : null;
      if (q.get('t') || pageWs) {
        // Phase 4: old links name removed tabs — migrateTabKey maps them onto the new set.
        // Stage 2: old links name the Wastewater / Water halves (t=ww|water&ws=…) and old sub-views
        // (gs=census2051|byplan, dcs=build|recommendations|funding); migrateTabKey maps them on, and every
        // sub-view param goes through it, so a sub-view moved to another tab is followed, never dropped.
        const t = pageWs ? pageWs.tab : q.get('t');
        const oldSub = pageWs ? pageWs.sub : t === 'ww' || t === 'water' ? q.get('ws') : t === 'growth' ? q.get('gs') : t === 'dca' ? q.get('dcs') : t === 'svc' ? q.get('svs') : t === 'records' ? q.get('rs') : null;
        const m = AT().migrateTabKey(t, oldSub);
        AT().setFootPref(m.tab); if (m.gSub) AT().setGSub(m.gSub); if (m.svcSub) AT().setSvcSub(m.svcSub); if (m.dcSub) AT().setDcSub(m.dcSub); if (m.rSub) AT().setRSub(m.rSub);
        // (a Servicing or Records sub-view named beside another tab is kept for its tab, as before)
        for (const [tab, k] of [['svc', 'svs'], ['records', 'rs']]) {
          const r = q.get(k) && tab !== t ? AT().migrateSub(tab, q.get(k)) : null;
          if (r && r.tab === 'svc') AT().setSvcSub(r.sub); else if (r && r.tab === 'records') AT().setRSub(r.sub);
        }
        // An old link to the funding screen or the hydraulic check turns that Labs switch on, so the
        // link still opens its view.
        if (window.PeelLabs && (m.dcSub === 'funding' || q.get('dcs') === 'funding')) window.PeelLabs.set('funding', true);
        if (window.PeelLabs && q.get('t') === 'water' && q.get('ws') === 'hydro') window.PeelLabs.set('hydro', true);
      }
      SD().showSvcArea(false);
      if (q.get('m')) { const [la, ln, z] = q.get('m').split(',').map(Number); if (isFinite(la) && isFinite(ln)) map.setView([la, ln], isFinite(z) ? z : map.getZoom()); }
      if (q.get('yf') && q.get('yt')) TL().setYears(Number(q.get('yf')), Number(q.get('yt'))); else App().applyFilters();
      AT().showFootTab(AT().getFootPref());
      const d = q.get('d') && DN().projectByKey(q.get('d'));
      // (opening a development shows its Overview: the link's own tab, or its page's, goes back on after it)
      if (d) { DN().showDetail(d); if (q.get('t') || pageWs) AT().showFootTab(AT().getFootPref()); }
      write();
    };
    map.on('moveend', write);
    // Apply a saved view's link: back to the defaults, then its filters.
    const apply = h => {
      App().state.phases = App().DEFAULT_PHASES(); App().state.flags = App().DEFAULT_FLAGS(); App().state.plant = ''; App().state.ss = null; App().state.dwelling = ''; App().state.landuse = App().DEFAULT_LANDUSE; App().state.dcgate = ''; App().state.basis = App().DEFAULT_BASIS; MA().setCapYear(MM().THIS_YEAR); App().state.yearMode = 'any'; $('#t-mode').value = 'any';
      if (App().state.yearMin != null) TL().setYearsSilently(App().state.yearMin, App().state.yearMax);
      pending = new URLSearchParams(h); applied = false; ready();
    };
    return { ready, write, apply, hash: () => encode(), url: () => `${location.origin}${location.pathname}#${encode()}` };
  })();
  async function copyViewLink() {
    const url = viewLink.url();
    // (the Export menu closes on the click, so the confirmation is a toast, not the button's label)
    try { await navigator.clipboard.writeText(url); if (window.PeelUtil && window.PeelUtil.toast) window.PeelUtil.toast('Link copied: it opens this view, with its filters and scenario'); }
    catch (e) { prompt('Copy this link:', url); }
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) copyViewLink(); });

  // ---- Public contract ------------------------------------------------------------------
  const api = { viewLink, copyViewLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
