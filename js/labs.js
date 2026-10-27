(function (root) {
  'use strict';
  // ---- Labs (Settings › Labs, Stage 2) ---------------------------------------------------------
  // Tools that are useful but not part of the everyday review sit behind a switch here, off by
  // default and remembered per browser: the hydraulic check, the DC funding screen, the 3D view,
  // the Time Box, the SWMM export and batch test sites. Each switch adds a class to <html>
  // (lab-<id>); css/app.css hides the tool while its class is missing, and the panel code asks
  // PeelLabs.on(id) where a view depends on it (the funding screen in Capital › DC timing). Old share links to the
  // funding screen or the hydraulic check turn their switch on (js/share.js), so they still open.
  const U = root.PeelUtil || {};
  const store = U.store || { get: (k, d) => d, set: () => {} };
  const esc = U.esc || (s => String(s));
  const LABS = [
    { id: 'hydro', label: 'Hydraulic check (beta)', where: 'Servicing › Network', what: 'An experimental EPANET check of the large mains feeding each upper pressure zone.' },
    { id: 'funding', label: 'DC funding', where: 'Capital › DC timing', what: 'The funding screen (screening results within / outside a budget) and funding levels.' },
    { id: '3d', label: '3D view', where: 'the map', what: 'Terrain, buildings and proposals in 3D (indicative).' },
    { id: 'timebox', label: 'Time Box', where: 'the tool rail', what: 'Aerial imagery over the years for a box, with the applications filed by then.' },
    { id: 'swmm', label: 'SWMM export', where: 'Export', what: 'The wastewater blocks as a SWMM model (.inp).' },
    { id: 'batch', label: 'Batch test sites', where: 'Test a site', what: 'Test many sites at once from a CSV.' },
    { id: 'gravity', label: 'Gravity check', where: 'a development\u2019s Servicing tab', what: 'Can the site drain by gravity to the nearest Region sanitary sewer? A straight-line design to Peel\u2019s rules, with a profile.' },
    { id: 'sewer', label: 'Sewer designer', where: 'the tool rail', what: 'Draw a gravity sanitary sewer to an existing sewer: the least-excavation design to Peel\u2019s Linear Wastewater Standards, with the plan, the profile, the rules checked and a CSV.' },
    { id: 'pressure', label: 'Pressure check', where: 'a development\u2019s Servicing tab', what: 'The water pressure at the site\u2019s ground from its zone\u2019s grade line, against Peel\u2019s 40–100 psi, and how many storeys keep 40 psi.' },
  ];
  const IDS = LABS.map(l => l.id);
  let on = new Set((store.get('labs', []) || []).filter(id => IDS.includes(id)));
  const sync = () => {
    if (typeof document === 'undefined') return;
    for (const id of IDS) document.documentElement.classList.toggle(`lab-${id}`, on.has(id));
  };
  function set(id, v) {
    if (!IDS.includes(id) || on.has(id) === !!v) return;
    if (v) on.add(id); else on.delete(id);
    store.set('labs', [...on]); sync();
    // A Labs sub-view that went away falls back to the tab's first sub-view.
    const AT = root.PeelAnalysisTabs;
    if (AT && AT.refreshFootTab) AT.refreshFootTab();
    // Home's sidebar lists a switch's page while it is on (Labs › Sewer designer); its page, open as the
    // switch goes off, gives way to Home.
    const W = root.PeelWorkspaces;
    if (W && W.mode && W.mode() === 'home') { if (!v && W.LAB_PAGES && W.LAB_PAGES[W.page()] && W.LAB_PAGES[W.page()].lab === id) W.openPage('home'); else W.renderPage(true); }
  }
  const pageHTML = () => `<div class="gear-page labs-page"><h3>Labs</h3>
    <p class="small muted">Extra tools, off by default. Your choice is kept in this browser.</p>
    ${LABS.map(l => `<label class="labs-row"><input type="checkbox" data-lab="${l.id}"${on.has(l.id) ? ' checked' : ''}> <span><strong>${esc(l.label)}</strong> <small class="muted">· ${esc(l.where)}</small><small>${esc(l.what)}</small></span></label>`).join('')}
    <p class="small muted">General screening results only. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results.</p></div>`;
  if (typeof document !== 'undefined') {
    sync();
    root.GearPages = root.GearPages || {};
    root.GearPages.labs = () => pageHTML();
    document.addEventListener('change', e => { const c = e.target.closest && e.target.closest('[data-lab]'); if (c) set(c.dataset.lab, c.checked); });
  }
  const api = { LABS, IDS, on: id => on.has(id), set, pageHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLabs = api;
})(typeof window !== 'undefined' ? window : globalThis);
