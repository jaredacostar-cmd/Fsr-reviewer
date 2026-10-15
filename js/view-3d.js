(function (root) {
'use strict';
  // ---- 3D view (PeelView3D): Part 2 of the measure / 3D / Time Box brief ------------------------
  // A separate MapLibre map over the Leaflet map, opened from the map's 3D button at the same
  // place: pitch 60°, terrain from the elevation module's demTile (lidar in the pilot box, terrain
  // tiles elsewhere) at ×1.2 with hillshade, OSM buildings in the pilot box, and the shown
  // developments as indicative massing in their status colours. MapLibre and PMTiles load only
  // when the view first opens. Everything drawn is indicative, not design.
  const { $, esc, token } = root.PeelUtil;
  const MC = () => root.PeelMapCore, App = () => root.PeelApp, EL = () => root.PeelElevation;
  const MS = () => root.PeelMassingCore, PH = () => root.PeelPhases, DN = () => root.PeelDevNav;
  const LIBS = {
    maplibre: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js',
    maplibreCss: 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css',
    pmtiles: 'https://unpkg.com/pmtiles@3.2.1/dist/pmtiles.js',
  };
  const PITCH = 60, EXAGGERATION = 1.2;
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const tok = name => token(name) || '#888';

  let libs = null;
  function loadLibs() {
    if (libs) return libs;
    const script = src => new Promise((ok, fail) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => fail(new Error(`could not load ${src}`)); document.head.appendChild(s); });
    if (!document.querySelector(`link[href="${LIBS.maplibreCss}"]`)) { const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LIBS.maplibreCss; document.head.appendChild(l); }
    libs = Promise.all([root.maplibregl ? null : script(LIBS.maplibre), root.pmtiles ? null : script(LIBS.pmtiles)]).then(() => {
      const ml = root.maplibregl, pm = new root.pmtiles.Protocol();
      ml.addProtocol('pmtiles', pm.tile);
      // Terrain through the elevation module, so the 3D view and the profile read the same sources.
      ml.addProtocol('peeldem', async (params, abort) => {
        const m = /peeldem:\/\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
        const t = await EL().demTile(+m[1], +m[2], +m[3], abort && abort.signal);
        used[t.source] = (used[t.source] || 0) + 1; scheduleNote();
        return { data: t.data };
      });
    });
    libs.catch(() => { libs = null; });
    return libs;
  }
  const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };

  // ---- Basemap: aerial when the 2D map shows aerial, otherwise the grey canvas for the theme ----
  function baseSource() {
    const b = MC().getBasemap(), imagery = MC().BASEMAPS[b] && MC().BASEMAPS[b].imagery;
    const dark = document.documentElement.dataset.theme !== 'light';
    const t = svc => `${ESRI}/${svc}/MapServer/tile/{z}/{y}/{x}`;
    return imagery
      ? { tiles: [t('World_Imagery')], attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', imagery: true }
      : { tiles: [t(`Canvas/World_${dark ? 'Dark' : 'Light'}_Gray_Base`)], attribution: 'Esri, HERE, Garmin, © OpenStreetMap contributors', imagery: false };
  }

  // ---- Massing for the developments shown in 2D --------------------------------------------------
  const PHASE_KEYS = ['inception', 'review', 'approved', 'permit', 'construction', 'completed', 'cancelled'];
  const phaseColor = () => ['match', ['get', 'phase'], ...PHASE_KEYS.flatMap(k => [k, tok(`--ph-${k}`)]), tok('--text-muted')];
  function massing() {
    const st = App() && App().state, list = (st && (st.filtered || st.projects)) || [];
    return MS().massingFeatures(list);
  }

  let gl = null, el = null, man = null, used = {}, noteTimer = null, lastMassing = null;
  const scheduleNote = () => { clearTimeout(noteTimer); noteTimer = setTimeout(renderNote, 400); };

  function style(base, buildings) {
    const dem = { type: 'raster-dem', tiles: ['peeldem://{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 16 };
    const s = {
      version: 8,
      sources: {
        base: { type: 'raster', tiles: base.tiles, tileSize: 256, maxzoom: 19, attribution: base.attribution },
        dem: { ...dem, attribution: terrainAttribution() },
        hill: dem,
        massing: { type: 'geojson', data: lastMassing, attribution: 'Developments: municipal open data (indicative massing)' },
      },
      layers: [
        { id: 'base', type: 'raster', source: 'base', paint: base.imagery ? { 'raster-opacity': 0.9 } : {} },
        { id: 'hill', type: 'hillshade', source: 'hill', paint: { 'hillshade-exaggeration': 0.35, 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#ffffff' } },
      ],
      terrain: { source: 'dem', exaggeration: EXAGGERATION },
    };
    if (man) {
      const [w, so, e, n] = man.bbox;
      s.sources.pilot = { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[w, so], [e, so], [e, n], [w, n], [w, so]] } } };
      s.layers.push({ id: 'pilot', type: 'line', source: 'pilot', paint: { 'line-color': tok('--accent'), 'line-width': 1.5, 'line-dasharray': [3, 2] } });
    }
    if (buildings) {
      s.sources.buildings = { type: 'vector', url: `pmtiles://${new URL(`data/3d/${man.buildings.file}`, location.href).href}`, attribution: '© OpenStreetMap contributors, ODbL' };
      s.layers.push({ id: 'buildings', type: 'fill-extrusion', source: 'buildings', 'source-layer': 'buildings', minzoom: 13,
        paint: { 'fill-extrusion-color': ['case', ['==', ['get', 'e'], 1], '#9aa1ad', '#d3d7de'], 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': ['get', 'b'], 'fill-extrusion-opacity': 0.85 } });
    }
    s.layers.push({ id: 'massing', type: 'fill-extrusion', source: 'massing',
      paint: { 'fill-extrusion-color': phaseColor(), 'fill-extrusion-height': ['get', 'h'], 'fill-extrusion-base': 0, 'fill-extrusion-opacity': 0.78 } });
    return s;
  }
  function terrainAttribution() {
    const t = man && man.terrain;
    return [t ? `Terrain (pilot): ${t.attribution}` : null, 'Terrain elsewhere: Terrain Tiles (Mapzen / AWS; CDEM © Natural Resources Canada, SRTM)'].filter(Boolean).join(' · ');
  }

  // ---- Panel: controls, legend and notes ---------------------------------------------------------
  function shell() {
    if (el) return el;
    el = document.createElement('div');
    el.id = 'view3d'; el.className = 'view3d'; el.hidden = true;
    el.setAttribute('role', 'region'); el.setAttribute('aria-label', '3D view');
    el.innerHTML = `<div class="v3-map" id="v3-map"></div>
      <div class="v3-bar">
        <button type="button" class="btn small" data-v3="close" title="Back to the 2D map (Esc)">2D</button>
        <strong>3D view</strong><span class="muted small">indicative, not design</span>
        <label class="v3-chk"><input type="checkbox" data-v3="buildings" checked> Buildings</label>
        <label class="v3-chk"><input type="checkbox" data-v3="massing" checked> Proposals</label>
        <button type="button" class="btn small" data-v3="pitch" title="Tilt or look straight down">Tilt</button>
      </div>
      <details class="v3-legend"><summary>Legend and notes</summary><div class="v3-legend-body"></div></details>
      <div class="v3-attrib small"></div>
      <div class="v3-msg" hidden></div>`;
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-v3]'); if (!b) return;
      if (b.dataset.v3 === 'close') close();
      if (b.dataset.v3 === 'pitch' && gl) gl.easeTo({ pitch: gl.getPitch() > 10 ? 0 : PITCH });
    });
    el.addEventListener('change', e => {
      const b = e.target.closest('input[data-v3]'); if (!b || !gl) return;
      const id = b.dataset.v3; if (gl.getLayer(id)) gl.setLayoutProperty(id, 'visibility', b.checked ? 'visible' : 'none');
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && el && !el.hidden) close(); });
    MC().map.getContainer().parentElement.appendChild(el);
    return el;
  }
  function renderNote() {
    if (!el) return;
    const body = el.querySelector('.v3-legend-body'), t = man && man.terrain, b = man && man.buildings;
    const base = baseSource();
    el.querySelector('.v3-attrib').textContent = [base.attribution, used.lidar && t ? 'Terrain: Ontario DTM (Lidar-Derived), MNR, OGL-Ontario' : null, used.terrain || !used.lidar ? 'Terrain Tiles: Mapzen / AWS (CDEM © NRCan, SRTM)' : null, b && gl && gl.getLayer('buildings') ? '© OpenStreetMap contributors, ODbL' : null, 'Developments: municipal open data'].filter(Boolean).join(' · ');
    const ph = PH() && PH().PHASE_BY_KEY ? PH().PHASE_BY_KEY : {};
    const counts = {}; for (const f of (lastMassing && lastMassing.features) || []) counts[f.properties.phase] = (counts[f.properties.phase] || 0) + 1;
    const sw = c => `<span class="v3-sw" style="background:${c}"></span>`;
    const terr = [used.lidar ? `lidar terrain model, bare earth${t && t.year ? `, flown ${t.year}` : ''} (CGVD2013; ${t ? `${t.check && t.check.medianAbs != null ? `tiles within ${t.check.medianAbs} m of the service, ` : ''}rounded to ${t.quantum} m` : ''})` : null,
      used.terrain ? 'terrain tiles (CDEM / SRTM, ~7–30 m pixels, CGVD28 / EGM96; about 0.4 m from the lidar datum, not adjusted)' : null].filter(Boolean);
    body.innerHTML = `
      <div class="v3-sec"><b>Proposals</b> <span class="muted">(shown in 2D, coloured by status)</span>
        <div class="v3-keys">${PHASE_KEYS.filter(k => counts[k]).map(k => `<span>${sw(tok(`--ph-${k}`))}${esc((ph[k] && ph[k].label) || k)} <span class="muted">${counts[k]}</span></span>`).join('') || '<span class="muted">None with a height to draw.</span>'}</div>
        <p class="muted small">Height: the stated height, else stated storeys × ${MS().STOREY_M} m, else (apartments only) units × ${MS().UNIT_GFA_M2} m² ÷ (footprint × ${Math.round(MS().FLOOR_EFFICIENCY * 100)}%). Footprint: ${Math.round(MS().SITE_COVERAGE * 100)}% of the application site about its centre, or a ${MS().SQUARE_M} m square at the address. ${lastMassing && lastMassing.hidden ? `${lastMassing.hidden.toLocaleString()} shown developments have no stated height and no units estimate: not drawn.` : ''} Tap a block for its basis.</p></div>
      <div class="v3-sec"><b>Buildings</b> ${b ? `<span class="muted">(OpenStreetMap, ${esc(man.name)} only)</span>
        <div class="v3-keys"><span>${sw('#d3d7de')}height tagged</span><span>${sw('#9aa1ad')}estimated (levels × ${MS().STOREY_M} m, else ${MS().DEFAULT_STOREYS} storeys)</span></div>
        <p class="muted small">${b.count.toLocaleString()} buildings: ${b.byBasis.height.toLocaleString()} with a height, ${b.byBasis.levels.toLocaleString()} from levels, ${b.byBasis.default.toLocaleString()} assumed ${MS().DEFAULT_STOREYS} storeys. OSM data ${esc(String(b.osmTimestamp || '').slice(0, 10))}.</p>` : '<span class="muted">Not built yet: the pilot tiles are made in Actions (mode=tiles-3d).</span>'}</div>
      <div class="v3-sec"><b>Ground</b> <span class="muted">×${EXAGGERATION} vertical, hillshaded</span>
        <p class="muted small">${terr.length ? esc(terr.join('; ')) : 'Loading…'}.${man ? ` Dashed box: ${esc(man.name)}.` : ''}</p></div>`;
  }
  function message(text) { const m = el && el.querySelector('.v3-msg'); if (m) { m.hidden = !text; m.textContent = text || ''; } }

  function popupHTML(f) {
    const p = f.properties;
    if (f.layer.id === 'buildings') return `<b>Building</b><br>${(+p.h).toFixed(1)} m${p.e ? ` <span class="muted">(estimated: ${p.s === 'levels' ? `levels × ${MS().STOREY_M} m` : `${MS().DEFAULT_STOREYS} storeys assumed`})</span>` : ' <span class="muted">(height tagged)</span>'}<br><span class="muted small">© OpenStreetMap contributors</span>`;
    const ph = PH() && PH().PHASE_BY_KEY && PH().PHASE_BY_KEY[p.phase];
    const m = { h: +p.h, storeys: p.storeys ? +p.storeys : null, basis: p.basis, footprint: p.footprint };
    return `<b>${esc(p.title || 'Development')}</b><br>${esc(ph ? ph.label : p.phase)}${p.units && p.units !== 'null' ? ` · ${(+p.units).toLocaleString()} units` : ''}<br><span class="small">${esc(MS().massingLabel(m))}</span><br><button type="button" class="btn small" data-v3-open="${esc(p.key)}">Open development</button>`;
  }

  async function open() {
    shell();
    if (!webgl()) { el.hidden = false; message('3D needs WebGL, which this browser or device does not offer. Use 2D.'); return; }
    el.hidden = false; message('Loading the 3D view…');
    document.documentElement.setAttribute('data-view3d', '');
    try {
      await loadLibs();
      man = man || await (EL().pilotTerrain ? EL().pilotTerrain().then(p => p.man) : null);
    } catch (e) { message('The 3D library did not load. Check the connection and try again.'); return; }
    lastMassing = massing(); used = {};
    el.querySelector('.v3-legend').open = window.innerWidth >= 600;
    const lm = MC().map, c = lm.getCenter();
    const buildings = !!(man && man.buildings && man.buildings.file);
    el.querySelector('input[data-v3="buildings"]').closest('label').hidden = !buildings;
    if (gl) { gl.remove(); gl = null; }
    gl = new root.maplibregl.Map({
      container: 'v3-map', style: style(baseSource(), buildings), center: [c.lng, c.lat], zoom: Math.max(1, lm.getZoom() - 1),
      pitch: PITCH, bearing: lm.getBearing ? lm.getBearing() : 0, maxPitch: 75, attributionControl: false,
    });
    gl.addControl(new root.maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    gl.on('load', () => { message(''); renderNote(); });
    gl.on('error', e => { if (e && e.error && /peeldem|pmtiles/.test(String(e.error.message || ''))) console.warn('3D tile', e.error.message); });
    for (const id of ['massing', 'buildings']) {
      gl.on('click', id, e => { const f = e.features && e.features[0]; if (f) new root.maplibregl.Popup({ maxWidth: '280px' }).setLngLat(e.lngLat).setHTML(popupHTML(f)).addTo(gl); });
      gl.on('mouseenter', id, () => { gl.getCanvas().style.cursor = 'pointer'; });
      gl.on('mouseleave', id, () => { gl.getCanvas().style.cursor = ''; });
    }
    renderNote();
  }
  function close() {
    if (!el || el.hidden) return;
    if (gl) { const c = gl.getCenter(); MC().map.setView([c.lat, c.lng], Math.round(gl.getZoom() + 1), { animate: false }); gl.remove(); gl = null; }
    el.hidden = true; message('');
    document.documentElement.removeAttribute('data-view3d');
    setTimeout(() => MC().map.invalidateSize(), 30);
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-v3-open]'); if (!b) return;
    const p = DN() && DN().projectByKey && DN().projectByKey(b.dataset.v3Open);
    close(); if (p) DN().showDetail(p);
  });

  // The 3D button: a Leaflet control under the north arrow.
  if (root.L && MC() && MC().map) {
    const Ctl = root.L.Control.extend({
      options: { position: 'topleft' },
      onAdd() {
        const c = root.L.DomUtil.create('div', 'leaflet-bar view3d-ctl');
        c.innerHTML = '<button type="button" id="view3d-btn" title="3D view: terrain, buildings and proposals (indicative)" aria-label="Open the 3D view">3D</button>';
        root.L.DomEvent.disableClickPropagation(c);
        c.querySelector('button').onclick = open;
        return c;
      },
    });
    new Ctl().addTo(MC().map);
  }

  const api = { open, close, isOpen: () => !!(el && !el.hidden), LIBS, PITCH, EXAGGERATION };
  root.PeelView3D = api;
})(typeof window !== 'undefined' ? window : globalThis);
