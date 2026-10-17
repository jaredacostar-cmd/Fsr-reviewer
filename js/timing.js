/* js/timing.js — Timing forecast with a range (Phase 7, Feature 2).
 *
 * A statistical screening estimate of WHEN the pipeline builds out, as an
 * alternative to the full build-out view: expected completions per year with
 * LOW / LIKELY / HIGH bands, calibrated from the dated file events since 2016
 * (the per-record events in data/snapshot.json — the weekly phase log in
 * data/history.json only began 2026-10-08), by municipality and building type,
 * plus plant + pressure-zone trigger years with a range.
 *
 * Pure logic is DOM-free and requireable under Node (tests/timing.test.js);
 * the Growth › Timing sub-view renderer lives at the bottom and only runs in
 * the browser. `root.PeelUtil || {}` keeps the top-level destructuring safe
 * under Node where PeelUtil is not loaded.
 *
 * Method (screening-level, documented on the sub-view):
 *  - Approval rate: share of application projects first seen (inception event)
 *    in the cohort years 2016–2019 that reached their own approval (dated
 *    approval event, or the project's current phase where the event is missing).
 *    Cohorts avoid right-censoring: a 2019 inception has 5+ years of follow-up.
 *  - Completion rate: share of projects with a first permit event in 2016–2019
 *    that reached completion (dated completion event, or a completed permit
 *    record — dated completion events are sparse outside Mississauga).
 *  - Lags (months, dated events only): inception→approval, permit→completion,
 *    inception→completion, approval→permit; p25 / p50 / p75 per municipality ×
 *    building type, with a fallback chain (muni×type → muni → type → global)
 *    when n < 10.
 *  - Bands: LOW = slow lags (p75) with the Wilson low rate bound; LIKELY =
 *    medians with the point estimate; HIGH = fast lags (p25) with the Wilson
 *    high bound. Each project's remaining units are spread over completion
 *    years with a small kernel around the expected year.
 *  - Facility trigger years reuse each facility's approved / proposed flow
 *    layers, phased in over windows derived from the calibrated lags, with the
 *    layers scaled by the calibrated rates — they are NOT the plant Horizon
 *    assumptions from the Wastewater tab.
 */
