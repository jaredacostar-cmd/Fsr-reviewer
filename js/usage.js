/* js/usage.js — Stage 5 (pilot support): how often each workspace, tab and sub-view is opened.
 *
 * Local and anonymous: counts per day, kept in this browser only (localStorage), never sent
 * anywhere. Only fixed names are counted (a workspace, a tab, a sub-view, "full map", a role key,
 * the kind of place a search found): no developments, no search text, no addresses, nothing about
 * the person. Settings › Usage shows the counts and exports them as CSV, so the pilot's users can
 * send them in.
 *
 * What counts is a person's click (or Enter on a focused control), not the app moving itself:
 *   start  how the app opened: home / ws / full (+ "-link" when it opened from a link)
 *   page   a workspace page (or Home) opened         map    a workspace's map view opened
 *   full   Full map opened                           tab    an analysis tab picked
 *   sub    a sub-view picked (tab.sub)               side   a sidebar tab picked (Find, Watch)
 *   issue  "Report a data issue" followed (by panel kind)
 *   role   the role picked (a ROLES key, or none), once per visit (navigation phase 7, NP-7)
 *   search a search pick, by the kind of place it found (dev, file, plan, …), never its text (P4-10)
 *
 * Pure (Node-testable): bump, rows, toCSV, totals. The rest is guarded browser code.
 */
