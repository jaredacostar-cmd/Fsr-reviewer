(function (root) {
'use strict';
  // Growth › By plan (PeelPlanTables): Table 1, the plan roll-up (C2), and Table 5, plans by
  // plant or pressure zone (C3), on js/plan-rollup.js. The developments are the Overview's
  // (the filters, the area of interest), measured at its basis, so Peel equals the Overview.
  const { $, esc, fmtNum, store, CSV_DISCLAIMER } = root.PeelUtil;
  const R = () => root.PeelPlanRollup;
  const App = () => root.PeelApp;
  const DU = () => root.PeelDemandUI;
  const D = () => root.PeelDemand;
  const G = () => root.Growth;
  const TG = () => root.PeelTreeGroups;
  const MM = () => root.PeelMapMarkers;
  const SD = () => root.PeelSvcData;

  const open = new Set(['peel']), all = new Set();
  // Step C4: published targets (data/plan-targets.json, every figure with its source).
  let targets = null, targetsLoading = null;
  function loadTargets() {
    if (!targetsLoading && typeof fetch === 'function') targetsLoading = fetch('data/plan-targets.json', { cache: 'no-cache' }).then(r => (r.ok ? r.json() : null)).catch(() => null).then(d => { targets = d; render(); });
    return targets;
  }
  const munisAlloc = () => { const F = App() && App().state.reports && App().state.reports.forecast2051; return F ? F.municipalities : null; };
  // Compact by default (Area, Units, People, Check: fits the panel); "All columns" adds the rest.
  let wide = !!(store && store.get('ptWide', false));
  const c = () => (wide ? ' class="num"' : ' class="num" hidden');
  let cache = null;

  // The plans (with their nesting) and where each development sits.
  function areas() {
    const d = TG() && TG().data;
    if (d && d.areas) return d.areas;
    const A = App().state.areas; if (!A) return [];
    return [...A.secondaryPlans.map(a => ({ id: a.id, name: a.name, municipality: a.municipality, kind: a.municipality === 'Mississauga' ? 'character area' : 'secondary plan', parent: null })),
      ...(A.precincts || []).map(a => ({ id: a.id, name: a.name, municipality: a.municipality, kind: 'precinct', parent: null }))];
  }
  function sharesOf(p) {
    if (!App().state.treeGrouped || !TG()) return null;
    const d = TG().devOf(p.key), list = TG().data && TG().data.areas;
    return d && d.a && list ? d.a.map(([i, s]) => [list[i].id, s]) : null;
  }
  function pointOf(p) {
    const A = App().state.areas, out = [...(p.sp || [])];
    if (A && A.precincts && root.PeelAreas) out.push(...root.PeelAreas.locate(A.precincts, p.lng, p.lat, p.municipality));
    return out;
  }
  function inMtsa(p) { const d = App() && App().state.treeGrouped && TG() && TG().devOf(p.key); return d && d.mt ? d.mt.length > 0 : !!(p.mtsa && p.mtsa.length); }

  function compute() {
    const set = DU().demandSet(), basis = DU().demandBasis(), crit = App().state.criteria;
    if (cache && cache.set === set.length && cache.first === set[0] && cache.basis === basis && cache.crit === crit && cache.tree === App().state.treeGrouped && cache.areas === areas().length) return cache.r;
    const r = R().build(set, {
      areas: areas(), sharesOf, pointOf, inMtsa,
      // Committed / proposed from the layer function (SPEC §2): committed holds what is built (Existing
      // + Built on the site) and Committed; proposed holds Proposed and Anticipated (anticipated: its part).
      measure: p => {
        const t = G().pipelineTotals([p]), e = D().estimate([p], crit, basis, App().jobsOf), L = root.PeelLayers.ofDev(p).parts;
        const prop = t.planned > 0 ? L.proposed + L.anticipated : 0;
        return { planned: t.planned, committed: t.planned - prop, proposed: prop, permitted: t.permitted, completed: t.completed, left: t.left, people: e.population, jobs: e.employment ? e.employment.jobs : 0,
          built: t.planned > 0 ? L.existing + L.built : 0, anticipated: t.planned > 0 ? L.anticipated : 0 };
      },
    });
    r.mOf = new Map(r.placed.map(x => [x.p, x.m]));
    cache = { set: set.length, first: set[0], basis, crit, tree: App().state.treeGrouped, areas: areas().length, r };
    return r;
  }

  const n0 = v => fmtNum(Math.round(v));
  const BASIS = { all: 'all units', buildout: 'units applied for (no anticipated)', committed: 'committed units', remaining: 'units left to build' };
  const KIND = { subplan: 'sub-area', precinct: 'precinct' };
  function checkCell(n) {
    if (!n.children.length) return '<td class="num muted">–</td>';
    const ok = Math.abs(n.check.planned) < 0.5 && Math.abs(n.check.people) < 0.5;
    return ok ? '<td class="num ok" title="Equals the sum of the rows under it">✓</td>' : `<td class="num warn" title="Differs from the sum of the rows under it">${n0(n.check.planned)} units · ${n0(n.check.people)} people</td>`;
  }
  // Each row's units by layer (SPEC §2.3): built | committed | proposed | anticipated, then what the
  // plan's published target allows beyond them (to target, dashed).
  let toTarget = new Map();
  function layerBar(n) {
    const LB = root.PeelLayerBar, m = n.m; if (!LB || !(m.planned > 0)) return '';
    const tg = toTarget.get(n.id) || 0;
    const segs = [{ layer: 'built', value: m.built }, { layer: 'committed', value: m.committed - m.built }, { layer: 'proposed', value: m.proposed - m.anticipated }, { layer: 'anticipated', value: m.anticipated }, { layer: 'to2051', value: tg, title: `To target: ${n0(tg)} units the plan's target allows beyond these` }];
    return LB.barHTML({ segments: segs, small: true, max: m.planned + tg });
  }
  function rowHTML(n, depth) {
    const m = n.m, has = n.children.length || n.devs.length, isOpen = open.has(n.id);
    const ppu = m.planned > 0 ? (m.people / m.planned).toFixed(2) : '–';
    const tog = has ? `<button type="button" class="btn small link pt-tog" data-pt-tog="${esc(n.id)}" aria-expanded="${isOpen}">${isOpen ? '▾' : '▸'}</button>` : '<span class="pt-sp"></span>';
    const filt = n.areaId && n.kind !== 'precinct' && n.kind !== 'subplan' ? ` <button type="button" class="btn small link" data-pt-filter="${esc(n.areaId)}" title="Filter the map and every tab to this plan">filter</button>` : '';
    return `<tr class="pt-row pt-${n.kind}" data-depth="${depth}"><th scope="row" style="padding-left:${depth * 14}px">${tog}${esc(n.name)}${KIND[n.kind] ? ` <span class="muted small">${KIND[n.kind]}</span>` : ''}${filt}${layerBar(n)}</th>
      <td${c('x')}>${n0(n.n)}</td><td class="num">${n0(m.planned)}</td><td${c('x')}>${n0(m.committed)}</td><td${c('x')}>${n0(m.proposed)}</td><td${c('x')}>${n0(m.left)}</td>
      <td${c('x')}>${ppu}</td><td class="num"><strong>${n0(m.people)}</strong></td><td${c('x')}>${n0(m.jobs)}</td><td${c('x')}>${n.mtsa.people ? n0(n.mtsa.people) : '–'}</td>${checkCell(n)}</tr>`;
  }
  function devRowHTML(x, depth) {
    const p = x.p, sh = x.share < 0.999 ? ` <span class="muted small">(${Math.round(x.share * 100)}% of it)</span>` : '';
    const mm = cache.r.mOf.get(p) || { planned: 0, committed: 0, proposed: 0, left: 0, people: 0, jobs: 0 }, f = x.share;
    return `<tr class="pt-dev" data-depth="${depth}"><th scope="row" style="padding-left:${depth * 14 + 18}px"><button type="button" class="btn small link" data-pt-dev="${esc(p.key)}">${esc(p.title)}</button>${sh}</th>
      <td${c('x')}>1</td><td class="num">${n0(mm.planned * f)}</td><td${c('x')}>${n0(mm.committed * f)}</td><td${c('x')}>${n0(mm.proposed * f)}</td><td${c('x')}>${n0(mm.left * f)}</td>
      <td${c('x')}>${mm.planned > 0 ? (mm.people / mm.planned).toFixed(2) : '–'}</td><td class="num">${n0(mm.people * f)}</td><td${c('x')}>${n0(mm.jobs * f)}</td><td${c('x')}>${inMtsa(p) ? n0(mm.people * f) : '–'}</td><td class="num muted">–</td></tr>`;
  }
  // Plans with no units in the developments shown sit behind "show empty" (SPEC §5).
  let showEmpty = false;
  const isEmpty = n => n.kind !== 'peel' && n.kind !== 'municipality' && !(n.m.planned >= 0.5);
  function bodyRows(n, depth, out) {
    out.push(rowHTML(n, depth));
    if (!open.has(n.id)) return;
    for (const c of n.children) if (showEmpty || !isEmpty(c)) bodyRows(c, depth + 1, out);
    const devs = all.has(n.id) ? n.devs : n.devs.slice(0, 10);
    for (const x of devs) out.push(devRowHTML(x, depth + 1));
    if (n.devs.length > devs.length) out.push(`<tr class="pt-more"><td colspan="11" style="padding-left:${(depth + 1) * 14 + 18}px"><button type="button" class="btn small link" data-pt-all="${esc(n.id)}">See all ${fmtNum(n.devs.length)} developments</button></td></tr>`);
  }
  function tableHTML(r) {
    const x = (t, title) => `<th scope="col"${c('x')}${title ? ` title="${title}"` : ''}>${t}</th>`;
    const head = `<tr><th scope="col">Area</th>${x('Developments')}<th scope="col" class="num">Units</th>${x('Approved')}${x('In review')}${x('Left to build')}${x('ppu', 'People per unit (people ÷ units)')}<th scope="col" class="num">People</th>${x('Jobs')}${x('In an MTSA', 'Of which in an MTSA (an overlay: never added up)')}<th scope="col" class="num" title="Parent minus the sum of the rows under it">Check</th></tr>`;
    const rows = []; bodyRows(r.root, 0, rows);
    return `<div class="tbl-scroll"><table class="dt pt-table"><caption class="sr">Developments by area</caption><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>`;
  }
  function notesHTML(r) {
    const st = r.straddling.slice().sort((a, b) => b.p.units - a.p.units);
    const nested = areas().filter(a => a.parent && a.kind !== 'precinct');
    const pre = areas().filter(a => a.kind === 'precinct');
    const preEmpty = pre.filter(a => !r.nodes.has(`a:${a.id}`));
    return `<details class="sub-sect"><summary><h3 class="sub-title">Developments split between plans <span class="muted small">${fmtNum(st.length)}</span></h3></summary>
        ${st.length ? `<ul class="small">${st.slice(0, 30).map(x => `<li><button type="button" class="btn small link" data-pt-dev="${esc(x.p.key)}">${esc(x.p.title)}</button> · ${fmtNum(x.p.units || 0)} units: ${x.plans.map(y => `${esc(y.name)} ${Math.round(y.share * 100)}%`).join(', ')}</li>`).join('')}</ul>${st.length > 30 ? `<p class="small muted">+${fmtNum(st.length - 30)} more (in the CSV).</p>` : ''}` : '<p class="small muted">None.</p>'}
        <p class="small muted">Each tree development is split by its share of each plan's land (its root file's boundary); the rest of it, if any, is "Not in a plan".</p></details>
      <p class="small muted">Nested plans are sub-levels of their plan, counted once: ${nested.map(a => `${esc(a.name)} (in ${esc((areas().find(b => b.id === a.parent) || {}).name || '')})`).join('; ')}. Brampton precincts sit in the plan holding most of each${preEmpty.length ? `; ${fmtNum(preEmpty.length)} of ${fmtNum(pre.length)} have no development in the current set` : ''}.</p>`;
  }

  function render() {
    const body = $('#byplan-body'); if (!body) return;
    const pane = $('#pane-growth-byplan'); if (pane && pane.hidden) return;
    if (!App() || !App().state.projects) return;
    const r = compute();
    for (const m of r.root.children) if (!open.has(m.id) && !open.has(`!${m.id}`)) open.add(m.id);
    const basis = DU().demandBasis();
    // To target (SPEC §2, "To 2051"): a growth target in units less the layers applied for; a target
    // that counts every home (scope total) holds existing homes too, so it draws no to-target part.
    toTarget = new Map(R().vsTarget(r, targets && targets.targets, munisAlloc()).rows.filter(x => x.compared === 'units' && x.target.scope !== 'total' && x.gap > 0 && !x.target.covers).map(x => [x.node.id, x.gap]));
    body.innerHTML = `<div class="pt-head"><p class="small">The developments shown, by where they are: Peel, municipality, plan, sub-area. People at Peel design criteria, counting ${esc(BASIS[basis] || 'all units')} (the Overview's basis). Every row equals the sum of the rows under it (Check). Bars: units by layer, then what a published target allows beyond them (dashed).${App().state.treeGrouped ? ' Grouping: tree.' : ' Grouping: previous (Settings › Counting).'}</p>
        <p><button type="button" class="btn small" data-pt-wide aria-pressed="${wide}">${wide ? 'Fewer columns' : 'All columns'}</button> <button type="button" class="btn small" data-pt-empty aria-pressed="${showEmpty}">${showEmpty ? 'Hide empty plans' : `Show empty plans (${[...r.nodes.values()].filter(isEmpty).length})`}</button> <button type="button" class="btn small" data-pt-csv>Download CSV</button></p></div>
      ${tableHTML(r)}${notesHTML(r)}
      ${targetHTML(r)}
      ${matrixHTML(r)}`;
    if (root.PeelPanel) root.PeelPanel.set('growth:areas', panelSpec(r));
  }
  // ---- Stage 3: Growth › Areas as the standard panel (the tables, the 2051 comparison, housing
  // activity and the outlook below are its full table) ----------------------------------------------------
  function panelSpec(r) {
    const PN = root.PeelPanel, LB = root.PeelLayerBar, munis = r.root.children.filter(m => m.m.planned >= 0.5).sort((a, b) => b.m.planned - a.m.planned);
    const total = r.root.m.planned || munis.reduce((t, m) => t + m.m.planned, 0) || 1;
    const plans = munis.flatMap(m => m.children.filter(c => c.m.planned >= 0.5).map(c => ({ n: c, muni: m.name }))).sort((a, b) => b.n.m.planned - a.n.m.planned);
    const max = Math.max(1, ...munis.map(m => m.m.planned));
    const bar = n => (LB ? LB.barHTML({ small: true, max, segments: [{ layer: 'built', value: n.m.built || 0 }, { layer: 'committed', value: Math.max(0, n.m.committed - (n.m.built || 0)) }, { layer: 'proposed', value: n.m.proposed || 0 }], label: `${n.name}: ${n0(n.m.planned)} units planned` }) : '');
    const top = munis[0], big = plans[0];
    return {
      calc: true, fullTitle: `Growth › Areas · ${App().state.muni || 'Peel'}: by plan, the 2051 comparison and housing activity`,
      head: PN.areaHead('Growth › Areas', 'Where is it?', null, `${esc(App().state.muni || 'Peel')} · ${fmtNum(plans.length)} plans with planned units`),
      answer: top ? `<strong>${esc(top.name)}</strong> holds the most planned units: <strong>${n0(top.m.planned)}</strong> (${Math.round(top.m.planned / total * 100)}% of the ${n0(total)} shown)${big ? `; the largest plan is <strong>${esc(big.n.name)}</strong> (${esc(big.muni)}, ${n0(big.n.m.planned)} units)` : ''}.` : 'No planned units in the developments shown.',
      figures: [...munis.slice(0, 3).map(m => ({ v: n0(m.m.planned), u: 'units', label: m.name, ctx: `${n0(m.m.left)} left to build · ${n0(m.m.people)} people` })), { v: fmtNum(plans.length), u: 'plans', label: 'with planned units', ctx: big ? `largest: ${esc(big.n.name)}` : '' }].slice(0, 4),
      chart: munis.length ? `<p class="small pnl-chart-t">Planned units by municipality: built, committed and proposed <span class="pnl-chart-u">(units)</span></p>${munis.map(m => `<div class="pnl-kv"><span>${esc(m.name)}</span><span>${n0(m.m.planned)}</span></div>${bar(m)}`).join('')}${LB ? LB.legendHTML([{ layer: 'built' }, { layer: 'committed' }, { layer: 'proposed' }]) : ''}` : '',
      lists: [{ title: 'Plans with the most planned units', rows: plans.slice(0, 5).map(x => ({ attrs: x.n.areaId ? { 'data-pt-filter': x.n.areaId, title: `Show ${x.n.name} only` } : { 'data-full-table': 'growth' }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.n.name)}<small>${esc(x.muni)}</small></span><span class="pnl-r-fig">${n0(x.n.m.planned)}<small>units planned</small></span></div><small class="pnl-r-line">${n0(x.n.m.left)} left to build · ${n0(x.n.m.people)} people at build-out</small>` })), total: plans.length, seeAll: { 'data-full-table': 'growth' } }],
      method: `The developments shown, by where they are: Peel, municipality, plan, sub-area; every row equals the sum of the rows under it. People at Peel design criteria, counting ${esc(BASIS[DU().demandBasis()] || 'all units')}. The full table adds the targets, the 2051 comparison (Region of Peel draft allocation, August 2024), housing activity and the population outlook.`,
      sources: 'Secondary plans and MTSAs (municipal open data); the applications on the map; Region of Peel Land Needs Assessment (draft 2051 allocation, August 2024); CMHC and Peel housing activity.',
      foot: { primary: { label: 'Download CSV', attrs: { 'data-pt-csv': '' } } },
    };
  }

  // ---- Table 2 (C4): areas against their published targets -------------------------------------
  const pct = v => (v == null ? '–' : `${Math.round(v * 100)}%`);
  function targetText(t) {
    const parts = [];
    if (t.units > 0) parts.push(`${n0(t.units)} units`);
    if (t.population > 0) parts.push(`${n0(t.population)} people`);
    if (t.jobs > 0) parts.push(`${n0(t.jobs)} jobs`);
    if (!parts.length && t.density) parts.push(esc(t.density));
    return parts.join(' · ') + (t.year ? ` <span class="muted">by ${esc(t.year)}</span>` : '');
  }
  function srcLink(t) {
    if (t.kind === 'allocation') return '<span class="muted small">Region of Peel 2051 allocation</span>';
    return t.url ? `<a href="${esc(t.url)}" target="_blank" rel="noopener" title="${esc(t.quote || '')}">${esc(t.source || 'source')}</a>${t.page ? ` <span class="muted small">${esc(t.page)}</span>` : ''}` : esc(t.source || '');
  }
  function targetHTML(r) {
    loadTargets();
    const v = R().vsTarget(r, targets && targets.targets, munisAlloc());
    if (!v.rows.length) return `<section class="pt-tg"><h3 class="sub-title">Plans against their targets</h3><p class="small muted">${targets ? 'No published targets for the areas shown.' : 'Loading the targets…'}</p></section>`;
    const rows = v.rows.map(x => {
      const t = x.target, isM = x.node.kind === 'municipality';
      const flags = `${t.scope === 'total' ? ' <span class="muted small" title="The target counts every home at build-out, existing ones included; the pipeline counts new proposals only">total</span>' : ''}${t.checked === false ? ' <span class="tag" title="' + esc((targets && targets.checkNote) || 'Not yet checked against the document') + '">unchecked</span>' : ''}`;
      const pctTot = x.pctTotal != null ? `<strong>${pct(x.pctTotal)}</strong>` : x.pctPeople != null ? `<span class="muted" title="People against a people target: indicative only, since targets use household persons per unit and the pipeline Peel design criteria">${pct(x.pctPeople)} of people†</span>` : '–';
      return `<tr class="pt-${isM ? 'municipality' : 'plan'}"><th scope="row"${isM ? '' : ' style="padding-left:14px"'}>${esc(x.name)}${flags}</th>
        <td${t.note ? ` title="${esc(t.note)}"` : ''}>${targetText(t)}${t.note ? ' <span class="muted" aria-hidden="true">ⓘ</span>' : ''}</td><td${c()}>${n0(x.committed)}</td><td class="num">${n0(x.total)}${x.pctPeople != null ? `<div class="small muted">${n0(x.people)} people</div>` : ''}</td><td${c()}>${pct(x.pctCommitted)}</td><td class="num">${pctTot}</td><td${c()}>${x.gap == null ? '<span class="muted">' + esc(x.compared === 'people' ? '–' : x.compared) + '</span>' : n0(x.gap)}</td><td class="small">${srcLink(t)}</td></tr>`;
    }).join('');
    return `<section class="pt-tg"><h3 class="sub-title">Plans against their targets</h3>
      <p class="small">Each municipality against the Region's 2051 allocation of growth, and each plan against its published target, compared on <strong>units</strong>: committed (D-5-1) and all proposed. Where a target states only people, pipeline people are shown beside it (†, indicative only: targets use household persons per unit, the pipeline Peel design criteria). "unchecked" marks a figure not yet checked against its document. "total" marks a target that counts every home at build-out, existing ones included, so the pipeline (new proposals only) reads low there.</p>
      <div class="tbl-scroll"><table class="dt pt-table pt-target"><thead><tr><th scope="col">Area</th><th scope="col">Target</th><th scope="col"${c()}>Approved units</th><th scope="col" class="num">Proposed units</th><th scope="col"${c()}>% committed</th><th scope="col" class="num">% of target</th><th scope="col"${c()} title="Target minus all proposed">Gap</th><th scope="col">Source</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="small muted">${fmtNum(v.noTarget)} plan${v.noTarget === 1 ? '' : 's'} shown here have no published target (none is 0; they're left out). Targets: data/plan-targets.json${targets && targets.checked ? `, checked ${esc(targets.checked)}` : ''}; hover a source for its wording, ⓘ for a note. All columns adds committed units, % committed and the gap.</p></section>`;
  }

  // CSV: one row per area (and per development at the leaves), with its path for pivot tables.
  function csvRows(r) {
    const rows = [];
    const walk = (n, path) => {
      const here = path ? `${path}/${n.name}` : n.name, m = n.m;
      const tg = n.areaId && targets && targets.targets ? targets.targets.find(t => t.id === n.areaId) : null;
      rows.push({ path: here, level: n.kind, name: n.name, developments: Math.round(n.n), units_planned: Math.round(m.planned), committed: Math.round(m.committed), proposed: Math.round(m.proposed), permitted: Math.round(m.permitted), completed: Math.round(m.completed), left_to_build: Math.round(m.left), ppu: m.planned > 0 ? +(m.people / m.planned).toFixed(2) : '', people: Math.round(m.people), jobs: Math.round(m.jobs), people_in_mtsa: Math.round(n.mtsa.people), check_units: n.children.length ? Math.round(n.check.planned) : '', check_people: n.children.length ? Math.round(n.check.people) : '', share: '',
        target_units: tg && tg.units ? tg.units : '', target_population: tg && tg.population ? tg.population : '', target_jobs: tg && tg.jobs ? tg.jobs : '', target_density: tg && tg.density ? tg.density : '', target_year: tg && tg.year ? tg.year : '', target_scope: tg ? tg.scope || '' : '', pct_target_proposed: tg && tg.units ? +(m.planned / tg.units).toFixed(3) : '', target_source: tg ? `${tg.source || ''}${tg.page ? `, ${tg.page}` : ''} ${tg.url || ''}`.trim() : '' });
      for (const c of n.children) walk(c, here);
      for (const x of n.devs) {
        const mm = r.mOf ? r.mOf.get(x.p) : r.placed.find(z => z.p === x.p).m, f = x.share;
        rows.push({ path: `${here}/${x.p.title}`, level: 'development', name: x.p.title, developments: 1, units_planned: Math.round(mm.planned * f), committed: Math.round(mm.committed * f), proposed: Math.round(mm.proposed * f), permitted: Math.round(mm.permitted * f), completed: Math.round(mm.completed * f), left_to_build: Math.round(mm.left * f), ppu: mm.planned > 0 ? +(mm.people / mm.planned).toFixed(2) : '', people: Math.round(mm.people * f), jobs: Math.round(mm.jobs * f), people_in_mtsa: inMtsa(x.p) ? Math.round(mm.people * f) : 0, check_units: '', check_people: '', share: +x.share.toFixed(3), target_units: '', target_population: '', target_jobs: '', target_density: '', target_year: '', target_scope: '', pct_target_proposed: '', target_source: '' });
      }
    };
    walk(r.root, '');
    return rows;
  }
  function downloadCSV() {
    const rows = csvRows(compute()); if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const cell = v => /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
    root.PeelExports.download('peel-by-plan.csv', CSV_DISCLAIMER + `# Basis: ${BASIS[DU().demandBasis()] || 'all units'}; grouping: ${App().state.treeGrouped ? 'tree' : 'previous'}\n` + [cols.join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n'), 'text/csv');
  }
  // Workbook sheet "By plan": the same rows.
  function sheetRows() {
    const rows = csvRows(compute()); if (!rows.length) return [['(no developments)']];
    const cols = Object.keys(rows[0]);
    return [cols, ...rows.map(r => cols.map(c => r[c]))];
  }
  // The primary plan of a development (its largest share) and all its shares, for the
  // Developments export.
  function planOf(p) {
    const list = areas(), byId = new Map(list.map(a => [a.id, a]));
    const raw = sharesOf(p) || pointOf(p).map(id => [id, 1]);
    const plans = raw.filter(([id]) => byId.has(id) && byId.get(id).kind !== 'precinct' && byId.get(id).municipality === p.municipality).sort((a, b) => b[1] - a[1]);
    const inner = plans.filter(([id]) => !plans.some(([o]) => byId.get(o).parent === id));
    return { plan: inner.length ? byId.get(inner[0][0]).name : '', shares: plans.map(([id, s]) => `${byId.get(id).name} ${Math.round(s * 100)}%`).join('; ') };
  }

  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const t = e.target.closest('[data-pt-tog],[data-pt-all],[data-pt-dev],[data-pt-filter],[data-pt-csv],[data-pt-wide],[data-pt-empty]'); if (!t) return;
    if (t.hasAttribute('data-pt-empty')) { showEmpty = !showEmpty; render(); return; }
    if (t.hasAttribute('data-pt-wide')) { wide = !wide; if (store) store.set('ptWide', wide); render(); return; }
    if (t.dataset.ptTog) { const id = t.dataset.ptTog; if (open.has(id)) { open.delete(id); open.add(`!${id}`); } else { open.add(id); open.delete(`!${id}`); } render(); }
    else if (t.dataset.ptAll) { all.add(t.dataset.ptAll); render(); }
    else if (t.dataset.ptDev) { const p = root.PeelDevNav.projectByKey(t.dataset.ptDev); if (p) root.PeelDevelopmentsTab.focusProject(p); }
    else if (t.dataset.ptFilter) { App().state.sp = [t.dataset.ptFilter]; if (root.PeelPlanAreas && root.PeelPlanAreas.renderAreaSelects) root.PeelPlanAreas.renderAreaSelects(); App().applyFilters(); }
    else if (t.hasAttribute('data-pt-csv')) downloadCSV();
  });

  // ---- Table 5 (C3): plans by plant or pressure zone ----------------------------------------
  // Rows: each municipality's plans and "Not in a plan" (the Table 1 rows); columns: the plant
  // that receives its wastewater, or its pressure zone (the first, if it has two), plus "none".
  // Cells: people at build-out (units on hover). Row totals equal Table 1, column totals the
  // per-plant (per-zone) sums, the corner Peel.
  let mxMode = (store && store.get('ptMx', 'plant')) === 'zone' ? 'zone' : 'plant';
  const PLANT_ORDER = ['Lakeview', 'Clarkson', 'Inglewood', 'Toronto', 'none'];
  function colOf(p, mode) {
    if (!App().state.servicing) return 'none';
    if (mode === 'zone') { const id = SD().svcIds(p, 'pz')[0]; return id || 'none'; }
    return MM().plantOfDev(p) || 'none';
  }
  function colName(k, mode) {
    if (k === 'none') return mode === 'zone' ? 'No zone' : 'No plant';
    if (mode === 'zone') { const z = SD().svcById.get(k); return z ? String(z.name).replace(/^Pressure zone/i, 'Zone') : k; }
    return (SD().PLANT_SHORT && SD().PLANT_SHORT[k]) || k;
  }
  function matrixData(r, mode) {
    const mx = R().matrix(r, p => colOf(p, mode));
    const keys = [...mx.cols.keys()];
    keys.sort((a, b) => mode === 'plant' ? (PLANT_ORDER.indexOf(a) + 1 || 9) - (PLANT_ORDER.indexOf(b) + 1 || 9) : (a === 'none') - (b === 'none') || colName(a, mode).localeCompare(colName(b, mode), undefined, { numeric: true }));
    return { ...mx, keys };
  }
  function matrixHTML(r) {
    const mode = mxMode, mx = matrixData(r, mode), keys = mx.keys;
    const byMuni = new Map(); for (const row of mx.rows) (byMuni.get(row.muni) || byMuni.set(row.muni, []).get(row.muni)).push(row);
    const cellBtn = (row, k, c) => c && c.people >= 0.5 ? `<button type="button" class="btn small link" data-mx-cell="${esc(row ? row.node.areaId || '' : '')}" data-mx-col="${esc(k)}" title="${n0(c.planned)} units">${n0(c.people)}</button>` : '<span class="muted">–</span>';
    const head = `<tr><th scope="col">Plan</th>${keys.map(k => `<th scope="col" class="num"><button type="button" class="btn small link" data-mx-col="${esc(k)}" data-mx-cell="">${esc(colName(k, mode))}</button></th>`).join('')}<th scope="col" class="num">Total</th></tr>`;
    const rows = [];
    for (const [muni, list] of byMuni) {
      const tot = new Map(); let all = 0;
      for (const row of list) { for (const [k, c] of row.cells) tot.set(k, (tot.get(k) || 0) + c.people); all += row.people; }
      rows.push(`<tr class="pt-municipality"><th scope="row">${esc(muni)}</th>${keys.map(k => `<td class="num">${tot.get(k) ? n0(tot.get(k)) : '–'}</td>`).join('')}<td class="num"><strong>${n0(all)}</strong></td></tr>`);
      for (const row of list) rows.push(`<tr class="pt-${row.node.kind}"><th scope="row" style="padding-left:14px">${row.node.areaId ? `<button type="button" class="btn small link" data-mx-cell="${esc(row.node.areaId)}" data-mx-col="">${esc(row.node.name)}</button>` : esc(row.node.name)}</th>${keys.map(k => `<td class="num">${cellBtn(row, k, row.cells.get(k))}</td>`).join('')}<td class="num">${n0(row.people)}</td></tr>`);
    }
    const colSum = keys.reduce((t, k) => t + mx.cols.get(k).people, 0);
    const ok = Math.abs(colSum - r.root.m.people) < 0.5 && mx.rows.every(row => Math.abs(row.people - row.node.m.people) < 0.5);
    rows.push(`<tr class="pt-peel"><th scope="row">Peel</th>${keys.map(k => `<td class="num"><strong>${n0(mx.cols.get(k).people)}</strong></td>`).join('')}<td class="num"><strong>${n0(r.root.m.people)}</strong> <span class="${ok ? 'ok' : 'warn'}" title="${ok ? 'Rows equal Table 1; columns add up to Peel' : 'Totals differ'}">${ok ? '✓' : '≠'}</span></td></tr>`);
    const twoZones = mode === 'zone' ? r.placed.filter(x => App().state.servicing && SD().svcIds(x.p, 'pz').length > 1).length : 0;
    return `<section class="pt-mx"><h3 class="sub-title">Plans by ${mode === 'zone' ? 'pressure zone' : 'wastewater plant'}</h3>
      <p class="small">People at build-out by plan and by the ${mode === 'zone' ? 'water pressure zone' : 'plant that receives the wastewater'} (units on hover). Pick a cell to filter the map and every tab to that plan and ${mode === 'zone' ? 'zone' : 'plant'}.
        <span role="group" aria-label="Columns"><button type="button" class="btn small${mode === 'plant' ? ' on' : ''}" data-mx-mode="plant" aria-pressed="${mode === 'plant'}">Plants</button><button type="button" class="btn small${mode === 'zone' ? ' on' : ''}" data-mx-mode="zone" aria-pressed="${mode === 'zone'}">Pressure zones</button></span></p>
      <div class="tbl-scroll"><table class="dt pt-table pt-matrix"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>
      <p class="small muted">Pipeline people at Peel design criteria (the Overview's). The plant capacity tables use census-relative layers: see Wastewater › Plants.${twoZones ? ` ${fmtNum(twoZones)} development${twoZones === 1 ? '' : 's'} in two zones counted in the first.` : ''}</p></section>`;
  }
  // Workbook: both matrices.
  function matrixSheetRows() {
    const r = compute(), out = [];
    for (const mode of ['plant', 'zone']) {
      const mx = matrixData(r, mode);
      if (out.length) out.push([]);
      out.push([`People at build-out by plan and ${mode === 'zone' ? 'pressure zone' : 'wastewater plant'}`]);
      out.push(['Municipality', 'Plan', ...mx.keys.map(k => colName(k, mode)), 'Total']);
      for (const row of mx.rows) out.push([row.muni, row.node.name, ...mx.keys.map(k => Math.round((row.cells.get(k) || { people: 0 }).people)), Math.round(row.people)]);
      out.push(['Peel', '', ...mx.keys.map(k => Math.round(mx.cols.get(k).people)), Math.round(r.root.m.people)]);
    }
    return out;
  }
  if (typeof document !== 'undefined') document.addEventListener('click', e => {
    const m = e.target.closest('[data-mx-mode]');
    if (m) { mxMode = m.dataset.mxMode === 'zone' ? 'zone' : 'plant'; if (store) store.set('ptMx', mxMode); render(); return; }
    const c = e.target.closest('[data-mx-cell]'); if (!c) return;
    const st = App().state, plan = c.dataset.mxCell, col = c.dataset.mxCol;
    st.sp = plan ? [plan] : [];
    if (mxMode === 'zone') { st.pz = col && col !== 'none' ? [col] : []; } else st.plant = col && col !== 'none' ? col : '';
    if (root.PeelPlanAreas && root.PeelPlanAreas.renderAreaSelects) root.PeelPlanAreas.renderAreaSelects();
    App().applyFilters();
  });

  const api = { loadTargets, setTargets: d => { targets = d; }, targetHTML, render, compute, csvRows, sheetRows, planOf, downloadCSV, areas, matrixHTML, matrixSheetRows, matrixData };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPlanTables = api;
})(typeof window !== 'undefined' ? window : globalThis);
