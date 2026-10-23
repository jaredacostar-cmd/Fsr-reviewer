/* How the app decides (PeelLogic): the data logic, the gates and the back-end decisions behind the
 * figures, on one Reference page (Home › Reference, beside the Glossary and Data sources). Each rule
 * names its value, what it does and where it is set; the values are read from the modules that apply
 * them (js/phases.js, js/demand.js, js/capacity.js, js/dc-gate.js, js/aerial.js, js/accuracy.js,
 * js/dc-cost.js, js/dc-infra.js), so the page cannot drift from the code. The weekly build's own rules
 * (js/tree.js, run by scripts/) are stated here and checked against the code in tests/logic.test.js.
 *
 * Pure: page(mods) takes the modules as arguments and runs in Node (tests/logic.test.js); without
 * them it reads the loaded modules in the browser. Screening only: nothing here is a Region decision.
 */
(function (root) {
  'use strict';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => (v == null || !isFinite(v) ? '–' : (+v).toLocaleString('en-CA'));
  const pct = v => (v == null || !isFinite(v) ? '–' : `${Math.round(v * 100)}%`);
  const DAY = 864e5;
  // The weekly build's file-tree rule (js/tree.js REF_MAX_M; js/tree.js is not loaded in the browser).
  const TREE_REF_MAX_M = 600;

  // A group of rules: [key, title, one line, rows: [rule, value, what it does, set in]]; where it is set
  // goes under what it does (one row a card on a phone, css/app.css .lg-tab).
  const tableHTML = (rows, label) => `<div class="rf-tw"><table class="rf-tab lg-tab" aria-label="${esc(label)}"><thead><tr><th scope="col">Rule</th><th scope="col">Value</th><th scope="col">What it does</th></tr></thead><tbody>${rows.map(([r, v, w, f]) => `<tr><th scope="row">${esc(r)}</th><td class="lg-v">${v}</td><td>${w}<small class="lg-at">Set in <code>${esc(f)}</code></small></td></tr>`).join('')}</tbody></table></div>`;
  const sec = ([key, title, line, rows]) => `<section class="rf" data-psec="${key}" id="lg-${key}"><h3 class="ws-h">${esc(title)}</h3><p class="small muted">${line}</p>${tableHTML(rows, title)}</section>`;

  const mods = () => ({ P: root.PeelPhases, D: root.PeelDemand, C: root.PeelCapacity, G: root.PeelDcGate, A: root.PeelAerial, AC: root.PeelAccuracy, DC: root.PeelDcCost, DI: root.PeelDcInfra });

  /** The groups of rules, read from the modules m (any of them may be missing: its values show –). */
  function groups(m = {}) {
    const P = m.P || {}, D = m.D || {}, C = m.C || {}, G = m.G || {}, A = m.A || {}, AC = m.AC || {}, DC = m.DC || {}, DI = m.DI || {};
    const phases = P.PHASES || [], lbl = k => (P.PHASE_BY_KEY && P.PHASE_BY_KEY[k] ? P.PHASE_BY_KEY[k].label : k);
    const dorm = P.DORMANT_YEARS || {}, crit = D.DEFAULT_CRITERIA || {}, ppu = crit.ppu || {}, w = crit.water || {}, ww = crit.wastewater || {}, emp = crit.employment || {}, jobs = crit.m2PerJob || {};
    const committed = D.COMMITTED_PHASES ? [...D.COMMITTED_PHASES].map(lbl).join(', ') : '–';
    const yrs = v => (v == null ? '–' : `${num(v)} year${v === 1 ? '' : 's'}`);
    const buckets = G.BUCKETS ? Object.entries(G.BUCKETS) : [];
    const rule = AC.AERIAL_RULE || {}, prior = A.PRIOR || {};

    return [
      ['stages', 'Stages: how a development is placed', 'Every municipal record is read into one ladder of stages; a development stands at the furthest stage any of its files has reached.', [
        ['The stage ladder', phases.length ? phases.map(p => esc(p.label)).join(' → ') : '–', `Ordered from first contact to built; withdrawn, refused and expired files (${esc(P.CANCELLED ? P.CANCELLED.label : 'Withdrawn / refused')}) leave every count.`, 'js/phases.js PHASES'],
        ['Status wording → stage', 'first matching rule wins', 'Each source’s status text is matched against an ordered list of phrases. The specific phrases go first, so “complete application” reads as in review, not built.', 'js/phases.js STATUS_RULES'],
        ['Which approval moves a site', 'site plan or draft plan', 'A site counts as approved only on a site plan approval, a draft plan of subdivision approval or a registered plan. A zoning or official plan approval alone leaves it in review.', 'js/phases.js sitePhaseOf'],
        ['Small sites (Bill 23)', `up to ${num(P.SMALL_SITE_UNITS)} units`, 'Residential sites this small have no site plan control, so a building permit can follow zoning directly.', 'js/phases.js SMALL_SITE_UNITS'],
        ['Permits never closed', `issued ${yrs(P.STALE_OPEN_YEARS)}+ before the data date`, 'A building permit with no status and no completion is taken as built at issue + 12 months (houses) or + 30 months (20+ units), and marked estimated.', 'js/phases.js closeStalePermits'],
        ['Stalled', 'in review, no activity for 2+ years', 'Its clock is the latest file event, permit or council item naming one of its files. A file under appeal (OLT, OMB, LPAT) is “under appeal”, never stalled.', 'js/phases.js proposedStateOf'],
        ['Dormant', Object.entries(dorm).map(([k, v]) => `${esc(lbl(k))}: ${yrs(v)}`).join('<br>') || '–', 'No activity for longer than a development at its stage usually waits (a draft approval lapses after 3 years). Dormant developments are held out of every count unless shown. Not while under appeal.', 'js/phases.js DORMANT_YEARS'],
      ]],
      ['joins', 'Data gates: how records join into a development', 'The weekly build joins applications and permits from three municipalities into developments. These gates decide what joins and what is counted.', [
        ['A permit’s file', `inside the boundary, or within ${num(P.CONTAINER_NEAR_M)} m`, 'A permit goes to the file whose land holds it (an address point can sit on the street side of the lot). The most specific kind wins: site plan or condominium, then draft plan, then use; then the smallest area.', 'js/phases.js containerOf'],
        ['Area-wide files', P.MAX_SITE_AREA_M2 ? `larger than ${num(P.MAX_SITE_AREA_M2 / 1e6)} km²` : '–', 'Secondary plans and large official plan amendments are area-wide: they don’t take in the permits inside them.', 'js/phases.js MAX_SITE_AREA_M2'],
        ['Permits before the file', P.DATE_SLACK_MS ? `more than ${num(Math.round(P.DATE_SLACK_MS / DAY))} days before` : '–', 'A permit dated this long before the application belongs to an earlier building on the land.', 'js/phases.js DATE_SLACK_MS'],
        ['Permit-only projects', `within ${num(P.NEAR_PERMIT_M)} m, ${num(P.NEAR_PERMIT_MIN_UNITS)}+ units, exact unit match`, 'A project with only building permits joins a nearby planning application whose unit count it matches exactly (the permit was mapped to a neighbouring civic number).', 'js/phases.js joinNearbyPermits'],
        ['Units that are not growth', 'existing, lost, removed, demolished', 'A field counting existing or lost units is never read as new homes.', 'js/phases.js NOT_GROWTH_UNITS'],
        ['System dates', 'ignored', 'Edit, load, extract, sync and snapshot dates are the database’s, not the development’s: they never set a stage date.', 'js/phases.js IGNORE_DATE'],
        ['Files that name another file', `up to ${num(TREE_REF_MAX_M)} m apart`, 'A file that names another file number is placed under it (a pre-consultation before its application) only when the two are this close.', 'js/tree.js REF_MAX_M'],
      ]],
      ['dcgate', 'DC servicing gate: which developments count', 'A development counts toward the DC analysis only once a water or wastewater site servicing permit has been applied for or issued on its site. Each development falls in one bucket.', [
        ...buckets.map(([k, b]) => [b.label, k === 'counted' ? '<strong>counted</strong>' : 'not counted', esc(b.why), `js/dc-gate.js BUCKETS.${k}`]),
        ['Permit filed with the site plan', '90 days’ grace', 'In the file tree, a site servicing permit filed up to 90 days before its site plan still goes under that site plan (the two often come together).', 'js/dc-gate.js GRACE_MS'],
      ]],
      ['demand', 'Demand: homes and jobs to flows', 'Peel’s design criteria, the defaults behind every estimate (each can be changed under Scenario › Criteria).', [
        ['Persons per unit', `single ${ppu.single ?? '–'} · town ${ppu.town ?? '–'} · apartment ${ppu.apartment ?? '–'}${ppu.apartmentHigh != null ? ` (${ppu.apartmentHigh} above ${num(D.APT_DENSITY)} persons/ha)` : ''} · not stated ${ppu.unknown ?? '–'}`, 'People from units, by building type. A unit with no type stated takes the lowest rate.', 'js/demand.js DEFAULT_CRITERIA.ppu'],
        ['Committed', committed, 'The stages that hold capacity (MECP Procedure D-5-1): approved developments not yet built count against the reserve.', 'js/demand.js COMMITTED_PHASES'],
        ['Water', `${w.avg ?? '–'} L/person/day · max day ×${w.maxDay ?? '–'} · peak hour ×${w.peakHour ?? '–'}`, 'Residential water demand, from the Modelling Demand Table (2024).', 'js/demand.js DEFAULT_CRITERIA.water'],
        ['Wastewater', `${ww.avg ?? '–'} L/person/day · Harmon peaking ${ww.peakMin ?? '–'}–${ww.peakMax ?? '–'} · I&amp;I ${ww.infiltration ?? '–'} L/s/ha`, 'Sewage flow from people, peaked by the Harmon formula within its limits, plus a fixed rain and groundwater allowance per hectare of site.', 'js/demand.js DEFAULT_CRITERIA.wastewater'],
        ['Jobs', `water ${emp.water ?? '–'} · wastewater ${emp.wastewater ?? '–'} L/job/day`, 'Non-residential demand per job.', 'js/demand.js DEFAULT_CRITERIA.employment'],
        ['Floor space per job', Object.entries(jobs).map(([k, v]) => `${esc(k)} ${v}`).join(' · ') + ' m²', 'Jobs estimated from an application’s floor area by use. A planning assumption, not a Peel standard.', 'js/demand.js DEFAULT_CRITERIA.m2PerJob'],
      ]],
      ['capacity', 'Capacity: what is compared, and the limit', 'The same calculation runs at every plant, pumping station and pressure zone.', [
        ['Expansion trigger', C.TRIGGER != null ? `${pct(C.TRIGGER)} of rated capacity` : '–', 'The 2020 Master Plan starts a plant’s next expansion at this flow. “Room to the trigger” is trigger × rated − committed; it is never called reserve.', 'js/capacity.js TRIGGER'],
        ['Uncommitted reserve', 'capacity − (existing + built + committed)', 'To 100% of rated (plants) or of firm capacity (pumping stations: largest pump on standby). Percentages are always of rated or firm, never of the trigger.', 'js/capacity.js compute'],
        ['Existing flow at plants', '2025 metered flow', 'The plants’ measured flow already holds what has been built, so built is not added again; zones, blocks and stations use the census plus built.', 'js/capacity.js compute'],
        ['Sewer pipes, one by one', 'not assessed', 'Pipe-by-pipe capacity is left to the Region’s hydraulic model: a sewer line never shows a number or “no constraint”.', 'js/util.js PIPE_RESULTS'],
        ['A site off the network', DI.DC_CONNECT_M ? `within ${num(DI.DC_CONNECT_M / 1000)} km of a planned main` : '–', 'A greenfield development outside the traced network takes the catchment or zone of the planned DC main it would connect to, before the nearest area by distance.', 'js/dc-infra.js DC_CONNECT_M'],
      ]],
      ['timing', 'Timing: the forecast and the DC program', 'When the pipeline is built, and whether the works arrive in time.', [
        ['Forecast (Growth › Forecast)', 'time in stage', 'Survival curves by stage and size from the dated file events since 2016: the time left for a site that has already waited. Sites beyond the data are paced by the homes the Ministry of Finance population growth needs; 100+ unit sites build about 250 units a year.', 'js/timing.js stageSchedules'],
        ['Rates and lags', '2016–2019 cohorts; p25 / p50 / p75', 'Approval and completion rates from projects first seen in 2016–2019 (five or more years to follow). Lags by municipality and building type, falling back to wider groups below 10 projects. Low / likely / high bands use slow, median and fast lags.', 'js/timing.js'],
        ['A DC project in time', DC.CLOSE_YEARS != null ? `late: after run-out · close: within ${yrs(DC.CLOSE_YEARS)} before` : '–', 'A project is late when it comes into service after the capacity it relieves runs out, close when it comes into service in the years just before.', 'js/dc-cost.js CLOSE_YEARS'],
      ]],
      ['aerial', 'Aerial check: is it built?', 'A probability that a development is complete, from its records and the change in aerial imagery on its site against the land around it.', [
        ['Starting point by stage', Object.entries(prior).map(([k, v]) => `${esc(lbl(k))} ${pct(v)}`).join(' · ') || '–', 'The prior before the imagery is read: how often a development at that stage is already built.', 'js/aerial.js PRIOR'],
        ['Verdict', rule.threshold != null ? `“${esc(rule.verdict)}” at ${pct(rule.threshold)}+ · mid band from ${pct(rule.midBand)}` : '–', 'The check’s decision rule. Its verdicts are kept for the session only.', 'js/accuracy.js AERIAL_RULE'],
      ]],
      ['fresh', 'Data freshness', 'Each source has a usual interval (Reference › Data sources lists them).', [
        ['Current', 'within its interval', 'Weekly sources (applications, permits, phase history, council items): 10 days. Yearly sources: 365 to 400 days.', 'js/demand-ui.js freshness'],
        ['Due for a refresh', 'past its interval', 'Shown amber on Data sources.', 'js/demand-ui.js freshness'],
        ['Out of date', 'more than twice its interval', 'Shown red; reference documents (census, master plan) are marked as such instead.', 'js/demand-ui.js freshness'],
      ]],
    ];
  }

  /** The page model (js/ws-pages.js pageHTML), in Home's layout. */
  function page(m) {
    const gs = groups(m || mods());
    // (buttons, not #anchors: the address's hash holds the share state, js/share.js)
    const toc = `<nav class="lg-toc" aria-label="On this page"><p class="small">${gs.map(g => `<button type="button" class="btn small link" data-lg-go="${g[0]}">${esc(g[1].split(':')[0])}</button>`).join(' · ')}</p></nav>`;
    return {
      id: 'logic', eyebrow: 'Reference', name: 'How does the app decide?',
      answer: 'The rules behind the figures: how a record gets its stage, which records join into a development, which developments the DC analysis counts, the design criteria, the capacity limit, the forecast and the data checks. Each value is read from the code that applies it.',
      mid: toc + gs.map(sec).join(''),
      method: 'Values are read from the app’s own modules when the page opens, so a change in the code changes this page. General screening rules from public data: Peel’s W&amp;WW Infrastructure Planning team must validate or confirm all results.',
      actions: [{ label: 'Data sources', attrs: { 'data-ws-page': 'data' }, primary: true }, { label: 'Glossary', attrs: { 'data-ws-page': 'glossary' } }],
    };
  }

  // ---- Browser: the contents line scrolls to its group ------------------------------------------
  if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-lg-go]'); if (!b) return;
      const s = document.getElementById(`lg-${b.dataset.lgGo}`); if (s) s.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
  }

  const api = { TREE_REF_MAX_M, groups, page };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLogic = api;
})(typeof window !== 'undefined' ? window : globalThis);
