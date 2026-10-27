(function (root) {
'use strict';
  // Growth › Forecast › By period (navigation phase 3; was Growth › Ledger, the pipeline ledger's Phase 2,
  // docs/pipeline-ledger-plan.md): what is coming, where, when and how far along. The developments shown
  // (the Overview's set) as js/ledger.js rows:
  //   - stage cut-off buttons: Committed only · + Approved · + In review · Everything (capacity is
  //     checked at every stage, so the load can be read at any cut-off; the table's own filter, never
  //     the Scenario's Count)
  //   - units / people switch
  //   - municipality × milestone table (2026 to 2031, 2032 to 2041, 2042 to 2051, after 2051 or not
  //     timed), each cell stacked by stage, committed first; at a municipality, its plans (childBy)
  //   - the development list, sortable; a row opens the development
  // The Forecast panel's folds (periodFolds): By period, How sure, Since the last snapshot; the full table
  // (#ledger-body): the same, then the developments list.
  // The milestone buckets share each development's homes out by the Forecast view's time-in-stage model
  // (likely band, js/timing.js), so they add up to its yearly totals; each row also shows its expected
  // year (Phase 3: PeelTiming.scheduleFor), with what it is based on.
  // Every total carries the disclaimer (PeelLedger.DISCLAIMER).
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const fmtNum = U.fmtNum || (n => Math.round(n).toLocaleString('en-CA'));
  const store = U.store || { get: (k, d) => d, set: () => {} };
  const roundPop = U.roundPop || (n => Math.round(n));
  const L = () => root.PeelLedger, P = () => root.PeelPhases, App = () => root.PeelApp, DU = () => root.PeelDemandUI, D = () => root.PeelDemand;
  const $ = s => (typeof document !== 'undefined' ? document.querySelector(s) : null);

  // The view's settings, kept per browser.
  const S = {
    cutoff: store.get('ledgerCut', 'all'),
    measure: store.get('ledgerMeasure', 'units'),
    hideLapsed: !!store.get('ledgerHideLapsed', false),
    sort: store.get('ledgerSort', 'units'),
    rowsShown: 50,
  };
  // The Forecast's folds (navigation phase 3): By period open or shut per browser (open to start: task 7
  // reads it there), How sure and Since the last snapshot for the visit. An old Ledger link or call and
  // What's coming open By period (openPeriod) without changing what this browser keeps; a stored Ledger
  // pick opens the Forecast with By period as kept.
  const OPEN = { period: store.get('ledgerOpen', true) !== false, tiers: false, since: false };
  const FOLD_ID = { period: 'pnl-by-period', tiers: 'pnl-how-sure', since: 'pnl-since' };
  const foldKey = el => (el && el.id ? Object.keys(FOLD_ID).find(x => FOLD_ID[x] === el.id) || null : null);
  const MUNIS = ['Mississauga', 'Brampton', 'Caledon'];
  // Stage colours: one hue, darker = further along (the layer tokens).
  const STAGE_TOKEN = { committed: '--ly-built', approved: '--ly-committed', review: '--ly-proposed', early: '--ly-hatch' };   // (Early: hatched, as In review's colour is the same pale blue)
  const CUT_WORDS = { committed: 'committed only', approved: 'committed and plan approved', review: 'committed, approved and in review', all: 'every stage' };
  const COMMIT_BY = { servicing: 'site servicing permit', permits: 'building permits' };
  const fmtV = v => (S.measure === 'people' ? fmtNum(roundPop(v)) : fmtNum(Math.round(v)));
  const word = () => (S.measure === 'people' ? 'people' : 'units');

  // ---- The rows, for the developments shown ----------------------------------------------------
  let cache = { key: null, rows: null };
  function yearsOfFn() {
    const T = root.PeelTiming, m = T && T.forecastModel ? T.forecastModel() : null;
    if (!m || !m.ss) return { fn: null, timed: false };
    const LG = L();
    // (the model is rebuilt when the population projection arrives: its key keeps the rows in step)
    return { timed: T.forecastModel.key || true, homes: !!m.homes, m, fn: p => { const s = m.ss.sched.get(p.key), a = m.ss.after.get(p.key); return s || a ? { shares: LG.bucketShares(s ? s.likely : null, a ? a.likely : 0, P().unbuiltOf(p)) } : null; } };
  }
  function compute() {
    const A = App(); if (!A || !A.state || !L()) return null;
    const set = DU() && DU().overviewSet ? DU().overviewSet() : (A.state.filtered || []);
    const G = root.PeelDcGate, gateOn = !!(G && G.loaded && G.loaded());
    // (one wait for the servicing permits, however many draws ask before they land)
    if (G && !gateOn && G.load && !compute.gate) compute.gate = G.load().then(() => { cache.key = null; landed(); });
    const yr = yearsOfFn();
    // (the projection still loading: look again shortly, while the view is on screen)
    if ((!yr.timed || !yr.homes) && !compute.retry && typeof setTimeout === 'function') compute.retry = setTimeout(() => { compute.retry = null; if (isOn()) rerender(); }, 3000);
    const key = [set.length, set.reduce((t, p) => t + (p.units || 0) + (p.lat || 0), 0), gateOn, yr.timed, !!A.state.servicing, set.reduce((t, p) => t + (p.pz ? 1 : 0) + (p.dr ? 1 : 0), 0), JSON.stringify(A.state.criteria && A.state.criteria.ppu)].join('|');
    if (cache.key === key) return cache;
    const crit = A.state.criteria, SD = root.PeelSvcData, MM = root.PeelMapMarkers;
    const asOf = A.state.snapshot && A.state.snapshot.generatedAt ? Date.parse(A.state.snapshot.generatedAt) : Date.now();
    const rows = L().rows(set, {
      gateOf: gateOn ? p => G.rowOf(p) : null,
      people: p => D().estimate([p], crit, 'remaining').population,
      zoneOf: SD && SD.zoneOf ? p => { try { const z = SD.zoneOf(p); return z ? { id: z.id, name: (z.z && (z.z.name || z.z.label)) || String(z.id) } : null; } catch (e) { return null; } } : null,
      plantOf: MM && MM.plantOfDev ? p => { try { return MM.plantOfDev(p); } catch (e) { return null; } } : null,
      yearsOf: yr.fn,
      scheduleOf: yr.m ? p => root.PeelTiming.scheduleFor(p, yr.m) : null,
      asOf,
    });
    cache = { key, rows, gateOn, timed: !!yr.timed, homes: !!yr.homes, asOf, devs: set.length, munis: yr.m && yr.m.munis ? [...yr.m.munis] : [] };
    return cache;
  }
  const shownRows = c => (S.hideLapsed ? c.rows.filter(r => !r.lapsed) : c.rows);
  // By period's rows (navigation-design §5 row 82): the scope's child nodes. At Peel, a drawn area or a
  // servicing scope the municipalities; at a municipality (no plan, MTSA or census-area filter) its plans
  // and "Not in a plan", each development split by Growth › Areas' own shares (js/plan-tables.js compute,
  // the plan tree), so the rows add up to the municipality and match Areas. A plan filter's own sub-areas
  // wait for the plan scope (phase 6: a straddling development is in the filter whole).
  let kids = { r: null, mu: null, by: null };
  function childBy() {
    const st = App().state, PT = root.PeelPlanTables;
    if (!st.muni || (st.sp && st.sp.length) || (st.mtsa && st.mtsa.length) || st.daCtx || !PT || !PT.compute) return null;
    let r; try { r = PT.compute(); } catch (e) { return null; }
    const mu = r && r.nodes && r.nodes.get(`m:${st.muni}`); if (!mu || !mu.children.some(c => c.kind !== 'none')) return null;   // (no plan: its municipality row)
    if (kids.r !== r || kids.mu !== mu.id) {
      const sh = new Map(r.placed.map(x => [x.p.key, [...x.at].filter(([id]) => (r.nodes.get(id) || {}).parent === mu.id).map(([id, s]) => [id, r.nodes.get(id).name, s])]));
      kids = { r, mu: mu.id, by: row => { const a = sh.get(row.id); return a && a.length ? a : [[`n:${row.municipality}`, 'Not in a plan', 1]]; } };
    }
    return kids.by;
  }

  // ---- Pieces ----------------------------------------------------------------------------------
  const cutStages = () => (L().CUTOFFS.find(x => x.key === S.cutoff) || L().CUTOFFS[3]).stages;
  // A row's figure at the cut-off.
  const rowVal = r => cutStages().reduce((t, s) => t + (S.measure === 'people' ? (r.left > 0 ? r.people * r.units[s] / r.left : 0) : r.units[s]), 0);
  // A thin bar: the cell's stages, committed first, each named on hover.
  function stackHTML(cells, bucket) {
    const LG = L(), st = cutStages(), parts = st.map(s => [s, LG.BUCKETS.filter(b => !bucket || b.key === bucket).reduce((t, b) => t + cells[b.key][s][S.measure], 0)]);
    const tot = parts.reduce((t, [, v]) => t + v, 0);
    if (!(tot > 0)) return '';
    return `<span class="ldg-bar" aria-hidden="true">${parts.filter(([, v]) => v > 0).map(([s, v]) => `<span class="ldg-seg" style="width:${(v / tot * 100).toFixed(1)}%;background:var(${STAGE_TOKEN[s]})" title="${esc(LG.STAGE_LABEL[s])}: ${fmtV(v)} ${word()}"></span>`).join('')}</span>`;
  }
  function controlsHTML() {
    const LG = L();
    const cut = LG.CUTOFFS.map(c => `<button type="button" class="btn small${c.key === S.cutoff ? ' on' : ''}" data-ledger-cut="${c.key}" aria-pressed="${c.key === S.cutoff}">${esc(c.label)}</button>`).join('');
    const meas = [['units', 'Units'], ['people', 'People']].map(([k, t]) => `<button type="button" class="btn small${k === S.measure ? ' on' : ''}" data-ledger-measure="${k}" aria-pressed="${k === S.measure}">${t}</button>`).join('');
    return `<div class="ldg-ctl"><div class="ldg-grp" role="group" aria-label="Stage cut-off (this table only)">${cut}</div><div class="ldg-grp" role="group" aria-label="Units or people">${meas}</div>
      <label class="ldg-lapse small"><input type="checkbox" data-ledger-lapse${S.hideLapsed ? ' checked' : ''}> Hide possibly lapsed</label></div>`;
  }
  function legendHTML() {
    const LG = L();
    return `<p class="ldg-key small">${cutStages().map(s => `<span class="ldg-k"><span class="ldg-sw" style="background:var(${STAGE_TOKEN[s]})" aria-hidden="true"></span>${esc(LG.STAGE_LABEL[s])}</span>`).join('')}</p>`;
  }
  const disc = () => `<p class="ldg-disc small">${esc(L().DISCLAIMER)}</p>`;

  // Municipality (at a municipality, plan) × milestone, at the cut-off; the total row names the scope.
  function tableHTML(r, o = {}) {
    const LG = L(), B = LG.BUCKETS, val = (cells, b) => LG.sumOf(cells, { bucket: b, cutoff: S.cutoff, measure: S.measure });
    const munis = [...MUNIS.map(m => r.groups.get(m)).filter(Boolean), ...r.root.children.filter(g => !MUNIS.includes(g.key))];
    const plan = o.rowsBy === 'plan';
    const row = (g, cls = '', name = g.name) => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(name)}</th>${B.map(b => `<td class="n">${fmtV(val(g.cells, b.key))}${stackHTML(g.cells, b.key)}</td>`).join('')}<td class="n"><strong>${fmtV(val(g.cells, null))}</strong>${stackHTML(g.cells, null)}</td></tr>`;
    return `<div class="hyd-scroll"><table class="dt ldg-table" data-info="by-period"><caption>${esc(word() === 'people' ? 'People' : 'Units left to build')} by ${plan ? 'plan' : 'municipality'} and milestone <span class="muted">(${esc((LG.CUTOFFS.find(c => c.key === S.cutoff) || {}).label || '')})</span><br><span class="muted small">${esc(LG.DISCLAIMER)}</span></caption>
      <thead><tr><th scope="col">${plan ? 'Plan' : 'Municipality'}</th>${B.map(b => `<th scope="col" class="n">${esc(b.label)}</th>`).join('')}<th scope="col" class="n">Total</th></tr></thead>
      <tbody>${munis.map(g => row(g)).join('')}</tbody><tfoot>${row(r.root, 'ldg-peel', o.scope || r.root.name)}</tfoot></table></div>`;
  }

  const SORTS = {
    units: (a, b) => rowVal(b) - rowVal(a),
    name: (a, b) => a.name.localeCompare(b.name),
    muni: (a, b) => a.municipality.localeCompare(b.municipality) || rowVal(b) - rowVal(a),
    stage: (a, b) => L().STAGES.indexOf(a.capacityStage) - L().STAGES.indexOf(b.capacityStage) || rowVal(b) - rowVal(a),
    year: (a, b) => yearOf(a) - yearOf(b) || rowVal(b) - rowVal(a),
    tier: (a, b) => tierRank(a) - tierRank(b) || rowVal(b) - rowVal(a),
  };
  // ---- Confidence tier (Phase 4) ------------------------------------------------------------------
  const tierRank = r => (r.confidence ? L().TIERS.findIndex(t => t.key === r.confidence.tier) : 9);
  const tierWhy = c => [`${c.tier}: ${c.label}`, ...c.reasons, ...c.flags.map(f => `lowered a step: ${f}`)].join('; ');
  const tierHTML = r => (r.confidence ? `<span class="ldg-tier" title="${esc(tierWhy(r.confidence))}">${esc(r.confidence.tier)}</span>${r.confidence.flags.length ? '<small>flagged</small>' : ''}` : '');
  // The tiers, and how they reconcile: A + B the committed developments, C the approved ones with no
  // permit, D + E the proposed ones (each before its flags lower it).
  function tiersHTML(rows) {
    const LG = L(), t = LG.totals(rows), tt = t.tiers;
    const line = x => `<tr><th scope="row"><span class="ldg-tier">${x.key}</span> ${esc(x.label)}</th><td class="n">${fmtNum(tt[x.key].rows)}</td><td class="n">${fmtNum(Math.round(tt[x.key].left))}</td><td class="n">${fmtNum(tt[x.key].flagged)}</td></tr>`;
    const com = rows.filter(r => r.committedPeel).length, appr = rows.filter(r => !r.committedPeel && r.committedD51).length;
    return `<div class="hyd-scroll"><table class="dt ldg-tiers"><caption>Confidence <span class="muted">(one tier per development; a flag lowers it one step)</span><br><span class="muted small">${esc(LG.DISCLAIMER)}</span></caption>
      <thead><tr><th scope="col">Tier</th><th scope="col" class="n">Developments</th><th scope="col" class="n">Units left</th><th scope="col" class="n">Flagged</th></tr></thead>
      <tbody>${LG.TIERS.map(line).join('')}</tbody></table></div>
      <p class="small muted">Before flags: A + B = ${fmtNum(tt.A.base + tt.B.base)} developments, the ${fmtNum(com)} committed (a building or site servicing permit); C = ${fmtNum(tt.C.base)}, the ${fmtNum(appr)} approved with no permit; D + E = ${fmtNum(tt.D.base + tt.E.base)}, the ${fmtNum(rows.length - com - appr)} proposed. Tiers as drafted in the plan; still to confirm with the Region.</p>`;
  }

  // ---- Expected year (Phase 3) -------------------------------------------------------------------
  const yearOf = r => (r.expectedYear && r.expectedYear.likely != null ? r.expectedYear.likely : 9999);
  // What the year stands on, in words: "based on 351 similar sites (in review, 100+ units), 58 of them
  // finished; rates from 212 Brampton townhouse files; timed with Mississauga's completions".
  function basisText(r) {
    const e = r.expectedYear, b = e && e.basis, T = root.PeelTiming, PH = P();
    if (!b) return '';
    const st = PH && PH.PHASE_BY_KEY[b.stage] ? PH.PHASE_BY_KEY[b.stage].label.toLowerCase() : b.stage;
    const size = T && T.SIZE_LABEL ? T.SIZE_LABEL[b.size] : b.size;
    const [rm, rt] = String(b.rates || '*|*').split('|'), typeW = rt === '*' ? 'files' : rt === 'unknown' ? 'files of no stated type' : `${(T && T.BTYPE_LABEL[rt] || rt).toLowerCase()} files`;
    const parts = [b.n ? `based on ${fmtNum(b.n)} similar sites (${st}, ${size}), ${fmtNum(b.done)} of them finished` : 'no similar sites to compare with'];
    if (b.queued) parts.push('waiting longer than similar sites ever have: timed by the homes the population needs');
    if (b.ratesN) parts.push(`rates from ${fmtNum(b.ratesN)} ${rm === '*' ? 'Peel' : esc(rm)} ${typeW}`);
    if (b.borrowed) parts.push(`timed with ${MISSING_DATES_TEXT(r.municipality)}`);
    return parts.join('; ');
  }
  // (a municipality that publishes no completion dates: its sites are timed with the others')
  const MISSING_DATES_TEXT = muni => `the completions of ${(compute().munis || []).join(' and ') || 'the other municipalities'}: ${muni} publishes no completion dates`;
  // How this is estimated: the backtest (js/timing.js backtest), worked out once per developments list. The
  // sites as they stood five years ago, timed by the curves of what was known then, against what was
  // built since; only municipalities that date completions can be checked.
  function backtestNote() {
    const T = root.PeelTiming, A = App(), m = T && T.forecastModel ? T.forecastModel() : null;
    if (!T || !T.backtest || !m || !m.munis || !m.munis.size) return '';
    const y0 = new Date().getUTCFullYear() - 5, key = `${(A.state.projects || []).length}|${y0}`;
    if (backtestNote.key !== key) {
      const r = T.backtest(A.state.projects, Date.UTC(y0, 0, 1), { testMunis: m.munis, curveMunis: m.munis });
      backtestNote.key = key;
      backtestNote.text = r.judged ? `Backtest: the ${fmtNum(r.judged)} ${esc([...m.munis].join(' and '))} sites that could be checked, timed from where they stood on Jan 1, ${y0}: ${Math.round(r.inRange / r.judged * 100)}% finished within their range (${Math.round(r.unitsInRange / r.unitsJudged * 100)}% of their units), ${Math.round(r.within1 / r.judged * 100)}% within a year of the likely year; ${fmtNum(r.beyond)} were past what the history showed then and got no year (docs/ledger/backtest.md has every year).` : '';
    }
    return backtestNote.text;
  }
  function yearHTML(r) {
    const e = r.expectedYear;
    if (!e || e.likely == null) return `<span class="muted">${e ? 'after 2051' : 'not timed'}</span>`;
    const rng = e.low != null && e.high != null && (e.low !== e.likely || e.high !== e.likely) ? `<small>${e.low}–${e.high}</small>` : e.high == null ? `<small>${e.low != null ? e.low : e.likely}–after 2051</small>` : '';
    return `<span title="${esc(basisText(r))}">${e.likely}</span>${rng}${e.basis && e.basis.borrowed ? `<small class="ldg-borrow">${esc((compute().munis || []).join(' / '))} timing</small>` : ''}`;
  }
  function flagsOf(r) {
    const f = [];
    if (r.lapsed) f.push(r.lapsed.why === 'cancelled' ? `Possibly lapsed: servicing permit ${r.lapsed.ref} cancelled by the city` : `Possibly lapsed: servicing permit issued ${r.lapsed.issued}, no building permit since`);
    if (r.unitsEstimated) f.push('Permit units estimated: a permit states none');
    return f;
  }
  // (the Forecast's full table only: a row opens the development)
  function listHTML(rows) {
    const LG = L(), list = rows.filter(r => rowVal(r) > 0).sort(SORTS[S.sort] || SORTS.units);
    const th = (k, t, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''} aria-sort="${S.sort === k ? (k === 'units' ? 'descending' : 'ascending') : 'none'}"><button type="button" class="btn small link" data-ledger-sort="${k}">${t}${S.sort === k ? ' ▾' : ''}</button></th>`;
    const tr = r => {
      const fl = flagsOf(r);
      const by = r.units.committed > 0 && r.commitBy ? `<small>committed by ${esc(COMMIT_BY[r.commitBy])}</small>` : '';
      return `<tr data-pnl-dev="${esc(r.id)}" tabindex="0" role="button" class="ldg-row${r.lapsed ? ' ldg-lapsed' : ''}"><td>${esc(r.name)}<small>${esc(r.municipality)}${r.zone ? ` · ${esc(r.zone.name)}` : ''}${r.plant && r.plant !== 'none' ? ` · ${esc(r.plant)}` : ''}</small><small class="ldg-st-sm">${esc(LG.STAGE_LABEL[r.capacityStage])}</small>${fl.map(t => `<small class="ldg-flag">⚠ ${esc(t)}</small>`).join('')}</td>
        <td class="ldg-st">${esc(LG.STAGE_LABEL[r.capacityStage])}${by}</td><td class="ldg-tc">${tierHTML(r)}</td><td class="n ldg-yr">${yearHTML(r)}</td><td class="n">${fmtV(rowVal(r))}</td></tr>`;
    };
    const shown = list.slice(0, S.rowsShown);
    return `<div class="hyd-scroll"><table class="dt ldg-list"><caption>Developments by stage, tier and expected year <span class="muted">(${fmtNum(list.length)}, ${esc(word())} at the cut-off)</span></caption>
      <thead><tr>${th('name', 'Development')}${th('stage', 'Stage', 'ldg-st')}${th('tier', 'Tier', 'ldg-tc')}${th('year', 'Expected', 'n')}${th('units', word() === 'people' ? 'People' : 'Units', 'n')}</tr></thead>
      <tbody>${shown.map(tr).join('')}</tbody></table></div>
      ${list.length > shown.length ? `<p><button type="button" class="btn small" data-ledger-more>Show ${fmtNum(Math.min(50, list.length - shown.length))} more (${fmtNum(list.length - shown.length)} left)</button></p>` : ''}
      ${disc()}`;
  }

  // ---- The model (the Forecast's folds and its full table share it; its page and What's coming draw the folds) ----
  function model() {
    const c = compute(); if (!c) return null;
    const LG = L(), rows = shownRows(c), by = childBy(), r = by ? LG.rollup(rows, by) : LG.rollup(rows, 'municipality'), t = LG.totals(rows), all = LG.totals(c.rows);
    const at = LG.sumOf(r.root.cells, { cutoff: S.cutoff, measure: S.measure });
    const com = LG.sumOf(r.root.cells, { cutoff: 'committed' }), to31 = LG.sumOf(r.root.cells, { bucket: 'to2031', cutoff: S.cutoff, measure: S.measure });
    const cutWords = CUT_WORDS[S.cutoff] || CUT_WORDS.all;
    const scope = (App().state.muni) || 'Peel';
    const answer = `${esc(scope)}: <strong>${fmtV(at)}</strong> ${word()} left to build counting <strong>${esc(cutWords)}</strong>, <strong>${fmtV(to31)}</strong> of them timed for 2026 to 2031. <strong>${fmtNum(Math.round(com))}</strong> units are committed (a building or site servicing permit). ${esc(LG.DISCLAIMER)}`;
    const notes = [];
    if (!c.gateOn) notes.push('Site servicing permits are still loading: committed counts building permits only for now.');
    if (!c.timed) notes.push('The forecast is still loading: every unit shows as not timed for now.');
    else if (!c.homes) notes.push('The population projection is still loading: sites waiting longer than similar sites ever have show as not timed for now.');
    if (all.lapsed) notes.push(`${fmtNum(all.lapsed)} development${all.lapsed === 1 ? '' : 's'} (${fmtNum(Math.round(all.lapsedUnits))} units) flagged possibly lapsed${S.hideLapsed ? ', hidden' : ''}.`);
    if (all.estimated) notes.push(`${fmtNum(all.estimated)} with permit units estimated (a permit states none: the development's units split across its permits).`);
    const figures = [
      { v: fmtV(at), u: word(), label: `left to build: ${cutWords}`, ctx: LG.DISCLAIMER },
      { v: fmtNum(Math.round(t.units.committed)), u: 'units', label: 'committed', ctx: `${root.PeelLayers && root.PeelLayers.throughText ? root.PeelLayers.throughText(root.PeelLayers.COMMIT_RUNG) : 'a site servicing or building permit'} · ${LG.DISCLAIMER}` },
      { v: fmtV(to31), u: word(), label: 'timed for 2026 to 2031', ctx: `Forecast view's model, likely · ${LG.DISCLAIMER}` },
      { v: fmtNum(t.rows), u: 'developments', label: 'with homes left to build', ctx: `of ${fmtNum(c.devs)} shown` },
    ];
    const method = `One row per development (the developments shown, as the Overview counts them), its units left to build split by stage. <strong>Committed</strong> (the Peel rule, settled Oct 21, 2026): a site servicing permit (filed or issued) commits the whole development; a building permit commits only the units it covers, not yet built. A residential permit stating no units takes the development's units split evenly across its permits (flagged). Septic sites never count. <strong>Plan approved, not committed</strong>: draft or site plan approval (MECP D-5-1), no permit yet. <strong>In review or zoning approved</strong>: zoning, draft plan or site plan in review, or zoning approved with no plan approval yet. <strong>Pre-application</strong>: pre-consultation. The stages are the commitment ladder's (Explore › Growth in an area draws each rung), so the figures here and there are the same. <strong>Possibly lapsed</strong>: a servicing permit issued 3 or more years ago with no building permit since, or cancelled by the city; its commitment drops back to the development's planning stage (approved, not committed, for an approved site). Milestone buckets share each development's homes out by the Forecast view's time-in-stage model (likely band), so they add up to its yearly totals; homes the calibrated approval and completion rates do not expect to finish, and those beyond its last year, are after 2051 or not timed. <strong>Expected year</strong> (Phase 3): the year by which half of a development's expected homes are finished in that model, with its range from the fast to the slow band; hover the year for what it is based on (how many similar sites, of what stage and size, and the files the rates come from). The timing comes from the municipalities that date their completions (${esc((compute().munis || []).join(' and ') || 'none yet')}); the others publish no completion dates, so their sites are timed the same way and marked. ${backtestNote()} <strong>Confidence tier</strong> (Phase 4, as drafted in the plan, to confirm with the Region): A underway (a building permit, and its permits\u2019 history says it is being built), B committed, C approved with no permit, D in review, E early (pre-consultation, or an official plan amendment only). One step lower for any of: no file activity in 3 years, a plan superseded by a newer file, a site servicing permit out of order, one possibly lapsed. People at Peel design criteria. The table's rows are the municipalities; at a municipality, its plans and Not in a plan, each development split by its share of each plan as Growth › Areas places it. Every parent row equals the sum of its rows (check ${r.check < 1e-6 ? '0' : r.check.toFixed(3)}).`;
    const sources = 'Planning applications and building permits (Mississauga, Brampton, Caledon open data); site servicing permits from the city building permit feeds (data/dc-gate.json, weekly); the Forecast view’s calibration. Public data only: no Region model, SCADA or Development Services data.';
    return { c, rows, r, t, all, answer, notes, figures, method, sources, scope, rowsBy: by ? 'plan' : 'municipality' };
  }

  // By period: the cut-off, Units | People, the table and its notes (the Forecast panel's fold, and the
  // full table's top).
  const periodHTML = m => `${controlsHTML()}<p class="small muted ldg-hint">The cut-off counts stages for this table only; the Scenario’s Count sets the rest of the app.</p>${legendHTML()}${tableHTML(m.r, { rowsBy: m.rowsBy, scope: m.scope })}
      ${m.notes.length ? `<ul class="ldg-notes small muted">${m.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}`;
  function bodyHTML(m) {
    return `${periodHTML(m)}
      ${tiersHTML(m.rows)}
      ${listHTML(m.rows)}
      ${sinceHTML(m.rows)}`;
  }

  // The Forecast panel's folds (js/timing.js renderTiming): By period (the table, its own cut-off), How
  // sure (the tiers) and Since the last snapshot. The developments list is the full table (#ledger-body).
  // Nothing in a fold opens a scope: a page draws folds as they are (their names are text).
  function periodFolds() {
    const m = model(); if (!m) return [];
    const hl = U.hlP ? U.hlP(m.answer) : `<p class="hl">${m.answer}</p>`, n = m.rows.filter(r => rowVal(r) > 0).length;
    return [
      { id: FOLD_ID.period, title: 'By period', open: OPEN.period, html: `${hl}${periodHTML(m)}<p class="small"><button type="button" class="btn small link ldg-ft" data-at="growth:timing" data-full-table="growth" data-ft-go="by stage, tier and expected year">The ${fmtNum(n)} developments, with stage, tier and expected year (full table) ›</button></p>` },
      { id: FOLD_ID.tiers, title: 'How sure (tiers A to E)', open: OPEN.tiers, html: tiersHTML(m.rows) },
      { id: FOLD_ID.since, title: 'Since the last snapshot', open: OPEN.since, html: sinceHTML(m.rows, { head: false, links: false }) },
    ];
  }
  // A page draws its folds from the panel: as the reader left them now, not as they were when it was set.
  const foldsNow = folds => (folds || []).map(f => { const k = foldKey(f); return k ? { ...f, open: OPEN[k] } : f; });
  // The Forecast's panel put back on screen from its stored HTML (js/panel.js sync, e.g. back on the map
  // from a page): its folds as the reader left them (js/timing.js onMount).
  const syncFolds = host => { for (const [k, id] of Object.entries(FOLD_ID)) { const d = host && host.querySelector ? host.querySelector(`#${id}`) : null; if (d && d.open !== OPEN[k]) d.open = OPEN[k]; } };
  // The Forecast's panel again with fresh folds (its forecast as it was: only the folds change; set from
  // scratch by js/timing.js otherwise), for the scope it was made for.
  function refresh() {
    const PN = root.PeelPanel, e = PN && PN.get ? PN.get('growth:timing') : null;
    if (e && e.spec && PN.scopeId && e.scope === PN.scopeId()) PN.set('growth:timing', { ...e.spec, folds: periodFolds() });
  }
  const openPeriod = () => { if (OPEN.period) return; OPEN.period = true; refresh(); };

  // ---- The annual snapshot (Phase 5: js/ledger-snapshot.js, scripts/build-ledger.js) -------------
  const LS = () => root.PeelLedgerSnapshot;
  // Export › Pipeline snapshot (CSV): the rows shown, in the snapshot's fixed template, now (not frozen).
  function exportSnapshotCSV() {
    const m = model(), X = root.PeelExports; if (!m || !LS() || !X) return;
    const A = App(), snap = A.state.snapshot, src = snap && snap.generatedAt ? snap.generatedAt.slice(0, 10) : null, today = new Date().toISOString().slice(0, 10);
    const s = LS().snapshot(m.rows, { name: `export-${today}`, sourceDate: src, frozenAt: null, scope: `${m.scope}, the developments shown on the map${unfiltered() ? ' (no filters)' : ' (with the filters set)'}`, notes: ['An export of the app, not a frozen annual snapshot: those are written by scripts/build-ledger.js (data/ledger/).'] });
    X.download(`peel-pipeline-snapshot-${today}.csv`, LS().toCSV(s), 'text/csv');
  }
  // Peel with no filters: the set a frozen snapshot is taken on (scripts/build-ledger.js appSet).
  function unfiltered() {
    const A = App(); if (!A || !A.state || !DU()) return false;
    const st = A.state;
    return DU().overviewSet().length === st.projects.filter(p => p.phase !== 'cancelled' && (p.kinds || []).includes('application') && p.newBuild).length;
  }
  // "Since the last snapshot": the latest frozen snapshot (data/ledger/index.json) against today's rows.
  const SNAP = { index: undefined, last: null, loading: false };
  function loadSnapshots() {
    if (SNAP.index !== undefined || SNAP.loading || typeof fetch !== 'function') return;
    SNAP.loading = true;
    fetch('data/ledger/index.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(idx => {
      const list = (idx && idx.snapshots) || [], latest = list[list.length - 1];
      SNAP.index = list;
      if (!latest) { SNAP.loading = false; if (isOn()) rerender(); return null; }   // (the panel's fold stays left out: only the full table says so)
      return fetch(`data/ledger/${encodeURIComponent(latest.name)}.json`).then(r => (r.ok ? r.json() : null)).catch(() => null).then(s => { SNAP.last = s; SNAP.loading = false; landed(); });
    });
  }
  // o.head === false: no heading (the panel's fold names it); o.links === false: names as text, not buttons
  // (a fold is drawn as it is on a page, where a development button would open it in the hidden map), and
  // nothing while there is nothing to compare (the full table says why).
  function sinceHTML(rows, o = {}) {
    loadSnapshots();
    if (!LS()) return '';
    if (o.links === false && (SNAP.index === undefined || !SNAP.last)) return '';
    if (SNAP.index === undefined) return '<p class="small muted">Looking for the last frozen snapshot…</p>';
    const head = o.head === false ? '' : '<h3 class="sub-title">Since the last snapshot</h3>';
    if (!SNAP.last) return `${head}<p class="small muted">No frozen snapshot yet. The first is written with <code>node scripts/build-ledger.js</code> (docs/ledger/annual-procedure.md).</p>`;
    if (!unfiltered()) return `${head}<p class="small muted">Against the ${esc(SNAP.last.name)} snapshot (data as of ${esc(SNAP.last.sourceDate || '–')}): clear the filters to compare, as snapshots are taken on all of Peel.</p>`;
    const d = LS().diff(SNAP.last, LS().snapshot(rows, {})), B = L().BUCKETS, bl = k => (B.find(b => b.key === k) || {}).label || k;
    const li = (r, extra = '') => `<li>${o.links === false ? `<span>${esc(r.name || r.row.name)}</span>` : `<button type="button" class="btn small link" data-pnl-dev="${esc(r.id || r.row.id)}">${esc(r.name || r.row.name)}</button>`} <span class="muted">${esc(r.municipality || r.row.municipality)}</span>${extra}</li>`;
    const part = (title, list, f) => (list.length ? `<details class="pnl-fold"><summary>${esc(title)} (${fmtNum(list.length)})</summary><ul class="small ldg-diff">${list.slice(0, 60).map(f).join('')}</ul>${list.length > 60 ? `<p class="small muted">+ ${fmtNum(list.length - 60)} more in the CSV.</p>` : ''}</details>` : '');
    return `${head}<p class="small">Against <strong>${esc(SNAP.last.name)}</strong> (data as of ${esc(SNAP.last.sourceDate || '–')}): <strong>${fmtNum(d.counts.new)}</strong> new, <strong>${fmtNum(d.counts.dropped)}</strong> dropped (built, withdrawn or held aside), <strong>${fmtNum(d.counts.moved)}</strong> moved milestone, <strong>${fmtNum(d.counts.tier)}</strong> changed tier; units left to build ${d.unitsDelta >= 0 ? '+' : '−'}${fmtNum(Math.abs(Math.round(d.unitsDelta)))}.</p>
      ${part('New', d.new, r => li(r))}${part('Dropped', d.dropped, r => li(r))}
      ${part('Moved milestone', d.moved, x => li(x, ` <small>${esc(bl(x.from))} → ${esc(bl(x.to))}</small>`))}
      ${part('Changed tier', d.tier, x => li(x, ` <small>${esc(x.from)} → ${esc(x.to)}</small>`))}
      <p class="small muted">${esc(L().DISCLAIMER)}</p>`;
  }

  // (the Forecast in sight: Growth › Forecast, its page or What's coming)
  const pageShown = () => { const W = root.PeelWorkspaces; return !!(W && W.mode && W.mode() === 'home' && W.page && ['outlook', 'coming'].includes(W.page())); };
  const isOn = () => { const AT = root.PeelAnalysisTabs; return !!(AT && AT.getFootTab() === 'growth' && AT.getGSub() === 'timing') || pageShown(); };
  function render() {
    const body = $('#ledger-body'); if (!body) return;
    const A = App(); if (!A || !A.state || !(A.state.projects || []).length) { body.innerHTML = '<p class="small muted">Loading the developments…</p>'; return; }
    if (root.DevScope && root.DevScope.current && root.DevScope.current()) { body.innerHTML = U.AREA_ONLY_NOTE || ''; return; }
    const m = model(); if (!m) return;
    const hl = U.hlP ? U.hlP(m.answer) : `<p class="hl">${m.answer}</p>`;
    body.innerHTML = `<h3 class="sub-title">By period</h3>${hl}${bodyHTML(m)}<details class="pnl-fold"><summary>Method and basis</summary><div class="small muted">${m.method}</div></details><details class="pnl-fold"><summary>Sources</summary><div class="small muted">${m.sources}</div></details>`;
  }
  // (the full table, and the panel's folds: the Forecast page and What's coming, js/ws-pages.js outlook,
  // draw them from the panel; an open one is drawn again now, as its pnl:set rebuild waits for a quiet
  // 200 ms, js/workspaces.js schedule, which the other panels' sets can hold off for seconds)
  const rerender = () => { render(); refresh(); if (pageShown() && root.PeelWorkspaces.renderPage) root.PeelWorkspaces.renderPage(false); };
  // (data landed: the Forecast in sight is drawn again; out of sight, its stored panel takes the fresh
  // folds, so the map's Growth › Forecast and the pages show them when they open)
  const landed = () => (isOn() ? rerender() : refresh());

  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => {
      const t = e.target && e.target.closest ? e.target : null; if (!t) return;
      const c = t.closest('[data-ledger-cut]'); if (c) { S.cutoff = c.dataset.ledgerCut; store.set('ledgerCut', S.cutoff); rerender(); return; }
      const ms = t.closest('[data-ledger-measure]'); if (ms) { S.measure = ms.dataset.ledgerMeasure; store.set('ledgerMeasure', S.measure); rerender(); return; }
      const so = t.closest('[data-ledger-sort]'); if (so) { S.sort = so.dataset.ledgerSort; store.set('ledgerSort', S.sort); rerender(); return; }
      if (t.closest('[data-ledger-more]')) { S.rowsShown += 50; rerender(); }
    });
    document.addEventListener('change', e => {
      if (e.target && e.target.matches && e.target.matches('[data-ledger-lapse]')) { S.hideLapsed = e.target.checked; store.set('ledgerHideLapsed', S.hideLapsed); rerender(); }
    });
    // (a row is a button: Enter or Space opens the development, as a click does)
    document.addEventListener('keydown', e => {
      const r = e.target && e.target.closest && e.target.closest('tr.ldg-row');
      if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); }
    });
    // (a fold the reader opened or shut: a click on its own summary, Enter or Space included. A fold drawn
    // open fires toggle too, on every redraw, and is not the reader's pick: it changes nothing. By period is
    // kept per browser, the others for the visit; nothing redraws under the click.)
    let picked = null;
    document.addEventListener('click', e => { const s = e.target && e.target.closest ? e.target.closest('summary') : null; picked = s && foldKey(s.parentElement) ? s.parentElement : null; }, true);
    document.addEventListener('toggle', e => {
      if (e.target !== picked) return;
      picked = null;
      const k = foldKey(e.target); if (!k || OPEN[k] === e.target.open) return;
      OPEN[k] = e.target.open; if (k === 'period') store.set('ledgerOpen', OPEN.period);
    }, true);
  }

  const api = { render, model, compute, settings: S, isOn, exportSnapshotCSV, unfiltered, periodFolds, foldsNow, syncFolds, openPeriod, periodOpen: () => OPEN.period, FOLD_ID };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLedgerUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
