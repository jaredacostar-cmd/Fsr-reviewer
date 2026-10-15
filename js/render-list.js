(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc, fmtNum, fmtDate, dot, getColors } = window.PeelUtil;
  const P = window.PeelPhases;
  const map = window.PeelMapCore.map;
  const MM = () => window.PeelMapMarkers;
  const ML = () => window.PeelMapLabels;
  const SD = () => window.PeelSvcData;
  const Nav = () => window.PeelDevNav;
  const DevTab = () => window.PeelDevelopmentsTab;
  const FU = () => window.PeelFilterUI;
  const App = () => window.PeelApp;

  // ---- Rendering -----------------------------------------------------------------
  // Stage selector: one segment per phase with its label and count, sized by share.
  // A tap shows that phase only (again: all phases); Ctrl / ⌘-click adds or removes it.
  function renderPipeline(base) {
    const counts = Object.fromEntries(P.ALL_PHASES.map(p => [p.key, 0]));
    for (const p of base) counts[p.phase]++;
    const total = base.length;
    $('#total-count').textContent = `${fmtNum(App().state.filtered.length)} of ${fmtNum(App().state.projects.length)} developments`;
    // A slim bar shows the share of each phase; the rows under it carry the labels and counts
    // (segment labels clipped when a phase is a small share).
    const shown = P.ALL_PHASES.filter(p => counts[p.key]);
    const tip = p => `${esc(p.label)}: ${fmtNum(counts[p.key])} (${total ? Math.round(counts[p.key] / total * 100) : 0}%) — tap: only this phase; Ctrl/⌘-click: add or remove`;
    $('#pipeline').innerHTML =
      `<div class="pipe-bar" aria-hidden="true">${shown.map(p => `<i data-phase="${p.key}" class="${App().state.phases.has(p.key) ? '' : 'off'}" style="flex:${counts[p.key]};background:${getColors()[p.key]}" title="${tip(p)}"></i>`).join('')}</div>` +
      `<div class="pipe-rows">${shown.map(p => {
        const on = App().state.phases.has(p.key);
        return `<button type="button" data-phase="${p.key}" data-info="phase-${p.key}" class="${on ? '' : 'off'}" aria-pressed="${on}" title="${tip(p)}"><i class="sw" style="background:${getColors()[p.key]}"></i><span class="t">${esc(p.key === 'construction' ? 'Construction' : p.label)}</span><span class="n">${fmtNum(counts[p.key])}</span></button>`;
      }).join('')}</div>`;
    FU().renderFlagChips();
  }

  function renderMarkers() {
    MM().cluster.clearLayers();
    MM().heat.setData(MM().mstyle.show === 'heat' ? App().state.filtered.filter(p => p.lat != null && SD().devShown(p)).map(p => [p.lat, p.lng, MM().popOf(p)]) : null);
    if (MM().mstyle.show === 'heat') { MM().markerByKey = new Map(); ML().projectByMarker = new Map(); ML().scheduleLabels(); return; }
    MM().markerByKey = new Map();
    ML().projectByMarker = new Map();
    const markers = [];
    for (const p of App().state.filtered) {
      if (p.lat == null || !SD().devShown(p)) continue;
      const [cat, col] = MM().markerCat(p), pop = MM().mstyle.size === 'pop' ? MM().popOf(p) : 0;
      const m = L.marker([p.lat, p.lng], { icon: MM().markerIcon(p), phase: p.phase, cat, col, pop, keyboard: false, title: '', zIndexOffset: pop ? -Math.round(Math.sqrt(pop)) : 0 });
      const near = App().state.servicing && (SD().nearOf(p, 'dr') || SD().nearOf(p, 'pz'));
      m.bindTooltip(`<strong>${esc(p.title)}</strong><br>${esc(P.PHASE_BY_KEY[p.phase].label)} · ${esc(p.municipality)}${MM().mstyle.color === 'layer' ? `<br>${esc(MM().LAYER_NAME[cat])}` : MM().mstyle.color === 'quality' ? `<br>${esc(MM().QUALITY[cat][1])}` : MM().mstyle.color === 'timing' ? `<br>${esc(MM().TIMING[cat][1])}` : MM().mstyle.color === 'plant' ? `<br>→ ${esc(cat === 'none' ? 'no traced catchment' : SD().PLANT_SHORT[cat])}` : ''}${pop ? `<br>${fmtNum(Math.round(pop))} people + jobs at build-out` : ''}${near ? '<br><span class="muted">Outside the mapped areas: nearest assigned</span>' : ''}`, { className: 'pt', direction: 'top', offset: [0, -8] });
      m.on('click', () => Nav().showDetail(p));
      MM().markerByKey.set(p.key, m);
      ML().projectByMarker.set(m, p);
      markers.push(m);
    }
    MM().cluster.addLayers(markers);
    ML().scheduleLabels();
  }

  // The list shows the matching projects inside the current map view; it follows the map
  // as you pan and zoom. Phase 2: the list lives in the Developments analysis tab, 25 per page.
  const LIST_PAGE = 25;
  let listPage = 0;
  const SORTS = {
    recent: (a, b) => (b.last || 0) - (a.last || 0) || b.rank - a.rank,
    units: (a, b) => (b.units || 0) - (a.units || 0),
    left: (a, b) => ((b.buildout && b.buildout.remaining) || 0) - ((a.buildout && a.buildout.remaining) || 0) || (b.units || 0) - (a.units || 0),
    name: (a, b) => String(a.title).localeCompare(String(b.title), 'en', { numeric: true }),
  };
  // Page slice of a sorted list: the items for the page plus the page bookkeeping.
  const pageOf = (sorted, page, per) => {
    const pages = Math.max(1, Math.ceil(sorted.length / per));
    const p = Math.min(Math.max(0, page), pages - 1);
    return { items: sorted.slice(p * per, p * per + per), page: p, pages, start: p * per };
  };
  function renderList() {
    const bounds = map.getBounds();
    const inView = App().state.filtered.filter(p => p.lat != null && bounds.contains([p.lat, p.lng]));
    const sorted = inView.sort(SORTS[$('#list-sort').value] || SORTS.recent);
    const pg = pageOf(sorted, listPage, LIST_PAGE);
    listPage = pg.page;
    $('#list-count').textContent = `· ${fmtNum(inView.length)} of ${fmtNum(App().state.filtered.length)}`;
    $('#list-note').textContent = !inView.length ? (App().state.filtered.length ? 'No matching developments in this part of the map — zoom out or pan.' : 'No developments match the filters.')
      : pg.pages > 1 ? `Showing ${pg.start + 1}–${pg.start + pg.items.length} of ${fmtNum(sorted.length)} — page ${pg.page + 1} of ${pg.pages}.` : '';
    $('#project-list').innerHTML = pg.items.map((p, i) =>
      `<li><button type="button" data-i="${pg.start + i}">${dot(p.phase)}<span><span class="t">${esc(p.title)}</span>
        <span class="m">${esc(P.PHASE_BY_KEY[p.phase].label)}${window.PeelLayers && window.PeelLayerBar ? ` → ${window.PeelLayerBar.nameHTML(window.PeelLayers.layerOf(p))}` : ''} · ${esc(p.municipality)}${p.buildout ? ` · ${fmtNum(p.buildout.planned)} planned, ${fmtNum(P.unbuiltOf(p))} left to build` : p.units ? ` · ${fmtNum(p.units)} units` : ''}${p.last ? ` · ${fmtDate(p.last)}` : ''}</span></span></button></li>`).join('');
    $('#project-list').onclick = e => {
      const b = e.target.closest('button[data-i]'); if (!b) return;
      const p = sorted[+b.dataset.i];
      DevTab().focusProject(p);
    };
    const ind = $('#dev-page-ind'), pv = $('#dev-prev'), nx = $('#dev-next');
    if (ind) ind.textContent = pg.pages > 1 ? `Page ${pg.page + 1} of ${pg.pages}` : '';
    if (pv) pv.disabled = pg.page === 0;
    if (nx) nx.disabled = pg.page >= pg.pages - 1;
  }

  let listTimer;
  map.on('moveend', () => { clearTimeout(listTimer); listTimer = setTimeout(() => { listPage = 0; renderList(); }, 120); });
  $('#list-sort').onchange = () => { listPage = 0; renderList(); };

  const api = {
    renderPipeline, renderMarkers, renderList, LIST_PAGE, SORTS, pageOf,
    getListPage: () => listPage, setListPage: v => { listPage = v; },
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelRenderList = api;
})(typeof window !== 'undefined' ? window : globalThis);
