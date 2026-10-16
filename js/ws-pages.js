(function (root) {
  'use strict';
  // ---- Workspace pages (Stage 4b) -------------------------------------------------------------------
  // Each task chip opens a page in Home's layout: the workspace list on the left (js/workspaces.js) and,
  // on the right, the question, a one-sentence answer, caveat lines, four figures, a list beside a small
  // map, more short lists, folds (method, sources) and the actions. The pages lay out what the tabs
  // already work out (their panels, js/panel.js); the few figures added here are derived from those
  // numbers, never a new calculation:
  //   uncommitted reserve (Ontario D-5-1, treatment plants only) = rated − (existing + built + committed),
  //     in ML/d and in people at Peel criteria, with the pumping stations / storage that limit it;
  //   relief after the limit (the Master Plan relief status, 'gap');
  //   approved, not yet built (units left to build in files past their first planning approval);
  //   the Old pipes likelihood × consequence grid (bands decided with the user).
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmtNum = U.fmtNum || (n => Math.round(n).toLocaleString('en-CA'));
  const fmt1 = U.fmt1 || (n => (Math.round(n * 10) / 10).toFixed(1));

  // ---- Pure: the page --------------------------------------------------------------------------------
  // model: { id, eyebrow, name, status: { tone, text }, identity, calc, answer, caveats: [{ text, at }],
  //          figures: [{ v, u, label, ctx, tone }] (≤ 4), chart, lists: [{ title, rows: [{ html, attrs, tone }],
  //          total, see: attrs }], map: { svg, caption, attrs, html }, folds: [{ title, html, open }],
  //          method, sources, actions: [{ label, attrs, primary }], note, chip, scen, top (before the answer:
  //          a search box, a live map), mid (after the figures: a form, a grid, a summary) }
  // The first list sits beside the map; the others follow. Sections with nothing are left out.
  const attrs = a => Object.entries(a || {}).map(([k, v]) => (v === true ? ` ${k}` : v == null || v === false ? '' : ` ${k}="${esc(v)}"`)).join('');
  const TONE_WORD = { over: 'Over', tight: 'Tight', room: 'Room', stage: '' };
  const chipHTML = s => (s ? `<span class="pnl-chip t-${esc(s.tone || 'stage')}">${esc(s.text || TONE_WORD[s.tone] || '')}</span>` : '');
  function listHTML(l) {
    if (!l || !l.rows || !l.rows.length) return '';
    return `<section class="pnl-list page-list" data-psec="list"><div class="pnl-list-h"><h3>${esc(l.title)}</h3>${l.tools || ''}${l.see && (l.all || l.total > Math.min(5, l.rows.length)) ? `<button type="button" class="btn small link"${attrs(l.see)}>${l.all ? 'Show fewer' : `See all (${fmtNum(l.seeN != null ? l.seeN : l.total)}) →`}</button>` : ''}</div>
      <ul>${l.rows.slice(0, l.all ? l.rows.length : 5).map(r => `<li class="pnl-row${r.kv ? ' kv' : ''}${r.tone ? ` t-${esc(r.tone)}` : ''}"${r.attrs ? `${attrs(r.attrs)} tabindex="0" role="button"` : ''}>${r.html}</li>`).join('')}</ul></section>`;
  }
  function pageHTML(m, note) {
    const figs = (m.figures || []).filter(Boolean).slice(0, 4);
    const out = [];
    out.push(`<header class="home-h" data-psec="header"><p class="page-eyebrow small">${m.eyebrow || ''}</p><h1>${esc(m.name || '')}</h1>${chipHTML(m.status)}${m.identity ? `<p class="small muted page-id">${m.identity}</p>` : ''}</header>`);
    if (m.scen) out.push(`<div class="pnl-scen" data-psec="scenario">${m.scen}</div>`);
    if (m.top) out.push(m.top);
    out.push(`<p class="home-answer" data-psec="answer">${m.answer || ''}</p>`);
    for (const c of m.caveats || []) out.push(`<p class="home-caveat small" role="note" data-psec="caveat">⚠ ${esc(c.text)}${c.at ? ` <button type="button" class="btn small link" data-ws-full data-at="${esc(c.at)}">Review →</button>` : ''}</p>`);
    if (figs.length) out.push(`<div class="pnl-figs" data-psec="figures">${figs.map(f => `<div class="pnl-fig${f.tone ? ` t-${esc(f.tone)}` : ''}"${f.attrs ? `${attrs(f.attrs)} role="button" tabindex="0"` : ''}><b>${f.v}</b>${f.u ? `<span class="pnl-u">${esc(f.u)}</span>` : ''}<span class="pnl-l">${esc(f.label)}</span>${f.ctx ? `<small>${f.ctx}</small>` : ''}</div>`).join('')}</div>`);
    if (m.chart) out.push(`<div class="pnl-chart page-chart" data-psec="chart">${m.chart}</div>`);
    if (m.mid) out.push(m.mid);
    const lists = (m.lists || []).filter(l => l && l.rows && l.rows.length), first = lists[0];
    const mapSec = m.map && (m.map.svg || m.map.html || m.map.attrs) ? `<section class="home-map" data-psec="map"><div class="pnl-list-h"><h3>${esc(m.map.title || 'Where')}</h3>${m.map.attrs ? `<button type="button" class="btn small link"${attrs(m.map.attrs)}>Open the map →</button>` : ''}</div>${m.map.html || `<button type="button" class="home-map-btn"${attrs(m.map.attrs)} aria-label="${esc(m.map.label || 'Open the map')}">${m.map.svg || '<span class="home-map-empty small muted">Open the map</span>'}</button>`}${m.map.caption ? `<p class="small muted">${m.map.caption}</p>` : ''}</section>` : '';
    if (first || mapSec) out.push(`<div class="home-cols">${first ? listHTML(first) : '<div></div>'}${mapSec}</div>`);
    for (const l of lists.slice(1)) out.push(listHTML(l));
    for (const f of (m.folds || []).filter(x => x && x.html)) out.push(`<details class="pnl-fold" data-psec="fold"${f.open ? ' open' : ''}${f.id ? ` id="${esc(f.id)}"` : ''}><summary>${esc(f.title)}</summary><div>${f.html}</div></details>`);
    if (m.method) out.push(`<details class="pnl-fold" data-psec="method"><summary>Method and basis</summary><div class="small muted">${m.method}</div></details>`);
    if (m.sources) out.push(`<details class="pnl-fold" data-psec="sources"><summary>Sources</summary><div class="small muted">${m.sources}</div></details>`);
    const acts = (m.actions || []).filter(Boolean);
    const report = root.PeelReportIssue && root.PeelReportIssue.panelLinkHTML ? `<span class="pnl-report-line small">${root.PeelReportIssue.panelLinkHTML(`page:${m.id || ''}`, String(m.name || '').replace(/<[^>]*>/g, ''), m.id === 'home' ? 'Home' : 'Workspace page')}</span>` : '';
    out.push(`<footer class="page-foot" data-psec="footer"><div class="pnl-acts">${acts.map(a => `<button type="button" class="btn small${a.primary ? ' pnl-primary' : ' pnl-sec'}"${attrs(a.attrs)}${a.title ? ` title="${esc(a.title)}"` : ''}>${esc(a.label)}</button>`).join('')}</div><p class="pnl-note small">${note || ''}${report}</p></footer>`);
    return `<div class="home-main page-main" data-page="${esc(m.id || '')}">${out.join('')}</div>`;
  }
  const sectionsOf = h => [...String(h).matchAll(/data-psec="(\w+)"/g)].map(x => x[1]);

  // ---- Pure: the derived figures ---------------------------------------------------------------------
  // Uncommitted reserve at the treatment plants (D-5-1): rated − committed (existing + built + committed),
  // in ML/d and in people at Peel criteria (wastewater: the average day per person; water treatment: the
  // maximum day per person). D-5-1 asks that collection and pumping limits be checked before a reserve is
  // quoted: a plant's pumping stations (wastewater) or the lake-based system's storage and zone pumping
  // (South Peel water) over their limit are listed beside it.
  //   rows: Servicing › Capacity rows (js/svc-capacity.js); crit: Peel criteria; psPlant: ps id → plant.
  function reserveRows(rows, crit, psPlant = {}) {
    const ww = crit && crit.wastewater ? crit.wastewater.avg : 290, wmd = crit && crit.water ? crit.water.avg * crit.water.maxDay : 486;
    const over = r => r.pctCom >= 100 ? 'now' : r.pctBo >= 100 ? 'at build-out' : null;
    return rows.filter(r => r.kind === 'plant' || r.kind === 'wplant').map(r => {
      const reserve = r.cap - r.committed, perCap = r.kind === 'plant' ? ww : wmd;
      const lim = rows.filter(x => {
        if (!over(x)) return false;
        if (r.kind === 'plant') return x.kind === 'ps' && psPlant[x.id] === r.id.replace(/^plant:/, '');
        return r.id === 'wsys:southPeel' && (x.kind === 'storage' || x.kind === 'pump');
      }).map(x => ({ id: x.id, name: x.name, kind: x.kind, when: over(x), pctBo: x.pctBo, pctCom: x.pctCom }));
      return { id: r.id, ss: r.ss || null, name: r.name, kind: r.kind, unit: r.unit, cap: r.cap, committed: r.committed, reserve, pct: r.cap > 0 ? reserve / r.cap * 100 : null, people: reserve > 0 ? reserve * 1e6 / perCap : 0, perCap, limits: lim };
    }).sort((a, b) => (a.pct == null ? 1e9 : a.pct) - (b.pct == null ? 1e9 : b.pct));
  }
  // Old pipes grid (decided with the user): likelihood by age 50–64 / 65–79 / 80+ years, a moderate risk
  // rating one band up (pipes listed for risk alone start at band 1); consequence by units carried
  // 100–1,000 / 1,000–10,000 / 10,000+. Counts runs (and km) per cell; [3][3] is the worst.
  const LIKE = ['', '50–64 years', '65–79 years', '80+ years'], CONS = ['', '100–1,000 units', '1,000–10,000 units', '10,000+ units'];
  const likeOf = r => { const a = r.age; const base = a == null || a < 50 ? 0 : a < 65 ? 1 : a < 80 ? 2 : 3; return Math.max(1, Math.min(3, base + (r.risky ? 1 : 0))); };
  const consOf = r => (r.units >= 10000 ? 3 : r.units >= 1000 ? 2 : 1);
  function pipeGrid(runs) {
    const g = [1, 2, 3].map(() => [1, 2, 3].map(() => ({ n: 0, km: 0 })));
    for (const r of runs) { const c = g[likeOf(r) - 1][consOf(r) - 1]; c.n++; c.km += (r.lengthM || 0) / 1000; }
    return g;   // g[like-1][cons-1]
  }
  // Approved, not yet built: units left to build in files past their first planning approval (draft or
  // site plan approved, permit issued, under construction), as development pipeline reports count them.
  function approvedNotBuilt(projects, leftOf, rankOf, approvedRank = 2, completedRank = 5) {
    let u = 0, n = 0;
    for (const p of projects) { const k = rankOf(p); if (k >= approvedRank && k < completedRank) { const l = leftOf(p); if (l > 0) { u += l; n++; } } }
    return { units: u, n };
  }
  // Growth in an area: the pipeline by stage, in the order a file moves (decided with the user): pre-
  // application → in review → approved, no permit yet → permit issued or under construction → built since
  // 2021. The approved layer (committed, D-5-1) splits on what is still to permit. ofDev: js/layers.js.
  const STAGES = [
    ['anticipated', 'Pre-application', 'pre-consultation, block or precinct plan: no formal file yet'],
    ['proposed', 'In review', 'under formal review, not approved'],
    ['approved', 'Approved, no permit yet', 'draft or site plan approved; no building permit for these units yet'],
    ['permitted', 'Permit issued or under construction', 'approved, with building permits issued; not yet completed'],
    ['built', 'Built since 2021', 'completed since census day, not in the census yet'],
  ];
  function stageRows(devs, ofDev) {
    const u = { anticipated: 0, proposed: 0, approved: 0, permitted: 0, built: 0 }, est = { anticipated: 0, proposed: 0, approved: 0, permitted: 0, built: 0 };
    for (const it of devs) {
      // (an area's developments come as { p, share }: a site split between plans counts its share)
      const p = it && it.p ? it.p : it, sh = it && it.p ? it.share : 1;
      const L = ofDev(p); if (!L || !L.layer) continue;
      u.built += (L.parts.built || 0) * sh; u.proposed += (L.parts.proposed || 0) * sh; u.anticipated += (L.parts.anticipated || 0) * sh;
      const c = L.parts.committed || 0, noPermit = Math.min(c, Math.max(0, L.toPermit || 0));
      u.approved += noPermit * sh; u.permitted += (c - noPermit) * sh;
      if (L.estimated > 0) { const k = L.layer === 'committed' ? (noPermit >= c - noPermit ? 'approved' : 'permitted') : L.layer; if (k in est) est[k] += sh * Math.min(L.estimated, k === 'approved' ? noPermit : k === 'permitted' ? c - noPermit : L.parts[k] || 0); }
    }
    const total = Object.values(u).reduce((a, b) => a + b, 0);
    return { rows: STAGES.map(([key, label, note]) => ({ key, label, note, units: u[key], est: est[key], pct: total > 0 ? u[key] / total * 100 : 0 })), total };
  }
  // A development's stage on this chart (its layer; an approved one by whether most of it is permitted).
  function stageOf(L) {
    if (!L || !L.layer) return null;
    if (L.layer === 'committed') { const c = L.parts.committed || 0; return Math.min(c, L.toPermit || 0) >= c / 2 ? 'approved' : 'permitted'; }
    return L.layer === 'existing' ? 'built' : L.layer;
  }
  // Estimated counts (the hatching): a file whose units are not stated on it but found online, from a
  // pre-consultation, from the wording or from building permits (js/layers.js ESTIMATED). Each file's
  // estimate is what it has left to build (ofDev().estimated), its share in the area, split over the
  // kinds of estimate it holds. → { units, files: [{ p, share, est, kinds }], byKind }, largest first.
  const EST_KINDS = { online: 'found online', precon: 'pre-consultation estimate', estimate: 'estimate from the wording', permits: 'from building permits' };
  function estimateRows(devs, ofDev) {
    const files = [], byKind = {};
    let units = 0;
    for (const it of devs) {
      const p = it && it.p ? it.p : it, sh = it && it.p ? it.share : 1;
      const L = ofDev(p); if (!L || !(L.estimated > 0)) continue;
      const est = L.estimated * sh, parts = ((p.count && p.count.parts) || []).filter(x => EST_KINDS[x.kind] && x.units > 0);
      const raw = parts.reduce((t, x) => t + x.units, 0), kinds = {};
      for (const x of parts) kinds[x.kind] = (kinds[x.kind] || 0) + est * x.units / raw;
      for (const k in kinds) byKind[k] = (byKind[k] || 0) + kinds[k];
      units += est; files.push({ p, share: sh, est, kinds });
    }
    files.sort((a, b) => b.est - a.est);
    return { units, files, byKind };
  }
  // One bar per stage, labelled directly; the scale is the largest stage. census: dwellings on the
  // system (2021) for the context line.
  function stageChartHTML(st, census) {
    const max = Math.max(1, ...st.rows.map(r => r.units)), cls = { anticipated: 'ly-anticipated', proposed: 'ly-proposed', approved: 'stg-approved', permitted: 'stg-permitted', built: 'ly-built' };
    return `<div class="stg" role="table" aria-label="The pipeline by stage, in the order a file moves">
      <p class="stg-h small"><strong>The pipeline by stage</strong> <span class="muted">dwellings, in the order a file moves</span></p>
      ${st.rows.map(r => `<div class="stg-row${st.on === r.key ? ' on' : ''}" role="row" title="${esc(r.label)}: ${esc(r.note)}"${st.click ? ` data-ws-stage="${r.key}" tabindex="0"` : ''}><span class="stg-l" role="cell">${esc(r.label)}</span><span class="stg-track" role="cell"><i class="stg-fill ${cls[r.key]}" style="width:${(r.units / max * 100).toFixed(1)}%"></i>${r.est > 0 ? `<i class="stg-est" style="width:${(Math.min(r.est, r.units) / max * 100).toFixed(1)}%"></i>` : ''}</span><b class="stg-v" role="cell">${fmtNum(Math.round(r.units))}</b><span class="stg-p muted" role="cell">${r.units > 0 && r.pct < 0.5 ? '&lt;1' : Math.round(r.pct)}%</span></div>`).join('')}
      <p class="stg-foot small muted">${fmtNum(Math.round(st.total))} dwellings in the pipeline${census > 0 ? ` would add about <strong>${Math.round(st.total / census * 100)}%</strong> to the ${fmtNum(Math.round(census))} dwellings on the system (2021 census)` : ''}.${st.rows.some(r => r.est > 0) ? ' Hatched: counts estimated from the application (no unit count stated).' : ''}</p>
    </div>`;
  }
  // Review an FSR: what an FSR covers (Region of Peel, Functional Servicing Report Requirements, 2009)
  // and what this app can check. app = compared here; part = facilities only; eye = an engineer's review.
  const COVERAGE = [
    ['Population and land use', 'app', 'People at Peel persons per unit; jobs from the floor area stated'],
    ['Water demands: average day, maximum day, peak hour', 'app', 'Peel Modelling Demand Table v2.0'],
    ['Sanitary flows: average, peak dry, peak wet (Harmon, I&I)', 'app', 'Linear Wastewater Standards R1.0'],
    ['Connection points: pressure zone, sewer block', 'app', 'From the site location'],
    ['Downstream: pumping stations and plant', 'part', 'Facilities on the path; not sewer pipes'],
    ['Local sewer and watermain capacity', 'eye', 'Pipe-by-pipe results are left to the Region’s model'],
    ['Fire flow (Fire Underwriters Survey) and pressures', 'eye', 'Not modelled here'],
  ];

  const api = { pageHTML, sectionsOf, listHTML, reserveRows, pipeGrid, likeOf, consOf, LIKE, CONS, approvedNotBuilt, COVERAGE, STAGES, stageRows, stageOf, stageChartHTML, EST_KINDS, estimateRows };
  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    return;
  }

  // ---- Browser: the builders ------------------------------------------------------------------------
  const App = () => root.PeelApp, PN = () => root.PeelPanel, OT = () => root.PeelOverviewTab, Cap = () => root.PeelSvcCapacity;
  const W = () => root.PeelWorkspaces, MM = () => root.PeelMapMarkers, R = () => root.PeelReports, P = () => root.PeelPhases;
  const now = () => (MM() && MM().THIS_YEAR) || new Date().getFullYear();
  const specOf = (key, scope) => { const e = PN() && PN().get(key); return e && e.spec && (!scope || e.scope === scope) ? e.spec : null; };
  const areaScope = 'area';
  const devNow = () => (root.DevScope && root.DevScope.current ? root.DevScope.current() : null);
  const caveats = () => (root.PeelRecordsTab && root.PeelRecordsTab.caveats ? root.PeelRecordsTab.caveats() : []);
  const scen = () => (PN() ? PN().scenarioChip() : '');
  const label = id => (W() && W().BY_ID[id] ? W().BY_ID[id].label : id);
  const eyebrow = id => `${esc(label(id))} · ${esc((App() && App().state.muni) || 'Peel')}`;
  // A panel row that opened a scope opens it on the map from a page (the workspace's map view).
  const toMap = (ws, r) => { const a = r.attrs || {}, x = { 'data-ws-go': ws }; if (a['data-ss']) x['data-ws-ss'] = a['data-ss']; if (a['data-pnl-dev']) x['data-ws-dev'] = a['data-pnl-dev']; if (a['data-ce-open']) x['data-ws-ce'] = a['data-ce-open']; if (a['data-pipe'] != null) x['data-ws-pipe'] = a['data-pipe']; return { ...r, attrs: r.attrs ? { ...x, title: a.title } : null }; };
  const loading = (id, what) => ({ id, eyebrow: eyebrow(id), name: (W() && W().BY_ID[id] && W().BY_ID[id].question) || label(id), answer: `<span class="muted">${esc(what || 'Loading…')}</span>` });

  // ---- Small maps: a Peel frame from the wastewater blocks -------------------------------------------
  // bounds: [minLng, minLat, maxLng, maxLat] to zoom to (an area), else all of Peel's sewered blocks.
  // One orientation everywhere: the small maps turn as the live map does (Peel's road grid by default,
  // north up as the option; js/map-core.js), with the municipal outlines and their names, and a north
  // arrow when turned.
  const bearing = () => { const C = root.PeelMapCore; return C && C.getOrientation && C.getOrientation() === 'grid' && C.canRotate ? C.GRID_BEARING : 0; };
  function frame(Wd = 360, H = 300, bounds = null) {
    const sv = App() && App().state.servicing; if (!sv) return null;
    const base = (sv.drainage || []).filter(d => d.rings && !(d.served != null && d.served < 0.5));
    const munis = (root.PeelMapCore && root.PeelMapCore.getMunis && root.PeelMapCore.getMunis()) || null;
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    const ext = (x, y) => { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); };
    if (bounds) { ext(bounds[0], bounds[1]); ext(bounds[2], bounds[3]); } else for (const d of base) for (const r of d.rings) for (const [x, y] of r) ext(x, y);
    if (mnx > mxx) return null;
    // Local projection (km east, km south), turned clockwise by the bearing, then fitted to the box.
    const cx = (mnx + mxx) / 2, cy = (mny + mxy) / 2, kx = Math.cos(cy * Math.PI / 180), a = bearing() * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const rot = (x, y) => { const e = (x - cx) * kx, sth = cy - y; return [e * ca - sth * sa, e * sa + sth * ca]; };
    const pts = bounds ? [[mnx, mny], [mnx, mxy], [mxx, mny], [mxx, mxy]] : base.flatMap(d => d.rings.flat());
    let a0 = 1e9, b0 = 1e9, a1 = -1e9, b1 = -1e9;
    for (const [x, y] of pts) { const [u, v] = rot(x, y); a0 = Math.min(a0, u); b0 = Math.min(b0, v); a1 = Math.max(a1, u); b1 = Math.max(b1, v); }
    const sc = Math.min((Wd - 10) / ((a1 - a0) || 1e-9), (H - 10) / ((b1 - b0) || 1e-9));
    const ox = (Wd - (a1 - a0) * sc) / 2, oy = (H - (b1 - b0) * sc) / 2;
    const pt = (x, y) => { const [u, v] = rot(x, y); return [+(ox + (u - a0) * sc).toFixed(1), +(oy + (v - b0) * sc).toFixed(1)]; };
    const path = rings => rings.map(r => r.map(([x, y], i) => `${i ? 'L' : 'M'}${pt(x, y).join(',')}`).join('') + 'Z').join('');
    const line = ps => ps.map(([x, y], i) => `${i ? 'L' : 'M'}${pt(x, y).join(',')}`).join('');
    const muniSvg = () => (munis ? (munis.munis || []).map(m => `<path d="${path(m.rings)}" class="hm-muni"/>`).join('') : '');
    const muniLbl = () => (munis && !bounds ? (munis.munis || []).filter(m => m.label).map(m => { const [x, y] = pt(m.label[0], m.label[1]); return `<text x="${x}" y="${y}" class="hm-muni-l">${esc(m.name)}</text>`; }).join('') : '');
    const north = () => (a ? `<g class="hm-north" transform="translate(${Wd - 16},16) rotate(${bearing()})"><path d="M0 -10 4 3 0 0 -4 3z"/><text y="12">N</text></g>` : '');
    const svg = (inner, aria, labels = '') => `<svg viewBox="0 0 ${Wd} ${H}" class="home-map-svg" role="img" aria-label="${esc(aria)}">${base.map(d => `<path d="${path(d.rings)}" class="hm-base"/>`).join('')}${muniSvg()}${inner}${muniLbl()}${labels}${north()}</svg>`;
    return { sv, base, pt, path, line, Wd, H, svg, bearing: bearing() };
  }
  // Labels on the top few items of a small map: name at the point, clear of the others.
  function mapLabels(f, items) {
    const placed = [];
    return items.slice(0, 5).map(({ lng, lat, name }) => {
      const [x, y] = f.pt(lng, lat), w = Math.min(140, String(name).length * 5.6), right = x + 7 + w < f.Wd;
      const box = { x: right ? x + 6 : x - 6 - w, y: y - 9, w, h: 12 };
      if (placed.some(o => o.x < box.x + box.w && box.x < o.x + o.w && o.y < box.y + box.h && box.y < o.y + o.h)) return '';
      placed.push(box);
      return `<text x="${right ? x + 6 : x - 6}" y="${y + 3}" class="hm-lbl"${right ? '' : ' text-anchor="end"'}>${esc(name)}</text>`;
    }).join('');
  }
  // Servicing capacity: catchments, zones and plants over (red) or past the 90% trigger (amber).
  function capacityMap(rows) {
    const f = frame(); if (!f) return '';
    const tone = r => (r.pctBo >= 100 ? 'over' : r.pctBo >= 90 ? 'tight' : null), out = [], lbl = [];
    const byId = new Map((f.sv.psAreas || []).map(d => [d.id, d])), zones = f.sv.zones || [];
    const centre = g => { let x = 0, y = 0, n = 0; for (const r of g.rings) for (const [a, b] of r) { x += a; y += b; n++; } return n ? [x / n, y / n] : null; };
    for (const r of rows) {
      const t = tone(r); if (!t) continue;
      let g = null;
      if (r.kind === 'ps') g = byId.get(r.id.slice(3));
      else if (r.kind === 'pump' || r.kind === 'storage') { const m = String(r.name).match(/zone\s*(\w+)/i); g = m ? zones.find(z => String(z.zone) === m[1]) : null; }
      if (g && g.rings) { out.push(`<path d="${f.path(g.rings)}" class="hm-${t}"><title>${esc(r.name)}: ${Math.round(r.pctBo)}% at build-out</title></path>`); const c = g.outletAt || centre(g); if (c) lbl.push({ lng: c[0], lat: c[1], name: r.name, pct: r.pctBo }); }
    }
    for (const pl of (f.sv.meta && f.sv.meta.plants) || []) {
      if (!pl.lnglat) continue;
      const r = rows.find(x => x.id === `plant:${pl.name}`), t = r ? tone(r) : null, [x, y] = f.pt(pl.lnglat[0], pl.lnglat[1]);
      out.push(`<rect x="${(x - 5).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="10" height="10" class="hm-plant${t ? ` hm-${t}` : ''}"><title>${esc(r ? r.name : pl.name)}${r ? `: ${Math.round(r.pctBo)}% at build-out` : ''}</title></rect>`);
      if (t) lbl.push({ lng: pl.lnglat[0], lat: pl.lnglat[1], name: r.name, pct: r.pctBo + 1000 });
    }
    return f.svg(out.join(''), 'Peel’s wastewater blocks, with the facilities over capacity or past the 90% trigger at build-out highlighted', mapLabels(f, lbl.sort((a, b) => b.pct - a.pct)));
  }
  // Developments as dots sized by units (Growth, This week), optional highlight set (labelled).
  function devsMap(set, hl) {
    const f = frame(); if (!f) return '';
    const out = [], dotAt = (p, r, cls, t = '') => { const [x, y] = f.pt(p.lng, p.lat); return `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}">${t}</circle>`; };
    for (const p of set) if (p.lat != null && (p.units || 0) >= 50) out.push(dotAt(p, Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1), 'hm-dev'));
    const hs = (hl || []).filter(p => p.lat != null);
    for (const p of hs) out.push(dotAt(p, 4.5, 'hm-hl', `<title>${esc(p.title)}</title>`));
    return f.svg(out.join(''), 'Peel’s wastewater blocks with the developments on the map', mapLabels(f, hs.slice(0, 3).map(p => ({ lng: p.lng, lat: p.lat, name: p.title }))));
  }
  // Projects: the 2026 DC works (wastewater, water).
  function worksMap() {
    const f = frame(), di = App() && App().state.dcInfra; if (!f) return '';
    const out = [];
    if (di) for (const sys of ['wastewater', 'water']) for (const ln of (di[sys] && di[sys].lines) || []) out.push(`<path d="${f.line(ln.g)}" class="hm-dc hm-dc-${sys}"/>`);
    return f.svg(out.join(''), 'The 2026 DC works (draft) on Peel’s wastewater blocks');
  }
  // Old pipes: the runs on the list, heavier where moderate risk.
  function pipesMap(list) {
    const f = frame(), S = MM() && MM().SEW; if (!f || !S || !S.data) return '';
    const out = list.map(r => { const c = S.data.pipes[r.i][10], pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k], c[k + 1]]); return `<path d="${f.line(pts)}" class="hm-pipe${r.risky ? ' risky' : ''}"/>`; });
    return f.svg(out.join(''), 'The old pipes on the list');
  }
  // A site: the Report's sketch (sewers, DC works, nearby developments, the site), its caption left out.
  function siteMap(p) {
    const r = R(); if (!r || !r.sketchSVG || p.lat == null) return '';
    const near = ((App() && App().state.filtered) || []).filter(q => q !== p && q.lat != null && Math.abs(q.lat - p.lat) < 0.02 && Math.abs(q.lng - p.lng) < 0.03);
    try { return r.sketchSVG({ center: [p.lng, p.lat], halfM: 1500, points: near, site: [p.lng, p.lat], W: 360, H: 260, bearing: bearing() }).replace(/<div class="meta">[\s\S]*$/, '').replace('class="sk"', 'class="sk home-map-svg"'); } catch (e) { return ''; }
  }

  // ---- Home --------------------------------------------------------------------------------------
  function home() {
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null; if (!a) return loading('home', 'Loading the briefing…');
    // The servicing model loads after the developments: until then Needs attention keeps its place with
    // a placeholder (never silently left out), and the map's key waits for the colours it explains.
    const cap = Cap() && Cap().collect ? Cap().collect() : null, ready = !!cap, rows = cap || [];
    const wait = { title: 'Needs attention', rows: [{ kv: true, html: '<span class="muted">Checking servicing capacity…</span>' }], total: 1 };
    const nl = a.lists.find(l => l.title === 'Needs attention');
    const needs = ready ? (nl && nl.rows.length ? nl : null) || { title: 'Needs attention', rows: [{ kv: true, html: '<span class="muted">Nothing reaches a limit or the 90% trigger at build-out.</span>' }], total: 1 } : wait;
    const week = a.lists.find(l => l.title === 'This week');
    // Home's rows open the matching workspace page.
    const toPage = (ws, l) => (l ? { ...l, rows: l.rows.map(r => ({ ...r, attrs: { 'data-ws-page': ws, title: (r.attrs || {}).title } })), see: { 'data-ws-page': ws } } : null);
    return { id: 'home', eyebrow: esc(a.head && a.head.identity ? a.head.identity : 'Peel'), name: `${(App() && App().state.muni) || 'Peel'}: what needs attention`, status: a.head && a.head.status, scen: scen(), answer: a.answer, caveats: caveats(),
      figures: a.figures.map(f => ({ ...f, attrs: { 'data-ws-page': 'growth', title: 'Growth in an area' } })),
      lists: [ready ? toPage('tight', needs) : needs, toPage('week', week)],
      map: { svg: capacityMap(rows), attrs: { 'data-ws-page': 'tight' }, label: 'Open Servicing capacity', caption: !ready ? '<span class="muted">Checking servicing capacity…</span>' : '<span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out (catchments, zones and plants)' },
      actions: [{ label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' }, primary: true }, { label: 'Full map (all tools)', attrs: { 'data-ws-full': '' } }] };
  }

  // ---- Servicing capacity ------------------------------------------------------------------------
  function tight() {
    const s = specOf('svc:capacity', areaScope), rows = Cap() && Cap().collect ? Cap().collect() : null;
    if (!s || !rows) return loading('tight', 'Loading the servicing model…');
    const crit = App().state.criteria, psPlant = Object.fromEntries(((App().state.servicing && App().state.servicing.psAreas) || []).map(a => [`ps:${a.id}`, a.plant]));
    const res = reserveRows(rows, crit, psPlant), late = rows.filter(r => r.relief === 'gap' && r.limit.y != null).sort((a, b) => (a.limit.y === 'today' ? 0 : a.limit.y || 1e4) - (b.limit.y === 'today' ? 0 : b.limit.y || 1e4));
    const over = rows.filter(r => r.pctBo >= 100);
    const plants = rows.filter(r => (r.kind === 'plant' || r.kind === 'wplant') && r.limit.y != null).sort((a, b) => (a.limit.y === 'today' ? 0 : a.limit.y) - (b.limit.y === 'today' ? 0 : b.limit.y));
    const first = plants[0], low = res[0], end = (root.PeelSvcPlants && root.PeelSvcPlants.hz.end) || 2051;
    const yTxt = y => (y === 'today' ? 'now' : y == null ? `after ${end}` : `≈${y}`);
    const q = r => (r.unit === 'L/s' ? `${fmtNum(Math.round(r.v))} L/s` : `${fmt1(r.v)} ${r.unit}`);
    const resRow = r => ({ tone: r.pct < 0 ? 'over' : r.pct < 10 ? 'tight' : null, attrs: r.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': r.ss, title: `Open ${r.name} on the map` } : null,
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.kind === 'wplant' ? '💧 ' : ''}${esc(r.name)}</span><span class="pnl-r-year${r.reserve < 0 ? ' t-over' : ''}">${r.reserve < 0 ? 'none' : `${fmt1(r.reserve)} ML/d`}</span></div>
        <div class="pnl-r-meta"><span>${r.reserve < 0 ? `committed ${fmt1(-r.reserve)} ML/d past rated` : `≈${fmtNum(Math.round(r.people / 100) * 100)} people · ${Math.round(r.pct)}% of rated ${fmt1(r.cap)} ML/d`}</span></div>
        ${r.limits.length ? `<small class="pnl-r-line t-tight">Limited by ${r.limits.slice(0, 3).map(x => `${esc(x.name)} (${x.when}, ${Math.round(x.when === 'now' ? x.pctCom : x.pctBo)}%)`).join(', ')}${r.limits.length > 3 ? ` and ${r.limits.length - 3} more` : ''}</small>` : ''}` });
    const lateRow = r => ({ tone: 'over', attrs: r.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': r.ss, title: `Open ${r.name} on the map` } : null,
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.sys === 'water' ? '💧 ' : ''}${esc(r.name)}</span><span class="pnl-r-year t-over">limit ${yTxt(r.limit.y)}</span></div><small class="pnl-r-line">${esc(r.limit.what)} · ${Math.round(r.pctBo)}% at build-out · ${r.reliefY ? `relief ≈${r.reliefY}, after the limit` : 'no relief listed in the Master Plan'}</small>` });
    const area = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null;
    return { id: 'tight', eyebrow: eyebrow('tight'), name: 'Can the system take it?', status: s.head.status, identity: s.head.identity, scen: scen(), answer: s.answer, caveats: caveats().filter(c => /source/i.test(c.text)),
      figures: [
        s.figures[0],
        { v: fmtNum(late.length), u: late.length === 1 ? 'facility' : 'facilities', label: 'no relief in time', ctx: `${fmtNum(late.filter(r => r.reliefY).length)} relief after the limit · ${fmtNum(late.filter(r => !r.reliefY).length)} none listed`, tone: late.length ? 'over' : 'room' },
        first ? { v: yTxt(first.limit.y), u: '', label: 'first treatment trigger', ctx: `${esc(first.name)} · ${esc(first.limit.what)}`, tone: 'tight' } : null,
        low ? { v: low.reserve < 0 ? 'none' : fmt1(low.reserve), u: low.reserve < 0 ? '' : 'ML/d', label: 'uncommitted reserve, lowest', ctx: `${esc(low.name)}${low.reserve > 0 ? ` · ≈${fmtNum(Math.round(low.people / 100) * 100)} people` : ''}`, tone: low.pct < 10 ? 'tight' : 'room' } : null,
      ],
      chart: area && area.chart ? area.chart : '',
      lists: [
        { ...s.lists[0], title: 'Soonest limits', tools: s.lists[0].tools, rows: s.lists[0].rows.map(r => toMap('tight', r)), see: { 'data-ws-go': 'tight', 'data-ws-fulltable': 'svc:capacity' } },
        { title: 'Uncommitted reserve at the treatment plants', rows: res.map(resRow), total: res.length },
        { title: 'No relief in time', rows: late.map(lateRow), total: late.length, see: { 'data-ws-page': 'projects' } },
      ],
      map: { svg: capacityMap(rows), attrs: { 'data-ws-go': 'tight' }, label: 'Open Servicing capacity on the map', caption: '<span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out' },
      method: `${s.method} Uncommitted reserve (Ontario MECP Procedure D-5-1, treatment plants only): rated capacity less existing, built and committed flow, in ML/d and in people at Peel criteria (${fmtNum(crit.wastewater.avg)} L/person/day for wastewater; ${fmtNum(crit.water.avg)} L × ${crit.water.maxDay} maximum day for water). D-5-1 asks that collection and pumping limits be checked first: a pumping station (wastewater) or storage and zone pumping (South Peel water) over its limit is named beside the plant it limits. No relief in time: the facility reaches its limit and the 2020 Master Plan either lists no relief for it or plans the relief after that year (the same test as Capital › Timing).`,
      sources: s.sources,
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'tight' }, primary: true }, { label: 'Full table', attrs: { 'data-ws-go': 'tight', 'data-ws-fulltable': 'svc:capacity' } }, { label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' } }] };
  }

  // ---- Check a site / Review an FSR: the Find step ---------------------------------------------------
  function find(id) {
    const Ph = P(), proj = (App() && App().state.projects) || [];
    const last = p => (Ph && Ph.lastActivityOf ? Ph.lastActivityOf(p) || 0 : 0);
    const recent = proj.filter(p => p.phase !== 'cancelled' && p.phase !== 'completed' && (p.units || 0) > 0).map(p => [p, last(p)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
    const big = proj.filter(p => p.phase === 'review' && (p.units || 0) >= 100).sort((a, b) => b.units - a.units).slice(0, 5);
    const devRow = p => ({ attrs: { 'data-ws-pick': p.key, title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(Ph && Ph.PHASE_BY_KEY[p.phase] ? Ph.PHASE_BY_KEY[p.phase].label : p.phase)}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} units</small>` });
    const steps = [['Find', 'Search an address or file number, or pick one below.'], ['Result', id === 'fsr' ? 'Its servicing path, with the FSR cross-check.' : 'Its servicing, timing and what to confirm.'], ['Output', id === 'fsr' ? 'The comparison, as notes for the review.' : 'The one-page servicing memo.']];
    return { id, eyebrow: `${esc(label(id))} · step 1 of 3`, name: id === 'fsr' ? 'Do the consultant’s figures match Peel’s criteria?' : 'Can this development be serviced, and when?',
      top: '<div class="page-search" id="page-search"></div>',
      answer: 'Find the development: search an address or file number, or pick one below.',
      lists: [
        { title: 'Steps', rows: steps.map(([t, d], i) => ({ kv: true, html: `<div class="pnl-step${i === 0 ? ' on' : ''}"><span class="pnl-step-n" aria-hidden="true">${i + 1}</span><span><strong>${t}</strong> ${esc(d)}</span></div>` })), total: 3 },
        { title: 'Recently active', rows: recent.map(devRow), total: recent.length },
        { title: 'Large files under review', rows: big.map(devRow), total: big.length },
      ],
      map: { svg: devsMap(((App() && App().state.filtered) || []), recent), attrs: { 'data-ws-go': id }, label: 'Pick a development on the map', caption: '<span class="hm-key hm-key-hl"></span> recently active <span class="hm-key hm-key-dev"></span> developments of 50+ units (sized by units); click to pick one on the map' },
      actions: [{ label: 'Pick on the map', attrs: { 'data-ws-go': id }, primary: true }] };
  }
  // ---- Check a site, with a site -----------------------------------------------------------------------
  function site() {
    const p = devNow(); if (!p) return find('site');
    const s = specOf('overview:', `dev:${p.key}`); if (!s) return loading('site', `Loading ${p.title}…`);
    return { id: 'site', eyebrow: `${esc(label('site'))} · <span class="pnl-steps-i">✓ Find › <b>Result</b> › Output: Servicing memo</span>`, name: p.title, status: s.head.status, identity: s.head.identity, scen: scen(), answer: s.answer,
      caveats: [], figures: s.figures, chart: s.chart,
      lists: (s.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('site', r)) })),
      map: { svg: siteMap(p), attrs: { 'data-ws-go': 'site' }, label: `Open ${p.title} on the map`, caption: '<span class="hm-key hm-key-site"></span> the site <span class="hm-key hm-key-dev"></span> nearby developments · sewers · 2026 DC works (dashed)' },
      folds: s.folds, method: s.method, sources: s.sources, onMount: s.onMount,
      actions: [{ label: 'Servicing memo', attrs: { 'data-pnl-memo': '' }, primary: true }, { label: 'Review its FSR', attrs: { 'data-ws-page': 'fsr' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'site' } }, { label: 'Another site', attrs: { 'data-ws-unpick': 'site' } }] };
  }

  // ---- Growth in an area: drill down Peel → municipality → plan → precinct / sub-area → its files ----
  // The plan tree is Growth › Areas' own (js/plan-rollup.js through js/plan-tables.js): every row equals
  // the sum of the rows under it. A row opens the next level; the stage bars filter the area's files.
  let gAt = 'peel', gStage = 'all';
  const KIND_WORD = { peel: 'Peel', municipality: 'municipality', plan: 'secondary plan', subplan: 'sub-area', precinct: 'precinct plan', none: 'not in a plan', rest: 'elsewhere in the plan' };
  // (Mississauga calls its plans character areas)
  const kindOf = (n, muni) => (n.kind === 'plan' && muni === 'Mississauga' ? 'character area' : KIND_WORD[n.kind] || n.kind);
  function nodeDevs(n, out = new Map()) {
    for (const d of n.devs) out.set(d.p, (out.get(d.p) || 0) + d.share);
    for (const c of n.children) nodeDevs(c, out);
    return out;
  }
  function growth() {
    const PT = root.PeelPlanTables, pl = specOf('growth:pipeline', areaScope), tm = specOf('growth:timing', areaScope);
    const r = PT && PT.compute ? (() => { try { return PT.compute(); } catch (e) { return null; } })() : null;
    if (!r || !pl) return loading('growth', 'Loading the pipeline…');
    let n = r.nodes.get(gAt); if (!n) { gAt = 'peel'; n = r.root; }
    const G = root.Growth, Ph = P(), Ly = root.PeelLayers;
    const dm = nodeDevs(n), items = [...dm].map(([p, share]) => ({ p, share: Math.min(1, share) }));
    const atPeel = n.kind === 'peel';
    const muniOf = x => { for (let y = x; y; y = y.parent ? r.nodes.get(y.parent) : null) if (y.kind === 'municipality') return y.name; return ''; };
    const kind = x => kindOf(x, muniOf(x));
    // The trail: Peel › municipality › plan › …
    const trail = []; for (let x = n; x; x = x.parent ? r.nodes.get(x.parent) : null) trail.unshift(x);
    const crumbs = trail.map((x, i) => (i < trail.length - 1 ? `<button type="button" class="btn small link" data-ws-drill="${esc(x.id)}">${esc(x.name)}</button>` : `<strong>${esc(x.name)}</strong>`)).join(' <span aria-hidden="true">›</span> ');
    // The stages, for this area.
    const stage = Ly && Ly.ofDev ? stageRows(items, q => Ly.ofDev(q)) : null;
    if (stage) { stage.click = true; stage.on = gStage; }
    const CAr = root.PeelCensusAreas, bc = atPeel && CAr && CAr.baselineCensus ? CAr.baselineCensus() : null;
    const census = bc && root.PeelAreas && root.PeelAreas.censusTotals ? root.PeelAreas.censusTotals(bc.das, {}).dwellings : 0;
    // Employment: the applications' floor area and jobs (Growth's own sums; an area counts a split site's share).
    let emp = { planned: 0, jobs: 0, permitted: 0, completed: 0, left: 0 };
    const GU = root.PeelGrowthUI, deps = GU && GU.growthDeps ? GU.growthDeps().aggregate : null;
    if (G && G.aggregateTypes && deps) for (const { p, share } of items) { const e = G.aggregateTypes([p], deps).emp; for (const k in emp) emp[k] += (e[k] || 0) * share; }
    // (units exact; people and jobs to the nearest hundred, as Home and the panels: one rounding rule)
    const m = n.m, n0 = v => fmtNum(Math.round(v)), p0 = v => fmtNum(U.roundPop ? U.roundPop(v) : Math.round(v));
    const anb = stage ? stage.rows.filter(x => x.key === 'approved' || x.key === 'permitted').reduce((t, x) => t + x.units, 0) : 0;
    const f2031 = atPeel && tm && tm.figures ? tm.figures.find(f => /2031/.test(f.label)) : null;
    // The next level down (municipalities, plans, precincts and sub-areas), each opening its own level.
    const kids = n.children.filter(c => c.m.planned >= 0.5 || c.m.jobs >= 0.5).sort((x, y) => y.m.planned - x.m.planned);
    const kidRow = c => ({ attrs: { 'data-ws-drill': c.id, title: `Open ${c.name}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(c.name)}</span><span class="pnl-r-year">${n0(c.m.planned)} units</span></div><small class="pnl-r-line">${esc(kind(c))} · ${n0(c.m.left)} left to build · ${p0(c.m.people)} people${c.m.jobs >= 0.5 ? ` · ${p0(c.m.jobs)} jobs` : ''}${c.children.length ? ` · ${c.children.length} ${c.kind === 'municipality' ? 'plans' : 'parts'}` : ''}</small>` });
    // At Peel, the largest plans too (straight to their level).
    const plans = atPeel ? [...r.nodes.values()].filter(x => x.kind === 'plan' && x.m.planned >= 0.5).sort((x, y) => y.m.planned - x.m.planned) : [];
    // The area's files, by stage (the bars filter them): pre-application to built.
    const STG = Object.fromEntries(STAGES.map(([k, l]) => [k, l]));
    const files = items.map(({ p, share }) => ({ p, share, st: Ly ? stageOf(Ly.ofDev(p)) : null })).filter(x => x.st && (gStage === 'all' || x.st === gStage) && (x.p.units || 0) > 0).sort((x, y) => y.p.units * y.share - x.p.units * x.share);
    const tools = `<div class="seg" role="group" aria-label="Stage"><button type="button" class="btn small${gStage === 'all' ? ' on' : ''}" data-ws-stage="all" aria-pressed="${gStage === 'all'}">All</button>${STAGES.map(([k, l]) => `<button type="button" class="btn small${gStage === k ? ' on' : ''}" data-ws-stage="${k}" aria-pressed="${gStage === k}">${esc(l.replace(' or under construction', ' / building'))}</button>`).join('')}</div>`;
    const fileRow = x => ({ attrs: { 'data-ws-pick': x.p.key, 'data-ws-as': 'site', title: `Check ${x.p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}</span><span class="pnl-r-year">${n0(x.p.units * x.share)} units</span></div><small class="pnl-r-line">${esc(STG[x.st] || '')} · ${esc(Ph && Ph.PHASE_BY_KEY[x.p.phase] ? Ph.PHASE_BY_KEY[x.p.phase].label : x.p.phase)} · ${esc(x.p.municipality)}${x.share < 0.99 ? ` · ${Math.round(x.share * 100)}% in this area` : ''}</small>` });
    // Estimated counts in this area (at the chosen stage): how much of the pipeline is not stated on a file.
    const es = Ly && Ly.ofDev ? estimateRows(items.filter(({ p }) => gStage === 'all' || stageOf(Ly.ofDev(p)) === gStage), q => Ly.ofDev(q)) : null;
    const pipeU = stage ? (gStage === 'all' ? stage.total : (stage.rows.find(x => x.key === gStage) || {}).units || 0) : 0;
    const estRows = es && es.files.length ? [
      { kv: true, html: `<span><strong>${n0(es.units)}</strong> of ${n0(pipeU)} dwellings${pipeU > 0 ? ` (${Math.round(es.units / pipeU * 100)}%)` : ''} are estimated, in ${fmtNum(es.files.length)} ${es.files.length === 1 ? 'file' : 'files'} with no unit count stated: ${Object.entries(es.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${n0(v)} ${esc(EST_KINDS[k])}`).join(', ')}. ${es.files.some(x => Object.keys(x.kinds).length > 1) ? ' A file with more than one kind of estimate is split between them in proportion to their units.' : ''} Confirm these counts with the municipality.</span>` },
      ...es.files.map(x => ({ attrs: { 'data-ws-pick': x.p.key, 'data-ws-as': 'site', title: `Check ${x.p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}</span><span class="pnl-r-year">${n0(x.est)} est.</span></div><small class="pnl-r-line">${Object.keys(x.kinds).length > 1 ? `${esc(Object.entries(x.kinds).map(([k, v]) => `${n0(v)} ${EST_KINDS[k]}`).join(' + '))} (split in proportion)` : esc(EST_KINDS[Object.keys(x.kinds)[0]] || '')} · ${esc(STG[stageOf(Ly.ofDev(x.p))] || '')} · ${esc(x.p.municipality)}${x.share < 0.99 ? ` · ${Math.round(x.share * 100)}% in this area` : ''}</small>` })),
    ] : [];
    const empRows = emp.planned >= 1 ? [
      { kv: true, html: `<div class="pnl-kv"><span>Floor area planned</span><span>${n0(emp.planned)} m² · ≈${p0(emp.jobs)} jobs</span></div>` },
      { kv: true, html: `<div class="pnl-kv"><span>Permitted</span><span>${n0(emp.permitted)} m²</span></div>` },
      { kv: true, html: `<div class="pnl-kv"><span>Completed</span><span>${n0(emp.completed)} m²</span></div>` },
      { kv: true, html: `<div class="pnl-kv"><span>Left to build</span><span>${n0(emp.left)} m²</span></div>` },
    ] : [];
    // The area on the small map: its outline (a plan or precinct), its developments.
    // The map's plan filter takes secondary plans only: at a precinct or sub-area, its plan.
    const spIds = new Set(((App().state.areas || {}).secondaryPlans || []).map(x => x.id));
    const spId = (() => { for (let x = n; x; x = x.parent ? r.nodes.get(x.parent) : null) if (x.areaId && spIds.has(x.areaId)) return x.areaId; return null; })();
    const A = App().state.areas, ring = n.areaId && A ? [...(A.secondaryPlans || []), ...(A.precincts || [])].find(x => x.id === n.areaId) : null;
    // (an area: the map zooms to its outline, with a margin)
    let bb = null;
    if (ring && ring.rings) { bb = [1e9, 1e9, -1e9, -1e9]; for (const rr of ring.rings) for (const [x, y] of rr) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); } const px = (bb[2] - bb[0]) * 0.35 + 0.004, py = (bb[3] - bb[1]) * 0.35 + 0.003; bb = [bb[0] - px, bb[1] - py, bb[2] + px, bb[3] + py]; }
    const f = frame(360, 300, bb), devPts = [...dm.keys()];
    const allAreas = A ? [...(A.secondaryPlans || []), ...(A.precincts || [])] : [];
    const subRings = n.children.map(c => (c.areaId ? allAreas.find(x => x.id === c.areaId) : null)).filter(x => x && x.rings);
    const mapSvg = f ? f.svg(`${ring && ring.rings ? `<path d="${f.path(ring.rings)}" class="hm-area"/>` : ''}${subRings.map(x => `<path d="${f.path(x.rings)}" class="hm-sub"><title>${esc(x.name)}</title></path>`).join('')}${devPts.filter(p => p.lat != null && (p.units || 0) >= (atPeel ? 50 : 1)).map(p => { const [x, y] = f.pt(p.lng, p.lat); return `<circle cx="${x}" cy="${y}" r="${Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1)}" class="hm-dev"/>`; }).join('')}`, `${n.name}: its developments${ring ? ' and its outline' : ''}`) : '';
    const answer = atPeel
      ? `${pl.answer}${f2031 ? ` About <strong>${f2031.v}</strong> units are expected by 2031 (${f2031.ctx}).` : ''}`
      : `<strong>${esc(n.name)}</strong> ${trail[1] && trail[1] !== n ? ` (${esc(trail[1].name)})` : ''} holds <strong>${n0(m.planned)}</strong> planned units, ${p0(m.people)} people${m.jobs >= 0.5 ? ` and ${p0(m.jobs)} jobs` : ''} at build-out; ${n0(anb)} approved, not yet built, ${n0(m.left)} left to build.`;
    return { id: 'growth', eyebrow: `${esc(label('growth'))} · ${crumbs}`, name: atPeel ? 'How much is coming, where, and how fast?' : n.name, status: atPeel ? null : { tone: 'stage', text: kind(n) }, identity: atPeel ? esc(`${App().state.muni || 'Peel'} · ${fmtNum(plans.length)} plans with planned units`) : esc(`${fmtNum(dm.size)} developments${trail.length > 2 ? ` · in ${trail[trail.length - 2].name}` : ''}`), scen: scen(), answer,
      figures: [
        { v: n0(m.planned), u: 'units', label: 'planned', ctx: `${n0(m.left)} left to build` },
        { v: n0(anb), u: 'units', label: 'approved, not yet built', ctx: 'past their first planning approval' },
        { v: p0(m.people), u: 'people', label: 'at build-out', ctx: 'Peel design criteria' },
        { v: p0(emp.jobs >= 0.5 ? emp.jobs : m.jobs), u: 'jobs', label: 'employment', ctx: emp.planned >= 1 ? `${n0(emp.planned)} m² of floor area` : 'no employment floor area stated' },
      ],
      chart: stage ? stageChartHTML(stage, census) : pl.chart,
      lists: [
        kids.length ? { title: atPeel ? 'By municipality' : n.kind === 'municipality' ? 'Plans (secondary plans, character areas) and the rest' : 'Precincts and sub-areas', rows: kids.map(kidRow), total: kids.length, see: kids.length > 5 ? { 'data-ws-drillall': n.id } : null, all: gAll } : null,
        atPeel ? { title: 'Plans with the most planned units', rows: plans.map(kidRow), total: plans.length, see: { 'data-ws-go': 'growth', 'data-ws-fulltable': 'growth:areas' } } : null,
        { title: gStage === 'all' ? `Files in ${n.name}` : `${STG[gStage]}: files in ${n.name}`, tools, rows: files.length ? files.map(fileRow) : [{ kv: true, html: `<span class="muted">No files ${gStage === 'all' ? 'with planned units' : `at ${esc((STG[gStage] || '').toLowerCase())}`} in ${esc(n.name)}.</span>` }], total: files.length, see: spId ? { 'data-ws-go': 'growth', 'data-ws-area': spId } : { 'data-ws-go': 'growth' } },
        estRows.length ? { title: gStage === 'all' ? 'Estimated counts: files to confirm' : `${STG[gStage]}: estimated counts`, rows: estRows, total: estRows.length, seeN: es.files.length, see: estRows.length > 5 ? { 'data-ws-estall': '1' } : null, all: gEst } : null,
        empRows.length ? { title: 'Employment', rows: empRows, total: empRows.length } : null,
        ...(atPeel ? (pl.lists || []).filter(l => /municipality/i.test(l.title)) : []),
      ],
      map: { svg: mapSvg, attrs: spId ? { 'data-ws-go': 'growth', 'data-ws-area': spId } : { 'data-ws-go': 'growth' }, label: `Show ${n.name} on the map`, caption: ring ? `<span class="hm-key hm-key-area"></span> ${esc(n.name)} <span class="hm-key hm-key-dev"></span> its developments (sized by units)` : '<span class="hm-key hm-key-dev"></span> developments of 50+ units (sized by units) · municipal outlines' },
      method: `${pl.method} Drill-down: Growth › Areas' plan tree (Peel, municipality, secondary plan or character area, precinct or sub-area, then "not in a plan" and "elsewhere in the plan"); every level equals the sum of the levels under it, and a site split between plans counts its share. The stages follow a file: pre-application (pre-consultation, block or precinct plan), in review, approved (draft or site plan approved; split on whether its building permits are issued), built since the 2021 census. Estimated counts: a file's units left to build that are not stated on it (found online, a pre-consultation estimate, an estimate from the wording, or counted from building permits), the hatching on the stage bars. A file with more than one kind of estimate has its estimate split between the kinds in proportion to their units. Employment: the floor area the applications state and the jobs it holds at Peel's floor space per job.${tm && atPeel ? ` ${tm.method}` : ''}`,
      sources: pl.sources,
      actions: [{ label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, primary: true }, { label: 'Show on the map', attrs: spId ? { 'data-ws-go': 'growth', 'data-ws-area': spId } : { 'data-ws-go': 'growth' } }, !atPeel ? { label: '↑ Up a level', attrs: { 'data-ws-drill': n.parent || 'peel' } } : null] };
  }
  let gAll = false, gEst = false;
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall]'); if (!t || !document.getElementById('home') || !document.getElementById('home').contains(t)) return;
    e.preventDefault(); e.stopPropagation();
    if (t.dataset.wsDrill) { gAt = t.dataset.wsDrill; gStage = 'all'; gAll = false; gEst = false; const h = document.getElementById('home'); if (h) h.scrollTop = 0; }
    else if (t.dataset.wsStage) gStage = gStage === t.dataset.wsStage ? 'all' : t.dataset.wsStage;
    else if (t.dataset.wsDrillall) gAll = !gAll;
    else if (t.dataset.wsEstall) gEst = !gEst;
    if (W() && W().renderPage) W().renderPage(true);
  }, true);
  // ---- Projects ------------------------------------------------------------------------------------
  function projects() {
    const t = specOf('dca:timing', areaScope); if (!t) return loading('projects', 'Loading the DC program…');
    const pr = specOf('dca:projects', areaScope), ea = specOf('dca:eas', areaScope);
    return { id: 'projects', eyebrow: eyebrow('projects'), name: 'Is the capital program arriving in time for growth?', status: t.head.status, identity: t.head.identity, scen: scen(), answer: t.answer,
      figures: t.figures, chart: t.chart,
      lists: [
        ...(t.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('projects', r)) })).slice(0, 1),
        pr && pr.lists && pr.lists[0] ? { ...pr.lists[0], title: 'Region capital projects being built', rows: pr.lists[0].rows.map(r => toMap('projects', r)) } : null,
        ea && ea.lists && ea.lists[0] ? { ...ea.lists[0], title: 'EAs: milestones and comment periods', rows: ea.lists[0].rows.map(r => toMap('projects', r)) } : null,
      ],
      map: { svg: worksMap(), attrs: { 'data-ws-go': 'projects' }, label: 'Open Projects on the map', caption: '2026 DC works (draft): <span class="hm-key hm-dc-wastewater"></span> wastewater <span class="hm-key hm-dc-water"></span> water' },
      method: t.method, sources: t.sources,
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'projects' }, primary: true }, { label: 'Full table', attrs: { 'data-ws-go': 'projects', 'data-ws-fulltable': 'dca:timing' } }] };
  }

  // ---- This week -----------------------------------------------------------------------------------
  function week() {
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null; if (!a) return loading('week', 'Loading the changes…');
    const ch = (App().state.snapshot && App().state.snapshot.changes) || {}, ce = root.PeelCapitalEA ? root.PeelCapitalEA.attention() : [];
    const byKey = new Map(App().state.projects.map(p => [p.key, p]));
    const moved = (ch.moved || []), added = (ch.added || []).filter(x => x.phase !== 'completed');
    // Does it matter: a change on a development whose plant is over or tight at build-out.
    const rows = Cap() && Cap().collect ? Cap().collect() || [] : [], hot = new Set(rows.filter(r => r.kind === 'plant' && r.pctBo >= 90).map(r => r.id.replace(/^plant:/, '')));
    const plantOf = k => { const p = byKey.get(k); return p && MM() && MM().plantOfDev ? MM().plantOfDev(p) : null; };
    const flag = k => { const pl = plantOf(k); return pl && hot.has(pl) ? ` <span class="t-tight">· drains to ${esc((root.PeelSvcData && root.PeelSvcData.PLANT_SHORT[pl]) || pl)} (tight)</span>` : ''; };
    const Ph = P(), lab = k => (Ph && Ph.PHASE_BY_KEY[k] ? Ph.PHASE_BY_KEY[k].label : k);
    const devRow = (k, html) => ({ attrs: { 'data-ws-pick': k, 'data-ws-as': 'site' }, html });
    const W0 = (a.lists.find(l => l.title === 'This week') || { rows: [] }).rows;
    const pts = [...moved, ...added].map(x => byKey.get(x.key)).filter(Boolean);
    return { id: 'week', eyebrow: eyebrow('week'), name: 'What changed since the last update?', status: W0.length ? { tone: 'stage', text: `${fmtNum(W0.length)} changes` } : null, identity: a.head.identity,
      answer: W0.length ? `<strong>${fmtNum(W0.length)}</strong> change${W0.length === 1 ? '' : 's'} since the last data update: ${[moved.length && `${fmtNum(moved.length)} file${moved.length === 1 ? '' : 's'} moved stage`, added.length && `${fmtNum(added.length)} new file${added.length === 1 ? '' : 's'}`, ce.length && `${fmtNum(ce.length)} capital or EA date${ce.length === 1 ? '' : 's'}`].filter(Boolean).join(', ')}.` : 'Nothing changed since the last data update.',
      figures: [
        { v: fmtNum(moved.length), u: 'files', label: 'moved stage', ctx: '' },
        { v: fmtNum(added.length), u: 'files', label: 'new', ctx: '' },
        { v: fmtNum(ce.length), u: '', label: 'capital and EA dates', ctx: 'comment periods, dates moved', tone: ce.length ? 'tight' : null },
        { v: fmtNum([...moved, ...added].filter(x => { const pl = plantOf(x.key); return pl && hot.has(pl); }).length), u: 'files', label: 'on a tight plant', ctx: 'drain to a plant past its 90% trigger' },
      ],
      lists: [
        { title: 'Moved stage', rows: moved.map(m => devRow(m.key, `<div class="pnl-r-top"><span class="pnl-r-name">${esc(m.title)}</span><span class="pnl-r-year">${esc(lab(m.from))} → ${esc(lab(m.to))}</span></div>${flag(m.key) ? `<small class="pnl-r-line">${flag(m.key)}</small>` : ''}`)), total: moved.length },
        { title: 'New files', rows: added.map(m => devRow(m.key, `<div class="pnl-r-top"><span class="pnl-r-name">${esc(m.title)}</span><span class="pnl-r-year">${esc(lab(m.phase))}</span></div><small class="pnl-r-line">${esc(m.municipality || '')}${flag(m.key)}</small>`)), total: added.length },
        { title: 'Capital and EA dates', rows: ce.map(it => ({ attrs: { 'data-ws-go': 'week', 'data-ws-ce': it.ce }, html: `<small class="pnl-r-line">${esc(it.text)}</small>` })), total: ce.length },
      ],
      map: { svg: devsMap(((App() && App().state.filtered) || []), pts), attrs: { 'data-ws-go': 'week' }, label: 'Open This week on the map', caption: '<span class="hm-key hm-key-hl"></span> changed this week <span class="hm-key hm-key-dev"></span> developments of 50+ units' },
      method: 'Changes between the last two data updates: files whose stage moved, files listed for the first time (not those already completed), Region capital projects and EAs with a review period closing or a DC-matched date moved later. "On a tight plant": the file drains to a wastewater plant past its 90% trigger at build-out.',
      sources: 'The municipal application records (each update); Region of Peel capital project and EA listings.',
      actions: [{ label: 'Watch list', attrs: { 'data-ws-watch': '' }, primary: true }, { label: 'Open the map', attrs: { 'data-ws-go': 'week' } }] };
  }

  // ---- Review an FSR, with a site -------------------------------------------------------------------
  function fsr() {
    const p = devNow(); if (!p) return find('fsr');
    const s = specOf('svc:network', `dev:${p.key}`); if (!s) return loading('fsr', `Loading ${p.title}…`);
    const F = root.PeelFsrCheck, WD = { app: ['room', 'Compared here'], part: ['tight', 'Facilities only'], eye: ['over', 'By an engineer'] };
    return { id: 'fsr', eyebrow: `${esc(label('fsr'))} · <span class="pnl-steps-i">✓ Find › <b>Result</b> › Output: notes for the review</span>`, name: p.title, status: s.head.status, identity: s.head.identity, scen: scen(), answer: s.answer,
      figures: s.figures,
      mid: '<section class="page-fsr" data-psec="fsr"><h3>FSR cross-check: the consultant’s figures vs this app’s</h3><div class="fsr-box" data-pnl-fsrbox></div></section>',
      lists: [
        { title: 'What the FSR should cover', rows: COVERAGE.map(([t, k, d]) => ({ kv: true, html: `<div class="pnl-kv"><span>${esc(t)}<small class="muted"> · ${esc(d)}</small></span><span class="t-${WD[k][0]}">${WD[k][1]}</span></div>` })), total: COVERAGE.length },
        ...(s.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('fsr', r)) })),
      ],
      map: { svg: siteMap(p), attrs: { 'data-ws-go': 'fsr' }, label: `Open ${p.title} on the map`, caption: '<span class="hm-key hm-key-site"></span> the site · sewers · 2026 DC works nearby (dashed)' },
      folds: s.folds, method: `${s.method || ''} What the FSR should cover: Region of Peel, Functional Servicing Report Requirements (November 2009); confirm the current version with the Region.`, sources: s.sources,
      onMount: host => { if (typeof s.onMount === 'function') try { s.onMount(host); } catch (e) { /* the async parts */ } const b = host.querySelector('[data-pnl-fsrbox]'); if (b && F && F.mount) F.mount(b, p); },
      actions: [{ label: 'Copy the comparison', attrs: { 'data-ws-fsrcopy': '' }, primary: true }, { label: 'Print / PDF', attrs: { 'data-ws-fsrprint': '' } }, { label: 'Check the site', attrs: { 'data-ws-page': 'site' } }, { label: 'Another site', attrs: { 'data-ws-unpick': 'fsr' } }] };
  }

  // ---- Old pipes ------------------------------------------------------------------------------------
  function pipes() {
    const Wk = W(); const list = Wk && Wk.oldList ? Wk.oldList() : null;
    if (!list) { const S = MM() && MM().SEW, SC = root.PeelSewerCap; if (S && !S.data && SC && SC.loadSewers) SC.loadSewers().then(() => Wk && Wk.renderPage && Wk.renderPage()); return loading('pipes', 'Loading the Region’s sanitary sewer records…'); }
    const s = Wk.pipesSpec(), runs = Wk.pipeRuns(list, MM().SEW.data), g = pipeGrid(runs);
    const km = runs.reduce((t, r) => t + (r.lengthM || 0), 0) / 1000;
    const cell = (l, c) => { const x = g[l - 1][c - 1]; const sev = l + c; return `<td class="pg-c pg-s${sev}"><b>${fmtNum(x.n)}</b><small>${fmt1(x.km)} km</small></td>`; };
    const grid = `<div class="pg-wrap"><table class="pg" aria-label="Old pipe runs by likelihood and consequence"><thead><tr><th scope="col">Likelihood ↓ · Consequence →</th>${[1, 2, 3].map(c => `<th scope="col">${CONS[c]}</th>`).join('')}</tr></thead><tbody>${[3, 2, 1].map(l => `<tr><th scope="row">${LIKE[l]}</th>${[1, 2, 3].map(c => cell(l, c)).join('')}</tr>`).join('')}</tbody></table></div>`;
    const byPlant = new Map(); for (const r of runs) { const k = r.plant || 'other'; const x = byPlant.get(k) || { n: 0, km: 0, u: 0 }; x.n++; x.km += (r.lengthM || 0) / 1000; x.u = Math.max(x.u, r.units); byPlant.set(k, x); }
    const SD = root.PeelSvcData;
    const worst = runs.filter(r => likeOf(r) === 3 && consOf(r) === 3).length;
    return { id: 'pipes', eyebrow: eyebrow('pipes'), name: 'Which ageing sewers carry the most growth?', status: s.head.status, identity: s.head.identity, scen: scen(), answer: s.answer,
      figures: [s.figures[0], { v: fmt1(km), u: 'km', label: 'length on the list', ctx: `${fmtNum(runs.length)} runs` }, { v: fmtNum(worst), u: 'runs', label: 'top-right of the grid', ctx: `${LIKE[3]} (or older + moderate risk) and ${CONS[3]}`, tone: worst ? 'over' : 'room' }, s.figures[2]],
      mid: `<section class="page-grid" data-psec="grid"><h3>Likelihood × consequence</h3>${grid}<p class="small muted">Likelihood: install age (a moderate risk rating one band up). Consequence: planned units the run carries at build-out. Condition grades from inspection are not in the open data.</p></section>`,
      lists: [
        { ...s.lists[0], rows: s.lists[0].rows.map(r => toMap('pipes', r)), see: { 'data-ws-go': 'pipes' } },
        { title: 'By plant', rows: [...byPlant.entries()].sort((a, b) => b[1].km - a[1].km).map(([k, x]) => ({ kv: true, html: `<div class="pnl-kv"><span>${esc((SD && SD.PLANT_SHORT && SD.PLANT_SHORT[k]) || k)}</span><span>${fmtNum(x.n)} runs · ${fmt1(x.km)} km</span></div>` })), total: byPlant.size },
      ],
      map: { svg: pipesMap(list), attrs: { 'data-ws-go': 'pipes' }, label: 'Open Old pipes on the map', caption: '<span class="hm-key hm-key-pipe"></span> old pipes on the list (heavier: moderate risk)' },
      method: `${s.method} The grid counts runs (one main: segments end to end with the same size, year, material and risk) by likelihood (age 50–64 / 65–79 / 80+ years; a moderate risk rating moves a run one band up) and consequence (planned units carried: 100–1,000 / 1,000–10,000 / 10,000+).`,
      sources: s.sources,
      actions: [{ label: 'Export the list (CSV)', attrs: { 'data-ws-pipescsv': '' }, primary: true }, { label: 'Open the map', attrs: { 'data-ws-go': 'pipes' } }] };
  }

  // ---- Study area: a small interactive map on the page ------------------------------------------------
  function study() {
    const AS = root.PeelAreaSelect, sel = AS ? [...AS.selection.values()] : [];
    const has = sel.length > 0 || (AS && AS.selAreas && AS.selAreas.length);
    return { id: 'study', eyebrow: eyebrow('study'), name: 'What does this area add, and what servicing does it lean on?', scen: scen(),
      answer: has ? `The drawn area holds <strong>${fmtNum(sel.length)}</strong> development${sel.length === 1 ? '' : 's'}. Its growth and the servicing it needs are below.` : 'Draw an area on the map: press <strong>Draw an area</strong>, then drag around the developments.',
      top: `<section class="page-livemap" data-psec="livemap"><div class="page-map-slot" id="page-map-slot"></div><div class="pnl-acts"><button type="button" class="btn small pnl-primary" data-ws-draw>${has ? 'Add an area' : 'Draw an area'}</button>${has ? '<button type="button" class="btn small" data-ws-clear>Clear</button>' : ''}</div></section>`,
      mid: has && AS ? `<section class="page-sel" data-psec="selection">${AS.selectionSummaryHTML(sel)}</section>` : '',
      method: 'The developments shown on the map inside the drawn area(s): units by type and stage, people and jobs at Peel design criteria, and the water and wastewater demand they add (the same estimate as each development’s panel).',
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'study' }, primary: !has }, has ? { label: 'Area report (PDF)', attrs: { 'data-area-report': 'sel' }, primary: true } : null] };
  }

  const BUILD = { home, tight, site, growth, projects, week, fsr, pipes, study };
  const build = id => (BUILD[id] || home)();
  Object.assign(api, { build, capacityMap, devsMap, worksMap, pipesMap, siteMap, frame });
  root.PeelWsPages = api;
})(typeof window !== 'undefined' ? window : globalThis);
