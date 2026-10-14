(function (root) {
  'use strict';
  // Reference rewrites per SPLIT_MAP.md §0 rule 4.
  // (window.DevTab is the pre-existing js/devtab.js global — not PeelDevelopmentsTab;
  // bare DevScope is the pre-existing js/devscope.js global, like L.)
  const { $, esc, store } = window.PeelUtil;
  const DT = () => window.PeelDataTab;
  const AT = () => window.PeelAnalysisTabs;
  const AC = () => window.PeelAerialCheck;
  const AS = () => window.PeelAreaSelect;
  const CL = () => window.PeelChangelog;
  const MA = () => window.PeelMapAnalysis;
  const MP = () => window.PeelMasterPlan;
  const SC = () => window.PeelSewerCap;
  const Msr = () => window.PeelMeasure;
  const TB = () => window.PeelTopbar;
  const PDT = () => window.PeelDevelopmentsTab;
  const App = () => window.PeelApp;

  // ---- Tips: a short tour, shown once (the topbar Help button shows it again) ----------------------------
  const phoneUI = () => innerWidth <= 760;
  // Tour: a guided walk through the app in chapters. Steps can set the app up (open a development,
  // run a trace, open a tab) so each one shows the real thing; the tour tidies up when it ends.
  const tourDev = () => pickDev();
  // Phase 3: opening a development sets the analysis scope (no more #detail dev panel).
  const tourScopeDev = sub => { const p = tourDev(); if (!p) return; PDT().focusProject(p); if (sub && window.DevTab && typeof window.DevTab.setSub === 'function') window.DevTab.setSub(sub); };
  // Show one analysis tab for the tour's development: open it only when it isn't already open
  // (opening it again resets the tabs), let the scope settle, then pick the tab (and sub-view).
  const tourShow = async (tab, sub) => {
    const p = tourDev(); if (!p) return;
    const cur = typeof DevScope !== 'undefined' && DevScope._current;
    if (cur !== p) { PDT().focusProject(p); await new Promise(r => setTimeout(r, 500)); }
    if ((tab === 'dev' || tab === 'overview') && sub && window.DevTab && typeof window.DevTab.setSub === 'function') window.DevTab.setSub(sub);
    if (tab === 'ww') AT().setSub('ww', 'catchments');
    openAnalysis(tab);
  };
  // The first of these that is on screen (phones hide some panels behind a button).
  const vis = (...sels) => { for (const s of sels) { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); if (r && r.width && r.height && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) return e; } return null; };
  const TOUR = [
    { ch: 'Start', el: () => null, t: 'Welcome', b: 'This tracker follows every development application in Mississauga, Brampton and Caledon, and what each one needs from Peel\'s water and wastewater systems. This is an unofficial prototype built from public open data, not a Region of Peel product. This 2-minute tour sets the app up as it goes. Use Next / Back or the ← → keys; Esc ends it.' },
    // Phase 2 shell: the tour lives in js/app.js (not js/info.js); the analysis
    // container moved from #footer to #analysis and the List/Map button is the
    // Filters button on the <1200px shell.
    { ch: 'Find', el: () => DT().shellNarrow() ? $('#toggle-sidebar') : $('#f-search'), t: 'Search', b: 'Type an address, file number, secondary plan, pressure zone, pumping station or DC project number, then pick a result to jump to it.' },
    { ch: 'Find', el: () => DT().shellNarrow() ? $('#toggle-sidebar') : $('#pipeline'), t: 'Phases', b: 'Tap a phase to show only it. On a computer, Ctrl-click (⌘ on a Mac) to pick several.' },
    { ch: 'Map', el: () => document.querySelector('.mo-view'), t: 'Map views', b: 'Planning, Water, Wastewater and DC: each view sets the right layers, colours and background, and remembers your changes.' },
    // Phase 2 layout shell: the legend folded into the Layers panel, "More settings" merged back
    // into it, "Filter by area" moved to the filter panel, and the tools dropdown became a rail.
    { ch: 'Map', el: () => document.querySelector('.map-opts'), t: 'Layers', b: 'One switch per layer: developments, blocks, pressure zones, water facilities, capacity colours, existing pipes, planned DC works, planning and census areas — the legend for what is shown, and More settings below.' },
    { ch: 'Map', el: () => vis('.map-opts .mo-adv', '.map-opts'), t: 'More settings', b: 'Saved views, how developments are coloured and sized, labels, capacity shading, pipe kinds, DC works and the background map.' },
    { ch: 'Map', el: () => vis('#filter-panel', '#toggle-sidebar'), t: 'Filter by area', b: 'Municipality, secondary plans, MTSAs, pressure zones and wastewater blocks, in the filter panel. Every list takes several picks; the totals follow.' },
    { ch: 'Map', el: () => $('#timebar'), t: 'Timeline and demand year', b: 'The timeline keeps developments with activity in the chosen years. The Demand year sets the year demand and capacity are worked out for: 2021 Census, today or build-out.' },
    // Phase 3b: one home per tool — the rail order is select, measure, trace, test a
    // site, inspect, corridor, units-fit (worker A); results open in the Tool
    // result tab (trail: Peel › …), never as pop-ups.
    { ch: 'Map', el: () => document.querySelector('.tool-rail'), t: 'Tools', b: 'One button per tool on the left edge, in order: select developments (tap one, draw a lasso, or hold Ctrl / ⌘ and drag a box), measure with a ground profile, trace a sewer or water route, test a site before an application exists, inspect a point, select along a corridor, or estimate how many more units fit. One tool runs at a time; the banner says what to do and Esc finishes. Tool results open in the Tool result tab (trail: Peel › …).' },
    { ch: 'Present', el: () => $('#tb-present'), t: 'Present and time-lapse', b: 'Present (top bar, or the screen button under the map tools) fills the screen with the map and the headline numbers — Esc exits. Time-lapse, next to it, replays growth year by year from 2016 in presentation mode: press play, or drag the year scrubber. Marker colours are each development\u2019s phase at the end of that year, read from the dated milestones on its files.' },
    { ch: 'A development', do: () => { if (typeof DevScope !== 'undefined') DevScope.close(); tourScopeDev(); }, wait: 700, el: () => $('#site-bar'), t: 'A development', b: 'Tap any marker. The site bar shows the address, phase, key numbers and zone → plant — and every analysis tab now shows this site. ☆ Watch follows it in This week; Memo prints a one-page servicing memo; Check FSR cross-checks consultant FSR figures against the app numbers; Compare adds it to the Compare tool.' },
    { ch: 'A development', do: () => tourShow('overview', 'files'), wait: 500, el: () => vis('#ov-dev', '#pane-overview', '#analysis'), t: 'Overview: the development', b: 'Units, people and jobs with their floor area, and the flows: water max day, wastewater average and peak dry weather, and peak wet weather. Below: About (proposal, status, latest decision, servicing report), Files & history (every application, how the phase was set, dated history and source records) and Site (the aerial check, ground and stormwater).' },
    { ch: 'A development', do: () => tourShow('ww'), wait: 500, el: () => vis('#pane-ww', '#analysis'), t: 'Wastewater', b: 'Flows, the sewer path to the plant with its pumping stations, and the plant\'s reserve (sewer pipes themselves are not assessed): screening estimates, with the Region\u2019s models as the authority. The Water tab has the same for the supply; Growth has the units.' },
    { ch: 'A development', do: () => { const b = document.querySelector('#site-bar [data-trace]'); if (b && !b.dataset.on) b.click(); }, wait: 2500, el: () => $('#map'), t: 'A trace on the map', b: 'The path to the plant, with arrows showing the flow; the other developments fade. Tap a catchment, zone, plant or sewer for the developments draining through it, in the Tool result tab — with actions for an area report or the upstream catchments.' },
    { ch: 'Analysis', do: () => { AS().clearSelected(); openAnalysis('overview'); }, wait: 500, el: () => $('#analysis'), t: 'Analysis', b: 'The totals for what is on the map, and the capacity that runs out first, with its DC relief.' },
    { ch: 'This week', do: () => { const b = $('#tab-btn-week'); if (b) b.click(); }, el: () => vis('#tab-week', '#toggle-sidebar'), t: 'This week: watchlist and alerts', b: 'Star developments with \u2606 Watch to follow them here. Every Monday the site compares the new data with the previous week and posts alerts \u2014 phase changes, new or removed developments, big unit-count changes, and capacity thresholds crossed \u2014 matched against your watchlist in the alerts panel, with a count badge on this tab. The full feed is also published as data/alerts.rss.' },
    { ch: 'Analysis', el: () => document.querySelector('.analysis-tabs'), t: 'Tabs', b: 'Overview for the headlines and what needs attention; Growth for the pipeline and the census story; Water and Wastewater for capacity by sub-view (plants, zones, facilities, pumping stations); DC for timing, the funding screen and funding levels (screening results, not Region decisions; the public version shows timing only; every planned date shows its status after the May 2026 pause). Plants, pumping stations, blocks and zones open as scopes of their own (tap one on the map, a plant in the Overview\'s capacity bars, or search): the trail then reads Peel › plant › station or block. Each tab has sub-views picked with buttons: headline, tiles, chart, top table, method note.' },
    { ch: 'Analysis', do: () => { openAnalysis('growth', 'timing'); }, wait: 600, el: () => $('#pane-growth-timing'), t: 'Timing forecast', b: 'Growth\u2019s Timing sub-view is a statistical screening estimate of WHEN the pipeline builds out: expected completions per year with a low / likely / high band, calibrated from the dated file events since 2016 by municipality and building type \u2014 plus plant and pressure-zone trigger years with a range instead of a single year.' },
    // Phase 3b: Help's only home is the topbar button (the map ? control was removed).
    { ch: 'Help', el: () => $('#tb-help'), t: 'Help any time', b: 'Press and hold (or hover) any heading for what it means and where the data comes from. The Help button in the top bar opens task guides, the tour again, and the change log.' },
  ];
  // Help & tips: task guides with a "Show me" that sets the app up for the task.
  const pickDev = () => App().state.filtered.filter(p => p.lat != null && p.units >= 100 && (p.phase === 'review' || p.phase === 'approved')).sort((a, b) => b.units - a.units)[0] || App().state.filtered.find(p => p.lat != null);
  const toMap = () => { if (DT().shellNarrow() && $('#sidebar').classList.contains('open')) DT().toggleSidebar(false); };
  const openAnalysis = (tab, sub) => { if (sub && AT().TABSUBS[tab]) { AT().TABSUBS[tab].set(sub); store.set(AT().TABSUBS[tab].store, sub); } AT().setFootPref(tab); store.set('footTab4', tab); AT().showFootTab(tab); if (DT().shellNarrow() && App().getAnalysisSnap() === 'peek') App().setAnalysisSnap('half'); };
  const HELP = [
    { t: 'Check servicing for a development', w: 'Reviewing an application, an FSR or a pre-consultation.',
      s: ['Tap its marker, or search its address or file number — the site bar appears and every analysis tab now shows this site.', 'Water and Wastewater tabs: water max day / peak hour and wastewater peak dry / wet at Peel criteria, the sewer path to the plant with pumping stations, and the plant\'s uncommitted reserve.', 'DC needs: the existing pipes, stations and plant it relies on — room left, the year it runs out, and the DC project that relieves it.', 'Existing mains: every main within 100–400 m with size, material, year and street (tap one to see it), plus fire flow. The Development tab\u2019s Site view has stormwater and ground.', 'Memo (in the site bar) prints a one-page servicing memo.'],
      go: () => { const p = pickDev(); if (!p) return; toMap(); PDT().focusProject(p); setTimeout(() => AT().showFootTab('ww'), 50); } },
    { t: 'Find when DC projects are needed', w: 'DC background study, capital timing, or explaining why a site waits for a trunk sewer.',
      s: ['Switch to the DC map view: developments coloured by servicing timing, all 2026 DC works shown.', 'More settings (in the Layers panel) → DC timing: every existing constraint, filtered to "Screens late".', 'Tap a DC main or facility on the map for what it relieves and the developments relying on it.', 'Export (top bar) → Excel writes the full DC timing table for a memo or spreadsheet.'],
      go: () => { MA().setMapView('dc'); SC().loadSewers(); MP().showDcTiming(); } },
    { t: 'Report on an area or secondary plan', w: 'A block plan, MTSA or secondary plan review; council or committee questions.',
      s: ['Search the plan or MTSA name and pick it — the map filters to it.', 'Tap Report on the Showing line for a printable area report: demand, the capacity it relies on with DC timing, largest developments.', 'Or the Select an area tool (map rail): draw around any group; the summary has Area report, with the CSV, Excel and PDF versions under Export (top bar).'],
      go: () => { toMap(); AC().closeDetail(); AS().setLasso(true); } },
    { t: 'Test a site before an application exists', w: 'A pre-consultation, an inquiry, or a land use scenario.',
      s: ['The Test a site tool (map rail), then tap the map where the site is.', 'Enter units by type, jobs and site area; drag the pin to move it.', 'The panel shows its flows, pressure zone, sewer path, pumping stations and plant reserve; tick "Count it" to add it to the totals and capacity.'],
      go: () => { toMap(); AC().closeDetail(); Msr().setTool('whatif'); } },
    { t: 'Keep up with weekly changes', w: 'Monday check-ins and tracking the files you are working on.',
      s: ['This week tab: new files and phase changes from the latest weekly update.', '☆ Watch on any development adds it to Your watchlist (top of This week).', 'More filters → ★ Watched or Changed this week shows just those on the map.', 'Save the setup with Saved views (Layers & style).'],
      go: () => { if (DT().shellNarrow()) DT().toggleSidebar(true); DT().showTab('week'); } },
    { t: 'Plant and pumping station capacity over time', w: 'Allocation, servicing capacity reports, staging.',
      s: ['Analysis → Wastewater → Plants & capacity: each plant\'s flow as a share of rated capacity by year (Horizon years), the 90% expansion trigger and the DC expansions.', 'Capacity layer (Layers & style → Shade): pumping station load or sewer pipe capacity, with a year slider in the legend.', 'The Scenario line switches design flows (ADWF) vs the 2025 measured annual average flows, the Booth → Clarkson diversion and more.', 'Pumping stations are checked on peak wet weather flow against firm capacity; Definitions (Overview ⓘ) explains committed, reserve and room.'],
      go: () => { MA().setMapView('wastewater'); openAnalysis('ww', 'plants'); } },
    { t: 'Water demand by pressure zone', w: 'Zone growth, storage and supply checks.',
      s: ['Water view: pressure zones shaded by max day growth.', 'Analysis → Water: census, built, committed and proposed max day by zone, reported plant production and the master plan storage assessment.', 'Tap a zone row or a zone on the map for What loads this — every development adding demand.'],
      go: () => { MA().setMapView('water'); openAnalysis('water'); } },
    { t: 'Existing mains and ground near a site', w: 'Connection options, a site visit, or a quick constraint check.',
      s: ['Layers → Existing pipes (from street zoom); More settings → Existing for water, sanitary or storm, and Size labels for diameters.', 'A development\'s Servicing tab lists every main around it with street and distance.', 'The Measure & ground profile tool (map rail): tap points for the distance and the ground profile with fall and grade.'],
      go: () => { toMap(); AC().closeDetail(); Msr().setTool('measure'); } },
    { t: 'Save, share and export', w: 'Sending a view to a colleague, or attaching numbers to a report.',
      s: ['More settings (in the Layers panel) → Saved views keeps a named setup in this browser.', 'Share link copies a link to the exact filters, map position and open development.', 'Export (top bar) gathers every export in one menu: CSV / GeoJSON of the developments shown, the Excel workbook, print-ready PDFs (executive briefing, development memo, area report, comparison of the Compare tool’s items), the print map, GIS layers and the inquiry draft.', 'Export → Inquiry response draft starts a servicing inquiry draft from what is shown.'],
      go: () => { toMap(); const d = document.querySelector('.mo-more'); if (d) { d.open = true; d.scrollTop = 0; } } },
    { t: 'How far to trust the numbers', w: 'Before quoting a figure.',
      s: ['Flows use Peel design criteria (editable in the Scenario control); the Scenario bar says which switches are on.', 'Capacity checks are screens, not hydraulic models: sewer capacity is full-pipe Manning on the published slope; "Check the data" flags likely slope errors.', 'The 2026 DC capital maps are a draft; schedules change annually.', 'Data tab: sources, dates and the weekly snapshot.'],
      go: () => { toMap(); TB().openScenPop(); } },
  ];
  const QUICK_TIPS = [
    'Tap an empty part of the map, press Esc, or use Clear selection to unselect.',
    'Press and hold (or hover) a heading or label for what it means and where the data comes from.',
    'The north arrow switches between Peel’s road grid and north up.',
    'Search a DC project number (e.g. 25-2269) or a pumping station to jump to it.',
    'Hover a cluster for its phase counts; More settings (in the Layers panel) → Show as → Heatmap shows where people and jobs concentrate.',
    'The summary line above the Analysis tabs always shows the totals for what is on the map.',
    'Tables in the Water and Wastewater tabs keep their headers while you scroll.',
    'The PDFs under Export (top bar) — executive briefing, development memo, area report, comparison — open a print-ready page: use Print / Save as PDF.',
    'On a phone or tablet, Filters opens the search, filters and the developments on the map; tap it again to go back to the map.',
  ];
  function showHelp() {
    AC().closeDetail({ keepSelection: true });
    $('#detail-body').innerHTML = `<div class="head"><h3>Help &amp; tips</h3><div class="m">Guides for common tasks — each one can set the map up for you</div></div>
      <p><button type="button" class="btn" data-help-tour>Take the tour again</button> <button type="button" class="btn" data-help-log>What's new — change log</button></p>
      <div id="help-log-body" aria-live="polite"></div>
      ${HELP.map((h, i) => `<details class="help-card"${i === 0 ? ' open' : ''}><summary><strong>${esc(h.t)}</strong><small>${esc(h.w)}</small></summary>
        <ol>${h.s.map(x => `<li>${esc(x)}</li>`).join('')}</ol><button type="button" class="btn small" data-help-go="${i}">Show me</button></details>`).join('')}
      <h3 class="sub-title">Quick tips</h3><ul class="help-tips">${QUICK_TIPS.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
    $('#detail').hidden = false; $('#detail').dataset.view = 'help'; $('#detail').scrollTop = 0;
    if (phoneUI()) DT().toggleSidebar(false);
  }
  // The Help menu's change log: render into the help view (marks the releases seen,
  // which clears the "new" dot on the Help button).
  function showHelpLog() {
    showHelp();
    CL().renderChangelog();
    setTimeout(() => { const w = $('#help-log-body'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-help-open]')) return showHelp();
    if (e.target.closest('[data-help-tour]')) { AC().closeDetail(); return startTour(); }
    // Phase 3b: Help carries the change log too — same destination as the gear menu's Change log.
    if (e.target.closest('[data-help-log]')) { CL().renderChangelog(); const w = $('#help-log-body'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const g = e.target.closest('[data-help-go]'); if (!g) return;
    const h = HELP[+g.dataset.helpGo]; if (!h) return;
    h.go();
    // On a phone the guide would cover what it just set up: close it (the topbar Help button reopens it).
    if (phoneUI() && $('#detail').dataset.view === 'help' && !$('#detail').hidden) AC().closeDetail({ keepSelection: true });
  });
  let tourEl = null, tourI = 0, tourChecked = false;
  function maybeTour() {
    if (tourChecked || !App().state.projects.length) return;
    tourChecked = true;
    if (!store.get('tourDone', false)) setTimeout(startTour, 1200);
  }
  function startTour() { tourI = 0; tourSet = { view: MA().currentView(), snap: DT().shellNarrow() ? App().getAnalysisSnap() : null }; showTourStep(); }
  let tourSet = null;
  function endTour() {
    store.set('tourDone', true);
    if (tourEl) { tourEl.remove(); tourEl = null; }
    removeEventListener('keydown', tourKey, true);
    if (tourSet) { AS().clearSelected(); if (tourSet.snap && DT().shellNarrow()) App().setAnalysisSnap(tourSet.snap); tourSet = null; }
  }
  function tourKey(e) {
    if (!tourEl) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tourGo(tourI + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tourGo(Math.max(0, tourI - 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
  }
  function tourGo(i) { if (i >= TOUR.length) return endTour(); tourI = i; showTourStep(); }
  async function showTourStep() {
    const st = TOUR[tourI]; if (!st) return endTour();
    if (!tourEl) {
      tourEl = document.createElement('div'); tourEl.className = 'tour'; document.body.appendChild(tourEl);
      tourEl.addEventListener('click', e => {
        const d = e.target.closest('[data-tour-dot]');
        if (e.target.closest('[data-tour-next]')) tourGo(tourI + 1);
        else if (e.target.closest('[data-tour-back]')) tourGo(Math.max(0, tourI - 1));
        else if (d) tourGo(+d.dataset.tourDot);
        else if (e.target.closest('[data-tour-help]')) { endTour(); showHelp(); }
        else if (e.target.closest('[data-tour-skip]')) endTour();
      });
      addEventListener('keydown', tourKey, true);
    }
    const my = tourI;
    if (st.do) { tourEl.classList.add('busy'); try { await st.do(); } catch (e) { /* the step still shows */ } if (st.wait) await new Promise(r => setTimeout(r, st.wait)); if (!tourEl || my !== tourI) return; tourEl.classList.remove('busy'); }
    const el = st.el(), r = el && el.getBoundingClientRect();
    const onScreen = r && r.width && r.height && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight;
    const box = onScreen ? { x: Math.max(4, r.left - 4), y: Math.max(4, r.top - 4), w: Math.min(innerWidth - 8, r.width + 8), h: Math.min(innerHeight - 8, r.height + 8) } : null;
    const big = box && box.w * box.h > innerWidth * innerHeight * 0.3;
    let cw = Math.min(340, innerWidth - 24);
    // A narrow highlight on the left edge (the tool rail on a phone): a narrower card beside it.
    const side = box && !big ? innerWidth - (box.x + box.w + 12) - 12 : 0;
    if (box && box.w <= 64 && side >= 200 && side < cw && box.x - 12 - cw <= 0) cw = side;
    // Card beside the highlight when there's room (right, then left), else below or above it.
    const place = ch => {
      if (box && !big) {
        if (box.x + box.w + 12 + cw < innerWidth) return [box.x + box.w + 12, Math.min(innerHeight - ch - 12, Math.max(12, box.y))];
        if (box.x - 12 - cw > 0) return [box.x - 12 - cw, Math.min(innerHeight - ch - 12, Math.max(12, box.y))];
        const below = box.y + box.h + 10, above = box.y - ch - 10;
        return [Math.min(innerWidth - cw - 12, Math.max(12, box.x)), below + ch <= innerHeight - 8 ? below : above >= 8 ? above : Math.max(8, innerHeight - ch - 8)];
      }
      if (box) return [Math.max(12, Math.min(innerWidth - cw - 12, box.x + 16)), Math.max(12, Math.min(innerHeight - ch - 12, box.y + 16))];
      return [(innerWidth - cw) / 2, Math.max(12, (innerHeight - ch) * 0.35)];
    };
    let [cx, cy] = place(200);
    const chapters = [...new Set(TOUR.map(x => x.ch))], last = tourI === TOUR.length - 1;
    tourEl.innerHTML = `${box && !big ? `<div class="tour-hole" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>` : big ? `<div class="tour-hole big" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>` : ''}
      <div class="tour-card" role="dialog" aria-live="polite" aria-label="Tour step ${tourI + 1} of ${TOUR.length}: ${esc(st.t)}" style="left:${cx}px;top:${cy}px;width:${cw}px">
        <div class="tour-ch">${chapters.map(c => `<span class="${c === st.ch ? 'on' : ''}">${esc(c)}</span>`).join('')}</div>
        <strong>${esc(st.t)}</strong><p>${esc(st.b)}</p>
        <div class="tour-dots" aria-hidden="true">${TOUR.map((_, i) => `<button type="button" tabindex="-1" class="${i === tourI ? 'on' : i < tourI ? 'done' : ''}" data-tour-dot="${i}" title="Step ${i + 1}"></button>`).join('')}</div>
        <div class="tour-btns"><button type="button" class="btn small link" data-tour-skip>${last ? 'Close' : 'Skip tour'}</button><span>${tourI ? '<button type="button" class="btn small" data-tour-back>← Back</button>' : ''}${last ? '<button type="button" class="btn small primary" data-tour-help>Open Help &amp; tips</button>' : `<button type="button" class="btn small primary" data-tour-next>${tourI ? 'Next →' : 'Start →'}</button>`}</span></div></div>`;
    const card = tourEl.querySelector('.tour-card'), [x2, y2] = place(card.offsetHeight); card.style.left = `${x2}px`; card.style.top = `${y2}px`;
    const nx = tourEl.querySelector('[data-tour-next], [data-tour-help]'); if (nx) nx.focus({ preventScroll: true });
  }

  const api = { maybeTour, showHelp, showHelpLog, openAnalysis, startTour };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTips = api;
})(typeof window !== 'undefined' ? window : globalThis);
