(function (root) {
'use strict';
  // Measured flow at Peel's wastewater plants, 2008 on (data/plant-flows.json, built by
  // scripts/build-plant-flows.py from MECP's Municipal Treated Wastewater Effluent data).
  //
  //   chartHTML(pl)   the plant's annual average flow by year against its rated capacity and the
  //                   90% expansion trigger, the wettest month each year as a dot, and the March 2025
  //                   G.E. Booth → Clarkson flow transfer marked. '' when there is no data.
  //   summary(pl)     one sentence: latest year, % of rated, change over ten years (for the two
  //                   lake plants, the two together, since the 2025 diversion moves flow between them).
  //   checksHTML(pl)  MECP's figure against the Region's annual report, per plant and year
  //                   (registered as window.ModelChecks.plantFlows for Records › Data checks,
  //                   the Servicing model group); with pl, that plant's rows only (its own Records ›
  //                   Data checks, navigation phase 8a; '' when the file has none for it).
  // Pure strings; reads App().state.plantFlows.
  const App = () => root.PeelApp;
  const U = () => root.PeelUtil;
  const esc = s => (U() && U().esc ? U().esc(s) : String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  const SHORT = { Lakeview: 'G.E. Booth', Clarkson: 'Clarkson', Inglewood: 'Inglewood' };
  const data = () => (App() && App().state && App().state.plantFlows) || null;
  const f1 = v => v === 0 ? '0' : v >= 10 ? String(Math.round(v)) : v >= 1 ? v.toFixed(1) : v.toFixed(3);
  const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function series(pl) {
    const D = data(), p = D && D.plants && D.plants[pl];
    if (!p) return null;
    const yrs = Object.keys(p.annual).sort().filter(y => p.annual[y].months === 12);
    return yrs.length ? { p, yrs, pts: yrs.map(y => ({ y: +y, ...p.annual[y] })) } : null;
  }
  const pct = (a, b) => Math.round(a / b * 100);

  function summary(pl) {
    const s = series(pl); if (!s) return '';
    const last = s.pts[s.pts.length - 1], ten = s.pts.find(x => x.y === last.y - 10);
    let t = `Measured ${last.y}: ${f1(last.avgMLd)} ML/d average, ${pct(last.avgMLd, s.p.ratedMLd)}% of rated ${f1(s.p.ratedMLd)} ML/d; wettest month ${MONTH[+last.wettestMonth.slice(5) - 1]} at ${f1(last.wettestMonthMLd)} ML/d.`;
    if (ten) t += ` ${ten.y}–${last.y}: ${last.avgMLd >= ten.avgMLd ? '+' : '−'}${Math.abs(pct(last.avgMLd - ten.avgMLd, ten.avgMLd))}%.`;
    if (pl === 'Lakeview' || pl === 'Clarkson') {
      const a = series('Lakeview'), b = series('Clarkson');
      if (a && b) {
        const both = y => { const x = a.pts.find(q => q.y === y), z = b.pts.find(q => q.y === y); return x && z ? x.avgMLd + z.avgMLd : null; };
        const n = both(last.y), o = both(last.y - 10);
        if (n && o) t += ` The two lake plants together: ${f1(n)} ML/d, ${n >= o ? '+' : '−'}${Math.abs(pct(n - o, o))}% since ${last.y - 10}, ${pct(n, a.p.ratedMLd + b.p.ratedMLd)}% of their combined rated capacity.`;
      }
    }
    return t;
  }

  function chartHTML(pl) {
    const s = series(pl); if (!s) return '';
    const D = data(), rated = s.p.ratedMLd;
    const W = 420, H = 230, L = 40, R = 8, T = 12, B = 24;
    const x0 = s.pts[0].y, x1 = Math.max(s.pts[s.pts.length - 1].y, 2025);
    const yMax = Math.max(rated * 1.08, ...s.pts.map(p => p.wettestMonthMLd)) * 1.04;
    const X = y => L + (y - x0) / Math.max(1, x1 - x0) * (W - L - R), Y = v => T + (1 - v / yMax) * (H - T - B);
    const step = yMax > 400 ? 100 : yMax > 150 ? 50 : yMax > 40 ? 10 : yMax > 4 ? 1 : yMax > 0.4 ? 0.1 : 0.05;
    const grid = [];
    for (let v = 0; v <= yMax; v += step) grid.push(`<line class="dca-grid" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="dca-ax" x="${L - 4}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end">${f1(+v.toFixed(3))}</text>`);
    const ticks = s.pts.filter(p => (p.y - x0) % 4 === 0 && p.y < s.pts[s.pts.length - 1].y - 1 || p.y === s.pts[s.pts.length - 1].y).map(p => `<text class="dca-ax" x="${X(p.y).toFixed(1)}" y="${H - 8}" text-anchor="middle">${p.y}</text>`);
    const line = s.pts.map((p, i) => `${i ? 'L' : 'M'}${X(p.y).toFixed(1)},${Y(p.avgMLd).toFixed(1)}`).join('');
    const dots = s.pts.map(p => `<circle class="pf-wet" cx="${X(p.y).toFixed(1)}" cy="${Y(p.wettestMonthMLd).toFixed(1)}" r="2.5"><title>${p.y}: wettest month ${esc(p.wettestMonth)}, ${f1(p.wettestMonthMLd)} ML/d</title></circle>`);
    const pts = s.pts.map(p => `<circle class="pf-avg" cx="${X(p.y).toFixed(1)}" cy="${Y(p.avgMLd).toFixed(1)}" r="3"><title>${p.y}: ${f1(p.avgMLd)} ML/d average (${pct(p.avgMLd, rated)}% of rated)${p.name ? ` · ${esc(p.name)}` : ''}</title></circle>`);
    const hz = (v, cls, label) => `<line class="${cls}" x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}"/><text class="dca-ax" x="${L + 4}" y="${(Y(v) - 4).toFixed(1)}">${label}</text>`;
    const stepMark = (D.steps || []).filter(st => st.from === pl || st.to === pl).map(st => {
      const yr = +st.date.slice(0, 4) + (+st.date.slice(5, 7) - 1) / 12, x = X(Math.min(yr, x1)).toFixed(1);
      return `<line class="dca-now" x1="${x}" x2="${x}" y1="${T}" y2="${H - B}"/><text class="dca-ax" x="${x - 3}" y="${H - B - 6}" text-anchor="end">${st.from === pl ? 'Mar 2025: flow moved to Clarkson' : 'Mar 2025: flow from G.E. Booth'}</text>`;
    }).join('');
    const svg = `<svg class="dca-chart pf-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(SHORT[pl] || pl)} measured flow by year, ${s.pts[0].y} to ${s.pts[s.pts.length - 1].y}">
      ${grid.join('')}${hz(rated, 'dca-cap1', `rated ${f1(rated)}`)}${hz(rated * 0.9, 'dca-cap0', '90% trigger')}${stepMark}
      <path class="dca-dem" d="${line}"/>${dots.join('')}${pts.join('')}${ticks.join('')}</svg>`;
    return `<div class="pf-wrap">${svg}
      <p class="dca-key small"><span><i class="k-dem"></i>Annual average (measured)</span><span><i class="k-wet"></i>Wettest month</span><span><i class="k-cap1"></i>Rated capacity</span><span><i class="k-cap0"></i>90% expansion trigger</span></p>
      <p class="small">${esc(summary(pl))}</p>
      <p class="small muted">Monthly total flow reported to the Ministry (MECP Municipal Treated Wastewater Effluent, ${esc(D.years[0])}–${esc(D.years[D.years.length - 1])}); years with all 12 months. ${(D.steps || []).some(st => st.from === pl || st.to === pl) ? esc(D.steps[0].note) : ''}</p></div>`;
  }

  function checksHTML(pl) {
    const D = data(), checks = D && D.checks ? D.checks.filter(c => !pl || c.plant === pl) : []; if (!checks.length) return '';
    const worst = checks.reduce((m, c) => Math.max(m, Math.abs(c.diffPct)), 0);
    const rows = checks.map(c => `<tr><td>${esc(SHORT[c.plant] || c.plant)} ${esc(c.year)}</td><td>${f1(c.mecpMLd)} ML/d</td><td>${f1(c.peelMLd)} ML/d</td><td>${c.diffPct >= 0 ? '+' : '−'}${Math.abs(c.diffPct).toFixed(1)}%</td><td><span class="fr-b ${Math.abs(c.diffPct) <= 2 ? 'fr-ok' : Math.abs(c.diffPct) <= 5 ? 'fr-due' : 'fr-stale'}">${Math.abs(c.diffPct) <= 2 ? 'Matches' : Math.abs(c.diffPct) <= 5 ? 'Close' : 'Differs'}</span></td></tr>`).join('');
    return `<h3 class="sub-title">Plant flow: Ministry data against the Region's annual reports</h3>
      <table class="dt fr-table"><thead><tr><th>Plant and year</th><th>MECP (monthly totals)</th><th>Peel annual report</th><th>Difference</th><th>Result</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small muted">Two independent publications of the same meters; the largest difference is ${worst.toFixed(1)}%. Within ±2%: matches.</p>`;
  }

  root.PeelPlantFlows = { chartHTML, summary, checksHTML, series };
  if (typeof window !== 'undefined') {
    window.ModelChecks = window.ModelChecks || {};
    Object.defineProperty(window.ModelChecks, 'plantFlows', { enumerable: true, configurable: true, get: () => ({ html: checksHTML() }) });
  }
})(typeof window !== 'undefined' ? window : globalThis);
