(function (root) {
'use strict';
  // ---- Change log (Help menu): one release per merged pull request ------------------
  const { $, esc, fmtNum, skel, store, hlP } = window.PeelUtil;
  const PEX = () => root.PeelExports;
  // ---- Change log (Help menu): one release per merged pull request ------------------
  // data/changelog.json (scripts/build-changelog.js, rebuilt at each deploy). Version 1.<pull
  // request>; the running build is the release whose commit matches the app-version stamp.
  // Releases since this browser last opened the log are marked New, with a dot on the
  // topbar Help button. The log renders into the Help view (#help-log-body, built by
  // showHelp); opening it marks everything as seen.
  const LOG = { data: null, loading: null, kind: 'all', q: '', dataUpd: false, seen: store.get('logSeen', 0) };
  function loadChangelog() {
    if (LOG.data || LOG.loading) return LOG.loading || Promise.resolve(LOG.data);
    LOG.loading = fetch('data/changelog.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null)
      .then(d => { LOG.data = d; LOG.loading = null; syncLogDot(); return d; });
    return LOG.loading;
  }
  function currentRelease() {
    const d = LOG.data; if (!d || !d.releases.length) return null;
    const v = (document.querySelector('meta[name="app-version"]') || {}).content;
    return d.releases.find(r => v && r.sha && v.startsWith(r.sha.slice(0, 7))) || d.releases[0];
  }
  function syncLogDot() {
    const d = LOG.data, dot = document.querySelector('#tb-help .log-dot'); if (!dot) return;
    const top = d && d.releases[0];
    dot.hidden = !(top && LOG.seen && top.pr > LOG.seen);
    if (top && !LOG.seen) { LOG.seen = top.pr; store.set('logSeen', top.pr); }   // first visit: nothing is "new"
  }
  const LOG_KIND = { feature: ['log-new', 'New'], fix: ['log-fix', 'Fix'], data: ['log-data', 'Data'] };
  const fmtDay = iso => new Date(`${iso}T12:00:00`).toLocaleDateString('en-CA', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' });
  function renderChangelog() {
    const el = $('#help-log-body'); if (!el) return;
    if (!LOG.data) { el.innerHTML = skel('Loading the change log'); loadChangelog().then(d => { if (d) renderChangelog(); else el.innerHTML = '<p class="small muted">The change log is not available in this copy of the app.</p>'; }); return; }
    const d = LOG.data, cur = currentRelease(), seen = LOG.seenShown ?? LOG.seen, q = LOG.q.trim().toLowerCase();
    const fresh = d.releases.filter(r => seen && r.pr > seen);
    let list = d.releases.filter(r => (LOG.kind === 'all' || r.kind === LOG.kind) && (!q || `${r.version} ${r.title} ${r.notes.join(' ')}`.toLowerCase().includes(q)));
    const items = list.map(r => ({ ...r, t: 'rel' }));
    if (LOG.dataUpd && !q && LOG.kind === 'all') for (const u of d.dataUpdates) items.push({ t: 'data', date: u.date, sha: u.sha });
    items.sort((a, b) => b.date.localeCompare(a.date) || (b.pr || 0) - (a.pr || 0));
    const byDay = new Map(); for (const it of items) (byDay.get(it.date) || byDay.set(it.date, []).get(it.date)).push(it);
    const first = d.releases[d.releases.length - 1];
    const rel = r => `<article class="log-rel${r.pr === (cur && cur.pr) ? ' cur' : ''}${seen && r.pr > seen ? ' fresh' : ''}" id="log-${r.pr}">
        <div class="log-h"><span class="log-v">v${esc(r.version)}</span><span class="log-k ${LOG_KIND[r.kind][0]}">${LOG_KIND[r.kind][1]}</span>${seen && r.pr > seen ? '<span class="log-k log-fresh">New since your last visit</span>' : ''}${r.pr === (cur && cur.pr) ? '<span class="log-k log-cur">You\'re using this version</span>' : ''}</div>
        <h4>${esc(r.title)}</h4>
        ${r.notes.length ? `<ul class="small">${r.notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
        <p class="small muted log-meta"><a href="${esc(r.url)}" target="_blank" rel="noopener">Pull request #${r.pr} ↗</a> · build ${esc(r.sha)}</p></article>`;
    el.innerHTML = `${hlP(cur ? `You're using <strong>version ${esc(cur.version)}</strong>, released ${esc(fmtDay(cur.date))} (build ${esc(cur.sha)}).${fresh.length ? ` <strong>${fresh.length} update${fresh.length === 1 ? '' : 's'}</strong> since you last looked.` : ''} ${fmtNum(d.releases.length)} releases since ${esc(fmtDay(first.date))}.` : 'No releases recorded yet.')}
      <div class="log-tools"><span class="seg">${[['all', 'All'], ['feature', 'New features'], ['fix', 'Fixes']].map(([k, t]) => `<button type="button" class="btn small${LOG.kind === k ? ' on' : ''}" data-log-kind="${k}" aria-pressed="${LOG.kind === k}">${t}</button>`).join('')}</span>
        <input type="search" class="log-q" placeholder="Search changes (e.g. DC, blocks, briefing)" value="${esc(LOG.q)}" aria-label="Search the change log">
        <label class="small"><input type="checkbox" data-log-data${LOG.dataUpd ? ' checked' : ''}> Weekly data updates</label>
        <button type="button" class="btn small" data-log-csv>CSV</button></div>
      ${items.length ? [...byDay].map(([day, its]) => `<section class="log-day"><h3 class="log-date">${esc(fmtDay(day))}</h3>${its.map(it => it.t === 'rel' ? rel(it) : `<article class="log-rel log-dataupd"><div class="log-h"><span class="log-k log-data">Data</span></div><h4>Weekly data refresh</h4><p class="small muted">Applications, permits, census baseline and council items re-read from the municipal sources (build ${esc(it.sha)}).</p></article>`).join('')}</section>`).join('') : '<p class="small muted">No changes match.</p>'}
      <p class="small muted">Built from the app's release history: each release is one reviewed change merged into the live site. Versions are 1.&lt;pull request number&gt;; the build is the code commit, also shown under Data sources.</p>`;
    // Opening the log marks everything as seen (the New marks stay until the log is next opened).
    const top = d.releases[0];
    if (top) { if (LOG.seenShown == null) LOG.seenShown = LOG.seen; LOG.seen = top.pr; store.set('logSeen', top.pr); syncLogDot(); }
  }
  // The log renders inside the Help view (#help-log-body, built by showHelp), so these
  // listeners delegate from the document instead of a #log-body node.
  const inHelpLog = e => e.target.closest('#help-log-body');
  document.addEventListener('click', e => {
    if (!inHelpLog(e)) return;
    const k = e.target.closest('[data-log-kind]'); if (k) { LOG.kind = k.dataset.logKind; return renderChangelog(); }
    if (e.target.closest('[data-log-csv]') && LOG.data) {
      const q = v => window.PeelUtil.csvCell(v, true);
      return PEX().download('peel-tracker-change-log.csv', [['Version', 'Date', 'Type', 'Change', 'Details', 'Pull request', 'Build'], ...LOG.data.releases.map(r => [r.version, r.date, LOG_KIND[r.kind][1], r.title, r.notes.join(' | '), r.url, r.sha])].map(a => a.map(q).join(',')).join('\n'), 'text/csv');
    }
  });
  document.addEventListener('change', e => { if (inHelpLog(e) && e.target.matches('[data-log-data]')) { LOG.dataUpd = e.target.checked; renderChangelog(); } });
  document.addEventListener('input', e => {
    if (!inHelpLog(e) || !e.target.matches('.log-q')) return;
    LOG.q = e.target.value; clearTimeout(LOG.t);
    LOG.t = setTimeout(() => { const pos = e.target.selectionStart; renderChangelog(); const i = document.querySelector('#help-log-body .log-q'); if (i) { i.focus(); i.setSelectionRange(pos, pos); } }, 200);
  });
  setTimeout(loadChangelog, 4000);
  // ---- Public contract ------------------------------------------------------------------
  const api = { loadChangelog, currentRelease, renderChangelog, syncLogDot, LOG };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelChangelog = api;
})(typeof window !== 'undefined' ? window : globalThis);
