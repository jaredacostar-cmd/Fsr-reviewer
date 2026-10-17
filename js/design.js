/*
 * Design system: theme, density, icons, print.
 *
 * Pure functions (resolveTheme, densityDefault, basemapForView, icon) have no DOM
 * access and no dependencies: safe to require under `node --test` and to load in
 * the browser as a plain <script> (index.html loads this before js/app.js, which
 * reads the `window.PeelDesign` global).
 *
 * Grounding:
 * - Theme storage key `peel-dev:theme` matches the `peel-dev:<k>` convention of the
 *   store helper in js/app.js. Values: 'dark' (default), 'light', 'device'.
 *   css/app.css holds dark values on :root and light values on :root[data-theme="light"]
 *   (one copy: "Follow device" resolves to dark or light here, not in the stylesheet).
 *   A tiny inline <head> script in index.html mirrors resolveTheme so the theme
 *   applies before first paint (no dark/light flash); app.js re-applies it with
 *   validation for live changes.
 * - Density default: desktop (fine pointer) -> compact, phone (coarse pointer or
 *   narrow screen) -> comfortable; stored as `peel-dev:density`, applied as
 *   data-density on <html>, styled in css/modes.css.
 * - basemapForView mirrors the VIEW_PRESETS basemaps in js/map-analysis.js (single source
 *   of truth for which basemap each map view wants): 'auto' for all of them.
 * - Icons are outline style, stroke="currentColor", fixed 24x24 viewBox; no fills
 *   except small solid dots/cursors. No hard-coded colours (the tokens test
 *   forbids hex colours in js/).
 */
