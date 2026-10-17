(function (root) {
  'use strict';
  const { $, esc, fmtNum, skel, store, SCREEN_NOTE } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const Areas = () => window.PeelAreas;
  const MA = () => window.PeelMapAnalysis;
  const ST = () => window.PeelSewerTrace;
  const DI = () => window.PeelDcInfra;
  const SD = () => window.PeelSvcData;
  const MP = () => window.PeelMasterPlan;
  const AS = () => window.PeelAreaSelect;
  const Nav = () => window.PeelDevNav;
  const Meas = () => window.PeelMeasure;

  // Existing water facilities layer (data/water-facilities.json): on / off, data, map layer.
  // Off until switched on, except in the Water view (its preset), including when the app opens in it.
  const WF = { on: store.get('wfOn', null) ?? ['water', 'servicing'].includes(store.get('mapView', 'planning')), data: null, loading: null, layer: null };
  const WF_KIND = { plant: ['■', 'Treatment plant'], pumping: ['▲', 'Pumping station'], booster: ['▴', 'Booster / small pumping station'], reservoir: ['●', 'Reservoir'], elevated_tank: ['◆', 'Elevated tank'], standpipe: ['◆', 'Standpipe'], well: ['◉', 'Well'], rechlorination: ['✚', 'Re-chlorination'], clearwell: ['●', 'Clearwell'] };
  if (WF.on) setTimeout(() => setWfOn(true), 0);
  // ---- Existing water facilities ("vertical" infrastructure) -------------------------------------
  // data/water-facilities.json (scripts/build-water-facilities.py): treatment plants, pumping
  // stations, reservoirs, elevated tanks, standpipes, boosters, from the Region's open data, with
  // pumping and storage capacity from the 2020 Master Plan (Vol. 3) and plant ratings and 2025 flows
  // from the annual reports. Markers in the default marker pane (they turn with the map).
  function loadWaterFacilities() {
    if (WF.data || WF.loading) return WF.loading || Promise.resolve(WF.data);
    WF.loading = fetch('data/water-facilities.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(d => { WF.data = d; WF.loading = null; return d; });
    return WF.loading;
  }
  function setWfOn(on) {
    WF.on = !!on; store.set('wfOn', WF.on);
    const cb = $('#opt-wf'); if (cb) cb.checked = WF.on;
    if (!WF.on) { if (WF.layer) map.removeLayer(WF.layer); MA().renderLegend(); return; }
    loadWaterFacilities().then(d => {
      if (!d || !WF.on) return;
      if (!WF.layer) {
        WF.layer = L.layerGroup();
        const tones = wfTones();
        for (const f of d.facilities) {
          if (!f.lnglat) continue;
          const m = L.marker([f.lnglat[1], f.lnglat[0]], { icon: wfIcon(f, tones), fac: f, keyboard: true, title: f.name, zIndexOffset: 1000 });
          m.bindTooltip(window.PeelUtil.hoverCard({ kind: 'Water facility', name: f.name, sub: wfKinds(f), also: 'capacity and Master Plan assessment' }), { direction: 'top', offset: [0, -10], className: 'pt' });
          m.on('click', () => showWaterFacility(f));
          WF.layer.addLayer(m);
        }
      }
      WF.layer.addTo(map); MA().renderLegend();
    });
  }
  // A facility's capacity ring (over at build-out, past the 90% trigger, room), from the Servicing ›
  // Capacity rows: water treatment (South Peel, the well systems) and storage. Pumping stations have
  // none: pumping is assessed into each zone, all the stations feeding it together.
  function wfTones() {
    const SCap = root.PeelSvcCapacity, rows = (SCap && SCap.collect && SCap.collect()) || [], out = new Map();
    if (!WF.data || !rows.length) return out;
    const tone = r => (r.pctBo >= 100 ? 'over' : r.pctBo >= 90 ? 'tight' : 'room');
    const base = n => String(n).replace(/\s+(Reservoir|Elevated Tank|Standpipe)\b.*$/i, '');
    for (const f of WF.data.facilities) {
      let r = null;
      const kinds = f.kinds || [f.kind];
      if (f.kind === 'plant' && f.groundwater) r = rows.find(x => x.kind === 'wplant' && x.id !== 'wsys:southPeel' && String(x.name).replace(/ wells$/, '') === f.groundwater.system);
      else if (f.kind === 'plant') r = rows.find(x => x.id === 'wsys:southPeel');
      // (a pumping station with a reservoir, Silverthorn or West Brampton, rings by its storage)
      if (!r && kinds.some(k => ['reservoir', 'elevated_tank', 'standpipe'].includes(k))) r = rows.find(x => x.kind === 'storage' && base(x.name) === f.name);
      if (r && r.pctBo != null && isFinite(r.pctBo)) out.set(f.id, tone(r));
    }
    return out;
  }
  const wfIcon = (f, tones) => { const [sym] = WF_KIND[f.kind] || ['●'], t = tones.get(f.id); return L.divIcon({ className: 'wf-mk', html: `<i class="wf-ic wf-${f.kind}${t ? ` ring-${t}` : ''}">${sym}</i>`, iconSize: [22, 22], iconAnchor: [11, 11] }); };
  function restyleWf() { if (!WF.layer) return; const tones = wfTones(); WF.layer.eachLayer(m => { if (m.options.fac) m.setIcon(wfIcon(m.options.fac, tones)); }); }
  const wfKinds = f => (f.kinds || [f.kind]).map(k => (WF_KIND[k] || [, k])[1].toLowerCase()).filter((v, i, a) => a.indexOf(v) === i).join(', ').replace(/^./, c => c.toUpperCase());
  // Planned DC works at a facility (2026 DC maps, same name).
  const wfWorks = f => App().state.dcInfra ? App().state.dcInfra.water.facilities.filter(x => x.name.replace(/ Water Treatment Plant$/, '').replace(/^Arthur P\. /, 'A.P. ') === f.name) : [];
  function wfAssessHTML(title, years, a, aLbl, b, bLbl, unit) {
    return `<table class="dt wf-as"><caption>${esc(title)}</caption><thead><tr><th></th>${years.map(y => `<th>${y}</th>`).join('')}</tr></thead><tbody>
      <tr><td>${esc(aLbl)}</td>${a.map(v => `<td>${fmtNum(v)}</td>`).join('')}</tr><tr><td>${esc(bLbl)}</td>${b.map((v, i) => `<td class="${v < a[i] ? 'dcn-gap-t' : ''}">${fmtNum(v)}</td>`).join('')}</tr></tbody></table>`;
  }
  function showWaterFacility(f) {
    const zid = f.lnglat && App().state.servicing ? Areas().locate(App().state.servicing.zones, f.lnglat[0], f.lnglat[1])[0] : null, z = zid && SD().svcById.get(zid);
    const D = WF.data, R = App().state.reports, works = wfWorks(f);
    const pumps = f.pumps && f.pumps.length ? `<table class="dt wf-t"><thead><tr><th>Pumps to</th><th class="n">Pumps</th><th class="n">Installed</th><th class="n">Firm</th><th class="n">Actual firm*</th></tr></thead><tbody>${f.pumps.map(p => `<tr><td>${esc(p.zone)}<small>${esc(p.station)}</small></td><td class="n">${p.pumps}</td><td class="n">${fmtNum(p.installed)}</td><td class="n"><strong>${fmtNum(p.firm)}</strong></td><td class="n">${p.actualFirm == null ? 'n/a' : fmtNum(p.actualFirm)}</td></tr>`).join('')}</tbody></table><p class="small muted">ML/d. Firm = largest pump out of service. *Actual firm from the Region's model, with friction losses. LLP / HLP = low- / high-lift pumps; the number is the pressure zone they feed; W / C / E = west / central / east system.</p>` : '';
    const plant = f.plant ? `<p class="small"><strong>Treatment:</strong> rated ${fmtNum(f.plant.ratedMLd)} ML/d · ${f.plant.year} average ${fmtNum(f.plant.avgMLd)} ML/d (${Math.round(f.plant.avgMLd / f.plant.ratedMLd * 100)}%) · maximum day ${fmtNum(f.plant.maxDayMLd)} ML/d (${Math.round(f.plant.maxDayMLd / f.plant.ratedMLd * 100)}% of rated)${f.assess ? `. The Master Plan table below uses ${fmtNum(f.assess.capacity[0])} ML/d: 90% of installed capacity, its planning limit.` : ''}</p>` : '';
    const gw = f.groundwater ? `<p class="small"><strong>${esc(f.groundwater.system)} system</strong> (all its wells and plants): rated ${fmtNum(f.groundwater.ratedM3d)} m³/d · average ${fmtNum(f.groundwater.avgM3d)} · maximum day ${fmtNum(f.groundwater.maxDayM3d)} m³/d (${Math.round(f.groundwater.maxDayM3d / f.groundwater.ratedM3d * 100)}% of rated) · ≈${fmtNum(f.groundwater.population)} people</p>` : '';
    const stor = f.storageML ? `<p class="small"><strong>Storage:</strong> ${fmtNum(f.storageML)} ML (storage zone ${esc(f.storageZone)})</p>` : '';
    const as = [f.assess && wfAssessHTML('Master Plan: treatment capacity vs forecast maximum day (ML/d)', f.assess.years, f.assess.demand, 'Forecast demand', f.assess.capacity, 'Capacity (90%)'),
      ...(f.assessPumps || []).map(a => wfAssessHTML(`Master Plan: ${a.what} (ML/d)`, a.years, a.demand, 'Forecast demand', a.capacity, 'Existing capacity')),
      f.assessStorage && wfAssessHTML('Master Plan: storage (ML)', f.assessStorage.years, f.assessStorage.required, 'Required', f.assessStorage.available, 'Available')].filter(Boolean).join('');
    root.PeelSvcScope.openResult({ ref: `wfac:${f.id != null ? f.id : f.name}`, title: f.name, reopen: () => showWaterFacility(f), html: `<div class="head"><h3>${esc(f.name)}</h3><div class="m">${esc(wfKinds(f))} · ${esc(f.system)}${z ? ` · ${esc(z.name)}` : ''}</div></div>
      <div class="brief" data-info="water-facilities">${plant}${gw}${stor}${pumps}
      ${as ? `<h3 class="sub-title">2020 Master Plan assessment</h3>${as}<p class="small muted">Red: capacity below the forecast (the Master Plan's trigger for the works below).</p>` : ''}
      ${works.length ? `<h3 class="sub-title">Planned works (2026 DC, draft)</h3><ul class="small">${works.flatMap(w => w.items.map(it => `<li>${esc(it.what)}${it.proj ? ` · ${esc(it.proj)}` : ''}${it.phases && it.phases.length ? ` · ${[...new Set(it.phases.map(p => p[1]))].join(', ')}` : ''}</li>`)).join('')}</ul>` : ''}
      <p class="small muted">${esc(f.parts.join(' · '))}${f.posFrom ? ` · position: ${esc(f.posFrom)}` : ''}. Sources: Region of Peel open data (locations); <a href="${esc(D.sources.mpUrl)}" target="_blank" rel="noopener">2020 Master Plan, Vol. 3</a> (pumping and storage capacity, Tables 4–7, 9, 11, 12)${f.plant || f.groundwater ? `; Region of Peel ${R ? R.year : 2025} drinking water reports` : ''}. The 2025 Master Plan will update these capacities.</p></div>` });
  }
  // Water capacity by growth layer (Water tab), on the same bars as the wastewater plants:
  // treatment (South Peel; the Caledon well systems) as the Overview counts it (the 2025 measured
  // maximum day as existing, split census / built since by the model, plus approved and proposed
  // growth at Peel criteria), and pumping into each lake-based pressure zone: the firm capacity of
  // the pumps that lift water from below zone n into zone n or higher (2020 Master Plan, actual
  // firm where modelled) against the design maximum day of zone n and every zone above it.
  function waterLayers(M, ids) {
    M = M || App().state.svcModel;
    const o = { census: 0, built: 0, approved: 0, proposed: 0, jbuilt: 0, japproved: 0, jproposed: 0 };
    for (const id of ids) { const l = M.zones.get(id); if (l) for (const k in o) o[k] += l[k] || 0; }
    const w = (p, j) => M.wMax(p, j);
    return { o, v: [w(o.census, 0), w(o.built, o.jbuilt), w(o.approved, o.japproved), w(o.proposed, o.jproposed)] };
  }
  function waterCapRow(M, name, ids, rated, base, note, capWord) {
    const { o, v } = waterLayers(M, ids); if (!(rated > 0)) return null;
    if (base != null) { const today = v[0] + v[1], k = today > 0 ? base / today : 1; v[0] *= k; v[1] *= k; }
    const popToday = o.census + o.built, perPerson = popToday > 0 ? (v[0] + v[1]) * 1e6 / popToday : 0;
    return { name: esc(name), rated, v, extMld: 0, perPerson, popToday, note, capWord };
  }
  // Pump groups between zones: source level (the site's reservoir zone, 0 at a plant), target
  // level (the zone number in LLPnX / HLPnX), capacity (actual firm where modelled, else firm).
  // (kept per facilities file: a supply route asks for it at every step of every development)
  function wfPumps() {
    if (wfPumps.of === WF.data && wfPumps.list) return wfPumps.list;
    const out = [];
    for (const f of (WF.data && WF.data.facilities) || []) for (const p of f.pumps || []) {
      const t = /^[LH]LP(\d)([WCE])$/.exec(p.zone); if (!t) continue;
      const src = f.kind === 'plant' ? 0 : f.storageZone ? +f.storageZone.replace(/\D/g, '') : null; if (src == null) continue;
      out.push({ f, src, tgt: +t[1], sys: t[2], cap: p.actualFirm ?? p.firm, zone: p.zone, label: `${f.name} ${p.zone}` });
    }
    wfPumps.of = WF.data; wfPumps.list = out;
    return out;
  }
  // Where a development's water comes from: from its pressure zone, the nearest pump group that
  // lifts water into that zone, then from that station's reservoir zone the nearest group feeding
  // it, and so on down to a treatment plant. Caledon's groundwater areas: the nearest well-system
  // plant. A schematic route through the facilities (the mains between them aren't traced).
  // Sites outside the mapped pressure zones: the zone estimated from the ground elevation. The 2020
  // Master Plan (Volume 3, Table 3) gives each lake-based zone's hydraulic grade line and the ground
  // it serves (zones about 30 m apart, ranges overlapping). Where the ground fits two zones, the zone
  // a planned DC water main within 1 km feeds decides, then the nearest mapped zone, then the zone
  // whose grade line gives the site about 55 m of pressure. Above Zone 7's range: the nearest
  // Caledon groundwater system.
  const PZ_TABLE = { 1: [152.4, 75.0, 106.7], 2: [182.9, 87.8, 137.2], 3: [213.4, 135.9, 167.6], 4: [243.8, 166.4, 210.6], 5: [274.3, 182.4, 236.2], 6: [304.8, 214.5, 259.1], 7: [335.3, 243.4, 289.6] };
  const zoneEst = new WeakMap();
  async function estimateZone(p) {
    if (zoneEst.has(p)) return zoneEst.get(p);
    const zones = App().state.servicing.zones, near = (f, m = 30000) => Areas().nearest(zones.filter(f), p.lng, p.lat, m);
    let elev = null, elevSrc = null; try { const g = await window.PeelElevation.getGround(p.lat, p.lng); elev = g.z; elevSrc = g.z != null ? window.PeelElevation.shortLabel(g) : null; } catch (e) { /* no elevation */ }
    const via = DI().dcVia(p, 'pz'), viaZ = via && SD().svcById.get(via.id), viaL = viaZ && MP().zLevel(viaZ.zone);
    const nz = near(() => true, 20000), nearZ = nz && SD().svcById.get(nz.id), nearL = nearZ && MP().zLevel(nearZ.zone);
    const cand = elev == null ? [] : Object.keys(PZ_TABLE).map(Number).filter(n => elev >= PZ_TABLE[n][1] && elev <= PZ_TABLE[n][2]);
    let level = null, how = '';
    if (cand.length) {
      if (viaL && cand.includes(viaL)) { level = viaL; how = 'dc'; }
      else if (nearL && cand.includes(nearL)) { level = nearL; how = 'near'; }
      else { level = cand.slice().sort((a, b) => Math.abs(PZ_TABLE[a][0] - elev - 55) - Math.abs(PZ_TABLE[b][0] - elev - 55))[0]; how = 'pressure'; }
    }
    let z = null;
    if (level) z = viaZ && viaL === level ? viaZ : (n => n && SD().svcById.get(n.id))(near(a => MP().zLevel(a.zone) === level));
    else if (elev != null && elev > PZ_TABLE[7][2]) { z = (n => n && SD().svcById.get(n.id))(near(a => !!MP().wellSystem[a.zone])); how = 'above'; }
    if (!z) { z = viaZ || nearZ; how = how || (viaZ ? 'dc-only' : 'nearest'); }
    // SPEC 1.8: the development's one zone (SD().zoneOf: the planned main it would connect to, else the
    // nearest zone) is the answer everywhere; the elevation band only flags another zone the ground fits.
    const one = SD().zoneOf(p);
    if (one && one.reason !== 'mapped') { z = one.z; how = one.reason === 'planned-main' ? 'dc-only' : 'nearest'; }
    const est = z ? { z, level: MP().zLevel(z.zone), elev, elevSrc, cand, how, via: how === 'dc' || how === 'dc-only' ? (via || (one && one.via ? { via: one.via, ln: null } : null)) : null } : null;
    zoneEst.set(p, est);
    return est;
  }
  function zoneEstHTML(e) {
    if (!e) return '';
    const zn = esc(e.z.name.replace('Pressure zone ', 'Zone ')), r = e.level && PZ_TABLE[e.level];
    const why = { dc: 'the planned DC main within 1 km feeds it', near: 'it is the nearest mapped zone in range', pressure: 'its grade line gives about 55 m of pressure', above: 'above Zone 7\'s range: the nearest groundwater system', 'dc-only': 'the zone the nearest planned DC main feeds', nearest: 'the nearest mapped zone' }[e.how] || '';
    // One flag (SPEC 1.8): the assigned zone and why; the other zone(s) the ground also fits.
    const other = e.cand.filter(n => n !== e.level), gsrc = e.elevSrc ? ` (${esc(e.elevSrc)})` : '';
    const fits = e.elev == null ? '' : e.cand.length ? (other.length ? ` · ground ≈${Math.round(e.elev)} m${gsrc} also fits Zone ${other.join(' / ')} — <strong>pressure zone uncertain</strong>, confirm in the FSR` : ` · ground ≈${Math.round(e.elev)} m${gsrc} is in its range`) : ` · ground ≈${Math.round(e.elev)} m${gsrc} is outside its range — confirm in the FSR`;
    return `<p class="small est-line">Outside the mapped pressure zones: assigned to <strong>${zn}</strong> (${why})${r && e.how !== 'above' ? ` <span class="muted">— serves ${r[1]}–${r[2]} m, grade line ${r[0]} m (2020 Master Plan, Vol. 3, Table 3)</span>` : ''}${fits}${e.via && (e.via.ln || e.via.via) ? ` (${esc(DI().dcLineText(e.via.ln || { y: e.via.via.y, d: e.via.via.d, k: e.via.via.k, p: e.via.via.p }))})` : ''}.</p>`;
  }
  const dist2 = (a, b) => { const dx = (a[0] - b[0]) * Math.cos(a[1] * Math.PI / 180), dy = a[1] - b[1]; return dx * dx + dy * dy; };
  // (with the zone given, kept per development for the facilities file and servicing data it was
  // traced on: each model rebuild asks for every development's route again)
  const traced = new WeakMap();
  function waterTrace(p, zidIn) {
    if (!zidIn) return waterTraceOf(p, zidIn);
    const c = traced.get(p);
    if (c && c.zid === zidIn && c.wf === WF.data && c.sv === App().state.servicing && c.lng === p.lng && c.lat === p.lat) return c.v;
    const v = waterTraceOf(p, zidIn);
    traced.set(p, { zid: zidIn, wf: WF.data, sv: App().state.servicing, lng: p.lng, lat: p.lat, v });
    return v;
  }
  function waterTraceOf(p, zidIn) {
    if (!WF.data || p.lat == null || !App().state.servicing) return null;
    const pt = [p.lng, p.lat], zid = zidIn || (p.pz && p.pz[0]) || Areas().locate(App().state.servicing.zones, p.lng, p.lat)[0], est = !zid && zoneEst.get(p), z = zid ? SD().svcById.get(zid) : est && est.z;
    if (!z) return null;
    const lvl = MP().zLevel(z.zone);
    if (MP().wellSystem[z.zone] || lvl == null || lvl > 7) {
      const plants = WF.data.facilities.filter(f => f.system === 'Caledon groundwater' && f.kind === 'plant' && f.lnglat).sort((a, b) => dist2(pt, a.lnglat) - dist2(pt, b.lnglat));
      return plants[0] ? { z, est, gw: true, steps: [{ f: plants[0], to: z.name }] } : null;
    }
    const pumps = wfPumps(), steps = [];
    let n = lvl, at = pt;
    for (let guard = 0; n >= 1 && guard < 9; guard++) {
      let cand = pumps.filter(x => x.tgt === n && x.f.lnglat);
      if (!cand.length) cand = pumps.filter(x => x.src < n && x.tgt >= n && x.f.lnglat);
      if (!cand.length) break;
      const g = cand.sort((a, b) => dist2(at, a.f.lnglat) - dist2(at, b.f.lnglat))[0];
      steps.push({ f: g.f, pump: g, to: n });
      at = g.f.lnglat; n = g.src;
      if (n === 0) break;
    }
    return { z, est, gw: false, steps };
  }
  function waterTraceHTML(p) {
    if (!WF.data) { loadWaterFacilities().then(d => { if (d && Nav().getCurrentProject() === p) { const b = $('#dev-wtrace'); if (b) b.innerHTML = waterTraceHTML(p); } }); return skel('Loading the water facilities'); }
    if (App().state.servicing && !(p.pz && p.pz.length) && !zoneEst.has(p)) { estimateZone(p).then(() => { if (Nav().getCurrentProject() === p) { const b = $('#dev-wtrace'); if (b) b.innerHTML = waterTraceHTML(p); } }); return '<p class="small muted">Outside the mapped pressure zones: estimating the zone from the ground elevation…</p>'; }
    const t = waterTrace(p); if (!t || !t.steps.length) return '<p class="small muted">No supply route: the site is outside the mapped pressure zones and no zone could be estimated.</p>';
    const estP = t.est ? zoneEstHTML(t.est) : '';
    const zn = s => esc(String(s).replace('Pressure zone ', 'Zone '));
    if (t.gw) return `${estP}<p class="small">${zn(t.z.name)} is on a Caledon groundwater system: supplied by the <strong>${esc(t.steps[0].f.name)}</strong> wells and treatment${t.steps[0].f.groundwater ? ` (${esc(t.steps[0].f.groundwater.system)} system, rated ${fmtNum(t.steps[0].f.groundwater.ratedM3d)} m³/d)` : ''}.</p>
      <p class="small"><button type="button" class="btn small" data-wtrace="${esc(p.key)}">Trace on the map</button></p>`;
    const rows = t.steps.slice().reverse();
    const plant = rows[0].pump.src === 0;
    const pumpRows = waterCapPumpRows();
    const zr = pumpRows.find(r => r.n === MP().zLevel(t.z.zone));
    return `${estP}<ol class="wtrace small">${plant ? `<li><span class="wf-ic wf-plant">■</span> <strong>${esc(rows[0].f.name)}</strong> treatment plant${rows[0].f.plant ? ` <span class="muted">(rated ${fmtNum(rows[0].f.plant.ratedMLd)} ML/d)</span>` : ''}</li>` : ''}
      ${rows.map(s => `<li><span class="wf-ic wf-${s.f.kind === 'plant' ? 'plant' : 'pumping'}">${s.f.kind === 'plant' ? '■' : '▲'}</span> ${s.f.kind === 'plant' ? 'High-lift pumps' : `<strong>${esc(s.f.name)}</strong>`} <span class="muted">${esc(s.pump.zone)} · ${fmtNum(s.pump.cap)} ML/d firm</span> → zone ${s.to}</li>`).join('')}
      <li><span class="wf-ic wf-dev">●</span> This development · ${zn(t.z.name)}</li></ol>
      ${zr ? `<p class="small">Pumping into zone ${zr.n} and above: <strong>${Math.round(zr.c * 100)}%</strong> of firm capacity with existing + built + approved, ${Math.round(zr.b * 100)}% at build-out.</p>` : ''}
      <p class="small"><button type="button" class="btn small" data-wtrace="${esc(p.key)}">Trace on the map</button> <span class="muted">The stations lifting water into each zone (2020 Master Plan pumping); the trace follows the mains between them.</span></p>`;
  }
  // The pumping rows of the water capacity chart, by zone (shares of firm capacity).
  function waterCapPumpRows() {
    const M = App().state.svcModel; if (!M || !WF.data || !App().state.servicing) return [];
    if (waterCapPumpRows.key === MP().scenarioKey()) return waterCapPumpRows.rows;
    const lake = MP().lakeZones().filter(id => MP().zLevel(SD().svcById.get(id).zone) <= 7), pumps = wfPumps(), rows = [];
    for (let n = 1; n <= 7; n++) {
      const cap = pumps.filter(p => p.src < n && p.tgt >= n).reduce((t, p) => t + p.cap, 0), ids = lake.filter(id => MP().zLevel(SD().svcById.get(id).zone) >= n);
      if (!cap || !ids.length) continue;
      const { v } = waterLayers(App().state.svcModel, ids), tot = v.reduce((a, b) => a + b, 0);
      rows.push({ n, cap, c: (v[0] + v[1] + v[2]) / cap, b: tot / cap });
    }
    waterCapPumpRows.key = MP().scenarioKey(); waterCapPumpRows.rows = rows;
    return rows;
  }
  // ---- Water supply trace: from the plant, station by station, to the site along the mains -------
  // The network: the Region's watermains of 300 mm+ (data/watermains.json) plus the planned water
  // mains of the 2026 DC maps, whose ends join the nearest main within 300 m. Each leg (plant →
  // station → … → site) is the shortest path along it, larger and existing mains preferred; a leg
  // with no mapped link is drawn straight (dashed grey). Indicative only: valves, pressure reducing
  // stations and the hydraulics decide the real flow.
  const WM = { data: null, loading: null, g: null, dcKey: null };
  function loadWatermains() {
    if (WM.data || WM.loading) return WM.loading || Promise.resolve(WM.data);
    WM.loading = fetch('data/watermains.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => { WM.data = d; return d; }).catch(() => null);
    return WM.loading;
  }
  function wmGraph() {
    const dcKey = App().state.dcInfra ? App().state.dcInfra.water.lines.length : 0;
    if (WM.g && WM.dcKey === dcKey) return WM.g;
    const d = WM.data, xs = [], ys = [], E = [];
    for (let i = 0, x = 0, y = 0; i < d.xy.length; i += 2) { x += d.xy[i]; y += d.xy[i + 1]; xs.push(x / 1e5); ys.push(y / 1e5); }
    for (let i = 0; i < d.e.length; i += 3) E.push([d.e[i], d.e[i] + d.e[i + 1], d.e[i + 2], null]);
    const CELL = 0.004, grid = new Map(), gk = (x, y) => `${Math.floor(x / CELL)},${Math.floor(y / CELL)}`;
    const put = i => { const k = gk(xs[i], ys[i]); (grid.get(k) || grid.set(k, []).get(k)).push(i); };
    for (let i = 0; i < xs.length; i++) put(i);
    // Nearest node within maxM metres (skip: a test for nodes to leave out).
    const near = (pt, maxM, skip) => {
      const r = Math.ceil(maxM / (CELL * 80000)) + 1, cx = Math.floor(pt[0] / CELL), cy = Math.floor(pt[1] / CELL);
      let best = -1, bd = maxM;
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (const i of grid.get(`${cx + dx},${cy + dy}`) || []) {
        if (skip && skip(i)) continue;
        const m = DI().dcM(pt, [xs[i], ys[i]]); if (m < bd) { bd = m; best = i; }
      }
      return best >= 0 ? { i: best, m: bd } : null;
    };
    const within = (pt, maxM) => {
      const r = Math.ceil(maxM / (CELL * 80000)) + 1, cx = Math.floor(pt[0] / CELL), cy = Math.floor(pt[1] / CELL), out = [];
      for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) for (const i of grid.get(`${cx + dx},${cy + dy}`) || []) { const m = DI().dcM(pt, [xs[i], ys[i]]); if (m <= maxM) out.push([i, m]); }
      return out;
    };
    // Planned DC water mains: their vertices join the network, their ends the nearest node of
    // another main within 300 m.
    const planned = [];
    if (App().state.dcInfra) for (const ln of App().state.dcInfra.water.lines) {
      const a = xs.length;
      ln.g.forEach(([x, y], k) => { xs.push(x); ys.push(y); if (k) E.push([a + k - 1, a + k, ln.d || 0, ln]); });
      planned.push([a, xs.length - 1, ln]);
    }
    const n0 = d.nodes;
    // A planned main joins an existing one wherever it runs within 25 m of it (twinning, crossings).
    for (const [a, b, ln] of planned) for (let t = a; t <= b; t++) { const n = near([xs[t], ys[t]], 25, i => i >= n0); if (n) E.push([t, n.i, 0, ln]); }
    for (const [a, b] of planned) for (let i = a; i <= b; i++) put(i);
    for (const [a, b, ln] of planned) for (const t of [a, b]) { const n = near([xs[t], ys[t]], 300, i => i >= a && i <= b); if (n) E.push([t, n.i, 0, ln]); }
    const adj = Array.from({ length: xs.length }, () => []);
    E.forEach(([a, b], k) => { adj[a].push(k); adj[b].push(k); });
    const len = E.map(([a, b]) => DI().dcM([xs[a], ys[a]], [xs[b], ys[b]]));
    // Cost: length, less on large mains, more on planned ones and on joins.
    const cost = E.map(([, , dm, ln], k) => len[k] * (dm >= 750 ? 0.7 : dm >= 400 ? 0.85 : dm ? 1 : 1.5) * (ln ? 1.2 : 1));
    WM.g = { xs, ys, E, adj, len, cost, near, within }; WM.dcKey = dcKey;
    return WM.g;
  }
  // Shortest path from a point to a point: starting from any node near A (the distance to it counted
  // double) and ending at any node near B. Returns { s, t, path: [[edge, node reached]…] } or null.
  function wmPath(G, A, B) {
    const cand = pt => { const n = G.near(pt, 1500); if (!n) return []; const r = Math.max(150, n.m + 60); return G.within(pt, r).map(([i, m]) => [i, m * 2]); };
    const S = cand(A), T = new Map(cand(B)); if (!S.length || !T.size) return null;
    const n = G.xs.length, dist = new Float64Array(n).fill(Infinity), via = new Int32Array(n).fill(-1), heap = [];
    const push = x => { heap.push(x); let i = heap.length - 1; while (i) { const q = (i - 1) >> 1; if (heap[q][0] <= heap[i][0]) break; [heap[q], heap[i]] = [heap[i], heap[q]]; i = q; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    for (const [i, c] of S) if (c < dist[i]) { dist[i] = c; push([c, i]); }
    let best = Infinity, bt = -1;
    while (heap.length) {
      const [dd, u] = pop(); if (dd > dist[u]) continue; if (dd >= best) break;
      if (T.has(u) && dd + T.get(u) < best) { best = dd + T.get(u); bt = u; }
      for (const k of G.adj[u]) { const [a, b] = G.E[k], v = a === u ? b : a, nd = dd + G.cost[k]; if (nd < dist[v]) { dist[v] = nd; via[v] = k; push([nd, v]); } }
    }
    if (bt < 0) return null;
    const out = []; let v = bt;
    for (; via[v] >= 0;) { const k = via[v]; out.push([k, v]); const [a, b] = G.E[k]; v = a === v ? b : a; }
    return { s: v, t: bt, path: out.reverse() };
  }
  function clearWaterTrace() { ST().WTRACE.layer.clearLayers(); ST().WTRACE.key = null; ST().WTRACE.last = null; ST().syncPathMode(); AS().syncClearBtn(); }
  async function traceWater(p) {
    await Promise.all([loadWaterFacilities(), loadWatermains(), !(p.pz && p.pz.length) && App().state.servicing ? estimateZone(p) : null]);
    const t = waterTrace(p); if (!t || !t.steps.length) return null;
    clearWaterTrace(); ST().WTRACE.key = p.key;
    const G = WM.data ? wmGraph() : null, L_ = ST().WTRACE.layer;
    // Stops from the plant to the site.
    const site = [p.lng, p.lat], stops = [...t.steps.slice().reverse().map(s => ({ pt: s.f.lnglat, s })), { pt: site, site: true }];
    const bd = L.latLngBounds([[p.lat, p.lng]]);
    let kmE = 0, kmP = 0, kmS = 0, kmL = 0, maxD = 0; const dcLines = new Map(), straight = [];
    let joinM = null;
    const link = (a, b, cls) => { if (cls === 'wtrace-link') kmL += DI().dcM(a, b) / 1000; L.polyline([[a[1], a[0]], [b[1], b[0]]], { className: cls, interactive: false, renderer: SD().flowRenderer }).addTo(L_); bd.extend([a[1], a[0]]).extend([b[1], b[0]]); };
    const flow = [];   // the whole route, plant → site, for the arrows
    for (let q = 1; q < stops.length; q++) {
      const A = stops[q - 1].pt, B = stops[q].pt, w = G ? wmPath(G, A, B) : null;
      const path = w && w.path, na = w && { i: w.s, m: DI().dcM(A, [G.xs[w.s], G.ys[w.s]]) }, nb = w && { i: w.t, m: DI().dcM(B, [G.xs[w.t], G.ys[w.t]]) };
      if (!path) { link(A, B, 'wtrace-gap'); straight.push([stops[q - 1], stops[q]]); kmS += DI().dcM(A, B) / 1000; flow.push(A, B); continue; }
      const at = i => [G.xs[i], G.ys[i]];
      if (na.m > 5) link(A, at(na.i), 'wtrace-link');
      flow.push(A, at(na.i));
      // Runs of existing / planned edges, each one polyline.
      let run = [at(na.i)], kind = null, dm = 0;
      const flush = () => {
        if (run.length < 2) return;
        if (kind && kind.ln) L.polyline(run.map(([x, y]) => [y, x]), { className: 'wtrace-plan', renderer: SD().flowRenderer }).bindTooltip(`<strong>Planned ${esc(DI().DC_KIND[kind.ln.k] ? DI().DC_KIND[kind.ln.k][0].toLowerCase() : 'water main')}</strong>${kind.ln.d ? ` · ${kind.ln.d} mm` : ''}<br>2026 DC capital map${kind.ln.y ? ` · ${kind.ln.y}` : ''}${kind.ln.p ? ` · project ${esc(kind.ln.p)}` : ''}`, { sticky: true, className: 'pt' }).addTo(L_);
        else L.polyline(run.map(([x, y]) => [y, x]), { className: 'wtrace-main', weight: dm >= 900 ? 8 : dm >= 600 ? 7 : dm >= 400 ? 6 : 5, renderer: SD().flowRenderer }).bindTooltip(`<strong>Existing watermain</strong>${dm ? ` · ${dm} mm` : ''}`, { sticky: true, className: 'pt' }).addTo(L_);
      };
      for (const [k, v] of path) {
        const [, , d, ln] = G.E[k], kk = { ln }, sameKind = kind && !!kind.ln === !!ln && (!ln || kind.ln === ln);
        if (!sameKind || (!ln && d && d !== dm)) { flush(); run = [run[run.length - 1]]; kind = kk; if (d) dm = d; }
        run.push(at(v)); bd.extend([G.ys[v], G.xs[v]]); flow.push(at(v));
        if (ln) { kmP += G.len[k] / 1000; dcLines.set(ln, true); } else { kmE += G.len[k] / 1000; maxD = Math.max(maxD, d); }
      }
      flush();
      if (nb.m > 5) link(at(nb.i), B, 'wtrace-link');
      if (stops[q].site) joinM = nb.m;
      flow.push(B);
    }
    ST().traceGlow(flow, L_, 6);
    // Arrows along the whole route, about 14 per trace.
    const tot = (kmE + kmP + kmS + kmL) * 1000, every = Math.max(700, tot / 14);
    let seg = [], run = 0;
    const out = () => { if (seg.length > 1) L.polyline(seg.map(([x, y]) => [y, x]), { className: 'trace-flow', interactive: false, renderer: SD().flowRenderer }).addTo(L_); };
    for (const c of flow) { if (seg.length) { const last = seg[seg.length - 1]; if (last[0] === c[0] && last[1] === c[1]) continue; run += DI().dcM(last, c); } seg.push(c); if (run >= every) { out(); seg = [c]; run = 0; } }
    out();
    // The plant, the stations and the site.
    stops.forEach((st, i) => {
      if (st.site) { L.circleMarker([p.lat, p.lng], { radius: 7, className: 'wtrace-site', interactive: false, renderer: SD().flowRenderer }).addTo(L_); return; }
      const f = st.s.f, isPlant = f.kind === 'plant';
      L.circleMarker([f.lnglat[1], f.lnglat[0]], { radius: isPlant ? 9 : 7, className: isPlant ? 'wtrace-plant' : 'wtrace-ps', renderer: SD().flowRenderer }).addTo(L_)
        .bindTooltip(`${i + 1}. ${esc(f.name)}${st.s.pump ? ` · ${esc(st.s.pump.zone)} → zone ${st.s.to}` : ''}`, { permanent: true, direction: 'right', className: 'wtrace-tip', offset: [10, 0] });
      bd.extend([f.lnglat[1], f.lnglat[0]]);
    });
    ST().addFlowMarker(); ST().syncPathMode(); AS().syncClearBtn();
    ST().fitClear(bd);
    const res = { t, kmE, kmP, kmS, kmL, maxD, dc: [...dcLines.keys()], straight, joinM, net: !!G };
    ST().WTRACE.last = res;
    return res;
  }
  function waterTraceSummaryHTML(r) {
    if (!r) return '<p class="small muted">No supply route: the site is outside the mapped pressure zones and no zone could be estimated.</p>';
    const t = r.t, rows = t.steps.slice().reverse(), first = rows[0].f, zn = s => esc(String(s).replace('Pressure zone ', 'Zone '));
    const pumpRows = waterCapPumpRows(), zr = !t.gw && pumpRows.find(x => x.n === MP().zLevel(t.z.zone));
    const yrs = [...new Set(r.dc.map(ln => ln.y).filter(Boolean))].sort();
    return `${SCREEN_NOTE}${t.est ? zoneEstHTML(t.est) : ''}<ul class="why-list trace-sum">
      <li class="why-ok"><span>From <strong>${esc(first.name)}</strong> ${t.gw ? 'wells and treatment' : first.kind === 'plant' ? 'treatment plant' : ''}: <strong>${(r.kmE + r.kmP + r.kmS + r.kmL).toFixed(1)} km</strong> to the site${r.kmE >= 0.05 ? `, ${r.kmE.toFixed(1)} km along existing watermains${r.maxD ? ` (up to ${fmtNum(r.maxD)} mm)` : ''}` : ''}${r.kmP >= 0.05 ? `, <strong>${r.kmP.toFixed(1)} km along planned DC mains</strong>${yrs.length ? ` (${yrs.join(', ')})` : ''}` : ''}.</span></li>
      ${rows.filter(s => s.pump && s.f.kind !== 'plant').length ? `<li class="why-ok"><span>Pumping on the way: ${rows.filter(s => s.pump && s.f.kind !== 'plant').map(s => `${esc(s.f.name)} <span class="muted">(${esc(s.pump.zone)}, ${fmtNum(s.pump.cap)} ML/d firm → zone ${s.to})</span>`).join(', ')}.</span></li>` : ''}
      ${r.joinM != null ? `<li class="why-ok"><span>The site is ${fmtNum(Math.round(r.joinM / 10) * 10)} m from the nearest main of 300 mm+ on the route${t.z ? ` · ${zn(t.z.name)}` : ''}.</span></li>` : ''}
      ${zr ? `<li class="${zr.b > 1 ? 'why-stall' : 'why-ok'}"><span>Pumping into zone ${zr.n} and above: <strong>${Math.round(zr.c * 100)}%</strong> of firm capacity with existing + built + approved, ${Math.round(zr.b * 100)}% at build-out.</span></li>` : ''}
      ${r.straight.length ? `<li class="why-stall"><span>${r.straight.length === 1 ? 'One step has' : `${r.straight.length} steps have`} no mapped main of 300 mm+ between them: drawn straight (dashed grey)${!r.net ? ' (the watermain network didn\'t load)' : ''}.</span></li>` : ''}
    </ul><p class="small muted">On the map: blue lines are existing watermains (thicker = larger), dashed are planned 2026 DC mains, arrows run from the plant to the site. The route is the shortest path along mains of 300 mm+ between the stations that lift water into each zone: indicative, not a hydraulic model.</p>`;
  }
  // Trace buttons (top of Servicing, and Trace on the map in the Supply route row): one toggles it.
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-wtrace]'); if (!b) return;
    const p = Nav().projectByKey(b.dataset.wtrace); if (!p) return;
    // The button can appear twice (detail panel and the footer Water tab): the trace output
    // goes to the clicked button's container, and every copy's label stays in sync.
    const scope = b.closest('#scope-body, #pane-dev-body, #water-body') || document;
    const top = scope.querySelector(`.trace-box [data-wtrace="${CSS.escape(p.key)}"]`), box = top && top.closest('.trace-box');
    const tops = [...document.querySelectorAll(`[data-wtrace="${CSS.escape(p.key)}"]`)];
    for (const t of tops) if (t._label == null) t._label = t.innerHTML;
    const setTops = on => { for (const t of tops) { t.dataset.on = on ? '1' : ''; t.classList.toggle('on', on); t.innerHTML = on ? 'Hide the water route' : t._label; } };
    if (ST().WTRACE.key === p.key && ST().WTRACE.layer.getLayers().length) { clearWaterTrace(); setTops(false); for (const o of document.querySelectorAll('.wtrace-out')) o.innerHTML = ''; return; }
    if (top) top.textContent = 'Tracing…';
    const r = await traceWater(p);
    setTops(!!r);
    if (box) { box.querySelector('.wtrace-out').innerHTML = waterTraceSummaryHTML(r); if (b !== top) box.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  });

  const api = {
    WF,
    WF_KIND, restyleWf,
    loadWaterFacilities,
    setWfOn,
    showWaterFacility,
    waterCapRow,
    wfPumps,
    estimateZone,
    waterTrace,
    waterTraceHTML,
    clearWaterTrace,
    traceWater,
    waterTraceSummaryHTML,
    wfKinds,
    wfWorks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelWaterTrace = api;
})(typeof window !== 'undefined' ? window : globalThis);
