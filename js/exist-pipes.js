/* Existing pipes — live Region/municipal GIS layers by map area, pipe labels,
 * Phase 6 extraction from js/app.js (app.js 7376-7651).
 * sewer-load estimates, age/material risk.
 */
(function (root) {
  'use strict';

  const A = window.PeelArcGIS;
  const D = window.PeelDemand;
  const { $, esc, fmtNum, roundPop, estTag, dot, token, store, uLs } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const SC = () => window.PeelSewerCap;
  const DI = () => window.PeelDcInfra;
  const Meas = () => window.PeelMeasure;
  const TS = () => window.PeelToolScope;
  const SCtx = () => window.PeelSiteContext;
  const DN = () => window.PeelDevNav;

  // ---- Existing pipes (live from the Region / municipal GIS, by map area) ----------------------
  // Region of Peel watermains and sanitary sewers; Mississauga and Brampton storm sewers and the
  // Region's storm mains. Drawn from street zoom, fetched by ~1 km tile and cached; tap a pipe for
  // its size, material and year. Development panel: the nearest existing mains to the site.
  const PEEL_FS = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
  const EXIST = {
    water: [{ url: `${PEEL_FS}/waterwastWater/FeatureServer/5`, f: 'Diameter,Material', src: 'Region of Peel' }, { url: `${PEEL_FS}/waterwastWater/FeatureServer/6`, f: 'Diameter,Material', src: 'Region of Peel' }],
    sanitary: [{ url: `${PEEL_FS}/waterwastWater/FeatureServer/10`, f: 'Diameter,Material,InstallationDate,Slope,MainType', src: 'Region of Peel' }],
    storm: [
      { url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/StormSegment/FeatureServer/0', f: 'DIAMETER,MATERIAL,INSTALLDAT', src: 'City of Mississauga' },
      { url: 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/2', f: 'HEIGHT,WIDTH,MATERIAL,SLOPE,SHAPE_PIPE,WATERSHED,SUBSHED', src: 'City of Brampton' },
      { url: `${PEEL_FS}/storm_infrastructure/FeatureServer/4`, f: 'Diameter,Material,MainType', src: 'Region of Peel' },
    ],
  };
  const existLayer = L.layerGroup().addTo(map);
  const existCache = new Map();      // `${kind}|${i}|${tile}` -> Promise<features>
  // Under the model's results (svcPane, 360): zoomed in, the live pipes are context and the
  // sewer screen's capacity colours stay on top of them.
  map.createPane('existPane', map.getPane('rotatePane') || undefined).style.zIndex = 355;
  const existRenderer = L.canvas({ pane: 'existPane', padding: 0.3 });
  // Attributes common to all sources.
  function pipeAttrs(kind, src, p) {
    const g = k => p[k] ?? p[k.toUpperCase()] ?? p[k.toLowerCase()];
    let d = g('Diameter') || g('DIAMETER') || 0;
    if (!d && (p.HEIGHT || p.WIDTH)) d = Math.max(p.HEIGHT || 0, p.WIDTH || 0);
    const yRaw = p.InstallationDate || p.INSTALLDAT;
    const year = yRaw && yRaw > -1e12 && yRaw < 4e12 ? new Date(yRaw).getUTCFullYear() : null;
    const slope = p.Slope || p.SLOPE;
    return { d: Math.round(d), mat: String(p.Material || p.MATERIAL || '').trim(), year, slope: slope > 0 && slope < 0.5 ? slope : (slope > 0.5 && slope < 50 ? slope / 100 : null), type: p.MainType || '', src, shed: [p.WATERSHED, p.SUBSHED].filter(x => x && String(x).trim()).join(' / ') };
  }
  const existText = (kind, a) => `${MM().EXIST_STYLE[kind].label}${a.d ? ` ${a.d} mm` : ''}${a.mat ? ` ${a.mat}` : ''}${a.year ? `, ${a.year}` : ''}${a.slope ? `, slope ${(a.slope * 100).toFixed(2)}%` : ''}${/FM/.test(a.type) ? ' (force main)' : ''}`;
  async function existTile(kind, i, tx, ty) {
    const key = `${kind}|${i}|${tx},${ty}`;
    if (existCache.has(key)) return existCache.get(key);
    const S = EXIST[kind][i];
    const pr = (async () => {
      const info = await A.layerInfo(S.url);
      const bbox = { xmin: tx * 0.01, ymin: ty * 0.01, xmax: (tx + 1) * 0.01, ymax: (ty + 1) * 0.01 };
      const { features } = await A.queryAll(S.url, info, { bbox, max: 4000, outFields: S.f });
      return features;
    })().catch(() => []);
    existCache.set(key, pr);
    return pr;
  }
  let existSeq = 0;
  // Pipe size labels: one per ~70 px of screen at the middle of each pipe, largest pipes first.
  function placePipeLabels(items, layer) {
    const taken = new Set(), b = map.getBounds();
    items.sort((x, y) => y.d - x.d);
    for (const it of items) {
      // The on-screen point nearest the middle of the pipe: each segment's midpoint and, for long
      // segments, points along it (long mains run past the edge of the view).
      let ll = null, best = Infinity;
      for (const ln of it.lines) for (let i = 1; i < ln.length; i++) {
        const mid = (ln.length - 1) / 2;
        for (const t of [0.5, 0.25, 0.75, 0.1, 0.9]) {
          const c = L.latLng(ln[i - 1][1] + (ln[i][1] - ln[i - 1][1]) * t, ln[i - 1][0] + (ln[i][0] - ln[i - 1][0]) * t);
          const score = Math.abs(i - 0.5 - mid) + Math.abs(t - 0.5);
          if (score < best && b.contains(c)) { best = score; ll = c; }
        }
      }
      if (!ll) continue;
      const pt = map.latLngToContainerPoint(ll), key = `${Math.round(pt.x / (it.text && it.text.length > 4 ? 110 : 70))},${Math.round(pt.y / 28)}`;
      if (taken.has(key)) continue; taken.add(key);
      L.marker(ll, { interactive: false, keyboard: false, icon: L.divIcon({ className: 'pipe-lbl', html: `<span style="--c:${it.color}">${it.text || it.d}</span>`, iconSize: null }) }).addTo(layer);
    }
  }
  async function renderExisting() {
    const seq = ++existSeq;
    existLayer.clearLayers();
    const kinds = Object.keys(MM().getExistOn()).filter(k => MM().getExistOn()[k]);
    const note = $('#exist-note');
    if (!kinds.length) { if (note) note.textContent = ''; return; }
    if (map.getZoom() < MM().EXIST_ZOOM) { if (note) note.textContent = 'Zoom in to see existing pipes'; return; }
    if (note) note.textContent = 'Loading existing pipes…';
    const b = map.getBounds();
    const tiles = [];
    for (let tx = Math.floor(b.getWest() / 0.01); tx <= Math.floor(b.getEast() / 0.01); tx++) for (let ty = Math.floor(b.getSouth() / 0.01); ty <= Math.floor(b.getNorth() / 0.01); ty++) tiles.push([tx, ty]);
    if (tiles.length > 30) { if (note) note.textContent = 'Zoom in further to see existing pipes'; return; }
    const seen = new Set(), lbls = [];
    await Promise.all(kinds.flatMap(kind => EXIST[kind].flatMap((S, i) => tiles.map(async ([tx, ty]) => {
      const feats = await existTile(kind, i, tx, ty);
      if (seq !== existSeq) return;
      for (const f of feats) {
        const id = `${kind}|${i}|${f.id ?? JSON.stringify(f.geometry.coordinates[0])}`;
        if (seen.has(id) || !f.geometry) continue; seen.add(id);
        const a = pipeAttrs(kind, S.src, f.properties || {});
        const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates];
        L.polyline(lines.map(l => l.map(([x, y]) => [y, x])), { renderer: existRenderer, color: MM().EXIST_STYLE[kind].color, weight: a.d >= 900 ? 6 : a.d >= 600 ? 5 : a.d >= 375 ? 3.5 : 2, opacity: 0.85, dashArray: /FM/.test(a.type) ? '6 4' : null })
          .bindTooltip(`<strong>${esc(existText(kind, a))}</strong><br><span class="muted">${esc(S.src)} (live)${kind === 'sanitary' ? ' · tap: what flows into it' : ''}</span>`, { sticky: true, className: 'pt' })
          .on('click', ev => { if (kind !== 'sanitary') return; L.DomEvent.stop(ev); existSewerLoads(lines, a); })
          .addTo(existLayer);
        // With the sewer capacity colours on, the existing sewers carry no labels: theirs would cover
        // the capacity labels (the size is in each pipe's tooltip).
        if (MM().pipeLbl && a.d && !(kind === 'sanitary' && MM().mstyle.cap === 'pipes')) lbls.push({ d: a.d, color: MM().EXIST_STYLE[kind].color, lines });
      }
    }))));
    if (seq === existSeq && MM().pipeLbl) placePipeLabels(lbls, existLayer);
    if (seq === existSeq && note) note.textContent = '';
  }
  map.on('moveend', () => { if (Object.values(MM().getExistOn()).some(Boolean)) renderExisting(); });
  // Tap an existing sanitary sewer: the same pipe in the network screen (300 mm+) with every
  // development draining through it; a smaller local sewer isn't in that network, so the
  // developments beside it and the 300 mm+ sewer nearest to it are given instead.
  async function existSewerLoads(lines, a) {
    await SC().loadSewers(); if (!MM().SEW.data) return;
    const pts = lines.flat(), mid = pts[Math.floor(pts.length / 2)];
    // Same pipe: a network pipe of the same diameter within 12 m of the segment's middle.
    let best = -1, bd = Infinity;
    const gx = Math.floor(mid[0] / 0.004), gy = Math.floor(mid[1] / 0.003);
    for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const k of MM().SEW.grid.get(`${gx + i},${gy + j}`) || []) {
      const p = MM().SEW.data.pipes[k]; if (a.d && Math.abs(p[0] - a.d) > 1) continue;
      const d = DI().dcDist(mid, SC().pipeCoords(p)); if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0 && bd <= 12) { SC().showPipeLoads(best); return; }
    // Local sewer: developments within 100 m of it, and the nearest 300 mm+ sewer.
    const near = App().state.projects.filter(p => p.lat != null && p.phase !== 'cancelled' && MM().svcLayerOf(p) !== 'existing' && lines.some(l => DI().dcDist([p.lng, p.lat], l) <= 100))
      .map(p => ({ p, e: D.estimate([p], App().state.criteria, 'all', App().jobsOf) })).filter(x => x.e.population > 0 || x.e.employment.jobs > 0)
      .sort((x, y) => y.e.combined.wastewater.wetPeak - x.e.combined.wastewater.wetPeak);
    const trunk = SC().nearestPipe(mid[0], mid[1], 600);
    existSewerOf = { lines, a };
    const eTitle = `${a.d ? `${a.d} mm` : ''} local sanitary sewer`;
    const html = `<div class="head"><h3>${eTitle}</h3><div class="m">${esc(existText('sanitary', a))} · Region of Peel (live)</div></div>
      ${TS().ptActions([TS().ptBtn('eloads', null, 'What loads this?', 'Re-run this analysis')])}
      <p class="small">Pipes under 300 mm are not in the network screen (where flow is traced pipe to pipe), so what drains into this one can't be traced exactly. ${trunk >= 0 ? `It feeds the sewer network nearby: the closest 300 mm+ sewer is a <button type="button" class="btn small link" data-pipe="${trunk}">${MM().SEW.data.pipes[trunk][0]} mm sewer</button> ${fmtNum(Math.round(DI().dcDist(mid, SC().pipeCoords(MM().SEW.data.pipes[trunk]))))} m away (what loads it, and how its flow is calculated).` : 'No 300 mm+ sewer within 600 m.'}</p>
      <table class="dt loads-table"><caption>${fmtNum(near.length)} development${near.length === 1 ? '' : 's'} since the census within 100 m of this sewer (likely to connect to it), largest peak wet first</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>Peak wet</th></tr></thead>
        <tbody>${near.slice(0, 40).map(r => `<tr class="ld-row" data-dev="${esc(r.p.key)}" tabindex="0"><td>${dot(r.p.phase)} ${esc(r.p.title)}<small><span class="lg-sw" style="--mk:${MM().layerColors()[MM().svcLayerOf(r.p)]}"></span>${esc(MM().LAYER_NAME[MM().svcLayerOf(r.p)])} · ${esc(r.p.municipality)}</small></td><td>${fmtNum(roundPop(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.e.combined.wastewater.wetPeak)}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">None within 100 m.</td></tr>'}</tbody></table>
      <p class="small muted">Peak wet weather at Peel design criteria for each development ${estTag}. Existing (2021 Census) flow in a local sewer isn't estimated: its catchment isn't traced.</p>`;
    TS().toolResult('eloads', eTitle, html, () => existSewerLoads(existSewerOf.lines, existSewerOf.a));
  }
  // Nearest existing main of each kind to a point, within r metres (live query, cached per site).
  const nearCache = new Map();
  function nearestExisting(lng, lat, r = 200) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (nearCache.has(key)) return nearCache.get(key);
    const pr = Promise.all(Object.entries(EXIST).map(async ([kind, srcs]) => {
      let best = null;
      for (const S of srcs) {
        try {
          const j = await A.fetchJSON(`${S.url}/query`, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: r, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields: S.f, outSR: 4326, returnGeometry: true, resultRecordCount: 50, f: 'json' });
          for (const f of j.features || []) {
            const paths = (f.geometry && f.geometry.paths) || [];
            const m = Math.min(...paths.map(pth => DI().dcDist([lng, lat], pth)));
            if (isFinite(m) && (!best || m < best.m)) best = { m, a: pipeAttrs(kind, S.src, f.attributes || {}) };
          }
        } catch (e) { /* source unavailable */ }
      }
      return [kind, best];
    })).then(Object.fromEntries);
    nearCache.set(key, pr);
    return pr;
  }
  if (Object.values(MM().getExistOn()).some(Boolean)) setTimeout(renderExisting, 1500);
  // Age and risk of the sanitary sewers on the development's path (first 3 km), from sewers.json.
  function pathAgeRisk(p) {
    if (!MM().SEW.data || p.lat == null) return null;
    const G = SC().sewerGrowth(); const k = G.devPipe.get(p) ?? SC().nearestPipe(p.lng, p.lat);
    if (k < 0) return null;
    let oldest = null, dist = 0, n = 0; const risky = [];
    for (let i = k, hop = 0; i >= 0 && hop < 2000 && dist <= 3000; i = MM().SEW.data.pipes[i][3], hop++) {
      const q = MM().SEW.data.pipes[i], c = q[10]; n++;
      dist += DI().dcM([c[0], c[1]], [c[c.length - 2], c[c.length - 1]]);
      if (q[7] && (!oldest || q[7] < oldest.y)) oldest = { y: q[7], i, d: q[0], mat: MM().SEW.data.materials[q[8]] || '' };
      if (MM().SEW.data.risks[q[9]] === 'MODERATE') risky.push(i);
    }
    return { oldest, risky, n };
  }
  const MAT_NOTE = { AC: 'asbestos cement', ACP: 'asbestos cement', VIT: 'vitrified clay', CONC: 'concrete', CONP: 'concrete', RCOP: 'reinforced concrete', PVC: 'PVC', DI: 'ductile iron', ST: 'steel', HDPE: 'HDPE', PE: 'polyethylene' };
  // Street names for points on pipes: reverse geocoding (ArcGIS World, then OpenStreetMap), cached.
  const streetCache = new Map();
  function streetAt(lat, lng) {
    const k = `${lat.toFixed(4)},${lng.toFixed(4)}`; if (streetCache.has(k)) return streetCache.get(k);
    const pr = (async () => {
      try {
        const j = await (await fetch(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${lng},${lat}&featureTypes=StreetAddress&outFields=Address,ShortLabel`)).json();
        const a = j && j.address, st = a && String(a.Address || a.ShortLabel || '').replace(/^[\d\s-]+[A-Za-z]?\s+(?=\D)/, '').trim();
        if (st) return st;
      } catch (e) { /* next */ }
      try {
        const j = await (await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })).json();
        if (j && j.address && j.address.road) return j.address.road;
      } catch (e) { /* offline */ }
      return '';
    })();
    streetCache.set(k, pr); return pr;
  }
  // Closest point on a path ([[lng, lat], …]) to a point, with its distance in metres.
  function closestOn(pt, g) {
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320; let best = { m: Infinity, at: g[0] };
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1][0] - pt[0]) * kx, ay = (g[i - 1][1] - pt[1]) * ky, bx = (g[i][0] - pt[0]) * kx, by = (g[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, m = Math.hypot(ax + t * dx, ay + t * dy);
      if (m < best.m) best = { m, at: [pt[0] + (ax + t * dx) / kx, pt[1] + (ay + t * dy) / ky] };
    }
    return best;
  }
  // Every existing main of each kind within r metres: nearest pieces first, named by street, and
  // pieces of the same main (same street, size, material) merged.
  const aroundCache = new Map();
  function existingAround(lng, lat, r) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)},${r}`; if (aroundCache.has(key)) return aroundCache.get(key);
    const pr = Promise.all(Object.entries(EXIST).map(async ([kind, srcs]) => {
      const items = [];
      for (const S of srcs) {
        try {
          const j = await A.fetchJSON(`${S.url}/query`, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: r, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields: S.f, outSR: 4326, returnGeometry: true, resultRecordCount: 200, f: 'json' });
          for (const f of j.features || []) {
            const paths = (f.geometry && f.geometry.paths) || []; if (!paths.length) continue;
            const c = paths.map(pth => closestOn([lng, lat], pth)).sort((a, b) => a.m - b.m)[0];
            if (c.m <= r) items.push({ m: c.m, at: c.at, paths, a: pipeAttrs(kind, S.src, f.attributes || {}) });
          }
        } catch (e) { /* source unavailable */ }
      }
      items.sort((a, b) => a.m - b.m);
      const near = items.slice(0, 16);
      await Promise.all(near.map(async it => { it.street = await streetAt(it.at[1], it.at[0]); }));
      const groups = new Map();
      for (const it of near) {
        const g = `${it.street}|${it.a.d}|${it.a.mat}|${/FM/.test(it.a.type)}`;
        const x = groups.get(g); if (!x) groups.set(g, { ...it, n: 1, paths: [...it.paths] }); else { x.n++; x.paths.push(...it.paths); }
      }
      return [kind, { list: [...groups.values()].sort((a, b) => a.m - b.m), more: Math.max(0, items.length - near.length) }];
    })).then(Object.fromEntries);
    aroundCache.set(key, pr); pr.catch(() => aroundCache.delete(key));
    return pr;
  }
  const exHL = L.layerGroup().addTo(map);
  let exGroups = {};
  // The mains around a development, each kind in its own section of the Servicing tab
  // (#dev-exist-water / -sanitary / -storm); the search radius buttons sit with the watermains.
  function fillExisting(p) {
    const box = k => $(`#dev-exist-${k}`);
    if (!box('water') || p.lat == null) return;
    const r = store.get('exR', 200);
    const rBtns = `<div class="ex-r"><span class="muted small">Within</span> ${[100, 200, 400].map(x => `<button type="button" class="btn small${x === r ? ' on' : ''}" data-exr="${x}">${x} m</button>`).join('')}</div>`;
    for (const k of ['water', 'sanitary', 'storm']) if (box(k)) box(k).innerHTML = `${k === 'water' ? rBtns : ''}<p class="small muted">Looking up the mains around the site…</p>`;
    existingAround(p.lng, p.lat, r).then(res => {
      if (DN().getCurrentProject() !== p || !box('water')) return;
      exGroups = res;
      const SHOW = 4, parts = {};
      const row = (k, g, i) => `<li><button type="button" class="btn small link" data-exhl="${k}|${i}" title="Show it on the map">${esc(existText(k, g.a).replace(MM().EXIST_STYLE[k].label, '').trim() || 'size not recorded')}</button>${g.street ? ` on <strong>${esc(g.street)}</strong>` : ''} · ${fmtNum(Math.round(g.m))} m <span class="muted">(${g.n > 1 ? `${g.n} pieces · ` : ''}${esc(g.a.src)})</span></li>`;
      for (const [k, v] of Object.entries(res)) {
        const L0 = v.list;
        parts[k] = (`<div class="ex-kind"><div class="ex-k"><i class="lg-line" style="background:${MM().EXIST_STYLE[k].color}"></i><strong>${MM().EXIST_STYLE[k].label}s</strong> <span class="muted small">${L0.length ? `${L0.length} within ${r} m${v.more ? ` · ${v.more} more pieces farther out` : ''}` : `none within ${r} m${k === 'storm' && p.municipality === 'Caledon' ? ' (Caledon storm sewers are not published)' : ''}`}</span></div>
          ${L0.length ? `<ul class="b-lines small">${L0.slice(0, SHOW).map((g, i) => row(k, g, i)).join('')}</ul>${L0.length > SHOW ? `<details class="ex-more"><summary class="small">${L0.length - SHOW} more</summary><ul class="b-lines small">${L0.slice(SHOW).map((g, i) => row(k, g, i + SHOW)).join('')}</ul></details>` : ''}` : ''}</div>`);
      }
      const ar = pathAgeRisk(p);
      let age = '';
      if (ar && (ar.oldest || ar.risky.length)) {
        const o = ar.oldest, yrs = o ? MM().THIS_YEAR - o.y : 0;
        age = (`<li${yrs >= 50 || ar.risky.length ? ' class="why-warn-t"' : ''}><strong>Sewer path age / risk</strong> <span class="muted">(first 3 km, ${fmtNum(ar.n)} pipes)</span>: ${o ? `oldest <button type="button" class="btn small link" data-pipe="${o.i}">${o.d} mm, ${o.y}</button>${o.mat ? ` ${esc(MAT_NOTE[o.mat] || o.mat)}` : ''} (${yrs} years)` : 'install years not recorded'}${ar.risky.length ? ` · ${ar.risky.length} rated moderate risk by the Region <button type="button" class="btn small link" data-pipe="${ar.risky[0]}">show</button>` : ' · none rated above low risk'}</li>`);
      }
      const note = '<p class="small muted">Live from the Region / municipal GIS, measured from the development\'s point (not the connection point). Tap a main to see it on the map.</p>';
      if (box('water')) box('water').innerHTML = `${rBtns}${parts.water || ''}${note}`;
      if (box('sanitary')) box('sanitary').innerHTML = `${parts.sanitary || ''}${age ? `<ul class="b-lines small">${age}</ul><p class="small muted">Age and risk rating from the Region's sanitary sewer records.</p>` : ''}`;
      if (box('storm')) box('storm').innerHTML = parts.storm || '';
    });
    SCtx().fillFire(p); SCtx().fillStorm(p); SCtx().fillGround(p);
  }

  document.addEventListener('click', e => {
    const rb = e.target.closest('[data-exr]');
    if (rb && DN().getCurrentProject()) { store.set('exR', +rb.dataset.exr); return fillExisting(DN().getCurrentProject()); }
    const h = e.target.closest('[data-exhl]'); if (!h) return;
    const [k, i] = h.dataset.exhl.split('|'), g = exGroups[k] && exGroups[k].list[+i]; if (!g) return;
    exHL.clearLayers();
    const ll = g.paths.map(pth => pth.map(([x, y]) => [y, x]));
    L.polyline(ll, { color: token('--hl-find'), weight: 12, opacity: 0.7, interactive: false }).addTo(exHL);
    L.polyline(ll, { color: token(MM().EXIST_STYLE[k].color), weight: 4, opacity: 1, interactive: false }).addTo(exHL);
    if (DN().getCurrentProject()) L.polyline([[DN().getCurrentProject().lat, DN().getCurrentProject().lng], [g.at[1], g.at[0]]], { color: token('--text-primary'), weight: 1.5, dashArray: '4 4', interactive: false }).bindTooltip(`${fmtNum(Math.round(g.m))} m`, { permanent: true, className: 'pt', direction: 'center' }).addTo(exHL);
    map.fitBounds(L.latLngBounds(ll.flat().concat(DN().getCurrentProject() ? [[DN().getCurrentProject().lat, DN().getCurrentProject().lng]] : [])), { maxZoom: 18, padding: [40, 40] });
    if (innerWidth <= 760) $('#detail').scrollTop = 0;
  });
  map.on('click', () => exHL.clearLayers());

  const api = {
    EXIST, PEEL_FS, pipeAttrs, renderExisting, existSewerLoads,
    nearestExisting, existingAround, placePipeLabels, fillExisting, exHL,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelExistPipes = api;
})(typeof window !== 'undefined' ? window : globalThis);
