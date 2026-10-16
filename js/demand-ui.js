/* js/demand-ui.js — population & servicing demand UI (Phase 6 extraction).
 * Allocations, plant room, data-freshness table, model validation checks,
 * window.ModelChecks extra sections, Sources & checks gear page.
 * Extracted verbatim from js/app.js (lines 1410, 1418-1675); the only edits are
 * the reference rewrites in SPLIT_MAP.md §0 rule 4.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmt1, skel, store, dot, roundPop, hlP } = root.PeelUtil;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const App = () => root.PeelApp;
  const AT = () => root.PeelAnalysisTabs;
  const CA = () => root.PeelCensusAreas;
  const MM = () => root.PeelMapMarkers;
  const MP = () => root.PeelMasterPlan;
  const DN = () => root.PeelDevNav;
  const SP = () => root.PeelSvcPlants;
  const ST = () => root.PeelSewerTrace;
  const SV = () => root.PeelSvcData;
  const SET = () => root.PeelSettings;
  const SvcTab = () => root.PeelSvcTab;
  const EX = () => root.PeelExports;
  const OV = () => root.PeelOverviewTab;

/* ---- app.js lines 1410-1410 ---- */
  // ---- Population & servicing demand -------------------------------------------------
/* ---- app.js lines 1418-1675 ---- */
  // Withdrawn projects never count; the basis picks which of each project's units count.
  // With a project selected, the shown projects in its census DA; otherwise all shown projects.
  const demandSet = () => App().state.filtered.filter(p => p.phase !== 'cancelled' && (!App().state.daCtx || App().state.daCtx.keys.has(p.key)));
  // Overview and briefing: everything shown on the map (an open development's surroundings don't narrow it).
  const overviewSet = () => App().state.filtered.filter(p => p.phase !== 'cancelled');
  const BASIS_LABEL = { all: 'all units', committed: 'committed units only (approved, not yet built)', remaining: 'units with no permit yet only' };
  const demandBasis = () => App().state.basis;
  // What the demand covers: the phases picked in the filter panel, then any other filters.
  // (Stage 2: pumping stations are part of Servicing › Network — #pane-pumpstations in index.html.)
  // ---- Phase 4 shared bits for the Wastewater sub-views: tiles, a compact inline bar,
  // and the one-line ⓘ footer (method, criteria, data dates) that replaces the per-tab
  // stampHTML scenario line (the scenario bar now carries that once).
  const wwTile = (label, value, unitTxt = '', sub = '', info = '') =>
    `<div class="tile"${info ? ` data-info="${info}"` : ''}><div class="tl">${label}</div><div class="tv">${value}${unitTxt ? `<span class="tu">${unitTxt}</span>` : ''}</div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
  // A labelled bar: the state is in words ("over" / "short"), not only in colour (design audit,
  // Group 8); a % bar carries a 100% tick.
  const miniBar = (name, v, max, unitTxt, neg = false, negWord = unitTxt === '%' ? 'over' : 'short') => `
    <div style="display:flex;align-items:center;gap:8px;margin:3px 0">
      <span class="muted small" style="width:92px;flex:none">${name}</span>
      <span style="flex:1;background:var(--surface-1);border-radius:4px;height:10px;display:block;overflow:hidden;position:relative">
        <span style="display:block;height:100%;width:${(Math.max(0, v) / max * 100).toFixed(1)}%;background:var(${neg ? '--cap-over' : '--cap-room'});border-radius:4px"></span>
        ${unitTxt === '%' && max > 100 ? `<span aria-hidden="true" style="position:absolute;top:0;bottom:0;left:${(100 / max * 100).toFixed(1)}%;border-left:1px solid var(--text-primary)"></span>` : ''}
      </span>
      <span class="small" style="width:104px;flex:none;text-align:right;${neg ? 'color:var(--cap-over);font-weight:500' : ''}">${v < 0 ? `over by ${fmt1(-v)} ${unitTxt}` : `${fmt1(v)} ${unitTxt}${neg ? ` · ${negWord}` : ''}`}</span>
    </div>`;
  function wwInfoLine(method) {
    const c = App().state.criteria, E = c.employment, R = App().state.reports, bc = CA().baselineCensus(), Y = bc ? bc.year : 2021;
    const dates = [App().state.snapshot ? `applications ${App().state.snapshot.generatedAt.slice(0, 10)}` : 'applications live', `${Y} Census`, R ? `Peel ${R.year} annual reports` : null].filter(Boolean).join(' · ');
    return `<p class="small muted">ⓘ ${method} Criteria: wastewater ${c.wastewater.avg} L/cap/d with Harmon peaking (${c.wastewater.peakMin}–${c.wastewater.peakMax}), I&amp;I ${c.wastewater.infiltration} L/s/ha (Peel Linear Wastewater Standards 2023); employment ${E.wastewater} L/emp/d (Peel Modelling Demand Table, Aug 2024). Data: ${esc(dates)}.</p>`;
  }
  // ---- Servicing allocations: units the Region has allocated servicing capacity to, per
  // development (kept in this browser; CSV export / import to share one list). An allocation to a
  // development not yet approved commits capacity ahead of its approval: the plants' room after
  // allocations is the room after existing + approved, less those allocations.
  const allocs = () => store.get('allocations', {}) || {};
  function setAlloc(key, a) { const all = allocs(); if (a) all[key] = a; else delete all[key]; store.set('allocations', all); onAllocChange(); }
  function onAllocChange() { renderAlloc(); if (AT().getFootTab() === 'overview') OV().renderOverview(); if (typeof DevScope !== 'undefined' && DevScope.current()) DevScope.refresh(); }
  const allocPeople = (p, a) => { const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf); return e.totalUnits > 0 ? a.units * e.population / e.totalUnits : a.units * (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment; };
  function allocRows() {
    const out = [];
    for (const [key, a] of Object.entries(allocs())) {
      const p = DN().projectByKey(key);
      out.push({ key, a, p, pl: p ? MM().plantOfDev(p) : 'none', lay: p ? MM().svcLayerOf(p) : 'out', people: p ? allocPeople(p, a) : 0 });
    }
    return out.sort((x, y) => String(y.a.date || '').localeCompare(String(x.a.date || '')));
  }
  // Plant room after allocations (average dry at the plant's measured rate, ML/d; at the 90% trigger).
  // Bundle 5: room after allocations as a bar from a zero line, left (red) for an over, right for room;
  // the tone by the Overview bars' rule: past the trigger = over, at 85%+ of rated = nearly full (amber).
  const allocTone = x => (x.after < 0 ? 'over' : x.cap && x.cap.rated > 0 && (x.lim - x.after) / x.cap.rated >= 0.85 ? 'tight' : 'room');
  const allocWord = x => ({ over: 'over', tight: 'nearly full', room: 'room' }[allocTone(x)]);
  function roomBar(name, x, maxPos, maxNeg, unitTxt) {
    const tot = Math.max(1e-9, maxPos + maxNeg), z = maxNeg / tot * 100, w = Math.abs(x.after) / tot * 100, tone = allocTone(x);
    const left = x.after < 0 ? z - w : z;
    return `<div class="rb-row t-${tone}"><span class="muted small rb-name">${name}</span><span class="rb-track">${maxNeg > 0 ? `<i class="rb-zero" style="left:${z.toFixed(1)}%"></i>` : ''}<i class="rb-fill" style="left:${left.toFixed(1)}%;width:${w.toFixed(1)}%"></i></span><span class="small rb-v">${x.after < 0 ? `over by ${fmt1(-x.after)} ${unitTxt}` : `${fmt1(Math.max(0, x.after))} ${unitTxt}${tone === 'tight' ? ' · nearly full' : ''}`}</span></div>`;
  }
  const roomBars = plants => { const maxPos = Math.max(0, ...plants.map(x => x.after)), maxNeg = Math.max(0, ...plants.map(x => -x.after)); return `<div class="rb">${plants.map(x => roomBar(esc(SV().PLANT_SHORT[x.pl]), x, maxPos, maxNeg, 'ML/d')).join('')}</div>`; };
  function allocPlant(pl) {
    const M = App().state.svcModel, cap = M && M.plantCap(pl); if (!cap) return null;
    const rows = allocRows().filter(r => r.pl === pl), ahead = rows.filter(r => r.lay === 'proposed');
    const aheadMld = ahead.reduce((t, r) => t + r.people * cap.perPerson / 1e6, 0);
    const k = window.PeelCapacity && window.PeelCapacity.of(`plant:${pl}`);
    const lim = MP().PLANT_TRIGGER * cap.rated, room = k ? k.room : lim - cap.committed;   // room to the 90% trigger (js/capacity.js)
    return { pl, cap, lim, rows, ahead, aheadMld, room, after: room - aheadMld, peopleAfter: cap.perPerson > 0 ? (room - aheadMld) * 1e6 / cap.perPerson : 0 };
  }
  function allocBoxHTML(p) {
    const a = allocs()[p.key], e = D.estimate([p], App().state.criteria, 'all', App().jobsOf), def = Math.round(e.totalUnits) || '';
    return `<div class="alloc-box" id="alloc-box" data-info="allocations">
      <div class="alloc-h"><strong>Servicing allocation</strong> ${a ? `<span class="fr-b fr-ok">${fmtNum(a.units)} units allocated${a.date ? ` · ${esc(a.date)}` : ''}</span>` : '<span class="fr-b fr-ref">Not recorded</span>'}</div>
      <div class="alloc-f"><label>Units <input type="number" min="0" step="1" data-alloc-f="units" value="${a ? a.units : def}"></label><label>Date <input type="date" data-alloc-f="date" value="${esc(a ? a.date || '' : new Date().toISOString().slice(0, 10))}"></label><label>Reference <input type="text" data-alloc-f="ref" value="${esc(a ? a.ref || '' : '')}" placeholder="report / agreement no."></label>
        <button type="button" class="btn small" data-alloc-save="${esc(p.key)}">${a ? 'Update' : 'Record allocation'}</button>${a ? `<button type="button" class="btn small link" data-alloc-del="${esc(p.key)}">Remove</button>` : ''}</div>
      <small class="muted">Kept in this browser; share the list from Wastewater → Allocations (CSV).</small></div>`;
  }
  document.addEventListener('click', e => {
    const sv = e.target.closest('[data-alloc-save]');
    if (sv) { const box = sv.closest('.alloc-box'), v = k => box.querySelector(`[data-alloc-f="${k}"]`).value.trim(), units = Math.max(0, Math.round(+v('units') || 0)); if (!units) return; setAlloc(sv.dataset.allocSave, { units, date: v('date'), ref: v('ref') }); return; }
    const dl = e.target.closest('[data-alloc-del]'); if (dl) { if (confirm('Remove this allocation?')) setAlloc(dl.dataset.allocDel, null); }
  });
  // Phase 4: "See all" for the recorded-allocations table (top 10 by default).
  let allocSeeAll = false;
  function renderAlloc() {
    const el = $('#alloc-body'); if (!el) return;
    const rows = allocRows(), plants = ['Lakeview', 'Clarkson', 'Inglewood'].map(allocPlant).filter(Boolean);
    const totU = rows.reduce((t, r) => t + r.a.units, 0), ahead = rows.filter(r => r.lay === 'proposed');
    const shown = allocSeeAll ? rows : rows.slice(0, 10);
    el.innerHTML = `${hlP(rows.length ? `<strong>${fmtNum(rows.length)}</strong> allocation${rows.length === 1 ? '' : 's'} recorded for <strong>${fmtNum(totU)} units</strong>; ${ahead.length ? `${fmtNum(ahead.length)} ${ahead.length === 1 ? 'is' : 'are'} recorded ahead of approval and counted against the reserve now.` : 'all are already approved or built, so they are in the committed flow.'}${plants.filter(x => x.ahead.length).map(x => ` <strong>${esc(SV().PLANT_SHORT[x.pl])}</strong> room after allocations: ${fmt1(x.after)} ML/d (≈${fmtNum(roundPop(x.peopleAfter))} people).`).join('')}` : 'No servicing allocations recorded yet. Record one from a development\'s Servicing tab, or import a CSV.')}
      <div class="tiles">${[
        wwTile('Allocations recorded', fmtNum(rows.length), rows.length === 1 ? 'allocation' : 'allocations', `${fmtNum(totU)} units`, 'allocations'),
        ...plants.map(x => wwTile(`${esc(SV().PLANT_SHORT[x.pl])} ${x.after < 0 ? 'over' : 'room'}`, fmt1(Math.abs(x.after)), 'ML/d', `${x.after < 0 ? 'past the 90% trigger ' : ''}after allocations · ≈${fmtNum(roundPop(Math.abs(x.peopleAfter)))} people`, 'allocations')),
      ].join('')}</div>
      <h3 class="svc-sub">Room after allocations <span class="muted small">at the 90% expansion trigger · ML/d ${SvcTab().wwFlowLabel()}</span></h3>
      ${roomBars(plants)}
      <table class="dt"><caption>Plants: room at the 90% expansion trigger after existing + built + committed, and after allocations (${SvcTab().wwFlowLabel('long')})</caption>
        <thead><tr><th>Plant</th><th>Trigger (90%)</th><th>Existing + built + approved</th><th>Room to the trigger</th><th>Allocated ahead of approval</th><th>Room after allocations</th></tr></thead>
        <tbody>${plants.map(x => `<tr><td>${esc(SV().PLANT_SHORT[x.pl])}</td><td>${fmt1(x.lim)} ML/d</td><td>${fmt1(x.cap.committed)} ML/d</td><td>${window.PeelUtil.roomWords(x.room)}<small>≈${fmtNum(roundPop(Math.abs(x.cap.perPerson > 0 ? x.room * 1e6 / x.cap.perPerson : 0)))} people</small></td><td>${x.ahead.length ? `${fmt1(x.aheadMld)} ML/d<small>${fmtNum(x.ahead.reduce((t, r) => t + r.a.units, 0))} units · ${fmtNum(x.ahead.length)} development${x.ahead.length === 1 ? '' : 's'}</small>` : '<span class="muted">none</span>'}</td><td class="${x.after < 0 ? 'over' : ''}"><strong>${window.PeelUtil.roomWords(x.after)}</strong><small>≈${fmtNum(roundPop(Math.abs(x.peopleAfter)))} people</small></td></tr>`).join('')}</tbody></table>
      <div class="export-bar"><button type="button" class="btn small" data-alloc-csv>Export CSV</button><label class="btn small">Import CSV<input type="file" accept=".csv,text/csv" data-alloc-imp hidden></label></div>
      ${rows.length ? `<table class="dt"><caption>Allocations recorded${rows.length > 10 ? ` · showing ${shown.length} of ${fmtNum(rows.length)}` : ''}</caption><thead><tr><th>Development</th><th>Units</th><th>People</th><th>Date</th><th>Reference</th><th>Plant</th><th>Status</th></tr></thead><tbody>
        ${shown.map(r => `<tr class="ld-row" data-dev="${esc(r.key)}" tabindex="0"><td>${r.p ? `${dot(r.p.phase)} ${esc(r.p.title)}` : `<span class="muted">${esc(r.key)} (not in the current data)</span>`}</td><td>${fmtNum(r.a.units)}</td><td>${fmtNum(roundPop(r.people))}</td><td>${esc(r.a.date || '–')}</td><td>${esc(r.a.ref || '')}</td><td>${esc(SV().PLANT_SHORT[r.pl] || '–')}</td><td>${r.lay === 'proposed' ? '<span class="fr-b fr-due">Ahead of approval</span>' : r.lay === 'out' ? '<span class="fr-b fr-ref">Withdrawn</span>' : '<span class="fr-b fr-ok">Approved / built</span>'}</td></tr>`).join('')}</tbody></table>
        ${rows.length > 10 ? `<p><button type="button" class="btn small link" data-alloc-all>${allocSeeAll ? 'Show fewer' : `See all ${fmtNum(rows.length)} allocations`}</button></p>` : ''}` : ''}
      ${wwInfoLine('Room at the 90% expansion trigger after existing + built + committed, less allocations recorded ahead of approval; ' + SvcTab().wwFlowLabel('long') + '.')}`;
    // Stage 3: the standard panel; the tables above are its full table.
    const PN = root.PeelPanel;
    if (PN) {
      const short = plants.filter(x => x.after < 0);
      PN.set('svc:alloc', {
        calc: true, fullTitle: 'Servicing › Allocations · Peel: the plants and every allocation recorded',
        head: PN.areaHead('Servicing › Allocations', 'What is already allocated?', short.length ? { tone: 'over', text: `${short.length} past the trigger` } : { tone: 'room', text: 'Room' }, `Peel · ${fmtNum(rows.length)} allocation${rows.length === 1 ? '' : 's'} recorded in this browser`),
        answer: rows.length ? `<strong>${fmtNum(rows.length)}</strong> allocation${rows.length === 1 ? '' : 's'} recorded for <strong>${fmtNum(totU)} units</strong>; ${fmtNum(ahead.length)} ahead of approval.${short.length ? ` ${short.map(x => esc(SV().PLANT_SHORT[x.pl])).join(' and ')} ${short.length === 1 ? 'has' : 'have'} no room left at the 90% trigger after them.` : ''}` : `${short.length ? `${short.map(x => `<strong>${esc(SV().PLANT_SHORT[x.pl])}</strong> is already ${fmt1(-x.after)} ML/d past its 90% trigger`).join('; ')}, before any allocation. ` : ''}No allocations recorded yet: record one from a development (its ⋯ menu, Record allocation) or import a CSV in the full table.`,
        figures: [{ v: fmtNum(rows.length), u: 'allocations', label: 'recorded', ctx: `${fmtNum(totU)} units` },
          // (an over is a positive "over by", never a negative room: one sign rule, as the bars)
          ...plants.map(x => ({ v: fmt1(Math.abs(x.after)), u: 'ML/d', label: `${SV().PLANT_SHORT[x.pl]} ${allocWord(x)}`, ctx: `${x.after < 0 ? 'past the 90% trigger ' : 'to the 90% trigger '}after allocations · ≈${fmtNum(roundPop(Math.abs(x.peopleAfter)))} people`, tone: allocTone(x) }))].slice(0, 4),
        chart: `<p class="small pnl-chart-t">Room at the 90% expansion trigger after allocations <span class="pnl-chart-u">(ML/d)</span></p>${roomBars(plants)}`,
        lists: [{ title: 'Allocations', rows: rows.slice(0, 5).map(r => ({ attrs: r.p ? { 'data-pnl-dev': r.key } : null, html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.p ? `${dot(r.p.phase)} ${esc(r.p.title)}` : esc(r.key)}<small>${esc(SV().PLANT_SHORT[r.pl] || '')}${r.a.ref ? ` · ${esc(r.a.ref)}` : ''}</small></span><span class="pnl-r-fig">${fmtNum(r.a.units)}<small>units</small></span></div>` })), total: rows.length, seeAll: { 'data-full-table': 'svc' } }],
        method: `Room at the 90% expansion trigger after existing + built + committed, less allocations recorded ahead of approval; ${esc(SvcTab().wwFlowLabel('long'))}. Allocations are kept in this browser (export and import them as CSV in the full table).`,
        sources: 'Plant capacity and flows: Region of Peel 2025 annual reports; the 90% trigger: 2020 Master Plan (Vol. 4, s. 2.3.1); allocations: recorded here.',
        foot: { primary: { label: 'Import or export CSV', attrs: { 'data-full-table': 'svc' }, title: 'Open the full table: Export CSV and Import CSV are there' } },
      });
    }
  }
  $('#alloc-body').addEventListener('click', e => {
    if (e.target.closest('[data-alloc-all]')) { allocSeeAll = !allocSeeAll; renderAlloc(); return; }
    if (e.target.closest('[data-alloc-csv]')) {
      const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
      const lines = [['key', 'development', 'units', 'date', 'reference', 'plant', 'status'], ...allocRows().map(r => [r.key, r.p ? r.p.title : '', r.a.units, r.a.date || '', r.a.ref || '', SV().PLANT_SHORT[r.pl] || '', r.lay])];
      EX().download(`peel-servicing-allocations-${new Date().toISOString().slice(0, 10)}.csv`, root.PeelUtil.CSV_DISCLAIMER + lines.map(l => l.map(q).join(',')).join('\n'), 'text/csv');
    }
    const r = e.target.closest('.ld-row'); if (r) { const p = DN().projectByKey(r.dataset.dev); if (p) DN().showDetail(p); }
  });
  $('#alloc-body').addEventListener('change', async e => {
    const f = e.target.closest('[data-alloc-imp]'); if (!f || !f.files[0]) return;
    const text = await f.files[0].text(), parse = line => { const out = []; let cur = '', q = false; for (let i = 0; i < line.length; i++) { const ch = line[i]; if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; } else if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
    const lines = text.split(/\r?\n/).filter(Boolean), head = parse(lines[0]).map(h => h.trim().toLowerCase()), ix = k => head.indexOf(k);
    if (ix('key') < 0 || ix('units') < 0) { alert('The CSV needs at least "key" and "units" columns (export one to see the format).'); return; }
    const all = allocs(); let n = 0;
    for (const l of lines.slice(1)) { const c = parse(l), key = (c[ix('key')] || '').trim(), units = Math.round(+c[ix('units')] || 0); if (!key || !units) continue; all[key] = { units, date: ix('date') >= 0 ? c[ix('date')] : '', ref: ix('reference') >= 0 ? c[ix('reference')] : '' }; n++; }
    store.set('allocations', all); f.value = ''; onAllocChange(); alert(`${n} allocation${n === 1 ? '' : 's'} imported.`);
  });
  // ---- Data quality (Settings & sources): how fresh each source is, and the model checked against
  // the figures the Region and Statistics Canada publish. -----------------------------------------
  const DAY = 864e5;
  const MUNIS = ['Mississauga', 'Brampton', 'Caledon'];
  function freshness() {
    const age = d => d ? Math.floor((Date.now() - new Date(d).getTime()) / DAY) : null;
    const row = (name, date, every, maxDays, note = '', disp = null) => { const a = age(date); return { name, date: disp || (date ? String(date).slice(0, 10) : null), every, a: disp ? null : a, st: date == null ? 'na' : maxDays == null ? 'ref' : a > maxDays * 2 ? 'stale' : a > maxDays ? 'due' : 'ok', note }; };
    const R = App().state.reports, bc = App().state.censuses && App().state.censuses[0], H = App().state.housing;
    return [
      row('Planning applications and building permits', App().state.snapshot && App().state.snapshot.generatedAt, 'weekly', 10),
      row('Phase history', App().state.history && App().state.history.updated, 'weekly', 10),
      row('Council and committee agendas, minutes', App().state.council && App().state.council.generatedAt, 'weekly', 10),
      row('Secondary plans, MTSAs', App().state.areas && App().state.areas.generatedAt, 'yearly', 365),
      row(`${bc ? bc.year : 2021} Census (dissemination areas)`, bc && bc.date, 'every 5 years', null, bc && bc.year >= 2026 ? 'The latest census.' : 'The 2026 Census population and dwelling counts (by dissemination area) are released February 10, 2027; most other topics through 2027. scripts/build-areas.js takes them (CENSUS_2026_CSV) and the 2026 counts become the baseline.'),
      row('Peel housing activity and building permits', H && H.peel && H.peel.permits && H.peel.permits.edited, 'quarterly', 200, 'Region of Peel open data; rebuild with the Probe data sources workflow, mode peel-open.'),
      row('CMHC housing starts by municipality', H && H.cmhc.asOf, 'yearly', 400, 'CMHC Starts and Completions Survey (Housing Market Information Portal).'),
      row('Ministry of Finance population projections', H && H.mof.asOf, 'yearly', 400, 'Updated each summer.'),
      row('Water and wastewater DC rates', App().state.dcCosts && App().state.dcCosts.rates.effective, 'every 6 months', 190, 'Indexed February 1 and August 1; the 2026 DC by-law may change them.'),
      row('DC project costs (2020 DC Background Study)', '2020-09-18', 'each DC study', null, 'Components on the 2026 maps that were in the 2020 study; replace with the 2026 study\'s tables when published.'),
      row('Plant effluent compliance (MECP reports)', App().state.compliance && `${App().state.compliance.years[App().state.compliance.years.length - 1] + 1}-12-31`, 'yearly', 400, 'Environmental Compliance Reports; a year\'s report is published about a year later.', App().state.compliance ? `${App().state.compliance.years[0]}–${App().state.compliance.years[App().state.compliance.years.length - 1]}` : null),
      row('IDF curves (MTO IDF Curve Look-up)', SET().IDF.data && SET().IDF.data.fetched, 'reference', null, 'Ministry of Transportation, 2010 data year with its climate trend.'),
      row('Pressure zones, pumping stations, plants', App().state.servicing && App().state.servicing.meta.generatedAt, 'yearly', 365),
      row('Sanitary sewer network (300 mm+)', MM().SEW.data && MM().SEW.data.generatedAt, 'yearly', 365),
      row('Wastewater blocks (I&I program)', ST().BLK.data && ST().BLK.data.generatedAt, 'yearly', 365),
      row('Water supply mains (zone boundaries)', MP().DCN.supply && MP().DCN.supply.generatedAt, 'yearly', 365),
      row('2026 DC capital maps (draft)', App().state.dcInfra && App().state.dcInfra.generatedAt, 'each DC study', 730, 'Draft program; replace when the by-law is passed.'),
      row(`Peel ${R ? R.year : ''} annual reports (plants, water)`, R ? `${R.year + 1}-06-30` : null, 'yearly', 365, 'Next year\'s reports come out about mid-year.', R ? `${R.year} data (published mid-${R.year + 1})` : null),
      row('2020 Water and Wastewater Master Plan', '2020-12-31', 'about every 5 years', null, 'Pumping station firm capacities and storage. The 2025 (lake-based) master plan was to be finalized in 2026: replace these figures, the plant capacities and the project list when its report is filed.'),
      { name: 'Existing pipes, hydrants, ponds (live GIS)', date: null, every: 'live', a: null, st: 'live', note: 'Read from the Region and municipal map services when shown.' },
    ];
  }
  const FRESH = { ok: ['fr-ok', 'Current'], due: ['fr-due', 'Due for a refresh'], stale: ['fr-stale', 'Out of date'], ref: ['fr-ref', 'Reference'], live: ['fr-ok', 'Live'], na: ['fr-na', 'Loads when needed'] };
  // Model against published figures: [what, model, published, unit, why it may differ].
  function validationRows() {
    const out = [], bc = App().state.censuses && App().state.censuses.find(c => c.year === 2021), M = App().state.svcModel, R = App().state.reports;
    const STATCAN = { Peel: 1451022, Mississauga: 717961, Brampton: 656480, Caledon: 76581 };
    if (bc) {
      const by = {}; let t = 0; for (const d of bc.das) { t += d.pop; by[d.muni] = (by[d.muni] || 0) + d.pop; }
      out.push(['2021 Census population, Peel', t, STATCAN.Peel, 'people', 'Statistics Canada, 2021 Census (Peel Region). The model sums the dissemination areas it maps.']);
      for (const m of ['Mississauga', 'Brampton', 'Caledon']) if (by[m]) out.push([`2021 Census population, ${m}`, by[m], STATCAN[m], 'people', 'Statistics Canada, 2021 Census.']);
      if (M && App().state.servicing) { let sv = 0; for (const d of App().state.servicing.drainage) { const l = M.local.get(d.id); if (l) sv += l.census; } out.push(['2021 Census people in sewered blocks', sv, t, 'people', 'Share of Peel on municipal sewers in the model; the rest (rural Caledon) is on septic.', 'share']); }
    }
    if (M && R) {
      let built = 0; for (const z of M.zones.values()) built += z.built;
      const served = R.water.southPeel.populationServed;
      if (bc && served) { const t = bc.das.reduce((a, d) => a + d.pop, 0); out.push(['Population today (census + built since)', t + built, served, 'people', `Peel ${R.year} annual report: population served. Census counts miss some people (undercount ≈2–3%) and building completions lag.`]); }
      for (const pl of ['Lakeview', 'Clarkson']) {
        const c = M.calib && M.calib[pl], rep = R.wastewater.plants[pl]; if (!c || !rep) continue;
        out.push([`${SV().PLANT_SHORT[pl]}: average flow today, design criteria`, c.today + M.inflowsTo(pl), rep.avgMLd, 'ML/d', `${R.year} measured average. Design rates (${App().state.criteria.wastewater.avg} L/cap/d) leave out existing employment and institutions and dry-weather inflow; the capacity check scales each plant by ×${c.f ? c.f.toFixed(2) : '–'} to match the measured flow.`]);
      }
      const H = App().state.housing;
      if (bc && H && H.mof.peel[2025]) { let b2 = 0; for (const z of M.zones.values()) b2 += z.built; const t = bc.das.reduce((a, d) => a + d.pop, 0); out.push(['Population today vs. Statistics Canada July 2025 estimate', t + b2, H.mof.peel[2025], 'people', 'The base year of the Ministry of Finance projections (Statistics Canada estimate, includes the census undercount and non-permanent residents, many in existing homes).']); }
      if (M.zsum) out.push(['South Peel water: average day today, design criteria', M.wAvg(M.zsum.census + M.zsum.built, M.zsum.jbuilt), R.water.southPeel.avgMLd, 'ML/d', `${R.year} production of A.P. Kennedy + Lorne Park, which also includes water supplied to York Region and Halton, existing employment and non-revenue water: the model is expected to be lower.`]);
    }
    // Built since the census against CMHC: completions from census day (prorated) to the end of 2022.
    const H = App().state.housing;
    if (bc && H) {
      const since = +new Date(`${bc.date}T00:00:00Z`), until = +new Date('2023-01-01T00:00:00Z'), frac = (until - since) / DAY / 365 - 1;
      for (const m of MUNIS) {
        const C = H.cmhc.completions[m]; if (!C || !C[2021] || !C[2022]) continue;
        let u = 0; for (const p of App().state.projects) { if (p.municipality !== m || p.phase === 'cancelled') continue; const done = p.records.filter(r => { if (r.kind !== 'permit' || r.phase !== 'completed') return false; const c = PeelAreas.completedAt(r); return c && c.date >= since && c.date < until; }); if (done.length) u += P.permitUnits(done); }
        out.push([`Units completed since the census to 2022, ${m}`, u, C[2021].all * frac + C[2022].all, 'units', `CMHC completions ${bc.date.slice(5)}–2022 (2021 prorated). The model counts permits closed as completed; ${m === 'Mississauga' ? 'condominium towers close their permits after occupancy, so they lag' : 'completion dates are estimated from the issue date where not published'}.`]);
      }
      // Observed pace: CMHC starts per year against the pace the Horizon years assume for approved growth.
      const S = H.cmhc.starts, ys = Object.keys(S.Mississauga || {}).map(Number).sort().slice(-5);
      if (ys.length) {
        const obs = ys.reduce((t, y) => t + MUNIS.reduce((a, m) => a + ((S[m] || {})[y] ? S[m][y].all : 0), 0), 0) / ys.length;
        let appr = 0; for (const p of App().state.projects) if (MM().svcLayerOf(p) === 'approved') appr += D.estimate([p], App().state.criteria, 'all', App().jobsOf).totalUnits;
        out.push(['Approved units built per year (Horizon years) vs. CMHC starts', appr / SP().hz.aYears, obs, 'units', `Approved units spread over ${SP().hz.aYears} years from ${SP().hz.aStart} against Peel's average CMHC starts ${ys[0]}–${ys[ys.length - 1]}. A model pace well above the observed one brings demand forward: lengthen the approved horizon (Horizon years) to match.`]);
      }
    }
    return out;
  }
  // Data freshness table HTML (shared by the Settings tab and the Sources & checks gear page).
  function freshnessHTML() {
    const fr = freshness(), need = fr.filter(r => r.st === 'due' || r.st === 'stale');
    return `${hlP(need.length ? `<strong>${need.length} data source${need.length === 1 ? '' : 's'}</strong> ${need.length === 1 ? 'is' : 'are'} due for a refresh: ${need.map(r => esc(r.name)).join('; ')}.` : `All data sources are current; applications as of <strong>${esc((fr[0] && fr[0].date) || '–')}</strong>.`)}
      <h3 class="sub-title" data-info="data-freshness">Data freshness</h3>
      <table class="dt fr-table"><thead><tr><th>Source</th><th>As of</th><th>Updated</th><th>Status</th></tr></thead><tbody>
        ${fr.map(r => `<tr><td>${esc(r.name)}${r.note ? `<small>${esc(r.note)}</small>` : ''}</td><td>${r.date ? esc(r.date) : '–'}${r.a != null && r.st !== 'ref' ? `<small>${r.a === 0 ? 'today' : `${fmtNum(r.a)} day${r.a === 1 ? '' : 's'} ago`}</small>` : ''}</td><td>${esc(r.every)}</td><td><span class="fr-b ${FRESH[r.st][0]}">${FRESH[r.st][1]}</span></td></tr>`).join('')}
      </tbody></table>`;
  }
  // Model checks against published figures (this module's own checks; other workers add
  // sections via window.ModelChecks).
  function checksHTML() {
    const vr = validationRows();
    const st = (m, p) => { const d = (m - p) / p * 100, a = Math.abs(d); return [d, a <= 10 ? 'fr-ok' : a <= 25 ? 'fr-due' : 'fr-stale', a <= 10 ? 'Matches' : a <= 25 ? 'Close' : 'Differs']; };
    const num = (v, u) => u === 'ML/d' ? `${fmt1(v)} ML/d` : u === 'units' ? `${fmtNum(Math.round(v))} units` : `${fmtNum(roundPop(v))}`;
    return `<h3 class="sub-title" data-info="validation">Model checks against published figures</h3>
      ${vr.length ? `<table class="dt fr-table"><thead><tr><th>Check</th><th>Model</th><th>Published</th><th>Difference</th><th>Result</th></tr></thead><tbody>
        ${vr.map(([what, m, p, u, why, kind]) => { if (kind === 'share') { const sh = m / p * 100; return `<tr><td>${esc(what)}<small>${esc(why)}</small></td><td>${num(m, u)}</td><td>${num(p, u)}</td><td>${sh.toFixed(1)}% of Peel</td><td><span class="fr-b fr-ref">Coverage</span></td></tr>`; }
          const [d, cls, t] = st(m, p); return `<tr><td>${esc(what)}<small>${esc(why)}</small></td><td>${num(m, u)}</td><td>${num(p, u)}</td><td>${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1)}%</td><td><span class="fr-b ${cls}">${t}</span></td></tr>`; }).join('')}
      </tbody></table>
      <p class="small muted">Within ±10%: matches; ±25%: close; beyond: differs (the note says why it is expected to). The wastewater capacity check uses each plant's measured flow, so the design-criteria difference does not carry into it.</p>` : skel('Loading the servicing model')}${root.PeelCensusView && root.PeelCensusView.permitCheckHTML ? root.PeelCensusView.permitCheckHTML() : ''}`;
  }
  // Extra model-check sections registered by other modules (Workers D and E).
  // Convention: window.ModelChecks = { key: htmlString } or { key: { title, html } }.
  // Rendered defensively: anything unexpected is skipped, never throws.
  function modelSectionsHTML() {
    const reg = (typeof window !== 'undefined' && window.ModelChecks) || {};
    return Object.values(reg).map(s => {
      if (typeof s === 'string' && s.trim()) return s;
      if (s && typeof s.html === 'string' && s.html.trim()) return `${s.title ? `<h3 class="sub-title">${esc(String(s.title))}</h3>` : ''}${s.html}`;
      return '';
    }).join('');
  }
  function numberConventionsHTML() {
    return `<h3 class="sub-title">Number conventions</h3>
      <p class="small muted">People and jobs are estimates and are rounded the same way everywhere: whole numbers under 1,000, the nearest 10 to 10,000, the nearest 100 above. Units are counted from the applications (not rounded). Flows: L/s for pipes, pumping stations and single developments; ML/d for plants, zones and totals. ≈ marks a screening estimate.</p>
      <h3 class="sub-title">Public version</h3>
      <p class="small"><label><input type="checkbox" id="public-view"${root.PeelUtil.isPublic() ? ' checked' : ''}> Public version: hide the DC funding screen and funding levels, the screening-result column (table and CSV) and the screening-summary colours</label><br><span class="muted">Or add <code>?public</code> to the address to share a public link.</span></p>
      <h3 class="sub-title">Prepared by</h3>
      <p class="small"><label>Name and team on briefings <input type="text" id="prep-by" value="${esc(store.get('prepBy', ''))}" placeholder="e.g. J. Smith, Infrastructure Planning" style="min-width:260px"></label></p>`;
  }
  function renderQuality() {
    const el = $('#d-quality'); if (!el) return;
    el.innerHTML = `${freshnessHTML()}${checksHTML()}${modelSectionsHTML()}${numberConventionsHTML()}`;
  }
  // (prep-by is handled by the document-level change listener above)
  // Sources & checks gear page (Worker A: openGearPage('sources') renders GearPages.sources()).
  function sourcesPageHTML() {
    return `<h2 class="pane-h">Sources &amp; checks</h2>
      ${freshnessHTML()}
      ${checksHTML()}${modelSectionsHTML()}
      ${SP().refsHTML()}`;
  }
  window.GearPages = window.GearPages || {};
  window.GearPages.sources = () => sourcesPageHTML();

  // ---- Public contract ----
  // Units and people completed before census day (the Existing layer of js/layers.js totals): already
  // in the 2021 Census, so "would add" leaves them out. Only the bases that count completed units take
  // anything out: every stage ('all') and build-out ('buildout'); approved only ('committed') and left
  // to build ('remaining') count none.
  const preCensus = (t, basis) => (t && (basis === 'all' || basis === 'buildout') ? { units: (t.units && t.units.existing) || 0, people: (t.people && t.people.existing) || 0 } : { units: 0, people: 0 });
  const api = { preCensus, MUNIS, freshness, validationRows, freshnessHTML, checksHTML, renderQuality, sourcesPageHTML, allocs, setAlloc, renderAlloc, allocPlant, demandSet, overviewSet, demandBasis, wwTile, miniBar, wwInfoLine, numberConventionsHTML, modelSectionsHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDemandUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
