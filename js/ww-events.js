(function (root) {
'use strict';
  // Overflows and spills reported in the Region's Wastewater Collection System annual reports
  // (data/ww-events.json, Table 7 transcribed and checked by scripts/check-ww-events.js), and the
  // report's station roster (Appendix A).
  //
  //   forStation(a)     events at a pumping station (a: a servicing area of kind 'ps')
  //   forPlant(pl)      events at the stations draining to a plant
  //   rowsFor(list)     panel list rows (PeelPanel lists)
  //   summaryHTML()     Peel-wide: each year's count, overflows, volume and the largest events
  //   rosterHTML()      Data checks: GIS stations against the report's roster
  // Pure strings; reads App().state.wwEvents and the servicing data.
  const App = () => root.PeelApp;
  const SD = () => root.PeelSvcData;
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const data = () => (App() && App().state && App().state.wwEvents) || null;
  // "Richards Memorial PS", "RICHARD MEMORIAL SEW. PUMP STN", "Richards Memorial" → "richardmemorial"
  // Token by token: drop the station words and street types, expand N / E, fold the few spellings
  // that differ between the GIS layer and the report.
  const DROP = new Set(['sew', 'sewage', 'sewer', 'pump', 'pumping', 'stn', 'station', 'st', 'street', 'sps', 'ps', 'lift', 'ct', 'court', 'trail', 'memorial', 'park', 'dr', 'drive']);
  const EXPAND = { n: 'north', e: 'east', richards: 'richard', silverbirch: 'silver birch' };
  const key = s => String(s || '').toLowerCase().replace(/^[^·]*·\s*/, '').replace(/['’.]/g, '').split(/[^a-z0-9]+/)
    .map(t => EXPAND[t] || t).join(' ').split(' ').filter(t => t && !DROP.has(t)).join('');
  const all = () => { const D = data(); return D ? Object.entries(D.years).flatMap(([y, ev]) => ev.map(e => ({ ...e, year: y }))) : []; };
  const nameOf = a => (SD() && SD().drName ? SD().drName(a) : a.name) || '';
  function forStation(a) { const k = key(nameOf(a)); return k ? all().filter(e => e.station && key(e.station) === k) : []; }
  function forPlant(pl) {
    const ps = (App() && App().state.servicing && App().state.servicing.psAreas) || [];
    const ks = new Set(ps.filter(a => a.plant === pl).map(a => key(nameOf(a))));
    return all().filter(e => e.station && ks.has(key(e.station)));
  }
  const fmtVol = e => e.volumeM3 != null ? `${e.volumeM3 >= 100 ? Math.round(e.volumeM3).toLocaleString('en-CA') : e.volumeM3} m³` : e.duration || 'volume unknown';
  const dateTxt = d => new Date(`${d}T12:00:00`).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
  function rowsFor(list) {
    return list.sort((a, b) => b.date.localeCompare(a.date)).map(e => ({ html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(dateTxt(e.date))} · ${esc(e.kind === 'overflow' ? 'Overflow' : 'Spill')}</span><span class="pnl-r-fig">${esc(fmtVol(e))}</span></div><div class="pnl-r-sub small muted">${esc(e.cause)}${e.note ? ` · ${esc(e.note)}` : ''} · SAC ${esc(e.sacRef)}</div>` }));
  }
  function summaryHTML() {
    const D = data(); if (!D) return '';
    const yrs = Object.keys(D.years).sort().reverse();
    const rows = yrs.map(y => {
      const ev = D.years[y], ov = ev.filter(e => e.kind === 'overflow'), vol = ev.reduce((t, e) => t + (e.volumeM3 || 0), 0), wet = ev.filter(e => e.cause === 'wet weather').length;
      const big = ev.filter(e => e.volumeM3).sort((a, b) => b.volumeM3 - a.volumeM3).slice(0, 2).map(e => `${esc(e.place)} ${esc(fmtVol(e))}`).join('; ');
      const st = [...new Set(ev.filter(e => e.station && e.kind === 'overflow').map(e => e.station))];
      const R = D.reports[y] || {};
      return `<tr><td>${esc(y)}</td><td class="num">${ev.length}</td><td class="num">${ov.length}</td><td class="num">${wet}</td><td class="num">${Math.round(vol).toLocaleString('en-CA')} m³</td><td class="small">${big}${st.length ? `<div class="muted">Stations that overflowed: ${esc(st.join(', '))}</div>` : ''}</td><td class="small">${R.url ? `<a href="${esc(R.url)}" target="_blank" rel="noopener">Table 7</a>` : 'Table 7'}, pp. ${esc(R.pages || '')}</td></tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="dt"><thead><tr><th>Year</th><th class="num">Events</th><th class="num">Overflows</th><th class="num">Wet weather</th><th class="num">Volume (estimated)</th><th>Largest</th><th>Source</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">${esc(D.note)} Volume sums only the events with an estimate.</p>`;
  }
  function rosterHTML() {
    const D = data(), sv = App() && App().state.servicing, list = sv && ((sv.meta && sv.meta.pumpingStations) || sv.pumpingStations); if (!D || !list) return '';
    const roster = [...D.stations.southPeel, ...D.stations.inglewood];
    const rk = new Set(roster.map(key)), gk = new Map(list.map(p => [key(p.name), p.name]));
    const extra = [...gk].filter(([k]) => !rk.has(k)).map(([, n]) => n), missing = roster.filter(n => !gk.has(key(n)));
    return `<h3 class="sub-title">Pumping stations: open GIS layer against the collection system report</h3>
      <p class="small">${list.length} points in the Region's layer; ${roster.length} sewage pumping stations under the collection system approval (Appendix A). ${missing.length ? `In the report, not on the layer: ${esc(missing.join(', '))}. ` : 'Every station in the report is on the layer. '}${extra.length ? `On the layer, not a station in the report: ${esc(extra.join(', '))} (leachate, septage and lift stations, or stations outside the approval).` : ''}</p>`;
  }

  root.PeelWwEvents = { forStation, forPlant, rowsFor, summaryHTML, rosterHTML, key };
  if (typeof window !== 'undefined') {
    window.ModelChecks = window.ModelChecks || {};
    Object.defineProperty(window.ModelChecks, 'wwRoster', { enumerable: true, configurable: true, get: () => ({ html: rosterHTML() }) });
  }
})(typeof window !== 'undefined' ? window : globalThis);
