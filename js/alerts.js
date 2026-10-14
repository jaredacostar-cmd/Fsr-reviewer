/*
 * Weekly alerts for the user's watchlist (Phase 7, Feature 4).
 *
 * The Monday job writes data/alerts.json (and data/alerts.rss) with every
 * significant change and capacity-threshold crossing of the week. Watched sites
 * live in this browser's localStorage, which the CI job cannot see, so this
 * module fetches the feed and matches its development items against the local
 * watchlist, rendering the matches in the This week tab's alerts panel with a
 * count badge. Infrastructure items (plant / pumping-station thresholds) are
 * not watchable per site, so they get their own "Capacity" section.
 *
 * Pure matching helpers are exported for node --test; everything touching the
 * DOM or fetch is guarded so the file can be required under Node.
 */
(function (root) {
  'use strict';

  const KIND_LABEL = {
    'phase-change': 'Phase change',
    'new-development': 'New',
    'removed-development': 'Removed',
    'units-change': 'Units changed',
    'plant-threshold': 'Plant capacity',
    'station-threshold': 'Pumping station',
  };
  const kindLabel = k => KIND_LABEL[k] || k;

  // ---- Pure: feed matching ------------------------------------------------------
  function devItems(feed, watchKeys) {
    const set = new Set(watchKeys || []);
    return (feed && feed.items || []).filter(it => it.development && it.development.key && set.has(it.development.key));
  }
  function infraItems(feed) {
    return (feed && feed.items || []).filter(it => !it.development || !it.development.key);
  }
  function unseen(feed, seenAt) {
    return (feed && feed.items || []).filter(it => !seenAt || it.date > seenAt);
  }

  // ---- Browser -------------------------------------------------------------------
  const U = () => root.PeelUtil || null;
  const store = () => { const u = U(); return u && u.store; };
  const esc = s => { const u = U(); return u ? u.esc(s) : String(s); };
  const dot = ph => { const u = U(); return u && u.dot ? u.dot(ph) : '• '; };
  const $ = id => document.getElementById(id);

  function itemHTML(it) {
    const label = kindLabel(it.kind);
    const mark = it.development && it.development.phase ? dot(it.development.phase) : '<span aria-hidden="true">•</span> ';
    const inner = `${mark}<span><span class="t">${it.development ? '★ ' : ''}${esc(it.title)}</span>` +
      `<span class="m"><strong class="watch-ch">${esc(label)}</strong> · ${esc(it.text)}</span></span>`;
    // Development alerts open the development; capacity alerts are informational.
    return it.development && it.development.key
      ? `<li><button type="button" data-alert-dev="${esc(it.development.key)}">${inner}</button></li>`
      : `<li><div class="alert-static">${inner}</div></li>`;
  }

  function render(feed) {
    const panel = $('alerts-panel'), list = $('alerts-list'), head = $('alerts-head'), foot = $('alerts-foot');
    if (!panel || !list) return;
    const st = store();
    const watchKeys = st ? st.get('watch', []) || [] : [];
    const dev = devItems(feed, watchKeys);
    const infra = infraItems(feed);
    panel.hidden = false;
    const range = feed.baseline ? 'No weekly comparison yet.' : feed.since && feed.until ? `${esc(feed.since)} → ${esc(feed.until)}` : '';
    if (head) head.innerHTML = range;
    if (!dev.length && !infra.length) {
      list.innerHTML = `<li class="muted small">No alerts this week${watchKeys.length ? ' for your watched developments' : ' — star a development with ☆ Watch to get alerts for it here'}.</li>`;
    } else {
      list.innerHTML =
        dev.map(itemHTML).join('') +
        (infra.length ? `<li class="alerts-sep muted small">Capacity</li>` + infra.map(itemHTML).join('') : '');
    }
    if (foot) foot.innerHTML = `Weekly feed: <a href="data/alerts.json">JSON</a> · <a href="data/alerts.rss">RSS</a>`;
    list.onclick = e => {
      const b = e.target.closest('button[data-alert-dev]');
      if (!b) return;
      const DN = root.PeelDevNav, DT = root.PeelDevelopmentsTab;
      const p = DN && DN.projectByKey && DN.projectByKey(b.dataset.alertDev);
      if (p && DT && DT.focusProject) DT.focusProject(p);
    };
    updateBadge(feed);
  }

  function updateBadge(feed) {
    const badge = $('alerts-n');
    if (!badge) return;
    const st = store();
    const seenAt = st ? st.get('alertsSeen', null) : null;
    const fresh = unseen(feed, seenAt).length;
    badge.hidden = !fresh;
    badge.textContent = fresh > 99 ? '99+' : String(fresh);
    badge.title = fresh ? `${fresh} new alert${fresh === 1 ? '' : 's'} since you last checked` : '';
  }

  function markSeen() {
    const st = store();
    if (!st || !lastFeed) return;
    st.set('alertsSeen', lastFeed.until || lastFeed.generated);
    updateBadge(lastFeed);
  }

  let lastFeed = null, loading = null;
  function load() {
    if (lastFeed) return Promise.resolve(lastFeed);
    if (loading) return loading;
    loading = fetch('data/alerts.json', { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : null)
      .catch(() => null)
      .then(feed => { loading = null; lastFeed = feed; return feed; });
    return loading;
  }

  function init() {
    load().then(feed => { if (feed) render(feed); });
    const tab = $('tab-btn-week');
    if (tab) tab.addEventListener('click', () => setTimeout(markSeen, 300));
    // A watch toggled anywhere changes what this panel matches; re-render.
    document.addEventListener('click', e => {
      if (e.target.closest('[data-watch]')) setTimeout(() => load().then(feed => { if (feed) render(feed); }), 100);
    });
  }

  const api = { devItems, infraItems, unseen, kindLabel, init, render, load };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAlerts = api;
})(typeof window !== 'undefined' ? window : globalThis);
