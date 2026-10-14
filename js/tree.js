/* js/tree.js — how planning applications nest into a development (Step A: audit only).
 *
 * The Ontario process the tree follows: pre-consultation → (block plan / precinct, greenfield) →
 * official plan / zoning amendment (use) alongside a draft plan of subdivision (land division) →
 * site plan per block or building → condominium (repeats the site plan's units) → building permits.
 * Containment is spatial: block plan ⊃ draft plan ⊃ site plan ⊃ condo ⊃ permits; an OPA / ZBA on
 * the same land as a draft plan is a sibling, not a parent.
 *
 *   classifyRole(record)          → { role, roles, reason, reclassified? }
 *   fileNodes(records)            → one node per municipal file (records with the same file number merge)
 *   buildTrees(nodes, permits)    → { links, trees, flags }   every link carries rule, overlap, address
 *                                   match, date order and confidence
 *   countTree(tree)               → the proposed unit count for one tree (report only)
 *
 * Pure functions (no DOM): used by scripts/audit-tree.js and tests/tree.test.js. Not loaded by the
 * app yet — Step B applies it after the audit is reviewed.
 */
(function (root) {
  'use strict';
  const P = typeof module !== 'undefined' && module.exports ? require('./phases.js') : root.PeelPhases;

  // ---- 1. Roles ---------------------------------------------------------------------------------
  const ROLES = ['precon', 'block_plan', 'use', 'land_division', 'site_plan', 'condo', 'permit', 'other'];
  // Mississauga's growth-management layer puts the place in the type field ("Neighbourhood").
  const PLACE_CATEGORY = /^(neighbourhood|employment area|growth centre|growth node|downtown core|corporate centre|major node|community node|special purpose area|business employment|downtown|node|centre)s?$/i;
  const rid = r => String(r.sourceId || '').split('/')[0];

  // Brampton's OZS files: the description opens with the application types filed ("Draft Plan of
  // Subdivision | Official Plan Amendment | Zoning By Law Amendment — …").
  function brOzsRoles(r) {
    const d = String(r.description || ''), head = d.includes(' — ') ? d.split(' — ')[0] : d.slice(0, 160);
    const draft = /draft plan of subdivision|plan of subdivision|draft plan/i.test(head);
    const block = /block plan/i.test(head);
    const use = /official plan|zoning|by-?law|minister'?s zoning order|\bmzo\b|lifting of hold|holding/i.test(head);
    const roles = [];
    if (block) roles.push('block_plan');
    if (draft) roles.push('land_division');
    if (use || !roles.length) roles.push('use');
    const role = draft ? 'land_division' : block ? 'block_plan' : 'use';
    return { role, roles, reason: `Brampton OZS file; types listed in the description: "${head.slice(0, 120)}"` };
  }
  function misRole(r) {
    const ref = String(r.ref || '').toUpperCase().trim(), type = String(r.type || '').trim();
    const byPrefix =
      /^PRE\b/.test(ref) ? ['precon', 'file prefix PRE'] :
      /^21T\b|^21T-/.test(ref) || /^T-?M\b/.test(ref) ? ['land_division', 'file prefix 21T (draft plan of subdivision)'] :
      /^(21CDM|CDM)\b|^21CDM-/.test(ref) ? ['condo', 'file prefix CDM (condominium)'] :
      /^(OZ\/OPA|OPA|OZ|H[- ]?OZ|H)\b/.test(ref) ? ['use', `file prefix ${ref.split(/[\s\d]/)[0]} (rezoning / official plan amendment / holding removal)`] :
      /^(SP|SPI|SPM|SPR|SPAX|SPX|SPA)\b/.test(ref) ? ['site_plan', `file prefix ${ref.split(/[\s\d]/)[0]} (site plan)`] : null;
    const byType =
      /subdivision/i.test(type) ? ['land_division', 'type SUBDIVISION'] :
      /condo/i.test(type) ? ['condo', 'type CONDOMINIUM'] :
      /rezoning|official plan|zoning|holding/i.test(type) ? ['use', `type ${type}`] :
      /site plan/i.test(type) ? ['site_plan', `type ${type}`] : null;
    const [role, why] = byPrefix || byType || ['other', 'no recognised file prefix or type'];
    const out = { role, roles: [role], reason: `Mississauga; ${why}` };
    if (PLACE_CATEGORY.test(type)) out.reclassified = { ref: r.ref, sourceId: r.sourceId, typeField: type, role, reason: `the type field holds the place category "${type}"; role from the ${byPrefix ? 'file prefix' : 'description'}` };
    return out;
  }
  const CAL_TYPES = [
    [/plan of subdivision|draft plan/i, 'land_division', 'plan of subdivision'],
    [/consent|severance/i, 'land_division', 'consent (land division)'],
    [/official plan|zoning|by-?law/i, 'use', 'official plan / zoning amendment'],
    [/condominium/i, 'condo', 'plan of condominium'],
    [/site plan/i, 'site_plan', 'site plan'],
    [/pre-?consult/i, 'precon', 'pre-consultation'],
    [/block plan|precinct|secondary plan/i, 'block_plan', 'block plan'],
  ];
  function classifyRole(r) {
    if (r.kind === 'permit') return { role: 'permit', roles: ['permit'], reason: 'building permit' };
    const src = rid(r), muni = r.municipality;
    if (muni === 'Brampton') {
      if (src === 'bra-precon') return { role: 'precon', roles: ['precon'], reason: 'Brampton pre-consultation layer' };
      if (src === 'bra-condo') return { role: 'condo', roles: ['condo'], reason: 'Brampton draft plans of condominium layer' };
      if (src === 'bra-siteplan') return { role: 'site_plan', roles: ['site_plan'], reason: 'Brampton site plan approval layer' };
      if (src === 'bra-dps') return { role: 'site_plan', roles: ['site_plan'], reason: 'Brampton development permit system (zoning and site plan approval in one): counted as a site plan' };
      if (src === 'bra-opa-zba-sub') return brOzsRoles(r);
    }
    if (muni === 'Mississauga') return misRole(r);
    if (muni === 'Caledon') {
      const t = String(r.type || '');
      for (const [re, role, why] of CAL_TYPES) if (re.test(t)) return { role, roles: [role], reason: `Caledon type "${t}" (${why})` };
    }
    // Anything else: from the app's stage.
    const stage = r.stage || P.stageOf(r);
    const role = { precon: 'precon', master: /subdivision/i.test(r.type || '') ? 'land_division' : 'use', siteplan: 'site_plan', condo: 'condo' }[stage] || 'other';
    return { role, roles: [role], reason: `from the app's stage (${stage})` };
  }

  // ---- 2. Geometry (sampling: deterministic, a few per cent of accuracy) ----------------------------
  const bboxOf = rings => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const g of rings) for (const [x, y] of g) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; } return [x0, y0, x1, y1]; };
  const boxesMeet = (a, b) => a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
  // Share of polygon a's area lying inside polygon b (0–1), on an N × N sample of a's box.
  function shareInside(a, b, N = 24) {
    const ba = a.bbox || bboxOf(a.rings), bb = b.bbox || bboxOf(b.rings);
    if (!boxesMeet(ba, bb)) return 0;
    let n = 0, k = 0;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = ba[0] + (ba[2] - ba[0]) * (i + 0.5) / N, y = ba[1] + (ba[3] - ba[1]) * (j + 0.5) / N;
      if (!P.pointInRings(x, y, a.rings)) continue;
      n++;
      if (x >= bb[0] && x <= bb[2] && y >= bb[1] && y <= bb[3] && P.pointInRings(x, y, b.rings)) k++;
    }
    return n ? k / n : 0;
  }

  // ---- 3. File nodes ----------------------------------------------------------------------------------
  const DAY = 864e5;
  const firstDate = recs => { let t = Infinity; for (const r of recs) for (const e of r.events || []) { const v = +e.date; if (v < t) t = v; } return isFinite(t) ? t : null; };
  function fileNodes(records) {
    const by = new Map();
    for (const r of records) {
      if (r.kind !== 'application') continue;
      const fk = r.fileKey || P.canonRef(r.ref);
      const k = `${r.municipality}|${fk || r.uid}`;
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(r);
    }
    const nodes = [];
    for (const [id, recs] of by) {
      const cls = recs.map(classifyRole);
      // The most specific role among the merged records (a file is one thing; layers can disagree).
      const order = ['land_division', 'block_plan', 'use', 'site_plan', 'condo', 'precon', 'other'];
      const best = cls.slice().sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role))[0];
      const roles = [...new Set(cls.flatMap(c => c.roles))];
      const polys = recs.filter(r => r.poly && r.poly.length).map(r => r.poly);
      const poly = polys.sort((a, b) => P.ringsArea(b) - P.ringsArea(a))[0] || null;
      const live = recs.filter(r => r.phase !== 'cancelled');
      const units = Math.max(0, ...live.filter(r => !r.minor && !P.isMinorFile(r)).map(r => (r.units > 0 ? r.units : 0)));
      const precUnits = Math.max(0, ...live.map(r => r.precUnits || 0));
      const pt = recs.find(r => r.lat != null);
      nodes.push({
        id, municipality: recs[0].municipality, refs: [...new Set(recs.map(r => r.ref).filter(Boolean))], records: recs,
        role: best.role, roles, reason: best.reason, reclassified: cls.map(c => c.reclassified).filter(Boolean),
        rings: poly, bbox: poly ? bboxOf(poly) : null, area: poly ? P.ringsArea(poly) : 0,
        lat: pt ? pt.lat : null, lng: pt ? pt.lng : null,
        addrs: new Set(recs.map(r => P.normalizeAddress(r.address)).filter(Boolean)),
        addrParts: [...new Set(recs.map(r => r.address).filter(Boolean))].map(addrParts).filter(p => p.civic.size && p.words.size),
        date0: firstDate(recs), units, precUnits, cancelled: !live.length,
        minor: recs.every(r => r.minor || P.isMinorFile(r)),
        merged: recs.length > 1 ? `${recs.length} records share file number ${recs[0].ref || ''}` : null,
      });
    }
    return nodes;
  }

  // ---- 4. Links ------------------------------------------------------------------------------------------
  const T = { CONTAIN: 0.8, SAME: 0.8, PRECON: 0.5, NEVER: 0.15, COVER: 0.9, OVER: 0.1, POLICY_M2: 4e6 };
  const FORMAL = new Set(['block_plan', 'use', 'land_division']);
  const LEVEL = { block_plan: 0, land_division: 1, use: 1, site_plan: 2, condo: 3, precon: 9, other: 9 };
  // Same address: the normalised address, or a shared civic number on a shared street word
  // ("17 & 19 ANN ST AND 84 HIGH ST E" and "19 ANN ST").
  const STREET_STOP = new Set(['AND', 'THE', 'FORMERLY', 'UNIT', 'ST', 'RD', 'AVE', 'DR', 'BLVD', 'CRES', 'CRT', 'WAY', 'LANE', 'LN', 'PKWY', 'GATE', 'PL', 'LINE', 'N', 'S', 'E', 'W', 'ON', 'CALEDON', 'BRAMPTON', 'MISSISSAUGA', 'OF', 'CORNER', 'NORTH', 'SOUTH', 'EAST', 'WEST']);
  function addrParts(raw) {
    const s = String(raw || '').toUpperCase().replace(/\([^)]*\)/g, ' ').replace(/,.*$/, '');
    return { civic: new Set((s.match(/\b\d{1,5}\b/g) || []).filter(n => +n > 0)), words: new Set((s.match(/[A-Z]{3,}/g) || []).filter(w => !STREET_STOP.has(w))) };
  }
  const addrMatch = (a, b) => {
    for (const x of a.addrs) if (b.addrs.has(x)) return true;
    for (const p of a.addrParts) for (const q of b.addrParts) {
      let civ = false, word = false;
      for (const c of p.civic) if (q.civic.has(c)) { civ = true; break; }
      for (const w of p.words) if (q.words.has(w)) { word = true; break; }
      if (civ && word) return true;
    }
    return false;
  };
  // A child dated more than a year before its parent's first event is out of order (a site plan
  // filed years before the draft plan it supposedly sits in).
  const dateOrder = (child, parent) => (child.date0 == null || parent.date0 == null ? 'unknown' : child.date0 >= parent.date0 - 365 * DAY ? 'ok' : 'reversed');
  function confidence({ share, point, addr, order, ambiguous }) {
    if (order === 'reversed' || ambiguous) return 'low';
    if (point) return addr ? 'medium' : 'low';
    if (share == null) return addr ? 'medium' : 'low';
    return share >= 0.9 ? 'high' : 'medium';
  }
  // Overlap between two nodes: both shares when both have a boundary, else point-in-boundary.
  function overlap(a, b) {
    if (a.rings && b.rings) return { ab: shareInside(a, b), ba: shareInside(b, a), point: false };
    if (a.rings && b.lat != null && P.pointInRings(b.lng, b.lat, a.rings)) return { ab: null, ba: 1, point: true };   // b's point in a
    if (b.rings && a.lat != null && P.pointInRings(a.lng, a.lat, b.rings)) return { ab: 1, ba: null, point: true };   // a's point in b
    return { ab: 0, ba: 0, point: false };
  }
  // The link rule for child c under parent p, given c's share inside p (1 when only c's point is
  // known and it lies inside p's boundary; null when p has no boundary — then nothing is contained).
  function containRule(c, p, s) {
    if (s == null || s < T.CONTAIN) return null;
    if (p.role === 'block_plan' && c.role === 'land_division') return 'block plan ⊃ draft plan';
    if (p.roles.includes('land_division') && (c.role === 'site_plan' || c.role === 'condo')) return 'draft plan ⊃ site plan / condo';
    if (p.role === 'site_plan' && c.role === 'condo') return 'site plan ⊃ condo';
    // No draft plan: a rezoning's land holding its site plans (infill). Not in the brief's list —
    // flagged as an assumption in the audit; medium confidence at best.
    if (p.role === 'use' && !p.roles.includes('land_division') && (c.role === 'site_plan' || c.role === 'condo') && (p.area === 0 || c.area === 0 || c.area < p.area * 0.9)) return 'rezoning ⊃ site plan (no draft plan)';
    return null;
  }
  // Two site plans on the same land with different counts: phases (both proceed, each with its own
  // building), a resubmission (the later file replaces the earlier proposal), or a redevelopment
  // (the earlier site plan was built long ago; its units are already there). Scored from the files.
  const YEAR = 365.25 * DAY;
  const APPROVED = new Set(['approved', 'permit', 'construction', 'completed']);
  const PHASE_ID = /\b(phase|stage|tower|building|bldg|block)\s*(\d+[a-z]?|[ivx]+\b|[a-h]\b|one|two|three|four)/gi;
  const RESUB = /revis|re-?submi|new application|replac|supersed|amend\w* (to )?(the )?(approved|previous)|previously (approved|submitted)|update[sd]? (site )?plan/i;
  const words = s => new Set(String(s || '').toLowerCase().match(/[a-z]{4,}/g) || []);
  const jaccard = (x, y) => { if (!x.size || !y.size) return 0; let k = 0; for (const w of x) if (y.has(w)) k++; return k / (x.size + y.size - k); };
  const ids = s => new Set([...String(s || '').matchAll(PHASE_ID)].map(m => `${m[1].toLowerCase().replace('bldg', 'building')} ${m[2].toLowerCase()}`));
  function sameLandVerdict(a, b) {
    const [E, L] = (a.date0 || 0) <= (b.date0 || 0) ? [a, b] : [b, a];
    const dE = E.records.map(r => r.description || '').join(' '), dL = L.records.map(r => r.description || '').join(' ');
    const gap = E.date0 != null && L.date0 != null ? (L.date0 - E.date0) / YEAR : null;
    const apprE = E.records.some(r => APPROVED.has(r.phase)), apprL = L.records.some(r => APPROVED.has(r.phase));
    const doneE = E.records.some(r => r.phase === 'completed');
    const ev = [], counts = { phase: 0, resubmission: 0 };
    const add = (k, n, why) => { counts[k] += n; ev.push(`${k} +${n}: ${why}`); };
    // Built long ago: the new file rebuilds the site.
    if (gap != null && gap >= 8 && (apprE || doneE)) return { verdict: 'redevelopment', earlier: E, later: L, counts, evidence: [`${E.refs[0]} approved ${Math.round(gap)} years before ${L.refs[0]} was filed`] };
    const iE = ids(dE), iL = ids(dL);
    if (iE.size && iL.size && ![...iL].some(x => iE.has(x))) add('phase', 2, `different phase / tower / block named (${[...iE].join(', ')} vs ${[...iL].join(', ')})`);
    else if (/\b(phase|stage)\s*(2|ii|two|3|iii|three)\b/i.test(dL) && !/\b(phase|stage)\s*(2|ii|two|3|iii|three)\b/i.test(dE)) add('phase', 1, `${L.refs[0]} names a later phase`);
    if (RESUB.test(dL)) add('resubmission', 2, `${L.refs[0]} says it revises, replaces or resubmits`);
    if (apprE && apprL) add('phase', 1, 'both are approved (two approvals on one land)');
    if (!apprE && apprL) add('resubmission', 1, `${E.refs[0]} was never approved; ${L.refs[0]} was`);
    if (!apprE && !apprL && gap != null && gap >= 1) add('resubmission', 1, 'neither approved; the later one was filed a year or more after');
    const sim = jaccard(words(dE), words(dL));
    if (sim >= 0.6) add('resubmission', 1, `descriptions ${Math.round(sim * 100)}% alike`);
    else if (sim <= 0.2 && dE && dL) add('phase', 1, `descriptions only ${Math.round(sim * 100)}% alike (different buildings)`);
    if (E.units > 0 && L.units > 0 && Math.abs(E.units - L.units) <= 0.25 * Math.max(E.units, L.units)) add('resubmission', 1, `counts within 25% (${E.units} vs ${L.units})`);
    const verdict = counts.resubmission - counts.phase >= 2 ? 'resubmission' : counts.phase - counts.resubmission >= 2 ? 'phase' : 'unclear';
    return { verdict, earlier: E, later: L, counts, evidence: ev };
  }
  function buildTrees(nodes, { permits = [], log = () => {} } = {}) {
    const links = [], flags = { twoTrees: [], precon: [], crossMuni: [], sameLandSitePlans: [], dateReversed: [] };
    // Candidate pairs: boxes that meet, same address, or a point inside a boundary (grid of 0.01°).
    const grid = new Map(), cellOf = (x, y) => `${Math.floor(x / 0.01)},${Math.floor(y / 0.01)}`;
    const cellsOf = n => { const out = []; const b = n.bbox || (n.lng != null ? [n.lng, n.lat, n.lng, n.lat] : null); if (!b) return out; for (let x = Math.floor(b[0] / 0.01); x <= Math.floor(b[2] / 0.01); x++) for (let y = Math.floor(b[1] / 0.01); y <= Math.floor(b[3] / 0.01); y++) out.push(`${x},${y}`); return out; };
    nodes.forEach((n, i) => { for (const c of cellsOf(n)) { if (!grid.has(c)) grid.set(c, []); grid.get(c).push(i); } });
    const pairs = new Set();
    nodes.forEach((n, i) => { for (const c of cellsOf(n)) for (const j of grid.get(c) || []) if (j > i) pairs.add(`${i},${j}`); });
    const byAddr = new Map(); nodes.forEach((n, i) => { for (const a of n.addrs) { if (!byAddr.has(a)) byAddr.set(a, []); byAddr.get(a).push(i); } });
    for (const list of byAddr.values()) if (list.length < 40) for (const i of list) for (const j of list) if (j > i) pairs.add(`${i},${j}`);
    log(`candidate pairs: ${pairs.size}`);
    // Area-wide official plan amendments (no count, larger than any one site) are policy: never a
    // parent, sibling or child; planAmendments() lists them for the developments they cover.
    for (const n of nodes) n.policy = !process.env.NOPOL && isOpa(n) && !(n.units > 0) && !n.roles.includes('land_division') && n.area > T.POLICY_M2;

    // Evidence for every pair.
    const ev = [];
    for (const key of pairs) {
      const [i, j] = key.split(',').map(Number), a = nodes[i], b = nodes[j];
      if (a.cancelled || b.cancelled || a.policy || b.policy) continue;
      let o = overlap(a, b); const addr = addrMatch(a, b);
      // No boundary to measure on one side and nothing inside the other: the same address stands in
      // (medium confidence at best); with both boundaries, the address never overrides the land.
      if (!o.point && !(a.rings && b.rings) && addr) o = { ab: 1, ba: 1, point: true };
      const best = Math.max(o.ab || 0, o.ba || 0);
      if (!o.point && best < T.NEVER && !(addr && !(a.rings && b.rings))) continue;   // edge neighbours never link
      if (a.municipality !== b.municipality) { if (best >= T.CONTAIN) flags.crossMuni.push({ a: a.refs[0], b: b.refs[0], overlap: +best.toFixed(2) }); continue; }
      ev.push({ i, j, a, b, ...o, addr, best });
    }
    // 4a. Same land: use + land division (the brief), use + site plan with no draft plan (assumption),
    // and two site plans on the same land with the same count or "revision" wording (the app's
    // current merge rule, kept so a resubmission isn't counted twice).
    const parent = new Array(nodes.length).fill(-1), same = new Map();
    const uf = nodes.map((_, i) => i), find = x => (uf[x] === x ? x : (uf[x] = find(uf[x]))), join = (x, y) => { uf[find(x)] = find(y); };
    const REVISES = /revis|minor|previously approved|amend\w* (to )?(the )?(approved|existing)|re-?submi|update[sd]? to/i;
    for (const e of ev) {
      const { a, b } = e, roles = new Set([a.role, b.role]);
      const mutual = e.point ? 1 : Math.min(e.ab, e.ba);
      let rule = null;
      if (mutual >= T.SAME && (a.roles.includes('use') || b.roles.includes('use')) && (a.roles.includes('land_division') || b.roles.includes('land_division')) && a.role !== b.role) rule = 'same land: use + draft plan';
      else if (mutual >= T.SAME && roles.has('use') && roles.has('site_plan') && !a.roles.includes('land_division') && !b.roles.includes('land_division')) rule = e.point ? 'same land: rezoning + site plan (point in boundary)' : 'same land: rezoning + site plan (no draft plan)';
      else if (mutual >= T.SAME && a.role === 'precon' && b.role === 'precon') rule = 'same land: successive pre-consultations';
      else if (!e.point && FORMAL.has(a.role) && FORMAL.has(b.role) && Math.max(e.ab, e.ba) >= T.CONTAIN && a.units > 0 && b.units > 0 && Math.abs(a.units - b.units) <= T.OVER * Math.max(a.units, b.units)) rule = 'same proposal re-filed: one inside the other, same count (±10%)';
      else if (mutual >= T.SAME && a.role === b.role && (a.role === 'use' || a.role === 'land_division')) rule = 'same land: two files of the same kind';
      else if (a.role === 'site_plan' && b.role === 'site_plan' && mutual >= T.SAME) {
        const rev = (a.units && a.units === b.units) || a.minor || b.minor || a.records.concat(b.records).some(r => REVISES.test(r.description || ''));
        if (rev) rule = 'same land: site plan revision';
        else {
          // Different counts on the same land: phases, a resubmission, or a rebuild of an old site?
          const v = sameLandVerdict(a, b);
          flags.sameLandSitePlans.push({ a: v.earlier.refs[0], b: v.later.refs[0], units: [v.earlier.units, v.later.units], overlap: +mutual.toFixed(2), verdict: v.verdict, evidence: v.evidence, counts: v.counts });
          if (v.verdict === 'resubmission' || v.verdict === 'redevelopment') {
            rule = v.verdict === 'resubmission' ? 'same land: resubmission (the later file replaces the earlier)' : 'same land: redevelopment (the earlier site plan was built long ago)';
            v.earlier.superseded = v.verdict;
          }
        }
      }
      if (!rule) continue;
      const order = 'n/a', conf = rule.startsWith('same proposal re-filed') || /resubmission|redevelopment/.test(rule) ? 'medium' : confidence({ share: e.point ? null : mutual, point: e.point, addr: e.addr, order });
      links.push({ type: 'sibling', rule, a: a.id, b: b.id, overlap: e.point ? null : +mutual.toFixed(2), point: e.point, addr: e.addr, order, confidence: conf });
      join(e.i, e.j); same.set(`${e.i},${e.j}`, true);
    }
    // Formal files mostly inside another formal file but not linked by any rule: for review.
    flags.nestedFormal = [];
    for (const e of ev) {
      if (same.has(`${e.i},${e.j}`) || e.point || !FORMAL.has(e.a.role) || !FORMAL.has(e.b.role)) continue;
      const [inner, outer, s] = e.ab >= e.ba ? [e.a, e.b, e.ab] : [e.b, e.a, e.ba];
      if (s >= T.CONTAIN && !(outer.role === 'block_plan' && inner.role === 'land_division')) flags.nestedFormal.push({ inner: inner.refs[0], innerRole: inner.role, innerUnits: inner.units, outer: outer.refs[0], outerRole: outer.role, outerUnits: outer.units, share: +s.toFixed(2) });
    }
    // 4b. Containment: each child takes the smallest parent that holds it (≥ 80%); a child held by
    // two parents that aren't nested is flagged as "in two trees".
    const cand = nodes.map(() => []);
    for (const e of ev) {
      if (same.has(`${e.i},${e.j}`)) continue;
      for (const [ci, pi, s] of [[e.i, e.j, e.ab], [e.j, e.i, e.ba]]) {
        const c = nodes[ci], p = nodes[pi];
        if (LEVEL[c.role] <= LEVEL[p.role]) continue;
        const rule = containRule(c, p, s);
        if (rule) cand[ci].push({ pi, rule, share: e.point ? null : s, point: e.point, addr: e.addr });
      }
    }
    nodes.forEach((c, ci) => {
      const cs = cand[ci]; if (!cs.length) return;
      cs.sort((x, y) => (nodes[x.pi].area || Infinity) - (nodes[y.pi].area || Infinity) || (y.share || 0) - (x.share || 0));
      const top = cs[0], p = nodes[top.pi];
      // Parents that don't nest in each other (neither inside the other) → two trees.
      const others = cs.slice(1).filter(o => { const q = nodes[o.pi]; if (find(o.pi) === find(top.pi)) return false; const s = p.rings && q.rings ? Math.max(shareInside(p, q), shareInside(q, p)) : 0; return s < T.CONTAIN; });
      const order = dateOrder(c, p);
      const conf = confidence({ share: top.share, point: top.point, addr: top.addr, order, ambiguous: others.length > 0 });
      if (others.length) flags.twoTrees.push({ file: c.refs[0], role: c.role, parents: [p.refs[0], ...others.map(o => nodes[o.pi].refs[0])] });
      if (order === 'reversed') flags.dateReversed.push({ child: c.refs[0], parent: p.refs[0], rule: top.rule });
      parent[ci] = top.pi;
      links.push({ type: 'parent', rule: top.rule, child: c.id, parent: p.id, overlap: top.share == null ? null : +top.share.toFixed(2), point: top.point, addr: top.addr, order, confidence: conf });
    });
    // 4c. Pre-consultations: to the one formal file they overlap most (≥ 50%), never bridging two.
    nodes.forEach((c, ci) => {
      if (c.role !== 'precon' || c.cancelled) return;
      const opts = [];
      for (const e of ev) {
        if (e.i !== ci && e.j !== ci) continue;
        const oi = e.i === ci ? e.j : e.i, o = nodes[oi]; if (o.role === 'precon') continue;
        const s = e.i === ci ? e.ab : e.ba;
        if ((s != null && s >= T.PRECON) || (e.point && e.addr)) opts.push({ oi, s: s == null ? 0.5 : s, point: e.point, addr: e.addr });
      }
      if (!opts.length) return;
      opts.sort((x, y) => y.s - x.s);
      const top = opts[0], rivals = opts.slice(1).filter(o => find(o.oi) !== find(top.oi) && rootOf(o.oi) !== rootOf(top.oi));
      if (rivals.length) flags.precon.push({ file: c.refs[0], linkedTo: nodes[top.oi].refs[0], alsoOverlaps: rivals.map(r => `${nodes[r.oi].refs[0]} (${Math.round(r.s * 100)}%)`) });
      const order = dateOrder(nodes[top.oi], c) === 'reversed' ? 'reversed' : 'ok';
      parent[ci] = top.oi;
      links.push({ type: 'parent', rule: 'pre-consultation → the formal file it overlaps most', child: c.id, parent: nodes[top.oi].id, overlap: top.point ? null : +top.s.toFixed(2), point: top.point, addr: top.addr, order, confidence: confidence({ share: top.point ? null : top.s, point: top.point, addr: top.addr, order: 'ok', ambiguous: rivals.length > 0 }) });
    });
    function rootOf(i) { const seen = new Set(); let k = i; while (parent[k] >= 0 && !seen.has(k)) { seen.add(k); k = parent[k]; } return find(k); }

    // 4d. Trees: siblings join, parents join; the root is the top of the containment.
    nodes.forEach((n, i) => { if (parent[i] >= 0) join(i, parent[i]); });
    const trees = new Map();
    nodes.forEach((n, i) => { const r = find(i); if (!trees.has(r)) trees.set(r, { id: n.id, nodes: [] }); trees.get(r).nodes.push(i); });
    // Permits: progress only — under the smallest file whose boundary holds the point, else the same address.
    const permitOf = new Map();
    if (permits.length) {
      const appGrid = new Map();
      nodes.forEach((n, i) => { if (!n.rings || n.cancelled || n.policy) return; for (const c of cellsOf(n)) { if (!appGrid.has(c)) appGrid.set(c, []); appGrid.get(c).push(i); } });
      for (const r of permits) {
        if (r.lat == null) continue;
        let best = -1;
        for (const i of appGrid.get(cellOf(r.lng, r.lat)) || []) { const n = nodes[i]; if (n.municipality === r.municipality && P.pointInRings(r.lng, r.lat, n.rings) && (best < 0 || n.area < nodes[best].area)) best = i; }
        let how = 'point in boundary';
        if (best < 0) { const a = P.normalizeAddress(r.address); const hit = a && byAddr.get(a); if (hit) { best = hit.find(i => nodes[i].municipality === r.municipality && !nodes[i].cancelled) ?? -1; how = 'same address'; } }
        if (best >= 0) { if (!permitOf.has(best)) permitOf.set(best, []); permitOf.get(best).push({ r, how }); }
      }
    }
    return { nodes, links, parent, trees: [...trees.values()], flags, permitOf, find };
  }

  // ---- 5. Counting (proposed; report only) -----------------------------------------------------------
  // Per branch: the lowest level whose children cover ≥ 90% of the parent's land, else the parent's
  // own count with the rest shown as "not yet in a draft plan / site plan". Condos never add units;
  // permits are progress only. A pre-consultation's count stands only if the tree has no other.
  function countTree(tree, built) {
    const { nodes, parent } = built;
    const set = new Set(tree.nodes);
    // Same-land siblings count once: group by sibling links (members that aren't anyone's child within the group).
    const kids = new Map(); for (const i of set) { const p = parent[i]; if (p >= 0 && set.has(p)) { if (!kids.has(p)) kids.set(p, []); kids.get(p).push(i); } }
    const flags = [];
    // Siblings: nodes with no parent inside the tree form the top level; same-land groups share it.
    const tops = [...set].filter(i => !(parent[i] >= 0 && set.has(parent[i])));
    function own(i) { const n = nodes[i]; return n.cancelled || n.superseded || n.role === 'condo' || n.role === 'precon' ? 0 : n.units; }
    function count(i, depth = 0) {
      if (depth > 12) return { units: own(i), basis: 'depth limit' };
      const n = nodes[i];
      const ch = (kids.get(i) || []).filter(k => nodes[k].role !== 'condo' && nodes[k].role !== 'precon' && !nodes[k].cancelled);
      if (!ch.length) return { units: own(i), basis: 'own count' };
      const sub = ch.map(k => ({ k, ...count(k, depth + 1) }));
      const sum = sub.reduce((t, s) => t + s.units, 0);
      // Coverage counts only the children that state a count: land under a file with no count
      // can't stand in for the parent's number.
      const counted = process.env.OLDCOV ? ch : sub.filter(s => s.units > 0).map(s => s.k);
      let cover = null;
      if (n.rings && n.area > 0 && counted.length && counted.every(k => nodes[k].rings)) cover = Math.min(1, counted.reduce((t, k) => t + nodes[k].area * shareInside(nodes[k], n), 0) / n.area);
      const mine = own(i);
      if (mine > 0 && sum > mine * (1 + T.OVER)) flags.push({ kind: 'children exceed parent', parent: n.refs[0], parentUnits: mine, childUnits: sum });
      const blank = sub.filter(s => !(s.units > 0)).length;
      if (cover != null && cover >= T.COVER && sum > 0) {
        if (blank && mine > 0 && sum < mine * (1 - T.OVER)) flags.push({ kind: 'children cover the land but some state no count', parent: n.refs[0], parentUnits: mine, childUnits: sum, childrenWithoutCount: blank });
        return { units: sum, basis: `children cover ${Math.round(cover * 100)}% of the land${blank ? ` (${blank} of ${sub.length} state no count)` : ''}`, children: sub };
      }
      if (mine > 0) return { units: mine, basis: cover == null ? 'parent count (children have no boundary to measure)' : `parent count (children cover ${Math.round(cover * 100)}%)`, remainder: Math.max(0, mine - sum), children: sub };
      return { units: sum, basis: 'children (the parent states no count)', children: sub };
    }
    // Top-level same-land siblings: one proposal, counted once (the largest stated count).
    // Tops in one tree are joined by same-land sibling links: one proposal, the largest count.
    const topCounts = tops.map(i => ({ i, ...count(i) }));
    let units = topCounts.length ? Math.max(...topCounts.map(t => t.units)) : 0;
    // Tops joined only through a chain of same-land links (A~B, B~C but not A~C): flagged for review.
    const counted = topCounts.filter(x => x.units > 0);
    if (counted.length > 1) {
      if (!built.direct) { const idx = new Map(nodes.map((n, i) => [n.id, i])); built.direct = new Set(built.links.filter(l => l.type === 'sibling').flatMap(l => [`${idx.get(l.a)},${idx.get(l.b)}`, `${idx.get(l.b)},${idx.get(l.a)}`])); }
      const direct = built.direct;
      if (counted.some((x, a) => counted.some((y, b) => b > a && !direct.has(`${x.i},${y.i}`)))) flags.push({ kind: 'same-land chain: counted files not all linked directly', files: counted.map(x => nodes[x.i].refs[0]), units: counted.map(x => x.units), countedOnce: units, ifSummed: counted.reduce((t, x) => t + x.units, 0) });
    }
    let basis = topCounts.length > 1 ? `same land, counted once (largest of ${topCounts.length})` : (topCounts[0] || {}).basis || 'none';
    // A tree whose only count is on a condominium file (no site plan or draft plan in the data
    // states one): the condo's count stands, so the units aren't lost.
    const live = [...set].filter(i => !nodes[i].cancelled);
    if (!(units > 0)) { const c = Math.max(0, ...live.filter(i => nodes[i].role === 'condo').map(i => nodes[i].units || 0)); if (c > 0) { units = c; basis = 'condominium count (no site plan or draft plan in the data states one)'; } }
    if (!(units > 0)) { const pre = Math.max(0, ...[...set].map(i => nodes[i].precUnits || 0), ...[...set].filter(i => nodes[i].role === 'precon').map(i => nodes[i].units || 0)); if (pre > 0) { units = pre; basis = 'pre-consultation count (no other file states one)'; } }
    // No file states a count: a minor file's wording ("convert into 3 dwelling units"), a count
    // found online (data/unit-lookups.json), else the wording's kind of growth.
    let growth = null;
    if (!(units > 0)) {
      const minorText = Math.max(0, ...live.filter(i => nodes[i].minor).map(i => Math.max(0, ...nodes[i].records.map(r => P.unitsFromText(r.description) || 0))));
      const found = built.lookups && built.lookups.size ? live.map(i => nodes[i].refs.map(r => built.lookups.get(`${nodes[i].municipality}|${r}`)).find(Boolean)).filter(Boolean).sort((a, b) => b.units - a.units)[0] : null;
      if (minorText > 0) { units = minorText; basis = 'a minor file states the count'; }
      else if (found && found.units > 0) { units = found.units; basis = `found online: ${found.source}`; growth = { kind: 'found online', units: found.units, url: found.url }; }
      else if (found && found.units === 0) { basis = `no new homes (checked: ${found.source})`; growth = { kind: 'non-residential', units: null, why: found.note || 'checked online: no new homes', url: found.url }; }
      else {
        growth = growthKind(live.map(i => nodes[i].records.map(r => r.description || '').join(' ')));
        if (growth.units > 0) { units = growth.units; basis = growth.why; }
        else basis = growth.why || growth.kind;
      }
    }
    // Trees with only condominium files are still listed for review.
    const condoOnly = live.length > 0 && live.every(i => nodes[i].role === 'condo' || nodes[i].role === 'precon') && live.some(i => nodes[i].role === 'condo');
    const condoUnits = condoOnly ? Math.max(0, ...live.map(i => nodes[i].units || 0)) : 0;
    return { units, basis, growth, tops: topCounts, flags, condoOnly: condoOnly ? { units: condoUnits, files: live.map(i => nodes[i].refs[0]) } : null };
  }

  // Developments where no file states a count. Growth only: what new homes does the wording say?
  //   non-residential   — no homes (jobs instead); never counted
  //   one new house     — "a detached dwelling" counts 1
  //   no new homes      — a replacement house, an addition, a garage or pool: 0 by design
  //   count to find     — homes are proposed but no number is given (looked up online)
  //   mixed use, check  — "mixed use" without saying whether homes are in it
  //   no description    — the file says only its application type
  const NONRES = /\b(industrial|warehous\w*|offices?|hotels?|motel|commercial|retail|restaurants?|gas (station|bar)|car ?wash|schools?|classrooms?|portables?|church|religious|worship|temple|mosque|gurdwara|day ?care|child ?care|plaza|manufactur\w*|distribution|logistics?|truck\w*|self[- ]storage|storage|factory|dealership|automobile|motor vehicle|substation|battery|telecom\w*|antenna|transformer|canopy|patio|drive[- ]?thr\w*|signs?|signage|arena|library|community cent\w*|fire station|emergency services|stadium|studios?|convention|banquet|cemetery|funeral|mall|supermarket|grocery|hospital|clinic|medical|hospice|data cent\w*|depot|mill|costco|lube|bank|employment|business park|place of religious)\b/i;
  const HOMES = /\b(residential|residences?|dwellings?|detached|detatched|semi|town ?houses?|townhomes?|apartments?|stacked|back[- ]to[- ]back|condominium (development|towers?|apartments?|buildings?)|horizontal multiple|homes?|houses?|duplex|triplex|fourplex|rental|seniors?|retirement|student residence|condo towers?)\b/i;
  const NOT_NEW = /\b(replac\w*|rebuild|addition|additions|renovat\w*|alteration|extension|garage|pool|deck|porch|shed|cabana|accessory|demolish\w* and rebuild|existing (dwelling|house|home|building))\b/i;
  const ONE_HOUSE = /\b(single[- ]family|single[- ]detached|detached|detatched|custom|estate)\b[^.;|]{0,30}\b(dwelling|house|home|residence)\b|\b(new|proposed)\s+(\d[- ]storey\s+|two[- ]storey\s+)?(single\s+)?(dwelling|house|home)\b|\bproposed two storey deta?t?ched\b/i;
  const MULTI = /\b(towns?|town ?houses?|townhomes?|semis?|semi[- ]detached|apartments?|towers?|storey (residential|condominium|apartment)|stacked|lots|subdivision|units|condominium|blocks?|multiple)\b/i;
  function growthKind(texts) {
    const d = texts.join(' ').replace(/Application for Site Plan Control|Pre-?consultation application|PDOX TRANSFER FILE \S+ \S+ \S+|Site Plan (Basic|Full|Limited)|Basic Site Plan|Limited Site Plan|Full Site Plan/gi, ' ').replace(/\s+/g, ' ').trim();
    if (!d || d.length < 4) return { kind: 'no description', units: null };
    // Words that name no new homes: "non-residential", an existing house put to another use, "RV rental".
    const h = d.replace(/\bnon[- ]?residential\b|\b(existing|main unit|one[- ]stor(e)?y) (\w+ )?(dwelling|house|home)\b|\b(sales|vehicle|equipment|car|truck)[, ]+(and )?rental\b|\brental (and|&) (sales|maintenance)\b/gi, ' ');
    if (!HOMES.test(h) && /\b(non[- ]?residential)\b/i.test(d)) return { kind: 'non-residential', units: null, why: 'no homes in the proposal' };
    const homes = HOMES.test(h), non = NONRES.test(d), mixed = /\bmixed[- ]?use\b/i.test(d);
    if (homes && /\breplac\w*\b/i.test(d) && !MULTI.test(d)) return { kind: 'no new homes', units: 0, why: 'a replacement house (growth only)' };
    if (homes && NOT_NEW.test(d) && !MULTI.test(d) && !ONE_HOUSE.test(d.replace(/existing (dwelling|house|home)/gi, ''))) return { kind: 'no new homes', units: 0, why: 'work on an existing house' };
    if (/\bmodel (home|house)s?\b/i.test(d) && !MULTI.test(d.replace(/\b21T\S*/g, ''))) return { kind: 'no new homes', units: 0, why: 'a model home (its lot is counted in the subdivision)' };
    if (ONE_HOUSE.test(d) && !MULTI.test(d)) return { kind: 'one new house', units: 1, why: 'one detached house' };
    if (/\bsemi[- ]detached (dwelling|house|home)\b/i.test(d) && !/\b(towns?|apartments?|lots|subdivision|units)\b/i.test(d)) return { kind: 'one new house', units: 2, why: 'one semi-detached pair' };
    if (mixed && !homes) return { kind: 'mixed use, check', units: null, why: 'mixed use without saying whether it has homes' };
    if (homes && !(non && !/\b(residential|dwellings?|apartments?|town ?houses?|townhomes?|homes)\b/i.test(d))) return { kind: 'count to find', units: null, why: 'homes proposed, no number given' };
    if (non) return { kind: 'non-residential', units: null, why: 'no homes in the proposal' };
    if (NOT_NEW.test(d)) return { kind: 'non-residential', units: null, why: 'work on an existing building, no homes named' };
    return { kind: 'no homes named', units: null, why: 'the wording names no homes' };
  }

  // Official plan amendments: policy, never counted. For each tree, the amendments that apply —
  // site-specific (a file in the tree asks for one) or area-wide (a larger amendment file whose
  // boundary holds the tree's land) — and the latest of them by filing date.
  function isOpa(n) {
    if (n.role === 'precon') return false;
    return n.records.some(r => {
      const src = String(r.sourceId || '');
      if (src.startsWith('bra-opa-zba-sub')) return /official plan amendment/i.test(String(r.description || '').split(' — ')[0]);
      if (r.municipality === 'Mississauga') return /\bOPA\b/i.test(r.ref || '');
      if (r.municipality === 'Caledon') return /official plan amendment/i.test(r.type || '');
      return false;
    });
  }
  function planAmendments(built) {
    const { nodes, trees } = built;
    const opas = nodes.map((n, i) => i).filter(i => !nodes[i].cancelled && isOpa(nodes[i]));
    const info = (i, scope) => { const n = nodes[i], r = n.records[0]; return { ref: n.refs[0], scope, filed: n.date0 != null ? new Date(n.date0).toISOString().slice(0, 10) : null, status: (n.records.find(x => APPROVED.has(x.phase)) || r).phase, description: String(r.description || '').slice(0, 160) }; };
    return trees.map(t => {
      const inTree = new Set(t.nodes), list = [];
      for (const i of t.nodes) if (opas.includes(i)) list.push(info(i, 'site-specific'));
      // Area-wide: a larger amendment whose boundary holds any live file of the tree (or its point).
      const lands = t.nodes.map(i => nodes[i]).filter(n => !n.cancelled);
      for (const i of opas) {
        if (inTree.has(i)) continue;
        const o = nodes[i]; if (!o.rings) continue;
        const holds = lands.some(land => land.municipality === o.municipality && !(land.bbox && (land.bbox[0] > o.bbox[2] || land.bbox[2] < o.bbox[0] || land.bbox[1] > o.bbox[3] || land.bbox[3] < o.bbox[1])) &&
          (land.rings ? o.area > land.area * 2 && shareInside(land, o) >= T.CONTAIN : land.lng != null && P.pointInRings(land.lng, land.lat, o.rings)));
        if (holds) list.push(info(i, 'area-wide'));
      }
      list.sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
      return list.length ? { latest: list[0], all: list } : null;
    });
  }

  const api = { ROLES, T, classifyRole, fileNodes, buildTrees, countTree, growthKind, planAmendments, isOpa, sameLandVerdict, shareInside, bboxOf, dateOrder, confidence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
