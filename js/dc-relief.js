/* Peel Growth Pipeline (unofficial) – which planned DC main relieves an existing sewer.
 *
 * A DC main is matched to an existing sanitary sewer (as its twin, replacement or upsizing) when it
 * runs along at least half the sewer within 150 m, AND it is sized and placed like relief for it:
 * - size: at least half the sewer's diameter; with no diameter on the map, a primary or force main,
 *   or any main on a sewer of 600 mm or less; a main described as a twin, relief, replacement or
 *   upsizing always passes;
 * - offset: a local main on the same street (median 30 m or less along the sewer); a trunk or force
 *   main within 150 m (twins run in a parallel corridor).
 * Without the size and offset tests, small local mains on nearby streets matched 2 m trunks and
 * carried their whole upstream (docs/dc-impact/ALLOCATION.md, step 3). Pure logic with no DOM:
 * js/masterplan.js reaches it as window.PeelDcRelief; tests require it directly.
 */
(function () {
  'use strict';

  const ALONG_M = 150, MIN_ALONG = 0.5, LOCAL_OFFSET_M = 30, SMALL_PIPE_MM = 600;
  const NAMED = /twin|relief|replac|upsiz|upgrad|parallel/i;

  /** Sized like relief for a sewer of pipeMm: see the header. ln: a DC line { k, d, n, t }. */
  function sizeOk(ln, pipeMm) {
    if (NAMED.test(`${ln.n || ''} ${ln.t || ''}`)) return true;
    if (ln.d) return ln.d >= 0.5 * pipeMm;
    return ln.k === 'primary' || ln.k === 'force' || pipeMm <= SMALL_PIPE_MM;
  }
  /** Placed like relief: a local main on the same street, a trunk or force main in its corridor. */
  const offsetOk = (ln, medianM) => medianM <= (ln.k === 'local' ? LOCAL_OFFSET_M : ALONG_M);

  /**
   * How a DC line runs along a sewer: { along (share of the sewer's points within 150 m), median (m) },
   * or null when it is not relief for it. dists: each of the sewer's points' distance (m) to the line.
   */
  function reliefMatch(ln, pipeMm, dists) {
    if (!dists.length) return null;
    const along = dists.filter(m => m <= ALONG_M).length / dists.length;
    if (along < MIN_ALONG) return null;
    const s = dists.slice().sort((a, b) => a - b), median = s[Math.floor(s.length / 2)];
    return sizeOk(ln, pipeMm) && offsetOk(ln, median) ? { along, median } : null;
  }

  /**
   * The DC line relieving a sewer of pipeMm through points pts ([lng, lat]), among candidate lines
   * (each with g), or null: the one along most of it, then the largest. dist(pt, g): metres.
   */
  function pickRelief(pipeMm, pts, lines, dist) {
    let best = null;
    for (const ln of lines) {
      const m = reliefMatch(ln, pipeMm, pts.map(pt => dist(pt, ln.g)));
      if (m && (!best || m.along > best.along || (m.along === best.along && (ln.d || 0) > (best.ln.d || 0)))) best = { ln, along: m.along };
    }
    return best ? best.ln : null;
  }

  const api = { ALONG_M, LOCAL_OFFSET_M, SMALL_PIPE_MM, sizeOk, offsetOk, reliefMatch, pickRelief };

  if (typeof window !== 'undefined') window.PeelDcRelief = api;
  // Export for node-based tests without a DOM.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
