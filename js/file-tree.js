/* A development's files as a tree (PeelFileTree): how its planning files fit together, from the tree
 * build (data/tree-counts.json, js/tree.js countTree). Each file sits under the file whose land holds
 * it; the homes are counted once, on the root file; a link made by overlap only (low confidence) is
 * flagged "check"; earlier files on the same land are folded. Used by Records › Files, the rows of
 * Growth in an area and the estimated-count rows (design bundle 6).
 *
 * Pure: of(), summary(), estimateOf(), summaryHTML() and treeHTML() take the tree entry and a lookup
 * from a file's key to its record, so they run in Node (tests/organization.test.js).
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Math.round(v || 0).toLocaleString('en-CA');
  // The tree build's roles (data/tree-counts.json codes.roles), in words.
  const ROLE = ['draft plan of subdivision', 'official plan / zoning', 'site plan', 'plan of condominium', 'block plan', 'pre-consultation'];
  const PRECON = 5;
  // A tree entry's node: [ref, role, parent index (-1 = on the land itself), rule, confidence
  // ('h' | 'm' | 'l'), score, units, -, file key].
  const node = (x, i) => ({ i, ref: x[0], role: x[1], parent: x[2], rule: x[3], conf: x[4], units: x[6] || 0, key: x[8] || null, kids: [] });
  // A link to check: made by overlap only (low confidence), not a pre-consultation (those are
  // matched to the formal file they overlap most, by design).
  const isCheck = n => n.i > 0 && n.conf === 'l' && n.role !== PRECON;

  let byK = null, of_ = null;
  /** The tree entry of a development (by its key), from the loaded tree counts. */
  function of(p, data) {
    const d = data || (root.PeelTreeCounts && root.PeelTreeCounts.data);
    if (!d || !d.devs || !p) return null;
    if (of_ !== d) { byK = new Map(d.devs.map(e => [e.k, e])); of_ = d; }
    return byK.get(p.key) || null;
  }
  /** The nodes as a tree: the root file, the files on its land under it (to any depth), and the
   *  earlier files on the same land (the other top-level nodes, with what sits under them). */
  function build(d) {
    const ns = (d.n || []).map(node), rootN = ns[0] || null, cu = new Map((d.c || []).map(x => [x[0], x[1] || 0]));
    for (const n of ns) if (n.parent >= 0 && ns[n.parent]) ns[n.parent].kids.push(n);
    // The files that carry homes first (most first), then the rest in the build's order.
    const w = n => cu.get(n.ref) || 0;
    for (const n of ns) n.kids.sort((a, b) => w(b) - w(a) || a.i - b.i);
    const same = ns.filter(n => n.i > 0 && n.parent === -1);
    const count = n => 1 + n.kids.reduce((t, k) => t + count(k), 0);
    return { root: rootN, same, all: ns, sameCount: same.reduce((t, n) => t + count(n), 0) };
  }
  // The files that carry the homes (count parts): { ref → { units, kind } }. Most trees count on
  // one file; a block plan that states no count adds up its draft plans.
  const countsOf = d => new Map((d.c || []).filter(x => x[1] > 0).map(x => [x[0], { units: x[1], kind: x[2] }]));
  function summary(d) {
    const t = build(d), counted = [...countsOf(d)].map(([ref, v]) => ({ ref, ...v })).sort((a, b) => b.units - a.units);
    return { files: t.all.length, root: d.root, top: t.root ? t.root.ref : d.root, units: d.u || 0, counted, check: t.all.filter(isCheck).length, onLand: t.root ? t.root.kids.length : 0, sameLand: t.sameCount };
  }
  const nodeOf = (d, ref) => build(d).all.find(n => n.ref === ref) || null;
  /** The file an estimated count is on (the first count part not stated on the file). */
  function estimateOf(d) {
    const c = (d && d.c || []).find(x => x[2] && x[2] !== 'stated');
    return c ? { ref: c[0], units: c[1] || 0, kind: c[2], source: c[3] || null } : null;
  }
  // A file's type in words: the record's own type when it has one, else the tree's role.
  const BLOCK = 4;
  const typeOf = (n, rec) => {
    const PN = root.PeelPanel, t = rec && rec.type, own = t && PN && PN.typeWords ? PN.typeWords(t) : t ? String(t) : '';
    // (a block or precinct plan is often filed as a pre-consultation: the tree reads it as the block plan)
    if (n.role === BLOCK) return own && own !== ROLE[BLOCK] ? `block plan, filed as ${own}` : ROLE[BLOCK];
    return own || ROLE[n.role] || 'file';
  };
  /** One line for a development's row: "10 files · homes counted on OZS-2025-0034 (official plan,
   *  zoning and subdivision) · check 1 link". */
  function summaryHTML(d, recOf) {
    const s = summary(d), main = nodeOf(d, s.root), rec = main && recOf ? recOf(main) : null;
    const type = main ? ` (${esc(typeOf(main, rec))})` : '';
    const where = s.counted.length > 1 ? `homes counted on ${s.counted.length} files, most on <b>${esc(s.root)}</b>${type}` : `homes counted on <b>${esc(s.root)}</b>${type}`;
    return s.files > 1
      ? `<b>${num(s.files)}</b> files · ${where}${s.check ? ` · <span class="tr-check" title="Linked by overlap only: low confidence">check</span> ${s.check} link${s.check === 1 ? '' : 's'}` : ''}`
      : `<b>1</b> file: ${esc(s.root)}${type}`;
  }
  /** The tree. recOf(node) → the file's record (type, municipal status, stage, latest date) or null;
   *  opts.limit: the files shown under the root before "+ n more" (all when omitted); opts.dot: the
   *  stage dot for a stage key; opts.devKey: the development, where it is not the one open;
   *  opts.after(node): HTML placed under a file (its site servicing permits, js/dc-gate.js);
   *  opts.foot: HTML after the tree's history (permits left out). */
  function treeHTML(d, recOf, opts = {}) {
    const t = build(d); if (!t.root) return '';
    const dot = opts.dot || (() => ''), latest = opts.latest || null, counts = countsOf(d);
    const yr = r => (r && r.date ? String(r.date).slice(0, 4) : '');
    const row = (n, why) => {
      const r = recOf ? recOf(n) : null, c = counts.get(n.ref);
      // The homes on the file that carries them; the top of a block plan that adds up its parts says so.
      const right = c ? `<b>${num(c.units)}</b>homes · counted here${c.kind !== 'stated' ? ' (estimate)' : ''}` : n.i === 0 && counts.size > 1 ? `<b>${num(d.u)}</b>homes in all, on the files below` : esc(r && r.dateText ? r.dateText : yr(r));
      // (the file number opens its source record in the development's History: js/devtab.js openFile)
      return `<div class="tr-row">${dot(r && r.stage || 'review')}<div><button type="button" class="tr-ref" data-dev-file="${esc(n.ref)}"${opts.devKey ? ` data-dev-key="${esc(opts.devKey)}"` : ''} title="Its source record, in History">${esc(n.ref)}</button><span class="tr-type">${esc(typeOf(n, r))}</span>${latest && latest === n.ref ? ` <button type="button" class="tr-new" data-dev-file="${esc(n.ref)}"${opts.devKey ? ` data-dev-key="${esc(opts.devKey)}"` : ''} title="The latest file: its source record">latest</button>` : ''}${isCheck(n) ? ` <button type="button" class="tr-check" data-dev-file="${esc(n.ref)}"${opts.devKey ? ` data-dev-key="${esc(opts.devKey)}"` : ''} title="Linked by overlap only (low confidence): check its record. A wrong link can be reported from the record">check</button>` : ''}${r && r.statusRaw ? `<span class="tr-ms">municipal status: <em>${esc(r.statusRaw)}</em></span>` : ''}${why ? `<span class="tr-why">${esc(why)}</span>` : ''}</div><div class="tr-r">${right}</div></div>`;
    };
    const why = n => (n.role === PRECON ? 'its pre-consultation' : 'on its land');
    const aft = n => (opts.after ? opts.after(n) : '');
    const kidsHTML = (n, depth) => (n.kids.length ? `<div class="tr-kids">${n.kids.map(k => row(k, why(k)) + aft(k) + (depth < 4 ? kidsHTML(k, depth + 1) : '')).join('')}</div>` : '');
    const kids = t.root.kids, lim = opts.limit != null ? opts.limit : kids.length;
    const shown = kids.slice(0, lim), more = kids.length - shown.length;
    const under = shown.length ? `<div class="tr-kids">${shown.map(k => row(k, why(k)) + aft(k) + kidsHTML(k, 1)).join('')}${more > 0 ? `<p class="tr-more small">+ ${more} more on its land</p>` : ''}</div>` : '';
    const sameYears = t.same.map(n => recOf ? yr(recOf(n)) : '').filter(Boolean).sort();
    const same = t.same.length ? `<details class="tr-same"><summary>+ ${t.sameCount} earlier file${t.sameCount === 1 ? '' : 's'} on the same land${sameYears.length ? ` (${sameYears[0]}${sameYears.length > 1 && sameYears[sameYears.length - 1] !== sameYears[0] ? `–${sameYears[sameYears.length - 1]}` : ''})` : ''}: the site's history, not counted</summary><div class="tr-kids">${t.same.map(n => row(n, '') + kidsHTML(n, 1)).join('')}</div></details>` : '';
    return `<div class="tr">${row(t.root, '')}${aft(t.root)}${under}${same}${opts.foot || ''}${opts.key === false ? '' : '<p class="tr-key">Indented: on its land · <span class="tr-check">check</span> linked by overlap only (low confidence) · the homes are counted once, on the file that says “counted here”.</p>'}</div>`;
  }
  /** The tree in reading order, for a row per file (the development's Gantt chart): the root, the
   *  files on its land under it (depth first), then the earlier files on the same land (same: true).
   *  Each: { n (the build node), ref, key, role, depth, why, check, counted: { units, kind } | null, same }. */
  function flat(d) {
    const t = build(d); if (!t.root) return [];
    const counts = countsOf(d), out = [];
    const why = n => (n.role === PRECON ? 'its pre-consultation' : 'on its land');
    const walk = (n, depth, same, w) => {
      out.push({ n, ref: n.ref, key: n.key, role: n.role, type: ROLE[n.role] || 'file', depth, why: w, check: isCheck(n), counted: counts.get(n.ref) || null, same });
      if (depth < 5) for (const k of n.kids) walk(k, depth + 1, same, why(k));
    };
    walk(t.root, 0, false, '');
    for (const n of t.same) walk(n, 0, true, '');
    return out;
  }
  // ---- Browser: a file's record, by the tree's file key --------------------------------------
  /** A lookup from a tree node to the development's own record of that file. */
  function recLookup(p) {
    const PH = root.PeelPhases, canon = PH && PH.canonRef ? PH.canonRef : (x => x);
    const id = r => (PH && PH.fileId ? PH.fileId(r) : r.fileKey || canon(r.ref));   // (the tree's file key: a Caledon number with its type)
    const by = new Map();
    for (const r of (p && p.records) || []) {
      if (r.kind !== 'application') continue;
      const k = id(r);
      if (k && !by.has(k)) by.set(k, r);
      if (r.ref && !by.has(`ref:${r.ref}`)) by.set(`ref:${r.ref}`, r);
    }
    const day = d => new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    return n => {
      const r = (n.key && by.get(n.key)) || by.get(`ref:${n.ref}`); if (!r) return null;
      const last = r.events && r.events.length ? r.events[r.events.length - 1].date : r.date;
      return { type: r.type, statusRaw: r.statusRaw, stage: PH && PH.sitePhaseOf ? PH.sitePhaseOf(r) : r.phase, date: last ? new Date(last).toISOString().slice(0, 10) : null, dateText: last ? day(last) : '' };
    };
  }

  // The site bar's "n links to check" chip opens Records › Files.
  if (typeof document !== 'undefined' && document.addEventListener) document.addEventListener('click', e => {
    if (!(e.target.closest && e.target.closest('[data-tree-check]'))) return;
    const AT = root.PeelAnalysisTabs; if (AT && AT.openTab) AT.openTab('records', 'files');
  });

  const api = { ROLE, PRECON, of, build, flat, summary, countsOf, nodeOf, estimateOf, summaryHTML, treeHTML, recLookup, isCheck };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelFileTree = api;
})(typeof window !== 'undefined' ? window : globalThis);
