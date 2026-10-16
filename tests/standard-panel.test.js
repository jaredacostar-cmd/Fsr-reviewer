'use strict';
// Stage 3 — the standard panel layout. The brief's tests:
//   1. the panel builder renders the eight sections in order;
//   2. no calculated number without a scenario chip;
//   3. impact uses the same capacity function as the table (G.E. Booth at 120%, rated 518 → ≈155 ML/d over);
//   4. panel figures equal full-table figures for the same scope.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

// js/panel.js in a vm (no document: the pure builder only).
function loadPanel(window = {}) {
  const ctx = { window }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/panel.js'), ctx);
  return window.PeelPanel;
}
const PN = loadPanel();
const plain = o => JSON.parse(JSON.stringify(o));
const NOTE = "General screening results only. Peel's W&amp;WW Infrastructure Planning team must validate or confirm all results.";

// A panel with every section filled.
const FULL = {
  key: 'svc:capacity', calc: true,
  head: { trail: [{ label: 'Peel' }, { label: 'Servicing › Capacity' }], close: { 'data-x': '' }, name: 'Can the system take it?', status: { tone: 'over', text: '2 over' }, identity: 'Peel · water and wastewater' },
  answer: '2 of 9 facilities are over capacity at build-out.',
  figures: [1, 2, 3, 4, 5, 6].map(i => ({ v: i, u: 'over', label: `figure ${i}`, ctx: 'context' })),
  chart: '<div class="bar"></div>',
  lists: [{ title: 'Facilities', rows: [1, 2, 3, 4, 5, 6, 7].map(i => ({ html: `row ${i}`, attrs: { 'data-ss': `plant:${i}` } })), total: 7, seeAll: { 'data-full-table': 'svc:capacity' } }],
  folds: [{ title: 'About', html: 'about' }],
  method: 'method', sources: 'sources',
  foot: { primary: { label: 'Show capacity on the map', attrs: { 'data-mview': 'wastewater' } }, secondary: [{ label: 'A', attrs: { 'data-a': '' } }, { label: 'B', attrs: { 'data-b': '' } }] },
};

