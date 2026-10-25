/* js/aerial-check.js — the single-file scope and closing the right panel's scopes (the aerial photo
 * check is js/devtab.js aerialRun, shown by js/aerial-chip.js).
 * Extracted verbatim from js/app.js (lines 3383-3505); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 * Note: bare `box` are function-locals; bare DevScope/PeelAerial are pre-Phase-6 globals.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmtDate, dot } = root.PeelUtil;
  const P = root.PeelPhases;
  const CFG = root.PEEL_CONFIG;
  const map = root.PeelMapCore.map;
  const App = () => root.PeelApp;
  const MM = () => root.PeelMapMarkers;
  const DD = () => root.PeelDevDetail;
  const ST = () => root.PeelSewerTrace;
  const AS = () => root.PeelAreaSelect;
  const CA = () => root.PeelCensusAreas;
  const DN = () => root.PeelDevNav;
  const TB = () => root.PeelTopbar;
  const SH = () => root.PeelShare;

/* ---- app.js lines 3383-3505 ---- */
  // Close what the right panel shows: a result scope (file, block, selection, tool result) first;
  // with none, the development scope. Closing a selection also removes the drawn areas (unless
  // drawing another one).
  function closeDetail(opt = {}) {
    const S = root.PeelSvcScope, cur = S && S.current(), rk = cur && cur.kind === 'result' ? cur.rkind : null;
    if (!rk) {
      if (typeof DevScope !== 'undefined' && DevScope.current()) return DevScope.close();
      MM().highlight(null); CA().setDaContext(null); return undefined;
    }
    if (rk === 'iiblock') ST().clearBlockFocus();
    S.closeResult(); MM().highlight(null); CA().setDaContext(null);
    if (rk === 'sel' && !opt.keepSelection) AS().clearSelection();
    return undefined;
  }
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Phase 3b: Esc closes the open tool result first (the × button's equivalent),
    // so it never falls through to closeDetail and drops an unrelated dev scope.
    if (typeof window !== 'undefined' && window.PeelTools && PeelTools.hasResult()) { PeelTools.closeResult(); return; }
    closeDetail();
  });

  // A single file (SPEC §3, boards/RecordSheet): an application or a permit as its own scope, in the
  // right panel. Its units alone, the people they hold, its share of the development, what was filed,
  // how it is read and what it counts as, its demand alone, the other files of its development, and
  // the source. Never the applicant or any other person (privacy rule).
  function showRecordDetail(r, p) {
    CA().setDaContext(p);
    const ph = P.PHASE_BY_KEY[r.phase];
    const parents = r.kind === 'permit' ? MM().parentApps(r, p) : [];
    const fileBtn = a => `<button type="button" class="btn small link" data-file="${esc(a.uid)}">${esc(a.ref || a.type || 'File')}</button>`;
    const parentHTML = r.kind !== 'permit' ? '' : parents.length
      ? parents.slice(0, 5).map(a => `
        <div class="parent-app">${dot(a.phase)}<div>
          ${fileBtn(a)} ${a.type ? `· ${esc(a.type)}` : ''}
          <div class="m">${esc(a.address || '')}${a.statusRaw ? ` · ${esc(a.statusRaw)}` : ''}${a.units ? ` · ${fmtNum(a.units)} units planned` : ''}</div>
          ${a.description ? `<div class="m">${esc(a.description.slice(0, 240))}${a.description.length > 240 ? '…' : ''}</div>` : ''}
        </div></div>`).join('')
      : '<p class="small muted">This permit is not inside any planning application in the data.</p>';
    const Ly = root.PeelLayers, LB = root.PeelLayerBar, lf = Ly ? Ly.ofFile(r, p) : null;
    const units = lf ? lf.units : r.units || 0;
    const ppl = units > 0 && root.PeelDemand ? root.PeelDemand.estimate([{ units, phase: r.phase, types: r.type ? [r.type] : [], description: r.description || '', unitMix: r.unitMix || null }], App().state.criteria, 'all').population : 0;
    const share = units > 0 && p.units > 0 ? Math.round(units / p.units * 100) : null;
    const received = r.events.length ? r.events.map(e => e.date).sort((x, y) => x - y)[0] : null;
    const z = r.council && r.council.zoning;
    const readAs = `${esc(ph.label)}${z ? ` → zoning approved${z.bylaw ? ` by By-law ${esc(z.bylaw)}` : ''}${z.date ? ` (${esc(z.date)})` : ''}` : ''}${r.outside ? ' · <span class="muted">sets no phase: inside only a block or precinct plan</span>' : r.prePlan ? ' · <span class="muted">sets no phase: issued before its own plan was filed</span>' : ''}`;
    const counts = lf && lf.layer ? `${LB ? LB.nameHTML(lf.layer) : esc(lf.layer)}${lf.layer === 'proposed' || lf.layer === 'anticipated' ? ' · <span class="muted">becomes Committed on a draft or site plan approval, or a permit inside this boundary</span>' : ''}` : '<span class="muted">none (withdrawn or refused)</span>';
    const others = p.records.filter(x => x !== r && x.kind === 'application' && x.phase !== 'cancelled').slice(0, 12);
    const tile = (v, u, l) => `<div class="ov-tile"><b>${v}</b><span class="ov-u">${u}</span><span class="ov-l">${l}</span></div>`;
    const html = `
      <div class="head"><h3>${esc(r.ref || r.address || 'Record')}</h3>
        <div class="m">${esc(r.kind === 'permit' ? 'Building permit' : r.type || 'Planning application')}${r.address ? ` · ${esc(r.address)}` : ''} · ${esc(r.municipality)}${r.ward ? ` · ${/^\s*ward\b/i.test(r.ward) ? esc(String(r.ward).replace(/^\s*ward\s*/i, 'Ward ')) : `Ward ${esc(r.ward)}`}` : ''}</div>
        <span class="badge">${dot(r.phase)}${esc(r.statusRaw || ph.label)}</span></div>
      <div class="pt-actions" role="group" aria-label="Actions">
        <button type="button" class="btn small" data-file-open-dev title="Open the whole development: ${esc(p.title)}">Open as a development</button>
        <button type="button" class="btn small" data-file-tree title="The development's tree of files">See its tree</button>
        ${(() => { const PV = root.PeelProvenance, src = r.sourceId && (App().state.sources || []).find(x => String(x.id).split('/')[0] === String(r.sourceId).split('/')[0]), url = PV && PV.recordSourceUrl ? PV.recordSourceUrl(r, src && src.url, { format: 'html' }) : null; return url ? `<a class="btn small" href="${esc(url)}" target="_blank" rel="noopener">City record ↗</a>` : ''; })()}
      </div>
      <div class="ov-tiles">${tile(units > 0 ? fmtNum(units) : '–', 'units', lf && lf.confidence === 'estimated' ? 'this file · estimated' : 'this file alone')}${tile(ppl > 0 ? fmtNum(Math.round(ppl / 10) * 10) : '–', 'people', units > 0 && ppl > 0 ? `${(ppl / units).toFixed(2)} ppu` : 'at Peel criteria')}${tile(share != null ? `${share}%` : '–', '', `of the ${fmtNum(p.units || 0)}-unit development`)}</div>
      ${r.description ? `<h2 class="section-title">What was filed</h2><p>${esc(r.description)}</p>` : ''}
      <dl class="kv">
        ${received ? `<dt>Received</dt><dd>${fmtDate(received)}</dd>` : ''}
        ${r.statusRaw ? `<dt>Status</dt><dd>${esc(r.statusRaw)} <span class="muted small">· as ${esc(r.municipality)} publishes it</span></dd>` : ''}
        <dt>Read as</dt><dd>${readAs}</dd>
        <dt>Counts as</dt><dd>${counts}</dd>
        ${r.events.map(e => `<dt>${esc(P.humanizeField(e.label))}</dt><dd>${fmtDate(e.date)}</dd>`).join('')}
      </dl>
      ${r.kind === 'permit' ? `<h2 class="section-title" data-info="parent-app">Part of planning application</h2>${parentHTML}` : ''}
      ${units > 0 ? `<h2 class="section-title">Servicing demand · this file alone</h2>${DD().demandHTML({ units, phase: r.phase, types: r.type ? [r.type] : [], description: r.description || '', unitMix: r.unitMix || null }, '<p class="small muted">At Peel criteria. The development view sums every file; this view is the single file.</p>')}` : ''}
      ${others.length ? `<h2 class="section-title">Other files in this development</h2><p class="small">${others.map(a => `${dot(a.phase)} ${fileBtn(a)}${a.units ? ` <span class="muted">${fmtNum(a.units)} units</span>` : ''}`).join(' · ')}${p.records.length - 1 > others.length ? ` <span class="muted">+${fmtNum(p.records.length - 1 - others.length)} more (permits and closed files): see its tree</span>` : ''}</p>` : ''}
      <h2 class="section-title">Source record</h2>
      ${DD().recordProvHTML(r)}
      <details><summary class="small">All fields</summary><table class="rec-table">${DD().recordRows(r)}</table></details>`;
    root.PeelSvcScope.openResult({ ref: `file:${r.uid}`, title: r.ref || r.address || 'Record', html, devKeys: [p.key], reopen: () => showRecordDetail(r, p) });
    fileCtx = { r, p };
    MM().highlight(p, r);
    if (r.lat != null) map.setView([r.lat, r.lng], Math.max(map.getZoom(), 17), { animate: false });
  }
  let fileCtx = null;
  { const host = $('#scope-body'); if (host) host.addEventListener('click', e => {
    if (!fileCtx) return;
    if (e.target.closest('[data-file-open-dev]')) { DN().showDetail(fileCtx.p); return; }
    if (e.target.closest('[data-file-tree]')) { const p = fileCtx.p; DN().showDetail(p); setTimeout(() => { if (window.PeelAnalysisTabs && window.PeelAnalysisTabs.openTab) window.PeelAnalysisTabs.openTab('records', 'files'); }, 0); return; }
    const f = e.target.closest('[data-file]');
    if (f) { const r = fileCtx.p.records.find(x => x.uid === f.dataset.file); if (r) showRecordDetail(r, fileCtx.p); }
  }); }

  // "Show on map" from a development's record list (the Development / Records views): the file
  // opens as its own scope.
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-rec]'); if (!b) return;
    const p = DN().getCurrentProject() || (typeof DevScope !== 'undefined' && DevScope.current()) || (fileCtx && fileCtx.p); if (!p) return;
    const r = p.records.find(x => x.uid === b.dataset.rec);
    if (r) showRecordDetail(r, p);
  });

  // ---- Public contract ----
  const currentFile = () => { const S = root.PeelSvcScope; return fileCtx && S && S.hasResult() && String(App().state.ss).startsWith('file:') ? fileCtx : null; };
  const api = { closeDetail, showRecordDetail, currentFile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAerialCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
