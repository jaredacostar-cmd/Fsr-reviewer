/* js/overview-tab.js — Overview bottom-panel tab (Phase 6 extraction).
 * Headline tiles, capacity bars, needs-attention card, top developments.
 * Extracted verbatim from js/app.js (lines 1839-2013); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmt1, roundPop, skel, dot, hlP, store, isSmallSystem } = root.PeelUtil;
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
  // A site's type (SPEC §5): residential, mixed-use or employment.
  function siteKind(p, pe, em) {
    const units = pe.totalUnits > 0, emp = !!(em && (em.totalM2 > 0 || em.jobs > 0));
    return units && emp ? 'mixed' : emp ? 'employment' : 'residential';
  }
  // "n things to confirm", computed per site (SPEC §5): what a planner should check before relying
  // on the screen. Each line names the thing and where it comes from.
  function thingsToConfirm(p, { st, f, cb, kind }) {
    const out = [], L = root.PeelLayers && root.PeelLayers.ofDev(p), LB = root.PeelLayerBar;
    if (L && L.layer) out.push(`Counts as <strong>${LB ? LB.nameHTML(L.layer) : esc(L.layer)}</strong>${L.layer === 'proposed' || L.layer === 'anticipated' ? ': not in the D-5-1 committed check until a draft or site plan approval' : L.layer === 'committed' && L.toPermit > 0 ? `: ${fmtNum(L.toPermit)} units left to permit` : ''}.`);
    if (f && (f.zNear || f.dNear)) out.push(`Outside the mapped ${f.zNear && f.dNear ? 'pressure zones and sewersheds' : f.zNear ? 'pressure zones' : 'sewersheds'}: ${f.zNear && f.z ? `${esc(f.z.name.replace('Pressure zone ', 'Zone '))} assigned` : ''}${f.zNear && f.dNear ? '; ' : ''}${f.dNear ? 'nearest catchment assigned' : ''} (nearest by distance) — confirm the connection.`);
    if (st.works && st.works.gap) out.push(`Waits on a planned DC main (≈${st.works.needBy}); new growth procurements are paused — confirm the timing.`);
    if (!root.PeelUtil.PIPE_RESULTS) out.push('Pipe-by-pipe capacity is not assessed here: the Region\'s hydraulic model is the authority.');
    if (st.sig && st.sig.some(x => x.kind === 'appeal')) out.push('Under appeal at the Ontario Land Tribunal.');
    if (cb && cb.wastewater.infiltration > 0 && !(p.siteAreaHa > 0)) out.push('I&amp;I on an estimated site area (no file boundary).');
    const est = root.PeelTreeCounts ? root.PeelTreeCounts.estimatedUnits(p) : 0;
    if (est > 0) out.push(`${fmtNum(est)} of its units are estimated (found online, a pre-consultation or the wording), not stated on a file.`);
    if (kind === 'employment') out.push('Employment site: jobs and flows come from the floor area the applications state.');
    return out;
  }
  // ---- Stage 3: a development's Overview as the standard panel (the site board) ----------------------
  function sitePanelSpec(p, o) {
    const PN = root.PeelPanel, { st, f, cb, pe, kind, em, jobs, useTxt, wv, wwv, dcv, confirm, worst } = o;
    const TONE = { ok: 'room', warn: 'tight', bad: 'over' }, phl = P.PHASE_BY_KEY[p.phase].label;
    const ls = root.PeelMapLabels && root.PeelMapLabels.latestSub ? root.PeelMapLabels.latestSub(p) : null;
    const fig = (v, u, label, ctx) => ({ v, u, label, ctx });
    const fmtDay = d => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
    const who = kind === 'employment' ? [fig(fmtNum(roundPop(jobs)), 'jobs', 'on the site', ''), fig(em && em.totalM2 > 0 ? fmtNum(Math.round(em.totalM2)) : '–', 'm²', 'floor area', esc(useTxt))]
      : [fig(fmtNum(Math.round(pe.totalUnits)), 'units', 'planned', p.unitsLost ? `net of ${fmtNum(p.unitsLost)} demolished` : kind === 'mixed' && jobs > 0 ? `and ≈${fmtNum(roundPop(jobs))} jobs` : ''), fig(fmtNum(roundPop(pe.population)), 'people', 'at build-out', pe.totalUnits > 0 ? `${(pe.population / pe.totalUnits).toFixed(2)} people per unit` : '')];
    const plant = f && f.pl ? (SV().PLANT_SHORT[f.pl] || f.pl) : null;
    // The servicing rows (the board's card): each opens the sub-view that holds it.
    const svcRow = (label, v, at) => ({ tone: TONE[v.tone], attrs: { 'data-at': at }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${label}</span>${PN.chip({ tone: TONE[v.tone], text: v.tone === 'ok' ? 'OK' : v.tone === 'warn' ? 'Check' : 'Short' })}</div><small class="pnl-r-line">${esc(v.text)}</small>` });
    const pipeOn = root.PeelUtil.PIPE_RESULTS && worst;
    // The constraints this site relies on (as Capital › Timing): one that runs out before its relief is
    // a shortfall on the Water or Wastewater row and in the answer (the site board: zone 6 storage).
    const needs = (MP().devNeeds && MP().devNeeds(p)) || [], gaps = needs.filter(c => c.status === 'gap');
    const gapTxt = c => `${esc(c.name)} runs out ${c.out === 'today' ? 'now' : `≈${c.out}`}${c.relief && c.relief[0] && c.relief[0].y ? `, before its relief (${c.relief[0].y})` : ', with no relief listed'}`;
    const withGap = (v, sys) => { const g = gaps.filter(c => c.sys === sys); return g.length ? { tone: 'bad', text: g.map(gapTxt).join('; ') } : v; };
    const w = st.works || {}, eaN = root.PeelCapitalEA && root.PeelCapitalEA.siteEaCount ? root.PeelCapitalEA.siteEaCount() : null;
    const nWorks = (w.trunks ? w.trunks.length : 0) + (w.facs ? w.facs.length : 0);
    const rows = [
      svcRow(`💧 Water${f && f.z ? ` · ${esc(f.z.name.replace('Pressure zone ', 'zone '))}` : ''}`, withGap(wv, 'water'), 'svc:network'),
      svcRow(`🚰 Wastewater${plant ? ` · to ${esc(plant)}` : ''}`, withGap(wwv, 'ww'), 'svc:network'),
      { tone: pipeOn ? PN.toneOf(Math.round(worst.r1 * 100)) : null, attrs: { 'data-at': 'svc:network' }, html: `<div class="pnl-r-top"><span class="pnl-r-name">Tightest pipe on the path</span></div><small class="pnl-r-line">${pipeOn ? `${fmtNum(worst.p[0])} mm · ${Math.round(worst.r1 * 100)}% of full-pipe capacity at build-out` : 'Not assessed here: pipe-by-pipe capacity is left to the Region\u2019s hydraulic model.'}</small>` },
      { tone: TONE[dcv.tone], attrs: { 'data-at': 'dca:timing' }, html: `<div class="pnl-r-top"><span class="pnl-r-name">🏗 Infrastructure coming</span>${PN.chip({ tone: TONE[dcv.tone], text: dcv.tone === 'ok' ? 'OK' : dcv.tone === 'warn' ? 'Check' : 'Short' })}</div><small class="pnl-r-line">${fmtNum(nWorks)} DC work${nWorks === 1 ? '' : 's'} nearby${eaN != null ? ` · ${fmtNum(eaN)} EA${eaN === 1 ? '' : 's'}` : ''} · ${esc(dcv.text)}</small>` },
    ];
    // Timing: the latest submission, the municipality's typical time to approval (dated file events)
    // and, before approval, that time added to the submission (an estimate).
    const G = root.Growth, lags = G ? G.approvalLags(App().state.projects.filter(q => q.municipality === p.municipality)) : [];
    const med = lags.length && G.median ? G.median(lags.map(x => x.months)) : null;
    const approved = P.PHASE_BY_KEY[p.phase].rank >= P.PHASE_BY_KEY.approved.rank;
    const est = ls && ls.date && med != null && !approved && p.phase !== 'cancelled' ? new Date(+new Date(ls.date) + med * 30.44 * 864e5).getFullYear() : null;
    const timing = [
      PN.kv('Latest submission', ls ? `${esc(fmtDay(ls.date))}${ls.ref ? ` · ${esc(ls.ref)}` : ''}` : '–'),
      ...(med != null ? [PN.kv(`Typical time to approval, ${esc(p.municipality)}`, `${Math.round(med)} months · n=${fmtNum(lags.length)}`)] : []),
      ...(est ? [PN.kv('Expected approval (estimate)', `≈${est}`)] : []),
    ];
    const DT = root.DevTab, files = (p.records || []).filter(r => r.kind === 'application');
    const fileRow = r => `<li class="pnl-kv"><span>${esc(r.ref || 'file')}</span><span>${r.units ? `${fmtNum(r.units)} units · ` : ''}${esc((P.PHASE_BY_KEY[r.phase] || {}).label || r.phase || '')}</span></li>`;
    const types = (p.types || []).slice(0, 3).join(' / ');
    return {
      calc: true, fullTitle: `${p.title} · Overview: every figure, the flows and the things to confirm`,
      head: PN.siteHead(p),
      answer: (() => {
        const need = [['water', withGap(wv, 'water')], ['wastewater', withGap(wwv, 'ww')], ['DC works', dcv]].filter(([, v]) => v.tone !== 'ok').map(([n]) => n);
        const c = confirm.length ? `; ${confirm.length} thing${confirm.length === 1 ? '' : 's'} to confirm` : '';
        if (gaps.length) return `${gaps.map(g => `<strong>${gapTxt(g)}</strong>`).join('; ')}${c}.`;
        return need.length ? `Check ${need.join(' and ')}: the screen finds a shortfall or an open question there${c}.` : `The screen finds no servicing shortfall for this site${c}.`;
      })(),
      figures: [...who, fig(fmt1(cb.water.maxDay), 'L/s', 'water max day', 'Peel design criteria'), fig(fmt1(cb.wastewater.wetPeak), 'L/s', 'wastewater peak wet', cb.wastewater.infiltration > 0 ? esc(D.iiText(cb.wastewater.infiltration, App().state.criteria)) : 'peak dry + I&amp;I')],
      chart: (() => { const k = f && f.pl && root.PeelCapacity ? root.PeelCapacity.of(`plant:${f.pl}`) : null; return k && LB() ? `<p class="small pnl-chart-t">${esc(plant)}, the plant it drains to: existing, built, committed and proposed against rated capacity</p>${LB().capacityBarHTML(k, { small: true })}` : ''; })(),
      lists: [
        { title: 'Servicing', rows, total: rows.length },
        { title: 'Timing', rows: timing, total: timing.length },
        { title: `${confirm.length} thing${confirm.length === 1 ? '' : 's'} to confirm`, rows: confirm.map(c => ({ html: `<small class="pnl-r-line">${c}</small>` })), total: confirm.length, seeAll: { 'data-full-table': 'overview' } },
      ],
      folds: [
        { title: 'Site: constraints, storm sewers and ponds', html: DT && DT.partHTML ? DT.partHTML(p, 'site') : '' },
        { title: 'About this proposal', html: DT && DT.partHTML ? DT.partHTML(p, 'about') : '' },
        { title: `Files (${files.length})`, html: `<ul class="pnl-files">${files.slice(0, 6).map(fileRow).join('')}</ul><button type="button" class="btn small link" data-at="records:files">All files and history (Records) →</button>` },
      ],
      method: `Flows at Peel design criteria, as in a functional servicing report${pe.employment.jobs > 0 ? `; jobs from the floor area the applications state (${fmtNum(App().state.criteria.employment.water)} L/job/d water)` : ''}. The servicing rows read the same results as Servicing and Capital for this site. Typical time to approval: the median from first submission to approval of the ${esc(p.municipality)} files with both dates; the expected year adds it to the latest submission (an estimate, not a forecast for this file).`,
      sources: `The ${esc(p.municipality)} applications and building permits on the map (Records › Files for this site); Peel design criteria; the servicing model; the mapped constraint layers and storm sewers (each check names its source).`,
      foot: { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' }, title: 'One-page servicing memo to print or save as PDF' }, secondary: [{ label: 'Check FSR', attrs: { 'data-pnl-fsr': '' }, title: 'Cross-check the consultant\u2019s FSR figures' }] },
      onMount: () => { if (DT && DT.fillParts) DT.fillParts(p, ['about', 'site']); },
    };
  }
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
    // The tiles follow the site (SPEC §5, site templates by type).
    const kind = siteKind(p, pe, em);
    const unitsT = tile(fmtNum(Math.round(pe.totalUnits)), 'units', p.unitsLost ? `net of ${fmtNum(p.unitsLost)} demolished` : 'planned');
    const pplT = pe.population > 0 ? tile(fmtNum(roundPop(pe.population)), 'people', 'at build-out') : '';
    const jobsT = jobs > 0 ? tile(fmtNum(roundPop(jobs)), 'jobs', 'on the site') : '';
    const gfaT = em && em.totalM2 > 0 ? tile(fmtNum(Math.round(em.totalM2)), 'm²', `${esc(useTxt)} floor area`) : '';
    const tiles = [
      ...(kind === 'employment' ? [jobsT, gfaT, p.siteAreaHa > 0 ? tile(fmt1(p.siteAreaHa), 'ha', 'site area') : '']
        : kind === 'mixed' ? [unitsT, pplT, jobsT, gfaT]
          : [unitsT, pplT, pe.totalUnits > 0 && pe.population > 0 ? tile((pe.population / pe.totalUnits).toFixed(2), 'ppu', 'people per unit') : '']),
      tile(fmt1(cb.water.maxDay), 'L/s', 'water max day'),
      tile(fmt1(cb.wastewater.avg), 'L/s', 'average dry weather'),
      tile(fmt1(cb.wastewater.peak), 'L/s', 'peak dry weather'),
      tile(fmt1(cb.wastewater.wetPeak), 'L/s', 'peak wet weather', cb.wastewater.infiltration > 0 ? esc(D.iiText(cb.wastewater.infiltration, App().state.criteria)) : ''),
    ].join('');
    const go = (tab, t) => `<button type="button" class="btn small link ov-go" data-ov-tab="${tab}">${t} →</button>`;
    const devBtn = `<button type="button" class="btn small link ov-go" data-ov-tab="records">Files &amp; history (Records) →</button>`;
    const confirm = thingsToConfirm(p, { st, f, cb, kind });
    const vline = (v, label, btn) => `<li><strong>${label}</strong> <span class="${toneCls[v.tone]}">${vtxt(v)}</span> ${btn}</li>`;
    // Stage 3: the standard panel (js/panel.js), as the site board: the latest file names the
    // development; the servicing rows, Timing and Site (constraints, storm sewers and ponds); About
    // and Files fold. The card below (every tile, the flows, the things to confirm) is its full table.
    if (root.PeelPanel) root.PeelPanel.set('overview:', sitePanelSpec(p, { st, f, cb, pe, kind, em, jobs, useTxt, wv, wwv, dcv, mv, confirm, worst }));
    el.innerHTML = `<div class="ov-top">${hlP(`<strong>${esc(p.title)}</strong> · ${esc(p.municipality)} · ${dot(p.phase)} ${esc(P.PHASE_BY_KEY[p.phase].label)}`)}</div>
      ${confirm.length ? `<section class="ov-card ov-confirm"><div class="ov-h"><h3>${confirm.length} thing${confirm.length === 1 ? '' : 's'} to confirm</h3></div><ul class="b-lines small">${confirm.map(c => `<li>${c}</li>`).join('')}</ul></section>` : ''}
      <div class="ov-grid">
        <section class="ov-card ov-growth"><div class="ov-h"><h3>At a glance</h3>${devBtn}</div>
          <p class="small">${DV().firstSentence(st.why)}</p>
          <div class="ov-tiles">${tiles}</div>
          ${window.PeelTreeCounts ? window.PeelTreeCounts.noteHTML(p, 3) : ''}
          <p class="small muted">Flows at Peel design criteria, as in a functional servicing report${pe.employment.jobs > 0 ? `; jobs from the floor area the applications state (${fmtNum(App().state.criteria.employment.water)} L/job/d water)` : ''}. Below: the proposal, its files and history, and the site.</p>
        </section>
        <section class="ov-card ov-cap-c"><div class="ov-h"><h3>Screening summary</h3></div>
          <ul class="b-lines small">
            ${vline(wv, '💧 Water', go('svc:network', 'Servicing'))}
            ${vline(wwv, '🚰 Wastewater', go('svc:network', 'Servicing'))}
            ${vline(dcv, '🏗 DC works', go('dca', 'Capital'))}
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
      // One basis per row (Stage 1 #4): plants by the wastewater mode; water treatment is the 2025
      // metered maximum day plus growth (metered, calibrated).
      const bz = c.kind === 'plant' ? SvcTab().wwBasis() : 'metered';
      return `<div class="ov-cap ${st}" data-basis="${bz}"><div class="ov-cap-h"><span>${c.sys === 'water' ? '💧 ' : ''}<button type="button" class="btn small link" data-ss="${c.kind === 'plant' ? `plant:${esc(c.pl)}` : 'wsys:lake'}" title="Open this as a scope">${esc(c.kind === 'plant' ? SV().PLANT_SHORT[c.pl] || c.name : 'South Peel water treatment')}</button></span><span><b>${pc}%</b> with approved → <b>${pb}%</b> at build-out</span></div>
        ${k ? LB().capacityBarHTML(k) : `<div class="ov-bar" role="img" aria-label="existing + built + committed ${pc}% of rated capacity, ${pb}% at build-out"><i class="c" style="width:${(a / 1.3).toFixed(1)}%"></i><i class="b" style="width:${(Math.max(0, b - a) / 1.3).toFixed(1)}%"></i></div>`}
        <small>${root.PeelUtil.basisChip(bz)} · ${c.out === 'today' ? 'At the expansion trigger now' : c.out ? `Reaches the trigger ≈${c.out}` : `Room to ${SP().hz.end}`}${c.relief.length ? ` · next expansion ${esc(c.relief[0].text)}` : ''}${(x => x && x.ahead.length ? ` · <strong>after allocations: ${root.PeelUtil.roomWords(x.after)}</strong>` : '')(c.kind === 'plant' ? DU().allocPlant(c.pl) : null)}</small></div>`; };
    // Small systems (Inglewood) in their own group under the large plants.
    const small = c => c.kind === 'plant' && isSmallSystem(c.rated);
    return list.filter(c => !small(c)).map(bar).join('') + (list.some(small) ? `<h4 class="ov-small-h">Small systems</h4>${list.filter(small).map(bar).join('')}` : '') + LB().legendHTML([{ layer: 'existing', text: 'On the system (basis on each row)' }, { layer: 'committed' }, { layer: 'proposed' }, 'trigger', 'rated', 'over']) + `<p class="small muted">% of rated capacity, as in Wastewater → Plants (plants: ${SvcTab().wwFlowLabel('long')}; water: max day).${SvcTab().wwBasis() === 'metered' ? ' 2025 metered (calibrated): the metered flow already holds what was built since the census.' : ''}</p>`;
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
    // Capital projects and EAs (Peel / area scope): review periods closing, DC-matched dates moved later.
    const ce = window.PeelCapitalEA ? window.PeelCapitalEA.attention() : [];
    return { adv, trig, stalled, changes, ce };
  }
  // Top-5 developments by planned units, with a "See all" to the Developments tab.
  function topDevsHTML(set, basis) {
    // The largest unbuilt (SPEC §5: one list): units left to build (planned − completed), as Growth.
    const left = p => (P.unbuiltOf ? P.unbuiltOf(p) : FI().appUnits(p));
    const top = set.filter(p => left(p) > 0).sort((a, b) => left(b) - left(a)).slice(0, 5);
    const rows = top.map(p => {
      const pe = D.estimate([p], App().state.criteria, basis, App().jobsOf);
      return `<tr><td><button type="button" class="btn small link" data-ov-dev="${esc(p.key)}">${esc(p.title)}</button><small class="muted">${esc(p.municipality)}</small></td><td>${dot(p.phase)} ${esc(P.PHASE_BY_KEY[p.phase].label)}</td><td class="n">${fmtNum(Math.round(left(p)))}</td><td class="n">${fmtNum(roundPop(pe.population))}</td></tr>`;
    }).join('');
    return `<section class="ov-card ov-topdevs"><div class="ov-h"><h3>Largest unbuilt</h3><button type="button" class="btn small link ov-go" data-ov-inview title="The In view list in the left panel (sort: most left to build)">See all →</button></div>
      <table class="dt ov-t"><thead><tr><th>Development</th><th>Phase</th><th class="n">Left to build</th><th class="n">People</th></tr></thead><tbody>${rows}</tbody></table></section>`;
  }
  // A result scope (a DC work, a pipe, a file, a tool's result: SPEC §3) shows in its own host next to
  // the Overview body; it is rebuilt only when the result changes, so its inputs keep their state.
  function resultHost(rs) {
    const el = $('#ov-body'), host = $('#scope-body'); if (!host) return false;
    if (!rs) { host.hidden = true; if (el) el.hidden = false; return false; }
    if (el) el.hidden = true; host.hidden = false;
    const W = root.PeelWorkspaces, wsNow = W && W.mode() === 'ws' ? String(W.current()) : '';
    if (host.dataset.ref !== rs.ref || host.dataset.v !== String(rs.result.v) || (host.dataset.ws || '') !== wsNow) {
      // Stage 3: the result as the standard panel: its header (back to Peel, ×, kind), the result's
      // headline as the answer, its body as the details, the footer with the screening note. Rendered
      // here, in the result's own host, so a tool's inputs keep their state.
      const kind = SCOPE_KIND[rs.rkind] || 'Result', body = String(rs.result.html || '');
      const hm = body.match(/<p class="headline"[^>]*>([\s\S]*?)<\/p>/), rest = hm ? body.replace(hm[0], '') : body;
      host.innerHTML = root.PeelPanel ? root.PeelPanel.html({ key: 'overview:result', calc: /\d/.test(body) && rs.rkind !== 'help' && rs.rkind !== 'file',
        head: { trail: [{ label: 'Peel', attrs: { 'data-scope-result-close': '' } }, { label: kind.split(' · ')[0] }], close: { 'data-scope-result-close': '', 'aria-label': `Close ${rs.title}` }, name: rs.title, identity: esc(kind) },
        answer: hm ? hm[1] : `<strong>${esc(rs.title)}</strong>`, lists: [{ title: 'Details', rows: [{ kv: true, html: `<div class="pnl-result">${rest}</div>` }], total: 1 }] })
        : `<div class="scope-head"><span class="muted small">${esc(kind)}</span><button type="button" class="btn small scope-x" data-scope-result-close aria-label="Close ${esc(rs.title)}">× Close</button></div>${body}`;
      // In a workspace (Study area: the drawn area's result) the header names its source, as every panel.
      if (W && W.srcLine) host.innerHTML = host.innerHTML.replace('<header class="pnl-head" data-sec="header">', m => `${m}${W.srcLine('overview:')}`);
      host.dataset.ref = rs.ref; host.dataset.v = String(rs.result.v); host.dataset.ws = wsNow;
    }
    return true;
  }
  const SCOPE_KIND = { dcwork: 'DC work · 2026 capital map (draft)', pipe: 'Sanitary sewer', file: 'Single file', iiblock: 'Wastewater block', wfac: 'Water facility', sel: 'Selection', help: 'Help', tool: 'Tool result', cx: 'Constraint layer · screening', ea: 'Environmental assessment · screening', cap: 'Capital project · screening' };
  // ---- Stage 3: the area Overview (Peel, a municipality, a plan) as the standard panel -----------------
  let ovSort = store.get('ovSort', 'limit');
  // The last area Overview panel (Peel or the municipality filter): Home shows its figures (Stage 4).
  let lastArea = null;
  document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-ov-sort]'); if (b) { ovSort = b.dataset.ovSort; store.set('ovSort', ovSort); renderOverview(); } });
  function areaPanelSpec(o) {
    const PN = root.PeelPanel, SC = root.PeelSvcCapacity, { set, e, pipe, unitsAll, left, n, lyTiles, capList, nd, hl, permitCaveat, info, fr } = o;
    const rows = SC && SC.collect ? (SC.collect() || []) : [], now = MM().THIS_YEAR;
    // Needs attention: the facilities that reach a limit or sit past the 90% trigger at build-out, ranked
    // as Servicing › Capacity (Soonest | Largest impact), with the same row and impact line.
    const needs = rows.filter(r => r.limit.y != null || r.pctBo >= 90), ranked = SC ? SC.sortRows(needs, ovSort, now) : [];
    const over = rows.filter(r => r.pctBo >= 100).length, tight = rows.filter(r => r.pctBo >= 90 && r.pctBo < 100).length;
    const sortBtn = (k, t) => `<button type="button" class="btn small${ovSort === k ? ' on' : ''}" data-ov-sort="${k}" aria-pressed="${ovSort === k}">${t}</button>`;
    const week = [...(nd.ce || []).map(it => ({ attrs: { 'data-ce-open': it.ce }, html: `<small class="pnl-r-line">${esc(it.text)}</small>` })), ...(nd.changes || []).map(it => ({ attrs: { 'data-pnl-dev': it.key }, html: `<small class="pnl-r-line">${esc(it.text)}</small>` }))];
    const muni = App().state.muni, asOf = fr && fr[0] && fr[0].date;
    return {
      calc: true, fullTitle: `Overview · ${muni || 'Peel'}: every card`,
      head: { trail: [{ label: 'Peel' }, ...(muni ? [{ label: muni }] : []), { label: 'Overview' }], name: 'What needs attention?', status: over ? { tone: 'over', text: `${over} over` } : tight ? { tone: 'tight', text: `${tight} tight` } : rows.length ? { tone: 'room', text: 'Room' } : null,
        identity: `${esc(muni || 'Peel')} · ${esc(scopeText())}${asOf ? ` · applications as of ${esc(asOf)}` : ''}`, extra: permitCaveat },
      answer: hl,
      figures: [
        { v: fmtNum(set.length), u: 'developments', label: 'shown on the map', ctx: esc(scopeText()) },
        { v: fmtNum(Math.round(unitsAll)), u: 'units', label: 'planned', ctx: n ? `${fmtNum(left)} left to build` : (lyTiles.units || '') },
        { v: fmtNum(roundPop(e.population)), u: 'people', label: 'at build-out', ctx: lyTiles.people || '' },
        { v: fmtNum(roundPop(e.employment.jobs)), u: 'jobs', label: 'on development sites', ctx: '' },
      ],
      chart: capList ? `<p class="small pnl-chart-t">Wastewater plants and South Peel water treatment: existing, built, committed and proposed against rated capacity</p>${capacityBarsHTML(capList)}` : '',
      lists: [
        { title: 'Needs attention', tools: `<div class="seg" role="group" aria-label="Sort">${sortBtn('limit', 'Soonest')}${sortBtn('impact', 'Largest impact')}</div>`, rows: ranked.slice(0, 5).map(SC.listRow), total: ranked.length, seeAll: { 'data-at': 'svc:capacity' } },
        { title: 'This week', rows: week.slice(0, 5), total: week.length, seeAll: { 'data-full-table': 'overview' } },
      ],
      method: info.replace(/^<p[^>]*>|<\/p>$/g, ''),
      sources: `${(fr || []).filter(r => r.date).slice(0, 6).map(r => `${esc(r.name)} · ${esc(r.date)}`).join('<br>')}<br><button type="button" class="btn small link" data-at="records:sources">Every source and its date (Records) →</button>`,
      foot: { primary: { label: 'Briefing PDF', attrs: { 'data-pnl-brief': '' }, title: 'A one-page summary to print or save as PDF' } },
    };
  }
  function renderOverview(set, e, basis) {
    const el = $('#ov-body'); if (!el) return;
    const rsc = root.PeelSvcScope && root.PeelSvcScope.current();
    if (resultHost(rsc && rsc.kind === 'result' && !DV().scopedDev() ? rsc : null)) return;
    const p = DV().scopedDev();
    if (p) { renderVerdictCard(p); return; }
    const sec = $('#ov-dev'); if (sec) sec.hidden = true;
    // A servicing scope (plant / station / block / zone / water system) has its own Overview.
    const ss = root.PeelSvcScope && root.PeelSvcScope.current();
    if (ss) {
      const sset = set || DU().overviewSet(); el.innerHTML = root.PeelSvcScope.cardHTML(ss, sset) + CX_HOST; fillCxCard(sset);
      if (root.PeelPanel && ss.kind !== 'result') root.PeelPanel.set('overview:', root.PeelSvcScope.panelSpec(ss, sset));
      return;
    }
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
    // The tiles carry layer sub-labels (SPEC §5): the units and people by layer, as the bars sum.
    const lyTiles = (() => {
      const Ly = root.PeelLayers; if (!Ly || !set.length) return { units: '', people: '' };
      const t = Ly.totals(set), LB = root.PeelLayerBar, ks = ['built', 'committed', 'proposed', 'anticipated'].filter(k => t.units[k] >= 0.5);
      return { units: ks.map(k => `${LB ? LB.LABEL[k] : k} ${fmtNum(Math.round(t.units[k]))}`).join(' · '), people: ks.map(k => `${LB ? LB.LABEL[k] : k} ${fmtNum(roundPop(t.people[k]))}`).join(' · '), anticipated: ks.includes('anticipated') };
    })();
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
    const TAB_LABEL = { dca: 'Capital', ww: 'Servicing', water: 'Servicing' };
    const toneCls = { ok: 'why-ok-t', warn: 'why-stall-t', bad: 'why-stop-t' };
    const nd = needsAttentionData(set, capList), na = DV().needsAttention(nd), groups = DV().needsGroups(nd);
    const needs = `<section class="ov-card ov-needs"><div class="ov-h"><h3>Needs attention</h3></div>
      ${na.length ? groups.map(g => `<div class="na-g"><h4 class="na-gh">${esc(g.name)} <span class="muted">· ${fmtNum(g.count)}${g.note ? ` · ${esc(g.note)}` : ''}</span></h4>${g.items.length ? `<ul class="na-list small">${g.items.map(it => `<li class="na-it"><span class="${toneCls[it.tone]}">${esc(it.text)}</span>${it.ce ? `<button type="button" class="btn small link" data-ce-open="${esc(it.ce)}">${it.ce.startsWith('ea:') ? 'EA' : 'Project'} →</button>` : it.dev ? `<button type="button" class="btn small link" data-ov-dev="${esc(it.dev)}">Development →</button>` : it.tab ? go(it.tab, TAB_LABEL[it.tab] || it.tab) : ''}</li>`).join('')}</ul>` : '<p class="small muted">None.</p>'}</div>`).join('') : '<p class="small muted">Nothing needs attention right now.</p>'}</section>`;
    const hl = set.length ? `The <strong>${fmtNum(set.length)}</strong> developments shown would add about <strong>${fmtNum(roundPop(e.population))} people</strong> and ${fmtNum(roundPop(em.jobs))} jobs in ${fmtNum(Math.round(unitsAll))} units.${tight ? ` <strong>${esc(SV().PLANT_SHORT[tight.pl])}</strong> ${SvcTab().trigText(tight)} (existing + built + committed ${SvcTab().pctRated(tight, 'com')}% of rated capacity → ${SvcTab().pctRated(tight, 'bo')}% at build-out).` : ''}` : 'No developments match the current filters.';
    // ⓘ line: method, criteria, data dates.
    const fr = DU().freshness(), nDue = fr.filter(r => r.st === 'due' || r.st === 'stale').length;
    const basisTxt = { all: 'every stage, pre-consultation to completed', committed: 'approved only (committed, D-5-1)', remaining: 'units left to build' }[basis] || 'every stage';
    const info = `<p class="small muted ov-info"><button type="button" class="btn small link" data-info="definitions">Definitions</button> · ⓘ Servicing demand at Peel design criteria, as in a functional servicing report; capacity as % of rated (plants: ${SvcTab().wwFlowLabel('long')}; water: max day); black tick: the 90% expansion trigger. Scope: ${esc(basisTxt)}${App().state.muni ? ` · ${esc(App().state.muni)}` : ''}. Applications as of <strong>${esc((fr[0] && fr[0].date) || '–')}</strong> · ${nDue ? `<span class="fr-b fr-due">${nDue} source${nDue === 1 ? '' : 's'} due for a refresh</span>` : '<span class="fr-b fr-ok">all sources current</span>'} ${go('criteria', 'Data & checks')}</p>`;
    const permitCaveat = root.PeelCensusView && root.PeelCensusView.permitCaveatHTML ? root.PeelCensusView.permitCaveatHTML() : '';
    // Stage 3: the standard panel. The cards below (every tile, the capacity bars, Needs attention by
    // group, the largest unbuilt, the constraint card) are its full table.
    lastArea = areaPanelSpec({ set, e, basis, pipe, unitsAll, left, n, lyTiles, capList, nd, hl, permitCaveat, info, fr, nDue });
    if (root.PeelPanel) root.PeelPanel.set('overview:', lastArea);
    el.innerHTML = `<div class="ov-top">${hlP(hl)}${permitCaveat}<button type="button" class="btn small link ov-brief" data-ov-tool="brief" title="A one-page summary to print or save as PDF (also in Export)">Executive briefing (PDF)</button></div>
      <div class="ov-grid">
        <section class="ov-card ov-growth"><div class="ov-h"><h3>Growth</h3>${go('growth', 'Growth')}</div>
          <div class="ov-tiles">${tile(fmtNum(set.length), 'developments', 'shown on the map', esc(scopeText()))}${tile(fmtNum(Math.round(unitsAll)), 'units', 'planned', [lyTiles.units, n ? `${fmtNum(left)} left to build` : '', inPlan ? `${fmtNum(Math.round(inPlan.planned))} inside ${esc(inPlan.name)} (By plan) + ${fmtNum(Math.round(inPlan.outside))} in the parts of ${fmtNum(inPlan.straddling)} development${inPlan.straddling === 1 ? '' : 's'} outside it` : ''].filter(Boolean).join('<br>'))}${tile(fmtNum(roundPop(e.population)), 'people', 'at build-out', lyTiles.people)}${tile(fmtNum(roundPop(em.jobs)), 'jobs', 'on development sites')}</div>${lyTiles.anticipated ? `<p class="small muted ly-def">Pre-application: ${esc(root.PeelLayers.NOTE.anticipated)}.</p>` : ''}</section>
        ${needs}
        <section class="ov-card ov-cap-c"><div class="ov-h"><h3>Capacity</h3>${go('svc:capacity', 'Servicing › Capacity')}</div>${cap}</section>
        ${topDevsHTML(set, basis)}
        ${CX_HOST}
        <div class="ov-info-w">${info}</div>
      </div>`;
    fillCxCard(set);
    if (App().state.dcInfra && MM().SEW.data && !(MP().DCA.res && MP().DCA.key === MP().scenarioKey()) && AT().getFootTab() === 'overview') setTimeout(() => { try { DC().dcAnalysis(); renderOverview(); } catch (err) { /* shown on the DC tab */ } }, 50);
    if (document.documentElement.hasAttribute('data-presentation')) AS().renderPresentation();
  }
  // ---- Land under constraints (js/constraint-data.js): the area in scope and its developments ----
  const CX_HOST = '<section class="ov-card ov-cx" id="ov-cx" data-info="land-constraints"><div class="ov-h"><h3>Land under constraints</h3></div><p class="small muted">Loading the constraint layers…</p></section>';
  // The area the Overview covers: a servicing scope, else the plan / MTSA / zone / block filter,
  // else the municipality, else Peel. { name, polys } | { name, muni } | { name } (all of Peel).
  function cxScope() {
    const st = App().state, A = st.areas, SDm = root.PeelSvcData;
    const ss = root.PeelSvcScope && root.PeelSvcScope.current();
    const svc = ids => [...ids].map(id => SDm && SDm.svcById.get(id)).filter(a => a && a.rings);
    if (ss && ss.ids) { const xs = svc(ss.ids); return xs.length ? { name: ss.title, polys: xs.map(a => a.rings) } : null; }
    const pick = (ids, list) => ids.map(id => (list || []).find(x => x.id === id)).filter(x => x && x.rings);
    const named = (xs, more) => ({ name: xs.length > 2 ? `${xs.slice(0, 2).map(x => x.name).join(', ')} and ${xs.length - 2} ${more}` : xs.map(x => x.name).join(', '), polys: xs.map(x => x.rings) });
    if (st.sp.length && A) { const xs = pick(st.sp, [...A.secondaryPlans, ...(A.precincts || [])]); if (xs.length) return named(xs, 'more plan areas'); }
    if (st.mtsa.length && A) { const xs = pick(st.mtsa, A.mtsas); if (xs.length) return named(xs, 'more MTSAs'); }
    if (st.pz.length || st.dr.length) { const xs = svc([...st.pz, ...st.dr]); if (xs.length) return { name: xs.length === 1 ? (xs[0].name || SDm.drName(xs[0])) : `${xs.length} servicing areas`, polys: xs.map(a => a.rings) }; }
    if (st.muni) return { name: st.muni, muni: st.muni };
    return { name: 'Peel' };
  }
  let cxSeq = 0;
  function fillCxCard(set) {
    const CXD = root.PeelCxData, my = ++cxSeq; if (!CXD) return;
    const scope = cxScope(); if (!scope) { const h = $('#ov-cx'); if (h) h.remove(); return; }
    // All of Peel: on request (the screening grid is 0.6 MB; area scopes load it themselves).
    if (!scope.muni && !scope.polys && !cxPeel) { const h = $('#ov-cx'); if (h) h.innerHTML = '<div class="ov-h"><h3>Land under constraints</h3></div><p class="small muted">The share of Peel’s land in regulation limits, floodplain and provincial plan areas, and the developments inside each (screening). Opens by itself for a municipality, plan area, zone or block. <button type="button" class="btn small" data-cx-peel>Show for all of Peel</button></p>'; return; }
    CXD.areaCard(scope, set || []).then(r => {
      const h = $('#ov-cx'); if (!h || my !== cxSeq) return;
      h.innerHTML = r.html; cxRows = { rows: r.rows, scope: scope.name };
    }).catch(() => { const h = $('#ov-cx'); if (h && my === cxSeq) h.innerHTML = '<div class="ov-h"><h3>Land under constraints</h3></div><p class="small muted">The constraint layers did not load.</p>'; });
  }
  let cxRows = null, cxPeel = false;
  // "n developments inside" → those developments, as a selection in the right panel.
  function openCxDevs(k) {
    const row = cxRows && cxRows.rows.find(r => r.k === k); if (!row || !root.PeelSvcScope) return;
    const devs = row.devs.map(key => DN().projectByKey(key)).filter(Boolean);
    const AS = root.PeelAreaSelect;
    const html = AS && AS.selectionSummaryHTML ? AS.selectionSummaryHTML(devs, false) : `<ul class="small">${devs.map(p => `<li><button type="button" class="btn small link" data-ov-dev="${esc(p.key)}">${esc(p.title)}</button></li>`).join('')}</ul>`;
    root.PeelSvcScope.openResult({ ref: `sel:cx-${k}`, title: `${devs.length} developments inside ${row.label.toLowerCase()} (${cxRows.scope}; screening)`, html: `<p class="small muted">Developments whose point is inside the mapped ${esc(row.label.toLowerCase())} (${esc(row.from)}), on a 25 m grid. Screening only: the conservation authority or province confirms.</p>${html}`, devKeys: row.devs });
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-cx-devs]'); if (b) { openCxDevs(b.dataset.cxDevs); return; }
    if (e.target.closest && e.target.closest('[data-cx-peel]')) { cxPeel = true; fillCxCard(DU().overviewSet()); }
  });

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
  document.addEventListener('click', e => {
    if (!e.target.closest('[data-ov-inview]')) return;
    const DT = root.PeelDataTab; if (DT) { DT.showTab('explore'); if (DT.shellNarrow && DT.shellNarrow()) DT.toggleSidebar(true); }
    const sel = $('#list-sort'); if (sel) { sel.value = 'left'; sel.dispatchEvent(new Event('change')); }
    const l = document.querySelector('.list-panel'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  $('#ov-body').addEventListener('click', e => {
    const t = e.target.closest('[data-ov-tab]');
    if (t) {
      // Phase 4: the criteria tab is gone — "Data & checks" opens the gear menu's Sources & checks page.
      if (t.dataset.ovTab === 'criteria') { TB().openGearPage('sources'); return; }
      const [tab, sub] = t.dataset.ovTab.split(':');   // "tab" or "tab:sub-view"
      AT().setFootPref(AT().tabOf(tab)); store.set('footTab4', AT().tabOf(tab)); AT().showFootTab(tab, sub); return;
    }
    const ds = e.target.closest('[data-ov-devsec]');
    if (ds) { if (window.DevTab && typeof window.DevTab.setSub === 'function') window.DevTab.setSub(ds.dataset.ovDevsec); const sec = $('#ov-dev'); if (sec) sec.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
    const dv = e.target.closest('[data-ov-dev]'); if (dv) { const q = DN().projectByKey(dv.dataset.ovDev); if (q) DN().showDetail(q); return; }
    const k = e.target.closest('[data-ov-tool]');
    if (k && k.dataset.ovTool === 'brief') RP().briefingPDF();
  });

  // ---- Public contract ----
  const api = { renderOverview, renderVerdictCard, scopeText, scopeLabel, capacityBarsHTML, lastAreaSpec: () => lastArea };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelOverviewTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
