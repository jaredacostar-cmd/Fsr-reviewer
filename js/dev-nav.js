/* js/dev-nav.js — development navigation (Phase 6 extraction).
 * DV_TABS/showDvTab, project lookup, related projects, file tree, flyToSite,
 * showDetail and its document listener. (The timeline toggle went with js/fsr.js's dead Events
 * copy, navigation phase 5: devtab.js's own toggle, data-dt-tl, is the live one.)
 * Extracted verbatim from js/app.js (lines 3206, 3216-3382); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 * Note: DV_TABS/showDvTab are defined in js/fsr.js (per the ranges) and re-exported
 * here; bare DevScope/PeelAreas/L are pre-Phase-6 globals (kept bare).
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $ } = root.PeelUtil;
  const P = root.PeelPhases;
  const PD = root.PeelDesign;
  const map = root.PeelMapCore.map;
  const App = () => root.PeelApp;
  const SD = () => root.PeelSvcData;
  const MM = () => root.PeelMapMarkers;
  const SC = () => root.PeelSewerCap;
  const TS = () => root.PeelToolScope;
  const MP = () => root.PeelMasterPlan;
  const TB = () => root.PeelTopbar;
  const AC = () => root.PeelAerialCheck;
  const ST = () => root.PeelSewerTrace;
  const PF = () => root.PeelFsr;

/* ---- app.js lines 3206-3206 ---- */
  let currentProject = null, backToLoads = null, devBack = null;
