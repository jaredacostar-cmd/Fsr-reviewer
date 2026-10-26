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
  //     (then any other folded sections a panel needs, e.g. a development's About and Files)
  //   7 folded "Method and basis" and "Sources"
  //   8 footer (sticky): one primary action, at most two secondary, always "Open full table"; the
  //     screening note
  // Colours: amber = tight, red = over, teal = room, violet = stage; blue only for actions; never
  // colour alone (each chip and row says it in words too). Pure builder: tests/standard-panel.test.js.
  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  const SECTIONS = ['header', 'scenario', 'answer', 'figures', 'chart', 'list', 'fold', 'method', 'sources', 'footer'];
  const NOTE = "General screening results only. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results.";
  const TONES = { over: 'Over', tight: 'Tight', room: 'Room', stage: '' };
  // The tone of a % of capacity at build-out: over ≥ 100, tight ≥ 90 (the expansion trigger), else room.
  const toneOf = pct => (pct == null || !isFinite(pct) ? null : pct >= 100 ? 'over' : pct >= 90 ? 'tight' : 'room');
  // A status chip: the tone in words (never colour alone) and, optionally, more text.
  // A chip that opens its answer is a button, with ▸ (▾ while what it opens shows); a plain chip is a label.
  const chip = s => (!s ? '' : s.attrs
    ? `<button type="button" class="pnl-chip pnl-chip-btn t-${esc(s.tone || 'stage')}"${attrs(s.attrs)}${s.expanded != null ? ` aria-expanded="${!!s.expanded}"` : ''}${s.title ? ` title="${esc(s.title)}"` : ''}>${esc(s.text || TONES[s.tone] || '')} <span class="aer-car" aria-hidden="true">${s.expanded ? '▾' : '▸'}</span></button>`
    : `<span class="pnl-chip t-${esc(s.tone || 'stage')}">${esc(s.text || TONES[s.tone] || '')}</span>`);
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
  // A calculated number: a flow, volume, share of capacity or people at Peel design criteria. A panel
  // that shows one gets the scenario chip even if its spec forgot to ask for it (calc).
  const CALC = /\d\s*(?:ML\/d|L\/s|ML\b|m³\/d|%|people\b)/;
  const strip = t => String(t == null ? '' : t).replace(/<[^>]*>/g, ' ');
  const calcIn = s => CALC.test([s.answer, ...(s.figures || []).map(f => f && `${strip(f.v)} ${f.u || ''} ${f.ctx || ''}`), ...(s.lists || []).flatMap(l => (l && l.rows ? l.rows.slice(0, 5) : []).map(r => r.html))].map(strip).join(' '));
  // Stage 5: "Report a data issue" in every footer, at the end of the actions row (js/report-issue.js
  // fills the issue on click).
  const reportLink = (key, name, where) => (root.PeelReportIssue && root.PeelReportIssue.panelLinkHTML ? `<span class="pnl-report-line small">${root.PeelReportIssue.panelLinkHTML(key, strip(name).trim(), where)}</span>` : '');
  function html(spec) {
    const s = spec || {}, h0 = spec && spec.head || {};
    // A header count ("9 over", "1 late", "1 open for comment") opens the panel's full table.
    const h = h0.status && !h0.status.attrs && h0.status.tone !== 'stage' ? { ...h0, status: { ...h0.status, attrs: { 'data-full-table': s.key || '' }, title: 'Open the full table' } } : h0;
    // The trail: shown from two levels down (at Peel it would only repeat the name).
    const trail = (h.trail || []).length < 2 ? '' : h.trail.map((t, i, a) => (t.attrs ? `<button type="button" class="btn small link pnl-crumb"${attrs(t.attrs)}>${esc(t.label)}</button>` : `<span class="pnl-crumb">${esc(t.label)}</span>`)).join('<span class="pnl-sep" aria-hidden="true">›</span>');
    const out = [];
    out.push(`<header class="pnl-head" data-sec="header">
      <div class="pnl-head-top">${trail ? `<nav class="pnl-trail" aria-label="Scope">${trail}</nav>` : ''}${h.close ? `<button type="button" class="btn small pnl-x"${attrs(h.close)} aria-label="Close">×</button>` : ''}</div>
      <div class="pnl-title"><h2 class="pnl-name">${esc(h.name || '')}</h2>${chip(h.status)}${h.badge || ''}</div>
      ${h.identity ? `<p class="pnl-id small muted">${h.identity}</p>` : ''}${h.extra || ''}
    </header>`);
    if (s.calc || s.scenario || calcIn(s)) out.push(`<div class="pnl-scen" data-sec="scenario">${s.scenario || scenarioChip()}</div>`);
    // Bundle 5: the first use of each term in the answer and the figures is underlined (js/glossary.js).
    const seen = new Set(), gl = h => (root.PeelGlossary ? root.PeelGlossary.mark(h, seen) : h);
    out.push(`<p class="pnl-answer" data-sec="answer">${gl(s.answer || '')}</p>`);
    // A zero is never coloured ("0 tight" in green read as good news); n/a is never a figure (bundle 5).
    const figs = (s.figures || []).filter(f => f && !/^(n\/a|–|-)$/i.test(String(f.v))).slice(0, 4).map(f => (String(f.v) === '0' && f.tone ? { ...f, tone: null } : f));
    // Each figure's "?" opens how it is worked out (js/how.js): its inputs, rule and data files.
    if (figs.length) out.push(`<div class="pnl-figs" data-sec="figures">${figs.map((f, i) => `<div class="pnl-fig${f.tone ? ` t-${esc(f.tone)}` : ''}"${f.attrs ? `${attrs(f.attrs)} role="button" tabindex="0"` : ''}><b>${f.v}</b>${f.u ? `<span class="pnl-u">${esc(f.u)}</span>` : ''}<span class="pnl-l">${gl(esc(f.label))}</span>${f.ctx ? `<small>${gl(f.ctx)}</small>` : ''}${root.PeelHow ? root.PeelHow.button(f, s, i) : ''}</div>`).join('')}</div>`);
    if (s.chart) out.push(`<div class="pnl-chart" data-sec="chart">${s.chart}</div>`);
    for (const l of (s.lists || []).filter(x => x && x.rows && x.rows.length)) {
      out.push(`<section class="pnl-list" data-sec="list">${l.title || l.tools ? `<div class="pnl-list-h">${l.title ? `<h3>${esc(l.title)}</h3>` : ''}${l.tools || ''}</div>` : ''}
        <ul>${l.rows.slice(0, 5).map(r => `<li class="pnl-row${r.kv ? ' kv' : ''}${r.tone ? ` t-${esc(r.tone)}` : ''}"${r.attrs ? `${attrs(r.attrs)} tabindex="0" role="button"` : ''}>${r.html}</li>`).join('')}</ul>
        ${l.total > Math.min(5, l.rows.length) ? `<button type="button" class="btn small link pnl-all"${attrs(l.seeAll)}>See all (${l.total}) →</button>` : ''}</section>`);
    }
    for (const fo of (s.folds || []).filter(x => x && x.html)) out.push(`<details class="pnl-fold" data-sec="fold"${fo.open ? ' open' : ''}${fo.id ? ` id="${esc(fo.id)}"` : ''}><summary>${esc(fo.title)}</summary><div>${fo.html}</div></details>`);
    if (s.method) out.push(`<details class="pnl-fold" data-sec="method"><summary>Method and basis</summary><div class="small muted">${s.method}</div></details>`);
    if (s.sources) out.push(`<details class="pnl-fold" data-sec="sources"><summary>Sources</summary><div class="small muted">${s.sources}</div></details>`);
    const f = s.foot || {}, sec = (f.secondary || []).slice(0, 1);
    out.push(`<footer class="pnl-foot" data-sec="footer"><div class="pnl-acts">${f.primary ? btn(f.primary, 'pnl-primary') : ''}${btn({ label: 'Open full table', attrs: { 'data-full-table': s.key || '', ...(f.fullTable || {}) } }, 'pnl-sec')}${sec.map(b => btn(b, 'pnl-sec')).join('')}</div>
      <div class="pnl-phone-ctx small">${scenarioChip()}${yearsChip()}</div>
      <p class="pnl-note small">${NOTE}${reportLink(s.key, h.name)}</p></footer>`);
    return `<article class="pnl" data-panel="${esc(s.key || '')}">${out.join('')}</article>`;
  }
  // A label / value row for a short list (the site panel's Timing and Site).
  const kv = (label, value, tone) => ({ html: `<div class="pnl-kv"><span>${label}</span><span${tone ? ` class="t-${esc(tone)}"` : ''}>${value}</span></div>`, kv: true });
  // The sections a rendered panel holds, in order (tests).
  const sectionsOf = h => [...String(h).matchAll(/data-sec="(\w+)"/g)].map(m => m[1]);

  // ---- Browser ---------------------------------------------------------------------------------
  // The read-only scenario chip: the same settings as the top bar's chip; a click opens the control.
  function scenarioChip() {
    const T = root.PeelTopbar, p = T && T.scenParts ? T.scenParts() : null;
    // "Default" or "n changes"; the settings in full on hover and in the Scenario control (bundle 5).
    const LB = root.PeelLayerBar, txt = p && p.settings ? p.text : 'Default';
    const line = p && p.settings && LB ? LB.scenarioLine(p.settings) : '';
    return `<button type="button" class="pnl-scen-chip" data-pnl-scen title="The scenario these figures are worked out for${line ? `: ${esc(line)}` : ''}. Open the Scenario control to see or change it">Scenario <span>${esc(txt)}</span> ▾</button>`;
  }
  // The years the figures follow: on a phone (where the timeline hides under the panel) a button in the
  // panel opens Find › When, as the scenario chip opens the Scenario control.
  function yearsChip() {
    const S = root.PeelApp && root.PeelApp.state; if (!S) return '';
    const on = S.yearFrom != null || S.yearTo != null, a = S.yearFrom ?? S.yearMin, b = S.yearTo ?? S.yearMax;
    return `<button type="button" class="pnl-scen-chip" data-pnl-years title="The years shown: set them in Find › When">Years <span>${on ? esc(a === b ? `${a}` : `${a}–${b}`) : 'all'}</span> ▾</button>`;
  }
  // ---- Shared headers -------------------------------------------------------------------------------
  // An area panel: Peel (› the municipality filter) › the tab and sub-view; named by its question.
  function areaHead(where, name, status, identity) {
    const A = root.PeelApp, muni = A && A.state && A.state.muni;
    return { trail: [{ label: 'Peel' }, ...(muni ? [{ label: muni }] : []), { label: where }], name, status: status || null, identity: identity || esc(muni || 'Peel') };
  }
  // A development's header on every tab: Peel › municipality › the site, ×; its stage; the latest file
  // number (how the municipality identifies it), the application types and the latest submission.
  // Bundle 5: a municipality's application type in words ("OPA ZBA Subdivision" → "official plan,
  // zoning and subdivision"); other types in sentence case.
  const TYPE_WORDS = [
    [/^opa\s*zba\s*subdivision$/i, 'official plan, zoning and subdivision'], [/^pre[\s-]?consultation$/i, 'pre-consultation'],
    [/^site\s*plan(\s*approval)?$/i, 'site plan'], [/^site\s*plan\s*express$/i, 'site plan (express)'],
    [/^(rezoning|zoning by-law amendment|zba)$/i, 'zoning amendment'], [/^(official plan amendment|opa)$/i, 'official plan amendment'],
    [/^(plan of subdivision|subdivision)$/i, 'subdivision'], [/^(draft plan of condo(minium)?|condominium|plan of condominium)$/i, 'condominium'],
    [/^removal of 'h' holding symbol$/i, 'removal of the holding (H) symbol'],
  ];
  const typeWords = t => { const s = String(t || '').trim(), hit = TYPE_WORDS.find(([re]) => re.test(s)); return hit ? hit[1] : s === s.toUpperCase() ? s.toLowerCase() : s; };
  const typesText = types => { const out = [...new Set((types || []).map(typeWords).filter(Boolean))].slice(0, 3).join(' · '); return out ? out[0].toUpperCase() + out.slice(1) : ''; };
  function siteHead(p) {
    const ML = root.PeelMapLabels, ls = ML && ML.latestSub ? ML.latestSub(p) : null, PH = root.PeelPhases;
    const day = d => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const types = typesText(p.types);
    const SC = root.PeelStageChip, AC = root.PeelAerialChip, nRec = (p.records || []).length;
    const h = { trail: [{ label: 'Peel', attrs: { 'data-pnl-dev-close': '' } }, { label: p.municipality }, { label: p.title }], close: { 'data-pnl-dev-close': '' }, name: p.title,
      // One status line: the development's phase, with its zoning approval where that came first (the
      // site bar no longer shows a second, contradicting chip).
      status: { tone: 'stage', text: `${PH && PH.PHASE_BY_KEY[p.phase] ? PH.PHASE_BY_KEY[p.phase].label : p.phase}${p.zoningApproved && PH && PH.PHASE_BY_KEY.approved && p.rank < PH.PHASE_BY_KEY.approved.rank ? ' · zoning approved' : ''}${p.smallSite ? ' · no site plan needed' : ''}`,
        // (pressed: How the stage was set, under the header: js/stage-chip.js)
        ...(SC ? { attrs: { 'data-stage-chip': p.key }, expanded: SC.isOpen(p.key), title: 'How the stage was set: the file that set it, and what it needs next' } : {}) },
      identity: [ls && ls.ref ? `<button type="button" class="pnl-file tr-ref" data-dev-file="${esc(ls.ref)}" title="Its source record, in History">${esc(ls.ref)}</button>` : '', types ? esc(types) : '', ls && ls.date ? `latest submission ${esc(day(ls.date))}` : '',
        nRec ? `<button type="button" class="btn small link" data-dev-hist="" title="History, with each file's source record">${nRec} file${nRec === 1 ? '' : 's'} · history ›</button>` : ''].filter(Boolean).join(' · ') || esc(p.municipality),
      // Beside the stage, what the latest aerial photo shows; pressed, the check opens under the header.
      badge: AC ? AC.chipHTML(p) : '', extra: `${SC ? SC.boxHTML(p) : ''}${AC ? AC.boxHTML(p) : ''}` };
    // And, for a development in the DC pipeline, whether it counts (js/dc-gate.js).
    const DG = root.PeelDcGate;
    if (DG) { h.badge += DG.chipHTML(p); h.extra += DG.boxHTML(p); }
    return h;
  }
  // ---- Panels in the right-hand column ---------------------------------------------------------
  // Each tab has one panel slot (#pnl-<tab>, above its sub-views' panes). A renderer hands over the
  // panel of its sub-view with set('svc:capacity', spec); the slot shows the panel of the open tab and
  // sub-view, for the scope it was made for (a development, a servicing scope, or the area). Until a
  // sub-view has a panel for the current scope, its detailed panes show as before.
  const STORE = new Map();
  const HEAD = '<header class="pnl-head" data-sec="header">';
  const AT = () => root.PeelAnalysisTabs;
  const scopeId = () => {
    const d = root.DevScope && root.DevScope.current && root.DevScope.current(); if (d) return `dev:${d.key}`;
    const ss = root.PeelSvcScope && root.PeelSvcScope.current && root.PeelSvcScope.current(); if (ss) return `ss:${ss.ref || ss.key || ss.title}`;
    return 'area';
  };
  const keyNow = () => { const A = AT(); if (!A) return ''; const t = A.getFootTab(), s = A.TABSUBS[t]; return `${t}:${s ? s.get() : ''}`; };
  // onMount(host): runs each time the panel is put on screen (fills async checks into its containers).
  function set(key, spec) {
    STORE.set(key, { html: typeof spec === 'string' ? spec : html({ key, ...spec }), scope: scopeId(), title: (spec && spec.fullTitle) || '', onMount: spec && spec.onMount, spec: typeof spec === 'string' ? null : spec });
    if (key === keyNow()) sync();
    // (Stage 4: Home reads the Peel Overview panel's figures from here, so they are the map's.)
    if (typeof document !== 'undefined' && typeof CustomEvent === 'function') document.dispatchEvent(new CustomEvent('pnl:set', { detail: { key, scope: scopeId() } }));
  }
  // (views waiting to render out of sight render first: their panels are read here)
  const get = key => { if (root.PeelUtil && root.PeelUtil.flushLater) root.PeelUtil.flushLater(); return STORE.get(key) || null; };
  const clear = key => { STORE.delete(key); if (key === keyNow()) sync(); };
  function sync() {
    if (typeof document === 'undefined') return;
    const A = AT(), an = document.getElementById('analysis'); if (!A || !an) return;
    // (a workspace page is open over the map: it shows these panels itself, so the slots stay empty and
    // no element id is on screen twice)
    const Wp = root.PeelWorkspaces;
    if (Wp && Wp.mode && Wp.mode() === 'home') { document.querySelectorAll('.pnl-host').forEach(h => { h.innerHTML = ''; h.dataset.v = ''; }); return; }
    const t = A.getFootTab(), key = keyNow(), e0 = STORE.get(key);
    // Stage 4: a workspace may show its own view of a sub-view (Check a site before a site is picked,
    // Old pipes, This week) and names its source in the header ("Getting tight · from Servicing ›
    // Capacity", with Open full map).
    const W = root.PeelWorkspaces, ov = W && W.override ? W.override(key, scopeId()) : null;
    // (a result kept at its development, the Inquiry draft: its host shows on Overview, not the site's panel)
    const kept = t === 'overview' && root.PeelSvcScope && root.PeelSvcScope.keepsDev && root.PeelSvcScope.keepsDev();
    const e = kept ? null : ov ? { html: html({ key, ...ov }), onMount: ov.onMount } : e0 && e0.scope === scopeId() ? e0 : null, ok = !!e;
    const v = e ? (W && W.srcLine ? e.html.replace(HEAD, `${HEAD}${W.srcLine(key)}`) : e.html) : '';
    an.classList.toggle('pnl-on', ok);
    const host = document.getElementById(`pnl-${t}`);
    if (host) {
      if (!ok) { host.innerHTML = ''; host.dataset.v = ''; }
      else if (host.dataset.v !== v) {
        const sc = document.getElementById('analysis-panes'), keepY = host.dataset.key === key && sc ? sc.scrollTop : null;
        host.innerHTML = v; host.dataset.v = v; host.dataset.key = key;
        if (keepY != null) sc.scrollTop = keepY;
        if (typeof e.onMount === 'function') try { e.onMount(host); } catch (er) { /* the panel stays without the async parts */ }
      }
    }
    if (an.classList.contains('ft-on')) fullBar();
  }
  // "Open full table": the column widens to the whole window and shows the open sub-view's detailed
  // tables with the Engineering columns, for the same scope, filters and scenario; Esc returns.
  let techBefore = null, lastFocus = null;
  function fullBar() {
    const bar = document.getElementById('ft-bar'); if (!bar) return;
    const e = STORE.get(keyNow()), A = AT(), t = A ? A.getFootTab() : '';
    const tabName = (document.querySelector(`.f-tab[data-tab="${t}"]`) || {}).textContent || '';
    const subName = (document.querySelector(`.f-subtabs[data-pane="${t}"] .btn.on`) || {}).textContent || '';
    bar.innerHTML = `<div class="ft-t"><h2>${esc((e && e.title) || [tabName, subName].filter(Boolean).join(' › '))}</h2><p class="small muted">Full table · Engineering columns · same scope, filters and scenario</p></div><div class="ft-scen">${scenarioChip()}</div><button type="button" class="btn small" data-full-close>Close <kbd>Esc</kbd></button><nav class="ft-jump" aria-label="Tables in this view" hidden></nav>`;
    renderJumps();
  }
  // ---- Finding a table in the full table --------------------------------------------------------
  // A full table can run to ten screens (Growth › Areas). Its bar lists the tables the open sub-view
  // holds, each a jump. A "See all" fold of up to 60 rows opens with it: asking for the full table
  // asked for every row. A longer one (the 526 forecast developments) stays folded and is in the list,
  // so it doesn't push the tables below it out of reach. A panel row about one table
  // (data-ft-go="its title") opens the full table at that table.
  const SEE_ALL = 'details.see-all, details.dcn-more, details.svc-more', SEE_ALL_ROWS = 60;
  const HEADS = 'h2, h3, h4, .tb-head, summary';
  const shown = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const label = el => { const c = el.cloneNode(true); c.querySelectorAll('small, .muted, button, [aria-hidden="true"]').forEach(x => x.remove()); return c.textContent.replace(/\s+/g, ' ').trim(); };
  let jumps = [], watch = null, queued = false;
  // The tables on screen, in order: { name, at } (at: where the jump scrolls to). A table is named
  // by its caption, else by the heading above it; tables under one heading are one stop.
  function tablesNow() {
    const panes = document.getElementById('analysis-panes'); if (!panes) return [];
    const out = [], seen = new Set(); let head = null;
    for (const el of panes.querySelectorAll(`${HEADS}, table, ${SEE_ALL}`)) {
      // (a heading inside a table, or a "See all" fold's own line, names nothing)
      if (el.matches(HEADS)) { if (shown(el) && !el.closest('table') && !(el.tagName === 'SUMMARY' && el.parentElement.matches(SEE_ALL))) head = el; continue; }
      let name, at;
      if (el.tagName === 'DETAILS') { if (el.open || !shown(el)) continue; const s = el.querySelector('summary'); name = s && label(s); at = el; }
      else {
        // (a table nested in another, or the rest of one in its "See all" fold, is not a stop of its own)
        if (!shown(el) || el.parentElement.closest('table') || el.closest(SEE_ALL)) continue;
        const cap = el.querySelector('caption');
        name = cap ? label(cap) : head && label(head); at = cap ? el : head;
      }
      if (!name || seen.has(name)) continue;
      seen.add(name); out.push({ name, at });
    }
    return out;
  }
  function renderJumps() {
    const nav = document.querySelector('#ft-bar .ft-jump'); if (!nav) return;
    jumps = tablesNow();
    nav.hidden = jumps.length < 3;
    nav.innerHTML = nav.hidden ? '' : `<span class="small muted">Tables:</span>${jumps.map((j, i) => `<button type="button" class="btn small link" data-ft-jump="${i}" title="${esc(j.name)}">${esc(j.name.length > 48 ? `${j.name.slice(0, 46)}…` : j.name)}</button>`).join('')}`;
  }
  function autoOpen() {
    const panes = document.getElementById('analysis-panes'); if (!panes) return;
    for (const d of panes.querySelectorAll(SEE_ALL)) {
      if (d.dataset.ftAuto) continue;   // once per fold: one the person closed stays closed
      d.dataset.ftAuto = '1';
      if (!d.open && d.querySelectorAll('tbody tr').length <= SEE_ALL_ROWS) d.open = true;
    }
  }
  function jumpTo(at) {
    if (!at) return;
    const d = at.closest('details'); if (d && !d.open) d.open = true;
    if (at.tagName === 'DETAILS') at.open = true;
    at.scrollIntoView({ block: 'start' });
  }
  // The panes re-render (a filter, the scenario, another sub-view): open the new folds, relist the tables.
  const refresh = () => { queued = false; if (!isFull()) return; autoOpen(); renderJumps(); };
  function openFull(go) {
    const an = typeof document !== 'undefined' && document.getElementById('analysis'); if (!an) return false;
    if (an.classList.contains('ft-on')) { if (go) goTo(go); return true; }   // already open: keep the state to restore on close
    lastFocus = document.activeElement;
    techBefore = an.classList.contains('show-tech');
    const tb = document.getElementById('topbar'); an.style.setProperty('--ft-top', `${tb ? Math.round(tb.getBoundingClientRect().bottom) : 0}px`);
    an.classList.add('ft-on', 'show-tech'); document.documentElement.classList.add('full-table-open');
    autoOpen();
    const bar = document.getElementById('ft-bar'); if (bar) { bar.hidden = false; fullBar(); const c = bar.querySelector('[data-full-close]'); if (c) c.focus(); }
    const sc = document.getElementById('analysis-panes'); if (sc) sc.scrollTop = 0;
    if (sc && typeof MutationObserver === 'function') {
      watch = watch || new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(refresh); } });
      watch.observe(sc, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
    }
    if (go) goTo(go);
    return true;
  }
  // (on the next frame, once a sub-view the click opened has drawn; a section with no table, as Records ›
  // Data checks' station roster, by its heading)
  const headNamed = g => { const panes = document.getElementById('analysis-panes'), h = panes && [...panes.querySelectorAll(HEADS)].find(el => shown(el) && !el.closest('table') && label(el).toLowerCase().includes(g)); return h ? { at: h } : null; };
  const goTo = go => requestAnimationFrame(() => { refresh(); const g = String(go).toLowerCase(), j = jumps.find(x => x.name.toLowerCase().includes(g)) || tablesNow().find(x => x.name.toLowerCase().includes(g)) || headNamed(g); if (j) jumpTo(j.at); });
  function closeFull() {
    const an = typeof document !== 'undefined' && document.getElementById('analysis'); if (!an || !an.classList.contains('ft-on')) return false;
    if (watch) watch.disconnect();
    an.classList.remove('ft-on'); if (!techBefore) an.classList.remove('show-tech'); document.documentElement.classList.remove('full-table-open');
    const bar = document.getElementById('ft-bar'); if (bar) bar.hidden = true;
    if (lastFocus && lastFocus.focus && document.contains(lastFocus)) try { lastFocus.focus(); } catch (e) { /* gone */ }
    return true;
  }
  const isFull = () => !!(typeof document !== 'undefined' && document.getElementById('analysis') && document.getElementById('analysis').classList.contains('ft-on'));
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      if (!e.target.closest) return;
      const ft = e.target.closest('[data-full-table]'); if (ft) { openFull(ft.dataset.ftGo); return; }
      const jp = e.target.closest('[data-ft-jump]'); if (jp) { const j = jumps[+jp.dataset.ftJump]; if (j) jumpTo(j.at); return; }
      if (e.target.closest('[data-full-close]')) { closeFull(); return; }
      if (e.target.closest('[data-pnl-scen]')) { const T = root.PeelTopbar; if (T && T.openScenPop) T.openScenPop(); return; }
      // (a phone, where the timeline hides under the panel: Find › When, which has the years there)
      if (e.target.closest('[data-pnl-years]')) {
        const D = root.PeelDataTab, w = document.getElementById('fr-when');
        if (D && D.toggleSidebar) D.toggleSidebar(true); if (D && D.showTab) D.showTab('explore');
        if (w) { w.open = true; setTimeout(() => w.scrollIntoView({ block: 'start' }), 120); }
        return;
      }
      // A development's header: back to Peel (close the scope); its memo.
      if (e.target.closest('[data-pnl-dev-close]')) { if (root.DevScope) root.DevScope.close(); return; }
      if (e.target.closest('[data-pnl-memo]')) { const p = root.DevScope && root.DevScope.current(), R = root.PeelReports; if (p && R && R.devMemo) R.devMemo(p); return; }
      // A development named in a list (This week, Largest unbuilt): opens it as the scope.
      const dv = e.target.closest('[data-pnl-dev]'); if (dv) { const N = root.PeelDevNav, q = N && N.projectByKey(dv.dataset.pnlDev); if (q) N.showDetail(q); return; }
      const fo = e.target.closest('[data-pnl-focus]'); if (fo && fo.dataset.pnlFocus && root.PeelSewerTrace) { root.PeelSewerTrace.focusSvc(fo.dataset.pnlFocus, { zoom: true, loads: false, keep: true }); return; }
      if (e.target.closest('[data-pnl-brief]')) { const R = root.PeelReports; if (R && R.briefingPDF) R.briefingPDF(); return; }
      // Check FSR: the site bar's own FSR cross-check (it opens there, under the tools).
      if (e.target.closest('[data-pnl-fsr]')) { const b = document.querySelector('#site-bar [data-scope-fsr]'); if (b) { b.click(); b.scrollIntoView({ block: 'nearest' }); } }
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && closeFull()) { e.stopPropagation(); return; }
      // A list row or a figure with an action is a button: Enter / Space opens it.
      if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && (e.target.classList.contains('pnl-row') || e.target.classList.contains('pnl-fig')) && e.target.getAttribute('role') === 'button') { e.preventDefault(); e.target.click(); }
    }, true);
  }
  const api = { typeWords, typesText, SECTIONS, NOTE, reportLink, toneOf, chip, kv, html, calcIn, areaHead, siteHead, sectionsOf, scenarioChip, set, get, clear, sync, keyNow, scopeId, openFull, closeFull, isFull };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPanel = api;
})(typeof window !== 'undefined' ? window : globalThis);
