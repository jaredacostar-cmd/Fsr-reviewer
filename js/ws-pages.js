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
  // Home is the page host at an area (navigation phase 6, host below): under its header the map's five tabs
  // and the open tab's views, each area page (Servicing capacity, the Forecast, DC timing …) one of its views.
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmtNum = U.fmtNum || (n => Math.round(n).toLocaleString('en-CA'));
  const fmt1 = U.fmt1 || (n => (Math.round(n * 10) / 10).toFixed(1));

  // ---- Pure: the page --------------------------------------------------------------------------------
  // model: { id, eyebrow, name, status: { tone, text }, identity, calc, answer, caveats: [{ text, at }],
  //          figures: [{ v, u, label, ctx, tone }] (≤ 4), chart, lists: [{ title, rows: [{ html, attrs, tone }],
  //          total, see: attrs }], map: { svg, caption, attrs, html, after (under the map: a treemap) }, folds: [{ title, html, open }],
  //          method, sources, actions: [{ label, attrs, primary }], note, chip, scen, tabs (under the header: a
  //          page host's tab strip and views row, tabsHTML), top (before the answer: where you are, the steps, a
  //          live map, the Peel-wide note), lead (a fold under the answer, before the figures: { id, title, html,
  //          open }), mid (after the figures: a form, a grid, a summary), draw (false: no Draw an area in the header) }
  // The lists and folds sit beside the map (held in view); Method and Sources below. Sections with nothing are left out.
  const attrs = a => Object.entries(a || {}).map(([k, v]) => (v === true ? ` ${k}` : v == null || v === false ? '' : ` ${k}="${esc(v)}"`)).join('');
  const TONE_WORD = { over: 'Over', tight: 'Tight', room: 'Room', stage: '' };
  // (a chip that opens its answer: a button with ▸, as on the panels)
  const chipHTML = s => (!s ? '' : s.attrs
    ? `<button type="button" class="pnl-chip pnl-chip-btn t-${esc(s.tone || 'stage')}"${attrs(s.attrs)}${s.expanded != null ? ` aria-expanded="${!!s.expanded}"` : ''}${s.title ? ` title="${esc(s.title)}"` : ''}>${esc(s.text || TONE_WORD[s.tone] || '')} <span class="aer-car" aria-hidden="true">${s.expanded ? '▾' : '▸'}</span></button>`
    : `<span class="pnl-chip t-${esc(s.tone || 'stage')}">${esc(s.text || TONE_WORD[s.tone] || '')}</span>`);
  function listHTML(l) {
    if (l && l.html) return l.html;
    if (!l || !l.rows || !l.rows.length) return '';
    return `<section class="pnl-list page-list" data-psec="list"><div class="pnl-list-h"><h3>${esc(l.title)}</h3>${l.tools || ''}${l.see && (l.all || l.total > Math.min(5, l.rows.length)) ? `<button type="button" class="btn small link"${attrs(l.see)}>${l.all ? 'Show fewer' : `See all (${fmtNum(l.seeN != null ? l.seeN : l.total)}) →`}</button>` : ''}</div>
      <ul>${l.rows.slice(0, l.all ? l.rows.length : 5).map(r => `<li class="pnl-row${r.kv ? ' kv' : ''}${r.tone ? ` t-${esc(r.tone)}` : ''}"${r.attrs ? `${attrs(r.attrs)} tabindex="0" role="button"` : ''}>${r.html}</li>`).join('')}</ul></section>`;
  }
  // The page host's strip (navigation phase 6, design §3.3: header · tab strip · chips · answer): the full map's
  // five tabs, in its order and words, then the open tab's views (its chips) in a row under it when it has two
  // or more. tabs: [{ key, label, info, busy, trail }]; on: the tab shown; chips: [{ sub, label }]; sub: the view.
  // A tab before its data (Servicing, Capital) is lit when picked and says it is loading. data-pg-* (never
  // data-at, which opens the full map, nor the map's chip attributes, which the map's own strip toggles).
  const TAB_INFO = { overview: 'tab-overview', growth: 'tab-growth', svc: 'tab-servicing', dca: 'tab-dca', records: 'tab-records' };
  function tabsHTML({ tabs = [], on, chips = [], sub } = {}) {
    const tab = t => `<button type="button" role="tab" class="page-sec page-tab${t.trail ? ' page-tab-trail' : ''}${t.key === on ? ' on' : ''}" data-pg-tab="${esc(t.key)}"${t.info ? ` data-info="${esc(t.info)}"` : ''} aria-selected="${t.key === on}"${t.busy ? ' aria-busy="true" title="Loading: it opens when its data lands"' : ''}>${esc(t.label)}${t.busy ? ' <small class="page-tab-wait">loading</small>' : ''}</button>`;
    const chip = c => `<button type="button" class="page-sec${c.sub === sub ? ' on' : ''}" data-pg-tab="${esc(on)}" data-pg-sub="${esc(c.sub)}" aria-pressed="${c.sub === sub}">${esc(c.label)}</button>`;
    return `<nav class="page-secs page-tabs" role="tablist" aria-label="Tabs" data-psec="tabs">${tabs.map(tab).join('')}</nav>${chips.length > 1 ? `<nav class="page-secs page-subsecs" aria-label="Views" data-psec="views">${chips.map(chip).join('')}</nav>` : ''}`;
  }
  // One figure card (a page's figures, Home's groups).
  // (its "?" opens how the figure is worked out, js/how.js; m: the page, or Home's group)
  function figHTML(f, gl = x => x, m = null, i = 0) {
    return `<div class="pnl-fig${f.tone ? ` t-${esc(f.tone)}` : ''}"${f.attrs ? `${attrs(f.attrs)} role="button" tabindex="0"` : ''}><b>${f.v}</b>${f.u ? `<span class="pnl-u">${esc(f.u)}</span>` : ''}<span class="pnl-l">${gl(esc(f.label))}</span>${f.ctx ? `<small>${gl(f.ctx)}</small>` : ''}${m && root.PeelHow ? root.PeelHow.button(f, m, i) : ''}</div>`;
  }
  function pageHTML(m, note) {
    // (a zero is never coloured; n/a is never a figure)
    const figs = (m.figures || []).filter(f => f && !/^(n\/a|–|-)$/i.test(String(f.v))).slice(0, 4).map(f => (String(f.v) === '0' && f.tone ? { ...f, tone: null } : f));
    const out = [];
    if (m.views) out.push(m.views);
    // (the scenario chip sits in the title row, beside the status: one row less above the answer)
    // (a site's page: its header's flags, ☆ Watch and tools, as on the map: js/panel.js toolsHTML)
    // One search on every page, Home included, with Draw an area beside it (navigation design §3.3):
    // the one box is moved into the slot by js/workspaces.js placeSearch. (Study area draws on its own map.)
    const find = `<div class="page-find" data-psec="find"><div class="page-search" id="page-search"></div>${m.draw === false ? '' : '<button type="button" class="btn small page-draw" data-ws-go="study" title="Open the map with the Select tool on: drag round the developments">Draw an area</button>'}</div>`;
    out.push(`<header class="home-h" data-psec="header"><p class="page-eyebrow small">${m.eyebrow || ''}</p><h1>${esc(m.name || '')}</h1>${chipHTML(m.status)}${m.badge || ''}${m.scen ? `<div class="pnl-scen" data-psec="scenario">${m.scen}</div>` : ''}${m.identity ? `<p class="small muted page-id">${m.identity}</p>` : ''}${m.extra || ''}${m.tools && root.PeelPanel && root.PeelPanel.toolsHTML ? root.PeelPanel.toolsHTML(m.tools, 'page') : ''}${find}</header>`);
    if (m.tabs) out.push(m.tabs);
    if (m.top) out.push(m.top);
    // Bundle 5: terms underlined in the answer and figures (js/glossary.js).
    const seen = new Set(), gl = h => (root.PeelGlossary && m.id !== 'glossary' ? root.PeelGlossary.mark(h, seen) : h);
    out.push(`<p class="home-answer" data-psec="answer">${gl(m.answer || '')}</p>`);
    for (const c of m.caveats || []) out.push(`<p class="home-caveat small" role="note" data-psec="caveat">⚠ ${esc(c.text)}${c.at ? ` <button type="button" class="btn small link" data-ws-full data-at="${esc(c.at)}">Review →</button>` : ''}</p>`);
    // (a fold that leads the page, under the answer: the Forecast's By period, open or shut as the reader left it)
    if (m.lead && m.lead.html) out.push(`<details class="pnl-fold page-lead" data-psec="lead"${m.lead.open ? ' open' : ''}${m.lead.id ? ` id="${esc(m.lead.id)}"` : ''}><summary>${esc(m.lead.title)}</summary><div>${m.lead.html}</div></details>`);
    if (figs.length) out.push(`<div class="pnl-figs" data-psec="figures">${figs.map((f, i) => figHTML(f, gl, { key: `page:${m.id}`, files: root.PeelHow && root.PeelHow.filesFor(m.id), method: m.method, sources: m.sources }, i)).join('')}</div>`);
    // Home (step 6): the figures in groups (Growth, Servicing, Capital, Change), each with its page.
    // The groups share rows on a desk screen, each as wide as its figures (--n of 4 columns), so a
    // one- or two-figure group does not leave half a row empty.
    const grps = [];
    for (const g of m.groups || []) {
      const gf = (g.figures || []).filter(f => f && !/^(n\/a|–|-)$/i.test(String(f.v))).slice(0, 4);
      if (gf.length) grps.push(`<section class="home-grp" data-psec="group" style="--n:${gf.length}"><div class="home-grp-h"><h2>${esc(g.title)}</h2>${g.link ? `<button type="button" class="btn small link"${attrs(g.link.attrs)}>${esc(g.link.label)} →</button>` : ''}</div><div class="pnl-figs">${gf.map((f, i) => figHTML(f, gl, { key: `page:${m.id}:${g.title}`, files: root.PeelHow && root.PeelHow.filesFor(m.id) }, i)).join('')}</div></section>`);
    }
    if (grps.length) out.push(`<div class="home-grps">${grps.join('')}</div>`);
    if (m.chart) out.push(`<div class="pnl-chart page-chart" data-psec="chart">${m.chart}</div>`);
    if (m.mid) out.push(m.mid);
    const lists = (m.lists || []).filter(l => l && (l.html || (l.rows && l.rows.length)));
    const mapSec = m.map && (m.map.svg || m.map.html || m.map.attrs) ? `<section class="home-map" data-psec="map"><div class="pnl-list-h"><h3>${esc(m.map.title || 'Where')}</h3>${m.map.attrs ? `<button type="button" class="btn small link"${attrs(m.map.attrs)}>${esc(m.map.link || 'Open the map')} →</button>` : ''}</div>${m.map.html || `<button type="button" class="home-map-btn"${attrs(m.map.attrs)} aria-label="${esc(m.map.label || 'Open the map')}">${m.map.svg || '<span class="home-map-empty small muted">Open the map</span>'}</button>`}${m.map.caption ? `<p class="small muted">${m.map.caption}</p>` : ''}${m.map.svg && /hm-tiles|sk-tiles/.test(m.map.svg) ? '<p class="hm-credit small muted">Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors</p>' : ''}${m.map.after || ''}</section>` : '';
    // Every list and fold in the column beside the map, the map held in view as they scroll (no empty
    // space beside a tall map under a short first list); Method and Sources run full width below.
    const body = [...lists.map(l => listHTML(l)), ...(m.folds || []).filter(x => x && x.html).map(f => `<details class="pnl-fold" data-psec="fold"${f.open ? ' open' : ''}${f.id ? ` id="${esc(f.id)}"` : ''}><summary>${esc(f.title)}</summary><div>${f.html}</div></details>`)].join('');
    if (mapSec) out.push(`<div class="home-cols"><div class="home-col-main">${body}</div>${mapSec}</div>`);
    else if (body) out.push(body);
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
  // Growth in an area: the pipeline by stage, the commitment ladder's rungs in order (js/layers.js
  // LADDER, decided with the user Oct 23, 2026), then built since 2021. A development's units left to
  // build sit on the highest rung they have reached: a site servicing permit lifts the whole development,
  // a building permit the units it covers. Committed (the Peel rule) is Servicing permit and up.
  const STAGES = [
    ['early', 'Pre-application', 'pre-consultation, block or precinct plan: no formal file yet'],
    ['review', 'In review', 'zoning, official plan, draft plan or site plan in review'],
    ['zoning', 'Zoning approved', 'zoning approved (or under appeal), no draft or site plan approval yet'],
    ['plan', 'Plan approved', 'draft or site plan approved, no site servicing or building permit yet: approved, not committed'],
    ['servicing', 'Servicing permit', 'a water or wastewater site servicing permit filed or issued: commits the whole development'],
    ['building', 'Building permit', 'a building permit filed or issued: commits the units it covers'],
    ['construction', 'Under construction', 'a building permit, and its permits’ history says it is being built'],
    ['built', 'Built since 2021', 'completed since census day, not in the census yet'],
  ];
  const COMMITTED_STAGES = ['servicing', 'building', 'construction'];
  // rungsOf(p): js/layers.js rungsOf ({ rungs, built, existing, estimated, left }); nm: the units of
  // developments that haven't moved since 2020 (js/layers.js movedSince), per stage; existing: units
  // completed before the 2021 Census (in the census, so not a stage here) — the bars plus existing are
  // the headline total. An estimated count (the hatching) is spread over the stages its units are on.
  function stageRows(devs, rungsOf, movedOf = (root.PeelLayers && root.PeelLayers.movedSince) || (() => true)) {
    const zero = () => Object.fromEntries(STAGES.map(([k]) => [k, 0]));
    const u = zero(), est = zero(), nm = zero();
    let existing = 0, nmExisting = 0;
    for (const it of devs) {
      // (an area's developments come as { p, share }: a site split between plans counts its share)
      const p = it && it.p ? it.p : it, sh = it && it.p ? it.share : 1;
      const R = rungsOf(p); if (!R) continue;
      const parts = { ...R.rungs, built: R.built || 0 };
      const moved = movedOf(p);
      for (const k in u) { const v = (parts[k] || 0) * sh; u[k] += v; if (!moved) nm[k] += v; if (R.estimated > 0 && R.left > 0 && k !== 'built') est[k] += R.estimated * (parts[k] || 0) / R.left * sh; }
      existing += (R.existing || 0) * sh; if (!moved) nmExisting += (R.existing || 0) * sh;
    }
    const total = Object.values(u).reduce((a, b) => a + b, 0);
    const notMoved = Object.values(nm).reduce((a, b) => a + b, 0);
    const committed = COMMITTED_STAGES.reduce((t, k) => t + u[k], 0);
    return { rows: STAGES.map(([key, label, note]) => ({ key, label, note, units: u[key], est: est[key], nm: nm[key], pct: total > 0 ? u[key] / total * 100 : 0 })), total, existing, notMoved, nmExisting, committed };
  }
  // A development's stage on this chart: the rung holding most of its units left to build (the higher
  // on a tie); built since 2021 once none are left.
  function stageOf(R) {
    if (!R) return null;
    if (R.top) return R.top;
    return R.built > 0 || R.existing > 0 ? 'built' : null;
  }
  // Estimated counts (the hatching): a file whose units are not stated on it but found online, from a
  // pre-consultation, from the wording or from building permits (js/layers.js ESTIMATED). Each file's
  // estimate is what it has left to build (ofDev().estimated), its share in the area, split over the
  // kinds of estimate it holds. → { units, files: [{ p, share, est, kinds }], byKind }, largest first.
  const EST_KINDS = { online: 'found online', precon: 'pre-consultation estimate', estimate: 'estimate from the wording', permits: 'from building permits' };
  // Bundle 6: the file an estimated count is on, and a way to see it in the development's tree.
  function estFileHTML(p) {
    const FT = root.PeelFileTree, d = FT && FT.of(p), e = d && FT.estimateOf(d); if (!e) return '';
    return `<small class="tr-sum">the estimate is on <b>${esc(e.ref)}</b>${e.source ? ` (${esc(e.source)})` : ''} · <button type="button" class="btn small link" data-ws-pick="${esc(p.key)}" data-ws-as="site" data-ws-tree="1">show it in the tree →</button></small>`;
  }
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
      // (a development counted in two parts of the area is one row: its shares add up)
      const had = files.find(f => f.p === p);
      if (had) { had.share += sh; had.est += est; for (const k in kinds) had.kinds[k] = (had.kinds[k] || 0) + kinds[k]; units += est; continue; }
      units += est; files.push({ p, share: sh, est, kinds });
    }
    files.sort((a, b) => b.est - a.est);
    return { units, files, byKind };
  }
  // One bar per stage, labelled directly; the scale is the largest stage. census: dwellings on the
  // system (2021) for the context line.
  // The dormant developments a chart leaves out (st.dormant: { n, units } from dormantFor).
  function dormantNote(d) {
    return d && d.n ? ` Not counted: <strong>${fmtNum(Math.round(d.units))}</strong> homes in ${fmtNum(d.n)} dormant development${d.n === 1 ? '' : 's'} (no activity for 3+ years; 5 in review), included with the Find switch.` : '';
  }
  const STAGE_CLS = { early: 'ly-anticipated', review: 'ly-proposed', zoning: 'stg-zoning', plan: 'stg-approved', servicing: 'stg-servicing', building: 'stg-permitted', construction: 'stg-construction', built: 'stg-built' };
  function stageChartHTML(st, census) {
    const max = Math.max(1, ...st.rows.map(r => r.units)), cls = STAGE_CLS;
    return `<div class="stg" role="table" aria-label="The pipeline by stage, in the order a file moves">
      <p class="stg-h small pnl-chart-t"><strong>The pipeline by stage, in the order a file moves</strong> <span class="pnl-chart-u">(dwellings)</span></p>
      ${st.rows.map(r => `<div class="stg-row${st.on === r.key ? ' on' : ''}" role="row" title="${esc(r.label)}: ${esc(r.note)}"${st.click && r.units >= 0.5 ? ` data-ws-stage="${r.key}" tabindex="0"` : ''}><span class="stg-l" role="cell">${esc(r.label)}</span><span class="stg-track" role="cell"><i class="stg-fill ${cls[r.key]}" style="width:${(r.units / max * 100).toFixed(1)}%"></i>${r.est > 0 ? `<i class="stg-est" style="width:${(Math.min(r.est, r.units) / max * 100).toFixed(1)}%"></i>` : ''}${r.nm >= 0.5 ? `<i class="stg-nm" style="left:${(Math.max(0, r.units - r.nm) / max * 100).toFixed(1)}%;width:${(Math.min(r.nm, r.units) / max * 100).toFixed(1)}%" title="${fmtNum(Math.round(r.nm))} haven\u2019t moved since 2020"></i>` : ''}</span><b class="stg-v" role="cell">${fmtNum(Math.round(r.units))}</b><span class="stg-p muted" role="cell">${r.units > 0 && r.pct < 0.5 ? '&lt;1' : Math.round(r.pct)}%</span></div>`).join('')}
      <p class="stg-foot small muted">${fmtNum(Math.round(st.total))} dwellings in the pipeline${census > 0 ? ` would add about <strong>${Math.round(st.total / census * 100)}%</strong> to the ${fmtNum(Math.round(census))} dwellings on the system (2021 census)` : ''}.${st.existing >= 0.5 ? ` With the ${fmtNum(Math.round(st.existing))} completed before the 2021 Census (already in it), <strong>${fmtNum(Math.round(st.total + st.existing))}</strong> in all.` : ''}${st.rows.some(r => r.est > 0) ? ' Hatched: counts estimated from the application (no unit count stated).' : ''}${st.committed >= 0.5 ? ` <strong>${fmtNum(Math.round(st.committed))}</strong> committed (Servicing permit and up: the Peel rule).` : ''}${dormantNote(st.dormant)}${st.notMoved >= 0.5 ? ` <span class="stg-nm-key" aria-hidden="true"></span> Outlined: ${fmtNum(Math.round(st.notMoved + (st.nmExisting || 0)))} in developments that haven\u2019t moved since 2020.` : ''}</p>
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

  // The first capacity row (js/svc-capacity.js collect) of these kinds to reach its limit: 'today' first,
  // then by year, ties by the more loaded at build-out.
  function firstOf(rows, kinds) {
    const yr = r => (r.limit.y === 'today' ? 0 : r.limit.y);
    return rows.filter(r => kinds.includes(r.kind) && r.limit && r.limit.y != null).sort((x, y) => yr(x) - yr(y) || y.pctBo - x.pctBo)[0] || null;
  }
  // The first treatment plant (wastewater or water) to reach its 90% expansion trigger: one rule for
  // Home, Servicing capacity and the Overview's headline.
  const firstTrigger = rows => firstOf(rows, ['plant', 'wplant']);
  // The first pumping into a pressure zone to reach its limit, 100% of firm pumping (Home's "first zone limit").
  const firstZone = rows => firstOf(rows, ['pump']);

  const api = { pageHTML, sectionsOf, briefing, listHTML, tabsHTML, TAB_INFO, reserveRows, pipeGrid, likeOf, consOf, LIKE, CONS, approvedNotBuilt, COVERAGE, STAGES, COMMITTED_STAGES, STAGE_CLS, stageRows, stageOf, stageChartHTML, EST_KINDS, estimateRows, firstTrigger, firstZone };
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
  // Where a page host is (navigation phase 6): one plan filter, the plan; else the municipality; else Peel.
  const where = () => { const S = App() && App().state, PA = root.PeelPlanAreas; if (S && S.sp && S.sp.length === 1 && PA && PA.areaName) return PA.areaName('sp', S.sp[0]); return (S && S.muni) || 'Peel'; };
  // A view's name, by the tabs' words (one name per thing, design §3.9): an area page's id is the view of Home it
  // opens (W.hostOf), a 'tab:sub' key its own ("Servicing › Network"); any other page its own label.
  const viewName = id => { const Wk = W(), h = Wk && Wk.hostOf ? Wk.hostOf(id) : null, k = h ? [h.tab, h.sub] : String(id).includes(':') ? String(id).split(':') : null; return k && Wk && Wk.tabPath ? Wk.tabPath(k[0], k[1]) : label(id); };
  const isView = id => { const Wk = W(); return !!((Wk && Wk.hostOf && Wk.hostOf(id)) || String(id).includes(':')); };
  const hostEyebrow = (tab, sub) => `${esc(W() && W().tabPath ? W().tabPath(tab, sub) : label(tab))} · ${esc(where())}`;
  const eyebrow = id => `${esc(viewName(id))} · ${esc(isView(id) ? where() : (App() && App().state.muni) || 'Peel')}`;
  // A panel row that opened a scope opens it on the map from a page (the workspace's map view; keep: the map view
  // at the view the page shows, a panel view's, navigation phase 6).
  // (a DC project opens in place, on the page: js/dc-projects.js; a row that opens a page, as Records › Data
  // checks' Review outlets, opens it from a page too)
  const toMap = (ws, r, keep) => { const a = r.attrs || {}, x = { 'data-ws-go': ws }; if (a['data-dcproj-open'] != null || a['data-ws-page']) return r; if (a['data-ss']) x['data-ws-ss'] = a['data-ss']; if (a['data-pnl-dev']) x['data-ws-dev'] = a['data-pnl-dev']; if (a['data-ce-open']) x['data-ws-ce'] = a['data-ce-open']; if (a['data-pipe'] != null) x['data-ws-pipe'] = a['data-pipe']; if (keep) x['data-ws-keep'] = ''; return { ...r, attrs: r.attrs ? { ...x, title: a.title } : null }; };
  const loading = (id, what) => ({ id, eyebrow: eyebrow(id), name: (W() && W().BY_ID[id] && W().BY_ID[id].question) || (isView(id) ? viewName(id) : label(id)), answer: `<span class="muted">${esc(what || 'Loading…')}</span>` });
  // The Overview's area panel, once it is worked out for the developments loaded. Until the snapshot is in,
  // and while the panel still holds the empty one drawn before it (the Growth render that redraws it waits
  // its turn), it is null and the page says it is loading, never "No developments match" and zeros.
  function briefing() {
    const a = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null, A = App();
    if (!a || !A) return null;
    if (A.fullSnapshotReady && !A.fullSnapshotReady() && !(A.state.projects || []).length) return null;
    if (OT().lastAreaCount && !OT().lastAreaCount() && (A.state.filtered || []).length) return null;
    return a;
  }
  // A page waiting on the briefing: its place kept with the figures to come, and it tries again (pending).
  const waitingFor = (id, what, groups) => ({ ...loading(id, what), pending: true, groups: (groups || []).map(([title, labels]) => ({ title, figures: labels.map(l => ({ v: '…', u: '', label: l, ctx: 'loading' })) })) });

  // ---- Small maps: a Peel frame from the wastewater blocks -------------------------------------------
  // bounds: [minLng, minLat, maxLng, maxLat] to zoom to (an area), else all of Peel's sewered blocks.
  // One orientation everywhere: the small maps turn as the live map does (Peel's road grid by default,
  // north up as the option; js/map-core.js), with the municipal outlines and their names, and a north
  // arrow when turned.
  // ---- Basemap under the small maps -----------------------------------------------------------------
  // The full map's grey street map (Esri World Gray Canvas, base + reference labels, in the theme's
  // shade) drawn as SVG images: each Web Mercator tile placed by its projected corners, so it turns
  // with the page map. One probe tile says whether tiles load; when they don't (offline), the site
  // maps name their streets from the Region's address points instead (js/reports.js streets).
  const ESRI_TILE = (layer, z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_${layer}/MapServer/tile/${z}/${y}/${x}`;
  const TILES = { ok: null, probing: false };
  function probeTiles() {
    if (TILES.ok !== null || TILES.probing || typeof Image === 'undefined') return;
    TILES.probing = true;
    const im = new Image(), done = ok => { TILES.ok = ok; TILES.probing = false; if (W() && W().renderPage) W().renderPage(true); };
    im.onload = () => done(true); im.onerror = () => done(false);
    im.src = ESRI_TILE('Light_Gray_Base', 10, 285, 373);
  }
  const tilesOk = () => { probeTiles(); return TILES.ok === true; };
  // proj: (lng, lat) → [x, y] in the SVG; bb: [w, s, e, n] the ground to cover (with room for turning).
  function tilesSVG(proj, bb, Wd, H) {
    if (!tilesOk()) return '';
    const dark = typeof document !== 'undefined' && document.documentElement.dataset.theme !== 'light', shade = dark ? 'Dark' : 'Light';
    const cx = (bb[0] + bb[2]) / 2, cy = (bb[1] + bb[3]) / 2, d = (bb[2] - bb[0]) / 50 || 0.001;
    const [x0, y0] = proj(cx, cy), [x1, y1] = proj(cx + d, cy), pxPerDeg = Math.hypot(x1 - x0, y1 - y0) / d;
    const z = Math.max(8, Math.min(16, Math.round(Math.log2(pxPerDeg * 360 / 300))));
    const n = 2 ** z, tx = lng => Math.floor((lng + 180) / 360 * n), ty = lat => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
    const lngOf = x => x / n * 360 - 180, latOf = y => { const t = Math.PI - 2 * Math.PI * y / n; return 180 / Math.PI * Math.atan(0.5 * (Math.exp(t) - Math.exp(-t))); };
    const xa = tx(bb[0]), xb = tx(bb[2]), ya = ty(bb[3]), yb = ty(bb[1]);
    if ((xb - xa + 1) * (yb - ya + 1) > 64) return '';
    const out = [];
    for (const layer of [`${shade}_Gray_Base`, `${shade}_Gray_Reference`]) for (let x = xa; x <= xb; x++) for (let y = ya; y <= yb; y++) {
      const P0 = proj(lngOf(x), latOf(y)), P1 = proj(lngOf(x + 1), latOf(y)), P2 = proj(lngOf(x), latOf(y + 1));
      const m = [P1[0] - P0[0], P1[1] - P0[1], P2[0] - P0[0], P2[1] - P0[1], P0[0], P0[1]].map(v => (+v).toFixed(2)).join(' ');
      out.push(`<image href="${ESRI_TILE(layer, z, x, y)}" width="1.004" height="1.004" preserveAspectRatio="none" transform="matrix(${m})"/>`);
    }
    return `<g class="hm-tiles" aria-hidden="true">${out.join('')}</g>`;
  }
  const tileCredit = () => (tilesOk() ? '<span class="hm-credit">Basemap: Esri, HERE, Garmin, © OpenStreetMap contributors</span>' : '');
  // A municipality's ground, to zoom a Peel map to the one chosen (null for all of Peel).
  function muniBounds() {
    const muni = App() && App().state.muni, M = root.PeelMapCore && root.PeelMapCore.getMunis && root.PeelMapCore.getMunis();
    const m = muni && M && (M.munis || []).find(x => x.name === muni); if (!m) return null;
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const r of m.rings) for (const [x, y] of r) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    return [a, b, c, d];
  }
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
    // (the ground to cover with tiles: the box, widened for the turn)
    const pad = Math.max(mxx - mnx, mxy - mny) * (a ? 0.45 : 0.08);
    // (the basemap helper sits outside this block; a frame built on its own draws without it)
    const tiles = () => (typeof tilesSVG === 'function' ? tilesSVG((x, y) => pt(x, y), [mnx - pad, mny - pad, mxx + pad, mxy + pad], Wd, H) : '');
    const svg = (inner, aria, labels = '') => `<svg viewBox="0 0 ${Wd} ${H}" class="home-map-svg${typeof TILES !== 'undefined' && TILES.ok ? ' has-tiles' : ''}" role="img" aria-label="${esc(aria)}">${tiles()}${base.map(d => `<path d="${path(d.rings)}" class="hm-base"/>`).join('')}${muniSvg()}${inner}${muniLbl()}${labels}${north()}</svg>`;
    // (back from the picture to the ground: a tap on the map, QA/QC › Review outlets; sc: px per degree)
    const inv = (px, py) => { const u = (px - ox) / sc + a0, v = (py - oy) / sc + b0, e = u * ca + v * sa, sth = -u * sa + v * ca; return [cx + e / kx, cy - sth]; };
    return { sv, base, pt, path, line, Wd, H, svg, inv, sc, bearing: bearing(), peel: !bounds };
  }
  // A name short enough for a small map label: brackets dropped, cut at a word with an ellipsis.
  const shortName = (t, n = 30) => { const s0 = String(t || '').replace(/\s*\([^)]*\)?/g, '').replace(/\s+/g, ' ').trim(); return s0.length <= n ? s0 : `${s0.slice(0, n).replace(/\s+\S*$/, '')}…`; };
  // Labels on the top few items of a small map: name at the point, clear of the others.
  // (none on a map of all of Peel: too many places for a few names to help; the municipalities are named)
  function mapLabels(f, items) {
    if (f.peel) return '';
    const placed = [];
    return items.slice(0, 5).map(({ lng, lat, name }) => {
      const [x, y] = f.pt(lng, lat);
      // (too long for either side: shortened to fit the wider one)
      const room = Math.max(f.Wd - x - 8, x - 8);
      if (String(name).length * 6.3 > room) { const keep = name.match(/\s\([^)]*\)$/); name = `${shortName(name.replace(/\s\([^)]*\)$/, ''), Math.max(8, Math.floor(room / 6.3) - (keep ? keep[0].length : 0) - 1))}${keep ? keep[0] : ''}`; }
      const w = Math.min(200, String(name).length * 6.3), right = x + 7 + w < f.Wd;
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
      lbl.push({ lng: pl.lnglat[0], lat: pl.lnglat[1], name: r ? r.name : pl.name, pct: t && r ? r.pctBo + 1000 : 500 });
    }
    return f.svg(out.join(''), 'Peel’s wastewater blocks, with the facilities over capacity or past the 90% trigger at build-out highlighted', mapLabels(f, lbl.sort((a, b) => b.pct - a.pct)));
  }
  // Developments as dots sized by units (Growth, This week), optional highlight set (labelled).
  function devsMap(set, hl) {
    const bb = muniBounds(), f = frame(360, 300, bb); if (!f) return '';
    if (bb) set = set.filter(p => p.lat != null && p.lng >= bb[0] && p.lng <= bb[2] && p.lat >= bb[1] && p.lat <= bb[3]);
    const out = [], dotAt = (p, r, cls, t = '') => { const [x, y] = f.pt(p.lng, p.lat); return `<circle cx="${x}" cy="${y}" r="${r}" class="${cls}">${t}</circle>`; };
    for (const p of set) if (p.lat != null && (p.units || 0) >= 50) out.push(dotAt(p, Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1), 'hm-dev'));
    const hs = (hl || []).filter(p => p.lat != null);
    for (const p of hs) out.push(dotAt(p, 4.5, 'hm-hl', `<title>${esc(p.title)}</title>`));
    // (nothing highlighted: the three largest named)
    const named = hs.length ? hs : set.filter(p => p.lat != null && p.phase !== 'cancelled').sort((a, b) => (b.units || 0) - (a.units || 0)).slice(0, 3);
    if (!hs.length) for (const p of named) out.push(dotAt(p, Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1), 'hm-dev hm-dev-top', `<title>${esc(p.title)}: ${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'}</title>`));
    return f.svg(out.join(''), 'Peel’s wastewater blocks with the developments on the map', mapLabels(f, named.slice(0, 3).map(p => ({ lng: p.lng, lat: p.lat, name: hs.length ? p.title : `${shortName(p.title)} (${fmtNum(p.units)})` }))));
  }
  // DC projects, one project open: the project over the other DC works, zoomed to it and the
  // developments relying on it (js/dc-impact.js), as dots by how they rely on it, sized by units;
  // a red ring where the first homes come before it is built.
  function dcProjectMap(pr, m) {
    const pts = pr.lines.flatMap(ln => ln.g).concat(pr.devs.filter(x => x.p.lat != null).map(x => [x.p.lng, x.p.lat]));
    let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const [x, y] of pts) { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); }
    const pad = Math.max(0.012, (c - a) * 0.08, (d - b) * 0.08), f = frame(360, 300, [a - pad, b - pad, c + pad, d + pad]), di = App() && App().state.dcInfra; if (!f) return '';
    const out = [], inBox = g => g.some(([x, y]) => x >= a - pad && x <= c + pad && y >= b - pad && y <= d + pad);
    if (di) for (const sys of ['wastewater', 'water']) for (const ln of (di[sys] && di[sys].lines) || []) if ((ln.p || ln.c) !== pr.key && inBox(ln.g)) out.push(`<path d="${f.line(ln.g)}" class="hm-dc hm-dc-${sys} hm-dc-dim"/>`);
    const first = x => { const r = m.byDev.get(x.p.key); return r ? r.first : null; };
    const order = { B2: 0, B1: 1, A: 2 }, devs = pr.devs.filter(x => x.p.lat != null).sort((u, v) => order[u.tier] - order[v.tier] || v.units - u.units);
    for (const x of devs) {
      const [px, py] = f.pt(x.p.lng, x.p.lat), r = Math.max(2.2, Math.min(7, Math.sqrt(x.units || 1) / 5)).toFixed(1), f0 = first(x), gap = f0 && pr.y1 && f0 < pr.y1 && m.gateTiers.includes(x.tier);
      out.push(`<circle cx="${px}" cy="${py}" r="${r}" class="hm-dcd hm-dcd-${x.tier.toLowerCase()}"><title>${esc(x.p.title)}: ${fmtNum(Math.round(x.units))} units${f0 ? ` · first homes ≈${f0}` : ''}</title></circle>`);
      if (gap) out.push(`<circle cx="${px}" cy="${py}" r="${(+r + 2.5).toFixed(1)}" class="hm-dcd-gap"/>`);
    }
    // (the project over its developments, so a trunk under many sites stays visible)
    for (const ln of pr.lines) { const dd = f.line(ln.g); out.push(`<path d="${dd}" class="hm-dcp-halo"/><path d="${dd}" class="hm-dcp"><title>${esc(pr.key)}${pr.y1 ? ` · ${pr.y1}` : ''}</title></path>`); }
    const mid = pr.lines[0].g[Math.floor(pr.lines[0].g.length / 2)];
    const lbl = [{ lng: mid[0], lat: mid[1], name: pr.key }, ...devs.filter(x => m.gateTiers.includes(x.tier)).sort((u, v) => v.units - u.units).slice(0, 2).map(x => ({ lng: x.p.lng, lat: x.p.lat, name: shortName(x.p.title, 22) }))];
    return f.svg(out.join(''), `DC project ${pr.key} and the developments relying on it`, mapLabels(f, lbl));
  }
  // Projects: the 2026 DC works (wastewater, water).
  function worksMap() {
    const bb = muniBounds(), f = frame(360, 300, bb), di = App() && App().state.dcInfra; if (!f) return '';
    const out = [], inBB = ln => !bb || ln.g.some(([x, y]) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]), big = [];
    if (di) for (const sys of ['wastewater', 'water']) for (const ln of (di[sys] && di[sys].lines) || []) {
      if (!inBB(ln)) continue;
      out.push(`<path d="${f.line(ln.g)}" class="hm-dc hm-dc-${sys}"><title>${esc(ln.n || '')}${ln.y ? ` · ${ln.y}` : ''}</title></path>`);
      if (ln.n && ln.d) big.push(ln);
    }
    // (the three largest named works, at their middle)
    const lbl = big.sort((a, b) => b.d - a.d).filter((ln, i, a) => a.findIndex(o => o.n === ln.n) === i).slice(0, 3).map(ln => { const m = ln.g[Math.floor(ln.g.length / 2)]; return { lng: m[0], lat: m[1], name: `${shortName(ln.n)}${ln.y ? ` (${ln.y})` : ''}` }; });
    return f.svg(out.join(''), 'The 2026 DC works (draft) on Peel’s wastewater blocks', mapLabels(f, lbl));
  }
  // EA to construction: each Region EA's study area (by where it stands) and the construction after it.
  function eaMap(rows) {
    const bb = muniBounds(), f = frame(360, 300, bb); if (!f) return '';
    const out = [], lbl = [];
    const geo = (g, cls, t) => {
      if (!g) return;
      const tt = `<title>${esc(t)}</title>`;
      if (g.type === 'Polygon') out.push(`<path d="${f.path(g.coordinates)}" class="${cls}">${tt}</path>`);
      else if (g.type === 'MultiPolygon') out.push(`<path d="${g.coordinates.map(pg => f.path(pg)).join('')}" class="${cls}">${tt}</path>`);
      else if (g.type === 'LineString') out.push(`<path d="${f.line(g.coordinates)}" class="${cls} ln">${tt}</path>`);
      else if (g.type === 'MultiLineString') out.push(`<path d="${g.coordinates.map(l => f.line(l)).join('')}" class="${cls} ln">${tt}</path>`);
      else if (g.type === 'Point' || g.type === 'MultiPoint') for (const c of g.type === 'Point' ? [g.coordinates] : g.coordinates) { const [x, y] = f.pt(c[0], c[1]); out.push(`<circle cx="${x}" cy="${y}" r="4" class="${cls}">${tt}</circle>`); }
    };
    const mid = g => { const ps = g.type === 'Point' ? [g.coordinates] : g.type === 'MultiPoint' || g.type === 'LineString' ? g.coordinates : g.type === 'Polygon' || g.type === 'MultiLineString' ? g.coordinates.flat() : g.coordinates.flat(2); const q = ps[Math.floor(ps.length / 2)]; return q || null; };
    const RANK = { limit: 0, waiting: 1, current: 3, building: 2, planned: 2, built: 4, nodate: 5 };
    for (const x of rows) {
      geo(x.e.geometry, `hm-ea hm-ea-${x.bucket}`, `${x.e.name}`);
      const recs = (App() && App().state.capital && App().state.capital.records) || [];
      for (const c of x.outcome) for (const r of recs) if ((r.contract || r.projectNumber || r.id) === c.key) geo(r.geometry, 'hm-cons', `${c.work}${c.street ? ` · ${c.street}` : ''}`);
    }
    for (const x of rows.filter(x => x.e.geometry && (x.bucket === 'limit' || x.bucket === 'waiting')).sort((a, b) => RANK[a.bucket] - RANK[b.bucket] || (a.d.completion ? a.d.completion.at : 0) - (b.d.completion ? b.d.completion.at : 0)).slice(0, 3)) {
      const m = mid(x.e.geometry); if (m) lbl.push({ lng: m[0], lat: m[1], name: `${shortName(x.e.name)} (${x.d.completion.year})` });
    }
    return f.svg(out.join(''), 'Region EA study areas and the construction that followed them', mapLabels(f, lbl));
  }
  // The street at a point: the nearest Region address point within 150 m (when they're loaded).
  let addrIdx = null;
  function streetAtPt(lng, lat) {
    const D = App() && App().state.addressPoints;
    if (!D) { if (root.PeelAddr && root.PeelAddr.loadPoints && !streetAtPt.asked) { streetAtPt.asked = true; root.PeelAddr.loadPoints().then(() => W() && W().renderPage && W().renderPage(true)); } return ''; }
    if (!addrIdx) { addrIdx = new Map(); for (const [k, v] of Object.entries(D.a || {})) { const [, , nm, ty, dr] = k.split('|'), g = `${Math.floor(v[2] / 0.002)},${Math.floor(v[1] / 0.002)}`; (addrIdx.get(g) || addrIdx.set(g, []).get(g)).push([v[2], v[1], [nm, ty, dr].filter(Boolean).join(' ')]); } }
    const kx = 111320 * Math.cos(lat * Math.PI / 180), cx = Math.floor(lng / 0.002), cy = Math.floor(lat / 0.002);
    let best = '', bd = 150;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const q of addrIdx.get(`${cx + a},${cy + b}`) || []) { const m = Math.hypot((q[0] - lng) * kx, (q[1] - lat) * 110540); if (m < bd) { bd = m; best = q[2]; } }
    return best.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  }
  // Old pipes: the runs on the list, heavier where moderate risk.
  function pipesMap(list) {
    const f = frame(), S = MM() && MM().SEW; if (!f || !S || !S.data) return '';
    const out = list.map(r => { const c = S.data.pipes[r.i][10], pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k], c[k + 1]]); return `<path d="${f.line(pts)}" class="hm-pipe${r.risky ? ' risky' : ''}"/>`; });
    // (the three oldest and most loaded runs: size, year and the street, where an address is near)
    const worst = f.peel ? [] : list.slice().sort((a, b) => (likeOf(b) + consOf(b)) - (likeOf(a) + consOf(a)) || b.units - a.units).slice(0, 3);
    const lbl = worst.map(r => { const c = S.data.pipes[r.i][10], k = Math.floor(c.length / 4) * 2, st = streetAtPt(c[k], c[k + 1]); return { lng: c[k], lat: c[k + 1], name: `${fmtNum(S.data.pipes[r.i][0])} mm${r.year ? `, ${r.year}` : ''}${st ? ` · ${st}` : ''}` }; });
    return f.svg(out.join(''), 'The old pipes on the list', mapLabels(f, lbl));
  }
  // A site: the Report's sketch (sewers, DC works, nearby developments, the site), its caption left out.
  function siteMap(p) {
    const r = R(); if (!r || !r.sketchSVG || p.lat == null) return '';
    const near = ((App() && App().state.filtered) || []).filter(q => q !== p && q.lat != null && Math.abs(q.lat - p.lat) < 0.02 && Math.abs(q.lng - p.lng) < 0.03);
    try { return r.sketchSVG({ center: [p.lng, p.lat], halfM: 1500, points: near, site: [p.lng, p.lat], W: 360, H: 260, bearing: bearing(), streets: true, onLoad: () => W() && W().renderPage && W().renderPage(true) }).replace(/<div class="meta">[\s\S]*$/, '').replace('class="sk"', 'class="sk home-map-svg"'); } catch (e) { return ''; }
  }

  // Dormant developments (js/phases.js dormantOf), held out of every count: how many and their homes,
  // in a municipality (or all of Peel), so a stage chart says what it leaves out (dormantNote).
  function dormantFor(muni) {
    const d = ((App() && App().state.projects && App().state.projects.dormant) || []).filter(p => !muni || p.municipality === muni);
    return { n: d.length, units: d.reduce((t, p) => t + (p.units > 0 ? p.units : 0), 0) };
  }

  // ---- Home --------------------------------------------------------------------------------------
  function homeFigures(rows, ready, week) {
    // Capacity and the DC program are Region-wide (a plant serves more than one municipality): with a
    // municipality picked, those figures say so.
    const peelWide = App() && App().state.muni ? 'Peel-wide · ' : '';
    const over = rows.filter(r => r.pctBo >= 100);
    const trig = firstTrigger(rows), zone = firstZone(rows);
    // (no zone at its limit by the horizon's end: "None", with the most loaded zone)
    const busiest = rows.filter(r => r.kind === 'pump').sort((x, y) => y.pctBo - x.pctBo)[0], end = (root.PeelSvcPlants && root.PeelSvcPlants.hz.end) || 2051;
    // (DC projects late: every relief in service after the capacity it relieves runs out, from the DC timing
    // analysis itself, js/dc-cost.js dcAnalysis, cached by scenario; Capital › DC timing lists the 2026 DC lines
    // of it and names the rest, navigation phase 4)
    let late = null;
    if (root.PeelDcCost && root.PeelDcCost.dcAnalysis && App() && App().state.svcModel && App().state.dcInfra && MM() && MM().SEW && MM().SEW.data) { try { const R = root.PeelDcCost.dcAnalysis(); late = { v: R.list.filter(r => r.rec === 'advance').length }; } catch (e) { late = null; } }
    const nW = week && week.rows ? week.rows.length : 0;
    const go = (page, title) => ({ 'data-ws-page': page, title });
    return [
      ready ? { v: fmtNum(over.length), u: 'over', label: 'over capacity at build-out', ctx: `${peelWide}of ${fmtNum(rows.length)} facilities · Servicing capacity →`, tone: over.length ? 'over' : null, attrs: go('tight', 'Servicing capacity') } : { v: '…', u: '', label: 'over capacity at build-out', ctx: 'checking servicing capacity', attrs: go('tight', 'Servicing capacity') },
      // (each opens its facility as a scope on Servicing capacity's map; a pump row is "into zone n and
      // above", several zones and no scope, so the zone figure opens the page and its Soonest limits)
      trig ? { v: trig.limit.y === 'today' ? 'Now' : `≈${trig.limit.y}`, u: '', label: 'first 90% trigger', ctx: `${peelWide}${esc(trig.name)} reaches its 90% expansion trigger · Servicing capacity →`, tone: 'tight', attrs: trig.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': trig.ss, title: `Open ${trig.name}` } : go('tight', 'Servicing capacity') } : null,
      zone ? { v: zone.limit.y === 'today' ? 'Now' : `≈${zone.limit.y}`, u: '', label: 'first zone limit (100% of firm)', ctx: `${peelWide}${esc(zone.name)} reaches 100% of firm pumping · Servicing capacity →`, tone: 'tight', attrs: go('tight', 'Servicing capacity') }
        : busiest ? { v: 'None', u: '', label: 'first zone limit (100% of firm)', ctx: `${peelWide}before ${end} · most loaded: ${esc(busiest.name)} (${Math.round(busiest.pctBo)}% at build-out) · Servicing capacity →`, attrs: go('tight', 'Servicing capacity') } : null,
      late ? { v: late.v, u: '', label: 'DC projects late', ctx: `${peelWide}in service after the capacity runs out · DC projects →`, tone: +late.v ? 'over' : null, attrs: { ...go('projects', 'DC projects'), 'data-dc-status': 'gap' } } : null,
      { v: fmtNum(nW), u: nW === 1 ? 'change' : 'changes', label: 'this week', ctx: 'files moved, new files, capital and EA dates · This week →', attrs: go('week', 'This week') },
    ].filter(Boolean);
  }
  function home() {
    const a = briefing(); if (!a) return { ...waitingFor('home', 'Loading the developments and working out the briefing…', [['Growth', ['planned', 'left to build', 'at build-out', 'expected by 2031']], ['Servicing', ['over capacity at build-out', 'first 90% trigger', 'first zone limit (100% of firm)']], ['Capital', ['DC projects late', 'with no relief in time']], ['Change', ['this week']]]), eyebrow: `Peel · ${esc((App() && App().state.muni) || 'all of Peel')}`, name: `${where()}: what needs attention`, scen: scen() };
    // The servicing model loads after the developments: until then Needs attention keeps its place with
    // a placeholder (never silently left out), and the map's key waits for the colours it explains. The
    // capacity figures wait for every facility (the pumps and pumping stations load last), so a count
    // such as "3 over of 10 facilities" is never shown on its way to "8 over of 32".
    const cap = Cap() && Cap().collect ? Cap().collect() : null, ready = !!cap && !(Cap().partial && Cap().partial()), rows = ready ? cap : [];
    const wait = { title: 'Needs attention', rows: [{ kv: true, html: '<span class="muted">Checking servicing capacity…</span>' }], total: 1 };
    const nl = a.lists.find(l => l.title === 'Needs attention');
    const needs = ready ? (nl && nl.rows.length ? nl : null) || { title: 'Needs attention', rows: [{ kv: true, html: '<span class="muted">Nothing reaches a limit or the 90% trigger at build-out.</span>' }], total: 1 } : wait;
    const week = a.lists.find(l => l.title === 'This week');
    // Home's rows open the matching workspace page.
    const toPage = (ws, l) => (l ? { ...l, rows: l.rows.map(r => ({ ...r, attrs: { 'data-ws-page': ws, title: (r.attrs || {}).title } })), see: { 'data-ws-page': ws } } : null);
    // Needs attention: a plant, station or water system opens as a scope on Servicing capacity's map (as
    // the page's own rows); a row with no scope (storage, pumping into a zone) and See all open the page.
    const toScope = l => ({ ...l, rows: l.rows.map(r => ((r.attrs || {})['data-ss'] ? toMap('tight', r) : { ...r, attrs: { 'data-ws-page': 'tight', title: (r.attrs || {}).title } })), see: { 'data-ws-page': 'tight' } });
    // Step 6: the scope first (Peel or a municipality: every figure on the page follows it), then four
    // groups of figures, each the answer of its page: Growth, Servicing, Capital, Change.
    const muni = (App() && App().state.muni) || '', MUNIS = ['', 'Mississauga', 'Brampton', 'Caledon'];
    const scope = `<div class="home-scope"><div class="seg" role="group" aria-label="Municipality">${MUNIS.map(x => `<button type="button" class="btn small${x === muni ? ' on' : ''}" data-ws-muni="${esc(x)}" aria-pressed="${x === muni}">${esc(x || 'Peel')}</button>`).join('')}</div><p class="small muted">Every figure here follows the municipality picked; one that is Region-wide says so.</p></div>`;
    const set = (App() && App().state.filtered) || [], Gr = root.Growth, G = Gr ? Gr.pipelineTotals(set) : null, Ph = P();
    const hf = homeFigures(rows, ready, week), byL = re => hf.find(f => f && re.test(f.label)) || null;
    const people = (a.figures || []).find(f => f && f.u === 'people'), tm = specOf('growth:timing', areaScope), f31 = tm && (tm.figures || []).find(f => f && /2031/.test(f.label));
    const noRelief = rows.filter(r => r.relief === 'gap' && r.limit && r.limit.y != null).length;
    let tightFiles = null; try { const wk = week && ready ? BUILD.week() : null; tightFiles = wk && (wk.figures || []).find(f => f && /tight plant/.test(f.label)); } catch (e) { tightFiles = null; }
    const go = page => ({ 'data-ws-page': page });
    // At a plan (the filter a drill or a plan pick sets: navigation phase 6, owner decision 10, the two-part rule): a
    // development partly in it is shown, and the plan's own figures count only its share in it, as Growth › Areas,
    // By period and the top bar do (js/plan-tables.js inside); the Forecast's 2031 figure counts them whole, and says so.
    const PTs = root.PeelPlanTables, sp0 = (App() && App().state.sp) || [], ins = sp0.length && PTs && PTs.inside ? PTs.inside() : null, inPlan = !!(ins && ins.found), inName = esc(sp0.length === 1 ? where() : 'the plans');
    const outside = inPlan && ins.straddling && ins.outside >= 0.5 ? `+ ${fmtNum(Math.round(ins.outside))} planned in the parts of ${fmtNum(ins.straddling)} development${ins.straddling === 1 ? '' : 's'} outside it` : '';
    const groups = [
      { title: 'Growth', link: { label: 'Growth in an area', attrs: go('growth') }, figures: [
        inPlan ? { v: fmtNum(Math.round(ins.planned)), u: 'homes', label: 'planned', ctx: outside || `${fmtNum(set.length)} developments`, attrs: go('growth') }
          : G ? { v: fmtNum(Math.round(G.planned)), u: 'homes', label: 'planned', ctx: `${fmtNum(set.length)} developments`, attrs: go('growth') } : null,
        inPlan ? { v: fmtNum(Math.round(ins.left)), u: 'homes', label: 'left to build', ctx: `inside ${inName}, by share`, attrs: go('growth') }
          : G ? { v: fmtNum(Math.round(G.left)), u: 'homes', label: 'left to build', ctx: `${fmtNum(Math.round(G.completed))} completed`, attrs: go('growth') } : null,
        inPlan ? { v: fmtNum(U.roundPop ? U.roundPop(ins.people) : Math.round(ins.people)), u: 'people', label: 'at build-out', ctx: `inside ${inName} · Peel design criteria`, attrs: go('growth') }
          : people ? { v: people.v, u: 'people', label: 'at build-out', ctx: 'Peel design criteria', attrs: go('growth') } : null,
        f31 ? { v: f31.v, u: f31.u || 'units', label: 'expected by 2031', ctx: inPlan ? `${f31.ctx} · the developments in or partly in ${inName}, whole` : f31.ctx, attrs: go('outlook') } : null] },
      { title: 'Servicing', link: { label: 'Servicing capacity', attrs: go('tight') }, figures: [byL(/over capacity/), byL(/first 90% trigger/), byL(/first zone limit/)] },
      { title: 'Capital', link: { label: 'Capital', attrs: go('projects') }, figures: [byL(/DC projects late/), ready ? { v: fmtNum(noRelief), u: noRelief === 1 ? 'facility' : 'facilities', label: 'with no relief in time', ctx: `${muni ? 'Peel-wide · ' : ''}reach a limit with no DC project in time`, tone: noRelief ? 'over' : null, attrs: go('tight') } : null] },
      { title: 'Change', link: { label: 'This week', attrs: go('week') }, figures: [byL(/this week/), tightFiles ? { ...tightFiles, attrs: go('week') } : null] },
    ];
    // The largest developments left to build, and the plans furthest behind their target (both full map only until now).
    const big = set.filter(p => p.phase !== 'cancelled').map(p => [p, Ph && Ph.unbuiltOf ? Ph.unbuiltOf(p) : 0]).filter(x => x[1] >= 1).sort((x, y) => y[1] - x[1]).slice(0, 5);
    const lab = k => (Ph && Ph.PHASE_BY_KEY[k] ? Ph.PHASE_BY_KEY[k].label : k);
    const unbuilt = { title: 'Largest left to build', rows: big.map(([p, u]) => ({ attrs: { 'data-ws-pick': p.key, 'data-ws-as': 'site', title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${fmtNum(Math.round(u))} left</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${esc(lab(p.phase))}</small>` })), total: big.length };
    const PT = root.PeelPlanTables, behind = PT && PT.behindTarget ? PT.behindTarget(5) : null;
    const tgt = behind && behind.length ? { title: 'Plans furthest behind their target', rows: behind.map(x => ({ attrs: { 'data-ws-explore': x.node.id, title: `Filter to ${x.name} (Growth › Areas)` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.name)}</span><span class="pnl-r-year">${Math.round(x.pctTotal * 100)}%</span></div><small class="pnl-r-line">${fmtNum(Math.round(x.total))} planned of a ${fmtNum(x.target.units)}-unit target${x.target.year ? ` (${x.target.year})` : ''}</small>` })), total: behind.length } : null;
    // (pending: the servicing figures are still loading, and the page tries again until they are in; the
    // title's "N over" chip waits with them)
    // (at one plan, the filter a plan pick or the drill sets: named for it, with its Area report, design §3.3)
    const plan1 = sp0.length === 1 ? sp0[0] : null;
    return { id: 'home', pending: !ready || null, eyebrow: esc(a.head && a.head.identity ? a.head.identity : 'Peel'), name: `${where()}: what needs attention`, status: ready && a.head ? a.head.status : null, scen: scen(), answer: a.answer, caveats: caveats(),
      top: scope,
      figures: [], groups,
      // The units the answer adds, by stage: Built since 2021 beside what is approved and in review.
      chart: a.stageStrip ? `${a.stageStrip}${(d => (d.n ? `<p class="small muted">${dormantNote(d).trim()}</p>` : ''))(dormantFor(muni))}` : '',
      lists: [ready ? toScope(needs) : needs, unbuilt, tgt, toPage('week', week)],
      map: { svg: capacityMap(rows), attrs: { 'data-ws-page': 'tight' }, link: 'Servicing capacity', label: 'Open Servicing capacity', caption: !ready ? '<span class="muted">Checking servicing capacity…</span>' : '<span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out (catchments, zones and plants)' },
      actions: [{ label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' }, primary: true }, plan1 ? { label: 'Area report (PDF)', attrs: { 'data-ws-areareport': `a:${plan1}` } } : null, { label: 'Full map', attrs: { 'data-ws-full': '' } }] };
  }

  // ---- Servicing capacity ------------------------------------------------------------------------
  function tight() {
    const s = specOf('svc:capacity', areaScope), rows = Cap() && Cap().collect ? Cap().collect() : null;
    if (!s || !rows) return loading('tight', 'Loading the servicing model…');
    // (the System narrows the Soonest limits list it sits on, which names it; the page's header and figures
    // count both systems, as Home's figure that opens the page and the full table do)
    const sy = root.PeelAnalysisTabs && root.PeelAnalysisTabs.getSys ? root.PeelAnalysisTabs.getSys() : 'both', both = sy !== 'both' && Cap().panelSpec ? Cap().panelSpec(rows, 'both') : s;
    const crit = App().state.criteria, psPlant = Object.fromEntries(((App().state.servicing && App().state.servicing.psAreas) || []).map(a => [`ps:${a.id}`, a.plant]));
    const res = reserveRows(rows, crit, psPlant), late = rows.filter(r => r.relief === 'gap' && r.limit.y != null).sort((a, b) => (a.limit.y === 'today' ? 0 : a.limit.y || 1e4) - (b.limit.y === 'today' ? 0 : b.limit.y || 1e4));
    const over = rows.filter(r => r.pctBo >= 100);
    const first = firstTrigger(rows), low = res[0], end = (root.PeelSvcPlants && root.PeelSvcPlants.hz.end) || 2051;
    const yTxt = y => (y === 'today' ? 'now' : y == null ? `after ${end}` : `≈${y}`);
    const q = r => (r.unit === 'L/s' ? `${fmtNum(Math.round(r.v))} L/s` : `${fmt1(r.v)} ${r.unit}`);
    const resRow = r => ({ tone: r.pct < 0 ? 'over' : r.pct < 10 ? 'tight' : null, attrs: r.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': r.ss, title: `Open ${r.name} on the map` } : { 'data-ws-go': 'tight', 'data-ws-fulltable': '1', title: `${r.name}: in the full table` },
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.kind === 'wplant' ? '💧 ' : ''}${esc(r.name)}</span><span class="pnl-r-year${r.reserve < 0 ? ' t-over' : ''}">${r.reserve < 0 ? 'none' : `${fmt1(r.reserve)} ML/d`}</span></div>
        <div class="pnl-r-meta"><span>${r.reserve < 0 ? `committed ${fmt1(-r.reserve)} ML/d past rated` : `≈${fmtNum(Math.round(r.people / 100) * 100)} people · ${Math.round(r.pct)}% of rated ${fmt1(r.cap)} ML/d`}</span></div>
        ${r.limits.length ? `<small class="pnl-r-line t-tight">Limited by ${r.limits.slice(0, 3).map(x => `${esc(x.name)} (${x.when}, ${Math.round(x.when === 'now' ? x.pctCom : x.pctBo)}%)`).join(', ')}${r.limits.length > 3 ? ` and ${r.limits.length - 3} more` : ''}</small>` : ''}` });
    const lateRow = r => ({ tone: 'over', attrs: r.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': r.ss, title: `Open ${r.name} on the map` } : null,
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.sys === 'water' ? '💧 ' : ''}${esc(r.name)}</span><span class="pnl-r-year t-over">limit ${yTxt(r.limit.y)}</span></div><small class="pnl-r-line">${esc(r.limit.what)} · ${Math.round(r.pctBo)}% at build-out · ${r.reliefY ? `relief ≈${r.reliefY}, after the limit` : 'no relief listed in the Master Plan'}</small>` });
    const area = OT() && OT().lastAreaSpec ? OT().lastAreaSpec() : null;
    return { id: 'tight', eyebrow: eyebrow('tight'), name: 'Can the system take it?', status: both.head.status, identity: both.head.identity, scen: scen(), answer: both.answer, caveats: caveats().filter(c => /source/i.test(c.text)),
      figures: [
        both.figures[0],
        { v: fmtNum(late.length), u: late.length === 1 ? 'facility' : 'facilities', label: 'no relief in time', ctx: `${fmtNum(late.filter(r => r.reliefY).length)} relief after the limit · ${fmtNum(late.filter(r => !r.reliefY).length)} none listed`, tone: late.length ? 'over' : 'room', attrs: { 'data-ws-go': 'tight', 'data-ws-fulltable': '1' } },
        first ? { v: yTxt(first.limit.y), u: '', label: 'first 90% trigger', ctx: `${esc(first.name)} · ${esc(first.limit.what)}`, tone: 'tight', attrs: first.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': first.ss } : null } : null,
        low ? { v: low.reserve < 0 ? 'none' : fmt1(low.reserve), u: low.reserve < 0 ? '' : 'ML/d', label: 'uncommitted reserve, lowest', ctx: `${esc(low.name)}${low.reserve > 0 ? ` · ≈${fmtNum(Math.round(low.people / 100) * 100)} people` : ''}`, tone: low.pct < 10 ? 'tight' : 'room', attrs: low.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': low.ss } : null } : null,
      ],
      chart: area && area.chart ? area.chart : '',
      lists: [
        { ...s.lists[0], title: `Soonest limits${sy === 'ww' ? ': wastewater' : sy === 'water' ? ': water' : ''}`, tools: s.lists[0].tools, rows: s.lists[0].rows.map(r => toMap('tight', r)), see: { 'data-ws-go': 'tight', 'data-ws-fulltable': 'svc:capacity' } },
        { title: 'Uncommitted reserve at the treatment plants', rows: res.map(resRow), total: res.length },
        { title: 'No relief in time', rows: late.map(lateRow), total: late.length, see: { 'data-ws-page': 'projects' } },
      ],
      map: { svg: capacityMap(rows), attrs: { 'data-ws-go': 'tight' }, label: 'Open Servicing capacity on the map', caption: '<span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out' },
      // (the panel's folds: the overflows reported and, navigation phase 2, the allocations recorded)
      folds: s.folds || [],
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
    const devRow = p => ({ attrs: { 'data-ws-pick': p.key, title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(Ph && Ph.PHASE_BY_KEY[p.phase] ? Ph.PHASE_BY_KEY[p.phase].label : p.phase)}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'}</small>` });
    // Bundle 6: the steps in one line under the search (not a list beside the map); Review an FSR
    // starts from the files that have an FSR posted (data/fsr.json), newest first.
    const steps = [['Find', 'search or pick one below'], ['Result', id === 'fsr' ? 'its servicing path with the FSR cross-check' : 'its servicing, timing and what to confirm'], ['Output', id === 'fsr' ? 'notes for the review' : 'the one-page servicing memo']];
    const stepper = `<p class="pnl-stepper small" aria-label="Steps">${steps.map(([t, d], i) => `<span class="${i === 0 ? 'on' : ''}"><b>${i + 1}</b> ${esc(t)}: ${esc(d)}</span>`).join('<span class="muted" aria-hidden="true"> › </span>')}</p>`;
    const F = root.PeelFsr;
    let fsrRows = null;
    if (id === 'fsr' && F) {
      if (!F.FSR.by) { if (F.loadFsr) F.loadFsr().then(() => { if (W() && W().renderPage) W().renderPage(true); }); }
      else fsrRows = proj.map(p => ({ p, f: F.fsrFor(p) })).filter(x => x.f && x.f.best && x.p.phase !== 'cancelled').sort((a, b) => String(b.f.best.fsr.date || '').localeCompare(String(a.f.best.fsr.date || ''))).map(({ p, f }) => ({ attrs: { 'data-ws-pick': p.key, title: `Review ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(f.best.fsr.date || '')}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'} · FSR posted${f.best.fsr.date ? ` ${esc(f.best.fsr.date)}` : ''}</small>` }));
    }
    const lists = id === 'fsr'
      ? [{ title: 'Files with an FSR posted', rows: fsrRows || [{ kv: true, html: '<span class="muted small">Looking for posted servicing reports…</span>' }], total: fsrRows ? fsrRows.length : 0 },
        { title: 'Recently active', rows: recent.map(devRow), total: recent.length }]
      : [{ title: 'Recently active', rows: recent.map(devRow), total: recent.length }, { title: 'Large files under review', rows: big.map(devRow), total: big.length }];
    return { id, eyebrow: `${esc(label(id))} · step 1 of 3`, name: id === 'fsr' ? 'Do the consultant’s figures match Peel’s criteria?' : 'Can this development be serviced, and when?',
      top: stepper,
      answer: id === 'fsr' ? `Find the development: search an address or file number, or pick one with an FSR posted${fsrRows ? ` (${fmtNum(fsrRows.length)} in Mississauga and Caledon; Brampton’s are on BramPlanOnline, searched by file number)` : ''}.` : 'Find the development: search an address or file number, or pick one below.',
      lists,
      map: { svg: devsMap(((App() && App().state.filtered) || []), recent), attrs: { 'data-ws-go': id }, label: 'Pick a development on the map', caption: '<span class="hm-key hm-key-hl"></span> recently active <span class="hm-key hm-key-dev"></span> developments of 50+ units (sized by units); click to pick one on the map' },
      actions: [{ label: 'Pick on the map', attrs: { 'data-ws-go': id }, primary: true }] };
  }
  // ---- Check a site, with a site -----------------------------------------------------------------------
  // The site's sections (js/sections.js): every full-map tab's panel for this development, one at a
  // time under a section bar, by the tabs' names; Overview first. A new development opens on Overview.
  let siteSec = 'summary', siteSecDev = null;
  // A file number picked in the search (js/workspaces.js routePick): its row in the Files tree marked, and
  // scrolled to once. (the tree row's own button: the header's latest file, the "counted once" figure and
  // the row's tags carry the same attribute; a row among the earlier files on the land opens their fold)
  let siteFile = null, siteFileShown = false;
  function markFile(host, ref) {
    const b = host && host.querySelector(`.tr-row > div > .tr-ref[data-dev-file="${CSS.escape(ref)}"]`), row = b && b.closest('.tr-row'); if (!row) return;
    const fold = row.closest('details.tr-same'); if (fold && !fold.open) fold.open = true;
    row.classList.add('tr-hit');
    if (!siteFileShown) { siteFileShown = true; row.scrollIntoView({ block: 'center' }); }
  }
  // (an entry with at: a view of Home, the page host: Help's bar's Data sources and Data checks, navigation phase 6)
  function sectionBar(secs, on, attr = 'data-ws-sec') {
    const to = s => (s.at ? `data-pg-tab="${esc(s.at.split(':')[0])}" data-pg-sub="${esc(s.at.split(':')[1] || '')}"` : s.page ? `data-ws-page="${esc(s.page)}"` : `${attr}="${esc(s.id)}"`);
    return `<nav class="page-secs" aria-label="Sections" data-psec="sections">${secs.map(s => `<button type="button" class="page-sec${s.id === on ? ' on' : ''}" ${to(s)} aria-pressed="${s.id === on}">${esc(s.title)}</button>`).join('')}</nav>`;
  }
  // A section's views (a site's Servicing: Network · FSR review, the map's chips), a second row under the
  // bar: the section's own view is the section, another view its page (FSR review: the page `fsr`).
  function viewsBar(sec, on) {
    return `<nav class="page-secs page-subsecs" aria-label="Views" data-psec="views">${sec.views.map(v => `<button type="button" class="page-sec${v.id === on ? ' on' : ''}" ${v.page ? `data-ws-page="${esc(v.page)}"` : `data-ws-sec="${esc(sec.id)}"`} aria-pressed="${v.id === on}">${esc(v.title)}</button>`).join('')}</nav>`;
  }
  // Reference's bar (js/sections.js WORKSPACES: Help, How it works, the Glossary, How the app decides, and Home's
  // Records › Sources and Data checks).
  function wsBar(ws, on) { const W = root.PeelSections && root.PeelSections.WORKSPACES[ws]; return W ? sectionBar(W.secs, on) : ''; }
  // A panel spec s drawn as page m (key: its panel; ws: the map view its rows open, none for a view with no
  // map workspace, Records). (a view showing one item of its list, as DC timing shows a project in place: its
  // name, and a way back)
  function asSection(m, s, key, ws = W() && W().BY_ID && W().BY_ID[m.id] ? m.id : null) {
    // (a block span: the answer is a paragraph, and a paragraph inside it would split the sentence)
    const h = s.head || {}, back = h.back ? `<span class="ws-back small"><button type="button" class="btn small link"${Object.entries(h.back.attrs || {}).map(([k, v]) => ` ${k}="${esc(v)}"`).join('')}>‹ ${esc(h.back.label)}</button></span>` : '';
    // (a view with no map workspace of its own, Records: a row or See all into the full table opens the map at
    // the view's tab and the full table at its table, as on the map, Records › Data checks' Servicing model
    // rows; another row opens the map at the view, then does what it does there)
    const ft = !ws ? a => (a && a['data-full-table'] != null ? { 'data-at': key, 'data-full-table': a['data-full-table'], 'data-ft-go': a['data-ft-go'], title: a.title } : null) : () => null;
    // (a panel view's rows and See all open its map view at the view: keep, navigation phase 6)
    const keep = !!ws && ws !== m.id;
    const row = r => { const a = ft(r.attrs); return a ? { ...r, attrs: a } : ws ? toMap(ws, r, keep) : r.attrs && !r.attrs['data-ws-page'] ? { ...r, attrs: { ...r.attrs, 'data-at': key } } : r; };
    const see = l => (ft(l.seeAll) ? { see: ft(l.seeAll) } : keep && l.seeAll && l.seeAll['data-full-table'] != null ? { see: { 'data-ws-go': ws, 'data-ws-fulltable': l.seeAll['data-full-table'] || '1', 'data-ws-keep': '' } } : {});
    return { ...m, ...(h.wsName ? { name: h.wsName } : {}), status: h.status, identity: h.identity ? h.identity : m.identity, answer: `${back}${s.answer}`, figures: s.figures, chart: s.chart, lists: (s.lists || []).map(l => ({ ...l, rows: l.rows.map(row), ...see(l) })), folds: s.folds, method: s.method, sources: s.sources, onMount: s.onMount };
  }
  // A view of the page host that is the map's panel drawn as it is (Growth › Pipeline, Servicing › Network,
  // Capital › Projects, Records › Data checks; js/sections.js VIEWS): its answer, figures, lists and folds, its
  // footer's own actions first (foot.primary, design §5 row 56), then Open the map (its map view at this view,
  // the tab and view kept; Records: the full map there) and Full table. Loading until its panel is set.
  function panelView(key, scope = 'area') {
    const SE = root.PeelSections, v = (SE && SE.VIEWS && SE.VIEWS[scope] && SE.VIEWS[scope][key]) || {}, [tab, sub] = key.split(':');
    const s = SE && SE.areaPanel ? SE.areaPanel(key) : null;
    if (!s) return { ...loading(key, `Loading ${viewName(key)}…`), pending: true };
    const h = s.head || {}, f = s.foot || {};
    const map = v.ws ? { 'data-ws-go': v.ws, 'data-ws-keep': '' } : { 'data-ws-full': '', 'data-at': key };
    const m = asSection({ id: key, eyebrow: hostEyebrow(tab, sub), name: h.name || viewName(key), scen: scen() }, s, key, v.ws || null);
    return { ...m, actions: [...(f.primary ? [{ ...f.primary, primary: true }] : []), ...(f.secondary || []), { label: 'Open the map', attrs: map }, { label: 'Full table', attrs: v.ws ? { ...map, 'data-ws-fulltable': key } : { 'data-at': key, 'data-full-table': '' } }] };
  }
  // A site page's live map (js/workspaces.js placeMap → fitSite): the map itself, at the site, with the
  // infrastructure around it, each layer a chip under it.
  const SITE_LAYERS = [['devs', 'Developments'], ['ex-water', 'Existing water'], ['ex-sanitary', 'Existing sewers'], ['ex-storm', 'Storm'], ['dcw', '2026 DC works'], ['cons', 'Region construction'], ['ea', 'EA study areas']];
  function siteLiveMap(p) {
    const LG = root.PeelLayerGroups, on = k => { try { return !!(LG && LG.ADAPT && LG.ADAPT[k] && LG.ADAPT[k].get()); } catch (e) { return false; } };
    const chips = SITE_LAYERS.map(([k, t]) => `<button type="button" class="btn small page-layer${on(k) ? ' on' : ''}" data-ws-layer="${k}" aria-pressed="${on(k)}">${esc(t)}</button>`).join('');
    return { title: 'Where: the site and the infrastructure around it', attrs: { 'data-ws-go': 'site' }, link: 'Open the map', html: `<div class="page-map-slot page-map-site" id="page-map-slot" data-site="${esc(p.key)}"></div><div class="page-layers" role="group" aria-label="Layers on this map">${chips}</div>`,
      caption: '<span class="hm-key hm-key-site"></span> the site (outlined) · existing mains show from street zoom; dashed: the 2026 DC program; the Region\u2019s construction and EA study areas. The same layers as the full map.' };
  }
  // Explore (Check a site, Review an FSR, Growth in an area, Forecast, Study area: one workspace): where
  // you are (Peel › municipality › plan › site, each a step back up). The search and Draw an area are
  // in every page's header (pageHTML).
  function exploreBar(trail) {
    return trail ? `<div class="page-explore" data-psec="explore"><p class="ex-where small">${trail}</p></div>` : '';
  }
  // A development's place in the plan tree: Peel › its municipality › its plan › … (its deepest area).
  function siteTrail(p) {
    const PT = root.PeelPlanTables; let r = null;
    try { r = PT && PT.compute ? PT.compute() : null; } catch (e) { r = null; }
    const ids = PT && PT.areaIdsOf ? [...PT.areaIdsOf(p)] : [];
    const depth = n => { let d = 0; for (let x = n; x && x.parent; x = r.nodes.get(x.parent)) d++; return d; };
    const leaf = r ? ids.map(id => r.nodes.get(`a:${id}`)).filter(Boolean).sort((a, b) => depth(b) - depth(a))[0] || r.nodes.get(`m:${p.municipality}`) : null;
    const trail = []; for (let x = leaf; x; x = x.parent ? r.nodes.get(x.parent) : null) trail.unshift(x);
    const crumb = n => `<button type="button" class="btn small link" data-ws-explore="${esc(n.id)}">${esc(n.name)}</button>`;
    return `${(trail.length ? trail : [{ id: 'peel', name: 'Peel' }]).map(crumb).join(' <span aria-hidden="true">›</span> ')} <span aria-hidden="true">›</span> <strong>${esc(p.title)}</strong>`;
  }
  // view 'fsr': Servicing › FSR review (js/fsr-check.js panelSpec), drawn as the page `fsr` (its id, eyebrow,
  // guide and link), with the site's header, trail and section bar (Servicing on, its views row under it).
  function site(view) {
    const SE = root.PeelSections, fv = view === 'fsr' && !!SE, id = fv ? 'fsr' : 'site';
    const p = devNow(); if (!p) return find(id);
    const s = specOf('overview:', `dev:${p.key}`); if (!s) return loading(id, `Loading ${p.title}…`);
    if (siteSecDev !== p.key) { siteSec = 'summary'; siteSecDev = p.key; siteFile = null; }
    if (SE && !SE.BY_ID[siteSec]) siteSec = 'summary';   // (an id no section has now, as the old fsr: Overview)
    const want = fv ? 'servicing' : siteSec, vw = fv ? SE.viewOf('servicing', 'fsr') : null;
    const sec = fv ? SE.specFor(vw, p) : SE && siteSec !== 'summary' ? SE.specFor(siteSec, p) : null, on = sec || fv ? want : 'summary';
    const waiting = SE && want !== 'summary' && !sec;
    const b = sec || s, ref = on === 'files' ? siteFile : null;
    const mount = ref ? host => { if (typeof b.onMount === 'function') b.onMount(host); markFile(host, ref); } : b.onMount;
    const svc = SE && (waiting ? want : on) === 'servicing' ? viewsBar(SE.BY_ID.servicing, fv ? 'fsr' : 'network') : '';
    // (the memo, then a section's own secondary action: Capital's "Copy for review comments"; FSR review its
    // own footer, Copy the comparison and Print / PDF; the Inquiry draft, ☆ Watch and Check FSR are the
    // header's, as on the map: navigation phase 5)
    const foot = (sec && !waiting && sec.foot) || {};
    const acts = fv ? [...(foot.primary ? [{ ...foot.primary, primary: true }] : []), ...(foot.secondary || [])] : [{ label: 'Servicing memo', attrs: { 'data-pnl-memo': '' }, primary: true }, ...(foot.secondary || [])];
    return { id, eyebrow: `${esc(label(id))} · <span class="pnl-steps-i">✓ Find › <b>Result</b> › Output: ${fv ? 'notes for the review' : 'Servicing memo'}</span>`, name: p.title, status: s.head.status, badge: s.head.badge, extra: s.head.extra, identity: s.head.identity, tools: s.head.tools, scen: scen(),
      top: `${exploreBar(siteTrail(p))}${SE ? sectionBar(SE.SITE, waiting ? want : on) : ''}${svc}`,
      answer: waiting ? `<span class="muted">Loading ${esc((vw || SE.BY_ID[want] || {}).title || '')} for ${esc(p.title)} (the servicing model and the DC program)…</span>` : b.answer,
      caveats: [], figures: waiting ? [] : b.figures, chart: waiting ? '' : b.chart,
      lists: waiting ? [] : (b.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap(id, r)) })),
      map: siteLiveMap(p),
      folds: waiting ? [] : b.folds, method: waiting ? '' : b.method, sources: waiting ? '' : b.sources, onMount: waiting ? null : mount,
      actions: [...acts, { label: 'Open the map', attrs: { 'data-ws-go': id } }, { label: 'Another site', attrs: { 'data-ws-unpick': id } }] };
  }

  // ---- Growth in an area: drill down Peel → municipality → plan → precinct / sub-area → its files ----
  // The plan tree is Growth › Areas' own (js/plan-rollup.js through js/plan-tables.js): every row equals
  // the sum of the rows under it. A row opens the next level; the stage bars filter the area's files.
  // The level is the map's filter (navigation phase 6, owner decision 10: drillTo): the map and every tab follow
  // it; a development partly in it is in it, and the level's own totals count only its share (the two-part rule).
  let gStage = 'all';
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
    // (the filter's level: one plan, sub-area or precinct, else the municipality, else Peel; one the tree does not
    // hold, as a plan with no development shown, its municipality)
    const fl = App().state, fsp = fl.sp || [], want = fsp.length === 1 ? `a:${fsp[0]}` : fl.muni ? `m:${fl.muni}` : 'peel';
    const n = r.nodes.get(want) || (fl.muni && r.nodes.get(`m:${fl.muni}`)) || r.root;
    const G = root.Growth, Ph = P(), Ly = root.PeelLayers, basis = App() ? App().state.basis || 'all' : 'all';
    const dm = nodeDevs(n), items = [...dm].map(([p, share]) => ({ p, share: Math.min(1, share) }));
    const atPeel = n.kind === 'peel';
    // (the whole filtered set: Peel, or the municipality with no plan filter; what reads the filtered set whole, the
    // census baseline and the Forecast's 2031 figure, stays at that level, as at a plan it would count straddlers whole)
    const atTop = !fsp.length && (atPeel || n.id === `m:${fl.muni}`);
    const muniOf = x => { for (let y = x; y; y = y.parent ? r.nodes.get(y.parent) : null) if (y.kind === 'municipality') return y.name; return ''; };
    const kind = x => kindOf(x, muniOf(x));
    // Where it is: Peel › municipality › plan › … (going up is the top bar's trail, the map's filter)
    const trail = []; for (let x = n; x; x = x.parent ? r.nodes.get(x.parent) : null) trail.unshift(x);
    // The stages, for this area.
    // (the rungs: the Peel rule with each development's site servicing permits, once data/dc-gate.json is in)
    const DUi = root.PeelDemandUI, co = DUi && DUi.commitOpts ? DUi.commitOpts() : {};
    const rOf = Ly && Ly.rungsOf ? q => Ly.rungsOf(q, co) : null;
    const stage = rOf ? stageRows(items, rOf) : null;
    if (stage) { stage.click = true; stage.on = gStage; if (atPeel || n.kind === 'municipality') stage.dormant = dormantFor(atPeel ? App().state.muni : n.name); }
    const CAr = root.PeelCensusAreas, bc = atTop && CAr && CAr.baselineCensus ? CAr.baselineCensus() : null;
    // (the area the developments are filtered to: a municipality filter at the Peel node is not all of Peel)
    const census = bc && root.PeelAreas && root.PeelAreas.censusTotals ? root.PeelAreas.censusTotals(bc.das, { muni: App() ? App().state.muni : '', sp: App() ? App().state.sp : [], mtsa: App() ? App().state.mtsa : [] }).dwellings : 0;
    // Employment: the applications' floor area and jobs (Growth's own sums; an area counts a split site's share).
    let emp = { planned: 0, jobs: 0, permitted: 0, completed: 0, left: 0 };
    const GU = root.PeelGrowthUI, deps = GU && GU.growthDeps ? GU.growthDeps().aggregate : null;
    if (G && G.aggregateTypes && deps) for (const { p, share } of items) { const e = G.aggregateTypes([p], deps).emp; for (const k in emp) emp[k] += (e[k] || 0) * share; }
    // (units exact; people and jobs to the nearest hundred, as Home and the panels: one rounding rule)
    const m = n.m, n0 = v => fmtNum(Math.round(v)), p0 = v => fmtNum(U.roundPop ? U.roundPop(v) : Math.round(v));
    const com = stage ? stage.committed : 0, planU = stage ? (stage.rows.find(x => x.key === 'plan') || {}).units || 0 : 0;
    const f2031 = atTop && tm && tm.figures ? tm.figures.find(f => /2031/.test(f.label)) : null;
    // The next level down (municipalities, plans, precincts and sub-areas), each opening its own level, the filter:
    // a level no filter expresses (Not in a plan, Elsewhere in the plan) is listed, not opened.
    const kids = n.children.filter(c => c.m.planned >= 0.5 || c.m.jobs >= 0.5).sort((x, y) => y.m.planned - x.m.planned);
    const drillable = c => c.kind === 'municipality' || !!c.areaId;
    const kidRow = c => ({ attrs: drillable(c) ? { 'data-ws-drill': c.id, title: `Open ${c.name}` } : null, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(c.name)}</span><span class="pnl-r-year">${n0(c.m.planned)} units</span></div><small class="pnl-r-line">${esc(kind(c))} · ${n0(c.m.left)} left to build · ${p0(c.m.people)} people${c.m.jobs >= 0.5 ? ` · ${p0(c.m.jobs)} jobs` : ''}${c.children.length ? ` · ${c.children.length} ${c.kind === 'municipality' ? 'plans' : 'parts'}` : ''}</small>` });
    // At Peel, the largest plans too (straight to their level).
    const plans = atPeel ? [...r.nodes.values()].filter(x => x.kind === 'plan' && x.m.planned >= 0.5).sort((x, y) => y.m.planned - x.m.planned) : [];
    // The stages (the bars and the table's buttons filter the area's developments): pre-application to built.
    const STG = Object.fromEntries(STAGES.map(([k, l]) => [k, l]));
    const tools = `<div class="seg" role="group" aria-label="Stage"><button type="button" class="btn small${gStage === 'all' ? ' on' : ''}" data-ws-stage="all" aria-pressed="${gStage === 'all'}">All</button>${STAGES.map(([k, l]) => `<button type="button" class="btn small${gStage === k ? ' on' : ''}" data-ws-stage="${k}" aria-pressed="${gStage === k}">${esc(l.replace(' or under construction', ' / building'))}</button>`).join('')}</div>`;
    // Estimated counts in this area (at the chosen stage): how much of the pipeline is not stated on a file.
    const es = rOf ? estimateRows(items.filter(({ p }) => gStage === 'all' || stageOf(rOf(p)) === gStage), rOf) : null;
    const pipeU = stage ? (gStage === 'all' ? stage.total : (stage.rows.find(x => x.key === gStage) || {}).units || 0) : 0;
    const estRows = es && es.files.length ? [
      { kv: true, html: `<span><strong>${n0(es.units)}</strong> of ${n0(pipeU)} dwellings${pipeU > 0 ? ` (${Math.round(es.units / pipeU * 100)}%)` : ''} are estimated, in ${fmtNum(es.files.length)} ${es.files.length === 1 ? 'file' : 'files'} with no unit count stated: ${Object.entries(es.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${n0(v)} ${esc(EST_KINDS[k])}`).join(', ')}. ${es.files.some(x => Object.keys(x.kinds).length > 1) ? ' A file with more than one kind of estimate is split between them in proportion to their units.' : ''} Confirm these counts with the municipality.</span>` },
      ...es.files.map(x => ({ attrs: { 'data-ws-pick': x.p.key, 'data-ws-as': 'site', title: `Check ${x.p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}</span><span class="pnl-r-year">${n0(x.est)} est.</span></div><small class="pnl-r-line">${Object.keys(x.kinds).length > 1 ? `${esc(Object.entries(x.kinds).map(([k, v]) => `${n0(v)} ${EST_KINDS[k]}`).join(' + '))} (split in proportion)` : esc(EST_KINDS[Object.keys(x.kinds)[0]] || '')} · ${esc(STG[stageOf(rOf(x.p))] || '')} · ${esc(x.p.municipality)}${x.share < 0.99 ? ` · ${Math.round(x.share * 100)}% in this area` : ''}</small>${estFileHTML(x.p)}` })),
    ] : [];
    // Site servicing permits (js/dc-gate.js, data/dc-gate.json): the area's pipeline units by whether a
    // site servicing permit (each city's own name for it) has been applied for. The DC count's rule.
    const DG = root.PeelDcGate;
    const svcTag = q => { const g = DG && DG.rowOf(q); return g && g.bucket === 'counted' ? ` · <span class="dcg-tag">${esc(DG.termOf(q.municipality))} permit applied${g.servicingApplied ? ` ${esc(g.servicingApplied)}` : ''}</span>` : ''; };
    let svcLine = '';
    if (DG && !DG.loaded()) DG.load();
    else if (DG) {
      const sums = {};
      for (const { p, share } of items) { const g = DG.rowOf(p); if (!g) continue; const u = (p.units || 0) * share; const s = sums[g.bucket] || (sums[g.bucket] = { u: 0, n: 0 }); s.u += u; s.n++; }
      const inGate = Object.values(sums).reduce((t, s) => t + s.u, 0);
      if (inGate > 0) {
        svcLine = ` <strong>${n0((sums.counted || { u: 0 }).u)}</strong> of ${n0(inGate)} pipeline units have a site servicing permit applied for or issued.`;
      }
    }
    const empRows = emp.planned >= 1 ? [
      { kv: true, html: `<div class="pnl-kv"><span>Floor area planned</span><span>${n0(emp.planned)} m² · ≈${p0(emp.jobs)} jobs</span></div>` },
      { kv: true, html: `<div class="pnl-kv"><span>Permitted</span><span>${n0(emp.permitted)} m²</span></div>` },
      { kv: true, html: `<div class="pnl-kv"><span>Completed</span><span>${n0(emp.completed)} m²</span></div>` },
      { kv: true, html: `<div class="pnl-kv"><span>Left to build</span><span>${n0(emp.left)} m²</span></div>` },
    ] : [];
    // The area on the small map: its outline (a plan or precinct), its developments. Open the map: the map
    // view at Growth › Areas, already filtered to it (js/plan-tables.js areaIdsOf: the same developments).
    const A = App().state.areas, ring = n.areaId && A ? [...(A.secondaryPlans || []), ...(A.precincts || [])].find(x => x.id === n.areaId) : null;
    // (an area: the map zooms to its outline, with a margin)
    let bb = null;
    if (ring && ring.rings) { bb = [1e9, 1e9, -1e9, -1e9]; for (const rr of ring.rings) for (const [x, y] of rr) { bb[0] = Math.min(bb[0], x); bb[1] = Math.min(bb[1], y); bb[2] = Math.max(bb[2], x); bb[3] = Math.max(bb[3], y); } const px = (bb[2] - bb[0]) * 0.35 + 0.004, py = (bb[3] - bb[1]) * 0.35 + 0.003; bb = [bb[0] - px, bb[1] - py, bb[2] + px, bb[3] + py]; }
    const f = frame(360, 300, bb), devPts = [...dm.keys()];
    const allAreas = A ? [...(A.secondaryPlans || []), ...(A.precincts || [])] : [];
    const subRings = n.children.map(c => (c.areaId ? allAreas.find(x => x.id === c.areaId) : null)).filter(x => x && x.rings);
    const mapSvg = f ? f.svg(`${ring && ring.rings ? `<path d="${f.path(ring.rings)}" class="hm-area"/>` : ''}${subRings.map(x => `<path d="${f.path(x.rings)}" class="hm-sub" data-area="${esc(x.id)}"><title>${esc(x.name)}</title></path>`).join('')}${devPts.filter(p => p.lat != null && (p.units || 0) >= (atPeel ? 50 : 1)).map(p => { const [x, y] = f.pt(p.lng, p.lat); return `<circle cx="${x}" cy="${y}" r="${Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1)}" class="hm-dev"/>`; }).join('')}`, `${n.name}: its developments${ring ? ' and its outline' : ''}`) : '';
    // The developments, one table: grouped by the next level down, by stage or by site servicing permit
    // (each group's totals and its bar), sorted by a column; a row opens the site. Under the map, the
    // same as a treemap (js/dev-table.js); hovering a tile or a row rings it on the map.
    const DT = root.PeelDevTable, stLabel = k => (STG[k] || '').replace(' or under construction', ' / building');
    const lastOf = p => { let t = 0; for (const rc of p.records || []) for (const ev of rc.events || []) if (ev.date && +ev.date > t) t = +ev.date; return t || null; };
    const moved = Ly && Ly.movedSince ? Ly.movedSince : () => true;
    const whereOf = new Map();
    const kidDevs = kids.map(c => { const cm = nodeDevs(c); for (const [p, sh] of cm) { const w = whereOf.get(p); if (!w || sh > w[1]) whereOf.set(p, [c.name, sh]); } return [c, cm]; });
    const devRow = (p, share) => {
      const st = rOf ? stageOf(rOf(p)) : null;
      if (!st || !((p.units || 0) > 0) || (gStage !== 'all' && st !== gStage)) return null;
      const g = DG && DG.loaded() ? DG.rowOf(p) : null, pt = f && p.lat != null ? f.pt(p.lng, p.lat) : null;
      return { key: p.key, title: p.title, st, share, units: p.units * share, left: (Ph && Ph.unbuiltOf ? Ph.unbuiltOf(p) : 0) * share, ss: g ? g.bucket : null, last: lastOf(p), quiet: !moved(p),
        where: (whereOf.get(p) || [n.name])[0], hx: pt ? +pt[0].toFixed(1) : null, hy: pt ? +pt[1].toFixed(1) : null };
    };
    const allRows = items.map(({ p, share }) => devRow(p, share)).filter(Boolean);
    const kidRows = kidDevs.map(([c, cm]) => [c, [...cm].map(([p, sh]) => devRow(p, Math.min(1, sh))).filter(Boolean)]);
    const levelWord = atPeel ? 'Municipality' : n.kind === 'municipality' ? 'Plan' : 'Sub-area';
    const byOpts = [...(kids.length ? [['area', levelWord]] : []), ['stage', 'Stage'], ...(DG && DG.loaded() ? [['ss', 'Site servicing']] : []), ['none', 'None']];
    const by = byOpts.some(([k]) => k === gBy) ? gBy : byOpts[0][0];
    const SS_ORDER = ['counted', 'permitNoSvc', 'none', 'existingOnly', 'private'];
    const SS_SHORT = { counted: 'servicing permit applied for or issued', permitNoSvc: 'building permit, no servicing permit', none: 'no servicing permit yet', existingOnly: 'servicing permit for existing buildings', private: 'septic' };
    const groups = by === 'area' ? kidRows.map(([c, rows]) => ({ key: c.id, name: c.name, sub: kind(c), drill: drillable(c) ? c.id : null, rows }))
      : by === 'stage' ? STAGES.map(([k]) => ({ key: k, name: stLabel(k), rows: allRows.filter(x => x.st === k) }))
        : by === 'ss' ? [...SS_ORDER, null].map(k => ({ key: k || 'other', name: k ? DG.BUCKETS[k].label : 'Not in the servicing count', mapAttrs: k ? { 'data-dcg-filter': k, title: 'Show these developments on the map' } : null, rows: allRows.filter(x => (x.ss || null) === k) }))
          : [{ key: 'all', name: '', rows: allRows }];
    gGk = `${n.id}|${by}`;
    groups.filter(g => g.rows.length).forEach((g, i) => { const o = gGrp.get(`${gGk}|${g.key}`); g.open = o != null ? o : i < 2; g.all = gMore.has(`${gGk}|${g.key}`); });
    const table = DT ? { html: DT.tableHTML({ title: gStage === 'all' ? `Developments in ${n.name}` : `${STG[gStage]}: developments in ${n.name}`, groups, by, byOpts, sort: gSort, tools, where: by !== 'area', stages: STAGES, stageLabel: stLabel,
      ssLabel: k => (SS_SHORT[k] || ''), empty: `No developments ${gStage === 'all' ? 'with planned units' : `at ${(STG[gStage] || '').toLowerCase()}`} in ${n.name}.` }) } : null;
    const tmV = x => (gStage === 'built' ? x.units : x.left);
    const boxes = kids.length ? kidRows.map(([c, rows]) => ({ key: c.id, name: c.name, drill: drillable(c) ? c.id : null, area: c.areaId || null, tiles: rows.map(x => ({ ...x, v: tmV(x) })) }))
      : [{ key: n.id, name: n.name, area: n.areaId || null, tiles: allRows.map(x => ({ ...x, v: tmV(x) })) }];
    const treemap = DT ? DT.treemapHTML(boxes, { stageLabel: stLabel, caption: `${gStage === 'built' ? 'Homes built since 2021' : 'Homes left to build'}: ${kids.length ? `a box per ${levelWord.toLowerCase()}, ` : ''}a tile per development (colour: its stage). Hover one to find it on the map; click to open it.` }) : '';
    const answer = atPeel
      ? `${pl.answer}${f2031 ? ` About <strong>${f2031.v}</strong> units are expected by 2031 (${f2031.ctx}).` : ''}${svcLine}`
      : `<strong>${esc(n.name)}</strong> ${trail[1] && trail[1] !== n ? ` (${esc(trail[1].name)})` : ''} holds <strong>${n0(m.planned)}</strong> planned units, ${p0(m.people)} people${m.jobs >= 0.5 ? ` and ${p0(m.jobs)} jobs` : ''} at build-out; ${n0(m.left)} left to build, ${n0(com)} of them committed (a site servicing or building permit) and ${n0(planU)} more plan approved, not committed.${f2031 ? ` About <strong>${f2031.v}</strong> units are expected by 2031 (${f2031.ctx}).` : ''}${svcLine}`;
    return { id: 'growth', eyebrow: `${hostEyebrow('growth', 'areas')}${atPeel ? '' : ` <span class="page-kind">${esc(kind(n))}</span>`}`, name: atPeel ? 'How much is coming, where, and how fast?' : n.name, status: null, identity: atPeel ? esc(`${App().state.muni || 'Peel'} · ${fmtNum(plans.length)} plans with planned units`) : esc(`${fmtNum(dm.size)} developments${trail.length > 2 ? ` · in ${trail[trail.length - 2].name}` : ''}`), scen: scen(), answer,
      figures: [
        // (units and jobs at the Scenario's counting basis, as the people and the Overview: one basis)
        basis === 'all' ? { v: n0(m.planned), u: 'units', label: 'planned', ctx: `${n0(m.left)} left to build` } : { v: n0(m.counted), u: 'units', label: G.basisUnits(basis), ctx: `of ${n0(m.planned)} planned` },
        { v: n0(com), u: 'units', label: 'committed', ctx: `${Ly && Ly.throughText ? Ly.throughText(Ly.COMMIT_RUNG) : 'servicing or building permit'} · ${n0(planU)} more plan approved, not committed` },
        { v: p0(m.people), u: 'people', label: 'at build-out', ctx: 'Peel design criteria' },
        basis === 'all' ? { v: p0(emp.jobs >= 0.5 ? emp.jobs : m.jobs), u: 'jobs', label: 'employment', ctx: emp.planned >= 1 ? `${n0(emp.planned)} m² of floor area` : 'no employment floor area stated' } : { v: p0(m.jobs), u: 'jobs', label: 'employment', ctx: G.basisUnits(basis) },
      ],
      chart: stage ? stageChartHTML(stage, census) : pl.chart,
      lists: [
        table,
        atPeel ? { title: 'Plans with the most planned units', rows: plans.map(kidRow), total: plans.length, see: { 'data-ws-go': 'growth', 'data-ws-fulltable': 'growth:areas' } } : null,
        estRows.length ? { title: gStage === 'all' ? 'Estimated counts: files to confirm' : `${STG[gStage]}: estimated counts`, rows: estRows, total: estRows.length, seeN: es.files.length, see: estRows.length > 5 ? { 'data-ws-estall': '1' } : null, all: gEst } : null,
        empRows.length ? { title: 'Employment', rows: empRows, total: empRows.length } : null,
        ...(atPeel ? (pl.lists || []).filter(l => /municipality/i.test(l.title)) : []),
      ],
      map: { svg: mapSvg, attrs: { 'data-ws-go': 'growth', 'data-ws-keep': '' }, label: `Show ${n.name} on the map`, caption: ring ? `<span class="hm-key hm-key-area"></span> ${esc(n.name)} <span class="hm-key hm-key-dev"></span> its developments (sized by units)` : '<span class="hm-key hm-key-dev"></span> developments of 50+ units (sized by units) · municipal outlines', after: treemap },
      method: `${pl.method} Drill-down: Growth › Areas' plan tree (Peel, municipality, secondary plan or character area, precinct or sub-area, then "not in a plan" and "elsewhere in the plan"); every level equals the sum of the levels under it, and a site split between plans counts its share. The stages are the commitment ladder (one set of names on every screen): pre-application, in review, zoning approved, plan approved (draft or site plan, MECP D-5-1), servicing permit, building permit, under construction, then built since the 2021 census. A development's units left to build sit on the highest rung they have reached: a water or wastewater site servicing permit (filed or issued) lifts the whole development, a building permit only the units it covers, and the rest stay on its planning rung. Committed (the Peel rule, the default everywhere but the treatment plants' reserve) is Servicing permit and up; a permit can come before the plan approval. A servicing permit issued 3 or more years ago with no building permit since (possibly lapsed) commits nothing. Estimated counts: a file's units left to build that are not stated on it (found online, a pre-consultation estimate, an estimate from the wording, or counted from building permits), the hatching on the stage bars. A file with more than one kind of estimate has its estimate split between the kinds in proportion to their units. Employment: the floor area the applications state and the jobs it holds at Peel's floor space per job.${tm && atTop ? ` ${tm.method}` : ''}`,
      sources: pl.sources,
      // (the Area report of the level shown, the filter: at Peel the developments shown; at a level, its own, those in
      // or partly in it; going up a level is the top bar's trail, design §5 row 78)
      actions: [{ label: 'Area report (PDF)', attrs: atPeel ? { 'data-area-report': 'shown' } : { 'data-ws-areareport': n.id }, primary: true }, { label: 'Open the map', attrs: { 'data-ws-go': 'growth', 'data-ws-keep': '' } }] };
  }
  let gAll = false, gEst = false;
  // The developments table: grouped by (null: the next level down), sorted by, the groups opened or
  // closed and showing every row (keyed by level and grouping: gGk).
  let gBy = null, gSort = { k: 'l', dir: -1 }, gGk = '';
  const gGrp = new Map(), gMore = new Set();
  // (an area's Servicing and Capital, a workspace's sections: Home's tabs and views, the strip's, navigation phase 6)
  document.addEventListener('click', e => {
    const t = e.target.closest && e.target.closest('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall],[data-gt-by],[data-gt-sort],[data-gt-tog],[data-gt-more],[data-ws-sec],[data-ws-explore]'); if (!t || !document.getElementById('home') || !document.getElementById('home').contains(t)) return;
    e.preventDefault(); e.stopPropagation();
    // A site's section from its FSR review: back on the site's page, at that section.
    if (t.dataset.wsSec && W() && W().page && W().page() !== 'site') { siteSec = t.dataset.wsSec; siteFile = null; W().openPage('site', { keepScroll: true }); return; }
    // A step up the trail from a site, or a plan on Home's "Plans furthest behind": that level the filter, and Home
    // at Growth › Areas (the site closes first, as Home closes it).
    if (t.dataset.wsExplore) {
      if (root.DevScope && root.DevScope.current && root.DevScope.current()) root.DevScope.close();
      drillTo(t.dataset.wsExplore);
      const A = root.PeelAnalysisTabs; if (A && A.openTab) A.openTab('growth', 'areas');
      if (W() && W().openPage) W().openPage('home', { keep: true });
      return;
    }
    if (t.dataset.wsSec) { siteSec = t.dataset.wsSec; siteFile = null; }
    // The table: grouping, sorting, a group opened or closed, all its rows (the page keeps its scroll).
    else if (t.dataset.gtBy || t.dataset.gtSort || t.dataset.gtTog || t.dataset.gtMore) {
      if (t.dataset.gtBy) gBy = t.dataset.gtBy;
      else if (t.dataset.gtSort) { const k = t.dataset.gtSort; gSort = gSort.k === k ? { k, dir: -gSort.dir } : { k, dir: k === 't' ? 1 : -1 }; }
      else if (t.dataset.gtTog) gGrp.set(`${gGk}|${t.dataset.gtTog}`, t.getAttribute('aria-expanded') !== 'true');
      else { const k = `${gGk}|${t.dataset.gtMore}`; if (gMore.has(k)) gMore.delete(k); else gMore.add(k); }
      if (W() && W().renderPage) W().renderPage(false);
      return;
    }
    // (a level down: the map's filter, drillTo; the page back at its top)
    else if (t.dataset.wsDrill) { drillTo(t.dataset.wsDrill); const h = document.getElementById('home'); if (h) h.scrollTop = 0; }
    else if (t.dataset.wsStage) gStage = gStage === t.dataset.wsStage ? 'all' : t.dataset.wsStage;
    else if (t.dataset.wsDrillall) gAll = !gAll;
    else if (t.dataset.wsEstall) gEst = !gEst;
    if (W() && W().renderPage) W().renderPage(true);
  }, true);
  // Area report (PDF) at a drilled level (a municipality, plan, precinct or sub-area): its developments,
  // a straddling one whole (as the map's plan filter counts it, so the title says "in or partly in"
  // where the level has an outline), with that outline on the report's map.
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ws-areareport]'), PT = root.PeelPlanTables;
    if (!b || !document.getElementById('home') || !document.getElementById('home').contains(b) || !PT || !R()) return;
    const n = (() => { try { return PT.compute().nodes.get(b.dataset.wsAreareport); } catch (err) { return null; } })(); if (!n) return;
    const A = App() && App().state.areas, ring = n.areaId && A ? [...(A.secondaryPlans || []), ...(A.precincts || [])].find(x => x.id === n.areaId) : null;
    R().areaReport([...nodeDevs(n).keys()], n.areaId ? `Area report – ${n.name} (developments in or partly in it)` : `Area report – ${n.name}`, ring && ring.rings ? ring.rings : []);
  });
  // A treemap tile or a table row under the pointer (or focused): ringed on the page's map; a treemap
  // box: its developments and its outline.
  function mapRing(e) {
    const home = document.getElementById('home'); if (!home) return;
    for (const x of home.querySelectorAll('.hm-ring')) x.remove();
    for (const x of home.querySelectorAll('.hm-sub.on')) x.classList.remove('on');
    const t = e.target.closest && e.target.closest('[data-hx],[data-tm-box]'), svg = home.querySelector('.home-map-svg');
    if (!t || !svg || !home.contains(t)) return;
    const pts = t.dataset.hx ? [t] : [...t.querySelectorAll('[data-hx]')];
    for (const x of pts) {
      const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      c.setAttribute('class', pts.length === 1 ? 'hm-ring' : 'hm-ring hm-ring-s'); c.setAttribute('cx', x.dataset.hx); c.setAttribute('cy', x.dataset.hy); c.setAttribute('r', pts.length === 1 ? 7 : 3.5);
      svg.appendChild(c);
    }
    const a = !t.dataset.hx && t.dataset.tmArea && [...svg.querySelectorAll('.hm-sub')].find(x => x.getAttribute('data-area') === t.dataset.tmArea);
    if (a) a.classList.add('on');
  }
  document.addEventListener('mouseover', mapRing);
  document.addEventListener('focusin', mapRing);
  // A DC project open on the Capital page: its own map (dcProjectMap); a click opens it on the full map. (Never
  // built from a page's map: the allocation is the list's, js/dc-projects.js, worked out after it paints.)
  function dcProjMap() {
    const DP = root.PeelDcProjects, DI = root.PeelDcImpact, key = DP && DP.state.sel;
    const m = key && DI && DI.current && DI.current(), pr = m && m.projects.get(key); if (!pr) return null;
    return { svg: dcProjectMap(pr, m), attrs: { 'data-dcproj-map': key }, label: `Show ${pr.key} on the full map`,
      caption: `<span class="hm-key hm-key-dcp"></span> ${esc(pr.key)} <span class="hm-key hm-key-dcd-a"></span> needs it to connect <span class="hm-key hm-key-dcd-b1"></span> needs it for capacity <span class="hm-key hm-key-dcd-b2"></span> on its path, not needed <span class="hm-key hm-key-dcd-gap"></span> homes before it is built` };
  }
  // ---- Projects ------------------------------------------------------------------------------------
  function projects() {
    // DC timing (navigation phase 4: DC timing and DC projects are one list, js/dc-projects.js); a project opened
    // here shows in place, with its own map: the page's host of its scope, as the map's card is the map's.
    // (the project from js/dc-projects.js openSpec, on Home's Capital › DC timing; the stored panel is the list;
    // "Open the map" opens the project's card there)
    const DP = root.PeelDcProjects, one = DP && DP.openSpec ? DP.openSpec() : null;
    const t = one || specOf('dca:timing', areaScope); if (!t) return loading('projects', 'Loading the DC program…');
    const m = { id: 'projects', eyebrow: eyebrow('projects'), name: 'Is the capital program arriving in time for growth?', status: t.head.status, identity: t.head.identity, scen: scen(), answer: t.answer,
      figures: t.figures, chart: t.chart, lists: (t.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('projects', r)) })), folds: t.folds,
      map: dcProjMap() || { svg: worksMap(), attrs: { 'data-ws-go': 'projects' }, label: 'Open Projects on the map', caption: '2026 DC works (draft): <span class="hm-key hm-dc-wastewater"></span> wastewater <span class="hm-key hm-dc-water"></span> water' },
      method: t.method, sources: t.sources,
      actions: [{ label: 'Open the map', attrs: one ? { 'data-ws-go': 'projects', 'data-ws-dcwork': DP.state.sel } : { 'data-ws-go': 'projects' }, primary: true }, { label: 'Full table', attrs: { 'data-ws-go': 'projects', 'data-ws-fulltable': 'dca:timing' } }] };
    return t.head && t.head.back ? asSection(m, t) : m;
  }

  // ---- Forecast: when the pipeline's homes and people arrive (Home's Growth › Forecast) ---------------
  // (id: its map view, the Forecast's; What's coming opens it too; the folds By period, How sure and Since the
  // last snapshot as the reader left them, js/ledger-ui.js foldsNow. By period leads, under the answer, before
  // the figures: What's coming's own order, navigation phase 6; the map's panel keeps its order)
  function outlook(id = 'outlook') {
    const t = specOf('growth:timing', areaScope); if (!t) return loading(id, 'Timing the pipeline…');
    const LU = root.PeelLedgerUI, fs = LU && LU.foldsNow ? LU.foldsNow(t.folds) : t.folds || [], lead = (LU && LU.FOLD_ID && fs.find(f => f && f.id === LU.FOLD_ID.period)) || null;
    return { id, eyebrow: eyebrow(id), name: 'When do the homes and people arrive?', status: t.head.status, identity: t.head.identity, scen: scen(), answer: t.answer,
      lead, figures: t.figures, chart: t.chart,
      lists: (t.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap(id, r)) })),
      folds: fs.filter(f => f !== lead),
      map: { svg: devsMap((App() && App().state.filtered) || []), attrs: { 'data-ws-go': id }, label: 'Open Forecast on the map', caption: '<span class="hm-key hm-key-dev"></span> developments of 50+ units' },
      method: t.method, sources: t.sources,
      actions: [{ label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, primary: true }, { label: 'How the forecast is timed ›', attrs: { 'data-ws-page': 'forecast' } }, { label: 'Open the map', attrs: { 'data-ws-go': id } }] };
  }

  // ---- EA to construction, on the EAs page: what is being studied, and which EAs led to construction ----
  // Home's Capital › EAs (navigation phase 4's EAs page; phase 6: a view of Home): the map's Capital › EAs (the area panel, built here
  // when the map's Capital tab has not drawn it), then EA to construction (js/capital-ea-model.js eaFlowSpec,
  // the same builder as the map's fold and full table). Construction counts as the EA's outcome only when it
  // starts on or after the EA's completion; earlier work in the study area is other work, never following it.
  const CM = () => root.PeelCapitalEAModel, CE = () => root.PeelCapitalEA;
  const eaOpen = x => ({ 'data-ws-go': 'eaflow', 'data-ws-ce': `ea:${x.e.id}`, title: 'Open the EA on the map' });
  // (worked out once per data and municipality: the page rebuilds whenever a panel changes)
  let eaMemo = { k: null, f: null };
  function eaflow() {
    const ce = CE(), M = CM(), name = 'What is being studied, and which EAs have led to construction?';
    if (!ce || !M || !M.eaFlowSpec || !ce.data.loaded) return loading('eaflow', 'Loading the EAs and capital projects…');
    if (!ce.data.eas) return { id: 'eaflow', eyebrow: eyebrow('eaflow'), name, answer: '<span class="muted">The EA list did not load. Reload the page to try again.</span>' };
    // (the capital projects missing: the EAs still, and no construction counted against them)
    const muni = App() && App().state.muni, recs = ce.data.capital ? ce.data.capital.records || [] : null;
    const k = recs && [ce.data.eas.generatedAt, recs.length, muni].join('|');
    if (recs && eaMemo.k !== k) eaMemo = { k, f: M.eaFlowSpec({ eas: ce.data.eas.eas || [], capital: recs, muni, open: eaOpen }) };
    const f = recs ? eaMemo.f : { all: [], answer: '<span class="muted">The capital project list did not load, so EA to construction can’t be shown. Reload the page to try again.</span>', figures: [], chart: '', lists: [], folds: [], method: '', sources: '' };
    const SE = root.PeelSections, ea = SE && SE.areaPanel ? SE.areaPanel('dca:eas') : specOf('dca:eas', areaScope);
    const fig = (s, re) => (s && (s.figures || []).find(x => x && re.test(x.label))) || null;
    return { id: 'eaflow', eyebrow: eyebrow('eaflow'), name, status: { tone: 'stage', text: 'From public pages' },
      identity: `${esc(muni || 'Peel')}${recs ? ` · ${fmtNum(f.all.length)} Region EAs · ${fmtNum(recs.length)} capital project records` : ''}`, scen: scen(), answer: `${ea ? `${ea.answer} ` : ''}${f.answer}`,
      figures: [fig(ea, /EAs under way/), fig(ea, /open for comment/), fig(f, /construction followed/), fig(f, /no construction yet/)].filter(Boolean),
      chart: f.chart,
      lists: [...(ea ? (ea.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('eaflow', r)) })) : []), ...f.lists],
      folds: f.folds,
      map: { svg: eaMap(f.all), attrs: { 'data-ws-go': 'eaflow' }, label: 'Open EA to construction on the map', caption: `<span class="hm-key hm-key-ea-wait"></span> complete, waiting <span class="hm-key hm-key-ea-follow"></span> construction followed <span class="hm-key hm-key-ea-now"></span> under way <span class="hm-key hm-key-cons"></span> construction after an EA${muniBounds() ? ' · named: the three waiting longest (year complete)' : ''}` },
      method: `${ea && ea.method ? `${ea.method} ` : ''}${f.method}`, sources: f.sources || (ea && ea.sources) || '',
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'eaflow' }, primary: true }, { label: 'Full EA table', attrs: { 'data-ws-go': 'eaflow', 'data-ws-fulltable': 'dca:eas' } }] };
  }

  // ---- This week -----------------------------------------------------------------------------------
  function week() {
    const a = briefing(); if (!a) return waitingFor('week', 'Loading the changes…');
    const ce = root.PeelCapitalEA ? root.PeelCapitalEA.attention() : [];
    const byKey = new Map(App().state.projects.map(p => [p.key, p]));
    // (the Overview's own changes: the same files, the same municipality, the same baseline rule)
    const { moved, added } = OT().weekChanges();
    // Does it matter: a change on a development whose plant is over or tight at build-out.
    const rows = Cap() && Cap().collect ? Cap().collect() || [] : [], hot = new Set(rows.filter(r => r.kind === 'plant' && r.pctBo >= 90).map(r => r.id.replace(/^plant:/, '')));
    const plantOf = k => { const p = byKey.get(k); return p && MM() && MM().plantOfDev ? MM().plantOfDev(p) : null; };
    const flag = k => { const pl = plantOf(k); return pl && hot.has(pl) ? ` <span class="t-tight">· drains to ${esc((root.PeelSvcData && root.PeelSvcData.PLANT_SHORT[pl]) || pl)} (tight)</span>` : ''; };
    const Ph = P(), lab = k => (Ph && Ph.PHASE_BY_KEY[k] ? Ph.PHASE_BY_KEY[k].label : k);
    const devRow = (k, html) => ({ attrs: { 'data-ws-pick': k, 'data-ws-as': 'site' }, html });
    const W0 = (a.lists.find(l => l.title === 'This week') || { rows: [] }).rows;
    const pts = [...moved, ...added].map(x => byKey.get(x.key)).filter(Boolean);
    // Step 5: the watch list (the full map's Watch tab) on the page: the developments starred ☆ Watch,
    // each with its stage and whether it changed this week, then the week's capacity alerts.
    const watchKeys = (U.store && U.store.get('watch', [])) || [], changed = new Map([...moved.map(m => [m.key, `${lab(m.from)} → ${lab(m.to)}`]), ...added.map(a => [a.key, 'new this week'])]);
    const dorm = (App().state.projects && App().state.projects.dormant) || [], byKeyAll = k => byKey.get(k) || dorm.find(q => q.key === k);
    const watched = watchKeys.map(byKeyAll).filter(Boolean).sort((a, b) => (changed.has(b.key) ? 1 : 0) - (changed.has(a.key) ? 1 : 0));
    const AL = root.PeelAlerts, feed = AL && AL.last ? AL.last() : null;
    if (!feed && AL && AL.load && !week.asked) { week.asked = true; AL.load().then(() => { if (W() && W().renderPage) W().renderPage(true); }); }
    const infra = feed && AL.infraItems ? AL.infraItems(feed) : [];
    return { id: 'week', eyebrow: eyebrow('week'), name: 'What changed since the last update?', status: null, identity: a.head.identity,
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
        { title: 'Your watch list', rows: watched.length ? watched.map(p => devRow(p.key, `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year${changed.has(p.key) ? ' t-tight' : ''}">${esc(changed.get(p.key) || lab(p.phase))}</span></div><small class="pnl-r-line">${esc(p.municipality || '')} · ${fmtNum(p.units || 0)} units${changed.has(p.key) ? ' · changed this week' : ''}</small>`)) : [{ kv: true, html: '<span class="muted small">Star a development with ☆ Watch (its page or the map) to follow it here.</span>' }], total: watched.length },
        infra.length ? { title: 'Capacity alerts this week', rows: infra.map(it => ({ kv: true, html: `<small class="pnl-r-line"><strong>${esc(AL.kindLabel(it.kind))}</strong> · ${esc(it.text)}</small>` })), total: infra.length } : null,
      ],
      map: { svg: devsMap(((App() && App().state.filtered) || []), pts), attrs: { 'data-ws-go': 'week' }, label: 'Open This week on the map', caption: '<span class="hm-key hm-key-hl"></span> changed this week <span class="hm-key hm-key-dev"></span> developments of 50+ units' },
      method: 'Changes between the last two data updates: files whose stage moved, files listed for the first time (not those already completed), Region capital projects and EAs with a review period closing or a DC-matched date moved later. "On a tight plant": the file drains to a wastewater plant past its 90% trigger at build-out.',
      sources: 'The municipal application records (each update); Region of Peel capital project and EA listings.',
      actions: [{ label: 'Watch list', attrs: { 'data-ws-watch': '' }, primary: true }, { label: 'Open the map', attrs: { 'data-ws-go': 'week' } }] };
  }

  // ---- Review an FSR, with a site -------------------------------------------------------------------
  // The site's page at Servicing › FSR review, the map's own panel (js/fsr-check.js panelSpec, set by
  // js/svc-capacity.js beside Network: the one host of the form and of what an FSR should cover).
  function fsr() {
    if (!devNow()) return find('fsr');
    return site('fsr');
  }

  // ---- QA/QC › Review outlets: where each development discharges, checked and set on the map --------
  // The queue (developments relying on a DC project, largest first), the open one's outlet and the DC
  // projects on its path, and a map zoomed to it: tap a sewer or planned main to set its outlet, see what
  // that changes, then save it with its source (js/dev-outlets.js keeps the records).
  let outletFrame = null, outletWait = 0;
  const pipePts = c => { const o = []; for (let k = 0; k < c.length; k += 2) o.push([c[k], c[k + 1]]); return o; };
  function outletMap(p, cur, cand, near = []) {
    const DO = root.PeelDevOutlets, SC = root.PeelSewerCap, DIF = root.PeelDcInfra, S = MM().SEW, pipes = S.data.pipes;
    const kx = Math.cos(p.lat * Math.PI / 180), dy = 0.0065, dx = dy / kx;
    let bb = [p.lng - dx, p.lat - dy, p.lng + dx, p.lat + dy];
    if (cand) bb = [Math.min(bb[0], cand.at[0] - dx / 4), Math.min(bb[1], cand.at[1] - dy / 4), Math.max(bb[2], cand.at[0] + dx / 4), Math.max(bb[3], cand.at[1] + dy / 4)];
    const f = frame(360, 300, bb); if (!f) return '';
    outletFrame = f;
    const inBB = g => g.some(([x, y]) => x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3]), out = [];
    // (the local sewers under 300 mm first, thinner: data/sewers-local.json)
    if (SC.localLoaded && SC.localLoaded()) for (const { i } of SC.localNear(p.lng, p.lat, 1100)) { const g = SC.localCoords(i); if (inBB(g)) out.push(`<path d="${f.line(g)}" class="hm-sw hm-sw-x"/>`); }
    for (const pp of pipes) { const g = pipePts(pp[10]); if (!inBB(g)) continue; out.push(`<path d="${f.line(g)}" class="hm-sw ${pp[0] >= 900 ? 'hm-sw-l' : pp[0] >= 450 ? 'hm-sw-m' : 'hm-sw-s'}"/>`); }
    const di = App() && App().state.dcInfra;
    if (di) for (const ln of di.wastewater.lines) if (inBB(ln.g)) out.push(`<path d="${f.line(ln.g)}" class="hm-dc hm-dc-wastewater"><title>${esc(ln.p || ln.c || '')}${ln.y ? ` · ${ln.y}` : ''}</title></path>`);
    // (sewers being built: the capital projects' new sewers, js/dc-joins.js)
    const DJ = root.PeelDcJoins;
    if (DJ && DJ.capReady && DJ.capReady()) for (const ln of DJ.capLines('wastewater')) if (inBB(ln.g)) out.push(`<path d="${f.line(ln.g)}" class="hm-cap"><title>${esc(ln.n || '')} (${esc(ln.p || '')}) · ${esc(ln.s || '')}</title></path>`);
    // A route: from a pipe down the network while it is on the map (and along the planned mains first).
    const route = (k, path, cls) => {
      const parts = [];
      if (path && path.coords) parts.push(f.line(path.coords));
      for (let j = k, h = 0; j != null && j >= 0 && h < 400; j = pipes[j][3], h++) { const g = pipePts(pipes[j][10]); if (!inBB(g)) { if (h > 3) break; continue; } parts.push(f.line(g)); }
      return parts.length ? `<path d="${parts.join('')}" class="${cls}"/>` : '';
    };
    const conn = (to, cls) => (to ? `<path d="${f.line([[p.lng, p.lat], to])}" class="${cls}"/>` : '');
    if (cur) { out.push(route(cur.k, cur.path, 'hm-dvo-route')); out.push(conn(cur.at, 'hm-dvo-conn')); }
    if (cand) {
      const path = cand.kind !== 'sewer' ? DO.routeFrom(cand.kind, cand.at) : null;
      out.push(route(cand.kind === 'sewer' ? cand.k : path ? path.exit : cand.kind === 'cap' ? SC.nearestPipe(cand.at[0], cand.at[1], 600) : null, path, 'hm-dvo-alt')); out.push(conn(cand.at, 'hm-dvo-conn-alt'));
    }
    // (the nearby list's numbers, where each joins its pipe)
    near.forEach((c, i) => { if (!inBB([c.at])) return; const [x, y] = f.pt(c.at[0], c.at[1]), on = root.PeelDevOutlets.sameOutlet(cand, c); out.push(`<g class="hm-dvo-near${on ? ' on' : ''}" data-dvo="near:${i}"><circle cx="${x}" cy="${y}" r="7"/><text x="${x}" y="${y + 3.5}" text-anchor="middle">${i + 1}</text><title>${esc(c.label)}</title></g>`); });
    const [sx, sy] = f.pt(p.lng, p.lat);
    out.push(`<circle cx="${sx}" cy="${sy}" r="6" class="hm-dvo-site"><title>${esc(p.title)}</title></circle>`);
    return f.svg(out.join(''), `The sewers and planned DC mains around ${p.title}, with its route to the plant`, mapLabels(f, [{ lng: p.lng, lat: p.lat, name: shortName(p.title, 26) }]));
  }
  function outlets() {
    const DO = root.PeelDevOutlets, IMD = root.PeelDcImpact, SC = root.PeelSewerCap, Wk = W();
    if (!DO || !IMD || !SC) return loading('outlets');
    DO.load();
    if (!MM().SEW.data) { SC.loadSewers().then(() => Wk && Wk.renderPage && Wk.renderPage(true)); return loading('outlets', 'Loading the Region’s sanitary sewers…'); }
    const q = DO.queue();
    if (!q) { if (outletWait++ < 60) setTimeout(() => { if (Wk && Wk.page && Wk.page() === 'outlets') Wk.renderPage(true); }, 1500); return loading('outlets', 'Loading the DC program and the servicing model…'); }
    outletWait = 0;
    const S = DO.state, sel = DO.selected(), recs = DO.records(), nRec = [...recs.values()].filter(r => (r.sys || 'wastewater') === 'wastewater');
    const chip = r => (!r ? '<span class="pnl-chip t-stage">Automatic</span>' : r.mode === 'set' ? '<span class="pnl-chip t-tight">Set by hand</span>' : '<span class="pnl-chip t-room">Confirmed</span>');
    const rows = q.rows.map(x => ({ attrs: { 'data-dvo': 'pick-dev', 'data-dvo-key': x.p.key }, tone: sel && x.p.key === sel.p.key ? 'stage' : null,
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}<small>${esc(x.p.municipality)} · ${fmtNum(Math.round(x.units))} units${x.gate ? ` · gate ${x.gate.y} (${esc(x.gate.key)})` : ''}</small></span>${chip(x.rec)}</div>${x.gap ? `<small class="pnl-r-line t-over">first homes ≈${x.first}, before ${x.gate.y}</small>` : ''}` }));
    // (above the queue: the app's filters on are the top bar's trail, js/topbar.js "k filters")
    const filters = `<div class="dvo-filters" role="group" aria-label="Queue">${[['all', `All (${fmtNum(q.all.length)})`], ['gap', `Homes before the project (${fmtNum(q.all.filter(x => x.gap).length)})`], ['misfit', `Doesn’t fit its stage (${fmtNum(q.all.filter(DO.misfit).length)})`], ['fsr', `FSR outlet read (${fmtNum(q.all.filter(x => DO.fsrOutletOf(x.p)).length)})`], ['todo', 'Not reviewed'], ['done', 'Reviewed']].map(([k, t]) => `<button type="button" class="btn small${S.filter === k ? ' on' : ''}" data-dvo="filter:${k}" aria-pressed="${S.filter === k}">${t}</button>`).join('')}</div>`;
    let panel = '', map = '', cap = '';
    if (sel) {
      const p = sel.p, rec = DO.recordOf(p), G = SC.sewerGrowth(), k = G.devPipe.get(p), pipes = MM().SEW.data.pipes;
      const setR = DO.dcRouteFor(p), auto = !rec || rec.mode !== 'set';
      const path = setR && setR !== 'sewer' ? setR : !setR && !(p.dr && p.dr.length) && root.PeelSewerTrace ? root.PeelSewerTrace.dcSewerPath(p) : null;
      const at = path ? path.coords[0] : k != null && k >= 0 ? DO.nearestOn([p.lng, p.lat], root.PeelSewerCap.pipeCoords(pipes[k])) : null;
      const distM = at ? Math.round(root.PeelDcInfra.dcM([p.lng, p.lat], at)) : null, st = at ? streetAtPt(at[0], at[1]) : '';
      const what = rec && rec.mode === 'set' && rec.kind === 'local' ? `${rec.mm ? `${rec.mm} mm ` : ''}local sanitary sewer${rec.at && streetAtPt(rec.at[0], rec.at[1]) ? ` on ${esc(streetAtPt(rec.at[0], rec.at[1]))}` : ''}, draining to the ${k != null && k >= 0 ? `${pipes[k][0]} mm` : ''} trunk`
        : rec && rec.mode === 'set' && rec.kind === 'cap' ? `New sanitary sewer ${esc(rec.project || '')}, being built`
        : path && path.first.cap ? `Along the new sanitary sewer ${esc(path.first.p || '')} (being built)`
        : path ? `Along the planned DC main ${esc(path.first.p || path.first.c)}${path.first.d ? ` (${path.first.d} mm)` : ''}` : k != null && k >= 0 ? `${pipes[k][0]} mm sanitary sewer${st ? ` on ${esc(st)}` : ''}` : 'No sewer within reach';
      const why = rec && rec.mode === 'set' ? DO.recText(rec) : path ? `off the existing sewers: its route along the planned mains${rec ? ` · ${DO.recText(rec)}` : ' · not checked'}` : `the nearest sewer of 300 mm or more${distM != null ? `, ${fmtNum(distM)} m from the site` : ''}${rec ? ` · ${DO.recText(rec)}` : ' · not checked'}`;
      const now = sel.links.map(l => ({ key: l.key, tier: l.tier, y: l.y }));
      const TIER = { A: 'needs it to connect', B1: 'runs short: needs it for capacity', B2: 'on its path, has room' };
      const li = (x, cls = '') => `<li class="${cls}"><span>${esc(x.key)}<small>${TIER[x.tier] || ''}</small></span><b>${x.y || '–'}</b></li>`;
      let projHTML = now.length ? `<ul class="dvo-plist">${now.map(x => li(x)).join('')}</ul>` : '<p class="small muted">No DC project on its path.</p>';
      let previewHTML = '';
      if (S.cand) {
        const then = DO.projectsFor(S.cand), d = DO.diff(now, then);
        projHTML = `<ul class="dvo-plist">${[...d.add.map(x => li(x, 'add')), ...then.filter(x => !d.add.includes(x)).map(x => li(x)), ...d.drop.map(x => li(x, 'drop'))].join('')}</ul>`;
        previewHTML = `<div class="dvo-out alt"><b>${esc(S.cand.label)}</b> <span class="pnl-chip t-tight">Preview</span><small>${fmtNum(Math.round(root.PeelDcInfra.dcM([p.lng, p.lat], S.cand.at)))} m from the site</small></div>
          <p class="small">${d.add.length || d.drop.length ? `${d.add.length ? `Adds ${d.add.map(x => esc(x.key)).join(', ')}. ` : ''}${d.drop.length ? `Drops ${d.drop.map(x => esc(x.key)).join(', ')}. ` : ''}` : 'Same DC projects on its path. '}Gate year ${d.gate === d.gateNow ? `stays ${d.gate || '–'}` : `${d.gateNow || '–'} → <strong>${d.gate || '–'}</strong>`}${sel.first && d.gate ? ` · first homes ≈${sel.first}: ${sel.first < d.gate ? '<span class="t-over">before it is built</span>' : 'in time'}` : ''}.</p>`;
      }
      // What the development's FSR says (data/fsr-outlets.json: read by machine, with the report's own words).
      const fo = DO.fsrOutletOf(p), fq = fo && fo.quotes && fo.quotes[0];
      const fsrSrc = fq ? `FSR${fo.date ? ` ${fo.date}` : ''}, p. ${fq.page}` : '';
      const fsrHTML = fq ? `<h4>The FSR says</h4><blockquote class="dvo-fsr"><p>“${esc(fq.text)}”</p><footer><a href="${esc(fo.url)}#page=${fq.page}" target="_blank" rel="noopener">FSR${fo.date ? ` (${esc(fo.date)})` : ''}, p. ${fq.page} ↗</a> · read by machine: ${[fo.outlet.mm ? `${fo.outlet.mm} mm` : '', fo.outlet.street ? esc(fo.outlet.street) : '', fo.outlet.status || '', fo.outlet.project ? esc(fo.outlet.project) : ''].filter(Boolean).join(' · ') || 'no size or street'} <span class="pnl-chip t-${fo.confidence === 'high' ? 'room' : fo.confidence === 'medium' ? 'tight' : 'stage'}">${esc(fo.confidence)} confidence</span></footer></blockquote>${S.mode !== 'idle' ? '<p class="small"><button type="button" class="btn small" data-dvo="fsr-pick">Find the FSR’s outlet nearby</button></p>' : ''}` : '';
      const src = `<label class="dvo-src small">Source (what says so)<input type="text" data-dvo-src placeholder="e.g. FSR, May 2025, p. 12 · site servicing permit · confirmed with Region" value="${esc(rec && rec.src ? rec.src : fsrSrc)}"></label>`;
      const btns = S.mode === 'preview' ? `<div class="pnl-acts"><button type="button" class="btn small pnl-primary" data-dvo="save">Save outlet</button><button type="button" class="btn small" data-dvo="cancel">Cancel</button></div>`
        : S.mode === 'pick' ? `<div class="pnl-acts"><button type="button" class="btn small" data-dvo="cancel">Cancel</button></div>`
        : `<div class="pnl-acts"><button type="button" class="btn small pnl-primary" data-dvo="confirm">${rec && rec.mode === 'confirmed' ? 'Confirmed ✓' : 'Confirm outlet'}</button><button type="button" class="btn small" data-dvo="start">Set where it discharges</button><button type="button" class="btn small" data-dvo="auto"${rec ? '' : ' disabled'}>Automatic</button></div>`;
      // Pick from the list (or tap the map): the sewers and planned mains near the site.
      const near = S.mode !== 'idle' ? DO.nearby(p, { streetOf: streetAtPt, first: sel.first }) : [];
      // The checks: does the outlet fit the development's stage, timing, ground and drainage area?
      const EV_ICON = { ok: '✓', warn: '!', bad: '✕', unk: '?' };
      const evHTML = list => `<ul class="dvo-ev">${list.map(e => `<li class="ev-${e.tone}"><span aria-hidden="true">${EV_ICON[e.tone]}</span>${esc(e.text)}</li>`).join('')}</ul>`;
      const curC = DO.currentCand(p, { k, path }, streetAtPt), checks = S.cand ? DO.checksFor(p, S.cand, sel.first) : DO.checksFor(p, curC, sel.first);
      const nearHTML = S.mode === 'idle' ? '' : near.length ? `<h4>Nearby infrastructure</h4><ol class="dvo-near">${near.map((c, i) => {
        const on = DO.sameOutlet(S.cand, c), now = DO.sameOutlet(curC, c);
        return `<li><button type="button" class="dvo-near-b${on ? ' on' : ''} fit-${c.fit || 'ok'}" data-dvo="near:${i}" aria-pressed="${on}"><span class="dvo-near-n">${i + 1}</span><span>${esc(c.label)}<small>${esc(c.status || '')}${c.kind === 'sewer' && c.mm < 300 ? ' · local sewer' : ''}${now ? ' · <b>its outlet now</b>' : ''}</small>${(() => { const e = (c.checks || []).find(x => x.tone === 'bad') || (c.checks || []).find(x => x.tone === 'warn'); return e ? `<small class="ev-${e.tone}">${EV_ICON[e.tone]} ${esc(e.text)}</small>` : ''; })()}</span><b class="dvo-near-m">${fmtNum(Math.round(c.m))} m</b></button></li>`;
      }).join('')}</ol>` : '<p class="small muted">No sewer or planned main within 400 m: tap the map.</p>';
      panel = `<section class="dvo-panel" data-psec="list"><div class="pnl-list-h"><h3>${esc(p.title)}</h3><button type="button" class="btn small link" data-pnl-dev="${esc(p.key)}">Open the development ›</button></div>
        <p class="small muted">${esc(p.municipality)} · ${fmtNum(Math.round(sel.units))} units${sel.first ? ` · first homes ≈${sel.first}` : ''}</p>
        <h4>Discharges to</h4>${S.cand ? '' : `<div class="dvo-out"><b>${what}</b> ${chip(rec)}<small>${why}</small></div>`}${previewHTML}${checks.length ? `<h4>Does it fit?${S.cand ? ' (the new outlet)' : ''}</h4>${evHTML(checks)}` : ''}${fsrHTML}${nearHTML}
        <h4>DC projects on its path${S.cand ? ' (with the new outlet)' : ''}</h4>${projHTML}
        ${sel.gate && !S.cand ? `<p class="small">Gate year ${sel.gate.y} (${esc(sel.gate.key)})${sel.first ? ` · first homes ≈${sel.first}: ${sel.gap ? '<span class="t-over">before it is built</span>' : 'in time'}` : ''}.</p>` : ''}
        ${S.mode !== 'pick' ? src : ''}${btns}
        ${DO.edits() ? `<p class="small"><button type="button" class="btn small link" data-dvo="export">Export ${fmtNum(DO.edits())} edit${DO.edits() === 1 ? '' : 's'} (dev-outlets.json)</button> <span class="muted">to commit, so everyone sees them</span></p>` : ''}</section>`;
      map = `<div class="dvo-map${S.mode === 'pick' ? ' picking' : ''}" data-dvo-map>${S.mode === 'pick' ? '<p class="dvo-banner small" role="status">Pick from the list, or tap the sewer (existing, being built or planned) it discharges to (Esc to cancel)</p>' : ''}${outletMap(p, { k, path, at }, S.cand, near)}</div>`;
      cap = `<span class="hm-key hm-key-dvo-route"></span> its route now ${S.cand ? '<span class="hm-key hm-key-dvo-alt"></span> the new route ' : ''}<span class="hm-key hm-key-pipe"></span> sanitary sewers (thicker: larger; thinnest: local, under 300 mm) <span class="hm-key hm-dc-wastewater"></span> planned DC mains <span class="hm-key hm-key-cap"></span> sewers being built${near.length ? ' · numbers: the nearby list' : ''}`;
    }
    return { id: 'outlets', eyebrow: eyebrow('outlets'), name: 'Where does each development discharge?',
      status: nRec.length ? { tone: 'stage', text: `${fmtNum(nRec.length)} reviewed` } : null,
      identity: `Peel · ${fmtNum(q.all.length)} developments rely on a DC wastewater project · edits are kept in this browser until exported`,
      answer: sel ? `Check where each development's sewage goes. The app sends it to the nearest sewer of 300 mm or more (or, off the existing sewers, along the planned mains). Confirm it, or tap the right sewer on the map: the DC projects, timing and sewer loads follow.` : 'No development relies on a DC project.',
      figures: [
        { v: fmtNum(q.all.length), u: '', label: 'to review', ctx: 'rely on a DC wastewater project' },
        { v: fmtNum(nRec.filter(r => r.mode === 'confirmed').length), u: '', label: 'confirmed', ctx: 'the automatic outlet, checked' },
        { v: fmtNum(nRec.filter(r => r.mode === 'set').length), u: '', label: 'set by hand', ctx: 'a different sewer or planned main' },
        { v: fmtNum(q.all.filter(x => x.gap).length), u: '', label: 'homes before the project', ctx: 'worth checking first', tone: 'over' },
      ],
      lists: [{ html: panel }, { html: filters }, { title: 'To review, largest first', rows, total: rows.length, all: S.all, see: { 'data-dvo': 'all' } }],
      map: sel ? { title: 'Where it discharges', html: map, caption: cap } : null,
      method: 'A development discharges to the nearest sanitary sewer of 300 mm or more (Region sewer records), or, off the existing sewers, along the planned DC mains to an existing sewer. A reviewed outlet replaces that: confirmed (checked, unchanged) or set by hand (a sewer picked from the nearby list: existing sewers (trunks of 300 mm+, and local sewers under 300 mm from data/sewers-local.json), sewers being built (the Region’s capital projects, tendered or further) and planned DC mains within 400 m, or tapped on the map; kept as its point and size so it survives a data rebuild). The sewer loads, the trace and the DC projects allocation (js/dc-impact.js) follow it. Each outlet is checked against the development: its stage (built: a sewer in service; a building or site servicing permit: in service or being built, not a DC main still to tender; earlier: anything), in service by first homes (the whole route, the DC mains it needs downstream included), a sewer installed after the development was built (or with it: likely its own), gravity (the lidar ground at the site, 1.5 m down and 0.5 % fall, over the sewer’s invert; datum shift 0.41 m) and the drainage area. The checks flag, never block. Edits stay in this browser until exported and committed as data/dev-outlets.json.',
      sources: 'Region of Peel sanitary sewers; 2026 DC capital maps (draft); the municipal application records; reviewers’ sources (FSRs, site servicing permits).',
      actions: [{ label: DO.edits() ? `Export ${fmtNum(DO.edits())} edit${DO.edits() === 1 ? '' : 's'}` : 'Export (nothing yet)', attrs: { 'data-dvo': 'export' }, primary: !!DO.edits() }] };
  }
  // A tap on the outlet map while picking: back to the ground, snapped within 14 px.
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const svg = e.target.closest && e.target.closest('[data-dvo-map] svg'), DO = root.PeelDevOutlets;
    if (!svg || !DO || (DO.state.mode !== 'pick' && DO.state.mode !== 'preview') || e.target.closest('[data-dvo]') || !outletFrame || !svg.getScreenCTM) return;
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.getScreenCTM().inverse()), [lng, lat] = outletFrame.inv(loc.x, loc.y);
    DO.pickAt(lng, lat, Math.max(15, 14 * 111320 / outletFrame.sc));
  });

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
      figures: [s.figures[0], { v: fmt1(km), u: 'km', label: 'length on the list', ctx: `${fmtNum(runs.length)} sewer runs` }, { v: fmtNum(worst), u: 'sewer runs', label: 'oldest and most loaded', ctx: `${LIKE[3]} (or older + moderate risk) and ${CONS[3]}: the grid’s top-right cell`, tone: worst ? 'over' : null }, s.figures[2]],
      mid: `<section class="page-grid" data-psec="grid"><h3 class="pnl-chart-t">Old sewer runs by age (likelihood) and the homes they carry (consequence) <span class="pnl-chart-u">(sewer runs, km)</span></h3>${grid}<p class="small muted">Likelihood: install age (a moderate risk rating one band up). Consequence: planned units the run carries at build-out. Condition grades from inspection are not in the open data.</p></section>`,
      lists: [
        { ...s.lists[0], rows: s.lists[0].rows.map(r => toMap('pipes', r)), see: { 'data-ws-go': 'pipes' } },
        { title: 'By plant', rows: [...byPlant.entries()].sort((a, b) => b[1].km - a[1].km).map(([k, x]) => ({ kv: true, html: `<div class="pnl-kv"><span>${esc((SD && SD.PLANT_SHORT && SD.PLANT_SHORT[k]) || k)}</span><span>${fmtNum(x.n)} sewer runs · ${fmt1(x.km)} km</span></div>` })), total: byPlant.size },
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
    return { id: 'study', eyebrow: eyebrow('study'), name: 'What does this area add, and what servicing does it lean on?', scen: scen(), draw: false,
      answer: has ? `The drawn area holds <strong>${fmtNum(sel.length)}</strong> development${sel.length === 1 ? '' : 's'}. Its growth and the servicing it needs are below.` : 'Draw an area on the map: press <strong>Draw an area</strong>, then drag around the developments.',
      top: `<section class="page-livemap" data-psec="livemap"><div class="page-map-slot" id="page-map-slot"></div><div class="pnl-acts"><button type="button" class="btn small pnl-primary" data-ws-draw>${has ? 'Add an area' : 'Draw an area'}</button>${has ? '<button type="button" class="btn small" data-ws-clear>Clear</button>' : ''}</div></section>`,
      mid: has && AS ? `<section class="page-sel" data-psec="selection">${AS.selectionSummaryHTML(sel)}</section>` : '',
      method: 'The developments shown on the map inside the drawn area(s): units by type and stage, people and jobs at Peel design criteria, and the water and wastewater demand they add (the same estimate as each development’s panel).',
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'study' }, primary: !has }, has ? { label: 'Area report (PDF)', attrs: { 'data-area-report': 'sel' }, primary: true } : null] };
  }

  // Reference pages (not workspaces): How it works and its guides (js/reference.js; How approvals work
  // is js/approvals-guide.js, wrapped as a guide), the Glossary (js/glossary.js), Help (js/tips.js).
  const ref = id => () => (root.PeelReference ? root.PeelReference.page(id) : id === 'approvals' && root.PeelApprovalsGuide ? root.PeelApprovalsGuide.page() : loading(id, 'Loading…'));
  const [guides, roles, approvals, flows, network, capacity, fsrguide, capguide, targets, forecast] = ['guides', 'roles', 'approvals', 'flows', 'network', 'capacity', 'fsrguide', 'capguide', 'targets', 'forecast'].map(ref);
  const glossary = () => (root.PeelGlossary ? root.PeelGlossary.page() : loading('glossary', 'Loading…'));
  // How the app decides (js/logic.js): the data rules, gates and back-end decisions, read from the code.
  const logic = () => (root.PeelLogic ? root.PeelLogic.page() : loading('logic', 'Loading…'));
  const help = () => (root.PeelTips && root.PeelTips.helpPage ? root.PeelTips.helpPage() : loading('help', 'Loading…'));
  // Data sources (Reference, step 5): the map's Records › Sources panel on a page (the old Data tab,
  // map-only until now); since navigation phase 6 Home's Records › Sources (Data checks its other view).
  function data() {
    const SE = root.PeelSections, s = SE ? SE.areaPanel('records:sources') : null;
    if (!s) return loading('data', 'Loading the sources…');
    const h = s.head || {};
    return { id: 'data', eyebrow: hostEyebrow('records', 'sources'), name: h.name || 'Where does the data come from?', status: h.status, identity: h.identity, answer: s.answer, figures: s.figures, chart: s.chart,
      lists: s.lists || [], folds: s.folds, method: s.method, sources: s.sources,
      actions: [{ label: 'Refresh and manage sources', attrs: { 'data-ws-full': '', 'data-at': 'records:sources' }, primary: true }] };
  }
  // Labs › Sewer designer: its page is the tool's own (js/sewer-designer.js page()).
  const sewer = () => (root.PeelSewerDesigner && root.PeelSewerDesigner.page ? root.PeelSewerDesigner.page() : { id: 'sewer', eyebrow: 'Labs', name: 'Sewer designer', answer: '<span class="muted">Loading…</span>' });
  // (What's coming, navigation phase 3's page of its own: since phase 6 Home's Growth › Forecast, opened with
  // its By period fold, js/workspaces.js hostOf; the Forecast's question names it)
  const BUILD = { home, tight, site, growth, outlook, projects, eaflow, week, fsr, pipes, outlets, study, sewer, guides, roles, approvals, flows, network, capacity, fsrguide, capguide, targets, forecast, glossary, logic, help, data };
  // Each workspace's guide (How it works), a button in its footer.
  const GUIDE_OF = { site: 'flows', tight: 'capacity', growth: 'targets', fsr: 'fsrguide', projects: 'capguide', eaflow: 'capguide', pipes: 'network' };
  // A page's header count opens its workspace's full table (as the map panels' do).
  const FULL_OF = { home: 'tight', tight: 'tight', projects: 'projects', pipes: 'pipes' };
  // id: a page builder's, or a page host's panel view ('svc:network': panelView), which takes its map view's
  // guide, full table and figures' map view (its ws, the tab and view kept).
  function build(id) {
    const SE = root.PeelSections, pv = String(id).includes(':'), v = pv && SE && SE.VIEWS ? SE.VIEWS.area[id] || {} : null, wsId = pv ? (v && v.ws) || null : id;
    const keep = pv ? { 'data-ws-keep': '' } : {};
    const m = pv ? panelView(id) : (BUILD[id] || home)(), RF = root.PeelReference, g = RF && GUIDE_OF[wsId] && RF.GUIDES.find(x => x[0] === GUIDE_OF[wsId]);
    if (m.status && !m.status.attrs && m.status.tone !== 'stage' && FULL_OF[wsId]) m.status = { ...m.status, attrs: { 'data-ws-go': FULL_OF[wsId], 'data-ws-fulltable': '1', ...keep }, title: 'Open the full table' };
    // A figure taken from a map panel opens the same thing from the page: the workspace's map, at it.
    const ws = W() && W().BY_ID && W().BY_ID[wsId] ? wsId : null;
    const onPage = a => { if (!a || !ws) return a; if (a['data-full-table'] != null) return { 'data-ws-go': ws, 'data-ws-fulltable': '1', ...keep }; if (a['data-ss']) return { 'data-ws-go': ws, 'data-ws-ss': a['data-ss'], ...keep }; if (a['data-ce-open']) return { 'data-ws-go': ws, 'data-ws-ce': a['data-ce-open'], ...keep }; return a; };
    if (m.figures && ws) m.figures = m.figures.map(f => (f && f.attrs && !f.attrs['data-ws-go'] && !f.attrs['data-ws-page'] ? { ...f, attrs: onPage(f.attrs) } : f));
    if (g && m.actions) m.actions = [...m.actions, { label: `${g[1]} ›`, attrs: { 'data-ws-page': g[0] }, title: `How it works: ${g[2]}` }];
    // Reference (step 5): Help, How it works (and each guide) and the Glossary share a bar; its Data sources and
    // Data checks are Home's Records tab (navigation phase 6).
    const REFW = { help: 'help', guides: 'guides', glossary: 'glossary', logic: 'logic' }, R = W() && W().REF;
    const refOn = REFW[id] || (R && R[id] && R[id].guide ? 'guides' : null);
    if (refOn && root.PeelSections) m.top = `${wsBar('reference', refOn)}${m.top || ''}`;
    return m;
  }
  // ---- The page host (navigation phase 6, design §3.1 rule 1, §3.3: header · tab strip · chips · answer) ----
  // Home at an area: under its header the full map's five tabs and the open tab's views, the view the map's
  // own tab state names (js/analysis-tabs.js viewKey), so the page and the full map show the same tab and view
  // and Open the map / ← Page keep it. Each view is its page builder or the map's panel (js/sections.js VIEWS).
  // Servicing and Capital say "loading" on the strip until their data lands; one picked before then is lit, the
  // page says it is loading and fills in place (never Overview: AT's held tab, wantedTab).
  function host(scope = 'area') {
    const A = root.PeelAnalysisTabs, SE = root.PeelSections, Wk = W();
    const VW = (SE && SE.VIEWS && SE.VIEWS[scope]) || {}, chipsOf = t => (A && A.chipsAt ? A.chipsAt(t, scope) : []);
    let key = A && A.viewKey ? A.viewKey() : 'overview:';
    // (a view the scope hides, as Records › Files at an area: the tab's first one, as the map shows it)
    if (!VW[key]) { const t = key.split(':')[0], c = chipsOf(t)[0]; key = VW[`${t}:${c || ''}`] ? `${t}:${c || ''}` : 'overview:'; }
    const [tab, sub] = key.split(':'), v = VW[key] || { page: 'home' }, id = v.page || key;
    const busy = t => (t === 'svc' || t === 'dca') && !!A && !!A.tabReady && !A.tabReady(t);
    const name = t => (Wk && Wk.TAB_NAME && Wk.TAB_NAME[t]) || t;
    // (Capital › EAs waits for neither the servicing model nor the DC program: eaflow() waits for the EA lists itself)
    const held = busy(tab) && key !== 'dca:eas';
    const m = held ? { ...loading(id, `Loading ${viewName(key)} (the servicing model and the DC program)…`), pending: true, waitTab: true } : build(id);
    if (busy(tab)) m.waitTab = true;   // (the strip's "loading" clears when the tab is ready, even with nothing else changed)
    // (Servicing and Capital below Peel: the map's Peel-wide note, once and in its words, js/svc-scope.js, on the
    // views that are Peel-wide (not Capital › EAs or Projects, the area's own); its facilities are data-ss links,
    // which open their scope on the full map)
    const SS = root.PeelSvcScope, wide = (tab === 'svc' || tab === 'dca') && !busy(tab) && SS && SS.peelWideText ? SS.peelWideText(tab, sub) : '';
    if (wide) m.top = `<p class="scope-note small page-wide" role="note" data-psec="wide">${wide}</p>${m.top || ''}`;
    m.tabs = tabsHTML({ tabs: ((A && A.TAB_KEYS) || Object.keys(TAB_INFO)).map(t => ({ key: t, label: name(t), info: TAB_INFO[t], busy: busy(t), trail: t === 'records' })), on: tab, chips: chipsOf(tab).map(c => ({ sub: c, label: Wk && Wk.chipName ? Wk.chipName(tab, c) : c })), sub });
    return m;
  }
  // Where a search pick on a page lands (js/workspaces.js routePick): a site's section (and a file to
  // mark); a plan or MTSA the filter (drillTo). (Capital › DC timing at a project: Home's view, js/dc-projects.js select)
  const siteAt = (key, sec, file) => { siteSec = sec || 'summary'; siteSecDev = key; siteFile = file || null; siteFileShown = false; };
  // A level of the plan tree as the map's filter (navigation phase 6, owner decision 10): 'peel' all of Peel,
  // 'm:<name>' the municipality, 'a:<id>' a plan, sub-area or precinct in its municipality; the other place filters
  // (MTSA, zone, block) go, the rest stay. A development partly in it is in it (js/plan-tables.js areaIdsOf); its
  // totals count only its share (js/plan-rollup.js within). The tree need not be worked out: the page lands at the
  // level once it is (growth()). Growth › Areas' stage, estimates and "all rows" go back to their start.
  function drillTo(id) {
    const A = App(), S = A && A.state; if (!S) return;
    // (a level no filter expresses: Elsewhere in a plan its plan, Not in a plan its municipality)
    const k0 = String(id || 'peel'), k = k0.startsWith('r:') ? `a:${k0.slice(2)}` : k0.startsWith('n:') ? `m:${k0.slice(2)}` : k0;
    const a = k.startsWith('a:') ? k.slice(2) : null, PA = root.PeelPlanAreas, PT = root.PeelPlanTables, SD = root.PeelSvcData;
    const muniOf = x => { const z = (PA && PA.areaById && PA.areaById.get(x)) || (PT && PT.areas ? (() => { try { return PT.areas().find(y => y.id === x); } catch (e) { return null; } })() : null); return (z && z.municipality) || ''; };
    const svcOff = !!((S.pz && S.pz.length) || (S.dr && S.dr.length));
    S.muni = a ? muniOf(a) : k.startsWith('m:') ? k.slice(2) : '';
    S.sp = a ? [a] : []; S.mtsa = []; S.pz = []; S.dr = [];
    if (root.PeelSearchFilter && root.PeelSearchFilter.renderMuniChips) root.PeelSearchFilter.renderMuniChips();
    if (PA && PA.renderAreaSelects) PA.renderAreaSelects();
    if (PA && PA.showArea) PA.showArea();
    if (PA && PA.renderPlanAreas) PA.renderPlanAreas();
    if (svcOff && SD && SD.renderSvcSelects) { SD.renderSvcSelects(); if (SD.showSvcArea) SD.showSvcArea(); }
    if (A.applyFilters) A.applyFilters();
    gStage = 'all'; gAll = false; gEst = false;
  }
  Object.assign(api, { build, host, tilesSVG, tileCredit, tilesOk, eaMap, capacityMap, devsMap, worksMap, pipesMap, siteMap, frame, siteAt, drillTo });
  root.PeelWsPages = api;
})(typeof window !== 'undefined' ? window : globalThis);
