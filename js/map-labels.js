(function (root) {
'use strict';
  // Point labels on markers (PeelMapLabels).
  const { $, store, fmtNum, esc } = window.PeelUtil;
  const P = window.PeelPhases;
  const map = window.PeelMapCore.map;
  const MM = () => root.PeelMapMarkers;
  const DN = () => root.PeelDevNav;
  // ---- Point labels ------------------------------------------------------------------
  // Drawn only for markers that are individually visible (not inside a cluster) in view,
  // from LABEL_ZOOM up, so they never pile up at regional scale.
  const LABEL_ZOOM = 14, LABEL_MAX = 400;
  // The default is two lines, address and units; the stage and the latest submission are on the hover
  // card (and in 'address-phase', for those who want them on the map).
  const LABEL_MODES = {
    'address-units': 'Address + units',
    'address-phase': 'Address, stage + latest submission',
    'address':       'Address',
    'ref':           'File / permit no.',
    'units':         'Units',
    'off':           'Off',
  };
  // (the old default, 'address-phase', moves to the new one once; a saved view that names it keeps it)
  if (!store.get('labels2', false)) { if (store.get('labelMode', null) === 'address-phase') store.set('labelMode', 'address-units'); store.set('labels2', true); }
  let labelMode = LABEL_MODES[store.get('labelMode', 'address-units')] ? store.get('labelMode', 'address-units') : 'address-units';
  const labelLayer = L.layerGroup().addTo(map);
  let projectByMarker = new Map();
  // The latest application submitted on the site: the newest application record's received date
  // (the municipalities publish the first submission's date, not resubmissions).
  const lsCache = new WeakMap();
  function latestSub(p) {
    if (lsCache.has(p)) return lsCache.get(p);
    let best = null;
    for (const r of p.records) if (r.kind === 'application') for (const e of r.events) if (e.phase === 'inception' && (!best || e.date > best.date)) best = { date: e.date, ref: (r.ref || '').replace(/\s+/g, ' ').replace(/ -/g, '-') };
    lsCache.set(p, best); return best;
  }
  const monYr = d => d.toLocaleDateString('en-CA', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  const lsLine = p => (ls => ls ? `<small>Latest submission ${esc(monYr(ls.date))}${ls.ref ? ` · ${esc(ls.ref)}` : ''}</small>` : '')(latestSub(p));
  function labelText(p) {
    const ph = P.PHASE_BY_KEY[p.phase].label;
    switch (labelMode) {
      case 'address': return `<b>${esc(p.title)}</b>${lsLine(p)}`;
      case 'ref': {
        const refs = Array.from(new Set(p.records.map(r => r.ref).filter(Boolean)));
        return `<b>${esc(refs.slice(0, 2).join(', ') || p.title)}</b>${refs.length > 2 ? `<small>+${refs.length - 2} more</small>` : ''}`;
      }
      case 'units': return p.units ? `<b>${fmtNum(p.units)} units</b><small>${esc(p.title)}</small>` : '';
      case 'address-units': return `<b>${esc(p.title)}</b>${p.units ? `<small>${fmtNum(p.units)} unit${p.units === 1 ? '' : 's'}</small>` : ''}`;
      default: return `<b>${esc(p.title)}</b><small>${esc(ph)}${p.units ? ` · ${fmtNum(p.units)} units` : ''}</small>${lsLine(p)}`;
    }
  }
  let labelOf = new Map();
  function updateLabels() {
    labelLayer.clearLayers(); labelOf = new Map();
    const note = $('#label-note');
    if (labelMode === 'off') { if (note) note.textContent = ''; return; }
    if (map.getZoom() < LABEL_ZOOM) { if (note) note.textContent = `Zoom in to show labels`; return; }
    const view = map.getBounds().pad(0.1);
    const candidates = [];
    for (const [m, p] of projectByMarker) {
      const ll = m.getLatLng();
      if (view.contains(ll) && MM().cluster.getVisibleParent(m) === m) candidates.push([m, p]);
    }
    // Biggest projects get first claim on space; labels that would collide are skipped.
    candidates.sort((a, b) => (b[1].units || 0) - (a[1].units || 0) || b[1].rank - a[1].rank);
    // Every visible dot is an obstacle, so a label never hides another point.
    const pts = new Map(candidates.map(([m]) => [m, map.latLngToContainerPoint(m.getLatLng())]));
    const dots = candidates.map(([m]) => { const q = pts.get(m); return { m, x: q.x - 9, y: q.y - 9, w: 18, h: 18 }; });
    const hit = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    // The map's own controls (tool rail, Layers, legend, scale, notes) are obstacles too: a label never
    // runs under them.
    const cb = map.getContainer().getBoundingClientRect();
    const placed = [...map.getContainer().querySelectorAll('.leaflet-control, .bg-note:not([hidden])')].map(e => e.getBoundingClientRect())
      .filter(r => r.width && r.height).map(r => ({ x: r.left - cb.left - 4, y: r.top - cb.top - 4, w: r.width + 8, h: r.height + 8 }));
    let n = 0, skipped = 0;
    for (const [m, p] of candidates) {
      if (n >= LABEL_MAX) break;
      const html = labelText(p);
      if (!html) continue;
      const q = pts.get(m), size = labelSize(html);
      // Try right of the dot, then left.
      const sides = [{ side: 'r', x: q.x + 11 }, { side: 'l', x: q.x - 11 - size.w }];
      const spot = sides.map(o => ({ ...o, y: q.y - 9, w: size.w, h: size.h }))
        .find(b => !placed.some(o => hit(o, b)) && !dots.some(d => d.m !== m && hit(d, b)));
      if (!spot) { skipped++; continue; }
      placed.push(spot);
      // Labels are tappable too: on a phone the text is what people aim for.
      const label = L.marker(m.getLatLng(), {
        keyboard: false, zIndexOffset: -1000,
        icon: L.divIcon({
          className: `plabel${spot.side === 'l' ? ' left' : ''}`, html: `<div>${html}</div>`, iconSize: null,
          iconAnchor: spot.side === 'l' ? [Math.ceil(size.w) + 11, 9] : [-11, 9],
        }),
      });
      label.on('click', () => DN().showDetail(p));
      labelLayer.addLayer(label);
      labelOf.set(m, label);
      // While a site's hover card is open its own label hides (the card says it all).
      if (!m._lblHide) { m._lblHide = true; m.on('tooltipopen', () => { const l = labelOf.get(m), e = l && l.getElement(); if (e) e.classList.add('hov'); }); m.on('tooltipclose', () => { const l = labelOf.get(m), e = l && l.getElement(); if (e) e.classList.remove('hov'); }); }
      n++;
    }
    if (note) note.textContent = n >= LABEL_MAX || skipped ? `${fmtNum(n)} labels shown; zoom in for more` : '';
  }
  // On-screen size of a label's text, for collision tests.
  const measureCtx = document.createElement('canvas').getContext('2d');
  function labelSize(html) {
    const tmp = document.createElement('div'); tmp.innerHTML = html;
    const lines = Array.from(tmp.children).map(c => c.textContent);
    let w = 0;
    lines.forEach((t, i) => {
      measureCtx.font = i === 0 ? '600 12px system-ui, sans-serif' : '11px system-ui, sans-serif';
      w = Math.max(w, measureCtx.measureText(t).width);
    });
    return { w: Math.ceil(w) + 4, h: lines.length * 14 + 2 };
  }
  let labelTimer;
  const scheduleLabels = () => { clearTimeout(labelTimer); labelTimer = setTimeout(updateLabels, 60); };
  map.on('moveend zoomend', scheduleLabels);

  const getLabelMode = () => labelMode;
  function setLabelMode(m) { labelMode = m; store.set('labelMode', m); }

  // ---- Public contract ------------------------------------------------------------------
  const api = { LABEL_MODES, getLabelMode, setLabelMode, scheduleLabels, updateLabels, latestSub, get projectByMarker() { return projectByMarker; }, set projectByMarker(v) { projectByMarker = v; }, labelLayer, labelText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMapLabels = api;
})(typeof window !== 'undefined' ? window : globalThis);
