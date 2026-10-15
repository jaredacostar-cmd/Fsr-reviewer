(function (root) {
'use strict';
  // ---- 3D view arithmetic (PeelMassingCore): building heights and proposed massing ------------
  // Pure functions, no DOM; shared by js/view-3d.js, scripts/build-3d-tiles.js and the tests.
  // Everything here is indicative: never a design, a zoning envelope or a survey.
  const STOREY_M = 3.2;            // metres per storey, for both OSM levels and proposals
  const DEFAULT_STOREYS = 2;       // an OSM building with no height and no levels
  const UNIT_GFA_M2 = 90;          // gross floor area per apartment unit (units estimate)
  const FLOOR_EFFICIENCY = 0.85;   // share of a floor plate that is saleable / rentable
  const SITE_COVERAGE = 0.5;       // the indicative footprint covers half the application site
  const SQUARE_M = 30;             // side of the indicative footprint when no site boundary exists
  const MAX_STOREYS = 60;

  const num = v => { const n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return Number.isFinite(n) ? n : null; };

  // OSM building height: the height tag (metres; "12 m", "40'" in feet), then building:levels
  // (+ roof:levels) × 3.2 m, then 2 storeys. basis says which, and estimated is true unless the
  // height was tagged.
  function buildingHeight(tags = {}) {
    const raw = tags.height != null ? String(tags.height).trim() : '';
    if (raw) {
      const ft = /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)/i.exec(raw), m = num(raw);
      const h = ft ? +ft[1] * 0.3048 : m;
      if (h != null && h > 0 && h < 400) return { h: +h.toFixed(1), basis: 'height', estimated: false };
    }
    const lv = num(tags['building:levels']), roof = num(tags['roof:levels']) || 0;
    if (lv != null && lv > 0 && lv < 150) return { h: +((lv + roof) * STOREY_M).toFixed(1), basis: 'levels', estimated: true, storeys: lv + roof };
    return { h: DEFAULT_STOREYS * STOREY_M, basis: 'default', estimated: true, storeys: DEFAULT_STOREYS };
  }
  // The base of a building part (min_height), so podiums and towers stack.
  function buildingBase(tags = {}) {
    const m = num(tags.min_height); if (m != null && m >= 0) return m;
    const lv = num(tags['building:min_level']); return lv != null && lv > 0 ? +(lv * STOREY_M).toFixed(1) : 0;
  }

  // Heights stated in a proposal's description: "a 25-storey tower", "two 12 storey buildings",
  // "height of 38 m". The tallest stated figure wins; storeys of an existing building to be
  // demolished do not count.
  const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
  function statedHeight(text) {
    const s = String(text || '');
    let storeys = null, metres = null;
    const re = /\b(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:\(\d+\)\s*)?[- ]?\s*(?:storeys?|story|stories|sty)\b/gi;
    for (let m; (m = re.exec(s));) {
      const before = s.slice(Math.max(0, m.index - 25), m.index);
      if (/existing|demolish|current/i.test(before) || /^[^.;]{0,40}(?:to be demolished|demolition)/i.test(s.slice(m.index))) continue;
      const n = /\d/.test(m[1]) ? +m[1] : WORDS[m[1].toLowerCase()];
      if (n >= 1 && n <= 99 && (storeys == null || n > storeys)) storeys = n;
    }
    const mr = /(?:height of\s*|heights? (?:of )?up to\s*|\s|^)(\d{1,3}(?:\.\d+)?)\s*(?:m|metres?|meters?)\b(?:\s*(?:tall|high|in height))?/gi;
    for (let m; (m = mr.exec(s));) {
      const ctx = m[0];
      if (!/height|tall|high/i.test(ctx)) continue;
      const v = +m[1]; if (v >= 3 && v <= 300 && (metres == null || v > metres)) metres = v;
    }
    return { storeys, metres };
  }

  // Apartment-type proposals: the only ones a units estimate can give a height for (a subdivision
  // of houses has no single building to draw).
  const APARTMENT = /apart|\bapts?\b|condo|tower|high[- ]?rise|mid[- ]?rise|storey|\bsty\b|mixed[- ]use|stacked|back[- ]to[- ]back|multi[- ]?(unit|res)|residential building|retirement|long[- ]term care|seniors/i;
  const isApartment = p => APARTMENT.test(`${p.description || ''} ${(p.types || []).join(' ')} ${p.unitMix && p.unitMix.apartment ? 'apartment' : ''}`);

  // Shoelace area of a lng/lat ring, in m² (equirectangular about the ring's latitude).
  function ringAreaM2(ring) {
    if (!ring || ring.length < 3) return 0;
    const lat0 = ring.reduce((t, c) => t + c[1], 0) / ring.length, kx = 111320 * Math.cos(lat0 * Math.PI / 180), ky = 110574;
    let a = 0; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * kx) * (ring[i][1] * ky) - (ring[i][0] * kx) * (ring[j][1] * ky);
    return Math.abs(a / 2);
  }
  function centroid(ring) { const n = ring.length; return [ring.reduce((t, c) => t + c[0], 0) / n, ring.reduce((t, c) => t + c[1], 0) / n]; }
  // The indicative footprint: the site boundary scaled about its centroid to cover SITE_COVERAGE
  // of it, or a 30 m square at the address. Never the actual building outline.
  function footprint(p) {
    const ring = p.siteRings && p.siteRings[0] && p.siteRings[0].length >= 4 ? p.siteRings[0] : null;
    if (ring) {
      const k = Math.sqrt(SITE_COVERAGE), [cx, cy] = centroid(ring);
      const r = ring.map(([x, y]) => [+(cx + (x - cx) * k).toFixed(7), +(cy + (y - cy) * k).toFixed(7)]);
      return { ring: r, areaM2: ringAreaM2(r), basis: 'site' };
    }
    if (p.lat == null || p.lng == null) return null;
    const dy = SQUARE_M / 2 / 110574, dx = SQUARE_M / 2 / (111320 * Math.cos(p.lat * Math.PI / 180));
    const r = [[p.lng - dx, p.lat - dy], [p.lng + dx, p.lat - dy], [p.lng + dx, p.lat + dy], [p.lng - dx, p.lat + dy], [p.lng - dx, p.lat - dy]].map(([x, y]) => [+x.toFixed(7), +y.toFixed(7)]);
    return { ring: r, areaM2: SQUARE_M * SQUARE_M, basis: 'square' };
  }
  // Storeys from units: units × 90 m² gross ÷ (footprint × 85% efficiency), 1–60.
  function storeysFromUnits(units, areaM2) {
    if (!(units > 0) || !(areaM2 > 0)) return null;
    return Math.max(1, Math.min(MAX_STOREYS, Math.ceil(units * UNIT_GFA_M2 / (areaM2 * FLOOR_EFFICIENCY))));
  }

  // A proposal's massing: the stated height (metres), else stated storeys × 3.2 m, else an
  // estimate from its units (apartment-type only), else null (hidden).
  function massingFor(p) {
    const fp = footprint(p); if (!fp) return null;
    const st = statedHeight(p.description);
    let h = null, storeys = null, basis = null;
    if (st.metres) { h = st.metres; storeys = st.storeys || Math.round(st.metres / STOREY_M); basis = 'stated height'; }
    else if (st.storeys) { storeys = st.storeys; h = storeys * STOREY_M; basis = 'stated storeys'; }
    else if (p.units > 0 && isApartment(p)) { storeys = storeysFromUnits(p.units, fp.areaM2); h = storeys * STOREY_M; basis = 'estimated from units'; }
    if (!h) return null;
    return { ring: fp.ring, footprint: fp.basis, h: +h.toFixed(1), storeys, basis, estimated: basis === 'estimated from units' };
  }
  const massingLabel = m => `${m.storeys ? `${m.storeys} storeys, ` : ''}${m.h.toFixed(0)} m (${m.basis}${m.basis === 'estimated from units' ? `: ${UNIT_GFA_M2} m² per unit, ${Math.round(FLOOR_EFFICIENCY * 100)}% efficiency` : ''}). Footprint: ${m.footprint === 'site' ? `${Math.round(SITE_COVERAGE * 100)}% of the application site, centred` : `a ${SQUARE_M} m square at the address`}. Indicative only, not the proposed design.`;

  // GeoJSON features for the shown developments; hidden ones are counted, not drawn.
  function massingFeatures(projects) {
    const features = []; let hidden = 0;
    for (const p of projects) {
      const m = massingFor(p);
      if (!m) { hidden++; continue; }
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: [m.ring] }, properties: { key: p.key, title: p.title || '', phase: p.phase, h: m.h, storeys: m.storeys, basis: m.basis, estimated: m.estimated, footprint: m.footprint, units: p.units || null } });
    }
    return { type: 'FeatureCollection', features, hidden };
  }

  // Web-Mercator tile helpers (the 3D view's terrain tiles).
  const tileBounds = (z, x, y) => { const n = 2 ** z, lng = v => v / n * 360 - 180, lat = v => Math.atan(Math.sinh(Math.PI * (1 - 2 * v / n))) * 180 / Math.PI; return { w: lng(x), e: lng(x + 1), n: lat(y), s: lat(y + 1) }; };
  const lngLatToTile = (lng, lat, z) => { const n = 2 ** z, r = lat * Math.PI / 180; return { x: Math.floor((lng + 180) / 360 * n), y: Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n) }; };
  function tilesInBbox([w, s, e, n], z) {
    const a = lngLatToTile(w, n, z), b = lngLatToTile(e, s, z), out = [];
    for (let x = a.x; x <= b.x; x++) for (let y = a.y; y <= b.y; y++) out.push({ z, x, y });
    return out;
  }
  const inBbox = ([w, s, e, n], lng, lat) => lng >= w && lng <= e && lat >= s && lat <= n;
  // Terrarium encoding (to 1/256 m; quantum q in metres rounds first, for smaller PNGs).
  function terrariumEncode(h, q = 0) {
    const v = (q ? Math.round(h / q) * q : h) + 32768;
    const r = Math.floor(v / 256), g = Math.floor(v) % 256, b = Math.min(255, Math.round((v - Math.floor(v)) * 256));
    return [r, g, b];
  }

  const api = { STOREY_M, DEFAULT_STOREYS, UNIT_GFA_M2, FLOOR_EFFICIENCY, SITE_COVERAGE, SQUARE_M, MAX_STOREYS, buildingHeight, buildingBase, statedHeight, isApartment, ringAreaM2, footprint, storeysFromUnits, massingFor, massingLabel, massingFeatures, tileBounds, lngLatToTile, tilesInBbox, inBbox, terrariumEncode };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelMassingCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
