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
      if (!App().sameSet(App().state.phases, App().DEFAULT_PHASES())) set('ph', [...App().state.phases].join(','));
      const fl = PF.encodeFlagParam(App().state.flags); if (fl) set('fl', fl);
      set('pl', App().state.plant); set('dw', App().state.dwelling);
      if (App().state.landuse !== App().DEFAULT_LANDUSE) set('lu', App().state.landuse);
      if (App().state.basis !== App().DEFAULT_BASIS) set('basis', App().state.basis);
      if (MA().getCapYear() !== MM().THIS_YEAR) set('cy', MA().getCapYear() == null ? 'bo' : String(MA().getCapYear()));
      set('mu', App().state.muni); if (App().state.kind !== App().DEFAULT_KIND) set('k', App().state.kind); set('q', App().state.search);
      if (App().state.sp.length) set('sp', App().state.sp.join(',')); set('mt', App().state.mtsa.join(',')); set('pz', App().state.pz.join(',')); set('dr', App().state.dr.join(','));
      if (App().state.lyr) set('ly', [...App().state.lyr].join(','));   // "Counts as" layers
      if (App().state.minUnits) set('u', App().state.minUnits); if (!App().state.newOnly) set('nn', '0');
      if (App().state.yearMode !== 'any') set('ym', App().state.yearMode);
      if (!TL().atDefaultYears()) { set('yf', TL().tFrom.value); set('yt', TL().tTo.value); }
      set('t', AT().getFootPref()); if (AT().getFootPref() === 'ww') set('ws', AT().getWwSub()); if (AT().getFootPref() === 'water') set('ws', AT().getWSub());
      if (AT().getFootPref() === 'growth') set('gs', AT().getGSub()); if (AT().getFootPref() === 'dca') set('dcs', AT().getDcSub());
      if (SVCT().svcOpt.ww !== 'calibrated') set('wm', SVCT().svcOpt.ww); if (SVCT().svcOpt.md !== 'design') set('md', SVCT().svcOpt.md); if (SVCT().svcOpt.div !== 'off') set('dv', SVCT().svcOpt.div); if (SVCT().svcOpt.nr !== 'on') set('nr', SVCT().svcOpt.nr);
      if (MM().mstyle.color !== 'phase' || MM().mstyle.size !== 'fixed' || MM().mstyle.cap !== 'off') set('ms', `${MM().mstyle.color}.${MM().mstyle.size}.${MM().mstyle.cap}`);
      // Layer groups: the layers on and the groups open (js/layer-groups.js).
      if (window.PeelLayerGroups) set('lg', window.PeelLayerGroups.encodeCurrent());
      const c = map.getCenter(); set('m', `${c.lat.toFixed(5)},${c.lng.toFixed(5)},${map.getZoom()}`);
      // Phase 3: the scoped development carries the dev focus in the link, not the #detail panel.
      const sc = typeof DevScope !== 'undefined' ? DevScope.current() : null;
      if (sc) set('d', sc.key);
      // servicing scope (plant / station / block / zone), or a result scope that can be re-opened
      set('ss', App().state.ss && window.PeelSvcScope && window.PeelSvcScope.isResultRef(App().state.ss) && !/^(pipe|file|dcwork|iiblock|ea|cap):/.test(App().state.ss) ? null : App().state.ss);
      return q.toString();
    };
    const write = () => { if (!applied) return; clearTimeout(timer); timer = setTimeout(() => { const h = encode(); history.replaceState(null, '', h ? `#${h}` : location.pathname + location.search); }, 300); };
    // Apply a link once the developments (and the areas / servicing layers it names) have loaded.
    const ready = () => {
      if (applied) { write(); return; }
      const q = pending;
      if (!App().state.projects.length || ((q.get('sp') || q.get('mt')) && !App().state.areas) || ((q.get('pz') || q.get('dr') || q.get('ss')) && !App().state.servicing)) return;
      applied = true;
      if (q.get('ph')) App().state.phases = new Set(q.get('ph').split(',').filter(k => P.PHASE_BY_KEY[k]));
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
      if (q.get('basis') && ['all', 'buildout', 'committed', 'remaining'].includes(q.get('basis'))) App().state.basis = q.get('basis');
      { const ly = (q.get('ly') || '').split(',').filter(k => ['existing', 'built', 'committed', 'proposed', 'anticipated'].includes(k)); App().state.lyr = ly.length ? new Set(ly) : null; }
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
      for (const [k, o] of [['wm', 'ww'], ['md', 'md'], ['dv', 'div'], ['nr', 'nr']]) if (q.get(k)) SVCT().svcOpt[o] = q.get(k);
      if (q.get('ms')) { const [color, size, cap] = q.get('ms').split('.'); for (const [k, v] of [['color', color], ['size', size], ['cap', cap]]) if (MM().MSTYLE[k][v]) MM().mstyle[k] = v; }
      // Layers (lg=…). Links from before the groups have none: their layers stay as the view sets them
      // (and ms= above), as they opened before.
      if (q.get('lg') && window.PeelLayerGroups) { const lg = q.get('lg'); setTimeout(() => window.PeelLayerGroups.applyEncoded(lg), 0); }
      if (q.get('t')) {
        // Phase 4: old links name removed tabs — migrateTabKey maps them onto the new set.
        const m = AT().migrateTabKey(q.get('t'));
        AT().setFootPref(m.tab); if (m.gSub) AT().setGSub(m.gSub); if (m.wwSub) AT().setWwSub(m.wwSub);
        if (q.get('ws')) { const v = q.get('ws'); if (AT().getFootPref() === 'water' && AT().TABSUBS.water.valid.includes(v)) AT().setWSub(v); else if (AT().getFootPref() === 'ww' && AT().TABSUBS.ww.valid.includes(v)) AT().setWwSub(v); }
        if (q.get('gs') && AT().TABSUBS.growth.valid.includes(q.get('gs'))) AT().setGSub(q.get('gs'));
        if (q.get('dcs') && AT().TABSUBS.dca.valid.includes(q.get('dcs'))) AT().setDcSub(q.get('dcs'));
      }
      SD().showSvcArea(false);
      if (q.get('m')) { const [la, ln, z] = q.get('m').split(',').map(Number); if (isFinite(la) && isFinite(ln)) map.setView([la, ln], isFinite(z) ? z : map.getZoom()); }
      if (q.get('yf') && q.get('yt')) TL().setYears(Number(q.get('yf')), Number(q.get('yt'))); else App().applyFilters();
      AT().showFootTab(AT().getFootPref());
      const d = q.get('d') && DN().projectByKey(q.get('d'));
      if (d) DN().showDetail(d);
      write();
    };
    map.on('moveend', write);
    // Apply a saved view's link: back to the defaults, then its filters.
    const apply = h => {
      App().state.phases = App().DEFAULT_PHASES(); App().state.flags = App().DEFAULT_FLAGS(); App().state.plant = ''; App().state.ss = null; App().state.dwelling = ''; App().state.landuse = App().DEFAULT_LANDUSE; App().state.basis = App().DEFAULT_BASIS; MA().setCapYear(MM().THIS_YEAR); App().state.yearMode = 'any'; $('#t-mode').value = 'any';
      if (App().state.yearMin != null) TL().setYearsSilently(App().state.yearMin, App().state.yearMax);
      pending = new URLSearchParams(h); applied = false; ready();
    };
    return { ready, write, apply, hash: () => encode(), url: () => `${location.origin}${location.pathname}#${encode()}` };
  })();
  async function copyViewLink(btn) {
    const url = viewLink.url();
    try { await navigator.clipboard.writeText(url); btn.textContent = 'Link copied'; }
    catch (e) { prompt('Copy this link:', url); }
    setTimeout(() => { btn.textContent = 'Share link'; }, 1800);
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-share]'); if (b) copyViewLink(b); });

  // ---- Public contract ------------------------------------------------------------------
  const api = { viewLink, copyViewLink };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelShare = api;
})(typeof window !== 'undefined' ? window : globalThis);
