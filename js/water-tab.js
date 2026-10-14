(function (root) {
  'use strict';
  const { $, esc, fmtNum, fmt1, unit, uML, uLs, uPop } = window.PeelUtil;
  const D = window.PeelDemand;
  const App = () => window.PeelApp;
  const WT = () => window.PeelWaterTrace;
  const MP = () => window.PeelMasterPlan;
  const SP = () => window.PeelSvcPlants;
  const SD = () => window.PeelSvcData;
  const SvcTab = () => window.PeelSvcTab;

  // ---- Water tab: Zones sub-view blocks (Phase 4) -------------------------------------------
  // Headline (via setHeadline) → tiles → chart → top-N table with "See all" → ⓘ line.
  // x carries the fresh renderSvcTab closures (wMax etc.) so the blocks use current numbers.
  function waterZonesHTML(zr, zsum, x) {
    const { wMax, wPH, total, jobs, wRow, layerHead, Y, c, E, mdR, mdE, observed, censusHowW } = x;
    const bo = r => wMax(total(r.l), jobs(r.l));
    const sorted = zr.map(r => ({ r, bo: bo(r) })).sort((a, b) => b.bo - a.bo);
    const boTot = wMax(total(zsum), jobs(zsum)), phTot = wPH(total(zsum), jobs(zsum));
    const growth = wMax(zsum.approved + zsum.proposed, (zsum.japproved || 0) + (zsum.jproposed || 0));
    const tiles = `<div class="ov-tiles">${wTile(fmt1(boTot), 'ML/d', 'maximum day at build-out', 'all pressure zones')}`
      + `${wTile(fmt1(phTot), 'ML/d', 'peak hour at build-out')}`
      + `${wTile(`+${fmt1(growth)}`, 'ML/d', 'approved + proposed', 'maximum day growth')}`
      + `${sorted[0] ? wTile(esc(sorted[0].r.a.name.replace('Pressure zone ', 'Zone ')), '', 'adds the most demand', `+${fmt1(Math.max(0, sorted[0].bo - wMax(sorted[0].r.l.census, 0)))} ML/d max day`) : ''}</div>`;
    const top10 = sorted.slice(0, 10), mx = Math.max(...top10.map(t => t.bo), 1e-9);
    const chart = `<div data-info="pressure-zone" role="img" aria-label="Maximum day demand by pressure zone at build-out">`
      + top10.map(t => `<div style="display:flex;align-items:center;gap:8px;margin:3px 0"><span class="small" style="width:92px;flex:none">${esc(t.r.a.name.replace('Pressure zone ', 'Zone '))}</span><span style="flex:1;background:var(--surface-2);border-radius:4px;height:14px"><i style="display:block;height:100%;width:${(t.bo / mx * 100).toFixed(1)}%;background:var(--accent);border-radius:4px"></i></span><span class="small" style="width:84px;flex:none;text-align:right">${fmt1(t.bo)} ML/d</span></div>`).join('') + `</div>`;
    const head = `<thead><tr><th>Pressure zone</th><th class="bar-h">Build-out mix</th><th>Developments</th>${layerHead}<th>Peak hour<br>build-out</th></tr></thead>`;
    const cap = n => `Water by pressure zone · maximum day (ML/d) at ${observed ? `the observed 2025 factor ×${mdR.toFixed(2)}` : `design ×${mdR} residential, ×${mdE} employment`}; people and jobs below${n ? ` · top ${n} of ${sorted.length}` : ''}`;
    const table = (list, n, totals) => `<div class="hyd-scroll"><table class="dt svc-table" data-info="pressure-zone"><caption>${cap(n)}</caption>${head}<tbody>${list.map(t => wRow(esc(t.r.a.name.replace('Pressure zone ', 'Zone ')), t.r.l, t.r.a.id)).join('')}${totals ? wRow('All pressure zones', zsum, null, 'tot') : ''}</tbody></table></div>`;
    const top8 = sorted.slice(0, 8), rest = sorted.slice(8);
    return `${tiles}${chart}${table(top8, 8, true)}`
      + `${rest.length ? `<details class="dcn-more"><summary class="small">See all ${sorted.length} zones</summary>${table(rest, 0, false)}</details>` : ''}`
      + `<p class="small muted">ⓘ ML/d = megalitres per day. Residential ${c.water.avg} L/cap/d and employment ${E.water} L/emp/d (jobs on development sites; existing employment is not in the census baseline); maximum day ×${mdR} residential, ×${mdE} employment; peak hour ×${c.water.peakHour} residential, ×${E.peakHour} employment. ${Y} Census ${censusHowW}; growth from every development located in the zone (other filters ignored), as in the Growth tab.${zsum.near ? ` ${fmtNum(zsum.near)} developments outside every zone are counted in the nearest one.` : ''}</p>`;
  }
  // ---- Water room left & trigger years (Phase 4, Capacity sub-view) ---------------------------
  // Pure computations (tests/water-room.test.js extracts them from source): room left at
  // build-out and the years demand reaches 80 / 90 / 100% of capacity, matching the plant
  // horizon table's "Reaches 80% / 90% / 100%" columns. Approved growth ramps in evenly from
  // aStart over aYears, proposed from pStart over pYears — the same phasing as the plant
  // horizon. Each crossing is 'today' when already reached at year0, a year, or null.
  const roomTrigger = (cap, demand, ph) => {
    const fr = (y, s, n) => Math.min(1, Math.max(0, (y - s + 1) / Math.max(1, n)));
    const at = y => demand.today + demand.approved * fr(y, ph.aStart, ph.aYears) + demand.proposed * fr(y, ph.pStart, ph.pYears);
    const cross = f => {
      if (!(cap > 0)) return null;
      if (at(ph.year0) >= cap * f) return 'today';
      for (let y = ph.year0 + 1; y <= ph.end; y++) if (at(y) >= cap * f) return y;
      return null;
    };
    const bo = at(ph.end), room = cap - bo;
    return { room, roomPct: cap > 0 ? room / cap * 100 : null, c80: cross(0.8), c90: cross(0.9), c100: cross(1) };
  };
  // Storage: the Master Plan's required-vs-available series by year. Room left at the last
  // year; the crossing years linearly interpolate when required reaches 80 / 90 / 100% of
  // the available storage.
  const storageRoomTrigger = (years, required, available) => {
    const n = years.length, avail = available[n - 1];
    const cross = f => {
      const lim = avail * f;
      if (avail > 0 && required[0] >= lim) return 'today';
      for (let i = 1; i < n; i++) {
        if (required[i] >= lim && required[i - 1] < lim) {
          const t = (lim - required[i - 1]) / ((required[i] - required[i - 1]) || 1);
          return Math.round(years[i - 1] + t * (years[i] - years[i - 1]));
        }
      }
      return null;
    };
    const room = avail - required[n - 1];
    return { room, roomPct: avail > 0 ? room / avail * 100 : null, c80: cross(0.8), c90: cross(0.9), c100: cross(1) };
  };
  // A small tile (the Overview's .ov-tile pattern).
  const wTile = (v, u, l, sub = '') => `<div class="ov-tile"><b>${v}</b><span class="ov-u">${u}</span><span class="ov-l">${l}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
  // Year cell for the room/trigger table: 'today' → now, null → after the horizon end.
  const trigCell = (y, end) => y === 'today' ? 'now' : y == null ? `after ${end}` : String(y);
  // Per-project demand flow tables (Water + Wastewater, L/s). Re-created here: the original
  // at ~1910 is removed in Phase 4 (Worker C) and the Growth tab + selection breakdown call
  // sites keep working through this copy.
  function flowTablesHTML(e) {
    const c = App().state.criteria, em = e.employment, cb = e.combined, n = uLs;
    const flowTable = (title, info, cols, rows) => `<table class="dt flow" data-info="${info}">
      <caption>${title} <span class="muted">L/s</span></caption>
      <thead><tr><th></th>${cols.map(x => `<th>${x}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(([label, cls, info2, vals]) => `<tr class="${cls}"${info2 ? ` data-info="${info2}"` : ''}><td>${label}</td>${vals.map(v => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
    const iiNote = `${fmtNum(Math.round(e.area.ha + em.area.ha))} ha × ${c.wastewater.infiltration} L/s/ha${e.area.estimatedHa > 0 ? ` · ${Math.round(e.area.estimatedHa / Math.max(e.area.ha, 1e-9) * 100)}% of residential area estimated` : ''}`;
    return '<div class="flow-card">' + flowTable('Water', 'demand-water', ['Avg day', 'Max day', 'Peak hour'], [
        ['Residential', '', 'demand-water', [n(e.water.avg), n(e.water.maxDay), n(e.water.peakHour)]],
        ['Employment', '', 'demand-employment', [n(em.water.avg), n(em.water.maxDay), n(em.water.peakHour)]],
        ['Total', 'tot', 'demand-combined', [n(cb.water.avg), n(cb.water.maxDay), n(cb.water.peakHour)]],
      ]) + `<p class="small muted flow-note">${fmt1(D.toMLd(cb.water.avg))} ML/d average · residential ${c.water.avg} L/cap/d ×${c.water.maxDay} / ×${c.water.peakHour}; employment ${c.employment.water} L/emp/d ×${c.employment.maxDay} / ×${c.employment.peakHour}</p></div>`
      + '<div class="flow-card">' + flowTable('Wastewater', 'demand-wastewater', ['Avg dry', 'Peak dry', 'I&amp;I', 'Peak wet'], [
        ['Residential', '', 'demand-wastewater', [n(e.water.avg), `${n(e.wastewater.peak)}<span class="muted m"> M ${e.population > 0 ? e.wastewater.peakingFactor.toFixed(2) : '–'}</span>`, n(e.wastewater.infiltration), n(e.wastewater.wetPeak)]],
        ['Employment', '', 'demand-employment', [n(em.water.avg), `${n(em.wastewater.peak)}<span class="muted m"> M ${em.jobs > 0 ? em.wastewater.peakingFactor.toFixed(2) : '–'}</span>`, n(em.wastewater.infiltration), n(em.wastewater.wetPeak)]],
        ['Total', 'tot', 'demand-combined', [n(cb.wastewater.avg), n(cb.wastewater.peak), n(cb.wastewater.infiltration), n(cb.wastewater.wetPeak)]],
      ]) + `<p class="small muted flow-note">${fmt1(D.toMLd(cb.wastewater.avg))} ML/d average · I&amp;I on ${iiNote}</p></div>`;
  }
  // Demand flows in the Capacity sub-view (Phase 4): system-wide average day, maximum day
  // and peak hour at build-out, residential + employment, with the criteria factors inline
  // (persons per unit by type, × max day, × peak hour).
  function waterDemandFlowsHTML(M) {
    const R = App().state.reports; if (!M || !R) return '';
    const c = App().state.criteria, E = c.employment, sp = R.water.southPeel, ppu = c.ppu || {};
    let pop = 0, jobs = 0;
    for (const [, l] of M.zones) { pop += M.total(l); jobs += M.jobs(l); }
    const row = (label, p, j, cls = '') => `<tr class="${cls}"><td>${label}</td><td>${uML(M.wAvg(p, j))}</td><td>${uML(M.wMax(p, j))}</td><td class="bo">${uML(M.wPH(p, j))}</td></tr>`;
    const mdTxt = v => `×${(+v).toFixed(2).replace(/\.?0+$/, '')}`;
    const mdR = SvcTab().svcOpt.md === 'observed' && sp ? sp.maxDayFactor : c.water.maxDay;
    const mdE = SvcTab().svcOpt.md === 'observed' && sp ? sp.maxDayFactor : E.maxDay;
    return `<h3 class="svc-sub">Demand flows <span class="muted small">build-out, ML/d · all pressure zones</span></h3>
      <div class="hyd-scroll"><table class="dt svc-table" data-info="water-capacity"><thead><tr><th></th><th>Average day</th><th>Maximum day</th><th>Peak hour</th></tr></thead>
      <tbody>${row('Residential', pop, 0)}${row('Employment', 0, jobs)}${row('Total', pop, jobs, 'tot')}</tbody></table></div>
      <p class="small muted">${fmt1(M.wAvg(pop, jobs))} ML/d average · residential ${c.water.avg} L/cap/d (${['single', 'town', 'apartment'].map(t => `${t} ${ppu[t]}`).join(' · ')} persons per unit) ${mdTxt(mdR)} maximum day / ${mdTxt(c.water.peakHour)} peak hour; employment ${E.water} L/emp/d ${mdTxt(mdE)} / ${mdTxt(E.peakHour)}.</p>`;
  }
  // Room left and trigger years for each zone (pumping) and storage facility, in the plant
  // horizon table's shape: room left at build-out, then the years demand reaches 80 / 90 /
  // 100% of firm pumping capacity (zones) or of available storage (facilities). Top 5
  // tightest shown, the rest under "See all".
  function waterRoomTriggerHTML(pump, ph) {
    const R = App().state.reports, mp = R && R.masterPlan;
    const stor = mp && mp.storage ? mp.storage : [], storYears = mp && mp.storageYears ? mp.storageYears : [];
    const rows = pump.map(r => {
      const rt = roomTrigger(r.rated, { today: r.v[0] + r.v[1], approved: r.v[2], proposed: r.v[3] }, ph);
      return { name: r.name, sub: `firm ${uML(r.rated)}`, room: rt.room, roomPct: rt.roomPct, unit: 'ML/d', rt, end: ph.end };
    });
    for (const s of stor) {
      const rt = storageRoomTrigger(storYears, s.required, s.available), av = s.available[s.available.length - 1];
      rows.push({ name: esc(s.facility), sub: `${fmtNum(av)} ML available · 2020 Master Plan`, room: rt.room, roomPct: rt.roomPct, unit: 'ML', rt, end: storYears[storYears.length - 1] });
    }
    rows.sort((a, b) => (a.roomPct == null ? 1e9 : a.roomPct) - (b.roomPct == null ? 1e9 : b.roomPct));
    const tr = x => `<tr><td>${x.name}<small>${x.sub}</small></td>`
      + `<td class="n${x.room < 0 ? ' over' : ''}">${x.room < 0 ? '−' : ''}${fmt1(Math.abs(x.room))} ${x.unit}<small>${x.roomPct == null ? '' : `${Math.round(x.roomPct)}% left`}</small></td>`
      + `<td class="n">${trigCell(x.rt.c80, x.end)}</td><td class="n">${trigCell(x.rt.c90, x.end)}</td><td class="n bo">${trigCell(x.rt.c100, x.end)}</td></tr>`;
    const head = `<thead><tr><th>Zone / storage facility</th><th class="n">Room left<br>at build-out</th><th class="n">Reaches<br>80%</th><th class="n">Reaches<br>90%</th><th class="n">Reaches<br>100%</th></tr></thead>`;
    const table = list => `<div class="hyd-scroll"><table class="dt svc-table" data-info="water-capacity">${head}<tbody>${list.map(tr).join('')}</tbody></table></div>`;
    const top = rows.slice(0, 5), rest = rows.slice(5);
    return `<h3 class="svc-sub">Room left &amp; trigger years <span class="muted small">zones: % of firm pumping capacity · storage: Master Plan required vs available</span></h3>`
      + table(top)
      + (rest.length ? `<details class="dcn-more"><summary class="small">See all ${rows.length} zones &amp; storage facilities</summary>${table(rest)}</details>` : '')
      + `<p class="small muted">Room = capacity − demand at build-out. Trigger years phase approved growth in from ${ph.aStart} over ${ph.aYears} years and proposed from ${ph.pStart} over ${ph.pYears} years, as in the plant Horizon years; storage years interpolate the Master Plan forecast.</p>`;
  }
  // ---- 2025 production & Caledon groundwater: moved out of the Water tab (Phase 4) --------
  // These two sections used to render inside the Water tab's Capacity sub-view
  // (waterReportsHTML). They now live on the Sources & checks page (Settings & sources tab),
  // rendered by Worker G through window.ModelChecks.
  function waterModelToday() {
    const M = App().state.svcModel; if (!M) return null;
    let pop = 0, jobs = 0;
    for (const [, l] of M.zones) { pop += (l.census || 0) + (l.built || 0); jobs += (l.jbuilt || 0); }
    return { avg: M.wAvg(pop, jobs), max: M.wMax(pop, jobs) };
  }
  function waterProductionHTML(R, modelAvg, modelMax) {
    const sp = R.water.southPeel, cal = R.water.caledon, pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const calAvg = cal.reduce((t, s) => t + s.avgM3d, 0) / 1000;
    return `<h3 class="svc-sub">Reported 2025 production <span class="muted small">Region of Peel annual reports</span></h3>
      <table class="dt svc-table rep-table" data-info="water-reports"><thead><tr><th>Treatment plant</th><th>Rated capacity</th><th>2025 average day</th><th>2025 maximum day</th><th>Max day ÷ average</th></tr></thead>
      <tbody>${sp.plants.map(p => `<tr><td>${esc(p.name)}<small>${SvcTab().refLink(p.ref, p.pages)}</small></td><td>${uML(p.ratedMLd)}</td><td>${uML(p.avgMLd)}<small>${pct(p.avgMLd, p.ratedMLd)} of capacity</small></td><td>${uML(p.maxDayMLd)}<small>${esc(p.maxDayMonth)} · ${pct(p.maxDayMLd, p.ratedMLd)}</small></td><td>×${(p.maxDayMLd / p.avgMLd).toFixed(2)}</td></tr>`).join('')}
        <tr class="sub"><td>South Peel system (lake-based)<small>${esc(sp.maxDayNote)}</small></td><td>${uML(sp.plants.reduce((t, p) => t + p.ratedMLd, 0))}</td><td>${uML(sp.avgMLd)}</td><td>≤ ${uML(sp.maxDayMLd)}</td><td>×${sp.maxDayFactor.toFixed(2)}</td></tr>
        <tr><td>Caledon groundwater systems (5)</td><td></td><td>${uML(calAvg)}</td><td></td><td></td></tr>
        <tr class="tot"><td>Model today, all pressure zones<small>census + built since; residential + development jobs</small></td><td></td><td>${uML(modelAvg)}<small>${pct(modelAvg, sp.avgMLd + calAvg)} of reported</small></td><td>${uML(modelMax)}<small>${SvcTab().svcOpt.md === 'observed' ? 'observed factor' : 'design factor'}</small></td><td></td></tr></tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Reported production includes water supplied to York Region and Halton, all industrial, commercial and institutional use and non-revenue water; transfer volumes to York are not published, so the model (residential + new development jobs) is expected to be lower. Population served in 2025: ${fmtNum(sp.populationServed)} (${esc(sp.populationNote)}). ${SvcTab().refLink(sp.ref, sp.pages)}.</p></details>`;
  }
  function caledonGroundwaterHTML(R) {
    const cal = R.water.caledon, pct = (a, b) => b > 0 ? `${Math.round(a / b * 100)}%` : '–';
    const m3 = v => unit(fmtNum(Math.round(v)), 'm³/d');
    return `<h3 class="svc-sub">Caledon groundwater systems <span class="muted small">2025</span></h3>
      <table class="dt svc-table rep-table" data-info="water-reports"><thead><tr><th>System</th><th>Population served</th><th>Rated capacity</th><th>2025 average day</th><th>2025 maximum day</th><th>Per person</th><th>Max day ÷ average</th></tr></thead>
      <tbody>${cal.map(s => `<tr><td>${esc(s.name)}<small>${esc(s.communities)}</small></td><td>${uPop(s.population)}<small>${unit(fmtNum(s.connections), 'connections')}</small></td><td>${m3(s.ratedM3d)}</td><td>${m3(s.avgM3d)}<small>${pct(s.avgM3d, s.ratedM3d)} of capacity</small></td><td>${m3(s.maxDayM3d)}<small>${esc(s.maxDayNote)} · ${pct(s.maxDayM3d, s.ratedM3d)}</small></td><td>${unit(fmtNum(Math.round(s.avgM3d * 1000 / s.population)), 'L/cap/d')}</td><td>×${(s.maxDayM3d / s.avgM3d).toFixed(2)}</td></tr>`).join('')}</tbody></table>
      <details class="svc-notes"><summary>Method &amp; notes</summary><p class="small muted">Treated water. Populations are as stated in each system's report ("close to", "just over"); rated capacity is the wells' combined rated capacity. Sources: ${cal.map(s => SvcTab().refLink(s.ref, s.pages)).join('; ')}.</p></details>`;
  }
  window.ModelChecks = window.ModelChecks || {};
  ModelChecks.waterProduction = () => {
    const R = App().state.reports; if (!R) return '';
    const t = waterModelToday();
    return waterProductionHTML(R, t ? t.avg : null, t ? t.max : null);
  };
  ModelChecks.caledonGroundwater = () => {
    const R = App().state.reports; if (!R) return '';
    return caledonGroundwaterHTML(R);
  };
  function waterCapHTML(M) {
    M = M || App().state.svcModel;
    const R = App().state.reports; if (!M || !R || !App().state.servicing) return '';
    if (!WT().WF.data) { WT().loadWaterFacilities().then(d => { if (d) { const b = $('#wcap-box'); if (b) b.outerHTML = waterCapHTML(); } }); return '<div id="wcap-box"></div>'; }
    const Y = M.Y, sp = R.water.southPeel, lake = MP().lakeZones().filter(id => MP().zLevel(SD().svcById.get(id).zone) <= 7);
    const treat = [WT().waterCapRow(M, 'South Peel (A.P. Kennedy + Lorne Park)', MP().lakeZones(), sp.plants.reduce((t, p) => t + p.ratedMLd, 0), sp.maxDayMLd, `2025 maximum day ${fmt1(sp.maxDayMLd)} ML/d incl. York supply`)];
    for (const z of App().state.servicing.zones) { const s = MP().wellSystem[z.zone] && R.water.caledon.find(x => x.name === MP().wellSystem[z.zone]); if (s) treat.push(WT().waterCapRow(M, `${s.name} wells`, [z.id], s.ratedM3d / 1000, s.maxDayM3d / 1000, `2025 maximum day ${fmt1(s.maxDayM3d / 1000)} ML/d`)); }
    const pumps = WT().wfPumps();
    const pump = [];
    for (let n = 1; n <= 7; n++) {
      const into = pumps.filter(p => p.src < n && p.tgt >= n), ids = lake.filter(id => MP().zLevel(SD().svcById.get(id).zone) >= n);
      const cap = into.reduce((t, p) => t + p.cap, 0); if (!cap || !ids.length) continue;
      const r = WT().waterCapRow(M, n === 1 ? 'From the plants (zone 1 and above)' : `Into zone ${n} and above`, ids, cap, null, `${into.length} pump group${into.length === 1 ? '' : 's'}: ${into.map(p => p.label).join(', ')}`, 'firm');
      if (r) pump.push(r);
    }
    const boPct = r => r.v.reduce((a, b) => a + b, 0) / r.rated * 100;
    const tight = [...treat, ...pump].filter(Boolean).map(r => ({ r, c: (r.v[0] + r.v[1] + r.v[2]) / r.rated, b: boPct(r) / 100 })).sort((a, b) => b.b - a.b)[0];
    const tightPump = pump.map(r => ({ r, b: boPct(r) })).sort((a, b) => b.b - a.b)[0];
    const mp = R.masterPlan, stor = mp && mp.storage ? mp.storage : [];
    const shortMl = stor.reduce((t, s) => t + Math.max(0, s.required[s.required.length - 1] - s.available[s.available.length - 1]), 0);
    let dPop = 0, dJobs = 0;
    for (const [, l] of M.zones) { dPop += M.total(l); dJobs += M.jobs(l); }
    const ph = { year0: SP().hz.year0, aStart: SP().hz.aStart, aYears: SP().hz.aYears, pStart: SP().hz.pStart, pYears: SP().hz.pYears, end: SP().hz.end };
    const c = App().state.criteria;
    return `<section id="wcap-box" class="wcap" data-info="water-capacity">
      <div class="ov-tiles">${wTile(`${Math.round(boPct(treat[0]))}%`, 'of rated', 'South Peel treatment at build-out', `rated ${fmtNum(treat[0].rated)} ML/d`)}${tightPump ? wTile(`${Math.round(tightPump.b)}%`, 'of firm capacity', 'Tightest pumping at build-out', tightPump.r.name) : ''}${wTile(fmt1(M.wMax(dPop, dJobs)), 'ML/d', 'maximum day demand at build-out', 'all pressure zones')}${wTile(shortMl > 0 ? fmtNum(Math.round(shortMl)) : '0', 'ML', 'storage short by 2041', 'Master Plan assessment')}</div>
      ${waterDemandFlowsHTML(M)}
      <h3 class="svc-sub">Water capacity by growth layer</h3>
      ${tight ? `<p class="small">Tightest: <strong>${tight.r.name}</strong>, ${Math.round(tight.c * 100)}% of its ${tight.r.capWord || 'rated'} capacity with existing + built + approved, ${Math.round(tight.b * 100)}% at build-out.</p>` : ''}
      ${SP().capChartHTML(treat.filter(Boolean), Y, { title: 'Treatment', sub: 'maximum day as a % of rated capacity · 2025 measured, plus growth at Peel criteria (as in the Overview)', baseLabel: `Existing (${Y} Census; treatment scaled to the 2025 measured maximum day)`, capLegend: 'Capacity: rated (treatment) or firm (pumping)', noPop100: true, legend: true })}
      <details class="wcap-pump" open><summary class="svc-sub">Pumping into each pressure zone <span class="muted small">design maximum day as a % of firm pumping capacity</span></summary>
      ${SP().capChartHTML(pump, Y, { title: ' ', noPop100: true, noPeople: true, legend: false })}
      <p class="small muted">Each zone's total pools the west, central and east stations; a single station can still run short (the 2020 Master Plan flags West Brampton's zone 5 and 6 pumps and the Beckett Sproule transfer by 2041: see Facilities).</p></details>
      ${waterRoomTriggerHTML(pump, ph)}
      <p class="small muted">ⓘ Treatment: rated capacity (2025 drinking water reports); existing = the 2025 measured maximum day (South Peel's includes the water supplied to York Region). Pumping: firm capacity, largest pump out of service (the Region's modelled actual firm where the 2020 Master Plan gives it). Demand at Peel design maximum day (${c.water.avg} L/cap/d ×${c.water.maxDay}, employment ${c.employment.water} L/emp/d). Storage: required vs available (2020 Master Plan, Vol. 3, Table 12).</p></section>`;
  }
  // Water tab: the facilities by system, with capacity.

  const api = {
    waterZonesHTML,
    waterCapHTML,
    flowTablesHTML,
    waterDemandFlowsHTML,
    waterRoomTriggerHTML,
    waterProductionHTML,
    caledonGroundwaterHTML,
    wTile,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelWaterTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
