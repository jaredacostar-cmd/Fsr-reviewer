(function (root) {
'use strict';
  // Step C1: the plan roll-up (PeelPlanRollup). Pure: no DOM, no app state; the caller passes
  // the developments and how to measure and place them.
  //
  // Levels: Peel → municipality → secondary plan / character area → its sub-levels (a nested plan,
  // e.g. Bolton Core in Bolton; a Brampton precinct) → developments. "Not in a plan" (per
  // municipality) and "Elsewhere in <plan>" (a plan's land outside its sub-levels) are added so
  // every parent equals the sum of its children: check = parent − Σ children, always 0.
  //
  // Placement: a tree development's share of its root file's land in each plan (the tree build,
  // data/tree-counts.json), so a development straddling two plans is split by area; otherwise
  // (no boundary, or the Previous grouping) the plans holding its point, whole.
  //
  // Measures are the Overview's: units from Growth.pipelineTotals (planned, permitted, completed,
  // left to build), committed by D-5-1, people and jobs from PeelDemand.estimate at the chosen
  // basis. Each development is measured once and its shares multiply it, so Peel equals the
  // Overview.
  const KEYS = ['planned', 'committed', 'proposed', 'permitted', 'completed', 'left', 'people', 'jobs', 'built', 'anticipated'];
  const zero = () => Object.fromEntries(KEYS.map(k => [k, 0]));
  const addInto = (t, m, f) => { for (const k of KEYS) t[k] += (m[k] || 0) * f; };

  // Where one development sits: node id → share (every level, Peel and municipality = 1).
  // areaOf: id → { id, kind, parent, municipality }.
  function placement(p, raw, areaOf, hasKids = new Set()) {
    const muni = p.municipality || 'Other';
    const out = new Map([['peel', 1], [`m:${muni}`, 1]]);
    // Its plans and precincts in its own municipality, with every parent present (a sub-level
    // holding a share means its parent holds at least that much).
    const s = new Map();
    for (const [id, sh] of raw) { const a = areaOf(id); if (a && a.municipality === muni && sh > 0) s.set(id, Math.max(s.get(id) || 0, Math.min(1, sh))); }
    for (const id of [...s.keys()]) { let a = areaOf(id); while (a && a.parent) { const up = areaOf(a.parent); if (!up) break; s.set(up.id, Math.max(s.get(up.id) || 0, s.get(a.id))); a = up; } }
    const kids = new Map();
    for (const id of s.keys()) { const a = areaOf(id); const par = a.parent && s.has(a.parent) ? a.parent : null; (kids.get(par) || kids.set(par, []).get(par)).push(id); }
    // Top-level plans can't hold more than the whole development; nor sub-levels more than their plan.
    const fit = (ids, cap) => { const sum = ids.reduce((t, id) => t + s.get(id), 0); if (sum > cap && sum > 0) for (const id of ids) s.set(id, s.get(id) * cap / sum); };
    const walk = (par, cap) => {
      const ids = kids.get(par) || [];
      fit(ids, cap);
      for (const id of ids) walk(id, s.get(id));
    };
    walk(null, 1);
    let topSum = 0;
    for (const id of kids.get(null) || []) topSum += s.get(id);
    for (const [id, sh] of s) out.set(`a:${id}`, sh);
    // The rest of each plan (outside its sub-levels), and the rest of the development (no plan).
    for (const id of s.keys()) { const ch = kids.get(id) || []; if (!ch.length && !hasKids.has(id)) continue; const rest = s.get(id) - ch.reduce((t, c) => t + s.get(c), 0); if (rest > 1e-9) out.set(`r:${id}`, rest); }
    if (1 - topSum > 1e-9) out.set(`n:${muni}`, 1 - topSum);
    return out;
  }

  /**
   * set: developments; opts:
   *   areas: [{ id, name, municipality, kind, parent }]
   *   sharesOf(p) → [[areaId, share]] | null (tree shares; null → point)
   *   pointOf(p) → [areaId] (plans and precincts holding its point)
   *   measure(p) → { planned, committed, proposed, permitted, completed, left, people, jobs }
   *   inMtsa(p) → boolean (an overlay column, never added up)
   */
  function build(set, opts) {
    const areas = opts.areas || [], byId = new Map(areas.map(a => [a.id, a]));
    const areaOf = id => byId.get(id) || null;
    // Plans with sub-levels: a development directly in one sits under "Elsewhere in <plan>".
    const hasKids = new Set(areas.filter(a => a.parent && byId.has(a.parent)).map(a => a.parent));
    const nodes = new Map();
    const node = (id, kind, name, parentId, extra = {}) => {
      let n = nodes.get(id);
      if (!n) { n = { id, kind, name, parent: parentId, children: [], devs: [], m: zero(), mtsa: { planned: 0, people: 0 }, n: 0, ...extra }; nodes.set(id, n); if (parentId) nodes.get(parentId).children.push(n); }
      return n;
    };
    node('peel', 'peel', 'Peel', null);
    const ensure = (id, muni) => {
      if (nodes.has(id)) return nodes.get(id);
      if (id.startsWith('m:')) return node(id, 'municipality', id.slice(2), 'peel');
      if (id.startsWith('n:')) { ensure(`m:${muni}`, muni); return node(id, 'none', 'Not in a plan', `m:${muni}`); }
      if (id.startsWith('r:')) { const a = areaOf(id.slice(2)); ensure(`a:${a.id}`, muni); return node(id, 'rest', `Elsewhere in ${a.name}`, `a:${a.id}`); }
      const a = areaOf(id.slice(2));
      const par = a.parent && areaOf(a.parent) ? `a:${a.parent}` : `m:${muni}`;
      ensure(par, muni);
      return node(id, a.kind === 'precinct' ? 'precinct' : a.parent ? 'subplan' : 'plan', a.name, par, { areaId: a.id });
    };
    const placed = [];
    for (const p of set) {
      const tree = opts.sharesOf ? opts.sharesOf(p) : null;
      const raw = tree && tree.length ? tree : (opts.pointOf ? opts.pointOf(p) : []).map(id => [id, 1]);
      const at = placement(p, raw, areaOf, hasKids);
      const m = opts.measure(p), mt = opts.inMtsa ? opts.inMtsa(p) : false;
      for (const [id, sh] of at) {
        const n = ensure(id, p.municipality || 'Other');
        addInto(n.m, m, sh); n.n += sh > 0 ? 1 : 0;
        if (mt) { n.mtsa.planned += m.planned * sh; n.mtsa.people += m.people * sh; }
      }
      // A development is listed under each leaf it reaches (a leaf: no child holds it).
      for (const [id, sh] of at) { if (![...at.keys()].some(k => nodes.get(k).parent === id)) nodes.get(id).devs.push({ p, share: sh }); }
      placed.push({ p, at, m, tree: !!(tree && tree.length) });
    }
    // Checks, bottom-up: a parent equals the sum of its children (units and people).
    for (const n of nodes.values()) {
      if (!n.children.length) { n.check = { planned: 0, people: 0 }; continue; }
      const sum = zero(); for (const c of n.children) addInto(sum, c.m, 1);
      n.check = { planned: n.m.planned - sum.planned, people: n.m.people - sum.people };
    }
    // Order: municipalities by name; plans by people, "Not in a plan" / "Elsewhere" last.
    const LAST = { none: 1, rest: 1 };
    for (const n of nodes.values()) n.children.sort((a, b) => (LAST[a.kind] || 0) - (LAST[b.kind] || 0) || (a.kind === 'municipality' ? a.name.localeCompare(b.name) : b.m.people - a.m.people));
    for (const n of nodes.values()) n.devs.sort((a, b) => b.p.units * b.share - a.p.units * a.share || 0);
    const straddling = placed.filter(x => [...x.at.keys()].filter(k => k.startsWith('a:') && !(areaOf(k.slice(2)) || {}).parent).length > 1).map(x => ({ p: x.p, plans: [...x.at].filter(([k]) => k.startsWith('a:') && !(areaOf(k.slice(2)) || {}).parent).map(([k, sh]) => ({ id: k.slice(2), name: areaOf(k.slice(2)).name, share: sh })) }));
    return { root: nodes.get('peel'), nodes, placed, straddling, path: id => { const out = []; let n = nodes.get(id); while (n) { out.unshift(n.name); n = n.parent ? nodes.get(n.parent) : null; } return out.join('/'); } };
  }

  // Table 5: top-level plans (and "Not in a plan") down the side, servicing across the top.
  // colOf(p) → column key (a plant, a pressure zone, or 'none'). Cells: { people, planned }.
  function matrix(r, colOf) {
    const rows = new Map(), cols = new Map();
    const cell = (rk, ck) => { const row = rows.get(rk); return row.cells.get(ck) || row.cells.set(ck, { people: 0, planned: 0 }).get(ck); };
    for (const muni of r.root.children) for (const plan of muni.children) rows.set(plan.id, { node: plan, muni: muni.name, cells: new Map(), people: 0, planned: 0 });
    for (const { p, at, m } of r.placed) {
      const ck = colOf(p) || 'none';
      if (!cols.has(ck)) cols.set(ck, { people: 0, planned: 0 });
      for (const [id, sh] of at) {
        if (!rows.has(id)) continue;
        const c = cell(id, ck), row = rows.get(id), col = cols.get(ck);
        const pe = (m.people || 0) * sh, un = (m.planned || 0) * sh;
        c.people += pe; c.planned += un; row.people += pe; row.planned += un; col.people += pe; col.planned += un;
      }
    }
    return { rows: [...rows.values()], cols };
  }

  // Table 2: areas against their published targets. Units are the main comparison (decided):
  // targets count homes the same way the pipeline does; people are shown but not compared, since
  // targets use household persons per unit and the pipeline Peel design criteria. A municipality's
  // target is the Region's 2051 allocation of growth (2051 minus 2021). An area with no target
  // shows "no target", never 0; a density-only target is shown, not compared.
  //   targets: [{ id, units, population, jobs, density, year, kind, scope, source, url, page }]
  //   munis: { Brampton: { units2021, units2051, pop2021, pop2051, jobs2021, jobs2051 } }
  // "40 (a): Bram West" + "40 (b): Bram West" → "40 (a), 40 (b): Bram West".
  const joinNames = names => { const parts = names.map(x => x.split(': ')); const tail = parts[0].length > 1 && parts.every(p => p.length > 1 && p[1] === parts[0][1]) ? parts[0][1] : null; return tail ? `${parts.map(p => p[0]).join(', ')}: ${tail}` : names.join(' + '); };
  function vsTarget(r, targets, munis) {
    const byId = new Map((targets || []).map(t => [t.id, t]));
    const rows = [];
    // A target covering several plans (one figure for 48 (a) and (b)) is compared with all of them.
    const sumOf = ids => { const m = { planned: 0, committed: 0, people: 0 }; const names = []; for (const id of ids) { const n = r.nodes.get(`a:${id}`); if (!n) continue; m.planned += n.m.planned; m.committed += n.m.committed; m.people += n.m.people; names.push(n.name); } return { m, names }; };
    const row = (n, t, muni, cover) => {
      const m = cover ? cover.m : n.m, base = t.units > 0 ? t.units : null, pBase = !base && t.population > 0 ? t.population : null;
      return {
        node: n, muni, target: t, name: cover && cover.names.length > 1 ? joinNames(cover.names) : n.name,
        committed: m.committed, total: m.planned, people: m.people,
        pctCommitted: base ? m.committed / base : null, pctTotal: base ? m.planned / base : null,
        gap: base ? base - m.planned : null,
        // People-only targets: shown side by side, indicative only (household vs design persons per unit).
        pctPeople: pBase ? m.people / pBase : null,
        compared: base ? 'units' : pBase ? 'people' : t.density ? 'density only' : 'none',
      };
    };
    for (const mu of r.root.children) {
      const a = munis && munis[mu.name];
      if (a) rows.push(row(mu, { id: `m:${mu.name}`, units: a.units2051 - a.units2021, population: a.pop2051 - a.pop2021, jobs: a.jobs2051 - a.jobs2021, year: 2051, kind: 'allocation', scope: 'growth', source: 'Region of Peel 2051 allocation (growth since 2021)' }, mu.name));
      const walk = n => { for (const c of n.children) { const t = c.areaId && byId.get(c.areaId); if (t) rows.push(row(c, t, mu.name, t.covers ? sumOf(t.covers) : null)); walk(c); } };
      walk(mu);
    }
    const covered = new Set((targets || []).flatMap(t => t.covers || [t.id]));
    const noTarget = [...r.nodes.values()].filter(n => (n.kind === 'plan' || n.kind === 'subplan') && !covered.has(n.areaId)).length;
    return { rows, noTarget };
  }

  // The part of a roll-up inside the given plans (SPEC 1.9): By plan's figure for a plan filter.
  // A development the filter shows in full can lie partly in another plan; that part is `outside`
  // (total − inside), so the Overview and By plan reconcile instead of disagreeing.
  function within(r, ids) {
    const m = zero(); let found = 0; const devs = new Set(), part = new Set();
    for (const id of ids || []) {
      const n = r.nodes.get(`a:${id}`); if (!n) continue; found++;
      addInto(m, n.m, 1);
    }
    for (const { p, at } of r.placed) {
      const sh = (ids || []).reduce((t, id) => t + (at.get(`a:${id}`) || 0), 0);
      if (sh > 0) devs.add(p); if (sh > 0 && sh < 1 - 1e-9) part.add(p);
    }
    const total = zero(); for (const { m: x } of r.placed) addInto(total, x, 1);
    return { found, planned: m.planned, people: m.people, outside: total.planned - m.planned, outsidePeople: total.people - m.people, straddling: part.size, devs: devs.size };
  }

  const api = { KEYS, placement, build, matrix, vsTarget, within };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPlanRollup = api;
})(typeof window !== 'undefined' ? window : globalThis);
