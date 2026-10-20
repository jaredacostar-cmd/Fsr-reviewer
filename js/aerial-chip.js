/* What is on the ground, in a development's header (PeelAerialChip): beside the stage chip ("Under
 * construction"), a second chip reads the files, the permits' history, the site servicing permit and
 * the latest aerial photo together (js/phase-estimate.js): "On site: likely built · high confidence ·
 * files say under construction". Pressing it opens, under the header, each piece of evidence and then
 * the aerial check: the photos before and after, the likelihood and the signals. The check runs once
 * per development when its header first shows (js/devtab.js aerialRun, shared with the Site view).
 * An estimate from records and photos, not a site inspection.
 *
 * Pure: label() turns a check result and the development's stage into the chip's words and tone
 * (tests/aerial-chip.test.js).
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // The aerial status (js/aerial.js score) in the chip's words.
  const WORDS = {
    'Not visibly started': 'not visibly started',
    'Likely under construction': 'likely under construction',
    'Likely completed': 'likely built',
    'Completed in the records; not confirmed on the aerial': 'not confirmed built',
  };
  /** The chip for a check result: { text, tone, note }. The tone marks a photo that disagrees with the
   *  records: built in the records, not confirmed on the photo. (A permit or construction site always
   *  reads at least "likely under construction": js/aerial.js score.) */
  function label(result, phase, year) {
    if (!result) return null;
    const w = WORDS[result.status] || String(result.status || '').toLowerCase();
    const odd = result.status === 'Completed in the records; not confirmed on the aerial';
    return { text: `Aerial${year ? ` ${year}` : ''}: ${w}`, tone: odd ? 'tight' : 'aer', note: odd ? 'differs from the records' : '' };
  }
  const yearOf = r => (r && r.years && r.src && r.src.years && r.src.years[r.years.latest] ? (String(r.src.years[r.years.latest].label).match(/\d{4}/) || [r.years.latest])[0] : r && r.years ? r.years.latest : null);

  // ---- Browser ---------------------------------------------------------------------------------
  const DT = () => root.DevTab;
  const runs = new Map();   // key → { state: 'run' | 'done' | 'fail', result (js/aerial.js check: its .result is the score), error }
  let openKey = null;
  function start(p) {
    if (!p || runs.has(p.key) || !DT() || !DT().aerialRun) return;
    const run = DT().aerialRun(p); if (!run) return;
    runs.set(p.key, { state: 'run' });
    run.then(r => { runs.set(p.key, { state: 'done', result: r }); refresh(p); })
      .catch(e => { runs.set(p.key, { state: 'fail', error: e && e.message }); refresh(p); });
  }
  const hasAerial = p => !!(p && DT() && DT().aerialAvailable && DT().aerialAvailable(p));
  // The combined reading (js/phase-estimate.js): the files, the permits, the site servicing permit
  // (js/dc-gate.js) and the aerial check, as far as it has run.
  function estimateOf(p) {
    const E = root.PeelPhaseEstimate; if (!E || !p) return null;
    const st = runs.get(p.key), DG = root.PeelDcGate, row = DG && DG.rowOf ? DG.rowOf(p) : null;
    return E.estimate(p, {
      aerial: st && st.state === 'done' ? st.result : null,
      aerialState: !hasAerial(p) ? 'none' : !st || st.state === 'run' ? 'run' : st.state,
      servicing: row ? row.evidence : null,
    });
  }
  // The chip shows where there is a photo to read, or permits to read on their own.
  const shows = p => !!p && (hasAerial(p) || (!!root.PeelPhaseEstimate && ['permit', 'construction', 'completed'].includes(p.phase)));
  /** The chip for a development's header ('' where neither a photo nor a permit says anything). */
  function chipHTML(p) {
    if (!shows(p)) return '';
    if (hasAerial(p) && !runs.has(p.key)) setTimeout(() => start(p), 0);
    const st = runs.get(p.key) || { state: hasAerial(p) ? 'run' : 'none' }, on = openKey === p.key;
    const est = estimateOf(p), E = root.PeelPhaseEstimate;
    const tip = 'Where the site most likely stands now, from its files, permits, servicing permit and the latest aerial photo: an estimate, not a site inspection. Press to see the evidence and the photos.';
    let text = 'Aerial: comparing photos…', tone = 'wait';
    if (est) ({ text, tone } = E.chipText(est));
    else if (st.state === 'done') { const L = label(st.result.result, p.phase, yearOf(st.result)); text = L.text + (L.note ? ` · ${L.note}` : ''); tone = L.tone; }
    else if (st.state === 'fail') { text = 'Aerial: unavailable'; tone = 'wait'; }
    return `<button type="button" class="pnl-chip aer-chip t-${tone}" data-aer-chip="${esc(p.key)}" aria-expanded="${on}" title="${esc(tip)}"><span class="aer-ico" aria-hidden="true"></span>${esc(text)} <span class="aer-car" aria-hidden="true">${on ? '▾' : '▸'}</span></button>`;
  }
  /** The place the evidence and the check open in, under the header. */
  const boxHTML = p => (shows(p) ? `<div class="aer-box" data-aer-box="${esc(p.key)}"${openKey === p.key ? '' : ' hidden'}></div>` : '');
  /** The combined reading and its evidence, above the photos. */
  function estimateHTML(est) {
    if (!est) return '';
    return `<div class="pe-head"><strong>On site: ${esc(est.label)}</strong> <span class="muted">· ${esc(est.confidence)} confidence</span></div>
      <p class="small">${est.differs ? `The files say <strong>${esc(est.filesLabel)}</strong>; the evidence below puts the site ${est.ahead ? 'further along' : 'less far along'}. The stage stays as the files set it.` : `Agrees with the files (${esc(est.filesLabel)}).`}</p>
      <ul class="aerial-signals pe-ev">${est.evidence.map(e => `<li>${e.effect > 0 ? '<span class="sig up" aria-label="raises">▲</span>' : e.effect < 0 ? '<span class="sig down" aria-label="lowers">▼</span>' : '<span class="sig" aria-hidden="true">•</span>'}<span><span class="pe-src">${esc(e.src)}</span> ${esc(e.text)}</span></li>`).join('')}</ul>`;
  }

  // A canvas copy, so the photos can show here and in the Site view at once.
  const copyCanvas = c => { if (!c) return c; const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d').drawImage(c, 0, 0); return n; };
  function fill(box, key) {
    const st = runs.get(key), p = projectOf(key), est = estimateOf(p);
    const foot = '<p class="aer-foot small"><button type="button" class="btn small link" data-aer-close>Close</button></p>';
    if (!st || st.state !== 'done') {
      const msg = !st && !(p && hasAerial(p)) ? '' : !st || st.state === 'run' ? '<p class="small muted aerial-loading">Comparing aerial photos…</p>' : `<p class="small muted">Aerial check unavailable: ${esc(st.error || 'the photos did not load')}.</p>`;
      box.innerHTML = estimateHTML(est) + msg + (est ? foot : '');
      if (est && st && st.state === 'fail') box.dataset.filled = '1';
      if (est && !(p && hasAerial(p))) box.dataset.filled = '1';
      return;
    }
    const r = st.result, copy = { ...r, before: r.before ? { ...r.before, canvas: copyCanvas(r.before.canvas) } : null, latest: { ...r.latest, canvas: copyCanvas(r.latest.canvas) } };
    box.innerHTML = `${estimateHTML(est)}${est ? '<h3 class="pe-sub small">The aerial check</h3>' : ''}<div class="pe-aer"></div>${foot}`;
    DT().renderAerialInto(box.querySelector('.pe-aer'), copy);
    box.dataset.filled = '1';
  }
  const projectOf = key => { const N = root.PeelDevNav, d = root.DevScope && root.DevScope.current && root.DevScope.current(); return d && d.key === key ? d : N && N.projectByKey ? N.projectByKey(key) : null; };
  const byKey = (sel, key) => [...document.querySelectorAll(sel)].filter(e => e.getAttribute(sel.match(/data-[\w-]+/)[0]) === key);
  // A result arrived: the chips say it, and an open box fills.
  function refresh(p) {
    for (const b of byKey('[data-aer-chip]', p.key)) b.outerHTML = chipHTML(p);
    for (const x of byKey('[data-aer-box]', p.key)) if (!x.hidden) fill(x, p.key);
  }
  function toggle(key) {
    openKey = openKey === key ? null : key;
    const p = root.DevScope && root.DevScope.current && root.DevScope.current();
    for (const x of byKey('[data-aer-box]', key)) { x.hidden = openKey !== key; if (!x.hidden && !x.dataset.filled) fill(x, key); }
    if (p && p.key === key) for (const b of byKey('[data-aer-chip]', key)) b.outerHTML = chipHTML(p);
  }
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => {
      const c = e.target.closest && e.target.closest('[data-aer-chip]'); if (c) { e.preventDefault(); toggle(c.getAttribute('data-aer-chip')); return; }
      if (e.target.closest && e.target.closest('[data-aer-close]')) { const b = e.target.closest('[data-aer-box]'); if (b) toggle(b.getAttribute('data-aer-box')); }
    });
    // Panels and pages are rebuilt from their specs: an open box that comes back empty is filled again.
    let raf = 0;
    const mo = new MutationObserver(() => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; for (const x of document.querySelectorAll('[data-aer-box]:not([hidden])')) if (!x.dataset.filled) fill(x, x.getAttribute('data-aer-box')); }); });
    const go = () => mo.observe(document.body, { childList: true, subtree: true });
    if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
  }

  const api = { WORDS, label, yearOf, chipHTML, boxHTML, start, estimateHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAerialChip = api;
})(typeof window !== 'undefined' ? window : globalThis);