(function (root) {
  'use strict';
  const KINDS = ['start', 'page', 'map', 'full', 'tab', 'sub', 'side', 'issue', 'role', 'search'];
  const ID = /^[a-z0-9.-]{0,32}$/;
  const MAX_DAYS = 400;
  const empty = () => ({ v: 1, since: null, days: {} });
  // The kinds a search pick counts as (js/search-filter.js goSug): a search counts only these, never its text.
  const SEARCH = { dev: 'a development', file: 'a file number', plan: 'a plan', mtsa: 'an MTSA', svc: 'a facility', dc: 'a DC project', dcfac: 'a DC facility', filter: 'a filter', place: 'a place', address: 'an address' };

  // Add one to kind:id on day (YYYY-MM-DD). Anything outside the fixed names is ignored.
  function bump(data, kind, id, day) {
    const d = data && data.v === 1 && data.days ? data : empty();
    const i = String(id == null ? '' : id).toLowerCase();
    if (!KINDS.includes(kind) || !ID.test(i) || !/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return d;
    if (kind === 'search' && !Object.prototype.hasOwnProperty.call(SEARCH, i)) return d;
    const k = i ? `${kind}:${i}` : kind;
    const row = d.days[day] || (d.days[day] = {});
    row[k] = (row[k] || 0) + 1;
    if (!d.since || day < d.since) d.since = day;
    const days = Object.keys(d.days).sort();
    while (days.length > MAX_DAYS) delete d.days[days.shift()];
    return d;
  }
  // One row per day and name: { date, kind, id, count }, by date then name. alias maps a retired name
  // onto where it moved (the browser passes the app's own table, SUB_MAP), so a pilot's counts before and
  // after a move add up (navigation-design §10.9); the counts kept are never rewritten.
  function rows(data, alias = k => k) {
    const out = [];
    for (const day of Object.keys((data && data.days) || {}).sort()) {
      const sum = Object.create(null);
      for (const [k, n] of Object.entries(data.days[day])) { const a = alias(k) || k; sum[a] = (sum[a] || 0) + n; }
      for (const k of Object.keys(sum).sort()) {
        const [kind, ...rest] = k.split(':');
        out.push({ date: day, kind, id: rest.join(':'), count: sum[k] });
      }
    }
    return out;
  }
  // Totals over all days: { 'kind:id': n }.
  function totals(data, alias) {
    const t = {};
    for (const r of rows(data, alias)) { const k = r.id ? `${r.kind}:${r.id}` : r.kind; t[k] = (t[k] || 0) + r.count; }
    return t;
  }
  const cell = v => ((typeof window !== 'undefined' && window.PeelUtil) || require('./util.js')).csvCell(v);
  // CSV: date, kind, id, label (from labels['kind:id'] or labels[kind]), count.
  function toCSV(data, labels = {}, alias) {
    const lines = ['date,kind,id,label,count'];
    for (const r of rows(data, alias)) lines.push([r.date, r.kind, r.id, labels[r.id ? `${r.kind}:${r.id}` : r.kind] || '', r.count].map(cell).join(','));
    return `${lines.join('\n')}\n`;
  }

  const api = { KINDS, SEARCH, MAX_DAYS, bump, rows, totals, toCSV };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.PeelUsage = api;
  if (typeof document === 'undefined') return;

  // ---- Browser ----------------------------------------------------------------------------------
  const store = () => root.PeelUtil && root.PeelUtil.store;
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const load = () => { const s = store(); return s ? s.get('usage', empty()) : empty(); };
  // A sub-view that moved (Servicing › Allocations is Capacity's fold now …) is shown and exported under
  // where it went, through the tabs' own table (js/analysis-tabs.js migrateSub).
  const aliasKey = k => { const m = /^sub:(\w+)\.(\w+)$/.exec(k), AT = root.PeelAnalysisTabs, r = m && AT && AT.migrateSub ? AT.migrateSub(m[1], m[2]) : null; return r ? `sub:${r.tab}.${r.sub}` : k; };
  function count(kind, id) {
    const s = store(); if (!s) return;
    s.set('usage', bump(load(), kind, id, today()));
    const box = document.getElementById('usage-sec'); if (box) box.outerHTML = settingsHTML();
  }
  const TABS = { overview: 'Overview', growth: 'Growth', svc: 'Servicing', dca: 'Capital', records: 'Records', explore: 'Find', week: 'Watch', data: 'Data' };
  const SUB_ATTR = { gsub: 'growth', svcsub: 'svc', dcasub: 'dca', rsub: 'records' };
  // Labels for the CSV and Settings: the workspaces' names, the tabs', the sub-view chips' own text.
  function labels() {
    const L = { full: 'Full map', 'page:home': 'Home', 'map:home': 'Home', 'start:home': 'Opened on Home', 'start:ws': 'Opened on a workspace map', 'start:full': 'Opened on the full map', 'start:home-link': 'Opened on Home from a link', 'start:ws-link': 'Opened on a workspace map from a link', 'start:full-link': 'Opened on the full map from a link' };
    const W = root.PeelWorkspaces;
    for (const w of (W && W.WS) || []) { L[`page:${w.id}`] = `${w.label} (page)`; L[`map:${w.id}`] = `${w.label} (map view)`; }
    for (const [k, t] of Object.entries(TABS)) { L[`tab:${k}`] = t; L[`side:${k}`] = `${t} (sidebar)`; L[`issue:${k}`] = `Report a data issue (${t})`; }
    L['issue:page'] = 'Report a data issue (a page)';
    // (navigation phase 7: Find and Help are Home's sidebar entries, not workspaces; the roles by their own label)
    L['page:find'] = 'Find (page)'; L['page:help'] = 'Help (page)'; L['role:none'] = 'Role: none picked';
    for (const r of (W && W.ROLES) || []) L[`role:${r.key}`] = `Role: ${r.label}`;
    for (const [k, t] of Object.entries(SEARCH)) L[`search:${k}`] = `Search: ${t}`;
    for (const [attr, tab] of Object.entries(SUB_ATTR)) {
      document.querySelectorAll(`[data-${attr}]`).forEach(b => { const v = b.dataset[attr]; if (v && !L[`sub:${tab}.${v}`]) L[`sub:${tab}.${v}`] = `${TABS[tab]} › ${b.textContent.trim().replace(/\s*Labs$/, '')}`; });
    }
    return L;
  }
  // A click → what it opens. Window capture: before any handler can stop it.
  function onClick(e) {
    const t = e.target && e.target.closest ? e.target : null; if (!t) return;
    const at = sel => t.closest(sel);
    let el;
    if ((el = at('a[data-report-panel]'))) return count('issue', String(el.dataset.reportPanel || '').split(':')[0]);
    // (a role shortcut or a Help row into a view of Home: the view it opens, as the strip's chips count it)
    if ((el = at('[data-ws-at]'))) { const [tab, sub] = el.dataset.wsAt.split(':'); return sub ? count('sub', `${tab}.${sub}`) : count('tab', tab); }
    if ((el = at('[data-ws-page]'))) return count('page', el.dataset.wsPage);
    if (at('[data-ws-home]')) return count('page', 'home');
    if ((el = at('[data-ws-go]'))) return count('map', el.dataset.wsGo);
    if (at('[data-ws-full]')) return count('full', '');
    // (a page host's strip and views row: the map's own kinds, so a tab's count adds the page and the map up)
    if ((el = at('[data-pg-sub]'))) return count('sub', `${el.dataset.pgTab}.${el.dataset.pgSub}`);
    if ((el = at('[data-pg-tab]'))) return count('tab', el.dataset.pgTab);
    if ((el = at('.f-tab[data-tab]'))) return count('tab', el.dataset.tab);
    if ((el = at('#sidebar [role="tab"][data-tab]'))) return count('side', el.dataset.tab);
    for (const [attr, tab] of Object.entries(SUB_ATTR)) if ((el = at(`[data-${attr}]`))) return count('sub', `${tab}.${el.dataset[attr]}`);
    return undefined;
  }
  window.addEventListener('click', onClick, true);
  // How the app opened, once per load (after the start screen has been chosen). Whether it came from
  // a link is read now, before the app writes its own state into the address.
  // (a reload or a restored tab carries the app's own address: only a navigation to it is a link)
  const nav = (() => { try { return performance.getEntriesByType('navigation')[0] || null; } catch (e) { return null; } })();
  const fromLink = location.hash.length > 1 && (!nav || nav.type === 'navigate');
  // (and the role picked, a ROLES key only: an older browser's stray value is none)
  const started = () => {
    const W = root.PeelWorkspaces, s = store(), m = W && W.mode ? W.mode() : 'full', rk = s ? s.get('role', '') : '';
    count('start', `${m}${fromLink ? '-link' : ''}`);
    count('role', W && W.ROLES && W.ROLES.some(r => r.key === rk) ? rk : 'none');
  };
  if (document.readyState === 'complete') setTimeout(started, 0); else window.addEventListener('load', () => setTimeout(started, 0), { once: true });

  // ---- Settings › Usage --------------------------------------------------------------------------
  const { esc, fmtNum } = root.PeelUtil || { esc: s => String(s), fmtNum: n => String(n) };
  function settingsHTML() {
    const d = load(), t = totals(d, aliasKey), L = labels();
    // (the role is counted per visit, not opened: in the CSV only)
    const top = Object.entries(t).filter(([k]) => !/^(start|role)\b/.test(k)).sort((a, b) => b[1] - a[1]);
    const opens = Object.entries(t).filter(([k]) => k.startsWith('start')).reduce((s, [, n]) => s + n, 0);
    return `<section class="gear-sec" id="usage-sec"><h3>Usage in this browser (pilot)</h3>
      <p class="small muted">How often each workspace, tab and sub-view is opened here${d.since ? `, since ${esc(d.since)}` : ''}: counts only, kept in this browser and never sent. No developments, search text or names are counted: a search counts only what kind of place it found. Export the CSV to send it in.</p>
      ${top.length ? `<table class="usage-t small"><thead><tr><th>Opened</th><th class="num">Times</th></tr></thead><tbody>${top.slice(0, 10).map(([k, n]) => `<tr><td>${esc(L[k] || k)}</td><td class="num">${fmtNum(n)}</td></tr>`).join('')}</tbody></table>${top.length > 10 ? `<p class="small muted">and ${fmtNum(top.length - 10)} more in the CSV.</p>` : ''}` : '<p class="small muted">Nothing counted yet.</p>'}
      <p class="small muted">${fmtNum(opens)} ${opens === 1 ? 'visit' : 'visits'} counted.</p>
      <p><button type="button" class="btn small" data-usage-csv>Export CSV</button> <button type="button" class="btn small link" data-usage-reset>Reset counts</button></p></section>`;
  }
  function exportCSV() {
    const csv = toCSV(load(), labels(), aliasKey);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `peel-usage-${today()}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-usage-csv]')) exportCSV();
    else if (e.target.closest && e.target.closest('[data-usage-reset]')) {
      if (!confirm('Reset the usage counts in this browser?')) return;
      const s = store(); if (s) s.set('usage', empty());
      const box = document.getElementById('usage-sec'); if (box) box.outerHTML = settingsHTML();
    }
  });
  Object.assign(api, { count, labels, settingsHTML, exportCSV, load });
})(typeof window !== 'undefined' ? window : globalThis);
