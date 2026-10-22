(function (root) {
'use strict';
  // Pipeline ledger, Phase 1B (docs/pipeline-ledger-plan.md): one row per development, and a roll-up
  // that sums them. Pure: no DOM, no app state; the caller passes the developments and how to place
  // them (requireable in Node, like js/plan-rollup.js).
  //
  // A row's units are its units left to build (PeelPhases.unbuiltOf, as Growth): units already built
  // are not in the ledger. They split by capacity stage, since capacity is checked at every stage:
  //   committed  the Peel rule (D1): a site servicing permit commits the whole development, a
  //              building permit only the units it covers (PeelDemand.committedPeelUnits)
  //   approved   approved, not committed: draft or site plan approval (MECP D-5-1), no permit yet
  //   review     zoning, draft plan or site plan in review
  //   early      pre-consultation, or an application with no review milestone yet
  // and by milestone bucket (2026 to 2031, 2032 to 2041, 2042 to 2051, after 2051 or not timed) from
  // the share of the development's homes a forecast places in each (opts.yearsOf).
  //
  // Possibly lapsed (settled): no city publishes an expiry date. A site servicing permit issued 3 or
  // more years ago with no building permit filed since, or one the city marks cancelled (Brampton,
  // Caledon: data/dc-gate.json `cancelled`), is flagged. A flagged commitment drops back to the
  // development's planning stage (one step for an approved site); the view can hide the flagged rows.
  const STAGES = ['committed', 'approved', 'review', 'early'];
  const STAGE_LABEL = { committed: 'Committed', approved: 'Approved, not committed', review: 'In review', early: 'Early' };
  // Cut-offs: each includes the stages before it.
  const CUTOFFS = [
    { key: 'committed', label: 'Committed only', stages: ['committed'] },
    { key: 'approved', label: '+ Approved', stages: ['committed', 'approved'] },
    { key: 'review', label: '+ In review', stages: ['committed', 'approved', 'review'] },
    { key: 'all', label: 'Everything', stages: STAGES },
  ];
  const BUCKETS = [
    { key: 'to2031', label: '2026 to 2031', last: 2031 },
    { key: 'to2041', label: '2032 to 2041', last: 2041 },
    { key: 'to2051', label: '2042 to 2051', last: 2051 },
    { key: 'later', label: 'After 2051 or not timed', last: Infinity },
  ];
  const LAPSE_YEARS = 3;
  const YEAR_MS = 365.25 * 864e5;
  const DISCLAIMER = 'Public-data estimate. Not the Region’s committed capacity ledger.';

  const lazy = (name, file) => () => root[name] || (typeof require === 'function' ? require(file) : null);
  const Ph = lazy('PeelPhases', './phases.js'), Dm = lazy('PeelDemand', './demand.js');
  const ymd = t => (t != null && isFinite(+t) && +t > 0 ? new Date(+t).toISOString().slice(0, 10) : null);
  const tOf = s => (s ? Date.parse(`${s}T00:00:00Z`) : NaN);

  // Site servicing permits that commit (water / wastewater, not for an existing building).
  const commitSsp = e => e && e.kind === 'site' && !e.existing && !(e.services || []).every(s => s === 'storm');

  /**
   * Possibly lapsed: null, or { why: 'old' | 'cancelled', ref, issued, years }.
   * bps: the development's building permits (filed); asOf: epoch ms.
   */
  function lapseOf(gate, bps, asOf) {
    if (!gate) return null;
    const live = (gate.evidence || []).filter(commitSsp);
    if (gate.bucket !== 'counted') {
      const c = (gate.cancelled || [])[0];
      return c ? { why: 'cancelled', ref: c.ref || '', issued: c.issued || null, years: null } : null;
    }
    if (!live.length || live.some(e => !e.issued)) return null;
    const last = live.reduce((a, e) => (e.issued > a.issued ? e : a));
    const years = (asOf - tOf(last.issued)) / YEAR_MS;
    if (!(years >= LAPSE_YEARS)) return null;
    const firstOf = r => Math.min(...(r.events || []).map(e => +new Date(e.date)).filter(isFinite));
    if (bps.some(r => firstOf(r) >= tOf(last.issued))) return null;
    return { why: 'old', ref: last.ref || '', issued: last.issued, years };
  }

  // The stage holding a development's units that no permit commits.
  function planStage(p, D) {
    if (D.isCommitted(p) || p.phase === 'completed') return 'approved';
    return p.phase === 'review' ? 'review' : 'early';
  }

  // Shares of a development's homes in each milestone bucket, from { year: units } (any scale; a
  // forecast that times only some of them leaves the rest after 2051 or not timed). after: units the
  // forecast places beyond its last year; total: what the forecast set out to time (0: none).
  function bucketShares(years, after = 0, total = null) {
    const out = Object.fromEntries(BUCKETS.map(b => [b.key, 0]));
    let timed = 0;
    for (const [y, v] of Object.entries(years || {})) { if (!(v > 0)) continue; timed += v; out[BUCKETS.find(b => +y <= b.last).key] += v; }
    const all = Math.max(total != null ? total : 0, timed + (after > 0 ? after : 0));
    if (!(all > 0)) { out.later = 1; return out; }
    for (const k in out) out[k] /= all;
    out.later += Math.max(0, 1 - timed / all);
    return out;
  }

  /** The milestone bucket a year falls in (no year: after 2051 or not timed). */
  const bucketOf = y => (y != null && isFinite(y) ? BUCKETS.find(b => y <= b.last).key : 'later');

  /**
   * rows(projects, opts) → one row per development with units left to build.
   * opts (all optional):
   *   gateOf(p)    its data/dc-gate.json row
   *   people(p)    people in its units left to build (PeelDemand.estimate at basis 'remaining')
   *   zoneOf(p)    { id, name } pressure zone; plantOf(p) wastewater plant name
   *   plansOf(p)   [[planId, share]] (a development across two plans splits by share); default p.sp
   *                split evenly
   *   yearsOf(p)   { shares } from bucketShares, or null (not timed)
   *   scheduleOf(p) its expected year, { likely, low, high, basis } (PeelTiming.scheduleFor), or null
   *   asOf         epoch ms the lapse clock runs to (the data date)
   *   all          true: rows with nothing left to build too
   */
  function rows(projects, opts = {}) {
    const P = Ph(), D = Dm();
    const asOf = opts.asOf != null ? +opts.asOf : Date.now();
    const out = [];
    for (const p of projects || []) {
      if (!p || p.phase === 'cancelled') continue;
      const left = P.unbuiltOf(p);
      if (!(left > 0) && !opts.all) continue;
      const gate = opts.gateOf ? opts.gateOf(p) || null : null;
      const bps = D.buildingPermitsOf(p);
      const c = D.committedPeelUnits(p, gate);
      const lapsed = lapseOf(gate, bps, asOf);
      const units = Object.fromEntries(STAGES.map(s => [s, 0]));
      const rest = planStage(p, D);
      // A lapsed servicing permit's commitment drops back to the development's planning stage: one step,
      // to approved, not committed, for an approved site; in review for one still in review.
      if (lapsed && lapsed.why === 'old' && c.by === 'servicing') units[rest] += c.units;
      else units.committed += c.units;
      units[rest] += left - c.units;
      const people = opts.people ? opts.people(p) || 0 : 0;
      const ms = p.milestones || {};
      const issued = bps.flatMap(r => (r.events || []).filter(e => e.phase === 'permit').map(e => +new Date(e.date))).filter(isFinite);
      const filed = bps.flatMap(r => (r.events || []).map(e => +new Date(e.date))).filter(isFinite);
      const reg = (p.records || []).filter(r => r.kind === 'application' && r.phase !== 'cancelled' && (P.isRegistered(r) || P.isRegisteredCondo(r)));
      const regDate = reg.flatMap(r => (r.events || []).map(e => +new Date(e.date))).filter(isFinite);
      const ssp = gate ? (gate.evidence || []).filter(commitSsp) : [];
      const sspIssued = ssp.map(e => e.issued).filter(Boolean).sort();
      const zone = opts.zoneOf ? opts.zoneOf(p) : null;
      const plans = opts.plansOf ? opts.plansOf(p) || [] : (p.sp || []).map(id => [id, 1 / p.sp.length]);
      const yrs = opts.yearsOf ? opts.yearsOf(p) : null;
      const sch = opts.scheduleOf ? opts.scheduleOf(p) || null : null;
      out.push({
        id: p.key, name: p.title || p.key, address: (p.records || []).map(r => r.address).find(Boolean) || '',
        municipality: p.municipality || 'Other', lat: p.lat != null ? p.lat : null, lon: p.lng != null ? p.lng : null,
        stage: p.phase, stageDate: ymd(ms[p.phase]),
        committedPeel: D.isCommittedPeel(p, gate), committedD51: D.isCommitted(p),
        commitBy: c.by, unitsEstimated: c.estimated,
        capacityStage: STAGES.find(s => units[s] > 0) || rest,
        registered: { yes: reg.length > 0, date: regDate.length ? ymd(Math.max(...regDate)) : null },
        servicing: { bucket: gate ? gate.bucket : null, applied: gate ? gate.servicingApplied || null : null, issued: sspIssued[0] || null },
        buildingPermit: { yes: bps.length > 0, filed: filed.length ? ymd(Math.min(...filed)) : null, firstIssued: issued.length ? ymd(Math.min(...issued)) : null, buildings: c.permits },
        lapsed,
        planned: p.units > 0 ? p.units : 0, left, units,
        byType: D.unitSplit(p, 'remaining'),
        people,
        zone: zone ? { id: zone.id, name: zone.name || String(zone.id) } : null,
        plant: opts.plantOf ? opts.plantOf(p) || null : null,
        plans,
        sp: p.sp || [],
        // Phase 3: the year by which half its homes are expected (low–high range), and that year's bucket.
        // The roll-up spreads its homes over the years (buckets), so the totals stay the forecast's.
        expectedYear: sch,
        milestone: bucketOf(sch && sch.likely),
        buckets: yrs && yrs.shares ? yrs.shares : bucketShares(null),
        confidence: null,     // Phase 4
        sources: [...new Set((p.records || []).filter(r => r.kind === 'application').map(r => r.ref).filter(Boolean))].slice(0, 8),
      });
    }
    return out;
  }

  // ---- Roll-up ---------------------------------------------------------------------------------
  // A cell: units and people by stage. A node: cells by milestone bucket, and its total.
  const zeroStages = () => Object.fromEntries(STAGES.map(s => [s, { units: 0, people: 0 }]));
  const zeroCells = () => Object.fromEntries(BUCKETS.map(b => [b.key, zeroStages()]));
  function addRow(cells, row, f) {
    for (const b of BUCKETS) {
      const sh = (row.buckets[b.key] || 0) * f; if (!(sh > 0)) continue;
      for (const s of STAGES) {
        const u = row.units[s] * sh; if (!(u > 0)) continue;
        cells[b.key][s].units += u;
        cells[b.key][s].people += row.left > 0 ? row.people * row.units[s] / row.left * sh : 0;
      }
    }
  }
  function addCells(into, from) {
    for (const b of BUCKETS) for (const s of STAGES) { into[b.key][s].units += from[b.key][s].units; into[b.key][s].people += from[b.key][s].people; }
  }
  /** Sum of a node's cells: in one bucket (or every bucket), up to a cut-off, units or people. */
  function sumOf(cells, { bucket = null, cutoff = 'all', measure = 'units' } = {}) {
    const st = (CUTOFFS.find(c => c.key === cutoff) || CUTOFFS[3]).stages;
    let t = 0;
    for (const b of BUCKETS) { if (bucket && b.key !== bucket) continue; for (const s of st) t += cells[b.key][s][measure]; }
    return t;
  }

  // Groupings: what a row is placed in, as [[key, name, share]] (shares of one row add up to 1).
  const BY = {
    municipality: r => [[r.municipality, r.municipality, 1]],
    zone: r => [[r.zone ? `z:${r.zone.id}` : 'none', r.zone ? r.zone.name : 'No pressure zone', 1]],
    plant: r => [[r.plant && r.plant !== 'none' ? r.plant : 'none', r.plant && r.plant !== 'none' ? r.plant : 'No plant', 1]],
    plan: (r, names) => {
      const ps = (r.plans || []).filter(([, sh]) => sh > 0);
      const tot = ps.reduce((t, [, sh]) => t + sh, 0);
      const out = ps.map(([id, sh]) => [`a:${id}`, (names && names(id)) || id, tot > 1 ? sh / tot : sh]);
      const restSh = 1 - Math.min(1, tot);
      if (restSh > 1e-9) out.push([`n:${r.municipality}`, `Not in a plan (${r.municipality})`, restSh]);
      return out;
    },
  };

  /**
   * rollup(rows, by, opts) → { root, groups, check }
   *   by: 'municipality' | 'zone' | 'plant' | 'plan' | (row → [[key, name, share]])
   *   opts.names(id): a plan's name
   * Levels: Peel → group → development. Every node has cells (bucket × stage: units, people), its
   * rows ({ row, share }) and check = its cells − the sum of its children's, always 0.
   */
  function rollup(list, by = 'municipality', opts = {}) {
    const place = typeof by === 'function' ? by : (r => BY[by](r, opts.names));
    const root = { key: 'peel', name: 'Peel', cells: zeroCells(), children: [], rows: [] };
    const groups = new Map();
    for (const row of list || []) {
      addRow(root.cells, row, 1);
      root.rows.push({ row, share: 1 });
      for (const [key, name, share] of place(row)) {
        let g = groups.get(key);
        if (!g) { g = { key, name, cells: zeroCells(), children: [], rows: [] }; groups.set(key, g); root.children.push(g); }
        addRow(g.cells, row, share);
        g.rows.push({ row, share });
      }
    }
    // Checks, bottom-up: a group equals its developments; Peel equals its groups.
    const checkOf = (n, kids) => { const sum = zeroCells(); for (const k of kids) addCells(sum, k); let u = 0, pe = 0; for (const b of BUCKETS) for (const s of STAGES) { u = Math.max(u, Math.abs(n.cells[b.key][s].units - sum[b.key][s].units)); pe = Math.max(pe, Math.abs(n.cells[b.key][s].people - sum[b.key][s].people)); } return { units: u, people: pe }; };
    for (const g of groups.values()) g.check = checkOf(g, g.rows.map(({ row, share }) => { const c = zeroCells(); addRow(c, row, share); return { cells: c }; }).map(x => x.cells));
    root.check = checkOf(root, root.children.map(g => g.cells));
    const last = k => k === 'none' || k.startsWith('n:') || k === 'Other';
    root.children.sort((a, b) => last(a.key) - last(b.key) || (by === 'municipality' ? a.name.localeCompare(b.name) : sumOf(b.cells) - sumOf(a.cells)));
    const check = Math.max(root.check.units, ...root.children.map(g => g.check.units));
    return { root, groups, check };
  }

  /** Totals of a list of rows: units left, by stage, people, and the flags. */
  function totals(list) {
    const t = { rows: 0, planned: 0, left: 0, people: 0, units: Object.fromEntries(STAGES.map(s => [s, 0])), lapsed: 0, lapsedUnits: 0, estimated: 0 };
    for (const r of list || []) {
      t.rows++; t.planned += r.planned; t.left += r.left; t.people += r.people;
      for (const s of STAGES) t.units[s] += r.units[s];
      if (r.lapsed) { t.lapsed++; t.lapsedUnits += r.left; }
      if (r.unitsEstimated) t.estimated++;
    }
    return t;
  }

  const api = { STAGES, STAGE_LABEL, CUTOFFS, BUCKETS, LAPSE_YEARS, DISCLAIMER, lapseOf, bucketShares, bucketOf, rows, rollup, sumOf, totals };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLedger = api;
})(typeof window !== 'undefined' ? window : globalThis);
