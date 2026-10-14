/* Sewer profile (ground/pipe/modelled flow along a route) + test-site
 * Phase 6 extraction from js/app.js (app.js 6662-6932).
 * ("what-if") developments.
 */
(function (root) {
  'use strict';

  const D = window.PeelDemand;
  const { $, esc, fmtNum, store, roundPop, PIPE_RESULTS } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MA = () => window.PeelMapAnalysis;
  const ST = () => window.PeelSewerTrace;
  const SC = () => window.PeelSewerCap;
  const DI = () => window.PeelDcInfra;
  const SD = () => window.PeelSvcData;
  const SvcTab = () => window.PeelSvcTab;
  const DD = () => window.PeelDevDetail;
  const AC = () => window.PeelAerialCheck;
  const Meas = () => window.PeelMeasure;
  const MM = () => window.PeelMapMarkers;

  // ---- Sewer profile: ground, pipe and the modelled flow along a route --------------------------
  // For a route of 300 mm+ pipes (a trace, or downstream of a pipe): the ground (terrain tiles), the
  // pipe (Region of Peel inverts; where one isn't published it follows on from the pipe before at the
  // published slope, drawn dashed), and the sewage at the demand year: the normal depth in a
  // part-full pipe (Manning), or, over capacity, the hydraulic grade above the crown
  // (Sf = S0 × (Q / Qfull)², rising upstream from the crown at the pipe's lower end).
  const PROF = { el: null, seq: 0 };
  async function sewerProfile(route, title) {
    if (!PIPE_RESULTS) return;   // pipe-by-pipe results are off for now
    const P = MM().SEW.data.pipes, seq = ++PROF.seq;
    if (!PROF.el) {
      PROF.el = document.createElement('div'); PROF.el.className = 'prof-dlg'; PROF.el.hidden = true; document.body.appendChild(PROF.el);
      PROF.el.addEventListener('click', e => { if (e.target === PROF.el || e.target.closest('[data-prof-close]')) PROF.el.hidden = true; const go = e.target.closest('[data-prof-go]'); if (go) return profPipeOnMap(+go.dataset.profGo); const w = e.target.closest('[data-prof-win]'); if (w) drawProfile(+w.dataset.profWin); });
      addEventListener('keydown', e => { if (e.key === 'Escape' && PROF.el && !PROF.el.hidden) PROF.el.hidden = true; });
    }
    PROF.el.hidden = false;
    PROF.el.innerHTML = `<div class="prof-card" role="dialog" aria-label="Sewer profile"><div class="prof-head"><strong>${esc(title)}</strong><button type="button" class="btn small link" data-prof-close>Close ×</button></div><p class="muted small">Looking up the ground along ${fmtNum(route.length)} pipes…</p></div>`;
    // Distances, inverts (published, else carried on at the slope) and flows.
    let x = 0, lastDn = null;
    const segs = route.map(i => {
      const p = P[i], c = SC().pipeCoords(p);
      let len = p[14]; if (!(len > 0)) { len = 0; for (let k = 1; k < c.length; k++) len += DI().dcM(c[k - 1], c[k]); }
      let up = p[12], dn = p[13], est = false;
      if (up == null || dn == null) { est = true; up = up ?? lastDn ?? null; dn = dn ?? (up != null ? up - (p[1] || 0.002) * len : null); }
      const st = SC().pipeStats(i), D = p[0] / 1000;
      const sg = { i, x0: x, x1: x + len, len, up, dn, est, D, st, a: c[0], b: c[c.length - 1], mid: c[Math.floor(c.length / 2)] };
      x += len; lastDn = dn; return sg;
    });
    // Back-fill pipes before the first published invert, from the one after.
    for (let k = segs.length - 2; k >= 0; k--) if (segs[k].up == null && segs[k + 1].up != null) { const g = segs[k]; g.dn = segs[k + 1].up; g.up = g.dn + (P[g.i][1] || 0.002) * g.len; g.est = true; }
    let ground;
    try {
      const pts = segs.flatMap(g => [g.a, g.mid, g.b]);
      const z = await Promise.all(pts.map(([lng, lat]) => Meas().elevAt(lat, lng).catch(() => null)));
      ground = segs.map((g, k) => [z[3 * k], z[3 * k + 1], z[3 * k + 2]]);
    } catch (e) { ground = segs.map(() => [null, null, null]); }
    if (seq !== PROF.seq) return;
    PROF.data = { segs, ground, title };
    const tight = segs.reduce((b, g, k) => g.st.r1 != null && (!b || g.st.r1 > segs[b.k].st.r1) ? { k } : b, null);
    PROF.wins = [{ t: `Whole path (${(x / 1000).toFixed(1)} km)`, a: 0, b: x }];
    if (x > 2500) PROF.wins.push({ t: 'First 2 km', a: 0, b: 2000 });
    if (tight && x > 2500) { const c = (segs[tight.k].x0 + segs[tight.k].x1) / 2; PROF.wins.push({ t: `Tightest pipe ±1 km (${P[segs[tight.k].i][0]} mm, ${Math.round(segs[tight.k].st.r1 * 100)}%)`, a: Math.max(0, c - 1000), b: Math.min(x, c + 1000) }); }
    drawProfile(PROF.wins.length > 1 && x > 8000 ? (tight ? 2 : 1) : 0);
  }
  function drawProfile(w) {
    const { segs, ground, title } = PROF.data, win = PROF.wins[w] || PROF.wins[0], P = MM().SEW.data.pipes;
    const inWin = segs.map((g, k) => ({ g, z: ground[k] })).filter(({ g }) => g.x1 >= win.a && g.x0 <= win.b && g.up != null);
    const W = Math.min(1100, innerWidth - 40), H = Math.min(420, Math.max(260, innerHeight * 0.45)), L = 52, R = 14, T = 14, B = 34;
    // Water surface / hydraulic grade at each end of a pipe.
    const water = g => {
      const r = g.st.r1; if (r == null) return null;
      if (r <= 1) { const y = SC().depthRatio(r) * g.D; return { up: g.up + y, dn: g.dn + y, sur: false }; }
      const S0 = Math.max(0.0001, (g.up - g.dn) / (g.len || 1)), Sf = S0 * r * r;
      return { up: g.dn + g.D + Sf * g.len, dn: g.dn + g.D, sur: true };
    };
    const ys = inWin.flatMap(({ g, z }) => { const wv = water(g); return [g.up, g.dn, g.up + g.D, ...(z || []).filter(v => v != null), ...(wv ? [wv.up] : [])]; });
    if (!ys.length) { PROF.el.querySelector('.prof-card').innerHTML = `<div class="prof-head"><strong>${esc(title)}</strong><button type="button" class="btn small link" data-prof-close>Close ×</button></div><p class="small muted">No published inverts on this path to draw a profile from.</p>`; return; }
    const lo = Math.floor(Math.min(...ys) - 1), hi = Math.ceil(Math.max(...ys) + 1);
    const X = v => L + (Math.min(win.b, Math.max(win.a, v)) - win.a) / ((win.b - win.a) || 1) * (W - L - R), Y = z => T + (1 - (z - lo) / ((hi - lo) || 1)) * (H - T - B);
    const pt = (xx, z) => `${X(xx).toFixed(1)},${Y(z).toFixed(1)}`;
    let pipeF = '', pipeE = '', wat = '', sur = '', grd = [], mh = '';
    for (const { g, z } of inWin) {
      const poly = `${pt(g.x0, g.up)} ${pt(g.x1, g.dn)} ${pt(g.x1, g.dn + g.D)} ${pt(g.x0, g.up + g.D)}`;
      if (g.est) pipeE += `<polygon points="${poly}" class="pf-pipe est"/>`; else pipeF += `<polygon points="${poly}" class="pf-pipe"/>`;
      const wv = water(g);
      if (wv) {
        const top = (zz, inv) => Math.min(zz, inv + g.D);
        wat += `<polygon points="${pt(g.x0, g.up)} ${pt(g.x1, g.dn)} ${pt(g.x1, top(wv.dn, g.dn))} ${pt(g.x0, top(wv.up, g.up))}" class="pf-water${wv.sur ? ' over' : g.st.r1 >= 0.85 ? ' near' : ''}"/>`;
        if (wv.sur) sur += `<polyline points="${pt(g.x0, wv.up)} ${pt(g.x1, wv.dn)}" class="pf-hgl"/>`;
      }
      if (z) { if (z[0] != null) grd.push([g.x0, z[0]]); if (z[1] != null) grd.push([(g.x0 + g.x1) / 2, z[1]]); if (z[2] != null) grd.push([g.x1, z[2]]); }
      if (X(g.x0) > L + 1) mh += `<line x1="${X(g.x0).toFixed(1)}" x2="${X(g.x0).toFixed(1)}" y1="${Y(g.up + g.D).toFixed(1)}" y2="${(z && z[0] != null ? Y(z[0]) : Y(g.up + g.D)).toFixed(1)}" class="pf-mh"/>`;
    }
    grd.sort((a, b) => a[0] - b[0]);
    const gLine = grd.map(([xx, z]) => pt(xx, z)).join(' ');
    const gFill = grd.length ? `<polygon points="${pt(grd[0][0], hi)} ${gLine} ${pt(grd[grd.length - 1][0], hi)}" class="pf-gfill"/>` : '';
    const ticksY = []; const step = Math.max(1, Math.round((hi - lo) / 6)); for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) ticksY.push(v);
    const span = win.b - win.a, maxT = Math.max(3, Math.floor((W - L - R) / 62)), kstep = [100, 250, 500, 1000, 2000, 5000, 10000].find(k => span / k <= maxT) || 20000, ticksX = []; for (let v = Math.ceil(win.a / kstep) * kstep; v <= win.b; v += kstep) ticksX.push(v);
    const svg = `<svg class="prof-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Sewer profile: ground, pipe and sewage level along the path">
      ${ticksY.map(v => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="pf-grid"/><text x="${L - 6}" y="${(Y(v) + 3).toFixed(1)}" class="pf-ax" text-anchor="end">${v}</text>`).join('')}
      ${ticksX.map(v => `<text x="${X(v).toFixed(1)}" y="${H - B + 16}" class="pf-ax" text-anchor="middle">${v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)} km` : `${v} m`}</text>`).join('')}
      ${gFill}<polyline points="${gLine}" class="pf-ground"/>${mh}${pipeE}${pipeF}${wat}${sur}
      <line class="pf-cur" x1="0" x2="0" y1="${T}" y2="${H - B}" visibility="hidden"/>
      <text x="${L}" y="${H - 6}" class="pf-ax">Distance along the path →  (elevation, m)</text></svg>`;
    const yrT = MA().getCapYear() == null ? 'build-out' : MA().getCapYear();
    const nSur = inWin.filter(({ g }) => g.st.r1 > 1).length, nEst = inWin.filter(({ g }) => g.est).length;
    PROF.el.querySelector('.prof-card').innerHTML = `<div class="prof-head"><strong>${esc(title)}</strong><button type="button" class="btn small link" data-prof-close>Close ×</button></div>
      <div class="prof-bar"><span class="seg">${PROF.wins.map((o, k) => `<button type="button" class="btn small${k === w ? ' on' : ''}" data-prof-win="${k}">${esc(o.t)}</button>`).join('')}</span>
        <span class="muted small">Sewage at <strong>${esc(String(yrT))}</strong> (Demand year) · ${fmtNum(inWin.length)} pipes${nSur ? ` · <strong class="pf-over-t">${nSur} surcharged</strong>` : ''}</span></div>
      <div class="prof-wrap">${svg}<div class="prof-tip" hidden></div></div>
      <ul class="grow-legend prof-legend"><li><span class="pf-sw ground"></span>Ground (terrain tiles, ±1–2 m)</li><li><span class="pf-sw pipe"></span>Pipe (published inverts${nEst ? '; dashed: estimated from the slope' : ''})</li><li><span class="pf-sw water"></span>Sewage, part full</li><li><span class="pf-sw near"></span>85–100% of capacity</li><li><span class="pf-sw over"></span>Surcharged; red line = hydraulic grade</li></ul>
      <p class="small muted">Flows at Peel criteria for the scenario (${esc(SvcTab().scenarioText())}). Normal depth in each pipe on its own (Manning, n = 0.013), not a backwater model; above capacity the grade line rises upstream at Sf = S0 × (Q / Qfull)². Depth of cover = ground − crown.</p>`;
    // Hover / tap: the pipe under the pointer.
    const svgEl = PROF.el.querySelector('.prof-svg'), tip = PROF.el.querySelector('.prof-tip'), cur = svgEl.querySelector('.pf-cur');
    const hitAt = ev => { const r = svgEl.getBoundingClientRect(), px = (ev.clientX - r.left) / r.width * W, xx = win.a + (px - L) / (W - L - R) * (win.b - win.a); return { r, px, xx, hit: inWin.find(({ g }) => xx >= g.x0 && xx <= g.x1) }; };
    const at = ev => {
      const { r, px, xx, hit } = hitAt(ev); if (!hit) { tip.hidden = true; cur.setAttribute('visibility', 'hidden'); return; }
      const { g, z } = hit, f = (xx - g.x0) / (g.len || 1), inv = g.up + (g.dn - g.up) * f, gz = z && z[1] != null ? (z[0] != null && f < 0.5 ? z[0] + (z[1] - z[0]) * f * 2 : z[2] != null ? z[1] + (z[2] - z[1]) * (f - 0.5) * 2 : z[1]) : null, wv = water(g);
      cur.setAttribute('x1', px); cur.setAttribute('x2', px); cur.setAttribute('visibility', 'visible');
      tip.hidden = false; tip.style.left = `${Math.min(r.width - 230, Math.max(0, ev.clientX - r.left + 12))}px`;
      tip.innerHTML = `<strong>${P[g.i][0]} mm</strong> · slope ${(P[g.i][1] * 100).toFixed(2)}% · ${fmtNum(Math.round(xx))} m along
        <br>Invert ${inv.toFixed(2)} m${g.est ? ' (est.)' : ''} · ground ${gz != null ? `${gz.toFixed(1)} m` : 'n/a'}${gz != null ? ` · cover ${(gz - inv - g.D).toFixed(1)} m` : ''}
        <br>Flow ${fmtNum(Math.round(g.st.then.q))} L/s of ${g.st.cap ? `${fmtNum(g.st.cap)} L/s` : 'n/a'}${g.st.r1 != null ? ` · <strong>${Math.round(g.st.r1 * 100)}%</strong>` : ''}
        <br>${wv ? wv.sur ? `<span class="pf-over-t">Surcharged: grade ${(wv.up - g.up - g.D).toFixed(2)} m above the crown at the upper end</span>` : `Sewage depth ${Math.round(SC().depthRatio(g.st.r1) * 100)}% of the pipe · freeboard ${SC().fbText(P[g.i][0], g.st.r1)}` : 'No reliable slope: flow depth not worked out'}
        ${ev.pointerType === 'touch' ? `<br><button type="button" class="btn small" data-prof-go="${g.i}">Show on the map</button>` : '<br><span class="muted">Click to show it on the map</span>'}`;
    };
    // Click (mouse / pen) a pipe: show it on the map. On touch a tap shows the details with a button.
    let ptype = 'mouse';
    svgEl.addEventListener('pointermove', at); svgEl.addEventListener('pointerdown', e => { ptype = e.pointerType; at(e); });
    svgEl.addEventListener('click', e => { if (ptype === 'touch') return; const { hit } = hitAt(e); if (hit) profPipeOnMap(hit.g.i); });
    svgEl.addEventListener('pointerleave', e => { if (e.pointerType === 'touch') return; tip.hidden = true; cur.setAttribute('visibility', 'hidden'); });
  }
  // A pipe picked on the profile: close the profile, fit the pipe on the map and mark it (a label on
  // the pipe; Back to profile and Pipe details in the bar at the top of the map).
  const PROF_HL = L.layerGroup().addTo(map);
  let profMapBar = null;
  function profMapOff() { PROF_HL.clearLayers(); if (profMapBar) profMapBar.hidden = true; }
  function profPipeOnMap(i) {
    const c = SC().pipeCoords(MM().SEW.data.pipes[i]).map(([x, y]) => [y, x]), mid = c[Math.floor(c.length / 2)], st = SC().pipeStats(i);
    PROF.el.hidden = true; PROF_HL.clearLayers();
    L.polyline(c, { className: 'pipe-hl', interactive: false, renderer: SD().flowRenderer }).addTo(PROF_HL);
    L.circleMarker(mid, { radius: 1, opacity: 0, fillOpacity: 0, interactive: false })
      .bindTooltip(`<strong>${MM().SEW.data.pipes[i][0]} mm</strong>${st.r1 != null ? ` · ${Math.round(st.r1 * 100)}% in ${MA().getCapYear() == null ? 'build-out' : MA().getCapYear()}` : ''}`, { permanent: true, direction: 'auto', offset: [0, 0], className: 'pt pipe-hl-t' }).addTo(PROF_HL);
    if (!profMapBar) { profMapBar = L.DomUtil.create('div', 'prof-map-bar', mapBottom); L.DomEvent.disableClickPropagation(profMapBar); }
    profMapBar.innerHTML = `<button type="button" class="btn small" data-prof-back>‹ Back to profile</button><button type="button" class="btn small" data-prof-pipe="${i}">Pipe details</button><button type="button" class="btn small link" data-prof-off aria-label="Clear the marked pipe">×</button>`;
    profMapBar.hidden = false;
    // On a phone, lower the bottom sheet for now so the pipe has room (back to the profile restores it).
    const sh = $('#detail'), shH = sh && !sh.hidden && MA().phoneMap ? sh.getBoundingClientRect().height / innerHeight * 100 : 0;
    if (shH > 32) { PROF.sheetH = shH; App().setSheetH(30); } else PROF.sheetH = null;
    MA().layoutMapBoxes(); map.invalidateSize();
    const bd = L.latLngBounds(c); bd.extend(L.latLng(mid).toBounds(300)); ST().fitClear(bd);
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-prof-back]')) { setTimeout(() => { profMapOff(); if (PROF.sheetH) { App().setSheetH(PROF.sheetH); PROF.sheetH = null; } if (PROF.el) PROF.el.hidden = false; }); return; }
    const pp = e.target.closest('[data-prof-pipe]'); if (pp) { const i = +pp.dataset.profPipe; setTimeout(() => { profMapOff(); SC().showPipeLoads(i); }); return; }
    if (e.target.closest('[data-prof-off]')) { setTimeout(profMapOff); return; }
    const b = e.target.closest('[data-profile]'); if (!b || !MM().SEW.data) return;
    if (b.dataset.profile === 'trace' && ST().TRACE.last) return sewerProfile(ST().TRACE.last.route, `Sewer profile: ${(ST().TRACE.last.km).toFixed(1)} km to ${ST().TRACE.last.plantName === 'Toronto' ? 'the City of Toronto system' : SD().plantLabel(ST().TRACE.last.plantName)}`);
    const m = /^pipe:(\d+)$/.exec(b.dataset.profile);
    if (m) { const i = +m[1], all = ST().pipeRoute(i); let run = 0; const r = []; for (const k of all) { r.push(k); const c = SC().pipeCoords(MM().SEW.data.pipes[k]); for (let q = 1; q < c.length; q++) run += DI().dcM(c[q - 1], c[q]); if (run > 3000) break; } sewerProfile(r, `Sewer profile: ${MM().SEW.data.pipes[i][0]} mm sewer and ${(run / 1000).toFixed(1)} km downstream`); }
  });

  // One home for tool results (design audit, Group 7): the Tool result tab, with its trail crumb;
  // the #detail panel only when the tool framework is absent.
  const Tools = () => window.PeelTools;
  let resultView = null, resultTitle = null;   // this module's result while it is the open one
  function showResult(view, title, html, reopen) {
    resultView = view; resultTitle = title;
    if (Tools() && Tools().openResult) { Tools().openResult({ title, html, reopen }); /* the trace summary and the servicing check carry their own note */ return; }
    $('#detail-body').innerHTML = html; $('#detail').hidden = false; $('#detail').dataset.view = view; $('#detail').scrollTop = 0;
  }
  const resultOpen = view => resultView === view && (Tools() && Tools().resultTitle ? Tools().resultTitle() === resultTitle : !$('#detail').hidden);
  function closeResult() { resultView = null; if (Tools() && Tools().hasResult && Tools().hasResult()) Tools().closeResult(); else AC().closeDetail(); }
  // Trace from any point on the map: the nearest 300 mm+ sewer down to the plant. Returns the
  // trace; shows it only when asked (Inspect point and Fit use the trace without a panel).
  async function tracePoint(ll, show = true) {
    const pt = { key: `pt:${ll.lat.toFixed(5)},${ll.lng.toFixed(5)}`, lat: ll.lat, lng: ll.lng, title: 'Point on the map' };
    if (!show) return ST().traceDev(pt);
    showResult('trace', 'Sewer path', '<div class="head"><h3>Sewer path from this point</h3><div class="m">Tracing…</div></div>');
    const t = await ST().traceDev(pt);
    showResult('trace', 'Sewer path', `<div class="head"><h3>Sewer path from this point</h3><div class="m">${ll.lat.toFixed(5)}, ${ll.lng.toFixed(5)} · ${t ? `${t.km.toFixed(1)} km to ${esc(t.plantName === 'Toronto' ? 'the City of Toronto system' : SD().plantLabel(t.plantName))}` : 'no sewer path found'}</div></div>
      ${ST().traceSummaryHTML(t)}
      <p class="small"><button type="button" class="btn small" data-tool-again="trace">Trace another point</button></p>`, () => tracePoint(ll));
    return t;
  }
  document.addEventListener('click', e => { const b = e.target.closest('[data-tool-again]'); if (b) Meas().setTool(b.dataset.toolAgain); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && Meas().tool.mode) Meas().setTool(null); });

  // Test a site: a proposed development placed on the map, with its servicing check — pressure
  // zone, sewer path, pumping station and plant reserve — before an application exists. It can be
  // counted in the Water / Wastewater totals as a proposed development (kept in this browser).
  const whatIfLayer = L.layerGroup().addTo(map);
  function whatIfProject(w) {
    const units = w.single + w.town + w.apartment;
    const p = {
      key: `whatif:${w.id}`, whatif: true, title: w.name || 'Test site', municipality: w.municipality || '', lat: w.lat, lng: w.lng,
      phase: w.phase, rank: window.PeelPhases.PHASE_BY_KEY[w.phase].rank, units, unitMix: { single: w.single, semi: 0, town: w.town, apartment: w.apartment },
      types: [], description: '', records: [], kinds: ['application'], milestones: {}, timeline: [], sp: [], mtsa: [], siteAreaHa: w.ha > 0 ? w.ha : null,
      buildout: units ? { planned: units, permitted: 0, completed: 0, remaining: units, unbuilt: units, permits: 0 } : null,
      _emp: w.jobs > 0 ? { jobs: w.jobs, uses: [], totalM2: 0 } : null,
    };
    if (App().state.servicing) {
      SD().tagAreas(p);
    }
    return p;
  }
  let whatIfs = (store.get('whatifs', []) || []).filter(w => w && w.lat != null);
  // Bottom-of-map bar: Clear selection, and the test sites with Remove all (and Undo after).
  const mapBottom = L.DomUtil.create('div', 'map-bottom', map.getContainer());
  const wfBar = L.DomUtil.create('div', 'wf-bar', mapBottom);
  L.DomEvent.disableClickPropagation(wfBar);
  let wfUndo = null, wfUndoT = 0;
  function removeWhatIfs(ids) {
    const gone = whatIfs.filter(w => ids.includes(w.id)); if (!gone.length) return;
    whatIfs = whatIfs.filter(w => !ids.includes(w.id));
    if (wfCurrent && ids.includes(wfCurrent) && resultOpen('whatif')) closeResult();
    wfUndo = gone; clearTimeout(wfUndoT); wfUndoT = setTimeout(() => { wfUndo = null; renderWfBar(); }, 8000);
    syncWhatIfs();
    if (resultOpen('whatifs')) showWhatIfList();
  }
  function renderWfBar() {
    const n = whatIfs.length;
    wfBar.hidden = !n && !wfUndo;
    wfBar.innerHTML = wfUndo ? `<span>Removed ${wfUndo.length === 1 ? esc(wfUndo[0].name || 'test site') : `${wfUndo.length} test sites`}</span><button type="button" class="btn small" data-wf-undo>Undo</button>`
      : `<button type="button" class="wf-bar-n" data-wf-list title="List the test sites">${n} test site${n === 1 ? '' : 's'}</button><button type="button" class="btn small" data-wf-all title="Remove every test site from the map and the totals">Remove ${n === 1 ? '' : 'all '}<span aria-hidden="true">×</span></button>`;
  }
  // Acted on after the click finishes: redrawing the bar mid-click detaches the button, and Leaflet
  // would then take the click for a tap on the empty map (which unselects).
  wfBar.addEventListener('click', e => {
    const act = e.target.closest('[data-wf-undo]') ? 'undo' : e.target.closest('[data-wf-all]') ? 'all' : e.target.closest('[data-wf-list]') ? 'list' : '';
    setTimeout(() => {
      if (act === 'undo' && wfUndo) { whatIfs = whatIfs.concat(wfUndo); wfUndo = null; clearTimeout(wfUndoT); syncWhatIfs(); if (resultOpen('whatifs')) showWhatIfList(); }
      else if (act === 'all') removeWhatIfs(whatIfs.map(w => w.id));
      else if (act === 'list') showWhatIfList();
    });
  });
  // Every test site, each with its own remove.
  function showWhatIfList() {
    if (!whatIfs.length) { closeResult(); return; }
    showResult('whatifs', 'Test sites', `<div class="head"><h3>Test sites</h3><div class="m">${whatIfs.length} on the map · kept in this browser · not real applications</div></div>
      <ul class="wf-list">${whatIfs.map(w => `<li><button type="button" class="wf-open" data-wf-open="${esc(w.id)}"><strong>${esc(w.name || 'Test site')}</strong><small>${fmtNum(w.single + w.town + w.apartment)} units${w.jobs ? ` · ${fmtNum(w.jobs)} jobs` : ''}${w.include ? ' · counted in totals' : ''}</small></button><button type="button" class="btn small" data-wf-rm="${esc(w.id)}" aria-label="Remove ${esc(w.name || 'test site')}">Remove <span aria-hidden="true">×</span></button></li>`).join('')}</ul>
      <p><button type="button" class="btn small" data-wf-rmall>Remove all test sites</button></p>`, () => showWhatIfList());
  }
  // Test-site controls work in the Tool result tab and in the #detail fallback.
  const wfBodies = ['#detail-body', '#pane-tool-body'].map(q => $(q)).filter(Boolean);
  const onWf = (type, fn) => wfBodies.forEach(b => b.addEventListener(type, fn));
  let wfCurrent = null;   // the test site whose form is open
  onWf('click', e => {
    const rm = e.target.closest('[data-wf-rm]'); if (rm) { removeWhatIfs([rm.dataset.wfRm]); return; }
    if (e.target.closest('[data-wf-rmall]')) { removeWhatIfs(whatIfs.map(w => w.id)); return; }
    const op = e.target.closest('[data-wf-open]'); if (op) { const w = whatIfs.find(x => x.id === op.dataset.wfOpen); if (w) { map.setView([w.lat, w.lng], Math.max(map.getZoom(), 15)); showWhatIf(null, w.id); } return; }
    if (e.target.closest('[data-wf-showall]')) showWhatIfList();
  });
  function syncWhatIfs() {
    renderWfBar();
    store.set('whatifs', whatIfs);
    App().state.whatifs = whatIfs.filter(w => w.include).map(whatIfProject);
    whatIfLayer.clearLayers();
    for (const w of whatIfs) {
      L.marker([w.lat, w.lng], { draggable: true, icon: L.divIcon({ className: 'whatif-mk', html: '<span>?</span>', iconSize: [24, 24] }) })
        .bindTooltip(`<strong>${esc(w.name || 'Test site')}</strong><br>${fmtNum(w.single + w.town + w.apartment)} units${w.jobs ? ` · ${fmtNum(w.jobs)} jobs` : ''}${w.include ? '<br>Counted in the totals' : ''}`, { className: 'pt' })
        .on('click', () => showWhatIf(null, w.id))
        .on('dragend', e => { const ll = e.target.getLatLng(); w.lat = ll.lat; w.lng = ll.lng; syncWhatIfs(); showWhatIf(null, w.id); })
        .addTo(whatIfLayer);
    }
    if (App().state.svcModel) SvcTab().renderSvcTab();
  }
  function showWhatIf(latlng, id) {
    let w = id ? whatIfs.find(x => x.id === id) : null;
    if (!w) {
      const muni = (App().state.areas && App().state.censusDas) ? '' : '';
      w = { id: Date.now().toString(36), name: `Test site ${whatIfs.length + 1}`, lat: latlng.lat, lng: latlng.lng, single: 0, town: 0, apartment: 200, jobs: 0, ha: 0, phase: 'review', include: false, municipality: muni, fresh: true };
      whatIfs.push(w); syncWhatIfs();
    }
    const num = (k, label, step = 1) => `<label class="field"><span>${label}</span><input type="number" min="0" step="${step}" data-wf="${k}" value="${w[k]}"></label>`;
    wfCurrent = w.id;
    showResult('whatif', w.name || 'Test site', `
      <div class="head"><h3><input class="wf-name" data-wf="name" value="${esc(w.name)}" aria-label="Name"></h3><div class="m">Test site · drag the pin to move it · not a real application${whatIfs.length > 1 ? ` · <button type="button" class="btn small link" data-wf-showall>all ${whatIfs.length} test sites</button>` : ''}</div>
        <div class="wf-head-act"><button type="button" class="btn small" data-wf-del="1">Remove this test site <span aria-hidden="true">×</span></button></div></div>
      <div class="wf-form">${num('single', 'Single / semi')}${num('town', 'Townhouses')}${num('apartment', 'Apartments')}${num('jobs', 'Jobs')}${num('ha', 'Site area (ha)', 0.1)}
        <label class="field"><span>Layer</span><select data-wf="phase"><option value="review"${w.phase === 'review' ? ' selected' : ''}>Proposed</option><option value="approved"${w.phase === 'approved' ? ' selected' : ''}>Committed</option></select></label></div>
      <label class="chk small"><input type="checkbox" data-wf="include"${w.include ? ' checked' : ''}> Count it in the Water / Wastewater totals and plant capacity</label>
      <div id="wf-out"></div>`, () => showWhatIf(null, w.id));
    renderWhatIfOut(w);
  }
  function renderWhatIfOut(w) {
    const p = whatIfProject(w), f = SD().svcFacts(p), out = $('#wf-out'); if (!out) return;
    const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf);
    out.innerHTML = `<p class="small">${fmtNum(roundPop(e.population))} people${e.employment.jobs ? ` + ${fmtNum(roundPop(e.employment.jobs))} jobs` : ''} at Peel persons per unit${p.siteAreaHa ? '' : ' · site area estimated from units for I&amp;I'}.</p>
      <section class="brief"><div class="b-row"><div class="b-k">Servicing</div><div class="b-v">${DD().servicingBriefHTML(p, f).replace(/<p class="small"><button[^]*?<\/p>/, '')}</div></div></section>
      ${f ? SD().servicingCheckHTML(p, f) : ''}`;
  }
  onWf('input', e => {
    const k = e.target.dataset && e.target.dataset.wf; if (!k) return;
    const w = whatIfs.find(x => x.id === wfCurrent); if (!w) return;
    delete w.fresh;   // edited: it stays when the result closes
    w[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? Math.max(0, +e.target.value || 0) : e.target.value;
    clearTimeout(w._t); w._t = setTimeout(() => { delete w._t; syncWhatIfs(); renderWhatIfOut(w); }, 250);
  });
  onWf('change', e => { if (e.target.dataset && (e.target.dataset.wf === 'include' || e.target.dataset.wf === 'phase')) e.target.dispatchEvent(new Event('input', { bubbles: true })); });
  onWf('click', e => {
    if (!e.target.closest('[data-wf-del]')) return;
    removeWhatIfs([wfCurrent]);
  });

  // A test site placed and closed without any change is cleared with its result (design audit,
  // Group 7): the test site no longer outlives the tool. Edited or counted ones stay (bottom bar).
  document.addEventListener('peel:tool-closed', () => {
    if (resultView !== 'whatif') return;
    const w = whatIfs.find(x => x.id === wfCurrent); resultView = null;
    if (w && w.fresh && !w.include) { whatIfs = whatIfs.filter(x => x !== w); syncWhatIfs(); }
  });

  // Boot init (SPLIT_MAP M31/R4): these ran at app.js eval time; the app
  // boot calls PeelSewerProfile.init() first to preserve ordering.
  function init() {
    App().state.whatifs = [];
    if (window.ResizeObserver) new ResizeObserver(() => MA().fitLegend()).observe(mapBottom);
    syncWhatIfs();
  }

  const api = {
    sewerProfile, tracePoint, showWhatIf, whatIfProject,
    getWhatIfs() { return whatIfs; },
    setWhatIfs(v) { whatIfs = v; },
    profMapOff, mapBottom, init,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSewerProfile = api;
})(typeof window !== 'undefined' ? window : globalThis);