/* ---- app.js lines 3216-3382 ---- */
  // ---- One application on its own, and the developments around it ----------------------------
  // A development groups every file on its land (a precinct plan, its draft plans, their
  // pre-consultations). Each formal application can open on its own as a sub-development: the
  // application, the pre-consultations that led to it and the building permits inside its land,
  // with the same tabs. Sub-developments are views only: the totals count the whole development
  // once. Keys are "<development key>#<file>".
  const SUBS = new Map();
  const isFormal = r => r.kind === 'application' && (r.stage || P.stageOf(r)) !== 'precon';
  const isPrecon = r => r.kind === 'application' && (r.stage || P.stageOf(r)) === 'precon';
  const civicOf = r => { const a = P.normalizeAddress(r.address); return a && /\d/.test(a) && !/^0+(\s*-\s*0+)?\s/.test(a) ? a : ''; };
  // Share of boundary a that lies inside boundary b (a 12 × 12 sample of a's box), cached.
  const fracCache = new WeakMap();
  function landShare(a, b) {
    let m = fracCache.get(a); if (!m) fracCache.set(a, m = new WeakMap());
    if (m.has(b)) return m.get(b);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of a) for (const [x, y] of g) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    let n = 0, k = 0;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / 12, y = y0 + (y1 - y0) * (j + 0.5) / 12;
      if (!P.pointInRings(x, y, a)) continue; n++; if (P.pointInRings(x, y, b)) k++;
    }
    const f = n ? k / n : 0; m.set(b, f); return f;
  }
  // How two files relate on the ground: the same civic address, or overlapping land (at least 15%
  // of either boundary; neighbours that only share an edge are not related). Null when unrelated.
  function landRel(a, b) {
    if (civicOf(a) && civicOf(a) === civicOf(b)) return 'same address';
    if (a.poly && b.poly) {
      const ab = landShare(a.poly, b.poly), ba = landShare(b.poly, a.poly);
      if (ab >= 0.9 && ba < 0.9) return 'within it';   // a lies inside b
      if (ba >= 0.9 && ab < 0.9) return 'covers it';    // b lies inside a
      return ab >= 0.15 || ba >= 0.15 ? 'overlapping land' : null;
    }
    const pt = a.poly ? b : a, pl = a.poly ? a : b;
    return pl.poly && pt.lat != null && P.pointInRings(pt.lng, pt.lat, pl.poly) ? (pl === a ? 'covers it' : 'within it') : null;
  }
  const sameLand = (a, b) => !!landRel(a, b);
  // The development's formal applications, each with the pre-consultations on its land; the
  // pre-consultations that match none stand alone. Every file appears once.
  function fileTree(p) {
    // Step B2: a tree development lists its files in tree order, with their links.
    const TG = window.PeelTreeGroups, tRows = TG && !p.parent && App().state && App().state.treeGrouped ? TG.fileRows(p) : null;
    if (tRows && tRows.length) return tRows;
    const formal = p.records.filter(isFormal), pre = p.records.filter(isPrecon), used = new Set();
    const rows = formal.map(a => ({ a, pre: pre.filter(r => !used.has(r) && sameLand(a, r) && used.add(r)) }));
    for (const r of pre) if (!used.has(r)) rows.push({ a: r, pre: [] });
    const start = r => r.events.length ? Math.min(...r.events.map(e => +e.date)) : Infinity;
    return rows.sort((x, y) => start(x.a) - start(y.a));
  }
  function subProject(p, ref) {
    const key = `${p.key}#${ref}`;
    if (SUBS.has(key)) return SUBS.get(key);
    const row = fileTree(p).find(t => t.a.ref === ref); if (!row) return null;
    const a = row.a;
    const permits = a.poly ? p.records.filter(r => r.kind === 'permit' && r.lat != null && P.pointInRings(r.lng, r.lat, a.poly)) : [];
    // A tree row opens its whole branch (the file and the files under it).
    const own = row.branch ? row.branch : [a, ...row.pre];
    // (on copies of the records: mergeProject writes each permit's placement, fileOf / prePlan / outside…,
    // onto the records it is given, and the development's own figures read the development's placement)
    const sub = P.mergeProject(key, [...own, ...permits.filter(r => !own.includes(r))].map(r => ({ ...r })), {});
    sub.parent = p; sub.subRef = ref; sub.title = `${ref} · ${a.address || p.title}`;
    if (a.lat != null) { sub.lat = a.lat; sub.lng = a.lng; }
    if (App().state.servicing) SD().tagAreas(sub);
    if (App().state.areas) { sub.sp = PeelAreas.locate(App().state.areas.secondaryPlans, sub.lng, sub.lat, sub.municipality); sub.mtsa = PeelAreas.locate(App().state.areas.mtsas, sub.lng, sub.lat, sub.municipality); }
    SUBS.set(key, sub);
    return sub;
  }
  function projectByKey(k) {
    if (!k) return null;
    if (SUBS.has(k)) return SUBS.get(k);
    const st = App().state, find = key => st.projects.find(x => x.key === key) || (st.projects.dormant || []).find(x => x.key === key) || (st.projects.siteActivity || []).find(x => x.key === key);
    // (a development's own key first: a land split's key ends "#<n>" like a branch's, phases.js buildProjects)
    const own = find(k); if (own) return own;
    const i = String(k).lastIndexOf('#'), base = i > 0 ? k.slice(0, i) : k;
    const p = i > 0 ? find(base) : null;
    if (!p) {
      // A key saved before the trees became the developments (Step B2): resolve it.
      const TG = window.PeelTreeGroups, list = App().state.projects;
      const to = TG && TG.resolve(k, x => list.some(q => q.key === x));
      return to && to !== k ? projectByKey(to) : null;
    }
    return subProject(p, k.slice(i + 1));
  }
  // Other developments on overlapping land (a precinct's draft plans, the precinct a site sits in).
  function relatedProjects(p) {
    if (p._rel && p._rel.list === App().state.projects) return p._rel.out;
    const mine = p.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled' && (r.poly || r.lat != null));
    const b = MM().projectBounds(p), out = [];
    if (b && mine.length) for (const q of App().state.projects) {
      if (q === p || q === p.parent || q.phase === 'cancelled') continue;
      const qb = MM().projectBounds(q); if (!qb || !b.intersects(qb)) continue;
      const theirs = q.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled');
      const hits = [];
      for (const r of theirs) { const m = mine.find(m => landRel(r, m)); if (m) hits.push({ r, how: landRel(r, m), m }); }
      if (hits.length) out.push({ q, hits });
    }
    out.sort((x, y) => (y.q.units || 0) - (x.q.units || 0));
    p._rel = { list: App().state.projects, out };
    return out;
  }
  // Opening a site flies the map to it (quick); with reduced motion it jumps via
  // setView instead. Skipped when the map is already there.
  // Where the map is not under the phone's bottom sheet: the site goes in the middle of that part
  // (the shift turned with the map, on the road grid).
  function clearCentre(t, z) {
    const mr = map.getContainer().getBoundingClientRect(), sh = document.getElementById('analysis');
    const sr = sh && window.PeelDataTab && window.PeelDataTab.shellNarrow && window.PeelDataTab.shellNarrow() ? sh.getBoundingClientRect() : null;
    const bottom = sr && sr.top > mr.top + 80 && sr.top < mr.bottom ? sr.top : mr.bottom;
    const d = (mr.top + mr.bottom) / 2 - (mr.top + bottom) / 2; if (d < 4) return t;
    const b = (map.getBearing ? map.getBearing() : 0) * Math.PI / 180;
    return map.unproject(map.project(t, z).add(L.point(d * Math.sin(b), d * Math.cos(b))), z);
  }
  function flyToSite(p, minZoom) {
    if (p.lat == null || p.lng == null) return;
    const z = Math.max(map.getZoom(), minZoom == null ? 15 : minZoom);
    const t = clearCentre(L.latLng(p.lat, p.lng), z);
    if (map.getCenter().distanceTo(t) < 30 && Math.abs(map.getZoom() - z) < 0.01) return;
    if (PD.prefersReducedMotion()) map.setView(t, z, { animate: false });
    else map.flyTo(t, z, { duration: 0.55 });
  }
  async function showDetail(p) {
    // Opening a development sets the analysis scope (js/devscope.js): the header, the
    // right panel and the map treatment. Files, selections and blocks are result scopes
    // (PeelSvcScope.openResult).
    // Phase 6: the detail needs full records. While the startup index is still
    // serving first paint, show its Overview with a skeleton and open
    // once the full snapshot lands (same project key: the grouping is identical).
    const app = App();
    if (app && !app.fullSnapshotReady()) {
      try { if (root.PeelAnalysisTabs) root.PeelAnalysisTabs.showFootTab('dev'); } catch (e) { /* the tab opens with the scope below */ }
      const body = $('#ov-body');   // (the Overview, until the development's panel is set)
      if (body) body.innerHTML = root.PeelUtil.skel('Loading development…');
      try { await app.whenFullSnapshot(); } catch (e) { /* open with what we have */ }
      return DevScope.open(projectByKey(p.key) || p);
    }
    return DevScope.open(p);
  }
  // The #detail side panel is gone (SPEC §3): what only it handled now listens on the document. Pipe
  // and DC links, unit counts and files are js/dev-verdict.js's document listener and the result
  // scope's (js/tool-scope.js).
  document.addEventListener('click', e => {
    if (e.target.closest('[data-loads-back]') && devBack) { const b = devBack; devBack = null; if (b.dc) return MP().showDcBack(b.dc); return b.pipe != null ? SC().showPipeLoads(b.pipe) : TS().showLoads(b.id, b.plantName); }
    return undefined;
  });

  // ---- Public contract ----
  const getCurrentProject = () => currentProject;
  const setCurrentProject = v => { currentProject = v; };
  const getBackToLoads = () => backToLoads;
  const setBackToLoads = v => { backToLoads = v; };
  const showDvTab = (...a) => PF().showDvTab(...a);
  const api = { getCurrentProject, setCurrentProject, getBackToLoads, setBackToLoads, showDvTab, get DV_TABS() { return PF().DV_TABS; }, SUBS, projectByKey, relatedProjects, fileTree, subProject, isFormal, isPrecon, flyToSite, showDetail };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevNav = api;
})(typeof window !== 'undefined' ? window : globalThis);
