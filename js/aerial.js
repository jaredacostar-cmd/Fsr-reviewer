/*
 * Aerial check: compares a development's site on the aerial photo from before the
 * application with the latest aerial photo (change relative to the surroundings, and
 * building-edge structure), plus building footprints traced from those
 * photos, and estimates the probability the development has been completed.
 *
 * Pure parts (geometry, pixel classification, scoring) run in Node for tests; check()
 * fetches imagery in the browser (the image services allow cross-origin pixel reads).
 *
 * This is an estimate from image and footprint evidence, not a site inspection.
 */
(function (root) {
  'use strict';

  const R = 6378137, M = Math.PI * R;
  const merc = (lng, lat) => [lng * M / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * R];
  const cos2 = lat => Math.cos(lat * Math.PI / 180) ** 2;

  // ---- Site geometry ------------------------------------------------------------------
  function ringArea(ring, lat0) {   // m², equirectangular around lat0
    const kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110540;
    let a = 0;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
    return Math.abs(a / 2);
  }
  function circle(lng, lat, r, n = 24) {
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n * 2 * Math.PI;
      ring.push([lng + r * Math.cos(t) / (111320 * Math.cos(lat * Math.PI / 180)), lat + r * Math.sin(t) / 110540]);
    }
    return ring;
  }
  /**
   * The land the development sits on: the application boundary when the data has one,
   * otherwise a circle around the point sized for the building type.
   */
  function siteGeometry(p) {
    let rings = p.siteRings || null, source = 'application boundary';
    if (!rings) {
      const polys = p.records.filter(r => r.kind === 'application' && r.poly && r.phase !== 'cancelled').map(r => r.poly);
      if (polys.length) rings = polys.sort((a, b) => ringArea(b[0], p.lat) - ringArea(a[0], p.lat))[0];
    }
    if (!rings && p.lat != null) {
      const units = p.units || 0;
      const r = units <= 4 ? 15 : units <= 50 ? 30 : 45;
      rings = [circle(p.lng, p.lat, r)];
      source = `${r} m around the address (no boundary in the data)`;
    }
    if (!rings) return null;
    const lat0 = p.lat ?? rings[0][0][1];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const ring of rings) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    return { rings, source, area: rings.reduce((a, r) => a + ringArea(r, lat0), 0), bbox: [x0, y0, x1, y1], lat: lat0 };
  }

  // ---- Imagery years ----------------------------------------------------------------------
  /** Latest imagery, and the newest imagery from before the project started. */
  function pickYears(src, startYear) {
    const years = Object.keys(src.years).map(Number).sort((a, b) => b - a);
    if (!years.length) return null;
    const latest = years[0];
    let before = startYear ? years.find(y => y < startYear) : null;
    const preStart = before != null;
    if (before == null) before = years[years.length - 1];
    return { latest, before: before === latest ? null : before, preStart };
  }

  // ---- Pixels -------------------------------------------------------------------------------
  // The city photos are leaf-off spring / fall flights with muted, source-specific colour, so
  // nothing here relies on absolute colour. Each photo is normalised (luminance z-scores over
  // the whole frame) and compared with itself and with the surroundings of the site:
  //  - structure: edge strength (Sobel) inside the site, relative to the frame's contrast;
  //    roofs, roads and building edges raise it, fields and graded earth lower it;
  //  - change: how much the normalised photo differs between years inside the site, relative
  //    to the ring around it (which absorbs registration and exposure differences).
  /**
   * `rgba` is canvas pixel data (w x h); `mask[i]` is non-zero inside the site. Transparent
   * pixels (outside the imagery) are skipped.
   */
  function analyse(rgba, mask, w, h) {
    const n = w * h, z = new Float32Array(n), ok = new Uint8Array(n);
    let sum = 0, sum2 = 0, cnt = 0, inside = 0, covered = 0;
    for (let i = 0; i < n; i++) {
      if (mask[i]) inside++;
      if (rgba[i * 4 + 3] < 128) continue;
      ok[i] = 1; if (mask[i]) covered++;
      const l = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
      z[i] = l; sum += l; sum2 += l * l; cnt++;
    }
    const mean = cnt ? sum / cnt : 0, sd = cnt ? Math.sqrt(Math.max(1, sum2 / cnt - mean * mean)) : 1;
    for (let i = 0; i < n; i++) z[i] = ok[i] ? (z[i] - mean) / sd : 0;
    let eIn = 0, nIn = 0, eOut = 0, nOut = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!ok[i] || !ok[i - 1] || !ok[i + 1] || !ok[i - w] || !ok[i + w]) continue;
      const gx = z[i - w + 1] + 2 * z[i + 1] + z[i + w + 1] - z[i - w - 1] - 2 * z[i - 1] - z[i + w - 1];
      const gy = z[i + w - 1] + 2 * z[i + w] + z[i + w + 1] - z[i - w - 1] - 2 * z[i - w] - z[i - w + 1];
      const g = Math.hypot(gx, gy);
      if (mask[i]) { eIn += g; nIn++; } else { eOut += g; nOut++; }
    }
    return { structure: nIn ? eIn / nIn : 0, structureAround: nOut ? eOut / nOut : 0, coverage: inside ? covered / inside : 0, z, ok };
  }
  /** Mean normalised difference inside the site, and its ratio to the ring around it. */
  function change(a, b, mask) {
    let dIn = 0, nIn = 0, dOut = 0, nOut = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!a.ok[i] || !b.ok[i]) continue;
      const d = Math.abs(a.z[i] - b.z[i]);
      if (mask[i]) { dIn += d; nIn++; } else { dOut += d; nOut++; }
    }
    if (!nIn || !nOut) return null;
    const site = dIn / nIn, around = dOut / nOut;
    return { site, around, ratio: around > 0 ? site / around : null };
  }

  // ---- Probability ------------------------------------------------------------------------
  const PRIOR = { completed: 0.85, construction: 0.35, permit: 0.2, approved: 0.06, review: 0.03, inception: 0.02, cancelled: 0.01 };
  const logit = p => Math.log(p / (1 - p));
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const pct = v => `${Math.round(v * 100)}%`;

  /**
   * Probability the development is complete, from the records (phase, permits) and the
   * aerial evidence. Returns { probability, status, signals: [{ text, effect }] }.
   * ev = { latestYear, beforeYear, preStart, now, before, change: { site, around, ratio }, fpNow, fpBefore, fpYearNow, fpYearBefore, permitYear }
   */
  function score(p, ev, today = new Date()) {
    const signals = [];
    const add = (text, effect) => signals.push({ text, effect });
    let L = logit(PRIOR[p.phase] ?? 0.05);
    add(`Records: ${p.phaseLabel || p.phase}`, 0);
    const b = p.buildout;
    if (b && b.permitted > 0) {
      const total = Math.max(b.planned, b.permitted);
      const share = total ? b.completed / total : 0;
      if (share > 0) { L = Math.max(L, logit(Math.min(0.95, 0.1 + 0.85 * share))); add(`Permits: ${pct(share)} of units completed`, share >= 0.9 ? 1 : 0.5); }
      if (b.remaining > 0) { L -= 0.8; add(`${b.remaining.toLocaleString('en-CA')} planned units have no building permit yet`, -1); }
    }
    if ((p.phase === 'permit' || p.phase === 'construction') && ev.permitYear) {
      const age = today.getFullYear() - ev.permitYear;
      if (age >= 5) { L += 1.0; add(`Permit issued ${age} years ago`, 1); }
      else if (age >= 3) { L += 0.6; add(`Permit issued ${age} years ago`, 0.5); }
    }

    // Aerial photos. Weak when the latest photo predates the building permit.
    let w = 1;
    if (ev.latestYear && ev.permitYear && ev.latestYear < ev.permitYear) {
      w = 0.3;
      add(`Latest aerial (${ev.latestYear}) is older than the building permit (${ev.permitYear}), so it can't show the building`, 0);
    }
    // Structure (building edges) is the main photo signal: it rises when buildings and
    // roads appear and falls when a site is cleared or graded. Change relative to the
    // surroundings only adds weight, since whole neighbourhoods often redevelop together.
    const now = ev.now, before = ev.before, ch = ev.change;
    const x = v => `×${v.toFixed(1)}`;
    const building = !['completed', 'cancelled'].includes(p.phase);
    if (now && now.coverage >= 0.3 && before && before.coverage >= 0.3) {
      const r = before.structure > 0 ? now.structure / before.structure : 1;
      const moved = ch && ch.ratio != null && ch.ratio >= 1.4 && ch.site >= 0.5;
      const span = `${ev.beforeYear} → ${ev.latestYear}`;
      if (r >= 1.4) { L += (moved ? 1.6 : 1.2) * w; add(`More building edges on the site ${span} (structure ${x(r)})${moved ? `, changed ${x(ch.ratio)} more than its surroundings` : ''}`, 1); }
      else if (r <= 0.75) { L -= 0.9 * w; add(`Fewer building edges ${span} (structure ${x(r)}): cleared or graded, construction under way`, -1); }
      else if (moved) { L += 0.3 * w; add(`Site changed ${x(ch.ratio)} more than its surroundings ${span}`, 0.5); }
      else if (building) { L -= 0.6 * w; add(`No visible change on the site ${span}`, -1); }
      else add(`No clear change on the site ${span} (small or infill sites may not show)`, 0);
    } else if (now && now.coverage < 0.3) {
      add('The latest aerial does not cover this site', 0);
    } else if (now && !before) {
      add('No earlier aerial to compare with', 0);
    }

    // Building footprints traced from the aerials. Dated footprints (Mississauga, by year)
    // can show absence; undated ones (Brampton) are not kept current, so only count for.
    if (ev.fpNow != null) {
      const small = !(ev.siteArea > 50000);
      if (ev.fpBefore != null) {
        const d = ev.fpNow - ev.fpBefore;
        if (d >= 0.05) { L += d >= 0.1 ? 2.2 : 1.2; add(`Mapped buildings cover ${pct(ev.fpBefore)} (${ev.fpYearBefore}) → ${pct(ev.fpNow)} (${ev.fpYearNow}) of the site`, 1); }
        else if (ev.fpNow < 0.03 && small) { L -= 1.2; add(`No mapped buildings on the site in ${ev.fpYearNow}`, -1); }
        else add(`Mapped buildings cover ${pct(ev.fpBefore)} (${ev.fpYearBefore}) → ${pct(ev.fpNow)} (${ev.fpYearNow}) of the site`, 0);
      } else if (typeof ev.fpYearNow === 'number' && ev.fpNow < 0.03 && small) { L -= 1.2; add(`No mapped buildings on the site in ${ev.fpYearNow}`, -1); }
      else if (ev.fpNow >= 0.15) { L += 0.6; add(`Mapped buildings cover ${pct(ev.fpNow)} of the site${typeof ev.fpYearNow === 'number' ? ` (${ev.fpYearNow})` : ''}; age unknown`, 0.5); }
    }

    const probability = Math.round(Math.min(0.98, Math.max(0.02, sigmoid(L))) * 100) / 100;
    let status;
    if (probability >= 0.7) status = 'Likely completed';
    else if (p.phase === 'completed') status = 'Completed in the records; not confirmed on the aerial';
    else if (signals.some(x => x.effect < 0 && /cleared or graded/.test(x.text)) || ['permit', 'construction'].includes(p.phase) ||
      (ev.fpNow != null && ev.fpBefore != null && ev.fpNow - ev.fpBefore >= 0.05)) status = 'Likely under construction';
    else status = 'Not visibly started';
    return { probability, status, signals };
  }

  // ---- Browser: fetch imagery and footprints ------------------------------------------------
  function exportUrl(url, bbox3857, w, h) {
    const op = /ImageServer\/?$/.test(url) ? 'exportImage' : 'export';
    const q = new URLSearchParams({ bbox: bbox3857.join(','), bboxSR: 3857, imageSR: 3857, size: `${w},${h}`, format: 'jpgpng', transparent: true, f: 'image' });
    return `${url.replace(/\/$/, '')}/${op}?${q}`;
  }
  function loadImage(url, timeout = 30000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      const t = setTimeout(() => { img.src = ''; reject(new Error('timed out')); }, timeout);
      img.onload = () => { clearTimeout(t); resolve(img); };
      img.onerror = () => { clearTimeout(t); reject(new Error('image failed to load')); };
      img.src = url;
    });
  }
  /** Frame (Web Mercator) around the site and the pixel transform for it. */
  function frame(geom, maxPx = 300) {
    const [x0, y0] = merc(geom.bbox[0], geom.bbox[1]), [x1, y1] = merc(geom.bbox[2], geom.bbox[3]);
    const pad = Math.max(25, 0.2 * Math.max(x1 - x0, y1 - y0));
    const b = [x0 - pad, y0 - pad, x1 + pad, y1 + pad];
    const s = maxPx / Math.max(b[2] - b[0], b[3] - b[1]);
    const w = Math.max(64, Math.round((b[2] - b[0]) * s)), h = Math.max(64, Math.round((b[3] - b[1]) * s));
    const toPx = (lng, lat) => { const [x, y] = merc(lng, lat); return [(x - b[0]) / (b[2] - b[0]) * w, (b[3] - y) / (b[3] - b[1]) * h]; };
    return { bbox: b, w, h, toPx, metresPerPx: (b[2] - b[0]) / w / Math.cos(geom.lat * Math.PI / 180) };
  }
  function tracePath(ctx, geom, fr) {
    ctx.beginPath();
    for (const ring of geom.rings) ring.forEach(([lng, lat], i) => { const [x, y] = fr.toPx(lng, lat); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.closePath();
  }
  function siteMask(geom, fr) {
    const c = document.createElement('canvas'); c.width = fr.w; c.height = fr.h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; tracePath(ctx, geom, fr); ctx.fill('evenodd');
    const d = ctx.getImageData(0, 0, fr.w, fr.h).data, m = new Uint8Array(fr.w * fr.h);
    for (let i = 0; i < m.length; i++) m[i] = d[i * 4 + 3] > 127 ? 1 : 0;
    return m;
  }
  async function photo(url, geom, fr, mask) {
    const img = await loadImage(exportUrl(url, fr.bbox, fr.w, fr.h));
    const c = document.createElement('canvas'); c.width = fr.w; c.height = fr.h;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0, fr.w, fr.h);
    const stats = analyse(ctx.getImageData(0, 0, fr.w, fr.h).data, mask, fr.w, fr.h);
    ctx.lineWidth = 2; ctx.strokeStyle = '#ffd400'; ctx.setLineDash([6, 4]);
    tracePath(ctx, geom, fr); ctx.stroke();
    return { canvas: c, stats };
  }
  async function footprintShare(url, geom) {
    const body = new URLSearchParams({
      geometry: JSON.stringify({ rings: geom.rings, spatialReference: { wkid: 4326 } }), geometryType: 'esriGeometryPolygon', inSR: 4326,
      spatialRel: 'esriSpatialRelIntersects', where: '1=1',
      outStatistics: JSON.stringify([{ statisticType: 'sum', onStatisticField: 'Shape__Area', outStatisticFieldName: 'a' }]), f: 'json',
    });
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
    let j;
    try { j = await (await fetch(`${url}/query`, { method: 'POST', body, signal: ctl.signal })).json(); }
    finally { clearTimeout(t); }
    if (j.error) throw new Error(j.error.message || 'footprint query failed');
    const a = (j.features && j.features[0] && j.features[0].attributes.a) || 0;
    // Shape__Area is in Web Mercator square metres; scale to ground area.
    return Math.min(1, a * cos2(geom.lat) / geom.area);
  }

  /**
   * Run the check for a project. cfg = PEEL_CONFIG. Returns
   * { geom, years, before, latest, change, fp, result } (canvases in before/latest).
   */
  async function check(p, cfg, { phaseLabel } = {}) {
    const src = cfg.imagery && cfg.imagery[p.municipality];
    if (!src) throw new Error(`no imagery configured for ${p.municipality}`);
    const geom = siteGeometry(p);
    if (!geom) throw new Error('no location');
    const startYear = p.first ? p.first.getFullYear() : null;
    const years = pickYears(src, startYear);
    const fr = frame(geom), mask = siteMask(geom, fr);
    const [latest, before] = await Promise.all([
      photo(src.years[years.latest].url, geom, fr, mask),
      years.before ? photo(src.years[years.before].url, geom, fr, mask).catch(() => null) : null,
    ]);
    const diff = before ? change(before.stats, latest.stats, mask) : null;

    // Footprints: Mississauga by year (before the application, and latest); Brampton current.
    const fpSrc = cfg.footprints && cfg.footprints[p.municipality];
    const fp = {};
    if (fpSrc && fpSrc.years) {
      const fy = Object.keys(fpSrc.years).map(Number).sort((a, b) => b - a);
      fp.yearNow = fy[0];
      fp.yearBefore = startYear ? fy.find(y => y < startYear) : null;
      const [n, b] = await Promise.all([
        footprintShare(fpSrc.years[fp.yearNow], geom).catch(() => null),
        fp.yearBefore ? footprintShare(fpSrc.years[fp.yearBefore], geom).catch(() => null) : null,
      ]);
      fp.now = n; fp.before = b;
    } else if (fpSrc && fpSrc.current) {
      fp.yearNow = 'current'; fp.now = await footprintShare(fpSrc.current, geom).catch(() => null);
    }

    const permitDates = p.records.filter(r => r.kind === 'permit').flatMap(r => r.events.filter(e => e.phase === 'permit').map(e => e.date.getFullYear()));
    const ev = {
      latestYear: years.latest, beforeYear: years.before, preStart: years.preStart,
      now: latest.stats, before: before && before.stats, change: diff,
      fpNow: fp.now ?? null, fpBefore: fp.before ?? null, fpYearNow: fp.yearNow, fpYearBefore: fp.yearBefore, siteArea: geom.area,
      permitYear: permitDates.length ? Math.min(...permitDates) : null,
    };
    const result = score({ ...p, phaseLabel }, ev);
    return { geom, years, src, before, latest, change: diff, fp, ev, result };
  }

  const api = { merc, circle, ringArea, siteGeometry, pickYears, analyse, change, score, exportUrl, frame, check, PRIOR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAerial = api;
})(typeof window !== 'undefined' ? window : globalThis);
