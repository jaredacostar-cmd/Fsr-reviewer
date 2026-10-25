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
  const phoneUI = () => innerWidth <= 700;
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
    if (tab === 'ww') { tab = 'svc'; AT().setSub('svc', 'network'); }
    openAnalysis(tab);
  };
  // The first of these that is on screen (phones hide some panels behind a button).
  const vis = (...sels) => { for (const s of sels) { const e = document.querySelector(s); const r = e && e.getBoundingClientRect(); if (r && r.width && r.height && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight) return e; } return null; };
  // Navigation 4: the first run is a short tour of Home, after "What's your role?"; the map has its own
  // tour (TOUR below), offered the first time the full map opens. Neither leaves anything open.
  const TOUR_ROLES = [
    ['engineer', 'Infrastructure planner or engineer', ['site', 'tight', 'fsr']],
    ['manager', 'Manager or director', ['home', 'tight', 'projects']],
    ['growth', 'Growth or policy analyst', ['growth', 'study', 'week']],
    ['capital', 'Capital or asset management', ['projects', 'pipes']],
    ['fsr', 'FSR reviewer (development engineering)', ['fsr', 'site', 'week']],
  ];
  const roleNow = () => TOUR_ROLES.find(r => r[0] === store.get('role', '')) || null;
  const pageName = id => { const W = root.PeelWorkspaces; return id === 'home' ? 'Home' : W && W.WS ? (W.WS.find(w => w.id === id) || {}).label || id : id; };
  const rolePages = () => { const r = roleNow(); return r ? r[2].map(pageName).join(', ') : 'Check a site, Servicing capacity and Growth in an area'; };
  // (on a phone the menu folds behind one button: the step points at it)
  const homeMenu = sel => vis(`#home .home-side.open ${sel}`, `#home .home-side ${sel}`, '#home .home-menu-btn');
  const HOME_TOUR = [
    { ch: 'Start', el: () => null, roles: true, t: 'Welcome', b: 'This app follows every development application in Mississauga, Brampton and Caledon, and what each one needs from Peel\'s water and wastewater systems. It is an unofficial prototype built from public open data, not a Region of Peel product. What\'s your role? The tour shows you where to start (Help › Tour of Home asks again).' },
    { ch: 'Home', el: () => vis('#home .page-main .home-h', '#home .page-main'), t: 'The briefing', b: 'Home opens on what needs attention: the facilities near their limit, the files that moved, and the capital and EA dates. Each line opens what it names.' },
    { ch: 'Home', el: () => homeMenu('ul'), t: 'Your pages', b: () => `Each page answers one question, with its own map. For your role, start with: ${rolePages()}. The menu lists them all, grouped: Planning, Capital, QA/QC, Asset Management and Reference.` },
    // (the search at the top of the page: Home's header, as on every page; else Explore in the menu)
    { ch: 'Home', el: () => vis('#home #page-search input', '#home #page-search') || homeMenu('[data-ws-page="explore"]'), t: 'Search from any page', b: 'The search at the top of every page finds an address, a file number, a plan, a facility or a DC project number and opens it: a site\u2019s summary (a file number, its files), a plan\u2019s growth, a plant\u2019s or station\u2019s capacity on the map, a DC project with the developments relying on it. Draw an area beside it opens the map with the Select tool on. Explore, in the menu, has a site\u2019s and an area\u2019s views, one section at a time.' },
    { ch: 'Home', el: () => homeMenu('.home-full'), t: 'The full map', b: 'Every layer, filter and tool. A "← Back to …" bar takes you back to the page you came from, and a short map tour is offered the first time you open it.' },
    { ch: 'Home', el: () => vis('#tb-restart', '#tb-more'), t: 'Start over and Help', b: 'Start over (top bar) clears every filter, the search and the selection and brings you back to Home; the map view and the scenario stay. Help has the guides, both tours and the glossary.' },
  ];
  const TOUR = [
    { ch: 'Start', el: () => null, t: 'The full map', b: 'Every layer, filter and tool, for the same scope, filters and scenario as the pages. This 2-minute tour sets the map up as it goes and puts it back when it ends. Use Next / Back or the ← → keys; Esc ends it.' },
    // Phase 2 shell: the tour lives in js/app.js (not js/info.js); the analysis
    // container moved from #footer to #analysis and the List/Map button is the
    // Filters button on the <1200px shell.
    { ch: 'Find', el: () => DT().shellNarrow() ? $('#toggle-sidebar') : $('#f-search'), t: 'Search', b: 'Type an address, file number, secondary plan, pressure zone, pumping station or DC project number, then pick a result to jump to it.' },
    { ch: 'Find', el: () => DT().shellNarrow() ? $('#toggle-sidebar') : $('#pipeline'), t: 'Stages', b: 'Tap a stage to show only it. On a computer, Ctrl-click (⌘ on a Mac) to pick several.' },
    { ch: 'Map', el: () => document.querySelector('#tb-views'), t: 'Map views', b: 'In the top bar: Planning, Water, Wastewater and DC: each view sets the right layers, colours and background, and remembers your changes.' },
    // Phase 2 layout shell: the legend folded into the Layers panel, "More settings" merged back
    // into it, "Filter by area" moved to the filter panel, and the tools dropdown became a rail.
    { ch: 'Map', el: () => document.querySelector('.map-opts'), t: 'Layers', b: 'One switch per group: developments, capacity, the existing network, the capital program, constraints, planning context and the base map. The legend is its own card on the map, with Colour sites by (stage, counted as, plant, data quality or timing).' },
    { ch: 'Map', el: () => vis('.map-opts .mo-adv', '.map-opts'), t: 'More settings', b: 'How developments are sized, labels, capacity shading, pipe kinds, DC works and the background map.' },
    { ch: 'Map', el: () => vis('#filter-panel', '#toggle-sidebar'), t: 'Find: Where, What, When', b: 'Municipality, plant, secondary plans, MTSAs, pressure zones and wastewater blocks (Where); size, dwelling type, land use and record type (What); the milestone (When). Every list takes several picks; the totals follow, and Reset clears them.' },
    { ch: 'Map', el: () => $('#timebar'), t: 'Timeline', b: 'The timeline keeps developments with activity in the chosen years (all years to start, so every live development counts; pick years to narrow it). The year demand and capacity are worked out for is in the Scenario control in the top bar.' },
    // Phase 3b: one home per tool — the rail order is select, measure, trace, test a
    // site, inspect, corridor, units-fit (worker A); results open in the Tool
    // result tab (trail: Peel › …), never as pop-ups.
    { ch: 'Map', el: () => document.querySelector('.tool-rail'), t: 'Tools', b: 'Behind the Tools button on the left edge (open on a computer, folded on a phone or tablet; it remembers), one button per tool, in order: select developments (tap one, draw a lasso, or hold Ctrl / ⌘ and drag a box), measure with a ground profile, trace a sewer or water route, test a site before an application exists, inspect a point, select along a corridor, or estimate how many more units fit. One tool runs at a time; the banner says what to do and Esc finishes. Tool results open in the Tool result tab (trail: Peel › …).' },
    { ch: 'Present', el: () => $('#tb-present'), t: 'Present and time-lapse', b: 'Present ▾ in the top bar has both. Present fills the screen with the map and the headline numbers of whatever is open (Peel, an area, a plant or a development), in the light theme for projectors, with the screening note and the data date — Exit or Esc leaves. Time-lapse replays growth year by year from 2016 in presentation mode: press play, or drag the year scrubber. Marker colours are each development\u2019s phase at the end of that year, read from the dated milestones on its files.' },
    { ch: 'A development', do: () => { if (typeof DevScope !== 'undefined') DevScope.close(); tourScopeDev(); }, wait: 700, el: () => $('#site-bar'), t: 'A development', b: 'Tap any marker. The site bar shows the address, stage, key numbers and zone → plant — and every analysis tab now shows this site. ☆ Watch follows it in the Watch tab; Servicing memo prints a one-page memo; Inquiry draft (at the foot of its Overview) drafts a servicing inquiry reply, the site kept; Check FSR cross-checks consultant FSR figures against the app numbers; Compare adds it to the Compare tool.' },
    { ch: 'A development', do: () => tourShow('overview', 'files'), wait: 500, el: () => vis('#ov-dev', '#pane-overview', '#analysis'), t: 'Overview: the development', b: 'The header answers first: the stage (press it for how it was set), the aerial check and "files · history". Then units, people and jobs, the flows and the servicing rows (the path to the plant, the DC projects it relies on). Below: Files (the file tree; a file number opens its record), History and source records (each event opens its record in place) and Site.' },
    { ch: 'A development', do: () => tourShow('ww'), wait: 500, el: () => $('#analysis'), t: 'Servicing', b: 'Flows, the sewer path to the plant with its pumping stations, and the plant\'s reserve (sewer pipes themselves are not assessed), and the same for the water supply: screening estimates, with the Region\u2019s models as the authority. Growth has the units; Capital the DC works.' },
    { ch: 'A development', do: () => { const b = document.querySelector('#site-bar [data-trace]'); if (b && !b.dataset.on) b.click(); }, wait: 2500, el: () => $('#map'), t: 'A trace on the map', b: 'The path to the plant, with arrows showing the flow; the other developments fade. Tap a catchment, zone, plant or sewer for the developments draining through it, in the Tool result tab — with actions for an area report or the upstream catchments.' },
    { ch: 'Analysis', do: () => { AS().clearSelected(); openAnalysis('overview'); }, wait: 500, el: () => $('#analysis'), t: 'Analysis', b: 'The totals for what is on the map, and the capacity that runs out first, with its DC relief.' },
    { ch: 'This week', do: () => { if (DT() && DT().showTab) DT().showTab('week'); }, el: () => vis('#tab-week', '#toggle-sidebar'), t: 'Watch: your watchlist and alerts', b: 'Star developments with \u2606 Watch to follow them in the Watch tab (Home\u2019s This week page lists what changed). Every Monday the site compares the new data with the previous week and posts alerts \u2014 phase changes, new or removed developments, big unit-count changes, and capacity thresholds crossed \u2014 matched against your watchlist in the alerts panel, with a count badge on this tab. The full feed is also published as data/alerts.rss.' },
    { ch: 'Analysis', el: () => document.querySelector('.analysis-tabs'), t: 'Tabs', b: 'Overview for the headlines and what needs attention; Growth for the pipeline, the areas and the forecast; Servicing for capacity, the network, allocations and model checks; Capital for DC timing and the projects (screening results, not Region decisions); Records for the files and the data checks. Plants, pumping stations, blocks and zones open as scopes of their own (tap one on the map or search): the trail then reads Peel › plant › station or block. Every panel reads the same way, and Open full table shows the detail.' },
    { ch: 'Analysis', do: () => { openAnalysis('growth', 'timing'); }, wait: 600, el: () => $('#pane-growth-timing'), t: 'Forecast', b: 'Growth\u2019s Forecast is a statistical screening estimate of WHEN the pipeline builds out: expected completions per year with a low / likely / high band, calibrated from the dated file events since 2016 by municipality and building type \u2014 plus plant and pressure-zone trigger years with a range instead of a single year.' },
    // Phase 3b: Help's only home is the topbar button (the map ? control was removed).
    { ch: 'Help', el: () => $('#tb-help'), t: 'Help any time', b: 'Press and hold (or hover) any heading for what it means and where the data comes from. The Help button in the top bar opens the task guides, both tours and the change log; Start over clears everything and goes back to Home.' },
  ];
  // Help & tips: task guides with a "Show me" that sets the app up for the task.
  const pickDev = () => App().state.filtered.filter(p => p.lat != null && p.units >= 100 && (p.phase === 'review' || p.phase === 'approved')).sort((a, b) => b.units - a.units)[0] || App().state.filtered.find(p => p.lat != null);
  const toMap = () => { if (DT().shellNarrow() && $('#sidebar').classList.contains('open')) DT().toggleSidebar(false); };
  const openAnalysis = (tab, sub) => { if (sub && AT().TABSUBS[tab]) { AT().TABSUBS[tab].set(sub); store.set(AT().TABSUBS[tab].store, sub); } AT().setFootPref(tab); store.set('footTab4', tab); AT().showFootTab(tab); if (DT().shellNarrow() && App().getAnalysisSnap() === 'peek') App().setAnalysisSnap('half'); };
  const HELP = [
    { t: 'Check servicing for a development', w: 'Reviewing an application, an FSR or a pre-consultation.',
      s: ['Tap its marker, or search its address or file number — the site bar appears and every analysis tab now shows this site. From any page the same search opens its page.', 'Servicing tab: water max day / peak hour and wastewater peak dry / wet at Peel criteria, the sewer path to the plant with pumping stations, and the plant\'s uncommitted reserve. Its Overview has the path in one line (Path to the plant: each station against firm capacity, then the plant and its reserve) and names the DC projects it relies on.', 'Capital › DC timing: the existing pipes, stations and plant it relies on: room left, the year it runs out, and the DC project that relieves it.', 'Existing mains: every main within 100–400 m with size, material, year and street (tap one to see it), plus fire flow. The Servicing tab\u2019s site fold has the aerial check and the ground.', 'Memo (in the site bar) prints a one-page servicing memo.'],
      go: () => { const p = pickDev(); if (!p) return; toMap(); PDT().focusProject(p); setTimeout(() => AT().showFootTab('svc', 'network'), 50); } },
    { t: 'Find when DC projects are needed', w: 'DC background study, capital timing, or explaining why a site waits for a trunk sewer.',
      s: ['Switch the map to Capital (top bar): the 2026 DC works and the construction under way.', 'Capital › DC timing: every DC project and whether it comes before the capacity it relieves runs out, the late ones first.', 'Tap a DC main or facility on the map for what it relieves and the developments relying on it.', 'Export (top bar) → Excel writes the full DC timing table for a memo or spreadsheet.'],
      go: () => { MA().setMapView('dc'); SC().loadSewers(); MP().showDcTiming(); } },
    { t: 'Report on an area or secondary plan', w: 'A block plan, MTSA or secondary plan review; council or committee questions.',
      s: ['Search the plan or MTSA name and pick it — the map filters to it (on a page, Growth in an area opens at the plan).', 'Tap Report on the Showing line for a printable area report: demand, the capacity it relies on with DC timing, largest developments. On Growth in an area, Area report (PDF) reports the level it is at.', 'Or the Select an area tool (map rail): draw around any group; the summary has Area report, with the CSV, Excel and PDF versions under Export (top bar).'],
      go: () => { toMap(); AC().closeDetail(); AS().setLasso(true); } },
    { t: 'Test a site before an application exists', w: 'A pre-consultation, an inquiry, or a land use scenario.',
      s: ['The Test a site tool (map rail), then tap the map where the site is.', 'Enter units by type, jobs and site area; drag the pin to move it.', 'The panel shows its flows, pressure zone, sewer path, pumping stations and plant reserve; tick "Count it" to add it to the totals and capacity.'],
      go: () => { toMap(); AC().closeDetail(); Msr().setTool('whatif'); } },
    { t: 'Keep up with weekly changes', w: 'Monday check-ins and tracking the files you are working on.',
      s: ['This week (Home): new files and stage changes from the latest weekly update, and capital and EA dates.', '☆ Watch on any development adds it to your watchlist (the Watch tab in the sidebar).', 'Flags (sidebar) → ★ Watched or Changed this week shows just those on the map.', 'Save the setup with Export (top bar) › Save this view…; it opens from a chip at the top of Find.'],
      go: () => { if (DT().shellNarrow()) DT().toggleSidebar(true); DT().showTab('week'); } },
    { t: 'Plant and pumping station capacity over time', w: 'Allocation, servicing capacity reports, staging.',
      s: ['Servicing › Capacity: each plant\'s flow as a share of rated capacity by year (Horizon years), the 90% expansion trigger and the DC expansions.', 'Layers → Capacity: pumping station load or sewer pipe capacity, with a year slider in the legend.', 'The Scenario line switches design flows (ADWF) vs the 2025 measured annual average flows, the Booth → Clarkson diversion and more.', 'Pumping stations are checked on peak wet weather flow against firm capacity; Press and hold (or hover) a heading for what committed, reserve and room mean.'],
      go: () => { MA().setMapView('wastewater'); openAnalysis('svc', 'capacity'); } },
    { t: 'Water demand by pressure zone', w: 'Zone growth, storage and supply checks.',
      s: ['Water view: pressure zones shaded by max day growth.', 'Servicing › Network: on the system, built, approved and in-review max day by zone; Servicing › Model checks has the reported plant production and the Master Plan storage assessment.', 'Tap a zone row or a zone on the map for What loads this — every development adding demand.'],
      go: () => { MA().setMapView('water'); openAnalysis('svc', 'network'); } },
    { t: 'Existing mains and ground near a site', w: 'Connection options, a site visit, or a quick constraint check.',
      s: ['Layers → Existing network (from street zoom): watermains, sanitary and storm sewers; More settings → Size labels for diameters.', 'A development\'s Servicing tab lists every main around it with street and distance.', 'The Measure & ground profile tool (map rail): tap points for the distance and the ground profile with fall and grade.'],
      go: () => { toMap(); AC().closeDetail(); Msr().setTool('measure'); } },
    { t: 'Save, share and export', w: 'Sending a view to a colleague, or attaching numbers to a report.',
      s: ['Export (top bar) → Save this view… keeps a named setup in this browser, beside Copy share link; it then opens from a chip at the top of Find (× deletes it).', 'Share link copies a link to the exact filters, map position and open development.', 'Export (top bar) gathers every export in one menu: CSV / GeoJSON of the developments shown, the Excel workbook, print-ready PDFs (executive briefing, servicing memo, area report, comparison of the Compare tool’s items), the print map, GIS layers and the inquiry draft.', 'Export → Inquiry response draft, or Inquiry draft beside a development’s Servicing memo (its page or its Overview): one servicing inquiry draft for the open development, on the map’s Overview with the development kept (Peel › the site › the draft; × goes back to the site).'],
      go: () => { toMap(); setTimeout(() => { const b = document.getElementById('tb-export'); if (b) b.click(); }, 350); } },
    { t: 'How far to trust the numbers', w: 'Before quoting a figure.',
      s: ['Flows use Peel design criteria (editable in the Scenario control); the Scenario bar says which switches are on.', 'Capacity checks are screens, not hydraulic models: pipe-by-pipe sewer capacity is left to the Region’s model.', 'The 2026 DC capital maps are a draft; schedules change annually.', 'Records › Sources: each source, its date and the weekly snapshot.'],
      go: () => { toMap(); TB().openScenPop(); } },
  ];
  // Stage 5: "What moved where", one page for people who knew the app before the redesign. Each row:
  // [what you used, where it is now]. Old links and saved views still open the equivalent view.
  const MOVED = [
    { h: 'Where the app opens', rows: [
      ['The map with every tool', 'Full map, from Home or the top of every page. Settings › Start screen can open it straight away.'],
      ['(new)', 'Home, a briefing of what needs attention, and the workspaces (Check a site, Servicing capacity, Growth in an area, Review an FSR, Study area, This week, Projects, Old pipes). Each opens a page; its "Open the map" shows the map with only its layers.'],
      ['The search (Find on the full map; the top bar on wide screens)', 'Also at the top of every page, Home included. On a page a pick opens what it found: a development its page, a file number its page at Files (the file marked), a plan Growth in an area at the plan, a plant, station, block or zone its scope on the map, a DC project Capital › DC projects at the project. On the full map it works as before.'],
      ['Explore\u2019s "Draw an area →"', 'Draw an area at the top of every page: the map opens with the Select tool on.'],
      ['Export ▾ › Inquiry response draft', 'Also Inquiry draft beside a development’s Servicing memo. Both open the draft on the map with the development kept (Peel › the site › the draft).'],
      ['Home › Needs attention (a row opened Servicing capacity)', 'A row opens its plant, station or water system as a scope on the map, as does the first 90% trigger. Home’s Servicing figures add the first zone limit (100% of firm pumping).'],
      ['Where a development discharges (Review outlets, from the sidebar only)', 'Also Records › Data checks (Review outlets →), and "Review →" on a development’s Overview, in the "Path to the plant" row, when the development is in the review queue.'],
    ] },
    { h: 'The analysis tabs', rows: [
      ['Servicing › the Wastewater and Water chip rows (four each)', 'One row for both: Capacity · Network · Allocations · Checks.'],
      ['Wastewater › Plants & capacity; Water › Treatment & capacity', 'Servicing › Capacity: one table for plants, pumping stations and storage, with the limit year and room.'],
      ['Wastewater › Blocks and Pumping stations; Water › Pressure zones', 'Servicing › Network ("What loads this?" and "Show upstream" are there).'],
      ['Wastewater › Allocations', 'Servicing › Allocations.'],
      ['Water › Facilities', 'Servicing › Model checks.'],
      ['Water › Hydraulic check (beta)', 'Settings › Labs; once on, it is under Servicing › Model checks.'],
      ['Growth › Census & 2051 and By plan', 'Growth › Areas.'],
      ['Units on permit records vs Region figures (Growth › Census & 2051)', 'Records › Data checks.'],
      ['Capital › DC timing', 'Capital › DC timing (the name is back after a short spell as Timing).'],
      ['Growth › Timing', 'Growth › Forecast.'],
      ['Servicing › Checks; Records › Checks', 'Servicing › Model checks; Records › Data checks.'],
      ['The Projects workspace', 'DC projects.'],
      ['Capital › Construction', 'Capital › Projects.'],
      ['Capital › Funding screen and Funding levels', 'Settings › Labs (DC funding); once on, in Capital › DC projects.'],
      ['A development’s Files & history', 'Records › Files (Records is the small last tab).'],
      ['3D view, Time Box, SWMM export, Batch test sites', 'Settings › Labs.'],
      ['Heatmap; gas and hydro layers', 'Removed.'],
    ] },
    { h: 'Words and controls', rows: [
      ['Committed / Proposed / Anticipated switches in the top bar', 'The Scenario control: Count "committed only · + in review · + pre-application".'],
      ['Existing', 'On the system (2021 census).'],
      ['Built', 'Built since 2021.'],
      ['Committed', 'Committed: a site servicing or building permit (the Peel rule), everywhere but the treatment plants, which count past plan approval (MECP D-5-1); never "Approved" alone.'],
      ['Proposed', 'In review.'],
      ['Anticipated', 'Pre-application.'],
      ['Stage names: Inception · Under review · Draft / site plan approved · Completed', 'One set everywhere, the commitment ladder: Pre-application · In review · Zoning approved · Plan approved · Servicing permit · Building permit · Under construction · Built. Each file keeps the municipality\u2019s own status wording.'],
      ['Separate Permit issued and Construction rows (sidebar Stage)', 'One row, Permit / under construction (one stage); the bar above keeps both colours.'],
      ['"Under review → In review" on rows and badges', 'The stage once ("In review"); Built says since 2021 or before the census.'],
      ['Colour sites by Phase | Layer', 'Colour sites by Stage | Counted as.'],
      ['Each panel’s own layout', 'Every panel reads the same way: the answer, up to four figures, short lists, then Method and basis and Sources. Open full table shows the detailed table; Report a data issue is at the foot of every panel.'],
    ] },
  ];
  const movedHTML = () => `<p class="small muted">For people who used the app before the four tabs and the workspaces. Old links and saved views still open the equivalent view.</p>${MOVED.map(g => `<h4>${esc(g.h)}</h4><table class="moved-t small"><thead><tr><th>You used</th><th>Now</th></tr></thead><tbody>${g.rows.map(([a, b]) => `<tr><td>${esc(a)}</td><td>${esc(b)}</td></tr>`).join('')}</tbody></table>`).join('')}`;
  const QUICK_TIPS = [
    'Tap an empty part of the map, press Esc, or use Clear selection to unselect.',
    'By keyboard: Tab to the map, then the arrow keys move from one development to the next, Enter opens it and Esc clears; Shift + arrows pan, + and − zoom.',
    'Press and hold (or hover) a heading or label for what it means and where the data comes from.',
    'The north arrow switches between Peel’s road grid and north up.',
    'Search a DC project number (e.g. 25-2269) or a pumping station to jump to it.',
    'Hover a cluster for its phase counts.',
    'The summary line above the Analysis tabs always shows the totals for what is on the map.',
    'Tables in the Servicing tab keep their headers while you scroll.',
    'The PDFs under Export (top bar) — executive briefing, servicing memo, area report, comparison — open a print-ready page: use Print / Save as PDF.',
    'On a phone or tablet, Filters opens the search, filters and the developments on the map; tap it again to go back to the map.',
  ];
  // Bundle 6: Help is a page in Home's layout (Home › Reference): start here by role, what each
  // workspace answers, the task guides ("Show me" opens the full map, set up), the tour, the change log,
  // what moved where, the glossary and quick tips.
  const ROLES = [
    ['Infrastructure planner or engineer', 'Screen an application, an FSR or a pre-consultation.', ['site', 'fsr', 'tight']],
    ['Manager or director', 'What needs attention, and whether the capital program keeps up.', ['home', 'tight', 'projects']],
    ['Growth or policy analyst', 'How much is coming, where, and when.', ['growth', 'study', 'week']],
    ['Capital or asset management', 'DC projects against the capacity they relieve; ageing sewers carrying growth.', ['projects', 'pipes']],
  ];
  const ASKS = { site: 'Can this development be serviced, and what must be confirmed?', fsr: 'Does the consultant’s FSR match the app’s figures?', growth: 'How much is coming, where, and how fast?', study: 'What does a drawn area add, and what does it lean on?', tight: 'Can the system take it?', week: 'What changed since the last update?', projects: 'Is the capital program arriving in time for growth?', eaflow: 'Which EAs have led to construction?', outlook: 'When do the homes and people arrive?', coming: 'What is coming, where, when and how sure?', outlets: 'Where does each development discharge?', pipes: 'Which ageing sewers carry the most growth?' };
  function helpPage() {
    const W = root.PeelWorkspaces, label = id => (id === 'home' ? 'Home' : W && W.BY_ID && W.BY_ID[id] ? W.BY_ID[id].label : id);
    const roles = `<div class="help-roles">${ROLES.map(([r, w, ids]) => `<div class="help-role"><strong>${esc(r)}</strong><small>${esc(w)}</small><div>${ids.map(id => `<button type="button" class="btn small" data-ws-page="${id}">${esc(label(id))}</button>`).join('')}</div></div>`).join('')}</div>`;
    const asks = `<table class="help-asks small"><tbody>${Object.entries(ASKS).map(([id, q]) => `<tr><th scope="row"><button type="button" class="btn small link" data-ws-page="${id}">${esc(label(id))}</button></th><td>${esc(q)}</td></tr>`).join('')}</tbody></table>`;
    const guides = HELP.map((h, i) => `<details class="help-card"><summary><strong>${esc(h.t)}</strong><small>${esc(h.w)}</small></summary>
        <ol>${h.s.map(x => `<li>${esc(x)}</li>`).join('')}</ol><button type="button" class="btn small" data-help-go="${i}">Show me on the map</button></details>`).join('');
    const mid = `<section class="help-page" data-psec="help">
      <h3 class="ws-h">Start here</h3>${roles}
      <h3 class="ws-h">What each workspace answers</h3>${asks}
      <h3 class="ws-h">Task guides</h3><p class="small muted">Each one sets the full map up for you.</p>${guides}
      <h3 class="ws-h">More help</h3>
      <p><button type="button" class="btn small" data-help-tour="home">Tour of Home</button> <button type="button" class="btn small" data-help-tour="map">Tour of the full map</button> <button type="button" class="btn small" data-help-log>What's new: the change log</button> <button type="button" class="btn small" data-help-moved>What moved where</button> <button type="button" class="btn small" data-ws-page="guides">How it works: the guides</button> <button type="button" class="btn small" data-ws-page="glossary">Glossary</button> <button type="button" class="btn small" data-ws-page="approvals">How approvals work</button></p>
      <div id="help-log-body" aria-live="polite"></div>
      <details class="help-card help-moved" id="help-moved"><summary><strong>What moved where</strong><small>For existing users: where each tab, sub-view and control is now.</small></summary>${movedHTML()}</details>
      <h3 class="ws-h">Quick tips</h3><ul class="help-tips">${QUICK_TIPS.map(x => `<li>${esc(x)}</li>`).join('')}</ul>
    </section>`;
    return { id: 'help', eyebrow: 'Reference', name: 'How do I use this?', answer: 'Start with your question: each workspace answers one, on a page like this, and its <strong>Open the map</strong> shows the map with only the layers it needs. The <strong>Full map</strong> has every layer, filter and tool; the task guides below set it up for you.', mid,
      actions: [{ label: 'Tour of Home', attrs: { 'data-help-tour': 'home' }, primary: true }, { label: 'Tour of the full map', attrs: { 'data-help-tour': 'map' } }, { label: 'Full map', attrs: { 'data-ws-full': '' } }] };
  }
  // The Help button, the tour's Help and old links: the Help page.
  function showHelp() {
    const W = root.PeelWorkspaces; if (W && W.openPage) { W.openPage('help'); return; }
  }
  // (a guide or the tour from the page: the full map first, where they set things up)
  const toFull = () => { const W = root.PeelWorkspaces; if (document.documentElement.classList.contains('home-on') && W && W.setMode) { W.setMode('full'); return true; } return false; };
  // The Help menu's change log: render into the help view (marks the releases seen,
  // which clears the "new" dot on the Help button).
  function showHelpLog() {
    showHelp();
    CL().renderChangelog();
    setTimeout(() => { const w = $('#help-log-body'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 60);
  }
  document.addEventListener('click', e => {
    if (e.target.closest('[data-help-open]')) return showHelp();
    if (e.target.closest('[data-help-moved]')) { if (!$('#help-moved')) showHelp(); const d = $('#help-moved'); if (d) { d.open = true; setTimeout(() => d.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); } return; }
    const ht = e.target.closest('[data-help-tour]');
    if (ht && ht.dataset.helpTour === 'home') { const W = root.PeelWorkspaces; if (W && W.openPage) W.openPage('home'); return setTimeout(() => startTour('home'), 400); }
    if (ht) { const f = toFull(); AC().closeDetail(); return f ? setTimeout(() => startTour('map'), 400) : startTour('map'); }
    // Phase 3b: Help carries the change log too — same destination as the gear menu's Change log.
    if (e.target.closest('[data-help-log]')) { CL().renderChangelog(); const w = $('#help-log-body'); if (w) w.scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    const g = e.target.closest('[data-help-go]'); if (!g) return;
    const h = HELP[+g.dataset.helpGo]; if (!h) return;
    if (toFull()) setTimeout(() => h.go(), 300); else h.go();
    // On a phone the guide would cover what it just set up: close it (the topbar Help button reopens it).
    if (phoneUI() && root.PeelSvcScope.hasResult() && String(App().state.ss).startsWith('help:')) AC().closeDetail({ keepSelection: true });
  });
  let tourEl = null, tourI = 0, tourChecked = false, steps = TOUR, offerEl = null;
  // (an earlier tour seen: 'tourDone' is the map tour's, and covers the Home tour too)
  const homeDone = () => store.get('homeTourDone', store.get('tourDone', false));
  const mapDone = () => store.get('tourDone', false);
  const onHome = () => document.documentElement.classList.contains('home-on');
  // First run: on Home, the Home tour; on the full map, the map tour is offered.
  function maybeTour() {
    if (tourChecked || !App().state.projects.length) return;
    tourChecked = true;
    if (onHome()) { if (!homeDone()) setTimeout(() => { if (onHome() && !tourEl) startTour('home'); }, 1200); } else maybeMapTour();
  }
  // The first time the full map opens (after the Home tour, or without it): a card offers its tour.
  function maybeMapTour() {
    if (mapDone() || tourEl || offerEl || onHome() || store.get('mapTourOffered', false) || !App().state.projects.length) return;
    offerEl = document.createElement('div'); offerEl.className = 'tour-offer'; offerEl.setAttribute('role', 'dialog'); offerEl.setAttribute('aria-label', 'Map tour');
    offerEl.innerHTML = '<strong>New to the full map?</strong><p class="small">A 2-minute tour of the layers, the filters, the tools and a development.</p><div class="tour-btns"><button type="button" class="btn small link" data-tour-offer="no">Not now</button><button type="button" class="btn small primary" data-tour-offer="yes">Take the map tour</button></div>';
    offerEl.addEventListener('click', e => { const b = e.target.closest('[data-tour-offer]'); if (!b) return; store.set('mapTourOffered', true); offerEl.remove(); offerEl = null; if (b.dataset.tourOffer === 'yes') startTour('map'); });
    document.body.appendChild(offerEl);
  }
  function startTour(which) {
    if (offerEl) { offerEl.remove(); offerEl = null; }
    steps = which === 'home' ? HOME_TOUR : TOUR; tourI = 0;
    tourSet = { which: steps === HOME_TOUR ? 'home' : 'map', view: MA().currentView(), snap: DT().shellNarrow() ? App().getAnalysisSnap() : null, dev: typeof DevScope !== 'undefined' ? DevScope.current() : null };
    showTourStep();
  }
  let tourSet = null;
  // The tour tidies up: no development, trace or selection it opened stays, and Find is the tab again.
  function endTour() {
    store.set(tourSet && tourSet.which === 'home' ? 'homeTourDone' : 'tourDone', true);
    if (tourEl) { tourEl.remove(); tourEl = null; }
    removeEventListener('keydown', tourKey, true);
    if (tourSet) {
      AS().clearSelected();
      if (typeof DevScope !== 'undefined' && DevScope.current() && DevScope.current() !== tourSet.dev) DevScope.close();
      if (tourSet.which === 'map' && DT() && DT().showTab) DT().showTab('explore');
      if (tourSet.snap && DT().shellNarrow()) App().setAnalysisSnap(tourSet.snap);
      tourSet = null;
    }
  }
  function tourKey(e) {
    if (!tourEl) return;
    // (Enter on one of the card's own buttons is that button: Skip, Back, a role)
    if (e.key === 'Enter' && e.target && e.target.closest && e.target.closest('.tour-card button, .tour-card a')) return;
    if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); tourGo(tourI + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); e.stopPropagation(); tourGo(Math.max(0, tourI - 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTour(); }
  }
  function tourGo(i) { if (i >= steps.length) return endTour(); tourI = i; showTourStep(); }
  async function showTourStep() {
    const st = steps[tourI]; if (!st) return endTour();
    if (!tourEl) {
      tourEl = document.createElement('div'); tourEl.className = 'tour'; document.body.appendChild(tourEl);
      tourEl.addEventListener('click', e => {
        const d = e.target.closest('[data-tour-dot]');
        if (e.target.closest('[data-tour-next]')) tourGo(tourI + 1);
        else if (e.target.closest('[data-tour-back]')) tourGo(Math.max(0, tourI - 1));
        else if (d) tourGo(+d.dataset.tourDot);
        else if (e.target.closest('[data-tour-help]')) { endTour(); showHelp(); }
        else if (e.target.closest('[data-tour-skip]')) endTour();
        else { const r = e.target.closest('[data-tour-role]'); if (r) { store.set('role', r.dataset.tourRole); tourGo(tourI + 1); } }
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
    const chapters = [...new Set(steps.map(x => x.ch))], last = tourI === steps.length - 1, body = typeof st.b === 'function' ? st.b() : st.b;
    const roles = st.roles ? `<div class="tour-roles" role="group" aria-label="Your role">${TOUR_ROLES.map(([k, t]) => `<button type="button" class="btn small${store.get('role', '') === k ? ' on' : ''}" data-tour-role="${k}">${esc(t)}</button>`).join('')}</div>` : '';
    tourEl.innerHTML = `${box && !big ? `<div class="tour-hole" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>` : big ? `<div class="tour-hole big" style="left:${box.x}px;top:${box.y}px;width:${box.w}px;height:${box.h}px"></div>` : ''}
      <div class="tour-card" role="dialog" aria-live="polite" aria-label="Tour step ${tourI + 1} of ${steps.length}: ${esc(st.t)}" style="left:${cx}px;top:${cy}px;width:${cw}px">
        <div class="tour-ch">${chapters.map(c => `<span class="${c === st.ch ? 'on' : ''}">${esc(c)}</span>`).join('')}</div>
        <strong>${esc(st.t)}</strong><p>${esc(body)}</p>${roles}
        <div class="tour-dots" aria-hidden="true">${steps.map((_, i) => `<button type="button" tabindex="-1" class="${i === tourI ? 'on' : i < tourI ? 'done' : ''}" data-tour-dot="${i}" title="Step ${i + 1}"></button>`).join('')}</div>
        <div class="tour-btns"><button type="button" class="btn small link" data-tour-skip>${last ? 'Close' : 'Skip tour'}</button><span>${tourI ? '<button type="button" class="btn small" data-tour-back>← Back</button>' : ''}${last ? '<button type="button" class="btn small primary" data-tour-help>Open Help &amp; tips</button>' : st.roles ? '<button type="button" class="btn small" data-tour-next>Continue without a role →</button>' : `<button type="button" class="btn small primary" data-tour-next>${tourI ? 'Next →' : 'Start →'}</button>`}</span></div></div>`;
    const card = tourEl.querySelector('.tour-card'), [x2, y2] = place(card.offsetHeight); card.style.left = `${x2}px`; card.style.top = `${y2}px`;
    // (the role step: picking a role is the step's answer, so the keyboard starts on the roles)
    const nx = tourEl.querySelector(st.roles ? '[data-tour-role]' : '[data-tour-next], [data-tour-help]'); if (nx) nx.focus({ preventScroll: true });
  }

  const api = { maybeTour, maybeMapTour, HOME_TOUR, TOUR_ROLES, TOUR, showHelp, showHelpLog, openAnalysis, startTour, MOVED, movedHTML, helpPage, ROLES, ASKS, HELP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTips = api;
})(typeof window !== 'undefined' ? window : globalThis);
