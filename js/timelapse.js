/* js/timelapse.js — Time-lapse (Phase 7, feature 5): replay development growth on the map,
 * year by year from 2016 to the present, inside Presentation mode.
 *
 * Year engine (pure, Node-testable): phaseAsOfYear(project, year) reconstructs each
 * development's phase as of Dec 31 of the year from dated evidence —
 *   - the dated file events on its records (project.timeline when built, else the
 *     records' own events: application received / approved / permit issued / inspections /
 *     completion dates as published by the municipalities), and
 *   - project.historyEvents, the weekly phase readings from data/history.json
 *     ([date, phase] tuples, attached by the controller from App().state.history).
 * A weekly reading pins the phase at its date (it is the app's own classification,
 * including rule reclassifications); file milestones move the phase forward, and a
 * dated cancellation is terminal until newer dated activity restarts the cycle.
 * Projects with dated evidence only after the year return null (not yet tracked);
 * projects with no events at all (legacy/undated files) are pinned at their current
 * phase for the whole range.
 *
 * Browser controller: a "Time-lapse" button next to Present enters Presentation mode
 * and starts the replay. While active, each development's phase is overridden with its
 * phase-as-of-year and the map re-renders (markers, outlines, legend), with a year
 * scrubber, play/pause (default 1 year / 1.2 s, adjustable speed), and a headline
 * like "2019 — 412 active developments". Exiting Presentation mode (Esc, the Exit
 * button, leaving fullscreen) stops the time-lapse and restores every phase.
 * prefers-reduced-motion: no autoplay; the scrubber still works manually.
 */
