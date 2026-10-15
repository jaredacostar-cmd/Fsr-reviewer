'use strict';
// SPEC §3: every click lands in the right panel. DC works, pipes, single files, blocks, water
// facilities, selections and tool results open as scopes through PeelSvcScope.openResult: trail step,
// share link, left panel filtered to what they list. #pane-tool and #detail are gone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const JS = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js'));

function loadScope() {
  const calls = [];
  const win = {
    PeelUtil: require('../js/util.js'), PeelDemand: require('../js/demand.js'), PeelPhases: require('../js/phases.js'),
    PeelApp: { state: { ss: null, svcGen: 0, servicing: null }, applyFilters: () => calls.push('filter') },
    PeelOverviewTab: { renderOverview: () => calls.push('render') },
    PeelAnalysisTabs: { setFootPref: () => {}, showFootTab: t => calls.push(`tab:${t}`) },
    PeelShare: { viewLink: { write: () => calls.push('link') } },
    PeelTopbar: { renderTrail: () => calls.push('trail') },
  };
  win.window = win;
  const document = { addEventListener() {}, getElementById: () => null, dispatchEvent() {} };
  const ctx = vm.createContext({ window: win, document, console, Set, Map, CustomEvent: undefined });
  vm.runInContext(src('js/svc-scope.js'), ctx);
  return { S: win.PeelSvcScope, win, calls };
}

test('a result scope: ref, trail step, filtered to the developments it lists, closed back to Peel', () => {
  const { S, win, calls } = loadScope();
  assert.equal(S.isResultRef('pipe:12'), true);
  assert.equal(S.isResultRef('plant:Lakeview'), false);
  S.openResult({ ref: 'pipe:12', title: '300 mm sanitary sewer', html: '<tr class="ld-row" data-dev="Brampton|1 A ST"></tr><tr data-dev="Caledon|2 B RD"></tr>', filter: true });
  assert.equal(win.PeelApp.state.ss, 'pipe:12');
  assert.ok(S.hasResult());
  const cur = S.current();
  assert.equal(cur.kind, 'result'); assert.equal(cur.rkind, 'pipe');
  assert.equal(S.has({ key: 'Brampton|1 A ST' }), true);
  assert.equal(S.has({ key: 'Mississauga|3 C AVE' }), false, 'the left panel and map show only what it lists');
  assert.deepEqual(Array.from(S.crumbs(), c => c.label), ['300 mm sanitary sewer']);
  assert.ok(calls.includes('tab:overview') && calls.includes('trail') && calls.includes('link'));
  // devKeys given explicitly win over the rows; a tool result with no list filters nothing.
  S.openResult({ ref: 'file:u1', title: 'OZS-2025-0032', html: '', devKeys: ['Brampton|2055 BOVAIRD DR W'] });
  assert.equal(S.has({ key: 'Brampton|2055 BOVAIRD DR W' }), true); assert.equal(S.has({ key: 'x' }), false);
  S.openResult({ title: 'Inspect point', html: '<p>x</p>' });
  assert.equal(win.PeelApp.state.ss, 'tool:inspect-point'); assert.equal(S.has({ key: 'x' }), true);
  assert.equal(S.closeResult(), true);
  assert.equal(win.PeelApp.state.ss, null); assert.equal(S.hasResult(), false); assert.equal(S.closeResult(), false);
});

test('opening a servicing scope replaces a result scope', () => {
  const { S, win } = loadScope();
  S.openResult({ ref: 'dcwork:wastewater:22-2255', title: 'DC main', html: '' });
  S.clear();
  assert.equal(win.PeelApp.state.ss, null); assert.equal(S.hasResult(), false);
});

test('devKeysOf reads the data-dev rows (escaped keys too)', () => {
  const { S } = loadScope();
  assert.deepEqual([...S.devKeysOf('<a data-dev="A &amp; B|1"></a><b data-dev="C|2"></b><b data-dev="C|2"></b>')], ['A & B|1', 'C|2']);
  assert.equal(S.devKeysOf('<p>none</p>'), null);
});

