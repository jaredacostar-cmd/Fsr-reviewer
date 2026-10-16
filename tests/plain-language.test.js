'use strict';
// Design bundle 5 — plain language and charts: the scenario chip says "Default" or "n changes"; a
// glossary underlines the first terms in each answer; answers in plain words with IDs and codes on
// the rows; every chart titled with its unit; the DC timing chart leads with late and close projects;
// the forecast adds up against the pipeline; the full table pins the facility and keeps one unit per
// row; capacity bars labelled; zeros never coloured.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const B = require('../js/layer-bar.js');
const G = require('../js/glossary.js');
const PN = require('../js/panel.js');

test('scenario chip: "Default" when nothing is changed, "n changes" otherwise; the control lists every setting', () => {
  const base = { basis: 'all', flows: '2025 metered', md: 'design', div: 'off', outside: 'nearest', year: 2026, yearDefault: 2026, criteria: 0, count: 'tree count', expansions: 'on' };
  const rows = B.scenarioSettings(base);
  assert.equal(B.scenarioChipText(rows), 'Default');
  assert.deepEqual(rows.map(r => r.label), ['Count', 'Units', 'Map results for', 'Wastewater flows', 'Water maximum day', 'Diversion', 'Outside mapped areas', 'Design criteria', 'Units per development', 'Plant expansions']);
  const two = B.scenarioSettings({ ...base, basis: 'committed', criteria: 2 });
  assert.equal(B.scenarioChipText(two), '2 changes');
  assert.equal(B.scenarioChipText(B.scenarioSettings({ ...base, year: null })), '1 change', 'build-out is a change from this year');
  const list = B.scenarioListHTML(two);
  assert.match(list, /<li class="chg"><span class="muted">Count<\/span> <b>approved only<\/b> <span class="small scen-chg">changed · default \+ pre-application<\/span><\/li>/);
  assert.match(list, /<li class="chg"><span class="muted">Design criteria<\/span> <b>2 edited<\/b>/);
  assert.match(list, /<li><span class="muted">Wastewater flows<\/span> <b>2025 metered<\/b> <span class="muted small">default<\/span><\/li>/);
  assert.match(B.scenarioChipHTML(base), /<span class="tb-scen-t">Default<\/span> ▾<\/button>$/);
  // The panels' chip and the control use the same list.
  assert.match(src('js/panel.js'), /txt = p && p\.settings \? p\.text : 'Default'/);
  assert.match(src('js/svc-tab.js'), /<p class="scen-k">This scenario: \$\{esc\(scn\.text\)\}<\/p>\$\{LB\.scenarioListHTML\(scn\.settings\)\}/);
  assert.match(src('js/topbar.js'), /yearDefault: root\.PeelMapMarkers \? root\.PeelMapMarkers\.THIS_YEAR : null/);
  assert.match(src('js/tree-counts.js'), /tree: 'Each planning file once \(tree\)'/, 'no "Tree (new)"');
});

test('glossary: the first use of a term is underlined (three at most a panel), never inside a tag or a button', () => {
  for (const [k, name, re, def, group] of G.TERMS) { assert.ok(k && name && re instanceof RegExp && def.length > 30 && group, k); }
  const seen = new Set();
  const a = G.mark('G.E. Booth reaches its 90% expansion trigger ≈2028; firm capacity and firm again.', seen);
  assert.match(a, /<span class="gl" data-gl="trigger" tabindex="0">90% expansion trigger<\/span>/);
  assert.equal((a.match(/data-gl="firm"/g) || []).length, 1, 'once');
  assert.doesNotMatch(G.mark('<button type="button" title="firm capacity">firm capacity</button>'), /class="gl"/, 'never in a button or an attribute');
  assert.equal(G.mark('<span title="peak wet weather">x</span>'), '<span title="peak wet weather">x</span>');
  const many = G.mark('firm capacity, rated capacity, the 90% trigger, build-out, maximum day', new Set());
  assert.equal((many.match(/class="gl"/g) || []).length, G.MAX);
  // In every panel's answer and figures, and on the pages (not the glossary itself).
  assert.match(src('js/panel.js'), /const seen = new Set\(\), gl = h => \(root\.PeelGlossary \? root\.PeelGlossary\.mark\(h, seen\) : h\);/);
  assert.match(src('js/ws-pages.js'), /root\.PeelGlossary && m\.id !== 'glossary' \? root\.PeelGlossary\.mark\(h, seen\) : h/);
  // The Glossary page: Home › Reference, all terms.
  const p = G.page();
  assert.equal(p.id, 'glossary');
  for (const [k] of G.TERMS) assert.match(p.mid, new RegExp(`id="gl-${k}"`));
  assert.match(src('js/workspaces.js'), /glossary: \{ label: 'Glossary', what: 'The terms in plain words' \}/);
  assert.match(src('index.html'), /<script src="js\/glossary\.js\?v=__BUILD__"><\/script>/);
  assert.match(src('sw.js'), /'js\/glossary\.js',/);
  assert.match(src('js/glossary.js'), /<button type="button" class="btn small link" data-ws-page="glossary">All terms →<\/button>/);
});

