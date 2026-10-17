/* The stage chip opens its answer (PeelStageChip): a development's stage ("In review · zoning
 * approved") in its header is a button; pressed, "How the stage was set" opens under the header, in
 * place, as the aerial chip does: the file that set the stage, each file's published status and how
 * it was read, and what the site needs for the next stage. Open or closed carries across the tabs
 * and pages that show the development.
 *
 * Pure: next() names what moves a site to the next stage (tests/chips.test.js), in the app's rules
 * (js/phases.js; How approvals work).
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // What moves a site from its stage to the next, as the app reads the files.
  const NEXT = {
    inception: 'Next: a formal application (an official plan or zoning amendment, a plan of subdivision or a site plan) puts it In review.',
    review: 'Next: a draft plan of subdivision or a site plan approved (or, for 10 homes or fewer, its zoning approved) makes it Approved, and committed.',
    approved: 'Next: a building permit issued.',
    permit: 'Next: construction, then occupancy (Built).',
    construction: 'Next: occupancy (Built).',
    completed: 'Built: on the system once occupied.',
    cancelled: 'Withdrawn or refused: a new application would start it again.',
  };
  const next = phase => NEXT[phase] || '';

  // ---- Browser ---------------------------------------------------------------------------------
  let openKey = null;
  const isOpen = key => openKey === key;
  function contentHTML(p) {
    const DT = root.DevTab, body = DT && DT.partHTML ? DT.partHTML(p, 'stage') : '';
    return `<p class="stage-next small"><strong>${esc(next(p.phase))}</strong> <button type="button" class="btn small link" data-ws-page="approvals">How approvals work →</button></p>${body}
      <p class="aer-foot small"><button type="button" class="btn small link" data-stage-chip="${esc(p.key)}">Close</button></p>`;
  }
  /** The box under the header (filled while open). */
  const boxHTML = p => (p ? `<div class="aer-box stage-box" data-stage-box="${esc(p.key)}"${isOpen(p.key) ? '' : ' hidden'}>${isOpen(p.key) ? contentHTML(p) : ''}</div>` : '');
  const byKey = (attr, key) => [...document.querySelectorAll(`[${attr}]`)].filter(e => e.getAttribute(attr) === key);
  function toggle(key) {
    openKey = openKey === key ? null : key;
    const N = root.PeelDevNav, p = (root.DevScope && root.DevScope.current && root.DevScope.current()) || (N && N.projectByKey && N.projectByKey(key));
    for (const b of byKey('data-stage-box', key)) { b.hidden = openKey !== key; b.innerHTML = openKey === key && p ? contentHTML(p) : ''; }
    for (const c of byKey('data-stage-chip', key)) {
      if (!c.classList.contains('pnl-chip')) continue;
      c.setAttribute('aria-expanded', String(openKey === key));
      const car = c.querySelector('.aer-car'); if (car) car.textContent = openKey === key ? '▾' : '▸';
    }
  }
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
    const c = e.target.closest && e.target.closest('[data-stage-chip]'); if (!c) return;
    e.preventDefault(); toggle(c.getAttribute('data-stage-chip'));
  });

  const api = { NEXT, next, isOpen, boxHTML, contentHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelStageChip = api;
})(typeof window !== 'undefined' ? window : globalThis);
