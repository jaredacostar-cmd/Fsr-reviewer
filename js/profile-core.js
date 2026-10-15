(function (root) {
'use strict';
  // The ground profile's arithmetic (PeelProfileCore): pure, no map, no network, so every rule here
  // is tested (tests/profile-core.test.js, tests/elevation-validation.test.js).
  //
  //  - sampling: spacing = max(5 m, the source's pixel size, length / 600), so a profile is at most
  //    600 samples; bilinear interpolation of a raster across tile edges;
  //  - Peel manhole ground: invert + published depth at each end of a sanitary main (depth kept only
  //    between 0.5 and 15 m), matched to the line within 15 m;
  //  - the correction: offset = manhole ground − DEM at each matched manhole, interpolated linearly
  //    between consecutive manholes no more than 150 m apart along the line; never extrapolated; the
  //    raw value is kept on every sample;
  //  - grades per leg, the CSV, validation statistics and the accuracy label.
  // Every output is indicative (screening), not design.
  const MIN_SPACING_M = 5, MAX_SAMPLES = 600;
  const MANHOLE_MATCH_M = 15, CORRECT_SPAN_M = 150;
  const DEPTH_MIN_M = 0.5, DEPTH_MAX_M = 15;
  const SHALLOW_M = 2.0;   // default threshold for "depth to invert < 2 m" shading (a setting)

  // ---- Distances --------------------------------------------------------------------------------
  const R = 6371008.8;
  function haversine(a, b) {
    const t = Math.PI / 180, dLat = (b.lat - a.lat) * t, dLng = (b.lng - a.lng) * t;
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * t) * Math.cos(b.lat * t) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }
  // A local metric frame around a latitude: [x, y] metres from lng/lat.
  const frame = lat0 => { const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574; return ([lng, lat]) => [lng * kx, lat * ky]; };

  // ---- Sampling ---------------------------------------------------------------------------------
  // Sample spacing for a line: never finer than 5 m or the source's pixel, never more than 600 samples.
  const spacing = (totalM, pixelM = 0) => Math.max(MIN_SPACING_M, pixelM || 0, totalM / MAX_SAMPLES);
  // Points along a polyline ([{ lat, lng }]) at that spacing, both ends included, each with its
  // distance along the line (d, m) and the leg it lies on.
  function samplePoints(pts, pixelM = 0, dist = haversine) {
    const segs = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const s = dist(pts[i - 1], pts[i]); segs.push(s); tot += s; }
    if (!(tot > 0)) return pts.length ? [{ d: 0, lat: pts[0].lat, lng: pts[0].lng, leg: 0 }] : [];
    const step = spacing(tot, pixelM), n = Math.min(MAX_SAMPLES, Math.max(2, Math.floor(tot / step) + 1)), out = [];
    for (let k = 0; k < n; k++) {
      const d = tot * k / (n - 1);
      let t = d, i = 0; while (i < segs.length - 1 && t > segs[i]) { t -= segs[i]; i++; }
      const f = segs[i] ? Math.min(1, t / segs[i]) : 0, a = pts[i], b = pts[i + 1] || pts[i];
      out.push({ d, lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f, leg: i });
    }
    return out;
  }

  // ---- Bilinear interpolation of a raster across tiles --------------------------------------------
  // Fractional pixel position of a point in a web-mercator tile pyramid at zoom z (tile size 256):
  // { tx, ty, px, py } where px, py are pixel coordinates within tile (tx, ty), pixel centres at +0.5.
  function pixelPos(lat, lng, z, size = 256) {
    const n = 2 ** z, xf = (lng + 180) / 360 * n, lr = lat * Math.PI / 180;
    const yf = (1 - Math.log(Math.tan(lr) + 1 / Math.cos(lr)) / Math.PI) / 2 * n;
    return { X: xf * size - 0.5, Y: yf * size - 0.5, size, n };   // global pixel coordinates (centre-registered)
  }
  // The four neighbouring pixels and their weights, each as { tx, ty, px, py, w }, wrapping into the
  // neighbouring tile at an edge.
  function bilinearTaps(lat, lng, z, size = 256) {
    const { X, Y, n } = pixelPos(lat, lng, z, size);
    const x0 = Math.floor(X), y0 = Math.floor(Y), fx = X - x0, fy = Y - y0;
    const taps = [];
    for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
      let gx = x0 + dx, gy = y0 + dy;
      const max = n * size - 1; gx = Math.max(0, Math.min(max, gx)); gy = Math.max(0, Math.min(max, gy));
      taps.push({ tx: Math.floor(gx / size), ty: Math.floor(gy / size), px: gx % size, py: gy % size, w });
    }
    return taps;
  }
  // Bilinear value from taps and a pixel reader read(tx, ty, px, py) → number (sync, tiles already loaded).
  const bilinear = (taps, read) => taps.reduce((t, k) => t + (k.w ? k.w * read(k.tx, k.ty, k.px, k.py) : 0), 0);
  // The tiles a set of points needs (deduped "tx/ty" keys), so they can be loaded in one batch.
  function tilesFor(points, z, size = 256) {
    const set = new Set();
    for (const p of points) for (const k of bilinearTaps(p.lat, p.lng, z, size)) set.add(`${k.tx}/${k.ty}`);
    return [...set];
  }
  // Terrarium: elevation (m) = R × 256 + G + B / 256 − 32768.
  const terrarium = (r, g, b) => r * 256 + g + b / 256 - 32768;
  // Ground pixel size (m) of a web-mercator raster at zoom z and latitude.
  const pixelSizeM = (z, lat, size = 256) => 2 * Math.PI * 6378137 * Math.cos(lat * Math.PI / 180) / (2 ** z * size);

  // ---- Peel manholes ----------------------------------------------------------------------------
  // Mains: [{ id, g: [[lng, lat], …], up, dn (inverts, m), dUp, dDn (published depths, m), d (mm), fm }].
  // Each end of a main is a manhole: ground = invert + depth. Depths outside (0.5 m, 15 m) are not
  // used (missing, placeholder or wrong); force mains have no manholes.
  const depthOk = v => v > DEPTH_MIN_M && v < DEPTH_MAX_M;
  function manholesFromMains(mains) {
    const out = new Map();
    for (const m of mains || []) {
      if (m.fm || !m.g || m.g.length < 2) continue;
      for (const [end, pt, inv, dep] of [['up', m.g[0], m.up, m.dUp], ['down', m.g[m.g.length - 1], m.dn, m.dDn]]) {
        if (!(inv > 0) || !depthOk(dep)) continue;
        const key = `${pt[0].toFixed(6)},${pt[1].toFixed(6)}`;
        const mh = { id: m.id, end, lng: pt[0], lat: pt[1], invert: inv, depth: dep, ground: inv + dep };
        // Two mains meeting at one manhole: keep the deeper invert (the outlet) and its depth.
        const was = out.get(key); if (!was || inv < was.invert) out.set(key, mh);
      }
    }
    return [...out.values()];
  }
  // Manholes within maxM (15 m) of the profile line, with their distance along it (d) and off it (off).
  function matchManholes(prof, manholes, maxM = MANHOLE_MATCH_M) {
    if (!prof || prof.length < 2) return [];
    const P = frame(prof[0].lat), out = [];
    const line = prof.map(p => P([p.lng, p.lat]));
    for (const mh of manholes || []) {
      const q = P([mh.lng, mh.lat]); let best = null;
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1], b = line[i], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2)) : 0;
        const off = Math.hypot(a[0] + t * dx - q[0], a[1] + t * dy - q[1]);
        if (!best || off < best.off) best = { off, d: prof[i - 1].d + t * (prof[i].d - prof[i - 1].d) };
      }
      if (best && best.off <= maxM) out.push({ ...mh, d: best.d, off: best.off });
    }
    return out.sort((a, b) => a.d - b.d);
  }
  // DEM at a distance along the profile (linear between samples).
  function zAtD(prof, d, key = 'zRaw') {
    let i = 1; while (i < prof.length - 1 && prof[i].d < d) i++;
    const a = prof[i - 1], b = prof[i] || a, f = b.d > a.d ? Math.max(0, Math.min(1, (d - a.d) / (b.d - a.d))) : 0;
    const za = a[key] != null ? a[key] : a.z, zb = b[key] != null ? b[key] : b.z;
    return za + (zb - za) * f;
  }
  // The correction. prof: [{ d, z }] (z = DEM, kept as zRaw); matches from matchManholes; shift: the
  // datum shift added to each manhole ground (0 when both are on the same datum). Returns a new
  // profile with zRaw, z (corrected inside a span, else the DEM), corrected (bool), and the offsets used.
  function correct(prof, matches, { span = CORRECT_SPAN_M, shift = 0 } = {}) {
    const out = prof.map(p => ({ ...p, zRaw: p.zRaw != null ? p.zRaw : p.z, z: p.zRaw != null ? p.zRaw : p.z, corrected: false }));
    const pts = (matches || []).map(m => ({ ...m, groundAdj: m.ground + shift, offset: m.ground + shift - zAtD(out, m.d) })).sort((a, b) => a.d - b.d);
    const spans = [];
    for (let k = 1; k < pts.length; k++) {
      const a = pts[k - 1], b = pts[k];
      if (b.d - a.d > span || b.d === a.d) continue;
      spans.push({ from: a.d, to: b.d, a, b });
      for (const p of out) {
        if (p.d < a.d || p.d > b.d) continue;
        const f = (p.d - a.d) / (b.d - a.d);
        p.z = p.zRaw + a.offset + (b.offset - a.offset) * f; p.corrected = true;
      }
    }
    return { prof: out, manholes: pts, spans };
  }

  // ---- Profile figures ---------------------------------------------------------------------------
  // Grade per leg of the measured line: rise / run between the leg's first and last sample.
  function legGrades(prof) {
    const legs = new Map();
    for (const p of prof) { const l = legs.get(p.leg) || { leg: p.leg, a: p, b: p }; l.b = p; legs.set(p.leg, l); }
    return [...legs.values()].map(({ leg, a, b }) => ({ leg, from: a.d, to: b.d, rise: b.z - a.z, grade: b.d > a.d ? (b.z - a.z) / (b.d - a.d) : 0 }));
  }
  // Vertical exaggeration of a chart: (vertical px per m) / (horizontal px per m).
  const exaggeration = (Wpx, Hpx, lengthM, rangeM) => (Hpx / Math.max(rangeM, 1e-6)) / (Wpx / Math.max(lengthM, 1e-6));
  // Samples whose depth to invert (ground − invert) is below the threshold, as runs [{ from, to }].
  function shallowRuns(prof, threshold = SHALLOW_M) {
    const runs = []; let cur = null;
    for (const p of prof) {
      const shallow = p.san && !p.san.fm && p.z - p.san.inv < threshold;
      if (shallow) { if (!cur) runs.push(cur = { from: p.d, to: p.d }); else cur.to = p.d; } else cur = null;
    }
    return runs;
  }
  // The CSV: d, lat, lng, ground, ground_raw, source, invert, depth, watermain_flag.
  const CSV_COLS = ['d', 'lat', 'lng', 'ground', 'ground_raw', 'source', 'invert', 'depth', 'watermain_flag'];
  function csvRows(prof) {
    const f = (v, k) => (v == null || !isFinite(v) ? '' : (+v).toFixed(k));
    return prof.map(p => {
      const inv = p.san && !p.san.fm ? p.san.inv : null;
      const src = `${p.source || ''}${p.corrected ? '+manhole' : ''}`;
      return [f(p.d, 1), f(p.lat, 6), f(p.lng, 6), f(p.z, 2), f(p.zRaw != null ? p.zRaw : p.z, 2), src, f(inv, 2), inv != null ? f(p.z - inv, 2) : '', p.wat ? 1 : 0];
    });
  }
  function toCSV(prof, header = '') {
    const cell = v => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
    return header + [CSV_COLS.join(','), ...csvRows(prof).map(r => r.map(cell).join(','))].join('\n') + '\n';
  }

  // ---- Sewer profile (along a main, manhole to manhole) ----------------------------------------------
  // pipes: [{ id, up, dn (inverts), len (m), dUp, dDn }] in flow order. Slope (%) per pipe and adverse
  // (negative, i.e. the invert rises downstream) flags; depths kept only where published (0.5–15 m).
  function sewerSlopes(pipes) {
    let run = 0;
    return (pipes || []).map(p => {
      const slope = p.len > 0 && p.up != null && p.dn != null ? (p.up - p.dn) / p.len * 100 : null;
      const r = { ...p, from: run, to: run + (p.len || 0), slope, adverse: slope != null && slope < 0, groundUp: depthOk(p.dUp) ? p.up + p.dUp : null, groundDn: depthOk(p.dDn) ? p.dn + p.dDn : null };
      run += p.len || 0;
      return r;
    });
  }

  // ---- Validation and the accuracy label -----------------------------------------------------------
  // errors: DEM − manhole ground (m). → { n, median, medianAbs, within05, within1 } (percentages 0–100).
  function validationStats(errors) {
    const e = (errors || []).filter(v => v != null && isFinite(v)).sort((a, b) => a - b);
    const med = a => { if (!a.length) return null; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
    const abs = e.map(Math.abs).sort((a, b) => a - b);
    const r = v => (v == null ? null : +v.toFixed(3));
    return { n: e.length, median: r(med(e)), medianAbs: r(med(abs)), within05: e.length ? +(abs.filter(v => v <= 0.5).length / e.length * 100).toFixed(1) : null, within1: e.length ? +(abs.filter(v => v <= 1).length / e.length * 100).toFixed(1) : null };
  }
  // The area of the validation table a point falls in (areas: { key: { name, bbox: [w, s, e, n] } }).
  function areaAt(table, lat, lng) {
    for (const [key, a] of Object.entries((table && table.areas) || {})) { const [w, s, e, n] = a.bbox; if (lng >= w && lng <= e && lat >= s && lat <= n) return { key, ...a }; }
    return null;
  }
  // "typically within X m of Peel manholes in this area": X = the median |error| of the source in the
  // area, from the stored table; never hard-coded. source: 'lidar' | 'terrain'.
  function accuracyLabel(table, lat, lng, source, opts = {}) {
    const a = areaAt(table, lat, lng);
    const srcName = source === 'lidar' ? `lidar terrain model${opts.project ? ` (${opts.project})` : ''}` : 'terrain tiles (~7 m)';
    if (!a) return { text: `Ground: ${srcName}. No validation against Peel manholes for this area.`, validated: false };
    const row = a.rows && a.rows[source];
    if (!row || !row.n) return { text: `Ground: ${srcName}. No validation against Peel manholes for ${source === 'lidar' ? 'the lidar' : 'the terrain tiles'} in ${a.name}.`, validated: false, area: a.name };
    const yr = source === 'lidar' && opts.year ? `, lidar flown ${opts.year}` : '';
    return { text: `Ground: ${srcName}: typically within ${row.medianAbs.toFixed(row.medianAbs < 1 ? 2 : 1)} m of Peel manholes in ${a.name} (median of ${row.n}${yr}).`, validated: true, area: a.name, row };
  }

  const api = {
    MIN_SPACING_M, MAX_SAMPLES, MANHOLE_MATCH_M, CORRECT_SPAN_M, DEPTH_MIN_M, DEPTH_MAX_M, SHALLOW_M, CSV_COLS,
    haversine, spacing, samplePoints, pixelPos, bilinearTaps, bilinear, tilesFor, terrarium, pixelSizeM,
    depthOk, manholesFromMains, matchManholes, zAtD, correct, legGrades, exaggeration, shallowRuns, csvRows, toCSV,
    sewerSlopes, validationStats, areaAt, accuracyLabel,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelProfileCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
