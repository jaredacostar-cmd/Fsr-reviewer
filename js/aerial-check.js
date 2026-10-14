/* js/aerial-check.js — aerial photo check + #detail panel chrome (Phase 6 extraction).
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
  // ---- Aerial check -------------------------------------------------------------------
  const aerialCache = new Map();
  function runAerial(p) {
    const box = $('#aerial-check');
    if (!box) return;
    if (!window.PeelAerial || !CFG.imagery || !CFG.imagery[p.municipality] || p.lat == null) {
      box.innerHTML = '<p class="small muted">No aerial imagery is set up for this location.</p>';
      return;
    }
    const show = r => { if (DN().getCurrentProject() === p && $('#aerial-check')) renderAerial(r); };
    if (aerialCache.has(p.key)) return show(aerialCache.get(p.key));
    box.innerHTML = '<p class="small muted aerial-loading">Comparing aerial photos…</p>';
    PeelAerial.check(p, CFG, { phaseLabel: P.PHASE_BY_KEY[p.phase].label })
      .then(r => { aerialCache.set(p.key, r); show(r); })
      .catch(e => { if (DN().getCurrentProject() === p && $('#aerial-check')) $('#aerial-check').innerHTML = `<p class="small muted">Aerial check unavailable: ${esc(e.message)}.</p>`; });
  }
  function renderAerial(a) {
    const box = $('#aerial-check');
    const r = a.result, pctv = Math.round(r.probability * 100);
    const cls = r.probability >= 0.7 ? 'hi' : r.probability >= 0.35 ? 'mid' : 'lo';
    const label = y => a.src.years[y].label;
    const fig = (ph, y, note) => ph ? `<figure><div class="aerial-img"></div><figcaption><strong>${esc(label(y))}</strong> ${note}</figcaption></figure>` : '';
    const arrow = e => e > 0 ? '<span class="sig up" aria-label="raises">▲</span>' : e < 0 ? '<span class="sig down" aria-label="lowers">▼</span>' : '<span class="sig" aria-hidden="true">•</span>';
    box.innerHTML = `
      <div class="aerial-head ${cls}">
        <div class="aerial-pct"><strong>${pctv}%</strong><span>likely completed</span></div>
        <div class="aerial-status">${esc(r.status)}</div>
      </div>
      <div class="aerial-meter" role="img" aria-label="${pctv}% likely completed"><span style="width:${pctv}%"></span></div>
      <div class="aerial-pair">
        ${fig(a.before, a.years.before, a.years.preStart ? '· before the application' : '· earliest available')}
        ${fig(a.latest, a.years.latest, '· latest')}
      </div>
      <ul class="aerial-signals">${r.signals.map(s => `<li>${arrow(s.effect)}<span>${esc(s.text)}</span></li>`).join('')}</ul>
      <p class="small muted">${esc(a.src.owner)} aerial photos. Site: ${esc(a.geom.source)} (yellow outline). Estimate from how much the site changed compared with its surroundings and how much building structure it shows${a.fp.now != null ? ', plus building footprints traced from the photos' : ''}; not a site inspection.</p>`;
    const slots = box.querySelectorAll('.aerial-img');
    const canvases = [a.before && a.before.canvas, a.latest.canvas].filter(Boolean);
    canvases.forEach((c, i) => slots[i] && slots[i].appendChild(c));
  }
  // Closing the drawn-area summary also removes the drawn areas (unless drawing another one).
  function closeDetail(opt = {}) {
    // Phase 3: with a dev scope open and #detail showing nothing else, closing
    // clears the scope. Phase 3b: not while a tool result is open — the result is
    // the user's focus there, and closing the scope is the × button's / Esc's job.
    // The record / selection / block views keep their close behaviour below.
    const toolOpen = typeof window !== 'undefined' && window.PeelTools && PeelTools.hasResult();
    if (typeof DevScope !== 'undefined' && DevScope.current() && $('#detail').hidden && !toolOpen) return DevScope.close();
    const wasSel = $('#detail').dataset.view === 'sel';
    if ($('#detail').dataset.view === 'block') ST().clearBlockFocus();
    $('#detail').hidden = true; MM().highlight(null); CA().setDaContext(null);
    if (wasSel && !opt.keepSelection) AS().clearSelection();
    SH().viewLink.write();
    TB().renderTrail();
  }
  $('#detail-close').onclick = closeDetail;
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    // Phase 3b: Esc closes the open tool result first (the × button's equivalent),
    // so it never falls through to closeDetail and drops an unrelated dev scope.
    if (typeof window !== 'undefined' && window.PeelTools && PeelTools.hasResult()) { PeelTools.closeResult(); return; }
    closeDetail();
  });

  // A single record (usually one building permit inside a subdivision) and the planning
  // application(s) it belongs to.
  function showRecordDetail(r, p) {
    CA().setDaContext(p);
    const ph = P.PHASE_BY_KEY[r.phase];
    const parents = r.kind === 'permit' ? MM().parentApps(r, p) : [];
    const parentHTML = r.kind !== 'permit' ? '' : parents.length
      ? parents.slice(0, 5).map(a => `
        <div class="parent-app">${dot(a.phase)}<div>
          <strong>${esc(a.ref || 'Application')}</strong> ${a.type ? `· ${esc(a.type)}` : ''}
          <div class="m">${esc(a.address || '')}${a.statusRaw ? ` · ${esc(a.statusRaw)}` : ''}${a.units ? ` · ${fmtNum(a.units)} units planned` : ''}</div>
          ${a.description ? `<div class="m">${esc(a.description.slice(0, 240))}${a.description.length > 240 ? '…' : ''}</div>` : ''}
        </div></div>`).join('')
      : '<p class="small muted">This permit is not inside any planning application in the data.</p>';
    const b = p.buildout;
    const others = MM().sitePermits(p).length - 1;
    $('#detail-body').innerHTML = `
      <div class="head"><h3>${esc(r.address || r.ref || 'Record')}</h3>
        <div class="m">${esc(r.kind === 'permit' ? 'Building permit' : 'Planning application')} ${esc(r.ref)}${r.type ? ' · ' + esc(r.type) : ''} · ${esc(r.municipality)}</div>
        <span class="badge">${dot(r.phase)}${esc(ph.label)}</span></div>
      <button type="button" class="btn open-project" id="open-project">
        Open whole development: ${esc(p.title)}${b ? ` — ${fmtNum(b.planned)} planned, ${fmtNum(b.remaining)} left to build` : ''}${others > 0 ? ` · ${fmtNum(others)} other permits` : ''}
      </button>
      ${r.description ? `<p>${esc(r.description)}</p>` : ''}
      <dl class="kv">
        ${r.statusRaw ? `<dt>Status</dt><dd>${esc(r.statusRaw)}</dd>` : ''}
        ${r.units ? `<dt>Units</dt><dd>${fmtNum(r.units)}</dd>` : ''}
        ${r.events.map(e => `<dt>${esc(P.humanizeField(e.label))}</dt><dd>${fmtDate(e.date)}</dd>`).join('')}
      </dl>
      ${r.kind === 'permit' ? `<h2 class="section-title" data-info="parent-app">Part of planning application</h2>${parentHTML}` : ''}
      ${r.kind === 'application' && p.records.length > 1 ? `<p class="small muted">This application is part of a larger development with ${fmtNum(p.records.length - 1)} other files.</p>` : ''}
      ${r.units > 0 ? DD().demandHTML({ units: r.units, phase: r.phase, types: r.type ? [r.type] : [], description: r.description || '', unitMix: r.unitMix || null },
        r.kind === 'permit' ? '<p class="small muted">For the units on this permit only; open the whole development for the full site.</p>' : '') : ''}
      <h2 class="section-title">Source record</h2>
      ${DD().recordProvHTML(r)}
      <table class="rec-table">${DD().recordRows(r)}</table>`;
    $('#open-project').onclick = () => DN().showDetail(p);
    $('#detail').hidden = false; $('#detail').dataset.view = 'record';
    $('#detail').scrollTop = 0;
    MM().highlight(p, r);
    if (r.lat != null) {
      map.setView([r.lat, r.lng], Math.max(map.getZoom(), 17), { animate: false });
      // Phones: centre the point in the part of the map left visible above the bottom sheet.
      if (innerWidth <= 760) {
        const m = map.getContainer().getBoundingClientRect();
        const visibleBottom = Math.min(m.bottom, $('#detail').getBoundingClientRect().top);
        const target = (visibleBottom - m.top) / 2;
        const now = map.latLngToContainerPoint([r.lat, r.lng]).y;
        map.panBy([0, now - target], { animate: false });
      }
    }
  }

  // "Show on map" from a project's record list.
  $('#detail-body').addEventListener('click', e => {
    const b = e.target.closest('[data-rec]'); if (!b || !DN().getCurrentProject()) return;
    const r = DN().getCurrentProject().records.find(x => x.uid === b.dataset.rec);
    if (r) showRecordDetail(r, DN().getCurrentProject());
  });

  // ---- Public contract ----
  const api = { runAerial, renderAerial, closeDetail, showRecordDetail };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAerialCheck = api;
})(typeof window !== 'undefined' ? window : globalThis);
