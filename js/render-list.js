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
  // Stage (SPEC §4): a stacked bar and the five active phases as toggles. Completed and withdrawn /
  // refused each get their own button (a tap adds or removes it; when off it says "hidden" so its
  // count never reads as a mismatch with the header). Completed is on by default and says how many
  // finished after census day (the Built layer: on the system but not in the 2021 Census).
  const DONE = ['completed', 'cancelled'];
  const DONE_LABEL = { completed: 'Completed', cancelled: 'Withdrawn / refused' };
  function renderPipeline(base) {
    const counts = Object.fromEntries(P.ALL_PHASES.map(p => [p.key, 0]));
    for (const p of base) counts[p.phase]++;
    renderLayerChips(base);
    const total = base.length;
    $('#total-count').textContent = `${fmtNum(App().state.filtered.length)} of ${fmtNum(App().state.projects.length)} developments`;
    // A slim bar shows the share of each phase; the rows under it carry the labels and counts
    // (segment labels clipped when a phase is a small share).
    const shown = P.ALL_PHASES.filter(p => counts[p.key]), rows = shown.filter(p => !DONE.includes(p.key));
    const sinceCensus = base.filter(p => p.phase === 'completed' && App().layerOf(p) === 'built').length;
    const censusYear = ((window.PeelLayers && window.PeelLayers.CENSUS_DATE) || '2021').slice(0, 4);
    const doneBtn = k => {
      if (!counts[k]) return '';
      const on = App().state.phases.has(k);
      const sub = k === 'completed' ? `<span class="pr-sub">${fmtNum(sinceCensus)} since the ${censusYear} census</span>` : '';
      const title = k === 'completed' ? `Completed: ${fmtNum(counts.completed)} — ${fmtNum(sinceCensus)} after census day (Built: on the system, not in the ${censusYear} Census), ${fmtNum(counts.completed - sinceCensus)} before (Existing)` : `Withdrawn or refused: ${fmtNum(counts.cancelled)}`;
      return `<button type="button" data-done="${k}" data-info="phase-${k}" class="done-row${on ? '' : ' off'}" aria-pressed="${on}" title="${esc(title)} — ${on ? 'shown, tap to hide' : 'hidden, tap to show'}"><i class="sw" style="background:${getColors()[k]}"></i><span class="t">${esc(DONE_LABEL[k])}${sub}</span><span class="n">${fmtNum(counts[k])}${on ? '' : ' hidden'}</span></button>`;
    };
    const tip = p => `${esc(p.label)}: ${fmtNum(counts[p.key])} (${total ? Math.round(counts[p.key] / total * 100) : 0}%) — tap: only this phase; Ctrl/⌘-click: add or remove`;
    $('#pipeline').innerHTML =
      `<div class="pipe-bar" aria-hidden="true">${shown.map(p => `<i data-phase="${p.key}" class="${App().state.phases.has(p.key) ? '' : 'off'}" style="flex:${counts[p.key]};background:${getColors()[p.key]}" title="${tip(p)}"></i>`).join('')}</div>` +
      `<div class="pipe-rows">${rows.map(p => {
        const on = App().state.phases.has(p.key);
        return `<button type="button" data-phase="${p.key}" data-info="phase-${p.key}" class="${on ? '' : 'off'}" aria-pressed="${on}" title="${tip(p)}"><i class="sw" style="background:${getColors()[p.key]}"></i><span class="t">${esc(p.key === 'construction' ? 'Construction' : p.label)}</span><span class="n">${fmtNum(counts[p.key])}</span></button>`;
      }).join('')}${DONE.map(doneBtn).join('')}</div>`;
    FU().renderFlagChips();
  }

  // "Counts as" (SPEC §4): layer chips with their counts (by the phase mapping, js/layers.js), a
  // filter like the stage; the counts are over the same base as the stage (every phase).
  const LY = ['built', 'committed', 'proposed', 'anticipated', 'existing'];
  function renderLayerChips(base) {
    const el = $('#f-layers'); if (!el || !window.PeelLayers) return;
    const n = {}; for (const p of base) { const l = App().layerOf(p); if (l) n[l] = (n[l] || 0) + 1; }
    const sel = App().state.lyr, LB = window.PeelLayerBar;
    el.innerHTML = LY.filter(k => n[k]).map(k => {
      const on = !sel || sel.has(k), hidden = !App().state.filtered.some(p => App().layerOf(p) === k) && on;
      return `<button type="button" class="chip${sel && sel.has(k) ? ' on' : ''}" data-ly="${k}" aria-pressed="${!!(sel && sel.has(k))}" title="${esc(window.PeelLayers.NOTE[k])}"><span class="ly-sw ly-${k}"></span>${esc(LB ? LB.LABEL[k] : k)} ${fmtNum(n[k])}${hidden ? ' <span class="muted">· hidden by stage</span>' : ''}</button>`;
    }).join('');
  }
  $('#f-layers').addEventListener('click', e => {
    const b = e.target.closest('[data-ly]'); if (!b) return;
    const next = new Set(App().state.lyr || []);
    if (next.has(b.dataset.ly)) next.delete(b.dataset.ly); else next.add(b.dataset.ly);
    App().state.lyr = next.size ? next : null;
    App().applyFilters();
  });
  $('#pipeline').addEventListener('click', e => {
    const b = e.target.closest('[data-done]'); if (!b) return;
    const k = b.dataset.done, next = new Set(App().state.phases);
    if (next.has(k)) next.delete(k); else next.add(k);
    App().state.phases = next.size ? next : new Set(App().DEFAULT_PHASES());
    App().applyFilters();
  });

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
      m.bindTooltip(() => window.PeelUtil.hoverCard({ kind: `Development · ${P.PHASE_BY_KEY[p.phase].label}${window.PeelLayers ? ` → ${window.PeelLayers.LABEL[window.PeelLayers.layerOf(p)] || 'none'}` : ''}`, name: p.title,
        value: pop ? fmtNum(Math.round(pop)) : p.units > 0 ? fmtNum(p.units) : null, sub: pop ? 'people + jobs at build-out' : p.units > 0 ? `units · ${p.municipality}` : p.municipality,
        html: `${MM().mstyle.color === 'quality' ? esc(MM().QUALITY[cat][1]) : MM().mstyle.color === 'timing' ? esc(MM().TIMING[cat][1]) : MM().mstyle.color === 'plant' ? `→ ${esc(cat === 'none' ? 'no traced catchment' : SD().PLANT_SHORT[cat])}` : ''}${near ? '<span class="muted">Outside the mapped areas: nearest assigned</span>' : ''}`,
        open: 'open the development', also: 'Trace from its panel' }), { className: 'pt', direction: 'top', offset: [0, -8] });
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
    syncInViewChip(inView.length, App().state.filtered.length);
    $('#list-note').textContent = !inView.length ? (App().state.filtered.length ? 'No matching developments in this part of the map — zoom out or pan.' : 'No developments match the filters.')
      : pg.pages > 1 ? `Showing ${pg.start + 1}–${pg.start + pg.items.length} of ${fmtNum(sorted.length)} — page ${pg.page + 1} of ${pg.pages}.` : '';
    $('#project-list').innerHTML = pg.items.map((p, i) =>
      `<li><button type="button" data-i="${pg.start + i}">${dot(p.phase)}<span><span class="t">${esc(p.title)}</span>
        <span class="m">${esc(P.PHASE_BY_KEY[p.phase].label)}${window.PeelLayerBar ? ` → ${window.PeelLayerBar.nameHTML(App().layerOf(p))}` : ''} · ${esc(p.municipality)}${p.buildout ? ` · ${fmtNum(p.buildout.planned)} planned, ${fmtNum(P.unbuiltOf(p))} left to build` : p.units ? ` · ${fmtNum(p.units)} units` : ''}${p.last ? ` · ${fmtDate(p.last)}` : ''}</span></span></button></li>`).join('');
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

  // The In view chip on the map (SPEC §4): the developments in view, one tap to the In view list in
  // the left panel (Find), which follows the map view.
  let inViewChip = null;
  function syncInViewChip(n, of) {
    const mc = map.getContainer(); if (!mc) return;
    if (!inViewChip) {
      inViewChip = L.DomUtil.create('button', 'btn small inview-chip', mc); inViewChip.type = 'button';
      L.DomEvent.disableClickPropagation(inViewChip);
      inViewChip.title = 'The developments in this part of the map: open the In view list (it follows the map)';
      inViewChip.addEventListener('click', () => {
        const DT = window.PeelDataTab; if (DT) { DT.showTab('explore'); if (DT.shellNarrow && DT.shellNarrow()) DT.toggleSidebar(true); }
        const l = document.querySelector('.list-panel'); if (l) l.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    inViewChip.textContent = `In view · ${fmtNum(n)} of ${fmtNum(of)}`;
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
