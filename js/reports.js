/* js/reports.js — reports (Phase 6 extraction).
 * One-page development memo, area report, DC timing workbook tables, comparison PDF.
 * Extracted verbatim from js/app.js (lines 10304-10541); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 * Note: this module owns the live `appVersion` (meta-tag based); the dead copy that
 * was at 5344-5351 is deleted (js/exports.js). `window.comparisonPDF` is kept at
 * top level (wired by the Export menu).
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmt1, roundPop, UNOFFICIAL, dot, fmtMoney, store } = root.PeelUtil;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const PV = root.PeelProvenance || null;
  const App = () => root.PeelApp;
  const MP = () => root.PeelMasterPlan;
  const DC = () => root.PeelDcCost;
  const EX = () => root.PeelExports;
  const SC = () => root.PeelSewerCap;
  const DI = () => root.PeelDcInfra;
  const SD = () => root.PeelSvcData;
  const ST = () => root.PeelSvcTab;
  const Sett = () => root.PeelSettings;
  const SET = () => root.PeelSewerTrace;
  const DU = () => root.PeelDemandUI;
  const CV = () => root.PeelCensusView;
  const DD = () => root.PeelDevDetail;
  const MM = () => root.PeelMapMarkers;
  const AS = () => root.PeelAreaSelect;
  const PA = () => root.PeelPlanAreas;
  const SP = () => root.PeelSvcPlants;
  const OT = () => root.PeelOverviewTab;
  const DN = () => root.PeelDevNav;
  const FI = () => root.PeelFilterUI;

/* ---- app.js lines 10304-10541 ---- */
  // ---- Reports: one-page development memo, area report, DC timing workbook ------------------
  const textOf = html => { const d = document.createElement('div'); d.innerHTML = html || ''; return d.textContent.replace(/\s+/g, ' ').trim(); };
  // Print/report documents are always light (data-theme="light" + app.css), so
  // these styles use the light-theme tokens via var().
  const REPORT_CSS = `td:first-child{white-space:nowrap}body{font:11px/1.4 system-ui,-apple-system,Segoe UI,sans-serif;color:var(--text-primary);background:var(--surface-1);max-width:780px;margin:0 auto;padding:18px}
    h1{font-size:18px;margin:0 0 2px}h2{font-size:12px;text-transform:uppercase;letter-spacing:.06em;color:var(--text-secondary);margin:14px 0 4px;border-bottom:1px solid var(--border);padding-bottom:2px}
    .sub{color:var(--text-secondary);margin:0 0 6px}.meta{color:var(--text-muted);font-size:10px;margin:0}.grid{display:grid;grid-template-columns:1fr 330px;gap:14px;align-items:start}
    table{border-collapse:collapse;width:100%;margin:2px 0 6px}td,th{border-bottom:1px solid var(--border);padding:2px 4px;text-align:left;vertical-align:top}th{color:var(--text-secondary);font-weight:600;font-size:10px}
    td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}.gap{color:var(--cap-over);font-weight:600}.ok{color:var(--cap-room)}.chk{color:var(--cap-tight)}.muted{color:var(--text-muted)}
    ul{margin:2px 0 6px;padding-left:16px}li{margin:1px 0}.sk{border:1px solid var(--border);border-radius:6px}.note{font-size:9.5px;color:var(--text-muted);margin-top:10px}
    .noprint{margin:8px 0}@media print{.noprint{display:none}body{padding:0}@page{margin:12mm}}`;
  function openReport(title, body) {
    const appCss = new URL('css/app.css', location.href).href;
    const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><link rel="stylesheet" href="${appCss}"><style>${REPORT_CSS}</style></head>
      <body><p class="noprint"><button onclick="print()">Print / Save as PDF</button></p>${body}<script>addEventListener('load', () => setTimeout(() => print(), 500));<\/script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const w = window.open(url, '_blank');
    if (!w) { const a = document.createElement('a'); a.href = url; a.download = `${title.replace(/[^\w\s.–-]+/g, '').slice(0, 80)}.html`; a.click(); }
  }
  // A small map sketch (no basemap): sewers coloured by load, DC works, the site or developments.
  function sketchSVG({ center, halfM = 1200, points = [], rings = [], site = null, W = 330, H = 250 }) {
    const kx = 111320 * Math.cos(center[1] * Math.PI / 180), ky = 111320, s = Math.min(W, H) / (2 * halfM);
    const X = lng => W / 2 + (lng - center[0]) * kx * s, Y = lat => H / 2 - (lat - center[1]) * ky * s;
    const inBox = (lng, lat) => Math.abs((lng - center[0]) * kx) < halfM * 1.3 && Math.abs((lat - center[1]) * ky) < halfM * 1.3;
    const path = pts => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('');
    const out = [];
    if (MM().SEW.data) MM().SEW.data.pipes.forEach((p, i) => {
      const c = p[10]; if (p[0] < (halfM > 4000 ? 900 : halfM > 2000 ? 600 : 0) || (!inBox(c[0], c[1]) && !inBox(c[c.length - 2], c[c.length - 1]))) return;
      const pts = []; for (let k = 0; k < c.length; k += 2) pts.push([c[k], c[k + 1]]);
      const r = p[2] ? SC().pipeFlow(i, null).q / p[2] : null;
      out.push(`<path d="${path(pts)}" stroke="${root.PeelUtil.PIPE_RESULTS ? SC().pipeColour(r) : root.PeelUtil.token('--text-muted')}" stroke-width="${Math.max(1, Math.min(4, p[0] / 400))}" fill="none" opacity=".85"/>`);
    });
    if (App().state.dcInfra) for (const sys of ['wastewater', 'water']) for (const ln of App().state.dcInfra[sys].lines) {
      if (!ln.g.some(([x, y]) => inBox(x, y))) continue;
      out.push(`<path d="${path(ln.g)}" style="stroke:var(${DI().DC_KIND[ln.k][1]})" stroke-width="2.5" stroke-dasharray="6 3" fill="none"/>`);
    }
    for (const r of rings) out.push(`<path d="${path(r)}Z" style="fill:color-mix(in srgb, var(--accent) 8%, transparent);stroke:var(--accent)" stroke-width="1.2"/>`);
    for (const p of points) if (p.lat != null && inBox(p.lng, p.lat)) out.push(`<circle cx="${X(p.lng).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="${Math.max(2.5, Math.min(7, Math.sqrt((p.units || 1)) / 3))}" style="fill:var(--ph-${p.phase},var(--ph-approved));stroke:var(--sym-outline)" stroke-width=".8"/>`);
    if (site) out.push(`<circle cx="${X(site[0])}" cy="${Y(site[1])}" r="7" style="fill:var(--select);stroke:var(--sym-outline)" stroke-width="2"/>`);
    const bar = halfM > 2500 ? 1000 : 500, bw = bar * s;
    return `<svg class="sk" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="background:var(--surface-1)">${out.join('')}
      <g font-size="9" style="fill:var(--text-primary)"><rect x="8" y="${H - 14}" width="${bw}" height="3"/><text x="8" y="${H - 18}">${bar >= 1000 ? `${bar / 1000} km` : `${bar} m`}</text>
      <path d="M${W - 14} 10l5 12h-10z"/><text x="${W - 17}" y="32">N</text></g></svg>
      <div class="meta">Sewers 300 mm+ coloured by build-out load / full capacity (green under 85%: free flowing; amber 85–100%: near full; red over 100%: surcharged); dashed: 2026 DC works (draft).</div>`;
  }
  // ---- Executive briefing: one printable page from the Overview (title block, headlines, key
  // numbers, plant capacity, demand by phase, DC actions, allocations, a map of the blocks).
  function appVersion() { const m = document.querySelector('meta[name="app-version"]'); const v = m && m.content; return v && v !== '__BUILD__' ? v : 'dev'; }
  function briefingMap(set, W = 340, H = 300) {
    if (!SET().BLK.data) return '';
    let mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
    // Extent of the sewered blocks (rural Block 40, mostly on septic, would shrink the rest).
    for (const b of SET().BLK.data.blocks.filter(x => !(x.served != null && x.served < 0.5))) for (const pt of b.parts.flat(2)) { mnx = Math.min(mnx, pt[0]); mny = Math.min(mny, pt[1]); mxx = Math.max(mxx, pt[0]); mxy = Math.max(mxy, pt[1]); }
    const kx = Math.cos((mny + mxy) / 2 * Math.PI / 180), s = Math.min((W - 10) / ((mxx - mnx) * kx), (H - 10) / (mxy - mny));
    const X = x => 5 + (x - mnx) * kx * s, Y = y => 5 + (mxy - y) * s;
    const path = r => r.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join('') + 'Z';
    const out = SET().BLK.data.blocks.map(b => `<path d="${b.parts.map(p => path(p[0])).join('')}" style="fill:color-mix(in srgb, var(--block) ${b.planning ? '14' : '4'}%, transparent);stroke:var(--block)" stroke-width=".6"/>`);
    for (const p of set) if (p.lat != null && p.units >= 50) out.push(`<circle cx="${X(p.lng).toFixed(1)}" cy="${Y(p.lat).toFixed(1)}" r="${Math.max(1.4, Math.min(5, Math.sqrt(p.units) / 8)).toFixed(1)}" style="fill:var(--ph-${p.phase},var(--ph-approved));stroke:var(--sym-outline);stroke-width:.6" fill-opacity=".8"/>`);
    for (const pl of (App().state.servicing && App().state.servicing.meta.plants) || []) if (pl.lnglat) out.push(`<rect x="${(X(pl.lnglat[0]) - 4).toFixed(1)}" y="${(Y(pl.lnglat[1]) - 4).toFixed(1)}" width="8" height="8" style="fill:var(--text-primary)"/><text x="${(X(pl.lnglat[0]) + 6).toFixed(1)}" y="${(Y(pl.lnglat[1]) + 3).toFixed(1)}" font-size="8" style="fill:var(--text-primary)">${esc(SD().PLANT_SHORT[pl.name] || pl.name)}</text>`);
    return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="overflow:hidden">${out.join('')}<path d="M${W - 14} 8l5 12h-10z" style="fill:var(--text-primary)"/><text x="${W - 17}" y="30" font-size="9" style="fill:var(--text-primary)">N</text></svg>`;
  }
  function briefingPDF() {
    const set = DU().overviewSet(), basis = DU().demandBasis(), c = App().state.criteria, e = D.estimate(set, c, basis, App().jobsOf), cb = e.combined;
    // Units and left to build from the one pipeline definition (as the Overview and Growth).
    const pipe = root.Growth ? root.Growth.pipelineTotals(set) : null;
    const left = pipe ? Math.round(pipe.left) : 0, unitsAll = basis === 'all' && pipe ? pipe.planned : e.totalUnits;
    const fr = DU().freshness(), asOf = (fr[0] && fr[0].date) || '–', need = fr.filter(r => r.st === 'due' || r.st === 'stale');
    const plants = App().state.svcModel ? ['Lakeview', 'Clarkson', 'Inglewood'].map(pl => MP().cached(`plant:${pl}`, () => MP().plantCons(pl))).filter(Boolean) : [];
    const w = App().state.svcModel && App().state.reports ? MP().cached('wsys:lake', () => MP().waterPlantCons({ zone: '1' })) : null; if (w) plants.push(w);
    const R = MP().DCA.res && MP().DCA.key === MP().scenarioKey() ? MP().DCA.res : (App().state.dcInfra && MM().SEW.data && App().state.svcModel ? DC().dcAnalysis() : null);
    const adv = R ? R.list.filter(r => r.rec === 'advance') : [], top = R ? R.list.slice().sort((a, b) => b.bo - a.bo).slice(0, 5) : [];
    const al = App().state.svcModel ? ['Lakeview', 'Clarkson'].map(DU().allocPlant).filter(x => x && x.rows.length) : [];
    const ph = P.PHASES.map(q => { const s0 = set.filter(p => p.phase === q.key); if (!s0.length) return ''; const pe = D.estimate(s0, c, basis, App().jobsOf); return `<tr><td>${esc(q.label)}</td><td>${fmtNum(Math.round(pe.totalUnits))}</td><td>${fmtNum(roundPop(pe.population))}</td><td>${fmtNum(roundPop(pe.employment.jobs))}</td><td>${fmt1(pe.combined.water.maxDay)}</td><td>${fmt1(pe.combined.wastewater.wetPeak)}</td></tr>`; }).join('');
    const tight = plants.filter(x => x.kind === 'plant').sort((a, b) => b.util.bo - a.util.bo)[0];
    const hl = [`The ${fmtNum(set.length)} developments shown (${esc(OT().scopeText())}) would add about <b>${fmtNum(roundPop(e.population))} people</b> and ${fmtNum(roundPop(e.employment.jobs))} jobs in ${fmtNum(Math.round(unitsAll))} units, needing ${fmtNum(Math.round(cb.water.maxDay))} L/s of water at maximum day and ${fmtNum(Math.round(cb.wastewater.wetPeak))} L/s of wastewater at peak wet weather.`,
      tight ? `<b>${esc(SD().PLANT_SHORT[tight.pl])}</b> ${ST().trigText(tight)}: existing + built + committed use ${ST().pctRated(tight, 'com')}% of its rated capacity, ${ST().pctRated(tight, 'bo')}% at build-out (expansion trigger ${Math.round(MP().PLANT_TRIGGER * 100)}%)${tight.relief.length ? `; next expansion ${esc(tight.relief[0].text)}` : ''}.` : '',
      R ? `${adv.length ? `<b>${adv.length} DC project${adv.length === 1 ? '' : 's'}</b> come online after the capacity ${adv.length === 1 ? 'it relieves' : 'they relieve'} runs out: the screen shows ${adv.length === 1 ? 'it' : 'them'} late.` : 'Every DC project comes online before the capacity it relieves runs out.'}` : ''].filter(Boolean);
    const bar = x => `<div class="cap"><div class="ch"><b>${esc(x.kind === 'plant' ? SD().PLANT_SHORT[x.pl] : 'South Peel water treatment')}</b><span>existing + built + committed ${ST().pctRated(x, 'com')}% of rated → ${ST().pctRated(x, 'bo')}% build-out · ${x.out === 'today' ? 'at trigger now' : x.out ? `trigger ≈${x.out}` : `room to ${SP().hz.end}`}</span></div><div class="bar"><i class="c" style="width:${Math.min(100, ST().pctRated(x, 'com') / 1.3).toFixed(1)}%"></i><i class="b ${x.util.bo >= 1 ? 'over' : ''}" style="width:${(Math.max(0, Math.min(130, ST().pctRated(x, 'bo')) - Math.min(130, ST().pctRated(x, 'com'))) / 1.3).toFixed(1)}%"></i><i class="tg"></i><i class="tg r"></i></div></div>`;
    const prep = store.get('prepBy', '');
    const appCss = new URL('css/app.css', location.href).href;
    const html = `<!doctype html><html lang="en" data-theme="light"><head><meta charset="utf-8"><title>Development and servicing briefing ${esc(new Date().toISOString().slice(0, 10))}</title><link rel="stylesheet" href="${appCss}"><style>
      @page{size:letter;margin:11mm}*{box-sizing:border-box}body{font:10.5px/1.35 system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text-primary);background:var(--surface-1);margin:0 auto;max-width:200mm;padding:10px}
      header{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid var(--report-brand);padding-bottom:6px;margin-bottom:8px}
      h1{font-size:18px;margin:0;color:var(--report-brand-deep)}header .sub{color:var(--text-secondary);font-size:10px}header .r{text-align:right;font-size:9.5px;color:var(--text-secondary);white-space:nowrap;padding-left:10px}
      .hl{border-left:4px solid var(--report-brand);background:var(--surface-2);padding:6px 9px;margin:0 0 8px}.hl p{margin:2px 0}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 14px}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
      .t{background:var(--surface-2);border-radius:5px;padding:5px 7px}.t b{display:block;font-size:15px}.t span{color:var(--text-secondary);font-size:9.5px}
      h2{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:var(--report-brand-deep);margin:6px 0 4px;border-bottom:1px solid var(--border);padding-bottom:2px}
      table{border-collapse:collapse;width:100%;font-size:9.5px}th,td{padding:2px 4px;border-bottom:1px solid var(--border);text-align:right}th:first-child,td:first-child{text-align:left}th{color:var(--text-secondary);font-weight:600}tr.tot td{font-weight:700;border-top:1px solid var(--text-muted)}
      .cap{margin:3px 0 6px}.ch{display:flex;justify-content:space-between;font-size:9.5px}.bar{position:relative;height:8px;background:var(--surface-2);border-radius:4px;display:flex;overflow:hidden;margin-top:2px}.bar i.c{background:var(--text-muted)}.bar i.b{background:var(--accent)}.bar i.b.over{background:var(--cap-over)}.bar i.tg{position:absolute;left:69.2%;top:0;bottom:0;width:2px;background:var(--text-primary)}.tg.r{left:76.9%;background:var(--text-muted)}
      ul{margin:2px 0;padding-left:15px}li{margin:1px 0}.map{display:grid;gap:3px;justify-items:center;margin-top:4px}.map small{color:var(--text-secondary)}.map svg{max-width:100%;height:auto}
      footer{margin-top:8px;border-top:1px solid var(--border);padding-top:4px;font-size:8.5px;color:var(--text-muted);display:flex;justify-content:space-between;gap:10px}
      .noprint{margin:8px 0}@media print{.noprint{display:none}body{padding:0}}</style></head><body>
      <p class="noprint"><button onclick="print()">Print / Save as PDF</button></p>
      <header><div><h1>Development and Servicing Briefing</h1><div class="sub">Region of Peel · ${esc(OT().scopeText())} · ${esc(ST().scenarioText())}</div><div class="sub">${UNOFFICIAL}</div></div>
        <div class="r">${esc(new Date().toLocaleDateString('en-CA', { year: 'numeric', month: 'long', day: 'numeric' }))}${prep ? `<br>Prepared by ${esc(prep)}` : ''}<br>Data as of ${esc(asOf)}</div></header>
      <div class="hl">${hl.map(x => `<p>${x}</p>`).join('')}</div>
      <div class="grid">
        <section><h2>Growth</h2><div class="tiles">
          <div class="t"><b>${fmtNum(set.length)}</b><span>developments</span></div><div class="t"><b>${fmtNum(Math.round(unitsAll))}</b><span>units (${fmtNum(left)} left to build)</span></div><div class="t"><b>${fmtNum(roundPop(e.population))}</b><span>people at build-out</span></div>
          <div class="t"><b>${fmtNum(roundPop(e.employment.jobs))}</b><span>jobs</span></div><div class="t"><b>${fmt1(cb.water.maxDay)} L/s</b><span>water max day</span></div><div class="t"><b>${fmt1(cb.wastewater.wetPeak)} L/s</b><span>wastewater peak wet</span></div></div>
          <h2>Servicing demand by phase</h2><table><thead><tr><th>Phase</th><th>Units</th><th>People</th><th>Jobs</th><th>Water max day L/s</th><th>Wastewater peak wet L/s</th></tr></thead><tbody>${ph}<tr class="tot"><td>Total</td><td>${fmtNum(Math.round(e.totalUnits))}</td><td>${fmtNum(roundPop(e.population))}</td><td>${fmtNum(roundPop(e.employment.jobs))}</td><td>${fmt1(cb.water.maxDay)}</td><td>${fmt1(cb.wastewater.wetPeak)}</td></tr></tbody></table></section>
        <section><h2>Capacity (% of rated capacity; tick = 90% expansion trigger)</h2>${plants.map(bar).join('') || '<p>Servicing model not loaded.</p>'}
          ${al.length ? `<p><b>After servicing allocations:</b> ${al.map(x => `${esc(SD().PLANT_SHORT[x.pl])} ${fmt1(x.after)} ML/d room (≈${fmtNum(roundPop(x.peopleAfter))} people)`).join('; ')}.</p>` : ''}
          <div class="map">${briefingMap(set)}<small>Wastewater blocks (shaded: prioritised for a block study), developments of 50+ units by phase, and the treatment plants (■).</small></div></section>
      </div>
      ${R ? `<section><h2>DC program (2026 draft)</h2>${root.PeelUtil.pauseNote()}<div class="grid"><div><b>Screens late</b> (in service after the capacity runs out)${adv.length ? `<ul>${adv.map(r => `<li>${esc(r.name)}: online ${r.y} (${root.PeelUtil.CAPITAL_STATUS[r.cap] || 'status unknown'}), capacity runs out ${r.outY === MM().THIS_YEAR ? 'now' : `≈${r.outY}`}</li>`).join('')}</ul>` : '<p>None.</p>'}</div>
        <div><b>Most growth relies on</b> (people the screen shows constrained by build-out without it)<ul>${top.map(r => `<li>${esc(r.name)} (${r.y || '–'}): ≈${fmtNum(roundPop(r.bo))} people, ≈${fmtNum(Math.round(r.units))} units${r.revRisk ? `, ≈${fmtMoney(r.revRisk)} in DCs` : ''}${r.cost && r.cost.n ? `; cost ${fmtMoney(r.cost.dc)} (2026$)` : ''}</li>`).join('')}</ul></div></div></section>` : ''}
      ${(o => o ? `<section><h2>Population outlook</h2><p>Ministry of Finance (summer 2026): Peel <b>${fmtNum(roundPop(o.mof[2025]))}</b> in 2025, ${fmtNum(roundPop(o.mof[2031]))} in 2031, <b>${fmtNum(roundPop(o.mof[2051]))}</b> in 2051, against the Region's 2051 forecast of <b>${fmtNum(roundPop(o.region))}</b>${o.region > o.mof[2051] ? ` (≈${fmtNum(roundPop(o.region - o.mof[2051]))} lower)` : ''}. Not a planning target, but a slower path would move growth-driven projects later.</p></section>` : '')(CV().outlookRows())}
      <footer><span><strong>${esc(root.PeelUtil.SCREEN_LINE)}</strong> ${esc(root.PeelUtil.CRITERIA_STAMP)}. Screening estimates at Peel design criteria (wastewater ${c.wastewater.avg} L/cap/d with Harmon peaking, I&amp;I ${c.wastewater.infiltration} L/s/ha${Sett().wetText() ? ` (${esc(Sett().wetText())})` : ''}; water ${c.water.avg} L/cap/d ×${c.water.maxDay} max day); plant capacity calibrated to ${App().state.reports ? App().state.reports.year : ''} measured flows; not a hydraulic model. People and jobs rounded; ≈ marks an estimate.${need.length ? ` Data due for a refresh: ${need.map(r => esc(r.name)).join('; ')}.` : ''}</span><span>Peel Growth Pipeline (unofficial) · v${esc(appVersion())}</span></footer>
      <script>addEventListener('load', () => setTimeout(() => print(), 400));<\/script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const win = window.open(url, '_blank');
    if (!win) { const a = document.createElement('a'); a.href = url; a.download = `development-servicing-briefing-${new Date().toISOString().slice(0, 10)}.html`; a.click(); }
  }
  // ---- Comparison PDF: one printable page from the Compare tool (Phase 3b) ----
  // Phase 5 (exports): the top-bar Export menu's "PDF — comparison" item calls
  // window.comparisonPDF (the menu item itself is Worker B's in renderExportMenu).
  // Rows come from the pure js/export-comparison.js builders fed with the same
  // estimate/constraint functions the Compare tool cards use; the totals row
  // matches sumEstimates() over the same inputs.
  function comparisonPDF() {
    const T = typeof window !== 'undefined' ? window.PeelToolCompare : null;
    const items = T && typeof T.items === 'function' ? T.items() : [];
    if (!items.length) { alert('Nothing to compare yet — add developments or areas with the Compare tool first.'); return; }
    const X = window.ComparisonExport;
    const rows = X.buildRows(items, {
      estimate: p => D.estimate([p], App().state.criteria, 'all', App().jobsOf),
      devNeeds: p => { try { return MP().devNeeds(p); } catch (e) { return null; } },
      phaseLabel: p => (P.PHASE_BY_KEY[p.phase] && P.PHASE_BY_KEY[p.phase].label) || p.phase,
      sumEstimates: T.sumEstimates, tightestConstraint: T.tightestConstraint,
    });
    const tot = X.totalsFor(rows);
    const n = v => v == null ? '–' : fmtNum(Math.round(v));
    const tr = r => `<tr><td><b>${esc(r.title)}</b>${r.sub ? `<br><span class="muted small">${esc(r.sub)}</span>` : ''}</td>` +
      `<td>${esc(r.phase)}</td><td>${esc(r.municipality)}</td>` +
      `<td class="n">${n(r.units)}</td><td class="n">${n(r.people)}</td><td class="n">${n(r.jobs)}</td>` +
      `<td class="n">${r.waterMaxDay == null ? '–' : fmt1(r.waterMaxDay)}</td><td class="n">${r.wastewaterWetPeak == null ? '–' : fmt1(r.wastewaterWetPeak)}</td>` +
      `<td>${r.tightest ? esc(X.tightestText(r.tightest)) : '<span class="muted">No servicing data.</span>'}</td></tr>`;
    const titles = items.map(i => i.title).join(' vs ');
    const filt = FI().activeFilters().map(f => f.label).join(', ') || 'none';
    const body = `<h1>Comparison — ${esc(titles)}</h1>` +
      `<p class="meta">Side-by-side of the Compare tool's ${fmtNum(items.length)} item${items.length === 1 ? '' : 's'} · prepared ${esc(new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' }))} · Peel Growth Pipeline (unofficial)</p>` +
      `<p class="note">Filters: ${esc(filt)} · ${esc(ST().scenarioText())}. Screening estimates at Peel design criteria; not a hydraulic model or a functional servicing report. The compared items are the current Compare tool contents, independent of the map filters above.</p>` +
      `<h2>Side by side</h2><table><thead><tr><th></th><th>Phase</th><th>Municipality</th><th class="n">Units</th><th class="n">People</th><th class="n">Jobs</th><th class="n">Water max day (L/s)</th><th class="n">Wastewater peak wet (L/s)</th><th>Tightest constraint</th></tr></thead>` +
      `<tbody>${rows.map(tr).join('')}` +
      `<tr style="font-weight:700"><td>Total</td><td></td><td></td><td class="n">${fmtNum(Math.round(tot.units))}</td><td class="n">${fmtNum(Math.round(tot.people))}</td><td class="n">${fmtNum(Math.round(tot.jobs))}</td><td class="n">${fmt1(tot.waterMaxDay)}</td><td class="n">${fmt1(tot.wastewaterWetPeak)}</td><td></td></tr></tbody></table>` +
      reportFooter();
    openReport(`Comparison – ${titles}`, body);
  }
  // The Export menu calls the global (wired in renderExportMenu by Worker B).
  window.comparisonPDF = comparisonPDF;
  // Phase colours come from the --ph-* design tokens via phaseColor() (defined
  // near the top of this file); the old hard-coded phase table was removed in
  // the dark-default token restructure.
  const needRow = (c, ppu, extra = '') => `<tr><td class="${{ gap: 'gap', planned: 'ok', check: 'chk', ok: 'muted' }[c.status]}">${esc({ gap: 'Screens late', planned: 'DC in time', check: 'Check data', ok: 'Room' }[c.status])}</td>
    <td>${esc(c.name)}<br><span class="muted">${esc(c.sub)}</span></td><td class="n">${c.room == null ? 'new' : c.room <= 0 ? (c.kind === 'plant' || c.kind === 'wplant' ? `${ST().pctRated(c, 'com')}% of rated (trigger ${Math.round(MP().PLANT_TRIGGER * 100)}%)` : `over ${Math.round((c.util.com - 1) * 100)}%`) : `${fmtNum(roundPop(c.people))} people<br><span class="muted">≈${fmtNum(Math.round(c.people / ppu))} units</span>`}</td>
    <td>${c.out === 'today' ? 'already' : c.out == null ? `after ${SP().hz.end}` : `≈${c.out}`}</td><td>${c.relief.length ? esc(c.relief.slice(0, 2).map(r => r.text).join('; ')) : '<span class="muted">none on the DC map</span>'}</td>${extra}</tr>`;
  const needHead = extra => `<tr><th>Status</th><th>Existing capacity</th><th class="n">Room to the trigger after committed</th><th>Runs out</th><th>DC relief</th>${extra || ''}</tr>`;
  function reportFooter() {
    const m = EX().reportMeta('growth');
    return `<p class="note"><strong>${esc(root.PeelUtil.SCREEN_LINE)}</strong> ${esc(root.PeelUtil.CRITERIA_STAMP)}.</p><p class="note">${esc(m.lines.slice(0, 3).join(' · '))}. ${esc(ST().scenarioText())}. Peel design criteria; a screening estimate, not a hydraulic model or a functional servicing report. 2026 DC capital maps are a draft, not approved by Council.</p>`;
  }
  function devMemo(p) {
    const st = DD().statusOf(p), f = SD().svcFacts(p), e = f ? f.e : D.estimate([p], App().state.criteria, 'all', App().jobsOf);
    const ppu = MP().ppuOf(p), b = p.buildout;
    const files = [...new Set(p.records.filter(r => r.kind === 'application').map(r => r.ref))].slice(0, 6).join(', ');
    const domText = id => { const el = DN().getCurrentProject() === p && document.getElementById(id); return el ? [...el.querySelectorAll('li')].map(li => li.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ') : ''; };
    const needs = f && App().state.svcModel ? (MP().devNeeds(p) || []) : [];
    const shown = needs.filter(c => c.status !== 'ok').slice(0, 7), okN = needs.filter(c => c.status === 'ok').length;
    const cb = f && f.cb;
    const svc = f ? `<table><tr><th></th><th class="n">Average</th><th class="n">Max day / peak dry</th><th class="n">Peak hour / wet</th></tr>
      <tr><td>Water${f.z ? ` · ${esc(f.z.name.replace('Pressure zone ', 'Zone '))}` : ''}</td><td class="n">${fmt1(cb.water.avg)} L/s</td><td class="n">${fmt1(cb.water.maxDay)} L/s</td><td class="n">${fmt1(cb.water.peakHour)} L/s</td></tr>
      <tr><td>Wastewater${f.pl ? ` → ${esc(SD().PLANT_SHORT[f.pl] || f.pl)}` : ''}</td><td class="n">${fmt1(cb.wastewater.avg)} L/s</td><td class="n">${fmt1(cb.wastewater.peak)} L/s</td><td class="n">${fmt1(cb.wastewater.wetPeak)} L/s</td></tr></table>
      <ul>${f.path.length ? `<li>Sewer path: ${esc(f.path.slice(0, 6).map(a => a.kind === 'plant' ? SD().plantLabel(a.plant) : SD().drName(a).replace(/^[^·]+· /, '')).join(' → '))}${f.path.length > 6 ? ' …' : ''}</li>` : ''}
      ${f.sps.length ? `<li>Pumping stations: ${esc(f.sps.map(x => `${SD().drName(x.a).replace(/^[^·]+· /, '')} ${Math.round(x.wet / x.firm * 100)}% of firm at build-out`).join('; '))}</li>` : ''}
      ${f.cap ? `<li>${esc(f.cap.name)}: uncommitted reserve ${fmt1(f.reserve)} ML/d; this development ${fmt1(f.use)} ML/d (${esc(f.useNote)})${f.reserve > 0 ? ` = ${DD().pctOf(f.use, f.reserve)} of the reserve` : ' — the screen shows the plant over rated capacity'}</li>` : ''}</ul>` : '<p class="muted">No units or jobs stated — flows not estimated.</p>';
    const ctx = [['Existing mains', domText('dev-exist')], ['Fire flow', domText('dev-fire')], ['Stormwater', domText('dev-storm')]].filter(([, t]) => t && !/^Looking up/.test(t));
    const body = `<h1>${esc(p.title)}</h1><p class="sub">${esc(p.municipality)} · ${esc(P.PHASE_BY_KEY[p.phase].label)}${files ? ` · ${esc(files)}` : ''}</p>
      <p class="meta">Servicing memo · prepared ${esc(new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' }))} · Peel Growth Pipeline (unofficial)</p>
      <div class="grid"><div>
        <h2>Proposal</h2><table>
          <tr><td>Units</td><td class="n">${fmtNum(Math.round(e.totalUnits))}</td><td>${D.UNIT_TYPES.filter(t => e.units[t.key] > 0).map(t => `${fmtNum(Math.round(e.units[t.key]))} ${t.label.toLowerCase()}`).join(' · ')}</td></tr>
          <tr><td>People</td><td class="n">${fmtNum(roundPop(e.population))}</td><td class="muted">${ppu.toFixed(1)} persons per unit (Peel)</td></tr>
          ${e.employment.jobs > 0 ? `<tr><td>Jobs</td><td class="n">${fmtNum(roundPop(e.employment.jobs))}</td><td></td></tr>` : ''}
          ${b ? `<tr><td>Build-out</td><td class="n">${fmtNum(b.remaining)} left</td><td>${fmtNum(b.planned)} planned · ${fmtNum(b.permitted)} permitted · ${fmtNum(b.completed)} completed</td></tr>` : ''}</table>
        <h2>Status</h2><p>${esc(textOf(st.why))}</p><p>${esc(textOf(DD().latestDecisionHTML(p, st)))}</p>
      </div><div>${p.lat != null ? sketchSVG({ center: [p.lng, p.lat], site: [p.lng, p.lat] }) : ''}</div></div>
      <h2>Servicing (Peel design criteria)</h2>${svc}
      ${needs.length ? `<h2>DC needs: existing capacity vs the 2026 DC program</h2>${root.PeelUtil.pauseNote()}<table>${needHead()}${shown.map(c => needRow(c, ppu)).join('')}</table>${okN ? `<p class="muted">${okN} more with room to build-out.</p>` : ''}` : ''}
      ${st.works ? `<h2>Planned works nearby</h2><p>${esc(textOf(DI().devWorksHTML(st.works)))}</p>` : ''}
      ${ctx.length ? `<h2>Site context (live GIS)</h2><ul>${ctx.map(([k, t]) => `<li><strong>${esc(k)}:</strong> ${esc(t)}</li>`).join('')}</ul>` : ''}
      ${reportFooter()}`;
    openReport(`Servicing memo – ${p.title}`, body);
  }
  // Area report: a drawn selection or what is shown on the map.
  function areaReport(devs, title, rings = []) {
    devs = devs.filter(p => p.phase !== 'cancelled');
    if (!devs.length) return alert('No developments to report on.');
    const c = App().state.criteria, e = D.estimate(devs, c, 'all', App().jobsOf), cb = e.combined, ppu = (c.ppu || D.DEFAULT_CRITERIA.ppu).apartment;
    const pts = devs.filter(p => p.lat != null);
    const lo = [Math.min(...pts.map(p => p.lng)), Math.min(...pts.map(p => p.lat))], hi = [Math.max(...pts.map(p => p.lng)), Math.max(...pts.map(p => p.lat))];
    const center = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], halfM = Math.max(600, Math.max((hi[0] - lo[0]) * 111320 * Math.cos(center[1] * Math.PI / 180), (hi[1] - lo[1]) * 111320) / 2 * 1.1);
    // Constraints relied on (the largest 150 developments by people + jobs).
    const agg = new Map(), order = { gap: 0, planned: 1, check: 2, ok: 3 };
    if (App().state.svcModel) for (const p of pts.slice().sort((a, b) => (b.units || 0) - (a.units || 0)).slice(0, 150)) {
      for (const k of MP().devNeeds(p) || []) {
        const key = k.kind === 'pipe' ? (k.relief[0] && k.relief[0].ln ? `ln:${k.relief[0].ln.p || k.relief[0].ln.c}` : `pipe:${k.i}`) : k.id;
        const a = agg.get(key); if (!a) agg.set(key, { c: k, n: 1 }); else { a.n++; if (order[k.status] < order[a.c.status]) a.c = k; }
      }
    }
    const rows = [...agg.values()].filter(a => a.c.status !== 'ok').sort((a, b) => order[a.c.status] - order[b.c.status] || b.n - a.n).slice(0, 14);
    const byPhase = P.ALL_PHASES.map(ph => { const s = devs.filter(p => p.phase === ph.key); return s.length ? `<tr><td>${esc(ph.label)}</td><td class="n">${fmtNum(s.length)}</td><td class="n">${fmtNum(Math.round(D.estimate(s, c, 'all', App().jobsOf).totalUnits))}</td></tr>` : ''; }).join('');
    const top = devs.slice().sort((a, b) => (b.units || 0) - (a.units || 0)).slice(0, 20);
    const count = (key, name) => { const m = new Map(); for (const p of devs) for (const id of SD().svcIds(p, key)) m.set(id, (m.get(id) || 0) + 1); return [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => `${name(id)} (${n})`).join(', '); };
    const body = `<h1>${esc(title)}</h1><p class="sub">${fmtNum(devs.length)} developments · ${fmtNum(Math.round(e.totalUnits))} units · ${fmtNum(roundPop(e.population))} people · ${fmtNum(roundPop(e.employment.jobs))} jobs</p>
      <p class="meta">Area report · prepared ${esc(new Date().toLocaleDateString('en-CA', { dateStyle: 'medium' }))} · Peel Growth Pipeline (unofficial) · filters: ${esc(FI().activeFilters().map(f => f.label).join(', ') || 'none')}</p>
      <div class="grid"><div>
        <h2>By phase</h2><table><tr><th>Phase</th><th class="n">Developments</th><th class="n">Units</th></tr>${byPhase}</table>
        <h2>Servicing demand (combined, Peel design criteria)</h2><table><tr><th></th><th class="n">Average</th><th class="n">Max day / peak dry</th><th class="n">Peak hour / wet</th></tr>
          <tr><td>Water</td><td class="n">${fmt1(cb.water.avg)} L/s</td><td class="n">${fmt1(cb.water.maxDay)} L/s</td><td class="n">${fmt1(cb.water.peakHour)} L/s</td></tr>
          <tr><td>Wastewater</td><td class="n">${fmt1(cb.wastewater.avg)} L/s</td><td class="n">${fmt1(cb.wastewater.peak)} L/s</td><td class="n">${fmt1(cb.wastewater.wetPeak)} L/s</td></tr></table>
        <p class="muted">${fmt1(D.toMLd(cb.water.avg))} ML/d water average · ${fmt1(D.toMLd(cb.wastewater.avg))} ML/d wastewater average. Pressure zones: ${esc(count('pz', id => (SD().svcById.get(id) || {}).name || id).replace(/Pressure zone /g, 'Zone '))}.</p>
      </div><div>${pts.length ? sketchSVG({ center, halfM, points: pts, rings }) : ''}</div></div>
      ${rows.length ? `<h2>Capacity it relies on (needs a DC project or a check)</h2><table>${needHead('<th class="n">Developments</th>')}${rows.map(a => needRow(a.c, ppu, `<td class="n">${fmtNum(a.n)}</td>`)).join('')}</table><p class="muted">From the ${fmtNum(Math.min(150, pts.length))} largest developments; room in units at ${ppu} persons per unit (apartment).</p>` : ''}
      <h2>Largest developments</h2><table><tr><th>Development</th><th>Municipality</th><th>Phase</th><th class="n">Units</th></tr>${top.map(p => `<tr><td>${esc(p.title)}</td><td>${esc(p.municipality)}</td><td>${esc(P.PHASE_BY_KEY[p.phase].label)}</td><td class="n">${fmtNum(p.units || 0)}</td></tr>`).join('')}</table>
      ${reportFooter()}`;
    openReport(title, body);
  }
  // (Phase 5: the old standalone DC-timing Excel export's rows moved into the
  // workbook — dcTimingRows() in js/export-workbook.js, used by
  // exportWorkbook()'s DC sheet.)
  document.addEventListener('click', e => {
    if (e.target.closest('[data-memo]') && DN().getCurrentProject()) return devMemo(DN().getCurrentProject());
    const a = e.target.closest('[data-area-report]'); if (!a) return;
    if (a.dataset.areaReport === 'sel') areaReport([...AS().selection.values()], `Area report – ${fmtNum(AS().selection.size)} selected developments`, AS().selAreas);
    else { const where = [App().state.muni, ...Object.keys(MM().AREA_F).map(k => PA().multiSummary(k, true))].filter(Boolean).join(', ') || 'All of Peel'; areaReport(App().state.filtered, `Area report – ${where}`); }
  });

  // ---- Public contract ----
  const api = { appVersion, briefingPDF, comparisonPDF, devMemo, areaReport, openReport, reportFooter };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelReports = api;
})(typeof window !== 'undefined' ? window : globalThis);
