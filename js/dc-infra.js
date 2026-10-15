/* Planned infrastructure — Region of Peel 2026 DC capital maps (draft):
 * Phase 6 extraction from js/app.js (app.js 6933-7117).
 * lines, facilities, nearest-work lookup, facility pop-ups.
 */
(function (root) {
  'use strict';

  const P = window.PeelPhases;
  const D = window.PeelDemand;
  const { $, esc, fmtNum, unit, token, capitalStatus, CAPITAL_STATUS, CAPITAL } = window.PeelUtil;
  const lnStatus = ln => CAPITAL_STATUS[capitalStatus(ln.y, ln.s, ln.p || ln.c)].toLowerCase();
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const MA = () => window.PeelMapAnalysis;
  const MP = () => window.PeelMasterPlan;
  const TS = () => window.PeelToolScope;
  const SD = () => window.PeelSvcData;
  const Areas = () => window.PeelAreas;

  // ---- Planned infrastructure: Region of Peel 2026 DC capital maps (draft) ------------------
  // data/dc-infra.json (scripts/build-dc-infra.py): proposed and approved water / wastewater mains
  // with construction year, component and project numbers and diameter; facilities (plants,
  // stations, reservoirs, tanks) with their EA / design / property / construction years; and
  // plant treatment capacity steps.
  // Planned DC line colours: [label, token name, weight]. Token names resolve to
  // `var(--*)` in HTML/SVG and to computed values via token() for Leaflet.
  const DC_KIND = {
    primary: ['Primary wastewater main (trunk)', '--dc-ww-main', 4], local: ['Local wastewater main', '--dc-ww-local', 2.5], force: ['Force main', '--dc-ww-force', 2.5],
    transmission: ['Water transmission main', '--dc-w-trans', 4], feeder: ['Water distribution feeder main', '--dc-w-feed', 2.5],
  };
  const DC_FAC = { plant: 'Treatment plant', pumping_station: 'Pumping station', odour_control: 'Odour control facility', reservoir: 'Reservoir', elevated_tank: 'Elevated tank', well: 'Well', program: 'Program' };
  const PHASE_NAME = { EA: 'environmental assessment', P: 'property', D: 'design', C: 'construction' };
  const dcM = (a, b) => Math.hypot((a[0] - b[0]) * 111320 * Math.cos(a[1] * Math.PI / 180), (a[1] - b[1]) * 111320);
  // Distance (m) from a point to a polyline, on a local flat projection.
  function dcDist(pt, g) {
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320;
    let best = Infinity;
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1][0] - pt[0]) * kx, ay = (g[i - 1][1] - pt[1]) * ky, bx = (g[i][0] - pt[0]) * kx, by = (g[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  }
  const lastYear = f => Math.max(0, ...f.items.flatMap(i => i.phases.filter(ph => ph[0] === 'C').map(ph => ph[1])));
  function prepDc(d) {
    if (!d) return null;
    for (const sys of ['wastewater', 'water']) {
      for (const ln of d[sys].lines) {
        ln.sys = sys;
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [x, y] of ln.g) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
        ln.bbox = [x0, y0, x1, y1]; ln.mid = ln.g[Math.floor(ln.g.length / 2)];
      }
      for (const f of d[sys].facilities) f.sys = sys;
    }
    return d;
  }
  // Which traced catchment / pressure zone a planned main serves: the one containing it, else the
  // one nearest its ends (a main beyond the network connects at its end nearest the network).
  function dcTarget(ln) {
    if (ln._target !== undefined) return ln._target;
    const list = ln.sys === 'wastewater' ? App().state.servicing.drainage : App().state.servicing.zones;
    let id = Areas().locate(list, ln.mid[0], ln.mid[1])[0];
    if (!id) { const n = [ln.g[0], ln.g[ln.g.length - 1]].map(e => Areas().nearest(list, e[0], e[1], 3000)).filter(Boolean).sort((a, b) => a.m - b.m)[0]; id = n ? n.id : null; }
    return (ln._target = id || null);
  }
  // Nearest planned main of a system within r metres of a point.
  function dcNearest(sys, pt, r, filter = () => true) {
    if (!App().state.dcInfra || !pt || pt[0] == null) return null;
    const dLng = r / (111320 * Math.cos(pt[1] * Math.PI / 180)), dLat = r / 111320;
    let best = null;
    for (const ln of App().state.dcInfra[sys].lines) {
      const b = ln.bbox;
      if (pt[0] < b[0] - dLng || pt[0] > b[2] + dLng || pt[1] < b[1] - dLat || pt[1] > b[3] + dLat || !filter(ln)) continue;
      const m = dcDist(pt, ln.g);
      if (m <= r && (!best || m < best.m)) best = { ln, m };
    }
    return best;
  }
  // Greenfield connection: a development outside the traced network takes the catchment / zone
  // of the planned main it would connect to (within 1 km), before the distance-only nearest area.
  const DC_CONNECT_M = 1000;
  function dcVia(p, key) {
    if (!App().state.dcInfra || p.lat == null) return null;
    const n = dcNearest(key === 'dr' ? 'wastewater' : 'water', [p.lng, p.lat], DC_CONNECT_M);
    const id = n && dcTarget(n.ln);
    return id ? { id, m: n.m, via: { p: n.ln.p, y: n.ln.y, d: n.ln.d, k: n.ln.k } } : null;
  }
  const dcLineText = ln => `${ln.y || 'year not labelled'} ${ln.d ? `${ln.d} mm ` : ''}${DC_KIND[ln.k][0].toLowerCase()}${ln.p ? ` (project ${ln.p}${ln.c ? `, component ${ln.c}` : ''})` : ''}${ln.s === 'approved' ? ', approved 2026' : ''} · ${lnStatus(ln)} (as of ${CAPITAL.asOf})`;
  // Planned works a development relies on: the planned mains it would connect to (wastewater and
  // water, within 400 m), primary mains and facilities in the catchments on its sewer path, water
  // facilities in its pressure zone, and the receiving plant's capacity steps.
  function devWorks(p, f) {
    if (!App().state.dcInfra || p.lat == null) return null;
    const pt = [p.lng, p.lat];
    const ww = dcNearest('wastewater', pt, 400), wa = dcNearest('water', pt, 400);
    const pathIds = new Set(f && f.path ? f.path.slice(0, 5).map(a => a.id) : []);
    const trunks = !pathIds.size ? [] : App().state.dcInfra.wastewater.lines.filter(ln => ln.k !== 'local' && ln.y && ln.y >= MM().THIS_YEAR && pathIds.has(dcTarget(ln)) && ln !== (ww && ww.ln));
    const byProj = new Map(); for (const t of trunks) { const k = t.p || t.c; if (!byProj.has(k) || (t.d || 0) > (byProj.get(k).d || 0)) byProj.set(k, t); }
    const inArea = (fac, list) => fac.g && list.some(a => P.pointInRings(fac.g[0], fac.g[1], a.rings));
    const facs = [
      ...App().state.dcInfra.wastewater.facilities.filter(x => x.kind !== 'plant' && f && f.path && inArea(x, f.path.slice(0, 5))),
      ...App().state.dcInfra.water.facilities.filter(x => f && f.z && inArea(x, [f.z])),
    ].filter(x => lastYear(x) >= MM().THIS_YEAR);
    const plant = f && f.pl && App().state.dcInfra.plantCapacity[f.pl] || [];
    // Timing applies where the site is outside the existing network (no traced catchment / mapped
    // pressure zone) and relies on a planned main to connect; elsewhere nearby works are context.
    const outWw = !(p.dr && p.dr.length), outWa = !(p.pz && p.pz.length);
    const conn = [outWw && (dcNearest('wastewater', pt, DC_CONNECT_M) || null), outWa && (dcNearest('water', pt, DC_CONNECT_M) || null)].filter(Boolean);
    const needBy = Math.max(0, ...conn.filter(n => n.ln.y && n.ln.y >= MM().THIS_YEAR).map(n => n.ln.y));
    const committed = D.isCommitted(p);
    return { ww: outWw ? conn.find(n => n.ln.sys === 'wastewater') || ww : ww, wa: outWa ? conn.find(n => n.ln.sys === 'water') || wa : wa, outWw, outWa,
      trunks: [...byProj.values()].sort((a, b) => a.y - b.y), facs, plant, needBy, gap: committed && needBy > MM().THIS_YEAR };
  }
  // Which network a site is outside: one system can be served while the other waits on a new main
  // (SPEC 1.9: "outside the existing network" and "on the existing network" said together).
  const netOut = w => (w.outWa && w.outWw ? 'water and sewer networks' : w.outWa ? 'water network' : w.outWw ? 'sewer network' : 'network');
  function devWorksHTML(w, sys = null) {
    if (!w) return '';
    const li = [], on = k => !sys || sys === k;
    for (const [n, what, out, k] of [[w.ww, 'Wastewater', w.outWw, 'wastewater'], [w.wa, 'Water', w.outWa, 'water']]) if (n && on(k)) li.push(`<li><strong>${what} ${out ? 'connection' : 'nearby'}:</strong> ${esc(dcLineText(n.ln))}, ${fmtNum(Math.round(n.m))} m away${out ? '' : ` <span class="muted">(site is on the existing ${k === 'water' ? 'water' : 'sewer'} network)</span>`}${n.ln.n ? `<small>${esc(n.ln.n)}</small>` : ''}</li>`);
    const facs = w.facs.filter(x => on(x.sys));
    if (w.trunks.length && on('wastewater')) li.push(`<li><strong>Downstream trunks:</strong> ${w.trunks.slice(0, 4).map(t => esc(`${t.y} ${t.d ? `${t.d} mm` : ''} ${t.p || ''}`.trim())).join(' · ')}${w.trunks.length > 4 ? ` +${w.trunks.length - 4}` : ''}</li>`);
    if (facs.length) li.push(`<li><strong>Facilities:</strong> ${facs.slice().sort((a, b) => lastYear(a) - lastYear(b)).slice(0, 4).map(x => `<button type="button" class="btn small link" data-dcfac="${esc(x.sys)}|${esc(x.name)}">${esc(x.name)}</button> ${lastYear(x)}`).join(' · ')}${facs.length > 4 ? ` +${facs.length - 4} more (What loads this)` : ''}</li>`);
    if (w.plant.length && on('wastewater')) li.push(`<li><strong>Plant capacity:</strong> ${w.plant.map(s => `${s.mld} ML/d from ${s.year}`).join(' → ')}</li>`);
    if (!li.length) return `<p class="small muted">No planned ${sys === 'water' ? 'water works on the 2026 DC maps near this site or in its pressure zone' : sys ? 'wastewater works on the 2026 DC maps near this site or on its sewer path' : 'works on the 2026 DC maps near this site or on its sewer path'} (served by the existing network).</p>`;
    // The timing note goes with the system the site would connect through.
    const timing = !sys || (sys === 'wastewater' ? w.outWw : w.outWa && !w.outWw);
    return `<ul class="b-lines small dc-works">${li.join('')}</ul>
      ${!timing ? '' : w.gap ? `<p class="small why-stall"><strong>Servicing timing:</strong> committed development outside the existing ${netOut(w)}, but the planned main it would connect to is not built until ${w.needBy} (2026 DC draft).</p>` : w.needBy ? `<p class="small muted">Outside the existing ${netOut(w)}: servicing about ${w.needBy} on the 2026 DC draft schedule.</p>` : ''}`;
  }

  // Map layer: planned mains (dashed when approved in 2026) and facilities.
  // Planned works draw with the infrastructure, under the developments (PeelLayerGroups.Z).
  if (!map.getPane('infraPane')) map.createPane('infraPane', map.getPane('rotatePane') || undefined).style.zIndex = (window.PeelLayerGroups ? window.PeelLayerGroups.Z.infra : 380);
  const dcLayer = L.layerGroup();
  function renderDcLayer() {
    dcLayer.clearLayers();
    if (!MM().getDcOn().on || !App().state.dcInfra) { map.removeLayer(dcLayer); return; }
    dcLayer.addTo(map);
    const yr = MA().getCapYear();
    for (const sys of ['wastewater', 'water']) {
      if (MM().getDcOn().sys !== 'both' && MM().getDcOn().sys !== sys) continue;
      for (const ln of App().state.dcInfra[sys].lines) {
        const [label, colName, w] = DC_KIND[ln.k], later = yr != null && ln.y && ln.y > yr;
        L.polyline(ln.g.map(([x, y]) => [y, x]), { color: token(colName), weight: w, opacity: later ? 0.35 : 0.95, dashArray: ln.s === 'approved' || later ? '6 5' : null, className: 'dc-line', pane: 'infraPane' })
          .bindTooltip(window.PeelUtil.hoverCard({ kind: `DC work · ${ln.s === 'approved' ? 'approved 2026' : 'proposed'}`, name: `${label}${ln.d ? ` · ${ln.d} mm` : ''}`, value: ln.y ? String(ln.y) : '–', sub: `${ln.y ? 'construction' : 'year not labelled'} · ${lnStatus(ln)}`,
            html: `${ln.p ? `Project ${esc(ln.p)}${ln.c ? ` · component ${esc(ln.c)}` : ''}` : ''}${ln.n ? `<br><span class="muted">${esc(ln.n)}</span>` : ''}${ln.t ? `<br><span class="muted small">${esc(ln.t)} (2020 DC study)</span>` : ''}<br><span class="muted">2026 DC capital map (draft, as of ${CAPITAL.asOf}; new growth procurements paused from June 11, 2026)</span>`, also: 'what it relieves' }), { sticky: true, className: 'pt' })
          .on('click', ev => { L.DomEvent.stop(ev); MP().showDcLine(ln); }).addTo(dcLayer);
      }
      for (const fc of App().state.dcInfra[sys].facilities) {
        if (!fc.g) continue;
        const y = lastYear(fc), later = yr != null && y > yr;
        L.marker([fc.g[1], fc.g[0]], { icon: L.divIcon({ className: `dc-fac dc-${sys}${later ? ' later' : ''}`, html: `<span>${{ plant: 'P', pumping_station: 'S', odour_control: 'O', reservoir: 'R', elevated_tank: 'T', well: 'W' }[fc.kind] || '•'}</span>`, iconSize: [20, 20] }) })
          .bindTooltip(window.PeelUtil.hoverCard({ kind: `DC facility · ${DC_FAC[fc.kind] || fc.kind}`, name: fc.name, value: y ? String(y) : '–', sub: `last construction · ${fc.items.length} project${fc.items.length === 1 ? '' : 's'}`, html: fc.approx ? '<span class="muted">approximate location</span>' : '', also: 'its schedule' }), { className: 'pt' })
          .on('click', () => showFacility(fc)).addTo(dcLayer);
      }
    }
  }
  function showFacility(fc) {
    const html = `
      <div class="head"><h3>${esc(fc.name)}</h3><div class="m">${esc(DC_FAC[fc.kind] || fc.kind)} · ${fc.sys === 'water' ? 'water' : 'wastewater'} · 2026 DC capital map (draft, not approved by Council)</div></div>
      <table class="dt dc-sched"><thead><tr><th>Project</th><th>Schedule</th></tr></thead><tbody>
        ${fc.items.map(i => `<tr><td>${esc(i.what)}<small>${esc(i.proj)}</small></td><td>${i.phases.map(ph => `<span class="dc-ph dc-${ph[0]}" title="${esc(PHASE_NAME[ph[0]] || ph[0])} · component ${esc(ph[2])}">${esc(ph[0])} ${ph[1]}</span>`).join(' ')}</td></tr>`).join('')}
      </tbody></table>
      <p class="small muted">EA = environmental assessment, P = property, D = design, C = construction (year and component number from the map). Schedules are subject to annual review and approval by Regional Council.</p>
      ${MP().dcNeedsSection({ fc })}
      `;
    TS().loadsOf = { dc: { fc } };
    TS().toolResult('dc', fc.name, html, () => showFacility(fc), { ref: `dcwork:${fc.sys}:${fc.name}` });
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-dcfac]'); if (!b || !App().state.dcInfra) return;
    const [sys, name] = b.dataset.dcfac.split('|'); const fc = App().state.dcInfra[sys].facilities.find(x => x.name === name);
    if (fc) { showFacility(fc); if (fc.g) map.setView([fc.g[1], fc.g[0]], Math.max(map.getZoom(), 14)); }
  });
  // Planned works serving a catchment (and everything upstream), a pressure zone or a plant.
  function dcAreaWorksHTML(ids, key, plantName) {
    if (!App().state.dcInfra || !ids) return '';
    const sys = key === 'pz' ? 'water' : 'wastewater';
    const byProj = new Map();
    for (const ln of App().state.dcInfra[sys].lines) {
      if (!ids.has(dcTarget(ln))) continue;
      const k = ln.p || ln.c || `${ln.k}${ln.y}`;
      const g = byProj.get(k) || { p: ln.p, k: ln.k, y0: Infinity, y1: 0, d: 0, n: ln.n || '', s: ln.s, len: 0 };
      if (ln.y) { g.y0 = Math.min(g.y0, ln.y); g.y1 = Math.max(g.y1, ln.y); }
      g.d = Math.max(g.d, ln.d || 0); for (let i = 1; i < ln.g.length; i++) g.len += dcM(ln.g[i - 1], ln.g[i]);
      byProj.set(k, g);
    }
    const areas = [...ids].map(id => SD().svcById.get(id)).filter(Boolean);
    const facs = App().state.dcInfra[sys].facilities.filter(f => f.g && (plantName ? f.plant === plantName : areas.some(a => P.pointInRings(f.g[0], f.g[1], a.rings))));
    const steps = plantName ? App().state.dcInfra.plantCapacity[plantName] || [] : [];
    const rows = [...byProj.values()].sort((a, b) => (a.y0 - b.y0) || (b.d - a.d));
    if (!rows.length && !facs.length && !steps.length) return '<p class="small muted">No planned works on the 2026 DC maps in this area.</p>';
    return `<h3 class="sub-title" data-info="dc-works">Planned works (2026 DC capital map, draft)</h3>
      ${steps.length ? `<p class="small"><strong>Treatment capacity:</strong> ${steps.map(x => `${x.mld} ML/d from ${x.year}`).join(' → ')} <span class="muted">(${esc(steps.map(x => x.note).join('; '))})</span></p>` : ''}
      ${facs.length ? `<p class="small"><strong>Facilities:</strong> ${facs.map(f => `<button type="button" class="btn small link" data-dcfac="${esc(f.sys)}|${esc(f.name)}">${esc(f.name)}</button> (last construction ${lastYear(f)})`).join(' · ')}</p>` : ''}
      ${rows.length ? `<table class="dt dc-sched"><thead><tr><th>Construction</th><th>Main</th><th>Length</th></tr></thead><tbody>${rows.slice(0, 40).map(g => `<tr><td>${isFinite(g.y0) ? (g.y0 === g.y1 ? g.y0 : `${g.y0}–${g.y1}`) : '–'}</td><td>${esc(DC_KIND[g.k][0])}${g.d ? ` · ${g.d} mm` : ''}${g.s === 'approved' ? ' · approved 2026' : ''}<small>${esc(g.p || 'no project label')}${g.n ? ` · ${esc(g.n)}` : ''}</small></td><td>${unit(fmtNum(Math.round(g.len / 10) * 10), 'm')}</td></tr>`).join('')}</tbody></table>` : ''}`;
  }
  // Planned works as GeoJSON (GIS).
  function dcGeoJSON() {
    const feats = [];
    for (const sys of ['wastewater', 'water']) {
      for (const ln of App().state.dcInfra[sys].lines) feats.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: ln.g }, properties: { system: sys, kind: ln.k, status: ln.s, construction_year: ln.y, component: ln.c, project: ln.p, diameter_mm: ln.d, study_name: ln.n || '', study_description: ln.t || '' } });
      for (const fc of App().state.dcInfra[sys].facilities) if (fc.g) feats.push({ type: 'Feature', geometry: { type: 'Point', coordinates: fc.g }, properties: { system: sys, kind: fc.kind, name: fc.name, approximate: !!fc.approx, last_construction_year: lastYear(fc), projects: fc.items.map(i => `${i.what} ${i.proj}: ${i.phases.map(ph => `${ph[0]}-${ph[1]} (${ph[2]})`).join(', ')}`).join(' | ') } });
    }
    return { type: 'FeatureCollection', properties: { ...window.PeelUtil.DISCLAIMER_PROPS, source: App().state.dcInfra.source, schedule_as_of: CAPITAL.asOf }, features: feats };
  }

  const api = {
    DC_KIND, DC_FAC, DC_CONNECT_M, dcM, dcDist, dcTarget, dcNearest,
    dcLineText, dcVia, devWorks, devWorksHTML, renderDcLayer, showFacility,
    dcAreaWorksHTML, dcGeoJSON, prepDc,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDcInfra = api;
})(typeof window !== 'undefined' ? window : globalThis);
