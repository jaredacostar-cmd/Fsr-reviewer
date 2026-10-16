(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  const { $, esc, fmtNum, store, CSV_DISCLAIMER } = window.PeelUtil;
  const CFG = window.PEEL_CONFIG;
  const map = window.PeelMapCore.map;
  const DD = () => window.PeelDevDetail;
  const Ex = () => window.PeelExports;
  const DevTab = () => window.PeelDevelopmentsTab;
  const FU = () => window.PeelFilterUI;
  const App = () => window.PeelApp;

  // ---- Duplicate check (Data tab) ------------------------------------------------------
  // Evidence that every file and unit is counted once; computed on demand (all records,
  // ignoring the filters).
  function renderAudit() {
    if (!App().state.auditInput || !App().state.projects.length || !window.PeelAudit) return;
    const a = App().state.audit || (App().state.audit = PeelAudit.audit(App().state.auditInput.raw, App().state.auditInput.records, App().state.projects));
    const u = a.units, r = a.records;
    const ok = a.checks.every(c => c.value === 0);
    $('#audit-status').textContent = ok ? 'All checks pass' : 'Check failed';
    const line = (label, v, sign = '−') => `<tr><td>${sign} ${esc(label)}</td><td>${fmtNum(Math.round(v))}</td></tr>`;
    const pairs = a.possible.slice(0, 12).map((x, i) => `<li>
        <button type="button" class="btn small link" data-ap="${i}|0">${esc(x.projects[0].title)}</button> (${fmtNum(x.projects[0].units)})
        ↔ <button type="button" class="btn small link" data-ap="${i}|1">${esc(x.projects[1].title)}</button> (${fmtNum(x.projects[1].units)})
        <span class="muted">· ${Math.round(x.metres)} m${x.sameUnits ? ' · same units' : ''}</span></li>`).join('');
    $('#audit-body').innerHTML = `
      <p class="small">${fmtNum(r.raw)} records from ${fmtNum(r.bySource.length)} layers → <strong>${fmtNum(r.copiesMerged)}</strong> copies of the same file merged
        (${fmtNum(r.mergedGroups)} files listed in more than one layer or spelling) → ${fmtNum(r.unique)} unique files → ${fmtNum(r.projects)} projects.</p>
      <ul class="audit-checks">${a.checks.map(c => `<li class="${c.value ? 'bad' : 'good'}"><span aria-hidden="true">${c.value ? '✕' : '✓'}</span> ${esc(c.label)}: <strong>${fmtNum(c.value)}</strong></li>`).join('')}</ul>
      <table class="dt audit-units"><caption>Units: every record → counted once</caption><tbody>
        <tr><td>Units on every record</td><td>${fmtNum(u.raw)}</td></tr>
        ${line('copies of the same file', u.duplicateCopies)}
        ${line('withdrawn / refused files', u.withdrawn)}
        ${line('repeat applications for one proposal', u.repeatApps)}
        ${line('repeat permits for one building', u.repeatPermits)}
        ${line('permits already in their planning application', u.permitsInApps)}
        ${line('sites with no plan: largest figure on any file', Math.abs(u.other), u.other < 0 ? '+' : '−')}
        <tr class="total"><td>= Units counted</td><td>${fmtNum(u.counted)}</td></tr>
      </tbody></table>
      <p class="small muted">Units counted equals the demand panel's “All units” with every filter off (all years, all phases).</p>
      <h3 class="label sub-label">Possible duplicates left: ${fmtNum(a.possible.length)}</h3>
      <p class="small muted">Separate developments of 20+ units within 60 m of each other${a.possibleSameUnits ? `, ${fmtNum(a.possibleSameUnits)} with the same unit count` : ' (none with the same unit count)'}. Usually neighbouring buildings; tap to check.</p>
      ${pairs ? `<ol class="audit-pairs small">${pairs}</ol>` : ''}
      <div class="row btns"><button type="button" class="btn small" id="audit-csv" title="Every file, the development it is counted in, and its units">Download audit CSV</button></div>`;
  }
  $('#audit-body').addEventListener('click', e => {
    const b = e.target.closest('[data-ap]');
    if (b) { const [i, j] = b.dataset.ap.split('|').map(Number); DevTab().focusProject(App().state.audit.possible[i].projects[j]); return; }
    if (e.target.closest('#audit-csv')) {
      const cell = v => /[",\n]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
      const { cols, rows } = DD().recordAuditRows();
      Ex().download('peel-duplicate-audit.csv', CSV_DISCLAIMER + [cols.join(','), ...rows.map(r => r.map(cell).join(','))].join('\n'), 'text/csv');
    }
  });

  // Sidebar tabs.
  function showTab(name) {
    // (bundle 6: the Data tab folded into Records; a stored or linked 'data' opens Find)
    if (name === 'data' || !document.getElementById('tab-' + name)) name = 'explore';
    for (const b of document.querySelectorAll('.tabs [data-tab]')) {
      const on = b.dataset.tab === name;
      b.setAttribute('aria-selected', String(on));
      $('#tab-' + b.dataset.tab).hidden = !on;
    }
    store.set('tab', name);
  }
  document.querySelector('.tabs').onclick = e => { const b = e.target.closest('[data-tab]'); if (b) showTab(b.dataset.tab); };
  // Deferred init: needs window.PeelApp, which app.js assigns after all modules load.
  // (Single-file app ran this inline with the bare `state` variable.)
  function initDataTab() {
    showTab(store.get('tab', 'explore'));
    $('#s-since').value = App().state.sinceYear;
    $('#s-max').value = App().state.maxPerLayer;
  }
  $('#s-since').onchange = e => { App().state.sinceYear = Number(e.target.value) || 0; store.set('sinceYear', App().state.sinceYear); };
  $('#s-max').onchange = e => { App().state.maxPerLayer = Math.max(500, Number(e.target.value) || CFG.maxPerLayer); store.set('maxPerLayer', App().state.maxPerLayer); };
  // Refresh live: re-query every enabled source now instead of using the weekly snapshot.
  $('#btn-reload').onclick = () => { for (const s of App().state.sources) { s.records = []; s.status = 'idle'; s.msg = ''; } App().scheduleRebuild(); App().loadAll(); };
  $('#btn-discover').onclick = () => App().discover();

  $('#source-list').onchange = e => {
    const i = e.target.dataset.i; if (i == null) return;
    const s = App().state.sources[+i];
    s.enabled = e.target.checked; App().saveSources(); DevTab().renderSources();
    if (s.enabled && s.status !== 'ok') { App().setInflight(App().inflight() + 1); App().showLoading(); App().loadSource(s).then(() => { App().setInflight(App().inflight() - 1); App().showLoading(); }); }
    else App().scheduleRebuild();
  };
  $('#source-list').onclick = e => {
    const b = e.target.closest('[data-rm]'); if (!b) return;
    const [s] = App().state.sources.splice(+b.dataset.rm, 1);
    App().removed.add(s.id); App().saveSources(); DevTab().renderSources(); App().scheduleRebuild();
  };
  $('#add-source').onsubmit = e => {
    e.preventDefault();
    const url = $('#a-url').value.trim();
    const muni = $('#a-muni').value, kind = $('#a-kind').value;
    const name = `${muni} – ${decodeURIComponent((url.match(/services\/(.+?)\/(Feature|Map)Server/i) || [, url])[1]).replace(/_/g, ' ')}`;
    const src = { id: `custom-${Date.now()}`, name, municipality: muni, kind, url, enabled: true, status: 'idle', msg: '', records: [] };
    App().state.sources.push(src); App().saveSources(); DevTab().renderSources();
    $('#a-url').value = '';
    App().setInflight(App().inflight() + 1); App().showLoading(); App().loadSource(src).then(() => { App().setInflight(App().inflight() - 1); App().showLoading(); });
  };

  // Phase 2 shell: the <1200px breakpoint (map-first). A hoisted declaration so the
  // filter UI and the tour can use it during start-up.
  function shellNarrow() { return window.innerWidth < 1200; }
  // The Filters button (compact shell): opens/closes the off-canvas filter sheet;
  // its label carries the active filter count. Hidden on desktop (sidebar visible).
  function syncFiltersBtn() {
    const b = $('#toggle-sidebar'); if (!b) return;
    const n = FU().activeFilters().length;
    b.innerHTML = n ? `Filters (<span class="n">${n}</span>)` : 'Filters';
  }
  function toggleSidebar(open) {
    const sb = $('#sidebar');
    const o = open ?? !sb.classList.contains('open');
    sb.classList.toggle('open', o);
    document.querySelector('.app').classList.toggle('sidebar-open', o);
    $('#toggle-sidebar').setAttribute('aria-expanded', String(o));
    syncFiltersBtn();
  }
  $('#toggle-sidebar').onclick = () => toggleSidebar();
  // Below 1200 px the Filters button sits in the top bar (before its actions), off the map and off
  // the phone sheet; on a wide screen it goes back (hidden: the sidebar is visible).
  const fBtn = $('#toggle-sidebar'), fHome = fBtn && fBtn.parentElement;
  function placeFilters() {
    const tb = $('#topbar'), acts = $('#tb-actions'); if (!fBtn || !tb || !acts || !fHome) return;
    if (shellNarrow()) { if (fBtn.parentElement !== tb) tb.insertBefore(fBtn, acts); } else if (fBtn.parentElement !== fHome) fHome.appendChild(fBtn);
  }
  placeFilters(); addEventListener('resize', placeFilters);
  // Resizable panels: drag a grip to resize; tap a sheet grip to step through its
  // heights. Sizes are remembered per browser. (Used by the analysis column's
  // left-edge handle, the analysis bottom sheet and the detail sheet.)
  function dragResize(grip, { get, set, done }) {
    let y0 = 0, h0 = 0, moved = false;
    grip.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      y0 = e.clientY; h0 = get(); moved = false; grip.setPointerCapture(e.pointerId); grip.classList.add('dragging'); e.preventDefault();
    });
    grip.addEventListener('pointermove', e => {
      if (!grip.hasPointerCapture(e.pointerId)) return;
      const dy = y0 - e.clientY; if (Math.abs(dy) > 3) moved = true;
      if (moved) set(h0 + dy);
    });
    const end = e => { if (!grip.hasPointerCapture(e.pointerId)) return; grip.releasePointerCapture(e.pointerId); grip.classList.remove('dragging'); done(moved); };
    grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
  }
  let mapFix = 0; const fixMap = () => { cancelAnimationFrame(mapFix); mapFix = requestAnimationFrame(() => map.invalidateSize({ pan: false })); };

  // NOTE: fixMap (old line 10166) is in this module's range but missing from the
  // catalogue's Exposes; app-core (old lines 10173+) calls it, so it is exposed here.
  const api = {
    renderAudit, showTab, shellNarrow, syncFiltersBtn, toggleSidebar, dragResize,
    fixMap, initDataTab,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDataTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
