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
  const H = () => root.PeelHow;
  const pctOf = (r, v) => (r.cap > 0 ? v / r.cap * 100 : null);
  const derive = r => { const d = { ...r, system: SYSTEM[r.sys], pctCom: pctOf(r, r.committed), pctBo: pctOf(r, r.buildout), room: r.cap - r.buildout }; d.impact = impactOf(d); return d; };
  // Impact (Stage 3), one line per row, in each facility's own 2020 Master Plan measure:
  //   plants and water treatment: ML/d over or under the 90% expansion trigger at build-out
  //     = (build-out % − 90%) × rated (Vol. 4, s. 2.3.1);
  //   pumping stations (and pipes): L/s over or under firm (full-pipe) capacity at build-out (s. 2.3.2);
  //   storage: ML short of the required storage before its relief project (Vol. 3, Table 12);
  //   pumping into a zone: ML/d over or under firm pumping at build-out (no relief is listed).
  // past: how far build-out goes past that limit, as a share of it: "Largest impact" ranks by it, so
  // a plant, a station and a reservoir compare on the Master Plan's own test.
  function impactOf(r) {
    const f = v => qty(r, Math.abs(v));
    const split = q => { const i = q.indexOf(' '); return i < 0 ? [q, ''] : [q.slice(0, i), q.slice(i + 1)]; };
    const out = (v, past, rest) => { const [num, unit] = split(f(v)); return { v, past, fig: { v: num, u: unit, rest }, text: `${num}${unit ? ` ${unit}` : ''} ${rest}` }; };
    const word = v => (v >= 0 ? 'over' : 'under');
    if (r.kind === 'plant' || r.kind === 'wplant') { const lim = 0.9 * r.cap, v = r.buildout - lim; return out(v, lim > 0 ? v / lim : 0, `${word(v)} the 90% trigger at build-out`); }
    if (r.kind === 'ps' || r.kind === 'pipe') { const v = r.buildout - r.cap; return out(v, r.cap > 0 ? v / r.cap : 0, `${word(v)} ${r.capWord} capacity at build-out`); }
    if (r.kind === 'storage') {
      const next = r.reliefNext !== undefined ? r.reliefNext : r.reliefY;   // (a row without reliefNext: its reliefY is the next)
      const when = next ? `before relief (${next})` : r.reliefY ? `by build-out (relief listed for ${r.reliefY})` : 'by build-out (no relief listed)';
      if (r.shortBefore > 0) return out(r.shortBefore, r.cap > 0 ? r.shortBefore / r.cap : 0, `short of required storage ${when}`);
      const v = r.buildout - r.cap; return { ...out(v, r.cap > 0 ? v / r.cap : 0, v > 0 ? `short of required storage by build-out (relief ${r.reliefY || 'not listed'})` : 'of storage to spare at build-out'), short: false };
    }
    const v = r.buildout - r.cap; return out(v, r.cap > 0 ? v / r.cap : 0, `${word(v)} firm pumping at build-out (no relief listed)`);
  }
  // Limit year as a number for sorting: now first, never-reached last.
  const yNum = (y, now) => (y === 'today' ? now : y == null ? Infinity : +y);
  function sortRows(rows, by = 'limit', now = new Date().getFullYear()) {
    // Largest impact: how far past its Master Plan limit (all systems on that one test).
    const imp = r => (r.impact && r.impact.past != null ? r.impact.past : -Infinity);
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
  const D = () => root.PeelDemand, DD = () => root.PeelDevDetail;
  const WT = () => root.PeelWaterTrace, SD = () => root.PeelSvcData, LB = () => root.PeelLayerBar, MM = () => root.PeelMapMarkers;
  const st = { sort: (U.store && U.store.get('capSort', 'limit')) || 'limit', sys: 'all', open: new Set() };
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
  // The first planned relief year of a Master Plan constraint (null: none listed).
  const reliefYearOf = c => (c && c.relief ? c.relief.map(r => r.y).filter(Boolean).sort((a, b) => a - b)[0] || null : null);
  // collect() leaves out the facilities whose data is still loading (pumping into the zones waits for the
  // water facilities, the pumping stations for their stations): partial() says the last rows were short.
  let lastPartial = false;
  function collect() {
    const A = App(); if (!A || !A.state.svcModel || !MP() || !Cap()) return null;
    const rows = [], wwB = SvcTab().wwBasis(), flowW = SvcTab().wwFlowLabel();
    // Wastewater treatment plants: flow against rated capacity; the limit is the 90% expansion trigger.
    for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) {
      const k = Cap().of(`plant:${pl}`), c = MP().cached(`plant:${pl}`, () => MP().plantCons(pl)); if (!k || !c) continue;
      rows.push({ id: `plant:${pl}`, ss: `plant:${pl}`, sys: 'ww', kind: 'plant', name: (SD().PLANT_SHORT && SD().PLANT_SHORT[pl]) || k.name, sub: 'treatment plant',
        compared: `${flowW} vs rated capacity`, basis: wwB, unit: 'ML/d', cap: k.cap, capWord: 'rated', existing: k.existing, built: k.built, committed: k.committed, buildout: k.buildout,
        limit: { y: c.out, what: '90% trigger', after: c.outAfter }, horizon: hzPlant(pl) || hzFromQ(c.q, k.cap), small: U.isSmallSystem ? U.isSmallSystem(k.cap) : false, relief: MP().consStatus(c), reliefY: reliefYearOf(c) });
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
          limit: { y: c.out, what: '90% trigger' }, horizon: hzFromQ(c.q, k.cap), small: U.isSmallSystem ? U.isSmallSystem(k.cap) : false, relief: MP().consStatus(c), reliefY: reliefYearOf(c) });
      }
    }
    // Pumping into each pressure zone: maximum day against firm pumping (the water tab's rows).
    const ph = { year0: SP().hz.year0, aStart: SP().hz.aStart, aYears: SP().hz.aYears, pStart: SP().hz.pStart, pYears: SP().hz.pYears, end: SP().hz.end };
    const pumps = WTab() && WTab().pumpRows ? WTab().pumpRows() : [];
    const pumpsLoading = !pumps.length && WT() && WT().WF && !WT().WF.data;
    if (pumpsLoading) WT().loadWaterFacilities().then(d => { if (d) render(); });
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
      // Its relief: the Master Plan storage constraint's planned project (js/masterplan.js storageCons).
      const stc = MP().cached('storage', MP().storageCons) || [];
      for (const s of mp.storage) {
        const rt = WTab().storageRoomTrigger(ys, s.required, s.available), av = s.available[s.available.length - 1];
        const reqNow = interp(s.required, now), reqEnd = s.required[s.required.length - 1];
        // (reliefY: the first relief the Master Plan lists, as for plants and stations; the shortfall runs to
        // the next relief still to come)
        const sc = stc.find(x => x.name === s.facility), reliefY = sc ? reliefYearOf(sc) : null, reliefNext = sc ? (sc.relief.map(x => x.y).filter(y => y && y >= now).sort((a, b) => a - b)[0] || null) : null;
        let shortBefore = 0; for (let y = now; y <= (reliefNext ? reliefNext - 1 : ys[ys.length - 1]); y++) shortBefore = Math.max(shortBefore, interp(s.required, y) - interp(s.available, y));
        rows.push({ id: `stor:${s.facility}`, sys: 'water', kind: 'storage', name: s.facility, sub: 'storage', compared: 'Required vs available storage', basis: 'mp', unit: 'ML', cap: av, capWord: 'available',
          existing: reqNow, built: 0, committed: reqNow, buildout: reqEnd, limit: { y: rt.c100, what: 'required > available' },
          horizon: { end: ys[ys.length - 1], at: PICK.filter(y => y <= ys[ys.length - 1]).map(y => [y, interp(s.required, y) / (interp(s.available, y) || av) * 100]), c80: rt.c80, c90: rt.c90, c100: rt.c100 },
          reliefY, reliefNext, shortBefore, relief: sc ? MP().consStatus(sc) : null });
      }
    }
    // Wastewater pumping stations: peak wet weather flow against firm capacity (design criteria).
    const nRows = rows.length, psAreas = A.state.servicing.psAreas || [];
    for (const a of psAreas) {
      const k = Cap().of(`ps:${a.id}`), c = MP().cached(`ps:${a.id}`, () => MP().psCons(a)); if (!k || !c) continue;
      rows.push({ id: `ps:${a.id}`, ss: a.id, sys: 'ww', kind: 'ps', name: k.name.replace(/ pumping station$/i, ''), sub: 'pumping station', compared: 'Peak wet weather vs firm capacity', basis: 'design', unit: 'L/s', cap: k.cap, capWord: 'firm',
        existing: k.existing, built: k.built, committed: k.committed, buildout: k.buildout, limit: { y: c.out, what: '100% firm' }, horizon: hzFromQ(c.q, k.cap), relief: MP().consStatus(c), reliefY: reliefYearOf(c) });
    }
    // Tightest sewers: only while pipe-by-pipe results are on (off for now: left to the Region's model).
    if (U.PIPE_RESULTS && MM().SEW.data && root.PeelTightPipes) {
      const SC = root.PeelSewerCap, entries = [];
      for (let i = 0; i < MM().SEW.data.pipes.length; i++) { const s = SC.pipeStats(i, null); if (s.r1 != null) entries.push({ i, r1: s.r1 }); }
      for (const x of root.PeelTightPipes.topTightPipes(entries, 5)) {
        const c = MP().cached(`pipe:${x.i}`, () => MP().pipeCons(x.i)); if (!c || c.check) continue;
        rows.push({ id: `pipe:${x.i}`, sys: 'ww', kind: 'pipe', name: c.name, sub: c.sub, compared: 'Peak wet weather vs full-pipe capacity', basis: 'design', unit: 'L/s', cap: c.cap, capWord: 'full-pipe',
          existing: c.q('today'), built: 0, committed: c.util.com * c.cap, buildout: c.util.bo * c.cap, limit: { y: c.out, what: '100% full pipe' }, horizon: hzFromQ(c.q, c.cap), relief: MP().consStatus(c), reliefY: reliefYearOf(c) });
      }
    }
    lastPartial = !!pumpsLoading || (psAreas.length > 0 && !rows.slice(nRows).some(r => r.kind === 'ps'));
    return rows.map(derive);
  }
  // The stacked bar: existing, built, committed, proposed; marks at 90% and 100% of capacity.
  // The panel's chart: the same row as the shared capacity bar, with its % and the 90% / 100% marks labelled.
  const labelledBar = r => (LB() && LB().capacityBarHTML ? LB().capacityBarHTML({ cap: r.cap, existing: r.existing, built: r.built, committed: r.committed, buildout: r.buildout, trigger: 0.9, unit: r.small ? '' : r.unit, firm: r.capWord === 'firm' ? r.cap : null }, { fmt: v => (r.small ? qty(r, v) : r.unit === 'L/s' ? fmtNum(Math.round(v)) : fmt1(v)) }) : barOf(r));
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
    const hl = `<strong>${rows.length}</strong> facilities, water and wastewater together${nOver ? `: <strong>${nOver}</strong> over 100% of capacity at build-out` : ': none over 100% at build-out'}${soon && soon.limit.y != null ? `; <strong>${esc(soon.name)}</strong> is the first to reach its limit (${esc(limitWords(soon.limit.what))}: ${whenWords(soon.limit.y, SP().hz.end)})` : ''}.`;
    return `${U.hlP ? U.hlP(hl) : `<p>${hl}</p>`}
      <div class="svc-head"><div class="svc-switches"><div class="svc-switch" role="group" aria-label="Sort"><span class="muted small">Sort</span>${sortBtn('limit', 'Limit year', 'Soonest limit year first')}${sortBtn('impact', 'Impact', 'Most loaded at build-out first (% of capacity)')}</div>${SvcTab().optSwitch('tech', 'Columns', [['off', 'Simple'], ['on', 'Engineering']])}</div></div>
      <table class="dt svc-table cap-all" data-info="servicing-capacity"><thead><tr><th>Facility</th><th>System</th><th>Compared</th><th class="n">With approved</th><th class="n">Build-out</th><th class="n">Limit year</th><th class="n">Room / over<br><small>at build-out, to 100%</small></th><th class="n xc">Capacity</th><th class="n xc">Today</th><th class="n xc">With approved</th><th class="n xc">Build-out</th></tr></thead>
      <tbody>${sortRows(rows, st.sort, MM().THIS_YEAR).map(rowHTML).join('')}</tbody></table>
      ${LB() ? LB().capLegendHTML() : ''}
      <p class="small muted">Committed = existing + built + committed as a % of the row's capacity (rated for treatment, firm for pumping, available for storage); build-out adds the proposed applications. The limit year is when the row reaches its limit: the 2020 Master Plan's 90% expansion trigger for treatment, 100% of firm capacity for pumping, required above available for storage. ▸ opens the horizon years under a row.${U.PIPE_RESULTS ? '' : ' Sewer pipes are not in this table: pipe-by-pipe results are left to the Region’s model.'} Charts, the plant horizon assumptions and method notes: <button type="button" class="btn small link" data-cap-detail>Charts and method</button>.</p>`;
  }
  // ---- The standard panel (Stage 3): Servicing › Capacity ------------------------------------------
  const TONE_WORD = { over: 'Over', tight: 'Tight', room: 'Room' };
  const P = () => root.PeelPanel;
  // Relief status (js/masterplan.js consStatus): relief arrives after the limit, in time, or none needed.
  const RELIEF = { gap: ['Relief after the limit', 'over'], planned: ['Relief in time', 'room'], ok: ['Room', 'room'], check: ['Check the data', 'tight'] };
  // ('gap' covers both a relief planned after the limit and none listed: the row says which)
  const reliefOf = r => (r.relief === 'gap' && !r.reliefY ? ['No relief listed', 'over'] : r.relief && RELIEF[r.relief] ? RELIEF[r.relief] : r.pctBo >= 100 ? ['No relief listed', 'over'] : ['Room', 'room']);
  const KIND = { plant: 'Plant', wplant: 'Water treatment', pump: 'Pumping into the zone', storage: 'Storage', ps: 'Pumping station', pipe: 'Sewer' };
  // One facility as a list row (Capacity, and the Overview's Needs attention): name and limit year, the
  // stacked bar, committed → build-out and its relief, the impact line.
  function listRow(r) {
    const now = MM().THIS_YEAR, end = SP().hz.end;
    const t = P().toneOf(r.pctBo), [rel, relT] = reliefOf(r), ly = r.limit.y, lyT = ly == null ? 'room' : ly === 'today' || ly <= now + 5 ? 'over' : 'tight';
    return { tone: t, attrs: r.ss ? { 'data-ss': r.ss, title: `Open ${r.name} as a scope` } : { 'data-full-table': 'svc:capacity', title: 'Open the full table' },
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${r.sys === 'water' ? '💧 ' : ''}${esc(r.name)}</span><span class="pnl-r-year t-${lyT}">${yTxt(ly, r.horizon ? r.horizon.end : end)}</span></div>
        ${barOf(r)}<div class="pnl-r-meta"><span>${KIND[r.kind] || r.system} · ${pctTxt(r.pctCom)} with approved → ${pctTxt(r.pctBo)} at build-out</span><span class="t-${relT}">${esc(rel)}</span></div>
        <small class="pnl-r-line">Impact: ${esc(r.impact.text)}</small>` };
  }
  // Bundle 5: a limit in words ("reaches its firm capacity"), and when ("already", "≈2028").
  const LIMIT_WORDS = { '100% firm': 'its firm capacity', '90% trigger': 'its 90% expansion trigger', 'required > available': 'more storage needed than it has', '100% full pipe': 'a full pipe' };
  const limitWords = what => LIMIT_WORDS[what] || what;
  const whenWords = (y, end) => (y === 'today' ? 'already' : y == null ? `not before ${end}` : `≈${y}`);
  function panelSpec(all) {
    const now = MM().THIS_YEAR, end = SP().hz.end;
    const rows = st.sys === 'all' ? all : all.filter(r => r.sys === st.sys), sorted = sortRows(rows, st.sort, now);
    const over = rows.filter(r => r.pctBo >= 100), tight = rows.filter(r => r.pctBo >= 90 && r.pctBo < 100);
    const soon = sortRows(rows, 'limit', now)[0], big = sortRows(rows, 'impact', now)[0];
    const n = k => rows.filter(r => r.kind === k).length, plural = (x, a, b) => `${x} ${x === 1 ? a : b}`;
    const chipBtn = (attr, k, t, on) => `<button type="button" class="btn small${on ? ' on' : ''}" ${attr}="${k}" aria-pressed="${on}">${t}</button>`;
    const tools = `<div class="seg" role="group" aria-label="System">${[['all', 'All'], ['ww', 'Wastewater'], ['water', 'Water']].map(([k, t]) => chipBtn('data-cap-sys', k, t, st.sys === k)).join('')}</div>
      <div class="seg" role="group" aria-label="Sort">${chipBtn('data-cap-sort', 'limit', 'Soonest', st.sort === 'limit')}${chipBtn('data-cap-sort', 'impact', 'Largest impact', st.sort === 'impact')}</div>`;
    const sysWord = st.sys === 'ww' ? 'wastewater' : st.sys === 'water' ? 'water' : 'water and wastewater';
    return {
      calc: true, fullTitle: `Servicing › Capacity · Peel · ${sysWord}`,
      head: { trail: [{ label: 'Peel' }, { label: 'Servicing › Capacity' }], name: 'Can the system take it?', status: over.length ? { tone: 'over', text: `${over.length} over` } : tight.length ? { tone: 'tight', text: `${tight.length} tight` } : { tone: 'room', text: 'Room' },
        identity: `Peel · ${sysWord}: ${[plural(n('plant'), 'plant', 'plants'), plural(n('wplant'), 'treatment system', 'treatment systems'), plural(n('pump'), 'pumping group', 'pumping groups'), plural(n('storage'), 'storage facility', 'storage facilities'), plural(n('ps'), 'pumping station', 'pumping stations')].filter(x => !/^0 /.test(x)).join(' · ')}` },
      answer: `<strong>${over.length}</strong> of ${rows.length} facilities are over capacity at build-out${tight.length ? ` and <strong>${tight.length}</strong> more are tight (90–100%)` : ''}.${soon && soon.limit.y != null ? ` <strong>${esc(soon.name)}</strong> is the first to reach its limit (${esc(limitWords(soon.limit.what))}: ${whenWords(soon.limit.y, end)})${big && big.impact.past > 0 ? big === soon ? ' and goes furthest past it at build-out' : `; <strong>${esc(big.name)}</strong> goes furthest past its limit at build-out` : ''}.` : big && big.impact.past > 0 ? ` <strong>${esc(big.name)}</strong> goes furthest past its limit at build-out.` : ''}`,
      // (each figure's "?" lists the facilities it counts, or the one it names, with load ÷ capacity: js/how.js)
      figures: [
        // (a count opens the full table; a figure that names one facility opens it)
        { v: over.length, u: 'over', label: 'over capacity at build-out', ctx: `of ${rows.length} facilities`, tone: over.length ? 'over' : 'room', attrs: { 'data-full-table': 'svc:capacity' }, how: H() && H().capacityCount(rows, 100) },
        { v: tight.length, u: 'tight', label: '90–100% at build-out', ctx: 'past the 90% trigger, under 100%', tone: tight.length ? 'tight' : 'room', attrs: { 'data-full-table': 'svc:capacity' }, how: H() && H().capacityCount(rows, 90, 100) },
        soon ? { v: soon.limit.y === 'today' ? 'Now' : soon.limit.y == null ? `after ${end}` : `≈${soon.limit.y}`, u: '', label: soon.limit.y === 'today' ? 'soonest limit: already reached' : 'soonest limit', ctx: `${esc(soon.name)}: ${esc(limitWords(soon.limit.what))}`, tone: soon.limit.y != null ? 'over' : 'room', attrs: soon.ss || soon.id ? { 'data-ss': soon.ss || soon.id } : null, how: H() && H().capacityRow(soon) } : null,
        big ? { v: esc(big.impact.fig.v), u: big.impact.fig.u, label: 'largest impact', ctx: `${esc(big.name)}: ${esc(big.impact.fig.rest)}`, tone: P().toneOf(big.pctBo), attrs: big.ss || big.id ? { 'data-ss': big.ss || big.id } : null, how: H() && H().capacityRow(big) } : null,
      ].filter(Boolean),
      chart: sorted[0] ? `<p class="small pnl-chart-t">${esc(sorted[0].name)}: existing, built, committed and proposed flow <span class="pnl-chart-u">(% of ${sorted[0].capWord} capacity)</span></p>${labelledBar(sorted[0])}${LB() ? LB().capLegendHTML() : ''}` : '',
      lists: [{ title: 'Facilities', tools, rows: sorted.slice(0, 5).map(listRow), total: rows.length, seeAll: { 'data-full-table': 'svc:capacity' } }],
      folds: root.PeelWwEvents && App().state.wwEvents ? [{ title: 'Overflows and spills reported', html: root.PeelWwEvents.summaryHTML() }] : [],
      method: `Committed = existing + built + committed as a % of the row's capacity (rated for treatment, firm for pumping, available for storage); build-out adds the proposed applications. Each row's basis: 2025 metered (calibrated), design criteria or the 2020 Master Plan. Limit year and impact follow the 2020 Master Plan's own tests: treatment against the 90% expansion trigger (Vol. 4, s. 2.3.1), pumping stations peak wet weather against firm capacity (s. 2.3.2), storage required against available (Vol. 3, Table 12), pumping into a zone maximum day against firm pumping. Largest impact ranks how far build-out goes past that limit, as a share of it. ${U.PIPE_RESULTS ? '' : 'Sewer pipes are not in this list: pipe-by-pipe results are left to the Region\u2019s model. '}The full table adds the flows, the horizon years and the plant and water charts.`,
      sources: 'Rated capacity and the 2025 metered flows: Region of Peel 2025 annual reports (wastewater plants, drinking water systems). Firm pumping and storage: 2020 Water and Wastewater Master Plan (Vol. 3 and 4). Growth: the applications and permits on the map at Peel design criteria. Planned expansions and relief: 2026 DC capital maps (draft).',
      foot: { primary: { label: 'Show capacity on the map', attrs: { 'data-mview': 'wastewater' }, title: 'The Wastewater view: capacity colours, blocks and sanitary sewers' } },
    };
  }
  // The full-width Engineering table for the same scope and scenario: every row, every column.
  // Bundle 5: the unit once per row, in its own column beside the flows (no unit in every cell; the
  // rows keep the panel's order); the Facility column is pinned; Reaches 80 / 90 / 100% is one column, a small timeline; the
  // Impact sentence folds under its figure; on a phone each row is a card (data-l labels the cells).
  const numOnly = (r, v) => (r.small ? fmtNum(Math.round(v * 1000)) : r.unit === 'L/s' ? fmtNum(Math.round(v)) : fmt1(v));
  const unitOf = r => (r.small ? 'm³/d' : r.unit);
  // "past 80% now · 90% 2028 · 100% 2030": the thresholds already passed say so once.
  function reachText(hz, end) {
    const ys = [[80, hz.c80], [90, hz.c90], [100, hz.c100]], past = ys.filter(([, y]) => y === 'today');
    const rest = ys.filter(([, y]) => y !== 'today').map(([p, y]) => `${p}% ${y == null ? `after ${end}` : y}`);
    return [past.length ? `past ${past[past.length - 1][0]}% now` : '', ...rest].filter(Boolean).join(' · ');
  }
  // The same as a 120 px timeline: this year to the horizon, a tick for each threshold reached.
  function reachLine(hz, now, end) {
    const W = 120, x = y => 4 + (W - 8) * (Math.min(Math.max(y, now), end) - now) / Math.max(1, end - now);
    const dots = [[80, hz.c80], [90, hz.c90], [100, hz.c100]].filter(([, y]) => y != null).map(([p, y]) => { const xv = x(y === 'today' ? now : y); return `<circle cx="${xv.toFixed(1)}" cy="7" r="${p === 100 ? 4 : 3}" class="rl-${p}"/>`; }).join('');
    return `<svg class="reach-line" viewBox="0 0 ${W} 14" width="${W}" height="14" aria-hidden="true"><line x1="4" x2="${W - 4}" y1="7" y2="7"/>${dots}</svg>`;
  }
  function fullTableHTML(rows) {
    const now = MM().THIS_YEAR, end = SP().hz.end, sorted = sortRows(rows, st.sort, now);
    const h = r => r.horizon || { at: [], end };
    const rowHTML = r => { const t = P().toneOf(r.pctBo), f = r.impact && r.impact.fig; return `<tr data-basis="${r.basis}" class="t-${t}"><th scope="row" class="ft-pin" data-l="Facility">${esc(r.name)}<small>${esc(r.sub)} · ${r.system}</small></th><td data-l="Compared">${esc(r.compared)} ${U.basisChip ? U.basisChip(r.basis) : esc(r.basis)}</td><td class="ft-u" data-l="Unit">${unitOf(r)}</td><td class="n" data-l="Capacity">${numOnly(r, r.cap)} <small>${r.capWord}</small></td><td class="n" data-l="Today">${numOnly(r, r.existing + r.built)}</td><td class="n" data-l="With approved">${numOnly(r, r.committed)}</td><td class="n" data-l="Build-out">${numOnly(r, r.buildout)}</td><td class="n" data-l="With approved %">${pctTxt(r.pctCom)}</td><td class="n" data-l="Build-out %"><strong>${pctTxt(r.pctBo)}</strong> ${P().chip({ tone: t })}</td><td class="n" data-l="Limit year">${yTxt(r.limit.y, h(r).end)}<small>${esc(r.limit.what)}</small></td><td class="n" data-l="Room / over capacity">${r.room < 0 ? 'over by ' : 'room '}${numOnly(r, Math.abs(r.room))}</td><td data-l="Impact past the limit">${f ? `<details class="ft-imp"><summary>${esc(f.v)}${f.u ? ` ${esc(f.u)}` : ''}</summary>${esc(r.impact.text)}</details>` : esc(r.impact.text)}</td>${PICK.map(y => { const a = h(r).at.find(x => x[0] === y); return `<td class="n" data-l="${y}">${a ? pctTxt(a[1]) : '–'}</td>`; }).join('')}<td data-l="Reaches 80 · 90 · 100%">${reachLine(h(r), now, h(r).end)}<small>${esc(reachText(h(r), h(r).end))}</small></td></tr>`; };
    return `<div class="ft-scroll"><table class="dt ft-table cap-full"><thead>
      <tr class="ft-grp"><th rowspan="2" class="ft-pin">Facility</th><th rowspan="2">Compared</th><th colspan="5" class="ft-g">Flow or volume</th><th colspan="2" class="ft-g">% of capacity</th><th rowspan="2" class="n">Limit year</th><th rowspan="2" class="n" title="At build-out, against 100% of the capacity">Room / over capacity</th><th rowspan="2" title="At build-out, past the limit the Limit year uses (a plant's 90% trigger)">Impact past the limit</th><th colspan="${PICK.length}" class="ft-g">% of capacity by year</th><th rowspan="2">Reaches 80 · 90 · 100%</th></tr>
      <tr><th>Unit</th><th class="n">Capacity</th><th class="n">Today</th><th class="n">With approved</th><th class="n">Build-out</th><th class="n">With approved</th><th class="n">Build-out</th>${PICK.map(y => `<th class="n">${y}</th>`).join('')}</tr></thead>
      <tbody>${sorted.map(rowHTML).join('')}</tbody></table></div>`;
  }
  function render() {
    const el = $('#svc-capacity-body'); if (!el) return;
    if (root.DevScope && root.DevScope.current()) return;   // (hidden at a site: PeelAnalysisTabs.HIDDEN)
    const rows = collect();
    if (!rows) { el.innerHTML = U.skel ? U.skel('Loading the servicing model') : ''; return; }
    // The detail (shown by "Open full table"): every facility, every column; then the panel.
    el.innerHTML = `${U.SCREEN_NOTE || ''}${fullTableHTML(rows)}`;
    if (root.PeelPanel) { root.PeelPanel.set('svc:capacity', panelSpec(rows)); renderNetworkPanel(rows); }
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
    // Stage 3: the standard panel; the comparisons above (and the water facilities, the hydraulic check)
    // are its full table.
    const PN = root.PeelPanel, A = App(), M = A && A.state.svcModel, R = A && A.state.reports;
    if (!PN || !M) return;
    const cal = M.mode === 'calibrated';
    const plants = ['Lakeview', 'Clarkson', 'Inglewood'].map(pl => ({ pl, c: M.plantCap(pl) })).filter(x => x.c);
    const sp = R && R.water && R.water.southPeel;
    const ft = { 'data-full-table': 'svc' };
    const check = (t, what, go) => ({ attrs: { ...ft, 'data-ft-go': go || t }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${t}</span></div><small class="pnl-r-line">${what}</small>` });
    const labs = root.PeelLabs && root.PeelLabs.on('hydro');
    PN.set('svc:checks', {
      calc: true, fullTitle: 'Servicing › Model checks · the model against the 2020 Master Plan and the 2025 reports',
      head: PN.areaHead('Servicing › Model checks', 'Does the model match the reports?', null, `Peel · ${cal ? 'capacity check: calibrated to the 2025 plant flows' : 'design flows (Peel criteria)'}`),
      answer: cal ? `Each plant's measured 2025 flow is compared with what the model works out for today, and the model is scaled to match: ${plants.map(x => `<strong>${esc(SD().PLANT_SHORT[x.pl])}</strong> measured ${x.c.f.toFixed(2)} times the model's flow`).join(', ')}. The difference is what the model does not hold: existing jobs, rain and groundwater getting into the sewers, and other flows.` : 'Design flows at Peel criteria: switch the Scenario to the capacity check (2025 flows) to see the calibration factors. The comparisons with the Master Plan and the 2025 reports are below.',
      figures: [...plants.map(x => ({ v: `×${x.c.f.toFixed(2)}`, u: '', label: `${SD().PLANT_SHORT[x.pl]}: measured ÷ modelled`, ctx: 'calibration factor: 2025 measured flow ÷ the model today' })),
        ...(sp ? [{ v: fmt1(sp.maxDayMLd), u: 'ML/d', label: 'South Peel 2025 maximum day', ctx: `of ${fmt1(sp.plants.reduce((t, p) => t + p.ratedMLd, 0))} ML/d rated (incl. York supply)` }] : [])].slice(0, 4),
      lists: [{ title: 'Checks in the full table', rows: [
        check('2020 Master Plan vs this tracker', 'Wastewater plants (average day) and water (maximum day): build-out here against the Master Plan forecast, and the year the Master Plan expected that flow.'),
        check('2025 annual reports vs the model', 'Each plant: rated capacity, reported average and highest day, the model today and the calibration factor.'),
        check('2025 water production', 'South Peel (A.P. Kennedy, Lorne Park) and the Caledon groundwater systems: rated, average and maximum day, per person.', 'Reported 2025 production'),
        check('Existing water facilities', 'Every reservoir, tank and pumping station with its firm capacity, and the ones the Master Plan finds short by 2041.', 'Existing water facilities'),
        ...(labs ? [check('Hydraulic check (beta, Labs)', 'An experimental EPANET check of the large mains feeding each upper pressure zone.', 'Hydraulic')] : []),
      ], total: labs ? 5 : 4, seeAll: ft }],
      method: 'The calibration factor = (reported − external inflows) ÷ the model today (census + built since, residential + development jobs); it is applied in the capacity check mode, I&amp;I is not scaled. Data checks (freshness, duplicates, permit counts) are in Records › Data checks.',
      sources: 'Region of Peel 2025 annual reports (G.E. Booth, Clarkson, Inglewood; drinking water systems); 2020 Water and Wastewater Master Plan (Vol. 3 and 4); the Wastewater Collection System report (York and Toronto inflows).',
      foot: { primary: { label: 'The reports (Records)', attrs: { 'data-at': 'records:sources' }, title: 'Every report and source with its date' } },
    });
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
  // ---- Servicing › Network as the standard panel ---------------------------------------------------
  // Area: the tightest pumping stations (the Capacity rows), the blocks carrying the most flow and the
  // zones growing most; each row has "What loads this?" (its scope) and "Show upstream" (the map).
  const netActs = (id, up) => `<span class="pnl-r-acts"><button type="button" class="btn small link" data-ss="${esc(id)}">What loads this?</button>${up ? ` <button type="button" class="btn small link" data-pnl-focus="${esc(id)}">Show upstream</button>` : ''}</span>`;
  function renderNetworkPanel(capRows) {
    const PN = root.PeelPanel, A = App(); if (!PN || !A || !A.state.svcModel || (root.DevScope && root.DevScope.current())) return;
    const M = A.state.svcModel, sv = A.state.servicing;
    // The blocks as the Network table ranks them (the same flow, calibrated in the capacity check).
    const blocks = (SvcTab().rankedBlocks ? SvcTab().rankedBlocks() : []).map(x => ({ a: x.d, now: x.now, bo: x.bo }));
    const zones = (sv.zones || []).filter(z => M.zones.get(z.id)).map(z => { const l = M.zones.get(z.id); return { z, now: M.wMax(l.census, 0), bo: M.wMax(M.total(l), M.jobs(l)) }; }).sort((x, y) => (y.bo - y.now) - (x.bo - x.now));
    const ps = (capRows || []).filter(r => r.kind === 'ps'), psOver = ps.filter(r => r.pctBo >= 100);
    const stRow = r => { const x = listRow(r); return { ...x, attrs: null, html: `${x.html}${netActs(r.id.replace(/^ps:/, ''), true)}` }; };
    const big = blocks[0], zg = zones[0];
    PN.set('svc:network', {
      calc: true, fullTitle: 'Servicing › Network · Peel: blocks, pumping stations and pressure zones',
      head: PN.areaHead('Servicing › Network', 'Where does it flow?', psOver.length ? { tone: 'over', text: `${psOver.length} station${psOver.length === 1 ? '' : 's'} over` } : { tone: 'room', text: 'Room' }, `Peel · ${fmtNum(blocks.length)} wastewater blocks · ${fmtNum(ps.length)} pumping stations · ${fmtNum(zones.length)} pressure zones`),
      answer: `Sewage flows through <strong>${fmtNum(blocks.length)}</strong> wastewater blocks to the plants${big ? `; <strong>${esc(SD().drName(big.a))}</strong> carries the most (${fmt1(big.bo)} ML/d on an average dry day at build-out)` : ''}. <strong>${fmtNum(psOver.length)}</strong> of ${fmtNum(ps.length)} pumping stations with a firm capacity on file would be over it in a storm at build-out${zg ? `; water use grows most in <strong>${esc(zg.z.name)}</strong> (+${fmt1(zg.bo - zg.now)} ML/d on the highest day)` : ''}.`,
      figures: [
        { v: fmtNum(blocks.length), u: 'blocks', label: 'wastewater blocks', ctx: 'traced to the lake' },
        { v: fmtNum(psOver.length), u: `of ${fmtNum(ps.length)}`, label: 'stations over firm capacity', ctx: 'peak wet-weather flow at build-out', tone: psOver.length ? 'over' : null },
        big ? { v: fmt1(big.bo), u: 'ML/d', label: 'largest block flow', ctx: `${esc(SD().drName(big.a))} · average dry-weather flow at build-out` } : null,
        { v: fmtNum(zones.length), u: 'zones', label: 'pressure zones', ctx: zg ? `most growth: ${esc(zg.z.name)}` : '' },
      ].filter(Boolean),
      lists: [
        { title: 'Pumping stations (tightest)', rows: SC_sort(ps).slice(0, 5).map(stRow), total: ps.length, seeAll: { 'data-full-table': 'svc', 'data-ft-go': 'Pumping stations' } },
        { title: 'Blocks carrying the most flow', rows: blocks.slice(0, 5).map(b => ({ html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(SD().drName(b.a))}<small>to ${esc(SD().plantLabel(b.a.plant))}</small></span><span class="pnl-r-fig">${fmt1(b.bo)} ML/d<small>+${fmt1(b.bo - b.now)} ML/d from growth</small></span></div>${netActs(b.a.id, true)}` })), total: blocks.length, seeAll: { 'data-full-table': 'svc', 'data-ft-go': 'Wastewater by block' } },
        { title: 'Pressure zones growing most', rows: zones.slice(0, 5).map(z => ({ html: `<div class="pnl-r-top"><span class="pnl-r-name">💧 ${esc(z.z.name)}</span><span class="pnl-r-fig">${fmt1(z.bo)} ML/d<small>+${fmt1(z.bo - z.now)} ML/d from growth, maximum day</small></span></div>${netActs(z.z.id, false)}` })), total: zones.length, seeAll: { 'data-full-table': 'svc', 'data-ft-go': 'Water by pressure zone' } },
      ],
      method: 'Each block\u2019s own flow plus everything upstream of it along the traced flow path, building up to the plant on the lake (average dry weather at design criteria, calibrated to the 2025 plant flows in Capacity check mode). Pumping stations: peak wet weather against firm capacity (2020 Master Plan). Zones: maximum day at Peel design criteria. "What loads this?" opens it as a scope with the developments loading it; "Show upstream" shows it on the map with everything that drains into it.',
      sources: 'The Region\u2019s 40 I&amp;I sewersheds (blocks) and the traced sewer network; 2020 Water and Wastewater Master Plan (firm capacity); pressure zones (Region of Peel); the applications on the map.',
      foot: { primary: { label: 'Show the network on the map', attrs: { 'data-mview': 'wastewater' } } },
    });
  }
  const SC_sort = rows => sortRows(rows, 'limit', MM().THIS_YEAR);
  // A development: its zone, its sewer path and stations, the tightest pipe, the plant reserve it uses,
  // the infrastructure coming; the aerial check and ground elevation folded. The site briefs are its full table.
  function renderSiteNetwork(p) {
    const PN = root.PeelPanel; if (!PN || !p) return;
    const f = SD().svcFacts(p); if (!f) return;
    const DI = root.PeelDcInfra, DT = root.DevTab, w = DI && DI.devWorks ? DI.devWorks(p, f) : null, cb = f.cb;
    const share = f.zMax > 0 ? Math.round(D().toMLd(cb.water.maxDay) / f.zMax * 100) : null, plant = f.pl ? (SD().PLANT_SHORT[f.pl] || f.pl) : null;
    const usePct = f.cap && f.reserve > 0 ? Math.round(f.use / f.reserve * 100) : null;
    const pathRows = [...(f.z ? [PN.kv(`💧 ${esc(f.z.name)}`, `${share != null ? `${share}% of the zone\u2019s build-out maximum day` : 'zone load not available'}${f.zNear ? ' · nearest zone' : ''}`)] : []),
      ...f.sps.map(x => PN.kv(esc(DD().psName(x.a)), `${Math.round(x.wet / x.firm * 100)}% of firm at build-out (peak wet)`, x.wet / x.firm >= 1 ? 'over' : x.wet / x.firm >= 0.9 ? 'tight' : 'room')),
      ...(plant ? [PN.kv(`→ ${esc(plant)}`, f.cap ? (f.reserve > 0 ? `this site uses ${usePct}% of the plant\u2019s reserve (${fmt1(f.reserve)} ML/d)` : 'the plant has no reserve after committed') : '–', f.cap && f.reserve <= 0 ? 'over' : null)] : [])];
    PN.set('svc:network', {
      calc: true, fullTitle: `${p.title} · water and wastewater briefs`,
      head: PN.siteHead(p),
      answer: `${f.z ? `Water from <strong>${esc(f.z.name)}</strong>${share != null ? ` (this site ${share}% of its build-out maximum day)` : ''}` : 'No pressure zone mapped'}; wastewater ${f.path.length ? `along ${fmtNum(f.path.length)} block${f.path.length === 1 ? '' : 's'}${f.sps.length ? ` and ${f.sps.length} pumping station${f.sps.length === 1 ? '' : 's'}` : ''} to <strong>${esc(plant || '–')}</strong>` : 'with no traced path'}${usePct != null ? `, using ${usePct}% of its reserve` : ''}.`,
      figures: [
        { v: fmt1(cb.water.maxDay), u: 'L/s', label: 'water, maximum day', ctx: share != null ? `${share}% of ${esc(f.z.name.replace('Pressure zone ', 'zone '))}` : '', attrs: f.z ? { 'data-ss': f.z.id } : null },
        { v: fmt1(cb.wastewater.wetPeak), u: 'L/s', label: 'wastewater, peak wet weather', ctx: `${fmt1(cb.wastewater.peak)} L/s on a dry day` },
        f.cap ? { v: fmt1(Math.abs(f.reserve)), u: 'ML/d', label: f.reserve < 0 ? `${esc(plant)} over 100% after committed` : `${esc(plant)} reserve`, ctx: usePct != null ? `this site ${usePct}% of it` : '', tone: f.reserve <= 0 ? 'over' : 'room', attrs: { 'data-ss': `plant:${f.pl}` } } : null,
        { v: U.PIPE_RESULTS ? '–' : 'n/a', u: '', label: 'tightest pipe on the path', ctx: U.PIPE_RESULTS ? '' : 'pipe-by-pipe capacity is left to the Region\u2019s model' },
      ].filter(Boolean),
      lists: [{ title: 'The path', rows: pathRows, total: pathRows.length }],
      folds: [
        { title: 'Infrastructure coming', html: w && DI.devWorksHTML ? DI.devWorksHTML(w) : '<p class="small muted">The 2026 DC maps are still loading.</p>', open: true },
        { title: 'Site: aerial check and ground', html: DT && DT.partHTML ? DT.partHTML(p, 'ground') : '' },
        // Tools › Record allocation opens this (js/app.js showAllocSub).
        { title: 'Servicing allocation', id: 'pnl-alloc', html: root.PeelDemandUI && root.PeelDemandUI.allocBoxHTML ? root.PeelDemandUI.allocBoxHTML(p) : '' },
        // (Labs: the Gravity check and the Pressure check, js/lab-checks.js)
        ...(root.PeelLabChecks ? root.PeelLabChecks.folds(p) : []),
      ],
      method: 'Flows at Peel design criteria. The path: the pressure zone the site sits in (or the nearest), the pumping stations on its traced sewer path and the plant it drains to; the plant reserve is the uncommitted reserve (MECP D-5-1), to 100% of rated after committed.',
      sources: 'Pressure zones and the sewer network (Region of Peel); 2025 plant flows; 2026 DC capital maps (draft); the lidar terrain model and aerial photos (each names its source).',
      foot: { primary: { label: 'Trace the sewer path', attrs: { 'data-trace': p.key } }, secondary: [{ label: 'Trace water', attrs: { 'data-wtrace': p.key } }] },
      onMount: () => { if (DT && DT.fillParts) DT.fillParts(p, ['ground']); },
    });
  }
  const renderAll = () => { render(); renderChecks(); renderNetBar(); };
  // Render on entering the sub-view (PeelAnalysisTabs.showFootTab).
  const renderFor = sub => { if (sub === 'capacity') render(); else if (sub === 'checks') renderChecks(); else if (sub === 'network') { renderNetBar(); const rows = !(root.DevScope && root.DevScope.current()) && collect(); if (rows) renderNetworkPanel(rows); } };
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    if (!e.target.closest) return;
    const s = e.target.closest('[data-cap-sort]'); if (s) { st.sort = s.dataset.capSort; if (U.store) U.store.set('capSort', st.sort); render(); return; }
    const y = e.target.closest('[data-cap-sys]'); if (y) { st.sys = y.dataset.capSys; render(); return; }
    const f = e.target.closest('[data-cap-fold]'); if (f) { const id = f.dataset.capFold; if (st.open.has(id)) st.open.delete(id); else st.open.add(id); render(); return; }
    if (e.target.closest('[data-cap-detail]')) { detail = !detail; if (U.store) U.store.set('capDetail', detail); syncDetail(); if (detail) { const p = $('#pane-plants'); if (p) p.scrollIntoView({ block: 'start', behavior: 'smooth' }); } }
  });
  const api = { SYSTEM, derive, impactOf, sortRows, listRow, renderNetworkPanel, renderSiteNetwork, yTxt, pctTxt, collect, partial: () => lastPartial, tableHTML, panelSpec, fullTableHTML, reachText, numOnly, render, renderChecks, renderNetBar, renderAll, renderFor, syncDetail };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSvcCapacity = api;
})(typeof window !== 'undefined' ? window : globalThis);