(function (root) {
  'use strict';

  // ---- Pure year engine (no DOM, no network) ---------------------------------------
  const START_YEAR = 2016; // matches data/snapshot.json sinceYear: the data window starts here
  const SPEEDS = [
    { ms: 600, label: 'Fast · one year every 0.6 s' },
    { ms: 1200, label: 'Normal · one year every 1.2 s' },
    { ms: 2500, label: 'Slow · one year every 2.5 s' },
  ];
  const DEFAULT_SPEED_MS = 1200;

  // Phase ranks: authoritative from PeelPhases in the browser; the fallback mirrors it
  // exactly so the pure engine is testable in Node (where modules don't set globals).
  let _rank = null;
  function rankMap() {
    if (!_rank) {
      const P = root.PeelPhases;
      _rank = (P && P.ALL_PHASES)
        ? Object.fromEntries(P.ALL_PHASES.map(p => [p.key, p.rank]))
        : { inception: 0, review: 1, approved: 2, permit: 3, construction: 4, completed: 5, cancelled: -1 };
    }
    return _rank;
  }
  const cutoffMs = year => Date.UTC(year, 11, 31, 23, 59, 59); // as of Dec 31, UTC
  const evTime = d => {
    if (d == null) return NaN;
    const t = d instanceof Date ? d.getTime() : new Date(d).getTime();
    return isFinite(t) ? t : NaN;
  };

  // Dated phase evidence for one project, ascending by time. Weekly readings
  // (history.json) sort after file events at the same instant: they are the
  // authoritative classification at that date.
  function evidenceFor(project) {
    const rank = rankMap(), ev = [];
    const tl = project.timeline && project.timeline.length ? project.timeline : null;
    // The built timeline already folds zoning/OPA/subdivision approvals back to review
    // (see phases.js); otherwise use the records' own dated events.
    const src = tl || (project.records || []).flatMap(r => (r.events || []).map(e => ({ date: e.date, phase: e.phase })));
    let seq = 0;
    for (const e of src) {
      if (!e || !Object.prototype.hasOwnProperty.call(rank, e.phase)) continue;
      const t = evTime(e.date);
      if (!isFinite(t)) continue;
      ev.push({ t, phase: e.phase, snap: false, seq: seq++ });
    }
    for (const he of project.historyEvents || []) {
      if (!he || !Object.prototype.hasOwnProperty.call(rank, he[1])) continue;
      const t = evTime(he[0]);
      if (!isFinite(t)) continue;
      ev.push({ t, phase: he[1], snap: true, seq: seq++ });
    }
    ev.sort((a, b) => a.t - b.t || (a.snap - b.snap) || (a.seq - b.seq));
    return { ev, anyEvents: src.length > 0 || (project.historyEvents || []).length > 0 };
  }

  // The development's phase as of Dec 31 of `year` (a phase key), or null when the
  // project had no dated evidence by then (not yet tracked).
  function phaseAsOfYear(project, year) {
    if (!project || !isFinite(year)) return null;
    const rank = rankMap(), cutoff = cutoffMs(Math.floor(year));
    const { ev, anyEvents } = evidenceFor(project);
    if (!ev.some(e => e.t <= cutoff)) {
      if (anyEvents) return null;
      const cur = project.phase; // legacy/undated files: pin at the current phase
      return Object.prototype.hasOwnProperty.call(rank, cur) ? cur : null;
    }
    let cur = null;
    for (const e of ev) {
      if (e.t > cutoff) break;
      if (e.snap) cur = e.phase;
      else if (e.phase === 'cancelled') cur = 'cancelled';
      else if (cur == null || rank[e.phase] > rank[cur]) cur = e.phase;
    }
    return cur;
  }

  function timelapseYears(now) {
    const end = now instanceof Date ? now.getFullYear() : new Date().getFullYear();
    const yrs = [];
    for (let y = START_YEAR; y <= Math.max(START_YEAR, end); y++) yrs.push(y);
    return yrs;
  }
  function clampYear(y, yrs) {
    yrs = yrs || timelapseYears();
    return Math.min(yrs[yrs.length - 1], Math.max(yrs[0], Math.round(y)));
  }
  function isReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---- Browser controller (skipped under Node) --------------------------------------
  const App = () => root.PeelApp;
  const AS = () => root.PeelAreaSelect;
  const RL = () => root.PeelRenderList;
  const MM = () => root.PeelMapMarkers;
  const MA = () => root.PeelMapAnalysis;
  const PD = () => root.PeelDesign;
  const U = () => root.PeelUtil || {
    $: () => null, esc: String, fmtNum: n => String(n),
    store: { get: (k, d) => d, set() {} }, dot: () => '',
  };
  const PH = () => root.PeelPhases || { ALL_PHASES: [], PHASE_BY_KEY: {} };
  const ACTIVE_FALLBACK = ['inception', 'review', 'approved', 'permit', 'construction'];

  let tl = null; // { years, year, playing, timer, speedMs, base:Set }
  let scrubTimer = null;

  function phaseLabel(key) {
    const byKey = PH().PHASE_BY_KEY || {};
    return (byKey[key] && byKey[key].label) || key;
  }

  function startTimelapse() {
    if (typeof document === 'undefined' || !App() || !App().state) return false;
    const st = App().state;
    if (!st.projects || !st.projects.length) return false;
    if (AS()) {
      if (!AS().inPresentation()) AS().enterPresentation();
    } else return false;
    if (tl) { applyYear(tl.year); return true; }
    let speedMs = U().store.get('tlSpeedMs', DEFAULT_SPEED_MS);
    if (!SPEEDS.some(s => s.ms === speedMs)) speedMs = DEFAULT_SPEED_MS;
    tl = {
      years: timelapseYears(), year: START_YEAR, playing: false, timer: null,
      speedMs, base: new Set(st.filtered.map(p => p.key)),
    };
    buildBar();
    applyYear(START_YEAR);
    syncBtn();
    return true;
  }

  // One frame of the replay: override every development's phase with its
  // phase-as-of-year, re-filter to the developments that existed, re-render.
  function applyYear(year) {
    if (!tl || typeof document === 'undefined') return;
    year = clampYear(year, tl.years);
    tl.year = year;
    const st = App().state;
    const hist = st.history && st.history.projects;
    const ACTIVE = new Set(App().ACTIVE_PHASES || ACTIVE_FALLBACK);
    const counts = {};
    let active = 0, shown = 0;
    for (const p of st.projects) {
      if (hist && p.historyEvents === undefined) p.historyEvents = hist[p.key]; // history.json can arrive after boot
      if (p._tlSaved === undefined) p._tlSaved = p.phase;
      const ph = phaseAsOfYear(p, year);
      p._tlHidden = ph == null;
      if (ph == null) continue;
      p.phase = ph; shown++;
      counts[ph] = (counts[ph] || 0) + 1;
      if (ACTIVE.has(ph)) active++;
    }
    st.filtered = st.projects.filter(p => tl.base.has(p.key) && !p._tlHidden && st.phases.has(p.phase));
    RL().renderMarkers();
    MM().renderSiteLayer();
    if (MM().mstyle.color === 'phase') MA().renderLegend();
    paintBar(year, active, shown, counts);
    const slider = document.getElementById('tl-year');
    if (slider && +slider.value !== year) slider.value = String(year);
  }

  function setPlaying(on) {
    if (!tl || typeof document === 'undefined') return;
    if (on && tl.year >= tl.years[tl.years.length - 1]) tl.year = tl.years[0]; // replay from the start
    tl.playing = on;
    if (tl.timer) { clearInterval(tl.timer); tl.timer = null; }
    if (on) {
      tl.timer = setInterval(() => {
        if (!tl) return;
        if (document.hidden) return;   // a background tab holds its year instead of re-rendering unseen frames
        if (tl.year >= tl.years[tl.years.length - 1]) { setPlaying(false); return; }
        applyYear(tl.year + 1);
      }, tl.speedMs);
    }
    const b = document.getElementById('tl-play');
    if (b) {
      b.setAttribute('aria-pressed', String(on));
      b.title = on ? 'Pause the time-lapse' : `Play: advance one year every ${tl.speedMs / 1000} s`;
      const ic = PD() && PD().icon ? PD().icon(on ? 'pause' : 'play') : '';
      b.innerHTML = ic;
      b.setAttribute('aria-label', on ? 'Pause' : 'Play');
    }
  }

  function stopTimelapse() {
    if (!tl || typeof document === 'undefined') return;
    setPlaying(false);
    const st = App().state, base = tl.base;
    for (const p of st.projects) {
      if (p._tlSaved !== undefined) { p.phase = p._tlSaved; delete p._tlSaved; }
      delete p._tlHidden;
      delete p.historyEvents;
    }
    tl = null;
    st.filtered = st.projects.filter(p => base.has(p.key) && st.phases.has(p.phase));
    RL().renderMarkers();
    MM().renderSiteLayer();
    if (MM().mstyle.color === 'phase') MA().renderLegend();
    teardownBar();
    if (AS() && AS().inPresentation()) AS().renderPresentation();
    syncBtn();
  }

  function buildBar() {
    const bar = document.getElementById('presentation-bar');
    if (!bar || document.getElementById('tl-bar')) return;
    const { esc } = U();
    const years = tl.years, lo = years[0], hi = years[years.length - 1];
    const opts = SPEEDS.map(s => `<option value="${s.ms}"${s.ms === tl.speedMs ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
    const div = document.createElement('div');
    div.id = 'tl-bar';
    div.innerHTML =
      `<div class="tl-top"><span id="tl-bigyear" aria-hidden="true">${lo}</span>` +
      `<span class="tl-head" id="tl-head" role="status"></span>` +
      `<span class="tl-chips" id="tl-chips"></span></div>` +
      `<div class="tl-controls">` +
      `<button type="button" class="btn small tl-play" id="tl-play" aria-pressed="false" aria-label="Play"></button>` +
      `<input type="range" id="tl-year" min="${lo}" max="${hi}" step="1" value="${lo}" aria-label="Time-lapse year">` +
      `<select id="tl-speed" aria-label="Playback speed">${opts}</select>` +
      `<button type="button" class="btn small" id="tl-done" title="Stop the time-lapse (stay in presentation mode)">Done</button>` +
      `</div>`;
    bar.appendChild(div);
    document.getElementById('tl-play').addEventListener('click', () => setPlaying(!tl.playing));
    const slider = document.getElementById('tl-year');
    slider.addEventListener('input', () => {
      if (scrubTimer) clearTimeout(scrubTimer);
      scrubTimer = setTimeout(() => { if (tl) { setPlaying(false); applyYear(+slider.value); } }, 120);
    });
    slider.addEventListener('change', () => { if (tl) { setPlaying(false); applyYear(+slider.value); } });
    document.getElementById('tl-speed').addEventListener('change', e => {
      if (!tl) return;
      tl.speedMs = +e.target.value;
      U().store.set('tlSpeedMs', tl.speedMs);
      if (tl.playing) setPlaying(true); // restart the interval at the new speed
      else setPlaying(false);           // refresh the play button's title
    });
    document.getElementById('tl-done').addEventListener('click', () => stopTimelapse());
    const hl = document.getElementById('pres-hl'), tiles = document.getElementById('pres-tiles');
    if (hl) hl.hidden = true;
    if (tiles) tiles.hidden = true;
    div.hidden = false;
  }

  function paintBar(year, active, shown, counts) {
    const { fmtNum, dot } = U();
    const big = document.getElementById('tl-bigyear'), head = document.getElementById('tl-head'), chips = document.getElementById('tl-chips');
    if (big) big.textContent = String(year);
    if (head) {
      head.textContent = `${fmtNum(active)} active development${active === 1 ? '' : 's'}`;
      head.setAttribute('aria-label', `${year} — ${head.textContent}`);
    }
    if (chips) {
      const order = (PH().ALL_PHASES || []).map(p => p.key);
      chips.innerHTML = order.filter(k => counts[k] > 0)
        .map(k => `<span class="tl-chip">${dot(k)}${U().esc(phaseLabel(k))} <b>${fmtNum(counts[k])}</b></span>`).join('') +
        (shown ? `<span class="tl-chip tl-total muted">${fmtNum(shown)} shown</span>` : '');
    }
  }

  function teardownBar() {
    const t = document.getElementById('tl-bar');
    if (t) t.remove();
    const hl = document.getElementById('pres-hl'), tiles = document.getElementById('pres-tiles');
    if (hl) hl.hidden = false;
    if (tiles) tiles.hidden = false;
  }

  function syncBtn() {
    const b = typeof document !== 'undefined' && document.getElementById('tb-timelapse');
    if (!b) return;
    b.setAttribute('aria-pressed', String(!!tl));
    b.classList.toggle('on', !!tl);
  }

  function initUI() {
    if (typeof document === 'undefined') return;
    const btn = document.getElementById('tb-timelapse');
    if (btn) {
      if (PD() && PD().icon) btn.insertAdjacentHTML('afterbegin', PD().icon('clock'));
      btn.addEventListener('click', () => {
        if (tl) stopTimelapse();
        else if (startTimelapse()) setPlaying(!isReducedMotion()); // reduced motion: scrub manually, no autoplay
      });
    }
    // Leaving Presentation mode by any route (Esc, the Exit button, leaving
    // fullscreen, the Present toggle) stops the time-lapse and restores phases.
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        if (tl && AS() && !AS().inPresentation()) stopTimelapse();
        syncBtn();
      }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-presentation'] });
    }
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initUI);
    else initUI();
  }

  const api = {
    phaseAsOfYear, evidenceFor, timelapseYears, clampYear, isReducedMotion,
    START_YEAR, SPEEDS, DEFAULT_SPEED_MS,
    // Browser controller (no-ops under Node; exposed for testing the wiring surface).
    isActive: () => !!tl,
    start: () => (typeof document === 'undefined' ? false : startTimelapse()),
    stop: () => { if (typeof document !== 'undefined') stopTimelapse(); },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTimelapse = api;
})(typeof window !== 'undefined' ? window : globalThis);
