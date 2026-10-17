/* Peel Growth Pipeline (unofficial) – development scope.
 *
 * Phase 3: opening a development sets the *scope* — every analysis tab shows that
 * site — instead of opening the #detail side panel. Loaded before js/app.js; app.js
 * calls DevScope.open/current/close (from showDetail, renderTrail, trailGoPeel and
 * closeDetail), and DevScope reaches app.js internals lazily through the
 * window.PeelApp.scope bridge that app.js installs. Worker B owns js/devtab.js
 * (DevTab.render), called defensively from open().
 */
(function () {
  'use strict';

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const PH = () => window.PeelPhases;
  // The app.js bridge (installed at the end of js/app.js). Null until app.js runs.
  const H = () => (window.PeelApp && window.PeelApp.scope) || null;

  const DevScope = {
    _current: null,
    _prevTab: null,
    _layersWasOpen: null,
    _traceToken: 0,
    _wired: false,

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
      this.renderSiteBar();
      this.renderTrail();
      if (h && h.writeLink) h.writeLink();
      // Show + select the Development tab.
      const tab = $('#ftab-dev');
      if (tab) tab.hidden = false;
      if (h) h.showFootTab('dev');
      // Worker B's tab body (defensive: devtab.js may not have loaded yet).
      try { if (window.DevTab && typeof window.DevTab.render === 'function') window.DevTab.render(); } catch (e) { /* keep the scope open without the tab body */ }
      // Map treatment: fold the Layers panel. The sewer path is drawn only on request (the site
      // bar's Trace sewer): tracing on open zoomed the map out to the whole route.
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
      // Hide the Development tab + pane and the site bar; back to the previous tab.
      const tab = $('#ftab-dev');
      if (tab) tab.hidden = true;
      const pane = $('#pane-dev');
      if (pane) pane.hidden = true;
      const bar = $('#site-bar');
      if (bar) { bar.hidden = true; bar.innerHTML = ''; }
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
      this.renderSiteBar();
      this.renderTrail();
      try { if (window.DevTab && typeof window.DevTab.render === 'function') window.DevTab.render(); } catch (e) { /* keep the scope open without the tab body */ }
      if (h && typeof h.renderScopeTab === 'function') h.renderScopeTab();
      if (h && h.writeLink) h.writeLink();
    },

    // ---- Site bar -----------------------------------------------------------
    _wire() {
      if (this._wired) return;
      const bar = $('#site-bar');
      if (!bar) return;
      this._wired = true;
      bar.addEventListener('click', e => {
        // A pick in the Tools menu folds it (its action still runs).
        const mi = e.target.closest('.site-more [role="menuitem"]'), md = mi && mi.closest('details');
        if (md) setTimeout(() => { md.open = false; }, 0);
        if (e.target.closest('[data-scope-close]')) { DevScope.close(); return; }
        const al = e.target.closest('[data-scope-alloc]');
        if (al) { const h = H(); if (h && h.showAllocSub) h.showAllocSub(); return; }
        const fsr = e.target.closest('[data-scope-fsr]');
        if (fsr) {
          // Phase 7: the FSR cross-check panel (sibling module; guarded — the button
          // only toggles the stub container until that module loads).
          if (window.PeelFsrCheck && typeof window.PeelFsrCheck.toggleFor === 'function') { window.PeelFsrCheck.toggleFor(DevScope.current(), fsr); return; }
          const note = bar.querySelector('.site-bar-fsr');
          if (note) { note.hidden = !note.hidden; fsr.setAttribute('aria-expanded', String(!note.hidden)); }
          return;
        }
        // Phase 3b: hand the open development to the Compare tool (sibling module;
        // guarded — the button is inert until that module loads).
        const ex = e.target.closest('[data-scope-export]');
        if (ex) { const p = DevScope.current(); if (p && window.PeelExports) window.PeelExports.exportDevsCSV([p], `peel-${String(p.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.csv`); return; }
        const cmp = e.target.closest('[data-scope-compare]');
        if (cmp) { const p = DevScope.current(); if (p && window.PeelToolCompare) window.PeelToolCompare.addDevelopment(p); return; }
      });
    },

    renderSiteBar() {
      const p = this._current, bar = $('#site-bar');
      if (!bar || !p) return;
      const h = H();
      const fmt = (h && h.fmt) || {};
      const F = {
        esc, dot: fmt.dot || (() => ''), fmtNum: fmt.fmtNum || (n => n == null ? '' : String(n)),
        uUnits: fmt.uUnits || (n => `${n} units`), uPop: fmt.uPop || (n => `${n} pop`), uLs: fmt.uLs || (v => `${v} L/s`),
      };
      const ph = (PH() && PH().PHASE_BY_KEY && PH().PHASE_BY_KEY[p.phase]) || null;
      const st = h ? h.statusOf(p) : null;
      const f = h ? h.svcFacts(p) : null;
      const w = h ? h.devWorks(p, f) : null;
      if (st) st.works = w; // devFlags reads st.works.gap (relies on DC works not yet built)
      const e = f ? f.e : (h ? h.estimate(p) : null);
      const PLANT_SHORT = (h && h.PLANT_SHORT) || {};

      // Facts line: units · people · water max day · wastewater peak wet.
      const facts = [];
      if (e) {
        if (e.totalUnits > 0) facts.push(F.uUnits(e.totalUnits));
        if (e.population > 0) facts.push(F.uPop(e.population));
        if (f && f.cb) {
          facts.push(`${F.uLs(f.cb.water.maxDay)} max day`);
          facts.push(`${F.uLs(f.cb.wastewater.wetPeak)} peak wet`);
        }
      }
      // Zone → plant.
      let svcLine = '';
      if (f) {
        const zone = f.z ? esc(f.z.name.replace('Pressure zone ', 'Zone ')) + (f.zNear ? ' <span class="est">nearest</span>' : '')
          : '<span class="muted">no pressure zone</span>';
        const plant = f.pl ? `→ ${esc(PLANT_SHORT[f.pl] || f.pl)}` + (f.dNear ? ' <span class="est">nearest catchment</span>' : '')
          : '→ <span class="muted">no traced catchment</span>';
        svcLine = `${zone} ${plant}`;
      } else {
        svcLine = '<span class="muted">No servicing figures: no units or jobs stated, or servicing not loaded.</span>';
      }
      // Warning flags, only when they apply (existing computations).
      const flags = h ? (h.devFlags(p, st, f) || []) : [];
      const q = h ? h.qualityOf(p) : 'ok';
      if (q && q !== 'ok' && h.QUALITY && h.QUALITY[q]) {
        const [col, txt] = h.QUALITY[q];
        flags.push(`<button type="button" class="chip chip-link" data-at="records:files" title="Data quality: the files and how the homes were counted, in Records › Files"><span class="q-dot" style="background:${col}" aria-hidden="true"></span>${esc(txt)} <span class="aer-car" aria-hidden="true">▸</span></button>`);
      }

      const watched = h ? !!h.isWatched(p.key) : false;
      // Stage 3: the panel header carries the name, stage, × and identity; the bar keeps the tools.
      if (bar.classList) bar.classList.toggle('pnl-tools', !!window.PeelPanel);
      bar.innerHTML = `
        <div class="site-bar-top">
          <div class="site-bar-id">
            <h2>${esc(p.title || 'Development')}</h2>
            <div class="site-bar-meta"><span class="muted">${esc(p.municipality || '')}</span></div>
          </div>
          ${window.PeelLayerBar ? window.PeelLayerBar.siteBadgeHTML(p) : `<span class="badge">${F.dot(p.phase)}${esc(ph ? ph.label : p.phase)}</span>`}
          <button type="button" class="btn small site-bar-x" data-scope-close aria-label="Close the development scope">×</button>
        </div>
        ${(window.PeelUtil || {}).SCREEN_NOTE_SHORT || ''}
        <div class="site-bar-facts">${facts.length ? facts.join(' <span class="sep" aria-hidden="true">·</span> ') : '<span class="muted">No demand figures</span>'}</div>
        <div class="site-bar-svc">${svcLine}</div>
        ${flags.length ? `<div class="chips site-bar-flags">${flags.join('')}</div>` : ''}
        <div class="site-bar-actions">
          <details class="site-more site-tools"><summary class="btn small" aria-label="Site tools: trace, check the FSR, memo, allocation, compare, export">Tools ▾</summary>
            <div class="site-more-menu" role="menu">
              <button type="button" role="menuitem" class="btn small link" data-trace="${esc(p.key)}" title="Trace the sewer path to the plant on the map">Trace sewer</button>
              <button type="button" role="menuitem" class="btn small link" data-wtrace="${esc(p.key)}" title="Trace the water supply route from the plant on the map">Trace water</button>
              <button type="button" role="menuitem" class="btn small link" data-scope-fsr aria-expanded="false" title="Cross-check the consultant's FSR figures">Check FSR</button>
              <hr>
              <button type="button" role="menuitem" class="btn small link" data-memo title="One-page servicing memo to print or save as PDF">Servicing memo</button>
              <button type="button" role="menuitem" class="btn small link" data-scope-alloc title="Record a servicing allocation for this development">Record allocation</button>
              <button type="button" role="menuitem" class="btn small link" data-scope-compare title="Add this development to the comparison (Compare tool)">Compare</button>
              <button type="button" role="menuitem" class="btn small link" data-scope-export title="This development's row (phase, units, layer, demand) as a CSV">Export (CSV)</button>
            </div></details>
          <button type="button" class="watch-btn${watched ? ' on' : ''}" data-watch="${esc(p.key)}" aria-pressed="${watched}" title="${watched ? 'Remove from your watchlist' : 'Add to your watchlist (This week, Watched)'}">${watched ? '★ Watching' : '☆ Watch'}</button>
        </div>
        <div class="site-bar-fsr" id="site-bar-fsr" hidden></div>`;
      bar.hidden = false;
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
