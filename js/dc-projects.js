/* Peel Growth Pipeline (unofficial) – Capital › DC timing: is each DC project in time?
 *
 * Navigation phase 4: DC timing and DC projects as one list. Every project on the 2026 DC capital
 * maps, one row per project number (contract where none: `ln.p || ln.c`, the key both models give a
 * DC line), with two verdicts: in service before the capacity it relieves runs out (the capacity model,
 * js/dc-cost.js dcAnalysis) and the first homes of the developments relying on it before it is built
 * (the allocation of js/dc-impact.js, worked out after the list first paints: those that need it to
 * connect (A), those that drain through a sewer it relieves that runs short (B1, "needs it for
 * capacity") and those on its path whose sewer has room (B2, shown, not counted)). A row opens the
 * project's scope (dcwork:<sys>:<key>): on the map its card (cardHTML, in js/masterplan.js showDcLine),
 * on a page the Capital page in place (openSpec): both verdicts, its developments by tier, their first
 * homes against its construction year, and, while the Funding lab is on (never in the public version),
 * its DC cost, where it falls in the funding screen and the DCs of the developments that rely on it.
 * The panel is 'dca:timing' (the map's Capital tab and the Capital page), always the list;
 * #dca-dcproj-body holds it in full. The old DC timing tool result opens it (openList). Plant
 * expansions, 2020 Master Plan mains and DC facilities relieve constraints too but are no DC line:
 * Servicing › Capacity has them with their facility, and js/dca-tab.js's analysis table under this one
 * lists every relief.
 */
