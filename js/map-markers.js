(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc, fmtNum, store, token, phaseColor, dot, getColors, PIPE_RESULTS } = window.PeelUtil;
  const P = window.PeelPhases;
  const D = window.PeelDemand;
  const PD = window.PeelDesign;
  const map = window.PeelMapCore.map;
  const MC = () => window.PeelMapCore;
  const ML = () => window.PeelMapLabels;
  const CA = () => window.PeelCensusAreas;
  const Nav = () => window.PeelDevNav;
  const ST = () => window.PeelSewerTrace;
  const MA = () => window.PeelMapAnalysis;
  const SD = () => window.PeelSvcData;
  const SC = () => window.PeelSewerCap;
  const AC = () => window.PeelAerialCheck;
  const WT = () => window.PeelWaterTrace;
  const MP = () => window.PeelMasterPlan;
  const PA = () => window.PeelPlanAreas;
  const AS = () => window.PeelAreaSelect;
  const SvcTab = () => window.PeelSvcTab;
  const DI = () => window.PeelDcInfra;
  const EP = () => window.PeelExistPipes;
  const App = () => window.PeelApp;

  // Developments on / off (every view), and in the Wastewater view the growth layers shown on the
  // map and loaded onto the sewers: census (existing), built since, site plan approved, proposed.
  let devsOn = store.get('devsOn', true) !== false;
  let wwLay = { existing: true, built: true, approved: true, proposed: true, ...(store.get('wwLay', {}) || {}) };
  const isWW = () => store.get('mapView', 'planning') === 'wastewater';
  const wwOn = k => !isWW() || wwLay[k] !== false;
  let svcOn = { pz: !!store.get('svc-pz', false), dr: !!store.get('svc-dr', false), bk: !!store.get('svc-bk', false) };
  const blockSwatch = '<svg class="da-swatch" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true"><rect x="3" y="2" width="16" height="10" style="fill:var(--block);stroke:var(--block)" fill-opacity=".14" stroke-width="1.8"/></svg>';
  const svcSwatch = k => `<svg class="da-swatch" viewBox="0 0 22 14" width="22" height="14" aria-hidden="true">${k === 'pz'
    ? '<rect x="3" y="2" width="16" height="10" rx="1" style="fill:var(--svc-drainage);stroke:var(--svc-drainage)" fill-opacity=".1" stroke-width="1.6" stroke-dasharray="3 2"/>'
    : '<rect x="3" y="2" width="8" height="10" style="fill:var(--pl-booth);stroke:var(--pl-booth)" fill-opacity=".25"/><rect x="11" y="2" width="8" height="10" style="fill:var(--pl-clarkson);stroke:var(--pl-clarkson)" fill-opacity=".25"/>'}</svg>`;
  const MSTYLE = {
    color: { phase: 'Stage', layer: 'Counted as', plant: 'Receiving plant', quality: 'Data quality', timing: 'Servicing timing (2026 DC)' },
    size: { fixed: 'Same size', units: 'Planned homes', pop: 'People + jobs' },
    show: { markers: 'Markers' },   // (Stage 2: the heatmap is removed; an old 'heat' falls back to markers)
    cap: { off: 'Off', growth: 'Catchment flow growth', ps: 'Pumping station load', pipes: 'Sewer pipe capacity', zone: 'Pressure zone growth' },
  };
  if (!PIPE_RESULTS) delete MSTYLE.cap.pipes;   // pipe-by-pipe capacity is off for now
  let mstyle = Object.assign({ color: 'phase', size: 'units', cap: 'off', show: 'markers' }, store.get('mapStyle', null) || {});
  for (const k of Object.keys(MSTYLE)) if (!MSTYLE[k][mstyle[k]]) mstyle[k] = Object.keys(MSTYLE[k])[0];
  const THIS_YEAR = new Date().getFullYear();
  // Existing pipes layer (live): which kinds are shown.
  let existOn = Object.assign({ water: false, sanitary: false, storm: false }, store.get('existOn', {}) || {});
  // Pipe size labels on the existing pipes and the sewer capacity layer.
  let pipeLbl = store.get('pipeLabels', false) === true;
  // Planned works layer (2026 DC capital maps): on / off and which system.
  let dcOn = { on: !!store.get('dcOn', false), sys: store.get('dcSys', 'both') };
  // Map views: presets of the layers and style, each remembering its last settings.
  // The lenses (SPEC §4): Planning / Water / Wastewater / Capital ('dc' stays the key for saved views and links).
  const MAP_VIEWS = [['planning', 'Planning'], ['water', 'Water'], ['wastewater', 'Wastewater'], ['dc', 'Capital']];
  // Sewer pipe screen state and classes (used by the legend from the first render).
  const SEW = { data: null, loading: null, grid: null, growth: null, key: '' };
  // Sewer load as a share of full-pipe capacity, with its flow state: [upper %,
  // token name, legend, short state]. Token names are resolved to `var(--*)` in
  // HTML and to computed values via token() for Leaflet/canvas.
  const PIPE_CLS = [[85, '--cap-room', 'under 85%: free flowing', 'Free flowing', 'under 85%'], [100, '--cap-tight', '85–100%: near full', 'Near full', '85–100%'], [Infinity, '--cap-over', 'over 100%: surcharged', 'Surcharged', 'over 100%']];
  const pipeState = r => r == null || isNaN(r) ? null : PIPE_CLS.find(([t]) => r * 100 < t) || PIPE_CLS[PIPE_CLS.length - 1];
  const EXIST_STYLE = { water: { color: '--pipe-water', label: 'Watermain' }, sanitary: { color: '--pipe-sanitary', label: 'Sanitary sewer' }, storm: { color: '--pipe-storm', label: 'Storm sewer' } };
  const EXIST_ZOOM = 15;
  // Map control: MC().getBasemap() + label pickers.
  // Planning area outlines on the map (secondary plans / character areas, MTSAs): tap one to filter.
  // Site boundary on hover (More settings): on / off and the reach in screen pixels.
  const hov = { on: true, r: 40, ...(store.get('hoverPoly', {}) || {}) };
  // First visit: the Planning view's preset shows the planning context (plan areas and MTSAs).
  const firstPlanning = store.get('mapView', 'planning') === 'planning';
  const areaOn = { sp: store.get('areaSp', firstPlanning) === true, mtsa: store.get('areaMtsa', firstPlanning) === true, pr: store.get('areaPr', false) === true };
  // Site constraint layers (js/constraints.js owns them; the switches read the saved state).
  const cxOn = { ...(store.get('cxOn', {}) || {}) };
  const CN = () => window.PeelConstraints;
  // The Layers panel is six groups (js/layer-groups.js). Its switches start from the saved state
  // (the modules that own each layer may load after this one); PeelLayerGroups.sync() follows them.
  const LG = () => window.PeelLayerGroups;
  function initialOn() {
    const hill = store.get('hillshade', false) === true, cx = store.get('cxOn', {}) || {}, wf = (WT() || {}).WF;
    const ce = store.get('ceOn', {}) || {};
    const m = { cons: !!ce.cons, ea: !!ce.ea, devs: devsOn, hov: hov.on, cap: mstyle.cap !== 'off', pz: svcOn.pz, bk: svcOn.bk, dr: svcOn.dr, 'ex-water': existOn.water, 'ex-sanitary': existOn.sanitary, 'ex-storm': existOn.storm, wf: wf ? wf.on : false, dcw: dcOn.on, sp: areaOn.sp, pr: areaOn.pr, mtsa: areaOn.mtsa, da: CA().getDaOn(), hill };
    for (const [k, v] of Object.entries(cx)) m[k] = !!v;
    return new Set(Object.keys(m).filter(k => m[k]));
  }
  function layerSwatch(L0) {
    const c = L0.color ? `var(${L0.color})` : '';
    switch (L0.sw) {
      case 'dev': return '<i class="dev-sw" aria-hidden="true"></i>';
      case 'cap': return '<i class="lg-line" style="background:linear-gradient(90deg,var(--cap-room) 0 33%,var(--cap-tight) 33% 66%,var(--cap-over) 66%)"></i>';
      case 'svc-pz': return svcSwatch('pz');
      case 'svc-dr': return svcSwatch('dr');
      case 'block': return blockSwatch;
      case 'wf': return '<i class="wf-ic wf-pumping wf-sw" aria-hidden="true">▲</i>';
      case 'da': return CA().daSwatch();
      case 'area': return `<i class="lg-area" style="--c:${c}"></i>`;
      case 'dash': return `<i class="lg-line" style="background:repeating-linear-gradient(90deg,${c} 0 6px,transparent 6px 9px)"></i>`;
      case 'line': return `<i class="lg-line" style="background:${c}"></i>`;
      default: return '';
    }
  }
  const MapOptions = L.Control.extend({
    options: { position: 'topright' },
    onAdd() {
      const el = L.DomUtil.create('div', 'map-opts');
      const opts = (o, cur) => Object.entries(o).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${esc(typeof v === 'string' ? v : v.label)}</option>`).join('');
      const small = matchMedia('(max-width: 700px)').matches;
      // An on / off chip (a checkbox styled as a pill).
      const chip = (attrs, on, body, info) => `<label class="mo-chip"${info ? ` data-info="${info}"` : ''}><input type="checkbox" ${attrs}${on ? ' checked' : ''}><span>${body}</span></label>`;
      el.innerHTML = `
        <div class="mo-devs-off" id="mo-devs-off" hidden></div>
        <div class="mo-area-on" id="mo-area-on" hidden></div>
        <details class="mo-panel"${store.get('moPanelOpen', !small) ? ' open' : ''}><summary class="mo-panel-h"><span>Layers</span><span class="mo-inview" id="mo-inview" role="button" tabindex="0" title="The developments in this part of the map: open the In view list (it follows the map)"></span><span class="mo-psum" id="mo-psum"></span></summary>
        <div class="mo-layers lg-groups" role="group" aria-label="Map layers" data-info="map-layers">
          ${LG().panelHTML({ on: initialOn(), open: LG().getOpen(), inView: null, swatch: layerSwatch, view: (() => { const v = store.get('mapView', 'planning'); const m = MAP_VIEWS.find(x => x[0] === (v === 'servicing' ? 'water' : v)) || MAP_VIEWS[0]; return { key: m[0], label: m[1] }; })(), extra: {
            infra: '<div id="ce-settings"></div><small id="exist-note" data-info="existing-pipes"></small>',
            cx: '<small class="cx-note" id="cx-note"></small>',
            base: `<label class="mo-sel" data-info="opt-basemap"><span>Background</span><select id="opt-basemap">${opts(MC().BASEMAPS, MC().getBasemap())}</select></label>
              <label class="mo-sel" data-info="opt-labels"><span>Labels</span><select id="opt-labels">${opts(ML().LABEL_MODES, ML().getLabelMode())}</select></label>
              <label class="mo-range" data-info="opt-basemap"><span>Aerial opacity</span><input type="range" id="opt-aerial" min="20" max="100" step="10" value="${Math.round(MC().getAerialOpacity() * 100)}" aria-label="Aerial photo opacity, percent"><b id="opt-aerial-v">${Math.round(MC().getAerialOpacity() * 100)}%</b></label>
              ${MC().canRotate ? `<label class="mo-sel" data-info="opt-orient"><span>Orientation</span><select id="opt-orient">${opts(MC().ORIENTATIONS, MC().getOrientation())}</select></label>` : ''}`,
          } })}
        </div>
        <details class="mo-more mo-adv"${store.get('moOpen', false) ? ' open' : ''}><summary>More settings</summary>
        <div class="mo-sec" data-info="saved-views"><div class="mo-h">Saved views</div>
          <div class="mo-saved"><select id="opt-saved" aria-label="Saved views"></select><button type="button" class="btn small link" id="opt-saved-del" hidden>Delete</button></div>
        </div>
        <div class="mo-sec"><div class="mo-h">Developments</div>
          <label data-info="map-color"><span>Colour</span><select id="opt-mcolor">${opts(MSTYLE.color, mstyle.color)}</select></label>
          <label data-info="map-size"><span>Size</span><select id="opt-msize">${opts(MSTYLE.size, mstyle.size)}</select></label>
          <label class="mo-range" data-info="hover-boundary"><span>Boundary reach</span><input type="range" id="opt-hovr" min="10" max="120" step="5" value="${hov.r}" aria-label="How close the pointer must be to a development to outline its site, in screen pixels"><b id="opt-hovr-v">${hov.r} px</b></label>
        </div>
        <div class="mo-sec"><div class="mo-h">Capacity colours</div>
          <label data-info="map-capacity"><span>Shade</span><select id="opt-mcap">${opts(MSTYLE.cap, mstyle.cap)}</select></label>
        </div>
        <div class="mo-sec"><div class="mo-h">Pipes and works</div>
          <div class="mo-chips">${chip('id="opt-pipelbl"', pipeLbl, '<b class="pl-sw">300</b>Size labels', 'pipe-labels')}</div>
          <div class="mo-row" data-info="dc-works"><span class="mo-k">DC works</span><div class="mo-chips">${[['water', 'Water', '--dc-w-feed'], ['wastewater', 'Wastewater', '--dc-ww-main']].map(([k, t, c]) => chip(`data-dcsys="${k}"`, dcOn.on && (dcOn.sys === 'both' || dcOn.sys === k), `<i class="lg-line" style="background:var(${c})"></i>${t}`)).join('')}</div></div>
          <button type="button" class="btn small link mo-dct" data-info="dc-needs" id="opt-dctiming">DC timing: capacity vs DC projects →</button>
        </div>
        </details>
        </details>
        <small id="label-note"></small>`;
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
      el.querySelector('.mo-adv').addEventListener('toggle', e => { if (e.target.classList.contains('mo-adv')) store.set('moOpen', e.target.open); });
      // The Layers switches: one per layer, each with a sensible default for the view.
      el.querySelector('.mo-panel').addEventListener('toggle', e => { if (e.target.classList.contains('mo-panel')) store.set('moPanelOpen', e.target.open); });
      el.querySelector('#mo-devs-off').addEventListener('click', e => { if (e.target.closest('[data-devs-show]')) SD().showAllDevs(); });
      el.querySelector('#mo-area-on').addEventListener('click', e => { if (e.target.closest('[data-areas-clear]')) SD().clearAreaFilters(); });
      el.querySelector('#opt-saved').onchange = e => { const i = e.target.value; $('#opt-saved-del').hidden = i === ''; if (i !== '') MA().openSavedView(+i); };
      el.querySelector('#opt-saved-del').onclick = () => { const i = $('#opt-saved').value; if (i === '') return; const list = MA().savedViews(); if (!confirm(`Delete the saved view “${list[+i].name}”?`)) return; list.splice(+i, 1); store.set('savedViews', list); MA().renderSavedViews(); };
      el.querySelector('#opt-hovr').oninput = e => { AS().setHov({ r: +e.target.value }); document.querySelector('#opt-hovr-v').textContent = `${hov.r} px`; };
      el.querySelector('#opt-basemap').onchange = e => { MC().setBasemap(e.target.value); store.set('basemap', e.target.value); MC().setTiles(); CA().restyleDa(); };
      el.querySelector('#opt-labels').onchange = e => { ML().setLabelMode(e.target.value); store.set('labelMode', e.target.value); ML().updateLabels(); };
      el.querySelector('#opt-pipelbl').onchange = e => { pipeLbl = e.target.checked; store.set('pipeLabels', pipeLbl); EP().renderExisting(); if (mstyle.cap === 'pipes') MA().renderCapLayer(); };
      el.querySelector('#opt-dctiming').onclick = () => { if (typeof MP().showDcTiming === 'function') { SC().loadSewers(); MP().showDcTiming(); } };
      el.querySelectorAll('[data-dcsys]').forEach(c => { c.onchange = () => {
        const on = k => document.querySelector(`[data-dcsys="${k}"]`).checked, w = on('water'), ww = on('wastewater');
        MA().setDcOn({ on: w || ww, sys: w && ww ? 'both' : w ? 'water' : ww ? 'wastewater' : dcOn.sys });
      }; });
      el.querySelector('#opt-mcolor').onchange = e => MA().setMapStyle({ color: e.target.value });
      el.querySelector('#opt-msize').onchange = e => MA().setMapStyle({ size: e.target.value });
      el.querySelector('#opt-mcap').onchange = e => MA().setMapStyle({ cap: e.target.value });
      const orient = el.querySelector('#opt-orient');
      if (orient) orient.onchange = e => MC().setOrientation(e.target.value);
      el.querySelector('#opt-aerial').oninput = e => { MC().setAerialOpacity(+e.target.value / 100); el.querySelector('#opt-aerial-v').textContent = `${e.target.value}%`; };
      // The group headers, group switches and every layer switch (js/layer-groups.js).
      LG().bind(el);
      return el;
    },
  });
  new MapOptions().addTo(map);
  // Phase 2: "More settings" merged back into the Layers panel above (its .mo-adv details never
  // left .map-opts), and the "Filter by area" map box was removed — the municipality chips and
  // the sp / mtsa / pz / dr dropdowns live in the filter panel (#f-muni, #f-areas). AREA_F below
  // still defines those lists for the filter panel and the summaries.
  const AREA_F = {
    sp: { label: 'Secondary plan', all: 'All areas', find: 'Find a plan…', info: 'secondary-plans', one: 'area' },
    mtsa: { label: 'MTSA', all: 'All MTSAs', find: 'Find an MTSA…', info: 'mtsa', one: 'MTSA' },
    pz: { label: 'Pressure zone', all: 'All pressure zones', find: 'Find a zone…', info: 'pressure-zone', one: 'zone', svc: true },
    dr: { label: 'Drainage area', all: 'All drainage areas', find: 'Find an area…', info: 'drainage-area', one: 'area', svc: true },
  };
  // Map height for the CSS caps on the Layers panel and its legend section.
  const setMapH = () => map.getContainer().style.setProperty('--map-h', `${map.getSize().y}px`);
  setMapH(); map.on('resize', setMapH);
  if (CA().getDaOn()) CA().setDaLayer(true);

  // Cluster icon: ring segments show the phase mix of the projects inside.
  const cluster = L.markerClusterGroup({
    chunkedLoading: true, showCoverageOnHover: false, maxClusterRadius: 50, spiderfyOnMaxZoom: true,
    // At street zoom every project gets its own tappable marker (neighbouring houses
    // otherwise stay grouped and a tap only zooms in).
    disableClusteringAtZoom: 17,
    iconCreateFunction(c) {
      const kids = c.getAllChildMarkers();
      // Ring: the mix by the marker colour (phase / layer / plant), weighted by count, or by
      // people + jobs when markers are sized; the number is the count or the people + jobs.
      const sized = mstyle.size === 'pop' || mstyle.size === 'units', byUnits = mstyle.size === 'units';
      const w = new Map(), col = new Map();
      let tot = 0;
      for (const m of kids) { const v = !sized ? 1 : byUnits ? m.options.units || 0 : m.options.pop || 0; tot += v; w.set(m.options.cat, (w.get(m.options.cat) || 0) + v); col.set(m.options.cat, m.options.col); }
      const order = mstyle.color === 'phase' ? P.ALL_PHASES.map(p => p.key) : mstyle.color === 'layer' ? Object.keys(LAYER_NAME) : mstyle.color === 'quality' ? Object.keys(QUALITY) : mstyle.color === 'timing' ? Object.keys(TIMING) : [...w.keys()].sort();
      let acc = 0; const stops = [];
      for (const k of order) {
        const n = w.get(k); if (!n) continue;
        const a0 = acc / (tot || 1) * 360; acc += n; const a1 = acc / (tot || 1) * 360;
        stops.push(`${col.get(k)} ${a0}deg ${a1}deg`);
      }
      if (!stops.length) stops.push('var(--nodata) 0deg 360deg');
      const n = kids.length;
      const size = byUnits ? (tot < 500 ? 32 : tot < 5000 ? 40 : tot < 20000 ? 48 : 56) : sized ? (tot < 1000 ? 32 : tot < 10000 ? 40 : tot < 50000 ? 48 : 56) : n < 10 ? 30 : n < 100 ? 36 : n < 1000 ? 42 : 50;
      // The number says what it counts: developments, planned homes, or people + jobs (a word under it
      // where the circle has room; the legend and the hover say it in full).
      // (sized by homes but none stated in the cluster: it counts its sites instead of showing 0)
      const noUnits = byUnits && tot < 0.5;
      const unitWord = noUnits ? 'sites' : byUnits ? 'homes' : sized ? (size >= 48 ? 'ppl+jobs' : '') : 'sites';
      return L.divIcon({
        className: 'pm',
        iconSize: [size, size],
        html: `<div class="pc" style="width:${size}px;height:${size}px;background:conic-gradient(${stops.join(',')})" title="${fmtNum(n)} developments${byUnits ? ` · ${fmtNum(Math.round(tot))} planned homes` : sized ? ` · ${fmtNum(Math.round(tot))} people + jobs at build-out` : ''}${mstyle.color === 'phase' ? `\n${P.ALL_PHASES.map(ph => [ph, kids.filter(m => m.options.phase === ph.key).length]).filter(x => x[1]).map(([ph, k]) => `${k} ${ph.label.toLowerCase()}`).join(' · ')}` : ''}"><span style="width:${size - 14}px;height:${size - 14}px"><b>${sized && !noUnits ? shortNum(tot) : n >= 1000 ? (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k' : n}</b>${unitWord && size >= 40 ? `<small>${unitWord}</small>` : ''}</span></div>`,
      });
    },
  });
  map.addLayer(cluster);
  // ---- Sites on the map: application boundaries and the individual permits inside them
  // Site boundaries draw at every zoom; building-permit dots from street zoom (capped).
  const SITE_ZOOM = 14, SITE_MAX_POINTS = 3000;
  const canvas = L.canvas({ padding: 0.3 });
  // The selected project shares the same canvas (a second, empty canvas stacked on top
  // would swallow taps meant for the dots below it); it is kept on top by draw order.
  const focusCanvas = canvas;
  const siteLayer = L.layerGroup().addTo(map);   // every visible site, from street zoom
  const focusLayer = L.layerGroup().addTo(map);  // the selected project, at any zoom
  const sitePermits = p => p.records.filter(r => r.kind === 'permit' && r.lat != null);
  const siteApps = p => p.records.filter(r => r.kind === 'application' && r.poly && r.phase !== 'cancelled');
  const toLatLngs = rings => rings.map(ring => ring.map(([x, y]) => [y, x]));
  function projectBounds(p) {
    if (p._bounds) return p._bounds;
    const pts = [];
    for (const a of siteApps(p)) for (const ring of a.poly) for (const [x, y] of ring) pts.push([y, x]);
    for (const r of sitePermits(p)) pts.push([r.lat, r.lng]);
    if (p.lat != null) pts.push([p.lat, p.lng]);
    return (p._bounds = pts.length ? L.latLngBounds(pts) : null);
  }
  // Applications a permit sits inside, smallest first (fallback: all of the project's applications).
  function parentApps(r, p) {
    const apps = p.records.filter(a => a.kind === 'application' && a.phase !== 'cancelled');
    const inside = apps.filter(a => a.poly && P.pointInRings(r.lng, r.lat, a.poly))
      .sort((a, b) => P.ringsArea(a.poly) - P.ringsArea(b.poly));
    return inside.length ? inside : apps;
  }
  // Application boundaries are tappable: anywhere inside opens the project, or, for a site
  // plan nested in a larger development, that application (with a link to the whole project).
  // Selected developments are outlined in cyan (nothing else uses it), over a dark / light halo so the
  // outline reads on aerial photos and on the grey map alike.
  const selColor = () => token('--select');
  const haloColor = () => token('--halo');
  function outline(p, strong, unloaded) {
    const apps = siteApps(p);
    const biggest = Math.max(...apps.map(a => P.ringsArea(a.poly)));
    return apps.map(a => {
      const area = P.ringsArea(a.poly);
      // Application boundaries in the project's phase colour with a light fill (the census
      // areas are the white lines); the selected project is outlined in cyan.
      const ph = phaseColor(p.phase);
      // A development whose layer is off in Wastewater loads: its boundary stays, dashed and faint.
      const poly = L.polygon(toLatLngs(a.poly), {
        renderer: strong ? focusCanvas : canvas, color: strong ? selColor() : ph, weight: strong ? 3 : 1.6,
        opacity: strong ? 1 : unloaded ? 0.75 : 0.9, fill: true, fillColor: strong ? selColor() : ph, fillOpacity: strong ? 0.2 : unloaded ? 0.05 : 0.12,
        dashArray: unloaded && !strong ? '5 4' : null,
      });
      poly._area = area;
      if (strong) poly._halo = L.polygon(toLatLngs(a.poly), { renderer: focusCanvas, color: haloColor(), weight: 7, opacity: 0.55, fill: false, interactive: false });
      const nested = apps.length > 1 && area < biggest * 0.6;
      poly.bindTooltip(window.PeelUtil.hoverCard({ kind: `File · ${a.type || 'application'}`, name: a.ref || a.type || 'Application', value: a.units ? fmtNum(a.units) : null, sub: a.units ? `units · ${a.address || p.title}` : a.address || p.title,
        html: unloaded ? `<span class="muted">Not in the wastewater loads (${esc(LAYER_NAME[svcLayerOf(p)] || svcLayerOf(p))} off)</span>` : '', open: nested ? 'open this file' : 'open the development' }), { className: 'pt', sticky: true });
      poly.on('click', ev => { L.DomEvent.stop(ev); const sub = nested && Nav().isFormal(a) && Nav().subProject(p, a.ref); if (sub) Nav().showDetail(sub); else if (nested) AC().showRecordDetail(a, p); else Nav().showDetail(p); });
      return poly;
    });
  }
  function permitDot(r, p, emph, focus) {
    const m = L.circleMarker([r.lat, r.lng], {
      renderer: focus ? focusCanvas : canvas, radius: emph ? 9 : 5, weight: emph ? 4 : 1.5,
      color: emph ? selColor() : token('--sym-outline'), fillColor: phaseColor(r.phase), fillOpacity: 1,
    });
    const parent = parentApps(r, p)[0];
    m.bindTooltip(window.PeelUtil.hoverCard({ kind: `Building permit · ${P.PHASE_BY_KEY[r.phase].label}`, name: r.address || r.ref, value: r.units ? fmtNum(r.units) : null, sub: r.units ? `unit${r.units === 1 ? '' : 's'}${parent ? ` · part of ${parent.ref || parent.type || 'application'}` : ''}` : parent ? `Part of ${parent.ref || parent.type || 'application'}` : '', open: 'open this file' }), { className: 'pt', direction: 'top', offset: [0, -6] });
    m.on('click', ev => { L.DomEvent.stop(ev); AC().showRecordDetail(r, p); });
    return m;
  }
  let siteTimer;
  const scheduleSites = () => { clearTimeout(siteTimer); siteTimer = setTimeout(renderSiteLayer, 80); };
  function renderSiteLayer() {
    siteLayer.clearLayers();
    const view = map.getBounds().pad(0.2), withDots = map.getZoom() >= SITE_ZOOM;
    let n = 0;
    const polys = [], dots = [];
    for (const p of App().state.filtered) {
      // Boundaries show whatever the Wastewater loads switches (those only change what's counted).
      if (!siteApps(p).length || !devsOn) continue;
      const b = projectBounds(p);
      if (!b || !view.intersects(b)) continue;
      const unloaded = !SD().devShown(p);
      // Reuse a development's outline while its look is unchanged (thousands draw when zoomed out).
      const sig = `${unloaded}|${getColors()[p.phase]}`;
      if (!p._ol || p._ol.sig !== sig) p._ol = { sig, polys: outline(p, false, unloaded) };
      polys.push(...p._ol.polys);
      if (unloaded || !withDots || n >= SITE_MAX_POINTS) continue;
      for (const r of sitePermits(p)) {
        if (n++ >= SITE_MAX_POINTS) break;
        if (view.contains([r.lat, r.lng])) dots.push(permitDot(r, p, false));
      }
    }
    // Largest boundaries first so smaller ones (and then permit dots) sit on top and get the tap.
    polys.sort((a, b) => b._area - a._area).forEach(l => siteLayer.addLayer(l));
    dots.forEach(l => siteLayer.addLayer(l));
    // Keep the selected project's outline and dots drawn above the others.
    focusLayer.eachLayer(l => l.bringToFront && l.bringToFront());
  }
  map.on('moveend zoomend', scheduleSites);
  // An application opened on its own from a larger development: the whole development stays
  // outlined (cyan, dashed and lighter) and the application stands out in solid cyan.
  const subColor = () => token('--select');
  const hoverSubLayer = L.layerGroup().addTo(map);
  const subPoly = (rings, opt = {}) => L.polygon(toLatLngs(rings), { renderer: focusCanvas, color: subColor(), weight: 4, opacity: 1, fill: true, fillColor: subColor(), fillOpacity: 0.28, interactive: false, ...opt });
  function highlight(p, record) {
    focusLayer.clearLayers(); hoverSubLayer.clearLayers();
    if (!p) return;
    const withHalo = o => { if (o._halo) focusLayer.addLayer(o._halo); focusLayer.addLayer(o); };
    if (p.parent) {
      for (const o of outline(p.parent, true).sort((a, b) => b._area - a._area)) { o.setStyle({ weight: 2, fillOpacity: 0.06, dashArray: '6 4' }); focusLayer.addLayer(o); }
      for (const a of siteApps(p)) { focusLayer.addLayer(subPoly(a.poly, { color: haloColor(), weight: 8, opacity: 0.55, fill: false })); focusLayer.addLayer(subPoly(a.poly)); }
      for (const r of sitePermits(p)) if (r !== record) focusLayer.addLayer(permitDot(r, p, false, true));
      return;
    }
    for (const o of outline(p, true).sort((a, b) => b._area - a._area)) withHalo(o);
    for (const r of sitePermits(p)) if (r !== record) focusLayer.addLayer(permitDot(r, p, false, true));
    if (record && record.lat != null) {
      focusLayer.addLayer(L.circleMarker([record.lat, record.lng], { renderer: focusCanvas, radius: 9, weight: 8, color: haloColor(), opacity: 0.55, fill: false, interactive: false }));
      focusLayer.addLayer(permitDot(record, p, true, true));
    }
  }
  cluster.on('animationend spiderfied unspiderfied', () => ML().scheduleLabels());
  const iconCache = {};
  // 32 px tap target around a 16 px dot.
  const iconFor = phase => iconCache[phase] || (iconCache[phase] = L.divIcon({ className: 'pm pm-hit', iconSize: [32, 32], html: dot(phase) }));
  // ---- Marker style (map options): colour by phase, servicing layer or receiving plant; size
  // the same or by build-out people + jobs; clusters show the mix and, when sized, the total.
  const LAYER_NAME = { existing: 'Existing (built before the census)', built: 'Built since the census', approved: 'Committed (draft plan or site plan approved)', proposed: 'Proposed (in review)', out: 'Withdrawn / refused' };
  // The layer tokens (SPEC §2): one hue, lightness = certainty.
  const layerColors = () => ({ existing: 'var(--ly-existing)', built: 'var(--ly-built)', approved: 'var(--ly-committed)', proposed: 'var(--ly-proposed)', out: 'var(--nodata)' });
  // Servicing layer of a development, as in the Water / Wastewater tables.
  function svcLayerOf(p) {
    if (p.phase === 'cancelled') return 'out';
    if (p.phase === 'completed') { const bc = App().state.censuses && CA().baselineCensus(); return bc && +p.milestones.completed < +new Date(`${bc.date}T00:00:00Z`) ? 'existing' : 'built'; }
    return D.isCommitted(p) ? 'approved' : 'proposed';
  }
  const plantOfDev = p => { const a = App().state.servicing && SD().svcIds(p, 'dr').map(id => SD().svcById.get(id)).filter(Boolean)[0]; return a ? a.plant : 'none'; };
  // Data quality: what to check before relying on a development's numbers. One blue, darker = more to
  // check, grey = nothing to check (red / amber / green are for capacity only).
  const QUALITY = {
    far: ['var(--q-4)', 'No zone / catchment within 5 km'], near: ['var(--q-3)', 'Assigned to the nearest area'],
    nounits: ['var(--q-2)', 'No units or floor area stated'], estarea: ['var(--q-1)', 'Site area estimated (no boundary)'], ok: ['var(--nodata)', 'Complete'],
  };
  function qualityOf(p) {
    if (App().state.servicing && p.lat != null && !SD().svcIds(p, 'dr').length && !SD().svcIds(p, 'pz').length) return 'far';
    if (App().state.servicing && (SD().nearOf(p, 'dr') || SD().nearOf(p, 'pz'))) return 'near';
    if (!(p.units > 0) && !(App().jobsOf(p) > 0)) return 'nounits';
    if (!(p.siteAreaHa > 0)) return 'estarea';
    return 'ok';
  }
  // Servicing timing: construction year of the planned main (wastewater or water, within 400 m)
  // a development would connect to, from the 2026 DC maps; none = the existing network. One teal
  // darkening by year, grey on the existing network (red / amber / green are for capacity only).
  const TIMING = { none: ['var(--nodata)', 'On the existing network'], y27: ['var(--time-1)', `Connects via a planned main by ${THIS_YEAR + 1}`], y30: ['var(--time-2)', 'Planned main 2028–2030'], y35: ['var(--time-3)', 'Planned main 2031–2035'], y36: ['var(--time-4)', 'Planned main 2036 or later'], far: ['var(--time-far)', 'Outside the network, no planned main within 1 km'] };
  function timingOf(p) {
    if (p._dcT !== undefined) return p._dcT;
    const pt = p.lat == null ? null : [p.lng, p.lat];
    const outs = [!(p.dr && p.dr.length) && 'wastewater', !(p.pz && p.pz.length) && 'water'].filter(Boolean);
    if (!outs.length || !pt) return (p._dcT = 'none');
    const ns = outs.map(sys => DI().dcNearest(sys, pt, DI().DC_CONNECT_M));
    if (!ns.some(Boolean)) return (p._dcT = 'far');
    const y = Math.max(0, ...ns.filter(Boolean).map(n => n.ln.y || 0));
    return (p._dcT = y <= THIS_YEAR + 1 ? 'y27' : y <= 2030 ? 'y30' : y <= 2035 ? 'y35' : 'y36');
  }
  function markerCat(p) {
    if (mstyle.color === 'timing') { const k = App().state.dcInfra ? timingOf(p) : 'none'; return [k, TIMING[k][0]]; }
    if (mstyle.color === 'quality') { const k = qualityOf(p); return [k, QUALITY[k][0]]; }
    if (mstyle.color === 'layer') { const k = svcLayerOf(p); return [k, layerColors()[k]]; }
    if (mstyle.color === 'plant') { const k = plantOfDev(p); return [k, `var(${SD().PLANT_TOKEN[k] || '--nodata'})`]; }
    return [p.phase, `var(--ph-${p.phase})`];
  }
  // Build-out people + jobs (cached per criteria).
  let popKey = '', popCache = new WeakMap();
  function popOf(p) {
    const k = JSON.stringify(App().state.criteria);
    if (k !== popKey) { popKey = k; popCache = new WeakMap(); }
    if (!popCache.has(p)) { const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf); popCache.set(p, e.population + e.employment.jobs); }
    return popCache.get(p);
  }
  const markerPx = pop => Math.min(46, Math.round((8 + 2.2 * Math.sqrt(Math.max(0, pop) / 10)) / 2) * 2);
  // By planned homes: a log scale, so an 8-unit infill and a 5,000-unit subdivision both read.
  const unitsPx = u => Math.min(44, Math.max(10, Math.round((8 + 4 * Math.log2(1 + Math.max(0, u || 0) / 10)) / 2) * 2));
  const styledIcons = new Map();
  function markerIcon(p) {
    if (mstyle.color === 'phase' && mstyle.size === 'fixed' && !(SvcTab().svcOpt.nr === 'on' && (p.drNear || p.pzNear))) return iconFor(p.phase);
    const [, col] = markerCat(p), d = mstyle.size === 'pop' ? markerPx(popOf(p)) : mstyle.size === 'units' ? unitsPx(p.units) : 14;
    const near = !!(App().state.servicing && (SD().nearOf(p, 'dr') || SD().nearOf(p, 'pz')));
    // Coloured by stage, a marker keeps its stage number where it has room (never colour alone).
    const glyph = mstyle.color === 'phase' && d >= 14 && !near ? P.PHASE_BY_KEY[p.phase].short : '';
    const gc = glyph ? window.PeelUtil.glyphColor(phaseColor(p.phase)) : '';
    const key = `${col}|${d}|${near}|${p.phase === 'cancelled'}|${glyph}|${gc}`;
    if (!styledIcons.has(key)) styledIcons.set(key, L.divIcon({ className: 'pm pm-hit', iconSize: [Math.max(d, 24), Math.max(d, 24)],
      html: `<span class="mk${near ? ' near' : ''}${p.phase === 'cancelled' ? ' out' : ''}${glyph ? ' g' : ''}" style="width:${d}px;height:${d}px;--mk:${col}${gc ? `;color:${gc}` : ''}">${esc(glyph)}</span>` }));
    return styledIcons.get(key);
  }
  const shortNum = n => n >= 1e4 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${Math.round(n)}`;
  let markerByKey = new Map();

  const api = {
    SEW, MSTYLE, mstyle, svcOn, areaOn, hov,
    getDcOn: () => dcOn, setDcOn: v => { dcOn = v; },
    getExistOn: () => existOn, setExistOn: v => { existOn = v; },
    getWwLay: () => wwLay, setWwLay: v => { wwLay = v; },
    getDevsOn: () => devsOn, setDevsOn: v => { devsOn = v; },
    isWW, wwOn, THIS_YEAR, PIPE_CLS, LAYER_NAME, QUALITY, TIMING,
    EXIST_STYLE, EXIST_ZOOM, MAP_VIEWS, AREA_F, layerColors, svcLayerOf,
    plantOfDev, qualityOf, timingOf, markerCat, outline, highlight,
    hoverSubLayer, siteApps, sitePermits, parentApps, projectBounds, toLatLngs,
    subPoly, popOf, markerPx, unitsPx, markerIcon,
    get markerByKey() { return markerByKey; }, set markerByKey(v) { markerByKey = v; },
    cluster,
    renderSiteLayer, scheduleSites, selColor, shortNum, canvas, blockSwatch,
    svcSwatch, pipeState,
    get pipeLbl() { return pipeLbl; }, set pipeLbl(v) { pipeLbl = v; },
    iconCache,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMapMarkers = api;
})(typeof window !== 'undefined' ? window : globalThis);