test('1. the panel builder renders the eight sections in order', () => {
  const h = PN.html(FULL);
  assert.deepEqual(plain(PN.sectionsOf(h)), ['header', 'scenario', 'answer', 'figures', 'chart', 'list', 'fold', 'method', 'sources', 'footer']);
  // Every one of the builder's sections is in the declared order (folds sit between the lists and Method).
  assert.deepEqual(plain(PN.SECTIONS), ['header', 'scenario', 'answer', 'figures', 'chart', 'list', 'fold', 'method', 'sources', 'footer']);
  // Header: trail, close ×, name, a status chip in words (never colour alone), one identity line.
  assert.match(h, /<nav class="pnl-trail" aria-label="Scope"><span class="pnl-crumb">Peel<\/span>/);
  assert.match(h, /class="btn small pnl-x" data-x="" aria-label="Close">×<\/button>/);
  assert.match(h, /<h2 class="pnl-name">Can the system take it\?<\/h2><button type="button" class="pnl-chip pnl-chip-btn t-over" data-full-table="[^"]*" title="Open the full table">2 over <span class="aer-car" aria-hidden="true">▸<\/span><\/button>/, 'a header count opens the full table');
  // At most four key figures; lists show five rows with "See all (n)"; rows are buttons opening the next level.
  assert.equal((h.match(/class="pnl-fig[ "]/g) || []).length, 4);
  assert.equal((h.match(/<li class="pnl-row/g) || []).length, 5);
  assert.match(h, /data-full-table="svc:capacity">See all \(7\) →<\/button>/);
  assert.match(h, /<li class="pnl-row" data-ss="plant:1" tabindex="0" role="button">row 1<\/li>/);
  // Method and Sources fold, closed.
  assert.match(h, /<details class="pnl-fold" data-sec="method"><summary>Method and basis<\/summary>/);
  assert.match(h, /<details class="pnl-fold" data-sec="sources"><summary>Sources<\/summary>/);
  // Footer: one primary, "Open full table", at most two secondary in all; the screening note.
  const foot = h.slice(h.indexOf('data-sec="footer"'));
  assert.equal((foot.match(/pnl-primary/g) || []).length, 1);
  assert.deepEqual([...foot.matchAll(/class="btn small pnl-sec"[^>]*>([^<]+)</g)].map(m => m[1]), ['Open full table', 'A']);
  assert.match(foot, /data-full-table="svc:capacity">Open full table</);
  assert.ok(foot.includes(NOTE), 'screening note');
  // A bare panel still has its header, answer and footer (with the full table and the note); empty
  // sections are left out, never blank.
  const bare = PN.html({ key: 'records:sources', head: { name: 'Sources' }, answer: 'Where the data comes from.' });
  assert.deepEqual(plain(PN.sectionsOf(bare)), ['header', 'answer', 'footer']);
  assert.match(bare, /Open full table/); assert.ok(bare.includes(NOTE));
  // A trail is only shown from two levels down (at Peel it would repeat the name).
  assert.doesNotMatch(PN.html({ head: { trail: [{ label: 'Peel' }], name: 'Peel' } }), /pnl-trail/);
});

test('1. every panel goes through the builder, and every tab has a panel slot', () => {
  for (const t of ['overview', 'growth', 'svc', 'dca', 'records']) assert.match(src('index.html'), new RegExp(`id="pnl-${t}"`), t);
  // The panels set in each tab (key → the file that sets it).
  const SETS = {
    'overview:': 'js/overview-tab.js', 'growth:pipeline': 'js/growth-ui.js', 'growth:areas': 'js/plan-tables.js', 'growth:timing': 'js/timing.js',
    'svc:capacity': 'js/svc-capacity.js', 'svc:network': 'js/svc-capacity.js', 'svc:alloc': 'js/demand-ui.js', 'svc:checks': 'js/svc-capacity.js',
    'dca:timing': 'js/dca-tab.js', 'dca:projects': 'js/dca-tab.js', 'dca:eas': 'js/dca-tab.js',
    'records:files': 'js/records-tab.js',
  };
  for (const [key, f] of Object.entries(SETS)) assert.ok(src(f).includes(`'${key}'`), `${key} in ${f}`);
  assert.ok(src('js/records-tab.js').includes("root.PeelPanel.set(`records:${sub === 'checks' ? 'checks' : 'sources'}`"), 'records:sources and records:checks');
  // The slot is synced each time a tab opens; Esc closes the full table.
  assert.match(src('js/analysis-tabs.js'), /if \(root\.PeelPanel\) root\.PeelPanel\.sync\(\);/);
  assert.match(src('js/panel.js'), /if \(e\.key === 'Escape' && closeFull\(\)\)/);
});

test('2. no calculated number without a scenario chip', () => {
  // Asked for (calc) or not, a panel that shows a flow, a volume, a share of capacity or people gets the chip.
  const withCalc = spec => PN.sectionsOf(PN.html(spec)).includes('scenario');
  assert.ok(withCalc({ calc: true, head: { name: 'x' }, answer: 'x' }));
  assert.ok(withCalc({ head: { name: 'G.E. Booth' }, answer: 'x', figures: [{ v: '155.4', u: 'ML/d', label: 'over the 90% trigger' }] }));
  assert.ok(withCalc({ head: { name: 'x' }, answer: 'Build-out reaches <strong>120%</strong> of rated capacity.' }));
  assert.ok(withCalc({ head: { name: 'x' }, answer: 'x', figures: [{ v: 812, u: 'L/s', label: 'peak' }] }));
  assert.ok(withCalc({ head: { name: 'x' }, answer: 'x', figures: [{ v: '4,200', u: 'people', label: 'affected' }] }));
  assert.ok(withCalc({ head: { name: 'x' }, answer: 'x', lists: [{ rows: [{ html: '<span>12.5 ML short of required storage</span>' }] }] }));
  // Plain counts and dates are not calculated: no chip.
  assert.ok(!withCalc({ head: { name: 'Sources' }, answer: '14 sources, last updated Oct 2026.', figures: [{ v: 14, u: 'sources', label: 'on file' }] }));
  // The chip is the top bar's scenario, read-only, and opens the Scenario control.
  assert.match(src('js/panel.js'), /<button type="button" class="pnl-scen-chip" data-pnl-scen title="The scenario these figures are worked out for/);
  assert.match(src('js/panel.js'), /if \(e\.target\.closest\('\[data-pnl-scen\]'\)\) \{ const T = root\.PeelTopbar; if \(T && T\.openScenPop\) T\.openScenPop\(\); return; \}/);
  // The full table keeps it in its bar too.
  assert.match(src('js/panel.js'), /<div class="ft-scen">\$\{scenarioChip\(\)\}<\/div>/);
});

// js/svc-capacity.js in a vm, with the panel builder and small stubs for the browser modules.
function loadCapacity() {
  const U = { esc: x => String(x), fmtNum: n => Math.round(n).toLocaleString('en-CA'), fmt1: n => n.toFixed(1), capTxt: v => `${Math.round(v * 1000)} m³/d`,
    roomWords: (v, u, f) => (v < 0 ? `over by ${f(-v)}` : `room ${f(v)}`), basisChip: b => `<span class="basis" data-basis="${b}">${b}</span>`, store: { get: (k, d) => d, set: () => {} } };
  const window = { PeelUtil: U, PeelMapMarkers: { THIS_YEAR: 2026 }, PeelSvcPlants: { hz: { end: 2051 } },
    PeelSvcTab: { optSwitch: () => '' }, PeelLayerBar: { LABEL: {}, barHTML: o => `<div class="lb-bar" data-max="${o.max}"></div>`, legendHTML: () => '', capLegendHTML: () => '' } };
  loadPanel(window);
  const ctx = { window, module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/svc-capacity.js'), ctx);
  return ctx.module.exports;
}
const C = loadCapacity();
const hz = { end: 2051, at: [[2031, 90], [2041, 105], [2051, 120]], c80: 'today', c90: 2031, c100: 2036 };
// G.E. Booth (Lakeview) at 120% of its rated 518 ML/d at build-out.
const BOOTH = { id: 'plant:Lakeview', ss: 'plant:Lakeview', sys: 'ww', kind: 'plant', name: 'G.E. Booth', sub: 'treatment plant', compared: 'Flow vs rated capacity', basis: 'metered', unit: 'ML/d', cap: 518, capWord: 'rated',
  existing: 400, built: 10, committed: 470, buildout: 518 * 1.2, limit: { y: 2031, what: '90% trigger' }, horizon: hz, relief: 'planned' };
const ROWS = () => [
  BOOTH,
  { id: 'plant:Clarkson', ss: 'plant:Clarkson', sys: 'ww', kind: 'plant', name: 'Clarkson', sub: 'treatment plant', compared: 'Flow vs rated capacity', basis: 'metered', unit: 'ML/d', cap: 350, capWord: 'rated', existing: 200, built: 0, committed: 260, buildout: 330, limit: { y: 2040, what: '90% trigger' }, horizon: hz },
  { id: 'wsys:southPeel', ss: 'wsys:lake', sys: 'water', kind: 'wplant', name: 'South Peel water treatment', sub: 'A.P. Kennedy + Lorne Park', compared: 'Maximum day vs rated capacity', basis: 'metered', unit: 'ML/d', cap: 1700, capWord: 'rated', existing: 900, built: 0, committed: 1000, buildout: 1100, limit: { y: null, what: '90% trigger' }, horizon: hz },
  { id: 'stor:Zone 5', sys: 'water', kind: 'storage', name: 'Zone 5 storage', sub: 'storage', compared: 'Required vs available', basis: 'mp', unit: 'ML', cap: 40, capWord: 'available', existing: 34, built: 0, committed: 36, buildout: 49, limit: { y: 2029, what: 'required > available' }, horizon: hz, reliefY: 2032, shortBefore: 6 },
  { id: 'ps:Y', sys: 'ww', kind: 'ps', name: 'Y pumping station', sub: 'pumping station', compared: 'Peak wet weather vs firm', basis: 'design', unit: 'L/s', cap: 800, capWord: 'firm', existing: 436, built: 0, committed: 640, buildout: 860, limit: { y: 2034, what: '100% firm' }, horizon: hz },
  { id: 'pump:Zone 6', sys: 'water', kind: 'pump', name: 'Zone 6', sub: 'pumping into the zone', compared: 'Maximum day vs firm pumping', basis: 'design', unit: 'ML/d', cap: 100, capWord: 'firm', existing: 60, built: 0, committed: 80, buildout: 95, limit: { y: null, what: '100% firm' }, horizon: hz },
].map(C.derive);

test('3. impact uses the same capacity function as the table: G.E. Booth at 120% of rated 518 → ≈155 ML/d over', () => {
  const b = ROWS()[0];
  assert.equal(Math.round(b.pctBo), 120, 'the table\'s build-out %');
  // (120% − 90%) × 518 = 155.4 ML/d over the 90% expansion trigger at build-out.
  assert.ok(Math.abs(b.impact.v - 155.4) < 0.05, `impact ${b.impact.v}`);
  assert.equal(b.impact.text, '155.4 ML/d over the 90% trigger at build-out');
  assert.deepEqual(plain(b.impact.fig), { v: '155.4', u: 'ML/d', rest: 'over the 90% trigger at build-out' });
  // The same row object feeds the panel row, the panel figure and the full table's Impact column.
  const rows = ROWS();
  assert.match(C.listRow(rows[0]).html, /Impact: 155\.4 ML\/d over the 90% trigger at build-out/);
  // (bundle 5: the sentence folds under its figure)
  assert.match(C.fullTableHTML(rows), /<details class="ft-imp"><summary>155\.4 ML\/d<\/summary>155\.4 ML\/d over the 90% trigger at build-out<\/details>/);
  // Every system in its own Master Plan unit: stations L/s over firm, storage ML short before relief,
  // zone pumping ML/d against firm pumping.
  const by = Object.fromEntries(rows.map(r => [r.id, r.impact.text]));
  assert.equal(by['ps:Y'], '60 L/s over firm capacity at build-out');
  assert.equal(by['stor:Zone 5'], '6.0 ML short of required storage before relief (2032)');
  assert.equal(by['pump:Zone 6'], '5.0 ML/d under firm pumping at build-out (no relief listed)');
  assert.equal(by['plant:Clarkson'], '15.0 ML/d over the 90% trigger at build-out');
  // Largest impact ranks how far past its limit (a share of it); Soonest by limit year.
  assert.deepEqual(C.sortRows(rows, 'impact', 2026).map(r => r.id), ['plant:Lakeview', 'stor:Zone 5', 'ps:Y', 'plant:Clarkson', 'pump:Zone 6', 'wsys:southPeel']);
  assert.deepEqual(C.sortRows(rows, 'limit', 2026).map(r => r.id), ['stor:Zone 5', 'plant:Lakeview', 'ps:Y', 'plant:Clarkson', 'pump:Zone 6', 'wsys:southPeel']);
});

test('4. panel figures equal full-table figures for the same scope (Servicing › Capacity at Peel)', () => {
  const rows = ROWS(), spec = C.panelSpec(rows), panel = PN.html({ key: 'svc:capacity', ...spec }), table = C.fullTableHTML(rows);
  // The panel's sections, in order; it is a calculated panel, so the scenario chip is there.
  assert.deepEqual(plain(PN.sectionsOf(panel)), ['header', 'scenario', 'answer', 'figures', 'chart', 'list', 'method', 'sources', 'footer']);
  // The same rows: every facility in the table, the panel's "See all (n)" counts them.
  const trs = table.match(/<tr data-basis=/g) || [];
  assert.equal(trs.length, rows.length);
  assert.match(panel, new RegExp(`See all \\(${rows.length}\\)`));
  // Over and tight counts: the panel's figures against the table's row tones.
  const over = (table.match(/<tr data-basis="\w+" class="t-over">/g) || []).length, tight = (table.match(/<tr data-basis="\w+" class="t-tight">/g) || []).length;
  const fig = label => { const f = spec.figures.find(x => x.label === label); return f && String(f.v); };
  assert.equal(fig('over capacity at build-out'), String(over));
  assert.equal(fig('90–100% at build-out'), String(tight));
  assert.equal(over, 3); assert.equal(tight, 2);
  // The largest impact figure is the table's Impact cell for that facility.
  const big = spec.figures.find(x => x.label === 'largest impact');
  assert.equal(`${big.v} ${big.u}`, '155.4 ML/d'); assert.match(big.ctx, /^G\.E\. Booth: over the 90% trigger at build-out$/);
  // Each panel row's with-approved → build-out % equals the table's for that facility.
  const tablePct = {};
  for (const m of table.matchAll(/<tr data-basis="\w+" class="t-\w*"><th scope="row" class="ft-pin" data-l="Facility">([^<]+)<small>[\s\S]*?<td class="n" data-l="With approved %">(\d+%|–)<\/td><td class="n" data-l="Build-out %"><strong>(\d+%|–)<\/strong>/g)) tablePct[m[1]] = [m[2], m[3]];
  const listRows = spec.lists[0].rows;
  assert.equal(listRows.length, 5);
  for (const r of listRows) {
    const m = r.html.match(/<span class="pnl-r-name">(?:💧 )?([^<]+)<\/span>[\s\S]*?· (\d+%|–) with approved → (\d+%|–) at build-out/);
    assert.ok(m, r.html);
    assert.deepEqual([m[2], m[3]], tablePct[m[1]], m[1]);
  }
  // Both are sorted the same way (Soonest by default).
  const panelOrder = listRows.map(r => r.html.match(/<span class="pnl-r-name">(?:💧 )?([^<]+)</)[1]);
  const tableOrder = [...table.matchAll(/<tr data-basis="\w+" class="t-\w*"><th scope="row" class="ft-pin" data-l="Facility">([^<]+)<small>/g)].map(m => m[1]);
  assert.deepEqual(panelOrder, tableOrder.slice(0, 5));
  // The answer names the same counts.
  assert.match(spec.answer, /^<strong>3<\/strong> of 6 facilities are over capacity at build-out and <strong>2<\/strong> more are tight/);
});

test('8. every panel keeps the screening note and the Open full table action; colours: blue only for actions', () => {
  for (const spec of [FULL, { head: { name: 'x' } }]) {
    const h = PN.html(spec);
    assert.ok(h.includes(NOTE)); assert.match(h, /data-full-table="[^"]*">Open full table</);
  }
  // The tones: amber tight, red over, teal room, violet stage (each chip also says it in words).
  assert.equal(PN.toneOf(120), 'over'); assert.equal(PN.toneOf(95), 'tight'); assert.equal(PN.toneOf(60), 'room'); assert.equal(PN.toneOf(null), null);
  assert.equal(PN.chip({ tone: 'tight' }), '<span class="pnl-chip t-tight">Tight</span>');
  const css = src('css/app.css');
  assert.match(css, /--pnl-room:/); assert.match(css, /--pnl-stage:/);
  // Tabular figures throughout the panel.
  assert.match(css, /\.pnl \{[^}]*font-variant-numeric: tabular-nums/);
});
