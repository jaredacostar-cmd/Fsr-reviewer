'use strict';
// Navigation phase 4 (docs/architecture-review/navigation-design.md §3.4, §5, §7; pros-and-cons N-6, N-11):
// Capital › DC timing is one list of the 2026 DC projects, one row per project on the key both DC models
// share (`ln.p || ln.c`), with both verdicts named: in service before the capacity it relieves runs out
// (js/dc-cost.js dcAnalysis) and the first homes before it is built (js/dc-impact.js, worked out after the
// list paints). A Status filter, the one System control and one row of sorts; the reliefs that are no DC
// line are named, not listed; Home's DC projects late opens it at Late; the Capital page hosts it.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const plain = o => JSON.parse(JSON.stringify(o));
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

// Three DC line projects (groups), the capacity analysis (R: two of them, and a plant step that is no DC
// line), a constraint flagged "check the data" relieved by the third, and the allocation (m).
const GROUPS = [
  { key: '22-1', sys: 'wastewater', k: 'primary', d: 900, y0: 2030, y1: 2031, lenM: 1200, status: 'approved', lines: [{ p: '22-1' }] },
  { key: '25-9', sys: 'water', k: 'transmission', d: 600, y0: 2035, y1: 2035, lenM: 800, status: 'proposed', lines: [{ p: '25-9' }] },
  { key: '28-3', sys: 'wastewater', k: 'local', d: 300, y0: 2029, y1: 2029, lenM: 300, status: 'proposed', lines: [{ p: '28-3' }] },
];
const R = { ppu: 2.5, baseBo: 1200, list: [
  { key: 'ln:wastewater:22-1', rec: 'advance', outY: 2028, bo: 500, sys: 'ww', name: 'Sanitary main 900 mm · 22-1', short: 'Sanitary main 22-1', cons: [{}] },
  { key: 'ln:water:25-9', rec: 'keep', outY: 2040, bo: 10, sys: 'water', name: 'Watermain 600 mm · 25-9', short: 'Watermain 25-9', cons: [{}] },
  { key: 'step:x', rec: 'advance', outY: 2027, bo: 900, sys: 'ww', name: 'G.E. Booth: expansion to 600 ML/d', short: 'G.E. Booth expansion', cons: [{}] },
] };
const NEEDS = [{ status: 'check', relief: [{ key: 'ln:wastewater:28-3' }] }, { status: 'gap', relief: [{ key: 'ln:wastewater:22-1' }] }];
const dev = (key, tier, units) => ({ p: { key, title: key, municipality: 'Brampton' }, tier, units, q: 1, pop: units * 3, how: {}, e: { employment: { jobs: 0 } } });
const MODEL = () => ({ gateTiers: ['A', 'B1'], byDev: new Map(), projects: new Map([
  ['wastewater:22-1', { ...GROUPS[0], devs: [dev('d1', 'A', 100), dev('d2', 'B1', 50), dev('d3', 'B2', 999)], gaps: 1, cost: 1e6, built: 0, shed: 0 }],
  ['water:25-9', { ...GROUPS[1], devs: [dev('d4', 'A', 300)], gaps: 0, cost: 3e6, built: 0, shed: 0 }],
  ['wastewater:28-3', { ...GROUPS[2], devs: [], gaps: 0, cost: null, built: 0, shed: 0 }],
]) });

// js/dc-projects.js in a vm, whole (a const read before its line would throw here; eslint here is no-undef only).
// (the DC program: one line of 22-1 drawn; the result open and a development open for the card and openList)
const INFRA = () => ({ wastewater: { lines: [{ p: '22-1', sys: 'wastewater', k: 'primary', g: [[-79.70, 43.70], [-79.71, 43.71]] }] }, water: { lines: [] } });
function load(o = {}) {
  const stored = { ...(o.store || {}) }, writes = [], sets = [], timers = [], handlers = {};
  const calls = { model: 0, openPage: [], sectionAt: [], renderPage: 0, showDcLine: [], restore: [], reopen: 0, closeResult: 0, devClose: 0, openTab: [], setSys: 0, setMode: [], loadSewers: 0, fit: 0, setDcOn: 0 };
  let cur = o.current || null;
  const st = { sys: o.sys || 'both', mode: o.mode || 'full', page: o.page || 'home', lab: !!o.lab, dev: o.dev || null, result: !!o.result, devOpen: o.devOpen || null };
  const SEW = { data: o.sewers === false ? null : {} };
  const U = { esc: x => String(x), fmtNum: n => String(n), fmtMoney: n => `$${Math.round(n)}`, roundPop: n => Math.round(n), csvCell: v => String(v), CAPITAL: { asOf: 'Oct 2026' }, isPublic: () => !!o.public,
    store: { get: (k, d) => (own(stored, k) ? stored[k] : d), set: (k, v) => { writes.push(k); stored[k] = v; } } };
  const document = { addEventListener: (t, f) => { (handlers[t] = handlers[t] || []).push(f); }, getElementById: () => null };
  const MP = { allNeeds: () => NEEDS, reliefKey: r => r.key, dcnFilter: 'gap', showDcLine: ln => calls.showDcLine.push(ln) };
  const App = { state: { svcModel: o.svcModel === false ? null : {}, dcInfra: o.dcInfra === undefined ? INFRA() : o.dcInfra, ss: o.ss || null } };
  const window = { PeelUtil: U, document,
    PeelPanel: { areaHead: (w, name, status, identity) => ({ w, name, status, identity }), set: (k, spec) => sets.push([k, spec]), kv: (k, v, t) => ({ html: `<kv>${k}=${v}${t ? `:${t}` : ''}</kv>` }), chip: c => c.text },
    PeelMapMarkers: { THIS_YEAR: 2026, SEW, getDcOn: () => ({ on: !o.dcOff }) },
    PeelDcCost: { dcAnalysis: () => o.R || R, projLabels: x => ({ short: `Main ${x.id}` }), dcaTimingChart: (list, n) => `<chart ${list.length}/${n}>`, dcaBudget: () => ({ keep: [], defer: [], later: [], end: 2035 }), DCB: { budget: 1e9, years: 10 }, dcRates: () => null },
    PeelDcImpact: { current: () => cur, model: () => { calls.model++; const m = 'model' in o ? o.model : MODEL(); if (m) cur = m; return m; }, groupProjects: () => o.groups || GROUPS },
    PeelDcInfra: { dcM: () => 0 }, PeelMasterPlan: MP, PeelSvcPlants: { hz: { end: 2051 } },
    PeelApp: App,
    PeelAnalysisTabs: { getSys: () => st.sys, sysSeg: () => `<div class="seg" aria-label="System">[${st.sys}]</div>`, openTab: (t, v) => calls.openTab.push([t, v]), setSys: () => { calls.setSys++; } },
    PeelSvcScope: { restore: r => calls.restore.push(r), hasResult: () => st.result, reopenResult: () => { calls.reopen++; }, closeResult: () => { calls.closeResult++; st.result = false; } },
    DevScope: { current: () => st.devOpen, close: () => { calls.devClose++; st.devOpen = null; } },
    PeelSewerCap: { loadSewers: () => { calls.loadSewers++; return Promise.resolve(o.loaded === undefined ? {} : o.loaded).then(d => { if (d) SEW.data = d; return d; }); } },
    PeelMapAnalysis: { setDcOn: () => { calls.setDcOn++; } }, PeelMapCore: { map: { fitBounds: () => { calls.fit++; } } }, L: { latLngBounds: x => x },
    PeelLabs: { on: id => id === 'funding' && st.lab },
    PeelDevVerdict: { scopedDev: () => st.dev },
    PeelDcaTab: { fundingSpec: () => ({ answer: 'the screen', figures: [{ v: 3, u: '', label: 'within the screen' }], chart: '' }) },
    PeelWorkspaces: { mode: () => st.mode, page: () => st.page, openPage: id => calls.openPage.push(id), renderPage: () => { calls.renderPage++; }, setMode: m => { calls.setMode.push(m); st.mode = m; } },
    PeelWsPages: { sectionAt: (ws, id) => calls.sectionAt.push([ws, id]) },
  };
  const ctx = { window, document, setTimeout: f => timers.push(f), module: { exports: {} } }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/dc-projects.js'), ctx);
  const D = window.PeelDcProjects;
  // A click on an element (dataset; inChips: inside the Status chips).
  const click = (dataset, inChips) => { const el = { dataset, closest: s => (s === '.dcp-status' ? (inChips ? {} : null) : el) }; for (const f of handlers.click || []) f({ target: el }); };
  return { D, sets, timers, calls, st, MP, App, SEW, stored, writes, click, ctx, setCur: m => { cur = m; } };
}
const keys = rows => plain(rows.map(x => x.k));

