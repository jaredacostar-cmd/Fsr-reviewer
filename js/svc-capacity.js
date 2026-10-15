(function (root) {
  'use strict';
  // ---- Servicing › Capacity (Stage 2): ONE table for water and wastewater -----------------------
  // Every facility the screen checks, in one list: wastewater treatment plants, water treatment,
  // pumping into each pressure zone, water storage, wastewater pumping stations and (while
  // pipe-by-pipe results are on) the tightest sewers. Columns:
  //   Facility · System · Compared (what against what, and the basis) · Committed % · Build-out % ·
  //   Limit year · Room / over (signed words).
  // One stacked bar per row with the 90% and 100% marks; the horizon years (2031 / 2041 / 2051 and
  // the years it reaches 80 / 90 / 100%) fold under each row. Sort by limit year or by impact.
  // Nothing is computed here: each number comes from the function the old Plants / Treatment
  // sub-views used (js/capacity.js, js/masterplan.js, js/water-tab.js, the plant horizon in
  // js/svc-plants.js); this module only lays them out in one table.
  const U = root.PeelUtil || {};
  const { esc = s => String(s), fmtNum = n => String(n), fmt1 = n => String(n) } = U;

  // ---- Pure: rows, sort, cells (tests/four-tabs.test.js) ------------------------------------------
  // A row, as gathered (collect(), below):
  //   { id, sys: 'ww' | 'water', kind, name, sub, compared, basis, unit, cap, capWord,
  //     existing, built, committed, buildout, limit: { y, what, after }, horizon: { end, at: [[y, pct]],
  //     c80, c90, c100 }, small, ss }
  // cap is the 100% capacity (rated, firm or available); committed and build-out are cumulative.
  const SYSTEM = { ww: 'Wastewater', water: 'Water' };
  const pctOf = (r, v) => (r.cap > 0 ? v / r.cap * 100 : null);
  const derive = r => ({ ...r, system: SYSTEM[r.sys], pctCom: pctOf(r, r.committed), pctBo: pctOf(r, r.buildout), room: r.cap - r.buildout });
  // Limit year as a number for sorting: now first, never-reached last.
  const yNum = (y, now) => (y === 'today' ? now : y == null ? Infinity : +y);
  function sortRows(rows, by = 'limit', now = new Date().getFullYear()) {
    const imp = r => (r.pctBo == null ? -Infinity : r.pctBo);
    const cmp = by === 'impact'
      ? (a, b) => imp(b) - imp(a) || yNum(a.limit.y, now) - yNum(b.limit.y, now)
      : (a, b) => yNum(a.limit.y, now) - yNum(b.limit.y, now) || imp(b) - imp(a);
    return rows.slice().sort(cmp);
  }
  const yTxt = (y, end) => (y === 'today' ? 'now' : y == null ? `after ${end}` : `≈${y}`);
  const pctTxt = v => (v == null || !isFinite(v) ? '–' : `${Math.round(v)}%`);
  const tone = v => (v == null ? '' : v >= 100 ? 'over' : v >= 90 ? 'near' : '');
  // A quantity in the row's unit (L/s whole, ML/d and ML one decimal; small systems in m³/d).
  const qty = (r, v) => (r.small && U.capTxt ? U.capTxt(v, r.cap) : r.unit === 'L/s' ? `${fmtNum(Math.round(v))} L/s` : `${fmt1(v)} ${r.unit}`);
  const roomTxt = r => (U.roomWords ? U.roomWords(r.room, r.unit, v => qty(r, v)) : `${r.room < 0 ? 'over by' : 'room'} ${qty(r, Math.abs(r.room))}`);

  // ---- Browser -----------------------------------------------------------------------------------
  const $ = s => document.querySelector(s);
  const App = () => root.PeelApp, MP = () => root.PeelMasterPlan, Cap = () => root.PeelCapacity;
  const SvcTab = () => root.PeelSvcTab, SP = () => root.PeelSvcPlants, WTab = () => root.PeelWaterTab;
  const WT = () => root.PeelWaterTrace, SD = () => root.PeelSvcData, LB = () => root.PeelLayerBar, MM = () => root.PeelMapMarkers;
  const st = { sort: (U.store && U.store.get('capSort', 'limit')) || 'limit', open: new Set() };
  const PICK = [2031, 2041, 2051];
  // Horizon from a load function q(y) ('today' | year | null = build-out): the % at the pick years and
  // the years it reaches 80 / 90 / 100% (MP.runOut: 'today', a year, or null by the horizon end).
  function hzFromQ(q, full) {
    const end = SP().hz.end, at = PICK.filter(y => y <= end).map(y => [y, q(y) / full * 100]);
    const run = f => MP().runOut(q, () => f * full);
    return { end, at, c80: run(0.8), c90: run(0.9), c100: run(1) };
  }
  // Plants: the plant horizon table's own series (planned expansions, further growth, diversion).
  function hzPlant(pl) {
    const D0 = SP().capHorizonHTML && SP().capHorizonHTML.data; if (!D0) return null;
    const key = { Lakeview: 'booth', Clarkson: 'clarkson', Inglewood: 'inglewood' }[pl];
    const s = D0.series.find(x => x.key === key); if (!s) return null;
    const ys = D0.years, end = ys[ys.length - 1];
    const cross = t => { const i = s.v.findIndex(v => v >= t); return i < 0 ? null : i === 0 ? 'today' : ys[i]; };
    return { end, at: PICK.filter(y => ys.includes(y)).map(y => [y, s.v[ys.indexOf(y)]]), c80: cross(80), c90: cross(90), c100: cross(100), exp: s.steps && s.steps.length ? s.steps.map(x => `${x.mld} ML/d (${x.year})`).join(' → ') : '' };
  }
  function collect() {
    const A = App(); if (!A || !A.state.svcModel || !MP() || !Cap()) return null;
    const rows = [], wwB = SvcTab().wwBasis(), flowW = SvcTab().wwFlowLabel();
    // Wastewater treatment plants: flow against rated capacity; the limit is the 90% expansion trigger.
    for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) {
      const k = Cap().of(`plant:${pl}`), c = MP().cached(`plant:${pl}`, () => MP().plantCons(pl)); if (!k || !c) continue;
      rows.push({ id: `plant:${pl}`, ss: `plant:${pl}`, sys: 'ww', kind: 'plant', name: (SD().PLANT_SHORT && SD().PLANT_SHORT[pl]) || k.name, sub: 'treatment plant',
        compared: `${flowW} vs rated capacity`, basis: wwB, unit: 'ML/d', cap: k.cap, capWord: 'rated', existing: k.existing, built: k.built, committed: k.committed, buildout: k.buildout,
        limit: { y: c.out, what: '90% trigger', after: c.outAfter }, horizon: hzPlant(pl) || hzFromQ(c.q, k.cap), small: U.isSmallSystem ? U.isSmallSystem(k.cap) : false });
    }
    // Water treatment: South Peel (lake-based) and the Caledon well systems, maximum day against rated.
    const R = A.state.reports;
    if (R && R.water) {
      const sys = [['southPeel', 'wsys:lake', { zone: '1' }]];
      for (const z of ['AV13', 'CE9']) { const zz = A.state.servicing.zones.find(x => x.zone === z); if (zz) sys.push([MP().wellSystem[z], `wsys:${z}`, zz]); }
      for (const [id, ck, zone] of sys) {
        const k = Cap().of(`wsys:${id}`), c = MP().cached(ck, () => MP().waterPlantCons(zone)); if (!k || !c) continue;
        rows.push({ id: `wsys:${id}`, ss: id === 'southPeel' ? 'wsys:lake' : null, sys: 'water', kind: 'wplant', name: id === 'southPeel' ? 'South Peel water treatment' : k.name, sub: id === 'southPeel' ? 'A.P. Kennedy + Lorne Park' : 'wells',
          compared: 'Maximum day vs rated capacity', basis: 'metered', unit: 'ML/d', cap: k.cap, capWord: 'rated', existing: k.existing, built: k.built, committed: k.committed, buildout: k.buildout,
          limit: { y: c.out, what: '90% trigger' }, horizon: hzFromQ(c.q, k.cap), small: U.isSmallSystem ? U.isSmallSystem(k.cap) : false });
      }
    }
    // Pumping into each pressure zone: maximum day against firm pumping (the water tab's rows).
    const ph = { year0: SP().hz.year0, aStart: SP().hz.aStart, aYears: SP().hz.aYears, pStart: SP().hz.pStart, pYears: SP().hz.pYears, end: SP().hz.end };
    const pumps = WTab() && WTab().pumpRows ? WTab().pumpRows() : [];
    if (!pumps.length && WT() && WT().WF && !WT().WF.data) WT().loadWaterFacilities().then(d => { if (d) render(); });
    for (const r of pumps) {
      const v = r.v, rt = WTab().roomTrigger(r.rated, { today: v[0] + v[1], approved: v[2], proposed: v[3] }, ph);
      rows.push({ id: `pump:${r.name}`, sys: 'water', kind: 'pump', name: r.name, sub: 'pumping into the zone', compared: 'Maximum day vs firm pumping', basis: 'design', unit: 'ML/d', cap: r.rated, capWord: 'firm',
        existing: v[0], built: v[1], committed: v[0] + v[1] + v[2], buildout: v[0] + v[1] + v[2] + v[3],
        limit: { y: rt.c100, what: '100% firm' }, horizon: { end: ph.end, at: PICK.filter(y => y <= ph.end).map(y => [y, rt.at(y) / r.rated * 100]), c80: rt.c80, c90: rt.c90, c100: rt.c100 } });
    }
    // Storage: the 2020 Master Plan's required against available storage (its own forecast).
    const mp = R && R.masterPlan;
    if (mp && mp.storage) {
      const ys = mp.storageYears, now = MM().THIS_YEAR;
      const interp = (arr, y) => { if (y <= ys[0]) return arr[0]; for (let k = 1; k < ys.length; k++) if (y <= ys[k]) return arr[k - 1] + (arr[k] - arr[k - 1]) * (y - ys[k - 1]) / (ys[k] - ys[k - 1]); return arr[arr.length - 1]; };
      for (const s of mp.storage) {
        const rt = WTab().storageRoomTrigger(ys, s.required, s.available), av = s.available[s.available.length - 1];
        const reqNow = interp(s.required, now), reqEnd = s.required[s.required.length - 1];
        rows.push({ id: `stor:${s.facility}`, sys: 'water', kind: 'storage', name: s.facility, sub: 'storage', compared: 'Required vs available storage', basis: 'mp', unit: 'ML', cap: av, capWord: 'available',
          existing: reqNow, built: 0, committed: reqNow, buildout: reqEnd, limit: { y: rt.c100, what: 'required > available' },
          horizon: { end: ys[ys.length - 1], at: PICK.filter(y => y <= ys[ys.length - 1]).map(y => [y, interp(s.required, y) / (interp(s.available, y) || av) * 100]), c80: rt.c80, c90: rt.c90, c100: rt.c100 } });
      }
    }
    // Wastewater pumping stations: peak wet weather flow against firm capacity (design criteria).
    for (const a of A.state.servicing.psAreas || []) {
      const k = Cap().of(`ps:${a.id}`), c = MP().cached(`ps:${a.id}`, () => MP().psCons(a)); if (!k || !c) continue;
      rows.push({ id: `ps:${a.id}`, ss: `ps:${a.id}`, sys: 'ww', kind: 'ps', name: k.name.replace(/ pumping station$/i, ''), sub: 'pumping station', compared: 'Peak wet weather vs firm capacity', basis: 'design', unit: 'L/s', cap: k.cap, capWord: 'firm',
        existing: k.existing, built: k.built, committed: k.committed, buildout: k.buildout, limit: { y: c.out, what: '100% firm' }, horizon: hzFromQ(c.q, k.cap) });
    }
    // Tightest sewers: only while pipe-by-pipe results are on (off for now: left to the Region's model).
    if (U.PIPE_RESULTS && MM().SEW.data && root.PeelTightPipes) {
      const SC = root.PeelSewerCap, entries = [];
      for (let i = 0; i < MM().SEW.data.pipes.length; i++) { const s = SC.pipeStats(i, null); if (s.r1 != null) entries.push({ i, r1: s.r1 }); }
      for (const x of root.PeelTightPipes.topTightPipes(entries, 5)) {
        const c = MP().cached(`pipe:${x.i}`, () => MP().pipeCons(x.i)); if (!c || c.check) continue;
        rows.push({ id: `pipe:${x.i}`, sys: 'ww', kind: 'pipe', name: c.name, sub: c.sub, compared: 'Peak wet weather vs full-pipe capacity', basis: 'design', unit: 'L/s', cap: c.cap, capWord: 'full-pipe',
          existing: c.q('today'), built: 0, committed: c.util.com * c.cap, buildout: c.util.bo * c.cap, limit: { y: c.out, what: '100% full pipe' }, horizon: hzFromQ(c.q, c.cap) });
      }
    }
    return rows.map(derive);
  }
  // The stacked bar: existing, built, committed, proposed; marks at 90% and 100% of capacity.
  function barOf(r) {
    if (!LB()) return '';
    const f = v => qty(r, v);
    const seg = (layer, v) => ({ layer, value: v, title: `${LB().LABEL[layer]}: ${f(v)} (${pctTxt(pctOf(r, v))} of ${r.capWord})` });
    return LB().barHTML({ small: true, segments: [seg('existing', r.existing), seg('built', r.built), seg('committed', Math.max(0, r.committed - r.existing - r.built)), seg('proposed', Math.max(0, r.buildout - r.committed))],
      rated: r.cap, trigger: 0.9 * r.cap, max: Math.max(r.cap * 1.3, r.buildout), unit: r.small ? '' : r.unit, fmt: v => (r.small ? f(v) : r.unit === 'L/s' ? fmtNum(Math.round(v)) : fmt1(v)),
      ratedLabel: `100% ${r.capWord}: ${f(r.cap)}`, triggerLabel: r.kind === 'plant' || r.kind === 'wplant' ? '90% expansion trigger (2020 Master Plan)' : '90% of capacity',
      label: `${r.name}: ${pctTxt(r.pctCom)} of ${r.capWord} capacity committed, ${pctTxt(r.pctBo)} at build-out` });
  }
  const hzCell = (y, end) => (y === 'today' ? 'now' : y == null ? `after ${end}` : String(y));
  function horizonHTML(r) {
    const h = r.horizon; if (!h) return '<p class="small muted">No horizon for this row.</p>';
    return `<table class="dt svc-table cap-hz-t"><thead><tr>${h.at.map(([y]) => `<th class="n">${y}</th>`).join('')}<th class="n">Reaches 80%</th><th class="n">Reaches 90%</th><th class="n">Reaches 100%</th></tr></thead>
      <tbody><tr>${h.at.map(([, v]) => `<td class="n ${tone(v)}">${pctTxt(v)}</td>`).join('')}<td class="n">${hzCell(h.c80, h.end)}</td><td class="n">${hzCell(h.c90, h.end)}</td><td class="n bo">${hzCell(h.c100, h.end)}</td></tr></tbody></table>
      <p class="small muted">${r.kind === 'plant' ? `As the plant horizon (Charts and method): approved growth from ${SP().hz.aStart} over ${SP().hz.aYears} years, proposed from ${SP().hz.pStart} over ${SP().hz.pYears}${h.exp ? `; % of the rated capacity in that year, with planned expansions ${esc(h.exp)}` : ''}.` : r.kind === 'storage' ? `The 2020 Master Plan's own forecast (to ${h.end}).` : `Approved growth from ${SP().hz.aStart} over ${SP().hz.aYears} years, proposed from ${SP().hz.pStart} over ${SP().hz.pYears} (Horizon years).`}</p>`;
  }
  function rowHTML(r) {
    const open = st.open.has(r.id), end = r.horizon ? r.horizon.end : SP().hz.end;
    const lim = `${yTxt(r.limit.y, end)}<small>${esc(r.limit.what)}${r.limit.after !== undefined ? ` · with planned expansions ${yTxt(r.limit.after, end)}` : ''}</small>`;
    const name = r.ss ? `<button type="button" class="btn small link" data-ss="${esc(r.ss)}" title="Open this as a scope">${esc(r.name)}</button>` : esc(r.name);
    // One row per facility; in the narrow panel each row lays out as a small card (css: .cap-all),
    // each cell carrying its column name (data-l).
    return `<tr class="cap-row" data-basis="${r.basis}" data-cap-id="${esc(r.id)}">
      <td class="c-fac"><button type="button" class="cap-fold" data-cap-fold="${esc(r.id)}" aria-expanded="${open}" aria-label="Horizon years for ${esc(r.name)}">${open ? '▾' : '▸'}</button> ${name}<small>${esc(r.sub)}${r.small ? ' · small system' : ''}</small>${barOf(r)}</td>
      <td class="c-sys" data-l="System">${r.sys === 'water' ? '💧 ' : ''}${r.system}</td>
      <td class="c-cmp" data-l="Compared">${esc(r.compared)} ${U.basisChip ? U.basisChip(r.basis) : esc(r.basis)}</td>
      <td class="n c-com" data-l="Committed">${pctTxt(r.pctCom)}</td><td class="n c-bo ${tone(r.pctBo)}" data-l="Build-out"><strong>${pctTxt(r.pctBo)}</strong></td>
      <td class="n c-lim" data-l="Limit year">${lim}</td><td class="n c-room${r.room < 0 ? ' over' : ''}" data-l="Room / over">${roomTxt(r)}</td>
      <td class="n xc" data-l="Capacity">${qty(r, r.cap)} ${r.capWord}</td><td class="n xc" data-l="Today">${qty(r, r.existing + r.built)}</td><td class="n xc" data-l="Committed">${qty(r, r.committed)}</td><td class="n xc" data-l="Build-out">${qty(r, r.buildout)}</td></tr>
      ${open ? `<tr class="cap-hz"><td colspan="11">${horizonHTML(r)}</td></tr>` : ''}`;
  }
  function tableHTML(rows) {
    const sortBtn = (k, t, tip) => `<button type="button" class="btn small${st.sort === k ? ' on' : ''}" data-cap-sort="${k}" aria-pressed="${st.sort === k}" title="${tip}">${t}</button>`;
    const nOver = rows.filter(r => r.pctBo >= 100).length, soon = sortRows(rows, 'limit', MM().THIS_YEAR)[0];
    const hl = `<strong>${rows.length}</strong> facilities, water and wastewater together${nOver ? `: <strong>${nOver}</strong> over 100% of capacity at build-out` : ': none over 100% at build-out'}${soon && soon.limit.y != null ? `; the soonest limit is <strong>${esc(soon.name)}</strong> (${yTxt(soon.limit.y, SP().hz.end)}, ${esc(soon.limit.what)})` : ''}.`;
    return `${U.hlP ? U.hlP(hl) : `<p>${hl}</p>`}
      <div class="svc-head"><div class="svc-switches"><div class="svc-switch" role="group" aria-label="Sort"><span class="muted small">Sort</span>${sortBtn('limit', 'Limit year', 'Soonest limit year first')}${sortBtn('impact', 'Impact', 'Most loaded at build-out first (% of capacity)')}</div>${SvcTab().optSwitch('tech', 'Columns', [['off', 'Simple'], ['on', 'Engineering']])}</div></div>
      <table class="dt svc-table cap-all" data-info="servicing-capacity"><thead><tr><th>Facility</th><th>System</th><th>Compared</th><th class="n">Committed</th><th class="n">Build-out</th><th class="n">Limit year</th><th class="n">Room / over<br><small>at build-out, to 100%</small></th><th class="n xc">Capacity</th><th class="n xc">Today</th><th class="n xc">Committed</th><th class="n xc">Build-out</th></tr></thead>
      <tbody>${sortRows(rows, st.sort, MM().THIS_YEAR).map(rowHTML).join('')}</tbody></table>
      ${LB() ? LB().legendHTML([{ layer: 'existing', text: 'Existing (basis on each row)' }, { layer: 'built' }, { layer: 'committed' }, { layer: 'proposed' }, 'trigger', 'rated', 'over']) : ''}
      <p class="small muted">Committed = existing + built + committed as a % of the row's capacity (rated for treatment, firm for pumping, available for storage); build-out adds the proposed applications. The limit year is when the row reaches its limit: the 2020 Master Plan's 90% expansion trigger for treatment, 100% of firm capacity for pumping, required above available for storage. ▸ opens the horizon years under a row.${U.PIPE_RESULTS ? '' : ' Sewer pipes are not in this table: pipe-by-pipe results are left to the Region’s model.'} Charts, the plant horizon assumptions and method notes: <button type="button" class="btn small link" data-cap-detail>Charts and method</button>.</p>`;
  }
  function render() {
    const el = $('#svc-capacity-body'); if (!el) return;
    if (root.DevScope && root.DevScope.current()) return;   // (hidden at a site: PeelAnalysisTabs.HIDDEN)
    const rows = collect();
    if (!rows) { el.innerHTML = U.skel ? U.skel('Loading the servicing model') : ''; return; }
    el.innerHTML = `${U.SCREEN_NOTE || ''}${tableHTML(rows)}`;
    syncDetail();
  }
  // The plant and water charts behind the table fold under "Charts and method" (kept in this browser).
  let detail = !!(U.store && U.store.get('capDetail', false));
  function syncDetail() { for (const n of document.querySelectorAll('.svc-detail')) n.classList.toggle('cap-detail-on', detail); const b = $('[data-cap-detail]'); if (b) b.setAttribute('aria-expanded', String(detail)); }
  // ---- Servicing › Checks: the servicing model against the published figures --------------------
  // The 2020 Master Plan against this tracker, the 2025 plant reports against the model (with each
  // plant's calibration factor), the 2025 water production and the Caledon groundwater systems.
  // (The existing water facilities with the Master Plan's water comparison, and the hydraulic check
  // while its Labs switch is on, are the panes below this one.) Data checks (freshness, duplicates,
  // the permit check) are in Records › Checks.
  function renderChecks() {
    const el = $('#svc-checks-body'); if (!el) return;
    if (root.DevScope && root.DevScope.current()) return;
    const MC = root.ModelChecks || {}, sec = k => { try { const v = typeof MC[k] === 'function' ? MC[k]() : MC[k]; return typeof v === 'string' ? v : ''; } catch (e) { return ''; } };
    const body = ['wwMasterPlanVsTracker', 'wwReportsVsModel', 'waterProduction', 'caledonGroundwater'].map(sec).join('');
    el.innerHTML = `${U.SCREEN_NOTE || ''}<div class="svc-head"><div class="svc-switches">${SvcTab().optSwitch('tech', 'Columns', [['off', 'Simple'], ['on', 'Engineering']])}</div></div>
      ${U.hlP ? U.hlP('How the servicing model compares with the 2020 Master Plan and the 2025 reports: the plants, water production and the Caledon wells. Data checks (freshness, duplicates, permits) are in Records.') : ''}
      ${body || (U.skel ? U.skel('Loading the servicing model') : '')}`;
  }
  // ---- Servicing › Network: the bar over the blocks, stations and zones ------------------------------
  // A tapped row is selected (the map shows it and everything upstream of it); the bar names it and
  // offers "What loads this?" (its servicing scope: the developments loading it) and "Show upstream".
  function renderNetBar() {
    const el = $('#svc-net-bar'); if (!el) return;
    if (root.DevScope && root.DevScope.current()) { el.innerHTML = ''; return; }
    const ST = root.PeelSewerTrace, id = ST && ST.svcFocus && ST.svcFocus.id, a = id && SD() && SD().svcById.get(id);
    const name = a ? (a.zone ? `Pressure zone ${a.zone}` : SD().drName ? SD().drName(a) : a.name || id) : '';
    const up = a && !a.zone, dis = a ? '' : ' disabled';
    el.innerHTML = `<span class="small${a ? '' : ' muted'}">${a ? `<strong>${esc(name)}</strong>` : 'Tap a block, pumping station or pressure zone below, then:'}</span>
      <button type="button" class="btn small" data-net-loads${dis} title="The developments loading it, as a scope">What loads this?</button>
      <button type="button" class="btn small" data-net-up${up ? '' : ' disabled'} title="${a && a.zone ? 'A pressure zone is supplied from the zone below it: see Capacity › pumping into the zone' : 'Everything that drains into it, on the map'}">Show upstream</button>`;
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const ST = root.PeelSewerTrace, id = ST && ST.svcFocus && ST.svcFocus.id; if (!id) return;
    if (e.target.closest('[data-net-loads]')) { if (root.PeelToolScope) root.PeelToolScope.showLoads(id); return; }
    if (e.target.closest('[data-net-up]')) ST.focusSvc(id, { zoom: true, loads: false, keep: true });
  });
  const renderAll = () => { render(); renderChecks(); renderNetBar(); };
  // Render on entering the sub-view (PeelAnalysisTabs.showFootTab).
  const renderFor = sub => { if (sub === 'capacity') render(); else if (sub === 'checks') renderChecks(); else if (sub === 'network') renderNetBar(); };
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const s = e.target.closest('[data-cap-sort]'); if (s) { st.sort = s.dataset.capSort; if (U.store) U.store.set('capSort', st.sort); render(); return; }
    const f = e.target.closest('[data-cap-fold]'); if (f) { const id = f.dataset.capFold; if (st.open.has(id)) st.open.delete(id); else st.open.add(id); render(); return; }
    if (e.target.closest('[data-cap-detail]')) { detail = !detail; if (U.store) U.store.set('capDetail', detail); syncDetail(); if (detail) { const p = $('#pane-plants'); if (p) p.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
  });
  const api = { SYSTEM, derive, sortRows, yTxt, pctTxt, collect, tableHTML, render, renderChecks, renderNetBar, renderAll, renderFor, syncDetail };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSvcCapacity = api;
})(typeof window !== 'undefined' ? window : globalThis);
