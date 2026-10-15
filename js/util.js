/* js/util.js — shared pure helpers for the Peel Development Tracker.
 * Extracted verbatim from js/app.js (Phase 6 split). Loads FIRST, before
 * js/config.js, so every module can destructure from window.PeelUtil at load.
 * DOM-free at top level by design: localStorage falls back to an in-memory
 * Map, and document / window.PeelPhases are only touched inside function
 * bodies (util.js loads before js/phases.js). Safe to require() under Node. */
(function (root) {
  'use strict';

  // ---- Unofficial banner (source: app.js 13–14) ---------------------------------
  const UNOFFICIAL = 'Unofficial prototype · public data only · not a Region of Peel product';
  // The screening note, in the user's wording, everywhere a result appears (design audit, Group 10).
  const SCREEN_LINE = 'General screening results only. Peel\u2019s W&WW Infrastructure Planning team must validate or confirm all results.';
  // The criteria behind every flow and capacity figure: document and version (the criteria stamp).
  const CRITERIA_STAMP = 'Peel design criteria: Modelling Demand Table v2.0 (Aug 2024) and Linear Wastewater Standards R1.0 (Mar 2023)';
  // Every CSV starts with these lines (and every GeoJSON / model file carries the same text).
  const CSV_DISCLAIMER = `# ${UNOFFICIAL}\n# ${SCREEN_LINE}\n# ${CRITERIA_STAMP}\n`;
  const DISCLAIMER_PROPS = { disclaimer: UNOFFICIAL, screening: SCREEN_LINE, criteria: CRITERIA_STAMP };

  // ---- Tiny DOM / string / number helpers (source: app.js 17–24) ----------------
  const estTag = '<span class="est-tag">screening estimate</span>';
  // Individual-pipe modelling results (capacity, % full, freeboard, sewer profile, tightest pipes,
  // the pipe upgrade tool, the EPANET per-main table) are off for now: true brings them back.
  const PIPE_RESULTS = false;
  // Chart width in SVG units = the analysis panel's width in pixels (design audit, Group 8): a chart
  // drawn at its rendered size keeps its 11-unit labels at 11 px instead of scaling them down.
  const chartW = (min = 320, max = 900) => {
    let w = 0;
    try { const el = typeof document !== 'undefined' && document.getElementById('analysis-panes'); w = el && el.clientWidth ? el.clientWidth - (el.clientWidth < 500 ? 44 : 32) : 0; } catch (e) { w = 0; }
    return Math.round(Math.max(min, Math.min(max, w || 560)));
  };
  // Growth's pace, census and 2051 views at development scope (design audit, Group 6).
  const AREA_ONLY_NOTE = '<p class="small muted area-only">Pace, the census and the 2051 allocation describe an area, not one development. Use the trail (Peel, or the area) to see them.</p>';
  // Pipe class by size (design audit, Group 4), not by distance along the path: the smallest
  // "primary wastewater main (trunk)" on the Region's 2026 DC capital maps is 750 mm.
  const TRUNK_MM = 750;
  const pipeClass = d => (d >= TRUNK_MM ? 'trunk' : 'local');
  // What a sewer line says while pipe-by-pipe results are off: never a number, never "no constraint".
  const PIPES_NOT_ASSESSED = 'Sewer pipes: not assessed (pipe-by-pipe capacity is left to the Region\u2019s hydraulic model)';
  // Shown before every trace and servicing demand result: this is one screening method, and the
  // Region's hydraulic models stay the authority.
  const SCREEN_NOTE_SHORT = `<p class="screen-note screen-note-sm" role="note"><strong>General screening results only.</strong> Peel\u2019s W&amp;WW Infrastructure Planning team must validate or confirm all results.</p>`;
  const SCREEN_NOTE = `<p class="screen-note" role="note"><strong>General screening results only.</strong> Peel\u2019s W&amp;WW Infrastructure Planning team must validate or confirm all results. <span class="crit-stamp">${CRITERIA_STAMP}; public data, not a hydraulic model.</span></p>`;
  // Public version (?public in the address, or Settings): hides the DC timing / funding screens'
  // results, the verdict colours and the CSV screening column (design audit, Group 2).
  const isPublic = () => { try { if (typeof location !== 'undefined' && /[?&]public(=|&|$)/.test(location.search)) return true; } catch (e) { /* no location */ } return !!store.get('publicView', false); };
  const applyPublic = () => { if (typeof document !== 'undefined') document.documentElement.toggleAttribute('data-public', isPublic()); };
  // Screening wording: results are screening outcomes, never Region decisions or capital advice.
  const SCREEN = {
    advance: 'Screens late',
    keep: 'Screens in time',
    defer: 'Screens well ahead of need',
    review: 'No modelled need',
    within: 'Within the funding screen',
    outside: 'Outside the funding screen',
    over: 'Screens over rated capacity',
  };
  // Capital schedule currency (design audit, Group 3). Every planned date comes from the 2026 DC
  // capital maps (draft v2, March 2026). In May 2026 Regional Council paused all new growth-related
  // water and wastewater capital procurements from June 11, 2026, until upper levels of government
  // commit funding. Status of a planned work: 'scheduled' (known to be going ahead; set per project
  // in CAPITAL.overrides), 'paused' (not yet tendered: proposed for 2027 or later), or 'unknown' (in
  // the 2026 budget: paused only if not tendered or awarded by June 11, 2026).
  const CAPITAL = {
    asOf: 'March 2026',
    source: '2026 DC capital maps (draft v2, March 2026)',
    pauseFrom: '2026-06-11',
    pauseText: 'In May 2026 Regional Council paused all new growth-related water and wastewater capital procurements from June 11, 2026, until upper levels of government commit funding. Planned dates are from the draft 2026 DC capital maps (March 2026) and may move.',
    pauseUrl: 'https://pub-peelregion.escribemeetings.com/filestream.ashx?DocumentId=45699',
    overrides: {},   // project or component number → 'scheduled' | 'paused' | 'unknown'
  };
  const CAPITAL_STATUS = { scheduled: 'Scheduled', paused: 'Paused', unknown: 'Status unknown' };
  // y: planned year; s: 'approved' (2026 budget) | 'proposed'; id: project / component number.
  const capitalStatus = (y, s, id) => {
    if (id && CAPITAL.overrides[id]) return CAPITAL.overrides[id];
    if (y != null && y < 2026) return 'scheduled';
    if (s === 'approved' || y === 2026) return 'unknown';
    return 'paused';
  };
  const capitalChip = (st) => `<span class="cap-st cap-st-${st}" title="${st === 'paused' ? 'Not yet tendered: new growth-related procurements are paused from June 11, 2026' : st === 'unknown' ? 'In the 2026 budget: paused if not tendered or awarded by June 11, 2026' : 'Going ahead'}">${CAPITAL_STATUS[st]}</span>`;
  const pauseNote = () => `<p class="pause-note small" role="note"><strong>Capital schedule as of ${CAPITAL.asOf}.</strong> ${CAPITAL.pauseText} <a href="${CAPITAL.pauseUrl}" target="_blank" rel="noopener">Council report</a></p>`;
  // Costs in one dollar year (2026$): the DC rate indexing since 2020 (StatCan construction price
  // index, as the by-law requires), taken at its average annual rate for other base years.
  const DOLLAR_YEAR = 2026;
  const toDollarYear = (v, fromYear, ix2020) => v * Math.pow(ix2020, (DOLLAR_YEAR - fromYear) / (DOLLAR_YEAR - 2020));
  // Basis chip on a capacity figure: where its numbers come from. 'mixed' names the parts.
  const BASIS = {
    design: ['Design', 'Peel design criteria (Modelling Demand Table v2.0, Aug 2024; Linear Wastewater Standards R1.0, Mar 2023)'],
    measured: ['2025 measured', 'The Region\u2019s 2025 annual reports (plant flows and capacities)'],
    mp2020: ['Master Plan 2020', 'The 2020 Water and Wastewater Master Plan (capacities, triggers, storage)'],
    mixed: ['Mixed basis', ''],
  };
  const basisChip = (kind, why = '') => { const b = BASIS[kind] || BASIS.mixed; const t = why || b[1]; return `<span class="basis-chip basis-${kind}" title="${t.replace(/"/g, '&quot;')}">${b[0]}</span>`; };
  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // Skeleton placeholder for loading states (styled in css/modes.css): grey
  // blocks shaped like the content, pulsing unless reduced motion is preferred.
  const skel = label => `<div class="skel-row" role="status" aria-label="${esc(label)}"><span class="skel tall" style="width:45%"></span><span class="skel"></span><span class="skel" style="width:70%"></span></div>`;
  const fmtDate = d => d ? d.toISOString().slice(0, 10) : '';
  const fmtNum = n => n == null ? '' : Number(n).toLocaleString('en-CA');

  // ---- Persistent per-viewer settings (source: app.js 27–34) --------------------
  // Best effort, with an in-memory Map fallback when localStorage is
  // unavailable (e.g. Node). Browser behaviour is unchanged.
  const store = (() => {
    const mem = new Map();
    const hasLS = (() => { try { return typeof localStorage !== 'undefined' && localStorage != null; } catch (e) { return false; } })();
    return {
      get(k, d) {
        if (!hasLS) return mem.has(k) ? mem.get(k) : d;
        try { const v = localStorage.getItem(`peel-dev:${k}`); return v == null ? d : JSON.parse(v); } catch (e) { return d; }
      },
      set(k, v) {
        if (!hasLS) { mem.set(k, v); return; }
        try { localStorage.setItem(`peel-dev:${k}`, JSON.stringify(v)); } catch (e) { /* storage unavailable */ }
      },
    };
  })();
  // Display: theme + density. The inline <head> script already set the theme
  // pre-paint; re-apply here with validation (garbage -> dark default) and set
  // the density (compact on desktop, comfortable on phones). Neither is part of
  // the share-link state: both stay in this browser only.

  // ---- Colours (source: app.js 119–152) -----------------------------------------
  // Every colour comes from the design tokens in css/app.css (:root). token(name)
  // resolves one to its computed value (cached per theme; readColors() drops the
  // cache when the theme changes). In HTML/SVG strings prefer `var(--token)` so
  // the browser resolves it live; use token() where a real value is needed
  // (canvas 2d, Leaflet options).
  let colors = {};
  // Live accessor: readColors() reassigns `colors`, so consumers must read it
  // through getColors() (or the `colors` getter on the api) — never a snapshot.
  function getColors() { return colors; }
  const _tokenCache = {};
  function token(name) {
    if (typeof document === 'undefined') return '';
    if (!(name in _tokenCache)) _tokenCache[name] = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return _tokenCache[name];
  }
  function readColors() {
    if (typeof document === 'undefined') return;
    const cs = getComputedStyle(document.documentElement);
    colors = Object.fromEntries(((window.PeelPhases || {}).ALL_PHASES).map(p => [p.key, cs.getPropertyValue(`--ph-${p.key}`).trim()]));
    for (const k in _tokenCache) delete _tokenCache[k];
  }
  // Phase colour for a phase key, read from its --ph-* token (theme-aware);
  // unknown phases fall back to the approved blue.
  function phaseColor(name) {
    return token(`--ph-${name}`) || token('--ph-approved');
  }
  function glyphColor(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return token('--swatch-paper');
    const n = parseInt(m[1], 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return L > 0.35 ? token('--swatch-ink') : token('--swatch-paper');
  }
  // Lazy window.PeelPhases access: util.js loads before js/phases.js, so this
  // must not be read at module top level — only at call time.
  function dot(phase, extra = '') {
    const p = (window.PeelPhases || {}).PHASE_BY_KEY[phase], c = phaseColor(phase);
    return `<span class="dot ${extra}" style="background:${c};color:${glyphColor(c)}" aria-hidden="true">${esc(p.short)}</span>`;
  }

  // ---- Number / unit formatting (source: app.js 1411–1417) ----------------------
  const fmt1 = n => n == null || !isFinite(n) ? '–' : n.toLocaleString('en-CA', { maximumFractionDigits: n < 10 ? 2 : n < 100 ? 1 : 0 });
  // Population rounding: whole people under 1,000, nearest 10 to 10,000, nearest 100 above.
  const roundPop = n => { const a = Math.abs(n); const k = a >= 10000 ? 100 : a >= 1000 ? 10 : 1; return Math.round(n / k) * k; };
  // Numbers with their unit beside them.
  const unit = (v, u) => `${v}<span class="u">${u}</span>`;
  const uML = v => unit(fmt1(v), 'ML/d'), uLs = v => unit(fmt1(v), 'L/s'), uPop = n => unit(fmtNum(roundPop(n)), 'pop');
  // Small systems: a plant rated under 5 ML/d (Inglewood WWTP, 243 m³/d) reads in m³/d, sits in its
  // own "Small systems" group and never sets a shared chart scale beside plants rated in hundreds of
  // ML/d. Its % figures are unchanged.
  const SMALL_SYSTEM_MLD = 5;
  const isSmallSystem = rated => rated > 0 && rated < SMALL_SYSTEM_MLD;
  const capTxt = (v, rated) => (isSmallSystem(rated) ? `${fmtNum(Math.round(v * 1000))} m³/d` : `${fmt1(v)} ML/d`);
  const uCap = (v, rated) => (isSmallSystem(rated) ? unit(fmtNum(Math.round(v * 1000)), 'm³/d') : uML(v));
  const uHa = n => unit(fmtNum(Math.round(n)), 'ha'), uDev = n => unit(fmtNum(n), n === 1 ? 'dev' : 'devs'), uUnits = n => unit(fmtNum(Math.round(n)), 'units');

  // ---- Headline helper (source: app.js 4682) ------------------------------------
  function hlP(html) { return `<p class="headline" data-hl="1">${html}</p>`; }

  // ---- Money formatting (source: app.js 9047) -----------------------------------
  const fmtMoney = v => v == null || !isFinite(v) ? '–' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)} M` : `$${fmtNum(Math.round(v))}`;

  // ---- Public API ----------------------------------------------------------------
  // One hover card for every map feature (SPEC §3, boards/MapControls): what it is, its name, the
  // one number that matters, then what a click does. Plain strings; html is trusted markup.
  //   hoverCard({ kind, name, value, sub, html, open = 'open its scope', also })
  function hoverCard(o) {
    const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    return `<div class="hcard">${o.kind ? `<span class="hc-k">${e(o.kind)}</span>` : ''}<strong class="hc-n">${e(o.name)}</strong>`
      + `${o.value != null && o.value !== '' ? `<div class="hc-v"><b>${e(o.value)}</b>${o.sub ? ` <span>${e(o.sub)}</span>` : ''}</div>` : o.sub ? `<div class="hc-v"><span>${e(o.sub)}</span></div>` : ''}`
      + `${o.html ? `<div class="hc-x">${o.html}</div>` : ''}<div class="hc-a">Click: ${e(o.open || 'open its scope')}${o.also ? ` · ${e(o.also)}` : ''}</div></div>`;
  }
  const api = {
    hoverCard,
    $, esc, fmtNum, fmtDate, skel, estTag, store,
    token, dot, readColors, phaseColor, glyphColor,
    get colors() { return colors; },
    getColors,
    fmt1, roundPop, unit, uML, uLs, uPop, uHa, uDev, uUnits, SMALL_SYSTEM_MLD, isSmallSystem, capTxt, uCap,
    hlP, fmtMoney,
    UNOFFICIAL, CSV_DISCLAIMER, CRITERIA_STAMP, DISCLAIMER_PROPS, PIPE_RESULTS, SCREEN_LINE, chartW, AREA_ONLY_NOTE, TRUNK_MM, pipeClass, PIPES_NOT_ASSESSED, SCREEN_NOTE, SCREEN_NOTE_SHORT, basisChip, isPublic, applyPublic, SCREEN,
    CAPITAL, CAPITAL_STATUS, capitalStatus, capitalChip, pauseNote, DOLLAR_YEAR, toDollarYear,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelUtil = api;
})(typeof window !== 'undefined' ? window : globalThis);
