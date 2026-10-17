/* Labs: the Sewer designer (PeelSewerDesigner), a tool on the map's rail. Draw a gravity sanitary
 * sewer from a site to an existing Region sewer: the last tap snaps to the sewer (its maintenance
 * hole when one is within 15 m, else a new maintenance hole on the pipe). Type the design flow
 * (L/s, or population / jobs / area at Peel criteria); the tool places the maintenance holes, reads
 * the ground along the line from the lidar terrain model and designs the least-excavation sewer to
 * Peel's Linear Wastewater Standards (js/sewer-design.js). The result: the plan on the map, the
 * profile, every reach and maintenance hole in a table, the rules checked, and a CSV.
 *
 * Pure: chainage(), bends(), checks(), csv() (tests/sewer-designer.test.js). The 11×17 print sheet:
 * js/sewer-print.js.
 */
(function (root) {
  'use strict';
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
  // A point at chainage x along the line.
  function pointAt(pts, xs, x) {
    for (let i = 1; i < pts.length; i++) if (x <= xs[i] + 1e-9) { const t = (x - xs[i - 1]) / ((xs[i] - xs[i - 1]) || 1); return { lat: pts[i - 1].lat + (pts[i].lat - pts[i - 1].lat) * t, lng: pts[i - 1].lng + (pts[i].lng - pts[i - 1].lng) * t }; }
    return pts[pts.length - 1];
  }
  // The rules checked on a design (Linear Wastewater Standards): [{ t, pass, val }], for the panel and
  // the print sheet.
  function checks(d, route, conn) {
    const f2 = v => (+v).toFixed(2), n0 = v => Math.round(v).toLocaleString('en-CA');
    const deepest = Math.max(...d.mhs.map(m => m.depth)), vmin = Math.min(...d.reaches.map(r => r.v)), vmax = Math.max(...d.reaches.map(r => r.vFull)), qr = Math.max(...d.reaches.map(r => r.qRatio));
    const last = d.mhs[d.mhs.length - 1], Lmax = Math.max(...d.reaches.map(r => r.L)), sp = d.dmm >= 600 ? 190 : 200;
    const minCover = Math.min(...[...route.nodes, ...route.samples].map(pt => { const r = d.reaches.find(x => route.nodes[x.from].x <= pt.x + 1e-9 && pt.x <= route.nodes[x.to].x + 1e-9); return pt.g - (r.inv_up - r.S * (pt.x - route.nodes[r.from].x)) - d.dmm / 1000; }));
    const c = (t, pass, val) => ({ t, pass, val });
    return [
      c('Pipe size (200 mm minimum, no larger than the existing sewer)', d.dmm >= 200 && d.dmm <= conn.dmm, `${d.dmm} mm into ${conn.dmm} mm`),
      c('Velocity at the design flow (0.75 m/s or more)', vmin >= 0.75 - 1e-6, `${f2(vmin)} m/s at the slowest`),
      c('Velocity flowing full (3.0 m/s or less)', vmax <= 3.0 + 1e-6, `${f2(vmax)} m/s at the fastest`),
      c('Flow ratio, design flow to full flow (0.7 or less)', qr <= 0.7 + 1e-6, qr.toFixed(2)),
      c('The last leg, at the upstream end (1.00% or more)', d.reaches[0].S >= 0.01 - 1e-9, `${f2(d.reaches[0].S * 100)}%`),
      c(`Cover over the pipe (${d.cover} m or more)`, minCover >= d.cover - 0.01, `${f2(minCover)} m at the least`),
      c('Trench (8.0 m or less)', deepest + 0.15 <= 8.0 + 1e-6, `${f2(deepest + 0.15)} m at the deepest`),
      c(`Maintenance holes (${sp} m apart or less)`, Lmax <= sp, `${n0(Lmax)} m at the longest`),
      c('Drops through the maintenance holes (0.03–0.20 m, or a drop structure from 0.9 m)', d.mhs.slice(1, -1).every(m => m.structure ? m.drop >= 0.9 - 1e-6 : m.drop >= 0.03 - 1e-6 && m.drop <= 0.2 + 1e-6), `${d.structures} drop structure${d.structures === 1 ? '' : 's'}`),
      c('Connection (the new obvert at or above the existing one)', last.inv_in + d.dmm / 1000 >= conn.invert + conn.dmm / 1000 - 1e-6, last.drop ? `${f2(last.drop)} m drop${last.structure ? ' (drop structure)' : ''}` : 'obverts matched'),
    ];
  }
  // The design as CSV: the maintenance holes, then the reaches.
  function csv(d) {
    const f2 = v => (v == null ? '' : (+v).toFixed(2)), lines = ['Maintenance hole,Chainage (m),Ground (m),Invert in (m),Invert out (m),Depth to invert (m),Drop (m),Drop structure'];
    d.mhs.forEach((m, i) => lines.push([`MH ${i + 1}${i === d.mhs.length - 1 ? ' (connection)' : ''}`, f2(m.x), f2(m.g), f2(m.inv_in), f2(m.inv_out), f2(m.depth), f2(m.drop), m.structure ? 'yes' : ''].join(',')));
    lines.push('', 'Reach,Diameter (mm),Length (m),Slope (%),Invert up (m),Invert down (m),Full-flow capacity (L/s),Flow ratio,Velocity at design flow (m/s),Velocity full (m/s),Depth ratio,Froude');
    d.reaches.forEach(r => lines.push([`MH ${r.from + 1} to MH ${r.to + 1}`, d.dmm, f2(r.L), (r.S * 100).toFixed(3), f2(r.inv_up), f2(r.inv_dn), f2(r.qFull), r.qRatio.toFixed(2), f2(r.v), f2(r.vFull), r.depthRatio.toFixed(2), r.froude.toFixed(2)].join(',')));
    lines.push('', `Design flow (L/s),${f2(d.q)}`, `Cover over the pipe (m),${d.cover}`, `Rules,"${d.source}"`, '"General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results."');
    return lines.join('\n');
  }

  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = { metres, chainage, bends, pointAt, checks, csv };
    return;
  }
  // ---- Browser ---------------------------------------------------------------------------------
  const U = root.PeelUtil || {}, esc = U.esc || (s => String(s)), fmtNum = U.fmtNum || (n => String(n));
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), fmt2 = n => (+n).toFixed(2);
  const SW = () => root.PeelSewerDesign, MS = () => root.PeelMeasure, EL = () => root.PeelElevation, T = () => root.PeelTools, L = root.L;
  const NOTE = () => (root.PeelPanel && root.PeelPanel.NOTE) || 'General screening results only. Peel\'s W&amp;WW Infrastructure Planning team must validate or confirm all results.';
  const S = { pts: [], conn: null, route: null, d: null, busy: false, msg: '', form: { q: '', pop: '', jobs: '', ha: '', ici: false, avoid: false, spacing: 190 } };
  let layer = null;
  const map = () => root.PeelMapCore && root.PeelMapCore.map;
  const token = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  function lay() { if (!layer) layer = L.layerGroup().addTo(map()); return layer; }
  function drawLine() {
    const g = lay(); g.clearLayers(); if (!S.pts.length) return;
    const c = token('--pipe-sanitary'), ink = token('--text-primary');
    const ll = S.pts.map(p => [p.lat, p.lng]);
    if (S.conn) ll.push([S.conn.lat, S.conn.lng]);
    L.polyline(ll, { color: c, weight: S.d && S.d.ok ? 5 : 3, dashArray: S.d && S.d.ok ? null : '6 5', interactive: false }).addTo(g);
    S.pts.forEach((p, i) => L.circleMarker([p.lat, p.lng], { radius: 4, color: ink, weight: 2, fill: true, fillColor: c, fillOpacity: 1, interactive: false }).addTo(g).bindTooltip(i ? `${i + 1}` : 'start', { permanent: !S.d, direction: 'top', className: 'pt', offset: [0, -4] }));
    if (S.conn) L.circleMarker([S.conn.lat, S.conn.lng], { radius: 7, color: ink, weight: 2, fill: true, fillColor: c, fillOpacity: 1, interactive: false }).addTo(g).bindTooltip(`Connection: ${S.conn.dmm} mm sewer${S.conn.id ? ` ${esc(S.conn.id)}` : ''} (${S.conn.existingMH ? 'existing maintenance hole' : 'new maintenance hole'})`, { direction: 'top', className: 'pt' });
    // The designed maintenance holes, numbered, with their reach labels.
    if (S.d && S.d.ok && S.route) {
      S.route.nodes.forEach((nd, i) => {
        const p = nd.ll, m = S.d.mhs[i];
        L.circleMarker([p.lat, p.lng], { radius: 6, color: c, weight: 3, fill: true, fillColor: token('--surface-1'), fillOpacity: 1 }).addTo(g)
          .bindTooltip(`<strong>MH ${i + 1}${i === S.route.nodes.length - 1 ? ' (connection)' : ''}</strong><br>ground ${fmt2(m.g)} m · invert ${fmt2(i ? m.inv_in : m.inv_out)} m · depth ${fmt2(m.depth)} m${m.drop ? ` · drop ${fmt2(m.drop)} m${m.structure ? ' (drop structure)' : ''}` : ''}`, { direction: 'top', className: 'pt' });
      });
      S.d.reaches.forEach(r => {
        const a = S.route.nodes[r.from].ll, b = S.route.nodes[r.to].ll;
        L.marker([(a.lat + b.lat) / 2, (a.lng + b.lng) / 2], { interactive: false, keyboard: false, icon: L.divIcon({ className: 'sd-lbl', html: `<span>${S.d.dmm} mm @ ${(r.S * 100).toFixed(2)}%</span>`, iconSize: null }) }).addTo(g);
      });
    }
  }
  const bannerHTML = () => S.busy ? '<strong>Sewer designer</strong> <span class="muted">Reading the sewer and the ground…</span>'
    : `<strong>Sewer designer</strong> <span class="muted">${S.msg ? esc(S.msg) : S.pts.length < 2 ? 'Tap from the site to an existing sanitary sewer; the last tap snaps to it' : `${S.pts.length} points · ${fmtNum(Math.round(chainage(S.pts).pop()))} m · Finish snaps the end to the sewer`}</span>`
      + ` <span class="tb-acts">${S.pts.length ? '<button type="button" class="btn small" data-ptool-act="sd-undo">Undo</button>' : ''}${S.pts.length >= 2 ? '<button type="button" class="btn small primary" data-ptool-act="sd-finish">Finish</button>' : ''}${S.pts.length ? '<button type="button" class="btn small link" data-ptool-act="sd-clear">Clear</button>' : ''}</span>`;
  const banner = () => { if (T().active() === 'sewer') T().banner(bannerHTML()); };

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
      S.conn = { lat: at.lat, lng: at.lng, invert: m.up + (m.dn - m.up) * t, dmm: m.d, id: m.id, existingMH: atUp || atDn, g: m.g };
      // The drawn end moves onto the sewer.
      S.pts[S.pts.length - 1] = { lat: S.conn.lat, lng: S.conn.lng };
      await sample();
      S.d = null;
      openResult();
    } catch (e) { S.msg = `Couldn't read the sewer or the ground (${e && e.message ? e.message : 'no data'})`; }
    finally { S.busy = false; banner(); drawLine(); }
  }
  // The ground every 10 m along the line and at each vertex (lidar, else the terrain tiles).
  async function sample() {
    const xs = chainage(S.pts), Lt = xs[xs.length - 1], N = Math.max(2, Math.ceil(Lt / 10)), at = [];
    for (let k = 0; k <= N; k++) at.push(Lt * k / N);
    for (const x of xs) if (!at.some(a => Math.abs(a - x) < 0.5)) at.push(x);
    at.sort((a, b) => a - b);
    const lls = at.map(x => pointAt(S.pts, xs, x)), gs = await EL().getGroundMany(lls);
    if (gs.some(r => !r || r.z == null)) throw new Error('no ground elevation along part of the line');
    S.ground = at.map((x, i) => ({ x, g: gs[i].z, ll: lls[i] }));
    S.groundLabel = gs[0].label || '';
    S.xs = xs;
  }
  const gAt = x => { const G = S.ground; for (let i = 1; i < G.length; i++) if (x <= G[i].x + 1e-9) { const t = (x - G[i - 1].x) / ((G[i].x - G[i - 1].x) || 1); return G[i - 1].g + (G[i].g - G[i - 1].g) * t; } return G[G.length - 1].g; };
  function run() {
    const f = S.form, flow = SW().flowFrom({ q: f.q, pop: +f.pop || 0, jobs: +f.jobs || 0, ha: +f.ha || 0 });
    if (!(flow.q > 0)) { S.d = null; S.formMsg = 'Type a design flow, or the population, jobs and area it serves.'; return openResult(); }
    S.formMsg = '';
    const spacing = Math.min(200, Math.max(20, +f.spacing || 190)), bnd = bends(S.pts);
    const mhX = SW().placeMHs(S.xs, spacing);
    const nodes = mhX.map(x => { const vi = S.xs.findIndex(v => Math.abs(v - x) < 0.01); return { x, g: gAt(x), bend: vi >= 0 ? bnd[vi] : 0, ll: pointAt(S.pts, S.xs, x) }; });
    S.route = { nodes, samples: S.ground.filter(s => !mhX.some(x => Math.abs(x - s.x) < 0.01)).map(({ x, g }) => ({ x, g })) };
    S.d = SW().design(S.route, S.conn, flow.q, { ici: f.ici, avoidStructures: f.avoid });
    S.flow = flow;
    openResult(); drawLine();
  }

  // ---- The result: the form, the verdict, the profile, the tables, the checks ----------------------
  function openResult() {
    T().openResult({ ref: 'tool:sewer-design', title: 'Sewer design', html: resultHTML(), reopen: () => openResult() });
  }
  function formHTML() {
    const f = S.form, v = k => esc(f[k] == null ? '' : f[k]);
    return `<form class="sd-form" data-sd-form onsubmit="return false">
      <p class="small"><strong>Design flow</strong> <span class="muted">— type the peak wet weather flow, or what the sewer serves (Peel criteria: 290 L/cap/d, 270 L/job/d, Harmon 2–4, I&amp;I 0.26 L/s/ha)</span></p>
      <div class="sd-row"><label class="field"><span class="label">Flow (L/s)</span><input type="number" min="0" step="0.1" data-sd="q" value="${v('q')}"></label><span class="muted small">or</span>
      <label class="field"><span class="label">Population</span><input type="number" min="0" step="1" data-sd="pop" value="${v('pop')}"></label><label class="field"><span class="label">Jobs</span><input type="number" min="0" step="1" data-sd="jobs" value="${v('jobs')}"></label><label class="field"><span class="label">Area (ha)</span><input type="number" min="0" step="0.1" data-sd="ha" value="${v('ha')}"></label></div>
      <div class="sd-row"><label class="field"><span class="label">Maintenance holes at most (m apart)</span><input type="number" min="20" max="200" step="5" data-sd="spacing" value="${v('spacing')}"></label>
      <label class="chk"><input type="checkbox" data-sd="ici"${f.ici ? ' checked' : ''}> Industrial / commercial (3.5 m of cover, else 2.5 m)</label>
      <label class="chk"><input type="checkbox" data-sd="avoid"${f.avoid ? ' checked' : ''}> Avoid drop structures</label></div>
      <p><button type="button" class="btn small primary" data-sd-act="design">Design</button> <button type="button" class="btn small" data-sd-act="edit">Edit the route</button> <button type="button" class="btn small link" data-sd-act="clear">Clear</button></p>
      ${S.formMsg ? `<p class="small t-tight">${esc(S.formMsg)}</p>` : ''}</form>`;
  }
  function resultHTML() {
    const c = S.conn, Lt = S.xs ? S.xs[S.xs.length - 1] : 0;
    const head = `<p class="small">From the drawn start to the <strong>${fmtNum(c.dmm)} mm sanitary sewer${c.id ? ` ${esc(c.id)}` : ''}</strong> (invert ${fmt2(c.invert)} m; ${c.existingMH ? 'its existing maintenance hole' : 'a new maintenance hole on the pipe'}) · <strong>${fmtNum(Math.round(Lt))} m</strong> along the drawn route · ground ${fmt1(Math.max(...S.ground.map(s => s.g)))}–${fmt1(Math.min(...S.ground.map(s => s.g)))} m.</p>`;
    let body = '';
    if (S.d && S.d.ok) body = designHTML(S.d);
    else if (S.d) body = `<p><span class="pnl-chip t-over">No gravity design</span> ${esc(S.d.why)}.</p>${profileSVG(null)}`;
    else body = profileSVG(null);
    return `<div class="sd-res">${head}${formHTML()}${body}<p class="small muted">A preliminary design for screening: the route as drawn, the ground from ${esc(S.groundLabel || 'the terrain model')} (not a survey), the existing sewer as the Region publishes it. Rules: ${esc(SW().SOURCE)}. Utilities, other services, soils and groundwater are not considered.</p><p class="pnl-note small">${NOTE()}</p></div>`;
  }
  function designHTML(d) {
    const deepest = Math.max(...d.mhs.map(m => m.depth)), s = d.reaches.map(r => r.S * 100);
    const ok = c => `<li class="${c.pass ? 'sd-ok' : 'sd-no'}"><span aria-hidden="true">${c.pass ? '✓' : '✗'}</span> ${esc(c.t)}: <strong>${esc(c.val)}</strong></li>`;
    const checkList = checks(d, S.route, S.conn).map(ok);
    const froudeHi = d.reaches.filter(r => r.froude >= 1).length;
    const mhRows = d.mhs.map((m, i) => `<tr><th scope="row">MH ${i + 1}${i === d.mhs.length - 1 ? ' <small>connection</small>' : i === 0 ? ' <small>start</small>' : ''}</th><td class="n">${fmtNum(Math.round(m.x))}</td><td class="n">${fmt2(m.g)}</td><td class="n">${m.inv_in == null ? '–' : fmt2(m.inv_in)}</td><td class="n">${m.inv_out == null ? '–' : fmt2(m.inv_out)}</td><td class="n">${fmt2(m.depth)}</td><td class="n">${m.drop ? `${fmt2(m.drop)}${m.structure ? ' <small>structure</small>' : ''}` : '–'}</td></tr>`).join('');
    const rRows = d.reaches.map(r => `<tr><th scope="row">${r.from + 1} → ${r.to + 1}</th><td class="n">${fmt1(r.L)}</td><td class="n">${(r.S * 100).toFixed(2)}</td><td class="n">${fmt1(r.qFull)}</td><td class="n">${r.qRatio.toFixed(2)}</td><td class="n">${fmt2(r.v)}</td><td class="n">${fmt2(r.vFull)}</td><td class="n">${r.froude.toFixed(2)}</td></tr>`).join('');
    return `<p><span class="pnl-chip t-room">Gravity design</span> A <strong>${fmtNum(d.dmm)} mm</strong> sewer at ${fmt2(Math.min(...s))}–${fmt2(Math.max(...s))}%, ${fmtNum(d.mhs.length)} maintenance holes, ${fmt1(d.mhs[0].depth)} m deep at the start and ${fmt1(deepest)} m at the deepest, for ${fmt1(d.q)} L/s${S.flow && !S.flow.typed ? ` (${fmt1(S.flow.peak)} L/s peak dry + ${fmt1(S.flow.ii)} L/s I&amp;I)` : ''}. The least excavation the rules allow.</p>
      <h4 class="sd-h">Profile</h4>${profileSVG(d)}
      <h4 class="sd-h">Rules checked</h4><ul class="sd-checks small">${checkList.join('')}</ul>${froudeHi ? `<p class="small t-tight">${froudeHi} reach${froudeHi === 1 ? '' : 'es'} with supercritical flow (Froude 1 or more): the standard asks for subcritical flow where possible (s. 2.9.1).</p>` : ''}
      <h4 class="sd-h">Maintenance holes</h4><div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">MH</th><th scope="col" class="n">Chainage (m)</th><th scope="col" class="n">Ground (m)</th><th scope="col" class="n">Invert in</th><th scope="col" class="n">Invert out</th><th scope="col" class="n">Depth</th><th scope="col" class="n">Drop</th></tr></thead><tbody>${mhRows}</tbody></table></div>
      <h4 class="sd-h">Reaches · ${fmtNum(d.dmm)} mm</h4><div class="table-wrap"><table class="dt small sd-t"><thead><tr><th scope="col">Reach</th><th scope="col" class="n">Length (m)</th><th scope="col" class="n">Slope (%)</th><th scope="col" class="n">Full flow (L/s)</th><th scope="col" class="n">Flow ratio</th><th scope="col" class="n">V design (m/s)</th><th scope="col" class="n">V full (m/s)</th><th scope="col" class="n">Froude</th></tr></thead><tbody>${rRows}</tbody></table></div>
      <p><button type="button" class="btn small" data-sd-act="print">Print plan and profile (11×17)</button> <button type="button" class="btn small" data-sd-act="csv">Download the design (CSV)</button></p>`;
  }
  // The profile: the ground, the cover line, the pipe (obvert and invert), the maintenance holes,
  // the existing sewer at the connection; chainage along the bottom, elevations up the side.
  function profileSVG(d) {
    const W = 640, H = 260, pl = 46, pr = 10, pt = 14, pb = 30, G = S.ground, Lt = G[G.length - 1].x || 1;
    const lows = d ? d.mhs.flatMap(m => [m.inv_in, m.inv_out]).filter(x => x != null) : [S.conn.invert];
    const zmin = Math.floor(Math.min(...lows, ...G.map(s => s.g)) - 0.5), zmax = Math.ceil(Math.max(...G.map(s => s.g)) + 0.5);
    const X = x => pl + (W - pl - pr) * x / Lt, Y = z => pt + (H - pt - pb) * (zmax - z) / ((zmax - zmin) || 1);
    const path = arr => arr.map(([x, z], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(z).toFixed(1)}`).join('');
    const ground = path(G.map(s => [s.x, s.g]));
    const cover = d ? path(G.map(s => [s.x, s.g - d.cover])) : '';
    let pipe = '';
    if (d) {
      const D = d.dmm / 1000;
      pipe = d.reaches.map(r => { const a = S.route.nodes[r.from].x, b = S.route.nodes[r.to].x; return `<path d="M${X(a).toFixed(1)},${Y(r.inv_up + D).toFixed(1)}L${X(b).toFixed(1)},${Y(r.inv_dn + D).toFixed(1)}L${X(b).toFixed(1)},${Y(r.inv_dn).toFixed(1)}L${X(a).toFixed(1)},${Y(r.inv_up).toFixed(1)}Z" class="sp-pipe"/>`; }).join('');
      pipe += d.mhs.map((m, i) => { const top = Y(m.g), bot = Y(Math.min(...[m.inv_in, m.inv_out].filter(v => v != null))); return `<line x1="${X(m.x).toFixed(1)}" x2="${X(m.x).toFixed(1)}" y1="${top.toFixed(1)}" y2="${bot.toFixed(1)}" class="sp-mh${m.structure ? ' sp-drop' : ''}"/><text x="${X(m.x).toFixed(1)}" y="${(top - 4).toFixed(1)}" class="sp-lbl" text-anchor="middle">${i + 1}</text>`; }).join('');
    }
    const ex = `<circle cx="${X(Lt).toFixed(1)}" cy="${Y(S.conn.invert + S.conn.dmm / 2000).toFixed(1)}" r="${Math.max(3, (H - pt - pb) * (S.conn.dmm / 1000) / ((zmax - zmin) || 1) / 2).toFixed(1)}" class="sp-ex"/>`;
    // Axes: elevations every 1, 2 or 5 m; chainage every 50, 100 or 200 m.
    const zs = (zmax - zmin) > 20 ? 5 : (zmax - zmin) > 8 ? 2 : 1, xsStep = Lt > 1200 ? 200 : Lt > 500 ? 100 : 50;
    let axes = '';
    for (let z = Math.ceil(zmin / zs) * zs; z <= zmax; z += zs) axes += `<line x1="${pl}" x2="${W - pr}" y1="${Y(z).toFixed(1)}" y2="${Y(z).toFixed(1)}" class="sp-grid"/><text x="${pl - 4}" y="${(Y(z) + 3).toFixed(1)}" class="sp-ax" text-anchor="end">${z}</text>`;
    for (let x = 0; x <= Lt + 1e-6; x += xsStep) axes += `<text x="${X(x).toFixed(1)}" y="${H - pb + 14}" class="sp-ax" text-anchor="middle">${x}</text>`;
    return `<svg class="sd-prof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile of the sewer: ground, minimum cover, the pipe and the maintenance holes, from the start (left) to the connection (right)">${axes}<path d="${ground}" class="sp-ground"/>${cover ? `<path d="${cover}" class="sp-cover"/>` : ''}${pipe}${ex}<text x="${pl}" y="${H - 4}" class="sp-ax">chainage (m) from the start · elevations (m, CGVD2013)</text></svg>
      <p class="small muted sd-key"><span class="lp-k lp-k-g"></span>ground${d ? ` <span class="lp-k sd-k-c"></span>${d.cover} m cover line <span class="lp-k lp-k-p"></span>the pipe (${d.dmm} mm) and its maintenance holes` : ''} <span class="lp-k sd-k-e"></span>the existing sewer</p>`;
  }
  function downloadCSV() {
    if (!S.d || !S.d.ok) return;
    const E = root.PeelExports, text = csv(S.d);
    if (E && E.download) E.download('peel-sewer-design.csv', text, 'text/csv');
  }
  // The 11×17 sheet: the Region's sanitary sewers around the route for the plan (the connected one
  // alone when they can't be read), the development open in the panel or the start's coordinates.
  async function printSheet() {
    const P = root.PeelSewerPrint; if (!S.d || !S.d.ok || !P) return;
    const lls = S.route.nodes.map(n => n.ll), lat = lls.reduce((t, p) => t + p.lat, 0) / lls.length, lng = lls.reduce((t, p) => t + p.lng, 0) / lls.length;
    const r = Math.min(1500, Math.max(...lls.map(p => metres({ lat, lng }, p))) + 120);
    let mains = [];
    try { mains = (await MS().mainsNear(lat, lng, r)).filter(m => !m.fm).map(m => ({ g: m.g, d: m.d, id: m.id })); } catch (e) { mains = []; }
    const key = g => g.map(c => c.join()).join(';'), ck = S.conn.g ? key(S.conn.g) : '';
    mains.forEach(m => { if (key(m.g) === ck) m.conn = true; });
    if (S.conn.g && !mains.some(m => m.conn)) mains.push({ g: S.conn.g, d: S.conn.dmm, id: S.conn.id, conn: true });
    const dev = root.DevScope && root.DevScope.current && root.DevScope.current(), st = S.pts[0];
    const RP = root.PeelReports, Ut = root.PeelUtil || {};
    P.open({
      d: S.d, nodes: S.route.nodes, ground: S.ground, pts: S.pts, conn: S.conn, mains, flow: S.flow, groundLabel: S.groundLabel,
      checks: checks(S.d, S.route, S.conn), froudeHi: S.d.reaches.filter(x => x.froude >= 1).length,
      where: dev && dev.title ? `From ${dev.title}` : `From ${st.lat.toFixed(5)}, ${st.lng.toFixed(5)}`,
      date: new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
      version: RP && RP.appVersion ? RP.appVersion() : 'dev', unofficial: Ut.UNOFFICIAL || 'Unofficial prototype · public data only · not a Region of Peel product',
      source: SW().SOURCE, note: Ut.SCREEN_LINE || 'General screening results only. Peel\'s W&WW Infrastructure Planning team must validate or confirm all results.',
    });
  }
  function clearAll() { S.pts = []; S.conn = null; S.route = null; S.d = null; S.msg = ''; if (layer) layer.clearLayers(); }

  // The form and its buttons (in the result panel).
  document.addEventListener('input', e => { const i = e.target.closest && e.target.closest('[data-sd]'); if (i) S.form[i.dataset.sd] = i.type === 'checkbox' ? i.checked : i.value; });
  document.addEventListener('change', e => { const i = e.target.closest && e.target.closest('[data-sd]'); if (i) S.form[i.dataset.sd] = i.type === 'checkbox' ? i.checked : i.value; });
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-sd-act]'); if (!b) return;
    const act = b.dataset.sdAct;
    if (act === 'design') run();
    else if (act === 'csv') downloadCSV();
    else if (act === 'print') printSheet();
    else if (act === 'edit') { S.d = null; S.conn = null; const A = root.PeelApp && root.PeelApp.scope; if (T().active() !== 'sewer' && A && A.setTool) A.setTool('sewer'); drawLine(); banner(); }
    else if (act === 'clear') { clearAll(); T().closeResult(); }
  });
  document.addEventListener('peel:tool-closed', () => { if (T().active() !== 'sewer') clearAll(); });
  document.addEventListener('peel:result-opened', e => { if (e.detail && e.detail.ref !== 'tool:sewer-design' && T().active() !== 'sewer') clearAll(); });

  T().register('sewer', {
    title: 'Sewer designer', icon: 'sewer', hint: 'tap from the site to an existing sanitary sewer',
    bannerHTML,
    onActivate() { if (S.d) { S.d = null; S.conn = null; } S.msg = ''; drawLine(); banner(); },
    onDeactivate() { if (!(T().hasResult() && T().resultTitle() === 'Sewer design')) clearAll(); },
    onClick(ll) { if (S.busy) return; if (S.conn) { S.conn = null; S.d = null; } S.pts.push({ lat: ll.lat, lng: ll.lng }); S.msg = ''; drawLine(); banner(); },
    onBannerAct(act) {
      if (act === 'sd-undo') { S.pts.pop(); S.conn = null; S.d = null; drawLine(); banner(); }
      if (act === 'sd-clear') { clearAll(); banner(); }
      if (act === 'sd-finish') finish();
    },
  });
  root.PeelSewerDesigner = { state: () => S, finish, run, clearAll, printSheet, chainage, bends, checks, csv };
})(typeof window !== 'undefined' ? window : globalThis);
