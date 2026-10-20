/* js/dev-nav.js — development navigation (Phase 6 extraction).
 * DV_TABS/showDvTab, project lookup, related projects, file tree, flyToSite,
 * showDetail, the timeline toggle and its document listener.
 * Extracted verbatim from js/app.js (lines 3206, 3216-3382); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 * Note: DV_TABS/showDvTab are defined in js/fsr.js (per the ranges) and re-exported
 * here; bare DevScope/PeelAreas/L are pre-Phase-6 globals (kept bare).
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, store, dot } = root.PeelUtil;
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
  let projBack = null, projFrom = null;   // the development to go back to after going across to a related one
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
    const sub = P.mergeProject(key, [...own, ...permits.filter(r => !own.includes(r))], {});
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
    const i = String(k).lastIndexOf('#'), base = i > 0 ? k.slice(0, i) : k;
    const p = App().state.projects.find(x => x.key === base) || (App().state.projects.dormant || []).find(x => x.key === base);
    if (!p) {
      // A key saved before the trees became the developments (Step B2): resolve it.
      const TG = window.PeelTreeGroups, list = App().state.projects;
      const to = TG && TG.resolve(k, x => list.some(q => q.key === x));
      return to && to !== k ? projectByKey(to) : null;
    }
    return i > 0 ? subProject(p, k.slice(i + 1)) : p;
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
  const fileLine = r => `${esc(r.ref || 'File')}${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}`;
  function filesHTML(p) {
    const tree = p.parent ? [] : fileTree(p), formal = tree.filter(t => isFormal(t.a));
    const rel = relatedProjects(p).slice(0, 12);
    let html = '';
    const TG = window.PeelTreeGroups, treeRows = tree.length && tree[0].branch;
    if (formal.length > 1 || (formal.length && tree.length > formal.length) || (treeRows && tree.length > 1)) {
      const counted = p.buildout && p.buildout.basis;
      html += `<details class="sect" id="dev-files" open><summary><h2 class="section-title" data-info="dev-files">Applications in this development</h2><span class="muted small sect-sum">${fmtNum(tree.length)} files · open one on its own</span></summary>
        <ul class="file-tree">${tree.map(t => `<li${TG ? TG.indent(t) : ''}>${dot(t.a.phase)}<div><button type="button" class="btn small link" data-sub="${esc(t.a.ref)}">${fileLine(t.a)}</button>${t.a.units > 0 && isFormal(t.a) ? ` · ${fmtNum(t.a.units)} units` : ''}${isPrecon(t.a) && !treeRows ? ' <span class="muted">· pre-consultation, no formal application on its land yet</span>' : ''}
          ${t.pre.length ? `<div class="small muted">Pre-consultation${t.pre.length > 1 ? 's' : ''}: ${t.pre.map(r => esc(r.ref)).join(', ')}</div>` : ''}${TG ? TG.linkHTML(t) : ''}</div></li>`).join('')}</ul>
        ${treeRows ? `<p class="small muted">${esc(TG.FILES_NOTE)}</p></details>` : `<p class="small muted">Each file is listed once; pre-consultations sit under the application on the same land. The development counts its units once${counted ? ` (${fmtNum(p.buildout.planned)} planned, from the ${esc({ master: 'official plan / zoning / subdivision', siteplan: 'site plan', condo: 'condominium', other: 'planning' }[counted] || counted)} files)` : ''}; pre-consultation units are never added, since the formal application repeats them.</p></details>`}`;
    }
    if (p.areaPlan) html += `<p class="small area-note"><strong>Area plan:</strong> ${fmtNum(p.areaPlan.drafts)} draft plan${p.areaPlan.drafts === 1 ? '' : 's'} inside this ${esc(/precinct/i.test(p.description) ? 'precinct' : /block plan/i.test(p.description) ? 'block' : 'area')} ${p.areaPlan.drafts === 1 ? 'is its own development' : 'are their own developments'} (below, under Related applications)${p.areaPlan.covered ? `, carrying ${fmtNum(p.areaPlan.covered)} units` : ''}. ${p.areaPlan.covered ? `This plan counts only the units they don't already carry${p.units ? ` (${fmtNum(p.units)})` : ' (none left)'}, so nothing is counted twice.` : 'Their units are counted there, not here.'}</p>`;
    if (rel.length) html += `<details class="sect" id="dev-related"${p.records.every(isPrecon) || p.areaPlan ? ' open' : ''}><summary><h2 class="section-title" data-info="dev-related">Related applications</h2><span class="muted small sect-sum">${fmtNum(rel.length)} development${rel.length === 1 ? '' : 's'} on overlapping land</span></summary>
      <ul class="file-tree">${rel.map(({ q, hits }) => `<li>${dot(q.phase)}<div><button type="button" class="btn small link" data-relq="${esc(q.key)}"><strong>${esc(q.title)}</strong></button>${q.units > 0 ? ` · ${fmtNum(q.units)} units` : ''} <span class="muted">· ${esc(P.PHASE_BY_KEY[q.phase].label)}</span>
        <div class="small muted">${hits.slice(0, 4).map(h => `${fileLine(h.r)} <span class="rel-how">${esc({ 'same address': 'same address as', 'covers it': 'covers', 'within it': 'within', 'overlapping land': 'overlaps' }[h.how])} ${esc(h.m.ref)}</span>`).join('<br>')}${hits.length > 4 ? `<br>+ ${hits.length - 4} more` : ''}</div></div></li>`).join('')}</ul>
      <p class="small muted">Other developments with an application on the same land (overlapping boundaries or the same civic address), each counted in its own development, once.</p></details>`;
    return html;
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
    // Opening a development sets the analysis scope (js/devscope.js): the site bar, the
    // right panel and the map treatment. Files, selections and blocks are result scopes
    // (PeelSvcScope.openResult).
    // Phase 6: the detail needs full records. While the startup index is still
    // serving first paint, show the Development tab with a skeleton and open
    // once the full snapshot lands (same project key: the grouping is identical).
    const app = App();
    if (app && !app.fullSnapshotReady()) {
      try {
        const ft = $('#ftab-dev'); if (ft) ft.hidden = false;
        if (root.PeelAnalysisTabs) root.PeelAnalysisTabs.showFootTab('dev');
      } catch (e) { /* the tab opens with the scope below */ }
      const body = $('#pane-dev-body');
      if (body) body.innerHTML = root.PeelUtil.skel('Loading development…');
      try { await app.whenFullSnapshot(); } catch (e) { /* open with what we have */ }
      return DevScope.open(projectByKey(p.key) || p);
    }
    return DevScope.open(p);
  }
  function showTl(v) {
    document.querySelectorAll('[data-tl]').forEach(b => b.classList.toggle('on', b.dataset.tl === v));
    document.querySelectorAll('[data-tlv]').forEach(d => { d.hidden = d.dataset.tlv !== v; });
  }
  // The #detail side panel is gone (SPEC §3): what only it handled now listens on the document. Pipe
  // and DC links, unit counts and files are js/dev-verdict.js's document listener and the result
  // scope's (js/tool-scope.js).
  document.addEventListener('click', e => {
    if (e.target.closest('[data-loads-back]') && devBack) { const b = devBack; devBack = null; if (b.dc) return MP().showDcBack(b.dc); return b.pipe != null ? SC().showPipeLoads(b.pipe) : TS().showLoads(b.id, b.plantName); }
    const t = e.target.closest('[data-tl]');
    if (t) return showTl(t.dataset.tl);
    const rq = e.target.closest('[data-relq]');
    if (rq && currentProject) { const q = projectByKey(rq.dataset.relq); if (q) { projFrom = currentProject; showDetail(q); } return; }
    if (e.target.closest('[data-proj-back]') && projBack) { showDetail(projBack); return; }
    return undefined;
  });

  // ---- Public contract ----
  const getCurrentProject = () => currentProject;
  const setCurrentProject = v => { currentProject = v; };
  const getBackToLoads = () => backToLoads;
  const setBackToLoads = v => { backToLoads = v; };
  const showDvTab = (...a) => PF().showDvTab(...a);
  const api = { getCurrentProject, setCurrentProject, getBackToLoads, setBackToLoads, showDvTab, get DV_TABS() { return PF().DV_TABS; }, SUBS, projectByKey, relatedProjects, fileTree, subProject, isFormal, flyToSite, showDetail, showTl };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevNav = api;
})(typeof window !== 'undefined' ? window : globalThis);
