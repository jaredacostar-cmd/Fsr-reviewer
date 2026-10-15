/* One tap, one picker: a shared selector for overlapping map features.
 * Layers register a provider; a tap on any registered feature asks every provider what lies within
 * the tap tolerance (10 px mouse, 22 px touch), ranks the hits (js/capital-ea-model.js rankHits:
 * applications, facilities, construction, planned DC works, EAs, pipes; areas are context only) and
 *   - one target → opens it;
 *   - several → a picker at the tap (a bottom sheet on phones) with "Also here" area chips;
 *   - a second tap at the same spot within 4 s → the next item in the stack.
 * The same providers give the one hover card (SPEC §3): the top hit under the pointer, with "n here"
 * when several overlap. Layers whose own shapes take the pointer (markers, interactive paths) keep
 * their tooltips.
 * Provider: { id, hits(ctx) → [{ kind, key, label, sub, short, swatch, d, hover?, open(), highlight(on) }] }
 * where ctx = { latlng, point:[x,y], tol, toPx([lng,lat]) → [x,y] }.
 */
(function (root) {
  'use strict';

  const M = () => window.PeelCapitalEAModel;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
  const providers = [];
  let last = null;           // { point, time, list, i }
  let popup = null, sheet = null, hl = null;
  const map = () => window.PeelMapCore && window.PeelMapCore.map;
  const isTouch = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  const isPhone = () => typeof matchMedia === 'function' && matchMedia('(max-width: 700px)').matches;

  function register(p) { if (p && p.id && !providers.some(x => x.id === p.id)) providers.push(p); }

  function collect(latlng, point) {
    const m = map();
    const toPx = ([lng, lat]) => { const q = m.latLngToContainerPoint([lat, lng]); return [q.x, q.y]; };
    const ctx = { latlng, point, tol: M().tolerance(isTouch()), toPx };
    const hits = [];
    for (const p of providers) { try { hits.push(...(p.hits(ctx) || [])); } catch (e) { /* a layer that fails does not block the others */ } }
    return M().rankHits(hits);
  }

  function close() {
    if (hl) { try { hl.highlight(false); } catch (e) { /* ignore */ } hl = null; }
    if (popup && map()) map().closePopup(popup);
    popup = null;
    if (sheet) { sheet.remove(); sheet = null; }
  }
  function openHit(h) { close(); if (h && h.open) h.open(); }
  function setHl(h) { if (hl && hl !== h) { try { hl.highlight(false); } catch (e) { /* ignore */ } } hl = h; if (h && h.highlight) { try { h.highlight(true); } catch (e) { /* ignore */ } } }

  function listHTML(r) {
    const show = r.targets.slice(0, 6), more = r.targets.length - show.length;
    return `<div class="pick" role="dialog" aria-label="Choose a map feature">
      <div class="pick-h">${esc(M().pickHeading(r.targets))}</div>
      <ul class="pick-l" role="listbox">${show.map((h, i) => `<li><button type="button" class="pick-i" role="option" data-pick-i="${i}"><i class="pick-sw" style="${esc(h.swatch || '')}"></i><span><span class="t">${esc(h.label)}</span>${h.sub ? `<span class="m">${esc(h.sub)}</span>` : ''}</span></button></li>`).join('')}</ul>
      ${more > 0 ? `<p class="pick-more small muted">+${more} more — zoom in to separate them</p>` : ''}
      ${r.context.length ? `<div class="pick-ctx"><span class="small muted">Also here:</span> ${r.context.slice(0, 4).map((h, i) => `<button type="button" class="mo-chip pick-c" data-pick-c="${i}">${esc(h.label)}</button>`).join(' ')}</div>` : ''}
    </div>`;
  }
  function wire(el, r) {
    const items = [...el.querySelectorAll('[data-pick-i]')];
    el.addEventListener('click', ev => {
      const b = ev.target.closest('[data-pick-i]'); if (b) { openHit(r.targets[+b.dataset.pickI]); return; }
      const c = ev.target.closest('[data-pick-c]'); if (c) openHit(r.context[+c.dataset.pickC]);
    });
    for (const b of items) {
      const h = r.targets[+b.dataset.pickI];
      b.addEventListener('mouseenter', () => setHl(h)); b.addEventListener('focus', () => setHl(h));
    }
    el.addEventListener('keydown', ev => {
      const i = items.indexOf(document.activeElement);
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); const n = items[(i + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]; if (n) n.focus(); }
      if (ev.key === 'Escape') { ev.stopPropagation(); close(); }
    });
    if (items[0]) setTimeout(() => items[0].focus({ preventScroll: true }), 0);
  }
  function showPicker(latlng, r) {
    close();
    const html = listHTML(r);
    if (isPhone()) {
      sheet = document.createElement('div');
      sheet.className = 'pick-sheet';
      sheet.innerHTML = `${html}<button type="button" class="btn small pick-x" aria-label="Close">×</button>`;
      document.body.appendChild(sheet);
      sheet.querySelector('.pick-x').onclick = close;
      wire(sheet, r);
      return;
    }
    popup = L.popup({ className: 'pick-pop', autoPan: true, autoPanPaddingTopLeft: [60, 20], autoPanPaddingBottomRight: [300, 40], closeButton: true, maxWidth: 340, minWidth: 240 }).setLatLng(latlng).setContent(html).openOn(map());
    const el = popup.getElement && popup.getElement();
    if (el) wire(el, r);
  }

  /** A tap on a registered feature (Leaflet event with latlng + containerPoint). */
  function at(ev) {
    if (!map() || !M()) return;
    if (ev && ev.originalEvent && window.L && ev.target !== map()) L.DomEvent.stop(ev);
    const point = [ev.containerPoint.x, ev.containerPoint.y], now = Date.now();
    if (last && M().sameSpot(last.point, point, last.time, now) && last.list.length > 1) {
      last.i = (last.i + 1) % last.list.length; last.time = now;
      openHit(last.list[last.i]);
      return;
    }
    const r = collect(ev.latlng, point);
    if (!r.targets.length) return;
    last = { point, time: now, list: r.targets, i: 0 };
    // One feature opens directly (areas around it are context). When the only target is itself an area
    // and others overlap it (two EA study areas), list them so each can be reached.
    if (r.targets.length === 1 && (r.targets[0].kind !== 'area' || !r.context.some(h => h.open))) { openHit(r.targets[0]); return; }
    showPicker(ev.latlng, r);
  }

  // Every map tap goes through the picker (no layer has to receive the click itself: canvas and SVG
  // panes stack, so a feature under another renderer would otherwise be unreachable). Skipped while a
  // tool (measure, lasso, …) owns map clicks.
  function wireMap() {
    const m = map(); if (!m || m._peelPick) return;
    m._peelPick = true;
    m.on('click', ev => {
      hideTip();
      if (window.PeelTools && window.PeelTools.active && window.PeelTools.active()) return;
      // A development marker or another layer's own shape took the tap: leave it to that layer.
      const t = ev.originalEvent && ev.originalEvent.target;
      if (t && t.closest && t.closest('.leaflet-marker-icon, path.leaflet-interactive')) return;
      at(ev);
    });
  }
  // ---- One hover card ------------------------------------------------------------------------------
  let tip = null, tipKey = null, tipT = 0;
  function hideTip() { const m = map(); if (tip && m) m.closeTooltip(tip); tip = null; tipKey = null; if (m) m.getContainer().classList.remove('pick-hover'); }
  function hoverCardOf(h, n) {
    if (h.hover) return h.hover;
    const U = window.PeelUtil;
    return U && U.hoverCard ? U.hoverCard({ kind: h.kindLabel || h.short || h.kind, name: h.label, sub: h.sub || '', open: n > 1 ? `choose (${n} here)` : 'open its scope' }) : esc(h.label);
  }
  function hover(ev) {
    const now = Date.now(); if (now - tipT < 60) return; tipT = now;
    const m = map(); if (!m || !M()) return;
    if ((window.PeelTools && window.PeelTools.active && window.PeelTools.active()) || popup || sheet) { hideTip(); return; }
    const t = ev.originalEvent && ev.originalEvent.target;
    if (t && t.closest && t.closest('.leaflet-marker-icon, path.leaflet-interactive, canvas.leaflet-interactive, .leaflet-tooltip, .leaflet-popup, .leaflet-control')) { hideTip(); return; }
    const r = collect(ev.latlng, [ev.containerPoint.x, ev.containerPoint.y]);
    const h = r.targets[0]; if (!h) { hideTip(); return; }
    const n = r.targets.length;
    if (tipKey !== `${h.key}|${n}`) {
      if (!tip) tip = L.tooltip({ className: 'pt', direction: 'top', offset: [0, -10] });
      tip.setContent(hoverCardOf(h, n)); tipKey = `${h.key}|${n}`;
    }
    tip.setLatLng(ev.latlng); if (!m.hasLayer(tip)) m.openTooltip(tip);
    m.getContainer().classList.add('pick-hover');
  }
  function wireHover() {
    const m = map(); if (!m || m._peelPickHover) return;
    m._peelPickHover = true;
    m.on('mousemove', hover); m.on('mouseout movestart zoomstart', hideTip);
  }
  if (typeof window !== 'undefined' && window.PeelMapCore) { wireMap(); wireHover(); }

  if (typeof document !== 'undefined') document.addEventListener('keydown', e => { if (e.key === 'Escape' && (popup || sheet)) close(); });

  const api = { register, at, close, providers, hover, hideTip };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPick = api;
})(typeof window !== 'undefined' ? window : globalThis);
