(function (root) {
'use strict';
  // Growth › Ledger (pipeline ledger, Phase 2; docs/pipeline-ledger-plan.md): what is coming, where,
  // when and how far along. The developments shown (the Overview's set) as js/ledger.js rows:
  //   - stage cut-off buttons: Committed only · + Approved · + In review · Everything (capacity is
  //     checked at every stage, so the load can be read at any cut-off)
  //   - units / people switch
  //   - municipality × milestone table (2026 to 2031, 2032 to 2041, 2042 to 2051, after 2051 or not
  //     timed), each cell stacked by stage, committed first
  //   - the development list, sortable; a row opens the development
  // Until per-development years land (Phase 3), the milestone buckets share each development's homes
  // out by the Forecast view's time-in-stage model (likely band, js/timing.js), labelled as such.
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
  const MUNIS = ['Mississauga', 'Brampton', 'Caledon'];
  // Stage colours: one hue, darker = further along (the layer tokens).
  const STAGE_TOKEN = { committed: '--ly-built', approved: '--ly-committed', review: '--ly-proposed', early: '--ly-hatch' };   // (Early: hatched, as In review's colour is the same pale blue)
  const CUT_WORDS = { committed: 'committed only', approved: 'committed and approved', review: 'committed, approved and in review', all: 'every stage' };
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
    return { timed: T.forecastModel.key || true, homes: !!m.homes, fn: p => { const s = m.ss.sched.get(p.key), a = m.ss.after.get(p.key); return s || a ? { shares: LG.bucketShares(s ? s.likely : null, a ? a.likely : 0, P().unbuiltOf(p)) } : null; } };
  }
  function compute() {
    const A = App(); if (!A || !A.state || !L()) return null;
    const set = DU() && DU().overviewSet ? DU().overviewSet() : (A.state.filtered || []);
    const G = root.PeelDcGate, gateOn = !!(G && G.loaded && G.loaded());
    if (G && !gateOn && G.load) G.load().then(() => { cache.key = null; if (isOn()) render(); });
    const yr = yearsOfFn();
    // (the projection still loading: look again shortly, while the view is on screen)
    if ((!yr.timed || !yr.homes) && !compute.retry && typeof setTimeout === 'function') compute.retry = setTimeout(() => { compute.retry = null; if (isOn()) rerender(); }, 3000);
    const key = [set.length, set.reduce((t, p) => t + (p.units || 0) + (p.lat || 0), 0), gateOn, yr.timed, !!A.state.servicing, JSON.stringify(A.state.criteria && A.state.criteria.ppu)].join('|');
    if (cache.key === key) return cache;
    const crit = A.state.criteria, SD = root.PeelSvcData, MM = root.PeelMapMarkers;
    const asOf = A.state.snapshot && A.state.snapshot.generatedAt ? Date.parse(A.state.snapshot.generatedAt) : Date.now();
    const rows = L().rows(set, {
      gateOf: gateOn ? p => G.rowOf(p) : null,
      people: p => D().estimate([p], crit, 'remaining').population,
      zoneOf: SD && SD.zoneOf ? p => { try { const z = SD.zoneOf(p); return z ? { id: z.id, name: (z.z && (z.z.name || z.z.label)) || String(z.id) } : null; } catch (e) { return null; } } : null,
      plantOf: MM && MM.plantOfDev ? p => { try { return MM.plantOfDev(p); } catch (e) { return null; } } : null,
      yearsOf: yr.fn,
      asOf,
    });
    cache = { key, rows, gateOn, timed: !!yr.timed, homes: !!yr.homes, asOf, devs: set.length };
    return cache;
  }
  const shownRows = c => (S.hideLapsed ? c.rows.filter(r => !r.lapsed) : c.rows);

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
    return `<div class="ldg-ctl"><div class="ldg-grp" role="group" aria-label="Stage cut-off">${cut}</div><div class="ldg-grp" role="group" aria-label="Units or people">${meas}</div>
      <label class="ldg-lapse small"><input type="checkbox" data-ledger-lapse${S.hideLapsed ? ' checked' : ''}> Hide possibly lapsed</label></div>`;
  }
  function legendHTML() {
    const LG = L();
    return `<p class="ldg-key small">${cutStages().map(s => `<span class="ldg-k"><span class="ldg-sw" style="background:var(${STAGE_TOKEN[s]})" aria-hidden="true"></span>${esc(LG.STAGE_LABEL[s])}</span>`).join('')}</p>`;
  }
  const disc = () => `<p class="ldg-disc small">${esc(L().DISCLAIMER)}</p>`;

  // Municipality × milestone, at the cut-off.
  function tableHTML(r) {
    const LG = L(), B = LG.BUCKETS, val = (cells, b) => LG.sumOf(cells, { bucket: b, cutoff: S.cutoff, measure: S.measure });
    const munis = [...MUNIS.map(m => r.groups.get(m)).filter(Boolean), ...r.root.children.filter(g => !MUNIS.includes(g.key))];
    const row = (g, cls = '') => `<tr${cls ? ` class="${cls}"` : ''}><th scope="row">${esc(g.name)}</th>${B.map(b => `<td class="n">${fmtV(val(g.cells, b.key))}${stackHTML(g.cells, b.key)}</td>`).join('')}<td class="n"><strong>${fmtV(val(g.cells, null))}</strong>${stackHTML(g.cells, null)}</td></tr>`;
    return `<div class="hyd-scroll"><table class="dt ldg-table"><caption>${esc(word() === 'people' ? 'People' : 'Units left to build')} by municipality and milestone <span class="muted">(${esc((LG.CUTOFFS.find(c => c.key === S.cutoff) || {}).label || '')})</span><br><span class="muted small">${esc(LG.DISCLAIMER)}</span></caption>
      <thead><tr><th scope="col">Municipality</th>${B.map(b => `<th scope="col" class="n">${esc(b.label)}</th>`).join('')}<th scope="col" class="n">Total</th></tr></thead>
      <tbody>${munis.map(g => row(g)).join('')}</tbody><tfoot>${row(r.root, 'ldg-peel')}</tfoot></table></div>`;
  }

  const SORTS = {
    units: (a, b) => rowVal(b) - rowVal(a),
    name: (a, b) => a.name.localeCompare(b.name),
    muni: (a, b) => a.municipality.localeCompare(b.municipality) || rowVal(b) - rowVal(a),
    stage: (a, b) => L().STAGES.indexOf(a.capacityStage) - L().STAGES.indexOf(b.capacityStage) || rowVal(b) - rowVal(a),
  };
  function flagsOf(r) {
    const f = [];
    if (r.lapsed) f.push(r.lapsed.why === 'cancelled' ? `Possibly lapsed: servicing permit ${r.lapsed.ref} cancelled by the city` : `Possibly lapsed: servicing permit issued ${r.lapsed.issued}, no building permit since`);
    if (r.unitsEstimated) f.push('Permit units estimated: a permit states none');
    return f;
  }
  // onPage: on Home's page a row opens the development's Check a site page; in the column, the scope.
  function listHTML(rows, onPage = false) {
    const LG = L(), list = rows.filter(r => rowVal(r) > 0).sort(SORTS[S.sort] || SORTS.units);
    const th = (k, t, cls = '') => `<th scope="col"${cls ? ` class="${cls}"` : ''} aria-sort="${S.sort === k ? (k === 'units' ? 'descending' : 'ascending') : 'none'}"><button type="button" class="btn small link" data-ledger-sort="${k}">${t}${S.sort === k ? ' ▾' : ''}</button></th>`;
    const tr = r => {
      const fl = flagsOf(r);
      const by = r.units.committed > 0 && r.commitBy ? `<small>committed by ${esc(COMMIT_BY[r.commitBy])}</small>` : '';
      return `<tr ${onPage ? `data-ws-pick="${esc(r.id)}" data-ws-as="site"` : `data-pnl-dev="${esc(r.id)}"`} tabindex="0" role="button" class="ldg-row${r.lapsed ? ' ldg-lapsed' : ''}"><td>${esc(r.name)}<small>${esc(r.municipality)}${r.zone ? ` · ${esc(r.zone.name)}` : ''}${r.plant && r.plant !== 'none' ? ` · ${esc(r.plant)}` : ''}</small><small class="ldg-st-sm">${esc(LG.STAGE_LABEL[r.capacityStage])}</small>${fl.map(t => `<small class="ldg-flag">⚠ ${esc(t)}</small>`).join('')}</td>
        <td class="ldg-st">${esc(LG.STAGE_LABEL[r.capacityStage])}${by}</td><td class="n">${fmtV(rowVal(r))}</td></tr>`;
    };
    const shown = list.slice(0, S.rowsShown);
    return `<div class="hyd-scroll"><table class="dt ldg-list"><caption>Developments <span class="muted">(${fmtNum(list.length)}, ${esc(word())} at the cut-off)</span></caption>
      <thead><tr>${th('name', 'Development')}${th('stage', 'Stage', 'ldg-st')}${th('units', word() === 'people' ? 'People' : 'Units', 'n')}</tr></thead>
      <tbody>${shown.map(tr).join('')}</tbody></table></div>
      ${list.length > shown.length ? `<p><button type="button" class="btn small" data-ledger-more>Show ${fmtNum(Math.min(50, list.length - shown.length))} more (${fmtNum(list.length - shown.length)} left)</button></p>` : ''}
      ${disc()}`;
  }

  // ---- The model (the pane and Home's What's coming page share it) ----------------------------
  function model() {
    const c = compute(); if (!c) return null;
    const LG = L(), rows = shownRows(c), r = LG.rollup(rows, 'municipality'), t = LG.totals(rows), all = LG.totals(c.rows);
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
      { v: fmtNum(Math.round(t.units.committed)), u: 'units', label: 'committed', ctx: `building or site servicing permit · ${LG.DISCLAIMER}` },
      { v: fmtV(to31), u: word(), label: 'timed for 2026 to 2031', ctx: `Forecast view's model, likely · ${LG.DISCLAIMER}` },
      { v: fmtNum(t.rows), u: 'developments', label: 'with homes left to build', ctx: `of ${fmtNum(c.devs)} shown` },
    ];
    const method = `One row per development (the developments shown, as the Overview counts them), its units left to build split by stage. <strong>Committed</strong> (the Peel rule, settled Oct 21, 2026): a site servicing permit (filed or issued) commits the whole development; a building permit commits only the units it covers, not yet built. A residential permit stating no units takes the development's units split evenly across its permits (flagged). Septic sites never count. <strong>Approved, not committed</strong>: draft or site plan approval (MECP D-5-1), no permit yet. <strong>In review</strong>: zoning, draft plan or site plan in review. <strong>Early</strong>: pre-consultation. <strong>Possibly lapsed</strong>: a servicing permit issued 3 or more years ago with no building permit since, or cancelled by the city; its commitment drops one step. Milestone buckets share each development's homes out by the Forecast view's time-in-stage model (likely band), so they add up to its yearly totals; homes the calibrated approval and completion rates do not expect to finish, and those beyond its last year, are after 2051 or not timed. A year per development comes in Phase 3. People at Peel design criteria. Every parent row equals the sum of its rows (check ${r.check < 1e-6 ? '0' : r.check.toFixed(3)}).`;
    const sources = 'Planning applications and building permits (Mississauga, Brampton, Caledon open data); site servicing permits from the city building permit feeds (data/dc-gate.json, weekly); the Forecast view’s calibration. Public data only: no Region model, SCADA or Development Services data.';
    return { c, rows, r, t, all, answer, notes, figures, method, sources, scope };
  }

  function bodyHTML(m, onPage = false) {
    return `${controlsHTML()}${legendHTML()}${tableHTML(m.r)}
      ${m.notes.length ? `<ul class="ldg-notes small muted">${m.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
      ${listHTML(m.rows, onPage)}`;
  }

  const isOn = () => { const AT = root.PeelAnalysisTabs; return !!(AT && AT.getFootTab() === 'growth' && AT.getGSub() === 'ledger') || !!(root.PeelWorkspaces && root.PeelWorkspaces.mode && root.PeelWorkspaces.mode() === 'home' && root.PeelWorkspaces.page && root.PeelWorkspaces.page() === 'coming'); };
  function render() {
    const body = $('#ledger-body'); if (!body) return;
    const A = App(); if (!A || !A.state || !(A.state.projects || []).length) { body.innerHTML = '<p class="small muted">Loading the developments…</p>'; return; }
    if (root.DevScope && root.DevScope.current && root.DevScope.current()) { body.innerHTML = U.AREA_ONLY_NOTE || ''; return; }
    const m = model(); if (!m) return;
    const hl = U.hlP ? U.hlP(m.answer) : `<p class="hl">${m.answer}</p>`;
    body.innerHTML = `${hl}${bodyHTML(m)}<details class="pnl-fold"><summary>Method and basis</summary><div class="small muted">${m.method}</div></details><details class="pnl-fold"><summary>Sources</summary><div class="small muted">${m.sources}</div></details>`;
  }
  // Home › What's coming (js/ws-pages.js): the same view on a page.
  function page() {
    const m = model();
    if (!m) return { id: 'coming', eyebrow: 'What’s coming', name: 'What is coming, where, when and how sure?', answer: '<span class="muted">Loading the developments…</span>' };
    return { id: 'coming', name: 'What is coming, where, when and how sure?', status: { tone: 'stage', text: 'Public-data estimate' }, answer: m.answer,
      figures: m.figures, chart: bodyHTML(m, true), method: m.method, sources: m.sources,
      actions: [{ label: 'Open Growth › Ledger', attrs: { 'data-ws-full': '', 'data-at': 'growth:ledger' }, primary: true }] };
  }
  const rerender = () => { if (root.PeelWorkspaces && root.PeelWorkspaces.mode && root.PeelWorkspaces.mode() === 'home' && root.PeelWorkspaces.page() === 'coming') root.PeelWorkspaces.renderPage(true); render(); };

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
  }

  const api = { render, page, model, compute, settings: S, isOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLedgerUI = api;
})(typeof window !== 'undefined' ? window : globalThis);
