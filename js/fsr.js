/* js/fsr.js — Functional Servicing Report links + development Servicing/Demand/History/Units tab HTML (Phase 6 extraction).
 * Extracted verbatim from js/app.js (lines 2848-3205, 3207-3215); the only edits are the
 * reference rewrites in SPLIT_MAP.md §0 rule 4.
 * Note: `chip(` calls here are the shared chip (via PeelDevDetail); `dmSys` is module-local
 * (getDmSys/setDmSys); DV_TABS/showDvTab live here per the ranges and are re-exported
 * by js/dev-nav.js.
 */
(function (root) {
  'use strict';

  // ---- Guarded lazy accessors (this module loads before js/app.js installs PeelApp) ----
  const { $, esc, fmtNum, fmtDate, fmt1, skel, estTag, dot, store } = root.PeelUtil;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const App = () => root.PeelApp;
  const DD = () => root.PeelDevDetail;
  const MP = () => root.PeelMasterPlan;
  const DC = () => root.PeelDcCost;
  const DI = () => root.PeelDcInfra;
  const SC = () => root.PeelSewerCap;
  const SD = () => root.PeelSvcData;
  const DN = () => root.PeelDevNav;
  const DV = () => root.PeelDevVerdict;
  const WT = () => root.PeelWaterTrace;
  const MA = () => root.PeelMapAnalysis;

/* ---- app.js lines 2848-3205 ---- */
  // ---- Functional Servicing Report links (data/fsr.json, scripts/build-fsr.js) -----------------
  const FSR = { data: null, loading: null, by: null };
  function loadFsr() {
    if (FSR.data || FSR.loading) return FSR.loading || Promise.resolve(FSR.data);
    FSR.loading = fetch('data/fsr.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(d => {
      FSR.data = d || { items: [] }; FSR.by = new Map();
      for (const it of FSR.data.items) for (const k of it.keys) (FSR.by.get(`${it.muni}|${k}`) || FSR.by.set(`${it.muni}|${k}`, []).get(`${it.muni}|${k}`)).push(it);
      FSR.loading = null; return FSR.data;
    });
    return FSR.loading;
  }
  // The application pages matching a development's files; the newest FSR among them.
  function fsrFor(p) {
    if (!FSR.by) return null;
    // Caledon numbers each type separately (RZ 2025-0010, SPA 2025-0010): its bare year-number keys
    // carry the type's prefix, as the application pages write them.
    const CAL = { 'Zoning by-law amendment': 'RZ', 'Site plan': 'SPA', 'Official plan amendment': 'POPA' };
    const keys = [...new Set(p.records.filter(r => r.kind === 'application' && r.fileKey).map(r => p.municipality === 'Caledon' && /^\d{4}\|/.test(r.fileKey) ? (CAL[r.type] ? `${CAL[r.type]}|${r.fileKey}` : null) : r.fileKey).filter(Boolean))];
    const items = [...new Set(keys.flatMap(k => FSR.by.get(`${p.municipality}|${k}`) || []))];
    const withF = items.filter(i => i.fsr).sort((a, b) => (b.fsr.date || '').localeCompare(a.fsr.date || ''));
    return { items, best: withF[0] || null };
  }
  const FSR_HOME = { Brampton: ['BramPlanOnline', 'https://www.brampton.ca/EN/Business/planning-development/Pages/applications.aspx'], Mississauga: ['Mississauga development applications', 'https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/active-development-applications/'], Caledon: ['Caledon development applications', 'https://www.caledon.ca/en/town-services/development-applications.aspx'] };
  function fsrInnerHTML(p) {
    if (!FSR.by) { loadFsr().then(() => { if (DN().getCurrentProject() === p) { const b = $('#dev-fsr'); if (b) b.innerHTML = fsrInnerHTML(p); } }); return '<span class="muted small">Looking for a servicing report…</span>'; }
    const r = fsrFor(p), home = FSR_HOME[p.municipality];
    const ext = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`;
    if (r && r.best) { const b = r.best; return `<strong>Functional Servicing Report</strong> ${ext(b.fsr.url, esc(b.fsr.title.length > 90 ? b.fsr.title.slice(0, 88) + '…' : b.fsr.title))}<small>${b.fsr.date ? `Latest posted: ${esc(b.fsr.date)}` : 'Latest posted'}${b.fsr.count > 1 ? ` · ${b.fsr.count} versions` : ''} · ${ext(b.page, 'all documents')}</small>`; }
    const bp = r && r.items.find(i => i.browserPage);
    if (bp) return `<strong>Servicing documents</strong> ${ext(bp.page, 'City application page')}<small>Look under Project documents for the latest Functional Servicing Report (the City's page builds that list in the browser, so it can't be linked directly).</small>`;
    if (r && r.items.length) return `<span class="muted">No FSR posted yet</span> · ${ext(r.items[0].page, 'application documents')}`;
    if (p.municipality === 'Brampton') return `<span class="muted">Brampton's documents are on BramPlanOnline (sign-in)</span> · ${ext(home[1], 'Brampton applications')}`;
    return `<span class="muted">No public application page found</span>${home ? ` · ${ext(home[1], esc(home[0]))}` : ''}`;
  }
  const fsrBoxHTML = p => p.records.some(r => r.kind === 'application') ? `<div class="fsr-box small" id="dev-fsr" data-info="fsr">${fsrInnerHTML(p)}</div>` : '';
  // Servicing tab: the trace tool first, then Water and Wastewater in their own sections, then the
  // site (ground, stormwater). opts.site === false drops the site section (its home is
  // Development › Site); opts.noWwNeeds replaces the DC wastewater-needs table (sewer-path and
  // plant numbers, whose home is the Wastewater tab) with a one-line pointer.
  function devServicingBriefHTML(p, st, f, part, opts = {}) {
    const row = (k, body) => `<div class="b-row"><div class="b-k">${k}</div><div class="b-v">${body}</div></div>`;
    const has = p.lat != null, cb = f && f.cb, zn = s => esc(s.replace('Pressure zone ', 'Zone '));
    // One trace per tab: the sewer path (Wastewater) and the water supply (Water).
    const traceW = has ? `<div class="svc-actions trace-box"><div class="trace-btns"><button type="button" class="btn trace-btn wtrace-btn" data-wtrace="${esc(p.key)}" data-info="water-trace"><span aria-hidden="true">⤳</span> Trace the water supply from the plant</button></div>
        <span class="muted small">On the map, along the existing watermains and the planned DC mains</span><div class="wtrace-out"></div></div>` : '';
    const traceS = has ? `<div class="svc-actions trace-box"><div class="trace-btns"><button type="button" class="btn trace-btn" data-trace="${esc(p.key)}" data-info="trace"><span aria-hidden="true">⤳</span> Trace the sewer path to the plant</button></div>
        <span class="muted small">On the map, pipe by pipe to the plant, along the existing sewers and the planned DC mains</span><div class="trace-out"></div></div>` : '';
    const near = f && (f.zNear || f.dNear) ? `<p class="small est-line">Outside the ${[f.zNear && 'mapped pressure zones', f.dNear && 'sewered blocks'].filter(Boolean).join(' and ')}: assigned to the nearest (${[f.zNear && `${zn(f.z.name)}, ${esc(SD().nearText(f.zNear))}`, f.dNear && f.path[0] && `${esc(SD().drName(f.path[0]))}, ${esc(SD().nearText(f.dNear))}`].filter(Boolean).join('; ')}). The connection point comes from the FSR / master plan.</p>` : '';
    // Water
    const wDemand = cb ? `<p class="small"><strong>${uLs(cb.water.maxDay)}</strong> max day · ${uLs(cb.water.peakHour)} peak hour · ${uLs(cb.water.avg)} average</p>
      <p class="small">${f.z ? `${zn(f.z.name)}${f.zMax ? ` · ${DD().pctOf(D.toMLd(cb.water.maxDay), f.zMax)} of the zone's build-out max day` : ''} ${estTag}` : 'No pressure zone'}</p>` : (SD().servicingLineHTML(p) || '<p class="small muted">No units or jobs stated: flows not estimated.</p>');
    const water = `<section class="svc-sys svc-sys-water"><h3 class="svc-sys-h"><i aria-hidden="true"></i>Water</h3><div class="brief">
      ${row('Demand', wDemand)}
      ${has ? row('Supply route', `<div id="dev-wtrace" data-info="water-trace">${WT().waterTraceHTML(p)}</div>`) : ''}
      ${has ? row('Watermains', '<div id="dev-exist-water"><p class="small muted">Looking up the nearest watermains…</p></div>') : ''}
      ${has ? row('Fire flow', '<div id="dev-fire" data-info="fire-storm"><p class="small muted">Looking up hydrants…</p></div>') : ''}
    </div></section>`;
    // Wastewater
    let wwRows = '';
    if (cb) {
      const ps = f.sps.slice().sort((a, b) => b.wet / b.firm - a.wet / a.firm)[0];
      wwRows += row('Flows', `<p class="small"><strong>${uLs(cb.wastewater.wetPeak)}</strong> peak wet · ${uLs(cb.wastewater.peak)} peak dry · ${uLs(cb.wastewater.avg)} average</p>`);
      const chain = f.path.map(a => esc(a.kind === 'plant' ? SD().plantLabel(a.plant) : SD().drName(a).replace(/^[^·]+· /, ''))).join(' → ');
      const pp = SC().pathPipes(p);
      const pipeTxt = x => `<button type="button" class="btn small link" data-pipe="${x.i}">${x.p[0]} mm</button> at <strong>${Math.round(x.r1 * 100)}%</strong> (${esc(MM().pipeState(x.r1)[3].toLowerCase())}${x.r1 < 1 ? `, freeboard ${SC().fbText(x.p[0], x.r1)}` : ''})`;
      const lines = [];
      if (chain) lines.push(`${chain}${f.path.length && f.path[f.path.length - 1].kind !== 'plant' && f.pl ? ` → ${esc(SD().plantLabel(f.pl))}` : ''}`);
      if (pp && pp.worst) lines.push(`Tightest pipe ${MA().getCapYear() == null ? 'at build-out' : `in ${MA().getCapYear()}`}: ${pp.local ? `local ${pipeTxt(pp.local)}` : ''}${pp.local && pp.trunk ? '; ' : ''}${pp.trunk ? `downstream ${pipeTxt(pp.trunk)}` : ''}`);
      if (ps) lines.push(`Via ${esc(DD().psName(ps.a))}: build-out ≈${Math.round(ps.wet / ps.firm * 100)}% of firm capacity (peak wet) ${estTag}`);
      wwRows += row('To the plant', `<ul class="b-lines small">${lines.map(l => `<li>${l}</li>`).join('')}</ul>`);
      if (f.cap) wwRows += row('Plant', `<p class="small"><strong>${esc(f.cap.name)}</strong>: uncommitted reserve ${uML(f.reserve)}${f.reserve > 0 ? ` · this development ${f.layer === 'proposed' ? 'would use' : f.layer === 'built' ? 'is in the existing flow,' : 'is committed,'} ${DD().pctOf(f.use, f.reserve)} of it` : ' · the plant is over-committed'} ${estTag}</p>`);
      else if (f.pl === 'Toronto') wwRows += row('Plant', '<p class="small">Drains to the City of Toronto system (Malton).</p>');
    }
    const ww = `<section class="svc-sys svc-sys-ww"><h3 class="svc-sys-h"><i aria-hidden="true"></i>Wastewater</h3><div class="brief">
      ${wwRows}
      ${has ? row('Sanitary sewers', '<div id="dev-exist-sanitary"><p class="small muted">Looking up the nearest sanitary sewers…</p></div>') : ''}
    </div></section>`;
    const site = has && opts.site !== false ? `<section class="svc-sys svc-sys-site"><h3 class="svc-sys-h"><i aria-hidden="true"></i>Site</h3><div class="brief">
      ${row('Ground', '<div id="dev-ground" data-info="ground"><p class="small muted">Looking up ground elevation…</p></div>')}
      ${row('Storm sewers', '<div id="dev-exist-storm"><p class="small muted">Looking up the nearest storm sewers…</p></div>')}
      ${row('Stormwater', '<div id="dev-storm" data-info="fire-storm"><p class="small muted">Looking up stormwater ponds…</p></div>')}
    </div></section>` : '';
    if (part === 'water') return `${traceW}${near}${water}`;
    if (part === 'ww') return `${traceS}${near}${ww}${site}`;
    // DC Analysis: the DC works the development may rely on (both systems), the planned works near
    // it and on its path, and the DCs it would pay.
    if (part === 'dc') {
      if (!App().state.dcInfra) return skel('Loading the 2026 DC capital maps');
      const w = st.works;
      const head = w && w.needBy ? `<p class="small ${w.gap ? 'why-stall' : ''}"><strong>Needs DC works by ${w.needBy}</strong>${w.gap ? ': the development is committed (approved or permitted) before the planned main it connects to is built.' : ': it connects through a planned main.'}</p>` : '';
      // Sewer-path and plant-reserve numbers live on the Wastewater tab; the DC tab keeps the
      // water constraints, the planned works and the DCs the site would pay.
      const wwNeeds = opts.noWwNeeds
        ? `<p class="small muted">Sewer path, pumping stations and the plant's reserve live on the ${DV().homeLine('ww', 'Wastewater tab')}.</p>`
        : `<div id="dev-dcn" data-info="dc-needs">${MP().dcNeedsHTML(p, 'ww')}</div>`;
      return `${head}<section class="svc-sys svc-sys-dc"><h3 class="svc-sys-h"><i aria-hidden="true"></i>DC projects potentially required</h3><div class="brief">
        ${f ? row('Wastewater', wwNeeds) : ''}
        ${f ? row('Water', `<div data-info="dc-needs">${MP().dcNeedsHTML(p, 'water')}</div>`) : ''}
        ${w ? row('Planned works', DI().devWorksHTML(w)) : ''}
      </div></section>${f ? DC().dcRevenueHTML(p) : ''}`;
    }
    return `${traceW}${traceS}${near}${water}${ww}${site}`;
  }

  // One dated history: phase changes (weekly check), council and committee items, file events
  // and building permit events; newest first, by year.
  function devEvents(p) {
    const byUid = new Map(p.records.map(r => [r.uid, r]));
    const ev = [], groups = new Map();
    for (const t of p.timeline) {
      const r = byUid.get(t.record), type = r && r.kind === 'permit' ? 'permit' : 'file';
      const k = `${fmtDate(t.date)}|${t.text}|${type}`;
      if (!groups.has(k)) { const g = { date: t.date, type, phase: t.phase, text: t.text, tags: [] }; groups.set(k, g); ev.push(g); }
      const g = groups.get(k); if (!g.tags.includes(t.tag)) g.tags.push(t.tag);
    }
    const h = (App().state.history && App().state.history.projects && App().state.history.projects[p.key]) || [];
    // Only actual moves: the first weekly check ("first seen as") is when tracking began, not an event.
    h.forEach(([d, ph, tag], i) => {
      if (!i || tag === 'rules') return;
      const at = new Date(`${d}T23:59:59`), why = p.timeline.filter(e => e.phase === ph && e.date <= at).sort((a, b) => b.date - a.date)[0];
      ev.push({ date: new Date(`${d}T12:00:00`), seq: i + 1, type: 'phase', phase: ph, text: `Moved to ${P.PHASE_BY_KEY[ph].label}`, why });
    });
    if (App().state.council) for (const c of DD().councilBriefs(p)) ev.push({ date: new Date(`${c.m.date}T12:00:00`), type: 'council', c });
    return ev.sort((a, b) => b.date - a.date || (b.seq || 0) - (a.seq || 0));
  }
  // Key events: everything but individual permits, which are counted per year instead.
  function keyEvents(all) {
    const out = [], years = new Map();
    for (const x of all) {
      if (x.type !== 'permit') { out.push(x); continue; }
      const y = fmtDate(x.date).slice(0, 4);
      if (!years.has(y)) { const s = { date: x.date, type: 'permits', byPhase: new Map(), tags: new Set() }; years.set(y, s); out.push(s); }
      const s = years.get(y);
      if (!s.byPhase.has(x.phase)) s.byPhase.set(x.phase, new Set());
      for (const t of x.tags) { s.byPhase.get(x.phase).add(t); s.tags.add(t); }
    }
    return out;
  }
  const TL_TYPE = { council: 'Council', phase: 'Phase', file: 'File', permit: 'Permit', permits: 'Permits' };
  function evHTML(x) {
    const tags = list => list.length <= 3 ? esc(list.join(', '))
      : `${esc(list.slice(0, 2).join(', '))} <details class="tl-more"><summary>+${list.length - 2} more</summary>${esc(list.slice(2).join(', '))}</details>`;
    let body;
    if (x.type === 'council') {
      const { m, it, s } = x.c;
      body = `<details class="c-ev"><summary>${s.verdict ? `<strong>${esc(s.verdict)}</strong> · ` : ''}${esc(m.name)}${it.n ? ` · item ${esc(it.n)}` : ''} <span class="c-kind">${esc(s.kind)}</span> ${DD().outBadge(it, s)}
          <span class="c-title">${esc(it.title)}</span></summary>
        ${s.decision ? `<p class="small c-motion">${esc(s.decision)}</p>` : ''}
        ${s.requirements.length || s.concerns.length ? `<div class="chips small">${s.requirements.map(r => DD().chip(esc(r.label), r.infra ? 'infra' : '')).join('')}${s.concerns.map(c => DD().chip(`Concern: ${esc(c)}`, 'concern')).join('')}</div>` : ''}
        <p class="small"><a href="${esc(m.url)}" target="_blank" rel="noopener">Meeting page</a>${it.docs.map(([id, name]) => ` · <a href="https://${esc(m.host)}/filestream.ashx?DocumentId=${esc(id)}" target="_blank" rel="noopener">${esc(name.replace(/\.pdf$/i, ''))}</a>`).join('')}</p>
        ${it.text ? `<details class="c-text"><summary>${m.passed ? 'Minutes: discussion, motion and vote' : 'Agenda text'}</summary><p class="small">${esc(it.text)}</p></details>` : ''}
      </details>`;
    } else if (x.type === 'phase') {
      body = `${dot(x.phase)}<span><strong>${esc(x.text)}</strong>${x.why ? ` <span class="muted">— ${esc(x.why.text.replace(/^[^·]*· /, ''))} on ${esc(x.why.tag)} (${fmtDate(x.why.date)})</span>` : ''}</span>`;
    } else if (x.type === 'permits') {
      const ph = P.PHASES.map(q => q.key).concat('cancelled').filter(k => x.byPhase.has(k)).reverse();
      body = `${dot(ph[0] || 'permit')}<span>${fmtNum(x.tags.size)} building permit${x.tags.size === 1 ? '' : 's'} with dates this year: ${ph.map(k => `${esc(P.PHASE_BY_KEY[k].label.toLowerCase())} ${fmtNum(x.byPhase.get(k).size)}`).join(' · ')} <span class="muted">— each under All dated events</span></span>`;
    } else {
      body = `${dot(x.phase)}<span>${esc(x.text)}${x.tags.length > 1 ? ` <span class="tl-n">×${x.tags.length}</span>` : ''} <span class="muted">— ${tags(x.tags)}</span></span>`;
    }
    return `<li class="t-${x.type}"><span class="d">${fmtDate(x.date).slice(5)}</span><span class="tl-type">${TL_TYPE[x.type]}</span><div class="tl-body">${body}</div></li>`;
  }
  function evListHTML(list) {
    if (!list.length) return '<p class="muted small">No dated events in the source data.</p>';
    const years = new Map();
    for (const x of list) { const y = fmtDate(x.date).slice(0, 4); if (!years.has(y)) years.set(y, []); years.get(y).push(x); }
    return [...years].map(([y, xs], i) => {
      const n = t => xs.filter(x => x.type === t).length;
      const sum = [n('council') && `${n('council')} council`, n('phase') && `${n('phase')} phase`, n('file') && `${n('file')} file`, (n('permit') + n('permits')) && 'permits'].filter(Boolean).join(' · ');
      return `<details class="tl-year"${i < 2 ? ' open' : ''}><summary><strong>${y}</strong> <span class="muted small">${sum}</span></summary><ol class="tl2">${xs.map(evHTML).join('')}</ol></details>`;
    }).join('');
  }
  // How the site's phase was set: approvals by stage against the latest submission, each file's
  // published status and how it was read, and flags where the reading is uncertain.
  const STAGE_NAME = { precon: 'Pre-consultation', master: 'Official plan / zoning / subdivision', siteplan: 'Site plan', condo: 'Condominium', other: 'Other planning file', permit: 'Building permits' };
  const stageKey = r => r.kind === 'permit' ? 'permit' : (r.stage || 'other');
  const firstAt = r => r.events.length ? +r.events[0].date : null;
  const lastAt = r => r.events.length ? +r.events[r.events.length - 1].date : null;
  const phaseAt = (r, ph) => { const e = r.events.filter(x => x.phase === ph); return e.length ? +e[e.length - 1].date : null; };
  const siteNote = r => P.sitePhaseOf(r) === r.phase ? '' : r.superseded ? '; approved before a newer rezoning that is still in review, so it no longer counts as the site’s approval'
    : '; not a site plan approval, so it keeps the site under review';
  const ROLE_NOTE = { servicing: 'site servicing / shoring permit: not the building itself, so it does not set the phase', none: 'not a permit for the site’s building (a sign, entrance, door, equipment, sales office, temporary structure, addition…): does not set the phase' };
  function phaseBasis(r) {
    if (r.prePlan) return 'issued well before the site’s planning file (or completed more than a year before it): for what stood there before, so it does not set the phase';
    if (r.kind === 'permit' && P.permitRole(r) === 'suite') return 'a second unit / alteration in an existing house: counted as new homes, but not a site plan building, so it does not set the phase';
    if (r.kind === 'permit' && ROLE_NOTE[P.permitRole(r)] && !P.isDemolition(r)) return ROLE_NOTE[P.permitRole(r)];
    if (r.closedUnconfirmed) return 'status just “Closed”, with no approval date and no building permit issued since: outcome not published, so not counted as approved';
    if (r.kind === 'application' && r.stage === 'siteplan' && P.isMinorFile(r) && r.phase === 'approved') return 'minor / limited / express site plan (a revision, patio, small change): does not approve the site’s building';
    if (P.isDemolition(r)) return 'demolition permit: clears the site, so it does not set the phase (unless the site has nothing else)';
    if (P.isRegistered(r) && !r.superseded) return 'registered plan of subdivision: counts as the site’s approval (houses can go to building permits without a site plan)';
    if (P.isLegacy(r)) return 'Brampton legacy site plan (“Transferred” from the old system, no dates): an old approval, not counted for the current proposal';
    if (!r.statusRaw) return r.events.some(e => e.phase === r.phase) ? `from its ${P.humanizeField(r.events.filter(e => e.phase === r.phase).pop().label).toLowerCase()} date (no status published)` : (r.kind === 'permit' ? 'listed as a permit (no status published)' : 'an open file (no status published)');
    let sp = P.phaseFromStatus(r.statusRaw);
    if (r.kind === 'application' && ['permit', 'construction', 'completed'].includes(sp)) sp = 'approved';
    if (r.stage === 'precon' && r.phase === 'inception' && sp !== 'inception' && sp !== 'cancelled') return 'pre-consultation: counted as inception whatever its status';
    if (sp === r.phase || (r.kind === 'permit' && ['review', 'permit'].includes(r.phase))) return (/^\s*closed\s*$/i.test(r.statusRaw) && r.kind === 'application' && r.phase === 'approved' ? 'status “Closed” read as approved' : 'from its status') + siteNote(r);
    const e = r.events.filter(x => x.phase === r.phase).pop();
    if (e) return `from its ${P.humanizeField(e.label).toLowerCase()} date (${fmtDate(e.date)}); the status says ${sp ? P.PHASE_BY_KEY[sp].label.toLowerCase() : 'nothing usable'}${siteNote(r)}`;
    return sp ? `status read as ${P.PHASE_BY_KEY[sp].label.toLowerCase()}` : 'status not recognised; counted as an open file';
  }
  function phaseBasisHTML(p) {
    const recs = p.records, rank = r => P.PHASE_BY_KEY[r.phase].rank;
    // The files mergeProject used for the phase (after legacy, minor, non-building and pre-cycle files are set aside).
    const live = p.phaseRecs || recs.filter(r => r.phase !== 'cancelled'), cyc = !!p.cycleFrom, doneAt = cyc ? +p.cycleFrom : null;
    // mergeProject sets a 'completed' site with planned units still unpermitted back to construction.
    const heldBack = p.phase === 'construction' && !live.some(r => r.phase === 'construction') && live.some(r => r.phase === 'completed');
    const setter = live.filter(r => P.sitePhaseOf(r) === (heldBack ? 'completed' : p.phase)).sort((a, b) => (lastAt(b) || 0) - (lastAt(a) || 0))[0] || null;
    // Approvals by stage, with the latest submission in each stage.
    const order = ['precon', 'master', 'siteplan', 'condo', 'other', 'permit'];
    const stages = order.map(k => {
      const rs = recs.filter(r => stageKey(r) === k); if (!rs.length) return null;
      const lv = rs.filter(r => r.phase !== 'cancelled'), best = lv.slice().sort((a, b) => rank(b) - rank(a) || (lastAt(b) || 0) - (lastAt(a) || 0))[0];
      const newest = rs.slice().sort((a, b) => (firstAt(b) || 0) - (firstAt(a) || 0))[0];
      return { k, rs, best, newest };
    }).filter(Boolean);
    // Flags.
    const flags = [];
    for (const k of ['master', 'siteplan']) {
      const rs = live.filter(r => stageKey(r) === k);
      const appr = rs.filter(r => rank(r) >= P.PHASE_BY_KEY.approved.rank);
      const a = appr.sort((x, y) => (phaseAt(y, 'approved') || lastAt(y) || 0) - (phaseAt(x, 'approved') || lastAt(x) || 0))[0];
      if (a) {
        const at = phaseAt(a, 'approved') || lastAt(a) || 0;
        const newer = rs.filter(r => rank(r) <= P.PHASE_BY_KEY.review.rank && (firstAt(r) || 0) > at);
        if (newer.length) flags.push(['warn', `A newer ${STAGE_NAME[k].toLowerCase()} file (${newer.map(r => `${r.ref || 'no number'}, submitted ${fmtDate(new Date(firstAt(r)))}`).join('; ')}) is still in review after ${a.ref || 'an earlier file'} was approved${at ? ` (${fmtDate(new Date(at))})` : ''}: the approval may be for an earlier proposal, not the current submission.`]);
      }
    }
    const masterLive = live.filter(r => stageKey(r) === 'master'), spLive = live.filter(r => stageKey(r) === 'siteplan');
    if (DD().planApprovedNote(p)) flags.push(['info', `${DD().planApprovedNote(p)}. Only a site plan approval${spLive.length ? '' : ' or a registered plan of subdivision'} makes the site Approved, so it stays under review.`]);
    if (masterLive.some(r => /draft/i.test(r.statusRaw) && r.phase === 'approved')) flags.push(['info', 'Draft plan approval: the subdivision still has to meet its conditions and be registered.']);
    if (live.some(r => r.kind === 'application' && r.phase === 'approved' && /^\s*closed\s*$/i.test(r.statusRaw) && !r.closedUnconfirmed && !phaseAt(r, 'approved'))) flags.push(['warn', 'A planning file’s status is just “Closed”, read as approved (a closed file usually follows approval, but it can also be a file closed without a decision). Check the file.']);
    if (live.some(r => r.kind === 'permit' && rank(r) >= P.PHASE_BY_KEY.permit.rank) && live.some(r => r.kind === 'application' && r.stage !== 'precon' && rank(r) <= P.PHASE_BY_KEY.review.rank)) flags.push(['warn', 'Building permits are issued while a planning file on the site is still in review: the permits may be for an earlier phase or another building on the site.']);
    if (setter && /date/.test(phaseBasis(setter)) && setter.statusRaw) flags.push(['info', `The phase comes from a date on ${setter.ref || 'a file'} rather than its published status (“${setter.statusRaw}”).`]);
    if (live.length && live.every(r => stageKey(r) === 'precon')) flags.push(['info', 'Only a pre-consultation so far: not yet a formal application.']);
    const sup = live.filter(r => r.superseded);
    if (sup.length) flags.push(['warn', `${sup.map(r => r.ref || 'A site plan').join(', ')} ${sup.length === 1 ? 'was' : 'were'} approved before a newer rezoning / official plan / subdivision file that is still in review: ${sup.length === 1 ? 'that approval was' : 'those approvals were'} for an earlier proposal, so the site is under review.`]);
    const leg = recs.filter(r => P.isLegacy(r));
    if (leg.length && !p.legacyOnly) flags.push(['info', `${leg.length} Brampton legacy site plan file${leg.length === 1 ? '' : 's'} (“Transferred”, ${leg.slice(0, 3).map(r => r.ref).join(', ')}${leg.length > 3 ? '…' : ''}) ${leg.length === 1 ? 'is an old approval and does' : 'are old approvals and do'} not count for the current proposal.`]);
    const notB = recs.filter(r => r.kind === 'permit' && ['none', 'servicing'].includes(P.permitRole(r)) && !P.isDemolition(r) && r.phase !== 'cancelled');
    if (notB.length) flags.push(['info', `${notB.length} permit${notB.length === 1 ? '' : 's'} on the site ${notB.length === 1 ? 'is' : 'are'} not for its building (${[...new Set(notB.map(r => (r.type || r.description || 'other').split(' — ')[0].toLowerCase()))].slice(0, 3).join(', ')}): only permits that build the site’s units, or a new non-residential building, set the phase.`]);
    const minorSp = recs.filter(r => r.kind === 'application' && r.stage === 'siteplan' && P.isMinorFile(r) && r.phase === 'approved');
    if (minorSp.length && !live.every(r => minorSp.includes(r))) flags.push(['info', `${minorSp.length} minor / limited site plan${minorSp.length === 1 ? '' : 's'} (${minorSp.slice(0, 2).map(r => r.ref).join(', ')}) ${minorSp.length === 1 ? 'is' : 'are'} for small changes and ${minorSp.length === 1 ? 'does' : 'do'} not approve the site’s building.`]);
    const pre = recs.filter(r => r.prePlan), preK = recs.filter(r => r.prePlanKept);
    if (pre.length) flags.push(['info', `${pre.length} building permit${pre.length === 1 ? ' was' : 's were'} issued well before the site’s planning file (${pre.slice(0, 2).map(r => r.ref).join(', ')}): ${pre.length === 1 ? 'it is' : 'they are'} for what stood there before and ${pre.length === 1 ? 'does' : 'do'} not set the phase or count toward the build-out.`]);
    if (preK.length) flags.push(['warn', `${preK.slice(0, 2).map(r => r.ref).join(', ')}${preK.length > 2 ? ` +${preK.length - 2}` : ''} ${preK.length === 1 ? 'was' : 'were'} issued shortly before the earliest planning file in the open data: counted as an earlier phase whose site plan isn’t published. Check the file.`]);
    const cu = recs.filter(r => r.closedUnconfirmed);
    if (cu.length) flags.push(['warn', `${cu.map(r => r.ref).join(', ')} only ${cu.length === 1 ? 'reads' : 'read'} “Closed”, with no approval date and no building permit since: the outcome isn’t published, so ${cu.length === 1 ? 'it is' : 'they are'} not counted as an approval.`]);
    if (heldBack) flags.push(['info', `${setter && setter.ref ? setter.ref : 'A permit'} reads completed, but ${p.buildout ? fmtNum(p.buildout.remaining) : 'some'} planned unit${p.buildout && p.buildout.remaining === 1 ? '' : 's'} have no building permit yet, so the site is shown as under construction rather than completed.`]);
    const appeal = live.filter(r => r.kind === 'application' && DD().STATUS_SIGNALS[0][0].test(r.statusRaw || ''));
    if (appeal.length) flags.push(['warn', `Under appeal at the Ontario Land Tribunal (${appeal.map(r => `${r.ref || 'no number'}: “${r.statusRaw}”`).join('; ')}): ${appeal.some(r => r.phase === 'approved') ? 'the status is read as approved, but the decision is not final until the Tribunal rules' : 'the Tribunal, not council, will decide'}.`]);
    const demos = recs.filter(r => P.isDemolition(r) && r.phase !== 'cancelled');
    if (demos.length && live.some(r => !P.isDemolition(r))) flags.push(['info', `${demos.length} demolition permit${demos.length === 1 ? '' : 's'} (${demos.slice(0, 2).map(r => r.ref).join(', ')}) ${demos.length === 1 ? 'clears' : 'clear'} the site and ${demos.length === 1 ? 'does' : 'do'} not set the phase.`]);
    if (cyc) flags.push(['info', `An earlier build on the site was completed (${fmtDate(new Date(doneAt))}); only the ${live.length} file${live.length === 1 ? '' : 's'} submitted after it set the phase — approvals and permits from before are for the earlier build.`]);
    if (recs.some(r => r.phase === 'cancelled') && live.length) flags.push(['info', `${recs.filter(r => r.phase === 'cancelled').length} withdrawn / refused / expired file${recs.filter(r => r.phase === 'cancelled').length === 1 ? '' : 's'} on the site ${recs.filter(r => r.phase === 'cancelled').length === 1 ? 'does' : 'do'} not count.`]);
    const row = r => `<tr${r === setter ? ' class="pb-set"' : ''}><td>${r === setter ? '★ ' : ''}${esc(r.ref || '—')}<small>${esc(r.kind === 'permit' ? (r.type || 'Building permit') : STAGE_NAME[r.stage || 'other'])}</small></td>
      <td>${r.statusRaw ? `“${esc(r.statusRaw)}”` : '<span class="muted">none</span>'}<small>${firstAt(r) ? `submitted ${fmtDate(new Date(firstAt(r)))}` : ''}${lastAt(r) && lastAt(r) !== firstAt(r) ? ` · latest ${fmtDate(new Date(lastAt(r)))}` : ''}</small></td>
      <td>${dot(r.phase)} ${esc(P.PHASE_BY_KEY[r.phase].label)}<small>${esc(phaseBasis(r))}</small></td></tr>`;
    const MAX = 14, list = recs.slice().sort((a, b) => order.indexOf(stageKey(a)) - order.indexOf(stageKey(b)) || (firstAt(b) || 0) - (firstAt(a) || 0));
    return `<details class="sect" id="dev-basis" open><summary><h2 class="section-title" data-info="phase-basis">How the phase was set</h2><span class="muted small sect-sum">${esc(P.PHASE_BY_KEY[p.phase].label)}${setter && setter.ref ? ` · from ${esc(setter.ref)}` : ''}</span></summary>
      ${p.legacyOnly ? '<p class="small">Only Brampton legacy site plan files (“Transferred” from the old system, mostly 1980s–1990s, no dates): an old approval of a building long since built, so the site is shown as completed.</p>' : ''}
      <p class="small">Approved means a <strong>site plan</strong> is approved, or a plan of subdivision is <strong>registered</strong>: zoning, official plan, draft subdivision and condominium approvals keep the site under review; demolition permits don't count. Otherwise the site shows the furthest phase reached by any of its ${cyc ? 'files submitted since the earlier build was completed' : 'files'} that is not withdrawn${setter ? ` — here <strong>${esc(setter.ref || 'one file')}</strong> (★), ${esc(phaseBasis(setter))}` : ''}.</p>
      <table class="dt pb-stage"><caption>Approvals by stage</caption><thead><tr><th>Stage</th><th>Furthest</th><th>Latest submission</th></tr></thead><tbody>
        ${stages.map(x => `<tr><td>${esc(STAGE_NAME[x.k])}<small>${x.rs.length} file${x.rs.length === 1 ? '' : 's'}</small></td><td>${x.best ? `${dot(x.best.phase)} ${esc(P.PHASE_BY_KEY[x.best.phase].label)}<small>${esc(x.best.ref || '')}</small>` : `${dot('cancelled')} withdrawn`}</td><td>${x.newest && firstAt(x.newest) ? `${esc(x.newest.ref || '')}<small>${fmtDate(new Date(firstAt(x.newest)))} · ${esc(P.PHASE_BY_KEY[x.newest.phase].label.toLowerCase())}</small>` : '–'}</td></tr>`).join('')}
      </tbody></table>
      ${flags.length ? `<ul class="why-list pb-flags">${flags.map(([k, t]) => `<li class="why-${k === 'warn' ? 'stall' : 'ok'}"><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="small muted">No conflicts between the files’ statuses and submissions.</p>'}
      <details class="sub-sect"><summary class="small">Each file: published status and how it was read (${fmtNum(recs.length)})</summary>
        <table class="dt pb-files"><thead><tr><th>File</th><th>Published status</th><th>Read as</th></tr></thead><tbody>${list.slice(0, MAX).map(row).join('')}</tbody></table>
        ${list.length > MAX ? `<p class="small muted">+ ${fmtNum(list.length - MAX)} more in Source records.</p>` : ''}</details>
      <p class="small muted">Statuses are as each municipality publishes them; phases are this app's reading of them (open the ⓘ for the rules). A screening view — confirm against the file before relying on it.</p></details>`;
  }
  function devHistoryHTML(p, st) {
    const cancelled = p.phase === 'cancelled';
    const steps = P.PHASES.map(s => {
      const reached = !cancelled && s.rank <= p.rank, when = p.milestones[s.key];
      return `<li class="${s.key === p.phase ? 'current done' : reached ? 'done' : 'todo'}">${dot(s.key)}<span class="lbl">${esc(s.label)}</span><span class="when">${when ? fmtDate(when) : reached ? 'reached' : ''}</span></li>`;
    }).join('');
    const all = devEvents(p), key = keyEvents(all);
    const nC = all.filter(x => x.type === 'council').length;
    return `<details class="sect" id="dev-hist" open><summary><h2 class="section-title" data-info="dev-history">History</h2><span class="muted small sect-sum">${p.first ? `since ${fmtDate(p.first).slice(0, 4)}` : ''}${nC ? ` · ${nC} council` : ''}</span></summary>
      <ol class="stepper compact">${steps}</ol>
      ${st.sig.length ? `<ul class="why-list" data-info="status-why">${st.sig.map(x => `<li class="why-${x.kind}"><span>${esc(x.text)}</span><small>${esc(x.files.slice(0, 3).join('; '))}${x.files.length > 3 ? ` +${x.files.length - 3} more` : ''}</small></li>`).join('')}</ul>` : ''}
      <div class="seg tl-toggle" role="group" aria-label="Events shown"><button type="button" class="btn small on" data-tl="key">Key events</button><button type="button" class="btn small" data-tl="all">All dated events (${fmtNum(all.length)})</button></div>
      <div data-tlv="key">${evListHTML(key)}</div><div data-tlv="all" hidden>${evListHTML(all)}</div>
      <p class="small muted">Phase changes from the weekly check; council and committee items that name the files (${App().state.council ? 'agendas and minutes since 2019' : '<span class="skel" style="display:inline-block;width:110px;vertical-align:middle" role="status" aria-label="Loading"></span>'}); file and permit dates from the municipal records. Open a council item for its motion, reports and minutes.</p></details>`;
  }

  function devServicingHTML(p, f, open) {
    const dem = '';   // demand by stage is in Units, jobs & build-out
    const sum = f ? `${fmt1(f.cb.water.maxDay)} L/s max day · ${fmt1(f.cb.wastewater.wetPeak)} L/s peak wet` : '';
    return `<details class="sect" id="dev-svc"${open ? ' open' : ''}><summary><h2 class="section-title" data-info="servicing-check">Flows by stage and sewer path</h2><span class="muted small sect-sum">${sum}</span></summary>
      ${f ? SD().servicingCheckHTML(p, f, { trace: false }) : SD().servicingLineHTML(p)}
      ${dem}</details>`;
  }
  // Demand by stage (total, completed, remaining) for one system at a time: Water | Wastewater.
  let dmSys = store.get('dmSys', 'water') === 'ww' ? 'ww' : 'water';
  const getDmSys = () => dmSys;
  const setDmSys = v => { dmSys = v; store.set('dmSys', v); };
  function devStageDemandHTML(p) {
    const w = DD().demandHTML(p, '', true, 'water'), ww = DD().demandHTML(p, '', true, 'ww');
    if (!w && !ww) return DD().buildoutHTML(p);
    const open = h => h.replace('<details class="sub-sect">', '<details class="sub-sect" open>');
    return `<div class="dm-stage"><div class="seg dm-sys" role="group" aria-label="System">${[['water', 'Water'], ['ww', 'Wastewater']].map(([k, t]) => `<button type="button" class="btn small${dmSys === k ? ' on' : ''}" data-dmsys="${k}" aria-pressed="${dmSys === k}">${t}</button>`).join('')}</div>
      <div data-dmp="water"${dmSys === 'water' ? '' : ' hidden'}>${open(w)}</div><div data-dmp="ww"${dmSys === 'ww' ? '' : ' hidden'}>${open(ww)}</div></div>`;
  }
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-dmsys]'); if (!b) return;
    dmSys = b.dataset.dmsys; store.set('dmSys', dmSys);
    const box = b.closest('.dm-stage');
    box.querySelectorAll('[data-dmsys]').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', String(x === b)); });
    box.querySelectorAll('[data-dmp]').forEach(x => { x.hidden = x.dataset.dmp !== dmSys; });
  });
  // Build-out by application: each formal file's planned units and the building permits inside
  // its boundary (the smallest file boundary holding the permit). Shows which files set the
  // development's total so nothing is counted twice, and takes the user's figure for files whose
  // count is only in their attachments.
  const ATTACHED_RE = /(see|refer to|as per|in) (the )?(attached|attachment|enclosed|cover letter|proposal|submission|documents?|plans?|pjr)|attached (document|letter|plan|summary|statistics)|please (see|refer)|cover letter/i;
  function appBuildoutHTML(p) {
    const files = (p.parent ? [] : DN().fileTree(p)).map(t => t.a).filter(DN().isFormal);
    const lone = p.records.filter(DN().isFormal);
    const list = files.length ? files : lone;
    if (!list.length || (list.length < 2 && list.every(r => r.units > 0 && !r.unitsUser))) return '';
    const live = p.records.filter(r => r.kind === 'permit' && r.phase !== 'cancelled' && !r.prePlan);
    const byFile = new Map(list.map(a => [a, []])), outside = [];
    for (const r of live) {
      if (r.lat == null) { outside.push(r); continue; }
      const home = list.filter(a => a.poly && P.pointInRings(r.lng, r.lat, a.poly)).sort((a, b) => P.ringsArea(a.poly) - P.ringsArea(b.poly))[0];
      (home ? byFile.get(home) : outside).push(r);
    }
    const plan = P.plannedFromApps(p.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled'));
    const counted = new Set(plan.basis === 'siteplan' || plan.basis === 'condo' ? plan.phases.map(f => f.rec) : []);
    if (!counted.size && plan.planned) { const top = list.filter(a => a.units === plan.planned)[0]; if (top) counted.add(top); }
    const role = a => !(a.units > 0) ? '' : counted.has(a) ? 'counted' : plan.basis && (a.stage || P.stageOf(a)) === 'master' && plan.basis !== 'master' ? 'the site plans count instead' : 'within the counted proposal';
    const row = a => {
      const ps = byFile.get(a) || [], perm = P.permitUnits(ps), done = P.permitUnits(ps.filter(r => r.phase === 'completed'));
      const att = !(a.units > 0) && ATTACHED_RE.test(a.description || '');
      const canAdd = att || !(p.units > 0);
      const unitsCell = a.units > 0
        ? `${fmtNum(a.units)}${a.unitsUser ? ` <span class="user-units" title="Your figure, kept in this browser">your figure <button type="button" class="btn small link" data-uu-clear="${esc(a.ref)}" aria-label="Remove your figure">×</button></span>` : ''}`
        : !canAdd ? '–' : `<span class="uu-entry"><input type="number" min="1" step="1" inputmode="numeric" placeholder="units" data-uu="${esc(a.ref)}" aria-label="Units for ${esc(a.ref)}"><button type="button" class="btn small" data-uu-set="${esc(a.ref)}">Add</button></span>`;
      return `<tr><td><button type="button" class="btn small link" data-sub="${esc(a.ref)}" title="Open this application on its own">${esc(a.ref)}</button><small>${esc(a.type || '')}${a.statusRaw ? ` · ${esc(a.statusRaw)}` : ''}</small>${att ? `<small class="att-note">Units are in the file's attachments (cover letter / planning justification)${p.municipality === 'Brampton' ? ' on BramPlanOnline (sign-in)' : ''}: enter them here.</small>` : ''}</td>
        <td class="num">${unitsCell}${role(a) ? `<small>${esc(role(a))}</small>` : ''}</td><td class="num">${ps.length ? fmtNum(perm) : '–'}</td><td class="num">${ps.length ? fmtNum(done) : '–'}</td><td class="num">${a.units > 0 && counted.has(a) ? fmtNum(Math.max(0, a.units - perm)) : '–'}</td></tr>`;
    };
    const op = outside.length ? P.permitUnits(outside) : 0;
    return `<details class="sect" id="dev-appbo"${list.some(a => a.unitsUser || (!(a.units > 0) && (!(p.units > 0) || ATTACHED_RE.test(a.description || '')))) ? ' open' : ''}><summary><h2 class="section-title" data-info="app-buildout">Build-out by application</h2><span class="muted small sect-sum">${fmtNum(list.length)} file${list.length === 1 ? '' : 's'}${list.some(a => !(a.units > 0)) ? ' · some without a unit count' : ''}</span></summary>
      <div class="table-wrap"><table class="app-bo"><thead><tr><th>Application</th><th class="num">Planned</th><th class="num">Permitted</th><th class="num">Completed</th><th class="num">Left</th></tr></thead>
      <tbody>${list.map(row).join('')}${outside.length ? `<tr class="muted"><td>Permits not inside any file's boundary<small>${fmtNum(outside.length)} permits</small></td><td class="num">–</td><td class="num">${fmtNum(op)}</td><td class="num">${fmtNum(P.permitUnits(outside.filter(r => r.phase === 'completed')))}</td><td class="num">–</td></tr>` : ''}</tbody></table></div>
      <p class="small muted">Permits count in the smallest file boundary that holds them. The development total counts each proposal once: ${plan.basis === 'siteplan' || plan.basis === 'condo' ? `its ${plan.basis === 'condo' ? 'condominium' : 'site plan'} files add up (separate phases)` : 'an official plan / zoning / subdivision file describes the whole proposal, so the largest counts'}; files marked “within the counted proposal” are not added. A unit count can be entered where a file's description points to its attachments, or where the development has none: your figures are kept in this browser only and are counted like published ones.</p></details>`;
  }
  function devUnitsHTML(p, open, opts = {}) {
    const b = p.buildout, e = App().empOf(p);
    const sum = [b ? `${fmtNum(b.planned)} planned · ${fmtNum(b.remaining)} left` : p.units ? `${fmtNum(p.units)} units` : '', e && e.jobs ? `~${fmtNum(e.jobs)} jobs` : ''].filter(Boolean).join(' · ');
    return `<details class="sect" id="dev-units"${open ? ' open' : ''}><summary><h2 class="section-title" data-info="buildout">Units, jobs &amp; build-out</h2><span class="muted small sect-sum">${sum}</span></summary>
      ${DD().summaryHTML(p)}
      ${appBuildoutHTML(p)}
      ${opts.flows === false ? '' : devStageDemandHTML(p)}
      ${DD().employmentHTML(p)}
      <p class="facts small muted">${[p.first && `First filed ${fmtDate(p.first)}`, p.last && `latest activity ${fmtDate(p.last)}`,
        `${fmtNum(p.records.length)} files`, p.gfa && `${fmtNum(p.gfa)} floor area`].filter(Boolean).join(' · ')}</p></details>`;
  }

/* ---- app.js lines 3207-3215 ---- */
  // Development panel tabs (the last one picked is kept for the next development).
  const DV_TABS = [['overview', 'Overview'], ['demand', 'Demand'], ['water', 'Water'], ['ww', 'Wastewater'], ['dc', 'DC Analysis'], ['history', 'History']];
  function showDvTab(k) {
    if (k === 'servicing') k = 'ww';   // the old combined Servicing tab
    if (!DV_TABS.some(([x]) => x === k)) k = 'overview';
    document.querySelectorAll('#detail-body [data-dvt]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.dvt === k)));
    document.querySelectorAll('#detail-body .dv-pane').forEach(p => { p.hidden = p.dataset.dvp !== k; });
    const on = document.querySelector(`#detail-body [data-dvt="${k}"]`); if (on && on.parentElement.scrollWidth > on.parentElement.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  // ---- Public contract ----
  const api = { FSR, loadFsr, fsrFor, fsrInnerHTML, fsrBoxHTML, devServicingBriefHTML, devEvents, devHistoryHTML, devServicingHTML, getDmSys, setDmSys, devStageDemandHTML, appBuildoutHTML, devUnitsHTML, phaseBasisHTML, evListHTML, DV_TABS, showDvTab };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelFsr = api;
})(typeof window !== 'undefined' ? window : globalThis);
