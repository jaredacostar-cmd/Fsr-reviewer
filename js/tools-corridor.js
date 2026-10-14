/* Peel Growth Pipeline (unofficial) – Phase 3b tool: "Corridor select"
 *
 * Tap points along a centreline, pick a width (50–1,000 m), then Finish: the
 * tool buffers the polyline by half the width and lists the developments,
 * existing sanitary sewers and planned DC works whose geometry falls inside.
 * Results open in the Tool result tab with a CSV export.
 *
 * Pure geometry (distToSegM, distToPolylineM, corridorContains, bufferRects) is
 * exported for node --test. The centreline, point markers and corridor swathe
 * are drawn on the map with the existing measure-tool classes plus one module
 * <style> block (tcor-*), CSS variables only.
 */
(function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const P = () => (typeof window !== 'undefined' ? window.PeelApp : null);
  const Lglb = () => (typeof window !== 'undefined' ? window.L : null);

  const WIDTHS = [50, 100, 250, 500, 1000];
  const MAX_LIST = 15;

  // ---- Pure geometry (metres, equirectangular) ---------------------------------

  /** Distance (m) from point p to segment ab; all [lng, lat]. */
  function distToSegM(a, b, p) {
    const lat = (a[1] + b[1] + p[1]) / 3 * Math.PI / 180;
    const kx = 111320 * Math.cos(lat), ky = 111320;
    const ax = a[0] * kx, ay = a[1] * ky, bx = b[0] * kx, by = b[1] * ky;
    const px = p[0] * kx, py = p[1] * ky;
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /** Distance (m) from point p to a polyline (array of [lng, lat]). */
  function distToPolylineM(pts, p) {
    let best = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const d = distToSegM(pts[i - 1], pts[i], p);
      if (d < best) best = d;
    }
    return best;
  }

  /** True when point p is within halfW metres of the polyline. */
  function corridorContains(pts, halfW, p) {
    if (!pts || pts.length < 2 || !(halfW > 0)) return false;
    return distToPolylineM(pts, p) <= halfW;
  }

  /** Rectangles (one per segment, as 4 [lng, lat] corners) approximating the
   *  corridor swathe for map drawing. */
  function bufferRects(pts, halfW) {
    const rects = [];
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const lat = (a[1] + b[1]) / 2 * Math.PI / 180;
      const kx = 111320 * Math.cos(lat), ky = 111320;
      const dx = (b[0] - a[0]) * kx, dy = (b[1] - a[1]) * ky;
      const len = Math.hypot(dx, dy);
      if (!len) continue;
      const nx = -dy / len * halfW, ny = dx / len * halfW; // left normal, metres
      const off = (x, y, ox, oy) => [x + ox / kx, y + oy / ky];
      rects.push([
        off(a[0], a[1], nx, ny), off(b[0], b[1], nx, ny),
        off(b[0], b[1], -nx, -ny), off(a[0], a[1], -nx, -ny),
      ]);
    }
    return rects;
  }

  /** CSV-escape one cell. */
  function csvCell(v) {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  // ---- Tool state ---------------------------------------------------------------

  const T = { pts: [], width: 250, layer: null, last: null };

  function ensureLayer() {
    const app = P(), L = Lglb();
    if (!app || !L) return null;
    if (!T.layer) { T.layer = L.layerGroup(); T.layer.addTo(app.map); }
    return T.layer;
  }

  function clearDraw() {
    if (T.layer) T.layer.clearLayers();
  }

  function redraw() {
    const L = Lglb(); if (!L || !ensureLayer()) return;
    clearDraw();
    const ll = T.pts.map(p => [p.lat, p.lng]);
    if (ll.length > 1) {
      for (const r of bufferRects(T.pts.map(p => [p.lng, p.lat]), T.width / 2)) {
        L.polygon(r.map(([x, y]) => [y, x]), { className: 'tcor-sw', interactive: false }).addTo(T.layer);
      }
      L.polyline(ll, { className: 'measure-line', interactive: false }).addTo(T.layer);
    }
    T.pts.forEach((p, i) => L.circleMarker([p.lat, p.lng], { radius: 4, className: 'measure-pt', interactive: false })
      .bindTooltip(i ? `point ${i + 1}` : 'start', { className: 'pt', direction: 'right' }).addTo(T.layer));
  }

  function bannerHTML() {
    const ws = WIDTHS.map(w => `<button type="button" class="btn small${w === T.width ? ' on' : ''}" data-ptool-act="w${w}">${w} m</button>`).join(' ');
    return `<strong>Corridor select</strong> <span class="muted">tap points along the centreline</span>
      <span class="muted">width</span> ${ws}
      <span class="muted">${T.pts.length} point${T.pts.length === 1 ? '' : 's'}</span>
      ${T.pts.length >= 2 ? '<button type="button" class="btn small" data-ptool-act="finish">Finish</button>' : ''}
      ${T.pts.length ? '<button type="button" class="btn small link" data-ptool-act="clear">Clear</button>' : ''}
      <span class="muted">· Esc to finish</span>`;
  }

  function refreshBanner() {
    if (typeof window !== 'undefined' && window.PeelTools) window.PeelTools.banner(bannerHTML());
  }

  // ---- Selection ------------------------------------------------------------------

  /** Segments of a polyline as [a, b] pairs, from [lng, lat] point lists. */
  function segsOf(coords) {
    const s = [];
    for (let i = 1; i < coords.length; i++) s.push([coords[i - 1], coords[i]]);
    return s;
  }

  /** True when any segment of coords comes within halfW m of the centreline. */
  function lineHitsCorridor(centreSegs, coords, halfW) {
    for (const [c0, c1] of segsOf(coords)) {
      for (const [a, b] of centreSegs) {
        // quick reject on bounding boxes before the exact segment test
        const x0 = Math.min(c0[0], c1[0]), x1 = Math.max(c0[0], c1[0]);
        const y0 = Math.min(c0[1], c1[1]), y1 = Math.max(c0[1], c1[1]);
        const pad = halfW / 111320 * 1.4;
        if (Math.max(a[0], b[0]) < x0 - pad || Math.min(a[0], b[0]) > x1 + pad ||
            Math.max(a[1], b[1]) < y0 - pad || Math.min(a[1], b[1]) > y1 + pad) continue;
        if (segSegDistM(a, b, c0, c1) <= halfW) return true;
      }
    }
    return false;
  }

  /** Minimum distance (m) between segments ab and cd. */
  function segSegDistM(a, b, c, d) {
    if (segsCross(a, b, c, d)) return 0;
    return Math.min(distToSegM(a, b, c), distToSegM(a, b, d), distToSegM(c, d, a), distToSegM(c, d, b));
  }

  function segsCross(a, b, c, d) {
    const s = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
    const d1 = s(c, d, a), d2 = s(c, d, b), d3 = s(a, b, c), d4 = s(a, b, d);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  function fmtInt(n) { return n == null || !isFinite(n) ? '–' : Math.round(n).toLocaleString('en-CA'); }

  function finish() {
    const app = P(); if (!app || T.pts.length < 2) return;
    const centre = T.pts.map(p => [p.lng, p.lat]);
    const halfW = T.width / 2;
    const centreSegs = segsOf(centre);

    // Developments inside the corridor (same source the lasso uses).
    const devs = [];
    for (const p of (app.state.filtered || [])) {
      if (p.lat == null || p.lng == null) continue;
      if (corridorContains(centre, halfW, [p.lng, p.lat])) devs.push(p);
    }
    devs.sort((a, b) => (b.units || 0) - (a.units || 0));

    // Existing sanitary sewers: pipes are flat [x0,y0,x1,y1,…] at index 10.
    const pipes = [];
    const all = app.sewerPipes ? app.sewerPipes() : null;
    if (all) for (let i = 0; i < all.length; i++) {
      const f = all[i][10]; if (!f || f.length < 4) continue;
      const coords = []; for (let k = 0; k + 1 < f.length; k += 2) coords.push([f[k], f[k + 1]]);
      if (lineHitsCorridor(centreSegs, coords, halfW)) pipes.push({ i, d: all[i][0], name: all[i][7] || '' });
    }
    pipes.sort((a, b) => (b.d || 0) - (a.d || 0));

    // Planned DC works: lines (polylines) and facilities (points).
    const dcLines = [], dcFacs = [];
    const dc = app.state.dcInfra;
    if (dc) for (const sys of ['wastewater', 'water']) {
      for (const ln of (dc[sys].lines || [])) {
        if (ln.g && ln.g.length > 1 && lineHitsCorridor(centreSegs, ln.g, halfW)) dcLines.push({ sys, ln });
      }
      for (const fc of (dc[sys].facilities || [])) {
        if (fc.g && corridorContains(centre, halfW, fc.g)) dcFacs.push({ sys, fc });
      }
    }

    T.last = { width: T.width, devs, pipes, dcLines, dcFacs };

    const top = (list, n, row) => list.slice(0, n).map(row).join('') +
      (list.length > n ? `<p class="muted small">+${list.length - n} more.</p>` : '');
    const devRows = top(devs, MAX_LIST, p =>
      `<tr><td>${esc(p.title || p.key)}</td><td>${esc(p.municipality || '')}</td><td>${fmtInt(p.units)}</td><td>${esc(p.phase || '')}</td></tr>`);
    const pipeRows = top(pipes, MAX_LIST, q =>
      `<tr><td>${fmtInt(q.d)} mm sanitary sewer</td><td>${esc(q.name)}</td></tr>`);
    const dcRows = top([...dcLines.map(x => ({ ...x, isLine: true })), ...dcFacs.map(x => ({ ...x, isLine: false }))], MAX_LIST, x =>
      x.isLine
        ? `<tr><td>Planned ${esc(x.sys)} main</td><td>${esc(app.dcLineText(x.ln))}</td></tr>`
        : `<tr><td>Planned ${esc(x.sys)} — ${esc(x.fc.kind || 'facility')}</td><td>${esc(x.fc.name || '')}</td></tr>`);

    window.PeelTools.openResult({
      title: 'Corridor selection',
      html: `<p class="muted small">Corridor ${T.width} m wide along ${T.pts.length} points.</p>
        <div class="tiles">
          <div class="tile"><div class="tl">Developments</div><div class="tv">${fmtInt(devs.length)}</div></div>
          <div class="tile"><div class="tl">Existing sewers</div><div class="tv">${fmtInt(pipes.length)}</div></div>
          <div class="tile"><div class="tl">Planned DC works</div><div class="tv">${fmtInt(dcLines.length + dcFacs.length)}</div></div>
        </div>
        ${devs.length ? `<table class="dt"><caption>Developments in the corridor (by units)</caption><thead><tr><th>Development</th><th>Municipality</th><th>Units</th><th>Phase</th></tr></thead><tbody>${devRows}</tbody></table>` : '<p class="muted small">No developments in the corridor.</p>'}
        ${pipes.length ? `<table class="dt"><caption>Existing sanitary sewers in the corridor (by diameter)</caption><tbody>${pipeRows}</tbody></table>` : '<p class="muted small">No mapped sanitary sewers in the corridor.</p>'}
        ${(dcLines.length + dcFacs.length) ? `<table class="dt"><caption>Planned DC works in the corridor</caption><tbody>${dcRows}</tbody></table>` : '<p class="muted small">No planned DC works in the corridor.</p>'}
        <p><button type="button" class="btn small" data-corridor-export>Export CSV</button></p>`,
    });
  }

  // ---- CSV export (delegated click, works from the result pane) ---------------------

  function exportCSV() {
    const r = T.last; if (!r) return;
    const rows = [['type', 'system', 'name', 'detail']];
    for (const p of r.devs) rows.push(['development', '', p.title || p.key, `${p.municipality || ''}; ${p.units || 0} units; ${p.phase || ''}`]);
    for (const q of r.pipes) rows.push(['existing sewer', 'wastewater', `${q.d} mm sanitary sewer`, q.name || '']);
    for (const x of r.dcLines) rows.push(['planned main', x.sys, `planned ${x.sys} main`, (P() && P().dcLineText(x.ln)) || '']);
    for (const x of r.dcFacs) rows.push(['planned facility', x.sys, x.fc.name || x.fc.kind || '', x.fc.kind || '']);
    const csv = rows.map(row => row.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `corridor-${r.width}m-${r.devs.length}devs.csv`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function ensureStyle() {
    try {
      if (typeof document === 'undefined' || document.getElementById('tcor-style')) return;
      const st = document.createElement('style');
      st.id = 'tcor-style';
      st.textContent = '.tcor-sw{fill:var(--accent);fill-opacity:.18;stroke:var(--accent);stroke-opacity:.5;stroke-width:1.5}';
      document.head.appendChild(st);
    } catch (e) { /* the swathe still draws without its tint */ }
  }

  function ensureExportListener() {
    if (typeof document === 'undefined' || document._tcorExport) return;
    document._tcorExport = true;
    document.addEventListener('click', e => {
      if (e.target && e.target.closest && e.target.closest('[data-corridor-export]')) {
        try { exportCSV(); } catch (err) { /* export must not break the page */ }
      }
    });
  }

  // ---- Registration -------------------------------------------------------------------

  if (typeof window !== 'undefined' && window.PeelTools) {
    ensureStyle();
    ensureExportListener();
    window.PeelTools.register('corridor', {
      title: 'Corridor select',
      icon: 'measure',
      hint: 'tap points along the corridor',
      onClick(latlng) {
        if (!latlng) return;
        T.pts.push(latlng);
        redraw();
        refreshBanner();
      },
      onActivate() { T.pts = []; T.last = null; ensureLayer(); redraw(); refreshBanner(); },
      onDeactivate() { T.pts = []; if (T.layer) { T.layer.clearLayers(); } refreshBanner(); },
      onBannerAct(act) {
        if (act === 'finish') { finish(); return; }
        if (act === 'clear') { T.pts = []; redraw(); refreshBanner(); return; }
        const m = /^w(\d+)$/.exec(act || '');
        if (m && WIDTHS.includes(+m[1])) { T.width = +m[1]; redraw(); refreshBanner(); }
      },
      bannerHTML,
    });
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { distToSegM, distToPolylineM, corridorContains, bufferRects, csvCell, segsOf, lineHitsCorridor, segSegDistM, WIDTHS };
  }
})();
