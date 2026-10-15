/* js/overview-tab.js — Overview bottom-panel tab (Phase 6 extraction).
 * Headline tiles, capacity bars, needs-attention card, top developments.
 * Extracted verbatim from js/app.js (lines 1839-2013); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmt1, roundPop, skel, dot, hlP, store } = root.PeelUtil;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const App = () => root.PeelApp;
  const AT = () => root.PeelAnalysisTabs;
  const MM = () => root.PeelMapMarkers;
  const MP = () => root.PeelMasterPlan;
  const DD = () => root.PeelDevDetail;
  const DV = () => root.PeelDevVerdict;
  const DU = () => root.PeelDemandUI;
  const LB = () => root.PeelLayerBar;
  const SV = () => root.PeelSvcData;
  const SC = () => root.PeelSewerCap;
  const DI = () => root.PeelDcInfra;
  const DC = () => root.PeelDcCost;
  const SP = () => root.PeelSvcPlants;
  const PA = () => root.PeelPlanAreas;
  const FI = () => root.PeelFilterUI;
  const AS = () => root.PeelAreaSelect;
  const DN = () => root.PeelDevNav;
  const TB = () => root.PeelTopbar;
  const RP = () => root.PeelReports;
  const SvcTab = () => root.PeelSvcTab;

/* ---- app.js lines 1839-2013 ---- */
  // ---- Overview (bottom panel, first tab): the headline numbers on one screen ----------------
  // One view: one-sentence headline → up to 4 tiles → the Needs-attention card → one chart
  // (plant + water treatment capacity bars) → one top-5 developments table with "See all" →
  // one ⓘ line (method, criteria, data dates). Housing, the population outlook and the
  // demand-by-phase breakdown live on the Growth tab (Worker C); the DC program card is now
  // one line inside Needs attention. Scoped Overview: a verdict card for the site instead of
  // the Peel-wide aggregates.
  function renderVerdictCard(p) {
    const el = $('#ov-body'); if (!el) return;
    const st = DD().statusOf(p), f = SV().svcFacts(p);
    st.works = st.works || DI().devWorks(p, f);
    const pe = f ? f.e : D.estimate([p], App().state.criteria, 'all', App().jobsOf), cb = pe.combined;
    const tile = (v, u, l, sub = "") => `<div class="ov-tile"><b>${v}</b><span class="ov-u">${u}</span><span class="ov-l">${l}</span>${sub ? `<small>${sub}</small>` : ""}</div>`;
    const toneCls = { ok: 'why-ok-t', warn: 'why-stall-t', bad: 'why-stop-t' };
    const vtxt = v => esc(v.text);
    // Verdict inputs from the same per-tab brief logic the detail panel uses.
    const pp = MM().SEW.data && p.lat != null ? SC().pathPipes(p) : null, worst = pp && pp.worst;
    const sps = f && f.sps.length ? f.sps.slice().sort((a, b) => b.wet / b.firm - a.wet / a.firm)[0] : null;
    const noModel = !f;
    const wv = noModel ? { tone: 'warn', text: 'The servicing model is still loading' } : DV().verdictWater({
      zone: f.z ? f.z.name.replace('Pressure zone ', 'Zone ') : null,
      sharePct: f.zMax ? Math.round(D.toMLd(cb.water.maxDay) / f.zMax * 100) : 0,
      outside: !!f.zNear,
    });
    const wwv = noModel ? { tone: 'warn', text: 'The servicing model is still loading' } : DV().verdictWastewater({
      noPath: !f.path.length,
      toronto: f.pl === 'Toronto',
      pipesOff: !root.PeelUtil.PIPE_RESULTS,
      pipeMm: worst ? worst.p[0] : null,
      pipePct: worst ? Math.round(worst.r1 * 100) : 0,
      psName: sps ? DD().psName(sps.a) : null,
      psPct: sps ? Math.round(sps.wet / sps.firm * 100) : 0,
      plant: f.cap ? f.cap.name : null,
      reserve: f.cap ? fmt1(f.reserve) : null,
      usePct: f.cap && f.reserve > 0 ? Math.round(f.use / f.reserve * 100) : 0, useNote: f.useNote || '',
      over: !!(f.cap && f.reserve <= 0),
      commitPct: f.cap ? Math.round(f.cap.committed / f.cap.rated * 100) : 0,
    });
    const w = st.works;
    const dcv = DV().verdictDc({
      loading: !App().state.dcInfra,
      gap: !!(w && w.gap),
      needBy: w && w.needBy ? w.needBy : 0,
      nearby: w ? w.trunks.length + w.facs.length : 0,
    });
    const idx = P.PHASES.findIndex(s => s.key === p.phase);
    const nextPh = p.phase === 'cancelled' ? null : P.PHASES[idx + 1] || null;
    const mv = DV().verdictMilestone({
      withdrawn: p.phase === 'cancelled',
      done: p.phase === 'completed',
      appeal: st.sig.some(x => x.kind === 'appeal'),
      stalled: st.stalled ? `${st.years.toFixed(1)} yrs` : null,
      next: nextPh ? nextPh.label : '—',
    });
    // Homes and jobs (an employment site has no units: its flows come from its floor area), then
    // the flows: water, wastewater average dry weather, peak dry weather and peak wet weather.
    const em = App().empOf ? App().empOf(p) : null, jobs = pe.employment.jobs || 0;
    const useTxt = em && em.uses.length ? em.uses.map(u => u.label.toLowerCase()).slice(0, 2).join(', ') : 'employment';
    const tiles = [
      pe.totalUnits > 0 || !jobs ? tile(fmtNum(Math.round(pe.totalUnits)), 'units', p.unitsLost ? `net of ${fmtNum(p.unitsLost)} demolished` : 'planned') : '',
      pe.population > 0 ? tile(fmtNum(roundPop(pe.population)), 'people', 'at build-out') : '',
      jobs > 0 ? tile(fmtNum(roundPop(jobs)), 'jobs', 'on the site') : '',
      em && em.totalM2 > 0 ? tile(fmtNum(Math.round(em.totalM2)), 'm²', `${esc(useTxt)} floor area`) : '',
      tile(fmt1(cb.water.maxDay), 'L/s', 'water max day'),
      tile(fmt1(cb.wastewater.avg), 'L/s', 'average dry weather'),
      tile(fmt1(cb.wastewater.peak), 'L/s', 'peak dry weather'),
      tile(fmt1(cb.wastewater.wetPeak), 'L/s', 'peak wet weather', cb.wastewater.infiltration > 0 ? esc(D.iiText(cb.wastewater.infiltration, App().state.criteria)) : ''),
    ].join('');
    const go = (tab, t) => `<button type="button" class="btn small link ov-go" data-ov-tab="${tab}">${t} →</button>`;
    const devBtn = `<button type="button" class="btn small link ov-go" data-ov-devsec="files">Files &amp; history ↓</button>`;
    const vline = (v, label, btn) => `<li><strong>${label}</strong> <span class="${toneCls[v.tone]}">${vtxt(v)}</span> ${btn}</li>`;
    el.innerHTML = `<div class="ov-top">${hlP(`<strong>${esc(p.title)}</strong> · ${esc(p.municipality)} · ${dot(p.phase)} ${esc(P.PHASE_BY_KEY[p.phase].label)}`)}</div>
      <div class="ov-grid">
        <section class="ov-card ov-growth"><div class="ov-h"><h3>At a glance</h3>${devBtn}</div>
          <p class="small">${DV().firstSentence(st.why)}</p>
          <div class="ov-tiles">${tiles}</div>
          ${window.PeelTreeCounts ? window.PeelTreeCounts.noteHTML(p, 3) : ''}
          <p class="small muted">Flows at Peel design criteria, as in a functional servicing report${pe.employment.jobs > 0 ? `; jobs from the floor area the applications state (${fmtNum(App().state.criteria.employment.water)} L/job/d water)` : ''}. Below: the proposal, its files and history, and the site.</p>
        </section>
        <section class="ov-card ov-cap-c"><div class="ov-h"><h3>Screening summary</h3></div>
          <ul class="b-lines small">
            ${vline(wv, '💧 Water', go('water', 'Water'))}
            ${vline(wwv, '🚰 Wastewater', go('ww', 'Wastewater'))}
            ${vline(dcv, '🏗 DC works', go('dca', 'DC Analysis'))}
            ${vline(mv, '🚩 Next milestone', devBtn)}
          </ul></section>
      </div>`;
    const sec = $('#ov-dev'); if (sec) sec.hidden = false;
    if (document.documentElement.hasAttribute('data-presentation')) AS().renderPresentation();
  }
  // The capacity constraints behind the Overview bars (wastewater plants + the South Peel
  // water treatment system), shared by the chart and the Needs-attention card. Bar
  // computations are unchanged from the pre-restructure Overview.
  function capacityList() {
    if (!App().state.svcModel || !App().state.servicing) return null;
    const list = ['Lakeview', 'Clarkson', 'Inglewood'].map(pl => MP().cached(`plant:${pl}`, () => MP().plantCons(pl))).filter(Boolean);
    const w = App().state.reports ? MP().cached('wsys:lake', () => MP().waterPlantCons({ zone: '1' })) : null; if (w) list.push(w);
    return list;
  }
  function capacityBarsHTML(list) {
    // The % come from the one capacity function (js/capacity.js), as every other tab (SPEC 1.4).
    const capOf = c => window.PeelCapacity && window.PeelCapacity.of(c.kind === 'plant' ? `plant:${c.pl}` : 'wsys:southPeel');
    const bar = c => { const k = capOf(c), pc = k ? Math.round(k.pctCommitted) : SvcTab().pctRated(c, 'com'), pb = k ? Math.round(k.pctBuildout) : SvcTab().pctRated(c, 'bo'), a = Math.min(130, pc), b = Math.min(130, pb), st = c.util.bo >= 1 ? 'over' : c.util.bo >= 0.85 ? 'near' : 'ok';
      return `<div class="ov-cap ${st}"><div class="ov-cap-h"><span>${c.sys === 'water' ? '💧 ' : ''}<button type="button" class="btn small link" data-ss="${c.kind === 'plant' ? `plant:${esc(c.pl)}` : 'wsys:lake'}" title="Open this as a scope">${esc(c.kind === 'plant' ? SV().PLANT_SHORT[c.pl] || c.name : 'South Peel water treatment')}</button></span><span><b>${pc}%</b> committed → <b>${pb}%</b> build-out</span></div>
        ${k ? LB().capacityBarHTML(k) : `<div class="ov-bar" role="img" aria-label="existing + built + committed ${pc}% of rated capacity, ${pb}% at build-out"><i class="c" style="width:${(a / 1.3).toFixed(1)}%"></i><i class="b" style="width:${(Math.max(0, b - a) / 1.3).toFixed(1)}%"></i></div>`}
        <small>${c.out === 'today' ? 'At the expansion trigger now' : c.out ? `Reaches the trigger ≈${c.out}` : `Room to ${SP().hz.end}`}${c.relief.length ? ` · next expansion ${esc(c.relief[0].text)}` : ''}${(x => x && x.ahead.length ? ` · <strong>room after allocations ${fmt1(x.after)} ML/d</strong>` : '')(c.kind === 'plant' ? DU().allocPlant(c.pl) : null)}</small></div>`; };
    return list.map(bar).join('') + LB().legendHTML([{ layer: 'existing', text: 'Existing (2025 metered)' }, { layer: 'committed' }, { layer: 'proposed' }, 'trigger', 'rated', 'over']) + `<p class="small muted">% of rated capacity, as in Wastewater → Plants (plants: ${SvcTab().wwFlowLabel('long')}; water: max day). Plants: the 2025 metered flow already holds what was built since the census.</p>`;
  }
  // Plain-data input for the pure needsAttention: reuses the DCA results, the stalled flags,
  // the 90% trigger years and the weekly snapshot change log.
  function needsAttentionData(set, capList) {
    const R = MP().DCA.res && MP().DCA.key === MP().scenarioKey() ? MP().DCA.res : null;
    const adv = R ? R.list.filter(r => r.rec === 'advance').map(r => ({ name: r.name })) : [];
    const trig = (capList || []).filter(c => c.out).map(c => ({
      sys: c.sys, now: c.out === 'today',
      text: `${c.kind === 'plant' ? SV().PLANT_SHORT[c.pl] || c.name : 'South Peel water treatment'} ${SvcTab().trigText(c)} (existing + built + committed ${SvcTab().pctRated(c, 'com')}% → ${SvcTab().pctRated(c, 'bo')}% at build-out)`,
    }));
    const stalled = [];
    for (const p of set) {
      const st = DD().statusOf(p);
      if (!st.stalled) continue;
      const u = FI().appUnits(p);
      stalled.push({ key: p.key, title: p.title, muni: p.municipality, units: u, unitsTxt: fmtNum(Math.round(u)), years: `${st.years.toFixed(1)} yrs` });
    }
    const ch = App().state.snapshot && App().state.snapshot.changes;
    const changes = (!ch || ch.baseline) ? [] : [
      ...(ch.moved || []).map(m => ({ key: m.key, text: `${m.title}: ${P.PHASE_BY_KEY[m.from].label} → ${P.PHASE_BY_KEY[m.to].label}` })),
      // A newly listed file that is already completed is old news, not a Peel-level concern: This week has it.
      ...(ch.added || []).filter(a => a.phase !== 'completed').map(a => ({ key: a.key, text: `New: ${a.title} (${P.PHASE_BY_KEY[a.phase].label}, ${a.municipality})` })),
    ];
    return { adv, trig, stalled, changes };
  }
  // Top-5 developments by planned units, with a "See all" to the Developments tab.
  function topDevsHTML(set, basis) {
    const top = set.slice().sort((a, b) => FI().appUnits(b) - FI().appUnits(a)).slice(0, 5);
    const rows = top.map(p => {
      const pe = D.estimate([p], App().state.criteria, basis, App().jobsOf);
      return `<tr><td><button type="button" class="btn small link" data-ov-dev="${esc(p.key)}">${esc(p.title)}</button><small class="muted">${esc(p.municipality)}</small></td><td>${dot(p.phase)} ${esc(P.PHASE_BY_KEY[p.phase].label)}</td><td class="n">${fmtNum(Math.round(pe.totalUnits))}</td><td class="n">${fmtNum(roundPop(pe.population))}</td></tr>`;
    }).join('');
    return `<section class="ov-card ov-topdevs"><div class="ov-h"><h3>Largest developments</h3><button type="button" class="btn small link ov-go" data-ov-tab="developments">See all →</button></div>
      <table class="dt ov-t"><thead><tr><th>Development</th><th>Phase</th><th class="n">Units</th><th class="n">People</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }
  // A result scope (a DC work, a pipe, a file, a tool's result: SPEC §3) shows in its own host next to
  // the Overview body; it is rebuilt only when the result changes, so its inputs keep their state.
  function resultHost(rs) {
    const el = $('#ov-body'), host = $('#scope-body'); if (!host) return false;
    if (!rs) { host.hidden = true; if (el) el.hidden = false; return false; }
    if (el) el.hidden = true; host.hidden = false;
    if (host.dataset.ref !== rs.ref || host.dataset.v !== String(rs.result.v)) {
      host.innerHTML = `<div class="scope-head"><span class="muted small">${esc(SCOPE_KIND[rs.rkind] || 'Result')}</span><button type="button" class="btn small scope-x" data-scope-result-close aria-label="Close ${esc(rs.title)}">× Close</button></div>${rs.result.html}`;
      host.dataset.ref = rs.ref; host.dataset.v = String(rs.result.v);
    }
    return true;
  }
  const SCOPE_KIND = { dcwork: 'DC work · 2026 capital map (draft)', pipe: 'Sanitary sewer', file: 'Single file', iiblock: 'Wastewater block', wfac: 'Water facility', sel: 'Selection', help: 'Help', tool: 'Tool result' };
  function renderOverview(set, e, basis) {
    const el = $('#ov-body'); if (!el) return;
    const rsc = root.PeelSvcScope && root.PeelSvcScope.current();
    if (resultHost(rsc && rsc.kind === 'result' && !DV().scopedDev() ? rsc : null)) return;
    const p = DV().scopedDev();
    if (p) { renderVerdictCard(p); return; }
    const sec = $('#ov-dev'); if (sec) sec.hidden = true;
    // A servicing scope (plant / station / block / zone / water system) has its own Overview.
    const ss = root.PeelSvcScope && root.PeelSvcScope.current();
    if (ss) { el.innerHTML = root.PeelSvcScope.cardHTML(ss, set || DU().overviewSet()); return; }
    if (!set) { set = DU().overviewSet(); basis = DU().demandBasis(); e = D.estimate(set, App().state.criteria, basis, App().jobsOf); }
    if (!basis) basis = DU().demandBasis();
    const em = e.employment;
    // Units and left to build from the one pipeline definition (as Growth and the header).
    const pipe = root.Growth ? root.Growth.pipelineTotals(set) : null;
    const left = pipe ? Math.round(pipe.left) : 0, n = pipe ? pipe.n : 0;
    const unitsAll = basis === 'all' && pipe ? pipe.planned : e.totalUnits;
    // A plan filter shows whole developments; By plan counts the part inside the plan. Both are
    // shown, reconciled: inside + outside = the units planned (SPEC 1.9).
    const inPlan = planSplit(set);
    const tile = (v, u, l, sub = '') => `<div class="ov-tile"><b>${v}</b><span class="ov-u">${u}</span><span class="ov-l">${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
    const go = (tab, t) => `<button type="button" class="btn small link ov-go" data-ov-tab="${tab}">${t} →</button>`;
    // Capacity: plants against the 90% expansion trigger (existing + approved, and at build-out).
    const capList = capacityList();
    let cap = skel('Loading the servicing model'), tight = null;
    if (capList) {
      tight = capList.filter(c => c.kind === 'plant').sort((a, b) => b.util.bo - a.util.bo)[0] || null;
      cap = capacityBarsHTML(capList);
    }
    // Needs attention: constraints that run out before relief, stalled large sites, sites
    // past the 90% trigger, and this week's changes — each item links to its tab.
    const TAB_LABEL = { dca: 'DC Analysis', ww: 'Wastewater', water: 'Water' };
    const toneCls = { ok: 'why-ok-t', warn: 'why-stall-t', bad: 'why-stop-t' };
    const na = DV().needsAttention(needsAttentionData(set, capList));
    const needs = `<section class="ov-card ov-needs"><div class="ov-h"><h3>Needs attention</h3></div>
      ${na.length ? `<ul class="na-list small">${na.map(it => `<li class="na-it"><span class="${toneCls[it.tone]}">${esc(it.text)}</span>${it.dev ? `<button type="button" class="btn small link" data-ov-dev="${esc(it.dev)}">Development →</button>` : it.tab ? go(it.tab, TAB_LABEL[it.tab] || it.tab) : ''}</li>`).join('')}</ul>` : '<p class="small muted">Nothing needs attention right now.</p>'}</section>`;
    const hl = set.length ? `The <strong>${fmtNum(set.length)}</strong> developments shown would add about <strong>${fmtNum(roundPop(e.population))} people</strong> and ${fmtNum(roundPop(em.jobs))} jobs in ${fmtNum(Math.round(unitsAll))} units.${tight ? ` <strong>${esc(SV().PLANT_SHORT[tight.pl])}</strong> ${SvcTab().trigText(tight)} (existing + built + committed ${SvcTab().pctRated(tight, 'com')}% of rated capacity → ${SvcTab().pctRated(tight, 'bo')}% at build-out).` : ''}` : 'No developments match the current filters.';
    // ⓘ line: method, criteria, data dates.
    const fr = DU().freshness(), nDue = fr.filter(r => r.st === 'due' || r.st === 'stale').length;
    const basisTxt = { all: 'every stage, pre-consultation to completed', committed: 'committed only (D-5-1)', remaining: 'units left to build' }[basis] || 'every stage';
    const info = `<p class="small muted ov-info"><button type="button" class="btn small link" data-info="definitions">Definitions</button> · ⓘ Servicing demand at Peel design criteria, as in a functional servicing report; capacity as % of rated (plants: ${SvcTab().wwFlowLabel('long')}; water: max day); black tick: the 90% expansion trigger. Scope: ${esc(basisTxt)}${App().state.muni ? ` · ${esc(App().state.muni)}` : ''}. Applications as of <strong>${esc((fr[0] && fr[0].date) || '–')}</strong> · ${nDue ? `<span class="fr-b fr-due">${nDue} source${nDue === 1 ? '' : 's'} due for a refresh</span>` : '<span class="fr-b fr-ok">all sources current</span>'} ${go('criteria', 'Data & checks')}</p>`;
    el.innerHTML = `<div class="ov-top">${hlP(hl)}<button type="button" class="btn small link ov-brief" data-ov-tool="brief" title="A one-page summary to print or save as PDF (also in Export)">Executive briefing (PDF)</button></div>
      <div class="ov-grid">
        <section class="ov-card ov-growth"><div class="ov-h"><h3>Growth</h3>${go('growth', 'Growth')}</div>
          <div class="ov-tiles">${tile(fmtNum(set.length), 'developments', 'shown on the map', esc(scopeText()))}${tile(fmtNum(Math.round(unitsAll)), 'units', 'planned', [n ? `${fmtNum(left)} left to build` : '', inPlan ? `${fmtNum(Math.round(inPlan.planned))} inside ${esc(inPlan.name)} (By plan) + ${fmtNum(Math.round(inPlan.outside))} in the parts of ${fmtNum(inPlan.straddling)} development${inPlan.straddling === 1 ? '' : 's'} outside it` : ''].filter(Boolean).join('<br>'))}${tile(fmtNum(roundPop(e.population)), 'people', 'at build-out')}${tile(fmtNum(roundPop(em.jobs)), 'jobs', 'on development sites')}</div></section>
        ${needs}
        <section class="ov-card ov-cap-c"><div class="ov-h"><h3>Capacity ${root.PeelUtil.basisChip('mixed', SvcTab().svcOpt.ww === 'calibrated' ? 'Mixed basis: existing flows 2025 measured; growth at Peel design criteria (wastewater scaled to each plant\u2019s measured rate); rated capacity from the 2025 reports; 90% trigger from the 2020 Master Plan' : 'Mixed basis: flows at Peel design criteria; rated capacity from the 2025 reports; 90% trigger from the 2020 Master Plan')}</h3>${go('ww', 'Plants')}</div>${cap}</section>
        ${topDevsHTML(set, basis)}
        <div class="ov-info-w">${info}</div>
      </div>`;
    if (App().state.dcInfra && MM().SEW.data && !(MP().DCA.res && MP().DCA.key === MP().scenarioKey()) && AT().getFootTab() === 'overview') setTimeout(() => { try { DC().dcAnalysis(); renderOverview(); } catch (err) { /* shown on the DC tab */ } }, 50);
    if (document.documentElement.hasAttribute('data-presentation')) AS().renderPresentation();
  }
  // The scope the numbers cover: "all of Peel" only when nothing narrows it (SPEC 1.9: never
  // "all of Peel · 52: Heritage Heights").
  function scopeLabel({ muni, sp, mtsa, svc }) {
    const narrower = [sp || '', mtsa || '', svc || ''].filter(Boolean);
    return [muni || (narrower.length ? '' : 'all of Peel'), ...narrower].filter(Boolean).join(' · ');
  }
  function scopeText() { return scopeLabel({ muni: App().state.muni, sp: App().state.sp.length ? PA().spSummary() : '', mtsa: App().state.mtsa.length ? 'MTSA filter' : '', svc: root.PeelSvcScope ? root.PeelSvcScope.label() : '' }); }
  // Units of the developments shown inside the filtered plans, and in their parts outside, when a
  // plan filter is on and some development straddles the boundary (else null: nothing to reconcile).
  function planSplit(set) {
    const PT = root.PeelPlanTables, RU = root.PeelPlanRollup, ids = App().state.sp;
    if (!ids.length || !PT || !RU || !set.length || App().state.daCtx) return null;
    let r; try { r = PT.compute(); } catch (err) { return null; }
    const w = RU.within(r, ids);
    if (!w.found || Math.abs(w.outside) < 0.5) return null;
    return { ...w, name: ids.length === 1 ? PA().spSummary() : 'the plans' };
  }
  { const host = $('#scope-body'); if (host) host.addEventListener('click', e => { if (e.target.closest('[data-scope-result-close]')) root.PeelSvcScope.closeResult(); }); }
  $('#ov-body').addEventListener('click', e => {
    const t = e.target.closest('[data-ov-tab]');
    if (t) {
      // Phase 4: the criteria tab is gone — "Data & checks" opens the gear menu's Sources & checks page.
      if (t.dataset.ovTab === 'criteria') { TB().openGearPage('sources'); return; }
      AT().setFootPref(t.dataset.ovTab); store.set('footTab4', t.dataset.ovTab); AT().showFootTab(t.dataset.ovTab); return;
    }
    const ds = e.target.closest('[data-ov-devsec]');
    if (ds) { if (window.DevTab && typeof window.DevTab.setSub === 'function') window.DevTab.setSub(ds.dataset.ovDevsec); const sec = $('#ov-dev'); if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const dv = e.target.closest('[data-ov-dev]'); if (dv) { const q = DN().projectByKey(dv.dataset.ovDev); if (q) DN().showDetail(q); return; }
    const k = e.target.closest('[data-ov-tool]');
    if (k && k.dataset.ovTool === 'brief') RP().briefingPDF();
  });

  // ---- Public contract ----
  const api = { renderOverview, renderVerdictCard, scopeText, scopeLabel, capacityBarsHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelOverviewTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
