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

const APP = fs.readFileSync(path.join(__dirname, '..', 'js', 'app.js'), 'utf8');

// Extract a `const name = (args) => { ... };` and evaluate it standalone (pure only).
function extractFn(name) {
  const m = new RegExp(`const ${name} = (\\([\\s\\S]*?\\n  \\});`).exec(APP);
  assert.ok(m, `const ${name} not found in js/app.js`);
  return new Function(`return (${m[1]});`)();
}

const verdictWater = extractFn('verdictWater');
const verdictWastewater = extractFn('verdictWastewater');
const verdictDc = extractFn('verdictDc');
const verdictMilestone = extractFn('verdictMilestone');
const firstSentence = extractFn('firstSentence');

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
  assert.match(verdictWastewater({ ...base, over: true }).text, /over-committed/);
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

test('scope wiring: every analysis tab render checks the development scope first', () => {
  for (const fn of ['renderOverview', 'renderDemand', 'renderSvcTab', 'renderDca']) {
    const m = new RegExp(`function ${fn}\\([\\s\\S]*?\\n  \\}`).exec(APP);
    assert.ok(m, `function ${fn} not found`);
    assert.match(m[0].slice(0, 600), /scopedDev\(\)/, `${fn} must consult scopedDev()`);
  }
});

test('scopedDev: prefers DevScope.current(), falls back to currentProject', () => {
  const m = /function scopedDev\(\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'scopedDev not found');
  assert.match(m[0], /DevScope\.current\(\)/);
  assert.match(m[0], /return currentProject/);
});

test('verdict card: four key numbers, one status sentence, four tab-linked verdict lines', () => {
  const m = /function renderVerdictCard\(p\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'renderVerdictCard not found');
  const src = m[0];
  for (const label of ['units', 'people', 'water max day', 'wastewater peak wet']) assert.match(src, new RegExp(label), `missing key number: ${label}`);
  assert.match(src, /firstSentence\(st\.why\)/, 'status sentence must derive from statusOf(p).why');
  assert.match(src, /verdictWater\(/, 'water verdict from per-tab brief logic');
  assert.match(src, /verdictWastewater\(/, 'wastewater verdict from per-tab brief logic');
  assert.match(src, /verdictDc\(/, 'DC verdict from per-tab brief logic');
  assert.match(src, /verdictMilestone\(/, 'milestone verdict');
  for (const tab of ["go('water'", "go('ww'", "go('dca'"]) assert.match(src, new RegExp(tab.replace(/[()']/g, '\\$&')), `missing tab link ${tab}`);
  assert.match(src, /data-ov-dev/, 'milestone line must open the development');
});

test('scoped Demand: units/build-out via devUnitsHTML without flow tables, plus a flow pointer', () => {
  const m = /function renderDemandScoped\(p\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.ok(m, 'renderDemandScoped not found');
  assert.match(m[0], /devUnitsHTML\(p, true, \{ flows: false \}\)/);
  assert.match(m[0], /homeLine\('water', 'Water tab'\)/);
  assert.match(m[0], /homeLine\('ww', 'Wastewater tab'\)/);
  assert.doesNotMatch(m[0], /flowTablesHTML/);
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
  const m = /const p = scopedDev\(\);\n    if \(p\) \{[\s\S]*?devBriefHTML\(p, st, f, 'dc', \{ noWwNeeds: true \}\);/.exec(APP);
  assert.ok(m, 'renderDca scoped branch must reuse devBriefHTML(p, st, f, \'dc\') with noWwNeeds');
  const b = /function devServicingBriefHTML\(p, st, f, part, opts = \{\}\) \{[\s\S]*?\n  \}/.exec(APP);
  assert.match(b[0], /opts\.noWwNeeds/);
  assert.match(b[0], /homeLine\('ww', 'Wastewater tab'\)/);
});

test('scoped Growth (census): DA view links I&I flows to the Wastewater tab instead of repeating them', () => {
  assert.match(APP, /if \(da\) \$\('#c-ii'\)\.innerHTML = `<span class="muted">Wastewater I&amp;I for this area lives on the \$\{homeLine\('ww', 'Wastewater tab'\)\}\.<\/span>`/);
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
    /function renderSvcScoped\(p\) \{[\s\S]*?scopeBriefIds\(\$\('#water-body'\)\); scopeBriefIds\(\$\('#ww-body'\)\);/,
    /function renderDemandScoped\(p\) \{[\s\S]*?scopeBriefIds\(\$\('#d-breakdown'\)\);/,
    /devBriefHTML\(p, st, f, 'dc', \{ noWwNeeds: true \}\);[\s\S]*?scopeBriefIds\(el\);/,
  ]) assert.match(APP, re);
});

test('water trace button: output goes to the clicked container, labels stay in sync across copies', () => {
  assert.match(APP, /const scope = b\.closest\('#detail-body, #water-body'\) \|\| document;/);
  assert.match(APP, /const tops = \[\.\.\.document\.querySelectorAll\(`\[data-wtrace="\$\{CSS\.escape\(p\.key\)\}"\]`\)\];/);
  assert.match(APP, /for \(const o of document\.querySelectorAll\('\.wtrace-out'\)\) o\.innerHTML = '';/);
});

test('footer copies: no dead ends — brief buttons work outside the detail panel', () => {
  const m = /document\.addEventListener\('click', e => \{\n    if \(e\.target\.closest\('#detail-body'\)\) return;[\s\S]*?\n  \}\);/.exec(APP);
  assert.ok(m, 'footer click listener not found');
  for (const sel of ['[data-foot-tab]', '[data-pipe]', '[data-dcn-all]', '[data-dcn-cons]', '[data-dcn-relief]',
    '[data-uu-set]', '[data-uu-clear]', '[data-sub]', '[data-dev-parent]', '[data-open]'])
    assert.match(m[0], new RegExp(sel.replace(/[\[\]]/g, '\\$&')), `${sel} not handled outside #detail-body`);
  assert.match(m[0], /scope\.querySelector\(`#f-\$\{CSS\.escape\(o\.dataset\.open\)\}`\)/);
});
