/* Sewer pipe capacity screen (data/sewers.json) — pipe stats/colours/tips,
 * Phase 6 extraction from js/app.js (app.js 7118-7375, 7804-7866).
 * "What loads this" pipe view, plus the SWMM 5 skeleton export.
 */
(function (root) {
  'use strict';

  const D = window.PeelDemand;
  const { $, esc, fmtNum, fmt1, roundPop, unit, dot, token, uLs, PIPE_RESULTS, SCREEN_NOTE, pipeClass } = window.PeelUtil;
  const map = window.PeelMapCore.map;
  const App = () => window.PeelApp;
  const MM = () => window.PeelMapMarkers;
  const MA = () => window.PeelMapAnalysis;
  const SD = () => window.PeelSvcData;
  const DI = () => window.PeelDcInfra;
  const MP = () => window.PeelMasterPlan;
  const TS = () => window.PeelToolScope;
  const Meas = () => window.PeelMeasure;
  const SvcTab = () => window.PeelSvcTab;
  const EP = () => window.PeelExistPipes;
  const Sett = () => window.PeelSettings;
  const Ex = () => window.PeelExports;
  const DS = () => window.DevScope;

  // ---- Sewer pipe capacity screen (data/sewers.json, scripts/build-sewer-capacity.js) -------------
  // Every Peel sanitary pipe of 300 mm or more: full-flow capacity (Manning, n 0.013, published
  // slope), the 2021 Census population and land (ha) draining through it, and the next pipe down.
  // Growth since the census is added here: each development joins the nearest of these pipes and
  // its people, jobs and site area are carried down the chain. Flows at Peel design criteria.
  function loadSewers() {
    if (MM().SEW.data || MM().SEW.loading) return MM().SEW.loading;
    MM().SEW.loading = fetch('data/sewers.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return null;
      MM().SEW.data = d;
      const grid = new Map();
      d.pipes.forEach((p, i) => {
        const c = p[10];
        for (let k = 0; k < c.length; k += 2) { const key = `${Math.floor(c[k] / 0.004)},${Math.floor(c[k + 1] / 0.003)}`; (grid.get(key) || grid.set(key, []).get(key)).push(i); }
      });
      MM().SEW.grid = grid;
      // Blocks: the pumping stations' loads come from the pipes, so redo the tables and layers.
      if (App().state.servicing && App().state.servicing.blocks) SvcTab().renderSvcTab(); else if (MM().mstyle.cap === 'pipes') MA().renderCapLayer();
      if (typeof DS() !== 'undefined' && DS().current()) DS().refresh();
      // Phase 3b: DC timing lives in the Tool result tab now — re-run while that result is open.
      if (TS().toolScope && TS().toolScope.kind === 'dc' && TS().toolScope.title === 'DC timing' && typeof window !== 'undefined' && window.PeelTools && window.PeelTools.hasResult()) MP().showDcTiming();
      return d;
    }).catch(() => null);
    return MM().SEW.loading;
  }
  const pipeCoords = p => { const c = p[10], out = []; for (let k = 0; k < c.length; k += 2) out.push([c[k], c[k + 1]]); return out; };
  // Nearest pipe (index) to a point within r metres (of at least minD mm).
  function nearestPipe(lng, lat, r = 400, minD = 0) {
    if (!MM().SEW.grid) return -1;
    const gx = Math.floor(lng / 0.004), gy = Math.floor(lat / 0.003), R = Math.ceil(r / 300);
    let best = -1, bd = Infinity;
    const seen = new Set();
    for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) for (const k of MM().SEW.grid.get(`${gx + i},${gy + j}`) || []) {
      if (seen.has(k) || MM().SEW.data.pipes[k][0] < minD) continue; seen.add(k);
      const d = DI().dcDist([lng, lat], pipeCoords(MM().SEW.data.pipes[k]));
      if (d < bd) { bd = d; best = k; }
    }
    return bd <= r ? best : -1;
  }
  // Growth loads per pipe (built since the census, approved, proposed; test sites counted in the
  // totals included), recomputed when criteria or data change.
  function sewerGrowth() {
    if (!MM().SEW.data) return null;
    const key = `${JSON.stringify(App().state.criteria)}|${App().state.projects.length}|${(App().state.whatifs || []).length}`;
    if (MM().SEW.growth && MM().SEW.key === key) return MM().SEW.growth;
    const n = MM().SEW.data.pipes.length, L = ['built', 'approved', 'proposed'];
    const g = Object.fromEntries(L.map(k => [k, { pop: new Float64Array(n), jobs: new Float64Array(n), ha: new Float64Array(n) }]));
    const devPipe = new Map();
    for (const p of App().state.projects.concat(App().state.whatifs || [])) {
      const lay = MM().svcLayerOf(p);
      if (!L.includes(lay) || p.lat == null) continue;
      const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf);
      if (!(e.population > 0 || e.employment.jobs > 0)) continue;
      const k = nearestPipe(p.lng, p.lat); if (k < 0) continue;
      devPipe.set(p, k);
      const ha = e.area.ha + (e.employment.area ? e.employment.area.ha : 0);
      for (let i = k, hop = 0; i >= 0 && hop < 2000; i = MM().SEW.data.pipes[i][3], hop++) { g[lay].pop[i] += e.population; g[lay].jobs[i] += e.employment.jobs; g[lay].ha[i] += ha; }
    }
    MM().SEW.growth = { ...g, devPipe }; MM().SEW.key = key;
    return MM().SEW.growth;
  }
  // Flow (L/s) through pipe i. Existing (census) load: peak dry weather at the plant's measured
  // rate (capacity check calibration; ×1 in design mode) — design I&I on all existing land would
  // overstate today's flows several times. Growth since the census: peak wet weather at Peel design
  // criteria, with I&I on its own site area. 'none' = existing only; 'today' = + built since; a year
  // or null (build-out) adds approved and proposed growth as phased in Horizon years; 'committed' =
  // existing + built + all approved.
  function pipeFlow(i, y) {
    const p = MM().SEW.data.pipes[i], G = sewerGrowth(), c = App().state.criteria, E = c.employment;
    let { fa, fp, fb: fy = 1 } = y === 'none' || y === 'today' ? { fa: 0, fp: 0 } : y === 'committed' ? { fa: 1, fp: 0 } : y == null ? { fa: 1, fp: 1 } : MA().hzFrac(y);
    const fb = (y === 'none' ? 0 : fy) * (MM().wwOn('built') ? 1 : 0);
    if (!MM().wwOn('approved')) fa = 0; if (!MM().wwOn('proposed')) fp = 0;
    const M = App().state.svcModel, f = M && M.fOf ? M.fOf(MM().SEW.data.plants[p[6]]) || 1 : 1;
    const exist = MM().wwOn('existing') ? p[4] * c.wastewater.avg / 86400 * f * D.residentialPeaking(p[4], c.wastewater) : 0;
    const gp = fb * G.built.pop[i] + fa * G.approved.pop[i] + fp * G.proposed.pop[i];
    const gj = fb * G.built.jobs[i] + fa * G.approved.jobs[i] + fp * G.proposed.jobs[i];
    const gh = fb * G.built.ha[i] + fa * G.approved.ha[i] + fp * G.proposed.ha[i];
    const growth = gp * c.wastewater.avg / 86400 * D.residentialPeaking(gp, c.wastewater) + gj * E.wastewater / 86400 * D.employmentPeaking(gj, E) + gh * c.wastewater.infiltration;
    return { pop: p[4] + gp, jobs: gj, ha: p[5] + gh, exist, growth, q: exist + growth, f };
  }
  // Pipes by class at the legend year (all pipes, for the legend summary).
  function pipeSummary() {
    if (!MM().SEW.data) return null;
    const n = MM().PIPE_CLS.map(() => 0); let none = 0;
    MM().SEW.data.pipes.forEach((p, i) => { const s = pipeStats(i); if (s.r1 == null) none++; else n[MM().PIPE_CLS.findIndex(([t]) => s.r1 * 100 < t)]++; });
    return { n, none, total: MM().SEW.data.pipes.length };
  }
  const pipeColour = r => r == null || isNaN(r) ? token('--nodata') : token((MM().PIPE_CLS.find(([t]) => r * 100 < t) || MM().PIPE_CLS[MM().PIPE_CLS.length - 1])[1]);
  // Phase 4: an explicit year (null = build-out) lets the "Tightest pipes" section rank
  // pipes at build-out whatever the scenario year is; existing callers keep capYear.
  function pipeStats(i, y) {
    const p = MM().SEW.data.pipes[i], cap = p[2];
    const today = pipeFlow(i, 'today'), then = pipeFlow(i, y === undefined ? MA().getCapYear() : y);
    // A published slope under 0.01% (6 trunks, e.g. a 3048 mm main at 0.002%) is a data error,
    // not a flat pipe: its capacity isn't trusted (shown as no reliable slope, like a missing one).
    const ok = cap && p[1] >= 0.0001;
    return { p, cap: ok ? cap : 0, badSlope: !!cap && !ok, today, then, r0: ok ? today.q / cap : null, r1: ok ? then.q / cap : null, growthShare: ok ? then.growth / cap : null };
  }
  // Flow depth in a part-full circular pipe (Manning, constant n): the depth ratio y/D at which
  // Q / Q_full = (A / A_full) · (R / R_full)^(2/3), A = D²(θ − sin θ)/8, R = D(θ − sin θ)/(4θ),
  // y/D = (1 − cos(θ/2)) / 2; 1 when the pipe runs full (Q ≥ Q_full: surcharged, no freeboard).
  function depthRatio(r) {
    if (r == null || isNaN(r)) return null;
    if (r <= 0) return 0;
    if (r >= 1) return 1;
    const f = th => { const w = th - Math.sin(th); return w / (2 * Math.PI) * Math.pow(w / th, 2 / 3); };
    // f rises to its peak (≈1.076) at y/D ≈ 0.94; search below it.
    let lo = 0, hi = 5.278;
    for (let k = 0; k < 50; k++) { const m = (lo + hi) / 2; if (f(m) < r) lo = m; else hi = m; }
    return (1 - Math.cos(lo / 2)) / 2;
  }
  // Freeboard in a sewer: the room left between the water surface and the crown (mm, % of D).
  const freeboard = (dMm, r) => { const y = depthRatio(r); return y == null ? null : { y, mm: dMm * (1 - y), pct: (1 - y) * 100 }; };
  const fbText = (dMm, r) => { const f = freeboard(dMm, r); return !f ? 'n/a' : r >= 1 ? 'none (surcharged)' : `${fmtNum(Math.round(f.mm))} mm (${Math.round(f.pct)}% of D)`; };
  function pipeTip(i) {
    const s = pipeStats(i), p = s.p, D0 = MM().SEW.data;
    if (!PIPE_RESULTS) return window.PeelUtil.hoverCard({ kind: `Sanitary sewer${p[7] ? ` · ${p[7]}` : ''}`, name: `${p[0]} mm sanitary sewer`, value: fmtNum(Math.round(s.then.pop)), sub: `people upstream${s.then.jobs ? ` + ${fmtNum(roundPop(s.then.jobs))} jobs` : ''}`, html: `<span class="muted">${esc(D0.materials[p[8]] || '')} · pipe-by-pipe capacity results are hidden: the Region's model is the authority</span>`, also: 'Sewer profile from its scope' });
    return `<strong>${p[0]} mm sanitary sewer</strong>${p[7] ? ` · ${p[7]}` : ''} · ${esc(D0.materials[p[8]] || '')}${D0.risks[p[9]] && D0.risks[p[9]] !== 'INSIGNIFICANT' ? ` · risk ${esc(D0.risks[p[9]].toLowerCase())}` : ''}
      <br>Slope ${(p[1] * 100).toFixed(3)}% · full capacity ${s.cap ? `${fmtNum(s.cap)} L/s` : s.badSlope ? 'n/a (published slope not reliable)' : 'n/a (no slope)'}
      <br>Upstream: ${fmtNum(Math.round(s.then.pop))} people${s.then.jobs ? ` + ${fmtNum(roundPop(s.then.jobs))} jobs` : ''}
      <br>Existing peak dry ${fmtNum(Math.round(s.then.exist))} L/s${s.then.f !== 1 ? ` (×${s.then.f.toFixed(2)} measured)` : ''} + growth peak wet ${fmtNum(Math.round(s.then.growth))} L/s
      <br>Today ${fmtNum(Math.round(s.today.q))} L/s${s.r0 != null ? ` (${Math.round(s.r0 * 100)}%, ${MM().pipeState(s.r0)[3].toLowerCase()})` : ''} → ${MA().getCapYear() == null ? 'build-out' : MA().getCapYear()} ${fmtNum(Math.round(s.then.q))} L/s${s.r1 != null ? ` (<strong>${Math.round(s.r1 * 100)}%, ${MM().pipeState(s.r1)[3].toLowerCase()}</strong>)` : ''}
      ${s.r1 != null ? `<br>Freeboard ${MA().getCapYear() == null ? 'at build-out' : `in ${MA().getCapYear()}`}: ${fbText(p[0], s.r1)}` : ''}${s.growthShare != null ? `<br>Growth since the census uses ${Math.round(s.growthShare * 100)}% of its capacity` : ''}${p[11] < 1 ? `<br><span class="muted">carries ${Math.round(p[11] * 100)}% of the flow at a split</span>` : ''}
      <br><span class="muted">Screening only; tap for how it is calculated and what loads it</span>`;
  }
  function renderPipes(layer) {
    if (!MM().SEW.data) { loadSewers(); return; }
    const z = map.getZoom(), minD = z < 12 ? 900 : z < 13 ? 600 : z < 14 ? 375 : 300, lbls = [];
    const b = map.getBounds().pad(0.2);
    const ren = SD().svcRenderer;
    MM().SEW.data.pipes.forEach((p, i) => {
      if (p[0] < minD) return;
      const c = p[10]; if (!b.contains([c[1], c[0]]) && !b.contains([c[c.length - 1], c[c.length - 2]])) return;
      const s = pipeStats(i);
      L.polyline(pipeCoords(p).map(([x, y]) => [y, x]), { renderer: ren, pane: 'svcPane', color: PIPE_RESULTS ? pipeColour(s.r1) : token('--text-muted'), weight: Math.max(2, Math.min(7, p[0] / 300)), opacity: 0.9 })
        .bindTooltip(() => pipeTip(i), { sticky: true, className: 'pt' }).on('click', ev => { L.DomEvent.stop(ev); showPipeLoads(i); }).addTo(layer);
      // Zoomed in: each pipe's result (capacity used, the slider year) on it; with size labels on,
      // its size too.
      const pct = PIPE_RESULTS && z >= 16 && s.r1 != null ? `${Math.round(s.r1 * 100)}%` : '';
      if ((MM().pipeLbl && z >= 14) || pct) { const q = [], cc = p[10]; for (let k = 0; k < cc.length; k += 2) q.push([cc[k], cc[k + 1]]); lbls.push({ d: p[0], text: [MM().pipeLbl ? p[0] : '', pct].filter(Boolean).join(' · '), color: PIPE_RESULTS ? pipeColour(s.r1) : token('--text-muted'), lines: [q] }); }
    });
    if (lbls.length) EP().placePipeLabels(lbls, layer);
  }
  map.on('moveend', () => { if (MM().mstyle.cap === 'pipes') MA().renderCapLayer(); });
  // Tightest pipe on a development's path to the plant (build-out or the legend year).
  function pathPipes(p) {
    // Pipe-by-pipe results are off for now: no tightest pipe for verdicts, briefs or the FSR check.
    if (!PIPE_RESULTS || !MM().SEW.data || p.lat == null) return null;
    const G = sewerGrowth(); const k = G.devPipe.get(p) ?? nearestPipe(p.lng, p.lat);
    if (k < 0) return null;
    // Local vs trunk by pipe size (pipeClass: 750 mm and over is trunk), not by distance.
    let local = null, trunk = null, n = 0;
    for (let i = k, hop = 0; i >= 0 && hop < 2000; i = MM().SEW.data.pipes[i][3], hop++) {
      const s = pipeStats(i); n++;
      const slot = pipeClass(MM().SEW.data.pipes[i][0]);
      if (s.r1 != null) { if (slot === 'local' && (!local || s.r1 > local.r1)) local = { i, ...s }; if (slot === 'trunk' && (!trunk || s.r1 > trunk.r1)) trunk = { i, ...s }; }
    }
    return { first: k, local, trunk, worst: [local, trunk].filter(Boolean).sort((a, b) => b.r1 - a.r1)[0] || null, n };
  }
  const stateChip = (label, q, r) => { const st = MM().pipeState(r); return `<span class="chip pipe-st" style="--st:var(${st ? st[1] : '--nodata'})"><i aria-hidden="true"></i>${esc(String(label))} ${fmtNum(Math.round(q))} L/s${r != null ? ` · ${Math.round(r * 100)}% · <strong>${esc(st[3])}</strong>` : ' · no slope'}</span>`; };
  // Pipe length (m) from its drawn coordinates.
  const pipeLenM = i => { const c = pipeCoords(MM().SEW.data.pipes[i]); let t = 0; for (let k = 1; k < c.length; k++) t += DI().dcM(c[k - 1], c[k]); return t; };
  // How the flow in a pipe is worked out, step by step with its numbers, and its capacity and
  // surcharge state (Manning full-pipe capacity; a surcharged pipe needs a steeper hydraulic
  // gradient than its slope, Sf = S0 × (Q / Qfull)², so the water level rises above the crown).
  // Parts of the flow in pipe i for a year (as pipeFlow): existing and each growth component.
  function pipeParts(i, y) {
    const p = MM().SEW.data.pipes[i], G = sewerGrowth(), c = App().state.criteria, W = c.wastewater, E = c.employment;
    let { fa, fp, fb: fy = 1 } = y === 'today' ? { fa: 0, fp: 0 } : y == null ? { fa: 1, fp: 1 } : MA().hzFrac(y);
    if (!MM().wwOn('approved')) fa = 0; if (!MM().wwOn('proposed')) fp = 0;
    const fb = MM().wwOn('built') ? fy : 0;
    const M = App().state.svcModel, f = M && M.fOf ? M.fOf(MM().SEW.data.plants[p[6]]) || 1 : 1;
    const P0 = p[4], avg0 = P0 * W.avg / 86400, M0 = D.residentialPeaking(P0, W), exist = MM().wwOn('existing') ? avg0 * f * M0 : 0;
    const gp = fb * G.built.pop[i] + fa * G.approved.pop[i] + fp * G.proposed.pop[i];
    const gj = fb * G.built.jobs[i] + fa * G.approved.jobs[i] + fp * G.proposed.jobs[i];
    const gh = fb * G.built.ha[i] + fa * G.approved.ha[i] + fp * G.proposed.ha[i];
    const Mg = D.residentialPeaking(gp, W), Me = D.employmentPeaking(gj, E);
    const qr = gp * W.avg / 86400 * Mg, qe = gj * E.wastewater / 86400 * Me, qi = gh * W.infiltration;
    return { fa, fp, f, P0, avg0, M0, exist, gp, gj, gh, Mg, Me, qr, qe, qi, growth: qr + qe + qi, q: exist + qr + qe + qi };
  }
  // How the flow in a pipe is worked out: a results table (today and the slider year), each row
  // with an ⓘ that opens its formula with the numbers. Capacity: Manning full pipe; a surcharged
  // pipe needs a steeper hydraulic gradient than its slope, Sf = S0 × (Q / Qfull)².
  function pipeCalcHTML(i, s) {
    const p = s.p, c = App().state.criteria, W = c.wastewater, E = c.employment;
    const yr = MA().getCapYear() == null ? 'Build-out' : String(MA().getCapYear());
    const t = pipeParts(i, 'today'), b = pipeParts(i, MA().getCapYear());
    const d = p[0] / 1000, S = p[1], A = Math.PI * d * d / 4, R = d / 4, Qf = s.cap, Lm = pipeLenM(i);
    const n1 = v => fmt1(v), ls = v => `${n1(v)} L/s`, pct = r => r == null ? 'n/a' : `${Math.round(r * 100)}%`;
    const stCell = r => { const st = MM().pipeState(r); return st ? `<span class="pipe-st-dot" style="--st:${st[1]}"></span>${esc(st[3])}` : 'n/a'; };
    const phased = x => `built${x.fa ? ` + ${x.fa === 1 ? '' : `${Math.round(x.fa * 100)}% of `}approved` : ''}${x.fp ? ` + ${x.fp === 1 ? '' : `${Math.round(x.fp * 100)}% of `}proposed` : ''}`;
    const surch = r => { if (r == null || r <= 1 || !(S > 0)) return null; const Sf = S * r * r; return { Sf, dh: (Sf - S) * Lm }; };
    const sb = surch(s.r1), st0 = surch(s.r0);
    const rows = [
      ['exist', 'Existing (2021 Census) · peak dry', ls(t.exist), ls(b.exist),
        `${fmtNum(t.P0)} people upstream × ${W.avg} L/cap/d ÷ 86,400 = ${n1(t.avg0)} L/s average × Harmon peaking M = 1 + 14 / (4 + √(P/1000)) = ${t.M0.toFixed(2)} (kept between ${W.peakMin ?? 2} and ${W.peakMax ?? 4})${t.f !== 1 ? ` × ${t.f.toFixed(2)}, scaling to the plant's 2025 measured flow` : ''} = <strong>${ls(t.exist)}</strong>. Existing wet-weather I&amp;I isn't added: design I&amp;I on all existing land would overstate today's flow several times.`],
      ['res', 'Growth · residential', ls(t.qr), ls(b.qr),
        `Today (${phased(t)}): ${fmtNum(Math.round(t.gp))} people × ${W.avg} L/cap/d ÷ 86,400 × M ${t.gp > 0 ? t.Mg.toFixed(2) : '–'} = ${ls(t.qr)}.<br>${esc(yr)} (${phased(b)}): ${fmtNum(Math.round(b.gp))} people × ${W.avg} ÷ 86,400 × M ${b.gp > 0 ? b.Mg.toFixed(2) : '–'} = <strong>${ls(b.qr)}</strong>. People from units at Peel persons per unit; each development joins the nearest 300 mm+ sewer and its load is carried down the pipes.`],
      ['emp', 'Growth · employment', ls(t.qe), ls(b.qe),
        `Today: ${fmtNum(Math.round(t.gj))} jobs × ${E.wastewater} L/emp/d ÷ 86,400 × ${t.gj > 0 ? t.Me.toFixed(2) : '–'} = ${ls(t.qe)}.<br>${esc(yr)}: ${fmtNum(Math.round(b.gj))} jobs × ${E.wastewater} ÷ 86,400 × ${b.gj > 0 ? b.Me.toFixed(2) : '–'} = <strong>${ls(b.qe)}</strong>. Jobs from the floor area the applications state; peaking Harmon on jobs, kept between ${E.peakMin ?? 2} and ${E.peakMax ?? 4}.`],
      ['ii', 'Growth · I&amp;I', ls(t.qi), ls(b.qi),
        `Today: ${fmtNum(Math.round(t.gh))} ha × ${W.infiltration} L/s/ha = ${ls(t.qi)}.<br>${esc(yr)}: ${fmtNum(Math.round(b.gh))} ha of development sites × ${W.infiltration} L/s/ha = <strong>${ls(b.qi)}</strong> (Peel design inflow and infiltration on the new sites only).`],
      ['q', '<strong>Flow Q</strong>', `<strong>${ls(s.today.q)}</strong>`, `<strong>${ls(s.then.q)}</strong>`,
        `Q = existing + residential + employment + I&amp;I.<br>Today: ${n1(t.exist)} + ${n1(t.qr)} + ${n1(t.qe)} + ${n1(t.qi)} = ${ls(s.today.q)}.<br>${esc(yr)}: ${n1(b.exist)} + ${n1(b.qr)} + ${n1(b.qe)} + ${n1(b.qi)} = <strong>${ls(s.then.q)}</strong>${p[11] < 1 ? `. This pipe takes ${Math.round(p[11] * 100)}% of the flow at a split` : ''}.`],
      ['cap', 'Full-pipe capacity', Qf ? `${fmtNum(Qf)} L/s` : 'n/a', Qf ? `${fmtNum(Qf)} L/s` : 'n/a',
        `Manning, flowing full: Q<sub>full</sub> = (1/n) · A · R<sup>2/3</sup> · S<sup>1/2</sup>, n = 0.013.<br>D = ${p[0]} mm → A = π D² / 4 = ${A.toFixed(3)} m², R = D / 4 = ${R.toFixed(3)} m; S = ${(S * 100).toFixed(2)}% (published slope).<br>Q<sub>full</sub> = (1 / 0.013) × ${A.toFixed(3)} × ${R.toFixed(3)}<sup>2/3</sup> × ${S.toFixed(5)}<sup>1/2</sup> = <strong>${Qf ? `${fmtNum(Qf)} L/s` : 'n/a'}</strong>.${s.badSlope ? ` The published slope (${(S * 100).toFixed(3)}%) is under 0.01%, far flatter than the pipes either side: taken as a data error, so no capacity is computed and the pipe is left out of the tightest-pipe checks.` : ''}`],
      ['used', 'Capacity used', pct(s.r0), `<strong>${pct(s.r1)}</strong>`,
        `Q / Q<sub>full</sub>. Today ${n1(s.today.q)} / ${Qf ? fmtNum(Qf) : '–'} = ${pct(s.r0)}; ${esc(yr)} ${n1(s.then.q)} / ${Qf ? fmtNum(Qf) : '–'} = <strong>${pct(s.r1)}</strong>.`],
      ['state', 'State', stCell(s.r0), stCell(s.r1),
        `<span class="pipe-st-dot" style="--st:${MM().PIPE_CLS[0][1]}"></span>Free flowing under 85% of full-pipe capacity (open-channel flow, water below the crown) · <span class="pipe-st-dot" style="--st:${MM().PIPE_CLS[1][1]}"></span>Near full 85–100% (little room for peaks or more growth) · <span class="pipe-st-dot" style="--st:${MM().PIPE_CLS[2][1]}"></span>Surcharged over 100%: the pipe runs full under pressure.`],
    ];
    if (Qf) {
      const f0 = freeboard(p[0], s.r0), f1 = freeboard(p[0], s.r1), dep = (f, r) => !f ? 'n/a' : r >= 1 ? 'full' : `${fmtNum(Math.round(f.y * p[0]))} mm (${Math.round(f.y * 100)}%)`;
      rows.push(['depth', 'Flow depth', dep(f0, s.r0), dep(f1, s.r1),
        `Part-full flow in a circular pipe (Manning, n constant): the depth y at which Q / Q<sub>full</sub> = (A / A<sub>full</sub>) · (R / R<sub>full</sub>)<sup>2/3</sup>, with A = D²(θ − sin θ) / 8, R = D(θ − sin θ) / (4θ) and y / D = (1 − cos(θ/2)) / 2 (θ = angle the water surface subtends at the centre).<br>Today Q / Q<sub>full</sub> = ${pct(s.r0)} → y / D = ${f0 ? f0.y.toFixed(2) : '–'}; ${esc(yr)} ${pct(s.r1)} → y / D = <strong>${f1 ? f1.y.toFixed(2) : '–'}</strong> (D = ${p[0]} mm). Peak flow fills a pipe faster than its share of capacity: at 50% of Q<sub>full</sub> the water is already 50% deep, at 85% it is ≈ 70% deep.`]);
      rows.push(['fb', '<strong>Freeboard</strong>', fbText(p[0], s.r0), `<strong>${fbText(p[0], s.r1)}</strong>`,
        `Freeboard = D − y, the room between the water surface and the crown at peak wet weather.<br>Today ${p[0]} − ${f0 ? Math.round(f0.y * p[0]) : '–'} = ${fbText(p[0], s.r0)}; ${esc(yr)} ${p[0]} − ${f1 ? Math.round(f1.y * p[0]) : '–'} = <strong>${fbText(p[0], s.r1)}</strong>. Over 100% of Q<sub>full</sub> the pipe runs full: no freeboard, and the water rises above the crown (next row). A screen: the published network's slopes and Peel design flows, not a hydraulic model.`]);
    }
    if (sb || st0) rows.push(['sur', 'Surcharge · rise above crown', st0 ? `≈${st0.dh.toFixed(2)} m` : '–', sb ? `<strong>≈${sb.dh.toFixed(2)} m</strong>` : '–',
      `A surcharged pipe needs a hydraulic grade line steeper than its slope: S<sub>f</sub> = S × (Q / Q<sub>full</sub>)².${sb ? `<br>${esc(yr)}: ${(S * 100).toFixed(2)}% × ${s.r1.toFixed(2)}² = ${(sb.Sf * 100).toFixed(2)}%. Over this ${fmtNum(Math.round(Lm))} m pipe the water level rises (S<sub>f</sub> − S) × L = (${(sb.Sf * 100).toFixed(2)}% − ${(S * 100).toFixed(2)}%) × ${fmtNum(Math.round(Lm))} m ≈ <strong>${sb.dh.toFixed(2)} m</strong> more than the pipe falls, above its crown, and backs up into the pipes upstream.` : ''}${st0 ? `<br>Today: S<sub>f</sub> = ${(st0.Sf * 100).toFixed(2)}% → ≈${st0.dh.toFixed(2)} m.` : ''}`]);
    return `<details class="sect calc" open><summary><h2 class="section-title">How the flow is calculated</h2><span class="muted small sect-sum">${ls(s.then.q)} of ${Qf ? `${fmtNum(Qf)} L/s` : 'n/a'} · ${MM().pipeState(s.r1) ? esc(MM().pipeState(s.r1)[3]) : ''}</span></summary>
      <table class="dt calc-table"><thead><tr><th>Result</th><th>Today</th><th>${esc(yr)}</th></tr></thead><tbody>
        ${rows.map(([k, label, a, z, how]) => `<tr class="calc-row"><td><button type="button" class="calc-i" data-calc="${k}" aria-expanded="false" aria-label="How: ${esc(label.replace(/<[^>]+>/g, ''))}">ⓘ</button>${label}</td><td>${a}</td><td>${z}</td></tr>
        <tr class="calc-how" data-calc-how="${k}" hidden><td colspan="3">${how}</td></tr>`).join('')}
      </tbody></table>
      <p class="small muted">Tap ⓘ for how each result is worked out. Today = existing + growth built since the census; ${esc(yr)} follows the Demand year on the map (Horizon years). A screen, not a hydraulic model: wet-weather I&amp;I on existing areas, downstream backwater, storage and relief sewers are not modelled.</p></details>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('.calc-i'); if (!b) return;
    const how = b.closest('table').querySelector(`[data-calc-how="${b.dataset.calc}"]`); if (!how) return;
    how.hidden = !how.hidden; b.setAttribute('aria-expanded', String(!how.hidden)); b.classList.toggle('on', !how.hidden);
  });
  function showPipeLoads(i) {
    const G = sewerGrowth(), s = pipeStats(i), p = s.p;
    const up = [];
    for (const [dev, k] of G.devPipe) {
      let hit = false; for (let j = k, hop = 0; j >= 0 && hop < 2000; j = MM().SEW.data.pipes[j][3], hop++) if (j === i) { hit = true; break; }
      if (hit) { const e = D.estimate([dev], App().state.criteria, 'all', App().jobsOf); up.push({ dev, e, q: e.combined.wastewater.wetPeak }); }
    }
    up.sort((a, b) => b.q - a.q);
    // Phase 3b pop-up actions: re-run, and the pipe upgrade tool (sibling module, guarded).
    const pActs = [TS().ptBtn('ploads', i, 'What loads this?', 'Re-run this analysis (picks up scenario changes)'),
      PIPE_RESULTS && TS().ptBtn('upgrade', i, 'Upgrade this pipe', 'Open the pipe upgrade tool for this sewer')].filter(Boolean);
    const html = `
      <div class="head"><h3>${p[0]} mm sanitary sewer</h3><div class="m">${esc(MM().SEW.data.plants[p[6]] === 'Toronto' ? 'City of Toronto system' : SD().plantLabel(MM().SEW.data.plants[p[6]]))} sewershed · slope ${(p[1] * 100).toFixed(2)}% · full capacity ${s.cap ? `${fmtNum(s.cap)} L/s` : 'n/a'}${p[7] ? ` · installed ${p[7]}` : ''}</div></div>
      ${TS().ptActions(pActs)}
      ${PIPE_RESULTS ? `<div class="chips">${stateChip('Today', s.today.q, s.r0)}${stateChip(MA().getCapYear() == null ? 'Build-out' : MA().getCapYear(), s.then.q, s.r1)}${s.r1 != null ? `<span class="chip">Freeboard ${fbText(p[0], s.r1)}</span>` : ''}${s.growthShare != null ? `<span class="chip">Growth uses ${Math.round(s.growthShare * 100)}%</span>` : ''}</div>
      <p class="small"><button type="button" class="btn small" data-profile="pipe:${i}"><span aria-hidden="true">⌇</span> Sewer profile downstream</button></p>
      ${pipeCalcHTML(i, s)}` : `${SCREEN_NOTE}<p class="small muted">Pipe-by-pipe capacity results (load, % full, freeboard, profile) are hidden for now: the Region's hydraulic model is the authority for individual pipes. Below: the developments draining through this pipe.</p>`}

      <table class="dt loads-table"><caption>${fmtNum(up.length)} developments since the census draining through this pipe, largest peak wet first</caption>
        <thead><tr><th>Development</th><th>People + jobs</th><th>Peak wet</th></tr></thead>
        <tbody>${up.slice(0, 50).map(r => `<tr class="ld-row" data-dev="${esc(r.dev.key)}" tabindex="0"><td>${dot(r.dev.phase)} ${esc(r.dev.title)}<small><span class="lg-sw" style="--mk:${MM().layerColors()[MM().svcLayerOf(r.dev)]}"></span>${esc(MM().LAYER_NAME[MM().svcLayerOf(r.dev)])} · ${esc(r.dev.municipality)}</small></td><td>${fmtNum(roundPop(r.e.population + r.e.employment.jobs))}</td><td>${uLs(r.q)}</td></tr>`).join('')}</tbody></table>
      <p class="small muted">Existing: ${fmtNum(p[4])} people upstream (2021 Census) at peak dry weather, ${s.today.f !== 1 ? `scaled ×${s.today.f.toFixed(2)} to the plant's 2025 measured flow (capacity check)` : 'at design rates'}; growth since the census at Peel design peak wet weather (Harmon, employment rates, I&amp;I ${App().state.criteria.wastewater.infiltration} L/s/ha on its site area). Full-pipe capacity by Manning (n 0.013) on the published slope. A screen for where to look, not a hydraulic model: existing wet-weather inflow and infiltration, surcharge, storage and relief sewers are not modelled. Developments join the nearest sewer of 300 mm or more.</p>`;
    TS().loadsOf = { pipe: i };
    TS().toolResult('pipe', `${p[0]} mm sanitary sewer`, html, () => showPipeLoads(i), { ref: `pipe:${i}`, devKeys: up.map(r => r.dev.key) });
  }


  // ---- SWMM export: the 40 wastewater blocks as a SWMM 5 skeleton -------------------------------
  // One junction per block outlet, a conduit to the block it drains into (straight line, the
  // block's largest trunk size, the slope of the trunk sewer nearest its outlet; inverts relative to
  // the plant end, datum 0 m), dry weather flow by block at the Demand year (census + growth, Peel
  // criteria) with a diurnal pattern, and rainfall-derived I&I (RTK unit hydrographs on each block's
  // sewered area) from the design storm: a Chicago hyetograph from the MTO IDF curves (the wet
  // weather scenario's storm and climate, 25-year otherwise). RTK values are typical starting
  // values to calibrate against the Region's flow monitoring.
  function chicago(a, b, hours = 4, r = 0.375, stepMin = 5) {
    const D = (tau, f) => f * a * Math.pow(tau / f, 1 + b);   // depth within tau hours of the peak, on one side
    const n = Math.round(hours * 60 / stepMin), tp = hours * r, out = [];
    for (let k = 0; k < n; k++) {
      const t0 = k * stepMin / 60, t1 = (k + 1) * stepMin / 60;
      const depth = t1 <= tp ? D(tp - t0, r) - D(tp - t1, r) : t0 >= tp ? D(t1 - tp, 1 - r) - D(t0 - tp, 1 - r) : D(tp - t0, r) + D(t1 - tp, 1 - r);
      out.push(depth / (stepMin / 60));   // mm/h over the step
    }
    return out;
  }
  function swmmInp() {
    const M = App().state.svcModel, bl = App().state.servicing.drainage.filter(d => d.kind === 'block'), c = App().state.criteria, E = c.employment;
    const byId = new Map(bl.map(d => [d.block, d]));
    const y = MA().getCapYear(), f = y == null ? { fa: 1, fp: 1 } : MA().hzFrac(y);
    const rp = App().state.wet.rp || 25, clim = App().state.wet.rp ? App().state.wet.clim : 'none', P = Sett().IDF.data ? Sett().IDF.data.peel[String(rp)] : { a: 39.17, b: -0.699 };
    const scale = Sett().IDF.data ? Sett().wetIntensity(rp, clim) / Sett().wetIntensity(rp, 'none') : 1;
    const storm = chicago(P.a * scale, P.b);
    const slopeAt = d => { if (!MM().SEW.data || !d.outletAt) return 0.002; const k = nearestPipe(d.outletAt[0], d.outletAt[1], 300); return k >= 0 && MM().SEW.data.pipes[k][1] > 0 ? MM().SEW.data.pipes[k][1] : 0.002; };
    const hav = ([x1, y1], [x2, y2]) => { const R = 6371000, r = Math.PI / 180, dy = (y2 - y1) * r, dx = (x2 - x1) * r; const h = Math.sin(dy / 2) ** 2 + Math.cos(y1 * r) * Math.cos(y2 * r) * Math.sin(dx / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
    const len = d => { const n = d.downstream && byId.get(d.downstream.replace(/^dr:B/, '')); return n && d.outletAt && n.outletAt ? Math.max(100, hav(d.outletAt, n.outletAt)) : 200; };
    // Inverts: 0 m at each plant's last block, rising upstream by slope × length.
    const inv = new Map(), invOf = d => { if (inv.has(d.id)) return inv.get(d.id); const n = d.downstream && SD().svcById.get(d.downstream); const v = n && n !== d ? invOf(n) + slopeAt(d) * len(d) : 0; inv.set(d.id, v); return v; };
    const id = d => `B${d.block}`, L = [];
    const dwf = d => { const l = M && M.local.get(d.id); if (!l) return 0; const pop = l.census + l.built + l.approved * f.fa + l.proposed * f.fp, jobs = (l.jbuilt || 0) + (l.japproved || 0) * f.fa + (l.jproposed || 0) * f.fp; return pop * c.wastewater.avg / 86400 + jobs * E.wastewater / 86400; };
    L.push('[TITLE]', `Region of Peel wastewater blocks: SWMM skeleton from the Peel Growth Pipeline (unofficial) (${new Date().toISOString().slice(0, 10)})`, `Dry weather flow at ${y == null ? 'build-out' : y}; design storm ${rp}-year, 4-hour Chicago (MTO IDF${clim !== 'none' ? `, ${Sett().WET_CLIM[clim]}` : ''}). Inverts relative (plant end = 0 m). RTK values are placeholders to calibrate.`, '');
    L.push('[OPTIONS]', 'FLOW_UNITS LPS', 'INFILTRATION HORTON', 'FLOW_ROUTING DYNWAVE', 'START_DATE 01/01/2026', 'START_TIME 00:00:00', 'END_DATE 01/02/2026', 'END_TIME 00:00:00', 'REPORT_STEP 00:05:00', 'WET_STEP 00:05:00', 'DRY_STEP 01:00:00', 'ROUTING_STEP 0:00:10', 'ALLOW_PONDING NO', '');
    L.push('[RAINGAGES]', ';Name Format Interval SCF Source', 'RG1 INTENSITY 0:05 1.0 TIMESERIES STORM', '');
    L.push('[JUNCTIONS]', ';Name Elevation MaxDepth InitDepth SurDepth Aponded');
    for (const d of bl) L.push(`${id(d)} ${invOf(d).toFixed(2)} ${(Math.max(3, (d.trunkMm || 600) / 1000 + 3)).toFixed(1)} 0 0 0`);
    const outs = bl.filter(d => !d.downstream || !byId.get(d.downstream.replace(/^dr:B/, '')));
    L.push('', '[OUTFALLS]', ';Name Elevation Type'); for (const d of outs) L.push(`OF_${id(d)} ${(-0.2).toFixed(2)} FREE NO`);
    L.push('', '[CONDUITS]', ';Name From To Length Roughness InOffset OutOffset');
    for (const d of bl) { const n = d.downstream && byId.get(d.downstream.replace(/^dr:B/, '')); L.push(`C_${id(d)} ${id(d)} ${n ? id(n) : `OF_${id(d)}`} ${Math.round(len(d))} 0.013 0 0`); }
    L.push('', '[XSECTIONS]', ';Link Shape Geom1 Geom2 Geom3 Geom4 Barrels');
    for (const d of bl) L.push(`C_${id(d)} CIRCULAR ${((d.trunkMm || 600) / 1000).toFixed(3)} 0 0 0 1`);
    L.push('', '[DWF]', ';Node Constituent Baseline Patterns');
    for (const d of bl) { const q = dwf(d); if (q > 0) L.push(`${id(d)} FLOW ${q.toFixed(2)} "DIURNAL"`); }
    L.push('', '[PATTERNS]', ';Typical residential diurnal pattern (hourly multipliers, mean 1.0)');
    const pat = [0.62, 0.52, 0.46, 0.43, 0.45, 0.58, 0.88, 1.24, 1.38, 1.33, 1.25, 1.16, 1.1, 1.04, 0.99, 0.97, 1.0, 1.1, 1.24, 1.3, 1.27, 1.18, 1.0, 0.77];
    L.push(`DIURNAL HOURLY ${pat.slice(0, 6).join(' ')}`, ...[6, 12, 18].map(k => `DIURNAL ${pat.slice(k, k + 6).join(' ')}`));
    L.push('', '[HYDROGRAPHS]', ';Name Raingage / Month Response R T K', 'RTK RG1', 'RTK All Short 0.010 1.0 2.0', 'RTK All Medium 0.012 4.0 3.0', 'RTK All Long 0.008 12.0 4.0');
    L.push('', '[RDII]', ';Node UnitHydrograph SewerArea(ha)'); for (const d of bl) if ((d.areaHa || 0) > 0) L.push(`${id(d)} RTK ${(d.areaHa).toFixed(1)}`);
    L.push('', '[TIMESERIES]', ';Name Time Value (mm/h)'); storm.forEach((v, k) => L.push(`STORM ${String(Math.floor((k * 5) / 60)).padStart(1, '0')}:${String((k * 5) % 60).padStart(2, '0')} ${v.toFixed(2)}`)); L.push(`STORM 4:00 0`);
    L.push('', '[COORDINATES]', ';Node X-Coord Y-Coord (longitude, latitude)');
    for (const d of bl) if (d.outletAt) L.push(`${id(d)} ${d.outletAt[0]} ${d.outletAt[1]}`);
    for (const d of outs) if (d.outletAt) L.push(`OF_${id(d)} ${(d.outletAt[0] + 0.002).toFixed(5)} ${(d.outletAt[1] - 0.002).toFixed(5)}`);
    L.push('');
    return L.join('\n');
  }
  // SWMM 5 model of the wastewater blocks (was a per-panel export-bar button; now a top-bar Export menu item).
  function exportSwmmModel() {
    if (!App().state.svcModel) return;
    const go = () => Ex().download(`peel-blocks-swmm-${MA().getCapYear() == null ? 'buildout' : MA().getCapYear()}.inp`, window.PeelUtil.CSV_DISCLAIMER.replace(/^# /gm, ';; ') + swmmInp(), 'text/plain');
    if (!MM().SEW.data) loadSewers().then(go); else go();
  }

  const api = {
    loadSewers, pipeCoords, nearestPipe, sewerGrowth, pipeFlow, pipeSummary,
    pipeColour, pipeStats, depthRatio, freeboard, fbText, pipeTip,
    renderPipes, pathPipes, pipeCalcHTML, showPipeLoads, exportSwmmModel,
    swmmInp, chicago,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSewerCap = api;
})(typeof window !== 'undefined' ? window : globalThis);