test('mergeRows: one row per DC line project, its capacity verdict by the shared key; the reliefs that are no DC line apart', () => {
  const { D } = load();
  const M = D.mergeRows(GROUPS, R, null, { check: new Set(['wastewater:28-3']) });
  assert.deepEqual(keys(M.rows), ['wastewater:22-1', 'water:25-9', 'wastewater:28-3']);
  assert.deepEqual(M.rows.map(x => x.st), ['gap', 'planned', 'check']);
  assert.equal(M.rows[0].t.bo, 500); assert.equal(M.rows[2].t, null);
  assert.deepEqual(M.other.map(r => r.key), ['step:x'], 'the plant step: no row');
  // (review: nothing held back if cancelled; a line relief with no project row is no row either, so it is named)
  const R2 = { ...R, list: [...R.list, { key: 'ln:wastewater:28-3', rec: 'review', bo: 0, cons: [] }, { key: 'ln:wastewater:99-9', rec: 'advance', bo: 1, cons: [] }] };
  const M2 = D.mergeRows(GROUPS, R2, null);
  assert.equal(M2.rows[2].st, 'ok');
  assert.deepEqual(M2.other.map(r => r.key), ['step:x', 'ln:wastewater:99-9']);
  // With the allocation: the model's project, its counted developments (A and B1) and their units.
  const M3 = D.mergeRows([...MODEL().projects.values()], R, MODEL());
  assert.deepEqual(M3.rows.map(x => x.units), [150, 300, 0]);
  assert.equal(Math.round(M3.rows[0].perUnit), Math.round(1e6 / 150));
  assert.deepEqual(D.mergeRows(GROUPS, null, null).rows.map(x => x.st), [null, null, null], 'no analysis: no verdict');
});

test('rowsFor: the System, the Status, then one row of sorts (the allocation’s wait for it; $ a unit for the lab)', () => {
  const L = load(), { D, st } = L;
  const at = (o = {}) => { Object.assign(D.state, { status: 'all', sort: 'soonest' }, o.state || {}); st.sys = o.sys || 'both'; st.lab = !!o.lab; return keys(D.rowsFor(R, o.m || null)); };
  assert.deepEqual(at({ sys: 'ww' }), ['wastewater:22-1', 'wastewater:28-3']);
  assert.deepEqual(at({ sys: 'water' }), ['water:25-9']);
  assert.deepEqual(at({ state: { status: 'gap' } }), ['wastewater:22-1']);
  assert.deepEqual(at({ state: { status: 'check' } }), ['wastewater:28-3']);
  assert.deepEqual(at(), ['wastewater:22-1', 'water:25-9', 'wastewater:28-3'], 'Soonest: the year the capacity runs out');
  assert.deepEqual(at({ state: { sort: 'impact' } }), ['wastewater:22-1', 'water:25-9', 'wastewater:28-3'], 'Largest impact: held back if cancelled');
  assert.deepEqual(at({ state: { sort: 'affected' } }), at(), 'Most affected waits for the allocation: Soonest until then');
  assert.deepEqual(at({ state: { sort: 'affected' }, m: MODEL() }), ['water:25-9', 'wastewater:22-1', 'wastewater:28-3'], 'by units relying on it');
  assert.deepEqual(at({ state: { sort: 'perunit' }, m: MODEL() }), at(), '$ a unit with the lab off: Soonest (no hidden measure)');
  assert.deepEqual(at({ state: { sort: 'perunit' }, m: MODEL(), lab: true }), ['wastewater:22-1', 'water:25-9', 'wastewater:28-3'], 'the lowest cost a unit first');
  // Soonest: a capacity running out after the horizon after the dated ones, the largest impact first; a project
  // relieving no modelled constraint after every one that does, however soon it is built.
  const G4 = [...GROUPS, { key: '30-1', sys: 'wastewater', k: 'local', d: 250, y0: 2026, y1: 2026, lenM: 100, status: 'approved', lines: [] }, { key: '31-2', sys: 'water', k: 'local', d: 300, y0: 2033, y1: 2033, lenM: 100, status: 'proposed', lines: [] }];
  const R4 = { ...R, list: [...R.list, { key: 'ln:wastewater:30-1', rec: 'keep', outY: null, bo: 5, cons: [{}] }, { key: 'ln:water:31-2', rec: 'keep', outY: null, bo: 80, cons: [{}] }] };
  const L4 = load({ groups: G4 });
  assert.deepEqual(keys(L4.D.rowsFor(R4, null)), ['wastewater:22-1', 'water:25-9', 'water:31-2', 'wastewater:30-1', 'wastewater:28-3']);
});

test('one stored sort: DC timing’s, else DC projects’ Most affected or $ a unit, else Soonest; the open project is not kept', () => {
  const { D } = load();
  const sortOf = o => D.sortOf(k => (own(o, k) ? o[k] : null));
  assert.equal(sortOf({ dcSort: 'impact' }), 'impact');
  assert.equal(sortOf({ dcaPnlSort: 'impact' }), 'impact');
  assert.equal(sortOf({ dcSort: 'affected', dcaPnlSort: 'impact' }), 'affected', 'the one sort wins');
  assert.equal(sortOf({ dcProjSort: 'perunit' }), 'perunit');
  assert.equal(sortOf({ dcProjSort: 'affected' }), 'affected');
  assert.equal(sortOf({ dcProjSort: 'soonest' }), 'soonest', 'DC projects’ Soonest was the construction year: not carried (the default)');
  assert.equal(sortOf({}), 'soonest');
  for (const v of ['__proto__', 'constructor', 'nonsense']) { assert.equal(sortOf({ dcSort: v }), 'soonest', v); assert.equal(sortOf({ dcProjSort: v }), 'soonest', v); }
  const L = load({ store: { dcProjSel: 'wastewater:22-1', dcProjSort: 'perunit' } });
  assert.equal(L.D.state.sel, null, 'a stored project is no longer read'); assert.equal(L.D.state.sort, 'perunit'); assert.equal(L.D.state.status, 'all');
  // A sort tap stores the one sort only.
  L.click({ dcprojSort: 'impact' });
  assert.equal(L.D.state.sort, 'impact'); assert.equal(L.stored.dcSort, 'impact');
  L.click({ dcprojOpen: 'wastewater:22-1' }); L.click({ dcStatus: 'gap' }, true);
  assert.deepEqual(L.writes, ['dcSort'], 'nothing else written: the open project and the Status are for the visit');
});

test('the second verdict’s model is worked out once the list has painted: one build, none once it is worked out', () => {
  let L = load();
  assert.ok(L.D.panelSpec()); L.D.panelSpec();
  assert.equal(L.timers.length, 1, 'two paints, one scheduled build'); assert.equal(L.calls.model, 0, 'never on the paint');
  L.timers[0]();
  assert.equal(L.calls.model, 1);
  assert.equal(L.sets.at(-1)[0], 'dca:timing', 'then the list is drawn again');
  assert.doesNotMatch(L.sets.at(-1)[1].lists[0].rows[0].html, /working out/);
  L.D.panelSpec(); assert.equal(L.timers.length, 1, 'worked out: nothing scheduled');
  // The model not ready (or failing): nothing redrawn, and a later paint may ask again.
  L = load({ model: null });
  L.D.panelSpec(); L.timers[0]();
  assert.equal(L.calls.model, 1); assert.equal(L.sets.length, 0);
  L.D.panelSpec(); assert.equal(L.timers.length, 2);
  // Not loaded yet (the servicing model or the sewers): the loading panel, nothing built.
  L = load({ svcModel: false });
  assert.match(L.D.panelSpec().answer, /Loading the DC program/); assert.equal(L.timers.length, 0);
});

