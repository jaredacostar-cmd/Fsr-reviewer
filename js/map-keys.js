/* The map by keyboard (PeelMapKeys). With the map focused (Tab to it), the arrow keys move a cursor
 * from one development to the next one in that direction on screen; Enter opens it, Escape clears
 * the cursor, Shift + arrows pan the map (Leaflet's own keys), + and − zoom. The cursor names the
 * development in a live region, so a screen reader hears it.
 *
 * Pure: pick() chooses the next development in a direction (tests/map-keys.test.js).
 */
(function (root) {
  'use strict';
  const DIRS = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
  // The next point in direction d from `from` (screen px): within 60° of the direction, nearest
  // first, a point straight ahead winning over one off to the side (distance × (1 + off-axis)).
  function pick(from, d, pts) {
    let best = -1, score = Infinity;
    pts.forEach((p, i) => {
      const dx = p[0] - from[0], dy = p[1] - from[1], dist = Math.hypot(dx, dy);
      if (dist < 1) return;
      const cos = (dx * d[0] + dy * d[1]) / dist;
      if (cos < 0.5) return;
      const s = dist * (1 + 2 * (1 - cos));
      if (s < score) { score = s; best = i; }
    });
    return best;
  }

  // ---- Browser ---------------------------------------------------------------------------------
  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = { DIRS, pick };
    return;
  }
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let cur = null, ring = null, live = null;
  const MC = () => root.PeelMapCore, App = () => root.PeelApp;
  function liveEl() {
    if (live) return live;
    live = document.createElement('div'); live.className = 'sr-only'; live.id = 'map-kb-live'; live.setAttribute('aria-live', 'polite');
    document.body.appendChild(live);
    return live;
  }
  // The developments in view and not under a panel (Layers, the legend, the tool rail), with their
  // screen points.
  function inView(map) {
    const b = map.getBounds(), set = (App() && App().state.filtered) || [], el = map.getContainer(), r = el.getBoundingClientRect();
    const open = (x, y) => { const t = document.elementFromPoint(r.left + x, r.top + y); return !!t && el.contains(t) && !t.closest('.leaflet-control, .leaflet-tooltip'); };
    return set.filter(p => p.lat != null && b.contains([p.lat, p.lng])).map(p => ({ p, xy: (pt => [pt.x, pt.y])(map.latLngToContainerPoint([p.lat, p.lng])) })).filter(x => open(x.xy[0], x.xy[1]));
  }
  function show(map, p, of) {
    cur = p;
    // (the focus colour: the text colour, so it reads on any basemap and never looks "selected")
    const focus = getComputedStyle(document.documentElement).getPropertyValue('--focus').trim();
    if (!ring) ring = root.L.circleMarker([p.lat, p.lng], { radius: 16, className: 'kb-cursor', interactive: false, weight: 3, fill: false });
    ring.setStyle({ color: focus }); ring.setLatLng([p.lat, p.lng]); if (!map.hasLayer(ring)) ring.addTo(map);
    const P = root.PeelPhases, st = P && P.PHASE_BY_KEY && P.PHASE_BY_KEY[p.phase] ? P.PHASE_BY_KEY[p.phase].label : '';
    const units = p.units ? `${Math.round(p.units).toLocaleString('en-CA')} units` : '';
    const text = [p.title, p.municipality, st, units].filter(Boolean).join(' · ');
    liveEl().textContent = `${text} (${of} in view). Enter opens it.`;
    // (the name in a card at the foot of the map: no panel covers it; the ring marks the place)
    const card = cardEl(map);
    card.innerHTML = `<strong>${esc(p.title)}</strong> <span class="muted">${esc([st, units].filter(Boolean).join(' · '))}</span> <span class="kb-keys">Enter opens · Esc clears</span>`;
    card.hidden = false;
  }
  let cardDiv = null;
  function cardEl(map) {
    if (cardDiv) return cardDiv;
    cardDiv = document.createElement('div'); cardDiv.className = 'kb-card'; cardDiv.hidden = true; cardDiv.setAttribute('aria-hidden', 'true');
    map.getContainer().appendChild(cardDiv);
    return cardDiv;
  }
  function clear(map) { cur = null; if (ring && map.hasLayer(ring)) map.removeLayer(ring); if (live) live.textContent = ''; if (cardDiv) cardDiv.hidden = true; }
  function onKey(e) {
    const map = MC() && MC().map; if (!map || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape' && cur) { clear(map); e.stopPropagation(); return; }
    if (e.key === 'Enter' && cur) { e.preventDefault(); e.stopPropagation(); const p = cur, N = root.PeelDevNav; clear(map); if (N && N.showDetail) N.showDetail(p); return; }
    const d = DIRS[e.key]; if (!d || e.shiftKey) return;   // (Shift + arrows: Leaflet pans)
    e.preventDefault(); e.stopPropagation();
    const pts = inView(map); if (!pts.length) { liveEl().textContent = 'No developments in view: zoom out or pan (Shift + arrow keys).'; return; }
    const size = map.getSize(), from = cur && pts.find(x => x.p === cur) ? pts.find(x => x.p === cur).xy : [size.x / 2, size.y / 2];
    let i = pick(from, d, pts.map(x => x.xy));
    // (nothing further that way: the cursor stays; from the centre, the nearest one)
    if (i < 0 && !cur) i = pts.map(x => Math.hypot(x.xy[0] - from[0], x.xy[1] - from[1])).reduce((b, v, k, a) => (v < a[b] ? k : b), 0);
    if (i < 0) { liveEl().textContent = `No more developments that way (${pts.length} in view).`; return; }
    show(map, pts[i].p, pts.length);
  }
  function init() {
    const map = MC() && MC().map; if (!map) return;
    const el = map.getContainer();
    el.setAttribute('aria-label', 'Map of developments. Arrow keys move between developments, Enter opens one, Shift + arrow keys pan, + and − zoom.');
    el.addEventListener('keydown', onKey, true);   // (before Leaflet's own arrow-key panning)
    el.addEventListener('blur', () => { if (cur) clear(map); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  root.PeelMapKeys = { DIRS, pick, current: () => cur };
})(typeof window !== 'undefined' ? window : globalThis);
