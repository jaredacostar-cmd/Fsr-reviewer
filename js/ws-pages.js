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
    return `<section class="pnl-list page-list" data-psec="list"><div class="pnl-list-h"><h3>${esc(l.title)}</h3>${l.tools || ''}${l.see && l.total > Math.min(5, l.rows.length) ? `<button type="button" class="btn small link"${attrs(l.see)}>See all (${fmtNum(l.total)}) →</button>` : ''}</div>
      <ul>${l.rows.slice(0, 5).map(r => `<li class="pnl-row${r.kv ? ' kv' : ''}${r.tone ? ` t-${esc(r.tone)}` : ''}"${r.attrs ? `${attrs(r.attrs)} tabindex="0" role="button"` : ''}>${r.html}</li>`).join('')}</ul></section>`;
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
    out.push(`<footer class="page-foot" data-psec="footer">${acts.length ? `<div class="pnl-acts">${acts.map(a => `<button type="button" class="btn small${a.primary ? ' pnl-primary' : ' pnl-sec'}"${attrs(a.attrs)}${a.title ? ` title="${esc(a.title)}"` : ''}>${esc(a.label)}</button>`).join('')}</div>` : ''}<p class="pnl-note small">${note || ''}</p></footer>`);
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

  const api = { pageHTML, sectionsOf, listHTML, reserveRows, pipeGrid, likeOf, consOf, LIKE, CONS, approvedNotBuilt, COVERAGE };
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
  function frame(Wd = 360, H = 300) {
    const sv = App() && App().state.servicing; if (!sv) return null;
    const base = (sv.drainage || []).filter(d => d.rings && !(d.served != null && d.served < 0.5));
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    for (const d of base) for (const r of d.rings) for (const [x, y] of r) { mnx = Math.min(mnx, x); mny = Math.min(mny, y); mxx = Math.max(mxx, x); mxy = Math.max(mxy, y); }
    if (mnx > mxx) return null;
    const kx = Math.cos((mny + mxy) / 2 * Math.PI / 180), s = Math.min((Wd - 10) / ((mxx - mnx) * kx), (H - 10) / (mxy - mny));
    const X = x => (5 + (x - mnx) * kx * s).toFixed(1), Y = y => (5 + (mxy - y) * s).toFixed(1);
    const path = rings => rings.map(r => r.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)},${Y(y)}`).join('') + 'Z').join('');
    const line = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)},${Y(y)}`).join('');
    return { sv, base, X, Y, path, line, Wd, H, svg: (inner, aria) => `<svg viewBox="0 0 ${Wd} ${H}" class="home-map-svg" role="img" aria-label="${esc(aria)}">${base.map(d => `<path d="${path(d.rings)}" class="hm-base"/>`).join('')}${inner}</svg>` };
  }
  // Servicing capacity: catchments, zones and plants over (red) or past the 90% trigger (amber).
  function capacityMap(rows) {
    const f = frame(); if (!f) return '';
    const tone = r => (r.pctBo >= 100 ? 'over' : r.pctBo >= 90 ? 'tight' : null), out = [];
    const byId = new Map((f.sv.psAreas || []).map(d => [d.id, d])), zones = f.sv.zones || [];
    for (const r of rows) {
      const t = tone(r); if (!t) continue;
      let g = null;
      if (r.kind === 'ps') g = byId.get(r.id.slice(3));
      else if (r.kind === 'pump' || r.kind === 'storage') { const m = String(r.name).match(/zone\s*(\w+)/i); g = m ? zones.find(z => String(z.zone) === m[1]) : null; }
      if (g && g.rings) out.push(`<path d="${f.path(g.rings)}" class="hm-${t}"><title>${esc(r.name)}: ${Math.round(r.pctBo)}% at build-out</title></path>`);
    }
    for (const pl of (f.sv.meta && f.sv.meta.plants) || []) {
      if (!pl.lnglat) continue;
      const r = rows.find(x => x.id === `plant:${pl.name}`), t = r ? tone(r) : null;
      out.push(`<rect x="${(+f.X(pl.lnglat[0]) - 5).toFixed(1)}" y="${(+f.Y(pl.lnglat[1]) - 5).toFixed(1)}" width="10" height="10" class="hm-plant${t ? ` hm-${t}` : ''}"><title>${esc(r ? r.name : pl.name)}${r ? `: ${Math.round(r.pctBo)}% at build-out` : ''}</title></rect>`);
    }
    return f.svg(out.join(''), 'Peel’s wastewater blocks, with the facilities over capacity or past the 90% trigger at build-out highlighted');
  }
  // Developments as dots sized by units (Growth, This week), optional highlight set.
  function devsMap(set, hl) {
    const f = frame(); if (!f) return '';
    const out = [];
    for (const p of set) if (p.lat != null && (p.units || 0) >= 50) out.push(`<circle cx="${f.X(p.lng)}" cy="${f.Y(p.lat)}" r="${Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1)}" class="hm-dev"/>`);
    for (const p of hl || []) if (p.lat != null) out.push(`<circle cx="${f.X(p.lng)}" cy="${f.Y(p.lat)}" r="4.5" class="hm-hl"><title>${esc(p.title)}</title></circle>`);
    return f.svg(out.join(''), 'Peel’s wastewater blocks with the developments on the map');
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
    try { return r.sketchSVG({ center: [p.lng, p.lat], halfM: 1500, points: near, site: [p.lng, p.lat], W: 360, H: 260 }).replace(/<div class="meta">[\s\S]*$/, '').replace('class="sk"', 'class="sk home-map-svg"'); } catch (e) { return ''; }
  }

  // ---- Home --------------------------------------------------------------------------------------
  function home() {
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null; if (!a) return loading('home', 'Loading the briefing…');
    const rows = Cap() && Cap().collect ? Cap().collect() || [] : [];
    const needs = a.lists.find(l => l.title === 'Needs attention'), week = a.lists.find(l => l.title === 'This week');
    // Home's rows open the matching workspace page.
    const toPage = (ws, l) => (l ? { ...l, rows: l.rows.map(r => ({ ...r, attrs: { 'data-ws-page': ws, title: (r.attrs || {}).title } })), see: { 'data-ws-page': ws } } : null);
    return { id: 'home', eyebrow: esc(a.head && a.head.identity ? a.head.identity : 'Peel'), name: `${(App() && App().state.muni) || 'Peel'}: what needs attention`, status: a.head && a.head.status, scen: scen(), answer: a.answer, caveats: caveats(),
      figures: a.figures.map(f => ({ ...f, attrs: { 'data-ws-page': 'growth', title: 'Growth in an area' } })),
      lists: [toPage('tight', needs), toPage('week', week)],
      map: { svg: capacityMap(rows), attrs: { 'data-ws-page': 'tight' }, label: 'Open Servicing capacity', caption: '<span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out (catchments, zones and plants)' },
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
      map: { svg: devsMap(((App() && App().state.filtered) || []), recent), attrs: { 'data-ws-go': id }, label: 'Pick a development on the map', caption: 'Recently active files highlighted; click to pick one on the map' },
      actions: [{ label: 'Pick on the map', attrs: { 'data-ws-go': id }, primary: true }] };
  }
  // ---- Check a site, with a site -----------------------------------------------------------------------
  function site() {
    const p = devNow(); if (!p) return find('site');
    const s = specOf('overview:', `dev:${p.key}`); if (!s) return loading('site', `Loading ${p.title}…`);
    return { id: 'site', eyebrow: `${esc(label('site'))} · <span class="pnl-steps-i">✓ Find › <b>Result</b> › Output: Servicing memo</span>`, name: p.title, status: s.head.status, identity: s.head.identity, scen: scen(), answer: s.answer,
      caveats: [], figures: s.figures, chart: s.chart,
      lists: (s.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('site', r)) })),
      map: { svg: siteMap(p), attrs: { 'data-ws-go': 'site' }, label: `Open ${p.title} on the map`, caption: 'The site (orange), nearby developments, sewers and the 2026 DC works (dashed)' },
      folds: s.folds, method: s.method, sources: s.sources, onMount: s.onMount,
      actions: [{ label: 'Servicing memo', attrs: { 'data-pnl-memo': '' }, primary: true }, { label: 'Review its FSR', attrs: { 'data-ws-page': 'fsr' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'site' } }, { label: 'Another site', attrs: { 'data-ws-unpick': 'site' } }] };
  }

  // ---- Growth in an area ---------------------------------------------------------------------------
  function growth() {
    const a = specOf('growth:areas', areaScope), pl = specOf('growth:pipeline', areaScope), tm = specOf('growth:timing', areaScope);
    if (!a || !pl) return loading('growth', 'Loading the pipeline…');
    const G = root.Growth, Ph = P(), set = (App() && App().state.filtered) || [];
    const anb = G && Ph ? approvedNotBuilt(set, q => G.pipelineTotals([q]).left, q => (Ph.PHASE_BY_KEY[q.phase] ? Ph.PHASE_BY_KEY[q.phase].rank : -1)) : null;
    const left = q => (Ph && Ph.unbuiltOf ? Ph.unbuiltOf(q) : (q.units || 0));
    const top = set.filter(q => left(q) > 0).sort((x, y) => left(y) - left(x)).slice(0, 5);
    const f2031 = tm && tm.figures ? tm.figures.find(f => /2031/.test(f.label)) : null;
    return { id: 'growth', eyebrow: eyebrow('growth'), name: 'How much is coming, where, and how fast?', identity: a.head.identity, scen: scen(), answer: `${pl.answer}${f2031 ? ` About <strong>${f2031.v}</strong> units are expected by 2031 (${f2031.ctx}).` : ''}`,
      figures: [
        pl.figures[0],
        anb ? { v: fmtNum(Math.round(anb.units)), u: 'units', label: 'approved, not yet built', ctx: `${fmtNum(anb.n)} files past their first planning approval` } : pl.figures[1],
        pl.figures[2],
        f2031 ? { v: f2031.v, u: 'units', label: 'expected by 2031', ctx: f2031.ctx } : pl.figures[3],
      ],
      chart: pl.chart,
      lists: [
        { ...(a.lists[0] || {}), see: { 'data-ws-go': 'growth' } },
        { title: 'Largest unbuilt', rows: top.map(q => ({ attrs: { 'data-ws-pick': q.key, 'data-ws-as': 'site', title: `Check ${q.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(q.title)}</span><span class="pnl-r-year">${fmtNum(Math.round(left(q)))} units</span></div><small class="pnl-r-line">${esc(q.municipality)} · ${esc(Ph && Ph.PHASE_BY_KEY[q.phase] ? Ph.PHASE_BY_KEY[q.phase].label : q.phase)}</small>` })), total: top.length },
        ...(pl.lists || []).filter(l => /municipality/i.test(l.title)),
      ],
      map: { svg: devsMap(set), attrs: { 'data-ws-go': 'growth' }, label: 'Open Growth in an area on the map', caption: 'Developments of 50+ units, sized by units' },
      method: `${pl.method} Approved, not yet built: units left to build in files that are draft or site plan approved, permit issued or under construction.${tm ? ` ${tm.method}` : ''}`,
      sources: pl.sources,
      actions: [{ label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, primary: true }, { label: 'Open the map', attrs: { 'data-ws-go': 'growth' } }] };
  }

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
      answer: W0.length ? `<strong>${fmtNum(W0.length)}</strong> change${W0.length === 1 ? '' : 's'} since the last data update: ${[moved.length && `${fmtNum(moved.length)} files moved stage`, added.length && `${fmtNum(added.length)} new files`, ce.length && `${fmtNum(ce.length)} capital or EA dates`].filter(Boolean).join(', ')}.` : 'Nothing changed since the last data update.',
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
      map: { svg: devsMap(((App() && App().state.filtered) || []), pts), attrs: { 'data-ws-go': 'week' }, label: 'Open This week on the map', caption: 'Changed files highlighted' },
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
      map: { svg: siteMap(p), attrs: { 'data-ws-go': 'fsr' }, label: `Open ${p.title} on the map`, caption: 'The site, sewers and DC works nearby' },
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
      map: { svg: pipesMap(list), attrs: { 'data-ws-go': 'pipes' }, label: 'Open Old pipes on the map', caption: 'The old pipes on the list (heavier: moderate risk)' },
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
