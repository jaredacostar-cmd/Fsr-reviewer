/* js/dev-detail.js — development detail content (Phase 6 extraction).
 * Record rows, provenance per record, audit rows, phases/build-out/employment/
 * summary HTML, council items + briefs, status derivation, flags, servicing briefs.
 * Extracted verbatim from js/app.js (lines 2362-2847); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 * Note: bare `B` here is window.PeelBrief (kept at top level); `chip(` is this
 * module's own local (shared with js/fsr.js via the api).
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { esc, fmtNum, fmtDate, fmt1, roundPop, unit, uML, uLs, uPop, uUnits, estTag, dot, PIPE_RESULTS, SCREEN_NOTE } = root.PeelUtil;
  // Units are net of the dwellings the site demolishes (a tear-down rebuild adds none).
  const netNote = p => (p.unitsLost ? ` (net: ${fmtNum(p.unitsGross || 0)} new − ${fmtNum(p.unitsLost)} demolished)` : '');
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const PV = root.PeelProvenance || null;
  const App = () => root.PeelApp;
  const FI = () => root.PeelFilterUI;
  const SV = () => root.PeelSvcData;
  const SC = () => root.PeelSewerCap;
  const MA = () => root.PeelMapAnalysis;
  const FS = () => root.PeelFsr;
  const ML = () => root.PeelMapLabels;

/* ---- app.js lines 2362-2847 ---- */
  // ---- Detail panel --------------------------------------------------------------
  // No one's name, contact or note (js/privacy.js): owner, builder, contractor, planner, phone,
  // e-mail, notes… fields are never listed, whatever the source calls them.
  const PRIVATE_FIELD = /owner|applicant|agent|contact|contractor|builder|architect|consult|engineer|planner|phone|email|fax|note|comment|remark|name/i;
  const privateField = k => (root.PeelPrivacy ? root.PeelPrivacy.privateKey(k) : PRIVATE_FIELD.test(k));
  function recordRows(r) {
    const props = r.props && Object.keys(r.props).length ? r.props : null;
    const rows = props
      ? Object.entries(props).filter(([k, v]) => v != null && v !== '' && !/^(shape|globalid)/i.test(k) && !privateField(k)).map(([k, v]) =>
          [k, typeof v === 'number' && v > 1e11 && v < 5e12 && /date|_dt|time/i.test(k) ? fmtDate(new Date(v)) : v])
      : [['File', r.ref], ['Address', r.address], ['Type', r.type], ['Status', r.statusRaw], ['Ward', r.ward],
         ['Units', r.units != null ? fmtNum(r.units) : ''], ['Floor area', r.gfa != null ? fmtNum(r.gfa) : ''],
         ...r.events.map(e => [P.humanizeField(e.label), fmtDate(e.date)])].filter(([, v]) => v !== '' && v != null);
    return rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  }

  // ---- Provenance (Phase 0: trust and transparency) --------------------------------
  // The layer URL for a record: records carry sourceId but not their layer URL, so
  // join the sourceId root (record.sourceId.split('/')[0], e.g. "mis-devapps/6" ->
  // "mis-devapps") against the sources list — live config sources and snapshot
  // sources are both on state.sources (applySnapshot merges them in).
  function sourceUrlFor(r) {
    if (!r || !r.sourceId) return null;
    const root = String(r.sourceId).split('/')[0];
    const s = App().state.sources.find(x => x.id === root || String(x.id).split('/')[0] === root);
    return (s && s.url) || null;
  }
  // One-line provenance for a source record: portal name, a link to the record in
  // its ArcGIS layer, and when the data was pulled; "also in" kept as today. When
  // js/provenance.js failed to load (PV null) this falls back to the old rendering —
  // the page never breaks.
  function recordProvHTML(r) {
    const also = r.alsoIn && r.alsoIn.length ? ` (also in ${esc(r.alsoIn.join(', '))})` : '';
    const mapBtn = r.lat != null ? ` · <button type="button" class="btn small link" data-rec="${esc(r.uid)}">${r.kind === 'permit' ? 'Show on map & parent application' : 'Show on map'}</button>` : '';
    const ri = root.PeelReportIssue;
    if (!PV) return `<p class="small muted">Source: ${esc(r.sourceName)}${also}${mapBtn}${ri ? ` · ${ri.reportLinkHTML(r, { portal: r.sourceName })}` : ''}</p>`;
    const portal = PV.portalFor(r.sourceName);
    const url = PV.recordSourceUrl(r, sourceUrlFor(r), { format: 'html' });
    const pulled = PV.retrievedAt(r, App().state.snapshot && { generatedAt: App().state.snapshot.generatedAt });
    const report = ri ? ` · ${ri.reportLinkHTML(r, { sourceUrl: url, portal, pulledOn: pulled })}` : '';
    const look = PV.applicationSearch ? PV.applicationSearch(r) : null;
    return `<p class="small muted">Source: ${esc(portal)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Record ↗</a>` : ''}${pulled ? ` · pulled ${esc(pulled)}` : ''}${look ? ` · <a href="${esc(look.url)}" target="_blank" rel="noopener" title="Search ${esc(look.ref)} by file number">Find ${esc(look.ref)} on ${esc(look.portal)} ↗</a>` : ''}${also}${mapBtn}${report}</p>`;
  }
  // Per-file records with provenance columns, shared by the audit CSV and the
  // Excel Records sheet: the same rows the audit CSV has always had, extended.
  function recordAuditRows() {
    const meta = App().state.snapshot && { generatedAt: App().state.snapshot.generatedAt };
    const cols = ['project', 'project_address', 'municipality', 'project_units_counted', 'planned', 'permitted', 'file', 'kind', 'file_address', 'file_units', 'file_status', 'phase', 'source', 'also_in', 'portal', 'source_url', 'retrieved_at', 'source_record_id'];
    const rows = [];
    for (const p of App().state.projects) for (const r of p.records) {
      rows.push([p.key, p.title, p.municipality, p.phase === 'cancelled' ? 0 : p.units || 0, p.buildout ? p.buildout.planned : '', p.buildout ? p.buildout.permitted : '',
        r.ref, r.kind, r.address, r.units ?? '', r.statusRaw, r.phase, r.sourceName, (r.alsoIn || []).join('; '),
        PV ? PV.portalFor(r.sourceName) : r.sourceName,
        PV ? PV.recordSourceUrl(r, sourceUrlFor(r)) || '' : '',
        PV ? PV.retrievedAt(r, meta) || '' : '',
        r.uid]);
    }
    return { cols, rows };
  }

  const BASIS_TEXT = {
    master: 'from the rezoning / official plan / subdivision application (largest figure across resubmissions).',
    siteplan: 'site plan phases added up (each tower or block has its own site plan).',
    condo: 'condominium phases added up (each building registered separately).',
    other: 'from the planning applications.',
    precon: 'from the pre-consultation (no later file states a count yet), an early figure that can change.',
  };
  // Phases (separate site plan / condo files on one development).
  function phasesHTML(b) {
    if (!b.phases || b.phases.length < 2) return '';
    const rows = b.phases.map(f => {
      const left = f.permitted != null ? Math.max(0, f.units - f.permitted) : null;
      return `<tr><td>${dot(f.phase)} <strong>${esc(f.ref)}</strong><div class="m">${esc(f.status || '')}${f.date ? ` · ${fmtDate(f.date)}` : ''}</div></td>
        <td>${fmtNum(f.units)}</td><td>${f.permitted != null ? fmtNum(f.permitted) : '–'}</td><td>${left != null ? fmtNum(left) : '–'}</td></tr>`;
    }).join('');
    const matched = b.phases.some(f => f.permitted != null);
    return `<table class="dt phases-table"><caption>Phases (${b.phases.length})</caption>
      <thead><tr><th>File</th><th>Planned</th><th>Permitted</th><th>Left</th></tr></thead><tbody>${rows}</tbody></table>
      ${matched ? '' : '<p class="small muted">Permits can\'t be matched to individual phases here (the phases share one lot boundary); the totals above cover all phases.</p>'}`;
  }

  // Planned units (planning applications) vs units on building permits inside the site,
  // laid out like the phase stepper: planned -> permitted -> completed, then what is left.
  function buildoutHTML(p) {
    const b = p.buildout;
    const permits = p.records.filter(r => r.kind === 'permit').length;
    if (!b) return permits > 1 ? `<p class="small muted">${fmtNum(permits)} building permits on this site.</p>` : '';
    const total = Math.max(b.planned, b.permitted);
    const pct = v => {
      if (!total) return '';
      const x = v / total * 100, r = Math.round(x);
      return ` · ${r === 0 && v > 0 ? '<1' : r === 100 && v < total ? '>99' : r}%`;
    };
    const step = (cls, mark, label, sub, value) =>
      `<li class="${cls}">${mark}<span class="lbl">${label}${sub ? `<span class="desc">${sub}</span>` : ''}</span><span class="when">${value}</span></li>`;
    const reached = v => v > 0 ? 'done' : 'todo';
    const units = v => `${fmtNum(v)} units`;
    return `<details class="sub-sect"><summary><h3 class="sub-title" data-info="buildout">Build-out by stage and phase</h3></summary>
      <ol class="stepper bo-steps">
        ${step('done', dot('approved'), 'Planned', 'Planning applications', units(b.planned))}
        ${step(reached(b.permitted), dot('permit'), 'Permitted', `${fmtNum(b.permits)} building permits${pct(b.permitted)}`, units(b.permitted))}
        ${step(reached(b.completed), dot('completed'), 'Completed', `Permits closed or occupied${pct(b.completed)}`, units(b.completed))}
        ${step('current left', '<span class="dot bo-left-dot" aria-hidden="true"></span>', 'Left to build', `No building permit yet${pct(b.remaining)}`, `<strong>${units(b.remaining)}</strong>`)}
      </ol>
      ${b.permitted > b.planned ? `<p class="small muted">More units are permitted than the applications state, so the permits are used as the development total.</p>` : ''}
      ${b.basis ? `<p class="small muted">Planned units: ${esc(BASIS_TEXT[b.basis] || '')}</p>` : ''}
      ${phasesHTML(b)}</details>`;
  }

  // Employment uses parsed from the applications (industrial, office, retail, hotel, institutional).
  function employmentHTML(p) {
    const e = App().empOf(p);
    if (!e) return '';
    const rows = e.uses.map(u => `<tr><td>${esc(u.label)}</td><td>${u.m2 ? `${fmtNum(u.m2)} m²${u.fromField ? ' <span class="muted">†</span>' : u.fromPermit ? ' <span class="muted">‡</span>' : ''}` : '<span class="muted">not stated</span>'}</td><td>${u.jobs ? fmtNum(u.jobs) : '–'}</td></tr>`).join('');
    const anyField = e.uses.some(u => u.fromField), anyPermit = e.uses.some(u => u.fromPermit);
    return `<details class="sub-sect emp"><summary><h3 class="sub-title" data-info="employment">Employment uses${e.mixed ? ' <span class="muted small">(mixed use)</span>' : ''}</h3>
        <span class="muted small sect-sum">${e.totalM2 ? `${fmtNum(e.totalM2)} m² · ~${fmtNum(e.jobs)} jobs` : 'floor area not stated'}</span></summary>
      <table class="dt"><thead><tr><th>Use</th><th>Floor area</th><th>Est. jobs</th></tr></thead><tbody>${rows}</tbody></table>
      <p class="small muted">Read from the application descriptions${anyField ? '; † non-residential floor area published with the application' : ''}${anyPermit ? '; ‡ new non-residential buildings on the building permits' : ''}. Jobs at ${Object.entries(App().state.criteria.m2PerJob).filter(([k]) => e.uses.some(u => u.key === k)).map(([k, v]) => `${v} m²/job ${k}`).join(', ')} (editable under Breakdown &amp; criteria).</p>
    </details>`;
  }

  // The headline numbers, first thing in the panel: planned, permitted, completed, left to build.
  function summaryHTML(p) {
    const b = p.buildout;
    // Step B1: with the tree count in use, the development's count is the tree's (p.units); the
    // build-out bar still shows progress from the applications and permits. The tree-count note
    // itself is under At a glance (overview-tab.js), shown once.
    const tree = p.count && p.count.mode === 'tree';
    const permits = p.records.filter(r => r.kind === 'permit');
    const tile = (cls, label, value, sub) => `<div class="sum-tile ${cls}"><div class="sl">${label}</div><div class="sv">${value}</div>${sub ? `<div class="ss">${sub}</div>` : ''}</div>`;
    if (b) {
      const total = Math.max(b.planned, b.permitted);
      const pc = v => total ? `${Math.round(v / total * 100)}%` : '';
      const w = v => total ? (v / total * 100).toFixed(2) : 0;
      return `<div class="summary" data-info="buildout">
        <div class="sum-tiles">
          ${tile('s-plan', 'Planned', fmtNum(tree ? p.units || 0 : b.planned), tree ? 'units · tree count' : 'units')}
          ${tile('s-perm', 'Permitted', fmtNum(b.permitted), `${pc(b.permitted)} · ${fmtNum(b.permits)} permits`)}
          ${tile('s-done', 'Completed', fmtNum(b.completed), pc(b.completed))}
          ${tile('s-left', 'Left to build', fmtNum(tree ? Math.max(0, (p.units || 0) - (b.permitted || 0)) : b.remaining), 'no permit yet')}
        </div>
        <div class="sum-bar" role="img" aria-label="${fmtNum(b.completed)} completed, ${fmtNum(Math.max(0, b.permitted - b.completed))} permitted not completed, ${fmtNum(b.remaining)} left to build">
          <span class="bo-done" style="width:${w(b.completed)}%"></span><span class="bo-perm" style="width:${w(Math.max(0, b.permitted - b.completed))}%"></span><span class="bo-left" style="width:${w(b.remaining)}%"></span>
        </div>${typeTableHTML(p)}</div>`;
    }
    const done = permits.filter(r => r.phase === 'completed').length;
    return `<div class="summary"><div class="sum-tiles">
      ${tile('s-plan', 'Units', p.units ? fmtNum(p.units) : p.unitsLost || tree ? '0' : '–', tree ? 'tree count' : p.unitsLost ? `net of ${fmtNum(p.unitsLost)} demolished` : p.units ? 'on the files' : 'not stated')}
      ${tile('s-perm', 'Permits', fmtNum(permits.length), '')}
      ${tile('s-done', 'Completed', fmtNum(done), done ? 'permits' : '')}
      ${tile('s-left', 'Applications', fmtNum(p.records.length - permits.length), '')}
    </div>${typeTableHTML(p)}</div>`;
  }

  // Under the headline tiles: the same four columns by dwelling type, plus employment floor
  // space (which moves with the project's phase: there are no per-unit permits for it).
  const TYPE_SOURCE = {
    mix: 'Types from the unit mix published with the application.',
    text: 'Types from the counts in the application description.',
    permits: 'Types from the building permits; the rest of the plan from the application description.',
    guess: 'Type read from the application description.',
  };
  function typeTableHTML(p) {
    const t = p.buildout ? D.typeBuildout(p) : null;
    const e = App().empOf(p);
    const rows = [];
    if (t) {
      for (const ut of D.UNIT_TYPES) {
        const r = t.rows[ut.key];
        if (!(r.planned || r.permitted || r.completed || r.left)) continue;
        const c = v => v ? fmtNum(v) : '<span class="muted">–</span>';
        rows.push(`<tr><td>${esc(ut.label)}</td><td>${c(r.planned)}</td><td>${c(r.permitted)}</td><td>${c(r.completed)}</td><td>${c(r.left)}</td></tr>`);
      }
    }
    if (e && e.totalM2 > 0) {
      const ph = p.phase;
      const v = on => on ? `${fmtNum(e.totalM2)}` : '<span class="muted">–</span>';
      rows.push(`<tr class="emp-row" data-info="employment"><td>Employment <span class="muted">m²</span><div class="muted small">~${fmtNum(e.jobs)} jobs · ${esc(e.uses.filter(u => u.m2).map(u => u.label.split(' /')[0].toLowerCase()).join(', '))}</div></td>
        <td>${fmtNum(e.totalM2)}</td><td>${v(App().EMP_DONE.permitted.has(ph))}</td><td>${v(App().EMP_DONE.completed.has(ph))}</td><td>${v(!App().EMP_DONE.permitted.has(ph) && ph !== 'cancelled')}</td></tr>`);
    }
    if (!rows.length) return '';
    const notes = [t ? TYPE_SOURCE[t.source] : '', e && e.totalM2 > 0 ? 'Employment floor space follows the development phase.' : ''].filter(Boolean).join(' ');
    return `<table class="dt type-table" data-info="unit-types"><thead><tr><th></th><th>Planned</th><th>Permitted</th><th>Completed</th><th>Left</th></tr></thead>
      <tbody>${rows.join('')}</tbody></table><p class="small muted type-note">${notes}</p>`;
  }

  // Source records grouped by type (zoning / subdivision, site plan, condominium,
  // pre-consultation, building permits), each group oldest first and opening to its files.
  const REC_GROUPS = [
    ['master', 'Official plan / zoning / subdivision'], ['siteplan', 'Site plan'], ['condo', 'Condominium'],
    ['precon', 'Pre-consultation'], ['other', 'Other applications'], ['permit-new', 'Building permits – new units'], ['permit', 'Building permits – other'],
  ];
  function recGroup(r) {
    if (r.kind === 'permit') return P.permitAddsUnits(r) && r.units > 0 ? 'permit-new' : 'permit';
    return r.stage || P.stageOf(r);
  }

  // Servicing demand for one project. Peaking uses the project's own population (local
  // sewer / watermain sizing), so it is higher than its share of the regional total.
  function demandHTML(p, intro = '', nested = false, sys = null) {
    const c = App().state.criteria;
    // Total = completed (finished permits) + remaining (everything not yet completed).
    const cols = [['all', 'Total'], ['completed', 'Completed'], ['unbuilt', 'Remaining']];
    const es = cols.map(([k]) => D.estimate([p], c, k, App().jobsOf));
    const res = es[0].totalUnits > 0, emp = es[0].employment.jobs > 0;
    if (!res && !emp) return '';
    // Each figure's ⓘ opens its formula with this site's inputs (Total column), the same
    // pattern as the pipe tables: a .calc-i button toggling a hidden .calc-how row.
    const calcBtn = k => `<button type="button" class="calc-i" data-calc="${k}" aria-expanded="false" aria-label="How this is worked out">ⓘ</button>`;
    const row = (label, f, unit = '', k = '', how = '') =>
      `<tr${k ? ' class="calc-row"' : ''}><td>${k ? calcBtn(k) : ''}${label}</td>${es.map(e => `<td>${f(e)}${unit}</td>`).join('')}</tr>` +
      (k ? `<tr class="calc-how" data-calc-how="${k}" hidden><td colspan="${cols.length + 1}">${how}</td></tr>` : '');
    const sub = t => `<tr class="sub"><td colspan="${cols.length + 1}">${t}</td></tr>`;
    const typeNote = D.UNIT_TYPES.filter(t => es[0].units[t.key] > 0).map(t => `${t.label.toLowerCase()} ${c.ppu[t.key]} ppu`).join(', ');
    const W = sys !== 'ww', S = sys !== 'water';
    const T = es[0], EC = c.employment, EJ = T.employment, ls = v => `${fmt1(v)} L/s`;
    const popT = T.population, popTxt = fmtNum(roundPop(popT));
    const howPop = `People = Σ units × persons per unit (${esc(typeNote)}) = <strong>${popTxt} people</strong>.`;
    const howWAvg = `${popTxt} people × ${c.water.avg} L/cap/d ÷ 86,400 s/d = <strong>${ls(T.water.avg)}</strong>.`;
    const howWMax = `${ls(T.water.avg)} average × ${c.water.maxDay} = <strong>${ls(T.water.maxDay)}</strong>.`;
    const howWPeak = `${ls(T.water.avg)} average × ${c.water.peakHour} = <strong>${ls(T.water.peakHour)}</strong>.`;
    const howSAvg = `${popTxt} people × ${c.wastewater.avg} L/cap/d ÷ 86,400 = <strong>${ls(T.wastewater.avg)}</strong>.`;
    const howSPeak = `${ls(T.wastewater.avg)} average × Harmon M = 1 + 14 / (4 + √(P/1000)), P = ${popTxt} people → M ${T.wastewater.peakingFactor.toFixed(2)} (kept ${c.wastewater.peakMin}–${c.wastewater.peakMax}) = <strong>${ls(T.wastewater.peak)}</strong>.`;
    const howII = `${fmt1(T.area.ha)} ha × ${c.wastewater.infiltration} L/s/ha = <strong>${ls(T.wastewater.infiltration)}</strong>${T.area.estimatedHa > 0 ? ' (site area estimated — no boundary in the data)' : ''}.`;
    const howSWet = `${ls(T.wastewater.peak)} peak dry + ${ls(T.wastewater.infiltration)} I&amp;I = <strong>${ls(T.wastewater.wetPeak)}</strong>.`;
    const jobsT = EJ.jobs, jobsTxt = fmtNum(Math.round(jobsT));
    const howJobs = `Jobs = floor area ÷ m²/job per use (industrial ${c.m2PerJob.industrial}, office ${c.m2PerJob.office}, retail ${c.m2PerJob.retail}, hotel ${c.m2PerJob.hotel}, institutional ${c.m2PerJob.institutional}) = <strong>${jobsTxt} jobs</strong>.`;
    const howEWAvg = `${jobsTxt} jobs × ${EC.water} L/emp/d ÷ 86,400 = <strong>${ls(EJ.water.avg)}</strong>.`;
    const howEWMax = `${ls(EJ.water.avg)} × ${EC.maxDay} = <strong>${ls(EJ.water.maxDay)}</strong>.`;
    const howEWPeak = `${ls(EJ.water.avg)} × ${EC.peakHour} = <strong>${ls(EJ.water.peakHour)}</strong>.`;
    const howESAvg = `${jobsTxt} jobs × ${EC.wastewater} L/emp/d ÷ 86,400 = <strong>${ls(EJ.wastewater.avg)}</strong>.`;
    const howESPeak = `${ls(EJ.wastewater.avg)} × Harmon M on ${jobsTxt} jobs (kept ${EC.peakMin}–${EC.peakMax}) = M ${EJ.wastewater.peakingFactor.toFixed(2)} → <strong>${ls(EJ.wastewater.peak)}</strong>.`;
    const howESWet = `${ls(EJ.wastewater.peak)} + ${ls(EJ.wastewater.infiltration)} I&amp;I = <strong>${ls(EJ.wastewater.wetPeak)}</strong>.`;
    const howTMax = `${ls(T.water.maxDay)} residential + ${ls(EJ.water.maxDay)} employment = <strong>${ls(T.combined.water.maxDay)}</strong>.`;
    const howTPeak = `${ls(T.water.peakHour)} residential + ${ls(EJ.water.peakHour)} employment = <strong>${ls(T.combined.water.peakHour)}</strong>.`;
    const howTSWet = `${ls(T.wastewater.wetPeak)} residential + ${ls(EJ.wastewater.wetPeak)} employment = <strong>${ls(T.combined.wastewater.wetPeak)}</strong>.`;
    const resRows = !res ? '' : `
        ${row('Units', e => fmtNum(Math.round(e.totalUnits)))}
        ${row('Population', e => fmtNum(roundPop(e.population)), '', 'pop', howPop)}
        ${W ? `${sub(`Water (L/s)${emp ? ' · residential' : ''}`)}
        ${row('Average day', e => fmt1(e.water.avg), '', 'wavg', howWAvg)}
        ${row(`Max day ×${c.water.maxDay}`, e => fmt1(e.water.maxDay), '', 'wmax', howWMax)}
        ${row(`Peak hour ×${c.water.peakHour}`, e => fmt1(e.water.peakHour), '', 'wpeak', howWPeak)}` : ''}
        ${S ? `${sub(`Wastewater (L/s)${emp ? ' · residential' : ''}`)}
        ${row('Average dry weather', e => fmt1(e.wastewater.avg), '', 'savg', howSAvg)}
        ${row('Peak dry (Harmon)', e => e.population > 0 ? `${fmt1(e.wastewater.peak)} <span class="muted">M ${e.wastewater.peakingFactor.toFixed(2)}</span>` : '–', '', 'speak', howSPeak)}
        ${row(`I&amp;I (${c.wastewater.infiltration} L/s/ha)`, e => e.area.ha > 0 ? `${fmt1(e.wastewater.infiltration)} <span class="muted">${fmt1(e.area.ha)} ha${e.area.estimatedHa > 0 ? ' est.' : ''}</span>` : '–', '', 'ii', howII)}
        ${row('Peak wet weather', e => e.population > 0 ? fmt1(e.wastewater.wetPeak) : '–', '', 'swet', howSWet)}` : ''}`;
    const m = e => e.employment;
    const empRows = !emp ? '' : `
        ${sub('Employment (L/s)')}
        ${row('Jobs', e => m(e).jobs > 0 ? fmtNum(Math.round(m(e).jobs)) : '–', '', 'jobs', howJobs)}
        ${W ? `${row(`Water average · ${c.employment.water} L/emp/d`, e => m(e).jobs > 0 ? fmt1(m(e).water.avg) : '–', '', 'ewavg', howEWAvg)}
        ${row(`Water max day ×${c.employment.maxDay}`, e => m(e).jobs > 0 ? fmt1(m(e).water.maxDay) : '–', '', 'ewmax', howEWMax)}
        ${row(`Water peak hour ×${c.employment.peakHour}`, e => m(e).jobs > 0 ? fmt1(m(e).water.peakHour) : '–', '', 'ewpeak', howEWPeak)}` : ''}
        ${S ? `${row(`Wastewater average · ${c.employment.wastewater} L/emp/d`, e => m(e).jobs > 0 ? fmt1(m(e).wastewater.avg) : '–', '', 'esavg', howESAvg)}
        ${row('Wastewater peak', e => m(e).jobs > 0 ? `${fmt1(m(e).wastewater.peak)} <span class="muted">M ${m(e).wastewater.peakingFactor.toFixed(2)}</span>` : '–', '', 'espeak', howESPeak)}
        ${m(es[0]).area.ha > 0 ? row(`I&amp;I (${c.wastewater.infiltration} L/s/ha)`, e => m(e).jobs > 0 ? `${fmt1(m(e).wastewater.infiltration)} <span class="muted">${fmt1(m(e).area.ha)} ha</span>` : '–', '', 'esii', howESWet) : ''}
        ${row('Peak wet weather', e => m(e).jobs > 0 ? fmt1(m(e).wastewater.wetPeak) : '–', '', 'eswet', howESWet)}` : ''}`;
    const totRows = !(res && emp) ? '' : `
        ${sub('Total · residential + employment (L/s)')}
        ${W ? row('Water max day', e => fmt1(e.combined.water.maxDay), '', 'twmax', howTMax) : ''}
        ${W ? row('Water peak hour', e => fmt1(e.combined.water.peakHour), '', 'twpeak', howTPeak) : ''}
        ${S ? row('Wastewater peak wet weather', e => fmt1(e.combined.wastewater.wetPeak), '', 'tswet', howTSWet) : ''}`;
    const notes = [];
    if (res) notes.push(`${esc(typeNote)}; ${c.water.avg} L/cap/d water, ${c.wastewater.avg} L/cap/d wastewater; I&amp;I on ${es[0].area.estimatedHa > 0 ? 'an estimated site area (no boundary in the data)' : 'the application boundary area'}, split by share of units.`);
    if (emp) notes.push(`Jobs from the floor areas in the Employment section; ${c.employment.water} L/emp/d water, ${c.employment.wastewater} L/emp/d wastewater, peaking ${c.employment.peakMin}–${c.employment.peakMax}${res ? '' : m(es[0]).area.ha > 0 ? '; I&amp;I on the application boundary' : '; no boundary, so no I&amp;I'}. Jobs count as completed once the development is completed.`);
    return `<details class="${nested ? 'sub-sect' : 'sect'}"><summary>${nested ? '<h3 class="sub-title" data-info="project-demand">Demand by stage: total, completed, remaining</h3>' : '<h2 class="section-title" data-info="project-demand">Servicing demand</h2>'}${emp ? `<span class="muted small sect-sum">${res ? 'residential + ' : ''}${fmtNum(Math.round(m(es[0]).jobs))} jobs</span>` : ''}</summary>${intro}
      ${SCREEN_NOTE}<table class="dt demand-table"><thead><tr><th></th>${cols.map(([, l]) => `<th>${l}</th>`).join('')}</tr></thead><tbody>
        ${resRows}${empRows}${totRows}
      </tbody></table>
      <p class="small muted">${notes.join(' ')}
        ${res ? 'Completed = units on finished permits; remaining = the rest, permitted or not. ' : ''}Peaks are for each column alone (peaking is not additive); edit the criteria in the Scenario control.</p></details>`;
  }

  // Why a development is where it is: the file and status behind its phase, signals in the
  // municipal status text (appeals, inactivity, lapses, withdrawals, resubmissions, council
  // endorsement, draft approval), and whether it has stalled. Council and committee items that
  // name its file numbers are added when data/council.json is published.
  const STATUS_SIGNALS = [
    [/\b(OMB|OLT|LPAT)\b|appeal/i, 'appeal', 'Under appeal to the Ontario Land Tribunal (formerly the OMB / LPAT) — the decision rests with the Tribunal'],
    [/withdrawn/i, 'stop', 'Withdrawn by the applicant'],
    [/refused/i, 'stop', 'Refused'],
    [/cancel|revoked/i, 'stop', 'Cancelled or revoked'],
    [/deemed abandoned|lapsed|expired/i, 'stop', 'Lapsed, expired or deemed abandoned'],
    [/inactive/i, 'stall', 'Marked inactive by the municipality (no activity on the file)'],
    [/recirculation|resubmi/i, 'info', 'Resubmission being recirculated for comments (revisions after the first review)'],
    [/initial submission rejected|incomplete|invalid/i, 'info', 'Submission rejected, incomplete or invalid — waiting on the applicant'],
    [/public mtg complete|public meeting/i, 'info', 'Statutory public meeting held; recommendation report to follow'],
    [/pre.?public mtg|pre public/i, 'info', 'Awaiting the statutory public meeting'],
    [/comments released/i, 'info', 'Pre-consultation comments released to the applicant'],
    [/staff review complete|satisfactory/i, 'info', 'Staff review complete'],
    [/endorsed by council|adoption|adopted/i, 'ok', 'Endorsed or adopted by council'],
    [/draft approv/i, 'ok', 'Draft approved — conditions to clear before registration'],
    [/registered|registration|m-plan/i, 'ok', 'Plan registered or being registered'],
    [/agreement/i, 'ok', 'Agreement being prepared or executed'],
    [/\bmzo\b/i, 'ok', "Approved by Minister's Zoning Order"],
    // Mississauga lists "Withheld" among its active statuses (City Planning Data Hub): an open
    // file with no decision yet, never in its approved layer.
    [/withheld/i, 'info', 'Active application, no decision yet'],
  ];
  // Council and committee items naming the development's files (data/council.json, loaded on
  // first use): date, meeting, item, outcome, the reports and correspondence attached, and the
  // minutes text (discussion, motion and vote) — the reasons behind decisions.
  let councilLoading = null;
  function loadCouncil() {
    if (App().state.council || councilLoading) return;
    councilLoading = fetch('data/council.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
      App().state.council = d || { meetings: {}, files: {} };
      if (typeof DevScope !== 'undefined' && DevScope.current()) DevScope.refresh();
    }).catch(() => { App().state.council = { meetings: {}, files: {} }; });
  }
  function councilItems(p) {
    const C = App().state.council; if (!C || !C.files) return [];
    const keys = new Set();
    for (const r of p.records) if (r.kind === 'application' && r.ref) {
      const k = r.fileKey || P.canonRef(r.ref); if (!k) continue;
      keys.add(`${p.municipality}|${k}`);
      if (/^OZ\|OPA\|/.test(k)) { keys.add(`${p.municipality}|${k.replace(/^OZ\|OPA\|/, 'OZ|')}`); }
      if (/^OZ\|\d/.test(k)) keys.add(`${p.municipality}|${k.replace(/^OZ\|/, 'OZ|OPA|')}`);
    }
    const seen = new Set(), out = [];
    for (const k of keys) for (const [mid, i] of C.files[k] || []) {
      const id = `${mid}#${i}`; if (seen.has(id)) continue; seen.add(id);
      const m = C.meetings[mid]; if (m && m.items[i]) out.push({ m, it: m.items[i] });
    }
    return out.sort((a, b) => b.m.date.localeCompare(a.m.date));
  }
  const OUTCOME_LABEL = { CARRIED: 'Carried', 'CARRIED AS AMENDED': 'Carried as amended', DEFEATED: 'Defeated', LOST: 'Lost', DEFERRED: 'Deferred', REFERRED: 'Referred', RECEIVED: 'Received', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', ADOPTED: 'Adopted' };
  // ---- Development panel: a brief first (status, latest decision, servicing, build-out), then
  // one dated history (phase changes, council and committee items, file and permit events) and
  // the details (servicing, units, aerial, source records), each opened when needed.
  const B = window.PeelBrief;
  // Council items with their brief (verdict, motion, issues raised, requirements), newest first.
  const briefCache = new WeakMap();
  function councilBriefs(p) {
    const c = briefCache.get(p);
    if (c && c.C === App().state.council) return c.list;
    const refs = p.records.filter(r => r.kind === 'application' && r.ref).map(r => r.ref);
    const list = councilItems(p).map(x => ({ ...x, s: B.summarizeItem(x.it, x.m.passed, refs) }));
    briefCache.set(p, { C: App().state.council, list });
    return list;
  }
  // Status: the event behind the current phase, signals in the status text, stalled or not.
  // Zoning approved, but no draft plan or site plan approved yet: the development stays under review.
  function planApprovedNote(p) {
    // Zoning approved (a zoning file approved, or a zoning by-law passed at council) with no draft or
    // site plan approved yet: the development stays under review (SPEC 1.2).
    const z = p.zoningApproved;
    if (z && p.rank < P.PHASE_BY_KEY.approved.rank) return `Zoning approved${z.bylaws.length ? ` (By-law ${z.bylaws.slice(0, 3).join(', ')}${z.date ? `, ${z.date}` : ''})` : z.date ? ` (${z.date})` : ''}${z.refs.length ? ` on ${z.refs.slice(0, 3).join(', ')}` : ''}; no draft plan or site plan approved yet`;
    const a = p.planApproved;
    if (!a || p.rank >= P.PHASE_BY_KEY.approved.rank) return '';
    const sp = p.records.some(r => r.kind === 'application' && r.stage === 'siteplan' && r.phase !== 'cancelled');
    return `Official plan / condominium approved${a.refs.length ? ` (${a.refs.slice(0, 2).join(', ')}${a.date ? `, ${fmtDate(a.date)}` : ''})` : ''}; ${sp ? 'site plan not yet approved' : 'no draft plan or site plan approved yet'}`;
  }

  function statusOf(p) {
    const apps = p.records.filter(r => r.kind === 'application');
    const seen = new Map();
    for (const r of apps) for (const [re, kind, text] of STATUS_SIGNALS) if (re.test(r.statusRaw || '')) {
      if (!seen.has(text)) seen.set(text, { kind, text, files: [], main: false });
      seen.get(text).files.push(`${r.ref || 'file'} (“${r.statusRaw}”)`);
      if (recGroup(r) !== 'precon') seen.get(text).main = true;
      break;
    }
    // The latest event of the phase on a file that set it (not a sign or servicing permit, say).
    const setBy = p.phaseRecs && p.phaseRecs.length ? new Set(p.phaseRecs.map(r => r.uid)) : null;
    const ev = p.timeline.filter(t => t.phase === p.phase && (!setBy || setBy.has(t.record))).sort((a, b) => b.date - a.date)[0];
    const label = P.PHASE_BY_KEY[p.phase].label;
    const why = ev ? `${esc(label)} since ${fmtDate(ev.date)} — ${esc(ev.text.replace(/^[^·]*· /, ''))} on ${esc(ev.tag)}` : `${esc(label)}: from the status of ${esc(apps.map(r => `${r.ref} (“${r.statusRaw}”)`).slice(0, 2).join(', ') || 'its files')}`;
    const pa = planApprovedNote(p);
    const why2 = pa ? `${why}. ${esc(pa)}` : why;
    // SPEC 1.3: active · stalled · under appeal, on the latest file event, permit or council item.
    const ps = P.proposedStateOf(p);
    const stalled = !!ps && ps.state === 'stalled', appealed = !!ps && ps.state === 'appeal';
    const lastAt = P.lastActivityOf(p);
    const years = lastAt ? (Date.now() - lastAt) / (365.25 * 864e5) : 0;
    const RANK = { appeal: 0, stop: 1, stall: 2, ok: 3, info: 4 };
    const sig = [...seen.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    const cause = stalled ? (sig.find(x => x.kind === 'appeal') ? 'while under appeal' : sig.find(x => x.kind === 'stall') ? 'and marked inactive' : sig.find(x => /Draft approved/.test(x.text)) ? 'after draft approval (conditions not yet cleared)' : 'with no reason in the municipal data — check the council and committee items') : '';
    // The most recently active application and its status text.
    const lastOf = r => r.events.length ? Math.max(...r.events.map(e => +e.date)) : 0;
    const latest = apps.slice().sort((a, b) => lastOf(b) - lastOf(a))[0];
    return { sig, why: why2, stalled, appealed, state: ps ? ps.state : null, years, lastAt, cause, latest, latestAt: latest ? lastOf(latest) : 0 };
  }

  const psName = a => SV().drName(a).replace(/^[^·]+· /, '');
  const trigger = () => (App().state.reports && App().state.reports.masterPlan && App().state.reports.masterPlan.plantTriggerPct) || 90;
  const chip = (html, cls = '') => `<span class="chip${cls ? ` ${cls}` : ''}">${html}</span>`;
  // A flag that opens its answer: a button with ▸ (the History event, the facility, the DC work).
  const chipGo = (html, cls, at, title) => `<button type="button" class="chip chip-link${cls ? ` ${cls}` : ''}" ${Object.entries(at).map(([k, v]) => `${k}="${esc(v)}"`).join(' ')}${title ? ` title="${esc(title)}"` : ''}>${html} <span class="aer-car" aria-hidden="true">▸</span></button>`;
  const outBadge = (it, s) => it.outcome || s.vote ? `<span class="c-out c-${String(it.outcome || s.vote).toLowerCase().replace(/\s.*$/, '')}">${esc(s.vote || OUTCOME_LABEL[it.outcome] || it.outcome)}</span>` : '';
  const pctOf = (a, b) => b > 0 ? `${(a / b * 100) < 1 ? (a / b * 100).toFixed(2) : Math.round(a / b * 100)}%` : '–';

  // Flags for the header: what an infrastructure planner should look at first.
  function devFlags(p, st, f) {
    const out = [];
    if (st.sig.some(x => x.kind === 'appeal')) out.push(chipGo('Under appeal (OLT)', 'warn', { 'data-dev-hist': 'council' }, 'The appeal in History, with its council items'));
    // (zoning approved is in the header's status line; the by-law that passed it stays here)
    if (p.zoningApproved && p.rank < P.PHASE_BY_KEY.approved.rank && p.zoningApproved.bylaws.length) out.push(chipGo(`Zoning by-law ${esc(p.zoningApproved.bylaws[0])}`, '', { 'data-dev-hist': 'council' }, 'The by-law in History'));
    // Bundle 6: the holding (H) symbol, from an application to lift it.
    if (p.holding) out.push(chipGo(p.holding.open ? `Holding (H): removal in review (${esc(p.holding.refs[0] || 'file')})` : `Holding (H) lifted (${esc(p.holding.refs[0] || 'file')})`, p.holding.open ? 'warn' : '', p.holding.refs[0] ? { 'data-dev-file': p.holding.refs[0] } : { 'data-dev-hist': 'file' }, 'H (holding symbol): zoning that needs a condition met, often servicing, before building. Opens the file in History'));
    // Bundle 6: links in its file tree made by overlap only (low confidence): one tap to the tree.
    { const FT = root.PeelFileTree, d = FT && FT.of(p), n = d ? FT.summary(d).check : 0;
      if (n) out.push(`<button type="button" class="chip chip-link" data-tree-check title="Files linked to this development by overlap only: check them in Records › Files">${n} link${n === 1 ? '' : 's'} to check</button>`); }
    const dm = P.dormantOf(p);
    if (dm) out.push(chipGo(`Dormant ${dm.years.toFixed(1)} yrs`, 'warn', { 'data-dev-hist': '' }, `No activity for over ${dm.limit} years: ${App().state.showDormant ? 'included in the counts because dormant developments are shown' : 'left out of the counts (Find › include dormant)'}`));
    else if (st.stalled) out.push(chipGo(`Stalled ${st.years.toFixed(1)} yrs`, 'warn', { 'data-dev-hist': '' }, 'History: the last activity'));
    if (st.works && st.works.gap) out.push(chipGo(`Needs planned main ${st.works.needBy}`, 'warn', { 'data-at': 'dca:timing' }, 'The DC work and its timing, in Capital'));
    if (f) {
      for (const s of f.sps) if (s.wet >= s.firm) out.push(chipGo(`${esc(psName(s.a))} ${Math.round(s.wet / s.firm * 100)}% of firm`, 'warn', { 'data-ss': s.a.id }, 'The pumping station: what loads it, and relief'));
      if (f.cap) {
        if (f.reserve <= 0) out.push(chipGo(`${esc(SV().PLANT_SHORT[f.pl] || f.pl)} over rated capacity`, 'warn', { 'data-ss': `plant:${f.pl}` }, 'The plant: its limit and relief'));
        else if (f.cap.committed / f.cap.rated >= trigger() / 100) out.push(chipGo(`${esc(SV().PLANT_SHORT[f.pl] || f.pl)} ≥${trigger()}% past plan approval (MECP D-5-1)`, 'warn', { 'data-ss': `plant:${f.pl}` }, 'The plant: its limit and relief'));
      }
    }
    return out;
  }

  // The latest council / committee decision in brief, plus what all the items raised.
  function latestDecisionHTML(p, st) {
    const loaded = App().state.council && Object.keys(App().state.council.files || {}).length;
    const fileStatus = st.latest ? `Latest file status: <strong>${esc(st.latest.ref || 'file')}</strong> “${esc(st.latest.statusRaw || 'no status')}”${st.latestAt ? ` (${fmtDate(new Date(st.latestAt))})` : ''}.` : '';
    if (!App().state.council) return `<p class="small muted">Loading council and committee items…</p>${fileStatus ? `<p class="small">${fileStatus}</p>` : ''}`;
    const list = loaded ? councilBriefs(p) : [];
    if (!list.length) return `<p class="small">${fileStatus} <span class="muted">No council or committee items name its files since 2019.</span></p>`;
    const top = B.latestDecisive(list), { m, it, s } = top;
    const newer = list[0] !== top ? list[0] : null;
    const all = B.across(list);
    // (each opens History's council items, where the requirement or issue was raised)
    const chips = (xs, withN) => xs.map(x => `<button type="button" class="chip chip-link${x.infra ? ' infra' : ''}" data-dev-hist="council" title="Where it was raised: the council items in History">${esc(x.label)}${withN && x.n > 1 ? ` ×${x.n}` : ''}</button>`).join('');
    return `<div class="c-brief">
        <div class="c-head small"><span class="d">${esc(m.date)}</span> · ${esc(m.name)} · <button type="button" class="c-kind" data-dev-hist="council" title="The council items in History">${esc(s.kind)}</button> ${outBadge(it, s)}</div>
        <p class="c-verdict">${s.verdict ? `<strong>${esc(s.verdict)}</strong>` : ''}${s.verdict && s.verdict.startsWith(it.title) ? '' : `${s.verdict ? ' — ' : ''}${esc(it.title)}`}</p>
        ${s.decision ? `<p class="small c-motion">${esc(s.decision)}</p>` : ''}
        ${newer ? `<p class="small">Since then: <span class="d">${esc(newer.m.date)}</span> · ${esc(newer.s.kind)}${newer.s.verdict ? ` — ${esc(newer.s.verdict)}` : ''} · <span class="muted">${esc(newer.it.title)}</span></p>` : ''}
        ${all.requirements.length ? `<div class="chips small"><span class="ck">Requirements on record</span>${chips(all.requirements)}</div>` : ''}
        ${all.concerns.length ? `<div class="chips small"><span class="ck">Issues raised</span>${chips(all.concerns, true)}</div>` : ''}
        <p class="small muted">${list.length > 1 ? `${fmtNum(list.length)} council and committee items since ${esc(list[list.length - 1].m.date.slice(0, 4))}` : 'One council or committee item'} — <button type="button" class="btn small link" data-dt-open="devtab-hist">all in History</button>. ${fileStatus}</p>
      </div>`;
  }

  // Servicing in one or two lines: flows, pressure zone, sewer path constraint, plant reserve.
  function servicingBriefHTML(p, f) {
    if (!f) return SV().servicingLineHTML(p) || '<p class="small muted">No units or jobs stated — flows not estimated.</p>';
    const cb = f.cb, lines = [];
    lines.push(`<strong>Water</strong> ${uLs(cb.water.maxDay)} max day, ${uLs(cb.water.peakHour)} peak hour${f.z ? ` · ${esc(f.z.name.replace('Pressure zone ', 'Zone '))}${f.zMax ? ` (${pctOf(D.toMLd(cb.water.maxDay), f.zMax)} of its build-out max day)` : ''}` : ' · no pressure zone'} ${estTag}`);
    const ps = f.sps.slice().sort((a, b) => b.wet / b.firm - a.wet / a.firm)[0];
    if (f.zNear || f.dNear) lines.push(`<span class="est-line">Outside the ${[f.zNear && 'mapped pressure zones', f.dNear && 'traced catchments'].filter(Boolean).join(' and ')} — assigned to: ${[f.zNear && `${esc(f.z.name.replace('Pressure zone ', 'Zone '))} (${esc(SV().nearText(f.zNear))})`, f.dNear && f.path[0] && `${esc(SV().drName(f.path[0]))} (${esc(SV().nearText(f.dNear))})`].filter(Boolean).join(', ')}. A screening estimate: the connection point comes from the FSR / master plan.</span>`);
    lines.push(`<strong>Wastewater</strong> ${uLs(cb.wastewater.peak)} peak dry, ${uLs(cb.wastewater.wetPeak)} peak wet${cb.wastewater.infiltration > 0 ? ` <span class="muted">(${esc(D.iiText(cb.wastewater.infiltration, App().state.criteria))})</span>` : ''}${ps ? ` · via ${esc(psName(ps.a))} (build-out ≈${Math.round(ps.wet / ps.firm * 100)}% of firm, peak wet)` : ''} ${estTag}`);
    const pp = SC().pathPipes(p);
    const pipeTxt = x => `${x.p[0]} mm at <strong>${Math.round(x.r1 * 100)}%</strong> <button type="button" class="btn small link" data-pipe="${x.i}">what loads it</button>`;
    if (PIPE_RESULTS && pp && pp.worst) lines.push(`<strong>Sewer pipes</strong> (load / full capacity at ${MA().getCapYear() == null ? 'build-out' : MA().getCapYear()}): ${pp.local ? `local tightest ${pipeTxt(pp.local)}` : ''}${pp.local && pp.trunk ? ' · ' : ''}${pp.trunk ? `downstream trunk tightest ${pipeTxt(pp.trunk)}` : ''}`);
    if (f.cap) lines.push(`<strong>${esc(f.cap.name)}</strong> ${window.PeelUtil.reserveWords(f.reserve, f.cap.rated)}${f.reserve > 0 ? ` — this development ${f.layer === 'proposed' ? 'would use' : f.layer === 'built' ? 'is in the existing flow,' : 'is committed,'} ${pctOf(f.use, f.reserve)} of it (${window.PeelUtil.capTxt(f.use, f.cap.rated)}, ${esc(f.useNote)})` : ' — the plant screens over rated capacity'} ${estTag}`);
    else if (f.pl === 'Toronto') lines.push('Drains to the City of Toronto system (Malton).');
    return `${SCREEN_NOTE}<ul class="b-lines small">${lines.map(l => `<li>${l}</li>`).join('')}</ul>
      <p class="small"><button type="button" class="btn small link" data-open="dev-svc">Flows, sewer path and demand by stage</button></p>`;
  }

  function buildoutBriefHTML(p) {
    const b = p.buildout;
    if (!b) {
      const permits = p.records.filter(r => r.kind === 'permit').length;
      return `<p class="small">${p.units ? `${uUnits(p.units)} on the files` : p.unitsLost ? 'No net new homes' : 'Units not stated'}${netNote(p)}${permits ? ` · ${fmtNum(permits)} building permits` : ''}</p>`;
    }
    const total = Math.max(b.planned, b.permitted), w = v => total ? (v / total * 100).toFixed(2) : 0;
    return `<div class="sum-bar" role="img" aria-label="${fmtNum(b.completed)} completed, ${fmtNum(Math.max(0, b.permitted - b.completed))} permitted not completed, ${fmtNum(b.remaining)} left to build">
        <span class="bo-done" style="width:${w(b.completed)}%"></span><span class="bo-perm" style="width:${w(Math.max(0, b.permitted - b.completed))}%"></span><span class="bo-left" style="width:${w(b.remaining)}%"></span></div>
      <p class="small">${uUnits(b.planned)} planned${netNote(p)} · ${fmtNum(b.permitted)} permitted · ${fmtNum(b.completed)} completed · <strong>${uUnits(b.remaining)} left</strong> <button type="button" class="btn small link" data-open="dev-units">by type and phase</button></p>`;
  }

  // The brief in two parts: 'overview' (status, decision, build-out, proposal) and 'servicing'
  // (servicing summary, existing mains, fire flow, stormwater, planned works, DC needs).
  function devBriefHTML(p, st, f, part = 'overview', opts = {}) {
    const row = (k, body) => `<div class="b-row"><div class="b-k">${k}</div><div class="b-v">${body}</div></div>`;
    const status = `<p class="small">${st.why}</p>
      ${(dm => dm ? `<p class="small why-stall"><strong>Dormant:</strong> no file event, permit or council item since ${fmtDate(new Date(dm.last))} (${dm.years.toFixed(1)} years, over the ${dm.limit} a development at this stage usually waits), so its homes are ${App().state.showDormant ? 'counted only because dormant developments are shown' : 'left out of every count unless dormant developments are included'}.</p>` : '')(P.dormantOf(p))}
      ${st.stalled && !P.dormantOf(p) ? `<p class="small why-stall"><strong>Stalled:</strong> no file event, permit or council item since ${fmtDate(new Date(st.lastAt))} (${st.years.toFixed(1)} years), ${st.cause}.</p>` : ''}
      ${(x => x && x.kind !== 'info' ? `<p class="small why-${x.kind}-t">${esc(x.text)} <span class="muted">· ${esc(x.files[0])}</span></p>` : '')(st.sig.find(x => x.main))}
      ${p.phase === 'cancelled' ? `<p class="small">${dot('cancelled')} All files on this site are withdrawn, refused or cancelled.</p>` : ''}`;
    if (part === 'overview') return `<section class="brief" data-info="dev-brief">
      ${row('Status', status)}
      ${row('Latest decision', latestDecisionHTML(p, st))}
      ${row('Build-out', buildoutBriefHTML(p))}
      ${p.records.some(r => r.kind === 'application') ? row('Servicing report', FS().fsrBoxHTML(p)) : ''}
      ${p.description ? row('Proposal', `<p class="desc-clamp small">${esc(p.description)}</p>`) : ''}

    </section>`;
    return FS().devServicingBriefHTML(p, st, f, part, opts);
  }

  // ---- Public contract ----
  const api = { recordRows, recordProvHTML, recordAuditRows, phasesHTML, buildoutHTML, employmentHTML, summaryHTML, typeTableHTML, demandHTML, STATUS_SIGNALS, loadCouncil, councilItems, councilBriefs, planApprovedNote, statusOf, devFlags, latestDecisionHTML, servicingBriefHTML, buildoutBriefHTML, devBriefHTML, chip, pctOf, outBadge, psName, trigger };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelDevDetail = api;
})(typeof window !== 'undefined' ? window : globalThis);
