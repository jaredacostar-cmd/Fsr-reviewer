/* Development analysis tab: the About / Files & history / Site sub-views.
 *
 * Worker B (Phase 3: "Development as a scope, not a side panel"). Worker A owns
 * the tab shell in index.html (`#pane-dev`, `.dev-subtabs` with
 * `[data-devsub]` buttons, `#pane-dev-body`, and the `<script src="js/devtab.js">`
 * tag). This module owns ONLY what renders inside `#pane-dev-body`.
 *
 * Public contract: `window.DevTab = { render(sub), setSub(sub) }`.
 * The scoped project comes from `window.DevScope.current()` (Worker A); every
 * access is guarded so this module also works standalone / under `node --test`.
 *
 * Reuse strategy (no edits to js/app.js): the brief/history/files/record/aerial
 * builders in app.js live inside its IIFE, so they are not callable here. The
 * small ones are copied into this module (each marked "copied from js/app.js"),
 * the public ones are called through their modules (`window.PeelPhases`,
 * `window.PeelBrief`, `window.PeelProvenance`, `window.PeelArcGIS`,
 * `window.PeelAerial`, `window.PeelAreas`, `window.PeelApp`). New container ids
 * use a `devtab-` prefix so they never collide with the old `#detail` panel ids.
 */
(function (root) {
  'use strict';
  // The aerial and ground boxes can be on the page twice (the development's Site view and the Servicing
  // panel's fold): fill the one on screen.
  const byIdShown = id => { const all = typeof document !== 'undefined' ? [...document.querySelectorAll(`[id="${id}"]`)] : []; return all.find(e => e.getClientRects().length) || all[0] || null; };

  // ---- Guarded access to the app's globals ------------------------------------
  const P = () => root.PeelPhases;
  const B = () => root.PeelBrief;
  const PV = () => root.PeelProvenance;
  const ARC = () => root.PeelArcGIS;
  const Areas = () => root.PeelAreas;
  const Aerial = () => root.PeelAerial;
  const CFG = () => root.PEEL_CONFIG;
  const app = () => root.PeelApp || null;
  const state = () => (app() && app().state) || null;
  const hasDOM = () => typeof document !== 'undefined';

  // ---- Tiny helpers (copied from js/app.js; the canonical ones live there) ----
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtNum = n => n == null ? '' : Number(n).toLocaleString('en-CA');
  const fmtDate = d => d ? new Date(d).toISOString().slice(0, 10) : '';
  const YEAR_MS = 365.25 * 864e5;
  const PLANNING_PHASES = ['inception', 'review', 'approved'];
  const THIS_YEAR = new Date().getFullYear();
  // Theme-aware CSS token read (app.js `token()`), null-safe for node --test.
  const cssVar = name => (typeof getComputedStyle === 'function' ? getComputedStyle(document.documentElement).getPropertyValue(name).trim() : '');
  const glyphColor = hex => {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return cssVar('--swatch-paper');
    const n = parseInt(m[1], 16), ch = [n >> 16, (n >> 8) & 255, n & 255].map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const L = 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
    return L > 0.35 ? cssVar('--swatch-ink') : cssVar('--swatch-paper');
  };
  // Phase dot (app.js `dot()`), reading the --ph-* token so it follows the theme.
  const dot = (phase, extra = '') => {
    const ph = P() && P().PHASE_BY_KEY[phase];
    const c = cssVar(`--ph-${phase}`) || cssVar('--ph-approved');
    return `<span class="dot ${extra}" style="background:${c};color:${glyphColor(c)}" aria-hidden="true">${esc(ph ? ph.short : '')}</span>`;
  };
  const chip = (html, cls = '') => `<span class="chip${cls ? ` ${cls}` : ''}">${html}</span>`;
  const outBadge = (it, s) => it.outcome || s.vote ? `<span class="c-out c-${String(it.outcome || s.vote).toLowerCase().replace(/\s.*$/, '')}">${esc(s.vote || (OUTCOME_LABEL[it.outcome] || it.outcome))}</span>` : '';
  const OUTCOME_LABEL = { CARRIED: 'Carried', 'CARRIED AS AMENDED': 'Carried as amended', DEFEATED: 'Defeated', LOST: 'Lost', DEFERRED: 'Deferred', REFERRED: 'Referred', RECEIVED: 'Received', WITHDRAWN: 'Withdrawn', APPROVED: 'Approved', ADOPTED: 'Adopted' };

  // ---- Sub-view state ----------------------------------------------------------
  const DEVSUBS = ['about', 'files', 'site'];
  const SUB_KEY = 'peel-dev:devsub';
  const readSub = () => { try { return localStorage.getItem(SUB_KEY); } catch (e) { return null; } };
  const writeSub = v => { try { localStorage.setItem(SUB_KEY, v); } catch (e) { /* private mode */ } };
  const currentSub = () => DEVSUBS.includes(readSub()) ? readSub() : 'about';
  function syncSubtabs() {
    if (!hasDOM()) return;
    const cur = currentSub();
    document.querySelectorAll('[data-devsub]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.devsub === cur)));
  }

  // ---- Scoped project (Worker A's DevScope) + drill-down override ---------------
  // Drill-down (one application on its own, or across to a related development)
  // keeps the scope mechanism untouched: the override is used only while the
  // underlying scope still points at the project we drilled from.
  let drill = null, drillBase = null, liveKey = null;
  function scopeProject() {
    const S = root.DevScope;
    const scope = S && typeof S.current === 'function' ? S.current() : null;
    if (drill && scope && drillBase === scope.key) return drill;
    drill = null;
    return scope;
  }
  function navigate(p, backTo) {
    if (!p) return;
    const S = root.DevScope, N = root.PeelDevNav;
    // (the file's own development, as a click on its boundary opens it: header, site bar and tabs follow)
    if (N && N.showDetail) { drill = null; N.showDetail(p); return; }
    if (S && typeof S.set === 'function') { drill = null; S.set(p); }
    else {
      const scope = S && typeof S.current === 'function' ? S.current() : null;
      drill = p; drill._dtBack = backTo || null; drillBase = scope && scope.key;
    }
    render();
    if (hasDOM()) { const body = document.getElementById('pane-dev-body'); if (body) body.scrollTop = 0; }
  }

  // ---- Status (copied from js/app.js) -------------------------------------------
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
  function planApprovedNote(p) {
    // Zoning approved (a zoning file approved, or a zoning by-law passed at council) with no draft or
    // site plan approved yet: the development stays under review (SPEC 1.2).
    const z = p.zoningApproved;
    if (z && p.rank < P().PHASE_BY_KEY.approved.rank) return `Zoning approved${z.bylaws.length ? ` (By-law ${z.bylaws.slice(0, 3).join(', ')}${z.date ? `, ${z.date}` : ''})` : z.date ? ` (${z.date})` : ''}${z.refs.length ? ` on ${z.refs.slice(0, 3).join(', ')}` : ''}; no draft plan or site plan approved yet`;
    const a = p.planApproved;
    if (!a || p.rank >= P().PHASE_BY_KEY.approved.rank) return '';
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
    const setBy = p.phaseRecs && p.phaseRecs.length ? new Set(p.phaseRecs.map(r => r.uid)) : null;
    const ev = p.timeline.filter(t => t.phase === p.phase && (!setBy || setBy.has(t.record))).sort((a, b) => b.date - a.date)[0];
    const label = P().PHASE_BY_KEY[p.phase].label;
    const why = ev ? `${esc(label)} since ${fmtDate(ev.date)} — ${esc(ev.text.replace(/^[^·]*· /, ''))} on ${esc(ev.tag)}` : `${esc(label)}: from the status of ${esc(apps.map(r => `${r.ref} (“${r.statusRaw}”)`).slice(0, 2).join(', ') || 'its files')}`;
    const pa = planApprovedNote(p);
    const why2 = pa ? `${why}. ${esc(pa)}` : why;
    // SPEC 1.3: active · stalled · under appeal, on the latest file event, permit or council item.
    const ps = P().proposedStateOf(p);
    const stalled = !!ps && ps.state === 'stalled', appealed = !!ps && ps.state === 'appeal';
    const lastAt = P().lastActivityOf(p);
    const years = lastAt ? (Date.now() - lastAt) / (365.25 * 864e5) : 0;
    const RANK = { appeal: 0, stop: 1, stall: 2, ok: 3, info: 4 };
    const sig = [...seen.values()].sort((a, b) => RANK[a.kind] - RANK[b.kind]);
    const cause = stalled ? (sig.find(x => x.kind === 'appeal') ? 'while under appeal' : sig.find(x => x.kind === 'stall') ? 'and marked inactive' : sig.find(x => /Draft approved/.test(x.text)) ? 'after draft approval (conditions not yet cleared)' : 'with no reason in the municipal data — check the council and committee items') : '';
    const lastOf = r => r.events.length ? Math.max(...r.events.map(e => +e.date)) : 0;
    const latest = apps.slice().sort((a, b) => lastOf(b) - lastOf(a))[0];
    return { sig, why: why2, stalled, appealed, state: ps ? ps.state : null, years, lastAt, cause, latest, latestAt: latest ? lastOf(latest) : 0 };
  }

  // ---- How the phase was set (copied from js/app.js) ------------------------------
  const STAGE_NAME = { precon: 'Pre-consultation', master: 'Official plan / zoning / subdivision', siteplan: 'Site plan', condo: 'Condominium', other: 'Other planning file', permit: 'Building permits' };
  const stageKey = r => r.kind === 'permit' ? 'permit' : (r.stage || 'other');
  const firstAt = r => r.events.length ? +r.events[0].date : null;
  const lastAt = r => r.events.length ? +r.events[r.events.length - 1].date : null;
  const phaseAt = (r, ph) => { const e = r.events.filter(x => x.phase === ph); return e.length ? +e[e.length - 1].date : null; };
  const siteNote = r => P().sitePhaseOf(r) === r.phase ? '' : r.superseded ? '; approved before a newer rezoning that is still in review, so it no longer counts as the site’s approval'
    : '; not a site plan approval, so it keeps the site under review';
  const ROLE_NOTE = { servicing: 'site servicing / shoring permit: not the building itself, so it does not set the phase', none: 'not a permit for the site’s building (a sign, entrance, door, equipment, sales office, temporary structure, addition…): does not set the phase' };
  function phaseBasis(r) {
    if (r.prePlan) return 'issued well before the site’s planning file (or completed more than a year before it): for what stood there before, so it does not set the phase';
    if (r.kind === 'permit' && P().permitRole(r) === 'suite') return 'a second unit / alteration in an existing house: counted as new homes, but not a site plan building, so it does not set the phase';
    if (r.kind === 'permit' && ROLE_NOTE[P().permitRole(r)] && !P().isDemolition(r)) return ROLE_NOTE[P().permitRole(r)];
    if (r.closedUnconfirmed) return 'status just “Closed”, with no approval date and no building permit issued since: outcome not published, so not counted as approved';
    if (r.kind === 'application' && r.stage === 'siteplan' && P().isMinorFile(r) && r.phase === 'approved') return 'minor / limited / express site plan (a revision, patio, small change): does not approve the site’s building';
    if (P().isDemolition(r)) return 'demolition permit: clears the site, so it does not set the phase (unless the site has nothing else)';
    if (P().isRegistered(r) && !r.superseded) return 'registered plan of subdivision: counts as the site’s approval (houses can go to building permits without a site plan)';
    if (P().isLegacy(r)) return 'Brampton legacy site plan (“Transferred” from the old system, no dates): an old approval, not counted for the current proposal';
    if (!r.statusRaw) return r.events.some(e => e.phase === r.phase) ? `from its ${P().humanizeField(r.events.filter(e => e.phase === r.phase).pop().label).toLowerCase()} date (no status published)` : (r.kind === 'permit' ? 'listed as a permit (no status published)' : 'an open file (no status published)');
    let sp = P().phaseFromStatus(r.statusRaw);
    if (r.kind === 'application' && ['permit', 'construction', 'completed'].includes(sp)) sp = 'approved';
    if (r.stage === 'precon' && r.phase === 'inception' && sp !== 'inception' && sp !== 'cancelled') return 'pre-consultation: counted as inception whatever its status';
    if (sp === r.phase || (r.kind === 'permit' && ['review', 'permit'].includes(r.phase))) return (/^\s*closed\s*$/i.test(r.statusRaw) && r.kind === 'application' && r.phase === 'approved' ? 'status “Closed” read as approved' : 'from its status') + siteNote(r);
    const e = r.events.filter(x => x.phase === r.phase).pop();
    if (e) return `from its ${P().humanizeField(e.label).toLowerCase()} date (${fmtDate(e.date)}); the status says ${sp ? P().PHASE_BY_KEY[sp].label.toLowerCase() : 'nothing usable'}${siteNote(r)}`;
    return sp ? `status read as ${P().PHASE_BY_KEY[sp].label.toLowerCase()}` : 'status not recognised; counted as an open file';
  }
  function phaseBasisHTML(p) {
    const recs = p.records, rank = r => P().PHASE_BY_KEY[r.phase].rank;
    const live = p.phaseRecs || recs.filter(r => r.phase !== 'cancelled'), cyc = !!p.cycleFrom, doneAt = cyc ? +p.cycleFrom : null;
    const heldBack = p.phase === 'construction' && !live.some(r => r.phase === 'construction') && live.some(r => r.phase === 'completed');
    const setter = live.filter(r => P().sitePhaseOf(r) === (heldBack ? 'completed' : p.phase)).sort((a, b) => (lastAt(b) || 0) - (lastAt(a) || 0))[0] || null;
    const order = ['precon', 'master', 'siteplan', 'condo', 'other', 'permit'];
    const stages = order.map(k => {
      const rs = recs.filter(r => stageKey(r) === k); if (!rs.length) return null;
      const lv = rs.filter(r => r.phase !== 'cancelled'), best = lv.slice().sort((a, b) => rank(b) - rank(a) || (lastAt(b) || 0) - (lastAt(a) || 0))[0];
      const newest = rs.slice().sort((a, b) => (firstAt(b) || 0) - (firstAt(a) || 0))[0];
      return { k, rs, best, newest };
    }).filter(Boolean);
    const flags = [];
    for (const k of ['master', 'siteplan']) {
      const rs = live.filter(r => stageKey(r) === k);
      const appr = rs.filter(r => rank(r) >= P().PHASE_BY_KEY.approved.rank);
      const a = appr.sort((x, y) => (phaseAt(y, 'approved') || lastAt(y) || 0) - (phaseAt(x, 'approved') || lastAt(x) || 0))[0];
      if (a) {
        const at = phaseAt(a, 'approved') || lastAt(a) || 0;
        const newer = rs.filter(r => rank(r) <= P().PHASE_BY_KEY.review.rank && (firstAt(r) || 0) > at);
        if (newer.length) flags.push(['warn', `A newer ${STAGE_NAME[k].toLowerCase()} file (${newer.map(r => `${r.ref || 'no number'}, submitted ${fmtDate(new Date(firstAt(r)))}`).join('; ')}) is still in review after ${a.ref || 'an earlier file'} was approved${at ? ` (${fmtDate(new Date(at))})` : ''}: the approval may be for an earlier proposal, not the current submission.`]);
      }
    }
    const masterLive = live.filter(r => stageKey(r) === 'master'), spLive = live.filter(r => stageKey(r) === 'siteplan');
    if (planApprovedNote(p) && !p.smallSite) flags.push(['info', `${planApprovedNote(p)}. Only a draft plan or site plan approval (or a registered plan) counts as approved, so it stays under review.`]);
    if (masterLive.some(r => /draft/i.test(r.statusRaw) && r.phase === 'approved')) flags.push(['info', 'Draft plan approval: the subdivision still has to meet its conditions and be registered.']);
    if (live.some(r => r.kind === 'application' && r.phase === 'approved' && /^\s*closed\s*$/i.test(r.statusRaw) && !r.closedUnconfirmed && !phaseAt(r, 'approved'))) flags.push(['warn', 'A planning file’s status is just “Closed”, read as approved (a closed file usually follows approval, but it can also be a file closed without a decision). Check the file.']);
    if (live.some(r => r.kind === 'permit' && rank(r) >= P().PHASE_BY_KEY.permit.rank) && live.some(r => r.kind === 'application' && r.stage !== 'precon' && rank(r) <= P().PHASE_BY_KEY.review.rank)) flags.push(['warn', 'Building permits are issued while a planning file on the site is still in review: the permits may be for an earlier phase or another building on the site.']);
    if (setter && /date/.test(phaseBasis(setter)) && setter.statusRaw) flags.push(['info', `The phase comes from a date on ${setter.ref || 'a file'} rather than its published status (“${setter.statusRaw}”).`]);
    if (live.length && live.every(r => stageKey(r) === 'precon')) flags.push(['info', 'Only a pre-consultation so far: not yet a formal application.']);
    const sup = live.filter(r => r.superseded);
    if (sup.length) flags.push(['warn', `${sup.map(r => r.ref || 'A site plan').join(', ')} ${sup.length === 1 ? 'was' : 'were'} approved before a newer rezoning / official plan / subdivision file that is still in review: ${sup.length === 1 ? 'that approval was' : 'those approvals were'} for an earlier proposal, so the site is under review.`]);
    const leg = recs.filter(r => P().isLegacy(r));
    if (leg.length && !p.legacyOnly) flags.push(['info', `${leg.length} Brampton legacy site plan file${leg.length === 1 ? '' : 's'} (“Transferred”, ${leg.slice(0, 3).map(r => r.ref).join(', ')}${leg.length > 3 ? '…' : ''}) ${leg.length === 1 ? 'is an old approval and does' : 'are old approvals and do'} not count for the current proposal.`]);
    const notB = recs.filter(r => r.kind === 'permit' && ['none', 'servicing'].includes(P().permitRole(r)) && !P().isDemolition(r) && r.phase !== 'cancelled');
    if (notB.length) flags.push(['info', `${notB.length} permit${notB.length === 1 ? '' : 's'} on the site ${notB.length === 1 ? 'is' : 'are'} not for its building (${[...new Set(notB.map(r => (r.type || r.description || 'other').split(' — ')[0].toLowerCase()))].slice(0, 3).join(', ')}): only permits that build the site’s units, or a new non-residential building, set the phase.`]);
    const minorSp = recs.filter(r => r.kind === 'application' && r.stage === 'siteplan' && P().isMinorFile(r) && r.phase === 'approved');
    if (minorSp.length && !live.every(r => minorSp.includes(r))) flags.push(['info', `${minorSp.length} minor / limited site plan${minorSp.length === 1 ? '' : 's'} (${minorSp.slice(0, 2).map(r => r.ref).join(', ')}) ${minorSp.length === 1 ? 'is' : 'are'} for small changes and ${minorSp.length === 1 ? 'does' : 'do'} not approve the site’s building.`]);
    const pre = recs.filter(r => r.prePlan), preK = recs.filter(r => r.prePlanKept);
    if (pre.length) flags.push(['info', `${pre.length} building permit${pre.length === 1 ? ' was' : 's were'} issued well before the site’s planning file (${pre.slice(0, 2).map(r => r.ref).join(', ')}): ${pre.length === 1 ? 'it is' : 'they are'} for what stood there before and ${pre.length === 1 ? 'does' : 'do'} not set the phase or count toward the build-out.`]);
    if (preK.length) flags.push(['warn', `${preK.slice(0, 2).map(r => r.ref).join(', ')}${preK.length > 2 ? ` +${preK.length - 2}` : ''} ${preK.length === 1 ? 'was' : 'were'} issued shortly before the earliest planning file in the open data: counted as an earlier phase whose site plan isn’t published. Check the file.`]);
    const cu = recs.filter(r => r.closedUnconfirmed);
    if (cu.length) flags.push(['warn', `${cu.map(r => r.ref).join(', ')} only ${cu.length === 1 ? 'reads' : 'read'} “Closed”, with no approval date and no building permit since: the outcome isn’t published, so ${cu.length === 1 ? 'it is' : 'they are'} not counted as an approval.`]);
    if (heldBack) flags.push(['info', `${setter && setter.ref ? setter.ref : 'A permit'} reads completed, but ${p.buildout ? fmtNum(p.buildout.remaining) : 'some'} planned unit${p.buildout && p.buildout.remaining === 1 ? '' : 's'} have no building permit yet, so the site is shown as under construction rather than completed.`]);
    const cb = p.buildout && p.buildout.condoBuilt;
    if (cb) flags.push(['info', `Condominium ${cb.refs.join(', ')} ${cb.refs.length === 1 ? 'is' : 'are'} registered: a condominium is registered once its building stands, so ${fmtNum(cb.units)} home${cb.units === 1 ? ' is' : 's are'} counted as built${p.phase === 'completed' ? '' : ' and the site as under construction at least'}, whatever the building permits in the open data say.`]);
    const conv = recs.filter(r => r.conversion && r.phase !== 'cancelled');
    if (conv.length) flags.push(['info', `${conv.slice(0, 2).map(r => r.ref).join(', ')}${conv.length > 2 ? ` +${conv.length - 2}` : ''} ${conv.length === 1 ? 'converts' : 'convert'} an existing building to condominium tenure: no new homes, so ${conv.length === 1 ? 'its' : 'their'} units are not counted.`]);
    const appeal = live.filter(r => r.kind === 'application' && STATUS_SIGNALS[0][0].test(r.statusRaw || ''));
    if (appeal.length) flags.push(['warn', `Under appeal at the Ontario Land Tribunal (${appeal.map(r => `${r.ref || 'no number'}: “${r.statusRaw}”`).join('; ')}): ${appeal.some(r => r.phase === 'approved') ? 'the status is read as approved, but the decision is not final until the Tribunal rules' : 'the Tribunal, not council, will decide'}.`]);
    const demos = recs.filter(r => P().isDemolition(r) && r.phase !== 'cancelled');
    if (demos.length && live.some(r => !P().isDemolition(r))) flags.push(['info', `${demos.length} demolition permit${demos.length === 1 ? '' : 's'} (${demos.slice(0, 2).map(r => r.ref).join(', ')}) ${demos.length === 1 ? 'clears' : 'clear'} the site and ${demos.length === 1 ? 'does' : 'do'} not set the phase.`]);
    if (p.unitsLost) flags.push(['info', `Units are counted net: ${fmtNum(p.unitsLost)} existing dwelling${p.unitsLost === 1 ? ' is' : 's are'} demolished on the site, so ${fmtNum(p.unitsGross || 0)} new ${p.unitsGross === 1 ? 'home' : 'homes'} add ${fmtNum(p.units || 0)} (a tear-down rebuild adds none; second suites still count).`]);
    if (cyc) flags.push(['info', `An earlier build on the site was completed (${fmtDate(new Date(doneAt))}); only the ${live.length} file${live.length === 1 ? '' : 's'} submitted after it set the phase — approvals and permits from before are for the earlier build.`]);
    if (recs.some(r => r.phase === 'cancelled') && live.length) flags.push(['info', `${recs.filter(r => r.phase === 'cancelled').length} withdrawn / refused / expired file${recs.filter(r => r.phase === 'cancelled').length === 1 ? '' : 's'} on the site ${recs.filter(r => r.phase === 'cancelled').length === 1 ? 'does' : 'do'} not count.`]);
    const row = r => `<tr${r === setter ? ' class="pb-set"' : ''}><td>${r === setter ? '★ ' : ''}${esc(r.ref || '—')}<small>${esc(r.kind === 'permit' ? (r.type || 'Building permit') : STAGE_NAME[r.stage || 'other'])}</small></td>
      <td>${r.statusRaw ? `“${esc(r.statusRaw)}”` : '<span class="muted">none</span>'}<small>${firstAt(r) ? `submitted ${fmtDate(new Date(firstAt(r)))}` : ''}${lastAt(r) && lastAt(r) !== firstAt(r) ? ` · latest ${fmtDate(new Date(lastAt(r)))}` : ''}</small></td>
      <td>${dot(r.phase)} ${esc(P().PHASE_BY_KEY[r.phase].label)}<small>${esc(phaseBasis(r))}</small></td></tr>`;
    const MAX = 14, list = recs.slice().sort((a, b) => order.indexOf(stageKey(a)) - order.indexOf(stageKey(b)) || (firstAt(b) || 0) - (firstAt(a) || 0));
    return `<details class="sect" id="devtab-basis" open><summary><h2 class="section-title" data-info="phase-basis">How the phase was set</h2><span class="muted small sect-sum">${esc(P().PHASE_BY_KEY[p.phase].label)}${setter && setter.ref ? ` · from ${esc(setter.ref)}` : ''}</span></summary>
      ${p.legacyOnly ? '<p class="small">Only Brampton legacy site plan files (“Transferred” from the old system, mostly 1980s–1990s, no dates): an old approval of a building long since built, so the site is shown as completed.</p>' : ''}
      <p class="small">Approved means a <strong>site plan</strong> or a <strong>draft plan of subdivision</strong> is approved, or the plan registered (MECP D-5-1: these commit the land): zoning, official plan and condominium approvals keep the site in review (except a site of 10 or fewer homes, which needs no site plan since Bill 23: its zoning approval makes it Approved), and a later zoning amendment on a draft-approved plan's land keeps it committed; demolition permits don't count.${p.smallSite ? ' <strong>This site: 10 or fewer homes with its zoning approved, so Approved.</strong>' : ''} <button type="button" class="btn small link" data-ws-page="approvals">How approvals work →</button> Otherwise the site shows the furthest phase reached by any of its ${cyc ? 'files submitted since the earlier build was completed' : 'files'} that is not withdrawn${setter ? ` — here <strong>${esc(setter.ref || 'one file')}</strong> (★), ${esc(phaseBasis(setter))}` : ''}.</p>
      <table class="dt pb-stage"><caption>Approvals by stage</caption><thead><tr><th>Stage</th><th>Furthest</th><th>Latest submission</th></tr></thead><tbody>
        ${stages.map(x => `<tr><td>${esc(STAGE_NAME[x.k])}<small>${x.rs.length} file${x.rs.length === 1 ? '' : 's'}</small></td><td>${x.best ? `${dot(x.best.phase)} ${esc(P().PHASE_BY_KEY[x.best.phase].label)}<small>${esc(x.best.ref || '')}</small>` : `${dot('cancelled')} withdrawn`}</td><td>${x.newest && firstAt(x.newest) ? `${esc(x.newest.ref || '')}<small>${fmtDate(new Date(firstAt(x.newest)))} · ${esc(P().PHASE_BY_KEY[x.newest.phase].label.toLowerCase())}</small>` : '–'}</td></tr>`).join('')}
      </tbody></table>
      ${flags.length ? `<ul class="why-list pb-flags">${flags.map(([k, t]) => `<li class="why-${k === 'warn' ? 'stall' : 'ok'}"><span>${esc(t)}</span></li>`).join('')}</ul>` : '<p class="small muted">No conflicts between the files’ statuses and submissions.</p>'}
      <details class="sub-sect"><summary class="small">Each file: published status and how it was read (${fmtNum(recs.length)})</summary>
        <table class="dt pb-files"><thead><tr><th>File</th><th>Published status</th><th>Read as</th></tr></thead><tbody>${list.slice(0, MAX).map(row).join('')}</tbody></table>
        ${list.length > MAX ? `<p class="small muted">+ ${fmtNum(list.length - MAX)} more in Source records.</p>` : ''}</details>
      <p class="small muted">Statuses are as each municipality publishes them; phases are this app's reading of them (open the ⓘ for the rules). A screening view — confirm against the file before relying on it.</p></details>`;
  }

  // ---- Dated history (copied from js/app.js) --------------------------------------
  function devEvents(p) {
    const st = state();
    const byUid = new Map(p.records.map(r => [r.uid, r]));
    const ev = [], groups = new Map();
    for (const t of p.timeline) {
      const r = byUid.get(t.record), type = r && r.kind === 'permit' ? 'permit' : 'file';
      const k = `${fmtDate(t.date)}|${t.text}|${type}`;
      if (!groups.has(k)) { const g = { date: t.date, type, phase: t.phase, text: t.text, tags: [], uids: [] }; groups.set(k, g); ev.push(g); }
      const g = groups.get(k); if (!g.tags.includes(t.tag)) { g.tags.push(t.tag); g.uids.push(t.record); }
    }
    const h = (st && st.history && st.history.projects && st.history.projects[p.key]) || [];
    h.forEach(([d, ph, tag], i) => {
      if (!i || tag === 'rules') return;
      const at = new Date(`${d}T23:59:59`), why = p.timeline.filter(e => e.phase === ph && e.date <= at).sort((a, b) => b.date - a.date)[0];
      ev.push({ date: new Date(`${d}T12:00:00`), seq: i + 1, type: 'phase', phase: ph, text: `Moved to ${P().PHASE_BY_KEY[ph].label}`, why });
    });
    if (st && st.council) for (const c of councilBriefs(p)) ev.push({ date: new Date(`${c.m.date}T12:00:00`), type: 'council', c });
    return ev.sort((a, b) => b.date - a.date || (b.seq || 0) - (a.seq || 0));
  }
  function keyEvents(all) {
    const out = [], years = new Map();
    for (const x of all) {
      if (x.type !== 'permit') { out.push(x); continue; }
      const y = fmtDate(x.date).slice(0, 4);
      if (!years.has(y)) { const s = { date: x.date, type: 'permits', byPhase: new Map(), tags: new Set(), uidOf: new Map() }; years.set(y, s); out.push(s); }
      const s = years.get(y);
      if (!s.byPhase.has(x.phase)) s.byPhase.set(x.phase, new Set());
      x.tags.forEach((t, i) => { s.byPhase.get(x.phase).add(t); s.tags.add(t); if (x.uids && x.uids[i]) s.uidOf.set(t, x.uids[i]); });
    }
    return out;
  }
  const TL_TYPE = { council: 'Council', phase: 'Stage', file: 'File', permit: 'Permit', permits: 'Permits' };
  // The event types as filters: a type label shows only that type ("Council" → the council items).
  const TL_FILTER = { council: 'council', phase: 'phase', file: 'file', permit: 'permit', permits: 'permit' };
  // A file or permit named in History opens its source record in place: provenance and every field.
  let evRecs = null;   // uid → record, for the development being drawn
  function recInline(uid, tag) {
    const r = evRecs && evRecs.get(uid); if (!r) return `<span class="tl-ref-t">${esc(tag)}</span>`;
    return `<details class="tl-rec" data-rec-uid="${esc(r.uid)}" data-rec-ref="${esc(r.ref || tag)}"><summary><span class="tl-ref">${esc(tag)}</span></summary><div class="tl-rec-b">
      <p class="small"><strong>${esc(r.kind === 'permit' ? 'Building permit' : 'Application')} ${esc(r.ref || '')}</strong>${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · municipal status: <em>${esc(r.statusRaw)}</em>` : ''}</p>
      ${r.description ? `<p class="small">${esc(r.description)}</p>` : ''}${recordProvHTML(r)}<table class="rec-t">${recordRows(r)}</table></div></details>`;
  }
  function evHTML(x) {
    const one = (t, i, uids) => (uids && uids[i] ? recInline(uids[i], t) : `<span class="tl-ref-t">${esc(t)}</span>`);
    const tags = (list, uids) => list.length <= 3 ? list.map((t, i) => one(t, i, uids)).join(' ')
      : `${list.slice(0, 2).map((t, i) => one(t, i, uids)).join(' ')} <details class="tl-more"><summary>+${list.length - 2} more</summary>${list.slice(2).map((t, i) => one(t, i + 2, uids)).join(' ')}</details>`;
    let body;
    if (x.type === 'council') {
      const { m, it, s } = x.c;
      body = `<details class="c-ev"><summary>${s.verdict ? `<strong>${esc(s.verdict)}</strong> · ` : ''}${esc(m.name)}${it.n ? ` · item ${esc(it.n)}` : ''} <span class="c-kind">${esc(s.kind)}</span> ${outBadge(it, s)}
          <span class="c-title">${esc(it.title)}</span></summary>
        ${s.decision ? `<p class="small c-motion">${esc(s.decision)}</p>` : ''}
        ${s.requirements.length || s.concerns.length ? `<div class="chips small">${s.requirements.map(r => chip(esc(r.label), r.infra ? 'infra' : '')).join('')}${s.concerns.map(c => chip(`Concern: ${esc(c)}`, 'concern')).join('')}</div>` : ''}
        <p class="small"><a href="${esc(m.url)}" target="_blank" rel="noopener">Meeting page</a>${it.docs.map(([id, name]) => ` · <a href="https://${esc(m.host)}/filestream.ashx?DocumentId=${esc(id)}" target="_blank" rel="noopener">${esc(name.replace(/\.pdf$/i, ''))}</a>`).join('')}</p>
        ${it.text ? `<details class="c-text"><summary>${m.passed ? 'Minutes: discussion, motion and vote' : 'Agenda text'}</summary><p class="small">${esc(it.text)}</p></details>` : ''}
      </details>`;
    } else if (x.type === 'phase') {
      body = `${dot(x.phase)}<span><strong>${esc(x.text)}</strong>${x.why ? ` <span class="muted">— ${esc(x.why.text.replace(/^[^·]*· /, ''))} on ${recInline(x.why.record, x.why.tag)} (${fmtDate(x.why.date)})</span>` : ''}</span>`;
    } else if (x.type === 'permits') {
      const ph = P().PHASES.map(q => q.key).concat('cancelled').filter(k => x.byPhase.has(k)).reverse();
      body = `${dot(ph[0] || 'permit')}<span>${fmtNum(x.tags.size)} building permit${x.tags.size === 1 ? '' : 's'} with dates this year: ${ph.map(k => `${esc(P().PHASE_BY_KEY[k].label.toLowerCase())} ${fmtNum(x.byPhase.get(k).size)}`).join(' · ')} <span class="muted">— ${tags([...x.tags], [...x.tags].map(t => x.uidOf.get(t)))}</span></span>`;
    } else {
      body = `${dot(x.phase)}<span>${esc(x.text)}${x.tags.length > 1 ? ` <span class="tl-n">×${x.tags.length}</span>` : ''} <span class="muted">— ${tags(x.tags, x.uids)}</span></span>`;
    }
    return `<li class="t-${x.type}" data-tl-k="${TL_FILTER[x.type]}"><span class="d">${fmtDate(x.date).slice(5)}</span><button type="button" class="tl-type" data-tl-type="${TL_FILTER[x.type]}" title="Show only ${esc(TL_TYPE[x.type].toLowerCase())} events">${TL_TYPE[x.type]}</button><div class="tl-body">${body}</div></li>`;
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
  // Files, events and proposal: one section for what the Files tree, History (with the source records)
  // and About used to show apart. The proposal and its status first; then the Gantt chart
  // (js/dev-gantt.js), its planning files in the file tree's order, each row opening to the file's
  // dated events and source record (the stage row to the stages reached, the council row to the
  // council items, a permit group to its permits); then every dated event in date order, folded.
  function fileRecOf(p) {
    const by = new Map();
    for (const r of p.records) if (r.kind === 'application') {
      const k = P().fileId ? P().fileId(r) : r.fileKey || r.ref;
      if (k && !by.has(k)) by.set(k, r);
      if (r.ref && !by.has(`ref:${r.ref}`)) by.set(`ref:${r.ref}`, r);
    }
    return n => (n.key && by.get(n.key)) || by.get(`ref:${n.ref}`) || null;
  }
  function fileBodyHTML(r) {
    const ev = (r.events || []).slice().sort((a, b) => a.date - b.date);
    return `<p class="small"><strong>${esc(r.kind === 'permit' ? 'Building permit' : 'Application')} ${esc(r.ref || '')}</strong>${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · municipal status: <em>${esc(r.statusRaw)}</em>` : ''}${r.units > 0 ? ` · ${fmtNum(r.units)} unit${r.units === 1 ? '' : 's'}` : ''}</p>
      ${r.description ? `<p class="small">${esc(r.description)}</p>` : ''}
      ${ev.length ? `<ol class="gt-evs small">${ev.map(e => `<li><span class="d">${fmtDate(e.date)}</span>${dot(e.phase)}<span>${esc(P().humanizeField(e.label || ''))}</span></li>`).join('')}</ol>` : '<p class="small muted">No dated events on this file.</p>'}
      ${recordProvHTML(r)}<details class="gt-fields"><summary class="small">Every field as published</summary><table class="rec-t">${recordRows(r)}</table></details>`;
  }
  function storyHTML(p, st, wrap = false) {
    const cancelled = p.phase === 'cancelled';
    const steps = P().PHASES.map(s => {
      const reached = !cancelled && s.rank <= p.rank, when = p.milestones[s.key];
      return `<li class="${s.key === p.phase ? 'current done' : reached ? 'done' : 'todo'}">${dot(s.key)}<span class="lbl">${esc(s.label)}</span><span class="when">${when ? fmtDate(when) : reached ? 'reached' : ''}</span></li>`;
    }).join('');
    evRecs = new Map(p.records.map(r => [r.uid, r]));
    const all = devEvents(p), key = keyEvents(all), council = all.filter(x => x.type === 'council');
    const st2 = state(), byRef = new Map(p.records.map(r => [r.ref, r]));
    const fileLink = f => (byRef.has(f) ? `<button type="button" class="tr-ref" data-dev-file="${esc(f)}">${esc(f)}</button>` : esc(f));
    // The proposal and its status (what the About fold held), the reasons under the status.
    const about = `<section class="brief" data-info="dev-brief">
      ${brow('Status', `<p class="small">${dot(p.phase)} <strong>${esc(P().PHASE_BY_KEY[p.phase].label)}</strong>${p.last ? ` · latest activity ${fmtDate(new Date(p.last))}` : ''}</p>
        ${st.why ? `<p class="small muted">${st.why}</p>` : ''}
        ${st.stalled ? `<p class="small why-stall"><strong>Stalled:</strong> no file event, permit or council item since ${fmtDate(new Date(st.lastAt))} (${st.years.toFixed(1)} years), ${st.cause}.</p>` : ''}
        ${st.sig.length ? `<ul class="why-list" data-info="status-why">${st.sig.map(x => `<li class="why-${x.kind}"><span>${esc(x.text)}</span><small>${x.files.slice(0, 3).map(fileLink).join('; ')}${x.files.length > 3 ? ` +${x.files.length - 3} more` : ''}</small></li>`).join('')}</ul>` : ''}`)}
      ${brow('Latest decision', latestDecisionHTML(p, st))}
      ${p.records.some(r => r.kind === 'application') ? brow('Servicing report', fsrBoxHTML(p)) : ''}
      ${p.description ? brow('Proposal', `<p class="desc-clamp small">${esc(p.description)}</p>`) : ''}
    </section>`;
    const FT = root.PeelFileTree, d = FT && FT.flat && !p.parent ? FT.of(p) : null;
    const newest = p.records.filter(r => r.kind === 'application').sort((a, b) => (+new Date(b.date || 0)) - (+new Date(a.date || 0)))[0];
    // The permits under each planning file (its site servicing permits, its building permits as one
    // group: js/dc-gate.js treeOpts), in the file's row; those filed before the files, after the chart.
    const tOpts = d && root.PeelDcGate && root.PeelDcGate.treeOpts ? root.PeelDcGate.treeOpts(p, d) : {};
    const after = r => {
      const h = r.node && tOpts.after ? tOpts.after(r.node.n) : '';
      return h ? `<div class="tr gt-after"><p class="small"><strong>Permits under ${esc(r.ref)}</strong></p>${h}</div>` : '';
    };
    const body = r => r.kind === 'stage' ? `<ol class="stepper compact">${steps}</ol>`
      : r.kind === 'council' ? `<ol class="tl2">${council.map(evHTML).join('')}</ol>`
      : r.kind === 'group' ? r.recs.map(recHTML).join('')
      : r.kind === 'file' ? `${r.rec ? fileBodyHTML(r.rec) : ''}${after(r)}` : '';
    const chart = root.PeelDevGantt ? root.PeelDevGantt.html(p, { council: st2 && st2.council ? councilBriefs(p) : [], tree: d ? FT.flat(d) : null, recOf: fileRecOf(p), latest: newest && newest.ref, dot, body }) : '';
    const events = `<details class="gt-events"><summary class="small"><strong>All dated events, newest first</strong> <span class="muted">${fmtNum(all.length)}${council.length ? ` · ${fmtNum(council.length)} council` : ''}</span></summary>
      <div class="seg tl-toggle" role="group" aria-label="Events shown"><button type="button" class="btn small on" data-dt-tl="key">Key events</button><button type="button" class="btn small" data-dt-tl="all">All dated events (${fmtNum(all.length)})</button></div>
      <p class="tl-only small" hidden>Only <b data-tl-only-name></b> events · <button type="button" class="btn small link" data-tl-type="">Show all</button></p>
      <div data-dt-tlv="key">${evListHTML(key)}</div><div data-dt-tlv="all" hidden>${evListHTML(all)}</div></details>`;
    const inner = `${about}<div id="devtab-recs">${chart}${tOpts.foot ? `<div class="tr">${tOpts.foot}</div>` : ''}</div>${events}
      <p class="small muted">Stage changes from the weekly check; council and committee items that name the files (${st2 && st2.council ? 'agendas and minutes since 2019' : 'loading'}); file and permit dates and every field from the municipal records.</p>`;
    evRecs = null;
    return wrap
      ? `<details class="sect dev-hist" id="devtab-hist" open><summary><h2 class="section-title" data-info="dev-history">Files, events and proposal</h2><span class="muted small sect-sum">${p.first ? `since ${fmtDate(p.first).slice(0, 4)}` : ''}${council.length ? ` · ${council.length} council` : ''} · ${fmtNum(p.records.length)} source records</span></summary>${inner}</details>`
      : `<div class="dev-hist">${inner}</div>`;
  }
  const devHistoryHTML = (p, st) => storyHTML(p, st, true);

  // ---- Council items + latest decision (copied from js/app.js) ---------------------
  function councilItems(p) {
    const st = state(), C = st && st.council; if (!C || !C.files) return [];
    const keys = new Set();
    for (const r of p.records) if (r.kind === 'application' && r.ref) {
      const k = r.fileKey || P().canonRef(r.ref); if (!k) continue;
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
  const briefCache = new WeakMap();
  function councilBriefs(p) {
    const st = state();
    const c = briefCache.get(p);
    if (c && c.C === (st && st.council)) return c.list;
    const refs = p.records.filter(r => r.kind === 'application' && r.ref).map(r => r.ref);
    const list = councilItems(p).map(x => ({ ...x, s: B().summarizeItem(x.it, x.m.passed, refs) }));
    briefCache.set(p, { C: st && st.council, list });
    return list;
  }
  let councilLoading = null;
  function ensureCouncil(p) {
    const st = state();
    if (!st || !hasDOM() || typeof fetch === 'undefined') return;
    if (st.council || councilLoading) return;
    councilLoading = fetch('data/council.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => {
      st.council = d || { meetings: {}, files: {} };
      if (liveKey === p.key) rerenderPreserve();
      // The Overview panel's About fold reads the same council items (Stage 3).
      if (liveKey === p.key && root.PeelOverviewTab && root.PeelOverviewTab.renderOverview) root.PeelOverviewTab.renderOverview();
    }).catch(() => { st.council = { meetings: {}, files: {} }; });
  }
  function latestDecisionHTML(p, st) {
    const st2 = state();
    const loaded = st2 && st2.council && Object.keys(st2.council.files || {}).length;
    const fileStatus = st.latest ? `Latest file status: <strong>${esc(st.latest.ref || 'file')}</strong> “${esc(st.latest.statusRaw || 'no status')}”${st.latestAt ? ` (${fmtDate(new Date(st.latestAt))})` : ''}.` : '';
    if (!st2 || !st2.council) return `<p class="small muted">Loading council and committee items…</p>${fileStatus ? `<p class="small">${fileStatus}</p>` : ''}`;
    const list = loaded ? councilBriefs(p) : [];
    if (!list.length) return `<p class="small">${fileStatus} <span class="muted">No council or committee items name its files since 2019.</span></p>`;
    const top = B().latestDecisive(list), { m, it, s } = top;
    const newer = list[0] !== top ? list[0] : null;
    const all = B().across(list);
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

  // ---- Files, drill-down, related developments (copied from js/app.js) --------------
  const SUBS = new Map();
  const isFormal = r => r.kind === 'application' && (r.stage || P().stageOf(r)) !== 'precon';
  const isPrecon = r => r.kind === 'application' && (r.stage || P().stageOf(r)) === 'precon';
  const civicOf = r => { const a = P().normalizeAddress(r.address); return a && /\d/.test(a) && !/^0+(\s*-\s*0+)?\s/.test(a) ? a : ''; };
  const fracCache = new WeakMap();
  function landShare(a, b) {
    let m = fracCache.get(a); if (!m) fracCache.set(a, m = new WeakMap());
    if (m.has(b)) return m.get(b);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const g of a) for (const [x, y] of g) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    let n = 0, k = 0;
    for (let i = 0; i < 12; i++) for (let j = 0; j < 12; j++) {
      const x = x0 + (x1 - x0) * (i + 0.5) / 12, y = y0 + (y1 - y0) * (j + 0.5) / 12;
      if (!P().pointInRings(x, y, a)) continue; n++; if (P().pointInRings(x, y, b)) k++;
    }
    const f = n ? k / n : 0; m.set(b, f); return f;
  }
  function landRel(a, b) {
    if (civicOf(a) && civicOf(a) === civicOf(b)) return 'same address';
    if (a.poly && b.poly) {
      const ab = landShare(a.poly, b.poly), ba = landShare(b.poly, a.poly);
      if (ab >= 0.9 && ba < 0.9) return 'within it';
      if (ba >= 0.9 && ab < 0.9) return 'covers it';
      return ab >= 0.15 || ba >= 0.15 ? 'overlapping land' : null;
    }
    const pt = a.poly ? b : a, pl = a.poly ? a : b;
    return pl.poly && pt.lat != null && P().pointInRings(pt.lng, pt.lat, pl.poly) ? (pl === a ? 'covers it' : 'within it') : null;
  }
  const sameLand = (a, b) => !!landRel(a, b);
  function fileTree(p) {
    // Step B2: a tree development lists its files in tree order, with their links.
    const TG = window.PeelTreeGroups, tRows = TG && !p.parent && state() && state().treeGrouped ? TG.fileRows(p) : null;
    if (tRows && tRows.length) return tRows;
    const formal = p.records.filter(isFormal), pre = p.records.filter(isPrecon), used = new Set();
    const rows = formal.map(a => ({ a, pre: pre.filter(r => !used.has(r) && sameLand(a, r) && used.add(r)) }));
    for (const r of pre) if (!used.has(r)) rows.push({ a: r, pre: [] });
    const start = r => r.events.length ? Math.min(...r.events.map(e => +e.date)) : Infinity;
    return rows.sort((x, y) => start(x.a) - start(y.a));
  }
  // Minimal servicing tagging for a sub-project (app.js `tagAreas` is private and
  // needs its sewer-model internals; the pressure-zone / drainage lookup is the
  // part the Development tab's own views need).
  function tagAreasLite(p) {
    const st = state(), Ar = Areas();
    if (!st || !st.servicing || !Ar || p.lat == null) return;
    p.pz = Ar.locate(st.servicing.zones, p.lng, p.lat);
    p.dr = Ar.locate(st.servicing.drainage, p.lng, p.lat);
  }
  function subProject(p, ref) {
    const key = `${p.key}#${ref}`;
    if (SUBS.has(key)) return SUBS.get(key);
    const row = fileTree(p).find(t => t.a.ref === ref); if (!row) return null;
    const a = row.a;
    const permits = a.poly ? p.records.filter(r => r.kind === 'permit' && r.lat != null && P().pointInRings(r.lng, r.lat, a.poly)) : [];
    // A tree row opens its whole branch (the file and the files under it).
    const own = row.branch ? row.branch : [a, ...row.pre];
    const sub = P().mergeProject(key, [...own, ...permits.filter(r => !own.includes(r))], {});
    sub.parent = p; sub.subRef = ref; sub.title = `${ref} · ${a.address || p.title}`;
    if (a.lat != null) { sub.lat = a.lat; sub.lng = a.lng; }
    tagAreasLite(sub);
    const st = state(), Ar = Areas();
    if (st && st.areas && Ar) { sub.sp = Ar.locate(st.areas.secondaryPlans, sub.lng, sub.lat, sub.municipality); sub.mtsa = Ar.locate(st.areas.mtsas, sub.lng, sub.lat, sub.municipality); }
    SUBS.set(key, sub);
    return sub;
  }
  function projectByKey(k) {
    const st = state(); if (!st || !k) return null;
    if (SUBS.has(k)) return SUBS.get(k);
    const i = String(k).lastIndexOf('#'), base = i > 0 ? k.slice(0, i) : k;
    // (every development built, the ones held aside too: site activity, dormant)
    const p = (st.projects.all || st.projects).find(x => x.key === base);
    if (!p) {
      // A key saved before the trees became the developments (Step B2): resolve it.
      const TG = window.PeelTreeGroups, list = st.projects;
      const to = TG && TG.resolve(k, x => list.some(q => q.key === x));
      return to && to !== k ? projectByKey(to) : null;
    }
    return i > 0 ? subProject(p, k.slice(i + 1)) : p;
  }
  // Plain bbox for a development (app.js `projectBounds` needs Leaflet).
  function devBbox(p) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const r of p.records) {
      if (r.poly) for (const ring of r.poly) for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      else if (r.lat != null) { x0 = Math.min(x0, r.lng); y0 = Math.min(y0, r.lat); x1 = Math.max(x1, r.lng); y1 = Math.max(y1, r.lat); }
    }
    return x0 === Infinity ? null : { x0, y0, x1, y1, intersects: b => !(b.x1 < x0 || b.x0 > x1 || b.y1 < y0 || b.y0 > y1) };
  }
  function relatedProjects(p) {
    const st = state(); if (!st) return [];
    if (p._rel && p._rel.list === st.projects) return p._rel.out;
    const mine = p.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled' && (r.poly || r.lat != null));
    const b = devBbox(p), out = [];
    if (b && mine.length) for (const q of st.projects) {
      if (q === p || q === p.parent || q.phase === 'cancelled') continue;
      const qb = devBbox(q); if (!qb || !b.intersects(qb)) continue;
      const theirs = q.records.filter(r => r.kind === 'application' && r.phase !== 'cancelled');
      const hits = [];
      for (const r of theirs) { const m = mine.find(m => landRel(r, m)); if (m) hits.push({ r, how: landRel(r, m), m }); }
      if (hits.length) out.push({ q, hits });
    }
    out.sort((x, y) => (y.q.units || 0) - (x.q.units || 0));
    p._rel = { list: st.projects, out };
    return out;
  }
  const fileLine = r => `${esc(r.ref || 'File')}${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}`;
  function filesHTML(p) {
    const tree = p.parent ? [] : fileTree(p), formal = tree.filter(t => isFormal(t.a));
    // Step 2 (js/sites.js): the other proposals and the site activity on this development's land.
    const TGs = window.PeelTreeGroups, site = TGs && TGs.siteParts ? TGs.siteParts(p, (l => l && (l.all || l))((state() || {}).projects)) : [];
    const onSite = new Set(site.map(q => q.key));
    const rel = relatedProjects(p).filter(x => !onSite.has(x.q.key)).slice(0, 12);
    let html = '';
    const TG = window.PeelTreeGroups, treeRows = tree.length && tree[0].branch;
    if (formal.length > 1 || (formal.length && tree.length > formal.length) || (treeRows && tree.length > 1)) {
      const counted = p.buildout && p.buildout.basis;
      html += `<details class="sect" id="devtab-files" open><summary><h2 class="section-title" data-info="dev-files">Applications in this development</h2><span class="muted small sect-sum">${fmtNum(tree.length)} files · open one on its own</span></summary>
        <ul class="file-tree">${tree.map(t => `<li${TG ? TG.indent(t) : ''}>${dot(t.a.phase)}<div><button type="button" class="btn small link" data-dt-sub="${esc(t.a.ref)}">${fileLine(t.a)}</button>${t.a.units > 0 && isFormal(t.a) ? ` · ${fmtNum(t.a.units)} units` : ''}${isPrecon(t.a) && !treeRows ? ' <span class="muted">· pre-consultation, no formal application on its land yet</span>' : ''}
          ${t.pre.length ? `<div class="small muted">Pre-consultation${t.pre.length > 1 ? 's' : ''}: ${t.pre.map(r => esc(r.ref)).join(', ')}</div>` : ''}${TG ? TG.linkHTML(t) : ''}</div></li>`).join('')}</ul>
        ${treeRows ? `<p class="small muted">${esc(TG.FILES_NOTE)}</p></details>` : `<p class="small muted">Each file is listed once; pre-consultations sit under the application on the same land. The development counts its units once${counted ? ` (${fmtNum(p.buildout.planned)} planned, from the ${esc({ master: 'official plan / zoning / subdivision', siteplan: 'site plan', condo: 'condominium', other: 'planning' }[counted] || counted)} files)` : ''}; pre-consultation units are never added, since the formal application repeats them.</p></details>`}`;
    }
    if (p.areaPlan) html += `<p class="small area-note"><strong>Area plan:</strong> ${fmtNum(p.areaPlan.drafts)} draft plan${p.areaPlan.drafts === 1 ? '' : 's'} inside this ${esc(/precinct/i.test(p.description) ? 'precinct' : /block plan/i.test(p.description) ? 'block' : 'area')} ${p.areaPlan.drafts === 1 ? 'is its own development' : 'are their own developments'} (below, under Related applications)${p.areaPlan.covered ? `, carrying ${fmtNum(p.areaPlan.covered)} units` : ''}. ${p.areaPlan.covered ? `This plan counts only the units they don't already carry${p.units ? ` (${fmtNum(p.units)})` : ' (none left)'}, so nothing is counted twice.` : 'Their units are counted there, not here.'}</p>`;
    if (site.length) {
      const props = site.filter(q => !q.siteActivity), acts = site.filter(q => q.siteActivity);
      const li = q => `<li>${dot(q.phase)}<div><button type="button" class="btn small link" data-dt-relq="${esc(q.key)}"><strong>${esc(q.title)}</strong></button>${q.units > 0 ? ` · ${fmtNum(q.units)} units` : ''} <span class="muted">· ${esc(P().PHASE_BY_KEY[q.phase].label)}</span>
        <div class="small muted">${(q.records || []).filter(r => r.kind === 'application').slice(0, 3).map(fileLine).join('<br>')}</div></div></li>`;
      html += `<details class="sect" id="devtab-site" open><summary><h2 class="section-title" data-info="dev-site">On this site</h2><span class="muted small sect-sum">${props.length ? `${fmtNum(props.length)} other proposal${props.length === 1 ? '' : 's'}` : ''}${props.length && acts.length ? ' · ' : ''}${acts.length ? 'other activity' : ''}</span></summary>
        ${props.length ? `<h3 class="sub-title">Other proposals here</h3><ul class="file-tree">${props.map(li).join('')}</ul>` : ''}
        ${acts.length ? `<h3 class="sub-title">Other activity on this site</h3><ul class="file-tree">${acts.map(li).join('')}</ul>` : ''}
        <p class="small muted">${p.siteActivity ? 'These files only alter what stands on the site (no homes, no new building): they set no development\'s stage and are left out of the counts unless site activity is included (Find).' : 'Each proposal on this land has its own count and stage. Other activity (a patio, a fit-out, a new door) alters what stands: it sets no proposal\'s stage and adds no homes.'}</p></details>`;
    }
    if (rel.length) html += `<details class="sect" id="devtab-related"${p.records.every(isPrecon) || p.areaPlan ? ' open' : ''}><summary><h2 class="section-title" data-info="dev-related">Related applications</h2><span class="muted small sect-sum">${fmtNum(rel.length)} development${rel.length === 1 ? '' : 's'} on overlapping land</span></summary>
      <ul class="file-tree">${rel.map(({ q, hits }) => `<li>${dot(q.phase)}<div><button type="button" class="btn small link" data-dt-relq="${esc(q.key)}"><strong>${esc(q.title)}</strong></button>${q.units > 0 ? ` · ${fmtNum(q.units)} units` : ''} <span class="muted">· ${esc(P().PHASE_BY_KEY[q.phase].label)}</span>
        <div class="small muted">${hits.slice(0, 4).map(h => `${fileLine(h.r)} <span class="rel-how">${esc({ 'same address': 'same address as', 'covers it': 'covers', 'within it': 'within', 'overlapping land': 'overlaps' }[h.how])} ${esc(h.m.ref)}</span>`).join('<br>')}${hits.length > 4 ? `<br>+ ${hits.length - 4} more` : ''}</div></div></li>`).join('')}</ul>
      <p class="small muted">Other developments with an application on the same land (overlapping boundaries or the same civic address), each counted in its own development, once.</p></details>`;
    return html;
  }

  // ---- Functional Servicing Report links (copied from js/app.js) ------------------
  const FSR = { data: null, loading: null, by: null };
  function loadFsr() {
    if (FSR.data || FSR.loading) return FSR.loading || Promise.resolve(FSR.data);
    if (typeof fetch === 'undefined') return Promise.resolve(null);
    FSR.loading = fetch('data/fsr.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).catch(() => null).then(d => {
      FSR.data = d || { items: [] }; FSR.by = new Map();
      for (const it of FSR.data.items) for (const k of it.keys) (FSR.by.get(`${it.muni}|${k}`) || FSR.by.set(`${it.muni}|${k}`, []).get(`${it.muni}|${k}`)).push(it);
      FSR.loading = null; return FSR.data;
    });
    return FSR.loading;
  }
  function fsrFor(p) {
    if (!FSR.by) return null;
    const CAL = { 'Zoning by-law amendment': 'RZ', 'Site plan': 'SPA', 'Official plan amendment': 'POPA' };
    const keys = [...new Set(p.records.filter(r => r.kind === 'application' && r.fileKey).map(r => p.municipality === 'Caledon' && /^\d{4}\|/.test(r.fileKey) ? (CAL[r.type] ? `${CAL[r.type]}|${r.fileKey}` : null) : r.fileKey).filter(Boolean))];
    const items = [...new Set(keys.flatMap(k => FSR.by.get(`${p.municipality}|${k}`) || []))];
    const withF = items.filter(i => i.fsr).sort((a, b) => (b.fsr.date || '').localeCompare(a.fsr.date || ''));
    return { items, best: withF[0] || null };
  }
  const FSR_HOME = { Brampton: ['BramPlanOnline', 'https://planning.brampton.ca/CitizenAccess/Cap/CapHome.aspx?module=Planning&TabName=Planning'], Mississauga: ['Mississauga development applications', 'https://www.mississauga.ca/services-and-programs/planning-and-development/development-applications/active-development-applications/'], Caledon: ['Caledon development applications', 'https://www.caledon.ca/en/town-services/development-applications.aspx'] };
  function fsrInnerHTML(p) {
    if (!FSR.by) {
      if (hasDOM()) loadFsr().then(() => { if (liveKey === p.key) { const b = document.getElementById('devtab-fsr'); if (b) b.innerHTML = fsrInnerHTML(p); } });
      return '<span class="muted small">Looking for a servicing report…</span>';
    }
    const r = fsrFor(p), home = FSR_HOME[p.municipality];
    const ext = (u, t) => `<a href="${esc(u)}" target="_blank" rel="noopener">${t} ↗</a>`;
    if (r && r.best) { const b = r.best; return `<strong>Functional Servicing Report</strong> ${ext(b.fsr.url, esc(b.fsr.title.length > 90 ? b.fsr.title.slice(0, 88) + '…' : b.fsr.title))}<small>${b.fsr.date ? `Latest posted: ${esc(b.fsr.date)}` : 'Latest posted'}${b.fsr.count > 1 ? ` · ${b.fsr.count} versions` : ''} · ${ext(b.page, 'all documents')}</small>`; }
    const bp = r && r.items.find(i => i.browserPage);
    if (bp) return `<strong>Servicing documents</strong> ${ext(bp.page, 'City application page')}<small>Look under Project documents for the latest Functional Servicing Report (the City's page builds that list in the browser, so it can't be linked directly).</small>`;
    if (r && r.items.length) return `<span class="muted">No FSR posted yet</span> · ${ext(r.items[0].page, 'application documents')}`;
    if (p.municipality === 'Brampton') { const f = (p.records || []).filter(x => x.kind === 'application' && x.ref).sort((a, b) => (+new Date(b.date || 0)) - (+new Date(a.date || 0)))[0]; return `<strong>Servicing documents</strong> ${ext(home[1], 'BramPlanOnline')}<small>${f ? `Search ${esc(f.ref)}` : 'Search the file number'} and open its documents for the latest Functional Servicing Report. Public, no sign-in; the app can't link a Brampton file directly.</small>`; }
    return `<span class="muted">No public application page found</span>${home ? ` · ${ext(home[1], esc(home[0]))}` : ''}`;
  }
  const fsrBoxHTML = p => p.records.some(r => r.kind === 'application') ? `<div class="fsr-box small" id="devtab-fsr" data-info="fsr">${fsrInnerHTML(p)}</div>` : '';

  // ---- Source records with provenance (copied from js/app.js) -----------------------
  // No one's name, contact or note (js/privacy.js): those fields are never listed.
  const PRIVATE_FIELD = /owner|applicant|agent|contact|contractor|builder|architect|consult|engineer|planner|phone|email|fax|note|comment|remark|name/i;
  const privateField = k => (root.PeelPrivacy ? root.PeelPrivacy.privateKey(k) : PRIVATE_FIELD.test(k));
  function recordRows(r) {
    const props = r.props && Object.keys(r.props).length ? r.props : null;
    const rows = props
      ? Object.entries(props).filter(([k, v]) => v != null && v !== '' && !/^(shape|globalid)/i.test(k) && !privateField(k)).map(([k, v]) =>
          [k, typeof v === 'number' && v > 1e11 && v < 5e12 && /date|_dt|time/i.test(k) ? fmtDate(new Date(v)) : v])
      : [['File', r.ref], ['Address', r.address], ['Type', r.type], ['Status', r.statusRaw], ['Ward', r.ward],
         ['Units', r.units != null ? fmtNum(r.units) : ''], ['Floor area', r.gfa != null ? fmtNum(r.gfa) : ''],
         ...r.events.map(e => [P().humanizeField(e.label), fmtDate(e.date)])].filter(([, v]) => v !== '' && v != null);
    return rows.map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('');
  }
  function sourceUrlFor(r) {
    const st = state();
    if (!r || !r.sourceId || !st) return null;
    const rootId = String(r.sourceId).split('/')[0];
    const s = st.sources.find(x => x.id === rootId || String(x.id).split('/')[0] === rootId);
    return (s && s.url) || null;
  }
  function recordProvHTML(r) {
    const also = r.alsoIn && r.alsoIn.length ? ` (also in ${esc(r.alsoIn.join(', '))})` : '';
    const mapBtn = r.lat != null ? ` · <button type="button" class="btn small link" data-dt-rec="${esc(r.uid)}">${r.kind === 'permit' ? 'Show on map & parent application' : 'Show on map'}</button>` : '';
    const ri = root.PeelReportIssue;
    const pv = PV();
    if (!pv) return `<p class="small muted">Source: ${esc(r.sourceName)}${also}${mapBtn}${ri ? ` · ${ri.reportLinkHTML(r, { portal: r.sourceName })}` : ''}</p>`;
    const portal = pv.portalFor(r.sourceName);
    const url = pv.recordSourceUrl(r, sourceUrlFor(r), { format: 'html' });
    const st = state(), meta = st && st.snapshot && { generatedAt: st.snapshot.generatedAt };
    const pulled = pv.retrievedAt(r, meta);
    const report = ri ? ` · ${ri.reportLinkHTML(r, { sourceUrl: url, portal, pulledOn: pulled })}` : '';
    const look = pv.applicationSearch ? pv.applicationSearch(r) : null;
    return `<p class="small muted">Source: ${esc(portal)}${url ? ` · <a href="${esc(url)}" target="_blank" rel="noopener">Record ↗</a>` : ''}${pulled ? ` · pulled ${esc(pulled)}` : ''}${look ? ` · <a href="${esc(look.url)}" target="_blank" rel="noopener" title="Search ${esc(look.ref)} by file number">Find ${esc(look.ref)} on ${esc(look.portal)} ↗</a>` : ''}${also}${mapBtn}${report}</p>`;
  }
  const REC_GROUPS = [
    ['master', 'Official plan / zoning / subdivision'], ['siteplan', 'Site plan'], ['condo', 'Condominium'],
    ['precon', 'Pre-consultation'], ['other', 'Other applications'], ['permit-new', 'Building permits – new units'], ['permit', 'Building permits – other'],
  ];
  function recGroup(r) {
    if (r.kind === 'permit') return P().permitAddsUnits(r) && r.units > 0 ? 'permit-new' : 'permit';
    return r.stage || P().stageOf(r);
  }
  const RECORD_LIMIT = 40;
  // Pure: partition records into the ordered record groups (oldest first by date
  // received; undated last), with the 40-record display limit applied per group.
  function groupRecords(records, limit = RECORD_LIMIT) {
    const received = r => r.events.length ? Math.min(...r.events.map(e => +e.date)) : Infinity;
    const ordered = records.slice().sort((a, b) => received(a) - received(b));
    return REC_GROUPS.map(([key, label]) => {
      const list = ordered.filter(r => recGroup(r) === key);
      if (!list.length) return null;
      const dates = list.map(received).filter(isFinite);
      const span = dates.length ? ` · ${fmtDate(new Date(Math.min(...dates))).slice(0, 4)}${Math.max(...dates) - Math.min(...dates) > 365 * 864e5 ? `–${fmtDate(new Date(Math.max(...dates))).slice(0, 4)}` : ''}` : '';
      const units = key === 'permit-new' ? P().permitUnits(list) : 0;
      return { key, label, list, shown: list.slice(0, limit), more: Math.max(0, list.length - limit), span, units };
    }).filter(Boolean);
  }
  const recReceived = r => r.events.length ? Math.min(...r.events.map(e => +e.date)) : Infinity;
  const recHTML = r => `
      <details class="rec" data-rec-uid="${esc(r.uid)}" data-rec-ref="${esc(r.ref || '')}"><summary>${dot(r.phase)} ${isFinite(recReceived(r)) ? `<span class="rec-date">${fmtDate(new Date(recReceived(r)))}</span> ` : ''}<strong>${esc(r.kind === 'permit' ? 'Building permit' : 'Application')} ${esc(r.ref)}</strong>
        ${r.type ? ` · ${esc(r.type)}` : ''}${r.statusRaw ? ` · <em>${esc(r.statusRaw)}</em>` : ''}</summary>
        ${r.description ? `<p>${esc(r.description)}</p>` : ''}
        ${recordProvHTML(r)}
        <table>${recordRows(r)}</table>
      </details>`;

  // ---- Site: aerial check (rendering copied from js/app.js; check() is public) ----
  const aerialCache = new Map();
  function renderAerialInto(box, a) {
    const r = a.result, pctv = Math.round(r.probability * 100);
    const cls = r.probability >= 0.7 ? 'hi' : r.probability >= 0.35 ? 'mid' : 'lo';
    const label = y => a.src.years[y].label;
    const fig = (ph, y, note) => ph ? `<figure><div class="aerial-img"></div><figcaption><strong>${esc(label(y))}</strong> ${note}</figcaption></figure>` : '';
    const arrow = e => e > 0 ? '<span class="sig up" aria-label="raises">▲</span>' : e < 0 ? '<span class="sig down" aria-label="lowers">▼</span>' : '<span class="sig" aria-hidden="true">•</span>';
    box.innerHTML = `
      <div class="aerial-head ${cls}">
        <div class="aerial-pct"><strong>${pctv}%</strong><span>likely completed</span></div>
        <div class="aerial-status">${esc(r.status)}</div>
      </div>
      <div class="aerial-meter" role="img" aria-label="${pctv}% likely completed"><span style="width:${pctv}%"></span></div>
      <div class="aerial-pair">
        ${fig(a.before, a.years.before, a.years.preStart ? '· before the application' : '· earliest available')}
        ${fig(a.latest, a.years.latest, '· latest')}
      </div>
      <ul class="aerial-signals">${r.signals.map(s => `<li>${arrow(s.effect)}<span>${esc(s.text)}</span></li>`).join('')}</ul>
      <p class="small muted">${esc(a.src.owner)} aerial photos. Site: ${esc(a.geom.source)} (yellow outline). Estimate from how much the site changed compared with its surroundings and how much building structure it shows${a.fp.now != null ? ', plus building footprints traced from the photos' : ''}; not a site inspection.</p>`;
    const slots = box.querySelectorAll('.aerial-img');
    const canvases = [a.before && a.before.canvas, a.latest.canvas].filter(Boolean);
    canvases.forEach((c, i) => slots[i] && slots[i].appendChild(c));
  }
  // One aerial check per development, shared by the Site view and the header's aerial chip
  // (js/aerial-chip.js): the promise is kept, so the photos are fetched once.
  const aerialRuns = new Map();
  const aerialAvailable = p => { const cfg = CFG(); return !!(Aerial() && cfg && cfg.imagery && cfg.imagery[p.municipality] && p.lat != null); };
  function aerialRun(p) {
    if (!p || !aerialAvailable(p)) return null;
    if (!aerialRuns.has(p.key)) {
      const run = Aerial().check(p, CFG(), { phaseLabel: P().PHASE_BY_KEY[p.phase].label }).then(r => { aerialCache.set(p.key, r); return r; });
      run.catch(() => {});
      aerialRuns.set(p.key, run);
    }
    return aerialRuns.get(p.key);
  }
  function devAerial(p) {
    if (!hasDOM()) return;
    const box = byIdShown('devtab-aerial');
    if (!box) return;
    if (!aerialAvailable(p)) {
      box.innerHTML = '<p class="small muted">No aerial imagery is set up for this location.</p>';
      return;
    }
    const key = p.key;
    const show = r => { if (liveKey === key) { const b = byIdShown('devtab-aerial'); if (b) renderAerialInto(b, r); } };
    if (aerialCache.has(key)) { show(aerialCache.get(key)); return; }
    box.innerHTML = '<p class="small muted">Comparing aerial photos…</p>';
    aerialRun(p)
      .then(show)
      .catch(e => { if (liveKey === key) { const b = byIdShown('devtab-aerial'); if (b) b.innerHTML = `<p class="small muted">Aerial check unavailable: ${esc(e.message)}.</p>`; } });
  }

  // ---- Site: constraint checklist (js/constraint-data.js; never blank) ---------------
  async function fillConstraints(p) {
    if (!hasDOM() || !root.PeelCxData) return;
    let html;
    try { html = await root.PeelCxData.siteChecklistHTML(p); } catch (e) { html = '<p class="small muted">Constraint layers did not load: not checked.</p>'; }
    if (liveKey === p.key) { const b = document.getElementById('devtab-cx'); if (b) b.innerHTML = html; }
  }

  // ---- Site: ground elevation and the fall to the catchment outlet (js/site-context.js, from the
  // lidar terrain model through js/elevation.js; each value names its source).
  async function fillGround(p) {
    if (!hasDOM() || !root.PeelSiteContext || !root.PeelSiteContext.groundHTML) return;
    if (!byIdShown('devtab-ground')) return;
    const html = await root.PeelSiteContext.groundHTML(p);
    if (liveKey === p.key) { const b = byIdShown('devtab-ground'); if (b) b.innerHTML = html; }
  }

  // ---- Site: storm sewers (storm-only variant of app.js fillExisting) --------------
  const PEEL_FS = 'https://services6.arcgis.com/ONZht79c8QWuX759/arcgis/rest/services';
  const EXIST_STORM = [
    { url: 'https://services6.arcgis.com/hM5ymMLbxIyWTjn2/arcgis/rest/services/StormSegment/FeatureServer/0', f: 'DIAMETER,MATERIAL,INSTALLDAT', src: 'City of Mississauga' },
    { url: 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/2', f: 'HEIGHT,WIDTH,MATERIAL,SLOPE,SHAPE_PIPE,WATERSHED,SUBSHED', src: 'City of Brampton' },
    { url: `${PEEL_FS}/storm_infrastructure/FeatureServer/4`, f: 'Diameter,Material,MainType', src: 'Region of Peel' },
  ];
  const STORM_STYLE = { color: '--pipe-storm', label: 'Storm sewer' };
  // A reverse-geocode that hangs must not hold the list: 6 s, then no street name.
  const fetchT = (url, opts = {}, ms = 6000) => { const c = new AbortController(), t = setTimeout(() => c.abort(), ms); return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t)); };
  const geoQ = (url, lng, lat, r, outFields) => ARC().fetchJSON(`${url}/query`, { geometry: `${lng},${lat}`, geometryType: 'esriGeometryPoint', inSR: 4326, distance: r, units: 'esriSRUnit_Meter', spatialRel: 'esriSpatialRelIntersects', outFields, outSR: 4326, returnGeometry: true, resultRecordCount: 200, f: 'json' }, { timeout: 15000 });
  function dcDist(pt, g) {
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320;
    let best = Infinity;
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1][0] - pt[0]) * kx, ay = (g[i - 1][1] - pt[1]) * ky, bx = (g[i][0] - pt[0]) * kx, by = (g[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy, t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
      best = Math.min(best, Math.hypot(ax + t * dx, ay + t * dy));
    }
    return best;
  }
  function closestOn(pt, g) {
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 111320; let best = { m: Infinity, at: g[0] };
    for (let i = 1; i < g.length; i++) {
      const ax = (g[i - 1][0] - pt[0]) * kx, ay = (g[i - 1][1] - pt[1]) * ky, bx = (g[i][0] - pt[0]) * kx, by = (g[i][1] - pt[1]) * ky;
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy, t = L2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L2)) : 0, m = Math.hypot(ax + t * dx, ay + t * dy);
      if (m < best.m) best = { m, at: [pt[0] + (ax + t * dx) / kx, pt[1] + (ay + t * dy) / ky] };
    }
    return best;
  }
  function pipeAttrs(p) {
    const g = k => p[k] ?? p[k.toUpperCase()] ?? p[k.toLowerCase()];
    let d = g('Diameter') || g('DIAMETER') || 0;
    if (!d && (p.HEIGHT || p.WIDTH)) d = Math.max(p.HEIGHT || 0, p.WIDTH || 0);
    const yRaw = p.InstallationDate || p.INSTALLDAT;
    const year = yRaw && yRaw > -1e12 && yRaw < 4e12 ? new Date(yRaw).getUTCFullYear() : null;
    const slope = p.Slope || p.SLOPE;
    return { d: Math.round(d), mat: String(p.Material || p.MATERIAL || '').trim(), year, slope: slope > 0 && slope < 0.5 ? slope : (slope > 0.5 && slope < 50 ? slope / 100 : null), type: p.MainType || '', shed: [p.WATERSHED, p.SUBSHED].filter(x => x && String(x).trim()).join(' / ') };
  }
  const existText = a => `${STORM_STYLE.label}${a.d ? ` ${a.d} mm` : ''}${a.mat ? ` ${a.mat}` : ''}${a.year ? `, ${a.year}` : ''}${a.slope ? `, slope ${(a.slope * 100).toFixed(2)}%` : ''}${/FM/.test(a.type) ? ' (force main)' : ''}`;
  const streetCache = new Map();
  function streetAt(lat, lng) {
    const k = `${lat.toFixed(4)},${lng.toFixed(4)}`; if (streetCache.has(k)) return streetCache.get(k);
    const pr = (async () => {
      try {
        const j = await (await fetchT(`https://geocode.arcgis.com/arcgis/rest/services/World/GeocodeServer/reverseGeocode?f=json&location=${lng},${lat}&featureTypes=StreetAddress&outFields=Address,ShortLabel`)).json();
        const a = j && j.address, st = a && String(a.Address || a.ShortLabel || '').replace(/^[\d\s-]+[A-Za-z]?\s+(?=\D)/, '').trim();
        if (st) return st;
      } catch (e) { /* next */ }
      try {
        const j = await (await fetchT(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${lat}&lon=${lng}`, { headers: { 'Accept-Language': 'en' } })).json();
        if (j && j.address && j.address.road) return j.address.road;
      } catch (e) { /* offline */ }
      return '';
    })();
    streetCache.set(k, pr); return pr;
  }
  const aroundCache = new Map();
  function stormAround(lng, lat, r) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)},${r}`; if (aroundCache.has(key)) return aroundCache.get(key);
    const pr = (async () => {
      const items = [];
      for (const S of EXIST_STORM) {
        try {
          const j = await geoQ(S.url, lng, lat, r, S.f);
          for (const f of j.features || []) {
            const paths = (f.geometry && f.geometry.paths) || []; if (!paths.length) continue;
            const c = paths.map(pth => closestOn([lng, lat], pth)).sort((a, b) => a.m - b.m)[0];
            if (c.m <= r) items.push({ m: c.m, at: c.at, paths, a: { ...pipeAttrs(f.attributes || {}), src: S.src } });
          }
        } catch (e) { /* source unavailable */ }
      }
      items.sort((a, b) => a.m - b.m);
      const near = items.slice(0, 16);
      await Promise.all(near.map(async it => { it.street = await streetAt(it.at[1], it.at[0]); }));
      const groups = new Map();
      for (const it of near) {
        const g = `${it.street}|${it.a.d}|${it.a.mat}|${/FM/.test(it.a.type)}`;
        const x = groups.get(g); if (!x) groups.set(g, { ...it, n: 1, paths: [...it.paths] }); else { x.n++; x.paths.push(...it.paths); }
      }
      return { list: [...groups.values()].sort((a, b) => a.m - b.m), more: Math.max(0, items.length - near.length) };
    })();
    aroundCache.set(key, pr); pr.catch(() => aroundCache.delete(key));
    return pr;
  }
  let exR = 200, exGroups = {};
  try { const v = +localStorage.getItem('peel-dev:dt-exr'); if ([100, 200, 400].includes(v)) exR = v; } catch (e) { /* node */ }
  function renderStormMains(p, res) {
    const box = document.getElementById('devtab-exist-storm');
    if (!box) return;
    const L0 = res.list, SHOW = 4;
    const rBtns = `<div class="ex-r"><span class="muted small">Within</span> ${[100, 200, 400].map(x => `<button type="button" class="btn small${x === exR ? ' on' : ''}" data-dt-exr="${x}">${x} m</button>`).join('')}</div>`;
    const row = (g, i) => `<li><button type="button" class="btn small link" data-dt-exhl="storm|${i}" title="Show it on the map">${esc(existText(g.a).replace(STORM_STYLE.label, '').trim() || 'size not recorded')}</button>${g.street ? ` on <strong>${esc(g.street)}</strong>` : ''} · ${fmtNum(Math.round(g.m))} m <span class="muted">(${g.n > 1 ? `${g.n} pieces · ` : ''}${esc(g.a.src)})</span></li>`;
    box.innerHTML = `${rBtns}<div class="ex-kind"><div class="ex-k"><i class="lg-line" style="background:var(${STORM_STYLE.color})"></i><strong>Storm sewers</strong> <span class="muted small">${L0.length ? `${L0.length} within ${exR} m${res.more ? ` · ${res.more} more pieces farther out` : ''}` : `none within ${exR} m${p.municipality === 'Caledon' ? ' (Caledon storm sewers are not published)' : ''}`}</span></div>
      ${L0.length ? `<ul class="b-lines small">${L0.slice(0, SHOW).map(row).join('')}</ul>${L0.length > SHOW ? `<details class="ex-more"><summary class="small">${L0.length - SHOW} more</summary><ul class="b-lines small">${L0.slice(SHOW).map((g, i) => row(g, i + SHOW)).join('')}</ul></details>` : ''}` : ''}</div>
      <p class="small muted">Live from the municipal stormwater GIS, measured from the development's point (not the connection point). Tap a main to see it on the map.</p>`;
    exGroups = { storm: res };
  }
  function fillStormMains(p) {
    if (!hasDOM() || !ARC()) return;
    stormAround(p.lng, p.lat, exR).then(res => {
      if (liveKey !== p.key) return;
      renderStormMains(p, res);
      fillPonds(p, res);
      fillNetworks(p);
    }).catch(() => {
      if (liveKey !== p.key) return;
      const box = document.getElementById('devtab-exist-storm');
      if (box) box.innerHTML = '<p class="small muted ex-fail">Couldn\'t load the storm sewers from the municipal GIS · <button type="button" class="btn small link" data-dt-exr="' + exR + '">Retry</button></p>';
    });
  }

  // ---- Site: water and wastewater, existing and planned ----------------------------------------
  // Within a radius of the development's point (100 m – 1 km, as the storm sewers): the Region's
  // watermains and sanitary sewers of 300 mm+ (data/watermains.json, data/sewers.json, bundled), the
  // 2026 DC works and the Region's capital projects planned or under construction. Each main with its
  // street (the nearest Region address point, data/address-points.json) and, for water, its pressure
  // zone (the zone it runs in). A small map shows them all; a row highlights its main and back.
  const NET_RS = [100, 200, 400, 1000];
  let netR = 400;
  try { const v = +localStorage.getItem('peel-dev:dt-netr'); if (NET_RS.includes(v)) netR = v; } catch (e) { /* node */ }
  function segM(pt, a, b) {
    const kx = 111320 * Math.cos(pt[1] * Math.PI / 180), ky = 110540;
    const ax = (a[0] - pt[0]) * kx, ay = (a[1] - pt[1]) * ky, bx = (b[0] - pt[0]) * kx, by = (b[1] - pt[1]) * ky, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / L)) : 0;
    return { m: Math.hypot(ax + t * dx, ay + t * dy), at: [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])] };
  }
  function lineNear(pt, pts) {
    if (pts.length === 1) return segM(pt, pts[0], pts[0]);
    let best = null; for (let i = 1; i < pts.length; i++) { const c = segM(pt, pts[i - 1], pts[i]); if (!best || c.m < best.m) best = c; }
    return best;
  }
  const mTxt = m => (m < 10 ? 'at the site' : `${fmtNum(Math.round(m / 5) * 5)} m`);
  const titleSt = s => String(s || '').toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase()).replace(/\b(Dr|Rd|St|Ave|Blvd|Cres|Crt|Pkwy|Hwy|Sdrd|Trl|Ln|Pl|Cir|Ct|Gt|Terr)\b/g, w => w);
  // Street: the nearest address point within 150 m (a grid over the Region's address points).
  let addrGrid = null;
  function streetNear(at) {
    const D = state() && state().addressPoints;
    if (!D) { if (root.PeelAddr && root.PeelAddr.loadPoints) root.PeelAddr.loadPoints().then(() => { addrGrid = null; if (netP) fillNetworks(netP); }); return null; }
    if (!addrGrid) {
      addrGrid = new Map();
      for (const [k, v] of Object.entries(D.a || {})) {
        const [, , name, type, dir] = k.split('|'), g = `${Math.floor(v[2] / 0.002)},${Math.floor(v[1] / 0.002)}`;
        (addrGrid.get(g) || addrGrid.set(g, []).get(g)).push([v[2], v[1], [name, type, dir].filter(Boolean).join(' ')]);
      }
    }
    const cx = Math.floor(at[0] / 0.002), cy = Math.floor(at[1] / 0.002); let best = null, bd = 150;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const q of addrGrid.get(`${cx + dx},${cy + dy}`) || []) { const m = segM(at, [q[0], q[1]], [q[0], q[1]]).m; if (m < bd) { bd = m; best = q[2]; } }
    return best ? titleSt(best) : '';
  }
  // The street a main runs along: the street named on the Region's capital projects (data/capital.json,
  // every status: past works name the arterials) whose line it follows, within 25 m at most of its
  // sample points. House addresses alone pick a side street on arterials (homes back onto them).
  let capIdx = null;
  // (a road named in a 2026 DC work's title: "Con 750-mm Water Main - Mayfield Road (…)")
  const ROAD_WORD = '(Road|Rd|Drive|Dr|Street|St|Avenue|Ave|Parkway|Pkwy|Boulevard|Blvd|Line|Sideroad|Trail|Way|Highway|Hwy)';
  const ABBR = { Road: 'Rd', Drive: 'Dr', Street: 'St', Avenue: 'Ave', Parkway: 'Pkwy', Boulevard: 'Blvd', Highway: 'Hwy' };
  const shortRoad = t => String(t || '').replace(/\b(Road|Drive|Street|Avenue|Parkway|Boulevard|Highway)\b/g, w => ABBR[w]);
  const dcRoad = t => { const m = new RegExp(`-\\s*([A-Z][A-Za-z.' ]*?\\b${ROAD_WORD})\\b`).exec(String(t || '')); return m ? shortRoad(m[1].replace(/\b[A-Za-z]\b\s*/g, '').replace(/\s+/g, ' ').trim()) : ''; };
  const NOT_A_STREET = /\b(various|multiple|easement|several|region-?wide|n\/a)\b/i;
  function capStreet(pts) {
    const st = state(), recs = st && st.capital && st.capital.records; if (!pts.length) return '';
    if (!capIdx) {
      capIdx = new Map();
      const add = (l, name) => { for (let i = 1; i < l.length; i++) for (const q of [l[i - 1], l[i]]) { const g = `${Math.floor(q[0] / 0.002)},${Math.floor(q[1] / 0.002)}`; (capIdx.get(g) || capIdx.set(g, []).get(g)).push([l[i - 1], l[i], name]); } };
      for (const r of recs || []) {
        if (!r.street || !r.geometry) continue;
        const name = String(r.street).replace(/[-–].*$/, '').trim(); if (!name || NOT_A_STREET.test(name)) continue;
        for (const l of r.geometry.type === 'LineString' ? [r.geometry.coordinates] : r.geometry.type === 'MultiLineString' ? r.geometry.coordinates : []) add(l, name);
      }
      for (const sys of ['water', 'wastewater']) for (const ln of (st && st.dcInfra && st.dcInfra[sys] && st.dcInfra[sys].lines) || []) { const nm = dcRoad(ln.n); if (nm) add(ln.g, nm); }
    }
    // The share of the pipe's length that runs along each named road: points every ~20 m along it,
    // each counted for a road whose line is within 40 m and runs the same way (parallel within ~25°).
    // The road with the highest share names the pipe, if it covers 70% of its length or more.
    const kx = 111320 * Math.cos(pts[0][1] * Math.PI / 180), dir = (a, b) => { const x = (b[0] - a[0]) * kx, y = (b[1] - a[1]) * 110540, L = Math.hypot(x, y) || 1; return [x / L, y / L, L]; };
    const share = new Map(); let total = 0;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i], u = dir(a, b), k = Math.max(1, Math.round(u[2] / 20)), w = u[2] / k;
      for (let j = 0; j < k; j++) {
        const t = (j + 0.5) / k, q = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], names = new Set(), cx = Math.floor(q[0] / 0.002), cy = Math.floor(q[1] / 0.002);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (const [c, d, nm] of capIdx.get(`${cx + dx},${cy + dy}`) || []) {
          if (names.has(nm) || segM(q, c, d).m > 40) continue;
          const v = dir(c, d); if (Math.abs(u[0] * v[0] + u[1] * v[1]) < 0.9) continue;
          names.add(nm);
        }
        for (const nm of names) share.set(nm, (share.get(nm) || 0) + w);
        total += w;
      }
    }
    const best = [...share.entries()].sort((x, y) => y[1] - x[1])[0];
    return best && total > 0 && best[1] / total >= 0.7 ? shortRoad(titleSt(best[0])) : '';
  }
  // The stretch of a long line near a point (within m of it), for naming a planned work where it passes.
  function nearStretch(pts, at, m = 300) {
    const out = []; for (const q of pts) if (segM(at, q, q).m <= m) out.push(q);
    return out.length >= 2 ? out : pts;
  }
  // A large main (600 mm+) doesn't run down a crescent or court: a local street from the house
  // addresses is left unnamed rather than named wrong.
  const LOCAL_ST = /\b(Cres|Crt|Ct|Pl|Cir|Gate|Gt|Lane|Ln|Terr|Way|Mews|Path|Grove|Close|Gdns|Sq)\b/i;
  const bigOk = (name, d) => (name && d >= 600 && LOCAL_ST.test(name) ? '' : name || '');

  // The Region's watermains of 300 mm+ (data/watermains.json, as the water trace), as segments.
  const WMS = { segs: null, loading: null };
  function watermainSegs() {
    if (WMS.segs || WMS.loading || !hasDOM()) return WMS.segs;
    WMS.loading = fetch('data/watermains.json').then(r => (r.ok ? r.json() : null)).then(d => {
      if (!d) return;
      const xs = [], ys = []; for (let i = 0, x = 0, y = 0; i < d.xy.length; i += 2) { x += d.xy[i]; y += d.xy[i + 1]; xs.push(x / 1e5); ys.push(y / 1e5); }
      const segs = []; for (let i = 0; i < d.e.length; i += 3) { const a = d.e[i], b = a + d.e[i + 1]; segs.push([xs[a], ys[a], xs[b], ys[b], d.e[i + 2]]); }
      WMS.segs = segs; if (netP) fillNetworks(netP);
    }).catch(() => {});
    return null;
  }
  // Streets the address points can't give (no address within 150 m): the live reverse lookup the
  // storm sewers use, filled in when it answers.
  const liveStreet = new Map();
  function streetOf(at) {
    const s0 = streetNear(at); if (s0) return s0;
    const k = `${at[1].toFixed(4)},${at[0].toFixed(4)}`;
    if (liveStreet.has(k)) return liveStreet.get(k) || '';
    liveStreet.set(k, '');
    streetAt(at[1], at[0]).then(st => { if (st) { liveStreet.set(k, st); clearTimeout(streetRedraw); streetRedraw = setTimeout(() => netP && fillNetworks(netP), 300); } }).catch(() => {});
    return '';
  }
  let streetRedraw = null;
  // Everything within r: [{ id, sys, kind: existing|dc|cap, m, paths, html }], grouped into mains.
  let netP = null, netItems = [];
  // (DC titles come from the DC map PDFs, often clipped: "Con 750-mm Water Main - Mayfield Road (Mount M
  // Pleasant West) M" → "750-mm Water Main - Mayfield Road")
  // DC titles come from the DC map PDFs, clipped and run together ("Con 750-mm Water Main - Mayfield
  // Road (Mount M Pleasant West) M"): the kind of pipe from "<size>-mm <kind>", the road shown apart
  // ("along …"); otherwise the title without its clipped bits. The size is the 2026 DC map's label; the
  // title comes from the 2020 DC Background Study, and where its size differs (17 of 98 works, mostly
  // larger on the 2026 map: upsized since) it is shown beside it.
  const DC_PROPER = /[A-Z][\w-]*(?:\s+[A-Z][\w-]*)*?\s+(?:Sub-Transmission Main|Transmission Main|Sanitary Trunk Sewer|Trunk Sewer|Sanitary Trunk|Force Main)(?:\s+(?:Twinning|Extension))?/g;
  const dcName = t => {
    const s0 = String(t || ''), m = /(\d{3,4})-mm\s+((?:[A-Za-z-]+\s+){0,3}?(?:Main|Sewer|Forcemain))\b/i.exec(s0);
    if (m) return { name: m[2].replace(/\s+/g, ' ').replace(/^./, c => c.toUpperCase()), d: +m[1] };
    const proper = [...s0.replace(/\s*\(.*$/, '').matchAll(DC_PROPER)].map(x => x[0]).pop();
    return { name: (proper || s0.replace(/\s*\(.*$/, '').replace(/(\s+[A-Za-z]{1,3})+\s*$/, '')).replace(/^(?:(?:C|Cl|Co|Con|Cons|Const|Mc)\s+|Anticipat\w*\s+)+/, '').replace(/\s+/g, ' ').trim(), d: null };
  };
  const RENEWAL = /RELINING|TRENCHLESS|REHAB/i;
  function netItemsOf(p, r) {
    const pt = [p.lng, p.lat], st = state(), out = [], box = (x, y) => Math.abs(x - pt[0]) < 0.02 && Math.abs(y - pt[1]) < 0.015;
    const group = (sys, kind, key, it) => { const g = out.find(o => o.sys === sys && o.kind === kind && o.key === key); if (!g) out.push({ sys, kind, key, ...it, paths: [...it.paths] }); else { g.paths.push(...it.paths); if (it.m < g.m) { g.m = it.m; g.at = it.at; } } };
    // A street: 'along' when the pipe follows a named Region project or DC line, 'near' when it is
    // only the nearest house address (a guess).
    const named = (pts, d, at) => { const a = capStreet(pts); if (a) return [a, 'along']; const n = bigOk(streetNear(at), d); return n ? [n, 'near'] : ['', '']; };
    // Existing watermains (300 mm+).
    const segs = watermainSegs();
    for (const [x1, y1, x2, y2, d] of segs || []) {
      if (!box(x1, y1)) continue;
      const c = segM(pt, [x1, y1], [x2, y2]); if (c.m > r) continue;
      const [street, how] = named([[x1, y1], [x2, y2]], d, c.at);
      group('water', 'existing', `${d}|${street}`, { m: c.m, at: c.at, d, street, how, paths: [[[x1, y1], [x2, y2]]] });
    }
    // Existing sanitary sewers (300 mm+).
    const S = root.PeelMapMarkers && root.PeelMapMarkers.SEW;
    if (S && S.data) S.data.pipes.forEach(q => {
      const c0 = q[10]; if (!box(c0[0], c0[1])) return;
      const pts = []; for (let k = 0; k < c0.length; k += 2) pts.push([c0[k], c0[k + 1]]);
      const c = lineNear(pt, pts); if (!c || c.m > r) return;
      const [street, how] = named(pts, q[0], c.at);
      group('wastewater', 'existing', `${q[0]}|${q[7] || ''}|${street}`, { m: c.m, at: c.at, d: q[0], year: q[7], street, how, paths: [pts] });
    });
    // Planned: the 2026 DC works (one entry per project) and the Region's projects; a Region project
    // that builds a DC work joins its row.
    const DI = root.PeelDcInfra, CM = root.PeelCapitalEAModel;
    for (const sys of ['water', 'wastewater']) {
      for (const ln of (st && st.dcInfra && st.dcInfra[sys] && st.dcInfra[sys].lines) || []) {
        const c = lineNear(pt, ln.g); if (!c || c.m > r) continue;
        const kind = DI && DI.DC_KIND && DI.DC_KIND[ln.k] ? DI.DC_KIND[ln.k][0] : 'Planned main';
        const road = dcRoad(ln.n) || capStreet(nearStretch(ln.g, c.at)), dn = dcName(ln.n);
        group(sys, 'dc', ln.p || ln.c || `${ln.n}|${ln.y}`, { m: c.m, at: c.at, d: ln.d || dn.d, d2020: ln.d && dn.d && dn.d !== ln.d ? dn.d : null, name: dn.name || kind, year: ln.y, status: ln.s, ref: ln.p || ln.c || '', street: road, how: road ? 'along' : '', paths: [ln.g] });
      }
      for (const rec of (st && st.capital && st.capital.records) || []) {
        if (rec.system !== sys || !['planned', 'tendered', 'awarded', 'under construction'].includes(rec.status) || !rec.geometry) continue;
        const lines = rec.geometry.type === 'LineString' ? [rec.geometry.coordinates] : rec.geometry.type === 'MultiLineString' ? rec.geometry.coordinates : [];
        const c = lines.map(l => lineNear(pt, l)).filter(Boolean).sort((a, b) => a.m - b.m)[0]; if (!c || c.m > r) continue;
        const yr = (rec.startActual || rec.startTarget || '').slice(0, 4);
        const dc = rec.projectNumber && out.find(o => o.kind === 'dc' && o.sys === sys && o.ref === rec.projectNumber);
        if (dc) { if (!dc.cap) dc.cap = { status: rec.status, year: yr, started: !!rec.startActual }; continue; }
        group(sys, 'cap', rec.contract || rec.projectNumber || rec.id, { m: c.m, at: c.at, name: CM && CM.workLabel ? CM.workLabel(rec.workType) : rec.workType, renewal: RENEWAL.test(rec.workType || ''), status: rec.status, year: yr, started: !!rec.startActual, ref: rec.projectNumber || '', street: rec.street && !NOT_A_STREET.test(rec.street) ? shortRoad(titleSt(String(rec.street).replace(/[-–].*$/, ''))) : '', how: rec.street ? 'along' : '', paths: lines });
      }
    }
    out.sort((a, b) => a.m - b.m).forEach((o, k) => { o.id = k; });
    // (no address point near: the live lookup, for the nearest dozen mains only, a guess like an address)
    // (planned DC works often cross land with no road yet: named only from a named line, never guessed)
    out.filter(o => !o.street && o.kind !== 'dc').slice(0, 12).forEach(o => { o.street = bigOk(streetOf(o.at), o.d || 0); if (o.street) o.how = 'near'; });
    return out;
  }
  // Construction dates of a Region project: started (actual) or due to start (target).
  const capWhen = c => `${c.status}${c.year ? (c.started ? ` since ${c.year}` : `, construction from ${c.year}`) : ''}`;
  function netRowHTML(o) {
    const where = [o.street ? `${o.how === 'near' ? 'near' : 'along'} <strong>${esc(o.street)}</strong>` : '', mTxt(o.m)].filter(Boolean).join(' · ');
    let what;
    if (o.kind === 'existing') what = `${fmtNum(o.d)} mm${o.year ? `, ${o.year}` : ''}`;
    else if (o.kind === 'dc') what = `${esc(o.name)}${o.d ? ` · ${fmtNum(o.d)} mm${o.d2020 ? ` <small class="muted">(${fmtNum(o.d2020)} mm in the 2020 study)</small>` : ''}` : ''} · <b>${o.year ? `in service ${o.year}` : 'in-service year not set'}</b> <small class="muted">${esc(['2026 DC program' + (o.status ? ` (${o.status})` : ''), o.ref].filter(Boolean).join(' · '))}${o.cap ? ` · Region project ${esc(capWhen(o.cap))}` : ''}</small>`;
    else what = `${esc(o.name || 'Capital project')}${o.renewal ? ' <span class="net-renew">renewal</span>' : ''} · <b>${esc(capWhen(o))}</b> <small class="muted">Region project ${esc(o.ref)}</small>`;
    return `<li><button type="button" class="net-row" data-net-hl="${o.id}" aria-pressed="false"><i class="net-sw net-${o.sys === 'water' ? 'w' : 'ww'} net-${o.kind}"></i><span>${what} <span class="muted">${where}</span></span></button></li>`;
  }
  function netMapSVG(p, items, r) {
    const W = 340, H = 220, half = r * 1.25, kx = 111320 * Math.cos(p.lat * Math.PI / 180), ky = 110540, s = Math.min(W, H) / (2 * half);
    const X = (x, y) => [(W / 2 + (x - p.lng) * kx * s).toFixed(1), (H / 2 - (y - p.lat) * ky * s).toFixed(1)];
    const d = pts => pts.map((q, i) => `${i ? 'L' : 'M'}${X(q[0], q[1]).join(',')}`).join('');
    const storm = (exGroups.storm && exGroups.storm.list) || [];
    const lines = [
      ...storm.flatMap(g => g.paths.map(pth => `<path d="${d(pth)}" class="net-l-storm"/>`)),
      ...items.map(o => `<g class="net-g net-${o.sys === 'water' ? 'w' : 'ww'} net-${o.kind}" data-net-hl="${o.id}">${o.paths.map(pth => `<path d="${d(pth)}"/>`).join('')}</g>`),
    ];
    const rr = (r * kx * s / kx * 1).toFixed(1), bar = r >= 1000 ? 500 : r >= 400 ? 200 : 50;
    const WP = root.PeelWsPages, deg = half * 1.5 / 111320, tiles = WP && WP.tilesSVG ? WP.tilesSVG((x, y) => X(x, y).map(Number), [p.lng - deg / Math.cos(p.lat * Math.PI / 180), p.lat - deg, p.lng + deg / Math.cos(p.lat * Math.PI / 180), p.lat + deg], W, H) : '';
    return `<svg class="net-map" viewBox="0 0 ${W} ${H}" role="img" aria-label="Water and wastewater within ${r} m of the site">${tiles}<circle cx="${W / 2}" cy="${H / 2}" r="${(r * s).toFixed(1)}" class="net-ring"/>${lines.join('')}<circle cx="${W / 2}" cy="${H / 2}" r="5" class="net-site"/><g class="net-bar"><rect x="8" y="${H - 12}" width="${(bar * s).toFixed(1)}" height="3"/><text x="8" y="${H - 16}">${bar} m</text></g></svg>`;
  }
  function netBlockHTML(p) {
    const items = netItemsOf(p, netR); netItems = items;
    const loading = !WMS.segs || !(root.PeelMapMarkers && root.PeelMapMarkers.SEW && root.PeelMapMarkers.SEW.data);
    const rBtns = `<div class="ex-r"><span class="muted small">Within</span> ${NET_RS.map(x => `<button type="button" class="btn small${x === netR ? ' on' : ''}" data-dt-netr="${x}">${x >= 1000 ? `${x / 1000} km` : `${x} m`}</button>`).join('')}</div>`;
    const part = (sys, label) => {
      const ex = items.filter(o => o.sys === sys && o.kind === 'existing'), pl = items.filter(o => o.sys === sys && o.kind !== 'existing');
      const list = (xs, none) => (xs.length ? `<ul class="net-list">${xs.slice(0, 6).map(netRowHTML).join('')}</ul>${xs.length > 6 ? `<details class="ex-more"><summary class="small">${xs.length - 6} more</summary><ul class="net-list">${xs.slice(6).map(netRowHTML).join('')}</ul></details>` : ''}` : `<p class="small muted">${none}</p>`);
      return `<div class="net-sys"><h5>${label}</h5><div class="net-sub">Existing</div>${list(ex, loading ? 'Loading…' : `No Region main of 300 mm+ within ${netR >= 1000 ? '1 km' : `${netR} m`} (smaller local mains aren\u2019t listed)`)}<div class="net-sub">Planned</div>${list(pl, `Nothing in the 2026 DC program or the Region’s projects within ${netR >= 1000 ? '1 km' : `${netR} m`}`)}</div>`;
    };
    return `${rBtns}<div class="net-wrap"><div class="net-mapbox">${netMapSVG(p, items, netR)}<p class="small muted net-key"><i class="net-sw net-w net-existing"></i> watermain <i class="net-sw net-ww net-existing"></i> sanitary sewer <i class="net-sw net-storm"></i> storm sewer · solid existing, <i class="net-sw net-w net-dc"></i> dashed 2026 DC, <i class="net-sw net-w net-cap"></i> dotted Region project</p></div>
      <div class="net-lists">${part('water', '💧 Water')}${part('wastewater', '🚰 Wastewater')}</div></div>
      <p class="small muted">Region mains of 300 mm+ only (smaller local mains are on the full map from street zoom), measured from the development\u2019s point, not its connection point. <b>Along</b> a street: the pipe follows a Region project or DC work named with it; <b>near</b>: only the nearest house address, a guess. In-service years are the 2026 DC program\u2019s; construction dates are the Region\u2019s project schedule. Tap a row to highlight it on the small map.</p>`;
  }
  function fillNetworks(p) {
    if (!hasDOM() || p.lat == null || liveKey !== p.key) return;
    netP = p;
    const el = document.getElementById('devtab-net'); if (el) el.innerHTML = netBlockHTML(p);
  }
  function netHighlight(id) {
    const box = hasDOM() && document.getElementById('devtab-net'); if (!box) return;
    const on = String(id);
    box.classList.toggle('net-has-hl', true);
    box.querySelectorAll('[data-net-hl]').forEach(el => { const hit = el.dataset.netHl === on; el.classList.toggle('hl', hit); if (el.tagName === 'BUTTON') el.setAttribute('aria-pressed', hit); });
  }

  // ---- Site: stormwater ponds (copied from js/app.js) --------------------------------
  const PONDS = [
    { url: 'https://maps1.brampton.ca/arcgis/rest/services/Stormwater/Stormwater_Asset_PRD/MapServer/3', f: 'NAME,POND_ID,CATEGORY,FEATURE_TYPE,WATERSHED,SUBSHED,QUAL_DESIGN,EROSN_DESIGN,FLOOD_DESIGN,RISK_GRADE', src: 'City of Brampton' },
    { url: 'https://services3.arcgis.com/AbUjpCl3KckkXVBh/arcgis/rest/services/GISProd_GISDBO_StormWaterMngPonds/FeatureServer/19', f: 'POND,TYPE_OF_FA,ASSUMED_OR,COMMUNITY,SWM_REPORT', src: 'Town of Caledon' },
  ];
  const POND_R = 1000;
  const inRing = (x, y, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) if ((r[i][1] > y) !== (r[j][1] > y) && x < (r[j][0] - r[i][0]) * (y - r[i][1]) / (r[j][1] - r[i][1]) + r[i][0]) c = !c; return c; };
  function pondAttrs(a, src) {
    const yes = v => v != null && String(v).trim() && !/^(no|n|none|0|null)$/i.test(String(v).trim());
    const ctl = [['QUAL_DESIGN', 'quality'], ['EROSN_DESIGN', 'erosion'], ['FLOOD_DESIGN', 'quantity / flood']].filter(([k]) => yes(a[k])).map(([k, l]) => `${l}${/^(y|yes)$/i.test(String(a[k]).trim()) ? '' : ` (${String(a[k]).trim()})`}`);
    return { name: String(a.NAME || a.POND || a.POND_ID || '').trim(), type: String(a.FEATURE_TYPE || a.CATEGORY || a.TYPE_OF_FA || '').trim(), ctl, hasCtl: 'QUAL_DESIGN' in a, shed: [a.WATERSHED, a.SUBSHED].filter(x => x && String(x).trim()).join(' / '), risk: String(a.RISK_GRADE || '').trim(), assumed: String(a.ASSUMED_OR || '').trim(), report: String(a.SWM_REPORT || '').trim(), src };
  }
  const pondCache = new Map();
  function nearestPond(lng, lat) {
    const key = `${lng.toFixed(5)},${lat.toFixed(5)}`;
    if (pondCache.has(key)) return pondCache.get(key);
    const pr = Promise.all(PONDS.map(S => geoQ(S.url, lng, lat, POND_R, S.f).then(j => (j.features || []).map(f => {
      const rings = (f.geometry && f.geometry.rings) || [];
      const m = rings.some(r => inRing(lng, lat, r)) ? 0 : Math.min(...rings.map(r => dcDist([lng, lat], r)));
      return { m, a: pondAttrs(f.attributes || {}, S.src) };
    })).catch(() => null))).then(rs => {
      const all = rs.filter(Boolean).flat().filter(x => isFinite(x.m)).sort((a, b) => a.m - b.m);
      return { ponds: all, failed: rs.every(r => r == null) };
    });
    pondCache.set(key, pr);
    return pr;
  }
  function fillPonds(p, stormRes) {
    if (!hasDOM() || !ARC()) return;
    const box = document.getElementById('devtab-storm');
    if (!box) return;
    if (p.municipality === 'Mississauga') { box.innerHTML = '<p class="small muted">Mississauga does not publish its stormwater ponds; see the nearest storm sewer above.</p>'; return; }
    nearestPond(p.lng, p.lat).then(({ ponds, failed }) => {
      if (liveKey !== p.key) return;
      const b = document.getElementById('devtab-storm');
      if (!b) return;
      const L0 = [];
      if (failed) L0.push('<li class="muted">The pond layers did not respond</li>');
      else if (!ponds.length) L0.push(`<li class="muted"><strong>Ponds:</strong> none within ${fmtNum(POND_R / 1000)} km</li>`);
      else {
        const o = ponds[0].a;
        L0.push(`<li><strong>Nearest pond:</strong> ${esc(o.name || 'unnamed')}${o.type ? ` <span class="muted">(${esc(o.type.toLowerCase())})</span>` : ''}, ${ponds[0].m ? `${fmtNum(Math.round(ponds[0].m))} m` : 'on the site'} <span class="muted">(${esc(o.src)})</span></li>`);
        if (o.hasCtl) L0.push(`<li>Design controls: ${o.ctl.length ? esc(o.ctl.join(', ')) : '<span class="muted">none recorded</span>'}${o.risk ? ` · risk grade ${esc(o.risk)}` : ''}</li>`);
        if (o.assumed) L0.push(`<li class="muted">Status: ${esc(o.assumed)}${o.report ? ` · SWM report ${esc(o.report)}` : ''}</li>`);
        if (ponds.length > 1) L0.push(`<li class="muted">${ponds.length - 1} more within ${fmtNum(POND_R / 1000)} km</li>`);
      }
      const shed = (ponds && ponds.find(x => x.a.shed) || {}).a?.shed || (stormRes && (stormRes.list.find(g => g.a.shed) || {}).a?.shed);
      if (shed) L0.push(`<li><strong>Watershed / subwatershed:</strong> ${esc(shed)}</li>`);
      b.innerHTML = `<ul class="b-lines small">${L0.join('')}</ul><p class="small muted">Live from the municipal stormwater layers. Whether the pond was sized for this site is in its SWM report, not the GIS.</p>`;
    });
  }

  // ---- The three sub-views ----------------------------------------------------------
  const brow = (k, body) => `<div class="b-row"><div class="b-k">${k}</div><div class="b-v">${body}</div></div>`;
  // "This application on its own" legend for a drilled-down sub-project.
  function subHeadHTML(p) {
    const parts = ['this application', ...(p.records.some(isPrecon) ? ['its pre-consultation'] : []), ...(p.records.some(r => r.kind === 'permit') ? ['the permits inside its land'] : [])];
    const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    return `<div class="sub-head small"><span class="sub-key"><i class="sk-app"></i>this application <i class="sk-dev"></i>whole development</span><strong>${esc(p.subRef)}</strong> on its own: ${list}. Counted in the whole development, not added again.</div>`;
  }
  function drillBackHTML(p) {
    if (p.parent) return `<button type="button" class="btn small link back-sel" data-dt-back="1">← Whole development: ${esc(p.parent.title)} (${fmtNum(p.parent.records.filter(r => r.kind === 'application').length)} files)</button>`;
    if (p._dtBack) return `<button type="button" class="btn small link back-sel" data-dt-back="1">← ${esc(p._dtBack.title)}</button>`;
    return '';
  }
  // About: proposal, a concise status line (phase badge + latest activity +
  // stalled note), the latest council/committee decision, and the FSR link.
  // The status in full, with the files and events, is in Files & history.
  function aboutHTML(p) {
    const st = statusOf(p);
    return `${drillBackHTML(p)}${p.parent ? subHeadHTML(p) : ''}
    <section class="brief" data-info="dev-brief">
      ${brow('Status', `<p class="small">${dot(p.phase)} <strong>${esc(P().PHASE_BY_KEY[p.phase].label)}</strong>${p.last ? ` · latest activity ${fmtDate(new Date(p.last))}` : ''}</p>
        ${st.stalled ? `<p class="small why-stall"><strong>Stalled:</strong> no file event, permit or council item since ${fmtDate(new Date(st.lastAt))} (${st.years.toFixed(1)} years), ${st.cause}.</p>` : ''}`)}
      ${brow('Latest decision', latestDecisionHTML(p, st))}
      ${p.records.some(r => r.kind === 'application') ? brow('Servicing report', fsrBoxHTML(p)) : ''}
      ${p.description ? brow('Proposal', `<p class="desc-clamp small">${esc(p.description)}</p>`) : ''}
    </section>`;
  }
  // Files & history: the files, events and proposal in one section (the status, the Gantt chart
  // with each file's events and source record, the dated events), then the applications to open
  // on their own, related applications and how the phase was set.
  function filesViewHTML(p) {
    const st = statusOf(p);
    return `${drillBackHTML(p)}${p.parent ? subHeadHTML(p) : ''}
      ${devHistoryHTML(p, st)}
      ${filesHTML(p)}
      ${phaseBasisHTML(p)}`;
  }
  // Site: the constraint checklist (screening) first, then aerial check, ground elevation, storm
  // sewers, stormwater ponds. (Ground/storm/ponds moved here from the old Wastewater tab.)
  function siteViewHTML(p) {
    const has = p.lat != null;
    return `${drillBackHTML(p)}
    <details class="sect" id="devtab-cx-sect" open><summary><h2 class="section-title" data-info="site-constraints">Constraints</h2><span class="muted small sect-sum">screening · mapped layers</span></summary>
      <div id="devtab-cx">${has ? '<p class="small muted">Checking the mapped constraint layers…</p>' : '<p class="small muted">Not checked: this development has no map location.</p>'}</div></details>
    <details class="sect" id="devtab-site" open><summary><h2 class="section-title" data-info="site-check">Site</h2><span class="muted small sect-sum">aerial · ground · stormwater</span></summary>
      <div class="brief">
        ${brow('Aerial check', '<div class="aerial" id="devtab-aerial"><p class="small muted">Comparing aerial photos…</p></div>')}
        ${has ? brow('Ground', '<div id="devtab-ground" data-info="ground"><p class="small muted">Looking up ground elevation…</p></div>') : ''}
        ${has ? brow('Storm sewers', '<div id="devtab-exist-storm"><p class="small muted">Looking up the nearest storm sewers…</p></div>') : ''}
        ${has ? brow('Stormwater', '<div id="devtab-storm" data-info="fire-storm"><p class="small muted">Looking up stormwater ponds…</p></div>') : ''}
      </div></details>`;
  }

  // ---- Render -----------------------------------------------------------------------
  function captureOpen(body) {
    const open = new Map([...body.querySelectorAll('details[id]')].map(d => [d.id, d.open]));
    const tl = (body.querySelector('[data-dt-tl].on') || {}).dataset?.dtTl;
    return { open, tl };
  }
  function restoreOpen(body, keep) {
    for (const [id, was] of keep.open) { const d = document.getElementById(id); if (d) d.open = was; }
    if (keep.tl) {
      body.querySelectorAll('[data-dt-tl]').forEach(x => x.classList.toggle('on', x.dataset.dtTl === keep.tl));
      body.querySelectorAll('[data-dt-tlv]').forEach(x => { x.hidden = x.dataset.dtTlv !== keep.tl; });
    }
  }
  function render(sub) {
    if (!hasDOM()) return;
    const body = document.getElementById('pane-dev-body');
    if (!body) return;
    if (sub && DEVSUBS.includes(sub)) writeSub(sub);
    syncSubtabs();
    const p = scopeProject();
    if (!p || !P()) { liveKey = null; body.innerHTML = '<p class="small muted">Select a development to see its details.</p>'; return; }
    liveKey = p.key;
    const s = currentSub();
    body.innerHTML = s === 'about' ? aboutHTML(p) : s === 'files' ? filesViewHTML(p) : siteViewHTML(p);
    if (s === 'about' || s === 'files') ensureCouncil(p);
    if (s === 'site' && p.lat != null) { fillNetworks(p); fillConstraints(p); devAerial(p); fillGround(p); fillStormMains(p); }
  }
  // Re-render after async data (council, FSR) arrives, keeping open sections.
  function rerenderPreserve() {
    if (!hasDOM()) return;
    const body = document.getElementById('pane-dev-body');
    if (!body) return;
    const keep = captureOpen(body);
    render();
    restoreOpen(body, keep);
  }
  function setSub(sub) {
    if (!DEVSUBS.includes(sub)) return;
    writeSub(sub);
    syncSubtabs();
    render();
    if (hasDOM()) { const body = document.getElementById('pane-dev-body'); if (body) body.scrollTop = 0; }
  }

  // ---- Map helpers for the delegated actions -----------------------------------------
  let dtExHL = null, dtRecHL = null, mapClickWired = false;
  function exHLLayer() {
    const map = app() && app().map;
    if (!map) return null;
    if (!dtExHL) { dtExHL = root.L.layerGroup().addTo(map); }
    return dtExHL;
  }
  function showOnMap(r) {
    const map = app() && app().map;
    if (!map || r.lat == null || !root.L) return;
    if (!dtRecHL) {
      dtRecHL = root.L.layerGroup().addTo(map);
      if (!mapClickWired) { mapClickWired = true; map.on('click', () => { if (dtRecHL) dtRecHL.clearLayers(); if (dtExHL) dtExHL.clearLayers(); }); }
    }
    dtRecHL.clearLayers();
    root.L.circleMarker([r.lat, r.lng], { radius: 9, color: cssVar('--hl-find') || cssVar('--select'), weight: 3, fillOpacity: 0.15 }).addTo(dtRecHL);
    map.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 16), { duration: 0.55 });
  }
  function highlightStormMain(i) {
    const map = app() && app().map;
    const g = exGroups.storm && exGroups.storm.list[+i];
    const layer = exHLLayer();
    if (!map || !g || !layer || !root.L) return;
    layer.clearLayers();
    const ll = g.paths.map(pth => pth.map(([x, y]) => [y, x]));
    const hl = cssVar('--hl-find') || cssVar('--select'), line = cssVar('--pipe-storm') || cssVar('--text-primary');
    root.L.polyline(ll, { color: hl, weight: 12, opacity: 0.7, interactive: false }).addTo(layer);
    root.L.polyline(ll, { color: line, weight: 4, opacity: 1, interactive: false }).addTo(layer);
    map.fitBounds(root.L.latLngBounds(ll.flat()), { maxZoom: 18, padding: [40, 40] });
  }

  // A development's section (History, Source records…), from anywhere: on a page the full map comes
  // first; then Records › Files, the full table, the section open and in view.
  function openSection(id) {
    const W = root.PeelWorkspaces, AT = root.PeelAnalysisTabs, PN = root.PeelPanel;
    if (hasDOM() && document.documentElement.classList.contains('home-on') && W && W.setMode) W.setMode('full');
    if (AT && AT.openTab) AT.openTab('records', 'files');
    setTimeout(() => {
      if (PN && PN.openFull) PN.openFull();
      if (currentSub() !== 'files') setSub('files');
      // (the old Source records section is the story's Gantt rows now)
      const d = byIdShown(id === 'devtab-recs' ? 'devtab-hist' : id); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); }
    }, 250);
  }

  // History's views (Key events · All dated events · By file) and its type filter, per History.
  function histView(box, v) {
    if (!box) return;
    box.querySelectorAll('[data-dt-tl]').forEach(x => x.classList.toggle('on', x.dataset.dtTl === v));
    box.querySelectorAll('[data-dt-tlv]').forEach(x => { x.hidden = x.dataset.dtTlv !== v; });
  }
  function histOnly(box, k) {
    if (!box) return;
    const on = k && box.dataset.only !== k ? k : '';
    if (on) box.dataset.only = on; else delete box.dataset.only;
    if (on && box.querySelector('[data-dt-tl="file"].on')) histView(box, 'all');
    const line = box.querySelector('.tl-only'), name = box.querySelector('[data-tl-only-name]');
    if (line) line.hidden = !on;
    if (name) name.textContent = { council: 'council', file: 'file', permit: 'permit', phase: 'stage' }[on] || '';
  }
  // The History shown beside the element (the same panel or page), else the development's Overview.
  function historyNear(el) {
    const host = (el && el.closest('#home, #analysis')) || document;
    const vis = x => x && x.getClientRects().length;
    const all = [...host.querySelectorAll('.dev-hist')];
    return all.find(vis) || all[0] || null;
  }
  function revealHistory(el, then) {
    let h = historyNear(el);
    const show = x => { for (let d = x; d; d = d.parentElement && d.parentElement.closest('details')) d.open = true; then(x); };
    if (h) return show(h);
    // (no History here: the development's Overview has it, in a fold)
    const AT = root.PeelAnalysisTabs;
    if (AT && AT.openTab) AT.openTab('overview', '');
    setTimeout(() => { h = historyNear(document.getElementById('analysis')); if (h) show(h); }, 300);
  }
  function flash(x) { x.classList.add('rec-flash'); setTimeout(() => x.classList.remove('rec-flash'), 1600); }
  /** A file number: its source record, open in History's By file view. */
  function openFile(ref, el) {
    // (a file of another development, from Growth in an area: that development first, on its page)
    const key = el && el.dataset && el.dataset.devKey, N = root.PeelDevNav, cur = root.DevScope && root.DevScope.current();
    if (key && N && (!cur || cur.key !== key)) {
      const q = N.projectByKey(key); if (!q) return;
      N.showDetail(q);
      const W = root.PeelWorkspaces; if (hasDOM() && document.documentElement.classList.contains('home-on') && W && W.openPage) W.openPage('site');
      setTimeout(() => openFile(ref, null), 700); return;
    }
    revealHistory(el, h => {
      // (its row in the Gantt chart, else the record inside a permit group or an event)
      const r = [...h.querySelectorAll('.gantt [data-rec-ref]')].find(x => x.dataset.recRef === ref) || [...h.querySelectorAll('[data-rec-ref]')].find(x => x.dataset.recRef === ref);
      if (!r) { h.scrollIntoView({ block: 'start' }); return; }
      for (let d = r; d; d = d.parentElement && d.parentElement.closest('details')) d.open = true;
      r.scrollIntoView({ block: 'center' }); flash(r);
    });
  }
  /** History, at a view or a type: "" / "key", "all", "file", or a type ("council", "permit"). */
  function openHistory(el, which) {
    revealHistory(el, h => {
      // Council: its row in the Gantt chart, open. A type or a view: the dated events, unfolded.
      const c = which === 'council' && h.querySelector('[data-gt-council]');
      if (c) { c.open = true; c.scrollIntoView({ block: 'start' }); flash(c); return; }
      const ev = h.querySelector('.gt-events');
      if (['council', 'permit', 'file-ev', 'phase', 'all'].includes(which)) { if (ev) ev.open = true; histView(h, 'all'); histOnly(h, which === 'file-ev' ? 'file' : which === 'all' ? '' : which); }
      else { histOnly(h, ''); histView(h, 'key'); }
      (ev && ev.open ? ev : h).scrollIntoView({ block: 'start' }); flash(h);
    });
  }

  // ---- Delegated clicks ----------------------------------------------------------------
  // All interactive attributes use a data-dt-* prefix so the document-level
  // handlers in js/app.js never see them (and vice versa).
  function onClick(e) {
    if (!e.target || !e.target.closest) return;
    const ds = e.target.closest('[data-devsub]');
    if (ds) { setSub(ds.dataset.devsub); return; }
    const body = document.getElementById('pane-dev-body');
    // A file number anywhere opens its source record in History; "history" links open History.
    const df = e.target.closest('[data-dev-file]');
    if (df) { e.preventDefault(); e.stopPropagation(); openFile(df.dataset.devFile, df); return; }
    const dh = e.target.closest('[data-dev-hist]');
    if (dh) { e.preventDefault(); e.stopPropagation(); openHistory(dh, dh.dataset.devHist); return; }
    // A link to a section from outside the development's views (the Overview's About fold, a page):
    // Records › Files, in the full table, at that section.
    const out = e.target.closest('[data-dt-open]');
    if (out && !(body && body.contains(out))) { openSection(out.dataset.dtOpen); return; }
    // (the rest work wherever the development's views are shown: the full table, the panel's folds, a page)
    const p = scopeProject();
    const tl = e.target.closest('[data-dt-tl]');
    if (tl) { histView(tl.closest('.dev-hist') || body, tl.dataset.dtTl); return; }
    const ty = e.target.closest('[data-tl-type]');
    if (ty) { e.stopPropagation(); histOnly(ty.closest('.dev-hist'), ty.dataset.tlType); return; }
    if (!(body && body.contains(e.target)) && !e.target.closest('.dev-hist, .pnl-fold, .home-main')) return;
    const o = e.target.closest('[data-dt-open]');
    if (o) {
      const id = o.dataset.dtOpen;
      if (id === 'devtab-hist' && currentSub() !== 'files') setSub('files');
      const d = document.getElementById(id);
      if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); }
      return;
    }
    if (p) {
      const sb = e.target.closest('[data-dt-sub]');
      if (sb) { const sub = subProject(p.parent || p, sb.dataset.dtSub); if (sub) navigate(sub, p.parent || p); return; }
      const rq = e.target.closest('[data-dt-relq]');
      if (rq) { const q = projectByKey(rq.dataset.dtRelq); if (q) navigate(q, p); return; }
      const rc = e.target.closest('[data-dt-rec]');
      if (rc) { const r = p.records.find(x => x.uid === rc.dataset.dtRec); if (r) showOnMap(r); return; }
      const nr = e.target.closest('[data-dt-netr]');
      if (nr) { netR = +nr.dataset.dtNetr; try { localStorage.setItem('peel-dev:dt-netr', String(netR)); } catch (err) { /* private mode */ } fillNetworks(p); return; }
      const xr = e.target.closest('[data-dt-exr]');
      if (xr) {
        exR = +xr.dataset.dtExr;
        try { localStorage.setItem('peel-dev:dt-exr', String(exR)); } catch (err) { /* private mode */ }
        const box = document.getElementById('devtab-exist-storm');
        if (box) box.innerHTML = '<p class="small muted">Looking up the nearest storm sewers…</p>';
        fillStormMains(p);
        return;
      }
    }
    const nh = e.target.closest('[data-net-hl]');
    if (nh) { netHighlight(nh.dataset.netHl); return; }
    const xh = e.target.closest('[data-dt-exhl]');
    if (xh) { highlightStormMain(xh.dataset.dtExhl.split('|')[1]); return; }
    const bb = e.target.closest('[data-dt-back]');
    if (bb) {
      const back = drill && (drill.parent || drill._dtBack);
      drill = null;
      if (back) navigate(back); else render();
      const bd = document.getElementById('pane-dev-body'); if (bd) bd.scrollTop = 0;
    }
  }
  if (hasDOM() && typeof document.addEventListener === 'function') document.addEventListener('click', onClick);

  // ---- Stage 3: the development's pieces in the standard panels -------------------------------
  // About (proposal, status, latest decision, servicing report) folds into the Overview panel; the
  // site checks there are the constraint checklist and the storm sewers and ponds; the aerial check
  // and ground elevation sit in Servicing at the site. Same containers and fillers as the Site view.
  function partHTML(p, part) {
    const has = p.lat != null, row = (t, id, msg, info) => brow(t, `<div id="${id}"${info ? ` data-info="${info}"` : ''}><p class="small muted">${msg}</p></div>`);
    if (part === 'about') return aboutHTML(p).replace(drillBackHTML(p), '');
    if (part === 'site') return `<div class="brief">${has ? row('Water and wastewater', 'devtab-net', 'Looking up the watermains and sewers…') + row('Constraints', 'devtab-cx', 'Checking the mapped constraint layers…') + row('Storm sewers', 'devtab-exist-storm', 'Looking up the nearest storm sewers…') + row('Stormwater', 'devtab-storm', 'Looking up stormwater ponds…', 'fire-storm') : '<p class="small muted">Not checked: this development has no map location.</p>'}</div>`;
    if (part === 'ground') return `<div class="brief">${brow('Aerial check', '<div class="aerial" id="devtab-aerial"><p class="small muted">Comparing aerial photos…</p></div>')}${has ? row('Ground', 'devtab-ground', 'Looking up ground elevation…', 'ground') : ''}</div>`;
    if (part === 'files') return filesTreeHTML(p);
    // (Files, History and About are one section now: the story, with the Gantt chart at its heart)
    if (part === 'story' || part === 'history' || part === 'gantt') return storyHTML(p, statusOf(p));
    // (How the stage was set, without its section wrapper: the stage chip opens it under the header)
    if (part === 'stage') return phaseBasisHTML(p).replace(/^\s*<details[^>]*>\s*<summary>[^]*?<\/summary>/, '').replace(/<\/details>\s*$/, '');
    return '';
  }
  // The files as a tree (js/file-tree.js), each file number opening its record in History; the
  // newest files under it. Where the development has no tree entry, the files newest first.
  function filesTreeHTML(p) {
    const FT = root.PeelFileTree, d = FT && !p.parent ? FT.of(p) : null, files = p.records.filter(r => r.kind === 'application');
    const newest = files.slice().sort((a, b) => (+new Date(b.date || 0)) - (+new Date(a.date || 0)));
    const row = r => `<li class="pnl-kv"><span><button type="button" class="tr-ref" data-dev-file="${esc(r.ref || '')}">${esc(r.ref || 'file')}</button>${r.type ? ` <small class="muted">${esc(r.type)}</small>` : ''}</span><span>${r.units ? `${fmtNum(r.units)} unit${r.units === 1 ? '' : 's'} · ` : ''}${esc((P().PHASE_BY_KEY[r.phase] || {}).label || r.phase || '')}</span></li>`;
    const tree = d ? FT.treeHTML(d, FT.recLookup(p), { dot: k => dot(k), latest: newest[0] && newest[0].ref, ...(root.PeelDcGate ? root.PeelDcGate.treeOpts(p, d) : {}) }) : '';
    return `${tree || `<ul class="pnl-files">${newest.slice(0, 8).map(row).join('')}</ul>`}
      <p class="small"><button type="button" class="btn small link" data-dev-hist="file">All ${fmtNum(p.records.length)} source records, by file →</button></p>`;
  }
  function fillParts(p, parts) {
    if (!hasDOM() || !p) return;
    liveKey = p.key;
    if (['about', 'history', 'gantt', 'story'].some(x => parts.includes(x))) ensureCouncil(p);
    if (parts.includes('site') && p.lat != null) { fillNetworks(p); fillConstraints(p); fillStormMains(p); }
    if (parts.includes('ground') && p.lat != null) { devAerial(p); fillGround(p); }
  }
  // ---- Public contract ------------------------------------------------------------------
  const api = { render, setSub, partHTML, fillParts, aerialRun, aerialAvailable, renderAerialInto, openSection, openFile, openHistory };
  if (typeof module !== 'undefined' && module.exports) module.exports = { ...api, currentSub, recGroup, REC_GROUPS, groupRecords, statusOf, phaseBasis, scopeProjectForTest: () => scopeProject() };
  else root.DevTab = api;
})(typeof window !== 'undefined' ? window : globalThis);
