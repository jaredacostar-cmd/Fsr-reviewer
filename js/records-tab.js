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
        <p class="small">${fmtNum(a.records.raw)} records → ${fmtNum(a.records.unique)} unique files → ${fmtNum(a.records.projects)} developments; <strong>${fmtNum(a.possible.length)}</strong> possible duplicate pair${a.possible.length === 1 ? '' : 's'} to review (Find › Data).</p>`
      : '<p class="small muted">Checks run once the full data has loaded.</p>';
    const acc = root.ModelChecks && typeof root.ModelChecks.accuracy === 'string' ? root.ModelChecks.accuracy : '';
    return `${dups}${DU().checksHTML ? DU().checksHTML() : ''}${acc}<p class="small muted">The servicing model against the Master Plan and the 2025 reports: <button type="button" class="btn small link" data-at="svc:checks">Servicing › Checks →</button></p>`;
  }
  const peelHTML = () => `${sourcesHTML()}${checksHTML()}`;

  function fileHTML(r, p) {
    return `<div class="head"><h3>${esc(r.ref || r.address || 'Record')}</h3><div class="m">${esc(r.kind === 'permit' ? 'Building permit' : r.type || 'Planning application')} · ${esc(r.municipality)}${p ? ` · in ${esc(p.title)}` : ''}</div></div>
      <h2 class="section-title">Source</h2>${DD().recordProvHTML(r)}
      <table class="rec-table">${DD().recordRows(r)}</table>`;
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

  function render() {
    const body = $('#records-body'); if (!body || !App() || !App().state) return;
    const scoped = typeof DevScope !== 'undefined' && DevScope.current();
    if (scoped) { syncDevHome('records'); if (root.PeelPanel) root.PeelPanel.set('records:files', filesPanelSpec(scoped)); return; }
    const s = SS() && SS().current();
    if (s && s.kind === 'result' && s.rkind === 'file' && AC().currentFile) {
      const f = AC().currentFile(); if (f) { body.innerHTML = fileHTML(f.r, f.p); return; }
    }
    // Peel, a municipality or plan, or a servicing scope (no files of its own): Sources or Checks.
    const AT = root.PeelAnalysisTabs, sub = AT && AT.getRSub ? AT.getRSub() : 'sources';
    const note = s ? `<p class="small muted">${esc(s.title)} has no files of its own. Its developments are listed in Overview; each opens to its own records. Below: the ${sub === 'checks' ? 'checks' : 'sources'} for all of Peel.</p>` : '';
    body.innerHTML = note + (sub === 'checks' ? checksHTML() : sourcesHTML());
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
      method: 'Each source with the date of the data the app holds and how often it is refreshed; due = past its refresh interval, stale = past twice that. The reports behind the design criteria and the comparisons are listed in the full table.',
      sources: 'Municipal open data (applications, permits, plans), Region of Peel open data and reports, Statistics Canada, CMHC, the Ministry of Finance.',
      foot: { primary: { label: 'Copy share link', attrs: { 'data-share': '' } } },
    };
  }
  function checksPanelSpec() {
    const PN = root.PeelPanel, a = App().state.audit, pc = root.PeelCensusView && root.PeelCensusView.permitCheck ? root.PeelCensusView.permitCheck() : null;
    const fails = a ? a.checks.filter(c => c.value) : [], pFail = pc && pc.rows ? pc.rows.filter(r => !r.pass) : [];
    return {
      fullTitle: 'Records › Checks: duplicates, published totals, permit counts and the accuracy report',
      head: PN.areaHead('Records › Checks', 'Can the data be trusted?', fails.length || pFail.length ? { tone: 'tight', text: `${fails.length + pFail.length} to review` } : { tone: 'room', text: 'Pass' }, a ? `${fmtNum(a.records.raw)} records → ${fmtNum(a.records.unique)} files → ${fmtNum(a.records.projects)} developments` : 'Checks run once the full data has loaded'),
      answer: a ? `${fmtNum(a.records.raw)} records make <strong>${fmtNum(a.records.projects)}</strong> developments; <strong>${fmtNum(a.possible.length)}</strong> possible duplicate pair${a.possible.length === 1 ? '' : 's'} to review${pFail.length ? `; permit counts differ from Region figures for ${pFail.map(r => esc(r.m)).join(' and ')}` : ''}.` : 'The checks run once the full data has loaded.',
      figures: a ? [{ v: fmtNum(a.records.raw), u: 'records', label: 'read', ctx: '' }, { v: fmtNum(a.records.unique), u: 'files', label: 'unique', ctx: '' }, { v: fmtNum(a.possible.length), u: 'pairs', label: 'possible duplicates', ctx: 'to review (Find › Data)', tone: a.possible.length ? 'tight' : 'room' }, { v: fails.length, u: '', label: 'checks flagged', ctx: '', tone: fails.length ? 'tight' : 'room' }] : [],
      lists: a ? [{ title: 'Checks', rows: a.checks.slice(0, 5).map(c => PN.kv(esc(c.label), `${c.value ? '✕' : '✓'} ${fmtNum(c.value)}`, c.value ? 'tight' : 'room')), total: a.checks.length, seeAll: { 'data-full-table': 'records' } }] : [],
      method: 'Records read from each municipality are grouped into unique files and developments; the checks count what could not be placed or matched. The model against published totals, the permit check (fail beyond 25%) and the accuracy report are in the full table. The servicing model\u2019s checks are Servicing › Checks.',
      sources: 'The municipal application and permit records; Region of Peel published totals and permit figures.',
      foot: { primary: { label: 'Servicing checks', attrs: { 'data-at': 'svc:checks' } } },
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
    const PN = root.PeelPanel, PH = root.PeelPhases, files = (p.records || []).filter(r => r.kind === 'application'), permits = (p.records || []).filter(r => r.kind === 'permit');
    const day = d => (d ? new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '');
    const sorted = files.slice().sort((a, b) => (+new Date(b.date || 0)) - (+new Date(a.date || 0)));
    return {
      fullTitle: `${p.title} · files, history and source records`,
      head: PN.siteHead(p),
      answer: `<strong>${files.length}</strong> planning file${files.length === 1 ? '' : 's'} and <strong>${permits.length}</strong> building permit${permits.length === 1 ? '' : 's'} on this site${p.last ? `; the latest activity ${esc(day(p.last))}` : ''}.`,
      figures: [{ v: files.length, u: 'files', label: 'planning applications', ctx: '' }, { v: permits.length, u: 'permits', label: 'building permits', ctx: '' }],
      lists: [{ title: 'Files', rows: sorted.slice(0, 5).map(r => PN.kv(`<strong>${esc(r.ref || 'file')}</strong>${r.type ? ` <small>${esc(r.type)}</small>` : ''}`, `${r.units ? `${fmtNum(r.units)} units · ` : ''}${esc((PH && PH.PHASE_BY_KEY[r.phase] || {}).label || r.phase || '')}${r.date ? ` · ${esc(day(r.date))}` : ''}`)), total: files.length, seeAll: { 'data-full-table': 'records' } }],
      method: 'The files on the land and their history: how the phase was set (the furthest phase reached by a file that is not withdrawn), dated events and the source records with their provenance.',
      sources: `${esc(p.municipality)} open data (applications and permits), with each record\u2019s source and pull date in the full table.`,
      foot: { primary: { label: 'Servicing memo', attrs: { 'data-pnl-memo': '' } } },
    };
  }

  const api = { render, syncDevHome, peelHTML, sourcesHTML, checksHTML, fileHTML, caveats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelRecordsTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
