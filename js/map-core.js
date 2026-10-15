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
  const dark = () => document.documentElement.dataset.theme === 'dark' ||
    (document.documentElement.dataset.theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
  // Basemaps: Esri World Imagery (aerial), optionally with Esri reference
  // overlays for roads and place names, or a plain CARTO street map.
  const DATA_ATTR = 'Data: Mississauga, Brampton, Caledon, Peel open data';
  const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
  const esriLayer = (svc, opts) => L.tileLayer(`${ESRI}/${svc}/MapServer/tile/{z}/{y}/{x}`, { maxZoom: 20, maxNativeZoom: 19, ...opts });
  const BASEMAPS = {
    'aerial-labels': { label: 'Latest aerial + roads', imagery: true, city: true },
    'aerial':        { label: 'Latest aerial', imagery: true, city: true },
    'esri':          { label: 'Esri World Imagery', imagery: true },
    'streets':       { label: 'Street map (light)', imagery: false },
    'streets-color': { label: 'Street map (colour)', imagery: false },
    'canvas-dark':   { label: 'Street map (dark grey)', imagery: false },
  };
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
  let basemap = BASEMAPS[store.get('basemap', 'aerial-labels')] ? store.get('basemap', 'aerial-labels') : 'aerial-labels';
  let baseLayers = [];
  const bboxOutline = L.rectangle([[CFG.bbox.ymin, CFG.bbox.xmin], [CFG.bbox.ymax, CFG.bbox.xmax]], { weight: 1, dashArray: '4 4', fill: false, interactive: false });
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
  function setTiles() {
    for (const l of baseLayers) map.removeLayer(l);
    const imageryAttr = 'Imagery &copy; Esri, Maxar, Earthstar Geographics';
    // Street maps: Esri basemaps (no key needed), like the aerial layers.
    if (basemap === 'streets') {
      const g = dark() ? 'Dark' : 'Light';
      baseLayers = [esriLayer(`Canvas/World_${g}_Gray_Base`, { maxNativeZoom: 16, attribution: `Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ${DATA_ATTR}` }),
        esriLayer(`Canvas/World_${g}_Gray_Reference`, { maxNativeZoom: 16 })];
    } else if (basemap === 'canvas-dark') {
      // The servicing views' basemap: always the dark grey canvas, whatever the
      // theme (the 'streets' entry above follows the theme instead).
      baseLayers = [esriLayer('Canvas/World_Dark_Gray_Base', { maxNativeZoom: 16, attribution: `Esri, HERE, Garmin, &copy; OpenStreetMap contributors · ${DATA_ATTR}` }),
        esriLayer('Canvas/World_Dark_Gray_Reference', { maxNativeZoom: 16 })];
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
    bboxOutline.setStyle({ color: imagery ? token('--map-label') : token('--text-muted'), opacity: imagery ? 0.8 : 1 });
  }
  bboxOutline.addTo(map);
  // Site check: at street zoom the grey canvas hides what the pipes connect to,
  // so zooming to 15+ while on the dark canvas drops back to aerial
  // automatically. Only this rule and view changes switch the basemap on their
  // own; a manual pick in the Layers control is never overridden.
  map.on('zoomend', () => {
    if (map.getZoom() >= 15 && basemap === 'canvas-dark') {
      basemap = 'aerial-labels'; store.set('basemap', basemap); setTiles(); CA().restyleDa(); MA().syncMapOpts();
    }
  });

  function setOrientation(o) {
    if (!canRotate) return;
    orientation = o; store.set('orientation', o);
    map.setBearing(o === 'grid' ? GRID_BEARING : 0);
    const sel = $('#opt-orient'); if (sel) sel.value = o;
    ML().scheduleLabels(); AS().updateNorth();
  }
const getBasemap = () => basemap;
function setBasemap(b) { basemap = b; store.set('basemap', b); }
const getOrientation = () => orientation;

// ---- Public contract ------------------------------------------------------------------
const api = { map, setTiles, getBasemap, setBasemap, setAerialOpacity, getAerialOpacity, getOrientation, setOrientation, canRotate, BASEMAPS, ORIENTATIONS, GRID_BEARING, esriLayer, DATA_ATTR };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
else root.PeelMapCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
