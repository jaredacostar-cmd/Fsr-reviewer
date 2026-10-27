'use strict';
// Navigation phase 3 (docs/architecture-review/navigation-design.md §3.4, §8 row 3; pros-and-cons N-4):
// Growth is Pipeline · Areas · Forecast; the pipeline ledger (was Growth › Ledger) is the Forecast panel's
// fold "By period", with its own stage cut-off (owner decision 2: never dropped, never the Scenario's
// Count), then the folds How sure and Since the last snapshot; the developments list is the Forecast's full
// table (#ledger-body). The numbers are the ledger's, unchanged (js/ledger.js, model()).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const L = require('../js/ledger.js');
const D = require('../js/demand.js');
const P = require('../js/phases.js');
const LS = require('../js/ledger-snapshot.js');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const plain = o => JSON.parse(JSON.stringify(o));   // (arrays made in the vm)

// The fixtures of tests/ledger.test.js: Brampton permit 300 with a 100-unit building permit, Brampton
// approved 200, Caledon in review 50, Mississauga pre-application 20 (applications, new builds).
const day = s => new Date(`${s}T00:00:00Z`);
const AS_OF = '2026-10-21T00:00:00Z';
const bp = (ref, units, date) => ({ kind: 'permit', ref, units, type: 'Residential', description: `New apartment building, ${units} units`, phase: 'permit', events: [{ phase: 'permit', date: day(date) }] });
let n = 0;
const dev = (muni, phase, units, extra = {}) => ({
  key: `${muni}|${++n}`, title: `Site ${n}`, municipality: muni, phase, units, lat: 43.7, lng: -79.7, kinds: ['application'], newBuild: true,
  records: [{ kind: 'application', ref: `SP ${n}`, units, phase: phase === 'review' ? 'review' : 'approved', events: [{ phase: 'review', date: day('2022-01-01') }] }, ...(extra.permits || [])],
  buildout: { planned: units, permitted: (extra.permits || []).reduce((t, r) => t + r.units, 0), completed: 0, unbuilt: units, remaining: units },
  milestones: {}, sp: [], types: [], description: '',
});
const fixtures = () => [dev('Brampton', 'permit', 300, { permits: [bp('BP 24-1', 100, '2025-01-01')] }), dev('Brampton', 'approved', 200), dev('Caledon', 'review', 50), dev('Mississauga', 'inception', 20)];
const people = p => D.estimate([p], D.DEFAULT_CRITERIA, 'remaining').population;

// js/ledger-ui.js in a vm: a recording store, a document that records its listeners and holds
// #ledger-body, no timers; extra globals (PeelPanel, fetch) as a test needs them.
function loadLedgerUI({ stored = {}, extra = {}, projects = fixtures() } = {}) {
  const sets = [], listeners = [], body = { innerHTML: '' };
  const store = { get: (k, d) => (own(stored, k) ? stored[k] : d), set: (k, v) => sets.push([k, v]) };
  const document = { querySelector: s => (s === '#ledger-body' ? body : null), querySelectorAll: () => [], addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture: !!capture }) };
  const ctx = {
    PeelUtil: { esc, fmtNum: v => Math.round(v).toLocaleString('en-CA'), roundPop: v => Math.round(v), store, hlP: s => `<p class="hl">${s}</p>` },
    PeelLedger: L, PeelPhases: P, PeelDemand: D, PeelLedgerSnapshot: LS,
    PeelApp: { state: { projects, filtered: projects, criteria: D.DEFAULT_CRITERIA, snapshot: { generatedAt: AS_OF }, muni: '' } },
    PeelDemandUI: { overviewSet: () => projects },
    document, setTimeout: () => 0, module: { exports: {} }, ...extra,
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/ledger-ui.js'), ctx);
  const on = (type, capture) => listeners.filter(l => l.type === type && l.capture === capture).map(l => l.fn);
  return { LU: ctx.module.exports, ctx, sets, body, projects, on };
}
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
const tableOf = h => (h.match(/<table class="dt ldg-table"[\s\S]*?<\/table>/) || [])[0];

