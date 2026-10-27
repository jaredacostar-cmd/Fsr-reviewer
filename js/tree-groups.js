(function (root) {
'use strict';
  // Step B2: the trees become the developments (PeelTreeGroups).
  //
  // data/tree-counts.json (version 2, scripts/build-tree-counts.js) lists every tree as a
  // development: its key, its files in tree order with their links, its count, and which
  // development each planning file belongs to. js/phases.js buildProjects calls regroup() (its
  // opts.regroup hook) with the parts it grouped by address and land; the records move into their
  // tree's development:
  //   - a planning file goes to its tree's development;
  //   - a building permit goes where the tree placed it (data.permits), else with the rest of its
  //     site (the development its site's planning files went to);
  //   - a file the tree build hasn't seen (a live refresh) stays with its site.
  // A tree keeps the key of the development that held its root file; a second tree of the same
  // development becomes "<key>~<root file>". The pieces of one application merged into one
  // development resolve to it (data.merged: old key → key kept). keyMap (old key → new keys) resolves keys saved before
  // (watchlist, allocations, share links, saved views, weekly changes, phase history).
  // aliases (js/phases.js keyAliases, set by the app after each build, computed when first needed):
  // an address key that is no development's key now → the developments holding its records.
  let data = null, idx = null, keyMap = new Map(), devOfKey = new Map(), aliasOf = () => null, aliasMap = null;
  function setAliases(src) { aliasMap = null; aliasOf = typeof src === 'function' ? k => (aliasMap || (aliasMap = src() || new Map())).get(k) : src instanceof Map ? k => src.get(k) : () => null; }

  // A planning file's key, as the tree build wrote it (js/phases.js fileId: a Caledon number with its type).
  const phases = () => root.PeelPhases || (typeof require === 'function' ? require('./phases.js') : null);
  const fileIdOf = (r, canonRef) => { const P = phases(); return P && P.fileId ? P.fileId(r, canonRef) : r.fileKey || canonRef(r.ref); };
  const fileKey = (r, canonRef) => `${r.municipality}|${fileIdOf(r, canonRef) || r.uid}`;

  function setData(d) {
    data = d && d.version >= 2 && Array.isArray(d.devs) ? d : null;
    devOfKey = new Map(data ? data.devs.map((x, i) => [x.k, i]) : []);
    idx = null;
  }
  const ready = () => !!data;

  // The hook for buildProjects: parts in, parts out.
  function regroup(parts, opts = {}) {
    if (!data) return parts;
    const canonRef = opts.canonRef || (root.PeelPhases && root.PeelPhases.canonRef) || (x => x);
    const ringsArea = opts.ringsArea || (root.PeelPhases && root.PeelPhases.ringsArea) || (() => 0);
    const files = data.files, permits = data.permits || {}, devs = data.devs;
    const out = new Map(), map = new Map();
    const bucket = k => { let b = out.get(k); if (!b) out.set(k, b = { key: k, recs: [], site: null }); return b; };
    for (const part of parts) {
      // Where its planning files go; the site's main development takes everything else.
      const to = new Map(), count = new Map();
      for (const r of part.recs) {
        if (r.kind !== 'application') continue;
        const i = files[fileKey(r, canonRef)];
        if (i == null) continue;
        const k = devs[i].k; to.set(r, k); count.set(k, (count.get(k) || 0) + 1);
      }
      const main = count.has(part.key) ? part.key : count.size ? [...count].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))[0][0] : part.key;
      for (const r of part.recs) {
        let k = to.get(r);
        if (!k && r.kind !== 'application' && permits[r.uid] != null) k = devs[permits[r.uid]].k;
        bucket(k || main).recs.push(r);
        // The main development first: the one a saved key resolves to.
        const s = map.get(part.key) || map.set(part.key, new Set([main])).get(part.key); s.add(k || main);
      }
      // The site's own boundary stays with the development that keeps its key.
      if (out.has(part.key) && part.site && part.site.site) out.get(part.key).site = { site: part.site.site };
    }
    // A development that took no site from the parts: its root file's boundary.
    for (const b of out.values()) {
      if (b.site) continue;
      const d = devOfKey.has(b.key) ? devs[devOfKey.get(b.key)] : null;
      const rootRec = d && b.recs.find(r => r.kind === 'application' && r.ref === d.root && r.poly && r.poly.length);
      b.site = rootRec && rootRec.lat != null ? { site: { rings: rootRec.poly, area: ringsArea(rootRec.poly), centre: [rootRec.lng, rootRec.lat] } } : {};
    }
    keyMap = map;
    return [...out.values()].filter(b => b.recs.length);
  }

  // Development meta for a key: its tree (files in order, links), its count.
  function devOf(key) { const i = devOfKey.get(key); return i == null ? null : data.devs[i]; }

  // An old key (saved before the trees) → the development(s) it became; the first is the one that
  // kept the most of it. A key that still exists resolves to itself. "<key>#<file>" (a branch)
  // resolves its base and keeps the file when that file is in the new development.
  // An address key saved before an address fix resolves through the aliases; opts.aliasesOnly
  // (the trees off) resolves nothing else.
  function resolveAll(k, exists = () => false, opts = {}) {
    if (!k) return [];
    if (exists(k)) return [k];
    // A piece of an application merged into one development (scripts/build-tree-counts.js 3·).
    const mg = !opts.aliasesOnly && data && data.merged && data.merged[k];
    if (mg && mg !== k) { const r = resolveAll(mg, exists, opts); if (r.length) return r; }
    const h = String(k).lastIndexOf('#');
    if (h > 0 && !keyMap.has(k) && !aliasOf(k)) {
      const base = k.slice(0, h), ref = k.slice(h + 1);
      return resolveAll(base, exists, opts).map(b => `${b}#${ref}`);
    }
    const t = String(k).indexOf('~');
    const s = opts.aliasesOnly ? null : keyMap.get(k);
    if (s && s.size) return [...s];
    const al = aliasOf(k);
    if (al && al.length) { const out = [...new Set(al.filter(x => x !== k).flatMap(x => (exists(x) ? [x] : opts.aliasesOnly ? [] : resolveAll(x, exists, opts))))]; if (out.length) return out; }
    if (t > 0) {
      const base = k.slice(0, t), rest = k.slice(t);
      // A tree whose root file changed: the tree of that development now holding the file.
      const held = !opts.aliasesOnly && data && data.devs.find(x => (x.k === base || x.k.startsWith(`${base}~`)) && (x.n || []).some(n => n[0] === rest.slice(1)) && exists(x.k));
      if (held) return [held.k];
      if (!opts.aliasesOnly && exists(base)) return [base];   // a tree key, with the trees off
      const nb = (aliasOf(base) || []).find(exists);
      if (nb) return exists(nb + rest) ? [nb + rest] : opts.aliasesOnly ? [] : [nb];
    }
    return [];
  }
  const resolve = (k, exists, opts) => resolveAll(k, exists, opts)[0] || null;

  // Saved keys rewritten once the developments are the trees (or, the trees off, an address key
  // to today's key). Nothing is dropped: a key that resolves to nothing is kept as it was.
  function migrateKeys(keys, exists, opts) {
    const out = new Set();
    for (const k of keys) { const r = resolveAll(k, exists, opts); if (r.length) r.forEach(x => out.add(x)); else out.add(k); }
    return [...out];
  }
  // Allocations (one record per development): a split's allocation goes to the part with the most
  // units, noting where it came from.
  function migrateAllocations(all, exists, unitsOf, opts) {
    const out = {}; let moved = 0;
    for (const [k, a] of Object.entries(all || {})) {
      if (exists(k)) { out[k] = a; continue; }
      const r = resolveAll(k, exists, opts).sort((x, y) => (unitsOf(y) || 0) - (unitsOf(x) || 0));
      if (!r.length) { out[k] = a; continue; }
      const to = r[0];
      out[to] = out[to] ? out[to] : { ...a, movedFrom: k };
      moved++;
    }
    return { all: out, moved };
  }
  // Weekly changes and phase history, saved by the old keys: copied to the new keys as well.
  function translateHistory(hist, exists, opts) {
    if (!hist || !hist.projects) return hist;
    for (const [k, list] of Object.entries(hist.projects)) for (const n of resolveAll(k, exists, opts)) if (n !== k && !hist.projects[n]) hist.projects[n] = list;
    return hist;
  }
  function translateChanges(c, exists, opts) {
    if (!c) return c;
    for (const x of [...(c.moved || []), ...(c.added || [])]) { const n = resolve(x.key, exists, opts); if (n && n !== x.key) { x.oldKey = x.oldKey || x.key; x.key = n; } }
    return c;
  }

  // The Files view: the tree's files in order (root first, each branch under its parent), each with
  // the link that put it there (rule, overlap, confidence). Rows carry the records of their branch,
  // so a branch opens as a sub-development.
  const CONF = { h: 'high', m: 'medium', l: 'low' };
  function fileRows(p) {
    const d = devOf(p.key); if (!d || !d.n) return null;
    const canonRef = (root.PeelPhases && root.PeelPhases.canonRef) || (x => x);
    const recsOf = new Map();
    for (const r of p.records) if (r.kind === 'application') { const k = fileIdOf(r, canonRef) || r.uid; (recsOf.get(k) || recsOf.set(k, []).get(k)).push(r); }
    const rules = (data.codes && data.codes.rules) || [], roles = (data.codes && data.codes.roles) || [];
    const nodes = d.n.map(([ref, role, parent, rule, conf, overlap, units, cancelled, fk]) => ({ ref, role: roles[role] || role, parent, rule: rule >= 0 ? rules[rule] : '', conf: CONF[conf] || '', overlap, units, cancelled: !!cancelled, recs: recsOf.get(fk || ref) || recsOf.get(canonRef(ref)) || [] }));
    const kids = nodes.map(() => []);
    nodes.forEach((n, i) => { if (n.parent >= 0) kids[n.parent].push(i); });
    const rows = [];
    const walk = (i, depth) => {
      const n = nodes[i]; if (!n.recs.length) return;
      const sub = [], collect = j => { sub.push(...nodes[j].recs); kids[j].forEach(collect); };
      collect(i);
      const a = n.recs.slice().sort((x, y) => (y.units || 0) - (x.units || 0))[0];
      rows.push({ a, pre: [], depth, link: n.parent >= 0 || n.rule ? { rule: n.rule, conf: n.conf, overlap: n.overlap } : null, role: n.role, branch: sub });
      kids[i].forEach(j => walk(j, depth + 1));
    };
    nodes.forEach((n, i) => { if (n.parent < 0) walk(i, 0); });
    return rows;
  }

  // The Files view's extra line for a tree row: how the file joined its tree.
  const escH = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function linkHTML(t) {
    if (!t || !t.link) return '';
    const l = t.link, ov = l.overlap != null ? `, ${Math.round(l.overlap * 100)}% inside` : '';
    return `<div class="small muted tree-link">${escH(l.rule)}${l.conf ? ` · ${escH(l.conf)} confidence` : ''}${escH(ov)}</div>`;
  }
  const indent = t => (t && t.depth ? ` style="margin-left:${Math.min(t.depth, 4) * 14}px"` : '');
  const FILES_NOTE = 'Files in tree order: each sits under the file whose land holds it, with the rule that linked them and its confidence; files on the same land sit side by side. The development counts its units once, from the tree. Open a file to see its branch on its own.';

  // Step 2 (js/sites.js): the other developments on this one's site, proposals first (most homes),
  // then its site activity (a patio, a fit-out), from every development built, held aside or not.
  function siteParts(p, list) {
    const k = p && p.siteKey; if (!k) return [];
    return (list || []).filter(q => q !== p && q.key !== p.key && (q.key === k || q.siteKey === k))
      .sort((a, b) => (!!a.siteActivity - !!b.siteActivity) || (b.units || 0) - (a.units || 0) || String(a.key).localeCompare(String(b.key)));
  }

  const api = { siteParts, linkHTML, indent, FILES_NOTE, setData, setAliases, ready, regroup, devOf, resolve, resolveAll, migrateKeys, migrateAllocations, translateHistory, translateChanges, fileRows, fileKey, get keyMap() { return keyMap; }, get data() { return data; } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTreeGroups = api;
})(typeof window !== 'undefined' ? window : globalThis);
