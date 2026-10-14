(function (root) {
'use strict';
  // Measure / buffer-select / test-site tools + ground elevation (PeelMeasure).
  const { $ } = window.PeelUtil;
  const A = window.PeelArcGIS;
  const map = window.PeelMapCore.map;
  const App = () => root.PeelApp;
  const MM = () => root.PeelMapMarkers;
  const AS = () => root.PeelAreaSelect;
  const AC = () => root.PeelAerialCheck;
  const CA = () => root.PeelCensusAreas;
  const DN = () => root.PeelDevNav;
  const SP = () => root.PeelSewerProfile;
  const WT = () => root.PeelWaterTrace;
  const EP = () => root.PeelExistPipes;
  const TB = () => root.PeelTopbar;
  const SD = () => root.PeelSvcData;
  // ---- Ground elevation: Mapzen / AWS Terrain Tiles (Terrarium PNG, open data, no key) ----------
  // Elevation (m) = R × 256 + G + B / 256 − 32768, at zoom 14 (~7 m pixels here). Sources: Canada's
  // CDEM and SRTM; good for grades over hundreds of metres, not for invert design.
  const ELEV_Z = 14, elevTiles = new Map();
  function elevTile(x, y) {
    const k = `${x}/${y}`; if (elevTiles.has(k)) return elevTiles.get(k);
    const pr = new Promise((ok, fail) => {
      const img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = () => { try { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.drawImage(img, 0, 0); ok(g.getImageData(0, 0, 256, 256).data); } catch (e) { fail(e); } };
      img.onerror = () => fail(new Error('elevation tile unavailable'));
      img.src = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${ELEV_Z}/${x}/${y}.png`;
    });
    elevTiles.set(k, pr); pr.catch(() => elevTiles.delete(k));
    return pr;
  }
  async function elevAt(lat, lng) {
    const n = 2 ** ELEV_Z, xf = (lng + 180) / 360 * n, lr = lat * Math.PI / 180, yf = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
    const x = Math.floor(xf), y = Math.floor(yf), px = Math.min(255, Math.floor((xf - x) * 256)), py = Math.min(255, Math.floor((yf - y) * 256));
    const d = await elevTile(x, y), i = (py * 256 + px) * 4;
    return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768;
  }
  // Elevations along a polyline ([lat, lng] points), sampled about every 25 m (up to 120 samples).
  async function elevProfile(pts) {
    const segs = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const d = map.distance(pts[i - 1], pts[i]); segs.push(d); tot += d; }
    const n = Math.max(2, Math.min(120, Math.round(tot / 25) + 1)), out = [];
    for (let k = 0; k < n; k++) {
      let t = tot * k / (n - 1), i = 0; while (i < segs.length - 1 && t > segs[i]) { t -= segs[i]; i++; }
      const f = segs[i] ? Math.min(1, t / segs[i]) : 0, a = pts[i], b = pts[i + 1] || pts[i];
      out.push({ d: tot * k / (n - 1), lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });
    }
    const z = await Promise.all(out.map(p => elevAt(p.lat, p.lng)));
    return out.map((p, i) => ({ ...p, z: z[i] }));
  }
  function profileSVG(prof, W = 300, H = 90) {
    // Pipes along the line (when looked up): sanitary invert (solid) and watermain at an assumed cover (dashed).
    const zs = prof.flatMap(p => [p.z, p.san ? p.san.inv : p.z, p.wat ? p.z - WM_COVER : p.z]);
    const lo = Math.floor(Math.min(...zs) - 1), hi = Math.ceil(Math.max(...zs) + 1), D = prof[prof.length - 1].d || 1;
    const X = d => 28 + d / D * (W - 34), Y = z => 6 + (1 - (z - lo) / (hi - lo || 1)) * (H - 22);
    const line = prof.map((p, i) => `${i ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(p.z).toFixed(1)}`).join('');
    // Runs of consecutive samples on a pipe, as separate paths.
    const runs = (get) => { let d = '', on = false; for (const p of prof) { const z = get(p); if (z == null) { on = false; continue; } d += `${on ? 'L' : 'M'}${X(p.d).toFixed(1)},${Y(z).toFixed(1)}`; on = true; } return d; };
    const san = runs(p => p.san ? p.san.inv : null), wat = runs(p => p.wat ? p.z - WM_COVER : null);
    const dots = (get, col) => prof.filter((p, i) => get(p) != null && get(prof[i - 1] || {}) == null && get(prof[i + 1] || {}) == null).map(p => `<circle cx="${X(p.d).toFixed(1)}" cy="${Y(get(p)).toFixed(1)}" r="2.6" fill="${col}"/>`).join('');
    return `<svg class="elev-svg" viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="Ground profile${san ? ' with sanitary sewer inverts' : ''}${wat ? ' and watermains' : ''}">
      <path d="${line}L${X(D)},${H - 16}L${X(0)},${H - 16}Z" fill="color-mix(in srgb, var(--accent) 18%, transparent)"/><path d="${line}" fill="none" stroke="var(--accent)" stroke-width="1.6"/>
      ${san ? `<path d="${san}" fill="none" stroke="${MM().EXIST_STYLE.sanitary.color}" stroke-width="2.2"/>${dots(p => p.san ? p.san.inv : null, MM().EXIST_STYLE.sanitary.color)}` : ''}
      ${wat ? `<path d="${wat}" fill="none" stroke="${MM().EXIST_STYLE.water.color}" stroke-width="1.8" stroke-dasharray="4 3"/>${dots(p => p.wat ? p.z - WM_COVER : null, MM().EXIST_STYLE.water.color)}` : ''}
      <g font-size="9" fill="var(--text-muted)"><text x="2" y="${Y(hi) + 4}">${hi} m</text><text x="2" y="${Y(lo)}">${lo} m</text><text x="${X(0)}" y="${H - 4}">0</text><text x="${X(D) - 2}" y="${H - 4}" text-anchor="end">${fmtDist(D)}</text></g></svg>`;
  }

  // ---- Measure, buffer select and test-site tools -------------------------------------------
  // Measure: tap points on the map for the distance along them; Buffer: select the shown
  // developments within a radius of the last point (adds to the selection, like the lasso).
  // Phase 3b: the measure / trace / test-a-site / select tools register with PeelTools
  // (js/tools.js); their prompts and controls live in the tool banner (bannerHTML), and
  // map clicks route through PeelTools.mapClick. The old .tool-panel is gone.
  const toolLayer = L.layerGroup().addTo(map);
  const tool = { mode: null, pts: [] };
  const metres = (a, b) => map.distance(a, b);
  const fmtDist = m => m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(2)} km`;
  function setTool(mode) {
    tool.mode = tool.mode === mode ? null : mode;
    tool.pts = []; toolLayer.clearLayers();
    AS().syncToolsBtn();
    map.getContainer().classList.toggle('tool-on', !!tool.mode);
    // The Select tool is the exception to the tool-on rule (markers ignore taps while a
    // tool is active): its tap mode must not swallow marker taps, which keep opening the
    // development; tap-select only adds developments near, but not under, the pointer.
    map.getContainer().classList.toggle('tool-select', tool.mode === 'select');
    if (tool.mode && AS().getLassoOn()) AS().setLasso(false);
    if (tool.mode && innerWidth <= 760) AC().closeDetail();
    if (typeof PeelTools !== 'undefined') PeelTools.sync(tool.mode);
  }
  const hasTools = () => typeof PeelTools !== 'undefined';
  // Selection results open in the Tool result pane (Peel › <title> in the trail);
  // when the framework is absent (tests, old builds) they fall back to #detail.
  function openSelectionResult(title, added) {
    CA().setDaContext(null);
    const sel = [...AS().selection.values()];
    DN().setCurrentProject(null);
    MM().highlight(null);
    if (hasTools()) PeelTools.openResult({ title, html: AS().selectionSummaryHTML(sel, added), reopen: () => openSelectionResult(title, added) });
    else AS().showSelection(added);
    TB().renderTrail();
  }
  function refreshMeasureBanner() {
    if (tool.mode === 'measure' && hasTools()) { PeelTools.banner(measureBannerHTML()); if (tool.pts.length) fillElev(tool.pts.slice()); }
  }
  function measureDist() { return tool.pts.reduce((t, p, i) => i ? t + metres(tool.pts[i - 1], p) : 0, 0); }
  function measureBannerHTML() {
    return `<strong>Measure</strong> ${tool.pts.length < 2 ? '<span class="muted">tap points on the map</span>' : `<span>${fmtDist(measureDist())}</span>`}
      ${tool.pts.length ? `<span class="pt-row">Select within <span class="seg">${[250, 500, 1000, 2000].map(r => `<button type="button" class="btn small" data-ptool-act="buffer:${r}">${fmtDist(r)}</button>`).join('')}</span> of the last point</span>` : ''}
      ${tool.pts.length ? '<span class="pt-row pt-elev" id="tp-elev"><span class="muted">Ground elevation…</span></span>' : ''}
      <span class="pt-row"><button type="button" class="btn small link" data-ptool-act="clear">Clear</button> <button type="button" class="btn small link" data-ptool-act="done">Done</button></span>`;
  }
  // The circle as a ring, so it draws and exports like a lasso area.
  function bufferSelect(center, r) {
    let added = 0;
    for (const p of App().state.filtered) if (p.lat != null && !AS().selection.has(p.key) && metres(center, [p.lat, p.lng]) <= r) { AS().selection.set(p.key, p); added++; }
    const ring = []; for (let i = 0; i <= 48; i++) { const t = i / 48 * 2 * Math.PI, dy = r * Math.cos(t) / 111320, dx = r * Math.sin(t) / (111320 * Math.cos(center.lat * Math.PI / 180)); ring.push([center.lng + dx, center.lat + dy]); }
    AS().selAreas.push(ring); AS().drawSelection();
    openSelectionResult('Selection', added);
  }
  // The Select tool: tap / lasso / box / radius sub-modes in the banner, one tool for
  // all the ways of picking developments.
  let selectSub = 'tap';           // tap | lasso | box | radius
  let selectRadius = null, selectRadiusM = 500;
  function refreshSelectBanner() { if (tool.mode === 'select' && hasTools()) PeelTools.banner(selectBannerHTML()); }
  function setSelectSub(sub) {
    selectSub = sub;
    if (sub === 'lasso' && !AS().getLassoOn()) AS().setLasso(true);
    if (sub !== 'lasso' && AS().getLassoOn()) AS().setLasso(false);
    if (sub !== 'radius') { selectRadius = null; toolLayer.clearLayers(); }
    refreshSelectBanner();
  }
  function selectBannerHTML() {
    const sub = (id, label) => `<button type="button" class="btn small${selectSub === id ? ' on' : ''}" data-ptool-act="sub:${id}" aria-pressed="${selectSub === id}">${label}</button>`;
    let mid = '';
    if (selectSub === 'tap') mid = '<span class="muted">tap near a development to add it · a tap on one opens it</span>';
    else if (selectSub === 'lasso') mid = `<span class="muted">${AS().getLassoOn() ? 'draw around the developments' : 'starting…'}</span>`;
    else if (selectSub === 'box') mid = '<span class="muted">hold Ctrl / ⌘ and drag a box on the map</span>';
    else if (selectSub === 'radius') mid = `<span class="muted">${selectRadius ? 'choose a radius' : 'tap the map to place the centre'}</span> <span class="seg">${[250, 500, 1000, 2000].map(r => `<button type="button" class="btn small${selectRadiusM === r ? ' on' : ''}" data-ptool-act="radius:${r}">${fmtDist(r)}</button>`).join('')}</span>`;
    return `<strong>Select</strong> <span class="seg" role="group" aria-label="Select mode">${sub('tap', 'Tap')}${sub('lasso', 'Lasso')}${sub('box', 'Box')}${sub('radius', 'Radius')}</span> ${mid}
      <span class="pt-row"><button type="button" class="btn small link" data-ptool-act="add">+ Add area</button>${AS().selection.size ? ' <button type="button" class="btn small link" data-ptool-act="clear">Clear</button>' : ''} <button type="button" class="btn small link" data-ptool-act="done">Done</button></span>`;
  }
  // Nearest shown development to a tap, with its pixel distance: ≤ 16 px means the tap
  // hit a development marker (whose own click handler opens it — left intact), so
  // tap-select only picks developments near, but not under, the pointer.
  function nearestShownDev(latlng) {
    const c = map.latLngToContainerPoint(latlng);
    let best = null, bd = Infinity;
    for (const p of App().state.filtered) {
      if (p.lat == null || !SD().devShown(p)) continue;
      const d = map.latLngToContainerPoint([p.lat, p.lng]);
      const px = Math.hypot(d.x - c.x, d.y - c.y);
      if (px < bd) { bd = px; best = p; }
    }
    return best ? { p: best, px: bd } : null;
  }
  // Trace: sewer to the plant, or water from the plant, from any point.
  let traceDir = 'sewer';
  function traceBannerHTML() {
    return `<strong>Trace</strong> <span class="seg">${['sewer', 'water'].map(d => `<button type="button" class="btn small${traceDir === d ? ' on' : ''}" data-ptool-act="dir:${d}" aria-pressed="${traceDir === d}">${d === 'sewer' ? 'Sewer' : 'Water'}</button>`).join('')}</span>
      <span class="muted">${traceDir === 'sewer' ? 'tap a development, or any point, to trace its sewer route to the plant' : 'tap a development, or any point, to trace its water supply route from the plant'}</span>
      <button type="button" class="btn small link" data-ptool-act="done">Cancel</button>`;
  }
  if (hasTools()) {
    PeelTools.register('measure', {
      title: 'Measure',
      hint: 'tap points on the map',
      bannerHTML: measureBannerHTML,
      onClick(latlng) {
        tool.pts.push(latlng);
        toolLayer.clearLayers();
        if (tool.pts.length > 1) L.polyline(tool.pts, { className: 'measure-line', interactive: false }).addTo(toolLayer);
        tool.pts.forEach((p, i) => L.circleMarker(p, { radius: 4, className: 'measure-pt', interactive: false }).bindTooltip(i ? fmtDist(tool.pts.slice(0, i + 1).reduce((t, q, j) => j ? t + metres(tool.pts[j - 1], q) : 0, 0)) : 'start', { permanent: i === tool.pts.length - 1 && i > 0, className: 'pt', direction: 'right' }).addTo(toolLayer));
        refreshMeasureBanner();
      },
      onBannerAct(act) {
        if (act === 'done') { setTool(null); return; }
        if (act === 'clear') { tool.pts = []; toolLayer.clearLayers(); refreshMeasureBanner(); return; }
        if (act.startsWith('buffer:') && tool.pts.length) bufferSelect(tool.pts[tool.pts.length - 1], +act.slice(7));
      },
      onDeactivate() { tool.pts = []; toolLayer.clearLayers(); },
    });
    PeelTools.register('trace', {
      title: 'Trace',
      hint: 'tap the map',
      bannerHTML: traceBannerHTML,
      onBannerAct(act) {
        if (act === 'done') { setTool(null); return; }
        if ((act === 'dir:sewer' || act === 'dir:water') && hasTools()) { traceDir = act.slice(4); PeelTools.banner(traceBannerHTML()); }
      },
      onClick(latlng) {
        if (traceDir === 'water') {
          setTool(null);
          const p = { key: `pt:${latlng.lat.toFixed(5)},${latlng.lng.toFixed(5)}`, lat: latlng.lat, lng: latlng.lng, title: 'Point on the map' };
          const head = ok => `<div class="head"><h3>Water route from this point</h3><div class="m">${latlng.lat.toFixed(5)}, ${latlng.lng.toFixed(5)}${ok ? '' : ' · the trace failed'}</div></div>`;
          PeelTools.openResult({ title: 'Water route from this point', html: `${head(true)}<p class="small muted">Tracing…</p>` });
          WT().traceWater(p).then(r => {
            PeelTools.openResult({ title: 'Water route from this point', html: `${head(!!r)}
              ${WT().waterTraceSummaryHTML(r)}<p class="small"><button type="button" class="btn small" data-tool-again="trace">Trace another point</button></p>` });
          }).catch(() => {
            PeelTools.openResult({ title: 'Water route from this point', html: `${head(false)}<p class="small muted">The water layers did not load — try again in a moment.</p><p class="small"><button type="button" class="btn small" data-tool-again="trace">Trace another point</button></p>` });
          });
        } else { setTool(null); SP().tracePoint(latlng); }
      },
    });
    PeelTools.register('whatif', {
      title: 'Test a site',
      hint: 'tap the map where the site is',
      bannerHTML: () => `<strong>Test a site</strong> <span class="muted">tap the map where the site is</span> <button type="button" class="btn small" data-ptool-act="batch">Batch from CSV</button> <button type="button" class="btn small link" data-ptool-act="done">Cancel</button>`,
      onBannerAct(act) {
        if (act === 'done') { setTool(null); return; }
        if (act === 'batch' && window.PeelToolBatch) PeelToolBatch.open();
      },
      onClick(latlng) { setTool(null); SP().showWhatIf(latlng); },
    });
    PeelTools.register('select', {
      title: 'Select',
      hint: 'tap near a development, or draw around them',
      bannerHTML: selectBannerHTML,
      onActivate() { setSelectSub('tap'); },
      onDeactivate() { if (AS().getLassoOn()) AS().setLasso(false); selectRadius = null; toolLayer.clearLayers(); },
      onBannerAct(act) {
        if (act === 'done') { setTool(null); return; }
        if (act === 'clear') { AS().clearSelection(); if (hasTools()) PeelTools.closeResult(); refreshSelectBanner(); return; }
        if (act === 'add') { AS().setLasso(true); refreshSelectBanner(); return; }
        if (act.startsWith('sub:')) { setSelectSub(act.slice(4)); return; }
        if (act.startsWith('radius:')) { selectRadiusM = +act.slice(7); if (selectRadius) bufferSelect(selectRadius, selectRadiusM); else refreshSelectBanner(); }
      },
      onClick(latlng) {
        if (selectSub === 'radius') {
          selectRadius = latlng;
          toolLayer.clearLayers();
          L.circle(latlng, { radius: selectRadiusM, className: 'sel-radius', interactive: false }).addTo(toolLayer);
          refreshSelectBanner();
          return;
        }
        if (selectSub !== 'tap') return; // lasso and box have their own machinery
        const hit = nearestShownDev(latlng);
        if (!hit || hit.px > 40) return;
        if (hit.px <= 16) return; // on a marker: its own click opened the development
        if (AS().selection.has(hit.p.key)) return;
        AS().selection.set(hit.p.key, hit.p); AS().drawSelection();
        openSelectionResult('Selection');
      },
    });
  }
  // ---- Pipes along a ground profile: Region of Peel sanitary sewer inverts and watermains ----
  // Each profile sample takes the nearest sanitary main within 12 m (its invert interpolated along
  // the pipe, upstream → downstream as digitized) and notes a watermain within 8 m. Watermain depth
  // is not published, so it is drawn at the Region's minimum cover (an assumption).
  const WM_COVER = 1.7;
  function nearOn(pt, g) {   // distance (m) from pt to polyline g and the fraction along it
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320;
    let best = { m: Infinity, t: 0 }, run = 0; const lens = [];
    for (let i = 1; i < g.length; i++) lens.push(Math.hypot((g[i][0] - g[i - 1][0]) * kx, (g[i][1] - g[i - 1][1]) * ky));
    const tot = lens.reduce((x, y) => x + y, 0) || 1;
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1][0] - pt[0]) * kx, ay = (g[i - 1][1] - pt[1]) * ky, bx = (g[i][0] - pt[0]) * kx, by = (g[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0;
      const m = Math.hypot(ax + t * dx, ay + t * dy);
      if (m < best.m) best = { m, t: (run + t * lens[i - 1]) / tot };
      run += lens[i - 1];
    }
    return best;
  }
  async function pipesAlong(prof) {
    const pad = 0.0004, lats = prof.map(p => p.lat), lngs = prof.map(p => p.lng);
    const bbox = { xmin: Math.min(...lngs) - pad, ymin: Math.min(...lats) - pad, xmax: Math.max(...lngs) + pad, ymax: Math.max(...lats) + pad };
    const q = async (S, f) => { const info = await A.layerInfo(S.url); return (await A.queryAll(S.url, info, { bbox, max: 3000, outFields: f })).features; };
    const lines = f => !f.geometry ? [] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    const [sf, ...wf] = await Promise.all([q(EP().EXIST.sanitary[0], 'FacilityID,Diameter,InvertUp,InvertDown,DepthUp,DepthDown,MainType'), ...EP().EXIST.water.map(S => q(S, 'Diameter'))]);
    const san = sf.flatMap(f => { const p = f.properties || {}; return p.InvertUp > 0 && p.InvertDown > 0 ? lines(f).map(g => ({ g, up: +p.InvertUp, dn: +p.InvertDown, d: +p.Diameter || 0, id: p.FacilityID || '', fm: /FM/.test(p.MainType || ''), dUp: +p.DepthUp || 0, dDn: +p.DepthDown || 0 })) : []; });
    const wat = wf.flat().flatMap(f => lines(f).map(g => ({ g, d: +(f.properties || {}).Diameter || 0 })));
    for (const p of prof) {
      const pt = [p.lng, p.lat];
      let bs = null; for (const s of san) { const n = nearOn(pt, s.g); if (n.m <= 12 && (!bs || n.m < bs.m)) bs = { ...n, s }; }
      p.san = bs ? { inv: bs.s.up + (bs.s.dn - bs.s.up) * bs.t, d: bs.s.d, id: bs.s.id, fm: bs.s.fm, m: bs.m } : null;
      let bw = null; for (const w of wat) { const n = nearOn(pt, w.g); if (n.m <= 8 && (!bw || n.m < bw.m)) bw = { ...n, w }; }
      p.wat = bw ? { d: bw.w.d, m: bw.m } : null;
    }
    return { san: san.length, wat: wat.length };
  }
  function pipeDepthHTML(prof) {
    const s = prof.filter(p => p.san && !p.san.fm), w = prof.filter(p => p.wat);
    const ids = [...new Set(s.map(p => p.san.id))], dia = [...new Set(s.map(p => p.san.d).filter(Boolean))].sort((a, b) => a - b);
    const dep = s.map(p => p.z - p.san.inv), wd = [...new Set(w.map(p => p.wat.d).filter(Boolean))].sort((a, b) => a - b);
    const r = (a, f = 1) => a.length ? (Math.min(...a) === Math.max(...a) ? Math.min(...a).toFixed(f) : `${Math.min(...a).toFixed(f)}–${Math.max(...a).toFixed(f)}`) : '';
    const sw = col => `<span class="lg-line" style="background:${col}"></span>`;
    return `<span class="pd-row">${sw(MM().EXIST_STYLE.sanitary.color)}${s.length ? `Sanitary sewer along ${Math.round(s.length / prof.length * 100)}% of the line (${ids.length} pipe${ids.length === 1 ? '' : 's'}${dia.length ? `, ${dia.map(d => `${d}`).join(' / ')} mm` : ''}): invert <strong>${r(s.map(p => p.san.inv))} m</strong>, depth to invert <strong>≈${r(dep)} m</strong>` : 'No sanitary sewer within 12 m of the line'}</span>
      <span class="pd-row">${sw(MM().EXIST_STYLE.water.color)}${w.length ? `Watermain along ${Math.round(w.length / prof.length * 100)}% of the line${wd.length ? ` (${wd.join(' / ')} mm)` : ''}: depth not published — drawn at ${WM_COVER} m cover (assumed)` : 'No watermain within 8 m of the line'}</span>`;
  }
  let elevSeq = 0;
  async function fillElev(pts) {
    const seq = ++elevSeq;
    try {
      if (pts.length === 1) { const z = await elevAt(pts[0].lat, pts[0].lng); if (seq === elevSeq && $('#tp-elev')) $('#tp-elev').innerHTML = `Ground <strong>${z.toFixed(1)} m</strong> <span class="muted">above sea level · tap another point for a profile</span>`; return; }
      const prof = await elevProfile(pts); if (seq !== elevSeq || !$('#tp-elev')) return;
      const a = prof[0].z, b = prof[prof.length - 1].z, D = prof[prof.length - 1].d, zs = prof.map(p => p.z);
      const head = `<span>Ground ${a.toFixed(1)} → ${b.toFixed(1)} m · ${b < a ? 'falls' : 'rises'} <strong>${Math.abs(b - a).toFixed(1)} m</strong> (${(Math.abs(b - a) / D * 100).toFixed(2)}%) · range ${Math.min(...zs).toFixed(0)}–${Math.max(...zs).toFixed(0)} m</span>`;
      $('#tp-elev').innerHTML = `${head}${profileSVG(prof)}<span class="muted small">Looking up sewers and watermains along the line…</span>`;
      let pipes = null; try { pipes = await pipesAlong(prof); } catch (e) { /* the pipe layers did not load */ }
      if (seq !== elevSeq || !$('#tp-elev')) return;
      $('#tp-elev').innerHTML = `${head}${profileSVG(prof, 300, pipes ? 120 : 90)}${pipes ? pipeDepthHTML(prof, pipes) : '<span class="muted small">Sewer and watermain layers did not load.</span>'}
        <span class="muted small">Ground: terrain tiles (CDEM / SRTM, ~7 m pixels, ±1–2 m), so depths are approximate. Sewer inverts: Region of Peel sanitary mains. Watermain depth is not published: shown at Peel's ${WM_COVER} m minimum cover (assumed).</span>`;
    } catch (e) { if (seq === elevSeq && $('#tp-elev')) $('#tp-elev').innerHTML = '<span class="muted">Ground elevation unavailable (terrain tiles did not load).</span>'; }
  }
  map.on('click', e => {
    // Phase 3b: registered tools (select, measure, trace, test-a-site, inspect point,
    // corridor select, units-fit) handle their own clicks; nothing else owns the click.
    if (typeof PeelTools !== 'undefined' && PeelTools.handles(tool.mode)) PeelTools.mapClick(tool.mode, e.latlng);
  });
  const getSelectSub = () => selectSub;
  const getTraceDir = () => traceDir;
  function setTraceDir(d) { traceDir = d; }

  // ---- Public contract ------------------------------------------------------------------
  const api = { tool, setTool, hasTools, metres, fmtDist, elevAt, elevProfile, setSelectSub, openSelectionResult, bufferSelect, nearestShownDev, getSelectSub, getTraceDir, setTraceDir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMeasure = api;
})(typeof window !== 'undefined' ? window : globalThis);
