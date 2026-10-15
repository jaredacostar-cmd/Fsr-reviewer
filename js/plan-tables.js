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
      measure: p => {
        const t = G().pipelineTotals([p]), e = D().estimate([p], crit, basis, App().jobsOf), c = D().isCommitted(p) ? t.planned : 0;
        return { planned: t.planned, committed: c, proposed: t.planned - c, permitted: t.permitted, completed: t.completed, left: t.left, people: e.population, jobs: e.employment ? e.employment.jobs : 0 };
      },
    });
    r.mOf = new Map(r.placed.map(x => [x.p, x.m]));
    cache = { set: set.length, first: set[0], basis, crit, tree: App().state.treeGrouped, areas: areas().length, r };
    return r;
  }

  const n0 = v => fmtNum(Math.round(v));
  const BASIS = { all: 'all units', committed: 'committed units', remaining: 'units left to build' };
  const KIND = { subplan: 'sub-area', precinct: 'precinct' };
  function checkCell(n) {
    if (!n.children.length) return '<td class="num muted">–</td>';
    const ok = Math.abs(n.check.planned) < 0.5 && Math.abs(n.check.people) < 0.5;
    return ok ? '<td class="num ok" title="Equals the sum of the rows under it">✓</td>' : `<td class="num warn" title="Differs from the sum of the rows under it">${n0(n.check.planned)} units · ${n0(n.check.people)} people</td>`;
  }
  function rowHTML(n, depth) {
    const m = n.m, has = n.children.length || n.devs.length, isOpen = open.has(n.id);
    const ppu = m.planned > 0 ? (m.people / m.planned).toFixed(2) : '–';
    const tog = has ? `<button type="button" class="btn small link pt-tog" data-pt-tog="${esc(n.id)}" aria-expanded="${isOpen}">${isOpen ? '▾' : '▸'}</button>` : '<span class="pt-sp"></span>';
    const filt = n.areaId && n.kind !== 'precinct' && n.kind !== 'subplan' ? ` <button type="button" class="btn small link" data-pt-filter="${esc(n.areaId)}" title="Filter the map and every tab to this plan">filter</button>` : '';
    return `<tr class="pt-row pt-${n.kind}" data-depth="${depth}"><th scope="row" style="padding-left:${depth * 14}px">${tog}${esc(n.name)}${KIND[n.kind] ? ` <span class="muted small">${KIND[n.kind]}</span>` : ''}${filt}</th>
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
  function bodyRows(n, depth, out) {
    out.push(rowHTML(n, depth));
    if (!open.has(n.id)) return;
    for (const c of n.children) bodyRows(c, depth + 1, out);
    const devs = all.has(n.id) ? n.devs : n.devs.slice(0, 10);
    for (const x of devs) out.push(devRowHTML(x, depth + 1));
    if (n.devs.length > devs.length) out.push(`<tr class="pt-more"><td colspan="11" style="padding-left:${(depth + 1) * 14 + 18}px"><button type="button" class="btn small link" data-pt-all="${esc(n.id)}">See all ${fmtNum(n.devs.length)} developments</button></td></tr>`);
  }
  function tableHTML(r) {
    const x = (t, title) => `<th scope="col"${c('x')}${title ? ` title="${title}"` : ''}>${t}</th>`;
    const head = `<tr><th scope="col">Area</th>${x('Developments')}<th scope="col" class="num">Units</th>${x('Committed')}${x('Proposed')}${x('Left to build')}${x('ppu', 'People per unit (people ÷ units)')}<th scope="col" class="num">People</th>${x('Jobs')}${x('In an MTSA', 'Of which in an MTSA (an overlay: never added up)')}<th scope="col" class="num" title="Parent minus the sum of the rows under it">Check</th></tr>`;
    const rows = []; bodyRows(r.root, 0, rows);
    return `<div class="tbl-scroll"><table class="dt pt-table"><thead>${head}</thead><tbody>${rows.join('')}</tbody></table></div>`;
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
    body.innerHTML = `<div class="pt-head"><p class="small">The developments shown, by where they are: Peel, municipality, plan, sub-area. People at Peel design criteria, counting ${esc(BASIS[basis] || 'all units')} (the Overview's basis). Every row equals the sum of the rows under it (Check).${App().state.treeGrouped ? ' Grouping: tree.' : ' Grouping: previous (Settings › Counting).'}</p>
        <p><button type="button" class="btn small" data-pt-wide aria-pressed="${wide}">${wide ? 'Fewer columns' : 'All columns'}</button> <button type="button" class="btn small" data-pt-csv>Download CSV</button></p></div>
      ${tableHTML(r)}${notesHTML(r)}
      ${root.PeelPlanTables.matrixHTML ? root.PeelPlanTables.matrixHTML(r) : ''}`;
  }

  // CSV: one row per area (and per development at the leaves), with its path for pivot tables.
  function csvRows(r) {
    const rows = [];
    const walk = (n, path) => {
      const here = path ? `${path}/${n.name}` : n.name, m = n.m;
      rows.push({ path: here, level: n.kind, name: n.name, developments: Math.round(n.n), units_planned: Math.round(m.planned), committed: Math.round(m.committed), proposed: Math.round(m.proposed), permitted: Math.round(m.permitted), completed: Math.round(m.completed), left_to_build: Math.round(m.left), ppu: m.planned > 0 ? +(m.people / m.planned).toFixed(2) : '', people: Math.round(m.people), jobs: Math.round(m.jobs), people_in_mtsa: Math.round(n.mtsa.people), check_units: n.children.length ? Math.round(n.check.planned) : '', check_people: n.children.length ? Math.round(n.check.people) : '', share: '' });
      for (const c of n.children) walk(c, here);
      for (const x of n.devs) {
        const mm = r.mOf ? r.mOf.get(x.p) : r.placed.find(z => z.p === x.p).m, f = x.share;
        rows.push({ path: `${here}/${x.p.title}`, level: 'development', name: x.p.title, developments: 1, units_planned: Math.round(mm.planned * f), committed: Math.round(mm.committed * f), proposed: Math.round(mm.proposed * f), permitted: Math.round(mm.permitted * f), completed: Math.round(mm.completed * f), left_to_build: Math.round(mm.left * f), ppu: mm.planned > 0 ? +(mm.people / mm.planned).toFixed(2) : '', people: Math.round(mm.people * f), jobs: Math.round(mm.jobs * f), people_in_mtsa: inMtsa(x.p) ? Math.round(mm.people * f) : 0, check_units: '', check_people: '', share: +x.share.toFixed(3) });
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
    const t = e.target.closest('[data-pt-tog],[data-pt-all],[data-pt-dev],[data-pt-filter],[data-pt-csv],[data-pt-wide]'); if (!t) return;
    if (t.hasAttribute('data-pt-wide')) { wide = !wide; if (store) store.set('ptWide', wide); render(); return; }
    if (t.dataset.ptTog) { const id = t.dataset.ptTog; if (open.has(id)) { open.delete(id); open.add(`!${id}`); } else { open.add(id); open.delete(`!${id}`); } render(); }
    else if (t.dataset.ptAll) { all.add(t.dataset.ptAll); render(); }
    else if (t.dataset.ptDev) { const p = root.PeelDevNav.projectByKey(t.dataset.ptDev); if (p) root.PeelDevelopmentsTab.focusProject(p); }
    else if (t.dataset.ptFilter) { App().state.sp = [t.dataset.ptFilter]; if (root.PeelPlanAreas && root.PeelPlanAreas.renderAreaSelects) root.PeelPlanAreas.renderAreaSelects(); App().applyFilters(); }
    else if (t.hasAttribute('data-pt-csv')) downloadCSV();
  });

  const api = { render, compute, csvRows, sheetRows, planOf, downloadCSV, areas };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelPlanTables = api;
})(typeof window !== 'undefined' ? window : globalThis);
