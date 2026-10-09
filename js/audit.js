/*
 * Duplicate audit: evidence that each file and each dwelling unit is counted once.
 * Pure functions (run in the app's Data tab and on the weekly snapshot in CI).
 *
 *  1. Records: raw records -> copies of the same file merged -> unique files -> projects.
 *  2. Integrity checks that must be zero: a file listed twice after merging, a file in
 *     more than one project, a file in no project.
 *  3. Unit reconciliation: units on every raw record, minus each rule that removes a
 *     repeat, equals the units counted (the demand panel's "All units" with no filters).
 *  4. Possible duplicates left: separate 20+ unit projects within 60 m, for review.
 */
(function (root) {
  'use strict';
  const P = root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);

  const unitsOf = r => (r.units > 0 ? r.units : 0);
  const sum = (arr, f) => arr.reduce((t, x) => t + f(x), 0);
  const fileKey = r => {
    const fk = r.fileKey || P.canonRef(r.ref);
    return fk ? `${r.municipality}|${r.kind}|${fk}` : null;
  };

  function audit(raw, deduped, projects) {
    // ---- 1. Records -----------------------------------------------------------------
    const bySource = new Map();
    for (const r of raw) bySource.set(r.sourceName, (bySource.get(r.sourceName) || 0) + 1);
    const rawKeys = new Map();
    for (const r of raw) { const k = fileKey(r); if (k) rawKeys.set(k, (rawKeys.get(k) || 0) + 1); }
    const mergedGroups = [...rawKeys.values()].filter(n => n > 1).length;

    // ---- 2. Integrity -----------------------------------------------------------------
    const keyCount = new Map();
    for (const r of deduped) { const k = fileKey(r); if (k) keyCount.set(k, (keyCount.get(k) || 0) + 1); }
    const filesListedTwice = [...keyCount.values()].filter(n => n > 1).length;
    const seen = new Map();
    for (const p of projects) for (const r of p.records) seen.set(r.uid, (seen.get(r.uid) || 0) + 1);
    const inSeveralProjects = [...seen.values()].filter(n => n > 1).length;
    // Sites made only of permits that build nothing (signs, entrances, demolitions…) are set aside on purpose.
    const setAside = deduped.filter(r => !seen.has(r.uid) && r.kind === 'permit' && P.permitRole(r) === 'none').length;
    const inNoProject = deduped.filter(r => !seen.has(r.uid)).length - setAside;

    // ---- 3. Units -----------------------------------------------------------------------
    const u = {
      raw: sum(raw, unitsOf),
      unique: sum(deduped, unitsOf),
      withdrawn: 0, repeatApps: 0, repeatPermits: 0, permitsInApps: 0, other: 0, counted: 0,
    };
    u.duplicateCopies = u.raw - u.unique;
    for (const p of projects) {
      const live = p.records.filter(r => r.phase !== 'cancelled');
      u.withdrawn += sum(p.records.filter(r => r.phase === 'cancelled'), unitsOf);
      if (p.phase === 'cancelled') continue;
      const apps = live.filter(r => r.kind === 'application'), permits = live.filter(r => r.kind === 'permit');
      const planned = p.buildout ? p.buildout.planned : 0;
      const permitted = P.permitUnits(permits);
      const counted = p.units || 0;
      u.repeatApps += sum(apps, unitsOf) - planned;
      u.repeatPermits += sum(permits, unitsOf) - permitted;
      if (p.buildout) u.permitsInApps += planned + permitted - counted;
      else u.other += permitted - counted;   // no plan: units from the largest record instead of the permits
      u.counted += counted;
    }

    // ---- 4. Possible duplicates: separate live projects of MIN_UNITS+ units within NEAR_M of each other.
    // (Same address already merges into one project, so this looks for near-misses such as
    // a file mapped to a neighbouring civic number.)
    const NEAR_M = 60, MIN_UNITS = 20, mPerDegLat = 111320;
    const cell = NEAR_M / mPerDegLat;
    const grid = new Map(), possible = [];
    const live = projects.filter(p => p.phase !== 'cancelled' && p.units >= MIN_UNITS && p.lat != null);
    for (const p of live) {
      const gx = Math.floor(p.lng / cell), gy = Math.floor(p.lat / cell);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -1; dy <= 1; dy++) {  // ~±2 cells of longitude at Peel's latitude
        for (const q of grid.get(`${gx + dx}|${gy + dy}`) || []) {
          if (q.municipality !== p.municipality) continue;
          const d = Math.hypot((p.lng - q.lng) * mPerDegLat * Math.cos(p.lat * Math.PI / 180), (p.lat - q.lat) * mPerDegLat);
          if (d <= NEAR_M) possible.push({ projects: [q, p], metres: d, sameUnits: p.units === q.units, units: p.units + q.units });
        }
      }
      const k = `${gx}|${gy}`;
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(p);
    }
    possible.sort((a, b) => (b.sameUnits - a.sameUnits) || (b.units - a.units));

    return {
      records: {
        raw: raw.length, unique: deduped.length, copiesMerged: raw.length - deduped.length, mergedGroups,
        projects: projects.length, setAside, bySource: [...bySource].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n),
      },
      checks: [
        { key: 'filesListedTwice', label: 'Files still listed twice after merging', value: filesListedTwice },
        { key: 'inSeveralProjects', label: 'Files counted in more than one project', value: inSeveralProjects },
        { key: 'inNoProject', label: 'Files missing from every project', value: inNoProject },
      ],
      units: u,
      possible,
      possibleSameUnits: possible.filter(x => x.sameUnits).length,
    };
  }

  /** Markdown summary (CI job summary). */
  function toMarkdown(a, title = 'Duplicate audit') {
    const n = v => Math.round(v).toLocaleString('en-CA');
    const u = a.units;
    const ok = a.checks.every(c => c.value === 0);
    return [
      `## ${title}`, '',
      `${n(a.records.raw)} raw records → ${n(a.records.copiesMerged)} copies of the same file merged (${n(a.records.mergedGroups)} files) → ${n(a.records.unique)} unique files → ${n(a.records.projects)} projects${a.records.setAside ? ` (${n(a.records.setAside)} permits that build nothing — signs, entrances, demolitions… — set aside)` : ''}.`, '',
      '| Check | Result |', '|---|---|',
      ...a.checks.map(c => `| ${c.label} | ${c.value === 0 ? '✅ 0' : `❌ ${n(c.value)}`} |`), '',
      '| Units | |', '|---|---:|',
      `| On every raw record | ${n(u.raw)} |`,
      `| − copies of the same file | ${n(u.duplicateCopies)} |`,
      `| − withdrawn / refused files | ${n(u.withdrawn)} |`,
      `| − repeat applications for one proposal | ${n(u.repeatApps)} |`,
      `| − repeat permits for one building | ${n(u.repeatPermits)} |`,
      `| − permits already in their planning application | ${n(u.permitsInApps)} |`,
      `| ${u.other < 0 ? '+' : '−'} sites with no plan: largest unit figure on any file | ${n(Math.abs(u.other))} |`,
      `| **= Units counted** | **${n(u.counted)}** |`, '',
      `Possible duplicates to review: ${n(a.possible.length)} pairs of separate projects with units of 20+ units within 60 m (${n(a.possibleSameUnits)} with the same unit count).`,
      '', ok ? 'All integrity checks pass.' : '**Integrity check failed.**',
    ].join('\n');
  }

  const api = { audit, toMarkdown };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelAudit = api;
})(typeof window !== 'undefined' ? window : globalThis);
