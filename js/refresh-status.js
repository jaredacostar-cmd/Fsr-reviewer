/* The weekly data update's status (data/refresh.json, written by the weekly refresh in
 * .github/workflows/site.yml): while this week's data is held for review, a notice under the
 * unofficial banner says so and which date the app shows, so an older date never passes for the
 * latest. Pure parts run in Node (tests/refresh-status.test.js).
 *   data/refresh.json: { version, status: 'ok' | 'held', checked: date, shown: date, reasons: [], issue }
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const day = d => {
    const t = new Date(`${String(d || '').slice(0, 10)}T12:00:00Z`);
    return isNaN(t) ? String(d || '') : t.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };
  /** The notice while an update is held ('' otherwise), with the date the app shows. */
  function noticeHTML(st, shownDate) {
    if (!st || st.status !== 'held') return '';
    const why = (st.reasons || []).length ? ` (${esc(st.reasons.slice(0, 2).join('; '))}${st.reasons.length > 2 ? '; …' : ''})` : '';
    const link = /^https:\/\/github\.com\//.test(st.issue || '') ? ` <a href="${esc(st.issue)}" target="_blank" rel="noopener">See why</a>` : '';
    const shown = shownDate || st.shown;
    return `<strong>This week’s data update${st.checked ? ` (${esc(day(st.checked))})` : ''} is waiting for review</strong>${why}${shown ? `: the app shows data as of ${esc(day(shown))}` : ''}.${link}`;
  }
  const held = st => !!st && st.status === 'held';
  async function load() {
    try { const r = await fetch('data/refresh.json', { cache: 'no-cache' }); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }
  function render(st, shownDate) {
    const el = typeof document !== 'undefined' && document.getElementById('refresh-held'); if (!el) return;
    const h = noticeHTML(st, shownDate); el.innerHTML = h; el.hidden = !h;
    // (the notice moves the top bar down: the layout measures where it ends again, js/app.js --top-h)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('resize'));
  }
  const api = { noticeHTML, held, load, render };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelRefresh = api;
})(typeof window !== 'undefined' ? window : globalThis);
