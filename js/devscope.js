/* Peel Growth Pipeline (unofficial) – development scope.
 *
 * Phase 3: opening a development sets the *scope* — every analysis tab shows that
 * site — instead of opening the #detail side panel. Loaded before js/app.js; app.js
 * calls DevScope.open/current/close (from showDetail, renderTrail, trailGoPeel and
 * closeDetail), and DevScope reaches app.js internals lazily through the
 * window.PeelApp.scope bridge that app.js installs. Worker B owns js/devtab.js
 * (DevTab.render), called defensively from open().
 * The header (its tools, ⋯, ☆ Watch and flags) is every panel's (js/panel.js siteHead,
 * navigation phase 5: the site bar went); this module works out its flags once per open
 * and refresh, and again when the data they read has come in (flagsFor), and runs the
 * ⋯ menu's Record allocation, Compare and Export.
 */
(function () {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // The app.js bridge (installed at the end of js/app.js). Null until app.js runs.
  const H = () => (window.PeelApp && window.PeelApp.scope) || null;

  const DevScope = {
    _current: null,
    _prevTab: null,
    _layersWasOpen: null,
    _traceToken: 0,
    _wired: false,
    _flags: null,     // { key, inputs, html }: the open development's header flags (flagsFor)

    /** The scoped development, or null when no scope is open. */
    current() { return this._current; },

    /** Open (or re-render) the scope for a development. */
    open(p) {
      if (!p) return null;
      const h = H();
      const fresh = this._current !== p;
      if (fresh) {
        // Remember the tab to return to when the scope closes.
        const sel = document.querySelector('.f-tab[aria-selected="true"]');
        this._prevTab = (sel && sel.dataset.tab) || 'overview';
        if (this._prevTab === 'dev') this._prevTab = 'overview';
      }
      this._current = p;
      // A development replaces a result scope (a file, a pipe, a DC work): one scope at a time (SPEC §3).
      const SS = window.PeelSvcScope;
      if (SS && SS.isResultRef && SS.isResultRef(window.PeelApp && window.PeelApp.state.ss)) SS.clear();
      if (h) {
        h.setProject(p);      // keep app.js's module-level currentProject in sync
        h.setDaContext(p);
        h.ensureCouncil();
        h.highlight(p);       // site outline on the map (focus layer)
        // On a phone the sheet opens at its peek (the site's summary line and the tabs), so the site
        // stays in sight above it; a drag or a tap on the grip opens the panel.
        if (typeof innerWidth === 'number' && innerWidth <= 700 && window.PeelApp && window.PeelApp.setAnalysisSnap) window.PeelApp.setAnalysisSnap('peek', false);
        h.flyToSite(p);
      }
      this._wire();
      this._flags = null; this.flagsFor(p);   // (before the panels are built: their headers read it)
      this.renderTrail();
      if (h && h.writeLink) h.writeLink();
      // Its Overview first (the development's views live in the five tabs).
      if (h) h.showFootTab('dev');
      // Worker B's tab body (defensive: devtab.js may not have loaded yet).
      try { if (window.DevTab && typeof window.DevTab.render === 'function') window.DevTab.render(); } catch (e) { /* keep the scope open without the tab body */ }
      // Map treatment: fold the Layers panel. The sewer path is drawn only on request (the header's
      // Trace sewer): tracing on open zoomed the map out to the whole route.
      this._foldLayers();
      this._traceToken++;
      return p;
    },

    /** Clear the scope and put the UI back the way it was. */
    close() {
      const p = this._current;
      if (!p) return;
      this._current = null;
      this._traceToken++;
      const h = H();
      if (h) {
        h.setProject(null);
        h.setDaContext(null);
        h.highlight(null);
        if (typeof h.traceKey === 'function' && h.traceKey() === p.key) h.clearTrace();
      }
      this._unfoldLayers();
      this._flags = null;
      // Back to the tab open before the development.
      if (h) h.showFootTab(this._prevTab && this._prevTab !== 'dev' ? this._prevTab : 'overview');
      if (h && h.writeLink) h.writeLink();
      this._prevTab = null;
      this.renderTrail();
    },

    renderTrail() {
      const h = H();
      if (h) h.renderTrail();
    },

    /**
     * Re-render the scope UI after background data arrives (council items,
     * servicing model, sewer data). No map movement, no tab switching —
     * the scope stays exactly where the user left it.
     */
    refresh() {
      const p = this._current; if (!p) return;
      const h = H();
      this._flags = null; this.flagsFor(p);
      this.renderTrail();
      try { if (window.DevTab && typeof window.DevTab.render === 'function') window.DevTab.render(); } catch (e) { /* keep the scope open without the tab body */ }
      if (h && typeof h.renderScopeTab === 'function') h.renderScopeTab();
      if (h && h.writeLink) h.writeLink();
    },

    // ---- The header's flags and its ⋯ menu ------------------------------------
    /**
     * The flags in a development's header (js/panel.js siteHead, on every tab and its page): stalled,
     * under appeal, needs a planned main, a station or plant over its limit, data quality, links to
     * check. Worked out for the open development only ('' for any other), once per open and refresh, and
     * again when what they read has come in since (the servicing model, the DC data, the council items):
     * a panel built before the DC program loaded gets "Needs planned main" when it is shown (syncTools).
     */
    flagsFor(p) {
      const h = H();
      if (!p || !h || !this._current || p.key !== this._current.key) return '';
      const S = window.PeelApp && window.PeelApp.state, inputs = S ? [S.svcModel, S.dcInfra, S.council] : [];
      const c = this._flags;
      if (c && c.key === p.key && c.inputs.length === inputs.length && c.inputs.every((x, i) => x === inputs[i])) return c.html;
      const st = h.statusOf(p), f = h.svcFacts(p);
      if (st) st.works = h.devWorks(p, f);   // devFlags reads st.works.gap (relies on DC works not yet built)
      const flags = st ? (h.devFlags(p, st, f) || []) : [];
      const q = h.qualityOf ? h.qualityOf(p) : 'ok';
      if (q && q !== 'ok' && h.QUALITY && h.QUALITY[q]) {
        const [col, txt] = h.QUALITY[q];
        flags.push(`<button type="button" class="chip chip-link" data-at="records:files" title="Data quality: the files and how the homes were counted, in Records"><span class="q-dot" style="background:${col}" aria-hidden="true"></span>${esc(txt)} <span class="aer-car" aria-hidden="true">▸</span></button>`);
      }
      this._flags = { key: p.key, inputs, html: flags.join('') };
      return this._flags.html;
    },
    // The header's ⋯ menu (every tab's and the page's copy): one document listener, wired once.
    _wire() {
      if (this._wired || typeof document === 'undefined' || !document.addEventListener) return;
      this._wired = true;
      document.addEventListener('click', e => {
        if (!e.target || !e.target.closest) return;
        const al = e.target.closest('[data-scope-alloc]');
        if (al) { const h = H(); if (h && h.showAllocSub) h.showAllocSub(); return; }
        // Phase 3b: the open development as a CSV row, or handed to the Compare tool (sibling modules;
        // guarded — the buttons are inert until they load).
        const ex = e.target.closest('[data-scope-export]');
        if (ex) { const p = DevScope.current(); if (p && window.PeelExports) window.PeelExports.exportDevsCSV([p], `peel-${String(p.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv`); return; }
        const cmp = e.target.closest('[data-scope-compare]');
        if (cmp) { const p = DevScope.current(); if (p && window.PeelToolCompare) window.PeelToolCompare.addDevelopment(p); }
      });
    },

    // ---- Map treatment -------------------------------------------------------
    _foldLayers() {
      const panel = document.querySelector('.map-opts .mo-panel');
      if (!panel) return;
      if (this._layersWasOpen == null) this._layersWasOpen = panel.open;
      panel.open = false;
    },
    _unfoldLayers() {
      const panel = document.querySelector('.map-opts .mo-panel');
      if (panel && this._layersWasOpen != null) panel.open = this._layersWasOpen;
      this._layersWasOpen = null;
    },
  };

  if (typeof window !== 'undefined') window.DevScope = DevScope;
  // Export for node-based tests without a DOM.
  if (typeof module !== 'undefined' && module.exports) module.exports = DevScope;
})();
