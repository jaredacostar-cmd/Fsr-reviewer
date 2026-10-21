/* js/sites.js — site → proposal → file (Step 1: report only; the app is unchanged).
 *
 * Today a development is one tree of files (js/tree.js), and files mostly join a tree because their
 * land overlaps. Overlap says two files are on the same land, not that they are the same project:
 * 1-30 Gillingham Dr held a 1,753-home redevelopment, a patio, a temporary trailer and a unit
 * fit-out. The model this tests:
 *
 *   site      the land: every file on it, its history included. No stage of its own.
 *   proposal  one development intent (adds homes or floor space, or changes what the land
 *             allows), with its own count and stage, set only by its own files.
 *   file      one municipal record, as published.
 *
 *   fileScope(node)          → { scope: 'major' | 'minor' | 'admin', why }
 *   LINK_EVIDENCE[rule]      → 'reference' | 'content' | 'process'   (the tree's link rules)
 *   proposalsOf(tree, built) → { proposals: [{ nodes, root }], site: [{ i, why }] }
 *
 * A site is a tree as js/tree.js builds it. Within it, the files that add homes or a building join
 * one proposal by the tree's links (each link's evidence: the file names the other, the same count
 * or successive pre-consultations, or the next step of the planning process), except a
 * redevelopment of a plan built long ago, which is a second proposal on the site. A minor file (a patio, a fit-out, a gate) stays with a
 * proposal only when it names one of its files or reads as a revision of it; otherwise it is site
 * activity. Cancelled and superseded files are the site's history.
 *
 * Pure functions (no DOM): used by scripts/audit-sites.js and tests/sites.test.js.
 */
