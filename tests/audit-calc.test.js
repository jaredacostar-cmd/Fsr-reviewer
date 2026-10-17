'use strict';
// Overnight audit: fixes that change figures, each to a rule the app already states.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

test('servicing: the wastewater split at the wastewater rate; each inflow once; the Horizon series; 100% net of inflows', () => {
  const wt = src('js/water-tab.js');
  assert.match(wt, /\['Residential', '', 'demand-wastewater', \[n\(e\.wastewater\.avg\)/);
  assert.match(wt, /\['Employment', '', 'demand-employment', \[n\(em\.wastewater\.avg\)/);
  const sp = src('js/svc-plants.js');
  assert.match(sp, /inflows\.filter\(e => !e\.plant\)\.reduce\(\(t, e\) => t \+ e\.mld, 0\)/, 'York (plant: Lakeview) is in its plant already');
  assert.match(sp, /hz, renderSvcScoped, capChartHTML, capHorizonHTML,/, 'the Capacity fold reads the Horizon chart (svc-capacity hzPlant)');
  assert.match(src('js/svc-capacity.js'), /SP\(\)\.capHorizonHTML && SP\(\)\.capHorizonHTML\.data/);
  assert.match(sp, /capRow\(esc\(rep\(x\.pl\) \? rep\(x\.pl\)\.name : SD\(\)\.plantLabel\(x\.pl\)\), k, undefined, inflowsTo\(x\.pl\) \+ divMld\(x\.pl\)\)/);
  assert.match(src('js/svc-tab.js'), /for \(const id of Areas\(\)\.locate\(drainage, d\.lng, d\.lat\)\) add\(id, d\.pop \* \(SD\(\)\.svcById\.get\(id\)\?\.served \?\? 1\)\);/);
});

test('Capital › Timing trusts the capital record as capTag does (no low-confidence or future "complete")', () => {
  const M = require('../js/capital-ea-model.js');
  const e = { key: 'k', status: 'complete', lastUpdate: '2021-03-11', conf: 'high' };
  assert.match(M.dcActualHTML(e, true, 2038, 2026), /not in capital records/, 'complete for a 2038 work: not trusted');
  assert.match(M.dcActualHTML({ ...e, conf: 'low', status: 'planned' }, true, 2027, 2026), /not in capital records/, 'outline-only match: not trusted');
  assert.doesNotMatch(M.dcActualHTML(e, true, 2024, 2026), /not in capital records/, 'complete, scheduled before this year: shown');
  assert.equal(M.dcActualHTML(e, false, 2024, 2026), '');
});

test('completions per year by municipality count only years up to the data year (as the Peel row)', () => {
  const G = require('../js/growth.js');
  const r = (y, units) => ({ kind: 'permit', phase: 'completed', units, ref: `B${y}${units}`, y });
  const proj = { key: 'a', municipality: 'Brampton', phase: 'completed', records: [r(2024, 10), r(2025, 20), r(2027, 30)] };
  const deps = { completedAt: x => ({ date: Date.UTC(x.y, 5, 1), estimated: false }), permitUnits: rs => rs.reduce((t, x) => t + x.units, 0) };
  assert.equal(G.completionStats([proj], deps).byMuni[0].perYear, 20, 'unclipped: 60 over 3 years');
  assert.equal(G.completionStats([proj], { ...deps, nowYear: 2026 }).byMuni[0].perYear, 15, 'clipped: 30 over 2 years');
  assert.match(src('js/growth-ui.js'), /permitUnits: rs => P\.permitUnits\(rs\), nowYear:/);
});

test('growth: the census context is the filtered area\'s; the largest unbuilt pairs left-to-build with its people; targets net of pre-census homes', () => {
  const g = src('js/growth-ui.js');
  assert.match(g, /PeelAreas\.censusTotals\(bc\.das, \{ muni: st\.muni, sp: st\.sp, mtsa: st\.mtsa \}\)\.dwellings/);
  assert.match(g, /chart: layerStripHTML\(\[p\], \{ site: true \}\),/);
  assert.match(src('js/ws-pages.js'), /censusTotals\(bc\.das, \{ muni: App\(\) \? App\(\)\.state\.muni : ''/);
  assert.match(src('js/overview-tab.js'), /const pe = D\.estimate\(\[part\], App\(\)\.state\.criteria, 'all', App\(\)\.jobsOf\);/);
  const pr = src('js/plan-rollup.js');
  assert.match(pr, /const pre = t\.scope === 'total' \? 0 : m\.existing \|\| 0, grow = m\.planned - pre;/);
  assert.match(pr, /pctCommitted: base \? \(m\.committed - pre\) \/ base : null, pctTotal: base \? grow \/ base : null,\n        gap: base \? base - grow : null,/);
  assert.match(src('js/plan-tables.js'), /existing: t\.planned > 0 \? L\.existing : 0 \};/);
});
