/* Layer groups (PeelLayerGroups): the Layers panel as six groups, the view presets, the fixed draw
 * order of the map's panes, and the layer state in share links and saved views.
 *
 *  1 Developments   developments, heatmap, site boundary on hover
 *  2 Capacity       capacity colours, pressure zones, wastewater blocks, drainage areas
 *  3 Infrastructure existing water / sanitary / storm pipes, water facilities, planned DC works;
 *                   "Other utilities": gas pipelines, hydro lines (approximate, off by default)
 *  4 Constraints    regulation limits, floodplain, Greenbelt, Oak Ridges Moraine, Niagara
 *                   Escarpment, PSW / ANSI, Natural Heritage System, source protection (not
 *                   included), watercourses
 *  5 Planning context secondary plans / character areas, precincts, MTSAs, census areas
 *  6 Base map       background, lidar hillshade, labels, aerial opacity, orientation
 *
 * The pure parts (groups, presets, draw order, encode / decode, the panel's HTML) are tested in
 * Node; the browser part reads and sets each layer through the module that owns it.
 */
(function (root) {
  'use strict';
  // ---- Draw order (bottom → top): pane z-index for every module that makes a pane ---------------
  // base map → hillshade → constraints (fills ≤ 25%) → planning areas (outlines) → capacity →
  // infrastructure → (EAs) → developments → selection / trace.
  const Z = { imagery: 150, tiles: 200, hill: 210, cx: 300, da: 320, plan: 330, svc: 360, exist: 370, infra: 380, overlay: 400, markers: 600, flow: 640, sel: 650 };
  const DRAW_ORDER = [['base map', 'imagery'], ['hillshade', 'hill'], ['constraints', 'cx'], ['census areas', 'da'], ['planning areas', 'plan'], ['capacity', 'svc'], ['existing pipes', 'exist'], ['planned works', 'infra'], ['developments (site boundaries)', 'overlay'], ['developments (markers)', 'markers'], ['trace', 'flow'], ['selection', 'sel']];
  const CX_FILL_MAX = 0.25;

  // ---- Groups ---------------------------------------------------------------------------------------
  // Layer: [key, label, info key, swatch kind, colour token]; sub: a sub-heading before that layer.
  const GROUPS = [
    { key: 'devs', label: 'Developments', primary: ['devs'], layers: [['devs', 'Developments', 'devs-toggle', 'dev', null], ['heat', 'Heatmap (people + jobs)', 'map-show', 'heat', null], ['hov', 'Site boundary on hover', 'hover-boundary', 'dash', '--select']] },
    { key: 'cap', label: 'Capacity', primary: ['cap'], layers: [['cap', 'Capacity colours', 'map-capacity', 'cap', null], ['pz', 'Pressure zones', 'pressure-zone', 'svc-pz', null], ['bk', 'Wastewater blocks', 'blocks', 'block', null], ['dr', 'Drainage areas', 'drainage-area', 'svc-dr', null]] },
    { key: 'infra', label: 'Infrastructure', primary: ['ex-water', 'ex-sanitary'], layers: [['ex-water', 'Existing watermains', 'existing-pipes', 'line', '--pipe-water'], ['ex-sanitary', 'Existing sanitary sewers', 'existing-pipes', 'line', '--pipe-sanitary'], ['ex-storm', 'Existing storm sewers', 'existing-pipes', 'line', '--pipe-storm'], ['wf', 'Water facilities', 'water-facilities', 'wf', null], ['dcw', 'Planned DC works', 'dc-works', 'line', '--dc-ww-main'], ['gas', 'Gas pipelines (approximate)', 'cx-gas', 'dash', '--cx-gas'], ['hydro', 'Hydro lines (approximate)', 'cx-hydro', 'line', '--cx-hydro']], sub: { gas: 'Other utilities' } },
    { key: 'cx', label: 'Constraints', primary: ['reg', 'flood'], layers: [['reg', 'Regulation limits', 'cx-reg', 'area', '--cx-reg'], ['flood', 'Floodplain', 'cx-flood', 'area', '--cx-flood'], ['greenbelt', 'Greenbelt', 'cx-greenbelt', 'area', '--cx-greenbelt'], ['orm', 'Oak Ridges Moraine', 'cx-orm', 'area', '--cx-orm'], ['nep', 'Niagara Escarpment', 'cx-nep', 'area', '--cx-nep'], ['natural', 'PSW / ANSI', 'cx-natural', 'area', '--cx-natural'], ['nhs', 'Natural Heritage System', 'cx-nhs', 'area', '--cx-nhs'], ['source', 'Source protection (not included)', 'site-constraints', 'none', null], ['water', 'Watercourses', 'cx-water', 'line', '--cx-water']], disabled: { source: 'Not included in this app: see the CTC Source Protection Region maps' } },
    { key: 'plan', label: 'Planning context', primary: ['sp', 'mtsa'], layers: [['sp', 'Secondary plans / character areas', 'secondary-plans', 'dash', '--area-sp'], ['pr', 'Precincts', 'secondary-plans', 'dash', '--area-pr'], ['mtsa', 'MTSAs', 'mtsa', 'dash', '--area-mtsa'], ['da', '2021 census areas', 'da-layer', 'da', null]] },
    { key: 'base', label: 'Base map', primary: [], layers: [['hill', 'Lidar hillshade', 'hillshade', 'area', '--text-muted']] },
  ];
  const LAYER = new Map(GROUPS.flatMap(g => g.layers.map(([key, label, info, sw, color]) => [key, { key, label, info, sw, color, group: g.key, disabled: (g.disabled || {})[key] || null }])));
  const KEYS = [...LAYER.keys()];
  const groupOf = k => (LAYER.get(k) || {}).group || null;

  // ---- View presets -------------------------------------------------------------------------------
  // Everything off except Developments; each view adds its own (remembered per view after that).
  const PRESETS = {
    planning: ['devs', 'hov', 'sp', 'mtsa'],
    water: ['devs', 'hov', 'cap', 'pz', 'wf', 'ex-water'],
    wastewater: ['devs', 'hov', 'cap', 'bk', 'ex-sanitary'],
    dc: ['devs', 'hov', 'dcw'],
  };
  const presetFor = v => new Set(PRESETS[v] || PRESETS.planning);

  // ---- Share links and saved views ----------------------------------------------------------------
  // lg=<layer.layer…>~<open group.group…>; keys not in KEYS are dropped (links from later versions).
  function encode(on, open) {
    const ks = KEYS.filter(k => on.has(k)), gs = GROUPS.map(g => g.key).filter(g => (open || new Set()).has(g));
    return `${ks.join('.')}${gs.length ? `~${gs.join('.')}` : ''}`;
  }
  function decode(s) {
    if (s == null || s === '') return null;
    const [a, b] = String(s).split('~');
    return { on: new Set((a || '').split('.').filter(k => LAYER.has(k))), open: new Set((b || '').split('.').filter(g => GROUPS.some(x => x.key === g))) };
  }
  // A saved view or per-view memory from before the groups ({ da, wf, pz, dr, mstyle, exist, dc }):
  // the layers it named. Layers it did not name are left as they are (as they were before).
  function fromLegacy(s, { blocks = false } = {}) {
    if (!s || typeof s !== 'object') return null;
    const on = new Set(), named = new Set();
    const put = (k, v) => { named.add(k); if (v) on.add(k); };
    if ('da' in s) put('da', !!s.da);
    if ('wf' in s) put('wf', !!s.wf);
    if ('pz' in s) put('pz', !!s.pz);
    if ('dr' in s) put(blocks ? 'bk' : 'dr', !!s.dr);
    if (s.mstyle) { put('cap', s.mstyle.cap && s.mstyle.cap !== 'off'); put('heat', s.mstyle.show === 'heat'); }
    if (s.exist) for (const k of ['water', 'sanitary', 'storm']) put(`ex-${k}`, !!s.exist[k]);
    if (s.dc) put('dcw', !!s.dc.on);
    return { on, named };
  }

  // ---- Group header and summary ---------------------------------------------------------------------
  // "3 on · 2 in view" (or "off"); the folded summary names what is on.
  function headerText(g, on, inView) {
    const ks = g.layers.map(l => l[0]).filter(k => on.has(k));
    if (!ks.length) return 'off';
    const iv = ks.filter(k => !inView || inView.has(k)).length;
    return `${ks.length} on · ${iv} in view`;
  }
  function summaryText(g, on) {
    const names = g.layers.filter(l => on.has(l[0])).map(l => l[1].replace(/ \(approximate\)$/, ''));
    return names.length ? names.join(', ') : 'None on';
  }
  // The group switch: on if anything in it is on; switching it on turns on its primary layers.
  const groupOn = (g, on) => g.layers.some(l => on.has(l[0]));
  function groupToggle(g, on) {
    const next = new Set(on);
    if (groupOn(g, on)) for (const [k] of g.layers) next.delete(k);
    else for (const k of g.primary) next.add(k);
    return next;
  }

  // ---- The panel ----------------------------------------------------------------------------------------
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // swatch(layer) → HTML; extra[groupKey] → HTML after the group's switches (selects, notes).
  function panelHTML({ on, open, inView, swatch = () => '', extra = {} }) {
    return GROUPS.map(g => {
      const isOpen = open.has(g.key), gOn = groupOn(g, on);
      const rows = g.layers.map(([k]) => {
        const L0 = LAYER.get(k), sub = (g.sub || {})[k];
        const row = L0.disabled
          ? `<div class="mo-sw lg-off" data-info="${esc(L0.info)}" title="${esc(L0.disabled)}"><span class="mo-sw-l">${esc(L0.label)}</span><small class="muted">n/a</small></div>`
          : `<label class="mo-sw" data-info="${esc(L0.info)}"><span class="mo-sw-l">${swatch(L0)}${esc(L0.label)}</span><input type="checkbox" role="switch" id="lyr-${k}" data-lyr="${k}"${on.has(k) ? ' checked' : ''}><i class="mo-sw-t" aria-hidden="true"></i></label>`;
        return `${sub ? `<div class="lg-sub">${esc(sub)}</div>` : ''}${row}`;
      }).join('');
      return `<section class="lg-grp${isOpen ? ' open' : ''}" data-grp="${g.key}">
        <div class="lg-gh"><button type="button" class="lg-gt" data-grp-toggle="${g.key}" aria-expanded="${isOpen}" aria-controls="lg-b-${g.key}"><span class="lg-gn">${esc(g.label)}</span><span class="lg-gc" data-grp-count="${g.key}">${esc(headerText(g, on, inView))}</span></button>${g.primary.length ? `<label class="lg-gsw" title="${esc(`${gOn ? 'Turn off' : 'Turn on'} ${g.label.toLowerCase()}`)}"><input type="checkbox" role="switch" data-grp-switch="${g.key}" aria-label="${esc(g.label)}: all layers"${gOn ? ' checked' : ''}><i class="mo-sw-t" aria-hidden="true"></i></label>` : ''}</div>
        <div class="lg-gs" data-grp-sum="${g.key}"${isOpen ? ' hidden' : ''}>${esc(summaryText(g, on))}</div>
        <div class="lg-gb" id="lg-b-${g.key}"${isOpen ? '' : ' hidden'}>${rows}${extra[g.key] || ''}</div>
      </section>`;
    }).join('');
  }

  const pure = { Z, DRAW_ORDER, CX_FILL_MAX, GROUPS, LAYER, KEYS, groupOf, PRESETS, presetFor, encode, decode, fromLegacy, headerText, summaryText, groupOn, groupToggle, panelHTML };
  if (typeof module !== 'undefined' && module.exports) { module.exports = pure; return; }

  // ---- Browser: each layer through the module that owns it ------------------------------------------
  const W = root;
  const MM = () => W.PeelMapMarkers, MA = () => W.PeelMapAnalysis, SD = () => W.PeelSvcData, ST = () => W.PeelSewerTrace, WT = () => W.PeelWaterTrace;
  const CN = () => W.PeelConstraints, PA = () => W.PeelPlanAreas, CA = () => W.PeelCensusAreas, EL = () => W.PeelElevation, AS = () => W.PeelAreaSelect, App = () => W.PeelApp;
  const CXK = ['reg', 'flood', 'greenbelt', 'orm', 'nep', 'natural', 'nhs', 'water', 'gas', 'hydro'];
  const ADAPT = {
    devs: { get: () => MM().getDevsOn(), set: v => SD().setDevsOn(v) },
    heat: { get: () => MM().mstyle.show === 'heat', set: v => MA().setMapStyle({ show: v ? 'heat' : 'markers' }) },
    hov: { get: () => !!MM().hov.on, set: v => AS().setHov({ on: v }) },
    cap: { get: () => MM().mstyle.cap !== 'off', set: v => MA().setMapStyle({ cap: v ? (MA().currentView() === 'water' ? 'zone' : (W.PeelUtil || {}).PIPE_RESULTS ? 'pipes' : 'growth') : 'off' }) },
    pz: { get: () => !!MM().svcOn.pz, set: v => SD().setSvcLayer('pz', v) },
    bk: { get: () => !!MM().svcOn.bk, set: v => ST().setBlocksLayer(v) },
    dr: { get: () => !!MM().svcOn.dr, set: v => SD().setSvcLayer('dr', v) },
    'ex-water': { get: () => !!MM().getExistOn().water, set: v => MA().setExistOn({ water: v }) },
    'ex-sanitary': { get: () => !!MM().getExistOn().sanitary, set: v => MA().setExistOn({ sanitary: v }) },
    'ex-storm': { get: () => !!MM().getExistOn().storm, set: v => MA().setExistOn({ storm: v }) },
    wf: { get: () => !!(WT() && WT().WF.on), set: v => WT().setWfOn(v) },
    dcw: { get: () => !!MM().getDcOn().on, set: v => { const view = MA().currentView(); MA().setDcOn({ on: v, sys: view === 'water' ? 'water' : view === 'wastewater' ? 'wastewater' : 'both' }); } },
    sp: { get: () => !!MM().areaOn.sp, set: v => PA().setAreaOn({ sp: v }) },
    pr: { get: () => !!MM().areaOn.pr, set: v => PA().setAreaOn({ pr: v }) },
    mtsa: { get: () => !!MM().areaOn.mtsa, set: v => PA().setAreaOn({ mtsa: v }) },
    da: { get: () => !!CA().getDaOn(), set: v => CA().setDaLayer(v) },
    hill: { get: () => !!(EL() && EL().getHillshade()), set: v => EL() && EL().setHillshade(v) },
  };
  for (const k of CXK) ADAPT[k] = { get: () => !!(CN() && CN().getOn()[k]), set: v => CN() && CN().setOn({ [k]: v }) };
  const safe = f => { try { return f(); } catch (e) { return false; } };
  const onSet = () => new Set(KEYS.filter(k => ADAPT[k] && safe(ADAPT[k].get)));
  // In view: on, shown at this zoom, and (where the layer reports it) something drawn in view.
  function inViewSet(on) {
    const map = W.PeelMapCore && W.PeelMapCore.map, z = map ? map.getZoom() : 0, out = new Set();
    for (const k of on) {
      if (CXK.includes(k)) { if (CN() && CN().drawnCount && CN().drawnCount(k) > 0) out.add(k); continue; }
      if (k.startsWith('ex-')) { if (z >= (MM().EXIST_ZOOM || 15)) out.add(k); continue; }
      if (k === 'hill') { if (z >= ((EL() && EL().HILL_MIN_ZOOM) || 11)) out.add(k); continue; }
      out.add(k);
    }
    return out;
  }
  const store = () => W.PeelUtil && W.PeelUtil.store;
  const narrow = () => typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;
  let openGroups = new Set(((store() && store().get('lgOpen', null)) || ['devs']));
  const getOpen = () => new Set(openGroups);
  function setOpen(g, isOpen) {
    if (isOpen && narrow()) openGroups = new Set();   // phone: one group open at a time
    if (isOpen) openGroups.add(g); else openGroups.delete(g);
    if (store()) store().set('lgOpen', [...openGroups]);
    sync();
  }
  // Turn layers on / off to match a set (only those named, when `only` is given).
  function apply(target, only) {
    const cur = onSet();
    for (const k of KEYS) {
      if (!ADAPT[k] || (only && !only.has(k))) continue;
      const want = target.has(k);
      if (want !== cur.has(k)) safe(() => ADAPT[k].set(want));
    }
    sync();
  }
  // Refresh the switches, the group headers and summaries from the layers' own state.
  function sync() {
    if (typeof document === 'undefined') return;
    const host = document.querySelector('.lg-groups'); if (!host) return;
    const on = onSet(), iv = inViewSet(on);
    for (const k of KEYS) { const c = document.getElementById(`lyr-${k}`); if (c) c.checked = on.has(k); }
    for (const g of GROUPS) {
      const sec = host.querySelector(`[data-grp="${g.key}"]`); if (!sec) continue;
      const isOpen = openGroups.has(g.key);
      sec.classList.toggle('open', isOpen);
      const t = sec.querySelector('[data-grp-toggle]'); if (t) t.setAttribute('aria-expanded', String(isOpen));
      const b = sec.querySelector('.lg-gb'); if (b) b.hidden = !isOpen;
      const s = sec.querySelector('[data-grp-sum]'); if (s) { s.hidden = isOpen; s.textContent = summaryText(g, on); }
      const c = sec.querySelector('[data-grp-count]'); if (c) c.textContent = headerText(g, on, iv);
      const sw = sec.querySelector('[data-grp-switch]'); if (sw) sw.checked = groupOn(g, on);
    }
  }
  function bind(el) {
    el.addEventListener('click', e => {
      const t = e.target.closest('[data-grp-toggle]'); if (t) { e.preventDefault(); setOpen(t.dataset.grpToggle, !openGroups.has(t.dataset.grpToggle)); }
    });
    el.addEventListener('change', e => {
      const gs = e.target.closest('[data-grp-switch]');
      if (gs) { const g = GROUPS.find(x => x.key === gs.dataset.grpSwitch); const next = groupToggle(g, onSet()); apply(next, new Set(g.layers.map(l => l[0]))); return; }
      const ls = e.target.closest('[data-lyr]');
      if (ls && ADAPT[ls.dataset.lyr]) { safe(() => ADAPT[ls.dataset.lyr].set(ls.checked)); setTimeout(sync, 0); }
    });
    const map = W.PeelMapCore && W.PeelMapCore.map;
    if (map) map.on('moveend zoomend', () => setTimeout(sync, 300));
    if (typeof document !== 'undefined') document.addEventListener('peel:layers', () => sync());
    sync();
  }
  // Share link / saved view: the layer state and open groups.
  const current = () => ({ on: onSet(), open: getOpen() });
  const encodeCurrent = () => encode(onSet(), openGroups);
  function applyEncoded(s) {
    const d = decode(s); if (!d) return false;
    apply(d.on);
    if (d.open.size) { openGroups = d.open; if (store()) store().set('lgOpen', [...openGroups]); sync(); }
    return true;
  }
  root.PeelLayerGroups = { ...pure, ADAPT, onSet, inViewSet, apply, sync, bind, getOpen, setOpen, current, encodeCurrent, applyEncoded };
})(typeof window !== 'undefined' ? window : globalThis);
