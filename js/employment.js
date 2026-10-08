/*
 * Employment uses on development applications, read from the type and description text:
 * industrial, office, retail / commercial, hotel, institutional. Floor areas stated in the text
 * ("2,506 sq m of retail GFA", "a place of worship (1,445 m²)", "45,000 sq ft warehouse") are
 * assigned to the nearest use; jobs are estimated from floor space per worker.
 * Pure functions (testable in Node).
 */
(function (root) {
  'use strict';

  const USES = [
    { key: 'industrial', label: 'Industrial / logistics', re: /industrial|warehous|logistic|distribution (centre|center|facility|building)|manufactur|truck (terminal|repair|wash|yard|parking)|transport terminal|data cent|self[- ]?storage|storage facility|prestige (industrial|employment)|business park|employment (land|use|area|building)s?/i },
    { key: 'office', label: 'Office', re: /office/i },
    { key: 'retail', label: 'Retail / commercial', re: /retail|commercial|plaza|shopping|grocery|supermarket|restaurant|drive[- ]?thr|gas (bar|station)|service station|car wash|convenience|bank|fitness|banquet|automobile (sales|dealer)|car dealer/i },
    { key: 'hotel', label: 'Hotel', re: /hotel|motel/i },
    { key: 'institutional', label: 'Institutional', re: /school|place of (worship|religious)|church|mosque|temple|gurdwara|community cent|hospital|long[- ]term care|day ?care|child ?care|library|college|university|institutional/i },
  ];
  // Floor space per worker (m² GFA per job), typical planning assumptions.
  const M2_PER_JOB = { industrial: 110, office: 25, retail: 45, hotel: 60, institutional: 50 };

  const AREA = /(\d{1,3}(?:[,\s]\d{3})+|\d+)(?:\.\d+)?\s*(sq\.?\s*m(?:etres?|eters?)?\b|square\s+met(?:re|er)s?|m2\b|m²|sq\.?\s*f(?:ee)?t\b|sq\.?\s*ft\b|square\s+f(?:ee|oo)t|sf\b|ft2\b|ft²)/gi;
  const toNum = s => Number(String(s).replace(/[,\s]/g, ''));

  /** Uses mentioned in a file's type and description (residential is not an employment use). */
  function usesOf(text) {
    const t = String(text || '');
    return USES.filter(u => u.re.test(t)).map(u => u.key);
  }

  /**
   * Floor areas in the text, each assigned to the use named closest to it (within the same
   * clause). Residential areas ("… m² of residential") are skipped.
   */
  function areasOf(text) {
    const t = String(text || '');
    const out = [];
    for (const m of t.matchAll(AREA)) {
      let v = toNum(m[1]);
      if (!(v > 0)) continue;
      if (/f(ee|oo)?t|sf|ft/i.test(m[2])) v *= 0.092903;
      const before = t.slice(Math.max(0, m.index - 60), m.index), after = t.slice(m.index + m[0].length, m.index + m[0].length + 40);
      const near = s => USES.map(u => ({ u, i: s.search(u.re) })).filter(x => x.i >= 0);
      // Prefer a use right after ("2,506 sq m of retail"), else the closest one before.
      const a = near(after.split(/[;.]/)[0]).sort((x, y) => x.i - y.i)[0];
      const bClause = before.split(/[;]|\band\b/).pop();
      // Closest use before it in the same clause, else anywhere in the lead-in ("hotel with 101
      // rooms and a total GFA of 7,077 m²").
      const b = near(bClause).sort((x, y) => y.i - x.i)[0] || near(before).sort((x, y) => y.i - x.i)[0];
      if (/residential|dwelling/i.test(after.split(/[;.,]/)[0]) && !a) continue;
      const use = a ? a.u.key : b ? b.u.key : null;
      if (use) out.push({ use, m2: Math.round(v) });
    }
    return out;
  }

  /**
   * Employment summary for a project: uses found on its live applications, floor area per use
   * (largest figure per use across files, since files repeat one proposal) and estimated jobs.
   * perJob: m²/job by use (defaults to M2_PER_JOB; missing or non-positive entries fall back).
   */
  function employmentOf(project, perJob = M2_PER_JOB) {
    const rate = k => (perJob && perJob[k] > 0 ? perJob[k] : M2_PER_JOB[k]);
    // Minor / limited files (doors, revisions) carry the existing building's area: skip them.
    const apps = project.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled' && !r.minor);
    const uses = new Set(), m2 = {}, fromField = new Set();
    for (const r of apps) {
      const text = `${r.type || ''} ${r.description || ''}`;
      for (const u of usesOf(text)) uses.add(u);
      const perUse = {};
      for (const a of areasOf(r.description || '')) perUse[a.use] = (perUse[a.use] || 0) + a.m2;
      for (const k in perUse) m2[k] = Math.max(m2[k] || 0, perUse[k]);
      // A purely non-residential file with a published floor area and one use: use that figure.
      if (r.gfa > 0 && !(r.units > 0)) {
        const us = usesOf(text);
        if (us.length === 1 && !m2[us[0]]) { m2[us[0]] = Math.round(r.gfa); fromField.add(us[0]); }
      }
    }
    if (!uses.size && !Object.keys(m2).length) return null;
    for (const k in m2) uses.add(k);
    const rows = USES.filter(u => uses.has(u.key)).map(u => ({
      key: u.key, label: u.label, m2: m2[u.key] || null, fromField: fromField.has(u.key),
      jobs: m2[u.key] ? Math.round(m2[u.key] / rate(u.key)) : null,
    }));
    const totalM2 = rows.reduce((t, r) => t + (r.m2 || 0), 0);
    const jobs = rows.reduce((t, r) => t + (r.jobs || 0), 0);
    return { uses: rows, totalM2, jobs, mixed: project.units > 0 };
  }

  const api = { USES, M2_PER_JOB, usesOf, areasOf, employmentOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelEmployment = api;
})(typeof window !== 'undefined' ? window : globalThis);
