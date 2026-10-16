(function (root) {
  'use strict';
  // ---- Workspaces and Home (Stage 4) ------------------------------------------------------------
  // A workspace is a view onto the four tabs, never a separate calculation: a task chip sets the map's
  // layer preset, the scope and the panel, and the panel header names the tab it comes from
  // ("Getting tight · from Servicing › Capacity"). Three modes:
  //   home  the briefing (headline, 4 figures, Needs attention, a small map of the problems, This week)
  //         with the workspaces listed by team, then "Full map (all tools)";
  //   ws    the map with the task chips under the search box; the left panel and the tool rail are
  //         hidden; "Open full map" on every panel keeps the scope, filters and scenario;
  //   full  the map with every tool (as before Stage 4). Old share links open here.
  // The start screen (Home · last workspace · Full map) is remembered per browser.
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s));
  const fmtNum = U.fmtNum || (n => String(n));
  const store = U.store || { get: (k, d) => d, set: () => {} };

  // ---- Pure: the workspaces, what each opens, the Old pipes list, the start screen -----------------
  // tab / sub: the sub-view it opens; scope: 'area' (Peel or the municipality filter: a development or
  // servicing scope closes), 'site' (the open development, or the Find step until one is picked) or
  // 'drawn' (the area the user draws); view: the map's layer preset (js/map-markers.js MAP_VIEWS).
  const WS = [
    { id: 'site', label: 'Check a site', group: 'Planning', tab: 'overview', sub: '', scope: 'site', view: 'planning', what: 'A development: servicing, timing and what to confirm, then the servicing memo' },
    { id: 'tight', label: 'Getting tight', group: 'Planning', tab: 'svc', sub: 'capacity', scope: 'area', view: 'wastewater', what: 'Plants, pumping and storage nearing or past their limit, soonest first' },
    { id: 'growth', label: 'Growth in an area', group: 'Planning', tab: 'growth', sub: 'areas', scope: 'area', view: 'planning', what: 'Planned units and people by municipality and plan' },
    { id: 'fsr', label: 'Review an FSR', group: 'Planning', tab: 'svc', sub: 'network', scope: 'site', view: 'wastewater', fsr: true, what: 'A development’s servicing path with the FSR cross-check' },
    { id: 'study', label: 'Study area', group: 'Planning', tab: 'overview', sub: '', scope: 'drawn', view: 'planning', what: 'Draw an area: its growth and the servicing it needs' },
    { id: 'projects', label: 'Projects', group: 'Capital', tab: 'dca', sub: 'timing', scope: 'area', view: 'dc', what: 'DC projects and whether each comes before the capacity it relieves runs out' },
    { id: 'pipes', label: 'Old pipes', group: 'Asset Management', tab: 'svc', sub: 'network', scope: 'area', view: 'wastewater', what: 'Sewers 50+ years old or rated moderate risk that carry 100+ units at build-out' },
    { id: 'week', label: 'This week', group: 'Planning', tab: 'overview', sub: '', scope: 'area', view: 'planning', what: 'What changed: files moved, new files, capital and EA dates' },
  ];
  const BY_ID = Object.fromEntries(WS.map(w => [w.id, w]));
  // Home's sidebar: by team (Getting tight with Planning), then Full map.
  const GROUPS = [
    ['Planning', ['site', 'fsr', 'growth', 'study', 'tight', 'week']],
    ['Capital', ['projects']],
    ['Asset Management', ['pipes']],
  ];
  const TAB_NAME = { overview: 'Overview', growth: 'Growth', svc: 'Servicing', dca: 'Capital', records: 'Records' };
  const SUB_NAME = { capacity: 'Capacity', network: 'Network', alloc: 'Allocations', checks: 'Checks', pipeline: 'Pipeline', areas: 'Areas', timing: 'Timing', projects: 'Projects', eas: 'EAs', funding: 'Funding', sources: 'Sources', files: 'Files' };
  const tabPath = (tab, sub) => [TAB_NAME[tab] || tab, sub ? SUB_NAME[sub] || sub : ''].filter(Boolean).join(' › ');
  // What a chip does: the tab, sub-view, scope and preset; closeScopes = area chips leave a site.
  function plan(id, ctx = {}) {
    const w = BY_ID[id]; if (!w) return null;
    const site = !!ctx.site;
    return { id, tab: w.tab, sub: w.sub, view: w.view, scope: w.scope === 'site' ? (site ? 'site' : 'find') : w.scope, closeScopes: w.scope === 'area', fsr: !!w.fsr && site, lasso: w.scope === 'drawn', source: `${w.label} · from ${tabPath(w.tab, w.sub)}` };
  }
  // The panel header line in a workspace: the workspace when the panel is its sub-view, else the tab.
  function sourceText(wsId, key) {
    const w = BY_ID[wsId]; if (!w) return '';
    const [tab, sub] = String(key || '').split(':');
    return tab === w.tab && (sub || '') === (w.sub || '') ? `${w.label} · from ${tabPath(tab, sub)}` : `${w.label} · ${tabPath(tab, sub)}`;
  }
  // Old pipes (decided with the user): installed 50+ years ago OR rated MODERATE (the highest rating in
  // the Region's data), AND carrying 100+ planned units at build-out; ranked by units carried.
  // pipes: sewers.json rows [diameterMm, slope, capacityLs, next, censusPopUp, haUp, plant, installYear,
  // material, risk, coords, …]; units: units carried per pipe (js/sewer-cap.js sewerGrowth).
  const OLD = { age: 50, minUnits: 100, risk: 'MODERATE' };
  function oldPipes(data, units, now, o = OLD) {
    if (!data || !data.pipes || !units) return [];
    const out = [];
    data.pipes.forEach((p, i) => {
      const u = units[i] || 0; if (u < o.minUnits) return;
      const y = p[7] || null, age = y ? now - y : null, risk = data.risks ? data.risks[p[9]] || '' : '';
      const old = age != null && age >= o.age, risky = risk === o.risk;
      if (!old && !risky) return;
      out.push({ i, d: p[0], year: y, age, risk, units: u, mat: data.materials ? data.materials[p[8]] || '' : '', plant: data.plants ? data.plants[p[6]] : '', old, risky, at: p[10] ? [p[10][0], p[10][1]] : null });
    });
    return out.sort((a, b) => b.units - a.units || (b.age || 0) - (a.age || 0));
  }
  // Shown as runs: listed segments that join end to end (one drains into the next) with the same size,
  // install year, material and risk are one main. A run carries the most units of its segments.
  function pipeRuns(list, data) {
    const at = new Map(list.map((r, k) => [r.i, k])), up = list.map((r, k) => k);
    const find = k => { while (up[k] !== k) { up[k] = up[up[k]]; k = up[k]; } return k; };
    const same = (a, b) => a.d === b.d && a.year === b.year && a.mat === b.mat && a.risk === b.risk;
    list.forEach((r, k) => { const nx = data.pipes[r.i][3], j = at.get(nx); if (j != null && same(r, list[j])) up[find(k)] = find(j); });
    const runs = new Map();
    list.forEach((r, k) => { const g = find(k); const x = runs.get(g) || { ...r, n: 0, lengthM: 0, pipes: [] }; x.n++; x.lengthM += data.pipes[r.i][14] || 0; x.pipes.push(r.i); if (r.units > x.units) Object.assign(x, { i: r.i, units: r.units, at: r.at }); runs.set(g, x); });
    return [...runs.values()].sort((a, b) => b.units - a.units || (b.age || 0) - (a.age || 0));
  }
  // The start screen: a link opens what it names (w=home, w=<workspace>; without w the full map, as
  // old links always did); otherwise the preference: Home (default), the last workspace or the full map.
  const START = [['home', 'Home'], ['last', 'Last workspace'], ['full', 'Full map']];
  function startScreen({ hash = '', pref = 'home', last = null } = {}) {
    const q = new URLSearchParams(String(hash).replace(/^#/, ''));
    if ([...q.keys()].length) return q.get('w') === 'home' ? { mode: 'home' } : q.get('w') && BY_ID[q.get('w')] ? { mode: 'ws', ws: q.get('w') } : { mode: 'full' };
    if (pref === 'full') return { mode: 'full' };
    if (pref === 'last') return { mode: 'ws', ws: BY_ID[last] ? last : 'tight' };
    return { mode: 'home' };
  }
  // A workspace picked without naming one (Home's map, "Workspaces"): Getting tight the first time,
  // the last one after that.
  const defaultWs = last => (BY_ID[last] ? last : 'tight');

  // ---- Browser ----------------------------------------------------------------------------------
  const api = { WS, GROUPS, BY_ID, OLD, START, plan, sourceText, tabPath, oldPipes, pipeRuns, startScreen, defaultWs };
  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return;
  }
  const $ = s => document.querySelector(s);
  const App = () => root.PeelApp, AT = () => root.PeelAnalysisTabs, PN = () => root.PeelPanel, MM = () => root.PeelMapMarkers;
  const SC = () => root.PeelSewerCap, Cap = () => root.PeelSvcCapacity, OT = () => root.PeelOverviewTab, SS = () => root.PeelSvcScope;
  const now = () => (MM() && MM().THIS_YEAR) || new Date().getFullYear();
  let mode = 'full', cur = null;
  const isWs = () => mode === 'ws';

  function setMode(m) {
    mode = m;
    const de = document.documentElement, app = $('.app');
    de.classList.toggle('ws-mode', m === 'ws'); de.classList.toggle('home-on', m === 'home');
    if (app) { app.classList.toggle('ws-mode', m === 'ws'); }
    const home = $('#home'); if (home) home.hidden = m !== 'home';
    const bar = $('#ws-bar'); if (bar) bar.hidden = m !== 'ws';
    placeSearch();
    if (m !== 'ws') { cur = null; pipesLayer(false); if (m === 'full') unfoldLayers(); }
    renderChips();
    if (m === 'home') renderHome();
    if (root.PeelDataTab && root.PeelDataTab.fixMap) setTimeout(() => root.PeelDataTab.fixMap(), 50);
    if (PN()) PN().sync();
    if (root.PeelShare && root.PeelShare.viewLink) root.PeelShare.viewLink.write();
  }
  // The one search box: in a workspace it sits above the chips on the map.
  function placeSearch() {
    const box = $('#search-box'), slot = $('#ws-search'); if (!box || !slot) return;
    if (mode === 'ws') { if (box.parentElement !== slot) slot.appendChild(box); return; }
    if (box.parentElement === slot) { const home = document.querySelector('#tab-explore .search-bar'); if (home) home.insertBefore(box, home.firstChild); }
    if (root.PeelTopbar && root.PeelTopbar.placeSearch) root.PeelTopbar.placeSearch();
  }
  // ---- A chip -------------------------------------------------------------------------------------
  function go(id, o = {}) {
    const site = root.DevScope && root.DevScope.current ? root.DevScope.current() : null;
    const pl = plan(id, { site: !!site }); if (!pl) return;
    cur = id; store.set('lastWs', id);
    if (mode !== 'ws') setMode('ws');
    if (pl.closeScopes) {
      if (site) root.DevScope.close();
      if (SS() && SS().current && SS().current()) SS().close();
    }
    const MA = root.PeelMapAnalysis; if (MA && MA.setMapView && MA.currentView && MA.currentView() !== pl.view) MA.setMapView(pl.view);
    const A = AT(); if (A) { if (pl.sub && A.setSub) A.setSub(pl.tab, pl.sub); if (A.setFootPref) A.setFootPref(pl.tab); A.showFootTab(pl.tab); }
    foldLayers();
    pipesLayer(id === 'pipes');
    // Review an FSR at a site: the cross-check is an open fold of the Servicing panel (fsrSpec), so the
    // site bar's own copy closes (one form on screen).
    if (pl.fsr) { const box = document.getElementById('site-bar-fsr'), b = document.querySelector('#site-bar [data-scope-fsr]'); if (box && !box.hidden && b) b.click(); }
    if (pl.lasso && !o.noDraw && root.PeelAreaSelect && root.PeelAreaSelect.setLasso) root.PeelAreaSelect.setLasso(true);
    const ss = o.ss; if (ss && SS() && SS().open) SS().open(ss);
    renderChips();
    if (PN()) PN().sync();
    if (root.PeelShare && root.PeelShare.viewLink) root.PeelShare.viewLink.write();
    // A site workspace without a site: the search box is the first step.
    if (pl.scope === 'find' && !o.quiet) { const s = $('#f-search'); if (s) try { s.focus({ preventScroll: true }); } catch (e) { /* older browsers */ } }
  }
  // The map's Layers panel closes when a chip is picked (the chip has set the layers); the full map gets
  // it back as it was before the workspace.
  let layersWasOpen = null;
  const layersPanel = () => document.querySelector('.map-opts .mo-panel');
  function foldLayers() {
    const el = layersPanel(); if (!el) return;
    if (layersWasOpen == null) layersWasOpen = !!el.open;
    el.open = false;
  }
  function unfoldLayers() {
    const el = layersPanel();
    if (el && layersWasOpen) el.open = true;
    layersWasOpen = null;
  }
  // This week's count (the chip's badge): the Peel Overview's own list.
  function weekRows() { const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null; const l = a && a.lists ? a.lists.find(x => x.title === 'This week') : null; return l ? l.rows : []; }
  function renderChips() {
    const el = $('#ws-chips'); if (!el) return;
    const nW = weekRows().length;
    el.innerHTML = WS.map(w => `<button type="button" class="btn small ws-chip${cur === w.id ? ' on' : ''}" data-ws-go="${w.id}" aria-pressed="${cur === w.id}" title="${esc(w.what)}">${esc(w.label)}${w.id === 'week' && nW ? ` <span class="badge-n">${fmtNum(nW)}</span>` : ''}</button>`).join('');
  }
  // The header line on every panel in a workspace: its source and "Open full map".
  function srcLine(key) {
    if (!isWs() || !cur) return '';
    // Check a site / Review an FSR, once the site is open: the guided steps, Find done.
    const site = (cur === 'site' || cur === 'fsr') && root.DevScope && root.DevScope.current && root.DevScope.current();
    const steps = site ? ` <small class="pnl-steps">✓ Find › <b>Result</b> › Output: ${cur === 'fsr' ? 'the cross-check notes' : 'Servicing memo'}</small>` : '';
    return `<p class="pnl-src small"><span>${esc(sourceText(cur, key))}${steps}</span><button type="button" class="btn small link" data-ws-full title="The same scope, filters and scenario with every tool">Open full map →</button></p>`;
  }
  // ---- A workspace's own view of a sub-view --------------------------------------------------------
  function override(key, scope) {
    if (!isWs() || !cur || !PN()) return null;
    const pl = plan(cur, { site: scope.startsWith('dev:') });
    if ((cur === 'site' || cur === 'fsr') && pl.scope === 'find' && key === `${pl.tab}:${pl.sub}` && scope === 'area') return findSpec(cur);
    if (cur === 'fsr' && key === 'svc:network' && scope.startsWith('dev:')) return fsrSpec(scope);
    if (cur === 'pipes' && key === 'svc:network' && scope === 'area') return pipesSpec();
    if (cur === 'week' && key === 'overview:' && scope === 'area') return weekSpec();
    return null;
  }
  // Check a site / Review an FSR before a site is picked: Find → Result → Output.
  function findSpec(id) {
    const w = BY_ID[id], P = root.PeelPhases;
    const last = p => (P && P.lastActivityOf ? P.lastActivityOf(p) || 0 : 0);
    const recent = ((App() && App().state.projects) || []).filter(p => p.phase !== 'cancelled' && p.phase !== 'completed' && (p.units || 0) > 0).map(p => [p, last(p)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
    const steps = [['Find', 'Search an address or file number above, or click a development on the map.'], ['Result', id === 'fsr' ? 'Its servicing path with the FSR cross-check (Servicing at the site).' : 'Its servicing, timing and what to confirm (Overview at the site).'], ['Output', id === 'fsr' ? 'The cross-check notes to compare with the report.' : 'The one-page servicing memo.']];
    return {
      head: { name: w.label, status: { tone: 'stage', text: 'Step 1 of 3' }, identity: esc(w.what) },
      answer: 'Find the development: search an address or file number above, or click it on the map.',
      lists: [
        { title: 'Steps', rows: steps.map(([t, d], i) => ({ kv: true, html: `<div class="pnl-step${i === 0 ? ' on' : ''}"><span class="pnl-step-n" aria-hidden="true">${i + 1}</span><span><strong>${t}</strong> ${esc(d)}</span></div>` })), total: 3 },
        { title: 'Recently active', rows: recent.map(p => ({ attrs: { 'data-pnl-dev': p.key, title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(P && P.PHASE_BY_KEY[p.phase] ? P.PHASE_BY_KEY[p.phase].label : p.phase)}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} units</small>` })), total: recent.length },
      ],
      foot: { primary: { label: 'Search', attrs: { 'data-ws-focus': '' } } },
    };
  }
  // Review an FSR at a site: Servicing at the site as it is, with the FSR cross-check as its first fold,
  // open (the same form and checks as the site bar's Check FSR, js/fsr-check.js).
  function fsrSpec(scope) {
    const e = PN().get('svc:network'), F = root.PeelFsrCheck, p = root.DevScope && root.DevScope.current && root.DevScope.current();
    if (!e || !e.spec || e.scope !== scope || !F || !F.mount || !p) return null;
    const s = e.spec;
    return { ...s,
      folds: [{ title: 'FSR cross-check: the consultant\u2019s figures vs this app\u2019s', open: true, id: 'pnl-fsr', html: '<div class="fsr-box" data-pnl-fsrbox></div>' }, ...(s.folds || [])],
      onMount: host => { if (typeof s.onMount === 'function') s.onMount(host); const b = host.querySelector('[data-pnl-fsrbox]'); if (b) F.mount(b, p); } };
  }
  // Old pipes: Servicing › Network filtered to age / risk with the build-out load (units carried).
  function oldList() {
    const S = MM() && MM().SEW; if (!S || !S.data || !SC()) return null;
    const G = SC().sewerGrowth(); if (!G) return null;
    const n = S.data.pipes.length, u = new Float64Array(n);
    for (const k of ['built', 'approved', 'proposed']) if (G[k] && G[k].units) for (let i = 0; i < n; i++) u[i] += G[k].units[i];
    return oldPipes(S.data, u, now());
  }
  function pipesSpec() {
    const list = oldList(), runs = list ? pipeRuns(list, MM().SEW.data) : [];
    if (!list) { if (MM() && MM().SEW && !MM().SEW.data && SC() && SC().loadSewers) SC().loadSewers().then(() => PN() && PN().sync()); return { head: { name: 'Old pipes', identity: 'Sanitary sewers 300 mm and larger' }, answer: 'Loading the Region’s sanitary sewer records…' }; }
    const old = list.filter(r => r.old).length, risky = list.filter(r => r.risky).length, units = list.reduce((t, r) => Math.max(t, r.units), 0);
    const oldest = list.reduce((a, r) => (r.year && (!a || r.year < a.year) ? r : a), null);
    return {
      calc: true, fullTitle: 'Servicing › Network · Old pipes',
      head: { trail: [{ label: 'Peel' }, { label: 'Servicing › Network' }], name: 'Which old pipes carry the most growth?', status: list.length ? { tone: 'tight', text: `${fmtNum(runs.length)} runs` } : { tone: 'room', text: 'None' }, identity: `Sanitary sewers 300 mm+ · ${OLD.age}+ years old or rated ${OLD.risk.toLowerCase()} risk · ${OLD.minUnits}+ units at build-out` },
      answer: list.length ? `<strong>${fmtNum(list.length)}</strong> sewer segments (${fmtNum(runs.length)} runs of one main) are ${OLD.age}+ years old or rated moderate risk and carry ${OLD.minUnits}+ planned units at build-out; <strong>${esc(`${runs[0].d} mm, ${runs[0].year || 'year not recorded'}`)}</strong> carries the most (${fmtNum(Math.round(runs[0].units))} units).` : `No sewer ${OLD.age}+ years old or rated moderate risk carries ${OLD.minUnits}+ planned units at build-out.`,
      figures: [
        { v: fmtNum(runs.length), u: 'runs', label: 'on the list', ctx: `${fmtNum(list.length)} segments · ${OLD.minUnits}+ units at build-out` },
        { v: fmtNum(old), u: 'pipes', label: `${OLD.age}+ years old`, ctx: `installed ${now() - OLD.age} or earlier` },
        { v: fmtNum(risky), u: 'pipes', label: 'rated moderate risk', ctx: 'the Region’s highest rating in the data', tone: risky ? 'tight' : 'room' },
        oldest ? { v: oldest.year, u: '', label: 'oldest on the list', ctx: `${oldest.d} mm${oldest.mat ? ` ${esc(oldest.mat)}` : ''} · ${fmtNum(Math.round(oldest.units))} units` } : { v: fmtNum(Math.round(units)), u: 'units', label: 'most carried', ctx: '' },
      ],
      lists: [{ title: 'Runs, most units first', rows: runs.slice(0, 5).map(r => ({ tone: r.risky ? 'tight' : null, attrs: { 'data-pipe': r.i, title: 'Show the pipe and what loads it' },
        html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.d} mm${r.mat ? ` ${esc(r.mat)}` : ''}${r.plant ? ` · to ${esc((root.PeelSvcData && root.PeelSvcData.PLANT_SHORT && root.PeelSvcData.PLANT_SHORT[r.plant]) || r.plant)}` : ''}</span><span class="pnl-r-year${r.old ? ' t-tight' : ''}">${r.year ? `${r.year} · ${r.age} yrs` : 'year not recorded'}</span></div><div class="pnl-r-meta"><span>${fmtNum(Math.round(r.units))} units at build-out · ${r.n > 1 ? `${fmtNum(r.n)} segments, ` : ''}${fmtNum(Math.round(r.lengthM))} m</span><span${r.risky ? ' class="t-tight"' : ''}>${r.risk ? `${esc(r.risk.charAt(0) + r.risk.slice(1).toLowerCase())} risk` : 'risk not rated'}</span></div>` })),
        total: runs.length, seeAll: { 'data-full-table': 'svc:network' } }],
      method: `From the Region’s sanitary sewer records (300 mm and larger): install year and risk rating as published. A pipe is listed when it was installed ${OLD.age}+ years ago or is rated ${OLD.risk.toLowerCase()} risk (the highest rating in the data; the others are low and insignificant), and the developments on the map that drain through it (built since the census, approved, proposed) plan ${OLD.minUnits}+ units. Units carried is a count of planned units, not a flow: pipe-by-pipe capacity is left to the Region’s model. Segments that join end to end with the same size, install year, material and risk are shown as one run, ranked by the most units any of its segments carries.`,
      sources: 'Region of Peel Wastewater Main (open data): diameter, install date, material, risk rating. The applications and permits on the map.',
      foot: { primary: { label: 'Show the sewers on the map', attrs: { 'data-mview': 'wastewater' } } },
    };
  }
  // The old pipes on the map while the workspace is open (amber; moderate risk heavier).
  let pLayer = null;
  function pipesLayer(on) {
    const L = root.L, map = root.PeelMapCore && root.PeelMapCore.map; if (!L || !map) return;
    if (pLayer) { map.removeLayer(pLayer); pLayer = null; }
    if (!on) return;
    const list = oldList(); if (!list) return;
    const C = SC() && SC().pipeCoords;
    pLayer = L.layerGroup(list.map(r => { const c = MM().SEW.data.pipes[r.i][10], pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k + 1], c[k]]);
      return L.polyline(C ? C(MM().SEW.data.pipes[r.i]).map(([x, y]) => [y, x]) : pts, { color: U.token ? U.token('--cap-tight') : getComputedStyle(document.documentElement).getPropertyValue('--cap-tight').trim(), weight: r.risky ? 6 : 4, opacity: 0.9, interactive: false }); })).addTo(map);
  }
  // This week: the Overview's changes, every row.
  function weekSpec() {
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null, rows = weekRows();
    const muni = App() && App().state.muni;
    return {
      head: { trail: [{ label: 'Peel' }, ...(muni ? [{ label: muni }] : []), { label: 'Overview' }], name: 'What changed this week?', status: rows.length ? { tone: 'stage', text: `${fmtNum(rows.length)} changes` } : null, identity: a && a.head ? a.head.identity : esc(muni || 'Peel') },
      answer: rows.length ? `<strong>${fmtNum(rows.length)}</strong> change${rows.length === 1 ? '' : 's'} since the last data update: files that moved stage, new files, capital and EA dates.` : 'Nothing changed since the last data update.',
      lists: [{ title: 'This week', rows: rows.slice(0, 5), total: rows.length, seeAll: { 'data-full-table': 'overview' } }],
      method: 'Changes between the last two data updates: files whose stage moved, files listed for the first time (not those already completed), Region capital projects and EAs with a review period closing or a DC-matched date moved later.',
      sources: 'The municipal application records (each update); Region of Peel capital project and EA listings.',
      foot: { primary: { label: 'Watch list', attrs: { 'data-ws-watch': '' }, title: 'The developments you watch (left panel, Watch)' } },
    };
  }
  // ---- Home ---------------------------------------------------------------------------------------
  // The small map: the wastewater blocks muted; the pumping-station catchments and pressure zones of the
  // facilities over (red) or past the 90% trigger (amber) at build-out filled; the plants as squares.
  function homeMapSVG(rows, W = 360, H = 300) {
    const sv = App() && App().state.servicing; if (!sv) return '';
    // The base: the Region's wastewater blocks (rural blocks mostly on septic left out, as the briefing map).
    const base = (sv.drainage || []).filter(d => d.rings && !(d.served != null && d.served < 0.5));
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const d of base) for (const r of d.rings) for (const [x, y] of r) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); }
    if (mnx > mxx) return '';
    const kx = Math.cos((mny + mxy) / 2 * Math.PI / 180), s = Math.min((W - 10) / ((mxx - mnx) * kx), (H - 10) / (mxy - mny));
    const X = x => (5 + (x - mnx) * kx * s).toFixed(1), Y = y => (5 + (mxy - y) * s).toFixed(1);
    const path = rings => rings.map(r => r.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)},${Y(y)}`).join('') + 'Z').join('');
    const tone = r => (r.pctBo >= 100 ? 'over' : r.pctBo >= 90 ? 'tight' : null);
    const out = base.map(d => `<path d="${path(d.rings)}" class="hm-base"/>`);
    const byId = new Map((sv.psAreas || []).map(d => [d.id, d])), zones = sv.zones || [];
    for (const r of rows) {
      const t = tone(r); if (!t) continue;
      let g = null;
      if (r.kind === 'ps') g = byId.get(r.id.slice(3));
      else if (r.kind === 'pump' || r.kind === 'storage') { const m = String(r.name).match(/zone\s*(\w+)/i); g = m ? zones.find(z => String(z.zone) === m[1]) : null; }
      if (g && g.rings) out.push(`<path d="${path(g.rings)}" class="hm-${t}"><title>${esc(r.name)}: ${Math.round(r.pctBo)}% at build-out</title></path>`);
    }
    for (const pl of (sv.meta && sv.meta.plants) || []) {
      if (!pl.lnglat) continue;
      const r = rows.find(x => x.id === `plant:${pl.name}`), t = r ? tone(r) : null;
      out.push(`<rect x="${(+X(pl.lnglat[0]) - 5).toFixed(1)}" y="${(+Y(pl.lnglat[1]) - 5).toFixed(1)}" width="10" height="10" class="hm-plant${t ? ` hm-${t}` : ''}"><title>${esc(r ? r.name : pl.name)}${r ? `: ${Math.round(r.pctBo)}% at build-out` : ''}</title></rect>`);
    }
    return `<svg viewBox="0 0 ${W} ${H}" class="home-map-svg" role="img" aria-label="Peel's sewersheds, with the facilities over capacity or past the 90% trigger at build-out highlighted">${out.join('')}</svg>`;
  }
  function renderHome() {
    const el = $('#home'); if (!el || el.hidden) return;
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null, P = PN();
    const rows = Cap() && Cap().collect ? Cap().collect() || [] : [];
    const cav = root.PeelRecordsTab && root.PeelRecordsTab.caveats ? root.PeelRecordsTab.caveats() : [];
    const needs = a && a.lists ? a.lists.find(l => l.title === 'Needs attention') : null, week = a && a.lists ? a.lists.find(l => l.title === 'This week') : null;
    // A Home row opens its workspace (and, for a facility, its scope; for a change, the development).
    const relink = (r, ws) => { const at = r.attrs || {}; const x = { 'data-ws-go': ws }; if (at['data-ss']) x['data-ws-ss'] = at['data-ss']; if (at['data-pnl-dev']) x['data-ws-dev'] = at['data-pnl-dev']; if (at['data-ce-open']) x['data-ws-ce'] = at['data-ce-open']; return { ...r, attrs: { ...x, title: r.attrs && r.attrs.title } }; };
    const pref = store.get('startScreen', 'home');
    const side = `<nav class="home-side" aria-label="Workspaces">
      ${GROUPS.map(([g, ids]) => `<h2 class="home-g">${esc(g)}</h2><ul>${ids.map(id => { const w = BY_ID[id]; return `<li><button type="button" class="home-ws" data-ws-go="${id}"><strong>${esc(w.label)}${id === 'week' && week && week.total ? ` <span class="badge-n">${fmtNum(week.total)}</span>` : ''}</strong><small>${esc(w.what)}</small></button></li>`; }).join('')}</ul>`).join('')}
      <button type="button" class="home-ws home-full" data-ws-full><strong>Full map (all tools)</strong><small>Every layer, filter and tool</small></button>
      <label class="home-pref small">Start screen <select data-ws-start>${START.map(([k, t]) => `<option value="${k}"${pref === k ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    </nav>`;
    let main;
    if (!a || !P) main = `<div class="home-main"><p class="muted">${U.skel ? U.skel('Loading the briefing') : 'Loading the briefing…'}</p></div>`;
    else {
      const figs = P.html({ key: 'home', figures: a.figures }).match(/<div class="pnl-figs"[\s\S]*?<\/div><\/div>/);
      const list = (l, ws, title) => (l && l.rows.length ? `<section class="pnl-list home-list"><div class="pnl-list-h"><h3>${esc(title)}</h3><button type="button" class="btn small link" data-ws-go="${ws}">See all (${fmtNum(l.total)}) →</button></div><ul>${l.rows.slice(0, 5).map(r => relink(r, ws)).map(r => `<li class="pnl-row${r.tone ? ` t-${esc(r.tone)}` : ''}" data-ws-go="${esc(r.attrs['data-ws-go'])}"${r.attrs['data-ws-ss'] ? ` data-ws-ss="${esc(r.attrs['data-ws-ss'])}"` : ''}${r.attrs['data-ws-dev'] ? ` data-ws-dev="${esc(r.attrs['data-ws-dev'])}"` : ''}${r.attrs['data-ws-ce'] ? ` data-ws-ce="${esc(r.attrs['data-ws-ce'])}"` : ''} tabindex="0" role="button">${r.html}</li>`).join('')}</ul></section>` : '');
      main = `<div class="home-main">
        <header class="home-h"><p class="small muted">${a.head && a.head.identity ? a.head.identity : ''}</p><h1>${esc((App() && App().state.muni) || 'Peel')}: what needs attention</h1>${a.head && a.head.status ? P.chip(a.head.status) : ''}</header>
        <div class="pnl-scen">${P.scenarioChip()}</div>
        <p class="home-answer">${a.answer || ''}</p>
        ${cav.map(c => `<p class="home-caveat small" role="note">⚠ ${esc(c.text)} <button type="button" class="btn small link" data-ws-full data-at="${c.at}">Review →</button></p>`).join('')}
        ${figs ? figs[0].replace('class="pnl-figs"', 'class="pnl-figs" data-ws-go="growth" role="button" tabindex="0" title="Growth in an area"') : ''}
        <div class="home-cols">
          ${list(needs, 'tight', 'Needs attention')}
          <section class="home-map"><div class="pnl-list-h"><h3>Where</h3><button type="button" class="btn small link" data-ws-go="tight">Open the map →</button></div><button type="button" class="home-map-btn" data-ws-go="tight" aria-label="Open Getting tight on the map">${homeMapSVG(rows)}</button>
            <p class="small muted"><span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out (catchments, zones and plants)</p></section>
        </div>
        ${list(week, 'week', 'This week')}
        <p class="pnl-note small">${P.NOTE}</p>
      </div>`;
    }
    el.innerHTML = `<div class="home-grid">${side}${main}</div>`;
  }
  // ---- Settings: the start screen ------------------------------------------------------------------
  const settingsHTML = () => { const pref = store.get('startScreen', 'home'); return `<section class="gear-sec"><h3>Start screen</h3><p class="small muted">What opens when you load the app without a link. Kept in this browser.</p><div class="seg" role="group" aria-label="Start screen">${START.map(([k, t]) => `<button type="button" class="btn small${pref === k ? ' on' : ''}" data-ws-start-btn="${k}" aria-pressed="${pref === k}">${t}</button>`).join('')}</div></section>`; };
  // ---- Wiring -------------------------------------------------------------------------------------
  document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const g = e.target.closest('[data-ws-go]');
    if (g) { e.preventDefault(); const dev = g.dataset.wsDev, ce = g.dataset.wsCe; go(g.dataset.wsGo, { ss: g.dataset.wsSs, quiet: !!dev });
      if (dev) { const N = root.PeelDevNav, q = N && N.projectByKey(dev); if (q) N.showDetail(q); }
      if (ce && root.PeelCapitalEA) { const [k, ...rest] = ce.split(':'), CE = root.PeelCapitalEA; if (k === 'ea') CE.openEA(rest.join(':')); else if (k === 'cap') CE.openCapital(rest.join(':')); }
      return; }
    if (e.target.closest('[data-ws-full]')) { setMode('full'); return; }
    if (e.target.closest('[data-ws-home]')) { setMode('home'); return; }
    if (e.target.closest('[data-ws-focus]')) { const s = $('#f-search'); if (s) s.focus(); return; }
    if (e.target.closest('[data-ws-watch]')) { setMode('full'); const t = $('#tab-btn-week'); if (t) t.click(); return; }
    const sb = e.target.closest('[data-ws-start-btn]'); if (sb) { store.set('startScreen', sb.dataset.wsStartBtn); document.querySelectorAll('[data-ws-start-btn]').forEach(b => { const on = b === sb; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
  });
  document.addEventListener('change', e => { const s = e.target.closest && e.target.closest('[data-ws-start]'); if (s) store.set('startScreen', s.value); });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest && e.target.closest('#home [data-ws-go][role="button"]')) { e.preventDefault(); e.target.click(); } });
  // Home and the chips follow the Peel Overview (its figures, This week's count).
  document.addEventListener('pnl:set', e => { if (e.detail && e.detail.key === 'overview:' && e.detail.scope === 'area') { renderChips(); if (mode === 'home') renderHome(); } if (mode === 'ws' && cur === 'pipes' && e.detail && e.detail.key === 'svc:network') pipesLayer(true); });
  // A site picked in Check a site / Review an FSR: on to its result (Overview, or Servicing with the cross-check).
  let lastDev = null;
  document.addEventListener('pnl:set', e => {
    const d = e.detail && e.detail.scope; if (!isWs() || !d || !d.startsWith('dev:') || d === lastDev) { if (d && !d.startsWith('dev:')) lastDev = null; return; }
    lastDev = d;
    if (cur === 'site' || cur === 'fsr') setTimeout(() => { if (isWs() && (cur === 'site' || cur === 'fsr')) go(cur, { quiet: true }); }, 0);
  });
  function init() {
    const s = startScreen({ hash: location.hash, pref: store.get('startScreen', 'home'), last: store.get('lastWs', null) });
    if (s.mode === 'ws') { setMode('ws'); setTimeout(() => go(s.ws, { quiet: true, noDraw: true }), 0); }
    else setMode(s.mode);
  }
  Object.assign(api, { go, setMode, mode: () => mode, current: () => cur, override, srcLine, renderHome, renderChips, settingsHTML, homeMapSVG, oldList, init });
  root.PeelWorkspaces = api;
})(typeof window !== 'undefined' ? window : globalThis);
