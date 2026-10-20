/* What is on the ground (PeelPhaseEstimate): one reading of a development's phase from all it has —
 * the files' phase, the building permits' own history (a foundation permit signed off, how long ago
 * the permit was issued against how long a building that size takes), the site servicing permit and
 * the aerial check (js/aerial.js). The records keep their phase; this says where the site most
 * likely stands now, how sure that is, and each piece of evidence behind it.
 *
 * Why: the files lag the ground. 360 City Centre Drive reads "Under construction" (its conditional
 * foundation permit reads completed, two planned units have no permit), while the permit was issued
 * in 2018 and the 2024 aerial shows the towers: likely built.
 *
 * Pure (tests/phase-estimate.test.js). An estimate, not a site inspection.
 */
(function (root) {
  'use strict';
  const P = () => root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);
  const YEAR = 365.25 * 864e5;

  // Where a site stands on the ground, lowest first.
  const GROUND = {
    none: { rank: 0, label: 'Not started on site' },
    site: { rank: 0, label: 'Site work visible' },
    building: { rank: 1, label: 'Likely under construction' },
    built: { rank: 2, label: 'Likely built' },
  };
  const BY_RANK = ['none', 'building', 'built'];
  // The files' phase, read the same way.
  const FILES_GROUND = { completed: 'built', construction: 'building' };

  // A permit for part of the building only: a conditional / foundation permit ("FDN to GRADE ONLY").
  const PARTIAL = /\bFDN\b|\bfoundations?\b|\bfootings?\b|to grade only|\bconditional permit\b/i;
  const isPartial = r => PARTIAL.test(r.description || '') || /\b(CON|FDN)\s*$/i.test(String(r.ref || ''));

  /** The tallest building named in the files (storeys), or null. */
  function storeys(p) {
    let n = 0;
    for (const r of p.records || []) for (const m of String(r.description || '').matchAll(/(\d{1,3})\s*-?\s*(?:sty|storeys?|stories|story)\b/gi)) n = Math.max(n, +m[1]);
    return n || null;
  }
  /** About how long a building this size takes from permit to occupancy (years), and its words. */
  function buildYears(p) {
    const s = storeys(p), apt = (p.unitMix && p.unitMix.apartment) || 0;
    if (s >= 25) return { years: 4, what: `a ${s}-storey tower` };
    if (s >= 9) return { years: 3, what: `a ${s}-storey building` };
    if (s >= 4 || apt >= 50) return { years: 2.5, what: s ? `a ${s}-storey building` : 'an apartment building' };
    return { years: 1.5, what: 'low-rise homes' };
  }

  const dateOf = (r, ph) => { const e = (r.events || []).filter(x => x.phase === ph).sort((a, b) => a.date - b.date)[0]; return e ? e.date : null; };
  const day = d => (d ? new Date(d).toISOString().slice(0, 10) : '');
  const yrs = v => (v >= 1.5 ? `${Math.floor(v)} years` : v >= 1 ? 'a year' : `${Math.max(1, Math.round(v * 12))} months`);

  /**
   * The estimate for a development p.
   * opts.aerial: a js/aerial.js check ({ result: { status, probability }, ev: { latestYear, permitYear } }),
   *   or null (no imagery, still comparing, or failed: opts.aerialState 'run' | 'fail' | 'none').
   * opts.servicing: the site servicing evidence (js/dc-gate.js row.evidence), or null.
   * Returns null for a withdrawn site; else { key, label, rank, confidence, files, differs, evidence:
   *   [{ src, text, effect }], aerialState }. effect: +1 points to further along, -1 to less, 0 context.
   */
  function estimate(p, opts = {}) {
    if (!p || p.phase === 'cancelled') return null;
    const PH = P(), today = opts.today ? +opts.today : Date.now();
    const evidence = [], votes = [];
    let floor = 0;
    const add = (src, text, effect) => evidence.push({ src, text, effect });
    const vote = (rank, w) => votes.push({ rank, w });
    const filesLabel = PH && PH.PHASE_BY_KEY[p.phase] ? PH.PHASE_BY_KEY[p.phase].label : p.phase;
    const physical = ['permit', 'construction', 'completed'].includes(p.phase);
    const role = r => (PH && PH.permitRole ? PH.permitRole(r) : 'units');

    // ---- The files ----
    if (p.phase === 'completed') { vote(2, 1.5); add('Files', `${filesLabel}: occupancy, final inspection or permit closed`, 1); }
    else if (p.phase === 'construction') {
      floor = 1;
      const heldBack = p.buildout && p.buildout.remaining > 0 && (p.phaseRecs || []).some(r => r.kind === 'permit' && r.phase === 'completed');
      add('Files', `${filesLabel}${heldBack ? ` (a permit reads completed, but ${p.buildout.remaining.toLocaleString('en-CA')} planned unit${p.buildout.remaining === 1 ? '' : 's'} have no building permit, so the files hold it back)` : ''}`, 0);
    } else if (p.phase === 'permit') { vote(0, 0.5); add('Files', `${filesLabel}: no inspection published yet`, 0); }
    else add('Files', `${filesLabel}: no building permit yet`, 0);

    // ---- The building permits' history ----
    const permits = (p.records || []).filter(r => r.kind === 'permit' && r.phase !== 'cancelled' && !r.prePlan && !r.outside && ['units', 'res', 'nonres'].includes(role(r)));
    const issued = [...new Set(permits.map(r => dateOf(r, 'permit') || dateOf(r, 'construction')).filter(Boolean).map(Number))];
    if (physical && issued.length) {
      const first = Math.min(...issued), last = Math.max(...issued), b = buildYears(p);
      const ageLast = (today - last) / YEAR, ageFirst = (today - first) / YEAR;
      const refOf = t => (permits.find(r => +(dateOf(r, 'permit') || dateOf(r, 'construction')) === t) || {}).ref;
      if (ageLast >= b.years + 1) { vote(2, 1); add('History', `${issued.length > 1 ? 'The last building permit' : `Building permit${refOf(last) ? ` ${refOf(last)}` : ''}`} was issued ${yrs(ageLast)} ago (${day(last)}); ${b.what} usually takes about ${b.years} years from permit to occupancy`, 1); }
      else if (ageFirst < b.years) { vote(1, 0.5); add('History', `Building permit issued ${yrs(ageFirst)} ago (${day(first)}); ${b.what} usually takes about ${b.years} years, so it is likely still being built`, -1); }
      else add('History', `Building permit issued ${yrs(ageFirst)} ago (${day(first)}); ${b.what} usually takes about ${b.years} years`, 0);
    }
    // A foundation or conditional permit signed off: the building above grade came next.
    const fdn = permits.filter(r => isPartial(r) && r.phase === 'completed');
    if (physical && fdn.length) {
      floor = Math.max(floor, 1);
      const r = fdn[0], at = dateOf(r, 'completed');
      add('History', `${r.ref || 'A foundation permit'} is a conditional / foundation permit${at ? `, signed off ${day(at)}` : ' signed off'}: it covers the work up to grade, not the finished building`, 1);
    }
    // Inspections on a permit: work under way.
    if (physical && permits.some(r => (r.events || []).some(e => e.phase === 'construction'))) { floor = Math.max(floor, 1); add('History', 'Inspections are recorded on a building permit', 1); }

    // ---- Site servicing permit (js/dc-gate.js) ----
    const svc = (opts.servicing || []).filter(e => e && e.kind === 'site' && !e.existing);
    if (svc.length) {
      const e = svc.slice().sort((a, b) => String(a.applied || a.issued).localeCompare(String(b.applied || b.issued)))[0];
      if (e.issued && physical) { floor = Math.max(floor, 1); add('Servicing', `Site servicing permit ${e.ref} issued ${e.issued}: the site's pipes were being laid`, 1); }
      else add('Servicing', `Site servicing permit ${e.ref} ${e.issued ? `issued ${e.issued}` : `applied for ${e.applied}`}`, 0);
    }

    // ---- The aerial check ----
    const a = opts.aerial, st = a && a.result ? a.result.status : null;
    let siteWork = false;
    if (st) {
      const ev = a.ev || {}, year = ev.latestYear;
      const old = year && ev.permitYear && year < ev.permitYear;
      const w = old ? 0.6 : 2, tag = `Aerial${year ? ` ${year}` : ''}`;
      if (st === 'Likely completed') { vote(2, w); add(tag, `the photo shows the building (${Math.round(a.result.probability * 100)}% likely completed with the permits)`, 1); }
      else if (st === 'Likely under construction') {
        vote(1, w); siteWork = true;
        add(tag, physical ? 'the photo shows the site under construction, not finished' : 'the photo shows the site cleared, graded or changed', physical ? 0 : 1);
      } else if (st === 'Not visibly started') { vote(0, w); add(tag, `no visible change on the site${old ? ', but the photo predates the building permit' : ''}`, -1); }
      else { vote(1, 1); add(tag, 'the photo does not confirm a finished building', -1); }
    } else if (opts.aerialState === 'run') add('Aerial', 'comparing the photos…', 0);
    else if (opts.aerialState === 'fail') add('Aerial', 'the photos did not load', 0);

    // ---- Combined ----
    let key;
    if (!physical) key = siteWork ? 'site' : 'none';
    else {
      const W = votes.reduce((t, v) => t + v.w, 0), avg = W ? votes.reduce((t, v) => t + v.rank * v.w, 0) / W : null;
      const r = avg == null ? (FILES_GROUND[p.phase] ? GROUND[FILES_GROUND[p.phase]].rank : 0) : avg >= 1.5 ? 2 : avg >= 0.5 ? 1 : 0;
      key = BY_RANK[Math.max(floor, r)];
    }
    const rank = GROUND[key].rank;
    // How sure: the weight of evidence that points here, against what points elsewhere (a lower
    // bound, such as a foundation signed off, never argues against "built").
    const support = votes.filter(v => v.rank === rank).reduce((t, v) => t + v.w, 0) + (floor === rank && floor > 0 ? 1 : 0);
    const against = votes.filter(v => Math.abs(v.rank - rank) >= 1).reduce((t, v) => t + v.w, 0);
    const confidence = !physical ? (st ? 'high' : 'low') : against >= 1 ? (support >= 2.5 ? 'medium' : 'low') : support >= 2.5 ? 'high' : support >= 1 ? 'medium' : 'low';
    const filesKey = FILES_GROUND[p.phase] || 'none';
    const differs = physical && GROUND[filesKey].rank !== rank;
    let label = GROUND[key].label;
    if (key === 'none' && p.phase === 'permit') label = 'Permit issued, not visibly started';
    return { key, rank, label, confidence, files: p.phase, filesLabel, differs, ahead: differs && rank > GROUND[filesKey].rank, evidence, aerialState: st ? 'done' : opts.aerialState || 'none' };
  }

  /** The chip's words: { text, tone }. A reading that differs from the files is marked. */
  function chipText(est) {
    if (!est) return null;
    const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
    const text = `On site: ${lower(est.label)} · ${est.confidence} confidence${est.differs ? ` · files say ${lower(est.filesLabel)}` : ''}${est.aerialState === 'run' ? ' · checking the aerial…' : ''}`;
    return { text, tone: est.aerialState === 'run' ? 'wait' : est.differs ? 'tight' : 'aer' };
  }

  const api = { GROUND, PARTIAL, isPartial, storeys, buildYears, estimate, chipText };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPhaseEstimate = api;
})(typeof window !== 'undefined' ? window : globalThis);
