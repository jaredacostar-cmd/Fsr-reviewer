(function (root) {
'use strict';
  // Step B1: tree counts inside today's developments (PeelTreeCounts).
  //
  // data/tree-counts.json is built with the weekly snapshot (scripts/build-tree-counts.js): for each
  // development key, the units of the trees whose root file it holds (js/tree.js countTree, the
  // chronology rules and data/tree-overrides.json applied), and a signature of its files. Building
  // the trees takes seconds, so the browser never builds them; it only applies the counts.
  //
  // Settings › Counting chooses Tree (new, the default) or Previous (one release, to compare). A
  // development keeps its previous count, with the reason, when it has no tree entry, when its files
  // differ from the tree build (a live refresh or a source turned off), or when you entered a count
  // for one of its files.
  const STORE_KEY = 'countMode';
  const MODES = { tree: 'Tree (new)', previous: 'Previous' };
  let data = null, loading = null;

  const store = () => (root.PeelUtil && root.PeelUtil.store) || null;
  function mode() { const s = store(); const v = s ? s.get(STORE_KEY, 'tree') : 'tree'; return v === 'previous' ? 'previous' : 'tree'; }
  function setMode(v) { const s = store(); if (s) s.set(STORE_KEY, v === 'previous' ? 'previous' : 'tree'); }

  // The development's planning files, as the tree build saw them: "Municipality|file key".
  function fileKeysOf(p, canonRef) {
    const set = new Set();
    for (const r of p.records || []) if (r.kind === 'application') set.add(`${r.municipality}|${r.fileKey || canonRef(r.ref) || r.uid}`);
    return [...set].sort();
  }
  // A short, stable signature of those files (djb2, base 36).
  function signature(keys) {
    let h = 5381;
    const s = keys.join('\n');
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
    return `${keys.length}.${h.toString(36)}`;
  }
  const sigOf = (p, canonRef) => signature(fileKeysOf(p, canonRef));

  function load() {
    if (!loading) loading = fetch('data/tree-counts.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => { setData(d); return data; });
    return loading;
  }
  const usable = d => !!(d && (d.devs || d.projects));
  function setData(d) { data = usable(d) ? d : null; loading = Promise.resolve(data); if (root.PeelTreeGroups) root.PeelTreeGroups.setData(data); }
  // Each development's entry: version 2 lists the trees as developments (devs), version 1 the
  // counts inside today's developments (projects).
  const entries = new WeakMap();
  function entryOf(d, key) {
    if (d.devs) { let m = entries.get(d); if (!m) entries.set(d, m = new Map(d.devs.map(x => [x.k, x]))); return m.get(key) || null; }
    return (d.projects && d.projects[key]) || null;
  }

  // Sets p.units to the tree count (or keeps the previous one) and records why in p.count:
  //   { mode: 'tree' | 'previous', previous, trees: [[root, units, basis, flag]], why }
  function apply(projects, opts = {}) {
    const m = opts.mode || mode(), d = opts.data !== undefined ? opts.data : data;
    if (d && !usable(d)) return { mode: m, tree: 0, kept: 0 };
    const canonRef = opts.canonRef || (root.PeelPhases && root.PeelPhases.canonRef) || (x => x);
    let tree = 0, kept = 0;
    for (const p of projects) {
      if (p.unitsPrevious === undefined) p.unitsPrevious = p.units == null ? null : p.units;
      p.units = p.unitsPrevious;
      p.count = { mode: 'previous', previous: p.unitsPrevious };
      if (m !== 'tree') continue;
      if (!d) { p.count.why = 'tree counts not loaded'; continue; }
      const e = entryOf(d, p.key);
      if (!e) { p.count.why = 'no tree for this development (no planning file the tree counts)'; kept++; continue; }
      const full = p.records && p.records.length;
      if (full && (p.records || []).some(r => r.unitsUser)) { p.count.why = 'you entered a count for one of its files'; kept++; continue; }
      if (full && e.s && sigOf(p, canonRef) !== e.s) { p.count.why = `its files differ from the tree build of ${(d.snapshotAt || '').slice(0, 10)}`; kept++; continue; }
      p.units = e.u;
      p.count = { mode: 'tree', previous: p.unitsPrevious, trees: e.t || [], with: e.with || null };
      tree++;
    }
    return { mode: m, tree, kept };
  }

  // Development panel: one line under the units, saying which count is shown and how it was made.
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = n => (n == null ? '–' : Math.round(n).toLocaleString('en-CA'));
  function noteHTML(p, max = Infinity) {
    const c = p && p.count; if (!c) return '';
    if (c.mode === 'tree') {
      const more = (c.trees || []).length > max ? `<br><span class="muted">+${(c.trees || []).length - max} more trees</span>` : '';
      const parts = (c.trees || []).slice(0, max).map(([rootRef, u, basis, flag]) => `${esc(rootRef)}: ${num(u)}${flag ? ` <span class="tag">${esc(flag)}</span>` : ''} <span class="muted">(${esc(basis)})</span>`);
      const moved = c.previous !== p.units ? ` · ${num(c.previous)} by the previous rule` : '';
      const withTxt = c.with ? `<br>Its files are counted in the tree of ${esc(c.with)}, a file another development holds, so they count 0 here.` : '';
      return `<p class="small count-note" data-count="tree"><strong>Tree count</strong>${moved}${parts.length ? `<br>${parts.join('<br>')}` : ''}${more}${withTxt}</p>`;
    }
    if (mode() === 'tree' && c.why) return `<p class="small muted count-note" data-count="previous"><strong>Previous count</strong>: ${esc(c.why)}.</p>`;
    return `<p class="small muted count-note" data-count="previous"><strong>Previous count</strong> (Settings › Counting).</p>`;
  }
  // Settings › Counting.
  function settingsHTML() {
    const m = mode();
    const meta = data ? `Tree build of ${(data.snapshotAt || '').slice(0, 10)}: Peel ${num(data.totals && data.totals.Peel && data.totals.Peel.tree)} units (previous ${num(data.totals && data.totals.Peel && data.totals.Peel.previous)}).` : 'Tree counts are not loaded; the previous count is shown.';
    return `<fieldset data-info="counting"><legend>Counting</legend>
        <label class="field"><span>Units per development</span><select id="count-mode" autocomplete="off">${Object.entries(MODES).map(([v, t]) => `<option value="${v}"${v === m ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <p class="small muted">Tree: the developments are the trees of files on one land, and each planning file counts once (approved 2026-10-15). Previous: the developments and counts as before (the larger of planned and permitted). Kept for one release so you can compare. ${esc(meta)}</p>
      </fieldset>`;
  }
  const label = () => (mode() === 'tree' ? 'tree count' : 'previous count');

  const api = { MODES, mode, setMode, load, setData, apply, sigOf, signature, fileKeysOf, noteHTML, settingsHTML, label, get data() { return data; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTreeCounts = api;
})(typeof window !== 'undefined' ? window : globalThis);
