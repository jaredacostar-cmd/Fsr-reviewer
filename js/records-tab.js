(function (root) {
  'use strict';
  // The Records tab (SPEC §5; Stage 2: the small trailing tab), with Sources · Data checks · Files:
  //   Peel / municipality / plan: Sources (freshness, reports) and Data checks (duplicates, the data
  //                               checks, then the servicing model: navigation phase 2);
  //   a development:              one view, its files and history (the panel: the tree, on this site,
  //                               latest activity, related applications, the files and events; the
  //                               full table: every file, related application, how the stage was set
  //                               and the source records; navigation phase 5);
  //   a single file:              the file: its source record, every field, its provenance;
  //   a plant / station / block / zone / water system: its own Sources (its capacity's source and date,
  //                               its map layer, the sources it rests on) and Data checks (the 2025 report
  //                               against the model, the Ministry's flow, the station roster), each loading
  //                               when needed (navigation phase 8a);
  //   a DC work, a tool's result: no files of its own (its developments are in Overview; each opens to
  //                               its records; Peel's sources and checks below, until navigation phase 8b).
  const { $, esc, fmtNum, fmt1 } = root.PeelUtil;
  const App = () => root.PeelApp;
  const DU = () => root.PeelDemandUI;
  const SS = () => root.PeelSvcScope;
  const DD = () => root.PeelDevDetail;
  const AC = () => root.PeelAerialCheck;
  const SC = () => root.PeelSvcCapacity;
  const DN = () => root.PeelDevNav;
  const SD = () => root.PeelSvcData;

  // Records › Sources: what each source is and how fresh it is, and the reports the model rests on.
  function sourcesHTML() {
    return `${DU().freshnessHTML()}${root.PeelSvcPlants && root.PeelSvcPlants.refsHTML ? root.PeelSvcPlants.refsHTML() : ''}`;
  }
  // Records › Data checks: the data checks (the model against published totals, the permit check, the
  // accuracy of the statuses). The duplicate check and its pass/fail list are the panel below
  // (#audit-panel, js/data-tab.js renderAudit, redrawn after each rebuild). The servicing model's
  // checks are the pane below that (#svc-checks-body, js/svc-capacity.js renderChecks; was Servicing ›
  // Model checks). Review outlets (QA/QC: where each development discharges) opens from here too
  // (navigation design §9 #5, AD-5), as from a site's path line and the sidebar.
  const OUTLETS = { what: 'Where each development discharges: confirm the automatic outlet or set it on the map', btn: '<button type="button" class="btn small link" data-ws-page="outlets">Review outlets →</button>' };
  function checksHTML() {
    const acc = root.ModelChecks && typeof root.ModelChecks.accuracy === 'string' ? root.ModelChecks.accuracy : '';
    return `${DU().checksHTML ? DU().checksHTML() : ''}${acc}<p class="small muted">${OUTLETS.what}: ${OUTLETS.btn}</p>`;
  }
  const peelHTML = () => `${sourcesHTML()}${checksHTML()}`;

  function fileHTML(r, p) {
    return `<div class="head"><h3>${esc(r.ref || r.address || 'Record')}</h3><div class="m">${esc(r.kind === 'permit' ? 'Building permit' : r.type || 'Planning application')} · ${esc(r.municipality)}${p ? ` · in ${esc(p.title)}` : ''}</div></div>
      <h2 class="section-title">Source</h2>${DD().recordProvHTML(r)}
      <table class="rec-table">${DD().recordRows(r)}</table>${root.PeelAddr ? root.PeelAddr.noteHTML(r) : ''}`;
  }

  // Bundle 6: the old Data tab's panels (refresh and manage sources; the duplicate check) under
  // Records › Sources and Records › Data checks, at Peel scope.
  function showData(which) {
    const s = $('#rec-data-sources'), c = $('#rec-data-checks');
    if (s) s.hidden = which !== 'sources';
    if (c) c.hidden = which !== 'checks';
    if (which === 'checks' && root.PeelDataTab && root.PeelDataTab.renderAudit) root.PeelDataTab.renderAudit();
  }
  function render() {
    const body = $('#records-body'); if (!body || !App() || !App().state) return;
    const scoped = typeof DevScope !== 'undefined' && DevScope.current();
    // A development: its files and history, the full table drawn here (js/devtab.js render, data-dev set),
    // the panel from filesPanelSpec.
    if (scoped) { showData(null); if (root.DevTab && root.DevTab.render) root.DevTab.render(body); if (root.PeelPanel) root.PeelPanel.set('records:files', filesPanelSpec(scoped)); return; }
    // (no development here: DevScope's next render must not write over a file's record or the sources)
    delete body.dataset.dev;
    const s = SS() && SS().current();
    if (s && s.kind === 'result' && s.rkind === 'file' && AC().currentFile) {
      const f = AC().currentFile(); if (f) { showData(null); body.innerHTML = fileHTML(f.r, f.p); return; }
    }
    // Peel, a municipality or plan, or a result with no files of its own: Sources or Checks.
    const AT = root.PeelAnalysisTabs, sub = AT && AT.getRSub ? AT.getRSub() : 'sources';
    // (a servicing scope: its own sources and checks, Peel's servicing model group emptied; Peel's live-data controls
    // and duplicate check are Peel's, navigation phase 8a)
    if (s && s.kind !== 'result') { showData(null); body.innerHTML = svcHTML(s, sub); if (SC() && SC().renderChecks) SC().renderChecks(); if (root.PeelPanel) root.PeelPanel.set(`records:${sub === 'checks' ? 'checks' : 'sources'}`, sub === 'checks' ? svcChecksSpec(s) : svcSourcesSpec(s)); return; }
    const note = s ? `<p class="small muted">${esc(s.title)} has no files of its own. Its developments are listed in Overview; each opens to its own records. Below: the ${sub === 'checks' ? 'checks' : 'sources'} for all of Peel.</p>` : '';
    body.innerHTML = note + (sub === 'checks' ? checksHTML() : sourcesHTML());
    if (sub === 'checks' && root.PeelSvcCapacity && root.PeelSvcCapacity.renderChecks) root.PeelSvcCapacity.renderChecks();   // (its Servicing model group)
    showData(sub === 'checks' ? 'checks' : 'sources');
    if (root.PeelPanel) root.PeelPanel.set(`records:${sub === 'checks' ? 'checks' : 'sources'}`, sub === 'checks' ? checksPanelSpec() : sourcesPanelSpec());
  }
  // ---- Stage 3: the Records panels -----------------------------------------------------------------
  const ST_WORD = { ok: ['room', 'Current'], due: ['tight', 'Due'], stale: ['over', 'Stale'], ref: [null, 'Reference'], na: [null, 'Loads when needed'] };
  function sourcesPanelSpec() {
    const s = SS() && SS().current(); if (s && s.kind !== 'result') return svcSourcesSpec(s);
    const PN = root.PeelPanel, fr = DU().freshness(), due = fr.filter(r => r.st === 'due' || r.st === 'stale'), apps = fr[0];
    return {
      fullTitle: 'Records › Sources: every source, its date and the reports behind the criteria',
      head: PN.areaHead('Records › Sources', 'Where does the data come from?', due.length ? { tone: 'tight', text: `${due.length} due` } : { tone: 'room', text: 'Current' }, `${fmtNum(fr.length)} sources`),
      answer: due.length ? `<strong>${due.length}</strong> source${due.length === 1 ? ' is' : 's are'} due for an update: ${due.map(r => esc(r.name)).join(', ')}.` : `All data sources are current${apps && apps.date ? `; applications as of <strong>${esc(apps.date)}</strong>` : ''}.`,
      figures: [{ v: fmtNum(fr.length), u: 'sources', label: 'listed', ctx: '' }, { v: due.length, u: '', label: 'due or stale', ctx: '', tone: due.length ? 'tight' : 'room' }, ...(apps && apps.date ? [{ v: esc(apps.date), u: '', label: 'applications as of', ctx: `${esc(apps.every)} updates` }] : [])],
      lists: [{ title: 'Sources', rows: fr.slice(0, 5).map(r => { const [tone, word] = ST_WORD[r.st] || ST_WORD.ref; return PN.kv(esc(r.name), `${r.date ? esc(r.date) : '–'} · ${word}`, tone); }), total: fr.length, seeAll: { 'data-full-table': 'records' } }],
      // Every data file's receipt: its source links, its date and its fingerprint (js/sources.js).
      folds: root.PeelSources ? [{ title: 'Every data file: its source, date and fingerprint', html: root.PeelSources.slotHTML() }] : [],
      method: 'Each source with the date of the data the app holds and how often it is refreshed; due = past its refresh interval, stale = past twice that. The reports behind the design criteria and the comparisons are listed in the full table. Every data file\u2019s source link, date and SHA-256 fingerprint are under Every data file; Copy citation gives one line to quote.',
      sources: 'Municipal open data (applications, permits, plans), Region of Peel open data and reports, Statistics Canada, CMHC, the Ministry of Finance.',
      // (bundle 6: the old Data tab's refresh and source list are in the full table)
      foot: { primary: { label: 'Refresh and manage sources', attrs: { 'data-full-table': 'records' }, title: 'Refresh live, switch or add a source (was the Data tab)' }, secondary: [{ label: 'Copy share link', attrs: { 'data-share': '' } }] },
    };
  }
  function checksPanelSpec() {
    const s = SS() && SS().current(); if (s && s.kind !== 'result') return svcChecksSpec(s);
    const PN = root.PeelPanel, a = App().state.audit, pc = root.PeelCensusView && root.PeelCensusView.permitCheck ? root.PeelCensusView.permitCheck() : null;
    const fails = a ? a.checks.filter(c => c.value) : [], pFail = pc && pc.rows ? pc.rows.filter(r => !r.pass) : [];
    // The Servicing model group (js/svc-capacity.js checksRows), and Review outlets' count only once the DC
    // impact model is worked out in the visit (building it walks every sewer pipe, js/dc-impact.js).
    const svc = SC() && SC().checksRows ? SC().checksRows() : [];
    const IM = root.PeelDcImpact, DO = root.PeelDevOutlets, q = IM && IM.current && IM.current() && DO && DO.queue ? DO.queue() : null, n = q ? q.all.filter(x => !x.rec).length : null;
    return {
      fullTitle: 'Records › Data checks: duplicates, published totals, permit counts, the accuracy report and the servicing model',
      head: PN.areaHead('Records › Data checks', 'Can the data be trusted?', fails.length || pFail.length ? { tone: 'tight', text: `${fails.length + pFail.length} to review` } : { tone: 'room', text: 'Pass' }, a ? `${fmtNum(a.records.raw)} records → ${fmtNum(a.records.unique)} files → ${fmtNum(a.records.projects)} developments` : 'Checks run once the full data has loaded'),
      answer: a ? `${fmtNum(a.records.raw)} records make <strong>${fmtNum(a.records.projects)}</strong> developments; <strong>${fmtNum(a.possible.length)}</strong> possible duplicate pair${a.possible.length === 1 ? '' : 's'} to review${pFail.length ? `; permit counts differ from Region figures for ${pFail.map(r => esc(r.m)).join(' and ')}` : ''}.` : 'The checks run once the full data has loaded.',
      figures: a ? [{ v: fmtNum(a.records.raw), u: 'records', label: 'read', ctx: '' }, { v: fmtNum(a.records.unique), u: 'files', label: 'unique', ctx: '' }, { v: fmtNum(a.possible.length), u: 'pairs', label: 'possible duplicates', ctx: 'to review in the duplicate check', tone: a.possible.length ? 'tight' : 'room' }, { v: fails.length, u: '', label: 'checks flagged', ctx: '', tone: fails.length ? 'tight' : 'room' }] : [],
      lists: [...(a ? [{ title: 'Checks', rows: a.checks.slice(0, 5).map(c => PN.kv(esc(c.label), `${c.value ? '✕' : '✓'} ${fmtNum(c.value)}`, c.value ? 'tight' : 'room')), total: a.checks.length, seeAll: { 'data-full-table': 'records' } }] : []),
        { title: 'Servicing model', rows: svc.length ? svc : [{ html: '<span class="small muted">The servicing model loads with the servicing data.</span>' }], total: svc.length || 1, seeAll: { 'data-full-table': 'records', 'data-ft-go': '2020 Master Plan vs this tracker' } },
        { title: 'Where developments discharge', rows: [{ attrs: { 'data-ws-page': 'outlets', title: 'Review outlets: check and fix where each development discharges' }, html: `<div class="pnl-r-top"><span class="pnl-r-name">Review outlets →</span>${n == null ? '' : `<span class="pnl-r-fig">${fmtNum(n)}<small>to review</small></span>`}</div><small class="pnl-r-line">${OUTLETS.what}</small>` }], total: 1 }],
      method: 'Records read from each municipality are grouped into unique files and developments; the checks count what could not be placed or matched. The model against published totals, the permit check (fail beyond 25%) and the accuracy report are in the full table. The servicing model: the 2020 Master Plan, the 2025 reports, the Ministry\u2019s plant flow and the station roster (full table, Servicing model). Calibration factor = (reported − external inflows) ÷ the model today (census + built since, residential + development jobs), applied in the capacity check mode; I&amp;I is not scaled. Review outlets counts the developments still to review once Capital › DC timing has worked out the DC model.',
      sources: 'The municipal application and permit records; Region of Peel published totals and permit figures; for the servicing model, the 2020 Water and Wastewater Master Plan, the 2025 annual reports, the Ministry\u2019s plant flow data and the Wastewater Collection System report.',
      foot: { primary: { label: 'Duplicate check', attrs: { 'data-full-table': 'records', 'data-ft-go': 'Units: every record' }, title: 'The duplicate check and the possible duplicate pairs (was the Data tab)' }, secondary: [{ label: 'Review outlets', attrs: { 'data-ws-page': 'outlets' }, title: 'Where each development discharges (QA/QC)' }] },
    };
  }
  // ---- A servicing scope's own Records (navigation phase 8a, design §3.5, §4 #7) -----------------------------
  // A plant, pumping station, wastewater block, pressure zone or water system. Sources: where its capacity comes
  // from and its date, its map layer, the rows of Peel's freshness table it rests on (SVC_SRC, by name: a test
  // holds each pattern to one row of js/demand-ui.js freshness). Data checks: its slice of the Servicing model
  // group (a plant: the 2025 report against the model, the Ministry's flow, its stations against the collection
  // system report's roster; a station: the roster; South Peel: its 2025 production; a zone or a block: none). The
  // Ministry's flow and the roster load after the servicing data (js/svc-data.js draws Records again as each
  // lands): "Loads when needed" meanwhile. Its overflows and measured flow stay on its Overview (owner decision
  // 11); Peel's live-data controls and duplicate check stay Peel's (owner decision 7); Review outlets is Peel's
  // queue, the footer's (owner decision 5).
  const SRC = {
    apps: /^Planning applications and building permits$/, census: /^\d{4} Census \(dissemination areas\)$/,
    reports: /^Peel \d* ?annual reports \(plants, water\)$/, mp: /^2020 Water and Wastewater Master Plan$/,
    flow: /^Measured plant flow /, effluent: /^Plant effluent compliance /, layer: /^Pressure zones, pumping stations, plants$/,
    blocks: /^Wastewater blocks /, sewers: /^Sanitary sewer network /, mains: /^Water supply mains /, dcmaps: /^2026 DC capital maps /,
  };
  const SVC_SRC = Object.fromEntries(Object.entries({
    plant: ['apps', 'census', 'reports', 'mp', 'flow', 'effluent', 'layer', 'blocks', 'sewers', 'dcmaps'],
    ps: ['apps', 'census', 'mp', 'layer', 'sewers', 'dcmaps'],
    block: ['apps', 'census', 'blocks', 'sewers', 'dcmaps'],
    zone: ['apps', 'census', 'layer', 'mains', 'dcmaps'],
    wsys: ['apps', 'census', 'reports', 'mp', 'layer', 'mains', 'dcmaps'],
  }).map(([k, v]) => [k, v.map(n => SRC[n])]));
  const LOADS = 'Loads when needed';
  const KIND_WORD = { plant: 'plant', ps: 'pumping station', block: 'wastewater block', zone: 'pressure zone', wsys: 'water system' };
  const kindLabel = s => esc(((SS() && SS().KIND_LABEL) || {})[s.kind] || KIND_WORD[s.kind] || '');
  const hl = h => (root.PeelUtil.hlP ? root.PeelUtil.hlP(h) : `<p>${h}</p>`);
  const f1 = v => (fmt1 ? fmt1(v) : (+v).toFixed(1));
  const nameOf = a => (SD() && SD().drName ? SD().drName(a) : a.name) || '';
  // A plant's traced pumping stations (the servicing data's sewersheds).
  const stationsOf = pl => (((App().state.servicing || {}).psAreas) || []).filter(a => a.plant === pl).map(nameOf);
  // Where its capacity comes from, its outline's layer, the sources it rests on: { cap, asOf, layer, rows }.
  function svcSources(s) {
    const A = App(), R = A.state.reports, C = root.PeelCapacity, fr = DU().freshness();
    const rows = fr.filter(r => (SVC_SRC[s.kind] || []).some(re => re.test(r.name)));
    const blk = s.kind === 'block' || (s.kind === 'plant' && !!(A.state.servicing && A.state.servicing.blocks));
    const lr = fr.find(r => (blk ? SRC.blocks : SRC.layer).test(r.name));
    const layer = { name: lr ? lr.name : '', date: lr ? lr.date : null, file: blk ? 'data/blocks.json' : 'data/servicing.json' };
    const MP = 'the 2020 Water and Wastewater Master Plan';
    let cap = '', asOf = null;
    if (s.kind === 'plant') {
      const p = R && R.wastewater && R.wastewater.plants && R.wastewater.plants[s.pl];
      cap = p ? `rated capacity <strong>${f1(p.ratedMLd)} ML/d</strong> (annual average) from the Region’s ${esc(R.year)} annual report (${esc(p.name)}); its 90% expansion trigger from ${MP}` : 'its rated capacity comes from the Region’s annual report, which loads with the servicing data';
      asOf = p ? String(R.year) : null;
    } else if (s.kind === 'ps') {
      const k = C && C.of ? C.of(`ps:${s.a.id}`) : null;
      cap = k && k.firm != null ? `firm capacity <strong>${fmtNum(Math.round(k.firm))} L/s</strong> (the largest pump out of service) from ${MP} (Vol. 4, Table 6)` : `no firm capacity on record for this station in ${MP}`;
      asOf = k && k.firm != null ? '2020' : null;
    } else if (s.kind === 'wsys') {
      const sp = R && R.water && R.water.southPeel;
      cap = sp ? `rated treatment <strong>${f1(sp.plants.reduce((t, p) => t + p.ratedMLd, 0))} ML/d</strong> (${sp.plants.map(p => esc(p.name)).join(' + ')}) and the ${esc(R.year)} maximum day ${f1(sp.maxDayMLd)} ML/d from the Region’s ${esc(R.year)} annual report; its 90% expansion trigger from ${MP}` : 'its rated treatment comes from the Region’s annual report, which loads with the servicing data';
      asOf = sp ? String(R.year) : null;
    } else if (s.kind === 'zone') {
      cap = `no published capacity of its own: its maximum day is worked out here from the census and the developments in it, at Peel design criteria (supplied by ${s.lake ? 'the South Peel water system' : 'its own well system'})`;
    } else {
      cap = `no published capacity of its own: its flow is worked out here from the census and the developments in it and upstream, at Peel design criteria${s.a && s.a.trunkMm ? `; the sewer at its outlet is ${fmtNum(s.a.trunkMm)} mm (pipe capacity not assessed)` : ''}`;
    }
    return { cap, asOf, layer, rows };
  }
  // Its checks, in Records › Data checks' words (js/svc-capacity.js checksRows): { name, value, tone, go, loading },
  // go the heading of its section in the full table; "Loads when needed" (no tone) while its data file is out.
  const grade = d => (Math.abs(d) <= 2 ? ['room', 'Matches'] : Math.abs(d) <= 5 ? ['tight', 'Close'] : ['over', 'Differs']);
  function svcChecks(s) {
    const A = App(), M = A.state.svcModel, R = A.state.reports, WE = root.PeelWwEvents, out = [];
    const row = (name, value, tone, go) => out.push({ name, value: value == null ? LOADS : value, tone: value == null ? null : tone || null, go, loading: value == null });
    const ev = !!(A.state.wwEvents && WE && WE.onRoster);
    if (s.kind === 'plant') {
      const c = M && M.plantCap ? M.plantCap(s.pl) : null;
      row('2025 annual report vs the model', !M || !R ? null : M.mode === 'calibrated' && c && c.f ? `measured ${c.f.toFixed(2)} times the model’s flow` : 'design flows: the capacity check shows the factor', null, '2025 annual reports vs.');
      const pf = A.state.plantFlows, pc = pf ? (pf.checks || []).filter(x => x.plant === s.pl).sort((a, b) => String(b.year).localeCompare(String(a.year)))[0] : null;
      row('Plant flow: Ministry data vs the annual report', !pf ? null : !pc ? 'not in the Ministry’s file' : `${pc.year}: ${pc.diffPct >= 0 ? '+' : '−'}${Math.abs(pc.diffPct).toFixed(1)}% · ${grade(pc.diffPct)[1]}`, pc ? grade(pc.diffPct)[0] : null, 'Plant flow: Ministry data');
      const names = stationsOf(s.pl), on = ev ? names.filter(n => WE.onRoster(n)).length : 0;
      row('Pumping stations: GIS layer vs the collection system report', !ev ? null : names.length ? `${on} of ${names.length} on the report’s roster` : 'no traced pumping station drains here', names.length ? (on === names.length ? 'room' : 'tight') : null, 'Pumping stations: open GIS layer');
    }
    if (s.kind === 'ps') {
      const r = ev ? WE.onRoster(nameOf(s.a)) : null;
      row('On the collection system report’s roster', r == null ? null : r ? 'on the report’s roster' : 'not on the report’s roster (a leachate, septage or lift station, or one outside the approval?)', r ? 'room' : 'tight', 'Pumping stations: open GIS layer');
    }
    if (s.kind === 'wsys') {
      const sp = R && R.water && R.water.southPeel;
      row('2025 water production', sp ? `South Peel maximum day ${f1(sp.maxDayMLd)} of ${f1(sp.plants.reduce((t, p) => t + p.ratedMLd, 0))} ML/d rated (incl. York supply)` : null, null, 'Reported 2025 production');
    }
    return out;
  }
  const scopeTrail = (s, where) => [{ label: 'Peel', attrs: { 'data-ss-close': '' } }, { label: s.short, attrs: { 'data-at': 'overview' } }, { label: where }];
  function svcSourcesSpec(s) {
    const PN = root.PeelPanel, x = svcSources(s), due = x.rows.filter(r => r.st === 'due' || r.st === 'stale');
    return {
      fullTitle: `${s.title} · Records › Sources: where its figures come from`,
      head: { trail: scopeTrail(s, 'Records › Sources'), close: { 'data-ss-close': '' }, name: 'Where do its figures come from?', status: due.length ? { tone: 'tight', text: `${due.length} due` } : { tone: 'room', text: 'Current' }, identity: kindLabel(s) },
      answer: `<strong>${esc(s.title)}</strong>: ${x.cap}; its outline: ${esc(x.layer.name || x.layer.file)}${x.layer.date ? ` (as of ${esc(x.layer.date)})` : ''}.`,
      figures: [{ v: fmtNum(x.rows.length), u: 'sources', label: 'it rests on', ctx: '' }, { v: due.length, u: '', label: 'due or stale', ctx: '', tone: due.length ? 'tight' : 'room' }, ...(x.asOf ? [{ v: esc(x.asOf), u: '', label: 'its capacity as of', ctx: '' }] : [])],
      lists: [{ title: 'The sources it rests on', rows: x.rows.slice(0, 5).map(r => { const [tone, word] = ST_WORD[r.st] || ST_WORD.ref; return PN.kv(esc(r.name), `${r.date ? esc(r.date) : '–'} · ${word}`, tone); }), total: x.rows.length, seeAll: { 'data-full-table': 'records' } }],
      method: `Its capacity with the report or plan it comes from, and that report’s date; its outline’s map layer (${x.layer.file}); then the rows of Peel’s data freshness table its figures rest on, each with the date of the data the app holds and how often it is refreshed (due = past its refresh interval, stale = past twice that). All of Peel’s sources, the live-data controls and every data file’s fingerprint are Peel’s Records › Sources.`,
      sources: 'Region of Peel 2025 annual reports; the 2020 Water and Wastewater Master Plan; the servicing areas and the blocks (data/servicing.json, data/blocks.json); the census and the applications on the map.',
      foot: { primary: { label: 'All of Peel’s sources', attrs: { 'data-ss-close': '', 'data-at': 'records:sources' }, title: 'Records › Sources for all of Peel: every source, the reports and the live-data controls' }, secondary: [{ label: 'Copy share link', attrs: { 'data-share': '' } }] },
    };
  }
  function svcChecksSpec(s) {
    const PN = root.PeelPanel, rows = svcChecks(s), loading = rows.filter(r => r.loading).length, review = rows.filter(r => r.tone === 'tight' || r.tone === 'over').length;
    const none = `No published figure to check ${esc(s.title)} against: a ${KIND_WORD[s.kind]}’s figures are worked out here, from the census and the developments.`;
    return {
      fullTitle: `${s.title} · Records › Data checks: its figures against the reports`,
      head: { trail: scopeTrail(s, 'Records › Data checks'), close: { 'data-ss-close': '' }, name: 'Can its figures be trusted?', status: !rows.length || loading === rows.length ? null : review ? { tone: 'tight', text: `${review} to review` } : { tone: 'room', text: 'Pass' }, identity: kindLabel(s) },
      answer: rows.length ? `<strong>${rows.length}</strong> check${rows.length === 1 ? '' : 's'} of ${esc(s.title)}’s figures${loading ? `; ${loading} load${loading === 1 ? 's' : ''} when needed` : ''}.` : none,
      figures: rows.length ? [{ v: rows.length, u: rows.length === 1 ? 'check' : 'checks', label: 'of its figures', ctx: '' }, { v: review, u: '', label: 'to review', ctx: '', tone: review ? 'tight' : 'room' }, ...(loading ? [{ v: loading, u: '', label: 'load when needed', ctx: 'their data files load after the servicing data' }] : [])] : [],
      lists: [{ title: 'Its checks', rows: rows.length ? rows.map(r => ({ ...PN.kv(esc(r.name), esc(r.value), r.tone), attrs: { 'data-full-table': 'records', 'data-ft-go': r.go } })) : [{ html: `<span class="small muted">${none}</span>` }], total: rows.length || 1, ...(rows.length ? { seeAll: { 'data-full-table': 'records', 'data-ft-go': rows[0].go } } : {}) }],
      method: 'A plant: the Region’s 2025 annual report against the model (the calibration factor, measured ÷ modelled, applied in the capacity check mode), the Ministry’s measured flow against the report (within ±2%: matches) and its traced pumping stations against the collection system report’s roster (Appendix A). A pumping station: its place on that roster. South Peel: its 2025 production. The Ministry’s flow and the roster load after the servicing data: Loads when needed until they are in. Its overflows and measured flow since 2008 are on its Overview.',
      sources: 'Region of Peel 2025 annual reports; the Ministry’s Municipal Treated Wastewater Effluent data; the Wastewater Collection System report.',
      foot: { primary: { label: 'Peel’s data checks', attrs: { 'data-ss-close': '', 'data-at': 'records:checks' }, title: 'Records › Data checks for all of Peel: duplicates, published totals and the servicing model' }, secondary: [{ label: 'Review outlets', attrs: { 'data-ws-page': 'outlets' }, title: 'Where each development discharges (QA/QC)' }] },
    };
  }
  // The full table (#records-body): Sources, its capacity and the freshness rows it rests on; Data checks, its
  // sections of the Servicing model group (each a "Loads when needed" line while its data file is out).
  function svcHTML(s, sub) {
    const A = App(), MC = root.ModelChecks || {}, WE = root.PeelWwEvents, title = esc(s.title);
    const loads = (h, what) => `${h}<p class="small muted">${LOADS}: ${what}.</p>`;
    if (sub !== 'checks') {
      const x = svcSources(s);
      return `${hl(`<strong>${title}</strong>: ${x.cap}.`)}
      <p class="small">Its outline: ${esc(x.layer.name || 'the servicing layer')} (${x.layer.file}${x.layer.date ? `, as of ${esc(x.layer.date)}` : ''}).</p>
      <h3 class="sub-title" data-info="data-freshness">Data freshness: the sources it rests on</h3>
      ${DU().freshTableHTML(x.rows)}
      <p class="small muted">The rows of Peel’s data freshness table this ${KIND_WORD[s.kind] || 'scope'}’s figures rest on; all of Peel’s, with the reports behind the criteria, are Peel’s Records › Sources.</p>`;
    }
    const PF_H = '<h3 class="sub-title">Plant flow: Ministry data against the Region\'s annual reports</h3>', RO_H = '<h3 class="sub-title">Pumping stations: open GIS layer against the collection system report</h3>';
    if (s.kind === 'plant') {
      const rep = typeof MC.wwReportsVsModelFor === 'function' ? MC.wwReportsVsModelFor(s.pl) : '';
      const pf = A.state.plantFlows ? (root.PeelPlantFlows && root.PeelPlantFlows.checksHTML(s.pl)) || `${PF_H}<p class="small">${title} is not in the Ministry’s file of checks against the annual reports.</p>` : loads(PF_H, 'the Ministry’s plant flow data (data/plant-flows.json)');
      const ro = A.state.wwEvents && WE && WE.rosterHTML ? WE.rosterHTML(stationsOf(s.pl)) : loads(RO_H, 'the collection system report’s station roster (data/ww-events.json)');
      return `${rep || loads('<h3 class="svc-sub">2025 annual reports vs. the model</h3>', 'the 2025 annual reports and the servicing model')}${pf}${ro}`;
    }
    if (s.kind === 'ps') return A.state.wwEvents && WE && WE.rosterHTML ? WE.rosterHTML([nameOf(s.a)]) : loads(RO_H, 'the collection system report’s station roster (data/ww-events.json)');
    if (s.kind === 'wsys') { let w = ''; try { w = typeof MC.waterProduction === 'function' ? MC.waterProduction() : ''; } catch (e) { w = ''; } return w || loads('<h3 class="svc-sub">Reported 2025 production</h3>', 'the 2025 annual reports'); }
    return `<p class="small">No published figure to check ${title} against: a ${KIND_WORD[s.kind]}’s figures are worked out here, from the census and the developments.</p>`;
  }
  // Failing checks as one caveat line each (Home, Stage 4): sources due for a refresh, permit counts
  // off the Region's figures, data checks flagged. Each opens the Records sub-view that explains it.
  function caveats() {
    const out = [], fr = DU().freshness ? DU().freshness() : [], due = fr.filter(r => r.st === 'due' || r.st === 'stale');
    if (due.length) out.push({ text: `${due.length} data source${due.length === 1 ? ' is' : 's are'} due for a refresh: ${due.map(r => r.name).join(', ')}.`, at: 'records:sources' });
    const pc = root.PeelCensusView && root.PeelCensusView.permitCheck ? root.PeelCensusView.permitCheck() : null, pFail = pc && pc.rows ? pc.rows.filter(r => !r.pass) : [];
    if (pFail.length) out.push({ text: `Permit counts differ from Region figures for ${pFail.map(r => r.m).join(' and ')}.`, at: 'records:checks' });
    const a = App().state.audit, fails = a ? a.checks.filter(c => c.value) : [];
    if (fails.length) out.push({ text: `${fails.length} data check${fails.length === 1 ? '' : 's'} flagged (${fails.map(c => c.label).join(', ')}).`, at: 'records:checks' });
    return out;
  }
  // A development's files and history (one view, navigation phase 5): the tree, on this site, the latest
  // activity, the related applications (was the full table's only) and the files and events (the Gantt chart
  // and the dated events, moved from the Overview; About stays there). The full table: every file in tree
  // order, related applications, how the stage was set and the source records.
  function filesPanelSpec(p) {
    const PN = root.PeelPanel, PH = root.PeelPhases, FT = root.PeelFileTree, files = (p.records || []).filter(r => r.kind === 'application'), permits = (p.records || []).filter(r => r.kind === 'permit');
    const day = d => (d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
    const sorted = PH && PH.newestFirst ? PH.newestFirst(files) : files.slice();
    const plain = t => (PN.typeWords ? PN.typeWords(t) : t);
    const latest = sorted.slice(0, 5).map(r => PN.kv(`<strong>${esc(r.ref || 'file')}</strong>${r.type ? ` <small>${esc(plain(r.type))}</small>` : ''}`, `${r.units ? `${fmtNum(r.units)} unit${r.units === 1 ? '' : 's'} · ` : ''}${r.statusRaw ? `municipal status: ${esc(r.statusRaw)}` : esc((PH && PH.PHASE_BY_KEY[r.phase] || {}).label || r.phase || '')}${(t => (t ? ` · ${esc(day(t))}` : ''))(PH && PH.submittedAt ? PH.submittedAt(r) : null)}`));
    // Site → proposal → file (js/sites.js): the other proposals on its land, then the site's other
    // activity (a patio, a fit-out), each opening its own page.
    const TG = root.PeelTreeGroups, all = root.PeelApp && root.PeelApp.state && root.PeelApp.state.projects;
    const site = TG && TG.siteParts ? TG.siteParts(p, all && (all.all || all)) : [];
    const siteRow = q => PN.kv(`<button type="button" class="btn small link" data-pnl-dev="${esc(q.key)}"><strong>${esc(q.title)}</strong></button>${q.siteActivity ? ' <small>other activity</small>' : ''}`,
      `${q.units > 0 ? `${fmtNum(q.units)} homes · ` : ''}${esc((PH && PH.PHASE_BY_KEY[q.phase] || {}).label || q.phase || '')}${(q.records || []).some(r => r.kind === 'application') ? ` · ${esc((q.records.find(r => r.kind === 'application') || {}).ref || '')}` : ''}`);
    const siteList = site.length ? [{ title: `On this site${site.length > 5 ? ` (5 of ${site.length})` : ''}`, rows: site.slice(0, 5).map(siteRow), total: Math.min(5, site.length) }] : [];
    // Other developments with a file on the same land (not on this site), largest first: the twelve the full
    // table lists (js/devtab.js filesHTML), each opening as the scope.
    const onSite = new Set(site.map(q => q.key)), rel = (DN() && DN().relatedProjects ? DN().relatedProjects(p) : []).filter(x => !onSite.has(x.q.key)).slice(0, 12);
    const HOW = { 'same address': 'same address as', 'covers it': 'covers', 'within it': 'within', 'overlapping land': 'overlaps' };
    const relRow = ({ q, hits }) => ({ attrs: { 'data-pnl-dev': q.key }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(q.title)}</span>${q.units > 0 ? `<span class="pnl-r-fig">${fmtNum(q.units)}<small>homes</small></span>` : ''}</div><small class="pnl-r-line">${esc((PH && PH.PHASE_BY_KEY[q.phase] || {}).label || q.phase || '')}${hits[0] ? ` · ${esc(HOW[hits[0].how] || hits[0].how)} ${esc(hits[0].m.ref || '')}` : ''}</small>` });
    const relList = rel.length ? [{ title: 'Related applications', rows: rel.slice(0, 5).map(relRow), total: rel.length, seeAll: { 'data-full-table': 'records', 'data-ft-go': 'Related applications' } }] : [];
    // (the files and events: the Gantt chart with each file's events and source record, then every dated event)
    const DT = root.DevTab, folds = [{ title: 'Files and events', id: 'pnl-hist', open: true, html: DT && DT.partHTML ? DT.partHTML(p, 'story') : '' }];
    const onMount = () => { if (DT && DT.fillParts) DT.fillParts(p, ['story']); };
    // Bundle 6: the files as a tree (the tree build), the latest activity under it; the flat list
    // where the development has no tree entry (the tree counts did not load, or a development of
    // permits only).
    const d = FT && FT.of(p);
    if (d) {
      const s = FT.summary(d), recOf = FT.recLookup(p), mainN = FT.nodeOf(d, s.root), rr = (mainN && recOf(mainN)) || {};
      const rootTxt = `<strong>${esc(s.root)}</strong>${rr.type ? ` (${esc(plain(rr.type))}${rr.statusRaw ? `, municipal status: ${esc(rr.statusRaw)}` : ''})` : ''}`;
      // The homes are the development's (p.units), as the Overview says them: net of the homes the site
      // demolishes (the tree's own count is the gross), or counted from its files and permits where the
      // tree's count is not used (its files differ from the build, or a count was entered).
      const u = p.units || 0, lost = p.unitsLost > 0 ? p.unitsLost : 0, notTree = !(p.count && p.count.mode === 'tree');
      const why = notTree ? `, counted from its files and permits${lost ? `, net of ${fmtNum(lost)} demolished` : ''}` : lost ? `, net of ${fmtNum(lost)} demolished` : '';
      const holds = s.counted.length > 1 ? `The homes (<strong>${fmtNum(u)}</strong>${why}) are counted on ${s.counted.length} files, most on ${rootTxt}` : `${rootTxt} holds the <strong>${fmtNum(u)}</strong> homes${why}`;
      const uCtx = notTree ? `counted from its files and permits (the tree build counts ${fmtNum(s.units)})` : lost ? `net of ${fmtNum(lost)} demolished (${fmtNum(s.units)} on the files)` : s.counted.length > 1 ? `on ${s.counted.length} files` : `on ${esc(s.root)}`;
      return {
        fullTitle: `${p.title} · files, history and source records`,
        head: PN.siteHead(p),
        answer: s.files > 1 ? `<strong>${s.files}</strong> planning files on one site. ${holds}${s.onLand ? `; ${s.onLand} file${s.onLand === 1 ? ' sits' : 's sit'} on its land` : ''}${s.sameLand ? `${s.onLand ? ' and' : ';'} ${s.sameLand} earlier file${s.sameLand === 1 ? '' : 's'} share${s.sameLand === 1 ? 's' : ''} the land` : ''}.` : `One planning file: ${rootTxt}, with <strong>${fmtNum(u)}</strong> homes${why}.`,
        figures: [{ v: s.files, u: 'files', label: 'planning applications', ctx: 'in one tree', attrs: { 'data-dev-hist': 'file' } }, { v: fmtNum(u), u: 'homes', label: 'counted once', ctx: uCtx, attrs: { 'data-dev-file': s.root } }, { v: permits.length, u: permits.length === 1 ? 'permit' : 'permits', label: 'building permits', ctx: '', attrs: permits.length ? { 'data-dev-hist': 'permit' } : null }, { v: s.check, u: s.check === 1 ? 'link' : 'links', label: 'to check', ctx: 'linked by overlap only' }],
        chart: `<h3 class="sub-title pnl-chart-t">How the files fit together <span class="pnl-chart-u">(each under the file whose land holds it)</span></h3>${FT.treeHTML(d, recOf, { dot: k => (root.PeelUtil.dot ? root.PeelUtil.dot(k) : ''), latest: sorted[0] && sorted[0].ref, ...(root.PeelDcGate ? root.PeelDcGate.treeOpts(p, d) : {}) })}`,
        lists: [...siteList, { title: 'Latest activity', rows: latest, total: files.length, seeAll: { 'data-full-table': 'records' } }, ...relList],
        folds, onMount,
        method: 'The tree comes from the weekly tree build: each file sits under the file whose land holds it (by boundary overlap and file type, with a confidence on each link); the homes are counted once, on the root file. A link marked check was made by overlap only. Earlier files on the same land are the site\u2019s history and are not counted. Each file shows the municipality\u2019s own status wording.',
        sources: `${esc(p.municipality)} open data (applications and permits); the tree build of ${esc(((root.PeelTreeCounts && root.PeelTreeCounts.data && root.PeelTreeCounts.data.snapshotAt) || '').slice(0, 10))}.`,
        foot: { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } }, secondary: [{ label: 'How approvals work', attrs: { 'data-ws-page': 'approvals' }, title: 'Ontario’s steps, the app’s stages and how the files make a tree' }] },
      };
    }
    return {
      fullTitle: `${p.title} · files, history and source records`,
      head: PN.siteHead(p),
      answer: `<strong>${files.length}</strong> planning file${files.length === 1 ? '' : 's'} and <strong>${permits.length}</strong> building permit${permits.length === 1 ? '' : 's'} on this site${p.last ? `; the latest activity ${esc(day(p.last))}` : ''}.`,
      figures: [{ v: files.length, u: 'files', label: 'planning applications', ctx: '' }, { v: permits.length, u: 'permits', label: 'building permits', ctx: '' }],
      lists: [...siteList, { title: 'Files', rows: latest, total: files.length, seeAll: { 'data-full-table': 'records' } }, ...relList],
      folds, onMount,
      method: 'The files on the land and their history: how the development\u2019s stage was set (the furthest stage reached by a file that is not withdrawn), dated events and the source records with their provenance. Each file shows the municipality\u2019s own status wording.',
      sources: `${esc(p.municipality)} open data (applications and permits), with each record\u2019s source and pull date in the full table.`,
      foot: { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } }, secondary: [{ label: 'How approvals work', attrs: { 'data-ws-page': 'approvals' }, title: 'Ontario’s steps, the app’s stages and how the files make a tree' }] },
    };
  }

  const api = { render, peelHTML, sourcesHTML, checksHTML, fileHTML, caveats, filesPanelSpec, sourcesPanelSpec, checksPanelSpec, svcSources, svcChecks, svcSourcesSpec, svcChecksSpec, svcHTML, SVC_SRC };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelRecordsTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