(function (root) {
  'use strict';
  // ---- 1. A file's scope ----------------------------------------------------------------------
  // What adds homes or a building, or changes what the land allows.
  const MAJOR_TEXT = /official plan|zoning|secondary plan|subdivision|residential|dwelling|redevelop|\bstorey|\btowers?\b|apartment|town ?houses?|condominium|mixed[- ]use|new (?:\w+ )?building|construct\w* (?:of )?(?:a |an |two |three |four |\d+ )?(?:new )?(?:\w+ )?(?:building|warehouse|plaza|facility|tower)|warehouse|industrial building|master plan/i;
  // Alterations to what stands: they add neither homes nor a building.
  const MINOR_TEXT = /patio|fit-?out|signage|\bsigns?\b|\batm\b|canopy|awning|\bgates?\b|play (?:area|structure|ground)|pavilion|\bdoors?\b|\bramps?\b|temporary|trailer|car wash|drive[- ]?th(?:ru|rough)|parking (?:lot|spaces?|sports)|outdoor storage|cladding|fa[cç]ade|storefront|grading|landscap|fence|screening|garage|shed|addition of \d|interior|renovat|generator|transformer|loading|soccer field|change of use/i;
  const REVISION_TEXT = /revis|amend\w* (?:to )?(?:the )?(?:previous|approved|existing)|further to|previously approved|update[sd]? to/i;

  const textOf = n => n.records.map(r => `${r.type || ''} ${r.description || ''}`).join(' · ');
  function fileScope(n) {
    if (n.cancelled) return { scope: 'admin', why: 'cancelled or withdrawn' };
    if (n.superseded) return { scope: 'admin', why: `superseded (${n.superseded})` };
    // (A minor file's own count isn't in n.units: 121 Agnes St's SPM 20/130 states 12 homes.)
    const t = textOf(n), homes = Math.max(n.units || 0, n.precUnits || 0, ...n.records.map(r => (r.units > 0 && !r.conversion ? r.units : 0)));
    if (homes > 0) return { scope: 'major', why: `states ${homes} homes` };
    const big = MAJOR_TEXT.exec(t), small = MINOR_TEXT.exec(t);
    // Filed as limited but describing a building (SPA-2024-0152, a 13-storey student residence
    // "placekeeping" file) is a proposal.
    if (n.minor) return big ? { scope: 'major', why: `filed as minor, but "${big[0]}"` } : { scope: 'minor', why: 'minor / limited / express site plan' };
    if (['use', 'land_division', 'block_plan', 'condo'].includes(n.role)) return small && !big ? { scope: 'minor', why: `${n.role === 'use' ? 'rezoning' : n.role} for "${small[0]}"` } : { scope: 'major', why: n.role === 'use' ? 'rezoning / official plan amendment' : n.role.replace('_', ' ') };
    if (big) return { scope: 'major', why: `"${big[0]}"` };
    if (small) return { scope: 'minor', why: `"${small[0]}"` };
    // A site plan or pre-consultation that says nothing either way ("Application for Site Plan
    // Control"): a building, as the older plans were.
    return { scope: 'major', why: 'no wording either way: taken as a building' };
  }

  // ---- 2. What each of the tree's link rules is evidence of -----------------------------------
  const LINK_EVIDENCE = {
    'names the file it revises': 'reference',
    'names its pre-consultation': 'reference',
    'names the earlier application it replaces': 'reference',
    'same proposal re-filed: one inside the other, same count (±10%)': 'content',
    'same land: successive pre-consultations': 'content',
    'same land: site plan revision': 'content',
    'minor site plan revising the full one on its land': 'content',
    'same land: use + draft plan': 'process',
    'same land: rezoning + site plan (point in boundary)': 'process',
    'same land: rezoning + site plan (no draft plan)': 'process',
    'same land: two files of the same kind': 'process',
    'same land: redevelopment (the earlier site plan was built long ago)': 'site',
    'draft plan ⊃ site plan / condo': 'process',
    'site plan ⊃ condo': 'process',
    'block plan ⊃ draft plan': 'process',
    'rezoning ⊃ site plan (no draft plan)': 'process',
    'block / precinct plan ⊃ rezoning / site plan': 'process',
    'pre-consultation → the formal file it overlaps most': 'process',
  };
  const evidenceOf = l => LINK_EVIDENCE[l.rule] || 'process';

  // ---- 3. A tree's proposals and its site activity --------------------------------------------
  function proposalsOf(tree, built) {
    const { nodes } = built, set = new Set(tree.nodes), idx = built.idIx || (built.idIx = new Map(nodes.map((n, i) => [n.id, i])));
    const scope = new Map(tree.nodes.map(i => [i, fileScope(nodes[i])]));
    const site = [], inProposal = new Set();
    // Which files can be part of a proposal: major ones, and minor ones that revise one.
    const linksIn = (built.linksByNode || (built.linksByNode = (() => { const m = new Map(); for (const l of built.links) for (const id of l.type === 'parent' ? [l.child, l.parent] : [l.a, l.b]) { const i = idx.get(id); if (!m.has(i)) m.set(i, []); m.get(i).push(l); } return m; })()));
    const ends = l => (l.type === 'parent' ? [l.child, l.parent] : [l.a, l.b]).map(id => idx.get(id));
    for (const i of tree.nodes) {
      const s = scope.get(i);
      if (s.scope === 'admin') { site.push({ i, why: s.why }); continue; }
      if (s.scope === 'major') { inProposal.add(i); continue; }
      const revises = (linksIn.get(i) || []).some(l => set.has(ends(l).find(j => j !== i)) && (evidenceOf(l) === 'reference' || (l.confidence !== 'low' && REVISION_TEXT.test(textOf(nodes[i])))));
      if (revises) inProposal.add(i); else site.push({ i, why: `${s.why}: alters what stands, adds no homes` });
    }
    // Proposals: files joined by the tree's links between them. A redevelopment of a long-built
    // plan puts the two on one site, never in one proposal. (Overlap-only links stay: they are
    // marked "check" for review, and are usually right: a condominium repeating its site plan's
    // count, a pre-consultation of 204 homes before a 200-home plan.)
    // A cancelled or superseded file is history, but still ties the files filed before and after it
    // (10194 Heart Lake Rd: the pre-consultations under SPA-2022-0101, which SPA-2024-0144 replaces);
    // a minor one ties nothing (a patio doesn't join two proposals).
    const ties = new Set([...inProposal, ...tree.nodes.filter(i => scope.get(i).scope === 'admin')]);
    const uf = new Map([...ties].map(i => [i, i])), find = x => (uf.get(x) === x ? x : (uf.set(x, find(uf.get(x))), uf.get(x)));
    for (const i of ties) for (const l of linksIn.get(i) || []) {
      const [a, b] = ends(l); if (!ties.has(a) || !ties.has(b)) continue;
      if (evidenceOf(l) === 'site') continue;
      uf.set(find(a), find(b));
    }
    const groups = new Map();
    for (const i of tree.nodes) if (inProposal.has(i)) { const r = find(i); if (!groups.has(r)) groups.set(r, []); groups.get(r).push(i); }
    // Each proposal's main file: the tree's root when it holds it, else its first top-level file.
    const proposals = [...groups.values()].map(list => {
      const own = new Set(list), tops = list.filter(i => !(built.parent[i] >= 0 && own.has(built.parent[i])));
      const rootI = own.has(tree.nodes[0]) ? tree.nodes[0] : tops[0];
      return { nodes: [rootI, ...list.filter(i => i !== rootI)], root: rootI };
    });
    return { proposals, site, scope };
  }

  const api = { fileScope, LINK_EVIDENCE, evidenceOf, proposalsOf, MAJOR_TEXT, MINOR_TEXT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelSites = api;
})(typeof self !== 'undefined' ? self : this);
