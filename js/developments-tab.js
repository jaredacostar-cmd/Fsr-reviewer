(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc } = window.PeelUtil;
  const Nav = () => window.PeelDevNav;
  const MM = () => window.PeelMapMarkers;
  const RL = () => window.PeelRenderList;
  const DT = () => window.PeelDataTab;
  const App = () => window.PeelApp;

  // ---- The In view list stays in the left panel (SPEC §4: left panel = find) ----------------------
  // It was moved into a right-hand "Developments" tab (Phase 2 shell); SPEC §5 drops that tab, so the
  // list keeps its place under the filters and only gains its pager here.
  function ensureDevelopmentsTab() {
    if (document.getElementById('dev-pages')) return;
    const panel = document.querySelector('.list-panel'); if (!panel) return;
    const pages = document.createElement('div');
    pages.className = 'dev-pages'; pages.id = 'dev-pages'; pages.setAttribute('role', 'group'); pages.setAttribute('aria-label', 'Development list pages');
    pages.innerHTML = `<button type="button" class="btn small" id="dev-prev" aria-label="Previous page">‹ Prev</button><span class="muted small" id="dev-page-ind"></span><button type="button" class="btn small" id="dev-next" aria-label="Next page">Next ›</button>`;
    panel.appendChild(pages);
    pages.querySelector('#dev-prev').onclick = () => { RL().setListPage(RL().getListPage() - 1); RL().renderList(); };
    pages.querySelector('#dev-next').onclick = () => { RL().setListPage(RL().getListPage() + 1); RL().renderList(); };
  }

  function focusProject(p) {
    Nav().showDetail(p);
    if (p.lat == null) return;
    const m = MM().markerByKey.get(p.key);
    if (m) MM().cluster.zoomToShowLayer(m, () => m.openTooltip());
    else Nav().flyToSite(p, 17);
    if (innerWidth <= 700) DT().toggleSidebar(false);
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
  ensureDevelopmentsTab();
  const api = { ensureDevelopmentsTab, focusProject, renderSources, setSourceStatus };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevelopmentsTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
