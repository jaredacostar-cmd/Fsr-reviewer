/* Peel Growth Pipeline (unofficial) – pure "tightest pipes" helper.
 *
 * Phase 4 ("Analysis tab restructure"): the Wastewater › Plants sub-view shows the
 * "Tightest pipes" section — the pipes carrying the most flow relative to their
 * full-flow capacity at build-out. Picking the top N by load ratio is pure logic
 * with no DOM access, so it lives here and is unit-tested under `node --test`.
 * js/app.js reaches it as window.PeelTightPipes (loaded before js/app.js in
 * index.html); the per-pipe load ratios come from pipeStats() there.
 */
(function () {
  'use strict';

  /**
   * The top `n` entries by load ratio, highest first.
   * entries: [{ i, r1, ... }] where r1 is load ÷ full capacity at build-out
   *   (null / non-finite when the pipe's capacity isn't trusted — no reliable
   *   published slope — so those pipes never rank).
   * Ties break by pipe index so the order is stable.
   * Never mutates the input array.
   */
  function topTightPipes(entries, n = 10) {
    if (!Array.isArray(entries) || !(n > 0)) return [];
    return entries
      .filter(e => e && typeof e.r1 === 'number' && isFinite(e.r1))
      .slice()
      .sort((a, b) => (b.r1 - a.r1) || ((a.i || 0) - (b.i || 0)))
      .slice(0, n);
  }

  const api = { topTightPipes };

  if (typeof window !== 'undefined') window.PeelTightPipes = api;
  // Export for node-based tests without a DOM.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
