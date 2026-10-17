(function (root) {
'use strict';
  // ---- Timeline slider -------------------------------------------------------------
  const { $, esc, fmtNum } = window.PeelUtil;
  const App = () => root.PeelApp;
  // ---- Timeline slider -------------------------------------------------------------
  const tFrom = $('#t-from'), tTo = $('#t-to');
  // Default year range on load and after "Reset all".
  const DEFAULT_YEARS = [2021, 2026];
  let yearsInit = false;
  function updateYearBounds() {
    let lo = Infinity, hi = -Infinity;
    for (const p of App().state.projects) for (const t of p.timeline) {
      const y = t.date.getUTCFullYear();   // (UTC midnight dates: 1 January is not the year before in Toronto)
      if (y < lo) lo = y; if (y > hi) hi = y;
    }
    const now = new Date().getFullYear();
    if (!isFinite(lo)) { lo = Number(App().state.sinceYear) || now - 10; hi = now; }
    lo = Math.max(lo, 1980); hi = Math.min(Math.max(hi, lo + 1), now + 5);
    App().state.yearMin = lo; App().state.yearMax = hi;
    for (const el of [tFrom, tTo]) { el.min = lo; el.max = hi; el.step = 1; }
    if (!yearsInit && App().state.projects.length) { yearsInit = true; setDefaultYears(); }
    tFrom.value = App().state.yearFrom ?? lo;
    tTo.value = App().state.yearTo ?? hi;
  }
  function setDefaultYears() {
    const lo = App().state.yearMin, hi = App().state.yearMax;
    App().state.yearFrom = !DEFAULT_YEARS || DEFAULT_YEARS[0] <= lo ? null : DEFAULT_YEARS[0];
    App().state.yearTo = !DEFAULT_YEARS || DEFAULT_YEARS[1] >= hi ? null : DEFAULT_YEARS[1];
    tFrom.value = App().state.yearFrom ?? lo; tTo.value = App().state.yearTo ?? hi;
  }
  const atDefaultYears = () => {
    const lo = App().state.yearMin, hi = App().state.yearMax;
    if (!DEFAULT_YEARS) return App().state.yearFrom == null && App().state.yearTo == null;
    return (App().state.yearFrom ?? lo) === Math.max(lo, DEFAULT_YEARS[0]) && (App().state.yearTo ?? hi) === Math.min(hi, DEFAULT_YEARS[1]);
  };
  function setYearsSilently(from, to) {
    App().state.yearFrom = null; App().state.yearTo = null;
    tFrom.value = from; tTo.value = to;
  }
  function setYears(from, to) {
    const lo = App().state.yearMin, hi = App().state.yearMax;
    if (from > to) [from, to] = [to, from];
    App().state.yearFrom = from <= lo ? null : from;
    App().state.yearTo = to >= hi ? null : to;
    tFrom.value = from; tTo.value = to;
    App().applyFilters();
  }
  // "Last 12 months" as a year range on the 'any' milestone: the When preset and the
  // migration of the old newapps focus.
  function setLast12Months() {
    App().state.yearMode = 'any';
    const y = new Date().getFullYear();
    setYears(y - 1, y);
  }
  // A development's layer, kept per development object (rebuilt developments are new objects).
  const LAYER_ORDER = ['anticipated', 'proposed', 'committed', 'built', 'existing'];
  const lyCache = new WeakMap();
  const layerOf = p => { if (!window.PeelLayers) return null; if (!lyCache.has(p)) lyCache.set(p, window.PeelLayers.layerOf(p)); return lyCache.get(p); };
  function renderTimeline() {
    const lo = App().state.yearMin, hi = App().state.yearMax;
    if (lo == null) return;
    const from = App().state.yearFrom ?? lo, to = App().state.yearTo ?? hi;
    $('#t-label').textContent = App().timeActive() ? (from === to ? `${from}` : `${from} – ${to}`) : 'All years';
    // The filter panel's When controls mirror the timeline.
    const fm = $('#f-milestone'); if (fm) fm.value = App().state.yearMode;
    const yf = $('#f-yfrom'); if (yf) yf.value = App().state.yearFrom == null ? '' : App().state.yearFrom;
    const yt = $('#f-yto'); if (yt) yt.value = App().state.yearTo == null ? '' : App().state.yearTo;
    // One button: back to the default range, or from the default to all years.
    const atDefault = atDefaultYears();
    $('#t-reset').hidden = atDefault && !App().timeActive();
    $('#t-reset').textContent = atDefault || !DEFAULT_YEARS ? 'All years' : `${DEFAULT_YEARS[0]}–${DEFAULT_YEARS[1]}`;
    // Histogram ignores the year filter itself so you can see where to drag. Each year's bar is
    // coloured by the developments' layers (SPEC §2.4).
    const counts = new Map(), byLy = new Map();
    for (const p of App().state.projects) {
      if (!App().matches(p, false, true)) continue;
      const ly = layerOf(p);
      for (const y of App().yearsOf(p, App().state.yearMode)) if (y >= lo && y <= hi) {
        counts.set(y, (counts.get(y) || 0) + 1);
        const m = byLy.get(y) || byLy.set(y, {}).get(y); if (ly) m[ly] = (m[ly] || 0) + 1;
      }
    }
    const max = Math.max(1, ...counts.values());
    const LN = window.PeelLayerBar ? window.PeelLayerBar.LABEL : {};
    const stack = y => LAYER_ORDER.filter(k => (byLy.get(y) || {})[k]).map(k => `<span class="ly-${k}" style="flex:${byLy.get(y)[k]} 1 0"></span>`).join('');
    const split = y => LAYER_ORDER.filter(k => (byLy.get(y) || {})[k]).map(k => `${LN[k] || k} ${fmtNum(byLy.get(y)[k])}`).join(', ');
    const mode = (($('#t-mode').selectedOptions || [])[0] || { textContent: 'any milestone' }).textContent.toLowerCase();
    let bars = '';
    for (let y = lo; y <= hi; y++) {
      const n = counts.get(y) || 0;
      const on = y >= from && y <= to;
      bars += `<button type="button" class="bar${on ? ' on' : ''}" data-y="${y}" title="${y}: ${fmtNum(n)} development${n === 1 ? '' : 's'} (${esc(mode)})${n ? `: ${esc(split(y))}` : ''}"
        aria-label="${y}: ${n} developments"><i style="height:${n ? Math.max(2, n / max * 100) : 0}%">${stack(y)}</i></button>`;
    }
    $('#t-hist').innerHTML = bars;
    const span = hi - lo, step = span > 24 ? 5 : span > 10 ? 2 : 1;
    let ticks = '';
    for (let y = lo; y <= hi; y++) if ((y - lo) % step === 0 || y === hi) ticks += `<span style="left:${(y - lo + 0.5) / (span + 1) * 100}%">${y}</span>`;
    $('#t-ticks').innerHTML = ticks;
    // Keep slider thumbs centred on their year's bar.
    const pad = `(${50 / (span + 1)}% - 8px)`;
    for (const el of [tFrom, tTo]) { el.style.left = `calc${pad}`; el.style.width = `calc(100% - 2 * ${pad})`; }
  }
  // A drag applies the years when it pauses or lets go: each step re-filters every development (a
  // six-year drag froze the page for 7 s). The thumbs move at once; the keys and a release apply now.
  let dragT = null;
  const applyDrag = () => { clearTimeout(dragT); dragT = null; setYears(+tFrom.value, +tTo.value); };
  const dragTo = () => { clearTimeout(dragT); dragT = setTimeout(applyDrag, 120); };
  tFrom.oninput = () => { if (+tFrom.value > +tTo.value) tTo.value = tFrom.value; dragTo(); };
  tTo.oninput = () => { if (+tTo.value < +tFrom.value) tFrom.value = tTo.value; dragTo(); };
  tFrom.onchange = tTo.onchange = () => { if (dragT) applyDrag(); };
  $('#t-reset').onclick = () => { if (atDefaultYears()) setYears(App().state.yearMin, App().state.yearMax); else { setDefaultYears(); App().applyFilters(); } };
  $('#t-mode').onchange = e => { App().state.yearMode = e.target.value; const fm = $('#f-milestone'); if (fm) fm.value = App().state.yearMode; App().applyFilters(); };
  // Click a year bar to isolate it; shift-click to extend the range.
  let anchorYear = null;
  $('#t-hist').onclick = e => {
    const b = e.target.closest('[data-y]'); if (!b) return;
    const y = +b.dataset.y;
    if (e.shiftKey && anchorYear != null) setYears(Math.min(anchorYear, y), Math.max(anchorYear, y));
    else { anchorYear = y; setYears(y, y); }
  };

  // ---- Public contract ------------------------------------------------------------------
  const api = { tFrom, tTo, updateYearBounds, renderTimeline, setDefaultYears, atDefaultYears, setYearsSilently, setYears, setLast12Months };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTimeline = api;
})(typeof window !== 'undefined' ? window : globalThis);
