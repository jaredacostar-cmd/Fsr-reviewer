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
  const CSV_DISCLAIMER = `# ${UNOFFICIAL}\n`;

  // ---- Tiny DOM / string / number helpers (source: app.js 17–24) ----------------
  const estTag = '<span class="est-tag">screening estimate</span>';
  // Individual-pipe modelling results (capacity, % full, freeboard, sewer profile, tightest pipes,
  // the pipe upgrade tool, the EPANET per-main table) are off for now: true brings them back.
  const PIPE_RESULTS = false;
  // Shown before every trace and servicing demand result: this is one screening method, and the
  // Region's hydraulic models stay the authority.
  const SCREEN_NOTE_SHORT = '<p class="screen-note screen-note-sm" role="note"><strong>Screening estimate, not a model result:</strong> the Region of Peel\u2019s water and wastewater models are the authority.</p>';
  const SCREEN_NOTE = '<p class="screen-note" role="note"><strong>Screening estimate, not a model result.</strong> One screening method from public data and Peel design criteria, not a hydraulic model. The Region of Peel\u2019s water and wastewater models are the authority: confirm servicing with the Region.</p>';
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
  const uHa = n => unit(fmtNum(Math.round(n)), 'ha'), uDev = n => unit(fmtNum(n), n === 1 ? 'dev' : 'devs'), uUnits = n => unit(fmtNum(Math.round(n)), 'units');

  // ---- Headline helper (source: app.js 4682) ------------------------------------
  function hlP(html) { return `<p class="headline" data-hl="1">${html}</p>`; }

  // ---- Money formatting (source: app.js 9047) -----------------------------------
  const fmtMoney = v => v == null || !isFinite(v) ? '–' : v >= 1e9 ? `$${(v / 1e9).toFixed(2)} B` : v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e8 ? 0 : 1)} M` : `$${fmtNum(Math.round(v))}`;

  // ---- Public API ----------------------------------------------------------------
  const api = {
    $, esc, fmtNum, fmtDate, skel, estTag, store,
    token, dot, readColors, phaseColor, glyphColor,
    get colors() { return colors; },
    getColors,
    fmt1, roundPop, unit, uML, uLs, uPop, uHa, uDev, uUnits,
    hlP, fmtMoney,
    UNOFFICIAL, CSV_DISCLAIMER, PIPE_RESULTS, SCREEN_NOTE, SCREEN_NOTE_SHORT,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelUtil = api;
})(typeof window !== 'undefined' ? window : globalThis);
