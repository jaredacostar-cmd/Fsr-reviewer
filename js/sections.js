/* Sections (PeelSections): the views a page hosts, by scope and tab:sub, and each full-map tab's standard
 * panel as a section a page shows too.
 *
 * A page and the full map host the same scope with the same tab strip and views (navigation phase 6,
 * design §3.1 rule 1): the page shows the view the map's tab state names (js/analysis-tabs.js viewKey),
 * with the same spec: the same answer, figures, lists and folds, so nothing is only in the map and a page
 * never computes a figure of its own. A panel whose tab builds it only when opened (Capital, Records) is
 * built here on demand, for the scope.
 *
 *   VIEWS                the views a page host shows, by scope (area: Home) and tab:sub: a page builder of
 *                        js/ws-pages.js ({ page }) or the map's panel drawn as it is ({ keys, ws })
 *   SITE                 the sections of one development: the map's five tabs, by the tabs' names;
 *                        Servicing has the map's views (Network · FSR review, the page `fsr`)
 *   WORKSPACES           Reference: Help's bar (its Data sources and Data checks open Home's Records tab)
 *   areaPanel(key)       an area panel (the one its tab set, else built here)
 *   specFor(sec, p)      its panel spec for development p (null while its data loads)
 *   viewOf(sec, id)      a section's view (Servicing › FSR review), with that view's keys, for specFor
 *
 * A section with more than one key takes its answer and figures from the first and adds the
 * others' lists (each section is one panel; Capital's site panel holds the EAs near it).
 */
(function (root) {
  'use strict';
  const PN = () => root.PeelPanel;

  // (navigation phase 5: the ids summary and files are kept, the titles are the tabs'; FSR review is
  // Servicing's second view, as on the map, and the page `fsr` draws it)
  const SITE = [
    { id: 'summary', title: 'Overview', tab: 'overview', keys: ['overview:'] },
    { id: 'growth', title: 'Growth', tab: 'growth', keys: ['growth:pipeline'] },
    { id: 'servicing', title: 'Servicing', tab: 'svc', keys: ['svc:network'], views: [
      { id: 'network', title: 'Network', keys: ['svc:network'] },
      { id: 'fsr', title: 'FSR review', keys: ['svc:fsr'], page: 'fsr' },
    ] },
    { id: 'capital', title: 'Capital', tab: 'dca', keys: ['dca:timing'] },
    { id: 'files', title: 'Records', tab: 'records', keys: ['records:files'] },
  ];
  // The views of Home, the page host at an area (Peel, a municipality, a plan; navigation phase 6): every tab's
  // chips at an area (js/analysis-tabs.js chipsAt), each a page builder where a page adds to the panel (Home's
  // groups, the drill and its table, the reserve, a project in place, EA to construction, the sources) or the
  // map's panel itself, its footer's actions first (ws: the map view its Open the map opens; none for Records,
  // which opens the full map at the view).
  const VIEWS = {
    area: {
      'overview:': { page: 'home' },
      'growth:pipeline': { keys: ['growth:pipeline'], ws: 'growth' },
      'growth:areas': { page: 'growth' },
      'growth:timing': { page: 'outlook' },
      'svc:capacity': { page: 'tight' },
      'svc:network': { keys: ['svc:network'], ws: 'tight' },
      'dca:timing': { page: 'projects' },
      'dca:eas': { page: 'eaflow' },
      'dca:projects': { keys: ['dca:projects'], ws: 'projects' },
      'records:sources': { page: 'data' },
      'records:checks': { keys: ['records:checks'] },
    },
  };
  // Reference (step 5): Help, How it works, the Glossary and How the app decides, and the map's Records ›
  // Sources and Data checks (the old Data tab), Home's Records tab (at: its tab:sub; navigation phase 6).
  const WORKSPACES = {
    reference: { secs: [
      { id: 'help', title: 'Help', page: 'help' },
      { id: 'guides', title: 'How it works', page: 'guides' },
      { id: 'glossary', title: 'Glossary', page: 'glossary' },
      { id: 'logic', title: 'How the app decides', page: 'logic' },
      { id: 'sources', title: 'Data sources', at: 'records:sources' },
      { id: 'checks', title: 'Data checks', at: 'records:checks' },
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
  const BY_ID = Object.fromEntries(SITE.map(s => [s.id, s]));
  // A site section's view: the section with that view's keys (null for no such view).
  function viewOf(sec, id) { const s = BY_ID[sec], v = s && (s.views || []).find(x => x.id === id); return v ? { ...s, ...v, section: s.id } : null; }

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

  const api = { VIEWS, SITE, WORKSPACES, BY_ID, specFor, viewOf, areaPanel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSections = api;
})(typeof window !== 'undefined' ? window : globalThis);
