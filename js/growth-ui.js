/* js/growth-ui.js — Growth tab (Phase 6 extraction).
 * Pipeline/aggregates sub-views, type aggregation, settings-page display HTML.
 * Extracted verbatim from js/app.js (lines 2014-2122); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, dot, hlP, unit, uUnits, store } = root.PeelUtil;
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
    CV().renderGrowthCensus();
    const set = DU().demandSet(), basis = DU().demandBasis();
    // The footer summary line (was filled by the old Demand tab).
    const fs = $('#f-sum');
    if (fs) fs.innerHTML = `${App().state.daCtx ? `<span class="muted">Around ${esc(App().state.daCtx.title)}:</span> ` : ''}<strong>${fmtNum(set.length)}</strong> developments · <span title="Homes the applications shown propose: the largest figure across each development's files, net of homes demolished, at every stage from pre-consultation to built. Growth shows how many are permitted, built and left to build."><strong>${fmtNum(Math.round(Growth.pipelineTotals(set).planned))}</strong> homes proposed</span>${(() => { const j = set.reduce((t, p) => t + (p.phase === 'cancelled' ? 0 : App().jobsOf(p) || 0), 0); return j > 0 ? ` · <strong>${fmtNum(Math.round(j / 100) * 100)}</strong> jobs` : ''; })()}`;
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
    const yrs = comp.years, yr0 = yrs.length ? yrs[0].year : null, yr1 = yrs.length ? yrs[yrs.length - 1].year : null;
    const head = set.length
      ? `The <strong>${fmtNum(set.length)}</strong> developments shown propose <strong>${fmtNum(Math.round(t.planned))}</strong> homes (planned units, net of homes demolished): <strong>${fmtNum(Math.round(t.permitted))}</strong> permitted, <strong>${fmtNum(Math.round(t.completed))}</strong> completed, <strong>${fmtNum(Math.round(t.left))}</strong> left to build.`
      : 'No developments match the current filters.';
    // Largest pipelines still to build: top 5, the rest behind "See all".
    const unbuilt = set.filter(p => p.buildout && p.buildout.unbuilt > 0).sort((a, b) => b.buildout.unbuilt - a.buildout.unbuilt);
    const denom = Math.max(1, t.left + t.completed);
    const lrow = p => `<tr><td>${esc(p.title)}<small>${esc(p.municipality)} · ${dot(p.phase)} ${esc(P.PHASE_BY_KEY[p.phase].label)}</small></td><td>${uUnits(p.buildout.unbuilt)}</td><td>${pc(p.buildout.unbuilt / denom)}</td></tr>`;
    const topTable = unbuilt.length ? `<table class="dt"><caption>Largest pipelines still to build <span class="muted">share of the build-out</span></caption><thead><tr><th>Development</th><th>Unbuilt</th><th>Share</th></tr></thead><tbody>${unbuilt.slice(0, 5).map(lrow).join('')}</tbody></table>`
      + (unbuilt.length > 5 ? `<details class="see-all"><summary>See all ${fmtNum(unbuilt.length)} developments</summary><table class="dt"><thead><tr><th>Development</th><th>Unbuilt</th><th>Share</th></tr></thead><tbody>${unbuilt.map(lrow).join('')}</tbody></table></details>` : '') : '';
    // Completions per year: a compact strip; the numbers by municipality below it.
    const cmax = Math.max(1, ...yrs.map(y => y.units));
    const strip = yrs.length ? `<div class="cc-strip" role="img" aria-label="Units completed per year, ${yr0} to ${yr1}">${yrs.map(y => `<div class="cc-bar" style="--h:${(y.units / cmax * 100).toFixed(1)}" title="${y.year}: ${fmtNum(Math.round(y.units))} units in ${fmtNum(y.projects)} development${y.projects === 1 ? '' : 's'}"><i></i><span>${String(y.year).slice(2)}</span></div>`).join('')}</div>` : '';
    const mrow = m => {
      const c = comp.byMuni.find(r => r.m === m), a = apprByM[m];
      return `<tr><td>${esc(m)}</td><td>${c ? `${fmtNum(Math.round(c.perYear))}<small>/yr · ${fmtNum(c.projects)} devs</small>` : '–'}</td><td>${a && a.medianMonths != null ? `${a.medianMonths.toFixed(0)}<small> mo · n=${a.n}</small>` : '–'}</td></tr>`;
    };
    const muniTable = `<table class="dt"><caption>Completions and approval pace by municipality</caption><thead><tr><th>Municipality</th><th>Completions</th><th>Median application → approval</th></tr></thead><tbody>${DU().MUNIS.map(mrow).join('')}
      <tr class="tot"><td>Peel</td><td>${yrs.length ? `${fmtNum(Math.round(comp.totalUnits / yrs.length))}<small>/yr</small>` : '–'}</td><td>${allMedian != null ? `${allMedian.toFixed(0)}<small> mo · n=${lags.length}</small>` : '–'}</td></tr></tbody></table>`;
    const asof = (DU().freshness()[0] && DU().freshness()[0].date) || '–';
    body.innerHTML = `
      ${hlP(head)}
      <h3 class="sub-title" data-info="demand-units">Homes</h3>
      <div class="tiles">${tile('Planned', fmtNum(Math.round(t.planned)), t.n ? `${fmtNum(t.n)} developments with a build-out` : '', 'demand-units')}
        ${tile('Permitted', fmtNum(Math.round(t.permitted)), t.planned ? `${pc(t.permitted / t.planned)} of planned` : '', 'demand-units')}
        ${tile('Completed', fmtNum(Math.round(t.completed)), yrs.length ? `≈${fmtNum(Math.round(comp.totalUnits / yrs.length))}/yr completed ${yr0}–${yr1}` : '', 'demand-units')}
        ${tile('Left to build', fmtNum(Math.round(t.left)), t.planned ? `${pc(t.left / t.planned)} of planned` : '', 'demand-units')}</div>
      ${empTiles}
      <div class="growth-chart" id="gp-chart" data-info="growth-bars"></div>
      ${topTable}
      <div class="bd-w"><table class="dt" data-info="unit-types"><caption>Build-out by dwelling type</caption><thead><tr><th>Type</th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead><tbody>${aggTypeRowsHTML({ bt, emp })}</tbody></table></div>
      ${strip}${muniTable}
      <p class="small muted">ⓘ Pipeline = applications with unit counts; permitted and completed come from the building permits. Completions ${yr0 ? `${yr0}–${yr1}` : '—'} from dated permit events${comp.estimated ? ` (${fmtNum(comp.estimated)} completion dates estimated from issue dates — Brampton and Caledon publish none)` : ''}. Approval pace = months from first application activity to the site's approval. Applications as of <strong>${esc(asof)}</strong>.</p>`;
    // The pipeline by stage reuses the growth chart (no census baseline here).
    const bc = CA().baselineCensus();
    if (bc) {
      // Jobs by layer as well (built / approved / proposed), as the census sub-view does.
      const gr = PeelAreas.growthSince(set, {}, bc.date, App().state.criteria), j = SvcTab().svcJobs(set.filter(p => p.phase !== 'cancelled'), bc.date);
      gr.built.jobs = j.jbuilt; gr.approved.jobs = j.japproved; gr.proposed.jobs = j.jproposed;
      CV().renderGrowthChart({ population: 0, dwellings: 0 }, gr, bc.year, $('#gp-chart'));
    }
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
        <label class="field"><span>Density</span>${sel('dsp-density', density === 'comfortable' ? 'comfortable' : 'compact', [['compact', 'Compact'], ['comfortable', 'Comfortable']])}</label>
        <p class="small muted">Dark is the default; "Follow device" tracks the OS setting. Compact suits a computer, Comfortable a phone. Both stay in this browser — they are not part of share links.</p>
      </fieldset>
      <p class="small">Design criteria (persons per unit, water and wastewater rates, employment) are edited in the <strong>Scenario</strong> control in the top bar — open it, then "Design criteria". Edited values are used everywhere and flagged as modified.</p>
      ${SET().wetBoxHTML()}`;
  }
  function recordSettingsHTML() {
    const kindOpts = [['application', 'Planning applications + their permits'], ['', 'All records (incl. permits with no application)'], ['permit', 'Building permits'], ['both', 'Application + permits']];
    const kcur = App().state.kind == null ? 'application' : App().state.kind;
    return `<fieldset class="panel rec-set" id="rec-settings"><legend class="label" data-info="record-settings">Records</legend>`
      + `<div class="row two"><label class="field" data-info="record-type"><span class="label">Record type</span><select autocomplete="off" id="f-kind">`
      + kindOpts.map(([v, t]) => `<option value="${v}"${String(v) === String(kcur) ? ' selected' : ''}>${t}</option>`).join('')
      + `</select></label></div>`
      + `<label class="switch" data-info="new-only"><input type="checkbox" autocomplete="off" id="f-new"${App().state.newOnly ? ' checked' : ''}><span class="track" aria-hidden="true"></span><span>New buildings only <span class="muted small">(hide alterations, signs, pools…)</span></span></label></fieldset>`;
  }
  function settingsPageHTML() {
    return `<h2 class="pane-h">Settings</h2>${displaySettingsHTML()}${recordSettingsHTML()}${DU().numberConventionsHTML()}`;
  }
  window.GearPages = window.GearPages || {};
  window.GearPages.settings = () => settingsPageHTML();
  // Phase 4: the old Settings & sources tab is gone; settings live on the gear page.
  // Kept as a safe no-op for legacy callers (boot, criteria reset).
  function renderCriteria() {}

  // ---- Public contract ----
  const api = { renderGrowth, renderGrowthPipeline, aggregateTypes, aggTypeRowsHTML, displaySettingsHTML, recordSettingsHTML, settingsPageHTML, renderCriteria, growthDeps };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelGrowthUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
