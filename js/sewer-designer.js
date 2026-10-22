/* Labs: the Sewer designer (PeelSewerDesigner), a tool on the map's rail. Draw a gravity sanitary
 * sewer from a site to an existing Region sewer: the last tap snaps to the sewer (its maintenance
 * hole when one is within 15 m, else a new maintenance hole on the pipe). Type the design flow
 * (L/s, or population / jobs / area at Peel criteria); the tool places the maintenance holes, reads
 * the ground along the line from the lidar terrain model and designs the least-excavation sewer to
 * Peel's Linear Wastewater Standards (js/sewer-design.js). The result: the plan on the map, the
 * profile, every reach and maintenance hole in a table, the rules checked, and a CSV.
 * Pumped: where gravity can't reach, a pumping station at the start and a forcemain along the
 * route to a discharge maintenance hole on the sewer (js/forcemain.js), with the pump duty point.
 *
 * Pure: chainage(), bends(), checks(), csv() (tests/sewer-designer.test.js). The 11×17 print sheet:
 * js/sewer-print.js.
 */
(function (root) {
  'use strict';
  const SWD = typeof module !== 'undefined' && module.exports ? require('./sewer-design.js') : root.PeelSewerDesign;
  const R = 6371008.8, rad = d => d * Math.PI / 180;
  const metres = (a, b) => { const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng), h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
  // Chainage (m) of each vertex along the line.
  const chainage = pts => pts.reduce((out, p, i) => (out.push(i ? out[i - 1] + metres(pts[i - 1], p) : 0), out), []);
  // The deflection at each vertex (degrees; 0 at the ends): the bend a maintenance hole takes.
  function bends(pts) {
    return pts.map((p, i) => {
      if (!i || i === pts.length - 1) return 0;
      const k = Math.cos(rad(p.lat)), a = [(p.lng - pts[i - 1].lng) * k, p.lat - pts[i - 1].lat], b = [(pts[i + 1].lng - p.lng) * k, pts[i + 1].lat - p.lat];
      const c = (a[0] * b[0] + a[1] * b[1]) / ((Math.hypot(...a) * Math.hypot(...b)) || 1);
      return Math.round(Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI);
    });
  }
  // The bend into the existing sewer at the connection (degrees, 0–180): from the last reach (from →
  // at, {lat, lng}) to the existing pipe's direction of flow there. g: the pipe [[lng, lat]…] from its
  // upstream end (the end its InvertUp is at, as the connection's invert reads it); t: the connection's
  // fraction along it. null at its downstream end (t = 1): the pipe out of that maintenance hole is
  // another pipe, not read here.
  function connBend(from, at, g, t) {
    if (!g || g.length < 2 || !(t >= 0) || t >= 1 - 1e-9) return null;
    const pts = g.map(([lng, lat]) => ({ lat, lng })), xs = chainage(pts), want = t * xs[xs.length - 1];
    let i = 1; while (i < pts.length - 1 && xs[i] <= want + 1e-9) i++;
    const brg = (a, b) => Math.atan2((b.lng - a.lng) * Math.cos(rad(a.lat)), b.lat - a.lat) * 180 / Math.PI;
    let dd = Math.abs(brg(from, at) - brg(pts[i - 1], pts[i])) % 360; if (dd > 180) dd = 360 - dd;
    return Math.round(dd);
  }
  // A point at chainage x along the line.
  function pointAt(pts, xs, x) {
    for (let i = 1; i < pts.length; i++) if (x <= xs[i] + 1e-9) { const t = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1); return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t }; }
    return pts[pts.length - 1];
  }
  // The rules checked on a design (Linear Wastewater Standards): [{ t, pass, val }], for the panel and
  // the print sheet. d: PeelSewerDesign.designNet()'s result; net: its network (lineNet() for a single
  // line); conn: the existing sewer.
  function checks(d, net, conn) {
    const f2 = v => (+v).toFixed(2), n0 = v => Math.round(v).toLocaleString('en-CA'), R = d.reaches, NR = net.reaches;
    const trench = SWD.deepest(d, net).trench, vmin = Math.min(...R.map(r => r.v)), vmax = Math.max(...R.map(r => r.vFull)), qr = Math.max(...R.map(r => r.qRatio));
    const dm = r => (r.dmm || d.dmm) / 1000, into = n => R.filter(r => r.to === n), first = R.filter(r => !into(r.from).length);
    const sizes = [...new Set(R.map(r => r.dmm || d.dmm))].sort((a, b) => a - b), rootIns = d.mhs[d.root].ins;
    const minCover = Math.min(...R.map((r, i) => Math.min(...[{ d: 0, g: net.nodes[r.from].g }, ...NR[i].pts, { d: NR[i].L, g: net.nodes[r.to].g }].map(p => p.g - (r.inv_up - r.S * p.d) - dm(r)))));
    const Lmax = Math.max(...R.map(r => r.L)), spOK = R.every(r => r.L <= ((r.dmm || d.dmm) >= 600 ? 190 : 200));
    const sp = sizes[sizes.length - 1] >= 600 ? (sizes[0] >= 600 ? '190' : '200 (190 from 600 mm)') : '200';
    // Each pipe into each maintenance hole: its drop (at least the size difference where the pipe out
    // is larger; the velocity head rule from 375 mm), or a drop structure.
    const drops = d.mhs.flatMap((m, n) => n === d.root ? [] : m.ins.map(x => { const out = R.find(r => r.from === n), rin = R[x.reach]; return { ...x, grow: Math.max(0, dm(out) - dm(rin)), hv: (rin.dmm || d.dmm) > 300 ? 0.5 * rin.v * rin.v / (2 * 9.81) : 0 }; }));
    const dropOK = drops.every(x => x.structure ? x.drop >= 0.9 - 1e-6 : x.drop >= Math.max(0.03, x.grow) - 1e-6 && x.drop <= Math.max(0.2, x.grow, x.hv) + 1e-6);
    const connOK = rootIns.every(x => x.inv + dm(R[x.reach]) >= conn.invert + conn.dmm / 1000 - 1e-6), c0 = rootIns[0];
    const grows = R.every(r => into(r.from).every(x => (x.dmm || d.dmm) <= (r.dmm || d.dmm)));
    const sizeTxt = sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]} mm, into ${conn.dmm} mm` : `${sizes[0]} mm into ${conn.dmm} mm`;
    const c = (t, pass, val) => ({ t, pass, val });
    // The chosen slopes (the designer's setting): every reach within them, the inlet invert to the
    // millimetre (at most 1 mm over a reach steeper than the steepest).
    const rg = d.slopes, held = R.filter(r => r.held), pct = s => `${f2(s * 100)}%`;
    const inRange = rg && R.every(r => r.S >= rg[0] - 1e-9 && r.S <= rg[1] + 0.0011 / r.L);
    const sMinR = Math.min(...R.map(r => r.S)), sMaxR = Math.max(...R.map(r => r.S));
    const needs = held.map(r => r.sVel).filter(x => x != null);
    return [
      ...(rg ? [c(`Slopes (${pct(rg[0])}–${pct(rg[1])}, the range chosen)`, inRange, pct(sMinR) === pct(sMaxR) ? pct(sMinR) : `${pct(sMinR)}–${pct(sMaxR)}`)] : []),
      c(`Pipe size (200 mm minimum, no larger than the existing sewer${R.length > 1 && sizes.length > 1 ? ', never a larger pipe into a smaller one' : ''})`, sizes[0] >= 200 && sizes[sizes.length - 1] <= conn.dmm && grows, sizeTxt),
      c('Velocity at the design flow (0.75 m/s or more)', vmin >= 0.75 - 1e-6, `${f2(vmin)} m/s at the slowest${held.length ? `; ${held.length} reach${held.length === 1 ? '' : 'es'} held at ${pct(rg[1])}, the steepest chosen${needs.length ? ` (0.75 m/s needs ${pct(Math.max(...needs))})` : ''}` : ''}`),
      c('Velocity flowing full (3.0 m/s or less)', vmax <= 3.0 + 1e-6, `${f2(vmax)} m/s at the fastest`),
      c('Flow ratio, design flow to full flow (0.7 or less)', qr <= 0.7 + 1e-6, qr.toFixed(2)),
      c(`The last leg, at the upstream end${first.length > 1 ? ' of each branch' : ''} (1.00% or more)`, first.every(r => r.S >= 0.01 - 1e-8), `${f2(Math.min(...first.map(r => r.S)) * 100)}%${first.length > 1 ? ' at the least' : ''}`),
      c(`Cover over the pipe (${d.cover} m or more)`, minCover >= d.cover - 0.01, `${f2(minCover)} m at the least`),
      c('Trench (8.0 m or less)', trench <= 8.0 + 1e-6, `${f2(trench)} m at the deepest`),
      c(`Maintenance holes (${sp} m apart or less)`, spOK, `${n0(Lmax)} m at the longest`),
      c('Drops through the maintenance holes (0.03–0.20 m, obverts matched where the size grows, or a drop structure from 0.9 m)', dropOK, `${d.structures} drop structure${d.structures === 1 ? '' : 's'}`),
      c('Connection (the new obvert at or above the existing one)', connOK, c0.drop ? `${f2(c0.drop)} m drop${c0.structure ? ' (drop structure)' : ''}` : 'obverts matched'),
    ];
  }
  // The slope range typed in the form (%): [lo, hi] as fractions, null (both blank: the standard's
  // own limits), or { msg } when it can't be used.
  function slopeRange(f) {
    const blank = x => x == null || String(x).trim() === '', lo = +f.sLo, hi = +f.sHi;
    if (blank(f.sLo) && blank(f.sHi)) return null;
    if (blank(f.sLo) || blank(f.sHi) || !(lo > 0) || !(hi > 0)) return { msg: 'Type both slopes (%), or leave both blank for the standard\'s own limits.' };
    if (lo > hi) return { msg: 'The flattest slope is more than the steepest: swap them.' };
    return [lo / 100, hi / 100];
  }
  // ---- Crossings: where a new reach crosses an existing watermain or storm sewer ---------------------
  // Peel's Linear Wastewater Standards s. 3.4.2.1: 0.5 m vertical clearance, outside to outside. The
  // other pipe's depth is not published: a watermain is taken at Peel's minimum cover (its top 1.7 m
  // below the ground, the Water Design Criteria), so the clearance is checked against that; a storm
  // sewer's depth is not known at all, so its crossing is listed to check on site. Pipe walls are
  // not counted (inside diameters). reaches: [{ a: [x, y], b: [x, y] (m, local), inv_up, S, L, dmm,
  // gUp, gDn (ground at the ends), pts: [{ d, g }] (the ground samples between, as the design read
  // them) }]; the ground at a crossing is the reach's sample nearest it. pipes: [{ kind: 'water' |
  // 'storm', d (mm), paths: [[[x, y]…]], src }].
  const CROSS = { clearance: 0.5, wmCover: 1.7 };
  function segX(p, q, r, s) {
    const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-12) return null;
    const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, u = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d;
    return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? { t, u } : null;
  }
  // The reach's ground sample nearest a distance along it (its ends included).
  const groundNear = (r, along) => [{ d: 0, g: r.gUp }, ...(r.pts || []), { d: r.L, g: r.gDn }].reduce((b, p) => (Math.abs(p.d - along) < Math.abs(b.d - along) ? p : b)).g;
  function crossings(reaches, pipes, o = CROSS) {
    const out = [];
    reaches.forEach((r, ri) => {
      for (const pp of pipes) for (const path of pp.paths) for (let k = 1; k < path.length; k++) {
        const x = segX(r.a, r.b, path[k - 1], path[k]); if (!x) continue;
        const along = x.t * r.L, inv = r.inv_up - r.S * along, D = r.dmm / 1000, g = groundNear(r, along);
        const c = { reach: ri, along, kind: pp.kind, d: pp.d || 0, src: pp.src || '', ground: g, obvert: inv + D, invert: inv };
        if (pp.kind === 'water') {
          c.otherTop = g - o.wmCover; c.otherBottom = c.otherTop - c.d / 1000;
          // (the sewer under the watermain, the usual case, or over it)
          c.clear = c.obvert <= c.otherBottom ? c.otherBottom - c.obvert : inv >= c.otherTop ? inv - c.otherTop : -Math.min(c.obvert - c.otherBottom, c.otherTop - inv);
          c.ok = c.clear >= o.clearance - 1e-6;
        } else c.ok = null;
        if (!out.some(e => e.reach === ri && e.kind === c.kind && Math.abs(e.along - along) < 1)) out.push(c);
      }
    });
    return out.sort((a, b) => a.reach - b.reach || a.along - b.along);
  }

  // ---- Room downstream: the design flow added to the Region sewer it joins, down to the plant ------
  // pipes: data/sewers.json's (each [diameter mm, slope, capacity L/s, next, …, lengthM at 14]); k:
  // the pipe it joins; q: the design flow (L/s), added in full to every pipe down the chain (no
  // re-peaking with the rest, no attenuation: the most it can add); at(i) → { q, cap }: the pipe's
  // flow without it (at the demand year) and its trusted full-flow capacity (0: none, e.g. no
  // reliable slope). Rows down the chain, the tightest after, and the pipes whose state changes
  // (85% near full, 100% surcharged; PeelMapMarkers.PIPE_CLS).
  function downstream(pipes, k, q, at) {
    const rows = [], seen = new Set();
    let dist = 0;
    for (let i = k; i != null && i >= 0 && !seen.has(i) && rows.length < 5000; i = pipes[i][3]) {
      seen.add(i);
      const p = pipes[i], a = at(i), cap = a.cap > 0 ? a.cap : 0;
      rows.push({ i, dmm: p[0], year: p[7] || null, dist, len: p[14] || 0, cap, before: a.q, after: a.q + q, r0: cap ? a.q / cap : null, r1: cap ? (a.q + q) / cap : null });
      dist += p[14] || 0;
    }
    const capd = rows.filter(r => r.cap);
    const tight = capd.reduce((b, r) => (!b || r.r1 > b.r1 ? r : b), null);
    return {
      rows, q, recv: rows[0] || null, tight, length: dist,
      over: capd.filter(r => r.r0 < 1 && r.r1 >= 1), near: capd.filter(r => r.r0 < 0.85 && r.r1 >= 0.85 && r.r1 < 1),
      already: capd.filter(r => r.r0 >= 1), unchecked: rows.length - capd.length,
    };
  }
  // The design as CSV: the maintenance holes, then the reaches.
  function csv(d) {
    const f2 = v => (v == null ? '' : (+v).toFixed(2)), lines = ['Maintenance hole,Chainage (m),Ground (m),Invert in (m),Invert out (m),Depth to invert (m),Drop (m),Drop structure,On'];
    d.mhs.forEach((m, i) => lines.push([m.label || `MH ${i + 1}${i === d.mhs.length - 1 ? ' (connection)' : ''}`, f2(m.x), f2(m.g), m.ins && m.ins.length > 1 ? `"${m.ins.map(x => f2(x.inv)).join(' / ')}"` : f2(m.inv_in), f2(m.inv_out), f2(m.depth), f2(m.drop), m.structure ? 'yes' : '', m.run ? `branch ${m.run + 1}` : 'main line'].join(',')));
    lines.push('', 'Reach,Diameter (mm),Length (m),Slope (%),Invert up (m),Invert down (m),Full-flow capacity (L/s),Flow ratio,Velocity at design flow (m/s),Velocity full (m/s),Depth ratio,Froude,Design flow (L/s)');
    d.reaches.forEach(r => lines.push([`MH ${r.from + 1} to MH ${r.to + 1}`, r.dmm || d.dmm, f2(r.L), (r.S * 100).toFixed(3), f2(r.inv_up), f2(r.inv_dn), f2(r.qFull), r.qRatio.toFixed(2), f2(r.v), f2(r.vFull), r.depthRatio.toFixed(2), r.froude.toFixed(2), f2(r.q != null ? r.q : d.q)].join(',')));
    if (d.down && d.down.res) {
      const dn = d.down, pc = r => (r == null ? '' : `${Math.round(r * 100)}%`);
      lines.push('', `Room downstream (${dn.yearLabel}),Pipe,Km down,Capacity (L/s),Without this sewer (L/s),With it (L/s),Full without,Full with`);
      for (const r of dn.list) lines.push([`"${r.role}"`, `${r.dmm} mm`, (r.dist / 1000).toFixed(2), f2(r.cap || null), f2(r.before), f2(r.after), pc(r.r0), pc(r.r1)].join(','));
    }
    lines.push('', `Design flow (L/s),${f2(d.q)}`, `Cover over the pipe (m),${d.cover}`, ...(d.slopes ? [`Slopes chosen (%),${f2(d.slopes[0] * 100)}–${f2(d.slopes[1] * 100)}`] : []), `Rules,"${d.source}"`, '"General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results."');
    return lines.join('\n');
  }

  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = { metres, chainage, bends, connBend, pointAt, checks, csv, crossings, CROSS, slopeRange, downstream };
    return;
  }
  // ---- Browser ---------------------------------------------------------------------------------
  const U = root.PeelUtil || {}, esc = U.esc || (s => String(s)), fmtNum = U.fmtNum || (n => String(n));
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), fmt2 = n => (+n).toFixed(2);
  const SW = () => root.PeelSewerDesign, FM = () => root.PeelForcemain, MS = () => root.PeelMeasure, EL = () => root.PeelElevation, T = () => root.PeelTools, L = root.L;
  const NOTE = () => (root.PeelPanel && root.PeelPanel.NOTE) || 'General screening results only. Peel\'s W&amp;WW Infrastructure Planning team must validate or confirm all results.';
  // The main line (pts, xs, ground) runs from the site to the connection; each branch ({ pts, xs,
  // ground, join: { to (the line it joins), x }, form }) runs from its own start to a point on the main line or an
  // earlier branch. drawing: 0 while the main line is drawn, k while branch k is.
  const S = { pts: [], legs: [], roads: false, roadsUsed: false, findMode: false, corridor: null, cw: null, conn: null, net: null, d: null, busy: false, msg: '', branches: [], drawing: 0, view: 0, form: { q: '', pop: '', jobs: '', ha: '', ici: false, avoid: false, spacing: 190, mode: 'gravity', vfd: false, ww: '', sLo: '0.3', sHi: '1.0', dmm: '', fmdmm: '' } };
  const cur = () => (S.drawing ? S.branches[S.drawing - 1].pts : S.pts);
  const curRun = () => (S.drawing ? S.branches[S.drawing - 1] : S);
  const narrow = () => !!(root.PeelDataTab && root.PeelDataTab.shellNarrow && root.PeelDataTab.shellNarrow());
  const done = () => S.branches.filter(b => b.done);
  const runs = () => [S, ...done()];
  let layer = null;
  const map = () => root.PeelMapCore && root.PeelMapCore.map;
  const token = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function lay() { if (!layer) layer = L.layerGroup().addTo(map()); return layer; }
  function drawLine() {
    const g = lay(); g.clearLayers(); if (!S.pts.length) return;
    const c = token('--pipe-sanitary'), ink = token('--text-primary'), ok = S.d && S.d.ok;
    const ll = S.pts.map(p => [p.lat, p.lng]);
    if (S.conn && !S.drawing) ll.push([S.conn.lat, S.conn.lng]);
    const fmOk = S.fm && S.fm.ok;
    L.polyline(ll, { color: c, weight: ok || fmOk ? 5 : 3, dashArray: ok ? null : fmOk ? '9 5' : '6 5', interactive: false }).addTo(g);
    S.branches.forEach(b => { if (b.pts.length) L.polyline(b.pts.map(p => [p.lat, p.lng]), { color: c, weight: ok ? 4 : 2.5, dashArray: ok ? null : '6 5', interactive: false }).addTo(g); });
    const dot = (p, label) => L.circleMarker([p.lat, p.lng], { radius: 4, color: ink, weight: 2, fill: true, fillColor: c, fillOpacity: 1, interactive: false }).addTo(g).bindTooltip(label, { permanent: !S.d && !S.fm, direction: 'top', className: 'pt', offset: [0, -4] });
    S.pts.forEach((p, i) => dot(p, i ? `${i + 1}` : 'start'));
    S.branches.forEach((b, k) => b.pts.forEach((p, i) => { if (!i || !b.done || i < b.pts.length - 1) dot(p, i ? `${i + 1}` : `branch ${k + 2}`); }));
    if (S.conn) L.circleMarker([S.conn.lat, S.conn.lng], { radius: 7, color: ink, weight: 2, fill: true, fillColor: c, fillOpacity: 1, interactive: false }).addTo(g).bindTooltip(`Connection: ${S.conn.dmm} mm sewer${S.conn.id ? ` ${esc(S.conn.id)}` : ''} (${S.conn.existingMH ? 'existing maintenance hole' : 'new maintenance hole'})`, { direction: 'top', className: 'pt' });
    if (S.fm) drawForcemain(g, c, ink);
    // The designed maintenance holes, numbered, with their reach labels.
    if (ok && S.net) {
      S.d.mhs.forEach((m, i) => {
        const p = m.ll, ins = m.ins.length > 1 ? `inverts in ${m.ins.map(x => fmt2(x.inv)).join(' / ')}` : m.ins.length ? `invert in ${fmt2(m.ins[0].inv)}` : '';
        L.circleMarker([p.lat, p.lng], { radius: 6, color: c, weight: 3, fill: true, fillColor: token('--surface-1'), fillOpacity: 1 }).addTo(g)
          .bindTooltip(`<strong>${esc(m.label)}</strong><br>ground ${fmt2(m.g)} m${ins ? ` · ${ins}` : ''}${m.inv_out != null ? ` · out ${fmt2(m.inv_out)}` : ''} · depth ${fmt2(m.depth)} m${m.drop ? ` · drop ${fmt2(m.drop)} m${m.structure ? ' (drop structure)' : ''}` : ''}`, { direction: 'top', className: 'pt' });
      });
      S.d.reaches.forEach(r => {
        const a = S.d.mhs[r.from].ll, b = S.d.mhs[r.to].ll;
        L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'sd-lbl', html: `<span>${r.dmm} mm @ ${(r.S * 100).toFixed(2)}%</span>`, iconSize: null }) }).addTo(g);
      });
      (S.xings || []).forEach((x, i) => L.marker([x.ll.lat, x.ll.lng], { keyboard: false, icon: L.divIcon({ className: `sd-x sd-x-${x.kind}${x.ok === false ? ' sd-x-bad' : ''}`, html: `<span>${i + 1}</span>`, iconSize: null }) }).addTo(g)
        .bindTooltip(`<strong>Crossing ${i + 1}: ${x.kind === 'water' ? 'watermain' : 'storm sewer'}${x.d ? ` ${x.d} mm` : ''}</strong><br>${x.kind === 'water' ? `${fmt2(x.clear)} m clearance (0.5 m needed; the watermain at an assumed ${CROSS.wmCover} m cover)` : 'depth not published: check the 0.5 m clearance on site'}`, { direction: 'top', className: 'pt' }));
    }
  }
  // The pumped option on the map: the station at the start, air valves at the high points, drains at
  // the low points, the discharge maintenance hole, the size along the line.
  function drawForcemain(g, c, ink) {
    const at = x => pointAt(S.pts, S.xs, x), f = S.fm;
    const tag = (ll, t, tip) => L.marker([ll.lat, ll.lng], { keyboard: false, icon: L.divIcon({ className: 'sd-fm', html: `<span>${t}</span>`, iconSize: null }) }).addTo(g).bindTooltip(tip, { direction: 'top', className: 'pt' });
    tag(S.pts[0], 'PS', `<strong>Pumping station</strong><br>${f.ok ? `${fmt1(f.q)} L/s at ${fmt1(f.tdh)} m total head` : 'no pumped design'} · size it to Peel's SPS Design Standard`);
    f.highs.forEach(h => tag(at(h.x), 'AV', `<strong>High point: air release</strong><br>${fmtNum(Math.round(h.x))} m · pipe invert ${fmt2(h.z)} m`));
    f.lows.forEach(h => tag(at(h.x), 'DV', `<strong>Low point: drain</strong><br>${fmtNum(Math.round(h.x))} m · pipe invert ${fmt2(h.z)} m`));
    if (S.conn) L.circleMarker([S.conn.lat, S.conn.lng], { radius: 6, color: c, weight: 3, fill: true, fillColor: token('--surface-1'), fillOpacity: 1 }).addTo(g).bindTooltip(`<strong>Discharge maintenance hole</strong><br>outlet invert ${fmt2(f.outletInv)} m, ${fmt2(f.outletInv - S.conn.invert)} m above the flow line`, { direction: 'top', className: 'pt' });
    if (f.ok) { const m = at(S.xs[S.xs.length - 1] / 2); L.marker([m.lat, m.lng], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'sd-lbl', html: `<span>${f.dmm} mm forcemain</span>`, iconSize: null }) }).addTo(g); }
  }
  // A tap: straight from the last point, or with Follow roads on, the shortest way along the road
  // centrelines (each straight run within 3 m of the centreline: js/road-net.js) to the road point
  // nearest the tap. Undo takes back the whole tap.
  async function addPoint(ll) {
    const run = curRun(); run.legs = run.legs || [];
    const last = run.pts[run.pts.length - 1], RN = root.PeelRoadNet;
    if (!S.roads || !last || !RN) { run.pts.push(ll); run.legs.push(1); S.msg = ''; drawLine(); banner(); return; }
    S.busy = 'roads'; banner();
    try {
      const r = await RN.routeBetween(last, ll);
      if (!r || r.off[1] > 60) { run.pts.push(ll); run.legs.push(1); S.msg = 'No road near enough to follow: drawn straight'; return; }
      // (from the last point onto the road if it was off it, then along the road)
      const add = r.pts.filter((p, i) => i || metres(p, last) > 1);
      run.pts.push(...add); run.legs.push(add.length); S.roadsUsed = true; S.msg = '';
    } catch (e) { run.pts.push(ll); run.legs.push(1); S.msg = 'The road network did not answer: drawn straight'; }
    finally { S.busy = false; drawLine(); banner(); }
  }
  // Find a route (js/corridor-finder.js): from the start to the tapped end, along the roads, around the
  // constraint layers where it can and not climbing where it can help it; then Finish snaps the end
  // to the sewer as usual. Find again re-runs it with other weights.
  async function findRoute(a, b) {
    const C = root.PeelCorridorFinder; if (!C || S.busy) return;
    S.findMode = false; S.busy = 'find'; S.msg = ''; banner();
    let res = null;
    try { res = await C.find(a, b, S.cw || C.WEIGHTS); } catch (e) { res = null; }
    S.busy = false;
    if (!res) { S.msg = 'No way along the roads between these points (or the road network did not answer): draw the route instead'; banner(); drawLine(); return; }
    const pts = res.pts.filter((p, i) => i || metres(p, a) > 1);
    S.pts = [a, ...pts]; S.legs = [1, pts.length]; S.roadsUsed = true; S.corridor = { a, b, res };
    S.conn = null; reset(); S.branches = [];
    drawLine(); banner();
    await finish();
  }
  const bannerHTML = () => {
    if (S.busy) return `<strong>Sewer designer</strong> <span class="muted">${S.busy === 'roads' ? 'Following the roads…' : S.busy === 'find' ? 'Finding a route: the roads, the constraint layers and the ground…' : 'Reading the sewer and the ground…'}</span>`;
    if (S.findMode) return '<strong>Sewer designer</strong> <span class="muted">Find a route: tap the end, next to the existing sewer</span> <span class="tb-acts"><button type="button" class="btn small link" data-ptool-act="sd-find">Cancel</button></span>';
    const P = cur(), br = S.drawing, len = P.length >= 2 ? fmtNum(Math.round(chainage(P).pop())) : 0;
    const text = S.msg ? esc(S.msg) : br ? (P.length < 2 ? `Branch ${br + 1}: tap from its start to the sewer you drew; the last tap joins it` : `Branch ${br + 1} · ${P.length} points · ${len} m · Finish joins it to the sewer you drew`)
      : P.length < 2 ? 'Tap from the site to an existing sanitary sewer; the last tap snaps to it' : `${P.length} points · ${len} m · Finish snaps the end to the sewer`;
    return `<strong>Sewer designer</strong> <span class="muted">${text}</span> <span class="tb-acts"><button type="button" class="btn small${S.roads ? ' on' : ''}" data-ptool-act="sd-roads" aria-pressed="${S.roads}" title="Each tap follows the road centrelines (Ontario Road Network) from the last point">Follow roads${S.roads ? ': on' : ''}</button>${!br && P.length === 1 && root.PeelCorridorFinder ? '<button type="button" class="btn small" data-ptool-act="sd-find" title="The way along the roads that keeps out of the constraint layers where it can and keeps the sewer from climbing">Find a route</button>' : ''}${P.length ? '<button type="button" class="btn small" data-ptool-act="sd-undo">Undo</button>' : ''}${P.length >= 2 ? '<button type="button" class="btn small primary" data-ptool-act="sd-finish">Finish</button>' : ''}${br ? '<button type="button" class="btn small link" data-ptool-act="sd-cancel">Cancel the branch</button>' : P.length ? '<button type="button" class="btn small link" data-ptool-act="sd-clear">Clear</button>' : ''}</span>`;
  };
  const banner = () => { if (T().active() === 'sewer') T().banner(bannerHTML()); if (onPage()) renderPage(); };

  // Finish: snap the end to the nearest gravity sewer with published inverts (within 40 m), sample
  // the ground, then open the result with the flow form.
  async function finish() {
    if (S.pts.length < 2 || S.busy) return;
    S.busy = true; S.msg = ''; banner();
    try {
      const end = S.pts[S.pts.length - 1];
      const mains = (await MS().mainsNear(end.lat, end.lng, 40)).filter(m => !m.fm && m.up > 0 && m.dn > 0 && m.d > 0);
      let best = null; for (const m of mains) { const n = MS().nearOn([end.lng, end.lat], m.g); if (n.m <= 40 && (!best || n.m < best.n.m)) best = { m, n }; }
      if (!best) { S.msg = 'No sanitary sewer with published inverts within 40 m of the last point: end the line on a sewer'; return; }
      const { m, n } = best, g = m.g, glen = chainage(g.map(([lng, lat]) => ({ lat, lng }))).pop() || 1, along = n.t * glen;
      const atUp = along <= 15, atDn = glen - along <= 15, t = atUp ? 0 : atDn ? 1 : n.t;
      const gp = g.map(([lng, lat]) => ({ lat, lng })), at = atUp ? gp[0] : atDn ? gp[gp.length - 1] : pointAt(gp, chainage(gp), t * glen);
      S.conn = { lat: at.lat, lng: at.lng, invert: m.up + (m.dn - m.up) * t, dmm: m.d, id: m.id, existingMH: atUp || atDn, g: m.g, t };
      // The drawn end moves onto the sewer.
      S.pts[S.pts.length - 1] = { lat: S.conn.lat, lng: S.conn.lng };
      await sampleRun(S);
      S.d = null; S.fm = null;
      openResult();
    } catch (e) { S.msg = `Couldn't read the sewer or the ground (${e && e.message ? e.message : 'no data'})`; }
    finally { S.busy = false; banner(); drawLine(); }
  }
  // A branch: its last tap joins the nearest line already drawn (within 30 m), at a vertex within
  // 10 m, else at a new vertex there (a junction maintenance hole).
  async function finishBranch() {
    const b = S.branches[S.drawing - 1]; if (!b || b.pts.length < 2 || S.busy) return;
    S.busy = true; S.msg = ''; banner();
    try {
      const end = b.pts[b.pts.length - 1], rs = runs();
      let best = null;
      rs.forEach((run, ri) => { const n = MS().nearOn([end.lng, end.lat], run.pts.map(p => [p.lng, p.lat])); if (n.m <= 30 && (!best || n.m < best.m)) best = { ri, m: n.m, t: n.t }; });
      if (!best) { S.msg = 'End the branch on the sewer you drew (within 30 m of it)'; return; }
      const run = rs[best.ri]; let x = best.t * run.xs[run.xs.length - 1];
      const vi = run.xs.findIndex(v => Math.abs(v - x) <= 10);
      if (vi >= 0) x = run.xs[vi]; else insertVertex(run, x);
      const at = pointAt(run.pts, run.xs, x);
      b.pts[b.pts.length - 1] = { lat: at.lat, lng: at.lng };
      b.join = { to: run, x };
      await sampleRun(b);
      b.done = true; S.drawing = 0; S.d = null; S.fm = null;
      openResult();
      if (!onPage() && narrow() && root.PeelApp && root.PeelApp.setAnalysisSnap) root.PeelApp.setAnalysisSnap('half', false);
    } catch (e) { S.msg = `Couldn't read the ground along the branch (${e && e.message ? e.message : 'no data'})`; }
    finally { S.busy = false; banner(); drawLine(); }
  }
  // A vertex on a line at chainage x (the chainage of everything else on it stays the same).
  function insertVertex(run, x) {
    const i = run.xs.findIndex((v, k) => k && v > x); if (i < 1) return;
    const p = pointAt(run.pts, run.xs, x);
    run.pts.splice(i, 0, p); run.xs = chainage(run.pts);
    if (run.ground && !run.ground.some(s => Math.abs(s.x - x) < 0.5)) { run.ground.push({ x, g: gAtRun(run, x), ll: p }); run.ground.sort((a, b2) => a.x - b2.x); }
  }
  // The ground every 10 m along a line and at each vertex (lidar, else the terrain tiles).
  async function sampleRun(run) {
    const xs = chainage(run.pts), Lt = xs[xs.length - 1], N = Math.max(2, Math.ceil(Lt / 10)), at = [];
    for (let k = 0; k <= N; k++) at.push(Lt * k / N);
    for (const x of xs) if (!at.some(a => Math.abs(a - x) < 0.5)) at.push(x);
    at.sort((a, b) => a - b);
    const lls = at.map(x => pointAt(run.pts, xs, x)), gs = await EL().getGroundMany(lls);
    if (gs.some(r => !r || r.z == null)) throw new Error('no ground elevation along part of the line');
    run.ground = at.map((x, i) => ({ x, g: gs[i].z, ll: lls[i] }));
    if (run === S) S.groundLabel = gs[0].label || '';
    run.xs = xs;
  }
  const gAtRun = (run, x) => { const G = run.ground; for (let i = 1; i < G.length; i++) if (x <= G[i].x + 1e-9) { const t = (x - G[i - 1].x) / ((G[i].x - G[i - 1].x) || 1); return G[i - 1].g + (G[i].g - G[i - 1].g) * t; } return G[G.length - 1].g; };
  const flowOf = f => ({ q: +f.q > 0 ? +f.q : 0, pop: +f.pop || 0, jobs: +f.jobs || 0, ha: +f.ha || 0 });
  // The design flow from a set of lines: what was typed as flows, added, plus Peel's criteria on the
  // population, jobs and area of the rest together (peaking on the whole).
  function flowSum(list) {
    const typed = list.filter(f => f.q > 0), rest = list.filter(f => !(f.q > 0)), pop = rest.reduce((t, f) => t + f.pop, 0), jobs = rest.reduce((t, f) => t + f.jobs, 0), ha = rest.reduce((t, f) => t + f.ha, 0);
    const pf = pop + jobs + ha > 0 ? SW().flowFrom({ pop, jobs, ha }) : { q: 0 };
    return { ...pf, q: typed.reduce((t, f) => t + f.q, 0) + pf.q, typed: !rest.length, peak: pf.peak, ii: pf.ii };
  }
  // The network: maintenance holes along each line (at its vertices and at most the spacing apart),
  // each branch's last one shared with the line it joins; a reach between consecutive ones; the flow
  // in each reach from every line upstream of it.
  function buildNet(spacing) {
    const rs = runs(), nodes = [], meta = [], reaches = [], rmeta = [], at = rs.map(() => []), start = [];
    rs.forEach((run, ri) => {
      const bnd = bends(run.pts), mhX = SW().placeMHs(run.xs, spacing); run.mhX = mhX;
      mhX.forEach((x, k) => {
        if (ri && k === mhX.length - 1) return;
        const vi = run.xs.findIndex(v => Math.abs(v - x) < 0.01);
        nodes.push({ g: gAtRun(run, x), bend: vi >= 0 ? bnd[vi] : 0 }); meta.push({ run: ri, x, ll: pointAt(run.pts, run.xs, x), start: !k });
        at[ri].push({ x, n: nodes.length - 1 });
      });
      start[ri] = at[ri][0].n;
    });
    const nodeOn = (ri, x) => at[ri].reduce((b, e) => (Math.abs(e.x - x) < Math.abs(b.x - x) ? e : b), at[ri][0]).n;
    rs.forEach((run, ri) => {
      const mhX = run.mhX;
      for (let k = 0; k < mhX.length - 1; k++) {
        const from = nodeOn(ri, mhX[k]), to = ri && k + 1 === mhX.length - 1 ? nodeOn(rs.indexOf(run.join.to), run.join.x) : nodeOn(ri, mhX[k + 1]);
        reaches.push({ from, to, L: mhX[k + 1] - mhX[k], pts: run.ground.filter(s => s.x > mhX[k] + 0.01 && s.x < mhX[k + 1] - 0.01).map(s => ({ d: s.x - mhX[k], g: s.g })) });
        rmeta.push({ run: ri });
      }
    });
    // The deflection into each maintenance hole, pipe in to pipe out.
    const outOf = nodes.map(() => -1); reaches.forEach((r, i) => { outOf[r.from] = i; });
    const brg = (a, b) => Math.atan2((b.lng - a.lng) * Math.cos(a.lat * Math.PI / 180), b.lat - a.lat) * 180 / Math.PI;
    reaches.forEach(r => { const o = outOf[r.to]; if (o < 0) return; let dd = Math.abs(brg(meta[r.from].ll, meta[r.to].ll) - brg(meta[r.to].ll, meta[reaches[o].to].ll)) % 360; if (dd > 180) dd = 360 - dd; r.bend = Math.round(dd); });
    // Into the connection: the bend to the existing pipe's direction (the velocity head rule's least
    // drop from 375 mm), where that direction is known.
    const rootN = nodeOn(0, S.mhX[S.mhX.length - 1]);
    reaches.forEach(r => { if (r.to !== rootN || !S.conn) return; const b = connBend(meta[r.from].ll, meta[rootN].ll, S.conn.g, S.conn.t); if (b != null) r.bend = b; });
    // Flows: the lines upstream of a reach are its own and every branch joining at or above it.
    const flows = rs.map(run => flowOf(run === S ? S.form : run.form));
    const ups = (ri, x0) => [ri, ...rs.flatMap((b, j) => (j && b.join.to === rs[ri] && b.join.x <= x0 + 0.01 ? ups(j, Infinity) : []))];
    reaches.forEach((r, i) => { const ri = rmeta[i].run, x0 = meta[r.from].x, list = ups(ri, x0).map(j => flows[j]); r.q = flowSum(list).q; });
    return { net: { nodes, reaches }, meta, rmeta, start, outOf, flows, root: rootN };
  }
  // A line's path to the connection as a single line (its own reaches, then on down the lines it
  // joins): the profile's view, laid out like a single-line design.
  function lineView(ri) {
    const nb = S.net, d = S.d, path = [];
    let n = nb.start[ri];
    while (n != null) { path.push(n); const o = nb.outOf[n]; n = o >= 0 ? nb.net.reaches[o].to : null; }
    const cum = [0], rIdx = [];
    for (let k = 0; k < path.length - 1; k++) { const o = nb.outOf[path[k]]; rIdx.push(o); cum.push(cum[k] + nb.net.reaches[o].L); }
    const nodes = path.map((m, k) => ({ x: cum[k], g: nb.net.nodes[m].g, ll: d.mhs[m].ll, n: m }));
    const ground = [{ x: 0, g: nodes[0].g }];
    rIdx.forEach((o, k) => { nb.net.reaches[o].pts.forEach(p => ground.push({ x: cum[k] + p.d, g: p.g })); ground.push({ x: cum[k + 1], g: nodes[k + 1].g }); });
    const reaches = rIdx.map((o, k) => ({ ...d.reaches[o], from: k, to: k + 1 }));
    const mhs = path.map((m, k) => { const M = d.mhs[m], inE = k ? M.ins.find(x => x.reach === rIdx[k - 1]) : null; return { x: cum[k], g: M.g, inv_in: inE ? inE.inv : null, inv_out: M.inv_out, drop: inE ? inE.drop : 0, structure: !!(inE && inE.structure), depth: M.depth, num: m + 1, label: M.label }; });
    const xings = (S.d === d && S.xings || []).flatMap(x => { const k = rIdx.indexOf(x.reach); return k < 0 ? [] : [{ ...x, x: cum[k] + x.along }]; });
    return { nodes, ground, reaches, mhs, xings, cover: d.cover, dmm: Math.max(...reaches.map(r => r.dmm)), q: reaches[reaches.length - 1].q, label: ri ? `Branch ${ri + 1}` : 'Main line', structures: mhs.filter(m => m.structure).length, ok: true };
  }
  function run() {
    const f = S.form;
    S.formMsg = '';
    if (f.mode === 'pumped') {
      S.d = null; S.net = null;
      if (done().length) { S.fm = null; S.formMsg = 'The pumped option takes the main line alone: remove the branches to use it.'; return openResult(); }
      const flow = SW().flowFrom({ q: f.q, pop: +f.pop || 0, jobs: +f.jobs || 0, ha: +f.ha || 0 });
      if (!(flow.q > 0)) { S.fm = null; S.formMsg = 'Type a design flow, or the population, jobs and area it serves.'; return openResult(); }
      S.flow = flow;
      S.fm = FM().design(S.ground.map(({ x, g }) => ({ x, g })), S.conn, flow.q, { vfd: f.vfd, ici: f.ici, wwDepth: +f.ww || 0, dmm: +f.fmdmm || null });
      if (S.fm.ok) findDownstream(S.fm, flow.q);
      openResult(); drawLine(); return;
    }
    S.fm = null;
    const rs = runs(), flows = rs.map(r => flowOf(r === S ? S.form : r.form));
    const missing = flows.findIndex(x => !(x.q > 0 || x.pop + x.jobs + x.ha > 0));
    if (missing >= 0) { S.d = null; S.formMsg = missing ? `Type a flow, or the population, jobs and area, for branch ${missing + 1}.` : 'Type a design flow, or the population, jobs and area it serves.'; return openResult(); }
    S.flow = flowSum(flows);
    const spacing = Math.min(200, Math.max(20, +f.spacing || 190));
    const sl = slopeRange(f);
    if (sl && sl.msg) { S.d = null; S.formMsg = sl.msg; return openResult(); }
    S.net = buildNet(spacing);
    S.d = SW().designNet(S.net.net, S.conn, { ici: f.ici, avoidStructures: f.avoid, dmm: +f.dmm || null, slopes: sl });
    if (S.d.ok) {
      const nb = S.net, d = S.d, rootN = d.root;
      d.mhs.forEach((m, i) => {
        const me = nb.meta[i]; m.x = me.x; m.run = me.run; m.ll = me.ll;
        const role = i === rootN ? 'connection' : me.start ? (me.run ? `branch ${me.run + 1} start` : 'start') : m.ins.length > 1 ? 'junction' : '';
        m.label = `MH ${i + 1}${role ? ` (${role})` : ''}`;
      });
      d.reaches.forEach((r, i) => { r.run = nb.rmeta[i].run; });
      d.q = d.mhs[rootN].ins.reduce((t, x) => t + d.reaches[x.reach].q, 0);
      S.view = Math.min(S.view, rs.length - 1);
      findCrossings();
      findDownstream(d, d.q);
    }
    openResult(); drawLine();
  }
  // The watermains and storm sewers the designed reaches cross (the Region's watermains; the
  // Mississauga, Brampton and Region storm sewers, as the Existing network layer reads them).
  let xSeq = 0;
  async function findCrossings() {
    const seq = ++xSeq, d = S.d, NR = S.net.net.reaches, EP = root.PeelExistPipes, A = root.PeelArcGIS;
    S.xings = null; S.xingsErr = ''; S.xingsBusy = true;
    if (!EP || !A) { S.xingsBusy = false; S.xingsErr = 'the existing network is not loaded'; return; }
    const lls = d.mhs.map(m => m.ll), lat0 = lls.reduce((t, p) => t + p.lat, 0) / lls.length, lng0 = lls.reduce((t, p) => t + p.lng, 0) / lls.length;
    const k = 6371008.8 * Math.PI / 180, kx = k * Math.cos(lat0 * Math.PI / 180), P = (lng, lat) => [(lng - lng0) * kx, (lat - lat0) * k];
    const pad = 30 / k, bbox = { xmin: Math.min(...lls.map(p => p.lng)) - pad * 1.5, ymin: Math.min(...lls.map(p => p.lat)) - pad, xmax: Math.max(...lls.map(p => p.lng)) + pad * 1.5, ymax: Math.max(...lls.map(p => p.lat)) + pad };
    const pipes = []; let failed = 0, tried = 0;
    for (const kind of ['water', 'storm']) for (const src of EP.EXIST[kind]) {
      tried++;
      try {
        const info = await A.layerInfo(src.url), { features } = await A.queryAll(src.url, info, { bbox, max: 4000, outFields: src.f });
        for (const f of features || []) {
          const g = f.geometry; if (!g) continue;
          const lines = g.type === 'MultiLineString' ? g.coordinates : g.type === 'LineString' ? [g.coordinates] : [];
          const at = EP.pipeAttrs(kind, src.src, f.properties || {});
          pipes.push({ kind, d: at.d, src: src.src, paths: lines.map(l => l.map(([x, y]) => P(x, y))) });
        }
      } catch (e) { failed++; }
    }
    if (seq !== xSeq || S.d !== d) return;
    S.xingsBusy = false;
    if (failed === tried) { S.xingsErr = 'the watermain and storm sewer services did not answer'; }
    else {
      const R = d.reaches.map((r, i) => ({ a: P(d.mhs[r.from].ll.lng, d.mhs[r.from].ll.lat), b: P(d.mhs[r.to].ll.lng, d.mhs[r.to].ll.lat), inv_up: r.inv_up, S: r.S, L: r.L, dmm: r.dmm, gUp: d.mhs[r.from].g, gDn: d.mhs[r.to].g, pts: NR[i].pts }));
      S.xings = crossings(R, pipes); S.xingsPart = failed > 0;
      S.xings.forEach(x => { const r = d.reaches[x.reach], a = d.mhs[r.from].ll, b = d.mhs[r.to].ll, t = x.along / r.L; x.ll = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t }; });
    }
    const box = document.querySelector('[data-sd-xings]'); if (box) box.innerHTML = xingsHTML();
    drawLine();
    const pr = document.querySelector('[data-sd-profile]'); if (pr) pr.innerHTML = profileSVG(lineView(S.view));
  }
  // ---- Room downstream (downstream()): the Region sewer data (data/sewers.json, 300 mm and more)
  // and its loads at the map's demand year, as the Sewer pipe capacity layer reads them.
  let dSeq = 0;
  const SC = () => root.PeelSewerCap, MA = () => root.PeelMapAnalysis;
  async function findDownstream(d, q) {
    const seq = ++dSeq, c = S.conn;
    S.down = { busy: true }; d.down = null;
    try { await Promise.resolve(SC() && SC().loadSewers()); } catch (e) { /* (below) */ }
    if (seq !== dSeq || (S.d !== d && S.fm !== d)) return;
    const data = root.PeelMapMarkers && root.PeelMapMarkers.SEW && root.PeelMapMarkers.SEW.data;
    if (!data || !SC()) S.down = { err: 'the Region sewer capacity data did not load' };
    else {
      // The pipe it joins: the same pipe (300 mm and more), or from a smaller local sewer the
      // nearest Region trunk of 300 mm or more, as each development joins one (Sewer pipe capacity).
      const big = c.dmm >= 300, k = SC().nearestPipe(c.lng, c.lat, big ? 30 : 400, 300);
      if (k < 0) S.down = { err: big ? 'the sewer it joins is not in the Region capacity data' : 'no Region sewer of 300 mm or more within 400 m of the connection' };
      else {
        const yr = MA() && MA().getCapYear ? MA().getCapYear() : null;
        const res = downstream(data.pipes, k, q, i => { const st = SC().pipeStats(i, yr, true); return { q: st.then.q, cap: st.cap }; });
        const role = new Map(), add = (r, t) => { if (r && !role.has(r.i)) role.set(r.i, t); };
        add(res.recv, big ? 'The sewer it joins' : 'The first Region trunk (300 mm+)');
        res.over.forEach(r => add(r, 'Goes over 100%')); res.near.forEach(r => add(r, 'Goes over 85%')); add(res.tight, 'The tightest down to the plant');
        const list = res.rows.filter(r => role.has(r.i)).slice(0, 10).map(r => ({ ...r, role: role.get(r.i) }));
        const k0 = data.pipes[k], m = big ? 0 : Math.round(root.PeelDcInfra && root.PeelDcInfra.dcDist ? root.PeelDcInfra.dcDist([c.lng, c.lat], SC().pipeCoords(k0)) : 0);
        S.down = { res, list, yearLabel: yr == null ? 'build-out' : String(yr), plant: data.plants[k0[6]] || '', big, m };
      }
    }
    d.down = S.down.res ? S.down : null;
    const box = document.querySelector('[data-sd-down]'); if (box) box.innerHTML = downHTML();
  }
  function downHTML() {
    const D = S.down;
    if (!D || D.busy) return '<p class="small muted">Adding the flow to the Region sewers downstream…</p>';
    if (D.err) return `<p class="small muted">Room downstream not checked: ${esc(D.err)}.</p>`;
    const r = D.res, pc = x => (x == null ? '–' : `${Math.round(x * 100)}%`), km = m => `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
    const plant = D.plant === 'Toronto' ? 'the City of Toronto system' : D.plant ? `the ${esc(D.plant)} plant` : 'the end of the data';
    const chip = r.over.length ? `<span class="pnl-chip t-over">${r.over.length} pipe${r.over.length === 1 ? '' : 's'} go${r.over.length === 1 ? 'es' : ''} over 100%</span>` : r.near.length ? `<span class="pnl-chip t-tight">${r.near.length} pipe${r.near.length === 1 ? '' : 's'} go${r.near.length === 1 ? 'es' : ''} over 85%</span>` : '<span class="pnl-chip t-room">Room downstream</span>';
    const rc = r.recv, t = r.tight;
    const recv = rc.cap ? `The ${fmtNum(rc.dmm)} mm sewer it ${D.big ? 'joins' : `reaches (the nearest of 300 mm or more, ${fmtNum(D.m)} m from the connection)`} goes from <strong>${pc(rc.r0)} to ${pc(rc.r1)}</strong> full (${fmt1(rc.before)} → ${fmt1(rc.after)} L/s of ${fmtNum(Math.round(rc.cap))} L/s).` : `The ${fmtNum(rc.dmm)} mm sewer it ${D.big ? 'joins' : 'reaches'} has no reliable published slope: its capacity is not known.`;
    const tt = t && t !== rc ? ` Down to ${plant} (${fmtNum(r.rows.length)} pipes, ${km(r.length)}), the tightest is a ${fmtNum(t.dmm)} mm pipe ${km(t.dist)} down: ${pc(t.r0)} → <strong>${pc(t.r1)}</strong>.` : ` Down to ${plant} (${fmtNum(r.rows.length)} pipes, ${km(r.length)}), no pipe is tighter.`;
    const already = r.already.length ? ` ${fmtNum(r.already.length)} pipe${r.already.length === 1 ? ' is' : 's are'} already over 100% without this sewer.` : '';
    const st = x => { const s2 = root.PeelMapMarkers && root.PeelMapMarkers.pipeState ? root.PeelMapMarkers.pipeState(x) : null; return s2 ? `<span class="pipe-st-dot" style="--st:var(${s2[1]})"></span>${esc(s2[3])}` : 'n/a'; };
    const rows = D.list.map(x => `<tr><th scope="row">${esc(x.role)}</th><td class="n">${fmtNum(x.dmm)} mm${x.year ? ` <small>${x.year}</small>` : ''}</td><td class="n">${(x.dist / 1000).toFixed(2)}</td><td class="n">${x.cap ? fmtNum(Math.round(x.cap)) : '–'}</td><td class="n">${pc(x.r0)}</td><td class="n">${pc(x.r1)}</td><td>${st(x.r1)}</td></tr>`).join('');
    return `<p>${chip} ${recv}${tt}${already}</p>
      <div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">Pipe</th><th scope="col" class="n">Size</th><th scope="col" class="n">Km down</th><th scope="col" class="n">Capacity (L/s)</th><th scope="col" class="n">Full without</th><th scope="col" class="n">Full with</th><th scope="col">With it</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">At ${D.yearLabel === 'build-out' ? 'build-out' : esc(D.yearLabel)} (the Demand year on the map), each Region pipe of 300 mm or more loaded as the Sewer pipe capacity layer loads it, with every load counted whatever the Wastewater loads switches in Layers show: the census population at the plant's measured rate, and the growth built since 2021, approved and proposed at Peel design criteria (approved and proposed as phased in Horizon years). This sewer's ${fmt1(r.q)} L/s design flow is added in full to every pipe down to the plant (not re-peaked with the rest, no attenuation). If the sewer serves a development already in the pipeline, its flow is in the load already and is counted twice here. Full-pipe capacity by Manning (n 0.013) on the published slope${r.unchecked ? `; ${fmtNum(r.unchecked)} pipe${r.unchecked === 1 ? ' has' : 's have'} no reliable slope and ${r.unchecked === 1 ? 'is' : 'are'} not checked` : ''}. A screen, not a hydraulic model.</p>`;
  }
  function xingsHTML() {
    if (S.xingsBusy) return '<p class="small muted">Looking for the watermains and storm sewers the sewer crosses…</p>';
    if (S.xingsErr) return `<p class="small muted">Crossings unavailable: ${esc(S.xingsErr)}.</p>`;
    const X = S.xings || [], d = S.d;
    const note = `<p class="small muted">Linear Wastewater Standards s. 3.4.2.1: 0.5 m vertical clearance, outside to outside (inside diameters here: walls not counted). Watermain depth is not published: taken at Peel's minimum cover, its top ${CROSS.wmCover} m below the ground. Storm sewer depths are not published: check those crossings on site. The sewer is not moved for a crossing.${S.xingsPart ? ' Some of the sources did not answer: crossings with them are not shown.' : ''}</p>`;
    if (!X.length) return `<p class="small">No watermain or storm sewer is crossed.</p>${note}`;
    const w = X.filter(x => x.kind === 'water'), st = X.filter(x => x.kind === 'storm'), bad = w.filter(x => !x.ok);
    const head = `<p>${bad.length ? `<span class="pnl-chip t-over">${bad.length} watermain crossing${bad.length === 1 ? '' : 's'} under 0.5 m</span>` : w.length ? '<span class="pnl-chip t-room">Watermain crossings clear</span>' : ''} ${fmtNum(w.length)} watermain${w.length === 1 ? '' : 's'} and ${fmtNum(st.length)} storm sewer${st.length === 1 ? '' : 's'} crossed.</p>`;
    const rows = X.map((x, i) => { const r = d.reaches[x.reach]; return `<tr${x.ok === false ? ' class="t-over"' : ''}><th scope="row">${i + 1}</th><td>MH ${r.from + 1} → ${r.to + 1}, ${fmtNum(Math.round(x.along))} m</td><td>${x.kind === 'water' ? 'Watermain' : 'Storm sewer'}${x.d ? ` ${fmtNum(x.d)} mm` : ''} <small>${esc(x.src)}</small></td><td class="n">${fmt2(x.obvert)} / ${fmt2(x.invert)}</td><td class="n">${x.kind === 'water' ? `${fmt2(x.otherTop)} / ${fmt2(x.otherBottom)} <small>assumed</small>` : '–'}</td><td class="n">${x.kind === 'water' ? `${fmt2(x.clear)} m ${x.ok ? '✓' : '✗'}` : 'check on site'}</td></tr>`; }).join('');
    return `${head}<div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">#</th><th scope="col">Where</th><th scope="col">Crosses</th><th scope="col" class="n">New sewer obvert / invert</th><th scope="col" class="n">Other pipe top / bottom</th><th scope="col" class="n">Clearance (0.5 m)</th></tr></thead><tbody>${rows}</tbody></table></div>${note}`;
  }

  // ---- The result: the form, the verdict, the profile, the tables, the checks ----------------------
  function openResult() {
    S.res = true;
    // (on its Labs page the design shows on the page, under the map, not in the right panel)
    if (onPage()) { renderPage(); return; }
    T().openResult({ ref: 'tool:sewer-design', title: 'Sewer design', html: resultHTML(), reopen: () => openResult() });
  }
  // The pipe size: the tool's pick (the default), or one chosen for every reach (a gravity sewer no
  // larger than the existing one it flows into).
  function sizeField(k, sizes, auto) {
    // (a size the new route can't take, larger than its sewer, goes back to the tool's pick)
    if (S.form[k] && !sizes.includes(+S.form[k])) S.form[k] = '';
    const cur = String(S.form[k] || '');
    return `<label class="field sd-size"><span class="label">${k === 'fmdmm' ? 'Forcemain size' : 'Pipe size'}</span><select data-sd="${k}"><option value=""${cur ? '' : ' selected'}>${esc(auto)}</option>${sizes.map(d => `<option value="${d}"${cur === String(d) ? ' selected' : ''}>${d} mm</option>`).join('')}</select></label>`;
  }
  function formHTML() {
    const f = S.form, v = k => esc(f[k] == null ? '' : f[k]);
    const flowRow = (attr, F) => `<div class="sd-row"><label class="field"><span class="label">Flow (L/s)</span><input type="number" min="0" step="0.1" ${attr('q')} value="${esc(F.q || '')}"></label><span class="muted small">or</span>
      <label class="field"><span class="label">Population</span><input type="number" min="0" step="1" ${attr('pop')} value="${esc(F.pop || '')}"></label><label class="field"><span class="label">Jobs</span><input type="number" min="0" step="1" ${attr('jobs')} value="${esc(F.jobs || '')}"></label><label class="field"><span class="label">Area (ha)</span><input type="number" min="0" step="0.1" ${attr('ha')} value="${esc(F.ha || '')}"></label></div>`;
    const bs = done(), gravity = f.mode !== 'pumped';
    const branches = gravity ? `<div class="sd-branches">${bs.map((b, k) => `<div class="sd-branch"><p class="small"><strong>Branch ${k + 2}</strong> <span class="muted">— ${fmtNum(Math.round(b.xs[b.xs.length - 1]))} m, joining ${b.join.to === S ? 'the main line' : `branch ${runs().indexOf(b.join.to) + 1}`} at ${fmtNum(Math.round(b.join.x))} m; what it serves:</span> <button type="button" class="btn small link" data-sd-act="rm-branch" data-sd-branch="${S.branches.indexOf(b)}">Remove</button></p>${flowRow(k2 => `data-sb="${S.branches.indexOf(b)}" data-sb-k="${k2}"`, b.form)}</div>`).join('')}
      <p><button type="button" class="btn small" data-sd-act="branch">Add a branch</button> <span class="muted small">Draw a sewer that joins this one: its flow adds from where it joins.</span></p></div>` : '';
    return `<form class="sd-form" data-sd-form onsubmit="return false">
      <p class="small"><strong>Design flow${bs.length && gravity ? ' — the main line' : ''}</strong> <span class="muted">— type the peak wet weather flow, or what the sewer serves (Peel criteria: 290 L/cap/d, 270 L/job/d, Harmon 2–4, I&amp;I 0.26 L/s/ha)</span></p>
      ${flowRow(k => `data-sd="${k}"`, f)}
      ${branches}
      <fieldset class="sd-mode"><legend class="label">Design</legend><label class="chk"><input type="radio" name="sd-mode" data-sd="mode" value="gravity"${f.mode !== 'pumped' ? ' checked' : ''}> Gravity sewer</label><label class="chk"><input type="radio" name="sd-mode" data-sd="mode" value="pumped"${f.mode === 'pumped' ? ' checked' : ''}> Pumped: a station at the start, a forcemain to the sewer</label></fieldset>
      ${f.mode === 'pumped' ? `<div class="sd-row">${sizeField('fmdmm', FM().SIZES.filter(d => d >= FM().RULES.dMin), 'Largest in the velocity range')}<label class="field"><span class="label">Wet well low level (m below ground)</span><input type="number" min="0" step="0.1" data-sd="ww" value="${v('ww')}" placeholder="the incoming sewer"></label>
      <label class="chk"><input type="checkbox" data-sd="vfd"${f.vfd ? ' checked' : ''}> Variable speed pumps (0.8 m/s, with 1.0 m/s flushing weekly)</label><label class="chk"><input type="checkbox" data-sd="ici"${f.ici ? ' checked' : ''}> Industrial / commercial (3.5 m of cover, else 2.5 m)</label></div>` : `<div class="sd-row">${sizeField('dmm', SW().SIZES.filter(d => d >= SW().RULES.dMin && (!S.conn || d <= S.conn.dmm)), 'Smallest that works')}<label class="field"><span class="label">Maintenance holes at most (m apart)</span><input type="number" min="20" max="200" step="5" data-sd="spacing" value="${v('spacing')}"></label>
      <label class="field"><span class="label">Slopes from (%)</span><input type="number" min="0.05" max="10" step="0.05" data-sd="sLo" value="${v('sLo')}" placeholder="the standard's"></label><label class="field"><span class="label">to (%)</span><input type="number" min="0.05" max="10" step="0.05" data-sd="sHi" value="${v('sHi')}" placeholder="the standard's"></label>
      <label class="chk"><input type="checkbox" data-sd="ici"${f.ici ? ' checked' : ''}> Industrial / commercial (3.5 m of cover, else 2.5 m)</label>
      <label class="chk"><input type="checkbox" data-sd="avoid"${f.avoid ? ' checked' : ''}> Avoid drop structures</label></div>
      <p class="small muted">Every reach between these slopes (both blank: the standard's own limits, 0.75 m/s at the design flow to 3.0 m/s full). Where 0.75 m/s needs a steeper slope than the range, the reach is held at the steepest and the velocity check says so.</p>`}
      <p><button type="button" class="btn small primary" data-sd-act="design">Design</button> <button type="button" class="btn small" data-sd-act="edit">Edit the route</button> <button type="button" class="btn small link" data-sd-act="clear">Clear</button></p>
      ${S.formMsg ? `<p class="small t-tight">${esc(S.formMsg)}</p>` : ''}</form>`;
  }
  function corridorHTML() {
    const C = root.PeelCorridorFinder, K = S.corridor, r = K.res, s2 = r.sum, W = S.cw || C.WEIGHTS, v = k => esc(W[k]);
    const ins = Object.entries(C.KINDS).filter(([k]) => s2.in[k] > 1).map(([k, d]) => `${fmtNum(Math.round(s2.in[k]))} m in ${esc(d.label)}`);
    const plain = r.plain ? ` The shortest way along the roads is ${fmtNum(Math.round(r.plain.L))} m${r.plain.L < r.L - 1 ? `${r.plain.sum.water.length > s2.water.length ? `, crossing ${r.plain.sum.water.length} watercourse${r.plain.sum.water.length === 1 ? '' : 's'}` : ''}${Object.keys(C.KINDS).some(k => r.plain.sum.in[k] > s2.in[k] + 1) ? ', through more of the constraint areas' : ''}${r.plain.sum.up > s2.up + 0.1 ? `, climbing ${fmt1(r.plain.sum.up)} m` : ''}` : ' (this one)'}.` : '';
    const field = (k, t, unit) => `<label class="field"><span class="label">${t}</span><input type="number" min="0" step="1" data-sc="${k}" value="${v(k)}"><span class="muted small">${unit}</span></label>`;
    return `<div class="sd-corr"><p class="small"><strong>Route found</strong> along the roads: <strong>${fmtNum(Math.round(r.L))} m</strong> (a straight line is ${fmtNum(Math.round(r.straight))} m).${plain}
      ${ins.length ? ` It runs ${ins.join(', ')}.` : ' It keeps out of the constraint areas.'}
      ${s2.water.length ? ` It crosses ${s2.water.map(n => esc(n || 'a watercourse')).join(', ')}: each crossing needs the conservation authority's permit and 2.0 m from the bed to the top of the pipe (s. 3.4.2.2).` : ' It crosses no mapped watercourse.'}
      ${s2.up > 0.1 ? ` It climbs ${fmt1(s2.up)} m in the direction of flow.` : ''}${r.missing ? ' Some constraint layers did not load: they are not counted.' : ''}</p>
      <details class="sd-cw"><summary class="small">Route weights (the tool's, not Peel's)</summary><div class="sd-row">${field('flood', 'Floodplain', '× per m inside')}${field('natural', 'Wetland / ANSI', '× per m')}${field('reg', 'Regulation limit', '× per m')}${field('nhs', 'Natural Heritage System', '× per m')}${field('plan', 'Provincial plan area', '× per m')}${field('water', 'Watercourse crossing', 'm each')}${field('up', 'Climb in the flow direction', 'm per m')}</div>
      <p class="small muted">A road's cost is its length, plus that many extra metres for each metre inside an area, each crossing, and each metre the ground rises in the direction of flow. Screening layers only: the owners confirm.</p><p><button type="button" class="btn small" data-sd-act="refind">Find again</button></p></details></div>`;
  }
  function resultHTML() {
    const c = S.conn, Lt = S.xs ? S.xs[S.xs.length - 1] : 0, bs = done();
    const head = `<p class="small">From the drawn start to the <strong>${fmtNum(c.dmm)} mm sanitary sewer${c.id ? ` ${esc(c.id)}` : ''}</strong> (invert ${fmt2(c.invert)} m; ${c.existingMH ? 'its existing maintenance hole' : 'a new maintenance hole on the pipe'}) · <strong>${fmtNum(Math.round(Lt))} m</strong> along the drawn route${bs.length ? ` and ${bs.length} branch${bs.length === 1 ? '' : 'es'} (${fmtNum(Math.round(bs.reduce((t, b) => t + b.xs[b.xs.length - 1], 0)))} m)` : ''} · ground ${fmt1(Math.max(...S.ground.map(s => s.g)))}–${fmt1(Math.min(...S.ground.map(s => s.g)))} m.</p>`;
    let body = '';
    if (S.fm) body = fmHTML(S.fm);
    else if (S.d && S.d.ok) body = designHTML(S.d);
    else if (S.d) body = `<p><span class="pnl-chip t-over">No gravity design${S.form.dmm ? ` at ${fmtNum(+S.form.dmm)} mm` : ''}</span> ${esc(S.d.why)}.${S.form.dmm ? ' <button type="button" class="btn small" data-sd-act="auto-size">Use the smallest that works</button>' : ''}</p>${bs.length ? '' : '<p><button type="button" class="btn small" data-sd-act="pumped">Try a pumped option</button></p>'}${profileSVG(null)}`;
    else body = profileSVG(null);
    return `<div class="sd-res">${head}${S.corridor && root.PeelCorridorFinder ? corridorHTML() : ''}${formHTML()}${body}<p class="small muted">A preliminary design for screening: the route as drawn${S.roadsUsed ? ` (along the road centrelines where it follows them: ${esc(root.PeelRoadNet ? root.PeelRoadNet.SOURCE : 'Ontario Road Network')}, so the cover there is from the centreline, as s. 3.4.1.1 measures it)` : ''}, the ground from ${esc(S.groundLabel || 'the terrain model')} (not a survey), the existing sewer as the Region publishes it. Rules: ${esc(S.fm ? FM().SOURCE : SW().SOURCE)}. Utilities, other services, soils and groundwater are not considered.</p><p class="pnl-note small">${NOTE()}</p></div>`;
  }
  function designHTML(d) {
    const deepest = SW().deepest(d, S.net.net).depth, s = d.reaches.map(r => r.S * 100), sizes = [...new Set(d.reaches.map(r => r.dmm))].sort((a, b) => a - b), nRuns = runs().length;
    const ok = c => `<li class="${c.pass ? 'sd-ok' : 'sd-no'}"><span aria-hidden="true">${c.pass ? '✓' : '✗'}</span> ${esc(c.t)}: <strong>${esc(c.val)}</strong></li>`;
    const checkList = checks(d, S.net.net, S.conn).map(ok);
    const froudeHi = d.reaches.filter(r => r.froude >= 1).length, heldN = d.reaches.filter(r => r.held).length;
    const where = m => (m.run ? `branch ${m.run + 1}` : 'main');
    const mhRows = d.mhs.map(m => `<tr><th scope="row">${esc(m.label.replace(/ \((.+)\)$/, ''))}${/\(/.test(m.label) ? ` <small>${esc(/\((.+)\)$/.exec(m.label)[1])}</small>` : ''}</th><td>${where(m)} ${fmtNum(Math.round(m.x))} m</td><td class="n">${fmt2(m.g)}</td><td class="n">${m.ins.length ? m.ins.map(x => fmt2(x.inv)).join(' / ') : '–'}</td><td class="n">${m.inv_out == null ? '–' : fmt2(m.inv_out)}</td><td class="n">${fmt2(m.depth)}</td><td class="n">${m.ins.some(x => x.drop) ? m.ins.map(x => `${fmt2(x.drop)}${x.structure ? ' <small>structure</small>' : ''}`).join(' / ') : '–'}</td></tr>`).join('');
    const rRows = d.reaches.map(r => `<tr><th scope="row">${r.from + 1} → ${r.to + 1}</th><td class="n">${r.dmm}</td><td class="n">${fmt1(r.q)}</td><td class="n">${fmt1(r.L)}</td><td class="n">${(r.S * 100).toFixed(2)}</td><td class="n">${fmt1(r.qFull)}</td><td class="n">${r.qRatio.toFixed(2)}</td><td class="n">${fmt2(r.v)}</td><td class="n">${fmt2(r.vFull)}</td><td class="n">${r.froude.toFixed(2)}</td></tr>`).join('');
    const sizeTxt = sizes.length > 1 ? `${fmtNum(sizes[0])}–${fmtNum(sizes[sizes.length - 1])} mm` : `${fmtNum(sizes[0])} mm`;
    const views = nRuns > 1 ? `<p class="sd-views" role="group" aria-label="Profile of">${runs().map((_, ri) => `<button type="button" class="btn small${ri === S.view ? ' on' : ''}" data-sd-view="${ri}" aria-pressed="${ri === S.view}">${ri ? `Branch ${ri + 1}` : 'Main line'}</button>`).join('')}</p>` : '';
    return `<p><span class="pnl-chip t-room">Gravity design</span> A <strong>${sizeTxt}</strong> sewer${nRuns > 1 ? ` (the main line and ${nRuns - 1} branch${nRuns === 2 ? '' : 'es'})` : ''} at ${fmt2(Math.min(...s)) === fmt2(Math.max(...s)) ? fmt2(s[0]) : `${fmt2(Math.min(...s))}–${fmt2(Math.max(...s))}`}%, ${fmtNum(d.mhs.length)} maintenance holes, ${fmt1(d.mhs[0].depth)} m deep at the start and ${fmt1(deepest)} m at the deepest, for ${fmt1(d.q)} L/s${nRuns > 1 ? ' at the connection' : ''}${S.flow && !S.flow.typed && S.flow.peak != null && nRuns === 1 ? ` (${fmt1(S.flow.peak)} L/s peak dry + ${fmt1(S.flow.ii)} L/s I&amp;I)` : ''}. ${S.form.dmm ? `At the ${fmtNum(+S.form.dmm)} mm you chose: the least excavation the rules allow at that size` : 'The smallest size that works, at the least excavation the rules allow'}${d.slopes ? ` within ${fmt2(d.slopes[0] * 100)}–${fmt2(d.slopes[1] * 100)}%` : ''}.${heldN ? ` <span class="pnl-chip t-tight">Under 0.75 m/s</span> ${heldN} reach${heldN === 1 ? '' : 'es'} at the steepest slope chosen, still under 0.75 m/s at the design flow (see the rules checked).` : ''}</p>
      <h4 class="sd-h">Profile${nRuns > 1 ? ` · ${S.view ? `branch ${S.view + 1} to the connection` : 'the main line'}` : ''}</h4>${views}<div data-sd-profile>${profileSVG(lineView(S.view))}</div>
      <h4 class="sd-h">Rules checked</h4><ul class="sd-checks small">${checkList.join('')}</ul>${froudeHi ? `<p class="small t-tight">${froudeHi} reach${froudeHi === 1 ? '' : 'es'} with supercritical flow (Froude 1 or more): the standard asks for subcritical flow where possible (s. 2.9.1).</p>` : ''}
      <h4 class="sd-h">Room downstream</h4><div data-sd-down>${downHTML()}</div>
      <h4 class="sd-h">Crossings</h4><div data-sd-xings>${xingsHTML()}</div>
      <h4 class="sd-h">Maintenance holes</h4><div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">MH</th><th scope="col">On</th><th scope="col" class="n">Ground (m)</th><th scope="col" class="n">Invert in</th><th scope="col" class="n">Invert out</th><th scope="col" class="n">Depth</th><th scope="col" class="n">Drop</th></tr></thead><tbody>${mhRows}</tbody></table></div>
      <h4 class="sd-h">Reaches · ${sizeTxt}</h4><div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">Reach</th><th scope="col" class="n">Size (mm)</th><th scope="col" class="n">Flow (L/s)</th><th scope="col" class="n">Length (m)</th><th scope="col" class="n">Slope (%)</th><th scope="col" class="n">Full flow (L/s)</th><th scope="col" class="n">Flow ratio</th><th scope="col" class="n">V design (m/s)</th><th scope="col" class="n">V full (m/s)</th><th scope="col" class="n">Froude</th></tr></thead><tbody>${rRows}</tbody></table></div>
      <p><button type="button" class="btn small" data-sd-act="print">Print plan and profile (11×17)</button> <button type="button" class="btn small" data-sd-act="csv">Download the design (CSV)</button></p>`;
  }
  // The profile of a line view (lineView()): the ground, the cover line, the pipe (obvert and
  // invert), the maintenance holes, the existing sewer at the connection; or the main line's ground
  // alone (v null). Chainage along the bottom, elevations up the side.
  function profileSVG(v) {
    const W = 640, H = 260, pl = 46, pr = 10, pt = 14, pb = 30, G = v ? v.ground : S.ground, Lt = G[G.length - 1].x || 1;
    const lows = v ? v.mhs.flatMap(m => [m.inv_in, m.inv_out]).filter(x => x != null) : [S.conn.invert];
    const zmin = Math.floor(Math.min(...lows, ...G.map(s => s.g)) - 0.5), zmax = Math.ceil(Math.max(...G.map(s => s.g)) + 0.5);
    const X = x => pl + (W - pl - pr) * x / Lt, Y = z => pt + (H - pt - pb) * (zmax - z) / ((zmax - zmin) || 1);
    const path = arr => arr.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join('');
    const ground = path(G.map(s => [s.x, s.g]));
    const cover = v ? path(G.map(s => [s.x, s.g - v.cover])) : '';
    let pipe = '';
    if (v) {
      pipe = v.reaches.map(r => { const a = v.nodes[r.from].x, b = v.nodes[r.to].x, D = r.dmm / 1000; return `<path d="M${X(a).toFixed(1)},${Y(r.inv_up + D).toFixed(1)}L${X(b).toFixed(1)},${Y(r.inv_dn + D).toFixed(1)}L${X(b).toFixed(1)},${Y(r.inv_dn).toFixed(1)}L${X(a).toFixed(1)},${Y(r.inv_up).toFixed(1)}Z" class="sp-pipe"/>`; }).join('');
      pipe += v.mhs.map(m => { const top = Y(m.g), bot = Y(Math.min(...[m.inv_in, m.inv_out].filter(z => z != null))); return `<line x1="${X(m.x).toFixed(1)}" x2="${X(m.x).toFixed(1)}" y1="${top.toFixed(1)}" y2="${bot.toFixed(1)}" class="sp-mh${m.structure ? ' sp-drop' : ''}"/><text x="${X(m.x).toFixed(1)}" y="${(top - 4).toFixed(1)}" class="sp-lbl" text-anchor="middle">${m.num}</text>`; }).join('');
    }
    const ex = `<circle cx="${X(Lt).toFixed(1)}" cy="${Y(S.conn.invert + S.conn.dmm / 2000).toFixed(1)}" r="${Math.max(3, (H - pt - pb) * (S.conn.dmm / 1000) / ((zmax - zmin) || 1) / 2).toFixed(1)}" class="sp-ex"/>`;
    // Crossings: a watermain at its assumed depth, a storm sewer as a mark on the ground (depth unknown).
    const xs = v && v.xings ? v.xings.map(x => x.kind === 'water'
      ? `<circle cx="${X(x.x).toFixed(1)}" cy="${Y(x.otherTop - x.d / 2000).toFixed(1)}" r="${Math.max(2.5, (H - pt - pb) * (x.d / 1000) / ((zmax - zmin) || 1) / 2).toFixed(1)}" class="sp-wm${x.ok ? '' : ' sp-bad'}"/>`
      : `<line x1="${X(x.x).toFixed(1)}" x2="${X(x.x).toFixed(1)}" y1="${(Y(x.ground) - 6).toFixed(1)}" y2="${(Y(x.ground) + 6).toFixed(1)}" class="sp-st"/><text x="${X(x.x).toFixed(1)}" y="${(Y(x.ground) - 8).toFixed(1)}" class="sp-ax" text-anchor="middle">storm</text>`).join('') : '';
    // Axes: elevations every 1, 2 or 5 m; chainage every 50, 100 or 200 m.
    const zs = (zmax - zmin) > 20 ? 5 : (zmax - zmin) > 8 ? 2 : 1, xsStep = Lt > 1200 ? 200 : Lt > 500 ? 100 : 50;
    let axes = '';
    for (let z = Math.ceil(zmin / zs) * zs; z <= zmax; z += zs) axes += `<line x1="${pl}" x2="${W - pr}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" class="sp-grid"/><text x="${pl - 4}" y="${(Y(z) + 3).toFixed(1)}" class="sp-ax" text-anchor="end">${z}</text>`;
    for (let x = 0; x <= Lt + 1e-6; x += xsStep) axes += `<text x="${X(x).toFixed(1)}" y="${H - pb + 14}" class="sp-ax" text-anchor="middle">${x}</text>`;
    const sizes = v ? [...new Set(v.reaches.map(r => r.dmm))].sort((a, b) => a - b) : [];
    return `<svg class="sd-prof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile of the sewer: ground, minimum cover, the pipe and the maintenance holes, from the start (left) to the connection (right)">${axes}<path d="${ground}" class="sp-ground"/>${cover ? `<path d="${cover}" class="sp-cover"/>` : ''}${pipe}${ex}${xs}<text x="${pl}" y="${H - 4}" class="sp-ax">chainage (m) from the start · elevations (m, CGVD2013)</text></svg>
      <p class="small muted sd-key"><span class="lp-k lp-k-g"></span>ground${v ? ` <span class="lp-k sd-k-c"></span>${v.cover} m cover line <span class="lp-k lp-k-p"></span>the pipe (${sizes.length > 1 ? `${sizes[0]}–${sizes[sizes.length - 1]}` : sizes[0]} mm) and its maintenance holes` : ''} <span class="lp-k sd-k-e"></span>the existing sewer${v && v.xings && v.xings.length ? ' <span class="lp-k sd-k-w"></span>a watermain crossed (assumed depth)' : ''}</p>`;
  }
  // ---- The pumped option: the forcemain, its profile and the pump duty point ------------------------
  function fmHTML(f) {
    const ok = c => `<li class="${c.pass ? 'sd-ok' : 'sd-no'}"><span aria-hidden="true">${c.pass ? '✓' : '✗'}</span> ${esc(c.t)}: <strong>${esc(c.val)}</strong></li>`;
    // (a size chosen outside the velocity range: designed, but flagged)
    const off = f.chosen && f.checks[0] && !f.checks[0].pass;
    const head = f.ok ? `<p><span class="pnl-chip ${off ? 't-over' : 't-room'}">${off ? 'Pumped design · size outside the rules' : 'Pumped design'}</span> A <strong>${f.dmm} mm forcemain</strong>${f.chosen ? ' (the size you chose)' : ''} (${esc(f.material)}), ${fmtNum(Math.round(f.L))} m at ${fmt2(f.v)} m/s, from a pumping station at the start to a discharge maintenance hole on the ${fmtNum(S.conn.dmm)} mm sewer. The pumps: <strong>${fmt1(f.q)} L/s at ${fmt1(f.tdh)} m</strong> total head.</p>`
      : `<p><span class="pnl-chip t-over">No pumped design</span> ${esc(f.why)}.</p>`;
    const duty = `<dl class="sd-duty small"><dt>Design flow</dt><dd>${fmt1(f.q)} L/s${S.flow && !S.flow.typed ? ` (${fmt1(S.flow.peak)} L/s peak dry + ${fmt1(S.flow.ii)} L/s I&amp;I)` : ''}</dd>
      <dt>Static lift</dt><dd>${fmt2(f.lift)} m, from the wet well's low level ${fmt2(f.ww)} m${f.wwAssumed ? ` (${esc(f.wwNote)}; the wet well's operating range adds to it)` : ''} to the outlet obvert ${fmt2(f.outEl)} m</dd>
      ${f.over ? `<dt>Over a high point</dt><dd>${fmt2(f.over.need)} m more: the pipe at ${fmtNum(Math.round(f.over.x))} m stands above the hydraulic grade line</dd>` : ''}
      <dt>Friction</dt><dd>${fmt2(f.hf)} m (Hazen-Williams, C 140: ${fmt2(f.hfPerKm)} m per km)</dd>
      <dt>Total head</dt><dd><strong>${fmt2(f.tdh)} m</strong> · water power ${fmt1(f.power)} kW (before pump and motor losses)</dd></dl>`;
    const sizes = f.sizes.map(c => `<tr${c.dmm === f.dmm ? ' class="on"' : ''}><th scope="row">${c.dmm} mm${c.dmm === f.dmm ? ' <small>chosen</small>' : ''}</th><td class="n">${fmt2(c.v)}</td><td class="n">${fmt2(c.hf1000)}</td><td class="n">${fmt1(f.curve(1) - f.hf + c.hf1000 * f.L / 1000)}</td><td>${c.ok ? '✓' : c.v < f.vMin ? `under ${f.vMin.toFixed(1)} m/s` : 'over 3.0 m/s'}</td><td>${c.dmm === f.dmm ? '' : `<button type="button" class="btn small link" data-sd-act="fm-size" data-sd-size="${c.dmm}">Use</button>`}</td></tr>`).join('');
    return `${head}
      <h4 class="sd-h">Pump duty</h4>${duty}${curveSVG(f)}
      <h4 class="sd-h">Profile</h4>${fmProfileSVG(f)}
      <h4 class="sd-h">Rules checked</h4><ul class="sd-checks small">${f.checks.map(ok).join('')}</ul>${f.ok ? `
      <h4 class="sd-h">Room downstream</h4><div data-sd-down>${downHTML()}</div>` : ''}
      <h4 class="sd-h">Sizes at ${fmt1(f.q)} L/s</h4><div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">Forcemain</th><th scope="col" class="n">Velocity (m/s)</th><th scope="col" class="n">Friction (m per km)</th><th scope="col" class="n">Total head (m)</th><th scope="col">1.0–3.0 m/s</th><th scope="col"><span class="sr-only">Choose</span></th></tr></thead><tbody>${sizes}</tbody></table></div>
      <div class="sd-ps small"><strong>The pumping station is not sized here.</strong> Size it to Peel's Sewage Pumping Station Design Standard: the wet well and its operating range, the number of pumps and firm capacity, standby power, and the forcemain's redundancy (twinning, s. 4.3.1). A transient analysis is mandatory for every forcemain (s. 4.3.6); fittings, valves and station pipework add head not counted here.</div>
      <p><button type="button" class="btn small" data-sd-act="fm-csv">Download the forcemain (CSV)</button></p>`;
  }
  // The forcemain's profile: the ground, the cover line, the pipe, the hydraulic grade line at the
  // design flow, air valves (▲) and drains (▼), the station at the start, the discharge at the end.
  function fmProfileSVG(f) {
    const W = 640, H = 260, pl = 46, pr = 10, pt = 14, pb = 30, Lt = f.L || 1;
    const hgl0 = f.outEl + f.hf + (f.over ? f.over.need : 0);
    const zmin = Math.floor(Math.min(f.ww, ...f.prof.map(p => p.inv), S.conn.invert) - 0.5), zmax = Math.ceil(Math.max(hgl0, ...f.prof.map(p => p.g)) + 0.5);
    const X = x => pl + (W - pl - pr) * x / Lt, Y = z => pt + (H - pt - pb) * (zmax - z) / ((zmax - zmin) || 1);
    const path = arr => arr.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join('');
    const D = f.dmm / 1000;
    const pipe = `<path d="${path(f.prof.map(p => [p.x, p.inv + D]))}${f.prof.slice().reverse().map(p => `L${X(p.x).toFixed(1)},${Y(p.inv).toFixed(1)}`).join('')}Z" class="sp-pipe"/>`;
    const hgl = `<path d="${path([[0, hgl0], [Lt, hgl0 - f.hf]])}" class="sp-hgl"/>`;
    const marks = [...f.highs.map(h => `<text x="${X(h.x).toFixed(1)}" y="${(Y(h.z + D) - 4).toFixed(1)}" class="sp-lbl" text-anchor="middle">▲ AV</text>`), ...f.lows.map(h => `<text x="${X(h.x).toFixed(1)}" y="${(Y(h.z) + 11).toFixed(1)}" class="sp-lbl" text-anchor="middle">▼ DV</text>`)].join('');
    const ps = `<rect x="${(X(0) - 4).toFixed(1)}" y="${Y(f.prof[0].g).toFixed(1)}" width="8" height="${(Y(f.ww) - Y(f.prof[0].g)).toFixed(1)}" class="sp-ps"/><text x="${(X(0) + 6).toFixed(1)}" y="${(Y(f.ww) + 3).toFixed(1)}" class="sp-ax">wet well low ${fmt2(f.ww)}</text>`;
    const ex = `<circle cx="${X(Lt).toFixed(1)}" cy="${Y(S.conn.invert + S.conn.dmm / 2000).toFixed(1)}" r="${Math.max(3, (H - pt - pb) * (S.conn.dmm / 1000) / ((zmax - zmin) || 1) / 2).toFixed(1)}" class="sp-ex"/><line x1="${X(Lt).toFixed(1)}" x2="${X(Lt).toFixed(1)}" y1="${Y(f.prof[f.prof.length - 1].g).toFixed(1)}" y2="${Y(S.conn.invert).toFixed(1)}" class="sp-mh"/>`;
    const zs = (zmax - zmin) > 20 ? 5 : (zmax - zmin) > 8 ? 2 : 1, xsStep = Lt > 1200 ? 200 : Lt > 500 ? 100 : 50;
    let axes = '';
    for (let z = Math.ceil(zmin / zs) * zs; z <= zmax; z += zs) axes += `<line x1="${pl}" x2="${W - pr}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" class="sp-grid"/><text x="${pl - 4}" y="${(Y(z) + 3).toFixed(1)}" class="sp-ax" text-anchor="end">${z}</text>`;
    for (let x = 0; x <= Lt + 1e-6; x += xsStep) axes += `<text x="${X(x).toFixed(1)}" y="${H - pb + 14}" class="sp-ax" text-anchor="middle">${x}</text>`;
    return `<svg class="sd-prof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile of the forcemain: ground, minimum cover, the pipe, the hydraulic grade line, air valves and drains, from the pumping station (left) to the discharge maintenance hole (right)">${axes}<path d="${path(f.prof.map(p => [p.x, p.g]))}" class="sp-ground"/><path d="${path(f.prof.map(p => [p.x, p.g - f.cover]))}" class="sp-cover"/>${pipe}${hgl}${ps}${ex}${marks}<text x="${pl}" y="${H - 4}" class="sp-ax">chainage (m) from the pumping station · elevations (m, CGVD2013)</text></svg>
      <p class="small muted sd-key"><span class="lp-k lp-k-g"></span>ground <span class="lp-k sd-k-c"></span>${f.cover} m cover line <span class="lp-k lp-k-p"></span>the forcemain (${f.dmm} mm) <span class="lp-k sd-k-h"></span>hydraulic grade line at ${fmt1(f.q)} L/s <span class="lp-k sd-k-e"></span>the existing sewer · ▲ AV air release · ▼ DV drain</p>`;
  }
  // The system curve (static plus friction, 0 to 1.5 × the design flow) and the duty point.
  function curveSVG(f) {
    const W = 640, H = 170, pl = 46, pr = 12, pt = 10, pb = 28, qmax = f.q * 1.5, hmax = Math.ceil(f.curve(1.5) * 1.1 + 1), hmin = Math.min(0, Math.floor(f.curve(0)));
    const X = q => pl + (W - pl - pr) * q / qmax, Y = h => pt + (H - pt - pb) * (hmax - h) / ((hmax - hmin) || 1);
    const pts = Array.from({ length: 31 }, (_, i) => i / 20).map(fr => [f.q * fr, f.curve(fr)]);
    const hs = hmax - hmin > 40 ? 10 : hmax - hmin > 16 ? 5 : 2, qs = qmax > 300 ? 100 : qmax > 120 ? 50 : qmax > 50 ? 20 : qmax > 20 ? 10 : 5;
    let axes = '';
    for (let h = Math.ceil(hmin / hs) * hs; h <= hmax; h += hs) axes += `<line x1="${pl}" x2="${W - pr}" y1="${Y(h).toFixed(1)}" y2="${Y(h).toFixed(1)}" class="sp-grid"/><text x="${pl - 4}" y="${(Y(h) + 3).toFixed(1)}" class="sp-ax" text-anchor="end">${h}</text>`;
    for (let q = 0; q <= qmax + 1e-6; q += qs) axes += `<text x="${X(q).toFixed(1)}" y="${H - pb + 13}" class="sp-ax" text-anchor="middle">${q}</text>`;
    const dp = `<circle cx="${X(f.q).toFixed(1)}" cy="${Y(f.tdh).toFixed(1)}" r="4" class="sp-duty"/><text x="${(X(f.q) + 7).toFixed(1)}" y="${(Y(f.tdh) - 6).toFixed(1)}" class="sp-lbl">${fmt1(f.q)} L/s at ${fmt1(f.tdh)} m</text>`;
    return `<svg class="sd-prof sd-curve" viewBox="0 0 ${W} ${H}" role="img" aria-label="System curve: total head against flow, with the duty point at ${fmt1(f.q)} L/s and ${fmt1(f.tdh)} m">${axes}<path d="${pts.map(([q, h], i) => `${i ? 'L' : 'M'}${X(q).toFixed(1)},${Y(h).toFixed(1)}`).join('')}" class="sp-sys"/>${dp}<text x="${pl}" y="${H - 4}" class="sp-ax">flow (L/s) · total head (m): the system curve, static lift plus Hazen-Williams friction</text></svg>`;
  }
  function downloadFmCSV() {
    const E = root.PeelExports, f = S.fm; if (!f || !E || !E.download) return;
    const lines = ['Chainage (m),Ground (m),Pipe invert (m),Cover (m),Point', ...f.prof.map(p => [p.x.toFixed(1), p.g.toFixed(2), p.inv.toFixed(2), (p.g - p.inv - f.dmm / 1000).toFixed(2), f.highs.some(h => h.x === p.x) ? 'high: air release' : f.lows.some(h => h.x === p.x) ? 'low: drain' : ''].join(','))];
    lines.push('', `Forcemain (mm),${f.dmm}`, `Length (m),${f.L.toFixed(1)}`, `Design flow (L/s),${f.q.toFixed(2)}`, `Velocity (m/s),${f.v.toFixed(2)}`, `Static lift (m),${f.lift.toFixed(2)}`, `Friction (m),${f.hf.toFixed(2)}`, `Total head (m),${f.tdh.toFixed(2)}`, `Outlet invert (m),${f.outletInv.toFixed(2)}`, `Rules,"${f.source}"`, '"The pumping station is not sized: size it to Peel\'s Sewage Pumping Station Design Standard. A transient analysis is mandatory (s. 4.3.6)."', '"General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results."');
    E.download('peel-forcemain.csv', lines.join('\n'), 'text/csv');
  }
  function downloadCSV() {
    if (!S.d || !S.d.ok) return;
    const E = root.PeelExports, text = csv(S.d);
    if (E && E.download) E.download('peel-sewer-design.csv', text, 'text/csv');
  }
  // The 11×17 sheet: the Region's sanitary sewers around the route for the plan (the connected one
  // alone when they can't be read), the development open in the panel or the start's coordinates.
  // The plan shows every line; the profile is the main line's.
  async function printSheet() {
    const P = root.PeelSewerPrint; if (!S.d || !S.d.ok || !P) return;
    const lls = S.d.mhs.map(m => m.ll), lat = lls.reduce((t, p) => t + p.lat, 0) / lls.length, lng = lls.reduce((t, p) => t + p.lng, 0) / lls.length;
    const r = Math.min(1500, Math.max(...lls.map(p => metres({ lat, lng }, p))) + 120);
    let mains = [];
    try { mains = (await MS().mainsNear(lat, lng, r)).filter(m => !m.fm).map(m => ({ g: m.g, d: m.d, id: m.id })); } catch (e) { mains = []; }
    const key = g => g.map(c => c.join()).join(';'), ck = S.conn.g ? key(S.conn.g) : '';
    mains.forEach(m => { if (key(m.g) === ck) m.conn = true; });
    if (S.conn.g && !mains.some(m => m.conn)) mains.push({ g: S.conn.g, d: S.conn.dmm, id: S.conn.id, conn: true });
    const dev = root.DevScope && root.DevScope.current && root.DevScope.current(), st = S.pts[0];
    const RP = root.PeelReports, Ut = root.PeelUtil || {}, v = lineView(0);
    P.open({
      d: S.d, view: v, nodes: v.nodes, ground: v.ground, pts: [...S.pts, ...done().flatMap(b => b.pts)], conn: S.conn, mains, flow: S.flow, groundLabel: S.groundLabel,
      plan: { lls, reaches: S.d.reaches, labels: S.d.mhs.map((m, i) => `MH ${i + 1}`), start: S.pts[0], branches: done().map(b => b.pts[0]) },
      xings: S.xings || null, down: S.d.down || null, checks: checks(S.d, S.net.net, S.conn), deepest: SW().deepest(S.d, S.net.net), froudeHi: S.d.reaches.filter(x => x.froude >= 1).length,
      where: dev && dev.title ? `From ${dev.title}` : `From ${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}`,
      date: new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
      version: RP && RP.appVersion ? RP.appVersion() : 'dev', unofficial: Ut.UNOFFICIAL || 'Unofficial prototype · public data only · not a Region of Peel product',
      source: SW().SOURCE, note: Ut.SCREEN_LINE || 'General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results.',
    });
  }
  function clearAll() { xSeq++; S.res = false; S.xings = null; S.legs = []; S.roadsUsed = false; S.findMode = false; S.corridor = null; S.pts = []; S.conn = null; S.net = null; S.d = null; S.fm = null; S.msg = ''; S.branches = []; S.drawing = 0; S.view = 0; if (layer) layer.clearLayers(); }
  const reset = () => { S.res = false; S.d = null; S.fm = null; S.net = null; S.xings = null; S.xingsErr = ''; S.xingsBusy = false; xSeq++; S.down = null; dSeq++; };

  // The form and its buttons (in the result panel).
  const setField = i => {
    if (i.dataset.sc != null) { S.cw = { ...(S.cw || root.PeelCorridorFinder.WEIGHTS), [i.dataset.sc]: Math.max(0, +i.value || 0) }; return; }
    if (i.dataset.sb != null) { const b = S.branches[+i.dataset.sb]; if (b) b.form[i.dataset.sbK] = i.value; return; }
    S.form[i.dataset.sd] = i.type === 'checkbox' ? i.checked : i.value;
  };
  document.addEventListener('input', e => { const i = e.target.closest && e.target.closest('[data-sd], [data-sb], [data-sc]'); if (i) setField(i); });
  document.addEventListener('change', e => { const i = e.target.closest && e.target.closest('[data-sd], [data-sb], [data-sc]'); if (!i) return; setField(i); if (i.dataset.sd === 'mode') { reset(); openResult(); drawLine(); } });
  document.addEventListener('click', e => {
    const vb = e.target.closest && e.target.closest('[data-sd-view]');
    if (vb) { S.view = +vb.dataset.sdView; openResult(); return; }
    const b = e.target.closest && e.target.closest('[data-sd-act]'); if (!b) return;
    const act = b.dataset.sdAct, A = root.PeelApp && root.PeelApp.scope;
    if (act === 'design') run();
    else if (act === 'csv') downloadCSV();
    else if (act === 'print') printSheet();
    else if (act === 'pumped') { S.form.mode = 'pumped'; run(); }
    else if (act === 'auto-size') { S.form.dmm = ''; run(); }
    else if (act === 'fm-size') { S.form.fmdmm = b.dataset.sdSize; run(); }
    else if (act === 'fm-csv') downloadFmCSV();
    else if (act === 'refind' && S.corridor) findRoute(S.corridor.a, S.corridor.b);
    else if (act === 'branch') {
      // Draw a branch: the tool on again, without losing the main line.
      reset(); S.branches.push({ pts: [], legs: [], form: { q: '', pop: '', jobs: '', ha: '' }, done: false }); S.drawing = S.branches.length; S.keep = true;
      // (on a phone the panel drops to its peek, so the map takes the taps)
      if (!onPage() && narrow() && root.PeelApp && root.PeelApp.setAnalysisSnap) root.PeelApp.setAnalysisSnap('peek', false);
      if (T().active() !== 'sewer' && A && A.setTool) A.setTool('sewer'); else { S.keep = false; banner(); }
      drawLine();
    } else if (act === 'rm-branch') {
      const k = +b.dataset.sdBranch, rmd = new Set([k]);
      // (and the branches that join it)
      let grew = true; while (grew) { grew = false; S.branches.forEach((x, j) => { const parent = x.join ? S.branches.indexOf(x.join.to) : -1; if (!rmd.has(j) && rmd.has(parent)) { rmd.add(j); grew = true; } }); }
      S.branches = S.branches.filter((_, j) => !rmd.has(j)); reset(); openResult(); drawLine();
    } else if (act === 'edit') { reset(); S.conn = null; S.branches = []; S.drawing = 0; S.corridor = null; if (T().active() !== 'sewer' && A && A.setTool) A.setTool('sewer'); drawLine(); banner(); }
    else if (act === 'clear') { clearAll(); T().closeResult(); if (onPage()) renderPage(); }
    // (the page with drawing off: draw a new route)
    else if (act === 'page-new') { clearAll(); S.home = true; if (T().active() !== 'sewer' && A && A.setTool) A.setTool('sewer'); else banner(); }
  });
  // (a design made on its Labs page stays with the page: S.home)
  document.addEventListener('peel:tool-closed', () => { if (T().active() !== 'sewer') { if (S.drawing) { S.branches.splice(S.drawing - 1, 1); S.drawing = 0; } if (!S.home && !(T().hasResult() && T().resultTitle() === 'Sewer design')) clearAll(); } });
  document.addEventListener('peel:result-opened', e => { if (e.detail && e.detail.ref !== 'tool:sewer-design' && T().active() !== 'sewer' && !S.home) clearAll(); });

  // ---- Labs › Sewer designer: its own page in Home's sidebar (js/workspaces.js LAB_PAGES) ---------
  // The same tool on a page: the steps and the drawing controls (the banner's) over the map on the page,
  // the design under it (its figures, then the form, the profile, the checks, the tables, the CSV and
  // the print sheet). The tool is on while the page is open; the design stays with the page (S.home)
  // when you leave it and is there again when you come back.
  // (the app's setTool toggles: called only when the tool is not already as wanted)
  const toolOn = on => { const A = root.PeelApp && root.PeelApp.scope; if (A && A.setTool && (T().active() === 'sewer') !== on) A.setTool('sewer'); };
  const STEPS = ['Draw the route', 'What it serves', 'The design'];
  function pageBarHTML() {
    const step = !S.res ? 0 : (S.d && S.d.ok) || (S.fm && S.fm.ok) ? 2 : 1, m = map();
    const steps = STEPS.map((t, i) => `<li class="sd-step${i === step ? ' on' : i < step ? ' done' : ''}"${i === step ? ' aria-current="step"' : ''}><span class="pnl-step-n" aria-hidden="true">${i < step ? '✓' : i + 1}</span>${t}</li>`).join('');
    const off = `<strong>Sewer designer</strong> <span class="muted">Drawing is off.</span> <span class="tb-acts">${S.res ? '<button type="button" class="btn small" data-sd-act="edit">Edit the route</button><button type="button" class="btn small primary" data-sd-act="page-new">Start a new route</button>' : '<button type="button" class="btn small primary" data-sd-act="page-new">Draw a sewer</button>'}</span>`;
    const far = !S.pts.length && m && m.getZoom && m.getZoom() < 15;
    // (the route ended on the sewer: what's next is below the map; a tap on the map starts a new route)
    const ended = `<strong>Sewer designer</strong> <span class="muted">${step === 2 ? 'The design is below the map' : 'Say what it serves below the map, then Design'} · a tap on the map starts a new route</span> <span class="tb-acts"><button type="button" class="btn small" data-sd-act="edit">Edit the route</button><button type="button" class="btn small" data-sd-act="page-new">Start a new route</button></span>`;
    const ctl = T().active() !== 'sewer' ? off : S.res && !S.drawing && !S.busy && !S.findMode ? ended : bannerHTML();
    return `<ol class="sd-steps small" aria-label="Steps">${steps}</ol><div class="sd-pbar">${ctl}</div>${far ? '<p class="small muted sd-zoom">Zoom in to street level: the existing sewers show from there.</p>' : ''}`;
  }
  // The headline figures of a design (the page's figure cards).
  function pageFigs() {
    const fig = f => `<div class="pnl-fig${f.tone ? ` t-${f.tone}` : ''}"><b>${f.v}</b>${f.u ? `<span class="pnl-u">${f.u}</span>` : ''}<span class="pnl-l">${esc(f.label)}</span>${f.ctx ? `<small>${f.ctx}</small>` : ''}</div>`;
    let F = [];
    if (S.d && S.d.ok) {
      const d = S.d, sz = [...new Set(d.reaches.map(r => r.dmm))].sort((a, b) => a - b), sl = d.reaches.map(r => r.S * 100), L = d.reaches.reduce((t, r) => t + r.L, 0);
      const ck = checks(d, S.net.net, S.conn), pass = ck.filter(c => c.pass).length, deep = SW().deepest(d, S.net.net).depth;
      F = [
        { v: sz.length > 1 ? `${sz[0]}–${sz[sz.length - 1]}` : `${sz[0]}`, u: 'mm', label: 'Pipe size', ctx: `${fmt2(Math.min(...sl)) === fmt2(Math.max(...sl)) ? fmt2(sl[0]) : `${fmt2(Math.min(...sl))}–${fmt2(Math.max(...sl))}`}% slope · into the ${fmtNum(S.conn.dmm)} mm sewer` },
        { v: fmtNum(Math.round(L)), u: 'm', label: 'New sewer', ctx: `${fmtNum(d.reaches.length)} reach${d.reaches.length === 1 ? '' : 'es'} · ${fmt1(d.q)} L/s design flow` },
        { v: fmtNum(d.mhs.length), u: '', label: 'Maintenance holes', ctx: `${fmt1(deep)} m at the deepest · ${fmtNum(d.structures)} drop structure${d.structures === 1 ? '' : 's'}` },
        { v: `${pass}/${ck.length}`, u: '', label: 'Rules met', tone: pass === ck.length ? 'room' : 'over', ctx: pass === ck.length ? 'Linear Wastewater Standards' : `${ck.length - pass} to resolve: see Rules checked` },
      ];
    } else if (S.fm && S.fm.ok) {
      const f = S.fm, pass = f.checks.filter(c => c.pass).length;
      F = [
        { v: `${f.dmm}`, u: 'mm', label: 'Forcemain', ctx: `${esc(f.material)} · ${fmt2(f.v)} m/s` },
        { v: fmtNum(Math.round(f.L)), u: 'm', label: 'Length', ctx: `to a discharge maintenance hole on the ${fmtNum(S.conn.dmm)} mm sewer` },
        { v: fmt1(f.q), u: 'L/s', label: 'Pump duty', ctx: `at ${fmt1(f.tdh)} m total head · ${fmt1(f.power)} kW water power` },
        { v: `${pass}/${f.checks.length}`, u: '', label: 'Rules met', tone: pass === f.checks.length ? 'room' : 'over', ctx: 'Sewage Pumping Station Design Standard' },
      ];
    }
    return F.length ? `<div class="pnl-figs sd-figs">${F.map(fig).join('')}</div>` : '';
  }
  const INTRO = `<div class="sd-intro">
    <div><h3>How it works</h3><ol class="small">
      <li><strong>Draw the route.</strong> Tap the map from the site along the way the sewer would run. The last tap snaps to the nearest Region sanitary sewer with published inverts (within 40 m). <em>Follow roads</em> keeps each tap on the road centrelines; <em>Find a route</em> picks one around the constraint layers. Press <strong>Finish</strong>.</li>
      <li><strong>Say what it serves.</strong> The peak wet weather flow, or the population, jobs and area at Peel criteria. Branches can join it, each with its own flow.</li>
      <li><strong>Design.</strong> The least-excavation gravity sewer to Peel's Linear Wastewater Standards, or a pumping station and forcemain where gravity can't reach.</li></ol></div>
    <div><h3>What you get</h3><ul class="small">
      <li>The plan on the map: maintenance holes, sizes and slopes</li><li>The profile: ground, cover, the pipe, the crossings</li><li>The rules checked, each pass or fail</li><li>Every maintenance hole and reach in a table</li><li>The design as a CSV, and an 11×17 plan and profile</li></ul></div></div>`;
  function renderPage() {
    const bar = document.querySelector('#home [data-sd-pbar-host]'), host = document.querySelector('#home [data-sd-phost]');
    if (bar) bar.innerHTML = pageBarHTML();
    if (!host) return;
    // (a route ended on the sewer and its ground read: the result; until then, how it works)
    host.innerHTML = S.res && S.conn && S.ground ? `${pageFigs()}${resultHTML()}` : INTRO;
  }
  const LAYERS = [['ex-sanitary', 'Existing sewers'], ['ex-water', 'Existing water'], ['ex-storm', 'Storm'], ['devs', 'Developments']];
  function page() {
    const LG = root.PeelLayerGroups, on = k => { try { return !!(LG && LG.ADAPT && LG.ADAPT[k] && LG.ADAPT[k].get()); } catch (e) { return false; } };
    const chips = LAYERS.map(([k, t]) => `<button type="button" class="btn small page-layer${on(k) ? ' on' : ''}" data-ws-layer="${k}" aria-pressed="${on(k)}">${esc(t)}</button>`).join('');
    return {
      id: 'sewer', eyebrow: 'Labs', name: 'Design a sanitary sewer to an existing Region sewer', status: { tone: 'stage', text: 'Labs' },
      identity: 'Gravity, or pumped where gravity can’t reach · Peel’s Linear Wastewater Standards · the ground from the lidar terrain model',
      top: `<section class="page-livemap sd-page-map" data-psec="livemap"><div class="sd-pbar-host" data-sd-pbar-host></div><div class="page-map-slot sd-map-slot" id="page-map-slot" data-sewer></div><div class="page-layers" role="group" aria-label="Layers on this map">${chips}</div></section>`,
      answer: 'Draw the route on the map, say what the sewer serves, and the tool designs it to the Region’s standards: its sizes, slopes, maintenance holes and depths, checked rule by rule.',
      mid: '<section class="sd-page" data-psec="design" data-sd-phost aria-live="polite"></section>',
      method: `The route as drawn (or found along the roads), the ground every 10 m along it from the lidar terrain model (not a survey), and the existing sewer's invert as the Region publishes it. Maintenance holes at each bend and at most the spacing apart; the least-excavation slopes and sizes that meet the rules; crossings with the Region's watermains and the storm sewers. Rules: ${esc(SW() ? SW().SOURCE : 'Peel Linear Wastewater Standards')}. Utilities, soils and groundwater are not considered.`,
      sources: 'Region of Peel Wastewater Main and Water Main (open data); the Mississauga, Brampton and Region storm sewers; the Ontario Road Network; the lidar terrain model.',
      onMount: () => renderPage(),
    };
  }
  // The page's map: at the design, else at the open development; the zoom hint follows the zoom.
  let zoomWired = false;
  function fitPage() {
    const m = map(); if (!m) return;
    if (!zoomWired) { zoomWired = true; m.on('zoomend', () => { if (onPage()) { const bar = document.querySelector('#home [data-sd-pbar-host]'); if (bar) bar.innerHTML = pageBarHTML(); } }); }
    const lls = [...S.pts, ...S.branches.flatMap(b => b.pts)];
    if (lls.length > 1) m.fitBounds(lls.map(p => [p.lat, p.lng]), { padding: [30, 30], maxZoom: 18 });
    else { const dev = root.DevScope && root.DevScope.current && root.DevScope.current(); if (dev && dev.lat != null) m.setView([dev.lat, dev.lng], 17); }
  }
  // The page opened: the tool on, keeping the design; the page left: the tool off, the design kept.
  document.addEventListener('peel:page', e => {
    const d = e.detail || {};
    if (d.page === 'sewer') { S.home = true; if (T().active() !== 'sewer') { S.keep = true; toolOn(true); } drawLine(); renderPage(); }
    else if (d.was === 'sewer') { toolOn(false); if (layer) layer.clearLayers(); }
  });
  // The drawing controls on the page are the banner's: their buttons go to the tool as the banner's do.
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('#home [data-sd-pbar-host] [data-ptool-act]');
    if (a && T().active() === 'sewer' && def.onBannerAct) def.onBannerAct(a.getAttribute('data-ptool-act'));
  });
  function onPage() { const W = root.PeelWorkspaces; return !!(W && W.mode && W.mode() === 'home' && W.page() === 'sewer'); }

  const def = T().register('sewer', {
    title: 'Sewer designer', icon: 'sewer', hint: 'tap from the site to an existing sanitary sewer',
    bannerHTML,
    onActivate() { if (S.keep) { S.keep = false; drawLine(); banner(); return; } S.home = onPage(); if (S.d || S.fm) { reset(); S.conn = null; S.branches = []; S.drawing = 0; } S.msg = ''; drawLine(); banner(); },
    onDeactivate() { if (S.drawing) { S.branches.splice(S.drawing - 1, 1); S.drawing = 0; } if (S.home) { if (onPage()) { drawLine(); setTimeout(renderPage, 0); } else if (layer) layer.clearLayers(); return; } if (!(T().hasResult() && T().resultTitle() === 'Sewer design')) clearAll(); },
    onClick(ll) {
      if (S.busy) return;
      if (S.findMode) { findRoute(S.pts[0], { lat: ll.lat, lng: ll.lng }); return; }
      if (!S.drawing && S.conn) { S.conn = null; reset(); S.branches = []; S.pts = []; S.legs = []; S.roadsUsed = false; S.corridor = null; }
      addPoint({ lat: ll.lat, lng: ll.lng });
    },
    onBannerAct(act) {
      if (act === 'sd-undo') { const run = curRun(), n = (run.legs && run.legs.pop()) || 1; for (let k = 0; k < n; k++) run.pts.pop(); if (!S.drawing) { S.conn = null; S.branches = []; } reset(); drawLine(); banner(); }
      if (act === 'sd-roads') { S.roads = !S.roads; S.msg = ''; banner(); }
      if (act === 'sd-find') { S.findMode = !S.findMode; S.msg = ''; banner(); }
      if (act === 'sd-clear') { clearAll(); banner(); }
      if (act === 'sd-cancel') { S.branches.splice(S.drawing - 1, 1); S.drawing = 0; S.msg = ''; drawLine(); banner(); if (S.conn) openResult(); }
      if (act === 'sd-finish') { if (S.drawing) finishBranch(); else finish(); }
    },
  });
  root.PeelSewerDesigner = { page, fitPage, state: () => S, finish, finishBranch, run, clearAll, printSheet, downloadFmCSV, lineView, chainage, bends, checks, csv };
})(typeof window !== 'undefined' ? window : globalThis);
