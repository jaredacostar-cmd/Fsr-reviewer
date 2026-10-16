(function (root) {
  'use strict';
  // ---- The standard panel (Stage 3) -------------------------------------------------------------
  // Every panel (every tab at every scope, every tool result, every map pop-up that opens a scope)
  // renders the same sections, in this order:
  //   1 header (sticky): trail / back, close ×; name; status chip; one identity line
  //   2 scenario chip (read-only) wherever a calculated number appears; it opens the Scenario control
  //   3 answer: one plain sentence answering the panel's question
  //   4 key figures: at most four, 2×2, each with its unit and one context line
  //   5 one chart (capacity: the stacked bar with the 90% and 100% marks)
  //   6 short lists: the top 3–5 rows, "See all (n)"; each row (≥ 44 px) opens the next level
  //   7 folded "Method and basis" and "Sources"
  //   8 footer (sticky): one primary action, at most two secondary, always "Open full table"; the
  //     screening note
  // Colours: amber = tight, red = over, teal = room, violet = stage; blue only for actions; never
  // colour alone (each chip and row says it in words too). Pure builder: tests/standard-panel.test.js.
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const SECTIONS = ['header', 'scenario', 'answer', 'figures', 'chart', 'list', 'method', 'sources', 'footer'];
  const NOTE = "General screening results only. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results.";
  const TONES = { over: 'Over', tight: 'Tight', room: 'Room', stage: '' };
  // The tone of a % of capacity at build-out: over ≥ 100, tight ≥ 90 (the expansion trigger), else room.
  const toneOf = pct => (pct == null || !isFinite(pct) ? null : pct >= 100 ? 'over' : pct >= 90 ? 'tight' : 'room');
  // A status chip: the tone in words (never colour alone) and, optionally, more text.
  const chip = s => (s ? `<span class="pnl-chip t-${esc(s.tone || 'stage')}">${esc(s.text || TONES[s.tone] || '')}</span>` : '');
  // Attributes from an object ({ 'data-ss': 'plant:Lakeview' } → data-ss="plant:Lakeview").
  const attrs = a => Object.entries(a || {}).map(([k, v]) => (v === true ? ` ${k}` : v == null || v === false ? '' : ` ${k}="${esc(v)}"`)).join('');
  const btn = (b, cls) => `<button type="button" class="btn small ${cls}"${attrs(b.attrs)}${b.title ? ` title="${esc(b.title)}"` : ''}>${esc(b.label)}</button>`;

  /**
   * spec: { key, head: { trail: [{ label, attrs }], close: attrs | null, name, status: { tone, text },
   *           identity }, scenario: html (the chip; required when calc is true), calc: bool,
   *         answer: html, figures: [{ v, u, label, ctx, tone }] (≤ 4), chart: html,
   *         lists: [{ title, rows: [{ html, attrs, tone }], total, seeAll: attrs }],
   *         method: html, sources: html,
   *         foot: { primary: { label, attrs }, secondary: [{ label, attrs }] (≤ 1 besides the table),
   *                 fullTable: attrs } }
   * Sections with nothing to show are left out, never blank; the header, answer and footer are always there.
   */
  function html(spec) {
    const s = spec || {}, h = s.head || {};
    // The trail: shown from two levels down (at Peel it would only repeat the name).
    const trail = (h.trail || []).length < 2 ? '' : h.trail.map((t, i, a) => (t.attrs ? `<button type="button" class="btn small link pnl-crumb"${attrs(t.attrs)}>${esc(t.label)}</button>` : `<span class="pnl-crumb">${esc(t.label)}</span>`)).join('<span class="pnl-sep" aria-hidden="true">›</span>');
    const out = [];
    out.push(`<header class="pnl-head" data-sec="header">
      <div class="pnl-head-top">${trail ? `<nav class="pnl-trail" aria-label="Scope">${trail}</nav>` : ''}${h.close ? `<button type="button" class="btn small pnl-x"${attrs(h.close)} aria-label="Close">×</button>` : ''}</div>
      <div class="pnl-title"><h2 class="pnl-name">${esc(h.name || '')}</h2>${chip(h.status)}</div>
      ${h.identity ? `<p class="pnl-id small muted">${h.identity}</p>` : ''}${h.extra || ''}
    </header>`);
    if (s.calc || s.scenario) out.push(`<div class="pnl-scen" data-sec="scenario">${s.scenario || scenarioChip()}</div>`);
    out.push(`<p class="pnl-answer" data-sec="answer">${s.answer || ''}</p>`);
    const figs = (s.figures || []).slice(0, 4);
    if (figs.length) out.push(`<div class="pnl-figs" data-sec="figures">${figs.map(f => `<div class="pnl-fig${f.tone ? ` t-${esc(f.tone)}` : ''}"><b>${f.v}</b>${f.u ? `<span class="pnl-u">${esc(f.u)}</span>` : ''}<span class="pnl-l">${esc(f.label)}</span>${f.ctx ? `<small>${f.ctx}</small>` : ''}</div>`).join('')}</div>`);
    if (s.chart) out.push(`<div class="pnl-chart" data-sec="chart">${s.chart}</div>`);
    for (const l of (s.lists || []).filter(x => x && x.rows && x.rows.length)) {
      out.push(`<section class="pnl-list" data-sec="list">${l.title || l.tools ? `<div class="pnl-list-h">${l.title ? `<h3>${esc(l.title)}</h3>` : ''}${l.tools || ''}</div>` : ''}
        <ul>${l.rows.slice(0, 5).map(r => `<li class="pnl-row${r.tone ? ` t-${esc(r.tone)}` : ''}"${r.attrs ? `${attrs(r.attrs)} tabindex="0" role="button"` : ''}>${r.html}</li>`).join('')}</ul>
        ${l.total > Math.min(5, l.rows.length) ? `<button type="button" class="btn small link pnl-all"${attrs(l.seeAll)}>See all (${l.total}) →</button>` : ''}</section>`);
    }
    if (s.method) out.push(`<details class="pnl-fold" data-sec="method"><summary>Method and basis</summary><div class="small muted">${s.method}</div></details>`);
    if (s.sources) out.push(`<details class="pnl-fold" data-sec="sources"><summary>Sources</summary><div class="small muted">${s.sources}</div></details>`);
    const f = s.foot || {}, sec = (f.secondary || []).slice(0, 1);
    out.push(`<footer class="pnl-foot" data-sec="footer"><div class="pnl-acts">${f.primary ? btn(f.primary, 'pnl-primary') : ''}${btn({ label: 'Open full table', attrs: { 'data-full-table': s.key || '', ...(f.fullTable || {}) } }, 'pnl-sec')}${sec.map(b => btn(b, 'pnl-sec')).join('')}</div>
      <p class="pnl-note small">${NOTE}</p></footer>`);
    return `<article class="pnl" data-panel="${esc(s.key || '')}">${out.join('')}</article>`;
  }
  // The sections a rendered panel holds, in order (tests).
  const sectionsOf = h => [...String(h).matchAll(/data-sec="(\w+)"/g)].map(m => m[1]);

  // ---- Browser ---------------------------------------------------------------------------------
  // The read-only scenario chip: the same settings as the top bar's chip; a click opens the control.
  function scenarioChip() {
    const T = root.PeelTopbar, p = T && T.scenParts ? T.scenParts() : null;
    const txt = p ? [`Count: ${p.count}`, `Flows: ${p.flows}`, `Criteria: ${p.criteria}`].join(' · ') : 'Scenario';
    return `<button type="button" class="pnl-scen-chip" data-pnl-scen title="The scenario these figures are worked out for: open the Scenario control to change it">Scenario <span>${esc(txt)}</span> ▾</button>`;
  }
  // "Open full table": the full-width Engineering table for the same scope, filters and scenario.
  // Panels register a builder per key; Esc (or Close) returns to the panel.
  const FULL = {};
  const register = (key, fn) => { FULL[key] = fn; };
  let lastFocus = null;
  function openFull(key) {
    const fn = FULL[key]; if (!fn || typeof document === 'undefined') return false;
    let el = document.getElementById('full-table');
    if (!el) { el = document.createElement('div'); el.id = 'full-table'; el.className = 'full-table'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); document.body.appendChild(el); }
    const r = fn() || {};
    lastFocus = document.activeElement;
    el.innerHTML = `<div class="ft-head"><div><h2>${esc(r.title || 'Full table')}</h2>${r.sub ? `<p class="small muted">${r.sub}</p>` : ''}</div>${r.scenario === false ? '' : `<div class="ft-scen">${scenarioChip()}</div>`}<button type="button" class="btn small" data-full-close>Close <kbd>Esc</kbd></button></div>
      <div class="ft-body">${r.html || ''}</div><p class="pnl-note small ft-note">${NOTE}</p>`;
    el.hidden = false; document.documentElement.classList.add('full-table-open');
    const c = el.querySelector('[data-full-close]'); if (c) c.focus();
    return true;
  }
  function closeFull() {
    const el = typeof document !== 'undefined' && document.getElementById('full-table'); if (!el || el.hidden) return false;
    el.hidden = true; document.documentElement.classList.remove('full-table-open');
    if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* gone */ }
    return true;
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      if (!e.target.closest) return;
      const ft = e.target.closest('[data-full-table]'); if (ft) { openFull(ft.dataset.fullTable); return; }
      if (e.target.closest('[data-full-close]')) { closeFull(); return; }
      if (e.target.closest('[data-pnl-scen]')) { const T = root.PeelTopbar; if (T && T.openScenPop) T.openScenPop(); return; }
      // A development's header: back to Peel (close the scope); its memo.
      if (e.target.closest('[data-pnl-dev-close]')) { if (root.DevScope) root.DevScope.close(); return; }
      if (e.target.closest('[data-pnl-memo]')) { const p = root.DevScope && root.DevScope.current(), R = root.PeelReports; if (p && R && R.devMemo) R.devMemo(p); }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && closeFull()) { e.stopPropagation(); return; }
      // A list row is a button: Enter / Space opens it.
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('pnl-row') && e.target.getAttribute('role') === 'button') { e.preventDefault(); e.target.click(); }
    }, true);
  }
  const api = { SECTIONS, NOTE, toneOf, chip, html, sectionsOf, scenarioChip, register, openFull, closeFull };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPanel = api;
})(typeof window !== 'undefined' ? window : globalThis);
