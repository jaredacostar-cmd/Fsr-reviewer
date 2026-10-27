/* Sections (PeelSections): each full-map tab's standard panel, as a section a page shows too.
 *
 * The full map shows one tab's panel at a time (js/panel.js). A page shows every section of its
 * scope, one under a section bar, with the same spec: the same answer, figures, lists and folds, so
 * nothing is only in the map and a page never computes a figure of its own. A section whose tab
 * builds its panel only when opened (Capital, Records) is built here on demand, for the scope.
 *
 *   SITE                 the sections of one development, in the order of the map's tabs, then its
 *                        FSR review (a page of its own: the Servicing panel with the cross-check)
 *   AREA                 the sections of an area (Peel, a municipality, a plan): Growth, Forecast,
 *                        Servicing, Capital (areaSpecFor(id): the map's area panel)
 *   WORKSPACES           Servicing and Capital: a page and the map's other sub-views of its tab
 *   specFor(sec, p)      its panel spec for development p (null while its data loads)
 *
 * A section with more than one key takes its answer and figures from the first and adds the
 * others' lists (Capital: the DC projects the site relies on, then the EAs near it).
 */
(function (root) {
  'use strict';
  const PN = () => root.PeelPanel;

  const SITE = [
    { id: 'summary', title: 'Summary', tab: 'overview', keys: ['overview:'] },
    { id: 'growth', title: 'Growth', tab: 'growth', keys: ['growth:pipeline'] },
    { id: 'servicing', title: 'Servicing', tab: 'svc', keys: ['svc:network'] },
    { id: 'capital', title: 'Capital', tab: 'dca', keys: ['dca:timing', 'dca:eas'] },
    { id: 'files', title: 'Files', tab: 'records', keys: ['records:files'] },
    { id: 'fsr', title: 'FSR review', tab: 'svc', keys: ['svc:network'], page: 'fsr' },
  ];
  // An area's sections: Growth in an area's drill-down and the Forecast are pages of their own; its
  // Servicing and Capital are the map's area panels (Region-wide: the plants and the DC program serve
  // more than one municipality).
  const AREA = [
    { id: 'growth', title: 'Growth', page: 'growth' },
    { id: 'outlook', title: 'Forecast', page: 'outlook' },
    { id: 'servicing', title: 'Servicing', tab: 'svc', keys: ['svc:capacity'], wide: true },
    { id: 'capital', title: 'Capital', tab: 'dca', keys: ['dca:timing'], wide: true },
  ];
  // The Servicing and Capital workspaces (step 4): each a page with the map's other sub-views of its
  // tab as sections. host: the page a panel section shows on. (Navigation phase 2: Servicing is Capacity
  // · Network; the allocations are a fold of Capacity, on its page too, and the model checks are Records ›
  // Data checks, Reference › Data checks on a page.)
  const WORKSPACES = {
    servicing: { host: 'tight', secs: [
      { id: 'capacity', title: 'Capacity', page: 'tight' },
      { id: 'network', title: 'Network', tab: 'svc', keys: ['svc:network'] },
    ] },
    // Reference (step 5): Help, How it works and the Glossary, and the map's Records › Sources and
    // Data checks (the old Data tab) as Data sources (its own page) and Data checks.
    reference: { host: 'data', secs: [
      { id: 'help', title: 'Help', page: 'help' },
      { id: 'guides', title: 'How it works', page: 'guides' },
      { id: 'glossary', title: 'Glossary', page: 'glossary' },
      { id: 'logic', title: 'How the app decides', page: 'logic' },
      { id: 'sources', title: 'Data sources', page: 'data' },
      { id: 'checks', title: 'Data checks', tab: 'records', keys: ['records:checks'] },
    ] },
    // Capital (navigation phase 4): DC timing (its page: DC timing and DC projects are one list, a project open
    // in place), EAs (its page: the EAs and EA to construction) and the map's Projects as a section.
    capital: { host: 'projects', secs: [
      { id: 'timing', title: 'DC timing', page: 'projects' },
      { id: 'eas', title: 'EAs', page: 'eaflow' },
      { id: 'projects', title: 'Projects', tab: 'dca', keys: ['dca:projects'] },
    ] },
  };
  const AREA_BUILD = {
    'dca:timing': () => (root.PeelDcaTab && root.PeelDcaTab.areaSpec ? root.PeelDcaTab.areaSpec() : null),
    'records:sources': () => (root.PeelRecordsTab && root.PeelRecordsTab.sourcesPanelSpec ? root.PeelRecordsTab.sourcesPanelSpec() : null),
    'records:checks': () => (root.PeelRecordsTab && root.PeelRecordsTab.checksPanelSpec ? root.PeelRecordsTab.checksPanelSpec() : null),
    'dca:projects': () => (root.PeelCapitalEA && root.PeelCapitalEA.projectsPanelSpec ? root.PeelCapitalEA.projectsPanelSpec() : null),
    'dca:eas': () => (root.PeelCapitalEA && root.PeelCapitalEA.easPanelSpec ? root.PeelCapitalEA.easPanelSpec() : null),
  };
  // An area panel (Peel, the municipality filter): the one its tab set, else built here (null while loading).
  function areaPanel(k) {
    const e = PN() && PN().get(k);
    if (e && e.spec && e.scope === 'area') return e.spec;
    try { return AREA_BUILD[k] ? AREA_BUILD[k]() || null : null; } catch (err) { return null; }
  }
  // An area section's panel (Growth in an area's Servicing and Capital).
  function areaSpecFor(id) { const s = AREA.find(x => x.id === id); return s && s.keys ? areaPanel(s.keys[0]) : null; }
  // A workspace section's panel (Servicing › Network, Capital › Projects …).
  function wsSpecFor(ws, id) { const w = WORKSPACES[ws], s = w && w.secs.find(x => x.id === id); return s && s.keys ? areaPanel(s.keys[0]) : null; }
  const BY_ID = Object.fromEntries(SITE.map(s => [s.id, s]));

  // A tab's panel for development p: the one its tab set for this scope, else built here.
  const BUILD = {
    'dca:timing': p => (root.PeelDcaTab && root.PeelDcaTab.siteSpec ? root.PeelDcaTab.siteSpec(p) : null),
    'dca:eas': () => (root.PeelCapitalEA && root.PeelCapitalEA.easPanelSpec ? root.PeelCapitalEA.easPanelSpec() : null),
    'records:files': p => (root.PeelRecordsTab && root.PeelRecordsTab.filesPanelSpec ? root.PeelRecordsTab.filesPanelSpec(p) : null),
  };
  function panelSpec(key, p) {
    const e = PN() && PN().get(key);
    if (e && e.spec && e.scope === `dev:${p.key}`) return e.spec;
    const b = BUILD[key];
    if (!b) return null;
    try { return b(p) || null; } catch (err) { return null; }
  }
  function specFor(sec, p) {
    const s = typeof sec === 'string' ? BY_ID[sec] : sec;
    if (!s || !p) return null;
    const [first, ...more] = s.keys.map(k => panelSpec(k, p));
    if (!first) return null;
    if (!more.some(Boolean)) return first;
    // (the other panels' lists under the first's, each named; their folds after the first's)
    const lists = [...(first.lists || [])], folds = [...(first.folds || [])];
    for (const m of more.filter(Boolean)) { lists.push(...(m.lists || [])); folds.push(...(m.folds || [])); }
    const mounts = [first, ...more].filter(m => m && typeof m.onMount === 'function').map(m => m.onMount);
    // (the footer's one secondary action: the first's, else the first another panel offers, as the
    // site's Capital: "Copy for review comments" from its EAs panel)
    const second = [first, ...more].filter(Boolean).map(m => m.foot && m.foot.secondary).find(x => x && x.length);
    const foot = second && !((first.foot || {}).secondary || []).length ? { ...(first.foot || {}), secondary: second } : first.foot;
    return { ...first, foot, lists, folds, onMount: mounts.length ? host => { for (const f of mounts) try { f(host); } catch (err) { /* that part stays empty */ } } : null };
  }

  const api = { SITE, AREA, WORKSPACES, BY_ID, specFor, areaSpecFor, wsSpecFor, areaPanel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSections = api;
})(typeof window !== 'undefined' ? window : globalThis);
