/* Servicing capacity — horizon (hz), capacity charts, pump-stations tab,
 * Phase 6 extraction from js/app.js (app.js 4888-5266).
 * plants tab, references.
 */
(function (root) {
  'use strict';

  const D = window.PeelDemand;
  const { $, esc, fmtNum, fmt1, roundPop, unit, uML, uHa, uLs, uPop, skel, estTag, hlP, store, PIPE_RESULTS, SCREEN_NOTE, isSmallSystem, uCap, capTxt } = window.PeelUtil;
  const App = () => window.PeelApp;
  const DD = () => window.PeelDevDetail;
  const FS = () => window.PeelFsr;
  const MP = () => window.PeelMasterPlan;
  const SD = () => window.PeelSvcData;
  const SvcTab = () => window.PeelSvcTab;
  const MA = () => window.PeelMapAnalysis;
  const SC = () => window.PeelSewerCap;
  const DV = () => window.PeelDevVerdict;
  const ST = () => window.PeelSewerTrace;
  const TS = () => window.PeelToolScope;
  const AT = () => window.PeelAnalysisTabs;
  const DUI = () => window.PeelDemandUI;
  const DI = () => window.PeelDcInfra;
  const MM = () => window.PeelMapMarkers;
  const Areas = () => window.PeelAreas;

  let savedSubs = null;
  // Scoped Water / Wastewater tabs: the site's brief replaces the Peel-wide aggregates; the
  // ground / storm / pond rows stay out (their home is Development › Site).
  function renderSvcScoped(p) {
    if (!savedSubs) savedSubs = { wSub: AT().getWSub(), wwSub: AT().getWwSub() };
    AT().setWSub('zones'); AT().setWwSub('catchments');
    for (const id of ['#pane-wcap', '#pane-wfac', '#pane-alloc', '#pane-plants', '#pane-pumpstations']) { const n = $(id); if (n) n.dataset.off = '1'; }
    for (const s of document.querySelectorAll('.f-subtabs[data-pane="water"], .f-subtabs[data-pane="ww"]')) s.dataset.off = '1';
    const st = DD().statusOf(p), f = SD().svcFacts(p);
    st.works = st.works || DI().devWorks(p, f);
    $('#water-body').innerHTML = `<div class="tb-head"><h2 class="pane-h">${esc(p.title)} <span class="muted">· Water</span></h2></div>`
      + FS().devServicingBriefHTML(p, st, f, 'water')
      + `<p class="small muted">Peel-wide pressure zones return when no site is scoped.</p>`;
    $('#ww-body').innerHTML = `<div class="tb-head"><h2 class="pane-h">${esc(p.title)} <span class="muted">· Wastewater</span></h2></div>`
      + FS().devServicingBriefHTML(p, st, f, 'ww', { site: false })
      + `<p class="small muted">Ground, storm sewers and stormwater ponds live in Overview › Site. Peel-wide catchments return when no site is scoped.</p>`;
    DV().scopeBriefIds($('#water-body')); DV().scopeBriefIds($('#ww-body'));
    $('#water-note').textContent = `${p.title} · site servicing`;
    $('#ww-note').textContent = `${p.title} · site servicing`;
    if (AT().getFootTab() === 'water' || AT().getFootTab() === 'ww') AT().showFootTab(AT().getFootTab());
  }
  // Plants tab: a comparison of the model with each plant's 2025 annual report, then each
  // plant's total inflow built up layer by layer like the Growth tab: census + built since +
  // approved + proposed = build-out, with the external inflows (York Region, City of Toronto).
  // Peaks are not additive, so a growth layer's peak is what it adds to the peak (the running
  // total, peaked on its population, is shown below). I&I is on the whole drainage area, so it
  // all sits with the existing system.
  // Horizon years (Plants & capacity): each plant's average dry weather flow as a % of its rated
  // capacity by year, with approved growth phased in over a set number of years, proposed growth
  // after it, optional further growth beyond today's applications, and the diversion from its
  // start year. Assumptions are editable and kept in the browser.
  const HZ_DEFAULT = { year0: 2025, aStart: 2026, aYears: 5, pStart: 2028, pYears: 10, extra: 0, divYear: 2028, end: 2051, exp: 1 };
  const hz = { ...HZ_DEFAULT, ...(store.get('horizon', {}) || {}) };
  function capHorizonHTML(plants, dv) {
    if (!plants.length) return '';
    const frac = (y, start, n) => Math.min(1, Math.max(0, (y - start + 1) / Math.max(1, n)));
    const popAll = plants.reduce((t, p) => t + p.popShare, 0) || 1;
    const years = []; for (let y = hz.year0; y <= hz.end; y++) years.push(y);
    const divOn = SvcTab().svcOpt.div === 'on';
    // Planned treatment expansions (2026 DC maps): rated capacity steps up from the given years.
    const PL = { booth: 'Lakeview', clarkson: 'Clarkson', inglewood: 'Inglewood' };
    const steps = k => (hz.exp && App().state.dcInfra && App().state.dcInfra.plantCapacity[PL[k]] || []).map((x, i) => ({ ...x, year: hz[`ex_${PL[k]}_${i}`] || x.year }));
    const ratedAt = (p, y) => steps(p.key).reduce((r, x) => y >= x.year ? Math.max(r, x.mld) : r, p.rated);
    const series = plants.map(p => ({ ...p, steps: steps(p.key), r: years.map(y => ratedAt(p, y)), v: years.map(y => {
      const extraPeople = hz.extra * Math.max(0, y - hz.year0) * p.popShare / popAll;
      const f = p.existing + p.A * frac(y, hz.aStart, hz.aYears) + p.P * frac(y, hz.pStart, hz.pYears) + (divOn && y >= hz.divYear ? p.div : 0) + extraPeople * p.perPerson / 1e6;
      return f / ratedAt(p, y) * 100;
    }) }));
    const W = window.PeelUtil.chartW(320, 900), narrow = W < 560, H = narrow ? 230 : 250, L = 36, Rr = narrow ? 100 : 120, T = 10, B = 26;
    const yMax = Math.max(110, Math.ceil(Math.max(...series.flatMap(s => s.v)) / 10) * 10 + 5);
    const X = y => L + (y - hz.year0) / (hz.end - hz.year0) * (W - L - Rr), Yp = v => T + (1 - v / yMax) * (H - T - B);
    const ticksY = []; for (let v = 0; v <= yMax; v += 20) ticksY.push(v);
    const ticksX = years.filter(y => y % (narrow ? 10 : 5) === 0 || y === hz.year0);
    const cross = t => { const r = {}; for (const s of series) { const i = s.v.findIndex(v => v >= t); r[s.key] = i < 0 ? `after ${hz.end}` : i === 0 ? `by ${years[0]}` : String(years[i]); } return r; };
    const c80 = cross(80), c90 = cross(90), c100 = cross(100);
    const at = y => years.indexOf(y);
    const pick = [hz.year0, 2031, 2041, hz.end].filter((y, i, a) => at(y) >= 0 && a.indexOf(y) === i);
    // End labels: nudge apart when close.
    const ends = series.map(s => ({ s, y: Yp(s.v[s.v.length - 1]) })).sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 13) ends[i].y = ends[i - 1].y + 13;
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Plant flow as a percentage of rated capacity, ${hz.year0} to ${hz.end}">
      <g class="grid">${ticksY.map(v => `<line x1="${L}" x2="${W - Rr}" y1="${Yp(v)}" y2="${Yp(v)}"/>`).join('')}</g>
      <g class="axis">${ticksY.map(v => `<text x="${L - 6}" y="${Yp(v) + 4}" text-anchor="end">${v}%</text>`).join('')}${ticksX.map(y => `<text x="${X(y)}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}</g>
      ${[80, 90, 100].map(t => `<g class="ref r${t}"><line x1="${L}" x2="${W - Rr}" y1="${Yp(t)}" y2="${Yp(t)}"/><text x="${W - Rr - 4}" y="${Yp(t) + (t === 100 ? -4 : 12)}" text-anchor="end">${t}%${t === 100 ? ' rated' : t === 90 ? ' expansion trigger' : ''}</text></g>`).join('')}
      ${series.flatMap(s => s.steps.filter(x => x.year >= hz.year0 && x.year <= hz.end).map(x => `<g class="hz-exp"><line x1="${X(x.year)}" x2="${X(x.year)}" y1="${T}" y2="${H - B}" class="s-${s.key}"/><text x="${X(x.year) + 3}" y="${T + 10}">${esc(s.name)} ${x.mld}</text></g>`)).join('')}
      ${series.map(s => `<polyline class="line s-${s.key}" points="${s.v.map((v, i) => `${X(years[i]).toFixed(1)},${Yp(v).toFixed(1)}`).join(' ')}"/>`).join('')}
      ${ends.map(e => `<text class="lbl end" x="${W - Rr + 6}" y="${e.y + 4}">${esc(e.s.name)} ${Math.round(e.s.v[e.s.v.length - 1])}%</text>`).join('')}
      <line class="cross" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      ${series.map(s => `<circle class="pt f-${s.key}" r="4" cx="0" cy="0" visibility="hidden" data-k="${s.key}"/>`).join('')}
      <rect class="hz-hit" x="${L}" y="${T}" width="${W - L - Rr}" height="${H - T - B}" fill="transparent"/>
    </svg>`;
    const inp = (k, label, w = '') => `<label>${label} <input type="number" data-hz="${k}" value="${hz[k]}" ${w}></label>`;
    // Keep the data for the hover layer.
    capHorizonHTML.data = { years, series, X, Yp, W, H, T, B };
    return `<section class="hz" data-info="horizon">
      <h3 class="svc-sub">Horizon years ${window.PeelUtil.basisChip('mixed', SvcTab().svcOpt.ww === 'calibrated' ? 'Mixed basis: existing flow 2025 measured (annual reports); growth at Peel design criteria scaled to each plant\u2019s measured rate; rated capacity from the 2025 annual reports' : 'Mixed basis: flows at Peel design criteria; rated capacity from the 2025 annual reports')} <span class="muted small">${SvcTab().wwFlowLabel()} as a % of rated (annual average) capacity, ${hz.year0}–${hz.end} · ${SvcTab().svcOpt.ww === 'calibrated' ? 'capacity check' : 'design flows'}</span></h3>
      <div class="hz-form">${inp('aStart', 'Approved built from', 'min="2020" max="2060" step="1"')}${inp('aYears', 'over', 'min="1" max="40" step="1"')} years ·
        ${inp('pStart', 'Proposed built from', 'min="2020" max="2060" step="1"')}${inp('pYears', 'over', 'min="1" max="40" step="1"')} years ·
        ${inp('extra', 'Further growth beyond applications', 'min="0" step="1000" style="width:84px"')} people / year${dv ? ` · ${inp('divYear', `${fmt1(dv.mld)} ML/d diversion from`, 'min="2020" max="2060" step="1"')}${divOn ? '' : ' <span class="muted">(switch the diversion on to use it)</span>'}` : ''}
        ${App().state.dcInfra ? `<br><label class="chk"><input type="checkbox" data-hz="exp"${hz.exp ? ' checked' : ''}> Planned expansions (2026 DC draft):</label> ${Object.entries(App().state.dcInfra.plantCapacity).map(([pl, st]) => st.map((x, i) => `${esc(SD().PLANT_SHORT[pl])} ${x.mld} ML/d from <input type="number" data-hz="ex_${pl}_${i}" value="${hz[`ex_${pl}_${i}`] || x.year}" min="2020" max="2060" step="1" title="${esc(x.note)}">`).join(', ')).join(' · ')}` : ''}
        <button type="button" class="btn small" data-hz-reset>Reset</button></div>
      <div class="hz-wrap">${svg}<div class="hz-tip" hidden></div></div>
      <ul class="grow-legend">${series.map(s => `<li><span class="hz-key f-${s.key}" style="background:var(--pl-${s.key})"></span>${esc(s.full)}</li>`).join('')}<li class="muted">dashed: 80% warning and 90% expansion trigger (2020 Master Plan); solid: rated capacity</li></ul>
      <table class="dt svc-table rep-table"><thead><tr><th>Plant</th>${pick.map(y => `<th>${y}</th>`).join('')}<th>Reaches 80%</th><th>Reaches 90%</th><th>Reaches 100%</th></tr></thead>
        <tbody>${series.map(s => `<tr><td>${esc(s.full)}<small>rated ${uCap(s.rated, s.rated)}${s.steps.length ? ` → ${s.steps.map(x => `${x.mld} (${x.year})`).join(' → ')}` : ''}</small></td>${pick.map(y => `<td>${Math.round(s.v[at(y)])}%<small>${uCap(s.v[at(y)] * s.r[at(y)] / 100, s.rated)}${s.r[at(y)] !== s.rated ? ` of ${fmtNum(s.r[at(y)])} after the ${(s.steps.filter(x => x.mld <= s.r[at(y)]).pop() || {}).year || ''} expansion` : ''}${y === pick[0] && y <= MM().THIS_YEAR ? ' · measured' : ''}</small></td>`).join('')}<td>${c80[s.key]}</td><td>${c90[s.key]}</td><td class="bo">${c100[s.key]}</td></tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Starts from today (${hz.year0}: ${SvcTab().svcOpt.ww === 'calibrated' ? 'the 2025 reported flow' : 'census + built since at design rates'}, plus external inflows). Approved growth is added evenly over its years, then proposed growth over its years; further growth beyond today's applications (if set) is shared among the plants by today's population at each plant's flow per person. The diversion moves its flow from its start year. With planned expansions on, each % is of the rated capacity in that year: G.E. Booth +40 ML/d (council-approved February 2024, by 2028) and 518 to 600 ML/d after the 2036 construction, Clarkson 350 to 500 ML/d after the 2026–2028 construction (2026 DC capital map, draft; capacities from the 2020 DC Background Study); in service the year after construction, editable. 90% is the Region's own trigger: in the 2020 Master Plan an expansion is required when 90% of a plant's rated capacity is projected to be reached; 80% is shown as an earlier warning. Ontario's Procedure D-5-1 notes that plant expansions typically take at least 3 to 5 years to deliver. These are scenarios, not forecasts: actual timing depends on market absorption, servicing and approvals.</p></details>
    </section>`;
  }
  $('#plants-body').addEventListener('input', e => {
    const el = e.target.closest('[data-hz]'); if (!el) return;
    const v = el.type === 'checkbox' ? (el.checked ? 1 : 0) : Number(el.value); if (!isFinite(v)) return;
    hz[el.dataset.hz] = v; store.set('horizon', hz);
    clearTimeout(capHorizonHTML.t); capHorizonHTML.t = setTimeout(() => { const y = $('#plants-body').parentElement.scrollTop; SvcTab().renderSvcTab(); const f = $(`#plants-body [data-hz="${el.dataset.hz}"]`); if (f) { f.focus(); const n = f.value.length; try { f.setSelectionRange(n, n); } catch (er) { /* number inputs */ } } $('#plants-body').parentElement.scrollTop = y; }, 350);
  });
  $('#plants-body').addEventListener('click', e => {
    if (e.target.closest('[data-tight-all]')) { tightSeeAll = !tightSeeAll; const box = $('#tight-pipes'); if (box) box.innerHTML = tightestPipesHTML(); return; }
    if (!e.target.closest('[data-hz-reset]')) return;
    for (const k of Object.keys(hz)) if (k.startsWith('ex_')) delete hz[k];
    Object.assign(hz, HZ_DEFAULT); store.set('horizon', null); SvcTab().renderSvcTab();
  });
  // Hover layer: crosshair at the nearest year with each plant's value.
  $('#plants-body').addEventListener('mousemove', e => {
    const svg = e.target.closest('.hz svg'); const D0 = capHorizonHTML.data;
    const wrap = svg && svg.parentElement, tip = wrap && wrap.querySelector('.hz-tip');
    if (!svg || !D0) { document.querySelectorAll('.hz-tip').forEach(t => { t.hidden = true; }); return; }
    const r = svg.getBoundingClientRect(), x = (e.clientX - r.left) / r.width * D0.W;
    let i = 0, best = Infinity; D0.years.forEach((y, k) => { const d = Math.abs(D0.X(y) - x); if (d < best) { best = d; i = k; } });
    const cx = D0.X(D0.years[i]);
    const cross = svg.querySelector('.cross'); cross.setAttribute('x1', cx); cross.setAttribute('x2', cx); cross.setAttribute('visibility', 'visible');
    for (const c of svg.querySelectorAll('.pt')) { const s = D0.series.find(q => q.key === c.dataset.k); c.setAttribute('cx', cx); c.setAttribute('cy', D0.Yp(s.v[i])); c.setAttribute('visibility', 'visible'); }
    tip.textContent = `${D0.years[i]}: ${D0.series.map(s => `${s.name} ${Math.round(s.v[i])}%`).join(' · ')}`;
    tip.hidden = false; tip.style.left = `${Math.min(r.width - tip.offsetWidth, Math.max(0, cx / D0.W * r.width + 10))}px`; tip.style.top = '0px';
  });
  // Plant capacity chart (Plants tab). One bar per plant on a % of rated capacity axis; the
  // 100% line is the rated capacity. Segment colours follow the Growth tab (census grey, built
  // green, approved blue, proposed hatched), every value is also written out below the bar.
  function capChartHTML(rows, Y, opt = {}) {
    const pct = (x, r) => x / r * 100;
    // Small systems (rated under 5 ML/d: Inglewood) get their own group and scale, in m³/d.
    const main = rows.filter(r => !isSmallSystem(r.rated)), small = rows.filter(r => isSmallSystem(r.rated));
    const scaleOf = rs => {
      const axisMax = Math.ceil(Math.max(110, ...rs.map(r => pct(r.v.reduce((a, b) => a + b, 0), r.rated))) / 25) * 25;
      const ticks = []; for (let t = 0; t <= axisMax; t += 25) ticks.push(t);
      return { axisMax, ticks, X: p => `${(p / axisMax * 100).toFixed(2)}%` };
    };
    const S0 = scaleOf(main.length ? main : rows), S1 = scaleOf(small);
    const axisHTML = sc => `<div class="cap-axis"><div></div><div class="cap-ticks">${sc.ticks.map(t => `<span style="left:${sc.X(t)}"${t === 100 ? ' class="hundred"' : ''}>${t}%</span>`).join('')}</div></div>`;
    const ppl = n => unit(fmtNum(Math.round(n / 100) * 100), 'people');
    const segs = [['g-base', `${Y} Census (existing)`], ['g-built', `Built since ${Y}`], ['g-approved', 'Committed']
      , ['g-proposed', 'Proposed (in review)']];
    // One table under the bars (design audit, Group 8): the figures that were five lines of prose per bar.
    const roomWord = opt.title ? 'Room to rated' : 'Reserve (D-5-1)';
    const trows = [];
    const rowHTML = (r, X) => {
      const u = v => uCap(v, r.rated);
      const tot = r.v.reduce((a, b) => a + b, 0), committed = r.v[0] + r.v[1] + r.v[2];
      const reserve = r.rated - committed, afterProposed = r.rated - tot;
      // Too few people mapped to the sewershed (Inglewood: a village inside a large rural census
      // area) makes the flow per person meaningless; skip the population equivalents then.
      const okPop = !opt.noPeople && r.popToday >= 1000 && r.perPerson > 0;
      const people = mld => okPop ? mld * 1e6 / r.perPerson : 0;
      const eq = mld => okPop ? ` ≈ ${ppl(people(mld))}` : '';
      const popAt100 = r.perPerson > 0 ? (r.rated - r.extMld) * 1e6 / r.perPerson : 0;
      const bar = r.v.map((v, i) => v > 0 ? `<span class="gseg ${segs[i][0]}" style="flex:${(v / tot * 1000).toFixed(3)} 1 0" tabindex="0" data-tip="${esc(`${segs[i][1]}: ${capTxt(v, r.rated)} · ${pct(v, r.rated).toFixed(1)}% of ${r.capWord || 'rated'} capacity`)}"></span>` : '').join('');
      const resBox = reserve > 0 ? `<span class="cap-reserve" style="left:${X(pct(committed, r.rated))};width:${X(pct(reserve, r.rated))}" data-tip="${esc(`Uncommitted reserve: ${capTxt(reserve, r.rated)}${okPop ? ` ≈ ${fmtNum(Math.round(people(reserve) / 100) * 100)} people` : ''}`)}"></span>` : '';
      trows.push(`<tr><td>${r.name}${!opt.noPop100 && okPop ? `<small>100% ≈ ${ppl(popAt100)}</small>` : ''}</td><td class="n">${u(r.rated)}</td><td class="n"><strong>${Math.round(pct(committed, r.rated))}%</strong><small>${u(committed)}</small></td>
        <td class="n">${reserve >= 0 ? `<strong>${u(reserve)}</strong>${okPop ? `<small>≈ ${ppl(people(reserve))}</small>` : ''}` : `<strong class="over">over by ${u(-reserve)}</strong>`}</td>
        <td class="n">${afterProposed >= 0 ? `${u(afterProposed)}${okPop ? `<small>≈ ${ppl(people(afterProposed))}</small>` : ''}` : `<span class="over">short ${u(-afterProposed)}</span>`}</td>
        </tr>`);
      return `<div class="cap-row">
        <div class="cap-name">${r.name}<small>${r.capWord || 'rated'} ${u(r.rated)}${r.note ? ` · ${esc(r.note)}` : ''}</small></div>
        <div class="cap-track"><div class="cap-bar" style="width:${X(pct(tot, r.rated))}">${bar}</div>${pct(tot, r.rated) > 100 ? `<span class="cap-over" style="left:${X(100)};width:${X(pct(tot, r.rated) - 100)}" data-tip="${esc(`Beyond ${r.capWord || 'rated'}: ${capTxt(tot - r.rated, r.rated)}`)}"></span>` : ''}${resBox}<span class="cap-line trig" style="left:${X(90)}" aria-hidden="true" title="90% expansion trigger"></span><span class="cap-line" style="left:${X(100)}" aria-hidden="true"></span>
          <span class="cap-end${Math.abs(pct(tot, r.rated) - 100) < 9 ? ' near' : ''}" style="left:${X(Math.max(pct(tot, r.rated), 100))}">${Math.round(pct(tot, r.rated))}%</span></div>
      </div>`;
    };
    const body = main.map(r => rowHTML(r, S0.X)).join('');
    if (small.length) trows.push(`<tr class="grp"><td colspan="5">Small systems <small>capacity in m³/d</small></td></tr>`);
    const smallBody = small.length ? `<h4 class="cap-small-h">Small systems <span class="muted small">own scale · capacity in m³/d</span></h4>${axisHTML(S1)}${small.map(r => rowHTML(r, S1.X)).join('')}` : '';
    const table = trows.length ? `<div class="dcb-scroll"><table class="dt cap-t"><thead><tr><th>${opt.title ? 'Facility' : 'Plant'}</th><th class="n">${opt.capWord || 'Rated'}</th><th class="n" title="Existing + built + committed, % of rated">Committed</th><th class="n">${roomWord}</th><th class="n">After proposed</th></tr></thead><tbody>${trows.join('')}</tbody></table></div>${rows.some(r => !(!opt.noPeople && r.popToday >= 1000 && r.perPerson > 0)) && !opt.noPeople ? '<p class="small muted">– : too few census people in the sewershed for population equivalents (Inglewood).</p>' : ''}<p class="small muted">${estTag}</p>` : '';
    if (opt.title) return `${opt.title.trim() ? `<h3 class="svc-sub">${opt.title} <span class="muted small">${opt.sub || ''}</span></h3>` : ''}
      <div class="cap-chart"${opt.info ? ` data-info="${opt.info}"` : ''}>
        ${axisHTML(S0)}
        ${body}${smallBody}
        ${opt.legend === false ? '' : `<ul class="grow-legend"><li><span class="gsw g-base"></span>${esc(opt.baseLabel || `${Y} Census (existing)`)}</li><li><span class="gsw g-built"></span>Built since ${Y}</li><li><span class="gsw g-approved"></span>Committed</li><li><span class="gsw g-proposed"></span>Proposed (in review)</li><li><span class="gsw cap-reserve-sw"></span>Uncommitted reserve (D-5-1, to 100% of rated)</li><li><span class="cap-line-sw trig"></span>90% expansion trigger</li><li><span class="cap-line-sw"></span>${esc(opt.capLegend || 'Capacity (100%)')}</li></ul>`}
        <div class="grow-tip" hidden></div>
      </div>${table}${opt.notes ? `<details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">${opt.notes}</p></details>` : ''}`;
    return `<h3 class="svc-sub">Plant capacity ${window.PeelUtil.basisChip('mixed', SvcTab().svcOpt.ww === 'calibrated' ? 'Mixed basis: existing flow 2025 measured (annual reports); growth at Peel design criteria scaled to each plant\u2019s measured rate; rated capacity from the 2025 annual reports' : 'Mixed basis: flows at Peel design criteria; rated capacity from the 2025 annual reports')} <span class="muted small">${SvcTab().wwFlowLabel()} as a % of rated (annual average) capacity · ${SvcTab().svcOpt.ww === 'calibrated' ? 'capacity check, calibrated to 2025 flows' : 'design flows, Peel criteria'}${SvcTab().svcOpt.div === 'on' ? ' · with the 70 ML/d diversion' : ''}</span></h3>
      <div class="cap-chart" data-info="plant-capacity">
        ${axisHTML(S0)}
        ${body}${smallBody}
        <ul class="grow-legend"><li><span class="gsw g-base"></span>${Y} Census (existing) + external inflows</li><li><span class="gsw g-built"></span>Built since ${Y}</li><li><span class="gsw g-approved"></span>Committed</li><li><span class="gsw g-proposed"></span>Proposed (in review)</li><li><span class="gsw cap-reserve-sw"></span>Uncommitted reserve (D-5-1, to 100% of rated)</li><li><span class="cap-line-sw trig"></span>90% expansion trigger</li><li><span class="cap-line-sw"></span>Rated capacity (100%)</li></ul>
        <div class="grow-tip" id="cap-tip" hidden></div>
      </div>${table}
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted"><strong>Uncommitted reserve capacity</strong> (Ontario MECP Procedure D-5-1) = rated capacity − existing flow − flow committed to approved development. Here existing = ${Y} Census + built since (plus external inflows), committed = approved; proposed applications then draw on the reserve. Its population equivalent divides by the plant's flow per person today (residential + development jobs${SvcTab().svcOpt.ww === 'calibrated' ? ', calibrated to the 2025 reported flow, so it also carries existing employment and infiltration' : ' at Peel design rates'}). <em>Population at 100%</em> = (rated capacity − external inflows) ÷ that flow per person. ${SvcTab().svcOpt.ww === 'calibrated' ? '' : 'D-5-1 uses measured flows: switch to <em>Capacity check</em> for that basis.'}</p></details>`;
  }
  // ---- Phase 4: "Tightest pipes" (Plants sub-view) — the top pipes by % of full capacity
  // at build-out. The ranking itself is the tested pure helper in js/tightpipes.js
  // (window.PeelTightPipes, loaded before this script).
  let tightSeeAll = false;
  function tightestPipesHTML() {
    if (!PIPE_RESULTS) return '';   // pipe-by-pipe results are off for now
    if (!MM().SEW.data) {
      SC().loadSewers();
      return `<h3 class="svc-sub">Tightest pipes <span class="muted small">% of full capacity at build-out</span></h3><p><span class="skel" style="width:45%" role="status" aria-label="Loading the sewer network"></span></p>`;
    }
    const entries = [];
    for (let i = 0; i < MM().SEW.data.pipes.length; i++) {
      const s = SC().pipeStats(i, null);   // build-out, whatever the scenario year
      if (s.r1 == null) continue;     // no trusted capacity (missing / unreliable slope)
      entries.push({ i, r1: s.r1, mm: s.p[0], cap: s.cap, q: s.then.q, pop: Math.round(s.then.pop), plant: MM().SEW.data.plants[s.p[6]] || '' });
    }
    const top = window.PeelTightPipes.topTightPipes(entries, tightSeeAll ? 25 : 10);
    const plantOf = x => x.plant === 'Toronto' ? 'City of Toronto system' : SD().plantLabel(x.plant);
    return `<h3 class="svc-sub">Tightest pipes <span class="muted small">top ${top.length} by % of full capacity at build-out · ${fmtNum(entries.length)} pipes screened</span></h3>
      <table class="dt svc-table"><thead><tr><th>#</th><th>Pipe</th><th>Plant sewershed</th><th>Upstream people</th><th>Build-out peak flow</th><th>Full-flow capacity</th><th>% of capacity</th></tr></thead>
      <tbody>${top.map((x, k) => `<tr data-pipe="${x.i}" tabindex="0"><td>${k + 1}</td><td>${fmtNum(x.mm)} mm</td><td>${esc(plantOf(x))}</td><td>${fmtNum(x.pop)}</td><td>${uLs(x.q)}</td><td>${fmtNum(x.cap)} L/s</td><td class="${x.r1 >= 1 ? 'over' : ''}"><strong>${Math.round(x.r1 * 100)}%</strong></td></tr>`).join('')}</tbody></table>
      ${entries.length > 10 ? `<p><button type="button" class="btn small link" data-tight-all>${tightSeeAll ? 'Show top 10' : `See all (top 25 of ${fmtNum(entries.length)})`}</button></p>` : ''}
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Every Peel sanitary pipe of 300 mm+ (data/sewers.json): full-flow capacity by Manning's equation (n 0.013, published slope) against the build-out flow — existing peak dry at the plant's measured rate plus growth peak wet at Peel design criteria. Pipes whose published slope is missing or under 0.01% are excluded (capacity not trusted). A screen, not a hydraulic model. Click a row to see the pipe on the map.</p></details>`;
  }
  // ---- Phase 4: Pumping stations have their own sub-view now (#pumpstations-body): firm
  // capacity (2020 Master Plan, largest pump out of service) against the build-out flow in
  // the sewer arriving at each, at Peel design criteria (not calibrated).
  // The station table shows the 10 tightest; See all lists every station (design audit, Group 8).
  let psAll = false;
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-ps-all]')) { psAll = !psAll; SvcTab().renderSvcTab(); } });
  function renderPumpStationsTab(k) {
    DUI().ensurePumpSubTab();
    const el = $('#pumpstations-body'); if (!el) return;
    const { total, jobs, pdwf, ii } = k;
    if (!App().state.servicing.blocks) {
      el.innerHTML = `${hlP('Pumping stations are checked on the sewer arriving at each, once the blocks are loaded.')}<p class="small muted">The blocks (the Region\u2019s 40 I&amp;I sewersheds) did not load, so the stations are shown inline in the Blocks table instead.</p>`;
      return;
    }
    if (!MM().SEW.data) {
      SC().loadSewers();
      el.innerHTML = `${hlP('Pumping stations are checked on the sewer arriving at each.')}<p><span class="skel" style="width:45%" role="status" aria-label="Loading the sewer network"></span></p>`;
      return;
    }
    const ls = v => v * 1e6 / 86400;
    const st = App().state.servicing.psAreas.map(a => ({ a, sp: SD().spsOf(a), l: MA().psCum(a) })).filter(x => x.sp && x.l)
      .map(x => ({ ...x, dry: ls(pdwf(x.l)) / x.sp.firmLs * 100, wet: ls(pdwf(x.l) + ii(x.l)) / x.sp.firmLs * 100 })).sort((x, y) => y.wet - x.wet);
    const blk = a => { const b = a.outletAt && Areas().locate(App().state.servicing.drainage, a.outletAt[0], a.outletAt[1]); return b ? SD().svcById.get(b) : null; };
    const over = st.filter(x => x.wet >= 100).sort((a, b) => b.wet - a.wet);
    const rowA = (id, cls) => id ? ` class="${cls} svc-row${id === ST().svcFocus.id ? ' on' : ''}" data-svc="${esc(id)}" tabindex="0"` : ` class="${cls}"`;
    const who2 = (people, j) => `${uPop(people)}${j > 0 ? ` · ${unit(fmtNum(Math.round(j)), 'jobs')}` : ''}`;
    const maxWet = Math.max(100, ...st.map(x => x.wet));
    el.innerHTML = `${hlP(over.length ? `<strong>${over.length} pumping station${over.length === 1 ? '' : 's'}</strong> exceed${over.length === 1 ? 's' : ''} firm capacity at build-out peak wet: ${over.slice(0, 4).map(r => `${esc(DD().psName(r.a))} ≈${Math.round(r.wet)}%`).join(', ')}${over.length > 4 ? ` +${over.length - 4}` : ''}.` : 'No pumping station exceeds its firm capacity at build-out peak wet.')}
      <div class="tiles">${[
        DUI().wwTile('Pumping stations', fmtNum(st.length), '', '2020 Master Plan, firm capacity', 'drainage-area'),
        DUI().wwTile('Over firm (peak wet)', fmtNum(over.length), '', over.length ? `tightest: ${esc(DD().psName(over[0].a))} ≈${Math.round(over[0].wet)}%` : 'none at build-out', 'drainage-area'),
        ...(st[0] ? [DUI().wwTile('Tightest station', esc(DD().psName(st[0].a)), '', `peak wet ≈${Math.round(st[0].wet)}% of firm · peak dry ${Math.round(st[0].dry)}%`, 'drainage-area')] : []),
        DUI().wwTile('Basis', 'Firm', '', 'largest pump out of service', 'drainage-area'),
      ].join('')}</div>
      <h3 class="svc-sub">${window.PeelUtil.basisChip('mixed', 'Mixed basis: flows at Peel design criteria (not calibrated); firm capacity from the 2020 Master Plan (Vol. 4, Table 6)')} Build-out peak wet weather as a % of firm capacity</h3>
      <div>${st.map(x => DUI().miniBar(esc(DD().psName(x.a)), x.wet, maxWet, '%', x.wet >= 100)).join('') || '<p class="small muted">No master plan stations matched.</p>'}</div>
      <table class="dt svc-table ps-table" data-info="drainage-area"><caption>Pumping stations · firm capacity (2020 Master Plan) against the build-out flow in the sewer arriving at each, Peel design criteria</caption>
        <thead><tr><th>Pumping station</th><th>Block → plant</th><th>People + jobs upstream</th><th>Firm</th><th>Peak wet ≈ (check)</th><th>Peak dry (reference)</th></tr></thead>
        <tbody>${(psAll ? st : st.slice(0, 10)).map(x => { const b = blk(x.a); return `<tr${rowA(x.a.id, '')}><td title="${esc(SD().spsNote(x.sp))}">${esc(x.sp.name)}</td><td>${b ? esc(b.name) : '–'} → ${esc(SD().PLANT_SHORT[x.a.plant] || x.a.plant || '')}</td>
          <td>${who2(total(x.l), jobs(x.l))}</td><td>${fmtNum(x.sp.firmLs)} L/s</td><td class="${x.wet >= 100 ? 'over' : ''}">${uLs(ls(pdwf(x.l) + ii(x.l)))}<small>${Math.round(x.wet)}%</small></td><td class="muted">${uLs(ls(pdwf(x.l)))}<small>${Math.round(x.dry)}%</small></td></tr>`; }).join('')}</tbody></table>
      ${st.length > 10 ? `<p><button type="button" class="btn small" data-ps-all>${psAll ? 'Show top 10' : `See all ${st.length} stations`}</button></p>` : ''}
      ${DUI().wwInfoLine('Pumping stations: firm capacity from the 2020 Master Plan (Vol. 4, Table 6; largest pump out of service) against the build-out flow at Peel design criteria (not calibrated); the check is peak wet weather flow (PWWF) against firm capacity, the comparison the Region expands a station on. Peak dry is shown for reference only. I&amp;I at a station uses the land draining through its arriving sewer (published network, 300 mm and up), so peak wet is approximate (≈).')}`;
  }
  // ---- Phase 4: these two checks moved out of the Wastewater tab into Sources & checks
  // (Worker G renders them there); the tab keeps the capacity story. The reports-vs-model
  // HTML is cached from the last Plants render; the Master Plan comparison is rebuilt from
  // the current model when called.
  let wwReportsVsModelHTML = '';
  window.ModelChecks = window.ModelChecks || {};
  window.ModelChecks.wwReportsVsModel = () => wwReportsVsModelHTML;
  window.ModelChecks.wwMasterPlanVsTracker = () => {
    const M = App().state.svcModel, R = App().state.reports;
    if (!M || !R) return '';
    const rows = MP().MP2020.ww.map(r => { const c = M.plantCap(r.pl); return c ? MP().mpRowHTML(r.name, '', r.cap, 'rated (MP: 90%)', r.mp, r.ref, c.existing, c.committed - c.existing, c.buildout - c.committed, `${M.mode === 'calibrated' ? '2025 flows' : 'design'} + built`) : ''; }).join('');
    return `<section class="mpc" data-info="mp-compare"><h3 class="svc-sub">2020 Master Plan vs this tracker <span class="muted small">average day flow, ML/d</span></h3>${MP().mpLegend}
      <div class="table-wrap"><table class="dt mpc-table"><thead>${MP().mpHead('Build-out against the Master Plan')}</thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">Master Plan: forecast average daily flow by plant without east–west transfers (Vol. 4, Tables 7–8; G.E. Booth includes York and Toronto agreement flows). Tracker: the plant's sewershed today (${M.mode === 'calibrated' ? 'calibrated to 2025 flows' : 'design flows'}, with external inflows) + approved + proposed developments, as in the Plants tab chart. “≈ the MP's year” reads off when the Master Plan expected that flow.</p></section>`;
  };
  // ---- Phase 4: effluent exceedances moved from the Plants tab into the plant's map pop-up
  // (showLoads): one line per plant.
  function plantComplianceNote(pl) {
    const C = App().state.compliance; if (!C || !C.rows) return '';
    const yrs = C.years, span = `${yrs[0]}–${yrs[yrs.length - 1]}`;
    const k = C.rows.filter(r => r.plant === pl).reduce((t, r) => t + r.count, 0);
    return k === 0 ? `Effluent compliance: no ECA exceedances reported ${span}` : `Effluent compliance: ${k} ECA exceedance${k === 1 ? '' : 's'} reported ${span}`;
  }
  function renderPlantsTab(secs, peel, tor, k) {
    const { Y, c, total, jobs, adwf, pdwf, ii, calib, inflowsTo, censusHow } = k;
    const R = App().state.reports, rep = pl => R && R.wastewater.plants[pl];
    const inflows = R ? R.wastewater.inflows : [];
    const stages = [['census', `${Y} Census`], ['built', `+ Built since ${Y}`], ['approved', '+ Approved'], ['proposed', '+ Proposed (in review)']];
    const upTo = (l, n) => { const o = { census: 0, built: 0, approved: 0, proposed: 0, jbuilt: 0, japproved: 0, jproposed: 0, ha: l.ha }; stages.slice(0, n + 1).forEach(([s]) => { o[s] = l[s]; if (SvcTab().JOB_KEY[s]) o[SvcTab().JOB_KEY[s]] = l[SvcTab().JOB_KEY[s]]; }); return o; };
    const pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const run = (x, show) => show ? `<small>→ ${uML(x)}</small>` : '';
    const block = (title, l, f, ext, rated, note = '') => {
      let prev = { pop: 0, j: 0, a: 0, d: 0, ii: 0, w: 0 };
      const rows = [];
      const row = (label, r, n, cls = '') => {
        const inc = q => r[q] - prev[q];
        rows.push(`<tr class="${cls}"><td>${label}</td><td>${uPop(inc('pop'))}${inc('j') > 0 ? ` <small>${unit(fmtNum(Math.round(inc('j'))), 'jobs')}</small>` : ''}${n ? `<small>→ ${uPop(r.pop)}</small>` : ''}</td>
          <td>${uML(inc('a'))}${run(r.a, n)}</td><td>${uML(inc('d'))}${run(r.d, n)}</td><td>${uML(inc('ii'))}${n ? '' : `<small class="tech">${uHa(l.ha)}</small>`}</td><td class="bo">${uML(inc('w'))}${run(r.w, n)}</td><td>${rated ? pct(r.a, rated) : ''}</td></tr>`);
        prev = r;
      };
      let extSoFar = 0, n = 0;
      stages.forEach(([key, label], i) => {
        const o = upTo(l, i);
        const mk = () => ({ pop: total(o), j: jobs(o), a: adwf(o, f) + extSoFar, d: pdwf(o, f) + extSoFar, ii: ii(o), w: pdwf(o, f) + extSoFar + ii(o) });
        row(esc(label), mk(), n++);
        // External inflows come in with the existing system, after the census row.
        if (key === 'census') for (const x of ext) { extSoFar += x.mld; row(`${x.mld < 0 ? '−' : '+'} ${esc(x.name)}<small>${esc(x.detail)} · ${x.refs || SvcTab().refLink(x.ref, x.pages)}</small>`, mk(), n++, x.mld < 0 ? 'ext neg' : 'ext'); }
      });
      const r = prev;
      return `<tr class="grp"><td colspan="7">${title}${note ? ` <span class="muted small">${note}</span>` : ''}</td></tr>${rows.join('')}
        <tr class="tot"><td>= Build-out</td><td>${uPop(r.pop)}${r.j > 0 ? ` <small>${unit(fmtNum(Math.round(r.j)), 'jobs')}</small>` : ''}</td><td>${uML(r.a)}</td><td>${uML(r.d)}<small class="tech">M ${r.pop > 0 ? D.residentialPeaking(r.pop, c.wastewater).toFixed(2) : '–'}</small></td><td>${uML(r.ii)}</td><td class="bo">${uML(r.w)}</td><td>${rated ? pct(r.a, rated) : ''}</td></tr>
        <tr class="plant-bar"><td colspan="7">${SvcTab().svcBar(l)}</td></tr>`;
    };
    // Comparison with the 2025 reports.
    // Planned east-to-west diversion: a fixed transfer of average flow (and the same amount off
    // the peaks) from G.E. Booth to Clarkson, when switched on; the Peel total is unchanged.
    const dv = R && R.wastewater.diversion, divOn = !!(dv && SvcTab().svcOpt.div === 'on');
    const dvRefs = dv ? dv.refs.map(([r, pg]) => SvcTab().refLink(r, pg)).join('; ') : '';
    const divTo = pl => !divOn ? [] : pl === dv.from ? [{ name: `Diversion to ${SD().plantLabel(dv.to)} (planned ${dv.when})`, detail: dv.detail, mld: -dv.mld, refs: dvRefs }]
      : pl === dv.to ? [{ name: `Diversion from ${SD().plantLabel(dv.from)} (planned ${dv.when})`, detail: dv.detail, mld: dv.mld, refs: dvRefs }] : [];
    const divMld = pl => divTo(pl).reduce((t, x) => t + x.mld, 0);
    const ratedOf = pl => rep(pl) ? rep(pl).ratedMLd : 0;
    const peelFc = secs.length ? secs.reduce((t, x) => t + adwf(x.sum, x.f), 0) / Math.max(1e-9, adwf(peel)) : 1;
    // Capacity chart: each plant's average dry weather flow as a % of its rated (annual average)
    // capacity, stacked existing → built → approved → proposed, with the uncommitted reserve
    // (rated − existing − built − approved, MECP Procedure D-5-1) and its population equivalent.
    let chart = '';
    if (R) {
      const rows = [];
      const mkRow = (name, l, f, extMld, rated, note) => {
        if (!(rated > 0)) return;
        const a = n => adwf(upTo(l, n), f) + extMld;
        const v = [a(0), a(1) - a(0), a(2) - a(1), a(3) - a(2)];
        const today = upTo(l, 1), popToday = total(today);
        const perPerson = popToday > 0 ? adwf(today, f) * 1e6 / popToday : 0;   // L/person/d, incl. development jobs
        rows.push({ name, rated, v, extMld, perPerson, popToday, note });
      };
      // Each plant from the one capacity function (js/capacity.js): the same layers, reserve and %
      // as the Overview, the DC tab, the scope card and the development panel (SPEC 1.4).
      const capRow = (name, k, note) => {
        if (!k || !(k.rated > 0)) return;
        rows.push({ name, rated: k.rated, v: [k.census, k.existing - k.census, k.committed - k.existing, k.buildout - k.committed].map(v => Math.max(0, v)), extMld: k.ext || 0, perPerson: k.perPerson, popToday: k.popToday, note });
      };
      const caps = secs.map(x => ({ x, k: window.PeelCapacity && window.PeelCapacity.of(`plant:${x.pl}`) }));
      for (const { x, k } of caps) if (k) capRow(esc(rep(x.pl) ? rep(x.pl).name : SD().plantLabel(x.pl)), k); else mkRow(esc(rep(x.pl) ? rep(x.pl).name : SD().plantLabel(x.pl)), x.sum, x.f, inflowsTo(x.pl) + divMld(x.pl), ratedOf(x.pl));
      if (secs.length > 1) mkRow('All Peel plants', peel, peelFc, inflows.reduce((t, e) => t + e.mld, 0), secs.reduce((t, x) => t + ratedOf(x.pl), 0), 'incl. the City of Toronto inflow');
      chart = capChartHTML(rows, Y);
      // Horizon years: existing today, approved and proposed phased in over the set years.
      const hzPlants = secs.filter(x => ratedOf(x.pl) > 0).map(x => {
        const a = n => adwf(upTo(x.sum, n), x.f);
        const today = upTo(x.sum, 1), popToday = total(today);
        return { key: { Lakeview: 'booth', Clarkson: 'clarkson', Inglewood: 'inglewood' }[x.pl] || 'booth', name: SD().PLANT_SHORT[x.pl], full: rep(x.pl) ? rep(x.pl).name : SD().plantLabel(x.pl), rated: ratedOf(x.pl),
          existing: a(1) + inflowsTo(x.pl), A: a(2) - a(1), P: a(3) - a(2), div: divMld(x.pl), perPerson: popToday > 0 ? adwf(today, x.f) * 1e6 / popToday : 0, popShare: popToday };
      });
      chart += capHorizonHTML(hzPlants, dv);
    }
    // Phase 4: the 2025-reports comparison moved out of the tab into Sources & checks —
    // cache it here for ModelChecks.wwReportsVsModel (Worker G renders it there).
    wwReportsVsModelHTML = '';
    if (R) {
      const rows = secs.map(x => {
        const p = rep(x.pl); if (!p) return '';
        const cb = calib[x.pl], todayDesign = cb.today + inflowsTo(x.pl), bo = adwf(x.sum, x.f) + inflowsTo(x.pl) + divMld(x.pl);
        return `<tr><td>${esc(p.name)}<small>${SvcTab().refLink(p.ref, p.pages)}</small></td><td>${uCap(p.ratedMLd, p.ratedMLd)}</td><td>${uCap(p.avgMLd, p.ratedMLd)}<small>${p.pctOfCapacity}% of capacity</small></td><td>${uCap(p.maxDayMLd, p.ratedMLd)}<small>${esc(p.maxDayMonth)}${p.bypasses ? ` · ${p.bypasses} bypasses, ${fmtNum(p.bypassML)} ML` : ''}</small></td>
          <td>${uCap(todayDesign, p.ratedMLd)}<small>${pct(todayDesign, p.avgMLd)} of reported</small></td><td>${cb.f ? `×${cb.f.toFixed(2)}` : '–'}</td><td class="bo">${uCap(bo, p.ratedMLd)}<small>${pct(bo, p.ratedMLd)} of capacity${SvcTab().svcOpt.ww === 'calibrated' ? ', calibrated' : ''}${divMld(x.pl) ? `, ${divMld(x.pl) > 0 ? '+' : '−'}${fmt1(Math.abs(divMld(x.pl)))} ML/d diversion` : ''}</small></td></tr>`;
      }).join('');
      const tor = inflows.find(x => !x.plant);
      const sumRep = secs.reduce((t, x) => t + (rep(x.pl) ? rep(x.pl).avgMLd : 0), 0), sumRated = secs.reduce((t, x) => t + (rep(x.pl) ? rep(x.pl).ratedMLd : 0), 0);
      const sumToday = secs.reduce((t, x) => t + calib[x.pl].today + inflowsTo(x.pl), 0) + (tor ? tor.mld : 0);
      const sumBo = secs.reduce((t, x) => t + adwf(x.sum, x.f) + inflowsTo(x.pl), 0) + (tor ? tor.mld : 0);
      wwReportsVsModelHTML = `<h3 class="svc-sub">2025 annual reports vs. the model <span class="muted small">annual average flow, ML/d</span></h3>
        <table class="dt svc-table rep-table" data-info="plant-reports"><thead><tr><th>Plant</th><th>Rated capacity<br>(annual average)</th><th>2025 reported<br>average</th><th>2025 highest day</th><th>Model today<br>(design criteria)</th><th>Calibration<br>factor</th><th>Model<br>build-out</th></tr></thead>
        <tbody>${rows}<tr class="tot"><td>Peel plants${tor ? `<small>model includes the City of Toronto inflow (${uML(tor.mld)}, plant not stated)</small>` : ''}</td><td>${uML(sumRated)}</td><td>${uML(sumRep)}<small>${pct(sumRep, sumRated)} of capacity</small></td><td></td><td>${uML(sumToday)}<small>${pct(sumToday, sumRep)} of reported</small></td><td></td><td class="bo">${uML(sumBo)}<small>${pct(sumBo, sumRated)} of capacity</small></td></tr></tbody></table>
        <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Model today = ${Y} Census + built since, residential + development jobs, plus external inflows known to reach the plant. The plants also treat existing employment, institutional and commercial flow, dry-weather infiltration and inflows the model does not hold, so the design-criteria model is expected to run low; the calibration factor is reported ÷ model and is applied in <em>Capacity check</em> mode. ${R.wastewater.plants.Lakeview ? esc(R.wastewater.plants.Lakeview.notes.slice(1).join(' ')) : ''}</p></details>`;
    }
    const peelExt = inflows;
    const peelF = secs.length ? secs.reduce((t, x) => t + adwf(x.sum, x.f), 0) / Math.max(1e-9, adwf(peel)) : 1;
    // Phase 4: Plants sub-view tiles — each plant's build-out flow as a % of rated capacity.
    const tileRows = secs.filter(x => ratedOf(x.pl) > 0).map(x => {
      const k = window.PeelCapacity && window.PeelCapacity.of(`plant:${x.pl}`);
      if (k) return { name: SD().PLANT_SHORT[x.pl], pctBo: k.pctBuildout, rated: k.rated };
      const rated = ratedOf(x.pl), bo = adwf(x.sum, x.f) + inflowsTo(x.pl) + divMld(x.pl);
      return { name: SD().PLANT_SHORT[x.pl], pctBo: rated > 0 ? bo / rated * 100 : 0, rated };
    });
    const allRated = tileRows.reduce((t, r) => t + r.rated, 0);
    const allBo = secs.reduce((t, x) => t + adwf(x.sum, x.f) + inflowsTo(x.pl), 0) + inflows.reduce((t, e) => t + e.mld, 0);
    $('#plants-body').innerHTML = `${SCREEN_NOTE}<div class="svc-head">${SvcTab().svcLegend(Y).replace(' · click a row to zoom to it on the map', '')}<div class="svc-switches">${SvcTab().optSwitch('tech', 'Columns', [['off', 'Simple'], ['on', 'Engineering']])}</div></div>
      ${divOn ? `<p class="small cal-note"><strong>Diversion on:</strong> ${fmt1(dv.mld)} ML/d moved from ${esc(SD().plantLabel(dv.from))} to ${esc(SD().plantLabel(dv.to))} at every growth layer, taken off its average and its peaks alike (a fixed transfer); the Peel total is unchanged. ${esc(dv.detail)}. ${dvRefs}.</p>` : ''}
      <div class="tiles">${[
        ...tileRows.map(r => DUI().wwTile(esc(r.name), String(Math.round(r.pctBo)), '%', `of rated at build-out · rated ${capTxt(r.rated, r.rated)}${isSmallSystem(r.rated) ? ' · small system' : ''}`, 'plant-capacity')),
        ...(tileRows.length > 1 && allRated > 0 ? [DUI().wwTile('All Peel plants', String(Math.round(allBo / allRated * 100)), '%', 'of rated at build-out', 'plant-capacity')] : []),
      ].join('')}</div>
      ${chart}
      <div id="tight-pipes">${tightestPipesHTML()}</div>
      <details class="svc-more"><summary class="svc-sub">Plant inflow by growth layer <span class="muted small">(the build-up behind the bars: table)</span></summary>
      <table class="dt svc-table plants-table" data-info="tab-plants"><caption>Wastewater treatment plant inflow · ML/d; each layer is what it adds, the running total below${SvcTab().svcOpt.ww === 'calibrated' ? ' · capacity check (calibrated to 2025 flows)' : ''}</caption>
      <thead><tr><th>Layer</th><th>Population</th><th>Average dry<br>weather</th><th>Peak dry<br>weather</th><th>I&amp;I</th><th>Peak wet<br>weather</th><th>Average<br>% of rated</th></tr></thead>
      <tbody>${secs.map(x => block(esc(SD().plantLabel(x.pl)), x.sum, x.f, [...peelExt.filter(e => e.plant === x.pl), ...divTo(x.pl)], ratedOf(x.pl), x.f !== 1 ? `calibrated ×${x.f.toFixed(2)}` : '')).join('')}
        ${block(`Peel total (${secs.map(x => SD().PLANT_SHORT[x.pl]).join(' + ')})`, peel, peelF, peelExt, secs.reduce((t, x) => t + ratedOf(x.pl), 0))}
        ${tor.rows.length ? block(esc(SD().plantLabel('Toronto')), tor.sum, 1, [], 0, 'Malton · not in the Peel total') : ''}</tbody></table></details>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Each plant's whole sewershed (all catchments traced to it): ${Y} Census + external inflows + built since census day + approved + proposed (in review) = build-out. Residential ${c.wastewater.avg} L/cap/d, employment ${c.employment.wastewater} L/emp/d (jobs on development sites). Peak dry weather = residential average × Harmon M on the population + employment average × its peaking factor; external inflows are added at their annual average. Because peaking is not additive, a growth layer's figure is the increase in the plant's peak when it is added (→ running total). I&amp;I = ${c.wastewater.infiltration} L/s/ha on the traced drainage area, counted with the existing system; peak wet weather = peak dry + I&amp;I. Average % of rated = average dry weather ÷ the plant's rated (annual average) capacity. ${Y} Census ${censusHow} (Inglewood's village sits in a large rural dissemination area, so its census share is small; calibration corrects its flow).</p></details>
      ${DUI().wwInfoLine('Each plant\u2019s whole sewershed (all catchments traced to it): average dry weather flow against rated capacity; horizon years phase approved then proposed growth in. The 2025-report comparison and the Master Plan comparison moved to Sources &amp; checks.')}`;
    $('#plants-note').textContent = `${Y} Census baseline (follows the timeline) · flows reaching each wastewater treatment plant`;
  }
  // References (Breakdown & criteria tab): the Region's 2025 annual reports used for comparison.
  // References HTML (shared by the Settings tab and the Sources & checks gear page).
  function refsHTML() {
    const R = App().state.reports;
    if (!R) return '';
    return `<h3 class="svc-sub">References <span class="muted small">standards, guidelines and reports behind the criteria and comparisons</span></h3>
      ${R.standards ? `<h4 class="ref-h">Design criteria and guidelines</h4><ul class="ref-list">${R.standards.map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a><div class="small muted">${esc(r.used)}</div></li>`).join('')}</ul>` : ''}
      <h4 class="ref-h">Region of Peel ${R.year} annual reports <span class="muted small">(Water, Wastewater and Plants comparisons)</span></h4>
      <ul class="ref-list">${Object.values(R.reports).map(r => `<li><a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a></li>`).join('')}</ul>
      <p class="small muted">Index pages: <a href="${esc(R.indexPages.wastewater)}" target="_blank" rel="noopener">wastewater annual reports</a> · <a href="${esc(R.indexPages.water)}" target="_blank" rel="noopener">water quality reports</a>. ${esc(R.note)}</p>`;
  }
  function renderRefs() {
    const box = $('#d-refs');
    if (!box) return;
    const html = refsHTML();
    if (!html) return;
    box.hidden = false;
    box.innerHTML = html;
  }

  const api = {
    hz, renderSvcScoped, capChartHTML, renderPumpStationsTab, renderPlantsTab,
    renderRefs, refsHTML, tightestPipesHTML, plantComplianceNote,
    getSavedSubs() { return savedSubs; },
    setSavedSubs(v) { savedSubs = v; },
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSvcPlants = api;
})(typeof window !== 'undefined' ? window : globalThis);
