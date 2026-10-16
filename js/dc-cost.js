(function (root) {
  'use strict';
  const { esc, fmtNum, roundPop, store, fmtMoney, capitalStatus, toDollarYear, capitalChip, chartW } = window.PeelUtil;
  const D = window.PeelDemand;
  const App = () => window.PeelApp;
  const MP = () => window.PeelMasterPlan;
  const DI = () => window.PeelDcInfra;
  const MM = () => window.PeelMapMarkers;
  const MA = () => window.PeelMapAnalysis;
  const SP = () => window.PeelSvcPlants;

  // ---- DC cost and revenue ---------------------------------------------------------------------
  // data/dc-costs.json (scripts/build-dc-costs.py): the 2020 DC Background Study's gross and
  // DC-recoverable cost by component (2020$), matched to the 2026 DC maps by component number, and
  // the Region's water / wastewater DCs per unit.
  // Components of a relief (the planned main's segments, or the facility items it stands for).
  function reliefComps(r) {
    if (!r || !App().state.dcInfra) return [];
    if (r.ln) { const id = r.ln.p || r.ln.c; return [...new Set(App().state.dcInfra[r.ln.sys].lines.filter(x => (x.p || x.c) === id).map(x => x.c).filter(Boolean))]; }
    const items = r.kind === 'step' ? (r.fc ? r.fc.items.filter(i => r.step.proj && i.proj === r.step.proj) : []) : r.items || (r.fc ? r.fc.items : []);
    return [...new Set(items.flatMap(i => (i.phases || []).map(ph => ph[2])).filter(Boolean))];
  }
  // Cost of a relief: the priced components (2020 study, indexed to 2026$ like every other cost)
  // and how many of its components have a price.
  function dcCost(r) {
    const K = App().state.dcCosts, C = K && K.components, ids = reliefComps(r);
    if (!C || !ids.length) return null;
    const sys = r.ln ? r.ln.sys : r.fc ? r.fc.sys : null, ix = (K.index2026 && sys && K.index2026[sys]) || 1;
    let gross = 0, dc = 0, n = 0;
    for (const id of ids) { const c = C[id]; if (c) { gross += c.gross * ix; dc += c.dc * ix; n++; } }
    return { gross, dc, n, of: ids.length };
  }
  // Full cost of a relief in 2026$ (funding scenario): priced components indexed from 2020$ by the
  // DC rate indexing; mains the 2020 study doesn't price at the fitted cost per metre for their
  // diameter × length; facility items by their 2020 project number, else the median priced item of
  // the same kind. est = share of the cost that is estimated.
  const lineLen = g => { let t = 0; for (let i = 1; i < g.length; i++) { const [x1, y1] = g[i - 1], [x2, y2] = g[i]; t += Math.hypot((x2 - x1) * 111320 * Math.cos(y1 * Math.PI / 180), (y2 - y1) * 111320); } return t; };
  function costEstimate(r) {
    const K = App().state.dcCosts; if (!K || !K.unitCost || !App().state.dcInfra || !r) return null;
    const sys = r.ln ? r.ln.sys : r.fc ? r.fc.sys : null; if (!sys) return null;
    const ix = K.index2026[sys], C = K.components;
    let gross = 0, dc = 0, est = 0;
    const add = (g, d, isEst) => { gross += g; dc += d; if (isEst) est += g; };
    if (r.ln) {
      const id = r.ln.p || r.ln.c, byC = new Map();
      App().state.dcInfra[sys].lines.filter(x => (x.p || x.c) === id).forEach((x, i) => { const k = x.c || `_${i}`; const o = byC.get(k) || byC.set(k, { len: 0, d: x.d }).get(k); o.len += lineLen(x.g); o.d = o.d || x.d; });
      for (const [c, o] of byC) {
        const p = C[c]; if (p) { add(p.gross * ix, p.dc * ix, false); continue; }
        const u = K.unitCost[sys], g = u.a * Math.pow((o.d || r.ln.d || 600) / 1000, u.b) * o.len * ix; add(g, g * K.dcShare[sys], true);
      }
    } else {
      const items = r.kind === 'step' ? (r.fc ? r.fc.items.filter(i => r.step.proj && i.proj === r.step.proj) : []) : r.items || (r.fc ? r.fc.items : []);
      const sc = r.kind === 'step' && !items.length && K.stepCosts && K.stepCosts[`${r.step.year}:${r.step.mld}`];
      if (sc) { const g = toDollarYear(sc.gross, sc.year || 2026, ix); add(g, g * K.dcShare[sys], false); }   // e.g. G.E. Booth's $130 M (2024$)
      for (const it of items) {
        const ph = (it.phases || []).map(x => x[2]).filter(Boolean), pr = ph.filter(c => C[c]);
        if (pr.length) { const g0 = pr.reduce((t, c) => t + C[c].gross, 0), d0 = pr.reduce((t, c) => t + C[c].dc, 0), k = ph.length / pr.length; add(g0 * ix, d0 * ix, false); if (k > 1) add(g0 * ix * (k - 1), d0 * ix * (k - 1), true); continue; }
        const pj = it.proj && K.projects[it.proj.replace('-', '')];
        if (pj) { add(pj.gross * ix, pj.dc * ix, false); continue; }
        const other = sys === 'water' ? 'wastewater' : 'water', med = K.facilityMedian[`${sys}:${r.fc.kind}`] ?? K.facilityMedian[`${other}:${r.fc.kind}`] ?? K.facilityMedian[`${sys}:plant`];
        if (med) add(med * ix, med * ix * K.dcShare[sys], true);
      }
    }
    return gross > 0 ? { gross, dc, est: est / gross } : null;
  }
  // Funding scenario: a DC budget (2026$, DC-recoverable share) over the next `years` years. The
  // projects coming online in that window are funded in order: those approved in the 2026 capital
  // program first (committed), then by growth they let through by the window's last year per
  // dollar; whatever doesn't fit is deferred. Projects no growth relies on in the window are
  // deferred first. Deferring holds back the growth each project carries (its "if cancelled"
  // impact by that year); combined, between the largest single constraint and the sum.
  function dcaBudget(budget, years = 10) {
    const R = dcAnalysis(), end = MM().THIS_YEAR + years - 1, yi = Math.max(0, R.years.indexOf(Math.min(end, R.years[R.years.length - 1])));
    const rows = R.list.filter(r => !r.y || r.y <= end).map(r => { const c = costEstimate(r.r); return { ...r, c, cost: c ? c.dc : 0, v: r.ys[yi], committed: r.status === 'approved' || !!(r.r && r.r.kind === 'step' && !r.r.step.proj) }; });
    const order = rows.slice().sort((a, b) => (b.committed - a.committed) || ((b.v > 0) - (a.v > 0)) || (b.v / Math.max(b.cost, 1e5) - a.v / Math.max(a.cost, 1e5)) || (a.y || 9999) - (b.y || 9999));
    // Growth-driven projects first; then, with money left, those no modelled growth needs in the
    // window (condition, security, transients, growth beyond the applications), earliest first.
    let spent = 0; const keep = [], defer = [];
    for (const r of order) if (r.committed || (r.v > 0 && spent + r.cost <= budget)) { keep.push(r); spent += r.cost; r.other = false; }
    for (const r of order.filter(x => !keep.includes(x)).sort((a, b) => ((b.v > 0) - (a.v > 0)) || (a.y || 9999) - (b.y || 9999))) {
      if (r.v <= 0 && spent + r.cost <= budget) { keep.push(r); spent += r.cost; r.other = true; } else defer.push(r);
    }
    // Combined effect of deferring them all: replay the constraints without the deferred projects.
    const off = new Set(defer.map(r => r.key)), none = new Set();
    let lower = 0; for (const c of new Set(defer.flatMap(r => r.cons))) lower = Math.max(lower, Math.max(0, MP().heldPeople(c, end, off) - MP().heldPeople(c, end, none)));
    lower += defer.reduce((t, r) => t + (r.conn || []).reduce((a, x) => a + x.e.population * MA().hzFrac(end)[x.lay === 'approved' ? 'fa' : 'fp'], 0), 0);
    const upper = defer.reduce((t, r) => t + r.v, 0);
    // Later projects that screen late (capacity runs out before they are in service).
    const later = R.list.filter(r => r.y && r.y > end && r.rec === 'advance').map(r => ({ ...r, cost: (costEstimate(r.r) || {}).dc || 0 }));
    return { budget, years, end, rows, keep, defer, spent, later, total: rows.reduce((t, r) => t + r.cost, 0), committed: keep.filter(r => r.committed).reduce((t, r) => t + r.cost, 0), lower: Math.min(lower, upper), upper, est: rows.reduce((t, r) => t + (r.c ? r.c.gross * r.c.est : 0), 0) / Math.max(1, rows.reduce((t, r) => t + (r.c ? r.c.gross : 0), 0)), ppu: R.ppu, rate: R.rate };
  }
  const DCB = { budget: store.get('dcaBudget', 1e9), years: 10 };
  // Phase 4: the funding scenario's keep/defer lists merged into one recommendations table.
  // Pure merge: [{ dec: 'Keep' | 'Defer', r }] — kept projects in funding order, deferred by impact.
  function dcaMergeRecs(B) {
    return [...B.keep.map(r => ({ dec: 'Keep', r })), ...B.defer.slice().sort((a, b) => b.v - a.v).map(r => ({ dec: 'Defer', r }))];
  }
  // Funding-screen row cells: project, online, DC cost, growth, $/person, why.
  function dcbCells(r, kept, B, pp, uu) {
    return `<td>${r.sys === 'water' ? '💧 ' : ''}${esc(r.name)}${r.committed ? '<small>committed (approved 2026)</small>' : ''}</td><td>${r.y || '–'}${r.cap ? capitalChip(r.cap) : ''}</td><td>${r.cost ? fmtMoney(r.cost) : '<span class="muted">not costed</span>'}${r.c && r.c.est > 0.5 ? '<small>estimated</small>' : r.c && r.c.est > 0 ? '<small>part estimated</small>' : ''}</td>
      <td>${r.v > 0 ? `${pp(r.v)} people<small>≈${uu(r.v)} units by ${B.end}</small>` : `<span class="muted">none by ${B.end}</span>`}</td><td>${r.v > 0 && r.cost ? fmtMoney(r.cost / r.v) : '–'}</td>
      <td>${kept ? (r.committed ? 'Committed in the 2026 capital program' : r.other ? `Funded from what's left: no modelled growth needs it by ${B.end} (other drivers)` : `Lets through ${pp(r.v)} people by ${B.end}`) : r.v > 0 ? `<strong>Outside the screen:</strong> ${pp(r.v)} people screen constrained by ${B.end}${r.firstY ? ` (from ≈${r.firstY})` : ''}${B.rate ? `, ≈${fmtMoney(r.v / B.ppu * B.rate)} DCs later` : ''}` : r.firstY && r.firstY > B.end ? `Not needed until ≈${r.firstY}` : 'No growth relies on it in this screen'}</td>`;
  }
  // One merged funding-screen row: the screening result first, then the project cells.
  function dcaRecRow(x, B, pp, uu) {
    const kept = x.dec === 'Keep';
    return `<tr class="${kept ? 'dca-keep' : 'dca-defer dcb-def'}"><td><span class="dca-rec">${DEC[x.dec]}</span></td>${dcbCells(x.r, kept, B, pp, uu)}</tr>`;
  }
  // Funding curve data: the funding screen replayed at several budget levels.
  function dcaCurve(B) {
    return [0.5e9, 1e9, 2e9, 3e9, 5e9].filter(b => b < B.total).concat([B.total]).map(b => ({ b, x: b === DCB.budget ? B : dcaBudget(b, DCB.years) }));
  }
  // One-line method / criteria / data-dates note, collapsed to a single line.
  const dcaInfo = body => `<details class="svc-notes"><summary>ⓘ Method, criteria &amp; data dates</summary><p class="small muted">${body}</p></details>`;
  // Bundle 5: a project's names. short: the plain name for a sentence or a row (no ID); pid: the DC
  // project ID, shown on the row ("project 25-2945"), never inside a sentence; tag: the chart label,
  // a short name and the ID ("G.E. Booth to 600 ML/d · 25-2945", "Feeder main 750 mm · 31-1199").
  const KIND_SHORT = { primary: 'Trunk sewer', local: 'Local sewer', force: 'Force main', transmission: 'Transmission main', feeder: 'Feeder main' };
  function projLabels(o) {
    if (o.k) {
      const kind = (DI && DI() && DI().DC_KIND && DI().DC_KIND[o.k] ? DI().DC_KIND[o.k][0] : KIND_SHORT[o.k]) || 'Main', mm = o.d ? ` ${o.d} mm` : '';
      return { short: `${kind}${mm}`, pid: o.id || '', tag: `${KIND_SHORT[o.k] || kind}${mm}${o.id ? ` · ${o.id}` : ''}` };
    }
    if (o.plant) {
      const pl = String(o.plant).replace(/\s+(WRRF|WWTP)\b.*$/, '');
      return { short: `${o.plant}: expansion to ${o.mld} ML/d`, pid: o.id || '', tag: `${pl} to ${o.mld} ML/d${o.id ? ` · ${o.id}` : ''}` };
    }
    return { short: o.text || '', pid: '', tag: o.text || '' };
  }
  // A project is late when it comes online after the capacity it relieves runs out; close when it
  // comes online in the two years before (the chart and the page lead with both).
  const CLOSE_YEARS = 2;
  const timingOf = r => (r.outY != null && r.y != null ? (r.outY < r.y ? 'late' : r.outY - r.y <= CLOSE_YEARS ? 'close' : 'ok') : 'ok');
  // The chart's rows: the late projects, then the close ones (soonest run-out first), then the
  // largest impact to fill up to n; the rest are counted ("N more on time").
  function timingRows(list, n = 6) {
    const rank = { late: 0, close: 1, ok: 2 }, yr = r => (r.outY == null ? 9999 : r.outY);
    const lead = list.filter(r => timingOf(r) !== 'ok').sort((a, b) => rank[timingOf(a)] - rank[timingOf(b)] || yr(a) - yr(b) || b.bo - a.bo);
    const rest = list.filter(r => timingOf(r) === 'ok').sort((a, b) => b.bo - a.bo);
    const rows = [...lead, ...rest].slice(0, n);
    return { rows, more: list.length - rows.length };
  }
  // Timing chart: capacity runs out vs online year, labelled by short name + ID at body size, with
  // an "after <end>" column; drawn at its width (never scaled up).
  function dcaTimingChart(list, n = 6) {
    const { rows, more } = timingRows(list || [], n);
    if (!rows.length) return '';
    const W = chartW(320, 760), L0 = Math.min(250, Math.round(W * 0.45)), R0 = 12, T0 = 12, RH = 26, B0 = 26, H = T0 + rows.length * RH + B0;
    const x0 = MM().THIS_YEAR, x1 = SP().hz.end, AFTER = 9;
    const x = y => L0 + (W - L0 - R0) * (Math.min(Math.max(y, x0), x1 + AFTER) - x0) / Math.max(1, x1 + AFTER - x0);
    const yOf = i => T0 + i * RH + RH / 2;
    // (every ten years when the plot is narrow, so the labels never touch)
    const every = W - L0 < 380 ? 10 : 5, ticks = []; for (let y = x0; y <= x1; y += every) ticks.push(y); if (x1 - ticks[ticks.length - 1] >= every * 0.7) ticks.push(x1);
    const nMax = Math.max(14, Math.floor((L0 - 10) / 6.6)), cut = s => { s = String(s || ''); return s.length > nMax ? `${s.slice(0, nMax - 1)}…` : s; };
    const col = r => (timingOf(r) === 'late' ? 'var(--cap-over)' : timingOf(r) === 'close' ? 'var(--cap-tight)' : 'var(--cap-room)');
    const aft = x(x1 + AFTER * 0.6);
    return `<h3 class="sub-title pnl-chart-t">When the capacity runs out vs when the project is in service <span class="pnl-chart-u">(year)</span></h3>
    <svg class="dca-chart dca-tl" viewBox="0 0 ${W} ${H}" style="max-width:${W}px" role="img" aria-label="For ${rows.length} DC projects, late or close first: the year the capacity runs out and the year the project is in service">
      ${ticks.map(y => `<line x1="${x(y).toFixed(1)}" x2="${x(y).toFixed(1)}" y1="${T0 - 4}" y2="${H - B0}" class="dca-grid"/><text x="${x(y).toFixed(1)}" y="${H - 8}" class="dca-ax" text-anchor="middle">${y}</text>`).join('')}
      <line x1="${x(x1 + 0.5).toFixed(1)}" x2="${x(x1 + 0.5).toFixed(1)}" y1="${T0 - 4}" y2="${H - B0}" class="dca-grid" stroke-dasharray="3 3"/><text x="${aft.toFixed(1)}" y="${H - 8}" class="dca-ax" text-anchor="middle">after ${x1}</text>
      ${rows.map((r, i) => {
        const c = col(r), xo = r.outY == null ? aft : x(r.outY), xn = r.y == null ? null : x(r.y), yc = yOf(i).toFixed(1);
        return `<text x="${L0 - 8}" y="${(yOf(i) + 4).toFixed(1)}" class="dca-lab" text-anchor="end"><title>${esc(r.name)}</title>${esc(cut(r.tag || r.name))}</text>`
          + (xn == null ? '' : `<line x1="${Math.min(xo, xn).toFixed(1)}" x2="${Math.max(xo, xn).toFixed(1)}" y1="${yc}" y2="${yc}" style="stroke:${c};stroke-width:3;stroke-linecap:round;opacity:.5"/>`)
          + `<circle cx="${xo.toFixed(1)}" cy="${yc}" r="4.5" style="fill:${c}"/>`
          + (xn == null ? '' : `<circle cx="${xn.toFixed(1)}" cy="${yc}" r="5" fill="none" style="stroke:${c};stroke-width:2"/>`);
      }).join('')}
    </svg>
    <p class="small muted dca-key">● capacity runs out · ○ in service · <span class="t-over">red: in service after it runs out</span> · <span class="t-tight">amber: in service within ${CLOSE_YEARS} years of it</span>${more > 0 ? ` · <strong>${more} more</strong> in time` : ''}</p>`;
  }
  // Recommendations chart: growth relying on each project by the window's last year (top 10).
  function dcaRecChart(items, end) {
    const top = items.slice().sort((a, b) => b.r.v - a.r.v).slice(0, 10).filter(x => x.r.v > 0);
    if (!top.length) return '';
    const W = chartW(320, 760), L0 = Math.min(200, Math.round(W * 0.38)), R0 = Math.min(110, Math.round(W * 0.22)), T0 = 8, RH = 24, B0 = 20, H = T0 + top.length * RH + B0;
    const max = Math.max(...top.map(x => x.r.v));
    const bw = v => Math.max(2, (W - L0 - R0) * v / max);
    const pp = v => fmtNum(roundPop(v));
    const nMax = Math.max(12, Math.floor((L0 - 10) / 6.2)), short = s => { s = String(s || ''); return s.length > nMax ? `${s.slice(0, nMax - 1)}…` : s; };
    return `<h3 class="sub-title">Growth relying on each project by ${end} (top ${top.length})</h3>
    <svg class="dca-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Growth relying on the top ${top.length} projects by ${end}, coloured by funding-screen result">
      <line x1="${L0}" x2="${L0}" y1="${T0 - 4}" y2="${H - B0}" class="dca-grid"/>
      ${[0.5, 1].map(f => `<line x1="${(L0 + (W - L0 - R0) * f).toFixed(1)}" x2="${(L0 + (W - L0 - R0) * f).toFixed(1)}" y1="${T0 - 4}" y2="${H - B0}" class="dca-grid"/><text x="${(L0 + (W - L0 - R0) * f).toFixed(1)}" y="${H - 8}" class="dca-ax" text-anchor="middle">${pp(max * f)}</text>`).join('')}
      ${top.map((x, i) => { const yc = T0 + i * RH + RH / 2; return `<text x="${L0 - 8}" y="${(yc + 3).toFixed(1)}" class="dca-ax" text-anchor="end">${esc(short(x.r.name))}</text>
        <rect x="${L0}" y="${(yc - 7).toFixed(1)}" width="${bw(x.r.v).toFixed(1)}" height="14" rx="3" style="fill:${x.dec === 'Keep' ? 'var(--accent)' : 'var(--text-muted)'};fill-opacity:.75"/>
        <text x="${(L0 + bw(x.r.v) + 6).toFixed(1)}" y="${(yc + 3).toFixed(1)}" class="dca-ax">${pp(x.r.v)} · ${x.dec === 'Keep' ? 'within' : 'outside'}</text>`; }).join('')}
    </svg>
    <p class="small muted">People of growth relying on the project by ${end} — growth the screen shows constrained if the project is not in service. <span style="color:var(--accent)">■</span> within the funding screen · <span style="color:var(--text-muted)">■</span> outside it.</p>`;
  }
  // Funding chart: growth held back by the window's last year across funding levels.
  function dcaCurveChart(curve, B) {
    if (curve.length < 2) return '';
    const W = chartW(320, 760), H = 210, L0 = 54, R0 = 14, T0 = 12, B0 = 46;
    const maxB = Math.max(...curve.map(c => c.b)), maxV = Math.max(...curve.map(c => c.x.upper), 1) * 1.08;
    const x = b => L0 + (W - L0 - R0) * b / maxB, y = v => T0 + (H - T0 - B0) * (1 - v / maxV);
    const up = curve.map(c => y(c.x.upper)), lo = curve.map(c => y(c.x.lower));
    const band = `${curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.b).toFixed(1)},${up[i].toFixed(1)}`).join('')}${curve.map((c, i) => [i, c]).reverse().map(([i, c]) => `L${x(c.b).toFixed(1)},${lo[i].toFixed(1)}`).join('')}Z`;
    const line = curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.b).toFixed(1)},${y(c.x.upper).toFixed(1)}`).join('');
    const bl = b => b >= B.total ? 'Whole' : b >= 1e9 ? `$${b / 1e9}B` : `$${Math.round(b / 1e6)}M`;
    const pp = v => fmtNum(roundPop(v));
    return `<h3 class="sub-title">Growth held back by ${B.end} vs DC funding</h3>
    <svg class="dca-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Growth held back by ${B.end} at each funding level">
      ${[0, 0.5, 1].map(f => `<line x1="${L0}" x2="${W - R0}" y1="${y(maxV / 1.08 * f).toFixed(1)}" y2="${y(maxV / 1.08 * f).toFixed(1)}" class="dca-grid"/><text x="${L0 - 5}" y="${(y(maxV / 1.08 * f) + 3).toFixed(1)}" class="dca-ax" text-anchor="end">${pp(maxV / 1.08 * f)}</text>`).join('')}
      <path d="${band}" class="dca-uns"/><path d="${line}" fill="none" style="stroke:var(--cap-over);stroke-width:2"/>
      <line x1="${x(DCB.budget).toFixed(1)}" x2="${x(DCB.budget).toFixed(1)}" y1="${T0}" y2="${H - B0}" class="dca-now"/>
      ${curve.map(c => `<circle cx="${x(c.b).toFixed(1)}" cy="${y(c.x.upper).toFixed(1)}" r="3.5" style="fill:var(--cap-over)"/>
        <text x="${x(c.b).toFixed(1)}" y="${H - 28}" class="dca-ax" text-anchor="middle"${c.b === DCB.budget ? ' style="fill:var(--accent);font-weight:600"' : ''}>${bl(c.b)}</text>
        <text x="${x(c.b).toFixed(1)}" y="${H - 13}" class="dca-ax" text-anchor="middle">${c.x.keep.length}/${c.x.defer.length}</text>`).join('')}
    </svg>
    <p class="small muted">Kept / deferred under each point. Range: largest single constraint left short → sum of the deferred projects' own impacts. Dashed line: the current ${fmtMoney(DCB.budget)} screen.</p>`;
  }
  // Water + wastewater DC per unit by dwelling type (single / semi published; other types at the
  // 2020 schedule's ratios). Apartments above 475 persons/ha count as small units (≤750 sq ft).
  function dcRates() {
    const R = App().state.dcCosts && App().state.dcCosts.rates; if (!R) return null;
    const one = R.single.water + R.single.wastewater, k = R.ratio2020;
    return { single: one, town: one * k.other, aptLarge: one * k.apartmentLarge, aptSmall: one * k.apartmentSmall, water: R.single.water, wastewater: R.single.wastewater, R };
  }
  // DC revenue (water and wastewater) from an estimate's units.
  function dcRevenue(e) {
    const r = dcRates(); if (!r || !e || !(e.totalUnits > 0)) return null;
    const ppu = App().state.criteria.ppu || D.DEFAULT_CRITERIA.ppu, u = e.units, apt = u.apartment || 0;
    const hi = apt > 0 && e.pop && ppu.apartment > ppu.apartmentHigh ? Math.min(apt, Math.max(0, (ppu.apartment * apt - e.pop.apartment) / (ppu.apartment - ppu.apartmentHigh))) : 0;
    const rows = [['Single / semi', u.single || 0, r.single], ['Townhouse / other', u.town || 0, r.town], ['Apartment (>750 sq ft)', apt - hi + (u.unknown || 0), r.aptLarge], ['Apartment (≤750 sq ft)', hi, r.aptSmall]].filter(x => x[1] > 0.5);
    return { total: rows.reduce((t, x) => t + x[1] * x[2], 0), rows, r };
  }
  // Average water + wastewater DC per unit for the approved and proposed growth (its unit mix).
  function growthRate() {
    const all = App().state.projects.filter(p => { const l = MM().svcLayerOf(p); return l === 'approved' || l === 'proposed'; });
    const e = D.estimate(all, App().state.criteria, 'all', App().jobsOf), v = dcRevenue(e);
    return v && e.totalUnits > 0 ? v.total / e.totalUnits : null;
  }
  // The unit types are stated (a unit mix on a file) or not (read from the wording, or unknown).
  const mixStated = p => !!(p && p.unitMix && ['single', 'semi', 'town', 'apartment'].some(k => p.unitMix[k] > 0));
  // Without stated types, a range from all small apartments to all townhouses (SPEC 1.9: never the
  // cheapest rate silently).
  function dcRange(e) {
    const r = dcRates(); if (!r || !e || !(e.totalUnits > 0)) return null;
    return { low: e.totalUnits * r.aptSmall, high: e.totalUnits * r.town, units: e.totalUnits, r };
  }
  // Non-residential water + wastewater DC per m² of floor area (SPEC 1.9), from the same schedule
  // when data/dc-costs.json carries it (rates.nonResidential: { water, wastewater } per m² GFA).
  function dcNonResHTML(p) {
    const em = App().empOf ? App().empOf(p) : null; if (!em || !(em.totalM2 > 0)) return '';
    const R = App().state.dcCosts && App().state.dcCosts.rates, nr = R && R.nonResidential;
    const perM2 = nr ? (nr.water || 0) + (nr.wastewater || 0) : null;
    return `<div class="dcrev dcrev-nonres" data-info="dc-revenue"><div class="alloc-h"><strong>Non-residential water &amp; wastewater DCs</strong> ${perM2 ? `<span class="fr-b fr-ok">≈${fmtMoney(em.totalM2 * perM2)}</span>` : '<span class="fr-b fr-ref">Rate not loaded</span>'}</div>
      <p class="small">${fmtNum(Math.round(em.totalM2))} m² of floor area${perM2 ? ` × ${fmtMoney(perM2)} per m² (water ${fmtMoney(nr.water)} + wastewater ${fmtMoney(nr.wastewater)}, ${esc(R.effective)} to ${esc(R.until)})` : ' × the Region\'s non-residential rate per m² — [ADD RATE]: not yet in data/dc-costs.json (rates.nonResidential)'}.</p></div>`;
  }
  function dcRevenueHTML(p) {
    const e = D.estimate([p], App().state.criteria, 'all', App().jobsOf), v = dcRevenue(e); if (!v) return dcNonResHTML(p);
    const R = v.r.R;
    if (!mixStated(p)) {
      const g = dcRange(e);
      return `<div class="dcrev" data-info="dc-revenue"><div class="alloc-h"><strong>Regional water &amp; wastewater DCs</strong> <span class="fr-b fr-due">${fmtMoney(g.low)} – ${fmtMoney(g.high)}</span></div>
      <p class="small">Unit types are not stated on the files: ${fmtNum(Math.round(g.units))} units from all small apartments (≤750 sq ft, ${fmtMoney(g.r.aptSmall)}) to all townhouses (${fmtMoney(g.r.town)}). The FSR or the unit mix narrows it.</p>
      <small class="muted">Rates ${esc(R.effective)} to ${esc(R.until)}: water ${fmtMoney(R.single.water)} + wastewater ${fmtMoney(R.single.wastewater)} per single / semi; other types scaled by the 2020 schedule. Residential only; before credits, exemptions, discounts or deferrals (rental, affordable, additional units).</small></div>${dcNonResHTML(p)}`;
    }
    return `<div class="dcrev" data-info="dc-revenue"><div class="alloc-h"><strong>Regional water &amp; wastewater DCs</strong> <span class="fr-b fr-ok">≈${fmtMoney(v.total)}</span></div>
      <table class="dt dcrev-t"><tbody>${v.rows.map(([t, n, rt]) => `<tr><td>${esc(t)}</td><td class="n">${fmtNum(Math.round(n))} × ${fmtMoney(rt)}</td><td class="n">${fmtMoney(n * rt)}</td></tr>`).join('')}</tbody></table>
      <small class="muted">Rates ${esc(R.effective)} to ${esc(R.until)}: water ${fmtMoney(R.single.water)} + wastewater ${fmtMoney(R.single.wastewater)} per single / semi; other types scaled by the 2020 schedule. Residential only; before credits, exemptions, discounts or deferrals (rental, affordable, additional units).</small></div>${dcNonResHTML(p)}`;
  }
  // Developments outside the existing network that would connect to each planned main.
  function dcaConnectors() {
    const by = new Map();
    for (const p of App().state.projects) {
      const lay = MM().svcLayerOf(p); if ((lay !== 'approved' && lay !== 'proposed') || p.lat == null) continue;
      for (const sys of ['wastewater', 'water']) {
        const out = sys === 'wastewater' ? !(p.dr && p.dr.length) : !(p.pz && p.pz.length); if (!out) continue;
        const n = DI().dcNearest(sys, [p.lng, p.lat], DI().DC_CONNECT_M); if (!n) continue;
        const k = `ln:${sys}:${n.ln.p || n.ln.c}`, e = D.estimate([p], App().state.criteria, 'all', App().jobsOf); if (!(e.population > 0)) continue;
        (by.get(k) || by.set(k, []).get(k)).push({ p, lay, e });
      }
    }
    return by;
  }
  function dcAnalysis() {
    const k = MP().scenarioKey(); if (MP().DCA.key === k && MP().DCA.res) return MP().DCA.res;
    const cons = MP().allNeeds().filter(c => c.q && c.status !== 'check' && c.kind !== 'storage');
    const years = MP().yearsAhead(), ppu = MP().growthPpu(), rate = growthRate(), conn = App().state.dcInfra ? dcaConnectors() : new Map();
    const none = new Set();
    // Projects: every relief on a constraint, plus the planned mains developments would connect to.
    const P = new Map();
    const proj = (key, init) => P.get(key) || P.set(key, { key, cons: [], conn: [], ...init }).get(key);
    for (const c of cons) for (const r of c.relief) {
      const key = MP().reliefKey(r); if (!key || !r.y) continue;
      const pr = proj(key, { r, y: r.y, sys: c.sys, name: r.ln ? `${DI().DC_KIND[r.ln.k][0]}${r.ln.d ? ` ${r.ln.d} mm` : ''} · ${r.ln.p || r.ln.c}` : r.kind === 'step' ? `${c.name}: expansion to ${r.step.mld} ML/d${r.step.proj ? ` · ${r.step.proj}` : ''}` : r.text.replace(/^\S+\s/, ''), status: r.ln ? r.ln.s : '',
        ...projLabels(r.ln ? { k: r.ln.k, d: r.ln.d, id: r.ln.p || r.ln.c } : r.kind === 'step' ? { plant: c.name, mld: r.step.mld, id: r.step.proj } : { text: r.text.replace(/^\S+\s/, '') }) });
      pr.y = Math.min(pr.y, r.y); if (!pr.cons.includes(c)) pr.cons.push(c);
    }
    for (const [key, rows] of conn) {
      const [, sys, id] = key.split(':'), ln = App().state.dcInfra[sys].lines.filter(x => (x.p || x.c) === id).sort((a, b) => (a.y || 9999) - (b.y || 9999))[0]; if (!ln) continue;
      const pr = proj(key, { r: MP().lineRelief(ln), y: ln.y || null, sys: sys === 'water' ? 'water' : 'ww', name: `${DI().DC_KIND[ln.k][0]}${ln.d ? ` ${ln.d} mm` : ''} · ${id}`, status: ln.s, ...projLabels({ k: ln.k, d: ln.d, id }) });
      pr.conn = rows;
    }
    // Base (every project as scheduled) and each project cancelled, by year and at build-out.
    const base = new Map();
    for (const c of cons) base.set(c.id, { ys: years.map(y => MP().heldPeople(c, y, none)), bo: MP().heldPeople(c, null, none) });
    const out = [];
    for (const pr of P.values()) {
      const off = new Set([pr.key]);
      const rows = pr.cons.map(c => {
        const b = base.get(c.id), ys = years.map((y, i) => Math.max(0, MP().heldPeople(c, y, off) - b.ys[i])), bo = Math.max(0, MP().heldPeople(c, null, off) - b.bo);
        const r = c.relief.find(x => MP().reliefKey(x) === pr.key), ad = r && c.kind !== 'plant' ? MP().reliefAdd(c, r) : null;
        // Diverted to the project: demand above the capacity without it, up to what it adds.
        const div = years.map(y => Math.max(0, Math.min(c.q(y), MP().capWith(c, y, none)) - MP().capWith(c, y, off)));
        return { c, ys, bo, ad, div, divBo: Math.max(0, Math.min(c.q(null), MP().capWith(c, null, none)) - MP().capWith(c, null, off)), gapBase: b.ys.some(v => v > 0) };
      });
      // Connectors: their growth phased in by year (approved / proposed horizons).
      const cy = years.map(y => { const { fa, fp } = MA().hzFrac(y); return pr.conn.reduce((t, x) => t + x.e.population * (x.lay === 'approved' ? fa : fp), 0); });
      const cbo = pr.conn.reduce((t, x) => t + x.e.population, 0), cu = pr.conn.reduce((t, x) => t + x.e.totalUnits, 0);
      // Constraints on one project are in series along a path: the largest, not the sum.
      const ys = years.map((_, i) => Math.max(0, ...rows.map(r => r.ys[i])) + cy[i]);
      const bo = Math.max(0, ...rows.map(r => r.bo)) + cbo;
      const outY = pr.cons.length ? Math.min(...pr.cons.map(c => c.out === 'today' ? MM().THIS_YEAR : c.out || 9999)) : 9999;
      const late = pr.y && outY < pr.y;
      const firstY = years.find((y, i) => ys[i] > 0) || null;
      let rec, why;
      if (bo <= 0 && !cbo) { rec = 'review'; why = pr.cons.length ? `Without it, the screen shows no growth constrained by build-out: the existing capacity${pr.cons.some(c => c.relief.length > 1) ? ' or the other projects relieving the same constraint' : ''} covers the demand.` : 'No modelled constraint or connecting development relies on it.'; }
      else if (late) { rec = 'advance'; why = `Capacity runs out ≈${outY === MM().THIS_YEAR ? 'now' : outY}, before it is in service (${pr.y}): the screen shows it late.`; }
      else if (firstY && firstY - (pr.y || MM().THIS_YEAR) >= 5) { rec = 'defer'; why = `Without it, the screen shows no growth constrained until ≈${firstY}: well ahead of need.`; }
      else { rec = 'keep'; why = `Without it, the screen shows growth constrained from ≈${firstY || pr.y}.`; }
      const cost = dcCost(pr.r), perP = cost && cost.n && bo > 0 ? cost.dc / bo : null;
      // Capital status after the May 2026 pause: a plant step Council already funded counts as in the budget.
      const st = pr.status || (pr.r && pr.r.step && /council.approved/i.test(pr.r.step.note || '') ? 'approved' : '');
      const cap = capitalStatus(pr.y, st, pr.r && (pr.r.ln ? pr.r.ln.p || pr.r.ln.c : pr.r.step ? pr.r.step.proj : null));
      out.push({ ...pr, rows, ys, bo, units: bo / ppu, cbo, cu, outY: outY === 9999 ? null : outY, late, firstY, rec, why, cost, perP, cap, revRisk: rate ? bo / ppu * rate : null });
    }
    const order = { advance: 0, keep: 1, defer: 2, review: 3 };
    out.sort((a, b) => order[a.rec] - order[b.rec] || b.bo - a.bo);
    // Held back with every project as scheduled (projects late or too small), the largest constraint.
    const baseBo = Math.max(0, ...[...base.values()].map(v => v.bo)), baseY = years.map((_, i) => Math.max(0, ...[...base.values()].map(v => v.ys[i])));
    // Of it, Committed growth (demand at the committed level already beyond the build-out capacity, on
    // the same constraint); the rest is Proposed (SPEC §2.6).
    const top = cons.reduce((a, c) => (base.get(c.id).bo > (a ? base.get(a.id).bo : 0) ? c : a), null);
    const baseBoCom = top ? Math.min(baseBo, MP().heldAtLevel(top, 'committed', none)) : 0;
    MP().DCA.key = k; MP().DCA.res = { list: out, years, ppu, rate, baseBo, baseBoCom, baseY, nCons: cons.length };
    return MP().DCA.res;
  }
  // Timeline chart for one project's tightest constraint: demand, existing capacity, capacity with
  // the project; flow diverted to it (blue) and what would be unserved if it is cancelled (red).
  function dcaChart(row, years) {
    const c = row.c, W = chartW(320, 760), H = 180, L0 = 46, R0 = 10, T0 = 10, B0 = 26;
    const none = new Set(), off = new Set([row.key]);
    const dem = years.map(y => c.q(y)), cw = years.map(y => MP().capWith(c, y, none)), co = years.map(y => MP().capWith(c, y, off));
    const max = Math.max(...dem, ...cw) * 1.08 || 1;
    const x = i => L0 + (W - L0 - R0) * i / Math.max(1, years.length - 1), yv = v => T0 + (H - T0 - B0) * (1 - v / max);
    const line = arr => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yv(v).toFixed(1)}`).join('');
    const band = (lo, hi) => `${hi.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${yv(v).toFixed(1)}`).join('')}${lo.map((v, i) => [i, v]).reverse().map(([i, v]) => `L${x(i).toFixed(1)},${yv(v).toFixed(1)}`).join('')}Z`;
    const divHi = years.map((_, i) => Math.max(co[i], Math.min(dem[i], cw[i]))), unsHi = years.map((_, i) => Math.max(co[i], dem[i]));
    const ticks = [0, 0.5, 1].map(f => max / 1.08 * f), unitT = c.unit;
    const yi = MA().getCapYear() == null ? years.length - 1 : Math.max(0, years.indexOf(MA().getCapYear()));
    return `<svg class="dca-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Demand and capacity by year for ${esc(c.name)}">
      ${ticks.map(t => `<line x1="${L0}" x2="${W - R0}" y1="${yv(t)}" y2="${yv(t)}" class="dca-grid"/><text x="${L0 - 4}" y="${yv(t) + 3}" class="dca-ax" text-anchor="end">${fmtNum(Math.round(t))}</text>`).join('')}
      ${years.filter((y, i) => i % 5 === 0 || i === years.length - 1).map(y => `<text x="${x(years.indexOf(y))}" y="${H - 8}" class="dca-ax" text-anchor="middle">${y}</text>`).join('')}
      <path d="${band(co, unsHi)}" class="dca-uns"/>
      <path d="${band(co, divHi)}" class="dca-div"/>
      <path d="${line(co)}" class="dca-cap0"/><path d="${line(cw)}" class="dca-cap1"/><path d="${line(dem)}" class="dca-dem"/>
      <line x1="${x(yi)}" x2="${x(yi)}" y1="${T0}" y2="${H - B0}" class="dca-now"/>
      <text x="${L0 + 2}" y="${T0 + 9}" class="dca-ax">${esc(unitT)}</text>
    </svg>
    <div class="dca-key small"><span><i class="k-dem"></i>Demand</span><span><i class="k-cap0"></i>Capacity without it</span><span><i class="k-cap1"></i>With it (from ${row.y || '–'})</span><span><i class="k-div"></i>Diverted to it</span><span><i class="k-uns"></i>Over capacity without it</span></div>`;
  }
  // Cost cell: DC-recoverable cost of the priced components, per person enabled, and coverage.
  const costCell = r => !r.cost ? '<span class="muted">–</span>' : !r.cost.n ? '<span class="muted">not in the 2020 study</span>' : `${fmtMoney(r.cost.dc)}<small>${r.perP ? `${fmtMoney(r.perP)} / person · ` : ''}${r.cost.n < r.cost.of ? `${r.cost.n} of ${r.cost.of} parts priced` : `gross ${fmtMoney(r.cost.gross)}`}</small>`;
  const { SCREEN } = window.PeelUtil;
  const REC = { advance: ['dca-advance', SCREEN.advance], keep: ['dca-keep', SCREEN.keep], defer: ['dca-defer', SCREEN.defer], review: ['dca-review', SCREEN.review] };
  // The funding screen's two outcomes, as shown (the data keeps 'Keep' / 'Defer').
  const DEC = { Keep: SCREEN.within, Defer: SCREEN.outside };

  const api = {
    dcAnalysis,
    dcRevenueHTML, dcNonResHTML, dcRange, mixStated,
    dcaBudget,
    DCB,
    dcaMergeRecs,
    dcaRecRow, dcaCurve,
    dcaTimingChart, projLabels, timingOf, timingRows, CLOSE_YEARS,
    dcaRecChart,
    dcaCurveChart,
    dcaChart,
    dcaInfo,
    costCell,
    REC,
    growthRate,
    dcRates,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDcCost = api;
})(typeof window !== 'undefined' ? window : globalThis);