test('every producer opens a named scope: file, pipe, DC work, block, water facility, selection, help', () => {
  for (const [f, re] of [
    ['js/aerial-check.js', /openResult\(\{ ref: `file:\$\{r\.uid\}`/],
    ['js/sewer-cap.js', /\{ ref: `pipe:\$\{i\}`, devKeys: up\.map\(r => r\.dev\.key\) \}/],
    ['js/dc-infra.js', /\{ ref: `dcwork:\$\{fc\.sys\}:\$\{fc\.name\}` \}/],
    ['js/masterplan.js', /\{ ref: `dcwork:\$\{ln\.sys\}:\$\{ln\.p \|\| ln\.c\}` \}/],
    ['js/sewer-trace.js', /openResult\(\{ ref: `iiblock:\$\{b\.id\}`/],
    ['js/water-trace.js', /openResult\(\{ ref: `wfac:/],
    ['js/measure.js', /ref: 'sel:selection'/],
    ['js/tips.js', /ref: 'help:help'/],
  ]) assert.match(src(f), re, f);
  assert.match(src('js/tools.js'), /return S\.openResult\(opts \|\| \{\}\);/, 'PeelTools.openResult goes through the scope');
});

test('#pane-tool and #detail are gone from the markup and the code', () => {
  const html = src('index.html');
  for (const id of ['id="pane-tool"', 'id="ftab-tool"', 'id="detail"', 'id="detail-body"', 'id="detail-grip"']) assert.ok(!html.includes(id), id);
  for (const f of JS) {
    const code = src(`js/${f}`).replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(code, /['"`]#detail(-body|-grip|-close)?['"`,]|#pane-tool/, `${f} still uses #detail / #pane-tool`);
  }
});

test('a shared link re-opens a pipe, a file, a DC work or a block; tool results are not written to links', () => {
  const sh = src('js/share.js');
  assert.match(sh, /!\/\^\(pipe\|file\|dcwork\|iiblock\):\/\.test\(App\(\)\.state\.ss\)/);
  const sc = src('js/svc-scope.js');
  for (const k of ['pipe', 'file', 'dcwork', 'iiblock']) assert.match(sc, new RegExp(`\\n    ${k}: `), `restore ${k}`);
});

test('one hover card: kind, name, the number, what a click does', () => {
  const U = require('../js/util.js');
  const h = U.hoverCard({ kind: 'Pumping station', name: 'Richards Memorial PS', value: '110%', sub: 'of firm at build-out (peak wet)', also: 'Trace upstream from its scope' });
  assert.match(h, /<span class="hc-k">Pumping station<\/span><strong class="hc-n">Richards Memorial PS<\/strong><div class="hc-v"><b>110%<\/b> <span>of firm at build-out \(peak wet\)<\/span><\/div>/);
  assert.match(h, /<div class="hc-a">Click: open its scope · Trace upstream from its scope<\/div>/);
  assert.match(U.hoverCard({ name: '<x>' }), /&lt;x&gt;/);
  for (const f of ['js/render-list.js', 'js/map-markers.js', 'js/map-analysis.js', 'js/svc-data.js', 'js/sewer-cap.js', 'js/dc-infra.js', 'js/sewer-trace.js', 'js/water-trace.js'])
    assert.match(src(f), /PeelUtil\.hoverCard/, `${f} uses the shared hover card`);
});

test('site tools: Trace sewer, Trace water and Check FSR stay buttons; Memo, allocation, Compare, Export in ⋯', () => {
  const d = src('js/devscope.js');
  const acts = d.slice(d.indexOf('<div class="site-bar-actions">'), d.indexOf('<div class="site-bar-fsr"'));
  const menu = acts.slice(acts.indexOf('<details class="site-more">'));
  const top = acts.slice(0, acts.indexOf('<details class="site-more">'));
  for (const a of ['data-trace=', 'data-wtrace=', 'data-scope-fsr']) assert.ok(top.includes(a), a);
  for (const a of ['data-memo', 'data-scope-alloc', 'data-scope-compare', 'data-scope-export']) { assert.ok(menu.includes(a), a); assert.ok(!top.includes(a), `${a} not in the top row`); }
});
