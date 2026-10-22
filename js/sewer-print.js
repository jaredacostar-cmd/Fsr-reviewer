/* Labs: the Sewer designer's print sheet (PeelSewerPrint). An 11×17 (tabloid, landscape) plan and
 * profile of a designed sewer, drawn at true scale: sheet 1 is the drawing (plan, profile, the rules
 * checked and a title block), sheet 2 the maintenance hole and reach tables and the notes. The plan
 * has no base map: the new sewer, the Region's sanitary sewers around it, a north arrow and a scale
 * bar. Printed through the app's report window (light, "Print / Save as PDF"); print at 100% (no
 * "fit to page") to keep the scales.
 *
 * Pure: pickScale(), chain(), barLength(), planSVG(), profileSVG(), sheetHTML()
 * (tests/sewer-print.test.js).
 */
(function (root) {
  'use strict';
  // Drawing scales (1:n): plan and profile horizontal, profile vertical.
  const SCALES = [200, 250, 500, 1000, 1250, 2000, 2500, 5000, 10000, 20000];
  const VSCALES = [50, 100, 200, 250, 500, 1000];
  // The sheet: 17 × 11 in less 10 mm margins, in mm (431.8 × 279.4 less 20: the page box exactly).
  const SHEET = { w: 411.8, h: 259.4 };
  const e = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const f1 = n => (+n).toFixed(1), f2 = n => (+n).toFixed(2), n0 = n => Math.round(n).toLocaleString('en-CA');
  const r1 = n => Math.round(n * 10) / 10;

  // The smallest scale (largest drawing) at which `metres` fits in `mm` of paper.
  const pickScale = (metres, mm, list = SCALES) => list.find(s => metres * 1000 / s <= mm) || list[list.length - 1];
  // Chainage the way a profile labels it: 0+190.0.
  // (rounded to the 0.1 m shown first, so 999.96 m is 1+000.0, not 0+1000.0)
  const chain = x => { const r = Math.round(x * 10) / 10, k = Math.floor(r / 1000 + 1e-9), m = r - k * 1000; return `${k}+${m.toFixed(1).padStart(5, '0')}`; };
  // A scale bar of a round length about 40–60 mm long on paper.
  const barLength = scale => [5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000].find(m => m * 1000 / scale >= 40) || 2000;

  const sizeText = list => { const u = [...new Set(list)].sort((a, b) => a - b); return u.length > 1 ? `${u[0]}–${u[u.length - 1]} mm` : `${u[0]} mm`; };
  // Local metres (east, north) about an origin.
  const proj = o => { const k = 6371008.8 * Math.PI / 180, c = Math.cos(o.lat * Math.PI / 180); return ll => ({ x: (ll.lng - o.lng) * k * c, y: (ll.lat - o.lat) * k }); };

  /** The plan, at true scale in a box of w × h mm: { svg, scale }. */
  function planSVG(dt, w, h) {
    // (a network: every maintenance hole and reach of dt.plan; else the single line of dt.nodes)
    const pl = dt.plan, lls = pl ? pl.lls : dt.nodes.map(n => n.ll), all = [...dt.pts, ...lls], RR = pl ? pl.reaches : dt.d.reaches;
    const o = { lat: all.reduce((t, p) => t + p.lat, 0) / all.length, lng: all.reduce((t, p) => t + p.lng, 0) / all.length }, P = proj(o);
    const xy = all.map(P), pad = 25;
    const minX = Math.min(...xy.map(p => p.x)) - pad, maxX = Math.max(...xy.map(p => p.x)) + pad, minY = Math.min(...xy.map(p => p.y)) - pad, maxY = Math.max(...xy.map(p => p.y)) + pad;
    const m = 8, scale = SCALES.find(s => (maxX - minX) * 1000 / s <= w - 2 * m && (maxY - minY) * 1000 / s <= h - 2 * m) || SCALES[SCALES.length - 1];
    const k = 1000 / scale, cx = w / 2, cy = h / 2, mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    const X = p => cx + (p.x - mx) * k, Y = p => cy - (p.y - my) * k;
    const at = ll => { const p = P(ll); return [X(p), Y(p)]; };
    const line = arr => arr.map((q, i) => `${i ? 'L' : 'M'}${f1(q[0])},${f1(q[1])}`).join('');
    // The Region's sewers around the route; the size on the longer ones on paper (at most 14).
    let ex = '', exLbl = '', nLbl = 0;
    for (const mn of dt.mains || []) {
      const q = mn.g.map(([lng, lat]) => at({ lat, lng }));
      ex += `<path d="${line(q)}" class="pl-ex${mn.conn ? ' pl-ex-c' : ''}"/>`;
      const len = q.reduce((t, p, i) => (i ? t + Math.hypot(p[0] - q[i - 1][0], p[1] - q[i - 1][1]) : 0), 0);
      if (mn.d && (mn.conn || len > 28) && nLbl < 14) {
        nLbl++;
        // (the connected sewer's label on its segment farthest from the connection, inside the frame)
        let i = Math.max(1, Math.floor(q.length / 2));
        if (mn.conn && q.length > 1) {
          const c = at(dt.conn), mid = j => [(q[j - 1][0] + q[j][0]) / 2, (q[j - 1][1] + q[j][1]) / 2], inside = p => p[0] > 4 && p[0] < w - 4 && p[1] > 4 && p[1] < h - 4;
          let best = -1; for (let j = 1; j < q.length; j++) { const p = mid(j), dd = Math.hypot(p[0] - c[0], p[1] - c[1]); if (inside(p) && dd > best) { best = dd; i = j; } }
        }
        const a = q[i - 1], b = q[i];
        let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
        exLbl += `<text transform="translate(${f1((a[0] + b[0]) / 2)},${f1((a[1] + b[1]) / 2)}) rotate(${f1(ang)}) translate(0,-1.2)" class="pl-exl" text-anchor="middle">${e(mn.d)} mm sanitary${mn.id ? ` · ${e(mn.id)}` : ''}</text>`;
      }
    }
    const pq = lls.map(at);
    let mh = '', lbl = '';
    pq.forEach((p, i) => { mh += `<circle cx="${f1(p[0])}" cy="${f1(p[1])}" r="1.7" class="pl-mh"/><text x="${f1(p[0] + 2.4)}" y="${f1(p[1] - 2.2)}" class="pl-mhl">${pl ? e(pl.labels[i]) : `MH ${i + 1}`}</text>`; });
    RR.forEach(r => {
      const a = pq[r.from], b = pq[r.to];
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 14) return;
      let ang = Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI; if (ang > 90) ang -= 180; if (ang < -90) ang += 180;
      lbl += `<text transform="translate(${f1((a[0] + b[0]) / 2)},${f1((a[1] + b[1]) / 2)}) rotate(${f1(ang)}) translate(0,3.4)" class="pl-rl" text-anchor="middle">${r1(r.L)} m · ${r.dmm || dt.d.dmm} mm @ ${(r.S * 100).toFixed(2)}%</text>`;
    });
    // The start and connection tags: above the point, on whichever side keeps them inside the frame
    // (≈1.3 mm a character).
    const tag = (p, t, side) => {
      const tw = t.length * 1.3, right = side > 0 ? p[0] + 2.4 + tw <= w - 2 : p[0] - 2.4 - tw < 2;
      const y = p[1] - 4.5 < 6 ? p[1] + 5 : p[1] - 4.5;   // above (the reach labels sit below the line)
      return `<text x="${f1(right ? p[0] + 2.4 : p[0] - 2.4)}" y="${f1(y)}" class="pl-tag"${right ? '' : ' text-anchor="end"'}>${e(t)}</text>`;
    };
    const connP = pl ? at(dt.conn) : pq[pq.length - 1];
    const tags = tag(pq[0], 'Start (site)', -1) + (pl ? pl.branches.map((b, k) => tag(at(b), `Branch ${k + 2}`, -1)).join('') : '') + tag(connP, `Connection: ${dt.conn.existingMH ? 'existing MH' : 'new MH on the pipe'}, ${dt.conn.dmm} mm, invert ${f2(dt.conn.invert)}`, 1);
    // North arrow (top right) and a scale bar (bottom left).
    const na = `<g transform="translate(${f1(w - 12)},14)"><path d="M0,-8L3.2,4L0,2L-3.2,4Z" class="pl-na"/><text x="0" y="9.5" class="pl-nat" text-anchor="middle">N</text></g>`;
    const bl = barLength(scale), bmm = bl * k;
    let bar = `<g transform="translate(8,${f1(h - 9)})">`;
    for (let i = 0; i < 4; i++) bar += `<rect x="${f1(i * bmm / 4)}" y="0" width="${f1(bmm / 4)}" height="1.6" class="${i % 2 ? 'pl-b1' : 'pl-b0'}"/>`;
    bar += `<text x="0" y="5" class="pl-bt">0</text><text x="${f1(bmm / 2)}" y="5" class="pl-bt" text-anchor="middle">${bl / 2}</text><text x="${f1(bmm)}" y="5" class="pl-bt" text-anchor="middle">${bl} m</text><text x="${f1(bmm + 6)}" y="1.8" class="pl-bt">Plan 1:${n0(scale)}</text></g>`;
    const svg = `<svg class="pl" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" role="img" aria-label="Plan of the sewer at 1:${scale}"><defs><clipPath id="pl-clip"><rect x="0" y="0" width="${w}" height="${h}"/></clipPath></defs>`
      + `<rect x="0" y="0" width="${w}" height="${h}" class="pl-frame"/><g clip-path="url(#pl-clip)">${ex}${exLbl}${pl ? RR.map(r => `<path d="${line([pq[r.from], pq[r.to]])}" class="pl-new"/>`).join('') : `<path d="${line(pq)}" class="pl-new"/>`}${mh}${lbl}${tags}</g>${na}${bar}</svg>`;
    return { svg, scale };
  }

  /** The profile, at true scales in a box of w × h mm, with the chainage, ground and invert band:
   * { svg, hs, vs }. */
  function profileSVG(dt, w, h) {
    const d = dt.view || dt.d, G = dt.ground, nodes = dt.nodes, Lt = nodes[nodes.length - 1].x;
    const left = 20, right = 4, top = 6, band = 34, dw = w - left - right, dh = h - top - band;
    const zs = [...G.map(s => s.g), ...d.mhs.flatMap(m => [m.inv_in, m.inv_out]).filter(z => z != null), dt.conn.invert];
    const zTop = Math.ceil(Math.max(...G.map(s => s.g)) + 0.5), zBot = Math.floor(Math.min(...zs) - 0.5);
    const hs = pickScale(Lt, dw), vs = pickScale(zTop - zBot, dh, VSCALES);
    const X = x => left + x * 1000 / hs, Y = z => top + (zTop - z) * 1000 / vs, zMin = zTop - dh * vs / 1000;
    const p = arr => arr.map(([x, z], i) => `${i ? 'L' : 'M'}${f1(X(x))},${f1(Y(z))}`).join('');
    // Grid: elevations every 0.5, 1, 2 or 5 m; chainage every 10, 20, 50 or 100 m.
    const zStep = [0.5, 1, 2, 5, 10].find(s => s * 1000 / vs >= 6) || 10, xStep = [10, 20, 50, 100, 200, 500].find(s => s * 1000 / hs >= 12) || 500;
    let grid = '';
    for (let z = Math.ceil(zMin / zStep) * zStep; z <= zTop + 1e-9; z += zStep) grid += `<line x1="${left}" x2="${f1(X(Lt))}" y1="${f1(Y(z))}" y2="${f1(Y(z))}" class="pp-grid"/><text x="${left - 1.5}" y="${f1(Y(z) + 0.9)}" class="pp-ax" text-anchor="end">${+z.toFixed(1)}</text>`;
    for (let x = 0; x <= Lt + 1e-6; x += xStep) grid += `<line x1="${f1(X(x))}" x2="${f1(X(x))}" y1="${top}" y2="${f1(top + dh)}" class="pp-grid"/>`;
    const ground = `<path d="${p(G.map(s => [s.x, s.g]))}" class="pp-ground"/>`, cover = `<path d="${p(G.map(s => [s.x, s.g - d.cover]))}" class="pp-cover"/>`;
    let pipe = '', rl = '';
    d.reaches.forEach(r => {
      const a = nodes[r.from].x, b = nodes[r.to].x, Dr = (r.dmm || d.dmm) / 1000;
      pipe += `<path d="M${f1(X(a))},${f1(Y(r.inv_up + Dr))}L${f1(X(b))},${f1(Y(r.inv_dn + Dr))}L${f1(X(b))},${f1(Y(r.inv_dn))}L${f1(X(a))},${f1(Y(r.inv_up))}Z" class="pp-pipe"/>`;
      if (X(b) - X(a) < 30) return;
      const xm = (a + b) / 2, gm = G.reduce((best, s) => Math.abs(s.x - xm) < Math.abs(best.x - xm) ? s : best, G[0]).g, ob = (r.inv_up + r.inv_dn) / 2 + Dr;
      rl += `<text x="${f1(X(xm))}" y="${f1((Y(gm) + Y(ob)) / 2 + 1)}" class="pp-rl" text-anchor="middle">${r1(r.L)} m of ${r.dmm || d.dmm} mm @ ${(r.S * 100).toFixed(2)}%</text>`;
    });
    let mh = '', bandT = '';
    const rows = [['Chainage', m => chain(m.x)], ['Ground', m => f2(m.g)], ['Invert in', m => m.inv_in == null ? '–' : f2(m.inv_in)], ['Invert out', m => m.inv_out == null ? '–' : f2(m.inv_out)]];
    const rowH = band / rows.length, by = top + dh;
    d.mhs.forEach((m, i) => {
      const x = X(m.x), lo = Math.min(...[m.inv_in, m.inv_out].filter(z => z != null));
      mh += `<rect x="${f1(x - 0.6)}" y="${f1(Y(m.g))}" width="1.2" height="${f1(Y(lo) - Y(m.g))}" class="pp-mh${m.structure ? ' pp-drop' : ''}"/><text x="${f1(x)}" y="${f1(Y(m.g) - 1.5)}" class="pp-mhl" text-anchor="middle">MH ${m.num || i + 1}</text>`;
      rows.forEach(([, fn], ri) => { bandT += `<text transform="translate(${f1(x + 0.8)},${f1(by + (ri + 1) * rowH - 1.2)}) rotate(-90)" class="pp-bv">${fn(m)}</text>`; });
    });
    rows.forEach(([t], ri) => { bandT += `<line x1="0" x2="${f1(X(Lt))}" y1="${f1(by + ri * rowH)}" y2="${f1(by + ri * rowH)}" class="pp-bl"/><text x="1" y="${f1(by + ri * rowH + rowH / 2 + 0.9)}" class="pp-bh">${t}</text>`; });
    const exR = Math.max(0.8, dt.conn.dmm / 2 / vs), ex = `<circle cx="${f1(X(Lt))}" cy="${f1(Y(dt.conn.invert + dt.conn.dmm / 2000))}" r="${f1(exR)}" class="pp-ex"/>`;
    const svg = `<svg class="pp" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}" role="img" aria-label="Profile of the sewer, horizontal 1:${hs}, vertical 1:${vs}">`
      + `<rect x="0" y="0" width="${w}" height="${h}" class="pl-frame"/>${grid}${cover}${ground}${pipe}${mh}${ex}${rl}${bandT}`
      + `<text x="${f1(w - right)}" y="${top + 3.5}" class="pp-ax" text-anchor="end">Profile · horizontal 1:${n0(hs)} · vertical 1:${n0(vs)} · elevations m (CGVD2013)</text><text x="${left + 1}" y="${f1(top + dh - 1.5)}" class="pp-ax">${sizeText(d.reaches.map(r => r.dmm || d.dmm))} pipe · ${d.cover} m cover line (dashed)${dt.view && dt.plan && dt.plan.branches.length ? ' · the main line' : ''}</text></svg>`;
    return { svg, hs, vs };
  }

  /** Both sheets as the report body, and the stylesheet that goes with them. */
  function sheetHTML(dt) {
    const d = dt.d, left = 300, gap = 5, right = r1(SHEET.w - left - gap);
    const plan = planSVG(dt, left, 138), prof = profileSVG(dt, left, r1(SHEET.h - 138 - gap));
    // (the deepest along the reaches, not only at the maintenance holes: PeelSewerDesign.deepest())
    const deepest = dt.deepest ? dt.deepest.depth : Math.max(...d.mhs.map(m => m.depth)), sl = d.reaches.map(r => r.S * 100), sz = sizeText(d.reaches.map(r => r.dmm || d.dmm)), Ltot = d.reaches.reduce((t, r) => t + r.L, 0), nb = dt.plan ? dt.plan.branches.length : 0;
    // Room downstream (the designer's downstream()): the pipe it joins and the tightest to the plant.
    const dn = dt.down && dt.down.res, pc = x => (x == null ? '–' : `${Math.round(x * 100)}%`);
    const downTxt = dn ? `<h2>Room downstream (${e(dt.down.yearLabel)})</h2><p class="small">The ${n0(dn.recv.dmm)} mm sewer it ${dt.down.big ? 'joins' : 'reaches (the nearest of 300 mm or more)'}: ${pc(dn.recv.r0)} → <b>${pc(dn.recv.r1)}</b> full.${dn.tight && dn.tight !== dn.recv ? ` The tightest down to the plant: ${n0(dn.tight.dmm)} mm, ${(dn.tight.dist / 1000).toFixed(1)} km down, ${pc(dn.tight.r0)} → <b>${pc(dn.tight.r1)}</b>.` : ''}${dn.over.length ? ` <b>${dn.over.length} pipe${dn.over.length === 1 ? '' : 's'} go${dn.over.length === 1 ? 'es' : ''} over 100%.</b>` : ''} The design flow added in full to each Region pipe of 300 mm or more down to the plant, on every load (census, built, approved, proposed); a screen, not a hydraulic model.</p>` : '';
    const slTxt = f2(Math.min(...sl)) === f2(Math.max(...sl)) ? `${f2(sl[0])}%` : `${f2(Math.min(...sl))}–${f2(Math.max(...sl))}%`;
    const checks = (dt.checks || []).map(c => `<li class="${c.pass ? 'ok' : 'no'}"><b>${c.pass ? '✓' : '✗'}</b> ${e(c.t)}: ${e(c.val)}</li>`).join('');
    // (with branches the lines' flows can be part typed, part from population, jobs and area: the total
    // at the connection, as the designer's panel gives it)
    const flowTxt = nb ? `${f1(d.q)} L/s at the connection` : dt.flow && !dt.flow.typed && dt.flow.peak != null ? `${f1(d.q)} L/s (${f1(dt.flow.peak)} L/s peak dry + ${f1(dt.flow.ii)} L/s I&amp;I)` : `${f1(d.q)} L/s (typed)`;
    const tb = `<div class="tb">
      <div class="tb-prelim">PRELIMINARY · NOT FOR CONSTRUCTION</div>
      <div class="tb-t">Preliminary sanitary sewer<br>Plan and profile</div>
      <dl>
        <dt>Location</dt><dd>${e(dt.where)}</dd>
        <dt>Connection</dt><dd>${e(dt.conn.dmm)} mm sanitary sewer${dt.conn.id ? ` ${e(dt.conn.id)}` : ''}, invert ${f2(dt.conn.invert)} m (${dt.conn.existingMH ? 'existing maintenance hole' : 'new maintenance hole on the pipe'})</dd>
        <dt>Design flow</dt><dd>${flowTxt}</dd>
        <dt>Sewer</dt><dd>${sz} at ${slTxt}${nb ? `, the main line and ${nb} branch${nb === 1 ? '' : 'es'}` : ''}, ${n0(d.mhs.length)} maintenance holes, ${n0(Ltot)} m; ${f1(d.mhs[0].depth)} m deep at the start, ${f1(deepest)} m at the deepest${d.structures ? `; ${d.structures} drop structure${d.structures === 1 ? '' : 's'}` : ''}</dd>
        <dt>Scales</dt><dd>Plan 1:${n0(plan.scale)} · profile 1:${n0(prof.hs)} H, 1:${n0(prof.vs)} V, on 11×17 at 100%</dd>
        <dt>Ground</dt><dd>${e(dt.groundLabel || 'Terrain model')} (not a survey)</dd>
        <dt>Sewers</dt><dd>Region of Peel sanitary mains (open data), read ${e(dt.date)}</dd>
        <dt>Rules</dt><dd>${e(dt.source)}</dd>
      </dl>
      <p class="tb-note">${e(dt.note)}</p>
      <div class="tb-foot"><span>${e(dt.date)}</span><span>Sheet 1 of 2</span></div>
      <div class="tb-app">${e(dt.unofficial)} · Labs · v${e(dt.version)}</div>
    </div>`;
    const k = (cls, extra = '') => `<svg width="10mm" height="3mm" viewBox="0 0 10 3" aria-hidden="true"><line x1="0" x2="10" y1="1.5" y2="1.5" class="${cls}"${extra}/></svg>`;
    const legend = `<ul class="lg"><li>${k('pl-new')} The new sewer (${sz})</li><li>${k('pl-ex pl-ex-c')} The existing sanitary sewer it connects to</li><li>${k('pl-ex')} Other Region sanitary sewers</li>`
      + `<li><svg width="10mm" height="3mm" viewBox="0 0 10 3" aria-hidden="true"><circle cx="5" cy="1.5" r="1.2" class="pl-mh"/></svg> Maintenance hole (numbered from the start)</li><li>${k('pp-ground')} Ground (profile)</li><li>${k('pp-cover')} ${d.cover} m cover line (profile)</li>`
      + `<li><svg width="10mm" height="3mm" viewBox="0 0 10 3" aria-hidden="true"><rect x="4.4" y="0" width="1.2" height="3" class="pp-mh pp-drop"/></svg> Drop structure (dashed maintenance hole)</li></ul>`;
    const summary = `<p>A <b>${sz}</b> sewer${nb ? ` (the main line and ${nb} branch${nb === 1 ? '' : 'es'})` : ''} at ${slTxt}, ${n0(d.mhs.length)} maintenance holes, ${f1(d.mhs[0].depth)} m deep at the start and ${f1(deepest)} m at the deepest, for ${flowTxt}: the least excavation the rules allow${d.slopes ? ` within ${f2(d.slopes[0] * 100)}–${f2(d.slopes[1] * 100)}% (the slopes chosen)` : ''}.</p>`;
    const sheet1 = `<section class="sheet s1"><div class="s-left">${plan.svg}${prof.svg}</div><div class="s-right" style="width:${right}mm"><h2>Design</h2>${summary}<h2>Legend</h2>${legend}<h2>Rules checked</h2><ul class="chk">${checks}</ul>${downTxt}${dt.froudeHi ? `<p class="small">${dt.froudeHi} reach${dt.froudeHi === 1 ? '' : 'es'} with supercritical flow (Froude 1 or more): the standard asks for subcritical flow where possible (s. 2.9.1).</p>` : ''}${tb}</div></section>`;
    const mhRows = d.mhs.map((m, i) => `<tr><td>${m.label ? e(m.label) : `MH ${i + 1}${i === d.mhs.length - 1 ? ' (connection)' : i === 0 ? ' (start)' : ''}`}</td><td class="n">${m.run ? `branch ${m.run + 1} ` : ''}${chain(m.x)}</td><td class="n">${f2(m.g)}</td><td class="n">${m.ins && m.ins.length > 1 ? m.ins.map(x => f2(x.inv)).join(' / ') : m.inv_in == null ? '–' : f2(m.inv_in)}</td><td class="n">${m.inv_out == null ? '–' : f2(m.inv_out)}</td><td class="n">${f2(m.depth)}</td><td class="n">${m.drop ? f2(m.drop) : '–'}</td><td>${m.structure ? 'drop structure' : ''}</td></tr>`).join('');
    const rRows = d.reaches.map(r => `<tr><td>MH ${r.from + 1} → MH ${r.to + 1}</td><td class="n">${r.dmm || d.dmm}</td><td class="n">${f1(r.q != null ? r.q : d.q)}</td><td class="n">${f1(r.L)}</td><td class="n">${(r.S * 100).toFixed(2)}</td><td class="n">${f2(r.inv_up)}</td><td class="n">${f2(r.inv_dn)}</td><td class="n">${f1(r.qFull)}</td><td class="n">${r.qRatio.toFixed(2)}</td><td class="n">${f2(r.v)}</td><td class="n">${f2(r.vFull)}</td><td class="n">${r.depthRatio.toFixed(2)}</td><td class="n">${r.froude.toFixed(2)}</td></tr>`).join('');
    const sheet2 = `<section class="sheet s2"><h2>Maintenance holes</h2><table><thead><tr><th>MH</th><th class="n">Chainage</th><th class="n">Ground (m)</th><th class="n">Invert in (m)</th><th class="n">Invert out (m)</th><th class="n">Depth to invert (m)</th><th class="n">Drop (m)</th><th></th></tr></thead><tbody>${mhRows}</tbody></table>
      <h2>Reaches</h2><table><thead><tr><th>Reach</th><th class="n">Diameter (mm)</th><th class="n">Flow (L/s)</th><th class="n">Length (m)</th><th class="n">Slope (%)</th><th class="n">Invert up (m)</th><th class="n">Invert down (m)</th><th class="n">Full flow (L/s)</th><th class="n">Flow ratio</th><th class="n">V design (m/s)</th><th class="n">V full (m/s)</th><th class="n">Depth ratio</th><th class="n">Froude</th></tr></thead><tbody>${rRows}</tbody></table>
      ${dt.xings ? `<h2>Crossings</h2>${dt.xings.length ? `<table><thead><tr><th>#</th><th>Where</th><th>Crosses</th><th class="n">New sewer obvert / invert (m)</th><th class="n">Other pipe top / bottom (m)</th><th class="n">Clearance (0.5 m)</th></tr></thead><tbody>${dt.xings.map((x, i) => `<tr><td>${i + 1}</td><td>MH ${d.reaches[x.reach].from + 1} → MH ${d.reaches[x.reach].to + 1}, ${n0(x.along)} m</td><td>${x.kind === 'water' ? 'Watermain' : 'Storm sewer'}${x.d ? ` ${x.d} mm` : ''} (${e(x.src)})</td><td class="n">${f2(x.obvert)} / ${f2(x.invert)}</td><td class="n">${x.kind === 'water' ? `${f2(x.otherTop)} / ${f2(x.otherBottom)} (assumed)` : '–'}</td><td class="n">${x.kind === 'water' ? `${f2(x.clear)} m ${x.ok ? '✓' : '✗'}` : 'check on site'}</td></tr>`).join('')}</tbody></table>` : '<p class="small">No watermain or storm sewer crossed.</p>'}<p class="small">s. 3.4.2.1: 0.5 m vertical clearance. Watermains taken at Peel's minimum cover (top 1.7 m below the ground); storm sewer depths not published (check on site); pipe walls not counted.</p>` : ''}
      <h2>Notes</h2><ul class="notes">
        <li>A preliminary design for screening: the route as drawn, the least excavation the rules allow, each reach the smallest size that carries its flow (never smaller than a pipe flowing into it). Not a detailed design and not for construction.</li>
        <li>Ground from ${e(dt.groundLabel || 'the terrain model')}, not a survey; cover is measured from the ground along the line, not the road centreline (s. 3.4.1.1). The existing sewer's invert and size are as the Region publishes them.</li>
        <li>Design: Manning's n 0.013; 0.75 m/s or more at the design flow; 3.0 m/s or less flowing full; design flow 0.7 of full flow or less; the last leg 1.00% or more;${d.slopes ? ` every slope within ${f2(d.slopes[0] * 100)}–${f2(d.slopes[1] * 100)}% (the range chosen: where 0.75 m/s needs more, the reach is held at the steepest and the velocity check fails);` : ''} ${e(d.cover)} m of cover over the pipe; trench 8.0 m or less (0.15 m bedding); maintenance holes 200 m apart or less (190 m from 600 mm); drops 0.03–0.20 m, or a drop structure from 0.9 m; the new obvert at or above the existing one.</li>
        <li>Not considered: utilities other than the watermains and storm sewers crossed, soils, groundwater, easements, construction method, lands external to the site (s. 3.4.1.1).</li>
        <li>Drawn without a base map. Print at 100% (no "fit to page") on 11×17 landscape to keep the scales; the scale bar holds at any size.</li>
      </ul>
      <p class="tb-note">${e(dt.note)}</p>
      <div class="tb-foot"><span>${e(dt.where)} · ${e(dt.date)}</span><span>Sheet 2 of 2</span></div></section>`;
    return { body: sheet1 + sheet2, css: CSS, plan, prof };
  }

  // The sheet's stylesheet: the app's light tokens (the report window loads css/app.css).
  const CSS = `@page{size:17in 11in;margin:10mm}html,body{margin:0;height:auto;overflow:visible;display:block;background:var(--surface-1);color:var(--text-primary);font:9px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif}
    .noprint{margin:8px}@media print{.noprint{display:none}}@media screen{body{background:var(--surface-2)}.sheet{margin:8px auto;box-shadow:0 1px 4px var(--border)}}
    .sheet{flex:none;width:${SHEET.w}mm;height:${SHEET.h}mm;box-sizing:border-box;background:var(--surface-1);overflow:hidden;page-break-after:always;break-after:page}.sheet:last-child{page-break-after:auto;break-after:auto}
    .s1{display:flex;gap:5mm}.s-left{display:flex;flex-direction:column;gap:5mm}.s-right{display:flex;flex-direction:column;gap:3mm;min-width:0}
    .s2{padding:2mm 0;display:flex;flex-direction:column}.s2 table{width:auto;min-width:220mm}.s2 th,.s2 td{padding:1px 8px}.s2 .tb-foot{margin-top:auto}.s2 ul.notes{max-width:300mm}h2{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:var(--text-secondary);margin:2mm 0 1mm;border-bottom:1px solid var(--border);padding-bottom:.5mm}
    table{border-collapse:collapse;width:100%;font-size:8.5px}th,td{border-bottom:1px solid var(--border);padding:1px 4px;text-align:left}th{color:var(--text-secondary);font-weight:600}td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
    ul.chk{list-style:none;margin:0;padding:0;display:grid;gap:1px}ul.chk li b{display:inline-block;width:10px}ul.chk li.ok b{color:var(--cap-room)}ul.chk li.no b{color:var(--cap-over)}ul.notes{margin:0;padding-left:14px}ul.notes li{margin:1px 0}ul.lg{list-style:none;margin:0;padding:0;display:grid;gap:.6mm}ul.lg li{display:flex;align-items:center;gap:2mm}.s-right p{margin:0}
    .small{font-size:8.5px;color:var(--text-secondary)}
    .tb{margin-top:auto;border:.5mm solid var(--text-primary);padding:2mm 2.5mm;display:flex;flex-direction:column;gap:1.5mm}
    .tb-prelim{font-weight:800;letter-spacing:.04em;color:var(--cap-over);font-size:10px}.tb-t{font-size:13px;font-weight:700;line-height:1.2}
    .tb dl{display:grid;grid-template-columns:auto 1fr;gap:.6mm 2.5mm;margin:0}.tb dt{color:var(--text-secondary);font-weight:600}.tb dd{margin:0}
    .tb-note{font-size:8.5px;color:var(--text-secondary);margin:0}.tb-foot{display:flex;justify-content:space-between;font-weight:600;border-top:1px solid var(--border);padding-top:1mm}.tb-app{font-size:7.5px;color:var(--text-muted)}
    svg.pl,svg.pp{flex:none;display:block;max-width:none}svg text{font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
    .pl-frame{fill:none;stroke:var(--text-primary);stroke-width:.35}
    .pl-ex{fill:none;stroke:var(--text-muted);stroke-width:.35}.pl-ex-c{stroke:var(--text-secondary);stroke-width:.6}.pl-exl{font-size:2.1px;fill:var(--text-secondary)}
    .pl-new{fill:none;stroke:var(--pipe-sanitary);stroke-width:.9;stroke-linejoin:round}.pl-mh{fill:var(--surface-1);stroke:var(--text-primary);stroke-width:.35}
    .pl-mhl{font-size:2.4px;font-weight:700;fill:var(--text-primary)}.pl-rl{font-size:2.3px;fill:var(--text-primary)}.pl-tag{font-size:2.4px;font-weight:600;fill:var(--text-primary)}
    .pl-na{fill:var(--text-primary)}.pl-nat{font-size:3px;font-weight:700;fill:var(--text-primary)}.pl-b0{fill:var(--text-primary)}.pl-b1{fill:var(--surface-1);stroke:var(--text-primary);stroke-width:.25}.pl-bt{font-size:2.2px;fill:var(--text-primary)}
    .pp-grid{stroke:var(--border);stroke-width:.15}.pp-ax{font-size:2.2px;fill:var(--text-secondary)}.pp-ground{fill:none;stroke:var(--text-primary);stroke-width:.4}.pp-cover{fill:none;stroke:var(--text-muted);stroke-width:.25;stroke-dasharray:1.2 1}
    .pp-pipe{fill:var(--pipe-sanitary);fill-opacity:.55;stroke:var(--pipe-sanitary);stroke-width:.25}.pp-mh{fill:var(--surface-1);stroke:var(--text-primary);stroke-width:.25}.pp-drop{stroke-dasharray:.8 .5}
    .pp-mhl{font-size:2.2px;font-weight:700;fill:var(--text-primary)}.pp-rl{font-size:2.1px;fill:var(--text-primary)}.pp-ex{fill:none;stroke:var(--pipe-sanitary);stroke-width:.4}
    .pp-bl{stroke:var(--text-muted);stroke-width:.2}.pp-bh{font-size:2.1px;font-weight:600;fill:var(--text-secondary)}.pp-bv{font-size:2px;fill:var(--text-primary)}`;

  const api = { SCALES, VSCALES, SHEET, pickScale, chain, barLength, planSVG, profileSVG, sheetHTML };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  /** Open the sheets in the report window (Print / Save as PDF). */
  api.open = dt => {
    const s = sheetHTML(dt), R = root.PeelReports;
    if (R && R.openReport) R.openReport(`Sewer plan and profile – ${dt.where}`, s.body, { css: s.css });
  };
  root.PeelSewerPrint = api;
})(typeof window !== 'undefined' ? window : globalThis);
