/* js/census-view.js — population outlook card +
 * Growth › 2021 existing, the census block, and its panel (Phase 6 extraction; owner 2026-11-03).
 * Extracted verbatim from js/app.js (lines 1676-1721, 9702-9858); the only edits
 * are the reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmt1, roundPop, unit, uPop, hlP, store } = root.PeelUtil;
  const D = root.PeelDemand;
  const App = () => root.PeelApp;
  const AT = () => root.PeelAnalysisTabs;
  const PN = () => root.PeelPanel;
  const CA = () => root.PeelCensusAreas;
  const MM = () => root.PeelMapMarkers;
  const DU = () => root.PeelDemandUI;
  const DV = () => root.PeelDevVerdict;
  const SV = () => root.PeelSvcData;
  const PA = () => root.PeelPlanAreas;
  const SvcTab = () => root.PeelSvcTab;
  const P0 = () => root.PeelPhases;

/* ---- app.js lines 1676-1721 ---- */
  // ---- Housing activity (data/peel-housing.json) -----------------------------------------------
  // The Region's housing construction activity (CMHC's survey) and building permit statistics for
  // the latest full year, with each municipality's 5-year average; and, as a check, the units on
  // this app's building permit records issued that year.
  function housingActivityRows() {
    const P = App().state.housing && App().state.housing.peel; if (!P || !P.activity) return null;
    const A = P.activity.muni, B = (P.permits && P.permits.muni) || {};
    const full = o => Object.entries(o || {}).filter(([, v]) => !v.quarters || v.quarters === 4).map(([y]) => +y).sort((a, b) => a - b);
    const y = Math.max(...full(A.Mississauga)); if (!isFinite(y)) return null;
    const avg = (o, f) => { const ys = full(o).filter(k => k > y - 5 && k <= y); return ys.length ? ys.reduce((t, k) => t + f(o[k]), 0) / ys.length : null; };
    // Counted the app's way: once per building (its conditional, foundation and full permits share a number).
    const appPermits = m => P0().permitUnits(App().state.projects.filter(p => p.municipality === m).flatMap(p => p.records.filter(r => r.kind === 'permit' && r.phase !== 'cancelled' && r.events.some(e => e.phase === 'permit' && e.date.getUTCFullYear() === y))));
    const rows = ['Mississauga', 'Brampton', 'Caledon', 'Peel'].filter(m => A[m] && A[m][y]).map(m => ({
      m, starts: A[m][y].starts.all, completions: A[m][y].completions.all, absorbed: A[m][y].absorbed.all,
      permits: B[m] && B[m][y] ? B[m][y].units.all : null, value: B[m] && B[m][y] ? B[m][y].value.total : null,
      avgStarts: avg(A[m], v => v.starts.all), avgCompl: avg(A[m], v => v.completions.all),
      app: m === 'Peel' ? null : appPermits(m),
    }));
    return { y, rows, P };
  }
  function housingActivityHTML(h = housingActivityRows()) {
    if (!h) return '';
    const n = v => (v == null ? '–' : fmtNum(Math.round(v))), money = v => (v == null ? '–' : `$${fmtNum(Math.round(v / 1e6))} M`);
    const pr = h.rows.filter(r => r.app != null && r.permits);
    return `<section class="ov-card ov-activity" data-info="housing-activity"><div class="ov-h"><h3>Housing activity, ${h.y}</h3></div>
      <div class="hyd-scroll"><table class="dt"><thead><tr><th></th><th>Starts</th><th>Completions</th><th>Absorbed</th><th>Permit units</th><th>Permit value</th></tr></thead><tbody>
        ${h.rows.map(r => `<tr${r.m === 'Peel' ? ' class="tot"' : ''}><td>${esc(r.m)}</td><td>${n(r.starts)}<small>avg ${n(r.avgStarts)}</small></td><td>${n(r.completions)}<small>avg ${n(r.avgCompl)}</small></td><td>${n(r.absorbed)}</td><td>${n(r.permits)}</td><td>${money(r.value)}</td></tr>`).join('')}
      </tbody></table></div>
      ${pr.length ? `<p class="small muted">The check of this app's permit units against these Region figures is in ${DV().homeLine('records:checks', 'Records › Data checks')}.</p>` : ''}
      <p class="small muted">Region of Peel open data: housing construction activity (CMHC Starts and Completions Survey; averages over 5 years to ${h.y}) and building permit statistics (all permits, values in current dollars). Starts and completions replace the CMHC copy year by year: one series is kept.</p></section>`;
  }
  // ---- Population outlook (data/housing.json) --------------------------------------------------
  // Population outlook: census, the Ministry of Finance projection and the Region's 2051 forecast.
  function outlookRows() {
    const H = App().state.housing, F = App().state.reports && App().state.reports.forecast2051; if (!H || !H.mof) return null;
    const mof = H.mof.peel, region = F ? Object.values(F.municipalities).reduce((t, m) => t + m.pop2051, 0) : null, region21 = F ? Object.values(F.municipalities).reduce((t, m) => t + m.pop2021, 0) : null;
    return { mof, region, region21, y0: 2025, y1: 2051 };
  }
  // bare: without its own heading (in a fold whose summary names it: 2021 existing's panel).
  function outlookCardHTML(hideGo, bare) {
    const o = outlookRows(); if (!o) return '';
    const ys = Object.keys(o.mof).map(Number).sort((a, b) => a - b), v = ys.map(y => o.mof[y]);
    const W = 300, H = 92, L0 = 4, R0 = 4, T0 = 8, B0 = 16, lo = Math.min(...v, o.region21 || Infinity) * 0.97, hi = Math.max(...v, o.region || 0) * 1.02;
    const x = y => L0 + (W - L0 - R0) * (y - 2021) / (2051 - 2021), yv = n => T0 + (H - T0 - B0) * (1 - (n - lo) / (hi - lo));
    const gap = o.region ? o.region - o.mof[2051] : null;
    return `<section class="ov-card ov-outlook" data-info="outlook">${bare ? '' : `<div class="ov-h"><h3>Population outlook</h3>${hideGo ? '' : '<button type="button" class="btn small link ov-go" data-ov-tab="growth">Growth →</button>'}</div>`}
      <svg class="ov-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ministry of Finance projection for Peel against the Region's 2051 forecast">
        ${o.region ? `<line x1="${x(2021)}" y1="${yv(o.region21)}" x2="${x(2051)}" y2="${yv(o.region)}" class="sp-reg"/><circle cx="${x(2051)}" cy="${yv(o.region)}" r="3" class="sp-reg-d"/>` : ''}
        <path d="${ys.map((y, i) => `${i ? 'L' : 'M'}${x(y).toFixed(1)},${yv(v[i]).toFixed(1)}`).join('')}" class="sp-mof"/>
        ${[2021, 2031, 2041, 2051].map(y => `<text x="${x(y)}" y="${H - 3}" class="sp-ax" text-anchor="${y === 2021 ? 'start' : y === 2051 ? 'end' : 'middle'}">${y}</text>`).join('')}
      </svg>
      <div class="dca-key small"><span><i class="k-reg"></i>Region forecast (Growth Plan): ${fmtNum(roundPop(o.region))} by 2051</span><span><i class="k-mof"></i>Ministry of Finance: ${fmtNum(roundPop(o.mof[2051]))} by 2051</span></div>
      <p class="small">${gap > 0 ? `The province's summer 2026 projection has Peel <strong>≈${fmtNum(roundPop(gap))} people (${Math.round(gap / o.region * 100)}%) below</strong> the Region's 2051 forecast, dipping to ${fmtNum(roundPop(o.mof[2031]))} in 2031 (fewer temporary residents) before growing again. Growth-driven DC projects may be needed later than the forecast implies; the Ministry's projection is not a planning target.` : 'The Ministry of Finance projection is in line with the Region\'s 2051 forecast.'}</p></section>`;
  }
/* ---- app.js lines 9702-9858 ---- */
  // ---- Growth › 2021 existing (owner 2026-11-03: the census block, from Growth › Areas) ---------------------
  // Growth since the census, the 2051 forecast, housing activity and the population
  // outlook. Fills #growth-census-body, the full table of the panel growth:existing
  // (existingPanelSpec below); the pipeline body is filled by js/growth-ui.js.
  function renderGrowthCensus() {
    const body = $('#growth-census-body'); if (!body) return;
    SvcTab().ensureSvcModel();   // (built once per change of what it is built from, not on every filter change)
    // Area-only content: not shown at development scope (design audit, Group 6).
    if (window.DevScope && window.DevScope.current()) { body.innerHTML = window.PeelUtil.AREA_ONLY_NOTE; return; }
    const bc = CA().baselineCensus();
    const has = !!(bc && bc.das.length && App().state.projects.length);
    // (2021 existing is its own view: while the census loads it says so in place, never blank, and never
    // switches tab; Home's view says "Loading Growth › 2021 existing…" until the panel is set)
    CA().syncDaYear();
    if (!has) { body.innerHTML = `<p class="small muted">Census data is still loading.</p>`; return; }
    const Y = bc.year;
    // A file's record sheet narrows the block to its census DA (js/aerial-check.js showRecordDetail); only there (the
    // sheet's scope, 'file', where Growth is off and the block fills its hidden pane). At an area a DA is a leftover
    // of a sheet already closed (js/svc-scope.js drops it as the sheet closes): never this view's headline.
    const A = AT(), kind = A && A.scopeKind ? A.scopeKind() : null;
    const da = !kind || kind === 'file' ? App().state.daCtx : null;
    // The baseline year changed under a selected project: find its DA for the new year.
    if (da && da.year !== Y) { CA().setDaContext(da.project); return; }
    const g = { muni: App().state.muni, sp: App().state.sp, mtsa: App().state.mtsa };
    const base = da ? { population: da.pop, dwellings: da.dw, das: 1 } : PeelAreas.censusTotals(bc.das, g);
    const gr0 = PeelAreas.growthSince(da ? da.projects : App().state.projects, da ? {} : g, bc.date, App().state.criteria);
    // Employment growth: jobs on development sites (from the floor area the applications state).
    const jb = SvcTab().svcJobs((da ? da.projects : App().state.projects).filter(p => p.phase !== 'cancelled' && (da || PeelAreas.inGeo(g, { muni: p.municipality, sp: p.sp, mtsa: p.mtsa }))), bc.date);
    // (the growth layers on the commitment ladder: committed, a site servicing or building permit (the
    // Peel rule); then not committed yet, the rest of build-out)
    const L = PeelAreas.ladderLayers(gr0, jb);
    const gr = { built: { ...gr0.built, jobs: jb.jbuilt }, approved: L.committed, proposed: L.notYet };
    const name = da ? `DA ${da.id} (${da.muni || 'Peel'}), around ${da.title}`
      : [App().state.mtsa.length && PA().multiSummary('mtsa'), App().state.sp.length && PA().spSummary(), App().state.muni].filter(Boolean)[0] || 'Peel Region';
    const share = !!(App().state.sp.length || App().state.mtsa.length);
    const tile = (label, pop, dw, sub, info, jobs) => `<div class="tile" data-info="${info}"><div class="tl">${label}</div>
      <div class="tv">${fmtNum(Math.round(pop))}<span class="tu">people</span></div>
      <div class="ts">${fmtNum(Math.round(dw))} dwellings${sub ? ` · ${sub}` : ''}</div>${jobs != null ? `<div class="ts tj">${jobs > 0 ? `+${fmtNum(roundPop(jobs))} jobs` : 'no added jobs stated'}</div>` : ''}</div>`;
    const ha = gr.built.ha + gr.approved.ha + gr.proposed.ha, ii = gr.built.ii + gr.approved.ii + gr.proposed.ii;
    const why = baselineWhy(Y, App().state.yearFrom ?? null, App().timeActive(), App().state.censuses[App().state.censuses.length - 1].year);
    const asof = (DU().freshness()[0] && DU().freshness()[0].date) || '–';
    // The panel, worked out from the same values: its answer is the headline, its figures the four cards, its
    // method the ⓘ line (one copy of each). Only where the view shows (an area): at a servicing scope or a
    // selection the block still renders its hidden pane, and must not replace the area's panel, which Home reads.
    // (the housing rows and the 2051 rows worked out once, for both: the 2051 rows sum every municipality's
    // applications, so a second pass cost each filter change as much again)
    const shows = !(A && A.hiddenAt && A.scopeKind && A.hiddenAt(A.scopeKind(), 'growth', 'existing')), hs = da ? null : housingActivityRows(), fc = forecastRows(bc, da);
    const spec = existingPanelSpec({ name, Y, why, base, gr, da, share, asof, censusDay: CA().censusDay(bc.date),
      fc: shows ? fc : null, housing: shows ? hs : null, outlook: shows && !da ? outlookCardHTML(true, true) : '' });
    body.innerHTML = `
      ${hlP(spec.answer)}
      ${da ? `<div class="c-ctx"><button type="button" class="d-pill da" data-clear-da title="Back to all of ${esc(CA().daScopeName())}">DA ${esc(da.id)} · around ${esc(da.title)} <span aria-hidden="true">×</span></button>
        <span class="muted small">Census dissemination area of the selected development; growth from every development application located in it.</span></div>` : ''}
      <div class="tiles">${existingCards({ base, gr, Y, da, share }).map(c => tile(c.label, c.pop, c.dw, c.sub, c.info, c.jobs)).join('')}</div>
      <div class="growth-chart" id="gc-chart" data-info="growth-bars"></div>
      ${da ? `<p class="small muted">Wastewater I&amp;I for this area lives on the ${DV().homeLine('svc:network', 'Servicing › Network')}.</p>`
        : ha > 0 ? `<p class="small muted">Wastewater I&amp;I from growth since ${Y}: ${fmt1(ii)} L/s on ${fmtNum(Math.round(ha))} ha of development sites.</p>` : ''}
      ${forecastTableHTML(bc, fc)}
      ${da ? '' : housingActivityHTML(hs) + outlookCardHTML(true)}
      <p class="small muted">ⓘ ${esc(name)} · ${spec.method}</p>`;
    renderGrowthChart(base, gr, Y, $('#gc-chart'));
    if (shows && root.PeelPanel) root.PeelPanel.set('growth:existing', spec);
  }

  // Why the block uses the census it does (pure): the reason in the identity and the ⓘ line, read as
  // js/map-census.js baselineCensus reads the timeline (its start alone; with all years, or no start, the latest).
  // from: the timeline's first year (null with none); active: a timeline is set (a start, an end or both);
  // earliest: the earliest census with data.
  function baselineWhy(Y, from, active, earliest) {
    if (from == null) return active ? `timeline with no start year: the latest census (${Y})` : `all years: the latest census (${Y})`;
    return from < earliest ? `timeline starts ${from}; earliest census with data is ${earliest}` : `timeline starts ${from}`;
  }

  // The four cards, one copy for the pane's tiles and the panel's figures (pure): the census, then each layer
  // of growth added on top of it, in people and dwellings, with the units added and the jobs where stated.
  // share: a plan or MTSA filter (the census shared by land area).
  function existingCards({ base, gr, Y, da, share }) {
    const pct = (a, b) => (b > 0 ? ` (+${(a / b * 100).toFixed(1)}%)` : '');
    const nowPop = base.population + gr.built.population, nowDw = base.dwellings + gr.built.units;
    const futPop = nowPop + gr.approved.population, futDw = nowDw + gr.approved.units;
    const allPop = futPop + gr.proposed.population, allDw = futDw + gr.proposed.units;
    return [
      { label: da ? `${Y} Census · DA ${da.id}` : `${Y} Census`, pop: base.population, dw: base.dwellings, info: 'census-base',
        sub: da ? 'the selected development’s dissemination area' : `${fmtNum(base.das)} dissemination area${base.das === 1 ? '' : 's'}${share ? ', share by land area' : ''}` },
      { label: '+ Built since (estimate today)', pop: nowPop, dw: nowDw, sub: `+${fmtNum(gr.built.units)} units${pct(gr.built.units, base.dwellings)}`, info: 'census-built', jobs: gr.built.jobs },
      { label: '+ Committed, not yet built', pop: futPop, dw: futDw, sub: `+${fmtNum(gr.approved.units)} units${pct(futDw - base.dwellings, base.dwellings)} vs ${Y}`, info: 'census-approved', jobs: gr.approved.jobs },
      { label: '+ Not committed yet: full build-out of applications', pop: allPop, dw: allDw, sub: `+${fmtNum(gr.proposed.units)} units${pct(allDw - base.dwellings, base.dwellings)} vs ${Y}`, info: 'census-proposed', jobs: gr.proposed.jobs },
    ];
  }
  // ---- Growth › 2021 existing as the standard panel (pure; the census block above is its full table) -------
  // o: { name, Y, why, base, gr, da, share, asof, censusDay, fc (forecastRows), housing (housingActivityRows),
  // outlook (outlookCardHTML(true, true)) }. No footer action of its own: an area report counts the
  // developments shown with every filter, while this block counts the area's applications with the other
  // filters ignored (Home: Open the map · Full table · the targets guide).
  function existingPanelSpec(o) {
    const { name, Y, why, base, gr, da } = o;
    const sum = a => a[0] + a[1] + a[2];
    const answer = `Since the ${Y} Census, ${esc(name)} has added <strong>≈${fmtNum(Math.round(gr.built.population))} people</strong> in ${fmtNum(Math.round(gr.built.units))} dwellings; <strong>${fmtNum(roundPop(gr.approved.population + gr.proposed.population))} more people</strong> are committed or not committed yet in the application pipeline.`;
    const method = `${Y} Census baseline (${esc(why)}) · built = permits completed since census day (${esc(o.censusDay || '')})${gr.built.estimatedDates ? '; Brampton and Caledon completion dates estimated from issue date' : ''}; committed = units left to build a site servicing or building permit commits (the Peel rule); not committed yet = the rest of build-out (plan approved without a permit, zoning approved, in review, pre-application); people at Peel persons-per-unit; jobs on development sites from the floor area the applications state (existing jobs are not in the census) · other filters ignored · applications as of <strong>${esc(o.asof || '–')}</strong>.`;
    const figures = existingCards(o).map(c => ({ v: fmtNum(Math.round(c.pop)), u: 'people', label: c.label,
      ctx: `${fmtNum(Math.round(c.dw))} dwellings · ${c.sub}${c.jobs > 0 ? ` · +${fmtNum(roundPop(c.jobs))} jobs` : ''}`, attrs: { 'data-full-table': 'growth' } }));
    // (the rows are built from data: their names escaped, PeelPanel.kv writes its label as given)
    const fcRows = !da && o.fc ? o.fc.map(r => PN().kv(esc(r.m), `${fmtNum(roundPop(sum(r.p)))} of ${fmtNum(roundPop(r.fp))} people (${r.fp > 0 ? `${Math.round(sum(r.p) / r.fp * 100)}%` : '–'}) · ${r.fp > sum(r.p) ? `${fmtNum(roundPop(r.fp - sum(r.p)))} still to plan for` : `exceeds by ${fmtNum(roundPop(sum(r.p) - r.fp))}`}`)) : [];
    const h = !da && o.housing ? o.housing : null, n = v => (v == null ? '–' : fmtNum(Math.round(v)));
    const haRows = h ? h.rows.map(r => PN().kv(esc(r.m), `${n(r.starts)} starts · ${n(r.completions)} completions · ${n(r.permits)} permit units`)) : [];
    return {
      calc: true, fullTitle: `Growth › 2021 existing · ${name}: the ${Y} Census, built since, committed and not committed yet; the 2051 forecast, housing activity and the population outlook`,
      head: PN().areaHead('Growth › 2021 existing', 'What has been built since the census, and what is still to come?', null, `${esc(name)} · ${Y} Census baseline${Y !== 2021 ? ` (${esc(why)})` : ''}`),
      answer, figures,
      chart: `<div class="growth-chart" data-info="growth-bars">${growthChartHTML(base, gr, Y)}</div>`,
      lists: [
        { title: 'Against the 2051 forecast', rows: fcRows, total: fcRows.length, seeAll: { 'data-full-table': 'growth', 'data-ft-go': 'Applications against the 2051 forecast' } },
        ...(h ? [{ title: `Housing activity, ${h.y}`, rows: haRows, total: haRows.length, seeAll: { 'data-full-table': 'growth', 'data-ft-go': 'Housing activity' } }] : []),
      ],
      folds: !da && o.outlook ? [{ title: 'Population outlook', html: o.outlook }] : [],
      method,
      sources: 'Statistics Canada 2021 Census (2016 when the timeline starts before 2021), dissemination areas; the building permits and applications on the map; Region of Peel Land Needs Assessment (draft 2051 allocation, August 2024); Region of Peel housing activity (CMHC) and building permits; Ontario Ministry of Finance projections (summer 2026).',
    };
  }

  // Growth in the application pipeline against the 2051 growth allocated to each
  // municipality (Peel Land Needs Assessment, draft municipal allocation): how much of
  // the forecast growth is already built, approved or proposed, and how much is still
  // to be planned for. Slimmed for Growth › 2021 existing: one compact table with
  // the full built / approved / proposed split behind "See all".
  // The rows (one copy of the sums: the table and the panel's list): each municipality, Peel last; null with
  // no forecast or at a DA.
  // da: the census DA the block is narrowed to (renderGrowthCensus's; by default the app's).
  function forecastRows(bc, da = App().state.daCtx) {
    const F = App().state.reports && App().state.reports.forecast2051;
    if (!F || da) return null;
    const munis = Object.keys(F.municipalities).filter(m => !App().state.muni || m === App().state.muni);
    const rows = munis.map(m => {
      const f = F.municipalities[m], projects = App().state.projects.filter(p => p.municipality === m && p.phase !== 'cancelled');
      const gr = PeelAreas.growthSince(projects, { muni: m }, bc.date, App().state.criteria), j = SvcTab().svcJobs(projects, bc.date);
      return { m, fp: f.pop2051 - f.pop2021, fu: f.units2051 - f.units2021, fj: f.jobs2051 - f.jobs2021,
        p: [gr.built.population, gr.approved.population, gr.proposed.population], u: [gr.built.units, gr.approved.units, gr.proposed.units], j: [j.jbuilt, j.japproved, j.jproposed] };
    });
    if (munis.length > 1) rows.push(rows.reduce((t, r) => ({ m: 'Peel', fp: t.fp + r.fp, fu: t.fu + r.fu, fj: t.fj + r.fj, p: t.p.map((v, i) => v + r.p[i]), u: t.u.map((v, i) => v + r.u[i]), j: t.j.map((v, i) => v + r.j[i]) }), { fp: 0, fu: 0, fj: 0, p: [0, 0, 0], u: [0, 0, 0], j: [0, 0, 0] }));
    return rows;
  }
  function forecastTableHTML(bc, rows = forecastRows(bc)) {
    if (!rows) return '';
    const F = App().state.reports.forecast2051;
    const pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const sum = a => a[0] + a[1] + a[2];
    const uU = n => unit(fmtNum(Math.round(n)), 'units'), uJ = n => unit(fmtNum(Math.round(n)), 'jobs');
    const main = rows.map(r => `<tr class="${r.m === 'Peel' ? 'tot' : ''}"><td>${esc(r.m)}</td><td>${uPop(r.fp)}</td><td>${uPop(sum(r.p))}<small>${pct(sum(r.p), r.fp)} of 2051 growth</small></td><td class="bo">${r.fp > sum(r.p) ? uPop(r.fp - sum(r.p)) : `<span class="over">exceeds by ${uPop(sum(r.p) - r.fp)}</span>`}</td></tr>`).join('');
    const full = rows.map(r => `<tr class="${r.m === 'Peel' ? 'tot' : ''}"><td>${esc(r.m)}</td><td>${uPop(r.p[0])}</td><td>${uPop(r.p[1])}</td><td>${uPop(r.p[2])}</td><td>${uU(sum(r.u))}</td><td>${uJ(sum(r.j))}</td></tr>`).join('');
    // Stage 1 #8: the comparison names its source (document, date, draft or final) and its basis.
    const srcLine = `Source: ${esc(F.title)} (${esc(F.date || 'date not stated')}, ${esc(F.status || 'status not stated')}; ${esc(F.pages || '')})`;
    return `<table class="dt" data-source-status="${esc(F.status || '')}"><caption>Applications against the 2051 forecast <span class="muted">growth since the ${bc.year} Census vs. growth allocated to 2051</span><br><small class="cap-src">${srcLine}. Pipeline people are at Peel design criteria (persons per unit); the allocation is a population forecast, so the two are compared, not reconciled.</small></caption><thead><tr><th>Municipality</th><th>2051 growth allocated</th><th>Built + approved + proposed</th><th>Still to plan for</th></tr></thead><tbody>${main}</tbody></table>
      <details class="see-all"><summary>See all: built / approved / proposed by municipality</summary>
      <table class="dt"><thead><tr><th>Municipality</th><th>Built since 2021</th><th>Approved</th><th>In review</th><th>Units</th><th>Jobs</th></tr></thead><tbody>${full}</tbody></table>
      <p class="small muted">${esc(F.note)} Pipeline = growth since census day from every development in the municipality (built = permits completed since census day; approved; proposed = in pre-consultation or review), at Peel's design persons per unit; jobs only where the applications state floor area. Design persons per unit (2.7 per apartment) are higher than the average household size behind the forecast, so the units column is the fairer comparison; the pipeline also includes applications that may not be built by 2051. Source: <a href="${esc(F.url)}" target="_blank" rel="noopener">${esc(F.title)}</a>, ${esc(F.pages)}.</p></details>`;
  }

  // Stacked bar: 2021 baseline, then each layer of growth up to full build-out of the
  // planning applications. One bar per measure (people, dwellings), sharing nothing but the
  // layer order, so there is no second axis. Values are direct-labelled in the legend.
  // el: the container (the Pipeline sub-view renders a copy with no census baseline).
  // One label, one definition (SPEC 1.9): opt.builtLabel names a narrower "built since" (the
  // developments shown) apart from 2021 existing's every completed permit.
  // growthChartHTML: the chart's HTML (pure; 2021 existing's panel draws it too).
  function renderGrowthChart(base, gr, Y = 2021, el, opt = {}) {
    const target = el || $('#c-chart');
    if (target) target.innerHTML = growthChartHTML(base, gr, Y, opt);
  }
  function growthChartHTML(base, gr, Y = 2021, opt = {}) {
    const layers = [
      { key: 'base', label: `${Y} Census`, people: base.population, dwellings: base.dwellings, jobs: 0 },
      { key: 'built', label: opt.builtLabel || `Built since ${Y} (every permit completed since census day)`, people: gr.built.population, dwellings: gr.built.units, jobs: gr.built.jobs || 0 },
      { key: 'approved', label: 'Committed (a site servicing or building permit, not yet built)', people: gr.approved.population, dwellings: gr.approved.units, jobs: gr.approved.jobs || 0 },
      { key: 'proposed', label: 'Not committed yet (plan approved without a permit, in review, pre-application)', people: gr.proposed.population, dwellings: gr.proposed.units, jobs: gr.proposed.jobs || 0 },
    ].filter(l => l.people + l.dwellings + (l.jobs || 0) > 0);
    const bar = (measure, unit) => {
      const total = layers.reduce((t, l) => t + l[measure], 0);
      if (!(total > 0)) return '';
      const segs = layers.filter(l => l[measure] > 0).map(l => {
        const w = l[measure] / total * 100;
        const tip = `${l.label}: ${fmtNum(Math.round(l[measure]))} ${unit} (${w.toFixed(1)}% of build-out)`;
        return `<span class="gseg g-${l.key}" style="flex:${l[measure]}" tabindex="0" data-tip="${esc(tip)}" aria-label="${esc(tip)}"></span>`;
      }).join('');
      return `<div class="grow-row"><div class="grow-label">${unit[0].toUpperCase() + unit.slice(1)}</div>
        <div class="grow-bar" role="img" aria-label="${esc(layers.map(l => `${l.label} ${fmtNum(Math.round(l[measure]))}`).join(', '))} ${unit}">${segs}</div>
        <div class="grow-total">${fmtNum(Math.round(total))}<span class="u">${unit === 'people' ? 'pop' : unit === 'jobs' ? 'jobs' : 'units'}</span></div></div>`;
    };
    const legend = layers.map(l => `<li><i class="gsw g-${l.key}" aria-hidden="true"></i><span>${esc(l.label)}</span>
      <span class="gv">${l.key === 'base' ? '' : '+'}${fmtNum(Math.round(l.people))} people · ${l.key === 'base' ? '' : '+'}${fmtNum(Math.round(l.dwellings))} dwellings${l.key === 'base' ? '' : ` · +${fmtNum(roundPop(l.jobs))} jobs`}</span></li>`).join('');
    return `${bar('people', 'people')}${bar('dwellings', 'dwellings')}${bar('jobs', 'jobs')}
      <ul class="grow-legend">${legend}</ul><div class="grow-tip" hidden></div>`;
  }
  // A chart's tooltip placed from its own height, once its text is set: it wraps at 220 px (css/app.css .grow-tip),
  // so a long label is 3 or 4 lines (58 to 76 px; it was placed for one line, 34 px above the pointer, and covered the
  // bar). Its bottom 6 px above the segment it describes, or its top 6 px below it where the chart has no room above
  // (the first bar), so it never covers that bar. Left: after the pointer (x: a hover or a tap), kept in the chart for
  // its 220 px; at the chart's left on keyboard focus (x null). box: the chart's.
  function placeTip(tip, box, seg, x) {
    tip.style.left = x == null ? '0px' : `${Math.min(box.width - 220, Math.max(0, x - box.left + 12))}px`;   // (first: its wrap follows)
    const r = seg.getBoundingClientRect(), top = r.top - 6 - box.top - tip.offsetHeight;
    tip.style.top = `${top >= 0 ? top : r.bottom - box.top + 6}px`;
  }
  // Hover / tap tooltip for the growth bars (delegated: both growth sub-views render a chart).
  const growTip = e => {
    if (!e.target.closest) return;
    const chart = e.target.closest('.growth-chart'); if (!chart) return;
    const s = e.target.closest('[data-tip]'), tip = chart.querySelector('.grow-tip');
    if (!tip) return;
    if (!s) { tip.hidden = true; return; }
    tip.textContent = s.dataset.tip; tip.hidden = false;
    placeTip(tip, chart.getBoundingClientRect(), s, e.clientX);
  };
  document.addEventListener('pointermove', growTip);
  document.addEventListener('pointerdown', growTip);   // tap on phones
  document.addEventListener('pointerout', e => {
    if (!e.target.closest) return;
    const chart = e.target.closest('.growth-chart');
    if (chart && !chart.contains(e.relatedTarget)) { const t = chart.querySelector('.grow-tip'); if (t) t.hidden = true; }
  });
  document.addEventListener('focusin', e => {
    if (!e.target.closest) return;
    const chart = e.target.closest('.growth-chart'); if (!chart) return;
    const s = e.target.closest('[data-tip]'), tip = chart.querySelector('.grow-tip'); if (!s || !tip) return;
    tip.textContent = s.dataset.tip; tip.hidden = false; placeTip(tip, chart.getBoundingClientRect(), s, null);
  });

  // Hover / tap tooltip for the capacity bars (wastewater plants, water capacity).
  const capTip = e => {
    const ch = e.target.closest && e.target.closest('.cap-chart'); if (!ch) return;
    const tip = ch.querySelector('.grow-tip'), sEl = e.target.closest('[data-tip]'); if (!tip) return;
    if (!sEl) { tip.hidden = true; return; }
    tip.textContent = sEl.dataset.tip; tip.hidden = false;
    placeTip(tip, ch.getBoundingClientRect(), sEl, e.clientX);
  };
  document.addEventListener('pointermove', capTip);
  document.addEventListener('pointerdown', capTip);
  document.addEventListener('pointerout', e => { const ch = e.target.closest && e.target.closest('.cap-chart'); if (ch && !ch.contains(e.relatedTarget)) { const t = ch.querySelector('.grow-tip'); if (t) t.hidden = true; } });

  // ---- Public contract ----
  // Permit check (Stage 1 #7), shown in Records › Checks and as a caveat on the Growth and Overview
  // headlines while any municipality fails.
  function permitCheck() {
    const h = housingActivityRows(); if (!h) return null;
    const rows = root.PeelUtil.permitCheckRows(h.rows.filter(r => r.m !== 'Peel').map(r => ({ m: r.m, app: r.app, region: r.permits })));
    return { y: h.y, rows, failing: rows.filter(r => !r.pass).map(r => r.m) };
  }
  function permitCheckHTML() {
    const c = permitCheck(); if (!c || !c.rows.length) return '';
    const n = v => fmtNum(Math.round(v));
    return `<h3 class="sub-title" data-info="housing-activity">Permit counts vs Region figures, ${c.y}</h3>
      <table class="dt fr-table" data-check="permits"><thead><tr><th>Municipality</th><th>This app's permit records</th><th>Region permit statistics</th><th>Difference</th><th>Result</th></tr></thead><tbody>
      ${c.rows.map(r => `<tr data-pass="${r.pass}"><td>${esc(r.m)}</td><td>${n(r.app)} units</td><td>${n(r.region)} units</td><td>${r.diff >= 0 ? '+' : '−'}${Math.abs(r.diff * 100).toFixed(0)}%</td><td><span class="fr-b ${r.pass ? 'fr-ok' : 'fr-stale'}">${r.pass ? 'Pass' : 'Fail'}</span></td></tr>`).join('')}
      </tbody></table>
      <p class="small muted">Units on this app's building permit records issued in ${c.y} (counted once per building) against the Region of Peel's building permit statistics (open data, all permits). Fails when off by more than ${Math.round(root.PeelUtil.PERMIT_TOL * 100)}%: the records may use a different issue date, permit type or unit count, so permit-based figures (completions, the Permitted counts) read with care for a failing municipality.</p>`;
  }
  // The one-line caveat (Growth pipeline and Overview headlines).
  function permitCaveatHTML() {
    // (Not inside a servicing scope: Records has no Checks there, so the link would lead nowhere.)
    if (root.PeelSvcScope && root.PeelSvcScope.current && root.PeelSvcScope.current()) return '';
    const c = permitCheck(); if (!c || !c.failing.length) return '';
    const list = c.failing.length > 1 ? `${c.failing.slice(0, -1).join(', ')} and ${c.failing[c.failing.length - 1]}` : c.failing[0];
    return `<p class="small caveat" data-caveat="permits">Permit counts differ from Region figures for ${esc(list)}; see ${DV().homeLine('records:checks', 'Records › Data checks')}</p>`;
  }
  const api = { permitCheck, permitCheckHTML, permitCaveatHTML, outlookRows, outlookCardHTML, housingActivityRows, housingActivityHTML, renderGrowthCensus, renderGrowthChart, forecastTableHTML,
    growthChartHTML, forecastRows, existingCards, existingPanelSpec, baselineWhy, placeTip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCensusView = api;
})(typeof window !== 'undefined' ? window : globalThis);
