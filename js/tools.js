/* Peel Growth Pipeline (unofficial) – Phase 3b tool framework.
 *
 * One tool active at a time; while a tool is active a banner describes what to
 * do ("Measuring · tap points · Esc to finish"); tool results open in the
 * analysis panel as a scope (trail: Peel › <title>), never as pop-up panels.
 *
 * Loaded before js/app.js. app.js owns the map, the tool rail and setTool();
 * it notifies this module via PeelTools.sync(mode) whenever the tool mode
 * changes, and routes map clicks for registered tool ids via
 * PeelTools.mapClick(id, latlng). Tool modules (js/tools-*.js) register
 * themselves with PeelTools.register() and reach app.js internals lazily
 * through window.PeelApp.
 *
 * Pure parts (registry bookkeeping) have no DOM access and are safe to require
 * under `node --test`; DOM touches go through the local $() helper so tests
 * can stub document.
 */
(function () {
  'use strict';

  const $ = s => (typeof document !== 'undefined' ? document.querySelector(s) : null);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const registry = {};   // id -> { title, icon, hint, onClick(latlng), onActivate(), onDeactivate(), onBannerAct(act, el), bannerHTML() }
  let activeId = null;
  let result = null;     // { title, reopen } while a tool result scope is open

  // The app.js bridge (installed at the end of js/app.js). Null until app.js runs.
  const H = () => (typeof window !== 'undefined' && window.PeelApp && window.PeelApp.scope) || null;

  function defaultBanner(d) {
    return `<strong>${esc(d.title)}</strong> <span class="muted">${esc(d.hint || 'tap the map')}</span> <span class="muted">· Esc to finish</span>`;
  }

  const PeelTools = {
    /** Register a tool. def: { title, icon, hint, onClick(latlng),
     *  onActivate(), onDeactivate(), onBannerAct(act, el, ev), bannerHTML() } */
    register(id, def) {
      if (!id || !def || !def.title) throw new Error('PeelTools.register: id and def.title are required');
      registry[id] = def;
      return def;
    },
    ids() { return Object.keys(registry); },
    def(id) { return registry[id] || null; },
    handles(id) { return !!registry[id]; },
    active() { return activeId; },

    /**
     * Called by app.js setTool() whenever the tool mode changes. Keeps exactly
     * one registered tool active and shows/hides the banner.
     */
    sync(mode) {
      const id = registry[mode] ? mode : null;
      if (activeId && activeId !== id) {
        const prev = registry[activeId];
        try { if (prev && typeof prev.onDeactivate === 'function') prev.onDeactivate(); } catch (e) { /* a tool's teardown must not break the rail */ }
      }
      activeId = id;
      if (id) {
        const d = registry[id];
        this.banner(d.bannerHTML ? d.bannerHTML() : defaultBanner(d));
        try { if (typeof d.onActivate === 'function') d.onActivate(); } catch (e) { /* keep the tool usable without its extras */ }
      } else {
        this.banner(null);
      }
      return activeId;
    },

    /** Route a map click to the active registered tool. */
    mapClick(id, latlng) {
      const d = registry[id];
      if (d && typeof d.onClick === 'function') {
        try { d.onClick(latlng); } catch (e) { /* a tool error must not break the map */ }
        return true;
      }
      return false;
    },

    /** Show the active-tool banner (html), or hide it when html is null. */
    banner(html) {
      const b = $('#tool-banner');
      if (!b) return;
      if (html == null) { b.hidden = true; b.innerHTML = ''; return; }
      b.innerHTML = html;
      b.hidden = false;
    },

    /** Esc: end the active tool. Returns true when it did something. */
    escape() {
      if (!activeId) return false;
      const h = H();
      if (h && typeof h.setTool === 'function') h.setTool(null);
      else this.sync(null);
      return true;
    },

    /**
     * Open a tool result as a scope in the analysis panel: the Tool result tab
     * appears and is selected, and the trail gains a "Peel › <title>" crumb
     * (via the renderTrail hook in app.js). opts: { title, html, reopen }.
     */
    openResult(opts) {
      const o = opts || {};
      result = { title: o.title || 'Tool result', reopen: typeof o.reopen === 'function' ? o.reopen : null };
      const t = $('#tool-title'); if (t) t.textContent = result.title;
      // Servicing results (batch, fit, inquiry, traces) open with the screening note.
      const body = $('#pane-tool-body'); if (body) body.innerHTML = (o.screen && window.PeelUtil ? window.PeelUtil.SCREEN_NOTE : '') + (o.html || '');
      const tab = $('#ftab-tool'); if (tab) tab.hidden = false;
      const h = H();
      if (h && typeof h.showFootTab === 'function') h.showFootTab('tool');
      if (h && typeof h.renderTrail === 'function') h.renderTrail();
      const x = $('#tool-close');
      if (x && !x._ptWired) { x._ptWired = true; x.addEventListener('click', () => PeelTools.closeResult()); }
      return result;
    },

    /** Close the tool result scope and return to the overview. */
    closeResult() {
      if (!result) return false;
      result = null;
      const tab = $('#ftab-tool'); if (tab) tab.hidden = true;
      const pane = $('#pane-tool'); if (pane) pane.hidden = true;
      const h = H();
      if (h && typeof h.showFootTab === 'function') h.showFootTab('overview');
      if (h && typeof h.renderTrail === 'function') h.renderTrail();
      return true;
    },

    /** Re-select the tool result tab (used by the trail crumb). */
    reopenResult() {
      if (!result) return false;
      if (result.reopen) { try { result.reopen(); } catch (e) { /* fall through to tab select */ } }
      const h = H();
      if (h && typeof h.showFootTab === 'function') h.showFootTab('tool');
      return true;
    },

    /** Trail crumb consumed by the renderTrail hook in app.js. */
    trailCrumb() {
      if (!result) return null;
      return { label: result.title, title: 'Tool result — reopen it', go: () => PeelTools.reopenResult() };
    },

    hasResult() { return !!result; },
    resultTitle() { return result ? result.title : null; },
  };

  // Banner action buttons ([data-ptool-act]) route to the active tool.
  function wireBanner() {
    const b = $('#tool-banner');
    if (!b || b._ptWired) return;
    b._ptWired = true;
    b.addEventListener('click', e => {
      const a = e.target && e.target.closest ? e.target.closest('[data-ptool-act]') : null;
      if (!a || !activeId) return;
      const d = registry[activeId];
      if (d && typeof d.onBannerAct === 'function') {
        try { d.onBannerAct(a.getAttribute('data-ptool-act'), a, e); } catch (err) { /* banner actions must not break the map */ }
      }
    });
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wireBanner);
    else wireBanner();
  }

  if (typeof window !== 'undefined') window.PeelTools = PeelTools;
  // Export for node-based tests without a DOM.
  if (typeof module !== 'undefined' && module.exports) module.exports = PeelTools;
})();
