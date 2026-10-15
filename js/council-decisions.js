(function (root) {
'use strict';
  // Council decisions that move a planning file (SPEC 1.2): a zoning by-law passed for the file,
  // and a draft plan of subdivision approved at committee or council. Read from the agenda / minutes
  // items that name the file (data/council.json, built weekly by scripts/build-council.js) into a
  // small index, data/council-decisions.json, that loads with the developments:
  //   { files: { "Brampton|OZS|2025|32": { zoning: { bylaw: "153-2026", date: "2026-09-09", url },
  //                                        draft: { date, url }, last: "2026-09-09" } } }
  // A passed zoning by-law makes the file "Zoning approved" (still under review: zoning alone
  // commits no servicing); a draft plan approval makes it "Draft / site plan approved".
  // Pure functions (decisionsFrom, applyTo) plus the browser loader.

  // "By-law 153-2026 – To amend Comprehensive Zoning By-law 270-2004" (Brampton);
  // "A by-law to amend Zoning By-law Number 0225-2007" (Mississauga); "BL-2025-059" on an RZ file (Caledon).
  const BR_ZONING = /^\W*By-?law[- ]?(\d{1,4}-\d{4})\s*[-–—:]\s*(?:A by-?law )?To amend (?:the )?(?:Comprehensive )?Zoning By-?law/i;
  const MI_ZONING = /^\W*A by-?law to amend (?:the )?(?:Rezoning |Zoning )?By-?law(?: Number)? 0?225-2007/i;
  const CA_BYLAW = /^\W*(BL-\d{4}-\d{2,4})\b/i;
  const SEE_BYLAW = /See By-?law (\d{1,4}-\d{4})/i;
  // "…Draft Plan of Subdivision … (File T-M17002) be approved" in a carried motion.
  const DRAFT_TITLE = /draft plan of subdivision|draft plan approval/i;
  const DRAFT_DECIDED = /draft plan of subdivision[^;]{0,300}?\bbe approved\b|approve the (proposed )?draft plan|draft plan approval be (granted|issued)/i;

  function zoningOf(m, it, fileKey) {
    if (!m.passed) return null;
    const t = it.title || '';
    let x = BR_ZONING.exec(t);
    if (x) return x[1];
    if (MI_ZONING.test(t)) { const s = SEE_BYLAW.exec(it.text || ''); return s ? s[1] : ''; }
    x = CA_BYLAW.exec(t);
    if (x && /^Caledon\|RZ\|/.test(fileKey)) return x[1].toUpperCase();
    return null;
  }
  function draftOf(m, it) {
    const out = String(it.outcome || '').toUpperCase();
    if (/DEFEATED|LOST|DEFERRED|REFERRED|WITHDRAWN/.test(out)) return false;
    if (!(m.passed || /CARRIED|APPROVED|ADOPTED/.test(out))) return false;
    return DRAFT_TITLE.test(`${it.title || ''} ${(it.text || '').slice(0, 600)}`) && DRAFT_DECIDED.test(it.text || '');
  }

  /** council.json → { files: { "<muni>|<canonical file>": { zoning?, draft?, last } } }: the latest of
   *  each decision, and the date of the file's latest item of any kind (SPEC 1.3: council items count
   *  as activity on the file). */
  function decisionsFrom(council) {
    const files = {};
    for (const [fk, refs] of Object.entries((council && council.files) || {})) {
      for (const [mid, i] of refs) {
        const m = council.meetings && council.meetings[mid]; const it = m && m.items && m.items[i];
        if (!it || !m.date) continue;
        { const e = files[fk] || (files[fk] = {}); if (!e.last || m.date > e.last) e.last = m.date; }
        const z = zoningOf(m, it, fk);
        if (z != null) { const e = files[fk] || (files[fk] = {}); if (!e.zoning || m.date > e.zoning.date) e.zoning = { bylaw: z || null, date: m.date, url: m.url || null }; }
        if (draftOf(m, it)) { const e = files[fk] || (files[fk] = {}); if (!e.draft || m.date > e.draft.date) e.draft = { date: m.date, url: m.url || null }; }
      }
    }
    return { version: 1, generatedAt: council && council.generatedAt || null, files };
  }

  // The decisions onto the planning records (r.council), by the file key council.json uses.
  // Mississauga's "OZ/OPA 21-3" is filed in council items as "OZ 21/003": both spellings are tried.
  function keysOf(r, canonRef) {
    const k = r.fileKey || canonRef(r.ref); if (!k) return [];
    const out = [`${r.municipality}|${k}`];
    if (/^OZ\|OPA\|/.test(k)) out.push(`${r.municipality}|${k.replace(/^OZ\|OPA\|/, 'OZ|')}`);
    if (/^OZ\|\d/.test(k)) out.push(`${r.municipality}|${k.replace(/^OZ\|/, 'OZ|OPA|')}`);
    return out;
  }
  function applyTo(records, d, canonRef) {
    const files = (d && d.files) || {};
    let n = 0;
    for (const r of records) {
      if (r.kind !== 'application') continue;
      let c = null;
      for (const k of keysOf(r, canonRef || (x => x))) if (files[k]) { c = files[k]; break; }
      if (c) { r.council = c; n++; } else if (r.council) delete r.council;
    }
    return n;
  }

  let data = null, loading = null;
  function load() {
    if (!loading) loading = fetch('data/council-decisions.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => { data = d && d.files ? d : null; return data; });
    return loading;
  }

  const api = { decisionsFrom, applyTo, zoningOf, draftOf, load, setData(d) { data = d && d.files ? d : null; loading = Promise.resolve(data); }, get data() { return data; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelCouncilDecisions = api;
})(typeof window !== 'undefined' ? window : globalThis);
