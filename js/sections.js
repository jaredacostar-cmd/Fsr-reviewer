/* Sections (PeelSections): each full-map tab's standard panel, as a section a page shows too.
 *
 * The full map shows one tab's panel at a time (js/panel.js). A page shows every section of its
 * scope, one under a section bar, with the same spec: the same answer, figures, lists and folds, so
 * nothing is only in the map and a page never computes a figure of its own. A section whose tab
 * builds its panel only when opened (Capital, Records) is built here on demand, for the scope.
 *
 *   SITE                 the sections of one development, in the order of the map's tabs, then its
 *                        FSR review (a page of its own: the Servicing panel with the cross-check)
 *   AREA                 the sections of an area (Peel, a municipality, a plan): Growth, Forecast
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
  // An area's sections are pages of their own (Growth in an area's drill-down; the Forecast).
  const AREA = [
    { id: 'growth', title: 'Growth', page: 'growth' },
    { id: 'outlook', title: 'Forecast', page: 'outlook' },
  ];
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
    return { ...first, lists, folds, onMount: mounts.length ? host => { for (const f of mounts) try { f(host); } catch (err) { /* that part stays empty */ } } : null };
  }

  const api = { SITE, AREA, BY_ID, specFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSections = api;
})(typeof window !== 'undefined' ? window : globalThis);
