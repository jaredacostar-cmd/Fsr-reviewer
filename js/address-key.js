(function (root) {
'use strict';
  // Address keys: one normalised key per civic address, the same in the build
  // (scripts/build-addresses.js, against the Region of Peel's address points) and in the browser
  // (against data/address-points.json). DATASETS.md §9.
  //
  //   keys(address, municipality) → ['Brampton|10194|HEART LAKE|RD|', ...]
  //       several for a multi-address string ("1580 and 1650 Dundas St E", "50 & 60 Harborn Rd",
  //       "120, 128 Queen St S and 169 Crumbie St"); none for number 0 (unaddressed land), an
  //       intersection or a description ("North East Corner of …").
  //   civic(num, name, type, dir, muni) → the key for one address point's fields
  //   loose(key) → the key without type and direction (a second try)
  //   of(record) → the address points found for a record: [{ id, lat, lng, landUse, houseStyle, distM }]
  //   idsOf(records) → Set of address point ids (ROPADRID) for a development's records
  //   noteFor(record) → "Address point 385 m from the file's map point…" (over 250 m), a match line, or ''
  // of / idsOf / noteFor read App().state.addressPoints (loaded on demand: loadPoints()).
  const TYPE = {
    ROAD: 'RD', RD: 'RD', STREET: 'ST', ST: 'ST', DRIVE: 'DR', DR: 'DR', AVENUE: 'AVE', AVE: 'AVE', AV: 'AVE',
    BOULEVARD: 'BLVD', BLVD: 'BLVD', CRESCENT: 'CRES', CRES: 'CRES', COURT: 'CRT', CRT: 'CRT', CT: 'CRT',
    PARKWAY: 'PKY', PKWY: 'PKY', PKY: 'PKY', TRAIL: 'TRAIL', TRL: 'TRAIL', CIRCLE: 'CIR', CIR: 'CIR',
    PLACE: 'PL', PL: 'PL', WAY: 'WAY', LANE: 'LANE', LN: 'LANE', TERRACE: 'TERR', TERR: 'TERR', TER: 'TERR',
    GATE: 'GATE', MEWS: 'MEWS', SQUARE: 'SQ', SQ: 'SQ', GARDENS: 'GDNS', GDNS: 'GDNS', LINE: 'LINE',
    GROVE: 'GROVE', HEIGHTS: 'HTS', HTS: 'HTS', CLOSE: 'CLOSE', SIDEROAD: 'SIDE RD', SDRD: 'SIDE RD',
    HIGHWAY: 'HWY', HWY: 'HWY', RUN: 'RUN', RIDGE: 'RIDGE', WALK: 'WALK', ROW: 'ROW', HOLLOW: 'HOLLOW',
    CHASE: 'CHASE', CROSSING: 'CROSS', CROSS: 'CROSS', MANOR: 'MANOR', PROMENADE: 'PROM', PROM: 'PROM',
    COVE: 'COVE', HILL: 'HILL', LANDING: 'LANDNG', LANDNG: 'LANDNG', PATH: 'PATH', RISE: 'RISE', TOWNLINE: 'TLINE', TLINE: 'TLINE',
  };
  const DIR = { E: 'E', EAST: 'E', W: 'W', WEST: 'W', N: 'N', NORTH: 'N', S: 'S', SOUTH: 'S' };
  // A municipality or community after a comma ends the address ("…, Brampton, ON L6X 0A1"); without
  // a comma only at the very end (Mississauga Road is a street).
  const PLACES = 'BRAMPTON|MISSISSAUGA|CALEDON EAST|CALEDON|BOLTON|INGLEWOOD|ALTON|CHELTENHAM|PALGRAVE|STREETSVILLE|PORT CREDIT|MALTON|ONTARIO|ON';
  const MUNI_COMMA = new RegExp(`,\\s*(${PLACES})\\b.*$`), MUNI_END = new RegExp(`\\s(${PLACES})(\\s+ON)?$`);
  const clean = s => String(s || '').toUpperCase().replace(/[’']/g, '').replace(/[^A-Z0-9 ,&\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const nameOf = s => clean(s).replace(/[,&\-]/g, ' ').replace(/\s+/g, ' ').trim();

  function civic(num, name, type, dir, muni) {
    let n = nameOf(name), t = TYPE[nameOf(type)] || nameOf(type);
    const d = DIR[nameOf(dir)] || '';
    if (/^(HWY|HIGHWAY) /.test(n)) { n = n.replace(/^(HWY|HIGHWAY) /, ''); t = 'HWY'; }
    if (t === 'PLACE') t = 'PL';
    const num_ = String(num == null ? '' : num).trim().toUpperCase();
    return `${muni}|${num_}|${n}|${t}|${d}`;
  }
  const loose = k => k.split('|').slice(0, 3).join('|');

  // "HEART LAKE RD" → { name, type, dir }
  function street(s) {
    const w = nameOf(s).split(' ').filter(Boolean);
    let dir = '', type = '';
    if (w.length > 1 && DIR[w[w.length - 1]]) dir = DIR[w.pop()];
    if (w.length > 1 && w[w.length - 2] === 'SIDE' && w[w.length - 1] === 'RD') { w.splice(-2, 2); type = 'SIDE RD'; }
    else if (w.length > 1 && TYPE[w[w.length - 1]]) type = TYPE[w.pop()];
    if (w.length > 1 && (w[0] === 'HWY' || w[0] === 'HIGHWAY')) { w.shift(); type = 'HWY'; }      // "HWY 50"
    if (w.length === 1 && type === 'HWY') return { name: w[0], type, dir };                          // "410 HIGHWAY"
    return w.length ? { name: w.join(' '), type, dir } : null;
  }

  function keys(address, muni) {
    let a = clean(address);
    if (!a || !muni) return [];
    a = a.split(/\bFORMERLY\b|\bF K A\b|\bFKA\b|\(|;/)[0];
    a = a.replace(/\s[A-Z]\d[A-Z]\s*\d[A-Z]\d.*$/, '').replace(MUNI_COMMA, '').replace(MUNI_END, '').replace(MUNI_END, '');
    a = a.replace(/,(?!\s*\d)[^&]*$/, '').replace(/[ ,]+$/, '').trim();     // "…, Unit 4"
    if (/\b(CORNER|SIDE OF|NORTH OF|SOUTH OF|EAST OF|WEST OF|BETWEEN|INTERSECTION)\b/.test(a)) return [];
    // Parts joined by "and" / "&": a part with only numbers takes the street of the next part.
    const parts = a.split(/\s+(?:AND|&)\s+|\s*&\s*/).map(s => s.trim()).filter(Boolean);
    const out = [];
    let carry = null;
    for (let i = parts.length - 1; i >= 0; i--) {
      const m = parts[i].match(/^((?:\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?\s*,\s*)*\d+[A-Z]?(?:\s*-\s*\d+[A-Z]?)?)\s*(.*)$/);
      if (!m) { carry = null; continue; }
      const nums = m[1].split(/\s*,\s*/).map(x => x.replace(/\s*-.*$/, '').replace(/^0+(?=\d)/, ''));
      const st = m[2] ? street(m[2]) : carry;
      if (!st) continue;
      carry = st;
      out.unshift(...nums.filter(n => n && !/^0+[A-Z]?$/.test(n)).map(n => `${muni}|${n}|${st.name}|${st.type}|${st.dir}`));
    }
    return [...new Set(out)];
  }

  // ---- In the browser ---------------------------------------------------------------------------
  const App = () => root.PeelApp;
  const pts = () => (App() && App().state && App().state.addressPoints) || null;
  let loading = null;
  function loadPoints() {
    if (pts()) return Promise.resolve(pts());
    if (!loading) loading = fetch('data/address-points.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { if (d && App()) App().state.addressPoints = d; return d; });
    return loading;
  }
  const metres = (a, b, c, d) => Math.hypot((d - b) * 111320 * Math.cos(a * Math.PI / 180), (c - a) * 111320);
  function of(r) {
    const D = pts(); if (!D || !r) return [];
    const out = [];
    for (const k of keys(r.address, r.municipality)) {
      const v = D.a[k] || D.a[loose(k)]; if (!v) continue;
      const [id, lat, lng, lu, hs] = v;
      out.push({ id, lat, lng, landUse: D.landUse[lu] || '', houseStyle: D.houseStyle[hs] || '', distM: r.lat != null ? Math.round(metres(r.lat, r.lng, lat, lng)) : null });
    }
    return out;
  }
  const idsOf = records => { const s = new Set(); for (const r of records || []) for (const p of of(r)) s.add(p.id); return s; };
  function noteFor(r) {
    const ps = of(r); if (!ps.length) return '';
    const near = ps.reduce((m, p) => (p.distM != null && (m == null || p.distM < m.distM) ? p : m), null);
    const what = [near && near.houseStyle, near && near.landUse].filter(Boolean).join(', ');
    return near && near.distM > 250 ? `Address point ${near.distM.toLocaleString('en-CA')} m from the file's map point${what ? ` (${what})` : ''}: the map point or the address may be off (large sites are often mapped at their centre).`
      : `Matches the Region's address point${ps.length > 1 ? `s (${ps.length})` : ''}${what ? ` · ${what}` : ''}.`;
  }

  // A file's address line, filled in when the points arrive (loaded on first use).
  const pending = new Map();
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function noteHTML(r) {
    if (!r || !r.address) return '';
    if (pts()) { const t = noteFor(r); return t ? `<p class="small addr-note">${esc(t)}</p>` : ''; }
    pending.set(String(r.uid), r);
    loadPoints().then(() => {
      for (const el of document.querySelectorAll('[data-addr-uid]')) {
        const rec = pending.get(el.dataset.addrUid), t = rec && pts() ? noteFor(rec) : '';
        if (t) { el.textContent = t; el.removeAttribute('data-addr-uid'); } else el.remove();
      }
      pending.clear();
    });
    return `<p class="small muted addr-note" data-addr-uid="${esc(r.uid)}">Checking the Region's address points…</p>`;
  }

  const api = { keys, civic, loose, street, of, idsOf, noteFor, noteHTML, loadPoints, TYPE, DIR };
  root.PeelAddr = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