(function (root) {
  'use strict';

  // ---- Theme ---------------------------------------------------------------
  // stored: 'dark' | 'light' | 'device' | null/undefined/garbage. Returns the data-theme value
  // to set: always 'dark' or 'light', so the stylesheet holds one copy of each theme ('device'
  // follows the system setting, read here and in the inline head script).
  function resolveTheme(stored, prefersLight) {
    if (stored === 'light') return 'light';
    if (stored === 'device') return prefersLight ? 'light' : 'dark';
    return 'dark'; // 'dark', unset, or anything unrecognised: dark is the default.
  }
  const systemLight = () => typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: light)').matches;

  function applyTheme(stored) {
    if (typeof document === 'undefined') return resolveTheme(stored, false);
    var t = resolveTheme(stored, systemLight());
    document.documentElement.setAttribute('data-theme', t);
    return t;
  }

  // ---- Density ---------------------------------------------------------------
  // Desktop (fine pointer) defaults to compact; phones (coarse pointer, or a
  // narrow window when matchMedia is unavailable) default to comfortable.
  function densityDefault() {
    if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return 'comfortable';
    if (typeof innerWidth === 'number' && innerWidth <= 700) return 'comfortable';
    return 'compact';
  }

  function applyDensity(d) {
    var v = d === 'comfortable' ? 'comfortable' : 'compact';
    if (typeof document !== 'undefined') document.documentElement.setAttribute('data-density', v);
    return v;
  }

  // ---- Basemap per view ------------------------------------------------------
  // Every view: 'auto', the grey street map in the theme's shade while zoomed out (the stage and
  // capacity colours read on it) and the aerial with roads from street zoom (js/map-core.js).
  function basemapForView(view) {
    return 'auto';
  }

  // ---- Motion ------------------------------------------------------------------
  function prefersReducedMotion() {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // ---- Icons -------------------------------------------------------------------
  // Outline style, 24x24 viewBox, currentColor. Names: the four map views, the
  // development marker, and each map tool (tool keys as used in js/app.js
  // TOOL_ITEMS, 'select' for the unified area select and 'test-site' for the
  // what-if site test), plus 'export' and
  // 'settings' for the top bar.
  var ICONS = {
    planning: '<path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/>',
    water: '<path d="M12 3.5s6 6.3 6 10.6a6 6 0 0 1-12 0C6 9.8 12 3.5 12 3.5z"/>',
    wastewater: '<path d="M3 9.5h18v5H3z"/><path d="M6.5 9.5V7h11v2.5"/><path d="M6.5 14.5V17h11v-2.5"/>',
    dc: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9"/><path d="M9.8 10.2c0-1.2 1-2 2.2-2 1.5 0 2.4 1 2.4 2.1 0 2.8-4.8 1.7-4.8 4.4 0 1.1.9 2.1 2.4 2.1 1.2 0 2.2-.8 2.2-2"/>',
    development: '<path d="M5 21V5.5A1.5 1.5 0 0 1 6.5 4h7A1.5 1.5 0 0 1 15 5.5V21"/><path d="M15 10h3.5A1.5 1.5 0 0 1 20 11.5V21"/><path d="M3 21h18"/><path d="M8 8h4M8 12h4M8 16h4"/>',
    trace: '<path d="M4 5h6v5h4.5V15H19"/><path d="M16.2 12.3 19 15l-2.8 2.7"/><circle cx="4.5" cy="5" r="1.8"/>',
    lasso: '<rect x="3" y="3" width="14" height="14" rx="2" stroke-dasharray="4 3"/><path d="M12 11.5l7.5 3-3.2 1.2 2.7 2.7-1.4 1.4-2.7-2.7-1.2 3.2z" fill="currentColor" stroke="none"/>',
    select: '<path d="M5.5 3.8 18.8 11l-6.1 1.7-2.6 6z"/><path d="M11.6 13.4l5.9 5.9"/>',
    inspect: '<circle cx="10.5" cy="10.5" r="6.3"/><path d="M15.2 15.2l5.3 5.3"/><circle cx="10.5" cy="10.5" r="1.4" fill="currentColor" stroke="none"/>',
    corridor: '<path d="M6 4v16M18 4v16" stroke-dasharray="3.5 2.6"/><path d="M12 6.5v11M9.6 15.4 12 17.8l2.4-2.4"/>',
    unitsfit: '<path d="M3.5 20.5h17"/><rect x="5.5" y="12.5" width="4" height="8"/><rect x="11.5" y="8" width="4" height="12.5"/><rect x="17.5" y="4" width="3" height="16.5"/>',
    measure: '<path d="M3.5 17.5 17.5 3.5l3 3L6.5 20.5z"/><path d="M8 13l2 2M11 10l2 2M14 7l2 2"/>',
    whatif: '<path d="M12 21.5s7-7.4 7-12.3a7 7 0 0 0-14 0c0 4.9 7 12.3 7 12.3z"/><path d="M12 6.8v5.4M9.3 9.5h5.4"/>',
    tools: '<path d="M14.6 3.6a4.6 4.6 0 0 0-5.9 5.9L3.6 14.6a2 2 0 0 0 2.8 2.8l5.1-5.1a4.6 4.6 0 0 0 5.9-5.9l-2.7 2.7-2.4-.4-.4-2.4z"/><path d="M15.5 15.5l4.5 4.5"/>',
    tips: '<circle cx="12" cy="12" r="8.5"/><path d="M9.6 9.4a2.6 2.6 0 1 1 3.6 2.4c-.8.35-1.2.9-1.2 1.7v.7"/><circle cx="12" cy="16.8" r="1.1" fill="currentColor" stroke="none"/>',
    present: '<rect x="3" y="5" width="18" height="12" rx="2"/><path d="M10.5 8.7l4.5 2.8-4.5 2.8z"/><path d="M9 21h6"/>',
    play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="2.6"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>',
    restart: '<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M4.5 4.5v4h4"/>',
    export: '<path d="M12 3.5v11"/><path d="M7.8 10.5 12 14.7l4.2-4.2"/><path d="M4.5 16.5v3.2a1.3 1.3 0 0 0 1.3 1.3h12.4a1.3 1.3 0 0 0 1.3-1.3v-3.2"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 8.9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.08A1.7 1.7 0 0 0 10.12 3V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56.6.26 1.3.11 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.08c.26.6.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09c-.68 0-1.3.4-1.51 1.03z"/>',
  };
  var ALIAS = { 'test-site': 'whatif' };
  var ICON_NAMES = Object.keys(ICONS);

  function icon(name) {
    var key = ALIAS[name] || name;
    var body = ICONS[key] || ICONS.development;
    return '<svg class="mi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + body + '</svg>';
  }

  // ---- Print ---------------------------------------------------------------------
  // Reports stay light: temporarily force the light theme while printing, then
  // restore whatever the viewer had (including follow-device, i.e. no
  // attribute). onAfter lets the app drop its computed-colour cache.
  function initPrintHandlers(hooks) {
    if (typeof window === 'undefined' || !window.addEventListener) return;
    var h = hooks || {}, prev = null, had = false;
    window.addEventListener('beforeprint', function () {
      had = document.documentElement.hasAttribute('data-theme');
      prev = document.documentElement.getAttribute('data-theme');
      document.documentElement.setAttribute('data-theme', 'light');
      if (h.onBefore) h.onBefore();
    });
    window.addEventListener('afterprint', function () {
      if (had) document.documentElement.setAttribute('data-theme', prev);
      else document.documentElement.removeAttribute('data-theme');
      if (h.onAfter) h.onAfter();
    });
  }

  var api = {
    resolveTheme: resolveTheme,
    applyTheme: applyTheme,
    densityDefault: densityDefault,
    applyDensity: applyDensity,
    basemapForView: basemapForView,
    prefersReducedMotion: prefersReducedMotion,
    icon: icon,
    iconNames: ICON_NAMES,
    initPrintHandlers: initPrintHandlers,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDesign = api;
})(typeof window !== 'undefined' ? window : globalThis);