(function (root) {
  'use strict';

  const { $, esc, fmtNum, fmt1, hlP, unit, uUnits, skel, estTag, dot, capTxt, isSmallSystem } = root.PeelUtil || {};
  const App = () => root.PeelApp;
  const P = root.PeelPhases;
  const D = root.PeelDemand;
  const DU = () => root.PeelDemandUI;
  const SvcTab = () => root.PeelSvcTab;
  const WT = () => root.PeelWaterTrace;
  const MP = () => root.PeelMasterPlan;
  const SD = () => root.PeelSvcData;

  // ---- Small pure helpers ----------------------------------------------------
  const MONTH_MS = 30.44 * 864e5;
  const BANDS = ['low', 'likely', 'high'];
  const COHORT_YEARS = [2016, 2017, 2018, 2019];
  const MIN_N = 10;              // observations before a muni×type row stands alone
  const MAX_LAG_MO = 360;        // lags over 30 years are data noise (cf. js/growth.js)
  const DEF_LAG_IA = 30;         // fallback medians (months) when a cell has no lag data
  const DEF_LAG_AP = 12;
  const DEF_LAG_AC = 24;
  const FORECAST_YEARS = 25;     // how far the yearly bands run

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const monthsBetween = (a, b) => (b - a) / MONTH_MS;
  // Same linear phase-in the plant horizon uses: fraction of a layer online in year y.
  const frac = (y, start, n) => Math.min(1, Math.max(0, (y - start + 1) / Math.max(1, n)));

  /** Building-type bucket for calibration, from a record/project type text. */
  function btypeOf(text) {
    const s = String(text || '');
    if (/indust|commercial|office|retail|hotel|warehouse|employment|institutional|\bici\b|manufacturing|storage facility/i.test(s)) return 'employment';
    if (/apart|\bapts?\b|condo|tower|high[- ]?rise|mid[- ]?rise|storey|\bsty\b|\d\s*sty|mixed[- ]use|stacked|back[- ]to[- ]back|multi[- ]?(unit|res)|residential building/i.test(s)) return 'apartment';
    if (/town|row ?house|\brow\b|street ?town|common element/i.test(s)) return 'town';
    if (/semi/i.test(s)) return 'semi';
    if (/single|detached|\bsfd\b|\bsdd\b|dwelling/i.test(s)) return 'single';
    return 'unknown';
  }
  const BTYPE_LABEL = { single: 'Single detached', semi: 'Semi-detached', town: 'Townhouse', apartment: 'Apartment', employment: 'Employment', unknown: 'Type not stated' };

  /** Wilson 95% score interval for k successes in n trials. */
  function wilson(k, n, z = 1.96) {
    if (!(n > 0)) return { p: null, lo: null, hi: null, n: 0 };
    const p = k / n, z2 = z * z, den = 1 + z2 / n;
    const c = p + z2 / (2 * n);
    const m = z * Math.sqrt(Math.max(0, p * (1 - p) / n + z2 / (4 * n * n)));
    return { p, lo: clamp((c - m) / den, 0, 1), hi: clamp((c + m) / den, 0, 1), n };
  }

  /** Linear-interpolation quantiles of a numeric array. */
  function quantiles(values, qs = [0.25, 0.5, 0.75]) {
    const s = values.filter(v => v > 0 && isFinite(v)).sort((a, b) => a - b);
    if (!s.length) return null;
    const at = q => {
      const pos = q * (s.length - 1), lo = Math.floor(pos), hi = Math.ceil(pos);
      return s[lo] + (s[hi] - s[lo]) * (pos - lo);
    };
    const [p25, p50, p75] = qs.map(at);
    return { p25, p50, p75, n: s.length };
  }

  // ---- Calibration -----------------------------------------------------------
  // Observations: one per project, from the dated file events since 2016
  // (in the browser: project milestones, which the phases module builds from
  // those events).
  //   { muni, btype, hasApp, cancelled, first: { inception, approved, permit, completed },
  //     approved?, completed? }
  // first.* are epoch ms (or null) from DATED events only. approved/completed are
  // outcome booleans that may also use the record's current phase (status-derived):
  // dated completion events are sparse outside Mississauga, so the completion
  // rate would otherwise undercount badly; the lags always use dated events.
  const wasApproved = o => o.approved != null ? !!o.approved : !!(o.first && o.first.approved);
  const wasCompleted = o => o.completed != null ? !!o.completed : !!(o.first && o.first.completed);
  function calibrate(obs, opts = {}) {
    const cohorts = opts.cohortYears || COHORT_YEARS;
    const inCohort = ms => { const y = new Date(ms).getUTCFullYear(); return cohorts.includes(y); };
    const acc = () => ({ nApp: 0, nAppOk: 0, nPermit: 0, nPermitOk: 0, lagIA: [], lagAC: [], lagIC: [], lagAP: [] });
    const groups = new Map();
    const g = key => { let x = groups.get(key); if (!x) { x = acc(); groups.set(key, x); } return x; };
    const lag = (arr, a, b, cap = MAX_LAG_MO) => {
      if (!(a > 0) || !(b > a)) return;
      const m = monthsBetween(a, b);
      if (m > 0 && m <= cap) arr.push(m);
    };
    for (const o of obs || []) {
      if (!o || o.cancelled) continue;
      const key = `${o.muni || '?'}|${o.btype || 'unknown'}`;
      const x = g(key), f = o.first || {};
      if (o.hasApp && f.inception && inCohort(f.inception)) {
        x.nApp++;
        if (wasApproved(o)) x.nAppOk++;
        lag(x.lagIA, f.inception, f.approved);
      }
      if (f.permit && inCohort(f.permit)) {
        x.nPermit++;
        if (wasCompleted(o)) x.nPermitOk++;
        lag(x.lagAC, f.permit, f.completed);
      }
      if (f.inception && f.completed) lag(x.lagIC, f.inception, f.completed, 480);
      if (f.approved && f.permit) lag(x.lagAP, f.approved, f.permit);
    }
    const fin = (key, x) => {
      const [muni, btype] = key.split('|');
      return {
        key, muni, btype, nApp: x.nApp, nPermit: x.nPermit,
        approval: wilson(x.nAppOk, x.nApp),
        completion: wilson(x.nPermitOk, x.nPermit),
        lagIA: quantiles(x.lagIA), lagAC: quantiles(x.lagAC),
        lagIC: quantiles(x.lagIC), lagAP: quantiles(x.lagAP),
      };
    };
    const rows = {};
    // Exact rows, then the fallback aggregates: muni|*, *|btype, *|*.
    for (const [key, x] of groups) rows[key] = fin(key, x);
    const mergeKeys = keys => {
      const m = acc();
      for (const k of keys) { const x = groups.get(k); if (!x) continue;
        m.nApp += x.nApp; m.nAppOk += x.nAppOk; m.nPermit += x.nPermit; m.nPermitOk += x.nPermitOk;
        m.lagIA.push(...x.lagIA); m.lagAC.push(...x.lagAC); m.lagIC.push(...x.lagIC); m.lagAP.push(...x.lagAP); }
      return m;
    };
    const munis = new Set(), btypes = new Set();
    for (const k of groups.keys()) { const [m, b] = k.split('|'); munis.add(m); btypes.add(b); }
    for (const m of munis) rows[`${m}|*`] = fin(`${m}|*`, mergeKeys([...groups.keys()].filter(k => k.startsWith(`${m}|`))));
    for (const b of btypes) rows[`*|${b}`] = fin(`*|${b}`, mergeKeys([...groups.keys()].filter(k => k.endsWith(`|${b}`))));
    rows['*|*'] = fin('*|*', mergeKeys([...groups.keys()]));
    const nObs = [...groups.values()].reduce((t, x) => t + x.nApp + x.nPermit, 0);
    return { rows, cohorts, minN: opts.minN || MIN_N, nObs };
  }

  /** Calibrated row for a municipality × building type, with fallbacks. */
  function rowFor(cal, muni, btype) {
    const chain = [`${muni}|${btype}`, `${muni}|*`, `*|${btype}`, '*|*'];
    for (const k of chain) {
      const r = cal.rows[k];
      if (r && (r.nApp + r.nPermit) >= (cal.minN || MIN_N)) return { ...r, fallback: k === chain[0] ? null : k };
    }
    return { ...cal.rows['*|*'], fallback: '*|*' };
  }

  const lagPick = (stats, band, dflt) => {
    if (!stats) return dflt;
    return band === 'low' ? stats.p75 : band === 'high' ? stats.p25 : stats.p50;
  };
  const ratePick = (w, band) => {
    if (!w || w.p == null) return 1;
    return band === 'low' ? w.lo : band === 'high' ? w.hi : w.p;
  };

  // ---- Forecast bands ----------------------------------------------------------
  // Items: one per unbuilt project —
  //   { key, title, muni, btype, units, stage, stageDate }
  // stage ∈ inception | review | approved | permit | construction; stageDate epoch ms.
  const STAGE_LAG = { inception: 'full', review: 'full', approved: 'permit', permit: 'build', construction: 'half' };
  const KERNEL = [[-1, 0.15], [0, 0.55], [1, 0.2], [2, 0.1]];  // spread around the expected completion year

  /** Expected completion-year distribution for one project under one band. */
  function projectSchedule(item, row, band, opts = {}) {
    const nowY = opts.nowYear || new Date().getUTCFullYear();
    const mode = STAGE_LAG[item.stage] || 'full';
    const ar = ratePick(row.approval, band), cr = ratePick(row.completion, band);
    const lagIA = lagPick(row.lagIA, band, DEF_LAG_IA);
    const lagAP = lagPick(row.lagAP, band, DEF_LAG_AP);
    const lagAC = lagPick(row.lagAC, band, DEF_LAG_AC);
    const months = mode === 'full' ? lagIA + lagAP + lagAC
      : mode === 'permit' ? lagAP + lagAC
      : mode === 'build' ? lagAC : lagAC * 0.5;
    const units = Math.max(0, item.units || 0) * (mode === 'full' ? ar : 1) * cr;
    const ey = new Date(item.stageDate || Date.now()).getUTCFullYear()
      + Math.round((months * MONTH_MS) / (365.25 * 864e5));
    const out = {};
    for (const [dy, w] of KERNEL) { const y = Math.max(nowY, ey + dy); out[y] = (out[y] || 0) + units * w; }
    return out;
  }

  /** Yearly expected completions with low / likely / high bands. */
  function forecastBands(items, cal, opts = {}) {
    const nowY = opts.nowYear || new Date().getUTCFullYear();
    // +2 years of tail so the completion kernel (±2 y) never drops units.
    const span = (opts.years || FORECAST_YEARS) + 2;
    const years = [];
    for (let y = nowY; y < nowY + span; y++) years.push({ year: y, low: 0, likely: 0, high: 0 });
    const byYear = new Map(years.map(r => [r.year, r]));
    const perItem = [];
    for (const item of items || []) {
      if (!item || (item.units || 0) <= 0) continue;
      if (item.stage === 'completed' || item.stage === 'cancelled') continue;
      const row = rowFor(cal, item.muni, item.btype);
      const sched = {};
      for (const b of BANDS) {
        const s = projectSchedule(item, row, b, { nowYear: nowY });
        sched[b] = s;
        for (const [y, v] of Object.entries(s)) { const r = byYear.get(+y); if (r) r[b] += v; }
      }
      perItem.push({ item, row: row.key, sched });
    }
    let cl = 0, ck = 0, ch = 0;
    for (const r of years) { cl += r.low; ck += r.likely; ch += r.high; r.cumLow = cl; r.cumLikely = ck; r.cumHigh = ch; }
    return { years, perItem, nowYear: nowY, total: { low: cl, likely: ck, high: ch } };
  }

  // ---- Facility trigger-year ranges ----------------------------------------------
  // fac: { name, rated, existing, approved, proposed, div?, thresholds?, end?, capWord? }
  // flows in one consistent unit (ML/d); approved/proposed are the growth layers.
  function facilityBands(fac, cal, opts = {}) {
    const nowY = opts.nowYear || new Date().getUTCFullYear();
    const end = fac.end || nowY + FORECAST_YEARS;
    const g = cal.rows['*|*'];
    const series = {};
    for (const b of BANDS) {
      const lagACm = lagPick(g.lagAC, b, DEF_LAG_AC), lagIAm = lagPick(g.lagIA, b, DEF_LAG_IA);
      const aYears = clamp(Math.round(lagACm / 12), 2, 20);
      const pOff = clamp(Math.round(lagIAm / 12), 1, 15);
      const pYears = aYears + pOff;
      const ar = ratePick(g.approval, b), cr = ratePick(g.completion, b);
      const A = (fac.approved || 0) * cr, P = (fac.proposed || 0) * ar * cr;
      const ys = [];
      for (let y = nowY; y <= end; y++) {
        const f = (fac.existing || 0) + A * frac(y, nowY, aYears) + P * frac(y, nowY + pOff, pYears) + (fac.div || 0);
        ys.push({ year: y, pct: fac.rated > 0 ? f / fac.rated * 100 : null });
      }
      series[b] = { ys, aYears, pYears, pOff };
    }
    const thresholds = fac.thresholds || [80, 90, 100];
    const triggers = {};
    for (const t of thresholds) {
      const r = {};
      for (const b of BANDS) {
        const hit = series[b].ys.find(p => p.pct != null && p.pct >= t);
        r[b] = hit ? hit.year : null;
        r[`${b}AtStart`] = series[b].ys[0].pct != null && series[b].ys[0].pct >= t;
      }
      triggers[t] = r;
    }
    const last = b => series[b].ys[series[b].ys.length - 1].pct;
    return { name: fac.name, rated: fac.rated, capWord: fac.capWord || 'rated', series, triggers, end, buildOut: { low: last('low'), likely: last('likely'), high: last('high') } };
  }

  /** '2031–2035' style text for a { low, likely, high } trigger triple. */
  function triggerRangeText(tr, end) {
    const ys = [tr.low, tr.likely, tr.high].filter(y => y != null);
    if (!ys.length) return `after ${end}`;
    if (tr.lowAtStart && tr.likelyAtStart && tr.highAtStart) return 'already';
    const lo = Math.min(...ys), hi = Math.max(...ys);
    return lo === hi ? String(lo) : `${lo}–${hi}`;
  }

  // ---- Browser: adapters -------------------------------------------------------
  // Calibrate on every project (statistical power); forecast on the filtered set.
  function observationsFromProjects(projects) {
    const out = [];
    for (const p of projects || []) {
      if (!p || p.phase === 'cancelled') continue;
      const ms = p.milestones || {};
      const num = v => (v == null || isNaN(+v) ? null : +v);
      const recs = p.records || [];
      const hasApp = recs.some(r => r.kind === 'application');
      out.push({
        muni: p.municipality || '?',
        btype: btypeOf(recs.map(r => r.type || '').join(' ')),
        hasApp,
        cancelled: false,
        // Outcome booleans may use the current phase (status-derived): dated
        // completion events are sparse outside Mississauga.
        approved: num(ms.approved) != null || (hasApp && ['approved', 'permit', 'construction', 'completed'].includes(p.phase)),
        completed: num(ms.completed) != null || recs.some(r => r.kind === 'permit' && r.phase === 'completed'),
        first: {
          inception: num(ms.inception), approved: num(ms.approved),
          permit: num(ms.permit), completed: num(ms.completed),
        },
      });
    }
    return out;
  }

  function pipelineItems(projects) {
    const out = [];
    for (const p of projects || []) {
      if (!p || p.phase === 'cancelled') continue;
      // Unbuilt: the count less its completed units — Growth's "left to build" (SPEC 1.6).
      const units = (P || (typeof require === 'function' ? require('./phases.js') : null)).unbuiltOf(p);
      if (!(units > 0)) continue;
      const ms = p.milestones || {};
      const ds = Object.values(ms).map(v => +v).filter(v => v > 0);
      const recs = p.records || [];
      out.push({
        key: p.key, title: p.title, muni: p.municipality || '?',
        btype: btypeOf(recs.map(r => r.type || '').join(' ')),
        units, stage: p.phase,
        stageDate: (ms[p.phase] ? +ms[p.phase] : null) || (ds.length ? Math.max(...ds) : Date.now()),
      });
    }
    return out;
  }

  // Wastewater plants: average dry weather flow layers from the servicing model
  // (existing = census + built + external inflows; approved / proposed = growth).
  function plantFacs() {
    const M = App().state.svcModel;
    if (!M || typeof M.plantCap !== 'function') return [];
    // From the one capacity function (js/capacity.js, SPEC 1.4).
    const CAP = root.PeelCapacity;
    return ['Lakeview', 'Clarkson', 'Inglewood']
      .map(pl => (CAP && CAP.of(`plant:${pl}`)) || (c => c && { ...c, buildout: c.buildout })(M.plantCap(pl))).filter(c => c && c.rated > 0)
      .map(c => ({
        name: c.name, rated: c.rated, capWord: 'rated', basis: root.PeelSvcTab && root.PeelSvcTab.wwBasis ? root.PeelSvcTab.wwBasis() : 'design',
        existing: c.existing,
        approved: Math.max(0, c.committed - c.existing),
        proposed: Math.max(0, c.buildout - c.committed),
      }));
  }

  // Water treatment + pumping into each pressure zone: maximum-day layers from
  // the same rows the Water tab's Capacity sub-view builds (firm pumping capacity).
  function waterFacs() {
    const st = App().state, M = st.svcModel, R = st.reports;
    if (!M || !R || !R.water || !R.water.southPeel || !WT().WF.data) return null;
    const sp = R.water.southPeel;
    const lake = MP().lakeZones().filter(id => MP().zLevel(SD().svcById.get(id).zone) <= 7);
    const rows = [];
    // Treatment serves every lake-based zone (not only those up to zone 7): the one capacity function.
    const k = root.PeelCapacity && root.PeelCapacity.of('wsys:southPeel');
    const treat = k ? null : WT().waterCapRow(M, 'South Peel treatment', MP().lakeZones(),
      sp.plants.reduce((t, p) => t + p.ratedMLd, 0), sp.maxDayMLd, '');
    if (k) rows.push({ name: 'South Peel treatment (A.P. Kennedy + Lorne Park)', rated: k.rated, capWord: 'rated', basis: 'metered', existing: k.existing, approved: k.committed - k.existing, proposed: k.buildout - k.committed });
    else if (treat) rows.push({
      name: 'South Peel treatment (A.P. Kennedy + Lorne Park)', rated: treat.rated, capWord: 'rated', basis: 'metered',
      existing: treat.v[0] + treat.v[1], approved: treat.v[2], proposed: treat.v[3],
    });
    const pumps = WT().wfPumps();
    for (let n = 1; n <= 7; n++) {
      const into = pumps.filter(p => p.src < n && p.tgt >= n);
      const ids = lake.filter(id => MP().zLevel(SD().svcById.get(id).zone) >= n);
      const cap = into.reduce((t, p) => t + p.cap, 0);
      if (!cap || !ids.length) continue;
      const r = WT().waterCapRow(M, n === 1 ? 'From the plants (zone 1 and above)' : `Into zone ${n} and above`, ids, cap, null, '', 'firm');
      if (r) rows.push({
        name: n === 1 ? 'Pumping: from the plants (zone 1 and above)' : `Pumping: into zone ${n} and above`,
        rated: r.rated, capWord: 'firm', basis: 'design',
        existing: r.v[0] + r.v[1], approved: r.v[2], proposed: r.v[3],
      });
    }
    return rows;
  }

  // ---- Browser: SVG band chart ---------------------------------------------------
  // Yearly expected completions: the low–high band as a shaded area, likely as a
  // line. Theme-aware via CSS vars (dark default, light checked by inspection).
  // Bundle 5: the forecast as cumulative units built from now, against the unbuilt pipeline, with
  // 2031 and 2041 marked and the low–high range shaded. The running sums are the ones the answer and
  // figures quote (sumTo), so the chart and the numbers agree.
  function cumulative(years) {
    const run = { low: 0, likely: 0, high: 0 };
    return years.map(r => { for (const b of BANDS) run[b] += r[b] || 0; return { year: r.year, low: run.low, likely: run.likely, high: run.high }; });
  }
  // Year ticks every five years and the last, dropping one that would sit within three years of the
  // one before it (2051 and 2052 collided).
  function yearTicks(ys) {
    const out = [];
    ys.forEach((y, i) => { if (i % 5 === 0 || i === ys.length - 1) { if (out.length && y - out[out.length - 1] < 3) { if (i === ys.length - 1) return; } out.push(y); } });
    return out;
  }
  function timingChartSVG(fc, pipeline) {
    const years = cumulative(fc.years), pipe = pipeline > 0 ? pipeline : 0;
    const W = window.PeelUtil.chartW(320, 900), H = 250, L = 52, Rr = 16, T = 18, B = 26;
    const k = v => (v >= 1000 ? `${(v / 1000).toFixed(v % 1000 ? 1 : 0)}k` : String(Math.round(v)));
    const maxV = Math.max(1, pipe, ...years.map(r => r.high));
    const step = maxV > 100000 ? 50000 : maxV > 20000 ? 10000 : maxV > 5000 ? 2000 : 500;
    const yMax = Math.ceil(maxV * 1.04 / step) * step;
    const X = i => L + (years.length > 1 ? i / (years.length - 1) : 0) * (W - L - Rr);
    const Yv = v => T + (1 - v / yMax) * (H - T - B);
    const pt = (i, v) => `${X(i).toFixed(1)},${Yv(v).toFixed(1)}`;
    const band = `M${years.map((r, i) => pt(i, r.low)).join('L')}L${years.map((r, i) => pt(i, r.high)).reverse().join('L')}Z`;
    const line = b => (years.length > 1 ? 'M' : '') + years.map((r, i) => pt(i, r[b])).join('L');
    const yTicks = []; for (let v = 0; v <= yMax + 1e-6; v += step) yTicks.push(v);
    const thin = yTicks.length > 6 ? yTicks.filter((v, i) => i % 2 === 0) : yTicks;
    const xTicks = yearTicks(years.map(r => r.year));
    const marks = [2031, 2041].map(y => years.findIndex(r => r.year === y)).filter(i => i >= 0);
    const tip = r => `By ${r.year}: likely ${fmtNum(Math.round(r.likely))} units built (range ${fmtNum(Math.round(r.low))}–${fmtNum(Math.round(r.high))})`;
    return `<div class="tband-wrap" data-info="timing-forecast">
      <h3 class="sub-title pnl-chart-t">Homes built from ${years[0].year}, adding up, against the unbuilt pipeline <span class="pnl-chart-u">(units)</span></h3>
      <svg class="tband" viewBox="0 0 ${W} ${H}" style="max-width:${W}px" role="img" aria-label="Units expected to be built from ${years[0].year} to ${years[years.length - 1].year}, adding up, with the low to high range, against ${fmtNum(Math.round(pipe))} unbuilt units in the pipeline">
        <g class="tband-grid">${thin.map(v => `<line x1="${L}" x2="${W - Rr}" y1="${Yv(v).toFixed(1)}" y2="${Yv(v).toFixed(1)}"/>`).join('')}</g>
        <g class="tband-ax">${thin.map(v => `<text x="${L - 6}" y="${(Yv(v) + 4).toFixed(1)}" text-anchor="end">${k(v)}</text>`).join('')}
          ${xTicks.map(y => `<text x="${X(years.findIndex(r => r.year === y)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${y}</text>`).join('')}</g>
        <path class="tband-band" d="${band}"><title>Low to high range</title></path>
        ${pipe ? `<line class="tband-pipe" x1="${L}" x2="${W - Rr}" y1="${Yv(pipe).toFixed(1)}" y2="${Yv(pipe).toFixed(1)}"/><text class="tband-pipe-t" x="${L + 4}" y="${(Yv(pipe) - 5).toFixed(1)}">Unbuilt pipeline: ${fmtNum(Math.round(pipe))} units</text>` : ''}
        <path class="tband-line tb-likely" d="${line('likely')}"><title>Likely: ${years.map(r => `${r.year} ${fmtNum(Math.round(r.likely))}`).join(', ')}</title></path>
        ${marks.map(i => { const r = years[i], x = X(i).toFixed(1); return `<line class="tband-mark" x1="${x}" x2="${x}" y1="${Yv(r.likely).toFixed(1)}" y2="${H - B}"/><circle class="tband-pt" cx="${x}" cy="${Yv(r.likely).toFixed(1)}" r="4"><title>${esc(tip(r))}</title></circle><text class="tband-mark-t" x="${x}" y="${(Yv(r.likely) - 9).toFixed(1)}" text-anchor="middle">${r.year}: ≈${k(Math.round(r.likely / 1000) * 1000)}</text>`; }).join('')}
      </svg>
      <ul class="grow-legend"><li><i class="gsw tband-sw-likely"></i>Likely</li><li><i class="gsw tband-sw-band"></i>Low–high range</li><li><i class="gsw tband-sw-pipe"></i>Unbuilt units in the pipeline</li></ul>
      <div class="small muted">${estTag} statistical projection — not a prediction for any one site</div>
    </div>`;
  }

  // Expected by 2031 / 2041 split by layer (SPEC §2.5): the same forecast run on each layer's
  // developments (Committed, Proposed, Anticipated), likely values, on the shared bar.
  function paceByLayerHTML(items, cal) {
    const Ly = root.PeelLayers, LB = root.PeelLayerBar; if (!Ly || !LB || !items.length) return '';
    const ks = ['committed', 'proposed', 'anticipated'];
    const by = Object.fromEntries(ks.map(k => [k, forecastBands(items.filter(i => Ly.layerOfPhase(i.stage) === k), cal)]));
    const to = (k, y) => by[k].years.filter(r => r.year <= y).reduce((t, r) => t + r.likely, 0);
    const unb = k => items.filter(i => Ly.layerOfPhase(i.stage) === k).reduce((t, i) => t + i.units, 0);
    const max = ks.reduce((t, k) => t + unb(k), 0);
    const row = y => `<div class="pace-ly"><span class="small">By ${y}</span>${LB.barHTML({ segments: ks.map(k => ({ layer: k, value: to(k, y), title: `${LB.LABEL[k]}: ≈${fmtNum(Math.round(to(k, y)))} of ${fmtNum(Math.round(unb(k)))} unbuilt units expected by ${y} (likely)` })), max })}</div>`;
    return `<h3 class="sub-title" data-info="growth-layers">Expected by layer <span class="muted small">likely, of the unbuilt units in each layer</span></h3>${row(2031)}${row(2041)}
      ${LB.legendHTML(ks.map(k => ({ layer: k, text: `${LB.LABEL[k]} ${fmtNum(Math.round(to(k, 2031)))} → ${fmtNum(Math.round(to(k, 2041)))} of ${fmtNum(Math.round(unb(k)))}` })))}`;
  }

  // ---- Browser: the Growth › Timing sub-view ---------------------------------------
  function renderTiming() {
    const body = $('#timing-body'); if (!body) return;
    const app = App(); if (!app || !app.state) return;
    SvcTab().renderSvcTab();  // ensure the servicing model exists (as the Census sub-view does)
    if (!app.state.projects.length) { body.innerHTML = skel('Forecast'); return; }
    // Area-only content: not shown at development scope (design audit, Group 6).
    if (window.DevScope && window.DevScope.current()) { body.innerHTML = window.PeelUtil.AREA_ONLY_NOTE; return; }
    const cal = calibrate(observationsFromProjects(app.state.projects));
    const set = DU().demandSet();
    const items = pipelineItems(set);
    const fc = forecastBands(items, cal);
    const asof = (DU().freshness()[0] && DU().freshness()[0].date) || '–';
    const sumTo = (y, b) => fc.years.filter(r => r.year <= y).reduce((t, r) => t + r[b], 0);
    const unbuilt = items.reduce((t, i) => t + i.units, 0);
    // (estimates to three significant figures: the precision a statistical screening has)
    const est = v => fmtNum(root.PeelUtil.sig3 ? root.PeelUtil.sig3(v) : Math.round(v));
    const rng = () => `${est(sumTo(2031, 'low'))}–${est(sumTo(2031, 'high'))}`;
    const head = items.length
      ? `A statistical <strong>screening estimate</strong> of when the pipeline builds out: <strong>≈${est(sumTo(2031, 'likely'))}</strong> units expected by 2031 (range ${rng()}), <strong>≈${est(sumTo(2041, 'likely'))}</strong> by 2041 — against <strong>${fmtNum(Math.round(unbuilt))}</strong> unbuilt units in the pipeline.`
      : 'No unbuilt units in the developments shown.';
    const tile = (label, v, sub, info) => `<div class="tile" data-info="${info}"><div class="tl">${label} ${estTag}</div><div class="tv">${v}<span class="tu">units</span></div>${sub ? `<div class="ts">${sub}</div>` : ''}</div>`;
    const tiles = `<div class="tiles" data-info="timing-tiles">`
      + tile('Expected by 2031', fmtNum(Math.round(sumTo(2031, 'likely'))), `range ${fmtNum(Math.round(sumTo(2031, 'low')))}–${fmtNum(Math.round(sumTo(2031, 'high')))}`, 'timing-tiles')
      + tile('Expected by 2041', fmtNum(Math.round(sumTo(2041, 'likely'))), `range ${fmtNum(Math.round(sumTo(2041, 'low')))}–${fmtNum(Math.round(sumTo(2041, 'high')))}`, 'timing-tiles')
      + tile('Unbuilt in pipeline', fmtNum(Math.round(unbuilt)), unbuilt ? `≈${Math.round(sumTo(2041, 'likely') / unbuilt * 100)}% expected by 2041 (likely)` : '', 'timing-tiles')
      + tile('Calibration', fmtNum(cal.nObs), `dated file events, cohorts ${cal.cohorts[0]}–${cal.cohorts[cal.cohorts.length - 1]}`, 'timing-calibration')
      + `</div>` + paceByLayerHTML(items, cal);

    // Calibration table: approval / completion rates and lags by municipality × type.
    const munis = DU().MUNIS || ['Mississauga', 'Brampton', 'Caledon'];
    const pc = w => w.p == null ? '–' : `${Math.round(w.p * 100)}%<small>${Math.round(w.lo * 100)}–${Math.round(w.hi * 100)}%</small>`;
    const med = s => s ? `${s.p50.toFixed(0)}<small> mo · n=${s.n}</small>` : '–';
    const crows = [];
    for (const m of munis) for (const b of ['single', 'semi', 'town', 'apartment', 'unknown']) {
      const r = cal.rows[`${m}|${b}`];
      if (!r || (r.nApp + r.nPermit) === 0) continue;
      crows.push(`<tr><td>${esc(m)}</td><td>${BTYPE_LABEL[b]}</td><td class="n">${fmtNum(r.nApp)}</td><td class="n">${pc(r.approval)}</td><td class="n">${med(r.lagIA)}</td><td class="n">${fmtNum(r.nPermit)}</td><td class="n">${pc(r.completion)}</td><td class="n">${med(r.lagAC)}</td></tr>`);
    }
    const calibTable = crows.length ? `<div class="hyd-scroll"><table class="dt" data-info="timing-calibration"><caption>Calibration: approval and completion rates, time lags ${estTag}<br><span class="muted">by municipality and building type, from the dated file events</span></caption><thead><tr><th>Municipality</th><th>Type</th><th class="n">Apps</th><th class="n">Approval<br>rate</th><th class="n">Median<br>app → approval</th><th class="n">Permits</th><th class="n">Completion<br>rate</th><th class="n">Median<br>permit → completion</th></tr></thead><tbody>${crows.join('')}</tbody></table></div>` : '';

    // Top contributors to the forecast.
    const contrib = fc.perItem.map(({ item, sched }) => {
      const tot = b => Object.values(sched[b]).reduce((t, v) => t + v, 0);
      return { item, low: tot('low'), likely: tot('likely'), high: tot('high') };
    }).filter(c => c.likely > 0.5).sort((a, b) => b.likely - a.likely);
    const prow = c => `<tr><td>${esc(c.item.title || c.item.key)}<small>${esc(c.item.muni)} · ${dot(c.item.stage)} ${esc(P.PHASE_BY_KEY[c.item.stage] ? P.PHASE_BY_KEY[c.item.stage].label : c.item.stage)} · ${esc(BTYPE_LABEL[c.item.btype] || c.item.btype)}</small></td><td class="n">${fmtNum(Math.round(c.likely))}<small>${fmtNum(Math.round(c.low))}–${fmtNum(Math.round(c.high))}</small></td></tr>`;
    const contribTable = contrib.length ? `<table class="dt"><caption>Largest contributors to the forecast <span class="muted">expected completions, likely (range)</span> ${estTag}</caption><thead><tr><th>Development</th><th class="n">Expected<br>units</th></tr></thead><tbody>${contrib.slice(0, 10).map(prow).join('')}</tbody></table>`
      + (contrib.length > 10 ? `<details class="see-all"><summary>See all ${fmtNum(contrib.length)} developments</summary><table class="dt"><thead><tr><th>Development</th><th class="n">Expected units</th></tr></thead><tbody>${contrib.map(prow).join('')}</tbody></table></details>` : '') : '';

    // Trigger-year ranges: wastewater plants, then water treatment + pressure-zone pumping.
    const trigTable = (title, facs) => {
      if (!facs || !facs.length) return '';
      // Small systems (Inglewood) after the large ones, under their own row.
      const ord = [...facs.filter(f => !isSmallSystem(f.rated)), ...facs.filter(f => isSmallSystem(f.rated))];
      const firstSmall = ord.find(f => isSmallSystem(f.rated));
      const rows = ord.map(f => {
        const fb = facilityBands({ name: f.name, rated: f.rated, existing: f.existing, approved: f.approved, proposed: f.proposed, div: f.div || 0, end: fc.nowYear + FORECAST_YEARS }, cal);
        const bo = fb.buildOut.likely;
        const cell = t => {
          const tr = fb.triggers[t], txt = triggerRangeText(tr, fb.end);
          const like = tr.likely != null ? tr.likely : tr.low != null ? tr.low : tr.high;
          return `<td class="n">${like != null ? `<strong>${like}</strong><small>${esc(txt)}</small>` : `<span class="muted">${esc(txt)}</span>`}</td>`;
        };
        return `${f === firstSmall ? '<tr class="grp"><td colspan="5">Small systems <small>capacity in m³/d</small></td></tr>' : ''}<tr data-basis="${f.basis}"><td>${esc(f.name)}<small>${f.capWord} ${capTxt(f.rated, f.rated)} · ${root.PeelUtil.basisChip(f.basis)}</small></td><td class="n">${bo == null ? '–' : `${Math.round(bo)}%`}</td>${[80, 90, 100].map(cell).join('')}</tr>`;
      }).join('');
      return `<div class="hyd-scroll"><table class="dt" data-info="timing-triggers"><caption>${title} ${estTag}</caption><thead><tr><th>Facility</th><th class="n">Load at<br>build-out</th><th class="n">Reaches<br>80%</th><th class="n">Reaches<br>90%</th><th class="n">Reaches<br>100%</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    };
    let wf = null, wfLoading = false;
    {
      // Water facilities still loading: fill this section when they arrive.
      const st0 = App().state;
      if (st0.svcModel && st0.reports && st0.reports.water && st0.reports.water.southPeel && WT().WF) {
        wf = waterFacs();
        if (!wf) { wfLoading = true; WT().loadWaterFacilities().then(d => { if (d && $('#timing-body')) renderTiming(); }); }
      }
    }
    const plantsTable = trigTable(`Wastewater plants: trigger-year ranges <span class="muted">${SvcTab().wwFlowLabel()} vs rated (annual average) capacity</span>`, plantFacs());
    const waterTable = wf ? trigTable('Water: trigger-year ranges <span class="muted">maximum day vs rated (treatment) / firm (pumping) capacity</span>', wf)
      : wfLoading ? skel('Water facilities') : '';

    // Stage 3: the standard panel; the forecast, the contributors, the calibration and the trigger-year
    // tables below are its full table.
    if (root.PeelPanel) {
      const PN = root.PeelPanel, fig = (y, b) => est(sumTo(y, b));
      const trig = plantFacs().map(f => { const fb = facilityBands({ name: f.name, rated: f.rated, existing: f.existing, approved: f.approved, proposed: f.proposed, div: f.div || 0, end: fc.nowYear + FORECAST_YEARS }, cal), tr = fb.triggers[90]; const like = tr.likely != null ? tr.likely : tr.low != null ? tr.low : tr.high; return { f, like, txt: triggerRangeText(tr, fb.end) }; })
        .sort((a, b) => (a.like == null ? 1e4 : a.like) - (b.like == null ? 1e4 : b.like));
      PN.set('growth:timing', {
        calc: true, fullTitle: `Growth › Forecast · ${App().state.muni || 'Peel'}: the forecast, the contributors, the calibration and the trigger years`,
        head: PN.areaHead('Growth › Forecast', 'When does it come?', { tone: 'stage', text: 'Screening estimate' }, `${esc(App().state.muni || 'Peel')} · data as of ${esc(root.PeelUtil.dayText ? root.PeelUtil.dayText(asof) : asof)}`),
        answer: head,
        figures: [
          { v: fig(2031, 'likely'), u: 'units', label: 'expected by 2031', ctx: `range ${fig(2031, 'low')}–${fig(2031, 'high')}` },
          { v: fig(2041, 'likely'), u: 'units', label: 'expected by 2041', ctx: `range ${fig(2041, 'low')}–${fig(2041, 'high')}` },
          { v: fmtNum(Math.round(unbuilt)), u: 'units', label: 'unbuilt in the pipeline', ctx: unbuilt ? `≈${Math.round(sumTo(2041, 'likely') / unbuilt * 100)}% expected by 2041` : '' },
          { v: fmtNum(cal.nObs), u: 'events', label: 'the estimate learns from', ctx: `dated application and permit events, files from ${cal.cohorts[0]}–${cal.cohorts[cal.cohorts.length - 1]}` },
        ],
        chart: items.length ? timingChartSVG(fc, unbuilt) : '',
        lists: [
          // (the forecast pace; Servicing › Capacity puts every file on its own schedule, so its years can
        // differ: both are named)
        { title: 'Plants: 90% trigger year at the forecast pace', rows: [...trig.map(x => PN.kv(esc(x.f.name), x.like != null ? `≈${x.like}${x.txt !== String(x.like) ? ` <small>range ${esc(x.txt)}</small>` : ''}` : esc(x.txt))), { kv: true, html: '<span class="small muted">Servicing › Capacity puts every file on its own schedule instead, so its years can differ by a year or two.</span>' }], total: trig.length, seeAll: { 'data-full-table': 'growth' } },
          { title: 'Largest contributors', rows: contrib.slice(0, 5).map(c => ({ attrs: { 'data-pnl-dev': c.item.key }, html: `<div class="pnl-r-top"><span class="pnl-r-name">${esc(c.item.title || c.item.key)}<small>${esc(c.item.muni)}</small></span><span class="pnl-r-fig">${fmtNum(Math.round(c.likely))}<small>units, likely</small></span></div>` })), total: contrib.length, seeAll: { 'data-full-table': 'growth' } },
        ],
        method: 'A statistical screening estimate of when the pipeline builds out, not a prediction for any one site: approval and completion rates and the time lags are calibrated from the dated application and permit events, by municipality and building type; low / likely / high bands. Trigger years phase each plant\u2019s approved and proposed flow in over the calibrated lags (not the plant horizon assumptions).',
        sources: 'The dated file events of the applications and permits on the map (2016–2019 cohorts); the plants\u2019 2025 flows and rated capacity (2025 annual reports).',
        foot: { primary: { label: 'Area report (PDF)', attrs: { 'data-area-report': 'shown' } } },
      });
    }
    body.innerHTML = `
      ${hlP(head)}
      ${tiles}
      ${items.length ? timingChartSVG(fc, unbuilt) : ''}
      ${contribTable}
      ${calibTable}
      ${plantsTable}
      ${waterTable}
      <p class="small muted">ⓘ Forecast — a statistical screening estimate, not a prediction for any one site. Approval and completion rates and the time lags are calibrated from the dated application and permit events in the municipal files since 2016, by municipality and building type (cohorts ${cal.cohorts[0]}–${cal.cohorts[cal.cohorts.length - 1]}, so every project had 5+ years of follow-up; ${fmtNum(cal.nObs)} dated observations; Wilson 95% intervals; cells with fewer than ${cal.minN} observations fall back to coarser aggregates). Rates count a project as approved / completed from its current phase where the dated event is missing (dated completion events are sparse outside Mississauga); lags use dated events only. LOW uses the slow lags (p75) with the low rate bound, LIKELY the medians, HIGH the fast lags (p25) with the high bound. Trigger years phase each facility's approved / proposed flow layers in over windows from the calibrated lags and scale them by the calibrated rates — they are not the plant Horizon assumptions on the Wastewater tab. Calibrated on all projects; the forecast covers the developments shown. Applications as of <strong>${esc(asof)}</strong>.</p>`;
  }

  // ---- Public contract ----
  const api = {
    BANDS, COHORT_YEARS, MIN_N, FORECAST_YEARS,
    btypeOf, wilson, quantiles, calibrate, rowFor,
    projectSchedule, forecastBands, facilityBands, triggerRangeText,
    observationsFromProjects, pipelineItems, renderTiming, cumulative, yearTicks,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelTiming = api;
})(typeof window !== 'undefined' ? window : globalThis);
