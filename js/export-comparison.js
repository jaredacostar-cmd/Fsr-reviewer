/* Peel Growth Pipeline (unofficial) – Phase 5 exports: pure data builders for the
 * comparison PDF ("PDF — comparison" in the top-bar Export menu; window.comparisonPDF
 * in js/app.js).
 *
 * buildRows(items, fns) turns the Compare tool's items (window.PeelToolCompare.items())
 * into one plain row per item with the standard numbers: units, people, jobs, water
 * max day, wastewater peak wet, phase, municipality, and the tightest constraint.
 * fns is the app bridge, so this module stays pure and unit-testable:
 *   fns.estimate(p)          -> a demand-estimate object (the D.estimate shape) or null
 *   fns.devNeeds(p)          -> constraint objects for one development (or null)
 *   fns.phaseLabel(p)        -> the phase display label
 *   fns.sumEstimates(list)   -> sums demand-estimate objects (js/tools-compare.js)
 *   fns.tightestConstraint(list) -> the tightest constraint (js/tools-compare.js)
 *
 * totalsFor(rows) sums the row numbers the same way sumEstimates sums estimate
 * objects, so the PDF's totals row matches sumEstimates() over the same inputs.
 * tightestText(t) renders a constraint object as one plain-text line for a cell.
 *
 * Pattern: window.ComparisonExport in the browser, module.exports under Node.
 */
(function (root) {
  'use strict';

  // Cap the member scan for an area's tightest constraint, mirroring the Compare
  // tool's own card (up to 50 of the largest members).
  var MAX_MEMBERS = 50;

  var STATUS_TXT = {
    gap: 'runs out before a DC project relieves it',
    planned: 'DC project in time',
    check: 'check the data',
    ok: 'room to build-out',
  };

  function byUnitsDesc(a, b) { return (b.units || 0) - (a.units || 0); }

  function devRow(item, fns) {
    var e = null;
    try { e = fns.estimate(item.p); } catch (err) { e = null; }
    var needs = null;
    try { needs = fns.devNeeds ? fns.devNeeds(item.p) : null; } catch (err) { needs = null; }
    return {
      kind: 'dev',
      title: item.title || 'Untitled development',
      sub: item.sub || '',
      units: e ? e.totalUnits : null,
      people: e ? e.population : null,
      jobs: e && e.employment ? e.employment.jobs : null,
      waterMaxDay: e && e.combined ? e.combined.water.maxDay : null,
      wastewaterWetPeak: e && e.combined ? e.combined.wastewater.wetPeak : null,
      phase: fns.phaseLabel ? fns.phaseLabel(item.p) : (item.p && item.p.phase) || '',
      municipality: (item.p && item.p.municipality) || '',
      tightest: needs ? fns.tightestConstraint(needs) : null,
      noSvc: !needs,
    };
  }

  function areaRow(item, fns) {
    var members = Array.isArray(item.members) ? item.members.filter(Boolean) : [];
    var ests = [];
    members.forEach(function (p) {
      try { var e = fns.estimate(p); if (e) ests.push(e); } catch (err) { /* skip */ }
    });
    var t = fns.sumEstimates(ests);
    var all = [];
    members.slice().sort(byUnitsDesc).slice(0, MAX_MEMBERS).forEach(function (p) {
      try { var n = fns.devNeeds ? fns.devNeeds(p) : null; if (n) all = all.concat(n); } catch (err) { /* skip */ }
    });
    return {
      kind: 'area',
      title: item.title || 'Area',
      sub: item.sub || '',
      units: t.totalUnits,
      people: t.population,
      jobs: t.jobs,
      waterMaxDay: t.water.maxDay,
      wastewaterWetPeak: t.wastewater.wetPeak,
      phase: '\u2013',
      municipality: '\u2013',
      tightest: fns.tightestConstraint(all),
      noSvc: !all.length,
    };
  }

  // One row per compared item, in compare order.
  function buildRows(items, fns) {
    return (items || []).map(function (item) {
      return item.kind === 'area' ? areaRow(item, fns) : devRow(item, fns);
    });
  }

  // Totals over the rows, so the PDF totals row matches sumEstimates() on the
  // same estimates (both sum the same fields with || 0 fallbacks).
  function totalsFor(rows) {
    var t = { units: 0, people: 0, jobs: 0, waterMaxDay: 0, wastewaterWetPeak: 0 };
    (rows || []).forEach(function (r) {
      if (!r) return;
      t.units += r.units || 0;
      t.people += r.people || 0;
      t.jobs += r.jobs || 0;
      t.waterMaxDay += r.waterMaxDay || 0;
      t.wastewaterWetPeak += r.wastewaterWetPeak || 0;
    });
    return t;
  }

  function tightestText(t) {
    if (!t) return 'No servicing data.';
    var out = t.out === 'today' ? 'already' : (t.out == null ? 'after the horizon' : '\u2248' + t.out);
    return (t.name || 'Capacity') + ' \u2014 ' + (STATUS_TXT[t.status] || t.status) + '; runs out ' + out;
  }

  var api = { buildRows: buildRows, totalsFor: totalsFor, tightestText: tightestText };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ComparisonExport = api;
})(typeof window !== 'undefined' ? window : globalThis);
