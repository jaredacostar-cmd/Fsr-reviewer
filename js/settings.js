(function (root) {
'use strict';
  // Display settings (theme + density) + wet-weather scenario (PeelSettings).
  const { $, store, fmt1 } = window.PeelUtil;
  const PD = window.PeelDesign;
  const App = () => root.PeelApp;
  const GU = () => root.PeelGrowthUI;
  const MA = () => root.PeelMapAnalysis;
  const ST = () => root.PeelSvcTab;
  const DCA = () => root.PeelDcaTab;
  const OT = () => root.PeelOverviewTab;
  const RL = () => root.PeelRenderList;
  const DN = () => root.PeelDevNav;
  const AS = () => root.PeelAreaSelect;
  const AT = () => root.PeelAnalysisTabs;
  window.GearPages = window.GearPages || {};
  window.GearPages.settings = () => GU().settingsPageHTML();
  // ---- Display: theme + density (Settings gear page) ----------------------------------
  function setTheme(v) {
    if (!['dark', 'light', 'device'].includes(v)) v = 'dark';
    store.set('theme', v);
    PD.applyTheme(v);
    App().refreshTheme();
  }
  function setDensity(v) {
    v = v === 'comfortable' ? 'comfortable' : 'compact';
    store.set('density', v);
    PD.applyDensity(v);
  }
  document.addEventListener('change', e => {
    if (!e.target || !e.target.id) return;
    if (e.target.id === 'dsp-theme') setTheme(e.target.value);
    else if (e.target.id === 'dsp-density') setDensity(e.target.value);
    else if (e.target.id === 'dsp-present') store.set('presentTheme', e.target.value === 'app' ? 'app' : 'light');
    else if (e.target.id === 'prep-by') store.set('prepBy', e.target.value.trim());
    else if (e.target.id === 'count-mode') { root.PeelTreeCounts.setMode(e.target.value); App().recount(); }
    else if (e.target.id === 'public-view') { store.set('publicView', !!e.target.checked); root.PeelUtil.applyPublic(); App().refreshTheme(); }
    const w = e.target.closest && e.target.closest('[data-wet]');
    if (w) { App().state.wet[w.dataset.wet] = w.dataset.wet === 'clim' ? w.value : +w.value; wetChanged(); }
  });
  // Saved with the I&I allowance as entered (not scaled by the wet weather scenario).
  function saveCriteria() { store.set('criteria', { ...App().state.criteria, wastewater: { ...App().state.criteria.wastewater, infiltration: App().state.iiBase }, version: 2 }); }
  // ---- Wet weather scenario: design storms and climate change (MTO IDF) ------------------------
  // The I&I allowance (L/s/ha) is taken to carry the peak of a reference storm (the "allowance
  // represents" setting, 25-year by default). A scenario storm scales it by the ratio of the 1-hour
  // rainfall intensities from the MTO IDF curves (Peel average of the 40 blocks), optionally with
  // climate change: the MTO lookup's own trend to a future year, or a percentage uplift (e.g. from
  // the IDF_CC tool). Every pipe, pumping station and DC result uses the scaled allowance.
  const IDF = { data: null, dur: 1 };
  const WET_CLIM = { none: 'today\'s climate', mto2050: 'MTO trend to 2050', mto2080: 'MTO trend to 2080', p10: '+10%', p20: '+20%', p30: '+30%' };
  function wetIntensity(rp, clim) {
    const d = IDF.data, p = d && d.peel[String(rp)]; if (!p) return null;
    let i = p.a * Math.pow(IDF.dur, p.b);
    const m = d.trend.m[d.trend.dur.indexOf(IDF.dur)] || 0;
    if (clim === 'mto2050') i += m * (2050 - d.dataYear); else if (clim === 'mto2080') i += m * (2080 - d.dataYear);
    else if (/^p\d+$/.test(clim || '')) i *= 1 + +clim.slice(1) / 100;
    return i;
  }
  function wetFactor() {
    const w = App().state.wet; if (!w.rp || !IDF.data) return 1;
    const i0 = wetIntensity(w.ref, 'none'), i1 = wetIntensity(w.rp, w.clim);
    return i0 > 0 && i1 > 0 ? i1 / i0 : 1;
  }
  function applyWet() { App().state.criteria.wastewater.infiltration = +(App().state.iiBase * wetFactor()).toFixed(4); }
  const wetText = () => App().state.wet.rp && IDF.data ? `${App().state.wet.rp}-year storm${App().state.wet.clim !== 'none' ? `, ${WET_CLIM[App().state.wet.clim]}` : ''}` : null;
  function wetChanged() {
    store.set('wetWx', App().state.wet); applyWet();
    refreshCriteria(false); MA().renderCapLayer(); MA().renderLegend();
    if (App().state.svcModel) ST().renderSvcTab();
    if (AT().getFootTab() === 'dca') DCA().renderDca(); if (AT().getFootTab() === 'overview') OT().renderOverview();
    // (the box lives in the Scenario control: its summary names the storm too)
    if (ST() && ST().renderScenario) ST().renderScenario(); else { const f = $('#wet-box'); if (f) f.outerHTML = wetBoxHTML(); }
  }
  function wetBoxHTML() {
    const w = App().state.wet, d = IDF.data;
    if (!d) return '<div id="wet-box"></div>';
    const opt = (k, v, t) => `<option value="${v}"${String(w[k]) === String(v) ? ' selected' : ''}>${t}</option>`;
    const rps = [2, 5, 10, 25, 50, 100], f = wetFactor(), i0 = wetIntensity(w.ref, 'none'), i1 = w.rp ? wetIntensity(w.rp, w.clim) : i0;
    return `<fieldset id="wet-box" class="wet-box" data-info="wet-weather"><legend>Wet weather scenario (design storm)</legend>
      <label class="field"><span>Storm</span><select data-wet="rp">${opt('rp', 0, 'Design allowance (no scaling)')}${rps.map(r => opt('rp', r, `${r}-year`)).join('')}</select></label>
      <label class="field"><span>Climate</span><select data-wet="clim"${w.rp ? '' : ' disabled'}>${Object.entries(WET_CLIM).map(([k, t]) => opt('clim', k, t)).join('')}</select></label>
      <label class="field"><span>Allowance represents</span><select data-wet="ref"${w.rp ? '' : ' disabled'}>${rps.map(r => opt('ref', r, `${r}-year storm`)).join('')}</select></label>
      <p class="small">${w.rp ? `I&amp;I <strong>${App().state.iiBase} → ${fmt1(App().state.criteria.wastewater.infiltration)} L/s/ha</strong> (×${f.toFixed(2)}): 1-hour intensity ${fmt1(i0)} → ${fmt1(i1)} mm/h.` : `I&amp;I at the design allowance, ${App().state.iiBase} L/s/ha. Pick a storm to scale it (1-hour ${w.ref}-year intensity ${fmt1(i0)} mm/h).`}</p>
      <p class="small muted">MTO IDF Curve Look-up, average of the 40 blocks (the 1-hour intensity varies ${(() => { const v = Object.values(d.blocks).map(b => b['25']); return `${fmt1(Math.min(...v))}–${fmt1(Math.max(...v))}`; })()} × t^${d.peel['25'].b} across Peel for the 25-year storm). Climate: the MTO lookup's trend (+${(d.trend.m[4] * 40).toFixed(1)} mm/h at 1 hour by 2050) or an uplift from the Western University IDF_CC tool. A screening scale on the allowance, not a calibrated RDII model: the Region's flow monitoring (Dragonfly) would set block-by-block response.</p>
    </fieldset>`;
  }
  // Criteria changed: redraw everything that uses them (jobs also feed the summaries and the open development).
  function refreshCriteria(jobs) {
    if (jobs) { App().clearEmp(); RL().renderPipeline(App().state.projects.filter(p => App().matches(p, true))); }
    GU().renderGrowth();
    // Redraw an open result scope that shows demand or jobs (a selection, a file), keeping its scroll.
    const S = root.PeelSvcScope, host = $('#scope-body'), top = host ? host.scrollTop : 0;
    if (!S || !S.hasResult()) return;
    S.reopenResult();
    if (host) host.scrollTop = top;
  }
  // Reset to Peel defaults now lives in the Scenario control's criteria editor
  // (renderScenarioCriteria): the #d-reset button it handled was moved there.
  // Phase 4 (Worker G): editable criteria moved from this tab to the Scenario control.
  function resetCriteriaToPeel() {
    App().state.criteria = App().mergeCriteria(null); store.set('criteria', null);
    App().state.iiBase = App().state.criteria.wastewater.infiltration; applyWet();
  }

  // ---- Public contract ------------------------------------------------------------------
  const api = { setTheme, setDensity, saveCriteria, IDF, WET_CLIM, wetIntensity, wetFactor, applyWet, wetText, wetChanged, wetBoxHTML, refreshCriteria, resetCriteriaToPeel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSettings = api;
})(typeof window !== 'undefined' ? window : globalThis);
