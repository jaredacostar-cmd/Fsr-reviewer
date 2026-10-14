/* Peel Growth Pipeline (unofficial) – pure upstream helpers.
 *
 * "Show upstream" (Phase 3b) lists the areas/blocks draining through a feature.
 * The closure over a downstream chain is pure logic with no DOM access, so it
 * lives here and is unit-tested under `node --test`. js/app.js reaches it as
 * window.PeelUpstream (loaded before js/app.js in index.html).
 */
(function () {
  'use strict';

  /**
   * Every id in `ids` whose downstream chain (via intoOf) passes through `id`.
   * intoOf: id -> the id it drains into (null/undefined at the end of a chain).
   * Chains are walked with a visited set, so merges and accidental cycles are safe.
   * Order follows `ids`.
   */
  function upstreamIdsOf(ids, intoOf, id) {
    const out = [];
    for (const y of ids) {
      if (y === id) continue;
      const seen = new Set();
      for (let z = intoOf(y); z != null && !seen.has(z); z = intoOf(z)) {
        if (z === id) { out.push(y); break; }
        seen.add(z);
      }
    }
    return out;
  }

  const api = { upstreamIdsOf };

  if (typeof window !== 'undefined') window.PeelUpstream = api;
  // Export for node-based tests without a DOM.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
