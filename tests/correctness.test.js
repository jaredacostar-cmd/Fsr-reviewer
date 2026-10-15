'use strict';
// Stage 1 (fix-correctness): each finding from the 2026-10-15 audit has a test here that would
// have caught it (items 1, 2 and 11 are in tests/no-template-leak.test.js and tests/site-scope.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const U = require('../js/util.js');

// ---- 3. Small systems ---------------------------------------------------------------------------
test('3. small systems: Inglewood (0.243 ML/d) reads 243 m³/d; large plants stay in ML/d', () => {
  assert.equal(U.SMALL_SYSTEM_MLD, 5);
  assert.ok(U.isSmallSystem(0.243));
  assert.ok(!U.isSmallSystem(518) && !U.isSmallSystem(350) && !U.isSmallSystem(0));
  assert.equal(U.capTxt(0.243, 0.243), '243 m³/d');
  assert.equal(U.capTxt(0.1, 0.243), '100 m³/d', 'flows at a small system are in m³/d too');
  assert.equal(U.capTxt(518, 518), '518 ML/d');
  assert.match(U.uCap(0.243, 0.243), /^243<span class="u">m³\/d<\/span>$/);
});

test('3. small systems sit in their own group and never set a shared chart scale', () => {
  const sp = src('js/svc-plants.js');
  assert.match(sp, /const main = rows\.filter\(r => !isSmallSystem\(r\.rated\)\), small = rows\.filter\(r => isSmallSystem\(r\.rated\)\);/);
  assert.match(sp, /const S0 = scaleOf\(main\.length \? main : rows\), S1 = scaleOf\(small\);/, 'the shared axis is computed from the large plants only');
  assert.match(sp, /Small systems <span class="muted small">own scale · capacity in m³\/d<\/span>/);
  assert.doesNotMatch(sp, /rated \$\{fmtNum\(r\.rated\)\} ML\/d/, 'tiles say m³/d for a small system');
  assert.match(src('js/overview-tab.js'), /<h4 class="ov-small-h">Small systems<\/h4>/);
  assert.match(src('js/timing.js'), /Small systems <small>capacity in m³\/d<\/small>/);
  for (const f of ['js/masterplan.js', 'js/svc-scope.js', 'js/tool-scope.js']) assert.match(src(f), /capTxt\(/, `${f} prints rated capacity through capTxt`);
});

// ---- 4. One basis per capacity figure -----------------------------------------------------------
test('4. a basis chip is one of {2025 metered (calibrated), design criteria, Master Plan}; "Mixed basis" is gone', () => {
  assert.deepEqual(U.BASIS_KEYS, ['metered', 'design', 'mp']);
  assert.deepEqual(U.BASIS_KEYS.map(U.basisLabel), ['2025 metered (calibrated)', 'design criteria', 'Master Plan']);
  for (const k of U.BASIS_KEYS) assert.match(U.basisChip(k), new RegExp(`data-basis="${k}"`));
  assert.match(U.basisChip('mixed'), /data-basis="design"/, 'an unknown kind never renders a fourth label');
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js'))) {
    const s = src(`js/${f}`);
    assert.doesNotMatch(s, /Mixed basis/, `js/${f} still says "Mixed basis"`);
    assert.doesNotMatch(s, /basisChip\('mixed'/, `js/${f} asks for a mixed basis chip`);
  }
});

test('4. every capacity row carries one basis (data-basis): plants, Overview bars, water rows, pumping stations, timing', () => {
  const sp = src('js/svc-plants.js');
  assert.match(sp, /<div class="cap-row" data-basis="\$\{r\.basis \|\| basisKey\}">/);
  assert.match(sp, /trows\.push\(`<tr data-basis="\$\{r\.basis \|\| basisKey\}">/);
  assert.match(sp, /<tr data-basis="design"\$\{rowA\(x\.a\.id, ''\)\}>/, 'pumping station rows: design criteria');
  assert.match(sp, /chart = capChartHTML\(rows, Y, \{ basis: bz \}\);/);
  assert.match(sp, /if \(bz === 'metered'\) for \(const r of rows\) \{ r\.v = \[r\.v\[0\] \+ r\.v\[1\], 0, r\.v\[2\], r\.v\[3\]\]; \}/, 'metered: existing is one segment (it holds built since the census), never census + metered blended');
  assert.match(src('js/overview-tab.js'), /<div class="ov-cap \$\{st\}" data-basis="\$\{bz\}">/);
  assert.match(src('js/water-tab.js'), /<tr data-basis="\$\{x\.basis\}">/);
  assert.match(src('js/water-tab.js'), /basis: 'mp', room:/, 'storage rows: Master Plan');
  assert.match(src('js/timing.js'), /<tr data-basis="\$\{f\.basis\}">/);
  assert.match(src('js/svc-tab.js'), /const wwBasis = \(\) => \(svcOpt\.ww === 'calibrated' \? 'metered' : 'design'\);/);
});

// ---- 5. Reserve vs shortfall ------------------------------------------------------------------------
test('5. room or over in signed words, never a bare negative', () => {
  assert.equal(U.roomWords(35), 'room 35 ML/d');
  assert.equal(U.roomWords(-103), 'over by 103 ML/d');
  assert.equal(U.roomWords(-0.5, 'ML'), 'over by 0.5 ML');
  assert.equal(U.reserveWords(29.3, 518), 'room to 100%: 29.3 ML/d');
  assert.equal(U.reserveWords(-12, 518), 'over 100% by 12 ML/d');
  assert.equal(U.reserveWords(0.141, 0.243), 'room to 100%: 141 m³/d');
  const sp = src('js/svc-plants.js');
  assert.match(sp, /const roomWord = 'Room to 100%';/);
  assert.match(sp, /<th class="n">At build-out<br><small>room or over<\/small><\/th>/);
  assert.match(sp, /`room \$\{u\(afterProposed\)\}/);
  assert.match(sp, /`<span class="over">over by \$\{u\(-afterProposed\)\}<\/span>`/);
  assert.doesNotMatch(sp, /short \$\{u\(/, 'no "short" beside a reserve');
  assert.doesNotMatch(sp, /Reserve \(D-5-1\)'/);
  assert.match(src('js/water-tab.js'), /window\.PeelUtil\.roomWords\(x\.room, x\.unit\)/);
  assert.doesNotMatch(src('js/water-tab.js'), /\$\{x\.room < 0 \? '−' : ''\}/);
  assert.match(src('js/demand-ui.js'), /v < 0 \? `over by \$\{fmt1\(-v\)\} \$\{unitTxt\}`/);
  for (const f of ['js/dev-detail.js', 'js/fsr.js', 'js/svc-data.js', 'js/tool-scope.js', 'js/reports.js']) assert.match(src(f), /reserveWords\(/, `${f}: reserve in words`);
});

// ---- 9. Capital status ------------------------------------------------------------------------------
test('9. planned works: capital-records status where matched, "not in capital records (…)" otherwise; never "status unknown"', () => {
  const mp = src('js/masterplan.js');
  assert.match(mp, /const CE = window\.PeelCapitalEA, e = id && CE && CE\.dcStatusOf \? CE\.dcStatusOf\(id\) : null;/);
  assert.match(mp, /\(capital records\)`;/);
  assert.match(mp, /return ` · not in capital records \(\$\{src\}\$\{st === 'paused' \? '; procurement paused' : ''\}\)`;/);
  assert.match(mp, /'council-approved February 2024' : 'DC schedule'/, 'G.E. Booth 2028 (no DC project number) names its source');
  assert.match(mp, /\|c\$\{window\.PeelCapitalEA && window\.PeelCapitalEA\.data && window\.PeelCapitalEA\.data\.loaded \? 1 : 0\}/, 're-computed once the capital records load');
  assert.match(src('js/capital-ea.js'), /const dcStatusOf = proj => \(proj && data\.capital \? dcIndex\(\)\.get\(proj\) \|\| null : null\);/);
  assert.equal(U.CAPITAL_STATUS.unknown, 'In the 2026 budget');
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'js'))) {
    const s = src(`js/${f}`).replace(/[Nn]ever "status unknown"/g, '');
    assert.doesNotMatch(s.replace(/EA_STATUS = \{[^}]*\}/, ''), /'[Ss]tatus unknown'/, `js/${f}`);
  }
});

// ---- 10. Pumping stations framing -----------------------------------------------------------------
test('10. pumping stations: screening note in the headline, peak wet and peak dry shown, method limits stated', () => {
  const sp = src('js/svc-plants.js');
  assert.match(sp, /<strong>Screening estimate: \$\{over\.length\} pumping station/);
  assert.match(sp, /at build-out peak wet \(design criteria, with I&amp;I on the traced area\)/);
  assert.match(sp, /≈\$\{Math\.round\(r\.wet\)\}% \(peak dry \$\{Math\.round\(r\.dry\)\}%\)/);
  assert.match(sp, /Trunk and local sewer methods are not separated here; the Region\\u2019s hydraulic model governs\./);
  assert.match(sp, /DUI\(\)\.miniBar\('<small>peak dry<\/small>', x\.dry,/, 'peak dry bars by default');
  assert.match(sp, /<th>Peak dry<br><small>design<\/small><\/th>/);
  assert.doesNotMatch(sp, /Peak dry \(reference\)/);
});

// ---- 6. Anticipated defined; the count lives in the Scenario control ---------------------------------
test('6. "Anticipated" carries its definition from js/layers.js wherever it appears', () => {
  const Ly = require('../js/layers.js');
  assert.equal(Ly.NOTE.anticipated, 'pre-consultation, block or precinct plan: no formal file yet');
  assert.match(src('js/overview-tab.js'), /lyTiles\.anticipated \? `<p class="small muted ly-def">Anticipated: \$\{esc\(root\.PeelLayers\.NOTE\.anticipated\)\}\.<\/p>`/);
  assert.match(src('js/growth-ui.js'), /u\.anticipated >= 0\.5 \? `<p class="small muted ly-def">Anticipated: \$\{esc\(Ly\.NOTE\.anticipated\)\}\.<\/p>`/);
  assert.match(src('js/svc-tab.js'), /Anticipated: \$\{esc\(A\.anticipated\)\}\./, 'and in the Scenario control beside the switch');
});

test('6. Count: committed only · + proposed · + anticipated, in the Scenario control; the chip shows it read-only', () => {
  const B = require('../js/layer-bar.js');
  assert.deepEqual(B.COUNT_OPTS, [['committed', 'committed only'], ['buildout', '+ proposed'], ['all', '+ anticipated']]);
  const st = src('js/svc-tab.js');
  assert.match(st, /<span class="muted small">Count:<\/span>\$\{LB\.COUNT_OPTS\.map/);
  assert.match(st, /\[\['all', 'All'\], \['remaining', 'Left to build'\]\]/, '"left to build" keeps its own switch');
  assert.doesNotMatch(src('js/topbar.js'), /data-scen-layer|nextBasis\(/, 'no count toggles in the top bar');
  for (const b of ['committed', 'buildout', 'all', 'remaining']) assert.match(B.scenarioChipHTML({ basis: b, flows: 'x', criteria: 'y', count: 'tree', outside: 'z' }), new RegExp(`Count: ${B.countLabel(b).replace(/[+]/g, '\\+')}`));
});

// ---- 7. Permit check -------------------------------------------------------------------------------
test('7. permit check: pass / fail per municipality (fail beyond 25%); in Records › Checks with a headline caveat', () => {
  // The audit's figures: Mississauga 6,257 vs Region 1,734; Brampton 690 vs 4,602.
  const rows = U.permitCheckRows([{ m: 'Mississauga', app: 6257, region: 1734 }, { m: 'Brampton', app: 690, region: 4602 }, { m: 'Caledon', app: 1100, region: 1000 }, { m: 'Peel', app: null, region: 7336 }]);
  assert.deepEqual(rows.map(r => [r.m, r.pass]), [['Mississauga', false], ['Brampton', false], ['Caledon', true]]);
  assert.equal(U.permitCheckRows([{ m: 'X', app: 125, region: 100 }])[0].pass, true, '25% exactly passes');
  assert.equal(U.permitCheckRows([{ m: 'X', app: 126, region: 100 }])[0].pass, false);
  const cv = src('js/census-view.js');
  assert.doesNotMatch(cv, /<p class="small">Check: units on this app's building permit records/, 'gone from Growth › Census & 2051');
  assert.match(cv, /Permit counts differ from Region figures for \$\{esc\(list\)\}; see \$\{DV\(\)\.homeLine\('records', 'Records › Checks'\)\}/);
  assert.match(cv, /<span class="fr-b \$\{r\.pass \? 'fr-ok' : 'fr-stale'\}">\$\{r\.pass \? 'Pass' : 'Fail'\}<\/span>/);
  assert.match(src('js/demand-ui.js'), /root\.PeelCensusView\.permitCheckHTML\(\)/, 'listed with the model checks');
  assert.match(src('js/growth-ui.js'), /\$\{hlP\(head\)\}\$\{caveat\}/, 'caveat under the Growth pipeline headline');
  assert.match(src('js/overview-tab.js'), /<div class="ov-top">\$\{hlP\(hl\)\}\$\{permitCaveat\}/, 'and under the Overview headline');
});

// ---- 8. 2051 comparison basis -----------------------------------------------------------------------
test('8. the 2051 comparison states its source (document, date, draft or final) and its basis', () => {
  const F = require('../data/peel-reports.json').forecast2051;
  assert.match(F.title, /Land Needs Assessment Report Update/);
  assert.equal(F.status, 'draft');
  assert.equal(F.date, 'August 2024');
  assert.ok(F.pages && F.url);
  const cv = src('js/census-view.js');
  assert.match(cv, /const srcLine = `Source: \$\{esc\(F\.title\)\} \(\$\{esc\(F\.date \|\| 'date not stated'\)\}, \$\{esc\(F\.status \|\| 'status not stated'\)\}; \$\{esc\(F\.pages \|\| ''\)\}\)`;/);
  assert.match(cv, /Pipeline people are at Peel design criteria \(persons per unit\); the allocation is a population forecast/);
});
