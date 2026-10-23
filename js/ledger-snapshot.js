(function (root) {
'use strict';
  // Pipeline ledger, Phase 5 (docs/pipeline-ledger-plan.md): the annual snapshot. Pure: no DOM; Node
  // (scripts/build-ledger.js writes data/ledger/<year>-<season>.json and .csv) and the browser (Export ›
  // Pipeline snapshot (CSV), and Growth › Ledger's "Since the last snapshot") share it.
  //
  //   COLUMNS     the fixed column template (the Phase 1 row), versioned by TEMPLATE: a change to the
  //               columns is a new template number, never an edit of a frozen file
  //   snapshot()  rows (js/ledger.js) → { template, name, sourceDate, frozenAt, readme, totals, rows }
  //   toCSV()     the snapshot as CSV, a README of '#' lines first (source date, definitions, disclaimer)
  //   diff()      two snapshots (or a snapshot and today's rows): new, dropped, moved bucket, changed tier
  const TEMPLATE = 1;
  const DISCLAIMER = 'Public-data estimate. Not the Region’s committed capacity ledger.';
  const r1 = v => (v == null || !isFinite(v) ? null : Math.round(v * 10) / 10);
  const join = a => (a || []).filter(Boolean).join('; ');
  // [column, what it holds, row → value]. Units are left to build; built units are not in the ledger.
  const COLUMNS = [
    ['id', 'development key (municipality|address), stable between snapshots', r => r.id],
    ['name', 'development name', r => r.name],
    ['address', 'an address on its files', r => r.address],
    ['municipality', 'Mississauga, Brampton or Caledon', r => r.municipality],
    ['lat', 'latitude (WGS84)', r => r.lat],
    ['lon', 'longitude (WGS84)', r => r.lon],
    ['stage', 'the files’ stage: inception, review, approved, permit, construction, completed', r => r.stage],
    ['stage_date', 'date the development entered that stage', r => r.stageDate],
    ['capacity_stage', 'highest stage holding units: committed, approved, review, early', r => r.capacityStage],
    ['committed_peel', 'committed under the Peel rule: a building or site servicing permit (yes/no)', r => (r.committedPeel ? 'yes' : 'no')],
    ['committed_by', 'what commits it: servicing (the whole development) or permits (the units they cover)', r => r.commitBy || ''],
    ['committed_d51', 'committed under MECP D-5-1: draft or site plan approved (yes/no), for reference', r => (r.committedD51 ? 'yes' : 'no')],
    ['registered', 'a registered plan of subdivision or condominium (yes/no)', r => (r.registered && r.registered.yes ? 'yes' : 'no')],
    ['registered_date', 'its latest event date', r => (r.registered && r.registered.date) || ''],
    ['servicing_bucket', 'site servicing permit bucket (data/dc-gate.json): counted, existingOnly, private, permitNoSvc, none', r => (r.servicing && r.servicing.bucket) || ''],
    ['servicing_applied', 'first water / wastewater site servicing permit applied for', r => (r.servicing && r.servicing.applied) || ''],
    ['servicing_issued', 'first one issued', r => (r.servicing && r.servicing.issued) || ''],
    ['building_permit', 'a building permit filed (yes/no)', r => (r.buildingPermit && r.buildingPermit.yes ? 'yes' : 'no')],
    ['building_permit_filed', 'first building permit filed', r => (r.buildingPermit && r.buildingPermit.filed) || ''],
    ['building_permit_issued', 'first building permit issued', r => (r.buildingPermit && r.buildingPermit.firstIssued) || ''],
    ['units_planned', 'units planned (counted once: the larger of planned and permitted, net of demolitions)', r => r.planned],
    ['units_left', 'units left to build (planned less completed)', r => r1(r.left)],
    ['units_committed', 'of them, committed (Peel rule)', r => r1(r.units.committed)],
    ['units_approved', 'of them, plan approved, not committed', r => r1(r.units.approved)],
    ['units_review', 'of them, in review or zoning approved', r => r1(r.units.review)],
    ['units_early', 'of them, pre-application', r => r1(r.units.early)],
    ['units_single', 'units left by type: single / semi-detached', r => r1(r.byType && r.byType.single)],
    ['units_town', 'townhouse', r => r1(r.byType && r.byType.town)],
    ['units_apartment', 'apartment (incl. stacked and back-to-back towns)', r => r1(r.byType && r.byType.apartment)],
    ['units_unknown', 'type not stated', r => r1(r.byType && r.byType.unknown)],
    ['people', 'people in the units left to build (Peel design criteria)', r => r1(r.people)],
    ['pressure_zone', 'water pressure zone (mapped, else the nearest within 5 km)', r => (r.zone && r.zone.name) || ''],
    ['plant', 'wastewater treatment plant it drains to', r => (r.plant && r.plant !== 'none' ? r.plant : '')],
    ['secondary_plans', 'secondary plan / character area ids holding it', r => join(r.sp)],
    ['expected_year', 'likely year by which half its expected homes are done (blank: not timed)', r => (r.expectedYear && r.expectedYear.likely != null ? r.expectedYear.likely : '')],
    ['expected_low', 'earliest year of its range (fast band)', r => (r.expectedYear && r.expectedYear.low != null ? r.expectedYear.low : '')],
    ['expected_high', 'latest year of its range (slow band; blank: after the forecast)', r => (r.expectedYear && r.expectedYear.high != null ? r.expectedYear.high : '')],
    ['timing_borrowed', 'its municipality dates no completions: timed with those that do (yes/no)', r => (r.expectedYear && r.expectedYear.basis && r.expectedYear.basis.borrowed ? 'yes' : 'no')],
    ['milestone', 'the expected year’s bucket: to2031, to2041, to2051, later', r => r.milestone || 'later'],
    ['share_to2031', 'share of its homes the forecast places in 2026 to 2031', r => r1(r.buckets && r.buckets.to2031 * 100)],
    ['share_to2041', 'in 2032 to 2041 (%)', r => r1(r.buckets && r.buckets.to2041 * 100)],
    ['share_to2051', 'in 2042 to 2051 (%)', r => r1(r.buckets && r.buckets.to2051 * 100)],
    ['share_later', 'after 2051 or not timed (%)', r => r1(r.buckets && r.buckets.later * 100)],
    ['tier', 'confidence tier: A underway, B committed, C plan approved, D in review, E early', r => (r.confidence && r.confidence.tier) || ''],
    ['tier_before_flags', 'the tier before a flag lowered it', r => (r.confidence && r.confidence.base) || ''],
    ['tier_reasons', 'why that tier', r => join(r.confidence && r.confidence.reasons)],
    ['tier_flags', 'what lowered it one step', r => join(r.confidence && r.confidence.flags)],
    ['possibly_lapsed', 'servicing permit possibly lapsed: old (issued 3+ years, no building permit since) or cancelled', r => (r.lapsed ? r.lapsed.why : '')],
    ['units_estimated', 'permit units estimated: a permit states none (yes/no)', r => (r.unitsEstimated ? 'yes' : 'no')],
    ['files', 'its planning file numbers (first 8)', r => join(r.sources)],
  ].map(([key, what, get]) => ({ key, what, get }));

  // "2026-fall": the season the snapshot is taken in (Dec–Feb winter, Mar–May spring, Jun–Aug summer,
  // Sep–Nov fall).
  function nameFor(date) {
    const d = new Date(date), m = d.getUTCMonth(), y = d.getUTCFullYear();
    return `${y}-${m === 11 || m <= 1 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'fall'}`;
  }

  /** The snapshot of ledger rows. meta: { name, sourceDate, frozenAt, scope, notes: [] }. */
  function snapshot(rows, meta = {}) {
    const recs = (rows || []).map(r => Object.fromEntries(COLUMNS.map(c => { const v = c.get(r); return [c.key, v == null ? '' : v]; })));
    recs.sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const sum = k => r1(recs.reduce((t, x) => t + (+x[k] || 0), 0));
    const tiers = {};
    for (const x of recs) if (x.tier) tiers[x.tier] = (tiers[x.tier] || 0) + 1;
    return {
      template: TEMPLATE,
      name: meta.name || nameFor(meta.sourceDate || Date.now()),
      sourceDate: meta.sourceDate || null,
      frozenAt: meta.frozenAt || null,
      scope: meta.scope || 'Peel, the developments the Overview counts with no filters (dormant developments and site activity held aside)',
      disclaimer: DISCLAIMER,
      columns: COLUMNS.map(c => ({ key: c.key, what: c.what })),
      notes: meta.notes || [],
      totals: { developments: recs.length, units_left: sum('units_left'), units_committed: sum('units_committed'), units_approved: sum('units_approved'), units_review: sum('units_review'), units_early: sum('units_early'), people: sum('people'), tiers },
      rows: recs,
    };
  }

  const q = v => { const s = v == null ? '' : String(v); return /[",\n\r#]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  /** CSV: '#' README lines (source date, scope, definitions, disclaimer), then the header and rows. */
  function toCSV(s) {
    const readme = [
      `Pipeline ledger snapshot ${s.name} (template ${s.template}). ${s.disclaimer}`,
      `Source data as of ${s.sourceDate || 'n/a'}; frozen ${s.frozenAt || 'n/a'}. Scope: ${s.scope}.`,
      'Committed (the Peel rule): a water / wastewater site servicing permit (the whole development) or a building permit (the units it covers), filed or issued. Units are left to build: built units are not in the ledger.',
      ...s.notes,
      'Columns:',
      ...s.columns.map(c => `  ${c.key}: ${c.what}`),
    ].map(l => `# ${l}`).join('\n');
    const head = s.columns.map(c => c.key).join(',');
    return `${readme}\n${head}\n${s.rows.map(r => s.columns.map(c => q(r[c.key])).join(',')).join('\n')}\n`;
  }

  /**
   * What changed from snapshot a to b (b: a snapshot, or { rows } built the same way from today's rows):
   * { new, dropped, moved (milestone), tier (changed tier), unitsDelta, counts }. Rows are matched on id.
   */
  function diff(a, b) {
    const A = new Map(((a && a.rows) || []).map(r => [r.id, r])), B = new Map(((b && b.rows) || []).map(r => [r.id, r]));
    const out = { new: [], dropped: [], moved: [], tier: [], unitsDelta: 0 };
    for (const [id, r] of B) {
      const o = A.get(id);
      if (!o) { out.new.push(r); continue; }
      if ((o.milestone || 'later') !== (r.milestone || 'later')) out.moved.push({ row: r, from: o.milestone || 'later', to: r.milestone || 'later' });
      if ((o.tier || '') !== (r.tier || '')) out.tier.push({ row: r, from: o.tier || '', to: r.tier || '' });
    }
    for (const [id, r] of A) if (!B.has(id)) out.dropped.push(r);
    const sum = m => [...m.values()].reduce((t, r) => t + (+r.units_left || 0), 0);
    out.unitsDelta = r1(sum(B) - sum(A));
    out.counts = { new: out.new.length, dropped: out.dropped.length, moved: out.moved.length, tier: out.tier.length };
    return out;
  }

  const api = { TEMPLATE, COLUMNS, DISCLAIMER, nameFor, snapshot, toCSV, diff };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PeelLedgerSnapshot = api;
})(typeof window !== 'undefined' ? window : globalThis);
