#!/usr/bin/env node
'use strict';
/*
 * Time Box check against the live Esri Wayback service (Actions only; the sandbox cannot reach it).
 * Runs the same code the browser runs (js/timebox-core.js): the release list, then the bisected
 * tile-hash check for a real box, and reports what a browser would meet: sizes, CORS headers,
 * request counts, timings and the years found. Log only.
 * Usage: node scripts/probe-wayback.js
 */
const T = require('../js/timebox-core.js');
const ORIGIN = 'https://jaredacostar-cmd.github.io';
const BOXES = {
  'Mount Pleasant (Brampton)': [-79.840, 43.665, -79.825, 43.675],
  'Heart Lake Rd (pilot)': [-79.780, 43.720, -79.768, 43.728],
};
const ms = t0 => `${Date.now() - t0} ms`;
(async () => {
  let t0 = Date.now();
  const r = await fetch(T.WAYBACK.capabilitiesURL, { headers: { Origin: ORIGIN } });
  const xml = await r.text();
  console.log(`capabilities: HTTP ${r.status}, ${(xml.length / 1e6).toFixed(2)} MB, CORS ${r.headers.get('access-control-allow-origin')}, ${ms(t0)}`);
  t0 = Date.now(); const rels = T.parseWaybackCapabilities(xml); console.log(`parsed ${rels.length} releases in ${ms(t0)}: ${rels[0] && rels[0].date} … ${rels[rels.length - 1] && rels[rels.length - 1].date}`);
  const last = rels[rels.length - 1];
  if (last) console.log(`latest template: ${last.template}\n  matrix set ${last.matrixSet || '(none; default028mm)'}, Leaflet: ${T.WAYBACK.leafletTemplate(last)}`);
  const cfg = await fetch(T.WAYBACK.configURL, { headers: { Origin: ORIGIN } });
  console.log(`config fallback: HTTP ${cfg.status}, CORS ${cfg.headers.get('access-control-allow-origin')}, ${T.parseWaybackConfig(await cfg.json()).length} releases`);
  for (const [name, box] of Object.entries(BOXES)) {
    const z = T.chooseZoom(box, 4), tiles = T.tilesForBox(box, z);
    let req = 0, bytes = 0, fails = 0, cors = null, maxMs = 0;
    const run = T.limiter(T.CONCURRENCY);
    const sigAt = async i => (await Promise.all(tiles.map(t => run(async () => {
      const s = Date.now(); req++;
      const res = await fetch(T.WAYBACK.tileURL(rels[i], t.z, t.x, t.y), { headers: { Origin: ORIGIN } });
      if (cors == null) cors = res.headers.get('access-control-allow-origin');
      if (!res.ok) { fails++; throw new Error(`HTTP ${res.status}`); }
      const b = new Uint8Array(await res.arrayBuffer()); bytes += b.length; maxMs = Math.max(maxMs, Date.now() - s);
      return T.hashBytes(b);
    })))).join('|');
    t0 = Date.now();
    const { sig } = await T.bisectSignatures(rels.length, i => sigAt(i).catch(() => null));
    const byRel = {}; rels.forEach((x, i) => { byRel[x.release] = sig[i]; });
    const distinct = T.distinctReleases(rels, byRel), years = T.onePerYear(distinct);
    console.log(`\n${name}: zoom ${z}, ${tiles.length} tiles; ${req} requests (${fails} failed), ${(bytes / 1e6).toFixed(1)} MB, slowest tile ${maxMs} ms, total ${ms(t0)}, tile CORS ${cors}`);
    console.log(`  ${distinct.length} releases with new imagery; years kept: ${years.map(y => `${y.year} (${y.date})`).join(', ')}`);
  }
})().catch(e => { console.error(e); process.exit(1); });
