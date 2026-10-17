(function (root) {
'use strict';
// Map creation, orientation, basemaps (PeelMapCore). Must load before every
// module whose top-level code touches the map.
const { $, store, token } = window.PeelUtil;
const CFG = window.PEEL_CONFIG;
const ML = () => root.PeelMapLabels;
const CA = () => root.PeelCensusAreas;
const MA = () => root.PeelMapAnalysis;
const AS = () => root.PeelAreaSelect;
const Aerial = () => root.PeelAerial;
  // ---- Map -----------------------------------------------------------------------
  // Orientation: Peel's concession grid (Hurontario, Dixie, Steeles…) runs about 44° off true
  // north, so "Road grid" turns the map by that much and east–west streets run straight across.
  const GRID_BEARING = 44;
  const ORIENTATIONS = { grid: 'Road grid', north: 'North up' };
  let orientation = ORIENTATIONS[store.get('orientation', 'grid')] ? store.get('orientation', 'grid') : 'grid';
  const canRotate = !!(L.Map.prototype.setBearing);
  // Stacked canvases: only the top canvas gets taps and hovers, so one the development dots are
  // drawn on would swallow those meant for the sewer pipes or catchments drawn below it. The top
  // canvas hands what it doesn't hit itself to the canvases below, topmost first.
  (() => {
    const C = L.Canvas.prototype, add = C.onAdd, rem = C.onRemove;
    C.onAdd = function (m) { add.call(this, m); (m._cvs || (m._cvs = new Set())).add(this); };
    C.onRemove = function () { if (this._map && this._map._cvs) this._map._cvs.delete(this); rem.call(this); };
    const zOf = r => { const pane = r._container && r._container.parentNode; return pane ? (+getComputedStyle(pane).zIndex || 0) * 1000 + [...pane.children].indexOf(r._container) : -1; };
    const stack = r => [...(r._map._cvs || [r])].filter(x => x._map && x._container).sort((a, b) => zOf(b) - zOf(a));
    const hitOf = (r, e, click) => {
      const pt = r._map.mouseEventToLayerPoint(e); let hit = null;
      for (let o = r._drawFirst; o; o = o.next) { const l = o.layer; if (l.options.interactive && l._containsPoint(pt) && !(click && r._map._draggableMoved(l))) hit = l; }
      return hit;
    };
    C._onClick = function (e) {
      const click = e.type === 'click' || e.type === 'preclick';
      for (const r of stack(this)) { const h = hitOf(r, e, click); if (h) return r._fireEvent([h], e); }
      this._fireEvent(false, e);
    };
    C._onMouseMove = function (e) {
      const m = this._map; if (!m || m.dragging.moving() || m._animatingZoom || this._mouseHoverThrottled) return;
      const all = stack(this); let owner = null, hit = null;
      for (const r of all) { hit = hitOf(r, e, false); if (hit) { owner = r; break; } }
      for (const r of all) if (r !== owner || r._hoveredLayer !== hit) r._handleMouseOut(e);
      if (owner && owner._hoveredLayer !== hit) { owner._fireEvent([hit], e, 'mouseover'); owner._hoveredLayer = hit; }
      L.DomUtil[owner ? 'addClass' : 'removeClass'](this._container, 'leaflet-interactive');
      this._fireEvent(owner ? [hit] : false, e);
      this._mouseHoverThrottled = true; setTimeout(() => { this._mouseHoverThrottled = false; }, 32);
    };
  })();
  const map = L.map('map', {
    zoomControl: true, maxZoom: 20,
    ...(canRotate ? { rotate: true, bearing: orientation === 'grid' ? GRID_BEARING : 0, rotateControl: false, touchRotate: false, shiftKeyRotate: false } : {}),
  }).setView(CFG.center, CFG.zoom);
  map.getContainer().addEventListener('mouseleave', e => { for (const r of map._cvs || []) r._handleMouseOut(e); });
  const dark = () => document.documentElement.dataset.theme !== 'light';
  // Basemaps: Esri World Imagery (aerial), optionally with Esri reference
  // overlays for roads and place names, or a plain CARTO street map.
  const DATA_ATTR = 'Data: Mississauga, Brampton, Caledon, Peel open data';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const esriLayer = (svc, opts) => L.tileLayer(`${ESRI}/${svc}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, ...opts });
  const BASEMAPS = {
    // The views' default: the grey street map (in the theme's shade) when zoomed out, so the stage and
    // capacity colours read; the aerial with roads from street zoom, where the photo shows what a
    // site connects to. The Base map row and a note on the map say when it switches.
    'auto':          { label: 'Grey map, aerial from street zoom', imagery: false, auto: true },
    'aerial-labels': { label: 'Latest aerial + roads', imagery: true, city: true },
    'aerial':        { label: 'Latest aerial', imagery: true, city: true },
    'esri':          { label: 'Esri World Imagery', imagery: true },
    'streets':       { label: 'Street map (light)', imagery: false },
    'streets-color': { label: 'Street map (colour)', imagery: false },
  };
  // Street zoom, from which 'auto' shows the aerial.
  const AUTO_AERIAL_ZOOM = 14;
  // The servicing views' old basemap (the dark grey canvas whatever the theme, switching to the aerial
  // at street zoom) is now 'auto': saved views and remembered settings that name it open as 'auto'.
  const LEGACY_BASEMAP = { 'canvas-dark': 'auto' };
  const basemapKey = b => (BASEMAPS[b] ? b : LEGACY_BASEMAP[b] || null);
  // Latest city aerials (Mississauga, Brampton, Caledon) over Esri World Imagery. Image
  // services are drawn as 512 px Web Mercator tiles from exportImage / export.
  const CityImagery = L.TileLayer.extend({
    getTileUrl(c) {
      const size = 2 * 20037508.342789244 / 2 ** c.z;
      const x0 = -20037508.342789244 + c.x * size, y1 = 20037508.342789244 - c.y * size;
      return Aerial().exportUrl(this._url, [x0, y1 - size, x0 + size, y1], 512, 512);
    },
  });
  function cityImageryLayers() {
    const out = [], credits = [];
    for (const muni of ['Caledon', 'Brampton', 'Mississauga']) {
      const src = CFG.imagery && CFG.imagery[muni];
      if (!src) continue;
      const year = Math.max(...Object.keys(src.years).map(Number));
      const [x0, y0, x1, y1] = src.bbox;
      const opts = { pane: 'imageryPane', bounds: L.latLngBounds([[y0, x0], [y1, x1]]), minZoom: 12, maxZoom: 20 };
      out.push(src.tiles ? L.tileLayer(src.tiles, { ...opts, maxNativeZoom: 20 })
        : new CityImagery(src.years[year].url, { ...opts, tileSize: 512, zoomOffset: -1 }));
      credits.push(`${src.owner} ${src.years[year].label}`);
    }
    return { layers: out, attribution: `Imagery: ${credits.join(', ')}; Esri elsewhere` };
  }
  let basemap = basemapKey(store.get('basemap', 'auto')) || 'auto';
  let baseLayers = [];
  // What 'auto' shows at the current zoom (the others show themselves).
  const shownBasemap = () => (BASEMAPS[basemap].auto ? (map.getZoom() >= AUTO_AERIAL_ZOOM ? 'aerial-labels' : 'streets') : basemap);
  // The background as the Base map row names it ("Grey map", "Aerial + roads").
  const BG_NAME = { streets: 'Grey map', 'streets-color': 'Street map', 'aerial-labels': 'Aerial + roads', aerial: 'Aerial', esri: 'Aerial (Esri)' };
  const backgroundName = () => BG_NAME[shownBasemap()] || BASEMAPS[basemap].label;
  // Aerial photos sit in their own pane, 40% transparent as a whole (one blend, so the city
  // aerial and the Esri imagery under it don't show through each other); road and place labels
  // stay opaque in the tile pane above.
  // The opacity is a Base map setting (Layers › Base map), 0.6 by default.
  const AERIAL_OPACITY = 0.6;
  let aerialOpacity = (() => { const v = +store.get('aerialOpacity', AERIAL_OPACITY); return v >= 0.2 && v <= 1 ? v : AERIAL_OPACITY; })();
  const imageryPane = map.createPane('imageryPane', map.getPane('rotatePane') || undefined);
  imageryPane.style.zIndex = (window.PeelLayerGroups ? window.PeelLayerGroups.Z.imagery : 150); imageryPane.style.opacity = aerialOpacity;
  function setAerialOpacity(v) { aerialOpacity = Math.max(0.2, Math.min(1, +v || AERIAL_OPACITY)); imageryPane.style.opacity = aerialOpacity; store.set('aerialOpacity', aerialOpacity); }
  const getAerialOpacity = () => aerialOpacity;
  let tilesShown = null;
  function setTiles() {
    for (const l of baseLayers) map.removeLayer(l);
    const imageryAttr = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';
    const basemap = shownBasemap(); tilesShown = basemap;
    // Street maps: Esri basemaps (no key needed), like the aerial layers.
    if (basemap === 'streets') {
      const g = dark() ? 'Dark' : 'Light';
      baseLayers = [esriLayer(`Canvas/World_${g}_Gray_Base`, { maxNativeZoom: 16, attribution: `Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ${DATA_ATTR}` }),
        esriLayer(`Canvas/World_${g}_Gray_Reference`, { maxNativeZoom: 16 })];
    } else if (basemap === 'streets-color') {
      baseLayers = [esriLayer('World_Street_Map', { attribution: `Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ${DATA_ATTR}` })];
    } else if (BASEMAPS[basemap].city) {
      const city = cityImageryLayers();
      baseLayers = [esriLayer('World_Imagery', { pane: 'imageryPane', attribution: `${city.attribution} · ${DATA_ATTR}` }), ...city.layers];
      if (basemap === 'aerial-labels') baseLayers.push(
        esriLayer('Reference/World_Transportation', { opacity: 0.9 }),
        esriLayer('Reference/World_Boundaries_and_Places'));
    } else {
      baseLayers = [esriLayer('World_Imagery', { pane: 'imageryPane', attribution: `${imageryAttr} · ${DATA_ATTR}` })];
      if (basemap === 'aerial-labels') baseLayers.push(
        esriLayer('Reference/World_Transportation', { opacity: 0.9 }),
        esriLayer('Reference/World_Boundaries_and_Places'));
    }
    baseLayers.forEach((l, i) => { l.addTo(map); l.setZIndex(i); });
    const imagery = BASEMAPS[basemap].imagery;
    map.getContainer().classList.toggle('on-imagery', imagery);
    styleMunis();
    if (window.PeelLayerGroups && window.PeelLayerGroups.sync) window.PeelLayerGroups.sync();
  }
  // 'auto' switches with the zoom, and says so for a moment on the map (the Base map row names it).
  let bgNote = null, bgTimer = null;
  function noteBackground(text) {
    if (!bgNote) { bgNote = L.DomUtil.create('div', 'bg-note', map.getContainer()); bgNote.setAttribute('role', 'status'); }
    bgNote.textContent = text; bgNote.hidden = false;
    clearTimeout(bgTimer); bgTimer = setTimeout(() => { bgNote.hidden = true; }, 3500);
  }
  map.on('zoomend', () => {
    if (!BASEMAPS[basemap].auto || shownBasemap() === tilesShown) return;
    setTiles(); CA().restyleDa();
    noteBackground(shownBasemap() === 'streets' ? 'Background: grey map (the aerial shows from street zoom)' : 'Background: aerial + roads at street zoom');
  });

  // ---- Peel and its municipalities: the map's frame ---------------------------------------
  // data/munis.json (scripts/build-munis.js, from the 2021 census areas): the outlines, drawn above the
  // base map and under everything else, with the names while zoomed out.
  const muniPane = map.createPane('muniPane', map.getPane('rotatePane') || undefined);
  muniPane.style.zIndex = 205; muniPane.style.pointerEvents = 'none';
  const muniLayer = L.layerGroup().addTo(map), muniLabels = L.layerGroup();
  const MUNI_LABEL_MAX_ZOOM = 12;
  let munis = null;
  function styleMunis() {
    if (!munis) return;
    const on = map.getContainer().classList.contains('on-imagery'), col = on ? token('--map-label') : token('--muni-line');
    muniLayer.eachLayer(l => l.setStyle && l.setStyle({ color: col }));
  }
  function drawMunis(d) {
    munis = d; muniLayer.clearLayers(); muniLabels.clearLayers();
    const ll = rings => rings.map(r => r.map(([x, y]) => [y, x]));
    for (const m of d.munis || []) {
      L.polygon(ll(m.rings), { pane: 'muniPane', weight: 2, opacity: 0.8, fill: false, interactive: false }).addTo(muniLayer);
      // (in the marker pane: leaflet-rotate places markers there on the turned map; under the developments)
      if (m.label) L.marker([m.label[1], m.label[0]], { interactive: false, keyboard: false, zIndexOffset: -5000, icon: L.divIcon({ className: 'muni-lbl', html: `<span>${window.PeelUtil.esc(m.name)}</span>`, iconSize: null }) }).addTo(muniLabels);
    }
    if (d.peel) L.polygon(ll(d.peel.rings), { pane: 'muniPane', weight: 3, opacity: 0.9, fill: false, interactive: false }).addTo(muniLayer);
    styleMunis(); syncMuniLabels();
  }
  const syncMuniLabels = () => { if (!munis) return; if (map.getZoom() <= MUNI_LABEL_MAX_ZOOM) muniLabels.addTo(map); else map.removeLayer(muniLabels); };
  map.on('zoomend', syncMuniLabels);
  // The zoom as classes, for what CSS shows only from a zoom on (wastewater block labels from 12).
  const syncZoomClass = () => { const c = map.getContainer(), z = map.getZoom(); c.classList.toggle('z-lt12', z < 12); c.classList.toggle('z-lt14', z < 14); };
  map.on('zoomend', syncZoomClass); syncZoomClass();
  // Peel's outline as bounds (for the first view).
  function peelBounds() {
    const r = munis && munis.peel && munis.peel.rings; if (!r) return null;
    return L.latLngBounds(r.flat().map(([x, y]) => [y, x]));
  }
  // Fit Peel to the map, clear of the tool rail and an open Layers panel (only when no link or saved
  // position set the view).
  // (fitBounds takes the north-up box, too big on the turned map: the zoom is found on the outline as
  // it is drawn, turned by the bearing)
  function fitPeel() {
    const r = munis && munis.peel && munis.peel.rings; if (!r) return;
    const panel = document.querySelector('.map-opts .mo-panel[open]'), pw = panel ? panel.getBoundingClientRect().width : 0;
    const size = map.getSize(), aw = size.x - 48 - 16 - pw, ah = size.y - 16 - 24;
    const a = (canRotate && map.getBearing ? map.getBearing() : 0) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
    const pts = r.flat().map(([x, y]) => L.latLng(y, x));
    let best = null;
    for (let z = 12; z >= 6 && !best; z--) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const ll of pts) { const p = map.project(ll, z), u = p.x * ca - p.y * sa, v = p.x * sa + p.y * ca; x0 = Math.min(x0, u); y0 = Math.min(y0, v); x1 = Math.max(x1, u); y1 = Math.max(y1, v); }
      if (x1 - x0 <= aw && y1 - y0 <= ah) {
        // The middle of the turned box, turned back, then shifted to the middle of the clear area.
        const u = (x0 + x1) / 2 + (16 + pw - 48) / 2, v = (y0 + y1) / 2 + (24 - 16) / 2;
        best = { z, c: map.unproject(L.point(u * ca + v * sa, -u * sa + v * ca), z) };
      }
    }
    if (best) map.setView(best.c, best.z);
  }
  const startCentre = map.getCenter();
  fetch('data/munis.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => {
    if (!d) return;
    drawMunis(d);
    // (opened on Home, the map is hidden: it fits the first time it is shown, if nothing moved it yet)
    const untouched = () => { const c = map.getCenter(); return !/[#&]m=/.test(location.hash) && c.lat === startCentre.lat && c.lng === startCentre.lng; };
    const tryFit = () => { if (!untouched()) return; if (map.getSize().x < 200) { map.once('resize', tryFit); return; } fitPeel(); };
    tryFit();
  });

  function setOrientation(o) {
    if (!canRotate) return;
    orientation = o; store.set('orientation', o);
    map.setBearing(o === 'grid' ? GRID_BEARING : 0);
    const sel = $('#opt-orient'); if (sel) sel.value = o;
    ML().scheduleLabels(); AS().updateNorth();
  }
const getBasemap = () => basemap;
function setBasemap(b) { basemap = basemapKey(b) || 'auto'; store.set('basemap', basemap); }
const getOrientation = () => orientation;

// ---- Public contract ------------------------------------------------------------------
const api = { map, setTiles, getBasemap, setBasemap, basemapKey, shownBasemap, backgroundName, AUTO_AERIAL_ZOOM, fitPeel, peelBounds, getMunis: () => munis, setAerialOpacity, getAerialOpacity, getOrientation, setOrientation, canRotate, BASEMAPS, ORIENTATIONS, GRID_BEARING, esriLayer, DATA_ATTR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelMapCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
