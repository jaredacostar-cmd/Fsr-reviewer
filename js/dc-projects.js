/* Peel Growth Pipeline (unofficial) – Capital › DC projects: what each DC project affects.
 *
 * Every project on the 2026 DC capital maps, with the developments that rely on it
 * (js/dc-impact.js): those that need it to connect (A), those that drain through a sewer it relieves
 * that runs short (B1, "needs it for capacity") and those on its path whose sewer has room (B2, shown,
 * not counted). A row opens the project: its developments by tier, their first homes against its
 * construction year, and, while the Funding lab is on (never in the public version), its DC cost,
 * where it falls in the funding screen and the DCs of the developments that rely on it.
 * The panel is 'dca:dcproj' (the map's Capital tab and the Capital workspace's DC projects section);
 * #dca-dcproj-body holds the full table.
 */
(function (root) {
  'use strict';
  const U = root.PeelUtil;
  const { esc, fmtNum, fmtMoney, store, CAPITAL } = U;
  const DI = () => root.PeelDcImpact, PN = () => root.PeelPanel, MP = () => root.PeelMasterPlan, DC = () => root.PeelDcCost;
  const DIF = () => root.PeelDcInfra, MM = () => root.PeelMapMarkers, SC = () => root.PeelSewerCap, App = () => root.PeelApp;

  const S = { sel: store.get('dcProjSel', null), sys: store.get('dcProjSys', 'wastewater'), sort: store.get('dcProjSort', 'affected') };
  const SYS = { wastewater: 'Wastewater', water: 'Water', both: 'Both' };
  const TIER = { A: 'Needs it to connect', B1: 'Needs it for capacity', B2: 'On its path, not needed' };
  const funding = () => !!(root.PeelLabs && root.PeelLabs.on('funding') && !(U.isPublic && U.isPublic()));

  // ---- From the model ------------------------------------------------------------------------------
  const counted = (m, pr) => pr.devs.filter(x => m.gateTiers.includes(x.tier));
  const label = pr => DC().projLabels({ k: pr.k, d: pr.d, id: pr.key });
  const yrs = pr => (pr.y0 == null ? 'year not labelled' : pr.y0 === pr.y1 ? String(pr.y1) : `${pr.y0}–${pr.y1}`);
  const unitsOf = rows => rows.reduce((t, x) => t + x.units, 0);
  // Funding screen (the Funding lab's budget): committed, within, outside, or after its window.
  function screens() {
    const out = new Map(), B = DC().dcaBudget(DC().DCB.budget, DC().DCB.years);
    for (const r of B.keep) out.set(r.key, r.committed ? 'Committed' : 'Within');
    for (const r of B.defer) out.set(r.key, 'Outside');
    for (const r of B.later || []) out.set(r.key, `After ${B.end}`);
    return out;
  }
  const screenOf = (sc, pr) => sc.get(`ln:${pr.sys}:${pr.key}`) || 'Not screened';
  const SCREEN_TONE = { Committed: 'room', Within: 'room', Outside: 'over', 'Not screened': 'stage' };
  // DCs of the developments relying on a project: its system's share of the water + wastewater rate.
  function revenueOf(pr, rows) {
    const R = DC().dcRates(); if (!R) return null;
    const share = (pr.sys === 'wastewater' ? R.wastewater : R.water) / (R.wastewater + R.water);
    return rows.reduce((t, x) => { const v = DC().dcRevenue(x.e); return t + (v ? v.total * share : 0); }, 0);
  }

  function rowsFor(m) {
    const list = [...m.projects.values()].filter(pr => S.sys === 'both' || pr.sys === S.sys).map(pr => {
      const c = counted(m, pr);
      return { pr, c, units: unitsOf(c), perUnit: pr.cost && unitsOf(c) ? pr.cost / unitsOf(c) : null };
    });
    const sorts = { affected: (a, b) => b.units - a.units || b.pr.devs.length - a.pr.devs.length, soonest: (a, b) => (a.pr.y1 || 9999) - (b.pr.y1 || 9999) || b.units - a.units,
      perunit: (a, b) => (a.perUnit ?? Infinity) - (b.perUnit ?? Infinity) };
    return list.sort(sorts[S.sort] || sorts.affected);
  }

  // ---- Panels ---------------------------------------------------------------------------------------
  const seg = (attr, cur, opts) => `<div class="seg" role="group">${opts.map(([k, t]) => `<button type="button" class="btn small${cur === k ? ' on' : ''}" data-${attr}="${k}" aria-pressed="${cur === k}">${t}</button>`).join('')}</div>`;
  const loadingSpec = what => ({ head: PN().areaHead('Capital › DC projects', 'What does each DC project affect?', null, 'Peel'), answer: `<span class="muted">${esc(what)}</span>` });

  function listSpec(m) {
    const all = [...m.projects.values()], withDev = all.filter(pr => counted(m, pr).length), gapP = all.filter(pr => pr.gaps);
    const fl = funding(), sc = fl ? screens() : null, ns = fl ? withDev.filter(pr => screenOf(sc, pr) === 'Not screened') : [];
    const rows = rowsFor(m);
    const row = ({ pr, c, units, perUnit }) => {
      const l = label(pr), scr = sc && screenOf(sc, pr);
      return { tone: pr.gaps ? 'over' : null, attrs: { 'data-dcproj-open': `${pr.sys}:${pr.key}` },
        html: `<div class="pnl-r-top"><span class="pnl-r-name">${pr.sys === 'water' ? '💧 ' : ''}${esc(l.short)}<small>project ${esc(pr.key)} · construction ${esc(yrs(pr))}${pr.status === 'approved' ? ' · approved 2026' : ''}</small></span><span class="pnl-r-fig">${fmtNum(Math.round(units))}<small>units · ${fmtNum(c.length)} dev.</small></span></div>
          <small class="pnl-r-line">${pr.gaps ? `<span class="t-over">${fmtNum(pr.gaps)} expected before it is built</span>` : c.length ? 'in time for the developments relying on it' : 'no development in the pipeline relies on it'}${fl ? ` · DC cost ${pr.cost ? fmtMoney(pr.cost) : 'not costed'}${perUnit ? ` (${fmtMoney(perUnit)} a unit)` : ''} · ${esc(scr)}` : ''}</small>` };
    };
    const tools = `${seg('dcproj-sys', S.sys, [['wastewater', 'Wastewater'], ['water', 'Water'], ['both', 'Both']])}${seg('dcproj-sort', S.sort, [['affected', 'Most affected'], ['soonest', 'Soonest'], ...(fl ? [['perunit', '$ a unit']] : [])])}`;
    return {
      calc: true, fullTitle: 'Capital › DC projects · Peel: every DC project and the developments relying on it',
      head: PN().areaHead('Capital › DC projects', 'What does each DC project affect?', gapP.length ? { tone: 'over', text: `${gapP.length} with a timing gap` } : null, `Peel · ${fmtNum(all.length)} DC projects · 2026 DC capital maps (draft, as of ${esc(CAPITAL.asOf)})`),
      answer: `<strong>${fmtNum(withDev.length)}</strong> of the ${fmtNum(all.length)} DC projects have developments in the pipeline relying on them: they need the project to connect, or drain through a sewer it relieves that runs short. <strong>${fmtNum(gapP.length)}</strong> have developments expected before they are built.${fl && ns.length ? ` <strong>${fmtNum(ns.length)}</strong> of them are not in the funding screen.` : ''}`,
      figures: [
        { v: fmtNum(all.length), u: 'projects', label: 'DC projects', ctx: `${fmtNum(all.filter(p => p.sys === 'wastewater').length)} wastewater · ${fmtNum(all.filter(p => p.sys === 'water').length)} water` },
        { v: fmtNum(withDev.length), u: '', label: 'relied on', ctx: 'by developments in the pipeline' },
        { v: fmtNum(gapP.length), u: '', label: 'with a timing gap', ctx: 'first homes before the project is built', tone: gapP.length ? 'over' : null, attrs: { 'data-full-table': 'dca' } },
        ...(fl ? [{ v: fmtNum(ns.length), u: '', label: 'not in the funding screen', ctx: 'relied on, but no constraint or connector puts them in it', tone: ns.length ? 'tight' : null }] : []),
      ],
      lists: [{ title: `${SYS[S.sys]} projects`, tools, rows: rows.slice(0, 8).map(row), total: rows.length, seeAll: { 'data-full-table': 'dca' } }],
      folds: fl ? [fundingFold()] : [],
      method: 'Developments in the pipeline (approved or proposed) allocated to the 2026 DC works they rely on: needs it to connect (off the existing sewers, its route runs along the planned main; water: outside the mapped zones, the planned main within 1 km), or needs it for capacity (it drains through an existing sewer the project relieves, and that sewer runs short, as the DC main’s panel rates it). Developments on its path whose sewer has room are listed, not counted. A timing gap: the forecast’s first homes come before the latest construction year of the projects a development relies on (docs/dc-impact/ALLOCATION.md).',
      sources: `2026 DC capital maps (draft, as of ${esc(CAPITAL.asOf)}); Region sanitary sewers; the municipal application records; the Growth forecast.`,
      foot: { primary: { label: 'CSV: every project', attrs: { 'data-dcproj-csv': 'all' } } },
    };
  }

  // The Funding lab's screen (was Capital › Funding): its answer, figures and chart; the screening results
  // and the funding levels are in the full table (#dca-rec-body, #dca-funding-body).
  function fundingFold() {
    const fs = root.PeelDcaTab && root.PeelDcaTab.fundingSpec && root.PeelDcaTab.fundingSpec();
    if (!fs) return { title: 'Funding screen (Labs)', html: '<p class="small muted">Loading the funding screen…</p>' };
    const kv = f => PN().kv(`${f.label}${f.ctx ? ` <small>${f.ctx}</small>` : ''}`, `${f.v}${f.u ? ` ${f.u}` : ''}`, f.tone).html;
    return { title: 'Funding screen (Labs)', open: true, html: `<p class="small">${fs.answer}</p>${(fs.figures || []).map(kv).join('')}${fs.chart || ''}
      <p class="small"><button type="button" class="btn small link" data-full-table="dca">Screening results and funding levels ›</button></p>` };
  }
  function projectSpec(m, pr) {
    const l = label(pr), fl = funding(), c = counted(m, pr), first = x => { const r = m.byDev.get(x.p.key); return r ? r.first : null; };
    const by = t => pr.devs.filter(x => x.tier === t).sort((a, b) => b.q - a.q);
    const unit = pr.sys === 'wastewater' ? 'L/s peak wet' : 'L/s max day', q = c.reduce((t, x) => t + x.q, 0);
    const devRow = x => {
      const f = first(x), gap = f && pr.y1 && f < pr.y1 && m.gateTiers.includes(x.tier);
      const how = x.tier === 'A' ? `${x.how.joinM != null ? `${fmtNum(Math.round(x.how.joinM))} m from it` : ''}${x.how.km ? ` · ${x.how.km.toFixed(1)} km along planned mains` : ''}` : x.how.mm ? `joins a ${x.how.mm} mm sewer upstream` : '';
      return { tone: gap ? 'over' : null, attrs: { 'data-pnl-dev': x.p.key },
        html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}<small>${esc(x.p.municipality)}${how ? ` · ${esc(how)}` : ''}</small></span><span class="pnl-r-fig">${x.units >= 0.5 || !(x.e.employment.jobs > 0) ? `${fmtNum(Math.round(x.units))}<small>units</small>` : `${fmtNum(Math.round(x.e.employment.jobs))}<small>jobs</small>`}</span></div>
          <small class="pnl-r-line">${f ? (gap ? `<span class="t-over">first homes ≈${f}, before it is built (${pr.y1})</span>` : `first homes ≈${f}`) : 'no forecast year'} · ${x.q.toFixed(1)} ${unit}</small>` };
    };
    const tiers = ['A', 'B1', 'B2'].map(t => ({ t, rows: by(t) })).filter(g => g.rows.length);
    const lists = tiers.map(g => ({ title: `${TIER[g.t]}${g.t === 'B1' && pr.relieves ? ` (${pr.relieves.name})` : ''}`, rows: g.rows.slice(0, 6).map(devRow), total: g.rows.length, seeAll: { 'data-full-table': 'dca' } }));
    let fund = '';
    if (fl) {
      const sc = screens(), scr = screenOf(sc, pr), rev = revenueOf(pr, c), gapRev = revenueOf(pr, c.filter(x => { const f = first(x); return f && pr.y1 && f < pr.y1; }));
      const kv = (k, v) => PN().kv(k, v).html;
      fund = [kv('DC cost (2026$, DC-recoverable)', `${pr.cost ? fmtMoney(pr.cost) : 'not costed'}${pr.costEst > 0 ? ` <small>${Math.round(pr.costEst * 100)}% estimated</small>` : ''}`),
        kv(`Funding screen (${fmtMoney(DC().DCB.budget)}, ${DC().DCB.years} years)`, PN().chip({ tone: SCREEN_TONE[scr] || 'tight', text: scr })),
        rev != null ? kv(`${pr.sys === 'wastewater' ? 'Wastewater' : 'Water'} DCs of the developments relying on it`, `≈${fmtMoney(rev)}${pr.cost ? ` <small>${(rev / pr.cost).toFixed(1)}× its DC cost</small>` : ''}`) : '',
        gapRev ? kv('Of which, developments expected before it is built', `≈${fmtMoney(gapRev)}`) : '',
        pr.cost && unitsOf(c) ? kv('DC cost per unit relying on it', fmtMoney(pr.cost / unitsOf(c))) : ''].join('') + `<p class="small muted">${scr === 'Not screened' ? 'No capacity constraint or connector puts it in the funding screen. ' : ''}DCs go into Region-wide reserves, not to one project: this compares projects; it is not a funding source. Residential rates, before credits and exemptions.</p>`;
    }
    const ctx = [pr.built ? `${fmtNum(pr.built)} developments built since the census (≈${fmtNum(Math.round(pr.builtUnits))} units) already ${pr.sys === 'wastewater' ? 'drain through or connect to it' : 'connect to it'}` : '',
      pr.shed ? `${fmtNum(pr.shed)} more in the ${pr.sys === 'wastewater' ? 'sewershed it serves (the catchment and those upstream), not on its path' : 'pressure zone it serves'}: context, not counted` : ''].filter(Boolean);
    return {
      calc: true, fullTitle: `${l.short} · ${pr.key}: the developments relying on it`,
      head: { trail: [{ label: 'Peel' }, { label: 'Capital › DC projects', attrs: { 'data-dcproj-back': '' } }, { label: pr.key }], close: { 'data-dcproj-back': '' },
        name: `${l.short} · ${pr.key}`, wsName: `${l.short} · ${pr.key}`, back: { label: 'All DC projects', attrs: { 'data-dcproj-back': '' } }, status: pr.gaps ? { tone: 'over', text: `${fmtNum(pr.gaps)} before it is built` } : c.length ? { tone: 'room', text: 'In time' } : null,
        identity: `${pr.sys === 'wastewater' ? 'Wastewater' : 'Water'} · construction ${esc(yrs(pr))} · ${fmtNum(Math.round(pr.lenM / 10) * 10)} m · ${pr.status === 'approved' ? 'approved 2026' : 'proposed'} · 2026 DC capital map (draft)` },
      answer: c.length ? `<strong>${fmtNum(c.length)} development${c.length === 1 ? '' : 's'}</strong> (≈${fmtNum(Math.round(unitsOf(c)))} units, ≈${fmtNum(Math.round(q))} ${unit}) rely on it${pr.gaps ? `; <strong>${fmtNum(pr.gaps)}</strong> ${pr.gaps === 1 ? 'is' : 'are'} expected before it is built in ${pr.y1}` : pr.y1 ? `, all expected after it is built in ${pr.y1}` : ''}.${by('B2').length ? ` ${fmtNum(by('B2').length)} more are on its path, but the sewer it relieves has room for them.` : ''}`
        : by('B2').length ? `No development needs it for capacity: the sewer it relieves has room for the ${fmtNum(by('B2').length)} on its path.` : 'No development in the pipeline relies on it.',
      figures: [
        { v: fmtNum(c.length), u: '', label: 'developments relying on it', ctx: `${fmtNum(by('A').length)} to connect · ${fmtNum(by('B1').length)} for capacity` },
        { v: fmtNum(Math.round(unitsOf(c))), u: 'units', label: 'in the pipeline', ctx: `≈${fmtNum(Math.round(c.reduce((t, x) => t + x.pop, 0)))} people + jobs` },
        { v: fmtNum(Math.round(q)), u: 'L/s', label: pr.sys === 'wastewater' ? 'peak wet weather' : 'max day', ctx: 'added by them, Peel criteria' },
        { v: fmtNum(pr.gaps), u: '', label: 'expected before it is built', ctx: pr.y1 ? `first homes before ${pr.y1}` : 'no construction year on the map', tone: pr.gaps ? 'over' : null },
      ],
      lists: [...lists, ...(ctx.length ? [{ title: 'Context', rows: ctx.map(t => ({ html: `<small class="pnl-r-line">${esc(t)}</small>` })) }] : [])],
      folds: fl ? [{ title: 'Funding (Labs)', html: fund, open: true }] : [],
      method: 'Needs it to connect: off the existing sewers, the development’s route to one runs along this main (water: outside the mapped zones, this is the planned main within 1 km). Needs it for capacity: it drains through an existing sewer this project relieves, and that sewer runs short (the DC main panel’s rating). On its path, not needed: the sewer has room. First homes: the Growth forecast’s first year with homes. Peak flows at Peel design criteria.',
      sources: `2026 DC capital maps (draft, as of ${esc(CAPITAL.asOf)}); Region sanitary sewers; the municipal application records; 2020 DC Background Study costs indexed to 2026$.`,
      foot: { primary: { label: 'Show on the map', attrs: { 'data-dcproj-map': `${pr.sys}:${pr.key}` } }, secondary: [{ label: 'CSV: its developments', attrs: { 'data-dcproj-csv': `${pr.sys}:${pr.key}` } }] },
    };
  }

  // ---- Full table ---------------------------------------------------------------------------------
  function fullHTML(m) {
    const fl = funding();
    if (S.sel && m.projects.get(S.sel)) {
      const pr = m.projects.get(S.sel), unit = pr.sys === 'wastewater' ? 'Peak wet (L/s)' : 'Max day (L/s)';
      const rows = pr.devs.slice().sort((a, b) => a.tier.localeCompare(b.tier) || b.q - a.q);
      return `<p><button type="button" class="btn small link" data-dcproj-back>‹ All DC projects</button></p>
        <table class="dt"><caption>${fmtNum(rows.length)} developments on ${esc(label(pr).short)} · ${esc(pr.key)}</caption><thead><tr><th>Development</th><th>How</th><th>Units</th><th>${unit}</th><th>First homes</th>${fl ? '<th>Cost share</th>' : ''}</tr></thead>
        <tbody>${rows.map(x => { const r = m.byDev.get(x.p.key), f = r && r.first, gap = f && pr.y1 && f < pr.y1 && m.gateTiers.includes(x.tier);
          return `<tr class="ld-row" data-pnl-dev="${esc(x.p.key)}" tabindex="0"><td>${esc(x.p.title)}<small>${esc(x.p.municipality)}</small></td><td>${esc(TIER[x.tier])}</td><td>${fmtNum(Math.round(x.units))}</td><td>${x.q.toFixed(1)}</td><td${gap ? ' class="t-over"' : ''}>${f || '–'}${gap ? ` (before ${pr.y1})` : ''}</td>${fl ? `<td>${x.share ? fmtMoney(x.share) : '–'}</td>` : ''}</tr>`; }).join('')}</tbody></table>`;
    }
    const sc = fl ? screens() : null, rows = rowsFor(m);
    return `<table class="dt"><caption>${fmtNum(rows.length)} ${esc(SYS[S.sys].toLowerCase())} DC projects</caption><thead><tr><th>Project</th><th>Construction</th><th>To connect</th><th>For capacity</th><th>On path, not needed</th><th>Units relying</th><th>Before it is built</th>${fl ? '<th>DC cost</th><th>$ a unit</th><th>Funding screen</th>' : ''}</tr></thead>
      <tbody>${rows.map(({ pr, units, perUnit }) => `<tr class="ld-row" data-dcproj-open="${esc(`${pr.sys}:${pr.key}`)}" tabindex="0"><td>${esc(label(pr).short)}<small>${esc(pr.key)}</small></td><td>${esc(yrs(pr))}</td><td>${pr.devs.filter(x => x.tier === 'A').length}</td><td>${pr.devs.filter(x => x.tier === 'B1').length}</td><td>${pr.devs.filter(x => x.tier === 'B2').length}</td><td>${fmtNum(Math.round(units))}</td><td${pr.gaps ? ' class="t-over"' : ''}>${pr.gaps}</td>${fl ? `<td>${pr.cost ? fmtMoney(pr.cost) : '–'}</td><td>${perUnit ? fmtMoney(perUnit) : '–'}</td><td>${esc(screenOf(sc, pr))}</td>` : ''}</tr>`).join('')}</tbody></table>`;
  }

  // ---- Render and actions ----------------------------------------------------------------------------
  // The panel for the current state: a project, the list, or loading (the sewers are fetched once).
  function panelSpec() {
    if (!DI() || !PN()) return null;
    const m = DI().model();
    if (!m) {
      if (MM() && MM().SEW && !MM().SEW.data && SC()) SC().loadSewers().then(d => { if (d) refresh(); });
      return loadingSpec('Loading the DC program, the sewers and the servicing model…');
    }
    const pr = S.sel && m.projects.get(S.sel);
    return pr ? projectSpec(m, pr) : listSpec(m);
  }
  function render() {
    const spec = panelSpec(); if (!spec) return;
    PN().set('dca:dcproj', spec);
    const body = typeof document !== 'undefined' && document.getElementById('dca-dcproj-body'), m = DI().model();
    if (body) body.innerHTML = m ? fullHTML(m) : '';
  }
  function refresh() {
    render();
    const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.renderPage) W.renderPage(true);
  }
  const setS = (k, v) => { S[k] = v; store.set({ sel: 'dcProjSel', sys: 'dcProjSys', sort: 'dcProjSort' }[k], v); refresh(); };
  function csv(which) {
    const m = DI().model(); if (!m || !root.PeelExports) return;
    const q = v => U.csvCell(v, true), out = [];
    if (which === 'all') {
      out.push(['Project', 'System', 'Kind', 'Diameter (mm)', 'Construction from', 'Construction to', 'Needs it to connect', 'Needs it for capacity', 'On its path, not needed', 'Units relying', 'Expected before it is built', 'DC cost 2026$']);
      for (const pr of m.projects.values()) { const c = counted(m, pr); out.push([pr.key, pr.sys, pr.k, pr.d || '', pr.y0 || '', pr.y1 || '', pr.devs.filter(x => x.tier === 'A').length, pr.devs.filter(x => x.tier === 'B1').length, pr.devs.filter(x => x.tier === 'B2').length, Math.round(unitsOf(c)), pr.gaps, pr.cost ? Math.round(pr.cost) : '']); }
    } else {
      const pr = m.projects.get(which); if (!pr) return;
      out.push(['Development', 'Municipality', 'Tier', 'Units', 'Flow (L/s)', 'First homes', `Before ${pr.y1 || '–'}`, 'Cost share 2026$']);
      for (const x of pr.devs) { const r = m.byDev.get(x.p.key), f = r && r.first; out.push([x.p.title, x.p.municipality, TIER[x.tier], Math.round(x.units), x.q.toFixed(2), f || '', f && pr.y1 && f < pr.y1 ? 'yes' : '', x.share ? Math.round(x.share) : '']); }
    }
    root.PeelExports.download(`peel-dc-projects-${which === 'all' ? 'all' : which.replace(':', '-')}-${new Date().toISOString().slice(0, 10)}.csv`, (U.CSV_DISCLAIMER || '') + out.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  }
  function showOnMap(key) {
    const m = DI().model(), pr = m && m.projects.get(key); if (!pr) return;
    const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.setMode) W.setMode('full');
    if (!MM().getDcOn().on && root.PeelMapAnalysis) root.PeelMapAnalysis.setDcOn({ on: true, sys: 'both' });
    MP().showDcLine(pr.lines[0]);
    const map = root.PeelMapCore && root.PeelMapCore.map;
    if (map && root.L) map.fitBounds(root.L.latLngBounds(pr.lines.flatMap(ln => ln.g.map(([a, b]) => [b, a]))), { maxZoom: 15, padding: [30, 30] });
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', e => {
      const t = e.target.closest && e.target.closest('[data-dcproj-open],[data-dcproj-back],[data-dcproj-sys],[data-dcproj-sort],[data-dcproj-csv],[data-dcproj-map]'); if (!t) return;
      const d = t.dataset;
      if (d.dcprojOpen != null) setS('sel', d.dcprojOpen);
      else if (d.dcprojBack != null) setS('sel', null);
      else if (d.dcprojSys) setS('sys', d.dcprojSys);
      else if (d.dcprojSort) setS('sort', d.dcprojSort);
      else if (d.dcprojCsv) csv(d.dcprojCsv);
      else if (d.dcprojMap) showOnMap(d.dcprojMap);
    });
    document.addEventListener('keydown', e => { const r = e.target.closest && e.target.closest('tr[data-dcproj-open]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
  }

  const api = { render, panelSpec, refresh, state: S, TIER };
  root.PeelDcProjects = api;
})(typeof window !== 'undefined' ? window : globalThis);
