(function (root) {
'use strict';
  // ---- Time Box (PeelTimeBox): Part 3 of the measure / 3D / Time Box brief ------------------------
  // Drag a box on the map; the Esri Wayback releases are checked for imagery that changed inside
  // it (tile hashes, bisected, at most 6 requests in flight, cancellable, cached per box and zoom),
  // keeping at most one release per year. A year slider (with play) shows that imagery inside the
  // box only, with the applications in the box filed by the end of that year; a swipe compares two
  // years. The arithmetic is js/timebox-core.js; the imagery source is its WAYBACK interface.
  const { $, esc, token, store } = root.PeelUtil;
  const C = () => root.PeelTimeBoxCore, MC = () => root.PeelMapCore, App = () => root.PeelApp;
  const TL = () => root.PeelTimelapse, PH = () => root.PeelPhases, DN = () => root.PeelDevNav;
  const L = root.L, map = MC() && MC().map;
  if (!L || !map || !root.PeelTools) return;
  const SRC = () => C().WAYBACK;
  const PLAY_MS = 1500;
  const CACHE_MAX = 20;
  const tok = n => token(n) || 'gray';

  const S = {
    stage: 'idle',        // idle → drawing → checking → ready
    box: null,            // [w, s, e, n]: the bbox of quad, for tiles and the cache key
    quad: null,           // the box as dragged on screen: 4 corners (top-left, top-right, bottom-right, bottom-left) as latlngs
    rect: null, startCP: null,
    releases: null,       // all Wayback releases
    years: [],            // one release per year with distinct imagery in the box
    note: '',             // how the years were found (or why not)
    idx: 0, cmpIdx: 0, compare: false, swipe: 0.5,
    playing: null, ac: null, progress: null,
    layerA: null, layerB: null, apps: null,
  };
  const memCache = new Map();

  // ---- Panes, clipped to the box -----------------------------------------------------------------
  function pane(name, z) {
    if (!map.getPane(name)) { const p = map.createPane(name, map.getPane('rotatePane') || undefined); p.style.zIndex = z; p.style.pointerEvents = 'none'; }
    return map.getPane(name);
  }
  // The panes sit in the map's (rotating) pane, so the clip is the box's four corners in layer
  // points: it stays on the box whatever the map's bearing. The swipe splits the box along its own
  // top and bottom edges.
  const lerp = (a, b, t) => L.point(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const polyCSS = pts => `polygon(${pts.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(', ')})`;
  let clipQueued = false;
  function clip() { if (!clipQueued) { clipQueued = true; requestAnimationFrame(() => { clipQueued = false; clipNow(); }); } }
  function clipNow() {
    if (!S.quad) return;
    const [A, B, Cc, D] = S.quad.map(ll => map.latLngToLayerPoint(ll));
    const s = S.compare ? S.swipe : 1, T = lerp(A, B, s), Bm = lerp(D, Cc, s);
    pane('tbA', 240).style.clipPath = polyCSS([A, T, Bm, D]);
    pane('tbB', 239).style.clipPath = S.compare ? polyCSS([T, B, Cc, Bm]) : 'polygon(0 0, 0 0, 0 0)';
    const h = $('#tb-swipe');
    if (h) {
      h.hidden = !S.compare; if (!S.compare) return;
      const ct = map.latLngToContainerPoint(map.layerPointToLatLng(T)), cb = map.latLngToContainerPoint(map.layerPointToLatLng(Bm));
      const len = Math.hypot(cb.x - ct.x, cb.y - ct.y), ang = Math.atan2(cb.y - ct.y, cb.x - ct.x) * 180 / Math.PI - 90;
      h.style.left = `${(ct.x + cb.x) / 2}px`; h.style.top = `${(ct.y + cb.y) / 2}px`; h.style.height = `${len}px`;
      h.style.transform = `translate(-50%, -50%) rotate(${ang.toFixed(2)}deg)`;
    }
  }
  map.on('move zoom zoomend viewreset resize rotate', clip);

  // ---- Imagery layers ----------------------------------------------------------------------------
  function imagery(rel, paneName) {
    const t = SRC().leafletTemplate(rel);
    const [w, s, e, n] = S.box;
    return L.tileLayer(t, { pane: paneName, bounds: L.latLngBounds([[s, w], [n, e]]), maxZoom: 21, maxNativeZoom: 19, crossOrigin: true, attribution: `${SRC().attribution}, release ${rel.date}` });
  }
  function showYear() {
    const A = S.years[S.idx], B = S.years[S.cmpIdx];
    if (S.layerA) map.removeLayer(S.layerA);
    if (S.layerB) { map.removeLayer(S.layerB); S.layerB = null; }
    if (!A) return;
    pane('tbA', 240); pane('tbB', 239);
    S.layerA = imagery(A, 'tbA').addTo(map);
    el.classList.add('tb-active');
    if (S.compare && B) S.layerB = imagery(B, 'tbB').addTo(map);
    clip(); drawApps(); updateBanner();
  }

  // ---- Applications in the box, filed by the end of the year -------------------------------------
  function drawApps() {
    if (!S.apps) S.apps = L.layerGroup().addTo(map);
    S.apps.clearLayers();
    const A = S.years[S.idx]; if (!A || !S.box) return;
    const list = (App() && App().state && App().state.projects) || [];
    const r = C().applicationsAsOf(list, S.box, A.year, S.quad.map(ll => [ll.lng, ll.lat]));
    pane('tbApps', 670).style.pointerEvents = 'auto'; pane('tbTip', 700);
    const phaseAt = p => { try { return (TL() && TL().phaseAsOfYear && TL().phaseAsOfYear(p, A.year)) || p.phase; } catch (e) { return p.phase; } };
    const label = k => (PH() && PH().PHASE_BY_KEY && PH().PHASE_BY_KEY[k] && PH().PHASE_BY_KEY[k].label) || k;
    const fmt = t => new Date(t).toISOString().slice(0, 10);
    for (const { p, f } of r.shown) {
      const ph = phaseAt(p), c = tok(`--ph-${ph}`);
      L.circleMarker([p.lat, p.lng], { pane: 'tbApps', radius: 6, color: tok('--sym-outline'), weight: 1.5, fillColor: c, fillOpacity: 0.95 })
        .bindTooltip(`<b>${esc(p.title || '')}</b><br>${esc(label(ph))} at the end of ${A.year}<br>${f.basis === 'filed' ? `Filed ${fmt(f.time)}` : `Filed on or before ${fmt(f.time)} (first dated milestone)`}`, { direction: 'top', pane: 'tbTip' })
        .on('click', () => { if (DN() && DN().showDetail) DN().showDetail(p); }).addTo(S.apps);
    }
    for (const { p } of r.unknown) {
      L.circleMarker([p.lat, p.lng], { pane: 'tbApps', radius: 6, color: tok('--text-primary'), weight: 1.5, dashArray: '2 2', fillColor: tok('--surface-1'), fillOpacity: 0.6 })
        .bindTooltip(`<b>${esc(p.title || '')}</b><br>Filing date unknown: shown in every year`, { direction: 'top', pane: 'tbTip' })
        .on('click', () => { if (DN() && DN().showDetail) DN().showDetail(p); }).addTo(S.apps);
    }
    S.appCounts = { shown: r.shown.length, unknown: r.unknown.length, later: r.later.length };
  }

  // ---- Releases and the check --------------------------------------------------------------------
  async function getReleases(signal) {
    if (S.releases) return S.releases;
    const cached = store.get('tbReleases', null);
    if (cached && cached.at && Date.now() - cached.at < 864e5 && cached.list && cached.list.length) return (S.releases = cached.list);
    let list = [];
    try { const r = await fetch(SRC().capabilitiesURL, { signal }); if (r.ok) list = SRC().parse(await r.text()); } catch (e) { if (signal && signal.aborted) throw e; }
    if (!list.length) { try { const r = await fetch(SRC().configURL, { signal }); if (r.ok) list = SRC().parseConfig(await r.json()); } catch (e) { if (signal && signal.aborted) throw e; } }
    if (!list.length) throw new Error('The Wayback release list did not load.');
    store.set('tbReleases', { at: Date.now(), list });
    return (S.releases = list);
  }
  async function check() {
    if (S.ac) S.ac.abort();
    const ac = S.ac = new AbortController();
    S.stage = 'checking'; S.progress = { done: 0, total: 0 }; S.years = []; renderBanner();
    try {
      const rels = await getReleases(ac.signal);
      const z = C().chooseZoom(S.box, 4), tiles = C().tilesForBox(S.box, z);
      const key = C().cacheKey(SRC().id, S.box, z, rels[rels.length - 1].release);
      const saved = memCache.get(key) || (store.get('tbCache', {})[key]);
      if (saved) { finish(saved.years.map(y => rels.find(r => r.release === y)).filter(Boolean), saved.note, true); return; }
      const run = C().limiter(C().CONCURRENCY);
      let tileFails = 0;
      const sigAt = async i => {
        const hs = await Promise.all(tiles.map(t => run(async () => {
          if (ac.signal.aborted) throw new Error('cancelled');
          const r = await fetch(SRC().tileURL(rels[i], t.z, t.x, t.y), { signal: ac.signal });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return C().hashBytes(new Uint8Array(await r.arrayBuffer()));
        })));
        S.progress.done++; updateProgress();
        return hs.join('|');
      };
      S.progress.total = Math.ceil(Math.log2(rels.length) * 6);   // a rough guide; the bar never stalls at the end
      let sig;
      try { sig = (await C().bisectSignatures(rels.length, i => sigAt(i).catch(e => { if (ac.signal.aborted) throw e; tileFails++; return null; }), ac.signal)).sig; }
      catch (e) { if (ac.signal.aborted) throw e; sig = null; }
      let years, note;
      if (sig && sig.some(v => v != null)) {
        const byRel = {}; rels.forEach((r, i) => { byRel[r.release] = sig[i]; });
        const distinct = C().distinctReleases(rels, byRel);
        years = C().onePerYear(distinct);
        note = `${rels.length} Wayback releases checked by tile hash in the box (zoom ${z}, ${tiles.length} tile${tiles.length === 1 ? '' : 's'}): ${distinct.length} with new imagery, ${years.length} year${years.length === 1 ? '' : 's'} kept (the latest each year).${tileFails ? ` ${tileFails} release${tileFails === 1 ? '' : 's'} did not load.` : ''}`;
      } else {
        years = C().onePerYear(rels);
        note = 'The imagery tiles could not be compared (they did not load for checking), so one Wayback release per year is shown, changed or not.';
      }
      if (ac.signal.aborted) return;
      memCache.set(key, { years: years.map(r => r.release), note });
      const all = store.get('tbCache', {}); all[key] = { years: years.map(r => r.release), note };
      const keys = Object.keys(all); for (const k of keys.slice(0, Math.max(0, keys.length - CACHE_MAX))) delete all[k];
      store.set('tbCache', all);
      finish(years, note, false);
    } catch (e) {
      if (ac.signal.aborted) { S.stage = S.box ? 'cancelled' : 'idle'; updateBanner(); return; }
      S.stage = 'error'; S.note = e.message || 'The Wayback imagery did not load.'; updateBanner();
    }
  }
  function finish(years, note, cached) {
    S.years = years; S.note = note + (cached ? ' (Cached for this box.)' : '');
    S.idx = Math.max(0, years.length - 1); S.cmpIdx = 0; S.stage = 'ready'; S.ac = null;
    renderBanner(); showYear();
  }
  function cancel() { if (S.ac) S.ac.abort(); stopPlay(); }

  // ---- Drawing the box ---------------------------------------------------------------------------
  const el = map.getContainer();
  function onDown(ev) {
    if (S.stage !== 'drawing' || !S.draw || (ev.pointerType === 'mouse' && ev.button !== 0)) return;
    // Only a press on the map itself starts a box: buttons and panels over the map keep working.
    if (!(ev.target === el || ev.target.closest('.leaflet-map-pane')) || ev.target.closest('.leaflet-control, .tool-banner, #tb-swipe')) return;
    ev.preventDefault(); ev.stopPropagation();
    S.startCP = map.mouseEventToContainerPoint(ev);
    if (S.rect) map.removeLayer(S.rect);
    pane('tbRect', 660);
    S.rect = L.polygon(quadFrom(S.startCP, S.startCP), { pane: 'tbRect', className: 'tb-rect', color: tok('--accent'), weight: 2, dashArray: '6 4', fill: false, interactive: false }).addTo(map);
    el.setPointerCapture && el.setPointerCapture(ev.pointerId);
  }
  // The box as dragged on screen (so it is square to the screen whatever the map's bearing): its
  // four corners, top-left first, as latlngs.
  function quadFrom(a, b) {
    const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y);
    return [[x1, y1], [x2, y1], [x2, y2], [x1, y2]].map(([x, y]) => map.containerPointToLatLng(L.point(x, y)));
  }
  let moveQueued = null;
  function onMove(ev) {
    if (S.stage === 'drawing' && S.startCP && S.rect) {
      const cp = map.mouseEventToContainerPoint(ev);
      if (!moveQueued) requestAnimationFrame(() => { if (S.rect && S.startCP && moveQueued) S.rect.setLatLngs(quadFrom(S.startCP, moveQueued)); moveQueued = null; });
      moveQueued = cp; return;
    }
    if (S.dragSwipe && S.quad) {
      // Project the pointer onto the box's top edge (on screen) for the swipe fraction.
      const a = map.latLngToContainerPoint(S.quad[0]), b = map.latLngToContainerPoint(S.quad[1]), p = map.mouseEventToContainerPoint(ev);
      const dx = b.x - a.x, dy = b.y - a.y, len2 = Math.max(1, dx * dx + dy * dy);
      S.swipe = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)); clip();
    }
  }
  function onUp(ev) {
    if (S.dragSwipe) { S.dragSwipe = false; map.dragging.enable(); return; }
    if (S.stage !== 'drawing' || !S.startCP) return;
    const a = S.startCP, b = map.mouseEventToContainerPoint(ev); S.startCP = null; moveQueued = null;
    if (Math.abs(a.x - b.x) < 12 || Math.abs(a.y - b.y) < 12) { if (S.rect) { map.removeLayer(S.rect); S.rect = null; } return; }
    S.quad = quadFrom(a, b);
    S.box = C().ringBox(S.quad.map(ll => [ll.lng, ll.lat]));
    S.rect.setLatLngs(S.quad);
    setDraw(false);
    check();
  }
  el.addEventListener('pointerdown', onDown, true);
  el.addEventListener('pointermove', onMove);
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  function startDrawing() {
    cancel(); clearImagery();
    S.stage = 'drawing'; S.box = null; S.quad = null; S.years = [];
    if (S.rect) { map.removeLayer(S.rect); S.rect = null; }
    setDraw(true);
    renderBanner();
  }
  // Drawing mode: a drag draws the box and the map holds still. Off (after a box, or "Pan the
  // map"), the map pans and zooms as usual.
  function setDraw(on) {
    S.draw = !!on; S.startCP = null;
    if (S.draw) { map.dragging.disable(); el.classList.add('tb-drawing'); }
    else { map.dragging.enable(); el.classList.remove('tb-drawing'); }
  }
  function clearImagery() {
    stopPlay();
    for (const k of ['layerA', 'layerB']) if (S[k]) { map.removeLayer(S[k]); S[k] = null; }
    if (S.apps) S.apps.clearLayers();
    S.compare = false; const h = $('#tb-swipe'); if (h) h.hidden = true;
    el.classList.remove('tb-active');
  }

  // The swipe handle: a bar over the map, dragged sideways.
  const handle = document.createElement('div');
  handle.id = 'tb-swipe'; handle.className = 'tb-swipe'; handle.hidden = true;
  handle.setAttribute('role', 'slider'); handle.setAttribute('aria-label', 'Swipe between the two years'); handle.tabIndex = 0;
  handle.innerHTML = '<span class="tb-swipe-grip" aria-hidden="true">⇆</span>';
  el.appendChild(handle);
  handle.addEventListener('pointerdown', ev => { ev.preventDefault(); ev.stopPropagation(); S.dragSwipe = true; map.dragging.disable(); el.setPointerCapture && el.setPointerCapture(ev.pointerId); });
  handle.addEventListener('keydown', ev => { if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') { S.swipe = Math.max(0, Math.min(1, S.swipe + (ev.key === 'ArrowLeft' ? -0.05 : 0.05))); clip(); ev.preventDefault(); } });
  L.DomEvent.disableClickPropagation(handle);

  // ---- Play --------------------------------------------------------------------------------------
  function stopPlay() { if (S.playing) { clearInterval(S.playing); S.playing = null; } const b = $('[data-ptool-act="tb-play"]'); if (b) { b.textContent = 'Play'; b.setAttribute('aria-pressed', 'false'); } }
  function togglePlay() {
    if (S.playing) { stopPlay(); return; }
    if (S.years.length < 2) return;
    if (S.idx >= S.years.length - 1) { S.idx = 0; showYear(); }
    S.playing = setInterval(() => { if (S.idx >= S.years.length - 1) { stopPlay(); return; } S.idx++; showYear(); }, PLAY_MS);
    const b = $('[data-ptool-act="tb-play"]'); if (b) { b.textContent = 'Pause'; b.setAttribute('aria-pressed', 'true'); }
  }

  // ---- Banner ------------------------------------------------------------------------------------
  function statusHTML() {
    if (S.stage === 'drawing') return S.draw
      ? '<span class="muted">Drag a box on the map.</span> <button type="button" class="btn small" data-ptool-act="tb-pan">Pan the map</button>'
      : '<span class="muted">Move the map to the place, then draw.</span> <button type="button" class="btn small" data-ptool-act="tb-draw">Draw a box</button>';
    if (S.stage === 'checking') return `<span class="muted">Checking the Wayback releases for new imagery in the box…</span> <span class="tb-prog"><span class="tb-prog-bar" style="width:${pct()}%"></span></span> <button type="button" class="btn small" data-ptool-act="tb-cancel">Cancel</button>`;
    if (S.stage === 'cancelled') return '<span class="muted">Cancelled.</span> <button type="button" class="btn small" data-ptool-act="tb-retry">Check again</button>';
    if (S.stage === 'error') return `<span class="muted">${esc(S.note)}</span> <button type="button" class="btn small" data-ptool-act="tb-retry">Try again</button>`;
    if (S.stage === 'ready' && !S.years.length) return '<span class="muted">No Wayback imagery for this box.</span>';
    return '';
  }
  const pct = () => S.progress && S.progress.total ? Math.min(95, Math.round(S.progress.done / S.progress.total * 100)) : 5;
  function updateProgress() { const b = $('.tb-prog-bar'); if (b) b.style.width = `${pct()}%`; }
  function bannerHTML() {
    const ready = S.stage === 'ready' && S.years.length;
    const opts = S.years.map((r, i) => `<option value="${i}"${i === S.cmpIdx ? ' selected' : ''}>${r.year}</option>`).join('');
    return `<strong>Time Box</strong> <span id="tb-status">${statusHTML()}</span>
      ${ready ? `<span class="pt-row tb-row">
        <button type="button" class="btn small" data-ptool-act="tb-play" aria-pressed="false">Play</button>
        <label class="tb-slider"><span class="tb-year" id="tb-year"></span>
          <input type="range" id="tb-range" min="0" max="${S.years.length - 1}" step="1" value="${S.idx}" list="tb-ticks" aria-label="Imagery year"></label>
        <datalist id="tb-ticks">${S.years.map((r, i) => `<option value="${i}" label="${r.year}"></option>`).join('')}</datalist>
        <label class="tb-chk"><input type="checkbox" id="tb-compare"${S.compare ? ' checked' : ''}> Compare with</label>
        <select id="tb-cmp" aria-label="Year to compare with"${S.compare ? '' : ' disabled'}>${opts}</select>
      </span>
      <details class="tb-more small"><summary id="tb-sum"></summary><span class="muted" id="tb-info"></span></details>` : ''}
      <span class="pt-row tb-row">${S.box ? '<button type="button" class="btn small" data-ptool-act="tb-new">New box</button>' : ''}<span class="muted small">Esc to finish</span></span>`;
  }
  function renderBanner() { if (root.PeelTools.active() === 'timebox') root.PeelTools.banner(bannerHTML()); updateBanner(); }
  function updateBanner() {
    const st = $('#tb-status'); if (st && S.stage !== 'ready') st.innerHTML = statusHTML();
    if (S.stage === 'checking' && !$('#tb-status .tb-prog')) { const s2 = $('#tb-status'); if (s2) s2.innerHTML = statusHTML(); }
    const A = S.years[S.idx]; if (!A) return;
    const y = $('#tb-year'); if (y) y.textContent = S.compare && S.years[S.cmpIdx] ? `${A.year} | ${S.years[S.cmpIdx].year}` : String(A.year);
    const r = $('#tb-range'); if (r && +r.value !== S.idx) r.value = S.idx;
    const info = $('#tb-info'); if (!info) return;
    const c = S.appCounts || { shown: 0, unknown: 0 };
    const sum = $('#tb-sum'); if (sum) sum.innerHTML = `Release ${esc(A.date)} · ${c.shown} filed by ${A.year}${c.unknown ? ` · ${c.unknown} undated` : ''} · <span class="muted">Imagery © Esri Wayback</span>`;
    info.innerHTML = `Imagery: Wayback release ${esc(A.date)}${S.compare && S.years[S.cmpIdx] ? ` (left) | ${esc(S.years[S.cmpIdx].date)} (right)` : ''}; a release date is when Esri published the imagery, not when it was flown. · ${c.shown} application${c.shown === 1 ? '' : 's'} in the box filed by the end of ${A.year}${c.unknown ? `; ${c.unknown} with no filing date (dashed, shown every year)` : ''}. · ${esc(S.note)} · ${esc(SRC().attribution)}.`;
  }
  // The slider and the compare controls (inputs, so not the banner's click routing).
  document.addEventListener('input', ev => {
    if (ev.target.id === 'tb-range') { stopPlay(); S.idx = C().snapYear(S.years.map((_, i) => i), +ev.target.value); showYear(); }
  });
  document.addEventListener('change', ev => {
    if (ev.target.id === 'tb-compare') { S.compare = ev.target.checked; const sel = $('#tb-cmp'); if (sel) sel.disabled = !S.compare; if (S.compare && S.cmpIdx === S.idx) S.cmpIdx = 0; S.swipe = 0.5; showYear(); }
    if (ev.target.id === 'tb-cmp') { S.cmpIdx = +ev.target.value; showYear(); }
  });

  root.PeelTools.register('timebox', {
    title: 'Time Box',
    icon: 'clock',
    hint: 'drag a box to see its imagery over the years',
    bannerHTML,
    onActivate() { startDrawing(); },
    onDeactivate() {
      cancel(); clearImagery(); setDraw(false);
      if (S.rect) { map.removeLayer(S.rect); S.rect = null; }
      S.stage = 'idle'; S.box = null; S.quad = null; S.years = [];
      for (const n of ['tbA', 'tbB']) if (map.getPane(n)) map.getPane(n).style.clipPath = '';
    },
    onBannerAct(act) {
      if (act === 'tb-cancel') cancel();
      if (act === 'tb-retry' && S.box) check();
      if (act === 'tb-new') startDrawing();
      if (act === 'tb-play') togglePlay();
      if (act === 'tb-pan') { setDraw(false); updateBanner(); }
      if (act === 'tb-draw') { setDraw(true); updateBanner(); }
    },
  });

  const api = { state: () => S, startDrawing, check, cancel, togglePlay, PLAY_MS };
  root.PeelTimeBox = api;
})(typeof window !== 'undefined' ? window : globalThis);
