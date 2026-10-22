(function (root) {
  'use strict';
  const { $, esc, fmtNum, fmt1, roundPop, unit, skel, dot, uLs, PIPE_RESULTS, capitalStatus, CAPITAL_STATUS, PIPES_NOT_ASSESSED, capTxt } = window.PeelUtil;
  // Every planned date carries its capital status after the May 2026 pause (design audit, Group 3).
  // Status of a planned work (Stage 1 #9): the capital records' status where the DC project matches
  // one (data/capital.json, via PeelCapitalEA's DC index), else "not in capital records" with the
  // schedule it comes from (and the Council procurement pause where it applies). Never "status unknown".
  // (A match by outline overlap only (low confidence) is not trusted here, nor a "complete" status for a
  // work scheduled after this year; a planned, untendered work keeps the Council pause note.)
  const capTag = (y, s, id, src = 'DC schedule') => {
    const CE = window.PeelCapitalEA, e0 = id && CE && CE.dcStatusOf ? CE.dcStatusOf(id) : null;
    const done = e0 && /complete/.test(e0.status || '');
    const e = e0 && e0.conf !== 'low' && !(done && y > new Date().getFullYear()) ? e0 : null;
    const st = capitalStatus(y, s, id);
    if (e) return ` · ${e.status === 'under construction' && e.percent != null ? `${e.percent}% built` : CE.statusText(e.status).toLowerCase()} (capital records${e.status === 'planned' && st === 'paused' ? '; procurement paused' : ''})`;
    return ` · not in capital records (${src}${st === 'paused' ? '; procurement paused' : ''})`;
  };
  const D = window.PeelDemand;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MA = () => window.PeelMapAnalysis;
  const MM = () => window.PeelMapMarkers;
  const SC = () => window.PeelSewerCap;
  const DI = () => window.PeelDcInfra;
  const WT = () => window.PeelWaterTrace;
  const SD = () => window.PeelSvcData;
  const SvcTab = () => window.PeelSvcTab;
  const WTab = () => window.PeelWaterTab;
  const TS = () => window.PeelToolScope;
  const PE = () => window.PeelExports;
  const SP = () => window.PeelSvcPlants;
  const Areas = () => window.PeelAreas;
  const CA = () => window.PeelCensusAreas;

  // ---- DC needs: existing capacity against the 2026 DC works ----------------------------------
  // For each existing constraint a development relies on — sanitary sewers on its path (Manning,
  // as in the pipe screen), pumping stations (master plan firm capacity), the wastewater plant (90%
  // trigger), the water treatment system, storage (master plan) and the trunk mains on its
  // supply route (master plan actual capacity) — the room left after existing + approved development (people and
  // units), the year approved and proposed growth uses it up (Horizon years phasing), and the DC
  // project that relieves it. Reverse: a DC main or facility lists the developments relying on it.
  const DCN = { supply: null, mpw: null, mpww: null, pipeRelief: null, cache: new Map(), key: '' };
  const PP_HA = 1 / 150;               // hectares per added person (I&I on new land, ~50 units/ha)
  const PLANT_TRIGGER = 0.9;
  async function loadWaterSupply() {
    if (DCN.supply !== null) return DCN.supply;
    try { const r = await fetch('data/water-supply.json', { cache: 'no-cache' }); DCN.supply = r.ok ? await r.json() : false; } catch (e) { DCN.supply = false; }
    return DCN.supply;
  }
  // 2020 Master Plan trunk mains, demand by sub-zone and pumping (Vol. 3): data/master-plan-water.json.
  async function loadMpWater() {
    if (DCN.mpw !== null) return DCN.mpw;
    const get = f => fetch(f, { cache: 'no-cache' }).then(r => (r.ok ? r.json() : false)).catch(() => false);
    const [w, ww] = await Promise.all([get('data/master-plan-water.json'), get('data/master-plan-wastewater.json')]);
    DCN.mpww = ww; DCN.mpw = w;
    return DCN.mpw;
  }
  const zLevel = z => { const m = /^(\d+)/.exec(z || ''); return m ? +m[1] : null; };
  // ---- 2020 Master Plan assessment vs this tracker (Water → Facilities, Wastewater → Plants) ----
  // The Master Plan's forecasts for the facilities it assessed, next to the tracker's numbers: today
  // (2025 measured flows for the plants; the Master Plan's 2021 figure + growth built since the
  // census for the pumping stations), + approved, + proposed (build-out). A development counts at
  // a water facility when its supply route passes it (the station chain of the water trace).
  const MP2020 = {
    years: [2021, 2026, 2031, 2036, 2041],
    water: [
      { key: 'sp', name: 'South Peel system, both plants (incl. York supply)', cap: 1530, capNote: '90% of installed', mp: [1042, 1159, 1285, 1350, 1415], ref: 'Vol. 3, Tables 8–9', test: t => !t.gw, today: R => R.water.southPeel.maxDayMLd, todayNote: '2025 measured (upper bound)' },
      { key: 'apk', name: 'A.P. Kennedy WTP (Central, East, Bolton, York)', cap: 1080, capNote: '90% of installed', mp: [734, 822, 918, 960, 1003], ref: 'Vol. 3, Table 9', test: t => !t.gw && t.plant === 'A.P. Kennedy', today: R => (R.water.southPeel.plants.find(x => /Kennedy/.test(x.name)) || {}).maxDayMLd, todayNote: '2025 measured' },
      { key: 'lp', name: 'Lorne Park WTP (West)', cap: 450, capNote: '90% of installed', mp: [308, 337, 367, 390, 412], ref: 'Vol. 3, Table 9', test: t => !t.gw && t.plant === 'Lorne Park', today: R => (R.water.southPeel.plants.find(x => /Lorne/.test(x.name)) || {}).maxDayMLd, todayNote: '2025 measured' },
      { key: 'lpz2', name: 'Lorne Park Zone 2 high lift', cap: 152, capNote: 'actual firm', mp: [180, 210, 227, 250, 274], ref: 'Vol. 3, Table 11', test: t => t.plant === 'Lorne Park' && t.level >= 2 },
      { key: 'bs', name: 'Beckett Sproule transfer (to the East system)', cap: 275, capNote: 'actual firm', mp: [325, 387, 457, 469, 484], ref: 'Vol. 3, Table 11', test: t => t.sys.has('E') },
      { key: 'wb5', name: 'West Brampton Zone 5 low lift', cap: 74, capNote: 'actual firm', mp: [62, 67, 99, 108, 116], ref: 'Vol. 3, Table 11', test: t => t.plant === 'Lorne Park' && t.level >= 5 },
      { key: 'wb6', name: 'West Brampton Zone 6 high lift', cap: 87, capNote: 'actual firm', mp: [57, 77, 88, 99, 110], ref: 'Vol. 3, Table 11', test: t => t.plant === 'Lorne Park' && t.level >= 6 },
    ],
    storage: [
      { name: 'Silverthorn Reservoir', avail: 46, req: [31, 43, 44, 46, 49] },
      { name: 'West Brampton Reservoir', avail: 40, req: [32, 34, 44, 46, 49] },
    ],
    ww: [
      { pl: 'Lakeview', name: 'G.E. Booth (Lakeview), incl. York and Toronto flows', cap: 518, mp: [481, 514, 545, 581, 608], ref: 'Vol. 4, Tables 7–8' },
      { pl: 'Clarkson', name: 'Clarkson', cap: 350, mp: [216, 236, 257, 273, 290], ref: 'Vol. 4, Tables 7–8' },
    ],
  };
  // Growth (ML/d, maximum day) through each Master Plan water facility, by layer, from the
  // developments' supply routes. Cached per scenario.
  function mpWaterGrowth() {
    const M = App().state.svcModel, bc = CA().baselineCensus(); if (!M || !bc || !WT().WF.data || !App().state.servicing) return null;
    if (mpWaterGrowth.key === scenarioKey() + App().state.projects.length) return mpWaterGrowth.v;
    const groups = Object.fromEntries(MP2020.water.map(r => [r.key, []]));
    for (const p of SD().svcDevs()) {
      if (p.phase === 'cancelled' || p.lat == null || MM().svcLayerOf(p) === 'existing') continue;
      const zid = SD().svcIds(p, 'pz')[0]; if (!zid) continue;
      const t = WT().waterTrace(p, zid); if (!t || !t.steps.length) continue;
      const last = t.steps[t.steps.length - 1].f, info = { gw: t.gw, plant: last.kind === 'plant' ? last.name : '', level: zLevel(t.z.zone) || 0, sys: new Set(t.steps.map(s => s.pump && s.pump.sys).filter(Boolean)) };
      for (const r of MP2020.water) if (r.test(info)) groups[r.key].push(p);
    }
    const v = {};
    for (const r of MP2020.water) {
      const devs = groups[r.key], gr = Areas().growthSince(devs, {}, bc.date, App().state.criteria), j = SvcTab().svcJobs(devs, bc.date);
      v[r.key] = { n: devs.filter(p => p.kinds.includes('application')).length, built: M.wMax(gr.built.population, j.jbuilt || 0), approved: M.wMax(gr.approved.population, j.japproved || 0), proposed: M.wMax(gr.proposed.population, j.jproposed || 0) };
    }
    mpWaterGrowth.key = scenarioKey() + App().state.projects.length; mpWaterGrowth.v = v;
    return v;
  }
  // The Master Plan year whose forecast equals a value (linear between its forecast years).
  function mpYearOf(mp, val) {
    const Y = MP2020.years;
    if (val < mp[0]) return { below: true };
    for (let i = 1; i < Y.length; i++) if (val <= mp[i]) return { year: Math.round(Y[i - 1] + (val - mp[i - 1]) / ((mp[i] - mp[i - 1]) || 1) * (Y[i] - Y[i - 1])) };
    return { above: Math.round((val / mp[mp.length - 1] - 1) * 100) };
  }
  function mpRowHTML(name, sub, cap, capNote, mp, ref, today, approved, proposed, todayNote) {
    const com = today + approved, bo = com + proposed, at = mpYearOf(mp, bo);
    const hi = Math.max(cap, mp[mp.length - 1], bo) * 1.05, X = v => `${(v / hi * 100).toFixed(1)}%`;
    const bar = `<div class="mpc-bar" role="img" aria-label="Today ${Math.round(today)}, committed ${Math.round(com)}, build-out ${Math.round(bo)}; Master Plan ${MP2020.years.slice(1).map((y, i) => `${y} ${mp[i + 1]}`).join(', ')}; capacity ${cap}">
      <i class="mpc-t" style="width:${X(today)}"></i><i class="mpc-a" style="left:${X(today)};width:${X(approved)}"></i><i class="mpc-p" style="left:${X(com)};width:${X(proposed)}"></i>
      ${[1, 2, 4].map(i => `<b class="mpc-mp" style="left:${X(mp[i])}" title="Master Plan ${MP2020.years[i]}: ${fmtNum(mp[i])} ML/d"><span>${String(MP2020.years[i]).slice(2)}</span></b>`).join('')}<b class="mpc-cap" style="left:${X(cap)}" title="Capacity ${fmtNum(cap)} ML/d (${esc(capNote)})"></b></div>`;
    const verdict = at.below ? `below the MP's 2021 forecast` : at.above != null ? `<strong class="mpc-hi">${at.above}% above</strong> the MP's 2041 forecast` : `≈ the MP's <strong>${at.year}</strong> forecast`;
    return `<tr><td>${esc(name)}${sub ? `<small>${sub}</small>` : ''}<small class="muted">${esc(ref)}</small></td>
      <td class="n" title="${esc(capNote)}">${fmtNum(cap)}<small>${esc(capNote)}</small></td>
      <td class="n">${mp.slice(1).filter((_, i) => i !== 2).map(fmtNum).join(' · ')}</td>
      <td class="n mpc-x">${fmtNum(Math.round(today))}${todayNote ? `<small>${esc(todayNote)}</small>` : ''}</td><td class="n mpc-x">+${fmtNum(Math.round(approved))}</td><td class="n mpc-x">+${fmtNum(Math.round(proposed))}</td>
      <td class="n"><strong${bo > cap ? ' class="mpc-hi"' : ''}>${fmtNum(Math.round(bo))}</strong><small>${verdict}${bo > cap ? ' · over capacity' : ''}</small></td><td class="mpc-cell">${bar}</td></tr>`;
  }
  const mpHead = unitT => `<tr><th>Facility</th><th class="n">Capacity</th><th class="n">Master Plan<br>2026 · 2031 · 2041</th><th class="n mpc-x">Today</th><th class="n mpc-x">+ Approved</th><th class="n mpc-x">+ Proposed</th><th class="n">Build-out</th><th>${unitT}</th></tr>`;
  const mpLegend = `<ul class="grow-legend"><li><span class="gsw mpc-t"></span>Today</li><li><span class="gsw mpc-a"></span>+ Committed</li><li><span class="gsw mpc-p"></span>+ Proposed (in review)</li><li><span class="mpc-mp-sw"></span>Master Plan forecast (26, 31, 41)</li><li><span class="cap-line-sw"></span>Capacity</li></ul>`;
  function renderMpCompare() {
    const M = App().state.svcModel, R = App().state.reports;
    const ww = $('#mp-ww');
    if (ww && M && R) {
      const rows = MP2020.ww.map(r => { const c = M.plantCap(r.pl); return c ? mpRowHTML(r.name, '', r.cap, 'rated (MP: 90%)', r.mp, r.ref, c.existing, c.committed - c.existing, c.buildout - c.committed, `${M.mode === 'calibrated' ? '2025 flows' : 'design'} + built`) : ''; }).join('');
      ww.innerHTML = `<section class="mpc" data-info="mp-compare"><h3 class="svc-sub">2020 Master Plan vs this tracker <span class="muted small">average day flow, ML/d</span></h3>${mpLegend}
        <div class="table-wrap"><table class="dt mpc-table"><thead>${mpHead('Build-out against the Master Plan')}</thead><tbody>${rows}</tbody></table></div>
        <p class="small muted">Master Plan: forecast average daily flow by plant without east–west transfers (Vol. 4, Tables 7–8; G.E. Booth includes York and Toronto agreement flows). Tracker: the plant's sewershed today (${M.mode === 'calibrated' ? 'calibrated to 2025 flows' : 'design flows'}, with external inflows) + approved + proposed developments, as in the chart above. “≈ the MP's year” reads off when the Master Plan expected that flow.</p></section>`;
    }
    const w = $('#mp-w');
    if (w && M && R) {
      if (!WT().WF.data) { WT().loadWaterFacilities().then(d => { if (d) renderMpCompare(); }); w.innerHTML = skel('Loading the water facilities'); return; }
      const g = mpWaterGrowth(); if (!g) return;
      const rows = MP2020.water.map(r => {
        const x = g[r.key], measured = r.today && r.today(R);
        const today = measured != null ? measured : r.mp[0] + x.built;
        return mpRowHTML(r.name, `${fmtNum(x.n)} developments`, r.cap, r.capNote, r.mp, r.ref, today, x.approved, x.proposed, measured != null ? r.todayNote : 'MP 2021 + built');
      }).join('');
      const st = MP2020.storage.map(s => `<tr><td>${esc(s.name)}<small class="muted">Vol. 3, Table 12</small></td><td class="n">${s.avail} ML</td><td class="n">${[s.req[1], s.req[2], s.req[4]].join(' · ')} ML required</td><td colspan="5" class="muted small mpc-st">${s.req[4] > s.avail ? `Short by ${s.req[4] - s.avail} ML by 2041 in the Master Plan (new cell planned). ` : ''}Not computed by the tracker: storage includes fire and emergency volumes it doesn't model.</td></tr>`).join('');
      w.innerHTML = `<section class="mpc" data-info="mp-compare"><h3 class="svc-sub">2020 Master Plan vs this tracker <span class="muted small">maximum day, ML/d</span></h3>${mpLegend}
        <div class="table-wrap"><table class="dt mpc-table"><thead>${mpHead('Build-out against the Master Plan')}</thead><tbody>${rows}${st}</tbody></table></div>
        <p class="small muted">Master Plan: forecast maximum day demand for the facilities it assessed (Vol. 3, Tables 8, 9, 11, 12). Tracker: today is the 2025 measured maximum day for the plants, and the Master Plan's 2021 figure + growth built since the census for the pumping stations; then + approved and + proposed developments whose supply route (the water trace's station chain) passes the facility, at ${SvcTab().svcOpt.md === 'observed' ? 'the observed 2025 maximum day factor' : 'Peel design maximum day'}. York Region's agreement supply is in the Master Plan figures and the measured plant flows, not in the growth.</p></section>`;
    }
  }
  // Water tab: Facilities sub-view (Phase 4: headline → tiles → Master Plan compare →
  // top-N facilities table with "See all" → ⓘ line). The 2020 Master Plan vs tracker
  // comparison renders into #mp-w via renderMpCompare.
  function waterFacilitiesHTML() {
    const D = WT().WF.data; if (!D) { WT().loadWaterFacilities().then(d => { if (d) { const b = $('#wfac-sec'); if (b) { b.outerHTML = waterFacilitiesHTML(); renderMpCompare(); } } }); return '<div id="wfac-sec"></div>'; }
    const SYS = ['West', 'Central', 'East', 'Lake-based', 'Caledon groundwater'], fs = D.facilities;
    const plantCap = f => f.plant ? `${fmtNum(f.plant.ratedMLd)} ML/d<small>${f.plant.year} max day ${Math.round(f.plant.maxDayMLd / f.plant.ratedMLd * 100)}%</small>` : f.groundwater ? `system ${fmtNum(f.groundwater.ratedM3d)} m³/d<small>max day ${Math.round(f.groundwater.maxDayM3d / f.groundwater.ratedM3d * 100)}%</small>` : '';
    const short = f => [f.assess && f.assess.capacity.some((v, i) => v < f.assess.demand[i]) && 'treatment', ...(f.assessPumps || []).filter(a => a.capacity.some((v, i) => v < a.demand[i])).map(a => a.what.toLowerCase()), f.assessStorage && f.assessStorage.available.some((v, i) => v < f.assessStorage.required[i]) && 'storage'].filter(Boolean);
    const tot = { ml: fs.reduce((t, f) => t + (f.storageML || 0), 0) };
    const ratedTreat = fs.filter(f => f.plant && /Kennedy|Lorne/.test(f.name)).reduce((t, f) => t + (f.plant.ratedMLd || 0), 0);
    const nShort = fs.filter(f => short(f).length).length;
    const grpName = sy => esc(sy === 'Lake-based' ? 'Lake-based (other)' : sy === 'Caledon groundwater' ? 'Caledon groundwater systems' : `${sy} transmission system`);
    const rowFor = f => { const sh = short(f), w = WT().wfWorks(f); return `<tr class="wf-row" data-wf="${esc(f.id)}" tabindex="0"><td><i class="wf-ic wf-${f.kind}">${(WT().WF_KIND[f.kind] || ['●'])[0]}</i> ${esc(f.name)}</td><td>${esc(WT().wfKinds(f))}</td><td class="n">${f.pumps ? f.pumps.map(p => `<span class="wf-pz" title="Firm (largest pump out of service)${p.actualFirm != null && p.actualFirm !== p.firm ? `; the capacity check uses the 2020 Master Plan\u2019s modelled actual firm, ${fmtNum(p.actualFirm)}` : ''}">${esc(p.zone)} <strong>${fmtNum(p.firm)}</strong>${p.actualFirm != null && p.actualFirm !== p.firm ? `<small> actual ${fmtNum(p.actualFirm)}</small>` : ''}</span>`).join('') : ''}</td><td class="n">${f.storageML ? fmtNum(f.storageML) : ''}</td><td>${plantCap(f)}</td><td>${sh.length ? `<span class="dcn-gap-t">${esc(sh.join(', '))}</span>` : ''}</td><td>${w.length ? esc(w.flatMap(x => x.items.map(i => i.what)).slice(0, 3).join('; ')) : ''}</td></tr>`; };
    const tableFor = list => { const rows = SYS.map(sy => { const ls = list.filter(f => f.system === sy); if (!ls.length) return ''; return `<tr class="wf-grp"><td colspan="7">${grpName(sy)}</td></tr>${ls.map(rowFor).join('')}`; }).join(''); return rows ? `<div class="hyd-scroll"><table class="dt svc-table wf-table"><thead><tr><th>Facility</th><th>Type</th><th class="n">Firm pumping by zone fed (ML/d)</th><th class="n">Storage (ML)</th><th>Treatment</th><th>Master Plan: short by 2041</th><th>Planned DC works</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''; };
    const main = fs.filter(f => short(f).length), rest = fs.filter(f => !short(f).length);
    return `<div id="wfac-sec"><p class="headline">${fs.length} existing water facilities · ${fmtNum(tot.ml)} ML of storage${nShort ? ` · <strong>${nShort} short by 2041</strong> in the 2020 Master Plan assessment` : ''}.</p>
      <div class="ov-tiles">${WTab().wTile(fs.length, 'sites', 'existing water facilities')}${WTab().wTile(fmtNum(tot.ml), 'ML', 'storage', 'reservoirs, tanks & standpipes')}${WTab().wTile(fmtNum(ratedTreat), 'ML/d', 'treatment rated', 'A.P. Kennedy + Lorne Park')}${WTab().wTile(nShort, 'facilities', 'short by 2041', 'Master Plan assessment')}</div>
      <div id="mp-w"></div>
      <section class="wf-box" data-info="water-facilities"><h3 class="svc-sub">Existing water facilities <span class="muted small">short by 2041 first · ${fs.length} sites</span></h3>
      ${tableFor(main)}
      ${rest.length ? `<details class="dcn-more"><summary class="small">See all ${fs.length} facilities (${rest.length} with room to 2041)</summary>${tableFor(rest)}</details>` : ''}
      <p class="small muted">ⓘ Tap a row for the facility. Locations: Region of Peel open data (water storage, treatment plants and pumping stations). Pumping (firm = largest pump out of service) and reservoir capacity: 2020 Water and Wastewater Master Plan, Vol. 3, Tables 4–7; shortfalls by 2041: Tables 9, 11, 12; plant ratings and 2025 flows: the Region's drinking water reports. Booster and small stations without a published capacity are listed without one.</p></section></div>`;
  }
  document.addEventListener('click', e => {
    const r = e.target.closest('[data-wf]'); if (!r || !WT().WF.data) return;
    const f = WT().WF.data.facilities.find(x => x.id === r.dataset.wf); if (!f) return;
    WT().showWaterFacility(f); if (f.lnglat) { map.setView([f.lnglat[1], f.lnglat[0]], Math.max(map.getZoom(), 14)); if (!WT().WF.on) WT().setWfOn(true); }
  });
  // ---- Hydraulic check (beta): EPANET 2.2 in the browser (epanet-js) on the large mains that
  // carry water up into each pressure zone. Each zone boundary is a reservoir (the lower zone)
  // feeding the upper zones' maximum day demand through its crossing mains in parallel (1 km each,
  // Hazen-Williams C 120): EPANET splits the flow between them by size and gives each main's flow,
  // velocity and head loss per km. A skeleton to check the transfer mains, not a calibrated model:
  // the Region's InfoWater model holds the full network, pumps, storage and pressures.
  const HYD = { res: null, inp: '', busy: false, err: '' };
  const EPANET_URL = 'https://cdn.jsdelivr.net/npm/epanet-js@0.9.0/dist/index.mjs';
  function hydroInp(rows) {
    const L = ['[TITLE]', 'Peel pressure zone supply mains: skeleton from the Peel Growth Pipeline (unofficial)', '', '[JUNCTIONS]', ';ID  Elev  Demand(L/s)'];
    for (const r of rows) L.push(`U${r.i}  0  ${(r.qLs).toFixed(2)}  ;zone ${r.b.upper} and above`);
    L.push('', '[RESERVOIRS]', ';ID  Head'); for (const r of rows) L.push(`R${r.i}  100  ;zone ${r.b.lower}`);
    L.push('', '[PIPES]', ';ID  Node1  Node2  Length(m)  Diameter(mm)  Roughness(C)  MinorLoss  Status');
    for (const r of rows) r.b.mains.forEach((m, k) => L.push(`P${r.i}_${k + 1}  R${r.i}  U${r.i}  1000  ${m.d}  120  0  Open  ;${m.id}`));
    L.push('', '[OPTIONS]', 'Units LPS', 'Headloss H-W', '', '[END]', '');
    return L.join('\n');
  }
  async function runHydro() {
    if (HYD.busy) return; HYD.busy = true; HYD.err = ''; renderHydroBox();
    try {
      const sup = await loadWaterSupply(); if (!sup) throw new Error('The supply mains (data/water-supply.json) did not load.');
      const y = MA().getCapYear() == null ? null : MA().getCapYear();
      const rows = sup.boundaries.map((b, i) => { const c = cached(`sup:${b.lower}|${b.upper}`, () => supplyCons(b)); const q = c.q(y); return { i: i + 1, b, c, qMLd: q, qLs: q * 1e6 / 86400 }; });
      HYD.inp = hydroInp(rows);
      const E = await import(EPANET_URL);
      const ws = new E.Workspace(); await ws.loadModule();
      ws.writeFile('peel.inp', HYD.inp);
      const m = new E.Project(ws); m.open('peel.inp', 'peel.rpt', 'peel.bin'); m.solveH();
      for (const r of rows) r.mains = r.b.mains.map((mn, k) => { const ix = m.getLinkIndex(`P${r.i}_${k + 1}`); return { ...mn, q: m.getLinkValue(ix, E.LinkProperty.Flow), v: m.getLinkValue(ix, E.LinkProperty.Velocity), hl: m.getLinkValue(ix, E.LinkProperty.Headloss) }; });
      m.close();
      HYD.res = { rows, y, vmax: sup.velocity || 1.5, key: scenarioKey() };
    } catch (err) { HYD.err = err.message || String(err); }
    HYD.busy = false; renderHydroBox();
  }
  // Water tab: Hydraulic check sub-view (Phase 4). The EPANET beta check renders into
  // #hyd-box (inside #pane-hydro, created by Worker A). Clearly labelled beta throughout:
  // a screening skeleton, not the Region's calibrated model.
  function hydroBoxHTML() {
    if (!PIPE_RESULTS) return '<section class="hyd-box" id="hyd-box"><p class="small muted">The hydraulic check (EPANET, main by main) is hidden for now: pipe-by-pipe results are left to the Region\u2019s water model, which is the authority.</p></section>';
    const R = HYD.res && HYD.res.key === scenarioKey() ? HYD.res : null, yr = MA().getCapYear() == null ? 'build-out' : MA().getCapYear();
    const over = R ? R.rows.reduce((t, r) => t + r.mains.filter(m => m.v > R.vmax).length, 0) : 0;
    const nMains = R ? R.rows.reduce((t, r) => t + r.mains.length, 0) : 0;
    const vmax = R ? Math.max(0, ...R.rows.flatMap(r => r.mains.map(m => m.v))) : 0;
    const tiles = R ? `<div class="ov-tiles">${WTab().wTile(R.rows.length, 'boundaries', 'zone boundaries checked', `at the ${R.y == null ? 'build-out' : R.y} maximum day`)}${WTab().wTile(nMains, 'mains', 'large crossing mains modelled')}${WTab().wTile(over, 'mains', `over ${R.vmax} m/s`, over ? 'need DC mains or pumping on schedule' : 'all within the velocity limit')}${WTab().wTile(vmax.toFixed(2), 'm/s', 'highest velocity', `limit ${R.vmax} m/s`)}</div>` : '';
    const body = HYD.busy ? '<p class="small muted">Running EPANET…</p>' : HYD.err ? `<p class="small dcn-gap-t">EPANET could not run: ${esc(HYD.err)}</p>` : !R ? `<p class="small muted">Runs EPANET 2.2 (epanet-js, in this browser) on the large mains crossing into each upper pressure zone at the ${esc(String(yr))} maximum day demand.</p>` :
      `<div class="hyd-scroll"><table class="dt svc-table hyd-table"><thead><tr><th>Into zone</th><th>Max day</th><th>Main</th><th>Flow</th><th>Velocity</th><th>Head loss</th></tr></thead><tbody>
        ${R.rows.map(r => r.mains.map((mn, k) => `<tr${k ? '' : ' class="hyd-first"'}>${k ? '<td></td><td></td>' : `<td>${esc(r.b.upper)} and above<small>from zone ${esc(r.b.lower)}</small></td><td>${fmt1(r.qMLd)} ML/d<small>${fmtNum(Math.round(r.qLs))} L/s</small></td>`}<td>${mn.d} mm<small>${esc(mn.id)}</small></td><td>${fmtNum(Math.round(mn.q))} L/s</td><td class="${mn.v > R.vmax ? 'dcn-gap-t' : ''}">${mn.v.toFixed(2)} m/s</td><td>${mn.hl.toFixed(2)} m/km</td></tr>`).join('')).join('')}
      </tbody></table></div>
      <p class="small">${over ? `<strong>${over} main${over === 1 ? '' : 's'}</strong> above ${R.vmax} m/s at the ${esc(String(R.y == null ? 'build-out' : R.y))} maximum day: the transfer into ${over === 1 ? 'that zone' : 'those zones'} needs the DC mains or pumping on schedule.` : `Every crossing main stays at or below ${R.vmax} m/s at the ${esc(String(R.y == null ? 'build-out' : R.y))} maximum day.`}</p>`;
    return `<section id="hyd-box" class="hyd-box" data-info="hydraulics"><p class="headline"><strong>Beta.</strong> An experimental EPANET 2.2 check of the large mains feeding each upper pressure zone — a screening skeleton, not the Region's calibrated InfoWater model.</p>
      <h3 class="svc-sub">Hydraulic check <span class="fr-b fr-ref">beta · EPANET</span></h3>${tiles}${body}
      <p class="small"><button type="button" class="btn small" data-hyd="run"${HYD.busy ? ' disabled' : ''}>${R ? 'Run again' : 'Run EPANET check'}</button>${HYD.inp ? ' <button type="button" class="btn small" data-hyd="inp">Download .inp</button>' : ''}</p>
      <p class="small muted">ⓘ Beta: skeleton only — each zone boundary's crossing mains in parallel, 1 km long, Hazen-Williams C 120, from a fixed-head reservoir to the upper zones' maximum day. Pumps, storage, elevations and pressures are not in it. Velocity against the ${DCN.supply ? DCN.supply.velocity : 1.5} m/s used for the supply capacity. Open the .inp in EPANET or InfoWater to build on it.</p></section>`;
  }
  function renderHydroBox() { const b = $('#hyd-box'); if (b) b.outerHTML = hydroBoxHTML(); }
  document.addEventListener('click', e => {
    const h = e.target.closest('[data-hyd]'); if (!h) return;
    if (h.dataset.hyd === 'run') runHydro(); else if (h.dataset.hyd === 'inp' && HYD.inp) PE().download(`peel-zone-supply-${MM().THIS_YEAR}.inp`, window.PeelUtil.CSV_DISCLAIMER.replace(/^# /gm, '; ') + HYD.inp, 'text/plain');
  });
  const wellSystem = { AV13: 'Caledon Village – Alton', CE9: 'Palgrave – Caledon East' };
  const yearsAhead = () => { const ys = []; for (let y = MM().THIS_YEAR; y <= SP().hz.end; y++) ys.push(y); return ys; };
  // First year the flow reaches the limit: 'today' if already there, null if not by build-out.
  function runOut(q, limit) {
    if (q('today') >= limit(MM().THIS_YEAR)) return 'today';
    for (const y of yearsAhead()) if (q(y) >= limit(y)) return y;
    return null;
  }
  // People that fit in a room (same units as add(x)), by bisection; negative rooms scale linearly.
  function peopleFor(room, add) {
    if (!(room > 0)) { const m = add(1000) / 1000; return m > 0 ? room / m : 0; }
    let lo = 0, hi = 1000; while (add(hi) < room && hi < 1e8) hi *= 2;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (add(mid) < room) lo = mid; else hi = mid; }
    return lo;
  }
  const constructionYear = items => { const ys = items.flatMap(i => i.phases.filter(ph => ph[0] === 'C').map(ph => ph[1])).filter(y => y >= MM().THIS_YEAR - 1); return ys.length ? Math.min(...ys) : null; };

  // Wastewater: the DC main relieving an existing sewer (a twin, replacement or upsizing): along
  // half of it within 150 m, sized and placed like relief for it (js/dc-relief.js).
  function pipeReliefOf(i) {
    if (!DCN.pipeRelief) DCN.pipeRelief = new Map();
    if (DCN.pipeRelief.has(i)) return DCN.pipeRelief.get(i);
    const p = MM().SEW.data.pipes[i], c = p[10], pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k], c[k + 1]]);
    const mid = pts[Math.floor(pts.length / 2)], dLng = 300 / (111320 * Math.cos(mid[1] * Math.PI / 180)), dLat = 300 / 111320;
    const near = App().state.dcInfra.wastewater.lines.filter(({ bbox: b }) => !(mid[0] < b[0] - dLng || mid[0] > b[2] + dLng || mid[1] < b[1] - dLat || mid[1] > b[3] + dLat));
    const out = window.PeelDcRelief.pickRelief(p[0], pts, near, DI().dcDist);
    DCN.pipeRelief.set(i, out);
    return out;
  }
  const lineRelief = ln => ({ kind: 'line', ln, y: ln.y || null, text: `${ln.y || 'year not labelled'} ${ln.d ? `${ln.d} mm ` : ''}${DI().DC_KIND[ln.k][0].toLowerCase()}${ln.p ? ` ${ln.p}` : ''}${capTag(ln.y, ln.s, ln.p || ln.c)}` });
  const facRelief = (fc, what) => { const it = what ? fc.items.filter(i => what.test(i.what)) : fc.items; const y = constructionYear(it.length ? it : fc.items); return { kind: 'fac', fc, items: it.length ? it : fc.items, y, text: `${y || '–'} ${fc.name}${it.length ? ` · ${it.map(i => i.what).join(', ')}` : ''}${capTag(y, '', (it.length ? it : fc.items).map(i => i.proj).find(Boolean) || null)}` }; };
  // Growth (peak wet, L/s) of gp people, gj jobs on gh hectares, as in pipeFlow.
  function growthLs(gp, gj, gh) {
    const c = App().state.criteria, E = c.employment;
    return gp * c.wastewater.avg / 86400 * D.residentialPeaking(gp, c.wastewater) + gj * E.wastewater / 86400 * D.employmentPeaking(gj, E) + gh * c.wastewater.infiltration;
  }
  function pipeCons(i) {
    const p = MM().SEW.data.pipes[i], cap = p[2]; if (!cap) return null;
    const q = y => SC().pipeFlow(i, y).q, com = SC().pipeFlow(i, 'committed'), bo = SC().pipeFlow(i, null), none = SC().pipeFlow(i, 'none').q;
    const room = cap - com.q;
    const gp = com.pop - p[4], gh = com.ha - p[5];
    const people = peopleFor(room, x => growthLs(gp + x, com.jobs, gh + x * PP_HA) - growthLs(gp, com.jobs, gh));
    const ln = App().state.dcInfra && pipeReliefOf(i);
    return { id: `pipe:${i}`, sys: 'ww', kind: 'pipe', i, name: `${p[0]} mm sanitary sewer`, sub: `slope ${(p[1] * 100).toFixed(2)}%${p[7] ? ` · ${p[7]}` : ''}`, cap, unit: 'L/s',
      util: { today: q('today') / cap, com: com.q / cap, bo: bo.q / cap }, room, people, out: runOut(q, () => cap), relief: ln ? [lineRelief(ln)] : [], q,
      // The census flow alone over the full-pipe capacity: most likely the published slope (or a
      // parallel pipe the trace does not follow), not a sewer surcharging in dry weather.
      check: none >= cap };
  }
  // Pumping station on a traced catchment's outlet.
  function psCons(a) {
    const M = App().state.svcModel, sp = SD().spsOf(a), l = M && MA().psLoads(a); if (!sp || !l) return null;
    const flow = ll => (M.pdwf(ll, 1) + M.ii(ll)) * 1e6 / 86400;
    const at = y => y === 'today' ? { ...l, approved: 0, proposed: 0, japproved: 0, jproposed: 0 } : y === 'committed' ? { ...l, proposed: 0, jproposed: 0 } : MA().atYear(l, y);
    const q = y => flow(at(y)), cap = sp.firmLs, com = at('committed'), room = cap - flow(com);
    const people = peopleFor(room, x => flow({ ...com, approved: com.approved + x }) - flow(com));
    const words = s => SD().spsKey(s).replace(/\b(sewer|sanitary|sewage|pumping|station|ps|\d+)\b/g, ' ').replace(/\s+/g, ' ').trim();
    const k = words(sp.name);
    const facs = App().state.dcInfra ? App().state.dcInfra.wastewater.facilities.filter(f => f.kind === 'pumping_station' && words(f.name) && (k.includes(words(f.name)) || words(f.name).includes(k))) : [];
    return { id: `ps:${a.id}`, sys: 'ww', kind: 'ps', a, name: `${sp.name} pumping station`, sub: `firm ${fmtNum(cap)} L/s (2020 Master Plan) · peak wet`, cap, unit: 'L/s', note: SD().spsNote(sp),
      util: { today: q('today') / cap, com: flow(com) / cap, bo: q(null) / cap }, room, people, out: runOut(q, () => cap), relief: facs.map(f => facRelief(f)), q };
  }
  // The planned east-to-west diversion (annual reports: about 70 ML/d, G.E. Booth → Clarkson): ML/d
  // it moves at a plant when on (− at the source, + at the receiver), its start year, and whether the
  // current scenario has it on.
  function divInfo(pl) {
    const R = App().state.reports, dv = R && R.wastewater && R.wastewater.diversion; if (!dv) return null;
    const mld = pl === dv.from ? -dv.mld : pl === dv.to ? dv.mld : 0; if (!mld) return null;
    return { mld, year: (SP() && SP().hz && SP().hz.divYear) || 2028, on: SvcTab().svcOpt.div === 'on', dv };
  }
  // Wastewater treatment plant: average dry weather against 90% of rated capacity. The diversion is a
  // step at its start year, so the check can give the run-out year both with and without it.
  function plantCons(pl) {
    const M = App().state.svcModel, cap = M && M.plantCap(pl); if (!cap) return null;
    const di = divInfo(pl), Y0 = MM().THIS_YEAR;
    // Flows without the diversion (the model adds it to future layers when it's on; to today once started).
    const dNow = di && di.on ? di.mld : 0, started = di && Y0 >= di.year;
    const ex0 = cap.existing - (started ? dNow : 0), com0 = cap.committed - dNow, bo0 = cap.buildout - dNow;
    const A0 = com0 - ex0, P0 = bo0 - com0;
    const base = y => { if (y === 'today') return ex0; if (y === 'committed') return com0; if (y == null) return bo0; const { fa, fp } = MA().hzFrac(y); return ex0 + A0 * fa + P0 * fp; };
    const yr = y => (y === 'today' ? Y0 : y === 'committed' ? Y0 + 1 : y == null ? SP().hz.end : y);
    const qWith = on => y => base(y) + (on && di && (y === 'committed' || y == null || yr(y) >= di.year) ? di.mld : 0);
    const q = qWith(!!(di && di.on));
    const steps = (App().state.dcInfra && App().state.dcInfra.plantCapacity[pl]) || [];
    const ratedAt = y => steps.reduce((r, s) => y >= s.year ? Math.max(r, s.mld) : r, cap.rated);
    const lim = PLANT_TRIGGER * cap.rated, room = lim - cap.committed;
    const fac = App().state.dcInfra && App().state.dcInfra.wastewater.facilities.find(f => f.kind === 'plant' && f.plant === pl);
    const trig = y => PLANT_TRIGGER * ratedAt(y === 'today' ? Y0 : y);
    const after = runOut(q, trig);
    const alt = di ? { on: !di.on, out: runOut(qWith(!di.on), () => lim), outAfter: steps.length ? runOut(qWith(!di.on), trig) : undefined } : null;
    const yTxt = o => (o === 'today' ? 'already' : o == null ? `after ${SP().hz.end}` : `≈${o}`);
    const altAfter = steps.length && alt && alt.outAfter !== alt.out ? ` (${yTxt(alt.outAfter)} with the planned expansions)` : '';
    const divTxt = di ? ` · ${di.on ? 'with' : 'without'} the ${fmt1(Math.abs(di.mld))} ML/d diversion from ${di.year}; ${alt.on ? 'with' : 'without'} it, the trigger is reached ${yTxt(alt.out)}${altAfter}` : '';
    return { id: `plant:${pl}`, sys: 'ww', kind: 'plant', pl, name: cap.name, sub: `rated ${capTxt(cap.rated, cap.rated)} · ${Math.round(PLANT_TRIGGER * 100)}% expansion trigger (2020 Master Plan) · ${SvcTab().wwFlowLabel()}${divTxt}`, cap: lim, unit: 'ML/d',
      util: { today: cap.existing / lim, com: cap.committed / lim, bo: cap.buildout / lim }, room, people: room * 1e6 / (cap.perPerson || 1), out: runOut(q, () => lim), outAfter: steps.length ? after : undefined, alt,
      relief: steps.map(s => ({ kind: 'step', y: s.year, fc: fac, step: s, text: `${s.year} ${s.mld} ML/d${s.proj ? ` (${s.proj})` : ''}${capTag(s.year, /council.approved/i.test(s.note || '') ? 'approved' : '', s.proj, /council.approved/i.test(s.note || '') ? 'council-approved February 2024' : 'DC schedule')}` })), q, rated: cap.rated };
  }
  // Wastewater treatment plant BOD loading (2020 Master Plan, Vol. 4, Tables 3 and 9): the plan's 2021
  // loading + growth since the census at 75 g/person/day and 37.5 g/job/day + the plan's high-strength
  // user increase (500 kg/d a year, split by the plants' 2019 loadings), against the existing governing
  // capacity (G.E. Booth secondary clarifiers, Clarkson anaerobic digestion). The diversion moves
  // loading with its flow at the source plant's 2021 strength.
  const BOD_PLANT = { Lakeview: 'G.E. Booth WWTP', Clarkson: 'Clarkson WWTP' };
  function bodGrowth(pl) {
    const M = App().state.svcModel, bc = CA().baselineCensus(); if (!M || !bc || !App().state.servicing) return null;
    const key = scenarioKey() + App().state.projects.length;
    if (!bodGrowth.v || bodGrowth.key !== key) { bodGrowth.v = {}; bodGrowth.key = key; }
    if (bodGrowth.v[pl]) return bodGrowth.v[pl];
    const devs = SD().svcDevs().filter(p => {
      if (p.phase === 'cancelled' || p.lat == null || MM().svcLayerOf(p) === 'existing') return false;
      const d = SD().svcById.get(SD().svcIds(p, 'dr')[0]); return !!d && d.plant === pl;
    });
    const gr = Areas().growthSince(devs, {}, bc.date, App().state.criteria), j = SvcTab().svcJobs(devs, bc.date);
    return (bodGrowth.v[pl] = { devs, gr, j });
  }
  function bodCons(pl) {
    const W = DCN.mpww; if (!W || !BOD_PLANT[pl]) return null;
    const L = W.plantLoading, row = L.rows.find(r => r.plant === BOD_PLANT[pl]), F = W.flowForecast, C = W.designCriteria.bodLoading; if (!row) return null;
    const g = bodGrowth(pl); if (!g) return null;
    const i21 = L.years.indexOf(2021), i19 = L.years.indexOf(2019), Y0 = MM().THIS_YEAR;
    const kgOf = (pop, jobs) => (pop * C.residential_gpd + jobs * C.employment_gpd) / 1000;
    const x = { built: kgOf(g.gr.built.population, g.j.jbuilt || 0), approved: kgOf(g.gr.approved.population, g.j.japproved || 0), proposed: kgOf(g.gr.proposed.population, g.j.jproposed || 0) };
    const hiShare = row.demandKgd[i19] / L.rows.reduce((a, r) => a + r.demandKgd[i19], 0);
    const hi = y => C.highUserAnnualIncrease_kgd * hiShare * Math.max(0, y - 2021);
    const di = divInfo(pl), src = L.rows.find(r => r.plant === BOD_PLANT[di && di.dv.from]), srcFlow = di && (di.dv.from === 'Lakeview' ? F.eastSubtotal : F.westSubtotal)[F.years.indexOf(2021)];
    const divKg = di && src ? di.mld * src.demandKgd[i21] / srcFlow : 0;   // signed like di.mld
    const yr = y => (y === 'today' ? Y0 : y === 'committed' ? Y0 + 1 : y == null ? SP().hz.end : y);
    const qWith = on => y => {
      const Y = yr(y), base = row.demandKgd[i21] + x.built + hi(Y);
      const grow = y === 'today' ? 0 : y === 'committed' ? x.approved : y == null ? x.approved + x.proposed : (({ fa, fp }) => x.approved * fa + x.proposed * fp)(MA().hzFrac(y));
      return base + grow + (on && di && Y >= di.year ? divKg : 0);
    };
    const q = qWith(!!(di && di.on)), cap = row.governingKgd, com = q('committed'), room = cap - com;
    const perPerson = C.residential_gpd / 1000;
    const ups = (W.plannedUpgrades.rows || []).filter(u => new RegExp(BOD_PLANT[pl].replace(' WWTP', '').replace('.', '\\.')).test(u.name) && u.year >= Y0);
    const relief = ups.map(u => ({ kind: 'mpu', y: u.year, up: u, text: `${u.year} ${u.name.replace(/^.*?WWTP\s*[–-]?\s*/, '') || 'Expansion'} (${u.id}, 2020 Master Plan; loading capacity it adds not published)` }));
    const alt = di ? { on: !di.on, out: runOut(qWith(!di.on), () => cap) } : null;
    const yTxt = o => (o === 'today' ? 'already' : o == null ? `after ${SP().hz.end}` : `≈${o}`);
    return { id: `bod:${pl}`, sys: 'ww', kind: 'bod', pl, name: `${BOD_PLANT[pl].replace('WWTP', 'WRRF')} BOD loading`,
      sub: `governing ${fmtNum(cap)} kg/d (${row.governedBy}; 2020 Master Plan, Vol. 4, Table 9) · plan 2021 loading + growth at 75 g/person, 37.5 g/job + high-strength users${di ? ` · ${di.on ? 'with' : 'without'} the diversion; ${alt.on ? 'with' : 'without'} it, capacity is reached ${yTxt(alt.out)}` : ''}`,
      cap, unit: 'kg/d', util: { today: q('today') / cap, com: com / cap, bo: q(null) / cap }, room, people: room / perPerson, out: runOut(q, () => cap), relief, q, alt, devSet: new Set(g.devs) };
  }
  // Water: max day of a set of zones by year (ML/d).
  function zonesMax(ids, y) {
    const M = App().state.svcModel; let t = 0;
    for (const id of ids) {
      const l = M.zones.get(id); if (!l) continue;
      const ll = y === 'today' ? { ...l, approved: 0, proposed: 0, japproved: 0, jproposed: 0 } : y === 'committed' ? { ...l, proposed: 0, jproposed: 0 } : MA().atYear(l, y);
      t += M.wMax(M.total(ll), M.jobs(ll));
    }
    return t;
  }
  const perPersonMax = () => App().state.svcModel.wMax(1, 0);
  // Only zones already in the servicing lookup (svcById is filled after the optional data loads;
  // a render in between used to throw on the missing zone and leave a stale model).
  const lakeZones = () => App().state.servicing.zones.filter(z => zLevel(z.zone) != null && !wellSystem[z.zone] && SD().svcById.has(z.id)).map(z => z.id);
  function waterPlantCons(zone) {
    const R = App().state.reports; if (!R || !App().state.svcModel) return null;
    if (wellSystem[zone.zone]) {
      const s = R.water.caledon.find(x => x.name === wellSystem[zone.zone]); if (!s) return null;
      const ids = [zone.id], base = s.maxDayM3d / 1000, rated = s.ratedM3d / 1000, lim = PLANT_TRIGGER * rated;
      const q = y => base + zonesMax(ids, y) - zonesMax(ids, 'today');
      const room = lim - q('committed');
      const wells = App().state.dcInfra ? App().state.dcInfra.water.facilities.filter(f => f.kind === 'well' && s.communities.includes(f.name)) : [];
      return { id: `wsys:${s.name}`, sys: 'water', kind: 'wplant', name: `${s.name} wells`, sub: `rated ${fmt1(rated)} ML/d · 2025 max day ${fmt1(base)} ML/d + growth`, cap: lim, unit: 'ML/d', zones: ids,
        util: { today: q('today') / lim, com: q('committed') / lim, bo: q(null) / lim }, room, people: room / perPersonMax(), out: runOut(q, () => lim), relief: wells.map(f => facRelief(f)), q };
    }
    const sp = R.water.southPeel, ids = lakeZones(), rated = sp.plants.reduce((t, p) => t + p.ratedMLd, 0), lim = PLANT_TRIGGER * rated;
    // Before the zones are in the servicing lookup there is no growth to add: not a result (it would
    // read 2025 max day alone, 48% → 48%, and stay cached for this model).
    if (!ids.length) return null;
    const q = y => sp.maxDayMLd + zonesMax(ids, y) - zonesMax(ids, 'today');
    const room = lim - q('committed');
    const facs = App().state.dcInfra ? App().state.dcInfra.water.facilities.filter(f => f.kind === 'plant') : [];
    return { id: 'wsys:southPeel', sys: 'water', kind: 'wplant', name: 'South Peel water treatment (A.P. Kennedy + Lorne Park)', sub: `rated ${fmt1(rated)} ML/d · 2025 max day ≤ ${fmt1(sp.maxDayMLd)} ML/d (incl. York supply) + growth`, cap: lim, unit: 'ML/d', zones: ids,
      util: { today: q('today') / lim, com: q('committed') / lim, bo: q(null) / lim }, room, people: room / perPersonMax(), out: runOut(q, () => lim), relief: facs.map(f => facRelief(f, /treatment expansion/i)), q };
  }
  // Storage: master plan required vs available (interpolated by year), at the facility's zone.
  function storageCons() {
    const mp = App().state.reports && App().state.reports.masterPlan; if (!mp || !App().state.dcInfra) return [];
    const ys = mp.storageYears;
    const interp = (arr, y) => { if (y <= ys[0]) return arr[0]; for (let k = 1; k < ys.length; k++) if (y <= ys[k]) return arr[k - 1] + (arr[k] - arr[k - 1]) * (y - ys[k - 1]) / (ys[k] - ys[k - 1]); return arr[arr.length - 1]; };
    return mp.storage.map(r => {
      const nm = r.facility.replace(/ \(.*$/, '').replace(/ (Reservoir|Elevated Tank)$/, '');
      const fc = App().state.dcInfra.water.facilities.find(f => f.name === nm);
      const zid = fc && fc.g ? Areas().locate(App().state.servicing.zones, fc.g[0], fc.g[1])[0] : null;
      const req = y => interp(r.required, y === 'today' || y === 'committed' ? MM().THIS_YEAR : y == null ? SP().hz.end : y), avail = y => interp(r.available, y === 'today' || y === 'committed' ? MM().THIS_YEAR : y == null ? SP().hz.end : y);
      const now = avail(MM().THIS_YEAR) || Math.max(...r.available);
      const room = avail('today') > 0 ? avail('today') - req('today') : null;
      return { id: `stor:${nm}`, sys: 'water', kind: 'storage', name: r.facility, sub: `required vs available storage (2020 Master Plan forecast)${zid ? ` · in ${SD().svcById.get(zid).name}` : ''}`, cap: now, unit: 'ML', zones: zid ? [zid] : [],
        util: { today: req('today') / (avail('today') || now), com: req('today') / (avail('today') || now), bo: req(null) / (avail(null) || now) }, room, people: room == null ? 0 : room * 1e6 / (1.25 * 0.25 * perPersonMax() * 1e6),
        out: (() => { for (const y of yearsAhead()) if (avail(y) > 0 && req(y) >= avail(y)) return y; return null; })(), relief: fc ? [facRelief(fc, /reservoir|tank/i)] : [], mp: true };
    });
  }
  // Supply: large mains across the boundary into zone level L carry the max day of every lake-based
  // zone at level L and above (rough: 1.5 m/s, valves and pumping not modelled).
  function supplyCons(b) {
    const L = zLevel(b.upper), ids = lakeZones().filter(id => zLevel(SD().svcById.get(id).zone) >= L);
    const q = y => zonesMax(ids, y), cap = b.capMLd, room = cap - q('committed');
    const lines = App().state.dcInfra ? App().state.dcInfra.water.lines.filter(ln => ln.y && ln.y >= MM().THIS_YEAR && (ln.k === 'transmission') && (() => {
      let lo = false, hi = false; for (let k = 0; k < ln.g.length; k += 3) { const z = Areas().locate(App().state.servicing.zones, ln.g[k][0], ln.g[k][1])[0]; const lv = z && zLevel(SD().svcById.get(z).zone); if (lv === L - 1 || SD().svcById.get(z || '')?.zone === b.lower) lo = true; if (lv === L) hi = true; } return lo && hi;
    })()) : [];
    const byP = new Map(); for (const ln of lines) { const k = ln.p || ln.c; if (!byP.has(k) || (ln.d || 0) > (byP.get(k).d || 0)) byP.set(k, ln); }
    const pss = App().state.dcInfra ? App().state.dcInfra.water.facilities.filter(f => (f.kind === 'pumping_station' || f.kind === 'reservoir') && f.g && (() => { const z = Areas().locate(App().state.servicing.zones, f.g[0], f.g[1])[0]; const lv = z && zLevel(SD().svcById.get(z).zone); return lv === L - 1 || lv === L; })()) : [];
    return { id: `sup:${b.lower}|${b.upper}`, sys: 'water', kind: 'supply', name: `Supply into zone ${b.upper} and above`, sub: `${b.mains.length} large mains cross from zone ${b.lower} (${b.mains.map(m => m.d).join(', ')} mm) ≈ ${fmtNum(cap)} ML/d at 1.5 m/s · rough`, cap, unit: 'ML/d', zones: ids,
      util: { today: q('today') / cap, com: q('committed') / cap, bo: q(null) / cap }, room, people: room / perPersonMax(), out: runOut(q, () => cap),
      relief: [...[...byP.values()].sort((a, b) => a.y - b.y).map(lineRelief), ...pss.map(f => facRelief(f, /pumping|expansion/i))].sort((a, b) => (a.y || 9999) - (b.y || 9999)), q };
  }
  // ---- Trunk mains (2020 Master Plan, Vol. 3, pp.134–136) -----------------------------------------
  // The lake-based system is three trunk systems (West from Lorne Park, Central from A.P. Kennedy, East
  // fed from Central). The plan gives each trunk main's actual capacity (calibrated model roughness)
  // and the maximum day it carries by year. Growth reaches a trunk through parallel routes the plan
  // splits by model, so a single traced route can't apportion it: each trunk takes the plan's own
  // share of its system's growth (its 2021→2041 increase over the system's, Table 8), applied to the
  // tracker's growth on that system (developments whose supply route starts at that system's plant or
  // uses its pumps). Flow = the plan's 2021 figure + that share of built, approved and proposed growth,
  // against the capacity of the mains in service that year. Replaces the zone-boundary estimate (every
  // large main crossing a zone line at 1.5 m/s), which counted distribution mains and read far too high.
  const SYS_NAME = { W: 'West', C: 'Central', E: 'East' };
  const TRUNK_NOTE = 'Water trunk mains: actual capacity and flow from the 2020 Master Plan (Vol. 3); growth since the census on each trunk system is shared across its mains as the plan shares its own growth (York agreement flows added on the two Central mains that carry them). The West and Central/East systems are interconnected, so a short trunk is a flag, not a hard limit.';
  const inYear = m => (/^\d{4}$/.test(m.inService) ? +m.inService : Infinity);
  const mpTrunks = () => (DCN.mpw && DCN.mpw.trunks || []).filter(t => t.zone != null);
  function trunkCapAt(t, y) { return t.mains.reduce((a, m) => inYear(m) <= y ? a + m.actualMLd : a, 0); }
  // A development's trunk system from its supply route: West from Lorne Park; East when it uses the
  // East pumps (Airport Road, Tullamore); otherwise Central.
  function traceSystem(tr) {
    if (!tr || tr.gw || !tr.steps.length) return null;
    const last = tr.steps[tr.steps.length - 1].f, sys = new Set(tr.steps.map(s => s.pump && s.pump.sys).filter(Boolean));
    if (last && last.kind === 'plant' && /Lorne/.test(last.name)) return 'W';
    return sys.has('E') ? 'E' : sys.has('W') ? 'W' : 'C';
  }
  // Which developments' growth a trunk's share applies to: West trunks, the West system; East trunks,
  // the East system; Central trunks, Central and East (East water is pumped up the Central trunks to
  // Beckett Sproule before the transfer).
  const trunkPool = t => (t.system === 'C' ? ['C', 'E'] : [t.system]);
  // The plan's growth 2021→2041 (Table 8) over that pool (Bolton counted with East), and the trunk's
  // own 2021→2041 increase less the York agreement increase on the trunks that carry York (p.64).
  const yorkAt = y => { const S = DCN.mpw.systemDemand, Y = S.years, v = S.york; if (y <= Y[0]) return v[0]; for (let i = 1; i < Y.length; i++) if (y <= Y[i]) return v[i - 1] + (v[i] - v[i - 1]) * (y - Y[i - 1]) / (Y[i] - Y[i - 1]); return v[v.length - 1]; };
  function trunkShare(t) {
    const S = DCN.mpw.systemDemand, i0 = S.years.indexOf(2021), i1 = S.years.indexOf(2041), d = k => S[k][i1] - S[k][i0];
    const pool = trunkPool(t).reduce((a, k) => a + d(k) + (k === 'E' ? d('B') : 0), 0);
    const own = t.demandMLd[4] - t.demandMLd[0] - (t.carriesYork ? yorkAt(2041) - yorkAt(2021) : 0);
    return pool > 0 ? Math.max(0, own) / pool : 0;
  }
  // Growth (ML/d, maximum day) on each trunk system, by layer, from the developments' supply routes.
  function mpSystemGrowth() {
    const M = App().state.svcModel, bc = CA().baselineCensus(); if (!M || !bc || !WT().WF.data || !App().state.servicing || !DCN.mpw) return null;
    const key = scenarioKey() + App().state.projects.length;
    if (mpSystemGrowth.key === key) return mpSystemGrowth.v;
    const groups = { W: [], C: [], E: [] }, level = new Map();
    for (const p of SD().svcDevs()) {
      if (p.phase === 'cancelled' || p.lat == null || MM().svcLayerOf(p) === 'existing') continue;
      const zid = SD().svcIds(p, 'pz')[0]; if (!zid) continue;
      const tr = WT().waterTrace(p, zid), s = traceSystem(tr); if (!s) continue;
      groups[s].push(p); level.set(p, zLevel(tr.z.zone) || 0);
    }
    const v = {};
    for (const s of ['W', 'C', 'E']) {
      const devs = groups[s], gr = Areas().growthSince(devs, {}, bc.date, App().state.criteria), j = SvcTab().svcJobs(devs, bc.date);
      v[s] = { devs, level, built: M.wMax(gr.built.population, j.jbuilt || 0), approved: M.wMax(gr.approved.population, j.japproved || 0), proposed: M.wMax(gr.proposed.population, j.jproposed || 0) };
    }
    mpSystemGrowth.key = key; mpSystemGrowth.v = v;
    return v;
  }
  function trunkCons(t) {
    const G = mpSystemGrowth(); if (!G) return null;
    const pool = trunkPool(t), k = trunkShare(t), Y0 = MM().THIS_YEAR, sum = f => pool.reduce((a, s) => a + f(G[s]), 0);
    const x = { built: sum(g => g.built) * k, approved: sum(g => g.approved) * k, proposed: sum(g => g.proposed) * k };
    // York agreement flow on the trunks that carry it, by year (2021 is already in the plan's figure).
    const york = y => (t.carriesYork ? yorkAt(y) - yorkAt(2021) : 0);
    const today = t.demandMLd[0] + x.built + york(Y0), com = today + x.approved, bo = com + x.proposed + york(SP().hz.end) - york(Y0);
    const q = y => { if (y === 'today') return today; if (y === 'committed') return com; if (y == null) return bo; const { fa, fp } = MA().hzFrac(y); return t.demandMLd[0] + x.built + york(y) + x.approved * fa + x.proposed * fp; };
    const capY = y => trunkCapAt(t, y === 'today' ? Y0 : y), cap = capY(Y0);
    const room = cap > 0 ? cap - com : null;
    const relief = t.mains.filter(m => inYear(m) >= Y0 && inYear(m) !== Infinity).sort((a, b) => inYear(a) - inYear(b))
      .map(m => ({ kind: 'mp', y: inYear(m), main: m, text: `${m.inService} ${m.diameterMm} mm ${m.name.replace(/ PZ\d.*$/, '')} main, +${fmtNum(m.actualMLd)} ML/d (2020 Master Plan)` }));
    const L = +t.zone, ids = lakeZones().filter(id => zLevel(SD().svcById.get(id).zone) >= L);
    const devSet = new Set(pool.flatMap(s => G[s].devs.filter(p => (G[s].level.get(p) || 0) >= L)));
    const den = v => (cap > 0 ? v / cap : 0);
    // People: the trunk takes share k of each added person's max day on its system.
    const pp = perPersonMax() * (k || 1);
    return { id: `trunk:${t.id}`, sys: 'water', kind: 'trunk', trunk: t, share: k, name: `${t.route} trunk main (${t.id})`,
      sub: `${SYS_NAME[t.system]} system · zone ${t.zone} · ${cap > 0 ? `actual ${fmtNum(cap)} ML/d` : 'not in service yet'} · 2020 Master Plan 2021 flow + ${Math.round(k * 100)}% of ${pool.map(s => SYS_NAME[s]).join(' + ')} growth (the plan's share)${t.carriesYork ? ' + York agreement' : ''}`, cap, unit: 'ML/d', zones: ids,
      util: { today: den(today), com: den(com), bo: den(bo) }, room, people: room == null ? 0 : room / pp, out: runOut(q, cap > 0 ? () => cap : capY), relief, q, devSet };
  }
  // The trunks a development relies on: on its trunk system, the mains at or below its zone; the
  // tightest one.
  function trunkNeeds(p, zid) {
    if (!DCN.mpw || !WT().WF.data) return [];
    const tr = WT().waterTrace(p, zid), s = traceSystem(tr); if (!s) return [];
    const L = zLevel(tr.z.zone) || 0, cs = [];
    for (const t of mpTrunks()) {
      if (!trunkPool(t).includes(s) || +t.zone > L || trunkShare(t) === 0) continue;
      const c = cached(`trunk:${t.id}`, () => trunkCons(t)); if (c) cs.push(c);
    }
    if (!cs.length) return [];
    const order = { gap: 0, planned: 1, check: 2, ok: 3 };
    for (const c of cs) c.status = consStatus(c);
    return [cs.sort((a, b) => order[a.status] - order[b.status] || a.people - b.people)[0]];
  }
  // Status of a constraint: ok (lasts to build-out), planned (relief before it runs out), gap.
  function consStatus(c) {
    if (c.check) return 'check';
    if (c.out == null && !(c.outAfter != null)) return 'ok';
    const ry = c.relief.map(r => r.y).filter(Boolean);
    const outY = c.out === 'today' ? MM().THIS_YEAR : c.out;
    if (c.kind === 'plant' && c.out != null) return c.outAfter != null ? 'gap' : (ry.length && Math.min(...ry) <= outY ? 'planned' : 'gap');
    if (!ry.length) return 'gap';
    return Math.min(...ry) <= outY ? 'planned' : 'gap';
  }
  /* Phase 3b: pipe what-if (js/tools-upgrade.js). While a pipe upgrade is active,
     tools-upgrade.js sets this suffix via PeelApp.upgBump(); it becomes part of
     the scenario key so cached() rebuilds the DCN cache with the upgraded
     pipe's capacity. Empty in normal use: no behaviour change. */
  let sewUpgKey = '';
  // Every switch that changes a result is in the key (the diversion, counting basis and outside-area
  // rule included), so a cached result never outlives the scenario it was computed for.
  function scenarioKey() { const o = SvcTab().svcOpt; return `${MM().SEW.key}|${JSON.stringify(SP().hz)}|${MA().getCapYear()}|${App().state.svcModel && App().state.svcModel.Y}|${o.ww}|${o.md}|${o.div}|${o.nr}|${App().state.basis}|g${App().state.svcGen || 0}|c${window.PeelCapitalEA && window.PeelCapitalEA.data && window.PeelCapitalEA.data.loaded ? 1 : 0}${sewUpgKey}`; }
  function cached(id, fn) {
    const k = scenarioKey(); if (DCN.key !== k) { DCN.cache.clear(); DCN.key = k; }
    if (DCN.cache.has(id)) return DCN.cache.get(id);
    const v = fn();
    if (v != null) DCN.cache.set(id, v);   // (not ready yet: ask again next time)
    return v;
  }
  // Constraints a development relies on.
  function devNeeds(p) {
    const f = SD().svcFacts(p); if (!f) return null;
    const out = [];
    // Sewers on its path: pipes at 90%+ of full capacity by build-out, grouped by the DC main that
    // relieves them (or by run when none does); the tightest of each group.
    if (PIPE_RESULTS && MM().SEW.data && p.lat != null) {
      SC().sewerGrowth(); const k = MM().SEW.growth.devPipe.get(p) ?? SC().nearestPipe(p.lng, p.lat);
      const groups = new Map(); let run = 0, prevFlag = false;
      for (let i = k, hop = 0; i >= 0 && hop < 2000; i = MM().SEW.data.pipes[i][3], hop++) {
        const c = cached(`pipe:${i}`, () => pipeCons(i));
        const flag = c && c.util.bo >= 0.9; if (!flag) { prevFlag = false; continue; }
        const ln = c.relief[0] && c.relief[0].ln, key = ln ? `ln:${ln.p || ln.c}` : `run:${prevFlag ? run : ++run}`;
        prevFlag = true;
        const g = groups.get(key) || { list: [] }; g.list.push(c); groups.set(key, g);
      }
      for (const g of groups.values()) { const ok = g.list.filter(x => !x.check), c = (ok.length ? ok : g.list).slice().sort((a, b) => a.people - b.people)[0]; out.push({ ...c, id: `dgrp:${c.i}`, n: g.list.length, members: g.list.map(x => x.i) }); }
    }
    for (const a of new Set([...f.path.filter(x => x.kind === 'ps'), ...f.sps.map(x => x.a)])) { const c = cached(`ps:${a.id}`, () => psCons(a)); if (c) out.push(c); }
    if (f.pl && f.pl !== 'Toronto') {
      const c = cached(`plant:${f.pl}`, () => plantCons(f.pl)); if (c) out.push(c);
      const b = BOD_PLANT[f.pl] && cached(`bod:${f.pl}`, () => bodCons(f.pl)); if (b) out.push(b);
    }
    if (f.z) {
      const c = cached(wellSystem[f.z.zone] ? `wsys:${f.z.zone}` : 'wsys:lake', () => waterPlantCons(f.z)); if (c) out.push(c);
      for (const s of cached('storage', storageCons)) if (s.zones.includes(f.z.id)) out.push(s);
      if (zLevel(f.z.zone) != null && !wellSystem[f.z.zone]) out.push(...trunkNeeds(p, f.z.id));
    }
    const order = { gap: 0, planned: 1, check: 2, ok: 3 };
    for (const c of out) c.status = consStatus(c);
    return out.sort((a, b) => order[a.status] - order[b.status] || (a.out === 'today' ? 0 : a.out || 9999) - (b.out === 'today' ? 0 : b.out || 9999) || a.people - b.people);
  }
  const ppuOf = p => { const e = p && D.estimate([p], App().state.criteria, 'all', App().jobsOf); return e && e.totalUnits > 0 && e.population > 0 ? e.population / e.totalUnits : (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment; };
  const outText = c => c.out === 'today' ? '<strong>already</strong>' : c.out == null ? `after ${SP().hz.end}` : `≈${c.out}`;
  const STATUS = { gap: ['dcn-gap', 'Screens late: runs out before the DC project is in service'], planned: ['dcn-ok', 'DC project in time'], check: ['dcn-check', 'Check the data: the existing flow alone is over the full-pipe capacity from the published slope'], ok: ['dcn-fine', 'Room to build-out'] };
  function roomText(c, ppu) {
    if (c.room == null) return '<span class="muted">new facility</span>';
    if (c.room <= 0) return `<strong>none</strong> <small>over by ${c.unit === 'L/s' ? fmtNum(Math.round(-c.room)) : fmt1(-c.room)} ${c.unit} (${c.kind === 'plant' || c.kind === 'wplant' ? `${SvcTab().pctRated(c, 'com')}% of rated; trigger ${Math.round(PLANT_TRIGGER * 100)}%` : `${Math.round((c.util.com - 1) * 100)}%`})</small>`;
    return `${fmtNum(roundPop(c.people))} people${ppu ? `<small>≈${fmtNum(Math.round(c.people / ppu))} units</small>` : ''}`;
  }
  const reliefHTML = c => c.relief.length ? c.relief.slice(0, 3).map(r => `<button type="button" class="btn small link" data-dcn-relief="${esc(c.id)}|${c.relief.indexOf(r)}">${esc(r.text)}</button>`).join('<br>') + (c.relief.length > 3 ? ` <small>+${c.relief.length - 3}</small>` : '') : '<span class="muted">none on the 2026 DC map</span>';
  // % of rated capacity for plants and water treatment (never % of the 90% trigger, SPEC 1.4); % of
  // capacity (firm, full pipe) for the rest.
  const pctCap = (c, k) => (c.kind === 'plant' || c.kind === 'wplant' ? SvcTab().pctRated(c, k) : Math.round(c.util[k] * 100));
  const consName = c => `${c.kind === 'pipe' ? `<button type="button" class="btn small link" data-pipe="${c.i}">${esc(c.name)}</button>` : `<button type="button" class="btn small link" data-dcn-cons="${esc(c.id)}">${esc(c.name)}</button>`}${c.kind === 'pipe' ? ` <button type="button" class="btn small link dcn-who" data-dcn-cons="${esc(c.id)}">who relies</button>` : ''}<small>${esc(c.sub)}${c.n > 1 ? ` · ${c.n} pipes over 90%` : ''}${c.mp ? '' : ` · ${pctCap(c, 'com')}% with approved → ${pctCap(c, 'bo')}% at build-out${c.kind === 'plant' || c.kind === 'wplant' ? ' of rated' : ''}`}</small>`;
  function needsTable(list, ppu, opts = {}) {
    return `<table class="dt dcn-table"><thead><tr><th>${opts.first || 'Existing capacity'}</th><th>Room after approved</th><th>Runs out</th><th>DC relief (construction)</th></tr></thead><tbody>
      ${list.map(reg).map(c => `<tr class="${STATUS[c.status][0]}"><td>${c.sys === 'water' ? '💧 ' : ''}${consName(c)}</td><td data-l="Room after approved">${roomText(c, ppu)}</td><td data-l="Runs out">${outText(c)}${c.outAfter != null ? `<small>again ${c.outAfter === 'today' ? 'now' : `≈${c.outAfter}`} with the expansions</small>` : ''}<small>${esc(STATUS[c.status][1])}</small></td><td data-l="DC relief">${reliefHTML(c)}</td></tr>`).join('')}</tbody></table>`;
  }
  function dcNeedsHTML(p, sys = null) {
    if (!App().state.svcModel) return '';
    const all = devNeeds(p); if (!all) return '<p class="small muted">No servicing demand to compare.</p>';
    const list = sys ? all.filter(c => c.sys === sys) : all;
    if (!list.length) return `<p class="small muted">${sys === 'water' ? 'No water supply or storage constraint applies.' : (PIPE_RESULTS ? 'No sewer on its path reaches 90% of capacity by build-out and no tabled facility applies.' : `No tabled facility applies. ${PIPES_NOT_ASSESSED}.`)}</p>`;
    // An employment site has no units: room in people only (SPEC 1.9).
    const ppu = p.units > 0 ? ppuOf(p) : null, gaps = list.filter(c => c.status === 'gap').length, main = list.filter(c => c.status !== 'ok'), rest = list.filter(c => c.status === 'ok');
    const nChk = list.filter(c => c.status === 'check').length;
    return `<p class="small">${gaps ? `<strong class="dcn-gap-t">${gaps} constraint${gaps === 1 ? '' : 's'} run${gaps === 1 ? 's' : ''} out before a DC project relieves ${gaps === 1 ? 'it' : 'them'}.</strong>` : 'Every constraint has room to build-out or a DC project before it runs out.'} ${ppu ? `Room in units at this development's ${ppu.toFixed(1)} persons per unit.` : 'Room in people at Peel design criteria (an employment site: no units).'}${nChk ? ` <span class="muted">${nChk} sewer group${nChk === 1 ? '' : 's'} flagged “check the data”: the census flow alone exceeds the full-pipe capacity from the published slope, so the slope (or a parallel pipe) is more likely than a real shortfall.</span>` : ''}</p>
      ${main.length ? needsTable(main, ppu) : ''}
      ${rest.length ? `<details class="dcn-more"${main.length ? '' : ' open'}><summary class="small">${fmtNum(rest.length)} with room to build-out (tightest ${Math.max(...rest.map(c => pctCap(c, 'bo')))}% of capacity)</summary>${needsTable(rest, ppu)}</details>` : ''}
      <p class="small"><button type="button" class="btn small link" data-dcn-all="1">All DC timing →</button></p>
      <p class="small muted">Room = capacity − (existing + built + approved), in people at Peel design criteria; runs out = the year approved and proposed growth reach it (${esc(SvcTab().scenarioText())}). ${sys === 'water' ? TRUNK_NOTE : `Sewers: full-pipe capacity at peak wet (pipe screen); pumping stations: firm capacity; plants: ${Math.round(PLANT_TRIGGER * 100)}% of rated.${sys ? '' : ` ${TRUNK_NOTE}`}`} A screen, not a hydraulic model.</p>`;
  }
  // Developments relying on a constraint (growth since the census: built, approved, proposed).
  function consDevs(c) {
    const rows = [], water = c.sys === 'water';
    const members = c.kind === 'pipe' ? new Set(c.members || [c.i]) : null;
    const zones = c.devSet ? null : c.zones ? new Set(c.zones) : null;
    if (members) SC().sewerGrowth();
    for (const p of SD().svcDevs()) {
      const lay = MM().svcLayerOf(p); if (!['built', 'approved', 'proposed'].includes(lay)) continue;
      let hit = false;
      if (c.devSet) hit = c.devSet.has(p);
      else if (members) { const k = MM().SEW.growth.devPipe.get(p); if (k == null) continue; for (let i = k, hop = 0; i >= 0 && hop < 2000; i = MM().SEW.data.pipes[i][3], hop++) if (members.has(i)) { hit = true; break; } }
      else if (zones) hit = SD().svcIds(p, 'pz').some(id => zones.has(id));
      else {
        let d = SD().svcById.get(SD().svcIds(p, 'dr')[0]); const seen = new Set();
        if (c.kind === 'plant') hit = !!d && d.plant === c.pl;
        else while (d && !seen.has(d.id)) { if (d.id === c.a.id) { hit = true; break; } seen.add(d.id); d = d.downstream && SD().svcById.get(d.downstream); }
      }
      if (!hit) continue;
      const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf); if (!(e.population > 0 || e.employment.jobs > 0)) continue;
      rows.push({ p, lay, e, q: water ? e.combined.water.maxDay : e.combined.wastewater.wetPeak });
    }
    return rows.sort((a, b) => b.q - a.q);
  }
  function consDevsHTML(cs, extra = []) {
    const seen = new Map();
    for (const c of cs) for (const r of consDevs(c)) if (!seen.has(r.p.key)) seen.set(r.p.key, r);
    for (const r of extra) if (!seen.has(r.p.key)) seen.set(r.p.key, r);
    const rows = [...seen.values()].sort((a, b) => b.q - a.q), LIMIT = 60, water = cs.length && cs.every(c => c.sys === 'water');
    if (!rows.length) return '<p class="small muted">No development since the census relies on it.</p>';
    const by = k => rows.filter(r => r.lay === k);
    return `<div class="chips">${['built', 'approved', 'proposed'].map(k => `<span class="chip"><span class="lg-sw" style="--mk:${MM().layerColors()[k]}"></span>${esc(MM().LAYER_NAME[k])} ${fmtNum(by(k).length)} · ${fmtNum(roundPop(by(k).reduce((t, r) => t + r.e.population, 0)))} people</span>`).join('')}</div>
      <table class="dt loads-table"><caption>${fmtNum(rows.length)} developments relying on it, largest ${water ? 'max day' : 'peak wet weather'} first</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>${water ? 'Max day' : 'Peak wet'}</th></tr></thead>
        <tbody>${rows.slice(0, LIMIT).map(r => `<tr class="ld-row" data-dev="${esc(r.p.key)}" tabindex="0"><td>${dot(r.p.phase)} ${esc(r.p.title)}<small><span class="lg-sw" style="--mk:${MM().layerColors()[r.lay]}"></span>${esc(MM().LAYER_NAME[r.lay])} · ${esc(r.p.municipality)}${r.conn ? ' · connects to it' : ''}</small></td><td>${fmtNum(roundPop(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.q)}</td></tr>`).join('')}</tbody></table>
      ${rows.length > LIMIT ? `<p class="small muted">+ ${fmtNum(rows.length - LIMIT)} smaller developments.</p>` : ''}`;
  }
  const reg = c => { (DCN.reg || (DCN.reg = new Map())).set(c.id, c); return c; };
  // Constraints a DC main or facility relieves.
  function dcItemCons(it) {
    const out = [];
    if (it.ln) {
      const ln = it.ln, proj = ln.p || ln.c, lines = App().state.dcInfra[ln.sys].lines.filter(x => (x.p || x.c) === proj);
      if (ln.sys === 'wastewater' && MM().SEW.data) {
        const b = lines.reduce((a, x) => [Math.min(a[0], x.bbox[0]), Math.min(a[1], x.bbox[1]), Math.max(a[2], x.bbox[2]), Math.max(a[3], x.bbox[3])], [Infinity, Infinity, -Infinity, -Infinity]), pad = 0.003;
        const members = [];
        MM().SEW.data.pipes.forEach((p, i) => { const c = p[10]; if (c[0] < b[0] - pad || c[0] > b[2] + pad || c[1] < b[1] - pad || c[1] > b[3] + pad) return; const r = pipeReliefOf(i); if (r && (r.p || r.c) === proj) members.push(i); });
        if (members.length) {
          const cs = members.map(i => cached(`pipe:${i}`, () => pipeCons(i))).filter(Boolean);
          if (cs.length) { const ok = cs.filter(x => !x.check), c = (ok.length ? ok : cs).slice().sort((a, b) => b.util.bo - a.util.bo)[0]; out.push(reg({ ...c, id: `pipegrp:${proj}`, n: members.length, members, sub: `${c.sub} · tightest of ${members.length} existing pipes it runs along` })); }
        }
      }
    } else if (it.fc) {
      const fc = it.fc;
      if (fc.sys === 'wastewater' && fc.kind === 'plant' && fc.plant) { const c = cached(`plant:${fc.plant}`, () => plantCons(fc.plant)); if (c) out.push(reg(c)); }
      if (fc.sys === 'wastewater' && fc.kind === 'pumping_station') for (const a of App().state.servicing.psAreas || []) { const c = cached(`ps:${a.id}`, () => psCons(a)); if (c && c.relief.some(r => r.fc === fc)) out.push(reg(c)); }
      if (fc.sys === 'water') {
        if (fc.kind === 'plant') { const c = cached('wsys:lake', () => waterPlantCons({ zone: '1' })); if (c) out.push(reg(c)); }
        for (const z of ['AV13', 'CE9']) { const zz = App().state.servicing.zones.find(x => x.zone === z); const c = zz && cached(`wsys:${z}`, () => waterPlantCons(zz)); if (c && c.relief.some(r => r.fc === fc)) out.push(reg(c)); }
        for (const s of cached('storage', storageCons)) if (s.relief.some(r => r.fc === fc)) out.push(reg(s));
      }
    }
    for (const c of out) c.status = consStatus(c);
    return out;
  }
  // Developments that would connect to a planned main (outside the existing network, within 1 km).
  function dcConnectors(ln) {
    const proj = ln.p || ln.c, rows = [];
    for (const p of App().state.projects) {
      const lay = MM().svcLayerOf(p); if (!['built', 'approved', 'proposed'].includes(lay) || p.lat == null) continue;
      const out = ln.sys === 'wastewater' ? !(p.dr && p.dr.length) : !(p.pz && p.pz.length); if (!out) continue;
      const n = DI().dcNearest(ln.sys, [p.lng, p.lat], DI().DC_CONNECT_M); if (!n || (n.ln.p || n.ln.c) !== proj) continue;
      const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf); if (!(e.population > 0 || e.employment.jobs > 0)) continue;
      rows.push({ p, lay, e, q: ln.sys === 'water' ? e.combined.water.maxDay : e.combined.wastewater.wetPeak, conn: true });
    }
    return rows;
  }
  function dcNeedsSection(it) {
    if (!App().state.svcModel) return '';
    const cs = dcItemCons(it), conn = it.ln ? dcConnectors(it.ln) : [];
    let zoneRows = [];
    // A water facility or main with no tabled constraint: the developments in its pressure zone.
    let zoneNote = '';
    if (!cs.length && ((it.fc && it.fc.sys === 'water' && it.fc.g) || (it.ln && it.ln.sys === 'water'))) {
      const zid = it.fc ? Areas().locate(App().state.servicing.zones, it.fc.g[0], it.fc.g[1])[0] : DI().dcTarget(it.ln);
      if (zid) { const z = reg({ id: `zone:${zid}`, sys: 'water', kind: 'zone', zones: [zid] }); zoneRows = consDevs(z); zoneNote = `<p class="small muted">No published capacity to compare: developments in ${esc(SD().svcById.get(zid).name)} (${it.fc ? 'where it is' : 'the zone it serves'}).</p>`; }
    }
    const ppu = (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    return `<h3 class="sub-title" data-info="dc-needs">What it relieves</h3>
      ${cs.length ? `${needsTable(cs, ppu)}<p class="small muted">Room in units at ${ppu} persons per unit (apartment).</p>` : `<p class="small muted">${it.ln && it.ln.sys === 'wastewater' ? 'It does not run along an existing sanitary sewer of 300 mm or more (a new trunk or a local main).' : 'No tabled capacity matched to it.'}</p>`}
      ${conn.length ? `<p class="small"><strong>${fmtNum(conn.length)} development${conn.length === 1 ? '' : 's'}</strong> outside the existing network would connect to it.</p>` : ''}
      ${zoneNote}
      <h3 class="sub-title">Developments relying on it</h3>
      ${consDevsHTML(cs.filter(c => c.kind !== 'wplant' || cs.length === 1), [...conn, ...zoneRows])}`;
  }
  // Panel for a planned main (tap on the map or a relief link).
  function showDcLine(ln) {
    const proj = ln.p || ln.c, parts = App().state.dcInfra[ln.sys].lines.filter(x => (x.p || x.c) === proj);
    const len = parts.reduce((t, x) => { for (let i = 1; i < x.g.length; i++) t += DI().dcM(x.g[i - 1], x.g[i]); return t; }, 0);
    const ys = parts.map(x => x.y).filter(Boolean);
    const dcTitle = `DC ${DI().DC_KIND[ln.k][0]}${ln.d ? ` · ${ln.d} mm` : ''}`;
    const html = `
      <div class="head"><h3>${esc(DI().DC_KIND[ln.k][0])}${ln.d ? ` · ${ln.d} mm` : ''}</h3><div class="m">${ln.p ? `Project ${esc(ln.p)}` : 'No project label'} · construction ${ys.length ? (Math.min(...ys) === Math.max(...ys) ? ys[0] : `${Math.min(...ys)}–${Math.max(...ys)}`) : 'year not labelled'} · ${unit(fmtNum(Math.round(len / 10) * 10), 'm')} · ${ln.s === 'approved' ? 'approved 2026' : 'proposed'} · 2026 DC capital map (draft)</div></div>
      ${ln.n ? `<p class="small">${esc(ln.n)}</p>` : ''}
      ${dcNeedsSection({ ln })}
      `;
    TS().loadsOf = { dc: { ln } };
    TS().toolResult('dc', dcTitle, html, () => showDcLine(ln), { ref: `dcwork:${ln.sys}:${ln.p || ln.c}` });
  }
  // All constraints in the network, for the DC timing table.
  function allNeeds() {
    return cached('all', () => {
      const out = [];
      // Sewer groups only while pipe results are on: hidden results never drive DC timing or exports.
      if (PIPE_RESULTS && MM().SEW.data) {
        const flagged = [];
        MM().SEW.data.pipes.forEach((p, i) => { if (p[2] && SC().pipeFlow(i, null).q >= 0.9 * p[2]) flagged.push(i); });
        const fset = new Set(flagged), grp = new Map(), rootOf = new Map();
        // Group: same relieving project, else a run of consecutive unrelieved pipes.
        const relief = i => { const r = pipeReliefOf(i); return r ? `ln:${r.p || r.c}` : null; };
        const find = i => { let r = i; while (rootOf.has(r) && rootOf.get(r) !== r) r = rootOf.get(r); return r; };
        for (const i of flagged) { rootOf.set(i, i); }
        for (const i of flagged) { const n = MM().SEW.data.pipes[i][3]; if (fset.has(n) && !relief(i) && !relief(n)) rootOf.set(find(i), find(n)); }
        for (const i of flagged) { const k = relief(i) || `run:${find(i)}`; (grp.get(k) || grp.set(k, []).get(k)).push(i); }
        for (const [k, members] of grp) {
          const cs = members.map(i => cached(`pipe:${i}`, () => pipeCons(i))).filter(Boolean); if (!cs.length) continue;
          const ok = cs.filter(x => !x.check), c = (ok.length ? ok : cs).slice().sort((a, b) => a.people - b.people)[0];
          out.push(reg({ ...c, id: `grp:${k}`, n: members.length, members }));
        }
      }
      for (const a of App().state.servicing.psAreas || []) { const c = cached(`ps:${a.id}`, () => psCons(a)); if (c) out.push(reg(c)); }
      for (const pl of ['Lakeview', 'Clarkson', 'Inglewood']) { const c = cached(`plant:${pl}`, () => plantCons(pl)); if (c) out.push(reg(c)); }
      for (const pl of Object.keys(BOD_PLANT)) { const c = cached(`bod:${pl}`, () => bodCons(pl)); if (c) out.push(reg(c)); }
      { const c = cached('wsys:lake', () => waterPlantCons({ zone: '1' })); if (c) out.push(reg(c)); }
      for (const z of ['AV13', 'CE9']) { const zz = App().state.servicing.zones.find(x => x.zone === z); const c = zz && cached(`wsys:${z}`, () => waterPlantCons(zz)); if (c) out.push(reg(c)); }
      for (const s of cached('storage', storageCons)) out.push(reg(s));
      for (const t of mpTrunks()) { const c = cached(`trunk:${t.id}`, () => trunkCons(t)); if (c) out.push(reg(c)); }
      for (const c of out) c.status = consStatus(c);
      const order = { gap: 0, planned: 1, check: 2, ok: 3 }, yr = c => c.out === 'today' ? 0 : c.out || 9999;
      return out.sort((a, b) => order[a.status] - order[b.status] || yr(a) - yr(b) || a.people - b.people);
    });
  }
  let dcnFilter = 'gap';
  function showDcTiming() {
    if (!App().state.svcModel) return;
    const all = allNeeds(), ppu = (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    const sysF = dcnFilter.split(':')[1] || 'all', stF = dcnFilter.split(':')[0];
    const list = all.filter(c => (stF === 'all' || c.status === stF) && (sysF === 'all' || c.sys === sysF));
    const n = k => all.filter(c => c.status === k).length;
    const html = `
      <div class="head"><h3 data-info="dc-needs">DC timing</h3><div class="m">Existing capacity against the 2026 DC capital program (draft) · ${esc(SvcTab().scenarioText())}</div></div>
      <div class="chips">${[['gap', `Screens late ${n('gap')}`], ['planned', `DC project in time ${n('planned')}`], ['check', `Check the data ${n('check')}`], ['ok', `Room to build-out ${n('ok')}`], ['all', `All ${all.length}`]].map(([k, t]) => `<button type="button" class="chip btn small${stF === k ? ' on' : ''}" data-dcn-filter="${k}:${sysF}">${esc(t)}</button>`).join('')}
        <span class="seg">${[['all', 'Both'], ['ww', 'Wastewater'], ['water', 'Water']].map(([k, t]) => `<button type="button" class="btn small${sysF === k ? ' on' : ''}" data-dcn-filter="${stF}:${k}">${t}</button>`).join('')}</span></div>
      ${list.length ? needsTable(list.slice(0, 150), ppu) : '<p class="small muted">Nothing in this group.</p>'}
      ${list.length > 150 ? `<p class="small muted">+ ${fmtNum(list.length - 150)} more.</p>` : ''}
      <p class="small"><span class="muted">Tap a name for what loads it; tap a DC project for what it relieves and who relies on it.</span></p>
      <p class="small muted">Sewers: pipes reaching 90% of full capacity by build-out, grouped by the DC main that runs along them (or by run); the tightest pipe of each group is shown. Room in units at ${ppu} persons per unit (apartment). Room = capacity − (existing + built + approved); runs out = the year approved and proposed growth reach it, phased as in Horizon years. Plants at ${Math.round(PLANT_TRIGGER * 100)}% of rated; pumping stations at firm capacity; storage from the 2020 Master Plan forecast; water supply into the upper zones is a rough conveyance estimate (1.5 m/s in the large mains crossing each zone boundary; water pumping station capacities are not published). A screen, not a hydraulic model.</p>`;
    TS().loadsOf = { dc: { timing: true } };
    TS().toolResult('dc', 'DC timing', html, showDcTiming, { filter: false });
  }
  function showConsDevs(c) {
    const ppu = (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    const html = `<div class="head"><h3>${esc(c.name)}</h3><div class="m">${esc(c.sub)}</div></div>
      ${needsTable([c], ppu)}${c.note ? `<p class="small muted">${esc(c.note)}</p>` : ''}
      <h3 class="sub-title">Developments relying on it</h3>${consDevsHTML([c])}
      <p class="small"><button type="button" class="btn small link" data-dcn-all="1">← DC timing</button></p>`;
    TS().loadsOf = { dc: { cons: c.id } };
    TS().toolResult('dc', c.name, html, () => showConsDevs(c));
  }
  function showDcBack(b) { if (b.ln) showDcLine(b.ln); else if (b.fc) DI().showFacility(b.fc); else if (b.cons && DCN.reg && DCN.reg.get(b.cons)) showConsDevs(DCN.reg.get(b.cons)); else showDcTiming(); }

  // ---- DC Analysis (bottom panel tab): divert flows to each DC project when it comes online, and
  // what happens if it is cancelled ---------------------------------------------------------------
  // Each capacity constraint (sewer group, pumping station, plant, water supply) has its demand by
  // year (approved and proposed growth phased as in Horizon years). From a DC project's in-service
  // year the flow above the existing capacity is diverted to it, up to the capacity it adds: a main
  // along an existing sewer adds Manning full-pipe capacity at its diameter on the existing slope; a
  // plant expansion adds its published step (at the 90% trigger); a facility with no published
  // capacity is taken as sized for build-out. Cancelling a project removes what it adds; the growth
  // that no longer fits is held back (people at Peel design criteria, units at the growth's persons
  // per unit). Developments outside the existing network that would connect to a new main are held
  // back entirely without it.
  const DCA = { key: '', res: null, open: new Set(), sort: 'impact', recFilter: 'all', recAll: false, timingAll: false, fundAll: false };
  const manningLs = (dMm, S) => { const d = dMm / 1000; return S > 0 ? 1000 * (1 / 0.013) * (Math.PI * d * d / 4) * Math.pow(d / 4, 2 / 3) * Math.sqrt(S) : 0; };
  const reliefKey = r => r.ln ? `ln:${r.ln.sys}:${r.ln.p || r.ln.c}` : r.kind === 'step' ? `step:${r.step.proj || r.y}` : r.kind === 'mp' && r.main ? `mp:${r.main.name}` : r.kind === 'mpu' && r.up ? `mpu:${r.up.id}` : r.fc ? `fc:${r.fc.sys}:${r.fc.name}` : null;
  // Capacity a relief adds to a constraint (same unit as its demand), and whether it is assumed.
  function reliefAdd(c, r) {
    if (c.kind === 'pipe' && r.ln) {
      const p = MM().SEW.data.pipes[c.i], d = r.ln.d || p[0];
      return { add: manningLs(d, p[1]), assumed: !r.ln.d, how: `${d} mm${r.ln.d ? '' : ' (size not on the map: taken as a twin)'} on the existing ${(p[1] * 100).toFixed(2)}% slope` };
    }
    if (r.kind === 'mp' && r.main) return { add: r.main.actualMLd, assumed: false, how: `${r.main.diameterMm} mm, actual capacity from the 2020 Master Plan` };
    return { add: Math.max(0, c.q(null) - c.cap) * 1.0001 + 1e-9, assumed: true, how: 'capacity not published: taken as sized for build-out' };
  }
  // Capacity of a constraint in year y with the given reliefs (keys in `off` cancelled).
  function capWith(c, y, off) {
    const yy = y == null ? SP().hz.end : y;
    if (c.kind === 'plant') {
      let r = c.rated; for (const rl of c.relief) if (rl.step && !off.has(reliefKey(rl)) && yy >= rl.step.year) r = Math.max(r, rl.step.mld);
      return PLANT_TRIGGER * r;
    }
    let cap = c.cap;
    for (const rl of c.relief) if (rl.y && yy >= rl.y && !off.has(reliefKey(rl))) cap += reliefAdd(c, rl).add;
    return cap;
  }
  // Flow per added person (the constraint's own rate, from its room in people).
  const ratePP = c => { const m = c.room / c.people; return isFinite(m) && m > 0 ? m : null; };
  // Growth people held back in year y: demand above the capacity (and above today's flow, so an
  // existing overload isn't counted as growth held back).
  function heldPeople(c, y, off) {
    const m = ratePP(c); if (!m) return 0;
    const qy = c.q(y), base = Math.max(capWith(c, y, off), c.q('today'));
    return Math.max(0, qy - base) / m;
  }
  // People held back at a demand level ('committed', or null = build-out) against the capacity at
  // build-out with every project as scheduled: the Committed part of growth waiting on works (SPEC §2.6).
  function heldAtLevel(c, level, off) {
    const m = ratePP(c); if (!m) return 0;
    return Math.max(0, c.q(level) - Math.max(capWith(c, null, off), c.q('today'))) / m;
  }
  function growthPpu() {
    let pop = 0, units = 0;
    for (const p of App().state.projects) { const lay = MM().svcLayerOf(p); if (lay !== 'approved' && lay !== 'proposed') continue; const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf); if (e.totalUnits > 0) { pop += e.population; units += e.totalUnits; } }
    return units > 0 ? pop / units : (App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
  }

  const api = {
    DCN,
    PLANT_TRIGGER,
    PP_HA,
    loadWaterSupply,
    loadMpWater,
    trunkCons,
    bodCons,
    divInfo,
    trunkNeeds,
    mpTrunks,
    zLevel,
    renderMpCompare,
    mpRowHTML, mpHead, mpLegend,
    waterFacilitiesHTML,
    hydroBoxHTML,
    wellSystem,
    yearsAhead,
    runOut,
    peopleFor,
    pipeCons,
    psCons,
    plantCons,
    waterPlantCons,
    storageCons,
    supplyCons,
    getSewUpgKey: () => sewUpgKey,
    setSewUpgKey: v => { sewUpgKey = v; },
    scenarioKey,
    cached,
    devNeeds,
    dcNeedsHTML,
    showDcLine,
    allNeeds,
    getDcnFilter: () => dcnFilter,
    setDcnFilter: v => { dcnFilter = v; },
    get dcnFilter() { return dcnFilter; },
    set dcnFilter(v) { dcnFilter = v; },
    showDcTiming,
    showConsDevs,
    consStatus,
    showDcBack,
    DCA,
    MP2020,
    lakeZones,
    ppuOf,
    dcNeedsSection,
    pipeReliefOf,
    dcItemCons,
    reliefAdd,
    capWith,
    heldPeople, heldAtLevel,
    growthPpu,
    reliefKey,
    lineRelief,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMasterPlan = api;
})(typeof window !== 'undefined' ? window : globalThis);
