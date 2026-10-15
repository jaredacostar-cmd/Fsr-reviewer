/* Servicing tab — flow tree, scenario renderer, svc selects, sub-tabs,
 * Phase 6 extraction from js/app.js (app.js 4437-4681, 4683-4887, 5404-5428).
 * scenario metrics, servicing criteria.
 */
(function (root) {
  'use strict';

  const D = window.PeelDemand;
  const { $, esc, fmtNum, fmt1, roundPop, unit, uML, uHa, uPop, uDev, hlP, store, SCREEN_NOTE } = window.PeelUtil;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const SD = () => window.PeelSvcData;
  const ST = () => window.PeelSewerTrace;
  const MA = () => window.PeelMapAnalysis;
  const TS = () => window.PeelToolScope;
  const SP = () => window.PeelSvcPlants;
  const DUI = () => window.PeelDemandUI;
  const DV = () => window.PeelDevVerdict;
  const WTab = () => window.PeelWaterTab;
  const MP = () => window.PeelMasterPlan;
  const AT = () => window.PeelAnalysisTabs;
  const Sett = () => window.PeelSettings;
  const TB = () => window.PeelTopbar;
  const Sh = () => window.PeelShare;
  const CA = () => window.PeelCensusAreas;
  const DD = () => window.PeelDevDetail;
  const OT = () => window.PeelOverflowTool;
  const DT = () => window.PeelDevTotals;
  const Areas = () => window.PeelAreas;
  const DS = () => window.DevScope;
  const FUI = () => window.PeelFilterUI;
  const PDU = () => window.PeelDevUnits;
  const PU = () => window.PeelUpstream;
  const DCAT = () => window.PeelDcaTab;
  const OV = () => window.PeelOverviewTab;
  const GUI = () => window.PeelGrowthUI;
  const RL = () => window.PeelRenderList;

  // ---- Servicing areas tab: demand by pressure zone and by sanitary catchment, in layers ----
  // Like the Growth tab: the baseline census (year from the timeline) plus growth built since
  // census day, approved and proposed (in review), from every development located in the zone /
  // catchment; other filters are ignored. Census population is counted by the dissemination
  // areas whose centre falls in the zone / catchment. Residential demand at Peel per-capita rates.
  // Census population per zone / drainage area: shares by area overlap (data/svc-census.json,
  // scripts/build-svc-census.js) when published for the census year, else the DA centre point.
  function svcCensusPop(bc) {
    // Cached per census and per servicing lookup: computed before the lookup is filled, every rural
    // dissemination area would count as fully sewered (no "served" share) — Inglewood's block took
    // ≈20,700 census people instead of ≈850 (SPEC 1.4: one model, whatever is scoped or loaded when).
    const gen = `${SD().svcById.size}|${App().state.svcCensus ? 1 : 0}`;
    if (bc._svcPop && bc._svcPopGen === gen) return bc._svcPop;
    bc._svcPopGen = gen;
    const pop = new Map(), add = (id, v) => pop.set(id, (pop.get(id) || 0) + v);
    const ov = App().state.svcCensus && App().state.svcCensus.years[bc.year];
    const drIds = new Set(App().state.servicing.drainage.map(a => a.id));
    const drMatch = App().state.svcCensus && App().state.svcCensus.drainage.every(id => drIds.has(id));
    if (ov && ov.length === bc.das.length) {
      const z = App().state.svcCensus.zones, w = App().state.svcCensus.drainage;
      bc.das.forEach((d, i) => { for (const [k, s] of ov[i][0]) add(z[k], d.pop * s); if (drMatch) for (const [k, s] of ov[i][1]) add(w[k], d.pop * s); });
      // Blocks (not in the overlap file): census people by dissemination-area centre, less the
      // share the sewers don't serve (rural land on septic).
      if (!drMatch) for (const d of bc.das) for (const id of Areas().locate(App().state.servicing.drainage, d.lng, d.lat)) add(id, d.pop * (SD().svcById.get(id)?.served ?? 1));
      bc._svcMethod = drMatch ? 'overlap' : 'overlap-zones';
    } else {
      const { zones, drainage } = App().state.servicing;
      for (const d of bc.das) for (const id of [...Areas().locate(zones, d.lng, d.lat), ...Areas().locate(drainage, d.lng, d.lat)]) add(id, d.pop);
      bc._svcMethod = 'centre';
    }
    return (bc._svcPop = pop);
  }
  // Jobs on development sites, by layer: built = completed since census day, approved =
  // committed (approved to under construction), proposed = in pre-consultation or review.
  // Existing employment is not in the census baseline.
  function svcJobs(devs, censusDate) {
    const since = +new Date(`${censusDate}T00:00:00Z`), j = { jbuilt: 0, japproved: 0, jproposed: 0 };
    for (const p of devs) {
      const n = App().jobsOf(p); if (!(n > 0)) continue;
      if (p.phase === 'completed') { if (+p.milestones.completed >= since) j.jbuilt += n; }
      else if (D.isCommitted(p)) j.japproved += n;
      else if (p.phase === 'inception' || p.phase === 'review') j.jproposed += n;
    }
    return j;
  }
  function svcLayerTotals(key, a, bc) {
    const devs = App().state.projects.concat(App().state.whatifs || []).filter(p => p.phase !== 'cancelled' && SD().svcIds(p, key).includes(a.id));
    const gr = Areas().growthSince(devs, {}, bc.date, App().state.criteria);
    return { census: svcCensusPop(bc).get(a.id) || 0, built: gr.built.population, approved: gr.approved.population, proposed: gr.proposed.population,
      ...svcJobs(devs, bc.date),
      // Developments = sites with a planning application (stand-alone permits still count in Built since).
      units: gr.built.units + gr.approved.units + gr.proposed.units, devs: devs.filter(p => p.kinds.includes('application')).length,
      near: devs.filter(p => p.kinds.includes('application') && SD().nearOf(p, key)).length };
  }
  const SUM_KEYS = ['census', 'built', 'approved', 'proposed', 'jbuilt', 'japproved', 'jproposed', 'units', 'devs', 'near'];
  // Developments cell: count, and how many are outside the area and assigned to it as the nearest.
  const devCell = l => `<td>${uDev(l.devs)}${l.near ? `<small>${fmtNum(l.near)} nearest</small>` : ''}</td>`;
  const nearNote = (n, what) => `<p class="small muted">${svcOpt.nr === 'on'
    ? `<strong>Outside mapped areas:</strong> ${fmtNum(n)} developments outside every ${what} are counted in the nearest one within ${SD().kmText(SD().NEAR_M)} of its edge (“nearest” under Developments) — mostly greenfield lands beyond the existing network, which would most likely connect there. A screening assumption: the actual connection comes from the functional servicing report or master plan. Farther away, a development is left out (likely private well / septic).`
    : `<strong>Outside mapped areas:</strong> developments outside every ${what} are left out; switch “Assign to nearest” to count them in the nearest ${what}.`}</p>`;
  // Scenario: every assumption behind the servicing figures in one place (footer bar), summarised
  // on the tabs, the map legend, the exports and share links.
  function scenarioText() {
    const R = App().state.reports, dv = R && R.wastewater.diversion, n = criteriaChanges().length;
    const basisTxt = { all: 'All units', buildout: 'Units applied for (no anticipated)', committed: 'Committed units', remaining: 'Units left to build' }[App().state.basis] || 'All units';
    return [svcOpt.ww === 'calibrated' ? 'Capacity check (2025 flows)' : 'Design flows', `max day ${svcOpt.md === 'observed' ? 'observed' : 'design'}`,
      dv ? `diversion ${svcOpt.div === 'on' ? 'on' : 'off'}` : null, Sett().wetText(), `outside areas ${svcOpt.nr === 'on' ? 'to nearest' : 'left out'}`, App().state.dcInfra ? `plant expansions ${SP().hz.exp ? 'on' : 'off'}` : null, n ? `${n} criteria modified` : 'Peel criteria',
      `counting: ${basisTxt}${window.PeelTreeCounts ? ` (${window.PeelTreeCounts.label()})` : ''}`, `results: ${MA().yearText()}`].filter(Boolean).join(' · ');
  }
  // Scenario A: a pinned set of results to compare the current scenario with.
  function scenarioMetrics() {
    const M = App().state.svcModel; if (!M || !App().state.servicing) return null;
    const plants = {}, ps = {}, zones = {};
    for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) { const c = M.plantCap(pl); if (c) plants[pl] = { committed: c.committed, buildout: c.buildout, rated: c.rated }; }
    for (const d of App().state.servicing.psAreas || []) { const x = MA().psLoad(d); if (x) ps[d.id] = Math.round(x.pct); }
    for (const z of App().state.servicing.zones) { const l = M.zones.get(z.id); if (l) zones[z.id] = M.wMax(M.total(l), M.jobs(l)); }
    return { text: scenarioText(), at: new Date().toISOString().slice(0, 16).replace('T', ' '), plants, ps, zones };
  }
  function compareHTML() {
    const A = store.get('scenA', null), B = scenarioMetrics();
    if (!B) return '';
    if (!A) return `<p class="small"><button type="button" class="btn small" data-scen-pin="1">Pin this scenario as A</button> <span class="muted">then change the switches to compare plants, pumping stations and zones with it.</span></p>`;
    const pc = (v, r) => r ? Math.round(v / r * 100) : 0, d = (a, b) => { const x = b - a; return x === 0 ? '<span class="muted">0</span>' : `<strong class="${x > 0 ? 'up' : 'down'}">${x > 0 ? '+' : ''}${x}</strong>`; };
    const rows = Object.keys(B.plants).filter(pl => A.plants[pl]).map(pl => {
      const a = A.plants[pl], b = B.plants[pl];
      return `<tr><td>${esc(SD().PLANT_SHORT[pl])}</td><td>${pc(a.committed, a.rated)}%</td><td>${pc(b.committed, b.rated)}%</td><td>${d(pc(a.committed, a.rated), pc(b.committed, b.rated))}</td><td>${pc(a.buildout, a.rated)}%</td><td>${pc(b.buildout, b.rated)}%</td><td>${d(pc(a.buildout, a.rated), pc(b.buildout, b.rated))}</td></tr>`;
    }).join('');
    const over = m => Object.values(m.ps).filter(v => v > 100).length;
    const changed = Object.keys(B.ps).filter(id => A.ps[id] != null && (A.ps[id] > 100) !== (B.ps[id] > 100)).map(id => SD().svcById.get(id)).filter(Boolean);
    const zA = Object.values(A.zones).reduce((t, v) => t + v, 0), zB = Object.values(B.zones).reduce((t, v) => t + v, 0);
    return `<div class="scen-cmp"><p class="small"><strong>A</strong> (pinned ${esc(A.at)}): ${esc(A.text)}<br><strong>Now</strong>: ${esc(B.text)} <button type="button" class="btn small link" data-scen-pin="1">Re-pin as A</button> <button type="button" class="btn small link" data-scen-clear="1">Clear A</button></p>
      <table class="dt"><thead><tr><th>Plant</th><th>Existing + committed A</th><th>Now</th><th>Δ pts</th><th>Build-out A</th><th>Now</th><th>Δ pts</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small">Pumping stations over firm capacity at build-out: A ${over(A)} → now ${over(B)}${changed.length ? ` (changed: ${changed.map(a => esc(SD().drName(a).replace(/^[^·]+· /, ''))).join(', ')})` : ''}. Water max day at build-out, all zones: A ${fmt1(zA)} → now ${fmt1(zB)} ML/d.</p></div>`;
  }
  // Counting basis: which of each project's units the demand counts. It changes the math,
  // so it lives in the Scenario control, not the filter panel.
  const basisSwitch = () => `<div class="svc-switch" role="group" aria-label="${esc('Counting basis')}"><span class="muted small">Counting basis</span>${[['all', 'All units'], ['buildout', 'Applied for'], ['committed', 'Committed'], ['remaining', 'Left to build']].map(([v, t]) =>
    `<button type="button" class="btn small${App().state.basis === v ? ' on' : ''}" data-svcopt="basis" data-v="${v}" aria-pressed="${App().state.basis === v}">${t}</button>`).join('')}</div>`;
  // Results for year: the year the capacity colours, pipe loads and station loads are worked
  // out for — the census year, this year through the horizon end, or build-out (null).
  const yearSelect = () => {
    const cy = MA().censusYr(), opts = [[String(cy), `${cy} Census`]];
    for (let y = MM().THIS_YEAR; y <= SP().hz.end; y++) if (y !== cy) opts.push([String(y), String(y)]);
    opts.push(['bo', 'Build-out']);
    const cur = MA().getCapYear() == null ? 'bo' : String(MA().getCapYear());
    return `<label class="svc-switch"><span class="muted small">Results for year</span><select id="scen-year" autocomplete="off" aria-label="Results for year: the year the map's results are worked out for">${opts.map(([v, t]) =>
      `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  };
  function setCapYear(y) {
    MA().setCapYear(y);
    renderScenario(); MA().renderCapLayer(); MA().renderLegend(); ST().syncTraceSum(); if (AT().getFootTab() === 'dca') DCAT().renderDca();
    Sh().viewLink.write();
  }
  function renderScenario() {
    const el = $('#scen-bar'); if (!el) return;
    const R = App().state.reports, c = App().state.criteria, sp = R && R.water.southPeel, dv = R && R.wastewater.diversion;
    const open = el.querySelector('details') && el.querySelector('details').open;
    el.innerHTML = `<details class="scen"${open ? ' open' : ''}><summary><span class="scen-k">Scenario settings</span> <span class="muted small">(the chip above shows the scenario)</span>${store.get('scenA', null) ? ' <span class="chip">comparing with A</span>' : ''}</summary>
      <div class="svc-switches">
        ${basisSwitch()}
        ${yearSelect()}
        ${R ? optSwitch('ww', 'Wastewater', [['calibrated', 'Capacity check (2025 flows)'], ['design', 'Design flows (Peel criteria)']]) : ''}
        ${sp ? optSwitch('md', 'Water max day', [['design', `Design ×${c.water.maxDay}`], ['observed', `Observed 2025 ×${sp.maxDayFactor.toFixed(2)}`]]) : ''}
        ${dv ? optSwitch('div', `${fmt1(dv.mld)} ML/d diversion to ${SD().PLANT_SHORT[dv.to]}`, [['off', 'Off'], ['on', `On (planned ${dv.when})`]]) : ''}
        ${nearSwitch()}
      </div>
      ${compareHTML()}
      <p class="small muted">Horizon years: Wastewater → Plants & capacity. <span data-scen-crit>${scenCritLineHTML()}</span> — <button type="button" class="btn small link" data-goto-tab="criteria">Criteria &amp; references</button>. The scenario is saved in this browser and carried in share links and exports.</p>
      <div id="scen-criteria-mount"></div></details>`;
    TB().renderTbScen();
    const critMount = el.querySelector('#scen-criteria-mount');
    if (critMount) renderScenarioCriteria(critMount);
  }
  const nearSwitch = () => optSwitch('nr', 'Outside mapped areas', [['on', `Assign to nearest (≤${SD().kmText(SD().NEAR_M)})`], ['off', 'Leave out']]);
  const addLayers = (rows) => rows.reduce((t, r) => { for (const k of SUM_KEYS) t[k] = (t[k] || 0) + (r[k] || 0); return t; }, {});
  const LAYER_KEYS = ['census', 'built', 'approved', 'proposed'];
  const JOB_KEY = { census: null, built: 'jbuilt', approved: 'japproved', proposed: 'jproposed' };
  // Stacked bar for a row: census / built / approved / proposed as shares of its build-out
  // (the full bar = build-out; the numbers carry the size).
  function svcBar(l) {
    const t = l.census + l.built + l.approved + l.proposed, max = t || 1;
    const seg = (k, cls, label) => l[k] > 0 ? `<span class="gseg ${cls}" style="width:${(100 * l[k] / max).toFixed(2)}%" title="${label}: ${fmtNum(Math.round(l[k]))} people"></span>` : '';
    return `<div class="svc-bar" role="img" aria-label="Build-out ${fmtNum(Math.round(t))} people">${seg('census', 'g-base', 'Census')}${seg('built', 'g-built', 'Built since')}${seg('approved', 'g-approved', 'Committed')}${seg('proposed', 'g-proposed', 'Proposed')}</div>`;
  }
  const svcLegend = Y => `<ul class="grow-legend svc-legend"><li><span class="gsw g-base"></span>${Y} Census</li><li><span class="gsw g-built"></span>Built since</li><li><span class="gsw g-approved"></span>Committed</li><li><span class="gsw g-proposed"></span>Proposed (in review)</li><li class="muted">Each bar is the row's build-out population, split by layer · click a row to zoom to it on the map</li></ul>`;
  // Drainage areas as a tree along the sewer flow path (data/servicing.json: downstream).
  function svcFlowTree() {
    const ids = new Set(App().state.servicing.drainage.map(d => d.id));
    const kids = new Map();
    for (const d of App().state.servicing.drainage) {
      const to = d.downstream && ids.has(d.downstream) ? d.downstream : null;
      if (to) (kids.get(to) || kids.set(to, []).get(to)).push(d);
    }
    return kids;
  }
  const upstreamOf = (id, kids) => { const out = []; const walk = i => { for (const c of kids.get(i) || []) { out.push(c); walk(c.id); } }; walk(id); return out; };
  // View options: wastewater 'design' (Peel criteria) or 'calibrated' (each plant scaled to its
  // 2025 reported average flow); water max day factor 'design' or 'observed' (2025 South Peel).
  // The wastewater flow compared with plant capacity, by mode. Capacity check scales every layer to
  // each plant's 2025 measured annual average (wet weather included), so it is an annual average
  // flow; design flows are average dry weather flow (ADWF) at Peel criteria.
  const wwFlowLabel = (form = 'short') => svcOpt.ww === 'calibrated'
    ? (form === 'long' ? 'annual average flow (2025 measured at each plant; growth at the plant\u2019s measured rate)' : 'annual average flow')
    : (form === 'long' ? 'average dry weather flow (ADWF, Peel design criteria)' : 'ADWF');
  // The water maximum day basis, by mode: design factor, or the 2025 observed factor (summed plant
  // maximum days, non-coincident, including York supply; applied on top of the design per-capita rate).
  const wMaxDayLabel = () => svcOpt.md === 'observed'
    ? `maximum day at the 2025 observed factor (\u00d7${(App().state.reports && App().state.reports.water.southPeel.maxDayFactor || 0).toFixed(2)}, on the design per-capita rate)`
    : `design maximum day (\u00d7${App().state.criteria.water.maxDay})`;
  const svcOpt = { ww: store.get('svcWwMode', 'calibrated'), md: store.get('svcMdMode', 'design'), div: store.get('svcDivert', 'off'), tech: store.get('svcTech', 'off'), nr: store.get('svcNear', 'on') };
  const optSwitch = (key, label, opts) => `<div class="svc-switch" role="group" aria-label="${esc(label)}"><span class="muted small">${label}</span>${opts.map(([v, t]) =>
    `<button type="button" class="btn small${svcOpt[key] === v ? ' on' : ''}" data-svcopt="${key}" data-v="${v}" aria-pressed="${svcOpt[key] === v}">${t}</button>`).join('')}</div>`;
  const refLink = (r, pages) => { const rep = App().state.reports && App().state.reports.reports[r]; return rep ? `<a href="${esc(rep.url)}" target="_blank" rel="noopener">${esc(rep.title)}</a>${pages ? ` (${esc(pages)})` : ''}` : ''; };
  // Which criteria and data a table rests on, with a badge when the criteria were edited.
  const CRIT_LABEL = { ppu: 'Persons per unit', water: 'Water', wastewater: 'Wastewater', employment: 'Employment', m2PerJob: 'Floor space per job' };
  function criteriaChanges() {
    const out = [], c = App().state.criteria, d = D.DEFAULT_CRITERIA;
    for (const g of Object.keys(d)) for (const k of Object.keys(d[g])) { const v = g === 'wastewater' && k === 'infiltration' ? App().state.iiBase : c[g] && c[g][k]; if (c[g] && +v !== +d[g][k]) out.push(`${CRIT_LABEL[g] || g} ${k} ${v} (default ${d[g][k]})`); }
    return out;
  }
  // Phase 4: the editable design criteria live in the Scenario control (scenario bar),
  // not in the Settings tab. renderScenarioCriteria renders the editor into the mount
  // Worker A puts in the scenario bar (<div id="scen-criteria-mount">); exposed globally
  // so the shell can call it. Every parameter shows its edited value beside its Peel
  // default and its source document.
  const CRIT_KEY_LABEL = {
    ppu: { single: 'Single / semi', town: 'Townhouse', apartment: 'Apartment', apartmentHigh: 'Apartment, >475 persons/ha', unknown: 'Type not stated' },
    water: { avg: 'Average day', maxDay: 'Max day factor', peakHour: 'Peak hour factor' },
    wastewater: { avg: 'Residential', infiltration: 'I&I', peakMin: 'Peaking min', peakMax: 'Peaking max' },
    employment: { water: 'Water', maxDay: 'Max day factor', peakHour: 'Peak hour factor', wastewater: 'Wastewater', peakMin: 'Peaking min', peakMax: 'Peaking max' },
    m2PerJob: { industrial: 'Industrial', office: 'Office', retail: 'Retail', hotel: 'Hotel', institutional: 'Institutional' },
  };
  const CRIT_STEP = { ppu: 0.1, water: { avg: 1, maxDay: 0.1, peakHour: 0.1 }, wastewater: { avg: 1, infiltration: 0.01, peakMin: 0.1, peakMax: 0.1 }, employment: { water: 1, maxDay: 0.1, peakHour: 0.1, wastewater: 1, peakMin: 0.1, peakMax: 0.1 }, m2PerJob: 1 };
  const critStep = (g, k) => (typeof CRIT_STEP[g] === 'object' ? CRIT_STEP[g][k] : CRIT_STEP[g]) || 0.1;
  const critVal = (g, k) => g === 'wastewater' && k === 'infiltration' ? App().state.iiBase : App().state.criteria[g][k];
  const critIsMod = (g, k) => +critVal(g, k) !== +D.DEFAULT_CRITERIA[g][k];
  function renderScenarioCriteria(mountEl) {
    if (!mountEl) return;
    const c = App().state.criteria, d = D.DEFAULT_CRITERIA;
    const n = criteriaChanges().length;
    const srcOf = g => { const s = D.sourceOf(g, Object.keys(d[g])[0]); return s ? `${esc(s.doc)}, ${esc(s.ver)}` : ''; };
    const rows = Object.keys(d).map(g => {
      const sub = `<tr class="sub"><td colspan="4">${esc(CRIT_LABEL[g] || g)}<div class="muted small">${srcOf(g)}</div></td></tr>`;
      const rs = Object.keys(d[g]).map(k => {
        const mod = critIsMod(g, k), v = critVal(g, k);
        const step = critStep(g, k), unit = (D.CRIT_UNITS[g] || {})[k] || '';
        return `<tr${mod ? ' class="mod"' : ''}><td>${esc((CRIT_KEY_LABEL[g] || {})[k] || k)}${unit ? ` <span class="muted small">${esc(unit)}</span>` : ''}</td>`
          + `<td><input type="number" min="0" step="${step}" data-g="${g}" data-k="${k}" value="${v}" aria-label="${esc(`${CRIT_LABEL[g] || g} ${(CRIT_KEY_LABEL[g] || {})[k] || k}`)}"${mod ? ' class="mod"' : ''}></td>`
          + `<td class="muted">${mod ? `<strong>${esc(String(d[g][k]))}</strong>` : esc(String(d[g][k]))}</td>`
          + `<td>${mod ? `<span class="badge-mod" title="${esc(`${CRIT_LABEL[g] || g} ${(CRIT_KEY_LABEL[g] || {})[k] || k}: edited ${v}, Peel default ${d[g][k]}`)}">edited</span>` : '<span class="muted small">Peel default</span>'}</td></tr>`;
      }).join('');
      return sub + rs;
    }).join('');
    mountEl.innerHTML = `<details class="scen-crit"${n ? ' open' : ''}><summary><span class="scen-k">Design criteria</span> <span class="muted small">${n ? `<strong>${n} modified</strong> — edited values are used everywhere` : 'Peel defaults — tap to edit'}</span></details>`;
    // Rebuild: keep the summary, then the table + reset (details content after summary).
    mountEl.querySelector('details').insertAdjacentHTML('beforeend',
      `<table class="dt crit-table"><thead><tr><th>Criterion</th><th>Edited</th><th>Peel default</th><th></th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small"><button type="button" class="btn small" data-scen-crit-reset>Reset to Peel criteria</button>
      <span class="muted small">Apartments use the large-apartment rate unless the site holds more than ${D.APT_DENSITY} persons/ha at that rate, or its area is not known.</span></p>`);
    if (mountEl._scenCritWired) return;
    mountEl._scenCritWired = true;
    mountEl.addEventListener('input', e => {
      const el = e.target; if (!el.dataset.g) return;
      const v = Number(el.value);
      if (!(v >= 0)) return;
      if (el.dataset.g === 'wastewater' && el.dataset.k === 'infiltration') { App().state.iiBase = v; Sett().applyWet(); }
      else App().state.criteria[el.dataset.g][el.dataset.k] = v;
      Sett().saveCriteria();
      Sett().refreshCriteria(el.dataset.g === 'm2PerJob' && v > 0);
      if (el.dataset.g === 'wastewater' && el.dataset.k === 'infiltration') Sett().wetChanged();
      // Update the row's modified marker without re-rendering (keeps focus in the input).
      const tr = el.closest('tr');
      if (tr) {
        const mod = critIsMod(el.dataset.g, el.dataset.k);
        tr.classList.toggle('mod', mod);
        el.classList.toggle('mod', mod);
        const badge = tr.cells[3];
        if (badge) badge.innerHTML = mod ? `<span class="badge-mod">edited</span>` : '<span class="muted small">Peel default</span>';
      }
      TB().renderTbScen(); syncScenCrit();
    });
    mountEl.addEventListener('click', e => {
      if (!e.target.closest('[data-scen-crit-reset]')) return;
      Sett().resetCriteriaToPeel();
      renderScenarioCriteria(mountEl);
      GUI().renderCriteria(); Sett().refreshCriteria(true);
      TB().renderTbScen(); syncScenCrit();
    });
  }
  window.renderScenarioCriteria = renderScenarioCriteria;
  // The scenario bar's one-line criteria note, kept in sync when the mount edits values.
  const scenCritLineHTML = () => { const n = criteriaChanges().length; return `Criteria: ${n ? `<strong>${n} modified</strong>` : 'Peel defaults'}`; };
  function syncScenCrit() {
    const bar = $('#scen-bar'); if (!bar) return;
    const line = bar.querySelector('[data-scen-crit]');
    if (line) line.innerHTML = scenCritLineHTML();
    TB().renderTbScen();
  }
  // ---- Plain-language headlines: one sentence at the top of each tab, written from the numbers.
  function setHeadline(el, html) {
    if (!el) return;
    const old = el.querySelector(':scope > .headline'); if (old) old.remove();
    if (html) el.insertAdjacentHTML('afterbegin', hlP(html));
  }
  // Plants are shown as a % of their rated capacity everywhere (the 90% expansion trigger is a
  // marker on that scale); their constraint's util is relative to the trigger, so scale it back.
  function pctRated(c, k) { return Math.round(c.util[k] * (c.kind === 'plant' || c.kind === 'wplant' ? MP().PLANT_TRIGGER : 1) * 100); }
  function trigText(c) { return c.out === 'today' ? 'is at its 90% expansion trigger now' : c.out ? `reaches its 90% expansion trigger ≈${c.out}` : `stays below its 90% expansion trigger to ${SP().hz.end}`; }
  function plantHeadline() {
    const list = ['Lakeview', 'Clarkson', 'Inglewood'].map(pl => MP().cached(`plant:${pl}`, () => MP().plantCons(pl))).filter(Boolean);
    if (!list.length) return '';
    const one = c => `<strong>${esc(SD().PLANT_SHORT[c.pl])}</strong> ${trigText(c)} (existing + built + committed ${pctRated(c, 'com')}% of rated capacity → ${pctRated(c, 'bo')}% at build-out${c.util.bo >= 1 && c.relief.length ? `; next expansion ${esc(c.relief[0].text)}` : ''})`;
    return list.sort((a, b) => b.util.bo - a.util.bo).map(one).join('; ') + '.';
  }
  function renderHeadlines() {
    const M = App().state.svcModel; if (!M) return;
    // Water: the zone adding the most, and South Peel treatment.
    const zs = [...M.zones.entries()].map(([id, l]) => ({ a: SD().svcById.get(id), add: M.wMax(M.total(l), M.jobs(l)) - M.wMax(l.census, 0) })).filter(x => x.a).sort((a, b) => b.add - a.add);
    const w = App().state.reports ? MP().cached('wsys:lake', () => MP().waterPlantCons({ zone: '1' })) : null;
    setHeadline($('#water-body'), zs[0] ? `<strong>${esc(zs[0].a.name.replace('Pressure zone ', 'Zone '))}</strong> adds the most water demand: +${fmt1(zs[0].add)} ML/d at maximum day by build-out${zs[1] ? `, then ${esc(zs[1].a.name.replace('Pressure zone ', 'Zone '))} (+${fmt1(zs[1].add)})` : ''}.` : '');
    setHeadline($('#wcap-body'), w ? `South Peel water treatment ${trigText(w)} (existing + built + committed ${pctRated(w, 'com')}% of rated capacity → ${pctRated(w, 'bo')}% at build-out).` : '');
    setHeadline($('#plants-body'), plantHeadline());
    // Blocks: the block carrying the most (pumping stations have their own sub-view now).
    const top = App().state.servicing.drainage.filter(d => !d.downstream).map(d => ({ d, l: M.cum.get(d.id) })).filter(x => x.l).sort((a, b) => M.adwf(b.l) - M.adwf(a.l))[0];
    setHeadline($('#ww-body'), top ? `<strong>${esc(SD().drName(top.d))}</strong> delivers the most flow to ${esc(SD().plantLabel(top.d.plant))}: ${fmt1(M.adwf(top.l, M.fOf(top.d.plant)))} ML/d ${wwFlowLabel()} at build-out.` : '');
  }
  function renderSvcTab() {
    const bc = CA().baselineCensus();
    const has = !!(App().state.servicing && bc);
    $('#ftab-svc').hidden = !has;
    $('#ftab-dca').hidden = !has || !App().state.dcInfra;
    if (!has) return;
    // Not before the servicing lookup is filled (js/svc-data.js): a model built without it counts
    // rural land as sewered and tags no development — Inglewood read 398% until the next rebuild.
    // No model is better than a wrong one (SPEC 1.4).
    if (!SD().svcById.size) return;
    const p = DV().scopedDev();
    if (!p && SP().getSavedSubs()) {
      // Back from a scoped view: restore the sub-tab choices and the full set of panes.
      { const _ss = SP().getSavedSubs(); AT().setWSub(_ss && _ss.wSub); AT().setWwSub(_ss && _ss.wwSub); SP().setSavedSubs(null); }
      for (const id of ['#pane-wcap', '#pane-wfac', '#pane-alloc', '#pane-plants', '#pane-pumpstations']) { const n = $(id); if (n) n.dataset.off = ''; }
      for (const s of document.querySelectorAll('.f-subtabs[data-pane="water"], .f-subtabs[data-pane="ww"]')) s.dataset.off = '';
    }
    const c = App().state.criteria, E = c.employment, Y = bc.year, R = App().state.reports;
    $('#analysis').classList.toggle('show-tech', svcOpt.tech === 'on');
    svcCensusPop(bc);
    const censusHowW = bc._svcMethod === 'centre' ? 'by dissemination areas whose centre falls inside' : 'shared out by the area of each dissemination area inside it';
    const censusHow = bc._svcMethod === 'overlap' ? 'shared out by the area of each dissemination area inside it' : 'by dissemination areas whose centre falls inside';
    const total = l => l.census + l.built + l.approved + l.proposed;
    const jobs = l => (l.jbuilt || 0) + (l.japproved || 0) + (l.jproposed || 0);
    const jobsK = (l, k) => JOB_KEY[k] ? (l[JOB_KEY[k]] || 0) : 0;
    const who = (people, j) => `${uPop(people)}${j > 0 ? ` · ${unit(fmtNum(Math.round(j)), 'jobs')}` : ''}`;
    const cell = (mld, people, j, cls = '') => `<td class="${cls}">${uML(mld)}${people != null ? `<small>${who(people, j)}</small>` : ''}</td>`;
    const focus = ST().svcFocus.id;
    const rowAttrs = (id, cls) => id ? ` class="${cls} svc-row${id === focus ? ' on' : ''}" data-svc="${esc(id)}" tabindex="0"` : ` class="${cls}"`;
    // Simple view: the layer-by-layer and local / upstream columns (class xc) are hidden; the
    // Engineering switch shows them.
    const layerHead = `<th class="xc">${Y} Census</th><th class="xc">+ Built since</th><th class="xc">+ Approved</th><th class="xc">+ Proposed (in review)</th><th>Build-out</th>`;

    // ---- Water: maximum day (ML/d) by layer, peak hour at build-out; residential + employment.
    const sp = R && R.water.southPeel;
    const observed = svcOpt.md === 'observed' && sp;
    const mdR = observed ? sp.maxDayFactor : c.water.maxDay, mdE = observed ? sp.maxDayFactor : E.maxDay;
    const wAvg = (p, j) => (p * c.water.avg + j * E.water) / 1e6;
    const wMax = (p, j) => (p * c.water.avg * mdR + j * E.water * mdE) / 1e6;
    const wPH = (p, j) => (p * c.water.avg * c.water.peakHour + j * E.water * E.peakHour) / 1e6;
    const wRow = (name, l, id, cls = '') => `<tr${rowAttrs(id, cls)}><td>${name}</td><td class="bar">${svcBar(l)}</td>${devCell(l)}${LAYER_KEYS.map(k => cell(wMax(l[k], jobsK(l, k)), l[k], jobsK(l, k), 'xc')).join('')}
      ${cell(wMax(total(l), jobs(l)), total(l), jobs(l), 'bo')}<td class="bo">${uML(wPH(total(l), jobs(l)))}</td></tr>`;
    const zones = App().state.servicing.zones.slice().sort(SD().byZone);
    const zr = zones.map(z => ({ a: z, l: svcLayerTotals('pz', z, bc) })).filter(r => total(r.l) > 0 || r.l.devs);
    const zsum = addLayers(zr.map(r => r.l));
    // ---- Water: Zones sub-view (headline → tiles → chart → top-N table → ⓘ line). ----
    const wcapM = { Y, zones: new Map(zr.map(r => [r.a.id, r.l])), wMax, wAvg, wPH, total, jobs };
    $('#water-body').innerHTML = `${SCREEN_NOTE}<div class="svc-head">${svcLegend(Y)}<div class="svc-switches">${TS().inViewBox()}</div></div>
      ${WTab().waterZonesHTML(zr, zsum, { wMax, wPH, total, jobs, wRow, layerHead, Y, c, E, mdR, mdE, observed, censusHowW })}`;
    // ---- Water: Capacity sub-view. The 2025 production / Caledon groundwater reports moved
    // to Sources & checks (window.ModelChecks); the hydraulic check moved to its own sub-view.
    $('#wcap-body').innerHTML = `${WTab().waterCapHTML(wcapM)}`;
    // ---- Water: Facilities sub-view (tiles → Master Plan compare → facilities table). ----
    $('#wfac-body').innerHTML = `${MP().waterFacilitiesHTML()}`;
    // ---- Water: Hydraulic check sub-view (pane + button created by Worker A in index.html).
    const hydPane = $('#hyd-box'); if (hydPane) hydPane.outerHTML = MP().hydroBoxHTML();
    const hydBtn = document.querySelector('[data-wsub="hydro"]'); if (hydBtn) hydBtn.hidden = !(window.PeelUtil || {}).PIPE_RESULTS;   // EPANET per-main results: off for now
    $('#water-note').textContent = `${Y} Census baseline (follows the timeline) · top zones by build-out maximum day`;

    // ---- Wastewater: each catchment's own (local) flow plus everything upstream of it along the
    // traced flow path = the total passing its outlet, building up to the plant on the lake.
    // Residential + employment; peak dry = each peaked on its own count (Harmon; employment kept
    // between Peel's min and max) and added; peak wet = peak dry + I&I on the whole drainage area.
    const kids = svcFlowTree();
    const local = new Map(App().state.servicing.drainage.map(d => [d.id, { ...svcLayerTotals('dr', d, bc), ha: d.areaHa || 0 }]));
    const sum = list => { const t = addLayers(list); t.ha = list.reduce((a, x) => a + (x.ha || 0), 0); return t; };
    const cum = new Map();
    const cumOf = d => { if (cum.has(d.id)) return cum.get(d.id); const v = sum([local.get(d.id), ...(kids.get(d.id) || []).map(cumOf)]); cum.set(d.id, v); return v; };
    const upOf = d => sum((kids.get(d.id) || []).map(cumOf));
    const raw = (p, j) => (p * c.wastewater.avg + j * E.wastewater) / 1e6;
    const adwf = (l, f = 1) => f * raw(total(l), jobs(l));
    const pdwf = (l, f = 1) => f * (total(l) * c.wastewater.avg / 1e6 * D.residentialPeaking(total(l), c.wastewater) + jobs(l) * E.wastewater / 1e6 * D.employmentPeaking(jobs(l), E));
    const ii = l => l.ha * c.wastewater.infiltration * 86400 / 1e6;
    const plants = ['Lakeview', 'Clarkson', 'Inglewood'];
    const plantList = pl => App().state.servicing.drainage.filter(d => d.plant === pl);
    const rootsOf = list => list.filter(d => !d.downstream || !list.some(x => x.id === d.downstream));
    const plantSum = pl => sum(rootsOf(plantList(pl)).map(cumOf));
    // Calibration: scale each plant's population / employment flow so that today's model
    // (census + built since, plus the external inflows known to reach it) matches its 2025
    // reported annual average.
    const inflowsTo = pl => R ? R.wastewater.inflows.filter(x => x.plant === pl).reduce((t, x) => t + x.mld, 0) : 0;
    const calib = {};
    for (const pl of plants) {
      const rep = R && R.wastewater.plants[pl], s = plantSum(pl);
      const today = raw(s.census + s.built, s.jbuilt);
      calib[pl] = { today, rep, f: rep && today > 0 ? Math.max(0.1, (rep.avgMLd - inflowsTo(pl)) / today) : null };
    }
    const fOf = pl => (svcOpt.ww === 'calibrated' && calib[pl] && calib[pl].f) || 1;
    const peakCells = (l, f) => `<td>${uML(pdwf(l, f))}<small class="tech">M ${total(l) > 0 ? D.residentialPeaking(total(l), c.wastewater).toFixed(2) : '–'}</small></td><td>${uML(ii(l))}<small class="tech">${uHa(l.ha)}</small></td><td class="bo">${uML(pdwf(l, f) + ii(l))}</td>`;
    const nameCell = (name, sub, depth) => `<td style="padding-left:${6 + depth * 12}px">${depth ? '<span class="flow-arrow" aria-hidden="true">↳</span>' : ''}${name}${sub ? `<small>${sub}</small>` : ''}</td>`;
    const lay = (l, k, f) => f * raw(l[k], jobsK(l, k));
    const sRow = (name, sub, d, l, id, f, cls = '', depth = 0) => {
      const lo = d ? local.get(d.id) : null, up = d ? upOf(d) : null;
      // Where the flow comes from (local + upstream) and what it is made of (census + growth
      // layers); both add up to the total average dry weather flow at the outlet.
      const mid = (d ? cell(adwf(lo, f), total(lo), jobs(lo), 'xc') + (total(up) > 0 || up.ha ? cell(adwf(up, f), total(up), jobs(up), 'xc') : '<td class="muted xc">–</td>') : '<td class="xc"></td><td class="xc"></td>')
        + LAYER_KEYS.map((k, i) => cell(lay(l, k, f), l[k], jobsK(l, k), i ? 'xc' : 'sep xc')).join('') + cell(adwf(l, f), total(l), jobs(l), 'bo');
      return `<tr${rowAttrs(id, cls)}>${nameCell(name, sub, depth)}<td class="bar">${svcBar(l)}</td>${devCell(d ? lo : l)}${mid}${peakCells(l, f)}</tr>`;
    };
    const short = (d, pl) => d.name.replace(`${pl} · `, '');
    // Rows run from the top of each sewershed down to the lake: a branch's furthest catchment
    // first (by distance of its outlet from the plant), each catchment after everything that
    // drains into it, the plant's total inflow last.
    const plantAt = Object.fromEntries((App().state.servicing.meta.plants || []).map(p => [p.name, p.lnglat]));
    const far = (d, pl) => { const o = d.outletAt, p = plantAt[pl]; return o && p ? Math.hypot((o[0] - p[0]) * 0.72, o[1] - p[1]) : 0; };
    const reach = new Map();   // furthest outlet distance in a branch
    const reachOf = (d, pl) => reach.has(d.id) ? reach.get(d.id) : reach.set(d.id, Math.max(far(d, pl), ...(kids.get(d.id) || []).map(k => reachOf(k, pl)))).get(d.id);
    const shown = l => total(l) > 0 || l.devs;
    const sec = pl => {
      const roots = rootsOf(plantList(pl)), tot = sum(roots.map(cumOf)), f = fOf(pl);
      const rows = [];
      const walk = (d, depth) => {
        for (const k of (kids.get(d.id) || []).slice().sort((x, y) => reachOf(y, pl) - reachOf(x, pl))) walk(k, depth + 1);
        const l = cumOf(d);
        if (!shown(l)) return;
        const to = d.downstream ? SD().svcById.get(d.downstream) : null;
        const n = (kids.get(d.id) || []).filter(k => shown(cumOf(k))).length;
        const sub = d.kind === 'plant' ? `direct-to-plant area${n ? ` + ${n} catchment${n > 1 ? 's' : ''} upstream` : ''}`
          : d.kind === 'untraced' ? 'drains to the City of Toronto system'
          : `→ ${esc(to ? short(to, pl) : SD().plantLabel(pl))}${n ? ` · ${n} upstream` : ''}${(sp => { if (!sp) return ''; const ls = v => v * 1e6 / 86400, dry = ls(pdwf(l, 1)) / sp.firmLs * 100, wet = ls(pdwf(l, 1) + ii(l)) / sp.firmLs * 100; return ` · <span class="${wet >= 100 ? 'over' : ''}" title="${esc(SD().spsNote(sp))}">firm ${fmtNum(sp.firmLs)} L/s: peak wet ≈${Math.round(wet)}% (dry ${Math.round(dry)}%)</span>`; })(SD().spsOf(d))}`;
        const label = d.kind === 'plant' ? `${esc(SD().plantLabel(pl))} · total inflow` : esc(short(d, pl));
        rows.push(sRow(label, sub, d, l, d.id, f, roots.length === 1 && d === roots[0] ? 'sub' : '', depth));
      };
      for (const r of roots.sort((x, y) => reachOf(y, pl) - reachOf(x, pl))) walk(r, 0);
      if (roots.length > 1) rows.push(sRow(`${esc(SD().PLANT_SHORT[pl])} total`, '', null, tot, null, f, 'sub'));
      return { pl, rows, sum: tot, f };
    };
    const secs = plants.map(sec).filter(x => x.rows.length);
    const tor = sec('Toronto');
    const cols = 13;
    const peel = sum(secs.map(x => x.sum));
    // The Peel total under calibration: each plant at its own factor (flows add; Harmon on the total).
    const peelF = peel.census + peel.built + peel.approved + peel.proposed > 0 ? secs.reduce((t, x) => t + adwf(x.sum, x.f), 0) / Math.max(1e-9, adwf(peel)) : 1;
    const calNote = svcOpt.ww === 'calibrated' ? `<p class="small cal-note"><strong>Capacity check (calibrated to 2025 flows):</strong> ${secs.filter(x => x.f !== 1).map(x => `${esc(SD().PLANT_SHORT[x.pl])} ×${x.f.toFixed(2)}`).join(' · ')}. Each plant's population and employment flow is scaled so that today (census + built since${R && R.wastewater.inflows.some(x => x.plant) ? ', plus the York Region inflow at G.E. Booth' : ''}) matches its 2025 reported annual average; the factor absorbs existing employment, institutional and commercial flow, infiltration in dry weather and any flows not modelled. I&amp;I is not scaled.</p>` : '';
    // Phase 4: Blocks sub-view tiles + chart — the largest catchments by build-out flow.
    const rankedC = [];
    for (const d of App().state.servicing.drainage) {
      const l = cum.get(d.id); if (!l || !(total(l) > 0)) continue;
      rankedC.push({ d, l, bo: adwf(l, fOf(d.plant)) });
    }
    rankedC.sort((a, b) => b.bo - a.bo);
    const top8 = rankedC.slice(0, 8), top8Max = Math.max(1e-9, ...top8.map(x => x.bo));
    $('#ww-body').innerHTML = `${SCREEN_NOTE}<div class="svc-head">${svcLegend(Y)}<div class="svc-switches">${optSwitch('tech', 'Columns', [['off', 'Simple'], ['on', 'Engineering']])}${TS().inViewBox()}</div></div>${calNote}
      <div class="tiles">${[
        DUI().wwTile(App().state.servicing.blocks ? 'Wastewater blocks' : 'Catchments', fmtNum(rankedC.length), '', 'traced to the lake', 'drainage-area'),
        DUI().wwTile('Peel build-out', fmt1(adwf(peel, peelF)), 'ML/d', `${wwFlowLabel()} · ${uPop(total(peel))}`, 'drainage-area'),
        ...(rankedC[0] ? [DUI().wwTile('Largest single catchment', fmt1(rankedC[0].bo), 'ML/d', `${esc(short(rankedC[0].d, rankedC[0].d.plant))} → ${esc(SD().plantLabel(rankedC[0].d.plant))}`, 'drainage-area')] : []),
        DUI().wwTile('Peak wet build-out', fmt1(pdwf(peel, peelF) + ii(peel)), 'ML/d', `of it I&amp;I ${fmt1(ii(peel))} ML/d`, 'drainage-area'),
      ].join('')}</div>
      <h3 class="svc-sub">Largest catchments <span class="muted small">build-out ${wwFlowLabel()}, ML/d</span></h3>
      <div>${top8.map(x => DUI().miniBar(esc(short(x.d, x.d.plant)), x.bo, top8Max, 'ML/d')).join('')}</div>
      <table class="dt svc-table ww-table" data-info="drainage-area"><caption>Wastewater by ${App().state.servicing.blocks ? 'block (the Region\'s 40 I&amp;I sewersheds)' : 'sanitary catchment'}, building up along the flow path to the lake · average dry weather (ML/d); people and jobs below</caption>
      <thead><tr><th rowspan="2">${App().state.servicing.blocks ? 'Block' : 'Catchment'} (top of the sewershed → plant)</th><th rowspan="2" class="bar-h">Build-out mix</th><th rowspan="2">Developments</th>
        <th colspan="2" class="grp-h xc">Where it comes from</th><th colspan="4" class="grp-h sep xc">What it is made of</th><th rowspan="2">= Total<br>${svcOpt.ww === 'calibrated' ? 'annual avg' : 'ADWF'}</th><th rowspan="2">Peak dry<br>weather</th><th rowspan="2">I&amp;I</th><th rowspan="2">Peak wet<br>weather</th></tr>
        <tr class="xc-row"><th class="xc">Local</th><th class="xc">+ Upstream</th><th class="sep xc">${Y} Census</th><th class="xc">+ Built since ${Y}</th><th class="xc">+ Approved</th><th class="xc">+ Proposed (in review)</th></tr></thead>
      <tbody>${secs.map(x => `<tr class="grp"><td colspan="${cols}">${esc(SD().plantLabel(x.pl))}</td></tr>${x.rows.join('')}`).join('')}
        ${sRow(`Peel total (${secs.map(x => SD().PLANT_SHORT[x.pl]).join(' + ')})`, '', null, peel, null, peelF, 'tot')}
        ${tor.rows.length ? `<tr class="grp"><td colspan="${cols}">${esc(SD().plantLabel('Toronto'))} · not in the Peel total</td></tr>${tor.rows.join('')}` : ''}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary>${nearNote([...local.values()].reduce((a, l) => a + (l.near || 0), 0), 'traced catchment')}<p class="small muted">ML/d = megalitres per day, at build-out (${Y} Census + growth). ${App().state.servicing.blocks ? `<strong>Blocks</strong> are the Region of Peel's 40 wastewater sewersheds (its inflow &amp; infiltration program; the blocks of "Dragonfly"); each drains into the next block along the sewers (data/sewers.json: the pipe leaving the block that carries the most people) down to its plant. ` : ''}<strong>Local</strong> = the catchment's own population, jobs and flow; <strong>upstream</strong> = everything that drains into it (the indented rows above it); <strong>total</strong> = local + upstream = ${Y} Census + built + approved + proposed, the average dry weather flow leaving its outlet. Each plant's last row is its total inflow from Peel catchments; external inflows (York Region, City of Toronto) are in the Plants tab. Residential ${c.wastewater.avg} L/cap/d, employment ${E.wastewater} L/emp/d (jobs on development sites; existing employment is not in the census baseline). <strong>Peak dry weather</strong> = residential average × Harmon M = 1 + 14 / (4 + √(P/1000)) on the total population (M shown) + employment average × Harmon on the jobs, kept between ${E.peakMin} and ${E.peakMax}; <strong>I&amp;I</strong> = ${c.wastewater.infiltration} L/s/ha on the whole traced drainage area to the outlet; <strong>peak wet weather</strong> = peak dry + I&amp;I. Peaks are not additive. ${Y} Census ${censusHow}; growth from every development located in the catchment (other filters ignored).${App().state.servicing.blocks ? '' : ' Pumping stations: firm capacity from the 2020 Master Plan (Vol. 4, Table 6; largest pump out of service) against the build-out flow at Peel design criteria (not calibrated); I&amp;I here uses the traced catchment outline, which overstates the area of small catchments, so peak wet is approximate (≈). Very small stations (Watersedge, Meadowvale) showing over 100% even at peak dry most likely have a traced catchment larger than the area they really serve.'} Click a ${App().state.servicing.blocks ? 'block' : 'catchment'} to see its flow path to the lake on the map.</p></details>
      ${DUI().wwInfoLine('Flows build up along the traced flow path to the lake: each catchment\u2019s own flow plus everything upstream of it.')}`;
    // Kept for the development panel's servicing check and the export.
    const dvR = R && R.wastewater.diversion, divMldOf = pl => !(dvR && svcOpt.div === 'on') ? 0 : pl === dvR.from ? -dvR.mld : pl === dvR.to ? dvR.mld : 0;
    const plantCap = pl => {
      const rep = R && R.wastewater.plants[pl]; if (!rep) return null;
      const s = plantSum(pl), f = fOf(pl);
      // The diversion counts only from its start year (Horizon's diversion year, default 2028):
      // not in today's existing flow before then; committed and build-out are future, so they take it.
      const divFrom = (SP() && SP().hz && SP().hz.divYear) || 2028, divNow = MM().THIS_YEAR >= divFrom;
      const ext = n => inflowsTo(pl) + (n <= 1 && !divNow ? 0 : divMldOf(pl));
      const up0 = n => { const o = { census: s.census, built: n > 0 ? s.built : 0, approved: n > 1 ? s.approved : 0, proposed: n > 2 ? s.proposed : 0, jbuilt: n > 0 ? s.jbuilt : 0, japproved: n > 1 ? s.japproved : 0, jproposed: n > 2 ? s.jproposed : 0 }; return adwf(o, f) + ext(n); };
      // SPEC 1.4: in the capacity check a plant's Existing is its 2025 metered flow (it already
      // contains Built). The calibration gives exactly that unless its factor is clamped (a sewershed
      // holding far more census people than the plant serves: Inglewood); anchor the layers to the
      // metered flow then, so growth adds to what the plant actually treats.
      const anchor = svcOpt.ww === 'calibrated' && rep.avgMLd > 0 ? rep.avgMLd - (up0(1) - (divNow ? divMldOf(pl) : 0)) : 0;   // (the meter includes the external inflows; it saw no diversion)
      const up = n => up0(n) + (Math.abs(anchor) > 1e-9 ? anchor : 0);
      const today = { census: s.census, built: s.built, approved: 0, proposed: 0, jbuilt: s.jbuilt }, popToday = total(today);
      return { rated: rep.ratedMLd, name: rep.name, census: Math.max(0, up(0)), existing: up(1), committed: up(2), buildout: up(3), f, anchored: Math.abs(anchor) > 1e-6 ? anchor : 0, perPerson: popToday > 0 ? adwf(today, f) * 1e6 / popToday : 0, popToday };
    };
    for (const d of App().state.servicing.drainage) cumOf(d);
    // A model rebuild (e.g. the 2025 annual reports arriving) is a new scenario for every cache.
    App().state.svcGen = (App().state.svcGen || 0) + 1;
    App().state.svcModel = { Y, mode: svcOpt.ww, cum, local, fOf, adwf, pdwf, ii, total, jobs, plantCap, zones: new Map(zr.map(r => [r.a.id, r.l])), wMax, wPH, wAvg, calib, inflowsTo, zsum, secs, raw };
    // The sub-views render after the model is published, so every figure in them comes from this
    // model (js/capacity.js), never the one before it (SPEC 1.4).
    SP().renderPumpStationsTab({ total, jobs, pdwf, ii });
    SP().renderPlantsTab(secs, peel, tor, { Y, c, total, jobs, adwf, pdwf, ii, calib, inflowsTo, censusHow });
    renderHeadlines(); MP().renderMpCompare();
    renderScenario(); MA().renderCapLayer(); MA().renderLegend(); TS().filterInView();
    if (AT().getFootTab() === 'dca') DCAT().renderDca();
    if (AT().getFootTab() === 'overview') OV().renderOverview();
    if (AT().getFootTab() === 'ww' && AT().getWwSub() === 'alloc') DUI().renderAlloc();
    $('#ww-note').textContent = `${Y} Census baseline (follows the timeline) · flows build up from the top of each sewershed down to G.E. Booth (Lakeview), Clarkson and Inglewood`;
    if (p) SP().renderSvcScoped(p);
  }
  // Sub-tab choices stashed while a site is the scope (restored when it isn't).
  // Switches in the Water / Wastewater / Plants tabs.
  for (const id of ['#water-body', '#wcap-body', '#ww-body', '#plants-body', '#scen-bar']) $(id).addEventListener('click', e => {
    if (e.target.closest('[data-open-scen]')) { const d = $('#scen-bar details'); if (d) { d.open = true; d.scrollIntoView({ block: 'nearest' }); } return; }
    if (e.target.closest('[data-goto-tab]')) { const gt = e.target.closest('[data-goto-tab]').dataset.gotoTab; if (gt === 'criteria') { TB().openScenPop(); return; } return AT().showFootTab(gt); }
    if (e.target.closest('[data-scen-pin]')) { store.set('scenA', scenarioMetrics()); return renderScenario(); }
    if (e.target.closest('[data-scen-clear]')) { store.set('scenA', null); return renderScenario(); }
    if (e.target.closest('[data-inview]')) { store.set('svcInView', e.target.closest('[data-inview]').checked); document.querySelectorAll('[data-inview]').forEach(c => { c.checked = store.get('svcInView', false); }); return TS().filterInView(); }
    const b = e.target.closest('[data-svcopt]'); if (!b) return;
    if (b.dataset.svcopt === 'basis') {
      if (!['all', 'buildout', 'committed', 'remaining'].includes(b.dataset.v)) return;
      App().state.basis = b.dataset.v; store.set('svcBasis', App().state.basis);
      renderSvcTab(); App().applyFilters(); Sh().viewLink.write();
      return;
    }
    svcOpt[b.dataset.svcopt] = b.dataset.v;
    store.set({ ww: 'svcWwMode', md: 'svcMdMode', div: 'svcDivert', tech: 'svcTech', nr: 'svcNear' }[b.dataset.svcopt], b.dataset.v);
    if (b.dataset.svcopt === 'nr') { App().applyFilters(); if (typeof DS() !== 'undefined' && DS().current()) DS().refresh(); }
    renderSvcTab(); Sh().viewLink.write();
    if (b.dataset.svcopt === 'nr') RL().renderMarkers();
  });
  // "Results for year" in the Scenario control sets the year the map's capacity results are
  // worked out for (replaces the old on-map demand-year slider).
  $('#scen-bar').addEventListener('change', e => {
    if (e.target.id === 'scen-year') setCapYear(e.target.value === 'bo' ? null : +e.target.value);
  });

  const api = {
    renderSvcTab, renderScenario, scenarioText, scenarioMetrics, setCapYear,
    renderScenarioCriteria, criteriaChanges, CRIT_LABEL, CRIT_KEY_LABEL, svcOpt,
    svcFlowTree, upstreamOf, svcJobs, svcBar, svcLegend, optSwitch, refLink,
    pctRated, trigText, setHeadline, syncScenCrit, JOB_KEY, wwFlowLabel, wMaxDayLabel,
    byZone: (...a) => SD().byZone(...a),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSvcTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