test('plain words: no "screen late", project IDs on the rows, file types and I&I in words', () => {
  for (const f of ['js/dca-tab.js', 'js/dc-cost.js']) assert.doesNotMatch(src(f), /screens? late\b(?! \(capacity)|screen in time/, f);
  const d = src('js/dca-tab.js');
  assert.match(d, /\{ tone: 'over', text: `\$\{adv\.length\} late` \}/);
  assert.match(d, /\$\{esc\(r\.short \|\| r\.name\)\}<small>\$\{r\.pid \? `project \$\{esc\(r\.pid\)\} · ` : ''\}in service/);
  assert.match(d, /without the <strong>\$\{esc\(big\.short \|\| big\.name\)\}<\/strong>/, 'the plain name in the sentence');
  // Application types in words at a site.
  assert.equal(PN.typesText(['OPA ZBA Subdivision', 'Pre Consultation']), 'Official plan, zoning and subdivision · pre-consultation');
  assert.equal(PN.typesText(['SITE PLAN', 'Site Plan Approval', 'RESIDENTIAL']), 'Site plan · residential');
  assert.match(src('js/panel.js'), /const types = typesText\(p\.types\);/);
  // I&I in words on the figure.
  const D = require('../js/demand.js');
  assert.equal(D.iiPlain(2.106), 'includes 2.1 L/s of rain and groundwater (I&I: 8.1 ha at 0.26 L/s/ha)');
  assert.match(src('js/overview-tab.js'), /'wastewater, peak wet weather', cb\.wastewater\.infiltration > 0 \? esc\(D\.iiPlain\(/);
  // The calibration factor said as a comparison.
  assert.match(src('js/svc-capacity.js'), /measured \$\{x\.c\.f\.toFixed\(2\)\} times the model's flow/);
  assert.match(src('js/svc-capacity.js'), /label: `\$\{SD\(\)\.PLANT_SHORT\[x\.pl\]\}: measured ÷ modelled`/);
  // The capacity answer: the limit in words.
  assert.match(src('js/svc-capacity.js'), /const LIMIT_WORDS = \{ '100% firm': 'its firm capacity', '90% trigger': 'its 90% expansion trigger'/);
  // Old pipes: "sewer runs", no "runs of one main"; a verdict chip, not a count.
  const w = src('js/workspaces.js');
  assert.doesNotMatch(w, /runs of one main/);
  assert.match(w, /status: !list\.length \? \{ tone: 'room', text: 'None' \} : risky \? \{ tone: 'tight', text: `\$\{fmtNum\(risky\)\} moderate risk` \} : null,/);
  // This week: the count is in the answer, not a chip.
  assert.match(src('js/ws-pages.js'), /name: 'What changed since the last update\?', status: null,/);
  // A drill-down's area type sits in the eyebrow.
  assert.match(src('js/ws-pages.js'), /<span class="page-kind">\$\{esc\(kind\(n\)\)\}<\/span>/);
});

test('DC timing chart: late and close projects first, by short name + ID, then "N more in time"', () => {
  const s = src('js/dc-cost.js');
  // The rule (pure, copied out of the browser module): late = in service after the run-out; close =
  // in service in the two years before it.
  const body = s.slice(s.indexOf('  const CLOSE_YEARS = 2;'), s.indexOf('  // Timing chart: capacity runs out vs online year'));
  const { timingOf, timingRows } = new Function(`${body}; return { timingOf, timingRows };`)();
  assert.equal(timingOf({ outY: 2028, y: 2037 }), 'late');
  assert.equal(timingOf({ outY: 2028, y: 2028 }), 'close');
  assert.equal(timingOf({ outY: 2034, y: 2028 }), 'ok');
  const list = [{ k: 'a', outY: null, y: 2031, bo: 9 }, { k: 'b', outY: 2034, y: 2033, bo: 1 }, { k: 'c', outY: 2028, y: 2037, bo: 5 }, { k: 'd', outY: 2040, y: 2030, bo: 3 }, { k: 'e', outY: 2045, y: 2030, bo: 2 }];
  const r = timingRows(list, 3);
  assert.deepEqual(r.rows.map(x => x.k), ['c', 'b', 'a'], 'late, close, then the largest impact');
  assert.equal(r.more, 2);
  assert.match(s, /\$\{more > 0 \? ` · <strong>\$\{more\} more<\/strong> in time` : ''\}/);
  assert.match(s, /class="dca-ax" text-anchor="middle">after \$\{x1\}<\/text>/, '"after 2051" on the axis');
  assert.match(s, /style="max-width:\$\{W\}px"/, 'drawn at its size, never scaled up');
  assert.match(s, /tag: `\$\{pl\} to \$\{o\.mld\} ML\/d\$\{o\.id \? ` · \$\{o\.id\}` : ''\}`/);
  assert.match(src('css/app.css'), /\.dca-chart \.dca-lab \{ fill: var\(--text-primary\); font-size: var\(--fs-2\); \}/);
});

test('every chart is titled with its unit', () => {
  const files = ['js/overview-tab.js', 'js/plan-tables.js', 'js/svc-capacity.js', 'js/svc-scope.js', 'js/demand-ui.js', 'js/growth-ui.js', 'js/ws-pages.js', 'js/dc-cost.js', 'js/timing.js'];
  for (const f of files) {
    const s = src(f);
    const titles = [...s.matchAll(/class="[^"]*\bpnl-chart-t\b[^"]*"[^>]*>([\s\S]*?)<\/(?:p|h3)>/g)];
    assert.ok(titles.length, `${f}: a chart title`);
    for (const m of titles) assert.match(m[1], /class="pnl-chart-u">\(/, `${f}: ${m[1].slice(0, 60)}`);
  }
});

test('Growth › Forecast: homes built adding up, against the unbuilt pipeline, 2031 and 2041 marked', () => {
  const T = require('../js/timing.js');
  assert.deepEqual(T.cumulative([{ year: 2026, low: 1, likely: 2, high: 3 }, { year: 2027, low: 2, likely: 3, high: 5 }]).map(r => [r.year, r.low, r.likely, r.high]), [[2026, 1, 2, 3], [2027, 3, 5, 8]]);
  const ys = []; for (let y = 2026; y <= 2052; y++) ys.push(y);
  assert.deepEqual(T.yearTicks(ys), [2026, 2031, 2036, 2041, 2046, 2051], '2052 no longer collides with 2051');
  const s = src('js/timing.js');
  assert.match(s, /Unbuilt pipeline: \$\{fmtNum\(Math\.round\(pipe\)\)\} units/);
  assert.match(s, /const marks = \[2031, 2041\]\.map/);
  assert.match(s, /chart: items\.length \? timingChartSVG\(fc, unbuilt\) : '',/);
  assert.match(s, /label: 'the estimate learns from'/, 'no bare "calibration" card');
});

test('full table: Facility pinned, one Unit column, Reaches as one timeline, Impact folds, cards on a phone', () => {
  const s = src('js/svc-capacity.js');
  assert.match(s, /<th scope="row" class="ft-pin" data-l="Facility">/);
  assert.match(s, /<td class="ft-u" data-l="Unit">\$\{unitOf\(r\)\}<\/td>/);
  assert.match(s, /<details class="ft-imp"><summary>/);
  assert.match(s, /<th rowspan="2">Reaches 80 · 90 · 100%<\/th>/);
  assert.doesNotMatch(s.slice(s.indexOf('function fullTableHTML'), s.indexOf('function render()')), /qty\(r,|Reaches 80%<\/th>/, 'no unit in each cell; one Reaches column');
  // The thresholds already passed are said once.
  const body = s.slice(s.indexOf('  function reachText('), s.indexOf('  // The same as a 120 px timeline'));
  const reachText = new Function(`${body}; return reachText;`)();
  assert.equal(reachText({ c80: 'today', c90: 'today', c100: 'today' }, 2051), 'past 100% now');
  assert.equal(reachText({ c80: 'today', c90: 2028, c100: 2030 }, 2051), 'past 80% now · 90% 2028 · 100% 2030');
  assert.equal(reachText({ c80: 2035, c90: null, c100: null }, 2051), '80% 2035 · 90% after 2051 · 100% after 2051');
  const css = src('css/app.css');
  assert.match(css, /\.cap-full \.ft-pin \{ position: sticky; left: 0;/);
  assert.match(css, /\.cap-full tbody td::before \{ content: attr\(data-l\);/);
});

test('figures: a zero is never coloured, n/a is never a figure; the people split is a small bar', () => {
  const h = PN.html({ key: 'x', head: { name: 'X' }, answer: 'a', figures: [{ v: 0, u: 'tight', label: 'tight', tone: 'tight' }, { v: 'n/a', label: 'pipe' }, { v: 3, u: 'over', label: 'over', tone: 'over' }] });
  assert.match(h, /<div class="pnl-fig"><b>0<\/b>/);
  assert.doesNotMatch(h, />n\/a</);
  assert.match(h, /<div class="pnl-fig t-over"><b>3<\/b>/);
  assert.match(src('js/overview-tab.js'), /<span class="fig-bar">\$\{LB\.barHTML\(\{ small: true, segments:/);
  assert.match(src('css/app.css'), /\.pnl-fig \.pnl-l \{ font-size: var\(--fs-2\); color: var\(--text-primary\); \}/);
});

test('capacity bars: % on the bar, the 90% and 100% marks labelled, one-line legend, one word for 100%', () => {
  const k = { cap: 100, existing: 50, built: 5, committed: 70, buildout: 120, trigger: 0.9, unit: 'ML/d' };
  const h = B.capacityBarHTML(k);
  assert.match(h, /<span class="cb-v" style="left:[\d.]+%">70%<\/span><span class="cb-v cb-bo" style="left:[\d.]+%">120%<\/span>/);
  assert.match(h, /<span class="cb-t" style="left:[\d.]+%">90%<\/span><span class="cb-t cb-100" style="left:[\d.]+%">100%<\/span>/);
  assert.match(B.capacityBarHTML({ ...k, buildout: 75 }), /<span class="cb-v" style="left:[\d.]+%">70% → 75%<\/span>/, 'one label when close');
  const L = B.capLegendHTML();
  assert.match(L, /^<div class="ly-legend one-line">/);
  assert.match(L, /past capacity/); assert.doesNotMatch(L, /100% rated|beyond rated|90% trigger/, 'the marks are labelled on the bar');
  assert.match(B.legendHTML(['rated']), /100% capacity/, 'one word for 100%, firm or rated');
  assert.match(src('js/svc-capacity.js'), /\$\{labelledBar\(sorted\[0\]\)\}/);
  for (const f of ['js/svc-capacity.js', 'js/overview-tab.js', 'js/svc-scope.js']) assert.doesNotMatch(src(f), /'trigger', 'rated', 'over'\]/, f);
  // A clearer step between committed and in review, in both themes.
  const css = src('css/app.css');
  assert.match(css, /--ly-committed: #7fa6ee;/);
  assert.match(css, /:root\[data-theme="light"\] \{ --ly-track: #e4e3dc; --ly-trigger: #1b1b1a; --ly-committed: #5f8fe0; --ly-proposed: #c2d6f7;/);
});

test('allocations: an over goes left of a zero line; a small system in m³/d; nearly full by the 85% rule', () => {
  const d = src('js/demand-ui.js');
  assert.match(d, /const allocTone = x => \(x\.after < 0 \? 'over' : x\.cap && x\.cap\.rated > 0 && \(x\.lim - x\.after\) \/ x\.cap\.rated >= 0\.85 \? 'tight' : 'room'\);/);
  assert.match(d, /<i class="rb-zero" style="left:\$\{z\.toFixed\(1\)\}%"><\/i>/);
  assert.match(d, /\{ tone: 'over', text: `\$\{short\.length\} past the trigger` \}/, 'no "1 short" beside "no allocations"');
  assert.match(src('js/overview-tab.js'), /c\.util\.bo >= 0\.85 \? 'near'/, 'the same 85% rule the Overview bars use');
});

