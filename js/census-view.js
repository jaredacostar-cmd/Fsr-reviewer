/* js/census-view.js — population outlook card +
 * the Growth tab's Census & 2051 sub-view (Phase 6 extraction).
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
    const appPermits = m => P0().permitUnits(App().state.projects.filter(p => p.municipality === m).flatMap(p => p.records.filter(r => r.kind === 'permit' && r.phase !== 'cancelled' && r.events.some(e => e.phase === 'permit' && e.date.getFullYear() === y))));
    const rows = ['Mississauga', 'Brampton', 'Caledon', 'Peel'].filter(m => A[m] && A[m][y]).map(m => ({
      m, starts: A[m][y].starts.all, completions: A[m][y].completions.all, absorbed: A[m][y].absorbed.all,
      permits: B[m] && B[m][y] ? B[m][y].units.all : null, value: B[m] && B[m][y] ? B[m][y].value.total : null,
      avgStarts: avg(A[m], v => v.starts.all), avgCompl: avg(A[m], v => v.completions.all),
      app: m === 'Peel' ? null : appPermits(m),
    }));
    return { y, rows, P };
  }
  function housingActivityHTML() {
    const h = housingActivityRows(); if (!h) return '';
    const n = v => (v == null ? '–' : fmtNum(Math.round(v))), money = v => (v == null ? '–' : `$${fmtNum(Math.round(v / 1e6))} M`);
    const pr = h.rows.filter(r => r.app != null && r.permits);
    return `<section class="ov-card ov-activity" data-info="housing-activity"><div class="ov-h"><h3>Housing activity, ${h.y}</h3></div>
      <div class="hyd-scroll"><table class="dt"><thead><tr><th></th><th>Starts</th><th>Completions</th><th>Absorbed</th><th>Permit units</th><th>Permit value</th></tr></thead><tbody>
        ${h.rows.map(r => `<tr${r.m === 'Peel' ? ' class="tot"' : ''}><td>${esc(r.m)}</td><td>${n(r.starts)}<small>avg ${n(r.avgStarts)}</small></td><td>${n(r.completions)}<small>avg ${n(r.avgCompl)}</small></td><td>${n(r.absorbed)}</td><td>${n(r.permits)}</td><td>${money(r.value)}</td></tr>`).join('')}
      </tbody></table></div>
      ${pr.length ? `<p class="small">Check: units on this app's building permit records issued in ${h.y}: ${pr.map(r => `${esc(r.m)} ${n(r.app)} (Region ${n(r.permits)})`).join(' · ')}.</p>` : ''}
      <p class="small muted">Region of Peel open data: housing construction activity (CMHC Starts and Completions Survey; averages over 5 years to ${h.y}) and building permit statistics (all permits, values in current dollars). Starts and completions replace the CMHC copy year by year: one series is kept.</p></section>`;
  }
  // ---- Population outlook (data/housing.json) --------------------------------------------------
  // Population outlook: census, the Ministry of Finance projection and the Region's 2051 forecast.
  function outlookRows() {
    const H = App().state.housing, F = App().state.reports && App().state.reports.forecast2051; if (!H || !H.mof) return null;
    const mof = H.mof.peel, region = F ? Object.values(F.municipalities).reduce((t, m) => t + m.pop2051, 0) : null, region21 = F ? Object.values(F.municipalities).reduce((t, m) => t + m.pop2021, 0) : null;
    return { mof, region, region21, y0: 2025, y1: 2051 };
  }
  function outlookCardHTML(hideGo) {
    const o = outlookRows(); if (!o) return '';
    const ys = Object.keys(o.mof).map(Number).sort((a, b) => a - b), v = ys.map(y => o.mof[y]);
    const W = 300, H = 92, L0 = 4, R0 = 4, T0 = 8, B0 = 16, lo = Math.min(...v, o.region21 || Infinity) * 0.97, hi = Math.max(...v, o.region || 0) * 1.02;
    const x = y => L0 + (W - L0 - R0) * (y - 2021) / (2051 - 2021), yv = n => T0 + (H - T0 - B0) * (1 - (n - lo) / (hi - lo));
    const gap = o.region ? o.region - o.mof[2051] : null;
    return `<section class="ov-card ov-outlook" data-info="outlook"><div class="ov-h"><h3>Population outlook</h3>${hideGo ? '' : '<button type="button" class="btn small link ov-go" data-ov-tab="growth">Growth →</button>'}</div>
      <svg class="ov-spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ministry of Finance projection for Peel against the Region's 2051 forecast">
        ${o.region ? `<line x1="${x(2021)}" y1="${yv(o.region21)}" x2="${x(2051)}" y2="${yv(o.region)}" class="sp-reg"/><circle cx="${x(2051)}" cy="${yv(o.region)}" r="3" class="sp-reg-d"/>` : ''}
        <path d="${ys.map((y, i) => `${i ? 'L' : 'M'}${x(y).toFixed(1)},${yv(v[i]).toFixed(1)}`).join('')}" class="sp-mof"/>
        ${[2021, 2031, 2041, 2051].map(y => `<text x="${x(y)}" y="${H - 3}" class="sp-ax" text-anchor="${y === 2021 ? 'start' : y === 2051 ? 'end' : 'middle'}">${y}</text>`).join('')}
      </svg>
      <div class="dca-key small"><span><i class="k-reg"></i>Region forecast (Growth Plan): ${fmtNum(roundPop(o.region))} by 2051</span><span><i class="k-mof"></i>Ministry of Finance: ${fmtNum(roundPop(o.mof[2051]))} by 2051</span></div>
      <p class="small">${gap > 0 ? `The province's summer 2026 projection has Peel <strong>≈${fmtNum(roundPop(gap))} people (${Math.round(gap / o.region * 100)}%) below</strong> the Region's 2051 forecast, dipping to ${fmtNum(roundPop(o.mof[2031]))} in 2031 (fewer temporary residents) before growing again. Growth-driven DC projects may be needed later than the forecast implies; the Ministry's projection is not a planning target.` : 'The Ministry of Finance projection is in line with the Region\'s 2051 forecast.'}</p></section>`;
  }
/* ---- app.js lines 9702-9858 ---- */
  // ---- Census & 2051 sub-view ---------------------------------------------------------------
  // Growth since the census, the 2051 allocation and the population
  // outlook. Fills #growth-census-body (Worker A's pane); the pipeline body is filled
  // by renderGrowthPipeline above.
  function renderGrowthCensus() {
    const body = $('#growth-census-body'); if (!body) return;
    SvcTab().renderSvcTab();
    // Area-only content: not shown at development scope (design audit, Group 6).
    if (window.DevScope && window.DevScope.current()) { body.innerHTML = window.PeelUtil.AREA_ONLY_NOTE; return; }
    const bc = CA().baselineCensus();
    const has = !!(bc && bc.das.length && App().state.projects.length);
    // Phase 4: census is a Growth sub-view now — hide its subtab (and leave it) when
    // there is no census data, mirroring the old tab's show/hide.
    const gcPane = $('#pane-growth-census'), gcBtn = document.querySelector('[data-gsub="census2051"]');
    if (gcPane) gcPane.dataset.off = has ? '' : '1';
    if (gcBtn) gcBtn.hidden = !has;
    if (!has && AT().getGSub() === 'census2051') { AT().setGSub('pipeline'); store.set('gSub', 'pipeline'); }
    AT().showFootTab(AT().getFootPref());
    CA().syncDaYear();
    if (!has) { body.innerHTML = `<p class="small muted">Census data is still loading.</p>`; return; }
    const Y = bc.year;
    const da = App().state.daCtx;
    // The baseline year changed under a selected project: find its DA for the new year.
    if (da && da.year !== Y) { CA().setDaContext(da.project); return; }
    const g = { muni: App().state.muni, sp: App().state.sp, mtsa: App().state.mtsa };
    const base = da ? { population: da.pop, dwellings: da.dw, das: 1 } : PeelAreas.censusTotals(bc.das, g);
    const gr = PeelAreas.growthSince(da ? da.projects : App().state.projects, da ? {} : g, bc.date, App().state.criteria);
    // Employment growth: jobs on development sites (from the floor area the applications state).
    const jb = SvcTab().svcJobs((da ? da.projects : App().state.projects).filter(p => p.phase !== 'cancelled' && (da || PeelAreas.inGeo(g, { muni: p.municipality, sp: p.sp, mtsa: p.mtsa }))), bc.date);
    gr.built.jobs = jb.jbuilt; gr.approved.jobs = jb.japproved; gr.proposed.jobs = jb.jproposed;
    const name = da ? `DA ${da.id} (${da.muni || 'Peel'}), around ${da.title}`
      : [App().state.mtsa.length && PA().multiSummary('mtsa'), App().state.sp.length && PA().spSummary(), App().state.muni].filter(Boolean)[0] || 'Peel Region';
    const pct = (a, b) => b > 0 ? ` (+${(a / b * 100).toFixed(1)}%)` : '';
    const nowPop = base.population + gr.built.population, nowDw = base.dwellings + gr.built.units;
    const futPop = nowPop + gr.approved.population, futDw = nowDw + gr.approved.units;
    const allPop = futPop + gr.proposed.population, allDw = futDw + gr.proposed.units;
    const tile = (label, pop, dw, sub, info, jobs) => `<div class="tile" data-info="${info}"><div class="tl">${label}</div>
      <div class="tv">${fmtNum(Math.round(pop))}<span class="tu">people</span></div>
      <div class="ts">${fmtNum(Math.round(dw))} dwellings${sub ? ` · ${sub}` : ''}</div>${jobs != null ? `<div class="ts tj">${jobs > 0 ? `+${fmtNum(roundPop(jobs))} jobs` : 'no added jobs stated'}</div>` : ''}</div>`;
    const ha = gr.built.ha + gr.approved.ha + gr.proposed.ha, ii = gr.built.ii + gr.approved.ii + gr.proposed.ii;
    const start = App().timeActive() ? (App().state.yearFrom ?? App().state.yearMin) : null;
    const earliest = App().state.censuses[App().state.censuses.length - 1].year;
    const why = start == null ? `all years: earliest census with data (${earliest})` : start < earliest ? `timeline starts ${start}; earliest census with data is ${earliest}` : `timeline starts ${start}`;
    const asof = (DU().freshness()[0] && DU().freshness()[0].date) || '–';
    body.innerHTML = `
      ${hlP(`Since the ${Y} Census, ${esc(name)} has added <strong>≈${fmtNum(Math.round(gr.built.population))} people</strong> in ${fmtNum(Math.round(gr.built.units))} dwellings; <strong>${fmtNum(roundPop(gr.approved.population + gr.proposed.population))} more people</strong> are approved or proposed in the application pipeline.`)}
      ${da ? `<div class="c-ctx"><button type="button" class="d-pill da" data-clear-da title="Back to all of ${esc(CA().daScopeName())}">DA ${esc(da.id)} · around ${esc(da.title)} <span aria-hidden="true">×</span></button>
        <span class="muted small">Census dissemination area of the selected development; growth from every development application located in it.</span></div>` : ''}
      <div class="tiles">${[
        tile(da ? `${Y} Census · DA ${da.id}` : `${Y} Census`, base.population, base.dwellings, da ? 'the selected development’s dissemination area' : `${fmtNum(base.das)} dissemination area${base.das === 1 ? '' : 's'}${App().state.sp.length || App().state.mtsa.length ? ', share by land area' : ''}`, 'census-base'),
        tile('+ Built since (estimate today)', nowPop, nowDw, `+${fmtNum(gr.built.units)} units${pct(gr.built.units, base.dwellings)}`, 'census-built', gr.built.jobs),
        tile('+ Approved or permitted, not yet built', futPop, futDw, `+${fmtNum(gr.approved.units)} units${pct(futDw - base.dwellings, base.dwellings)} vs ${Y}`, 'census-approved', gr.approved.jobs),
        tile('+ Proposed: full build-out of applications', allPop, allDw, `+${fmtNum(gr.proposed.units)} units${pct(allDw - base.dwellings, base.dwellings)} vs ${Y}`, 'census-proposed', gr.proposed.jobs),
      ].join('')}</div>
      <div class="growth-chart" id="gc-chart" data-info="growth-bars"></div>
      ${da ? `<p class="small muted">Wastewater I&amp;I for this area lives on the ${DV().homeLine('ww', 'Servicing › Wastewater')}.</p>`
        : ha > 0 ? `<p class="small muted">Wastewater I&amp;I from growth since ${Y}: ${fmt1(ii)} L/s on ${fmtNum(Math.round(ha))} ha of development sites.</p>` : ''}
      ${forecastTableHTML(bc)}
      ${da ? '' : housingActivityHTML() + outlookCardHTML(true)}
      <p class="small muted">ⓘ ${esc(name)} · ${Y} Census baseline (${esc(why)}) · built = permits completed since census day (${CA().censusDay(bc.date)})${gr.built.estimatedDates ? '; Brampton and Caledon completion dates estimated from issue date' : ''}; approved = site plan approved or building permit issued, not yet built; proposed = applications in pre-consultation or review; people at Peel persons-per-unit; jobs on development sites from the floor area the applications state (existing jobs are not in the census) · other filters ignored · applications as of <strong>${esc(asof)}</strong>.</p>`;
    renderGrowthChart(base, gr, Y, $('#gc-chart'));
  }

  // Growth in the application pipeline against the 2051 growth allocated to each
  // municipality (Peel Land Needs Assessment, draft municipal allocation): how much of
  // the forecast growth is already built, approved or proposed, and how much is still
  // to be planned for. Slimmed for the Census & 2051 sub-view: one compact table with
  // the full built / approved / proposed split behind "See all".
  function forecastTableHTML(bc) {
    const F = App().state.reports && App().state.reports.forecast2051;
    if (!F || App().state.daCtx) return '';
    const munis = Object.keys(F.municipalities).filter(m => !App().state.muni || m === App().state.muni);
    const pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const rows = munis.map(m => {
      const f = F.municipalities[m], projects = App().state.projects.filter(p => p.municipality === m && p.phase !== 'cancelled');
      const gr = PeelAreas.growthSince(projects, { muni: m }, bc.date, App().state.criteria), j = SvcTab().svcJobs(projects, bc.date);
      return { m, fp: f.pop2051 - f.pop2021, fu: f.units2051 - f.units2021, fj: f.jobs2051 - f.jobs2021,
        p: [gr.built.population, gr.approved.population, gr.proposed.population], u: [gr.built.units, gr.approved.units, gr.proposed.units], j: [j.jbuilt, j.japproved, j.jproposed] };
    });
    if (munis.length > 1) rows.push(rows.reduce((t, r) => ({ m: 'Peel', fp: t.fp + r.fp, fu: t.fu + r.fu, fj: t.fj + r.fj, p: t.p.map((v, i) => v + r.p[i]), u: t.u.map((v, i) => v + r.u[i]), j: t.j.map((v, i) => v + r.j[i]) }), { fp: 0, fu: 0, fj: 0, p: [0, 0, 0], u: [0, 0, 0], j: [0, 0, 0] }));
    const sum = a => a[0] + a[1] + a[2];
    const uU = n => unit(fmtNum(Math.round(n)), 'units'), uJ = n => unit(fmtNum(Math.round(n)), 'jobs');
    const main = rows.map(r => `<tr class="${r.m === 'Peel' ? 'tot' : ''}"><td>${esc(r.m)}</td><td>${uPop(r.fp)}</td><td>${uPop(sum(r.p))}<small>${pct(sum(r.p), r.fp)} of 2051 growth</small></td><td class="bo">${r.fp > sum(r.p) ? uPop(r.fp - sum(r.p)) : `<span class="over">exceeds by ${uPop(sum(r.p) - r.fp)}</span>`}</td></tr>`).join('');
    const full = rows.map(r => `<tr class="${r.m === 'Peel' ? 'tot' : ''}"><td>${esc(r.m)}</td><td>${uPop(r.p[0])}</td><td>${uPop(r.p[1])}</td><td>${uPop(r.p[2])}</td><td>${uU(sum(r.u))}</td><td>${uJ(sum(r.j))}</td></tr>`).join('');
    return `<table class="dt"><caption>Applications against the 2051 forecast <span class="muted">growth since the ${bc.year} Census vs. growth allocated to 2051</span></caption><thead><tr><th>Municipality</th><th>2051 growth allocated</th><th>Built + approved + proposed</th><th>Still to plan for</th></tr></thead><tbody>${main}</tbody></table>
      <details class="see-all"><summary>See all: built / approved / proposed by municipality</summary>
      <table class="dt"><thead><tr><th>Municipality</th><th>Built</th><th>Committed</th><th>Proposed</th><th>Units</th><th>Jobs</th></tr></thead><tbody>${full}</tbody></table>
      <p class="small muted">${esc(F.note)} Pipeline = growth since census day from every development in the municipality (built = permits completed since census day; approved; proposed = in pre-consultation or review), at Peel's design persons per unit; jobs only where the applications state floor area. Design persons per unit (2.7 per apartment) are higher than the average household size behind the forecast, so the units column is the fairer comparison; the pipeline also includes applications that may not be built by 2051. Source: <a href="${esc(F.url)}" target="_blank" rel="noopener">${esc(F.title)}</a>, ${esc(F.pages)}.</p></details>`;
  }

  // Stacked bar: 2021 baseline, then each layer of growth up to full build-out of the
  // planning applications. One bar per measure (people, dwellings), sharing nothing but the
  // layer order, so there is no second axis. Values are direct-labelled in the legend.
  // el: the container (the Pipeline sub-view renders a copy with no census baseline).
  // One label, one definition (SPEC 1.9): opt.builtLabel names a narrower "built since" (the
  // developments shown) apart from the Census view's every completed permit.
  function renderGrowthChart(base, gr, Y = 2021, el, opt = {}) {
    const layers = [
      { key: 'base', label: `${Y} Census`, people: base.population, dwellings: base.dwellings, jobs: 0 },
      { key: 'built', label: opt.builtLabel || `Built since ${Y} (every permit completed since census day)`, people: gr.built.population, dwellings: gr.built.units, jobs: gr.built.jobs || 0 },
      { key: 'approved', label: 'Committed (draft plan or site plan approved, permit, construction)', people: gr.approved.population, dwellings: gr.approved.units, jobs: gr.approved.jobs || 0 },
      { key: 'proposed', label: 'Proposed (in review)', people: gr.proposed.population, dwellings: gr.proposed.units, jobs: gr.proposed.jobs || 0 },
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
    const target = el || $('#c-chart');
    if (target) target.innerHTML = `${bar('people', 'people')}${bar('dwellings', 'dwellings')}${bar('jobs', 'jobs')}
      <ul class="grow-legend">${legend}</ul><div class="grow-tip" hidden></div>`;
  }
  // Hover / tap tooltip for the growth bars (delegated: both growth sub-views render a chart).
  const growTip = e => {
    if (!e.target.closest) return;
    const chart = e.target.closest('.growth-chart'); if (!chart) return;
    const s = e.target.closest('[data-tip]'), tip = chart.querySelector('.grow-tip');
    if (!tip) return;
    if (!s) { tip.hidden = true; return; }
    tip.textContent = s.dataset.tip; tip.hidden = false;
    const box = chart.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 220, Math.max(0, e.clientX - box.left + 12))}px`;
    tip.style.top = `${e.clientY - box.top - 34}px`;
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
    tip.textContent = s.dataset.tip; tip.hidden = false; tip.style.left = '0px'; tip.style.top = '-28px';
  });

  // Hover / tap tooltip for the capacity bars (wastewater plants, water capacity).
  const capTip = e => {
    const ch = e.target.closest && e.target.closest('.cap-chart'); if (!ch) return;
    const tip = ch.querySelector('.grow-tip'), sEl = e.target.closest('[data-tip]'); if (!tip) return;
    if (!sEl) { tip.hidden = true; return; }
    tip.textContent = sEl.dataset.tip; tip.hidden = false;
    const box = ch.getBoundingClientRect();
    tip.style.left = `${Math.min(box.width - 220, Math.max(0, e.clientX - box.left + 12))}px`;
    tip.style.top = `${e.clientY - box.top - 34}px`;
  };
  document.addEventListener('pointermove', capTip);
  document.addEventListener('pointerdown', capTip);
  document.addEventListener('pointerout', e => { const ch = e.target.closest && e.target.closest('.cap-chart'); if (ch && !ch.contains(e.relatedTarget)) { const t = ch.querySelector('.grow-tip'); if (t) t.hidden = true; } });

  // ---- Public contract ----
  const api = { outlookRows, outlookCardHTML, housingActivityRows, housingActivityHTML, renderGrowthCensus, renderGrowthChart, forecastTableHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCensusView = api;
})(typeof window !== 'undefined' ? window : globalThis);
