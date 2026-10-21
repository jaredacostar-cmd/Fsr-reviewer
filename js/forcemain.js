/* A preliminary sanitary forcemain and the pump duty it needs, to Peel's rules (PeelForcemain).
 * Pure: no DOM, no fetch (tests/forcemain.test.js). Used by the Labs Sewer designer's pumped option,
 * where gravity can't reach the existing sewer.
 *
 * The rules are the Region of Peel Linear Wastewater Standards (published Nov 2022, R1.0 Mar 2023),
 * s. 4 (Forcemains):
 *   - head loss by Hazen-Williams, Hf = [Q / (0.2785 C D^2.63)]^1.852 L, with C = 140 (s. 4.1)
 *   - velocity 1.0 m/s or more at the design flow, or 0.8 m/s with variable speed drives provided
 *     1.0 m/s flushing is reached weekly; 3.0 m/s or less (s. 4.1.1–4.1.2)
 *   - 100 mm minimum; sized to minimise head loss while keeping the minimum velocity (s. 4.2.1):
 *     the largest size that still reaches it
 *   - cover as for gravity sewers, 2.5 m (3.5 m industrial / commercial), trench 8.0 m or less
 *     (s. 4.4.1.1 → 3.4.1.1)
 *   - discharge to the receiving gravity sewer through a discharge maintenance hole, no more than
 *     0.3 m above its flow line (s. 4, general)
 *   - avoid local high and low points; air release at the high points, drains at the low points
 *     (s. 4.5, 4.5.1)
 * Not sized here: the pumping station itself (wet well, pumps, firm capacity, standby, the
 * forcemain's twinning: Peel's Sewage Pumping Station Design Standard) and the mandatory transient
 * analysis (s. 4.3.6). A screening design, not a detailed design: Peel's W&WW Infrastructure
 * Planning team must validate or confirm all results.
 */
