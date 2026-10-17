/* Geometry shared by the constraint layers' build (scripts/build-constraints.js, in Actions) and the
 * app (PeelConstraintGeo): the tile format, point-in-polygon and distances for the Site checklist,
 * and the screening grid (run-length rows) behind the area card "Land under constraints".
 *
 * Tiles: 0.02° squares named "<tx>_<ty>" (x = tx × 0.02). A tile file is
 *   { p: [[label, [ring, …]], …],   polygons: all of one feature's rings clipped to the tile (even-odd)
 *     e: [[label, [line, …]], …],   the polygons' own edges inside the tile (outline without tile seams)
 *     l: [[label, [line, …]], …] }  line features clipped to the tile
 * with points as whole numbers of 0.00001° from the tile's south-west corner, and label an index
 * into the dataset's labels (index.json).
 *
 * Grid: cells of dx × dy degrees from (x0, y0), rows south to north. A flag layer's row is
 * [gap, run, gap, run, …] in cells; the municipality row is [value, run, value, run, …].
 */
(function (root) {
  'use strict';
  const TILE = 0.02, UNITS = 1e5;
  const M_PER_DEG = 111320;

  // ---- Tiles ------------------------------------------------------------------------------------
  const tileKey = (tx, ty) => `${tx}_${ty}`;
  const tileOf = (lng, lat) => [Math.floor(lng / TILE), Math.floor(lat / TILE)];
  function decodeTile(t, tx, ty) {
    const dec = l => l.map(([dx, dy]) => [tx * TILE + dx / UNITS, ty * TILE + dy / UNITS]);
    const each = a => (a || []).map(([li, parts]) => ({ li, parts: parts.map(dec) }));
    return { polys: each(t.p), edges: each(t.e), lines: each(t.l) };
  }
  // The tiles within r metres of a point.
  function tilesAround(lng, lat, r = 0) {
    const kx = M_PER_DEG * Math.cos(lat * Math.PI / 180), dx = r / kx, dy = r / M_PER_DEG, out = [];
    for (let tx = Math.floor((lng - dx) / TILE); tx <= Math.floor((lng + dx) / TILE); tx++)
      for (let ty = Math.floor((lat - dy) / TILE); ty <= Math.floor((lat + dy) / TILE); ty++) out.push([tx, ty]);
    return out;
  }

  // ---- Point tests --------------------------------------------------------------------------------
  // Even-odd over all of a feature's rings (holes included), [lng, lat] points.
  function pointInRings([x, y], rings) {
    let inside = false;
    for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  // Metres from a point to a polyline (local flat frame; fine at a few km).
  function distToLine([x, y], line) {
    const kx = M_PER_DEG * Math.cos(y * Math.PI / 180);
    let best = Infinity;
    for (let i = 0; i < line.length; i++) {
      const a = line[i], b = line[i + 1] || a;
      const ax = (a[0] - x) * kx, ay = (a[1] - y) * M_PER_DEG, bx = (b[0] - x) * kx, by = (b[1] - y) * M_PER_DEG;
      const vx = bx - ax, vy = by - ay, L2 = vx * vx + vy * vy;
      const t = L2 ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / L2)) : 0;
      const d = Math.hypot(ax + t * vx, ay + t * vy); if (d < best) best = d;
    }
    return best;
  }
  // A ring as a closed line: the tiles' rings are open (the build drops the repeated first point), so
  // the edge from the last point back to the first is added unless the ring already closes.
  const closeRing = r => (r.length > 1 && (r[0][0] !== r[r.length - 1][0] || r[0][1] !== r[r.length - 1][1]) ? [...r, r[0]] : r);
  // Metres from a point to a polygon: 0 inside, else to its nearest edge (the closing edge included).
  const distToRings = (pt, rings) => pointInRings(pt, rings) ? 0 : Math.min(...rings.map(r => distToLine(pt, closeRing(r))));

  // ---- Scanline (grid cells whose centres fall inside a ring set, even-odd) ----------------------
  // cb(row, c0, c1) for each run of columns c0 ≤ c < c1.
  function scanRings(rings, g, cb) {
    let ymin = Infinity, ymax = -Infinity;
    for (const r of rings) for (const p of r) { if (p[1] < ymin) ymin = p[1]; if (p[1] > ymax) ymax = p[1]; }
    const r0 = Math.max(0, Math.ceil((ymin - g.y0) / g.dy - 0.5)), r1 = Math.min(g.rows - 1, Math.floor((ymax - g.y0) / g.dy - 0.5));
    for (let row = r0; row <= r1; row++) {
      const y = g.y0 + (row + 0.5) * g.dy, xs = [];
      for (const r of rings) for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const [xi, yi] = r[i], [xj, yj] = r[j];
        if ((yi > y) !== (yj > y)) xs.push(xi + (y - yi) * (xj - xi) / (yj - yi));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        const c0 = Math.max(0, Math.ceil((xs[k] - g.x0) / g.dx - 0.5)), c1 = Math.min(g.cols, Math.floor((xs[k + 1] - g.x0) / g.dx - 0.5) + 1);
        if (c1 > c0) cb(row, c0, c1);
      }
    }
  }
  // Runs of columns per row for a set of polygons (each its own ring set), merged: Map row → [[c0, c1], …].
  function scanUnion(polys, g) {
    const rows = new Map();
    for (const rings of polys) scanRings(rings, g, (row, c0, c1) => { if (!rows.has(row)) rows.set(row, []); rows.get(row).push([c0, c1]); });
    for (const [row, iv] of rows) rows.set(row, mergeIntervals(iv));
    return rows;
  }
  function mergeIntervals(iv) {
    iv.sort((a, b) => a[0] - b[0]);
    const out = [];
    for (const [a, b] of iv) { const last = out[out.length - 1]; if (last && a <= last[1]) last[1] = Math.max(last[1], b); else out.push([a, b]); }
    return out;
  }

  // ---- Run-length rows ---------------------------------------------------------------------------
  // A row of 0 / 1 cells → [gap, run, gap, run, …].
  function encodeFlags(cells) {
    const out = []; let i = 0, n = cells.length;
    while (i < n) {
      let g = 0; while (i < n && !cells[i]) { g++; i++; }
      if (i >= n) break;
      let r = 0; while (i < n && cells[i]) { r++; i++; }
      out.push(g, r);
    }
    return out;
  }
  // [gap, run, …] → [[c0, c1], …].
  function flagIntervals(row) {
    const out = []; let c = 0;
    for (let k = 0; k + 1 < (row || []).length; k += 2) { c += row[k]; out.push([c, c + row[k + 1]]); c += row[k + 1]; }
    return out;
  }
  // A row of small integers → [value, run, value, run, …].
  function encodeValues(cells) {
    const out = [];
    for (let i = 0; i < cells.length;) { const v = cells[i]; let r = 0; while (i < cells.length && cells[i] === v) { r++; i++; } out.push(v, r); }
    return out;
  }
  // [value, run, …] → Map value → [[c0, c1], …].
  function valueIntervals(row) {
    const out = new Map(); let c = 0;
    for (let k = 0; k + 1 < (row || []).length; k += 2) { const v = row[k], r = row[k + 1]; if (v) { if (!out.has(v)) out.set(v, []); out.get(v).push([c, c + r]); } c += r; }
    return out;
  }
  // Cells in both interval lists (each sorted, non-overlapping).
  function overlap(a, b) {
    let i = 0, j = 0, n = 0;
    while (i < a.length && j < b.length) {
      const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
      if (hi > lo) n += hi - lo;
      if (a[i][1] < b[j][1]) i++; else j++;
    }
    return n;
  }
  const inIntervals = (iv, c) => iv.some(([a, b]) => c >= a && c < b);
  const cellOf = (g, lng, lat) => [Math.floor((lng - g.x0) / g.dx), Math.floor((lat - g.y0) / g.dy)];

  // ---- Area statistics ----------------------------------------------------------------------------
  // scope: Map row → intervals (scanUnion), or { muni: value } for a municipality. Returns the cells in
  // the scope (inside Peel) and those flagged by each layer: { cells, ha, by: { reg: n, … } }.
  function areaStats(grid, scope, layers = grid.layers) {
    const by = Object.fromEntries(layers.map(k => [k, 0]));
    let cells = 0;
    const rowsOf = scope instanceof Map ? scope : null;
    for (let row = 0; row < grid.rows; row++) {
      const mv = valueIntervals(grid.muni[row]);
      let iv;
      if (rowsOf) { const s = rowsOf.get(row); if (!s) continue; const peel = mergeIntervals([...mv.values()].flat().map(x => x.slice())); iv = intersect(s, peel); }
      else iv = mv.get(scope.muni) || [];
      if (!iv.length) continue;
      cells += iv.reduce((t, [a, b]) => t + b - a, 0);
      for (const k of layers) by[k] += overlap(iv, flagIntervals(grid[k][row]));
    }
    const cellHa = grid.cellM2 / 1e4;
    return { cells, ha: cells * cellHa, by, pct: Object.fromEntries(layers.map(k => [k, cells ? by[k] / cells * 100 : 0])) };
  }
  function intersect(a, b) {
    const out = []; let i = 0, j = 0;
    while (i < a.length && j < b.length) {
      const lo = Math.max(a[i][0], b[j][0]), hi = Math.min(a[i][1], b[j][1]);
      if (hi > lo) out.push([lo, hi]);
      if (a[i][1] < b[j][1]) i++; else j++;
    }
    return out;
  }
  // Which layers flag the cell under a point: { reg: true, … }, or null outside the grid.
  function flagsAt(grid, lng, lat, layers = grid.layers) {
    const [c, r] = cellOf(grid, lng, lat);
    if (r < 0 || r >= grid.rows || c < 0 || c >= grid.cols) return null;
    return Object.fromEntries(layers.map(k => [k, inIntervals(flagIntervals(grid[k][r]), c)]));
  }

  const api = { TILE, UNITS, tileKey, tileOf, decodeTile, tilesAround, pointInRings, distToLine, closeRing, distToRings, scanRings, scanUnion, mergeIntervals, encodeFlags, flagIntervals, encodeValues, valueIntervals, overlap, intersect, cellOf, areaStats, flagsAt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelConstraintGeo = api;
})(typeof window !== 'undefined' ? window : globalThis);
