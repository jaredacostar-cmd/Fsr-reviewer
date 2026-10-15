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
    if (scoped) { syncDevHome('records'); return; }
    const s = SS() && SS().current();
    if (s && s.kind === 'result' && s.rkind === 'file' && AC().currentFile) {
      const f = AC().currentFile(); if (f) { body.innerHTML = fileHTML(f.r, f.p); return; }
    }
    // Peel, a municipality or plan, or a servicing scope (no files of its own): Sources or Checks.
    const AT = root.PeelAnalysisTabs, sub = AT && AT.getRSub ? AT.getRSub() : 'sources';
    const note = s ? `<p class="small muted">${esc(s.title)} has no files of its own. Its developments are listed in Overview; each opens to its own records. Below: the ${sub === 'checks' ? 'checks' : 'sources'} for all of Peel.</p>` : '';
    body.innerHTML = note + (sub === 'checks' ? checksHTML() : sourcesHTML());
  }

  const api = { render, syncDevHome, peelHTML, sourcesHTML, checksHTML, fileHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelRecordsTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
