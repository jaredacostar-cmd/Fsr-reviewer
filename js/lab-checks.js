/* Labs: the Gravity check and the Pressure check (PeelLabChecks), folds of a development's Servicing
 * panel when their Labs switch is on.
 *
 * Gravity check: can the site drain by gravity to the nearest Region sanitary sewer? A straight line
 * from the site's centre to the nearest gravity main with published inverts (snapped to its
 * maintenance hole when one is within 15 m, else a new maintenance hole on the pipe), the ground
 * along it from the lidar terrain model, and the least-excavation design to Peel's rules
 * (js/sewer-design.js) for the site's peak wet weather flow.
 * Pressure check: the static pressure at the site's ground from its pressure zone's hydraulic grade
 * line (2020 Master Plan, Vol. 3 Table 3), against Peel's 40–100 psi operating range, and roughly how
 * many storeys stay above 40 psi.
 *
 * Pure: pressureAt() and gravityVerdict() (tests/lab-checks.test.js).
 */
(function (root) {
  'use strict';
  // 2020 Water and Wastewater Master Plan for the Lake-Based Systems, Vol. 3, Table 3.
  const ZONES = {
    1: { twl: 144.8, hgl: 152.4, serv: [75.0, 106.7] },
    2: { twl: 175.3, hgl: 182.9, serv: [87.8, 137.2] },
    3: { twl: 205.7, hgl: 213.4, serv: [135.9, 167.6] },
    4: { twl: 236.2, hgl: 243.8, serv: [166.4, 210.6] },
    5: { twl: 266.7, hgl: 274.3, serv: [182.4, 236.2] },
    6: { twl: 297.2, hgl: 304.8, serv: [214.5, 259.1] },
    7: { twl: 327.7, hgl: 335.3, serv: [243.4, 289.6] },
  };
  const ZONE_SRC = '2020 Water and Wastewater Master Plan for the Lake-Based Systems, Vol. 3, Table 3';
  const PRESSURE = { min: 40, max: 100, src: 'Region of Peel water design criteria: a minimum operating pressure of 40 psi and a maximum of 100 psi' };
  const KPA_PER_M = 9.80665, KPA_PER_PSI = 6.894757, STOREY = 3.0;
  const r0 = x => Math.round(x);

  // Static pressure at ground z (m) in a zone, at the zone's hydraulic grade line (no losses).
  function pressureAt(z, zone) {
    const Z = ZONES[String(zone)]; if (!Z || z == null || !isFinite(z)) return null;
    const head = Z.hgl - z, kpa = head * KPA_PER_M, psi = kpa / KPA_PER_PSI;
    const band = z < Z.serv[0] ? 'below' : z > Z.serv[1] ? 'above' : 'within';
    // Storeys above grade with 40 psi or more at the top floor (3 m a storey).
    const headMin = PRESSURE.min * KPA_PER_PSI / KPA_PER_M, storeys = Math.max(0, Math.floor((head - headMin) / STOREY));
    const tone = psi < PRESSURE.min ? 'over' : psi > PRESSURE.max ? 'tight' : 'room';
    return { zone: String(zone), z, hgl: Z.hgl, head, kpa, psi, band, serv: Z.serv, storeys, tone,
      verdict: psi < PRESSURE.min ? 'Below 40 psi at ground' : psi > PRESSURE.max ? 'Above 100 psi at ground' : 'Within 40–100 psi' };
  }
  // The gravity check's answer from a design (js/sewer-design.js) and the connection.
  function gravityVerdict(d) {
    if (!d) return { tone: null, text: 'Not assessed' };
    if (!d.ok) return /below the existing obvert/.test(d.why || '') ? { tone: 'over', text: 'Likely needs pumping' } : { tone: 'tight', text: 'Not by this straight line' };
    const deep = Math.max(...d.mhs.map(m => m.depth)) > 6 || d.structures > 0;
    return deep ? { tone: 'tight', text: 'By gravity, deep or with a drop structure' } : { tone: 'room', text: 'Likely by gravity' };
  }

  // ---- Browser ---------------------------------------------------------------------------------
  if (typeof document === 'undefined' || typeof module !== 'undefined' && module.exports) {
    if (typeof module !== 'undefined' && module.exports) module.exports = { ZONES, ZONE_SRC, PRESSURE, pressureAt, gravityVerdict };
    return;
  }
  const U = root.PeelUtil || {}, esc = U.esc || (s => String(s)), fmtNum = U.fmtNum || (n => String(n));
  const fmt1 = n => (Math.round(n * 10) / 10).toLocaleString('en-CA', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const fmt2 = n => n.toFixed(2);
  // (the panels' own screening note, word for word)
  const NOTE = (root.PeelPanel && root.PeelPanel.NOTE) || 'General screening results only. Peel\'s W&amp;WW Infrastructure Planning team must validate or confirm all results.';
  const Labs = () => root.PeelLabs, SD = () => root.PeelSvcData, EL = () => root.PeelElevation, MS = () => root.PeelMeasure, SW = () => root.PeelSewerDesign;
  const on = id => !!(Labs() && Labs().on(id));
  const devByKey = k => (root.PeelDevNav && root.PeelDevNav.projectByKey ? root.PeelDevNav.projectByKey(k) : null);

  /** The folds for a development's Servicing panel (empty when the switches are off). */
  function folds(p) {
    const out = [];
    if (on('gravity')) out.push({ title: 'Gravity check (Labs)', id: 'pnl-lab-gravity', html: `<div class="lab-check" data-lab-check="gravity" data-key="${esc(p.key)}"><p class="small muted">Open to check: the nearest Region sanitary sewer, the ground along a straight line to it, and a design to Peel's rules.</p></div>` });
    if (on('pressure')) out.push({ title: 'Pressure check (Labs)', id: 'pnl-lab-pressure', html: `<div class="lab-check" data-lab-check="pressure" data-key="${esc(p.key)}"><p class="small muted">Open to check the water pressure at the site's ground.</p></div>` });
    return out;
  }
  const cache = new Map();
  // A fold opened: run its check once per development (kept for the session).
  document.addEventListener('toggle', e => {
    const d = e.target; if (!d.open || !d.querySelector) return;
    const box = d.querySelector('[data-lab-check]'); if (!box || box.dataset.done) return;
    box.dataset.done = '1';
    const p = devByKey(box.dataset.key); if (!p) { box.innerHTML = '<p class="small muted">Open a development first.</p>'; return; }
    const kind = box.dataset.labCheck, k = `${kind}:${p.key}`;
    box.innerHTML = `<p class="small muted">${kind === 'gravity' ? 'Finding the nearest sanitary sewer and the ground along the way…' : 'Reading the ground at the site…'}</p>`;
    const run = cache.get(k) || (kind === 'gravity' ? gravity(p) : pressure(p));
    cache.set(k, run);
    run.then(html => { box.innerHTML = html; }, err => { cache.delete(k); box.dataset.done = ''; box.innerHTML = `<p class="small muted">Couldn't complete the check (${esc(err && err.message ? err.message : 'no data')}). Close and open the fold to try again.</p>`; });
  }, true);

  // ---- Pressure ----------------------------------------------------------------------------------
  async function pressure(p) {
    const f = SD().svcFacts(p), z = f && f.z;
    if (!z) return '<p class="small">No pressure zone is mapped at this site.</p>';
    const [g] = await EL().getGroundMany([{ lat: p.lat, lng: p.lng }]);
    if (!g || g.z == null) return '<p class="small muted">No ground elevation here (lidar or terrain).</p>';
    const r = pressureAt(g.z, z.zone);
    if (!r) return `<p class="small"><strong>${esc(z.name)}</strong> is not in the Master Plan's table of lake-based zones (Table 3 lists zones 1–7), so its hydraulic grade line isn't known here.</p>${foot(`Ground: ${esc(g.label || '')}.`)}`;
    const chip = `<span class="pnl-chip t-${r.tone}">${esc(r.verdict)}</span>`;
    return `<p>${chip} At ground level the static pressure is about <strong>${fmtNum(r0(r.kpa))} kPa (${r0(r.psi)} psi)</strong>${f.zNear ? ' (from the nearest zone)' : ''}: ${esc(z.name)}'s hydraulic grade line ${fmt1(r.hgl)} m, the ground ${fmt1(r.z)} m.</p>
      <ul class="b-lines small">
        <li>The zone serves ground from ${fmt1(r.serv[0])} to ${fmt1(r.serv[1])} m: this site is <strong>${r.band === 'within' ? 'within that band' : `${r.band} it`}</strong>${r.band === 'above' ? ' (low pressure: the zone above, or a booster, may serve it)' : r.band === 'below' ? ' (high pressure: a pressure-reducing valve or the zone below)' : ''}.</li>
        <li>About <strong>${fmtNum(r.storeys)} storey${r.storeys === 1 ? '' : 's'}</strong> above grade keep 40 psi or more at the top floor (3 m a storey); taller buildings need booster pumps.</li>
        <li>Static pressure at the grade line: losses at peak hour or during a fire flow lower it.</li>
      </ul>${foot(`Grade lines: ${ZONE_SRC}. Range: ${PRESSURE.src}. Ground: ${esc(g.label || '')}.`)}`;
  }

  // ---- Gravity -----------------------------------------------------------------------------------
  const dist = (a, b) => { const kx = 111320 * Math.cos(a.lat * Math.PI / 180); return Math.hypot((b.lng - a.lng) * kx, (b.lat - a.lat) * 111320); };
  async function nearestSewer(p) {
    for (const r of [150, 400]) {
      const mains = (await MS().mainsNear(p.lat, p.lng, r)).filter(m => !m.fm && m.up > 0 && m.dn > 0 && m.d > 0);
      let best = null;
      for (const m of mains) { const n = MS().nearOn([p.lng, p.lat], m.g); if (!best || n.m < best.n.m) best = { m, n }; }
      if (best) return best;
    }
    return null;
  }
  async function gravity(p) {
    const f = SD().svcFacts(p), q = f && f.cb ? f.cb.wastewater.wetPeak : null;
    if (!q) return '<p class="small muted">No design flow for this development (no units or jobs).</p>';
    const hit = await nearestSewer(p);
    if (!hit) return '<p class="small">No Region sanitary sewer with published inverts within 400 m: the check can\'t run here.</p>';
    const { m, n } = hit, g = m.g;
    // The connection: the existing maintenance hole when one is within 15 m (a pipe end), else a new
    // one on the pipe at the nearest point.
    const len = g.reduce((t, c, i) => (i ? t + dist({ lat: g[i - 1][1], lng: g[i - 1][0] }, { lat: c[1], lng: c[0] }) : 0), 0) || 1;
    const along = n.t * len, atUp = along <= 15, atDn = len - along <= 15;
    const t = atUp ? 0 : atDn ? 1 : n.t, pt = atUp ? g[0] : atDn ? g[g.length - 1] : pointAt(g, n.t);
    const conn = { lat: pt[1], lng: pt[0], invert: m.up + (m.dn - m.up) * t, dmm: m.d, id: m.id, existingMH: atUp || atDn };
    const L = dist({ lat: p.lat, lng: p.lng }, conn);
    if (L < 5) return '<p class="small">The sewer runs through the site: a connection there needs no lateral run.</p>';
    // Ground every 10 m along the straight line.
    const N = Math.max(2, Math.ceil(L / 10)), pts = [];
    for (let k = 0; k <= N; k++) pts.push({ lat: p.lat + (conn.lat - p.lat) * k / N, lng: p.lng + (conn.lng - p.lng) * k / N, x: L * k / N });
    const gs = await EL().getGroundMany(pts.map(({ lat, lng }) => ({ lat, lng })));
    if (gs.some(x => !x || x.z == null)) return '<p class="small muted">No ground elevation along part of the line (lidar or terrain): the check can\'t run.</p>';
    pts.forEach((q2, i) => { q2.g = gs[i].z; });
    const gAt = x => { const i = Math.min(N - 1, Math.floor(x / L * N)), a = pts[i], b = pts[i + 1]; return a.g + (b.g - a.g) * ((x - a.x) / ((b.x - a.x) || 1)); };
    const mhX = SW().placeMHs([0, L], 190);
    const route = { nodes: mhX.map(x => ({ x, g: gAt(x), bend: 0 })), samples: pts.slice(1, -1).map(({ x, g: gg }) => ({ x, g: gg })) };
    // (no homes: an industrial / commercial site, 3.5 m of cover)
    const ici = !(p.units > 0);
    const d = SW().design(route, conn, q, { ici });
    return gravityHTML(p, d, conn, L, q, route, gs[0]);
  }
  function pointAt(g, t) {
    const seg = []; let tot = 0;
    for (let i = 1; i < g.length; i++) { const l = Math.hypot(g[i][0] - g[i - 1][0], g[i][1] - g[i - 1][1]); seg.push(l); tot += l; }
    let want = t * tot;
    for (let i = 1; i < g.length; i++) { if (want <= seg[i - 1]) { const k = seg[i - 1] ? want / seg[i - 1] : 0; return [g[i - 1][0] + (g[i][0] - g[i - 1][0]) * k, g[i - 1][1] + (g[i][1] - g[i - 1][1]) * k]; } want -= seg[i - 1]; }
    return g[g.length - 1];
  }
  function gravityHTML(p, d, conn, L, q, route, g0) {
    const v = gravityVerdict(d), chip = `<span class="pnl-chip t-${v.tone}">${esc(v.text)}</span>`;
    const where = `${fmtNum(conn.dmm)} mm sanitary sewer${conn.id ? ` ${esc(conn.id)}` : ''}, invert ${fmt2(conn.invert)} m, about ${fmtNum(r0(L))} m away in a straight line (${conn.existingMH ? 'at its existing maintenance hole' : 'a new maintenance hole on the pipe'})`;
    let body;
    if (d.ok) {
      const deepest = Math.max(...d.mhs.map(mh => mh.depth)), s = d.reaches.map(x => x.S * 100), vmin = Math.min(...d.reaches.map(x => x.v)), qr = Math.max(...d.reaches.map(x => x.qRatio));
      body = `<p>${chip} A <strong>${fmtNum(d.dmm)} mm</strong> sewer at ${fmt2(Math.min(...s))}–${fmt2(Math.max(...s))}% reaches the ${where}.</p>
        <ul class="b-lines small">
          <li>Depth to invert at the site <strong>${fmt1(d.mhs[0].depth)} m</strong>; deepest <strong>${fmt1(deepest)} m</strong> (${d.cover} m of cover over the pipe, an 8 m trench at most); ${fmtNum(d.mhs.length)} maintenance holes${d.structures ? `; <strong>${d.structures} drop structure${d.structures === 1 ? '' : 's'}</strong>` : ''}.</li>
          <li>Design flow ${fmt1(q)} L/s (the site's peak wet weather, Peel criteria): ${fmt2(vmin)} m/s at the flattest reach (0.75 m/s or more), ${Math.round(qr * 100)}% of full-flow capacity (70% at most).</li>
        </ul>${profileSVG(d, route)}`;
    } else {
      body = `<p>${chip} To the ${where}: ${esc(d.why)}.</p>${profileSVG(null, route, conn)}`;
    }
    return `${body}<p class="small muted">A straight line from the site's centre: the street route is longer and its ground differs. Ground: ${esc(g0.label || '')}; the sewer: Region of Peel sanitary mains (as published). Design to ${esc(SW().SOURCE)}.</p><p class="pnl-note small">${NOTE}</p>`;
  }
  // A small profile: the ground, the cover line and the designed pipe (or the existing obvert).
  function profileSVG(d, route, conn) {
    const W = 360, H = 120, pad = 6, xs = [...route.nodes, ...route.samples].sort((a, b) => a.x - b.x), L = xs[xs.length - 1].x || 1;
    const lows = d ? d.mhs.flatMap(m => [m.inv_in, m.inv_out]).filter(x => x != null) : [conn.invert];
    const zmin = Math.min(...lows, ...xs.map(s => s.g)) - 0.5, zmax = Math.max(...xs.map(s => s.g)) + 0.5;
    const X = x => pad + (W - 2 * pad) * x / L, Y = z => pad + (H - 2 * pad) * (zmax - z) / ((zmax - zmin) || 1);
    const ground = xs.map((s, i) => `${i ? 'L' : 'M'}${X(s.x).toFixed(1)},${Y(s.g).toFixed(1)}`).join('');
    let pipe = '';
    if (d) pipe = d.reaches.map(rc => `M${X(route.nodes[rc.from].x).toFixed(1)},${Y(rc.inv_up).toFixed(1)}L${X(route.nodes[rc.to].x).toFixed(1)},${Y(rc.inv_dn).toFixed(1)}`).join('');
    const mhs = route.nodes.map(nd => `<line x1="${X(nd.x).toFixed(1)}" x2="${X(nd.x).toFixed(1)}" y1="${Y(nd.g).toFixed(1)}" y2="${(d ? Y(Math.min(...d.mhs.filter(m => m.x === nd.x).flatMap(m => [m.inv_in, m.inv_out]).filter(x => x != null))) : Y(nd.g) + 4).toFixed(1)}" class="lp-mh"/>`).join('');
    const ex = conn ? `<circle cx="${X(L).toFixed(1)}" cy="${Y(conn.invert).toFixed(1)}" r="3" class="lp-ex"/>` : d ? `<circle cx="${X(L).toFixed(1)}" cy="${Y(d.mhs[d.mhs.length - 1].inv_in).toFixed(1)}" r="3" class="lp-ex"/>` : '';
    return `<svg class="lab-prof" viewBox="0 0 ${W} ${H}" role="img" aria-label="Profile: the ground and ${d ? 'the designed sewer' : 'the existing sewer’s invert'} from the site (left) to the connection (right)"><path d="${ground}" class="lp-ground"/>${mhs}${pipe ? `<path d="${pipe}" class="lp-pipe"/>` : ''}${ex}</svg><p class="small muted lab-prof-k"><span class="lp-k lp-k-g"></span>ground <span class="lp-k lp-k-p"></span>${d ? 'the designed sewer (invert)' : 'existing invert'} · site on the left, the connection on the right</p>`;
  }
  const foot = t => `<p class="small muted">${t}</p><p class="pnl-note small">${NOTE}</p>`;

  root.PeelLabChecks = { ZONES, ZONE_SRC, PRESSURE, pressureAt, gravityVerdict, folds, gravity, pressure, profileSVG };
})(typeof window !== 'undefined' ? window : globalThis);