test('the list: both verdicts named on every row, the Status chips, the System, the sorts; the reliefs that are no DC line named', () => {
  const L = load(), s = L.D.panelSpec();
  assert.deepEqual([s.head.w, s.head.name], ['Capital › DC timing', 'Is each DC project in time?']);
  assert.deepEqual(plain(s.head.status), { tone: 'over', text: '1 late' });
  assert.equal(s.fullTitle, 'Capital › DC timing · Peel: every 2026 DC project, both verdicts');
  assert.deepEqual(plain(s.figures.map(f => f.label)), ['DC projects', 'late', 'first homes before it is built', 'constrained at build-out']);
  assert.deepEqual(plain(s.figures[1].attrs), { 'data-dc-status': 'gap' }, 'the late figure sets the list to Late');
  assert.equal(s.figures[2].v, '…', 'the second verdict: still being worked out');
  assert.equal(s.figures[0].ctx, '2 wastewater · 1 water');
  const r = s.lists[0].rows[0];
  assert.deepEqual(plain(r.attrs), { 'data-dcproj-open': 'wastewater:22-1' });
  assert.match(r.html, /Main 22-1<small>project 22-1 · construction 2030–2031 · approved 2026<\/small>/);
  assert.match(r.html, /<span class="pnl-r-year t-over">≈2028<\/span>/);
  assert.match(r.html, /<span>capacity runs out<\/span><span class="t-over">in service after it runs out<\/span>/);
  assert.match(r.html, /first homes: working out who relies on it…/);
  assert.match(s.lists[0].rows[2].html, /<span class="t-tight">check the data<\/span>/);
  const t = s.lists[0].tools;
  for (const k of ['gap', 'planned', 'check', 'all']) assert.ok(t.includes(`data-dc-status="${k}"`), k);
  assert.ok(!t.includes('data-dc-status="ok"'), 'a status no row has is left out');
  assert.match(t, /data-dc-status="gap" aria-pressed="false">Late 1</); assert.match(t, /data-dc-status="all" aria-pressed="true">All 3</);
  assert.ok(t.includes('[both]'), 'the one System control');
  assert.deepEqual([...t.matchAll(/data-dcproj-sort="(\w+)"/g)].map(m => m[1]), ['soonest', 'impact', 'affected'], 'four sorts with the lab, three without');
  assert.match(t, /title="Most people held back by build-out if it were cancelled">Largest impact</);
  // The answer: both verdicts, the total held back and the largest single relief (of every relief: a plant
  // expansion here), the reliefs that are no DC line named with their home.
  assert.match(s.answer, /^Of the <strong>3 DC projects<\/strong> on the 2026 DC maps, <strong>1<\/strong> is in service only after the capacity it relieves runs out\./);
  assert.match(s.answer, /With every project as scheduled, <strong>≈1200 people<\/strong> are still constrained at build-out; without the <strong>G\.E\. Booth expansion<\/strong>, ≈900 more would be, the most of any one project\./);
  assert.match(s.answer, /Also late: <strong>1<\/strong> other relief with no DC line/);
  assert.match(s.answer, /data-at="svc:capacity">Servicing › Capacity →<\/button>/);
  assert.match(s.chart, /<chart 2\/6>/, 'the chart of the rows with a capacity verdict');
  assert.doesNotMatch(JSON.stringify(s), /screens? late/i);
  assert.match(s.method, /The two answer different questions and can disagree/);
  assert.equal(s.folds.length, 0, 'no Funding fold while the lab is off');
  // Once worked out: the second verdict in words.
  L.setCur(MODEL()); const s2 = L.D.panelSpec();
  assert.equal(s2.figures[2].v, '1');
  assert.match(s2.lists[0].rows[0].html, /<span class="t-over">1 expected before it is built<\/span>/);
  assert.match(s2.lists[0].rows.find(x => x.attrs['data-dcproj-open'] === 'water:25-9').html, /first homes in time for the 1 relying on it/);
  assert.match(s2.answer, /; <strong>1<\/strong> has developments whose first homes come before it is built\./);
  // At Water: the list, its title and the header name the System; the reliefs late elsewhere are not named.
  L.st.sys = 'water'; const s3 = L.D.panelSpec();
  assert.equal(s3.lists[0].title, 'Water projects'); assert.equal(s3.lists[0].total, 1);
  assert.match(s3.head.identity, /^Peel · water · 1 DC projects/); assert.doesNotMatch(s3.answer, /Also late/);
  // The Funding lab: the fold, with the projects relied on but not in the screen once the allocation is in.
  L.st.sys = 'both'; L.st.lab = true; const s4 = L.D.panelSpec();
  assert.equal(s4.folds[0].title, 'Funding screen (Labs)'); assert.match(s4.folds[0].html, /not in the funding screen <small>/);
  assert.ok(s4.lists[0].tools.includes('data-dcproj-sort="perunit"'));
});

test('at a development there is no area list: its Capital panel is js/dca-tab.js’s', () => {
  const L = load({ dev: { key: 'd1' } });
  assert.equal(L.D.panelSpec(), null);
  L.D.render(); assert.equal(L.sets.length, 0);
  assert.equal(L.timers.length, 0, 'and nothing built');
});

test('clicks: a Status chip filters and sets the workbook’s DC filter; the late figure and Home’s figure set the Status only; a row opens its project, on a page in place (from another page the Capital page), on the map its card', () => {
  let L = load();
  L.click({ dcStatus: 'planned' }, true);
  assert.equal(L.D.state.status, 'planned'); assert.equal(L.MP.dcnFilter, 'planned:all');
  L.st.sys = 'water'; L.click({ dcStatus: 'all' }, true); assert.equal(L.MP.dcnFilter, 'all:water', 'the status and the System at the tap');
  L.MP.dcnFilter = 'gap'; L.D.state.sel = 'wastewater:22-1';
  L.click({ dcStatus: 'gap' }, false);
  assert.equal(L.D.state.status, 'gap'); assert.equal(L.D.state.sel, null); assert.equal(L.MP.dcnFilter, 'gap', 'the late figure leaves the workbook’s filter');
  L.click({ wsPage: 'projects', dcStatus: 'gap' }, false);
  assert.equal(L.MP.dcnFilter, 'gap', 'Home’s figure too');
  L.click({ dcStatus: '__proto__' }, true); assert.equal(L.D.state.status, 'all');
  // A row on a page: in place on the Capital page; from another page, the Capital page at it.
  L = load({ mode: 'home', page: 'growth' });
  L.click({ dcprojOpen: 'wastewater:22-1' });
  assert.deepEqual(L.calls.sectionAt, [['capital', 'timing']]); assert.deepEqual(L.calls.openPage, ['projects']); assert.equal(L.D.state.sel, 'wastewater:22-1');
  L = load({ mode: 'home', page: 'projects' });
  L.click({ dcprojOpen: 'water:25-9' });
  assert.deepEqual(L.calls.openPage, []); assert.equal(L.D.state.sel, 'water:25-9'); assert.ok(L.calls.renderPage > 0, 'the page redrawn');
  assert.deepEqual(L.calls.showDcLine, [], 'no card on a page');
  // A project picked before the allocation is worked out waits for it (its name and the way back), never the
  // list; the stored panel (the map's, an area's Capital section) stays the list.
  const w = L.D.openSpec();
  assert.equal(w.head.name, 'Main 25-9 · 25-9'); assert.deepEqual(plain(w.head.back), { label: 'All DC projects', attrs: { 'data-dcproj-back': '' } });
  assert.match(w.answer, /Working out the developments relying on it/);
  assert.equal(L.D.panelSpec().head.name, 'Is each DC project in time?', 'the panel: the list');
  L.D.render(); assert.equal(L.sets.at(-1)[1].head.name, 'Is each DC project in time?');
  L.setCur(MODEL()); const p = L.D.openSpec();
  assert.equal(p.head.trail[1].label, 'Capital › DC timing'); assert.equal(p.head.wsName, 'Main 25-9 · 25-9');
  L.click({ dcprojBack: '' }); assert.equal(L.D.state.sel, null); assert.equal(L.D.openSpec(), null);
  // On the map (the full map or a workspace's): the row opens the project's card, its dcwork: scope
  // (js/masterplan.js showDcLine), the lines from the DC program and the map fitted to them; nothing in place.
  for (const mode of ['full', 'ws']) {
    L = load({ mode });
    L.click({ dcprojOpen: 'wastewater:22-1' });
    assert.equal(L.D.state.sel, null, mode); assert.deepEqual(L.calls.openPage, []); assert.equal(L.calls.renderPage, 0);
    assert.deepEqual(plain(L.calls.showDcLine.map(ln => ln.p)), ['22-1']); assert.equal(L.calls.fit, 1);
    assert.equal(L.calls.model, 0, 'a tap never works out the allocation');
  }
  // (the DC layer off: on first; the DC program still loading: the shared link's way, js/svc-scope.js restore)
  L = load({ dcOff: true }); L.click({ dcprojOpen: 'wastewater:22-1' }); assert.equal(L.calls.setDcOn, 1);
  L = load({ dcInfra: null }); L.click({ dcprojOpen: 'wastewater:22-1' });
  assert.deepEqual(L.calls.restore, ['dcwork:wastewater:22-1']); assert.deepEqual(L.calls.showDcLine, []);
  L = load(); L.click({ dcprojOpen: 'water:25-9' }); assert.deepEqual(L.calls.restore, ['dcwork:water:25-9'], 'no line drawn for it yet');
});

