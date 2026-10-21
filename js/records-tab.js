(function (root) {
  'use strict';
  // The Records tab (SPEC §5; Stage 2: the small trailing tab, also in the Settings gear), with
  // Sources · Checks · Files:
  //   Peel / municipality / plan: Sources (freshness, reports) and Checks (duplicates, data checks);
  //   a development:              its tree of files with each file's layer, and their history
  //                               (the development's Files & history view, moved here);
  //   a single file:              the file: its source record, every field, its provenance;
  //   a plant / zone / block / station / DC work: no files of its own (its developments are in
  //                               Overview; each opens to its records).
  const { $, esc, fmtNum } = root.PeelUtil;
  const App = () => root.PeelApp;
  const DU = () => root.PeelDemandUI;
  const SS = () => root.PeelSvcScope;
  const DD = () => root.PeelDevDetail;
  const AC = () => root.PeelAerialCheck;

  // Records › Sources: what each source is and how fresh it is, and the reports the model rests on.
  function sourcesHTML() {
    return `${DU().freshnessHTML()}${root.PeelSvcPlants && root.PeelSvcPlants.refsHTML ? root.PeelSvcPlants.refsHTML() : ''}`;
  }
  // Records › Checks: the data checks (duplicates, the model against published totals, the permit
  // check, the accuracy of the statuses). The servicing model's checks are Servicing › Checks.
  function checksHTML() {
    const a = App().state.audit || (App().state.auditInput && App().state.projects.length && root.PeelAudit ? (App().state.audit = root.PeelAudit.audit(App().state.auditInput.raw, App().state.auditInput.records, App().state.projects)) : null);
    const dups = a ? `<h3 class="sub-title" data-info="duplicate-check">Checks and duplicates</h3>
        <ul class="audit-checks">${a.checks.map(c => `<li class="${c.value ? 'bad' : 'good'}"><span aria-hidden="true">${c.value ? '✕' : '✓'}</span> ${esc(c.label)}: <strong>${fmtNum(c.value)}</strong></li>`).join('')}</ul>
        <p class="small">${fmtNum(a.records.raw)} records → ${fmtNum(a.records.unique)} unique files → ${fmtNum(a.records.projects)} developments; <strong>${fmtNum(a.possible.length)}</strong> possible duplicate pair${a.possible.length === 1 ? '' : 's'} to review in the duplicate check below.</p>`
      : '<p class="small muted">Checks run once the full data has loaded.</p>';
    const acc = root.ModelChecks && typeof root.ModelChecks.accuracy === 'string' ? root.ModelChecks.accuracy : '';
    return `${dups}${DU().checksHTML ? DU().checksHTML() : ''}${acc}<p class="small muted">The servicing model against the Master Plan and the 2025 reports: <button type="button" class="btn small link" data-at="svc:checks">Servicing › Model checks →</button></p>`;
  }
  const peelHTML = () => `${sourcesHTML()}${checksHTML()}`;

  function fileHTML(r, p) {
    return `<div class="head"><h3>${esc(r.ref || r.address || 'Record')}</h3><div class="m">${esc(r.kind === 'permit' ? 'Building permit' : r.type || 'Planning application')} · ${esc(r.municipality)}${p ? ` · in ${esc(p.title)}` : ''}</div></div>
      <h2 class="section-title">Source</h2>${DD().recordProvHTML(r)}
      <table class="rec-table">${DD().recordRows(r)}</table>${root.PeelAddr ? root.PeelAddr.noteHTML(r) : ''}`;
  }

  // The development's Files & history view lives in Records: its node moves between the Overview
  // (About, Site) and this tab, so it renders once and keeps its state.
  function syncDevHome(key) {
    const dev = $('#ov-dev'), rec = $('#records-body'), ov = $('#pane-overview'); if (!dev || !rec || !ov) return;
    const scoped = typeof DevScope !== 'undefined' && DevScope.current();
    const DT = root.DevTab;
    if (key === 'records' && scoped) {
      if (dev.parentElement !== rec) { rec.innerHTML = ''; rec.appendChild(dev); }
      dev.hidden = false; dev.classList.add('in-records');
      if (DT && DT.setSub) DT.setSub('files');
    } else if (dev.parentElement !== ov) {
      ov.appendChild(dev); dev.classList.remove('in-records');
      if (DT && DT.setSub && document.querySelector('[data-devsub="files"][aria-selected="true"]')) DT.setSub('about');
    }
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
    if (scoped) { showData(null); syncDevHome('records'); if (root.PeelPanel) root.PeelPanel.set('records:files', filesPanelSpec(scoped)); return; }
    const s = SS() && SS().current();
    if (s && s.kind === 'result' && s.rkind === 'file' && AC().currentFile) {
      const f = AC().currentFile(); if (f) { showData(null); body.innerHTML = fileHTML(f.r, f.p); return; }
    }
    // Peel, a municipality or plan, or a servicing scope (no files of its own): Sources or Checks.
    const AT = root.PeelAnalysisTabs, sub = AT && AT.getRSub ? AT.getRSub() : 'sources';
    const note = s ? `<p class="small muted">${esc(s.title)} has no files of its own. Its developments are listed in Overview; each opens to its own records. Below: the ${sub === 'checks' ? 'checks' : 'sources'} for all of Peel.</p>` : '';
    body.innerHTML = note + (sub === 'checks' ? checksHTML() : sourcesHTML());
    showData(sub === 'checks' ? 'checks' : 'sources');
    if (root.PeelPanel) root.PeelPanel.set(`records:${sub === 'checks' ? 'checks' : 'sources'}`, sub === 'checks' ? checksPanelSpec() : sourcesPanelSpec());
  }
  // ---- Stage 3: the Records panels -----------------------------------------------------------------
  const ST_WORD = { ok: ['room', 'Current'], due: ['tight', 'Due'], stale: ['over', 'Stale'], ref: [null, 'Reference'], na: [null, 'Loads when needed'] };
  function sourcesPanelSpec() {
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
    const PN = root.PeelPanel, a = App().state.audit, pc = root.PeelCensusView && root.PeelCensusView.permitCheck ? root.PeelCensusView.permitCheck() : null;
    const fails = a ? a.checks.filter(c => c.value) : [], pFail = pc && pc.rows ? pc.rows.filter(r => !r.pass) : [];
    return {
      fullTitle: 'Records › Data checks: duplicates, published totals, permit counts and the accuracy report',
      head: PN.areaHead('Records › Data checks', 'Can the data be trusted?', fails.length || pFail.length ? { tone: 'tight', text: `${fails.length + pFail.length} to review` } : { tone: 'room', text: 'Pass' }, a ? `${fmtNum(a.records.raw)} records → ${fmtNum(a.records.unique)} files → ${fmtNum(a.records.projects)} developments` : 'Checks run once the full data has loaded'),
      answer: a ? `${fmtNum(a.records.raw)} records make <strong>${fmtNum(a.records.projects)}</strong> developments; <strong>${fmtNum(a.possible.length)}</strong> possible duplicate pair${a.possible.length === 1 ? '' : 's'} to review${pFail.length ? `; permit counts differ from Region figures for ${pFail.map(r => esc(r.m)).join(' and ')}` : ''}.` : 'The checks run once the full data has loaded.',
      figures: a ? [{ v: fmtNum(a.records.raw), u: 'records', label: 'read', ctx: '' }, { v: fmtNum(a.records.unique), u: 'files', label: 'unique', ctx: '' }, { v: fmtNum(a.possible.length), u: 'pairs', label: 'possible duplicates', ctx: 'to review in the duplicate check', tone: a.possible.length ? 'tight' : 'room' }, { v: fails.length, u: '', label: 'checks flagged', ctx: '', tone: fails.length ? 'tight' : 'room' }] : [],
      lists: a ? [{ title: 'Checks', rows: a.checks.slice(0, 5).map(c => PN.kv(esc(c.label), `${c.value ? '✕' : '✓'} ${fmtNum(c.value)}`, c.value ? 'tight' : 'room')), total: a.checks.length, seeAll: { 'data-full-table': 'records' } }] : [],
      method: 'Records read from each municipality are grouped into unique files and developments; the checks count what could not be placed or matched. The model against published totals, the permit check (fail beyond 25%) and the accuracy report are in the full table. The servicing model\u2019s checks are Servicing › Model checks.',
      sources: 'The municipal application and permit records; Region of Peel published totals and permit figures.',
      foot: { primary: { label: 'Duplicate check', attrs: { 'data-full-table': 'records', 'data-ft-go': 'Units: every record' }, title: 'The duplicate check and the possible duplicate pairs (was the Data tab)' }, secondary: [{ label: 'Servicing checks', attrs: { 'data-at': 'svc:checks' } }] },
    };
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
  // A development's files: the tree, the history and the source records are the full table.
  function filesPanelSpec(p) {
    const PN = root.PeelPanel, PH = root.PeelPhases, FT = root.PeelFileTree, files = (p.records || []).filter(r => r.kind === 'application'), permits = (p.records || []).filter(r => r.kind === 'permit');
    const day = d => (d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
    const sorted = files.slice().sort((a, b) => (+new Date(b.date || 0)) - (+new Date(a.date || 0)));
    const plain = t => (PN.typeWords ? PN.typeWords(t) : t);
    const latest = sorted.slice(0, 5).map(r => PN.kv(`<strong>${esc(r.ref || 'file')}</strong>${r.type ? ` <small>${esc(plain(r.type))}</small>` : ''}`, `${r.units ? `${fmtNum(r.units)} units · ` : ''}${r.statusRaw ? `municipal status: ${esc(r.statusRaw)}` : esc((PH && PH.PHASE_BY_KEY[r.phase] || {}).label || r.phase || '')}${r.date ? ` · ${esc(day(r.date))}` : ''}`));
    // Site → proposal → file (js/sites.js): the other proposals on its land, then the site's other
    // activity (a patio, a fit-out), each opening its own page.
    const TG = root.PeelTreeGroups, all = root.PeelApp && root.PeelApp.state && root.PeelApp.state.projects;
    const site = TG && TG.siteParts ? TG.siteParts(p, all && (all.all || all)) : [];
    const siteRow = q => PN.kv(`<button type="button" class="btn small link" data-pnl-dev="${esc(q.key)}"><strong>${esc(q.title)}</strong></button>${q.siteActivity ? ' <small>other activity</small>' : ''}`,
      `${q.units > 0 ? `${fmtNum(q.units)} homes · ` : ''}${esc((PH && PH.PHASE_BY_KEY[q.phase] || {}).label || q.phase || '')}${(q.records || []).some(r => r.kind === 'application') ? ` · ${esc((q.records.find(r => r.kind === 'application') || {}).ref || '')}` : ''}`);
    const siteList = site.length ? [{ title: `On this site${site.length > 5 ? ` (5 of ${site.length})` : ''}`, rows: site.slice(0, 5).map(siteRow), total: Math.min(5, site.length) }] : [];
    // Bundle 6: the files as a tree (the tree build), the latest activity under it; the flat list
    // where the development has no tree entry (Previous counting, or its files changed since the build).
    const d = FT && FT.of(p);
    if (d) {
      const s = FT.summary(d), recOf = FT.recLookup(p), mainN = FT.nodeOf(d, s.root), rr = (mainN && recOf(mainN)) || {};
      const rootTxt = `<strong>${esc(s.root)}</strong>${rr.type ? ` (${esc(plain(rr.type))}${rr.statusRaw ? `, municipal status: ${esc(rr.statusRaw)}` : ''})` : ''}`;
      const holds = s.counted.length > 1 ? `The homes (<strong>${fmtNum(s.units)}</strong>) are counted on ${s.counted.length} files, most on ${rootTxt}` : `${rootTxt} holds the <strong>${fmtNum(s.units)}</strong> homes`;
      return {
        fullTitle: `${p.title} · files, history and source records`,
        head: PN.siteHead(p),
        answer: s.files > 1 ? `<strong>${s.files}</strong> planning files on one site. ${holds}${s.onLand ? `; ${s.onLand} file${s.onLand === 1 ? ' sits' : 's sit'} on its land` : ''}${s.sameLand ? `${s.onLand ? ' and' : ';'} ${s.sameLand} earlier file${s.sameLand === 1 ? '' : 's'} share${s.sameLand === 1 ? 's' : ''} the land` : ''}.` : `One planning file: ${rootTxt}, with <strong>${fmtNum(s.units)}</strong> homes.`,
        figures: [{ v: s.files, u: 'files', label: 'planning applications', ctx: 'in one tree', attrs: { 'data-dev-hist': 'file' } }, { v: fmtNum(s.units), u: 'homes', label: 'counted once', ctx: s.counted.length > 1 ? `on ${s.counted.length} files` : `on ${esc(s.root)}`, attrs: { 'data-dev-file': s.root } }, { v: permits.length, u: permits.length === 1 ? 'permit' : 'permits', label: 'building permits', ctx: '', attrs: permits.length ? { 'data-dev-hist': 'permit' } : null }, { v: s.check, u: s.check === 1 ? 'link' : 'links', label: 'to check', ctx: 'linked by overlap only' }],
        chart: `<h3 class="sub-title pnl-chart-t">How the files fit together <span class="pnl-chart-u">(each under the file whose land holds it)</span></h3>${FT.treeHTML(d, recOf, { dot: k => (root.PeelUtil.dot ? root.PeelUtil.dot(k) : ''), latest: sorted[0] && sorted[0].ref, ...(root.PeelDcGate ? root.PeelDcGate.treeOpts(p, d) : {}) })}`,
        lists: [...siteList, { title: 'Latest activity', rows: latest, total: files.length, seeAll: { 'data-full-table': 'records' } }],
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
      lists: [...siteList, { title: 'Files', rows: latest, total: files.length, seeAll: { 'data-full-table': 'records' } }],
      method: 'The files on the land and their history: how the development\u2019s stage was set (the furthest stage reached by a file that is not withdrawn), dated events and the source records with their provenance. Each file shows the municipality\u2019s own status wording.',
      sources: `${esc(p.municipality)} open data (applications and permits), with each record\u2019s source and pull date in the full table.`,
      foot: { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } }, secondary: [{ label: 'How approvals work', attrs: { 'data-ws-page': 'approvals' }, title: 'Ontario’s steps, the app’s stages and how the files make a tree' }] },
    };
  }

  const api = { render, syncDevHome, peelHTML, sourcesHTML, checksHTML, fileHTML, caveats, filesPanelSpec, sourcesPanelSpec, checksPanelSpec };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelRecordsTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
