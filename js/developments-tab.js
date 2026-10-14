(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc } = window.PeelUtil;
  const Nav = () => window.PeelDevNav;
  const MM = () => window.PeelMapMarkers;
  const RL = () => window.PeelRenderList;
  const DT = () => window.PeelDataTab;
  const App = () => window.PeelApp;

  // ---- Developments analysis tab: the development list as a tab ---------------------------
  // Phase 2 moves the sidebar list into the analysis panel. The tab button and pane are created
  // here (guarded) so this works with the current #footer markup and with Worker 2's
  // <aside id="analysis"> markup. The .export-row stays in the sidebar (Worker 1 moves it).
  function ensureDevelopmentsTab() {
    if (document.getElementById('ftab-developments')) return;
    const strip = document.querySelector('.analysis-tabs') || document.querySelector('#footer .f-tabs');
    const tabs = strip && strip.querySelectorAll('.f-tab');
    if (!strip || !tabs.length) return;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'f-tab'; btn.id = 'ftab-developments';
    btn.setAttribute('role', 'tab');
    btn.dataset.tab = 'developments'; btn.dataset.atab = 'developments';
    btn.setAttribute('aria-controls', 'pane-developments');
    btn.setAttribute('aria-selected', 'false');
    btn.dataset.info = 'tab-developments';
    btn.textContent = 'Developments';
    tabs[tabs.length - 1].after(btn);
    const pane = document.createElement('section');
    pane.className = 'f-pane'; pane.id = 'pane-developments';
    pane.dataset.pane = 'developments';
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', 'ftab-developments');
    pane.hidden = true;
    // Move the sidebar list pieces in (the export row stays in the sidebar).
    const head = document.createElement('div'); head.className = 'dev-head';
    const h2 = document.querySelector('.list-panel h2');
    const sort = document.getElementById('list-sort');
    if (h2) head.appendChild(h2);
    if (sort) { const sw = document.createElement('div'); sw.className = 'dev-sort'; sw.appendChild(sort); head.appendChild(sw); }
    const ph = document.querySelector('.list-panel .panel-head');
    if (ph && !ph.children.length && !ph.textContent.trim()) ph.remove();   // emptied by the move
    pane.appendChild(head);
    const note = document.getElementById('list-note'); if (note) pane.appendChild(note);
    const list = document.getElementById('project-list'); if (list) pane.appendChild(list);
    const pages = document.createElement('div');
    pages.className = 'dev-pages'; pages.setAttribute('role', 'group'); pages.setAttribute('aria-label', 'Development list pages');
    pages.innerHTML = `<button type="button" class="btn small" id="dev-prev" aria-label="Previous page">‹ Prev</button><span class="muted small" id="dev-page-ind"></span><button type="button" class="btn small" id="dev-next" aria-label="Next page">Next ›</button>`;
    pane.appendChild(pages);
    const panesBox = document.querySelector('#analysis-panes');
    if (panesBox) panesBox.appendChild(pane);
    else {
      const box = strip.closest('footer, aside') || document.body;
      const panes = box.querySelectorAll('.f-pane');
      if (panes.length) panes[panes.length - 1].after(pane); else box.appendChild(pane);
    }
    pane.querySelector('#dev-prev').onclick = () => { RL().setListPage(RL().getListPage() - 1); RL().renderList(); };
    pane.querySelector('#dev-next').onclick = () => { RL().setListPage(RL().getListPage() + 1); RL().renderList(); };
  }

  function focusProject(p) {
    Nav().showDetail(p);
    if (p.lat == null) return;
    const m = MM().markerByKey.get(p.key);
    if (m) MM().cluster.zoomToShowLayer(m, () => m.openTooltip());
    else Nav().flyToSite(p, 17);
    if (innerWidth <= 760) DT().toggleSidebar(false);
  }

  function renderSources() {
    const ok = App().state.sources.filter(s => s.enabled && s.status === 'ok').length;
    const en = App().state.sources.filter(s => s.enabled).length;
    $('#sources-summary').textContent = App().state.snapshot
      ? `Weekly snapshot · ${App().state.snapshot.generatedAt.slice(0, 10)}${App().state.sources.some(s => s.live) ? ' + live' : ''}`
      : `${ok}/${en} loaded · live`;
    $('#source-list').innerHTML = App().state.sources.map((s, i) =>
      `<li><input type="checkbox" data-i="${i}" ${s.enabled ? 'checked' : ''} aria-label="Enable ${esc(s.name)}">
        <a class="name" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
        <button type="button" class="rm" data-rm="${i}" title="Remove source" aria-label="Remove ${esc(s.name)}">×</button>
        <span class="st ${s.status === 'error' ? 'err' : s.status === 'ok' ? 'ok' : ''}">${esc(s.kind === 'permit' ? 'Building permits' : 'Planning applications')}${s.msg ? ' · ' + esc(s.msg) : ''}</span></li>`).join('');
  }
  function setSourceStatus(src, status, msg) { src.status = status; src.msg = msg; renderSources(); }

  // Moved from the analysis-tabs section (old line 1334): the call lives in the
  // module that owns the function. Runs before analysis-tabs' showFootTab(footPref).
  ensureDevelopmentsTab();   // before showFootTab so a stored 'developments' tab restores
  const api = { ensureDevelopmentsTab, focusProject, renderSources, setSourceStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevelopmentsTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