test('source pins: DC timing’s panel moved to js/dc-projects.js; the analysis table stays in the full table, captioned; the files a figure reads', () => {
  const dca = src('js/dca-tab.js');
  assert.doesNotMatch(dca, /function timingSpec\(|data-dca-pnlsort|dcaPnlSort/, 'one DC timing panel');
  assert.match(dca, /<caption>If one project were cancelled: every DC project and relief \(plant expansions and facilities too\)<\/caption>/);
  assert.match(dca, /return window\.PeelDcProjects && window\.PeelDcProjects\.panelSpec \? window\.PeelDcProjects\.panelSpec\(\) : null;/, 'an area’s Capital section: the merged list');
  assert.match(dca, /if \(PN\) PN\.set\('dca:timing', siteTimingSpec\(p, st, f\)\);/, 'a development keeps its own');
  assert.match(src('js/dc-projects.js'), /shown = true; PN\(\)\.set\('dca:timing', spec\);/);
  assert.doesNotMatch(src('js/dc-projects.js'), /'dca:dcproj'|dcProjSel|store\.set\(\{ sel/);
  assert.doesNotMatch(src('js/sections.js'), /dca:dcproj/);
  const H = require('../js/how.js');
  assert.ok(!own(H.FILES, 'dca:dcproj'));
  for (const f of ['sewers.json', 'dc-joins.json', 'servicing.json', 'dc-infra.json']) { assert.ok(H.filesFor('dca:timing').includes(f), `dca:timing ${f}`); assert.ok(H.filesFor('projects').includes(f), `the Capital page ${f}`); }
  const labs = require('../js/labs.js');
  assert.equal(labs.LABS.find(l => l.id === 'funding').where, 'Capital › DC timing');
  // The map panel's segs wrap (four sorts with the lab beside the System on a phone); the Status chips have a line of their own.
  const css = src('css/app.css');
  assert.match(css, /\.pnl-list-h \.seg \{ display: inline-flex; flex-wrap: wrap; gap: 2px; \}/);
  assert.match(css, /\.pnl-list-h \.dcp-status \{ flex-basis: 100%; margin: 0; \}/);
  // A System tap off screen clears the stored list, never a development's own Capital panel.
  assert.match(src('js/analysis-tabs.js'), /else if \(root\.PeelPanel && !\(root\.DevScope && root\.DevScope\.current\(\)\)\) root\.PeelPanel\.clear\('dca:timing'\); \}/);
});

test('Home’s DC projects late keeps its source (every relief, the analysis itself) and opens the list at Late; the Capital page hosts the list and a project in place', () => {
  const s = src('js/ws-pages.js'), h = s.slice(s.indexOf('function homeFigures('), s.indexOf('function home()'));
  assert.match(h, /const R = root\.PeelDcCost\.dcAnalysis\(\); late = \{ v: R\.list\.filter\(r => r\.rec === 'advance'\)\.length \};/);
  assert.doesNotMatch(h, /specOf\('dca:timing'/, 'not the panel’s figure: the list counts DC lines only');
  assert.match(h, /attrs: \{ \.\.\.go\('projects', 'DC projects'\), 'data-dc-status': 'gap' \}/);
  const p = s.slice(s.indexOf('function projects()'), s.indexOf('// ---- Forecast'));
  assert.match(p, /return wsSection\('capital', t\.head && t\.head\.back \? asSection\(m, t\) : m\);/);
  assert.match(p, /one = \(!wsSec\.capital \|\| wsSec\.capital === 'timing'\) && DP && DP\.openSpec \? DP\.openSpec\(\) : null;/, 'the project in place on DC timing’s section only');
  assert.match(p, /const t = one \|\| specOf\('dca:timing', areaScope\);/);
  const mp = s.slice(s.indexOf('function dcProjMap()'), s.indexOf('function projects()'));
  assert.match(mp, /DI\.current && DI\.current\(\)/); assert.doesNotMatch(mp, /wsSec\.capital === 'dcproj'|DI\.model\(\)/);
  assert.match(s, /if \(gp\.dataset\.wsPage === 'projects' \|\| gp\.dataset\.wsPage === 'eaflow'\) \{ wsSec\.capital = null; const DP = root\.PeelDcProjects; if \(DP && DP\.state\.sel\) \{ DP\.state\.sel = null; DP\.render\(\); \} \}/, 'the bar’s DC timing: the list again');
  // The page in a vm: the list (a row opens in place: toMap passes it), then a project open with its way back.
  const list = { head: { status: { tone: 'over', text: '1 late' }, identity: 'Peel · 3 DC projects' }, answer: 'Of the 3 DC projects', figures: [{ v: '3', label: 'DC projects' }], chart: '', lists: [{ title: 'Water and wastewater projects', rows: [{ attrs: { 'data-dcproj-open': 'wastewater:22-1' }, html: 'r' }], total: 1 }], folds: [], method: 'm', sources: 's' };
  const proj = { head: { back: { label: 'All DC projects', attrs: { 'data-dcproj-back': '' } }, wsName: 'Main 22-1 · 22-1', status: null, identity: 'Wastewater' }, answer: '<strong>2 developments</strong> rely on it.', figures: [], lists: [{ title: 'Needs it to connect', rows: [{ attrs: { 'data-pnl-dev': 'd1' }, html: 'd' }], total: 1 }], folds: [], method: 'm', sources: 's' };
  let stored = list, open = null;
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelUtil: { esc: x => String(x), fmtNum: n => String(n), fmt1: n => n.toFixed(1) },
    PeelPanel: { get: k => (k === 'dca:timing' ? { scope: 'area', spec: stored } : null), scenarioChip: () => '' },
    PeelWorkspaces: { BY_ID: { projects: { label: 'DC projects' } } }, PeelApp: { state: {} }, PeelDcProjects: { state: { sel: null }, openSpec: () => open },
    PeelSections: { WORKSPACES: { capital: { host: 'projects', secs: [{ id: 'timing', title: 'DC timing', page: 'projects' }, { id: 'projects', title: 'Projects', tab: 'dca', keys: ['dca:projects'] }] } } } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/ws-pages.js'), ctx);
  const P = window.PeelWsPages;
  let m = P.build('projects');
  assert.equal(m.answer, 'Of the 3 DC projects'); assert.equal(m.lists.length, 1, 'no borrowed lists');
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-dcproj-open': 'wastewater:22-1' }, 'a row opens in place');
  assert.match(m.top, /data-ws-page="projects" aria-pressed="true">DC timing</);
  assert.deepEqual(plain(m.actions[0]), { label: 'Open the map', attrs: { 'data-ws-go': 'projects' }, primary: true });
  // (the project from js/dc-projects.js openSpec, the stored panel still the list; its Open the map: its card)
  open = proj; window.PeelDcProjects.state.sel = 'wastewater:22-1'; m = P.build('projects');
  assert.equal(m.name, 'Main 22-1 · 22-1');
  assert.deepEqual(plain(m.actions[0].attrs), { 'data-ws-go': 'projects', 'data-ws-dcwork': 'wastewater:22-1' }, 'Open the map: the map view at the project’s card');
  assert.match(m.answer, /^<span class="ws-back small"><button type="button" class="btn small link" data-dcproj-back="">‹ All DC projects<\/button><\/span><strong>2 developments<\/strong>/);
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': 'projects', 'data-ws-dev': 'd1' }, 'a development opens on the map view');
  // A DC project picked in a page's search: the Capital page at it, DC timing's section (js/workspaces.js routePick).
  assert.match(src('js/workspaces.js'), /if \(h\.hit === 'dc'\) return \{ page: 'projects', wsec: 'timing', dcSel: h\.key \};/);
});

// ---- Chunk 2: a DC project row opens its dcwork: scope; the DC timing tool result is the list ----------

test('a DC project’s card (its dcwork: scope on the map): both verdicts, then the developments relying on it by tier; drawn again once the allocation is worked out', () => {
  const ln = INFRA().wastewater.lines[0];
  // Not worked out yet: the first verdict, the second "working out", one build; then the card drawn again once.
  let L = load({ result: true, ss: 'dcwork:wastewater:22-1' });
  let h = L.D.cardHTML(ln);
  assert.match(h, /^<p class="headline">In service ≈2031, after the capacity it relieves runs out \(≈2028\): <strong>late<\/strong>\. Working out who relies on it…<\/p>/);
  assert.match(h, /<kv>In service before the capacity runs out\?=in service after it runs out <small>capacity runs out ≈2028 · construction 2030–2031<\/small>:over<\/kv>/);
  assert.match(h, /<kv>First homes before it is built\?=working out who relies on it…<\/kv>/);
  assert.match(h, /Working out the developments relying on it…/);
  assert.doesNotMatch(h, /data-dcproj-csv/, 'no CSV before there is a list');
  assert.match(h, /<button type="button" class="btn small link" data-scope-result-close data-at="dca:timing">All DC projects ›<\/button>/);
  L.D.cardHTML(ln); assert.equal(L.timers.length, 1, 'two paints, one build'); assert.equal(L.calls.model, 0, 'never on the paint');
  L.timers[0]();
  assert.equal(L.calls.model, 1); assert.equal(L.calls.reopen, 1, 'the card drawn again: it is still the one open');
  // Another result open by then: not drawn again.
  L = load({ result: true, ss: 'pipe:12' }); L.D.cardHTML(ln); L.timers[0](); assert.equal(L.calls.reopen, 0);
  L = load({ result: false, ss: 'dcwork:wastewater:22-1' }); L.D.cardHTML(ln); L.timers[0](); assert.equal(L.calls.reopen, 0, 'closed meanwhile');
  // Worked out: the headline names both verdicts; every development on it by tier, as data-dev rows (the result
  // filters the map and the left panel to them; js/tool-scope.js opens one).
  L = load({ current: MODEL() }); h = L.D.cardHTML(ln);
  assert.match(h, /^<p class="headline">In service ≈2031, after the capacity it relieves runs out \(≈2028\): <strong>late<\/strong>\. <strong>2 developments<\/strong> rely on it; <strong>1<\/strong> is expected before it is built\.<\/p>/);
  assert.match(h, /<kv>First homes before it is built\?=1 expected before it is built:over<\/kv>/);
  assert.equal(L.timers.length, 0, 'nothing to build');
  assert.match(h, /<table class="dt dt-wide loads-table"><caption>2 developments relying on it, by tier \(and 1 on its path, not needed\)<\/caption>/);
  assert.deepEqual([...h.matchAll(/<tr class="ld-row" data-dev="(\w+)" tabindex="0">/g)].map(m => m[1]), ['d1', 'd2', 'd3']);
  for (const t of ['Needs it to connect', 'Needs it for capacity', 'On its path, not needed']) assert.ok(h.includes(`<td>${t}</td>`), t);
  assert.doesNotMatch(h, /data-pnl-dev/);
  assert.match(h, /data-dcproj-csv="wastewater:22-1">CSV: its developments</);
  assert.doesNotMatch(h, /Funding \(Labs\)|pv-hide/, 'no funding lines while the lab is off');
  // The second project (in time, one relying on it); the third (relieves only flagged constraints, none relying).
  assert.match(L.D.cardHTML({ p: '25-9', sys: 'water' }), /^<p class="headline">In service ≈2035, before the capacity it relieves runs out \(≈2040\): in time\. <strong>1 development<\/strong> relies on it, all expected after it is built\.<\/p>/);
  h = L.D.cardHTML({ c: '28-3', sys: 'wastewater' });
  assert.match(h, /^<p class="headline">It relieves only constraints whose data is flagged: check the data\. No development in the pipeline relies on it\.<\/p>/);
  assert.match(h, /<kv>In service before the capacity runs out\?=check the data <small>construction 2029<\/small>:tight<\/kv>/, 'no capacity year to name');
  assert.match(h, /<p class="small muted">No development in the pipeline relies on it\.<\/p>/, 'a contract key too');
  // The Funding lab: its lines, hidden in the public version (and never built there: funding() is off).
  L = load({ current: MODEL(), lab: true }); h = L.D.cardHTML(ln);
  assert.match(h, /<div class="pv-hide"><h3 class="sub-title">Funding \(Labs\)<\/h3><kv>DC cost \(2026\$, DC-recoverable\)=\$1000000<\/kv>/);
  assert.match(h, /<th>Cost share<\/th>/);
  L = load({ current: MODEL(), lab: true, public: true }); assert.doesNotMatch(L.D.cardHTML(ln), /Funding \(Labs\)|DC cost|Cost share/);
  // Past 30 rows the rest fold (a trunk main can have a thousand), every one still a data-dev row (the filter).
  const mBig = MODEL(); mBig.projects.get('wastewater:22-1').devs.push(...Array.from({ length: 32 }, (_, i) => dev(`b${i}`, 'B1', 5)));
  L = load({ current: mBig }); h = L.D.cardHTML(ln);
  const [shown, folded] = h.split('<details class="dcn-more">');
  assert.equal((shown.match(/data-dev="/g) || []).length, 30); assert.equal((folded.match(/data-dev="/g) || []).length, 5);
  assert.match(folded, /^<summary class="small">5 more developments \(the CSV has every one\)<\/summary>/);
  // A line with no project number or contract: no card (masterplan's own list of who relies on it stays).
  assert.equal(L.D.cardHTML({ sys: 'wastewater' }), '');
});

test('the card’s redraw cannot loop: the sewers fetched only when missing, the card drawn again only once that made it ready', async () => {
  const ln = INFRA().wastewater.lines[0], tick = () => new Promise(r => setImmediate(r)), at = { result: true, ss: 'dcwork:wastewater:22-1' };
  // The sewers in, the servicing model not yet: the card says so; nothing fetched, built or drawn again.
  let L = load({ ...at, svcModel: false });
  assert.equal(L.D.cardHTML(ln), '<p class="headline"><span class="muted">Loading the servicing model…</span></p>');
  await tick();
  assert.equal(L.calls.loadSewers, 0); assert.equal(L.timers.length, 0); assert.equal(L.calls.reopen, 0);
  // The sewers missing too: fetched; in, but the model still not: not drawn again.
  L = load({ ...at, svcModel: false, sewers: false });
  L.D.cardHTML(ln); await tick();
  assert.equal(L.calls.loadSewers, 1); assert.equal(L.calls.reopen, 0);
  // The model in, the sewers missing: the card says so, fetches them and is drawn again once they are in.
  L = load({ ...at, sewers: false });
  assert.match(L.D.cardHTML(ln), /Loading the sewers…/);
  await tick(); assert.equal(L.calls.loadSewers, 1); assert.equal(L.calls.reopen, 1);
  // (the sewers failing to load: nothing drawn again)
  L = load({ ...at, sewers: false, loaded: null }); L.D.cardHTML(ln); await tick(); assert.equal(L.calls.reopen, 0);
});

test('the project in place on the Capital page: both verdicts first, then every development relying on it by tier (See all in place); Show on the map opens its card from the DC program', () => {
  const m = MODEL(); m.projects.get('wastewater:22-1').devs.push(...Array.from({ length: 7 }, (_, i) => dev(`a${i}`, 'A', 10)));
  const L = load({ mode: 'home', page: 'projects', current: m });
  assert.equal(L.D.openSpec(), null, 'none open');
  L.D.state.sel = 'wastewater:22-1'; const p = L.D.openSpec();
  assert.equal(p.lists[0].title, 'Is it in time?');
  assert.deepEqual(plain(p.lists[0].rows.map(r => r.html)), ['<kv>In service before the capacity runs out?=in service after it runs out <small>capacity runs out ≈2028 · construction 2030–2031</small>:over</kv>', '<kv>First homes before it is built?=1 expected before it is built:over</kv>']);
  assert.deepEqual(plain(p.lists.slice(1).map(l => [l.title, l.rows.length, l.total, l.all, own(l, 'seeAll')])), [['Needs it to connect', 8, 8, false, false], ['Needs it for capacity', 1, 1, false, false], ['On its path, not needed', 1, 1, false, false]], 'every row is the page’s: the full table is the list, not the project');
  assert.deepEqual(plain(p.lists[1].see), { 'data-dcproj-more': 'A' });
  // See all opens a tier in place (a trunk main can have a thousand), Show fewer shuts it; another project starts shut.
  L.click({ dcprojMore: 'A' }); assert.deepEqual(plain(L.D.openSpec().lists.slice(1).map(l => l.all)), [true, false, false]);
  assert.ok(L.calls.renderPage > 0, 'the page redrawn');
  L.click({ dcprojMore: 'A' }); assert.equal(L.D.openSpec().lists[1].all, false);
  L.click({ dcprojMore: 'B1' }); L.click({ dcprojOpen: 'water:25-9' }); L.click({ dcprojOpen: 'wastewater:22-1' });
  assert.deepEqual(plain(L.D.openSpec().lists.slice(1).map(l => l.all)), [false, false, false]);
  assert.deepEqual(plain(p.foot.primary.attrs), { 'data-dcproj-map': 'wastewater:22-1' });
  L.D.state.sel = 'wastewater:nope'; assert.equal(L.D.openSpec(), null, 'one the allocation does not have: the list');
  // Show on the map (the page's side map too): the full map at the project's card, its lines from the DC
  // program, never the allocation.
  const L2 = load({ mode: 'home', page: 'projects' });
  L2.click({ dcprojMap: 'wastewater:22-1' });
  assert.deepEqual(L2.calls.setMode, ['full']); assert.deepEqual(plain(L2.calls.showDcLine.map(ln => ln.p)), ['22-1']); assert.equal(L2.calls.fit, 1);
  assert.equal(L2.calls.model, 0);
});

test('the old DC timing tool result opens the list: at its Status, the development or the result closed, the System never set; on a page the Capital page', () => {
  let L = load({ result: true, devOpen: { key: 'd1' } });
  L.D.state.sel = 'wastewater:22-1';
  L.D.openList({ status: 'gap' });
  assert.equal(L.D.state.status, 'gap'); assert.equal(L.D.state.sel, null);
  assert.equal(L.calls.devClose, 1); assert.equal(L.calls.closeResult, 1);
  assert.deepEqual(L.calls.openTab, [['dca', 'timing']]); assert.deepEqual(L.calls.openPage, []);
  L.D.openList({ status: 'gap', sys: 'water' }); assert.equal(L.calls.setSys, 0, 'the System is the reader’s, one control');
  assert.equal(L.calls.devClose, 1, 'nothing more to close'); assert.equal(L.calls.closeResult, 1);
  for (const v of ['nonsense', '__proto__', undefined]) { L.D.openList({ status: v }); assert.equal(L.D.state.status, 'all', String(v)); }
  L.D.openList(); assert.equal(L.D.state.status, 'all');
  L = load({ mode: 'home', page: 'home' });
  L.D.openList({ status: 'planned' });
  assert.deepEqual(L.calls.sectionAt, [['capital', 'timing']]); assert.deepEqual(L.calls.openPage, ['projects']); assert.deepEqual(L.calls.openTab, []);
  assert.equal(L.D.state.status, 'planned');
  // At a Status no row has (today's data: no DC line late, a plant step is): the list stays, its chips above a
  // line saying so, so All is one tap away (a list with no rows is not drawn at all, js/panel.js).
  const R0 = { ...R, list: R.list.map(r => (r.key === 'ln:wastewater:22-1' ? { ...r, rec: 'keep' } : r)) };
  L = load({ R: R0 }); L.D.openList({ status: 'gap' }); const e = L.D.panelSpec().lists[0];
  assert.deepEqual(plain(e.rows), [{ html: '<small class="pnl-r-line">No DC project is late (the answer names the other reliefs late).</small>' }]);
  assert.equal(e.total, 0); assert.match(e.tools, /data-dc-status="gap" aria-pressed="true">Late 0</); assert.match(e.tools, /data-dc-status="all" aria-pressed="false">All 3</);
  L.st.sys = 'water'; assert.match(L.D.panelSpec().lists[0].rows[0].html, /^<small class="pnl-r-line">No water DC project is late\.<\/small>$/);
  // js/masterplan.js showDcTiming: dcnFilter's Status only (its system part can only be the list's own chip's).
  const mp = src('js/masterplan.js'), fn = mp.slice(mp.indexOf("  let dcnFilter = 'gap';"), mp.indexOf('  function showConsDevs('));
  const got = [];
  new Function('window', `${fn}; dcnFilter = 'gap:water'; showDcTiming(); dcnFilter = 'all:ww'; showDcTiming(); dcnFilter = ''; showDcTiming();`)({ PeelDcProjects: { openList: o => got.push(o) } });
  assert.deepEqual(plain(got), [{ status: 'gap' }, { status: 'all' }, { status: 'gap' }]);
  const d = src('js/dc-projects.js');
  assert.doesNotMatch(d.slice(d.indexOf('  function openList('), d.indexOf('  // A row opens its project')), /setSys/);
});

test('the card’s trail: Peel › DC timing › the main, the group step opening Capital › DC timing (EA and Capital keep theirs)', () => {
  const calls = [];
  const win = { PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelPhases: require('../js/phases.js'),
    PeelApp: { state: { ss: null, svcGen: 0, servicing: null }, applyFilters() {} }, PeelOverviewTab: { renderOverview() {} },
    PeelAnalysisTabs: { setFootPref() {}, showFootTab: t => calls.push(`tab:${t}`), setDcSub: v => calls.push(`sub:${v}`) },
    PeelShare: { viewLink: { write() {} } }, PeelTopbar: { renderTrail() {} } };
  win.window = win;
  const ctx = vm.createContext({ window: win, document: { addEventListener() {}, getElementById: () => null, dispatchEvent() {} }, console, Set, Map, CustomEvent: undefined });
  vm.runInContext(src('js/svc-scope.js'), ctx);
  const S = win.PeelSvcScope;
  for (const [group, sub, title] of [['DC timing', 'timing', 'Every DC project (Capital › DC timing)'], ['EA', 'eas', 'Environmental assessments (Capital › EAs)'], ['Capital', 'projects', 'Capital projects (Capital › Projects)']]) {
    S.openResult({ ref: 'dcwork:wastewater:22-1', title: 'DC sanitary main · 900 mm', html: '', group });
    const c = S.crumbs();
    assert.equal(c.length, 2); assert.deepEqual([c[0].label, c[0].title], [group, title]);
    calls.length = 0; c[0].go(); assert.deepEqual(calls, [`sub:${sub}`, 'tab:dca'], group);
  }
});

test('source pins: the card in a DC main’s result (before what it relieves), its trail group, Open the map at it; the tool result, its System seg and its filter handler gone', () => {
  const mp = src('js/masterplan.js'), line = mp.slice(mp.indexOf('  function showDcLine(ln) {'), mp.indexOf('  // All constraints in the network'));
  assert.match(line, /DP = window\.PeelDcProjects, card = DP && DP\.cardHTML \? DP\.cardHTML\(ln\) : '';/);
  assert.match(line, /\$\{card\}\$\{dcNeedsSection\(\{ ln \}, \{ devs: !card \}\)\}/, 'the card first; masterplan’s older list only without it');
  assert.match(line, /\{ ref: `dcwork:\$\{ln\.sys\}:\$\{ln\.p \|\| ln\.c\}`, group: 'DC timing' \}/);
  assert.match(mp, /\$\{o\.devs === false \? '' : devsOfDcHTML\(cs\.filter\(c => c\.kind !== 'wplant' \|\| cs\.length === 1\), conn, zoneRows\)\}/, 'a DC facility keeps its list');
  assert.match(src('js/dc-infra.js'), /MP\(\)\.dcNeedsSection\(\{ fc \}\)/);
  assert.doesNotMatch(mp, /toolResult\('dc', 'DC timing'|\[\['all', 'Both'\], \['ww', 'Wastewater'\], \['water', 'Water'\]\]|loadsOf = \{ dc: \{ timing: true \} \}/, 'no DC timing tool result, no third System control');
  assert.match(mp.slice(mp.indexOf('  function showDcTiming() {'), mp.indexOf('  function showConsDevs(')), /DP\.openList\(\{ status: dcnFilter\.split\(':'\)\[0\] \|\| 'gap' \}\)/);
  assert.match(mp, /set dcnFilter\(v\) \{ dcnFilter = v; \},/, 'the workbook’s DC sheet filter stays');
  const ts = src('js/tool-scope.js');
  assert.doesNotMatch(ts, /\[data-dcn-filter\]/);
  assert.match(ts, /if \(e\.target\.closest\('\[data-dcn-all\]'\)\) \{ SC\(\)\.loadSewers\(\); return MP\(\)\.showDcTiming\(\); \}/, '"← DC timing"');
  assert.doesNotMatch(src('js/sewer-cap.js'), /toolScope\.title === 'DC timing'|showDcTiming/);
  assert.match(src('js/svc-scope.js'), /const GROUP_SUB = \{ EA: 'eas', Capital: 'projects', 'DC timing': 'timing' \}/);
  const ws = src('js/workspaces.js');
  assert.match(ws, /dcw = g\.dataset\.wsDcwork;/);
  assert.match(ws, /if \(dcw && root\.PeelDcProjects && root\.PeelDcProjects\.openWork\) root\.PeelDcProjects\.openWork\(dcw\);/);
  const d = src('js/dc-projects.js'), ow = d.slice(d.indexOf('  function openWork('), d.indexOf('  // (Show on the map'));
  assert.match(ow, /I = App\(\) && App\(\)\.state\.dcInfra/); assert.doesNotMatch(ow, /DI\(\)\.model\(\)/, 'a tap never walks every pipe');
  assert.match(d, /function showOnMap\(key\) \{ const W = root\.PeelWorkspaces; if \(W && W\.mode && W\.mode\(\) === 'home' && W\.setMode\) W\.setMode\('full'\); openWork\(key\); \}/, 'one opener');
  assert.doesNotMatch(d.slice(d.indexOf('  function fullHTML('), d.indexOf('  // ---- Render and actions')), /S\.sel|data-pnl-dev/, 'the full table: the list, no project in it');
  assert.doesNotMatch(d.slice(d.indexOf('  function panelSpec('), d.indexOf('  // shown: the panel has drawn')), /S\.sel|projectSpec|waitSpec/, 'the panel: always the list');
});

// ---- Chunk 3: EA to construction joins EAs (one builder in the model; Capital › EAs' fold and full table; the EAs page)
const CEM = require('../js/capital-ea-model.js');
const TODAY = Date.UTC(2026, 9, 17);
const ea = (id, o = {}) => ({ id, name: id, municipality: 'Brampton', status: 'complete', milestones: [], related: { capitalProjects: [] }, ...o });
const rec = (id, o = {}) => ({ id, contract: id, status: 'planned', workType: 'watermain', street: 'Main St', ...o });
// An EA with construction after it, one waiting 11 years, one under way, and one in Caledon waiting 8.
const EAS = [
  ea('A', { name: 'Main St watermain', milestones: [{ type: 'commencement', date: '2017-01-10' }, { type: 'pic', date: '2018-05-01' }, { type: 'completion', date: '2019-06-30' }], related: { capitalProjects: [{ id: 'after', method: 'inside the study area' }] } }),
  ea('W', { name: 'Queen St sewer', milestones: [{ type: 'completion', date: '2015-03-01' }] }),
  ea('C', { name: 'Bovaird pumping', status: 'consultation', milestones: [{ type: 'commencement', date: '2025-02-01' }, { type: 'report', date: '2027-04-01' }] }),
  ea('K', { name: 'Caledon wells', municipality: 'Caledon', milestones: [{ type: 'completion', date: '2018-01-01' }] }),
];
const CAPS = [rec('after', { startTarget: '2027-03-01' })];

test('EA to construction’s builder is the model’s (eaFlowSpec): the four lists, four figures, the timeline; every row and timeline row carries what the host opens', () => {
  const seen = [], open = x => { seen.push(x.e.id); return { 'data-x': `ea:${x.e.id}` }; };
  const f = CEM.eaFlowSpec({ eas: EAS, capital: CAPS, muni: 'Brampton', today: TODAY, open });
  assert.deepEqual(plain(f.lists.map(l => l.title)), ['Complete, waiting for construction (oldest first)', 'Construction that followed an EA', 'Possible links to check: current construction near a past EA', 'EAs under way (by expected report)']);
  assert.deepEqual(plain(f.figures.map(x => x.label)), ['construction followed', 'complete, no construction yet', 'under way', 'completion date unknown']);
  assert.match(f.answer, /^Of <strong>2<\/strong> completed EAs, <strong>1<\/strong> has construction that started after the EA was complete, <strong>1<\/strong> is waiting for construction \(1 for 9 years or more\)/);
  assert.deepEqual(plain(f.all.map(x => x.e.id).sort()), ['A', 'C', 'W'], 'Brampton: the Caledon EA left out');
  assert.deepEqual(plain(f.lists.map(l => l.rows.map(r => r.attrs['data-x']))), [['ea:W'], ['ea:A'], [], ['ea:C']], 'each row carries open(x)');
  assert.match(f.lists[1].rows[0].html, /Watermain · Main St <small>planned, starts 2027<\/small>/);
  // The timeline: one li per EA complete (followed, then waiting, by completion), each with open(x)'s attributes.
  assert.deepEqual([...f.chart.matchAll(/<li class="eat-row" ([^>]*) tabindex="0" role="button">/g)].map(m => m[1]), ['data-x="ea:W"', 'data-x="ea:A"']);
  assert.match(f.chart, /^<h3 class="pnl-chart-t">Each EA and the construction after it <span class="pnl-chart-u">\(2015–2032\)<\/span><\/h3>/);
  assert.equal(seen.length, 5, 'open(x): three list rows and two timeline rows');
  assert.ok(f.folds.every(x => x === null), 'no other work, unknown dates or conflicts here');
  assert.match(f.method, /^Each Region Class EA \(Water, Wastewater and Roads\) from its project page/);
  // Peel: every EA (the Caledon one waits too, after the older one).
  const p = CEM.eaFlowSpec({ eas: EAS, capital: CAPS, today: TODAY, open });
  assert.deepEqual(plain(p.lists[0].rows.map(r => r.attrs['data-x'])), ['ea:W', 'ea:K']);
  assert.equal(CEM.eaFlowSpec({ eas: [], capital: CAPS, today: TODAY, open }).answer, 'No Region EAs in this area.');
  assert.doesNotMatch(f.answer, /addendum|no status/, 'none to name here');
  // Each count names its own measure beside Capital › EAs' (which counts an addendum as current, and an EA with no
  // status published as neither): an addendum's EA is complete here, one with no status under way.
  const x = CEM.eaFlowSpec({ eas: [...EAS, ea('D', { status: 'addendum', milestones: [{ type: 'completion', date: '2020-05-01' }] }), ea('U', { status: 'unknown' })], capital: CAPS, muni: 'Brampton', today: TODAY, open });
  assert.match(x.answer, /^Of <strong>3<\/strong> completed EAs \(1 with an addendum under way\), /);
  assert.match(x.answer, / <strong>2<\/strong> are under way \(1 with no status published\)\./);
  assert.match(x.figures[2].ctx, /^next report expected 2027 · 1 with no status published$/);
  assert.match(x.method, /An EA with an addendum counts as complete here \(Capital › EAs counts it as current\), and one with no status published as under way\.$/);
  assert.equal(CEM.eaTimelineHTML([], open), '');
  // The moved code has no colour (tokens in css/app.css), and the page keeps no copy of it.
  const m = src('js/capital-ea-model.js'), moved = m.slice(m.indexOf('  function eaTimelineHTML('), m.indexOf('  // ---- Possible links'));
  assert.ok(moved.length > 4000); assert.doesNotMatch(moved, /#[0-9a-f]{3,6}\b/i);
  const s = src('js/ws-pages.js');
  assert.doesNotMatch(s, /function eaTimelineHTML|const workLine|M\.eaProgress\(/, 'one builder: the page draws the model’s');
});

// js/capital-ea.js in a vm (the map, Leaflet and the panel stubbed): Capital › EAs' fold and its full table.
function loadCE(o = {}) {
  const handlers = {}, sets = [], built = { n: 0 }, stored = {};
  const document = { readyState: 'complete', documentElement: { dataset: {} }, querySelector: () => null, querySelectorAll: s => (o.onScreen && s === '#pnl-eaflow' ? o.onScreen : []), addEventListener: (t, f, cap) => { (handlers[t] = handlers[t] || []).push({ f, cap: !!cap }); } };
  const layer = () => ({ clearLayers() {}, addTo() { return this; } });
  const map = { getPane: () => ({ style: {} }), createPane: () => ({ style: {} }), getZoom: () => 11, on() {}, removeLayer() {} };
  const st = { muni: o.muni || 'Brampton', dev: o.dev || null, scope: 'area' };
  const M = { ...CEM, eaFlowSpec: x => { built.n++; return CEM.eaFlowSpec({ ...x, today: TODAY }); } };
  const window = { document, PeelCapitalEAModel: M,
    PeelUtil: { esc: CEM.esc, token: () => '', store: { get: (k, d) => (own(stored, k) ? stored[k] : d), set: (k, v) => { stored[k] = v; } }, dataJSON: () => new Promise(() => {}), hlP: h => `<p class="headline" data-hl="1">${h}</p>`, skel: t => `<skel>${t}</skel>`, csvCell: v => String(v) },
    PeelMapCore: { map }, PeelApp: { state: { muni: st.muni } },
    PeelDevVerdict: { scopedDev: () => st.dev },
    PeelPanel: { kv: (k, v, t) => ({ html: `<kv>${k}=${v}${t ? `:${t}` : ''}</kv>` }), areaHead: (w, name) => ({ w, name }), siteHead: p => ({ name: p.title }), get: k => (k === 'dca:eas' && o.stored ? { spec: {}, scope: st.scope } : null), set: (k, spec) => sets.push([k, spec]), scopeId: () => 'area' },
  };
  const ctx = { window, document, L: { layerGroup: layer }, fetch: () => new Promise(() => {}), setTimeout: () => 0, clearTimeout() {} }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/capital-ea.js'), ctx);
  const CE = window.PeelCapitalEA;
  CE.setData({ records: CAPS }, { eas: EAS, generatedAt: '2026-10-19T11:09:41Z' });
  const fire = (t, e) => { for (const h of [...(handlers[t] || [])].sort((a, b) => b.cap - a.cap)) h.f(e); };
  return { CE, sets, built, st, window, fire };
}

test('Capital › EAs: EA to construction a fold of its panel (shut; the chip and its page open it), its lists in the full table; worked out once per data and municipality', () => {
  const L = loadCE();
  let spec = L.CE.easPanelSpec();
  const fold = spec.folds.find(x => x.id === 'pnl-eaflow');
  assert.ok(fold && fold.title === 'EA to construction' && fold.open === false, 'a fold, shut to start');
  assert.match(fold.html, /^<p class="small">Of <strong>2<\/strong> completed EAs/);
  assert.match(fold.html, /<li class="eat-row" data-ce-open="ea:W" tabindex="0" role="button">/, 'a timeline row opens the EA on the map');
  assert.match(fold.html, /<button type="button" class="btn small link eat-ft" data-full-table="dca" data-ft-go="Complete, waiting for construction">The EAs and the construction after them \(full table\) ›<\/button>/);
  assert.equal((fold.html.match(/<kv>/g) || []).length, 4, 'its four figures');
  assert.match(spec.fullTitle, /every environmental assessment, with filters, and EA to construction$/);
  assert.match(spec.method, / EA to construction: Each Region Class EA [^]*?a start in the same year counts \(the rule in full under the full table\)\. Screening wording only\.$/);
  // The full table: the EA table, then EA to construction, its lists as captioned tables (the fold's link lands on the first).
  const box = { innerHTML: '', querySelector: () => null };
  L.CE.renderEaTab(box);
  const sec = box.innerHTML.slice(box.innerHTML.indexOf('<section class="ea-flow" data-info="eaflow">'));
  assert.ok(sec.length > 100 && box.innerHTML.indexOf('<section class="ea-flow"') > 0, 'after the EA table');
  assert.match(sec, /^<section class="ea-flow" data-info="eaflow"><h3 class="sub-title">EA to construction<\/h3><p class="headline" data-hl="1">Of <strong>2/);
  assert.deepEqual([...sec.matchAll(/<caption>([^<]+) <span class="muted">\((\d+)\)<\/span><\/caption>/g)].map(m => `${m[1]} ${m[2]}`), ['Complete, waiting for construction (oldest first) 1', 'Construction that followed an EA 1', 'EAs under way (by expected report) 1']);
  assert.match(sec, /<tr class="ld-row" data-ce-open="ea:W" tabindex="0"><td>/, 'a row opens the EA');
  assert.match(sec, /<details class="dcn-more"><summary class="small">Method and basis<\/summary><p class="small muted">Each Region Class EA/);
  // Worked out once: every render and keystroke after reads it; another municipality works it out again.
  L.CE.easPanelSpec(); L.CE.renderEaTab(box); L.CE.renderEaTab(box);
  assert.equal(L.built.n, 1, 'one build for the data and municipality');
  L.window.PeelApp.state.muni = 'Caledon'; spec = L.CE.easPanelSpec();
  assert.equal(L.built.n, 2); assert.match(spec.folds[0].html, /<li class="eat-row" data-ce-open="ea:K"/);
  // At a development: the EAs near it, no fold, no EA to construction in the full table.
  L.st.dev = { title: '0 HERITAGE RD', lat: 43.7, lng: -79.7, records: [], municipality: 'Brampton' };
  spec = L.CE.easPanelSpec(); L.CE.renderEaTab(box);
  assert.deepEqual(plain(spec.folds), []); assert.doesNotMatch(box.innerHTML, /ea-flow/);
  assert.doesNotMatch(spec.fullTitle, /EA to construction/);
});

test('the EA to construction fold: opened by the chip (and its page), kept as the reader leaves it, never by a redraw; Enter opens a row', () => {
  const d = { id: 'pnl-eaflow', open: false }, L = loadCE({ onScreen: [d], stored: true });
  assert.equal(L.CE.eaFlowOpen(), false);
  L.CE.openEaFlow();
  assert.equal(L.CE.eaFlowOpen(), true); assert.equal(d.open, true, 'drawn open where it is on screen');
  assert.equal(L.sets.length, 1); assert.equal(L.sets[0][0], 'dca:eas'); assert.equal(L.sets[0][1].folds[0].open, true, 'and in the stored panel');
  L.CE.openEaFlow(); assert.equal(L.sets.length, 1, 'once');
  // A redraw draws it open: its toggle is no pick. The reader's tap on its own summary is.
  const shut = { id: 'pnl-eaflow', open: false }, other = { id: 'pnl-other', open: false };
  L.fire('toggle', { target: shut }); assert.equal(L.CE.eaFlowOpen(), true, 'a toggle with no tap changes nothing');
  const sum = p => ({ closest: s => (s === 'summary' ? { parentElement: p } : null) });
  L.fire('click', { target: sum(other) }); L.fire('toggle', { target: shut }); assert.equal(L.CE.eaFlowOpen(), true, 'a tap on another fold’s summary');
  L.fire('click', { target: sum(shut) }); L.fire('toggle', { target: shut }); assert.equal(L.CE.eaFlowOpen(), false, 'the reader shut it');
  // A panel put back from its stored HTML: the fold as the reader left it (onMount).
  const host = { querySelector: s => (s === '#pnl-eaflow' ? d : null) };
  L.CE.easPanelSpec().onMount(host); assert.equal(d.open, false);
  // Enter or Space on a timeline row or a full-table row opens the EA, as a click.
  let clicks = 0, prevented = 0;
  const row = { click: () => { clicks++; } }, at = { closest: s => (s === '.eat-row[data-ce-open], tr[data-ce-open]' ? row : null) };
  for (const key of ['Enter', ' ', 'a']) L.fire('keydown', { key, target: at, preventDefault: () => { prevented++; } });
  assert.equal(clicks, 2); assert.equal(prevented, 2);
});

test('the EAs page: the map’s Capital › EAs (built when the map has not drawn it), then EA to construction; every row opens the EA on the map', () => {
  const easPanel = { head: {}, answer: '<strong>1</strong> current EA in Brampton.', figures: [{ v: 1, label: 'EAs under way' }, { v: 2, label: 'milestones, next 90 days', attrs: { 'data-full-table': 'dca' } }, { v: 0, label: 'open for comment now', attrs: { 'data-full-table': 'dca' } }, { v: 1, label: 'completed 2024 or later' }],
    lists: [{ title: 'Current EAs', rows: [{ attrs: { 'data-ce-open': 'ea:C' }, html: 'C' }], total: 1 }], folds: [{ id: 'pnl-eaflow', title: 'EA to construction', html: '<li data-ce-open="ea:W">' }], method: 'Region of Peel environmental assessments.', sources: 's' };
  const asked = [], ce = { data: { loaded: true, eas: { eas: EAS, generatedAt: '2026-10-19' }, capital: { records: CAPS } } };
  let flows = 0;
  const document = { documentElement: { classList: { toggle() {}, contains: () => false } }, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null, addEventListener() {}, dispatchEvent() {} };
  const window = { document, PeelUtil: { esc: CEM.esc, fmtNum: n => String(n), fmt1: n => n.toFixed(1) }, PeelCapitalEAModel: { ...CEM, eaFlowSpec: x => { flows++; return CEM.eaFlowSpec(x); } }, PeelCapitalEA: ce,
    PeelPanel: { get: () => null, scenarioChip: () => '' }, PeelApp: { state: { muni: 'Brampton' } },
    PeelWorkspaces: { BY_ID: { eaflow: { label: 'EA to construction' }, projects: { label: 'DC projects' } } },
    PeelSections: { WORKSPACES: { capital: { host: 'projects', secs: [{ id: 'timing', title: 'DC timing', page: 'projects' }, { id: 'eas', title: 'EAs', page: 'eaflow' }, { id: 'projects', title: 'Projects', tab: 'dca', keys: ['dca:projects'] }] } }, areaPanel: k => { asked.push(k); return easPanel; } } };
  const ctx = { window, document, setTimeout: () => 0, clearTimeout() {}, URLSearchParams }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/ws-pages.js'), ctx);
  const P = window.PeelWsPages;
  let m = P.build('eaflow');
  assert.deepEqual(asked, ['dca:eas'], 'the EAs from PeelSections.areaPanel (stored, else built)');
  assert.equal(m.name, 'What is being studied, and which EAs have led to construction?');
  assert.match(m.top, /data-ws-page="eaflow" aria-pressed="true">EAs</); assert.match(m.top, /data-ws-page="projects" aria-pressed="false">DC timing</);
  assert.match(m.answer, /^<strong>1<\/strong> current EA in Brampton\. Of <strong>2<\/strong> completed EAs/);
  assert.deepEqual(plain(m.figures.map(f => f.label)), ['EAs under way', 'open for comment now', 'construction followed', 'complete, no construction yet']);
  assert.deepEqual(plain(m.figures[1].attrs), { 'data-ws-go': 'eaflow', 'data-ws-fulltable': '1' }, 'a figure into the full table: the map view at it');
  assert.deepEqual(plain(m.lists.map(l => l.title)), ['Current EAs', 'Complete, waiting for construction (oldest first)', 'Construction that followed an EA', 'Possible links to check: current construction near a past EA', 'EAs under way (by expected report)']);
  assert.deepEqual(plain(m.lists[0].rows[0].attrs), { 'data-ws-go': 'eaflow', 'data-ws-ce': 'ea:C' }, 'the EAs’ rows open the EA on the map view');
  assert.deepEqual(plain(m.lists[1].rows[0].attrs), { 'data-ws-go': 'eaflow', 'data-ws-ce': 'ea:W', title: 'Open the EA on the map' });
  assert.match(m.chart, /<li class="eat-row" data-ws-go="eaflow" data-ws-ce="ea:W" title="Open the EA on the map" tabindex="0" role="button">/);
  assert.ok(!(m.folds || []).some(f => f && f.id === 'pnl-eaflow'), 'the map’s fold is not drawn on the page (its rows would open in the hidden map)');
  assert.match(m.method, /^Region of Peel environmental assessments\. Each Region Class EA/);
  assert.match(m.identity, /^Brampton · 3 Region EAs · 1 capital project records$/);
  // Worked out once per data and municipality (the page rebuilds whenever a panel changes).
  P.build('eaflow'); assert.equal(flows, 1);
  window.PeelApp.state.muni = 'Caledon'; assert.match(P.build('eaflow').identity, /^Caledon · 1 Region EAs/); assert.equal(flows, 2);
  window.PeelApp.state.muni = 'Brampton'; P.build('eaflow'); assert.equal(flows, 3);
  // The capital projects missing: the EAs still, and a line for EA to construction.
  ce.data.capital = null; m = P.build('eaflow');
  assert.deepEqual(plain(m.lists.map(l => l.title)), ['Current EAs']);
  assert.match(m.answer, /^<strong>1<\/strong> current EA in Brampton\. <span class="muted">The capital project list did not load, so EA to construction can’t be shown/);
  ce.data.loaded = false; assert.match(P.build('eaflow').answer, /Loading the EAs and capital projects/);
});

test('source pins: Capital › EAs’ fold, its full table, the chip’s fold, the page and the phone rule', () => {
  const c = src('js/capital-ea.js');
  assert.match(c, /folds: near \? \[\] : \[eaFlowFold\(\)\]\.filter\(Boolean\), onMount: syncEaFlow,/);
  assert.match(c, /return \{ id: EAFLOW_ID, title: 'EA to construction', open: eaFlowOpen, html:/);
  assert.match(c, /data-ft-go="Complete, waiting for construction"/);
  assert.match(c, /<table class="dt"><caption>\$\{esc\(l\.title\)\}/, 'the full table’s lists: captions the panel links land on');
  assert.match(c, /eaBox\.innerHTML = `\$\{eaTabHTML\(\)\}\$\{eaFlowFullHTML\(\)\}`;/);
  assert.match(c, /const k = \[data\.eas\.generatedAt, \(data\.capital\.records \|\| \[\]\)\.length, muni\(\)\]\.join\('\|'\);/, 'one build per data and municipality');
  assert.match(c, /document\.addEventListener\('toggle', e => \{ if \(e\.target !== flowPicked\) return;/);
  assert.match(c, /e\.target\.closest\('\.eat-row\[data-ce-open\], tr\[data-ce-open\]'\)/);
  assert.match(c, /const api = \{ projectsPanelSpec, easPanelSpec, openEaFlow, eaFlowOpen: \(\) => eaFlowOpen,/);
  const s = src('js/ws-pages.js'), p = s.slice(s.indexOf('  function eaflow() {'), s.indexOf('  // ---- This week'));
  assert.match(p, /if \(recs && eaMemo\.k !== k\) eaMemo = \{ k, f: M\.eaFlowSpec\(\{ eas: ce\.data\.eas\.eas \|\| \[\], capital: recs, muni, open: eaOpen \}\) \};/);
  assert.match(p, /SE\.areaPanel \? SE\.areaPanel\('dca:eas'\)/);
  assert.match(p, /top: wsBar\('capital', 'eas'\)/); assert.doesNotMatch(s, /wsBar\('capital', 'eaflow'\)/);
  assert.match(src('js/analysis-tabs.js'), /eaflow: \(\) => root\.PeelCapitalEA && root\.PeelCapitalEA\.openEaFlow,/);
  assert.match(src('js/workspaces.js'), /\{ id: 'eaflow', label: 'EA to construction', group: 'Capital', tab: 'dca', sub: 'eas', fold: 'eaflow', scope: 'area', view: 'dc',/);
  const css = src('css/app.css');
  assert.match(css, /@media \(max-width: 700px\), \(pointer: coarse\) \{[^}]*details > summary, \.f-sum, \.t-toggle, \.tb-step, \.seg \.btn, \.switch, \.eat-row \{ min-height: 44px; \}/, 'the timeline’s rows: 44 px on a phone');
  assert.match(css, /\.eat-ft \{ white-space: normal; text-align: left; \}/, 'the fold’s long link wraps on a phone');
  assert.match(src('js/tips.js'), /eaflow: 'What is being studied, and which EAs have led to construction\?'/);
  assert.match(src('js/info.js'), /'eaflow': \{ title: 'EA to construction', body: 'Each Region Class EA/);
});