(function (root) {
  'use strict';
  const U = root.PeelUtil;
  const { esc, fmtNum, fmtMoney, roundPop, store, CAPITAL } = U;
  const DI = () => root.PeelDcImpact, PN = () => root.PeelPanel, MP = () => root.PeelMasterPlan, DC = () => root.PeelDcCost;
  const DIF = () => root.PeelDcInfra, MM = () => root.PeelMapMarkers, SC = () => root.PeelSewerCap, App = () => root.PeelApp, SP = () => root.PeelSvcPlants;

  // One stored sort (navigation phase 4): DC timing's, else DC projects' (its Soonest was the construction
  // year: not carried), else Soonest. get(k): the stored value or null.
  const SORTS = ['soonest', 'impact', 'affected', 'perunit'];
  const sortOf = get => [get('dcSort'), get('dcaPnlSort'), { affected: 'affected', perunit: 'perunit' }[get('dcProjSort')]].find(v => SORTS.includes(v)) || 'soonest';
  // sel: the project open in place on the Capital page (for the visit: a stored one reopened Capital on an
  // old project; on the map a row opens its card instead);
  // status: the Status filter, for the visit too; more: the tiers of the open project shown in full.
  const S = { sel: null, status: 'all', sort: sortOf(k => store.get(k, null)), more: [] };
  // The System is the one control shared with Servicing › Capacity (js/analysis-tabs.js; it took over this
  // list's own stored pick, dcProjSys, once): both · ww · water.
  const AT = () => root.PeelAnalysisTabs, sysNow = () => (AT() && AT().getSys ? AT().getSys() : 'both');
  const SYS = { both: 'Water and wastewater', ww: 'Wastewater', water: 'Water' };
  const TIER = { A: 'Needs it to connect', B1: 'Needs it for capacity', B2: 'On its path, not needed' };
  const funding = () => !!(root.PeelLabs && root.PeelLabs.on('funding') && !(U.isPublic && U.isPublic()));

  // ---- From the two models -------------------------------------------------------------------------
  const counted = (m, pr) => pr.devs.filter(x => m.gateTiers.includes(x.tier));
  const label = pr => DC().projLabels({ k: pr.k, d: pr.d, id: pr.key });
  const yrs = pr => (pr.y0 == null ? 'year not labelled' : pr.y0 === pr.y1 ? String(pr.y1) : `${pr.y0}–${pr.y1}`);
  const unitsOf = rows => rows.reduce((t, x) => t + x.units, 0);
  // The list: one row per DC line project (groups: js/dc-impact.js groupProjects, or the model's projects), with
  // its capacity verdict (R: dcAnalysis, keyed 'ln:<sys>:<key>') and its status for the Status filter: gap (in
  // service after the capacity runs out), planned (in time), ok (nothing held back if cancelled), check (it
  // relieves only constraints flagged "check the data"), null (no modelled constraint: All only).
  const STATUS = [['gap', 'Late'], ['planned', 'In time'], ['check', 'Check the data'], ['ok', 'Room'], ['all', 'All']];
  const ST_OF = { advance: 'gap', keep: 'planned', defer: 'planned', review: 'ok' };
  function mergeRows(groups, R, m, o = {}) {
    const T = new Map((R ? R.list : []).filter(r => /^ln:/.test(r.key)).map(r => [r.key.slice(3), r])), chk = o.check || new Set();
    const rows = groups.map(g => {
      const k = `${g.sys}:${g.key}`, pr = (m && m.projects.get(k)) || g, t = T.get(k) || null, c = m && pr.devs ? counted(m, pr) : [], units = unitsOf(c);
      return { k, pr, t, st: t ? ST_OF[t.rec] || null : chk.has(k) ? 'check' : null, c, units, perUnit: m && pr.cost && units ? pr.cost / units : null };
    });
    // (plant steps, 2020 MP mains, DC facilities: every relief that is no row, so the list and these add up)
    const ks = new Set(rows.map(x => x.k)), other = (R ? R.list : []).filter(r => !/^ln:/.test(r.key) || !ks.has(r.key.slice(3)));
    return { rows, other };
  }
  // The DC line projects before the allocation is worked out (pure and cheap: no pipe walk), once per program.
  let G = { of: null, list: [] };
  function groupsNow(m) {
    if (m) return [...m.projects.values()];
    const I = App() && App().state.dcInfra; if (!I) return [];
    if (G.of !== I) G = { of: I, list: DI().groupProjects(I, DIF().dcM) };
    return G.list;
  }
  // The DC lines relieving constraints flagged "check the data" (the timing leaves those out): 'sys:key'.
  function checkKeys() {
    const out = new Set();
    for (const c of MP().allNeeds().filter(x => x.status === 'check')) for (const r of c.relief || []) { const k = MP().reliefKey(r); if (k && /^ln:/.test(k)) out.add(k.slice(3)); }
    return out;
  }
  const merged = (R, m) => mergeRows(groupsNow(m), R, m, { check: checkKeys() });
  const sysOk = x => { const s = sysNow(), pr = x.pr; return s === 'both' || pr.sys === (s === 'ww' ? 'wastewater' : 'water'); };
  const statusOk = x => S.status === 'all' || x.st === S.status;
  // One row of sorts (N-11: the same words only for the same measures): Soonest and Largest impact are the
  // capacity model's, Most affected and $ a unit the allocation's (they wait for it; $ a unit for the lab too).
  // (Soonest: a project relieving no modelled constraint after every one that does; among those whose capacity
  // runs out after the horizon, the largest impact first, as DC timing's own list did)
  const yr = x => (x.t ? (x.t.outY === MM().THIS_YEAR ? 0 : x.t.outY || 9999) : 99999);
  const SORT_FN = {
    soonest: (a, b) => yr(a) - yr(b) || (b.t ? b.t.bo : 0) - (a.t ? a.t.bo : 0) || (a.pr.y1 || 9999) - (b.pr.y1 || 9999), impact: (a, b) => (b.t ? b.t.bo : 0) - (a.t ? a.t.bo : 0) || b.units - a.units,
    affected: (a, b) => b.units - a.units || b.pr.devs.length - a.pr.devs.length, perunit: (a, b) => (a.perUnit ?? Infinity) - (b.perUnit ?? Infinity),
  };
  const sortNow = m => (S.sort === 'perunit' && !funding() ? 'soonest' : m || S.sort === 'soonest' || S.sort === 'impact' ? S.sort : 'soonest');
  const ordered = (rows, m) => rows.slice().sort(SORT_FN[sortNow(m)] || SORT_FN.soonest);
  // The rows the list shows: at the System and the Status, sorted.
  const rowsFor = (R, m) => ordered(merged(R, m).rows.filter(sysOk).filter(statusOk), m);
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
  // The first verdict in words and its tone; the year the capacity it relieves runs out.
  const V1 = { gap: 'in service after it runs out', planned: 'in service in time', ok: 'nothing held back if cancelled', check: 'check the data' };
  const V1_TONE = { gap: 'over', planned: 'room', ok: 'room', check: 'tight' };
  const v1Of = st => V1[st] || 'relieves no modelled constraint';
  const outOf = t => (t && t.outY ? (t.outY === MM().THIS_YEAR ? 'now' : `≈${t.outY}`) : t && t.cons && t.cons.length && SP() ? `after ${SP().hz.end}` : '–');
  // The second verdict in words and its tone (the list row, the project in place, its card).
  const v2Of = (m, pr, c) => (!m ? ['working out who relies on it…', null] : pr.gaps ? [`${fmtNum(pr.gaps)} expected before it is built`, 'over'] : c.length ? [`first homes in time for the ${fmtNum(c.length)} relying on it`, 'room'] : ['no development in the pipeline relies on it', null]);

  // ---- Panels ---------------------------------------------------------------------------------------
  // (an option's third element is its tooltip: the measure it sorts by, N-11)
  const seg = (attr, cur, opts, label) => `<div class="seg" role="group"${label ? ` aria-label="${label}"` : ''}>${opts.map(([k, t, tip]) => `<button type="button" class="btn small${cur === k ? ' on' : ''}" data-${attr}="${k}" aria-pressed="${cur === k}"${tip ? ` title="${tip}"` : ''}>${t}</button>`).join('')}</div>`;
  // (a status no row has is left out, unless it is the one picked: then its list says none is, NONE)
  const NONE = { gap: 'late', planned: 'in time', check: 'flagged “check the data”', ok: 'with nothing held back if cancelled' };
  const statusChips = rows => `<div class="chips dcp-status" role="group" aria-label="Status">${STATUS.filter(([k]) => k === 'all' || k === S.status || rows.some(x => x.st === k)).map(([k, t]) => `<button type="button" class="chip btn small${S.status === k ? ' on' : ''}" data-dc-status="${k}" aria-pressed="${S.status === k}">${t} ${fmtNum(k === 'all' ? rows.length : rows.filter(x => x.st === k).length)}</button>`).join('')}</div>`;
  const loadingSpec = what => ({ head: PN().areaHead('Capital › DC timing', 'Is each DC project in time?', null, 'Peel'), answer: `<span class="muted">${esc(what)}</span>` });

  function listSpec(R, m) {
    const M = merged(R, m), rows = M.rows.filter(sysOk), shown = ordered(rows.filter(statusOk), m), s = sysNow(), n = rows.length;
    const late = rows.filter(x => x.st === 'gap'), gapP = m ? rows.filter(x => x.pr.gaps) : [], nWw = rows.filter(x => x.pr.sys === 'wastewater').length;
    // (the reliefs that are no DC line, late: named, with their facility in Servicing › Capacity)
    const otherLate = M.other.filter(r => r.rec === 'advance' && (s === 'both' || r.sys === s));
    // (the largest of every relief, a plant expansion too: the sentence is about all of them)
    const big = R.list.slice().sort((a, b) => b.bo - a.bo)[0], pp = v => fmtNum(roundPop(v)), uu = v => fmtNum(Math.round(v / R.ppu));
    const sc = funding() && m ? screens() : null, ns = sc ? rows.filter(x => x.c.length && screenOf(sc, x.pr) === 'Not screened') : null;
    // The project's plain name, its ID and construction years; the year its capacity runs out; both verdicts named.
    const row = ({ k, pr, t, st, c, perUnit }) => ({ tone: st === 'gap' || pr.gaps ? 'over' : null, attrs: { 'data-dcproj-open': k },
      html: `<div class="pnl-r-top"><span class="pnl-r-name">${pr.sys === 'water' ? '💧 ' : ''}${esc(label(pr).short)}<small>project ${esc(pr.key)} · construction ${esc(yrs(pr))}${pr.status === 'approved' ? ' · approved 2026' : ''}</small></span><span class="pnl-r-year t-${V1_TONE[st] || 'room'}">${outOf(t)}</span></div>
        <div class="pnl-r-meta"><span>capacity runs out</span><span class="t-${V1_TONE[st] || 'room'}">${v1Of(st)}</span></div>
        <small class="pnl-r-line">${(([w, tn]) => (!m ? `first homes: ${w}` : tn === 'over' ? `<span class="t-over">${w}</span>` : w))(v2Of(m, pr, c))}${sc ? ` · DC cost ${pr.cost ? fmtMoney(pr.cost) : 'not costed'}${perUnit ? ` (${fmtMoney(perUnit)} a unit)` : ''} · ${esc(screenOf(sc, pr))}` : ''}</small>` });
    // (a Status no row has keeps its list, so the chips stay above it: one line says so)
    const none = { html: `<small class="pnl-r-line">No ${s === 'both' ? '' : `${SYS[s].toLowerCase()} `}DC project ${S.status === 'all' ? 'on the 2026 DC maps' : `is ${NONE[S.status]}`}${S.status === 'gap' && otherLate.length ? ' (the answer names the other reliefs late)' : ''}.</small>` };
    const tools = `${statusChips(rows)}${AT() && AT().sysSeg ? AT().sysSeg() : ''}${seg('dcproj-sort', S.sort, [['soonest', 'Soonest', 'The year the capacity it relieves runs out, earliest first'], ['impact', 'Largest impact', 'Most people held back by build-out if it were cancelled'], ['affected', 'Most affected', 'Most units relying on it first'], ...(funding() ? [['perunit', '$ a unit', 'Lowest DC cost per unit relying on it first']] : [])], 'Sort')}`;
    return {
      calc: true, fullTitle: 'Capital › DC timing · Peel: every 2026 DC project, both verdicts',
      head: PN().areaHead('Capital › DC timing', 'Is each DC project in time?', late.length ? { tone: 'over', text: `${late.length} late` } : { tone: 'room', text: 'In time' }, `Peel${s === 'both' ? '' : ` · ${SYS[s].toLowerCase()}`} · ${fmtNum(n)} DC projects · 2026 DC capital maps (draft, as of ${esc(CAPITAL.asOf)})`),
      answer: `Of the <strong>${fmtNum(n)} DC projects</strong> on the 2026 DC maps, ${late.length ? `<strong>${late.length}</strong> ${late.length === 1 ? 'is' : 'are'} in service only after the capacity ${late.length === 1 ? 'it relieves' : 'they relieve'} runs out` : 'none is in service after the capacity it relieves runs out'}${m ? `; <strong>${fmtNum(gapP.length)}</strong> ${gapP.length === 1 ? 'has' : 'have'} developments whose first homes come before ${gapP.length === 1 ? 'it is' : 'they are'} built` : ''}.${R.baseBo > 0 ? ` With every project as scheduled, <strong>≈${pp(R.baseBo)} people</strong> are still constrained at build-out${big && big.bo > 0 ? `; without the <strong>${esc(big.short || big.name)}</strong>, ≈${pp(big.bo)} more would be, the most of any one project` : ''}.` : ''}${otherLate.length ? ` Also late: <strong>${otherLate.length}</strong> other relief${otherLate.length === 1 ? '' : 's'} with no DC line (plant expansions, 2020 Master Plan mains, DC facilities: <button type="button" class="btn small link" data-at="svc:capacity">Servicing › Capacity →</button>; every one is in the full table).` : ''}`,
      figures: [
        { v: fmtNum(n), u: 'projects', label: 'DC projects', ctx: s === 'both' ? `${fmtNum(nWw)} wastewater · ${fmtNum(n - nWw)} water` : `${SYS[s].toLowerCase()} only (the System; ${fmtNum(M.rows.length)} in all)` },
        { v: fmtNum(late.length), u: '', label: 'late', ctx: 'in service after the capacity runs out', tone: late.length ? 'over' : null, attrs: { 'data-dc-status': 'gap' } },
        { v: m ? fmtNum(gapP.length) : '…', u: '', label: 'first homes before it is built', ctx: m ? 'DC projects with developments relying on them expected first' : 'working out who relies on each project', tone: m && gapP.length ? 'over' : null, attrs: { 'data-full-table': 'dca' } },
        { v: pp(R.baseBo), u: 'people', label: 'constrained at build-out', ctx: `≈${uu(R.baseBo)} units, every project as scheduled`, tone: R.baseBo > 0 ? 'tight' : 'room' },
      ],
      chart: DC().dcaTimingChart(rows.map(x => x.t).filter(Boolean), 6),
      lists: [{ title: `${SYS[s]} projects`, tools, rows: shown.length ? shown.slice(0, 8).map(row) : [none], total: shown.length, seeAll: { 'data-full-table': 'dca' } }],
      folds: funding() ? [fundingFold(ns)] : [],
      method: 'Two verdicts for each 2026 DC project (one row per project number, its contract where it has none), from two models that read the same DC lines. In service before the capacity runs out: each capacity constraint (pumping stations at firm capacity, plants at 90% of rated, the water systems and supply into the upper zones) is replayed year by year to the horizon; a project is late when the capacity it relieves runs out before it is in service. Cancelling one project holds back the growth above the remaining capacity; people at each constraint’s own rate, units at the growth’s persons per unit. Constraints in series count the largest, not the sum. Check the data: it relieves only constraints whose data is flagged, which the timing leaves out. First homes before it is built: developments in the pipeline (approved or proposed) allocated to the 2026 DC works they rely on: needs it to connect (off the existing sewers, its route runs along the planned main; water: outside the mapped zones, the planned main within 1 km), or needs it for capacity (it drains through an existing sewer the project relieves, and that sewer runs short, as the DC main’s panel rates it). Developments on its path whose sewer has room are listed, not counted. A timing gap: the forecast’s first homes come before the latest construction year of the projects a development relies on (docs/dc-impact/ALLOCATION.md). The two answer different questions and can disagree: a main can be in service before the capacity it relieves runs out and still after the first homes of a development that needs it to connect, or the reverse. Plant expansions, 2020 Master Plan mains and DC facilities relieve constraints too but are no DC line: each is with its facility in Servicing › Capacity, and every one is in the full table’s analysis. Screening results only, not a capital plan.',
      sources: '2026 DC capital maps (draft v2, March 2026; dates as of March 2026, before the May 2026 pause); 2020 DC Background Study costs indexed to 2026$; Region capital records where a DC project matches one; Region sanitary sewers; the municipal application records; the Growth forecast.',
      foot: { primary: { label: 'Show the planned works', attrs: { 'data-mview': 'dc' } }, secondary: [{ label: 'CSV: every project', attrs: { 'data-dcproj-csv': 'all' } }] },
    };
  }

  // The Funding lab's screen (was Capital › Funding): its answer, figures and chart, and the DC projects relied on
  // but not in it (ns, once the allocation is worked out); the screening results and the funding levels are in the
  // full table (#dca-rec-body, #dca-funding-body).
  function fundingFold(ns) {
    const fs = root.PeelDcaTab && root.PeelDcaTab.fundingSpec && root.PeelDcaTab.fundingSpec();
    if (!fs) return { title: 'Funding screen (Labs)', html: '<p class="small muted">Loading the funding screen…</p>' };
    const kv = f => PN().kv(`${f.label}${f.ctx ? ` <small>${f.ctx}</small>` : ''}`, `${f.v}${f.u ? ` ${f.u}` : ''}`, f.tone).html;
    const nsF = ns ? [{ v: fmtNum(ns.length), u: '', label: 'not in the funding screen', ctx: 'relied on, but no constraint or connector puts them in it', tone: ns.length ? 'tight' : null }] : [];
    return { title: 'Funding screen (Labs)', open: true, html: `<p class="small">${fs.answer}</p>${[...(fs.figures || []), ...nsF].map(kv).join('')}${fs.chart || ''}
      <p class="small"><button type="button" class="btn small link" data-full-table="dca">Screening results and funding levels ›</button></p>` };
  }
  // ---- A DC project: in place on the Capital page (openSpec), its card on the map (cardHTML) ---------
  // A project picked before the allocation is worked out: its name and the way back, until it is.
  function waitSpec() {
    const g = groupsNow(null).find(x => `${x.sys}:${x.key}` === S.sel), id = g ? g.key : String(S.sel), nm = g ? `${label(g).short} · ${g.key}` : id, back = { 'data-dcproj-back': '' };
    return { head: { trail: [{ label: 'Peel' }, { label: 'Capital › DC timing', attrs: back }, { label: id }], close: back, name: nm, wsName: nm, back: { label: 'All DC projects', attrs: back } },
      answer: '<span class="muted">Working out the developments relying on it…</span>' };
  }
  const firstOf = (m, x) => { const r = m.byDev.get(x.p.key); return r ? r.first : null; };
  // Its row of the merge (both verdicts' inputs, as its list row has them; the servicing model is in).
  const rowOf = (k, m) => merged(DC().dcAnalysis(), m).rows.find(x => x.k === k) || null;
  // Both verdicts as label / value rows, in the list row's words.
  function verdicts(x, m) {
    const [w, tone] = v2Of(m, x.pr, x.c);
    return [PN().kv('In service before the capacity runs out?', `${esc(v1Of(x.st))} <small>${x.t ? `capacity runs out ${outOf(x.t)} · ` : ''}construction ${esc(yrs(x.pr))}</small>`, V1_TONE[x.st] || null), PN().kv('First homes before it is built?', esc(w), tone)];
  }
  // The developments built since the census already on it, and the rest of the area it serves: context.
  const ctxOf = pr => [pr.built ? `${fmtNum(pr.built)} developments built since the census (≈${fmtNum(Math.round(pr.builtUnits))} units) already ${pr.sys === 'wastewater' ? 'drain through or connect to it' : 'connect to it'}` : '',
    pr.shed ? `${fmtNum(pr.shed)} more in the ${pr.sys === 'wastewater' ? 'sewershed it serves (the catchment and those upstream), not on its path' : 'pressure zone it serves'}: context, not counted` : ''].filter(Boolean);
  // The Funding lab's lines for a project (the page's Funding fold, the card's; funding() is never on in the
  // public version).
  function fundLines(m, pr) {
    const c = counted(m, pr), sc = screens(), scr = screenOf(sc, pr), rev = revenueOf(pr, c), gapRev = revenueOf(pr, c.filter(x => { const f = firstOf(m, x); return f && pr.y1 && f < pr.y1; }));
    const kv = (k, v) => PN().kv(k, v).html;
    return [kv('DC cost (2026$, DC-recoverable)', `${pr.cost ? fmtMoney(pr.cost) : 'not costed'}${pr.costEst > 0 ? ` <small>${Math.round(pr.costEst * 100)}% estimated</small>` : ''}`),
      kv(`Funding screen (${fmtMoney(DC().DCB.budget)}, ${DC().DCB.years} years)`, PN().chip({ tone: SCREEN_TONE[scr] || 'tight', text: scr })),
      rev != null ? kv(`${pr.sys === 'wastewater' ? 'Wastewater' : 'Water'} DCs of the developments relying on it`, `≈${fmtMoney(rev)}${pr.cost ? ` <small>${(rev / pr.cost).toFixed(1)}× its DC cost</small>` : ''}`) : '',
      gapRev ? kv('Of which, developments expected before it is built', `≈${fmtMoney(gapRev)}`) : '',
      pr.cost && unitsOf(c) ? kv('DC cost per unit relying on it', fmtMoney(pr.cost / unitsOf(c))) : ''].join('') + `<p class="small muted">${scr === 'Not screened' ? 'No capacity constraint or connector puts it in the funding screen. ' : ''}DCs go into Region-wide reserves, not to one project: this compares projects; it is not a funding source. Residential rates, before credits and exemptions.</p>`;
  }
  // The project in place on the Capital page: both verdicts, then every development relying on it by tier.
  function projectSpec(m, pr) {
    const l = label(pr), fl = funding(), c = counted(m, pr), row = rowOf(`${pr.sys}:${pr.key}`, m) || { pr, t: null, st: null, c };
    const by = t => pr.devs.filter(x => x.tier === t).sort((a, b) => b.q - a.q);
    const unit = pr.sys === 'wastewater' ? 'L/s peak wet' : 'L/s max day', q = c.reduce((t, x) => t + x.q, 0);
    const devRow = x => {
      const f = firstOf(m, x), gap = f && pr.y1 && f < pr.y1 && m.gateTiers.includes(x.tier);
      const how0 = x.tier === 'A' ? `${x.how.joinM != null ? `${fmtNum(Math.round(x.how.joinM))} m from it` : ''}${x.how.km ? ` · ${x.how.km.toFixed(1)} km along planned mains` : ''}` : x.how.mm ? `joins a ${x.how.mm} mm sewer upstream` : '';
      // (a reviewed outlet says so: QA/QC › Review outlets, js/dev-outlets.js)
      const DO = root.PeelDevOutlets, rec = DO && pr.sys === 'wastewater' ? DO.recordOf(x.p) : null, how = [how0, rec ? DO.recText(rec) : ''].filter(Boolean).join(' · ');
      return { tone: gap ? 'over' : null, attrs: { 'data-pnl-dev': x.p.key },
        html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(x.p.title)}<small>${esc(x.p.municipality)}${how ? ` · ${esc(how)}` : ''}</small></span><span class="pnl-r-fig">${x.units >= 0.5 || !(x.e.employment.jobs > 0) ? `${fmtNum(Math.round(x.units))}<small>units</small>` : `${fmtNum(Math.round(x.e.employment.jobs))}<small>jobs</small>`}</span></div>
          <small class="pnl-r-line">${f ? (gap ? `<span class="t-over">first homes ≈${f}, before it is built (${pr.y1})</span>` : `first homes ≈${f}`) : 'no forecast year'} · ${x.q.toFixed(1)} ${unit}</small>` };
    };
    const tiers = ['A', 'B1', 'B2'].map(t => ({ t, rows: by(t) })).filter(g => g.rows.length);
    // (every row is the page's, the first five shown: See all opens the rest in place, a trunk main can have a
    // thousand; the map's full table is the list, not the project)
    const lists = tiers.map(g => ({ title: `${TIER[g.t]}${g.t === 'B1' && pr.relieves ? ` (${pr.relieves.name})` : ''}`, rows: g.rows.map(devRow), total: g.rows.length, all: S.more.includes(g.t), see: { 'data-dcproj-more': g.t } }));
    const ctx = ctxOf(pr);
    return {
      calc: true, fullTitle: `${l.short} · ${pr.key}: the developments relying on it`,
      head: { trail: [{ label: 'Peel' }, { label: 'Capital › DC timing', attrs: { 'data-dcproj-back': '' } }, { label: pr.key }], close: { 'data-dcproj-back': '' },
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
      lists: [{ title: 'Is it in time?', rows: verdicts(row, m) }, ...lists, ...(ctx.length ? [{ title: 'Context', rows: ctx.map(t => ({ html: `<small class="pnl-r-line">${esc(t)}</small>` })) }] : [])],
      folds: fl ? [{ title: 'Funding (Labs)', html: fundLines(m, pr), open: true }] : [],
      method: 'Needs it to connect: off the existing sewers, the development’s route to one runs along this main (water: outside the mapped zones, this is the planned main within 1 km). Needs it for capacity: it drains through an existing sewer this project relieves, and that sewer runs short (the DC main panel’s rating). On its path, not needed: the sewer has room. First homes: the Growth forecast’s first year with homes. Peak flows at Peel design criteria.',
      sources: `2026 DC capital maps (draft, as of ${esc(CAPITAL.asOf)}); Region sanitary sewers; the municipal application records; 2020 DC Background Study costs indexed to 2026$.`,
      foot: { primary: { label: 'Show on the map', attrs: { 'data-dcproj-map': `${pr.sys}:${pr.key}` } }, secondary: [{ label: 'CSV: its developments', attrs: { 'data-dcproj-csv': `${pr.sys}:${pr.key}` } }] },
    };
  }
  // The project open in place on the Capital page (js/ws-pages.js projects), or null: the page's host of its
  // scope, as the card is the map's. The stored panel stays the list.
  function openSpec() {
    if (!S.sel || !DI() || !PN()) return null;
    if (!ready()) return waitSpec();
    const m = DI().current(); if (!m) { buildLater(); return waitSpec(); }
    const pr = m.projects.get(S.sel); return pr ? projectSpec(m, pr) : null;
  }
  // The card's answer: both verdicts in one sentence, each in its own measure.
  function headline(x, m) {
    const { pr, t, st, c } = x, when = pr.y1 ? `In service ≈${pr.y1}` : 'In service (its construction year is not labelled)';
    const a = st === 'gap' ? `${when}, after the capacity it relieves runs out (${outOf(t)}): <strong>late</strong>.` : st === 'planned' ? `${when}, before the capacity it relieves runs out (${outOf(t)}): in time.`
      : st === 'ok' ? 'Nothing is held back if it were cancelled.' : st === 'check' ? 'It relieves only constraints whose data is flagged: check the data.' : 'It relieves no modelled constraint.';
    const b = !m ? 'Working out who relies on it…' : c.length ? `<strong>${fmtNum(c.length)} development${c.length === 1 ? '' : 's'}</strong> rel${c.length === 1 ? 'ies' : 'y'} on it${pr.gaps ? `; <strong>${fmtNum(pr.gaps)}</strong> ${pr.gaps === 1 ? 'is' : 'are'} expected before it is built` : pr.y1 ? ', all expected after it is built' : ''}.` : 'No development in the pipeline relies on it.';
    return `${a} ${b}`;
  }
  // The card's table: every development on it by tier, as data-dev rows (the result filters the map and the
  // left panel to them; a row opens the development: js/tool-scope.js), styled as a result's other lists of
  // developments (.loads-table). Past the first 30 the rest fold (a trunk main can have a thousand), so what
  // it relieves stays near.
  function devTable(m, pr) {
    const fl = funding(), c = counted(m, pr), unit = pr.sys === 'wastewater' ? 'Peak wet (L/s)' : 'Max day (L/s)', ctx = ctxOf(pr), LIMIT = 30;
    const rows = pr.devs.slice().sort((a, b) => a.tier.localeCompare(b.tier) || b.q - a.q), more = ctx.length ? `<p class="small muted">${ctx.map(esc).join('. ')}.</p>` : '';
    if (!rows.length) return `<p class="small muted">No development in the pipeline relies on it.</p>${more}`;
    const head = `<thead><tr><th>Development</th><th>Tier</th><th>Units</th><th>${unit}</th><th>First homes</th>${fl ? '<th>Cost share</th>' : ''}</tr></thead>`;
    const tr = x => { const f = firstOf(m, x), gap = f && pr.y1 && f < pr.y1 && m.gateTiers.includes(x.tier);
      return `<tr class="ld-row" data-dev="${esc(x.p.key)}" tabindex="0"><td>${esc(x.p.title)}<small>${esc(x.p.municipality)}</small></td><td>${esc(TIER[x.tier])}</td><td>${x.units >= 0.5 || !(x.e.employment.jobs > 0) ? fmtNum(Math.round(x.units)) : `${fmtNum(Math.round(x.e.employment.jobs))} jobs`}</td><td>${x.q.toFixed(1)}</td><td${gap ? ' class="t-over"' : ''}>${f || '–'}${gap ? ` (before ${pr.y1})` : ''}</td>${fl ? `<td>${x.share ? fmtMoney(x.share) : '–'}</td>` : ''}</tr>`; };
    return `<table class="dt dt-wide loads-table"><caption>${fmtNum(c.length)} development${c.length === 1 ? '' : 's'} relying on it, by tier${rows.length > c.length ? ` (and ${fmtNum(rows.length - c.length)} on its path, not needed)` : ''}</caption>${head}
      <tbody>${rows.slice(0, LIMIT).map(tr).join('')}</tbody></table>${rows.length > LIMIT ? `<details class="dcn-more"><summary class="small">${fmtNum(rows.length - LIMIT)} more developments (the CSV has every one)</summary><table class="dt dt-wide loads-table">${head}<tbody>${rows.slice(LIMIT).map(tr).join('')}</tbody></table></details>` : ''}${more}`;
  }
  // A DC project's card (its dcwork: scope on the map: js/masterplan.js showDcLine, before what it relieves):
  // both verdicts, then the developments relying on it by tier, as the Capital page shows it in place. The
  // allocation is worked out after the card first paints, then the card is drawn again; the sewers are fetched
  // only when missing, and the card drawn again only once that made it ready (never a loop). '' for a line
  // with no project number or contract (masterplan's own list of who relies on it stays then).
  function cardHTML(ln) {
    if (!ln || !(ln.p || ln.c)) return '';
    const k = `${ln.sys}:${ln.p || ln.c}`;
    if (!ready()) {
      if (MM() && MM().SEW && !MM().SEW.data && SC() && sewK !== k) { sewK = k; SC().loadSewers().then(d => { sewK = null; if (d && ready()) again(k); }); }
      return `<p class="headline"><span class="muted">${App() && App().state.svcModel ? 'Loading the sewers…' : 'Loading the servicing model…'}</span></p>`;
    }
    const m = DI() && DI().current(), x = rowOf(k, m); if (!x) return '';
    if (!m) { cardK = k; buildLater(redraw); }
    const pm = m && m.projects.get(k);
    return `<p class="headline">${headline(x, m)}</p>${verdicts(x, m).map(r => r.html).join('')}
      ${pm ? devTable(m, pm) : m ? '' : '<p class="small muted">Working out the developments relying on it…</p>'}${funding() && pm ? `<div class="pv-hide"><h3 class="sub-title">Funding (Labs)</h3>${fundLines(m, pm)}</div>` : ''}
      <p class="small">${pm ? `<button type="button" class="btn small" data-dcproj-csv="${esc(k)}">CSV: its developments</button> ` : ''}<button type="button" class="btn small link" data-scope-result-close data-at="dca:timing">All DC projects ›</button></p>`;
  }
  // (the card drawn again while it is still the one open: its producer re-run, js/svc-scope.js; once, however
  // often it painted while it waited)
  const again = k => { const SS = root.PeelSvcScope; if (k && SS && SS.hasResult && SS.hasResult() && App().state.ss === `dcwork:${k}`) SS.reopenResult(); };
  let cardK = null, sewK = null; const redraw = () => again(cardK);

  // ---- Full table ---------------------------------------------------------------------------------
  // The list in full, both verdicts, filtered as the panel is (a row opens the project's card).
  function fullHTML(R, m) {
    const fl = funding();
    const sc = fl && m ? screens() : null, rows = rowsFor(R, m), stOn = STATUS.find(([k]) => k === S.status), nT = (pr, t) => pr.devs.filter(x => x.tier === t).length;
    const wait = `<td>…</td><td>…</td><td>…</td><td>…</td><td>…</td>${fl ? '<td>…</td><td>…</td><td>…</td>' : ''}`;
    return `<table class="dt dt-wide"><caption>Every DC project, both verdicts: ${fmtNum(rows.length)} ${esc(SYS[sysNow()].toLowerCase())} DC projects${S.status !== 'all' && stOn ? ` (${esc(stOn[1])})` : ''}</caption><thead><tr><th>Project</th><th>Construction</th><th>Capacity runs out</th><th>In service before it runs out?</th><th>To connect</th><th>For capacity</th><th>On path, not needed</th><th>Units relying</th><th>Before it is built</th>${fl ? '<th>DC cost</th><th>$ a unit</th><th>Funding screen</th>' : ''}</tr></thead>
      <tbody>${rows.map(({ pr, t, st, units, perUnit }) => `<tr class="ld-row" data-dcproj-open="${esc(`${pr.sys}:${pr.key}`)}" tabindex="0"><td>${esc(label(pr).short)}<small>${esc(pr.key)}</small></td><td>${esc(yrs(pr))}</td><td>${outOf(t)}</td><td${st === 'gap' ? ' class="t-over"' : ''}>${esc(v1Of(st))}</td>${m ? `<td>${nT(pr, 'A')}</td><td>${nT(pr, 'B1')}</td><td>${nT(pr, 'B2')}</td><td>${fmtNum(Math.round(units))}</td><td${pr.gaps ? ' class="t-over"' : ''}>${pr.gaps}</td>${fl ? `<td>${pr.cost ? fmtMoney(pr.cost) : '–'}</td><td>${perUnit ? fmtMoney(perUnit) : '–'}</td><td>${esc(screenOf(sc, pr))}</td>` : ''}` : wait}</tr>`).join('')}</tbody></table>${m ? '' : '<p class="small muted">Working out who relies on each project…</p>'}`;
  }

  // ---- Render and actions ----------------------------------------------------------------------------
  const ready = () => !!(App() && App().state.svcModel && App().state.dcInfra && MM() && MM().SEW && MM().SEW.data);
  // The allocation (js/dc-impact.js model: every pipe and development) is worked out once the list has painted,
  // then the list is drawn again (once per scenario: the model keeps it), and a card waiting for it (then: each
  // once). Home and a development's Overview never build it.
  let building = false; const after = [];
  function buildLater(then) {
    if (then && !after.includes(then)) after.push(then); if (building) return; building = true;
    setTimeout(() => {
      let m = null; try { m = DI().model(); } catch (e) { m = null; }
      building = false; if (!m) { after.length = 0; return; }
      refresh(); for (const f of after.splice(0)) try { f(); } catch (e) { /* the card is gone */ }
    }, 30);
  }
  // The panel: the list, or loading (the sewers are fetched once); a project opens its card on the map and
  // in place on the Capital page (openSpec). At a development none: its Capital panel is the projects it
  // relies on (js/dca-tab.js).
  function panelSpec() {
    if (!DI() || !PN()) return null;
    if (root.PeelDevVerdict && root.PeelDevVerdict.scopedDev && root.PeelDevVerdict.scopedDev()) return null;
    if (!ready()) {
      if (MM() && MM().SEW && !MM().SEW.data && SC()) SC().loadSewers().then(d => { if (d) refresh(); });
      return loadingSpec('Loading the DC program, the sewers and the servicing model…');
    }
    const R = DC().dcAnalysis(), m = DI().current();
    if (!m) buildLater();
    return listSpec(R, m);
  }
  // shown: the panel has drawn (the System control redraws it then, js/analysis-tabs.js setSys).
  let shown = false;
  function render() {
    const spec = panelSpec(); if (!spec) return;
    shown = true; PN().set('dca:timing', spec);
    const body = typeof document !== 'undefined' && document.getElementById('dca-dcproj-body');
    if (body) body.innerHTML = ready() ? fullHTML(DC().dcAnalysis(), DI().current()) : '';
  }
  function refresh() {
    render();
    const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.renderPage) W.renderPage(true);
  }
  // (only the sort is kept in this browser: dcSort)
  const KEY = { sort: 'dcSort' };
  const setS = (k, v) => { S[k] = v; if (k === 'sel') S.more = []; if (KEY[k]) store.set(KEY[k], v); refresh(); };
  function csv(which) {
    const m = DI().model(); if (!m || !root.PeelExports) return;
    const q = v => U.csvCell(v, true), out = [];
    if (which === 'all') {
      out.push(['Project', 'System', 'Kind', 'Diameter (mm)', 'Construction from', 'Construction to', 'Capacity runs out', 'In service before it runs out', 'Held back if cancelled, build-out (people)', 'Needs it to connect', 'Needs it for capacity', 'On its path, not needed', 'Units relying', 'Expected before it is built', 'DC cost 2026$']);
      for (const { pr, t, st, c } of merged(DC().dcAnalysis(), m).rows) out.push([pr.key, pr.sys, pr.k, pr.d || '', pr.y0 || '', pr.y1 || '', t && t.outY ? t.outY : '', v1Of(st), t ? Math.round(t.bo) : '', pr.devs.filter(x => x.tier === 'A').length, pr.devs.filter(x => x.tier === 'B1').length, pr.devs.filter(x => x.tier === 'B2').length, Math.round(unitsOf(c)), pr.gaps, pr.cost ? Math.round(pr.cost) : '']);
    } else {
      const pr = m.projects.get(which); if (!pr) return;
      out.push(['Development', 'Municipality', 'Tier', 'Units', 'Flow (L/s)', 'First homes', `Before ${pr.y1 || '–'}`, 'Cost share 2026$']);
      for (const x of pr.devs) { const r = m.byDev.get(x.p.key), f = r && r.first; out.push([x.p.title, x.p.municipality, TIER[x.tier], Math.round(x.units), x.q.toFixed(2), f || '', f && pr.y1 && f < pr.y1 ? 'yes' : '', x.share ? Math.round(x.share) : '']); }
    }
    root.PeelExports.download(`peel-dc-projects-${which === 'all' ? 'all' : which.replace(':', '-')}-${new Date().toISOString().slice(0, 10)}.csv`, (U.CSV_DISCLAIMER || '') + out.map(r => r.map(q).join(',')).join('\n'), 'text/csv');
  }
  // A DC project's scope (dcwork:<sys>:<key>, js/svc-scope.js): its card on the full map's Overview, as a tap on
  // the map or a search pick opens it, the map fitted to it (the lines from the DC program, never the allocation:
  // a tap must not walk every pipe). From a page: the map view first (js/workspaces.js data-ws-dcwork).
  function openWork(k) {
    const [sys, ...rest] = String(k).split(':'), key = rest.join(':'), I = App() && App().state.dcInfra, SS = root.PeelSvcScope;
    const lines = I && I[sys] ? I[sys].lines.filter(x => (x.p || x.c) === key) : [];
    if (!lines.length) { if (SS && SS.restore) SS.restore(`dcwork:${k}`); return; }   // (the DC program still loading: the link's way)
    if (MM() && !MM().getDcOn().on && root.PeelMapAnalysis) root.PeelMapAnalysis.setDcOn({ on: true, sys: 'both' });
    MP().showDcLine(lines[0]);
    const map = root.PeelMapCore && root.PeelMapCore.map; if (map && root.L) map.fitBounds(root.L.latLngBounds(lines.flatMap(ln => ln.g.map(([a, b]) => [b, a]))), { maxZoom: 15, padding: [30, 30] });
  }
  // (Show on the map, the page's side map: the full map at the project's card)
  function showOnMap(key) { const W = root.PeelWorkspaces; if (W && W.mode && W.mode() === 'home' && W.setMode) W.setMode('full'); openWork(key); }
  // The list from a link to the old DC timing tool result (js/masterplan.js showDcTiming): the area's list (a
  // development or a result open closes, as the result did), at that Status; the System stays the reader's (one
  // control, shared with Servicing › Capacity: never set here); on a page, the Capital page.
  function openList(o = {}) {
    S.status = STATUS.some(([k]) => k === o.status) ? o.status : 'all'; S.sel = null;
    if (root.DevScope && root.DevScope.current()) root.DevScope.close();
    const SS = root.PeelSvcScope; if (SS && SS.hasResult && SS.hasResult()) SS.closeResult();
    const W = root.PeelWorkspaces, A = AT();
    if (W && W.mode && W.mode() === 'home') { const WP = root.PeelWsPages; if (WP && WP.sectionAt) WP.sectionAt('capital', 'timing'); W.openPage('projects'); return; }
    if (A && A.openTab) A.openTab('dca', 'timing');
  }
  // A row opens its project: on the map its card (openWork); on a page in place, from another page the Capital
  // page at it (Growth in an area's Capital section lists the same rows). A Status chip also sets the workbook's
  // DC sheet filter (MasterPlan dcnFilter: its status and the System at the tap); the late figure and Home's
  // figure set the list's Status only.
  function onClick(e) {
    const t = e.target.closest && e.target.closest('[data-dcproj-open],[data-dcproj-back],[data-dcproj-sort],[data-dcproj-csv],[data-dcproj-map],[data-dcproj-more],[data-dc-status]'); if (!t) return;
    const d = t.dataset;
    if (d.dcprojOpen != null) {
      const W = root.PeelWorkspaces;
      if (!(W && W.mode && W.mode() === 'home')) { openWork(d.dcprojOpen); return; }
      if (W.page && W.page() !== 'projects') { const WP = root.PeelWsPages; if (WP && WP.sectionAt) WP.sectionAt('capital', 'timing'); W.openPage('projects'); }
      setS('sel', d.dcprojOpen);
    } else if (d.dcprojBack != null) setS('sel', null);
    else if (d.dcprojMore) { const k = d.dcprojMore; S.more = S.more.includes(k) ? S.more.filter(x => x !== k) : [...S.more, k]; refresh(); }
    else if (d.dcprojSort) setS('sort', d.dcprojSort);
    else if (d.dcprojCsv) csv(d.dcprojCsv);
    else if (d.dcprojMap) showOnMap(d.dcprojMap);
    else if (d.dcStatus) {
      S.status = STATUS.some(([k]) => k === d.dcStatus) ? d.dcStatus : 'all'; S.sel = null;
      if (t.closest('.dcp-status') && MP()) MP().dcnFilter = `${S.status}:${({ ww: 'ww', water: 'water' })[sysNow()] || 'all'}`;
      refresh();
    }
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', e => { const r = e.target.closest && e.target.closest('tr[data-dcproj-open]'); if (r && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); r.click(); } });
  }

  // (select: a project opened in place on the Capital page, as a row there opens it: the search on a page,
  // js/workspaces.js routePick)
  const api = { render, panelSpec, refresh, state: S, TIER, STATUS, select: k => setS('sel', k), mergeRows, sortOf, rowsFor, shown: () => shown, openWork, openSpec, openList, cardHTML };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PeelDcProjects = api;
})(typeof window !== 'undefined' ? window : globalThis);
