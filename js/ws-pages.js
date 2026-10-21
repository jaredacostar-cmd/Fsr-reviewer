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
  //          total, see: attrs }], map: { svg, caption, attrs, html, after (under the map: a treemap) }, folds: [{ title, html, open }],
  //          method, sources, actions: [{ label, attrs, primary }], note, chip, scen, top (before the answer:
  //          a search box, a live map), mid (after the figures: a form, a grid, a summary) }
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
  // One figure card (a page's figures, Home's groups).
  // (its "?" opens how the figure is worked out, js/how.js; m: the page, or Home's group)
  function figHTML(f, gl = x => x, m = null, i = 0) {
    return `<div class="pnl-fig${f.tone ? ` t-${esc(f.tone)}` : ''}"${f.attrs ? `${attrs(f.attrs)} role="button" tabindex="0"` : ''}><b>${f.v}</b>${f.u ? `<span class="pnl-u">${esc(f.u)}</span>` : ''}<span class="pnl-l">${gl(esc(f.label))}</span>${f.ctx ? `<small>${gl(f.ctx)}</small>` : ''}${m && root.PeelHow ? root.PeelHow.button(f, m, i) : ''}</div>`;
  }
  function pageHTML(m, note) {
    // (a zero is never coloured; n/a is never a figure)
    const figs = (m.figures || []).filter(f => f && !/^(n\/a|–|-)$/i.test(String(f.v))).slice(0, 4).map(f => (String(f.v) === '0' && f.tone ? { ...f, tone: null } : f));
    const out = [];
    // (the scenario chip sits in the title row, beside the status: one row less above the answer)
    out.push(`<header class="home-h" data-psec="header"><p class="page-eyebrow small">${m.eyebrow || ''}</p><h1>${esc(m.name || '')}</h1>${chipHTML(m.status)}${m.badge || ''}${m.scen ? `<div class="pnl-scen" data-psec="scenario">${m.scen}</div>` : ''}${m.identity ? `<p class="small muted page-id">${m.identity}</p>` : ''}${m.extra || ''}</header>`);
    if (m.filters) out.push(m.filters);
    if (m.top) out.push(m.top);
    // Bundle 5: terms underlined in the answer and figures (js/glossary.js).
    const seen = new Set(), gl = h => (root.PeelGlossary && m.id !== 'glossary' ? root.PeelGlossary.mark(h, seen) : h);
    out.push(`<p class="home-answer" data-psec="answer">${gl(m.answer || '')}</p>`);
    for (const c of m.caveats || []) out.push(`<p class="home-caveat small" role="note" data-psec="caveat">⚠ ${esc(c.text)}${c.at ? ` <button type="button" class="btn small link" data-ws-full data-at="${esc(c.at)}">Review →</button>` : ''}</p>`);
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
  // nm: the units of developments that haven't moved since 2020 (js/layers.js movedSince), per stage;
  // existing: units completed before the 2021 Census (in the census, so not a stage here) — the bars
  // plus existing are the headline total.
  // sspOf(p): the development has a site servicing permit (water / wastewater) applied for or issued
  // (js/dc-gate.js): its units in each stage are also counted in ssp, drawn as a band on the bar. The
  // stages themselves stay on building permits.
  function stageRows(devs, ofDev, movedOf = (root.PeelLayers && root.PeelLayers.movedSince) || (() => true), sspOf = null) {
    const ssp = { anticipated: 0, proposed: 0, approved: 0, permitted: 0, built: 0 };
    const u = { anticipated: 0, proposed: 0, approved: 0, permitted: 0, built: 0 }, est = { anticipated: 0, proposed: 0, approved: 0, permitted: 0, built: 0 }, nm = { anticipated: 0, proposed: 0, approved: 0, permitted: 0, built: 0 };
    let existing = 0, nmExisting = 0;
    for (const it of devs) {
      // (an area's developments come as { p, share }: a site split between plans counts its share)
      const p = it && it.p ? it.p : it, sh = it && it.p ? it.share : 1;
      const L = ofDev(p); if (!L || !L.layer) continue;
      u.built += (L.parts.built || 0) * sh; u.proposed += (L.parts.proposed || 0) * sh; u.anticipated += (L.parts.anticipated || 0) * sh;
      const c = L.parts.committed || 0, noPermit = Math.min(c, Math.max(0, L.toPermit || 0));
      u.approved += noPermit * sh; u.permitted += (c - noPermit) * sh;
      existing += (L.parts.existing || 0) * sh;
      if (sspOf && sspOf(p)) {
        ssp.built += (L.parts.built || 0) * sh; ssp.proposed += (L.parts.proposed || 0) * sh; ssp.anticipated += (L.parts.anticipated || 0) * sh;
        ssp.approved += noPermit * sh; ssp.permitted += (c - noPermit) * sh;
      }
      if (!movedOf(p)) {
        nm.built += (L.parts.built || 0) * sh; nm.proposed += (L.parts.proposed || 0) * sh; nm.anticipated += (L.parts.anticipated || 0) * sh;
        nm.approved += noPermit * sh; nm.permitted += (c - noPermit) * sh; nmExisting += (L.parts.existing || 0) * sh;
      }
      if (L.estimated > 0) { const k = L.layer === 'committed' ? (noPermit >= c - noPermit ? 'approved' : 'permitted') : L.layer; if (k in est) est[k] += sh * Math.min(L.estimated, k === 'approved' ? noPermit : k === 'permitted' ? c - noPermit : L.parts[k] || 0); }
    }
    const total = Object.values(u).reduce((a, b) => a + b, 0);
    const notMoved = Object.values(nm).reduce((a, b) => a + b, 0);
    return { rows: STAGES.map(([key, label, note]) => ({ key, label, note, units: u[key], est: est[key], nm: nm[key], ssp: ssp[key], pct: total > 0 ? u[key] / total * 100 : 0 })), total, existing, notMoved, nmExisting, ssp: sspOf ? Object.values(ssp).reduce((a, b) => a + b, 0) : null };
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
  function stageChartHTML(st, census) {
    const max = Math.max(1, ...st.rows.map(r => r.units)), cls = { anticipated: 'ly-anticipated', proposed: 'ly-proposed', approved: 'stg-approved', permitted: 'stg-permitted', built: 'stg-built' };
    return `<div class="stg" role="table" aria-label="The pipeline by stage, in the order a file moves">
      <p class="stg-h small pnl-chart-t"><strong>The pipeline by stage, in the order a file moves</strong> <span class="pnl-chart-u">(dwellings)</span></p>
      ${st.rows.map(r => `<div class="stg-row${st.on === r.key ? ' on' : ''}" role="row" title="${esc(r.label)}: ${esc(r.note)}"${st.click && r.units >= 0.5 ? ` data-ws-stage="${r.key}" tabindex="0"` : ''}><span class="stg-l" role="cell">${esc(r.label)}${st.ssp != null && r.ssp >= 0.5 && r.key !== 'built' ? `<small class="stg-ssp-t">${fmtNum(Math.round(r.ssp))} with a site servicing permit</small>` : ''}</span><span class="stg-track" role="cell"><i class="stg-fill ${cls[r.key]}" style="width:${(r.units / max * 100).toFixed(1)}%"></i>${st.ssp != null && r.ssp >= 0.5 && r.key !== 'built' ? `<i class="stg-ssp" style="width:${(Math.min(r.ssp, r.units) / max * 100).toFixed(1)}%" title="${fmtNum(Math.round(r.ssp))} of ${fmtNum(Math.round(r.units))} in developments with a site servicing permit applied for or issued"></i>` : ''}${r.est > 0 ? `<i class="stg-est" style="width:${(Math.min(r.est, r.units) / max * 100).toFixed(1)}%"></i>` : ''}${r.nm >= 0.5 ? `<i class="stg-nm" style="left:${(Math.max(0, r.units - r.nm) / max * 100).toFixed(1)}%;width:${(Math.min(r.nm, r.units) / max * 100).toFixed(1)}%" title="${fmtNum(Math.round(r.nm))} haven\u2019t moved since 2020"></i>` : ''}</span><b class="stg-v" role="cell">${fmtNum(Math.round(r.units))}</b><span class="stg-p muted" role="cell">${r.units > 0 && r.pct < 0.5 ? '&lt;1' : Math.round(r.pct)}%</span></div>`).join('')}
      <p class="stg-foot small muted">${fmtNum(Math.round(st.total))} dwellings in the pipeline${census > 0 ? ` would add about <strong>${Math.round(st.total / census * 100)}%</strong> to the ${fmtNum(Math.round(census))} dwellings on the system (2021 census)` : ''}.${st.existing >= 0.5 ? ` With the ${fmtNum(Math.round(st.existing))} completed before the 2021 Census (already in it), <strong>${fmtNum(Math.round(st.total + st.existing))}</strong> in all.` : ''}${st.rows.some(r => r.est > 0) ? ' Hatched: counts estimated from the application (no unit count stated).' : ''}${st.ssp != null && st.ssp >= 0.5 ? ` <span class="stg-ssp-key" aria-hidden="true"></span> Green band: units in developments with a site servicing permit (water or wastewater) applied for or issued; the stage is still set by the building permit.` : ''}${dormantNote(st.dormant)}${st.notMoved >= 0.5 ? ` <span class="stg-nm-key" aria-hidden="true"></span> Outlined: ${fmtNum(Math.round(st.notMoved + (st.nmExisting || 0)))} in developments that haven\u2019t moved since 2020.` : ''}</p>
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

  const api = { pageHTML, sectionsOf, briefing, listHTML, reserveRows, pipeGrid, likeOf, consOf, LIKE, CONS, approvedNotBuilt, COVERAGE, STAGES, stageRows, stageOf, stageChartHTML, EST_KINDS, estimateRows };
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
    return { sv, base, pt, path, line, Wd, H, svg, bearing: bearing(), peel: !bounds };
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
    if (!hs.length) for (const p of named) out.push(dotAt(p, Math.max(1.4, Math.min(6, Math.sqrt(p.units) / 8)).toFixed(1), 'hm-dev hm-dev-top', `<title>${esc(p.title)}: ${fmtNum(p.units)} units</title>`));
    return f.svg(out.join(''), 'Peel’s wastewater blocks with the developments on the map', mapLabels(f, named.slice(0, 3).map(p => ({ lng: p.lng, lat: p.lat, name: hs.length ? p.title : `${shortName(p.title)} (${fmtNum(p.units)})` }))));
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
  // The first treatment plant (wastewater or water) to reach its 90% expansion trigger: one rule for
  // Home, Servicing capacity and the Overview's headline.
  function firstTrigger(rows) {
    const yr = r => (r.limit.y === 'today' ? 0 : r.limit.y);
    return rows.filter(r => (r.kind === 'plant' || r.kind === 'wplant') && r.limit && r.limit.y != null).sort((x, y) => yr(x) - yr(y) || y.pctBo - x.pctBo)[0] || null;
  }
  function homeFigures(rows, ready, week) {
    // Capacity and the DC program are Region-wide (a plant serves more than one municipality): with a
    // municipality picked, those figures say so.
    const peelWide = App() && App().state.muni ? 'Peel-wide · ' : '';
    const over = rows.filter(r => r.pctBo >= 100);
    const trig = firstTrigger(rows);
    // (the DC panel builds when Capital opens; until then the same analysis, cached, gives the count)
    const dc = specOf('dca:timing', areaScope);
    let late = dc && (dc.figures || []).find(f => f && f.label === 'late');
    if (!late && root.PeelDcCost && root.PeelDcCost.dcAnalysis && App() && App().state.svcModel && App().state.dcInfra && MM() && MM().SEW && MM().SEW.data) { try { const R = root.PeelDcCost.dcAnalysis(); late = { v: R.list.filter(r => r.rec === 'advance').length }; } catch (e) { late = null; } }
    const nW = week && week.rows ? week.rows.length : 0;
    const go = (page, title) => ({ 'data-ws-page': page, title });
    return [
      ready ? { v: fmtNum(over.length), u: 'over', label: 'over capacity at build-out', ctx: `${peelWide}of ${fmtNum(rows.length)} facilities · Servicing capacity →`, tone: over.length ? 'over' : null, attrs: go('tight', 'Servicing capacity') } : { v: '…', u: '', label: 'over capacity at build-out', ctx: 'checking servicing capacity', attrs: go('tight', 'Servicing capacity') },
      trig ? { v: trig.limit.y === 'today' ? 'Now' : `≈${trig.limit.y}`, u: '', label: 'first 90% trigger', ctx: `${peelWide}${esc(trig.name)} reaches its 90% expansion trigger · Servicing capacity →`, tone: 'tight', attrs: go('tight', 'Servicing capacity') } : null,
      late ? { v: late.v, u: '', label: 'DC projects late', ctx: `${peelWide}in service after the capacity runs out · DC projects →`, tone: +late.v ? 'over' : null, attrs: go('projects', 'DC projects') } : null,
      { v: fmtNum(nW), u: nW === 1 ? 'change' : 'changes', label: 'this week', ctx: 'files moved, new files, capital and EA dates · This week →', attrs: go('week', 'This week') },
    ].filter(Boolean);
  }
  function home() {
    const a = briefing(); if (!a) return { ...waitingFor('home', 'Loading the developments and working out the briefing…', [['Growth', ['planned', 'left to build', 'at build-out', 'expected by 2031']], ['Servicing', ['over capacity at build-out', 'first 90% trigger']], ['Capital', ['DC projects late', 'with no relief in time']], ['Change', ['this week']]]), eyebrow: `Peel · ${esc((App() && App().state.muni) || 'all of Peel')}`, name: `${(App() && App().state.muni) || 'Peel'}: what needs attention`, scen: scen() };
    // The servicing model loads after the developments: until then Needs attention keeps its place with
    // a placeholder (never silently left out), and the map's key waits for the colours it explains.
    const cap = Cap() && Cap().collect ? Cap().collect() : null, ready = !!cap, rows = cap || [];
    const wait = { title: 'Needs attention', rows: [{ kv: true, html: '<span class="muted">Checking servicing capacity…</span>' }], total: 1 };
    const nl = a.lists.find(l => l.title === 'Needs attention');
    const needs = ready ? (nl && nl.rows.length ? nl : null) || { title: 'Needs attention', rows: [{ kv: true, html: '<span class="muted">Nothing reaches a limit or the 90% trigger at build-out.</span>' }], total: 1 } : wait;
    const week = a.lists.find(l => l.title === 'This week');
    // Home's rows open the matching workspace page.
    const toPage = (ws, l) => (l ? { ...l, rows: l.rows.map(r => ({ ...r, attrs: { 'data-ws-page': ws, title: (r.attrs || {}).title } })), see: { 'data-ws-page': ws } } : null);
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
    const groups = [
      { title: 'Growth', link: { label: 'Explore', attrs: go('growth') }, figures: [
        G ? { v: fmtNum(Math.round(G.planned)), u: 'homes', label: 'planned', ctx: `${fmtNum(set.length)} developments`, attrs: go('growth') } : null,
        G ? { v: fmtNum(Math.round(G.left)), u: 'homes', label: 'left to build', ctx: `${fmtNum(Math.round(G.completed))} completed`, attrs: go('growth') } : null,
        people ? { v: people.v, u: 'people', label: 'at build-out', ctx: 'Peel design criteria', attrs: go('growth') } : null,
        f31 ? { v: f31.v, u: f31.u || 'units', label: 'expected by 2031', ctx: f31.ctx, attrs: go('outlook') } : null] },
      { title: 'Servicing', link: { label: 'Servicing capacity', attrs: go('tight') }, figures: [byL(/over capacity/), byL(/first 90% trigger/)] },
      { title: 'Capital', link: { label: 'Capital', attrs: go('projects') }, figures: [byL(/DC projects late/), ready ? { v: fmtNum(noRelief), u: noRelief === 1 ? 'facility' : 'facilities', label: 'with no relief in time', ctx: `${muni ? 'Peel-wide · ' : ''}reach a limit with no DC project in time`, tone: noRelief ? 'over' : null, attrs: go('tight') } : null] },
      { title: 'Change', link: { label: 'This week', attrs: go('week') }, figures: [byL(/this week/), tightFiles ? { ...tightFiles, attrs: go('week') } : null] },
    ];
    // The largest developments left to build, and the plans furthest behind their target (both full map only until now).
    const big = set.filter(p => p.phase !== 'cancelled').map(p => [p, Ph && Ph.unbuiltOf ? Ph.unbuiltOf(p) : 0]).filter(x => x[1] >= 1).sort((x, y) => y[1] - x[1]).slice(0, 5);
    const lab = k => (Ph && Ph.PHASE_BY_KEY[k] ? Ph.PHASE_BY_KEY[k].label : k);
    const unbuilt = { title: 'Largest left to build', rows: big.map(([p, u]) => ({ attrs: { 'data-ws-pick': p.key, 'data-ws-as': 'site', title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${fmtNum(Math.round(u))} left</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${esc(lab(p.phase))}</small>` })), total: big.length };
    const PT = root.PeelPlanTables, behind = PT && PT.behindTarget ? PT.behindTarget(5) : null;
    const tgt = behind && behind.length ? { title: 'Plans furthest behind their target', rows: behind.map(x => ({ attrs: { 'data-ws-explore': x.node.id, title: `Open ${x.name} in Explore` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.name)}</span><span class="pnl-r-year">${Math.round(x.pctTotal * 100)}%</span></div><small class="pnl-r-line">${fmtNum(Math.round(x.total))} planned of a ${fmtNum(x.target.units)}-unit target${x.target.year ? ` (${x.target.year})` : ''}</small>` })), total: behind.length } : null;
    // (pending: the servicing figures are still loading, and the page tries again until they are in)
    return { id: 'home', pending: !ready || null, eyebrow: esc(a.head && a.head.identity ? a.head.identity : 'Peel'), name: `${muni || 'Peel'}: what needs attention`, status: a.head && a.head.status, scen: scen(), answer: a.answer, caveats: caveats(),
      top: scope,
      figures: [], groups,
      // The units the answer adds, by stage: Built since 2021 beside what is approved and in review.
      chart: a.stageStrip ? `${a.stageStrip}${(d => (d.n ? `<p class="small muted">${dormantNote(d).trim()}</p>` : ''))(dormantFor(muni))}` : '',
      lists: [ready ? toPage('tight', needs) : needs, unbuilt, tgt, toPage('week', week)],
      map: { svg: capacityMap(rows), attrs: { 'data-ws-page': 'tight' }, link: 'Servicing capacity', label: 'Open Servicing capacity', caption: !ready ? '<span class="muted">Checking servicing capacity…</span>' : '<span class="hm-key hm-over"></span> over capacity <span class="hm-key hm-tight"></span> past the 90% trigger at build-out (catchments, zones and plants)' },
      actions: [{ label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' }, primary: true }, { label: 'Full map', attrs: { 'data-ws-full': '' } }] };
  }

  // ---- Servicing capacity ------------------------------------------------------------------------
  function tight() {
    const s = specOf('svc:capacity', areaScope), rows = Cap() && Cap().collect ? Cap().collect() : null;
    if (!s || !rows) return loading('tight', 'Loading the servicing model…');
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
    return wsSection('servicing', { id: 'tight', top: wsBar('servicing', wsSec.servicing || 'capacity'), eyebrow: eyebrow('tight'), name: 'Can the system take it?', status: s.head.status, identity: s.head.identity, scen: scen(), answer: s.answer, caveats: caveats().filter(c => /source/i.test(c.text)),
      figures: [
        s.figures[0],
        { v: fmtNum(late.length), u: late.length === 1 ? 'facility' : 'facilities', label: 'no relief in time', ctx: `${fmtNum(late.filter(r => r.reliefY).length)} relief after the limit · ${fmtNum(late.filter(r => !r.reliefY).length)} none listed`, tone: late.length ? 'over' : 'room', attrs: { 'data-ws-go': 'tight', 'data-ws-fulltable': '1' } },
        first ? { v: yTxt(first.limit.y), u: '', label: 'first 90% trigger', ctx: `${esc(first.name)} · ${esc(first.limit.what)}`, tone: 'tight', attrs: first.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': first.ss } : null } : null,
        low ? { v: low.reserve < 0 ? 'none' : fmt1(low.reserve), u: low.reserve < 0 ? '' : 'ML/d', label: 'uncommitted reserve, lowest', ctx: `${esc(low.name)}${low.reserve > 0 ? ` · ≈${fmtNum(Math.round(low.people / 100) * 100)} people` : ''}`, tone: low.pct < 10 ? 'tight' : 'room', attrs: low.ss ? { 'data-ws-go': 'tight', 'data-ws-ss': low.ss } : null } : null,
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
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'tight' }, primary: true }, { label: 'Full table', attrs: { 'data-ws-go': 'tight', 'data-ws-fulltable': 'svc:capacity' } }, { label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' } }] });
  }

  // ---- Check a site / Review an FSR: the Find step ---------------------------------------------------
  function find(id) {
    const Ph = P(), proj = (App() && App().state.projects) || [];
    const last = p => (Ph && Ph.lastActivityOf ? Ph.lastActivityOf(p) || 0 : 0);
    const recent = proj.filter(p => p.phase !== 'cancelled' && p.phase !== 'completed' && (p.units || 0) > 0).map(p => [p, last(p)]).filter(x => x[1]).sort((a, b) => b[1] - a[1]).slice(0, 5).map(x => x[0]);
    const big = proj.filter(p => p.phase === 'review' && (p.units || 0) >= 100).sort((a, b) => b.units - a.units).slice(0, 5);
    const devRow = p => ({ attrs: { 'data-ws-pick': p.key, title: `Open ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(Ph && Ph.PHASE_BY_KEY[p.phase] ? Ph.PHASE_BY_KEY[p.phase].label : p.phase)}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} units</small>` });
    // Bundle 6: the steps in one line under the search (not a list beside the map); Review an FSR
    // starts from the files that have an FSR posted (data/fsr.json), newest first.
    const steps = [['Find', 'search or pick one below'], ['Result', id === 'fsr' ? 'its servicing path with the FSR cross-check' : 'its servicing, timing and what to confirm'], ['Output', id === 'fsr' ? 'notes for the review' : 'the one-page servicing memo']];
    const stepper = `<p class="pnl-stepper small" aria-label="Steps">${steps.map(([t, d], i) => `<span class="${i === 0 ? 'on' : ''}"><b>${i + 1}</b> ${esc(t)}: ${esc(d)}</span>`).join('<span class="muted" aria-hidden="true"> › </span>')}</p>`;
    const F = root.PeelFsr;
    let fsrRows = null;
    if (id === 'fsr' && F) {
      if (!F.FSR.by) { if (F.loadFsr) F.loadFsr().then(() => { if (W() && W().renderPage) W().renderPage(true); }); }
      else fsrRows = proj.map(p => ({ p, f: F.fsrFor(p) })).filter(x => x.f && x.f.best && x.p.phase !== 'cancelled').sort((a, b) => String(b.f.best.fsr.date || '').localeCompare(String(a.f.best.fsr.date || ''))).map(({ p, f }) => ({ attrs: { 'data-ws-pick': p.key, title: `Review ${p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(p.title)}</span><span class="pnl-r-year">${esc(f.best.fsr.date || '')}</span></div><small class="pnl-r-line">${esc(p.municipality)} · ${fmtNum(p.units)} units · FSR posted${f.best.fsr.date ? ` ${esc(f.best.fsr.date)}` : ''}</small>` }));
    }
    const lists = id === 'fsr'
      ? [{ title: 'Files with an FSR posted', rows: fsrRows || [{ kv: true, html: '<span class="muted small">Looking for posted servicing reports…</span>' }], total: fsrRows ? fsrRows.length : 0 },
        { title: 'Recently active', rows: recent.map(devRow), total: recent.length }]
      : [{ title: 'Recently active', rows: recent.map(devRow), total: recent.length }, { title: 'Large files under review', rows: big.map(devRow), total: big.length }];
    return { id, eyebrow: `${esc(label(id))} · step 1 of 3`, name: id === 'fsr' ? 'Do the consultant’s figures match Peel’s criteria?' : 'Can this development be serviced, and when?',
      top: `<div class="page-search" id="page-search"></div>${stepper}`,
      answer: id === 'fsr' ? `Find the development: search an address or file number, or pick one with an FSR posted${fsrRows ? ` (${fmtNum(fsrRows.length)} in Mississauga and Caledon; Brampton’s are on BramPlanOnline, searched by file number)` : ''}.` : 'Find the development: search an address or file number, or pick one below.',
      lists,
      map: { svg: devsMap(((App() && App().state.filtered) || []), recent), attrs: { 'data-ws-go': id }, label: 'Pick a development on the map', caption: '<span class="hm-key hm-key-hl"></span> recently active <span class="hm-key hm-key-dev"></span> developments of 50+ units (sized by units); click to pick one on the map' },
      actions: [{ label: 'Pick on the map', attrs: { 'data-ws-go': id }, primary: true }] };
  }
  // ---- Check a site, with a site -----------------------------------------------------------------------
  // The site's sections (js/sections.js): every full-map tab's panel for this development, one at a
  // time under a section bar; Summary first. A new development opens on Summary.
  let siteSec = 'summary', siteSecDev = null;
  function sectionBar(secs, on, attr = 'data-ws-sec', prefix = '') {
    return `<nav class="page-secs" aria-label="Sections" data-psec="sections">${secs.map(s => `<button type="button" class="page-sec${s.id === on ? ' on' : ''}" ${s.page ? `data-ws-page="${esc(s.page)}"` : `${attr}="${esc(prefix + s.id)}"`} aria-pressed="${s.id === on}">${esc(s.title)}</button>`).join('')}</nav>`;
  }
  // The Servicing and Capital workspaces (js/sections.js WORKSPACES): their pages, and the map's other
  // sub-views of the tab shown on the host page (Servicing capacity, DC projects), header kept.
  const wsSec = { servicing: null, capital: null, reference: null };
  function wsBar(ws, on) { const W = root.PeelSections && root.PeelSections.WORKSPACES[ws]; return W ? sectionBar(W.secs, on, 'data-ws-wsec', `${ws}:`) : ''; }
  function wsSection(ws, m) {
    const SE = root.PeelSections, id = wsSec[ws], sec = SE && id && SE.WORKSPACES[ws].secs.find(x => x.id === id);
    if (!sec || sec.page) return m;
    const s = SE.wsSpecFor(ws, id);
    if (!s) return { ...m, answer: `<span class="muted">Loading ${esc(sec.title)}…</span>`, figures: [], chart: '', lists: [], folds: [], method: '', sources: '' };
    return { ...m, status: s.head && s.head.status, identity: s.head && s.head.identity ? s.head.identity : m.identity, answer: s.answer, figures: s.figures, chart: s.chart, lists: (s.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap(m.id, r)) })), folds: s.folds, method: s.method, sources: s.sources, onMount: s.onMount };
  }
  // An area's section (Growth in an area's own drill-down, or the map's area panel for Servicing or
  // Capital: Region-wide, so a municipality or a plan says so). The header, the trail and the map stay.
  let gSec = 'growth';
  function areaSection(where, m) {
    const SE = root.PeelSections; if (gSec === 'growth' || !SE) return m;
    const s = SE.areaSpecFor(gSec), t = (SE.AREA.find(x => x.id === gSec) || {}).title || '';
    if (!s) return { ...m, answer: `<span class="muted">Loading ${esc(t)} (the servicing model and the DC program)…</span>`, figures: [], chart: '', lists: [], folds: [], method: '', sources: '' };
    const wide = where ? `<span class="muted small">Peel-wide: the plants and the DC program serve more than ${esc(where)}.</span> ` : '';
    return { ...m, status: s.head && s.head.status, answer: `${wide}${s.answer || ''}`, figures: s.figures, chart: s.chart, lists: (s.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap(gSec === 'servicing' ? 'tight' : 'projects', r)) })), folds: s.folds, method: s.method, sources: s.sources, onMount: s.onMount };
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
  // Explore (Check a site, Review an FSR, Growth in an area, Forecast, Study area: one workspace): the
  // one search, where you are (Peel › municipality › plan › site, each a step back up), and Draw an area.
  function exploreBar(trail) {
    return `<div class="page-explore" data-psec="explore"><div class="page-search" id="page-search"></div><p class="ex-where small">${trail || ''}<button type="button" class="btn small link" data-ws-page="study">Draw an area →</button></p></div>`;
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
    return `${(trail.length ? trail : [{ id: 'peel', name: 'Peel' }]).map(crumb).join(' <span aria-hidden="true">›</span> ')} <span aria-hidden="true">›</span> <strong>${esc(p.title)}</strong> · `;
  }
  function site() {
    const p = devNow(); if (!p) return find('site');
    const s = specOf('overview:', `dev:${p.key}`); if (!s) return loading('site', `Loading ${p.title}…`);
    const SE = root.PeelSections;
    if (siteSecDev !== p.key) { siteSec = 'summary'; siteSecDev = p.key; }
    const sec = SE && siteSec !== 'summary' ? SE.specFor(siteSec, p) : null, on = sec ? siteSec : 'summary';
    const waiting = SE && siteSec !== 'summary' && !sec;
    const b = sec || s;
    return { id: 'site', eyebrow: `${esc(label('site'))} · <span class="pnl-steps-i">✓ Find › <b>Result</b> › Output: Servicing memo</span>`, name: p.title, status: s.head.status, badge: s.head.badge, extra: s.head.extra, identity: s.head.identity, scen: scen(),
      top: `${exploreBar(siteTrail(p))}${SE ? sectionBar(SE.SITE, waiting ? siteSec : on) : ''}`,
      answer: waiting ? `<span class="muted">Loading ${esc((SE.BY_ID[siteSec] || {}).title || '')} for ${esc(p.title)} (the servicing model and the DC program)…</span>` : b.answer,
      caveats: [], figures: waiting ? [] : b.figures, chart: waiting ? '' : b.chart,
      lists: waiting ? [] : (b.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('site', r)) })),
      map: siteLiveMap(p),
      folds: waiting ? [] : b.folds, method: waiting ? '' : b.method, sources: waiting ? '' : b.sources, onMount: waiting ? null : b.onMount,
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
    const G = root.Growth, Ph = P(), Ly = root.PeelLayers, basis = App() ? App().state.basis || 'all' : 'all';
    const dm = nodeDevs(n), items = [...dm].map(([p, share]) => ({ p, share: Math.min(1, share) }));
    const atPeel = n.kind === 'peel';
    const muniOf = x => { for (let y = x; y; y = y.parent ? r.nodes.get(y.parent) : null) if (y.kind === 'municipality') return y.name; return ''; };
    const kind = x => kindOf(x, muniOf(x));
    // The trail: Peel › municipality › plan › …
    const trail = []; for (let x = n; x; x = x.parent ? r.nodes.get(x.parent) : null) trail.unshift(x);
    const crumbs = trail.map((x, i) => (i < trail.length - 1 ? `<button type="button" class="btn small link" data-ws-drill="${esc(x.id)}">${esc(x.name)}</button>` : `<strong>${esc(x.name)}</strong>`)).join(' <span aria-hidden="true">›</span> ');
    // The stages, for this area.
    const DGs = root.PeelDcGate, sspOf = DGs && DGs.loaded() ? q => { const g = DGs.rowOf(q); return !!g && g.bucket === 'counted'; } : null;
    const stage = Ly && Ly.ofDev ? stageRows(items, q => Ly.ofDev(q), undefined, sspOf) : null;
    if (stage) { stage.click = true; stage.on = gStage; if (atPeel || n.kind === 'municipality') stage.dormant = dormantFor(atPeel ? App().state.muni : n.name); }
    const CAr = root.PeelCensusAreas, bc = atPeel && CAr && CAr.baselineCensus ? CAr.baselineCensus() : null;
    // (the area the developments are filtered to: a municipality filter at the Peel node is not all of Peel)
    const census = bc && root.PeelAreas && root.PeelAreas.censusTotals ? root.PeelAreas.censusTotals(bc.das, { muni: App() ? App().state.muni : '', sp: App() ? App().state.sp : [], mtsa: App() ? App().state.mtsa : [] }).dwellings : 0;
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
    // The stages (the bars and the table's buttons filter the area's developments): pre-application to built.
    const STG = Object.fromEntries(STAGES.map(([k, l]) => [k, l]));
    const tools = `<div class="seg" role="group" aria-label="Stage"><button type="button" class="btn small${gStage === 'all' ? ' on' : ''}" data-ws-stage="all" aria-pressed="${gStage === 'all'}">All</button>${STAGES.map(([k, l]) => `<button type="button" class="btn small${gStage === k ? ' on' : ''}" data-ws-stage="${k}" aria-pressed="${gStage === k}">${esc(l.replace(' or under construction', ' / building'))}</button>`).join('')}</div>`;
    // Estimated counts in this area (at the chosen stage): how much of the pipeline is not stated on a file.
    const es = Ly && Ly.ofDev ? estimateRows(items.filter(({ p }) => gStage === 'all' || stageOf(Ly.ofDev(p)) === gStage), q => Ly.ofDev(q)) : null;
    const pipeU = stage ? (gStage === 'all' ? stage.total : (stage.rows.find(x => x.key === gStage) || {}).units || 0) : 0;
    const estRows = es && es.files.length ? [
      { kv: true, html: `<span><strong>${n0(es.units)}</strong> of ${n0(pipeU)} dwellings${pipeU > 0 ? ` (${Math.round(es.units / pipeU * 100)}%)` : ''} are estimated, in ${fmtNum(es.files.length)} ${es.files.length === 1 ? 'file' : 'files'} with no unit count stated: ${Object.entries(es.byKind).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${n0(v)} ${esc(EST_KINDS[k])}`).join(', ')}. ${es.files.some(x => Object.keys(x.kinds).length > 1) ? ' A file with more than one kind of estimate is split between them in proportion to their units.' : ''} Confirm these counts with the municipality.</span>` },
      ...es.files.map(x => ({ attrs: { 'data-ws-pick': x.p.key, 'data-ws-as': 'site', title: `Check ${x.p.title}` }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}</span><span class="pnl-r-year">${n0(x.est)} est.</span></div><small class="pnl-r-line">${Object.keys(x.kinds).length > 1 ? `${esc(Object.entries(x.kinds).map(([k, v]) => `${n0(v)} ${EST_KINDS[k]}`).join(' + '))} (split in proportion)` : esc(EST_KINDS[Object.keys(x.kinds)[0]] || '')} · ${esc(STG[stageOf(Ly.ofDev(x.p))] || '')} · ${esc(x.p.municipality)}${x.share < 0.99 ? ` · ${Math.round(x.share * 100)}% in this area` : ''}</small>${estFileHTML(x.p)}` })),
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
    // The area on the small map: its outline (a plan or precinct), its developments.
    // The map's plan filter takes secondary plans only: at a precinct or sub-area, its plan.
    // Show on the map: this area itself (a plan, sub-area or precinct: the map's plan filter holds the
    // same developments, js/plan-tables.js areaIdsOf); "Elsewhere in" / "Not in a plan" open the plan above.
    const spId = (() => { for (let x = n; x; x = x.parent ? r.nodes.get(x.parent) : null) if (x.areaId) return x.areaId; return null; })();
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
      const st = Ly ? stageOf(Ly.ofDev(p)) : null;
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
    const groups = by === 'area' ? kidRows.map(([c, rows]) => ({ key: c.id, name: c.name, sub: kind(c), drill: c.id, rows }))
      : by === 'stage' ? STAGES.map(([k]) => ({ key: k, name: stLabel(k), rows: allRows.filter(x => x.st === k) }))
        : by === 'ss' ? [...SS_ORDER, null].map(k => ({ key: k || 'other', name: k ? DG.BUCKETS[k].label : 'Not in the servicing count', mapAttrs: k ? { 'data-dcg-filter': k, title: 'Show these developments on the map' } : null, rows: allRows.filter(x => (x.ss || null) === k) }))
          : [{ key: 'all', name: '', rows: allRows }];
    gGk = `${n.id}|${by}`;
    groups.filter(g => g.rows.length).forEach((g, i) => { const o = gGrp.get(`${gGk}|${g.key}`); g.open = o != null ? o : i < 2; g.all = gMore.has(`${gGk}|${g.key}`); });
    const table = DT ? { html: DT.tableHTML({ title: gStage === 'all' ? `Developments in ${n.name}` : `${STG[gStage]}: developments in ${n.name}`, groups, by, byOpts, sort: gSort, tools, where: by !== 'area', stages: STAGES, stageLabel: stLabel,
      ssLabel: k => (SS_SHORT[k] || ''), empty: `No developments ${gStage === 'all' ? 'with planned units' : `at ${(STG[gStage] || '').toLowerCase()}`} in ${n.name}.` }) } : null;
    const tmV = x => (gStage === 'built' ? x.units : x.left);
    const boxes = kids.length ? kidRows.map(([c, rows]) => ({ key: c.id, name: c.name, drill: c.id, area: c.areaId || null, tiles: rows.map(x => ({ ...x, v: tmV(x) })) }))
      : [{ key: n.id, name: n.name, area: n.areaId || null, tiles: allRows.map(x => ({ ...x, v: tmV(x) })) }];
    const treemap = DT ? DT.treemapHTML(boxes, { stageLabel: stLabel, caption: `${gStage === 'built' ? 'Homes built since 2021' : 'Homes left to build'}: ${kids.length ? `a box per ${levelWord.toLowerCase()}, ` : ''}a tile per development (colour: its stage). Hover one to find it on the map; click to open it.` }) : '';
    const answer = atPeel
      ? `${pl.answer}${f2031 ? ` About <strong>${f2031.v}</strong> units are expected by 2031 (${f2031.ctx}).` : ''}${svcLine}`
      : `<strong>${esc(n.name)}</strong> ${trail[1] && trail[1] !== n ? ` (${esc(trail[1].name)})` : ''} holds <strong>${n0(m.planned)}</strong> planned units, ${p0(m.people)} people${m.jobs >= 0.5 ? ` and ${p0(m.jobs)} jobs` : ''} at build-out; ${n0(anb)} approved, not yet built, ${n0(m.left)} left to build.${svcLine}`;
    return areaSection(atPeel ? (App().state.muni || '') : n.name, { id: 'growth', eyebrow: `${esc(label('growth'))} · ${crumbs}${atPeel ? '' : ` <span class="page-kind">${esc(kind(n))}</span>`}`, name: atPeel ? 'How much is coming, where, and how fast?' : n.name, status: null, identity: atPeel ? esc(`${App().state.muni || 'Peel'} · ${fmtNum(plans.length)} plans with planned units`) : esc(`${fmtNum(dm.size)} developments${trail.length > 2 ? ` · in ${trail[trail.length - 2].name}` : ''}`), scen: scen(), answer,
      top: `${exploreBar('')}${root.PeelSections ? sectionBar(root.PeelSections.AREA, gSec, 'data-ws-asec') : ''}`,
      figures: [
        // (units and jobs at the Scenario's counting basis, as the people and the Overview: one basis)
        basis === 'all' ? { v: n0(m.planned), u: 'units', label: 'planned', ctx: `${n0(m.left)} left to build` } : { v: n0(m.counted), u: 'units', label: G.basisUnits(basis), ctx: `of ${n0(m.planned)} planned` },
        { v: n0(anb), u: 'units', label: 'approved, not yet built', ctx: 'past their first planning approval' },
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
      map: { svg: mapSvg, attrs: spId ? { 'data-ws-go': 'growth', 'data-ws-area': spId } : { 'data-ws-go': 'growth' }, label: `Show ${n.name} on the map`, caption: ring ? `<span class="hm-key hm-key-area"></span> ${esc(n.name)} <span class="hm-key hm-key-dev"></span> its developments (sized by units)` : '<span class="hm-key hm-key-dev"></span> developments of 50+ units (sized by units) · municipal outlines', after: treemap },
      method: `${pl.method} Drill-down: Growth › Areas' plan tree (Peel, municipality, secondary plan or character area, precinct or sub-area, then "not in a plan" and "elsewhere in the plan"); every level equals the sum of the levels under it, and a site split between plans counts its share. The stages follow a file: pre-application (pre-consultation, block or precinct plan), in review, approved (draft or site plan approved; split on whether its building permits are issued), built since the 2021 census. Estimated counts: a file's units left to build that are not stated on it (found online, a pre-consultation estimate, an estimate from the wording, or counted from building permits), the hatching on the stage bars. A file with more than one kind of estimate has its estimate split between the kinds in proportion to their units. Employment: the floor area the applications state and the jobs it holds at Peel's floor space per job.${tm && atPeel ? ` ${tm.method}` : ''}`,
      sources: pl.sources,
      actions: [{ label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, primary: true }, { label: 'Show on the map', attrs: spId ? { 'data-ws-go': 'growth', 'data-ws-area': spId } : { 'data-ws-go': 'growth' } }, !atPeel ? { label: '↑ Up a level', attrs: { 'data-ws-drill': n.parent || 'peel' } } : null] });
  }
  let gAll = false, gEst = false;
  // The developments table: grouped by (null: the next level down), sorted by, the groups opened or
  // closed and showing every row (keyed by level and grouping: gGk).
  let gBy = null, gSort = { k: 'l', dir: -1 }, gGk = '';
  const gGrp = new Map(), gMore = new Set();
  document.addEventListener('click', e => {
    // (an area's Growth section is its own page: its own content again; the same for a workspace's pages)
    const gp = e.target.closest && e.target.closest('.page-secs [data-ws-page]');
    if (gp) { if (gp.dataset.wsPage === 'growth') gSec = 'growth'; if (gp.dataset.wsPage === 'tight') wsSec.servicing = null; if (gp.dataset.wsPage === 'projects' || gp.dataset.wsPage === 'eaflow') wsSec.capital = null; if (['help', 'guides', 'glossary', 'data'].includes(gp.dataset.wsPage)) wsSec.reference = null; }
    const wb = e.target.closest && e.target.closest('[data-ws-wsec]');
    if (wb && document.getElementById('home') && document.getElementById('home').contains(wb)) {
      e.preventDefault(); e.stopPropagation();
      const [ws, id] = wb.dataset.wsWsec.split(':'), host = root.PeelSections.WORKSPACES[ws].host; wsSec[ws] = id;
      if (W() && W().page && W().page() !== host) W().openPage(host, { keepScroll: true }); else if (W() && W().renderPage) W().renderPage(true);
      return;
    }
    const t = e.target.closest && e.target.closest('[data-ws-drill],[data-ws-stage],[data-ws-drillall],[data-ws-estall],[data-gt-by],[data-gt-sort],[data-gt-tog],[data-gt-more],[data-ws-sec],[data-ws-explore],[data-ws-asec]'); if (!t || !document.getElementById('home') || !document.getElementById('home').contains(t)) return;
    e.preventDefault(); e.stopPropagation();
    // An area's Servicing or Capital: on Growth in an area's page (from the Forecast too).
    if (t.dataset.wsAsec) { gSec = t.dataset.wsAsec; if (W() && W().page && W().page() !== 'growth') { W().openPage('growth', { keepScroll: true }); return; } if (W() && W().renderPage) W().renderPage(true); return; }
    // A site's section from its FSR review: back on the site's page, at that section.
    if (t.dataset.wsSec && W() && W().page && W().page() !== 'site') { siteSec = t.dataset.wsSec; W().openPage('site', { keepScroll: true }); return; }
    // A step up the trail from a site: Growth in an area at that level (the site closes).
    if (t.dataset.wsExplore) { gAt = t.dataset.wsExplore; gStage = 'all'; gAll = false; gEst = false; if (W() && W().openPage) W().openPage('growth'); return; }
    if (t.dataset.wsSec) siteSec = t.dataset.wsSec;
    // The table: grouping, sorting, a group opened or closed, all its rows (the page keeps its scroll).
    else if (t.dataset.gtBy || t.dataset.gtSort || t.dataset.gtTog || t.dataset.gtMore) {
      if (t.dataset.gtBy) gBy = t.dataset.gtBy;
      else if (t.dataset.gtSort) { const k = t.dataset.gtSort; gSort = gSort.k === k ? { k, dir: -gSort.dir } : { k, dir: k === 't' ? 1 : -1 }; }
      else if (t.dataset.gtTog) gGrp.set(`${gGk}|${t.dataset.gtTog}`, t.getAttribute('aria-expanded') !== 'true');
      else { const k = `${gGk}|${t.dataset.gtMore}`; if (gMore.has(k)) gMore.delete(k); else gMore.add(k); }
      if (W() && W().renderPage) W().renderPage(false);
      return;
    }
    else if (t.dataset.wsDrill) { gAt = t.dataset.wsDrill; gStage = 'all'; gAll = false; gEst = false; const h = document.getElementById('home'); if (h) h.scrollTop = 0; }
    else if (t.dataset.wsStage) gStage = gStage === t.dataset.wsStage ? 'all' : t.dataset.wsStage;
    else if (t.dataset.wsDrillall) gAll = !gAll;
    else if (t.dataset.wsEstall) gEst = !gEst;
    if (W() && W().renderPage) W().renderPage(true);
  }, true);
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
  // ---- Projects ------------------------------------------------------------------------------------
  function projects() {
    const t = specOf('dca:timing', areaScope); if (!t) return loading('projects', 'Loading the DC program…');
    const pr = specOf('dca:projects', areaScope), ea = specOf('dca:eas', areaScope);
    return wsSection('capital', { id: 'projects', top: wsBar('capital', wsSec.capital || 'timing'), eyebrow: eyebrow('projects'), name: 'Is the capital program arriving in time for growth?', status: t.head.status, identity: t.head.identity, scen: scen(), answer: t.answer,
      figures: t.figures, chart: t.chart,
      lists: [
        ...(t.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('projects', r)) })).slice(0, 1),
        pr && pr.lists && pr.lists[0] ? { ...pr.lists[0], title: 'Region capital projects being built', rows: pr.lists[0].rows.map(r => toMap('projects', r)) } : null,
        ea && ea.lists && ea.lists[0] ? { ...ea.lists[0], title: 'EAs: milestones and comment periods', rows: ea.lists[0].rows.map(r => toMap('projects', r)) } : null,
      ],
      map: { svg: worksMap(), attrs: { 'data-ws-go': 'projects' }, label: 'Open Projects on the map', caption: '2026 DC works (draft): <span class="hm-key hm-dc-wastewater"></span> wastewater <span class="hm-key hm-dc-water"></span> water' },
      method: t.method, sources: t.sources,
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'projects' }, primary: true }, { label: 'Full table', attrs: { 'data-ws-go': 'projects', 'data-ws-fulltable': 'dca:timing' } }] });
  }

  // ---- Forecast: when the pipeline's homes and people arrive (Growth › Forecast, on a page) ----------
  function outlook() {
    const t = specOf('growth:timing', areaScope); if (!t) return loading('outlook', 'Timing the pipeline…');
    const SE = root.PeelSections;
    return { id: 'outlook', eyebrow: eyebrow('outlook'), name: 'When do the homes and people arrive?', status: t.head.status, identity: t.head.identity, scen: scen(), answer: t.answer,
      top: `${exploreBar('')}${SE ? sectionBar(SE.AREA, 'outlook', 'data-ws-asec') : ''}`,
      figures: t.figures, chart: t.chart,
      lists: (t.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('outlook', r)) })),
      map: { svg: devsMap((App() && App().state.filtered) || []), attrs: { 'data-ws-go': 'outlook' }, label: 'Open Forecast on the map', caption: '<span class="hm-key hm-key-dev"></span> developments of 50+ units' },
      method: t.method, sources: t.sources,
      actions: [{ label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, primary: true }, { label: 'How the forecast is timed ›', attrs: { 'data-ws-page': 'forecast' } }, { label: 'Open the map', attrs: { 'data-ws-go': 'outlook' } }] };
  }

  // ---- EA to construction: each Region EA and the construction that followed it ---------------------
  // Construction counts as the EA's outcome only when it starts on or after the EA's completion (the
  // year, where only the year is known); earlier work in the study area is listed as other work, never
  // as following the EA (js/capital-ea-model.js eaProgress).
  const CM = () => root.PeelCapitalEAModel, CE = () => root.PeelCapitalEA;
  const yrOf = v => (v == null ? '' : String(new Date(v).getUTCFullYear()));
  const eaOpen = x => ({ 'data-ws-go': 'eaflow', 'data-ws-ce': `ea:${x.e.id}`, title: 'Open the EA on the map' });
  const workLine = c => `${esc(c.work || 'Construction')}${c.street ? ` · ${esc(c.street)}` : ''} <small>${esc(c.status)}${c.start != null ? `, ${c.startActual ? 'started' : 'starts'} ${yrOf(c.start)}` : ''}</small>`;
  function eaTimelineHTML(rows, today = Date.now()) {
    if (!rows.length) return '';
    const y0 = Math.max(2008, Math.min(...rows.map(x => x.d.start).filter(v => v != null).map(v => new Date(v).getUTCFullYear()), new Date(today).getUTCFullYear() - 10));
    const y1 = new Date(today).getUTCFullYear() + 6, from = Date.UTC(y0, 0, 1), to = Date.UTC(y1, 0, 1);
    const pct = v => `${(v * 100).toFixed(2)}%`, M = CM();
    const ticks = []; for (let y = Math.ceil(y0 / 5) * 5; y < y1; y += 5) ticks.push(`<span class="eat-tick" style="left:${pct((Date.UTC(y, 0, 1) - from) / (to - from))}">${y}</span>`);
    const nowAt = pct((today - from) / (to - from));
    const line = x => {
      const t = M.timelineRow(x, from, to), parts = [];
      if (t.ea) parts.push(`<span class="eat-ea${t.ea.open ? ' open' : ''}" style="left:${pct(t.ea.a)};width:${pct(Math.max(0.004, t.ea.b - t.ea.a))}"></span>`);
      for (const p of t.pics) parts.push(`<span class="eat-pic" style="left:${pct(p)}" title="Public information centre"></span>`);
      if (t.done != null) parts.push(`<span class="eat-done" style="left:${pct(t.done)}" title="EA complete ${esc(String(x.d.completion.year))}"></span>`);
      else if (t.expected != null) parts.push(`<span class="eat-exp" style="left:${pct(t.expected)}" title="Report expected ${esc(String(x.d.expected.year))}"></span>`);
      for (const w of t.works) parts.push(`<span class="eat-w eat-w-${esc(w.status.replace(/\s+/g, '-'))}${w.planned ? ' planned' : ''}" style="left:${pct(w.a)};width:${pct(Math.max(0.006, w.b - w.a))}"></span>`);
      return `<li class="eat-row" ${Object.entries(eaOpen(x)).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')} tabindex="0" role="button"><span class="eat-nm">${esc(x.e.name)}<small>${esc(x.e.municipality || 'Peel')} · ${esc((M.BUCKETS.find(b => b[0] === x.bucket) || [])[1] || '')}</small></span><span class="eat-track">${parts.join('')}<span class="eat-now" style="left:${nowAt}"></span></span></li>`;
    };
    return `<h3 class="pnl-chart-t">Each EA and the construction after it <span class="pnl-chart-u">(${y0}–${y1})</span></h3>
      <div class="eat-axis" aria-hidden="true"><span class="eat-nm"></span><span class="eat-track">${ticks.join('')}</span></div>
      <ul class="eat" aria-label="EA timelines">${rows.map(line).join('')}</ul>
      <p class="small muted eat-key"><span class="eat-k eat-ea"></span> EA study <span class="eat-k eat-pic"></span> public information centre <span class="eat-k eat-done"></span> EA complete <span class="eat-k eat-exp"></span> report expected <span class="eat-k eat-w eat-w-under-construction"></span> construction <span class="eat-k eat-w planned"></span> planned <span class="eat-k eat-now"></span> today</p>`;
  }
  function eaflow() {
    const ce = CE(), M = CM();
    if (!ce || !M || !M.eaProgress || !ce.data.loaded) return loading('eaflow', 'Loading the EAs and capital projects…');
    if (!ce.data.eas || !ce.data.capital) return { id: 'eaflow', eyebrow: eyebrow('eaflow'), name: 'Which EAs have led to construction?', answer: '<span class="muted">The EA or capital project list did not load. Reload the page to try again.</span>' };
    const muni = App() && App().state.muni;
    const all = M.eaProgress(ce.data.eas.eas || [], ce.data.capital.records || []).filter(x => !muni || !x.e.municipality || x.e.municipality === 'Region-wide' || x.e.municipality.split(' / ').includes(muni));
    const by = k => all.filter(x => x.bucket === k), n = k => by(k).length;
    const followed = all.filter(x => ['planned', 'building', 'built'].includes(x.bucket));
    const waiting = [...by('limit'), ...by('waiting')].sort((a, b) => a.d.completion.at - b.d.completion.at);
    const current = by('current').sort((a, b) => (a.d.expected ? a.d.expected.at : 9e15) - (b.d.expected ? b.d.expected.at : 9e15));
    const conflicts = all.filter(x => x.conflict.length);
    // (a report date already past on an EA still under way: the page has not been updated, or the EA is late)
    const now0 = Date.now(), nextRep = current.find(x => x.d.expected && x.d.expected.at >= now0), pastDue = current.filter(x => x.d.expected && x.d.expected.at < now0).length;
    // Current construction near a past EA that the weekly build hasn't linked (never counted as following it).
    const inMuni = x => !muni || !x.e.municipality || x.e.municipality.split(' / ').includes(muni);
    const possible = (M.possibleLinks ? M.possibleLinks(ce.data.eas.eas || [], ce.data.capital.records || []) : []).filter(inMuni);
    // Construction starting 10+ years after the EA was complete: the Class EA may need a review first.
    const gapOf = (x, c) => (x.d.completion && c.start != null ? new Date(c.start).getUTCFullYear() - x.d.completion.year : null);
    const gapNote = g => (g != null && g >= 10 ? ` <span class="pnl-chip t-tight">${fmtNum(g)} years after the EA</span>` : '');
    const late = [...followed.flatMap(x => x.outcome.map(c => gapOf(x, c))), ...possible.map(p => gapOf(p, p.c))].filter(g => g != null && g >= 10).length;
    const done = all.length - n('current');
    const answer = !all.length ? 'No Region EAs in this area.'
      : `Of <strong>${fmtNum(done)}</strong> completed EA${done === 1 ? '' : 's'}, <strong>${fmtNum(followed.length)}</strong> ${followed.length === 1 ? 'has' : 'have'} construction that started after the EA was complete, <strong>${fmtNum(waiting.length)}</strong> ${waiting.length === 1 ? 'is' : 'are'} waiting for construction${n('limit') ? ` (${fmtNum(n('limit'))} for 9 years or more)` : ''}, and <strong>${fmtNum(n('nodate'))}</strong> ${n('nodate') === 1 ? 'has' : 'have'} no completion date yet. <strong>${fmtNum(n('current'))}</strong> ${n('current') === 1 ? 'is' : 'are'} under way.${possible.length ? ` <strong>${fmtNum(possible.length)}</strong> current construction contract${possible.length === 1 ? ' lies' : 's lie'} near a past EA without a link: possible links to check.` : ''}${late ? ` <strong>${fmtNum(late)}</strong> contract${late === 1 ? ' starts' : 's start'} 10 or more years after ${late === 1 ? 'its' : 'their'} EA: check the EA was reviewed (a Class EA rule).` : ''}`;
    const row = (x, right) => ({ attrs: eaOpen(x), html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.e.name)}<small>${esc(x.e.municipality || 'Peel')}</small></span><span class="pnl-r-fig">${right}</span></div>` });
    const chartRows = [...followed, ...waiting].sort((a, b) => (a.d.completion ? a.d.completion.at : 9e15) - (b.d.completion ? b.d.completion.at : 9e15));
    const others = all.filter(x => x.other.length);
    const unknown = by('nodate');
    return { id: 'eaflow', top: wsBar('capital', 'eaflow'), eyebrow: eyebrow('eaflow'), name: 'Which EAs have led to construction?', status: { tone: 'stage', text: 'From public pages' },
      identity: `${esc(muni || 'Peel')} · ${fmtNum(all.length)} Region EAs · ${fmtNum(ce.data.capital.records.length)} capital project records`, scen: scen(), answer,
      figures: [
        { v: fmtNum(followed.length), u: 'EAs', label: 'construction followed', ctx: `${fmtNum(n('building'))} under construction · ${fmtNum(n('planned'))} planned · ${fmtNum(n('built'))} built` },
        { v: fmtNum(waiting.length), u: 'EAs', label: 'complete, no construction yet', ctx: waiting.length ? `oldest completed ${esc(String(waiting[0].d.completion.year))}` : '', tone: n('limit') ? 'tight' : null },
        { v: fmtNum(n('current')), u: 'EAs', label: 'under way', ctx: nextRep ? `next report expected ${esc(String(nextRep.d.expected.year))}${pastDue ? ` · ${fmtNum(pastDue)} past their report date` : ''}` : pastDue ? `${fmtNum(pastDue)} past their report date` : '' },
        { v: fmtNum(n('nodate')), u: 'EAs', label: 'completion date unknown', ctx: 'construction can’t be ordered against them yet' },
      ],
      chart: eaTimelineHTML(chartRows),
      lists: [
        { title: 'Complete, waiting for construction (oldest first)', rows: waiting.map(x => row(x, `${esc(String(x.d.completion.year))}<small>${fmtNum(x.yearsSince)} year${x.yearsSince === 1 ? '' : 's'} ago${x.yearsSince >= 10 ? ' · review needed before construction' : x.bucket === 'limit' ? ' · near 10 years' : ''}</small>`)), total: waiting.length, all: true },
        { title: 'Construction that followed an EA', rows: followed.flatMap(x => x.outcome.map(c => ({ attrs: eaOpen(x), html: `<div class="pnl-r-top"><span class="pnl-r-name">${workLine(c)}${gapNote(gapOf(x, c))}<small>after ${esc(x.e.name)} (complete ${esc(String(x.d.completion ? x.d.completion.year : '?'))})</small></span></div>` }))), total: followed.length, all: true },
        { title: 'Possible links to check: current construction near a past EA', rows: possible.map(x => ({ attrs: eaOpen(x), html: `<div class="pnl-r-top"><span class="pnl-r-name">${workLine(x.c)}${gapNote(gapOf(x, x.c))}<small>near ${esc(x.e.name)}${x.d.completion ? ` (complete ${esc(String(x.d.completion.year))})` : ''} · ${esc(x.why.join(' · '))}</small></span></div>` })), total: possible.length, all: true },
        { title: 'EAs under way (by expected report)', rows: current.map(x => row(x, x.d.expected ? `${esc(String(x.d.expected.year))}<small>${x.d.expected.at < now0 ? 'report was due' : 'report expected'}</small>` : '<small>no report date yet</small>')), total: current.length },
      ],
      folds: [
        others.length ? { title: `Other work in the study areas (${fmtNum(others.reduce((t, x) => t + x.other.length, 0))}): started before the EA was complete, so not counted as following it`, html: `<ul class="small">${others.map(x => `<li><strong>${esc(x.e.name)}</strong>${x.d.completion ? ` (EA complete ${esc(String(x.d.completion.year))})` : x.d.expected ? ` (report expected ${esc(String(x.d.expected.year))})` : ''}: ${x.other.map(workLine).join('; ')}</li>`).join('')}</ul>` } : null,
        unknown.length ? { title: `Completion date unknown (${fmtNum(unknown.length)})`, html: `<p class="small muted">The EA’s page, notice and report don’t give a completion year yet, so linked construction can’t be ordered against it.</p><ul class="small">${unknown.map(x => `<li>${esc(x.e.name)} <span class="muted">· ${esc(x.e.municipality || 'Peel')}${x.contracts.length ? ` · ${fmtNum(x.contracts.length)} linked contract${x.contracts.length === 1 ? '' : 's'}` : ''}</span></li>`).join('')}</ul>` } : null,
        conflicts.length ? { title: `Date conflicts to check (${fmtNum(conflicts.length)})`, open: true, html: `<p class="small muted">The project’s own page links this construction to the EA, but it started before the EA was complete. One of the dates may be wrong.</p><ul class="small">${conflicts.map(x => `<li><strong>${esc(x.e.name)}</strong> (EA complete ${esc(String(x.d.completion ? x.d.completion.year : x.d.expected ? x.d.expected.year : '?'))}): ${x.conflict.map(workLine).join('; ')}</li>`).join('')}</ul>` } : null,
      ],
      map: { svg: eaMap(all), attrs: { 'data-ws-go': 'eaflow' }, label: 'Open EA to construction on the map', caption: `<span class="hm-key hm-key-ea-wait"></span> complete, waiting <span class="hm-key hm-key-ea-follow"></span> construction followed <span class="hm-key hm-key-ea-now"></span> under way <span class="hm-key hm-key-cons"></span> construction after an EA${muniBounds() ? ' · named: the three waiting longest (year complete)' : ''}` },
      method: 'Each Region Class EA (Water, Wastewater and Roads) from its project page, with the capital projects linked to it (by the project’s own page, inside the study area, or by street inside the study area). Construction counts as following the EA only when it starts on or after the EA was complete; where only the year is known, a start in the same year counts. For an EA under way, only construction due after the expected report counts. Earlier work in the study area is listed as other work. The completion year comes from, in order: the notice of completion, the report filing date, the page’s wording, the report’s cover, the report’s file name. Under the Municipal Class EA, when more than 10 years pass between the notice of completion and the start of construction, the EA must be reviewed (and an addendum filed if anything changed) before construction: waiting EAs past 10 years and construction starting 10 or more years after its EA are flagged to check; the app can’t see whether that review was done. Possible links: planned or active contracts of the same system and municipality, mostly within 250 m of a completed EA’s study area (500 m of a facility), starting after the EA was complete, that the weekly build has not linked; repairs, relining, resurfacing and developer-built works are left out, Region-wide studies are left out, and a study area placed with low confidence needs the street named in the EA as well. They are listed to check and never counted as following the EA. The start date is the actual start where recorded, else the target start.',
      sources: 'Region of Peel EA project pages and their notices and reports (weekly build, scripts/build-eas.js); Region of Peel capital project and construction pages (data/capital.json).',
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
  function fsr() {
    const p = devNow(); if (!p) return find('fsr');
    const s = specOf('svc:network', `dev:${p.key}`); if (!s) return loading('fsr', `Loading ${p.title}…`);
    const F = root.PeelFsrCheck, WD = { app: ['room', 'Compared here'], part: ['tight', 'Facilities only'], eye: ['over', 'By an engineer'] }, SE = root.PeelSections;
    return { id: 'fsr', eyebrow: `${esc(label('fsr'))} · <span class="pnl-steps-i">✓ Find › <b>Result</b> › Output: notes for the review</span>`, name: p.title, status: s.head.status, badge: s.head.badge, extra: s.head.extra, identity: s.head.identity, scen: scen(), answer: s.answer,
      top: `${exploreBar(siteTrail(p))}${SE ? sectionBar(SE.SITE, 'fsr') : ''}`,
      figures: s.figures,
      mid: '<section class="page-fsr" data-psec="fsr"><h3>FSR cross-check: the consultant’s figures vs this app’s</h3><div class="fsr-box" data-pnl-fsrbox></div></section>',
      lists: [
        { title: 'What the FSR should cover', rows: COVERAGE.map(([t, k, d]) => ({ kv: true, html: `<div class="pnl-kv"><span>${esc(t)}<small class="muted"> · ${esc(d)}</small></span><span class="t-${WD[k][0]}">${WD[k][1]}</span></div>` })), total: COVERAGE.length },
        ...(s.lists || []).map(l => ({ ...l, rows: l.rows.map(r => toMap('fsr', r)) })),
      ],
      map: siteLiveMap(p),
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
    return { id: 'study', eyebrow: eyebrow('study'), name: 'What does this area add, and what servicing does it lean on?', scen: scen(),
      answer: has ? `The drawn area holds <strong>${fmtNum(sel.length)}</strong> development${sel.length === 1 ? '' : 's'}. Its growth and the servicing it needs are below.` : 'Draw an area on the map: press <strong>Draw an area</strong>, then drag around the developments.',
      top: `${exploreBar('')}<section class="page-livemap" data-psec="livemap"><div class="page-map-slot" id="page-map-slot"></div><div class="pnl-acts"><button type="button" class="btn small pnl-primary" data-ws-draw>${has ? 'Add an area' : 'Draw an area'}</button>${has ? '<button type="button" class="btn small" data-ws-clear>Clear</button>' : ''}</div></section>`,
      mid: has && AS ? `<section class="page-sel" data-psec="selection">${AS.selectionSummaryHTML(sel)}</section>` : '',
      method: 'The developments shown on the map inside the drawn area(s): units by type and stage, people and jobs at Peel design criteria, and the water and wastewater demand they add (the same estimate as each development’s panel).',
      actions: [{ label: 'Open the map', attrs: { 'data-ws-go': 'study' }, primary: !has }, has ? { label: 'Area report (PDF)', attrs: { 'data-area-report': 'sel' }, primary: true } : null] };
  }

  // Reference pages (not workspaces): How it works and its guides (js/reference.js; How approvals work
  // is js/approvals-guide.js, wrapped as a guide), the Glossary (js/glossary.js), Help (js/tips.js).
  const ref = id => () => (root.PeelReference ? root.PeelReference.page(id) : id === 'approvals' && root.PeelApprovalsGuide ? root.PeelApprovalsGuide.page() : loading(id, 'Loading…'));
  const [guides, roles, approvals, flows, network, capacity, fsrguide, capital, targets, forecast] = ['guides', 'roles', 'approvals', 'flows', 'network', 'capacity', 'fsrguide', 'capital', 'targets', 'forecast'].map(ref);
  const glossary = () => (root.PeelGlossary ? root.PeelGlossary.page() : loading('glossary', 'Loading…'));
  const help = () => (root.PeelTips && root.PeelTips.helpPage ? root.PeelTips.helpPage() : loading('help', 'Loading…'));
  // Data sources (Reference, step 5): the map's Records › Sources panel on a page (the old Data tab,
  // map-only until now); Data checks is its section.
  function data() {
    const SE = root.PeelSections, s = SE ? SE.areaPanel('records:sources') : null;
    if (!s) return loading('data', 'Loading the sources…');
    const h = s.head || {};
    return wsSection('reference', { id: 'data', eyebrow: 'Reference', name: h.name || 'Where does the data come from?', status: h.status, identity: h.identity, answer: s.answer, figures: s.figures, chart: s.chart,
      lists: s.lists || [], folds: s.folds, method: s.method, sources: s.sources,
      actions: [{ label: 'Refresh and manage sources', attrs: { 'data-ws-full': '', 'data-at': 'records:sources' }, primary: true }] });
  }
  // Labs › Sewer designer: its page is the tool's own (js/sewer-designer.js page()).
  const sewer = () => (root.PeelSewerDesigner && root.PeelSewerDesigner.page ? root.PeelSewerDesigner.page() : { id: 'sewer', eyebrow: 'Labs', name: 'Sewer designer', answer: '<span class="muted">Loading…</span>' });
  const BUILD = { home, tight, site, growth, outlook, projects, eaflow, week, fsr, pipes, study, sewer, guides, roles, approvals, flows, network, capacity, fsrguide, capital, targets, forecast, glossary, help, data };
  // Each workspace's guide (How it works), a button in its footer.
  const GUIDE_OF = { site: 'flows', tight: 'capacity', growth: 'targets', fsr: 'fsrguide', projects: 'capital', eaflow: 'capital', pipes: 'network' };
  // A page's header count opens its workspace's full table (as the map panels' do).
  const FULL_OF = { home: 'tight', tight: 'tight', projects: 'projects', pipes: 'pipes' };
  function build(id) {
    const m = (BUILD[id] || home)(), RF = root.PeelReference, g = RF && GUIDE_OF[id] && RF.GUIDES.find(x => x[0] === GUIDE_OF[id]);
    if (m.status && !m.status.attrs && m.status.tone !== 'stage' && FULL_OF[id]) m.status = { ...m.status, attrs: { 'data-ws-go': FULL_OF[id], 'data-ws-fulltable': '1' }, title: 'Open the full table' };
    // A figure taken from a map panel opens the same thing from the page: the workspace's map, at it.
    const ws = W() && W().BY_ID && W().BY_ID[id] ? id : null;
    const onPage = a => { if (!a || !ws) return a; if (a['data-full-table'] != null) return { 'data-ws-go': ws, 'data-ws-fulltable': '1' }; if (a['data-ss']) return { 'data-ws-go': ws, 'data-ws-ss': a['data-ss'] }; if (a['data-ce-open']) return { 'data-ws-go': ws, 'data-ws-ce': a['data-ce-open'] }; return a; };
    if (m.figures && ws) m.figures = m.figures.map(f => (f && f.attrs && !f.attrs['data-ws-go'] && !f.attrs['data-ws-page'] ? { ...f, attrs: onPage(f.attrs) } : f));
    if (g && m.actions) m.actions = [...m.actions, { label: `${g[1]} ›`, attrs: { 'data-ws-page': g[0] }, title: `How it works: ${g[2]}` }];
    // Reference (step 5): Help, How it works (and each guide), the Glossary and Data sources share a bar.
    const REFW = { help: 'help', guides: 'guides', glossary: 'glossary', data: 'sources' }, R = W() && W().REF;
    const refOn = REFW[id] || (R && R[id] && R[id].guide ? 'guides' : null);
    if (refOn && root.PeelSections) m.top = `${wsBar('reference', id === 'data' && wsSec.reference ? wsSec.reference : refOn)}${m.top || ''}`;
    return m;
  }
  Object.assign(api, { build, tilesSVG, tileCredit, tilesOk, eaMap, eaTimelineHTML, capacityMap, devsMap, worksMap, pipesMap, siteMap, frame });
  root.PeelWsPages = api;
})(typeof window !== 'undefined' ? window : globalThis);