(function (root) {
  'use strict';
  const RULES = { C: 140, vMin: 1.0, vMinVfd: 0.8, vMax: 3.0, dMin: 100, outletAbove: 0.3, coverRes: 2.5, coverIci: 3.5, trenchMax: 8.0, bedding: 0.15 };
  // Internal diameters (mm); PVC or HDPE to 600 mm, concrete pressure pipe from 600 mm (Table 4-1).
  const SIZES = [100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 750, 900];
  const SOURCE = 'Region of Peel Linear Wastewater Standards (published Nov 2022, R1.0 Mar 2023), s. 4';
  // The tool's tolerance for a high or low point (not Peel's): the pipe rises then falls (or falls
  // then rises) by at least this much.
  const RELIEF = 0.3;
  // The window the pipe is smoothed over (m): the shallowest pipe that keeps its cover across
  // ±12.5 m, so lidar bumps don't make high points of their own (the tool's, not Peel's).
  const SMOOTH = 25;
  const G = 9.81;

  /** Head loss (m) by Hazen-Williams: Q in m³/s, D and L in m. */
  const hf = (Q, D, L, C = RULES.C) => Math.pow(Q / (0.2785 * C * Math.pow(D, 2.63)), 1.852) * L;
  const vel = (Q, D) => Q / (Math.PI * D * D / 4);

  /** Every size at the flow, and the one to use: the largest that reaches the minimum velocity. */
  function size(qLs, opts = {}, r = RULES) {
    const Q = qLs / 1000, vMin = opts.vfd ? r.vMinVfd : r.vMin;
    const all = SIZES.filter(d => d >= r.dMin).map(dmm => { const v = vel(Q, dmm / 1000); return { dmm, v, ok: v >= vMin - 1e-9 && v <= r.vMax + 1e-9, hf1000: hf(Q, dmm / 1000, 1000, r.C) }; });
    const ok = all.filter(c => c.ok), pick = ok.length ? ok[ok.length - 1] : null;
    return { all, pick, vMin };
  }

  // The high and low points of a profile [{x, z}]: turning points with at least RELIEF either side
  // (the ends of the line are not counted).
  function turns(prof, relief = RELIEF) {
    const out = []; if (prof.length < 3) return out;
    let dir = 0, mx = prof[0], mn = prof[0], ext = prof[0];
    for (const p of prof.slice(1)) {
      if (dir === 0) {
        if (p.z > mx.z) mx = p; if (p.z < mn.z) mn = p;
        if (mx.z - mn.z >= relief) {
          dir = mx.x > mn.x ? 1 : -1; ext = dir === 1 ? mx : mn;
          const first = dir === 1 ? mn : mx; if (first !== prof[0]) out.push({ ...first, kind: dir === 1 ? 'low' : 'high' });
        }
      } else if (dir === 1) {
        if (p.z >= ext.z) ext = p; else if (ext.z - p.z >= relief) { out.push({ ...ext, kind: 'high' }); dir = -1; ext = p; }
      } else if (p.z <= ext.z) ext = p; else if (p.z - ext.z >= relief) { out.push({ ...ext, kind: 'low' }); dir = 1; ext = p; }
    }
    return out.filter(t => t.x > prof[0].x && t.x < prof[prof.length - 1].x);
  }

  /**
   * Design the forcemain along a drawn route.
   *   samples: [{x, g}] ground along the route from the station (x = 0) to the connection
   *   conn:    { invert, dmm }: the receiving gravity sewer at the discharge maintenance hole
   *   qLs:     the design flow (L/s; the peak the station pumps)
   *   opts:    { vfd, ici, wwDepth (the wet well's low water level, m below the ground at the station;
   *              else the incoming sewer's invert: the cover (2.5 m, or 3.5 m industrial / commercial)
   *              over a 200 mm pipe; wwNote says which) }
   */
  function design(samples, conn, qLs, opts = {}, r = RULES) {
    if (!(qLs > 0)) return { ok: false, why: 'Type a design flow' };
    const G0 = [...samples].sort((a, b) => a.x - b.x), L = G0[G0.length - 1].x;
    const sz = size(qLs, opts, r), reasons = [];
    // No size within the velocity range: every size too slow (the velocity falls as the size grows,
    // so the smallest, 100 mm, comes closest), or every size too fast (the largest comes closest).
    const big = sz.all[sz.all.length - 1], under = !sz.pick && sz.all[0].v < sz.vMin;
    // A size chosen (opts.dmm): that size, its velocity checked like any other.
    const chosen = opts.dmm ? sz.all.find(c => c.dmm === +opts.dmm) : null;
    const pick = chosen || sz.pick || (under ? sz.all[0] : big);
    if (!sz.pick && !chosen) reasons.push(under ? `the flow is too small for ${sz.vMin.toFixed(1)} m/s in the 100 mm minimum (${sz.all[0].v.toFixed(2)} m/s): it needs variable speed pumps or a flushing cycle; shown at 100 mm, the closest`
      : `the flow needs more than 3.0 m/s in the largest size (${big.dmm} mm, ${big.v.toFixed(2)} m/s); shown at ${big.dmm} mm, the closest`);
    const D = pick.dmm / 1000, Q = qLs / 1000, cover = opts.ici ? r.coverIci : r.coverRes;
    // The shallowest pipe with its cover, smoothed over the window (the lowest within ±SMOOTH/2).
    const top = G0.map(s => ({ x: s.x, z: s.g - cover - D }));
    const prof = top.map(p => ({ x: p.x, g: G0.find(s => s.x === p.x).g, inv: Math.min(...top.filter(q => Math.abs(q.x - p.x) <= SMOOTH / 2).map(q => q.z)) }));
    // The outlet: into the discharge maintenance hole at most 0.3 m above the receiving flow line.
    const end = prof[prof.length - 1], outletInv = Math.max(conn.invert, Math.min(end.inv, conn.invert + r.outletAbove));
    if (outletInv > end.inv + 1e-9) reasons.push('the receiving sewer is shallower than the forcemain\'s cover at the discharge maintenance hole');
    end.inv = outletInv;
    // Trench and cover along the line.
    const deep = prof.filter(p => p.g - p.inv + r.bedding > r.trenchMax + 1e-6);
    if (deep.length) reasons.push(`a trench deeper than ${r.trenchMax.toFixed(1)} m at ${deep.length} point${deep.length === 1 ? '' : 's'}`);
    const minCover = Math.min(...prof.slice(0, -1).map(p => p.g - p.inv - D));
    // Head: friction by Hazen-Williams; the static lift from the wet well's low level to the
    // discharge, or over a high point that stands above the hydraulic grade line.
    const hfTot = hf(Q, D, L, r.C), sPer = hfTot / (L || 1);
    const ww = G0[0].g - (opts.wwDepth > 0 ? +opts.wwDepth : cover + 0.2), wwAssumed = !(opts.wwDepth > 0);
    const wwNote = wwAssumed ? `the incoming sewer: ${cover} m of cover over a 200 mm pipe` : '';
    const outEl = outletInv + D;   // the obvert at the outlet: the forcemain runs full to there
    const lift = outEl - ww; let over = null;
    for (const p of prof) { const need = p.inv + D + sPer * p.x - (outEl + hfTot); if (need > 1e-6 && (!over || need > over.need)) over = { x: p.x, z: p.inv + D, need }; }
    const tdh = lift + hfTot + (over ? over.need : 0);
    const t = turns(prof.map(p => ({ x: p.x, z: p.inv })));
    const highs = t.filter(p => p.kind === 'high'), lows = t.filter(p => p.kind === 'low');
    const v = vel(Q, D);
    const checks = [
      chosen ? { t: `Size (${r.dMin} mm minimum, as chosen; within the velocity range)`, pass: chosen.ok, val: `${pick.dmm} mm${sz.pick && sz.pick.dmm !== pick.dmm ? ` (the tool's pick: ${sz.pick.dmm} mm)` : ''}` }
        : { t: `Size (${r.dMin} mm minimum; the largest that reaches the minimum velocity, for the least head loss)`, pass: !!sz.pick, val: `${pick.dmm} mm` },
      { t: `Velocity at the design flow (${sz.vMin.toFixed(1)} m/s or more${opts.vfd ? ', variable speed pumps with weekly 1.0 m/s flushing' : ''})`, pass: v >= sz.vMin - 1e-9, val: `${v.toFixed(2)} m/s` },
      { t: 'Velocity (3.0 m/s or less)', pass: v <= r.vMax + 1e-9, val: `${v.toFixed(2)} m/s` },
      { t: `Cover over the pipe (${cover} m or more)`, pass: minCover >= cover - 0.01, val: `${minCover.toFixed(2)} m at the least` },
      { t: 'Trench (8.0 m or less)', pass: !deep.length, val: `${Math.max(...prof.map(p => p.g - p.inv + r.bedding)).toFixed(2)} m at the deepest` },
      { t: 'Discharge (into the maintenance hole, 0.3 m or less above the flow line)', pass: outletInv <= conn.invert + r.outletAbove + 1e-9 && outletInv >= conn.invert - 1e-9, val: `${(outletInv - conn.invert).toFixed(2)} m above` },
      { t: 'Full flow (the hydraulic grade line above the pipe all the way)', pass: !over, val: over ? `a high point at ${Math.round(over.x)} m stands ${over.need.toFixed(2)} m above it: the pumps lift over it` : 'yes' },
      { t: 'High and low points (avoid where practical; air release at highs, drains at lows)', pass: true, val: `${highs.length} high, ${lows.length} low` },
    ];
    return {
      ok: !reasons.length, why: reasons[0] || '', reasons, dmm: pick.dmm, chosen: !!chosen, material: pick.dmm >= 600 ? 'concrete pressure pipe or PVC / HDPE at 600 mm' : 'PVC or HDPE',
      q: qLs, v, L, hf: hfTot, hfPerKm: sPer * 1000, lift, over, tdh, ww, wwAssumed, wwNote, outletInv, outEl, cover, prof, highs, lows,
      power: 1000 * G * Q * tdh / 1000, sizes: sz.all, vMin: sz.vMin, checks, source: SOURCE,
      // The system curve: head at a fraction of the design flow (static plus friction).
      curve: f => lift + (over ? over.need : 0) + hf(Q * f, D, L, r.C),
    };
  }

  const api = { RULES, SIZES, SOURCE, RELIEF, SMOOTH, hf, vel, size, turns, design };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelForcemain = api;
})(typeof window !== 'undefined' ? window : globalThis);
