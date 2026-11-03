'use strict';
// Growth › 2021 existing (owner 2026-11-03): the census block, at the top of Growth › Areas until now (the headline,
// the four cards, the growth chart, the applications against the 2051 forecast, housing activity and the population
// outlook), is Growth's fourth view, on Home and on the full map: Growth › Pipeline · Areas · Forecast · 2021 existing.
// Areas keeps the plan areas only. An area's view: hidden at a development, a servicing scope and a selection. Old
// names of the block (gs=census2051, t=census, a stored Census & 2051 pick) land on it; Areas' own (gs=areas, byplan)
// stay Areas. Its panel growth:existing is set by js/census-view.js renderGrowthCensus; the block is its full table.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const src = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const HTML = src('index.html');
const plain = o => JSON.parse(JSON.stringify(o));
const SE = require('../js/sections.js');
const W = require('../js/workspaces.js');
const PN = require('../js/panel.js');
const H = require('../js/how.js');
const R = require('../js/reference.js');

// js/analysis-tabs.js in a vm, with stored prefs and the scope stubs (extra), as tests/nav-aliases.test.js loadTabsAt.
function loadTabsAt(stored = {}, extra = {}) {
  const store = { get: (k, d) => (Object.prototype.hasOwnProperty.call(stored, k) ? stored[k] : d), set: () => {} };
  const q = sel => (/^\.f-tab\[data-tab="\w+"\]:not\(\[hidden\]\):not\(\[aria-busy\]\)$/.test(sel) ? {} : null);
  const document = { querySelector: q, querySelectorAll: () => [], getElementById: () => null, addEventListener: () => {} };
  const ctx = { window: { PeelUtil: { store }, document, PeelDcaTab: {}, ...extra }, document, setTimeout: () => 0, module: { exports: {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/analysis-tabs.js'), ctx);
  return ctx.module.exports;
}
// js/census-view.js in a vm (its pure parts: the chart, the cards, the panel spec).
function loadCV() {
  const window = { PeelUtil: require('../js/util.js'), PeelDemand: {}, PeelPanel: PN };
  const ctx = { window, document: { addEventListener() {} } };
  ctx.globalThis = ctx;
  vm.runInNewContext(src('js/census-view.js'), ctx);
  return window.PeelCensusView;
}
const ASKED = 'What has been built since the census, and what is still to come?';

test('the registry: Growth › Pipeline · Areas · Forecast · 2021 existing at an area; hidden at a development, a servicing scope and a selection', () => {
  const AT = loadTabsAt();
  assert.equal(AT.TABSUBS.growth.valid[AT.TABSUBS.growth.valid.length - 1], 'existing');
  assert.deepEqual(plain(AT.chipsAt('growth', 'area')), ['pipeline', 'areas', 'timing', 'existing']);
  for (const k of ['site', 'svc', 'drawn']) assert.ok(!AT.chipsAt('growth', k).includes('existing'), `${k}: an area's view`);
  for (const k of ['file', 'object']) assert.deepEqual(plain(AT.chipsAt('growth', k)), [], `${k}: no Growth`);
  assert.match(HTML, /data-gsub="timing">Forecast<\/button><button type="button" class="btn small" data-gsub="existing">2021 existing<\/button><\/div>/);
  assert.equal(W.chipName('growth', 'existing'), '2021 existing');
  assert.equal(W.tabPath('growth', 'existing'), 'Growth › 2021 existing');
  // (a 'tab:sub' name: no other tab inherits the word)
  assert.ok(!Object.prototype.hasOwnProperty.call(W.SUB_NAME || {}, 'existing'));
  assert.deepEqual(plain(SE.VIEWS.area['growth:existing']), { keys: ['growth:existing'], ws: 'growth' });
  assert.equal(SE.ASK['growth:existing'], ASKED);
  assert.ok(!('growth:existing' in SE.VIEWS.site), 'not a development’s view');
});

test('aliases and stored picks: the block’s old names land on 2021 existing, Areas’ own stay Areas', () => {
  const AT = loadTabsAt();
  assert.deepEqual(plain(AT.migrateSub('growth', 'existing')), { tab: 'growth', sub: 'existing' });
  assert.deepEqual(plain(AT.migrateTabKey('growth', 'census2051')), { tab: 'growth', gSub: 'existing' });
  assert.deepEqual(plain(AT.migrateTabKey('census')), { tab: 'growth', gSub: 'existing' });
  assert.deepEqual(plain(AT.migrateTabKey('growth', 'existing')), { tab: 'growth', gSub: 'existing' }, 'gs=existing: a link written at the view');
  assert.deepEqual(plain(AT.migrateTabKey('growth', 'areas')), { tab: 'growth', gSub: 'areas' });
  assert.deepEqual(plain(AT.migrateTabKey('growth', 'byplan')), { tab: 'growth', gSub: 'areas' });
  assert.equal(AT.migratePrefs({ footPref: 'growth', gSub: 'census2051', svcSub: 'capacity', dcSub: 'timing', rSub: 'sources' }).gSub, 'existing');
  assert.equal(AT.migratePrefs({ footPref: 'growth', gSub: 'existing', svcSub: 'capacity', dcSub: 'timing', rSub: 'sources' }).gSub, 'existing', 'a stored pick is not reset to Pipeline');
  assert.equal(loadTabsAt({ gSub: 'existing' }).getGSub(), 'existing');
  assert.equal(loadTabsAt({ gSub: 'census2051' }).getGSub(), 'existing');
  { const T = loadTabsAt({ footTab4: 'census' }); assert.deepEqual([T.getFootPref(), T.getGSub()], ['growth', 'existing'], 'a stored Census tab'); }
  // A stored 2021 existing pick: Pipeline at a plant, a block, a development and a selection; back at Peel, 2021 existing.
  let cur = null, dev = null;
  const T = loadTabsAt({ footTab4: 'growth', gSub: 'existing' }, { PeelSvcScope: { current: () => cur, peelWideNote: () => {} }, DevScope: { current: () => dev } });
  assert.equal(T.getGSub(), 'existing');
  for (const [c, d, what] of [[{ kind: 'plant' }, null, 'a plant'], [{ kind: 'block' }, null, 'a block'], [null, { key: 'k' }, 'a development'], [{ kind: 'result', rkind: 'sel' }, null, 'a selection']]) {
    cur = c; dev = d; T.rescope();
    assert.equal(T.getGSub(), 'pipeline', what);
    cur = null; dev = null; T.rescope();
    assert.equal(T.getGSub(), 'existing', `back at Peel from ${what}`);
  }
  // (share.js: gs goes through migrateTabKey, the link written at the view says gs=existing)
  assert.match(src('js/share.js'), /t === 'growth' \? q\.get\('gs'\)/);
});

test('the renderer runs under the new view only; the census pane is 2021 existing’s, the plan tables Areas’', () => {
  const g = src('js/growth-ui.js');
  assert.ok(g.includes("run('growth:census', 'existing', () => CV().renderGrowthCensus());"));
  assert.ok(g.includes("run('growth:plans', 'areas',"));
  assert.doesNotMatch(g, /run\('growth:census', 'areas'/);
  assert.ok(HTML.includes('id="pane-growth-byplan" data-pane="growth" data-sub="areas"'));
  assert.ok(HTML.includes('id="pane-growth-census" data-pane="growth" data-sub="existing"'));
  assert.ok(HTML.indexOf('id="pane-growth-census"') > HTML.indexOf('id="pane-growth-ledger"'), 'the panes follow the chips’ order');
  const cv = src('js/census-view.js');
  assert.match(cv, /A\.hiddenAt\(A\.scopeKind\(\), 'growth', 'existing'\)/);
  assert.match(cv, /if \(shows && root\.PeelPanel\) root\.PeelPanel\.set\('growth:existing', spec\);/, 'set only where the view shows: never over the area’s panel');
  assert.doesNotMatch(cv, /dataset\.off|refreshFootTab/);
});

// Fixed inputs: Peel at 1,000,000 people / 350,000 dwellings in 2021, three layers of growth, two forecast rows, two
// housing rows.
const BASE = { population: 1000000, dwellings: 350000, das: 1650 };
const GR = { built: { population: 60000, units: 20000, jobs: 3000, estimatedDates: true }, approved: { population: 90000, units: 30000, jobs: 5000 }, proposed: { population: 150000, units: 52000, jobs: 0 } };
const FC = [{ m: 'Mississauga', fp: 200000, p: [20000, 30000, 50000] }, { m: 'Peel', fp: 600000, p: [60000, 90000, 150000] }];
const HS = { y: 2025, rows: [{ m: 'Mississauga', starts: 3000, completions: 2500, permits: 2800 }, { m: 'Peel', starts: 9000, completions: 7000, permits: 8000 }] };
const O = { name: 'Peel Region', Y: 2021, why: 'all years: the latest census (2021)', base: BASE, gr: GR, da: null, share: false, asof: '2026-10-31', censusDay: 'May 11, 2021', fc: FC, housing: HS, outlook: '<section class="ov-card ov-outlook">x</section>' };
const CARDS = ['2021 Census', '+ Built since (estimate today)', '+ Committed, not yet built', '+ Not committed yet: full build-out of applications'];

test('its panel (pure): the headline, the four cards, the chart, the 2051 forecast and housing activity, the outlook; no footer action of its own', () => {
  const CV = loadCV(), s = CV.existingPanelSpec(O);
  assert.equal(s.head.name, SE.ASK['growth:existing']);
  assert.equal(s.head.trail[s.head.trail.length - 1].label, 'Growth › 2021 existing');
  assert.equal(s.head.identity, 'Peel Region · 2021 Census baseline');
  assert.match(s.answer, /^Since the 2021 Census, Peel Region has added <strong>≈[\d,]+ people<\/strong> in [\d,]+ dwellings; <strong>[\d,]+ more people<\/strong> are committed or not committed yet/);
  assert.deepEqual(plain(s.figures.map(f => f.label)), CARDS);
  for (const f of s.figures) { assert.equal(f.u, 'people'); assert.deepEqual(plain(f.attrs), { 'data-full-table': 'growth' }); }
  assert.deepEqual(plain(s.figures.map(f => f.v)), ['1,000,000', '1,060,000', '1,150,000', '1,300,000'], 'the census, then each layer on top');
  assert.match(s.figures[1].ctx, /^370,000 dwellings · \+20,000 units \(\+5\.7%\) · \+3,000 jobs$/);
  assert.match(s.figures[0].ctx, /1,650 dissemination areas/);
  assert.ok(s.chart.includes('class="growth-chart"') && !s.chart.includes('id="gc-chart"'), 'a class: the pane’s #gc-chart is in the DOM too');
  assert.deepEqual(plain(s.lists.map(l => l.title)), ['Against the 2051 forecast', 'Housing activity, 2025']);
  for (const l of s.lists) assert.ok(l.seeAll && l.seeAll['data-full-table'] === 'growth' && l.seeAll['data-ft-go'], l.title);
  assert.match(s.lists[0].rows[1].html, /<span>Peel<\/span><span>300,000 of 600,000 people \(50%\) · 300,000 still to plan for<\/span>/, 'Peel last');
  assert.match(s.lists[1].rows[0].html, /3,000 starts · 2,500 completions · 2,800 permit units/);
  assert.deepEqual(plain(s.folds.map(f => f.title)), ['Population outlook']);
  assert.equal(s.foot, undefined, 'no footer action of its own');
  assert.match(s.method, /^2021 Census baseline \(all years: the latest census \(2021\)\) · built = permits completed since census day \(May 11, 2021\); Brampton and Caledon completion dates estimated/);
  assert.match(s.sources, /Statistics Canada 2021 Census/);
  assert.match(s.fullTitle, /^Growth › 2021 existing · Peel Region: /);
  assert.deepEqual(plain(PN.sectionsOf(PN.html({ key: 'growth:existing', ...s }))), ['header', 'scenario', 'answer', 'figures', 'chart', 'list', 'list', 'fold', 'method', 'sources', 'footer']);
  // The census year the view uses, named: the chip stays "2021 existing".
  const s16 = CV.existingPanelSpec({ ...O, Y: 2016, why: 'timeline starts 2018' });
  assert.equal(s16.figures[0].label, '2016 Census');
  assert.ok(s16.head.identity.includes('2016 Census baseline (timeline starts 2018)'));
  assert.match(s16.answer, /^Since the 2016 Census, /);
  // A DA (a file's record sheet, where Growth is not shown): no forecast or housing lists, no outlook.
  const sd = CV.existingPanelSpec({ ...O, name: 'DA 3521 (Brampton), around X', base: { population: 800, dwellings: 300, das: 1 }, da: { id: '3521' } });
  assert.equal(sd.lists.filter(l => l.rows.length).length, 0);
  assert.equal(sd.folds.length, 0);
  assert.ok(sd.figures[0].label.includes('DA'));
  // Names from data are escaped (PeelPanel.kv writes its label as given).
  assert.ok(CV.existingPanelSpec({ ...O, fc: [{ m: '<b>x</b>', fp: 1, p: [0, 0, 0] }] }).lists[0].rows[0].html.includes('&lt;b&gt;x&lt;/b&gt;'));
  // A plan or MTSA filter: the census shared by land area.
  assert.match(CV.existingPanelSpec({ ...O, share: true }).figures[0].ctx, /, share by land area$/);
});

test('the chart (pure): people, dwellings and jobs, the census first; renderGrowthChart writes it where it is told', () => {
  const CV = loadCV(), h = CV.growthChartHTML(BASE, GR, 2021);
  assert.equal((h.match(/class="grow-row"/g) || []).length, 3);
  assert.deepEqual([...h.matchAll(/<div class="grow-label">(\w+)<\/div>/g)].map(m => m[1]), ['People', 'Dwellings', 'Jobs']);
  assert.match(h, /<ul class="grow-legend"><li><i class="gsw g-base" aria-hidden="true"><\/i><span>2021 Census<\/span>/);
  assert.match(h, /<div class="grow-tip" hidden><\/div>$/);
  const el = { innerHTML: '' };
  CV.renderGrowthChart(BASE, GR, 2021, el);
  assert.equal(el.innerHTML, h);
  // (Pipeline's copy: no census baseline, its own "built" label)
  const el2 = { innerHTML: '' };
  CV.renderGrowthChart({ population: 0, dwellings: 0 }, GR, 2021, el2, { builtLabel: 'Completed since 2021 on the developments shown' });
  assert.ok(el2.innerHTML.includes('Completed since 2021 on the developments shown') && !el2.innerHTML.includes('g-base'));
  // (the pane's table and the panel's list read the one copy of the forecast sums)
  assert.match(src('js/census-view.js'), /function forecastTableHTML\(bc\) \{\n    const rows = forecastRows\(bc\); if \(!rows\) return '';/);
});

test('links: Pipeline’s chart, the targets guide, Areas’ panel and its How? files', () => {
  const g = src('js/growth-ui.js');
  assert.ok(g.includes('not every permit: see Growth › 2021 existing'));
  assert.ok(!g.includes('see Growth › Areas'));
  const t = R.targets(JSON.parse(src('data/housing.json')), JSON.parse(src('data/peel-reports.json')).forecast2051, null);
  assert.deepEqual(plain(t.actions[0]), { label: 'Growth › 2021 existing', attrs: { 'data-ws-page': 'home', 'data-ws-at': 'growth:existing' }, primary: true });
  assert.equal(t.actions[1].label, 'Growth › Areas');
  assert.deepEqual(plain(t.actions[1].attrs), { 'data-ws-page': 'growth' });
  // Areas' panel: the plan areas only; its words point to 2021 existing for the rest; the targets still read the
  // Region's 2051 allocation (the Land Needs Assessment).
  const pt = src('js/plan-tables.js'), i = pt.indexOf('function panelSpec(r)'), spec = pt.slice(i, pt.indexOf('// ----', i));
  const POINTER = 'The census and the growth since it, the applications against the 2051 forecast, housing activity and the population outlook are Growth › 2021 existing.';
  assert.ok(spec.includes(POINTER));
  assert.doesNotMatch(spec.replace(POINTER, ''), /2051 comparison|housing activity|population outlook/i);
  assert.match(spec, /sources: '[^']*Land Needs Assessment/);
  assert.match(spec, /method: `[^`]*the Region's 2051 allocation/);
  assert.ok(H.filesFor('growth:existing').includes('peel-reports.json') && H.filesFor('growth:existing').includes('das-2016.json'));
});

test('the phone: Home’s four views without a swipe; the chart’s tooltip wraps at the 220 px it is placed for', () => {
  const css = src('css/app.css');
  assert.ok(css.includes('@media (max-width: 700px) { .page-subsecs .page-sec { padding-left: var(--space-2); padding-right: var(--space-2); } }'));
  assert.match(css, /\.grow-tip \{[^}]*white-space: normal;[^}]*max-width: 220px;/);
  assert.doesNotMatch(css, /\.grow-tip \{[^}]*nowrap/);
  const cv = src('js/census-view.js');
  assert.equal((cv.match(/Math\.min\(box\.width - 220,/g) || []).length, 2, 'both tooltips placed for a 220 px box');
});

test('the baseline words follow the code: with all years, the latest census', () => {
  const cv = src('js/census-view.js'), mc = src('js/map-census.js');
  for (const [f, s] of [['js/census-view.js', cv], ['js/map-census.js', mc]]) assert.ok(!s.includes('all years: earliest'), f);
  assert.match(cv, /`all years: the latest census \(\$\{Y\}\)`/);
  assert.match(mc, /With all years, the latest; before the\n {2}\/\/ earliest census with data, the earliest\./);
  assert.match(mc, /if \(!App\(\)\.timeActive\(\) \|\| App\(\)\.state\.yearFrom == null\) return cs\[0\];/);
  // (its own name: no "Census & 2051" or "part of Growth › Areas" left in the module)
  assert.doesNotMatch(cv, /Census & 2051|part of Growth › Areas/);
});

// The words (plan g21 S8–S9): Help, the tour, Growth's ⓘ and the docs name the four views and say where the census
// block is now; the guide's baseline rule and tile names are the app's.
test('words: the tour, Growth’s ⓘ, What moved where and the docs name 2021 existing', () => {
  const tips = src('js/tips.js');
  const tabs = tips.match(/t: 'Tabs', b: '((?:[^'\\]|\\.)*)'/)[1];
  assert.ok(tabs.includes('Growth for the pipeline, the areas, the forecast and 2021 existing (the census and the growth since)'), 'the tour’s Tabs step');
  const ctx = { window: {}, self: {} }; ctx.globalThis = ctx;
  vm.runInNewContext(src('js/info.js'), ctx);
  const g = (ctx.window.PeelInfo || ctx.PeelInfo).INFO['tab-growth'].body;
  assert.ok(g.startsWith('Four views. '), 'Growth’s ⓘ');
  assert.ok(g.includes('2021 existing: the 2021 Census (2016 when the timeline starts before 2021)'));
  assert.ok(g.includes('then the plans against their targets and the plans by plant or pressure zone. Forecast:'), 'Areas: the plan areas only');
  assert.ok(g.endsWith('At a servicing scope or a drawn area: Pipeline · Forecast.'));
  const MOVED = new Function(`${tips.match(/const MOVED = \[[\s\S]*?\n {2}\];/)[0]}; return MOVED;`)();
  const now = old => MOVED.flatMap(x => x.rows).find(r => r[0].includes(old))[1];
  assert.ok(now('The area pages:').includes('Growth › Pipeline · Areas · Forecast · 2021 existing'), 'Home’s tabs row');
  assert.equal(now('Growth › Census & 2051'), 'Growth › 2021 existing.');
  assert.equal(now('Growth › By plan'), 'Growth › Areas.');
  // The docs: where the block is now, the baseline rule as js/map-census.js has it, the cards' own names.
  const guide = src('docs/guide/README.md'), method = src('docs/method/README.md'), data = src('docs/data/README.md');
  assert.match(guide, /an earlier start also uses 2016; All years\nuses the latest, 2021\./);
  assert.ok(!guide.includes('(or All years) also uses'));
  assert.ok(guide.includes('**Growth since the census (Growth › 2021 existing):**'));
  for (const c of CARDS.slice(2)) assert.ok(guide.includes(`\n| ${c} | `), `the guide’s tile "${c}"`);
  assert.doesNotMatch(guide, /Approved or permitted, not yet built|\+ Proposed \(full build-out\)/);
  assert.ok(guide.includes('**Applications against the 2051 forecast** (Growth › 2021 existing, below the growth chart)'));
  assert.ok(guide.includes('| Growth › 2021 existing | The map\'s panel (`js/census-view.js` `existingPanelSpec`)'));
  assert.ok(guide.includes('| Area (`area`) | Pipeline · Areas · Forecast · 2021 existing |'));
  assert.ok(guide.includes('\n## Growth › 2021 existing (owner, 2026-11-03)\n'));
  assert.ok(method.includes('since 2021 in Growth › 2021 existing.'));
  assert.ok(data.includes('**Housing activity** (Growth › 2021 existing)') && data.includes('**Population outlook** card in Growth › 2021 existing'));
  for (const [f, s] of [['docs/guide/README.md', guide], ['docs/method/README.md', method], ['docs/data/README.md', data]]) {
    assert.doesNotMatch(s, /Housing activity\*\* \(Growth › Areas\)|Population outlook\*\* card in Growth › Areas|Growth since the census \(Growth › Areas\)|in Growth › Areas' full table \(the census view\)/, f);
  }
});
