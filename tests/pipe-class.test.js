'use strict';
// Pipe class and "not assessed" (design audit, Group 4).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const U = require('../js/util.js');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');

test('pipe class is by size: trunk from the smallest primary (trunk) main on the DC maps', () => {
  const dc = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'dc-infra.json'), 'utf8'));
  const primary = dc.wastewater.lines.filter(l => l.k === 'primary' && l.d).map(l => l.d);
  assert.equal(U.TRUNK_MM, Math.min(...primary));
  assert.equal(U.pipeClass(675), 'local');
  assert.equal(U.pipeClass(750), 'trunk');
  assert.equal(U.pipeClass(2400), 'trunk');
  const sc = src('sewer-cap.js');
  assert.match(sc, /const slot = pipeClass\(MM\(\)\.SEW\.data\.pipes\[i\]\[0\]\);/);
  assert.doesNotMatch(sc, /dist <= 3000/, 'no distance rule');
  assert.match(src('fsr-check.js'), /'Local sewers \(under 750 mm\)'.*'Trunk sewers \(750 mm and over\)'/);
});

test('hidden pipe results never drive DC timing or exports', () => {
  assert.equal(U.PIPE_RESULTS, false);
  const mp = src('masterplan.js');
  assert.match(mp, /if \(PIPE_RESULTS && MM\(\)\.SEW\.data\) \{\n        const flagged = \[\];/, 'sewer groups only with pipe results on');
  assert.match(mp, /PIPE_RESULTS \? 'No sewer on its path reaches 90%[^']*' : `No tabled facility applies\. \$\{PIPES_NOT_ASSESSED\}\.`/);
  assert.match(U.PIPES_NOT_ASSESSED, /not assessed/);
  assert.match(src('dca-tab.js'), /sewer pipes not assessed: pipe-by-pipe results are off/);
});

test('the wastewater summary says "not assessed", never "no flags", while pipes are off', () => {
  const m = /const verdictWastewater = (\([\s\S]*?\n  \});/.exec(src('dev-verdict.js'));
  const fn = new Function(`return (${m[1]});`)();
  const v = fn({ noPath: false, toronto: false, pipesOff: true, pipeMm: null, pipePct: 0, psName: null, psPct: 0, plant: null, over: false, commitPct: 0 });
  assert.match(v.text, /sewer pipes not assessed/);
  assert.doesNotMatch(v.text, /No capacity flags/);
  assert.match(src('overview-tab.js'), /pipesOff: !root\.PeelUtil\.PIPE_RESULTS,/);
});

test('a model rebuild is a new scenario for every cache, and an early render cannot leave a stale model', () => {
  assert.match(src('masterplan.js'), /function scenarioKey\(\) \{[^\n]*\|g\$\{App\(\)\.state\.svcGen \|\| 0\}/);
  assert.match(src('svc-tab.js'), /App\(\)\.state\.svcGen = \(App\(\)\.state\.svcGen \|\| 0\) \+ 1;/);
  assert.match(src('masterplan.js'), /SD\(\)\.svcById\.has\(z\.id\)\)\.map\(z => z\.id\)/, 'lakeZones skips zones not yet in svcById');
  assert.match(src('svc-data.js'), /if \(App\(\)\.state\.svcModel && App\(\)\.state\.reports\) SvcTab\(\)\.renderSvcTab\(\);/);
});
