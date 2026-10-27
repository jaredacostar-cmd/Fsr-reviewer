'use strict';
/* Verdict-card tests (Phase 3, Worker C): the pure verdict derivation extracted from
 * js/app.js, plus structural assertions that each analysis tab render honours the
 * development scope ("one home per number").
 *
 * js/app.js is a browser IIFE, so — as in tests/layout-shell.test.js — these tests read
 * it as source: structural assertions plus real unit tests of the pure logic extracted
 * from it (verdictWater, verdictWastewater, verdictDc, verdictMilestone, firstSentence).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Phase 6: js/app.js was split into js/util.js + 46 area modules. Structural
// assertions read the whole js/ tree (app core + modules) as one source.
const JS_DIR = path.join(__dirname, '..', 'js');
const APP = fs.readdirSync(JS_DIR).filter(f => f.endsWith('.js')).sort()
  .map(f => fs.readFileSync(path.join(JS_DIR, f), 'utf8')).join('\n');

// Extract a `const name = (args) => { ... };` and evaluate it standalone (pure only).
function extractFn(name) {
  const m = new RegExp(`const ${name} = (\\([\\s\\S]*?\\n  \\});`).exec(APP);
  assert.ok(m, `const ${name} not found in js/`);
  return new Function(`return (${m[1]});`)();
}

const verdictWater = extractFn('verdictWater');
const verdictWastewater = extractFn('verdictWastewater');
const verdictDc = extractFn('verdictDc');
const verdictMilestone = extractFn('verdictMilestone');
const firstSentence = extractFn('firstSentence');
const pathLine = extractFn('pathLine');
const reliedOn = extractFn('reliedOn');

test('firstSentence: keeps one sentence, passes through text without a period', () => {
  assert.equal(firstSentence('Under review since Oct 3, 2026 — foo bar. Second sentence here.'), 'Under review since Oct 3, 2026 — foo bar.');
  assert.equal(firstSentence('No activity recorded'), 'No activity recorded');
  assert.equal(firstSentence('  Padded. Rest.  '), 'Padded.');
  assert.equal(firstSentence(''), '');
});

test('verdictWater: zone share, outside zones, no zone', () => {
  const ok = verdictWater({ zone: 'Zone 5', sharePct: 3, outside: false });
  assert.equal(ok.tone, 'ok');
  assert.match(ok.text, /Zone 5/);
  assert.match(ok.text, /3%/);
  const out = verdictWater({ zone: 'Zone 5', sharePct: 3, outside: true });
  assert.equal(out.tone, 'warn');
  assert.match(out.text, /screening estimate/);
  const none = verdictWater({ zone: null, sharePct: 0, outside: false });
  assert.equal(none.tone, 'warn');
  assert.match(none.text, /No pressure zone/);
});

test('verdictWastewater: over-capacity is bad, 90%+ is warn, clear is ok', () => {
  const base = { noPath: false, toronto: false, pipeMm: 450, pipePct: 45, psName: 'PS One', psPct: 60, plant: 'G.E. Booth', reserve: '12.4', usePct: 2, over: false, commitPct: 70 };
  const ok = verdictWastewater(base);
  assert.equal(ok.tone, 'ok');
  assert.match(ok.text, /450 mm at 45%/);
  assert.match(ok.text, /PS One ≈60% of firm/);
  assert.match(ok.text, /G\.E\. Booth reserve 12\.4 ML\/d/);
  assert.equal(verdictWastewater({ ...base, pipePct: 100 }).tone, 'bad');
  assert.equal(verdictWastewater({ ...base, psPct: 101 }).tone, 'bad');
  assert.equal(verdictWastewater({ ...base, over: true }).tone, 'bad');
  assert.match(verdictWastewater({ ...base, over: true }).text, /screens over rated capacity/);
  assert.equal(verdictWastewater({ ...base, pipePct: 92 }).tone, 'warn');
  assert.equal(verdictWastewater({ ...base, commitPct: 90 }).tone, 'warn');
  assert.equal(verdictWastewater({ noPath: true }).tone, 'warn');
  const tor = verdictWastewater({ ...base, toronto: true });
  assert.equal(tor.tone, 'ok');
  assert.match(tor.text, /Toronto/);
});

test('verdictDc: gap is bad, need-by is warn, otherwise ok', () => {
  assert.equal(verdictDc({ loading: true }).tone, 'warn');
  const gap = verdictDc({ loading: false, gap: true, needBy: 2029, nearby: 0 });
  assert.equal(gap.tone, 'bad');
  assert.match(gap.text, /2029/);
  const nb = verdictDc({ loading: false, gap: false, needBy: 2028, nearby: 0 });
  assert.equal(nb.tone, 'warn');
  assert.match(nb.text, /2028/);
  const near = verdictDc({ loading: false, gap: false, needBy: 0, nearby: 2 });
  assert.equal(near.tone, 'ok');
  assert.match(near.text, /2 planned works nearby/);
  assert.match(verdictDc({ loading: false, gap: false, needBy: 0, nearby: 0 }).text, /no planned works nearby/);
});

test('pathLine: from the site, the stations in flow order with their firm %, then the plant and its reserve; how the outlet was set', () => {
  const two = pathLine({ stations: [{ name: 'Lisgar', pct: 85 }, { name: 'McVean Drive', pct: 102 }], plant: 'G.E. Booth', reserve: '29.0', over: false, outlet: null });
  assert.deepEqual(two, { tone: 'bad', text: 'Site → Lisgar (85% of firm) → McVean Drive (102% of firm) → G.E. Booth, 29.0 ML/d reserve', outlet: 'Automatic' }, 'a station at 100%+ is bad');
  assert.equal(pathLine({ stations: [{ name: 'Lisgar', pct: 92 }], plant: 'Clarkson', reserve: '40.1', over: false }).tone, 'warn', '90%+ is warn');
  const ok = pathLine({ stations: [], plant: 'Clarkson', reserve: '40.1', over: false, outlet: 'confirmed' });
  assert.deepEqual(ok, { tone: 'ok', text: 'Site → Clarkson, 40.1 ML/d reserve', outlet: 'Confirmed' }, 'no station: the site to the plant');
  const over = pathLine({ stations: [{ name: 'Lisgar', pct: 40 }], plant: 'G.E. Booth', reserve: '-3.2', over: true, outlet: 'set' });
  assert.equal(over.tone, 'bad', 'no reserve is bad');
  assert.match(over.text, /→ G\.E\. Booth, no reserve \(over its rated capacity\)$/);
  assert.equal(over.outlet, 'Set by hand');
  const tor = pathLine({ stations: [{ name: 'Malton', pct: 60 }], plant: 'Toronto', toronto: true, reserve: null, over: false });
  assert.equal(tor.text, 'Site → Malton (60% of firm) → the City of Toronto system');
  assert.equal(tor.tone, 'ok');
  assert.equal(pathLine({ stations: [], plant: 'Clarkson', reserve: null, over: false }).text, 'Site → Clarkson', 'no capacity figure: the plant named, no reserve');
  assert.equal(pathLine({ stations: [{ name: 'Lisgar', pct: 50 }], plant: null, toronto: false }), null, 'no plant, no path line');
  // On a development's Overview (the map and the site page's Overview): under Wastewater, Review → only
  // when the review queue lists it, and only once the DC impact model is worked out (never built here).
  const o = fs.readFileSync(path.join(JS_DIR, 'overview-tab.js'), 'utf8');
  assert.match(o, /stations: f\.sps\.filter\(s => s\.firm > 0\)\.map\(s => \(\{ name: DD\(\)\.psName\(s\.a\), pct: Math\.round\(s\.wet \/ s\.firm \* 100\) \}\)\), plant, toronto: f\.pl === 'Toronto', reserve: f\.cap \? fmt1\(f\.reserve\) : null, over: !!\(f\.cap && f\.reserve <= 0\), outlet: DO && DO\.recordOf \? \(DO\.recordOf\(p\) \|\| \{\}\)\.mode : null/);
  assert.match(o, /const queued = pathTo && IM && IM\.current && IM\.current\(\) && DO && DO\.queue \? \(\(DO\.queue\(\) \|\| \{\}\)\.all \|\| \[\]\)\.some\(x => x\.p\.key === p\.key\) : false;/);
  assert.match(o, /<button type="button" class="btn small link" data-ws-page="outlets" data-dvo="pick-dev" data-dvo-key="\$\{esc\(p\.key\)\}">Review →<\/button>/);
  assert.match(o, /svcRow\(`🚰 Wastewater[^\n]+\n\s+\.\.\.\(pathTo \? \[\{ tone: TONE\[pathTo\.tone\], html: `<div class="pnl-r-top"><span class="pnl-r-name">Path to the plant<\/span>/, 'right under Wastewater');
  assert.doesNotMatch(o, /DO\.load\(|IM\.model\(|PeelDcImpact\.model\(/, 'the Overview never loads the outlets nor builds the DC impact model');
  // Both handlers are document-wide: the page opens and the editor picks the development, in either order.
  assert.match(fs.readFileSync(path.join(JS_DIR, 'dev-outlets.js'), 'utf8'), /if \(act === 'pick-dev'\) \{ S\.sel = t\.dataset\.dvoKey; store\.set\('dvoSel', S\.sel\);/);
  // The stations come in the order the flow reaches them.
  assert.match(fs.readFileSync(path.join(JS_DIR, 'svc-data.js'), 'utf8'), /\.filter\(a => spsOf\(a\) && route\.has\(MA\(\)\.stationPipe\(a\)\)\)\.sort\(\(a, b\) => route\.get\(MA\(\)\.stationPipe\(a\)\) - route\.get\(MA\(\)\.stationPipe\(b\)\)\)/);
});

test('reliedOn: the DC projects a development relies on, one per project, late first, the first n', () => {
  const ln = (p, y) => ({ kind: 'line', ln: { p }, y });
  const needs = [
    { status: 'gap', relief: [ln('25-2269', 2031)] },
    { status: 'planned', relief: [ln('25-2269', 2031)] },             // the same project, in time here: still late
    { status: 'planned', relief: [{ kind: 'step', y: 2029, step: { proj: '22-1005' } }] },
    { status: 'planned', relief: [{ kind: 'fac', y: 2033, items: [{ what: 'pumps' }, { what: 'forcemain', proj: '24-2110' }] }] },
    { status: 'ok', relief: [ln('20-9999', 2027)] },                   // room: not relied on
    { status: 'check', relief: [ln('20-8888', 2027)] },
    { status: 'gap', relief: [] },                                      // no relief listed: no project
    { status: 'planned', relief: [{ kind: 'line', ln: { c: 'C-7' }, y: 2035 }] },
  ];
  assert.deepEqual(reliedOn(needs), [{ key: '25-2269', name: null, y: 2031, late: true }, { key: '22-1005', name: null, y: 2029, late: false }, { key: '24-2110', name: null, y: 2033, late: false }]);
  assert.deepEqual(reliedOn(needs, 10).map(x => x.key), ['25-2269', '22-1005', '24-2110', 'C-7'], 'a component number when no project number');
  assert.deepEqual(reliedOn([{ status: 'planned', relief: [{ kind: 'line', ln: {}, y: 2030 }, ln('23-1', 2032)] }]), [{ key: '23-1', name: null, y: 2032, late: false }], 'the first relief with a number');
  assert.deepEqual(reliedOn(null), []);
  // Each by its name, as the relief carries it: a DC main's own, else the facility's (a plant step, a
  // facility's item); a later constraint on the same project fills a name the first one lacked.
  const plant = { name: 'G.E. Booth Water Resource Recovery Facility' };
  assert.deepEqual(reliedOn([{ status: 'gap', relief: [{ kind: 'step', y: 2037, fc: plant, step: { proj: '25-2945', mld: 600 } }] }]), [{ key: '25-2945', name: 'G.E. Booth Water Resource Recovery Facility', y: 2037, late: true }], 'a plant step: the plant');
  assert.deepEqual(reliedOn([{ status: 'planned', relief: [{ kind: 'line', ln: { p: '24-1', n: 'Mayfield Road trunk sewer' }, y: 2030 }] }]), [{ key: '24-1', name: 'Mayfield Road trunk sewer', y: 2030, late: false }], 'a DC main: its name');
  assert.deepEqual(reliedOn([{ status: 'planned', relief: [{ kind: 'fac', y: 2033, fc: { name: 'Lisgar PS' }, items: [{ what: 'pumps', proj: '24-2110' }] }] }]).map(x => x.name), ['Lisgar PS'], 'a facility item: the facility');
  assert.deepEqual(reliedOn([{ status: 'planned', relief: [ln('23-1', 2032)] }, { status: 'gap', relief: [{ kind: 'line', ln: { p: '23-1', n: 'Queen St main' }, y: 2032 }] }]), [{ key: '23-1', name: 'Queen St main', y: 2032, late: true }]);
  // The Overview's Infrastructure coming row names them first, by number and name (as the search lists a
  // DC project), and one late makes the row something to check, whatever the connection's verdict.
  const o = fs.readFileSync(path.join(JS_DIR, 'overview-tab.js'), 'utf8');
  assert.match(o, /relTxt = rel\.length \? `Relies on \$\{rel\.map\(x => `\$\{esc\(x\.key\)\}\$\{x\.name \? ` – \$\{esc\(x\.name\)\}` : ''\} \(\$\{x\.late \? 'late' : 'in time'\}\)`\)\.join\(', '\)\} · ` : ''/);
  assert.match(fs.readFileSync(path.join(JS_DIR, 'search-filter.js'), 'utf8'), /label: `DC project \$\{ln\.p \|\| ln\.c\}\$\{ln\.n \? ` – \$\{ln\.n\}` : ''\}`/, 'the search’s own name for it');
  assert.match(o, /const infTone = dcv\.tone === 'ok' && rel\.some\(x => x\.late\) \? 'warn' : dcv\.tone;/);
  assert.match(o, /\{ tone: TONE\[infTone\], attrs: \{ 'data-at': 'dca:timing' \}, html: `<div class="pnl-r-top"><span class="pnl-r-name">🏗 Infrastructure coming<\/span>\$\{PN\.chip\(\{ tone: TONE\[infTone\], text: infTone === 'ok' \? 'OK' : infTone === 'warn' \? 'Check' : 'Short' \}\)\}/);
  assert.match(o, /<small class="pnl-r-line">\$\{relTxt\}\$\{fmtNum\(nWorks\)\} DC work/);
});

test('verdictMilestone: withdrawn, done, appeal, stalled, next', () => {
  assert.deepEqual(verdictMilestone({ withdrawn: true }).tone, 'warn');
  assert.match(verdictMilestone({ withdrawn: true }).text, /Withdrawn/);
  assert.match(verdictMilestone({ withdrawn: false, done: true }).text, /built out/);
  const ap = verdictMilestone({ withdrawn: false, done: false, appeal: true, stalled: null, next: 'Approved' });
  assert.equal(ap.tone, 'warn');
  assert.match(ap.text, /Under appeal/);
  assert.match(ap.text, /Approved/);
  const st = verdictMilestone({ withdrawn: false, done: false, appeal: false, stalled: '2.3 yrs', next: 'Permit issued' });
  assert.equal(st.tone, 'warn');
  assert.match(st.text, /2\.3 yrs/);
  const nx = verdictMilestone({ withdrawn: false, done: false, appeal: false, stalled: null, next: 'Approved' });
  assert.equal(nx.tone, 'ok');
  assert.match(nx.text, /Next milestone: Approved/);
  assert.match(verdictMilestone({ withdrawn: false, done: false, appeal: false, stalled: null, next: '—' }).text, /Next milestone: —/);
});

test('scope wiring: every scoped analysis tab render checks the development scope first', () => {
  // Phase 4: the Growth tab is scope-free by design (a site's units live on the
  // Development tab), so renderGrowth is not in this list.
  // (the Servicing tab's body is buildSvcTab, which renderSvcTab runs with the developments indexed)
  assert.match(APP, /function renderSvcTab\(\) \{[\s\S]*?buildSvcTab\(bc\)/);
  for (const fn of ['renderOverview', 'buildSvcTab', 'renderDca']) {
    const m = new RegExp(`function ${fn}\\([\\s\\S]*?\\n  \\}`).exec(APP);
    assert.ok(m, `function ${fn} not found`);
    const iScope = m[0].indexOf('scopedDev()');
    assert.ok(iScope !== -1, `${fn} must consult scopedDev()`);
    // The scope check must come before the region-wide render, not after it.
    const iWide = m[0].indexOf(fn === 'renderDca' ? 'dcAnalysis()' : 'innerHTML');
    assert.ok(iScope < iWide, `${fn} must check the scope before rendering region-wide`);
  }
});

test('growth tab (Phase 4): renderGrowth fills both sub-view bodies, old Demand renders are gone', () => {
  for (const fn of ['renderGrowth', 'renderGrowthPipeline', 'renderGrowthCensus', 'forecastTableHTML']) {
    assert.ok(new RegExp(`function ${fn}\\(`).test(APP), `function ${fn} not found`);
  }
  const m = /function renderGrowthPipeline\(\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'renderGrowthPipeline not found');
  assert.match(m[0], /\$\('#growth-pipeline-body'\)/, 'pipeline sub-view fills #growth-pipeline-body');
  assert.match(m[0], /Growth\.pipelineTotals/, 'pipeline buckets come from the growth merge');
  assert.match(m[0], /Growth\.completionStats/, 'completions per year are computed');
  assert.match(m[0], /Growth\.medianApprovalByMuni/, 'approval pace is computed');
  assert.match(m[0], /renderGrowthChart\(/, 'the pipeline chart reuses renderGrowthChart');
  const c = /function renderGrowthCensus\(\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(c, 'renderGrowthCensus not found');
  assert.match(c[0], /\$\('#growth-census-body'\)/, 'census sub-view fills #growth-census-body');
  assert.doesNotMatch(c[0], /housingCardHTML/, 'Ontario 2031 housing targets removed');
  assert.match(c[0], /outlookCardHTML\(true\)/, 'the population outlook is reused');
  assert.match(c[0], /forecastTableHTML\(bc\)/, 'the 2051 allocation table is rendered');
  for (const gone of ['function renderDemand(', 'function renderDemandScoped(', "stampHTML('demand')"]) {
    assert.ok(!APP.includes(gone), `still present: ${gone}`);
  }
  // flowTablesHTML moved (not deleted): Worker C removed the Demand-tab original and
  // Worker D re-created it once in the Water tab region.
  assert.equal(APP.split('function flowTablesHTML(').length - 1, 1, 'flowTablesHTML exists exactly once');
});

test('scopedDev: prefers DevScope.current(), falls back to currentProject', () => {
  const m = /function scopedDev\(\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'scopedDev not found');
  assert.match(m[0], /DevScope\.current\(\)/);
  assert.match(m[0], /return DN\(\)\.getCurrentProject\(\)/);
});

// Navigation phase 5 retired the full table's verdict card (§5 row 119): its key numbers are the Overview's
// figures and At a glance, its status sentence the About fold's, its verdicts the Servicing rows and its next
// milestone a Timing row; its four flows are Servicing › Network's.
test('a development\'s Overview: the key numbers in its figures and At a glance, one status sentence, the verdicts on the Servicing rows and the next milestone under Timing', () => {
  const m = /function renderSiteOverview\(p\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'renderSiteOverview not found');
  const src = m[0];
  assert.match(src, /verdictWater\(/, 'water verdict from per-tab brief logic');
  assert.match(src, /verdictWastewater\(/, 'wastewater verdict from per-tab brief logic');
  assert.match(src, /verdictDc\(/, 'DC verdict from per-tab brief logic');
  assert.match(src, /verdictMilestone\(/, 'milestone verdict');
  const g = /function atGlance\([\s\S]*?\n  \}/.exec(APP);
  assert.ok(g, 'atGlance not found');
  for (const label of ["'units'", "'people'", "'jobs'", 'floor area']) assert.match(g[0], new RegExp(label), `missing key number: ${label}`);
  assert.match(/function aboutBlockHTML\([\s\S]*?\n  \}/.exec(APP)[0], /st\.why/, 'status sentence must derive from statusOf(p).why (the About fold, open)');
  const sp = /function sitePanelSpec\(p, o\) \{[\s\S]*?\n  \}/.exec(APP)[0];
  assert.match(sp, /PN\.kv\('Next milestone'/, 'the next milestone under Timing');
  // Stage 2: water and wastewater are one Servicing tab; both rows open Servicing › Network, DC works Capital.
  for (const at of ["'svc:network'", "'dca:timing'"]) assert.match(sp, new RegExp(`'data-at': ${at}`), `missing tab link ${at}`);
  const net = /function renderSiteNetwork\(p\) \{[\s\S]*?\n  \}/.exec(APP)[0];
  for (const label of ['water, maximum day', 'average dry weather', 'peak dry weather', 'peak wet weather']) assert.match(net, new RegExp(label, 'i'), `missing flow: ${label}`);
  // (the header's "n files · history ›" opens the development's files on every tab: tests/chips.test.js)
});

test('growth chart tooltip: delegated to .growth-chart so both sub-views keep it', () => {
  assert.match(APP, /document\.addEventListener\('pointermove', growTip\)/);
  assert.match(APP, /e\.target\.closest\('\.growth-chart'\)/);
  assert.ok(!APP.includes("$('#c-chart').addEventListener"), 'old #c-chart binding is gone');
});

test('devUnitsHTML: flows:false drops the demand-by-stage flow tables', () => {
  const m = /function devUnitsHTML\(p, open, opts = \{\}\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'devUnitsHTML with opts not found');
  assert.match(m[0], /opts\.flows === false \? '' : devStageDemandHTML\(p\)/);
});

test('scoped Water/Wastewater: site brief content, no ground/storm/ponds on the wastewater tab', () => {
  const m = /function renderSvcScoped\(p\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'renderSvcScoped not found');
  assert.match(m[0], /devServicingBriefHTML\(p, st, f, 'water'\)/);
  assert.match(m[0], /devServicingBriefHTML\(p, st, f, 'ww', \{ site: false \}\)/);
  const b = /function devServicingBriefHTML\(p, st, f, part, opts = \{\}\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(b, 'devServicingBriefHTML with opts not found');
  assert.match(b[0], /opts\.site !== false/);
});

test('scoped DC: site DC brief without the sewer-path/plant-reserve numbers', () => {
  const m = /const p = DV\(\)\.scopedDev\(\);\n    if \(p\) \{[\s\S]*?DD\(\)\.devBriefHTML\(p, st, f, 'dc', \{ noWwNeeds: true \}\);/.exec(APP);
  assert.ok(m, 'renderDca scoped branch must reuse devBriefHTML(p, st, f, \'dc\') with noWwNeeds');
  const b = /function devServicingBriefHTML\(p, st, f, part, opts = \{\}\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.match(b[0], /opts\.noWwNeeds/);
  assert.match(b[0], /homeLine\('svc:network', 'Servicing › Network'\)/);
});

test('scoped Growth (census): DA view links I&I flows to the Wastewater tab instead of repeating them', () => {
  assert.match(APP, /Wastewater I&amp;I for this area lives on the \$\{DV\(\)\.homeLine\('svc:network', 'Servicing › Network'\)\}/);
});

test('scopeBriefIds: prefixes dev-* ids so footer copies do not collide with the detail panel', () => {
  const scopeBriefIds = extractFn('scopeBriefIds');
  const nodes = [{ id: 'dev-wtrace' }, { id: 'dev-units' }, { id: 'other' }];
  scopeBriefIds({ querySelectorAll: sel => sel === '[id^="dev-"]' ? nodes.slice(0, 2) : [] });
  assert.equal(nodes[0].id, 'f-dev-wtrace');
  assert.equal(nodes[1].id, 'f-dev-units');
  assert.equal(nodes[2].id, 'other');
});

test('scoped renders: footer copies get prefixed ids (water, ww, demand, dc)', () => {
  for (const re of [
    /function renderSvcScoped\(p\) \{[\s\S]*?DV\(\)\.scopeBriefIds\(\$\('#water-body'\)\); DV\(\)\.scopeBriefIds\(\$\('#ww-body'\)\);/,
    /DD\(\)\.devBriefHTML\(p, st, f, 'dc', \{ noWwNeeds: true \}\);[\s\S]*?DV\(\)\.scopeBriefIds\(bodies\[0\] \|\| legacy\);/,
  ]) assert.match(APP, re);
});

test('water trace button: output goes to the clicked container, labels stay in sync across copies', () => {
  assert.match(APP, /const scope = b\.closest\('#scope-body, \.pnl-host, #home, #water-body'\) \|\| document;/);
  assert.match(APP, /const tops = \[\.\.\.document\.querySelectorAll\(`\[data-wtrace="\$\{CSS\.escape\(p\.key\)\}"\]`\)\];/);
  assert.match(APP, /for \(const o of document\.querySelectorAll\('\.wtrace-out'\)\) o\.innerHTML = '';/);
});

test('footer copies: no dead ends — brief buttons work outside the detail panel', () => {
  const m = /document\.addEventListener\('click', e => \{\n    const g = e\.target\.closest\('\[data-foot-tab\]'\);[\s\S]*?\n  \}\);/.exec(APP);
  assert.ok(m, 'footer click listener not found');
  for (const sel of ['[data-foot-tab]', '[data-pipe]', '[data-dcn-all]', '[data-dcn-cons]', '[data-dcn-relief]',
    '[data-uu-set]', '[data-uu-clear]', '[data-sub]', '[data-dev-parent]', '[data-open]'])
    assert.match(m[0], new RegExp(sel.replace(/[\[\]]/g, '\\$&')), `${sel} not handled`);
  assert.match(m[0], /scope\.querySelector\(`#f-\$\{CSS\.escape\(o\.dataset\.open\)\}`\)/);
});
