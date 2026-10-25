/* js/accuracy.js — Accuracy report for the Sources & checks page (Phase 7, feature 3).
 * Two error rates for the tracker itself:
 *  1. Phase-reading accuracy: how often the app's phase reading is confirmed by a
 *     later dated reading, from data/history.json. Every snapshot run records each
 *     project's phase; entries flagged 'rules' are re-reads after a change to the
 *     phase rules (scripts/build-snapshot.js), not new file events, so they are
 *     reported separately.
 *  2. Aerial "is it built?" check performance: the check (js/aerial.js, run from
 *     js/devtab.js aerialRun) runs on demand in the browser and its verdicts are kept
 *     only in a per-session in-memory cache — no verdict history is persisted
 *     anywhere, so no hit rate can be computed. The section says so plainly instead
 *     of inventing one, and states the decision rule and what would need logging.
 * Registers window.ModelChecks.accuracy (rendered by the Sources & checks gear page
 * in js/demand-ui.js). Pure logic is Node-requireable for tests; all DOM access is
 * guarded.
 */
(function (root) {
  'use strict';

  const U = root.PeelUtil || {};
  const esc = U.esc || (s => String(s == null ? '' : s));
  const fmtNum = U.fmtNum || (n => String(n));
  const App = () => root.PeelApp;
  const CFG = () => root.PEEL_CONFIG;

  // Phase rank order, mirroring js/phases.js PHASES (inception -> completed).
  // 'cancelled' is terminal and can end any phase. Prefer the live table when the
  // phases module is present (it loads before this one); fall back to the copy.
  const RANK = (() => {
    try {
      const P = root.PeelPhases;
      if (P && P.PHASE_BY_KEY) {
        const r = {};
        for (const k of Object.keys(P.PHASE_BY_KEY)) r[k] = P.PHASE_BY_KEY[k].rank;
        if (r.inception === 0 && r.completed === 5) return r;
      }
    } catch (e) { /* fall through to the built-in order */ }
    return { inception: 0, review: 1, approved: 2, permit: 3, construction: 4, completed: 5, cancelled: -1 };
  })();

  const MUNI_ORDER = ['Mississauga', 'Brampton', 'Caledon'];
  const muniOf = key => String(key == null ? '' : key).split('|')[0] || '—';

  // ---- Pure: phase-reading accuracy ------------------------------------------------
  // history = parsed data/history.json: { projects: { key: [[date, phase, flag?], ...] },
  // runs, updated }. Walks each project's dated readings in order and judges every
  // transition:
  //  - later entry flagged 'rules': the phase rules changed and the project was
  //    re-read from existing evidence (not a new file event) — counted separately.
  //  - otherwise: the later dated reading is new evidence. The earlier reading
  //    "matches" when the later reading does not move the project to an earlier
  //    phase; a withdrawal/refusal ('cancelled') can end any phase and matches.
  //    A backward move means at least one of the two readings was wrong.
  function phaseAccuracy(history) {
    const projects = (history && history.projects) || {};
    const byMuni = {};
    const rules = { forward: 0, backward: 0, byMuni: {}, dates: [] };
    const ruleDates = new Set();
    const overall = { matched: 0, contradicted: 0 };
    let withHistory = 0, judged = 0, skipped = 0;
    for (const key of Object.keys(projects)) {
      const evs = projects[key] || [];
      const muni = muniOf(key);
      if (evs.length > 1) withHistory++;
      for (let i = 0; i + 1 < evs.length; i++) {
        const earlier = evs[i], later = evs[i + 1];
        const ep = earlier && earlier[1], lp = later && later[1];
        if (!(ep in RANK) || !(lp in RANK)) { skipped++; continue; }
        const isRules = later.length > 2 && later[2] === 'rules';
        const back = lp !== 'cancelled' && RANK[lp] < RANK[ep];
        if (isRules) {
          const rb = rules.byMuni[muni] || (rules.byMuni[muni] = { forward: 0, backward: 0 });
          if (back) { rules.backward++; rb.backward++; } else { rules.forward++; rb.forward++; }
          if (later[0]) ruleDates.add(later[0]);
          continue;
        }
        judged++;
        const m = byMuni[muni] || (byMuni[muni] = { matched: 0, contradicted: 0 });
        if (back) { overall.contradicted++; m.contradicted++; }
        else { overall.matched++; m.matched++; }
      }
    }
    rules.dates = Array.from(ruleDates).sort();
    const rate = o => (o.matched + o.contradicted) ? o.matched / (o.matched + o.contradicted) : null;
    const withRate = o => ({ matched: o.matched, contradicted: o.contradicted, total: o.matched + o.contradicted, rate: rate(o) });
    const rankMuni = m => { const i = MUNI_ORDER.indexOf(m); return i < 0 ? 99 : i; };
    const munis = {};
    for (const m of Object.keys(byMuni).sort((a, b) => rankMuni(a) - rankMuni(b) || (a < b ? -1 : 1))) munis[m] = withRate(byMuni[m]);
    return {
      overall: withRate(overall),
      byMuni: munis,
      rules: { forward: rules.forward, backward: rules.backward, total: rules.forward + rules.backward, byMuni: rules.byMuni, dates: rules.dates },
      projectsWithHistory: withHistory,
      judged, skipped,
      runs: (history && history.runs) || [],
      updated: (history && history.updated) || null,
    };
  }

  // ---- Pure: aerial check ----------------------------------------------------------
  // The check's decision rule, as coded in js/aerial.js score(): probability >= 0.7
  // -> 'Likely completed' (the panel's hi/mid/lo bands split at 0.7 and 0.35).
  // Its verdicts are NOT persisted — aerialRun() in js/devtab.js keeps them in
  // a per-session in-memory cache only — so there is no verdict history to score.
  // The measurable proxy is coverage: developments the check can run for.
  const AERIAL_RULE = { verdict: 'Likely completed', threshold: 0.7, midBand: 0.35 };
  function aerialCoverage(projects, imageryMunis) {
    const ok = new Set(imageryMunis || []);
    let checkable = 0, total = 0;
    for (const p of projects || []) {
      total++;
      // Mirrors js/devtab.js aerialAvailable(): imagery configured for
      // the municipality and a mapped location.
      if (p && p.lat != null && ok.has(p.municipality)) checkable++;
    }
    return { checkable, total };
  }

  // ---- Browser rendering (guarded; never runs in Node) ------------------------------
  const pct = r => (r == null ? '—' : `${Math.round(r * 100)}%`);
  function matchCell(s) {
    if (!s.total) return '<td>—</td>';
    return `<td><strong>matched in ${fmtNum(s.matched)} of ${fmtNum(s.total)} cases (${pct(s.rate)})</strong>` +
      `<small>${fmtNum(s.contradicted)} later reading${s.contradicted === 1 ? '' : 's'} contradicted the earlier one</small></td>`;
  }
  function reportInner(stats, covInfo) {
    const o = stats.overall;
    const muniRows = Object.keys(stats.byMuni).map(m =>
      `<tr><td>${esc(m)}</td>${matchCell(stats.byMuni[m])}</tr>`).join('');
    const r = stats.rules;
    const rulesLine = r.total
      ? `<p class="small muted">When the phase rules changed${r.dates.length ? ` (${r.dates.map(esc).join(', ')})` : ''}, ` +
        `${fmtNum(r.total)} projects were re-read from existing evidence: ${fmtNum(r.forward)} moved to a later phase, ` +
        `${fmtNum(r.backward)} to an earlier phase than previously recorded. These are rule changes, not new file events.</p>`
      : '';
    let aerialSmall = `Decision rule: “${esc(AERIAL_RULE.verdict)}” at a score ≥ ${Math.round(AERIAL_RULE.threshold * 100)}% (js/aerial.js).`;
    if (covInfo && covInfo.coverage && covInfo.coverage.total) {
      const c = covInfo.coverage;
      aerialSmall += ` The check can run for ${fmtNum(c.checkable)} of ${fmtNum(c.total)} loaded developments ` +
        `(a mapped location in ${covInfo.munis.map(esc).join(', ')}).`;
    }
    aerialSmall += ' To measure the hit rate, verdicts would need to be logged and matched against each project\u2019s later recorded phase.';
    return `<table class="dt fr-table"><thead><tr><th>What was checked</th><th>Result</th></tr></thead><tbody>
      <tr><td>Phase readings vs later dated events — all Peel<small>${fmtNum(stats.judged)} transitions across ${fmtNum(stats.projectsWithHistory)} projects with 2+ dated readings</small></td>${matchCell(o)}</tr>
      ${muniRows}
      <tr><td>Aerial “is it built?” check<small>Runs on demand in the site panel; verdicts are kept in memory only, never logged</small></td>
      <td><strong>No accuracy figure — no verdict history exists</strong><small>${aerialSmall}</small></td></tr>
    </tbody></table>
    ${rulesLine}
    <p class="small muted">ⓘ A phase reading counts as matched when no later dated reading moves the project to an earlier phase (withdrawn/refused can end any phase); re-reads after a phase-rule change are shown separately. Aerial check verdicts are not logged, so no hit rate can be computed. Phase history as of <strong>${esc(stats.updated || '—')}</strong>.</p>`;
  }
  function sectionHTML(stats, covInfo) {
    return `<h3 class="sub-title" data-info="accuracy-report">Accuracy report</h3>` +
      `<div id="accuracy-report">${reportInner(stats, covInfo)}</div>`;
  }
  function coverageFromApp() {
    try {
      const app = App();
      const projs = (app && app.state && app.state.projects) || [];
      const cfg = CFG();
      const munis = (cfg && cfg.imagery) ? Object.keys(cfg.imagery) : [];
      return { coverage: aerialCoverage(projs, munis), munis };
    } catch (e) { return null; }
  }

  const api = { phaseAccuracy, aerialCoverage, AERIAL_RULE, reportInner, sectionHTML };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.PeelAccuracy = api;
    if (typeof window !== 'undefined') {
      // Register a placeholder so the section exists on the Sources & checks page
      // immediately; fill it once data/history.json loads (same pattern as FSR).
      window.ModelChecks = window.ModelChecks || {};
      window.ModelChecks.accuracy =
        `<h3 class="sub-title" data-info="accuracy-report">Accuracy report</h3>` +
        `<div id="accuracy-report"><p class="small muted">Working out the accuracy report…</p></div>`;
      // (one request and one parsed copy with js/app.js, js/util.js dataJSON; read before the app
      // adds the tree keys to its own copy)
      const load = () => (U.dataJSON ? U.dataJSON('data/history.json') : fetch('data/history.json', { cache: 'no-cache' })
        .then(resp => (resp && resp.ok) ? resp.json() : null)
        .catch(() => null))
        .then(h => {
          if (!h || typeof document === 'undefined') return;
          const stats = phaseAccuracy(h), cov = coverageFromApp();
          window.ModelChecks.accuracy = sectionHTML(stats, cov);
          const box = document.getElementById('accuracy-report');
          if (box) box.innerHTML = reportInner(stats, cov);
        });
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', load);
      else load();
    }
  }
})(typeof window !== 'undefined' ? window : globalThis);
