/* js/growth-ui.js — Growth tab (Phase 6 extraction).
 * Pipeline/aggregates sub-views, type aggregation, settings-page display HTML.
 * Extracted verbatim from js/app.js (lines 2014-2122); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, dot, hlP, unit, uUnits, store, roundPop } = root.PeelUtil;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const PD = root.PeelDesign;
  const App = () => root.PeelApp;
  const DU = () => root.PeelDemandUI;
  const CV = () => root.PeelCensusView;
  const OV = () => root.PeelOverviewTab;
  const CA = () => root.PeelCensusAreas;
  const SET = () => root.PeelSettings;
  const TL = () => root.PeelTiming;
  const SvcTab = () => root.PeelSvcTab;

/* ---- app.js lines 2014-2122 ---- */
  // ---- Growth tab (Phase 4): pipeline and census sub-views ---------------------------------
  // Worker A owns the tab markup: buttons data-gsub, #pane-growth-pipeline >
  // #growth-pipeline-body and #pane-growth-census > #growth-census-body. These render
  // functions fill the two body divs. renderGrowth refreshes both when the filters
  // change; the sub-view buttons only toggle which pane is shown.
  const growthDeps = () => ({
    aggregate: { typeBuildout: p => D.typeBuildout(p), unitTypes: D.UNIT_TYPES, empOf: App().empOf, permittedPhases: App().EMP_DONE.permitted, completedPhases: App().EMP_DONE.completed },
    completions: { completedAt: PeelAreas.completedAt, permitUnits: rs => P.permitUnits(rs) },
  });
  function renderGrowth() {
    renderGrowthPipeline();
    TL().renderTiming();
    if (root.PeelPlanTables) root.PeelPlanTables.render();
    CV().renderGrowthCensus();
    const set = DU().demandSet(), basis = DU().demandBasis();
    // The footer summary line (was filled by the old Demand tab).
    const fs = $('#f-sum');
    // (at a development: the site's own units first, then its 2021 census area, named as such)
    const daP = App().state.daCtx && App().state.daCtx.project;
    if (fs && daP) { fs.innerHTML = `<strong>${esc(daP.title)}</strong> · <strong>${fmtNum(Math.round(Growth.pipelineTotals([daP]).planned))}</strong> homes planned <span class="muted">· its census area: ${fmtNum(set.length)} developments, ${fmtNum(Math.round(Growth.pipelineTotals(set).planned))} homes</span>`; }
    else if (fs) fs.innerHTML = `<strong>${fmtNum(set.length)}</strong> developments · <span title="Homes the applications shown propose: the largest figure across each development's files, net of homes demolished, at every stage from pre-consultation to built. Growth shows how many are permitted, built and left to build."><strong>${fmtNum(Math.round(Growth.pipelineTotals(set).planned))}</strong> homes proposed</span>${(() => { const j = set.reduce((t, p) => t + (p.phase === 'cancelled' ? 0 : App().jobsOf(p) || 0), 0); return j > 0 ? ` · <strong>${fmtNum(Math.round(j / 100) * 100)}</strong> jobs` : ''; })()}`;
    // Keep the Overview pane's numbers in sync (as the old Demand tab did).
    if (App().state.daCtx) OV().renderOverview(); else OV().renderOverview(set, D.estimate(set, App().state.criteria, basis, App().jobsOf), basis);
  }
  // The selection summary (side panel) aggregates types through here.
  const aggregateTypes = projects => Growth.aggregateTypes(projects, growthDeps().aggregate);

  // Pipeline sub-view: the application pipeline by stage and dwelling type, completions
  // per year, and the pace of approvals by municipality.
  function renderGrowthPipeline() {
    const body = $('#growth-pipeline-body'); if (!body) return;
    const set = DU().demandSet();
    const t = Growth.pipelineTotals(set);
    const gd = growthDeps();
    const { bt, emp } = Growth.aggregateTypes(set, gd.aggregate);
    const comp = Growth.completionStats(set, gd.completions);
    const lags = Growth.approvalLags(set);
    const apprByM = Object.fromEntries(Growth.medianApprovalByMuni(lags).map(r => [r.m, r]));
    const allMedian = Growth.median(lags.map(l => l.months));
    const pc = v => `${Math.round(v * 100)}%`;
    const tile = (label, v, sub, info, u = 'units') => `<div class="tile" data-info="${info}"><div class="tl">${label}</div><div class="tv">${v}<span class="tu">${u}</span></div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    // Employment in the same layout as the homes: floor area planned, permitted, completed and
    // left to build, with the jobs it holds.
    const jobsOfM2 = m2 => (emp.planned ? emp.jobs * m2 / emp.planned : 0);
    const empTiles = emp.planned ? `<h3 class="sub-title" data-info="employment">Employment</h3><div class="tiles">${tile('Planned', fmtNum(Math.round(emp.planned)), `≈${fmtNum(Math.round(emp.jobs))} jobs`, 'employment', 'm²')}
        ${tile('Permitted', fmtNum(Math.round(emp.permitted)), `${pc(emp.permitted / emp.planned)} of planned · ≈${fmtNum(Math.round(jobsOfM2(emp.permitted)))} jobs`, 'employment', 'm²')}
        ${tile('Completed', fmtNum(Math.round(emp.completed)), `≈${fmtNum(Math.round(jobsOfM2(emp.completed)))} jobs`, 'employment', 'm²')}
        ${tile('Left to build', fmtNum(Math.round(emp.left)), `${pc(emp.left / emp.planned)} of planned · ≈${fmtNum(Math.round(jobsOfM2(emp.left)))} jobs`, 'employment', 'm²')}</div>` : '';
    // Completed per year, clipped to the data year: a completion dated in the future is a data error,
    // not a year of completions (design audit, Group 8: no more "2017–2027").
    const nowY = (window.PeelMapMarkers && window.PeelMapMarkers.THIS_YEAR) || new Date().getFullYear();
    const yrs = comp.years.filter(y => y.year <= nowY), yrUnits = yrs.reduce((t, y) => t + y.units, 0), yr0 = yrs.length ? yrs[0].year : null, yr1 = yrs.length ? yrs[yrs.length - 1].year : null;
    // (completed since census day: the Built layer, as the stage chart's "Built since 2021")
    const sinceC = set.length && root.PeelLayers ? root.PeelLayers.totals(set).units.built || 0 : 0;
    const head = set.length
      ? `The <strong>${fmtNum(set.length)}</strong> developments shown propose <strong>${fmtNum(Math.round(t.planned))}</strong> homes (planned units, net of homes demolished): <strong>${fmtNum(Math.round(t.permitted))}</strong> permitted, <strong>${fmtNum(Math.round(t.completed))}</strong> completed${sinceC >= 0.5 && Math.round(sinceC) !== Math.round(t.completed) ? ` (${fmtNum(Math.round(sinceC))} since the 2021 census)` : ''}, <strong>${fmtNum(Math.round(t.left))}</strong> left to build.`
      : 'No developments match the current filters.';
    // Completions per year: a compact strip; the numbers by municipality below it.
    const cmax = Math.max(1, ...yrs.map(y => y.units));
    const strip = yrs.length ? `<div class="cc-strip" role="img" aria-label="Units completed per year, ${yr0} to ${yr1}">${yrs.map(y => `<div class="cc-bar" style="--h:${(y.units / cmax * 100).toFixed(1)}" title="${y.year}: ${fmtNum(Math.round(y.units))} units in ${fmtNum(y.projects)} development${y.projects === 1 ? '' : 's'}"><i></i><span>${String(y.year).slice(2)}</span></div>`).join('')}</div>` : '';
    // The approval-pace column shows only once it has data (SPEC §5).
    const pace = lags.length > 0 && allMedian != null;
    const mrow = m => {
      const c = comp.byMuni.find(r => r.m === m), a = apprByM[m];
      return `<tr><td>${esc(m)}</td><td>${c ? `${fmtNum(Math.round(c.perYear))}<small>/yr · ${fmtNum(c.projects)} devs</small>` : '–'}</td>${pace ? `<td>${a && a.medianMonths != null ? `${a.medianMonths.toFixed(0)}<small> mo · n=${a.n}</small>` : '–'}</td>` : ''}</tr>`;
    };
    const muniTable = `<table class="dt"><caption>Completions${pace ? ' and approval pace' : ''} by municipality</caption><thead><tr><th>Municipality</th><th>Completions</th>${pace ? '<th>Median application → approval</th>' : ''}</tr></thead><tbody>${DU().MUNIS.map(mrow).join('')}
      <tr class="tot"><td>Peel</td><td>${yrs.length ? `${fmtNum(Math.round(yrUnits / yrs.length))}<small>/yr</small>` : '–'}</td>${pace ? `<td>${allMedian.toFixed(0)}<small> mo · n=${lags.length}</small></td>` : ''}</tr></tbody></table>`;
    const asof = (DU().freshness()[0] && DU().freshness()[0].date) || '–';
    // Completions per year and pace by municipality are area content: not at a development's scope.
    const site = !!(window.DevScope && window.DevScope.current());
    const caveat = !site && root.PeelCensusView && root.PeelCensusView.permitCaveatHTML ? root.PeelCensusView.permitCaveatHTML() : '';
    body.innerHTML = `
      ${hlP(head)}${caveat}
      <h3 class="sub-title" data-info="demand-units">Homes</h3>
      <div class="tiles">${tile('Planned', fmtNum(Math.round(t.planned)), t.n ? `${fmtNum(t.n)} developments with units` : '', 'demand-units')}
        ${tile('Permitted', fmtNum(Math.round(t.permitted)), t.planned ? `${pc(t.permitted / t.planned)} of planned` : '', 'demand-units')}
        ${tile('Completed', fmtNum(Math.round(t.completed)), yrs.length ? `≈${fmtNum(Math.round(yrUnits / yrs.length))}/yr completed ${yr0}–${yr1}` : '', 'demand-units')}
        ${tile('Left to build', fmtNum(Math.round(t.left)), t.planned ? `${pc(t.left / t.planned)} of planned` : '', 'demand-units')}</div>
      ${layerStripHTML(set)}
      ${empTiles}
      <div class="growth-chart" id="gp-chart" data-info="growth-bars"></div>
      <p class="small muted">The largest developments still to build are on the Overview (one list).</p>
      <div class="bd-w"><table class="dt" data-info="unit-types"><caption>Build-out by dwelling type</caption><thead><tr><th>Type</th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead><tbody>${aggTypeRowsHTML({ bt, emp })}</tbody></table></div>
      ${site ? siteCompareHTML(root.PeelDevVerdict && root.PeelDevVerdict.scopedDev()) : strip + muniTable}
      <p class="small muted">ⓘ Pipeline = applications with unit counts; permitted and completed come from the building permits. Completions ${yr0 ? `${yr0}–${yr1}` : '—'} from dated permit events${comp.estimated ? ` (${fmtNum(comp.estimated)} completion dates estimated from issue dates — Brampton and Caledon publish none)` : ''}. Approval pace = months from first application activity to the site's approval. Applications as of <strong>${esc(asof)}</strong>.</p>`;
    // Stage 3: the standard panel; the tables above are its full table.
    if (root.PeelPanel) root.PeelPanel.set('growth:pipeline', pipelinePanelSpec({ set, t, emp, comp, yrs, yrUnits, yr0, yr1, head, site, bt }));
    // The pipeline by stage reuses the growth chart (no census baseline here).
    const bc = CA().baselineCensus();
    if (bc) {
      // Jobs by layer as well (built / approved / proposed), as the census sub-view does.
      const gr = PeelAreas.growthSince(set, {}, bc.date, App().state.criteria), j = SvcTab().svcJobs(set.filter(p => p.phase !== 'cancelled'), bc.date);
      gr.built.jobs = j.jbuilt; gr.approved.jobs = j.japproved; gr.proposed.jobs = j.jproposed;
      CV().renderGrowthChart({ population: 0, dwellings: 0 }, gr, bc.year, $('#gp-chart'), { builtLabel: `Completed since ${bc.year} on the developments shown (not every permit: see Census & 2051)` });
    }
  }
  // ---- Growth at a development (Stage 2): its units, then how this site compares --------------
  // Pure: where a value sits among others (the share of them it is larger than, and their median).
  function siteCompare(v, others) {
    const xs = others.filter(x => x > 0).sort((a, b) => a - b); if (!(v > 0) || !xs.length) return null;
    const below = xs.filter(x => x < v).length, mid = xs.length >> 1;
    return { n: xs.length, pctLarger: Math.round(below / xs.length * 100), median: xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2 };
  }
  // The site against the other developments in its municipality that have a planning application
  // with homes (permit-only houses left out): planned homes, and homes per hectare where both have a
  // stated site area.
  function siteCompareHTML(p) {
    if (!p || !App()) return '';
    const units = q => Growth.pipelineTotals([q]).planned;
    const hasApp = q => (q.records || []).some(r => r.kind === 'application');
    const peers = App().state.projects.filter(q => q !== p && q.phase !== 'cancelled' && q.municipality === p.municipality && hasApp(q) && units(q) > 0);
    const u = units(p), cu = siteCompare(u, peers.map(units));
    const dens = q => (q.siteAreaHa > 0 ? units(q) / q.siteAreaHa : 0);
    const cd = p.siteAreaHa > 0 ? siteCompare(dens(p), peers.map(dens)) : null;
    if (!cu && !cd) return '';
    const li = [];
    const share = c => (c.pctLarger >= 100 ? 'more than any of' : `more than <strong>${c.pctLarger}%</strong> of`);
    if (cu) li.push(`<li><strong>${fmtNum(Math.round(u))}</strong> planned homes: ${share(cu)} the ${fmtNum(cu.n)} other applications with homes in ${esc(p.municipality)} (median ${fmtNum(Math.round(cu.median))}).</li>`);
    if (cd) li.push(`<li><strong>${fmtNum(Math.round(dens(p)))}</strong> homes per hectare of site: ${share(cd).replace('more than', 'denser than')} the ${fmtNum(cd.n)} with a stated site area (median ${fmtNum(Math.round(cd.median))}).</li>`);
    return `<h3 class="sub-title">How this site compares <span class="muted small">applications with homes in ${esc(p.municipality)}, withdrawn left out</span></h3><ul class="b-lines small">${li.join('')}</ul>`;
  }
  // ---- Stage 3: Growth › Pipeline as the standard panel ---------------------------------------------
  function pipelinePanelSpec(o) {
    const PN = root.PeelPanel, { set, t, emp, comp, yrs, yrUnits, yr0, yr1, head, site, bt } = o;
    const pc = v => `${Math.round(v * 100)}%`, p = site && root.PeelDevVerdict ? root.PeelDevVerdict.scopedDev() : null;
    const typeRows = D.UNIT_TYPES.filter(ty => bt[ty.key] && bt[ty.key].planned >= 0.5).sort((a, b) => bt[b.key].planned - bt[a.key].planned)
      .map(ty => PN.kv(esc(ty.label), `${fmtNum(Math.round(bt[ty.key].planned))} planned · ${fmtNum(Math.round(bt[ty.key].left))} left`));
    const muniRows = (comp.byMuni || []).slice().sort((a, b) => b.perYear - a.perYear).map(c => PN.kv(esc(c.m), `${fmtNum(Math.round(c.perYear))} completed / yr · ${fmtNum(c.projects)} devs`));
    const cmp = p ? siteCompareRows(p) : [];
    // At a development the panel is about the site: its own units first; the developments in its 2021
    // census area (what the tables below count) are a labelled block, never the headline.
    if (p) {
      const st = Growth.pipelineTotals([p]), sb = Growth.aggregateTypes([p], growthDeps().aggregate).bt;
      const siteTypes = D.UNIT_TYPES.filter(ty => sb[ty.key] && sb[ty.key].planned >= 0.5).sort((a, b) => sb[b.key].planned - sb[a.key].planned)
        .map(ty => PN.kv(esc(ty.label), `${fmtNum(Math.round(sb[ty.key].planned))} planned · ${fmtNum(Math.round(sb[ty.key].left))} left`));
      const da = App().state.daCtx;
      const areaRows = [PN.kv('Developments', fmtNum(set.length)), PN.kv('Homes planned', fmtNum(Math.round(t.planned))), PN.kv('Permitted · completed', `${fmtNum(Math.round(t.permitted))} · ${fmtNum(Math.round(t.completed))}`), PN.kv('Left to build', fmtNum(Math.round(t.left)))];
      return {
        calc: true, fullTitle: `Growth › Pipeline · ${p.title}: the site, and the developments in its census area`,
        head: PN.siteHead(p),
        answer: `<strong>${esc(p.title)}</strong> plans <strong>${fmtNum(Math.round(st.planned))}</strong> homes: ${fmtNum(Math.round(st.permitted))} permitted, ${fmtNum(Math.round(st.completed))} completed, <strong>${fmtNum(Math.round(st.left))}</strong> left to build.${da && set.length > 1 ? ` In its 2021 census area, <strong>${fmtNum(set.length)}</strong> developments propose ${fmtNum(Math.round(t.planned))} homes.` : ''}`,
        figures: [
          { v: fmtNum(Math.round(st.planned)), u: 'units', label: 'planned', ctx: 'this site' },
          { v: fmtNum(Math.round(st.permitted)), u: 'units', label: 'permitted', ctx: st.planned ? `${pc(st.permitted / st.planned)} of planned` : '' },
          { v: fmtNum(Math.round(st.completed)), u: 'units', label: 'completed', ctx: '' },
          { v: fmtNum(Math.round(st.left)), u: 'units', label: 'left to build', ctx: st.planned ? `${pc(st.left / st.planned)} of planned` : '' },
        ],
        chart: layerStripHTML([p]),
        lists: [
          { title: 'How this site compares', rows: cmp, total: cmp.length },
          { title: 'By dwelling type', rows: siteTypes, total: siteTypes.length },
          ...(da && set.length > 1 ? [{ title: `In its 2021 census area (${fmtNum(set.length)} developments)`, rows: areaRows, total: areaRows.length, seeAll: { 'data-full-table': 'growth' } }] : []),
          ...(emp.planned ? [{ title: 'Employment in its census area', rows: [PN.kv('Floor area planned', `${fmtNum(Math.round(emp.planned))} m² · ≈${fmtNum(roundPop(emp.jobs))} jobs`), PN.kv('Left to build', `${fmtNum(Math.round(emp.left))} m²`)], total: 2 }] : []),
        ],
        method: 'The site: its applications\u2019 planned units (net of homes demolished), with permitted and completed from its building permits. Its census area: the 2021 Census dissemination area its point falls in, and every development located in it (the full table counts these). People and jobs at Peel design criteria.',
        sources: 'The municipal applications and building permits on the map (Records › Sources has each source and its date); Statistics Canada 2021 Census dissemination areas.',
        foot: { primary: { label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, title: 'A printable report for the developments in its census area' } },
      };
    }
    return {
      calc: true, fullTitle: `Growth › Pipeline · ${p ? p.title : App().state.muni || 'Peel'}: by stage, dwelling type and municipality`,
      head: p ? PN.siteHead(p) : PN.areaHead('Growth › Pipeline', 'How much is coming?', null, `${esc(App().state.muni || 'Peel')} · ${fmtNum(set.length)} developments shown`),
      answer: head,
      figures: [
        { v: fmtNum(Math.round(t.planned)), u: 'units', label: 'planned', ctx: t.n ? `${fmtNum(t.n)} developments with units` : '', attrs: site ? null : { 'data-full-table': 'growth' } },
        { v: fmtNum(Math.round(t.permitted)), u: 'units', label: 'permitted', ctx: t.planned ? `${pc(t.permitted / t.planned)} of planned` : '', attrs: site ? null : { 'data-full-table': 'growth' } },
        { v: fmtNum(Math.round(t.completed)), u: 'units', label: 'completed', ctx: !site && yrs.length ? `≈${fmtNum(Math.round(yrUnits / yrs.length))}/yr, ${yr0}–${yr1}` : '', attrs: site ? null : { 'data-full-table': 'growth' } },
        { v: fmtNum(Math.round(t.left)), u: 'units', label: 'left to build', ctx: t.planned ? `${pc(t.left / t.planned)} of planned` : '', attrs: site ? null : { 'data-full-table': 'growth' } },
      ],
      chart: layerStripHTML(set),
      lists: [
        ...(p ? [{ title: 'How this site compares', rows: cmp, total: cmp.length }] : []),
        { title: 'By dwelling type', rows: typeRows, total: typeRows.length, seeAll: { 'data-full-table': 'growth', 'data-ft-go': 'Build-out by dwelling type' } },
        ...(site ? [] : [{ title: 'Completions by municipality', rows: muniRows, total: muniRows.length, seeAll: { 'data-full-table': 'growth', 'data-ft-go': 'Completions and approval pace' } }]),
        ...(emp.planned ? [{ title: 'Employment', rows: [PN.kv('Floor area planned', `${fmtNum(Math.round(emp.planned))} m² · ≈${fmtNum(Math.round(emp.jobs))} jobs`), PN.kv('Left to build', `${fmtNum(Math.round(emp.left))} m²`)], total: 2 }] : []),
      ],
      method: 'Pipeline = applications with unit counts; permitted and completed come from the building permits; completions per year from dated permit events. Units are planned units net of homes demolished. People and jobs at Peel design criteria.',
      sources: 'The municipal applications and building permits on the map (Records › Sources has each source and its date).',
      foot: { primary: { label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' }, title: 'A printable report for the developments shown' } },
    };
  }
  // The site against the other applications with homes in its municipality, as label / value rows.
  function siteCompareRows(p) {
    const PN = root.PeelPanel, units = q => Growth.pipelineTotals([q]).planned;
    const hasApp = q => (q.records || []).some(r => r.kind === 'application');
    const peers = App().state.projects.filter(q => q !== p && q.phase !== 'cancelled' && q.municipality === p.municipality && hasApp(q) && units(q) > 0);
    const cu = siteCompare(units(p), peers.map(units)), dens = q => (q.siteAreaHa > 0 ? units(q) / q.siteAreaHa : 0);
    const cd = p.siteAreaHa > 0 ? siteCompare(dens(p), peers.map(dens)) : null, share = c => (c.pctLarger >= 100 ? 'more than any other' : `more than ${c.pctLarger}%`);
    return [
      ...(cu ? [PN.kv('Planned homes', `${fmtNum(Math.round(units(p)))} · ${share(cu)} of ${fmtNum(cu.n)} (median ${fmtNum(Math.round(cu.median))})`)] : []),
      ...(cd ? [PN.kv('Homes per hectare', `${fmtNum(Math.round(dens(p)))} · ${share(cd)} of ${fmtNum(cd.n)} (median ${fmtNum(Math.round(cd.median))})`)] : []),
    ];
  }
  // The pipeline by layer (SPEC §2.2): growth only, the census as context; and by dwelling type.
  function layerStripHTML(set) {
    const Ly = root.PeelLayers, LB = root.PeelLayerBar; if (!Ly || !LB || !set.length) return '';
    const t = Ly.totals(set), u = t.units, bc = CA().baselineCensus();
    const census = bc ? PeelAreas.censusTotals(bc.das, {}).dwellings : null;
    const growth = ['built', 'committed', 'proposed', 'anticipated'];
    const segs = growth.map(k => ({ layer: k, value: u[k], est: Math.min(u[k], t.estimatedBy[k] || 0) }));
    const bt = Ly.byType(set), n0 = v => fmtNum(Math.round(v));
    const rows = D.UNIT_TYPES.filter(ty => growth.some(k => bt[ty.key][k] >= 0.5)).map(ty => `<tr><td>${esc(ty.label)}</td>${growth.map(k => `<td class="n">${n0(bt[ty.key][k])}</td>`).join('')}</tr>`).join('');
    return `<h3 class="sub-title pnl-chart-t" data-info="growth-layers">Homes by stage <span class="pnl-chart-u">(dwellings)</span></h3>
      ${LB.barHTML({ segments: segs })}
      ${LB.legendHTML(growth.map(k => ({ layer: k, value: u[k] })).concat(t.estimated > 0 ? ['est'] : []))}
      ${u.anticipated >= 0.5 ? `<p class="small muted ly-def">Pre-application: ${esc(Ly.NOTE.anticipated)}.</p>` : ''}
      ${census ? `<p class="small muted">On ${n0(census)} dwellings on the system at the ${bc.year} census.${u.existing > 0 ? ` ${n0(u.existing)} more on these sites were completed before census day and are in it already.` : ''}</p>` : u.existing > 0 ? `<p class="small muted">${n0(u.existing)} more on these sites were completed before census day and are in the census already.</p>` : ''}
      <details class="see-all"><summary>By dwelling type and stage</summary><table class="dt"><thead><tr><th>Type</th>${growth.map(k => `<th class="n">${LB.nameHTML(k, true)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></details>`;
  }
  function aggTypeRowsHTML({ bt, emp }) {
    const cols = ['planned', 'permitted', 'completed', 'left'];
    return D.UNIT_TYPES.filter(t => bt[t.key].planned || bt[t.key].permitted).map(t => `<tr><td>${esc(t.label)}</td>${cols.map(col => `<td>${uUnits(bt[t.key][col])}</td>`).join('')}</tr>`).join('')
      + (emp.planned ? `<tr class="tot"><td>Employment floor space <span class="muted">(~${fmtNum(emp.jobs)} jobs)</span></td>${cols.map(col => `<td>${unit(fmtNum(emp[col]), 'm²')}</td>`).join('')}</tr>` : '');
  }

  // Phase 4: the editable design criteria live in the Scenario control (scenario bar),
  // rendered by renderScenarioCriteria(). This tab keeps display settings, the wet weather
  // scenario, number conventions and "prepared by" (see renderQuality).
  function displaySettingsHTML() {
    const theme = store.get('theme', 'dark'), density = store.get('density', PD.densityDefault());
    const sel = (id, cur, opts) => `<select id="${id}" autocomplete="off">${opts.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select>`;
    return `
      <fieldset data-info="display"><legend>Display</legend>
        <label class="field"><span>Theme</span>${sel('dsp-theme', ['dark', 'light', 'device'].includes(theme) ? theme : 'dark', [['dark', 'Dark'], ['light', 'Light'], ['device', 'Follow device']])}</label>
        <label class="field"><span>Presentation</span>${sel('dsp-present', store.get('presentTheme', 'light') === 'app' ? 'app' : 'light', [['light', 'Light (projectors)'], ['app', 'Same as the app']])}</label>
        <label class="field"><span>Density</span>${sel('dsp-density', density === 'comfortable' ? 'comfortable' : 'compact', [['compact', 'Compact'], ['comfortable', 'Comfortable']])}</label>
        <p class="small muted">Dark is the default; "Follow device" tracks the OS setting. Compact suits a computer, Comfortable a phone. Both stay in this browser — they are not part of share links.</p>
      </fieldset>
      <p class="small">Design criteria (persons per unit, water and wastewater rates, employment) and the wet weather scenario (design storm) are edited in the <strong>Scenario</strong> control in the top bar — open it, then "Change the scenario". Edited values are used everywhere and flagged as modified.</p>`;
  }
  // Record type and New buildings only narrow the list: they are filters, in Find › What.
  const recordSettingsHTML = () => '<fieldset class="panel rec-set" id="rec-settings"><legend class="label" data-info="record-settings">Records</legend><p class="small">Record type and New buildings only are filters: they are in <strong>Find › What</strong>.</p></fieldset>';
  function settingsPageHTML() {
    const TC = root.PeelTreeCounts;
    // Bundle 6: Display → Start screen → Counting → Usage; every counting choice lives in the Scenario
    // control (Count, Units, Units per development), so Counting here points there.
    const counting = `<fieldset data-info="counting" class="set-counting"><legend>Counting</legend><p class="small">How units are counted (Count, Units and Units per development${TC ? `: now ${esc(TC.label())}` : ''}) is set in the Scenario control, with the other scenario settings. <button type="button" class="btn small" data-pnl-scen>Open the Scenario control</button></p></fieldset>`;
    return `<h2 class="pane-h">Settings</h2>${displaySettingsHTML()}${root.PeelWorkspaces && root.PeelWorkspaces.settingsHTML ? root.PeelWorkspaces.settingsHTML() : ''}${counting}${root.PeelUsage && root.PeelUsage.settingsHTML ? root.PeelUsage.settingsHTML() : ''}${recordSettingsHTML()}${DU().numberConventionsHTML()}`;
  }
  window.GearPages = window.GearPages || {};
  window.GearPages.settings = () => settingsPageHTML();
  // Phase 4: the old Settings & sources tab is gone; settings live on the gear page.
  // Kept as a safe no-op for legacy callers (boot, criteria reset).
  function renderCriteria() {}

  // ---- Public contract ----
  const api = { renderGrowth, renderGrowthPipeline, aggregateTypes, aggTypeRowsHTML, displaySettingsHTML, recordSettingsHTML, settingsPageHTML, renderCriteria, growthDeps, siteCompare, siteCompareHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelGrowthUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
