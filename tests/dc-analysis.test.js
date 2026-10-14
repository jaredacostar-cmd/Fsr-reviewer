'use strict';
/* Phase 4 (Worker F): DC tab sub-views — Timing / Recommendations / Funding.
 * The funding scenario's Keep / Defer tables are merged into one recommendations
 * table with a Recommendation column and All / Keep / Defer filter chips.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// The DC region: from the DC Analysis banner to the Planning areas banner.
const dcRegion = () => {
  const a = APP.indexOf('// ---- DC Analysis (bottom panel tab)');
  const b = APP.indexOf('// ---- Planning areas', a);
  assert.ok(a !== -1 && b !== -1, 'DC region markers');
  return APP.slice(a, b);
};

test('three DC sub-view renderers fill the three Phase 4 bodies', () => {
  for (const fn of ['renderDcaTiming', 'renderDcaRec', 'renderDcaFunding']) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(APP), fn);
  }
  for (const id of ['dca-timing-body', 'dca-rec-body', 'dca-funding-body']) {
    assert.ok(APP.includes(`#${id}`), id);
  }
});

test('no per-tab scenario stamp remains in the DC tab', () => {
  assert.ok(!/stampHTML\(/.test(dcRegion()), 'stampHTML call in the DC region');
});

test('keep/defer merge: one table with a Recommendation column', () => {
  const R = dcRegion();
  const mfn = R.match(/function dcaMergeRecs\(B\) \{[\s\S]*?\n  \}/);
  assert.ok(mfn, 'dcaMergeRecs exists');
  assert.ok(/dec:\s*'Keep'/.test(mfn[0]), "keep rows carry dec 'Keep'");
  assert.ok(/dec:\s*'Defer'/.test(mfn[0]), "defer rows carry dec 'Defer'");
  assert.ok(mfn[0].indexOf("'Keep'") < mfn[0].indexOf("'Defer'"), 'keep rows come first');
  // One merged table: a Recommendation column header, and the old split Keep/Defer tables gone.
  assert.ok(/<th>Recommendation<\/th>/.test(R), 'Recommendation column header');
  assert.ok(!/<h4>Keep \(/.test(R) && !/<h4>Defer \(/.test(R), 'split Keep/Defer tables removed');
  // The recommendation cell renders the decision value.
  assert.ok(/<span class="dca-rec">\$\{x\.dec\}<\/span>/.test(R), 'decision cell from x.dec');
});

test('dcaMergeRecs: keep rows first (funding order), then defer by impact', () => {
  const m = APP.match(/function dcaMergeRecs\(B\) \{\n(?:.*\n)*?  \}/);
  assert.ok(m, 'dcaMergeRecs source extracts cleanly');
  const fn = vm.runInNewContext(`${m[0]}; dcaMergeRecs;`);
  const B = { keep: [{ name: 'k1' }, { name: 'k2' }], defer: [{ name: 'd1', v: 5 }, { name: 'd2', v: 9 }] };
  const rows = fn(B);
  const decs = Array.from(rows.map(x => x.dec)), names = Array.from(rows.map(x => x.r.name));
  assert.deepStrictEqual(decs, ['Keep', 'Keep', 'Defer', 'Defer']);
  assert.deepStrictEqual(names, ['k1', 'k2', 'd2', 'd1']);
  assert.deepStrictEqual(Array.from(fn({ keep: [], defer: [] })), []);
});

test('filter chips: All / Keep / Defer narrow the merged table', () => {
  const R = dcRegion();
  assert.ok(/\[\['all',\s*'All'\],\s*\['keep',\s*'Keep'\],\s*\['defer',\s*'Defer'\]\]/.test(R), 'All/Keep/Defer chips');
  assert.ok(/data-dcarec-filter="\$\{k\}"/.test(R), 'chips carry data-dcarec-filter');
  assert.ok(/DCA\.recFilter = rf\.dataset\.dcarecFilter/.test(R), 'click handler stores the filter');
  assert.ok(/DCA\.recAll = false/.test(R), 'changing the filter resets See all');
  assert.ok(/x\.dec\.toLowerCase\(\) === DCA\.recFilter/.test(R), 'table filters on recFilter');
});

test('each sub-view follows headline → tiles → chart → table → info', () => {
  const R = dcRegion();
  // Timing: timeline chart + project table with See all.
  assert.ok(/function dcaTimingChart\(/.test(R), 'timing chart');
  assert.ok(R.includes('data-dcatiming-all'), 'timing See all');
  // Recommendations: bar chart + merged table with See all.
  assert.ok(/function dcaRecChart\(/.test(R), 'recommendations chart');
  assert.ok(R.includes('data-dcarec-all'), 'recommendations See all');
  // Funding: curve chart + top-cost table with See all; budget tools kept.
  assert.ok(/function dcaCurveChart\(/.test(R), 'funding curve chart');
  assert.ok(R.includes('data-dcafund-all'), 'funding See all');
  assert.ok(R.includes('data-dcb-budget') && R.includes('data-dcb-years'), 'budget tools kept');
  assert.ok(R.includes('data-dcb-csv'), 'keep/defer CSV export kept');
  // One collapsed method/criteria/data-dates line per sub-view.
  assert.strictEqual((R.match(/dcaInfo\(/g) || []).length, 3, 'three info lines');
});

test('timing table keeps the existing tools and interactions', () => {
  const R = dcRegion();
  assert.ok(R.includes('data-dca-sort'), 'sort segmented control');
  assert.ok(R.includes('data-dca-year'), 'Demand-year select');
  assert.ok(R.includes('data-dca-csv'), 'analysis CSV export');
  assert.ok(/data-dca="\$\{esc\(r\.key\)\}"/.test(R), 'expandable project rows');
});
