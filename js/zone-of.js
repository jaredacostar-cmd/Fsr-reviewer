(function (root) {
'use strict';
  // SPEC 1.8: one pressure zone per development, used everywhere, with its reason (pure).
  //   mapped        inside a mapped zone
  //   planned-main  outside: the zone the planned DC main it would connect to feeds
  //   nearest       outside: the nearest mapped zone (as drawn on the design boards)
  // The ground's elevation band never gives a second answer: it only flags the other zone(s) the
  // ground also fits (js/water-trace.js).
  function zoneOf(p, byId) {
    if (!p || !byId) return null;
    if (p.pz && p.pz.length) { const z = byId.get(p.pz[0]); return z ? { id: z.id, z, reason: 'mapped' } : null; }
    const n = p.pzNear, z = n && byId.get(n.id);
    return z ? { id: z.id, z, reason: n.via ? 'planned-main' : 'nearest', m: n.m, via: n.via || null } : null;
  }
  // The other zone levels whose ground range (2020 Master Plan, Vol. 3, Table 3) holds the elevation.
  function alsoFits(level, elev, table) {
    if (elev == null || !table) return [];
    return Object.keys(table).map(Number).filter(n => n !== level && elev >= table[n][1] && elev <= table[n][2]);
  }
  const api = { zoneOf, alsoFits };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelZoneOf = api;
})(typeof window !== 'undefined' ? window : globalThis);
