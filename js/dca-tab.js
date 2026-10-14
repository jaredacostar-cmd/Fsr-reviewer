(function (root) {
  'use strict';
  const { $, esc, fmtNum, fmt1, roundPop, skel, hlP, CSV_DISCLAIMER, store, fmtMoney } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const PE = () => window.PeelExports;
  const MM = () => window.PeelMapMarkers;
  const MP = () => window.PeelMasterPlan;
  const DC = () => window.PeelDcCost;
  const DI = () => window.PeelDcInfra;
  const ST = () => window.PeelSewerTrace;
  const SD = () => window.PeelSvcData;
  const DD = () => window.PeelDevDetail;
  const DV = () => window.PeelDevVerdict;
  const SvcTab = () => window.PeelSvcTab;
  const MA = () => window.PeelMapAnalysis;
  const Nav = () => window.PeelDevNav;
  const SC = () => window.PeelSewerCap;
  const SP = () => window.PeelSvcPlants;

  // ---- DC tab sub-views (Phase 4): Timing / Recommendations / Funding ---------------------------
  // Worker A owns the sub-view chrome (dcSub state, data-dcasub buttons, the three panes); the
  // renderers below fill #dca-timing-body / #dca-rec-body / #dca-funding-body. The single scenario
  // bar replaces the old per-tab scenario stamp line (no stampHTML call remains in this tab).
  function renderDca() {
    const bodies = [$('#dca-timing-body'), $('#dca-rec-body'), $('#dca-funding-body')];
    const legacy = bodies.every(b => !b) ? $('#dca-body') : null;
    if (!bodies.some(Boolean) && !legacy) return;
    const set = (i, html) => { const el = bodies[i] || (i === 0 ? legacy : null); if (el) el.innerHTML = html; };
    if (!App().state.svcModel || !App().state.dcInfra) { for (let i = 0; i < 3; i++) set(i, skel('Loading the servicing model and the 2026 DC program')); return; }
    if (!MM().SEW.data) { for (let i = 0; i < 3; i++) set(i, skel('Loading the sewer network')); SC().loadSewers().then(d => { if (d) renderDca(); }); return; }
    const p = DV().scopedDev();
    if (p) {
      // The site's DC brief; sewer-path and plant-reserve numbers live on the Wastewater tab.
      const st = DD().statusOf(p), f = SD().svcFacts(p);
      st.works = st.works || DI().devWorks(p, f);
      const brief = `<p class="small muted">DC analysis for <strong>${esc(p.title)}</strong>.</p>` + DD().devBriefHTML(p, st, f, 'dc', { noWwNeeds: true });
      set(0, brief); DV().scopeBriefIds(bodies[0] || legacy);
      const note = `<p class="small muted">Region-wide DC recommendations and the funding screen are shown when no site is scoped.</p>`;
      set(1, note); set(2, note);
      return;
    }
    const R = DC().dcAnalysis();
    set(0, renderDcaTiming(R)); set(1, renderDcaRec(R)); set(2, renderDcaFunding(R));
  }
  function dcaTimingRow(r, years, atY, pp, uu) {
    const t = r.rows.slice().sort((a, b) => b.bo - a.bo)[0];
    return `<tr class="dca-row ${DC().REC[r.rec][0]}" data-dca="${esc(r.key)}" tabindex="0">
      <td>${r.sys === 'water' ? '💧 ' : ''}${esc(r.name)}<small>${r.status === 'approved' ? 'approved 2026' : r.status === 'proposed' ? 'proposed' : ''}</small></td>
      <td>${r.y || '–'}</td>
      <td>${r.rows.length ? esc(t.c.name) + (r.rows.length > 1 ? ` <small>+${r.rows.length - 1} more</small>` : '') : ''}${r.conn.length ? `<small>${fmtNum(r.conn.length)} development${r.conn.length === 1 ? ' connects' : 's connect'} to it</small>` : ''}</td>
      <td>${r.outY ? (r.outY === MM().THIS_YEAR ? 'already' : `≈${r.outY}`) : r.cons.length ? `after ${SP().hz.end}` : '–'}</td>
      <td>${atY(r) > 0 ? `${pp(atY(r))} people<small>≈${uu(atY(r))} units</small>` : '<span class="muted">none</span>'}</td>
      <td>${r.bo > 0 ? `<strong>${pp(r.bo)}</strong> people<small>≈${uu(r.bo)} units${r.revRisk ? ` · ${fmtMoney(r.revRisk)} DCs` : ''}</small>` : '<span class="muted">none</span>'}</td>
      <td>${DC().costCell(r)}</td>
      <td><span class="dca-rec">${DC().REC[r.rec][1]}</span><small>${esc(r.why)}</small></td></tr>
      ${MP().DCA.open.has(r.key) ? `<tr class="dca-detail"><td colspan="8">${dcaDetail(r, years)}</td></tr>` : ''}`;
  }
  function renderDcaTiming(R) {
    const years = R.years, yi = MA().getCapYear() == null ? -1 : years.indexOf(MA().getCapYear()), atY = r => yi >= 0 ? r.ys[yi] : r.bo;
    const yrLabel = MA().getCapYear() == null ? 'build-out' : MA().getCapYear();
    const n = k => R.list.filter(r => r.rec === k).length;
    const pp = v => fmtNum(roundPop(v)), uu = v => fmtNum(Math.round(v / R.ppu));
    const adv = R.list.filter(r => r.rec === 'advance'), big = R.list.slice().sort((a, b) => b.bo - a.bo)[0];
    const hl = `Across <strong>${fmtNum(R.list.length)} DC projects</strong>${adv.length ? `, <strong>${adv.length}</strong> come${adv.length === 1 ? 's' : ''} online after the capacity ${adv.length === 1 ? 'it relieves' : 'they relieve'} runs out — bring ${adv.length === 1 ? 'it' : 'them'} forward` : ' — every project comes online before the capacity it relieves runs out'}${big && big.bo > 0 ? `; cancelling <strong>${esc(big.name)}</strong> would hold back the most growth: ≈${pp(big.bo)} people (≈${uu(big.bo)} units) by build-out` : ''}.`;
    const list = MP().DCA.sort === 'impact' ? R.list.slice().sort((a, b) => b.bo - a.bo) : MP().DCA.sort === 'cost' ? R.list.slice().sort((a, b) => (a.perP ?? Infinity) - (b.perP ?? Infinity)) : MP().DCA.sort === 'year' ? R.list.slice().sort((a, b) => (a.y || 9999) - (b.y || 9999)) : R.list;
    const shown = MP().DCA.timingAll ? list : list.slice(0, 10);
    return `${hlP(hl)}
      <div class="dca-sum">
        <div class="dca-tile"><b>${fmtNum(R.list.length)}</b><span>DC projects relieve a capacity constraint or serve new development</span></div>
        <div class="dca-tile ${adv.length ? 'warn' : ''}"><b>${adv.length}</b><span>come online after the capacity runs out: advance</span></div>
        <div class="dca-tile"><b>${n('keep') + n('defer')}</b><span>keep (${n('defer')} could follow later)</span></div>
        <div class="dca-tile ${R.baseBo > 0 ? 'warn' : ''}"><b>${pp(R.baseBo)}</b><span>people (≈${uu(R.baseBo)} units) held back at build-out even with every project as scheduled</span></div>
      </div>
      ${DC().dcaTimingChart(R.list.slice().sort((a, b) => b.bo - a.bo).slice(0, 10))}
      <div class="dca-tools"><label class="small dca-yr">Year <select data-dca-year aria-label="Year for the impact column (same as the map's Demand year)">${years.map(y => `<option value="${y}"${MA().getCapYear() === y ? ' selected' : ''}>${y}</option>`).join('')}<option value=""${MA().getCapYear() == null ? ' selected' : ''}>Build-out</option></select></label><span class="seg">${[['impact', 'Largest impact'], ['cost', 'Cost per person'], ['rec', 'By recommendation'], ['year', 'By year']].map(([k, t]) => `<button type="button" class="btn small${MP().DCA.sort === k ? ' on' : ''}" data-dca-sort="${k}">${t}</button>`).join('')}</span>
        <button type="button" class="btn small" data-dca-csv>CSV</button><span class="muted small">Impact at the Demand year (${esc(String(yrLabel))}) and at build-out · tap a row for its timeline</span></div>
      <table class="dt dca-table"><thead><tr><th>DC project</th><th>Online</th><th>Relieves</th><th>Capacity runs out</th><th>If cancelled · ${esc(String(yrLabel))}</th><th>If cancelled · build-out</th><th>Cost (2020$)</th><th>Recommendation</th></tr></thead><tbody>
        ${shown.map(r => dcaTimingRow(r, years, atY, pp, uu)).join('')}
      </tbody></table>
      ${list.length > 10 ? `<p><button type="button" class="btn small" data-dcatiming-all>${MP().DCA.timingAll ? 'Show top 10' : `See all ${list.length} projects`}</button></p>` : ''}
      ${DC().dcaInfo(`Each capacity constraint from DC timing (sanitary sewer groups at full-pipe capacity, pumping stations at firm capacity, plants at ${Math.round(MP().PLANT_TRIGGER * 100)}% of rated, the water treatment systems and supply into the upper pressure zones) is replayed year by year, ${MM().THIS_YEAR}–${SP().hz.end}: approved growth over ${SP().hz.aYears} years from ${SP().hz.aStart}, proposed over ${SP().hz.pYears} from ${SP().hz.pStart} (Horizon years). Cancelling one project holds back the growth above the remaining capacity — people at each constraint's own rate (Peel design criteria), units at ${R.ppu.toFixed(2)} persons per unit; an existing overload isn't counted. Constraints in series along a path count the largest, not the sum; developments outside the existing network within ${fmtNum(DI().DC_CONNECT_M)} m of a new main count in full. Data: 2026 DC capital maps · 2020 DC Background Study costs · ${R.nCons} constraints analysed (storage and constraints flagged “check the data” are out).`)}`;
  }
  function renderDcaRec(R) {
    if (!App().state.dcCosts || !App().state.dcCosts.unitCost) return `<p class="small muted">DC cost data is still loading.</p>`;
    const B = DC().dcaBudget(DC().DCB.budget, DC().DCB.years), pp = v => fmtNum(roundPop(v)), uu = v => fmtNum(Math.round(v / B.ppu));
    const merged = DC().dcaMergeRecs(B);
    const counts = { all: merged.length, keep: 0, defer: 0 };
    for (const x of merged) counts[x.dec === 'Keep' ? 'keep' : 'defer']++;
    const rows = merged.filter(x => MP().DCA.recFilter === 'all' || x.dec.toLowerCase() === MP().DCA.recFilter);
    const shown = MP().DCA.recAll ? rows : rows.slice(0, 10);
    const hl = `With <strong>${fmtMoney(DC().DCB.budget)}</strong> of DC funding over ${DC().DCB.years} years (${MM().THIS_YEAR}–${B.end}) against a <strong>${fmtMoney(B.total)}</strong> program: keep <strong>${B.keep.length}</strong> (${fmtMoney(B.spent)}), defer <strong>${B.defer.length}</strong> (${fmtMoney(B.total - B.spent)})${B.upper > 0 ? ` — deferring them holds back ≈<strong>${pp(B.lower)}–${pp(B.upper)} people</strong> (≈${uu(B.lower)}–${uu(B.upper)} units) of the growth expected by ${B.end}` : B.defer.length ? ` — no growth expected by ${B.end} relies on the deferred projects` : ` — every project in the window is funded`}.`;
    return `${hlP(hl)}
      <div class="dca-sum">
        <div class="dca-tile"><b>${B.keep.length}</b><span>projects kept (${fmtMoney(B.spent)}${B.committed ? `, ${fmtMoney(B.committed)} already committed` : ''})</span></div>
        <div class="dca-tile"><b>${B.defer.length}</b><span>deferred (${fmtMoney(B.total - B.spent)})</span></div>
        <div class="dca-tile ${B.upper > 0 ? 'warn' : ''}"><b>${B.upper > 0 ? `${pp(B.lower)}–${pp(B.upper)}` : '0'}</b><span>people of growth held back by ${B.end} if every deferred project is deferred</span></div>
        <div class="dca-tile"><b>${fmtMoney(DC().DCB.budget)}</b><span>DC funding over ${DC().DCB.years} years (${MM().THIS_YEAR}–${B.end})</span></div>
      </div>
      ${DC().dcaRecChart(merged, B.end)}
      <div class="dca-tools"><span class="seg" role="group" aria-label="Filter by recommendation">${[['all', 'All'], ['keep', 'Keep'], ['defer', 'Defer']].map(([k, t]) => `<button type="button" class="btn small${MP().DCA.recFilter === k ? ' on' : ''}" data-dcarec-filter="${k}">${t} (${counts[k]})</button>`).join('')}</span>
        <button type="button" class="btn small" data-dcb-csv>CSV</button><span class="muted small">Keep/defer screen for the ${MM().THIS_YEAR}–${B.end} window</span></div>
      <div class="dcb-scroll"><table class="dt dcb-t"><thead><tr><th>Recommendation</th><th>Project</th><th>Online</th><th>DC cost 2026$</th><th>Growth by ${B.end}</th><th>$ / person</th><th>Why</th></tr></thead><tbody>
        ${shown.map(x => DC().dcaRecRow(x, B, pp, uu)).join('') || `<tr><td colspan="7" class="muted">No projects in this screen.</td></tr>`}
      </tbody></table></div>
      ${rows.length > 10 ? `<p><button type="button" class="btn small" data-dcarec-all>${MP().DCA.recAll ? 'Show top 10' : `See all ${rows.length} projects`}</button></p>` : ''}
      ${DC().dcaInfo(`A funding screen for discussion, not a capital plan: projects coming online ${MM().THIS_YEAR}–${B.end} (later ones are outside the window). DC cost = DC-recoverable share in 2026$ — the 2020 study's costs indexed ×${App().state.dcCosts.index2026.wastewater.toFixed(2)} (wastewater) / ×${App().state.dcCosts.index2026.water.toFixed(2)} (water) by the Region's DC rate indexing; ${Math.round(B.est * 100)}% of the program cost is estimated. Order: committed projects first, then growth let through by ${B.end} per dollar. Combined held-back range: from the largest single constraint left short to the sum of the deferred projects' own impacts (they overlap where they relieve the same path). Condition, regulatory and I&amp;I drivers, phasing within projects and non-DC funding are not in it.`)}`;
  }
  function renderDcaFunding(R) {
    if (!App().state.dcCosts || !App().state.dcCosts.unitCost) return `<p class="small muted">DC cost data is still loading.</p>`;
    const B = DC().dcaBudget(DC().DCB.budget, DC().DCB.years), pp = v => fmtNum(roundPop(v)), uu = v => fmtNum(Math.round(v / B.ppu));
    const curve = DC().dcaCurve(B);
    const hl = `The <strong>${B.rows.length}-project</strong> DC program coming online ${MM().THIS_YEAR}–${B.end} costs <strong>${fmtMoney(B.total)}</strong> in 2026 DC-recoverable dollars; the <strong>${fmtMoney(DC().DCB.budget)}</strong> funding screen keeps <strong>${B.keep.length}</strong> and defers <strong>${B.defer.length}</strong>.`;
    const byCost = B.rows.slice().sort((a, b) => b.cost - a.cost);
    const shown = MP().DCA.fundAll ? byCost : byCost.slice(0, 10);
    return `<section data-info="dca-budget">${hlP(hl)}
      <div class="dca-sum">
        <div class="dca-tile"><b>${fmtMoney(B.total)}</b><span>DC-recoverable program cost, 2026$ (${B.rows.length} projects, ${MM().THIS_YEAR}–${B.end})</span></div>
        <div class="dca-tile"><b>${fmtMoney(DC().DCB.budget)}</b><span>DC funding over the next ${DC().DCB.years} years</span></div>
        <div class="dca-tile"><b>${fmtMoney(B.spent)}</b><span>spent on the ${B.keep.length} kept projects${B.committed ? ` (${fmtMoney(B.committed)} already committed)` : ''}</span></div>
        ${B.spent <= DC().DCB.budget ? `<div class="dca-tile"><b>${fmtMoney(DC().DCB.budget - B.spent)}</b><span>left over</span></div>` : `<div class="dca-tile warn"><b>${fmtMoney(B.spent - DC().DCB.budget)}</b><span>over the budget on committed work alone</span></div>`}
      </div>
      <div class="dcb-tools"><label class="small">DC funding over the next <input type="number" min="1" max="30" step="1" value="${DC().DCB.years}" data-dcb-years aria-label="Years"> years: $<input type="number" min="0.1" step="0.1" value="${(DC().DCB.budget / 1e9).toFixed(1)}" data-dcb-budget aria-label="Budget in billions"> B</label>
        <span class="seg">${[1e9, 5e9].map(b => `<button type="button" class="btn small${DC().DCB.budget === b ? ' on' : ''}" data-dcb="${b}">$${b / 1e9} B</button>`).join('')}<button type="button" class="btn small${DC().DCB.budget >= B.total && DC().DCB.budget !== 1e9 && DC().DCB.budget !== 5e9 ? ' on' : ''}" data-dcb="${Math.ceil(B.total / 1e8) * 1e8}">Whole program</button></span></div>
      ${DC().dcaCurveChart(curve, B)}
      <h3 class="sub-title">Most expensive projects (DC cost, 2026$)</h3>
      <div class="dcb-scroll"><table class="dt dcb-t"><thead><tr><th>Project</th><th>Online</th><th>DC cost 2026$</th><th>Estimated</th><th>Growth it carries by ${B.end}</th></tr></thead><tbody>
        ${shown.map(r => `<tr><td>${r.sys === 'water' ? '💧 ' : ''}${esc(r.name)}${r.committed ? '<small>committed (approved 2026)</small>' : ''}</td><td>${r.y || '–'}</td><td>${r.cost ? fmtMoney(r.cost) : '<span class="muted">not costed</span>'}</td><td>${r.c ? `${Math.round(r.c.est * 100)}%` : '–'}</td><td>${r.v > 0 ? `${pp(r.v)} people<small>≈${uu(r.v)} units</small>` : '<span class="muted">none</span>'}</td></tr>`).join('')}
      </tbody></table></div>
      ${byCost.length > 10 ? `<p><button type="button" class="btn small" data-dcafund-all>${MP().DCA.fundAll ? 'Show top 10' : `See all ${byCost.length} projects`}</button></p>` : ''}
      ${B.later.length ? `<p class="small dcn-gap-t"><strong>Outside the window:</strong> ${B.later.map(r => `${esc(r.name)} (online ${r.y}, capacity runs out ≈${r.outY === MM().THIS_YEAR ? 'now' : r.outY}${r.cost ? `, ≈${fmtMoney(r.cost)}` : ''})`).join('; ')} ${B.later.length === 1 ? 'is' : 'are'} scheduled after ${B.end} but needed sooner; bringing ${B.later.length === 1 ? 'it' : 'them'} into the window needs ≈${fmtMoney(B.later.reduce((t, r) => t + r.cost, 0))} more.</p>` : ''}
      ${DC().dcaInfo(`DC cost = DC-recoverable share in 2026$: the 2020 DC Background Study's costs indexed by the Region's DC rate indexing (×${App().state.dcCosts.index2026.wastewater.toFixed(2)} wastewater / ×${App().state.dcCosts.index2026.water.toFixed(2)} water); ${Math.round(B.est * 100)}% of the program cost is estimated — mains not in the 2020 study at a cost per metre fitted to its priced mains by diameter, facilities by their 2020 project or the median of their kind. DC revenue at risk: held-back units × the average water + wastewater DC per unit for the approved and proposed unit mix${B.rate ? ` (≈${fmtMoney(B.rate)})` : ''}, before credits, exemptions and discounts.`)}
    </section>`;
  }
  function dcaDetail(r, years) {
    const pp = v => fmtNum(roundPop(v));
    return `<div class="dca-d">
      ${r.rows.slice().sort((a, b) => b.bo - a.bo).map(x => `<div class="dca-c"><p class="small"><strong>${esc(x.c.name)}</strong> · ${esc(x.c.sub)} · existing ${x.c.unit === 'L/s' ? fmtNum(Math.round(x.c.cap)) : fmt1(x.c.cap)} ${esc(x.c.unit)}${x.ad ? ` · adds ≈${x.c.unit === 'L/s' ? fmtNum(Math.round(x.ad.add)) : fmt1(x.ad.add)} ${esc(x.c.unit)} (${esc(x.ad.how)})` : ''}</p>
        <p class="small">Diverted to it at build-out: <strong>${x.c.unit === 'L/s' ? fmtNum(Math.round(x.divBo)) : fmt1(x.divBo)} ${esc(x.c.unit)}</strong>${x.bo > 0 ? ` · if cancelled, <strong>${pp(x.bo)} people</strong> held back here by build-out` : ' · if cancelled, no growth held back here'}${x.gapBase ? ' · <span class="dcn-gap-t">short even with it on schedule</span>' : ''}</p>
        ${DC().dcaChart({ ...x, key: r.key, y: r.y }, years)}</div>`).join('')}
      ${r.conn.length ? `<p class="small"><strong>${fmtNum(r.conn.length)} development${r.conn.length === 1 ? '' : 's'}</strong> outside the existing network would connect to it (${pp(r.cbo)} people, ${fmtNum(Math.round(r.cu))} units): without it they have no service. ${r.conn.slice().sort((a, b) => b.e.population - a.e.population).slice(0, 6).map(x => `<button type="button" class="btn small link" data-dca-dev="${esc(x.p.key)}">${esc(x.p.title)}</button>`).join(' · ')}</p>` : ''}
      <p class="small"><button type="button" class="btn small" data-dca-map="${esc(r.key)}">Show on the map</button></p></div>`;
  }
  function dcaCsv() {
    const R = DC().dcAnalysis(), q = v => `"${String(v).replace(/"/g, '""')}"`;
    const head = ['Project', 'System', 'Online', 'Status', 'Relieves', 'Capacity runs out', 'Connecting developments', ...R.years.map(y => `Held back if cancelled ${y} (people)`), 'Held back if cancelled build-out (people)', 'Held back build-out (units)', 'DC revenue held back (water + wastewater, $)', 'Gross cost 2020$ (priced parts)', 'DC-recoverable cost 2020$ (priced parts)', 'Parts priced', 'DC-recoverable cost per person ($)', 'Recommendation', 'Why'];
    const rows = R.list.map(r => [r.name, r.sys === 'water' ? 'Water' : 'Wastewater', r.y || '', r.status || '', r.rows.map(x => x.c.name).join('; '), r.outY || '', r.conn.length, ...r.ys.map(v => Math.round(v)), Math.round(r.bo), Math.round(r.units), r.revRisk == null ? '' : Math.round(r.revRisk), r.cost && r.cost.n ? r.cost.gross : '', r.cost && r.cost.n ? r.cost.dc : '', r.cost ? `${r.cost.n} of ${r.cost.of}` : '', r.perP == null ? '' : Math.round(r.perP), DC().REC[r.rec][1], r.why]);
    PE().download(`peel-dc-analysis-${MM().THIS_YEAR}.csv`, CSV_DISCLAIMER + [head, ...rows].map(a => a.map(q).join(',')).join('\n'), 'text/csv');
  }
  // DC tab events: delegated from the document so they keep working in the Phase 4 sub-view
  // panes (#dca-timing-body / #dca-rec-body / #dca-funding-body, or the legacy #dca-body).
  const dcaBodyOf = e => e.target.closest('#dca-timing-body, #dca-rec-body, #dca-funding-body, #dca-body');
  document.addEventListener('change', e => {
    if (!dcaBodyOf(e)) return;
    const b = e.target.closest('[data-dcb-budget]'), y = e.target.closest('[data-dcb-years]');
    if (b && +b.value > 0) { DC().DCB.budget = Math.round(+b.value * 1e8) * 10; store.set('dcaBudget', DC().DCB.budget); renderDca(); return; }
    if (y && +y.value >= 1) { DC().DCB.years = Math.min(30, Math.round(+y.value)); renderDca(); return; }
    const s0 = e.target.closest('[data-dca-year]'); if (!s0) return;
    MA().setCapYear(s0.value ? +s0.value : null); SvcTab().renderScenario(); MA().renderCapLayer(); MA().renderLegend(); ST().syncTraceSum(); renderDca();
  });
  document.addEventListener('click', e => {
    if (!dcaBodyOf(e)) return;
    const bb = e.target.closest('[data-dcb]'); if (bb) { DC().DCB.budget = +bb.dataset.dcb; store.set('dcaBudget', DC().DCB.budget); return renderDca(); }
    if (e.target.closest('[data-dcb-csv]')) {
      const B = DC().dcaBudget(DC().DCB.budget, DC().DCB.years), q = v => `"${String(v).replace(/"/g, '""')}"`;
      const rows = DC().dcaMergeRecs(B).map(({ dec, r }) => [dec, r.name, r.sys === 'water' ? 'Water' : 'Wastewater', r.y || '', r.committed ? 'yes' : '', Math.round(r.cost), r.c ? Math.round(r.c.est * 100) : '', Math.round(r.v), Math.round(r.v / B.ppu), r.firstY || '']);
      return PE().download(`peel-dc-funding-${(DC().DCB.budget / 1e9).toFixed(1)}B-${B.end}.csv`, CSV_DISCLAIMER + [['Decision', 'Project', 'System', 'Online', 'Committed', 'DC cost 2026$', '% estimated', `People held back by ${B.end} if deferred`, 'Units', 'Growth first held back'], ...rows].map(a => a.map(q).join(',')).join('\n'), 'text/csv');
    }
    const rf = e.target.closest('[data-dcarec-filter]'); if (rf) { MP().DCA.recFilter = rf.dataset.dcarecFilter; MP().DCA.recAll = false; return renderDca(); }
    if (e.target.closest('[data-dcarec-all]')) { MP().DCA.recAll = !MP().DCA.recAll; return renderDca(); }
    if (e.target.closest('[data-dcatiming-all]')) { MP().DCA.timingAll = !MP().DCA.timingAll; return renderDca(); }
    if (e.target.closest('[data-dcafund-all]')) { MP().DCA.fundAll = !MP().DCA.fundAll; return renderDca(); }
    const s0 = e.target.closest('[data-dca-sort]'); if (s0) { MP().DCA.sort = s0.dataset.dcaSort; return renderDca(); }
    if (e.target.closest('[data-dca-csv]')) return dcaCsv();
    const dv = e.target.closest('[data-dca-dev]'); if (dv) { const p = Nav().projectByKey(dv.dataset.dcaDev); if (p) Nav().showDetail(p); return; }
    const mp = e.target.closest('[data-dca-map]');
    if (mp) {
      const r = MP().DCA.res && MP().DCA.res.list.find(x => x.key === mp.dataset.dcaMap); if (!r) return;
      if (!MM().getDcOn().on) MA().setDcOn({ on: true, sys: 'both' });
      if (r.r.ln) { MP().showDcLine(r.r.ln); map.fitBounds(L.latLngBounds(App().state.dcInfra[r.r.ln.sys].lines.filter(x => (x.p || x.c) === (r.r.ln.p || r.r.ln.c)).flatMap(x => x.g.map(([a, b]) => [b, a]))), { maxZoom: 15, padding: [30, 30] }); }
      else if (r.r.fc) { DI().showFacility(r.r.fc); if (r.r.fc.g) map.setView([r.r.fc.g[1], r.r.fc.g[0]], Math.max(map.getZoom(), 13)); }
      return;
    }
    if (e.target.closest('button, a')) return;
    const row = e.target.closest('[data-dca]'); if (!row) return;
    const k = row.dataset.dca; if (MP().DCA.open.has(k)) MP().DCA.open.delete(k); else MP().DCA.open.add(k);
    renderDca();
  });
  document.addEventListener('keydown', e => { if (!dcaBodyOf(e)) return; const row = e.target.closest('[data-dca]'); if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); row.click(); } });

  function exportDcGeoJSON() { if (App().state.dcInfra) PE().download('peel-2026-dc-planned-works.geojson', JSON.stringify(DI().dcGeoJSON()), 'application/geo+json'); }

  for (const id of ['#water-body', '#ww-body']) {
    $(id).addEventListener('click', e => { const r = e.target.closest('[data-svc]'); if (r) ST().focusSvc(r.dataset.svc); });
    $(id).addEventListener('keydown', e => { const r = e.target.closest('[data-svc]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); ST().focusSvc(r.dataset.svc); } });
  }


  const api = {
    renderDca,
    renderDcaTiming,
    renderDcaRec,
    renderDcaFunding,
    exportDcGeoJSON,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDcaTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
