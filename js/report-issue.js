/* js/report-issue.js — "Report a data issue" links (Phase 7 Feature 6).
 *
 * Each source record — in Development → Source records (js/devtab.js) and in the
 * record view opened from a permit pop-up (js/dev-detail.js via
 * js/aerial-check.js) — shows a small "Report data issue" link in its Phase 0
 * provenance line. The link opens a new GitHub issue with the title and body
 * pre-filled from the record's identifiers, provenance, app version and data
 * snapshot date, plus a prompt describing the problem and a request to attach
 * a screenshot. The URL is built once at render time, so the link works with
 * no extra JavaScript and no dependencies are added (no screenshot library:
 * the pre-filled body + "please attach a screenshot" line is the sanctioned
 * approach).
 *
 * Only public data goes into the issue URL: municipal record identifiers,
 * portal names, source links and pull dates — all already published by the
 * municipalities' open-data portals.
 *
 * Pure functions (REPO_URL, issueTitle, issueBody, issueUrl) have no DOM
 * access and no dependencies, so `node --test` can require() this module
 * directly. DOM / app-state reads live in appMeta() and are guarded.
 */
(function (root) {
  'use strict';

  const esc = (root.PeelUtil && root.PeelUtil.esc) || (s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));

  // ---- The one place to edit when the repo is renamed -------------------------
  // Phase 6 prepped Fsr-reviewer → peel-growth-pipeline; the GitHub remote is
  // currently jaredacostar-cmd/Fsr-reviewer. When the rename lands, update
  // this line and nothing else.
  const REPO_URL = 'https://github.com/jaredacostar-cmd/Fsr-reviewer';

  // GitHub truncates long titles and long query strings can be rejected by
  // some browsers; keep titles short and readable.
  const TITLE_MAX = 120;

  // ---- Pure: issue content -----------------------------------------------------
  // record: { uid, ref, kind, municipality, address, ... } — any field may be missing.
  // meta: { sourceUrl, portal, pulledOn, appVersion, snapshotDate } — all optional strings.
  function issueTitle(r) {
    const rec = r || {};
    const what = [rec.kind === 'permit' ? 'Permit' : 'Application', rec.ref].filter(Boolean).join(' ');
    const where = rec.municipality ? ` (${rec.municipality})` : '';
    const title = `Data issue: ${what || 'record'}${where}`;
    return title.length > TITLE_MAX ? title.slice(0, TITLE_MAX - 1) + '…' : title;
  }

  function issueBody(r, meta) {
    const rec = r || {};
    const m = meta || {};
    const kind = rec.kind === 'permit' ? 'Building permit' : rec.kind ? String(rec.kind) : 'record';
    const lines = [
      `**Record:** ${[rec.ref, kind].filter(Boolean).join(' — ') || 'unknown record'}`,
      `**Record ID:** ${rec.uid || 'unknown'}`,
      rec.address ? `**Address:** ${rec.address}` : null,
      rec.municipality ? `**Municipality:** ${rec.municipality}` : null,
      m.portal ? `**Portal:** ${m.portal}` : null,
      m.sourceUrl ? `**Source record:** ${m.sourceUrl}` : null,
      m.pulledOn ? `**Pulled on:** ${m.pulledOn}` : null,
      `**App version:** ${m.appVersion || 'unknown'}`,
      `**Data snapshot:** ${m.snapshotDate || 'unknown'}`,
      '',
      '**What is wrong?**',
      '_Describe the problem — e.g. wrong units, wrong address, stale status, a duplicate, or a missing record. Say which field looks wrong and what it should be._',
      '',
      'Please attach a screenshot showing the issue.',
    ];
    return lines.filter(l => l != null).join('\n');
  }

  function issueUrl(record, meta) {
    const params = new URLSearchParams({ title: issueTitle(record), body: issueBody(record, meta) });
    return `${REPO_URL}/issues/new?${params.toString()}`;
  }

  // ---- Browser: app context ----------------------------------------------------
  // Guarded: in Node (tests) there is no document and no PeelApp; meta fields
  // then fall back to 'unknown' via issueBody defaults.
  function appMeta() {
    let appVersion = null;
    if (typeof document !== 'undefined' && document.querySelector) {
      const el = document.querySelector('meta[name="app-version"]');
      appVersion = el && el.content && el.content !== '__BUILD__' ? el.content : null;
    }
    let snapshotDate = null;
    try {
      const snap = root.PeelApp && root.PeelApp.state && root.PeelApp.state.snapshot;
      if (snap && snap.generatedAt) snapshotDate = String(snap.generatedAt).slice(0, 10);
    } catch (e) { /* app not booted yet — fall through */ }
    return { appVersion: appVersion || 'dev', snapshotDate: snapshotDate || 'unknown' };
  }

  // One link for the provenance line. `info` carries the record's own
  // provenance (as rendered by recordProvHTML); appMeta() fills in the rest.
  // Same plain-<a> pattern as the "Record ↗" link, so it inherits the
  // theme's link styling in dark and light mode with no new CSS.
  function reportLinkHTML(record, info) {
    const i = info || {};
    const url = issueUrl(record, { sourceUrl: i.sourceUrl, portal: i.portal, pulledOn: i.pulledOn, ...appMeta() });
    return `<a href="${esc(url)}" target="_blank" rel="noopener" data-info="report-issue">Report data issue ↗</a>`;
  }

  const api = { REPO_URL, TITLE_MAX, issueTitle, issueBody, issueUrl, appMeta, reportLinkHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelReportIssue = api;
})(typeof window !== 'undefined' ? window : globalThis);
