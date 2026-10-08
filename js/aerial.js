/*
 * Aerial check: compares a development's site on the aerial photo from before the
 * application with the latest aerial photo, plus building footprints traced from those
 * photos, and estimates the probability the development has been completed.
 *
 * Pure parts (geometry, pixel classification, scoring) run in Node for tests; check()
 * fetches imagery in the browser (the image services allow cross-origin pixel reads).
 *
 * This is an estimate from colour and footprint evidence, not a site inspection.
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
  /** Rough land-cover class of one pixel. */
  function classify(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b), sat = max - min, br = (r + g + b) / 3;
    if (br < 45) return 'shadow';
    if (g >= r + 6 && g >= b + 4 && br < 200) return 'veg';
    if (r >= g && g >= b && r - b >= 22 && br >= 70 && br <= 210 && sat < 90) return 'soil';
    if (sat < 28 || (br > 200 && sat < 45)) return 'built';
    return 'other';
  }
  /**
   * Share of each class inside the site. `rgba` is canvas pixel data; `mask[i]` is non-zero
   * for pixels inside the site. Transparent pixels (outside the imagery) are skipped.
   */
  function analyse(rgba, mask) {
    const n = { veg: 0, soil: 0, built: 0, shadow: 0, other: 0 };
    let inside = 0, covered = 0;
    const classes = new Uint8Array(mask.length);
    const code = { veg: 1, soil: 2, built: 3, shadow: 4, other: 5 };
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i]) continue;
      inside++;
      if (rgba[i * 4 + 3] < 128) continue;
      covered++;
      const c = classify(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
      n[c]++; classes[i] = code[c];
    }
    const f = k => (covered ? n[k] / covered : 0);
    return { veg: f('veg'), soil: f('soil'), built: f('built') + f('shadow') / 2, shadow: f('shadow'), coverage: inside ? covered / inside : 0, pixels: covered, classes };
  }
  /** Share of site pixels whose class changed between two images of the same size. */
  function classChange(a, b, mask) {
    let n = 0, d = 0;
    for (let i = 0; i < mask.length; i++) {
      if (!mask[i] || !a[i] || !b[i]) continue;
      n++; if (a[i] !== b[i]) d++;
    }
    return n ? d / n : null;
  }

  // ---- Probability ------------------------------------------------------------------------
  const PRIOR = { completed: 0.85, construction: 0.35, permit: 0.2, approved: 0.06, review: 0.03, inception: 0.02, cancelled: 0.01 };
  const logit = p => Math.log(p / (1 - p));
  const sigmoid = x => 1 / (1 + Math.exp(-x));
  const pct = v => `${Math.round(v * 100)}%`;

  /**
   * Probability the development is complete, from the records (phase, permits) and the
   * aerial evidence. Returns { probability, status, signals: [{ text, effect }] }.
   * ev = { latestYear, beforeYear, preStart, now, before, change, fpNow, fpBefore, fpYearNow, fpYearBefore, permitYear, now: Date }
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
    const now = ev.now, before = ev.before;
    if (now && now.coverage >= 0.3) {
      if (now.soil >= 0.2) { L -= 1.2 * w; add(`Bare ground on ${pct(now.soil)} of the site in ${ev.latestYear}: earthworks or construction`, -1); }
      if (before && before.coverage >= 0.3) {
        const dBuilt = now.built - before.built, dVeg = now.veg - before.veg;
        if (dBuilt >= 0.15 || (dVeg <= -0.2 && now.built >= 0.4)) {
          L += 1.2 * w; add(`Built-up area ${pct(before.built)} (${ev.beforeYear}) → ${pct(now.built)} (${ev.latestYear})`, 1);
        } else if (Math.abs(dBuilt) < 0.05 && Math.abs(dVeg) < 0.05 && now.soil < 0.1 && (ev.change == null || ev.change < 0.3)) {
          L -= 0.6 * w; add(`Little visible change between ${ev.beforeYear} and ${ev.latestYear}`, -1);
        } else {
          add(`Built-up area ${pct(before.built)} (${ev.beforeYear}) → ${pct(now.built)} (${ev.latestYear})`, 0);
        }
        if (ev.change != null && ev.change >= 0.35 && now.built >= 0.4 && dBuilt > -0.05) {
          L += 0.6 * w; add(`${pct(ev.change)} of the site looks different: redeveloped`, 0.5);
        }
      } else {
        add(`Built-up area ${pct(now.built)} in ${ev.latestYear}`, 0);
      }
    } else if (now) {
      add('The latest aerial does not cover this site', 0);
    }

    // Building footprints traced from the aerials.
    if (ev.fpNow != null) {
      if (ev.fpBefore != null) {
        const d = ev.fpNow - ev.fpBefore;
        if (d >= 0.1) { L += 2.2; add(`Mapped buildings cover ${pct(ev.fpBefore)} (${ev.fpYearBefore}) → ${pct(ev.fpNow)} (${ev.fpYearNow}) of the site`, 1); }
        else if (ev.fpNow < 0.03) { L -= 1.8; add(`No mapped buildings on the site in ${ev.fpYearNow}`, -1); }
        else add(`Mapped buildings cover ${pct(ev.fpBefore)} (${ev.fpYearBefore}) → ${pct(ev.fpNow)} (${ev.fpYearNow}) of the site`, 0);
      } else if (ev.fpNow < 0.03) { L -= 1.5; add(`No mapped buildings on the site (${ev.fpYearNow})`, -1); }
      else if (ev.fpNow >= 0.15) { L += 0.8; add(`Mapped buildings cover ${pct(ev.fpNow)} of the site (${ev.fpYearNow}); age unknown`, 0.5); }
      else add(`Mapped buildings cover ${pct(ev.fpNow)} of the site (${ev.fpYearNow})`, 0);
    }

    const probability = Math.min(0.98, Math.max(0.02, sigmoid(L)));
    let status;
    if (probability >= 0.7) status = 'Likely completed';
    else if ((now && now.soil >= 0.2) || ['permit', 'construction'].includes(p.phase) ||
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
    const stats = analyse(ctx.getImageData(0, 0, fr.w, fr.h).data, mask);
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
    const r = await fetch(`${url}/query`, { method: 'POST', body });
    const j = await r.json();
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
    const change = before ? classChange(before.stats.classes, latest.stats.classes, mask) : null;

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
      now: latest.stats, before: before && before.stats, change,
      fpNow: fp.now ?? null, fpBefore: fp.before ?? null, fpYearNow: fp.yearNow, fpYearBefore: fp.yearBefore,
      permitYear: permitDates.length ? Math.min(...permitDates) : null,
    };
    const result = score({ ...p, phaseLabel }, ev);
    return { geom, years, src, before, latest, change, fp, ev, result };
  }

  const api = { merc, circle, ringArea, siteGeometry, pickYears, classify, analyse, classChange, score, exportUrl, frame, check, PRIOR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAerial = api;
})(typeof window !== 'undefined' ? window : globalThis);
