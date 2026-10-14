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
  const T = { CONTAIN: 0.8, SAME: 0.8, PRECON: 0.5, NEVER: 0.15, COVER: 0.9, OVER: 0.1 };
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

    // Evidence for every pair.
    const ev = [];
    for (const key of pairs) {
      const [i, j] = key.split(',').map(Number), a = nodes[i], b = nodes[j];
      if (a.cancelled || b.cancelled) continue;
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
        if (rev) rule = 'same land: site plan revision'; else flags.sameLandSitePlans.push({ a: a.refs[0], b: b.refs[0], units: [a.units, b.units], overlap: +mutual.toFixed(2) });
      }
      if (!rule) continue;
      const order = 'n/a', conf = rule.startsWith('same proposal re-filed') ? 'medium' : confidence({ share: e.point ? null : mutual, point: e.point, addr: e.addr, order });
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
      nodes.forEach((n, i) => { if (!n.rings || n.cancelled) return; for (const c of cellsOf(n)) { if (!appGrid.has(c)) appGrid.set(c, []); appGrid.get(c).push(i); } });
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
    function own(i) { const n = nodes[i]; return n.cancelled || n.role === 'condo' || n.role === 'precon' ? 0 : n.units; }
    function count(i, depth = 0) {
      if (depth > 12) return { units: own(i), basis: 'depth limit' };
      const n = nodes[i];
      const ch = (kids.get(i) || []).filter(k => nodes[k].role !== 'condo' && nodes[k].role !== 'precon' && !nodes[k].cancelled);
      if (!ch.length) return { units: own(i), basis: 'own count' };
      const sub = ch.map(k => ({ k, ...count(k, depth + 1) }));
      const sum = sub.reduce((t, s) => t + s.units, 0);
      let cover = null;
      if (n.rings && n.area > 0 && ch.every(k => nodes[k].rings)) cover = Math.min(1, ch.reduce((t, k) => t + nodes[k].area * shareInside(nodes[k], n), 0) / n.area);
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
    let basis = topCounts.length > 1 ? `same land, counted once (largest of ${topCounts.length})` : (topCounts[0] || {}).basis || 'none';
    if (!(units > 0)) { const pre = Math.max(0, ...[...set].map(i => nodes[i].precUnits || 0), ...[...set].filter(i => nodes[i].role === 'precon').map(i => nodes[i].units || 0)); if (pre > 0) { units = pre; basis = 'pre-consultation count (no other file states one)'; } }
    // A tree with only condominium files (no site plan in the data): condos never add units, so it
    // counts 0 — listed for review (the brief's rule; the current app counts the condo).
    const live = [...set].filter(i => !nodes[i].cancelled);
    const condoOnly = live.length > 0 && live.every(i => nodes[i].role === 'condo' || nodes[i].role === 'precon') && live.some(i => nodes[i].role === 'condo');
    const condoUnits = condoOnly ? Math.max(0, ...live.map(i => nodes[i].units || 0)) : 0;
    return { units, basis, tops: topCounts, flags, condoOnly: condoOnly ? { units: condoUnits, files: live.map(i => nodes[i].refs[0]) } : null };
  }

  const api = { ROLES, T, classifyRole, fileNodes, buildTrees, countTree, shareInside, bboxOf, dateOrder, confidence };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