test('the Forecast panel’s folds: By period (open to start), How sure and Since the last snapshot (shut)', () => {
  const { LU } = loadLedgerUI();
  const f = LU.periodFolds();
  assert.deepEqual(plain(f.map(x => x.id)), ['pnl-by-period', 'pnl-how-sure', 'pnl-since']);
  assert.deepEqual(plain(f.map(x => x.title)), ['By period', 'How sure (tiers A to E)', 'Since the last snapshot']);
  assert.deepEqual(plain(f.map(x => x.open)), [true, false, false]);
  assert.deepEqual(plain(LU.FOLD_ID), { period: 'pnl-by-period', tiers: 'pnl-how-sure', since: 'pnl-since' });
  assert.match(f[1].html, /<table class="dt ldg-tiers">/, 'How sure: the tiers table');
  // Nothing in a fold opens a scope: a page draws the folds as they are, where such a button would open it
  // in the hidden map.
  for (const x of f) assert.doesNotMatch(x.html, /data-pnl-dev|data-ws-pick|data-ss=/, x.id);
  // No model yet (no app): no folds, never a blank one.
  const bare = loadLedgerUI({ extra: { PeelApp: undefined } });
  assert.deepEqual(plain(bare.LU.periodFolds()), []);
});

test('owner decision 2: By period keeps the ledger’s own stage cut-off, Units | People and Hide possibly lapsed', () => {
  const { LU } = loadLedgerUI();
  const h = LU.periodFolds()[0].html;
  for (const c of L.CUTOFFS) assert.ok(h.includes(`data-ledger-cut="${c.key}" aria-pressed="${c.key === 'all'}">${esc(c.label)}</button>`), c.key);
  assert.deepEqual(L.CUTOFFS.map(c => c.key), ['committed', 'approved', 'review', 'all']);
  assert.match(h, /role="group" aria-label="Stage cut-off \(this table only\)"/);
  assert.match(h, /data-ledger-measure="units"[^>]*>Units<\/button><button[^>]*data-ledger-measure="people"[^>]*>People<\/button>/);
  assert.match(h, /<input type="checkbox" data-ledger-lapse> Hide possibly lapsed/);
  assert.match(h, /<p class="small muted ldg-hint">The cut-off counts stages for this table only; the Scenario’s Count sets the rest of the app\.<\/p>/);
  assert.ok(h.includes(esc(L.DISCLAIMER)), 'the disclaimer on every total');
  assert.match(h, /<table class="dt ldg-table" data-info="by-period"><caption>Units left to build by municipality and milestone/);
  assert.match(h, /<button type="button" class="btn small link" data-at="growth:timing" data-full-table="growth" data-ft-go="by stage, tier and expected year">The 4 developments, with stage, tier and expected year \(full table\) ›<\/button>/);
  // The Scenario's Count is not touched: the cut-off is a setting of this view only.
  assert.doesNotMatch(src('js/ledger-ui.js'), /state\.phases\s*=|state\.basis\s*=|setCount\(/);
});

test('the same numbers on both hosts: the fold’s table is the full table’s, the roll-up is the ledger’s', () => {
  const { LU, body, projects } = loadLedgerUI();
  LU.render();
  const fold = tableOf(LU.periodFolds()[0].html);
  assert.ok(fold && fold.includes('Brampton') && fold.includes('Caledon') && fold.includes('Mississauga'));
  assert.ok(body.innerHTML.startsWith('<h3 class="sub-title">By period</h3>'), 'the full table names it');
  assert.equal(tableOf(body.innerHTML), fold, 'the full table draws the same table');
  assert.match(body.innerHTML, /<table class="dt ldg-list"><caption>Developments by stage, tier and expected year <span class="muted">\(4, units at the cut-off\)<\/span>/);
  assert.equal((body.innerHTML.match(/data-pnl-dev="/g) || []).length, 4, 'the full table’s rows open their development');
  assert.match(body.innerHTML, /<summary>Method and basis<\/summary>/);
  // model() still rolls the Overview's set up by municipality (js/ledger.js), at every cut-off and bucket.
  const ref = L.rollup(L.rows(projects, { people, asOf: Date.parse(AS_OF) }), 'municipality'), m = LU.model();
  assert.ok(m.r.check < 1e-6);
  for (const c of L.CUTOFFS) for (const b of [...L.BUCKETS.map(x => x.key), null]) for (const measure of ['units', 'people']) {
    const o = { bucket: b, cutoff: c.key, measure };
    assert.ok(Math.abs(L.sumOf(m.r.root.cells, o) - L.sumOf(ref.root.cells, o)) < 1e-6, JSON.stringify(o));
  }
  assert.ok(Math.abs(L.sumOf(m.r.root.cells) - 570) < 1e-6, 'Peel: every unit left to build');
  assert.deepEqual(plain(m.r.root.children.map(g => g.name).sort()), ['Brampton', 'Caledon', 'Mississauga']);
  assert.match(fold, /<tr class="ldg-peel"><th scope="row">Peel<\/th>/);
});

test('By period open or shut: per browser, only by the reader’s own click; a link or What’s coming opens it', () => {
  let x = loadLedgerUI();
  assert.equal(x.LU.periodOpen(), true, 'a fresh browser: open (task 7 reads it there)');
  x = loadLedgerUI({ stored: { ledgerOpen: false } });
  assert.equal(x.LU.periodOpen(), false);
  assert.equal(x.LU.periodFolds()[0].open, false);
  x.LU.openPeriod();
  assert.equal(x.LU.periodOpen(), true); assert.deepEqual(x.sets, [], 'a link opens it for the visit: what this browser keeps is unchanged');
  // The reader's click on the fold's own summary, then its toggle: kept (By period per browser).
  x = loadLedgerUI();
  const [click] = x.on('click', true), [toggle] = x.on('toggle', true);
  assert.ok(click && toggle, 'capture listeners (toggle does not bubble)');
  const clickOn = el => click({ target: { closest: s => (s === 'summary' ? { parentElement: el } : null) } });
  const period = { id: 'pnl-by-period', open: false };
  clickOn(period); toggle({ target: period });
  assert.equal(x.LU.periodOpen(), false); assert.deepEqual(x.sets, [['ledgerOpen', false]]);
  // How sure: for the visit, not stored.
  const tiers = { id: 'pnl-how-sure', open: true };
  clickOn(tiers); toggle({ target: tiers });
  assert.equal(x.LU.periodFolds()[1].open, true); assert.deepEqual(x.sets, [['ledgerOpen', false]]);
  // A redraw is not a pick: a fold drawn open fires toggle with no click before it.
  toggle({ target: { id: 'pnl-by-period', open: true } });
  assert.equal(x.LU.periodOpen(), false, 'a redraw changes nothing'); assert.equal(x.sets.length, 1);
  // A click on another summary (Method and basis), then a toggle of By period: nothing.
  clickOn({ id: '', open: true }); toggle({ target: { id: 'pnl-by-period', open: true } });
  assert.equal(x.LU.periodOpen(), false); assert.equal(x.sets.length, 1);
  // A click elsewhere (a cut-off button, which redraws the fold), then a toggle: nothing; nor a second
  // toggle after the one a click asked for.
  period.open = true;
  click({ target: { closest: () => null } }); toggle({ target: period });
  assert.equal(x.LU.periodOpen(), false); assert.equal(x.sets.length, 1);
  clickOn(period); toggle({ target: period }); period.open = false; toggle({ target: period });
  assert.equal(x.LU.periodOpen(), true); assert.deepEqual(x.sets, [['ledgerOpen', false], ['ledgerOpen', true]]);
  // The guard in the source.
  assert.match(src('js/ledger-ui.js'), /document\.addEventListener\('toggle', e => \{\n {6}if \(e\.target !== picked\) return;/);
});

test('a panel slot put back from its stored HTML, and a page, show the folds as the reader left them', () => {
  const { LU } = loadLedgerUI({ stored: { ledgerOpen: false } });
  const drawn = { '#pnl-by-period': { open: true }, '#pnl-since': { open: false } };
  LU.syncFolds({ querySelector: s => drawn[s] || null });
  assert.equal(drawn['#pnl-by-period'].open, false, 'shut, as the reader left it');
  assert.equal(drawn['#pnl-since'].open, false);
  assert.doesNotThrow(() => { LU.syncFolds(null); LU.syncFolds({}); });
  // foldsNow: a page's stale copy comes back with the state now; another fold as it is.
  const other = { id: 'pnl-alloc-rec', open: true, html: 'x' };
  const now = LU.foldsNow([{ id: 'pnl-by-period', open: true, html: 'y' }, other]);
  assert.equal(now[0].open, false); assert.equal(now[0].html, 'y'); assert.equal(now[1], other);
  assert.deepEqual(plain(LU.foldsNow(null)), []);
});

test('openPeriod sets the Forecast’s panel again with fresh folds, for the scope it was made for', () => {
  const calls = [], panel = scope => ({ get: () => ({ spec: { answer: 'x', lists: [] }, scope: 'area' }), scopeId: () => scope, set: (k, spec) => calls.push([k, spec]) });
  let x = loadLedgerUI({ stored: { ledgerOpen: false }, extra: { PeelPanel: panel('area') } });
  x.LU.openPeriod();
  assert.equal(calls.length, 1); assert.equal(calls[0][0], 'growth:timing');
  assert.equal(calls[0][1].answer, 'x', 'the forecast as it was');
  assert.deepEqual(plain(calls[0][1].folds.map(f => [f.id, f.open])), [['pnl-by-period', true], ['pnl-how-sure', false], ['pnl-since', false]]);
  x.LU.openPeriod(); assert.equal(calls.length, 1, 'already open: nothing to redraw');
  calls.length = 0;
  x = loadLedgerUI({ stored: { ledgerOpen: false }, extra: { PeelPanel: panel('dev:k') } });
  x.LU.openPeriod();
  assert.equal(calls.length, 0, 'a panel set for another scope is left alone'); assert.equal(x.LU.periodOpen(), true);
});

test('Since the last snapshot: in the panel only once there is one to compare; names as text there, buttons in the full table', async () => {
  // No fetch (or still looking): the panel's fold has no HTML (left out), the full table says so.
  let x = loadLedgerUI();
  assert.equal(x.LU.periodFolds()[2].html, '');
  x.LU.render(); assert.match(x.body.innerHTML, /Looking for the last frozen snapshot…/);
  // An empty index: still nothing in the panel; the full table says how the first is written.
  const fetchOf = files => url => Promise.resolve(own(files, url) ? { ok: true, json: () => Promise.resolve(files[url]) } : { ok: false });
  x = loadLedgerUI({ extra: { fetch: fetchOf({ 'data/ledger/index.json': { snapshots: [] } }) } });
  x.LU.periodFolds(); await settle();
  assert.equal(x.LU.periodFolds()[2].html, '');
  x.LU.render(); assert.match(x.body.innerHTML, /No frozen snapshot yet\. The first is written with <code>node scripts\/build-ledger\.js<\/code>/);
  // A frozen snapshot without the first development: the fold names it as text, the full table as a button.
  const projects = fixtures(), first = projects[0];
  const frozen = LS.snapshot(L.rows(projects.slice(1), { people, asOf: Date.parse(AS_OF) }), { name: '2026-fall', sourceDate: '2026-10-01' });
  x = loadLedgerUI({ projects, extra: { fetch: fetchOf({ 'data/ledger/index.json': { snapshots: [{ name: '2026-fall' }] }, 'data/ledger/2026-fall.json': frozen }) } });
  x.LU.periodFolds(); await settle();
  const h = x.LU.periodFolds()[2].html;
  assert.match(h, /Against <strong>2026-fall<\/strong> \(data as of 2026-10-01\): <strong>1<\/strong> new/);
  assert.ok(h.includes(`<span>${esc(first.title)}</span>`), 'the new development, by name');
  assert.doesNotMatch(h, /data-pnl-dev|<h3/, 'no button, no heading (the fold names it)');
  x.LU.render();
  assert.ok(x.body.innerHTML.includes(`data-pnl-dev="${esc(first.key)}">${esc(first.title)}</button>`), 'the full table: a button that opens it');
  assert.match(x.body.innerHTML, /<h3 class="sub-title">Since the last snapshot<\/h3>/);
});

test('the Forecast draws the folds, Growth renders the full table when the Forecast opens, the panel column fits it', () => {
  const t = src('js/timing.js'), set = t.slice(t.indexOf("PN.set('growth:timing', {"), t.indexOf('body.innerHTML = `', t.indexOf("PN.set('growth:timing', {")));
  assert.ok(set.includes('folds: root.PeelLedgerUI && root.PeelLedgerUI.periodFolds ? root.PeelLedgerUI.periodFolds() : [],'));
  assert.ok(set.includes('onMount: host => { const LU = root.PeelLedgerUI; if (LU && LU.syncFolds) LU.syncFolds(host); },'));
  assert.match(set, /then By period: the developments by stage, tier and expected year`/, 'the full table’s title');
  assert.match(set, /<strong>By period<\/strong> shares each development\\u2019s units left to build/);
  assert.match(src('js/growth-ui.js'), /run\('growth:ledger', 'timing', \(\) => \{ if \(root\.PeelLedgerUI\) root\.PeelLedgerUI\.render\(\); \}\);/);
  assert.match(src('js/analysis-tabs.js'), /if \(key === 'growth' && gSub === 'timing' && root\.PeelLedgerUI\) setTimeout\(\(\) => root\.PeelLedgerUI\.render\(\), 0\);/);
  assert.match(src('css/app.css'), /\.pnl-fold \.ldg-table th, \.pnl-fold \.ldg-table td \{ padding: var\(--space-1\); \}/);
  // isOn: the Forecast in sight (its rerender also sets the panel's folds again).
  const lu = src('js/ledger-ui.js');
  assert.match(lu, /AT\.getFootTab\(\) === 'growth' && AT\.getGSub\(\) === 'timing'/);
  assert.match(lu, /const rerender = \(\) => \{[^\n]*render\(\); refresh\(\); \};/);
  // No export reads the panes by id here: the Pipeline snapshot CSV reads model(); the pane ids are kept.
  assert.doesNotMatch(src('js/exports.js'), /ledger-body|timing-body/);
});

// ---- The pages (S6): the Forecast page and What's coming draw the panel's folds ----------------------
test('the Forecast page and What’s coming draw the folds as the reader left them; What’s coming is the Forecast page', () => {
  const s = src('js/ws-pages.js');
  const fn = s.slice(s.indexOf("function outlook(id = 'outlook') {"), s.indexOf('// ---- EA to construction'));
  assert.ok(fn.length > 100, 'outlook(id) is the Forecast page’s builder');
  assert.ok(fn.includes('folds: root.PeelLedgerUI && root.PeelLedgerUI.foldsNow ? root.PeelLedgerUI.foldsNow(t.folds) : t.folds || [],'));
  assert.ok(fn.includes('toMap(id, r)') && fn.includes("'data-ws-go': id") && fn.includes("loading(id, 'Timing the pipeline…')"), 'its map view is the page’s own: outlook or coming');
  assert.match(s, /const coming = \(\) => \(\{ \.\.\.outlook\('coming'\), name: 'What is coming, where, when and how sure\?', top: '' \}\);/);
  // The ledger's own page is gone (it was the only "Open Growth › Ledger"): its rows open from the full table.
  const lu = src('js/ledger-ui.js');
  assert.doesNotMatch(lu, /function page\(\)|data-ws-pick|Open Growth › Ledger|onPage/);
  assert.doesNotMatch(src('js/ws-pages.js'), /PeelLedgerUI\.page/);
  // The figure "?" receipts: both pages read the gate (By period's committed) and the servicing files.
  const H = require('../js/how.js');
  for (const id of ['outlook', 'coming']) for (const f of ['dc-gate.json', 'servicing.json', 'housing.json']) assert.ok(H.filesFor(id).includes(f), `${id}: ${f}`);
  // The page template draws the folds with their ids, open or shut as foldsNow gives them.
  const WP = (() => { const ctx = { module: { exports: {} } }; ctx.globalThis = ctx; vm.runInNewContext(src('js/ws-pages.js'), ctx); return ctx.module.exports; })();
  for (const open of [true, false]) {
    const { LU } = loadLedgerUI({ stored: { ledgerOpen: open } });
    const h = WP.pageHTML({ id: 'coming', name: 'What is coming, where, when and how sure?', answer: 'x', top: '', folds: LU.foldsNow(LU.periodFolds()) }, '');
    assert.ok(h.includes(`<details class="pnl-fold" data-psec="fold"${open ? ' open' : ''} id="pnl-by-period"><summary>By period</summary>`), `By period ${open ? 'open' : 'shut'}`);
    assert.ok(h.includes('<details class="pnl-fold" data-psec="fold" id="pnl-how-sure"><summary>How sure (tiers A to E)</summary>'));
    assert.doesNotMatch(h, /id="pnl-since"/, 'nothing to compare yet: left out, never blank');
    assert.ok(h.includes('data-at="growth:timing" data-full-table="growth"'), 'the developments: one tap, the full table');
  }
});

// ---- By period's rows are the scope's child nodes (S8): a municipality's plans ------------------------
// A plan tree as js/plan-rollup.js build gives it (nodes hold their children; placed[].at the shares).
function planTree({ withPlan = true } = {}) {
  const node = (id, kind, name, parent) => ({ id, kind, name, parent, children: [] });
  const mu = node('m:Brampton', 'municipality', 'Brampton', 'peel'), p1 = node('a:p1', 'plan', 'Plan 1', 'm:Brampton'), none = node('n:Brampton', 'none', 'Not in a plan', 'm:Brampton');
  mu.children = withPlan ? [p1, none] : [none];
  return { nodes: new Map([['peel', node('peel', 'peel', 'Peel', null)], [mu.id, mu], [p1.id, p1], [none.id, none]]), mu };
}
const bramptonOnly = () => fixtures().filter(p => p.municipality === 'Brampton');
function loadAtBrampton({ placed, tree = planTree(), state = {}, PT } = {}) {
  const projects = bramptonOnly(), [A, B] = projects;
  const pl = placed ? placed(projects) : [{ p: A, at: new Map([['peel', 1], ['m:Brampton', 1], ['a:p1', 0.6], ['n:Brampton', 0.4]]) }, { p: B, at: new Map([['peel', 1], ['m:Brampton', 1], ['a:p1', 1]]) }];
  const x = loadLedgerUI({ projects, extra: { PeelPlanTables: PT || { compute: () => ({ nodes: tree.nodes, placed: pl }) } } });
  Object.assign(x.ctx.PeelApp.state, { muni: 'Brampton', sp: [], mtsa: [] }, state);
  return { ...x, A, B, rows: L.rows(projects, { people, asOf: Date.parse(AS_OF) }) };
}
const cellsEqual = (a, b) => L.CUTOFFS.every(c => [...L.BUCKETS.map(x => x.key), null].every(bk => ['units', 'people'].every(measure => Math.abs(L.sumOf(a, { bucket: bk, cutoff: c.key, measure }) - L.sumOf(b, { bucket: bk, cutoff: c.key, measure })) < 1e-6)));

test('at a municipality, By period’s rows are its plans and Not in a plan, by Growth › Areas’ own shares', () => {
  const { LU, A, B, rows, body } = loadAtBrampton();
  const m = LU.model(), left = id => rows.find(r => r.id === id).left;
  assert.deepEqual([left(A.key), left(B.key)], [300, 200]);
  assert.equal(m.rowsBy, 'plan');
  assert.deepEqual(plain(m.r.root.children.map(g => g.name)), ['Plan 1', 'Not in a plan'], 'Not in a plan last');
  const [p1, none] = m.r.root.children;
  assert.ok(Math.abs(L.sumOf(p1.cells) - (left(A.key) * 0.6 + left(B.key))) < 1e-6, 'Plan 1: A’s share and all of B');
  assert.ok(Math.abs(L.sumOf(none.cells) - left(A.key) * 0.4) < 1e-6);
  assert.ok(m.r.check < 1e-6, 'the rows add up to the municipality');
  // The municipality's total is the same as with municipality rows (only the split changes).
  assert.ok(cellsEqual(m.r.root.cells, L.rollup(rows, 'municipality').groups.get('Brampton').cells));
  const t = tableOf(LU.periodFolds()[0].html);
  assert.match(t, /<caption>Units left to build by plan and milestone/);
  assert.match(t, /<thead><tr><th scope="col">Plan<\/th>/);
  assert.match(t, /<tbody><tr><th scope="row">Plan 1<\/th>[\s\S]*<tr><th scope="row">Not in a plan<\/th>[\s\S]*<\/tbody>/);
  assert.match(t, /<tfoot><tr class="ldg-peel"><th scope="row">Brampton<\/th>/, 'the total row names the scope');
  LU.render(); assert.equal(tableOf(body.innerHTML), t, 'the full table draws the same table');
  assert.match(m.method, /at a municipality, its plans and Not in a plan/);
});

test('municipality rows at Peel, at a plan, MTSA or census-area filter, with no plan tree, or no plan in it', () => {
  const muniRows = (x, why) => {
    const m = x.LU.model();
    assert.equal(m.rowsBy, 'municipality', why);
    assert.deepEqual(plain(m.r.root.children.map(g => g.name)), ['Brampton'], why);
    assert.match(tableOf(x.LU.periodFolds()[0].html), /<th scope="col">Municipality<\/th>/, why);
  };
  muniRows(loadAtBrampton({ state: { muni: '' } }), 'no municipality filter');
  muniRows(loadAtBrampton({ state: { sp: ['x'] } }), 'a plan filter (its sub-areas wait for phase 6)');
  muniRows(loadAtBrampton({ state: { mtsa: ['y'] } }), 'an MTSA filter');
  muniRows(loadAtBrampton({ state: { daCtx: { keys: new Set() } } }), 'a census area');
  muniRows(loadAtBrampton({ PT: {} }), 'no plan tables');
  muniRows(loadAtBrampton({ PT: { compute: () => { throw new Error('not ready'); } } }), 'the tree not ready');
  muniRows(loadAtBrampton({ tree: planTree({ withPlan: false }) }), 'a municipality with no plan');
  // (with no muni the footer still says Peel; with one, its name)
  assert.match(tableOf(loadAtBrampton({ state: { sp: ['x'] } }).LU.periodFolds()[0].html), /<tr class="ldg-peel"><th scope="row">Brampton<\/th>/);
});

test('a development the plan tree did not place counts whole in Not in a plan', () => {
  const { LU, A, B, rows } = loadAtBrampton({ placed: ([a]) => [{ p: a, at: new Map([['peel', 1], ['m:Brampton', 1], ['a:p1', 1]]) }] });
  const m = LU.model(), [p1, none] = m.r.root.children;
  assert.deepEqual(plain(m.r.root.children.map(g => g.name)), ['Plan 1', 'Not in a plan']);
  assert.ok(Math.abs(L.sumOf(p1.cells) - rows.find(r => r.id === A.key).left) < 1e-6);
  assert.ok(Math.abs(L.sumOf(none.cells) - rows.find(r => r.id === B.key).left) < 1e-6);
  assert.ok(m.r.check < 1e-6);
});
