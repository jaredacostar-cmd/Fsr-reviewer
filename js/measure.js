(function (root) {
'use strict';
  // Measure / buffer-select / test-site tools + ground elevation (PeelMeasure).
  const { $, esc, token } = window.PeelUtil;
  // A design token's value, for SVG / Leaflet attributes (which may not resolve var()).
  const tok = name => token(name) || `var(${name})`;
  const CN = () => root.PeelConstraints;
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
  // ---- Ground elevation: js/elevation.js (the province's lidar terrain model, terrain tiles where
  // it has no value). elevAt keeps the number-only contract; ground() gives the value with its source.
  const EL = () => root.PeelElevation;
  const PC = () => root.PeelProfileCore;
  const PV = () => root.PeelProfileView;
  const elevAt = (lat, lng) => EL().elevAt(lat, lng);
  const ground = (lat, lng) => EL().getGround(lat, lng);
  // Elevations along a polyline ([lat, lng] points), each with its source and the leg it lies on.
  // Spacing = max(5 m, the source's pixel, length / 600) (js/profile-core.js): at most 600 samples,
  // never finer than the data. The source at the middle of the line sets the pixel (lidar 0.5 m,
  // terrain tiles ~7 m here).
  async function elevProfile(pts) {
    const mid = pts[Math.floor(pts.length / 2)], probe = await ground(mid.lat, mid.lng).catch(() => null);
    const pixel = probe && probe.source === 'lidar' ? probe.res || 0.5 : PC().pixelSizeM(EL().TERRAIN_Z || 14, mid.lat);
    const out = PC().samplePoints(pts.map(p => ({ lat: p.lat, lng: p.lng })), pixel, (a, b) => map.distance([a.lat, a.lng], [b.lat, b.lng]));
    const g = await EL().getGroundMany(out);
    if (g.some(r => r.z == null)) throw new Error('elevation unavailable');
    return out.map((p, i) => ({ ...p, z: g[i].z, source: g[i].source, res: g[i].res, project: g[i].project }));
  }
  // The measured points: A (start, green) … the end (red), the ones between in distinct colours;
  // the same colour and letter on the map and in the profile.
  const PT_MID = [2, 3, 4, 5, 6, 1].map(k => `--mpt-${k}`);
  const ptColor = (i, n) => tok(i === 0 ? '--mpt-start' : i === n - 1 ? '--mpt-end' : PT_MID[(i - 1) % PT_MID.length]);
  const ptLetter = i => i < 26 ? String.fromCharCode(65 + i) : `P${i + 1}`;
  // Crossings along the line: streets (grey) and watercourses (blue), numbered in order.
  const XING = { street: { get color() { return tok('--xing-street'); }, label: 'Street' }, water: { get color() { return tok('--xing-water'); }, label: 'Watercourse' } };

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
  // A selection opens as a scope in the right panel (Peel › Selection in the trail), filtered to
  // the developments selected.
  function openSelectionResult(title, added) {
    CA().setDaContext(null);
    const sel = [...AS().selection.values()];
    DN().setCurrentProject(null);
    MM().highlight(null);
    PeelTools.openResult({ ref: 'sel:selection', title, html: AS().selectionSummaryHTML(sel, added), devKeys: sel.map(p => p.key), reopen: () => openSelectionResult(title, added) });
  }
  function refreshMeasureBanner() {
    if (tool.mode === 'measure' && hasTools()) { PeelTools.banner(measureBannerHTML()); if (tool.pts.length) fillElev(tool.pts.slice()); }
  }
  // Each point in its colour with its letter (and the distance so far after the first).
  function drawMeasurePts() {
    const n = tool.pts.length;
    tool.pts.forEach((p, i) => {
      const d = i ? fmtDist(tool.pts.slice(0, i + 1).reduce((t, q, j) => j ? t + metres(tool.pts[j - 1], q) : 0, 0)) : 'start';
      L.circleMarker(p, { radius: 6, className: 'mpt', fillColor: ptColor(i, n), color: tok('--sym-outline'), weight: 2, fillOpacity: 1, interactive: false })
        .bindTooltip(`<b style="color:${ptColor(i, n)}">${ptLetter(i)}</b> ${d}`, { permanent: true, direction: 'top', offset: [0, -6], className: 'pt mpt-lbl' }).addTo(toolLayer);
    });
  }
  function measureDist() { return tool.pts.reduce((t, p, i) => i ? t + metres(tool.pts[i - 1], p) : 0, 0); }
  // Measure along a line (tap points) or along a sewer (tap a sanitary main: manhole to manhole downstream).
  let measureSub = 'line';
  const subBtn = (id, label) => `<button type="button" class="btn small${measureSub === id ? ' on' : ''}" data-ptool-act="msub:${id}" aria-pressed="${measureSub === id}">${label}</button>`;
  function measureBannerHTML() {
    const seg = `<span class="seg" role="group" aria-label="Measure along">${subBtn('line', 'Line')}${subBtn('sewer', 'Along a sewer')}</span>`;
    if (measureSub === 'sewer') return `<strong>Measure</strong> ${seg} <span class="muted">tap a sanitary main to follow it downstream</span>
      <span class="pt-row pt-elev" id="tp-elev"></span>
      <span class="pt-row"><button type="button" class="btn small link" data-ptool-act="clear">Clear</button> <button type="button" class="btn small link" data-ptool-act="done">Done</button></span>`;
    return `<strong>Measure</strong> ${seg} ${tool.pts.length < 2 ? '<span class="muted">tap points on the map</span>' : `<span>${fmtDist(measureDist())}</span>`}
      ${tool.pts.length ? '<span class="pt-row muted">To select developments within a distance, use Select › Radius.</span>' : ''}
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
        if (measureSub === 'sewer') { sewerProfileAt(latlng); return; }
        tool.pts.push(latlng);
        toolLayer.clearLayers();
        if (tool.pts.length > 1) L.polyline(tool.pts, { className: 'measure-line', interactive: false }).addTo(toolLayer);
        drawMeasurePts();
        refreshMeasureBanner();
      },
      onBannerAct(act) {
        if (act === 'done') { setTool(null); return; }
        if (act === 'clear') { tool.pts = []; toolLayer.clearLayers(); xingLayer.clearLayers(); refreshMeasureBanner(); return; }
        if (act.startsWith('msub:')) { measureSub = act.slice(5); tool.pts = []; toolLayer.clearLayers(); xingLayer.clearLayers(); refreshMeasureBanner(); }
      },
      onDeactivate() { tool.pts = []; toolLayer.clearLayers(); xingLayer.clearLayers(); },
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
    return { san: san.length, wat: wat.length, mains: san };
  }
  function pipeDepthHTML(prof) {
    const s = prof.filter(p => p.san && !p.san.fm), w = prof.filter(p => p.wat);
    const ids = [...new Set(s.map(p => p.san.id))], dia = [...new Set(s.map(p => p.san.d).filter(Boolean))].sort((a, b) => a - b);
    const dep = s.map(p => p.z - p.san.inv), wd = [...new Set(w.map(p => p.wat.d).filter(Boolean))].sort((a, b) => a - b);
    const r = (a, f = 1) => a.length ? (Math.min(...a) === Math.max(...a) ? Math.min(...a).toFixed(f) : `${Math.min(...a).toFixed(f)}–${Math.max(...a).toFixed(f)}`) : '';
    const sw = col => `<span class="lg-line" style="background:${col}"></span>`;
    return `<span class="pd-row">${sw(tok(MM().EXIST_STYLE.sanitary.color))}<span>${s.length ? `Sanitary sewer along ${Math.round(s.length / prof.length * 100)}% of the line (${ids.length} pipe${ids.length === 1 ? '' : 's'}${dia.length ? `, ${dia.map(d => `${d}`).join(' / ')} mm` : ''}): invert <strong>${r(s.map(p => p.san.inv))} m</strong>, depth to invert <strong>≈${r(dep)} m</strong> <span class="muted">(ground − invert; ground from ${esc([...new Set(s.map(p => EL().shortLabel(p)))].join(' and '))})</span>` : 'No sanitary sewer within 12 m of the line'}</span></span>
      <span class="pd-row">${sw(tok(MM().EXIST_STYLE.water.color))}${w.length ? `Watermain along ${Math.round(w.length / prof.length * 100)}% of the line${wd.length ? ` (${wd.join(' / ')} mm)` : ''}: depth not published — drawn at ${WM_COVER} m cover (assumed)` : 'No watermain within 8 m of the line'}</span>`;
  }
  // A polite fetch for public APIs (Overpass): at most 3 tries, backing off 1 s, 2 s (or the server's
  // Retry-After) on HTTP 429, a 5xx or a network error.
  async function politeFetch(url, opts, tries = 3, wait = ms => new Promise(r => setTimeout(r, ms))) {
    for (let k = 1; ; k++) {
      let r = null;
      try { r = await fetch(url, opts); } catch (e) { if (k >= tries) throw e; }
      if (r && r.ok) return r;
      if (r && r.status !== 429 && r.status < 500) throw new Error(`HTTP ${r.status}`);
      if (k >= tries) throw new Error(r ? `HTTP ${r.status}` : 'network');
      const ra = r && +r.headers.get('Retry-After');
      await wait(ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * 2 ** (k - 1));
    }
  }
  // Streets and watercourses the line crosses (OpenStreetMap, or the provincial watercourses
  // when the constraint layers module has them): where, and their names.
  const xingCache = new Map();
  async function crossingsAlong(pts) {
    const lats = pts.map(p => p.lat), lngs = pts.map(p => p.lng), pad = 0.0005;
    const b = { s: Math.min(...lats) - pad, w: Math.min(...lngs) - pad, n: Math.max(...lats) + pad, e: Math.max(...lngs) + pad };
    if ((b.n - b.s) * (b.e - b.w) > 0.02) return null;   // a line longer than ~15 km: too much to fetch
    const key = [b.s, b.w, b.n, b.e].map(v => v.toFixed(4)).join(',');
    if (!xingCache.has(key)) xingCache.set(key, (async () => {
      const bb = `${b.s},${b.w},${b.n},${b.e}`;
      const ql = `[out:json][timeout:25];(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|motorway_link|trunk_link|primary_link|secondary_link)$"](${bb});way["waterway"~"^(river|stream|canal|drain|ditch|brook)$"](${bb}););out geom tags;`;
      const r = await politeFetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: 'data=' + encodeURIComponent(ql), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      const j = await r.json();
      const lines = (j.elements || []).filter(e => e.geometry).map(e => ({ kind: e.tags.waterway ? 'water' : 'street', name: e.tags.name || e.tags.ref || '', g: e.geometry.map(q => [q.lon, q.lat]) }));
      // The provincial watercourses (Ontario Hydro Network) replace OSM's when they loaded.
      const ohn = CN() && CN().watercoursesIn ? await CN().watercoursesIn({ xmin: b.w, ymin: b.s, xmax: b.e, ymax: b.n }).catch(() => null) : null;
      return ohn && ohn.length ? [...lines.filter(l => l.kind !== 'water'), ...ohn.map(w => ({ kind: 'water', name: w.name || '', g: w.g }))] : lines;
    })().catch(e => { xingCache.delete(key); throw e; }));
    const lines = await xingCache.get(key);
    // Segment intersections in a local metric frame; distance along the measured line.
    const kx = 111320 * Math.cos(pts[0].lat * Math.PI / 180), ky = 111320, P = ([x, y]) => [x * kx, y * ky];
    const out = []; let run = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = P([pts[i - 1].lng, pts[i - 1].lat]), c = P([pts[i].lng, pts[i].lat]), len = Math.hypot(c[0] - a[0], c[1] - a[1]);
      for (const ln of lines) for (let k = 1; k < ln.g.length; k++) {
        const p = P(ln.g[k - 1]), q = P(ln.g[k]);
        const r = [c[0] - a[0], c[1] - a[1]], sv = [q[0] - p[0], q[1] - p[1]], den = r[0] * sv[1] - r[1] * sv[0];
        if (!den) continue;
        const t = ((p[0] - a[0]) * sv[1] - (p[1] - a[1]) * sv[0]) / den, u = ((p[0] - a[0]) * r[1] - (p[1] - a[1]) * r[0]) / den;
        if (t < 0 || t > 1 || u < 0 || u > 1) continue;
        out.push({ kind: ln.kind, name: ln.name, d: run + t * len, lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t });
      }
      run += len;
    }
    // One crossing per street / watercourse within 25 m (a divided road, a road drawn in pieces).
    out.sort((x, y) => x.d - y.d);
    return out.filter((x, i) => !out.slice(0, i).some(y => y.kind === x.kind && y.name === x.name && x.d - y.d < 25));
  }
  function crossingsHTML(xs) {
    if (!xs.length) return '<span class="pd-row muted">No streets or watercourses crossed</span>';
    return `<span class="pd-row xing-list">${xs.map((x, k) => `<span class="xing"><b style="color:${XING[x.kind].color}">${k + 1}</b> ${esc(x.name || (x.kind === 'water' ? 'Unnamed watercourse' : 'Unnamed street'))} <span class="muted">${x.kind === 'water' ? '≈ ' : ''}${fmtDist(x.d)}</span></span>`).join('')}</span>`;
  }
  // Crossing labels on the map.
  const xingLayer = L.layerGroup().addTo(map);
  function drawCrossings(xs) {
    xingLayer.clearLayers();
    xs.forEach((x, k) => L.circleMarker([x.lat, x.lng], { radius: 4, color: XING[x.kind].color, weight: 2, fillColor: XING[x.kind].color, fillOpacity: 0.9, interactive: false })
      .bindTooltip(`<b>${k + 1}</b> ${esc(x.name || (x.kind === 'water' ? 'Watercourse' : 'Street'))}`, { permanent: true, direction: 'right', offset: [5, 0], className: `pt xing-lbl xing-${x.kind}` }).addTo(xingLayer));
  }
  // Where along the line each source applies: one entry per run, so the label changes at the
  // edge of the lidar coverage.
  function sourceRunsHTML(prof) {
    const runs = EL().sourceRuns(prof);
    return `<span class="pd-row elev-src" data-runs="${runs.length}">${runs.map(r => `<span class="elev-run elev-${r.source || 'none'}">${esc(r.label)}${r.project ? ` (${esc(r.project)})` : ''}${runs.length > 1 ? ` <span class="muted">${fmtDist(r.from)}–${fmtDist(r.to)}</span>` : ''}</span>`).join(' · ')}</span>`;
  }
  let elevSeq = 0;
  // The accuracy label: the dominant source over the line, from the validation table (never
  // hard-coded); lidar names its project and year.
  function accuracyOf(prof) {
    const lid = prof.filter(p => p.source === 'lidar'), src = lid.length >= prof.length / 2 ? 'lidar' : 'terrain';
    const mid = prof[Math.floor(prof.length / 2)], proj = (lid[0] || {}).project || null;
    const year = proj && (String(proj).match(/(19|20)\d\d/) || [])[0];
    return PC().accuracyLabel(PV().getTable(), mid.lat, mid.lng, src, { project: proj, year: year ? +year : null }).text;
  }
  async function fillElev(pts) {
    const seq = ++elevSeq;
    try {
      if (pts.length === 1) {
        const r = await ground(pts[0].lat, pts[0].lng); if (r.z == null) throw new Error('unavailable');
        await PV().loadTable();
        if (seq === elevSeq && $('#tp-elev')) $('#tp-elev').innerHTML = `Ground <strong>${r.z.toFixed(1)} m</strong> <span class="muted">above sea level · ${esc(r.label)} · tap another point for a profile</span><span class="pd-row muted small">${esc(PC().accuracyLabel(PV().getTable(), pts[0].lat, pts[0].lng, r.source, { project: r.project }).text)}</span>`;
        return;
      }
      const [raw] = await Promise.all([elevProfile(pts), PV().loadTable()]); if (seq !== elevSeq || !$('#tp-elev')) return;
      let cum = 0; const marks = pts.map((p, i) => { if (i) cum += map.distance(pts[i - 1], p); return { d: cum, c: ptColor(i, pts.length), l: ptLetter(i) }; });
      const colors = { san: tok(MM().EXIST_STYLE.sanitary.color), wat: tok(MM().EXIST_STYLE.water.color), xing: { street: XING.street.color, water: XING.water.color } };
      const headOf = prof => { const a = prof[0].z, b = prof[prof.length - 1].z, D = prof[prof.length - 1].d, zs = prof.map(p => p.z); return `<span>Ground ${a.toFixed(1)} → ${b.toFixed(1)} m · ${b < a ? 'falls' : 'rises'} <strong>${Math.abs(b - a).toFixed(1)} m</strong> (${(Math.abs(b - a) / D * 100).toFixed(2)}%) · range ${Math.min(...zs).toFixed(0)}–${Math.max(...zs).toFixed(0)} m · ${raw.length} samples</span>`; };
      const accuracy = accuracyOf(raw);
      const base = { prof: raw.map(p => ({ ...p, zRaw: p.z })), marks, xings: [], manholes: [], colors, wmCover: WM_COVER, sourcesNote: EL().sourcesNote(raw), accuracy };
      PV().render($('#tp-elev'), { ...base, head: headOf(raw), tail: `${sourceRunsHTML(raw)}<span class="pd-row muted small">${esc(accuracy)}</span><span class="muted small">Looking up sewers, manholes, watermains, streets and watercourses along the line…</span>` });
      const [pipes, xs] = await Promise.all([pipesAlong(raw).catch(() => null), crossingsAlong(pts).catch(() => undefined)]);
      if (seq !== elevSeq || !$('#tp-elev')) return;
      drawCrossings(xs || []);
      // Peel manhole ground (invert + published depth) within 15 m of the line, and the DEM corrected
      // between manholes no more than 150 m apart (never extrapolated; the raw value kept).
      const mid = raw[Math.floor(raw.length / 2)], dat = PV().datumShift(mid.lat, mid.lng);
      const mhs = pipes ? PC().matchManholes(raw, PC().manholesFromMains(pipes.mains.map(m => ({ id: m.id, g: m.g, up: m.up, dn: m.dn, dUp: m.dUp, dDn: m.dDn, fm: m.fm })))) : [];
      const corr = PC().correct(raw, mhs, { shift: dat.shift });
      const prof = corr.prof.map((p, i) => ({ ...p, san: raw[i].san, wat: raw[i].wat }));
      const nCorr = prof.filter(p => p.corrected).length;
      const corrNote = mhs.length ? `${mhs.length} Peel manhole${mhs.length === 1 ? '' : 's'} within ${PC().MANHOLE_MATCH_M} m of the line (ground = invert + published depth); ${nCorr ? `the ground is corrected to them over ${Math.round(nCorr / prof.length * 100)}% of the line (between manholes no more than ${PC().CORRECT_SPAN_M} m apart; never extrapolated)` : `none close enough together (≤ ${PC().CORRECT_SPAN_M} m) to correct between`}. ${dat.note}` : `No Peel manhole with a published depth within ${PC().MANHOLE_MATCH_M} m of the line: the ground is the DEM, uncorrected.`;
      PV().render($('#tp-elev'), { ...base, prof, manholes: corr.manholes, spans: corr.spans, xings: xs || [], pipes, datumNote: dat.note, head: headOf(prof),
        tail: `<span class="pd-row mpt-key">${marks.map(m => `<span><i style="background:${m.c}"></i>${m.l}${m.d ? ` ${fmtDist(m.d)}` : ''}</span>`).join('')}</span>
          ${xs === null ? '<span class="pd-row muted">Line too long to look up crossings</span>' : xs ? crossingsHTML(xs) : '<span class="pd-row muted">Streets and watercourses did not load.</span>'}
          ${pipes ? pipeDepthHTML(prof, pipes) : '<span class="muted small">Sewer and watermain layers did not load.</span>'}
          <span class="pd-row small">${esc(corrNote)}</span>
          ${sourceRunsHTML(raw)}<span class="pd-row muted small">${esc(accuracy)}</span><span class="muted small">${esc(EL().sourcesNote(raw))}${raw.some(p => p.source === 'terrain') ? ' Depths over the terrain-tile stretch are approximate.' : ''} Sewer inverts and depths: Region of Peel sanitary mains. Watermain depth is not published: shown at Peel's ${WM_COVER} m minimum cover (assumed). Streets: OpenStreetMap. Watercourses: ${CN() && CN().watercourseSource ? CN().watercourseSource() : 'OpenStreetMap'}.</span>` });
    } catch (e) { if (seq === elevSeq && $('#tp-elev')) $('#tp-elev').innerHTML = '<span class="muted">Ground elevation unavailable (neither the lidar service nor the terrain tiles answered).</span>'; }
  }
  // ---- Profile along a sewer: from the main nearest the tap, downstream manhole to manhole ----------
  // Peel's mains are digitized upstream → downstream; the next main starts within 1.5 m of the last
  // one's downstream end. Stops at 40 pipes or 3 km, or where no gravity main continues.
  const SEWER_FIELDS = 'FacilityID,Diameter,InvertUp,InvertDown,DepthUp,DepthDown,MainType';
  async function mainsNear(lat, lng, r) {
    const S = EP().EXIST.sanitary[0], info = await A.layerInfo(S.url);
    const dy = r / 111320, dx = r / (111320 * Math.cos(lat * Math.PI / 180));
    const fs = (await A.queryAll(S.url, info, { bbox: { xmin: lng - dx, ymin: lat - dy, xmax: lng + dx, ymax: lat + dy }, max: 400, outFields: SEWER_FIELDS })).features;
    const lines = f => !f.geometry ? [] : f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
    return fs.flatMap(f => { const p = f.properties || {}; return lines(f).map(g => ({ g, id: p.FacilityID || '', up: +p.InvertUp || null, dn: +p.InvertDown || null, dUp: +p.DepthUp || 0, dDn: +p.DepthDown || 0, d: +p.Diameter || 0, fm: /FM/.test(p.MainType || '') })); });
  }
  const lenOf = g => g.reduce((t, q, i) => (i ? t + PC().haversine({ lat: g[i - 1][1], lng: g[i - 1][0] }, { lat: q[1], lng: q[0] }) : 0), 0);
  async function sewerWalk(ll, maxPipes = 40, maxM = 3000) {
    const near = (await mainsNear(ll.lat, ll.lng, 30)).filter(m => !m.fm);
    let best = null; for (const m of near) { const n = nearOn([ll.lng, ll.lat], m.g); if (n.m <= 30 && (!best || n.m < best.n.m)) best = { m, n }; }
    if (!best) return { route: [], stopped: 'no sanitary main within 30 m' };
    const route = [best.m], seen = new Set([best.m.g.map(c => c.join()).join(';')]); let total = lenOf(best.m.g), stopped = null;
    while (true) {
      if (route.length >= maxPipes) { stopped = `stopped after ${maxPipes} pipes`; break; }
      if (total >= maxM) { stopped = `stopped after ${fmtDist(maxM)}`; break; }
      const end = route[route.length - 1].g[route[route.length - 1].g.length - 1];
      const next = (await mainsNear(end[1], end[0], 4)).filter(m => !m.fm && !seen.has(m.g.map(c => c.join()).join(';')) && PC().haversine({ lat: m.g[0][1], lng: m.g[0][0] }, { lat: end[1], lng: end[0] }) <= 1.5);
      if (!next.length) { stopped = route.length > 1 ? 'no gravity main continues downstream (a pumping station, a force main or the edge of the data)' : 'no downstream main joins this one'; break; }
      next.sort((a, b) => b.d - a.d || (a.up || 0) - (b.up || 0));
      route.push(next[0]); seen.add(next[0].g.map(c => c.join()).join(';')); total += lenOf(next[0].g);
    }
    return { route: route.map(m => ({ ...m, len: lenOf(m.g) })), stopped };
  }
  let sewerSeq = 0;
  async function sewerProfileAt(ll) {
    const seq = ++sewerSeq, el = () => $('#tp-elev');
    toolLayer.clearLayers();
    if (el()) el().innerHTML = '<span class="muted">Following the sewer downstream…</span>';
    try {
      const [{ route, stopped }] = await Promise.all([sewerWalk(ll), PV().loadTable()]);
      if (seq !== sewerSeq || !el()) return;
      if (route.length) {
        L.polyline(route.map(m => m.g.map(([x, y]) => [y, x])), { className: 'measure-line', interactive: false }).addTo(toolLayer);
        // The raw DEM at each manhole, for comparison (lidar / terrain tiles; not corrected).
        const pts = route.flatMap(m => [{ lat: m.g[0][1], lng: m.g[0][0] }, { lat: m.g[m.g.length - 1][1], lng: m.g[m.g.length - 1][0] }]);
        const g = await EL().getGroundMany(pts).catch(() => null);
        route.forEach((m, i) => { if (g) { m.demUp = g[2 * i] && g[2 * i].z; m.demDn = g[2 * i + 1] && g[2 * i + 1].z; } });
      }
      if (seq !== sewerSeq || !el()) return;
      const dat = PV().datumShift(ll.lat, ll.lng);
      el().innerHTML = PV().sewerHTML(route, { stopped, sanColor: tok(MM().EXIST_STYLE.sanitary.color), datumNote: dat.note });
    } catch (e) { if (seq === sewerSeq && el()) el().innerHTML = '<span class="muted">The sanitary mains did not load — try again in a moment.</span>'; }
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
  const api = { politeFetch, sewerWalk, tool, setTool, hasTools, metres, fmtDist, elevAt, elevProfile, setSelectSub, openSelectionResult, bufferSelect, nearestShownDev, getSelectSub, getTraceDir, setTraceDir };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMeasure = api;
})(typeof window !== 'undefined' ? window : globalThis);
